#!/usr/bin/env bash
# 이벤트 플랫폼 — 읽기 전용 스모크. 기본은 개발 DB.
#   bash tests/event-smoke.sh                                개발
#   EVT_ENV=prod bash tests/event-smoke.sh                   운영
# 관리자 액션까지 보려면(비번을 아는 사람만):
#   ADMIN_PW=... bash tests/event-smoke.sh
#
# ⚠️ 쓰기(등록·저장)는 검사하지 않는다 — 성도님 DB에 쓰레기를 남기지 않으려고
#    거부되어야 하는 요청만 던진다. 실제 등록은 브라우저에서 확인한다.
# ⚠️ 본문에 한글을 쓰지 않는다 — 명령줄 리터럴 한글은 깨져서 서버 버그로 오인하게 된다.
set -u
if [ "${EVT_ENV:-dev}" = "prod" ]; then
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

# 파이썬 표현식을 sys.argv[1]로 넘긴다(코드 문자열에 갖다 붙이지 않는다) —
# 그래야 표현식 안에 큰따옴표를 그대로 쓸 수 있다.
jqn() {
  PYTHONIOENCODING=utf-8 python -c '
import json, sys
d = json.load(sys.stdin)
print(eval(sys.argv[1]))
' "$1" <<< "$2"
}

echo "1) eventOpenList - 로그인 없이도 목록은 열린다"
L=$(call '{"action":"eventOpenList"}')
chk "ok" "$(jqn 'd.get("ok")' "$L")" "True"
chk "events 가 배열" "$(jqn 'isinstance(d.get("events"), list)' "$L")" "True"
chk "mine 이 배열" "$(jqn 'isinstance(d.get("mine"), list)' "$L")" "True"
chk "draft 회차는 안 실린다" "$(jqn 'all(e["status"] != "draft" for e in d.get("events", []))' "$L")" "True"
chk "archived 회차는 안 실린다" "$(jqn 'all(e["status"] != "archived" for e in d.get("events", []))' "$L")" "True"
chk "user_id 를 싣지 않는다" "$(jqn '"user_id" not in json.dumps(d)' "$L")" "True"
chk "ident_key 를 싣지 않는다" "$(jqn '"ident_key" not in json.dumps(d)' "$L")" "True"
chk "note 를 싣지 않는다" "$(jqn '"note" not in json.dumps(d)' "$L")" "True"

N=$(jqn 'len(d.get("events", []))' "$L")
echo "  i 보이는 회차 ${N}개"
if [ "$N" = "0" ]; then
  sk "정렬(등록 가능·미제출이 앞)" "회차가 없습니다"
else
  chk "정렬(등록 가능·미제출이 앞)" \
    "$(jqn 'all((not(d["events"][i]["canSignup"] and not d["events"][i]["mine"])) <= (not(d["events"][i+1]["canSignup"] and not d["events"][i+1]["mine"])) for i in range(len(d["events"])-1))' "$L")" "True"
  chk "canSignup 이 boolean" "$(jqn 'all(isinstance(e["canSignup"], bool) for e in d["events"])' "$L")" "True"
fi

echo "2) eventSignup - 신원이 없으면 거부한다"
S=$(call '{"action":"eventSignup","event_id":"nope"}')
chk "no-user 거부" "$(jqn 'd.get("error")' "$S")" "no-user"
chk "ok=false" "$(jqn 'd.get("ok")' "$S")" "False"

echo "3) eventSignup - 없는 회차는 거부한다"
S2=$(call '{"action":"eventSignup","user_id":"00000000-0000-0000-0000-000000000000","event_id":"definitely-not-a-real-event"}')
chk "not-found 거부" "$(jqn 'd.get("error")' "$S2")" "not-found"

echo "4) eventDrop - 인자가 모자라면 거부한다"
D=$(call '{"action":"eventDrop"}')
chk "bad-args 거부" "$(jqn 'd.get("error")' "$D")" "bad-args"

echo "5) 관리자 액션은 비번 없이 열리지 않는다"
R=$(call '{"action":"eventRoster"}')
chk "eventRoster 거부" "$(jqn 'd.get("error") in ("unauthorized","no-password-set")' "$R")" "True"
V=$(call '{"action":"eventSave","event":{"id":"x","title":"x","opens_on":"2026-01-01","closes_on":"2026-01-02"}}')
chk "eventSave 거부" "$(jqn 'd.get("error") in ("unauthorized","no-password-set")' "$V")" "True"

echo "6) 관리자 목록(비번이 있을 때만)"
if [ -z "${ADMIN_PW:-}" ]; then
  sk "eventRoster" "ADMIN_PW 환경변수가 없습니다"
  sk "관리자 응답에도 user_id 가 없다" "ADMIN_PW 환경변수가 없습니다"
else
  RA=$(call "{\"action\":\"eventRoster\",\"pw\":\"$ADMIN_PW\"}")
  chk "ok" "$(jqn 'd.get("ok")' "$RA")" "True"
  chk "events 가 배열" "$(jqn 'isinstance(d.get("events"), list)' "$RA")" "True"
  chk "rows 가 배열" "$(jqn 'isinstance(d.get("rows"), list)' "$RA")" "True"
  chk "관리자 응답에도 user_id 가 없다" "$(jqn '"user_id" not in json.dumps(d)' "$RA")" "True"
fi

echo "7) 남의 경로가 멀쩡한가 (내 배포가 남의 코드도 함께 내보낸다)"
for A in getVerses ranking boardList; do
  X=$(call "{\"action\":\"$A\"}")
  chk "$A" "$(jqn 'd.get("ok")' "$X")" "True"
done

echo
echo "통과 $pass · 건너뜀 $skip · 실패 $fail"
[ "$fail" = "0" ]
