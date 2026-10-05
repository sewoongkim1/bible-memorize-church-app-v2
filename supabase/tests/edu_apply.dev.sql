-- 교육신청 규칙 확인 — **개발에서만**(BEGIN … ROLLBACK). 운영에서 돌리지 않는다.
-- 끝에 「통과」 한 줄(select)이 나오면 끝. 하나라도 어긋나면 raise exception 으로 멈춘다(그때도 ROLLBACK 이라 남는 것 없음).
-- 비교는 전부 `is distinct from` — 함수가 오류를 내서 값이 NULL 이어도 조용히 지나가지 않게.
begin;
do $$
declare cid uuid; aid uuid; u uuid[] := array[]::uuid[]; r jsonb; i int; k text; e1 bigint; e2 bigint; e3 bigint; e4 bigint; e5 bigint;
begin
  if (select count(*) from public.users) > 200 then raise exception '운영 같은 DB 입니다(users > 200) — 개발에서만 돌리세요'; end if;
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

  r := edu_apply(cid, u[1], '{"name":"시험1"}'); if r->>'status' is distinct from 'confirmed' then raise exception '1: %', r; end if;
  r := edu_apply(cid, u[2], '{"name":"시험2"}'); if r->>'status' is distinct from 'confirmed' then raise exception '2: %', r; end if;
  r := edu_apply(cid, u[3], '{"name":"시험3"}'); if r->>'status' is distinct from 'waitlisted' then raise exception '3: %', r; end if;
  r := edu_apply(cid, u[4], '{"name":"시험4"}'); if r->>'status' is distinct from 'waitlisted' then raise exception '4: %', r; end if;
  r := edu_apply(cid, u[1], '{"name":"시험1"}'); if (r->>'already')::boolean is not true then raise exception '중복: %', r; end if;
  select id into e1 from public.edu_enrollments where course_id = cid and user_id = u[1];
  select id into e2 from public.edu_enrollments where course_id = cid and user_id = u[2];
  select id into e3 from public.edu_enrollments where course_id = cid and user_id = u[3];
  select id into e4 from public.edu_enrollments where course_id = cid and user_id = u[4];

  -- 확정 한 분 취소 → 대기 첫 분(시험3) 확정
  r := edu_cancel(e1, false);
  if r->>'ok' is distinct from 'true' or (r->>'promoted')::bigint is distinct from e3 then raise exception '대기 올림: %', r; end if;
  if (select status from public.edu_enrollments where id = e3) is distinct from 'confirmed' then raise exception '대기 올림 상태'; end if;
  if (select status from public.edu_enrollments where id = e4) is distinct from 'waitlisted' then raise exception '둘째 대기는 그대로'; end if;

  -- 취소했던 분이 다시 신청 → 정원 찼으니 대기(줄은 하나 · 되살림)
  r := edu_apply(cid, u[1], '{"name":"시험1"}'); if r->>'status' is distinct from 'waitlisted' then raise exception '다시 신청: %', r; end if;
  if (select count(*) from public.edu_enrollments where course_id = cid and user_id = u[1]) is distinct from 1 then raise exception '줄이 둘'; end if;

  -- 대기 순서는 waitlist_at 을 따른다(id 가 아니라). 같은 트랜잭션은 now() 가 같으니 시험4 를 1분 앞당긴다.
  -- 지금 확정 시험2·시험3 · 대기 시험4(id 큼)·시험1(id 작음). id 순이면 시험1, 시각 순이면 시험4.
  update public.edu_enrollments set waitlist_at = now() - interval '1 minute' where id = e4;
  r := edu_cancel(e2, false);
  if (r->>'promoted')::bigint is distinct from e4 then raise exception '대기 순서(waitlist_at): %', r; end if;
  if (select status from public.edu_enrollments where id = e1) is distinct from 'waitlisted' then raise exception '시험1 은 대기 그대로'; end if;

  -- 확정(시험3·시험4)→대기: 다른 대기자(시험1)가 있으면 그분이 오르고, 내려간 분은 되올라오지 않는다
  r := edu_staff_set(e4, 'waitlisted', false);
  if r->>'ok' is distinct from 'true' or (r->>'promoted')::bigint is distinct from e1 then raise exception '내림→다른 분 올림: %', r; end if;
  if (select status from public.edu_enrollments where id = e4) is distinct from 'waitlisted' then raise exception '내려간 분이 되올라옴'; end if;
  -- 이제 확정 시험3·시험1 · 대기 시험4. 시험1 을 내리면 시험4 가 오른다(내려간 시험1 은 맨 뒤)
  r := edu_staff_set(e1, 'waitlisted', false);
  if (r->>'promoted')::bigint is distinct from e4 then raise exception '내림 둘째: %', r; end if;
  r := edu_cancel(e1, true);                      -- 대기자 시험1 취소 → 이제 대기자 없음
  if r->>'ok' is distinct from 'true' then raise exception '시험1 취소: %', r; end if;
  -- 대기자 없을 때 확정→대기는 되올라오지 않고 대기에 머문다
  r := edu_staff_set(e4, 'waitlisted', false);
  if r->>'ok' is distinct from 'true' or r->'promoted' is distinct from 'null'::jsonb then raise exception '대기자 없음 내림: %', r; end if;
  if (select status from public.edu_enrollments where id = e4) is distinct from 'waitlisted' then raise exception '되올라옴(대기자 없음)'; end if;
  r := edu_staff_set(e4, 'confirmed', false);    -- 자리가 비어 있으니 다시 확정
  if r->>'ok' is distinct from 'true' then raise exception '다시 확정: %', r; end if;

  -- 담당자 확정은 정원을 본다 · force 면 넘긴다 (확정 시험3·시험4 = 정원 2, 시험1 신청 → 대기)
  r := edu_apply(cid, u[1], '{"name":"시험1"}'); if r->>'status' is distinct from 'waitlisted' then raise exception '시험1 재신청: %', r; end if;
  r := edu_staff_set(e1, 'confirmed', false); if r->>'error' is distinct from 'full' then raise exception '정원: %', r; end if;
  r := edu_staff_set(e1, 'confirmed', true);  if (r->>'ok')::boolean is not true then raise exception 'force: %', r; end if;
  r := edu_staff_set(-1, 'confirmed', false); if r->>'error' is distinct from 'not-found' then raise exception '없는 줄: %', r; end if;
  r := edu_staff_set(e1, null, false);        if r->>'error' is distinct from 'bad-status' then raise exception 'null status: %', r; end if;
  r := edu_staff_set(e1, 'zzz', false);       if r->>'error' is distinct from 'bad-status' then raise exception 'bad-status: %', r; end if;

  -- 첫 회차 당일에는 성도님 취소 불가 · 담당자는 됨 (시험3 확정 취소)
  update public.edu_sessions set on_date = edu_today() where course_id = cid;
  r := edu_cancel(e3, false); if r->>'error' is distinct from 'too-late' then raise exception '마감: %', r; end if;
  r := edu_cancel(e3, true);  if (r->>'ok')::boolean is not true then raise exception '담당자 취소: %', r; end if;
  r := edu_cancel(e3, true);  if r->>'error' is distinct from 'not-active' then raise exception 'not-active: %', r; end if;
  r := edu_cancel(-1, true);  if r->>'error' is distinct from 'not-found' then raise exception '취소 없는 줄: %', r; end if;

  -- 승인 강좌 — 신청은 applied · 확정을 취소해도 대기자를 올리지 않는다
  update public.edu_courses set mode = 'approve' where id = cid;
  r := edu_apply(cid, u[5], '{"name":"시험5"}'); if r->>'status' is distinct from 'applied' then raise exception '승인: %', r; end if;
  select id into e5 from public.edu_enrollments where course_id = cid and user_id = u[5];
  r := edu_staff_set(e5, 'waitlisted', false);   -- 시험5 를 대기로
  if r->>'ok' is distinct from 'true' then raise exception '시험5 대기: %', r; end if;
  r := edu_cancel(e4, true);                     -- 확정(시험4) 취소 — approve 라 올리지 않는다
  if r->>'ok' is distinct from 'true' or r->'promoted' is distinct from 'null'::jsonb then raise exception '승인 강좌는 안 올린다: %', r; end if;
  if (select status from public.edu_enrollments where id = e5) is distinct from 'waitlisted' then raise exception '시험5 는 대기 그대로'; end if;

  -- 대기 없는 선착순은 full (확정 시험1 한 분, 정원 1)
  update public.edu_courses set mode = 'auto', waitlist = false, capacity = 1 where id = cid;
  delete from public.edu_enrollments where id = e5;
  r := edu_apply(cid, u[5], '{"name":"시험5"}'); if r->>'error' is distinct from 'full' then raise exception '대기 없음: %', r; end if;

  -- 반려 유지: 반려된 분이 다시 신청해도 되살아나지 않는다 · 담당자 대신 등록은 되살린다
  r := edu_staff_set(e2, 'declined', false); if r->>'ok' is distinct from 'true' then raise exception '반려: %', r; end if;
  r := edu_apply(cid, u[2], '{"name":"시험2"}');
  if r->>'status' is distinct from 'declined' or (r->>'already')::boolean is not true then raise exception '반려 유지: %', r; end if;
  if (select status from public.edu_enrollments where id = e2) is distinct from 'declined' then raise exception '반려 행이 바뀜'; end if;
  r := edu_apply(cid, u[2], '{"name":"시험2"}', true);
  if r->>'ok' is distinct from 'true' or r->>'status' is distinct from 'waitlisted' then raise exception '담당자는 되살림: %', r; end if;

  -- 취소됐던 줄을 담당자가 대기로 되돌리면 옛 시각을 쓰지 않고 줄 맨 뒤(시험2 는 지금 대기 중)
  update public.edu_enrollments set waitlist_at = now() - interval '1 minute' where id = e2;
  update public.edu_enrollments set waitlist_at = now() - interval '1 day' where id = e4;   -- e4 는 위에서 취소됐다
  r := edu_staff_set(e4, 'waitlisted', false); if r->>'ok' is distinct from 'true' then raise exception '취소→대기: %', r; end if;
  if (select waitlist_at from public.edu_enrollments where id = e4) <= (select waitlist_at from public.edu_enrollments where id = e2) then raise exception '새치기: 되돌린 줄이 기존 대기자보다 앞'; end if;

  -- 모집 전·후·준비 중 · null p_staff 는 성도님 길
  update public.edu_courses set waitlist = true, capacity = null, status = 'draft' where id = cid;
  r := edu_apply(cid, u[5], '{"name":"시험5"}'); if r->>'error' is distinct from 'not-open' then raise exception 'draft: %', r; end if;
  r := edu_apply(cid, u[5], '{"name":"시험5"}', null); if r->>'error' is distinct from 'not-open' then raise exception 'null staff: %', r; end if;
  update public.edu_courses set status = 'open', apply_from = edu_today() + 1 where id = cid;
  r := edu_apply(cid, u[5], '{"name":"시험5"}'); if r->>'error' is distinct from 'not-yet' then raise exception 'not-yet: %', r; end if;
  -- 담당자 대신 등록은 창을 건너뛴다 · 계정 없는 새가족은 신원 키로 한 줄
  r := edu_apply(cid, null, '{"name":"새가족","ident_key":"새가족|홍길동"}', true); if r->>'status' is distinct from 'confirmed' then raise exception '대신: %', r; end if;
  r := edu_apply(cid, null, '{"name":"새가족","ident_key":"새가족|홍길동"}', true); if (r->>'already')::boolean is not true then raise exception '대신 중복: %', r; end if;
  -- 신청 기간이 지났다
  update public.edu_courses set apply_from = null, apply_to = edu_today() - 1 where id = cid;
  r := edu_apply(cid, u[5], '{"name":"시험5"}'); if r->>'error' is distinct from 'closed-period' then raise exception 'closed-period: %', r; end if;

  -- 잘못된 신원 · 없는 강좌
  r := edu_apply(cid, u[5], '{"name":" "}', true);                     if r->>'error' is distinct from 'bad-ident' then raise exception 'bad-ident 이름: %', r; end if;
  r := edu_apply(cid, null, '{"name":"익명"}', true);                   if r->>'error' is distinct from 'bad-ident' then raise exception 'bad-ident 키 없음: %', r; end if;
  r := edu_apply(cid, null, '{"name":"익명","ident_key":"x"}', false);  if r->>'error' is distinct from 'bad-ident' then raise exception 'bad-ident 성도님 계정 없음: %', r; end if;
  r := edu_apply(gen_random_uuid(), u[5], '{"name":"시험5"}');          if r->>'error' is distinct from 'not-found' then raise exception 'not-found: %', r; end if;

  -- 담당자도 끝난·보관된 강좌에는 못 넣는다
  update public.edu_courses set status = 'done' where id = cid;
  r := edu_apply(cid, u[5], '{"name":"시험5"}', true); if r->>'error' is distinct from 'not-open' then raise exception 'done 담당자: %', r; end if;
  update public.edu_courses set status = 'archived' where id = cid;
  r := edu_apply(cid, u[5], '{"name":"시험5"}', true); if r->>'error' is distinct from 'not-open' then raise exception 'archived 담당자: %', r; end if;
  r := edu_apply(cid, u[5], '{"name":"시험5"}');       if r->>'error' is distinct from 'not-open' then raise exception 'archived 성도님: %', r; end if;

  -- 끝난·보관된 강좌의 신청 상태는 담당자도 못 바꾼다(course-closed · force 여도) · 줄은 그대로 (지금 시험2 는 대기)
  r := edu_staff_set(e2, 'confirmed', true);  if r->>'error' is distinct from 'course-closed' then raise exception 'archived 상태 바꾸기: %', r; end if;
  update public.edu_courses set status = 'done' where id = cid;
  r := edu_staff_set(e2, 'declined', false);  if r->>'error' is distinct from 'course-closed' then raise exception 'done 상태 바꾸기: %', r; end if;
  if (select status from public.edu_enrollments where id = e2) is distinct from 'waitlisted' then raise exception '끝난 강좌인데 줄이 바뀜'; end if;
end $$;
select '통과' as result;
rollback;
