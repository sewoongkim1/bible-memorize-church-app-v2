#!/usr/bin/env bash
# 열람 기록(featureLog) — 읽기/쓰기 스모크. 기본은 개발 DB.
#   DEV_ANON=... bash tests/feature-log-smoke.sh
#   FL_ENV=prod PROD_ANON=... bash tests/feature-log-smoke.sh
#   (공개 키는 js/config.js 의 DEV.ANON · PROD.ANON)
#   보내기 · 게시판 이용 읽기(featureUsage · 2026-11-06): 비번 없이 · 틀린 비번 · (ADMIN_PW 를 주면) 암호만으로는 닫혀 있는지 늘 본다.
#   꼴(칸 · user_id 없음 · 어린이 줄 없음)은 **개발에서만** 교회 어드민과 같은 내부 키 길로 본다 — 키는 SERVICE_KEY,
#   없으면 ~/.church-admin/dev.env 의 DEV_SERVICE_KEY(찍지 않는다 · 빈 기간으로 한 번 불러 맞는 키인지 본다 · 안 맞으면 그 칸만 건너뜀).
#   운영에서는 이름 목록을 받지 않는다(꼴 칸은 늘 건너뜀).
#
# ⚠️ 실제로 행이 쌓였는지는 여기서 못 본다(RLS 로 공개 키가 못 읽는다 — 그게 맞다).
#    행 확인은 SQL Editor 에서 한다. 여기서 보는 것은 **액션이 무엇을 돌려주는가** 다.
set -u
if [ "${FL_ENV:-dev}" = "prod" ]; then
  BASE="https://xnomlgydifiqiybervtf.supabase.co/functions/v1/api"
  KEY="${PROD_ANON:?PROD_ANON 환경변수가 필요합니다}"
else
  BASE="https://ktpwthwqzgcqcrmsafdo.supabase.co/functions/v1/api"
  KEY="${DEV_ANON:?DEV_ANON 환경변수가 필요합니다}"
fi

CALL_TMP=$(mktemp)
trap 'rm -f "$CALL_TMP"' EXIT

# ⚠️ 명령줄 리터럴 한글은 (특히 Git Bash/Windows 에서) 깨져서 서버에 도착한다 —
# 이걸 모르면 서버가 허용 목록에 있는 값을 거부하는 것처럼 보여 서버 버그로 오해하게 된다.
# 그래서 body 는 UTF-8 파일로 써서 보낸다.
call() {
  printf '%s' "$1" > "$CALL_TMP"
  curl -s -X POST "$BASE" -H "Content-Type: application/json" \
    -H "apikey: $KEY" -H "Authorization: Bearer $KEY" --data-binary @"$CALL_TMP"
}
# 내부 갈래(교회 어드민이 부르는 길) — $1 = x-internal-key 값 · $2 = 본문. 키는 찍지 않는다.
icall() {
  printf '%s' "$2" > "$CALL_TMP"
  curl -s -X POST "$BASE" -H "Content-Type: application/json" -H "x-internal-key: $1" --data-binary @"$CALL_TMP"
}
# 응답 JSON 에 파이썬 식 하나 — 한글은 \u 로 적는다(명령줄 한글은 깨진다)
jqn() {
  PYTHONIOENCODING=utf-8 python -c '
import json, sys
d = json.load(sys.stdin)
print(eval(sys.argv[1]))
' "$1" <<< "$2"
}

pass=0; fail=0; skip=0
sk() { echo "  - $1 ... 건너뜀 ($2)"; skip=$((skip+1)); }
chk() { # 이름, 실제, 기대
  if [ "$2" = "$3" ]; then echo "  ✓ $1 = $2"; pass=$((pass+1));
  else echo "  ✗ $1 = $2  (기대 $3)"; fail=$((fail+1)); fi
}

echo "■ 시험용 계정을 하나 만든다(개발 DB — login 은 모르는 이름이면 계정을 만들어 준다)"
UID_JSON=$(call '{"action":"login","type":"교구","gu":"계측","mok":"계측","name":"계측시험"}')
# TEST_UID를 쓰는 이유: UID는 bash 기본 환경변수(OS user id)라 할당이 무시된다
TEST_UID=$(echo "$UID_JSON" | grep -o '"user_id":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -z "$TEST_UID" ]; then
  TEST_UID=$(echo "$UID_JSON" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
fi
if [ -z "$TEST_UID" ]; then echo "  ✗ 시험 계정을 못 만들었다: $UID_JSON"; exit 1; fi
echo "  · user_id = ${TEST_UID:0:8}…"

echo "■ 올바른 기록은 ok"
# ⚠️ 여기 목록은 index.ts 의 FEATURES **전부**여야 한다. 일곱만 돌리던 때 다른 세션이 더한
#    event 가 빠진 줄 몰랐다 — 빠진 값은 「거부되는지」도 「통과하는지」도 시험되지 않는다.
#    FEATURES 를 늘리면 이 줄도 그 자리에서 함께 늘린다(통과 개수는 pass 가 세므로 손댈 것 없다).
# ⚠️ song 은 일부러 없다 — FEATURES 를 거치지 않고 서버가 직접 v2_feature_log 를 부르는 값이라
#    여기로 보내면 skipped 가 맞다(오류가 아니다). 그 경로는 오늘의 찬양 액션으로 시험한다.
#    2026-10-13 — edu·duty 가 빠져 있던 것을 채우고 navi(네비게이토)를 더했다.
#    2026-11-06 — 보내기 · 게시판 다섯 값(board · share-*)을 더했다. 보내기 값의 item 은 종류 코드(1~9)라 3(이번 주 말씀)으로 보낸다 —
#    0 으로 보내면 교회 어드민 탭에 「종류 0」으로 뜬다. 다섯 값은 어른 계정이면 어린 부서 거르기(skipped guardian…)에 안 걸려야 한다.
for F in psalm meditation meditation-widget meditation-auto album album-play guide push ranking-scope event edu duty navi board share-open share-kakao share-sheet share-save; do
  I=0; case "$F" in share-*) I=3 ;; esac
  U="$TEST_UID"
  #    운영에서는 다섯 값을 시험 계정 이름으로 남기지 않는다(교회 어드민 「📤 보내기 · 💬 게시판」 탭에 「계측시험」이 뜨지 않게 · 2026-11-06) —
  #    없는 계정(0 uuid)으로 보내 새 관문이 받는지만 본다: 다섯 값이 FEATURES 에 있으면 users 를 못 찾아 skipped "guardian-check" · 옛 판이면 skipped true.
  if [ "${FL_ENV:-dev}" = "prod" ]; then case "$F" in board|share-*) U="00000000-0000-0000-0000-000000000000" ;; esac; fi
  R=$(call "{\"action\":\"featureLog\",\"user_id\":\"$U\",\"feature\":\"$F\",\"item\":$I}")
  chk "$F" "$(echo "$R" | grep -o '"ok":true')" '"ok":true'
  case "$F" in board|share-*)
    if [ "$U" = "$TEST_UID" ]; then chk "$F 어른은 거르지 않음" "$(echo "$R" | grep -c '"skipped":"guardian')" "0"
    else chk "$F 새 관문(운영 · 쓰지 않음)" "$(echo "$R" | grep -o '"skipped":"guardian-check"')" '"skipped":"guardian-check"'; fi ;;
  esac
done

echo "■ 같은 것을 두 번 보내도 ok (표에서는 cnt 만 오른다)"
R=$(call "{\"action\":\"featureLog\",\"user_id\":\"$TEST_UID\",\"feature\":\"psalm\",\"item\":1042}")
chk "psalm 재호출" "$(echo "$R" | grep -o '"ok":true')" '"ok":true'

echo "■ 모르는 feature 는 조용히 버린다(오류가 아니다)"
R=$(call "{\"action\":\"featureLog\",\"user_id\":\"$TEST_UID\",\"feature\":\"몰라\",\"item\":0}")
chk "모르는 feature ok"      "$(echo "$R" | grep -o '"ok":true')"    '"ok":true'
chk "모르는 feature skipped" "$(echo "$R" | grep -o '"skipped"')"    '"skipped"'

echo "■ user_id 가 없으면 조용히 버린다"
R=$(call '{"action":"featureLog","feature":"psalm","item":1}')
chk "user_id 없음 ok"      "$(echo "$R" | grep -o '"ok":true')" '"ok":true'
chk "user_id 없음 skipped" "$(echo "$R" | grep -o '"skipped"')" '"skipped"'

echo "■ 응답에 user_id 가 실리면 안 된다(이 API 에는 JWT 가 없다)"
R=$(call "{\"action\":\"featureLog\",\"user_id\":\"$TEST_UID\",\"feature\":\"psalm\",\"item\":7}")
chk "응답에 user_id 없음" "$(echo "$R" | grep -c 'user_id')" "0"

echo "■ 다섯 값 — 만 14세 미만 어린 부서 계정은 남기지 않는다(앱도 안 보내지만 서버가 한 번 더 막는다)"
if [ "${FL_ENV:-dev}" = "prod" ]; then
  sk "어린 부서 거르기" "운영에는 어린이 시험 계정을 만들지 않는다 — 개발에서 본다"
else
  KID_JSON=$(call '{"action":"login","type":"교회학교","bu":"초등부","grade":"3학년","name":"계측어린이"}')
  KID_UID=$(echo "$KID_JSON" | grep -o '"user_id":"[^"]*"' | head -1 | cut -d'"' -f4)
  [ -z "$KID_UID" ] && KID_UID=$(echo "$KID_JSON" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  if [ -z "$KID_UID" ]; then
    echo "  ✗ 어린이 시험 계정을 못 만들었다: $KID_JSON"; fail=$((fail+1))
  else
    for G in board share-open share-kakao share-sheet share-save; do
      R=$(call "{\"action\":\"featureLog\",\"user_id\":\"$KID_UID\",\"feature\":\"$G\",\"item\":1}")
      chk "어린이 $G" "$(echo "$R" | grep -o '"skipped":"guardian"')" '"skipped":"guardian"'
    done
    R=$(call "{\"action\":\"featureLog\",\"user_id\":\"$KID_UID\",\"feature\":\"psalm\",\"item\":1001}")
    chk "어린이 psalm 은 지금 그대로(다섯 값만 거른다)" "$(echo "$R" | grep -c '"skipped":"guardian')" "0"
  fi
fi

echo "■ featureUsage(보내기 · 게시판 이용 — 관리자 전용 · 이름이 나온다)는 문이 닫혀 있다"
R=$(call '{"action":"featureUsage"}')
chk "비번 없이 → 닫힘" "$(echo "$R" | grep -c -E '"error":"(unauthorized|no-password-set)"')" "1"
chk "비번 없이 → 명단 없음" "$(echo "$R" | grep -c '"byUser"')" "0"
R=$(call '{"action":"featureUsage","pw":"definitely-wrong"}')
chk "틀린 비번 → 닫힘" "$(echo "$R" | grep -c -E '"error":"(unauthorized|no-password-set)"')" "1"
if [ -n "${ADMIN_PW:-}" ]; then
  # 비번은 파일로 넘겨 명령줄(ps)·화면에 남기지 않는다 · 암호가 맞아도 총괄 본인 확인(staff)이 없으면 닫혀야 한다(_shared.ts adminError)
  #   ⚠️ 암호가 틀려도 같은 답이라, 이 줄이 보는 것은 「featureUsage 가 암호 길(ADMIN_PW_ONLY)에 안 들었다」뿐이다.
  PYTHONIOENCODING=utf-8 python -c 'import json,os;print(json.dumps({"action":"featureUsage","pw":os.environ["ADMIN_PW"]}))' > "$CALL_TMP"
  R=$(curl -s -X POST "$BASE" -H "Content-Type: application/json" -H "apikey: $KEY" -H "Authorization: Bearer $KEY" --data-binary @"$CALL_TMP")
  chk "암호만(총괄 확인 없이) → unauthorized" "$(echo "$R" | grep -o '"error":"unauthorized"')" '"error":"unauthorized"'
else
  sk "암호만으로는 닫힘" "ADMIN_PW 환경변수가 없습니다"
fi

echo "■ (개발 · 내부 키) featureUsage 꼴 — 교회 어드민이 부르는 길 · 응답에 user_id 없음 · 어린이 줄 없음"
if [ "${FL_ENV:-dev}" = "prod" ]; then
  sk "featureUsage 꼴" "운영에서는 이름 목록을 받지 않는다 — 개발에서 본다"
else
  SK="${SERVICE_KEY:-}"
  if [ -z "$SK" ] && [ -f "$HOME/.church-admin/dev.env" ]; then
    SK=$(set -a; . "$HOME/.church-admin/dev.env" >/dev/null 2>&1; printf '%s' "${DEV_SERVICE_KEY:-}")
  fi
  PROBE=0
  [ -n "$SK" ] && PROBE=$(icall "$SK" '{"action":"featureUsage","from":"2000-01-01","to":"2000-01-01"}' | grep -c '"ok":true')
  if [ "$PROBE" != "1" ]; then
    sk "featureUsage 꼴" "맞는 서비스 키가 없다(SERVICE_KEY · ~/.church-admin/dev.env DEV_SERVICE_KEY — 키는 찍지 않는다)"
  else
    R=$(icall "$SK" '{"action":"featureUsage"}')
    chk "ok" "$(jqn 'd.get("ok")' "$R")" "True"
    chk "칸 넷" "$(jqn 'sorted(d.keys())' "$R")" "['byKind', 'byUser', 'ok', 'summary']"
    chk "summary 꼴" "$(jqn 'sorted(d["summary"]) == ["board", "share"] and all(sorted(d["summary"][k]) == ["count", "people"] for k in d["summary"])' "$R")" "True"
    chk "byKind 칸" "$(jqn 'all(sorted(k) == ["item", "kakao", "label", "open", "people", "save", "sheet"] for k in d["byKind"])' "$R")" "True"
    chk "byUser 칸" "$(jqn 'all(sorted(u) == ["boardCount", "boardDays", "gubun", "kakao", "last", "name", "open", "save", "sebu", "sheet", "sosok"] for u in d["byUser"])' "$R")" "True"
    chk "응답에 user_id 없음" "$(echo "$R" | grep -c 'user_id')" "0"
    chk "응답에 uuid 꼴 없음" "$(echo "$R" | grep -c -E '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}')" "0"
    chk "계측시험 — 게시판 · 카톡 줄" "$(jqn 'any(u["name"] == "\uacc4\uce21\uc2dc\ud5d8" and u["boardCount"] >= 1 and u["kakao"] >= 1 for u in d["byUser"])' "$R")" "True"
    chk "계측어린이는 없다" "$(jqn 'any(u["name"] == "\uacc4\uce21\uc5b4\ub9b0\uc774" for u in d["byUser"])' "$R")" "False"
    chk "종류 3 이름" "$(jqn '[k["label"] for k in d["byKind"] if k["item"] == 3] == ["\uc774\ubc88 \uc8fc \ub9d0\uc500"]' "$R")" "True"
  fi
fi

echo ""
echo "통과 $pass · 실패 $fail · 건너뜀 $skip"
[ "$fail" -eq 0 ]
