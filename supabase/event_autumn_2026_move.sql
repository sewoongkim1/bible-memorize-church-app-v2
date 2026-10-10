-- 가을 말씀암송 동행 — 측정 시작일 2026-10-11 (2026-10-10 친구 결정: 이번 주부터 8주 · 첫 주는 공지 전 버퍼)
--   (2026-10-03 에 10/11 → 10/18 로 미뤘던 것을 10/11 로 되돌리고 weeks 를 8 로 — perday.sql)
-- ⚠️ 이 저장소는 공개(public)입니다 — 비밀번호·키를 절대 넣지 마세요.
-- 설계: docs/superpowers/specs/2026-10-03-autumn-event-launch-design.md §2
--
-- 왜 SQL 인가: 교회 어드민 회차 설정은 needs 를 받지 않는다(EV_EDIT_KEYS). 이름·신청 창은 친구가 어드민에서 고친다.
-- ⚠️ event_stamp_2026.sql 을 다시 돌리지 말 것 — 어드민에서 고친 칸을 덮는다. 이 파일은 start 한 칸만 바꾼다.
-- 적용: 개발 먼저 → 확인 → 운영. 두 번 돌려도 같다(이미 10-18 이면 아무것도 안 바꾼다).

do $$
declare
  v_status text;
  v_signups int;
begin
  select status into v_status from public.events where id = 'autumn-2026';
  if v_status is null then
    raise exception 'autumn-2026 행이 없다 — 이 DB 에 회차가 들어가 있는지 먼저 보라';
  end if;
  if v_status <> 'draft' then
    raise exception 'autumn-2026 이 이미 %이다 — 연 뒤에는 규칙을 바꾸지 않는다(9/23 설계 §13)', v_status;
  end if;
  select count(*) into v_signups from public.event_signups where event_id = 'autumn-2026';
  if v_signups > 0 then
    raise exception '신청이 %건 있다 — 시작일을 바꾸면 과거 판정이 소급해 바뀐다', v_signups;
  end if;

  update public.events
     set needs = jsonb_set(needs, '{eligibility,start}', '"2026-10-11"'::jsonb),
         updated_at = now()
   where id = 'autumn-2026'
     and needs->'eligibility'->>'start' is distinct from '2026-10-11';
end $$;

-- 확인 — start 가 10-18 이고 신청 시작(opens_on)이 그보다 뒤인지
select id, status, title, short_title, opens_on, closes_on, list_until,
       needs->'eligibility' as eligibility,
       (opens_on > (needs->'eligibility'->>'start')::date) as "신청이 측정보다 뒤"
  from public.events where id = 'autumn-2026';
