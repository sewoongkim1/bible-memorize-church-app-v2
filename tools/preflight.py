# -*- coding: utf-8 -*-
"""배포 전 점검 — 문법이 깨진 판이나 캐시태그가 안 오른 판이 성도님께 나가는 것을 막는다.

    python tools/preflight.py

깃허브 Actions 의 배포(.github/workflows/deploy.yml)가 이것을 먼저 돌린다 —
여기서 실패하면 **배포가 아예 안 된다.** 푸시 전에 손으로도 한 번 돌려 볼 수 있다.

왜 필요한가: 이 저장소는 push 가 곧 배포다. app.js 10,000줄에 괄호 하나가 어긋나면
전 성도의 앱이 통째로 안 뜨는데, 오류창도 안 떠서(스플래시가 7초 뒤 닫히고 멈춘다)
제보가 올 때까지 아무도 모른다. 2026-09-12에 이 검사를 세웠다.
"""
import os, re, subprocess, sys, glob

# 윈도우 콘솔은 기본이 cp949 라 한글·— 이 깨지거나 아예 터진다.
try: sys.stdout.reconfigure(encoding="utf-8")
except Exception: pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
fail = []

def ok(msg):   print("  \033[32m통과\033[0m  " + msg)
def bad(msg):  fail.append(msg); print("  \033[31m실패\033[0m  " + msg)

def read(p):
    with open(os.path.join(ROOT, p), encoding="utf-8") as f: return f.read()

# ── 1) 자바스크립트 문법 ────────────────────────────────────────────
print("\n[1] 자바스크립트 문법 (node --check)")
targets = ["app.js", "sw.js"] + sorted(
    os.path.relpath(p, ROOT).replace("\\", "/") for p in glob.glob(os.path.join(ROOT, "js", "*.js")))
for t in targets:
    r = subprocess.run(["node", "--check", t], cwd=ROOT,
                       stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    if r.returncode == 0:
        ok(t)
    else:
        bad("%s — 문법이 깨졌다\n%s" % (t, r.stdout.decode("utf-8", "replace").rstrip()))

# ── 2) 캐시태그가 함께 올랐나 ───────────────────────────────────────
# ⚠️ 그림(logo3.png 등)은 bump.py 가 안 건드린다 — 코드 파일만 본다.
print("\n[2] 캐시태그 (python tools/bump.py 를 돌렸나)")
html = read("index.html")
tags = {}
for m in re.finditer(r'(?:src|href)="((?:app\.js|style\.css|js/[^"?]+\.js))\?v=([0-9a-z]+)"', html):
    tags[m.group(1)] = m.group(2)
if not tags:
    bad("index.html 에서 ?v= 태그를 하나도 못 찾았다 — 이 검사 자체가 낡았을 수 있다")
else:
    vals = set(tags.values())
    if len(vals) > 1:
        lines = "\n".join("        %-18s ?v=%s" % (k, v) for k, v in sorted(tags.items()))
        bad("index.html 안의 ?v= 가 서로 다르다 — bump.py 가 일부만 올렸다\n%s" % lines)
    else:
        tag = vals.pop()
        ok("index.html 코드 태그 %d개가 모두 ?v=%s" % (len(tags), tag))
        m = re.search(r'APP_BUILD\s*=\s*"([0-9a-z]+)"', read("app.js"))
        if not m:
            bad("app.js 에서 APP_BUILD 를 못 찾았다")
        elif m.group(1) != tag:
            bad("app.js 의 APP_BUILD(\"%s\") 가 index.html 의 ?v=%s 와 다르다 — "
                "브라우저가 새 주소로 옛 파일을 받아 한 번 더 새로고침하게 된다.\n"
                "        → python tools/bump.py 를 돌리고 다시 커밋할 것" % (m.group(1), tag))
        else:
            ok('app.js 의 APP_BUILD 도 "%s" 로 같다' % tag)

# ── 결과 ────────────────────────────────────────────────────────────
print()
if fail:
    print("\033[31m배포를 멈춘다 — %d가지가 걸렸다.\033[0m 위 내용을 고치고 다시 푸시할 것.\n" % len(fail))
    sys.exit(1)
print("\033[32m모두 통과 — 배포해도 된다.\033[0m\n")
