#!/usr/bin/env bash
# 시편 말씀 액자 — 읽기 전용 스모크. 기본은 개발 DB.
#   bash tests/psalm-smoke.sh                                 개발
#   PSALM_ENV=prod bash tests/psalm-smoke.sh                  운영
# 운영에서 시작일까지 확정된 뒤 단정하려면(개발 중엔 일부러 시작일을 앞당겨 두므로 기본은 단정하지 않는다):
#   PSALM_EXPECT_START=2026-09-21 PSALM_ENV=prod bash tests/psalm-smoke.sh
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

pass=0; fail=0; skip=0
chk() { # 이름, 실제, 기대
  if [ "$2" = "$3" ]; then echo "  ✓ $1 = $2"; pass=$((pass+1));
  else echo "  ✗ $1 = $2  (기대 $3)"; fail=$((fail+1)); fi
}
sk() { # 이름, 이유
  echo "  − $1 … 건너뜀 ($2)"; skip=$((skip+1));
}

W=$(call '{"action":"getVerses"}')
P=$(call '{"action":"getVerses","track":"psalm"}')

# 파이썬 표현식을 sys.argv[1]로 넘긴다(코드 문자열에 갖다 붙이지 않는다) —
# 그래야 표현식 안에 큰따옴표를 그대로 쓸 수 있고, 바깥 큰따옴표와 겹쳐도 이스케이프가 필요 없다.
jqn() {
  python -c '
import json, sys
d = json.load(sys.stdin)
print(eval(sys.argv[1]))
' "$1" <<< "$2"
}

echo "① 주간(track 없음) — 지금과 똑같아야 한다"
# ⚠️ **편수를 숫자로 단정하지 않는다.** 운영과 개발의 구절 수가 다르다
#    (2026-09-10 기준 운영 36편 · 개발 26편 — seed_verses.sql 기준). 운영 숫자를
#    박아 두면 개발에서 늘 헛실패하고, 헛실패가 잦으면 진짜 실패를 안 보게 된다.
#    이 검사의 뜻은 「구절이 오는가」와 「시편이 안 섞였는가」 둘이다.
#    정확한 수를 확인하고 싶으면 PSALM_EXPECT_WEEKLY 를 주면 된다.
chk "weekly 구절이 온다(0편 아님)" "$(jqn 'len(d["verses"]) > 0' "$W")" "True"
if [ -n "${PSALM_EXPECT_WEEKLY:-}" ]; then
  chk "weekly 편수 = $PSALM_EXPECT_WEEKLY" "$(jqn 'len(d["verses"])' "$W")" "$PSALM_EXPECT_WEEKLY"
else
  echo "  ℹ️ weekly 편수 = $(jqn 'len(d["verses"])' "$W")  (PSALM_EXPECT_WEEKLY 를 주면 단정합니다)"
fi
chk "weekly 최대 no < 1000 (시편이 안 섞임 — 이 검사의 진짜 뜻)" "$(jqn 'max(v["no"] for v in d["verses"]) < 1000' "$W")" "True"

echo "② 시편"
chk "openCount 있음" "$(jqn '"openCount" in d' "$P")" "True"

OPEN="$(jqn 'd.get("openCount", 0)' "$P")"
NVERSES="$(jqn 'len(d.get("verses", []))' "$P")"
echo "  ℹ️ openCount=$OPEN · 실제 편수=$NVERSES"

if [ "$OPEN" = "0" ]; then
  # openCount=0(아직 시작 전)이면 verses가 빈 배열이라 아래 두 검사가 항상 통과해 버려
  # 잠금 로직을 하나도 안 보고 「통과」로 오인하게 된다 — 그래서 건너뜀으로 센다.
  sk "안 열린 구절 없음" "openCount=0, 아직 시작 전이라 잠금을 검증할 수 없습니다"
  sk "편수 = openCount 이하" "openCount=0, 아직 시작 전이라 잠금을 검증할 수 없습니다"
  sk "dayNo 연속(빠짐 없음)" "openCount=0, 아직 시작 전이라 잠금을 검증할 수 없습니다"
else
  chk "안 열린 구절 없음" "$(jqn 'all(v["dayNo"] <= d["openCount"] for v in d["verses"])' "$P")" "True"
  chk "편수 = openCount 이하" "$(jqn 'len(d["verses"]) <= d["openCount"]' "$P")" "True"
  echo "  자료 ${NVERSES}편 / 열림 ${OPEN}편"
  # 연속성: 실제로 돌아온 dayNo가 1..편수로 빠짐없이 이어지는가.
  # 자료가 일부만 채워진 상태(앞에서부터 30편만 등)는 정상이라 실패로 치지 않는다 —
  # 위 "자료 N편 / 열림 M편" 줄이 그 사실을 알려 준다. 이 검사가 잡는 것은
  # "중간이 빠진" 경우(예: 1,2,4 — 3이 없음)뿐이다.
  chk "dayNo 연속(빠짐 없음)" "$(jqn 'sorted(v["dayNo"] for v in d["verses"]) == list(range(1, len(d["verses"])+1))' "$P")" "True"
fi

# ⚠️ totalDays 도 숫자로 단정하지 않는다 — **실제로 심은 편수**를 넣기 때문이다
#    (구절 10편이면 10). 계획상의 180 을 박아 두면 늘 헛실패한다.
#    뜻은 「구절 수보다 작지 않은가」다 — 작으면 뒤쪽 구절이 영영 안 열린다.
chk "totalDays ≥ 자료 편수" "$(jqn 'd["totalDays"] >= len(d["verses"])' "$P")" "True"
echo "  ℹ️ totalDays = $(jqn 'd["totalDays"]' "$P")"

if [ -n "${PSALM_EXPECT_START:-}" ]; then
  chk "startDate" "$(jqn 'd.get("startDate")' "$P")" "$PSALM_EXPECT_START"
else
  echo "  ℹ️ startDate = $(jqn 'd.get("startDate")' "$P")"
fi

echo
echo "통과 $pass · 건너뜀 $skip · 실패 $fail"
if [ "$skip" -gt 0 ]; then
  echo "⚠️ 잠금 검증은 시작일을 앞당긴 뒤 다시 돌려야 확인됩니다"
fi
[ "$fail" -eq 0 ]
