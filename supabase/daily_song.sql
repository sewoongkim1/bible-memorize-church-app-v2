-- 오늘의 찬양 — 하루 한 곡 (2026-09-23)
--   Supabase SQL Editor 에서 1회 실행. ⚠️ **개발(ktpwthwqzgcqcrmsafdo) 먼저, 확인 뒤 운영.**
--   ⚠️ 개발에서는 supabase/praise_songs_dev_seed.sql 을 **이 파일보다 먼저** 돌린다 —
--      아래 뷰·함수는 만들 때 본문이 검증되므로(check_function_bodies 기본 on)
--      songs 표가 없으면 「relation "songs" does not exist」로 실패한다.
--      운영에는 songs 가 이미 있어 이 파일만 돌리면 된다.
--
-- ■ 무엇을 하나
--   찬양 아카이브의 songs 표(같은 프로젝트, **읽기 전용**)에서 후보를 걸러 두고,
--   하루 한 곡을 daily_song 에 적어 모두가 같은 날 같은 곡을 보게 한다.
--
-- ■ 고르는 규칙 — LRU
--   ① 한 번도 안 나온 곡 중 무작위  ② 그런 곡이 없으면 **가장 오래전에 나온 곡**
--   ⚠️ 「기록을 비우고 새 바퀴」로 하지 않는다. 그러면 후보가 0일 때 무한 루프에 빠지고
--      그 전에 daily_song 을 통째로 지운다. 이 API 는 JWT 가 없어 누구나 부를 수 있고,
--      이 저장소는 조회 실패를 0건으로 읽는 관행이 있어(index.ts:766) **조회 한 번 실패가
--      곧 전체 삭제**가 된다. LRU 는 후보가 절대 안 비어 그 분기 자체가 없다.

-- ─────────────────────────────────────────────────────────────
-- ① 표
-- ─────────────────────────────────────────────────────────────

create table if not exists public.daily_song (
  day        date primary key,               -- 한국 날짜. ⚠️ 기본값을 두지 않는다 — UTC 로 박힌다
  song_id    text not null,                  -- 유튜브 영상 id (= songs.id)
  created_at timestamptz not null default now()
);
-- ⚠️ 표를 만들면 그 자리에서 RLS 를 켠다 — 2026-08-25 event_entries 가 이 한 줄을 빠뜨려
--    user_id 47건이 공개 키로 읽혔다.
alter table public.daily_song enable row level security;
revoke all on table public.daily_song from anon, authenticated;

-- ⚠️ song_id 에 references songs(id) 를 **걸지 않는다.** 걸면 찬양 담당자의 곡 삭제가 막혀
--    남의 앱 관리 화면이 고장나고, 「songs 는 읽기만 한다」는 약속이 FK 로 깨진다.

-- ⚠️ **쓰임 기록용 표를 새로 만들지 않는다.** 다른 세션이 2026-09-23 에 열람 기록 통합 표
--    `feature_log` 를 만들어 두었다(supabase/feature_log.sql · 커밋 2c7f54b). 그 파일 머리말이
--    「blessing_log 를 일반화한 것」이라고 적고 있고, member_merge.sql 의 계정 합치기 목록에도
--    이미 들어가 있다. 여기에 표를 하나 더 만들면 그 통합이 첫날부터 깨진다.
--    → 오늘의 찬양은 `v2_feature_log(uid, 'song', 0)` 을 부른다. 이 파일은 그 표를 만들지 않고,
--       **supabase/feature_log.sql 이 먼저 돌아가 있어야 한다**(그 세션이 개발·운영에 돌린다).

-- ─────────────────────────────────────────────────────────────
-- ② 후보 풀 — 거르는 조건은 **여기 한 곳**에만 둔다
-- ─────────────────────────────────────────────────────────────
--   ⚠️ 뷰는 RLS 대상이 아니다. 만든 사람 권한으로 돌아 밑 표의 RLS 를 지나가고,
--      anon 에게 SELECT 가 남아 있으면 PostgREST 가 그대로 내보낸다.
--      revoke + security_invoker 둘 다 필요하다.
--   ⚠️ 모든 문자열 비교에 normalize(…, NFC) 를 건다 — 2026-09-20 에 맥에서 온 자모분리(NFD)로
--      48곡이 필터에서 조용히 빠졌다(docs/analysis/2026-09-20-praise-choir-nfc-nfd-duplicate.md).
--   ⚠️ category 값의 주인은 이 저장소가 아니다. 찬양 앱 담당자가 관리 화면에서 바꾼다.
--      '기타' 는 2026-07-06 에 '특별찬양' 으로 바뀌었다. 또 바뀌면 오류 없이 곡 수만 준다 —
--      monitor 의 songPool 이 그것만 알려 준다.
--   ⚠️ 길이를 두 겹으로 거르는 이유: is_full 은 30분 이상일 때만 기본 '예' 라,
--      12~29분 칸타타·통짜 영상이 is_full=false 로 남아 있다.

create or replace view public.v2_song_pool
with (security_invoker = on) as
  select s.id, s.song, s.choir, s.svc_date, s.duration, s.thumbnail
    from public.songs s
   where s.hidden = false
     and s.is_full = false
     and s.duration_sec between 1 and 720
     and normalize(btrim(s.song, '''" '), NFC) not in ('찬양', '찬양과 경배', '특송', '')
     and normalize(btrim(s.song), NFC)
         is distinct from normalize(btrim(coalesce(s.choir, '')), NFC)
     and normalize(btrim(coalesce(s.category, '')), NFC) in ('찬양대', '중창단', '특별찬양');

revoke all on public.v2_song_pool from anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- ③ 오늘 한 곡
-- ─────────────────────────────────────────────────────────────
--   ⚠️ language plpgsql 인 이유: 단일 SQL 문장으로 쓰면 데이터 변경 CTE 와 바깥 select 가
--      **같은 스냅샷**을 써서, on conflict do nothing 으로 진 요청이 방금 남이 커밋한
--      오늘 행을 못 보고 NULL 을 받는다. 하필 그 경로를 밟는 것이 아침에 거의 동시에
--      들어오는 첫 몇 분이다. plpgsql 은 ③ 을 새 문장으로 돌려 그 행을 본다.

create or replace function public.v2_today_song(p_day date)
returns table (id text, song text, choir text, svc_date date, duration text, thumbnail text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text;
begin
  -- ① 오늘 행이 있으면 그것. 단 후보 조건을 다시 건다(담당자가 그 사이 숨겼을 수 있다).
  select d.song_id into v_id
    from public.daily_song d
   where d.day = p_day
     and exists (select 1 from public.v2_song_pool p where p.id = d.song_id);

  -- ② 없으면 뽑아서 적는다 — 한 번도 안 나온 곡 먼저(nulls first), 그들 사이는 무작위.
  --    한 바퀴 다 돌았으면 곡별 마지막 출연일이 가장 이른 곡.
  --    ⚠️ 「daily_song 의 가장 이른 행」으로 고르면 안 된다 — 행을 안 지우므로 그 행은
  --       언제까지나 맨 처음 나간 곡의 것이고, 한 바퀴 뒤부터 같은 곡이 매일 나온다.
  if v_id is null then
    insert into public.daily_song (day, song_id)
    select p_day, p.id
      from public.v2_song_pool p
      left join (select l.song_id, max(l.day) as last_day
                   from public.daily_song l group by l.song_id) t
             on t.song_id = p.id
     order by t.last_day asc nulls first, random()
     limit 1
    on conflict (day) do nothing
    returning public.daily_song.song_id into v_id;

    -- ③ 경쟁에서 졌으면(do nothing) 새 문장으로 다시 읽는다.
    if v_id is null then
      select d.song_id into v_id from public.daily_song d where d.day = p_day;
    end if;
  end if;

  if v_id is null then return; end if;   -- 후보가 하나도 없다 → 0행(오류가 아니다)

  return query
    select p.id, p.song, p.choir, p.svc_date, p.duration, p.thumbnail
      from public.v2_song_pool p where p.id = v_id;
end;
$$;

-- ⚠️ PostgreSQL 은 새 함수의 EXECUTE 를 **기본적으로 PUBLIC 에 준다.** 그러면 공개 키만 있으면
--    누구나 POST /rest/v1/rpc/v2_today_song 을 부르고, security definer 라 RLS 를 지나간다.
--    표·뷰와 달리 함수는 Supabase 표 목록에 안 보이므로 눈으로는 안 잡힌다.
revoke all on function public.v2_today_song(date) from public, anon, authenticated;
grant execute on function public.v2_today_song(date) to service_role;

notify pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────
-- 보는 법 (관리자 SQL Editor 에서)
-- ─────────────────────────────────────────────────────────────

-- ① 후보가 몇 곡인가 (⚠️ 이 숫자가 갑자기 줄면 category 이름이 바뀐 것이다)
select count(*) as 후보곡수 from public.v2_song_pool;

-- ② 구분별로 몇 곡인가 — 후보에 안 들어온 구분이 무엇인지 함께 본다
select normalize(btrim(coalesce(category,'')), NFC) as 구분, count(*) as 곡수
from public.songs where hidden = false group by 1 order by 2 desc;

-- ③ 지금까지 나간 곡
select d.day, d.song_id, s.song, s.choir
from public.daily_song d left join public.songs s on s.id = d.song_id
order by d.day desc limit 30;

-- ④ 몇 바퀴째인가 — 남은 곡이 0 이면 다음날부터 LRU 로 돈다(정상이다)
select (select count(*) from public.v2_song_pool) as 후보,
       (select count(distinct song_id) from public.daily_song) as 나간곡,
       (select count(*) from public.v2_song_pool p
         where not exists (select 1 from public.daily_song d where d.song_id = p.id)) as 남은곡;

-- ⑤ 누가 얼마나 눌렀나 (⚠️ 이름이 나오므로 관리자만)
--    ⚠️ 기록은 이 파일이 아니라 supabase/feature_log.sql 의 통합 표에 쌓인다(feature = 'song').
select u.gu, u.mok, u.name, count(distinct l.day) as 누른_날수, sum(l.cnt) as 횟수
from public.feature_log l join public.users u on u.id = l.user_id
where l.feature = 'song'
group by u.gu, u.mok, u.name order by 횟수 desc limit 50;
