-- 교육신청 — 빈자리 채우기(edu_course_refill) 확인 — **개발에서만**(BEGIN … ROLLBACK). 운영에서 돌리지 않는다.
-- 끝에 「통과」 한 줄(select)이 나오면 끝. 하나라도 어긋나면 raise exception 으로 멈춘다(그때도 ROLLBACK 이라 남는 것 없음).
-- 비교는 전부 `is distinct from` — 함수가 오류를 내서 값이 NULL 이어도 조용히 지나가지 않게.
-- 왜: 정원을 늘려도 대기하신 분은 그대로이고 다음 앱 신청이 먼저 확정되던 것(최종 검토 2026-10-05) — 교회 어드민 eduCourseSave 가 부른다.
begin;
do $$
declare
  tag text := substr(md5(random()::text), 1, 8);
  cid uuid; aid uuid; u uuid[] := array[]::uuid[]; i int; r jsonb;
  e2 bigint; e3 bigint; e4 bigint; e5 bigint;
begin
  if (select count(*) from public.users) > 200 then raise exception '운영 같은 DB 입니다(users > 200) — 개발에서만 돌리세요'; end if;

  for i in 1..5 loop
    insert into public.users(identity_key, type, gu, mok, name) values ('교구|교육시험|1|||' || tag || i, '교구', '교육시험', '1', tag || i)
      returning id into aid;
    u := u || aid;
  end loop;

  -- 선착순 · 정원 1 · 대기 켜짐 · 모집 중 — 확정 시험1 · 대기 시험2·3·4
  insert into public.edu_courses(title, kind, capacity, mode, waitlist, status) values ('채우기 시험 ' || tag, 'regular', 1, 'auto', true, 'open')
    returning id into cid;
  r := edu_apply(cid, u[1], jsonb_build_object('name', tag || '1')); if r->>'status' is distinct from 'confirmed' then raise exception '1: %', r; end if;
  for i in 2..4 loop
    r := edu_apply(cid, u[i], jsonb_build_object('name', tag || i)); if r->>'status' is distinct from 'waitlisted' then raise exception '%: %', i, r; end if;
  end loop;
  select id into e2 from public.edu_enrollments where course_id = cid and user_id = u[2];
  select id into e3 from public.edu_enrollments where course_id = cid and user_id = u[3];
  select id into e4 from public.edu_enrollments where course_id = cid and user_id = u[4];
  -- 대기 순서를 id 와 다르게 섞는다(같은 트랜잭션은 now() 가 같다): 시험4 → 시험2 → 시험3
  update public.edu_enrollments set waitlist_at = now() - interval '3 minute' where id = e4;
  update public.edu_enrollments set waitlist_at = now() - interval '2 minute' where id = e2;
  update public.edu_enrollments set waitlist_at = now() - interval '1 minute' where id = e3;

  -- 정원 그대로면 아무도 안 오른다
  r := edu_course_refill(cid);
  if r is distinct from '{"ok":true,"promoted":0,"ids":[]}'::jsonb then raise exception '정원 그대로: %', r; end if;

  -- 정원 1 → 3 · 대기 셋 → 두 분이 대기 순서대로(시험4·시험2) 오르고 시험3 은 대기 1번으로 남는다
  update public.edu_courses set capacity = 3 where id = cid;
  r := edu_course_refill(cid);
  -- 올린 신청 번호(ids)도 올린 차례대로(4단계 — 교회 어드민이 그분들께 「자리가 나서 확정」 알림을 부탁한다)
  if r is distinct from jsonb_build_object('ok', true, 'promoted', 2, 'ids', jsonb_build_array(e4, e2)) then raise exception '1→3: %', r; end if;
  if (select status from public.edu_enrollments where id = e4) is distinct from 'confirmed' then raise exception '대기 첫 분(시험4)이 안 오름'; end if;
  if (select status from public.edu_enrollments where id = e2) is distinct from 'confirmed' then raise exception '대기 둘째(시험2)가 안 오름'; end if;
  if (select status from public.edu_enrollments where id = e3) is distinct from 'waitlisted' then raise exception '셋째(시험3)가 정원을 넘어 오름'; end if;
  if (select count(*) from public.edu_enrollments where course_id = cid and status = 'confirmed') is distinct from 3::bigint then raise exception '확정 수가 정원과 다름'; end if;
  -- 다시 불러도 그대로(정원 참)
  r := edu_course_refill(cid);
  if r is distinct from '{"ok":true,"promoted":0,"ids":[]}'::jsonb then raise exception '두 번째 부름: %', r; end if;

  -- 승인 강좌 — 정원을 늘려도 안 올린다
  update public.edu_courses set mode = 'approve', capacity = 10 where id = cid;
  r := edu_course_refill(cid);
  if r is distinct from '{"ok":true,"promoted":0,"ids":[]}'::jsonb then raise exception '승인 강좌: %', r; end if;
  if (select status from public.edu_enrollments where id = e3) is distinct from 'waitlisted' then raise exception '승인 강좌인데 오름'; end if;

  -- 끝난·보관된 강좌 — 아무것도 안 한다
  update public.edu_courses set mode = 'auto', status = 'done' where id = cid;
  r := edu_course_refill(cid);
  if r is distinct from '{"ok":true,"promoted":0,"ids":[]}'::jsonb then raise exception 'done: %', r; end if;
  update public.edu_courses set status = 'archived' where id = cid;
  r := edu_course_refill(cid);
  if r is distinct from '{"ok":true,"promoted":0,"ids":[]}'::jsonb then raise exception 'archived: %', r; end if;
  if (select status from public.edu_enrollments where id = e3) is distinct from 'waitlisted' then raise exception '끝난 강좌인데 오름'; end if;

  -- 정원 제한 없음(null) — 대기하신 분 모두(시험3·시험5) 오른다
  update public.edu_courses set status = 'open', capacity = 3 where id = cid;
  r := edu_apply(cid, u[5], jsonb_build_object('name', tag || '5')); if r->>'status' is distinct from 'waitlisted' then raise exception '5: %', r; end if;
  select id into e5 from public.edu_enrollments where course_id = cid and user_id = u[5];
  update public.edu_courses set capacity = null where id = cid;
  r := edu_course_refill(cid);
  if r is distinct from jsonb_build_object('ok', true, 'promoted', 2, 'ids', jsonb_build_array(e3, e5)) then raise exception '제한 없음: %', r; end if;
  if (select count(*) from public.edu_enrollments where course_id = cid and status = 'waitlisted') is distinct from 0::bigint then raise exception '제한 없음인데 대기가 남음'; end if;

  -- 없는 강좌
  r := edu_course_refill(gen_random_uuid());
  if r->>'error' is distinct from 'not-found' then raise exception 'not-found: %', r; end if;

  -- 권한 — service_role 만(교회 어드민 함수) · anon·authenticated 는 못 부른다
  if has_function_privilege('anon', 'public.edu_course_refill(uuid)', 'execute') then raise exception 'anon 이 부를 수 있다'; end if;
  if has_function_privilege('authenticated', 'public.edu_course_refill(uuid)', 'execute') then raise exception 'authenticated 가 부를 수 있다'; end if;
  if not has_function_privilege('service_role', 'public.edu_course_refill(uuid)', 'execute') then raise exception 'service_role 이 못 부른다'; end if;
  -- edu_promote 는 service_role 에도 안 줬다 — 그래도 refill(security definer) 안에서는 불린다
  update public.edu_courses set capacity = 5 where id = cid;   -- 지금 확정 다섯(1·4·2·3·5) → 시험5 를 대기로 내려 빈자리 하나
  update public.edu_enrollments set status = 'waitlisted', waitlist_at = now() where id = e5;
  set local role service_role;
  r := edu_course_refill(cid);
  reset role;
  if r is distinct from jsonb_build_object('ok', true, 'promoted', 1, 'ids', jsonb_build_array(e5)) then raise exception 'service_role 로 부름: %', r; end if;
  if (select status from public.edu_enrollments where id = e5) is distinct from 'confirmed' then raise exception 'service_role 로 불렀는데 안 오름'; end if;
end $$;
select '통과' as result;
rollback;
