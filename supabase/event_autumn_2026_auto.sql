-- 가을 말씀암송 동행 — 신청 없이 「자동 대상」(needs.auto = true) 표시 넣기
-- ⚠️ 이 저장소는 공개(public)입니다 — 비밀번호·키를 절대 넣지 마세요.
-- 설계: docs/superpowers/specs/2026-10-03-autumn-event-launch-design.md §9(9-1 표시 · 9-6 시험 회차 · 9-7 배포 순서)
--
-- 무엇: autumn-2026 · autumn-2026-test 두 회차의 needs 에 "auto": true 를 **jsonb 병합(||)으로** 더한다.
--   다른 키(eligibility·testOnly 등)는 그대로 남는다. 이미 true 면 아무것도 안 바꾼다(여러 번 돌려도 같다).
--   이 표시가 있으면 api 가 신청을 받지 않고(evtOpenFor false · eventSignup/eventDrop 은 성도님 호출에 auto-event)
--   공개 명단을 비우며(eventRosterPublic), 앱 화면(js/events.js evtAuto)은 신청 단추·「이렇게 등록됩니다」·명단 대신
--   도장판 끝에 「선물 대상이에요 ✓」를 쓴다. 표시가 없는 회차는 예전과 똑같이 돈다.
--
-- ⚠️ 순서: **api → 프런트(bump·push) → 이 파일**(설계 §9-7).
--    이 표시를 새 화면보다 먼저 넣으면 옛 js/events.js 를 쓰는 기기가 「11월 3일부터 신청을 받아요」나
--    빈 명단(「참여자 0명 · 명단에서 못 찾았어요」)을 그린다. 새 api 가 먼저 나가 있어야 표시가 뜻을 갖는다.
-- ⚠️ 안내 문구(copy.intro)·부제(subtitle)는 이 파일에서 **건드리지 않는다**(따로 고친다 — 계획 Task 16).
-- ⚠️ 교회 어드민 회차 설정은 needs 를 받지 않는다(EV_EDIT_KEYS) — 어드민에서 저장해도 이 표시는 안 지워진다.
--    SQL 로만 넣고 뺀다. 빼려면: update public.events set needs = needs - 'auto' where id = '…';
--
-- 가드(하나라도 걸리면 아무것도 바꾸지 않고 멈춘다 — do 블록 하나라 한꺼번에 되돌려진다):
--   ① 두 행이 모두 있어야 한다 — 2026-10-17 에 시험 회차를 지운 뒤에는 여기서 멈춘다(그때는 시험 회차 줄을 빼고 돌린다).
--   ② autumn-2026 은 draft 여야 한다 — 연 뒤(10/18~)에 규칙을 바꾸지 않는다.
--   ③ 두 회차 모두 신청이 0건이어야 한다 — 이미 낸 신청이 있으면 그 줄이 그대로 「대상」이 되므로(화면은 내 줄이
--      있으면 대상으로 본다) 사람이 먼저 보고 정한다.
-- 적용: 개발(ktpwthwqzgcqcrmsafdo) 먼저 → 확인(bash tests/event-smoke.sh 6-3) → 운영(xnomlgydifiqiybervtf).

do $$
declare
  v_status   text;
  v_test     int;
  v_signups  int;
begin
  select status into v_status from public.events where id = 'autumn-2026';
  if v_status is null then
    raise exception 'autumn-2026 행이 없다 — 이 DB 에 회차가 들어가 있는지 먼저 보라';
  end if;
  select count(*) into v_test from public.events where id = 'autumn-2026-test';
  if v_test = 0 then
    raise exception 'autumn-2026-test 행이 없다 — 시험 회차를 지운 뒤(10/17~)라면 이 파일에서 시험 회차를 빼고 돌린다';
  end if;
  if v_status <> 'draft' then
    raise exception 'autumn-2026 이 이미 %이다 — 연 뒤에는 신청 방식을 바꾸지 않는다', v_status;
  end if;
  -- 신청 0건 가드는 **진짜 회차만** 본다(검토 2026-10-03) — 시험 회차는 10/4 00:00 부터 시험 참여자 신청이 열려,
  --   한 건만 생겨도 진짜 회차까지 깃발을 못 받는다. 시험 회차의 신청 줄은 「이미 대상(need 1)」이라는 뜻일 뿐이다.
  select count(*) into v_signups from public.event_signups
   where event_id = 'autumn-2026';
  if v_signups > 0 then
    raise exception 'autumn-2026 에 신청이 %건 있다 — 자동 대상으로 바꾸면 그 줄이 그대로 「대상」이 된다. 먼저 보고 정한다', v_signups;
  end if;

  update public.events
     set needs = coalesce(needs, '{}'::jsonb) || jsonb_build_object('auto', true),
         updated_at = now()
   where id in ('autumn-2026', 'autumn-2026-test')
     and (needs->'auto') is distinct from 'true'::jsonb;
end $$;

-- 확인 — 두 줄 모두 auto = true 이고 eligibility(·testOnly)가 그대로인지, 신청이 0건인지
select e.id, e.status, e.needs->'auto' as auto, e.needs->'testOnly' as test_only,
       e.needs->'eligibility' as eligibility,
       (select count(*) from public.event_signups s where s.event_id = e.id) as signups
  from public.events e
 where e.id in ('autumn-2026', 'autumn-2026-test')
 order by e.id;
