-- 교적ID 가 같으면 한 건으로(2026-10-28 친구) — edu_apply 의 p_ident.link_key 이어 붙이기 확인 — **개발에서만**(BEGIN … ROLLBACK). 운영에서 돌리지 않는다.
-- 끝에 「통과」 한 줄(select)이 나오면 끝. 하나라도 어긋나면 raise exception 으로 멈춘다(그때도 ROLLBACK 이라 남는 것 없음).
begin;
do $$
declare cid uuid; cid2 uuid; ua uuid; ub uuid; uc uuid; r jsonb; sid bigint; n int;
begin
  if (select count(*) from public.users) > 200 then raise exception '운영 같은 DB 입니다(users > 200) — 개발에서만 돌리세요'; end if;
  insert into public.users(identity_key, type, gu, mok, name) values ('교구|연결시험|1|||가', '교구', '연결시험', '1', '가') returning id into ua;
  insert into public.users(identity_key, type, gu, mok, name) values ('교구|연결시험|1|||나', '교구', '연결시험', '1', '나') returning id into ub;
  insert into public.users(identity_key, type, gu, mok, name) values ('교구|연결시험|1|||다', '교구', '연결시험', '1', '다') returning id into uc;
  insert into public.edu_courses(title, kind, capacity, mode, waitlist, status) values ('연결 시험 강좌', 'regular', 2, 'auto', true, 'open') returning id into cid;
  insert into public.edu_courses(title, kind, capacity, mode, waitlist, status) values ('연결 시험 강좌 둘', 'regular', 5, 'auto', true, 'open') returning id into cid2;
  insert into public.edu_sessions(course_id, no, on_date) values (cid, 1, edu_today() + 1), (cid2, 1, edu_today() + 1);

  -- ① 담당자가 대신 등록(계정 없음 · person|910001) → 가 가 앱으로 신청(link_key 같음) → 새 줄 없이 그 줄에 계정이 붙는다 · 정원 한 자리
  r := edu_apply(cid, null, '{"name":"가","ident_key":"person|910001","who_type":"교구","group_name":"연결시험","sub_name":"1"}', true);
  if r->>'status' is distinct from 'confirmed' then raise exception '1 대신 등록: %', r; end if;
  sid := (r->>'id')::bigint;
  r := edu_apply(cid, ua, '{"name":"가","ident_key":"교구|연결시험|1|||가","link_key":"person|910001"}', false);
  if (r->>'already')::boolean is not true or (r->>'linked')::boolean is not true or (r->>'id')::bigint is distinct from sid then raise exception '1 이어 붙이기: %', r; end if;
  if (select user_id from public.edu_enrollments where id = sid) is distinct from ua then raise exception '1 계정이 안 붙음'; end if;
  if (select count(*) from public.edu_enrollments where course_id = cid) is distinct from 1 then raise exception '1 줄이 둘'; end if;
  if (select ident_key from public.edu_enrollments where id = sid) is distinct from 'person|910001' then raise exception '1 열쇠는 그대로'; end if;
  -- 다시 눌러도 같은 줄(계정으로 찾는다) · linked 아님
  r := edu_apply(cid, ua, '{"name":"가","ident_key":"교구|연결시험|1|||가","link_key":"person|910001"}', false);
  if (r->>'already')::boolean is not true or (r->>'linked')::boolean is not false then raise exception '1 두 번째: %', r; end if;

  -- ② link_key 가 없으면(옛 api · 이어지지 않은 분) 옛 동작 — 새 줄을 만든다(같은 분일 수 있어요 표시가 남는 경우)
  r := edu_apply(cid2, null, '{"name":"나","ident_key":"person|910002","who_type":"교구","group_name":"연결시험","sub_name":"1"}', true);
  r := edu_apply(cid2, ub, '{"name":"나","ident_key":"교구|연결시험|1|||나"}', false);
  if (r->>'already') is not null then raise exception '2 link_key 없이 이어 붙음: %', r; end if;
  if (select count(*) from public.edu_enrollments where course_id = cid2) is distinct from 2 then raise exception '2 줄 수'; end if;

  -- ③ 반려된 대신 등록 줄에 잇기 — 반려가 그대로 따라간다(앱에서 다시 눌러도 되살지 않는다 · 정원 비껴가기 막힘)
  r := edu_apply(cid2, null, '{"name":"다","ident_key":"person|910003","who_type":"교구","group_name":"연결시험","sub_name":"1"}', true);
  sid := (r->>'id')::bigint;
  r := edu_staff_set(sid, 'declined', false); if r->>'ok' is distinct from 'true' then raise exception '3 반려: %', r; end if;
  r := edu_apply(cid2, uc, '{"name":"다","ident_key":"교구|연결시험|1|||다","link_key":"person|910003"}', false);
  if r->>'status' is distinct from 'declined' or (r->>'already')::boolean is not true or (r->>'linked')::boolean is not true then raise exception '3 반려 따라감: %', r; end if;
  if (select count(*) from public.edu_enrollments where course_id = cid2 and status = 'declined') is distinct from 1 then raise exception '3 반려 줄 수'; end if;

  -- ④ 취소한 대신 등록 줄은 잇지 않는다 — 새 줄이 생긴다(살아 있는 줄이 아니라 겹치지 않는다)
  r := edu_apply(cid2, null, '{"name":"라","ident_key":"person|910004","who_type":"교구","group_name":"연결시험","sub_name":"1"}', true);
  sid := (r->>'id')::bigint;
  r := edu_cancel(sid, true); if r->>'ok' is distinct from 'true' then raise exception '4 취소: %', r; end if;
  insert into public.users(identity_key, type, gu, mok, name) values ('교구|연결시험|1|||라', '교구', '연결시험', '1', '라') returning id into ua;
  r := edu_apply(cid2, ua, '{"name":"라","ident_key":"교구|연결시험|1|||라","link_key":"person|910004"}', false);
  if (r->>'already') is not null or (select user_id from public.edu_enrollments where id = sid) is not null then raise exception '4 취소 줄에 이어 붙음: %', r; end if;

  -- ⑤ 다른 열쇠(다른 교인ID) 줄에는 붙지 않는다 · 꼴이 틀린 link_key 는 무시한다
  r := edu_apply(cid, null, '{"name":"마","ident_key":"person|910005","who_type":"교구","group_name":"연결시험","sub_name":"1"}', true);
  insert into public.users(identity_key, type, gu, mok, name) values ('교구|연결시험|1|||바', '교구', '연결시험', '1', '바') returning id into ua;
  r := edu_apply(cid, ua, '{"name":"바","ident_key":"교구|연결시험|1|||바","link_key":"person|910006"}', false);
  if (r->>'already') is not null then raise exception '5 다른 교인ID: %', r; end if;
  insert into public.users(identity_key, type, gu, mok, name) values ('교구|연결시험|1|||사', '교구', '연결시험', '1', '사') returning id into ua;
  r := edu_apply(cid, ua, '{"name":"사","ident_key":"교구|연결시험|1|||사","link_key":"person|910005; drop"}', false);
  if (r->>'already') is not null then raise exception '5 꼴이 틀린 열쇠: %', r; end if;

  -- ⑥ 담당자 등록(p_staff)은 link_key 를 무시한다(앱 신청 갈래만)
  select count(*) into n from public.edu_enrollments where course_id = cid;
  r := edu_apply(cid, null, '{"name":"아","ident_key":"person|910005","link_key":"person|910005","who_type":"교구","group_name":"연결시험","sub_name":"1"}', true);
  if (r->>'already')::boolean is not true then raise exception '6 같은 열쇠 대신 등록은 원래 already: %', r; end if;
end $$;
select '통과' as edu_link_person;
rollback;
