# 오늘의 찬양 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 서버가 매일 우리 교회 찬양 한 곡을 정하고, 암송 앱이 그 곡명을 단추에 보여 주며, 누르면 찬양 아카이브(worship.onlybible.kr)에서 그 곡이 재생된다.

**Architecture:** 찬양 앱의 `songs` 표(같은 Supabase 프로젝트)를 **읽기 전용**으로 걸러 뷰 `v2_song_pool` 하나를 만들고, `security definer` 함수 `v2_today_song(date)` 가 「한 번도 안 나온 곡 먼저, 없으면 가장 오래전에 나온 곡」(LRU)으로 하루 한 곡을 `daily_song` 에 적고 돌려준다. Edge Function `api` 에 액션 `getTodaySong`·`logSongClick` 을 더하고, 앱은 첫 화면과 매일 묵상 창 두 곳에 단추를 그린다. 재생은 형제 앱에 `?song=<id>` 딥링크를 달아 그쪽 플레이어(화면 깨우기·잠금화면 컨트롤이 이미 있다)에 맡긴다.

**Tech Stack:** Vanilla JS PWA (`app.js` 단일 파일) · Supabase Edge Function (Deno/TypeScript) · PostgreSQL (plpgsql) · 형제 저장소 `c:\Projects\praise-songs`

**설계 문서:** `docs/superpowers/specs/2026-09-23-today-song-design.md` — **손대기 전에 읽는다.**

---

## Global Constraints

이 값들은 **모든 작업에 걸린다.** 하나라도 어기면 조용히 틀어진다.

- **노출 게이트는 끈 채로 끝낸다.** `app_config.songPublic` 을 `true` 로 넣는 것은 **9/27 플레이스토어 프로덕션 승인 뒤** 친구가 한다. 이 계획의 어떤 작업도 그 행을 만들지 않는다.
- **`songs` 표는 읽기만 한다.** 찬양 앱 것이다. `insert`/`update`/`delete`/외래키 전부 금지.
- **새 js 파일을 만들지 않는다.** 코드는 `app.js` 안에 둔다. `js/song.js` 를 만들면 `index.html` script 태그와 `tools/bump.py` 의 `TAGGED` 배열을 **둘 다** 고쳐야 하고, 하나만 빠뜨리면 `tools/preflight.py` 가 실패해 **다른 세션의 긴급 수정까지 배포가 막힌다**(`concurrency: cancel-in-progress`).
- **공용 파일(`app.js`·`style.css`·`index.ts`)은 `git apply --cached` 로 내 헝크만 담는다.** 커밋 직전 `git diff --cached` 로 남의 것이 없는지 본다. 세 세션이 같은 체크아웃에서 일한다.
- **SQL 은 친구가 대시보드에서 돌린다.** CLI 로그인이 없다. 파일로 적어 두고 **개발 → 확인 → 운영** 순으로 부탁한다.
- **`supabase functions deploy` 는 git 이 아니라 작업 트리를 올린다.** 배포 전 `git status` 와 `git diff supabase/functions/api/index.ts` 로 남의 헝크가 없는지 눈으로 본다.
- **색은 네 단계뿐이다.** 새 단추에 제 색을 주지 않는다. 이 기능의 단추는 `.summary-help` 기본(청색 선·청색 글) + `<span class="ext-mark">↗</span>`. ⚠️ **`.ext-cta` 를 쓰지 않는다** — 2026-09-10 에 성도님이 「모두 동일하게」로 정하셔서 뗀 규칙이고, 실제 선택자도 `.summary-help.ext-cta` 라 다른 데선 안 먹는다.
- **응답·표·뷰 어디에도 `user_id` 를 노출하지 않는다.** 이 API 는 JWT 가 없어 `user_id` 하나면 그 사람 행세가 된다.
- **표·뷰·함수를 만들면 그 자리에서 RLS·revoke 를 건다.** 뷰는 RLS 대상이 아니고, 함수의 EXECUTE 는 기본이 PUBLIC 이다.
- 개발 Supabase = `ktpwthwqzgcqcrmsafdo` · 운영 = `xnomlgydifiqiybervtf`. `js/config.js` 가 **주소를 보고 저절로** 고른다 — 손으로 바꾸지 않는다.

---

## File Structure

| 파일 | 만드나/고치나 | 무엇을 맡나 |
|---|---|---|
| `supabase/praise_songs_dev_seed.sql` | **새로** | 개발 DB 에만 `songs` 표를 만들고 시드 35곡(걸러져야 할 것을 일부러 섞는다) |
| `supabase/daily_song.sql` | **새로** | 표 둘(`daily_song`·`song_click_log`) · 뷰 `v2_song_pool` · 함수 `v2_today_song` · RLS·revoke·grant · 보는 법 질의 |
| `supabase/functions/api/index.ts` | 고침 | 액션 `getTodaySong`·`logSongClick` · `monitor` 에 정보 두 값 |
| `tests/song-smoke.sh` | **새로** | 읽기 전용 스모크(`tests/psalm-smoke.sh` 와 같은 꼴) |
| `js/api.js` | 고침 | `getTodaySong`·`logSongClick` 두 줄 |
| `app.js` | 고침 | 게이트(`songVisible`)·캐시·`withTimeout`·첫 화면 단추·묵상 창 CTA |
| `style.css` | 고침 | `.med-song-cta` 와 그 어두운 모드 짝 · `.ext-mark` 선택자 확장 |
| `tools/screen-sweep.py` | 고침 | 리셋 스크립트에 `_songPreview=true` |
| `c:\Projects\praise-songs\app.js` | 고침 | `?song=<id>` 딥링크 (**형제 저장소**) |

---

## Task 1: SQL 두 파일 — 개발 DB 에 올린다

**Files:**
- Create: `supabase/praise_songs_dev_seed.sql`
- Create: `supabase/daily_song.sql`

**Interfaces:**
- Produces: 뷰 `public.v2_song_pool(id, song, choir, svc_date, duration, thumbnail)` · 함수 `public.v2_today_song(p_day date) returns table(id text, song text, choir text, svc_date date, duration text, thumbnail text)` · 표 `public.daily_song(day, song_id, created_at)` · 표 `public.song_click_log(user_id, day, song_id)`

- [ ] **Step 1: 개발 시드 SQL 을 만든다**

`praise.json` 에서 뽑되 **걸러져야 할 것을 일부러 섞는다.** 아래를 그대로 돌린다(한 번만 쓰는 생성기라 커밋하지 않는다 — 결과 `.sql` 만 커밋한다).

```bash
cd /c/Projects/bible-memorize-church-app-v2 && python -X utf8 - <<'PY'
import json, io, random
src = json.load(open(r'c:/Projects/praise-songs/praise.json', encoding='utf-8'))
def sec(x): return int(x.get('durationSec') or 0)
def cat(x): return (x.get('category') or '').strip()
# 운영은 '기타' → '특별찬양' 으로 이름이 바뀌었다(2026-07-06). 개발 시드도 운영 값으로 맞춘다.
def cat_prod(x): return '특별찬양' if cat(x) == '기타' else cat(x)

good  = [x for x in src if cat(x) in ('찬양대','중창단') and 60 < sec(x) <= 720
         and (x.get('song') or '').strip() not in ('찬양','찬양과 경배','특송','')
         and (x.get('song') or '').strip() != (x.get('choir') or '').strip()][:25]
teuk  = [x for x in src if cat(x) == '기타' and sec(x) <= 720
         and (x.get('song') or '').strip() not in ('찬양','')][:5]
# ── 일부러 섞는 「걸러져야 할」 다섯 ──
kant  = [x for x in src if cat(x) in ('찬양대','중창단') and sec(x) > 720][:1]          # 칸타타(12분 초과)
team  = [x for x in src if cat(x) == '찬양팀'][:1]                                      # 찬양팀(제외 대상)
noname= [x for x in src if (x.get('song') or '').strip().strip('\'"') == '찬양'][:1]    # 곡명이 「찬양」
same  = [x for x in src if (x.get('song') or '').strip() == (x.get('choir') or '').strip() and cat(x)=='찬양대'][:1]  # 곡명=찬양대
rows, seen = [], set()
for x in good + teuk + kant + team + noname + same:
    if x['id'] in seen: continue
    seen.add(x['id']); rows.append(x)
# hidden 하나를 강제로 만든다(운영 자료에는 hidden 이 안 실려 온다)
hidden_id = rows[0]['id']

def q(s): return "'" + str(s or '').replace("'", "''") + "'"
out = io.StringIO()
out.write("""-- 개발 DB 전용 — 찬양 아카이브 songs 표 + 시드 (2026-09-23)
--   ⚠️⚠️ **운영(xnomlgydifiqiybervtf)에 절대 돌리지 말 것.** 운영에는 songs 표가 이미 있고
--        1,700곡이 들어 있다. 이 파일은 개발(ktpwthwqzgcqcrmsafdo)에만 쓴다.
--
-- ■ 왜 필요한가
--   개발 프로젝트에는 songs 표가 아예 없다(REST 로 찔러 보면 PGRST205). 그래서 「오늘의 찬양」을
--   개발에서 확인할 수가 없다 — 단추에 곡명이 안 뜬다.
--
-- ■ 무엇이 들었나
--   찬양대·중창단 25곡 + 특별찬양 5곡(= 뽑혀야 하는 것)
--   + **일부러 섞은 걸러질 것 다섯** — 칸타타(12분 초과) · 찬양팀 · 곡명이 「찬양」 · 곡명=찬양대 이름 · hidden.
--   그래야 daily_song.sql 의 거르개가 실제로 도는지 개발에서 볼 수 있다.
--
-- ■ DDL 은 c:/Projects/praise-songs/supabase/schema.sql 을 그대로 베끼고,
--   운영에만 있는 두 칸(category_ordering·choir_ordering)을 더했다.

create table if not exists public.songs (
  id                text primary key,
  song              text not null,
  choir             text,
  category          text,
  svc_date          date,
  duration          text,
  duration_sec      int default 0,
  views             int default 0,
  thumbnail         text,
  is_full           boolean not null default false,
  hidden            boolean not null default false,
  category_ordering int,
  choir_ordering    int,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_songs_date     on public.songs(svc_date desc);
create index if not exists idx_songs_category on public.songs(category);

-- ⚠️ 표를 만들면 그 자리에서 RLS 를 켠다(운영 schema.sql 과 같다).
alter table public.songs enable row level security;

insert into public.songs (id, song, choir, category, svc_date, duration, duration_sec, thumbnail, is_full, hidden) values
""")
vals = []
for x in rows:
    vals.append("  (%s, %s, %s, %s, %s, %s, %d, %s, %s, %s)" % (
        q(x['id']), q(x.get('song')), q(x.get('choir')), q(cat_prod(x)), q(x.get('date')),
        q(x.get('duration')), sec(x), q(x.get('thumbnail')),
        'true' if sec(x) > 1800 else 'false',
        'true' if x['id'] == hidden_id else 'false'))
out.write(",\n".join(vals))
out.write("\non conflict (id) do nothing;\n\nnotify pgrst, 'reload schema';\n")
io.open('supabase/praise_songs_dev_seed.sql', 'w', encoding='utf-8').write(out.getvalue())
print('wrote %d rows (hidden=%s)' % (len(rows), hidden_id))
PY
```

Expected: `wrote 35 rows (hidden=...)` 비슷한 줄.

- [ ] **Step 2: 만들어진 시드를 눈으로 확인한다**

```bash
cd /c/Projects/bible-memorize-church-app-v2 && head -45 supabase/praise_songs_dev_seed.sql && echo "..." && python -X utf8 -c "
import io,re
s=io.open('supabase/praise_songs_dev_seed.sql',encoding='utf-8').read()
print('행수', s.count('),\n')+1)
for k in ['찬양팀','true, false','false, true']:
    print(k, '→', s.count(k))
"
```

Expected: `찬양팀` 이 1 이상(일부러 섞은 것) · `insert` 블록에 35줄 안팎.

- [ ] **Step 3: `supabase/daily_song.sql` 을 쓴다**

```sql
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

-- 쓰임 재기 — 성도님께 열기 전에 잴 길을 먼저 만든다(blessing_log 와 같은 생각).
--   ⚠️ 나중에 붙이면 그때부터 0 부터 쌓인다. 표를 만드는 지금이 가장 싸다.
create table if not exists public.song_click_log (
  user_id uuid not null references public.users(id) on delete cascade,
  day     date not null default ((now() at time zone 'Asia/Seoul')::date),
  song_id text not null,
  cnt     int  not null default 1,
  primary key (user_id, day, song_id)
);
alter table public.song_click_log enable row level security;
revoke all on table public.song_click_log from anon, authenticated;
create index if not exists song_click_log_day_idx on public.song_click_log (day);

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

-- 클릭 한 번 세기 (blessing_log 의 v2_blessing_log 와 같은 꼴)
create or replace function public.v2_song_click(uid uuid, sid text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.song_click_log (user_id, song_id) values (uid, sid)
  on conflict (user_id, day, song_id) do update set cnt = public.song_click_log.cnt + 1;
$$;

revoke all on function public.v2_song_click(uuid, text) from public, anon, authenticated;
grant execute on function public.v2_song_click(uuid, text) to service_role;

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
select u.gu, u.mok, u.name, count(distinct l.day) as 누른_날수, sum(l.cnt) as 횟수
from public.song_click_log l join public.users u on u.id = l.user_id
group by u.gu, u.mok, u.name order by 횟수 desc limit 50;
```

- [ ] **Step 4: 친구께 개발 DB 실행을 부탁한다 — 순서를 못 박아서**

> 친구, 개발 Supabase(`ktpwthwqzgcqcrmsafdo`) SQL Editor 에서 **이 순서로** 돌려 주세요.
> 1. `supabase/praise_songs_dev_seed.sql`
> 2. `supabase/daily_song.sql`
>
> ⚠️ 1번이 먼저여야 합니다 — 2번의 뷰·함수는 만들 때 본문이 검증돼서, `songs` 표가 없으면
> 「relation "songs" does not exist」로 실패합니다.

- [ ] **Step 5: 개발에서 함수가 도는지 확인한다** (친구가 SQL Editor 에서)

```sql
select * from public.v2_today_song(current_date);
select count(*) from public.v2_song_pool;   -- 30 안팎이어야 한다(35곡 중 다섯은 걸러진다)
```

Expected: 첫 질의가 **한 행**(곡 정보) · 둘째가 **30 안팎**. 35가 나오면 거르개가 안 도는 것이다.

- [ ] **Step 6: 공개 키로 새는 데가 없는지 점검한다**

```bash
K="sb_publishable_eJKP6u95IU9_DBXTvnvYBA_-yGCf-0Y"
B="https://ktpwthwqzgcqcrmsafdo.supabase.co"
for P in "daily_song?select=*&limit=1" "song_click_log?select=*&limit=1" "v2_song_pool?select=*&limit=1"; do
  echo "--- $P"; curl -s "$B/rest/v1/$P" -H "apikey: $K" | head -c 200; echo
done
echo "--- rpc"; curl -s -X POST "$B/rest/v1/rpc/v2_today_song" -H "apikey: $K" \
  -H "Content-Type: application/json" -d '{"p_day":"2026-09-23"}' | head -c 200; echo
```

Expected: 넷 모두 **행이 오면 안 된다** — 권한 오류(`42501`) 또는 빈 결과. 곡 정보가 오면 그 자리가 열려 있는 것이므로 `revoke` 를 다시 확인한다.

- [ ] **Step 7: 커밋**

```bash
cd /c/Projects/bible-memorize-church-app-v2
git add supabase/praise_songs_dev_seed.sql supabase/daily_song.sql
git diff --cached --stat        # ⚠️ 이 둘만 있어야 한다
git commit -F - <<'EOF'
feat(오늘의 찬양): SQL — daily_song·song_click_log·v2_song_pool·v2_today_song

하루 한 곡을 LRU 로 고른다(한 번도 안 나온 곡 먼저, 없으면 가장 오래전에 나온 곡).
「기록을 비우고 새 바퀴」는 쓰지 않는다 — 후보가 0일 때 무한 루프에 빠지고 그 전에
표를 통째로 지우는데, 이 API 는 조회 실패를 0건으로 읽는 관행이 있어 조회 한 번
실패가 곧 전체 삭제가 되기 때문이다.

개발 DB 에는 songs 표가 없어 확인이 안 되므로 시드 SQL 을 함께 둔다 —
걸러져야 할 다섯(칸타타·찬양팀·곡명이 「찬양」·곡명=찬양대·hidden)을 일부러 섞었다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 2: 서버 액션 `getTodaySong` · `logSongClick` · monitor

**Files:**
- Modify: `supabase/functions/api/index.ts` (switch 401~403 부근 · 액션 함수 · `monitor()` 반환)
- Create: `tests/song-smoke.sh`

**Interfaces:**
- Consumes: Task 1 의 `v2_today_song(date)` · `v2_song_click(uuid, text)` · 뷰 `v2_song_pool`
- Produces: 액션 `getTodaySong` → `{ ok:true, song: {id, song, choir, svc_date, duration, thumbnail} | null }` · 액션 `logSongClick` → `{ ok:true }` · `monitor()` 응답에 `songPool:number|null` · `songToday:boolean`

- [ ] **Step 1: 먼저 스모크 테스트를 쓴다(아직 실패한다)**

Create `tests/song-smoke.sh`:

```bash
#!/usr/bin/env bash
# 오늘의 찬양 — 읽기 전용 스모크. 기본은 개발 DB.
#   DEV_ANON=… bash tests/song-smoke.sh
#   SONG_ENV=prod PROD_ANON=… bash tests/song-smoke.sh
set -u
if [ "${SONG_ENV:-dev}" = "prod" ]; then
  BASE="https://xnomlgydifiqiybervtf.supabase.co/functions/v1/api"
  KEY="${PROD_ANON:?PROD_ANON 환경변수가 필요합니다}"
else
  BASE="https://ktpwthwqzgcqcrmsafdo.supabase.co/functions/v1/api"
  KEY="${DEV_ANON:?DEV_ANON 환경변수가 필요합니다}"
fi

call() {
  curl -s -X POST "$BASE" -H "Content-Type: application/json" \
    -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -d "$1"
}
jqn() { python -c '
import json, sys
d = json.load(sys.stdin)
print(eval(sys.argv[1]))
' "$1" <<< "$2"; }

pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then echo "  ✓ $1 = $2"; pass=$((pass+1));
        else echo "  ✗ $1 = $2  (기대 $3)"; fail=$((fail+1)); fi }

S=$(call '{"action":"getTodaySong"}')
echo "① 응답 모양"
chk "ok" "$(jqn 'd.get("ok")' "$S")" "True"
chk "song 키가 있다" "$(jqn '"song" in d' "$S")" "True"

SONG="$(jqn 'd.get("song")' "$S")"
if [ "$SONG" = "None" ]; then
  echo "  ℹ️ song=null — 후보가 없는 DB 다(개발에 시드를 안 넣었거나 거르개가 전부 걸렀다)."
  echo "     supabase/praise_songs_dev_seed.sql 을 먼저 돌렸는지 보세요."
else
  echo "② 곡 정보"
  chk "id 가 있다"     "$(jqn 'bool(d["song"].get("id"))' "$S")" "True"
  chk "곡명이 있다"    "$(jqn 'bool(d["song"].get("song"))' "$S")" "True"
  # ⚠️ 이 셋이 이 검사의 진짜 뜻이다 — 거르개가 실제로 돌았는가.
  chk "곡명이 「찬양」이 아니다"  "$(jqn 'd["song"]["song"].strip().strip(chr(39)+chr(34)) not in ("찬양","찬양과 경배","특송","")' "$S")" "True"
  chk "곡명 ≠ 찬양대 이름"       "$(jqn 'd["song"]["song"].strip() != (d["song"].get("choir") or "").strip()' "$S")" "True"
  chk "duration 은 \"m:ss\" 꼴"  "$(jqn 'bool(__import__("re").match(r"^\d+:\d\d$", d["song"].get("duration") or ""))' "$S")" "True"
  # ⚠️ 관리용 칸이 새지 않는가 — 뷰가 여섯 칸만 내보내므로 셀 수 있다.
  chk "응답에 관리용 칸이 없다"  "$(jqn 'set(d["song"]) <= {"id","song","choir","svc_date","duration","thumbnail"}' "$S")" "True"

  echo "③ 같은 날엔 같은 곡(두 번 불러 본다)"
  S2=$(call '{"action":"getTodaySong"}')
  chk "두 번째도 같은 곡" "$(jqn 'd["song"]["id"]' "$S2")" "$(jqn 'd["song"]["id"]' "$S")"
fi

echo "④ date 입력을 열지 않는다 — 쓰는 액션이기 때문"
F=$(call '{"action":"getTodaySong","date":"2030-01-01"}')
if [ "$SONG" != "None" ]; then
  chk "미래 날짜를 줘도 오늘 곡" "$(jqn 'd["song"]["id"]' "$F")" "$(jqn 'd["song"]["id"]' "$S")"
fi

echo
echo "통과 $pass · 실패 $fail"
[ "$fail" -eq 0 ]
```

- [ ] **Step 2: 실패하는 것을 확인한다**

```bash
cd /c/Projects/bible-memorize-church-app-v2 && DEV_ANON=sb_publishable_eJKP6u95IU9_DBXTvnvYBA_-yGCf-0Y bash tests/song-smoke.sh
```

Expected: FAIL — `ok = False` 또는 `알 수 없는 action` (액션이 아직 없다)

- [ ] **Step 3: 액션 둘을 만든다**

`supabase/functions/api/index.ts` — 위젯 절(`getTodayBlessing` 함수 뒤) 옆에 붙인다.

```ts
// ---------- 오늘의 찬양 (2026-09-23) ----------
//   찬양 아카이브의 songs 표를 **읽기 전용**으로 걸러(v2_song_pool) 하루 한 곡을
//   daily_song 에 적는다. 고르는 규칙은 SQL 쪽에 있다 — supabase/daily_song.sql.
//   ⚠️ **date 입력을 열지 않는다.** 위젯 셋(getWeeklyVerse·getTodayMeditation·
//      getTodayBlessing)은 widgetYmd(b) 로 date 를 받지만 그건 **읽기 전용**이라
//      안전했다(index.ts:644 주석). 이건 **쓰는** 액션이라, 같은 입력을 베끼면 인증 없는
//      호출 한 줄로 365일치 행을 미리 박아 성도님이 볼 곡을 태울 수 있다.
//      시험은 개발 DB 에 SQL 로 행을 넣어 한다.
//   ⚠️ 표·뷰·함수가 없거나 후보가 0이면 **오류가 아니라** { ok:true, song:null } 이다.
//      개발 DB 에는 songs 표가 아예 없고(PGRST205), 이 값을 기다리는 곳이 매일 묵상
//      팝업이라 여기서 던지면 **묵상 창이 통째로 안 뜬다.**
async function getTodaySong(_b: any) {
  const day = kstDay(new Date().toISOString());
  try {
    const { data, error } = await db.rpc("v2_today_song", { p_day: day });
    if (error) return { ok: true, song: null };
    const row = (data ?? [])[0];
    if (!row) return { ok: true, song: null };
    return {
      ok: true,
      song: {
        id: row.id, song: row.song, choir: row.choir,
        svc_date: row.svc_date, duration: row.duration, thumbnail: row.thumbnail,
      },
    };
  } catch { return { ok: true, song: null }; }
}

// 단추를 누른 것만 센다(재생 자체는 찬양 앱의 logPlay 가 이미 센다).
//   ⚠️ 응답에 user_id 를 싣지 않는다. 실패해도 조용히 ok 로 돌려준다 — 이걸로
//      성도님 화면이 막히면 안 된다.
async function logSongClick(b: any) {
  const uid = String(b.user_id || "");
  const sid = String(b.song_id || "");
  if (!uid || !sid) return { ok: true };
  try { await db.rpc("v2_song_click", { uid, sid }); } catch { /* 조용히 */ }
  return { ok: true };
}
```

- [ ] **Step 4: switch 에 두 줄을 더한다**

`index.ts:403`(`case "getTodayBlessing"`) **바로 뒤**에:

```ts
      case "getTodaySong":       return json(await getTodaySong(body));            // 오늘의 찬양 — 하루 한 곡
      case "logSongClick":       return json(await logSongClick(body));            // 오늘의 찬양 단추를 누른 횟수
```

- [ ] **Step 5: `monitor()` 에 정보 두 값을 싣는다**

`monitor()` 의 `return {` **바로 앞**에:

```ts
  // 오늘의 찬양 — ⚠️ 「오늘 행이 없다」를 problems 에 넣지 않는다. 오늘 행은 **첫 사용자가
  //   만든다** — monitor 는 07:12 KST 에 도는데, 그때까지 아무도 앱을 안 연 날마다 헛경보가 난다.
  //   정말 조용히 틀어지는 것은 **후보 수가 급감하는 것**이다(찬양 담당자가 구분 이름을 바꾸면
  //   오류 없이 곡 수만 준다 — 2026-07 에 기타→특별찬양으로 실제로 바뀌었다).
  let songPool: number | null = null;
  let songToday = false;
  try {
    const { count, error: pErr } = await db.from("v2_song_pool").select("id", { count: "exact", head: true });
    if (!pErr) songPool = count ?? 0;
    const { data: ds } = await db.from("daily_song").select("day").eq("day", kstDay(new Date().toISOString())).maybeSingle();
    songToday = !!ds;
    if (songPool !== null && songPool < 100) {
      problems.push(`오늘의 찬양 후보가 ${songPool}곡뿐입니다 — songs 의 category 이름이 바뀌었을 수 있습니다(supabase/daily_song.sql 의 ② 질의로 확인)`);
    }
  } catch (_) { /* 표 미설치 → 점검 생략 */ }
```

그리고 반환 객체에 `songPool,` 과 `songToday,` 두 줄을 `activity,` 뒤에 더한다.

- [ ] **Step 6: 개발에 배포한다**

```bash
cd /c/Projects/bible-memorize-church-app-v2
git status --short                                    # ⚠️ 남의 미커밋 변경이 함께 나간다
git diff supabase/functions/api/index.ts | head -80    # ⚠️ 내 헝크만 있는지 눈으로
supabase functions deploy api --no-verify-jwt --project-ref ktpwthwqzgcqcrmsafdo
```

- [ ] **Step 7: 스모크가 통과하는지 본다**

```bash
cd /c/Projects/bible-memorize-church-app-v2 && DEV_ANON=sb_publishable_eJKP6u95IU9_DBXTvnvYBA_-yGCf-0Y bash tests/song-smoke.sh
```

Expected: `통과 9 · 실패 0` (곡이 없으면 `song=null` 안내가 뜨고 ①만 통과 — 그때는 Task 1 의 시드를 먼저 확인)

- [ ] **Step 8: 배포가 남의 것을 안 깼는지 확인한다**

```bash
K=sb_publishable_eJKP6u95IU9_DBXTvnvYBA_-yGCf-0Y
B=https://ktpwthwqzgcqcrmsafdo.supabase.co/functions/v1/api
for A in getVerses monitor; do
  echo "--- $A"; curl -s -X POST "$B" -H "Content-Type: application/json" -H "apikey: $K" \
    -H "Authorization: Bearer $K" -d "{\"action\":\"$A\"}" | head -c 160; echo
done
```

Expected: 둘 다 `{"ok":true…` — `monitor` 응답에 `"songPool":` 이 보인다.

- [ ] **Step 9: 커밋**

```bash
cd /c/Projects/bible-memorize-church-app-v2
git add supabase/functions/api/index.ts tests/song-smoke.sh
git diff --cached --stat        # ⚠️ 이 둘만 있어야 한다
git commit -F - <<'EOF'
feat(오늘의 찬양): 서버 — getTodaySong·logSongClick, monitor 에 후보 수

date 입력을 열지 않는다 — 위젯 셋과 달리 이건 쓰는 액션이라, 같은 입력을 베끼면
인증 없는 호출 한 줄로 365일치를 미리 박아 성도님이 볼 곡을 태울 수 있다.

표·뷰가 없거나 후보가 0이면 오류가 아니라 song:null 이다. 개발 DB 에는 songs 가
아예 없고, 이 값을 기다리는 곳이 매일 묵상 팝업이라 여기서 던지면 묵상 창이 통째로 안 뜬다.

monitor 는 「오늘 행이 없다」를 경보로 삼지 않는다(첫 사용자가 만드는 값이라 아침
07:12 에는 대개 없다). 후보 수가 100 아래로 떨어질 때만 알린다 — 찬양 담당자가
구분 이름을 바꾸면 오류 없이 곡 수만 주는데, 그것을 알아챌 길이 이것뿐이다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 3: 앱 배관 — api.js · 게이트 · 캐시 · withTimeout

**Files:**
- Modify: `js/api.js` (`api` 객체 끝)
- Modify: `app.js` (`psalmVisible` 블록 뒤 · `routeAfterLoad`)

**Interfaces:**
- Consumes: Task 2 의 `getTodaySong`·`logSongClick`
- Produces: `api.getTodaySong()` · `api.logSongClick(user_id, song_id)` · `songVisible(): boolean` · `refreshSongPublic(): void` · `songCacheToday(): object|null` · `songCachePut(song): void` · `withTimeout(promise, ms): Promise` · `loadTodaySong(): void` · `fetchTodaySong(): Promise<object|null>`

- [ ] **Step 1: `js/api.js` 에 두 줄을 더한다**

`eventSave:` 줄 **뒤**, 닫는 `};` **앞**:

```js

  // ---- 오늘의 찬양 (2026-09-23) ----
  //  ⚠️ getTodaySong 은 입력이 없다 — 날짜를 열면 쓰는 액션이라 미리 태울 수 있다(서버 주석 참고).
  getTodaySong: () => supaCall("getTodaySong", {}),
  logSongClick: (user_id, song_id) => supaCall("logSongClick", { user_id, song_id }),
```

- [ ] **Step 2: `app.js` 에 게이트·캐시·프리페치를 더한다**

`psalmVisible()`(app.js:307) **바로 다음 줄**에 통째로 붙인다.

```js

// ── 오늘의 찬양: 하루 한 곡 ────────────────────────────────────────
//   ⚠️ 「자료 자체가 게이트」가 성립하지 않는다 — songs 는 운영에 이미 1,700곡이 있어
//      자료가 비는 순간이 없다. push 가 곧 배포인 저장소라 게이트 없이 푸시하면 그 순간
//      전 성도에게 열린다(2026-09-10 에 시편 액자가 남의 커밋에 딸려 나가 첫 화면에 떴다).
//      psalmPublic 과 같은 방식이다 — 첫 화면은 동기 렌더라 미리 받아 둔 값을 본다.
let _songPreview = false;
function getSongPreview() {
  try {
    if (new URLSearchParams(location.search).get("song") === "1") {
      history.replaceState(null, "", location.pathname);
      return true;
    }
  } catch (e) {}
  return false;
}
const SONG_PUB_KEY = "song-public";
function songPublicCached() { try { return localStorage.getItem(SONG_PUB_KEY) === "1"; } catch (e) { return false; } }
function refreshSongPublic() {
  if (!window.api || !api.getConfig) return;
  api.getConfig("songPublic").then((d) => {
    try { localStorage.setItem(SONG_PUB_KEY, d && d.value ? "1" : "0"); } catch (e) {}
  }).catch(() => {});
}
function songVisible() { return _songPreview || songPublicCached(); }

// 오늘치 캐시 — 하루 한 곡이고 모두가 같은 곡이라 어긋날 일이 없다.
//   ⚠️ 열쇠는 **한국 날짜**다. UTC 로 두면 밤에 캐시가 하루 일찍 만료된다.
function songDayKey() {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return "song-" + d.toISOString().slice(0, 10);
}
function songCacheToday() {
  try { return JSON.parse(localStorage.getItem(songDayKey()) || "null"); } catch (e) { return null; }
}
function songCachePut(song) {
  try {
    localStorage.setItem(songDayKey(), JSON.stringify(song));
    // 어제 것들을 치운다(열쇠가 날마다 달라 그냥 두면 쌓인다)
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith("song-2") && k !== songDayKey()) localStorage.removeItem(k);
    }
  } catch (e) {}
}

// ⚠️ 이 저장소에는 타임아웃 헬퍼가 없다(js/api.js 에도 없다) — 여기서 만든다.
//    느린 통신에서 묵상 창이 이 왕복만큼 늦게 뜨는 것을 막는 것이 목적이다.
function withTimeout(p, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

// 오늘 곡 하나 — 캐시가 있으면 서버를 안 친다.
//   ⚠️ 부르는 쪽이 둘(첫 화면·묵상 창)이지만 **왕복은 하루 한 번**이어야 한다.
//      첫 화면이 먼저 그려지므로 대개 첫 화면이 채우고 묵상 창은 캐시를 쓴다.
function fetchTodaySong() {
  if (!songVisible() || !window.api || !api.getTodaySong) return Promise.resolve(null);
  const cached = songCacheToday();
  if (cached) return Promise.resolve(cached);
  return withTimeout(api.getTodaySong(), 1500)
    .then((r) => {
      const s = r && r.song;
      if (s) songCachePut(s);
      return s || null;
    })
    .catch(() => null);   // ⚠️ 반드시 삼킨다 — 묵상 창이 이 리젝션에 통째로 사라진다
}
```

- [ ] **Step 3: `routeAfterLoad` 에서 게이트를 켠다**

`app.js:119-121` 을 아래처럼 바꾼다(`_songPreview` 와 `refreshSongPublic()` 두 줄이 는다).

```js
  _passagesPreview = getPassagesPreview();
  _psalmPreview = getPsalmPreview();
  _songPreview = getSongPreview();
  refreshPassagesPublic();
  refreshPsalmPublic();
  refreshSongPublic();
  refreshMinistryPeriod();
  refreshEventOpen();
```

- [ ] **Step 4: 문법을 확인한다**

```bash
cd /c/Projects/bible-memorize-church-app-v2 && node --check app.js && node --check js/api.js && echo OK
```

Expected: `OK`

- [ ] **Step 5: 게이트가 꺼진 채로는 서버를 안 치는지 확인한다**

```bash
cd /c/Projects/bible-memorize-church-app-v2 && python -m http.server 8000 &
```

브라우저에서 `http://localhost:8000/` 을 열고 개발자도구 Network 에서 `functions/v1/api` 요청을 본다.

Expected: `getTodaySong` 요청이 **없다**(게이트가 꺼져 있다). `?song=1` 로 들어가면 **있다**.

- [ ] **Step 6: 커밋**

```bash
cd /c/Projects/bible-memorize-church-app-v2
git add js/api.js
git diff app.js > /tmp/song-t3.patch && git apply --cached /tmp/song-t3.patch
git diff --cached --stat        # ⚠️ js/api.js · app.js 둘만
git commit -F - <<'EOF'
feat(오늘의 찬양): 앱 배관 — 게이트·하루치 캐시·타임아웃

songVisible() 은 psalmVisible() 과 같은 꼴이다(?song=1 미리보기 + app_config 캐시).
게이트가 꺼져 있으면 서버를 아예 안 친다 — 자동 팝업은 로그인 직후 도는 경로라
왕복 하나가 첫 화면 체감 속도를 그대로 먹는다.

withTimeout 은 이 저장소에 없어서 새로 만들었다(js/api.js 에 타임아웃이 없다).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 4: 첫 화면 단추

**Files:**
- Modify: `app.js` (`renderSummary` 의 「함께」 묶음 · 이벤트 붙이는 자리)
- Modify: `style.css` (`.ext-mark` 선택자 확장)
- Modify: `tools/screen-sweep.py` (리셋 스크립트 81줄)

**Interfaces:**
- Consumes: Task 3 의 `songVisible()` · `fetchTodaySong()` · `songCacheToday()` · `api.logSongClick`
- Produces: `openSongToday(song)` — 클릭 기록 + 새 탭 열기 (Task 5 도 이 함수를 쓴다)

- [ ] **Step 1: 「함께」 묶음에 한 줄을 더한다**

`app.js:2109`(`open-psalm` 줄) **바로 뒤**, 주석 블록 **앞**에:

```js
    ${songVisible() ? `<button class="summary-help" id="open-song">🎵 찬양${songBtnSuffix()}<span class="ext-mark">↗</span>${newBadge("song")}</button>` : ""}
```

- [ ] **Step 2: 곡명을 넣는 헬퍼와 채우는 함수를 만든다**

Task 3 에서 더한 블록 **끝**에 이어 붙인다.

```js
// 첫 화면 단추 글자 — 캐시가 있으면 곡명까지, 없으면 「🎵 찬양」만.
//   ⚠️ 단추를 **나중에 생기게 하지 않는다.** 묶음 안에서 줄이 하나 늘면 성도님이 누르려던
//      자리가 밀린다. 자리는 처음부터 두고 글자만 채운다(renderEventButton 과 같은 생각).
function songBtnSuffix() {
  const s = songCacheToday();
  return s && s.song ? " · " + boardEsc(s.song) + " " : " ";
}
function fillSongButton() {
  const b = document.getElementById("open-song");
  if (!b) return;
  const s = songCacheToday();
  if (!s || !s.song) return;
  b.innerHTML = "🎵 찬양 · " + boardEsc(s.song) + ' <span class="ext-mark">↗</span>' + newBadge("song");
}
function loadTodaySong() {
  if (!songVisible()) return;
  fetchTodaySong().then((s) => { if (s) fillSongButton(); });
}
// 찬양 아카이브(형제 앱)의 그 곡으로 — 새 탭이라 암송 진행 상태를 잃지 않는다.
//   ⚠️ 아이폰 앱에서는 Capacitor 가 가로채 사파리로 나간다(설계 문서 「대신 잃는 것」).
//   ⚠️ 내 id 는 `myUserId()`(app.js:3009)로 얻는다. `loadUser()` 가 돌려주는 객체의 칸 이름은
//      `id` 가 아니라 **`user_id`** 다 — 직접 꺼내 쓰면 조용히 undefined 가 되어 기록이 안 쌓인다.
function openSongToday(song) {
  if (!song || !song.id) return;
  try {
    const uid = (typeof myUserId === "function") ? myUserId() : null;
    if (uid && api.logSongClick) api.logSongClick(uid, song.id).catch(() => {});
  } catch (e) {}
  window.open("https://worship.onlybible.kr/?song=" + encodeURIComponent(song.id), "_blank", "noopener");
}
```

- [ ] **Step 3: 이벤트를 붙이고 채우기를 부른다**

`app.js:2165`(`open-praise` 리스너) **바로 앞**에:

```js
  { const b = document.getElementById("open-song");   // 게이트가 꺼져 있으면 없다
    if (b) b.addEventListener("click", () => openSongToday(songCacheToday())); }
  loadTodaySong();   // 캐시가 없으면 받아서 곡명을 채운다
```

- [ ] **Step 4: `.ext-mark` 가 묵상 창에서도 먹게 한다**

`style.css:4167` 을 바꾼다. ⚠️ 지금은 `.summary-help .ext-mark` 로만 정의돼 있어 묵상 창 CTA 에서는 아무 스타일도 안 붙는다.

```css
.summary-help .ext-mark, .med-song-cta .ext-mark { font-size: .82rem; opacity: .7; }
```

- [ ] **Step 5: `FEAT_SINCE` 에 자리를 만든다**

`app.js:1372`(`psalm:` 줄) 뒤에. ⚠️ **날짜는 게이트를 켜는 날 친구가 채운다** — 지금 넣으면 안 보이는 기능에 NEW 가 붙는다.

```js
  // ⚠️ 오늘의 찬양 — 게이트를 켜는 날(9/27 이후)의 날짜로 바꾼다. 빈 문자열이면 NEW 가 안 뜬다.
  song: "",
```

- [ ] **Step 6: screen-sweep 리셋에 미리보기를 더한다**

`tools/screen-sweep.py:81` 을 바꾼다.

```python
        "try{ _psalmPreview=true; _passagesPreview=true; _songPreview=true; localStorage.setItem('event-open','1'); }catch(e){}"
```

- [ ] **Step 7: 문법·preflight 를 본다**

```bash
cd /c/Projects/bible-memorize-church-app-v2 && node --check app.js && python tools/preflight.py
```

Expected: `node --check` 조용히 통과 · preflight 는 캐시태그 항목만 지적할 수 있다(아직 bump 를 안 했으므로 정상)

- [ ] **Step 8: localhost 에서 눈으로 본다**

`http://localhost:8000/?song=1` 로 들어가 로그인한 뒤 첫 화면을 본다.

Expected: 「함께」 묶음의 🐑 쉴만한 물가 아래에 **`🎵 찬양 · <곡명> ↗`** 한 줄. 눌러서 `worship.onlybible.kr` 이 새 탭으로 열린다(아직 딥링크가 없어 홈이 뜬다 — Task 6 에서 고친다).

- [ ] **Step 9: 8조건 화면 점검**

```bash
cd /c/Projects/bible-memorize-church-app-v2 && python tools/screen-sweep.py
```

Expected: `01-summary` 가 8조건 전부 찍히고, 320px·아주 큰 글씨에서 새 단추의 곡명이 안 넘친다. ⚠️ 읽을 것 `docs/notes/capture-tools.md`

- [ ] **Step 10: 커밋**

```bash
cd /c/Projects/bible-memorize-church-app-v2
git add tools/screen-sweep.py
git diff app.js style.css > /tmp/song-t4.patch && git apply --cached /tmp/song-t4.patch
git diff --cached --stat
git commit -F - <<'EOF'
feat(오늘의 찬양): 첫 화면 「함께」 묶음에 한 줄

색은 「더 보기」의 아카이브 둘과 같은 옷 + ↗ 다. .ext-cta(흰 바탕 회색선)를 쓰지 않는다 —
2026-09-10 에 성도님이 「모두 동일하게」로 정하셔서 뗀 규칙이고, 실제 선택자도
.summary-help.ext-cta 라 다른 데선 안 먹는다.

곡명은 캐시가 있으면 즉시, 없으면 받아서 채운다. 단추 자체는 처음부터 둔다 —
묶음 안에서 줄이 나중에 늘면 성도님이 누르려던 자리가 밀린다.

screen-sweep 리셋에 _songPreview 를 더했다. 안 더하면 게이트가 꺼진 동안
새 단추가 01-summary 스윕에 아예 안 그려져 8조건 점검을 못 받는다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 5: 매일 묵상 창 CTA

**Files:**
- Modify: `app.js` (`maybeShowWeeklyMeditation` 프리페치 · `showMeditationModal` 시그니처·HTML·이벤트)
- Modify: `style.css` (`.med-psalm-cta` 규칙 뒤에 `.med-song-cta`)

**Interfaces:**
- Consumes: Task 3 의 `fetchTodaySong()` · Task 4 의 `openSongToday(song)`
- Produces: `showMeditationModal(items, startIdx, verse, sermon, showTabs, usingPrev, extra)` — 일곱째 인자가 `todayPsalm` 에서 **`{ psalm, song }` 객체**로 바뀐다

- [ ] **Step 1: 프리페치를 나란히 돌린다**

`app.js:6405-6412` 를 바꾼다.

```js
    const fetchPsalm = (psalmVisible() && typeof loadPsalmVerses === "function")
      ? loadPsalmVerses().then(() => psalmToday()).catch(() => null)
      : Promise.resolve(null);
    // ⚠️ 시편과 **나란히** 받는다. 체인으로 이으면 시편이 끝난 뒤에야 찬양을 요청해
    //    창이 두 번 늦게 뜬다 — 깜빡임을 피하려다 더 나쁜 지연을 만든다.
    // ⚠️ fetchTodaySong 은 캐시가 있으면 서버를 안 친다(첫 화면이 대개 먼저 채운다).
    //    실패는 그 안에서 삼킨다 — 여기서 새면 바깥 catch 에 걸려 **묵상 창이 통째로 안 뜬다.**
    const fetchSong = fetchTodaySong();
    Promise.all([fetchPsalm, fetchSong]).then(([todayPsalm, todaySong]) => {
      // 자동 팝업·어드민 미리보기는 '오늘 것 하나만'. 요일 탭은 매일 묵상 버튼으로 열 때만.
      showMeditationModal(items, pick, verse, sermon, !!withTabs, usingPrev, { psalm: todayPsalm, song: todaySong });
    });
```

- [ ] **Step 2: `showMeditationModal` 시그니처를 객체로 바꾼다**

`app.js:6420` 을 바꾸고 바로 아래에 풀어 쓴다. ⚠️ 인자가 이미 일곱이라 **여덟째를 늘리지 않는다** — 자리 하나를 빠뜨리면 조용히 `undefined` 가 된다.

```js
function showMeditationModal(items, startIdx, verse, sermon, showTabs, usingPrev, extra) {
  const todayPsalm = extra && extra.psalm;
  const todaySong = extra && extra.song;
```

- [ ] **Step 3: CTA 한 줄을 그린다**

`app.js:6444`(시편 CTA 줄) **바로 뒤**:

```js
        ${todaySong ? `<button class="med-song-cta" id="med-song">🎵 찬양 · ${boardEsc(todaySong.song)} <span class="ext-mark">↗</span></button>` : ""}
```

- [ ] **Step 4: 이벤트를 붙인다**

`app.js` 의 `#med-psalm` 리스너 **바로 뒤**:

```js
    const gBtn = wrap.querySelector("#med-song");     // 묵상 → 오늘의 찬양(찬양 아카이브)
    if (gBtn) gBtn.addEventListener("click", () => {
      done();                                        // ⚠️ close() 가 아니다
      openSongToday(todaySong);                      // 새 탭이라 setTimeout 이 필요 없다
    });
```

> ⚠️ **`done()` 을 부른다.** `wireModalConfirm`(app.js:934)이 문서 **캡처 단계**에 keydown 리스너를 걸어 두고 `done()` 만 그걸 뗀다 — `close()` 를 부르면 그 뒤로 Enter·Space·Escape 가 통째로 먹히고 리스너가 영영 남는다.

- [ ] **Step 5: CSS 를 더한다**

`style.css` 의 `.dark .med-psalm-cta:hover` 줄 **바로 뒤**:

```css
/* 오늘의 찬양 — 시편 CTA 와 나란히 선다. 같은 옷을 입히고 구분은 이모지와 ↗ 가 맡는다.
   ⚠️ 새 색을 만들지 않는다 — 색을 하나 늘릴 때마다 나머지가 그만큼 흐려진다
      (docs/notes/home-screen.md ⑤).
   ⚠️ white-space:nowrap 을 주지 않는다 — 바로 위 .med-psalm-cta 가 「잘리게 두느니
      두 줄이 낫다」로 정해져 있고, 나란히 선 두 줄이 서로 다른 규칙을 따르면 안 된다.
      곡명은 refShort 보다 길다(스냅샷 기준 최장 31자). */
.med-song-cta {
  display: block; width: 100%; margin: 8px 0 0; padding: 12px 10px;
  border-radius: 12px; cursor: pointer; font-family: inherit;
  font-size: .95rem; font-weight: 800; text-align: center;
  background: #eef1f8; color: var(--navy); border: 1.5px solid var(--navy);
}
.med-song-cta:hover { background: var(--navy); color: #fff; }
.dark .med-song-cta { background: #232c3f; color: #cdd9f2; border-color: #3a4a68; }
.dark .med-song-cta:hover { background: #3a4a68; color: #fff; }
```

- [ ] **Step 6: 문법을 확인한다**

```bash
cd /c/Projects/bible-memorize-church-app-v2 && node --check app.js && grep -c "med-song-cta" style.css
```

Expected: `node --check` 통과 · `med-song-cta` 가 **5** (⚠️ `.ext-mark` 줄까지 세면 6 — Task 4 Step 4 를 했으면 6)

- [ ] **Step 7: 묵상 창이 여전히 뜨는지 본다 — 두 경우로**

`http://localhost:8000/?song=1` 에서:

1. 로그인 → 첫 화면에서 **🌿 매일 묵상** 을 누른다.
   Expected: 창이 뜨고 맨 아래에 `🐑 쉴만한 물가` 와 `🎵 찬양 · <곡명> ↗` **둘 다** 보인다.
2. 개발자도구 Network 에서 `getTodaySong` 을 **차단**(block request URL)한 뒤 다시 연다.
   Expected: **창은 그대로 뜨고** 찬양 줄만 없다. ⚠️ 창이 안 뜨면 `.catch` 가 새는 것이다.

- [ ] **Step 8: 8조건 점검 — 묵상 창까지**

```bash
cd /c/Projects/bible-memorize-church-app-v2 && python tools/screen-sweep.py
```

Expected: `15-meditation` 이 8조건 전부 찍히고 **320px · 아주 큰 글씨 · 요일 탭 켠 상태**에서 두 CTA 가 다 보인다. ⚠️ 접혀서 안 보이면 설계의 「첫 화면에도 두는 이유」가 확인된 것이고, 그래도 첫 화면 단추가 있으니 진행한다.

- [ ] **Step 9: 커밋**

```bash
cd /c/Projects/bible-memorize-church-app-v2
git diff app.js style.css > /tmp/song-t5.patch && git apply --cached /tmp/song-t5.patch
git diff --cached --stat
git commit -F - <<'EOF'
feat(오늘의 찬양): 매일 묵상 창 맨 아래 CTA

시편 자료와 **나란히**(Promise.all) 받는다 — 체인으로 이으면 시편이 끝난 뒤에야
찬양을 요청해 창이 두 번 늦게 뜬다. 실패는 fetchTodaySong 안에서 삼킨다: 여기서
새면 바깥 catch 에 걸려 묵상 창이 통째로 안 뜨는데, 「오늘 봤다」 도장은 fetch 보다
먼저 찍혀 있어 그날 다시 뜨지도 않는다.

showMeditationModal 의 일곱째 인자를 { psalm, song } 객체로 바꿨다 — 인자가 이미
일곱이라 여덟째를 늘리면 자리 하나를 빠뜨렸을 때 조용히 undefined 가 된다.

CTA 는 close() 가 아니라 done() 으로 닫는다 — wireModalConfirm 이 문서 캡처 단계에
걸어 둔 keydown 리스너를 done() 만 뗀다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 6: 찬양 앱에 `?song=<id>` 딥링크 (형제 저장소)

**Files:**
- Modify: `c:\Projects\praise-songs\app.js` (`init()` 안, `apply()` 뒤)

**Interfaces:**
- Consumes: 암송 앱이 여는 주소 `https://worship.onlybible.kr/?song=<유튜브 id>`
- Produces: 그 곡 하나만 담은 플레이어

- [ ] **Step 1: `init()` 에 딥링크 처리를 더한다**

`c:\Projects\praise-songs\app.js` 의 `renderHome(); renderControls(); apply();` **바로 뒤**:

```js
    // ── 딥링크 ?song=<유튜브 id> — 성경암송 앱의 「오늘의 찬양」이 이리로 보낸다 ──
    //   ⚠️ 전체(ALL)에서 찾는다. VIEW 는 화면 필터가 걸린 목록이라 거기서 찾으면
    //      필터 밖의 곡을 영영 못 연다.
    //   ⚠️ 큐에 **그 한 곡만** 넣는다 — updateNav 가 이전·다음을 잠그고 onEnded 도
    //      아무것도 안 해서, 끝나면 조용히 멈춘다. 더 듣고 싶으신 분은 플레이어를 닫으면
    //      바로 목록이 있다.
    //   ⚠️ 못 찾으면 아무것도 안 한다(그냥 홈이 보인다) — 담당자가 숨겼거나 지운 곡이다.
    try {
      const wantSong = new URLSearchParams(location.search).get("song");
      if (wantSong) {
        const si = ALL.findIndex((s) => s.id === wantSong);
        if (si >= 0) openPlayer(si, [ALL[si]]);
      }
    } catch (e) {}
```

- [ ] **Step 2: 문법을 확인한다**

```bash
cd /c/Projects/praise-songs && node --check app.js && echo OK
```

Expected: `OK`

- [ ] **Step 3: localhost 에서 확인한다**

```bash
cd /c/Projects/praise-songs && python -m http.server 8001 &
```

`http://localhost:8001/?song=YkJgzSWSo2I` 로 들어간다(`praise.json` 에 있는 id 아무거나).

Expected: 목록이 그려진 뒤 **플레이어가 저절로 열리고** 그 곡이 보인다. 이전·다음 단추는 회색(잠김). 없는 id(`?song=zzzz`)로 들어가면 **홈만** 보인다.

- [ ] **Step 4: 캐시태그를 올리고 커밋한다**

⚠️ 그쪽 저장소의 규칙을 따른다 — `c:\Projects\praise-songs\CLAUDE.md` 의 「백엔드 URL이나 캐시 태그를 바꿀 때는 관련 파일을 전부 함께 갱신」.

```bash
cd /c/Projects/praise-songs
grep -n 'app\.js?v=' index.html      # 지금 태그를 본다 → 한 단계 올린다
```

태그를 올린 뒤:

```bash
cd /c/Projects/praise-songs
git add app.js index.html
git diff --cached --stat
git commit -F - <<'EOF'
feat(딥링크): ?song=<id> 로 그 곡 하나를 바로 연다

성경암송 앱의 「오늘의 찬양」이 이리로 보낸다. 전체(ALL)에서 찾고 큐에는 그 한 곡만
넣는다 — 끝나면 조용히 멈추고, 더 들으실 분은 플레이어를 닫으면 바로 목록이 있다.
못 찾으면 아무것도 안 한다(담당자가 숨겼거나 지운 곡).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

- [ ] **Step 5: 배포한다**

그쪽 저장소의 배포 흐름(GitHub Pages)에 따라 푸시한다. 배포 뒤 확인:

```bash
curl -s "https://worship.onlybible.kr/app.js?v=$(curl -s https://worship.onlybible.kr/ | grep -o 'app.js?v=[0-9a-z.]*' | head -1 | cut -d= -f2)" | grep -c 'wantSong'
```

Expected: `1` — 이전 판에는 없던 이름이라 배포가 실제로 됐다는 뜻이다. ⚠️ **이전 판에도 있던 이름으로 검사하면 CDN 이 옛 파일을 내보내도 통과해 「배포 완료」로 오인한다.**

---

## Task 7: 운영 반영 (게이트는 끈 채)

**Files:** 없음 — 배포·확인만 한다.

- [ ] **Step 1: 친구께 운영 SQL 실행을 부탁한다**

> 친구, 운영 Supabase(`xnomlgydifiqiybervtf`) SQL Editor 에서 **`supabase/daily_song.sql` 하나만** 돌려 주세요.
> ⚠️ `praise_songs_dev_seed.sql` 은 **절대 돌리지 마세요** — 운영에는 `songs` 가 이미 있고 1,700곡이 들어 있습니다.
>
> 돌린 뒤 이 둘을 확인해 주세요:
> ```sql
> select count(*) from public.v2_song_pool;      -- 1,500 안팎이면 정상
> select * from public.v2_today_song(current_date);
> ```

- [ ] **Step 2: 후보 수가 예상대로인지 본다**

Expected: **1,500~1,700 사이.** ⚠️ 그보다 훨씬 적으면 `category` 이름이 또 바뀐 것이다 — `supabase/daily_song.sql` 끝의 ② 질의로 실제 값을 확인하고 뷰를 고친다.

- [ ] **Step 3: 운영 공개 키 점검 셋**

```bash
K="sb_publishable_oLtieT_jw7Gjb8etEsy0jw_thBaDjl-"
B="https://xnomlgydifiqiybervtf.supabase.co"
for P in "daily_song?select=*&limit=1" "song_click_log?select=*&limit=1" "v2_song_pool?select=*&limit=1"; do
  echo "--- $P"; curl -s "$B/rest/v1/$P" -H "apikey: $K" | head -c 200; echo
done
echo "--- rpc"; curl -s -X POST "$B/rest/v1/rpc/v2_today_song" -H "apikey: $K" \
  -H "Content-Type: application/json" -d '{"p_day":"2026-09-23"}' | head -c 200; echo
```

Expected: 넷 모두 **행이 오면 안 된다.**

- [ ] **Step 4: 운영 Edge Function 을 배포한다**

```bash
cd /c/Projects/bible-memorize-church-app-v2
git status --short                                    # ⚠️ 남의 미커밋 변경이 함께 나간다
git diff supabase/functions/api/index.ts               # ⚠️ 비어 있어야 한다(이미 커밋됨)
supabase functions deploy api --no-verify-jwt --project-ref xnomlgydifiqiybervtf
```

- [ ] **Step 5: 운영 스모크**

```bash
cd /c/Projects/bible-memorize-church-app-v2 && SONG_ENV=prod PROD_ANON=sb_publishable_oLtieT_jw7Gjb8etEsy0jw_thBaDjl- bash tests/song-smoke.sh
```

Expected: `통과 9 · 실패 0`

- [ ] **Step 6: 남의 것이 안 깨졌는지 본다**

```bash
K=sb_publishable_oLtieT_jw7Gjb8etEsy0jw_thBaDjl-
B=https://xnomlgydifiqiybervtf.supabase.co/functions/v1/api
for A in getVerses monitor; do
  echo "--- $A"; curl -s -X POST "$B" -H "Content-Type: application/json" -H "apikey: $K" \
    -H "Authorization: Bearer $K" -d "{\"action\":\"$A\"}" | head -c 200; echo
done
```

Expected: 둘 다 `{"ok":true…` · `monitor` 에 `"songPool":1500` 안팎.

- [ ] **Step 7: 프런트를 배포한다**

```bash
cd /c/Projects/bible-memorize-church-app-v2
python tools/preflight.py        # 통과해야 한다
python tools/bump.py             # ⚠️ 이 한 번이 캐시태그·판번호·APP_BUILD 를 함께 올린다
git add index.html app.js style.css js/*.js
git diff --cached --stat
git commit -F - <<'EOF'
chore: bump — 오늘의 찬양 (게이트 꺼진 채 배포)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
git push
```

> ⚠️ **`bump.py` 를 안 돌리면 preflight 가 못 잡는다** — preflight 는 `?v=` 들끼리와 `APP_BUILD` 의 **내부 일치**만 본다. 안 올려도 셋이 여전히 일치하므로 **통과하고 배포도 성공한다.** 그러면 `.med-song-cta` CSS 는 style.css 에만 있고 CSS 에는 자가복구 장치가 없어서, 캐시가 옛것이면 묵상 창에 **테두리도 색도 없는 맨 브라우저 단추**가 뜬다.

- [ ] **Step 8: 배포를 「이번 판에만 있는 표식」으로 확인한다**

```bash
cd /c/Projects/bible-memorize-church-app-v2
V=$(grep -o 'app.js?v=[0-9a-z]*' index.html | head -1 | cut -d= -f2)
curl -s "https://gocheok.onlybible.kr/app.js?v=$V" | grep -o 'APP_BUILD = "[0-9a-z]*"'
curl -s "https://gocheok.onlybible.kr/app.js?v=$V" | grep -c 'songVisible'
```

Expected: `APP_BUILD` 가 `?v=` 와 같고, `songVisible` 이 **1 이상**. ⚠️ 이전 판에도 있던 이름으로 검사하면 CDN 이 옛 파일을 내보내도 통과해 「배포 완료」로 오인한다(2026-08-25 에 두 번 그랬다).

- [ ] **Step 9: 운영에서 게이트가 꺼져 있는지 확인한다**

`https://gocheok.onlybible.kr/` 을 연다.

Expected: 「함께」 묶음에 **🎵 찬양 줄이 없다.** 있으면 `app_config.songPublic` 이 이미 `true` 인 것이다.

`https://gocheok.onlybible.kr/?song=1` 로 들어간다.

Expected: **보인다.** 눌러서 찬양 앱의 그 곡이 열린다.

- [ ] **Step 10: 남은 것을 친구께 넘긴다**

> 친구, 여기까지 끝났습니다. **성도님께는 아직 안 보입니다**(게이트가 꺼져 있습니다).
> `https://gocheok.onlybible.kr/?song=1` 로 들어가시면 친구만 보실 수 있어요.
>
> **9/27 플레이스토어 프로덕션 승인을 확인하신 뒤** 이 셋을 하면 열립니다.
> 1. 운영 SQL Editor: `insert into app_config(key, value) values ('songPublic', 'true'::jsonb) on conflict (key) do update set value = excluded.value, updated_at = now();`
> 2. `app.js` 의 `FEAT_SINCE` 에서 `song: ""` → 그날 날짜(예 `song: "2026-09-28"`)
> 3. `python tools/bump.py` → 푸시
>
> 그리고 **2주 뒤** `supabase/daily_song.sql` 끝의 ⑤ 질의로 쓰임을 재면 됩니다.

---

## Self-Review

**1. 설계 문서 대조 — 빠진 것이 있나**

| 설계 절 | 어느 작업이 | |
|---|---|---|
| ① 진입점 둘 · 색 · 문구 | Task 4(첫 화면) · Task 5(묵상 창) | ✅ |
| ① 첫 화면 캐시·나중에 채우기 | Task 3(캐시) · Task 4(`fillSongButton`) | ✅ |
| ② 찬양 앱 `?song=` 딥링크 | Task 6 | ✅ |
| ③ 표 둘 · 뷰 · 함수 · RLS·revoke | Task 1 | ✅ |
| ③ `getTodaySong`·`logSongClick` | Task 2 | ✅ |
| ④ 프리페치 `Promise.all`·타임아웃·catch | Task 3(`fetchTodaySong`) · Task 5(Step 1) | ✅ |
| ④ 게이트 `songVisible` · screen-sweep | Task 3(Step 2·3) · Task 4(Step 6) | ✅ |
| ④ 묵상 창 `done()` | Task 5(Step 4) | ✅ |
| ⑤ 만드는 순서 1~9 | Task 1(1·2) · Task 2(3) · Task 7(4~9) | ✅ |
| ⑤ monitor | Task 2(Step 5) | ✅ |
| ⑥ 확인 목록 다섯 + 공개 키 점검 셋 | Task 1(Step 6) · Task 2(Step 7) · Task 4(Step 8·9) · Task 5(Step 7·8) · Task 6(Step 3) · Task 7(Step 3·5) | ✅ |
| ⑦ 안 하는 것 | 계획에 없음(의도된 것) | ✅ |
| ⑧ `.home-fab` 업데이트 배너 | **이번 계획에 없다** — 설계가 「범위 밖」으로 적었다 | ⚪ |

⚠️ **설계 ⑥ 의 「안드로이드 크롬·아이폰 사파리에서 딥링크 자동재생」은 Task 6 Step 3(localhost)까지만 덮는다.** 실기기 확인은 Task 6 배포 뒤 친구가 한다 — 계획에 넣지 않은 이유는, 그 확인이 **웹 배포만으로 되는 일**이라 누구나 주소 하나로 할 수 있기 때문이다(Mac·TestFlight 가 필요한 일이 아니다).

**2. 자리 표시자 — 없다.** 모든 단계에 실제 코드·명령·기대 출력이 들어 있다. 단 하나 `FEAT_SINCE` 의 `song: ""` 는 **의도된 빈칸**이고, 왜 지금 비워 두는지와 누가 언제 채우는지를 Task 4 Step 5 와 Task 7 Step 10 에 적었다.

**3. 이름 일관성**

| 이름 | 어디서 만들고 | 어디서 쓰나 |
|---|---|---|
| `songVisible()` | Task 3 Step 2 | Task 3(`fetchTodaySong`) · Task 4(Step 1·2) |
| `fetchTodaySong()` | Task 3 Step 2 | Task 4 Step 2(`loadTodaySong`) · Task 5 Step 1 |
| `songCacheToday()` | Task 3 Step 2 | Task 4 Step 2·3 |
| `openSongToday(song)` | Task 4 Step 2 | Task 4 Step 3 · Task 5 Step 4 |
| `withTimeout(p, ms)` | Task 3 Step 2 | Task 3(`fetchTodaySong`) |
| `v2_today_song(p_day)` | Task 1 Step 3 | Task 2 Step 3 |
| `v2_song_click(uid, sid)` | Task 1 Step 3 | Task 2 Step 3 |
| `v2_song_pool` | Task 1 Step 3 | Task 1(함수) · Task 2(monitor) |
| `_songPreview` | Task 3 Step 2 | Task 3 Step 3 · Task 4 Step 6(screen-sweep) |

모두 일치한다.
