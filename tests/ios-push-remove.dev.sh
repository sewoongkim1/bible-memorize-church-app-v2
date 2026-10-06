#!/usr/bin/env bash
# removeIosPush(아이폰 앱 「내 정보 지우기」 — 그 계정의 기기 토큰 지우기) — 개발 DB 끝까지 시험. ⚠️ 개발 전용(users 가 200 이상이면 멈춘다).
#   가짜 토큰 줄(진짜 기기 아님 · 글자 s3r-test-…)을 두 계정에 넣고, 한 계정만 지워지는지 · 틀린 번호는 거절되는지 본다. 끝나면 가짜 줄을 지운다.
#   쓰는 법: E2E_WORKDIR=<개발에 link 된 폴더> bash tests/ios-push-remove.dev.sh
set -u
REF=ktpwthwqzgcqcrmsafdo
BASE="https://$REF.supabase.co/functions/v1/api"
PUB="sb_publishable_eJKP6u95IU9_DBXTvnvYBA_-yGCf-0Y"
W="${E2E_WORKDIR:?개발에 link 된 폴더를 E2E_WORKDIR 로 주세요}"
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
call() { curl -s -X POST "$BASE" -H "Content-Type: application/json" -H "apikey: $PUB" -H "Authorization: Bearer $PUB" -d "$1"; }
pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then echo "  PASS $1 = $2"; pass=$((pass+1)); else echo "  FAIL $1 = $2 (expected $3)"; fail=$((fail+1)); fi; }
N=$(sq "select count(*) from users")
if [ -z "$N" ] || [ "$N" -ge 200 ]; then echo "users=$N — 개발이 아닌 것 같다. 중단."; exit 2; fi
TAG="s3r-test-$RANDOM$RANDOM"
cleanup() { sx "delete from ios_push_tokens where device_token like '$TAG%'"; echo "정리 뒤 — 가짜 토큰 줄 $(sq "select count(*) from ios_push_tokens where device_token like '$TAG%'")"; }
trap cleanup EXIT
UA=$(sq "select id from users order by created_at limit 1 offset 0"); UB=$(sq "select id from users order by created_at limit 1 offset 1")
[ -n "$UA" ] && [ -n "$UB" ] || { echo "개발 사용자 둘을 못 골랐다"; exit 2; }
A0=$(sq "select count(*) from ios_push_tokens where user_id='$UA'"); B0=$(sq "select count(*) from ios_push_tokens where user_id='$UB'")
[ "$A0" = "0" ] || { echo "고른 계정에 진짜 아이폰 토큰이 있다($A0) — 지우면 안 된다. 중단."; exit 2; }
sx "insert into ios_push_tokens(user_id, device_token, hour) values ('$UA', '$TAG-a1', 7), ('$UA', '$TAG-a2', 5), ('$UB', '$TAG-b1', 7)"
chk "fake rows inserted (A 2 · B 1)" "$(sq "select count(*) filter (where user_id='$UA') || ':' || count(*) filter (where user_id='$UB') from ios_push_tokens where device_token like '$TAG%'")" "2:1"
chk "no user_id -> no-user" "$(call '{"action":"removeIosPush"}' | python -c 'import json,sys; print(json.load(sys.stdin).get("error"))')" "no-user"
chk "not a uuid -> no-user" "$(call '{"action":"removeIosPush","user_id":"1 or 1=1"}' | python -c 'import json,sys; print(json.load(sys.stdin).get("error"))')" "no-user"
chk "nothing removed by refused calls" "$(sq "select count(*) from ios_push_tokens where device_token like '$TAG%'")" "3"
R=$(call "{\"action\":\"removeIosPush\",\"user_id\":\"$UA\"}")
chk "A's tokens removed -> ok, only {ok}" "$(printf '%s' "$R" | python -c 'import json,sys; d=json.load(sys.stdin); print(d.get("ok"), sorted(d.keys()))')" "True ['ok']"
chk "A has none · B untouched" "$(sq "select count(*) filter (where user_id='$UA') || ':' || count(*) filter (where user_id='$UB') from ios_push_tokens where device_token like '$TAG%'")" "0:1"
chk "B's real token count unchanged" "$(sq "select count(*) from ios_push_tokens where user_id='$UB' and device_token not like '$TAG%'")" "$B0"
chk "again -> ok (nothing to remove)" "$(call "{\"action\":\"removeIosPush\",\"user_id\":\"$UA\"}" | python -c 'import json,sys; print(json.load(sys.stdin).get("ok"))')" "True"
chk "no ids in response" "$(printf '%s' "$R" | grep -c -e "$UA" -e "$TAG" -e "user_id")" "0"
echo; echo "통과 $pass · 실패 $fail"
[ "$fail" = "0" ]
