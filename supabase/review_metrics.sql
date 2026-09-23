-- ============================================================
-- 복습 측정 — 다시 잴 때 **이 파일을 그대로** 쓴다 (2026-09-23)
--   Supabase SQL Editor 에 붙여넣고 RUN. 읽기만 한다.
--   ⚠️ 조건이 한 글자만 달라도 기준선과 견줄 수 없다. 손으로 다시 쓰지 말 것.
--
-- ■ 무엇을 「복습」으로 세나
--     복습  review-typing · review-voice · review-typing-card
--     암송  learn-*        /  도전  그 밖(typing · typing-card · voice)
--
-- ■ 기준선 (2026-09-23 — 카드 모드·3구절 묶음 **직전**)
--     ① 복습 총 반복 755회 (전체 123,776회의 0.6%)
--        review-typing 754 · review-voice 1 · review-typing-card 0
--     ② 복습한 사람 42명 (활동자 225명의 18.7%) · 최근 7일 18명
--     ③ 한 번도 복습 안 한 사람 122명 / 174명 (70.1%)
--     ④ 밀린 건 2,383건 (대상 171명 · 중위 6건 · 평균 13.9건 · 최대 43건)
--     ⑤ 복습한 날 그날 복습 구절 중위 3 · 평균 4.7 · 최대 28
--
-- ⚠️ ④는 서버 reviews 표 기준이라 **앱 화면에 뜨는 수와 다르다** — 앱은 시편 예약과
--    verses 에 없는 no 를 걸러 낸다(app.js dueReviewNos). 같은 것으로 놓지 말 것.
-- ============================================================

-- ① 모드별 반복 (카드가 실제로 쓰이나)
select mode, count(*) as 반복, count(distinct user_id) as 사람
  from challenge_log
 where mode like 'review%'
 group by mode order by 반복 desc;

-- ② 복습한 사람 수 (누적 · 최근 7일)
select '누적 복습한 사람' as k, count(distinct user_id)::text as v
  from challenge_log where mode like 'review%'
union all
select '최근 7일', count(distinct user_id)::text
  from challenge_log where mode like 'review%' and created_at >= now() - interval '7 days'
order by 1;

-- ③ 한 번도 복습 안 한 사람 (복습 대상 가운데)
with tgt as (select distinct user_id from reviews),
     did as (select distinct user_id from challenge_log where mode like 'review%')
select count(*) as 복습대상,
       count(*) filter (where t.user_id not in (select user_id from did)) as 한번도안함
  from tgt t;

-- ④ 밀린 정도 (사람별)
with od as (
  select user_id, count(*) n from reviews
   where due_at <= (now() at time zone 'Asia/Seoul')::date
   group by 1
)
select count(*) as 밀린사람, sum(n) as 밀린건수,
       (percentile_cont(0.5) within group (order by n))::int as 중위,
       round(avg(n),1) as 평균, max(n) as 최대
  from od;

-- ⑤ 복습한 날, 그날 몇 구절을 했나 (묶음 크기가 맞는지 보는 잣대)
with d as (
  select user_id, (created_at at time zone 'Asia/Seoul')::date as dt,
         count(distinct verse_no) as v
    from challenge_log where mode like 'review%'
   group by 1,2
)
select (percentile_cont(0.5) within group (order by v))::int as 중위,
       round(avg(v),1) as 평균, max(v) as 최대, count(*) as "사람x날"
  from d;

-- ⑥ 카드 비중 (복습 안에서)
select round(100.0 * count(*) filter (where mode = 'review-typing-card') / nullif(count(*),0), 1) as 카드비중_퍼센트,
       count(*) as 복습총반복
  from challenge_log where mode like 'review%';
