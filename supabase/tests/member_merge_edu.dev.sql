-- 교육신청 × 기록 합치기 — **개발에서만**(BEGIN … ROLLBACK). 결과에 「통과」 한 줄이 나오면 끝.
-- ⚠️ 이 저장소는 공개입니다 — 아래 이름은 모두 가상입니다.
--   ① 서로 다른 강좌의 신청은 남는 번호로 옮겨진다
--   ② 같은 강좌에 둘 다 확정 → merge-edu-conflict (아무것도 바뀌지 않는다)
--   ③ 같은 강좌에 한쪽 반려 · 한쪽 확정 → merge-edu-conflict (반려 유지 — 2026-10-05 친구 결정)
--   ④ 같은 강좌에 원본 취소 · 남는 쪽 확정 → 원본 취소 줄만 지우고 합쳐진다
--   ⑤ 같은 강좌에 원본 확정 · 남는 쪽 취소 → 남는 쪽 취소 줄을 지우고 원본 줄이 옮겨진다
-- 개발 연결 확인: users 가 200명이 넘으면 운영으로 보고 멈춘다.
-- ⚠️ 한글이 든 SQL 은 명령줄에 붙이지 말고 -f 로만 돌린다.
begin;
do $check$
declare
  tag text := left(md5(random()::text || clock_timestamp()::text), 8);
  n int; r jsonb; c1 uuid; c2 uuid; c3 uuid;
  s1 uuid; t1 uuid; s2 uuid; t2 uuid; s3 uuid; t3 uuid; s4 uuid; t4 uuid; s5 uuid; t5 uuid;
begin
  select count(*) into n from public.users;
  if n > 200 then raise exception 'member_merge_edu: users 가 %명 — 운영으로 보여 멈춥니다.', n; end if;
  if to_regclass('public.edu_enrollments') is null then raise exception 'member_merge_edu: edu_enrollments 표가 없습니다 — edu.sql 을 먼저 돌리세요.'; end if;

  -- 가상 성도 열 명(원본 s · 대상 t 다섯 쌍)
  insert into public.users(type,gu,mok,name,identity_key) values('교구','교육합치기점검','0','가상s1'||tag,'교구|교육합치기점검|0|||가상s1'||tag) returning id into s1;
  insert into public.users(type,gu,mok,name,identity_key) values('교구','교육합치기점검','0','가상t1'||tag,'교구|교육합치기점검|0|||가상t1'||tag) returning id into t1;
  insert into public.users(type,gu,mok,name,identity_key) values('교구','교육합치기점검','0','가상s2'||tag,'교구|교육합치기점검|0|||가상s2'||tag) returning id into s2;
  insert into public.users(type,gu,mok,name,identity_key) values('교구','교육합치기점검','0','가상t2'||tag,'교구|교육합치기점검|0|||가상t2'||tag) returning id into t2;
  insert into public.users(type,gu,mok,name,identity_key) values('교구','교육합치기점검','0','가상s3'||tag,'교구|교육합치기점검|0|||가상s3'||tag) returning id into s3;
  insert into public.users(type,gu,mok,name,identity_key) values('교구','교육합치기점검','0','가상t3'||tag,'교구|교육합치기점검|0|||가상t3'||tag) returning id into t3;
  insert into public.users(type,gu,mok,name,identity_key) values('교구','교육합치기점검','0','가상s4'||tag,'교구|교육합치기점검|0|||가상s4'||tag) returning id into s4;
  insert into public.users(type,gu,mok,name,identity_key) values('교구','교육합치기점검','0','가상t4'||tag,'교구|교육합치기점검|0|||가상t4'||tag) returning id into t4;
  insert into public.users(type,gu,mok,name,identity_key) values('교구','교육합치기점검','0','가상s5'||tag,'교구|교육합치기점검|0|||가상s5'||tag) returning id into s5;
  insert into public.users(type,gu,mok,name,identity_key) values('교구','교육합치기점검','0','가상t5'||tag,'교구|교육합치기점검|0|||가상t5'||tag) returning id into t5;

  insert into public.edu_courses(title,kind,status) values ('합치기점검 강좌1','lecture','open') returning id into c1;
  insert into public.edu_courses(title,kind,status) values ('합치기점검 강좌2','lecture','open') returning id into c2;
  insert into public.edu_courses(title,kind,status) values ('합치기점검 강좌3','lecture','open') returning id into c3;

  -- ① 서로 다른 강좌 → 옮겨진다
  perform public.edu_apply(c1, s1, '{"name":"가상s1"}');
  perform public.edu_apply(c2, t1, '{"name":"가상t1"}');
  r := public.admin_merge_members(s1, t1, '교구|교육합치기점검|0|||가상s1'||tag, '교구|교육합치기점검|0|||가상t1'||tag, '개발 점검 — 교육신청(되돌림)');
  if coalesce((r->>'ok')::boolean,false) is not true then raise exception 'member_merge_edu ①: 합치기 거절 — %', r; end if;
  if (select count(*) from public.edu_enrollments where user_id = t1) <> 2 then raise exception 'member_merge_edu ①: 옮겨진 줄이 2가 아님'; end if;
  if exists(select 1 from public.edu_enrollments where user_id = s1) then raise exception 'member_merge_edu ①: 원본에 줄이 남음'; end if;

  -- ② 같은 강좌 둘 다 확정 → 충돌
  perform public.edu_apply(c1, s2, '{"name":"가상s2"}');
  perform public.edu_apply(c1, t2, '{"name":"가상t2"}');
  r := public.admin_merge_members(s2, t2, '교구|교육합치기점검|0|||가상s2'||tag, '교구|교육합치기점검|0|||가상t2'||tag, '개발 점검 — 충돌(되돌림)');
  if r->>'error' is distinct from 'merge-edu-conflict' then raise exception 'member_merge_edu ②: merge-edu-conflict 가 아님 — %', r; end if;
  if (select count(*) from public.edu_enrollments where user_id = s2) <> 1 or (select count(*) from public.edu_enrollments where user_id = t2) <> 1 then
    raise exception 'member_merge_edu ②: 충돌인데 줄이 바뀜'; end if;

  -- ③ 한쪽 반려 · 한쪽 확정 → 충돌(반려 유지)
  perform public.edu_apply(c1, s3, '{"name":"가상s3"}');
  perform public.edu_apply(c1, t3, '{"name":"가상t3"}');
  update public.edu_enrollments set status='declined' where course_id=c1 and user_id=s3;
  r := public.admin_merge_members(s3, t3, '교구|교육합치기점검|0|||가상s3'||tag, '교구|교육합치기점검|0|||가상t3'||tag, '개발 점검 — 반려 충돌(되돌림)');
  if r->>'error' is distinct from 'merge-edu-conflict' then raise exception 'member_merge_edu ③: 반려 충돌이 아님 — %', r; end if;
  if (select status from public.edu_enrollments where course_id=c1 and user_id=s3) <> 'declined' then raise exception 'member_merge_edu ③: 반려 줄이 바뀜'; end if;

  -- ④ 원본 취소 · 남는 쪽 확정 → 원본 취소 줄만 지우고 합쳐진다
  perform public.edu_apply(c3, s4, '{"name":"가상s4"}');
  update public.edu_enrollments set status='cancelled', cancelled_at=now() where course_id=c3 and user_id=s4;
  perform public.edu_apply(c3, t4, '{"name":"가상t4"}');
  r := public.admin_merge_members(s4, t4, '교구|교육합치기점검|0|||가상s4'||tag, '교구|교육합치기점검|0|||가상t4'||tag, '개발 점검 — 취소 겹침(되돌림)');
  if coalesce((r->>'ok')::boolean,false) is not true then raise exception 'member_merge_edu ④: 합치기 거절 — %', r; end if;
  if (select count(*) from public.edu_enrollments where course_id=c3 and user_id=t4) <> 1
     or (select status from public.edu_enrollments where course_id=c3 and user_id=t4) <> 'confirmed'
     or exists(select 1 from public.edu_enrollments where user_id=s4) then
    raise exception 'member_merge_edu ④: 남는 쪽 확정 한 줄만 남아야 함'; end if;

  -- ⑤ 원본 확정 · 남는 쪽 취소 → 남는 쪽 취소 줄을 지우고 원본 줄이 옮겨진다
  perform public.edu_apply(c3, s5, '{"name":"가상s5"}');
  perform public.edu_apply(c3, t5, '{"name":"가상t5"}');
  update public.edu_enrollments set status='cancelled', cancelled_at=now() where course_id=c3 and user_id=t5;
  r := public.admin_merge_members(s5, t5, '교구|교육합치기점검|0|||가상s5'||tag, '교구|교육합치기점검|0|||가상t5'||tag, '개발 점검 — 취소 겹침 둘째(되돌림)');
  if coalesce((r->>'ok')::boolean,false) is not true then raise exception 'member_merge_edu ⑤: 합치기 거절 — %', r; end if;
  if (select count(*) from public.edu_enrollments where course_id=c3 and user_id=t5) <> 1
     or (select status from public.edu_enrollments where course_id=c3 and user_id=t5) <> 'confirmed' then
    raise exception 'member_merge_edu ⑤: 원본 확정 줄 한 줄만 남아야 함'; end if;
end $check$;
select '통과' as result;
rollback;
