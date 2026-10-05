#!/usr/bin/env bash
# 교육신청 — 읽기 전용 스모크. 기본은 개발 DB.
#   bash tests/edu-smoke.sh            개발
#   EVT_ENV=prod bash tests/edu-smoke.sh   운영
# ⚠️ 쓰기(신청·취소)는 하지 않는다 — 거절되어야 하는 요청과 읽기만.
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
NONUSER="00000000-0000-0000-0000-000000000000"
echo "1) eduList - 열린다 · user_id 를 싣지 않는다"
L=$(call '{"action":"eduList"}')
chk "ok" "$(jqn 'd.get("ok")' "$L")" "True"
chk "no user_id" "$(jqn '"user_id" not in json.dumps(d) and "ident_key" not in json.dumps(d)' "$L")" "True"
chk "no draft" "$(jqn 'all(c["status"] in ("open","closed","running") for c in d.get("courses",[]))' "$L")" "True"
echo "2) eduApply - 신원·인자"
chk "no-user" "$(jqn 'd.get("error")' "$(call '{"action":"eduApply","id":"x"}')")" "no-user"
chk "bad-args" "$(jqn 'd.get("error")' "$(call "{\"action\":\"eduApply\",\"user_id\":\"$NONUSER\",\"id\":\"x\"}")")" "bad-args"
echo "3) eduCourse - 없는 강좌"
chk "not-found" "$(jqn 'd.get("error")' "$(call "{\"action\":\"eduCourse\",\"id\":\"$NONUSER\"}")")" "not-found"
echo "4) eduCancel - 남의 줄은 없는 줄"
chk "not-found" "$(jqn 'd.get("error")' "$(call "{\"action\":\"eduCancel\",\"user_id\":\"$NONUSER\",\"enrollment_id\":1}")")" "not-found"
echo "5) eduMine - 신원 없으면 거절"
chk "no-user" "$(jqn 'd.get("error")' "$(call '{"action":"eduMine"}')")" "no-user"
echo "6) eduCert(3단계) - 신원·인자 · 남의 줄은 없는 줄"
chk "no-user" "$(jqn 'd.get("error")' "$(call '{"action":"eduCert","enrollment_id":1}')")" "no-user"
chk "bad-args" "$(jqn 'd.get("error")' "$(call "{\"action\":\"eduCert\",\"user_id\":\"$NONUSER\",\"enrollment_id\":\"x\"}")")" "bad-args"
chk "not-found" "$(jqn 'd.get("error")' "$(call "{\"action\":\"eduCert\",\"user_id\":\"$NONUSER\",\"enrollment_id\":1}")")" "not-found"
echo "7) eduVerify(3단계) - 꼴이 틀리면 bad-no · 없는 번호는 valid false 만"
GC="\\uace0\\ucc99"   # JSON 안의 「고척」(백슬래시 u 이스케이프 — 한글 글자를 curl 에 넘기지 않는다)
chk "bad-no" "$(jqn 'd.get("error")' "$(call '{"action":"eduVerify","no":"1999-0001"}')")" "bad-no"
chk "unknown" "$(jqn 'd' "$(call "{\"action\":\"eduVerify\",\"no\":\"$GC-1999-0001\"}")")" "{'ok': True, 'valid': False}"

echo
echo "통과 $pass · 실패 $fail · 건너뜀 $skip"
[ "$fail" = "0" ]
