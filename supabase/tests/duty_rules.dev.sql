-- 봉사 당번 규칙 확인 — **개발에서만**(BEGIN … ROLLBACK). 운영에서 돌리지 않는다.
-- 끝에 「통과」 한 줄(select)이 나오면 끝. 하나라도 어긋나면 raise exception 으로 멈춘다(그때도 ROLLBACK 이라 남는 것 없음).
-- 비교는 전부 `is distinct from` — 함수가 오류를 내서 값이 NULL 이어도 조용히 지나가지 않게.
-- 날짜: 오늘 자리는 **늘 잠긴 날**(마감 = 어제 19시) · 모레(+2) 자리는 담당자가 확정해야만 잠긴다(마감 = 내일 19시) — 그래서 내일(+1)은 쓰지 않는다
--   (저녁 7시 앞뒤로 결과가 갈린다). 한국 시각 23:58~24:00 에 돌리면 「이미 시작」 시험 하나가 어긋날 수 있다.
--   「끝난 자리」(ended·live)는 시각을 못 박은 틀 둘(00:00~00:01 = 늘 끝난 자리 · 23:58~23:59 = 늘 안 끝난 자리)로 참·거짓을 매번 본다 —
--   한국 00:00~00:01 · 23:58~24:00 에 돌리면 그 시험들이 어긋난다.
begin;
do $$
declare
  b uuid; b2 uuid; b3 uuid; b4 uuid; aid uuid; u uuid[] := array[]::uuid[]; r jsonb; i int; k text;
  la bigint; lb bigint; lc bigint; sa bigint; sb bigint; sc bigint; er bigint;
  t0 date := duty_today(); d2 date := duty_today() + 2; d9 date := duty_today() + 9; d16 date := duty_today() + 16;
  wd int := extract(dow from (duty_today() + 2))::int;
  l1 bigint; l2 bigint; l3 bigint; l5 bigint; l6 bigint; l7 bigint; lb2 bigint;
  s1 bigint; s2 bigint; s3 bigint; s5 bigint; s1b bigint; s2b bigint; s2c bigint; st bigint; sp bigint; sx bigint;
  e1 bigint; e2 bigint; e3 bigint; e4 bigint; e5 bigint; ek bigint; es bigint; n int; txt text;
  b5 uuid; b6 uuid; b7 uuid; lp1 bigint; lp2 bigint; lp6 bigint; lp7 bigint; ps bigint; p jsonb; yr int;
  b8 uuid; b9 uuid; b10 uuid; lp8 bigint; lp9 bigint; lp10 bigint; lq1 bigint; lq2 bigint; dprev date; noon9 timestamptz;
begin
  if (select count(*) from public.users) > 200 then raise exception '운영 같은 DB 입니다(users > 200) — 개발에서만 돌리세요'; end if;
  for i in 1..7 loop
    k := '교구|당번시험|1|||당번시험' || i;
    insert into public.users(identity_key, type, gu, mok, name) values (k, '교구', '당번시험', '1', '당번시험' || i) returning id into aid;
    u := u || aid;
  end loop;
  insert into public.duty_boards(title, place, contact_note, status) values ('[시험] 식당 봉사', '식당', '시험 담당', 'open') returning id into b;

  -- ── 자리 틀 · 자리가 저절로 생김 ──
  r := duty_line_save(b, jsonb_build_object('service','1부','task','설거지','start','09:00','end','10:00','capacity',2,'weekday',wd));
  if (r->>'ok')::boolean is not true or (r->>'made')::int is distinct from 8 then raise exception '틀 1(8주 = 자리 8): %', r; end if;
  l1 := (r->>'id')::bigint;
  r := duty_line_save(b, jsonb_build_object('service','2부','task','설거지','start','11:00','end','12:00','capacity',2,'weekday',wd,'sort',1)); l2 := (r->>'id')::bigint;
  r := duty_line_save(b, jsonb_build_object('service','2부','task','배식','start','11:30','end','12:30','capacity',1,'weekday',wd,'sort',2)); l3 := (r->>'id')::bigint;
  r := duty_line_save(b, jsonb_build_object('service','사이','task','','start','10:00','end','11:00','capacity',1,'weekday',wd)); l5 := (r->>'id')::bigint;
  if l2 is null or l3 is null or l5 is null then raise exception '틀 넣기'; end if;
  if duty_ensure_slots(b) is distinct from 0 then raise exception '자리 만들기를 다시 돌리면 0'; end if;
  if (select count(*) from public.duty_slots where board_id = b) is distinct from 32 then raise exception '자리 32개(틀 4 × 8주)'; end if;
  if (select count(*) from public.duty_days where board_id = b) is distinct from 8 then raise exception '날짜 줄 8'; end if;
  r := duty_line_save(b, jsonb_build_object('service','2부','task','설거지','start','11:00','end','12:00','capacity',2,'weekday',wd));
  if r->>'error' is distinct from 'dup-line' then raise exception '같은 이름 틀: %', r; end if;
  r := duty_line_save(b, jsonb_build_object('service','3부','task','','start','13:00','end','12:00','capacity',2));
  if r->>'error' is distinct from 'bad-line' then raise exception '끝이 시작보다 이름: %', r; end if;
  r := duty_line_save(b, jsonb_build_object('service','3부','task','','start','13:00','end','14:00','capacity',0));
  if r->>'error' is distinct from 'bad-line' then raise exception '정원 0: %', r; end if;
  r := duty_line_save(b, jsonb_build_object('service','','task','','start','13:00','end','14:00','capacity',1));
  if r->>'error' is distinct from 'bad-line' then raise exception '빈 이름: %', r; end if;
  r := duty_line_save(b, jsonb_build_object('service','3부','task','','start','아침','end','14:00','capacity',1));
  if r->>'error' is distinct from 'bad-line' then raise exception '시각 꼴: %', r; end if;
  select id into s1 from public.duty_slots where line_id = l1 and on_date = d2;
  select id into s2 from public.duty_slots where line_id = l2 and on_date = d2;
  select id into s3 from public.duty_slots where line_id = l3 and on_date = d2;
  select id into s5 from public.duty_slots where line_id = l5 and on_date = d2;
  select id into s1b from public.duty_slots where line_id = l1 and on_date = d9;
  select id into s2b from public.duty_slots where line_id = l2 and on_date = d9;
  select id into s2c from public.duty_slots where line_id = l2 and on_date = d16;
  if s1 is null or s2 is null or s3 is null or s5 is null or s1b is null or s2b is null or s2c is null then raise exception '자리 찾기'; end if;

  -- ── 지원: 한 줄 · 정원 · 담당자 넘기기 ──
  r := duty_apply(s1, u[1], '{"name":"당번시험1","who_type":"교구","group_name":"당번시험","sub_name":"1"}');
  if (r->>'ok')::boolean is not true or (r->>'locked')::boolean is not false then raise exception '지원 1: %', r; end if;
  e1 := (r->>'id')::bigint;
  r := duty_apply(s1, u[1], '{"name":"당번시험1"}');
  if (r->>'already')::boolean is not true or (r->>'id')::bigint is distinct from e1 then raise exception '두 번 눌러도 한 줄: %', r; end if;
  r := duty_apply(s1, u[2], '{"name":"당번시험2"}'); if (r->>'ok')::boolean is not true then raise exception '지원 2: %', r; end if; e2 := (r->>'id')::bigint;
  r := duty_apply(s1, u[3], '{"name":"당번시험3"}');
  if r->>'error' is distinct from 'full' or (r->>'active')::int is distinct from 2 then raise exception '정원: %', r; end if;
  r := duty_apply(s1, u[3], '{"name":"당번시험3"}', false, true);      -- 본인은 force 가 안 먹는다
  if r->>'error' is distinct from 'full' then raise exception '본인 force: %', r; end if;
  r := duty_apply(s1, u[3], '{"name":"당번시험3"}', true, false); if r->>'error' is distinct from 'full' then raise exception '담당자 확인 전: %', r; end if;
  r := duty_apply(s1, u[3], '{"name":"당번시험3"}', true, true);  if (r->>'ok')::boolean is not true then raise exception '담당자 정원 넘기기: %', r; end if;
  e3 := (r->>'id')::bigint;
  if (select source from public.duty_signups where id = e3) is distinct from 'staff' then raise exception '넣은 곳 staff'; end if;
  r := duty_apply(s1, null, '{"name":"이름"}');             if r->>'error' is distinct from 'bad-ident' then raise exception '계정 없음: %', r; end if;
  r := duty_apply(s1, u[4], '{"name":""}');                 if r->>'error' is distinct from 'bad-ident' then raise exception '빈 이름: %', r; end if;
  r := duty_apply(-1, u[4], '{"name":"당번시험4"}');        if r->>'error' is distinct from 'not-found' then raise exception '없는 자리: %', r; end if;

  -- ── 겹침: 시각이 겹치면 거절 · 맞닿은 자리는 된다 ──
  r := duty_apply(s2, u[1], '{"name":"당번시험1"}'); if (r->>'ok')::boolean is not true then raise exception '1부 뒤 2부: %', r; end if;
  r := duty_apply(s3, u[1], '{"name":"당번시험1"}');
  if r->>'error' is distinct from 'overlap' or r->'with'->>'task' is distinct from '설거지' or (r->'with'->>'same_board')::boolean is not true then raise exception '겹침: %', r; end if;
  r := duty_apply(s5, u[1], '{"name":"당번시험1"}'); if (r->>'ok')::boolean is not true then raise exception '맞닿은 자리(10:00~11:00): %', r; end if;
  r := duty_apply(s3, u[1], '{"name":"당번시험1"}', true, true); if (r->>'ok')::boolean is not true then raise exception '담당자 겹침 넘기기: %', r; end if;
  r := duty_cancel((r->>'id')::bigint, null, true); if (r->>'ok')::boolean is not true then raise exception '겹친 줄 빼기: %', r; end if;
  -- 정원과 겹침이 함께 걸리면: 담당자 길의 full 거절에는 겹친 자리(with)도 실린다(확인 한 번에 둘 다 알린다) · 겹침이 없으면 with 없음 · 본인 길의 full 에는 싣지 않는다
  r := duty_apply(s3, u[3], '{"name":"당번시험3"}', true); if (r->>'ok')::boolean is not true then raise exception '배식 자리(정원 1) 채우기: %', r; end if;
  n := (r->>'id')::int;
  r := duty_apply(s3, u[1], '{"name":"당번시험1"}', true, false);
  if r->>'error' is distinct from 'full' or r->'with'->>'task' is distinct from '설거지' or (r->>'capacity')::int is distinct from 1 then raise exception '담당자 full 에 겹친 자리도: %', r; end if;
  r := duty_apply(s3, u[2], '{"name":"당번시험2"}', true, false);
  if r->>'error' is distinct from 'full' or r ? 'with' then raise exception '겹침이 없으면 with 없음: %', r; end if;
  r := duty_apply(s2, u[5], '{"name":"당번시험5"}'); if (r->>'ok')::boolean is not true then raise exception '2부 지원(겹침 준비): %', r; end if;
  i := (r->>'id')::int;
  r := duty_apply(s3, u[5], '{"name":"당번시험5"}');
  if r->>'error' is distinct from 'full' or r ? 'with' then raise exception '본인 길의 full 에는 with 없음: %', r; end if;
  r := duty_move(i, s3); if r->>'error' is distinct from 'full' or r ? 'with' then raise exception '옮기기 full(겹침 없음 — 자기 줄은 겹침으로 안 센다): %', r; end if;
  r := duty_cancel(i, u[5], false); if (r->>'ok')::boolean is not true then raise exception '겹침 준비 줄 취소: %', r; end if;
  r := duty_cancel(n, null, true);  if (r->>'ok')::boolean is not true then raise exception '배식 자리 비우기: %', r; end if;

  -- ── 취소 · 되살림 · 남의 줄 ──
  r := duty_cancel(e2, u[1], false); if r->>'error' is distinct from 'not-found' then raise exception '남의 줄 취소: %', r; end if;
  r := duty_cancel(e1, null, false); if r->>'error' is distinct from 'not-found' then raise exception '계정 없이 취소: %', r; end if;
  if cardinality(duty_notify_claim('confirmed', array[e1])) is distinct from 1 then raise exception '알림 줄 잡기(되살림 시험 준비)'; end if;
  r := duty_cancel(e1, u[1], false); if (r->>'ok')::boolean is not true then raise exception '본인 취소: %', r; end if;
  if (select status || '/' || end_reason from public.duty_signups where id = e1) is distinct from 'cancelled/self' then raise exception '취소 상태'; end if;
  r := duty_cancel(e1, u[1], false); if r->>'error' is distinct from 'not-active' then raise exception '두 번 취소: %', r; end if;
  r := duty_apply(s1, u[1], '{"name":"당번시험1"}'); if r->>'error' is distinct from 'full' then raise exception '그 사이 찬 자리(2/2): %', r; end if;
  r := duty_slot_set(s1, 3); if (r->>'capacity')::int is distinct from 3 then raise exception '정원 3: %', r; end if;
  r := duty_apply(s1, u[1], '{"name":"당번시험1"}');
  if (r->>'revived')::boolean is not true or (r->>'id')::bigint is distinct from e1 then raise exception '다시 지원 = 되살림: %', r; end if;
  if (r->>'hadUser')::boolean is not true then raise exception '되살린 줄에 앱 계정이 있다(hadUser): %', r; end if;
  if (select count(*) from public.duty_signups where slot_id = s1 and user_id = u[1]) is distinct from 1 then raise exception '자리·사람에 한 줄'; end if;
  if exists (select 1 from public.duty_notify_log where signup_id = e1) then raise exception '되살리면 예전 알림 기록을 지운다'; end if;

  -- ── 담당자가 뺀 분은 스스로 못 돌아온다 · 담당자는 다시 넣는다 ──
  r := duty_cancel(e2, null, true); if (r->>'ok')::boolean is not true or (r->>'hadUser')::boolean is not true then raise exception '담당자 빼기: %', r; end if;
  if (select status || '/' || end_reason from public.duty_signups where id = e2) is distinct from 'removed/staff' then raise exception '뺀 상태'; end if;
  r := duty_apply(s1, u[2], '{"name":"당번시험2"}'); if r->>'error' is distinct from 'removed-by-staff' then raise exception '뺀 분 재지원: %', r; end if;
  r := duty_apply(s1, u[2], '{"name":"당번시험2"}', true, true); if (r->>'revived')::boolean is not true then raise exception '담당자 다시 넣기: %', r; end if;

  -- ── 담당자가 넣은 줄은 본인이 스스로 못 뺀다(담당자가 정한 것은 담당자가 바꾼다) ──
  select id into es from public.duty_signups where slot_id = s1 and user_id = u[2];
  r := duty_cancel(es, u[2], false); if r->>'error' is distinct from 'staff-row' then raise exception '담당자가 넣은 줄의 본인 취소: %', r; end if;
  r := duty_ask(es, u[2], 'cant'); if (r->>'asked')::boolean is not true then raise exception '담당자가 넣은 줄은 잠기기 전에도 못 가요: %', r; end if;
  if (select (m->>'canCancel')::boolean from jsonb_array_elements(duty_mine(u[2])) m where (m->>'id')::bigint = es) is not false
     or (select (m->>'canAsk')::boolean from jsonb_array_elements(duty_mine(u[2])) m where (m->>'id')::bigint = es) is not true
     or (select (m->>'staffAdded')::boolean from jsonb_array_elements(duty_mine(u[2])) m where (m->>'id')::bigint = es) is not true then
    raise exception '내 당번 — 담당자가 넣은 줄의 판정: %', duty_mine(u[2]);
  end if;
  r := duty_ask(es, u[2], null); if (r->>'asked')::boolean is not false then raise exception '거두기: %', r; end if;

  -- ── 계정 없는 줄(대신 넣기) ──
  r := duty_apply(s2, null, '{"name":"새가족","who_type":"새가족","ident_key":"staff|새가족||새가족"}', true);
  if (r->>'ok')::boolean is not true then raise exception '대신 넣기(계정 없음): %', r; end if; ek := (r->>'id')::bigint;
  if (r->>'hadUser')::boolean is not false then raise exception '계정 없는 줄은 hadUser 가 아니다: %', r; end if;
  r := duty_apply(s2, null, '{"name":"새가족","ident_key":"staff|새가족||새가족"}', true);
  if (r->>'already')::boolean is not true then raise exception '대신 넣기 두 번: %', r; end if;
  r := duty_apply(s3, null, '{"name":"새가족","ident_key":"staff|새가족||새가족"}', true);
  if r->>'error' is distinct from 'overlap' then raise exception '계정 없는 줄의 겹침: %', r; end if;
  r := duty_apply(s2, null, '{"name":"새가족","ident_key":""}', true); if r->>'error' is distinct from 'bad-ident' then raise exception '신원 키 없음: %', r; end if;

  -- ── 잠금: 담당자 확정 ──
  r := duty_ask(e1, u[1], 'cant'); if r->>'error' is distinct from 'not-locked' then raise exception '안 잠긴 날의 못 가요: %', r; end if;
  r := duty_day_set(b, d2, 'confirm', null);
  if (r->>'ok')::boolean is not true or jsonb_array_length(r->'ids') is distinct from 5 or (r->>'active')::int is distinct from 6 then raise exception '확정(알릴 줄 5 · 살아 있는 줄 6): %', r; end if;
  r := duty_day_set(b, d2, 'confirm', null); if (r->>'already')::boolean is not true then raise exception '다시 확정 = already: %', r; end if;
  r := duty_apply(s3, u[4], '{"name":"당번시험4"}'); if r->>'error' is distinct from 'locked-day' then raise exception '잠긴 날 · 확인 없이: %', r; end if;
  if exists (select 1 from public.duty_signups where slot_id = s3 and user_id = u[4]) then raise exception 'locked-day 는 아무것도 안 쓴다'; end if;
  r := duty_apply(s3, u[4], '{"name":"당번시험4"}', false, false, true);
  if (r->>'ok')::boolean is not true or (r->>'locked')::boolean is not true then raise exception '잠긴 날 · 알고 지원: %', r; end if; e4 := (r->>'id')::bigint;
  r := duty_cancel(e4, u[4], false); if r->>'error' is distinct from 'locked' then raise exception '잠긴 날 본인 취소: %', r; end if;
  r := duty_ask(e4, u[4], 'zzz');   if r->>'error' is distinct from 'bad-why' then raise exception 'bad-why: %', r; end if;
  r := duty_ask(e4, u[1], 'cant');  if r->>'error' is distinct from 'not-found' then raise exception '남의 줄 못 가요: %', r; end if;
  r := duty_ask(e4, u[4], 'cant');  if (r->>'asked')::boolean is not true then raise exception '못 가요: %', r; end if;
  if (duty_roster(b, d2, d2)->'days'->0->>'asks')::int is distinct from 1 then raise exception '명단의 못 가요 수'; end if;
  r := duty_ask_clear(e4); if (r->>'cleared')::boolean is not true then raise exception '담당자가 표시 거두기: %', r; end if;
  r := duty_ask_clear(e4); if (r->>'ok')::boolean is not true or (r->>'cleared')::boolean is not false then raise exception '표시 없는 줄 거두기: %', r; end if;
  if (duty_roster(b, d2, d2)->'days'->0->>'asks')::int is distinct from 0 then raise exception '거둔 뒤 못 가요 수 0'; end if;
  if (select status from public.duty_signups where id = e4) is distinct from 'active' then raise exception '표시를 거둬도 줄은 그대로'; end if;
  r := duty_ask_clear(-1); if r->>'error' is distinct from 'not-found' then raise exception '없는 줄 표시 거두기: %', r; end if;
  r := duty_ask(e4, u[4], 'cant');  if (r->>'asked')::boolean is not true then raise exception '다시 못 가요: %', r; end if;
  r := duty_ask(e4, u[4], null);    if (r->>'asked')::boolean is not false then raise exception '못 가요 거두기: %', r; end if;
  r := duty_day_set(b, d2, 'unconfirm'); if (r->>'ok')::boolean is not true or r ? 'already' then raise exception '확정 풀기: %', r; end if;
  r := duty_day_set(b, d2, 'unconfirm'); if (r->>'already')::boolean is not true then raise exception '풀기 두 번: %', r; end if;
  r := duty_cancel(e4, u[4], false); if (r->>'ok')::boolean is not true then raise exception '풀린 뒤 본인 취소: %', r; end if;
  r := duty_day_set(b, d2, 'zzz'); if r->>'error' is distinct from 'bad-op' then raise exception 'bad-op: %', r; end if;
  r := duty_day_set(b, d2, 'note', null, '추수감사주일'); if (r->>'ok')::boolean is not true then raise exception '메모: %', r; end if;
  if (select note from public.duty_days where board_id = b and on_date = d2) is distinct from '추수감사주일' then raise exception '메모 저장'; end if;

  -- ── 오늘 = 늘 잠긴 날 · 이미 시작 · 지난 날 ──
  r := duty_line_save(b, jsonb_build_object('service','야간','task','정리','start','23:58','end','23:59','capacity',3)); l6 := (r->>'id')::bigint;
  r := duty_line_save(b, jsonb_build_object('service','새벽','task','정리','start','00:00','end','00:01','capacity',3)); l7 := (r->>'id')::bigint;
  if (r->>'made')::int is distinct from 0 then raise exception '요일 없는 틀은 저절로 안 생긴다: %', r; end if;
  r := duty_date_add(b, t0, array[l6, l7]); if (r->>'made')::int is distinct from 2 then raise exception '날짜 더하기(오늘): %', r; end if;
  r := duty_date_add(b, t0, array[l6, l7]); if (r->>'made')::int is distinct from 0 or (r->>'existed')::int is distinct from 2 then raise exception '다시 더하기: %', r; end if;
  r := duty_date_add(b, t0, array[-5]::bigint[]); if r->>'error' is distinct from 'bad-lines' then raise exception '없는 틀: %', r; end if;
  r := duty_date_add(b, t0 + 900, array[l6]); if r->>'error' is distinct from 'bad-date' then raise exception '먼 날짜: %', r; end if;
  select id into st from public.duty_slots where line_id = l6 and on_date = t0;
  select id into sx from public.duty_slots where line_id = l7 and on_date = t0;
  r := duty_apply(st, u[5], '{"name":"당번시험5"}'); if r->>'error' is distinct from 'locked-day' then raise exception '오늘은 늘 잠긴 날: %', r; end if;
  r := duty_apply(st, u[5], '{"name":"당번시험5"}', false, false, true);
  if (r->>'locked')::boolean is not true then raise exception '오늘 지원(알고): %', r; end if; e5 := (r->>'id')::bigint;
  r := duty_apply(sx, u[6], '{"name":"당번시험6"}', false, false, true); if r->>'error' is distinct from 'started' then raise exception '이미 시작한 자리: %', r; end if;
  r := duty_apply(sx, u[6], '{"name":"당번시험6"}', true); if (r->>'ok')::boolean is not true then raise exception '담당자는 시작한 자리에도: %', r; end if;
  r := duty_day_set(b, t0, 'confirm'); if (r->>'already')::boolean is not true then raise exception '이미 잠긴 날의 확정 = already: %', r; end if;
  update public.duty_days set confirmed_at = now() where board_id = b and on_date = t0;
  r := duty_day_set(b, t0, 'unconfirm'); if r->>'error' is distinct from 'too-late' then raise exception '마감 뒤 풀기: %', r; end if;
  r := duty_date_add(b, t0 - 1, array[l6]); if (r->>'made')::int is distinct from 1 then raise exception '어제 자리: %', r; end if;
  select id into sp from public.duty_slots where line_id = l6 and on_date = t0 - 1;
  r := duty_apply(sp, u[6], '{"name":"당번시험6"}', false, false, true); if r->>'error' is distinct from 'past' then raise exception '지난 날 지원: %', r; end if;
  r := duty_apply(sp, u[6], '{"name":"당번시험6"}', true); if (r->>'ok')::boolean is not true then raise exception '담당자는 지난 날도 넣는다: %', r; end if;
  r := duty_cancel((r->>'id')::bigint, u[6], false); if r->>'error' is distinct from 'past' then raise exception '지난 날 본인 취소: %', r; end if;
  r := duty_day_set(b, t0 - 1, 'confirm'); if r->>'error' is distinct from 'past' then raise exception '지난 날 확정: %', r; end if;
  r := duty_slot_delete(sp); if r->>'error' is distinct from 'has-signups' then raise exception '지원 있는 자리 지우기: %', r; end if;
  r := duty_slot_delete(s2b); if r->>'error' is distinct from 'use-off' then raise exception '요일이 맞는 자리 지우기: %', r; end if;
  r := duty_date_add(b, t0 + 3, array[l6]);
  r := duty_slot_delete((select id from public.duty_slots where line_id = l6 and on_date = t0 + 3)); if (r->>'ok')::boolean is not true then raise exception '더한 자리 지우기: %', r; end if;

  -- ── 쉬는 날: 스위치(지원 줄은 그대로) ──
  r := duty_apply(s1b, u[1], '{"name":"당번시험1"}'); if (r->>'ok')::boolean is not true then raise exception '+9 지원: %', r; end if;
  r := duty_days_off(b, d9, d9, true, '쉬어요');
  if (r->>'dry')::boolean is not true or (r->>'active')::int is distinct from 1 or (r->>'days')::int is distinct from 1 then raise exception '쉬는 날 세기: %', r; end if;
  if (select off from public.duty_days where board_id = b and on_date = d9) is not false then raise exception '세기만 했는데 바뀜'; end if;
  r := duty_days_off(b, d9, d9, true, '쉬어요', 0); if r->>'error' is distinct from 'changed' or (r->>'active')::int is distinct from 1 then raise exception '수가 다르면 changed: %', r; end if;
  r := duty_days_off(b, d9, d9, true, '쉬어요', 1);
  if (r->>'ok')::boolean is not true or (r->>'days')::int is distinct from 1 or jsonb_array_length(r->'ids') is distinct from 1 then raise exception '쉬는 날로: %', r; end if;
  if (select status from public.duty_signups where slot_id = s1b and user_id = u[1]) is distinct from 'active' then raise exception '쉬어도 줄은 그대로'; end if;
  r := duty_apply(s1b, u[2], '{"name":"당번시험2"}'); if r->>'error' is distinct from 'off' then raise exception '쉬는 날 지원: %', r; end if;
  if cardinality(duty_notify_claim('remind', array(select id from public.duty_signups where slot_id = s1b))) is distinct from 0 then raise exception '쉬는 날엔 알림 줄을 잡지 않는다'; end if;
  if (select (x->>'off')::boolean from jsonb_array_elements(duty_board_view(b, u[1])->'days') x where x->>'date' = d9::text) is not true then raise exception '앱 응답의 쉬는 날'; end if;
  r := duty_days_off(b, d9, d9, false, '', 1);
  if (r->>'ok')::boolean is not true or (select off from public.duty_days where board_id = b and on_date = d9) is not false then raise exception '다시 열기: %', r; end if;
  if (select note from public.duty_days where board_id = b and on_date = d9) is distinct from '' then raise exception '다시 열 때 메모 지움'; end if;
  r := duty_slot_set(s2b, null, true); if (r->>'off')::boolean is not true then raise exception '자리 쉼(빈 자리): %', r; end if;
  r := duty_apply(s2b, u[2], '{"name":"당번시험2"}'); if r->>'error' is distinct from 'off' then raise exception '쉬는 자리 지원: %', r; end if;
  r := duty_slot_set(s2b, null, false); if (r->>'off')::boolean is not false then raise exception '자리 다시 열기: %', r; end if;
  r := duty_slot_set(s1b, null, true); if r->>'error' is distinct from 'changed' or (r->>'active')::int is distinct from 1 then raise exception '선 분이 있는 자리 쉼 — 확인 전: %', r; end if;
  r := duty_slot_set(s1b, null, true, 1); if (r->>'ok')::boolean is not true or jsonb_array_length(r->'ids') is distinct from 1 then raise exception '선 분이 있는 자리 쉼: %', r; end if;
  r := duty_slot_set(s1b, null, false);
  r := duty_days_off(b, t0 + 60, t0 + 80, true, '여름 휴가');
  if (r->>'days')::int is distinct from 3 or (r->>'active')::int is distinct from 0 then raise exception '기간 쉼 세기(요일이 맞는 3일): %', r; end if;
  r := duty_days_off(b, t0 + 60, t0 + 80, true, '여름 휴가', 0); if (r->>'days')::int is distinct from 3 then raise exception '기간 쉼: %', r; end if;
  if (select count(*) from public.duty_days where board_id = b and on_date between t0 + 60 and t0 + 80 and off and note = '여름 휴가') is distinct from 3 then raise exception '기간 쉼 줄 3'; end if;
  -- 메모: 다시 열 때 '' 는 **이번에 다시 연 날에만**(그 기간의 다른 날 메모는 그대로) · 쉬는 날로 바꿀 때는 이미 쉬던 날에도 적는다
  perform duty_day_set(b, d16, 'note', null, '추수감사주일');
  r := duty_days_off(b, d9, d16, true, '수련회', 1);
  if (r->>'ok')::boolean is not true or (r->>'days')::int is distinct from 2 then raise exception '두 주 쉼: %', r; end if;
  if (select count(*) from public.duty_days where board_id = b and on_date in (d9, d16) and off and note = '수련회') is distinct from 2 then raise exception '쉬는 날 메모 2'; end if;
  r := duty_days_off(b, d16, d16, false, null, 0); if (r->>'days')::int is distinct from 1 then raise exception '한 날 다시 열기(메모 그대로): %', r; end if;
  if (select note from public.duty_days where board_id = b and on_date = d16) is distinct from '수련회' then raise exception 'p_note null 이면 메모 그대로'; end if;
  perform duty_day_set(b, d16, 'note', null, '추수감사주일');
  r := duty_days_off(b, d9, d16, false, '', 1);
  if (r->>'ok')::boolean is not true or (r->>'days')::int is distinct from 1 then raise exception '기간 다시 열기(쉬던 날은 +9 하나): %', r; end if;
  if (select note from public.duty_days where board_id = b and on_date = d9) is distinct from '' then raise exception '다시 연 날의 메모는 지운다'; end if;
  if (select note from public.duty_days where board_id = b and on_date = d16) is distinct from '추수감사주일' then raise exception '이번에 열지 않은 날의 메모는 그대로'; end if;
  r := duty_days_off(b, d9, d9, true, null, 1); if (r->>'days')::int is distinct from 1 then raise exception '+9 다시 쉼: %', r; end if;
  r := duty_days_off(b, d9, d16, true, '수련회', 0);
  if (r->>'days')::int is distinct from 1 or (select note from public.duty_days where board_id = b and on_date = d9) is distinct from '수련회' then raise exception '이미 쉬던 날에도 메모를 적는다: %', r; end if;
  r := duty_days_off(b, d9, d16, false, '', 1); if (r->>'days')::int is distinct from 2 then raise exception '둘 다 다시 열기: %', r; end if;
  perform duty_day_set(b, d16, 'note', null, '');
  r := duty_days_off(b, t0 - 1, t0 + 3, true); if r->>'error' is distinct from 'bad-range' then raise exception '지난 날 쉼: %', r; end if;
  r := duty_days_off(b, t0, t0 + 200, true);   if r->>'error' is distinct from 'bad-range' then raise exception '긴 기간: %', r; end if;
  r := duty_days_off(b, t0 + 395, t0 + 401, true); if r->>'error' is distinct from 'bad-range' then raise exception '오늘+400일을 넘는 쉬는 기간(지울 길 없는 날짜 줄을 만들지 않는다): %', r; end if;

  -- ── 정원 ──
  r := duty_slot_set(s1, 1); if r->>'error' is distinct from 'below-count' or (r->>'active')::int is distinct from 3 then raise exception '찬 수 아래로: %', r; end if;
  r := duty_slot_set(s1, 5); if (r->>'capacity')::int is distinct from 5 then raise exception '정원 늘리기: %', r; end if;
  r := duty_slot_set(s1, 0); if r->>'error' is distinct from 'bad-capacity' then raise exception '정원 0: %', r; end if;

  -- ── 옮기기: 같은 줄 · 같은 당번 안 ──
  select id into e2 from public.duty_signups where slot_id = s2 and user_id = u[1];
  perform duty_notify_claim('remind', array[e2]);
  r := duty_move(e2, s2c);
  if (r->>'ok')::boolean is not true or r->'to'->>'date' is distinct from d16::text or r->'from'->>'date' is distinct from d2::text then raise exception '옮기기: %', r; end if;
  if (select slot_id from public.duty_signups where id = e2) is distinct from s2c then raise exception '같은 줄의 자리만 바뀐다'; end if;
  if exists (select 1 from public.duty_notify_log where signup_id = e2 and kind = 'remind') then raise exception '옮기면 전날 알림 기록을 지운다'; end if;
  if (select m->'movedFrom'->>'date' from jsonb_array_elements(duty_mine(u[1])) m where (m->>'id')::bigint = e2) is distinct from d2::text then raise exception '내 당번의 옮긴 흔적: %', duty_mine(u[1]); end if;
  if (select (x->>'moved')::boolean from jsonb_array_elements(duty_roster(b, d16, d16)->'days'->0->'slots') sl, jsonb_array_elements(sl->'signups') x where (x->>'id')::bigint = e2) is not true then raise exception '명단의 옮긴 표시'; end if;
  r := duty_move(e2, s2c); if (r->>'already')::boolean is not true then raise exception '같은 자리로: %', r; end if;
  insert into public.duty_boards(title, status) values ('[시험] 주차', 'open') returning id into b2;
  r := duty_line_save(b2, jsonb_build_object('service','2부','task','','start','11:00','end','12:00','capacity',1,'weekday',wd)); lb2 := (r->>'id')::bigint;
  r := duty_move(e2, (select id from public.duty_slots where line_id = lb2 and on_date = d16));
  if r->>'error' is distinct from 'wrong-board' then raise exception '다른 당번으로: %', r; end if;
  r := duty_apply((select id from public.duty_slots where line_id = lb2 and on_date = d16), u[1], '{"name":"당번시험1"}');
  if r->>'error' is distinct from 'overlap' or (r->'with'->>'same_board')::boolean is not false or (r->'with'->>'draft')::boolean is not false then raise exception '다른 당번과 겹침: %', r; end if;
  r := duty_move(e2, s1b); if r->>'error' is distinct from 'already-there' then raise exception '이미 선 자리로: %', r; end if;
  r := duty_cancel((select id from public.duty_signups where slot_id = s1b and user_id = u[1]), u[1], false);
  if (r->>'ok')::boolean is not true then raise exception '+9 본인 취소: %', r; end if;
  r := duty_apply(s1b, u[2], '{"name":"당번시험2"}'); if (r->>'ok')::boolean is not true then raise exception '+9 둘째: %', r; end if;
  r := duty_apply(s1b, u[3], '{"name":"당번시험3"}'); if (r->>'ok')::boolean is not true then raise exception '+9 셋째: %', r; end if;
  e3 := (r->>'id')::bigint;
  r := duty_move(e2, s1b); if r->>'error' is distinct from 'full' then raise exception '찬 자리로: %', r; end if;
  r := duty_move(e2, s1b, true); if (r->>'ok')::boolean is not true then raise exception '찬 자리로 넘겨 옮기기: %', r; end if;
  if (select count(*) from public.duty_signups where slot_id = s1b and user_id = u[1]) is distinct from 1 then raise exception '옮길 자리의 끝난 줄은 지운다(한 줄)'; end if;
  r := duty_move(-1, s1b); if r->>'error' is distinct from 'not-found' then raise exception '없는 줄 옮기기: %', r; end if;

  -- ── 미리 잡아 둘 수 있는 수 ──
  update public.duty_boards set max_ahead = 1 where id = b;
  r := duty_apply(s2c, u[7], '{"name":"당번시험7"}'); if (r->>'ok')::boolean is not true then raise exception '첫 자리: %', r; end if;
  r := duty_apply(s2b, u[7], '{"name":"당번시험7"}'); if r->>'error' is distinct from 'too-many' or (r->>'max')::int is distinct from 1 then raise exception '미리 잡는 수: %', r; end if;
  r := duty_apply(s2b, u[7], '{"name":"당번시험7"}', true); if (r->>'ok')::boolean is not true then raise exception '담당자는 지나간다: %', r; end if;
  update public.duty_boards set max_ahead = null where id = b;

  -- ── 읽기: 칸과 새지 않는 것 ──
  r := duty_board_view(b, u[1]);
  if (r->>'ok')::boolean is not true or r->'board'->>'contact' is distinct from '시험 담당' then raise exception '앱 당번 보기: %', left(r::text, 300); end if;
  txt := r::text || duty_mine(u[1])::text || duty_list_view(u[1])::text || duty_roster(b)::text || duty_board_counts(array[b])::text;
  if txt ~ 'user_id|ident_key|confirmed_by|staff\|' then raise exception '응답에 user_id·ident_key·신원 키가 실렸다'; end if;
  if position(u[1]::text in txt) > 0 or position(u[2]::text in txt) > 0 then raise exception '응답에 계정 번호가 실렸다'; end if;
  if (r->'days'->0->>'date') is distinct from t0::text then raise exception '첫 날은 오늘(자리가 있는 날): %', r->'days'->0->>'date'; end if;
  if (select count(*) from jsonb_array_elements(r->'days') d, jsonb_array_elements(d->'slots') s where s->>'why' = 'mine') < 2 then raise exception '내 자리 표시(mine)'; end if;
  if jsonb_typeof(r->'days'->1->'slots'->0->'names') is distinct from 'array' then raise exception '이름은 배열'; end if;
  if duty_mine(u[1]) = '[]'::jsonb then raise exception '내 당번이 비었다'; end if;
  if (duty_mine(u[5])->0->>'locked')::boolean is not true or (duty_mine(u[5])->0->>'canCancel')::boolean is not false then raise exception '오늘 내 줄은 잠김·취소 못 함: %', duty_mine(u[5]); end if;
  if duty_mine(null) is distinct from '[]'::jsonb then raise exception '계정 없이 내 당번'; end if;
  if jsonb_array_length(duty_list_view(u[1])->'boards') < 2 then raise exception '당번 목록'; end if;
  if (duty_board_counts(array[b, b2])->(b::text)->>'lines')::int is distinct from 6 then raise exception '당번 요약 수: %', duty_board_counts(array[b, b2]); end if;
  if (duty_board_counts(array[b])->(b::text)->>'active')::int < 5 then raise exception '앞날 살아 있는 지원 수: %', duty_board_counts(array[b]); end if;
  if not exists (select 1 from jsonb_array_elements(duty_roster(b)->'days') dd, jsonb_array_elements(dd->'slots') sl, jsonb_array_elements(sl->'signups') x
                 where x ? 'hasPush' and (x->>'hasPush')::boolean is false and x ? 'hasApp') then raise exception '명단의 hasApp·hasPush 칸'; end if;
  -- pk — 같은 분의 줄은 같은 표식 · 다른 분은 다른 표식 · 부를 때마다 바뀐다(되짚을 수 없다) · 계정 번호의 해시가 그대로 실리지 않는다
  r := duty_roster(b, t0, t0 + 20);
  if (select count(distinct x->>'pk') from jsonb_array_elements(r->'days') dd, jsonb_array_elements(dd->'slots') sl, jsonb_array_elements(sl->'signups') x
       where x->>'name' = '당번시험2') is distinct from 1 then raise exception 'pk — 같은 분은 한 표식'; end if;
  if (select count(distinct x->>'pk') from jsonb_array_elements(r->'days') dd, jsonb_array_elements(dd->'slots') sl, jsonb_array_elements(sl->'signups') x
       where x->>'name' in ('당번시험2','당번시험3')) is distinct from 2 then raise exception 'pk — 다른 분은 다른 표식'; end if;
  if exists (select 1 from jsonb_array_elements(r->'days') dd, jsonb_array_elements(dd->'slots') sl, jsonb_array_elements(sl->'signups') x
       where coalesce(length(x->>'pk'), 0) <> 10 or x->>'pk' = left(md5(u[2]::text), 10)) then raise exception 'pk 꼴'; end if;
  if (select x->>'pk' from jsonb_array_elements(r->'days') dd, jsonb_array_elements(dd->'slots') sl, jsonb_array_elements(sl->'signups') x where x->>'name' = '당번시험2' limit 1)
     = (select x->>'pk' from jsonb_array_elements(duty_roster(b, t0, t0 + 20)->'days') dd, jsonb_array_elements(dd->'slots') sl, jsonb_array_elements(sl->'signups') x where x->>'name' = '당번시험2' limit 1)
    then raise exception 'pk 는 부를 때마다 바뀐다'; end if;
  r := duty_roster(b, t0 - 1, t0 + 20);
  if (r->>'ok')::boolean is not true or jsonb_array_length(r->'lines') is distinct from 6 or (r->'days'->0->>'past')::boolean is not true then raise exception '명단: %', left(r::text, 300); end if;
  r := duty_roster(b, t0, t0 + 500);
  if (r->>'ok')::boolean is not true or r->>'from' is distinct from (t0 + 100)::text or r->>'to' is distinct from (t0 + 500)::text then raise exception '명단 기간 — 400일을 넘으면 앞을 당긴다: % ~ %', r->>'from', r->>'to'; end if;
  if duty_roster(b, t0 + 5, t0)->>'error' is distinct from 'bad-range' then raise exception '명단 기간 — 끝이 앞보다 이르면 bad-range'; end if;
  if duty_name_out(E'  홍길동\t\u202E' || repeat('가', 30)) is distinct from '홍길동' || repeat('가', 17) then raise exception '이름 다듬기: %', duty_name_out(E'  홍길동\t\u202E' || repeat('가', 30)); end if;

  -- ── 알림 줄 잡기 · 재료 ──
  if cardinality(duty_notify_claim('confirmed', array[e2, e3, ek])) is distinct from 2 then raise exception '알림 줄(계정 없는 줄은 안 잡는다)'; end if;
  if cardinality(duty_notify_claim('confirmed', array[e2, e3, ek])) is distinct from 0 then raise exception '같은 알림은 한 번'; end if;
  if jsonb_array_length(duty_notify_rows(array[e2, e3, ek])) is distinct from 2 or duty_notify_rows(array[e2])->0->>'uid' is distinct from u[1]::text then raise exception '알림 재료'; end if;
  -- 알림 글·거르기에 쓰는 칸(3단계) — 지난 날·전날 저녁이 지났나·그날이 쉬나·옮기기 전 자리
  r := duty_notify_rows(array[e2])->0;
  if not (r ? 'past') or not (r ? 'pastCutoff') or not (r ? 'dayOff') or not (r ? 'movedFrom') then raise exception '알림 재료의 칸: %', r; end if;
  if (r->>'past')::boolean is not false or (r->>'dayOff')::boolean is not false then raise exception '알림 재료 — 앞날·안 쉬는 날: %', r; end if;
  if (duty_notify_rows(array[e5])->0->>'pastCutoff')::boolean is not true then raise exception '알림 재료 — 오늘 자리는 전날 저녁이 지났다: %', duty_notify_rows(array[e5]); end if;
  if not (e5 = any(duty_remind_ids(t0))) then raise exception '전날 알림 대상(오늘 날짜로 불러 봄)'; end if;
  -- 검토 반영(2026-10-07) — 알림 재료의 새 칸(confirmed · ended · dup) · 확정을 풀어도 알림 기록은 그대로(같은 줄에 한 번) · 앞날 줄을 지난 날 자리로는 옮기지 않는다(to-past)
  declare bx uuid; lx bigint; s_past bigint; s_next bigint; ex bigint; e_dup bigint; e_today bigint; rr jsonb;
    le bigint; ln bigint; v uuid[] := array[]::uuid[]; s_e0 bigint; s_n0 bigint; s_ey bigint; s_ny bigint; s_n2y bigint; s_n3 bigint; s_n4 bigint; s_n5 bigint;
    ea bigint; eb bigint; ec bigint; ed bigint; ef bigint; eg bigint; eh bigint; ei bigint; ej bigint;
  begin
    insert into public.duty_boards(title, status) values ('[시험] 알림 재료', 'open') returning id into bx;
    rr := duty_line_save(bx, jsonb_build_object('service','가','task','','start','09:00','end','10:00','capacity',3)); lx := (rr->>'id')::bigint;
    perform duty_date_add(bx, t0 - 1, array[lx]); perform duty_date_add(bx, t0 + 3, array[lx]); perform duty_date_add(bx, t0, array[lx]);
    select id into s_past from public.duty_slots where line_id = lx and on_date = t0 - 1;
    select id into s_next from public.duty_slots where line_id = lx and on_date = t0 + 3;
    if lx is null or s_past is null or s_next is null then raise exception '알림 재료 시험 준비'; end if;
    rr := duty_apply(s_next, u[7], '{"name":"당번시험7"}', true, true); ex := (rr->>'id')::bigint;
    if (rr->>'ok')::boolean is not true or (rr->>'hadUser')::boolean is not true then raise exception '담당자가 계정으로 넣은 줄(hadUser): %', rr; end if;
    rr := duty_move(ex, s_past, true); if rr->>'error' is distinct from 'to-past' then raise exception '앞날 줄 → 지난 날 자리(to-past): %', rr; end if;
    if (select slot_id from public.duty_signups where id = ex) is distinct from s_next then raise exception 'to-past 거절은 아무것도 옮기지 않는다'; end if;
    rr := duty_notify_rows(array[ex])->0;
    if not (rr ? 'confirmed') or not (rr ? 'ended') or not (rr ? 'dup') then raise exception '알림 재료의 새 칸: %', rr; end if;
    if (rr->>'confirmed')::boolean is not false or (rr->>'ended')::boolean is not false or (rr->>'dup')::boolean is not false then raise exception '알림 재료 — 확정 전 · 앞날 · 겹친 줄 없음: %', rr; end if;
    rr := duty_day_set(bx, t0 + 3, 'confirm'); if (rr->>'ok')::boolean is not true then raise exception '확정: %', rr; end if;
    if (duty_notify_rows(array[ex])->0->>'confirmed')::boolean is not true then raise exception '알림 재료 — 확정한 날'; end if;
    perform duty_notify_claim('confirmed', array[ex]); perform duty_notify_claim('remind', array[ex]);
    rr := duty_day_set(bx, t0 + 3, 'unconfirm'); if (rr->>'ok')::boolean is not true then raise exception '확정 풀기: %', rr; end if;
    -- 확정을 풀어도 알림 기록은 그대로다 — 같은 줄에 같은 알림은 한 번(다시 확정해도 이미 받은 분께는 다시 가지 않는다 · 실패해 안 잡힌 분께만 간다)
    if (select count(*) from public.duty_notify_log where signup_id = ex) is distinct from 2 then raise exception '확정을 풀어도 알림 기록(확정·전날)은 그대로'; end if;
    if (duty_notify_rows(array[ex])->0->>'confirmed')::boolean is not false then raise exception '알림 재료 — 확정을 푼 날'; end if;
    if cardinality(duty_notify_claim('confirmed', array[ex])) is distinct from 0 then raise exception '풀었다 다시 확정해도 이미 받은 줄은 다시 잡히지 않는다'; end if;
    -- 같은 자리에 같은 이름(띄어쓰기는 무시)의 살아 있는 줄이 또 있다(계정 없는 줄) → dup · 그 줄을 빼면 아니다
    rr := duty_apply(s_next, null, '{"name":"당번 시험7","ident_key":"staff|x|y|당번시험7"}', true, true); e_dup := (rr->>'id')::bigint;
    if (rr->>'ok')::boolean is not true or e_dup is not distinct from ex then raise exception '겹친 줄 준비(앱 줄과 계정 없는 줄은 못 잇는다): %', rr; end if;
    if (duty_notify_rows(array[ex])->0->>'dup')::boolean is not true then raise exception '알림 재료 — 같은 이름의 줄이 또 있다(dup)'; end if;
    perform duty_cancel(e_dup, null, true);
    if (duty_notify_rows(array[ex])->0->>'dup')::boolean is not false then raise exception '알림 재료 — 겹친 줄을 빼면 dup 이 아니다'; end if;
    -- 오늘 자리: ended = 끝 시각(10:00 한국)이 지났나 — 지금 시각으로 견준다
    rr := duty_apply((select id from public.duty_slots where line_id = lx and on_date = t0), u[7], '{"name":"당번시험7"}', true, true); e_today := (rr->>'id')::bigint;
    if (duty_notify_rows(array[e_today])->0->>'ended')::boolean is distinct from ((now() at time zone 'Asia/Seoul')::time >= time '10:00') then
      raise exception '알림 재료 — 오늘 끝난 자리(ended): %', duty_notify_rows(array[e_today]);
    end if;

    -- 고침 검토 반영(2026-10-07) — 시각을 못 박은 틀 둘로 「끝난 자리」의 참·거짓을 매번 본다 · to-past 의 경계 · 옮기기 전 자리의 live · hadUser 갈래 · 잡기의 날짜
    for i in 1..3 loop
      insert into public.users(identity_key, type, gu, mok, name) values ('교구|당번시험|9|||고침시험' || i, '교구', '당번시험', '9', '고침시험' || i) returning id into aid;
      v := v || aid;
    end loop;
    rr := duty_line_save(bx, jsonb_build_object('service','새벽','task','','start','00:00','end','00:01','capacity',9)); le := (rr->>'id')::bigint;
    rr := duty_line_save(bx, jsonb_build_object('service','밤','task','','start','23:58','end','23:59','capacity',9)); ln := (rr->>'id')::bigint;
    if le is null or ln is null then raise exception '고침 검토 시험 준비(틀): %', rr; end if;
    perform duty_date_add(bx, t0 - 2, array[ln]); perform duty_date_add(bx, t0 - 1, array[le, ln]); perform duty_date_add(bx, t0, array[le, ln]);
    perform duty_date_add(bx, t0 + 3, array[ln]); perform duty_date_add(bx, t0 + 4, array[ln]); perform duty_date_add(bx, t0 + 5, array[ln]);
    select id into s_e0  from public.duty_slots where line_id = le and on_date = t0;
    select id into s_n0  from public.duty_slots where line_id = ln and on_date = t0;
    select id into s_ey  from public.duty_slots where line_id = le and on_date = t0 - 1;
    select id into s_ny  from public.duty_slots where line_id = ln and on_date = t0 - 1;
    select id into s_n2y from public.duty_slots where line_id = ln and on_date = t0 - 2;
    select id into s_n3  from public.duty_slots where line_id = ln and on_date = t0 + 3;
    select id into s_n4  from public.duty_slots where line_id = ln and on_date = t0 + 4;
    select id into s_n5  from public.duty_slots where line_id = ln and on_date = t0 + 5;
    if s_e0 is null or s_n0 is null or s_ey is null or s_ny is null or s_n2y is null or s_n3 is null or s_n4 is null or s_n5 is null then raise exception '고침 검토 시험 준비(자리)'; end if;
    -- ended: 오늘의 「새벽」 자리는 끝났고 「밤」 자리는 아직이다
    rr := duty_apply(s_e0, v[1], '{"name":"고침시험1"}', true, true); ea := (rr->>'id')::bigint;
    rr := duty_apply(s_n0, v[2], '{"name":"고침시험2"}', true, true); eb := (rr->>'id')::bigint;
    if ea is null or eb is null then raise exception '오늘 자리에 넣기: %', rr; end if;
    if (duty_notify_rows(array[ea])->0->>'ended')::boolean is not true then raise exception '끝난 자리(00:00~00:01)의 ended = true: %', duty_notify_rows(array[ea]); end if;
    if (duty_notify_rows(array[eb])->0->>'ended')::boolean is not false then raise exception '안 끝난 자리(23:58~23:59)의 ended = false: %', duty_notify_rows(array[eb]); end if;
    if (duty_notify_rows(array[ea])->0->>'past')::boolean is not false then raise exception '오늘 자리는 지난 날이 아니다'; end if;
    -- to-past 의 경계: 오늘 줄 → 어제 자리 = 거절 · 어제 줄 → 그제 자리 = 된다(지난 기록끼리) · 지난 날 줄의 live = false
    rr := duty_move(eb, s_ny, true); if rr->>'error' is distinct from 'to-past' then raise exception '오늘 줄 → 어제 자리(to-past): %', rr; end if;
    rr := duty_apply(s_ny, v[3], '{"name":"고침시험3"}', true, true); ec := (rr->>'id')::bigint;
    rr := duty_move(ec, s_n2y, true); if (rr->>'ok')::boolean is not true then raise exception '어제 줄 → 그제 자리는 된다(지난 기록 바로잡기): %', rr; end if;
    if (select (moved_from->>'live')::boolean from public.duty_signups where id = ec) is not false then raise exception '지난 날 줄을 옮기면 live = false'; end if;
    -- 옮기기 전 자리의 live: 앞날 줄 → 오늘 끝난 자리 = true(그분의 앞날 당번이 사라진다 — 알림이 간다) · 재료의 ended 는 옮겨 간 자리(끝남)
    rr := duty_apply(s_n3, v[3], '{"name":"고침시험3"}', true, true); ed := (rr->>'id')::bigint;
    rr := duty_move(ed, s_e0, true); if (rr->>'ok')::boolean is not true then raise exception '앞날 줄 → 오늘 끝난 자리는 된다: %', rr; end if;
    rr := duty_notify_rows(array[ed])->0;
    if (rr->>'ended')::boolean is not true or (rr->'movedFrom'->>'live')::boolean is not true or (rr->'movedFrom'->>'date')::date is distinct from t0 + 3 then
      raise exception '앞날 줄 → 오늘 끝난 자리: ended · movedFrom.live = true: %', rr; end if;
    -- 오늘 끝난 자리의 줄 → 오늘 안 끝난 자리 = false(끝난 자리를 떠났다) · 오늘 안 끝난 자리의 줄 → 오늘 끝난 자리 = true(남은 당번이 사라진다)
    rr := duty_move(ea, s_n0, true);
    if (rr->>'ok')::boolean is not true or (select (moved_from->>'live')::boolean from public.duty_signups where id = ea) is not false then raise exception '끝난 자리를 떠난 줄의 live = false: %', rr; end if;
    rr := duty_move(eb, s_e0, true);
    if (rr->>'ok')::boolean is not true or (select (moved_from->>'live')::boolean from public.duty_signups where id = eb) is not true then raise exception '안 끝난 자리를 떠난 줄의 live = true: %', rr; end if;
    -- hadUser 갈래: 계정 없는 새 줄·이미 선 줄·되살림 = false · 되살리며 계정을 이음 = true · 서 있는 계정 없는 줄에 계정을 이음(linked) = true
    rr := duty_apply(s_n4, null, '{"name":"고침시험가","ident_key":"staff|x|y|고침시험가"}', true, true); eg := (rr->>'id')::bigint;
    if (rr->>'ok')::boolean is not true or (rr->>'hadUser')::boolean is not false then raise exception '계정 없는 새 줄(hadUser false): %', rr; end if;
    rr := duty_apply(s_n4, null, '{"name":"고침시험가","ident_key":"staff|x|y|고침시험가"}', true, true);
    if (rr->>'already')::boolean is not true or (rr->>'hadUser')::boolean is not false then raise exception '이미 선 계정 없는 줄(hadUser false): %', rr; end if;
    perform duty_cancel(eg, null, true);
    rr := duty_apply(s_n4, null, '{"name":"고침시험가","ident_key":"staff|x|y|고침시험가"}', true, true);
    if (rr->>'revived')::boolean is not true or (rr->>'id')::bigint is distinct from eg or (rr->>'hadUser')::boolean is not false then raise exception '계정 없는 줄을 되살림(hadUser false): %', rr; end if;
    rr := duty_apply(s_n5, null, '{"name":"고침시험나","ident_key":"person|T-FIX-1"}', true, true); eh := (rr->>'id')::bigint;
    perform duty_cancel(eh, null, true);
    rr := duty_apply(s_n5, v[1], '{"name":"고침시험나","ident_key":"person|T-FIX-1"}', true, true);
    if (rr->>'revived')::boolean is not true or (rr->>'id')::bigint is distinct from eh or (rr->>'hadUser')::boolean is not true then raise exception '되살리며 계정을 이음(hadUser true): %', rr; end if;
    if (select user_id from public.duty_signups where id = eh) is distinct from v[1] then raise exception '되살린 줄에 계정이 이어졌다'; end if;
    rr := duty_apply(s_n5, v[1], '{"name":"고침시험나","ident_key":"person|T-FIX-1"}', true, true);
    if (rr->>'already')::boolean is not true or (rr->>'hadUser')::boolean is not true or (rr ? 'linked') then raise exception '이미 선 계정 줄(hadUser true · linked 아님): %', rr; end if;
    rr := duty_apply(s_n4, null, '{"name":"고침시험다","ident_key":"person|T-FIX-2"}', true, true); ei := (rr->>'id')::bigint;
    rr := duty_apply(s_n4, v[2], '{"name":"고침시험다","ident_key":"person|T-FIX-2"}', true, true);
    if (rr->>'already')::boolean is not true or (rr->>'linked')::boolean is not true or (rr->>'hadUser')::boolean is not true or (rr->>'id')::bigint is distinct from ei then
      raise exception '서 있는 계정 없는 줄에 계정을 이음(linked · hadUser true): %', rr; end if;
    -- 잡기의 날짜(전날 알림): 날짜가 다르면 안 잡는다 · 옮긴 뒤 옛 날짜로는 안 잡힌다(새 날짜로는 잡힌다) · 날짜를 안 주면 보지 않는다(확정) · 함수는 한 꼴뿐
    rr := duty_apply(s_n3, v[2], '{"name":"고침시험2"}', true, true); ej := (rr->>'id')::bigint;
    if ej is null then raise exception '잡기 시험 준비: %', rr; end if;
    if cardinality(duty_notify_claim('remind', array[ej], t0 + 4)) is distinct from 0 then raise exception '날짜가 다른 줄은 잡지 않는다'; end if;
    if exists (select 1 from public.duty_notify_log where signup_id = ej) then raise exception '안 잡은 줄에 기록이 남지 않는다'; end if;
    rr := duty_move(ej, s_n5, true); if (rr->>'ok')::boolean is not true then raise exception '옮기기(잡기 시험): %', rr; end if;
    if cardinality(duty_notify_claim('remind', array[ej], t0 + 3)) is distinct from 0 then raise exception '옮긴 뒤 옛 날짜로는 잡히지 않는다'; end if;
    if cardinality(duty_notify_claim('remind', array[ej], t0 + 5)) is distinct from 1 then raise exception '새 날짜로는 잡힌다'; end if;
    if cardinality(duty_notify_claim('remind', array[ej], t0 + 5)) is distinct from 0 then raise exception '같은 알림은 한 번(날짜를 줘도)'; end if;
    if cardinality(duty_notify_claim('confirmed', array[ej])) is distinct from 1 then raise exception '날짜를 안 주면 보지 않는다(확정)'; end if;
    if (select count(*) from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace where ns.nspname = 'public' and p.proname = 'duty_notify_claim') is distinct from 1 then
      raise exception '잡기 함수는 한 꼴뿐이어야 한다(옛 꼴이 남으면 이름으로 부를 때 못 고른다)'; end if;
  end;

  -- ── 자리 틀 고치기 · 빼기 ──
  r := duty_line_save(b, jsonb_build_object('id',l1,'service','1부 예배','task','설거지','start','09:00','end','10:00','capacity',2,'weekday',wd));
  if (r->>'ok')::boolean is not true then raise exception '틀 이름 고치기: %', r; end if;
  if (duty_roster(b, d2, d2)->'days'->0->'slots'->0->>'service') is distinct from '1부 예배' then raise exception '이름은 그 틀의 모든 자리에 보인다'; end if;
  r := duty_line_save(b, jsonb_build_object('id',l2,'service','2부','task','설거지','start','11:00','end','12:00','capacity',4,'weekday',wd,'sort',1), true);
  if (r->>'updated')::int is distinct from 8 then raise exception '앞날 자리 정원도(8): %', r; end if;
  r := duty_line_save(b, jsonb_build_object('id',l5,'service','사이','task','','start','10:00','end','11:00','capacity',1,'weekday',(wd + 1) % 7));
  if (r->>'kept')::int is distinct from 1 or (r->>'made')::int < 7 then raise exception '요일 바꾸기(지원 있는 자리 1 남김): %', r; end if;
  -- 남은 자리(요일을 바꿔 옛 요일에 남은 자리)는 본인의 새 지원을 받지 않는다 — 명단에는 보이고 담당자는 넣는다 · 요일을 되돌리면 다시 받는다
  r := duty_apply(s5, u[4], '{"name":"당번시험4"}'); if r->>'error' is distinct from 'closed' then raise exception '남은 자리(요일 바꿈) 본인 지원: %', r; end if;
  if (select sl->>'why' from jsonb_array_elements(duty_board_view(b, u[4])->'days') dd, jsonb_array_elements(dd->'slots') sl where (sl->>'id')::bigint = s5) is distinct from 'closed' then raise exception '앱 보기의 남은 자리 = closed'; end if;
  if (select (sl->>'leftover')::boolean from jsonb_array_elements(duty_roster(b, d2, d2)->'days'->0->'slots') sl where (sl->>'id')::bigint = s5) is not true then raise exception '명단의 남은 자리 표시'; end if;
  if (select (sl->>'leftover')::boolean from jsonb_array_elements(duty_roster(b, d2, d2)->'days'->0->'slots') sl where (sl->>'id')::bigint = s2) is not false then raise exception '살아 있는 자리는 남은 자리가 아니다'; end if;
  r := duty_apply(s5, u[4], '{"name":"당번시험4"}', true, true); if (r->>'ok')::boolean is not true then raise exception '남은 자리 · 담당자 넣기: %', r; end if;
  r := duty_cancel((r->>'id')::bigint, null, true); if (r->>'ok')::boolean is not true then raise exception '남은 자리 · 담당자 빼기: %', r; end if;
  r := duty_line_save(b, jsonb_build_object('id',l5,'service','사이','task','','start','10:00','end','11:00','capacity',1,'weekday',wd));
  if (r->>'ok')::boolean is not true then raise exception '요일 되돌리기: %', r; end if;
  r := duty_apply(s5, u[6], '{"name":"당번시험6"}'); if r->>'error' is distinct from 'full' then raise exception '요일을 되돌리면 다시 살아 있는 자리(정원 1 이 차 있어 full): %', r; end if;
  r := duty_line_save(b, jsonb_build_object('service','임시','task','','start','15:00','end','16:00','capacity',1,'weekday',wd));
  r := duty_line_remove((r->>'id')::bigint); if (r->>'deleted')::boolean is not true then raise exception '지원 줄이 없는 틀 빼기 = 지움: %', r; end if;
  r := duty_line_remove(l3); if (r->>'deleted')::boolean is not false or (r->>'kept')::int is distinct from 1 then raise exception '뺀 줄이라도 지원 줄이 있던 자리는 남긴다: %', r; end if;
  -- 뺀 틀의 남은 자리 — 빈 자리가 있어도 본인 지원은 closed · 「사람이 더 필요한 날」에서도 빠진다 · 담당자는 넣을 수 있다
  r := duty_apply(s3, u[6], '{"name":"당번시험6"}'); if r->>'error' is distinct from 'closed' then raise exception '뺀 틀의 남은 자리 본인 지원: %', r; end if;
  n := (duty_roster(b, d2, d2)->'days'->0->>'need')::int;
  r := duty_apply(s3, u[6], '{"name":"당번시험6"}', true); if (r->>'ok')::boolean is not true then raise exception '뺀 틀의 남은 자리 · 담당자 넣기: %', r; end if;
  if (duty_roster(b, d2, d2)->'days'->0->>'need')::int is distinct from n then raise exception '남은 자리는 빈 자리 수에 안 든다(넣어도 그대로)'; end if;
  r := duty_cancel((r->>'id')::bigint, null, true); if (r->>'ok')::boolean is not true then raise exception '뺀 틀의 남은 자리 · 담당자 빼기: %', r; end if;
  r := duty_line_remove(l1); if (r->>'deleted')::boolean is not false or (r->>'kept')::int < 1 then raise exception '지원 있는 틀 빼기 = 남김: %', r; end if;
  if (select active from public.duty_lines where id = l1) is not false then raise exception '뺀 틀은 active=false'; end if;
  n := (select count(*) from public.duty_slots where line_id = l1);
  perform duty_ensure_slots(b);
  if (select count(*) from public.duty_slots where line_id = l1) is distinct from n then raise exception '뺀 틀은 자리가 다시 안 생긴다'; end if;
  r := duty_line_remove(l1); if r->>'error' is distinct from 'not-found' then raise exception '두 번 빼기: %', r; end if;
  r := duty_line_save(b, jsonb_build_object('service','1부 예배','task','설거지','start','09:00','end','10:00','capacity',2,'weekday',wd));
  if (r->>'ok')::boolean is not true then raise exception '뺀 틀과 같은 이름으로 새 틀: %', r; end if;

  -- ── 당번 상태 ──
  update public.duty_boards set status = 'closed' where id = b;
  r := duty_apply(s2b, u[4], '{"name":"당번시험4"}'); if r->>'error' is distinct from 'closed' then raise exception '지원 멈춤: %', r; end if;
  r := duty_apply(s2b, u[4], '{"name":"당번시험4"}', true); if (r->>'ok')::boolean is not true then raise exception '지원 멈춤 · 담당자 넣기: %', r; end if;
  if (duty_board_view(b, u[4])->>'ok')::boolean is not true then raise exception '지원 멈춤 당번은 앱에 보인다'; end if;
  if exists (select 1 from jsonb_array_elements(duty_board_view(b, u[5])->'days') d, jsonb_array_elements(d->'slots') s where s->>'why' = '') then raise exception '지원 멈춤 당번엔 지원할 자리가 없다'; end if;
  update public.duty_boards set status = 'draft' where id = b;
  r := duty_apply(s2b, u[5], '{"name":"당번시험5"}'); if r->>'error' is distinct from 'not-found' then raise exception '준비 중: %', r; end if;
  if duty_board_view(b, u[1])->>'error' is distinct from 'not-found' then raise exception '준비 중 당번은 앱에 없다'; end if;
  if duty_mine(u[1]) is distinct from '[]'::jsonb and exists (select 1 from jsonb_array_elements(duty_mine(u[1])) m where m->>'boardId' = b::text) then raise exception '준비 중 당번의 줄은 내 당번에 없다'; end if;
  r := duty_apply(s2b, u[5], '{"name":"당번시험5"}', true); if (r->>'ok')::boolean is not true then raise exception '준비 중 · 담당자 넣기: %', r; end if;
  update public.duty_boards set status = 'archived' where id = b;
  r := duty_apply(s2b, u[6], '{"name":"당번시험6"}', true); if r->>'error' is distinct from 'archived' then raise exception '보관 · 넣기: %', r; end if;
  r := duty_day_set(b, d9, 'confirm'); if r->>'error' is distinct from 'archived' then raise exception '보관 · 확정: %', r; end if;
  r := duty_line_save(b, jsonb_build_object('service','보관','task','','start','09:00','end','10:00','capacity',1)); if r->>'error' is distinct from 'archived' then raise exception '보관 · 틀: %', r; end if;
  if duty_ensure_slots(b) is distinct from 0 then raise exception '보관 당번은 자리를 만들지 않는다'; end if;

  -- ── 끝 날짜 ──
  insert into public.duty_boards(title, status, until_date) values ('[시험] 끝 날짜', 'open', t0 + 10) returning id into b2;
  r := duty_line_save(b2, jsonb_build_object('service','1부','task','','start','09:00','end','10:00','capacity',1,'weekday',wd));
  if (r->>'made')::int is distinct from 2 then raise exception '끝 날짜까지만(+2 · +9): %', r; end if;
  -- 끝 날짜를 당기면: 그 뒤 자리는 앱에 안 보이고 지원도 안 받는다(자리·줄은 지우지 않는다) · 그 뒤에 선 분은 내 당번·명단에 그대로 · 다시 늦추면 살아난다
  sx := (select id from public.duty_slots where board_id = b2 and on_date = d9);
  r := duty_apply(sx, u[6], '{"name":"당번시험6"}'); if (r->>'ok')::boolean is not true then raise exception '끝 날짜 앞 지원: %', r; end if;
  update public.duty_boards set until_date = t0 + 5 where id = b2;
  if jsonb_array_length(duty_board_view(b2, u[5])->'days') is distinct from 1 then raise exception '끝 날짜 뒤 날은 앱에 안 보인다: %', duty_board_view(b2, u[5])->'days'; end if;
  r := duty_apply(sx, u[5], '{"name":"당번시험5"}'); if r->>'error' is distinct from 'after-until' then raise exception '끝 날짜 뒤 지원: %', r; end if;
  r := duty_apply(sx, u[5], '{"name":"당번시험5"}', true, true); if (r->>'ok')::boolean is not true then raise exception '끝 날짜 뒤 · 담당자 넣기: %', r; end if;
  if (duty_board_counts(array[b2])->(b2::text)->>'after')::int is distinct from 2 then raise exception '끝 날짜 뒤에 선 분 수: %', duty_board_counts(array[b2]); end if;
  if (duty_board_counts(array[b2])->(b2::text)->>'slots')::int is distinct from 1 then raise exception '자리 수는 끝 날짜까지만: %', duty_board_counts(array[b2]); end if;
  if not exists (select 1 from jsonb_array_elements(duty_mine(u[6])) m where m->>'boardId' = b2::text and m->>'date' = d9::text) then raise exception '끝 날짜 뒤 내 줄은 내 당번에 그대로'; end if;
  if (select (dd->>'afterUntil')::boolean from jsonb_array_elements(duty_roster(b2)->'days') dd where dd->>'date' = d9::text) is not true then raise exception '명단의 끝 날짜 뒤 표시'; end if;
  if (select (dd->>'afterUntil')::boolean from jsonb_array_elements(duty_roster(b2)->'days') dd where dd->>'date' = d2::text) is not false then raise exception '끝 날짜 앞 날은 표시 없음'; end if;
  r := duty_date_add(b2, t0 + 7, array[(select id from public.duty_lines where board_id = b2 limit 1)]);
  if r->>'error' is distinct from 'after-until' then raise exception '끝 날짜 뒤 날짜 더하기: %', r; end if;
  if jsonb_array_length((select x->'need' from jsonb_array_elements(duty_list_view(u[5])->'boards') x where x->>'id' = b2::text)) is distinct from 1 then raise exception '목록의 필요한 날도 끝 날짜까지만'; end if;
  update public.duty_boards set until_date = t0 + 10 where id = b2;
  if jsonb_array_length(duty_board_view(b2, u[5])->'days') is distinct from 2 then raise exception '끝 날짜를 늦추면 그대로 살아난다'; end if;
  if (duty_board_counts(array[b2])->(b2::text)->>'after')::int is distinct from 0 then raise exception '늦춘 뒤 after 0'; end if;
  -- shown = 앱 당번표가 보여 주는 기간의 자리 수(duty_board_view 와 같은 범위) — 보이는 기간을 줄이면 slots 는 그대로이고 shown 만 준다
  if (duty_board_counts(array[b2])->(b2::text)->>'shown')::int is distinct from 2 then raise exception '보이는 자리 수(둘 다 보이는 기간 안): %', duty_board_counts(array[b2]); end if;
  update public.duty_boards set open_days = 7 where id = b2;
  if (duty_board_counts(array[b2])->(b2::text)->>'slots')::int is distinct from 2 or (duty_board_counts(array[b2])->(b2::text)->>'shown')::int is distinct from 1
    then raise exception '보이는 기간을 줄이면 slots 2 · shown 1: %', duty_board_counts(array[b2]); end if;
  if jsonb_array_length(duty_board_view(b2, u[5])->'days') is distinct from 1 then raise exception 'shown 은 앱이 보여 주는 날과 같은 범위다: %', duty_board_view(b2, u[5])->'days'; end if;
  update public.duty_boards set open_days = 56 where id = b2;
  if (duty_board_counts(array[b2])->(b2::text)->>'shown')::int is distinct from 2 then raise exception '보이는 기간을 되돌리면 shown 2'; end if;

  -- ── 확정·메모: 자리 없는 날은 확정하지 않는다 · 풀기·빈 메모는 날짜 줄을 만들지 않는다 ──
  r := duty_day_set(b2, t0 + 3, 'confirm'); if r->>'error' is distinct from 'no-slots' then raise exception '자리 없는 날 확정: %', r; end if;
  r := duty_day_set(b2, t0 + 3, 'unconfirm'); if (r->>'already')::boolean is not true then raise exception '날짜 줄 없는 날 풀기: %', r; end if;
  r := duty_day_set(b2, t0 + 3, 'note', null, ''); if (r->>'already')::boolean is not true then raise exception '날짜 줄 없는 날 빈 메모: %', r; end if;
  if exists (select 1 from public.duty_days where board_id = b2 and on_date = t0 + 3) then raise exception '풀기·빈 메모가 날짜 줄을 만들었다'; end if;
  r := duty_day_set(b2, t0 + 3, 'note', null, '특별 예배'); if (r->>'ok')::boolean is not true or r ? 'already' then raise exception '메모 적기: %', r; end if;
  if (select note from public.duty_days where board_id = b2 and on_date = t0 + 3) is distinct from '특별 예배' then raise exception '메모가 날짜 줄을 만든다'; end if;
  r := duty_day_set(b2, t0 + 900, 'note', null, '먼 날'); if r->>'error' is distinct from 'bad-date' then raise exception '먼 날짜 메모: %', r; end if;
  insert into public.duty_days(board_id, on_date, note) values (b2, t0 - 40, '옛 메모');
  r := duty_day_set(b2, t0 - 40, 'note', null, '');
  if (r->>'ok')::boolean is not true or (select note from public.duty_days where board_id = b2 and on_date = t0 - 40) is distinct from '' then raise exception '오래된 날이어도 이미 있는 날짜 줄의 메모는 지운다: %', r; end if;
  r := duty_day_set(b2, t0 - 41, 'note', null, '새 메모'); if r->>'error' is distinct from 'bad-date' then raise exception '오래된 날에 날짜 줄을 새로 만들지는 않는다: %', r; end if;

  -- ── 명단: 보이는 기간 밖에 미리 만든 날도 담당자에게 보인다(notYet) ──
  insert into public.duty_boards(title, status, open_days) values ('[시험] 겹침 가', 'open', 14) returning id into b3;
  r := duty_line_save(b3, jsonb_build_object('service','가','task','','start','09:00','end','10:00','capacity',2)); la := (r->>'id')::bigint;
  r := duty_line_save(b3, jsonb_build_object('service','다','task','','start','13:00','end','14:00','capacity',1)); lc := (r->>'id')::bigint;
  r := duty_date_add(b3, d16, array[la, lc]); if (r->>'made')::int is distinct from 2 or (r->>'reopened')::int is distinct from 0 then raise exception '기간 밖 날짜 더하기: %', r; end if;
  if (select manual from public.duty_slots where line_id = la and on_date = d16) is not true then raise exception '날짜 더하기로 만든 자리는 manual'; end if;
  r := duty_roster(b3);
  if r->>'to' is distinct from d16::text or jsonb_array_length(r->'days') is distinct from 1 or (r->'days'->0->>'notYet')::boolean is not true then
    raise exception '보이는 기간(14일) 밖 +16 의 자리가 명단에 보인다: to % · %', r->>'to', left((r->'days')::text, 200); end if;
  if jsonb_array_length(duty_board_view(b3, u[1])->'days') is distinct from 0 then raise exception '앱에는 보이는 기간 밖 날이 안 보인다'; end if;
  -- 먼 앞날(+395)에 날짜 줄이 있어도 지난 날을 그대로 읽는다 — 끝을 안 주면 앞날(오늘+400)과 지난 날(오늘−400)을 따로 자른다(검토 반영)
  r := duty_date_add(b3, t0 + 395, array[la]); if (r->>'made')::int is distinct from 1 then raise exception '먼 날짜 더하기: %', r; end if;
  r := duty_roster(b3, t0 - 14);
  if r->>'from' is distinct from (t0 - 14)::text or r->>'to' is distinct from (t0 + 395)::text then raise exception '먼 앞날이 있어도 지난 14일을 읽는다: % ~ %', r->>'from', r->>'to'; end if;
  r := duty_roster(b3, t0 - 900); if r->>'from' is distinct from (t0 - 400)::text then raise exception '지난 날은 400일까지: %', r->>'from'; end if;
  if duty_roster(b3, t0 + 500)->>'error' is distinct from 'bad-range' then raise exception '앞이 끝보다 늦으면 bad-range'; end if;
  if (duty_roster(b3)->'board'->>'updatedAt') is null then raise exception '명단의 당번에 updatedAt'; end if;
  delete from public.duty_slots where line_id = la and on_date = t0 + 395; delete from public.duty_days where board_id = b3 and on_date = t0 + 395;
  update public.duty_boards set open_days = 56 where id = b3;
  select id into sa from public.duty_slots where line_id = la and on_date = d16;
  select id into sc from public.duty_slots where line_id = lc and on_date = d16;

  -- ── 나중에 생긴 겹침(쉼을 풀어서)은 명단·내 당번에 표시로 보인다 ──
  insert into public.duty_boards(title, status) values ('[시험] 겹침 나', 'open') returning id into b4;
  r := duty_line_save(b4, jsonb_build_object('service','나','task','','start','09:30','end','10:30','capacity',2)); lb := (r->>'id')::bigint;
  perform duty_date_add(b4, d16, array[lb]);
  select id into sb from public.duty_slots where line_id = lb and on_date = d16;
  r := duty_apply(sa, u[3], '{"name":"당번시험3"}'); if (r->>'ok')::boolean is not true then raise exception '겹침 준비(가): %', r; end if;
  r := duty_apply(sb, u[3], '{"name":"당번시험3"}'); if r->>'error' is distinct from 'overlap' or (r->'with'->>'same_board')::boolean is not false then raise exception '다른 당번과 겹침: %', r; end if;
  r := duty_slot_set(sa, null, true, 1); if (r->>'off')::boolean is not true then raise exception '가 자리 쉼: %', r; end if;
  r := duty_apply(sb, u[3], '{"name":"당번시험3"}'); if (r->>'ok')::boolean is not true then raise exception '쉬는 자리는 겹침에서 빠진다: %', r; end if;
  -- 내 당번 — 자리만 쉬면 off 는 참이고 dayOff 는 거짓 · 그날이 쉬면 둘 다 참(화면이 「이 자리는 쉬어요」와 「이날은 쉬어요」를 가른다)
  if (select (m->>'off')::boolean and not (m->>'dayOff')::boolean from jsonb_array_elements(duty_mine(u[3])) m
       where (m->>'id')::bigint = (select id from public.duty_signups where slot_id = sa and user_id = u[3])) is not true then
    raise exception '내 당번 — 자리만 쉼(off · dayOff 아님): %', duty_mine(u[3]);
  end if;
  update public.duty_days set off = true where board_id = b3 and on_date = d16;
  if (select (m->>'off')::boolean and (m->>'dayOff')::boolean from jsonb_array_elements(duty_mine(u[3])) m
       where (m->>'id')::bigint = (select id from public.duty_signups where slot_id = sa and user_id = u[3])) is not true then
    raise exception '내 당번 — 그날이 쉼(off · dayOff): %', duty_mine(u[3]);
  end if;
  update public.duty_days set off = false where board_id = b3 and on_date = d16;
  if (duty_roster(b4, d16, d16)->'days'->0->'slots'->0->'signups'->0->>'overlap')::boolean is not false then raise exception '쉬는 동안에는 겹침 표시 없음'; end if;
  r := duty_slot_set(sa, null, false); if (r->>'off')::boolean is not false then raise exception '가 자리 다시 열기: %', r; end if;
  if (duty_roster(b4, d16, d16)->'days'->0->'slots'->0->'signups'->0->>'overlap')::boolean is not true then raise exception '쉼을 풀어 생긴 겹침 — 명단 표시(나)'; end if;
  if (select (x->>'overlap')::boolean from jsonb_array_elements(duty_roster(b3, d16, d16)->'days'->0->'slots') sl, jsonb_array_elements(sl->'signups') x where x->>'name' = '당번시험3') is not true then raise exception '쉼을 풀어 생긴 겹침 — 명단 표시(가)'; end if;
  if (select count(*) from jsonb_array_elements(duty_mine(u[3])) m where m->>'date' = d16::text and (m->>'overlap')::boolean) is distinct from 2 then raise exception '내 당번의 겹침 표시 둘: %', duty_mine(u[3]); end if;
  if exists (select 1 from jsonb_array_elements(duty_mine(u[6])) m where (m->>'overlap')::boolean) then raise exception '겹치지 않는 분은 표시 없음'; end if;

  -- ── 되살리기: 빠진 줄을 그 줄 그대로(넣은 곳은 그대로 · 정원·겹침은 담당자 넘기기) ──
  r := duty_apply(sc, u[4], '{"name":"당번시험4"}'); if (r->>'ok')::boolean is not true then raise exception '되살리기 준비: %', r; end if; er := (r->>'id')::bigint;
  perform duty_notify_claim('confirmed', array[er]);
  r := duty_cancel(er, null, true); if (r->>'ok')::boolean is not true then raise exception '담당자가 뺌: %', r; end if;
  r := duty_apply(sc, u[4], '{"name":"당번시험4"}'); if r->>'error' is distinct from 'removed-by-staff' then raise exception '뺀 분의 본인 재지원: %', r; end if;
  r := duty_restore(er);
  if (r->>'ok')::boolean is not true or (r->>'id')::bigint is distinct from er or (r->>'hadUser')::boolean is not true or r->>'date' is distinct from d16::text then raise exception '되살리기: %', r; end if;
  if (select status || '/' || source || '/' || coalesce(end_reason, '-') from public.duty_signups where id = er) is distinct from 'active/app/-' then raise exception '되살린 줄 — 살아 있고 넣은 곳은 그대로(app)'; end if;
  if exists (select 1 from public.duty_notify_log where signup_id = er) then raise exception '되살리면 예전 알림 기록을 지운다'; end if;
  r := duty_restore(er); if (r->>'already')::boolean is not true then raise exception '이미 살아 있는 줄 되살리기: %', r; end if;
  r := duty_cancel(er, u[4], false); if (r->>'ok')::boolean is not true then raise exception '되살린 뒤 본인 취소(앱으로 지원했던 줄): %', r; end if;
  r := duty_apply(sc, u[7], '{"name":"당번시험7"}'); if (r->>'ok')::boolean is not true then raise exception '빈 자리에 다른 분: %', r; end if;
  r := duty_restore(er); if r->>'error' is distinct from 'full' or (r->>'capacity')::int is distinct from 1 then raise exception '찬 자리로 되살리기: %', r; end if;
  r := duty_restore(er, true); if (r->>'ok')::boolean is not true then raise exception '정원을 넘겨 되살리기(본인 취소한 줄도): %', r; end if;
  r := duty_cancel(er, null, true);
  r := duty_slot_set(sc, null, true, 1); if (r->>'off')::boolean is not true then raise exception '다 자리 쉼: %', r; end if;
  r := duty_restore(er); if r->>'error' is distinct from 'off' then raise exception '쉬는 자리로 되살리기: %', r; end if;
  r := duty_restore(-1); if r->>'error' is distinct from 'not-found' then raise exception '없는 줄 되살리기: %', r; end if;
  -- 겹치는 자리가 있으면 되살리기도 overlap(넘기기 전) — u[3] 을 가 자리에서 뺐다가, 나 자리에 서 있는 채로 되살린다
  er := (select id from public.duty_signups where slot_id = sa and user_id = u[3]);
  r := duty_cancel(er, null, true);
  r := duty_restore(er); if r->>'error' is distinct from 'overlap' or (r->'with'->>'same_board')::boolean is not false then raise exception '겹치는 자리로 되살리기: %', r; end if;

  -- ── 날짜를 옮기면 확정 알림 기록도 지운다(새 날짜를 확정할 때 그분께도 가게) · 같은 날 안에서 옮기면 남긴다 ──
  er := (select id from public.duty_signups where slot_id = sb and user_id = u[3]);
  perform duty_notify_claim('confirmed', array[er]);
  r := duty_line_save(b4, jsonb_build_object('service','라','task','','start','15:00','end','16:00','capacity',2)); lc := (r->>'id')::bigint;
  perform duty_date_add(b4, d16, array[lc]); perform duty_date_add(b4, d9, array[lc]);
  r := duty_move(er, (select id from public.duty_slots where line_id = lc and on_date = d16)); if (r->>'ok')::boolean is not true then raise exception '같은 날 옮기기: %', r; end if;
  if not exists (select 1 from public.duty_notify_log where signup_id = er and kind = 'confirmed') then raise exception '같은 날 안에서 옮기면 확정 알림 기록은 남는다'; end if;
  r := duty_move(er, (select id from public.duty_slots where line_id = lc and on_date = d9)); if (r->>'ok')::boolean is not true then raise exception '다른 날로 옮기기: %', r; end if;
  if exists (select 1 from public.duty_notify_log where signup_id = er) then raise exception '다른 날로 옮기면 알림 기록을 모두 지운다'; end if;

  -- ── 자리 틀은 한 당번에 40개까지 ──
  for i in 1..38 loop
    r := duty_line_save(b3, jsonb_build_object('service','틀' || i,'task','','start','06:00','end','06:30','capacity',1));
    if (r->>'ok')::boolean is not true then raise exception '틀 % 넣기: %', i, r; end if;
  end loop;
  r := duty_line_save(b3, jsonb_build_object('service','틀41','task','','start','06:00','end','06:30','capacity',1));
  if r->>'error' is distinct from 'too-many-lines' then raise exception '틀 41개째: %', r; end if;
  r := duty_line_save(b3, jsonb_build_object('id',la,'service','가','task','','start','09:00','end','10:00','capacity',3)); if (r->>'ok')::boolean is not true then raise exception '40개여도 고치기는 된다: %', r; end if;

  -- ── 같은 교인의 「계정 없는 줄」과 「계정 줄」 — 명부 키(person|교인ID)가 같으면 같은 분(이미 선 줄 · 겹침 · 되살림 · 옮기기) ──
  r := duty_apply(sa, null, '{"name":"가상명부","who_type":"교구","ident_key":"person|7001"}', true);
  if (r->>'ok')::boolean is not true then raise exception '명부에서 넣기(계정 없음): %', r; end if; er := (r->>'id')::bigint;
  r := duty_apply(sa, u[6], '{"name":"가상명부","who_type":"교구","ident_key":"person|7001"}', true);
  if (r->>'already')::boolean is not true or (r->>'id')::bigint is distinct from er or (r->>'linked')::boolean is not true then raise exception '같은 분을 이번에는 계정까지 찾아 넣음 = 이미 서 계세요 + 계정을 이었다(linked): %', r; end if;
  r := duty_apply(sa, u[6], '{"name":"가상명부","who_type":"교구","ident_key":"person|7001"}', true);
  if (r->>'already')::boolean is not true or r ? 'linked' then raise exception '이미 이은 줄을 다시 넣으면 쓴 것이 없다(linked 없음): %', r; end if;
  if (select user_id from public.duty_signups where id = er) is distinct from u[6] then raise exception '그 줄에 앱 계정을 잇는다'; end if;
  if (select count(*) from public.duty_signups where slot_id = sa and status = 'active' and (user_id = u[6] or ident_key = 'person|7001')) is distinct from 1 then raise exception '한 분은 한 줄'; end if;
  r := duty_apply(sa, null, '{"name":"가상명부","ident_key":"person|7001"}', true);
  if (r->>'already')::boolean is not true or (r->>'id')::bigint is distinct from er or r ? 'linked' then raise exception '계정 줄로 서 있는 분을 계정 없이 다시 넣어도 이미 서 계세요: %', r; end if;
  r := duty_apply(sb, null, '{"name":"가상명부","ident_key":"person|7001"}', true);
  if r->>'error' is distinct from 'overlap' or (r->'with'->>'same_board')::boolean is not false then raise exception '겹침도 명부 키로 본다: %', r; end if;
  r := duty_apply(sb, u[6], '{"name":"당번시험6"}'); if r->>'error' is distinct from 'overlap' then raise exception '이은 계정으로 본인이 겹치는 자리에 지원: %', r; end if;
  perform duty_cancel(er, null, true);
  r := duty_apply(sa, null, '{"name":"가상명부","ident_key":"person|7001"}', true);
  if (r->>'revived')::boolean is not true or (r->>'id')::bigint is distinct from er then raise exception '뺀 뒤 계정 없이 다시 넣으면 그 줄을 되살린다: %', r; end if;
  if (r->>'hadUser')::boolean is not true then raise exception '계정을 못 맞춘 채 되살려도 그 줄의 계정은 그대로다 — hadUser(알림은 그 계정으로 간다): %', r; end if;
  if (select user_id from public.duty_signups where id = er) is distinct from u[6] then raise exception '되살려도 이어 둔 계정은 그대로'; end if;
  -- 옮기기·되살리기 — 옮길 자리에 같은 분(명부 키)의 살아 있는 줄이 있으면 already-there
  r := duty_slot_set(sc, null, false); if (r->>'off')::boolean is not false then raise exception '다 자리 다시 열기: %', r; end if;
  r := duty_apply(sc, u[5], '{"name":"가상둘","ident_key":"person|7002"}', true, true); if (r->>'ok')::boolean is not true then raise exception '다 자리에 계정 줄(명부 키): %', r; end if;
  r := duty_apply(sa, null, '{"name":"가상둘","ident_key":"person|7002"}', true); if (r->>'ok')::boolean is not true or r ? 'already' then raise exception '같은 분 · 안 겹치는 다른 자리: %', r; end if;
  n := (r->>'id')::int;
  r := duty_move(n, sc, true); if r->>'error' is distinct from 'already-there' then raise exception '옮길 자리에 같은 분(명부 키)이 이미: %', r; end if;
  perform duty_cancel(n, null, true);
  r := duty_apply(sa, u[5], '{"name":"가상둘","ident_key":"person|7002"}', true);
  if (r->>'revived')::boolean is not true or (r->>'id')::int is distinct from n or (select user_id from public.duty_signups where id = n) is distinct from u[5] then raise exception '계정 없는 끝난 줄을 계정으로 되살리며 잇는다: %', r; end if;
  -- 끝 날짜를 당기기 전에 묻는 수 — 그 날짜 뒤에(오늘 이후) 살아 있는 지원
  if duty_after_count(b3, t0 + 10) is distinct from 4 then raise exception '끝 날짜 뒤에 선 분 수(+16 에 넷): %', duty_after_count(b3, t0 + 10); end if;
  if duty_after_count(b3, d16) is distinct from 0 or duty_after_count(b3, null) is distinct from 0 then raise exception '그날까지면 0 · 날짜 없음 0'; end if;

  -- ── 담당자 메모는 함수로(지원 줄을 쓰므로 전역 잠금 먼저) — 500자 · '' 로 지움 · 없는 줄 · 보관 당번 ──
  r := duty_note_set(er, '전화로 받음'); if (r->>'ok')::boolean is not true or (select staff_note from public.duty_signups where id = er) is distinct from '전화로 받음' then raise exception '메모 쓰기: %', r; end if;
  r := duty_note_set(er, ''); if (r->>'ok')::boolean is not true or (select staff_note from public.duty_signups where id = er) is distinct from '' then raise exception '메모 지우기: %', r; end if;
  r := duty_note_set(er, null); if (r->>'ok')::boolean is not true then raise exception '메모 null = 지움: %', r; end if;
  r := duty_note_set(er, repeat('가', 501)); if r->>'error' is distinct from 'too-long' then raise exception '긴 메모: %', r; end if;
  r := duty_note_set(-1, 'x'); if r->>'error' is distinct from 'not-found' then raise exception '없는 줄 메모: %', r; end if;

  -- ── 날짜를 골라 더한 자리(manual)는 요일을 바꿔도 지우지 않는다 · 남은 자리는 「날짜 더하기」로 다시 살린다(reopened) ──
  r := duty_line_save(b4, jsonb_build_object('service','마','task','','start','18:00','end','19:00','capacity',1,'weekday',extract(dow from t0 + 3)::int)); lb := (r->>'id')::bigint;
  if (r->>'made')::int < 7 then raise exception '마 틀 자리: %', r; end if;
  r := duty_date_add(b4, t0 + 143, array[lb]); if (r->>'made')::int is distinct from 1 then raise exception '보이는 기간 밖 같은 요일에 날짜로 더하기: %', r; end if;
  select id into sb from public.duty_slots where line_id = lb and on_date = t0 + 3;
  r := duty_apply(sb, u[7], '{"name":"당번시험7"}'); if (r->>'ok')::boolean is not true then raise exception '마 자리 지원: %', r; end if;
  r := duty_line_save(b4, jsonb_build_object('id',lb,'service','마','task','','start','18:00','end','19:00','capacity',1,'weekday',extract(dow from t0 + 4)::int));
  if (r->>'kept')::int is distinct from 1 then raise exception '요일 바꾸기 — 지원 있는 옛 요일 자리 하나만 남긴 수로 센다(manual 은 세지 않는다): %', r; end if;
  if not exists (select 1 from public.duty_slots where line_id = lb and on_date = t0 + 143 and manual) then raise exception '날짜를 골라 더한 자리는 요일을 바꿔도 지우지 않는다'; end if;
  if exists (select 1 from public.duty_slots where line_id = lb and on_date = t0 + 10) then raise exception '옛 요일의 빈 자리(저절로 생긴 것)는 지운다'; end if;
  r := duty_apply(sb, u[6], '{"name":"당번시험6"}'); if r->>'error' is distinct from 'closed' then raise exception '남은 자리 본인 지원 = closed: %', r; end if;
  r := duty_date_add(b4, t0 + 3, array[lb]);
  if (r->>'made')::int is distinct from 0 or (r->>'reopened')::int is distinct from 1 or (r->>'existed')::int is distinct from 0 then raise exception '남은 자리를 날짜 더하기로 다시 살린다: %', r; end if;
  if (select manual from public.duty_slots where id = sb) is not true then raise exception '다시 살린 자리는 manual'; end if;
  r := duty_apply(sb, u[6], '{"name":"당번시험6"}'); if r->>'error' is distinct from 'full' then raise exception '다시 살린 자리는 본인 지원을 받는다(정원 1 이 차 있어 full): %', r; end if;
  r := duty_date_add(b4, t0 + 3, array[lb]);
  if (r->>'made')::int is distinct from 0 or (r->>'reopened')::int is distinct from 0 or (r->>'existed')::int is distinct from 1 then raise exception '이미 살린 자리 다시 더하기 = 그대로: %', r; end if;
  -- 요일이 맞는 자리(저절로 생긴 살아 있는 자리)에 날짜 더하기는 그대로(manual 로 바꾸지 않는다)
  r := duty_date_add(b4, t0 + 4, array[lb]);
  if (r->>'existed')::int is distinct from 1 or (r->>'reopened')::int is distinct from 0 or (select manual from public.duty_slots where line_id = lb and on_date = t0 + 4) is not false then raise exception '요일이 맞는 자리는 그대로: %', r; end if;
  -- ── 지난 봉사(duty_past · 2026-10-07) — 날짜가 지난 내 줄 가운데 당번표에 남아 있는 것만 · 한 자리가 한 번 · 내 것만 ──
  --   지난 날의 자리·줄은 표에 직접 넣는다(지난 날에는 본인 지원이 안 되고 날짜 더하기는 31일 앞까지다) — 이 시험 안에서만.
  --   날짜: 어제(자리 둘) · 8일 전(취소·뺌) · 15일 전(쉬는 날) · 22일 전(그 자리만 쉼) · 400일 전(늘 지난 해) · 오늘 · 모레
  insert into public.duty_boards(title, place, contact_note, status) values ('[시험] 지난 봉사', '식당', '시험 문의 010-0000-0000', 'open') returning id into b5;
  insert into public.duty_lines(board_id, service, task, start_time, end_time, capacity) values (b5, '2부', '설거지', '11:30', '12:30', 5) returning id into lp1;
  insert into public.duty_lines(board_id, service, task, start_time, end_time, capacity) values (b5, '3부', '배식', '13:00', '14:00', 5) returning id into lp2;
  insert into public.duty_days(board_id, on_date, off) values (b5, t0 - 1, false), (b5, t0 - 8, false), (b5, t0 - 15, true), (b5, t0 - 22, false), (b5, t0 - 400, false), (b5, t0, false), (b5, t0 + 2, false);
  -- 어제: 두 자리에 살아 있는 줄(두 번) — 다른 분(u[2])의 줄도 같은 자리에
  insert into public.duty_slots(board_id, on_date, line_id, capacity, manual) values (b5, t0 - 1, lp1, 5, true) returning id into ps;
  insert into public.duty_signups(slot_id, user_id, name, status) values (ps, u[1], '당번시험1', 'active'), (ps, u[2], '당번시험2', 'active');
  insert into public.duty_slots(board_id, on_date, line_id, capacity, manual) values (b5, t0 - 1, lp2, 5, true) returning id into ps;
  insert into public.duty_signups(slot_id, user_id, name, status) values (ps, u[1], '당번시험1', 'active');
  -- 8일 전: 스스로 취소한 줄 · 담당자가 뺀 줄 — 세지 않는다
  insert into public.duty_slots(board_id, on_date, line_id, capacity, manual) values (b5, t0 - 8, lp1, 5, true) returning id into ps;
  insert into public.duty_signups(slot_id, user_id, name, status, end_reason, ended_at) values (ps, u[1], '당번시험1', 'cancelled', 'self', now());
  insert into public.duty_slots(board_id, on_date, line_id, capacity, manual) values (b5, t0 - 8, lp2, 5, true) returning id into ps;
  insert into public.duty_signups(slot_id, user_id, name, status, end_reason, ended_at) values (ps, u[1], '당번시험1', 'removed', 'staff', now());
  -- 15일 전: 쉬는 날 · 22일 전: 그 자리만 쉼 — 살아 있는 줄이어도 세지 않는다
  insert into public.duty_slots(board_id, on_date, line_id, capacity, manual) values (b5, t0 - 15, lp1, 5, true) returning id into ps;
  insert into public.duty_signups(slot_id, user_id, name, status) values (ps, u[1], '당번시험1', 'active');
  insert into public.duty_slots(board_id, on_date, line_id, capacity, off, manual) values (b5, t0 - 22, lp1, 5, true, true) returning id into ps;
  insert into public.duty_signups(slot_id, user_id, name, status) values (ps, u[1], '당번시험1', 'active');
  -- 400일 전: 지난 해의 한 번 · 오늘·모레: 아직 지나지 않았다(내 당번에 있다)
  insert into public.duty_slots(board_id, on_date, line_id, capacity, manual) values (b5, t0 - 400, lp1, 5, true) returning id into ps;
  insert into public.duty_signups(slot_id, user_id, name, status) values (ps, u[1], '당번시험1', 'active');
  insert into public.duty_slots(board_id, on_date, line_id, capacity, manual) values (b5, t0, lp1, 5, true) returning id into ps;
  insert into public.duty_signups(slot_id, user_id, name, status) values (ps, u[1], '당번시험1', 'active');
  insert into public.duty_slots(board_id, on_date, line_id, capacity, manual) values (b5, t0 + 2, lp1, 5, true) returning id into ps;
  insert into public.duty_signups(slot_id, user_id, name, status) values (ps, u[1], '당번시험1', 'active');
  -- 준비 중 당번의 지난 줄은 세지 않는다 · 보관한 당번의 지난 줄은 센다(끝난 한 번짜리 모집의 기록)
  insert into public.duty_boards(title, status) values ('[시험] 준비 중', 'draft') returning id into b6;
  insert into public.duty_lines(board_id, service, task, start_time, end_time, capacity) values (b6, '김장', '', '09:00', '12:00', 5) returning id into lp6;
  insert into public.duty_days(board_id, on_date) values (b6, t0 - 3);
  insert into public.duty_slots(board_id, on_date, line_id, capacity, manual) values (b6, t0 - 3, lp6, 5, true) returning id into ps;
  insert into public.duty_signups(slot_id, user_id, name, status) values (ps, u[3], '당번시험3', 'active');
  insert into public.duty_boards(title, status) values ('[시험] 지난 김장', 'open') returning id into b7;
  insert into public.duty_lines(board_id, service, task, start_time, end_time, capacity) values (b7, '김장', '', '09:00', '12:00', 5) returning id into lp7;
  insert into public.duty_days(board_id, on_date) values (b7, t0 - 5);
  insert into public.duty_slots(board_id, on_date, line_id, capacity, manual) values (b7, t0 - 5, lp7, 5, true) returning id into ps;
  insert into public.duty_signups(slot_id, user_id, name, status) values (ps, u[3], '당번시험3', 'active');
  update public.duty_boards set status = 'archived' where id = b7;   -- 끝난 뒤에 보관했다(숨긴 때 = 지금)
  -- 한도보다 줄이 많게(가까운 N줄 고르기) · 지난 해이지만 365일 안인 줄(올해 셈) — 다른 당번에 둔다(위 날짜들과 겹치지 않게 · 이른 시각이라 같은 날이어도 뒤 차례)
  dprev := make_date(extract(year from t0)::int - 1, 12, 31);
  insert into public.duty_boards(title, status) values ('[시험] 지난 안내', 'closed') returning id into b10;
  insert into public.duty_lines(board_id, service, task, start_time, end_time, capacity) values (b10, '4부', '안내', '05:00', '06:00', 5) returning id into lq1;
  insert into public.duty_lines(board_id, service, task, start_time, end_time, capacity) values (b10, '5부', '정리', '06:00', '07:00', 5) returning id into lq2;
  insert into public.duty_days(board_id, on_date) values (b10, t0 - 29);
  insert into public.duty_days(board_id, on_date) values (b10, dprev) on conflict (board_id, on_date) do nothing;   -- 1월 29일에 돌리면 같은 날이다
  insert into public.duty_slots(board_id, on_date, line_id, capacity, manual) values (b10, t0 - 29, lq1, 5, true) returning id into ps;
  insert into public.duty_signups(slot_id, user_id, name, status) values (ps, u[1], '당번시험1', 'active');
  insert into public.duty_slots(board_id, on_date, line_id, capacity, manual) values (b10, dprev, lq2, 5, true) returning id into ps;
  insert into public.duty_signups(slot_id, user_id, name, status) values (ps, u[1], '당번시험1', 'active');

  -- 올해 = 한국 달력의 올해: 어제 둘(1월 1일에 돌리면 지난 해) + 29일 전(1월에 돌리면 지난 해) · 지난 해 12월 31일은 365일 안이어도 올해가 아니다
  yr := (case when extract(year from t0 - 1) = extract(year from t0) then 2 else 0 end) + (case when extract(year from t0 - 29) = extract(year from t0) then 1 else 0 end);
  p := duty_past(u[1]);
  if (p->>'total')::int is distinct from 5 or (p->>'year')::int is distinct from yr or jsonb_array_length(p->'rows') is distinct from 5 then raise exception '지난 봉사 — 어제 두 자리 + 29일 전 + 지난 해 12월 31일 + 400일 전(취소·뺌·쉬는 날·쉬는 자리·오늘·앞날은 세지 않는다 · 올해 %): %', yr, p; end if;
  if p->'rows'->0->>'date' is distinct from (t0 - 1)::text or p->'rows'->0->>'service' is distinct from '3부' or p->'rows'->0->>'task' is distinct from '배식'
     or p->'rows'->0->>'start' is distinct from '13:00' or p->'rows'->0->>'end' is distinct from '14:00' or p->'rows'->0->>'board' is distinct from '[시험] 지난 봉사' then raise exception '지난 봉사 — 가까운 날 · 늦은 시각부터: %', p; end if;
  if p->'rows'->1->>'service' is distinct from '2부' or p->'rows'->2->>'date' is distinct from greatest(t0 - 29, dprev)::text or p->'rows'->3->>'date' is distinct from least(t0 - 29, dprev)::text
     or p->'rows'->4->>'date' is distinct from (t0 - 400)::text then raise exception '지난 봉사 — 차례(가까운 날부터): %', p; end if;
  if (select array_agg(kn order by kn) from jsonb_object_keys(p->'rows'->0) as kx(kn)) is distinct from array['board','contact','date','end','service','start','task'] then raise exception '지난 봉사 — 줄의 칸은 일곱뿐: %', p->'rows'->0; end if;
  if p->'rows'->0->>'contact' is distinct from '시험 문의 010-0000-0000' or p->'rows'->2->>'contact' is distinct from '' then raise exception '지난 봉사 — 문의는 그 당번의 것(없으면 빈 글): %', p; end if;
  if (select array_agg(kn order by kn) from jsonb_object_keys(p) as kx(kn)) is distinct from array['rows','today','total','year'] or p->>'today' is distinct from t0::text then raise exception '지난 봉사 — 답의 칸은 넷뿐(오늘 · 두 수 · 줄): %', p; end if;
  txt := p::text;
  if txt like '%당번시험%' or txt like '%user%' or txt like '%ident%' or txt like any (array['%' || u[1]::text || '%', '%' || u[2]::text || '%']) then raise exception '지난 봉사 — 이름·계정 번호를 싣지 않는다: %', txt; end if;
  -- 한도 — 수는 그대로이고 줄만 줄어든다 · 0 이면 수만 · 틀린 값은 0~200 으로
  --   한도보다 줄이 많다(다섯) — **가까운 날부터** 고르고(먼 날부터 고르면 400일 전이 온다) · 두 수는 받은 줄이 아니라 모두에서 센다(한도 뒤에서 세면 올해가 1 로 준다)
  p := duty_past(u[1], 1);
  if jsonb_array_length(p->'rows') is distinct from 1 or (p->>'total')::int is distinct from 5 or (p->>'year')::int is distinct from yr
     or p->'rows'->0->>'date' is distinct from (t0 - 1)::text or p->'rows'->0->>'start' is distinct from '13:00' then raise exception '지난 봉사 — 한도 1(가장 가까운 한 줄 · 수는 그대로): %', p; end if;
  p := duty_past(u[1], 3);
  if jsonb_array_length(p->'rows') is distinct from 3 or (p->>'total')::int is distinct from 5 or (p->>'year')::int is distinct from yr or p->'rows'->0->>'date' is distinct from (t0 - 1)::text
     or p->'rows'->1->>'date' is distinct from (t0 - 1)::text or p->'rows'->2->>'date' is distinct from greatest(t0 - 29, dprev)::text then raise exception '지난 봉사 — 한도 3(가까운 셋): %', p; end if;
  p := duty_past(u[1], 0);
  if p->'rows' is distinct from '[]'::jsonb or (p->>'total')::int is distinct from 5 or (p->>'year')::int is distinct from yr then raise exception '지난 봉사 — 한도 0(수만): %', p; end if;
  if jsonb_array_length(duty_past(u[1], -5)->'rows') is distinct from 0 or jsonb_array_length(duty_past(u[1], 99999)->'rows') is distinct from 5 or jsonb_array_length(duty_past(u[1], null)->'rows') is distinct from 5 then raise exception '지난 봉사 — 한도의 끝'; end if;
  p := duty_past(u[1]);
  -- 다른 분 · 준비 중 · 보관 · 계정 없이
  if (duty_past(u[2])->>'total')::int is distinct from 1 or duty_past(u[2])->'rows'->0->>'service' is distinct from '2부' then raise exception '지난 봉사 — 다른 분은 제 것만: %', duty_past(u[2]); end if;
  if (duty_past(u[3])->>'total')::int is distinct from 1 or duty_past(u[3])->'rows'->0->>'board' is distinct from '[시험] 지난 김장' then raise exception '지난 봉사 — 끝난 뒤 보관한 당번은 세고 준비 중 당번은 세지 않는다: %', duty_past(u[3]); end if;
  if duty_past(u[4]) - 'today' is distinct from '{"total":0,"year":0,"rows":[]}'::jsonb then raise exception '지난 봉사 — 없는 분: %', duty_past(u[4]); end if;
  if duty_past(null) - 'today' is distinct from '{"total":0,"year":0,"rows":[]}'::jsonb then raise exception '지난 봉사 — 계정 없이: %', duty_past(null); end if;
  -- 담당자가 지난 날의 줄을 빼면 그분의 지난 봉사에서도 빠진다(안 오신 분 바로잡기) · 다시 넣으면 돌아온다
  select e.id into ps from public.duty_signups e join public.duty_slots s on s.id = e.slot_id where s.board_id = b5 and s.on_date = t0 - 1 and s.line_id = lp1 and e.user_id = u[1];
  r := duty_cancel(ps, null, true);
  if (r->>'ok')::boolean is not true or (duty_past(u[1])->>'total')::int is distinct from 4 then raise exception '지난 날의 줄을 담당자가 빼면 지난 봉사에서 빠진다: % · %', r, duty_past(u[1]); end if;
  r := duty_restore(ps, true);
  if (r->>'ok')::boolean is not true or (duty_past(u[1])->>'total')::int is distinct from 5 then raise exception '다시 넣으면 돌아온다: % · %', r, duty_past(u[1]); end if;
  -- 당번 목록(duty_list_view)이 past 를 함께 싣는다 — 두 수와 가까운 세 줄까지 · 내 당번(오늘·모레)과 겹치지 않는다
  p := duty_list_view(u[1])->'past';
  if (p->>'total')::int is distinct from 5 or (p->>'year')::int is distinct from yr or jsonb_array_length(p->'rows') is distinct from 3 or p->'rows'->0->>'date' is distinct from (t0 - 1)::text
     or p->'rows'->2->>'date' is distinct from greatest(t0 - 29, dprev)::text then raise exception '당번 목록의 past(두 수는 모두 · 줄은 가까운 셋): %', p; end if;
  if exists (select 1 from jsonb_array_elements(duty_mine(u[1])) m where (m->>'date')::date < t0) then raise exception '내 당번에 지난 날이 섞였다'; end if;
  if exists (select 1 from jsonb_array_elements(duty_past(u[1])->'rows') m where (m->>'date')::date >= t0) then raise exception '지난 봉사에 오늘·앞날이 섞였다'; end if;
  if (duty_list_view(null)->'past') - 'today' is distinct from '{"total":0,"year":0,"rows":[]}'::jsonb then raise exception '계정 없는 당번 목록의 past: %', duty_list_view(null)->'past'; end if;
  -- 당번표(duty_board_view)도 두 수를 함께 싣는다(줄 없이) — 당번표만 다시 받는 화면의 「지난 봉사 N번」이 낡지 않게 · 다른 당번의 것까지 모두 센 수(그 당번만이 아니다)
  p := duty_board_view(b5, u[1])->'past';
  if (p->>'total')::int is distinct from 5 or (p->>'year')::int is distinct from yr or p->'rows' is distinct from '[]'::jsonb then raise exception '당번표의 past(두 수 · 줄 없음): %', p; end if;
  if (duty_board_view(b5, null)->'past') - 'today' is distinct from '{"total":0,"year":0,"rows":[]}'::jsonb then raise exception '계정 없는 당번표의 past: %', duty_board_view(b5, null)->'past'; end if;
  if (duty_board_view(b5, u[1])->'past')::text like '%당번시험%' or (duty_board_view(b5, u[1])->'past')::text like '%' || u[1]::text || '%' then raise exception '당번표의 past 에 이름·계정 번호가 샜다'; end if;
  -- ── 숨긴 때(duty_boards.hidden_at · 독립 확인 반영 2026-10-07) — 트리거 한 곳이 적는다 ──
  --   이 절은 새 계정(u[8]·u[9])으로 본다 — 앞 절들이 다섯째~일곱째 계정에 오늘·지난 날 줄을 이미 두었다
  for i in 8..9 loop
    k := '교구|당번시험|1|||당번시험' || i;
    insert into public.users(identity_key, type, gu, mok, name) values (k, '교구', '당번시험', '1', '당번시험' || i) returning id into aid;
    u := u || aid;
  end loop;
  --   새 당번·보이는 상태: null / 보이다가 숨김: 지금 / 숨긴 채(준비 중 ↔ 보관 · 손으로 고치기): 처음 숨긴 때 그대로 / 다시 열면 null
  if (select hidden_at from public.duty_boards where id = b5) is not null or (select hidden_at from public.duty_boards where id = b6) is not null then raise exception '새 당번(받는 중·준비 중)의 hidden_at 은 비어 있다'; end if;
  if (select hidden_at from public.duty_boards where id = b7) is distinct from now() then raise exception '보이다가 보관 = 지금: %', (select hidden_at from public.duty_boards where id = b7); end if;
  insert into public.duty_boards(title, status, hidden_at) values ('[시험] 접은 당번', 'open', now() - interval '99 days') returning id into b8;
  if (select hidden_at from public.duty_boards where id = b8) is not null then raise exception '새 당번에 적어 넣은 hidden_at 은 버린다'; end if;
  update public.duty_boards set status = 'closed' where id = b8;
  if (select hidden_at from public.duty_boards where id = b8) is not null then raise exception '받는 중 → 지원 멈춤: 여전히 보인다(null)'; end if;
  update public.duty_boards set status = 'draft' where id = b8;
  if (select hidden_at from public.duty_boards where id = b8) is distinct from now() then raise exception '보이다가 준비 중 = 지금'; end if;
  -- 「아흐레 전 정오에 숨겼다」를 만든다 — 시험 안에서만 트리거를 잠시 끈다(now() 는 이 트랜잭션 내내 같은 값이라, 옛 값을 지키는지 지금으로 다시 적는지 가를 수 없다)
  noon9 := ((t0 - 9) + time '12:00') at time zone 'Asia/Seoul';
  alter table public.duty_boards disable trigger duty_boards_hidden_stamp;
  update public.duty_boards set hidden_at = noon9 where id = b8;
  alter table public.duty_boards enable trigger duty_boards_hidden_stamp;
  update public.duty_boards set hidden_at = now(), title = '[시험] 접은 당번2' where id = b8;
  if (select hidden_at from public.duty_boards where id = b8) is distinct from noon9 or (select title from public.duty_boards where id = b8) is distinct from '[시험] 접은 당번2' then raise exception '숨긴 채 손으로 고친 hidden_at 은 되돌린다(다른 칸은 고쳐진다)'; end if;
  -- 그 당번의 줄(u[8]): 12일 전 · 숨긴 날의 정오에 끝난 자리 · 숨긴 날 정오에 걸친 자리(11~13시 — 시작은 앞 · 끝은 뒤) · 숨긴 날 오후 자리 · 숨긴 뒤(3일 전 — 접은 뒤라 서지 않은 날)
  insert into public.duty_lines(board_id, service, task, start_time, end_time, capacity) values (b8, '주차', '안내', '09:00', '12:00', 5) returning id into lp8;
  insert into public.duty_lines(board_id, service, task, start_time, end_time, capacity) values (b8, '주차', '정리', '13:00', '14:00', 5) returning id into lp9;
  insert into public.duty_lines(board_id, service, task, start_time, end_time, capacity) values (b8, '주차', '교대', '11:00', '13:00', 5) returning id into lp10;
  insert into public.duty_days(board_id, on_date) values (b8, t0 - 12), (b8, t0 - 9), (b8, t0 - 3);
  insert into public.duty_slots(board_id, on_date, line_id, capacity, manual) values (b8, t0 - 12, lp8, 5, true) returning id into ps;
  insert into public.duty_signups(slot_id, user_id, name, status) values (ps, u[8], '당번시험8', 'active');
  insert into public.duty_slots(board_id, on_date, line_id, capacity, manual) values (b8, t0 - 9, lp8, 5, true) returning id into ps;
  insert into public.duty_signups(slot_id, user_id, name, status) values (ps, u[8], '당번시험8', 'active');
  insert into public.duty_slots(board_id, on_date, line_id, capacity, manual) values (b8, t0 - 9, lp9, 5, true) returning id into ps;
  insert into public.duty_signups(slot_id, user_id, name, status) values (ps, u[8], '당번시험8', 'active');
  insert into public.duty_slots(board_id, on_date, line_id, capacity, manual) values (b8, t0 - 9, lp10, 5, true) returning id into ps;
  insert into public.duty_signups(slot_id, user_id, name, status) values (ps, u[8], '당번시험8', 'active');
  insert into public.duty_slots(board_id, on_date, line_id, capacity, manual) values (b8, t0 - 3, lp8, 5, true) returning id into ps;
  insert into public.duty_signups(slot_id, user_id, name, status) values (ps, u[8], '당번시험8', 'active') returning id into es;
  if (duty_past(u[8])->>'total')::int is distinct from 0 then raise exception '준비 중인 동안에는 세지 않는다: %', duty_past(u[8]); end if;
  update public.duty_boards set status = 'archived' where id = b8;
  if (select hidden_at from public.duty_boards where id = b8) is distinct from noon9 then raise exception '준비 중 → 보관: 처음 숨긴 때 그대로(보관한 때로 밀리지 않는다)'; end if;
  p := duty_past(u[8]);
  if (p->>'total')::int is distinct from 2 or p->'rows'->0->>'date' is distinct from (t0 - 9)::text or p->'rows'->0->>'task' is distinct from '안내' or p->'rows'->1->>'date' is distinct from (t0 - 12)::text then
    raise exception '보관한 당번 — 앱에 보이던 동안 **끝난** 자리만(12일 전 · 숨긴 날 정오에 끝난 자리). 숨길 때 아직 안 끝난 자리(11~13시)·그날 오후·그 뒤 날짜는 세지 않는다: %', p; end if;
  if (duty_list_view(u[8])->'past'->>'total')::int is distinct from 2 then raise exception '당번 목록의 past 도 같은 수: %', duty_list_view(u[8])->'past'; end if;
  if jsonb_array_length(duty_mine(u[8])) is distinct from 0 or duty_remind_ids(t0 - 3) is distinct from '{}'::bigint[] then raise exception '보관한 당번의 줄은 내 당번·전날 알림에 없다'; end if;
  r := duty_cancel(es, null, true);
  if r->>'error' is distinct from 'archived' then raise exception '보관한 당번의 줄은 담당자도 못 뺀다(그래서 그 뒤 날짜를 세면 고칠 길이 없다): %', r; end if;
  update public.duty_boards set status = 'draft' where id = b8;
  if (select hidden_at from public.duty_boards where id = b8) is distinct from noon9 or (duty_past(u[8])->>'total')::int is distinct from 0 then raise exception '보관 → 준비 중: 숨긴 때 그대로 · 세지 않는다'; end if;
  update public.duty_boards set status = 'closed' where id = b8;
  if (select hidden_at from public.duty_boards where id = b8) is not null or (duty_past(u[8])->>'total')::int is distinct from 5 then raise exception '다시 열면 비우고 지난 줄을 모두 센다(보이는 동안에는 담당자가 바로잡을 수 있다): %', duty_past(u[8]); end if;
  r := duty_cancel(es, null, true);
  if (r->>'ok')::boolean is not true or (duty_past(u[8])->>'total')::int is distinct from 4 then raise exception '다시 연 당번에서는 접어 둔 동안의 줄을 뺄 수 있다: % · %', r, duty_past(u[8]); end if;
  update public.duty_boards set status = 'archived' where id = b8;
  if (select hidden_at from public.duty_boards where id = b8) is distinct from now() or (duty_past(u[8])->>'total')::int is distinct from 4 then raise exception '다시 보관 = 지금(그때까지 끝난 자리 넷): %', duty_past(u[8]); end if;
  -- 한 번도 앱에 보인 적 없이 보관한 당번(표에 바로 archived · 준비 중 → 보관)은 세지 않는다
  insert into public.duty_boards(title, status) values ('[시험] 안 연 당번', 'draft') returning id into b9;
  insert into public.duty_lines(board_id, service, task, start_time, end_time, capacity) values (b9, '행사', '', '09:00', '12:00', 5) returning id into lp9;
  insert into public.duty_days(board_id, on_date) values (b9, t0 - 4);
  insert into public.duty_slots(board_id, on_date, line_id, capacity, manual) values (b9, t0 - 4, lp9, 5, true) returning id into ps;
  insert into public.duty_signups(slot_id, user_id, name, status) values (ps, u[9], '당번시험9', 'active');
  update public.duty_boards set status = 'archived' where id = b9;
  if (select hidden_at from public.duty_boards where id = b9) is not null or (duty_past(u[9])->>'total')::int is distinct from 0 then raise exception '한 번도 보인 적 없는 당번: 숨긴 때가 없고 세지 않는다: %', duty_past(u[9]); end if;
  -- ── 지난 쉬는 날 다시 열기(독립 확인 반영 2026-10-07) — 쉬는 날의 줄은 지난 봉사에서 빠지므로, 잘못 걸었거나 실제로는 섬긴 날을 지난 뒤에도 바로잡는다 ──
  r := duty_days_off(b5, t0 - 15, t0 - 15, true);
  if r->>'error' is distinct from 'bad-range' then raise exception '지난 날을 쉬는 날로 걸 수는 없다: %', r; end if;
  r := duty_days_off(b5, t0 - 401, t0 - 401, false);
  if r->>'error' is distinct from 'bad-range' then raise exception '다시 열기도 오늘 − 400일까지: %', r; end if;
  r := duty_days_off(b5, t0 - 15, t0 - 15, false);
  if (r->>'dry')::boolean is not true or (r->>'days')::int is distinct from 1 or (r->>'active')::int is distinct from 1 then raise exception '지난 쉬는 날 다시 열기 — 세기: %', r; end if;
  if (duty_past(u[1])->>'total')::int is distinct from 5 then raise exception '세기만 한 것은 아무것도 바꾸지 않는다'; end if;
  r := duty_days_off(b5, t0 - 15, t0 - 15, false, null, 1);
  if (r->>'ok')::boolean is not true or (r->>'days')::int is distinct from 1 or (select off from public.duty_days where board_id = b5 and on_date = t0 - 15) is not false then raise exception '지난 쉬는 날 다시 열기: %', r; end if;
  p := duty_past(u[1]);
  if (p->>'total')::int is distinct from 6 or not exists (select 1 from jsonb_array_elements(p->'rows') m where m->>'date' = (t0 - 15)::text) then raise exception '다시 연 날이 지난 봉사에 돌아온다: %', p; end if;
  r := duty_days_off(b5, t0 - 15, t0 - 15, false, null, 0);
  if (r->>'ok')::boolean is not true or (r->>'days')::int is distinct from 0 then raise exception '이미 연 날을 다시 열면 바뀐 날 0: %', r; end if;
  r := duty_days_off(b7, t0 - 5, t0 - 5, false);
  if r->>'error' is distinct from 'archived' then raise exception '보관한 당번의 날은 다시 열 수 없다: %', r; end if;
end $$;
rollback;
select '통과 — duty_rules' as result;
