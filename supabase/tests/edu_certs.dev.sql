-- 교육신청 3단계 — 수료 판정·수료번호(edu_check_set·edu_issue_certs·edu_revoke_cert·edu_cert_take) 확인 — **개발에서만**(BEGIN … ROLLBACK). 운영에서 돌리지 않는다.
-- 끝에 「통과」 한 줄(select)이 나오면 끝. 하나라도 어긋나면 raise exception 으로 멈춘다(그때도 ROLLBACK 이라 남는 것 없음 — 번호 차례 줄도 되돌아간다).
-- 비교는 전부 `is distinct from` — 함수가 오류를 내서 값이 NULL 이어도 조용히 지나가지 않게.
-- ⚠️ 이 저장소는 공개입니다 — 아래 이름은 모두 가상입니다. 한글이 든 SQL 은 명령줄에 붙이지 말고 -f 로만 돌린다.
-- ⚠️ 진짜 동시(두 연결이 같은 해 줄을 다툼)는 tests/edu-cert-concurrency.dev.sh — 한 연결 안에서는 겹침을 만들 수 없다.
--    여기서는 잠금 차례가 맞는지(해 줄을 for update · 번호를 덩이로)와 차례대로 부른 두 강좌가 겹치지 않는지를 본다.
--   ① 번호 꼴 「고척-YYYY-NNNN」 · 해 = 지금(now)의 한국 해 · 배열 차례대로(교회 어드민이 가나다로 세워 보낸다) · 같은 id 둘은 하나
--   ② 두 강좌 차례로 확정 — 번호가 이어지고 겹치지 않는다(해마다 모든 강좌가 한 줄)
--   ③ 해 넘김 — 한국 자정 기준(UTC 15:00) · 새 해는 0001 부터 · 해마다 따로 · 9999 다음은 10000(lpad 가 자르지 않게)
--   ④ 이미 번호가 있으면 그대로(already · 차례 안 먹음)
--   ⑤ 취소 → 번호·수료일 남김(진위 확인 「취소됨」) · 다시 확정하면 같은 번호로 되살림(restored · 차례 안 먹음) · 두 번 취소 already · 번호 없는 줄 not-completed
--   ⑥ 확정자 아닌 줄 거절(not-confirmed) · 다른 강좌 wrong-course · 없는 줄 not-found · 빈 배열 bad-ids · 보관 강좌 course-archived — 모두 아무것도 안 씀
--   ⑦ 확인 체크 — 확정자만 · 마친 강좌도 된다 · 보관 강좌 course-archived · null bad-done
--   ⑧ 번호 줄은 상태를 못 바꾼다 — edu_cancel(담당자)·edu_staff_set 이 has-cert(수료·수료 취소 둘 다)
--   ⑨ 칸 제약 — 번호 없이 수료 · 수료이면서 취소 · 틀린 꼴 · 같은 번호 둘 · 설정의 틀린 직인·긴 명의 → 막힌다
--   ⑩ 권한 — anon·authenticated 에 표·함수 권한 없음 · edu_cert_take 는 service_role 도 못 부른다 · 설정은 한 줄(기본 문안에 {과정})
begin;
do $$
declare
  tag text := substr(md5(random()::text || clock_timestamp()::text), 1, 8);
  y int := extract(year from (now() at time zone 'Asia/Seoul'))::int;
  pre text;                             -- '고척-' || y || '-'
  n0 int;                               -- 시험 전 그 해 마지막 번호
  ca uuid; cb uuid; cz uuid; aid uuid; i int; r jsonb; x bigint; nos text[];
  e bigint[] := array[]::bigint[];      -- A 강좌 신청 1..7(1~4 확정 · 5 신청 · 6 대기 · 7 취소)
  eb bigint[] := array[]::bigint[];     -- B 강좌 확정 둘
  ez bigint;                            -- 보관 강좌 확정 한 분
  no1 text; no3 text; at1 timestamptz;
begin
  if (select count(*) from public.users) > 200 then raise exception '운영 같은 DB 입니다(users > 200) — 개발에서만 돌리세요'; end if;
  if to_regclass('public.edu_cert_seq') is null then raise exception 'edu_cert_seq 표가 없습니다 — edu.sql 을 먼저 돌리세요'; end if;
  pre := '고척-' || y || '-';
  n0 := coalesce((select last from public.edu_cert_seq where year = y), 0);

  insert into public.edu_courses(title, kind, status) values ('수료 시험 A ' || tag, 'regular', 'running') returning id into ca;
  insert into public.edu_courses(title, kind, status) values ('수료 시험 B ' || tag, 'regular', 'done') returning id into cb;
  insert into public.edu_courses(title, kind, status) values ('수료 시험 Z ' || tag, 'regular', 'archived') returning id into cz;
  for i in 1..7 loop
    insert into public.users(identity_key, type, gu, mok, name) values ('교구|수료시험|1|||' || tag || i, '교구', '수료시험', '1', tag || i) returning id into aid;
    insert into public.edu_enrollments(course_id, user_id, name, status) values (ca, aid, tag || i,
      case when i <= 4 then 'confirmed' when i = 5 then 'applied' when i = 6 then 'waitlisted' else 'cancelled' end) returning id into x;
    e := e || x;
  end loop;
  for i in 1..2 loop
    insert into public.edu_enrollments(course_id, user_id, ident_key, name, status, source) values (cb, null, 'staff|새가족|||' || tag || 'b' || i, tag || 'b' || i, 'confirmed', 'staff') returning id into x;
    eb := eb || x;
  end loop;
  insert into public.edu_enrollments(course_id, user_id, ident_key, name, status, source) values (cz, null, 'staff|새가족|||' || tag || 'z', tag || 'z', 'confirmed', 'staff') returning id into ez;

  -- ⑥ 먼저 거절들 — 아무것도 안 쓰고 차례도 안 먹는다
  r := edu_issue_certs(ca, array[e[1], e[5]]);
  if r->>'error' is distinct from 'not-confirmed' or r->'ids' is distinct from jsonb_build_array(e[5]) then raise exception '⑥ 신청(applied): %', r; end if;
  r := edu_issue_certs(ca, array[e[6], e[7], e[2]]);
  if r->>'error' is distinct from 'not-confirmed' or r->'ids' is distinct from jsonb_build_array(e[6], e[7]) then raise exception '⑥ 대기·취소: %', r; end if;
  update public.edu_enrollments set status = 'declined' where id = e[7];
  r := edu_issue_certs(ca, array[e[7]]);
  if r->>'error' is distinct from 'not-confirmed' then raise exception '⑥ 반려: %', r; end if;
  update public.edu_enrollments set status = 'cancelled' where id = e[7];
  r := edu_issue_certs(ca, array[e[1], eb[1]]);
  if r->>'error' is distinct from 'wrong-course' or r->'ids' is distinct from jsonb_build_array(eb[1]) then raise exception '⑥ 다른 강좌: %', r; end if;
  r := edu_issue_certs(ca, array[e[1], -5]);
  if r->>'error' is distinct from 'not-found' or r->'ids' is distinct from '[-5]'::jsonb then raise exception '⑥ 없는 줄: %', r; end if;
  r := edu_issue_certs(ca, array[]::bigint[]);
  if r->>'error' is distinct from 'bad-ids' then raise exception '⑥ 빈 배열: %', r; end if;
  r := edu_issue_certs(ca, null);
  if r->>'error' is distinct from 'bad-ids' then raise exception '⑥ null: %', r; end if;
  r := edu_issue_certs(ca, array[null]::bigint[]);
  if r->>'error' is distinct from 'bad-ids' then raise exception '⑥ null 만: %', r; end if;
  r := edu_issue_certs(gen_random_uuid(), array[e[1]]);
  if r->>'error' is distinct from 'not-found' then raise exception '⑥ 없는 강좌: %', r; end if;
  r := edu_issue_certs(cz, array[ez]);
  if r->>'error' is distinct from 'course-archived' then raise exception '⑥ 보관 강좌: %', r; end if;
  if exists (select 1 from public.edu_enrollments where course_id in (ca, cb, cz) and (completed or cert_no is not null or cert_revoked)) then
    raise exception '⑥ 거절했는데 썼다';
  end if;
  if coalesce((select last from public.edu_cert_seq where year = y), 0) is distinct from n0 then raise exception '⑥ 거절했는데 차례를 먹었다'; end if;

  -- ① 번호 꼴·차례 — 배열 차례(3, 1, 2)대로 · 같은 id(3)가 둘이어도 하나
  r := edu_issue_certs(ca, array[e[3], e[1], e[3], e[2]], gen_random_uuid());
  if r->>'ok' is distinct from 'true' then raise exception '① 확정: %', r; end if;
  if jsonb_array_length(r->'issued') is distinct from 3 then raise exception '① 줄 수: %', r; end if;
  if r->'issued' is distinct from jsonb_build_array(
       jsonb_build_object('id', e[3], 'certNo', pre || lpad((n0 + 1)::text, 4, '0'), 'how', 'new'),
       jsonb_build_object('id', e[1], 'certNo', pre || lpad((n0 + 2)::text, 4, '0'), 'how', 'new'),
       jsonb_build_object('id', e[2], 'certNo', pre || lpad((n0 + 3)::text, 4, '0'), 'how', 'new')) then
    raise exception '① 번호·차례: %', r;
  end if;
  if (select last from public.edu_cert_seq where year = y) is distinct from n0 + 3 then raise exception '① 차례 줄'; end if;
  no1 := (select cert_no from public.edu_enrollments where id = e[1]);
  no3 := (select cert_no from public.edu_enrollments where id = e[3]);
  if no1 !~ '^고척-[0-9]{4}-[0-9]{4}$' then raise exception '① 꼴: %', no1; end if;
  if (select count(*) from public.edu_enrollments where id in (e[1], e[2], e[3]) and completed and not cert_revoked
        and completed_at is not null and (completed_at at time zone 'Asia/Seoul')::date = (now() at time zone 'Asia/Seoul')::date) is distinct from 3::bigint then
    raise exception '① 수료 칸';
  end if;
  if exists (select 1 from public.edu_enrollments where id = e[4] and (completed or cert_no is not null)) then raise exception '① 고르지 않은 분이 수료'; end if;

  -- ② 다른 강좌(마친 강좌도 된다)를 차례로 — 이어서 받는다(겹침 없음)
  r := edu_issue_certs(cb, array[eb[2], eb[1]]);
  if r->'issued'->0->>'certNo' is distinct from pre || lpad((n0 + 4)::text, 4, '0')
     or r->'issued'->1->>'certNo' is distinct from pre || lpad((n0 + 5)::text, 4, '0') then raise exception '② B 강좌: %', r; end if;
  if (select count(distinct cert_no) from public.edu_enrollments where cert_no like pre || '%' and course_id in (ca, cb)) is distinct from 5::bigint then
    raise exception '② 번호가 겹친다';
  end if;

  -- ④ 이미 번호가 있으면 그대로 — 새 분(4)만 새 번호
  r := edu_issue_certs(ca, array[e[1], e[4]]);
  if r->'issued' is distinct from jsonb_build_array(
       jsonb_build_object('id', e[1], 'certNo', no1, 'how', 'already'),
       jsonb_build_object('id', e[4], 'certNo', pre || lpad((n0 + 6)::text, 4, '0'), 'how', 'new')) then
    raise exception '④ 다시 확정: %', r;
  end if;
  r := edu_issue_certs(ca, array[e[1], e[2]]);
  if (select last from public.edu_cert_seq where year = y) is distinct from n0 + 6 then raise exception '④ 이미 있는 줄이 차례를 먹었다: %', r; end if;

  -- ⑤ 취소 → 남김 → 되살림(같은 번호)
  at1 := (select completed_at from public.edu_enrollments where id = e[1]);
  r := edu_revoke_cert(e[1], gen_random_uuid());
  if r is distinct from jsonb_build_object('ok', true, 'certNo', no1) then raise exception '⑤ 취소: %', r; end if;
  if (select (completed, cert_revoked, cert_no, completed_at) from public.edu_enrollments where id = e[1])
     is distinct from (false, true, no1, at1) then raise exception '⑤ 취소 뒤 칸'; end if;
  r := edu_revoke_cert(e[1]);
  if r is distinct from jsonb_build_object('ok', true, 'already', true, 'certNo', no1) then raise exception '⑤ 두 번 취소: %', r; end if;
  r := edu_revoke_cert(e[5]);
  if r->>'error' is distinct from 'not-completed' then raise exception '⑤ 번호 없는 줄: %', r; end if;
  r := edu_revoke_cert(-1);
  if r->>'error' is distinct from 'not-found' then raise exception '⑤ 없는 줄: %', r; end if;
  r := edu_issue_certs(ca, array[e[1]]);
  if r->'issued' is distinct from jsonb_build_array(jsonb_build_object('id', e[1], 'certNo', no1, 'how', 'restored')) then raise exception '⑤ 되살림: %', r; end if;
  if (select (completed, cert_revoked, cert_no, completed_at) from public.edu_enrollments where id = e[1])
     is distinct from (true, false, no1, at1) then raise exception '⑤ 되살린 칸'; end if;
  if (select last from public.edu_cert_seq where year = y) is distinct from n0 + 6 then raise exception '⑤ 되살림이 차례를 먹었다'; end if;
  -- 보관 강좌의 수료도 취소는 된다(바로잡기) — 번호는 SQL 로 직접 붙여 본다
  update public.edu_courses set status = 'running' where id = cz;
  r := edu_issue_certs(cz, array[ez]);
  update public.edu_courses set status = 'archived' where id = cz;
  r := edu_revoke_cert(ez);
  if r->>'ok' is distinct from 'true' then raise exception '⑤ 보관 강좌 취소: %', r; end if;

  -- ③ 해 넘김(edu_cert_take — 다른 해 줄로만 보므로 지금 해 차례에 안 닿는다 · 2997~2999 는 시험만 쓰는 해)
  if exists (select 1 from public.edu_cert_seq where year between 2997 and 2999) then raise exception '③ 시험용 해(2997~2999) 줄이 이미 있다'; end if;
  nos := edu_cert_take('2998-12-31 14:59:59+00', 2);
  if nos is distinct from array['고척-2998-0001', '고척-2998-0002'] then raise exception '③ 한국 12/31 23:59: %', nos; end if;
  nos := edu_cert_take('2998-12-31 15:00:00+00', 1);
  if nos is distinct from array['고척-2999-0001'] then raise exception '③ 한국 1/1 00:00 → 새 해 0001: %', nos; end if;
  nos := edu_cert_take('2998-06-01 00:00:00+00', 1);
  if nos is distinct from array['고척-2998-0003'] then raise exception '③ 해마다 따로: %', nos; end if;
  insert into public.edu_cert_seq(year, last) values (2997, 9998);
  nos := edu_cert_take('2997-03-01 00:00:00+00', 3);
  if nos is distinct from array['고척-2997-9999', '고척-2997-10000', '고척-2997-10001'] then raise exception '③ 9999 다음: %', nos; end if;
  if edu_cert_take(now(), 0) is distinct from array[]::text[] then raise exception '③ 0 개'; end if;
  -- 10000 넘은 번호도 칸 제약(꼴)에 맞는다
  update public.edu_enrollments set cert_no = '고척-2997-10000' where id = e[4];
  update public.edu_enrollments set cert_no = pre || lpad((n0 + 6)::text, 4, '0') where id = e[4];

  -- ⑦ 확인 체크
  r := edu_check_set(e[2], true);
  if r is distinct from '{"ok":true,"done":true}'::jsonb then raise exception '⑦ 체크: %', r; end if;
  if (select check_done from public.edu_enrollments where id = e[2]) is distinct from true then raise exception '⑦ 체크 칸'; end if;
  r := edu_check_set(e[2], false);
  if (select check_done from public.edu_enrollments where id = e[2]) is distinct from false then raise exception '⑦ 체크 풀기: %', r; end if;
  for i in 5..7 loop
    r := edu_check_set(e[i], true);
    if r->>'error' is distinct from 'not-confirmed' then raise exception '⑦ 확정 아님 %: %', i, r; end if;
  end loop;
  r := edu_check_set(eb[1], true);                         -- 마친(done) 강좌도 된다
  if r->>'ok' is distinct from 'true' then raise exception '⑦ 마친 강좌: %', r; end if;
  r := edu_check_set(ez, true);
  if r->>'error' is distinct from 'course-archived' then raise exception '⑦ 보관 강좌: %', r; end if;
  r := edu_check_set(e[2], null);
  if r->>'error' is distinct from 'bad-done' then raise exception '⑦ null: %', r; end if;
  r := edu_check_set(-1, true);
  if r->>'error' is distinct from 'not-found' then raise exception '⑦ 없는 줄: %', r; end if;
  if exists (select 1 from public.edu_enrollments where id in (e[5], e[6], e[7], ez) and check_done) then raise exception '⑦ 거절했는데 썼다'; end if;

  -- ⑧ 번호 줄은 상태를 못 바꾼다(수료 e[1] · 수료 취소 ez) — 번호 없는 확정 줄은 그대로 된다
  r := edu_cancel(e[1], true);
  if r->>'error' is distinct from 'has-cert' then raise exception '⑧ 수료 줄 취소: %', r; end if;
  r := edu_staff_set(e[1], 'waitlisted');
  if r->>'error' is distinct from 'has-cert' then raise exception '⑧ 수료 줄 대기로: %', r; end if;
  r := edu_staff_set(e[1], 'declined', true);
  if r->>'error' is distinct from 'has-cert' then raise exception '⑧ 수료 줄 반려: %', r; end if;
  r := edu_staff_set(e[1], 'confirmed');
  if r->>'ok' is distinct from 'true' then raise exception '⑧ 같은 상태는 그대로 ok: %', r; end if;
  r := edu_revoke_cert(e[3]);
  r := edu_cancel(e[3], true);
  if r->>'error' is distinct from 'has-cert' then raise exception '⑧ 수료 취소 줄 취소: %', r; end if;
  if (select count(*) from public.edu_enrollments where id in (e[1], e[3]) and status = 'confirmed') is distinct from 2::bigint then raise exception '⑧ 상태가 바뀜'; end if;
  insert into public.edu_enrollments(course_id, user_id, ident_key, name, status, source) values (ca, null, 'staff|새가족|||' || tag || 'n', tag || 'n', 'confirmed', 'staff') returning id into x;
  r := edu_cancel(x, true);
  if r->>'ok' is distinct from 'true' then raise exception '⑧ 번호 없는 줄은 취소된다: %', r; end if;

  -- ⑨ 칸 제약
  begin
    update public.edu_enrollments set completed = true where id = e[5];
    raise exception '⑨ 번호 없이 수료가 됐다';
  exception when check_violation then null;
  end;
  begin
    update public.edu_enrollments set cert_revoked = true where id = e[2];
    raise exception '⑨ 수료이면서 취소가 됐다';
  exception when check_violation then null;
  end;
  begin
    update public.edu_enrollments set cert_revoked = true where id = e[5];
    raise exception '⑨ 번호 없이 취소가 됐다';
  exception when check_violation then null;
  end;
  begin
    update public.edu_enrollments set cert_no = 'X-2026-0001' where id = e[2];
    raise exception '⑨ 틀린 꼴이 들어갔다';
  exception when check_violation then null;
  end;
  begin
    update public.edu_enrollments set cert_no = no1 where id = e[2];
    raise exception '⑨ 같은 번호 둘';
  exception when unique_violation then null;
  end;
  begin
    update public.edu_cert_settings set seal = 'data:image/svg+xml;base64,PHN2Zz4=' where id = 1;
    raise exception '⑨ SVG 직인이 들어갔다';
  exception when check_violation then null;
  end;
  begin
    update public.edu_cert_settings set issuer = repeat('가', 61) where id = 1;
    raise exception '⑨ 61자 명의가 들어갔다';
  exception when check_violation then null;
  end;
  begin
    update public.edu_cert_settings set body = '' where id = 1;
    raise exception '⑨ 빈 문안이 들어갔다';
  exception when check_violation then null;
  end;
  begin
    insert into public.edu_cert_settings(id) values (2);
    raise exception '⑨ 설정 둘째 줄이 들어갔다';
  exception when check_violation then null;
  end;

  -- ⑩ 권한·설정
  if (select count(*) from public.edu_cert_settings) is distinct from 1::bigint then raise exception '⑩ 설정 줄 수'; end if;
  if (select position('{과정}' in body) from public.edu_cert_settings where id = 1) = 0 then raise exception '⑩ 기본 문안에 {과정}이 없다(누가 바꿨다면 무시해도 된다)'; end if;
  if exists (select 1 from information_schema.role_table_grants where table_schema = 'public' and table_name in ('edu_cert_seq', 'edu_cert_settings')
             and grantee in ('anon', 'authenticated')) then raise exception '⑩ 표 권한이 열려 있다'; end if;
  if has_function_privilege('anon', 'public.edu_issue_certs(uuid, bigint[], uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.edu_issue_certs(uuid, bigint[], uuid)', 'execute')
     or has_function_privilege('anon', 'public.edu_revoke_cert(bigint, uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.edu_check_set(bigint, boolean)', 'execute') then raise exception '⑩ 함수가 열려 있다'; end if;
  if not has_function_privilege('service_role', 'public.edu_issue_certs(uuid, bigint[], uuid)', 'execute')
     or not has_function_privilege('service_role', 'public.edu_revoke_cert(bigint, uuid)', 'execute')
     or not has_function_privilege('service_role', 'public.edu_check_set(bigint, boolean)', 'execute') then raise exception '⑩ service_role 이 못 부른다'; end if;
  if has_function_privilege('service_role', 'public.edu_cert_take(timestamptz, int)', 'execute')
     or has_function_privilege('anon', 'public.edu_cert_take(timestamptz, int)', 'execute') then raise exception '⑩ edu_cert_take 가 밖에서 불린다'; end if;
  if (select prosecdef from pg_proc where oid = 'public.edu_issue_certs(uuid, bigint[], uuid)'::regprocedure) is distinct from true then raise exception '⑩ security definer 아님'; end if;
  if not exists (select 1 from pg_class where oid = 'public.edu_cert_seq'::regclass and relrowsecurity)
     or not exists (select 1 from pg_class where oid = 'public.edu_cert_settings'::regclass and relrowsecurity) then raise exception '⑩ RLS 꺼짐'; end if;
  -- 잠금 차례 — 번호는 해 줄을 for update 로 받는다(진짜 동시는 tests/edu-cert-concurrency.dev.sh)
  if pg_get_functiondef('public.edu_cert_take(timestamptz, int)'::regprocedure) !~ 'from public\.edu_cert_seq where year = y for update' then
    raise exception '⑩ edu_cert_take 가 해 줄을 잠그지 않는다';
  end if;
end $$;
select '통과' as result;
rollback;
