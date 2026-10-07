#!/usr/bin/env bash
# 봉사 당번 성도님 api — 개발 DB 끝까지 시험(쓰기 포함). ⚠️ 개발 전용: users 가 200 이상이면 거부한다.
#   bash tests/duty-e2e.dev.sh
# 준비: supabase CLI 로그인. 작업 폴더(E2E_WORKDIR)가 없으면 임시로 만들어 개발에 link 한다.
# 하는 일: dutyOpen 을 켜고(끝나면 원래대로) 시험 당번(자리 틀 셋 — 정원 1 · 그와 시각이 겹치는 틀 · 안 겹치는 틀)을 만들어
#          목록·자세히·지원(두 번 = already · 정원 full · 겹침 overlap)·내 당번·취소(남의 줄 not-found)·되살림 ·
#          확정 뒤(취소 locked · 「못 가게 됐어요」 · 잠긴 날 지원은 ack_locked) · 담당자가 뺀 뒤 재지원 거절 · 미리 잡는 수 ·
#          문 닫힘(읽기도 닫힘) · 문이 열려도 없는 계정은 닫힘 · 어린이 부서·실을 수 없는 이름 거절(시험 계정 둘을 만들어 쓰고 지운다) ·
#          보관한 당번은 없는 당번 · 응답에 계정 번호·신원 키·소속이 없는지 ·
#          지난 봉사(dutyPast — 이레 전 날짜에 담당자 길로 넣어 둔 줄: 내 것만 · 담당자가 빼면 빠진다 · 준비 중은 세지 않고 보관은 센다)를 본 뒤 당번을 지운다.
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

OLD_STATE=""; OLD_VAL=""; BID=""; TAG=""
cleanup() {
  # 지원 → 알림 기록(cascade) → 자리 → 날짜 → 틀 → 당번
  [ -n "$BID" ] && sx "delete from duty_signups where slot_id in (select id from duty_slots where board_id='$BID'); delete from duty_slots where board_id='$BID'; delete from duty_days where board_id='$BID'; delete from duty_lines where board_id='$BID'; delete from duty_boards where id='$BID'"
  # 이 시험이 만든 계정 둘(어린이 부서 · 실을 수 없는 이름) — 이름표(TAG)로만 지운다
  [ -n "$TAG" ] && sx "delete from users where identity_key like '%|$TAG' or identity_key like '%|<$TAG>'"
  if [ "$OLD_STATE" = "missing" ]; then sx "delete from app_config where key='dutyOpen'"
  elif [ "$OLD_STATE" = "had" ]; then sx "update app_config set value='$OLD_VAL'::jsonb where key='dutyOpen'"; fi
}
trap cleanup EXIT

if [ "$(sq "select count(*) from app_config where key='dutyOpen'")" = "0" ]; then OLD_STATE=missing
else OLD_VAL=$(sq "select value::text from app_config where key='dutyOpen'"); OLD_STATE=had; fi
echo "dutyOpen 원래: $OLD_STATE ${OLD_VAL}"
sx "insert into app_config(key,value) values('dutyOpen','true'::jsonb) on conflict (key) do update set value='true'::jsonb"

TAG=e2e$RANDOM$RANDOM
BID=$(sq "insert into duty_boards(title,place,contact_note,status,open_days) values ('$TAG','$TAG-place','$TAG-ask 010-0000-0000','open',56) returning id")
[ -n "$BID" ] || { echo "당번 만들기 실패"; exit 2; }
# 자리 틀 셋 — 사흘 뒤 요일: A(09:00~10:00 정원 1) · B(09:30~10:30 — A 와 겹친다) · C(11:00~12:00 — 안 겹친다)
DOW=$(sq "select extract(dow from duty_today()+3)::int")
for L in "'service','a','task','','start','09:00','end','10:00','capacity',1" "'service','b','task','','start','09:30','end','10:30','capacity',2" "'service','c','task','','start','11:00','end','12:00','capacity',2"; do
  R=$(sq "select duty_line_save('$BID', jsonb_build_object($L,'weekday',$DOW), false)->>'ok'")
  [ "$R" = "true" ] || { echo "자리 틀 만들기 실패: $R"; exit 2; }
done
D3=$(sq "select (duty_today()+3)::text"); D10=$(sq "select (duty_today()+10)::text")
slot() { sq "select s.id from duty_slots s join duty_lines l on l.id=s.line_id where s.board_id='$BID' and s.on_date='$2' and l.service='$1'"; }
SA=$(slot a "$D3"); SB=$(slot b "$D3"); SC=$(slot c "$D3"); SA10=$(slot a "$D10"); SC10=$(slot c "$D10")
[ -n "$SA" ] && [ -n "$SB" ] && [ -n "$SC" ] && [ -n "$SA10" ] || { echo "자리를 못 찾았다"; exit 2; }
# 지원할 수 있는 계정 셋 — 교구 소속(어린이 부서는 guardian 으로 거절된다) · 이름이 한글 2~10자(당번표에 실을 수 있는 이름) · 시험 참여자가 아니어도 된다(문을 켰다)
pickU() { sq "select id from users where type='교구' and name ~ '^[가-힣]{2,10}\$' order by created_at, id limit 1 offset $1"; }
U1=$(pickU 0); U2=$(pickU 1); U3=$(pickU 2)
[ -n "$U1" ] && [ -n "$U2" ] && [ -n "$U3" ] || { echo "사용자 셋을 못 골랐다"; exit 2; }
# 어린이 부서 계정 · 당번표에 실을 수 없는 이름의 계정 — 개발에 없을 수 있어 만들어 쓰고 끝나면 지운다(cleanup · 신원 키 끝이 TAG)
UK=$(sq "insert into users(type, bu, grade, name, identity_key) values ('교회학교','초등부','3','$TAG','교회학교|||초등부|3|$TAG') returning id")
UB=$(sq "insert into users(type, gu, mok, name, identity_key) values ('교구','e2e','1','<$TAG>','교구|e2e|1|||<$TAG>') returning id")
[ -n "$UK" ] && [ -n "$UB" ] || { echo "시험 계정을 못 만들었다"; exit 2; }
G1=$(sq "select coalesce(gu,'') from users where id='$U1'"); M1=$(sq "select coalesce(mok,'') from users where id='$U1'")
NONUSER="00000000-0000-0000-0000-000000000000"
echo "board=$BID  day=$D3"

echo "1) dutyList · dutyBoard"
L=$(call "{\"action\":\"dutyList\",\"user_id\":\"$U1\"}")
chk "open" "$(jqn 'd.get("open")' "$L")" "True"
chk "board listed with need" "$(jqn '[len(b["need"]) > 0 for b in d["boards"] if b["id"]=="'$BID'"]' "$L")" "[True]"
B=$(call "{\"action\":\"dutyBoard\",\"user_id\":\"$U1\",\"id\":\"$BID\"}")
chk "first day" "$(jqn 'd["days"][0]["date"]' "$B")" "$D3"
chk "slots open" "$(jqn '[(s["service"], s["why"], s["n"]) for s in d["days"][0]["slots"]]' "$B")" "[('a', '', 0), ('b', '', 0), ('c', '', 0)]"
chk "lockAt given, not locked" "$(jqn '(d["days"][0]["locked"], d["days"][0]["lockAt"] is not None)' "$B")" "(False, True)"
chk "me can apply (list)" "$(jqn 'd.get("me")' "$L")" "{'why': ''}"
chk "me can apply (board)" "$(jqn 'd.get("me")' "$B")" "{'why': ''}"
# 문이 **열려 있어도** users 에 없는 계정은 닫힘이다(꼴만 맞는 UUID 로 당번표의 이름을 읽지 못한다)
for a in '"action":"dutyList"' "\"action\":\"dutyBoard\",\"id\":\"$BID\"" '"action":"dutyMine"'; do
  chk "gate open, unknown account = closed" "$(jqn 'd' "$(call "{$a,\"user_id\":\"$NONUSER\"}")")" "{'ok': True, 'open': False}"
done
chk "gate open, no account = closed" "$(jqn 'd' "$(call "{\"action\":\"dutyBoard\",\"id\":\"$BID\"}")")" "{'ok': True, 'open': False}"
chk "gate open, unknown account apply = no-user" "$(jqn 'd.get("error")' "$(call "{\"action\":\"dutyApply\",\"user_id\":\"$NONUSER\",\"slot_id\":$SA}")")" "no-user"

echo "1-1) 앱에서 지원하지 못하는 계정 — 어린이 부서(guardian) · 실을 수 없는 이름(bad-name): 읽기는 me.why 로 알리고 지원은 SQL 앞에서 막는다"
chk "child: me.why" "$(jqn 'd["me"]' "$(call "{\"action\":\"dutyBoard\",\"user_id\":\"$UK\",\"id\":\"$BID\"}")")" "{'why': 'guardian'}"
chk "child: apply = guardian" "$(jqn 'd.get("error")' "$(call "{\"action\":\"dutyApply\",\"user_id\":\"$UK\",\"slot_id\":$SC}")")" "guardian"
chk "child: apply with ack = guardian" "$(jqn 'd.get("error")' "$(call "{\"action\":\"dutyApply\",\"user_id\":\"$UK\",\"slot_id\":$SC,\"ack_locked\":true}")")" "guardian"
chk "bad name: me.why" "$(jqn 'd["me"]' "$(call "{\"action\":\"dutyList\",\"user_id\":\"$UB\"}")")" "{'why': 'bad-name'}"
chk "bad name: apply = bad-name" "$(jqn 'd.get("error")' "$(call "{\"action\":\"dutyApply\",\"user_id\":\"$UB\",\"slot_id\":$SC}")")" "bad-name"
chk "nothing written for either" "$(sq "select count(*) from duty_signups where user_id in ('$UK','$UB')")" "0"

echo "2) dutyApply — 두 번은 already · 정원 full · 겹침 overlap(무엇과 겹쳤는지)"
A=$(call "{\"action\":\"dutyApply\",\"user_id\":\"$U1\",\"slot_id\":$SA}")
chk "U1 apply" "$(jqn '(d.get("ok"), d.get("locked"), d.get("already"))' "$A")" "(True, False, False)"
chk "again = already" "$(jqn '(d.get("ok"), d.get("already"))' "$(call "{\"action\":\"dutyApply\",\"user_id\":\"$U1\",\"slot_id\":$SA}")")" "(True, True)"
chk "U2 full" "$(jqn 'd.get("error")' "$(call "{\"action\":\"dutyApply\",\"user_id\":\"$U2\",\"slot_id\":$SA}")")" "full"
O=$(call "{\"action\":\"dutyApply\",\"user_id\":\"$U1\",\"slot_id\":$SB}")
chk "U1 overlap" "$(jqn '(d.get("error"), d["with"]["board"], d["with"]["service"], d["with"]["start"])' "$O")" "('overlap', '$TAG', 'a', '09:00')"
chk "U1 non-overlapping slot ok" "$(jqn 'd.get("ok")' "$(call "{\"action\":\"dutyApply\",\"user_id\":\"$U1\",\"slot_id\":$SC}")")" "True"
chk "one row per slot" "$(sq "select count(*) from duty_signups where slot_id=$SA and user_id='$U1'")" "1"
chk "source app" "$(sq "select source||':'||status from duty_signups where slot_id=$SA and user_id='$U1'")" "app:active"

echo "3) dutyBoard · dutyMine — 내 줄 · 이름 글자만"
B=$(call "{\"action\":\"dutyBoard\",\"user_id\":\"$U1\",\"id\":\"$BID\"}")
chk "why mine/full" "$(jqn '[(s["service"], s["why"], s["n"]) for s in d["days"][0]["slots"]]' "$B")" "[('a', 'mine', 1), ('b', '', 0), ('c', 'mine', 1)]"
chk "names are strings" "$(jqn 'all(isinstance(n, str) for s in d["days"][0]["slots"] for n in s["names"])' "$B")" "True"
B2=$(call "{\"action\":\"dutyBoard\",\"user_id\":\"$U2\",\"id\":\"$BID\"}")
chk "other member sees full, not mine" "$(jqn '[(s["why"], s["mine"]) for s in d["days"][0]["slots"] if s["service"]=="a"]' "$B2")" "[('full', None)]"
M=$(call "{\"action\":\"dutyMine\",\"user_id\":\"$U1\"}")
chk "mine rows" "$(jqn '[(m["service"], m["canCancel"], m["canAsk"], m["locked"]) for m in d["mine"] if m["boardId"]=="'$BID'"]' "$M")" "[('a', True, False, False), ('c', True, False, False)]"
LEAK=$(printf '%s%s%s%s' "$L" "$B" "$B2" "$M" | grep -c -e "$U1" -e "$U2" -e "$U3" -e "ident_key" -e "user_id" -e "identity_key")
chk "no ids / ident_key in responses" "$LEAK" "0"
# 소속도 싣지 않는다(이름 글자만) — 칸 이름과, 지원한 분(U1)의 교구·목장 글자
chk "no affiliation keys" "$(printf '%s%s%s%s' "$L" "$B" "$B2" "$M" | grep -c -e "group_name" -e "sub_name" -e "who_type" -e "applied_at" -e "staff_note")" "0"
if [ "${#G1}" -ge 2 ]; then
  chk "no affiliation text (gu of the applicant)" "$(printf '%s%s%s' "$B" "$B2" "$M" | PYTHONIOENCODING=utf-8 python -c 'import sys; print(sys.stdin.read().count(sys.argv[1]))' "$G1")" "0"
else
  echo "  - 지원한 분의 교구 글자가 짧아(${#G1}자) 글자 검사는 건너뜀(칸 이름 검사는 했다)"
fi

E1=$(sq "select id from duty_signups where slot_id=$SA and user_id='$U1'")
EC=$(sq "select id from duty_signups where slot_id=$SC and user_id='$U1'")
echo "4) dutyCancel — 남의 줄은 없는 줄 · 내 줄 취소 · 다시 지원하면 그 줄을 되살린다"
chk "not-found (other's row)" "$(jqn 'd.get("error")' "$(call "{\"action\":\"dutyCancel\",\"user_id\":\"$U2\",\"signup_id\":$E1}")")" "not-found"
chk "still active" "$(sq "select status from duty_signups where id=$E1")" "active"
chk "cancel own" "$(jqn 'd.get("ok")' "$(call "{\"action\":\"dutyCancel\",\"user_id\":\"$U1\",\"signup_id\":$E1}")")" "True"
chk "cancel again = not-active" "$(jqn 'd.get("error")' "$(call "{\"action\":\"dutyCancel\",\"user_id\":\"$U1\",\"signup_id\":$E1}")")" "not-active"
chk "ask before lock on own app row = not-locked" "$(jqn 'd.get("error")' "$(call "{\"action\":\"dutyAsk\",\"user_id\":\"$U1\",\"signup_id\":$EC,\"why\":\"cant\"}")")" "not-locked"
chk "re-apply revives" "$(jqn 'd.get("ok")' "$(call "{\"action\":\"dutyApply\",\"user_id\":\"$U1\",\"slot_id\":$SA}")")" "True"
chk "same row id" "$(sq "select id||':'||status from duty_signups where slot_id=$SA and user_id='$U1'")" "$E1:active"

echo "5) 확정 뒤 — 취소 locked · 못 가게 됐어요 · 잠긴 날 지원은 ack_locked"
chk "confirm day (SQL)" "$(sq "select duty_day_set('$BID','$D3','confirm',null,null)->>'ok'")" "true"
chk "cancel = locked" "$(jqn 'd.get("error")' "$(call "{\"action\":\"dutyCancel\",\"user_id\":\"$U1\",\"signup_id\":$E1}")")" "locked"
chk "ask cant" "$(jqn '(d.get("ok"), d.get("asked"))' "$(call "{\"action\":\"dutyAsk\",\"user_id\":\"$U1\",\"signup_id\":$E1,\"why\":\"cant\"}")")" "(True, True)"
chk "ask by other = not-found" "$(jqn 'd.get("error")' "$(call "{\"action\":\"dutyAsk\",\"user_id\":\"$U2\",\"signup_id\":$E1,\"why\":\"cant\"}")")" "not-found"
M=$(call "{\"action\":\"dutyMine\",\"user_id\":\"$U1\"}")
chk "mine asked/locked" "$(jqn '[(m["asked"], m["why"], m["locked"], m["canCancel"], m["canAsk"]) for m in d["mine"] if m["id"]=='$E1']' "$M")" "[(True, 'cant', True, False, True)]"
chk "ask clear" "$(jqn '(d.get("ok"), d.get("asked"))' "$(call "{\"action\":\"dutyAsk\",\"user_id\":\"$U1\",\"signup_id\":$E1,\"why\":null}")")" "(True, False)"
chk "locked-day without ack" "$(jqn 'd.get("error")' "$(call "{\"action\":\"dutyApply\",\"user_id\":\"$U2\",\"slot_id\":$SB}")")" "locked-day"
chk "nothing written" "$(sq "select count(*) from duty_signups where slot_id=$SB")" "0"
chk "with ack" "$(jqn '(d.get("ok"), d.get("locked"))' "$(call "{\"action\":\"dutyApply\",\"user_id\":\"$U2\",\"slot_id\":$SB,\"ack_locked\":true}")")" "(True, True)"
E2=$(sq "select id from duty_signups where slot_id=$SB and user_id='$U2'")
chk "U2 cancel = locked" "$(jqn 'd.get("error")' "$(call "{\"action\":\"dutyCancel\",\"user_id\":\"$U2\",\"signup_id\":$E2}")")" "locked"

echo "6) 담당자가 뺀 줄 — 본인은 스스로 되돌아오지 못한다 · 내 당번에 그날까지 보인다"
chk "staff removes (SQL)" "$(sq "select duty_cancel($E2, null, true)->>'ok'")" "true"
chk "removed-by-staff" "$(jqn 'd.get("error")' "$(call "{\"action\":\"dutyApply\",\"user_id\":\"$U2\",\"slot_id\":$SB,\"ack_locked\":true}")")" "removed-by-staff"
M2=$(call "{\"action\":\"dutyMine\",\"user_id\":\"$U2\"}")
chk "mine shows removed row" "$(jqn '[(m["status"], m["byStaff"], m["canCancel"], m["canAsk"]) for m in d["mine"] if m["id"]=='$E2']' "$M2")" "[('removed', True, False, False)]"
B2=$(call "{\"action\":\"dutyBoard\",\"user_id\":\"$U2\",\"id\":\"$BID\"}")
chk "board why removed" "$(jqn '[s["why"] for s in d["days"][0]["slots"] if s["service"]=="b"]' "$B2")" "['removed']"

echo "7) 담당자가 넣은 줄 — 본인이 스스로 빼지 못한다(staff-row) · 잠기기 전에도 못 가게 됐어요는 된다"
chk "staff adds U3 (SQL)" "$(sq "select duty_apply($SC10, '$U3', jsonb_build_object('name','e2e','who_type','x','ident_key','e2e|$TAG'), true)->>'ok'")" "true"
E3=$(sq "select id from duty_signups where slot_id=$SC10 and user_id='$U3'")
chk "staff-row" "$(jqn 'd.get("error")' "$(call "{\"action\":\"dutyCancel\",\"user_id\":\"$U3\",\"signup_id\":$E3}")")" "staff-row"
chk "ask allowed" "$(jqn '(d.get("ok"), d.get("asked"))' "$(call "{\"action\":\"dutyAsk\",\"user_id\":\"$U3\",\"signup_id\":$E3,\"why\":\"notme\"}")")" "(True, True)"

echo "8) 미리 잡아 둘 수 있는 자리 수(max_ahead) — 넘으면 too-many(max)"
sx "update duty_boards set max_ahead=1 where id='$BID'"
T=$(call "{\"action\":\"dutyApply\",\"user_id\":\"$U3\",\"slot_id\":$SA10}")
chk "too-many" "$(jqn '(d.get("error"), d.get("max"))' "$T")" "('too-many', 1)"
sx "update duty_boards set max_ahead=null where id='$BID'"

echo "9) 지원 멈춤 당번 — 명단은 보이고 지원만 막는다 · 준비 중 당번은 없는 당번"
sx "update duty_boards set status='closed' where id='$BID'"
chk "closed" "$(jqn 'd.get("error")' "$(call "{\"action\":\"dutyApply\",\"user_id\":\"$U3\",\"slot_id\":$SA10}")")" "closed"
B3=$(call "{\"action\":\"dutyBoard\",\"user_id\":\"$U3\",\"id\":\"$BID\"}")
chk "closed board readable" "$(jqn '(d.get("ok"), d["board"]["status"])' "$B3")" "(True, 'closed')"
sx "update duty_boards set status='draft' where id='$BID'"
chk "draft = not-found" "$(jqn 'd.get("error")' "$(call "{\"action\":\"dutyBoard\",\"user_id\":\"$U3\",\"id\":\"$BID\"}")")" "not-found"
chk "draft not listed" "$(jqn '[b["id"] for b in d["boards"] if b["id"]=="'$BID'"]' "$(call "{\"action\":\"dutyList\",\"user_id\":\"$U3\"}")")" "[]"
chk "draft slot apply = not-found" "$(jqn 'd.get("error")' "$(call "{\"action\":\"dutyApply\",\"user_id\":\"$U3\",\"slot_id\":$SA10}")")" "not-found"
# 보관한 당번도 성도님께는 없는 당번이다(SQL 의 archived 를 그대로 내보내지 않는다 — 자리 번호로 「보관된 당번」을 가려내지 못한다)
sx "update duty_boards set status='archived' where id='$BID'"
chk "archived slot apply = not-found" "$(jqn 'd.get("error")' "$(call "{\"action\":\"dutyApply\",\"user_id\":\"$U3\",\"slot_id\":$SA10}")")" "not-found"
chk "archived board = not-found" "$(jqn 'd.get("error")' "$(call "{\"action\":\"dutyBoard\",\"user_id\":\"$U3\",\"id\":\"$BID\"}")")" "not-found"
sx "update duty_boards set status='open' where id='$BID'"

echo "9-1) 지난 봉사(dutyPast) — 날짜가 지난 내 줄 가운데 당번표에 남아 있는 것만 · 내 것만 · 목록(dutyList)의 past"
# 이레 전 날짜에 자리를 더하고(날짜 더하기는 31일 앞까지) 담당자 길로 U1 을 넣는다(지난 날에는 본인 지원이 안 된다) — 이 시험 당번에만
DP=$(sq "select (duty_today()-7)::text")
LC=$(sq "select id from duty_lines where board_id='$BID' and service='c'")
chk "past date added" "$(sq "select (duty_date_add('$BID', '$DP', array[$LC]::bigint[])->>'ok')")" "true"
SP=$(sq "select id from duty_slots where board_id='$BID' and on_date='$DP' and line_id=$LC")
P0=$(call "{\"action\":\"dutyPast\",\"user_id\":\"$U1\"}")
N0=$(jqn 'd["past"]["total"]' "$P0")   # 이 계정에 전부터 있던 지난 봉사(개발 자료) — 이 시험이 더한 만큼만 본다
chk "past open, shape" "$(jqn '(d.get("ok"), d.get("open"), sorted(d.keys()), sorted(d["past"].keys()))' "$P0")" "(True, True, ['ok', 'open', 'past', 'today'], ['rows', 'total', 'year'])"
chk "staff add on past day" "$(sq "select (duty_apply($SP, '$U1', '{\"name\":\"e2e\"}'::jsonb, true, true, false)->>'ok')")" "true"
P1=$(call "{\"action\":\"dutyPast\",\"user_id\":\"$U1\"}")
chk "past +1" "$(jqn 'd["past"]["total"] - '"$N0" "$P1")" "1"
chk "past row = that day, seven keys" "$(jqn '[(r["date"], r["board"], r["service"], r["start"], sorted(r.keys())) for r in d["past"]["rows"] if r["board"]=="'$TAG'"]' "$P1")" "[('$DP', '$TAG', 'c', '11:00', ['board', 'contact', 'date', 'end', 'service', 'start', 'task'])]"
# 줄의 문의(contact) = 그 당번의 문의처 글 그대로(당번표에 이미 보이는 글 — 「지난 봉사」 화면이 「담당자께 말씀해 주세요」 아래에 보여 준다)
chk "past row contact = board contact" "$(jqn '[r["contact"] for r in d["past"]["rows"] if r["board"]=="'$TAG'"]' "$P1")" "$(sq "select '[''' || contact_note || ''']' from duty_boards where id='$BID'")"
# 당번표(dutyBoard)도 지난 봉사의 두 수를 함께 싣는다(줄 없이) — 당번표만 다시 받는 화면의 「지난 봉사 N번」이 낡지 않게
BP=$(call "{\"action\":\"dutyBoard\",\"user_id\":\"$U1\",\"id\":\"$BID\"}")
chk "board carries past (counts only)" "$(jqn '(d["past"]["total"] - '"$N0"', d["past"]["rows"], sorted(d["past"].keys()))' "$BP")" "(1, [], ['rows', 'total', 'year'])"
chk "board past = list past" "$(jqn 'd["past"]["total"]' "$BP")" "$(jqn 'd["past"]["total"]' "$P1")"
chk "past today = server today" "$(jqn 'd.get("today")' "$P1")" "$(sq "select duty_today()::text")"
chk "past has no account/ident/name" "$(jqn 'any(k in json.dumps(d) for k in ["'$U1'", "user_id", "ident", "e2e\"", "group", "who"])' "$P1")" "False"
chk "list carries past (<= 3 rows)" "$(jqn '(d["past"]["total"] - '"$N0"', len(d["past"]["rows"]) <= 3)' "$(call "{\"action\":\"dutyList\",\"user_id\":\"$U1\"}")")" "(1, True)"
chk "not in mine (past)" "$(jqn '[m["date"] for m in d["mine"] if m["date"] < "'$(sq "select duty_today()::text")'"]' "$(call "{\"action\":\"dutyMine\",\"user_id\":\"$U1\"}")")" "[]"
chk "other account: not there" "$(jqn '[r for r in d["past"]["rows"] if r["board"]=="'$TAG'"]' "$(call "{\"action\":\"dutyPast\",\"user_id\":\"$U2\"}")")" "[]"
# 준비 중 당번의 줄은 세지 않는다 · 보관한 당번은 **앱에 보이던 동안 끝난 자리**를 센다(끝난 모집의 기록 — 숨긴 때 hidden_at 은 트리거가 적는다) · 지원 멈춤도 센다
#   (숨긴 뒤 날짜의 줄을 세지 않는 것은 시간을 돌려야 볼 수 있다 — supabase/tests/duty_rules.dev.sql 이 본다)
sx "update duty_boards set status='draft' where id='$BID'"
chk "hidden_at stamped when hidden" "$(sq "select (hidden_at is not null and hidden_at > now() - interval '5 minutes')::text from duty_boards where id='$BID'")" "true"
HA=$(sq "select hidden_at::text from duty_boards where id='$BID'")
chk "draft: not counted" "$(jqn 'd["past"]["total"] - '"$N0" "$(call "{\"action\":\"dutyPast\",\"user_id\":\"$U1\"}")")" "0"
sx "update duty_boards set status='archived' where id='$BID'"
chk "hidden_at kept (draft -> archived)" "$(sq "select hidden_at::text from duty_boards where id='$BID'")" "$HA"
chk "archived: counted" "$(jqn 'd["past"]["total"] - '"$N0" "$(call "{\"action\":\"dutyPast\",\"user_id\":\"$U1\"}")")" "1"
sx "update duty_boards set status='closed' where id='$BID'"
chk "hidden_at cleared when shown again" "$(sq "select (hidden_at is null)::text from duty_boards where id='$BID'")" "true"
chk "closed: counted" "$(jqn 'd["past"]["total"] - '"$N0" "$(call "{\"action\":\"dutyPast\",\"user_id\":\"$U1\"}")")" "1"
sx "update duty_boards set status='open' where id='$BID'"
# 담당자가 지난 날의 줄을 빼면(안 오신 분 바로잡기) 지난 봉사에서도 빠진다
EP=$(sq "select id from duty_signups where slot_id=$SP and user_id='$U1'")
chk "staff remove on past day" "$(sq "select (duty_cancel($EP, null, true)->>'ok')")" "true"
chk "removed: gone from past" "$(jqn 'd["past"]["total"] - '"$N0" "$(call "{\"action\":\"dutyPast\",\"user_id\":\"$U1\"}")")" "0"
chk "past: no account = closed" "$(jqn 'd' "$(call '{"action":"dutyPast"}')")" "{'ok': True, 'open': False}"

echo "10) 문 닫힘 — 읽기도 닫힌다(당번·이름 없음) · 쓰기는 not-open (시험 참여자가 아닌 계정으로)"
sx "update app_config set value='false'::jsonb where key='dutyOpen'"
NT=$(sq "select id from users u where type='교구' and name ~ '^[가-힣]{2,10}\$' and not exists (select 1 from app_config c, jsonb_array_elements_text(case when jsonb_typeof(c.value)='array' then c.value else '[]'::jsonb end) k where c.key='ministryTesters' and k = u.identity_key) order by created_at, id limit 1")
if [ -n "$NT" ]; then
  chk "list closed" "$(jqn 'd' "$(call "{\"action\":\"dutyList\",\"user_id\":\"$NT\"}")")" "{'ok': True, 'open': False}"
  chk "board closed" "$(jqn 'd' "$(call "{\"action\":\"dutyBoard\",\"user_id\":\"$NT\",\"id\":\"$BID\"}")")" "{'ok': True, 'open': False}"
  chk "mine closed" "$(jqn 'd' "$(call "{\"action\":\"dutyMine\",\"user_id\":\"$NT\"}")")" "{'ok': True, 'open': False}"
  chk "past closed" "$(jqn 'd' "$(call "{\"action\":\"dutyPast\",\"user_id\":\"$NT\"}")")" "{'ok': True, 'open': False}"
  chk "apply not-open" "$(jqn 'd.get("error")' "$(call "{\"action\":\"dutyApply\",\"user_id\":\"$NT\",\"slot_id\":$SA10}")")" "not-open"
else
  chk "non-tester account available (문 닫힘을 볼 계정)" "none" "found"
fi

echo
echo "통과 $pass · 실패 $fail"
[ "$fail" = "0" ]
