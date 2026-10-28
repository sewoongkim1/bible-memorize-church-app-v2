-- 교육 — 앱 신청을 교적ID 가 같은 「대신 등록」 줄에 이어 붙이기(2026-10-28 친구 「교적ID가 같으면 한 건으로」)
-- ⚠️ 이 파일은 supabase/edu.sql 의 edu_apply 정의를 그대로 옮긴 것이다 — 고칠 때는 edu.sql 을 먼저 고치고 이 파일도 같게.
--    edu.sql 을 통째로 다시 돌리지 않고 이 함수 하나만 바꾸려고 둔다(시그니처가 같아 겹쳐 쓰는 함수가 생기지 않는다). 개발 먼저 → 운영.
--    넣은 뒤 python tools/sql-applied.py record supabase/edu_link_by_person.sql --dev|--prod
-- 배포 차례: 이 SQL(옛 api 는 link_key 를 보내지 않으니 그대로 돈다) → 교회 어드민(internalEduFindPerson) → 성경암송 api(eduApply).
-- 되돌리기: edu.sql 에서 「교적ID 가 같은 대신 등록 줄에 이어 붙인다」 블록과 v_link·v_linked 를 빼고 이 파일을 다시 만들어 돌린다.
-- 다시 돌려도 안전하다(create or replace).

create or replace function public.edu_apply(p_course uuid, p_user uuid, p_ident jsonb, p_staff boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c public.edu_courses;
  e public.edu_enrollments;
  n int;
  st text;
  v_name text := btrim(coalesce(p_ident->>'name',''));
  v_key  text := coalesce(p_ident->>'ident_key','');
  v_link text := coalesce(p_ident->>'link_key','');
  v_linked boolean := false;
begin
  p_staff := coalesce(p_staff, false);          -- null 이 담당자 길로 새지 않게
  if v_name = '' or char_length(v_name) > 40 then return jsonb_build_object('ok',false,'error','bad-ident'); end if;
  -- 계정 없는 신청은 담당자 대신 등록만 · 신원 키 필수
  if p_user is null and (v_key = '' or not p_staff) then return jsonb_build_object('ok',false,'error','bad-ident'); end if;
  select * into c from public.edu_courses where id = p_course for update;
  if not found then return jsonb_build_object('ok',false,'error','not-found'); end if;
  -- 담당자도 끝난·보관된 강좌에는 못 넣는다(창·선수 조건만 건너뛴다)
  if p_staff and c.status in ('done','archived') then return jsonb_build_object('ok',false,'error','not-open'); end if;
  if not p_staff then
    if c.status <> 'open' then return jsonb_build_object('ok',false,'error','not-open'); end if;
    if c.apply_from is not null and edu_today() < c.apply_from then return jsonb_build_object('ok',false,'error','not-yet'); end if;
    if c.apply_to   is not null and edu_today() > c.apply_to   then return jsonb_build_object('ok',false,'error','closed-period'); end if;
  end if;

  -- 같은 분의 줄 — 앱 계정이면 계정으로, 대신 등록(계정 없음)이면 신원 키로
  if p_user is not null then
    select * into e from public.edu_enrollments where course_id = p_course and user_id = p_user for update;
    -- 교적ID 가 같은 대신 등록 줄에 이어 붙인다(2026-10-28 친구 「교적ID가 같으면 한 건으로」) — 성도님 앱 신청일 때만, 이 계정의 줄이 없을 때만.
    --   p_ident.link_key = 「person|교인ID」 — 성경암송 api eduApply 가 교회 어드민에 물어(internalEduFindPerson) 한 분으로 맞을 때만 싣는다
    --   (화면이 보낸 값이 아니다). 그 교적ID 의 대신 등록 줄(계정 없음 · 취소 아님)을 이 계정의 것으로 바꾸고, 새 줄을 만들지 않는다 —
    --   정원은 한 자리, 반려는 그대로 따라간다(아래 반려 유지). 취소한 줄은 잇지 않는다(새로 신청하면 새 줄 · 살아 있는 줄이 아니라 겹치지 않는다).
    if e.id is null and not p_staff and v_link ~ '^person\|[0-9]+$' then
      select * into e from public.edu_enrollments
        where course_id = p_course and user_id is null and ident_key = v_link and status in ('applied','confirmed','waitlisted','declined')
        order by id desc limit 1 for update;
      if e.id is not null then
        update public.edu_enrollments set user_id = p_user, updated_at = now() where id = e.id;
        v_linked := true;
      end if;
    end if;
  elsif v_key <> '' then
    select * into e from public.edu_enrollments where course_id = p_course and user_id is null and ident_key = v_key
      order by id desc limit 1 for update;
  end if;
  if e.id is not null and e.status in ('applied','confirmed','waitlisted') then
    return jsonb_build_object('ok',true,'id',e.id,'status',e.status,'already',true,'linked',v_linked);
  end if;
  -- 반려 유지(친구 결정 2026-10-05) — 성도님이 다시 신청해도 되살리지 않는다. 담당자는 edu_staff_set 으로 「다시 받기」.
  if e.id is not null and e.status = 'declined' and not p_staff then
    return jsonb_build_object('ok',true,'id',e.id,'status','declined','already',true,'linked',v_linked);
  end if;

  if c.mode = 'approve' and not p_staff then
    st := 'applied';
  else
    select count(*) into n from public.edu_enrollments where course_id = p_course and status = 'confirmed';
    if c.capacity is null or n < c.capacity then st := 'confirmed';
    elsif c.waitlist or p_staff then st := 'waitlisted';
    else return jsonb_build_object('ok',false,'error','full');
    end if;
  end if;

  if e.id is not null then   -- 취소·반려됐던 줄을 되살린다(같은 강좌 한 계정 한 줄)
    update public.edu_enrollments set
      status = st, source = case when p_staff then 'staff' else 'app' end,
      ident_key = v_key, who_type = coalesce(p_ident->>'who_type',''), group_name = coalesce(p_ident->>'group_name',''),
      sub_name = coalesce(p_ident->>'sub_name',''), name = v_name,
      applied_at = now(), waitlist_at = case when st = 'waitlisted' then now() end,
      decided_at = case when st = 'confirmed' then now() end, cancelled_at = null, updated_at = now()
    where id = e.id;
    return jsonb_build_object('ok',true,'id',e.id,'status',st);
  end if;

  insert into public.edu_enrollments(course_id, user_id, ident_key, who_type, group_name, sub_name, name,
                                     status, source, waitlist_at, decided_at)
  values (p_course, p_user, v_key, coalesce(p_ident->>'who_type',''), coalesce(p_ident->>'group_name',''),
          coalesce(p_ident->>'sub_name',''), v_name, st, case when p_staff then 'staff' else 'app' end,
          case when st = 'waitlisted' then now() end, case when st = 'confirmed' then now() end)
  returning * into e;
  return jsonb_build_object('ok',true,'id',e.id,'status',st);
end $$;
