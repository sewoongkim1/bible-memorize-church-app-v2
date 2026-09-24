#!/usr/bin/env bash
# 저녁 알림 on/off (updatePushEvening) 스모크. 기본은 개발 DB.
#   DEV_ANON=... bash tests/push-evening-smoke.sh
#   PE_ENV=prod PROD_ANON=... bash tests/push-evening-smoke.sh
#
# ⚠️ 표에 실제로 무엇이 들었는지는 여기서 못 본다(RLS 로 공개 키가 못 읽는다 — 그게 맞다).
#    여기서 보는 것은 **액션이 무엇을 돌려주는가** 다. 행 확인은 SQL Editor 에서 한다.
set -u
if [ "${PE_ENV:-dev}" = "prod" ]; then
  BASE="https://xnomlgydifiqiybervtf.supabase.co/functions/v1/api"
  KEY="${PROD_ANON:?PROD_ANON 환경변수가 필요합니다}"
else
  BASE="https://ktpwthwqzgcqcrmsafdo.supabase.co/functions/v1/api"
  KEY="${DEV_ANON:?DEV_ANON 환경변수가 필요합니다}"
fi

CALL_TMP=$(mktemp)
trap 'rm -f "$CALL_TMP"' EXIT

# ⚠️ 명령줄 리터럴 한글은 Git Bash/Windows 에서 깨져 도착한다 — body 는 UTF-8 파일로 보낸다.
call() {
  printf '%s' "$1" > "$CALL_TMP"
  curl -s -X POST "$BASE" -H "Content-Type: application/json" \
    -H "apikey: $KEY" -H "Authorization: Bearer $KEY" --data-binary @"$CALL_TMP"
}

# ⚠️ migrated 를 반드시 본다 — on 은 요청값을 그대로 되돌려주므로, SQL(evening 칸)을 안 돌린
#    채 함수만 배포해도 ok:true·on:<요청값> 이 나와 **거짓 통과**한다. migrated:false 가 곧
#    「칸이 아직 없다」는 신호다. 이 한 줄이 배포 순서 착오를 잡는다.
pass=0; fail=0
chk() { # 이름, 실제, 기대
  if [ "$2" = "$3" ]; then echo "  ✓ $1 = $2"; pass=$((pass+1));
  else echo "  ✗ $1 = $2  (기대 $3)"; fail=$((fail+1)); fi
}

echo "■ 시험용 계정 (login 은 모르는 이름이면 계정을 만들어 준다)"
UID_JSON=$(call '{"action":"login","type":"교구","gu":"저녁","mok":"저녁","name":"저녁시험"}')
TEST_UID=$(echo "$UID_JSON" | grep -o '"user_id":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -z "$TEST_UID" ]; then
  TEST_UID=$(echo "$UID_JSON" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
fi
if [ -z "$TEST_UID" ]; then echo "  ✗ 계정을 못 만들었다: $UID_JSON"; exit 1; fi
echo "  user_id=${TEST_UID:0:8}…"

echo "■ 끄기"
R=$(call "{\"action\":\"updatePushEvening\",\"user_id\":\"$TEST_UID\",\"on\":false}")
chk "ok"  "$(echo "$R" | grep -o '"ok":[a-z]*'  | cut -d: -f2)" "true"
chk "on"  "$(echo "$R" | grep -o '"on":[a-z]*'  | cut -d: -f2)" "false"
chk "migrated" "$(echo "$R" | grep -o '"migrated":[a-z]*' | cut -d: -f2)" "true"

echo "■ 켜기"
R=$(call "{\"action\":\"updatePushEvening\",\"user_id\":\"$TEST_UID\",\"on\":true}")
chk "ok"  "$(echo "$R" | grep -o '"ok":[a-z]*'  | cut -d: -f2)" "true"
chk "on"  "$(echo "$R" | grep -o '"on":[a-z]*'  | cut -d: -f2)" "true"
chk "migrated" "$(echo "$R" | grep -o '"migrated":[a-z]*' | cut -d: -f2)" "true"

echo "■ user_id 가 없으면 거절한다"
R=$(call '{"action":"updatePushEvening","on":true}')
chk "error" "$(echo "$R" | grep -o '"error":"[^"]*"' | cut -d'"' -f4)" "no-user"

echo "■ ⚠️ 응답에 user_id 가 새지 않는다"
R=$(call "{\"action\":\"updatePushEvening\",\"user_id\":\"$TEST_UID\",\"on\":true}")
if echo "$R" | grep -q "$TEST_UID"; then
  echo "  ✗ 응답에 user_id 가 들어 있다: $R"; fail=$((fail+1))
else
  echo "  ✓ 응답에 user_id 없음"; pass=$((pass+1))
fi

echo
echo "통과 $pass · 실패 $fail"
[ "$fail" -eq 0 ]
