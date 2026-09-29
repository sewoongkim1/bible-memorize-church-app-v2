-- ============================================================
-- 첫날 측정 — 다시 잴 때 **이 파일을 그대로** 쓴다 (2026-09-24)
--   Supabase SQL Editor 에 붙여넣고 RUN. 읽기만 한다.
--   ⚠️ 조건이 한 글자만 달라도 기준선과 견줄 수 없다. 손으로 다시 쓰지 말 것.
--   설계 docs/superpowers/specs/2026-09-23-first-day-next-verse-design.md ⑦
--
-- ■ 무엇을 바꿨나 (v3.489, 2026-09-24)
--     3단계 완료 창의 주 단추가 「↺ 처음 말씀으로」(번호 1번) → **안 외운 것 중 가장 최근**.
--     첫 구절을 막 마친 분께는 「이어서 한 구절 더 ▶」.
--
-- ■ 정의
--     첫날       = 그 사람의 challenge_log 첫 기록의 KST 날짜
--     첫날 구절  = 첫날 learn-* 기록이 있는 verse_no 개수 (도전·복습은 안 센다)
--     활동일수   = challenge_log 에 기록이 있는 KST 날짜 수
--     ⚠️ progress.updated_at 은 못 쓴다 — 나중 저장에 덮인다(설계 ①).
--
-- ■ 기준선 (2026-09-23 — 변경 직전, 설계 ⑦)
--     하루만 쓴 사람 82명 / 활동자 225명 = 36.4%
--     첫날 만진 구절 — 하루만 1.38 · 2~4일 1.84 · 5일이상 4.73
--     첫날 암송기록   — 하루만 4.3  · 2~4일 5.9  · 5일이상 17.6
--
-- ■ 2주 뒤(2026-10-08 이후) 볼 것 — 아래 since 를 '2026-09-25' 로 두고
--     ① 첫날 만진 구절(전체 평균)이 기준선보다 올랐나
--     ② 하루만 쓰고 떠난 비율이 36.4% 에서 내렸나
--     ⚠️ 신규 유입이 말라 있다(09-14 주 2명 · 09-21 주 0명). 사람이 스무 명도 안 되면 결론 내지 말 것.
--     ⚠️ ②는 **첫날에서 최소 7일이 지난 사람만** 센다(until 참고) — 어제 온 분은 아직 「하루만」이다.
--
-- ■ 확인 이력 (돌릴 때마다 한 줄 더한다)
--     2026-09-24 운영 · since 처음부터 · 하루만 81명(36.2%) 1.40구절 4.3회 · 2~4일 57명 1.84 · 5일이상 86명 4.73 ·
--                전체 224명 2.79구절 — 기준선과 일치(82→81 은 첫날이 7일 안 된 한 분이 빠진 것)
-- ============================================================

with params as (
  select date '2000-01-01' as since,                       -- 기준선: 처음부터 · 변경 뒤: '2026-09-25'
         (now() at time zone 'Asia/Seoul')::date - 7 as until  -- 첫날이 7일 이상 지난 사람만
),
logs as (
  select user_id, verse_no, mode, (created_at at time zone 'Asia/Seoul')::date as d
  from public.challenge_log
),
first_day as (
  select user_id, min(d) as d0, count(distinct d) as days
  from logs group by user_id
),
cohort as (
  select f.* from first_day f, params p
  where f.d0 >= p.since and f.d0 <= p.until
),
day0 as (
  select c.user_id, c.days,
         count(distinct l.verse_no) filter (where l.mode like 'learn%') as verses0,
         count(*)                   filter (where l.mode like 'learn%') as learn0
  from cohort c
  join logs l on l.user_id = c.user_id and l.d = c.d0
  group by c.user_id, c.days
)
select case when days = 1 then '1 하루만'
            when days <= 4 then '2 2~4일'
            else '3 5일이상' end              as 집단,
       count(*)                               as 사람,
       round(avg(verses0), 2)                 as 첫날_구절,
       round(avg(learn0), 1)                  as 첫날_암송기록,
       round(100.0 * count(*) / sum(count(*)) over (), 1) as 비율
from day0
group by 1
union all
select '9 전체', count(*), round(avg(verses0), 2), round(avg(learn0), 1), 100.0
from day0
order by 1;
