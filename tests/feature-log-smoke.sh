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

CALL_TMP=$(mktemp)
trap 'rm -f "$CALL_TMP"' EXIT

# ⚠️ 명령줄 리터럴 한글은 (특히 Git Bash/Windows 에서) 깨져서 서버에 도착한다 —
# 이걸 모르면 서버가 허용 목록에 있는 값을 거부하는 것처럼 보여 서버 버그로 오해하게 된다.
# 그래서 body 는 UTF-8 파일로 써서 보낸다.
call() {
  printf '%s' "$1" > "$CALL_TMP"
  curl -s -X POST "$BASE" -H "Content-Type: application/json" \
    -H "apikey: $KEY" -H "Authorization: Bearer $KEY" --data-binary @"$CALL_TMP"
}

pass=0; fail=0
chk() { # 이름, 실제, 기대
  if [ "$2" = "$3" ]; then echo "  ✓ $1 = $2"; pass=$((pass+1));
  else echo "  ✗ $1 = $2  (기대 $3)"; fail=$((fail+1)); fi
}

echo "■ 시험용 계정을 하나 만든다(개발 DB — login 은 모르는 이름이면 계정을 만들어 준다)"
UID_JSON=$(call '{"action":"login","type":"교구","gu":"계측","mok":"계측","name":"계측시험"}')
# TEST_UID를 쓰는 이유: UID는 bash 기본 환경변수(OS user id)라 할당이 무시된다
TEST_UID=$(echo "$UID_JSON" | grep -o '"user_id":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -z "$TEST_UID" ]; then
  TEST_UID=$(echo "$UID_JSON" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
fi
if [ -z "$TEST_UID" ]; then echo "  ✗ 시험 계정을 못 만들었다: $UID_JSON"; exit 1; fi
echo "  · user_id = ${TEST_UID:0:8}…"

echo "■ 올바른 기록은 ok"
# ⚠️ 여기 목록은 index.ts 의 FEATURES **전부**여야 한다. 일곱만 돌리던 때 다른 세션이 더한
#    event 가 빠진 줄 몰랐다 — 빠진 값은 「거부되는지」도 「통과하는지」도 시험되지 않는다.
#    FEATURES 를 늘리면 이 줄도 그 자리에서 함께 늘린다(통과 개수는 pass 가 세므로 손댈 것 없다).
# ⚠️ song 은 일부러 없다 — FEATURES 를 거치지 않고 서버가 직접 v2_feature_log 를 부르는 값이라
#    여기로 보내면 skipped 가 맞다(오류가 아니다). 그 경로는 오늘의 찬양 액션으로 시험한다.
for F in psalm meditation meditation-widget meditation-auto album album-play guide push ranking-scope event; do
  R=$(call "{\"action\":\"featureLog\",\"user_id\":\"$TEST_UID\",\"feature\":\"$F\",\"item\":0}")
  chk "$F" "$(echo "$R" | grep -o '"ok":true')" '"ok":true'
done

echo "■ 같은 것을 두 번 보내도 ok (표에서는 cnt 만 오른다)"
R=$(call "{\"action\":\"featureLog\",\"user_id\":\"$TEST_UID\",\"feature\":\"psalm\",\"item\":1042}")
chk "psalm 재호출" "$(echo "$R" | grep -o '"ok":true')" '"ok":true'

echo "■ 모르는 feature 는 조용히 버린다(오류가 아니다)"
R=$(call "{\"action\":\"featureLog\",\"user_id\":\"$TEST_UID\",\"feature\":\"몰라\",\"item\":0}")
chk "모르는 feature ok"      "$(echo "$R" | grep -o '"ok":true')"    '"ok":true'
chk "모르는 feature skipped" "$(echo "$R" | grep -o '"skipped"')"    '"skipped"'

echo "■ user_id 가 없으면 조용히 버린다"
R=$(call '{"action":"featureLog","feature":"psalm","item":1}')
chk "user_id 없음 ok"      "$(echo "$R" | grep -o '"ok":true')" '"ok":true'
chk "user_id 없음 skipped" "$(echo "$R" | grep -o '"skipped"')" '"skipped"'

echo "■ 응답에 user_id 가 실리면 안 된다(이 API 에는 JWT 가 없다)"
R=$(call "{\"action\":\"featureLog\",\"user_id\":\"$TEST_UID\",\"feature\":\"psalm\",\"item\":7}")
chk "응답에 user_id 없음" "$(echo "$R" | grep -c 'user_id')" "0"

echo ""
echo "통과 $pass · 실패 $fail"
[ "$fail" -eq 0 ]
