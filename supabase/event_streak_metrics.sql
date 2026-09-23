-- 가을 말씀 동행 — 기준선과 효과 측정
-- ⚠️ 이 저장소는 공개(public)입니다 — 비밀번호·키를 절대 넣지 마세요.
--
-- 쓰는 법: ② 의 `date '…'` 한 곳만 바꿔 가며 같은 질의를 돌린다.
--          다시 잴 때도 **이 파일을 그대로** 쓴다 — 질의를 새로 짜면 숫자가 조용히 갈린다.
-- 설계:   docs/superpowers/specs/2026-09-23-autumn-streak-event-design.md §9
--
-- ⚠️ 창의 시작일은 **반드시 주일**이다. Postgres date_trunc('week') 는 월요일 시작이라
--    쓰지 않는다 — 여기서는 floor((day - 시작일)/7) 로만 주를 가른다(서버와 같은 잣대).
--    2026-09-23 에 이 파일 초안이 8/31·7/6(둘 다 월요일)로 적혀 있던 것을 잡았다.
-- ⚠️ mode 를 세지 않는다. 그날 daily_activity 에 행이 있으면 한 칸이다.
--
-- ⚠️ **어느 DB 를 읽고 있는지 먼저 본다.** 저장소의 supabase/.temp 는 세션마다 바뀐다.
--    `select count(*) from users` 가 사백이 넘으면 운영, 스물 남짓이면 개발이다.
--    운영을 읽으려면 스크래치 폴더를 따로 링크한다:
--      supabase --workdir <스크래치> link --project-ref xnomlgydifiqiybervtf --yes
--      supabase --workdir <스크래치> db query --linked -f supabase/event_streak_metrics.sql

-- ① 창 ─────────────────────────────────────────────────────────
--   B 평시 6주   2026-07-05(주일) ~ 2026-08-15(토)   이벤트 전. **이것이 진짜 기준선이다.**
--   C 이벤트 중  2026-08-09(주일) ~ 2026-09-19(토)   「말씀암송이 답이다!」 한복판
--   A 직전 6주   2026-08-30(주일) ~ 2026-10-10(토)   ⚠️ **2026-10-11 에나 끝난다.** 그날 돌린다
--   D 본 회차    2026-10-11(주일) ~ 2026-11-21(토)   끝난 뒤에 돌린다

-- ② 문턱별 인원 ────────────────────────────────────────────────
with p as (select date '2026-07-05' as s, 6 as weeks, 3 as per_week),
d as (
  select da.user_id, da.day, ((da.day - p.s) / 7) as wk
    from daily_activity da, p
   where da.day >= p.s and da.day < p.s + (p.weeks * 7)
   group by da.user_id, da.day, p.s
),
w as (select user_id, wk, count(*) as days from d group by 1, 2),
q as (select user_id, count(*) filter (where days >= 3) as okw from w group by 1)
select count(*)                          as "활동한 분",
       count(*) filter (where okw >= 1)  as "1주 이상",
       count(*) filter (where okw >= 2)  as "2주 이상",
       count(*) filter (where okw >= 3)  as "3주 이상 ← 문턱",
       count(*) filter (where okw >= 4)  as "4주 이상",
       count(*) filter (where okw >= 6)  as "6주 모두"
  from q;

-- ③ 집계표가 로그와 어긋나지 않는지 (이 숫자가 흔들리면 위 값도 흔들린다)
-- select * from v2_activity_drift();
-- select count(*) as log_rows from challenge_log;

-- ④ 신청 대비 자격 (이벤트가 끝난 뒤)
-- select count(*) as 신청 from event_signups where event_id = 'autumn-2026';

-- ⑤ 종료 후 4주 지속 (12월에) — ② 를 s = '2026-11-22' 로 다시 돌린다.

-- ─────────────────────────────────────────────────────────────
-- 결과란 — 돌린 날과 값을 여기에 적는다. 적지 않으면 다시 잴 때 견줄 것이 없다.
--
-- 2026-09-23 · 운영(xnomlgydifiqiybervtf) · 공지 전
--   B 평시   2026-07-05~08-15   활동  66 · 1주 16 · 2주 13 · 3주 12 · 4주 10 · 6주 4
--   C 중간   2026-08-09~09-19   활동 185 · 1주 83 · 2주 58 · 3주 40 · 4주 16 · 6주 6
--   A 직전   2026-08-30~(9/23까지, 6주 미완)  활동 156 · 1주 74 · 2주 52 · 3주 35 · 4주 22
--
--   읽는 법: **평시에 문턱을 넘는 분은 12명**이다. 이벤트가 도는 동안 40명이 됐고
--            활동자 자체가 66 → 185명으로 세 배가 됐다. 그러니 이번 회차의 기대치는
--            12명이 아니라 그 사이 어딘가다. 끝난 뒤 D 창으로 견준다.
--
-- (A 2026-08-30~10-10 완성본) 돌린 날:            결과:
-- (D 2026-10-11~11-21)        돌린 날:            결과:
-- 공지 나간 날:
