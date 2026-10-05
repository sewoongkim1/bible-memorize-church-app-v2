-- 교육신청 — 교육 기간(starts_on·ends_on) 확인 — **개발에서만**(BEGIN … ROLLBACK). 운영에서 돌리지 않는다.
-- 끝에 「통과」 한 줄(select)이 나오면 끝. 하나라도 어긋나면 raise exception 으로 멈춘다(그때도 ROLLBACK).
-- 확인: ① 시작일 > 종료일은 CHECK 가 막는다 ② 회차가 없고 시작일이 오늘이면 앱 취소 too-late ③ 시작일이 오늘+3 이면 취소 ok
--       ④ 회차가 있으면 회차가 먼저(시작일이 멀어도 첫 회차가 오늘이면 too-late) ⑤ 담당자는 언제든
begin;
do $$
declare
  tag text := substr(md5(random()::text), 1, 8);
  cid uuid; aid uuid; r jsonb; e1 bigint; e2 bigint; e3 bigint; blocked boolean := false;
begin
  if (select count(*) from public.users) > 200 then raise exception '운영 같은 DB 입니다(users > 200) — 개발에서만 돌리세요'; end if;

  insert into public.users(identity_key, type, gu, mok, name) values ('교구|교육시험|1|||' || tag, '교구', '교육시험', '1', tag) returning id into aid;

  -- ① 시작일 > 종료일 → CHECK 위반
  begin
    insert into public.edu_courses(title, kind, status, starts_on, ends_on) values ('기간 거꾸로 ' || tag, 'regular', 'open', current_date + 5, current_date + 1);
  exception when check_violation then blocked := true; end;
  if not blocked then raise exception '시작일 > 종료일이 들어갔다'; end if;
  -- 한쪽만 있거나 같은 날은 된다
  insert into public.edu_courses(title, kind, status, starts_on, ends_on) values ('같은 날 ' || tag, 'lecture', 'open', current_date + 5, current_date + 5);
  insert into public.edu_courses(title, kind, status, starts_on) values ('시작만 ' || tag, 'lecture', 'open', current_date + 5);

  -- ② 회차 없음 + 시작일 = 오늘 → 앱 취소 too-late
  insert into public.edu_courses(title, kind, status, starts_on, ends_on) values ('시작 오늘 ' || tag, 'regular', 'open', edu_today(), edu_today() + 30) returning id into cid;
  r := edu_apply(cid, aid, jsonb_build_object('name', tag));
  if r->>'status' is distinct from 'confirmed' then raise exception '신청: %', r; end if;
  select id into e1 from public.edu_enrollments where course_id = cid and user_id = aid;
  r := edu_cancel(e1, false); if r->>'error' is distinct from 'too-late' then raise exception '시작일 오늘 취소: %', r; end if;
  r := edu_cancel(e1, true);  if (r->>'ok')::boolean is not true then raise exception '담당자 취소: %', r; end if;

  -- ③ 회차 없음 + 시작일 = 오늘+3 → 취소 ok
  insert into public.edu_courses(title, kind, status, starts_on, ends_on) values ('시작 사흘 뒤 ' || tag, 'regular', 'open', edu_today() + 3, edu_today() + 30) returning id into cid;
  r := edu_apply(cid, aid, jsonb_build_object('name', tag));
  if r->>'status' is distinct from 'confirmed' then raise exception '신청2: %', r; end if;
  select id into e2 from public.edu_enrollments where course_id = cid and user_id = aid;
  r := edu_cancel(e2, false); if (r->>'ok')::boolean is not true then raise exception '시작일 +3 취소: %', r; end if;

  -- ④ 회차가 있으면 회차가 먼저 — 시작일은 멀어도 첫 회차가 오늘이면 too-late
  insert into public.edu_courses(title, kind, status, starts_on) values ('회차 먼저 ' || tag, 'regular', 'open', edu_today() + 10) returning id into cid;
  insert into public.edu_sessions(course_id, no, on_date) values (cid, 1, edu_today()), (cid, 2, edu_today() + 7);
  r := edu_apply(cid, aid, jsonb_build_object('name', tag));
  if r->>'status' is distinct from 'confirmed' then raise exception '신청3: %', r; end if;
  select id into e3 from public.edu_enrollments where course_id = cid and user_id = aid;
  r := edu_cancel(e3, false); if r->>'error' is distinct from 'too-late' then raise exception '회차가 먼저: %', r; end if;

  -- ⑤ 둘 다 없으면 언제든(예전과 같다)
  insert into public.edu_courses(title, kind, status) values ('날짜 없음 ' || tag, 'regular', 'open') returning id into cid;
  r := edu_apply(cid, aid, jsonb_build_object('name', tag));
  select id into e1 from public.edu_enrollments where course_id = cid and user_id = aid;
  r := edu_cancel(e1, false); if (r->>'ok')::boolean is not true then raise exception '날짜 없음 취소: %', r; end if;
end $$;
select '통과' as result;
rollback;
