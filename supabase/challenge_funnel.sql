-- ============================================================
-- 도전 전환율 — 암송까지 오신 분 가운데 「🔥 말씀 도전」까지 가신 분의 비율
--   Supabase SQL Editor 에 그대로 붙여 넣고 돌린다(읽기만 한다 · 아무것도 바꾸지 않는다).
--
-- ⚠️ **다시 잴 때는 반드시 이 파일을 그대로 쓴다.**
--    조건이 한 글자만 달라도 기준선과 견줄 수 없다. 손으로 다시 쓰지 말 것.
--    (2026-08-25 에 「33명 중 8명(24%)」을 쟀는데 그때 쓴 질의가 남아 있지 않아
--     같은 잣대인지 확인할 길이 없었다. 그래서 이 파일을 만든다.)
--
-- ■ 무엇을 「도전」으로 세나 — challenge_log.mode 로 가른다
--     암송  learn-typing · learn-voice · learn-typing-card   (배우는 화면)
--     복습  review-typing · review-voice                     (간격 반복)
--     도전  typing · voice · typing-card                     ← 이것만 센다
--   ⚠️ `mode like '%typing%'` 으로 세면 learn-typing 까지 딸려 들어와
--      전환율이 100% 가까이 나온다. 앞머리로 갈라야 한다.
--   ⚠️ 새 mode 를 더하면(migrate_modes_card.sql 처럼) 여기 정의도 함께 본다.
--      「learn 도 review 도 아니면 도전」으로 적어 두어 새 값이 도전 쪽에 붙게 했다.
--
-- ■ 언제 쟀나 (여기에 결과를 적어 둔다)
--   2026-09-02  첫 화면 개편(v3.260, 오늘 할 일 하나 크게) 직후의 기준선
--               → ②번 「주별」이 개편 앞뒤를 가르는 자리다.
-- ============================================================

-- ── ① 누적 — 지금까지 한 번이라도 활동하신 분 전부 ──────────────
with per_user as (
  select user_id,
         bool_or(mode not like 'learn%' and mode not like 'review%') as did_challenge
  from public.challenge_log
  group by user_id
)
select '① 누적'                                                      as 구분,
       count(*)                                                      as 참여자,
       count(*) filter (where did_challenge)                         as 도전경험,
       round(100.0 * count(*) filter (where did_challenge)
             / nullif(count(*), 0), 1)                               as "전환율(%)"
from per_user;


-- ── ② 주별 — 그 주에 활동한 분 중, 그 주에 도전까지 간 분 ────────
--    개편(2026-09-02) 앞뒤가 여기서 갈린다. 주는 KST 월요일 시작.
--    ⚠️ 한 주가 다 차기 전에는 그 주 숫자를 앞 주와 나란히 놓지 말 것 —
--       주중에는 아직 도전까지 못 간 분이 많아 늘 낮게 나온다.
select to_char(date_trunc('week', created_at at time zone 'Asia/Seoul'), 'MM-DD') as 주시작,
       count(distinct user_id)                                                     as 활동자,
       count(distinct user_id) filter
         (where mode not like 'learn%' and mode not like 'review%')                as 도전자,
       round(100.0 * count(distinct user_id) filter
               (where mode not like 'learn%' and mode not like 'review%')
             / nullif(count(distinct user_id), 0), 1)                              as "전환율(%)"
from public.challenge_log
group by 1
order by 1 desc
limit 10;


-- ── ③ 오늘 ────────────────────────────────────────────────────
select '③ 오늘'                                                      as 구분,
       count(distinct user_id)                                       as 활동자,
       count(distinct user_id) filter
         (where mode not like 'learn%' and mode not like 'review%')  as 도전자,
       round(100.0 * count(distinct user_id) filter
               (where mode not like 'learn%' and mode not like 'review%')
             / nullif(count(distinct user_id), 0), 1)                as "전환율(%)"
from public.challenge_log
where (created_at at time zone 'Asia/Seoul')::date
      = (now() at time zone 'Asia/Seoul')::date;


-- ── ④ 새로 오신 분 코호트 — 개편의 효과를 가장 깨끗하게 본다 ─────
--    「처음 활동한 날」로 사람을 묶고, 그분들이 **처음 이레 안에** 도전까지
--    갔는지를 본다. 오래 쓰신 분은 언젠가는 도전을 하게 되므로 누적(①)만
--    보면 개편 효과가 묻힌다. 이 표는 「새로 오신 분이 도전까지 가는가」만 본다.
--    ⚠️ 개편 뒤 이레가 지나야 뜻이 생긴다 — 2026-09-09 이후에 볼 것.
with first_day as (
  select user_id,
         min(created_at) as first_at,
         (min(created_at) at time zone 'Asia/Seoul')::date as first_date
  from public.challenge_log
  group by user_id
),
within7 as (
  select f.user_id, f.first_date,
         bool_or(c.mode not like 'learn%' and c.mode not like 'review%') as did_challenge
  from first_day f
  join public.challenge_log c
    on c.user_id = f.user_id
   and c.created_at < f.first_at + interval '7 days'
  group by f.user_id, f.first_date
)
select case when first_date >= date '2026-09-02' then '개편 뒤' else '개편 전' end as 시기,
       count(*)                                                                    as 새참여자,
       count(*) filter (where did_challenge)                                       as "7일내 도전",
       round(100.0 * count(*) filter (where did_challenge)
             / nullif(count(*), 0), 1)                                             as "전환율(%)"
from within7
group by 1
order by 1;


-- ── ⑤ mode 별 원자료 — 위 숫자가 이상하면 여기부터 본다 ──────────
select mode, count(*) as 횟수, count(distinct user_id) as 사람
from public.challenge_log
group by mode
order by 횟수 desc;
