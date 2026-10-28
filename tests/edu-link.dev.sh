#!/usr/bin/env bash
# 교육신청 「교적ID 가 같으면 한 건으로」(2026-10-28) — 개발 DB 끝까지 시험(쓰기 포함). ⚠️ 개발 전용: users 가 200 이상이면 거부한다.
#   bash tests/edu-link.dev.sh
# 하는 일: 개발 가짜 명부(church_people)의 한 분과 같은 소속·이름의 앱 계정을 만들고, 그 교적ID 로 담당자 대신 등록 줄(SQL edu_apply p_staff)을 만든 뒤
#          앱 api eduApply 를 부른다 → 새 줄 없이 그 줄에 계정이 붙는지(교회 어드민 internalEduFindPerson 을 지나) 본다. 끝나면 시험 자료를 모두 지운다(trap).
#          대신 등록 줄이 없는 강좌에서는 교회 어드민을 부르지 않고 평소처럼 새 줄이 생기는지도 본다.
# ⚠️ 본문에 한글을 쓰지 않는다(curl 이 깨뜨린다) — id 만 보낸다. 키·비밀번호는 찍지 않는다. 한글 값은 SQL 안에서만 만든다.
set -u
REF=ktpwthwqzgcqcrmsafdo
BASE="https://$REF.supabase.co/functions/v1/api"
KEY="sb_publishable_eJKP6u95IU9_DBXTvnvYBA_-yGCf-0Y"
W="${E2E_WORKDIR:-}"
if [ -z "$W" ]; then
  W=$(mktemp -d); mkdir -p "$W/supabase"
  supabase --workdir "$W" link --project-ref "$REF" >/dev/null 2>&1 || { echo "link 실패"; exit 2; }
fi
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
call() { curl -s -X POST "$BASE" -H "Content-Type: application/json" -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -d "$1"; }
jqn() { PYTHONIOENCODING=utf-8 python -c '
import json, sys
d = json.load(sys.stdin)
print(eval(sys.argv[1]))
' "$1" <<< "$2"; }
pass=0; fail=0
ok() { if [ "$2" = "$3" ]; then pass=$((pass+1)); echo "  ok   $1"; else fail=$((fail+1)); echo "  FAIL $1 (기대 $3 / 실제 $2)"; fi; }

if [ "$(sq "select count(*) from public.users")" -gt 200 ]; then echo "운영 같은 DB 입니다(users > 200) — 개발에서만 돌리세요"; exit 2; fi

CID=""; CID2=""; UID1=""
cleanup() {
  [ -n "$CID" ] && sx "delete from edu_enrollments where course_id in ('$CID','$CID2'); delete from edu_sessions where course_id in ('$CID','$CID2'); delete from edu_courses where id in ('$CID','$CID2')"
  [ -n "$UID1" ] && sx "delete from users where id='$UID1'"
  if [ "${OLD_STATE:-}" = "missing" ]; then sx "delete from app_config where key='eduOpen'"
  elif [ "${OLD_STATE:-}" = "had" ]; then sx "update app_config set value='$OLD_VAL'::jsonb where key='eduOpen'"; fi
}
trap cleanup EXIT
if [ "$(sq "select count(*) from app_config where key='eduOpen'")" = "0" ]; then OLD_STATE=missing
else OLD_VAL=$(sq "select value::text from app_config where key='eduOpen'"); OLD_STATE=had; fi
sx "insert into app_config(key,value) values('eduOpen','true'::jsonb) on conflict (key) do update set value='true'::jsonb"

# 시험 대상 — 개발 명부에서 (장년 · 이름이 명부 전체에 한 분 · 목장 번호가 읽히는) 한 분. 계정은 그분과 같은 소속·이름으로 SQL 안에서 만든다.
PID=$(sq "select person_id from church_people p where kind2 = (select kind2 from church_people where person_id=900008) and person_id=900008 and (select count(*) from church_people q where q.name_key=p.name_key)=1")
[ "$PID" = "900008" ] || { echo "시험 대상(900008)이 개발 명부에 없거나 이름이 겹친다 — 시험 중단"; exit 2; }
UID1=$(sq "with p as (select * from church_people where person_id=900008)
  insert into public.users(identity_key, type, gu, mok, name)
  select '교구|' || p.mok1 || '|' || ltrim(substring(p.mok3 from '-([0-9]+)'),'0') || '|||' || p.name_key, '교구', p.mok1, ltrim(substring(p.mok3 from '-([0-9]+)'),'0'), p.name_key from p returning id")
CID=$(sq "insert into edu_courses(title, kind, capacity, mode, waitlist, status) values ('link-e2e-1', 'regular', 5, 'auto', true, 'open') returning id")
CID2=$(sq "insert into edu_courses(title, kind, capacity, mode, waitlist, status) values ('link-e2e-2', 'regular', 5, 'auto', true, 'open') returning id")
sx "insert into edu_sessions(course_id,no,on_date) values ('$CID',1,edu_today()+1),('$CID2',1,edu_today()+1)"
echo "계정 $UID1 · 강좌 $CID / $CID2"

echo "1) 담당자 대신 등록(person|900008) → 앱 신청 → 한 줄에 이어 붙는다"
SID=$(sq "select (edu_apply('$CID', null, jsonb_build_object('name', (select name_key from church_people where person_id=900008), 'ident_key','person|900008','who_type','교구','group_name',(select mok1 from church_people where person_id=900008),'sub_name','8'), true))->>'id'")
A=$(call "{\"action\":\"eduApply\",\"user_id\":\"$UID1\",\"id\":\"$CID\"}")
ok "신청 ok" "$(jqn 'd.get("ok")' "$A")" "True"
ok "이미 있는 줄(already)" "$(jqn 'd.get("already")' "$A")" "True"
ok "확정 그대로" "$(jqn 'd.get("status")' "$A")" "confirmed"
ok "줄은 하나" "$(sq "select count(*) from edu_enrollments where course_id='$CID'")" "1"
ok "그 줄에 계정이 붙음" "$(sq "select (user_id='$UID1')::text from edu_enrollments where id=$SID")" "true"
ok "열쇠는 person|900008 그대로" "$(sq "select ident_key from edu_enrollments where id=$SID")" "person|900008"
M=$(call "{\"action\":\"eduMine\",\"user_id\":\"$UID1\"}")
ok "내 강좌에 보인다" "$(jqn 'len([x for x in d.get("mine",[]) if x.get("courseId")=="'"$CID"'" or x.get("course_id")=="'"$CID"'"])' "$M")" "1"

echo "2) 대신 등록 줄이 없는 강좌 → 평소처럼 새 줄(교회 어드민을 부르지 않는다)"
A2=$(call "{\"action\":\"eduApply\",\"user_id\":\"$UID1\",\"id\":\"$CID2\"}")
ok "신청 ok" "$(jqn 'd.get("ok")' "$A2")" "True"
ok "already 아님" "$(jqn 'd.get("already")' "$A2")" "False"
ok "줄 하나(새 줄)" "$(sq "select count(*) from edu_enrollments where course_id='$CID2'")" "1"
ok "열쇠는 앱 신원" "$(sq "select (ident_key like 'person|%')::text from edu_enrollments where course_id='$CID2'")" "false"

echo "3) 화면이 보낸 link_key 는 읽지 않는다"
sx "delete from edu_enrollments where course_id='$CID2'"
SID2=$(sq "select (edu_apply('$CID2', null, jsonb_build_object('name','x-other','ident_key','person|900099','who_type','교구','group_name','x','sub_name','1'), true))->>'id'")
A3=$(call "{\"action\":\"eduApply\",\"user_id\":\"$UID1\",\"id\":\"$CID2\",\"link_key\":\"person|900099\",\"ident\":{\"link_key\":\"person|900099\"}}")
ok "다른 사람 줄에 안 붙음" "$(sq "select (user_id is null)::text from edu_enrollments where id=$SID2")" "true"
ok "내 줄은 따로" "$(sq "select count(*) from edu_enrollments where course_id='$CID2'")" "2"

echo "결과: 통과 $pass · 실패 $fail"
[ "$fail" = "0" ]
