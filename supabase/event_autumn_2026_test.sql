-- 가을 말씀암송 동행 — 시험 회차(autumn-2026-test) · 🧪 시험 참여자에게만 보인다
-- ⚠️ 이 저장소는 공개(public)입니다 — 비밀번호·키를 절대 넣지 마세요.
-- 설계: docs/superpowers/specs/2026-10-03-autumn-event-launch-design.md §8-2
-- 계획: docs/superpowers/plans/2026-10-03-autumn-event-launch.md Task 12
--
-- ⚠️ needs.testOnly = true 인 행은 status 와 무관하게 ministryIsTester(user_id) 인 계정에게만
--    목록·도장·신청·취소·명단에 나온다(evtTestOnly·evtIsTester·evtOpenFor·evtListableFor,
--    supabase/functions/api/index.ts). 그 밖의 사람에게는 없는 회차와 똑같다(not-found).
-- ⚠️ 측정은 2026-09-27(일)부터 6주 — 며칠 안에 「한 주 채움 → 신청」까지 시험해 보려고
--    perWeek 1 · need 1 · minNeed 1 로 짧게 잡았다(진짜 autumn-2026 과는 다른 숫자다).
-- ⚠️ 짧은 이름(short_title)은 「[시험] 가을 동행」 — 첫 화면 단추 알약이 360px 이하에서 잘려서 줄였다
--    (검토 2026-10-03). 긴 이름(title)은 「[시험] 가을 말씀암송 동행」 그대로.
-- ⚠️ status 는 **덮지 않는다** — on conflict do update 에서 일부러 뺐다(교회 어드민에서
--    손으로 바꾼 상태를 이 파일을 다시 돌려도 되돌리지 않게).
-- ⚠️ 2026-10-17 에 이 회차를 지운다(아래 주석) — 그 뒤로 이 파일을 다시 돌려 되살리지
--    못하게 아래 가드가 막는다.
-- 적용: 개발(ktpwthwqzgcqcrmsafdo) 먼저 → 확인 → 운영(xnomlgydifiqiybervtf).
-- ⚠️ 다시 돌리면 status 를 뺀 **나머지 칸이 이 파일 값으로 되돌아간다** — 제목·짧은 이름·부제·
--    날짜(opens_on·closes_on·list_until)·sort_order·needs·copy. 교회 어드민에서 그 칸을 고쳤다면
--    다시 돌리는 순간 사라진다. 시험 회차라 「파일이 원본」인 것이 맞아 그대로 둔다(검토 2026-10-03) —
--    어드민에서 고친 것이 있으면 이 파일에 먼저 옮겨 적고 돌린다. 행 수는 늘지 않는다(on conflict).

do $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
begin
  if v_today > date '2026-10-17' then
    raise exception '오늘(KST %)이 2026-10-17 보다 뒤다 — 시험 회차(autumn-2026-test)를 되살리지 않는다(개시 뒤 재실행 방지)', v_today;
  end if;
end $$;

insert into public.events
  (id, title, short_title, subtitle, season, kind, status,
   opens_on, closes_on, list_until, sort_order, needs, copy)
values (
  'autumn-2026-test',
  '[시험] 가을 말씀암송 동행',
  '[시험] 가을 동행',      -- 짧은 이름 — 첫 화면 알약(360px 이하에서 긴 이름은 잘린다)
  '🧪 시험 참여자에게만 보이는 시험 회차입니다 — 10/17 에 지웁니다',
  '2026-test',
  'signup',
  'draft',
  '2026-10-04',          -- 신청 시작
  '2026-10-17',          -- 신청 마감
  '2026-10-17',          -- 명단 공개 종료
  999,                   -- 목록 맨 뒤(실제로는 testOnly 라 시험 참여자 말고는 안 보인다)
  jsonb_build_object(
    'eligibility', jsonb_build_object(
      'start',   '2026-09-27',
      'weeks',   6,
      'perWeek', 1,
      'need',    1,
      'minNeed', 1,
      'perDay',  3
    ),
    'testOnly', true,
    'auto',     true      -- 신청 없이 「자동 대상」(설계 §9) · 다시 돌려도 이 표시가 지워지지 않게 여기에도
  ),
  jsonb_build_object(
    'intro',
      '시험 회차예요 — 🧪 시험 참여자에게만 보여요.' || chr(10) ||
      '하루에 3번 말씀을 암송하시면 그날 한 칸이 채워져요.' || chr(10) ||
      '한 주에 1일이면 그 주가 채워집니다.' || chr(10) ||
      '여섯 주 가운데 한 주를 채우시면 선물 대상이 돼요 — 따로 신청하지 않으셔도 돼요.' || chr(10) ||
      '시험이 끝나는 10월 17일에 이 회차가 지워져요.',
    'doneBadge', '✅ 신청하셨어요',
    'mineBtn',   '신청 내용 보기 →',
    'sentState', '신청'
  )
)
on conflict (id) do update set
  title       = excluded.title,
  short_title = excluded.short_title,
  subtitle    = excluded.subtitle,
  season      = excluded.season,
  kind        = excluded.kind,
  opens_on    = excluded.opens_on,
  closes_on   = excluded.closes_on,
  list_until  = excluded.list_until,
  sort_order  = excluded.sort_order,
  needs       = excluded.needs,
  copy        = excluded.copy,
  updated_at  = now();
-- ⚠️ status 는 일부러 안 덮어쓴다(위 설명).

-- 확인
select id, status, title, short_title, opens_on, closes_on, list_until,
       needs->'eligibility' as eligibility, needs->'testOnly' as test_only,
       copy->>'intro' as intro
  from public.events where id = 'autumn-2026-test';

-- 10/17 지우기: delete from public.events where id = 'autumn-2026-test';  -- 신청은 cascade 로 함께
