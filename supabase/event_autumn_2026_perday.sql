-- 가을 말씀암송 동행 — 규칙(하루 3번 · 한 주 3일 · **여덟 주 가운데 다섯 주**)과 안내 문구를 같은 숫자로
-- ⚠️ 2026-10-10 친구: 「이번 주(10/11)부터 8주로」 — 측정 10/11(일)~12/5(토) · weeks 8 · need 5 ·
--    minNeed 5(늦게 오신 분도 같은 기준 — 넷째 주(11/1~11/7)까지 시작하셔야 다섯 주가 된다 · 11/5(목)까지).
--    첫 주(10/11~17)는 공지 전 버퍼 — 공지는 10/18(주일)에 한꺼번에.
-- ⚠️ 이 저장소는 공개(public)입니다 — 비밀번호·키를 절대 넣지 마세요.
-- 설계: docs/superpowers/specs/2026-10-03-autumn-event-launch-design.md §8
-- 계획: docs/superpowers/plans/2026-10-03-autumn-event-launch.md Task 12
--
-- ⚠️ 5 로 바꾸려면 아래 v_per_day 한 곳만 고쳐 다시 돌린다 — **10/14 까지만**(인쇄물 때문에
--    그 뒤로는 실제 마감). 바꾸면 아래도 **모두** 함께 고친다(자료/marketing/autumn-2026/문구.md 머리와 같은 목록):
--      · 자료/marketing/autumn-2026/문구.md 다섯 절 모두(§1 주보 · §2 단톡 · §3 게시판 · §4 10/18 알림 · §5 11/3 알림)
--      · 포스터 자료/marketing/autumn-2026/poster.py 의 PER_DAY → 다시 뽑기(A3·16:9 PDF·PNG)
--      · supabase/event_autumn_2026_test.sql 의 시험 회차 'perDay' 와 intro 「하루에 3번」(10/17 까지만 의미가 있다)
--      · supabase/event_stamp_2026.sql 의 기록('perDay'·intro) — 기록만, 돌리지 않는다
--      · 확인 명령의 EXPECT_PER_DAY=3(docs/notes/bible-events-admin.md · 계획 Task 14 · tests/event-smoke.sh 머리·안내)
--    저절로 따라가는 것: supabase/event_streak_metrics.sql(autumn-2026 행의 perDay 를 읽는다) · 앱 화면(rule.perDay) ·
--    확인은 EXPECT_PER_DAY=5 bash tests/event-smoke.sh.
-- ⚠️ 개시(2026-10-18, status → open) 뒤에는 돌리지 않는다 — 가드가 draft 가 아니면 막는다.
-- 적용: 개발(ktpwthwqzgcqcrmsafdo) 먼저 → 확인 → 운영(xnomlgydifiqiybervtf). 여러 번 돌려도 같다
-- (이미 같은 perDay·문구면 아무것도 안 바꾼다).

do $$
declare
  v_per_day int := 3;
  v_weeks   int := 8;   -- 2026-10-10 · 7 → 8 (10/11 시작 · 측정 끝 12/5 토 · 첫 주는 공지 전 버퍼)
  v_need    int := 5;   -- 2026-10-04 · 3 → 5
  v_min     int := 5;   -- 늦게 오신 분도 같은 기준(친구) — api evtNeedFor 가 min(need, max(minNeed, …)) 라 5 면 늘 5
  v_intro   text;
  v_status  text;
  v_signups int;
begin
  v_intro :=
    '하루에 ' || v_per_day || '번 말씀을 암송하시면 그날 한 칸이 채워져요.' || chr(10) ||
    '한 주에 3일이면 그 주가 채워집니다 — 매일 하지 않아도 돼요.' || chr(10) ||
    '여덟 주 가운데 다섯 주를 채워 참여하신 분께는 모두 소정의 선물을 드려요.' || chr(10) ||
    '세 주는 쉬어도 괜찮아요.';
    -- ↑ 2026-10-10 친구: intro 박스에서 「따로 신청하지 않으셔도 돼요」·「행사가 끝나면 …올려요」 두 줄을 뺐다.
    --   명단 공개(§9-4) 안내는 개인정보 방침 네 곳(privacy/·renderPrivacyInfo·renderHelp)에 그대로 있다.
    -- ↑ 신청 없이 「자동 대상」(설계 §9 · 친구 2026-10-03) — 「신청」 단추·기간을 말하지 않는다.
    --   7주 중 5주(설계 §10 · 2026-10-04) — 늦게 오신 분도 같은 기준이라 「두 주면 돼요」 줄은 뺐다.

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
     set needs = jsonb_set(jsonb_set(jsonb_set(jsonb_set(needs,
                   '{eligibility,perDay}',  to_jsonb(v_per_day)),
                   '{eligibility,weeks}',   to_jsonb(v_weeks)),
                   '{eligibility,need}',    to_jsonb(v_need)),
                   '{eligibility,minNeed}', to_jsonb(v_min)),
         copy  = jsonb_set(copy, '{intro}', to_jsonb(v_intro)),
         updated_at = now()
   where id = 'autumn-2026'
     and (needs->'eligibility'->>'perDay' is distinct from v_per_day::text
          or needs->'eligibility'->>'weeks'   is distinct from v_weeks::text
          or needs->'eligibility'->>'need'    is distinct from v_need::text
          or needs->'eligibility'->>'minNeed' is distinct from v_min::text
          or copy->>'intro' is distinct from v_intro);

  -- 부제(설계 §9-2 「바뀜 2026-10-04」) — 「선물 대상」이라는 말을 뺀다(친구: 선물이 목적으로 보인다).
  --   2026-10-03 에 「…신청이 열려요」 → 「…선물 대상이 돼요」로 바꿨던 것을 「말씀과 함께 걸어요」로 다시 바꾼다.
  --   ⚠️ perDay 숫자를 박지 않는다 — 3 ↔ 5 를 바꿀 때 고칠 목록(이 파일 머리)에 안 걸리게.
  --   부제는 교회 어드민에서 고칠 수 있는 칸이라 **옛 글자(둘 중 하나) 그대로일 때만** 바꾼다
  --   (친구가 어드민에서 고쳐 두었으면 건드리지 않는다).
  update public.events
     set subtitle = '올해 받은 말씀을 기억하고, 말씀 앞에 머무는 시간',   -- 2026-10-10 친구(포스터 문구)
         updated_at = now()
   where id = 'autumn-2026'
     and subtitle in ('여덟 주 가운데 다섯 주, 말씀과 함께 걸어요',
                      '일곱 주 가운데 다섯 주, 말씀과 함께 걸어요',
                      '여섯 주 가운데 세 주, 말씀과 함께 걸어요',
                      '여섯 주 가운데 세 주를 채우시면 선물 대상이 돼요',
                      '여섯 주 가운데 세 주를 채우시면 신청이 열려요');
end $$;

-- 확인 — perDay 가 3(또는 바꾼 값)이고 intro 가 그 숫자를 담고 있는지 · 부제
select id, status, subtitle, needs->'auto' as auto, needs->'eligibility' as eligibility, copy->>'intro' as intro
  from public.events where id = 'autumn-2026';
