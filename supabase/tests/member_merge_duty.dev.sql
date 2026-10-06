-- 봉사 당번 × 기록 합치기 — **개발에서만**(BEGIN … ROLLBACK). 결과에 「통과」 한 줄이 나오면 끝.
-- ⚠️ 이 저장소는 공개입니다 — 아래 이름은 모두 가상입니다.
--   ⓪ duty_signups 에 쓰기 연결 트리거가 붙어 있다(duty.sql 뒤에 member_merge.sql 을 다시 돌렸는가)
--   ① 서로 다른(안 겹치는) 자리의 지원은 남는 번호로 옮겨진다(before_counts / after_counts 의 duty_signups 숫자도 본다)
--   ② 같은 자리에 둘 다 살아 있음 → 합쳐지고 남는 쪽 줄 하나만(원본 줄의 담당자 메모는 얹는다 · 자리 하나가 빈다)
--   ③ 같은 자리에 원본 살아 있음 · 남는 쪽 취소 → 남는 쪽 끝난 줄을 지우고 원본 줄이 옮겨진다(살아 있는 채로)
--   ④ 같은 자리에 둘 다 끝난 줄 → 합쳐지고 남는 쪽 줄 하나만
--   ⑤ 앞날의 같은 날 시각이 겹치는 서로 다른 자리에 둘 다 살아 있음 → merge-duty-conflict(아무것도 안 바뀐다) · 한쪽을 빼면 합쳐진다
--   ⑥ 지난 날짜의 겹침은 막지 않는다
-- 개발 연결 확인: users 가 200명이 넘으면 운영으로 보고 멈춘다.
-- ⚠️ 한글이 든 SQL 은 명령줄에 붙이지 말고 -f 로만 돌린다.
begin;
do $check$
declare
  tag text := left(md5(random()::text || clock_timestamp()::text), 8);
  n int; r jsonb; b uuid; l1 bigint; l2 bigint; l3 bigint; t0 date := duty_today();
  sa bigint; sb bigint; sc bigint; sd bigint; sp1 bigint; sp2 bigint; keep bigint;
  s uuid[] := array[]::uuid[]; t uuid[] := array[]::uuid[]; aid uuid; i int;
  ks text[] := array[]::text[]; kt text[] := array[]::text[];
begin
  select count(*) into n from public.users;
  if n > 200 then raise exception 'member_merge_duty: users 가 %명 — 운영으로 보여 멈춥니다.', n; end if;
  if to_regclass('public.duty_signups') is null then raise exception 'member_merge_duty: duty_signups 표가 없습니다 — duty.sql 을 먼저 돌리세요.'; end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.duty_signups'::regclass and tgname = 'redirect_merged_member_write') then
    raise exception '⓪ duty_signups 에 쓰기 연결 트리거가 없습니다 — duty.sql 뒤에 member_merge.sql 을 다시 돌리세요.';
  end if;

  -- 가상 성도 여섯 쌍(원본 s · 대상 t)
  for i in 1..6 loop
    ks := ks || ('교구|당번합치기점검|0|||가상s' || i || tag); kt := kt || ('교구|당번합치기점검|0|||가상t' || i || tag);
    insert into public.users(type,gu,mok,name,identity_key) values('교구','당번합치기점검','0','가상s'||i||tag, ks[i]) returning id into aid; s := s || aid;
    insert into public.users(type,gu,mok,name,identity_key) values('교구','당번합치기점검','0','가상t'||i||tag, kt[i]) returning id into aid; t := t || aid;
  end loop;

  -- 당번 하나 · 틀 셋(1부 09~10 · 2부 11~12 · 2부 배식 11:30~12:30 — 뒤 둘이 겹친다) · 날짜 +5(앞날) · −3(지난 날)
  insert into public.duty_boards(title, status) values ('[합치기 점검] 당번 ' || tag, 'open') returning id into b;
  r := duty_line_save(b, jsonb_build_object('service','1부','task','','start','09:00','end','10:00','capacity',5)); l1 := (r->>'id')::bigint;
  r := duty_line_save(b, jsonb_build_object('service','2부','task','','start','11:00','end','12:00','capacity',5)); l2 := (r->>'id')::bigint;
  r := duty_line_save(b, jsonb_build_object('service','2부','task','배식','start','11:30','end','12:30','capacity',5)); l3 := (r->>'id')::bigint;
  perform duty_date_add(b, t0 + 5, array[l1, l2, l3]);
  perform duty_date_add(b, t0 - 3, array[l2, l3]);
  select id into sa from public.duty_slots where line_id = l1 and on_date = t0 + 5;
  select id into sb from public.duty_slots where line_id = l2 and on_date = t0 + 5;
  select id into sc from public.duty_slots where line_id = l3 and on_date = t0 + 5;
  select id into sp1 from public.duty_slots where line_id = l2 and on_date = t0 - 3;
  select id into sp2 from public.duty_slots where line_id = l3 and on_date = t0 - 3;
  if sa is null or sb is null or sc is null or sp1 is null or sp2 is null then raise exception '자리 준비'; end if;

  -- ① 서로 다른 자리(1부 · 2부) → 옮겨진다
  perform duty_apply(sa, s[1], jsonb_build_object('name','가상s1'||tag));
  perform duty_apply(sb, t[1], jsonb_build_object('name','가상t1'||tag));
  r := public.admin_merge_members(s[1], t[1], ks[1], kt[1], '개발 점검 — 봉사 당번(되돌림)');
  if (r->>'ok')::boolean is not true then raise exception '①: %', r; end if;
  if (select count(*) from public.duty_signups where user_id = t[1] and status = 'active') is distinct from 2 then raise exception '① 남는 번호에 두 줄'; end if;
  if (r->'before_counts'->'source'->>'duty_signups')::int is distinct from 1 or (r->'after_counts'->>'duty_signups')::int is distinct from 2 then raise exception '① 기록 수: %', r; end if;

  -- ② 같은 자리에 둘 다 살아 있음 → 남는 쪽 줄 하나(원본 메모를 얹는다)
  perform duty_apply(sa, s[2], jsonb_build_object('name','가상s2'||tag));
  perform duty_apply(sa, t[2], jsonb_build_object('name','가상t2'||tag));
  update public.duty_signups set staff_note = '원본 메모' where slot_id = sa and user_id = s[2];
  select id into keep from public.duty_signups where slot_id = sa and user_id = t[2];
  r := public.admin_merge_members(s[2], t[2], ks[2], kt[2], '개발 점검 — 같은 자리(되돌림)');
  if (r->>'ok')::boolean is not true then raise exception '②: %', r; end if;
  if (select count(*) from public.duty_signups where slot_id = sa and user_id = t[2]) is distinct from 1
     or (select id from public.duty_signups where slot_id = sa and user_id = t[2]) is distinct from keep then raise exception '② 남는 쪽 줄 하나'; end if;
  if (select staff_note from public.duty_signups where id = keep) not like '%원본 메모%' then raise exception '② 메모 얹기'; end if;

  -- ③ 원본 살아 있음 · 남는 쪽 취소 → 원본 줄이 옮겨진다
  perform duty_apply(sb, s[3], jsonb_build_object('name','가상s3'||tag));
  r := duty_apply(sb, t[3], jsonb_build_object('name','가상t3'||tag));
  perform duty_cancel((r->>'id')::bigint, t[3], false);
  select id into keep from public.duty_signups where slot_id = sb and user_id = s[3];
  r := public.admin_merge_members(s[3], t[3], ks[3], kt[3], '개발 점검 — 남는 쪽 취소(되돌림)');
  if (r->>'ok')::boolean is not true then raise exception '③: %', r; end if;
  if (select id || '/' || status from public.duty_signups where slot_id = sb and user_id = t[3]) is distinct from keep || '/active' then raise exception '③ 원본 줄이 살아 있는 채로 옮겨진다'; end if;

  -- ④ 둘 다 끝난 줄 → 남는 쪽 줄 하나
  r := duty_apply(sc, s[4], jsonb_build_object('name','가상s4'||tag)); perform duty_cancel((r->>'id')::bigint, s[4], false);
  r := duty_apply(sc, t[4], jsonb_build_object('name','가상t4'||tag)); perform duty_cancel((r->>'id')::bigint, t[4], false);
  keep := (r->>'id')::bigint;
  r := public.admin_merge_members(s[4], t[4], ks[4], kt[4], '개발 점검 — 둘 다 끝난 줄(되돌림)');
  if (r->>'ok')::boolean is not true then raise exception '④: %', r; end if;
  if (select count(*) from public.duty_signups where slot_id = sc and user_id = t[4]) is distinct from 1
     or (select id from public.duty_signups where slot_id = sc and user_id = t[4]) is distinct from keep then raise exception '④ 남는 쪽 줄 하나'; end if;

  -- ⑤ 앞날 · 겹치는 서로 다른 자리(2부 11~12 · 배식 11:30~12:30)에 둘 다 살아 있음 → 멈춘다
  perform duty_apply(sb, s[5], jsonb_build_object('name','가상s5'||tag));
  perform duty_apply(sc, t[5], jsonb_build_object('name','가상t5'||tag));
  r := public.admin_merge_members(s[5], t[5], ks[5], kt[5], '개발 점검 — 겹침(되돌림)');
  if r->>'error' is distinct from 'merge-duty-conflict' then raise exception '⑤: %', r; end if;
  if not exists (select 1 from public.users where id = s[5]) or (select count(*) from public.duty_signups where user_id = s[5]) is distinct from 1 then raise exception '⑤ 아무것도 안 바뀐다'; end if;
  perform duty_cancel((select id from public.duty_signups where slot_id = sc and user_id = t[5]), null, true);     -- 담당자가 한쪽을 뺀다
  r := public.admin_merge_members(s[5], t[5], ks[5], kt[5], '개발 점검 — 겹침 정리 뒤(되돌림)');
  if (r->>'ok')::boolean is not true then raise exception '⑤ 한쪽을 뺀 뒤: %', r; end if;
  if (select count(*) from public.duty_signups where user_id = t[5]) is distinct from 2 then raise exception '⑤ 두 줄(살아 있는 줄 + 뺀 줄)'; end if;

  -- ⑥ 지난 날짜의 겹침은 막지 않는다(담당자 길로 넣는다 — 지난 날은 본인이 못 넣는다)
  perform duty_apply(sp1, s[6], jsonb_build_object('name','가상s6'||tag), true);
  perform duty_apply(sp2, t[6], jsonb_build_object('name','가상t6'||tag), true);
  r := public.admin_merge_members(s[6], t[6], ks[6], kt[6], '개발 점검 — 지난 날 겹침(되돌림)');
  if (r->>'ok')::boolean is not true then raise exception '⑥: %', r; end if;
  if (select count(*) from public.duty_signups where user_id = t[6] and status = 'active') is distinct from 2 then raise exception '⑥ 두 줄'; end if;
end $check$;
rollback;
select '통과 — member_merge_duty' as result;
