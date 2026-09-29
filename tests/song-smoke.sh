#!/usr/bin/env bash
# 오늘의 찬양 — 읽기 전용 스모크. 기본은 개발 DB.
#   DEV_ANON=… bash tests/song-smoke.sh
#   SONG_ENV=prod PROD_ANON=… bash tests/song-smoke.sh
set -u
if [ "${SONG_ENV:-dev}" = "prod" ]; then
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
jqn() { python -c '
import json, sys
d = json.load(sys.stdin)
print(eval(sys.argv[1]))
' "$1" <<< "$2"; }

pass=0; fail=0; skip=0
chk() { if [ "$2" = "$3" ]; then echo "  ✓ $1 = $2"; pass=$((pass+1));
        else echo "  ✗ $1 = $2  (기대 $3)"; fail=$((fail+1)); fi }
sk() { echo "  − $1 … 건너뜀 ($2)"; skip=$((skip+1)); }

S=$(call '{"action":"getTodaySong"}')
echo "① 응답 모양"
chk "ok" "$(jqn 'd.get("ok")' "$S")" "True"
chk "song 키가 있다" "$(jqn '"song" in d' "$S")" "True"

SONG="$(jqn 'd.get("song")' "$S")"
if [ "$SONG" = "None" ]; then
  echo "  ℹ️ song=null — 후보가 없는 DB 다(개발에 시드를 안 넣었거나 거르개가 전부 걸렀다)."
  echo "     supabase/praise_songs_dev_seed.sql 을 먼저 돌렸는지 보세요."
  sk "id 가 있다" "후보가 없어 검증할 수 없습니다 — supabase/praise_songs_dev_seed.sql 을 먼저 돌리세요"
  sk "곡명이 있다" "후보가 없어 검증할 수 없습니다 — supabase/praise_songs_dev_seed.sql 을 먼저 돌리세요"
  sk "곡명이 「찬양」이 아니다" "후보가 없어 검증할 수 없습니다 — supabase/praise_songs_dev_seed.sql 을 먼저 돌리세요"
  sk "곡명 ≠ 찬양대 이름" "후보가 없어 검증할 수 없습니다 — supabase/praise_songs_dev_seed.sql 을 먼저 돌리세요"
  sk "duration 은 \"m:ss\" 꼴" "후보가 없어 검증할 수 없습니다 — supabase/praise_songs_dev_seed.sql 을 먼저 돌리세요"
  sk "응답에 관리용 칸이 없다" "후보가 없어 검증할 수 없습니다 — supabase/praise_songs_dev_seed.sql 을 먼저 돌리세요"
  sk "두 번째도 같은 곡" "후보가 없어 검증할 수 없습니다 — supabase/praise_songs_dev_seed.sql 을 먼저 돌리세요"
else
  echo "② 곡 정보"
  chk "id 가 있다"     "$(jqn 'bool(d["song"].get("id"))' "$S")" "True"
  chk "곡명이 있다"    "$(jqn 'bool(d["song"].get("song"))' "$S")" "True"
  # ⚠️ 이 셋이 이 검사의 진짜 뜻이다 — 거르개가 실제로 돌았는가.
  chk "곡명이 「찬양」이 아니다"  "$(jqn 'd["song"]["song"].strip().strip(chr(39)+chr(34)) not in ("찬양","찬양과 경배","특송","")' "$S")" "True"
  chk "곡명 ≠ 찬양대 이름"       "$(jqn 'd["song"]["song"].strip() != (d["song"].get("choir") or "").strip()' "$S")" "True"
  chk "duration 은 \"m:ss\" 꼴"  "$(jqn 'bool(__import__("re").match(r"^\d+:\d\d$", d["song"].get("duration") or ""))' "$S")" "True"
  # ⚠️ 관리용 칸이 새지 않는가 — 뷰가 여섯 칸만 내보내므로 셀 수 있다.
  chk "응답에 관리용 칸이 없다"  "$(jqn 'set(d["song"]) <= {"id","song","choir","svc_date","duration","thumbnail"}' "$S")" "True"

  echo "③ 같은 날엔 같은 곡(두 번 불러 본다)"
  S2=$(call '{"action":"getTodaySong"}')
  chk "두 번째도 같은 곡" "$(jqn 'd["song"]["id"]' "$S2")" "$(jqn 'd["song"]["id"]' "$S")"
fi

echo "④ date 입력을 열지 않는다 — 쓰는 액션이기 때문"
F=$(call '{"action":"getTodaySong","date":"2030-01-01"}')
if [ "$SONG" != "None" ]; then
  chk "미래 날짜를 줘도 오늘 곡" "$(jqn 'd["song"]["id"]' "$F")" "$(jqn 'd["song"]["id"]' "$S")"
else
  sk "미래 날짜를 줘도 오늘 곡" "후보가 없어 검증할 수 없습니다 — supabase/praise_songs_dev_seed.sql 을 먼저 돌리세요"
fi

echo
echo "통과 $pass · 건너뜀 $skip · 실패 $fail"
if [ "$skip" -gt 0 ]; then
  echo "⚠️ 후보가 없을 때는 모든 검증을 다시 돌려야 확인됩니다"
fi
[ "$fail" -eq 0 ]
