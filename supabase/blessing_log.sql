-- 가정 축복 기도문 — 누가 얼마나 보시는지 (2026-09-03)
--   Supabase SQL Editor 에서 1회 실행. ⚠️ 개발(ktpwthwqzgcqcrmsafdo) 먼저, 확인 뒤 운영.
--
-- ■ 왜 남기나
--   성도님께 열기 전에 「쓰이는가」를 잴 길을 먼저 만든다. 안 그러면 열어 놓고
--   반응을 짐작으로만 말하게 된다(카드 모드가 그랬다 — 도입하고도 여덟 달을
--   측정 못 하다가 2026-09-02에야 28.5%인 걸 알았다).
--
-- ■ 한 사람이 하루에 한 편을 여러 번 봐도 **한 행**이다(cnt 만 는다).
--   challenge_log 처럼 열 때마다 한 행씩 쌓으면 금세 커진다 —
--   daily_activity 에서 배운 것을 처음부터 적용한다(로그 11,052행 = 집계 579행).
--
-- ■ 날짜는 한국 시간 기준이다. UTC 로 두면 밤에 보신 것이 다음 날로 넘어간다.

create table if not exists public.blessing_log (
  user_id uuid not null references public.users(id) on delete cascade,
  day     date not null default ((now() at time zone 'Asia/Seoul')::date),
  no      int  not null,                    -- 몇 번 편인가 (1~104)
  cnt     int  not null default 1,          -- 그날 그 편을 몇 번 열었나
  primary key (user_id, day, no)
);

-- ⚠️ 표를 만들면 그 자리에서 RLS 를 켠다 — 안 켜면 공개 키로 통째로 읽힌다.
--    2026-08-25 event_entries 가 그걸 빠뜨려 user_id 47건이 새어 나갔다.
--    이 표에는 user_id 가 들어 있어 더더욱 그렇다. Edge Function(service_role)만 읽는다.
alter table public.blessing_log enable row level security;

create index if not exists blessing_log_day_idx on public.blessing_log (day);

-- 한 번 여는 것을 한 번 세는 함수. 있으면 cnt 를 올리고 없으면 만든다.
create or replace function public.v2_blessing_log(uid uuid, n int)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.blessing_log (user_id, no) values (uid, n)
  on conflict (user_id, day, no) do update set cnt = public.blessing_log.cnt + 1;
$$;

revoke all on function public.v2_blessing_log(uuid, int) from public, anon, authenticated;
grant execute on function public.v2_blessing_log(uuid, int) to service_role;

-- ─────────────────────────────────────────────────────────────
-- 보는 법 (관리자 SQL Editor 에서)
-- ─────────────────────────────────────────────────────────────

-- ① 한눈에
select count(distinct user_id) as 본_사람,
       count(*)                as 사람x날짜x편,
       sum(cnt)                as 총_열어본_횟수,
       min(day) as 처음, max(day) as 마지막
from public.blessing_log;

-- ② 날짜별
select day, count(distinct user_id) as 사람, sum(cnt) as 횟수
from public.blessing_log group by day order by day desc limit 30;

-- ③ 많이 읽히는 편 (제목까지)
select l.no, b.title, b."group",
       count(distinct l.user_id) as 사람, sum(l.cnt) as 횟수
from public.blessing_log l
join public.blessings b on b.no = l.no
group by l.no, b.title, b."group"
order by 사람 desc, 횟수 desc
limit 20;

-- ④ 누가 얼마나 (⚠️ 이름이 나오므로 관리자만)
select u.gu, u.mok, u.name,
       count(distinct l.day) as 본_날수,
       count(distinct l.no)  as 본_편수,
       sum(l.cnt)            as 횟수,
       max(l.day)            as 마지막
from public.blessing_log l
join public.users u on u.id = l.user_id
group by u.gu, u.mok, u.name
order by 횟수 desc
limit 50;

-- ⑤ 한 번 보고 마셨나, 이어 보시나 — 사람별 본 날수 분포
select 본_날수, count(*) as 사람수 from (
  select user_id, count(distinct day) as 본_날수
  from public.blessing_log group by user_id
) t group by 본_날수 order by 본_날수;
