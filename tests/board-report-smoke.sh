#!/usr/bin/env bash
# 게시판 신고(🚩) — 읽기 전용 스모크. 기본은 개발 DB.
#   bash tests/board-report-smoke.sh                     개발
#   BR_ENV=prod bash tests/board-report-smoke.sh          운영
# 관리자 액션까지 보려면(비번을 아는 사람만 — 화면·로그에 찍지 않는다):
#   ADMIN_PW=... bash tests/board-report-smoke.sh
#
# ⚠️ 쓰기(실제 신고)는 하지 않는다 — 성도님 DB 에 쓰레기를 남기지 않으려고 **거부되어야 하는 요청만** 던진다.
#    (없는 글 번호를 쓰므로 board_reports 에 한 줄도 안 들어간다. 실제 신고는 브라우저에서 확인한다.)
# ⚠️ 본문에 한글을 쓰지 않는다 — 명령줄 리터럴 한글은 깨져서 서버 버그로 오인하게 된다.
# ⚠️ 표(supabase/board_reports.sql)가 없어도 1)~5)는 통과한다 — 대상 확인이 표보다 먼저다.
#    표가 있는지는 6) 에서 ADMIN_PW 로 boardReports 를 불러 본다(not-ready 면 아직 없는 것).
set -u
if [ "${BR_ENV:-dev}" = "prod" ]; then
  BASE="https://xnomlgydifiqiybervtf.supabase.co/functions/v1/api"
  KEY="sb_publishable_oLtieT_jw7Gjb8etEsy0jw_thBaDjl-"
else
  BASE="https://ktpwthwqzgcqcrmsafdo.supabase.co/functions/v1/api"
  KEY="sb_publishable_eJKP6u95IU9_DBXTvnvYBA_-yGCf-0Y"
fi

call() {
  curl -s -X POST "$BASE" -H "Content-Type: application/json" \
    -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -d "$1"
}

pass=0; fail=0; skip=0
chk() { # 이름, 실제, 기대
  if [ "$2" = "$3" ]; then echo "  o $1 = $2"; pass=$((pass+1));
  else echo "  X $1 = $2  (기대 $3)"; fail=$((fail+1)); fi
}
sk() { echo "  - $1 ... 건너뜀 ($2)"; skip=$((skip+1)); }

# 파이썬 표현식을 sys.argv[1]로 넘긴다(코드 문자열에 갖다 붙이지 않는다).
jqn() {
  PYTHONIOENCODING=utf-8 python -c '
import json, sys
try:
    d = json.load(sys.stdin)
except Exception:
    d = {"_raw": "not-json"}
print(eval(sys.argv[1]))
' "$1" <<< "$2"
}
# 응답 어디에도 user_id · reporter 가 없어야 한다(값이 null 이어도 키 자체가 없어야 한다)
noleak() { # 이름, 응답
  chk "$1 — user_id 를 싣지 않는다" "$(jqn '"user_id" not in json.dumps(d)' "$2")" "True"
  chk "$1 — reporter 를 싣지 않는다" "$(jqn '"reporter" not in json.dumps(d)' "$2")" "True"
}

ZERO="00000000-0000-0000-0000-000000000000"
FAR=2147480000      # 있을 리 없는 글 번호

echo "0) 함수가 이 액션을 안다"
U=$(call '{"action":"boardReport"}')
chk "unknown action 이 아니다" "$(jqn '"unknown action" not in str(d.get("error",""))' "$U")" "True"

echo "1) boardReport - 신원이 없으면 거부한다"
A1=$(call "{\"action\":\"boardReport\",\"post_id\":$FAR,\"reason\":\"spam\"}")
chk "no-user 거부" "$(jqn 'd.get("error")' "$A1")" "no-user"
chk "ok=false" "$(jqn 'd.get("ok")' "$A1")" "False"
A2=$(call "{\"action\":\"boardReport\",\"user_id\":\"not-a-uuid\",\"post_id\":$FAR,\"reason\":\"spam\"}")
chk "모양이 틀린 신원도 no-user" "$(jqn 'd.get("error")' "$A2")" "no-user"
noleak "no-user 응답" "$A1"

echo "2) boardReport - 목록에 없는 까닭은 거부한다"
B1=$(call "{\"action\":\"boardReport\",\"user_id\":\"$ZERO\",\"post_id\":$FAR,\"reason\":\"nope\"}")
chk "bad-reason 거부" "$(jqn 'd.get("error")' "$B1")" "bad-reason"
B2=$(call "{\"action\":\"boardReport\",\"user_id\":\"$ZERO\",\"post_id\":$FAR}")
chk "까닭이 없어도 bad-reason" "$(jqn 'd.get("error")' "$B2")" "bad-reason"

echo "3) boardReport - 대상이 없으면 거부한다"
C1=$(call "{\"action\":\"boardReport\",\"user_id\":\"$ZERO\",\"reason\":\"spam\"}")
chk "bad-args 거부" "$(jqn 'd.get("error")' "$C1")" "bad-args"
C2=$(call "{\"action\":\"boardReport\",\"user_id\":\"$ZERO\",\"post_id\":-5,\"reason\":\"spam\"}")
chk "음수 번호도 bad-args" "$(jqn 'd.get("error")' "$C2")" "bad-args"

echo "4) boardReport - 없는 글·답글은 not-found"
D1=$(call "{\"action\":\"boardReport\",\"user_id\":\"$ZERO\",\"post_id\":$FAR,\"reason\":\"spam\",\"note\":\"smoke\"}")
chk "없는 글 not-found" "$(jqn 'd.get("error")' "$D1")" "not-found"
chk "ok=false" "$(jqn 'd.get("ok")' "$D1")" "False"
noleak "not-found(글) 응답" "$D1"
D2=$(call "{\"action\":\"boardReport\",\"user_id\":\"$ZERO\",\"reply_id\":$FAR,\"reason\":\"privacy\"}")
chk "없는 답글 not-found" "$(jqn 'd.get("error")' "$D2")" "not-found"
noleak "not-found(답글) 응답" "$D2"

echo "5) 관리자 액션은 비번 없이 열리지 않는다"
E1=$(call '{"action":"boardReports"}')
chk "boardReports 거부" "$(jqn 'd.get("error") in ("unauthorized","no-password-set")' "$E1")" "True"
chk "items 를 싣지 않는다" "$(jqn '"items" not in d' "$E1")" "True"
E2=$(call '{"action":"boardReportResolve","kind":"post","id":1,"op":"hide"}')
chk "boardReportResolve 거부" "$(jqn 'd.get("error") in ("unauthorized","no-password-set")' "$E2")" "True"
E3=$(call '{"action":"boardReports","pw":"definitely-wrong"}')
chk "틀린 비번도 거부" "$(jqn 'd.get("error") in ("unauthorized","no-password-set")' "$E3")" "True"

echo "6) (관리자) 신고 목록 — 표가 있는가 · 신고한 분이 안 실리는가"
if [ -z "${ADMIN_PW:-}" ]; then
  sk "boardReports 목록" "ADMIN_PW 환경변수가 없습니다"
  sk "boardReportResolve 인자 검사" "ADMIN_PW 환경변수가 없습니다"
else
  # 비번은 파일로 넘겨 명령줄(ps)·화면에 남기지 않는다
  TMPB=$(mktemp); printf '{"action":"boardReports","pw":%s}' "$(PYTHONIOENCODING=utf-8 python -c 'import json,os;print(json.dumps(os.environ["ADMIN_PW"]))')" > "$TMPB"
  F1=$(curl -s -X POST "$BASE" -H "Content-Type: application/json" -H "apikey: $KEY" -H "Authorization: Bearer $KEY" --data-binary @"$TMPB")
  rm -f "$TMPB"
  if [ "$(jqn 'd.get("error")' "$F1")" = "not-ready" ]; then
    echo "  X 표가 아직 없다(not-ready) — supabase/board_reports.sql 을 이 DB 에서 먼저 실행할 것"; fail=$((fail+1))
  else
    chk "ok" "$(jqn 'd.get("ok")' "$F1")" "True"
    chk "items 가 배열" "$(jqn 'isinstance(d.get("items"), list)' "$F1")" "True"
    chk "까닭 라벨 넷" "$(jqn 'sorted(d.get("labels",{}).keys())' "$F1")" "['inappropriate', 'other', 'privacy', 'spam']"
    chk "보관 90일" "$(jqn 'd.get("keepDays")' "$F1")" "90"
    noleak "boardReports 응답" "$F1"
    echo "  i 처리 전 신고 $(jqn 'len(d.get("items", []))' "$F1")건"
  fi
  TMPB=$(mktemp); printf '{"action":"boardReportResolve","pw":%s,"kind":"post","id":0,"op":"hide"}' "$(PYTHONIOENCODING=utf-8 python -c 'import json,os;print(json.dumps(os.environ["ADMIN_PW"]))')" > "$TMPB"
  F2=$(curl -s -X POST "$BASE" -H "Content-Type: application/json" -H "apikey: $KEY" -H "Authorization: Bearer $KEY" --data-binary @"$TMPB")
  rm -f "$TMPB"
  chk "번호 0 은 bad-args(아무것도 안 숨긴다)" "$(jqn 'd.get("error")' "$F2")" "bad-args"
  TMPB=$(mktemp); printf '{"action":"boardReportResolve","pw":%s,"kind":"post","id":1,"op":"delete"}' "$(PYTHONIOENCODING=utf-8 python -c 'import json,os;print(json.dumps(os.environ["ADMIN_PW"]))')" > "$TMPB"
  F3=$(curl -s -X POST "$BASE" -H "Content-Type: application/json" -H "apikey: $KEY" -H "Authorization: Bearer $KEY" --data-binary @"$TMPB")
  rm -f "$TMPB"
  chk "op 는 hide·resolve 뿐(delete 거부)" "$(jqn 'd.get("error")' "$F3")" "bad-args"
fi

echo
echo "통과 $pass · 실패 $fail · 건너뜀 $skip"
[ "$fail" = "0" ]
