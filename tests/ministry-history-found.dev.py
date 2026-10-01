#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# 사역 이력 확인 — 「기록을 찾은 경우」를 성경암송 api 경유로 끝에서 끝까지(2026-10-01).
#   python tests/ministry-history-found.dev.py
# ⚠️ 개발만. church-admin 의 tests/history-check.dev.test.mjs(교회 어드민 내부 갈래를 직접)와
#   달리, 이 시험은 성경암송 api(login·ministryHistoryMine·ministryHistoryRequest)를 거친다 —
#   church-admin 의 DEV_SERVICE_KEY(~/.church-admin/dev.env)가 옛 모양이라 그쪽 내부 갈래
#   시험(x-internal-key)이 못 돈다. api 는 함수 자신의 SUPABASE_SERVICE_ROLE_KEY 로 church-admin
#   을 부르므로 이 경로는 돈다 — REST 호출(씨뿌리기·청소)에는 DEV_SERVICE_KEY 를 그대로 쓴다.
# 키·비번은 파일에서 읽어 이 스크립트 안에서만 쓴다(찍지 않는다):
#   ~/.church-admin/dev.env(DEV_URL·DEV_ANON·DEV_SERVICE_KEY) · .env.dev(ADMIN_SECRET — 개발 관리자 비번)
# 시험 자료: 교인ID 990000091~94 · 이름 ca-test-hcf-<STAMP>-가/나 · 기록 src_key ca-test-hcf-<STAMP>-{a,b,c,d}
#   끝나면 모두 지운다(finally).

import json
import os
import re
import sys
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone

sys.stdout.reconfigure(encoding="utf-8")

HOME = os.path.expanduser("~")
DEV_ENV = os.path.join(HOME, ".church-admin", "dev.env")
V2_ENV_DEV = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env.dev")


def read_env(path):
    out = {}
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" not in line:
                continue
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip()
    return out


dev = read_env(DEV_ENV)
v2dev = read_env(V2_ENV_DEV)
DEV_URL = dev.get("DEV_URL", "")
DEV_ANON = dev.get("DEV_ANON", "")
DEV_SERVICE_KEY = dev.get("DEV_SERVICE_KEY", "")
ADMIN_PW = v2dev.get("ADMIN_SECRET", "")

if "ktpwthwqzgcqcrmsafdo" not in DEV_URL:
    print("개발 주소가 아니다 — 멈춤")
    sys.exit(1)
if not DEV_ANON or not DEV_SERVICE_KEY or not ADMIN_PW:
    print("필요한 키가 비어 있다 — 멈춤")
    sys.exit(1)

API = DEV_URL + "/functions/v1/api"
REST = DEV_URL + "/rest/v1/"

STAMP = str(int(time.time()))
NAME = f"ca-test-hcf-{STAMP}-가"
TWIN = f"ca-test-hcf-{STAMP}-나"
IDS = [990000091, 990000092, 990000093, 990000094]

# 교회 어드민 history-check.ts HISTORY_OUT_KEYS·REQUEST_OUT_KEYS 와 같다(api mhRowOut·mhReqOut) —
#   직분(position)은 줄에 없다 · committee_text 는 빠진 사역 「부서」 칸(2026-10-02 두 칸 · null 이면 옛 한 칸 신청)
HISTORY_KEYS = {"committee", "id", "role_title", "team", "year"}
REQUEST_KEYS = {"answer", "committee_text", "created_at", "detail", "history_id", "id", "kind", "status", "team_text", "year"}
UUID_RE = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.I)

passed = 0
failed = 0


def ok(label, cond, extra=""):
    global passed, failed
    if cond:
        passed += 1
        print(f"  ✓ {label}")
    else:
        failed += 1
        print(f"  ✗ {label}  {extra}")


def http(method, url, headers, data=None):
    body = json.dumps(data).encode("utf-8") if data is not None else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=20) as res:
            raw = res.read()
            status = res.status
    except urllib.error.HTTPError as e:
        raw = e.read()
        status = e.code
    try:
        parsed = json.loads(raw.decode("utf-8"))
    except Exception:
        parsed = {"raw": raw.decode("utf-8", "replace")}
    return status, parsed, raw.decode("utf-8", "replace")


def call_api(body):
    headers = {"Content-Type": "application/json", "apikey": DEV_ANON, "Authorization": f"Bearer {DEV_ANON}"}
    status, parsed, raw = http("POST", API, headers, body)
    return parsed, raw


def rest_headers():
    h = {"apikey": DEV_SERVICE_KEY, "Content-Type": "application/json", "Prefer": "return=representation"}
    if not DEV_SERVICE_KEY.startswith("sb_secret_"):
        h["Authorization"] = f"Bearer {DEV_SERVICE_KEY}"
    return h


def rest(method, path, data=None):
    status, parsed, raw = http(method, REST + path, rest_headers(), data)
    if status >= 300:
        raise RuntimeError(f"{method} {path} {status} {raw}")
    return parsed


def login(gu, mok, name):
    j, raw = call_api({"action": "login", "type": "교구", "gu": gu, "mok": mok, "name": name})
    uid = j.get("user_id") if isinstance(j, dict) else None
    if not uid:
        raise RuntimeError(f"로그인 실패({gu} {mok} {name}): {raw}")
    return uid


def mine(uid):
    j, raw = call_api({"action": "ministryHistoryMine", "user_id": uid, "pw": ADMIN_PW})
    return j, raw


def request(uid, **kw):
    body = {"action": "ministryHistoryRequest", "user_id": uid, "pw": ADMIN_PW, **kw}
    j, raw = call_api(body)
    return j, raw


U1 = U2 = U3 = None
hist = {}

try:
    # ---- 씨뿌리기 ----
    print("[씨뿌리기]")
    person = lambda pid, name, mok1, mok3: {
        "person_id": pid, "name": name, "name_key": name, "mok1": mok1, "mok3": mok3, "kind2": "장년",
    }
    rest("POST", "church_people", [
        person(IDS[0], NAME, "기쁨", "기쁨-12목장"),
        person(IDS[1], NAME, "소망", "소망-3목장"),
        person(IDS[2], TWIN, "기쁨", "기쁨-12목장"),
        person(IDS[3], TWIN, "기쁨", "기쁨-12목장"),
    ])

    def h(k, **o):
        row = {
            "src_key": f"ca-test-hcf-{STAMP}-{k}", "name": NAME, "year": 0, "committee": "", "team": "",
            "role_title": "", "position": "", "mok": "", "person_id": None, "deleted_at": None,
        }
        row.update(o)
        return row

    rows = rest("POST", "ministry_history", [
        h("a", year=2025, committee="찬양위원회", team="시온성가대", position="집사", person_id=IDS[0], mok="기쁨-12"),
        h("b", year=2026, committee="교육위원회", team="유년부", role_title="교사", position="집사", person_id=IDS[0]),
        h("c", year=2024, committee="봉사위원회", team="주차팀", person_id=IDS[0],
          deleted_at=datetime.now(timezone.utc).isoformat()),
        h("d", year=2026, committee="찬양위원회", team="호산나찬양대", position="권사", person_id=IDS[1]),
    ])
    for r in rows:
        hist[r["src_key"].split("-")[-1]] = r["id"]
    print(f"  기록 줄 id: {hist}")

    U1 = login("기쁨", "12", NAME)
    U2 = login("기쁨", "12", TWIN)
    U3 = login("기쁨", "99", NAME)
    print(f"  로그인 끝(U1·U2·U3 확보)")

    # ---- 1. U1 Mine ----
    print("[1. U1 내 이력 — 찾음]")
    j1, raw1 = mine(U1)
    ok("ok True", j1.get("ok") is True, raw1)
    ok("found True", j1.get("found") is True, raw1)
    row_ids = [r.get("id") for r in j1.get("rows", [])]
    ok("row ids == [b, a]", row_ids == [hist.get("b"), hist.get("a")], f"got {row_ids} want [{hist.get('b')}, {hist.get('a')}]")
    ok("모든 줄 칸이 정확히 HISTORY_OUT_KEYS",
       all(set(r.keys()) == HISTORY_KEYS for r in j1.get("rows", [])),
       [sorted(r.keys()) for r in j1.get("rows", [])])
    ok("requests == []", j1.get("requests") == [], j1.get("requests"))
    leaked_id = next((str(i) for i in IDS if str(i) in raw1), None)
    ok("교인ID 가 새지 않음", leaked_id is None, leaked_id)
    ok("「기쁨-12」(그때 목장) 가 새지 않음", "기쁨-12" not in raw1, raw1)

    # ---- 2. U2/U3 Mine (찾지 못함) ----
    print("[2. U2(동명이인 목장)·U3(다른 목장) — 찾지 못함]")
    j2, raw2 = mine(U2)
    ok("U2 found False", j2.get("found") is False, raw2)
    ok("U2 rows []", j2.get("rows") == [], j2.get("rows"))
    j3, raw3 = mine(U3)
    ok("U3 found False", j3.get("found") is False, raw3)
    ok("U3 rows []", j3.get("rows") == [], j3.get("rows"))

    # ---- 3. U1 정정 신청 ----
    print("[3. U1 정정 신청 — 성공·already-open·not-yours·already-found·need-detail]")
    r1, raw_r1 = request(U1, kind="wrong_team", history_id=hist["a"], detail="그해엔 호산나찬양대였어요")
    ok("wrong_team on a → ok", r1 == {"ok": True}, raw_r1)
    r2, _ = request(U1, kind="not_mine", history_id=hist["a"])
    ok("not_mine on a(이미 열림) → already-open", r2.get("error") == "already-open", r2)
    r3, _ = request(U1, kind="not_mine", history_id=hist["d"])
    ok("not_mine on d(남의 줄) → not-yours", r3.get("error") == "not-yours", r3)
    r4, _ = request(U1, kind="not_mine", history_id=hist["c"])
    ok("not_mine on c(빼 둔 줄) → not-yours", r4.get("error") == "not-yours", r4)
    r5, _ = request(U1, kind="find_me")
    ok("find_me(이미 찾음) → already-found", r5.get("error") == "already-found", r5)
    r6, _ = request(U1, kind="other", history_id=hist["b"], detail="")
    ok("other on b(빈 detail) → need-detail", r6.get("error") == "need-detail", r6)
    # 옛 한 칸(committee_text 를 안 보냄 — 옛 캐시 앱) · 두 칸(2026-10-02 · 부서 committee_text + 팀 team_text)
    r7, raw_r7 = request(U1, kind="missing", year=2023, team_text="찬양위원회 시온성가대")
    ok("missing 2023(한 칸) → ok", r7 == {"ok": True}, raw_r7)
    r7b, raw_r7b = request(U1, kind="missing", year=2022, committee_text="찬양위원회", team_text="호산나찬양대")
    ok("missing 2022(두 칸) → ok", r7b == {"ok": True}, raw_r7b)
    r7c, _ = request(U1, kind="missing", year=2021, committee_text=" ", team_text="")
    ok("missing 두 칸이 모두 비면 → need-team", r7c.get("error") == "need-team", r7c)

    # ---- 4. U1 Mine 다시 — 신청 현황 ----
    print("[4. U1 내 이력 다시 — 신청 현황]")
    j4, raw4 = mine(U1)
    kinds = [r.get("kind") for r in j4.get("requests", [])]
    ok("request kinds == [missing, missing, wrong_team]", kinds == ["missing", "missing", "wrong_team"], kinds)
    ok("모든 신청 칸이 정확히 REQUEST_OUT_KEYS",
       all(set(r.keys()) == REQUEST_KEYS for r in j4.get("requests", [])),
       [sorted(r.keys()) for r in j4.get("requests", [])])
    ok("모든 신청 status == 신청", all(r.get("status") == "신청" for r in j4.get("requests", [])), j4.get("requests"))
    by_year = {r.get("year"): r for r in j4.get("requests", []) if r.get("kind") == "missing"}
    two, one = by_year.get(2022, {}), by_year.get(2023, {})
    ok("두 칸 신청(2022) — committee_text 찬양위원회 · team_text 호산나찬양대(나누거나 합치지 않음)",
       two.get("committee_text") == "찬양위원회" and two.get("team_text") == "호산나찬양대", two)
    ok("한 칸 신청(2023) — committee_text None · team_text 그대로",
       "committee_text" in one and one.get("committee_text") is None and one.get("team_text") == "찬양위원회 시온성가대", one)
    wt = next((r for r in j4.get("requests", []) if r.get("kind") == "wrong_team"), {})
    ok("다른 종류(wrong_team) — committee_text None", "committee_text" in wt and wt.get("committee_text") is None, wt)
    ok("uuid 모양 문자열 없음", not UUID_RE.search(raw4), raw4)

    # ---- 5. U3 — 찾지 못한 분 ----
    print("[5. U3(찾지 못함) — not-found·find_me·already-open]")
    r8, _ = request(U3, kind="not_mine", history_id=hist["a"])
    ok("U3 not_mine on a → not-found", r8.get("error") == "not-found", r8)
    r9, raw_r9 = request(U3, kind="find_me", detail="목장이 바뀌었어요")
    ok("U3 find_me → ok", r9 == {"ok": True}, raw_r9)
    r10, _ = request(U3, kind="find_me")
    ok("U3 find_me 두 번째 → already-open", r10.get("error") == "already-open", r10)

finally:
    # ---- 청소 ---- 하나가 실패해도 나머지는 계속 지운다(끝에 남은 개수로 결과를 본다)
    print("[청소]")
    uids = [u for u in (U1, U2, U3) if u]

    def safe_delete(label, path):
        try:
            rest("DELETE", path)
        except Exception as e:
            print(f"  ⚠ 청소 실패({label}): {e}")

    def safe_count(label, path):
        try:
            return len(rest("GET", path))
        except Exception as e:
            print(f"  ⚠ 확인 실패({label}): {e}")
            return -1

    if uids:
        safe_delete("신청", f"ministry_history_requests?user_id=in.({','.join(uids)})")
    safe_delete("기록", f"ministry_history?src_key=like.ca-test-hcf-{STAMP}-*")
    safe_delete("교인", f"church_people?person_id=in.({','.join(str(i) for i in IDS)})")
    if uids:
        safe_delete("계정", f"users?id=in.({','.join(uids)})")

    # 확인 — 다 지워졌는지 0행인지 본다
    left_req = safe_count("신청", f"ministry_history_requests?select=id&user_id=in.({','.join(uids)})") if uids else 0
    left_hist = safe_count("기록", f"ministry_history?select=id&src_key=like.ca-test-hcf-{STAMP}-*")
    left_people = safe_count("교인", f"church_people?select=person_id&person_id=in.({','.join(str(i) for i in IDS)})")
    left_users = safe_count("계정", f"users?select=id&id=in.({','.join(uids)})") if uids else 0
    print(f"  남은 신청 {left_req} · 남은 기록 {left_hist} · 남은 교인 {left_people} · 남은 계정 {left_users}")

print(f"통과 {passed} · 실패 {failed}")
sys.exit(1 if failed else 0)
