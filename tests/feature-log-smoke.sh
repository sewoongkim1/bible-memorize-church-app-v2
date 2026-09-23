#!/usr/bin/env bash
# 열람 기록(featureLog) — 읽기/쓰기 스모크. 기본은 개발 DB.
#   DEV_ANON=... bash tests/feature-log-smoke.sh
#   FL_ENV=prod PROD_ANON=... bash tests/feature-log-smoke.sh
#
# ⚠️ 실제로 행이 쌓였는지는 여기서 못 본다(RLS 로 공개 키가 못 읽는다 — 그게 맞다).
#    행 확인은 SQL Editor 에서 한다. 여기서 보는 것은 **액션이 무엇을 돌려주는가** 다.
set -u
if [ "${FL_ENV:-dev}" = "prod" ]; then
  BASE="https://xnomlgydifiqiybervtf.supabase.co/functions/v1/api"
  KEY="${PROD_ANON:?PROD_ANON 환경변수가 필요합니다}"
else
  BASE="https://ktpwthwqzgcqcrmsafdo.supabase.co/functions/v1/api"
  KEY="${DEV_ANON:?DEV_ANON 환경변수가 필요합니다}"
fi

call() {
  curl -s -X POST "$BASE" -H "Content-Type: application/json" \
    -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -d "$1"
}

pass=0; fail=0
chk() { # 이름, 실제, 기대
  if [ "$2" = "$3" ]; then echo "  ✓ $1 = $2"; pass=$((pass+1));
  else echo "  ✗ $1 = $2  (기대 $3)"; fail=$((fail+1)); fi
}

echo "■ 시험용 계정을 하나 만든다(개발 DB — login 은 모르는 이름이면 계정을 만들어 준다)"
UID_JSON=$(call '{"action":"login","type":"교구","gu":"계측","mok":"계측","name":"계측시험"}')
UID=$(echo "$UID_JSON" | grep -o '"user_id":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -z "$UID" ]; then
  UID=$(echo "$UID_JSON" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
fi
if [ -z "$UID" ]; then echo "  ✗ 시험 계정을 못 만들었다: $UID_JSON"; exit 1; fi
echo "  · user_id = ${UID:0:8}…"

echo "■ 올바른 기록은 ok"
for F in psalm meditation meditation-auto album album-play guide push; do
  R=$(call "{\"action\":\"featureLog\",\"user_id\":\"$UID\",\"feature\":\"$F\",\"item\":0}")
  chk "$F" "$(echo "$R" | grep -o '"ok":true')" '"ok":true'
done

echo "■ 같은 것을 두 번 보내도 ok (표에서는 cnt 만 오른다)"
R=$(call "{\"action\":\"featureLog\",\"user_id\":\"$UID\",\"feature\":\"psalm\",\"item\":1042}")
chk "psalm 재호출" "$(echo "$R" | grep -o '"ok":true')" '"ok":true'

echo "■ 모르는 feature 는 조용히 버린다(오류가 아니다)"
R=$(call "{\"action\":\"featureLog\",\"user_id\":\"$UID\",\"feature\":\"몰라\",\"item\":0}")
chk "모르는 feature ok"      "$(echo "$R" | grep -o '"ok":true')"    '"ok":true'
chk "모르는 feature skipped" "$(echo "$R" | grep -o '"skipped"')"    '"skipped"'

echo "■ user_id 가 없으면 조용히 버린다"
R=$(call '{"action":"featureLog","feature":"psalm","item":1}')
chk "user_id 없음 ok"      "$(echo "$R" | grep -o '"ok":true')" '"ok":true'
chk "user_id 없음 skipped" "$(echo "$R" | grep -o '"skipped"')" '"skipped"'

echo "■ 응답에 user_id 가 실리면 안 된다(이 API 에는 JWT 가 없다)"
R=$(call "{\"action\":\"featureLog\",\"user_id\":\"$UID\",\"feature\":\"psalm\",\"item\":7}")
chk "응답에 user_id 없음" "$(echo "$R" | grep -c 'user_id')" "0"

echo ""
echo "통과 $pass · 실패 $fail"
[ "$fail" -eq 0 ]
