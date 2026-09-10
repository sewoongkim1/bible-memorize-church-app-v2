-- 시편 말씀 액자 — 표 확장 + 「개발 DB 전용」 씨앗
-- ⚠️ 운영 DB(xnomlgydifiqiybervtf)에 돌리지 말 것. 시편이 아닌 구절을 복제한 것이다.
--    운영에는 tools/psalm-fit.py 가 만드는 supabase/psalm_frames.sql 을 쓴다.
-- ⚠️ 순서(함수 vs SQL): **이 기능은 함수(Edge Function)가 먼저, SQL이 나중이다.**
--    getVerses에 track 필터가 없는 옛 함수 위에서 이 SQL이 먼저 돌면, ③이 심는
--    is_active=true 구절을 옛 함수가 track 구분 없이 통째로 돌려주어 개발 DB에서도
--    말씀 목록이 깨진다. 그래서 ③은 is_active=false로 심고, ⑤(활성화)는 새 함수
--    배포를 확인한 뒤에만 손으로 주석을 풀어 따로 돌린다.
-- ⚠️ 번호(no) 정책: 한 번 연 no는 절대 다른 구절에 재배정하지 않는다(추가는 뒤에만).
--    verses에서 delete 금지 — progress.verse_no·challenge_log.verse_no가
--    on delete cascade라 기록이 함께 지워진다.

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
-- ⚠️ 상한만 걸고 하한은 일부러 안 건다 — 짧은 구절도 섞여 들어와야 액자 글씨
--    상한(34px) 클램프와 「짧으면 액자가 허전하다」를 개발 중에 눈으로 볼 수 있다.
--    (리뷰에서 "하한 누락"으로 오해받은 적 있음 — 하한을 추가하지 말 것)
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
       ref, ref_short, ref_full, text, null, false
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

-- ⑤ ⚠️ 아래는 **새 Edge Function 배포를 확인한 뒤에만** 돌린다.
--    확인: getVerses(track 없음)가 주간 구절만 돌려주는지 → bash tests/psalm-smoke.sh
--    순서를 어기면 게이트와 무관하게 개발 DB에서도 말씀 목록에 시편이 섞인다.
-- update public.verses set is_active = true where track = 'psalm';
