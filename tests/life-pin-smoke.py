#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""교회 생활 확인 번호 — 개발 스모크 (Plan 1 Task 6)

    EVT_ENV=dev  (기본)  ·  ADMIN_SECRET + SMOKE_SUPER 를 환경에 둬야 한다(관리자 문이 켜진 뒤로 saveConfig 는 「암호+총괄」)
      · SMOKE_SUPER = 개발 super 관리자 JSON({"type","gu","mok","name"}) · .env.dev 에 단일인용으로(커밋 안 됨)
    set -a; . ./.env.dev; set +a; python tests/life-pin-smoke.py

⚠️ 개발만. app_config.lifePin 을 on/test 로 바꿨다가 **off 로 되돌린다**(운영엔 돌리지 말 것).
   시험 계정은 매번 다른 이름이라 안 겹친다(개발 DB 에 줄이 조금 남는다 — 개발은 버려도 되는 DB).
끝 코드: 실패가 있으면 1.
"""
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

ENV = os.environ.get("EVT_ENV", "dev")
URL = ("https://xnomlgydifiqiybervtf.supabase.co" if ENV == "prod"
       else "https://ktpwthwqzgcqcrmsafdo.supabase.co")
ANON = ("sb_publishable_oLtieT_jw7Gjb8etEsy0jw_thBaDjl-" if ENV == "prod"
        else "sb_publishable_eJKP6u95IU9_DBXTvnvYBA_-yGCf-0Y")
PW = os.environ.get("ADMIN_SECRET", "")
DEV64 = "f" * 64

if ENV == "prod":
    print("운영에는 돌리지 않는다(app_config 를 바꾼다)."); sys.exit(1)
if not PW:
    print("ADMIN_SECRET 가 환경에 없다 — set -a; . ./.env.dev; set +a 뒤 다시."); sys.exit(1)


def api(action, **kw):
    req = urllib.request.Request(URL + "/functions/v1/api", method="POST",
        headers={"apikey": ANON, "Authorization": "Bearer " + ANON, "Content-Type": "application/json"},
        data=json.dumps({"action": action, **kw}).encode("utf-8"))
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        try:
            return json.loads(e.read())
        except Exception:
            return {"http": e.code}


# 관리자 문(2026-10-08)이 켜진 뒤로 saveConfig 는 「암호 + 총괄 본인」이라야 통과한다.
# 개발 super 관리자를 .env.dev 의 SMOKE_SUPER(JSON)로 둔다 — 공개 저장소에 이름을 박지 않으려고.
SUPER = None
try:
    SUPER = json.loads(os.environ.get("SMOKE_SUPER", "") or "null")
except Exception:
    SUPER = None


def switch(v):
    return api("saveConfig", pw=PW, key="lifePin", value=v, staff=SUPER)


ok = bad = 0
def check(name, cond, got=""):
    global ok, bad
    if cond:
        ok += 1
    else:
        bad += 1
    print(("  통과  " if cond else "  실패  ") + name + ("" if cond else "  <- " + json.dumps(got, ensure_ascii=False)[:200]))


tag = str(int(time.time()))[-6:]
def login(name):
    return api("login", type="교구", gu="확인번호스모크", mok="s" + tag, name=name).get("user_id")


try:
    if not SUPER:
        print("⚠ SMOKE_SUPER 가 .env.dev 에 없다 — 관리자 문 때문에 스위치가 안 켜진다. 개발 super 를 JSON 으로 넣어 주세요."); sys.exit(1)
    sw0 = switch("on")
    check("⓪ 스위치 on(관리자 문·총괄 통과)", sw0.get("ok") is True, sw0)
    uid = login("정하기" + tag)
    check("시험 계정", bool(uid), uid)

    check("① 번호 없음 → new", api("lifeGate", user_id=uid).get("state") == "new")
    r = api("lifePinSet", user_id=uid, pin="1234")
    dev1 = r.get("device")
    check("② 정하기 → ok · device 64자", r.get("ok") and isinstance(dev1, str) and len(dev1) == 64, r)
    check("③ 또 정하기 → already-set", api("lifePinSet", user_id=uid, pin="1234").get("error") == "already-set")
    check("④ 이 기기 → ok", api("lifeGate", user_id=uid, device=dev1).get("state") == "ok")
    check("⑤ 다른 기기 → ask", api("lifeGate", user_id=uid, device=DEV64).get("state") == "ask")
    w = api("lifePinCheck", user_id=uid, pin="0000")
    check("⑥ 틀림 → wrong · left 4", w.get("error") == "wrong" and w.get("left") == 4, w)
    c = api("lifePinCheck", user_id=uid, pin="1234")
    dev2 = c.get("device")
    check("⑦ 맞음 → ok · 새 device · fails 리셋", c.get("ok") and len(dev2 or "") == 64, c)
    # 다섯 번 틀려 잠금
    last = None
    for _ in range(5):
        last = api("lifePinCheck", user_id=uid, pin="0000")
    check("⑧ 다섯 번 틀림 → locked", last.get("error") == "locked", last)
    check("⑨ 잠긴 뒤 gate → locked", api("lifeGate", user_id=uid, device=dev2).get("state") == "locked")

    # 문(lifeError): 확인된 기기만 — 안 잠긴 새 계정으로
    uid2 = login("문" + tag)
    dev = api("lifePinSet", user_id=uid2, pin="5678").get("device")   # 정하면서 이 기기가 확인된다
    check("⑩ 문: pilsaMine 기기 없음 → pin-needed", api("pilsaMine", user_id=uid2).get("error") == "pin-needed", api("pilsaMine", user_id=uid2))
    check("⑪ 문: pilsaMine 기기 있음 → 통과", api("pilsaMine", user_id=uid2, device=dev).get("ok") is True)
    check("⑫ 문(복합): ministryApply 기기 없음 → pin-needed(기간보다 먼저)",
          api("ministryApply", user_id=uid2, choices=[1], phone="010-0000-0000", position="성도").get("error") == "pin-needed")
    check("⑬ lifeResetRequest → ok · 또 → already",
          api("lifeResetRequest", user_id=uid2).get("ok") and api("lifeResetRequest", user_id=uid2).get("already"))
    check("⑭ 응답에 pin_hash·token_hash·user_id 안 샘",
          not any(k in json.dumps(api("lifeGate", user_id=uid2, device=dev)) for k in ("pin_hash", "token_hash", "user_id")))

    # ── Plan 5 — 연락처 · 번호 가리기 (스위치 on · uid2 는 확인된 기기 dev) ──
    check("⑰ 연락처: 기기 없음 → pin-needed",
          api("lifeContactSave", user_id=uid2, phone="010-1234-5678").get("error") == "pin-needed")
    check("⑱ 연락처: 기기 있음 → ok",
          api("lifeContactSave", user_id=uid2, device=dev, phone="010-1234-5678").get("ok") is True)
    # 사역: 확인된 기기면 lifeError 통과 — pin-needed·번호형식 오류가 아니다(기간 닫혀 '기간 아님'이 나와도 됨)
    ma = api("ministryApply", user_id=uid2, device=dev, choices=[1], position="성도")
    check("⑲ 사역(확인된 기기): 번호 없이도 pin-needed·번호오류 아님",
          ma.get("error") not in ("pin-needed", "휴대폰 번호를 확인해 주세요 (010-1234-5678)"), ma)
    # 필사 「내 신청」 번호 가리기
    api("pilsaApply", user_id=uid2, device=dev, name="가림" + tag,
        size="A4", type1="개역개정", type2="개역개정", qtys={"신약": 1}, phone="010-9876-5432")
    pm = api("pilsaMine", user_id=uid2, device=dev)
    check("⑳ 필사 내 신청 번호 가림 010-****-5432",
          (pm.get("order") or {}).get("phone") == "010-****-5432", pm)

    # 스위치 test + 비시험 계정 → 자물쇠 꺼짐(안 막음)
    switch("test")
    uid3 = login("비시험" + tag)
    check("⑮ test·비시험 → gate off", api("lifeGate", user_id=uid3).get("state") == "off")
    check("⑯ test·비시험: pilsaMine 기기 없이 통과(안 막음)", api("pilsaMine", user_id=uid3).get("ok") is True)
finally:
    switch("off")

print("\n통과 %d · 실패 %d%s" % (ok, bad, " · 스위치 off 로 되돌림" if True else ""))
sys.exit(1 if bad else 0)
