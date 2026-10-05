#!/usr/bin/env bash
# 교육신청 성도님 api — 개발 DB 끝까지 시험(쓰기 포함). ⚠️ 개발 전용: users 가 200 이상이면 거부한다.
#   bash tests/edu-e2e.dev.sh
# 준비: supabase CLI 로그인. 작업 폴더(E2E_WORKDIR)가 없으면 임시로 만들어 개발에 link 한다.
# 하는 일: eduOpen 을 켜고(끝나면 원래대로) 시험 강좌(정원 1)를 만들어 신청·대기·취소·반려 유지·마감을 돌린 뒤 강좌를 지운다.
#          출석(2단계): SQL edu_attendance_set 으로 칸을 쓰고 eduMine 의 attend · eduCourse 회차의 myState(내 것만)를 본다.
#          수료(3단계): SQL edu_issue_certs 로 번호를 주고 eduMine·eduList·eduCourse 의 certNo · eduCert(내 줄만) · eduVerify(가린 이름) ·
#                      취소(edu_revoke_cert) 뒤 revoked · 되살림(같은 번호)을 본다. 그 해 번호 차례(edu_cert_seq)는 끝나면 시작 전 값으로 되돌린다.
#                      번호의 「고척」은 본문에 JSON 이스케이프(GC — 백슬래시 u 넷)로 적는다(한글 글자를 curl 에 넘기지 않는다).
#          알림(4단계): 6) 에서 대기 분이 올라가면 api 가 안에서 확정 알림을 한 번(edu_notify_log 한 줄 · push_log 한 줄) — 끝나면 그 push_log 줄도 지운다.
#                      알림 자체의 시험은 tests/edu-notify.dev.sh.
# ⚠️ 본문에 한글을 쓰지 않는다(curl 이 깨뜨린다) — id 만 보낸다. 키·비밀번호는 찍지 않는다.
set -u
REF=ktpwthwqzgcqcrmsafdo
BASE="https://$REF.supabase.co/functions/v1/api"
KEY="sb_publishable_eJKP6u95IU9_DBXTvnvYBA_-yGCf-0Y"

W="${E2E_WORKDIR:-}"
if [ -z "$W" ]; then
  W=$(mktemp -d); mkdir -p "$W/supabase"
  supabase --workdir "$W" link --project-ref "$REF" >/dev/null 2>&1 || { echo "link 실패"; exit 2; }
fi

# SQL 한 줄 -> 첫 행 첫 칸(없으면 빈 문자열)
sq() {
  supabase --workdir "$W" db query --linked "$1" 2>/dev/null | PYTHONIOENCODING=utf-8 python -c '
import json, sys
t = sys.stdin.read()
d, _ = json.JSONDecoder().raw_decode(t[t.index("{"):])
r = d.get("rows") or []
print("" if not r else list(r[0].values())[0] if list(r[0].values())[0] is not None else "")
'
}
sx() { supabase --workdir "$W" db query --linked "$1" >/dev/null 2>&1; }
call() {
  curl -s -X POST "$BASE" -H "Content-Type: application/json" -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -d "$1"
}
jqn() {
  PYTHONIOENCODING=utf-8 python -c '
import json, sys
d = json.load(sys.stdin)
print(eval(sys.argv[1]))
' "$1" <<< "$2"
}
pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then echo "  PASS $1 = $2"; pass=$((pass+1)); else echo "  FAIL $1 = $2 (expected $3)"; fail=$((fail+1)); fi; }

N=$(sq "select count(*) from users")
if [ -z "$N" ] || [ "$N" -ge 200 ]; then echo "users=$N — 개발이 아닌 것 같다. 중단."; exit 2; fi
echo "dev users=$N"

OLD_STATE=""; OLD_VAL=""; CID=""; YEAR=""; SEQ_OLD=""; TAG=""
cleanup() {
  # 출석 → 신청 줄(on delete restrict · 알림 기록 edu_notify_log 는 cascade) → 강좌(회차는 cascade · 출석이 남아 있으면 회차가 restrict 로 막는다)
  [ -n "$CID" ] && sx "delete from edu_attendance where enrollment_id in (select id from edu_enrollments where course_id='$CID'); delete from edu_enrollments where course_id='$CID'; delete from edu_courses where id='$CID'"
  # 6) 에서 대기 분이 올라가며 생긴 교육 알림 push_log 줄(4단계 · 개발 사용자는 기기가 없어 total 0 줄)
  [ -n "$TAG" ] && sx "delete from push_log where mode in ('edu-confirmed','edu-first-day') and body like '%$TAG%'"
  # 수료번호 차례 — 개발에서만 시작 전 값으로(시험 번호 줄은 위에서 지웠다)
  if [ -n "$SEQ_OLD" ]; then
    if [ "$SEQ_OLD" = "none" ]; then sx "delete from edu_cert_seq where year=$YEAR"; else sx "update edu_cert_seq set last=$SEQ_OLD where year=$YEAR"; fi
  fi
  if [ "$OLD_STATE" = "missing" ]; then sx "delete from app_config where key='eduOpen'"
  elif [ "$OLD_STATE" = "had" ]; then sx "update app_config set value='$OLD_VAL'::jsonb where key='eduOpen'"; fi
}
trap cleanup EXIT

if [ "$(sq "select count(*) from app_config where key='eduOpen'")" = "0" ]; then OLD_STATE=missing
else OLD_VAL=$(sq "select value::text from app_config where key='eduOpen'"); OLD_STATE=had; fi
echo "eduOpen 원래: $OLD_STATE ${OLD_VAL}"
sx "insert into app_config(key,value) values('eduOpen','true'::jsonb) on conflict (key) do update set value='true'::jsonb"

TAG=e2e$RANDOM$RANDOM
CID=$(sq "insert into edu_courses(title,kind,term,capacity,mode,waitlist,apply_from,apply_to,status) values ('$TAG','lecture','$TAG',1,'auto',true,edu_today()-1,edu_today()+30,'open') returning id")
[ -n "$CID" ] || { echo "강좌 만들기 실패"; exit 2; }
sx "insert into edu_sessions(course_id,no,on_date) values ('$CID',1,edu_today()+4),('$CID',2,edu_today()+7)"
U1=$(sq "select id from users where coalesce(name,'')<>'' order by created_at limit 1 offset 0")
U2=$(sq "select id from users where coalesce(name,'')<>'' order by created_at limit 1 offset 1")
U3=$(sq "select id from users where coalesce(name,'')<>'' order by created_at limit 1 offset 2")
[ -n "$U1" ] && [ -n "$U2" ] && [ -n "$U3" ] || { echo "사용자 셋을 못 골랐다"; exit 2; }
echo "course=$CID"

echo "2) eduApply U1,U2,U3"
A1=$(call "{\"action\":\"eduApply\",\"user_id\":\"$U1\",\"id\":\"$CID\"}")
chk "U1 status" "$(jqn 'd.get("status")' "$A1")" "confirmed"
A2=$(call "{\"action\":\"eduApply\",\"user_id\":\"$U2\",\"id\":\"$CID\"}")
chk "U2 status" "$(jqn 'd.get("status")' "$A2")" "waitlisted"
chk "U2 waitNo" "$(jqn 'd.get("waitNo")' "$A2")" "1"
A3=$(call "{\"action\":\"eduApply\",\"user_id\":\"$U3\",\"id\":\"$CID\"}")
chk "U3 status" "$(jqn 'd.get("status")' "$A3")" "waitlisted"
chk "U3 waitNo" "$(jqn 'd.get("waitNo")' "$A3")" "2"

echo "3) eduList U3"
L=$(call "{\"action\":\"eduList\",\"user_id\":\"$U3\"}")
chk "counts" "$(jqn '[ (c["confirmed"],c["waitlisted"]) for c in d["courses"] if c["id"]=="'$CID'"]' "$L")" "[(1, 2)]"
chk "open" "$(jqn 'd.get("open")' "$L")" "True"
NOLEAK=$(printf '%s' "$L" | grep -c -e "$U1" -e "$U2" -e "$U3" -e "ident_key")
chk "no ids / ident_key in response" "$NOLEAK" "0"

echo "4) eduMine U3"
M3=$(call "{\"action\":\"eduMine\",\"user_id\":\"$U3\"}")
chk "waitNo" "$(jqn '[m["waitNo"] for m in d["mine"] if m["courseId"]=="'$CID'"]' "$M3")" "[2]"
chk "canCancel" "$(jqn '[m["canCancel"] for m in d["mine"] if m["courseId"]=="'$CID'"]' "$M3")" "[True]"

E1=$(sq "select id from edu_enrollments where course_id='$CID' and user_id='$U1'")
E3=$(sq "select id from edu_enrollments where course_id='$CID' and user_id='$U3'")
echo "5) cancel U1's row as U2"
chk "not-found" "$(jqn 'd.get("error")' "$(call "{\"action\":\"eduCancel\",\"user_id\":\"$U2\",\"enrollment_id\":$E1}")")" "not-found"

echo "6) cancel own row"
C1=$(call "{\"action\":\"eduCancel\",\"user_id\":\"$U1\",\"enrollment_id\":$E1}")
chk "ok" "$(jqn 'd.get("ok")' "$C1")" "True"
chk "promoted" "$(jqn 'd.get("promoted")' "$C1")" "True"
M2=$(call "{\"action\":\"eduMine\",\"user_id\":\"$U2\"}")
chk "U2 confirmed" "$(jqn '[m["status"] for m in d["mine"] if m["courseId"]=="'$CID'"]' "$M2")" "['confirmed']"
M3=$(call "{\"action\":\"eduMine\",\"user_id\":\"$U3\"}")
chk "U3 waitNo" "$(jqn '[m["waitNo"] for m in d["mine"] if m["courseId"]=="'$CID'"]' "$M3")" "[1]"
# 4단계 — 올라간 U2 께 「자리가 나서 … 확정」 알림이 api 안에서 한 번(기록 한 줄 · push_log 한 줄 · U1 의 즉시 확정은 알림 없음)
chk "U2 promoted -> confirmed notify log" "$(sq "select count(*)||':'||min(kind) from edu_notify_log where enrollment_id=(select id from edu_enrollments where course_id='$CID' and user_id='$U2')")" "1:confirmed"
chk "U1 (instant confirm) no notify log" "$(sq "select count(*) from edu_notify_log where enrollment_id=$E1")" "0"
chk "one edu-confirmed push_log row for this course" "$(sq "select count(*) from push_log where mode='edu-confirmed' and body like '%$TAG%'")" "1"

echo "6b) attendance — SQL edu_attendance_set -> eduMine attend · eduCourse myState (own row only)"
S1=$(sq "select id from edu_sessions where course_id='$CID' and no=1")
S2=$(sq "select id from edu_sessions where course_id='$CID' and no=2")
E2=$(sq "select id from edu_enrollments where course_id='$CID' and user_id='$U2'")
chk "set present" "$(sq "select edu_attendance_set($S1,$E2,'present',null)->>'state'")" "present"
chk "set absent" "$(sq "select edu_attendance_set($S2,$E2,'absent',null)->>'state'")" "absent"
chk "waitlisted -> not-confirmed" "$(sq "select edu_attendance_set($S1,$E3,'present',null)->>'error'")" "not-confirmed"
M2=$(call "{\"action\":\"eduMine\",\"user_id\":\"$U2\"}")
chk "eduMine attend" "$(jqn '[m["attend"] for m in d["mine"] if m["courseId"]=="'$CID'"]' "$M2")" "[{'present': 1, 'late': 0, 'absent': 1, 'excused': 0, 'marked': 2, 'pct': 50}]"
R=$(call "{\"action\":\"eduCourse\",\"user_id\":\"$U2\",\"id\":\"$CID\"}")
chk "eduCourse myState" "$(jqn '[s["myState"] for s in d["course"]["sessions"]]' "$R")" "['present', 'absent']"
chk "eduCourse mine.attend.pct" "$(jqn 'd["mine"]["attend"]["pct"]' "$R")" "50"
chk "no session id / marked_by in eduCourse" "$(jqn '"marked_by" in json.dumps(d) or any("id" in s for s in d["course"]["sessions"])' "$R")" "False"
R3=$(call "{\"action\":\"eduCourse\",\"user_id\":\"$U3\",\"id\":\"$CID\"}")
chk "other member: myState all None" "$(jqn '[s["myState"] for s in d["course"]["sessions"]]' "$R3")" "[None, None]"
chk "other member: own attend zero" "$(jqn 'd["mine"]["attend"]' "$R3")" "{'present': 0, 'late': 0, 'absent': 0, 'excused': 0, 'marked': 0, 'pct': None}"
R0=$(call "{\"action\":\"eduCourse\",\"id\":\"$CID\"}")
chk "no user: myState all None" "$(jqn '[s["myState"] for s in d["course"]["sessions"]]' "$R0")" "[None, None]"
chk "no ids in responses" "$(printf '%s%s%s' "$M2" "$R" "$R3" | grep -c -e "$U1" -e "$U2" -e "$U3" -e "ident_key" -e "marked_by")" "0"
L3=$(call "{\"action\":\"eduList\",\"user_id\":\"$U3\"}")
chk "eduList mine attend (zero)" "$(jqn '[m["attend"]["marked"] for m in d["mine"] if m["courseId"]=="'$CID'"]' "$L3")" "[0]"
sx "select edu_attendance_set($S2,$E2,'excused',null)"
M2=$(call "{\"action\":\"eduMine\",\"user_id\":\"$U2\"}")
chk "excused leaves the denominator" "$(jqn '[(m["attend"]["marked"], m["attend"]["pct"]) for m in d["mine"] if m["courseId"]=="'$CID'"]' "$M2")" "[(2, 100)]"
sx "select edu_attendance_set($S1,$E2,'late',null)"
R=$(call "{\"action\":\"eduCourse\",\"user_id\":\"$U2\",\"id\":\"$CID\"}")
chk "late counts as attended" "$(jqn '([s["myState"] for s in d["course"]["sessions"]], d["mine"]["attend"]["pct"])' "$R")" "(['late', 'excused'], 100)"

echo "6c) certificates — SQL edu_issue_certs -> eduMine/eduList/eduCourse certNo · eduCert (owner only) · eduVerify (masked name) · revoke · restore"
YEAR=$(sq "select extract(year from now() at time zone 'Asia/Seoul')::int")
SEQ_OLD=$(sq "select coalesce((select last::text from edu_cert_seq where year=$YEAR),'none')")
[ -n "$YEAR" ] && [ -n "$SEQ_OLD" ] || { echo "번호 차례를 못 읽었다"; exit 2; }
M3=$(call "{\"action\":\"eduMine\",\"user_id\":\"$U3\"}")
chk "before: U3 completed/certNo" "$(jqn '[(m["completed"], m["certNo"]) for m in d["mine"] if m["courseId"]=="'$CID'"]' "$M3")" "[(False, None)]"
CC='[m["canCancel"] for m in d["mine"] if m["courseId"]=="'$CID'"]'
chk "before issue: U2 canCancel (first session is days away)" "$(jqn "$CC" "$(call "{\"action\":\"eduMine\",\"user_id\":\"$U2\"}")")" "[True]"
chk "issue (new)" "$(sq "select edu_issue_certs('$CID', array[$E2]::bigint[], null)->'issued'->0->>'how'")" "new"
chk "after issue: canCancel false (active certificate)" "$(jqn "$CC" "$(call "{\"action\":\"eduMine\",\"user_id\":\"$U2\"}")")" "[False]"
chk "member cancel of an active certificate -> has-cert" "$(jqn 'd.get("error")' "$(call "{\"action\":\"eduCancel\",\"user_id\":\"$U2\",\"enrollment_id\":$E2}")")" "has-cert"
NO=$(sq "select cert_no from edu_enrollments where id=$E2")
NUM=$(sq "select split_part(cert_no,'-',2)||'-'||split_part(cert_no,'-',3) from edu_enrollments where id=$E2")   # 한글 없는 꼬리
chk "number tail format" "$(printf '%s' "$NUM" | grep -c "^$YEAR-[0-9]\{4,\}$")" "1"
GC="\\uace0\\ucc99"   # JSON 안의 「고척」(백슬래시 u 이스케이프 — 큰따옴표 안의 \\ 가 \ 하나가 된다)
VNO="$GC-$NUM"
M2=$(call "{\"action\":\"eduMine\",\"user_id\":\"$U2\"}")
chk "eduMine completed" "$(jqn '[m["completed"] for m in d["mine"] if m["courseId"]=="'$CID'"]' "$M2")" "[True]"
chk "eduMine certNo" "$(jqn '[m["certNo"] for m in d["mine"] if m["courseId"]=="'$CID'"][0]' "$M2")" "$NO"
chk "eduList mine certNo" "$(jqn '[m["certNo"] for m in d["mine"] if m["courseId"]=="'$CID'"][0]' "$(call "{\"action\":\"eduList\",\"user_id\":\"$U2\"}")")" "$NO"
R=$(call "{\"action\":\"eduCourse\",\"user_id\":\"$U2\",\"id\":\"$CID\"}")
chk "eduCourse mine certNo" "$(jqn 'd["mine"]["certNo"]' "$R")" "$NO"
C2=$(call "{\"action\":\"eduCert\",\"user_id\":\"$U2\",\"enrollment_id\":$E2}")
chk "eduCert ok" "$(jqn 'd.get("ok")' "$C2")" "True"
chk "eduCert keys" "$(jqn 'sorted(d["cert"].keys())' "$C2")" "['body', 'certNo', 'from', 'issuedOn', 'issuer', 'name', 'seal', 'term', 'title', 'to']"
chk "eduCert certNo" "$(jqn 'd["cert"]["certNo"]' "$C2")" "$NO"
chk "eduCert name = enrollment name" "$(jqn 'd["cert"]["name"]' "$C2")" "$(sq "select name from edu_enrollments where id=$E2")"
chk "eduCert title" "$(jqn 'd["cert"]["title"]' "$C2")" "$TAG"
chk "eduCert body filled" "$(jqn '"{" not in d["cert"]["body"] and "'$TAG'" in d["cert"]["body"]' "$C2")" "True"
chk "eduCert issuedOn (KST)" "$(jqn 'd["cert"]["issuedOn"]' "$C2")" "$(sq "select (completed_at at time zone 'Asia/Seoul')::date::text from edu_enrollments where id=$E2")"
chk "eduCert period = first/last session" "$(jqn 'd["cert"]["from"] + "~" + d["cert"]["to"]' "$C2")" "$(sq "select min(on_date)::text||'~'||max(on_date)::text from edu_sessions where course_id='$CID'")"
chk "eduCert other member -> not-found" "$(jqn 'd.get("error")' "$(call "{\"action\":\"eduCert\",\"user_id\":\"$U3\",\"enrollment_id\":$E2}")")" "not-found"
chk "eduCert own row without cert -> no-cert" "$(jqn 'd.get("error")' "$(call "{\"action\":\"eduCert\",\"user_id\":\"$U3\",\"enrollment_id\":$E3}")")" "no-cert"
chk "eduCert no user -> no-user" "$(jqn 'd.get("error")' "$(call "{\"action\":\"eduCert\",\"enrollment_id\":$E2}")")" "no-user"
NAME2=$(sq "select name from edu_enrollments where id=$E2")
MASK=$(printf '%s' "$NAME2" | PYTHONIOENCODING=utf-8 python -c '
import sys, unicodedata
s = list(unicodedata.normalize("NFC", sys.stdin.buffer.read().decode("utf-8")).strip())
print("" if not s else "*" if len(s) == 1 else s[0] + "*" if len(s) == 2 else s[0] + "*" * (len(s) - 2) + s[-1])')   # maskName 과 같은 셈(한 글자도 *)
V=$(call "{\"action\":\"eduVerify\",\"no\":\"$VNO\"}")
chk "eduVerify valid" "$(jqn '(d.get("ok"), d.get("valid"), d.get("revoked"))' "$V")" "(True, True, False)"
chk "eduVerify keys" "$(jqn 'sorted(d.keys())' "$V")" "['completedOn', 'name', 'ok', 'revoked', 'term', 'title', 'valid']"
chk "eduVerify masked name" "$(jqn 'd["name"]' "$V")" "$MASK"
chk "eduVerify title/term" "$(jqn 'd["title"] == "'$TAG'" and d["term"] == "'$TAG'"' "$V")" "True"
chk "eduVerify completedOn" "$(jqn 'd["completedOn"]' "$V")" "$(sq "select (completed_at at time zone 'Asia/Seoul')::date::text from edu_enrollments where id=$E2")"
chk "eduVerify bad format -> bad-no" "$(jqn 'd.get("error")' "$(call '{"action":"eduVerify","no":"2026-0001"}')")" "bad-no"
chk "eduVerify unknown number -> valid False only" "$(jqn 'd' "$(call "{\"action\":\"eduVerify\",\"no\":\"$GC-1999-0001\"}")")" "{'ok': True, 'valid': False}"
chk "no ids in cert responses" "$(printf '%s%s%s' "$C2" "$V" "$M2" | grep -c -e "$U1" -e "$U2" -e "$U3" -e "ident_key" -e "user_id" -e "group_name")" "0"
chk "staff cancel of a cert row -> has-cert" "$(sq "select edu_cancel($E2, true)->>'error'")" "has-cert"
chk "revoke" "$(sq "select edu_revoke_cert($E2, null)->>'ok'")" "true"
V=$(call "{\"action\":\"eduVerify\",\"no\":\"$VNO\"}")
chk "after revoke: eduVerify valid/revoked" "$(jqn '(d.get("valid"), d.get("revoked"))' "$V")" "(False, True)"
chk "after revoke: eduVerify masked name" "$(jqn 'd["name"]' "$V")" "$MASK"
chk "after revoke: eduCert -> no-cert" "$(jqn 'd.get("error")' "$(call "{\"action\":\"eduCert\",\"user_id\":\"$U2\",\"enrollment_id\":$E2}")")" "no-cert"
M2=$(call "{\"action\":\"eduMine\",\"user_id\":\"$U2\"}")
chk "after revoke: eduMine completed/certNo" "$(jqn '[(m["completed"], m["certNo"]) for m in d["mine"] if m["courseId"]=="'$CID'"]' "$M2")" "[(False, None)]"
chk "after revoke: canCancel back to true" "$(jqn "$CC" "$M2")" "[True]"
chk "restore keeps the number" "$(sq "select (r->'issued'->0->>'how')||' '||split_part(r->'issued'->0->>'certNo','-',2)||'-'||split_part(r->'issued'->0->>'certNo','-',3) from (select edu_issue_certs('$CID', array[$E2]::bigint[], null) as r) z")" "restored $NUM"
chk "after restore: eduVerify valid" "$(jqn '(d.get("valid"), d.get("revoked"))' "$(call "{\"action\":\"eduVerify\",\"no\":\"$VNO\"}")")" "(True, False)"
chk "after restore: canCancel false again" "$(jqn "$CC" "$(call "{\"action\":\"eduMine\",\"user_id\":\"$U2\"}")")" "[False]"
SEQ_BASE=$([ "$SEQ_OLD" = "none" ] && echo 0 || echo "$SEQ_OLD")
chk "seq advanced by one only" "$(sq "select last - $SEQ_BASE from edu_cert_seq where year=$YEAR")" "1"

echo "7) declined stays declined"
sx "select edu_staff_set($E3,'declined')"
chk "row declined" "$(sq "select status from edu_enrollments where id=$E3")" "declined"
R=$(call "{\"action\":\"eduApply\",\"user_id\":\"$U3\",\"id\":\"$CID\"}")
chk "ok" "$(jqn 'd.get("ok")' "$R")" "True"
chk "status" "$(jqn 'd.get("status")' "$R")" "declined"
chk "already" "$(jqn 'd.get("already")' "$R")" "True"
chk "row still declined" "$(sq "select status from edu_enrollments where id=$E3")" "declined"

echo "8) first session today -> too-late"
sx "update edu_sessions set on_date=edu_today() where course_id='$CID' and no=1"
E2=$(sq "select id from edu_enrollments where course_id='$CID' and user_id='$U2'")
chk "too-late" "$(jqn 'd.get("error")' "$(call "{\"action\":\"eduCancel\",\"user_id\":\"$U2\",\"enrollment_id\":$E2}")")" "too-late"
M2=$(call "{\"action\":\"eduMine\",\"user_id\":\"$U2\"}")
chk "canCancel false" "$(jqn '[m["canCancel"] for m in d["mine"] if m["courseId"]=="'$CID'"]' "$M2")" "[False]"

echo "8b) eduCourse — list-outside course (done/draft) only for someone with a row in it"
U4=$(sq "select id from users where coalesce(name,'')<>'' order by created_at limit 1 offset 3")
sx "update edu_courses set status='done' where id='$CID'"
R=$(call "{\"action\":\"eduCourse\",\"user_id\":\"$U2\",\"id\":\"$CID\"}")
chk "done + row: ok" "$(jqn 'd.get("ok")' "$R")" "True"
chk "done + row: phase closed (no apply button)" "$(jqn 'd["course"]["phase"]' "$R")" "closed"
chk "done + row: mine" "$(jqn 'd["mine"]["status"]' "$R")" "confirmed"
chk "done + row: mine certNo (completed)" "$(jqn 'd["mine"]["certNo"]' "$R")" "$NO"
chk "done + no leak" "$(printf '%s' "$R" | grep -c -e "$U1" -e "$U2" -e "$U3" -e "ident_key")" "0"
R=$(call "{\"action\":\"eduCourse\",\"user_id\":\"$U1\",\"id\":\"$CID\"}")
chk "done + cancelled row: ok" "$(jqn 'd.get("ok")' "$R")" "True"
chk "done + cancelled row: mine None" "$(jqn 'd.get("mine")' "$R")" "None"
chk "done + no user: not-found" "$(jqn 'd.get("error")' "$(call "{\"action\":\"eduCourse\",\"id\":\"$CID\"}")")" "not-found"
[ -n "$U4" ] && chk "done + other user: not-found" "$(jqn 'd.get("error")' "$(call "{\"action\":\"eduCourse\",\"user_id\":\"$U4\",\"id\":\"$CID\"}")")" "not-found"
sx "update edu_courses set status='draft' where id='$CID'"
R=$(call "{\"action\":\"eduCourse\",\"user_id\":\"$U3\",\"id\":\"$CID\"}")
chk "draft + declined row: ok" "$(jqn 'd.get("ok")' "$R")" "True"
chk "draft: phase upcoming" "$(jqn 'd["course"]["phase"]' "$R")" "upcoming"

echo "8c) revoked certificate -> staff may cancel the enrollment · the number stays on the row (verify: revoked) and is never reused"
chk "revoke again" "$(sq "select edu_revoke_cert($E2, null)->>'ok'")" "true"
chk "staff cancel after revoke is allowed" "$(sq "select edu_cancel($E2, true)->>'ok'")" "true"
chk "cancelled row keeps its number" "$(sq "select status||' '||cert_revoked::text||' '||split_part(cert_no,'-',2)||'-'||split_part(cert_no,'-',3) from edu_enrollments where id=$E2")" "cancelled true $NUM"
V=$(call "{\"action\":\"eduVerify\",\"no\":\"$VNO\"}")
chk "verify still answers: revoked" "$(jqn '(d.get("ok"), d.get("valid"), d.get("revoked"))' "$V")" "(True, False, True)"
chk "verify masked name after cancel" "$(jqn 'd["name"]' "$V")" "$MASK"
chk "eduCert after revoke+cancel -> no-cert" "$(jqn 'd.get("error")' "$(call "{\"action\":\"eduCert\",\"user_id\":\"$U2\",\"enrollment_id\":$E2}")")" "no-cert"
chk "seq did not move (no reuse, no new number)" "$(sq "select last - $SEQ_BASE from edu_cert_seq where year=$YEAR")" "1"

echo "9) cleanup (trap)"
sx "delete from edu_attendance where enrollment_id in (select id from edu_enrollments where course_id='$CID'); delete from edu_enrollments where course_id='$CID'; delete from edu_courses where id='$CID'"
chk "attendance gone" "$(sq "select count(*) from edu_attendance where session_id in ($S1,$S2)")" "0"
chk "course gone" "$(sq "select count(*) from edu_courses where id='$CID'")" "0"
chk "enrollments gone" "$(sq "select count(*) from edu_enrollments where course_id='$CID'")" "0"
sx "delete from push_log where mode in ('edu-confirmed','edu-first-day') and body like '%$TAG%'"
chk "notify log / push_log rows gone" "$(sq "select (select count(*) from edu_notify_log where enrollment_id=$E2)||':'||(select count(*) from push_log where mode in ('edu-confirmed','edu-first-day') and body like '%$TAG%')")" "0:0"
CID=""
if [ "$SEQ_OLD" = "none" ]; then sx "delete from edu_cert_seq where year=$YEAR"; else sx "update edu_cert_seq set last=$SEQ_OLD where year=$YEAR"; fi
chk "cert seq restored" "$(sq "select coalesce((select last::text from edu_cert_seq where year=$YEAR),'none')")" "$SEQ_OLD"
SEQ_OLD=""
echo
echo "PASS $pass · FAIL $fail"
[ "$fail" = "0" ]
