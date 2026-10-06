#!/usr/bin/env bash
# 봉사 당번 동시 시험 — **개발에서만**. 설계 docs/superpowers/specs/2026-10-06-duty-roster-design.md §12.
#   ① 정원 2 자리에 서로 다른 시험 계정 N(기본 20)개가 동시에 duty_apply → 살아 있는 줄 꼭 2 · 나머지 full
#   ② 같은 계정이 **서로 다른 당번**의 시각이 겹치는 두 자리에 동시에 → 꼭 하나만(사람×날짜 잠금 — 날짜 줄이 달라 그것만으로는 안 선다)
#   ③ 확정과 본인 취소가 겹칠 때 — 확정이 먼저면 취소는 locked · 취소가 먼저면 확정 알림 대상에 그 줄이 없다
#   쓰는 법: WORK=<개발을 link 한 스크래치 폴더> [SUPA=supabase.cmd] bash tests/duty-concurrency.dev.sh
#   ⚠️ 시험 당번·계정을 만들고 끝에 지운다(당번 제목 duty-conc-% · 계정 열쇠 gu|dutyconc|…). 명령줄 SQL 에는 한글을 쓰지 않는다(윈도 셸이 깨뜨린다).
# 겹침을 진짜로 만드는 법: 한 문장 안에서 함수 뒤에 pg_sleep(HOLD초) 을 붙여 잠금을 쥔 채 기다린다(교육 edu-concurrency.dev.sh 와 같다).
set -euo pipefail
: "${WORK:?WORK=<개발 link 폴더>}"
SUPA=${SUPA:-supabase}
q() { "$SUPA" --workdir "$WORK" db query --linked "$1" 2>&1; }
USERS=$(q "select count(*) as n from users" | grep -o '"n": [0-9]*' | grep -o '[0-9]*$')
[ "$USERS" -lt 200 ] || { echo "users=$USERS — 운영 같다. 멈춘다"; exit 1; }
N=${N:-20}
PAR=${PAR:-5}     # CLI 한 번이 DB 연결 하나 — 한꺼번에 많이 띄우면 임시 로그인 연결이 거절된다
HOLD=${HOLD:-3}   # 잠금을 쥐고 기다리는 초
TMP=$(mktemp -d)
cleanup() {
  q "delete from duty_signups where slot_id in (select s.id from duty_slots s join duty_boards b on b.id=s.board_id where b.title like 'duty-conc-%');
     delete from duty_slots where board_id in (select id from duty_boards where title like 'duty-conc-%');
     delete from duty_days where board_id in (select id from duty_boards where title like 'duty-conc-%');
     delete from duty_lines where board_id in (select id from duty_boards where title like 'duty-conc-%');
     delete from duty_boards where title like 'duty-conc-%';
     delete from users where identity_key like 'gu|dutyconc|%'" >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT
cleanup; TMP=$(mktemp -d)
val() { grep -o "\"$1\": \"[^\"]*\"" "$2" | head -1 | cut -d'"' -f4 || true; }

# 준비 — 당번 둘(a · b) · 요일 없는 틀 · 날짜는 오늘+5(잠기지 않은 날) · 오늘+12
#   users.type 은 CHECK(교구·교회학교)라 한글이 필요하다 — 명령줄에 한글을 안 쓰려고 chr() 로 적는다(chr(44368)||chr(44396) = 교구)
q "insert into users(identity_key,type,gu,mok,name) select 'gu|dutyconc|9|||conc'||i, chr(44368)||chr(44396), 'dutyconc','9','conc'||i from generate_series(1,$N) i on conflict do nothing" >/dev/null
SETUP=$(q "with a as (insert into duty_boards(title,status) values('duty-conc-a','open') returning id),
  b as (insert into duty_boards(title,status) values('duty-conc-b','open') returning id),
  la as (insert into duty_lines(board_id,service,task,start_time,end_time,capacity) select id,'s1','t','09:00','10:00',2 from a returning id, board_id),
  lb as (insert into duty_lines(board_id,service,task,start_time,end_time,capacity) select id,'s1','t','09:30','10:30',2 from b returning id, board_id)
  select (select id from a)::text as ba, (select id from b)::text as bb, (select id from la)::text as la, (select id from lb)::text as lb")
BA=$(echo "$SETUP" | grep -o '"ba": "[^"]*"' | cut -d'"' -f4); BB=$(echo "$SETUP" | grep -o '"bb": "[^"]*"' | cut -d'"' -f4)
LA=$(echo "$SETUP" | grep -o '"la": "[^"]*"' | cut -d'"' -f4); LB=$(echo "$SETUP" | grep -o '"lb": "[^"]*"' | cut -d'"' -f4)
[ -n "$BA" ] && [ -n "$BB" ] && [ -n "$LA" ] && [ -n "$LB" ] || { echo "준비 실패: $SETUP"; exit 1; }
q "select duty_date_add('$BA', duty_today()+5, array[$LA]::bigint[]), duty_date_add('$BB', duty_today()+5, array[$LB]::bigint[]),
          duty_date_add('$BA', duty_today()+12, array[$LA]::bigint[])" >/dev/null
SLOTS=$(q "select (select id from duty_slots where line_id=$LA and on_date=duty_today()+5)::text as sa, (select id from duty_slots where line_id=$LB and on_date=duty_today()+5)::text as sb,
                  (select id from duty_slots where line_id=$LA and on_date=duty_today()+12)::text as sc")
SA=$(echo "$SLOTS" | grep -o '"sa": "[^"]*"' | cut -d'"' -f4); SB=$(echo "$SLOTS" | grep -o '"sb": "[^"]*"' | cut -d'"' -f4); SC=$(echo "$SLOTS" | grep -o '"sc": "[^"]*"' | cut -d'"' -f4)
[ -n "$SA" ] && [ -n "$SB" ] && [ -n "$SC" ] || { echo "자리 없음: $SLOTS"; exit 1; }
uid() { echo "(select id from users where identity_key='gu|dutyconc|9|||conc$1')"; }
run() {   # run <파일> <SQL> — 연결 오류일 때만 다시
  local f=$1 sql=$2 t
  for t in 1 2 3 4 5 6 7 8; do
    q "$sql" >"$f" || true
    if grep -qE 'ConnectTempRole|Failed to connect' "$f"; then sleep 1; continue; fi
    return 0
  done
}
FAIL=0

# ── ① 정원 ──
T0=$(date +%s.%N)
for i in $(seq 1 "$N"); do
  while [ "$(jobs -rp | wc -l)" -ge "$PAR" ]; do sleep 0.2; done
  run "$TMP/a$i.txt" "with x as materialized (select duty_apply($SA, $(uid "$i"), '{\"name\":\"conc$i\"}'::jsonb) as r)
    select coalesce(r->>'ok','') as ok, coalesce(r->>'error','') as err, statement_timestamp() as t_start, clock_timestamp() as t_got, pg_sleep($HOLD) as hold from x" &
done
wait
T1=$(date +%s.%N)
OKS=0; FULLS=0; WAITED=0
for i in $(seq 1 "$N"); do
  ok=$(val ok "$TMP/a$i.txt"); err=$(val err "$TMP/a$i.txt")
  if [ "$ok" = "true" ]; then OKS=$((OKS+1)); elif [ "$err" = "full" ]; then FULLS=$((FULLS+1)); else echo "호출 $i 이상: $(head -c 300 "$TMP/a$i.txt")"; FAIL=1; fi
  ts0=$(val t_start "$TMP/a$i.txt"); ts=$(val t_got "$TMP/a$i.txt")
  if [ -n "$ts0" ] && [ -n "$ts" ]; then awk -v a="$(date -d "$ts0" +%s.%N)" -v b="$(date -d "$ts" +%s.%N)" 'BEGIN{exit !(b-a>=0.3)}' && WAITED=$((WAITED+1)); fi
done
ACTIVE=$(q "select count(*) as n from duty_signups where slot_id=$SA and status='active'" | grep -o '"n": [0-9]*' | grep -o '[0-9]*$')
echo "① 정원 2 · 호출 $N → 성공 $OKS · full $FULLS · 살아 있는 줄 ${ACTIVE:-?} · 잠금을 기다린 호출 $WAITED · $(awk -v a="$T0" -v b="$T1" 'BEGIN{printf "%.0f", b-a}')초"
[ "$OKS" = "2" ] && [ "$FULLS" = "$((N-2))" ] && [ "${ACTIVE:-0}" = "2" ] && [ "$WAITED" -ge 1 ] || { echo "① 실패"; FAIL=1; }

# ── ② 같은 계정 · 다른 당번의 겹치는 두 자리 ── (자리 A 는 이미 찼으니 정원을 늘려 둔다)
q "select duty_slot_set($SA, 10)" >/dev/null
U=$(uid 3)
q "delete from duty_signups where user_id = $U" >/dev/null
run "$TMP/b1.txt" "with x as materialized (select duty_apply($SA, $U, '{\"name\":\"conc3\"}'::jsonb) as r) select coalesce(r->>'ok','') as ok, coalesce(r->>'error','') as err, statement_timestamp() as t_start, clock_timestamp() as t_got, pg_sleep($HOLD) as hold from x" &
run "$TMP/b2.txt" "with x as materialized (select duty_apply($SB, $U, '{\"name\":\"conc3\"}'::jsonb) as r) select coalesce(r->>'ok','') as ok, coalesce(r->>'error','') as err, statement_timestamp() as t_start, clock_timestamp() as t_got, pg_sleep($HOLD) as hold from x" &
wait
B_OK=0; B_OV=0
for f in "$TMP/b1.txt" "$TMP/b2.txt"; do
  [ "$(val ok "$f")" = "true" ] && B_OK=$((B_OK+1)); [ "$(val err "$f")" = "overlap" ] && B_OV=$((B_OV+1))
done
B_ACT=$(q "select count(*) as n from duty_signups where user_id = $U and status='active'" | grep -o '"n": [0-9]*' | grep -o '[0-9]*$')
echo "② 같은 계정 · 겹치는 두 자리 → 성공 $B_OK · overlap $B_OV · 살아 있는 줄 ${B_ACT:-?}"
[ "$B_OK" = "1" ] && [ "$B_OV" = "1" ] && [ "${B_ACT:-0}" = "1" ] || { echo "② 실패: $(head -c 200 "$TMP/b1.txt") / $(head -c 200 "$TMP/b2.txt")"; FAIL=1; }

# ── ③ 확정 ↔ 본인 취소 ──
U5=$(uid 5); U6=$(uid 6)
q "delete from duty_signups where user_id in ($U5, $U6)" >/dev/null
E5=$(q "select (duty_apply($SA, $U5, '{\"name\":\"conc5\"}'::jsonb)->>'id') as id" | grep -o '"id": "[^"]*"' | cut -d'"' -f4)
E6=$(q "select (duty_apply($SC, $U6, '{\"name\":\"conc6\"}'::jsonb)->>'id') as id" | grep -o '"id": "[^"]*"' | cut -d'"' -f4)
[ -n "$E5" ] && [ -n "$E6" ] || { echo "③ 준비 실패"; exit 1; }
# (가) 확정이 먼저(잠금을 쥔 채 HOLD+2 초) → 그 사이 취소는 기다렸다가 locked
run "$TMP/c1.txt" "with x as materialized (select duty_day_set('$BA', duty_today()+5, 'confirm') as r) select coalesce(r->>'ok','') as ok, (r->'ids')::text as ids, pg_sleep($((HOLD+2))) as hold from x" &
sleep 2
run "$TMP/c2.txt" "with x as materialized (select duty_cancel($E5, $U5, false) as r) select coalesce(r->>'ok','') as ok, coalesce(r->>'error','') as err, statement_timestamp() as t_start, clock_timestamp() as t_got from x"
wait
C_ERR=$(val err "$TMP/c2.txt"); C_IDS=$(val ids "$TMP/c1.txt")
C_ST=$(q "select status as st from duty_signups where id=$E5" | grep -o '"st": "[^"]*"' | cut -d'"' -f4)
echo "③(가) 확정 먼저 → 취소 '$C_ERR' · 줄 $C_ST · 알릴 줄 $C_IDS"
if [ "$C_ERR" = "locked" ] && [ "$C_ST" = "active" ] && echo "$C_IDS" | grep -q "\b$E5\b"; then :;
elif [ "$(val ok "$TMP/c2.txt")" = "true" ] && [ "$C_ST" = "cancelled" ] && ! echo "$C_IDS" | grep -q "\b$E5\b"; then echo "   (취소가 먼저 닿았다 — 어긋남은 없다)";
else echo "③(가) 실패: $(head -c 300 "$TMP/c1.txt") / $(head -c 300 "$TMP/c2.txt")"; FAIL=1; fi
# (나) 취소가 먼저(잠금을 쥔 채) → 확정은 기다렸다가 그 줄을 빼고 알린다
run "$TMP/d1.txt" "with x as materialized (select duty_cancel($E6, $U6, false) as r) select coalesce(r->>'ok','') as ok, coalesce(r->>'error','') as err, pg_sleep($((HOLD+2))) as hold from x" &
sleep 2
run "$TMP/d2.txt" "with x as materialized (select duty_day_set('$BA', duty_today()+12, 'confirm') as r) select coalesce(r->>'ok','') as ok, (r->'ids')::text as ids from x"
wait
D_OK=$(val ok "$TMP/d1.txt"); D_IDS=$(val ids "$TMP/d2.txt")
D_ST=$(q "select status as st from duty_signups where id=$E6" | grep -o '"st": "[^"]*"' | cut -d'"' -f4)
echo "③(나) 취소 먼저 → 취소 ok=$D_OK · 줄 $D_ST · 알릴 줄 $D_IDS"
if [ "$D_OK" = "true" ] && [ "$D_ST" = "cancelled" ] && ! echo "$D_IDS" | grep -q "\b$E6\b"; then :;
elif [ "$(val err "$TMP/d1.txt")" = "locked" ] && [ "$D_ST" = "active" ] && echo "$D_IDS" | grep -q "\b$E6\b"; then echo "   (확정이 먼저 닿았다 — 어긋남은 없다)";
else echo "③(나) 실패: $(head -c 300 "$TMP/d1.txt") / $(head -c 300 "$TMP/d2.txt")"; FAIL=1; fi

[ "$FAIL" = "0" ] && echo "통과 — 정원 · 겹침 · 확정↔취소가 한 줄로 섰다" || { echo "실패"; exit 1; }
