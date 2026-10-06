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

# ── 2-1) bump.py 가 index.html 의 코드 태그를 다 아는가 ─────────────
# 2026-10-05: index.html 에 js/edu.js?v= 를 더하고 bump.py 의 TAGGED 에는 안 넣었다 — bump 가 그 태그만
# 옛 날짜로 두고, 위 [2] 가 「서로 다르다」로 걸려 **모든 세션의 배포가 막힌다.** 그래서 목록 둘을 맞대 본다.
# bump.py 는 `if __name__ == "__main__"` 뒤에서만 돌므로 불러오기만 해서는 파일을 안 고친다(꾸러미 없음).
print("\n[2-1] bump.py 의 TAGGED 가 index.html 의 코드 태그와 같은가")
try:
    import importlib.util
    sys.dont_write_bytecode = True                # tools/__pycache__ 를 남기지 않게
    _spec = importlib.util.spec_from_file_location("_bump", os.path.join(ROOT, "tools", "bump.py"))
    _bump = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(_bump)
    bump_tagged = set(_bump.TAGGED)
except Exception as e:
    bump_tagged = None
    bad("tools/bump.py 에서 TAGGED 를 못 읽었다 — %s" % e)
if bump_tagged is not None:
    missing = sorted(set(tags) - bump_tagged)     # index.html 에는 있는데 bump 가 모른다 → bump 뒤 이 태그만 옛것
    stale = sorted(bump_tagged - set(tags))       # bump 는 아는데 index.html 에 없다 → bump 가 「찾지 못했습니다」로 멈춘다
    if missing:
        bad("index.html 이 ?v= 로 부르는데 tools/bump.py 의 TAGGED 에 없다: %s\n"
            "        → bump.py 의 TAGGED 에 더할 것(안 그러면 bump 뒤 이 태그만 옛것으로 남아 배포가 막힌다)" % ", ".join(missing))
    if stale:
        bad("tools/bump.py 의 TAGGED 에 있는데 index.html 이 ?v= 로 부르지 않는다: %s\n"
            "        → 파일을 뺐으면 TAGGED 에서도 뺄 것(안 그러면 bump.py 가 멈춘다)" % ", ".join(stale))
    if not missing and not stale:
        ok("index.html 코드 태그 %d개를 bump.py 가 모두 안다" % len(tags))

# ── 3) 순수 함수 검사 (꾸러미 없이 도는 것만) ───────────────────────
# ⚠️ 여기에는 **npm 꾸러미가 필요 없는** 검사만 적는다. tests/member-*.test.cjs 는
#    PGlite·jsdom·typescript 가 있어야 해서 못 넣는다 — 넣으면 Actions 러너에
#    node_modules 가 없어 배포가 통째로 멈춘다. 새 검사를 더할 때도 기준은 같다:
#    node 내장(node:test·node:assert·node:fs·node:path·node:vm)만 쓰는가.
PURE_TESTS = ["tests/ranking-scope.test.cjs", "tests/send-push-opts.test.cjs",
              "tests/evening-push.test.cjs", "tests/ministry-history.test.cjs"]

# 게시판 신고(2026-10-01) — 까닭 목록 세 곳(앱·서버·SQL CHECK)과 보관 90일(개인정보 안내)이 서로 맞나.
# (위 목록 줄을 고치지 않고 따로 더한다 — 다른 세션도 그 줄에 더하고 있어 합칠 때 부딪힌다)
PURE_TESTS += ["tests/board-report.test.cjs"]

# 구글 출시 심사 전(2026-10-01) — 보호자 확인 부서 두 곳 · 이용 규칙 날짜 · AI 답 까닭 세 곳 ·
# 개인정보 세 곳(privacy/ · 앱 안 두 곳)이 같은 것을 말하나 · 새 표의 잠금 · 스토어 문구.
# (위 줄들을 고치지 않고 따로 더한다 — 다른 세션도 이 목록에 더하고 있어 합칠 때 부딪힌다)
PURE_TESTS += ["tests/store-review.test.cjs"]

# 기록 합치기(2026-10-01) — supabase/*.sql 에서 users 를 가리키는 표를 member_merge.sql 이 다 아는가.
# 모르는 표가 생기면 그 기능을 한 번이라도 쓴 계정은 합치기가 조용히 멈춘다(가리기·신고·AI 답 알림이 그랬다).
# 글자만 본다(꾸러미 없음). 실제로 합쳐 보는 것은 tests/member-merge.test.cjs(PGlite — 여기 못 넣는다).
# (위 줄들을 고치지 않고 따로 더한다 — 다른 세션도 이 목록에 더하고 있어 합칠 때 부딪힌다)
PURE_TESTS += ["tests/member-merge-coverage.test.cjs"]

# 가을 말씀 동행 — v2_event_weeks 의 p_per_day(하루 합 문턱)(2026-10-03). 4-인자 서명이 안 남고,
# HAVING 없이 filter 로 거르는지, first_day 부분식에 p_per_day 가 안 섞였는지를 글자로 본다.
PURE_TESTS += ["tests/event-perday.test.cjs"]

# 가을 말씀 동행 — 신청 없이 「자동 대상」(needs.auto · 2026-10-03 · 설계 §9). 도장판 끝 문구 고르기(evtAutoTail)·
# 화면·서버 evtAuto 가 같은지·서버 순서(시험 회차 비테스터 not-found 가 먼저)·개인정보 세 곳이 같은 문장인지.
# (위 줄들을 고치지 않고 따로 더한다 — 다른 세션도 이 목록에 더하고 있어 합칠 때 부딪힌다)
PURE_TESTS += ["tests/event-auto.test.cjs"]

# 교육신청(2026-10-05) — 화면 순수 함수(상태 줄·신청 결과 말·오류 말)
PURE_TESTS += ["tests/edu-front.test.cjs"]

# 봉사 당번(2026-10-06) — duty.sql 의 함수마다 권한 줄이 있는가 · 공개 역할에 여는 줄·뷰가 없는가 · 기록 합치기가 duty_signups 를 아는가(글자만)
# (위 줄들을 고치지 않고 따로 더한다 — 다른 세션도 이 목록에 더하고 있어 합칠 때 부딪힌다)
PURE_TESTS += ["tests/duty-sql.test.cjs"]
# 봉사 당번 2단계 — 화면 순수 함수(자리 한 칸·내 줄·확인 창·오류 말) · api 순수 구간(이름 검사·겹침 답·못 가요 까닭)
PURE_TESTS += ["tests/duty-front.test.cjs"]
# 봉사 당번 화면 흐름 — js/duty.js 전체를 가짜 DOM·가짜 api 위에서(늦게 온 응답이 다른 화면을 덮지 않는가 · 다시 받기 실패 · 계정 번호 없음 · 잠긴 날 확인)
PURE_TESTS += ["tests/duty-flow.test.cjs"]
# 봉사 당번 알림 — 보내는 길을 끝까지(api 의 보내기 함수들을 글자 그대로 떼어 가짜 DB·가짜 푸시 위에서 · 꾸러미 없음). 개발 계정에는 받는 기기가 없어
#   「같은 글 묶음 안의 죽은 기기」·「옛 SQL 을 만난 새 api」를 개발 서버로는 못 본다(node 22.13 미만이면 스스로 건너뛴다 · 2026-10-07).
PURE_TESTS += ["tests/duty-send.test.cjs"]

print("\n[3] 순수 함수 검사 (node --test)")
for t in PURE_TESTS:
    if not os.path.exists(os.path.join(ROOT, t)):
        bad("%s — 파일이 없다 (지웠으면 preflight.py 의 PURE_TESTS 에서도 뺄 것)" % t)
        continue
    r = subprocess.run(["node", "--test", t], cwd=ROOT,
                       stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    out = r.stdout.decode("utf-8", "replace")
    if r.returncode == 0:
        m = re.search(r"^# pass (\d+)", out, re.M)
        ok("%s — %s가지 통과" % (t, m.group(1) if m else "?"))
    else:
        hits = [ln for ln in out.splitlines()
                if ln.startswith("not ok") or "AssertionError" in ln or "Error:" in ln]
        detail = "\n".join("        " + ln.strip() for ln in hits[:12])
        if not detail:
            detail = "        " + out.strip()[:400]
        bad("%s — 검사가 떨어졌다\n%s\n        → node --test %s 로 자세히 볼 것" % (t, detail, t))

# ── 결과 ────────────────────────────────────────────────────────────
print()
if fail:
    print("\033[31m배포를 멈춘다 — %d가지가 걸렸다.\033[0m 위 내용을 고치고 다시 푸시할 것.\n" % len(fail))
    sys.exit(1)
print("\033[32m모두 통과 — 배포해도 된다.\033[0m\n")
