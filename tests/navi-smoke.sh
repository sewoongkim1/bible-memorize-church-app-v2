#!/usr/bin/env bash
# 📚 네비게이토 성경암송(2026-10-13) — 읽기 전용 스모크. 기본은 개발 DB. (docs/notes/navigators.md)
#   DEV_ANON=… bash tests/navi-smoke.sh                       개발
#   NAVI_ENV=prod PROD_ANON=… bash tests/navi-smoke.sh        운영
#   카드 수를 단정하려면 NAVI_EXPECT=73 (시드를 넣기 전 운영은 0 — 그때는 주지 않는다)
# 공개 키는 js/config.js 에 있는 값과 같다(누구나 가진 것).
set -u
if [ "${NAVI_ENV:-dev}" = "prod" ]; then
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
jqn() {
  python -c '
import json, sys
d = json.load(sys.stdin)
print(eval(sys.argv[1]))
' "$1" <<< "$2"
}

W=$(call '{"action":"getVerses"}')
P=$(call '{"action":"getVerses","track":"psalm"}')
N=$(call '{"action":"getVerses","track":"navi"}')
C=$(call '{"action":"getConfig","key":"naviPublic"}')

echo "① 주간(track 없음) — 네비게이토가 섞이지 않는다"
chk "weekly 구절이 온다(0편 아님)" "$(jqn 'len(d["verses"]) > 0' "$W")" "True"
chk "weekly 최대 no < 1000 (물가·네비게이토가 안 섞임)" "$(jqn 'max(v["no"] for v in d["verses"]) < 1000' "$W")" "True"

echo "② 쉴만한 물가 — 1001~1999 만"
chk "psalm 응답 ok" "$(jqn 'd.get("ok")' "$P")" "True"
chk "psalm 번호 1001~1999" "$(jqn 'all(1001 <= v["no"] <= 1999 for v in d.get("verses", []))' "$P")" "True"

echo "③ 네비게이토(track:navi)"
chk "navi 응답 ok · navi:true 표식(이 갈래가 있는 판)" "$(jqn 'd.get("ok") is True and d.get("navi") is True' "$N")" "True"
CNT="$(jqn 'len(d.get("verses", []))' "$N")"
echo "  ℹ️ 카드 ${CNT}장"
if [ -n "${NAVI_EXPECT:-}" ]; then
  chk "카드 수 = $NAVI_EXPECT" "$CNT" "$NAVI_EXPECT"
fi
if [ "$CNT" != "0" ]; then
  chk "번호 2001~2199" "$(jqn 'all(2001 <= v["no"] <= 2199 for v in d["verses"])' "$N")" "True"
  chk "번호순" "$(jqn '[v["no"] for v in d["verses"]] == sorted(v["no"] for v in d["verses"])' "$N")" "True"
  chk "묶음 코드는 일곱 가지 안" "$(jqn 'set(v["chapter"] for v in d["verses"]) <= {"assurance","guide","A","B","C","D","E"}' "$N")" "True"
  chk "칸(no·chapter·topic·refShort·refFull·text)이 다 있고 본문이 빈 카드 없음" \
    "$(jqn 'all(set(v) >= {"no","chapter","topic","refShort","refFull","text"} and v["text"] and v["topic"] for v in d["verses"])' "$N")" "True"
fi

echo "④ 문 — naviPublic 은 공개 키로 읽힌다(값은 열기 전까지 없거나 false)"
chk "getConfig naviPublic 허용" "$(jqn 'd.get("ok") is True' "$C")" "True"
echo "  ℹ️ naviPublic = $(jqn 'd.get("value")' "$C")"

echo
echo "통과 $pass · 실패 $fail"
[ "$fail" -eq 0 ]
