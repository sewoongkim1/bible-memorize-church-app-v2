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
--   2026-11-06 개발 · 운영에 넣었다(운영 스모크 EXPECT_NEED=4 46/0) · 같은 날 검토 뒤 가드를 굳혀 다시 돌렸다(바뀐 줄 0 — 기록 sha 도 새 판으로).
-- 가드(하나라도 걸리면 아무것도 안 바꾼다 — do 블록 하나):
--   행이 있다 · 상태가 draft/open · 측정이 안 끝났다(KST 12/5 까지) · start 10/11 · weeks 8 · perWeek 3 · perDay 3 · open 이면 auto true ·
--   지금 need·minNeed 가 (5,5) 또는 (4,4)(값이 비면 멈춘다 — `in` 은 NULL 이면 그냥 지나간다) ·
--   안내를 바꾼 뒤 「네 주를 채워」·「네 주는 쉬어도」가 있고 「다섯 주」·「세 주는 쉬어도」가 없다(누가 고쳐 옛 글자를 못 찾으면 숫자만 4 가 될 뻔했다).
-- 되돌리기: v_need·v_min 을 5 로, v_old·v_new 두 쌍을 서로 바꾸고, 「바꾼 뒤 확인」의 글자도 거꾸로(다섯 주가 있어야) 고쳐 다시 돌린다.
-- 함께 고친 곳(코드 · 문서): app.js 개시 팝업 · 「목장에 알리기」 공유 글 · index.html og:description · og:image(og-autumn-4w.png) ·
--   supabase/event_autumn_2026_perday.sql · event_stamp_2026.sql(기록만) · tests/event-auto.test.cjs ①⑬ · tests/event-smoke.sh(EXPECT_NEED) ·
--   문구.md 머리 · docs/notes/bible-events-admin.md · CLAUDE.md.

do $$
declare
  v_need   int  := 4;
  v_min    int  := 4;
  v_old3   text := '여덟 주 가운데 다섯 주를 채워';
  v_new3   text := '여덟 주 가운데 네 주를 채워';
  v_old4   text := '세 주는 쉬어도 괜찮아요.';
  v_new4   text := '네 주는 쉬어도 괜찮아요.';
  v_status text;
  v_needs  jsonb;
  v_e      jsonb;
  v_intro  text;
  v_new    text;
  v_n      int;
begin
  select status, needs, copy->>'intro' into v_status, v_needs, v_intro
    from public.events where id = 'autumn-2026' for update;
  if not found then
    raise exception 'autumn-2026 행이 없다 — 이 DB 에 회차가 들어가 있는지 먼저 보라';
  end if;
  v_e := v_needs->'eligibility';
  if v_status is null or v_status not in ('draft', 'open') then
    raise exception 'autumn-2026 이 %이다 — 닫힌 회차의 기준은 바꾸지 않는다', v_status;
  end if;
  if (now() at time zone 'Asia/Seoul')::date > date '2026-12-05' then
    raise exception '측정이 끝났다(KST %) — 끝난 뒤에는 기준을 바꾸지 않는다', (now() at time zone 'Asia/Seoul')::date;
  end if;
  if (v_e->>'start') is distinct from '2026-10-11'
     or (v_e->>'weeks')::int is distinct from 8 or (v_e->>'perWeek')::int is distinct from 3
     or (v_e->>'perDay')::int is distinct from 3 then
    raise exception '규칙이 예상(10/11 · 8주 · 주 3일 · 하루 3번)과 다르다 — 먼저 사람이 본다: %', v_e;
  end if;
  if v_status = 'open' and (v_needs->'auto') is distinct from 'true'::jsonb then
    raise exception '열린 회차인데 자동 대상(needs.auto)이 아니다 — 먼저 사람이 본다: %', v_needs;
  end if;
  if (((v_e->>'need')::int, (v_e->>'minNeed')::int) in ((5, 5), (4, 4))) is not true then
    raise exception 'need·minNeed 가 예상(5·5 또는 4·4)과 다르다 — need %, minNeed % · 먼저 사람이 본다', v_e->>'need', v_e->>'minNeed';
  end if;
  if v_intro is null then
    raise exception '도장판 안내(copy.intro)가 없다 — 먼저 사람이 본다';
  end if;

  v_new := replace(replace(v_intro, v_old3, v_new3), v_old4, v_new4);
  -- 바꾼 뒤 확인 — 옛 글자를 못 찾아 그대로면 숫자만 4 가 되고 안내는 「다섯 주」로 남는다
  if position(v_new3 in v_new) = 0 or position(v_new4 in v_new) = 0
     or position('다섯 주' in v_new) > 0 or position(v_old4 in v_new) > 0 then
    raise exception '도장판 안내가 예상한 글자가 아니다(옛 두 줄을 못 찾았다) — 먼저 사람이 본다: %', v_intro;
  end if;

  update public.events
     set needs = jsonb_set(jsonb_set(needs,
                   '{eligibility,need}',    to_jsonb(v_need)),
                   '{eligibility,minNeed}', to_jsonb(v_min)),
         copy  = jsonb_set(copy, '{intro}', to_jsonb(v_new)),
         updated_at = now()
   where id = 'autumn-2026'
     and (needs->'eligibility'->>'need'    is distinct from v_need::text
          or needs->'eligibility'->>'minNeed' is distinct from v_min::text
          or copy->>'intro' is distinct from v_new);
  get diagnostics v_n = row_count;
  raise notice 'autumn-2026 — 바뀐 줄 %(0 이면 이미 여덟 주 가운데 네 주)', v_n;
end $$;

-- 확인 — need·minNeed 4 · intro 셋째·넷째 줄이 「네 주」 · 나머지(start·weeks·perWeek·perDay·auto) 그대로
select id, status, needs->'auto' as auto, needs->'eligibility' as eligibility, copy->>'intro' as intro
  from public.events where id = 'autumn-2026';
