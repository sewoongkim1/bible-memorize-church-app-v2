-- 사역신청 「② 언제」 재구성 (2026-09-10, 성도님 지시)
-- ⚠️ 이 저장소는 공개(public)입니다 — 비밀번호·키를 절대 넣지 마세요.
-- ⚠️ **개발 DB(ktpwthwqzgcqcrmsafdo)에 먼저** 돌린 뒤 운영(xnomlgydifiqiybervtf).
-- ⚠️ 여러 번 돌려도 안전하다.
--
-- ⚠️⚠️ **이 SQL 을 두 DB 에 먼저 돌린 뒤에야 코드를 배포한다.** 새 코드가 이 칸들을
--    읽는데 칸이 없으면 ministryCatalog 가 통째로 실패하고 사역신청 화면이 죽는다.
--    이 저장소는 작업 트리를 여러 세션이 공유해서, **커밋하지 않아도 누가 배포하면
--    함께 나간다**(2026-09-10 psalm_frames 건이 그 사고였다).
--
-- 바뀌는 것 셋:
--   ① 요일에 **금요일**을 더한다 — 금요성령집회·행복전도대(금) 처럼 금요일 사역이
--      많은데 「평일」로 뭉뚱그리면 성도님이 금요일만 골라 찾을 수 없다.
--   ② 주기를 **여러 개 고를 수 있게** 한다(매주 또는 격주인 팀이 있다).
--      text 한 칸으로는 여럿을 담을 수 없어 네 칸으로 나눈다 — 요일과 같은 모양이다.
--   ③ 시각은 **주일에만** 받는다. 주일이 아닌 팀의 시각은 지운다.

-- ── ① 금요일 ──────────────────────────────────────────────────────
alter table public.ministry_catalog
  add column if not exists day_fri boolean not null default false;

-- ⚠️ 「평일」은 이제 **금요일을 뺀 날**을 뜻한다(화면 라벨에도 그렇게 적었다).
--    기존 자료는 금요일을 평일에 넣어 두었을 수 있으나, 어느 팀이 금요일인지
--    자료만으로는 알 수 없다 — **자동으로 옮기지 않는다.** 부서 확인 때 채워진다.
--    (지어낸 값을 사실처럼 넣지 않는다.)

-- ── ② 주기 넷 ─────────────────────────────────────────────────────
alter table public.ministry_catalog
  add column if not exists freq_weekly   boolean not null default false,  -- 매주
  add column if not exists freq_biweekly boolean not null default false,  -- 격주(교대형식)
  add column if not exists freq_monthly  boolean not null default false,  -- 매달
  add column if not exists freq_adhoc    boolean not null default false;  -- 그때그때

-- 옛 한 칸(freq)에 있던 값을 옮긴다. 이미 옮겼으면 아무 일도 안 한다.
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_name = 'ministry_catalog' and column_name = 'freq') then
    -- ⚠️ coalesce 를 반드시 쓴다 — freq 가 null 이면 `false or null` 이 **null** 이 되어
    --    not null 제약에 걸린다(2026-09-10 처음 돌릴 때 실제로 막혔다).
    update public.ministry_catalog set
      freq_weekly   = freq_weekly   or coalesce(freq, '') = '매주',
      freq_biweekly = freq_biweekly or coalesce(freq, '') = '격주',
      freq_monthly  = freq_monthly  or coalesce(freq, '') = '매달',
      freq_adhoc    = freq_adhoc    or coalesce(freq, '') = '그때그때';
  end if;
end $$;

-- ⚠️ 옛 칸을 **지운다.** 남겨 두면 「같은 뜻이 두 곳」이 되어 나중에 한쪽만 고치게 된다
--    (2026-09-10 직분 목록에서 겪은 그대로 — 화면·서버·DB 셋이 갈라지면 조용히 틀린다).
alter table public.ministry_catalog drop constraint if exists ministry_catalog_freq_chk;
alter table public.ministry_catalog drop column if exists freq;

-- ── ③ 시각은 주일에만 ─────────────────────────────────────────────
-- 먼저 주일이 아닌 팀의 시각을 비운다(아래 제약이 걸리려면 먼저 정리돼야 한다).
update public.ministry_catalog
   set time_from = null, time_to = null
 where not day_sun and (time_from is not null or time_to is not null);

-- ⚠️ 규칙을 **DB 에도** 새긴다. 코드에만 두면 다음 사람이 서버를 고칠 때 조용히 깨진다.
alter table public.ministry_catalog drop constraint if exists ministry_catalog_time_sun_chk;
alter table public.ministry_catalog add constraint ministry_catalog_time_sun_chk
  check (day_sun or (time_from is null and time_to is null));

-- 확인
--   select team, day_sun, day_fri, day_sat, day_week,
--          freq_weekly, freq_biweekly, freq_monthly, freq_adhoc, time_from, time_to
--     from ministry_catalog where year = 2027 order by sort_order limit 10;
--   select count(*) from ministry_catalog where not day_sun and time_from is not null;  -- 0 이어야 한다
