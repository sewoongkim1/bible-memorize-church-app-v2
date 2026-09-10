#!/usr/bin/env bash
# 시편 말씀 액자 — 읽기 전용 스모크. 기본은 개발 DB.
#   bash tests/psalm-smoke.sh              개발
#   PSALM_ENV=prod bash tests/psalm-smoke.sh   운영
set -u
if [ "${PSALM_ENV:-dev}" = "prod" ]; then
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

W=$(call '{"action":"getVerses"}')
P=$(call '{"action":"getVerses","track":"psalm"}')

jqn() { python -c "import json,sys;d=json.load(sys.stdin);print($1)" <<< "$2"; }

echo "① 주간(track 없음) — 지금과 똑같아야 한다"
chk "weekly 편수" "$(jqn 'len(d[\"verses\"])' "$W")" "35"
chk "weekly 최대 no" "$(jqn 'max(v[\"no\"] for v in d[\"verses\"])' "$W")" "35"

echo "② 시편"
chk "openCount 있음" "$(jqn '\"openCount\" in d' "$P")" "True"
chk "안 열린 구절 없음" "$(jqn 'all(v[\"dayNo\"] <= d[\"openCount\"] for v in d[\"verses\"])' "$P")" "True"
chk "편수 = openCount 이하" "$(jqn 'len(d[\"verses\"]) <= d[\"openCount\"]' "$P")" "True"
chk "totalDays" "$(jqn 'd[\"totalDays\"]' "$P")" "180"
chk "startDate" "$(jqn 'd[\"startDate\"]' "$P")" "2026-09-21"

echo
echo "통과 $pass · 실패 $fail"
[ "$fail" -eq 0 ]
