# -*- coding: utf-8 -*-
"""반영 현황 한 장 — 「지금 무엇이 어디에 올라가 있나」를 읽기만 해서 보여 준다(2026-10-12).

    python tools/status.py            운영(gocheok.onlybible.kr · xnomlgydifiqiybervtf)
    python tools/status.py --dev      개발(ktpwthwqzgcqcrmsafdo) — 화면 칸은 건너뛴다(개발에는 사이트가 없다)
    python tools/status.py --no-fetch git fetch 없이(origin/main 을 이미 받아 둔 때)

왜: 여러 세션이 병렬로 일하면 「정확히 반영됐나」가 조용히 어긋난다 —
    남의 것이 딸려 나가고, 내 것이 빠지고, CDN 이 옛 app.js 를 내보내고, 함수가 낡은 체크아웃에서 올라간다.
    그래서 기준을 **origin/main** 하나로 두고, 실제로 올라가 있는 것을 거기에 견준다.

칸 넷:
  1. 화면 — 운영 index.html 이 부르는 ?v= · 그 주소의 app.js 의 APP_BUILD · origin/main 의 태그(CLAUDE.md 「배포 확인」).
  2. 함수 — 운영에 올라간 api·mcp 를 `supabase functions download --use-api` 로 **저장소 밖 임시 폴더**에 받아
            origin/main 의 supabase/functions/<이름>/ (+ 상대 import 로 끌어오는 _shared 류)와 견준다.
            api 는 `case "…"` 액션을 파일 전체에서 모아 「운영에만」·「main 에만」을 찍는다.
  3. 문   — 공개 키로 api 의 getConfig(PUBLIC_CONFIG_KEYS — origin/main 에서 읽는다)
            + origin/main 의 app.js·js/*.js 의 상수 스위치(`const 이름_LIVE|_OPEN|_HIDE… = true|false|{…}`).
  4. 최근 Actions — gh run list --limit 3.

⚠️ 읽기만 한다 — 쓰는 요청·관리자 암호·service_role 키를 쓰지 않는다. 개인정보·user_id 를 찍지 않는다
   (getConfig 는 공개 키 목록뿐이고, 긴 값은 모양만 찍는다).
실패한 칸은 「모름」으로 두고 나머지를 계속 본다. 종료코드: 다름이 하나라도 있으면 1, 아니면 0.
파이썬 표준 라이브러리 + supabase CLI · gh 만 쓴다.
"""
import argparse, datetime, json, os, posixpath, re, shutil, subprocess, sys, tempfile, unicodedata
import urllib.request

try: sys.stdout.reconfigure(encoding="utf-8")
except Exception: pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAIN = "origin/main"
SITE = "https://gocheok.onlybible.kr"
FUNCS = ["api", "mcp"]

# 공개 키(js/config.js 와 같은 값 — 앱 코드 안에 있어 누구나 가진 것이다)
PROJECTS = {
    "prod": ("xnomlgydifiqiybervtf", "운영", "sb_publishable_oLtieT_jw7Gjb8etEsy0jw_thBaDjl-"),
    "dev":  ("ktpwthwqzgcqcrmsafdo", "개발", "sb_publishable_eJKP6u95IU9_DBXTvnvYBA_-yGCf-0Y"),
}

SAME, DIFF, UNKNOWN, INFO = "같음", "다름", "모름", "·"


# ── 순수 함수 ─────────────────────────────────────────────────────────
# preflight.py [2] 와 같은 꼴 — 그림(logo3.png?v=…)은 bump.py 가 안 올리므로 코드 파일만 본다.
_TAG = re.compile(r'(?:src|href)="((?:app\.js|style\.css|js/[^"?]+\.js))\?v=([0-9a-z]+)"')

def code_tags(html):
    """index.html → {경로: 태그}."""
    return {m.group(1): m.group(2) for m in _TAG.finditer(html or "")}


def app_build(src):
    m = re.search(r'APP_BUILD\s*=\s*"([0-9a-z]+)"', src or "")
    return m.group(1) if m else None


def splash_ver(html):
    m = re.search(r'class="splash-ver">(v[\d.]+)<', html or "")
    return m.group(1) if m else None


_CASE = re.compile(r'^\s*case\s+"([A-Za-z0-9_]+)"\s*:', re.M)     # tools/deploy-fn.py 와 같은 규칙

def case_actions(src):
    return set(_CASE.findall(src or ""))


_IMPORT = re.compile(r'''(?:\bfrom\s*|\bimport\s*\(?\s*)["'](\.{1,2}/[^"']+)["']''')

def relative_imports(src, file_path):
    base = posixpath.dirname(file_path)
    return sorted({posixpath.normpath(posixpath.join(base, m)) for m in _IMPORT.findall(src or "")})


def norm_text(s):
    """줄 끝(CRLF/LF)과 BOM 은 견주지 않는다 — 윈도 체크아웃과 올라간 판이 그것만 달라도 「다름」이 되지 않게."""
    return (s or "").lstrip("﻿").replace("\r\n", "\n")


# 스위치 — 이름을 박지 않고 꼴로 찾는다. 값이 true/false 이거나 {키: true|false, …} 인 것만(배열·문자열 상수는 스위치가 아니다).
_SWITCH = re.compile(
    r'^const\s+([A-Z][A-Z0-9_]*_(?:LIVE|OPEN|HIDE(?:_[A-Z0-9_]+)?|OFF|ON|GUIDE|VISIBLE|ENABLED?))\s*=\s*'
    r'(true|false|\{[^}\n]*\})\s*;[ \t]*(?://[ \t]*(.*))?$', re.M)
_BOOL_OBJ = re.compile(r'^\{\s*(?:[A-Za-z_$][\w$]*\s*:\s*(?:true|false)\s*,?\s*)+\}$')

def code_switches(src):
    """→ [(이름, 값 글, 줄끝 주석)] — 줄 머리의 const 만(주석 안의 `const X = true;` 는 안 센다)."""
    out = []
    for m in _SWITCH.finditer(src or ""):
        val = m.group(2)
        if val.startswith("{") and not _BOOL_OBJ.match(val):
            continue
        out.append((m.group(1), re.sub(r"\s+", " ", val), (m.group(3) or "").strip()))
    return out


def public_config_keys(src):
    m = re.search(r'PUBLIC_CONFIG_KEYS\s*=\s*new Set\(\[([^\]]*)\]\)', src or "")
    return re.findall(r'"([^"]+)"', m.group(1)) if m else []


def shape(v, limit=90):
    """getConfig 값 → 한 줄. 긴 값은 내용 대신 모양만(문구·명단이 화면에 쏟아지지 않게)."""
    if v is None:
        return "없음(null)"
    if isinstance(v, (bool, int, float)):
        return json.dumps(v)
    if isinstance(v, str):
        return json.dumps(v, ensure_ascii=False) if len(v) <= 40 else "글 %d자" % len(v)
    if isinstance(v, list):
        return "목록 %d개" % len(v)
    if isinstance(v, dict):
        s = json.dumps(v, ensure_ascii=False, separators=(",", ":"))
        if len(s) <= limit:
            return s
        ks = list(v.keys())
        return "{키 %d개: %s%s}" % (len(ks), ", ".join(ks[:6]), " …" if len(ks) > 6 else "")
    return type(v).__name__


def short(s, n):
    s = s or ""
    return s if len(s) <= n else s[:n - 1] + "…"


def width(s):
    return sum(2 if unicodedata.east_asian_width(c) in "WF" else 1 for c in s)


def pad(s, w):
    return s + " " * max(0, w - width(s))


# ── 바깥(git · http · CLI) ──────────────────────────────────────────
def run(cmd, cwd=ROOT, timeout=120):
    exe = shutil.which(cmd[0])
    if not exe:
        raise RuntimeError("%s 를 찾지 못했다" % cmd[0])
    r = subprocess.run([exe] + cmd[1:], cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout)
    return r.returncode, r.stdout.decode("utf-8", "replace"), r.stderr.decode("utf-8", "replace")


def git(*args):
    rc, out, err = run(["git", *args])
    if rc != 0:
        raise RuntimeError("git %s: %s" % (" ".join(args), err.strip()[:200]))
    return out


def main_file(path):
    rc, out, _ = run(["git", "show", "%s:%s" % (MAIN, path)])
    return out if rc == 0 else None


def http(url, data=None, headers=None, timeout=20):
    h = {"User-Agent": "gocheok-status/1", "Cache-Control": "no-cache"}
    h.update(headers or {})
    req = urllib.request.Request(url, data=data, headers=h, method="POST" if data is not None else "GET")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "replace")


# ── 칸마다 ───────────────────────────────────────────────────────────
def check_screen(env):
    """→ [(칸, 판정, 내용)]."""
    if env == "dev":
        return [("화면", INFO, "개발에는 사이트가 없다(localhost) — 건너뜀")]
    rows = []
    main_html = main_file("index.html")
    mtags = code_tags(main_html)
    mtag = sorted(set(mtags.values()))
    try:
        stamp = datetime.datetime.now().strftime("%H%M%S")
        live_html = http("%s/?status=%s" % (SITE, stamp))          # 쿼리를 붙여 CDN 의 옛 사본을 피한다
    except Exception as e:
        return [("화면", UNKNOWN, "운영 index.html 을 못 읽었다: %s" % e)]
    ltags = code_tags(live_html)
    ltag = sorted(set(ltags.values()))
    if not ltag:
        return [("화면", UNKNOWN, "운영 index.html 에서 ?v= 를 못 찾았다(이 도구가 낡았을 수 있다)")]
    build = None
    try:
        build = app_build(http("%s/app.js?v=%s" % (SITE, ltags.get("app.js", ltag[0]))))
    except Exception as e:
        rows.append(("화면", UNKNOWN, "운영 app.js 를 못 읽었다: %s" % e))

    detail = "운영 ?v=%s · APP_BUILD %s · %s · main ?v=%s · %s" % (
        "/".join(ltag), build or "?", splash_ver(live_html) or "?", "/".join(mtag) or "?", splash_ver(main_html) or "?")
    if len(ltag) > 1:
        rows.append(("화면", DIFF, detail + " — 운영 index.html 안의 태그가 서로 다르다"))
    elif mtag and ltag != mtag:
        rows.append(("화면", DIFF, detail + " — 운영이 main 과 다르다(배포 전이거나 Actions 가 멈췄다 · 아래 4)"))
    elif build and build != ltag[0]:
        rows.append(("화면", DIFF, detail + " — CDN 이 옛 app.js 를 내보내는 중(최대 10분 · 앱이 스스로 한 번 다시 받는다)"))
    elif build is None:
        rows.append(("화면", UNKNOWN, detail))
    else:
        rows.append(("화면", SAME, detail))
    return rows


def main_fn_files(name):
    """origin/main 의 함수 파일 → {경로: 내용}. 폴더 안 전부 + 상대 import 로 끌어오는 바깥 파일."""
    fdir = "supabase/functions/%s" % name
    out = git("ls-tree", "-r", "--name-only", MAIN, "--", fdir + "/")
    todo = [p for p in out.splitlines() if p.endswith((".ts", ".tsx", ".js", ".mjs", ".json"))]
    files = {}
    while todo:
        p = todo.pop()
        if p in files:
            continue
        src = main_file(p)
        if src is None:
            continue
        files[p] = norm_text(src)
        todo.extend(d for d in relative_imports(src, p) if d not in files)
    return files


def deployed_fn_files(name, ref, tmp):
    """운영(또는 개발)에 올라간 판을 저장소 밖 임시 폴더에 받는다 → {경로: 내용}."""
    wd = os.path.join(tmp, name)
    os.makedirs(wd)
    rc, out, err = run(["supabase", "functions", "download", name, "--project-ref", ref, "--use-api", "--agent", "no"],
                       cwd=wd, timeout=180)
    if rc != 0:
        msg = re.sub(r"\s+", " ", re.sub(r"\x1b\[[0-9;]*m", "", err or out)).strip()
        if "Function not found" in msg:
            raise LookupError("올라간 적이 없다(404)")
        raise RuntimeError(msg[-200:])
    files = {}
    base = os.path.join(wd, "supabase", "functions")
    for dp, _, fs in os.walk(base):
        for f in fs:
            if f.endswith((".ts", ".tsx", ".js", ".mjs", ".json")):
                full = os.path.join(dp, f)
                rel = "supabase/functions/" + os.path.relpath(full, base).replace("\\", "/")
                with open(full, encoding="utf-8", errors="replace") as fh:
                    files[rel] = norm_text(fh.read())
    if not files:
        raise RuntimeError("받은 파일이 없다")
    return files


def check_functions(env):
    ref, label, _ = PROJECTS[env]
    rows = []
    tmp = tempfile.mkdtemp(prefix="gocheok-fn-")
    try:
        if os.path.abspath(tmp).startswith(os.path.abspath(ROOT) + os.sep):   # 혹시라도 — 저장소 안에는 받지 않는다
            return [("함수", UNKNOWN, "임시 폴더가 저장소 안이다 — 받지 않았다")]
        for name in FUNCS:
            cell = "함수 " + name
            try:
                mf = main_fn_files(name)
            except Exception as e:
                rows.append((cell, UNKNOWN, "origin/main 을 못 읽었다: %s" % e)); continue
            try:
                df = deployed_fn_files(name, ref, tmp)
            except LookupError as e:     # 개발에는 mcp 가 없다 — 운영에서 없으면 그것은 다름이다
                rows.append((cell, DIFF if env == "prod" else INFO, "%s에 %s" % (label, e))); continue
            except Exception as e:
                rows.append((cell, UNKNOWN, "%s 판을 못 받았다: %s" % (label, e))); continue
            only_dep = sorted(set(df) - set(mf))
            only_main = sorted(set(mf) - set(df))
            changed = sorted(p for p in set(df) & set(mf) if df[p] != mf[p])
            acts = ""
            if name == "api":
                da = set().union(*(case_actions(s) for s in df.values()))
                ma = set().union(*(case_actions(s) for s in mf.values()))
                acts = "액션 %s %d · main %d" % (label, len(da), len(ma))
                if da - ma:
                    acts += " · %s에만: %s" % (label, ", ".join(sorted(da - ma)))
                if ma - da:
                    acts += " · main 에만(아직 안 올라감): %s" % ", ".join(sorted(ma - da))
            if not (only_dep or only_main or changed):
                rows.append((cell, SAME, "파일 %d개 내용까지 origin/main 과 같다%s" % (len(mf), " · " + acts if acts else "")))
            else:
                bits = []
                if changed:   bits.append("내용 다름: " + ", ".join(p.split("supabase/functions/")[-1] for p in changed))
                if only_dep:  bits.append("%s에만: " % label + ", ".join(p.split("supabase/functions/")[-1] for p in only_dep))
                if only_main: bits.append("main 에만: " + ", ".join(p.split("supabase/functions/")[-1] for p in only_main))
                if acts:      bits.append(acts)
                rows.append((cell, DIFF, " · ".join(bits)))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    return rows


def check_switches(env):
    ref, label, anon = PROJECTS[env]
    rows = []
    idx = main_file("supabase/functions/api/index.ts")
    keys = public_config_keys(idx)
    if not keys:
        rows.append(("문 getConfig", UNKNOWN, "origin/main 에서 PUBLIC_CONFIG_KEYS 를 못 찾았다"))
    vals = []
    for k in keys:
        try:
            body = json.dumps({"action": "getConfig", "key": k}).encode("utf-8")
            r = json.loads(http("https://%s.supabase.co/functions/v1/api" % ref, data=body, headers={
                "Content-Type": "application/json", "apikey": anon, "Authorization": "Bearer " + anon}))
            vals.append("%s=%s" % (k, shape(r.get("value")) if r.get("ok") else "모름(%s)" % r.get("error")))
        except Exception as e:
            vals.append("%s=모름(%s)" % (k, short(str(e), 40)))
    for v in vals:
        rows.append(("문 getConfig(%s)" % label, INFO, v))

    files = ["app.js"] + sorted(p for p in git("ls-tree", "--name-only", MAIN, "js/").splitlines() if p.endswith(".js"))
    found = 0
    for p in files:
        for name, val, note in code_switches(main_file(p)):
            found += 1
            rows.append(("문 코드(main)", INFO, "%s = %s  (%s)%s" % (name, val, p, ("  // " + short(note, 50)) if note else "")))
    if not found:
        rows.append(("문 코드(main)", UNKNOWN, "app.js·js/*.js 에서 스위치 꼴을 못 찾았다"))
    return rows


def check_actions():
    try:
        rc, out, err = run(["gh", "run", "list", "--limit", "3", "--json",
                            "workflowName,status,conclusion,headSha,createdAt,displayTitle"])
        if rc != 0:
            return [("Actions", UNKNOWN, "gh run list 실패: %s" % err.strip()[:120])]
        runs = json.loads(out)
    except Exception as e:
        return [("Actions", UNKNOWN, "gh run list 실패: %s" % e)]
    try:
        head = git("rev-parse", MAIN).strip()
    except Exception:
        head = ""
    rows = []
    for r in runs:
        try:
            t = datetime.datetime.strptime(r["createdAt"], "%Y-%m-%dT%H:%M:%SZ") + datetime.timedelta(hours=9)
            when = t.strftime("%m-%d %H:%M")
        except Exception:
            when = r.get("createdAt", "?")
        state = r.get("conclusion") or r.get("status") or "?"
        verdict = INFO
        if state in ("failure", "startup_failure", "timed_out"):
            verdict = DIFF
        sha = (r.get("headSha") or "")[:7]
        mark = " ← origin/main" if head and r.get("headSha") == head else ""
        rows.append(("Actions", verdict, "%s KST · %s · %s · %s%s · %s" % (
            when, short(r.get("workflowName", "?"), 22), state, sha, mark, short(r.get("displayTitle", ""), 40))))
    return rows or [("Actions", UNKNOWN, "기록이 없다")]


def main():
    ap = argparse.ArgumentParser(description="반영 현황 한 장(읽기만)")
    ap.add_argument("--dev", action="store_true", help="개발 프로젝트를 본다(기본은 운영)")
    ap.add_argument("--no-fetch", action="store_true", help="git fetch origin 을 건너뛴다")
    a = ap.parse_args()
    env = "dev" if a.dev else "prod"
    ref, label, _ = PROJECTS[env]

    if not a.no_fetch:
        rc, _, err = run(["git", "fetch", "origin", "--quiet"])
        if rc != 0:
            print("⚠ git fetch origin 실패 — 받아 둔 origin/main 으로 견준다: %s" % err.strip()[:120])
    try:
        mrev = git("log", "-1", "--format=%h %cd", "--date=format:%m-%d %H:%M", MAIN).strip()
    except Exception as e:
        print("✗ origin/main 을 모른다: %s" % e)
        return 1
    print("\n[반영 현황] %s(%s) · 기준 origin/main %s\n" % (label, ref, mrev))

    rows = []
    for fn in (lambda: check_screen(env), lambda: check_functions(env), lambda: check_switches(env), check_actions):
        try:
            rows += fn()
        except Exception as e:
            rows.append(("?", UNKNOWN, "검사 중 오류: %s" % e))

    w0 = max(width(r[0]) for r in rows)
    tty = sys.stdout.isatty()
    color = {SAME: "32", DIFF: "31", UNKNOWN: "33", INFO: ""}
    def paint(v):        # 색은 터미널일 때만 — 파일·파이프로 넘기면 글자만
        return "\033[%sm%s\033[0m" % (color[v], pad(v, 4)) if tty and color[v] else pad(v, 4)
    print("  %s  %s  %s" % (pad("칸", w0), pad("판정", 4), "내용"))
    print("  " + "─" * (w0 + 4 + 40))
    prev = None
    for cell, verdict, detail in rows:
        shown = cell if cell != prev else ""
        prev = cell
        print("  %s  %s  %s" % (pad(shown, w0), paint(verdict), detail))
    n_diff = sum(1 for r in rows if r[1] == DIFF)
    n_unk = sum(1 for r in rows if r[1] == UNKNOWN)
    print("\n  다름 %d · 모름 %d" % (n_diff, n_unk))
    return 1 if n_diff else 0


if __name__ == "__main__":
    sys.exit(main())
