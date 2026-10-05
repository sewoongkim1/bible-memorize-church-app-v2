#!/usr/bin/env bash
# 교육신청 동시 신청 — **개발에서만**. 정원 10 강좌에 서로 다른 시험 계정 20개가 동시에 edu_apply → 확정 10 · 대기 10.
#   쓰는 법: WORK=<개발을 link 한 스크래치 폴더> bash tests/edu-concurrency.dev.sh
#   ⚠️ 시험 강좌·계정을 만들고 끝에 지운다(교구 「교육시험」 · 강좌 제목 「동시 신청 시험」).
set -euo pipefail
: "${WORK:?WORK=<개발 link 폴더>}"
q() { supabase --workdir "$WORK" db query --linked "$1" 2>&1; }
CID=""
TMP=$(mktemp -d)
cleanup() {   # 실패해도 시험 줄을 지운다
  q "delete from edu_enrollments where course_id in (select id from edu_courses where title='동시 신청 시험'); delete from edu_courses where title='동시 신청 시험'; delete from users where identity_key like '교구|교육시험|9|||동시%'" >/dev/null 2>&1 || true
}
trap cleanup EXIT
USERS=$(q "select count(*) as n from users" | grep -o '"n": [0-9]*' | grep -o '[0-9]*$')
[ "$USERS" -lt 200 ] || { echo "users=$USERS — 운영 같다. 멈춘다"; exit 1; }
cleanup
CID=$(q "insert into edu_courses(title,kind,capacity,mode,waitlist,status) values('동시 신청 시험','lecture',10,'auto',true,'open') returning id" | grep -o '"id": "[^"]*"' | cut -d'"' -f4)
q "insert into users(identity_key,type,gu,mok,name) select '교구|교육시험|9|||동시'||i,'교구','교육시험','9','동시'||i from generate_series(1,20) i on conflict do nothing" >/dev/null
# ⚠️ supabase CLI 한 번이 DB 연결 하나를 새로 연다 — 20개를 한꺼번에 띄우면 임시 로그인 연결이 거절된다(2026-10-05 실측: 20개 동시 → 호출 절반 연결 실패).
#    그래서 동시에 PAR 개(기본 5)씩 띄우고, 연결 실패면 다시 시도한다. 정원 경쟁은 PAR 개가 같은 강좌 줄을 놓고 겨룬다.
PAR=${PAR:-5}
apply() {
  local i=$1 t
  for t in 1 2 3 4 5 6; do
    q "select edu_apply('$CID', (select id from users where identity_key='교구|교육시험|9|||동시$i'), '{\"name\":\"동시$i\"}'::jsonb)" >"$TMP/r$i.txt"
    grep -q '"ok": ' "$TMP/r$i.txt" && return 0
    sleep 1
  done
}
for i in $(seq 1 20); do
  while [ "$(jobs -rp | wc -l)" -ge "$PAR" ]; do sleep 0.2; done
  apply "$i" &
done
wait
for i in $(seq 1 20); do grep -q '"ok": ' "$TMP/r$i.txt" || echo "호출 $i 끝내 실패"; done
OUT=$(q "select status, count(*) as n from edu_enrollments where course_id='$CID' group by status order by status")
echo "$OUT" | grep -E '"status"|"n"'
CONF=$(echo "$OUT" | tr -d '\n ' | grep -o '"n":[0-9]*,"status":"confirmed"' | grep -o '[0-9]*' | head -1 || true)
cleanup
[ "${CONF:-0}" = "10" ] && echo "통과 — 확정 10" || { echo "실패 — 확정 ${CONF:-?}"; exit 1; }
