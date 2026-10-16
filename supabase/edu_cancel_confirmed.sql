-- 교육 — 확정된 신청은 성도님이 앱에서 취소하지 못하게(2026-10-16 친구 「교육이 확정되면 본인이 취소를 못하게」 · 모든 강좌)
-- ⚠️ 이 파일은 supabase/edu.sql 의 edu_cancel 정의를 그대로 옮긴 것이다 — 고칠 때는 edu.sql 을 먼저 고치고 이 파일도 같게.
--    edu.sql 을 통째로 다시 돌리지 않고 이 함수 하나만 바꾸려고 둔다. 개발 먼저 → 운영. 넣은 뒤 python tools/sql-applied.py record supabase/edu_cancel_confirmed.sql --dev|--prod
-- 배포 차례: 이 SQL → api(eduMineOut canCancel) → 화면(js/edu.js 문구). SQL 이 먼저 나가도 옛 화면은 취소를 누르면 「확정된 뒤에는 …」 말만 받는다.
-- 되돌리기: edu.sql 에서 「if not p_staff and e.status = 'confirmed'」 한 줄을 빼고 이 파일을 다시 만들어 돌린다.

create or replace function public.edu_cancel(p_enrollment bigint, p_staff boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e public.edu_enrollments; cid uuid; first_day date; was_confirmed boolean; p bigint;
begin
  p_staff := coalesce(p_staff, false);
  select course_id into cid from public.edu_enrollments where id = p_enrollment;
  if cid is null then return jsonb_build_object('ok',false,'error','not-found'); end if;
  perform 1 from public.edu_courses where id = cid for update;            -- 차례: 강좌 → 신청 줄(교착 막기)
  select * into e from public.edu_enrollments where id = p_enrollment for update;
  if not found then return jsonb_build_object('ok',false,'error','not-found'); end if;
  if e.status not in ('applied','confirmed','waitlisted') then return jsonb_build_object('ok',false,'error','not-active'); end if;
  if not p_staff then
    select coalesce(min(s.on_date), (select starts_on from public.edu_courses where id = cid)) into first_day
      from public.edu_sessions s where s.course_id = cid;   -- 집계라 회차가 없어도 한 줄이 나온다
    if first_day is not null and edu_today() >= first_day then return jsonb_build_object('ok',false,'error','too-late'); end if;
  end if;
  -- **살아 있는 수료**(번호 있고 취소 아님) 줄은 취소하지 않는다(3단계) — 먼저 수료를 취소해야 한다(edu_revoke_cert).
  --   수료를 취소한 줄은 취소된다(검토 반영 2026-10-05) — 번호는 그 줄에 남고(다시 쓰지 않음 · 진위 확인 「취소됨」),
  --   합치기는 번호가 있는 취소 겹침 줄을 지우지 않고 멈춘다(member_merge.sql). 칸 제약 edu_enrollments_cert_check 도 같은 규칙.
  --   성도님은 첫 날 전에만 취소하므로 보통 위 too-late 가 먼저 걸린다(번호는 그 뒤에 생긴다).
  if e.cert_no is not null and not e.cert_revoked then return jsonb_build_object('ok',false,'error','has-cert'); end if;
  -- **확정된 줄은 성도님이 앱에서 취소하지 못한다**(2026-10-16 친구 「교육이 확정되면 본인이 취소를 못하게」 · 모든 강좌 — 선착순은 누르는 순간 확정이라
  --   신청 확인 창이 미리 알린다). 담당자(p_staff)는 그대로 취소한다 → 그때 대기 첫 분이 오른다(교회 어드민이 알림).
  --   차례는 not-active → too-late → has-cert → confirmed(앞의 말이 더 맞는 까닭이면 그 말 · 시험 기대값도 이 차례).
  --   승인 기다림 · 대기는 지금처럼 첫 날 전날까지 앱에서 취소된다. 앱 화면은 api eduMineOut 의 canCancel 이 같은 셈을 한다.
  if not p_staff and e.status = 'confirmed' then return jsonb_build_object('ok',false,'error','confirmed'); end if;
  was_confirmed := e.status = 'confirmed';
  update public.edu_enrollments set status = 'cancelled', cancelled_at = now(), updated_at = now() where id = e.id;
  if was_confirmed then p := edu_promote(cid); end if;
  return jsonb_build_object('ok',true,'promoted',p);
end $$;

revoke all on function public.edu_cancel(bigint, boolean) from public, anon, authenticated;
grant execute on function public.edu_cancel(bigint, boolean) to service_role;

-- 확인: 성도님 길(false)로 확정 줄을 취소하면 confirmed — 개발 시험 supabase/tests/edu_apply.dev.sql · edu_period.dev.sql
select 'edu_cancel 확정 막기' as applied;
