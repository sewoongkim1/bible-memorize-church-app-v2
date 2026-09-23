-- 쉴만한 물가(시편·잠언·전도서 180편) — 닿는 범위와 전환율 (2026-09-23)
--   읽기 전용. SQL Editor 에서 필요한 질의만 골라 돌린다.
--
-- ■ 왜 이 파일이 늦었나
--   CLAUDE.md 의 남은 과제에 「2주 뒤 전환율(supabase/psalm_metrics.sql)」 이 적혀 있었는데
--   **그 파일이 저장소에 없었다.** 없는 파일을 과제로 남겨 두면 그 과제는 계속 미뤄진다.
--   그래서 feature_log(열람 기록) 배포를 계기로 이번에 실제로 만든다.
--
-- ⚠️ 기준일은 **개시일(2026-09-12)이 아니라 열람 기록(feature_log)을 배포한 날**이다.
--    그 전의 열람은 아무 데도 안 남아 영영 없다 — 여기서 보이는 것은 배포 뒤부터다.
--    지금(2026-09-23) 보이는 시편 암송 기록 248회·14명은 challenge_log 의 「암송」 이지
--    「열람」이 아니다 — 이 파일이 배포돼도 **앞으로의 열람만** 잴 수 있다.
--    전환율(②)을 뜻있게 보는 시점은 **feature_log 를 심어 배포한 날 + 2주**다.
--    (CLAUDE.md 의 「2주 뒤」도 이 기준으로 다시 읽는다.)
--
-- ⚠️ 시편 구절 번호 = 1000 + day_no (js/psalm.js 의 PSALM_NO_BASE = 1000).
--    verses.track = 'psalm' 인 행들이다.

-- ① 닿는 범위 — 액자를 몇 명이 보나
select count(distinct user_id) as 액자를_본_사람,
       count(distinct item)    as 펼쳐진_편수,
       sum(cnt)                as 총_펼친_횟수,
       min(day) as 처음, max(day) as 마지막
from public.feature_log where feature = 'psalm';

-- ② 전환율 — 액자를 본 분 중 몇 %가 암송까지 갔나  ★ 이 파일의 핵심
--    ⚠️ 여기서는 daily_activity(집계표)가 아니라 challenge_log 를 그대로 읽는다.
--       이 저장소에는 「순위·mydays 는 집계표 daily_activity 를 읽는다」는 규칙이 있지만
--       (2,903ms → 516ms 때문에 만든 것), 그 집계표에는 verse_no 가 없어 「시편 구절인지」를
--       가릴 수가 없다 — 여긴 순위가 아니라 시편만 골라 세는 질의라 challenge_log 가 맞다.
--       (다음에 볼 사람이 「규칙 위반」으로 오해해 daily_activity 로 고치지 않도록 적어 둔다.)
--    ⚠️ **memo 는 로그를 심은 날로 바닥을 깐다(2026-09-23 리뷰 지적으로 고침).** seen(feature_log)
--       은 이 열람 기록을 배포한 날부터만 쌓이는데, memo(challenge_log)는 처음부터 다 있다 —
--       시편은 2026-09-12 개시라, 이 로그가 생기기 전에 이미 14명·248회가 challenge_log 에
--       들어가 있었다. 바닥을 안 깔면 「9/15 에 외운 분이 9/25 에야 액자를 처음 폈다」도
--       "액자 → 암송" 전환으로 잡혀 인과가 거꾸로 되고, 전환율이 실제보다 부풀려진다.
--       min(day) 로 바닥을 깔면 **양쪽을 다 볼 수 있는 기간(로그를 심은 뒤)만** 놓고 재는
--       것이 된다 — 그 전의 진짜 전환(액자 없이 외운 분)은 이 표로는 영영 못 잰다는 뜻이다.
--    ⚠️ feature_log 에 psalm 행이 아직 하나도 없으면 min(day) 가 null 이 되어 `created_at >= null`
--       은 전부 거짓이라 memo 가 통째로 빈다 — 틀린 값이 아니라 「아직 비교할 대상이 없다」는
--       뜻이다. 이때 전환율_퍼센트 도 0 이 아니라 분모(액자를_본_사람) 가 0 이라 null 로 뜬다.
with seen as (select distinct user_id from public.feature_log where feature = 'psalm'),
     memo as (select distinct user_id from public.challenge_log where verse_no > 1000
               and created_at >= (select min(day) from public.feature_log where feature = 'psalm'))
select (select count(*) from seen)                                as 액자를_본_사람,
       (select count(*) from memo)                                as 암송까지_간_사람,
       (select count(*) from seen s join memo m using (user_id))   as 둘_다,
       round(100.0 * (select count(*) from seen s join memo m using (user_id))
                   / nullif((select count(*) from seen), 0), 1)   as 전환율_퍼센트;

-- ③ 이어 보시나 — 사람별 본 날수 분포
select 본_날수, count(*) as 사람수 from (
  select user_id, count(distinct day) as 본_날수
  from public.feature_log where feature = 'psalm' group by user_id
) t group by 본_날수 order by 본_날수;

-- ④ 어느 편이 읽히나 (제목까지)
select f.item as 구절번호, v.day_no as 일차, v.ref_full as 본문,
       count(distinct f.user_id) as 사람, sum(f.cnt) as 횟수
from public.feature_log f
left join public.verses v on v.no = f.item
where f.feature = 'psalm'
group by f.item, v.day_no, v.ref_full
order by 사람 desc, 횟수 desc
limit 30;

-- ⑤ 매일 묵상 창의 시편 배너를 거쳐 오시나 — 묵상을 본 분 중 액자도 본 분
--    ⚠️ meditation·meditation-auto 에는 관리자 미리보기가 섞인다(feature_log.sql ③ 참고).
--       관리자가 몇 명뿐이라 이 겹침_퍼센트 를 크게 왜곡하진 않지만, 아주 작은 표본에서는
--       그 몇 건이 비율을 눈에 띄게 흔들 수 있다는 점을 감안해서 읽는다.
with med as (select distinct user_id from public.feature_log where feature like 'meditation%'),
     ps  as (select distinct user_id from public.feature_log where feature = 'psalm')
select (select count(*) from med)                                 as 묵상을_본_사람,
       (select count(*) from med m join ps p using (user_id))      as 액자도_본_사람,
       round(100.0 * (select count(*) from med m join ps p using (user_id))
                   / nullif((select count(*) from med), 0), 1)    as 겹침_퍼센트;
