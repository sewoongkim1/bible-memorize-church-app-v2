-- 교육신청 2단계 — 출석부(edu_attendance_set·edu_attendance_bulk · 회차 지우기 has-attendance) 확인 — **개발에서만**(BEGIN … ROLLBACK). 운영에서 돌리지 않는다.
-- 끝에 「통과」 한 줄(select)이 나오면 끝. 하나라도 어긋나면 raise exception 으로 멈춘다(그때도 ROLLBACK 이라 남는 것 없음).
-- 비교는 전부 `is distinct from` — 함수가 오류를 내서 값이 NULL 이어도 조용히 지나가지 않게.
-- ⚠️ 이 저장소는 공개입니다 — 아래 이름은 모두 가상입니다. 한글이 든 SQL 은 명령줄에 붙이지 말고 -f 로만 돌린다.
--   ① 같은 강좌 검사 — B 회차 × A 신청은 wrong-course(아무것도 안 씀)
--   ② 확정이 아닌 신청(신청·대기·취소·반려)은 쓰기 not-confirmed · 지우기(null)는 된다(검토 반영 — 합치기 merge-edu-attendance 를 푸는 길)
--   ③ 쓰기·고치기(같은 칸 다시 쓰면 덮음 · 줄 하나) · marked_by 남음 · null 이면 지움(cleared) · 없는 칸 지우기도 ok
--   ④ 한꺼번에 — 아직 체크 안 한 확정자만 · 이미 체크한 칸(지각·공결)은 안 덮음 · 확정 아닌 분은 안 들어감 · 다시 하면 0
--   ⑤ 회차 바꾸기(id 로 맞춘다) — 출석 있는 회차를 빼면 has-attendance(nos) · 아무것도 안 바뀜 · 날짜만 고치면 됨(id·출석 그대로) · 출석 없는 회차는 빠짐
--      (가운데 회차 지우기·번호 다시 매기기·다른 강좌 id 는 edu_sessions_renumber.dev.sql)
--   ⑥ 끝난·보관 강좌 — set·bulk 모두 course-closed · 쓰기 없음
--   ⑦ 틀린 값 — bad-state · 없는 회차·신청 not-found · bulk 의 null 상태는 bad-state
--   ⑧ 회차 줄을 바로 지우려 해도 출석이 있으면 FK(restrict)가 막는다 · 신청 줄을 지우면 출석도 함께(cascade)
begin;
do $$
declare
  tag text := substr(md5(random()::text || clock_timestamp()::text), 1, 8);
  ca uuid; cb uuid; aid uuid; i int; r jsonb; x bigint;
  e bigint[] := array[]::bigint[];      -- A 강좌 신청 1..7(1~4 확정 · 5 신청 · 6 대기 · 7 취소)
  eb bigint;                            -- B 강좌 확정 한 분
  sa1 bigint; sa2 bigint; sa3 bigint; sb1 bigint;
  who uuid := gen_random_uuid();        -- 체크한 담당자(가상 admin_members.id — FK 없음)
begin
  if (select count(*) from public.users) > 200 then raise exception '운영 같은 DB 입니다(users > 200) — 개발에서만 돌리세요'; end if;
  if to_regclass('public.edu_attendance') is null then raise exception 'edu_attendance 표가 없습니다 — edu.sql 을 먼저 돌리세요'; end if;

  insert into public.edu_courses(title, kind, status) values ('출석 시험 A ' || tag, 'regular', 'running') returning id into ca;
  insert into public.edu_courses(title, kind, status) values ('출석 시험 B ' || tag, 'regular', 'open') returning id into cb;
  r := edu_sessions_replace(ca, '[{"no":1,"on_date":"2027-03-03"},{"no":2,"on_date":"2027-03-10"},{"no":3,"on_date":"2027-03-17"}]'::jsonb);
  if r->>'ok' is distinct from 'true' then raise exception 'A 회차: %', r; end if;
  r := edu_sessions_replace(cb, '[{"no":1,"on_date":"2027-04-01"}]'::jsonb);
  select id into sa1 from public.edu_sessions where course_id = ca and no = 1;
  select id into sa2 from public.edu_sessions where course_id = ca and no = 2;
  select id into sa3 from public.edu_sessions where course_id = ca and no = 3;
  select id into sb1 from public.edu_sessions where course_id = cb and no = 1;

  for i in 1..7 loop
    insert into public.users(identity_key, type, gu, mok, name) values ('교구|출석시험|1|||' || tag || i, '교구', '출석시험', '1', tag || i) returning id into aid;
    insert into public.edu_enrollments(course_id, user_id, name, status) values (ca, aid, tag || i,
      case when i <= 4 then 'confirmed' when i = 5 then 'applied' when i = 6 then 'waitlisted' else 'cancelled' end) returning id into x;
    e := e || x;
  end loop;
  insert into public.users(identity_key, type, gu, mok, name) values ('교구|출석시험|1|||' || tag || 'b', '교구', '출석시험', '1', tag || 'b') returning id into aid;
  insert into public.edu_enrollments(course_id, user_id, name, status) values (cb, aid, tag || 'b', 'confirmed') returning id into eb;

  -- ① 같은 강좌 검사(양쪽 방향)
  r := edu_attendance_set(sb1, e[1], 'present', who);
  if r->>'error' is distinct from 'wrong-course' then raise exception '① B 회차 × A 신청: %', r; end if;
  r := edu_attendance_set(sa1, eb, 'present', who);
  if r->>'error' is distinct from 'wrong-course' then raise exception '① A 회차 × B 신청: %', r; end if;
  r := edu_attendance_set(sb1, e[1], null, who);
  if r->>'error' is distinct from 'wrong-course' then raise exception '① 지우기도 같은 강좌만: %', r; end if;
  if exists (select 1 from public.edu_attendance where enrollment_id in (e[1], eb)) then raise exception '① 다른 강좌인데 썼다'; end if;

  -- ② 확정이 아닌 신청
  for i in 5..7 loop
    r := edu_attendance_set(sa1, e[i], 'present', who);
    if r->>'error' is distinct from 'not-confirmed' then raise exception '② % 번: %', i, r; end if;
  end loop;
  update public.edu_enrollments set status = 'declined' where id = e[7];
  r := edu_attendance_set(sa1, e[7], 'absent', who);
  if r->>'error' is distinct from 'not-confirmed' then raise exception '② 반려: %', r; end if;
  update public.edu_enrollments set status = 'cancelled' where id = e[7];
  if exists (select 1 from public.edu_attendance where enrollment_id in (e[5], e[6], e[7])) then raise exception '② 확정 아닌데 썼다'; end if;
  -- 확정일 때 체크한 칸 → 대기로 내려간 뒤: 쓰기는 not-confirmed · 지우기(null)는 된다
  update public.edu_enrollments set status = 'confirmed' where id = e[6];
  r := edu_attendance_set(sa1, e[6], 'present', who);
  if r->>'state' is distinct from 'present' then raise exception '② 확정일 때 쓰기: %', r; end if;
  update public.edu_enrollments set status = 'waitlisted' where id = e[6];
  r := edu_attendance_set(sa1, e[6], 'late', who);
  if r->>'error' is distinct from 'not-confirmed' then raise exception '② 내려간 뒤 쓰기: %', r; end if;
  if (select state from public.edu_attendance where enrollment_id = e[6] and session_id = sa1) is distinct from 'present' then raise exception '② 거절했는데 바뀜'; end if;
  r := edu_attendance_set(sa1, e[6], null, who);
  if r is distinct from '{"ok":true,"state":null,"cleared":true}'::jsonb then raise exception '② 확정 아닌 줄 지우기: %', r; end if;
  if exists (select 1 from public.edu_attendance where enrollment_id = e[6]) then raise exception '② 지웠는데 남음'; end if;

  -- ③ 쓰기·고치기·지우기
  r := edu_attendance_set(sa1, e[1], 'present', who);
  if r is distinct from '{"ok":true,"state":"present"}'::jsonb then raise exception '③ 쓰기: %', r; end if;
  if (select marked_by from public.edu_attendance where enrollment_id = e[1] and session_id = sa1) is distinct from who then raise exception '③ marked_by'; end if;
  r := edu_attendance_set(sa1, e[1], 'late', null);
  if r->>'state' is distinct from 'late' then raise exception '③ 고치기: %', r; end if;
  if (select count(*) from public.edu_attendance where enrollment_id = e[1] and session_id = sa1) is distinct from 1::bigint then raise exception '③ 줄이 둘'; end if;
  if (select state from public.edu_attendance where enrollment_id = e[1] and session_id = sa1) is distinct from 'late' then raise exception '③ 덮지 않음'; end if;
  if (select marked_by from public.edu_attendance where enrollment_id = e[1] and session_id = sa1) is not null then raise exception '③ 고친 분(null)으로 안 바뀜'; end if;
  r := edu_attendance_set(sa1, e[1], null, who);
  if r is distinct from '{"ok":true,"state":null,"cleared":true}'::jsonb then raise exception '③ 지우기: %', r; end if;
  if exists (select 1 from public.edu_attendance where enrollment_id = e[1] and session_id = sa1) then raise exception '③ 지웠는데 남음'; end if;
  r := edu_attendance_set(sa1, e[1], null, who);
  if r is distinct from '{"ok":true,"state":null,"cleared":false}'::jsonb then raise exception '③ 없는 칸 지우기: %', r; end if;

  -- ④ 한꺼번에 — 1번 지각 · 2번 공결 미리 체크 → 남은 확정자(3·4번)만 출석
  perform edu_attendance_set(sa2, e[1], 'late', who);
  perform edu_attendance_set(sa2, e[2], 'excused', who);
  r := edu_attendance_bulk(sa2, 'present', who);
  if r is distinct from '{"ok":true,"count":2}'::jsonb then raise exception '④ 한꺼번에: %', r; end if;
  if (select state from public.edu_attendance where enrollment_id = e[1] and session_id = sa2) is distinct from 'late' then raise exception '④ 지각을 덮음'; end if;
  if (select state from public.edu_attendance where enrollment_id = e[2] and session_id = sa2) is distinct from 'excused' then raise exception '④ 공결을 덮음'; end if;
  if (select count(*) from public.edu_attendance where session_id = sa2 and state = 'present' and enrollment_id in (e[3], e[4])) is distinct from 2::bigint then raise exception '④ 남은 분이 출석이 아님'; end if;
  if exists (select 1 from public.edu_attendance where session_id = sa2 and enrollment_id in (e[5], e[6], e[7])) then raise exception '④ 확정 아닌 분이 들어감'; end if;
  if (select count(*) from public.edu_attendance where session_id = sa2) is distinct from 4::bigint then raise exception '④ 회차 줄 수'; end if;
  r := edu_attendance_bulk(sa2, 'absent', who);
  if r is distinct from '{"ok":true,"count":0}'::jsonb then raise exception '④ 다시 하면 0: %', r; end if;
  if exists (select 1 from public.edu_attendance where session_id = sa2 and state = 'absent') then raise exception '④ 두 번째가 덮음'; end if;
  if exists (select 1 from public.edu_attendance where session_id = sb1) then raise exception '④ 다른 강좌 회차에 들어감'; end if;

  -- ⑤ 회차 바꾸기 — 2번 회차(출석 있음)를 빼면 거절 · 아무것도 안 바뀜(3번을 2번으로 당겨 보내도)
  r := edu_sessions_replace(ca, jsonb_build_array(jsonb_build_object('id', sa1, 'no', 1, 'on_date', '2027-03-03'),
                                                  jsonb_build_object('id', sa3, 'no', 2, 'on_date', '2027-03-17')));
  if r->>'error' is distinct from 'has-attendance' or r->'nos' is distinct from '[2]'::jsonb then raise exception '⑤ 출석 있는 회차 빼기: %', r; end if;
  if (select count(*) from public.edu_sessions where course_id = ca) is distinct from 3::bigint then raise exception '⑤ 회차가 바뀜'; end if;
  if (select count(*) from public.edu_attendance where session_id = sa2) is distinct from 4::bigint then raise exception '⑤ 출석이 바뀜'; end if;
  -- 날짜·주제만 고치면 된다(같은 번호 = 같은 id · 출석 그대로) · 출석 없는 3번은 빠진다
  r := edu_sessions_replace(ca, jsonb_build_array(jsonb_build_object('id', sa1, 'no', 1, 'on_date', '2027-03-04'),
                                                  jsonb_build_object('id', sa2, 'no', 2, 'on_date', '2027-03-11', 'topic', '바뀜')));
  if r is distinct from '{"ok":true,"count":2}'::jsonb then raise exception '⑤ 고치기: %', r; end if;
  if (select id from public.edu_sessions where course_id = ca and no = 2) is distinct from sa2 then raise exception '⑤ 2번 id 가 바뀜'; end if;
  if (select on_date from public.edu_sessions where id = sa2) is distinct from date '2027-03-11' then raise exception '⑤ 날짜가 안 바뀜'; end if;
  if (select count(*) from public.edu_attendance where session_id = sa2) is distinct from 4::bigint then raise exception '⑤ 고친 뒤 출석이 바뀜'; end if;
  if exists (select 1 from public.edu_sessions where id = sa3) then raise exception '⑤ 출석 없는 3번이 남음'; end if;
  -- 빈 목록(모두 빼기)도 출석 있는 회차가 있으면 거절
  r := edu_sessions_replace(ca, '[]'::jsonb);
  if r->>'error' is distinct from 'has-attendance' or r->'nos' is distinct from '[2]'::jsonb then raise exception '⑤ 모두 빼기: %', r; end if;

  -- ⑥ 끝난·보관 강좌
  update public.edu_courses set status = 'done' where id = ca;
  r := edu_attendance_set(sa1, e[3], 'present', who);
  if r->>'error' is distinct from 'course-closed' then raise exception '⑥ done set: %', r; end if;
  r := edu_attendance_bulk(sa1, 'present', who);
  if r->>'error' is distinct from 'course-closed' then raise exception '⑥ done bulk: %', r; end if;
  r := edu_attendance_set(sa2, e[1], null, who);
  if r->>'error' is distinct from 'course-closed' then raise exception '⑥ done 지우기: %', r; end if;
  update public.edu_courses set status = 'archived' where id = ca;
  r := edu_attendance_set(sa1, e[3], 'present', who);
  if r->>'error' is distinct from 'course-closed' then raise exception '⑥ archived set: %', r; end if;
  r := edu_attendance_bulk(sa1, 'present', who);
  if r->>'error' is distinct from 'course-closed' then raise exception '⑥ archived bulk: %', r; end if;
  if exists (select 1 from public.edu_attendance where session_id = sa1) then raise exception '⑥ 닫힌 강좌에 썼다'; end if;
  if (select state from public.edu_attendance where enrollment_id = e[1] and session_id = sa2) is distinct from 'late' then raise exception '⑥ 닫힌 강좌에서 지워짐'; end if;
  update public.edu_courses set status = 'running' where id = ca;

  -- ⑦ 틀린 값
  r := edu_attendance_set(sa1, e[1], 'here', who);
  if r->>'error' is distinct from 'bad-state' then raise exception '⑦ bad-state: %', r; end if;
  r := edu_attendance_bulk(sa1, null, who);
  if r->>'error' is distinct from 'bad-state' then raise exception '⑦ bulk null: %', r; end if;
  r := edu_attendance_set(-1, e[1], 'present', who);
  if r->>'error' is distinct from 'not-found' then raise exception '⑦ 없는 회차: %', r; end if;
  r := edu_attendance_set(sa1, -1, 'present', who);
  if r->>'error' is distinct from 'not-found' then raise exception '⑦ 없는 신청: %', r; end if;
  r := edu_attendance_bulk(-1, 'present', who);
  if r->>'error' is distinct from 'not-found' then raise exception '⑦ bulk 없는 회차: %', r; end if;

  -- ⑧ FK — 회차 줄을 바로 지우면 restrict · 신청 줄을 지우면 출석도 함께
  begin
    delete from public.edu_sessions where id = sa2;
    raise exception '⑧ 출석 있는 회차가 지워졌다';
  exception when foreign_key_violation then null;
  end;
  delete from public.edu_enrollments where id = e[3];
  if exists (select 1 from public.edu_attendance where enrollment_id = e[3]) then raise exception '⑧ 신청을 지웠는데 출석이 남음'; end if;
end $$;
select '통과' as result;
rollback;
