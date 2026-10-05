-- 교육신청 2단계(검토 반영 2026-10-05) — 회차는 **id 로** 맞춘다: 가운데 회차를 지우고 번호를 다시 매겨도 출석이 제 날짜에 남는가.
--   **개발에서만**(BEGIN … ROLLBACK). 끝에 「통과」 한 줄이 나오면 끝. 비교는 `is distinct from`.
-- ⚠️ 이 저장소는 공개입니다 — 아래 이름은 모두 가상입니다. 한글이 든 SQL 은 명령줄에 붙이지 말고 -f 로만 돌린다.
--   ① 출석 있는 가운데 회차(2회)를 지우며 번호를 당기면 has-attendance(nos = 지금 번호 [2]) · 회차·번호·날짜·출석 그대로
--   ② 출석 없는 가운데 회차(3회)를 지우며 번호를 당기면 된다 — 남은 회차 id 그대로 · 번호 1..4 · 출석은 제 회차(제 날짜)에
--   ③ 번호 뒤집기(4·3·2·1)·맞바꾸기 + 새 회차(id 없음)가 옛 번호를 가져가도 unique(course_id,no) 에 안 걸린다 · 함수 뒤에는 다시 즉시 검사
--   ④ 다른 강좌의 회차 id · 없는 id · 같은 id 둘 · 같은 번호 둘 · 번호·날짜 없음 · 번호 범위 밖 → bad-rows(아무것도 안 바뀜)
begin;
do $$
declare
  tag text := substr(md5(random()::text || clock_timestamp()::text), 1, 8);
  ca uuid; cb uuid; aid uuid; r jsonb; e1 bigint; e2 bigint;
  s1 bigint; s2 bigint; s3 bigint; s4 bigint; s5 bigint; sb bigint; sn bigint;
  snap text;
begin
  if (select count(*) from public.users) > 200 then raise exception '운영 같은 DB 입니다(users > 200) — 개발에서만 돌리세요'; end if;
  if to_regclass('public.edu_attendance') is null then raise exception 'edu_attendance 표가 없습니다 — edu.sql 을 먼저 돌리세요'; end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.edu_sessions'::regclass and conname = 'edu_sessions_course_id_no_key' and condeferrable) then
    raise exception 'unique(course_id,no) 가 deferrable 이 아니다 — edu.sql 을 다시 돌리세요';
  end if;

  insert into public.edu_courses(title, kind, status) values ('번호 시험 A ' || tag, 'regular', 'running') returning id into ca;
  insert into public.edu_courses(title, kind, status) values ('번호 시험 B ' || tag, 'regular', 'running') returning id into cb;
  r := edu_sessions_replace(ca, '[{"no":1,"on_date":"2027-03-01"},{"no":2,"on_date":"2027-03-08"},{"no":3,"on_date":"2027-03-15"},{"no":4,"on_date":"2027-03-22"},{"no":5,"on_date":"2027-03-29"}]'::jsonb);
  if r is distinct from '{"ok":true,"count":5}'::jsonb then raise exception '처음 다섯: %', r; end if;
  r := edu_sessions_replace(cb, '[{"no":1,"on_date":"2027-04-01"}]'::jsonb);
  select id into s1 from public.edu_sessions where course_id = ca and no = 1;
  select id into s2 from public.edu_sessions where course_id = ca and no = 2;
  select id into s3 from public.edu_sessions where course_id = ca and no = 3;
  select id into s4 from public.edu_sessions where course_id = ca and no = 4;
  select id into s5 from public.edu_sessions where course_id = ca and no = 5;
  select id into sb from public.edu_sessions where course_id = cb;

  insert into public.users(identity_key, type, gu, mok, name) values ('교구|번호시험|1|||' || tag || '1', '교구', '번호시험', '1', tag || '1') returning id into aid;
  insert into public.edu_enrollments(course_id, user_id, name, status) values (ca, aid, tag || '1', 'confirmed') returning id into e1;
  insert into public.users(identity_key, type, gu, mok, name) values ('교구|번호시험|1|||' || tag || '2', '교구', '번호시험', '1', tag || '2') returning id into aid;
  insert into public.edu_enrollments(course_id, user_id, name, status) values (ca, aid, tag || '2', 'confirmed') returning id into e2;
  -- 출석: 2회 e1 출석 · 4회 e1 지각·e2 결석 · 5회 e2 공결 (3회는 없음)
  perform edu_attendance_set(s2, e1, 'present', null);
  perform edu_attendance_set(s4, e1, 'late', null);
  perform edu_attendance_set(s4, e2, 'absent', null);
  perform edu_attendance_set(s5, e2, 'excused', null);
  select string_agg(s.id || ':' || s.no || ':' || s.on_date, ',' order by s.id) into snap from public.edu_sessions s where s.course_id = ca;

  -- ① 출석 있는 2회를 지우며 3·4·5 → 2·3·4 로 당긴다 → 거절(지금 번호 [2]) · 아무것도 안 바뀜
  r := edu_sessions_replace(ca, jsonb_build_array(
    jsonb_build_object('id', s1, 'no', 1, 'on_date', '2027-03-01'), jsonb_build_object('id', s3, 'no', 2, 'on_date', '2027-03-15'),
    jsonb_build_object('id', s4, 'no', 3, 'on_date', '2027-03-22'), jsonb_build_object('id', s5, 'no', 4, 'on_date', '2027-03-29')));
  if r->>'error' is distinct from 'has-attendance' or r->'nos' is distinct from '[2]'::jsonb then raise exception '① 출석 있는 가운데 회차: %', r; end if;
  if (select string_agg(s.id || ':' || s.no || ':' || s.on_date, ',' order by s.id) from public.edu_sessions s where s.course_id = ca) is distinct from snap then
    raise exception '① 거절했는데 회차가 바뀜'; end if;
  if (select count(*) from public.edu_attendance where enrollment_id in (e1, e2)) is distinct from 4::bigint then raise exception '① 출석이 바뀜'; end if;

  -- ② 출석 없는 3회를 지우며 4·5 → 3·4 로 당긴다 → 된다 · id 그대로 · 출석은 제 회차·제 날짜
  r := edu_sessions_replace(ca, jsonb_build_array(
    jsonb_build_object('id', s1, 'no', 1, 'on_date', '2027-03-01'), jsonb_build_object('id', s2, 'no', 2, 'on_date', '2027-03-08'),
    jsonb_build_object('id', s4, 'no', 3, 'on_date', '2027-03-22'), jsonb_build_object('id', s5, 'no', 4, 'on_date', '2027-03-29')));
  if r is distinct from '{"ok":true,"count":4}'::jsonb then raise exception '② 출석 없는 가운데 회차: %', r; end if;
  if exists (select 1 from public.edu_sessions where id = s3) then raise exception '② 3회가 남음'; end if;
  if (select string_agg(s.id || ':' || s.no || ':' || s.on_date, ',' order by s.no) from public.edu_sessions s where s.course_id = ca)
     is distinct from (s1 || ':1:2027-03-01,' || s2 || ':2:2027-03-08,' || s4 || ':3:2027-03-22,' || s5 || ':4:2027-03-29') then
    raise exception '② id·번호·날짜: %', (select string_agg(s.id || ':' || s.no || ':' || s.on_date, ',' order by s.no) from public.edu_sessions s where s.course_id = ca); end if;
  -- 출석은 회차 id 를 따라간다 — 날짜로 다시 본다
  if (select a.state from public.edu_attendance a join public.edu_sessions s on s.id = a.session_id where a.enrollment_id = e1 and s.on_date = '2027-03-08') is distinct from 'present'
     or (select a.state from public.edu_attendance a join public.edu_sessions s on s.id = a.session_id where a.enrollment_id = e1 and s.on_date = '2027-03-22') is distinct from 'late'
     or (select a.state from public.edu_attendance a join public.edu_sessions s on s.id = a.session_id where a.enrollment_id = e2 and s.on_date = '2027-03-22') is distinct from 'absent'
     or (select a.state from public.edu_attendance a join public.edu_sessions s on s.id = a.session_id where a.enrollment_id = e2 and s.on_date = '2027-03-29') is distinct from 'excused' then
    raise exception '② 출석이 제 날짜에 없다'; end if;
  if (select count(*) from public.edu_attendance where enrollment_id in (e1, e2)) is distinct from 4::bigint then raise exception '② 출석 수'; end if;

  -- ③ 번호 뒤집기(4·3·2·1) + 새 회차가 옛 번호(… 5)를 가져간다 — 한 번에(두 단계 번호 없이) unique 에 안 걸린다
  r := edu_sessions_replace(ca, jsonb_build_array(
    jsonb_build_object('id', s1, 'no', 4, 'on_date', '2027-03-01'), jsonb_build_object('id', s2, 'no', 3, 'on_date', '2027-03-08'),
    jsonb_build_object('id', s4, 'no', 2, 'on_date', '2027-03-22'), jsonb_build_object('id', s5, 'no', 1, 'on_date', '2027-03-29'),
    jsonb_build_object('no', 5, 'on_date', '2027-04-05', 'topic', '새 회차')));
  if r is distinct from '{"ok":true,"count":5}'::jsonb then raise exception '③ 뒤집기: %', r; end if;
  if (select string_agg(s.id::text, ',' order by s.no) from public.edu_sessions s where s.course_id = ca and s.id in (s1, s2, s4, s5))
     is distinct from (s5 || ',' || s4 || ',' || s2 || ',' || s1) then raise exception '③ 뒤집은 차례'; end if;
  select id into sn from public.edu_sessions where course_id = ca and no = 5;
  if sn is null or sn in (s1, s2, s3, s4, s5) or (select topic from public.edu_sessions where id = sn) is distinct from '새 회차' then raise exception '③ 새 회차'; end if;
  -- 맞바꾸기(1 ↔ 2)
  r := edu_sessions_replace(ca, jsonb_build_array(
    jsonb_build_object('id', s1, 'no', 4, 'on_date', '2027-03-01'), jsonb_build_object('id', s2, 'no', 3, 'on_date', '2027-03-08'),
    jsonb_build_object('id', s4, 'no', 1, 'on_date', '2027-03-22'), jsonb_build_object('id', s5, 'no', 2, 'on_date', '2027-03-29'),
    jsonb_build_object('id', sn, 'no', 5, 'on_date', '2027-04-05')));
  if r->>'ok' is distinct from 'true' then raise exception '③ 맞바꾸기: %', r; end if;
  if (select no from public.edu_sessions where id = s4) is distinct from 1 or (select no from public.edu_sessions where id = s5) is distinct from 2 then raise exception '③ 맞바꾼 번호'; end if;
  if (select count(*) from public.edu_attendance where enrollment_id in (e1, e2)) is distinct from 4::bigint then raise exception '③ 출석 수'; end if;
  -- 함수가 끝난 뒤에는 다시 즉시 검사(같은 번호 직접 넣기는 그 자리에서 막힌다)
  begin
    insert into public.edu_sessions(course_id, no, on_date) values (ca, 1, '2027-05-01');
    raise exception '③ 같은 번호가 들어갔다(제약이 미뤄진 채 남음)';
  exception when unique_violation then null;
  end;

  -- ④ 틀린 목록 — 모두 bad-rows · 아무것도 안 바뀜
  select string_agg(s.id || ':' || s.no || ':' || s.on_date, ',' order by s.id) into snap from public.edu_sessions s where s.course_id in (ca, cb);
  r := edu_sessions_replace(ca, jsonb_build_array(jsonb_build_object('id', sb, 'no', 1, 'on_date', '2027-03-01')));
  if r->>'error' is distinct from 'bad-rows' then raise exception '④ 다른 강좌 id: %', r; end if;
  r := edu_sessions_replace(ca, jsonb_build_array(jsonb_build_object('id', s1, 'no', 1, 'on_date', '2027-03-01'), jsonb_build_object('id', 999999999999, 'no', 2, 'on_date', '2027-03-02')));
  if r->>'error' is distinct from 'bad-rows' then raise exception '④ 없는 id: %', r; end if;
  r := edu_sessions_replace(ca, jsonb_build_array(jsonb_build_object('id', s1, 'no', 1, 'on_date', '2027-03-01'), jsonb_build_object('id', s1, 'no', 2, 'on_date', '2027-03-02')));
  if r->>'error' is distinct from 'bad-rows' then raise exception '④ 같은 id 둘: %', r; end if;
  r := edu_sessions_replace(ca, jsonb_build_array(jsonb_build_object('id', s1, 'no', 1, 'on_date', '2027-03-01'), jsonb_build_object('no', 1, 'on_date', '2027-03-02')));
  if r->>'error' is distinct from 'bad-rows' then raise exception '④ 같은 번호 둘: %', r; end if;
  r := edu_sessions_replace(ca, '[{"on_date":"2027-03-01"}]'::jsonb);
  if r->>'error' is distinct from 'bad-rows' then raise exception '④ 번호 없음: %', r; end if;
  r := edu_sessions_replace(ca, '[{"no":1}]'::jsonb);
  if r->>'error' is distinct from 'bad-rows' then raise exception '④ 날짜 없음: %', r; end if;
  r := edu_sessions_replace(ca, '[{"no":201,"on_date":"2027-03-01"}]'::jsonb);
  if r->>'error' is distinct from 'bad-rows' then raise exception '④ 번호 범위: %', r; end if;
  r := edu_sessions_replace(ca, '[1,2]'::jsonb);
  if r->>'error' is distinct from 'bad-rows' then raise exception '④ 객체 아님: %', r; end if;
  if (select string_agg(s.id || ':' || s.no || ':' || s.on_date, ',' order by s.id) from public.edu_sessions s where s.course_id in (ca, cb)) is distinct from snap then
    raise exception '④ 거절했는데 회차가 바뀜'; end if;
  if (select count(*) from public.edu_sessions where course_id = cb) is distinct from 1::bigint then raise exception '④ B 회차가 바뀜'; end if;
end $$;
select '통과' as result;
rollback;
