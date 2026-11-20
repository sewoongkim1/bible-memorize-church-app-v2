#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""「내게 주시는 말씀」 AI 에이전트(sermonAgent) — 개발 DB 스모크

    set -a; . ./.env.dev; set +a; python tests/sermon-agent-smoke.py           질문 10개 + 되묻기 1번
    set -a; . ./.env.dev; set +a; python tests/sermon-agent-smoke.py --n 3     질문 3개 + 되묻기 1번(가볍게)
    set -a; . ./.env.dev; set +a; python tests/sermon-agent-smoke.py --limit   끝에 하루 한도(limited)까지

⚠️ 개발(ktpwthwqzgcqcrmsafdo)만. `--prod` 나 EVT_ENV=prod 면 아무 데도 부르지 않고 끝난다.
⚠️ **Anthropic 을 실제로 부른다.** 에이전트 한 번 = AI 부름 2~5번(상한 AGENT_LIMITS.ai = 5).
   기본(질문 10 + 되묻기 1 = 11번 돎) → 22~55번 · --n 3(4번 돎) → 8~20번.
   저장된 답 · 문 닫힘 · 시험 참여자 아님 확인은 AI 를 부르지 않는다. --limit 도 0번이다 — 서버가 저장된 답도
   sermon_chat_log 에 셀 때만. 아니면 마지막 새 질문 하나가 한 번 더 돈다(2~5번).
   **돌리기 전에 친구에게 이 수를 말하고 OK 를 받는다**(2026-10-16 사용 한도에 닿은 일).
⚠️ 개발 app_config.scAgent 를 "on" → "test" → "" 로 바꿨다가 **처음 값으로 되돌린다**(실패 · Ctrl+C 에도 finally · 처음에 없었으면 "" — 닫힘).
   관리자 문(2026-10-08) 때문에 saveConfig 는 「암호 + 총괄」 — ADMIN_SECRET · SMOKE_SUPER 를 .env.dev 에서(life-pin-smoke 와 같다).
   시험 계정은 실행마다 새 이름이다(개발 DB 에 users 줄이 조금 남는다 — 개발은 버려도 되는 DB).
   질문 끝에 실행마다 다른 꼬리표(#123456)를 붙인다 — 안 붙이면 두 번째 실행부터 모두 저장된 답(📚)이 와서 에이전트가 안 돈다.
⚠️ 개발 DB 에 설교 발췌(sermon_chunks)가 적으면 설교 카드는 대개 없다 — 그건 실패가 아니다(줄마다 「설교 있음/없음」만 센다).
출력은 요약만 — 암호 · 키 · user_id · 답 글은 찍지 않는다. 끝 코드: 실패가 있으면 1.
"""
import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

URL = "https://ktpwthwqzgcqcrmsafdo.supabase.co/functions/v1/api"   # 개발만 — 운영 주소는 이 파일에 두지 않는다
ANON = "sb_publishable_eJKP6u95IU9_DBXTvnvYBA_-yGCf-0Y"              # 개발 공개 키(js/config.js 와 같다)
HEAD = {"apikey": ANON, "Authorization": "Bearer " + ANON, "Content-Type": "application/json"}
STEP_KINDS = {"sermon", "verse", "write", "cache"}
STEP_STATES = {"start", "done", "fail"}
MAX_VERSES, MAX_CHIPS, CHIP_LEN, WHY_LEN = 2, 3, 30, 60   # sermon-agent.ts AGENT_LIMITS(verses · chips · chipLen · whyLen)와 같아야 한다
PER_DAY = 20                                              # 한 분 하루 한도(AgentDeps.chat.perDay — sermonChat 과 같다)

QUESTIONS = [
    "요즘 걱정이 많아 밤에 잠이 잘 안 와요. 어떻게 해야 할까요?",
    "가족과 자주 다투게 돼요. 화를 다스리고 싶어요.",
    "하나님이 정말 제 기도를 들으시는지 모르겠어요.",
    "직장에서 억울한 일을 당했는데 용서가 잘 안 돼요.",
    "아이에게 믿음을 어떻게 물려줄 수 있을까요?",
    "몸이 아프니 마음까지 약해져요.",
    "감사가 잘 나오지 않는 요즘, 감사하는 법을 알고 싶어요.",
    "새해를 앞두고 무엇을 결단해야 할지 모르겠어요.",
    "외롭고 아무도 내 마음을 몰라주는 것 같아요.",
    "시험을 앞둔 자녀를 위해 어떤 말씀으로 기도하면 좋을까요?",
]

ap = argparse.ArgumentParser(description="「내게 주시는 말씀」 에이전트 개발 스모크")
ap.add_argument("--n", type=int, default=len(QUESTIONS), help="앞에서부터 몇 개를 물을까(1~10)")
ap.add_argument("--limit", action="store_true", help="끝에 하루 한도(limited)까지 본다")
ap.add_argument("--prod", action="store_true", help="받기만 하고 거절한다(운영 금지)")
args = ap.parse_args()

if args.prod or os.environ.get("EVT_ENV", "dev") == "prod":
    print("운영에는 돌리지 않는다 — app_config 를 바꾸고 AI 를 부른다. 운영은 계획 Task 11 의 「문 닫힘」 확인으로.")
    sys.exit(1)

N = max(1, min(len(QUESTIONS), args.n))
PW = os.environ.get("ADMIN_SECRET", "").strip()
try:
    SUPER = json.loads(os.environ.get("SMOKE_SUPER", "") or "null")
except Exception:
    SUPER = None
if not PW or not SUPER:
    print("ADMIN_SECRET · SMOKE_SUPER 가 환경에 없다 — set -a; . ./.env.dev; set +a 뒤 다시(값은 찍지 않는다).")
    sys.exit(1)


def api(action, **kw):
    """JSON 액션 하나 — 오류도 dict 로(값을 찍지 않으려고 예외를 밖으로 안 던진다)."""
    req = urllib.request.Request(URL, method="POST", headers=HEAD,
                                 data=json.dumps({"action": action, **kw}).encode("utf-8"))
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        try:
            return json.loads(e.read())
        except Exception:
            return {"http": e.code}
    except Exception as e:
        return {"neterr": type(e).__name__}


def ask(uid, message, follow=None, timeout=120):
    """sermonAgent 를 부르고 NDJSON 줄을 오는 대로 모은다 → ([(받은 초, 줄)], 정보)."""
    body = {"action": "sermonAgent", "user_id": uid, "message": message}
    if follow is not None:
        body["follow"] = follow
    req = urllib.request.Request(URL, method="POST", headers=HEAD, data=json.dumps(body).encode("utf-8"))
    t0 = time.monotonic()
    lines, info = [], {"http": 200, "ctype": "", "broken": 0, "raw": ""}
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            info["ctype"] = r.headers.get("content-type", "")
            while True:
                raw = r.readline()
                if not raw:
                    break
                s = raw.decode("utf-8", "replace").strip()
                info["raw"] += s + "\n"
                if not s:
                    continue
                try:
                    obj = json.loads(s)
                except Exception:
                    info["broken"] += 1
                    continue
                lines.append((time.monotonic() - t0, obj if isinstance(obj, dict) else {"t": None}))
    except urllib.error.HTTPError as e:
        info["http"] = e.code
    except Exception as e:
        info["http"] = "neterr:" + type(e).__name__
    info["secs"] = time.monotonic() - t0
    return lines, info


ok = bad = 0


def check(name, cond, got=""):
    """실패만 찍는다(요약은 맨 끝에)."""
    global ok, bad
    if cond:
        ok += 1
    else:
        bad += 1
        print("  실패  " + name + "  <- " + json.dumps(got, ensure_ascii=False, default=str)[:160])
    return bool(cond)


def nos_of(r):
    out = set()
    for v in (r.get("verses") or []):
        try:
            out.add(int(v.get("no")))
        except Exception:
            pass
    return out


# 서버가 「그 성도님께 보이는 묶음만」 찾는가 — 서버 agentTracksFor 와 같은 판정(naviPublic · psalmPublic 모두 === true)
#   (화면 refreshPsalmPublic 은 참 같은 값이면 연다 — 서버가 더 좁다. 서버보다 넓게 보면 서버의 잘못을 못 잡는다.)
NAVI_ON = api("getConfig", key="naviPublic").get("value") is True
PSALM_ON = api("getConfig", key="psalmPublic").get("value") is True
TRACKS_OK = {"weekly"} | ({"navi"} if NAVI_ON else set()) | ({"psalm"} if PSALM_ON else set())
KNOWN = {"weekly": nos_of(api("getVerses")),
         "navi": nos_of(api("getVerses", track="navi")),
         "psalm": nos_of(api("getVerses", track="psalm"))}   # 물가는 열린 날만 온다 — 안 열린 날 구절을 권하면 여기서 걸린다


def no_leak(label, uid, info):
    """응답 원문(답 · 단계 · 오류 · 저장된 답 · 문 닫힘 fallback 전부)에 user_id 글자도, 요청한 uid 값도 없는지.
    uid 값은 찍지 않는다 — 결과 줄에는 라벨만 남는다."""
    raw = info.get("raw", "")
    k = check(label + " 응답에 user_id 글자 없음", "user_id" not in raw, "user_id 글자")
    v = check(label + " 응답에 uid 값 없음", not uid or str(uid) not in raw, "uid 값")
    return k and v


def answer_checks(label, lines, info, uid, turn, cached):
    """답 줄 하나를 꼼꼼히 본다 → (답, 단계 줄들, 첫 줄 초, 답 줄 초) · 답이 없으면 None."""
    ts = [o.get("t") for _, o in lines]
    check(label + " HTTP 200 · NDJSON", info["http"] == 200 and "ndjson" in info["ctype"], [info["http"], info["ctype"]])
    check(label + " 깨진 줄 없음", info["broken"] == 0, info["broken"])
    no_leak(label, uid, info)   # 답이 없어도(fallback · 오류) 먼저 본다
    if not check(label + " 답 줄 하나 · fallback 없음", ts.count("answer") == 1 and "fallback" not in ts, ts):
        return None
    ia = ts.index("answer")
    a = lines[ia][1]
    steps = [o for _, o in lines[:ia] if o.get("t") == "step"]
    check(label + " 답 앞에 단계 줄", len(steps) >= 1, ts)
    check(label + " 답 줄이 마지막", ia == len(ts) - 1, ts)
    for s in steps:
        check(label + " 단계 줄 꼴(id · kind · state)",
              isinstance(s.get("id"), int) and s.get("kind") in STEP_KINDS and s.get("state") in STEP_STATES, s)
    has_cache = any(s.get("kind") == "cache" for s in steps)
    if cached:
        check(label + " 저장된 답 — cache 단계 · cached:true", has_cache and a.get("cached") is True, [ts, a.get("cached")])
    else:
        check(label + " 새 답 — cache 단계 없음 · cached 아님", not has_cache and a.get("cached") is not True, [ts, a.get("cached")])
        check(label + " 새 답 — 「답을 쓰는 중」(write) 단계", any(s.get("kind") == "write" for s in steps),
              [s.get("kind") for s in steps])
    check(label + " 한도에 안 걸림", a.get("limited") is not True, "limited")
    check(label + " 답 글 있음", isinstance(a.get("answer"), str) and a["answer"].strip() != "", "빈 답")
    check(label + " turn = %d" % turn, a.get("turn") == turn, a.get("turn"))
    vs = a.get("verses")
    if check(label + " 구절 목록 · %d개 이하" % MAX_VERSES, isinstance(vs, list) and len(vs) <= MAX_VERSES,
             len(vs) if isinstance(vs, list) else vs):
        for v in vs:
            no, tr = v.get("no"), v.get("track")
            check(label + " 구절 번호는 정수", isinstance(no, int) and not isinstance(no, bool), no)
            check(label + " 구절 묶음이 지금 보이는 것", tr in TRACKS_OK, [no, tr])
            check(label + " 구절이 개발 DB 에 있음(getVerses %s)" % tr, no in KNOWN.get(tr, set()), [no, tr])
            check(label + " 구절 장절 · 본문", bool(v.get("ref")) and bool(v.get("text")), no)
            check(label + " 구절 까닭 %d자 이하" % WHY_LEN, len(str(v.get("why") or "")) <= WHY_LEN,
                  len(str(v.get("why") or "")))
    ch = a.get("chips")
    if check(label + " 단추 %d개 이하" % MAX_CHIPS, isinstance(ch, list) and len(ch) <= MAX_CHIPS, ch):
        for c in ch:
            check(label + " 단추 글 1~%d자" % CHIP_LEN, isinstance(c, str) and c.strip() != "" and len(c) <= CHIP_LEN, c)
    sm = a.get("sermon")
    if sm is not None:
        def key(s):
            return (s.get("youtube_id"), s.get("title")) if isinstance(s, dict) else None
        check(label + " 설교 카드는 출처 목록 안의 설교",
              isinstance(sm, dict) and key(sm) in {key(s) for s in (a.get("sources") or [])},
              sm.get("title") if isinstance(sm, dict) else sm)
        check(label + " 설교 까닭 %d자 이하" % WHY_LEN, isinstance(sm, dict) and len(str(sm.get("why") or "")) <= WHY_LEN, "")
    return a, steps, lines[0][0], lines[ia][0]


def fallback_only(label, uid, msg):
    lines, info = ask(uid, msg, timeout=40)
    ts = [o.get("t") for _, o in lines]
    reason_ok = bool(lines) and isinstance(lines[0][1].get("reason"), str)
    check(label + " → fallback 한 줄뿐", info["http"] == 200 and ts == ["fallback"] and reason_ok, [info["http"], ts])
    no_leak(label, uid, info)


TAG = str(int(time.time()))[-6:]
STATE = {"runs": 0, "asked": 0}   # runs = 에이전트가 새로 돈 횟수(AI 부름이 난 것) · asked = 이 계정으로 부른 수(하루 한도 셈)


def gate(v):
    return api("saveConfig", pw=PW, key="scAgent", value=v, staff=SUPER)


def login(name):
    return api("login", type="교구", gu="에이전트스모크", mok="s" + TAG, name=name).get("user_id")


def run():
    r = gate("on")
    if not check("⓪ 개발 문 scAgent = on(관리자 문 · 총괄 통과)", r.get("ok") is True, r):
        return
    uid = login("에이전트" + TAG)
    if not check("시험 계정 만들기", bool(uid), "user_id 없음"):
        return
    print("개발 · 보이는 묶음 %s · 주간 %d · 주제별 %d · 물가 %d · 질문 %d개 · 꼬리표 #%s" % (
        "·".join(sorted(TRACKS_OK)), len(KNOWN["weekly"]), len(KNOWN["navi"]), len(KNOWN["psalm"]), N, TAG))
    first = None
    for i, q in enumerate(QUESTIONS[:N], 1):
        msg = "%s #%s" % (q, TAG)
        lines, info = ask(uid, msg)
        STATE["asked"] += 1
        res = answer_checks("Q%d" % i, lines, info, uid, turn=0, cached=False)
        if not res:
            print("  Q%d 답 없음 · %.1f초" % (i, info["secs"]))
            continue
        a, steps, t_first, t_ans = res
        STATE["runs"] += 1
        if first is None and a.get("chips"):
            first = (msg, a)
        print("  Q%d 단계 %d · 구절 %d · 설교 %s · 단추 %d · 첫 줄 %.1f초 · 답 %.1f초" % (
            i, len(steps), len(a.get("verses") or []), "있음" if a.get("sermon") else "없음",
            len(a.get("chips") or []), t_first, t_ans))
    if not check("단추가 있는 첫 답(되묻기 · 저장된 답 확인에 쓴다)", first is not None, "모든 답에 단추가 없거나 답이 없다"):
        return
    msg, a = first
    sm = a.get("sermon") if isinstance(a.get("sermon"), dict) else {}
    follow = {"chip": a["chips"][0],
              "prev_verses": [v["no"] for v in (a.get("verses") or []) if isinstance(v.get("no"), int)],
              "prev_sermon": sm.get("sermon_id"),
              "turn": 1}
    lines, info = ask(uid, msg, follow)
    STATE["asked"] += 1
    res = answer_checks("↪ 되묻기", lines, info, uid, turn=1, cached=False)
    if res:
        STATE["runs"] += 1
        print("  ↪ 되묻기 단계 %d · 구절 %d · 답 %.1f초%s" % (
            len(res[1]), len(res[0].get("verses") or []), res[3],
            " · ⚠ 설교 카드에 sermon_id 가 없어 prev_sermon 을 비워 보냈다" if sm and not sm.get("sermon_id") else ""))
    lines, info = ask(uid, msg, timeout=40)
    STATE["asked"] += 1
    res = answer_checks("📚 같은 질문 다시", lines, info, uid, turn=0, cached=True)
    if res:
        print("  📚 저장된 답 %.1f초" % res[3])
    if args.limit:
        # 저장된 답(cached:true)이 아니면 즉시 멈춘다 — 캐시가 깨졌으면 한 번마다 AI 2~5번이 나간다.
        stopped = False
        while STATE["asked"] < PER_DAY and not stopped:
            lines, info = ask(uid, msg, timeout=40)   # 저장된 답 — AI 0번
            STATE["asked"] += 1
            no_leak("한도 채우기 %d번째" % STATE["asked"], uid, info)
            last = lines[-1][1] if lines else {}
            if not check("한도 채우기 %d번째 — 저장된 답(cached:true)" % STATE["asked"],
                         last.get("t") == "answer" and last.get("cached") is True,
                         [o.get("t") for _, o in lines]):
                stopped = True
                print("  ⛔ 저장된 답이 아니어서 한도 채우기를 멈춘다(AI 부름이 났을 수 있다)")
                STATE["runs"] += 1   # 새로 돌았을 수 있으니 셈에 넣는다
        if not stopped:
            lines, info = ask(uid, "한도 확인용 새 질문이에요 #" + TAG, timeout=60)
            ts = [o.get("t") for _, o in lines]
            last = lines[-1][1] if lines else {}
            no_leak("한도 확인", uid, info)
            if not check("한도 — %d번째 새 질문은 limited" % (PER_DAY + 1),
                         ts[-1:] == ["answer"] and last.get("limited") is True, ts):
                STATE["runs"] += 1   # 한도에 안 걸렸으면 에이전트가 돌았다(AI 부름이 났다)
            else:
                print("  ⛔ 한도 %d번째에서 limited" % (PER_DAY + 1))
    gate("test")
    uid2 = login("비시험" + TAG)
    fallback_only("문 test · 시험 참여자 아닌 계정", uid2, msg)
    gate("")
    fallback_only("문 빈 값(닫힘)", uid, msg)


prev = api("getConfig", key="scAgent")
if prev.get("ok") is not True:
    print("개발 getConfig scAgent 가 안 된다(%s) — 개발 api 에 이번 판이 없다. 개발 배포(Part 2)부터." % prev.get("error"))
    sys.exit(1)
PREV = prev.get("value")
# 처음에 줄이 없었으면(null) 빈 값 "" 으로 되돌린다 — saveConfig 에 null 을 넘기면 SQL NULL 이 되어 app_config.value(not null)에 막힌다.
#   "" 도 닫힘이다(서버 scAgentGate · 화면 모두 "on" · "test" 만 연다).
RESTORE = PREV if PREV is not None else ""
try:
    run()
finally:
    back = gate(RESTORE)
    now = api("getConfig", key="scAgent").get("value")
    check("끝 — 개발 문을 처음 값으로 되돌림", back.get("ok") is True and now == RESTORE, [back.get("ok"), now, RESTORE])

print("\n통과 %d · 실패 %d · 에이전트가 새로 돈 횟수 %d번(Anthropic 부름은 대략 %d~%d번) · 문 되돌림 %s" % (
    ok, bad, STATE["runs"], STATE["runs"] * 2, STATE["runs"] * 5, json.dumps(RESTORE, ensure_ascii=False)))
sys.exit(1 if bad else 0)
