-- 시편 말씀 액자 — 표 확장 + 「개발 DB 전용」 씨앗
-- ⚠️ 운영 DB(xnomlgydifiqiybervtf)에 돌리지 말 것. 시편이 아닌 구절을 복제한 것이다.
--    운영에는 tools/psalm-fit.py 가 만드는 supabase/psalm_frames.sql 을 쓴다.

-- ① 표 확장 ------------------------------------------------------------
alter table public.verses
  add column if not exists track     text not null default 'weekly',  -- 'weekly' | 'psalm'
  add column if not exists day_no    int,        -- 1~180 · 열리는 순서
  add column if not exists frame_art smallint;   -- 1~12 · 액자 그림(구절마다 고정)

create index if not exists idx_verses_track on public.verses(track, day_no);
update public.verses set track = 'weekly' where track is null;

-- ② 시작일 ------------------------------------------------------------
-- ⚠️ app_config.value 는 jsonb 다 — 맨 문자열을 넣으면 실패한다
insert into public.app_config (key, value)
  values ('psalm', '{"start":"2026-09-21","totalDays":180}'::jsonb)
  on conflict (key) do update set value = excluded.value, updated_at = now();

-- ③ 개발 씨앗 20편 -----------------------------------------------------
-- 길이 잣대(글자수+낱말수 ≤ 76)를 통과하는 주간 구절만 골라 복제한다.
with fit as (
  select v.no, v.ref, v.ref_short, v.ref_full, v.text,
         row_number() over (order by v.no) as n
    from public.verses v
   where v.track = 'weekly'
     and v.text is not null
     and length(replace(btrim(v.text), ' ', ''))
         + coalesce(array_length(string_to_array(btrim(v.text), ' '), 1), 0) <= 76
)
insert into public.verses (no, track, day_no, frame_art, ref, ref_short, ref_full, text, week, is_active)
select 1000 + n, 'psalm', n, ((n - 1) % 12) + 1,
       ref, ref_short, ref_full, text, null, true
  from fit where n <= 20
on conflict (no) do update set
  track = excluded.track, day_no = excluded.day_no, frame_art = excluded.frame_art,
  ref = excluded.ref, ref_short = excluded.ref_short, ref_full = excluded.ref_full,
  text = excluded.text, is_active = excluded.is_active;

-- ④ 확인 ---------------------------------------------------------------
select track, count(*) as 편수, min(no) as 첫번호, max(no) as 끝번호
  from public.verses group by track order by track;

select greatest(0, least(180,
       ((now() at time zone 'Asia/Seoul')::date - date '2026-09-21') + 1)) as 오늘_열린_편수;
