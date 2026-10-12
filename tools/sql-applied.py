# -*- coding: utf-8 -*-
"""SQL 적용 기록 — 「이 SQL 파일의 이 판을 이 DB 에 넣었나」를 남기고 본다(2026-10-12).

    python tools/sql-applied.py record supabase/duty.sql --dev            개발에 넣은 뒤 한 줄
    python tools/sql-applied.py record supabase/duty.sql --prod --note "봉사 당번 4단계"
    python tools/sql-applied.py status --dev                              supabase/*.sql 각각: 같음 / 바뀜 / 기록 없음
    python tools/sql-applied.py status --prod

왜: SQL 은 손으로 붓는다. 여러 세션이 병렬로 일하면 「개발에만 넣었다」·「옛 판을 넣었다」·「바꾼 뒤 다시 안 넣었다」가
    조용히 생기고, 그 어긋남은 오류가 아니라 숫자·화면이 달라지는 식으로 드러난다.
    그래서 넣은 뒤 파일 이름 + 내용 지문(sha256)을 그 DB 의 public.schema_applied 에 남긴다.

⚠️ record 는 SQL 을 **돌리지 않는다** — 돌린 뒤 「돌렸다」고 적기만 한다. (돌리는 것은 지금처럼 사람이 — 개발 먼저.)
⚠️ 기본은 개발이다(모르면 개발 — js/config.js 와 같은 원칙). 운영은 --prod 를 손으로 준다.
CLI(`supabase db query --linked`)는 **저장소 밖 link 폴더**에서 부른다 — 저장소의 supabase/.temp 는 세션마다
가리키는 곳이 바뀌므로 쓰지 않는다. 운영 ~/.gocheok-backup/supa-prod · 개발 ~/.gocheok-backup/supa-dev
(tools/backup-db.py 와 같은 폴더 — 없으면 만들어 link 한다).

지문은 줄 끝을 LF 로 맞추고 맨 앞 BOM 을 뗀 내용으로 셈한다 — 윈도(CRLF)·맥(LF) 체크아웃이 같은 판을 같다고 보게.
표준 라이브러리 + supabase CLI 만 쓴다. 쓰는 법·까닭: docs/notes/sql-applied.md
"""
import argparse, glob, hashlib, json, os, re, shutil, subprocess, sys, tempfile
from pathlib import Path

try: sys.stdout.reconfigure(encoding="utf-8")
except Exception: pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROJECTS = {"dev": ("ktpwthwqzgcqcrmsafdo", "개발"), "prod": ("xnomlgydifiqiybervtf", "운영")}
LINK_HOME = Path.home() / ".gocheok-backup"
TABLE = "public.schema_applied"


# ── 순수 함수 ─────────────────────────────────────────────────────────
def sha_of(data: bytes) -> str:
    text = data.decode("utf-8", "replace").lstrip("﻿").replace("\r\n", "\n")
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def judge(files, records):
    """files {경로: 지문} · records [{file, sha256, applied_at, applied_by}] → [(판정, 경로, 덧붙임)].
    같음 = 지금 파일의 지문이 기록에 있다 · 바뀜 = 그 파일의 기록은 있으나 지금 지문은 없다 · 기록 없음.
    기록에만 있고 파일이 없는 것은 「파일 없음」."""
    by = {}
    for r in records:
        by.setdefault(r["file"], []).append(r)
    out = []
    for f in sorted(files):
        rs = sorted(by.get(f, []), key=lambda r: r.get("applied_at") or "")
        hit = [r for r in rs if r["sha256"] == files[f]]
        if hit:
            out.append(("같음", f, when(hit[-1])))
        elif rs:
            out.append(("바뀜", f, "마지막 기록 %s — 그 뒤 파일이 바뀌었다(다시 넣었나?)" % when(rs[-1])))
        else:
            out.append(("기록 없음", f, ""))
    for f in sorted(set(by) - set(files)):
        out.append(("파일 없음", f, "기록만 있다 %s" % when(sorted(by[f], key=lambda r: r.get("applied_at") or "")[-1])))
    order = {"바뀜": 0, "파일 없음": 1, "같음": 2, "기록 없음": 3}
    return sorted(out, key=lambda x: (order[x[0]], x[1]))


def when(r):
    t = (r.get("applied_at") or "")[:16].replace("T", " ")
    who = r.get("applied_by") or ""
    return "%s KST%s" % (t, " · " + who if who else "")      # status 가 KST 로 읽어 온다


def sql_str(s):
    return "null" if s is None else "'" + str(s).replace("'", "''") + "'"


# ── 바깥 ─────────────────────────────────────────────────────────────
def die(msg):
    print("✗ " + msg)
    sys.exit(1)


def run(cmd, cwd=ROOT, timeout=180):
    exe = shutil.which(cmd[0])
    if not exe:
        die("%s 를 찾지 못했다" % cmd[0])
    r = subprocess.run([exe] + cmd[1:], cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout)
    return r.returncode, r.stdout.decode("utf-8", "replace"), r.stderr.decode("utf-8", "replace")


def link_dir(env):
    """저장소 밖 link 폴더. 다른 프로젝트를 가리키면 멈춘다(다시 link 하지 않는다 — 누가 왜 바꿨는지 모르므로)."""
    ref = PROJECTS[env][0]
    wd = LINK_HOME / ("supa-" + env)
    ref_file = wd / "supabase" / ".temp" / "project-ref"
    if ref_file.exists():
        cur = ref_file.read_text().strip()
        if cur != ref:
            die("%s 가 %s 를 가리킨다(기대 %s) — 손으로 확인할 것" % (wd, cur, ref))
        return wd
    wd.mkdir(parents=True, exist_ok=True)
    rc, _, err = run(["supabase", "link", "--project-ref", ref], cwd=str(wd))
    if rc != 0 or not ref_file.exists() or ref_file.read_text().strip() != ref:
        die("supabase link 실패: %s" % err.strip()[-300:])
    return wd


def query(env, sql):
    """→ 행 목록. 오류면 RuntimeError(첫 줄만). SQL 은 임시 파일로 넘긴다(명령줄 한글이 깨지는 일을 피한다)."""
    wd = link_dir(env)
    fd, path = tempfile.mkstemp(suffix=".sql", prefix="sql-applied-")
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as f:
            f.write(sql)
        rc, out, err = run(["supabase", "db", "query", "--linked", "--agent", "no", "-o", "json", "--file", path], cwd=str(wd))
    finally:
        os.unlink(path)
    if rc != 0:
        msg = re.sub(r"\x1b\[[0-9;]*m", "", err or out)
        j = re.search(r"\{\"message\".*\}", msg)          # CLI 는 서버의 JSON 을 그대로 찍는다 — 풀어서 읽는다
        if j:
            try: msg = json.loads(j.group(0)).get("message", msg)
            except ValueError: pass
        m = re.search(r"ERROR:\s*(?:[0-9A-Z]{5}:\s*)?([^\n]+)", msg)
        raise RuntimeError(m.group(1).strip() if m else msg.strip()[-200:])
    out = out.strip()
    if not out:
        return []
    data = json.loads(out[out.index("["):] if "[" in out else "[]")
    return data.get("rows", []) if isinstance(data, dict) else data


def table_missing(e):
    return "does not exist" in str(e) and "schema_applied" in str(e)


def repo_rel(p):
    full = os.path.abspath(p)
    if not full.startswith(os.path.abspath(ROOT) + os.sep):
        die("%s 는 저장소 밖이다" % p)
    return os.path.relpath(full, ROOT).replace("\\", "/")


def git_out(*args):
    rc, out, _ = run(["git", *args])
    return out.strip() if rc == 0 else ""


# ── 명령 ─────────────────────────────────────────────────────────────
def cmd_record(a, env):
    ref, label = PROJECTS[env]
    who = git_out("config", "user.name") or os.environ.get("USERNAME") or os.environ.get("USER") or ""
    branch = git_out("branch", "--show-current") or "분리된HEAD"
    head = git_out("rev-parse", "--short", "HEAD")
    print("\n[SQL 적용 기록] %s(%s)%s" % (label, ref, "  ◀◀ 운영" if env == "prod" else ""))
    values = []
    for p in a.files:
        if not os.path.isfile(p):
            die("파일이 없다: %s" % p)
        rel = repo_rel(p)
        if not rel.endswith(".sql"):
            die("SQL 파일이 아니다: %s" % rel)
        with open(p, "rb") as f:
            sha = sha_of(f.read())
        # 가지·수정 상태를 적어 둔다 — 「main 에 없는 판을 넣었다」를 나중에 알아볼 수 있게(막지는 않는다)
        dirty = bool(git_out("status", "--porcelain", "--", rel))
        off_main = bool(git_out("diff", "--name-only", "origin/main", "--", rel))
        tag = "git %s@%s%s" % (branch, head, "+수정" if dirty else "")
        if dirty:
            print("  ⚠ %s — 커밋 안 된 변경이 있다(이 판은 저장소 어디에도 없다)" % rel)
        elif off_main:
            print("  ⚠ %s — origin/main 의 판과 다르다(가지 판을 넣었다)" % rel)
        note = ("%s · %s" % (a.note, tag)) if a.note else tag
        values.append("(%s, %s, now(), %s, %s)" % (sql_str(rel), sql_str(sha), sql_str(who), sql_str(note)))
        print("  %s  %s…" % (rel, sha[:12]))
    sql = ("insert into %s (file, sha256, applied_at, applied_by, note) values\n  %s\n"
           "on conflict (file, sha256) do update set applied_at = excluded.applied_at,\n"
           "  applied_by = excluded.applied_by, note = excluded.note\n"
           "returning file, (xmax <> 0) as again;" % (TABLE, ",\n  ".join(values)))
    try:
        rows = query(env, sql)
    except RuntimeError as e:
        if table_missing(e):
            die("%s에 %s 표가 없다 — 먼저 supabase/schema_applied.sql 을 돌리고 그것부터 record 할 것" % (label, TABLE))
        die("기록 실패: %s" % e)
    for r in rows:
        print("  ✓ %s %s" % (r.get("file"), "(같은 판을 다시 — 때를 오늘로 고쳤다)" if r.get("again") else "기록"))
    return 0


def cmd_status(a, env):
    ref, label = PROJECTS[env]
    files = {}
    for p in sorted(glob.glob(os.path.join(ROOT, "supabase", "*.sql"))):
        with open(p, "rb") as f:
            files[repo_rel(p)] = sha_of(f.read())
    try:
        recs = query(env, "select file, sha256, (applied_at at time zone 'Asia/Seoul')::text as applied_at, applied_by from %s;" % TABLE)
    except RuntimeError as e:
        if table_missing(e):
            die("%s에 %s 표가 없다 — supabase/schema_applied.sql 을 먼저(docs/notes/sql-applied.md)" % (label, TABLE))
        die("읽기 실패: %s" % e)
    rows = judge(files, recs)
    head = git_out("log", "-1", "--format=%h", "HEAD")
    print("\n[SQL 적용 현황] %s(%s) · 파일은 이 체크아웃(%s) 기준\n" % (label, ref, head))
    counts = {}
    for v, f, extra in rows:
        counts[v] = counts.get(v, 0) + 1
        if v == "기록 없음" and not a.all:
            continue
        print("  %s %s%s" % (v + " " * (10 - 2 * len(v) + v.count(" ")), f, ("  — " + extra) if extra else ""))
    if counts.get("기록 없음") and not a.all:
        print("  기록 없음 %d개는 숨겼다(--all 로 모두) — 시드·한 번 쓰고 버린 SQL 도 여기 든다" % counts["기록 없음"])
    print("\n  " + " · ".join("%s %d" % (k, counts[k]) for k in ("바뀜", "파일 없음", "같음", "기록 없음") if counts.get(k)))
    return 1 if counts.get("바뀜") else 0


def main():
    ap = argparse.ArgumentParser(description="SQL 적용 기록(public.schema_applied)")
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("record", help="넣은 SQL 파일을 기록한다(돌리지는 않는다)")
    r.add_argument("files", nargs="+")
    r.add_argument("--note", help="덧붙임(까닭·단계 등)")
    s = sub.add_parser("status", help="supabase/*.sql 각각 같음 / 바뀜 / 기록 없음")
    s.add_argument("--all", action="store_true", help="기록 없음까지 모두 찍는다")
    for p in (r, s):
        g = p.add_mutually_exclusive_group()
        g.add_argument("--dev", action="store_true", help="개발(기본)")
        g.add_argument("--prod", action="store_true", help="운영 — 손으로 줄 때만")
    a = ap.parse_args()
    env = "prod" if a.prod else "dev"
    return cmd_record(a, env) if a.cmd == "record" else cmd_status(a, env)


if __name__ == "__main__":
    sys.exit(main())
