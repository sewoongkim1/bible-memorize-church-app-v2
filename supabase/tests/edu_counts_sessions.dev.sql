-- 교육신청 — 신청 수(edu_course_counts)와 회차 바꾸기(edu_sessions_replace) 확인 — **개발에서만**(BEGIN … ROLLBACK). 운영에서 돌리지 않는다.
-- 끝에 「통과」 한 줄(select)이 나오면 끝. 하나라도 어긋나면 raise exception 으로 멈춘다(그때도 ROLLBACK 이라 남는 것 없음).
-- 비교는 전부 `is distinct from` — 함수가 오류를 내서 값이 NULL 이어도 조용히 지나가지 않게.
begin;
do $$
declare
  tag text := substr(md5(random()::text), 1, 8);
  c1 uuid; c2 uuid; c3 uuid; aid uuid; i int; r jsonb; n int; cnt record;
  id1 bigint; id2 bigint; id3 bigint;
begin
  if (select count(*) from public.users) > 200 then raise exception '운영 같은 DB 입니다(users > 200) — 개발에서만 돌리세요'; end if;

  insert into public.edu_courses(title, kind, status) values ('수 시험 A ' || tag, 'regular', 'open') returning id into c1;
  insert into public.edu_courses(title, kind, status) values ('수 시험 B ' || tag, 'regular', 'open') returning id into c2;
  insert into public.edu_courses(title, kind, status) values ('수 시험 C ' || tag, 'regular', 'open') returning id into c3;   -- 신청 없음

  -- A: 확정 2 · 대기 1 · 신청 1 · 취소 1(세지 않음) / B: 확정 1 · 반려 1(세지 않음)
  for i in 1..6 loop
    insert into public.users(identity_key, type, gu, mok, name) values ('교구|교육시험|1|||' || tag || i, '교구', '교육시험', '1', tag || i) returning id into aid;
    insert into public.edu_enrollments(course_id, user_id, name, status) values
      (case when i <= 4 then c1 else c2 end, aid, tag || i,
       case i when 1 then 'confirmed' when 2 then 'confirmed' when 3 then 'waitlisted' when 4 then 'applied' when 5 then 'confirmed' else 'declined' end);
  end loop;
  insert into public.users(identity_key, type, gu, mok, name) values ('교구|교육시험|1|||' || tag || 'x', '교구', '교육시험', '1', tag || 'x') returning id into aid;
  insert into public.edu_enrollments(course_id, user_id, name, status) values (c1, aid, tag || 'x', 'cancelled');

  select * into cnt from public.edu_course_counts(array[c1]) where course_id = c1;
  if cnt.confirmed is distinct from 2 or cnt.waitlisted is distinct from 1 or cnt.applied is distinct from 1 then raise exception 'A 수: %', cnt; end if;
  select * into cnt from public.edu_course_counts(array[c1, c2, c3]) where course_id = c2;
  if cnt.confirmed is distinct from 1 or cnt.waitlisted is distinct from 0 or cnt.applied is distinct from 0 then raise exception 'B 수(반려는 안 센다): %', cnt; end if;
  select * into cnt from public.edu_course_counts(array[c1, c2, c3]) where course_id = c3;
  if cnt.course_id is null or cnt.confirmed is distinct from 0 or cnt.applied is distinct from 0 then raise exception 'C 는 0 줄로 나와야 한다: %', cnt; end if;
  if (select count(*) from public.edu_course_counts(array[c1, c2, c3])) is distinct from 3 then raise exception '줄 수'; end if;
  if (select count(*) from public.edu_course_counts(array[]::uuid[])) is distinct from 0 then raise exception '빈 목록'; end if;

  -- 회차: 처음 셋을 넣는다
  r := edu_sessions_replace(c1, '[{"no":1,"on_date":"2027-03-03","topic":"하나"},{"no":2,"on_date":"2027-03-10","start_time":"19:30"},{"no":3,"on_date":"2027-03-17"}]'::jsonb);
  if r is distinct from '{"ok":true,"count":3}'::jsonb then raise exception '처음 셋: %', r; end if;
  select id into id1 from public.edu_sessions where course_id = c1 and no = 1;
  select id into id2 from public.edu_sessions where course_id = c1 and no = 2;
  select id into id3 from public.edu_sessions where course_id = c1 and no = 3;

  -- 1·2 는 고치고(id 를 실어 보낸다) 3 은 빼고 4 를 더한다 → 1·2 의 id 는 그대로, 3 은 없어짐
  --   (2단계 검토 2026-10-05: 회차는 번호가 아니라 id 로 맞춘다 — id 없는 줄은 새 회차다. 가운데 지우기·번호 다시 매기기는 edu_sessions_renumber.dev.sql)
  r := edu_sessions_replace(c1, jsonb_build_array(
    jsonb_build_object('id', id1, 'no', 1, 'on_date', '2027-04-01', 'topic', '바뀜'),
    jsonb_build_object('id', id2, 'no', 2, 'on_date', '2027-04-08', 'start_time', '20:00', 'end_time', '21:00'),
    jsonb_build_object('no', 4, 'on_date', '2027-04-15')));
  if r is distinct from '{"ok":true,"count":3}'::jsonb then raise exception '고침: %', r; end if;
  if (select id from public.edu_sessions where course_id = c1 and no = 1) is distinct from id1 then raise exception '1 번 id 가 바뀜'; end if;
  if (select id from public.edu_sessions where course_id = c1 and no = 2) is distinct from id2 then raise exception '2 번 id 가 바뀜'; end if;
  if exists (select 1 from public.edu_sessions where id = id3) then raise exception '3 번이 남음'; end if;
  if (select count(*) from public.edu_sessions where course_id = c1) is distinct from 3 then raise exception '회차 수'; end if;
  if (select on_date from public.edu_sessions where id = id1) is distinct from date '2027-04-01' then raise exception '날짜가 안 바뀜'; end if;
  if (select topic from public.edu_sessions where id = id1) is distinct from '바뀜' then raise exception '주제가 안 바뀜'; end if;
  if (select end_time from public.edu_sessions where id = id2) is distinct from time '21:00' then raise exception '끝 시각'; end if;
  if (select start_time from public.edu_sessions where course_id = c1 and no = 4) is not null then raise exception '새 회차 시각은 비어야'; end if;

  -- 다른 강좌 회차는 건드리지 않는다
  r := edu_sessions_replace(c2, '[{"no":1,"on_date":"2027-05-01"}]'::jsonb);
  if (select count(*) from public.edu_sessions where course_id = c1) is distinct from 3 then raise exception 'A 가 바뀜'; end if;

  -- 빈 목록이면 모두 지운다
  r := edu_sessions_replace(c2, '[]'::jsonb);
  if r is distinct from '{"ok":true,"count":0}'::jsonb or exists (select 1 from public.edu_sessions where course_id = c2) then raise exception '비우기: %', r; end if;

  -- 끝난·보관된 강좌는 못 바꾼다 · 없는 강좌
  update public.edu_courses set status = 'done' where id = c1;
  r := edu_sessions_replace(c1, '[]'::jsonb);
  if r->>'error' is distinct from 'course-closed' then raise exception 'done: %', r; end if;
  update public.edu_courses set status = 'archived' where id = c1;
  r := edu_sessions_replace(c1, '[{"no":9,"on_date":"2027-06-01"}]'::jsonb);
  if r->>'error' is distinct from 'course-closed' then raise exception 'archived: %', r; end if;
  if (select count(*) from public.edu_sessions where course_id = c1) is distinct from 3 then raise exception '닫힌 강좌 회차가 바뀜'; end if;
  r := edu_sessions_replace(gen_random_uuid(), '[]'::jsonb);
  if r->>'error' is distinct from 'not-found' then raise exception 'not-found: %', r; end if;
end $$;
select '통과' as result;
rollback;
