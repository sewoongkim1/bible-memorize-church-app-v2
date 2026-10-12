# -*- coding: utf-8 -*-
"""Edge Function 배포 가드 — 남의 미완성 코드나 낡은 체크아웃이 운영으로 나가는 것을 막는다.

    python tools/deploy-fn.py api --dev                  개발(ktpwthwqzgcqcrmsafdo)
    python tools/deploy-fn.py api --dev --allow-ahead    개발 — main 에 아직 없는 내 가지를 시험할 때
    python tools/deploy-fn.py api --prod                 운영(xnomlgydifiqiybervtf)
    python tools/deploy-fn.py api --prod --dry-run       검사만 하고 배포 명령은 찍기만

왜 필요한가(실제로 난 사고):
  `supabase functions deploy` 는 git 이 아니라 **작업 트리의 파일을 통째로** 올린다.
  여러 세션이 같은 체크아웃에서 일하므로
    (1) 남의 **커밋 안 된** 코드가 내 배포에 실려 운영으로 나가고,
    (2) **낡은 체크아웃**에서 배포하면 남이 이미 main 에 넣은 액션(봉사 당번·교육 등)이
        운영에서 **오류 없이 조용히 사라진다**(가을 이벤트 perDay 가 조용히 1 로 돌아간 일도 있었다).
  그래서 배포 직전에 `git fetch origin` 을 하고, 올라갈 파일이 깨끗한지·origin/main 과 같은지를 본다.
  하나라도 걸리면 배포하지 않고 종료코드 1.

규칙: 개발 먼저 → localhost 확인 → 운영. `--no-verify-jwt` 는 이 스크립트가 늘 붙인다.
⚠️ 이 검사를 피하려고 `supabase functions deploy` 를 손으로 치지 말 것 — 걸렸다면 걸린 까닭을 고친다.

파이썬 표준 라이브러리만 쓴다(preflight.py 와 같은 결 — 준비물 없이 어디서나 돈다).
판단은 아래 순수 함수(`parse_porcelain`·`case_actions`·`relative_imports`·`judge`)에 모아 두었다 —
시험은 tests/deploy-fn-guard.py.
"""
import argparse, os, posixpath, re, shutil, subprocess, sys

try: sys.stdout.reconfigure(encoding="utf-8")
except Exception: pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FN_DIR = "supabase/functions"
MAIN = "origin/main"

PROJECTS = {
    "dev":  ("ktpwthwqzgcqcrmsafdo", "개발"),
    "prod": ("xnomlgydifiqiybervtf", "운영"),
}


# ── 순수 함수(시험 대상) ─────────────────────────────────────────────
def parse_porcelain(out):
    """`git status --porcelain=v1 -z` 출력 → [(상태 두 글자, 경로)]. 이름 바꾸기의 옛 경로는 버린다."""
    items, parts, i = [], out.split("\0"), 0
    while i < len(parts):
        p = parts[i]
        i += 1
        if len(p) < 4:
            continue
        st, path = p[:2], p[3:]
        if "R" in st or "C" in st:
            i += 1                              # -z 에서는 옛 경로가 다음 칸에 따로 온다
        items.append((st, path))
    return items


_CASE = re.compile(r'^\s*case\s+"([A-Za-z0-9_]+)"\s*:', re.M)

def case_actions(src):
    """index.ts 본문 → `case "이름":` 의 이름 집합(줄 머리의 것만 — 문자열 안의 「case」 는 안 센다)."""
    return set(_CASE.findall(src or ""))


_IMPORT = re.compile(r'''(?:\bfrom\s*|\bimport\s*\(?\s*)["'](\.{1,2}/[^"']+)["']''')

def relative_imports(src, file_path):
    """한 파일의 상대 import(./x.ts · ../_shared/y.ts) → 저장소 기준 경로 목록(posix)."""
    base = posixpath.dirname(file_path)
    return sorted({posixpath.normpath(posixpath.join(base, m)) for m in _IMPORT.findall(src or "")})


def judge(env, dirty, diff_files, behind, missing_actions, allow_ahead):
    """배포해도 되는가 → (ok, [(등급, 말)]). 등급은 "막음"·"경고"·"통과".

    env            "dev" | "prod"
    dirty          [(상태, 경로)] — 올라갈 경로 아래 커밋 안 된 변경·추적 안 된 파일
    diff_files     [경로] — 작업 트리와 origin/main 이 다른 파일(커밋은 됐어도 main 과 다른 것)
    behind         [커밋 한 줄] — origin/main 에는 있고 HEAD 에는 없는, 그 경로를 고친 커밋
    missing_actions [이름] — origin/main 의 index.ts 에는 있는데 로컬에는 없는 case 액션
    allow_ahead    --allow-ahead 를 줬나
    """
    msgs, ok = [], True

    # ① 커밋 안 된 것 — 개발이든 운영이든 막는다.
    #    deploy 는 작업 트리를 올리므로 그 변경이 내 것인지 남의 것인지 이 스크립트는 알 수 없다.
    #    내 것이면 가지에 커밋(WIP 커밋도 된다)한 뒤 다시 돌리면 된다 — 그 한 번이 남의 미완성 코드를 막는다.
    if dirty:
        ok = False
        lines = "\n".join("        %s  %s" % (st, p) for st, p in dirty)
        msgs.append(("막음", "커밋 안 된 변경·추적 안 된 파일이 있다 — deploy 는 작업 트리를 통째로 올리므로 "
                              "이것이 그대로 나간다(남의 미완성 코드일 수도 있다).\n%s\n"
                              "        → 내 것이면 가지에 커밋하고, 남의 것이면 그 세션이 끝낼 때까지 기다린다" % lines))

    # ② origin/main 이 이 경로에 넣은 커밋이 HEAD 에 없다 = 낡은 체크아웃.
    #    개발에서도 막는다 — 옛 판을 개발에 올리면 그 위에서 「내 것이 된다」를 확인해도
    #    운영(main 이 다 들어간 판)에서 같은 결과라는 보장이 없고, 개발 DB 를 쓰는 다른 세션의 액션도 지운다.
    #    --allow-ahead 로도 못 푼다 — 「앞섬」은 허용하지만 「뒤처짐」은 git merge origin/main 으로 푼다.
    #    (「뒤처짐」은 HEAD 기준으로 센다 — 작업 트리가 깨끗해야 ① 을 지나므로 HEAD 가 곧 올라갈 판이다.)
    if behind:
        ok = False
        lines = "\n".join("        " + c for c in behind)
        msgs.append(("막음", "이 체크아웃이 origin/main 보다 뒤처졌다 — main 에 들어간 아래 커밋이 빠진 채 나간다"
                              "(남의 액션이 오류 없이 사라진다).\n%s\n"
                              "        → git merge origin/main(또는 rebase) 뒤 다시" % lines))

    # 빠지는 액션 — 뒤처져서 빠진 것이면 위 ② 가 이미 막았다. 뒤처지지 않았는데도 빠진다면
    # 내 가지가 일부러 지운 것이다: 개발 + --allow-ahead 에서만 경고로 지나가고, 그 밖에는 막는다.
    if missing_actions:
        names = ", ".join(sorted(missing_actions))
        if env == "dev" and allow_ahead and not behind:
            msgs.append(("경고", "origin/main 에 있는 액션 %d개가 로컬 index.ts 에 없다: %s\n"
                                  "        → 내 가지가 일부러 지운 것인지 확인할 것" % (len(missing_actions), names)))
        else:
            ok = False
            msgs.append(("막음", "origin/main 에 있는 액션 %d개가 로컬 index.ts 에 없다: %s"
                         % (len(missing_actions), names)))

    # ③ main 과 내용이 다르다(뒤처진 것이 아니라 내가 앞선 경우만 여기까지 온다).
    #    운영: 반드시 main 과 같아야 한다 — 운영에 나가는 것은 PR·머지를 거친 main 의 판뿐이다.
    #          (main 에 안 들어간 가지를 운영에 올리면, 다음에 main 에서 배포하는 세션이 그것을 조용히 지운다.)
    #    개발: 아직 main 에 안 들어간 내 가지를 시험하는 것이 개발 DB 의 쓸모다 — 다만 기본은 막고
    #          --allow-ahead 를 손으로 줄 때만 지나간다(「앞서 있음」을 알고 올리는 것이 확인이다).
    if diff_files and not behind:               # 뒤처졌으면 다른 까닭은 이미 ② 가 말했다
        lines = "\n".join("        " + p for p in diff_files)
        if env == "prod":
            ok = False
            msgs.append(("막음", "origin/main 과 내용이 다르다 — 운영에는 main 의 판만 올린다.\n%s\n"
                                  "        → PR 을 머지한 뒤 main 에서(또는 git merge origin/main 해 같아진 뒤) 다시" % lines))
        elif allow_ahead:
            msgs.append(("경고", "origin/main 과 다르지만 --allow-ahead 로 개발에 올린다(main 에 아직 없는 내 가지).\n%s" % lines))
        else:
            ok = False
            msgs.append(("막음", "origin/main 과 내용이 다르다.\n%s\n"
                                  "        → main 에 아직 안 들어간 내 가지를 개발에서 시험하는 것이면 --allow-ahead 를 붙인다" % lines))

    if ok and not msgs:
        msgs.append(("통과", "커밋 안 된 것 없음 · origin/main 과 같음"))
    return ok, msgs


# ── git·파일 ─────────────────────────────────────────────────────────
def git(*args, check=True):
    r = subprocess.run(["git", *args], cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    out = r.stdout.decode("utf-8", "replace")
    if check and r.returncode != 0:
        raise RuntimeError("git %s 실패: %s" % (" ".join(args), r.stderr.decode("utf-8", "replace").strip()))
    return out, r.returncode


def read_local(path):
    try:
        with open(os.path.join(ROOT, path), encoding="utf-8") as f:
            return f.read()
    except OSError:
        return None


def read_main(path):
    out, rc = git("show", "%s:%s" % (MAIN, path), check=False)
    return out if rc == 0 else None


def deploy_paths(name):
    """올라갈 경로 — 함수 폴더 + 그 폴더의 .ts 가 상대 import 로 끌어오는 바깥 파일(_shared 류)."""
    fdir = "%s/%s" % (FN_DIR, name)
    paths, seen = [fdir + "/"], set()
    todo = []
    for dp, _, fs in os.walk(os.path.join(ROOT, fdir)):
        for f in fs:
            if f.endswith((".ts", ".tsx", ".js", ".mjs")):
                todo.append(os.path.relpath(os.path.join(dp, f), ROOT).replace("\\", "/"))
    while todo:
        p = todo.pop()
        if p in seen:
            continue
        seen.add(p)
        for dep in relative_imports(read_local(p), p):
            if not dep.startswith(fdir + "/") and dep not in paths:
                paths.append(dep)
            todo.append(dep)
    return paths


def main():
    funcs = sorted(d for d in os.listdir(os.path.join(ROOT, FN_DIR))
                   if os.path.isdir(os.path.join(ROOT, FN_DIR, d)) and not d.startswith((".", "_")))
    ap = argparse.ArgumentParser(description="Edge Function 배포 가드")
    ap.add_argument("name", help="함수 이름(%s)" % " · ".join(funcs))
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--dev", action="store_true", help="개발 프로젝트로")
    g.add_argument("--prod", action="store_true", help="운영 프로젝트로(이 플래그가 곧 확인이다)")
    ap.add_argument("--allow-ahead", action="store_true", help="개발에서만 — origin/main 보다 앞선 내 가지를 올린다")
    ap.add_argument("--dry-run", action="store_true", help="검사만 하고 배포 명령은 찍기만")
    a = ap.parse_args()

    env = "prod" if a.prod else "dev"
    ref, label = PROJECTS[env]
    if a.name not in funcs:
        print("✗ 함수 「%s」 는 %s/ 아래에 없다 — 있는 것: %s" % (a.name, FN_DIR, ", ".join(funcs)))
        return 1
    if a.allow_ahead and env == "prod":
        print("✗ --allow-ahead 는 개발에서만 쓴다 — 운영에는 origin/main 의 판만 올린다")
        return 1

    print("\n[배포 가드] %s → %s(%s)%s" % (a.name, label, ref, "  · dry-run" if a.dry_run else ""))

    _, rc = git("fetch", "origin", "--quiet", check=False)
    if rc != 0:
        print("✗ git fetch origin 이 실패했다 — origin/main 을 모르는 채로는 배포하지 않는다")
        return 1
    head = git("rev-parse", "--short", "HEAD")[0].strip()
    mainrev = git("rev-parse", "--short", MAIN)[0].strip()
    branch = git("branch", "--show-current")[0].strip() or "(분리된 HEAD)"
    print("  가지 %s @ %s · %s @ %s" % (branch, head, MAIN, mainrev))

    paths = deploy_paths(a.name)
    print("  올라갈 경로: " + " · ".join(paths))

    if read_main("%s/%s/index.ts" % (FN_DIR, a.name)) is None:
        print("  (origin/main 에는 이 함수가 아직 없다)")

    st_out, _ = git("status", "--porcelain=v1", "-z", "--untracked-files=all", "--", *paths)
    dirty = parse_porcelain(st_out)
    diff_out, _ = git("diff", "--name-only", MAIN, "--", *paths)
    diff_files = [l for l in diff_out.splitlines() if l.strip()]
    beh_out, _ = git("log", "--oneline", "HEAD.." + MAIN, "--", *paths)
    behind = [l for l in beh_out.splitlines() if l.strip()]

    missing = []
    if a.name == "api":
        idx = "%s/api/index.ts" % FN_DIR
        loc, mn = case_actions(read_local(idx)), case_actions(read_main(idx))
        missing = sorted(mn - loc)
        added = sorted(loc - mn)
        print("  액션(case) 로컬 %d개 · origin/main %d개" % (len(loc), len(mn)))
        if missing:
            print("    빠지는 것(main 에만): " + ", ".join(missing))
        if added:
            print("    더해지는 것(로컬에만): " + ", ".join(added))
        if not missing and not added:
            print("    같다")

    ok, msgs = judge(env, dirty, diff_files, behind, missing, a.allow_ahead)
    print()
    for lv, m in msgs:
        color = {"막음": "31", "경고": "33", "통과": "32"}[lv]
        print("  \033[%sm%s\033[0m  %s" % (color, lv, m))
    if not ok:
        print("\n✗ 배포하지 않았다(종료코드 1).")
        return 1

    cmd = ["supabase", "functions", "deploy", a.name, "--no-verify-jwt", "--project-ref", ref]
    print()
    if env == "prod":
        print("  " + "=" * 64)
        print("  ▶▶  운영(%s) 에 「%s」 를 올린다 — 성도님이 쓰는 서버  ◀◀" % (ref, a.name))
        print("  " + "=" * 64)
    print("  $ " + " ".join(cmd))
    if a.dry_run:
        print("\n(dry-run — 위 명령은 실행하지 않았다)")
    else:
        exe = shutil.which("supabase")
        if not exe:
            print("✗ supabase CLI 를 찾지 못했다")
            return 1
        r = subprocess.run([exe] + cmd[1:], cwd=ROOT)
        if r.returncode != 0:
            print("✗ supabase functions deploy 가 실패했다(종료코드 %d)" % r.returncode)
            return r.returncode

    print("\n배포 뒤 할 일:")
    if a.name == "api":
        if env == "dev":
            print("  · localhost(python -m http.server)에서 화면으로 확인 — 「개발 DB」 띠가 떠야 개발이다")
            print("  · bash tests/duty-smoke.sh · bash tests/edu-smoke.sh · bash tests/event-smoke.sh")
            print("  · 확인이 끝나면 main 에 머지한 뒤: python tools/deploy-fn.py api --prod")
        else:
            print("  · EVT_ENV=prod bash tests/duty-smoke.sh")
            print("  · EVT_ENV=prod bash tests/edu-smoke.sh")
            print("  · EVT_ENV=prod EXPECT_PER_DAY=3 bash tests/event-smoke.sh   (EVT_ENV=prod 를 빼면 개발을 본다)")
            print("  · (관리자 비번을 알면) ADMIN_SECRET=… bash tests/smoke-readonly.sh — 운영 읽기 전용 13개")
        print("  · 이번에 더한 액션이 있으면 그 액션을 한 번 불러 「이번 판에만 있는 표식」으로 확인")
    else:
        print("  · 「%s」 에는 스모크 시험이 없다 — 이번에 고친 동작을 한 번 직접 불러 확인" % a.name)
        if env == "dev":
            print("  · 확인이 끝나면 main 에 머지한 뒤: python tools/deploy-fn.py %s --prod" % a.name)
    return 0


if __name__ == "__main__":
    sys.exit(main())
