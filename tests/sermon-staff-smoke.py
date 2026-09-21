# -*- coding: utf-8 -*-
"""설교·찬양 담당자 권한 스모크 — **개발 DB 전용**(운영에서 돌리지 말 것).

    ADMIN_PW=<개발 관리자 암호> STAFF_PW=<설교·찬양 암호> python tests/sermon-staff-smoke.py

⚠️ 암호를 이 파일에 적지 않는다(공개 저장소). 환경 변수로만 받는다.
⚠️ 한글은 파이썬이 UTF-8 로 보낸다 — 명령줄 curl 에 한글을 쓰면 깨져서 서버 버그로 오인한다.
시험용 담당자: 개발 DB 의 「교구 사랑 1목장 사역담당시험」(사역신청 시험에도 쓰는 분).
"""
import json, os, sys, urllib.request, urllib.error
try: sys.stdout.reconfigure(encoding="utf-8")
except Exception: pass

BASE = "https://ktpwthwqzgcqcrmsafdo.supabase.co/functions/v1/api"
KEY = "sb_publishable_eJKP6u95IU9_DBXTvnvYBA_-yGCf-0Y"
ADMIN, STAFF = os.environ["ADMIN_PW"], os.environ["STAFF_PW"]
ME = {"type": "교구", "gu": "사랑", "mok": "1", "name": "사역담당시험"}
ME_KEY = "교구|사랑|1|||사역담당시험"
NOBODY = {"type": "교구", "gu": "사랑", "mok": "1", "name": "없는사람시험"}

def call(p):
    req = urllib.request.Request(BASE, data=json.dumps(p).encode("utf-8"),
        headers={"Content-Type": "application/json", "apikey": KEY, "Authorization": "Bearer " + KEY})
    try:
        with urllib.request.urlopen(req) as r: return json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return json.loads(e.read() or b"{}")

fails = 0
def chk(name, got, want):
    global fails
    ok = got == want
    fails += 0 if ok else 1
    print(("  o " if ok else "  X ") + name + " = " + repr(got) + ("" if ok else "   (기대 " + repr(want) + ")"))

# 준비: 시험 담당자를 설교·찬양 명단에 넣는다(여러 번 돌려도 같다)
r = call({"action": "staffAdminsSave", "pw": ADMIN, "role": "content", "op": "add", "key": ME_KEY})
chk("명단에 넣기", r.get("ok"), True)

print("[1] 로그인")
chk("틀린 암호", call({"action": "contentAuth", "pw": "wrong", "staff": ME}).get("error"), "unauthorized")
chk("맞는 암호 + 등록 안 된 분", call({"action": "contentAuth", "pw": STAFF, "staff": NOBODY}).get("error"), "unauthorized")
chk("맞는 암호 + 등록된 분", call({"action": "contentAuth", "pw": STAFF, "staff": ME}).get("role"), "content")
chk("관리자 암호", call({"action": "contentAuth", "pw": ADMIN}).get("role"), "admin")
chk("목장 「1목장」으로 적어도", call({"action": "contentAuth", "pw": STAFF, "staff": dict(ME, mok="1목장")}).get("role"), "content")

print("[2] 설교·찬양 암호로 막혀야 하는 것")
S = {"pw": STAFF, "staff": ME}
for a, extra in [("authCheck", {}), ("stats", {}), ("sendPush", {"title": "x", "body": "x"}),
                 ("saveVerse", {"verse": {"no": 9999}}), ("sermonDelete", {"id": "AAAAAAAAAAA"}),
                 ("sermonJobGet", {"id": 1}), ("sermonJobUpdate", {"id": 1, "step": "notes"}),
                 ("staffAdminsSave", {"role": "content", "op": "add", "key": ME_KEY}),
                 ("ministryList", {}), ("adminFindMembers", {"query": "x"})]:
    chk(a, call(dict(S, action=a, **extra)).get("error"), "unauthorized")
print("[3] 사역 암호와 섞이지 않는다")
chk("설교 암호로 ministryAuth", call(dict(S, action="ministryAuth")).get("error"), "unauthorized")

print("[4] 담당자에게 열린 것")
r = call(dict(S, action="sermonStaffList"))
chk("sermonStaffList", r.get("ok"), True)
chk("응답에 user_id 없음", "user_id" in json.dumps(r), False)
chk("sermonJobs", call(dict(S, action="sermonJobs")).get("ok"), True)
print("[5] 검사")
J = {"videoId": "AAAAAAAAAAA", "title": "시험", "date": "2026-09-20", "category": "주일설교",
     "preacher": "차동혁 위임목사", "transcript": "가" * 1200}
chk("영상 번호", call(dict(S, action="sermonJobCreate", job=dict(J, videoId="bad"))).get("error"), "bad-video")
chk("구분", call(dict(S, action="sermonJobCreate", job=dict(J, category="없는구분"))).get("error"), "bad-category")
chk("짧은 자막", call(dict(S, action="sermonJobCreate", job=dict(J, transcript="가" * 50))).get("error"), "short-transcript")
# ⚠️ 번호는 999 아래로 — 1000 넘는 번호는 링크를 보기 전에 bad-no 로 막힌다(아래). 링크 검사는 DB 를 읽기 전이라 아무것도 안 쓴다.
chk("구절 링크 꼴", call(dict(S, action="staffVerseSave", verse={"no": 998, "refShort": "시험", "text": "시험", "url": "https://example.com"})).get("error"), "bad-url")
chk("구절 번호 1001(쉴만한 물가 줄)", call(dict(S, action="staffVerseSave", verse={"no": 1001, "refShort": "시험", "text": "시험"})).get("error"), "bad-no")
chk("새 구절인데 있는 번호(1)", call(dict(S, action="staffVerseSave", verse={"no": 1, "refShort": "시험", "text": "시험", "isNew": True})).get("error"), "exists")
chk("역할 이름 constructor", call({"action": "staffAdmins", "pw": ADMIN, "role": "constructor"}).get("error"), "invalid")
chk("역할 이름 constructor(저장)", call({"action": "staffAdminsSave", "pw": ADMIN, "role": "constructor", "op": "add", "key": ME_KEY}).get("error"), "invalid")
print("[6] 찬양 함수가 묻는 길")
chk("staffVerify 담당자", call({"action": "staffVerify", "role": "content", "pw": STAFF, "staff": ME}).get("ok"), True)
chk("staffVerify 틀린 암호", call({"action": "staffVerify", "role": "content", "pw": "wrong", "staff": ME}).get("error"), "unauthorized")
chk("staffVerify 다른 역할", call({"action": "staffVerify", "role": "ministry", "pw": STAFF, "staff": ME}).get("error"), "invalid")

print("\n실패 %d" % fails)
sys.exit(1 if fails else 0)
