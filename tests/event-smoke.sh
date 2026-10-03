#!/usr/bin/env bash
# 이벤트 플랫폼 — 읽기 전용 스모크. 기본은 개발 DB.
#   bash tests/event-smoke.sh                                개발
#   EVT_ENV=prod bash tests/event-smoke.sh                   운영
# 관리자 액션까지 보려면(비번을 아는 사람만):
#   ADMIN_PW=... bash tests/event-smoke.sh
# 가을 회차 perDay 값까지 보려면(6-2 · 운영 자료 SQL 뒤):
#   EVT_ENV=prod EXPECT_PER_DAY=3 bash tests/event-smoke.sh
#   ⚠️ EVT_ENV=prod 를 빼면 개발을 본다 — 개발은 이미 3 이라 운영이 1 로 돌아가 있어도 통과한다.
# 「자동 대상」(needs.auto) 거절·빈 명단까지 보려면(6-3 · 자료 SQL supabase/event_autumn_2026_auto.sql 뒤):
#   EXPECT_AUTO=1 bash tests/event-smoke.sh
#   시험 회차까지(시험 참여자 계정의 user_id — 저장소에 적지 않는다):
#   EXPECT_AUTO=1 TESTER_UID=<시험 참여자 user_id> bash tests/event-smoke.sh
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

echo "4-1) eventStamps - 신원·인자를 지킨다"
P1=$(call '{"action":"eventStamps"}')
chk "no-user 거부" "$(jqn 'd.get("error")' "$P1")" "no-user"
P2=$(call '{"action":"eventStamps","user_id":"00000000-0000-0000-0000-000000000000"}')
chk "bad-args 거부" "$(jqn 'd.get("error")' "$P2")" "bad-args"
P3=$(call '{"action":"eventStamps","user_id":"00000000-0000-0000-0000-000000000000","event_id":"definitely-not-a-real-event"}')
chk "not-found 거부" "$(jqn 'd.get("error")' "$P3")" "not-found"
chk "user_id 를 싣지 않는다" "$(jqn '"user_id" not in json.dumps(d)' "$P3")" "True"

echo "4-2) eventSignup - 클라이언트가 보낸 answers 는 저장되지 않는다"
# 되돌이 방지용이다. 값이 날짜에 달려 있어 「실패 먼저」로 쓸 수 없다 —
# 자격 판정의 정확한 값은 개발 DB 에서 Task 7 Step 5~6 으로 확인한다.
G=$(call '{"action":"eventSignup","user_id":"00000000-0000-0000-0000-000000000000","event_id":"autumn-2026","answers":{"weeks":[9,9,9,9,9,9]}}')
chk "ok=false" "$(jqn 'd.get("ok")' "$G")" "False"
chk "지어낸 weeks 가 응답에 없다" "$(jqn '"[9, 9, 9, 9, 9, 9]" not in json.dumps(d)' "$G")" "True"
# auto-event 는 「자동 대상」 회차(2026-10-03 · 설계 §9)가 성도님 신청을 거절하는 슬러그다.
chk "거절 슬러그가 아는 것 중 하나" "$(jqn 'd.get("error") in ("not-found","not-eligible","not-yet","closed-period","not-open","auto-event")' "$G")" "True"
chk "user_id 를 싣지 않는다" "$(jqn '"user_id" not in json.dumps(d)' "$G")" "True"

echo "5) 관리자 액션은 비번 없이 열리지 않는다"
R=$(call '{"action":"eventRoster"}')
chk "eventRoster 거부" "$(jqn 'd.get("error") in ("unauthorized","no-password-set")' "$R")" "True"
V=$(call '{"action":"eventSave","event":{"id":"x","title":"x","opens_on":"2026-01-01","closes_on":"2026-01-02"}}')
chk "eventSave 거부" "$(jqn 'd.get("error") in ("unauthorized","no-password-set")' "$V")" "True"
N1=$(call '{"action":"eventSetNote","id":1,"note":"x"}')
chk "eventSetNote 거부" "$(jqn 'd.get("error") in ("unauthorized","no-password-set")' "$N1")" "True"
N2=$(call '{"action":"eventExcuse","id":1,"excused":true}')
chk "eventExcuse 거부" "$(jqn 'd.get("error") in ("unauthorized","no-password-set")' "$N2")" "True"

echo "5-1) 교회 어드민으로 옮긴 쓰기 셋은 비밀번호가 맞아도 막힌다(eventRoster·eventExcuse 는 남긴다)"
# ⚠️ eventSave·eventSetNote·eventImport 는 교회 어드민(admin.onlybible.kr 「성경필사(암송)」)으로 옮겨 얼렸다.
#    비밀번호 확인 **바로 뒤**에서 moved-to-church-admin 을 돌려준다 — 비밀번호 없는 호출은 위 5) 처럼 그대로 unauthorized.
#    설계 docs/superpowers/specs/2026-09-29-church-admin-bible-events-design.md §4 · docs/notes/bible-events-admin.md
# 얼리기 전에 돌려도 아무것도 쓰지 않는 입력만 던진다 — eventSave 는 모양이 틀린 id(bad-event-id) ·
#   eventSetNote 는 id 0(bad-args) · eventImport 는 없는 회차(not-found — 줄을 지우기 전에 멈춘다).
if [ -z "${ADMIN_PW:-}" ]; then
  sk "eventSave·eventSetNote·eventImport 얼림" "ADMIN_PW 환경변수가 없습니다"
else
  F1=$(call "{\"action\":\"eventSave\",\"pw\":\"$ADMIN_PW\",\"event\":{\"id\":\"x\",\"title\":\"x\",\"opens_on\":\"2026-01-01\",\"closes_on\":\"2026-01-02\"}}")
  chk "eventSave 얼림" "$(jqn 'd.get("error")' "$F1")" "moved-to-church-admin"
  F2=$(call "{\"action\":\"eventSetNote\",\"pw\":\"$ADMIN_PW\",\"id\":0,\"note\":\"x\"}")
  chk "eventSetNote 얼림" "$(jqn 'd.get("error")' "$F2")" "moved-to-church-admin"
  F3=$(call "{\"action\":\"eventImport\",\"pw\":\"$ADMIN_PW\",\"event_id\":\"definitely-not-a-real-event\",\"rows\":[]}")
  chk "eventImport 얼림" "$(jqn 'd.get("error")' "$F3")" "moved-to-church-admin"
fi

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
  chk "missing 이 배열" "$(jqn 'isinstance(d.get("missing"), list)' "$RA")" "True"
  chk "missing 에도 user_id 가 없다" "$(jqn 'all("user_id" not in m for m in d.get("missing", []))' "$RA")" "True"
fi

echo "6-1) 시험 회차(autumn-2026-test) — 비테스터에게는 없는 회차와 같다(2026-10-03)"
# 영(0) uuid 는 users 에 없는 계정이라 시험 참여자 명단에도 없다 — 곧 「비테스터」다.
NONTESTER_UID="00000000-0000-0000-0000-000000000000"
LT=$(call "{\"action\":\"eventOpenList\",\"user_id\":\"$NONTESTER_UID\"}")
# ⚠️ ok 를 먼저 본다 — 오류 응답이면 events 가 없어 아래 「없다」가 빈 목록으로 그냥 통과한다.
chk "ok" "$(jqn 'd.get("ok")' "$LT")" "True"
chk "목록에 시험 회차가 없다" "$(jqn 'all(e["id"] != "autumn-2026-test" for e in d.get("events", []))' "$LT")" "True"

ST=$(call "{\"action\":\"eventStamps\",\"user_id\":\"$NONTESTER_UID\",\"event_id\":\"autumn-2026-test\"}")
chk "eventStamps not-found" "$(jqn 'd.get("error")' "$ST")" "not-found"

SG=$(call "{\"action\":\"eventSignup\",\"user_id\":\"$NONTESTER_UID\",\"event_id\":\"autumn-2026-test\"}")
chk "eventSignup not-found" "$(jqn 'd.get("error")' "$SG")" "not-found"

RP=$(call "{\"action\":\"eventRosterPublic\",\"event_id\":\"autumn-2026-test\",\"user_id\":\"$NONTESTER_UID\"}")
chk "eventRosterPublic not-found" "$(jqn 'd.get("error")' "$RP")" "not-found"

echo "6-2) 배포 확인 — eventStamps(autumn-2026) 가 perDay·todayCount 를 싣는가(읽기만)"
# 운영 반영 단계마다 이 절로 「새 api 가 나갔는가」를 본다:
#   ① 구조 SQL 뒤 ok · ② api 뒤 rule.perDay·todayCount 키 · ④ 자료 SQL 뒤 EXPECT_PER_DAY=3 으로 값까지.
# 영 uuid 는 활동이 없는 계정이라 읽기만 한다(도장 계산은 v2_event_weeks·v2_mydays 조회뿐 — 아무것도 안 쓴다).
# todayCount 는 값이 아니라 **키가 있는지**만 본다(통신이 끊긴 날은 null 이 맞다 — 「모른다」).
PS=$(call "{\"action\":\"eventStamps\",\"user_id\":\"$NONTESTER_UID\",\"event_id\":\"autumn-2026\"}")
chk "ok" "$(jqn 'd.get("ok")' "$PS")" "True"
chk "rule.perDay 가 있다" "$(jqn 'isinstance((d.get("rule") or {}).get("perDay"), int)' "$PS")" "True"
chk "todayCount 키가 있다" "$(jqn '"todayCount" in d' "$PS")" "True"
chk "user_id 를 싣지 않는다" "$(jqn '"user_id" not in json.dumps(d)' "$PS")" "True"
if [ -n "${EXPECT_PER_DAY:-}" ]; then
  chk "rule.perDay == $EXPECT_PER_DAY" "$(jqn '(d.get("rule") or {}).get("perDay")' "$PS")" "$EXPECT_PER_DAY"
else
  sk "rule.perDay 값" "EXPECT_PER_DAY 환경변수가 없습니다(운영 자료 SQL 뒤에는 EVT_ENV=prod EXPECT_PER_DAY=3)"
fi

echo "6-3) 자동 대상(needs.auto) - 신청도 공개 명단도 없다(2026-10-03 · 설계 §9 · 읽기·거절만)"
# ⚠️ 쓰기는 하지 않는다 — 거절되어야 하는 요청과 읽기만 던진다.
# 진짜 회차(autumn-2026)는 draft 라 성도님께 목록·명단이 안 보인다(not-found). 그래도 eventSignup 은
#   「시험 회차 비테스터 not-found」 다음·기간 검사 **앞**에서 auto-event 로 거절하므로 성도님 갈래(비번 없음)로 볼 수 있다.
#   명단(eventRosterPublic)의 빈 명단은 draft 라 성도님 갈래로 못 부른다 — 시험 회차(시험 참여자 계정)로 본다.
# eventDrop 은 그 계정의 신청 줄이 있어야 auto-event 까지 닿는다(없으면 not-found 가 먼저) — 줄을 만들면 쓰기라 여기서는 안 본다.
# 「등록」은 \uB4F1\uB85D 로 적는다(본문에 한글 금지 — 맨 위 주석).
if [ -z "${EXPECT_AUTO:-}" ]; then
  sk "자동 대상 거절·빈 명단" "EXPECT_AUTO 환경변수가 없습니다(자료 SQL 뒤에는 EXPECT_AUTO=1)"
else
  A1=$(call "{\"action\":\"eventSignup\",\"user_id\":\"$NONTESTER_UID\",\"event_id\":\"autumn-2026\"}")
  chk "autumn-2026 eventSignup auto-event (draft 여도 성도님 갈래)" "$(jqn 'd.get("error")' "$A1")" "auto-event"
  A2=$(call "{\"action\":\"eventRosterPublic\",\"event_id\":\"autumn-2026\",\"user_id\":\"$NONTESTER_UID\"}")
  chk "autumn-2026 eventRosterPublic not-found (draft 라 그대로)" "$(jqn 'd.get("error")' "$A2")" "not-found"
  # 비테스터에게 시험 회차는 여전히 없는 회차다 — auto-event 로 「있다」가 새지 않는다(6-1 과 같은 답)
  A3=$(call "{\"action\":\"eventSignup\",\"user_id\":\"$NONTESTER_UID\",\"event_id\":\"autumn-2026-test\"}")
  chk "비테스터 시험 회차 eventSignup 은 여전히 not-found" "$(jqn 'd.get("error")' "$A3")" "not-found"
  A4=$(call "{\"action\":\"eventRosterPublic\",\"event_id\":\"autumn-2026-test\",\"user_id\":\"$NONTESTER_UID\"}")
  chk "비테스터 시험 회차 eventRosterPublic 은 여전히 not-found" "$(jqn 'd.get("error")' "$A4")" "not-found"
  # 로그인 없는 목록에 자동 대상 회차가 있으면 신청이 열려 있으면 안 된다(개시 뒤 운영에서 뜻이 있다)
  A5=$(call '{"action":"eventOpenList"}')
  chk "목록의 자동 대상 회차는 모두 canSignup false" "$(jqn 'all(not e["canSignup"] for e in d.get("events", []) if (e.get("needs") or {}).get("auto") is True)' "$A5")" "True"
  # 관리자 암호 갈래도 막는다(2026-10-04) — 영 uuid 라 막히지 않은 옛 판에서도 users 에 없어 no-user 로 끝난다(쓰기 없음).
  if [ -n "${ADMIN_PW:-}" ]; then
    A6=$(call "{\"action\":\"eventSignup\",\"pw\":\"$ADMIN_PW\",\"user_id\":\"$NONTESTER_UID\",\"event_id\":\"autumn-2026\"}")
    chk "관리자 갈래도 autumn-2026 eventSignup auto-event" "$(jqn 'd.get("error")' "$A6")" "auto-event"
  else
    sk "관리자 갈래 자동 대상 거절" "ADMIN_PW 환경변수가 없습니다"
  fi

  if [ -z "${TESTER_UID:-}" ]; then
    sk "시험 회차(시험 참여자) - 목록·거절·빈 명단·도장" "TESTER_UID 환경변수가 없습니다"
  else
    TL=$(call "{\"action\":\"eventOpenList\",\"user_id\":\"$TESTER_UID\"}")
    chk "ok" "$(jqn 'd.get("ok")' "$TL")" "True"
    chk "시험 회차가 목록에 있다" "$(jqn 'any(e["id"] == "autumn-2026-test" for e in d.get("events", []))' "$TL")" "True"
    chk "시험 회차 needs.auto = true" "$(jqn '[e for e in d.get("events", []) if e["id"] == "autumn-2026-test"][0]["needs"].get("auto")' "$TL")" "True"
    chk "시험 회차 canSignup false" "$(jqn '[e for e in d.get("events", []) if e["id"] == "autumn-2026-test"][0]["canSignup"]' "$TL")" "False"
    chk "시험 회차 verb 가 등록이 아니다" "$(jqn '[e for e in d.get("events", []) if e["id"] == "autumn-2026-test"][0]["verb"] != "\uB4F1\uB85D"' "$TL")" "True"
    chk "user_id 를 싣지 않는다" "$(jqn '"user_id" not in json.dumps(d)' "$TL")" "True"
    TG=$(call "{\"action\":\"eventSignup\",\"user_id\":\"$TESTER_UID\",\"event_id\":\"autumn-2026-test\"}")
    chk "시험 참여자 eventSignup auto-event" "$(jqn 'd.get("error")' "$TG")" "auto-event"
    TR=$(call "{\"action\":\"eventRosterPublic\",\"event_id\":\"autumn-2026-test\",\"user_id\":\"$TESTER_UID\"}")
    chk "시험 참여자 eventRosterPublic ok" "$(jqn 'd.get("ok")' "$TR")" "True"
    chk "빈 명단 total 0" "$(jqn 'd.get("total")' "$TR")" "0"
    chk "빈 명단 groups []" "$(jqn 'd.get("groups")' "$TR")" "[]"
    chk "명단에 user_id 를 싣지 않는다" "$(jqn '"user_id" not in json.dumps(d)' "$TR")" "True"
    TP=$(call "{\"action\":\"eventStamps\",\"user_id\":\"$TESTER_UID\",\"event_id\":\"autumn-2026-test\"}")
    chk "eventStamps 는 그대로(ok · rule · eligible 키)" "$(jqn 'd.get("ok") is True and isinstance(d.get("rule"), dict) and "eligible" in d' "$TP")" "True"
  fi
fi

echo "7) 남의 경로가 멀쩡한가 (내 배포가 남의 코드도 함께 내보낸다)"
for A in getVerses ranking boardList; do
  X=$(call "{\"action\":\"$A\"}")
  chk "$A" "$(jqn 'd.get("ok")' "$X")" "True"
done

echo
echo "통과 $pass · 건너뜀 $skip · 실패 $fail"
[ "$fail" = "0" ]
