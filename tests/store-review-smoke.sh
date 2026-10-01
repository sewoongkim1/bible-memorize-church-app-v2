#!/usr/bin/env bash
# 구글 출시 심사 전 고친 것(2026-10-01) — 읽기 전용 스모크. 기본은 개발 DB.
#   bash tests/store-review-smoke.sh                     개발
#   SR_ENV=prod bash tests/store-review-smoke.sh          운영
# 관리자 액션까지 보려면(비번을 아는 사람만 — 화면·로그에 찍지 않는다):
#   ADMIN_PW=... bash tests/store-review-smoke.sh
#
# ⚠️ 쓰기는 하지 않는다 — **거부되어야 하는 요청만** 던진다(없는 계정 0000… · 없는 글 번호).
#    · boardPost/boardReply: 없는 계정이라 rules-needed(규칙 확인에서 멈춘다 — 글이 안 생긴다)
#    · boardRulesAccept: 없는 계정이라 update 0행 → no-user
#    · boardBlock: 없는 글 → not-found · sermonAnswerReport: 없는 계정 → FK 위반 → no-user(행이 안 생긴다)
#    · login(보호자 확인)은 계정을 만들므로 여기서 안 부른다 — 브라우저에서 확인한다.
# ⚠️ 본문에 한글을 쓰지 않는다 — 명령줄 리터럴 한글은 깨져서 서버 버그로 오인하게 된다.
# ⚠️ SQL(users_consents · board_blocks · sermon_answer_reports)을 안 돌린 DB 에서도 1)~6)은 대부분 통과한다
#    (not-ready · 규칙 「통과」). 표가 있는지는 7)·8) 에서 본다.
set -u
if [ "${SR_ENV:-dev}" = "prod" ]; then
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
call_admin() {  # $1 = pw 를 뺀 나머지 JSON 조각(앞에 콤마 없이) — 비번은 파일로 넘긴다
  local TMPB; TMPB=$(mktemp)
  printf '{"pw":%s,%s}' "$(PYTHONIOENCODING=utf-8 python -c 'import json,os;print(json.dumps(os.environ["ADMIN_PW"]))')" "$1" > "$TMPB"
  curl -s -X POST "$BASE" -H "Content-Type: application/json" -H "apikey: $KEY" -H "Authorization: Bearer $KEY" --data-binary @"$TMPB"
  rm -f "$TMPB"
}

pass=0; fail=0; skip=0
chk() { if [ "$2" = "$3" ]; then echo "  o $1 = $2"; pass=$((pass+1)); else echo "  X $1 = $2  (기대 $3)"; fail=$((fail+1)); fi; }
sk() { echo "  - $1 ... 건너뜀 ($2)"; skip=$((skip+1)); }
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
noleak() { # 응답 어디에도 user_id · blocked_id · reporter 가 없어야 한다
  chk "$1 — user_id 없음" "$(jqn '"user_id" not in json.dumps(d)' "$2")" "True"
  chk "$1 — blocked_id 없음" "$(jqn '"blocked_id" not in json.dumps(d)' "$2")" "True"
  chk "$1 — reporter 없음" "$(jqn '"reporter" not in json.dumps(d)' "$2")" "True"
}

ZERO="00000000-0000-0000-0000-000000000000"
FAR=2147480000

echo "0) 함수가 새 액션을 안다"
for a in boardRulesAccept boardBlock boardBlocks boardUnblock sermonAnswerReport sermonAnswerReports sermonAnswerReportResolve; do
  U=$(call "{\"action\":\"$a\"}")
  chk "$a 는 unknown action 이 아니다" "$(jqn '"unknown action" not in str(d.get("error",""))' "$U")" "True"
done

echo "1) 게시판 글쓰기 문 — 신원·규칙 없이는 안 받는다(글이 안 생긴다)"
# ⚠️ users_consents.sql 을 안 돌린 DB 는 규칙 확인이 「통과」(칸이 없으면 막지 않는다)라, 없는 계정으로 보내면 **글이 생긴다**.
#    그래서 먼저 boardList 로 규칙 칸이 있는지(rulesOk=False) 보고, 없으면 쓰기 시험을 건너뛴다.
G0=$(call "{\"action\":\"boardList\",\"user_id\":\"$ZERO\"}")
P1=$(call '{"action":"boardPost","name":"smoke","content":"smoke"}')
chk "신원 없음 → no-user" "$(jqn 'd.get("error")' "$P1")" "no-user"
if [ "$(jqn 'd.get("rulesOk")' "$G0")" != "False" ]; then
  echo "  X users.board_rules_at 칸이 없다(rulesOk=$(jqn 'd.get("rulesOk")' "$G0")) — supabase/users_consents.sql 을 먼저. 쓰기 시험은 건너뛴다"
  fail=$((fail+1))
else
  P2=$(call "{\"action\":\"boardPost\",\"name\":\"smoke\",\"content\":\"smoke\",\"user_id\":\"$ZERO\"}")
  chk "없는 계정 → rules-needed" "$(jqn 'd.get("error")' "$P2")" "rules-needed"
  P3=$(call "{\"action\":\"boardReply\",\"post_id\":$FAR,\"name\":\"smoke\",\"content\":\"smoke\",\"user_id\":\"$ZERO\"}")
  chk "답글도 rules-needed" "$(jqn 'd.get("error")' "$P3")" "rules-needed"
fi

echo "2) boardRulesAccept — 없는 계정은 no-user"
R1=$(call "{\"action\":\"boardRulesAccept\",\"user_id\":\"$ZERO\"}")
chk "no-user" "$(jqn 'd.get("error")' "$R1")" "no-user"
R2=$(call '{"action":"boardRulesAccept","user_id":"not-a-uuid"}')
chk "모양이 틀린 신원도 no-user" "$(jqn 'd.get("error")' "$R2")" "no-user"

echo "3) boardBlock — 신원 · 번호 · 대상 확인"
B1=$(call "{\"action\":\"boardBlock\",\"kind\":\"post\",\"id\":$FAR}")
chk "신원 없음 → no-user" "$(jqn 'd.get("error")' "$B1")" "no-user"
B2=$(call "{\"action\":\"boardBlock\",\"kind\":\"post\",\"id\":0,\"user_id\":\"$ZERO\"}")
chk "번호 0 → bad-args" "$(jqn 'd.get("error")' "$B2")" "bad-args"
B3=$(call "{\"action\":\"boardBlock\",\"kind\":\"post\",\"id\":$FAR,\"user_id\":\"$ZERO\"}")
chk "없는 글 → not-found" "$(jqn 'd.get("error")' "$B3")" "not-found"
noleak "boardBlock not-found" "$B3"
B4=$(call "{\"action\":\"boardBlock\",\"kind\":\"reply\",\"id\":$FAR,\"user_id\":\"$ZERO\"}")
chk "없는 답글 → not-found" "$(jqn 'd.get("error")' "$B4")" "not-found"

echo "4) boardBlocks · boardUnblock — 남의 줄은 못 건드린다"
L1=$(call "{\"action\":\"boardBlocks\",\"user_id\":\"$ZERO\"}")
if [ "$(jqn 'd.get("error")' "$L1")" = "not-ready" ]; then
  echo "  X board_blocks 표가 없다(not-ready) — supabase/board_blocks.sql 을 먼저"; fail=$((fail+1))
else
  chk "빈 목록" "$(jqn 'd.get("list")' "$L1")" "[]"
  noleak "boardBlocks" "$L1"
fi
L2=$(call "{\"action\":\"boardUnblock\",\"user_id\":\"$ZERO\",\"block_id\":1}")
chk "남의 줄 → removed 0" "$(jqn 'd.get("removed")' "$L2")" "0"
L3=$(call '{"action":"boardBlocks"}')
chk "신원 없음 → no-user" "$(jqn 'd.get("error")' "$L3")" "no-user"

echo "5) boardList — 보는 분에게 rulesOk·blockedCount, 글마다 blockable(참/거짓), user_id 는 없다"
G1=$(call "{\"action\":\"boardList\",\"user_id\":\"$ZERO\"}")
chk "ok" "$(jqn 'd.get("ok")' "$G1")" "True"
chk "없는 계정은 rulesOk=False" "$(jqn 'd.get("rulesOk")' "$G1")" "False"
chk "blockedCount=0" "$(jqn 'd.get("blockedCount")' "$G1")" "0"
chk "blockable 은 참/거짓만" "$(jqn 'all(isinstance(p.get("blockable"), bool) for p in d.get("posts", []))' "$G1")" "True"
noleak "boardList" "$G1"

echo "6) sermonAnswerReport — 신원 · 까닭 · 질문 확인(행이 안 생긴다)"
S1=$(call '{"action":"sermonAnswerReport","reason":"wrong","question":"q","answer":"a"}')
chk "신원 없음 → no-user" "$(jqn 'd.get("error")' "$S1")" "no-user"
S2=$(call "{\"action\":\"sermonAnswerReport\",\"user_id\":\"$ZERO\",\"reason\":\"nope\",\"question\":\"q\",\"answer\":\"a\"}")
chk "까닭 → bad-reason" "$(jqn 'd.get("error")' "$S2")" "bad-reason"
S3=$(call "{\"action\":\"sermonAnswerReport\",\"user_id\":\"$ZERO\",\"reason\":\"wrong\",\"question\":\"  \",\"answer\":\"a\"}")
chk "빈 질문 → bad-args" "$(jqn 'd.get("error")' "$S3")" "bad-args"
S4=$(call "{\"action\":\"sermonAnswerReport\",\"user_id\":\"$ZERO\",\"reason\":\"wrong\",\"question\":\"smoke question\",\"answer\":\"smoke answer\"}")
S4E=$(jqn 'd.get("error")' "$S4")
if [ "$S4E" = "not-ready" ]; then
  echo "  X sermon_answer_reports 표가 없다(not-ready) — supabase/sermon_answer_reports.sql 을 먼저"; fail=$((fail+1))
else
  chk "없는 계정 → no-user(FK)" "$S4E" "no-user"
fi
noleak "sermonAnswerReport" "$S4"

echo "7) 관리자 액션은 비번 없이 열리지 않는다"
E1=$(call '{"action":"sermonAnswerReports"}')
chk "sermonAnswerReports 거부" "$(jqn 'd.get("error") in ("unauthorized","no-password-set")' "$E1")" "True"
chk "items 를 싣지 않는다" "$(jqn '"items" not in d' "$E1")" "True"
E2=$(call '{"action":"sermonAnswerReportResolve","id":1,"op":"uncache"}')
chk "sermonAnswerReportResolve 거부" "$(jqn 'd.get("error") in ("unauthorized","no-password-set")' "$E2")" "True"

echo "8) (관리자) AI 답 알림 목록 — 표가 있는가 · 알린 분이 안 실리는가"
if [ -z "${ADMIN_PW:-}" ]; then
  sk "sermonAnswerReports 목록" "ADMIN_PW 환경변수가 없습니다"
else
  F1=$(call_admin '"action":"sermonAnswerReports"')
  if [ "$(jqn 'd.get("error")' "$F1")" = "not-ready" ]; then
    echo "  X 표가 아직 없다(not-ready)"; fail=$((fail+1))
  else
    chk "ok" "$(jqn 'd.get("ok")' "$F1")" "True"
    chk "까닭 라벨 셋" "$(jqn 'sorted(d.get("labels",{}).keys())' "$F1")" "['offensive', 'other', 'wrong']"
    chk "보관 90일" "$(jqn 'd.get("keepDays")' "$F1")" "90"
    noleak "sermonAnswerReports" "$F1"
  fi
  F2=$(call_admin '"action":"sermonAnswerReportResolve","id":0,"op":"resolve"')
  chk "번호 0 → bad-args" "$(jqn 'd.get("error")' "$F2")" "bad-args"
  F3=$(call_admin "\"action\":\"sermonAnswerReportResolve\",\"id\":$FAR,\"op\":\"resolve\"")
  chk "없는 알림 → not-found" "$(jqn 'd.get("error")' "$F3")" "not-found"
fi

echo
echo "통과 $pass · 실패 $fail · 건너뜀 $skip"
[ "$fail" = "0" ]
