#!/usr/bin/env bash
# 봉사 당번 3단계 앱 알림 — 개발 DB 끝까지 시험(쓰기 포함). ⚠️ 개발 전용: users 가 200 이상이면 거부한다.
#   bash tests/duty-notify.dev.sh
# 준비: supabase CLI 로그인. 작업 폴더(E2E_WORKDIR)가 없으면 임시로 만들어 개발에 link 한다.
#        개발 app_config ministryTesters(🧪 시험 참여자)에 앱 계정 한 분이 있어야 한다(문 시험의 시험 참여자 몫 — 없으면 멈춘다).
# 하는 일: 시험 당번(오늘 · 내일 · 사흘 뒤 자리)을 만들어
#   0) 문 — dutyOpen 이 없으면: 시험 참여자 아닌 분은 확정 알림으로도 안 잡힌다(기록·push_log 없음) · 시험 참여자는 잡힌다 · 문을 열면 걸러졌던 분은 그때 간다
#   1) internalDutyNotify — 키 없음·틀린 키·공개 키는 unauthorized · 틀린 kind(remind·applied 는 밖에서 못 부른다)·번호는 거절
#   2) 확정은 같은 줄에 한 번 · 전날 저녁이 지난 날(오늘)의 확정은 보내지 않는다 · 계정 없는 줄·본인 취소 줄은 빠진다
#   3) 넣음·옮김·뺌·쉼·다시 엶 — 저장 한 번에 한 번(잡지 않는다) · 쉬는 자리의 줄에는 「쉬어요」만 간다
#   4) internalDutyRemind — 내일 당번인 분께 한 번(한 분의 두 자리는 한 통) · 두 번째는 0 · 쉬는 자리는 빠짐 · 키 없으면 unauthorized
#   5) 잠긴 날의 앱 지원(dutyApply ack_locked) → 그 계정에 곧바로(응답 뒤에 돌아서 기다려 본다)
#   를 보고, 당번·자리·지원(알림 기록은 cascade)·이번에 생긴 push_log 줄을 지워 0줄로 되돌린다.
#   dutyOpen 은 0) 에서 지우고(없음) 1) 부터 true 로 켠다 — **끝나면(실패해도 trap) 시작 전 값으로** 되돌린다.
#   개발 사용자는 알림 기기가 없다 — duty_notify_log·push_log(total·sent 0)가 증거다(기기가 있으면 그 수를 센 값과 맞댄다).
#   응답의 sent = 실제로 나간 분 · missed = 가지 않은 분(받는 기기 없음·모두 실패) — 「말한 분 수」는 둘의 합(TOLD)으로 본다.
#   기기가 없는 분은 sent 0 · missed 1 이어야 한다(담당자 화면이 그분께 「보냈어요」라고 하지 않게 — 검토 반영 2026-10-07).
# ⚠️ 서비스 키는 명령 안에서만 쓰고 찍지 않는다 — 교회 어드민 dev 시험과 같은 곳(~/.church-admin/dev.env DEV_SERVICE_KEY)을 먼저 보고,
#    그 키가 api 의 SUPABASE_SERVICE_ROLE_KEY 와 다르면 CLI 의 개발 secret 키(api-keys --reveal)를 쓴다. 맞는지는 빈 요청으로 본다.
# ⚠️ 본문에 한글을 쓰지 않는다(curl 이 깨뜨린다) — 한글 문구는 SQL chr(코드)·position 으로 맞댄다. 당번 이름은 TAG(영문·숫자).
# ⚠️ 내일 당번인 다른 당번의 줄(남의 시험 자료)이 있으면 그분들께도 가므로 4) 앞에서 멈춘다.
set -u
REF=ktpwthwqzgcqcrmsafdo
BASE="https://$REF.supabase.co/functions/v1/api"
PUB="sb_publishable_eJKP6u95IU9_DBXTvnvYBA_-yGCf-0Y"

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
# 응답 뒤에 도는 일(잠긴 날 앱 지원 알림 · EdgeRuntime.waitUntil)을 기다려 본다 — SQL 값이 기대값이 될 때까지(15번까지 · 1초 간격)
poll() { local v="" i; for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do v=$(sq "$1"); [ "$v" = "$2" ] && break; sleep 1; done; printf '%s' "$v"; }

N=$(sq "select count(*) from users")
if [ -z "$N" ] || [ "$N" -ge 200 ]; then echo "users=$N — 개발이 아닌 것 같다. 중단."; exit 2; fi
echo "dev users=$N"

# 서비스 키(찍지 않는다) — 빈 요청이 {ok:true} 면 맞는 키
probe() { icall "$1" '{"action":"internalDutyNotify","kind":"confirmed","signup_ids":[]}' | grep -c '"ok":true'; }
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

TAG=dn$RANDOM$RANDOM
PL0=$(sq "select coalesce(max(id),0) from push_log")
OPEN_N=$(sq "select count(*) from app_config where key='dutyOpen'")
[ -n "$PL0" ] && [ -n "$OPEN_N" ] || { echo "시작 값을 못 읽었다"; exit 2; }
OPEN_VAL=""
[ "$OPEN_N" != "0" ] && OPEN_VAL=$(sq "select value::text from app_config where key='dutyOpen'")
# 원래 값을 못 읽었으면(CLI 가 한 번 삐끗) 쓰기 전에 멈춘다 — 모르는 값으로 되돌리면 켜 둔 문이 그대로 남는다(검토 반영 2026-10-07)
case "$OPEN_N:$OPEN_VAL" in 0:|1:true|1:false|1:null) ;; *) echo "dutyOpen 원래 값을 못 읽었다($OPEN_N:$OPEN_VAL) — 아무것도 쓰지 않고 중단"; exit 2;; esac
OFF_N=$(sq "select count(*) from app_config where key='dutyNotifyOff'")
[ "$OFF_N" = "0" ] || { echo "개발 dutyNotifyOff 가 켜져 있다 — 알림이 꺼진 채라 시험할 수 없다. 중단."; exit 2; }
RUN_VAL=$(sq "select coalesce((select value::text from app_config where key='dutyRemindRun'), '')")
# 흔적의 원래 값도 꼴을 본다(없음 또는 {…}) — 못 읽은 값으로 되돌려 쓰지 않게(고침 검토 반영 2026-10-07)
case "$RUN_VAL" in ""|\{*\}) ;; *) echo "dutyRemindRun 원래 값을 못 읽었다 — 아무것도 쓰지 않고 중단"; exit 2;; esac
echo "dutyOpen 원래: $OPEN_N ${OPEN_VAL}"
BID=""
cleanup() {
  # 지원(알림 기록은 cascade) → 자리 → 날짜 → 틀 → 당번 · 이번에 생긴 당번 알림 push_log 줄(글에 TAG 가 있는 것만)
  #   당번은 이름(TAG)으로 찾는다 — 만들기의 답을 못 읽어 BID 가 비어 있어도 남지 않게(고침 검토 반영 2026-10-07)
  local MINE="select id from duty_boards where title='$TAG'"
  sx "delete from duty_signups where slot_id in (select id from duty_slots where board_id in ($MINE)); delete from duty_slots where board_id in ($MINE); delete from duty_days where board_id in ($MINE); delete from duty_lines where board_id in ($MINE); delete from duty_boards where title='$TAG'"
  sx "delete from push_log where id > $PL0 and mode like 'duty-%' and body like '%$TAG%'"
  if [ "$OPEN_N" = "0" ]; then sx "delete from app_config where key='dutyOpen'"
  else sx "insert into app_config(key,value) values('dutyOpen','$OPEN_VAL'::jsonb) on conflict (key) do update set value='$OPEN_VAL'::jsonb"; fi
  sx "delete from app_config where key='dutyNotifyOff'"
  if [ -z "$RUN_VAL" ]; then sx "delete from app_config where key='dutyRemindRun'"
  else sx "update app_config set value='$RUN_VAL'::jsonb where key='dutyRemindRun'"; fi
  # 되돌렸는지 다시 읽어 찍는다(정리가 실패해도 조용히 지나가지 않게)
  echo "정리 뒤 — 시험 당번 $(sq "select count(*) from duty_boards where title='$TAG'") · dutyOpen $(sq "select coalesce((select value::text from app_config where key='dutyOpen'), '(없음)')")(원래 ${OPEN_VAL:-(없음)}) · dutyNotifyOff $(sq "select count(*) from app_config where key='dutyNotifyOff'")"
}
trap cleanup EXIT

# 시험 참여자(UT)와 아닌 분(UN·U1·U2) — api ministryKeysToUsers 와 같은 풀이(지금 키는 users · 옛 키는 user_identity_aliases)
TESTERS="select u.id from users u where u.identity_key in (select jsonb_array_elements_text(value) from app_config where key='ministryTesters') union select a.user_id from user_identity_aliases a where a.identity_key in (select jsonb_array_elements_text(value) from app_config where key='ministryTesters')"
OKU="type='교구' and name ~ '^[가-힣]{2,10}\$'"   # 앱에서 지원할 수 있는 계정(어린이 부서 아님 · 당번표에 실을 수 있는 이름)
UT=$(sq "select id from users where $OKU and id in ($TESTERS) order by created_at limit 1")
UN=$(sq "select id from users where $OKU and id not in ($TESTERS) order by created_at limit 1 offset 0")
U1=$(sq "select id from users where $OKU and id not in ($TESTERS) order by created_at limit 1 offset 1")
U2=$(sq "select id from users where $OKU and id not in ($TESTERS) order by created_at limit 1 offset 2")
[ -n "$UT" ] || { echo "개발 ministryTesters 에 (교구 · 한글 이름) 앱 계정이 없다 — 교회 어드민 「🧪 시험 참여자」에 한 분을 올리고 돌릴 것. 중단."; exit 2; }
[ -n "$UN" ] && [ -n "$U1" ] && [ -n "$U2" ] || { echo "시험 참여자 아닌 사용자 셋을 못 골랐다"; exit 2; }
DEV() { sq "select (select count(*) from push_subscriptions where user_id='$1') + (select count(*) from ios_push_tokens where user_id='$1')"; }   # 그분 기기 수
noleak() { printf '%s' "$1" | grep -c -e "$UT" -e "$UN" -e "$U1" -e "$U2" -e "user_id" -e "ident_key" -e "uid"; }
# 고른 계정에 진짜 기기가 있으면 시험 글 알림이 그 기기로 간다(알림 주소는 운영 주소다 — 누르면 운영 앱이 열린다) → 멈춘다.
#   일부러 기기로 받아 보려면 ALLOW_DEVICES=1(고침 검토 반영 2026-10-07 · 아직 아무것도 쓰기 전이다)
DEVS=0; for X in "$UT" "$UN" "$U1" "$U2"; do V=$(DEV "$X"); DEVS=$((DEVS + ${V:-0})); done
if [ "$DEVS" != "0" ] && [ -z "${ALLOW_DEVICES:-}" ]; then echo "고른 개발 계정에 받는 기기가 $DEVS 대 있다 — 시험 글 알림이 그 기기로 간다. 중단(ALLOW_DEVICES=1 로 넘길 수 있다)."; exit 2; fi
ident() { echo "jsonb_build_object('name','$TAG-$1','who_type','x','ident_key','$TAG|$1')"; }
NB() { echo "{\"action\":\"internalDutyNotify\",\"kind\":\"$1\",\"signup_ids\":[$2]}"; }
RB='{"action":"internalDutyRemind","anytime":true}'   # 시각을 알고 부른다(한국 19시 전의 부름은 too-early — 크론은 anytime 을 싣지 않는다)
RB_CRON='{"action":"internalDutyRemind"}'
TOLD='(d.get("sent") or 0) + (d.get("missed") or 0)'      # 말한 분 수(실제로 나간 분 + 가지 않은 분)
KST_H=$(python -c 'import datetime; print((datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=9)).hour)')
LOGN() { sq "select count(*) from duty_notify_log where signup_id in ($1) and kind='$2'"; }
PLN() { sq "select count(*) from push_log where id > $PL0 and mode='duty-$1' and body like '%$TAG%'"; }

# 당번 — 받는 중 · 날짜를 골라 넣는 틀 둘(가 09:00~10:00 · 나 11:00~12:00 · 정원 6) × 오늘·내일·사흘 뒤
BID=$(sq "insert into duty_boards(title,place,status,open_days) values ('$TAG','$TAG-place','open',28) returning id")
[ -n "$BID" ] || { echo "당번 만들기 실패"; exit 2; }
LA=$(sq "select duty_line_save('$BID', jsonb_build_object('service','ga','task','','start','09:00','end','10:00','capacity',6), false)->>'id'")
LB=$(sq "select duty_line_save('$BID', jsonb_build_object('service','na','task','','start','11:00','end','12:00','capacity',6), false)->>'id'")
[ -n "$LA" ] && [ -n "$LB" ] || { echo "자리 틀 만들기 실패"; exit 2; }
D0=$(sq "select duty_today()::text"); D1=$(sq "select (duty_today()+1)::text"); D3=$(sq "select (duty_today()+3)::text")
for D in "$D0" "$D1" "$D3"; do sx "select duty_date_add('$BID', '$D', array[$LA,$LB]::bigint[])"; done
slot() { sq "select s.id from duty_slots s where s.board_id='$BID' and s.on_date='$2' and s.line_id=$1"; }
A0=$(slot "$LA" "$D0"); A1=$(slot "$LA" "$D1"); B1=$(slot "$LB" "$D1"); A3=$(slot "$LA" "$D3"); B3=$(slot "$LB" "$D3")
[ -n "$A0" ] && [ -n "$A1" ] && [ -n "$B1" ] && [ -n "$A3" ] && [ -n "$B3" ] || { echo "자리를 못 찾았다"; exit 2; }
app() { sq "select duty_apply($1, '$2', $(ident "$3"), false, false, true)->>'id'"; }          # 앱으로 지원한 줄(잠긴 날은 ack)
staff() { sq "select duty_apply($1, $2, $(ident "$3"), true, true)->>'id'"; }                   # 담당자가 넣은 줄($2 = '계정' 또는 null)
echo "board=$BID · D0=$D0 D1=$D1 D3=$D3"

echo "0) 문 — dutyOpen 없음: 시험 참여자 아닌 분은 안 잡힌다 · 시험 참여자는 잡힌다 · 문을 열면 걸러졌던 분도 그때 간다"
sx "delete from app_config where key='dutyOpen'"
EN=$(app "$A3" "$UN" n); ET=$(app "$A3" "$UT" t)
[ -n "$EN" ] && [ -n "$ET" ] || { echo "지원 줄 만들기 실패"; exit 2; }
chk "confirm day (SQL) returns both ids" "$(sq "select jsonb_array_length(duty_day_set('$BID','$D3','confirm',null,null)->'ids')")" "2"
R=$(icall "$SK" "$(NB confirmed "$EN")")
chk "gate closed: non-tester -> told 0" "$(jqn '(d.get("ok"), d.get("sent"), d.get("missed"))' "$R")" "(True, 0, 0)"
chk "gate closed: non-tester not claimed" "$(LOGN "$EN" confirmed)" "0"
chk "gate closed: no push_log row" "$(PLN confirmed)" "0"
R=$(icall "$SK" "$(NB confirmed "$ET")")
chk "gate closed: tester -> told 1" "$(jqn "(d.get(\"ok\"), $TOLD)" "$R")" "(True, 1)"
if [ "$(DEV "$UT")" = "0" ]; then chk "tester has no device -> sent 0, missed 1 (never 'sent')" "$(jqn '(d.get("sent"), d.get("missed"))' "$R")" "(0, 1)"; fi
chk "response keys" "$(jqn 'sorted(d.keys())' "$R")" "['missed', 'ok', 'sent']"
chk "no ids in response" "$(noleak "$R")" "0"
chk "gate closed: tester claimed" "$(LOGN "$ET" confirmed)" "1"
chk "gate closed: one push_log row (tester's devices)" "$(sq "select count(*)||':'||(sum(total) = $(DEV "$UT"))::text from push_log where id > $PL0 and mode='duty-confirmed' and body like '%$TAG%'")" "1:true"
chk "push_log title" "$(sq "select (title = chr(128587)||' '||chr(48393)||chr(49324)||' '||chr(45817)||chr(48264))::text from push_log where id > $PL0 and mode='duty-confirmed' and body like '%$TAG%'")" "true"
R=$(icall "$SK" "$(NB confirmed "$EN,$ET")")
chk "gate closed: both again -> 0" "$(jqn "$TOLD" "$R")" "0"
sx "insert into app_config(key,value) values('dutyOpen','true'::jsonb) on conflict (key) do update set value='true'::jsonb"
R=$(icall "$SK" "$(NB confirmed "$EN,$ET")")
chk "gate open: the filtered-out non-tester is told now (tester already)" "$(jqn "$TOLD" "$R")" "1"
chk "gate open: both claimed" "$(LOGN "$EN,$ET" confirmed)" "2"
echo "   dutyOpen true from here"

echo "1) internalDutyNotify — 문(서비스 키만) · 틀린 입력"
chk "no key -> unauthorized" "$(jqn 'd.get("error")' "$(icall "" "$(NB added "$EN")")")" "unauthorized"
chk "wrong key -> unauthorized" "$(jqn 'd.get("error")' "$(icall "x-$TAG-not-the-key-0000000000000000" "$(NB added "$EN")")")" "unauthorized"
chk "publishable key as internal key -> unauthorized" "$(jqn 'd.get("error")' "$(icall "$PUB" "$(NB added "$EN")")")" "unauthorized"
chk "bearer only (app path) -> unauthorized" "$(jqn 'd.get("error")' "$(call "$(NB added "$EN")")")" "unauthorized"
chk "remind from outside -> bad-kind" "$(jqn 'd.get("error")' "$(icall "$SK" "$(NB remind "$EN")")")" "bad-kind"
chk "applied from outside -> bad-kind" "$(jqn 'd.get("error")' "$(icall "$SK" "$(NB applied "$EN")")")" "bad-kind"
chk "unknown kind -> bad-kind" "$(jqn 'd.get("error")' "$(icall "$SK" "$(NB zzz "$EN")")")" "bad-kind"
chk "ids not array" "$(jqn 'd.get("error")' "$(icall "$SK" '{"action":"internalDutyNotify","kind":"added","signup_ids":"1"}')")" "bad-args"
chk "id 0" "$(jqn 'd.get("error")' "$(icall "$SK" '{"action":"internalDutyNotify","kind":"added","signup_ids":[0]}')")" "bad-args"
chk "nothing sent by refused calls" "$(sq "select count(*) from push_log where id > $PL0 and mode='duty-added' and body like '%$TAG%'")" "0"

echo "2) 확정 — 전날 저녁이 지난 날(오늘)은 보내지 않는다 · 계정 없는 줄·본인이 취소한 줄은 빠진다"
E0=$(staff "$A0" "'$U1'" u1)                      # 오늘 자리(이미 잠긴 날)
ES=$(staff "$B3" "null" s)                         # 계정 없는 줄
EC=$(app "$B3" "$U2" u2); sx "update duty_days set confirmed_at = null where board_id='$BID' and on_date='$D3'"
chk "self cancel (SQL)" "$(sq "select duty_cancel($EC, '$U2', false)->>'ok'")" "true"
P=$(PLN confirmed)
R=$(icall "$SK" "$(NB confirmed "$E0,$ES,$EC")")
chk "today's row / no-account row / cancelled row -> 0" "$(jqn "$TOLD" "$R")" "0"
chk "none claimed" "$(LOGN "$E0,$ES,$EC" confirmed)" "0"
chk "no new push_log row" "$(PLN confirmed)" "$P"

echo "3) 넣음 · 옮김 · 뺌 · 쉼 · 다시 엶 — 저장 한 번에 한 번(잡지 않는다)"
EA=$(staff "$B3" "'$U1'" u1)
R=$(icall "$SK" "$(NB added "$EA")"); chk "added -> 1" "$(jqn "$TOLD" "$R")" "1"
chk "added push_log row with the board name" "$(PLN added)" "1"
chk "added again -> 1 again (not claimed)" "$(jqn "$TOLD" "$(icall "$SK" "$(NB added "$EA")")")" "1"
chk "no claim rows for added" "$(sq "select count(*) from duty_notify_log where signup_id=$EA")" "0"
chk "move (SQL)" "$(sq "select duty_move($EA, $A3, true)->>'ok'")" "true"
R=$(icall "$SK" "$(NB moved "$EA")"); chk "moved -> 1" "$(jqn "$TOLD" "$R")" "1"
chk "moved push_log body has both slots (na -> ga)" "$(sq "select (position('na 11:00' in body) > 0 and position('ga 09:00' in body) > 0)::text from push_log where id > $PL0 and mode='duty-moved' and body like '%$TAG%' order by id desc limit 1")" "true"
chk "slot off (SQL)" "$(sq "select duty_slot_set($A3, null, true, (select count(*)::int from duty_signups where slot_id=$A3 and status='active'))->>'off'")" "true"
R=$(icall "$SK" "$(NB off "$EN,$ET,$EA")"); chk "off -> 3 people" "$(jqn "$TOLD" "$R")" "3"
chk "off: same text -> one push_log row" "$(PLN off)" "1"
chk "confirmed/added/moved to an off row -> 0" "$(jqn "$TOLD" "$(icall "$SK" "$(NB added "$EA")")")" "0"
chk "slot on (SQL)" "$(sq "select duty_slot_set($A3, null, false)->>'off'")" "false"
R=$(icall "$SK" "$(NB reopen "$EN,$ET,$EA")"); chk "reopen -> 3" "$(jqn "$TOLD" "$R")" "3"
chk "off to a not-off row -> 0" "$(jqn "$TOLD" "$(icall "$SK" "$(NB off "$EA")")")" "0"
chk "staff removes (SQL)" "$(sq "select duty_cancel($EA, null, true)->>'ok'")" "true"
R=$(icall "$SK" "$(NB removed "$EA,$EC")"); chk "removed -> 1 (self-cancelled row is not told)" "$(jqn "$TOLD" "$R")" "1"
# 검토 반영(2026-10-07) — 겹친 줄(같은 자리 · 같은 이름)을 정리하며 앱 줄을 뺀 것은 알리지 않는다 · 확정이 풀린 날에는 「확정됐어요」를 보내지 않는다 · 끄는 스위치
EDA=$(staff "$B3" "'$U1'" u1); EDS=$(sq "select duty_apply($B3, null, jsonb_build_object('name','$TAG-u1','who_type','x','ident_key','staff|$TAG|dup'), true, true)->>'id'")
chk "duplicate rows prepared (account row + no-account row, same name)" "$( [ -n "$EDA" ] && [ -n "$EDS" ] && [ "$EDA" != "$EDS" ] && echo ok )" "ok"
chk "remove the account row of a duplicate (SQL)" "$(sq "select duty_cancel($EDA, null, true)->>'ok'")" "true"
P=$(PLN removed)
chk "removed, but a same-name row still stands in that slot -> not told" "$(jqn "$TOLD" "$(icall "$SK" "$(NB removed "$EDA")")")" "0"
chk "no push_log row for it" "$(PLN removed)" "$P"
EU=$(staff "$A3" "'$U2'" u2)
chk "confirm then unconfirm (SQL)" "$(sq "select (duty_day_set('$BID','$D3','confirm',null,null)->>'ok') || '/' || (duty_day_set('$BID','$D3','unconfirm',null,null)->>'ok')")" "true/true"
chk "confirmed for a day that is no longer confirmed -> not told, not claimed" "$(jqn "$TOLD" "$(icall "$SK" "$(NB confirmed "$EU")")"):$(LOGN "$EU" confirmed)" "0:0"
sx "insert into app_config(key,value) values('dutyNotifyOff','true'::jsonb) on conflict (key) do update set value='true'::jsonb"
P_ADD=$(PLN added)
R=$(icall "$SK" "$(NB added "$EU")")
chk "switch off (dutyNotifyOff): nothing told, off:true" "$(jqn '(d.get("ok"), d.get("sent"), d.get("missed"), d.get("off"))' "$R")" "(True, 0, 0, True)"
# 고침 검토 반영(2026-10-07) — 꺼 둔 동안에도 「보낼 알림이 있었나」(held)는 돌려준다: 알림이 갈 일이 없던 저장에까지 담당자 화면이 「따로 알려 주세요」 창을 띄우지 않게
chk "switch off: held = people who would have been told" "$(jqn 'd.get("held")' "$R")" "1"
chk "switch off: a no-account row -> held 0 (nobody to tell)" "$(jqn '(d.get("off"), d.get("held"))' "$(icall "$SK" "$(NB added "$ES")")")" "(True, 0)"
chk "switch off: response keys" "$(jqn 'sorted(d.keys())' "$R")" "['held', 'missed', 'off', 'ok', 'sent']"
chk "switch off: nothing sent" "$(PLN added)" "$P_ADD"
# 회귀 확인 반영(2026-10-07) — 확정·전날의 held 는 이미 받은(잡힌) 줄을 세지 않는다: 이미 확정 알림을 받은 날의 「확정 풀기 → 다시 확정」에 「따로 알려 주세요」 창이 뜨지 않게
chk "confirm the day again (SQL)" "$(sq "select duty_day_set('$BID','$D3','confirm',null,null)->>'ok'")" "true"
chk "switch off: rows already told 'confirmed' -> held 0" "$(jqn '(d.get("off"), d.get("held"))' "$(icall "$SK" "$(NB confirmed "$EN,$ET")")")" "(True, 0)"
chk "switch off: plus one row not told yet -> held 1" "$(jqn '(d.get("off"), d.get("held"))' "$(icall "$SK" "$(NB confirmed "$EN,$ET,$EU")")")" "(True, 1)"
chk "switch off: reading held claims nothing" "$(LOGN "$EU" confirmed)" "0"
chk "unconfirm again (SQL)" "$(sq "select duty_day_set('$BID','$D3','unconfirm',null,null)->>'ok'")" "true"
sx "delete from app_config where key='dutyNotifyOff'"
chk "switch on again -> told" "$(jqn "$TOLD" "$(icall "$SK" "$(NB added "$EU")")")" "1"
chk "no ids in push_log" "$(sq "select count(*) from push_log where id > $PL0 and mode like 'duty-%' and (coalesce(body,'') like '%$UT%' or coalesce(body,'') like '%$UN%' or coalesce(body,'') like '%$U1%' or coalesce(note,'') like '%$U1%')")" "0"

echo "4) internalDutyRemind — 내일 당번인 분께 한 번 · 한 분의 두 자리는 한 통 · 쉬는 자리는 빠짐"
FOREIGN=$(sq "select count(*) from duty_signups e join duty_slots s on s.id=e.slot_id join duty_days d on d.board_id=s.board_id and d.on_date=s.on_date join duty_boards b on b.id=s.board_id where s.on_date=duty_today()+1 and e.status='active' and e.user_id is not null and not s.off and not d.off and b.status in ('open','closed') and b.id <> '$BID' and not exists (select 1 from duty_notify_log l where l.signup_id=e.id and l.kind='remind')")
if [ "$FOREIGN" != "0" ]; then echo "  내일 당번인 다른 당번의 줄이 $FOREIGN 개 있다 — 그분들께도 가므로 여기서 멈춘다"; fail=$((fail+1)); echo "PASS $pass · FAIL $fail"; exit 1; fi
R1=$(app "$A1" "$UT" t); R2=$(app "$B1" "$UT" t); R3=$(staff "$A1" "'$U1'" u1); R4=$(staff "$B1" "null" s2)
chk "no key -> unauthorized" "$(jqn 'd.get("error")' "$(icall "" "$RB")")" "unauthorized"
if [ "$KST_H" -lt 19 ]; then chk "before 19:00 KST the cron body is refused (too-early, nothing claimed)" "$(jqn 'd.get("error")' "$(icall "$SK" "$RB_CRON")"):$(LOGN "$R1,$R2,$R3,$R4" remind)" "too-early:0"
else echo "  (한국 19시가 지났다 — too-early 는 이 시각에 볼 수 없다 · 낮에 돌리면 본다)"; fi
# 고침 검토 반영(2026-10-07) — 흔적은 같은 날의 부름을 더한다(runs) · 꺼 둔 부름은 off·held 를 남기고 아무것도 잡지 않는다. 원래 흔적은 정리에서 되돌린다.
sx "delete from app_config where key='dutyRemindRun'"
sx "insert into app_config(key,value) values('dutyNotifyOff','true'::jsonb) on conflict (key) do update set value='true'::jsonb"
R=$(icall "$SK" "$RB")
chk "remind while switched off: nothing told, nothing claimed, off:true" "$(jqn '(d.get("ok"), d.get("rows"), d.get("sent"), d.get("missed"), d.get("off"))' "$R"):$(LOGN "$R1,$R2,$R3,$R4" remind)" "(True, 3, 0, 0, True):0"
chk "trace of the switched-off run: off, held 2 people, runs 1" "$(sq "select (value->>'off') || ':' || (value->>'held') || ':' || (value->>'runs') from app_config where key='dutyRemindRun'")" "true:2:1"
sx "delete from app_config where key='dutyNotifyOff'"
RUN0=$(sq "select coalesce((select value->>'at' from app_config where key='dutyRemindRun'), '')")
sleep 1
R=$(icall "$SK" "$RB")
chk "remind: day, 3 rows with accounts, 2 people" "$(jqn "(d.get(\"ok\"), d.get(\"day\"), d.get(\"rows\"), $TOLD)" "$R")" "(True, '$D1', 3, 2)"
chk "remind leaves a trace (day, rows, a new timestamp-shaped at, runs 2, no off)" "$(sq "select (value->>'day') || ':' || (value->>'rows') || ':' || ((value->>'at') is distinct from '$RUN0')::text || ':' || ((value->>'at') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T')::text || ':' || (value->>'runs') || ':' || (value ? 'off')::text from app_config where key='dutyRemindRun'")" "$D1:3:true:true:2:false"
chk "no ids in response" "$(noleak "$R")" "0"
chk "remind rows claimed (account rows only)" "$(LOGN "$R1,$R2,$R3,$R4" remind)" "3"
chk "two push_log rows (two different texts)" "$(PLN remind)" "2"
chk "one person's two slots in one text" "$(sq "select count(*) from push_log where id > $PL0 and mode='duty-remind' and position('ga 09:00' in body) > 0 and position('na 11:00' in body) > 0 and body like '%$TAG%'")" "1"
R=$(icall "$SK" "$RB"); chk "second call -> 0" "$(jqn "(d.get(\"rows\"), $TOLD)" "$R")" "(3, 0)"
chk "trace adds up over the same day (runs 3 · the people told by the earlier run are kept)" "$(sq "select (value->>'runs') || ':' || ((value->>'sent')::int + (value->>'missed')::int)::text from app_config where key='dutyRemindRun'")" "3:2"
# 회귀 확인 반영(2026-10-07) — 이미 간 저녁에 스위치를 끄고 다시 부르면: 받은 분은 「가지 않은 분」(held)이 아니다(다음 아침 monitor 가 「N분께 가지 않음」이라 하지 않는다)
sx "insert into app_config(key,value) values('dutyNotifyOff','true'::jsonb) on conflict (key) do update set value='true'::jsonb"
R=$(icall "$SK" "$RB")
chk "remind switched off after it already went: off, nothing told" "$(jqn '(d.get("rows"), d.get("sent"), d.get("missed"), d.get("off"))' "$R")" "(3, 0, 0, True)"
chk "trace: people already told are not 'held' (held 0, earlier result kept, runs 4)" "$(sq "select (value->>'off') || ':' || (value->>'held') || ':' || ((value->>'sent')::int + (value->>'missed')::int)::text || ':' || (value->>'runs') from app_config where key='dutyRemindRun'")" "true:0:2:4"
sx "delete from app_config where key='dutyNotifyOff'"
# 고침 검토 반영 — 전날 알림 잡기는 날짜도 본다(SQL p_date): 그사이 다른 날로 옮겨진 줄은 옛 날짜로 잡히지 않는다
EMV=$(staff "$A1" "'$U2'" u2)      # 내일 자리의 줄 → 사흘 뒤 자리(B3 — 그분의 취소한 줄이 있던 자리 · 옮기며 그 줄은 지워진다)로 옮긴다
chk "move tomorrow's row to another day (SQL)" "$(sq "select duty_move($EMV, $B3, true)->>'ok'")" "true"
chk "moved away after the ids were read: not claimed with the old date" "$(sq "select cardinality(duty_notify_claim('remind', array[$EMV]::bigint[], '$D1'::date))")" "0"
chk "claimed with its new date" "$(sq "select cardinality(duty_notify_claim('remind', array[$EMV]::bigint[], '$D3'::date))")" "1"
chk "the moved row remembers the slot it left was still ahead (moved_from.live)" "$(sq "select (moved_from->>'live') from duty_signups where id=$EMV")" "true"

echo "5) 잠긴 날의 앱 지원 — 그 계정에 곧바로(응답 뒤에 돈다)"
chk "confirm D3 again (SQL)" "$(sq "select duty_day_set('$BID','$D3','confirm',null,null)->>'ok'")" "true"
P=$(PLN applied)
A=$(call "{\"action\":\"dutyApply\",\"user_id\":\"$UT\",\"slot_id\":$B3,\"ack_locked\":true}")
chk "tester applies on a locked day" "$(jqn '(d.get("ok"), d.get("locked"), d.get("already"))' "$A")" "(True, True, False)"
chk "applied push_log row arrives" "$(poll "select count(*) from push_log where id > $PL0 and mode='duty-applied' and body like '%$TAG%'" "$((P+1))")" "$((P+1))"
A=$(call "{\"action\":\"dutyApply\",\"user_id\":\"$UT\",\"slot_id\":$B3,\"ack_locked\":true}")
chk "again = already" "$(jqn '(d.get("ok"), d.get("already"))' "$A")" "(True, True)"
sleep 3
chk "already -> no second applied row" "$(PLN applied)" "$((P+1))"
chk "no ids in the app response" "$(noleak "$A")" "0"

echo
echo "통과 $pass · 실패 $fail"
[ "$fail" = "0" ]
