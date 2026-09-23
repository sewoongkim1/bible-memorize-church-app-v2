-- 못 재는 기능에 기록을 심는다 — 열람 기록 통합 표 (2026-09-23)
--   Supabase SQL Editor 에서 1회 실행. ⚠️ 개발(ktpwthwqzgcqcrmsafdo) 먼저, 확인 뒤 운영.
--   설계: docs/superpowers/specs/2026-09-23-feature-log-design.md
--
-- ■ 왜 남기나
--   시편 액자·매일 묵상·말씀 앨범·사용 설명서·푸시 열람이 서버에 흔적을 안 남겨
--   「몇 명에게 닿나」를 말할 수가 없었다(2026-09-23 사용 분석 4장).
--   카드 모드가 그랬다 — 도입하고 여덟 달을 측정 못 하다가 28.5%인 걸 뒤늦게 알았다.
--
-- ■ blessing_log 를 일반화한 것이다. 한 사람이 하루에 한 항목을 여러 번 봐도 **한 행**이다.
--   열 때마다 한 행씩 쌓으면 금세 커진다(challenge_log 11,052행 → 집계 579행).
--
-- ■ 날짜는 한국 시간 기준이다. UTC 로 두면 밤에 보신 것이 다음 날로 넘어간다.
--
-- ■ feature 값 일곱 — psalm · meditation · meditation-auto · album · album-play · guide · push
--   ⚠️ **CHECK 제약을 일부러 걸지 않았다.** 걸면 허용 목록이 화면·서버·DB 세 곳이 되어,
--      새 기능을 더할 때 앱은 보내는데 저장만 조용히 막힌다(challenge_log.mode 에서 겪었다).
--      허용 목록은 supabase/functions/api/index.ts 의 FEATURES 한 곳에만 둔다.
--
-- ■ item 의 뜻은 기능마다 다르다
--     psalm                      = 구절 번호 no (= 1000 + day_no)
--     meditation, meditation-auto = 그 주 구절 번호
--     album, album-play, guide, push = 0

create table if not exists public.feature_log (
  user_id uuid not null references public.users(id) on delete cascade,
  day     date not null default ((now() at time zone 'Asia/Seoul')::date),
  feature text not null,
  item    int  not null default 0,      -- 기본키에 null 을 못 넣어 0 을 기본값으로 둔다
  cnt     int  not null default 1,
  primary key (user_id, day, feature, item)
);

-- ⚠️ 표를 만들면 그 자리에서 RLS 를 켠다 — 안 켜면 공개 키로 통째로 읽힌다.
--    2026-08-25 event_entries 가 그걸 빠뜨려 user_id 47건이 새어 나갔다.
--    이 표에도 user_id 가 있어 더더욱 그렇다. Edge Function(service_role)만 읽고 쓴다.
alter table public.feature_log enable row level security;

create index if not exists feature_log_day_idx  on public.feature_log (day);
create index if not exists feature_log_feat_idx on public.feature_log (feature, day);

-- 한 번 여는 것을 한 번 세는 함수. 있으면 cnt 를 올리고 없으면 만든다.
create or replace function public.v2_feature_log(uid uuid, f text, n int)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.feature_log (user_id, feature, item) values (uid, f, coalesce(n, 0))
  on conflict (user_id, day, feature, item) do update set cnt = public.feature_log.cnt + 1;
$$;

revoke all on function public.v2_feature_log(uuid, text, int) from public, anon, authenticated;
grant execute on function public.v2_feature_log(uuid, text, int) to service_role;

-- ─────────────────────────────────────────────────────────────
-- 보는 법 (관리자 SQL Editor 에서, 읽기 전용)
-- ─────────────────────────────────────────────────────────────

-- ① 기능별 한눈에
--    ⚠️ guide 는 일부러 로그인 없이도 열리는 페이지다(guide/) — 여기 나오는 숫자는
--       「설명서를 본 사람 수」가 아니라 「앱에 로그인한 채로 설명서를 누른 사람 수」다.
--       로그인 없이 guide/ 를 바로 연 분(카카오톡 링크 등)은 이 표에 안 잡힌다.
select feature,
       count(distinct user_id) as 사람,
       sum(cnt)                as 횟수,
       min(day) as 처음, max(day) as 마지막
from public.feature_log
group by feature order by 사람 desc;

-- ② 날짜별 추이
select day, feature, count(distinct user_id) as 사람, sum(cnt) as 횟수
from public.feature_log
group by day, feature order by day desc, feature limit 100;

-- ③ 매일 묵상 — 눌러서 연 분 대 저절로 뜬 분
--    이 비율이 「스스로 찾아 읽는 분」의 몫이다. 저절로 뜬 것만 많으면 그 기능은
--    성도님이 고른 것이 아니라 앱이 들이민 것이다.
--    ⚠️ meditation 에는 관리자 미리보기가 섞인다. maybeShowWeeklyMeditation(force=true) 는
--       「성도님이 눌러서 열었다」보다 넓다 — 그 함수 머리 주석대로 force 는 '하루 1회'
--       제한을 무시하고 무조건 표시(미리보기·버튼)하는 것이다. admin.html 의 ?preview=daily
--       (previewDailyMessage())도 같은 경로로 meditation 을 기록한다. 관리자가 몇 명뿐이라
--       양은 적지만, 이 숫자를 「성도님이 스스로 누른 횟수」로 곧이곧대로 읽지 말 것.
select (select count(distinct user_id) from public.feature_log where feature='meditation')      as 눌러서_연_분,
       (select count(distinct user_id) from public.feature_log where feature='meditation-auto') as 저절로_뜬_분,
       round(100.0 * (select count(distinct user_id) from public.feature_log where feature='meditation')
                   / nullif((select count(distinct user_id) from public.feature_log where feature='meditation-auto'), 0), 1)
                                                                                                 as 능동_비율_퍼센트;

-- ④ 말씀 앨범 — 열고도 안 듣는 분
with o as (select distinct user_id from public.feature_log where feature='album'),
     p as (select distinct user_id from public.feature_log where feature='album-play')
select (select count(*) from o)                                   as 화면을_연_분,
       (select count(*) from p)                                   as 듣기까지_간_분,
       round(100.0 * (select count(*) from p) / nullif((select count(*) from o),0), 1) as 전환율_퍼센트;

-- ⑤ 한 번 보고 마셨나, 이어 보시나 — 기능별·사람별 본 날수 분포
select feature, 본_날수, count(*) as 사람수 from (
  select feature, user_id, count(distinct day) as 본_날수
  from public.feature_log group by feature, user_id
) t group by feature, 본_날수 order by feature, 본_날수;

-- ⑥ 누가 얼마나 (⚠️ 관리자만 · 이름이 나오므로 밖으로 내보내지 말 것)
select u.gu, u.mok, u.name, f.feature,
       count(distinct f.day) as 본_날수, sum(f.cnt) as 횟수, max(f.day) as 마지막
from public.feature_log f join public.users u on u.id = f.user_id
group by u.gu, u.mok, u.name, f.feature
order by 횟수 desc limit 50;
