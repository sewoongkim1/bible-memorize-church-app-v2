#!/usr/bin/env bash
# 교육신청 동시 신청 — **개발에서만**. 정원 10 강좌에 서로 다른 시험 계정 20개가 동시에 edu_apply → 확정 10 · 대기 10.
#   쓰는 법: WORK=<개발을 link 한 스크래치 폴더> bash tests/edu-concurrency.dev.sh
#   ⚠️ 시험 강좌·계정을 만들고 끝에 지운다(교구 「교육시험」 · 강좌 제목 「동시 신청 시험」).
# 겹침을 진짜로 만드는 법: 한 문장 안에서 edu_apply(강좌 줄을 잠근다) 뒤에 pg_sleep(0.5) 을 붙여 잠금을 쥔 채 기다린다.
#   잠금이 맞으면 호출이 한 줄로 서므로 edu_apply 가 끝난 시각(t_got)이 서로 0.5초 이상 벌어진다 — 그 간격을 잰다.
set -euo pipefail
: "${WORK:?WORK=<개발 link 폴더>}"
q() { supabase --workdir "$WORK" db query --linked "$1" 2>&1; }
USERS=$(q "select count(*) as n from users" | grep -o '"n": [0-9]*' | grep -o '[0-9]*$')
[ "$USERS" -lt 200 ] || { echo "users=$USERS — 운영 같다. 멈춘다"; exit 1; }
TMP=$(mktemp -d)
cleanup() {   # 실패해도 시험 줄을 지운다
  q "delete from edu_enrollments where course_id in (select id from edu_courses where title='동시 신청 시험'); delete from edu_courses where title='동시 신청 시험'; delete from users where identity_key like '교구|교육시험|9|||동시%'" >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT
cleanup; TMP=$(mktemp -d)
CID=$(q "insert into edu_courses(title,kind,capacity,mode,waitlist,status) values('동시 신청 시험','lecture',10,'auto',true,'open') returning id" | grep -o '"id": "[^"]*"' | cut -d'"' -f4 || true)
[ -n "$CID" ] || { echo "강좌를 못 만들었다"; exit 1; }
q "insert into users(identity_key,type,gu,mok,name) select '교구|교육시험|9|||동시'||i,'교구','교육시험','9','동시'||i from generate_series(1,20) i on conflict do nothing" >/dev/null
# ⚠️ supabase CLI 한 번이 DB 연결 하나를 새로 연다 — 20개를 한꺼번에 띄우면 임시 로그인 연결이 거절된다
#    (LegacyDbConfigConnectTempRoleError · 2026-10-05 실측: 20개 동시 → 호출 절반 연결 실패).
#    그래서 동시에 PAR 개(기본 5)씩 띄운다. 연결 오류일 때만 다시 시도하고, 그 밖의 실패는 곧바로 실패로 센다.
PAR=${PAR:-5}
apply() {
  local i=$1 t f="$TMP/r$i.txt"
  for t in 1 2 3 4 5 6 7 8; do
    q "select edu_apply('$CID', (select id from users where identity_key='교구|교육시험|9|||동시$i'), '{\"name\":\"동시$i\"}'::jsonb) as r, clock_timestamp() as t_got, pg_sleep(0.5) as hold" >"$f" || true
    if grep -qE 'ConnectTempRole|Failed to connect' "$f"; then sleep 1; continue; fi
    return 0
  done
}
T0=$(date +%s.%N)
for i in $(seq 1 20); do
  while [ "$(jobs -rp | wc -l)" -ge "$PAR" ]; do sleep 0.2; done
  apply "$i" &
done
wait
T1=$(date +%s.%N)
ELAPSED=$(awk -v a="$T0" -v b="$T1" 'BEGIN{printf "%.1f", b-a}')
FAIL=0
: >"$TMP/times.txt"
for i in $(seq 1 20); do
  if grep -q '"ok": true' "$TMP/r$i.txt"; then
    ts=$(grep -o '"t_got": "[^"]*"' "$TMP/r$i.txt" | cut -d'"' -f4)
    date -d "$ts" +%s.%N >>"$TMP/times.txt" || FAIL=1
  else
    echo "호출 $i 실패:"; head -c 300 "$TMP/r$i.txt"; echo; FAIL=1
  fi
done
GAP=$(sort -n "$TMP/times.txt" | awk 'NR>1{g=$1-p; if(m==""||g<m)m=g} {p=$1} END{printf "%.2f", m+0}')
OUT=$(q "select status, count(*) as n from edu_enrollments where course_id='$CID' group by status order by status")
CONF=$(echo "$OUT" | tr -d '\n ' | grep -o '"n":[0-9]*,"status":"confirmed"' | grep -o '[0-9]*' | head -1 || true)
WAIT=$(echo "$OUT" | tr -d '\n ' | grep -o '"n":[0-9]*,"status":"waitlisted"' | grep -o '[0-9]*' | head -1 || true)
echo "확정 ${CONF:-?} · 대기 ${WAIT:-?} · 실패 $FAIL · 전체 ${ELAPSED}초 · edu_apply 끝난 시각 사이 최소 간격 ${GAP}초(잠금이 맞으면 0.5 이상)"
[ "${CONF:-0}" = "10" ] && [ "${WAIT:-0}" = "10" ] && [ "$FAIL" = "0" ] && awk -v g="$GAP" 'BEGIN{exit !(g>=0.45)}' \
  && echo "통과 — 확정 10 · 대기 10 · 호출이 한 줄로 섰다" || { echo "실패"; exit 1; }
