-- 사역신청 — 필터용 칸 (2026-09-10)
-- ⚠️ 이 저장소는 공개(public)입니다 — 비밀번호·키를 절대 넣지 마세요.
-- ⚠️ **개발 DB(ktpwthwqzgcqcrmsafdo)에 먼저** 돌린 뒤 운영에 올린다.
--
-- 88팀을 위원회 아코디언만으로 훑기 어려워 필터를 넣는다(ministry/2027_사역신청_필터안.html).
-- 축 셋: 언제(요일) · 얼마나 자주(주기) · 몇 시쯤(시각).
--
-- ⚠️ **받는 것은 시각, 묶는 것은 화면.** 구간(6~9, 8~11 …)을 DB 에 넣지 않는다 —
--    구간은 나중에 다시 그을 수 있어야 하고, 그때 부서에 두 번 묻지 않으려면
--    시각 그대로 갖고 있어야 한다.
--
-- ⚠️ **비어 있음은 「모름」이지 「해당 없음」이 아니다.** 요일 셋이 다 false 면 화면에서
--    「정해진 날 없음」으로, 시각이 비면 「때마다 다름」으로 보인다.
--    부서가 아무것도 안 적어도 그 팀이 필터에서 사라지지 않게 하는 것이 핵심이다 —
--    「미기입 = 제외」로 짜면 회신율이 곧 실종률이 된다.

alter table public.ministry_catalog
  add column if not exists day_sun   boolean not null default false,  -- 주일에 하나
  add column if not exists day_week  boolean not null default false,  -- 평일에 하나
  add column if not exists day_sat   boolean not null default false,  -- 토요일에 하나
  add column if not exists time_from text,                            -- 'HH:MM' 모이는 시각
  add column if not exists time_to   text,                            -- 'HH:MM' 마치는 시각
  add column if not exists freq      text;                            -- 한 사람이 서는 주기

-- ⚠️ 「팀이 모이는 주기」가 아니라 **한 사람이 서는 주기**다. 당번을 나눠 도는 팀은
--    팀은 매주라도 한 사람은 격주다 — 성도님이 재는 것은 자기 부담이다.
alter table public.ministry_catalog drop constraint if exists ministry_catalog_freq_chk;
alter table public.ministry_catalog add constraint ministry_catalog_freq_chk
  check (freq is null or freq in ('매주', '격주', '매달', '그때그때'));

-- 시각은 'HH:MM' 24시간 꼴만 (30분 단위로 받지만 제약은 분까지 열어 둔다)
alter table public.ministry_catalog drop constraint if exists ministry_catalog_time_chk;
alter table public.ministry_catalog add constraint ministry_catalog_time_chk
  check ((time_from is null or time_from ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
     and (time_to   is null or time_to   ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'));

-- 확인
--   select team, day_sun, day_week, day_sat, time_from, time_to, freq
--     from ministry_catalog where year = 2027 limit 10;
