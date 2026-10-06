-- 봉사 당번 규칙 확인 — **개발에서만**(BEGIN … ROLLBACK). 운영에서 돌리지 않는다.
-- 끝에 「통과」 한 줄(select)이 나오면 끝. 하나라도 어긋나면 raise exception 으로 멈춘다(그때도 ROLLBACK 이라 남는 것 없음).
-- 비교는 전부 `is distinct from` — 함수가 오류를 내서 값이 NULL 이어도 조용히 지나가지 않게.
-- 날짜: 오늘 자리는 **늘 잠긴 날**(마감 = 어제 19시) · 모레(+2) 자리는 담당자가 확정해야만 잠긴다(마감 = 내일 19시) — 그래서 내일(+1)은 쓰지 않는다
--   (저녁 7시 앞뒤로 결과가 갈린다). 한국 시각 23:58~24:00 에 돌리면 「이미 시작」 시험 하나가 어긋날 수 있다.
begin;
do $$
declare
  b uuid; b2 uuid; aid uuid; u uuid[] := array[]::uuid[]; r jsonb; i int; k text;
  t0 date := duty_today(); d2 date := duty_today() + 2; d9 date := duty_today() + 9; d16 date := duty_today() + 16;
  wd int := extract(dow from (duty_today() + 2))::int;
  l1 bigint; l2 bigint; l3 bigint; l5 bigint; l6 bigint; l7 bigint; lb2 bigint;
  s1 bigint; s2 bigint; s3 bigint; s5 bigint; s1b bigint; s2b bigint; s2c bigint; st bigint; sp bigint; sx bigint;
  e1 bigint; e2 bigint; e3 bigint; e4 bigint; e5 bigint; ek bigint; es bigint; n int; txt text;
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
  r := duty_days_off(b, t0 - 1, t0 + 3, true); if r->>'error' is distinct from 'bad-range' then raise exception '지난 날 쉼: %', r; end if;
  r := duty_days_off(b, t0, t0 + 200, true);   if r->>'error' is distinct from 'bad-range' then raise exception '긴 기간: %', r; end if;

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
  r := duty_roster(b, t0 - 1, t0 + 20);
  if (r->>'ok')::boolean is not true or jsonb_array_length(r->'lines') is distinct from 6 or (r->'days'->0->>'past')::boolean is not true then raise exception '명단: %', left(r::text, 300); end if;
  if duty_roster(b, t0, t0 + 500)->>'error' is distinct from 'bad-range' then raise exception '명단 기간'; end if;
  if duty_name_out(E'  홍길동\t‮' || repeat('가', 30)) is distinct from '홍길동' || repeat('가', 17) then raise exception '이름 다듬기: %', duty_name_out(E'  홍길동\t‮' || repeat('가', 30)); end if;

  -- ── 알림 줄 잡기 · 재료 ──
  if cardinality(duty_notify_claim('confirmed', array[e2, e3, ek])) is distinct from 2 then raise exception '알림 줄(계정 없는 줄은 안 잡는다)'; end if;
  if cardinality(duty_notify_claim('confirmed', array[e2, e3, ek])) is distinct from 0 then raise exception '같은 알림은 한 번'; end if;
  if jsonb_array_length(duty_notify_rows(array[e2, e3, ek])) is distinct from 2 or duty_notify_rows(array[e2])->0->>'uid' is distinct from u[1]::text then raise exception '알림 재료'; end if;
  if not (e5 = any(duty_remind_ids(t0))) then raise exception '전날 알림 대상(오늘 날짜로 불러 봄)'; end if;

  -- ── 자리 틀 고치기 · 빼기 ──
  r := duty_line_save(b, jsonb_build_object('id',l1,'service','1부 예배','task','설거지','start','09:00','end','10:00','capacity',2,'weekday',wd));
  if (r->>'ok')::boolean is not true then raise exception '틀 이름 고치기: %', r; end if;
  if (duty_roster(b, d2, d2)->'days'->0->'slots'->0->>'service') is distinct from '1부 예배' then raise exception '이름은 그 틀의 모든 자리에 보인다'; end if;
  r := duty_line_save(b, jsonb_build_object('id',l2,'service','2부','task','설거지','start','11:00','end','12:00','capacity',4,'weekday',wd,'sort',1), true);
  if (r->>'updated')::int is distinct from 8 then raise exception '앞날 자리 정원도(8): %', r; end if;
  r := duty_line_save(b, jsonb_build_object('id',l5,'service','사이','task','','start','10:00','end','11:00','capacity',1,'weekday',(wd + 1) % 7));
  if (r->>'kept')::int is distinct from 1 or (r->>'made')::int < 7 then raise exception '요일 바꾸기(지원 있는 자리 1 남김): %', r; end if;
  r := duty_line_save(b, jsonb_build_object('service','임시','task','','start','15:00','end','16:00','capacity',1,'weekday',wd));
  r := duty_line_remove((r->>'id')::bigint); if (r->>'deleted')::boolean is not true then raise exception '지원 줄이 없는 틀 빼기 = 지움: %', r; end if;
  r := duty_line_remove(l3); if (r->>'deleted')::boolean is not false or (r->>'kept')::int is distinct from 1 then raise exception '뺀 줄이라도 지원 줄이 있던 자리는 남긴다: %', r; end if;
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
end $$;
rollback;
select '통과 — duty_rules' as result;
