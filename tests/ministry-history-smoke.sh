#!/usr/bin/env bash
# 사역 이력 확인 · 정정 신청 — 개발 api → 교회 어드민 내부 갈래까지 끝에서 끝으로(2026-10-01).
#   bash tests/ministry-history-smoke.sh
# ⚠️ 개발만. 키·비번은 파일에서 읽어 이 스크립트 안에서만 쓴다(찍지 않는다):
#    ~/.church-admin/dev.env(DEV_URL·DEV_ANON·DEV_SERVICE_KEY) · .env.dev(ADMIN_SECRET — 개발 관리자 비번)
# 시험 계정은 screen-sweep 과 같은 「화면점검」(교구 믿음-99 — 목장 모름이라 늘 「찾지 못함」)이다. 넣은 신청은 끝에 지운다.
set -u
cd "$(dirname "$0")/.."
export PYTHONIOENCODING=utf-8 PYTHONUTF8=1   # 윈도우 파이썬의 표준 입출력이 cp949 라 한글 JSON 이 깨진다
set -a; . ~/.church-admin/dev.env; set +a
ADMIN_PW=$(grep -E '^ADMIN_SECRET=' .env.dev | head -1 | cut -d= -f2-)
[[ "$DEV_URL" == *ktpwthwqzgcqcrmsafdo* ]] || { echo "개발 주소가 아니다 — 멈춤"; exit 1; }
BASE="$DEV_URL/functions/v1/api"
call() { curl -s -X POST "$BASE" -H "Content-Type: application/json" -H "apikey: $DEV_ANON" -H "Authorization: Bearer $DEV_ANON" --data-binary @-; }
jqn() { python -c 'import json,sys; d=json.load(sys.stdin); print(eval(sys.argv[1]))' "$1"; }
pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then echo "  ✓ $1 = $2"; pass=$((pass+1)); else echo "  ✗ $1 = $2  (기대 $3)"; fail=$((fail+1)); fi; }

# 한글은 명령줄 리터럴이 아니라 UTF-8 파일 본문으로 보낸다(curl 한글 인코딩 함정)
UID_=$(printf '%s' '{"action":"login","type":"교구","gu":"믿음","mok":"99","name":"화면점검"}' | call | jqn 'd["user_id"]')
[ -n "$UID_" ] || { echo "로그인 실패"; exit 1; }
OPEN=$(printf '%s' '{"action":"ministryCatalog"}' | call | jqn 'bool((d.get("period") or {}).get("isOpen"))')

echo "[문 검사]"
chk "user_id 없음" "$(printf '%s' '{"action":"ministryHistoryMine"}' | call | jqn 'd.get("error")')" "no-user"
if [ "$OPEN" = "False" ]; then
  chk "기간 밖·비번 없음" "$(printf '{"action":"ministryHistoryMine","user_id":"%s"}' "$UID_" | call | jqn 'd.get("error")')" "closed"
  chk "preview 깃발은 안 통한다" "$(printf '{"action":"ministryHistoryMine","user_id":"%s","preview":true}' "$UID_" | call | jqn 'd.get("error")')" "closed"
else
  echo "  − 개발 사역신청 기간이 열려 있어 「closed」 두 줄은 건너뜀"
fi

echo "[관리자 비번으로 — 교회 어드민까지]"
M=$(printf '{"action":"ministryHistoryMine","user_id":"%s","pw":"%s"}' "$UID_" "$ADMIN_PW" | call)
chk "ok" "$(jqn 'd.get("ok")' <<< "$M")" "True"
chk "found(믿음-99 는 목장 모름)" "$(jqn 'd.get("found")' <<< "$M")" "False"
chk "who.name" "$(jqn 'd["who"]["name"]' <<< "$M")" "화면점검"
chk "user_id 칸 없음" "$(jqn '"user_id" in json.dumps(d)' <<< "$M")" "False"
R=$(printf '{"action":"ministryHistoryRequest","user_id":"%s","pw":"%s","kind":"find_me","detail":"smoke"}' "$UID_" "$ADMIN_PW" | call)
chk "찾아 주세요" "$(jqn 'd.get("ok")' <<< "$R")" "True"
R2=$(printf '{"action":"ministryHistoryRequest","user_id":"%s","pw":"%s","kind":"find_me"}' "$UID_" "$ADMIN_PW" | call)
chk "두 번째 찾아 주세요" "$(jqn 'd.get("error")' <<< "$R2")" "already-open"
R3=$(printf '{"action":"ministryHistoryRequest","user_id":"%s","pw":"%s","kind":"not_mine","history_id":1}' "$UID_" "$ADMIN_PW" | call)
chk "찾지 못했는데 줄 정정" "$(jqn 'd.get("error")' <<< "$R3")" "not-found"
M2=$(printf '{"action":"ministryHistoryMine","user_id":"%s","pw":"%s"}' "$UID_" "$ADMIN_PW" | call)
chk "현황 첫 줄" "$(jqn 'd["requests"][0]["kind"] + "/" + d["requests"][0]["status"]' <<< "$M2")" "find_me/신청"

# 정리 — 이 계정의 신청을 지운다(service key)
SVC_AUTH=(); [[ "$DEV_SERVICE_KEY" == sb_secret_* ]] || SVC_AUTH=(-H "Authorization: Bearer $DEV_SERVICE_KEY")
curl -s -o /dev/null -w "  정리 %{http_code}\n" -X DELETE "$DEV_URL/rest/v1/ministry_history_requests?user_id=eq.$UID_" \
  -H "apikey: $DEV_SERVICE_KEY" "${SVC_AUTH[@]}"

echo "통과 $pass · 실패 $fail"
[ "$fail" = 0 ]
