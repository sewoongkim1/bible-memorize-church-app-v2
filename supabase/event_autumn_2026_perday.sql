-- 가을 말씀암송 동행 — 「하루 3번이면 한 칸」(needs.eligibility.perDay)과 문구를 같은 숫자로
-- ⚠️ 이 저장소는 공개(public)입니다 — 비밀번호·키를 절대 넣지 마세요.
-- 설계: docs/superpowers/specs/2026-10-03-autumn-event-launch-design.md §8
-- 계획: docs/superpowers/plans/2026-10-03-autumn-event-launch.md Task 12
--
-- ⚠️ 5 로 바꾸려면 아래 v_per_day 한 곳만 고쳐 다시 돌린다 — **10/14 까지만**(인쇄물 때문에
--    그 뒤로는 실제 마감). 바꾸면 marketing/autumn-2026/문구.md · poster.py 도 함께 고친다.
-- ⚠️ 개시(2026-10-18, status → open) 뒤에는 돌리지 않는다 — 가드가 draft 가 아니면 막는다.
-- 적용: 개발(ktpwthwqzgcqcrmsafdo) 먼저 → 확인 → 운영(xnomlgydifiqiybervtf). 여러 번 돌려도 같다
-- (이미 같은 perDay·문구면 아무것도 안 바꾼다).

do $$
declare
  v_per_day int := 3;
  v_intro   text;
  v_status  text;
  v_signups int;
begin
  v_intro :=
    '하루에 ' || v_per_day || '번 말씀을 암송하시면 그날 한 칸이 채워져요.' || chr(10) ||
    '한 주에 3일이면 그 주가 채워집니다 — 매일 하지 않아도 돼요.' || chr(10) ||
    '여섯 주 가운데 세 주만 채우시면 신청 단추가 열려요.' || chr(10) ||
    '신청하신 분께는 모두 드립니다.';

  select status into v_status from public.events where id = 'autumn-2026';
  if v_status is null then
    raise exception 'autumn-2026 행이 없다 — 이 DB 에 회차가 들어가 있는지 먼저 보라';
  end if;
  if v_status <> 'draft' then
    raise exception 'autumn-2026 이 이미 %이다 — 연 뒤에는 규칙을 바꾸지 않는다(설계 §13)', v_status;
  end if;
  select count(*) into v_signups from public.event_signups where event_id = 'autumn-2026';
  if v_signups > 0 then
    raise exception '신청이 %건 있다 — perDay 를 바꾸면 과거 판정이 소급해 바뀐다', v_signups;
  end if;

  update public.events
     set needs = jsonb_set(needs, '{eligibility,perDay}', to_jsonb(v_per_day)),
         copy  = jsonb_set(copy, '{intro}', to_jsonb(v_intro)),
         updated_at = now()
   where id = 'autumn-2026'
     and (needs->'eligibility'->>'perDay' is distinct from v_per_day::text
          or copy->>'intro' is distinct from v_intro);
end $$;

-- 확인 — perDay 가 3(또는 바꾼 값)이고 intro 가 그 숫자를 담고 있는지
select id, status, needs->'eligibility' as eligibility, copy->>'intro' as intro
  from public.events where id = 'autumn-2026';
