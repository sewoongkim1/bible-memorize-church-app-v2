#!/usr/bin/env bash
# 교육신청 성도님 api — 개발 DB 끝까지 시험(쓰기 포함). ⚠️ 개발 전용: users 가 200 이상이면 거부한다.
#   bash tests/edu-e2e.dev.sh
# 준비: supabase CLI 로그인. 작업 폴더(E2E_WORKDIR)가 없으면 임시로 만들어 개발에 link 한다.
# 하는 일: eduOpen 을 켜고(끝나면 원래대로) 시험 강좌(정원 1)를 만들어 신청·대기·취소·반려 유지·마감을 돌린 뒤 강좌를 지운다.
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

OLD_STATE=""; OLD_VAL=""; CID=""
cleanup() {
  # 신청 줄은 on delete restrict 라 먼저 지운다(회차는 cascade)
  [ -n "$CID" ] && sx "delete from edu_enrollments where course_id='$CID'; delete from edu_courses where id='$CID'"
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

echo "9) cleanup (trap)"
sx "delete from edu_enrollments where course_id='$CID'; delete from edu_courses where id='$CID'"
chk "course gone" "$(sq "select count(*) from edu_courses where id='$CID'")" "0"
chk "enrollments gone" "$(sq "select count(*) from edu_enrollments where course_id='$CID'")" "0"
CID=""
echo
echo "PASS $pass · FAIL $fail"
[ "$fail" = "0" ]
