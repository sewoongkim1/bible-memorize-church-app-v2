-- 가을 말씀암송 동행 — 기준선과 효과 측정
-- ⚠️ 이 저장소는 공개(public)입니다 — 비밀번호·키를 절대 넣지 마세요.
--
-- 쓰는 법: ② 의 `date '…'` 한 곳만 바꿔 가며 같은 질의를 돌린다.
--          다시 잴 때도 **이 파일을 그대로** 쓴다 — 질의를 새로 짜면 숫자가 조용히 갈린다.
-- 설계:   docs/superpowers/specs/2026-09-23-autumn-streak-event-design.md §9
--
-- ⚠️ 창의 시작일은 **반드시 주일**이다. Postgres date_trunc('week') 는 월요일 시작이라
--    쓰지 않는다 — 여기서는 floor((day - 시작일)/7) 로만 주를 가른다(서버와 같은 잣대).
--    2026-09-23 에 이 파일 초안이 8/31·7/6(둘 다 월요일)로 적혀 있던 것을 잡았다.
-- ⚠️ mode 를 세지 않는다 — 모드 구분 없이 더한 **하루 합(cnt) 이 per_day 이상이면 한 칸**이다
--    (2026-10-03 부터. 그전엔 「행이 있으면 한 칸」 이었다 — 아래 ②의 p.per_day 가 그 문턱이다).
--
-- ⚠️ **어느 DB 를 읽고 있는지 먼저 본다.** 저장소의 supabase/.temp 는 세션마다 바뀐다.
--    `select count(*) from users` 가 사백이 넘으면 운영, 스물 남짓이면 개발이다.
--    운영을 읽으려면 스크래치 폴더를 따로 링크한다:
--      supabase --workdir <스크래치> link --project-ref xnomlgydifiqiybervtf --yes
--      supabase --workdir <스크래치> db query --linked -f <이 파일의 절대경로>
--    (-f 의 경로는 workdir 기준으로 풀리니 상대경로로 주면 못 찾는다)

-- ① 창 ─────────────────────────────────────────────────────────
--   B 평시 6주   2026-07-05(주일) ~ 2026-08-15(토)   이벤트 전. **이것이 진짜 기준선이다.**
--   C 이벤트 중  2026-08-09(주일) ~ 2026-09-19(토)   「말씀암송이 답이다!」 한복판
--   A 직전 6주   2026-09-06(주일) ~ 2026-10-17(토)   ⚠️ **2026-10-18 에나 끝난다.** 개시 아침(공지 전)에 돌린다
--   D 본 회차    2026-10-18(주일) ~ 2026-12-05(토)   끝난 뒤에 돌린다 — ⚠️ 7주(2026-10-04 7주 중 5주) · ② 의 weeks 를 7 로

-- ② 문턱별 인원 ────────────────────────────────────────────────
--    ⚠️ per_day 는 숫자를 박지 않고 **autumn-2026 행에서 읽는다**(needs.eligibility.perDay · 없으면 1)
--       — 10/14 까지 3 ↔ 5 가 바뀌어도 이 파일은 저절로 따라간다(검토 2026-10-03). v2_event_weeks 와 같은 잣대다.
--    ⚠️ 결과에 per_day 를 함께 내보낸다 — 아래 결과란에 적을 때 그 값도 같이 적는다(견줄 때 같은 per_day 끼리).
with p as (
  select date '2026-07-05' as s, 6 as weeks, 3 as per_week,
         coalesce((select (e.needs->'eligibility'->>'perDay')::int from events e where e.id = 'autumn-2026'), 1) as per_day
),
d as (
  -- 하루 한 줄로 모으되 그날 합을 n 에 남긴다(모드 구분 없이 sum).
  select da.user_id, da.day, ((da.day - p.s) / 7) as wk, sum(da.cnt) as n
    from daily_activity da, p
   where da.day >= p.s and da.day < p.s + (p.weeks * 7)
   group by da.user_id, da.day, p.s
),
-- ⚠️ HAVING 으로 거르지 않는다 — filter 는 그 주의 날 수(days)만 줄이고, 문턱 미달인
--    분도 「활동한 분」 쪽(아래 q)엔 그대로 남아야 한다.
w as (select d.user_id, d.wk, count(*) filter (where d.n >= p.per_day) as days from d, p group by d.user_id, d.wk),
-- ⚠️ 문턱은 ① 의 p.per_week 하나만 고치면 된다 — 여기에 숫자를 박지 않는다.
q as (select w.user_id, count(*) filter (where w.days >= p.per_week) as okw from w, p group by 1)
select (select per_day from p)           as per_day,
       count(*)                          as "활동한 분",
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

-- ⑤ 종료 후 4주 지속 (1월 초에) — ② 를 s = '2026-12-06'(측정이 끝난 다음 주일) · p.weeks = 4 로 다시 돌린다.
--    (11-22 는 측정의 마지막 주라 「끝난 뒤」가 아니다 · 2026-10-03 바로잡음)

-- ─────────────────────────────────────────────────────────────
-- 결과란 — 돌린 날과 값을 여기에 적는다. 적지 않으면 다시 잴 때 견줄 것이 없다.
--
-- 2026-09-23 · 운영(xnomlgydifiqiybervtf) · 공지 전 · (per_day 1 — 이 숫자를 잴 때는 문턱이 없었다)
--   B 평시   2026-07-05~08-15   활동  66 · 1주 16 · 2주 13 · 3주 12 · 4주 10 · 6주 4
--   C 중간   2026-08-09~09-19   활동 185 · 1주 83 · 2주 58 · 3주 40 · 4주 16 · 6주 6
--   A 직전   2026-08-30~(9/23까지, 6주 미완)  활동 156 · 1주 74 · 2주 52 · 3주 35 · 4주 22
--
--   읽는 법: **평시에 문턱을 넘는 분은 12명**이다. 이벤트가 도는 동안 40명이 됐고
--            활동자 자체가 66 → 185명으로 세 배가 됐다. 그러니 이번 회차의 기대치는
--            12명이 아니라 그 사이 어딘가다. 끝난 뒤 D 창으로 견준다.
--   ⚠️ 위 B·C(12명·40명)는 **per_day 1**(하루 한 번이라도)로 잰 숫자다. 지금 ② 는 per_day 를
--            가을 회차 값(3 또는 5)으로 읽어 더 적게 나온다 — D 와 견줄 때는 B·C 를 같은 per_day 로
--            다시 재서 쓴다(그 줄에 per_day 를 함께 적는다).
--
-- 2026-10-10 · 운영(xnomlgydifiqiybervtf) · 10/11 개시 전(공지 전) · per_day 3
--   B 평시   2026-07-05~08-15   활동 66 · 1주 15 · 2주 13 · 3주(옛 문턱) 10 · 4주 10 · 6주모두 3
--   읽는 법: per_day 3 로 다시 잰 평시 기준선. 끝난 뒤 D 창을 **같은 per_day 3** 으로 견준다.
--   ⚠️ A 직전(9/6~10/17)은 10/11 개시와 겹쳐 「직전」으로 못 쓴다 — B 를 기준선으로 쓴다.
--      (개시가 10/18→10/11 로 당겨졌다 · 2026-10-10 친구)
--
-- (A 2026-09-06~10-17 완성본) 돌린 날:            per_day:    결과:
-- (D 2026-10-18~12-05 · 7주 → 8주 10/11~12/05) 돌린 날:            per_day:    결과:
-- 공지 나간 날: 2026-10-11(개시) · 주보 공지는 나중(친구)
