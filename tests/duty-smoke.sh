#!/usr/bin/env bash
# 봉사 당번 — 읽기 전용 스모크. 기본은 개발 DB.
#   bash tests/duty-smoke.sh               개발
#   EVT_ENV=prod bash tests/duty-smoke.sh  운영
# ⚠️ 쓰기(지원·취소)는 하지 않는다 — 거절되어야 하는 요청과 읽기만. 문(dutyOpen)이 닫혀 있어도 도는 것만 본다.
#    (문 = app_config dutyOpen 이 true 이거나 시험 참여자. 계정 없이·없는 계정으로는 늘 닫힘이다 — 당번·이름이 하나도 나가지 않아야 한다.)
set -u
if [ "${EVT_ENV:-dev}" = "prod" ]; then
  BASE="https://xnomlgydifiqiybervtf.supabase.co/functions/v1/api"
  KEY="sb_publishable_oLtieT_jw7Gjb8etEsy0jw_thBaDjl-"
else
  BASE="https://ktpwthwqzgcqcrmsafdo.supabase.co/functions/v1/api"
  KEY="sb_publishable_eJKP6u95IU9_DBXTvnvYBA_-yGCf-0Y"
fi

call() {
  curl -s -X POST "$BASE" -H "Content-Type: application/json" \
    -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -d "$1"
}
pass=0; fail=0
chk() { # 이름, 실제, 기대
  if [ "$2" = "$3" ]; then echo "  o $1 = $2"; pass=$((pass+1));
  else echo "  X $1 = $2  (기대 $3)"; fail=$((fail+1)); fi
}
jqn() {
  PYTHONIOENCODING=utf-8 python -c '
import json, sys
d = json.load(sys.stdin)
print(eval(sys.argv[1]))
' "$1" <<< "$2"
}
NONUSER="00000000-0000-0000-0000-000000000000"

echo "1) dutyList - 계정 없이 · 없는 계정으로는 닫힘(당번·이름·수 없음)"
for body in '{"action":"dutyList"}' "{\"action\":\"dutyList\",\"user_id\":\"$NONUSER\"}" '{"action":"dutyList","user_id":"x"}'; do
  L=$(call "$body")
  chk "closed" "$(jqn 'd' "$L")" "{'ok': True, 'open': False}"
done
echo "2) dutyBoard - 꼴이 틀리면 bad-args · 없는 계정이면 닫힘(당번이 있는지도 알려 주지 않는다)"
chk "bad-args" "$(jqn 'd.get("error")' "$(call "{\"action\":\"dutyBoard\",\"user_id\":\"$NONUSER\",\"id\":\"x\"}")")" "bad-args"
chk "closed" "$(jqn 'd' "$(call "{\"action\":\"dutyBoard\",\"user_id\":\"$NONUSER\",\"id\":\"$NONUSER\"}")")" "{'ok': True, 'open': False}"
echo "3) dutyMine - 없는 계정이면 닫힘"
chk "closed" "$(jqn 'd' "$(call "{\"action\":\"dutyMine\",\"user_id\":\"$NONUSER\"}")")" "{'ok': True, 'open': False}"
echo "3-1) dutyPast(지난 봉사) - 계정 없이 · 없는 계정이면 닫힘(지난 줄·수 없음)"
for body in '{"action":"dutyPast"}' "{\"action\":\"dutyPast\",\"user_id\":\"$NONUSER\"}" '{"action":"dutyPast","user_id":"x"}'; do
  chk "closed" "$(jqn 'd' "$(call "$body")")" "{'ok': True, 'open': False}"
done
echo "4) dutyApply - 신원·인자 · 없는 계정"
chk "no-user" "$(jqn 'd.get("error")' "$(call '{"action":"dutyApply","slot_id":1}')")" "no-user"
chk "bad-args" "$(jqn 'd.get("error")' "$(call "{\"action\":\"dutyApply\",\"user_id\":\"$NONUSER\",\"slot_id\":\"x\"}")")" "bad-args"
chk "no-user(없는 계정)" "$(jqn 'd.get("error")' "$(call "{\"action\":\"dutyApply\",\"user_id\":\"$NONUSER\",\"slot_id\":1}")")" "no-user"
echo "5) dutyCancel · dutyAsk - 인자 · 없는 계정은 닫힘"
chk "bad-args" "$(jqn 'd.get("error")' "$(call '{"action":"dutyCancel","signup_id":1}')")" "bad-args"
chk "not-open" "$(jqn 'd.get("error")' "$(call "{\"action\":\"dutyCancel\",\"user_id\":\"$NONUSER\",\"signup_id\":1}")")" "not-open"
chk "bad-args(why)" "$(jqn 'd.get("error")' "$(call "{\"action\":\"dutyAsk\",\"user_id\":\"$NONUSER\",\"signup_id\":1,\"why\":\"zzz\"}")")" "bad-args"
chk "not-open" "$(jqn 'd.get("error")' "$(call "{\"action\":\"dutyAsk\",\"user_id\":\"$NONUSER\",\"signup_id\":1,\"why\":\"cant\"}")")" "not-open"
echo "6) 공개 설정 - dutyOpen 은 읽힌다(없으면 null)"
C=$(call '{"action":"getConfig","key":"dutyOpen"}')
chk "getConfig ok" "$(jqn '"error" not in d' "$C")" "True"

echo
echo "통과 $pass · 실패 $fail"
[ "$fail" = "0" ]
