#!/usr/bin/env bash
# 교육신청 4단계 앱 알림 — 개발 DB 끝까지 시험(쓰기 포함). ⚠️ 개발 전용: users 가 200 이상이면 거부한다.
#   bash tests/edu-notify.dev.sh
# 준비: supabase CLI 로그인. 작업 폴더(E2E_WORKDIR)가 없으면 임시로 만들어 개발에 link 한다.
#        개발 app_config ministryTesters(🧪 시험 참여자)에 앱 계정 한 분이 있어야 한다(0) 의 시험 참여자 몫 — 없으면 멈춘다).
# 하는 일: 시험 강좌를 만들어
#   0) 문(검토 반영 2026-10-06 · 친구 결정) — eduOpen 이 없으면: 시험 참여자 아닌 분은 internalEduNotify 로도 안 잡힌다(기록·push_log 없음) ·
#      시험 참여자는 잡힌다 · internalEduRemind 도 같다 · 문을 열면 걸러졌던 분은 그때 간다(잡지 않았으니까)
#   ① internalEduNotify — 키 없음·틀린 키·공개 키는 unauthorized · 틀린 kind/번호는 거절 · 확정+앱 계정 한 분은 sent 1(기록 한 줄) ·
#      같은 부름 두 번째는 skipped · 대기·앱 계정 없는 줄은 skipped · 응답에 user_id 없음
#   ② 성도님 eduCancel 로 대기 첫 분이 올라가면 api 가 안에서 「자리가 나서 …」 알림(기록 한 줄 · push_log 한 줄 — 응답 뒤에 돌아서 기다려 본다)
#   ②-1 (검토 반영) 교회 어드민 eduEnrollSet 으로 **이미 확정인 줄**을 다시 확정 → already · 알림 부탁 없음(기록·push_log 0) ·
#      대조로 대기 줄을 확정하면 notified 1(교회 어드민 → api 길이 살아 있다)
#   ③ internalEduRemind — 내일(한국)이 첫 날인 강좌(첫 회차가 내일 · 회차 없이 시작일이 내일)의 확정+앱 계정만 ·
#      초안 강좌·첫 회차가 모레인 강좌(시작일이 내일이어도)·대기·앱 계정 없는 줄은 빠짐 · 두 번째는 0 · 키 없으면 unauthorized
#   를 보고, 강좌·신청(알림 기록은 cascade)·이번에 생긴 push_log 줄·시험 담당자(교회 어드민 · ca-test-notify-…@example.test)를 지워 0줄로 되돌린다.
#   eduOpen 은 0) 에서 지우고(없음) ①부터 true 로 켠다 — **끝나면(실패해도 trap) 시작 전 값으로** 되돌린다.
#   개발 사용자는 알림 기기가 없다 — edu_notify_log·push_log(total·sent 0)가 증거다(기기가 있으면 그 수를 센 값과 맞댄다).
# ⚠️ 서비스 키는 명령 안에서만 쓰고 찍지 않는다 — 교회 어드민 dev 시험과 같은 곳(~/.church-admin/dev.env DEV_SERVICE_KEY)을 먼저 보고,
#    그 키가 api 의 SUPABASE_SERVICE_ROLE_KEY 와 다르면(옛 JWT — 알려진 일) CLI 의 개발 secret 키(api-keys --reveal)를 쓴다. 맞는지는 빈 요청으로 본다.
#    시험 담당자의 비밀번호·로그인 토큰도 찍지 않는다.
# ⚠️ 본문에 한글을 쓰지 않는다(curl 이 깨뜨린다) — 한글 문구는 SQL chr(코드)로 맞댄다.
# ⚠️ 내일이 첫 날인 다른 강좌(남의 시험 자료)에 확정자가 있으면 그분들께도 가므로 0)·③ 앞에서 멈춘다.
set -u
REF=ktpwthwqzgcqcrmsafdo
BASE="https://$REF.supabase.co/functions/v1/api"
CA_FN="https://$REF.supabase.co/functions/v1/church-admin"
AUTH="https://$REF.supabase.co/auth/v1"
PUB="sb_publishable_eJKP6u95IU9_DBXTvnvYBA_-yGCf-0Y"

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
call() {   # 성도님 앱과 같은 부름(공개 키)
  curl -s -X POST "$BASE" -H "Content-Type: application/json" -H "apikey: $PUB" -H "Authorization: Bearer $PUB" -d "$1"
}
icall() {  # 내부 갈래 — $1 = x-internal-key 값(빈 글이면 머리를 안 단다) · $2 = 본문
  if [ -n "$1" ]; then curl -s -X POST "$BASE" -H "Content-Type: application/json" -H "x-internal-key: $1" -d "$2"
  else curl -s -X POST "$BASE" -H "Content-Type: application/json" -d "$2"; fi
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
# 응답 뒤에 도는 일(eduCancel 의 올라간 분 알림 · EdgeRuntime.waitUntil)을 기다려 본다 — SQL 값이 기대값이 될 때까지(15번까지 · 1초 간격)
poll() { local v="" i; for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do v=$(sq "$1"); [ "$v" = "$2" ] && break; sleep 1; done; printf '%s' "$v"; }

N=$(sq "select count(*) from users")
if [ -z "$N" ] || [ "$N" -ge 200 ]; then echo "users=$N — 개발이 아닌 것 같다. 중단."; exit 2; fi
echo "dev users=$N"

# 서비스 키(찍지 않는다) — 빈 요청이 {ok:true} 면 맞는 키
probe() { icall "$1" '{"action":"internalEduNotify","kind":"confirmed","enrollment_ids":[]}' | grep -c '"ok":true'; }
SK=""
if [ -f "$HOME/.church-admin/dev.env" ]; then SK=$(set -a; . "$HOME/.church-admin/dev.env" >/dev/null 2>&1; printf '%s' "${DEV_SERVICE_KEY:-}"); fi
if [ -z "$SK" ] || [ "$(probe "$SK")" != "1" ]; then
  echo "  (dev.env 키가 api 의 서비스 키와 다르다 — CLI 의 개발 secret 키를 쓴다)"
  SK=$(supabase projects api-keys --project-ref "$REF" --reveal -o json 2>/dev/null | PYTHONIOENCODING=utf-8 python -c '
import json, sys
d = json.load(sys.stdin)
print(next((k.get("api_key") or "" for k in d if k.get("type") == "secret"), ""))')
fi
if [ -z "$SK" ] || [ "$(probe "$SK")" != "1" ]; then echo "서비스 키를 못 찾았다 — 중단(키는 찍지 않는다)"; exit 2; fi
# 인증 관리(auth admin) 부름 — 새 방식 secret 키는 apikey 머리만, 옛 JWT 는 Bearer 도(교회 어드민 dev 시험과 같다)
adm() {  # $1 = 방법 · $2 = 경로 · $3 = 본문(없으면 빈 글)
  if [ "${SK#sb_secret_}" != "$SK" ]; then
    curl -s -X "$1" "$AUTH$2" -H "apikey: $SK" -H "Content-Type: application/json" -d "${3:-}"
  else
    curl -s -X "$1" "$AUTH$2" -H "apikey: $SK" -H "Authorization: Bearer $SK" -H "Content-Type: application/json" -d "${3:-}"
  fi
}

TAG=nt$RANDOM$RANDOM
PL0=$(sq "select coalesce(max(id),0) from push_log")
OPEN_N=$(sq "select count(*) from app_config where key='eduOpen'")
[ -n "$PL0" ] && [ -n "$OPEN_N" ] || { echo "시작 값을 못 읽었다"; exit 2; }
OPEN_VAL=""
[ "$OPEN_N" != "0" ] && OPEN_VAL=$(sq "select value::text from app_config where key='eduOpen'")
echo "eduOpen 원래: $OPEN_N ${OPEN_VAL}"
CA_AU=""; CA_MID=""
cleanup() {
  # 신청(알림 기록은 cascade) → 강좌(회차는 cascade) · 이번에 생긴 교육 알림 push_log 줄
  sx "delete from edu_attendance where enrollment_id in (select e.id from edu_enrollments e join edu_courses c on c.id=e.course_id where c.title like '$TAG-%'); delete from edu_enrollments where course_id in (select id from edu_courses where title like '$TAG-%'); delete from edu_courses where title like '$TAG-%'; delete from push_log where id > $PL0 and mode in ('edu-confirmed','edu-first-day') and body like '%$TAG-%'"
  # 시험 담당자(②-1) — 기록(member_id 는 set null 이라 먼저) → 역할 → 담당자 → auth 사용자
  if [ -n "$CA_MID" ]; then sx "delete from admin_audit where member_id='$CA_MID'; delete from admin_role_grants where member_id='$CA_MID'; delete from admin_members where id='$CA_MID'"; fi
  if [ -n "$CA_AU" ]; then adm DELETE "/admin/users/$CA_AU" >/dev/null 2>&1; fi
  # eduOpen — 시작 전 값으로(없었으면 지운다)
  if [ "$OPEN_N" = "0" ]; then sx "delete from app_config where key='eduOpen'"
  else sx "insert into app_config(key,value) values('eduOpen','$OPEN_VAL'::jsonb) on conflict (key) do update set value='$OPEN_VAL'::jsonb"; fi
}
trap cleanup EXIT

U1=$(sq "select id from users where coalesce(name,'')<>'' order by created_at limit 1 offset 0")
U2=$(sq "select id from users where coalesce(name,'')<>'' order by created_at limit 1 offset 1")
U3=$(sq "select id from users where coalesce(name,'')<>'' order by created_at limit 1 offset 2")
U4=$(sq "select id from users where coalesce(name,'')<>'' order by created_at limit 1 offset 3")
[ -n "$U1" ] && [ -n "$U2" ] && [ -n "$U3" ] && [ -n "$U4" ] || { echo "사용자 넷을 못 골랐다"; exit 2; }
# 시험 참여자(UT)와 아닌 분(UN) — api ministryKeysToUsers 와 같은 풀이(지금 키는 users · 옛 키는 user_identity_aliases)
TESTERS="select u.id from users u where u.identity_key in (select jsonb_array_elements_text(value) from app_config where key='ministryTesters') union select a.user_id from user_identity_aliases a where a.identity_key in (select jsonb_array_elements_text(value) from app_config where key='ministryTesters')"
UT=$(sq "select id from users where id in ($TESTERS) order by created_at limit 1")
UN=$(sq "select id from users where coalesce(name,'')<>'' and id not in ($TESTERS) order by created_at limit 1")
[ -n "$UT" ] || { echo "개발 ministryTesters 에 앱 계정이 없다 — 교회 어드민 「🧪 시험 참여자」에 한 분을 올리고 돌릴 것. 중단."; exit 2; }
[ -n "$UN" ] || { echo "시험 참여자 아닌 사용자를 못 골랐다"; exit 2; }
DEV() { sq "select (select count(*) from push_subscriptions where user_id='$1') + (select count(*) from ios_push_tokens where user_id='$1')"; }   # 그분 기기 수
noleak() { printf '%s' "$1" | grep -c -e "$U1" -e "$U2" -e "$U3" -e "$U4" -e "$UT" -e "$UN" -e "user_id" -e "ident_key"; }
RB="{\"action\":\"internalEduRemind\"}"
FOREIGN_SQL="select count(*) from edu_enrollments e join edu_courses c on c.id=e.course_id where e.status='confirmed' and e.user_id is not null and c.status not in ('draft','archived','done') and c.title not like '$TAG-%' and coalesce((select min(on_date) from edu_sessions s where s.course_id=c.id), c.starts_on) = edu_today()+1 and not exists (select 1 from edu_notify_log l where l.enrollment_id=e.id and l.kind='first_day')"
TOMORROW=$(sq "select (edu_today()+1)::text")

echo "0) 문 — eduOpen 없음: 시험 참여자 아닌 분은 안 잡힌다 · 시험 참여자는 잡힌다 · 문을 열면 걸러졌던 분도 그때 간다"
sx "delete from app_config where key='eduOpen'"
chk "eduOpen absent" "$(sq "select count(*) from app_config where key='eduOpen'")" "0"
# G — 선착순 · 정원 없음 · 첫 회차 사흘 뒤 14:00 · 확정 UN(시험 참여자 아님) · 확정 UT(시험 참여자)
CG=$(sq "insert into edu_courses(title,kind,term,capacity,mode,waitlist,status,place) values ('$TAG-g','lecture','$TAG',null,'auto',true,'open','hall-G') returning id")
[ -n "$CG" ] || { echo "강좌 G 만들기 실패"; exit 2; }
sx "insert into edu_sessions(course_id,no,on_date,start_time,place) values ('$CG',1,edu_today()+3,'14:00','hall-G')"
EGN=$(sq "select (edu_apply('$CG','$UN',jsonb_build_object('name','$TAG-gn'))->>'id')")
EGT=$(sq "select (edu_apply('$CG','$UT',jsonb_build_object('name','$TAG-gt'))->>'id')")
chk "setup G statuses" "$(sq "select string_agg(status, ',' order by id) from edu_enrollments where id in ($EGN,$EGT)")" "confirmed,confirmed"
R=$(icall "$SK" "{\"action\":\"internalEduNotify\",\"kind\":\"confirmed\",\"enrollment_ids\":[$EGN]}")
chk "gate closed: non-tester -> skipped, not sent" "$(jqn '(d.get("ok"), d.get("sent"), d.get("skipped"))' "$R")" "(True, 0, 1)"
chk "gate closed: non-tester not claimed (no edu_notify_log row)" "$(sq "select count(*) from edu_notify_log where enrollment_id=$EGN")" "0"
chk "gate closed: no push_log row for non-tester" "$(sq "select count(*) from push_log where id > $PL0 and body like '%$TAG-g %'")" "0"
R=$(icall "$SK" "{\"action\":\"internalEduNotify\",\"kind\":\"confirmed\",\"enrollment_ids\":[$EGT]}")
chk "gate closed: tester -> sent 1" "$(jqn '(d.get("ok"), d.get("sent"), d.get("skipped"))' "$R")" "(True, 1, 0)"
chk "gate closed: tester claimed (one confirmed row)" "$(sq "select count(*)||':'||min(kind) from edu_notify_log where enrollment_id=$EGT")" "1:confirmed"
chk "gate closed: one push_log row (tester's devices)" "$(sq "select count(*)||':'||(sum(total) = $(DEV "$UT"))::text from push_log where id > $PL0 and mode='edu-confirmed' and body like '%$TAG-g %'")" "1:true"
R=$(icall "$SK" "{\"action\":\"internalEduNotify\",\"kind\":\"confirmed\",\"enrollment_ids\":[$EGN,$EGT]}")
chk "gate closed: both again -> (0 sent, 2 skipped)" "$(jqn '(d.get("sent"), d.get("skipped"))' "$R")" "(0, 2)"
chk "gate closed: non-tester still unclaimed" "$(sq "select count(*) from edu_notify_log where enrollment_id=$EGN")" "0"
# H — 첫 회차 내일 10:00 · 확정 UN·UT → 개강 전날도 문을 따른다
FOREIGN=$(sq "$FOREIGN_SQL")
if [ "$FOREIGN" != "0" ]; then echo "  내일이 첫 날인 다른 강좌의 확정자가 $FOREIGN 분 있다 — 그분들께도 가므로 여기서 멈춘다"; fail=$((fail+1)); echo "PASS $pass · FAIL $fail"; exit 1; fi
CH=$(sq "insert into edu_courses(title,kind,term,capacity,mode,waitlist,status,place) values ('$TAG-h','lecture','$TAG',null,'auto',true,'running','room-H') returning id")
sx "insert into edu_sessions(course_id,no,on_date,start_time) values ('$CH',1,edu_today()+1,'10:00')"
EHN=$(sq "select (edu_apply('$CH','$UN',jsonb_build_object('name','$TAG-hn'),true)->>'id')")
EHT=$(sq "select (edu_apply('$CH','$UT',jsonb_build_object('name','$TAG-ht'),true)->>'id')")
chk "setup H statuses" "$(sq "select string_agg(status, ',' order by id) from edu_enrollments where id in ($EHN,$EHT)")" "confirmed,confirmed"
R=$(icall "$SK" "$RB")
chk "gate closed: remind -> tester only" "$(jqn '(d.get("ok"), d.get("day"), d.get("courses"), d.get("sent"), d.get("skipped"))' "$R")" "(True, '$TOMORROW', 1, 1, 1)"
chk "gate closed: first_day rows = tester only" "$(sq "select string_agg(enrollment_id::text, ',') from edu_notify_log where kind='first_day' and enrollment_id in ($EHN,$EHT)")" "$EHT"
chk "no ids in gate responses" "$(noleak "$R")" "0"
sx "insert into app_config(key,value) values('eduOpen','true'::jsonb) on conflict (key) do update set value='true'::jsonb"
R=$(icall "$SK" "{\"action\":\"internalEduNotify\",\"kind\":\"confirmed\",\"enrollment_ids\":[$EGN]}")
chk "gate open: the filtered-out non-tester is sent now" "$(jqn '(d.get("sent"), d.get("skipped"))' "$R")" "(1, 0)"
chk "gate open: non-tester claimed now" "$(sq "select count(*) from edu_notify_log where enrollment_id=$EGN")" "1"
R=$(icall "$SK" "$RB")
chk "gate open: remind -> the non-tester now (tester already)" "$(jqn '(d.get("courses"), d.get("sent"), d.get("skipped"))' "$R")" "(1, 1, 1)"
chk "gate open: first_day rows = both" "$(sq "select count(*) from edu_notify_log where kind='first_day' and enrollment_id in ($EHN,$EHT)")" "2"
# 0) 의 강좌는 여기서 치운다(아래 ③ 의 「내일 첫 날」 수에 안 들게) · 그 push_log 줄은 끝 정리가 지운다
sx "delete from edu_enrollments where course_id in ('$CG','$CH'); delete from edu_courses where id in ('$CG','$CH')"
chk "0) courses cleared (notify log cascade)" "$(sq "select count(*) from edu_notify_log where enrollment_id in ($EGN,$EGT,$EHN,$EHT)")" "0"
PL1=$(sq "select coalesce(max(id),0) from push_log")
[ -n "$PL1" ] || { echo "push_log 기준을 못 읽었다"; exit 2; }

# 강좌 A — 선착순 · 정원 2 · 첫 회차 사흘 뒤 14:00 · 확정 U1 · 대신 등록(앱 계정 없음) 확정 · 대기 U2·U3(U2 먼저)
CA=$(sq "insert into edu_courses(title,kind,term,capacity,mode,waitlist,apply_from,apply_to,status,place) values ('$TAG-a','lecture','$TAG',2,'auto',true,edu_today()-1,edu_today()+30,'open','hall-A') returning id")
[ -n "$CA" ] || { echo "강좌 A 만들기 실패"; exit 2; }
sx "insert into edu_sessions(course_id,no,on_date,start_time,place) values ('$CA',1,edu_today()+3,'14:00','hall-A'),('$CA',2,edu_today()+10,'14:00','hall-A')"
E1=$(sq "select (edu_apply('$CA','$U1',jsonb_build_object('name','$TAG-1'))->>'id')")
ES=$(sq "select (edu_apply('$CA',null,jsonb_build_object('name','$TAG-s','ident_key','staff|x|||$TAG-s'),true)->>'id')")
E2=$(sq "select (edu_apply('$CA','$U2',jsonb_build_object('name','$TAG-2'))->>'id')")
E3=$(sq "select (edu_apply('$CA','$U3',jsonb_build_object('name','$TAG-3'))->>'id')")
sx "update edu_enrollments set waitlist_at = now() - interval '1 minute' where id = $E2"
chk "setup A statuses" "$(sq "select string_agg(status, ',' order by id) from edu_enrollments where course_id='$CA'")" "confirmed,confirmed,waitlisted,waitlisted"
echo "course A=$CA · E1=$E1 ES=$ES E2=$E2 E3=$E3 · eduOpen true from here"

echo "1) internalEduNotify — 문(서비스 키만) · 틀린 입력"
NB="{\"action\":\"internalEduNotify\",\"kind\":\"confirmed\",\"enrollment_ids\":[$E1]}"
chk "no key -> unauthorized" "$(jqn 'd.get("error")' "$(icall "" "$NB")")" "unauthorized"
chk "wrong key -> unauthorized" "$(jqn 'd.get("error")' "$(icall "x-$TAG-not-the-key-0000000000000000" "$NB")")" "unauthorized"
chk "publishable key as internal key -> unauthorized" "$(jqn 'd.get("error")' "$(icall "$PUB" "$NB")")" "unauthorized"
chk "bearer only (app path) -> unauthorized" "$(jqn 'd.get("error")' "$(call "$NB")")" "unauthorized"
chk "nothing logged by refused calls" "$(sq "select count(*) from edu_notify_log where enrollment_id in ($E1,$ES,$E2,$E3)")" "0"
chk "bad kind" "$(jqn 'd.get("error")' "$(icall "$SK" "{\"action\":\"internalEduNotify\",\"kind\":\"first_day\",\"enrollment_ids\":[$E1]}")")" "bad-kind"
chk "ids not array" "$(jqn 'd.get("error")' "$(icall "$SK" '{"action":"internalEduNotify","kind":"confirmed","enrollment_ids":"1"}')")" "bad-args"
chk "id 0" "$(jqn 'd.get("error")' "$(icall "$SK" '{"action":"internalEduNotify","kind":"confirmed","enrollment_ids":[0]}')")" "bad-args"

echo "2) internalEduNotify — 확정+앱 계정 한 분 · 두 번째는 skipped · 대기·앱 계정 없는 줄은 skipped"
R=$(icall "$SK" "$NB")
chk "first call" "$(jqn '(d.get("ok"), d.get("sent"), d.get("skipped"))' "$R")" "(True, 1, 0)"
chk "response keys" "$(jqn 'sorted(d.keys())' "$R")" "['ok', 'sent', 'skipped']"
chk "no ids in response" "$(noleak "$R")" "0"
chk "one confirmed log row" "$(sq "select count(*)||':'||min(kind) from edu_notify_log where enrollment_id=$E1")" "1:confirmed"
chk "push_log edu-confirmed rows" "$(sq "select count(*) from push_log where id > $PL1 and mode='edu-confirmed'")" "1"
D1=$(DEV "$U1")
chk "push_log total = U1 devices · sent <= total" "$(sq "select (total = $D1 and sent <= total and failed + sent = total)::text from push_log where id > $PL1 and mode='edu-confirmed'")" "true"
chk "push_log title" "$(sq "select (title = chr(127891)||' '||chr(44368)||chr(50977))::text from push_log where id > $PL1 and mode='edu-confirmed'")" "true"
chk "push_log body (title · first session 14:00)" "$(sq "select (body like '$TAG-a %' and body like '% 14:00' and position(chr(52395)||' '||chr(49884)||chr(44036) in body) > 0)::text from push_log where id > $PL1 and mode='edu-confirmed'")" "true"
chk "push_log body has no ids" "$(sq "select count(*) from push_log where id > $PL0 and (coalesce(body,'') like '%$U1%' or coalesce(note,'') like '%$U1%' or coalesce(body,'') like '%$UT%' or coalesce(body,'') like '%$UN%')")" "0"
R=$(icall "$SK" "$NB")
chk "second call skipped" "$(jqn '(d.get("ok"), d.get("sent"), d.get("skipped"))' "$R")" "(True, 0, 1)"
chk "still one log row" "$(sq "select count(*) from edu_notify_log where enrollment_id=$E1")" "1"
chk "no new push_log row" "$(sq "select count(*) from push_log where id > $PL1 and mode='edu-confirmed'")" "1"
R=$(icall "$SK" "{\"action\":\"internalEduNotify\",\"kind\":\"confirmed\",\"enrollment_ids\":[$E2,$ES,$E3,$E1,$E1],\"promoted\":true}")
chk "waitlisted / no-account / already (same id twice counts once) -> skipped" "$(jqn '(d.get("ok"), d.get("sent"), d.get("skipped"))' "$R")" "(True, 0, 4)"
chk "no log for waitlisted / staff rows" "$(sq "select count(*) from edu_notify_log where enrollment_id in ($ES,$E2,$E3)")" "0"

echo "3) 성도님 취소로 대기 첫 분(U2)이 올라감 -> api 안에서 「자리가 나서」 알림(응답 뒤에 돈다)"
C=$(call "{\"action\":\"eduCancel\",\"user_id\":\"$U1\",\"enrollment_id\":$E1}")
chk "eduCancel ok/promoted" "$(jqn '(d.get("ok"), d.get("promoted"))' "$C")" "(True, True)"
chk "eduCancel response keys" "$(jqn 'sorted(d.keys())' "$C")" "['ok', 'promoted']"
chk "E2 confirmed" "$(sq "select status from edu_enrollments where id=$E2")" "confirmed"
chk "E2 confirmed log row (after the response)" "$(poll "select count(*)||':'||min(kind) from edu_notify_log where enrollment_id=$E2" "1:confirmed")" "1:confirmed"
chk "push_log edu-confirmed rows" "$(poll "select count(*) from push_log where id > $PL1 and mode='edu-confirmed'" "2")" "2"
chk "promoted body starts with jari-ga naseo" "$(sq "select (left(body,2) = chr(51088)||chr(47532) and body like '%$TAG-a %')::text from push_log where id > $PL1 and mode='edu-confirmed' order by id desc limit 1")" "true"
chk "E3 still waitlisted · no log" "$(sq "select status||':'||(select count(*) from edu_notify_log where enrollment_id=$E3) from edu_enrollments where id=$E3")" "waitlisted:0"
R=$(icall "$SK" "{\"action\":\"internalEduNotify\",\"kind\":\"confirmed\",\"enrollment_ids\":[$E2]}")
chk "E2 again (staff path) -> skipped" "$(jqn '(d.get("sent"), d.get("skipped"))' "$R")" "(0, 1)"

echo "3-1) 교회 어드민 eduEnrollSet — 이미 확정인 줄을 다시 확정하면 아무것도 안 보낸다(already) · 대기 줄 확정은 보낸다(대조)"
# 시험 담당자(교육 총괄) — 이메일 로그인 ca-test-notify-…@example.test · 끝나면 cleanup 이 지운다(비밀번호·토큰은 찍지 않는다)
CA_STAMP="$(date +%s)$RANDOM"
CA_EMAIL="ca-test-notify-$CA_STAMP@example.test"
CA_PW="T${CA_STAMP}!x"
CA_AU=$(jqn 'd.get("id") or ""' "$(adm POST /admin/users "{\"email\":\"$CA_EMAIL\",\"password\":\"$CA_PW\",\"email_confirm\":true}")")
[ -n "$CA_AU" ] || { echo "시험 담당자 만들기 실패"; fail=$((fail+1)); echo "PASS $pass · FAIL $fail"; exit 1; }
CA_TOK=$(curl -s -X POST "$AUTH/token?grant_type=password" -H "apikey: $PUB" -H "Content-Type: application/json" -d "{\"email\":\"$CA_EMAIL\",\"password\":\"$CA_PW\"}" | PYTHONIOENCODING=utf-8 python -c 'import json, sys; print(json.load(sys.stdin).get("access_token") or "")')
CA_MID=$(sq "insert into admin_members(auth_user_id, name, status) values ('$CA_AU', 'ca-test-notify-$CA_STAMP', 'active') returning id")
sx "insert into admin_role_grants(member_id, role_id) values ('$CA_MID', 'education')"
[ -n "$CA_TOK" ] && [ -n "$CA_MID" ] || { echo "시험 담당자 로그인·등록 실패"; fail=$((fail+1)); echo "PASS $pass · FAIL $fail"; exit 1; }
cadm() { curl -s -X POST "$CA_FN" -H "Content-Type: application/json" -H "apikey: $PUB" -H "Authorization: Bearer $CA_TOK" -d "$1"; }
# R — 선착순 · 정원 1 · 첫 회차 닷새 뒤 · U1 즉시 확정(알림 기록 없음) · U2 대기
CR=$(sq "insert into edu_courses(title,kind,term,capacity,mode,waitlist,status,place) values ('$TAG-r','lecture','$TAG',1,'auto',true,'open','hall-R') returning id")
sx "insert into edu_sessions(course_id,no,on_date,start_time) values ('$CR',1,edu_today()+5,'14:00')"
ER1=$(sq "select (edu_apply('$CR','$U1',jsonb_build_object('name','$TAG-r1'))->>'id')")
ER2=$(sq "select (edu_apply('$CR','$U2',jsonb_build_object('name','$TAG-r2'))->>'id')")
chk "setup R statuses (instant confirm · waitlisted)" "$(sq "select string_agg(status, ',' order by id) from edu_enrollments where id in ($ER1,$ER2)")" "confirmed,waitlisted"
R=$(cadm "{\"action\":\"eduEnrollSet\",\"id\":$ER1,\"op\":\"confirm\"}")
chk "re-confirm unchanged -> already · no notify fields" "$(jqn '(d.get("ok"), d.get("already"), sorted(d.keys()))' "$R")" "(True, True, ['already', 'ok', 'promoted'])"
chk "re-confirm unchanged -> no claim" "$(sq "select count(*) from edu_notify_log where enrollment_id=$ER1")" "0"
chk "re-confirm unchanged -> no push_log row" "$(sq "select count(*) from push_log where id > $PL1 and body like '%$TAG-r %'")" "0"
R=$(cadm "{\"action\":\"eduEnrollSet\",\"id\":$ER2,\"op\":\"confirm\",\"force\":true}")
chk "control: waitlisted -> confirmed via church-admin -> notified 1" "$(jqn '(d.get("ok"), d.get("notified"), d.get("notifyError"))' "$R")" "(True, 1, None)"
chk "control: claimed" "$(sq "select count(*)||':'||min(kind) from edu_notify_log where enrollment_id=$ER2")" "1:confirmed"
chk "control: one push_log row" "$(sq "select count(*) from push_log where id > $PL1 and mode='edu-confirmed' and body like '%$TAG-r %'")" "1"
chk "no ids in church-admin responses" "$(noleak "$R")" "0"

echo "4) internalEduRemind — 내일 첫 날인 강좌의 확정+앱 계정만"
FOREIGN=$(sq "$FOREIGN_SQL")
if [ "$FOREIGN" != "0" ]; then echo "  내일이 첫 날인 다른 강좌의 확정자가 $FOREIGN 분 있다 — 그분들께도 가므로 여기서 멈춘다"; fail=$((fail+1)); echo "PASS $pass · FAIL $fail"; exit 1; fi
PL4=$(sq "select coalesce(max(id),0) from push_log")
# B — 첫 회차 내일 19:30(회차 장소 hall-B · 강좌 장소 room-B) · 확정 U3 · 대신 등록 확정 · 대기 U4 → 모집 끝(closed)
CB=$(sq "insert into edu_courses(title,kind,term,capacity,mode,waitlist,apply_from,apply_to,status,place) values ('$TAG-b','lecture','$TAG',2,'auto',true,edu_today()-1,edu_today()+30,'open','room-B') returning id")
sx "insert into edu_sessions(course_id,no,on_date,start_time,place) values ('$CB',1,edu_today()+1,'19:30','hall-B'),('$CB',2,edu_today()+8,'19:30','')"
EB3=$(sq "select (edu_apply('$CB','$U3',jsonb_build_object('name','$TAG-b3'))->>'id')")
EBS=$(sq "select (edu_apply('$CB',null,jsonb_build_object('name','$TAG-bs','ident_key','staff|x|||$TAG-bs'),true)->>'id')")
EB4=$(sq "select (edu_apply('$CB','$U4',jsonb_build_object('name','$TAG-b4'))->>'id')")
sx "update edu_courses set status='closed' where id='$CB'"
chk "setup B statuses" "$(sq "select string_agg(status, ',' order by id) from edu_enrollments where course_id='$CB'")" "confirmed,confirmed,waitlisted"
# C — 초안(draft) · 첫 회차 내일 · 확정 U1(담당자 길) → 빠져야
CC=$(sq "insert into edu_courses(title,kind,term,capacity,mode,waitlist,status) values ('$TAG-c','lecture','$TAG',null,'auto',true,'draft') returning id")
sx "insert into edu_sessions(course_id,no,on_date) values ('$CC',1,edu_today()+1)"
EC1=$(sq "select (edu_apply('$CC','$U1',jsonb_build_object('name','$TAG-c1'),true)->>'id')")
# D — 시작일은 내일이지만 첫 회차가 모레(첫 날 = 모레) · 확정 U2 → 빠져야
CD=$(sq "insert into edu_courses(title,kind,term,capacity,mode,waitlist,status,starts_on) values ('$TAG-d','lecture','$TAG',null,'auto',true,'running',edu_today()+1) returning id")
sx "insert into edu_sessions(course_id,no,on_date,start_time) values ('$CD',1,edu_today()+2,'10:00')"
ED2=$(sq "select (edu_apply('$CD','$U2',jsonb_build_object('name','$TAG-d2'),true)->>'id')")
# E — 회차 없이 시작일이 내일(첫 날 = 시작일) · 장소 room-E · 확정 U4 → 들어가야(시각 없이 장소만)
CE=$(sq "insert into edu_courses(title,kind,term,capacity,mode,waitlist,status,starts_on,place) values ('$TAG-e','lecture','$TAG',null,'auto',true,'running',edu_today()+1,'room-E') returning id")
EE4=$(sq "select (edu_apply('$CE','$U4',jsonb_build_object('name','$TAG-e4'),true)->>'id')")
chk "setup C/D/E confirmed" "$(sq "select string_agg(status, ',' order by id) from edu_enrollments where id in ($EC1,$ED2,$EE4)")" "confirmed,confirmed,confirmed"
chk "remind no key -> unauthorized" "$(jqn 'd.get("error")' "$(icall "" "$RB")")" "unauthorized"
chk "remind publishable key -> unauthorized" "$(jqn 'd.get("error")' "$(icall "$PUB" "$RB")")" "unauthorized"
chk "no first_day rows yet" "$(sq "select count(*) from edu_notify_log where kind='first_day'")" "0"
R=$(icall "$SK" "$RB")
chk "remind" "$(jqn '(d.get("ok"), d.get("day"), d.get("courses"), d.get("sent"), d.get("skipped"))' "$R")" "(True, '$TOMORROW', 2, 2, 0)"
chk "remind response keys" "$(jqn 'sorted(d.keys())' "$R")" "['courses', 'day', 'ok', 'sent', 'skipped']"
chk "no ids in remind response" "$(noleak "$R")" "0"
chk "first_day rows = B's U3 and E's U4 only" "$(sq "select string_agg(enrollment_id::text, ',' order by enrollment_id) from edu_notify_log where kind='first_day'")" "$(sq "select string_agg(x::text, ',' order by x) from unnest(array[$EB3,$EE4]::bigint[]) x")"
chk "not draft C / not D (first day the day after) / not waitlisted / not staff rows" "$(sq "select count(*) from edu_notify_log where enrollment_id in ($EC1,$ED2,$EB4,$EBS)")" "0"
chk "push_log edu-first-day rows" "$(sq "select count(*) from push_log where id > $PL4 and mode='edu-first-day'")" "2"
chk "B body: tomorrow · 19:30 · session place hall-B" "$(sq "select (left(body,2) = chr(45236)||chr(51068) and body like '%$TAG-b %' and body like '% 19:30 % hall-B')::text from push_log where id > $PL4 and mode='edu-first-day' and body like '%$TAG-b %'")" "true"
chk "E body: no time · course place room-E" "$(sq "select (body like '%$TAG-e %' and body like '% room-E' and body not like '%:%')::text from push_log where id > $PL4 and mode='edu-first-day' and body like '%$TAG-e %'")" "true"
D3=$(DEV "$U3"); D4=$(DEV "$U4")
chk "first-day push_log totals = devices" "$(sq "select string_agg(total::text, ',' order by body) from push_log where id > $PL4 and mode='edu-first-day'")" "$D3,$D4"
R=$(icall "$SK" "$RB")
chk "remind again -> nothing sent" "$(jqn '(d.get("courses"), d.get("sent"), d.get("skipped"))' "$R")" "(2, 0, 2)"
chk "still two first_day rows · no new push_log" "$(sq "select (select count(*) from edu_notify_log where kind='first_day')||':'||(select count(*) from push_log where id > $PL4 and mode='edu-first-day')")" "2:2"

echo "5) cleanup (trap 과 같은 것을 먼저 · 0줄 확인)"
cleanup
chk "courses gone" "$(sq "select count(*) from edu_courses where title like '$TAG-%'")" "0"
chk "enrollments gone" "$(sq "select count(*) from edu_enrollments where id in ($EGN,$EGT,$EHN,$EHT,$E1,$ES,$E2,$E3,$ER1,$ER2,$EB3,$EBS,$EB4,$EC1,$ED2,$EE4)")" "0"
chk "notify log gone (cascade)" "$(sq "select count(*) from edu_notify_log where enrollment_id in ($EGN,$EGT,$EHN,$EHT,$E1,$ES,$E2,$E3,$ER1,$ER2,$EB3,$EBS,$EB4,$EC1,$ED2,$EE4)")" "0"
chk "push_log rows of this run gone" "$(sq "select count(*) from push_log where id > $PL0 and mode in ('edu-confirmed','edu-first-day')")" "0"
chk "test staff gone (member · roles · audit)" "$(sq "select (select count(*) from admin_members where id='$CA_MID') + (select count(*) from admin_role_grants where member_id='$CA_MID') + (select count(*) from admin_audit where member_id='$CA_MID')")" "0"
chk "test auth user gone" "$(sq "select count(*) from auth.users where id='$CA_AU'")" "0"
chk "eduOpen restored" "$(sq "select count(*)||':'||coalesce(max(value::text),'') from app_config where key='eduOpen'")" "$OPEN_N:$OPEN_VAL"
echo
echo "PASS $pass · FAIL $fail"
[ "$fail" = "0" ]
