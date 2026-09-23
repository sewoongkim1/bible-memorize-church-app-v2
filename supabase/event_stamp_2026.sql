-- 가을 말씀 동행 — **이 회차 한 건**의 행과 규칙 (자료)
-- ⚠️ 이 저장소는 공개(public)입니다 — 비밀번호·키를 절대 넣지 마세요.
--
-- 적용: 개발 먼저, 확인한 뒤 운영. 여러 번 돌려도 안전하다(on conflict do update).
-- 구조(RPC·인덱스)는 supabase/event_streak.sql 에 있다 — 그것을 먼저 돌린다.
-- 설계: docs/superpowers/specs/2026-09-23-autumn-streak-event-design.md
--
-- ⚠️ status 는 **draft** 로 넣는다. 개시는 2026-10-11 아침에 담당자가
--    admin-event.html 에서 draft → open 으로 한 번 바꾸는 것이다(사람이 손으로 한다).
-- ⚠️ 측정 창(needs.eligibility.start + weeks)과 신청 창(opens_on/closes_on)은 **다르다.**
--    3주가 가장 빨리 성립하는 날이 10/27 이라, 그전에 신청을 열면 화면이 16일 동안
--    「등록하세요」라고 거짓말한다.
-- ⚠️ 날짜를 옮기면 app.js 의 FEAT_SINCE.stamp 도 함께 옮긴다(7일 단위로만).
-- ⚠️ **opens_on 은 언제나 eligibility.start 보다 뒤여야 한다.** 앞서면 화면은
--    「10월 11일에 시작해요」(phase=before)라고 하면서 신청 단추는 열린 상태가 된다
--    — 두 값을 보는 잣대가 다르기 때문이다(phase 는 start, 신청 가능은 opens_on).
--    2026-09-23 개발에서 날짜를 당겨 시험하다 실제로 그 상태를 만들어 봤다.

insert into public.events
  (id, title, short_title, subtitle, season, kind, status,
   opens_on, closes_on, list_until, sort_order, needs, copy)
values (
  'autumn-2026',
  '2026 가을 말씀 동행',
  '가을 말씀 동행',
  '여섯 주 가운데 세 주를 채우시면 신청이 열려요',
  '2026-4Q',
  'signup',
  'draft',
  '2026-10-27',          -- 신청 시작(3주가 가장 빨리 성립하는 날)
  '2026-11-28',          -- 신청 마감(측정은 11/21 에 끝난다 — 일주일 여유)
  '2026-12-13',          -- 명단 공개 종료. ⚠️ 비우면 12월에도 첫 화면에 박혀 있다
  10,
  jsonb_build_object(
    'eligibility', jsonb_build_object(
      'start',   '2026-10-11',   -- 주일
      'weeks',   6,
      'perWeek', 3,
      'need',    3,
      'minNeed', 2               -- 이벤트 중 처음 오신 분의 최소 필요 주수
    )
  ),
  jsonb_build_object(
    'intro',
      '하루에 한 번만 말씀과 함께하면 그날 한 칸이 채워져요.' || chr(10) ||
      '한 주에 3일이면 그 주가 채워집니다 — 매일 하지 않아도 돼요.' || chr(10) ||
      '여섯 주 가운데 세 주만 채우시면 신청 단추가 열려요.' || chr(10) ||
      '신청하신 분께는 모두 드립니다.',
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
  opens_on    = excluded.opens_on,
  closes_on   = excluded.closes_on,
  list_until  = excluded.list_until,
  sort_order  = excluded.sort_order,
  needs       = excluded.needs,
  copy        = excluded.copy,
  updated_at  = now();
-- ⚠️ status 는 일부러 안 덮어쓴다 — 개시한 뒤 이 파일을 다시 돌려도
--    성도님 화면이 draft 로 되돌아가지 않게.

-- 확인 ① 규칙이 제대로 들어갔는지
-- select id, status, opens_on, closes_on, list_until, needs->'eligibility'
--   from public.events where id = 'autumn-2026';

-- 확인 ② 지금 성도님께 보이는 회차가 몇 개인지 — 둘이면 첫 화면이 「이벤트 2개」로 접힌다
-- select id, status, opens_on, closes_on, list_until from public.events
--  where status in ('open','closed') order by closes_on;
