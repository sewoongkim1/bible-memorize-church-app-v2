#!/usr/bin/env bash
# 교육신청 4단계 앱 알림 — 개발 DB 끝까지 시험(쓰기 포함). ⚠️ 개발 전용: users 가 200 이상이면 거부한다.
#   bash tests/edu-notify.dev.sh
# 준비: supabase CLI 로그인. 작업 폴더(E2E_WORKDIR)가 없으면 임시로 만들어 개발에 link 한다.
# 하는 일: 시험 강좌를 만들어
#   ① internalEduNotify — 키 없음·틀린 키·공개 키는 unauthorized · 틀린 kind/번호는 거절 · 확정+앱 계정 한 분은 sent 1(기록 한 줄) ·
#      같은 부름 두 번째는 skipped · 대기·앱 계정 없는 줄은 skipped · 응답에 user_id 없음
#   ② 성도님 eduCancel 로 대기 첫 분이 올라가면 api 가 안에서 「자리가 나서 …」 알림(기록 한 줄 · push_log 한 줄)
#   ③ internalEduRemind — 내일(한국)이 첫 날인 강좌(첫 회차가 내일 · 회차 없이 시작일이 내일)의 확정+앱 계정만 ·
#      초안 강좌·첫 회차가 모레인 강좌(시작일이 내일이어도)·대기·앱 계정 없는 줄은 빠짐 · 두 번째는 0 · 키 없으면 unauthorized
#   를 보고, 강좌·신청(알림 기록은 cascade)·이번에 생긴 push_log 줄을 지워 0줄로 되돌린다. eduOpen 은 건드리지 않는다.
#   개발 사용자는 알림 기기가 없다 — edu_notify_log·push_log(total·sent 0)가 증거다(기기가 있으면 그 수를 센 값과 맞댄다).
# ⚠️ 서비스 키는 명령 안에서만 쓰고 찍지 않는다 — 교회 어드민 dev 시험과 같은 곳(~/.church-admin/dev.env DEV_SERVICE_KEY)을 먼저 보고,
#    그 키가 api 의 SUPABASE_SERVICE_ROLE_KEY 와 다르면(옛 JWT — 알려진 일) CLI 의 개발 secret 키(api-keys --reveal)를 쓴다. 맞는지는 빈 요청으로 본다.
# ⚠️ 본문에 한글을 쓰지 않는다(curl 이 깨뜨린다) — 한글 문구는 SQL chr(코드)로 맞댄다.
# ⚠️ 내일이 첫 날인 다른 강좌(남의 시험 자료)에 확정자가 있으면 그분들께도 가므로 ③ 앞에서 멈춘다.
set -u
REF=ktpwthwqzgcqcrmsafdo
BASE="https://$REF.supabase.co/functions/v1/api"
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

TAG=nt$RANDOM$RANDOM
PL0=$(sq "select coalesce(max(id),0) from push_log")
OPEN0=$(sq "select count(*) from app_config where key='eduOpen'")
[ -n "$PL0" ] && [ -n "$OPEN0" ] || { echo "시작 값을 못 읽었다"; exit 2; }
cleanup() {
  # 신청(알림 기록은 cascade) → 강좌(회차는 cascade) · 이번에 생긴 교육 알림 push_log 줄
  sx "delete from edu_attendance where enrollment_id in (select e.id from edu_enrollments e join edu_courses c on c.id=e.course_id where c.title like '$TAG-%'); delete from edu_enrollments where course_id in (select id from edu_courses where title like '$TAG-%'); delete from edu_courses where title like '$TAG-%'; delete from push_log where id > $PL0 and mode in ('edu-confirmed','edu-first-day') and body like '%$TAG-%'"
}
trap cleanup EXIT

U1=$(sq "select id from users where coalesce(name,'')<>'' order by created_at limit 1 offset 0")
U2=$(sq "select id from users where coalesce(name,'')<>'' order by created_at limit 1 offset 1")
U3=$(sq "select id from users where coalesce(name,'')<>'' order by created_at limit 1 offset 2")
U4=$(sq "select id from users where coalesce(name,'')<>'' order by created_at limit 1 offset 3")
[ -n "$U1" ] && [ -n "$U2" ] && [ -n "$U3" ] && [ -n "$U4" ] || { echo "사용자 넷을 못 골랐다"; exit 2; }
DEV() { sq "select (select count(*) from push_subscriptions where user_id='$1') + (select count(*) from ios_push_tokens where user_id='$1')"; }   # 그분 기기 수
noleak() { printf '%s' "$1" | grep -c -e "$U1" -e "$U2" -e "$U3" -e "$U4" -e "user_id" -e "ident_key"; }

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
echo "course A=$CA · E1=$E1 ES=$ES E2=$E2 E3=$E3"

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
chk "push_log edu-confirmed rows" "$(sq "select count(*) from push_log where id > $PL0 and mode='edu-confirmed'")" "1"
D1=$(DEV "$U1")
chk "push_log total = U1 devices · sent <= total" "$(sq "select (total = $D1 and sent <= total and failed + sent = total)::text from push_log where id > $PL0 and mode='edu-confirmed'")" "true"
chk "push_log title" "$(sq "select (title = chr(127891)||' '||chr(44368)||chr(50977))::text from push_log where id > $PL0 and mode='edu-confirmed'")" "true"
chk "push_log body (title · first session 14:00)" "$(sq "select (body like '$TAG-a %' and body like '% 14:00' and position(chr(52395)||' '||chr(49884)||chr(44036) in body) > 0)::text from push_log where id > $PL0 and mode='edu-confirmed'")" "true"
chk "push_log body has no ids" "$(sq "select count(*) from push_log where id > $PL0 and (coalesce(body,'') like '%$U1%' or coalesce(note,'') like '%$U1%')")" "0"
R=$(icall "$SK" "$NB")
chk "second call skipped" "$(jqn '(d.get("ok"), d.get("sent"), d.get("skipped"))' "$R")" "(True, 0, 1)"
chk "still one log row" "$(sq "select count(*) from edu_notify_log where enrollment_id=$E1")" "1"
chk "no new push_log row" "$(sq "select count(*) from push_log where id > $PL0 and mode='edu-confirmed'")" "1"
R=$(icall "$SK" "{\"action\":\"internalEduNotify\",\"kind\":\"confirmed\",\"enrollment_ids\":[$E2,$ES,$E3,$E1,$E1],\"promoted\":true}")
chk "waitlisted / no-account / already (same id twice counts once) -> skipped" "$(jqn '(d.get("ok"), d.get("sent"), d.get("skipped"))' "$R")" "(True, 0, 4)"
chk "no log for waitlisted / staff rows" "$(sq "select count(*) from edu_notify_log where enrollment_id in ($ES,$E2,$E3)")" "0"

echo "3) 성도님 취소로 대기 첫 분(U2)이 올라감 -> api 안에서 「자리가 나서」 알림"
C=$(call "{\"action\":\"eduCancel\",\"user_id\":\"$U1\",\"enrollment_id\":$E1}")
chk "eduCancel ok/promoted" "$(jqn '(d.get("ok"), d.get("promoted"))' "$C")" "(True, True)"
chk "eduCancel response keys" "$(jqn 'sorted(d.keys())' "$C")" "['ok', 'promoted']"
chk "E2 confirmed" "$(sq "select status from edu_enrollments where id=$E2")" "confirmed"
chk "E2 confirmed log row" "$(sq "select count(*)||':'||min(kind) from edu_notify_log where enrollment_id=$E2")" "1:confirmed"
chk "push_log edu-confirmed rows" "$(sq "select count(*) from push_log where id > $PL0 and mode='edu-confirmed'")" "2"
chk "promoted body starts with jari-ga naseo" "$(sq "select (left(body,2) = chr(51088)||chr(47532) and body like '%$TAG-a %')::text from push_log where id > $PL0 and mode='edu-confirmed' order by id desc limit 1")" "true"
chk "E3 still waitlisted · no log" "$(sq "select status||':'||(select count(*) from edu_notify_log where enrollment_id=$E3) from edu_enrollments where id=$E3")" "waitlisted:0"
R=$(icall "$SK" "{\"action\":\"internalEduNotify\",\"kind\":\"confirmed\",\"enrollment_ids\":[$E2]}")
chk "E2 again (staff path) -> skipped" "$(jqn '(d.get("sent"), d.get("skipped"))' "$R")" "(0, 1)"

echo "4) internalEduRemind — 내일 첫 날인 강좌의 확정+앱 계정만"
FOREIGN=$(sq "select count(*) from edu_enrollments e join edu_courses c on c.id=e.course_id where e.status='confirmed' and e.user_id is not null and c.status not in ('draft','archived','done') and c.title not like '$TAG-%' and coalesce((select min(on_date) from edu_sessions s where s.course_id=c.id), c.starts_on) = edu_today()+1 and not exists (select 1 from edu_notify_log l where l.enrollment_id=e.id and l.kind='first_day')")
if [ "$FOREIGN" != "0" ]; then echo "  내일이 첫 날인 다른 강좌의 확정자가 $FOREIGN 분 있다 — 그분들께도 가므로 여기서 멈춘다"; fail=$((fail+1)); echo "PASS $pass · FAIL $fail"; exit 1; fi
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
TOMORROW=$(sq "select (edu_today()+1)::text")
RB="{\"action\":\"internalEduRemind\"}"
chk "remind no key -> unauthorized" "$(jqn 'd.get("error")' "$(icall "" "$RB")")" "unauthorized"
chk "remind publishable key -> unauthorized" "$(jqn 'd.get("error")' "$(icall "$PUB" "$RB")")" "unauthorized"
chk "no first_day rows yet" "$(sq "select count(*) from edu_notify_log where kind='first_day'")" "0"
R=$(icall "$SK" "$RB")
chk "remind" "$(jqn '(d.get("ok"), d.get("day"), d.get("courses"), d.get("sent"), d.get("skipped"))' "$R")" "(True, '$TOMORROW', 2, 2, 0)"
chk "remind response keys" "$(jqn 'sorted(d.keys())' "$R")" "['courses', 'day', 'ok', 'sent', 'skipped']"
chk "no ids in remind response" "$(noleak "$R")" "0"
chk "first_day rows = B's U3 and E's U4 only" "$(sq "select string_agg(enrollment_id::text, ',' order by enrollment_id) from edu_notify_log where kind='first_day'")" "$(sq "select string_agg(x::text, ',' order by x) from unnest(array[$EB3,$EE4]::bigint[]) x")"
chk "not draft C / not D (first day the day after) / not waitlisted / not staff rows" "$(sq "select count(*) from edu_notify_log where enrollment_id in ($EC1,$ED2,$EB4,$EBS)")" "0"
chk "push_log edu-first-day rows" "$(sq "select count(*) from push_log where id > $PL0 and mode='edu-first-day'")" "2"
chk "B body: tomorrow · 19:30 · session place hall-B" "$(sq "select (left(body,2) = chr(45236)||chr(51068) and body like '%$TAG-b %' and body like '% 19:30 % hall-B')::text from push_log where id > $PL0 and mode='edu-first-day' and body like '%$TAG-b %'")" "true"
chk "E body: no time · course place room-E" "$(sq "select (body like '%$TAG-e %' and body like '% room-E' and body not like '%:%')::text from push_log where id > $PL0 and mode='edu-first-day' and body like '%$TAG-e %'")" "true"
D3=$(DEV "$U3"); D4=$(DEV "$U4")
chk "first-day push_log totals = devices" "$(sq "select string_agg(total::text, ',' order by body) from push_log where id > $PL0 and mode='edu-first-day'")" "$D3,$D4"
R=$(icall "$SK" "$RB")
chk "remind again -> nothing sent" "$(jqn '(d.get("courses"), d.get("sent"), d.get("skipped"))' "$R")" "(2, 0, 2)"
chk "still two first_day rows · no new push_log" "$(sq "select (select count(*) from edu_notify_log where kind='first_day')||':'||(select count(*) from push_log where id > $PL0 and mode='edu-first-day')")" "2:2"

echo "5) cleanup (trap 과 같은 것을 먼저 · 0줄 확인)"
cleanup
chk "courses gone" "$(sq "select count(*) from edu_courses where title like '$TAG-%'")" "0"
chk "enrollments gone" "$(sq "select count(*) from edu_enrollments where id in ($E1,$ES,$E2,$E3,$EB3,$EBS,$EB4,$EC1,$ED2,$EE4)")" "0"
chk "notify log gone (cascade)" "$(sq "select count(*) from edu_notify_log where enrollment_id in ($E1,$ES,$E2,$E3,$EB3,$EBS,$EB4,$EC1,$ED2,$EE4)")" "0"
chk "push_log rows of this run gone" "$(sq "select count(*) from push_log where id > $PL0 and mode in ('edu-confirmed','edu-first-day')")" "0"
chk "eduOpen untouched" "$(sq "select count(*) from app_config where key='eduOpen'")" "$OPEN0"
echo
echo "PASS $pass · FAIL $fail"
[ "$fail" = "0" ]
