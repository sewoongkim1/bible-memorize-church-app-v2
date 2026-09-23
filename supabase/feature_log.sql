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
-- ■ 이 표는 이 기능 하나만 쓰는 표가 아니다 — **여러 세션·여러 기능이 함께 쓰는 표**다.
--   처음 심은 것은 일곱 값(psalm · meditation · meditation-auto · album · album-play ·
--   guide · push)인데, 배포하고 하루도 안 지나 다른 세션들이 이미 여기 더 쓰고 있었다.
--   2026-09-23 하루 만에 **열한 값**이 됐다 — song · ranking-scope · event(다른 세션들) ·
--   meditation-widget(같은 날 저녁, 위젯 탭을 따로 세려고). **어떤 숫자도 믿지 말 것** —
--   앞으로도 늘어난다. `select distinct feature from public.feature_log` 로 지금 값을 본다.
--   ⚠️ **CHECK 제약을 일부러 걸지 않았다.** 걸면 허용 목록이 화면·서버·DB 세 곳이 되어,
--      새 기능을 더할 때 앱은 보내는데 저장만 조용히 막힌다(challenge_log.mode 에서 겪었다).
--      허용 목록은 supabase/functions/api/index.ts 의 FEATURES 한 곳에만 둔다.
--      ⚠️ 그 FEATURES 도 **표에 들어갈 수 있는 값의 전체 목록이 아니다** — 클라이언트가
--      보낸 값을 거르는 관문일 뿐이다. 서버가 스스로 db.rpc("v2_feature_log", ...) 를
--      직접 부르는 값(예: song)은 이 관문을 거치지 않는다.
--
-- ■ item 의 뜻은 기능마다 다르다 — **표 전체를 관통하는 단일한 뜻은 없다**
--   (2026-09-23 저녁 기준 열한 값. 앞 열은 FEATURES(index.ts)가 거르는 값, song 만 서버 안쪽 호출)
--     psalm                       = 구절 번호 no (= 1000 + day_no · js/psalm.js 150행)
--     meditation                  = 그 주 구절 번호 — 첫 화면 「오늘의 묵상」 단추로 연 것
--     meditation-widget           = 그 주 구절 번호 — 아이폰 위젯(잠금화면)을 눌러 연 것(?w=meditation).
--                                    이것도 능동이지만 **들어온 길이 달라 따로 센다** — 한 이름으로
--                                    뭉치면 위젯(1.1.0 · 2026-09-22 출시)이 실제로 쓰이는지 영영 모른다
--     meditation-auto             = 그 주 구절 번호 — 하루 한 번 저절로 뜬 것
--                                    ⚠️ 관리자 미리보기(?preview=daily)는 이 셋 **어디에도 안 남는다**
--                                       (2026-09-23 배포부터. 성도님 행위가 아니라 오염원이다 — ③ 참고)
--     album, album-play, guide, push = 0
--     event                       = 0 고정 — 이벤트 화면(「가을 말씀 동행」 등)을 연 것.
--                                    js/events.js 의 renderEventList 가 화면을 그리는 자리에서 한 번
--                                    (회차가 여럿이어도 회차 번호는 안 담는다 — 목록 화면 단위로 센다)
--     ranking-scope               = 숫자가 아니라 **깃발**이다 — 1=우리 교구 · 0=전체
--                                    (app.js 의 logFeature("ranking-scope", v==="mine"?1:0))
--     song("오늘의 찬양")           = 0 고정 — index.ts 의 logSongClick 이 FEATURES 를 거치지
--                                    않고 직접 v2_feature_log 를 부른다(서버 안쪽 호출이라
--                                    허용 목록 밖이다. index.ts 861행 근처)
--
-- ⚠️ **feature 값을 늘리거나(FEATURES 에 추가) 서버가 스스로 새 값을 쓰기 시작하면,
--    이 머리 주석도 그 자리에서 함께 고친다.** 안 고치면 이 목록이 다시 낡고, 다음에
--    보는 사람이 여기 없는 값을 「일곱뿐이라던데 왜 더 있지, 데이터가 오염됐나」로
--    오해한다 — 실제로 이번에 그렇게 낡아 있었다.

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

-- ③ 매일 묵상 — 스스로 찾아 연 분 대 저절로 뜬 분
--    ⚠️ 세 값(meditation · meditation-widget · meditation-auto)은 서로 겹친다 — 같은 호출
--       자리에서 어느 길로 들어왔느냐로만 갈려 남을 뿐이라, 한 사람이 셋 다에도, 하나에만도,
--       아예 없을 수도 있다. 그래서 하나를 다른 하나로 나누면 100% 를 넘을 수 있어 「몫」이
--       아니다 — 분모는 셋의 합집합(묵상을 한 번이라도 본 분, 한 사람당 한 번만 셈)이어야 한다.
--    ⚠️ 그래서 분자를 원시 카운트로 두지 않는다. act(스스로 연 분) = meditation ∪
--       meditation-widget 이고 seen(묵상을 본 분) = act ∪ meditation-auto 라, act 는 **집합을
--       짜는 방식 자체로** seen 의 부분집합이다 — 비율이 0~100 을 벗어날 길이 없다.
--       (④ 앨범에서 교집합으로 고친 것과 같은 방법이다.)
--    ⚠️ 관리자 미리보기(?preview=daily · previewDailyMessage)는 **2026-09-23 배포까지는**
--       meditation 에 섞여 있었다. 그날 이후 기록에는 안 섞인다 — 성도님 행위가 아니라
--       숫자를 부풀리는 오염원이라 아예 안 남기게 고쳤다(maybeShowWeeklyMeditation 의
--       source="preview"). 그러니 **2026-09-23 이전 하루치에 한해** meditation 을
--       「성도님이 스스로 누른 횟수」로 곧이곧대로 읽지 말 것. 관리자가 몇 명뿐이라 양은 적다.
--       그 하루를 아예 빼고 보려면 아래 세 CTE 에 `and day > date '2026-09-23'` 을 붙인다.
with m    as (select distinct user_id from public.feature_log where feature = 'meditation'),
     w    as (select distinct user_id from public.feature_log where feature = 'meditation-widget'),
     a    as (select distinct user_id from public.feature_log where feature = 'meditation-auto'),
     act  as (select user_id from m union select user_id from w),      -- 스스로 찾아 연 분
     seen as (select user_id from act union select user_id from a)     -- 묵상을 한 번이라도 본 분
select (select count(*) from seen) as 묵상을_본_분,
       (select count(*) from act)  as 스스로_연_분,
       (select count(*) from m)    as 첫화면_단추,
       (select count(*) from w)    as 위젯,
       (select count(*) from a)    as 저절로_뜬_분,
       round(100.0 * (select count(*) from act) / nullif((select count(*) from seen), 0), 1)
                                   as 능동_비율_퍼센트,
       round(100.0 * (select count(*) from w)   / nullif((select count(*) from seen), 0), 1)
                                   as 위젯_비율_퍼센트;
--    → 능동_비율_퍼센트 = 묵상을_본_분 가운데 스스로 찾아 연 분의 몫.
--    → 위젯_비율_퍼센트 = 그 가운데 잠금화면 위젯으로 들어온 분의 몫 — 「위젯이 실제로 쓰이나」.
--      w 역시 seen 의 부분집합이라(seen 에 act ⊇ w 가 들어 있다) 100% 를 넘지 않는다.
--    ⚠️ 첫화면_단추 + 위젯 은 스스로_연_분 보다 **클 수 있다** — 두 길로 다 들어온 분이
--       양쪽에 한 번씩 세어지기 때문이다. 이 셋을 더하거나 빼서 새 숫자를 만들지 말 것.

-- ④ 말씀 앨범 — 열고도 안 듣는 분
--    ⚠️ album-play 는 앨범 화면(album)뿐 아니라 말씀 목록 화면(renderVerseList 의 '전체 듣기')
--       에서도 남는다 — 그 화면은 album 을 기록하지 않으므로 album-play 에는 album 을 한 번도
--       안 연 분도 섞인다. 그래서 분자를 album-play 원 인원(p)으로 그대로 두고 album(o) 으로
--       나누면 두 독립 집합의 비율이라 전환율이 100% 를 넘을 수 있다 — psalm_metrics.sql ②가
--       쓰는 것과 같은 방법으로, 분자를 **교집합**(화면도 열고 재생도 시작한 분, op)으로 바꿔
--       분모(o)의 부분집합이 되게 한다. album-play 원 인원은 듣기_전체_인원 열로 따로 남겨
--       '전체 듣기' 경로가 안 묻히게 한다 — 그 열과 op(열고_들은_분)의 차이가 화면을 한 번도
--       안 열고(말씀 목록의 '전체 듣기'로만) 들은 분이다.
with o  as (select distinct user_id from public.feature_log where feature='album'),
     p  as (select distinct user_id from public.feature_log where feature='album-play'),
     op as (select user_id from o intersect select user_id from p)
select (select count(*) from o)                                                        as 화면을_연_분,
       (select count(*) from op)                                                       as 열고_들은_분,
       (select count(*) from p)                                                        as 듣기_전체_인원,
       round(100.0 * (select count(*) from op) / nullif((select count(*) from o),0), 1) as 전환율_퍼센트,
       (select count(*) from o) - (select count(*) from op)                            as 열고도_안_듣는_분;

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

-- ⑦ 알림을 켜 둔 분 중 누른 분 — 「켜 둔 분」은 push_subscriptions, 「누른 분」은
--    feature_log(push). ⚠️ 이 둘은 포함관계가 아니라 **깔때기가 아니라 거친 비율**로만
--    읽는다 — 눌러서 열고 나중에 알림을 끈 분(구독은 지금 없는데 옛 클릭 기록은 남음),
--    반대로 지금 구독 중인데 아직 한 번도 안 누른 분이 둘 다 있을 수 있어 「눌러_연_사람」이
--    「켜_둔_사람」의 부분집합이라는 보장이 없다(비율이 100% 를 넘을 수도 있다).
with sub as (select distinct user_id from public.push_subscriptions),
     tap as (select distinct user_id from public.feature_log where feature = 'push')
select (select count(*) from sub)                                       as 켜_둔_사람,
       (select count(*) from tap)                                       as 눌러_연_사람,
       (select count(*) from sub s join tap t using (user_id))          as 지금도_켜져있고_누른_사람,
       round(100.0 * (select count(*) from tap)
                   / nullif((select count(*) from sub), 0), 1)          as 거친_비율_퍼센트;

-- ⑧ 어느 구절 알림이 먹혔나 — day 를 그날의 이번 주 구절에 붙인다
--    ⚠️ feature_log(push) 의 item 은 늘 0 이라(위 item 표) 구절을 직접 안 담고 있다 —
--       day 를 verses.date 와 맞춰 그날 「이번 주」였던 구절을 찾아야 한다.
--       아래 weekly CTE 는 index.ts 의 weeklyVerseKst 와 **같은 규칙**을 SQL 로 옮긴 것이다
--       (그날짜(KST)까지 시작한 track='weekly' 구절 중 가장 늦게 시작한 것을 그날의 구절로
--       본다) — 지어낸 매칭이 아니라 서버가 실제로 쓰는 규칙과 같은 것을 확인하고 옮겼다.
--    ⚠️ is_active 는 보지 않는다 — verses 는 이력표가 아니라 지금 상태만 담아서, 나중에
--       그 구절을 숨겨도(is_active=false) 「그날은 그게 이번 주 구절이었다」는 사실 자체는
--       바뀌지 않는다고 보기 때문이다.
--    ⚠️ 그래도 완전히 못 믿을 구석이 남는다 — 이 규칙은 **지금** verses 에 남아 있는 행만
--       본다. 만약 어떤 주간 구절 행이 통째로 지워졌다면(숨김이 아니라 삭제) 그 기간은
--       빈 채로, 그 다음 구절이 원래보다 일찍 시작한 것처럼 보일 수 있다. 완전한 확답이
--       필요하면 이 표의 구절번호를 admin-stats.html 의 말씀 등록 이력과 눈으로 맞춰 본다.
with weekly as (
  select no, ref_full, ref, (date at time zone 'Asia/Seoul')::date as start_day
  from public.verses where track = 'weekly' and date is not null
),
days as (select distinct day from public.feature_log where feature = 'push')
select d.day,
       w.no                       as 구절번호,
       coalesce(w.ref_full, w.ref) as 본문,
       count(distinct f.user_id)  as 사람,
       sum(f.cnt)                 as 횟수
from days d
join public.feature_log f on f.day = d.day and f.feature = 'push'
left join lateral (
  select no, ref_full, ref from weekly where start_day <= d.day order by start_day desc limit 1
) w on true
group by d.day, w.no, w.ref_full, w.ref
order by d.day desc;
