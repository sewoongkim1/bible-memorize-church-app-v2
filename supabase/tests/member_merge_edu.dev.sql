-- 교육신청 × 기록 합치기 — **개발에서만**(BEGIN … ROLLBACK). 결과에 「통과」 한 줄이 나오면 끝.
-- ⚠️ 이 저장소는 공개입니다 — 아래 이름은 모두 가상입니다.
--   ① 서로 다른 강좌의 신청은 남는 번호로 옮겨진다 (before_counts / after_counts 의 edu_enrollments 숫자도 본다)
--   ② 같은 강좌에 둘 다 확정 → merge-edu-conflict (아무것도 바뀌지 않는다)
--   ③ 같은 강좌에 한쪽 반려 · 한쪽 확정 → merge-edu-conflict (반려 유지 — 2026-10-05 친구 결정)
--   ④ 같은 강좌에 원본 취소 · 남는 쪽 확정 → 원본 취소 줄만 지우고 합쳐진다
--   ⑤ 같은 강좌에 원본 확정 · 남는 쪽 취소 → 남는 쪽 취소 줄을 지우고 원본 줄이 옮겨진다
--   ⑥ 둘 다 취소 → 합쳐지고 남는 쪽 자기 줄 하나만 남는다
--   ⑦ 남는 쪽 반려 · 원본 확정 → merge-edu-conflict (아무것도 바뀌지 않는다)
--   ⑧ 신청(applied) · 대기(waitlisted) 짝 → merge-edu-conflict
--   ⑨ 원본 취소(납부·메모) · 남는 쪽 확정 → 남는 줄이 납부·메모를 이어받는다
--   ⑪ 메모 둘이 300자씩 → 500자 제한 안에서 합쳐지고 남는 줄의 메모가 앞에 남는다
--   ⑩ 원본 확정 · 남는 쪽 취소(납부·메모) → 옮겨진 줄이 납부·메모를 이어받는다
--   ⑫ 출석부(2단계): 원본 취소 줄에 출석이 있고 남는 쪽 확정 → merge-edu-conflict (출석이 cascade 로 사라지지 않게 · 아무것도 안 바뀜)
--   ⑬ 출석부: 원본 확정 · 남는 쪽 취소 줄에 출석 → merge-edu-conflict
--   ⑭ 출석부: 원본 확정(출석 있음) · 남는 쪽 취소(출석 없음) → 합쳐지고 출석은 옮겨진 줄을 따라간다
-- 개발 연결 확인: users 가 200명이 넘으면 운영으로 보고 멈춘다.
-- ⚠️ 한글이 든 SQL 은 명령줄에 붙이지 말고 -f 로만 돌린다.
begin;
do $check$
declare
  tag text := left(md5(random()::text || clock_timestamp()::text), 8);
  n int; r jsonb; c1 uuid; c2 uuid; c3 uuid; c4 uuid; keep bigint; rw record;
  s1 uuid; t1 uuid; s2 uuid; t2 uuid; s3 uuid; t3 uuid; s4 uuid; t4 uuid; s5 uuid; t5 uuid;
  s6 uuid; t6 uuid; s7 uuid; t7 uuid; s8 uuid; t8 uuid; s9 uuid; t9 uuid; s10 uuid; t10 uuid; s11 uuid; t11 uuid;
  s12 uuid; t12 uuid; s13 uuid; t13 uuid; s14 uuid; t14 uuid; c5 uuid; ss1 bigint; ea bigint; eb bigint;
begin
  select count(*) into n from public.users;
  if n > 200 then raise exception 'member_merge_edu: users 가 %명 — 운영으로 보여 멈춥니다.', n; end if;
  if to_regclass('public.edu_enrollments') is null then raise exception 'member_merge_edu: edu_enrollments 표가 없습니다 — edu.sql 을 먼저 돌리세요.'; end if;

  -- 가상 성도 스무 명(원본 s · 대상 t 열 쌍)
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
  insert into public.users(type,gu,mok,name,identity_key) values('교구','교육합치기점검','0','가상s6'||tag,'교구|교육합치기점검|0|||가상s6'||tag) returning id into s6;
  insert into public.users(type,gu,mok,name,identity_key) values('교구','교육합치기점검','0','가상t6'||tag,'교구|교육합치기점검|0|||가상t6'||tag) returning id into t6;
  insert into public.users(type,gu,mok,name,identity_key) values('교구','교육합치기점검','0','가상s7'||tag,'교구|교육합치기점검|0|||가상s7'||tag) returning id into s7;
  insert into public.users(type,gu,mok,name,identity_key) values('교구','교육합치기점검','0','가상t7'||tag,'교구|교육합치기점검|0|||가상t7'||tag) returning id into t7;
  insert into public.users(type,gu,mok,name,identity_key) values('교구','교육합치기점검','0','가상s8'||tag,'교구|교육합치기점검|0|||가상s8'||tag) returning id into s8;
  insert into public.users(type,gu,mok,name,identity_key) values('교구','교육합치기점검','0','가상t8'||tag,'교구|교육합치기점검|0|||가상t8'||tag) returning id into t8;
  insert into public.users(type,gu,mok,name,identity_key) values('교구','교육합치기점검','0','가상s9'||tag,'교구|교육합치기점검|0|||가상s9'||tag) returning id into s9;
  insert into public.users(type,gu,mok,name,identity_key) values('교구','교육합치기점검','0','가상t9'||tag,'교구|교육합치기점검|0|||가상t9'||tag) returning id into t9;
  insert into public.users(type,gu,mok,name,identity_key) values('교구','교육합치기점검','0','가상s10'||tag,'교구|교육합치기점검|0|||가상s10'||tag) returning id into s10;
  insert into public.users(type,gu,mok,name,identity_key) values('교구','교육합치기점검','0','가상t10'||tag,'교구|교육합치기점검|0|||가상t10'||tag) returning id into t10;

  insert into public.users(type,gu,mok,name,identity_key) values('교구','교육합치기점검','0','가상s11'||tag,'교구|교육합치기점검|0|||가상s11'||tag) returning id into s11;
  insert into public.users(type,gu,mok,name,identity_key) values('교구','교육합치기점검','0','가상t11'||tag,'교구|교육합치기점검|0|||가상t11'||tag) returning id into t11;

  insert into public.edu_courses(title,kind,status) values ('합치기점검 강좌1','lecture','open') returning id into c1;
  insert into public.edu_courses(title,kind,status) values ('합치기점검 강좌2','lecture','open') returning id into c2;
  insert into public.edu_courses(title,kind,status) values ('합치기점검 강좌3','lecture','open') returning id into c3;
  insert into public.edu_courses(title,kind,status) values ('합치기점검 강좌4','lecture','open') returning id into c4;

  -- ① 서로 다른 강좌 → 옮겨진다
  perform public.edu_apply(c1, s1, '{"name":"가상s1"}');
  perform public.edu_apply(c2, t1, '{"name":"가상t1"}');
  r := public.admin_merge_members(s1, t1, '교구|교육합치기점검|0|||가상s1'||tag, '교구|교육합치기점검|0|||가상t1'||tag, '개발 점검 — 교육신청(되돌림)');
  if coalesce((r->>'ok')::boolean,false) is not true then raise exception 'member_merge_edu ①: 합치기 거절 — %', r; end if;
  if (select count(*) from public.edu_enrollments where user_id = t1) <> 2 then raise exception 'member_merge_edu ①: 옮겨진 줄이 2가 아님'; end if;
  if exists(select 1 from public.edu_enrollments where user_id = s1) then raise exception 'member_merge_edu ①: 원본에 줄이 남음'; end if;
  if (r->'after_counts'->>'edu_enrollments')::int is distinct from 2 then raise exception 'member_merge_edu ①: after_counts 가 2가 아님 — %', r->'after_counts'; end if;
  if (r->'before_counts'->'source'->>'edu_enrollments')::int is distinct from 1
     or (r->'before_counts'->'target'->>'edu_enrollments')::int is distinct from 1 then
    raise exception 'member_merge_edu ①: before_counts 가 1/1 이 아님 — %', r->'before_counts'; end if;

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

  -- ⑥ 둘 다 취소 → 합쳐지고 남는 쪽 자기 줄 하나만
  perform public.edu_apply(c4, s6, '{"name":"가상s6"}');
  perform public.edu_apply(c4, t6, '{"name":"가상t6"}');
  update public.edu_enrollments set status='cancelled', cancelled_at=now() where course_id=c4 and user_id in (s6,t6);
  select id into keep from public.edu_enrollments where course_id=c4 and user_id=t6;
  r := public.admin_merge_members(s6, t6, '교구|교육합치기점검|0|||가상s6'||tag, '교구|교육합치기점검|0|||가상t6'||tag, '개발 점검 — 둘 다 취소(되돌림)');
  if coalesce((r->>'ok')::boolean,false) is not true then raise exception 'member_merge_edu ⑥: 합치기 거절 — %', r; end if;
  if (select count(*) from public.edu_enrollments where course_id=c4 and user_id=t6) <> 1
     or not exists(select 1 from public.edu_enrollments where id=keep and user_id=t6)
     or exists(select 1 from public.edu_enrollments where user_id=s6) then
    raise exception 'member_merge_edu ⑥: 남는 쪽 자기 줄 하나만 남아야 함'; end if;

  -- ⑦ 남는 쪽 반려 · 원본 확정 → 충돌(반려 유지, 반대 방향)
  perform public.edu_apply(c4, s7, '{"name":"가상s7"}');
  perform public.edu_apply(c4, t7, '{"name":"가상t7"}');
  update public.edu_enrollments set status='declined' where course_id=c4 and user_id=t7;
  r := public.admin_merge_members(s7, t7, '교구|교육합치기점검|0|||가상s7'||tag, '교구|교육합치기점검|0|||가상t7'||tag, '개발 점검 — 대상 반려 충돌(되돌림)');
  if r->>'error' is distinct from 'merge-edu-conflict' then raise exception 'member_merge_edu ⑦: merge-edu-conflict 가 아님 — %', r; end if;
  if (select status from public.edu_enrollments where course_id=c4 and user_id=t7) <> 'declined'
     or (select status from public.edu_enrollments where course_id=c4 and user_id=s7) <> 'confirmed' then
    raise exception 'member_merge_edu ⑦: 충돌인데 줄이 바뀜'; end if;

  -- ⑧ 신청 · 대기 짝 → 충돌
  perform public.edu_apply(c4, s8, '{"name":"가상s8"}');
  perform public.edu_apply(c4, t8, '{"name":"가상t8"}');
  update public.edu_enrollments set status='applied' where course_id=c4 and user_id=s8;
  update public.edu_enrollments set status='waitlisted' where course_id=c4 and user_id=t8;
  r := public.admin_merge_members(s8, t8, '교구|교육합치기점검|0|||가상s8'||tag, '교구|교육합치기점검|0|||가상t8'||tag, '개발 점검 — 신청·대기 충돌(되돌림)');
  if r->>'error' is distinct from 'merge-edu-conflict' then raise exception 'member_merge_edu ⑧: merge-edu-conflict 가 아님 — %', r; end if;
  if (select status from public.edu_enrollments where course_id=c4 and user_id=s8) <> 'applied'
     or (select status from public.edu_enrollments where course_id=c4 and user_id=t8) <> 'waitlisted' then
    raise exception 'member_merge_edu ⑧: 충돌인데 줄이 바뀜'; end if;

  -- ⑨ 원본 취소(납부·메모) · 남는 쪽 확정(메모 있음) → 남는 줄이 이어받는다
  perform public.edu_apply(c4, s9, '{"name":"가상s9"}');
  perform public.edu_apply(c4, t9, '{"name":"가상t9"}');
  update public.edu_enrollments set status='cancelled', cancelled_at=now(), fee_paid=true, staff_note='원본 납부 확인' where course_id=c4 and user_id=s9;
  update public.edu_enrollments set staff_note='기존 메모' where course_id=c4 and user_id=t9;
  r := public.admin_merge_members(s9, t9, '교구|교육합치기점검|0|||가상s9'||tag, '교구|교육합치기점검|0|||가상t9'||tag, '개발 점검 — 취소 납부 이어받기(되돌림)');
  if coalesce((r->>'ok')::boolean,false) is not true then raise exception 'member_merge_edu ⑨: 합치기 거절 — %', r; end if;
  select * into rw from public.edu_enrollments where course_id=c4 and user_id=t9;
  if (select count(*) from public.edu_enrollments where course_id=c4 and user_id=t9) <> 1 or rw.status <> 'confirmed'
     or rw.fee_paid is not true or rw.staff_note is distinct from '기존 메모 / 합치기 전 취소 신청: 원본 납부 확인' then
    raise exception 'member_merge_edu ⑨: 납부·메모를 이어받아야 함 — %', to_jsonb(rw); end if;

  -- ⑩ 원본 확정 · 남는 쪽 취소(납부·메모) → 옮겨진 줄이 이어받는다
  perform public.edu_apply(c4, s10, '{"name":"가상s10"}');
  perform public.edu_apply(c4, t10, '{"name":"가상t10"}');
  update public.edu_enrollments set status='cancelled', cancelled_at=now(), fee_paid=true, staff_note='대상 납부 확인' where course_id=c4 and user_id=t10;
  r := public.admin_merge_members(s10, t10, '교구|교육합치기점검|0|||가상s10'||tag, '교구|교육합치기점검|0|||가상t10'||tag, '개발 점검 — 취소 납부 이어받기 둘째(되돌림)');
  if coalesce((r->>'ok')::boolean,false) is not true then raise exception 'member_merge_edu ⑩: 합치기 거절 — %', r; end if;
  select * into rw from public.edu_enrollments where course_id=c4 and user_id=t10;
  if (select count(*) from public.edu_enrollments where course_id=c4 and user_id=t10) <> 1 or rw.status <> 'confirmed'
     or rw.fee_paid is not true or rw.staff_note is distinct from '합치기 전 취소 신청: 대상 납부 확인' then
    raise exception 'member_merge_edu ⑩: 납부·메모를 이어받아야 함 — %', to_jsonb(rw); end if;
  -- ⑪ 메모 300자 + 300자 → 500자 제한(check) 안에서 합쳐진다 · 남는 줄 메모가 앞
  perform public.edu_apply(c4, s11, '{"name":"가상s11"}');
  perform public.edu_apply(c4, t11, '{"name":"가상t11"}');
  update public.edu_enrollments set status='cancelled', cancelled_at=now(), staff_note=repeat('가',300) where course_id=c4 and user_id=s11;
  update public.edu_enrollments set staff_note=repeat('나',300) where course_id=c4 and user_id=t11;
  r := public.admin_merge_members(s11, t11, '교구|교육합치기점검|0|||가상s11'||tag, '교구|교육합치기점검|0|||가상t11'||tag, '개발 점검 — 긴 메모(되돌림)');
  if coalesce((r->>'ok')::boolean,false) is not true then raise exception 'member_merge_edu ⑪: 합치기 거절 — %', r; end if;
  select * into rw from public.edu_enrollments where course_id=c4 and user_id=t11;
  if char_length(rw.staff_note) > 500 or left(rw.staff_note,300) <> repeat('나',300) then
    raise exception 'member_merge_edu ⑪: 메모가 500자 이내이고 남는 줄 메모가 앞이어야 함 — %', char_length(rw.staff_note); end if;
  -- ⑫~⑭ 출석부(2단계) — 출석이 있는 취소 줄은 합치기가 지우지 않고 멈춘다(edu.sql 2단계 표가 있을 때만)
  if to_regclass('public.edu_attendance') is not null then
    insert into public.users(type,gu,mok,name,identity_key) values('교구','교육합치기점검','0','가상s12'||tag,'교구|교육합치기점검|0|||가상s12'||tag) returning id into s12;
    insert into public.users(type,gu,mok,name,identity_key) values('교구','교육합치기점검','0','가상t12'||tag,'교구|교육합치기점검|0|||가상t12'||tag) returning id into t12;
    insert into public.users(type,gu,mok,name,identity_key) values('교구','교육합치기점검','0','가상s13'||tag,'교구|교육합치기점검|0|||가상s13'||tag) returning id into s13;
    insert into public.users(type,gu,mok,name,identity_key) values('교구','교육합치기점검','0','가상t13'||tag,'교구|교육합치기점검|0|||가상t13'||tag) returning id into t13;
    insert into public.users(type,gu,mok,name,identity_key) values('교구','교육합치기점검','0','가상s14'||tag,'교구|교육합치기점검|0|||가상s14'||tag) returning id into s14;
    insert into public.users(type,gu,mok,name,identity_key) values('교구','교육합치기점검','0','가상t14'||tag,'교구|교육합치기점검|0|||가상t14'||tag) returning id into t14;
    insert into public.edu_courses(title,kind,status) values ('합치기점검 강좌5','lecture','open') returning id into c5;
    insert into public.edu_sessions(course_id,no,on_date) values (c5,1,date '2027-03-03') returning id into ss1;

    -- ⑫ 원본: 확정 → 출석 → 취소 · 남는 쪽: 확정
    perform public.edu_apply(c5, s12, '{"name":"가상s12"}');
    perform public.edu_apply(c5, t12, '{"name":"가상t12"}');
    select id into ea from public.edu_enrollments where course_id=c5 and user_id=s12;
    r := public.edu_attendance_set(ss1, ea, 'present', null);
    if r->>'ok' is distinct from 'true' then raise exception 'member_merge_edu ⑫: 출석 쓰기 — %', r; end if;
    update public.edu_enrollments set status='cancelled', cancelled_at=now() where id=ea;
    r := public.admin_merge_members(s12, t12, '교구|교육합치기점검|0|||가상s12'||tag, '교구|교육합치기점검|0|||가상t12'||tag, '개발 점검 — 출석 있는 취소 줄(되돌림)');
    if r->>'error' is distinct from 'merge-edu-conflict' then raise exception 'member_merge_edu ⑫: merge-edu-conflict 가 아님 — %', r; end if;
    if not exists(select 1 from public.edu_enrollments where id=ea and user_id=s12)
       or not exists(select 1 from public.edu_attendance where enrollment_id=ea and session_id=ss1) then
      raise exception 'member_merge_edu ⑫: 멈췄는데 줄이나 출석이 바뀜'; end if;

    -- ⑬ 원본: 확정 · 남는 쪽: 확정 → 출석 → 취소
    perform public.edu_apply(c5, s13, '{"name":"가상s13"}');
    perform public.edu_apply(c5, t13, '{"name":"가상t13"}');
    select id into eb from public.edu_enrollments where course_id=c5 and user_id=t13;
    r := public.edu_attendance_set(ss1, eb, 'late', null);
    if r->>'ok' is distinct from 'true' then raise exception 'member_merge_edu ⑬: 출석 쓰기 — %', r; end if;
    update public.edu_enrollments set status='cancelled', cancelled_at=now() where id=eb;
    r := public.admin_merge_members(s13, t13, '교구|교육합치기점검|0|||가상s13'||tag, '교구|교육합치기점검|0|||가상t13'||tag, '개발 점검 — 남는 쪽 출석 있는 취소 줄(되돌림)');
    if r->>'error' is distinct from 'merge-edu-conflict' then raise exception 'member_merge_edu ⑬: merge-edu-conflict 가 아님 — %', r; end if;
    if not exists(select 1 from public.edu_attendance where enrollment_id=eb and session_id=ss1 and state='late') then
      raise exception 'member_merge_edu ⑬: 멈췄는데 출석이 바뀜'; end if;

    -- ⑭ 원본: 확정(출석 있음) · 남는 쪽: 취소(출석 없음) → 합쳐지고 출석은 원본 줄(이제 남는 쪽 것)을 따라간다
    perform public.edu_apply(c5, s14, '{"name":"가상s14"}');
    perform public.edu_apply(c5, t14, '{"name":"가상t14"}');
    select id into ea from public.edu_enrollments where course_id=c5 and user_id=s14;
    r := public.edu_attendance_set(ss1, ea, 'excused', null);
    if r->>'ok' is distinct from 'true' then raise exception 'member_merge_edu ⑭: 출석 쓰기 — %', r; end if;
    update public.edu_enrollments set status='cancelled', cancelled_at=now() where course_id=c5 and user_id=t14;
    r := public.admin_merge_members(s14, t14, '교구|교육합치기점검|0|||가상s14'||tag, '교구|교육합치기점검|0|||가상t14'||tag, '개발 점검 — 출석 있는 줄 옮기기(되돌림)');
    if coalesce((r->>'ok')::boolean,false) is not true then raise exception 'member_merge_edu ⑭: 합치기 거절 — %', r; end if;
    if not exists(select 1 from public.edu_enrollments where id=ea and user_id=t14 and status='confirmed')
       or (select count(*) from public.edu_enrollments where course_id=c5 and user_id=t14) <> 1
       or not exists(select 1 from public.edu_attendance where enrollment_id=ea and session_id=ss1 and state='excused') then
      raise exception 'member_merge_edu ⑭: 출석 있는 줄이 남는 쪽으로 옮겨져야 함'; end if;
  end if;
end $check$;
select '통과' as result;
rollback;
