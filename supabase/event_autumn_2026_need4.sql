-- 가을 말씀암송 동행(autumn-2026) — 기준 「여덟 주 가운데 다섯 주」 → 「여덟 주 가운데 네 주」(2026-11-06 친구 「8주에서 5주 → 8주에서 4주로」)
-- ⚠️ 이 저장소는 공개(public)입니다 — 비밀번호·키를 절대 넣지 마세요.
--
-- 무엇: events(id='autumn-2026') 의 needs.eligibility.need · minNeed 를 **한 UPDATE 에서 함께** 5 → 4, 도장판 안내(copy.intro) 두 줄을 같은 숫자로.
--   ⚠️ need 만 4 로 두고 minNeed 를 5 로 남기면 안 된다 — api evtRule(index.ts)과 교회 어드민 events-elig.ts 가 minNeed > need 를
--      「규칙을 못 읽음」으로 보고 도장판이 「기록을 맞추는 중」에 멈춘다. 둘 다 4 면 evtNeedFor 가 모든 분께 4(늦게 오신 분도 같은 기준).
--   늦게 시작할 수 있는 마지막 주: 넷째 주(11/1~11/7) → **다섯째 주(11/8~11/14)** · 마지막 날 11/5(목) → **11/12(목)**(그 주에 사흘) — 화면은 값에서 저절로 계산한다.
--   그대로: start 2026-10-11 · weeks 8 · perWeek 3 · perDay 3(「3↔5」는 열린 뒤 바꾸지 않는다) · auto true · 부제(숫자 없음).
-- 왜 따로: event_autumn_2026_perday.sql 은 status 가 draft 가 아니면 막는다(설계 §13 — 연 뒤 규칙 바꾸지 않기). 이번엔 친구가 연 뒤
--   **기준을 낮추기로**(받는 분이 늘기만 한다 · 지난 판정을 거꾸로 깎지 않는다) 해서 열린 회차용 한 번 SQL 을 둔다. perday.sql 의 가드는 그대로.
-- 실행: 개발(ktpwthwqzgcqcrmsafdo) 먼저 → 확인 → 운영(xnomlgydifiqiybervtf). 여러 번 돌려도 같다(이미 4·4 · 새 글자면 아무것도 안 바꾼다).
-- 가드: 행이 있고 · 상태가 draft/open 이고 · weeks 8 · perDay 3 · 지금 need·minNeed 가 (5,5) 또는 (4,4) 일 때만 — 다른 값이면 멈춘다.
-- 되돌리기: 이 파일의 v_need·v_min 을 5 로, 아래 두 replace 를 거꾸로(네 주 → 다섯 주 · 네 주는 쉬어도 → 세 주는 쉬어도) 바꿔 다시 돌린다.
-- 함께 고친 곳(코드 · 문서): app.js 개시 팝업 · 「목장에 알리기」 공유 글 · index.html og:description · og:image(og-autumn-4w.png) ·
--   supabase/event_autumn_2026_perday.sql · event_stamp_2026.sql(기록만) · 문구.md 머리 · docs/notes/bible-events-admin.md · CLAUDE.md.

do $$
declare
  v_need   int := 4;
  v_min    int := 4;
  v_status text;
  v_e      jsonb;
  v_intro  text;
  v_new    text;
begin
  select status, needs->'eligibility', copy->>'intro' into v_status, v_e, v_intro from public.events where id = 'autumn-2026';
  if v_status is null then
    raise exception 'autumn-2026 행이 없다 — 이 DB 에 회차가 들어가 있는지 먼저 보라';
  end if;
  if v_status not in ('draft', 'open') then
    raise exception 'autumn-2026 이 %이다 — 닫힌 회차의 기준은 바꾸지 않는다', v_status;
  end if;
  if (v_e->>'weeks')::int is distinct from 8 or (v_e->>'perDay')::int is distinct from 3 then
    raise exception 'weeks·perDay 가 예상(8·3)과 다르다 — weeks %, perDay % · 먼저 사람이 본다', v_e->>'weeks', v_e->>'perDay';
  end if;
  if not (((v_e->>'need')::int, (v_e->>'minNeed')::int) in ((5, 5), (4, 4))) then
    raise exception 'need·minNeed 가 예상(5·5 또는 4·4)과 다르다 — need %, minNeed % · 먼저 사람이 본다', v_e->>'need', v_e->>'minNeed';
  end if;

  v_new := replace(replace(coalesce(v_intro, ''),
             '여덟 주 가운데 다섯 주를 채워', '여덟 주 가운데 네 주를 채워'),
             '세 주는 쉬어도 괜찮아요.', '네 주는 쉬어도 괜찮아요.');

  update public.events
     set needs = jsonb_set(jsonb_set(needs,
                   '{eligibility,need}',    to_jsonb(v_need)),
                   '{eligibility,minNeed}', to_jsonb(v_min)),
         copy  = case when v_intro is null then copy else jsonb_set(copy, '{intro}', to_jsonb(v_new)) end,
         updated_at = now()
   where id = 'autumn-2026'
     and (needs->'eligibility'->>'need'    is distinct from v_need::text
          or needs->'eligibility'->>'minNeed' is distinct from v_min::text
          or copy->>'intro' is distinct from v_new);
end $$;

-- 확인 — need·minNeed 4 · intro 셋째·넷째 줄이 「네 주」 · 나머지(start·weeks·perWeek·perDay·auto) 그대로
select id, status, needs->'auto' as auto, needs->'eligibility' as eligibility, copy->>'intro' as intro
  from public.events where id = 'autumn-2026';
