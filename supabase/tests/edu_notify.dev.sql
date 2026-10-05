-- 교육신청 4단계 — 앱 알림 기록(edu_notify_log · edu_notify_claim) 확인 — **개발에서만**(BEGIN … ROLLBACK). 운영에서 돌리지 않는다.
-- 끝에 「통과」 한 줄(select)이 나오면 끝. 하나라도 어긋나면 raise exception 으로 멈춘다(그때도 ROLLBACK 이라 남는 것 없음).
-- 비교는 전부 `is distinct from` — 함수가 오류를 내서 값이 NULL 이어도 조용히 지나가지 않게.
-- 보는 것:
--   ① 확정 + 앱 계정인 신청만 잡힌다(대기·취소·앱 계정 없는 대신 등록 줄·없는 번호·null 은 안 잡힘)
--   ② 같은 신청·같은 kind 는 한 번만(두 번째 부름은 빈 결과) · kind 가 다르면 따로(confirmed · first_day)
--   ③ 취소 뒤 다시 확정돼도 다시 안 잡힌다(친구 결정) · 대기에서 올라간 분(edu_cancel 의 promoted)은 잡힌다
--   ④ 틀린 kind 는 표의 check 에 걸린다 · 신청 줄을 지우면 기록도 함께(cascade)
--   ⑤ 권한 — 표·함수 모두 service_role 만(anon·authenticated 없음) · RLS 켜짐 · service_role 로 부르면 된다
--   ⑥ (검토 반영 2026-10-06) 잡은 번호는 bigint[] **하나**로 온다 — 1,001줄을 한 번에 잡아도 1,001개가 다 온다(표로 돌려주면
--      PostgREST 가 1,000줄에서 잘랐다) · 아무것도 안 잡혀도 NULL 이 아니라 빈 배열
--   ⑦ (검토 반영 2026-10-06) edu_staff_set 이 이미 그 상태인 줄에는 already:true(교회 어드민이 알림을 부탁하지 않는다) · 바꾼 때는 already 없음
begin;
do $$
declare
  tag text := substr(md5(random()::text), 1, 8);
  cid uuid; c2 uuid; c3 uuid; aid uuid; u uuid[] := array[]::uuid[]; i int; r jsonb; got bigint[]; many bigint[];
  e1 bigint; e2 bigint; e3 bigint; e4 bigint; es bigint;
begin
  if (select count(*) from public.users) > 200 then raise exception '운영 같은 DB 입니다(users > 200) — 개발에서만 돌리세요'; end if;

  for i in 1..4 loop
    insert into public.users(identity_key, type, gu, mok, name) values ('교구|알림시험|1|||' || tag || i, '교구', '알림시험', '1', tag || i)
      returning id into aid;
    u := u || aid;
  end loop;

  -- 선착순 · 정원 2 · 대기 켜짐 — 확정 시험1 · 대신 등록(앱 계정 없음) 확정 · 대기 시험2·시험3
  insert into public.edu_courses(title, kind, capacity, mode, waitlist, status) values ('알림 시험 ' || tag, 'lecture', 2, 'auto', true, 'open')
    returning id into cid;
  r := edu_apply(cid, u[1], jsonb_build_object('name', tag || '1'));
  if r->>'status' is distinct from 'confirmed' then raise exception '시험1: %', r; end if;
  e1 := (r->>'id')::bigint;
  r := edu_apply(cid, null, jsonb_build_object('name', tag || 's', 'ident_key', 'staff|새가족|||' || tag || 's'), true);
  if r->>'status' is distinct from 'confirmed' then raise exception '대신 등록: %', r; end if;
  es := (r->>'id')::bigint;
  r := edu_apply(cid, u[2], jsonb_build_object('name', tag || '2'));
  if r->>'status' is distinct from 'waitlisted' then raise exception '시험2: %', r; end if;
  e2 := (r->>'id')::bigint;
  r := edu_apply(cid, u[3], jsonb_build_object('name', tag || '3'));
  if r->>'status' is distinct from 'waitlisted' then raise exception '시험3: %', r; end if;
  e3 := (r->>'id')::bigint;
  update public.edu_enrollments set waitlist_at = now() - interval '1 minute' where id = e2;   -- 대기 첫 분 = 시험2
  r := edu_cancel(e3, true);   -- 시험3 은 취소 줄
  if r->>'ok' is distinct from 'true' then raise exception '시험3 취소: %', r; end if;

  -- ① 확정 + 앱 계정만
  got := array(select unnest(edu_notify_claim('confirmed', array[e1, es, e2, e3, -1]::bigint[])) order by 1);
  if got is distinct from array[e1] then raise exception '① 확정+앱 계정만 잡혀야: %', got; end if;
  if (select count(*) from public.edu_notify_log where enrollment_id in (e1, es, e2, e3)) is distinct from 1::bigint then raise exception '① 기록 수'; end if;
  got := edu_notify_claim('confirmed', null);                  -- unnest 없이 그대로 — NULL 이 아니라 빈 배열이어야(⑥)
  if got is distinct from array[]::bigint[] then raise exception '① null: %', got; end if;
  got := edu_notify_claim('confirmed', array[]::bigint[]);
  if got is distinct from array[]::bigint[] then raise exception '① 빈 배열: %', got; end if;
  got := edu_notify_claim('confirmed', array[e1, es, e2, e3]::bigint[]);   -- 이미 잡힌 시험1 · 잡히지 않는 줄들 → 빈 배열(NULL 아님)
  if got is distinct from array[]::bigint[] then raise exception '① 다 걸러지면 빈 배열: %', got; end if;

  -- ② 한 번만 · kind 는 따로
  got := array(select unnest(edu_notify_claim('confirmed', array[e1, e1]::bigint[])) order by 1);
  if got is distinct from array[]::bigint[] then raise exception '② 두 번째는 빈 결과: %', got; end if;
  got := array(select unnest(edu_notify_claim('first_day', array[e1]::bigint[])) order by 1);
  if got is distinct from array[e1] then raise exception '② first_day 는 따로: %', got; end if;
  if (select count(*) from public.edu_notify_log where enrollment_id = e1) is distinct from 2::bigint then raise exception '② 시험1 기록 둘'; end if;

  -- ③ 시험1 취소 → 대기 첫 분(시험2) 올라감 → 잡힌다 · 시험1 을 다시 확정해도 다시 안 잡힌다
  r := edu_cancel(e1, true);
  if (r->>'promoted')::bigint is distinct from e2 then raise exception '③ 올라간 분: %', r; end if;
  got := array(select unnest(edu_notify_claim('confirmed', array[(r->>'promoted')::bigint])) order by 1);
  if got is distinct from array[e2] then raise exception '③ 올라간 분 잡힘: %', got; end if;
  r := edu_staff_set(e1, 'confirmed', true);
  if r->>'ok' is distinct from 'true' then raise exception '③ 다시 확정: %', r; end if;
  got := array(select unnest(edu_notify_claim('confirmed', array[e1]::bigint[])) order by 1);
  if got is distinct from array[]::bigint[] then raise exception '③ 다시 확정돼도 다시 안 잡힘: %', got; end if;
  if r ? 'already' then raise exception '⑦ 상태를 바꾼 때는 already 가 없어야: %', r; end if;

  -- ⑦ 이미 확정인 줄을 다시 확정 · 이미 대기인 줄을 다시 대기 — 바뀐 것 없음(already) · 상태·대기 차례 그대로
  r := edu_staff_set(e1, 'confirmed', false);
  if r is distinct from jsonb_build_object('ok', true, 'promoted', null, 'already', true) then raise exception '⑦ 다시 확정: %', r; end if;
  update public.edu_enrollments set status = 'waitlisted', waitlist_at = '2000-01-01T00:00:00Z' where id = e3;   -- 시험3(취소 줄)을 대기로 놓고
  r := edu_staff_set(e3, 'waitlisted', false);
  if r is distinct from jsonb_build_object('ok', true, 'promoted', null, 'already', true) then raise exception '⑦ 다시 대기: %', r; end if;
  if (select waitlist_at from public.edu_enrollments where id = e3) is distinct from '2000-01-01T00:00:00Z'::timestamptz then
    raise exception '⑦ 바뀐 것이 없는데 대기 차례가 바뀌었다';
  end if;
  if (select status from public.edu_enrollments where id = e1) is distinct from 'confirmed' then raise exception '⑦ 시험1 상태'; end if;

  -- ④ 틀린 kind · 지우면 함께
  begin
    perform edu_notify_claim('other', array[e2]::bigint[]);
    raise exception '④ 틀린 kind 가 통과했다';
  exception when check_violation then null;
  end;
  insert into public.edu_courses(title, kind, capacity, mode, waitlist, status) values ('알림 시험 2 ' || tag, 'lecture', null, 'auto', true, 'open')
    returning id into c2;
  r := edu_apply(c2, u[4], jsonb_build_object('name', tag || '4'));
  e4 := (r->>'id')::bigint;
  got := array(select unnest(edu_notify_claim('first_day', array[e4]::bigint[])) order by 1);
  if got is distinct from array[e4] then raise exception '④ 시험4: %', got; end if;
  delete from public.edu_enrollments where id = e4;
  if exists (select 1 from public.edu_notify_log where enrollment_id = e4) then raise exception '④ 신청을 지웠는데 기록이 남음'; end if;

  -- ⑥ 1,001줄을 한 번에 — 잡은 번호가 하나도 빠지지 않고 배열 하나로(1,001개) · 다시 부르면 빈 배열
  insert into public.edu_courses(title, kind, capacity, mode, waitlist, status) values ('알림 시험 3 ' || tag, 'lecture', null, 'auto', true, 'open')
    returning id into c3;
  with nu as (
    insert into public.users(identity_key, type, gu, mok, name)
      select '교구|알림시험|1|||' || tag || 'm' || g, '교구', '알림시험', '1', tag || 'm' || g from generate_series(1, 1001) g
      returning id, name
  ), ne as (
    insert into public.edu_enrollments(course_id, user_id, name, status, decided_at)
      select c3, nu.id, nu.name, 'confirmed', now() from nu
      returning id
  )
  select array_agg(ne.id order by ne.id) into many from ne;
  if cardinality(many) is distinct from 1001 then raise exception '⑥ 시험 줄 만들기: %', cardinality(many); end if;
  got := edu_notify_claim('first_day', many);
  if cardinality(got) is distinct from 1001 then raise exception '⑥ 1,001줄이 다 와야: %', cardinality(got); end if;
  if got is distinct from many then raise exception '⑥ 잡은 번호가 시험 줄과 같아야(번호 차례)'; end if;
  if (select count(*) from public.edu_notify_log where enrollment_id = any(many) and kind = 'first_day') is distinct from 1001::bigint then
    raise exception '⑥ 기록 1,001줄';
  end if;
  got := edu_notify_claim('first_day', many);
  if got is distinct from array[]::bigint[] then raise exception '⑥ 두 번째는 빈 배열: %', cardinality(got); end if;
  if (select prorettype from pg_proc where oid = 'public.edu_notify_claim(text, bigint[])'::regprocedure) is distinct from 'bigint[]'::regtype
     or (select proretset from pg_proc where oid = 'public.edu_notify_claim(text, bigint[])'::regprocedure) then
    raise exception '⑥ edu_notify_claim 이 bigint[] 하나를 돌려주지 않는다(표로 돌아갔다?)';
  end if;

  -- ⑤ 권한
  if not (select relrowsecurity from pg_class where oid = 'public.edu_notify_log'::regclass) then raise exception '⑤ RLS 꺼짐'; end if;
  if has_table_privilege('anon', 'public.edu_notify_log', 'select') or has_table_privilege('authenticated', 'public.edu_notify_log', 'select')
     or has_table_privilege('anon', 'public.edu_notify_log', 'insert') or has_table_privilege('authenticated', 'public.edu_notify_log', 'insert') then
    raise exception '⑤ anon·authenticated 가 표를 연다';
  end if;
  if has_function_privilege('anon', 'public.edu_notify_claim(text, bigint[])', 'execute') then raise exception '⑤ anon 이 부를 수 있다'; end if;
  if has_function_privilege('authenticated', 'public.edu_notify_claim(text, bigint[])', 'execute') then raise exception '⑤ authenticated 가 부를 수 있다'; end if;
  if not has_function_privilege('service_role', 'public.edu_notify_claim(text, bigint[])', 'execute') then raise exception '⑤ service_role 이 못 부른다'; end if;
  set local role service_role;
  got := edu_notify_claim('first_day', array[e2]::bigint[]);
  reset role;
  if got is distinct from array[e2] then raise exception '⑤ service_role 로 부름: %', got; end if;
end $$;
select '통과' as result;
rollback;
