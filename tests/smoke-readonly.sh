#!/usr/bin/env bash
# 성경암송 앱 v2 — 읽기 전용 API 스모크 테스트를 한 번에 전부 실행합니다.
# smoke-readonly.http와 같은 13개 액션을 대상으로 하며, 각각 curl로 호출해 ok:true(또는
# 2번 항목은 ok:false)인지 확인합니다.
#
# 사용법:
#   ADMIN_SECRET='실제비번' bash tests/smoke-readonly.sh
# (ADMIN_SECRET을 안 주면 관리자 액션 5개는 자동으로 건너뜁니다)

set -u
BASE="https://xnomlgydifiqiybervtf.supabase.co/functions/v1/api"
SERMON_BASE="https://xnomlgydifiqiybervtf.supabase.co/functions/v1/sermon"
ANON_KEY="sb_publishable_oLtieT_jw7Gjb8etEsy0jw_thBaDjl-"
PW="${ADMIN_SECRET:-}"

pass=0 fail=0 skip=0

call() {
  curl -s -X POST "$1" \
    -H "Content-Type: application/json" \
    -H "apikey: $ANON_KEY" \
    -H "Authorization: Bearer $ANON_KEY" \
    -d "$2"
}

check() {
  local name="$1" resp="$2" expect="$3"
  if echo "$resp" | grep -q "$expect"; then
    echo "  ✓ $name"; pass=$((pass+1))
  else
    echo "  ✗ $name — $resp"; fail=$((fail+1))
  fi
}

skip_test() { echo "  – $1 (ADMIN_SECRET 없어서 건너뜀)"; skip=$((skip+1)); }

echo "== 성경암송 API 읽기 전용 스모크 테스트 =="
echo

# --- 관리자 비번 필요 없는 것들 ---
check "2. 관리자 인증 - 틀린 비번(거부 확인)" "$(call "$BASE" '{"action":"authCheck","pw":"this-is-definitely-wrong"}')" '"ok":false'
check "3. 구절 목록"                          "$(call "$BASE" '{"action":"getVerses"}')" '"ok":true'
check "4. 장문 본문 목록"                      "$(call "$BASE" '{"action":"getPassages"}')" '"ok":true'
check "5. 게시판 글 목록"                      "$(call "$BASE" '{"action":"boardList"}')" '"ok":true'
check "6. 게시판 최근 글 수"                   "$(call "$BASE" '{"action":"boardCheck"}')" '"ok":true'
check "9. 도전 랭킹"                          "$(call "$BASE" '{"action":"ranking","from":"2020-01-01","to":"2026-12-31"}')" '"ok":true'
check "12. 공개 설정값"                       "$(call "$BASE" '{"action":"getConfig","key":"heartMessages"}')" '"ok":true'
check "13. 설교 아카이브 목록"                  "$(call "$SERMON_BASE" '{"action":"getSermons"}')" '"ok":true'
check "14. 순위 응원 명단"                     "$(call "$BASE" '{"action":"rankCheerers","gubun":"교구","sosok":"사랑","sebu":"3","name":"없는사람"}')" '"ok":true'

# --- 관리자 비번 필요한 것들 ---
if [ -n "$PW" ]; then
  check "1. 관리자 인증 - 정상 비번" "$(call "$BASE" "{\"action\":\"authCheck\",\"pw\":\"$PW\"}")" '"ok":true'
  check "7. 헬스체크(monitor)"      "$(call "$BASE" "{\"action\":\"monitor\",\"pw\":\"$PW\"}")" '"ok":true'
  check "8. 참여 통계"              "$(call "$BASE" "{\"action\":\"stats\",\"pw\":\"$PW\",\"from\":\"2020-01-01\",\"to\":\"2026-12-31\"}")" '"ok":true'
  check "10. 푸시 구독 통계"         "$(call "$BASE" "{\"action\":\"pushStats\",\"pw\":\"$PW\"}")" '"ok":true'
  check "11. 오늘 푸시 문구 미리보기" "$(call "$BASE" "{\"action\":\"pushPreview\",\"pw\":\"$PW\"}")" '"ok":true'
else
  skip_test "1. 관리자 인증 - 정상 비번"
  skip_test "7. 헬스체크(monitor)"
  skip_test "8. 참여 통계"
  skip_test "10. 푸시 구독 통계"
  skip_test "11. 오늘 푸시 문구 미리보기"
fi

echo
echo "== 결과: 성공 $pass · 실패 $fail · 건너뜀 $skip =="
[ "$fail" -eq 0 ]
