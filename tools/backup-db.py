#!/usr/bin/env python3
"""운영 DB·Storage 백업 → 7-Zip AES-256 한 파일 (2026-10-12)

왜: Supabase Pro 의 자동 백업은 **7일**뿐이고, **프로젝트 통째로만** 되돌린다(표 하나를 살릴 수 없다).
    그리고 **Storage 파일(새가족 카드·게시판 사진)은 자동 백업에 들어가지 않는다** — 지금 유일본이다.
    교인명부(종교 = 개인정보보호법의 민감정보)가 들어 있으므로 **암호화한 채로만** 디스크에 남긴다.

쓰는 법:
    python tools/backup-db.py --prod                 # 운영 → C:\\Projects\\백업\\gocheok-prod-YYYY-MM-DD-HHMM.7z
    python tools/backup-db.py --prod --with-photos   # + 교인 사진 버킷(크다 · 원본은 dimode·교인명부_작업에도 있다)
    python tools/backup-db.py --dev                  # 개발(가짜 데이터) — 흐름 시험용

준비(한 번):
    1. 7-Zip 설치(C:\\Program Files\\7-Zip\\7z.exe) · PostgreSQL 클라이언트(pg_dump — C:\\Program Files\\PostgreSQL\\NN\\bin)
    2. 암호 파일 ~/.gocheok-backup/pass — 첫 줄이 암호. ⚠️ 저장소·대화·스크립트 어디에도 적지 않는다.
       암호를 잃으면 백업도 함께 잃는다 — 두 사람이 알고 있을 것.
    3. Supabase CLI 로그인(이미 돼 있다). DB 비밀번호는 필요 없다 — CLI 가 그때그때 임시 로그인 역할을 만든다.

무엇이 들어가나: roles.sql · schema.sql · data.sql(auth·public·storage 메타) · cron-jobs.json(운영만) · storage/<버킷>/ · manifest.txt
되살리는 법: docs/notes/backup.md

⚠️ 암호가 든 7z 만 남기고 평문 폴더는 지운다. 평문을 남겨야 하면(디버그) --keep-plain — 그때도 저장소 밖에만.
⚠️ CLI 가 만든 덤프 스크립트에는 임시 비밀번호가 들어 있다 — 보관 폴더가 아니라 임시 폴더에 쓰고 바로 지운다.
"""
from __future__ import annotations

import argparse
import datetime as dt
import glob
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

PROJECTS = {"prod": "xnomlgydifiqiybervtf", "dev": "ktpwthwqzgcqcrmsafdo"}
BUCKETS = ["newfamily", "board", "verse-img"]          # Storage 유일본(자동 백업에 없다)
PHOTO_BUCKET = "church-people-photos"                  # 크다 — 원본이 따로 있어 --with-photos 일 때만
HOME = Path.home() / ".gocheok-backup"
SEVEN_ZIP = Path(r"C:\Program Files\7-Zip\7z.exe")


def die(msg: str) -> None:
    print(f"\n✗ {msg}", file=sys.stderr)
    sys.exit(1)


def find_pg_bin() -> Path:
    cands = sorted(glob.glob(r"C:\Program Files\PostgreSQL\*\bin\pg_dump.exe"),
                   key=lambda p: int(re.search(r"PostgreSQL\\(\d+)", p).group(1)))
    if cands:
        return Path(cands[-1]).parent
    w = shutil.which("pg_dump")
    if w:
        return Path(w).parent
    die("pg_dump 를 못 찾았다 — PostgreSQL 클라이언트를 설치할 것")


def run(cmd: list[str], cwd: Path | None = None, **kw) -> subprocess.CompletedProcess:
    # 윈도에서는 supabase 가 .cmd·.exe 껍데기라 이름만으로는 못 찾는다 — 전체 경로로 바꿔 부른다.
    if cmd and cmd[0] == "supabase":
        exe = shutil.which("supabase")
        if not exe:
            die("supabase CLI 를 못 찾았다")
        cmd = [exe, *cmd[1:]]
    return subprocess.run(cmd, cwd=cwd, **kw)


def ensure_link(env: str) -> Path:
    """저장소 밖 작업 폴더를 그 프로젝트에 link 한다.
    ⚠️ supabase/.temp 를 복사해 쓰지 않는다 — 세션마다 가리키는 곳이 바뀐다(메모리 「Supabase CLI」)."""
    wd = HOME / f"supa-{env}"
    ref_file = wd / "supabase" / ".temp" / "project-ref"
    if ref_file.exists() and ref_file.read_text().strip() == PROJECTS[env]:
        return wd
    wd.mkdir(parents=True, exist_ok=True)
    r = run(["supabase", "link", "--project-ref", PROJECTS[env]], cwd=wd, capture_output=True, text=True)
    if r.returncode != 0 or ref_file.read_text().strip() != PROJECTS[env]:
        die(f"supabase link 실패: {r.stderr[-400:]}")
    return wd


def dump(wd: Path, flags: list[str], out: Path, env_vars: dict, tmp: Path) -> str:
    """CLI 가 만든 pg_dump 스크립트(--dry-run)를 이 PC 의 pg_dump 로 돌린다 — Docker 가 꺼져 있어도 된다."""
    r = run(["supabase", "db", "dump", "--linked", "--dry-run", *flags], cwd=wd, capture_output=True, text=True)
    if r.returncode != 0 or "pg_dump" not in r.stdout:
        die(f"덤프 스크립트를 못 받았다({' '.join(flags) or 'schema'}): {r.stderr[-400:]}")
    # 윈도 pg_dump 는 줄인 옵션 이름(--quote-all-identifier)을 못 알아듣는다 — 온전한 이름으로.
    script = r.stdout.replace("--quote-all-identifier ", "--quote-all-identifiers ")
    sh = tmp / "dump.sh"
    sh.write_text(script, encoding="utf-8", newline="\n")
    try:
        with open(out, "wb") as f:
            p = run([shutil.which("bash") or "bash", str(sh)], stdout=f, stderr=subprocess.PIPE, env=env_vars)
    finally:
        sh.unlink(missing_ok=True)      # 임시 비밀번호가 든 스크립트 — 바로 지운다
    err = p.stderr.decode("utf-8", "replace")
    if p.returncode != 0:
        die(f"pg_dump 실패({out.name}): {err[-600:]}")
    return err


def count_copy_rows(data_sql: Path) -> dict[str, int]:
    counts: dict[str, int] = {}
    cur = None
    with open(data_sql, "rb") as f:
        for line in f:
            if cur is None:
                m = re.match(rb'^COPY "([^"]+)"\."([^"]+)"', line)
                if m:
                    cur = f"{m.group(1).decode()}.{m.group(2).decode()}"
                    counts[cur] = 0
            elif line.rstrip(b"\r\n") == b"\\.":
                cur = None
            else:
                counts[cur] += 1
    return counts


def main() -> None:
    ap = argparse.ArgumentParser(description="운영 DB·Storage 를 암호화해 백업한다")
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--prod", action="store_true")
    g.add_argument("--dev", action="store_true")
    ap.add_argument("--with-photos", action="store_true", help=f"{PHOTO_BUCKET} 버킷도")
    ap.add_argument("--out", default=r"C:\Projects\백업", help="7z 를 둘 폴더(저장소 밖)")
    ap.add_argument("--pass-file", default=str(HOME / "pass"))
    ap.add_argument("--keep-plain", action="store_true", help="평문 폴더를 지우지 않는다(디버그)")
    a = ap.parse_args()
    env = "prod" if a.prod else "dev"

    if not SEVEN_ZIP.exists():
        die(f"7-Zip 이 없다: {SEVEN_ZIP}")
    pf = Path(a.pass_file).expanduser()
    if not pf.exists() and pf.with_name(pf.name + ".txt").exists():
        die(f"암호 파일이 {pf.name}.txt 로 저장됐다 — 메모장이 .txt 를 붙인 것. 이름을 「{pf.name}」 로 바꿀 것")
    # utf-8-sig — 메모장은 UTF-8 앞에 BOM 을 붙인다. 그대로 읽으면 보이지 않는 글자가 암호 앞에 붙어
    #   다른 PC 의 7-Zip 에 같은 암호를 쳐도 안 열린다.
    if not pf.exists() or not pf.read_text(encoding="utf-8-sig").strip():
        die(f"암호 파일이 없다: {pf}\n  첫 줄에 암호만 적어 둘 것(저장소 밖 · 비밀번호 관리자에도 함께)")
    password = pf.read_text(encoding="utf-8-sig").splitlines()[0].strip()

    out_dir = Path(a.out)
    repo = Path(__file__).resolve().parent.parent
    if repo in out_dir.resolve().parents or out_dir.resolve() == repo:
        die("보관 폴더가 저장소 안이다 — 저장소는 공개다. 저장소 밖으로")
    out_dir.mkdir(parents=True, exist_ok=True)

    stamp = dt.datetime.now().strftime("%Y-%m-%d-%H%M")
    name = f"gocheok-{env}-{stamp}"
    stage = out_dir / f".tmp-{name}"
    stage.mkdir()
    tmp = Path(tempfile.mkdtemp(prefix="gocheok-backup-"))
    print(f"■ {'운영' if env == 'prod' else '개발'} {PROJECTS[env]} → {out_dir / (name + '.7z')}")

    try:
        wd = ensure_link(env)
        pg_bin = find_pg_bin()
        # LC_ALL=C — 윈도 pg_dump 의 한국어 메시지는 CP949 로 나와 목록(manifest)에서 깨진다. 영어로 받는다.
        env_vars = dict(os.environ, PATH=f"{pg_bin}{os.pathsep}{os.environ.get('PATH', '')}", LC_ALL="C", LANG="C")

        # 1) DB — 역할 · 구조 · 데이터(Supabase 안내의 세 덩어리)
        notes = []
        for label, flags in [("roles", ["--role-only"]), ("schema", []), ("data", ["--data-only", "--use-copy"])]:
            err = dump(wd, flags, stage / f"{label}.sql", env_vars, tmp)
            if err.strip():
                notes.append(f"[{label}] {err.strip()[:400]}")
            print(f"  ✓ {label}.sql {(stage / f'{label}.sql').stat().st_size:,} B")
        rows = count_copy_rows(stage / "data.sql")

        # 2) 크론 일정(운영만 — 개발엔 pg_cron 이 없다). 명령 본문까지 남겨야 다시 걸 수 있다.
        r = run(["supabase", "db", "query", "--linked",
                 "select jobid, jobname, schedule, command, active from cron.job order by jobid"],
                cwd=wd, capture_output=True, text=True, encoding="utf-8")
        if r.returncode == 0 and '"_tag":"Error"' not in r.stdout:
            (stage / "cron-jobs.json").write_text(r.stdout, encoding="utf-8")
            print("  ✓ cron-jobs.json")
        else:
            notes.append("[cron] 없음(개발이면 정상)")

        # 3) Storage — 자동 백업에 없는 파일들
        buckets = BUCKETS + ([PHOTO_BUCKET] if a.with_photos else [])
        files = {}
        for b in buckets:
            dst = stage / "storage" / b
            dst.mkdir(parents=True, exist_ok=True)
            # ⚠️ 받을 곳을 「C:\…」 절대 경로로 주면 CLI 가 「C:」 를 주소 꼴로 읽어 거절한다 — 상대 경로로 주고
            #    link 폴더는 --workdir 로 따로 알려 준다.
            r = run(["supabase", "storage", "cp", "-r", f"ss:///{b}", f"storage/{b}", "--experimental", "--linked",
                     "--workdir", str(wd)],
                    cwd=stage, capture_output=True, text=True, encoding="utf-8")
            n = sum(1 for p in dst.rglob("*") if p.is_file())
            if r.returncode != 0 and n == 0 and "not found" not in (r.stdout + r.stderr).lower():
                die(f"Storage {b} 받기 실패: {(r.stdout + r.stderr)[-400:]}")
            files[b] = n
            print(f"  ✓ storage/{b} {n} 개")

        # 4) 목록 — 되살릴 때 「다 왔나」를 견줄 기준
        key = ["public.users", "public.challenge_log", "public.daily_activity", "public.church_people",
               "public.ministry_history", "public.ministry_orders", "public.nf_people", "public.duty_signups",
               "public.edu_enrollments", "public.board_posts", "auth.users"]
        man = [f"백업 {stamp} · {env} · {PROJECTS[env]}",
               f"pg_dump {run([str(pg_bin / 'pg_dump.exe'), '--version'], capture_output=True, text=True).stdout.strip()}",
               "", "■ 주요 표 행 수"]
        man += [f"  {t}: {rows.get(t, '없음')}" for t in key]
        man += ["", f"■ 전체 표 {len(rows)}개 · 행 {sum(rows.values()):,}", "", "■ Storage"]
        man += [f"  {b}: {n} 개" for b, n in files.items()]
        if notes:
            man += ["", "■ 참고"] + [f"  {x}" for x in notes]
        (stage / "manifest.txt").write_text("\n".join(man) + "\n", encoding="utf-8")

        # 5) 암호화 — 파일 이름까지 숨긴다(-mhe=on). 암호는 화면·로그에 찍지 않는다.
        arc = out_dir / f"{name}.7z"
        r = run([str(SEVEN_ZIP), "a", "-t7z", "-mx=7", "-mhe=on", f"-p{password}", str(arc), "."],
                cwd=stage, capture_output=True, text=True)
        if r.returncode != 0:
            die(f"7-Zip 묶기 실패: {r.stdout[-400:]}")
        r = run([str(SEVEN_ZIP), "t", f"-p{password}", str(arc)], capture_output=True, text=True)
        if r.returncode != 0 or "Everything is Ok" not in r.stdout:
            arc.unlink(missing_ok=True)
            die("7-Zip 검사 실패 — 만든 파일을 지웠다")
        print(f"  ✓ 암호화·검사 {arc.stat().st_size:,} B")
        print("\n" + "\n".join(man))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
        if not a.keep_plain:
            shutil.rmtree(stage, ignore_errors=True)   # 평문은 남기지 않는다
        else:
            print(f"\n⚠️ 평문 폴더를 남겼다: {stage} — 확인 뒤 꼭 지울 것")

    print(f"\n완료: {arc}\n→ 다른 곳(외장 디스크·교회 드라이브)으로 옮긴 뒤, 이 PC 의 파일은 몇 개만 남기고 지워도 된다.")


if __name__ == "__main__":
    main()
