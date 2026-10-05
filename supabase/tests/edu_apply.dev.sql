-- 교육신청 규칙 확인 — **개발에서만**(BEGIN … ROLLBACK). 운영에서 돌리지 않는다.
-- 「통과」가 나오면 끝. 하나라도 어긋나면 raise exception 으로 멈춘다(그때도 ROLLBACK 이라 남는 것 없음).
begin;
do $$
declare cid uuid; aid uuid; u uuid[] := array[]::uuid[]; r jsonb; i int; eid bigint; k text;
begin
  -- 시험 계정 다섯(교구|교육시험|1|||시험N)
  for i in 1..5 loop
    k := '교구|교육시험|1|||시험' || i;
    insert into public.users(identity_key, type, gu, mok, name) values (k, '교구', '교육시험', '1', '시험' || i)
      returning id into aid;
    u := u || aid;
  end loop;
  -- 선착순 정원 2 · 대기 켜짐 · 모집 중 · 회차는 내일부터
  insert into public.edu_courses(title, kind, capacity, mode, waitlist, status) values ('시험 강좌', 'regular', 2, 'auto', true, 'open')
    returning id into cid;
  insert into public.edu_sessions(course_id, no, on_date) values (cid, 1, edu_today() + 1);

  r := edu_apply(cid, u[1], '{"name":"시험1"}'); if r->>'status' <> 'confirmed' then raise exception '1: %', r; end if;
  r := edu_apply(cid, u[2], '{"name":"시험2"}'); if r->>'status' <> 'confirmed' then raise exception '2: %', r; end if;
  r := edu_apply(cid, u[3], '{"name":"시험3"}'); if r->>'status' <> 'waitlisted' then raise exception '3: %', r; end if;
  r := edu_apply(cid, u[4], '{"name":"시험4"}'); if r->>'status' <> 'waitlisted' then raise exception '4: %', r; end if;
  r := edu_apply(cid, u[1], '{"name":"시험1"}'); if (r->>'already')::boolean is not true then raise exception '중복: %', r; end if;

  -- 확정 한 분 취소 → 대기 첫 분(시험3) 확정
  select id into eid from public.edu_enrollments where course_id = cid and user_id = u[1];
  r := edu_cancel(eid, false);
  if (select status from public.edu_enrollments where course_id = cid and user_id = u[3]) <> 'confirmed' then raise exception '대기 올림: %', r; end if;
  if (select status from public.edu_enrollments where course_id = cid and user_id = u[4]) <> 'waitlisted' then raise exception '둘째 대기는 그대로'; end if;

  -- 취소했던 분이 다시 신청 → 정원 찼으니 대기(줄은 하나 · 되살림)
  r := edu_apply(cid, u[1], '{"name":"시험1"}'); if r->>'status' <> 'waitlisted' then raise exception '다시 신청: %', r; end if;
  if (select count(*) from public.edu_enrollments where course_id = cid and user_id = u[1]) <> 1 then raise exception '줄이 둘'; end if;

  -- 담당자 확정은 정원을 본다 · force 면 넘긴다
  select id into eid from public.edu_enrollments where course_id = cid and user_id = u[4];
  r := edu_staff_set(eid, 'confirmed', false); if r->>'error' <> 'full' then raise exception '정원: %', r; end if;
  r := edu_staff_set(eid, 'confirmed', true);  if (r->>'ok')::boolean is not true then raise exception 'force: %', r; end if;

  -- 첫 회차 당일에는 성도님 취소 불가 · 담당자는 됨
  update public.edu_sessions set on_date = edu_today() where course_id = cid;
  select id into eid from public.edu_enrollments where course_id = cid and user_id = u[2];
  r := edu_cancel(eid, false); if r->>'error' <> 'too-late' then raise exception '마감: %', r; end if;
  r := edu_cancel(eid, true);  if (r->>'ok')::boolean is not true then raise exception '담당자 취소: %', r; end if;

  -- 승인 강좌 — 신청은 applied · 대기 없는 선착순은 full
  update public.edu_courses set mode = 'approve' where id = cid;
  r := edu_apply(cid, u[5], '{"name":"시험5"}'); if r->>'status' <> 'applied' then raise exception '승인: %', r; end if;
  update public.edu_courses set mode = 'auto', waitlist = false, capacity = 1 where id = cid;
  delete from public.edu_enrollments where course_id = cid and user_id = u[5];
  r := edu_apply(cid, u[5], '{"name":"시험5"}'); if r->>'error' <> 'full' then raise exception '대기 없음: %', r; end if;

  -- 모집 전·후·준비 중
  update public.edu_courses set waitlist = true, capacity = null, status = 'draft' where id = cid;
  r := edu_apply(cid, u[5], '{"name":"시험5"}'); if r->>'error' <> 'not-open' then raise exception 'draft: %', r; end if;
  update public.edu_courses set status = 'open', apply_from = edu_today() + 1 where id = cid;
  r := edu_apply(cid, u[5], '{"name":"시험5"}'); if r->>'error' <> 'not-yet' then raise exception 'not-yet: %', r; end if;
  -- 담당자 대신 등록은 창을 건너뛴다 · 계정 없는 새가족은 신원 키로 한 줄
  r := edu_apply(cid, null, '{"name":"새가족","ident_key":"새가족|홍길동"}', true); if r->>'status' <> 'confirmed' then raise exception '대신: %', r; end if;
  r := edu_apply(cid, null, '{"name":"새가족","ident_key":"새가족|홍길동"}', true); if (r->>'already')::boolean is not true then raise exception '대신 중복: %', r; end if;

  raise notice '통과';
end $$;
rollback;
