# 가을 말씀 동행 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 6주 동안 주 3일씩 3주를 채우신 분께 **신청 단추가 열리는** 이벤트를 만든다.

**Architecture:** 새 표를 만들지 않는다. 기존 이벤트 플랫폼(`events`/`event_signups`)에
`needs.eligibility`(jsonb) 규칙 한 겹을 얹고, 진행률은 조회할 때마다 서버가 집계표
`daily_activity` 를 Postgres 함수 하나로 세어 내려 준다. 자격 판정은 **서버에서만** 한다.

**Tech Stack:** Vanilla JS PWA(프레임워크 없음) · Supabase Edge Function(Deno/TypeScript) ·
PostgreSQL(RPC + RLS) · 스모크 시험은 bash + curl + python(`tests/*.sh`)

**설계 문서:** `docs/superpowers/specs/2026-09-23-autumn-streak-event-design.md` — **먼저 읽는다.**
이 계획은 그 문서의 결정을 옮긴 것이고, 둘이 다르면 **설계 문서가 맞다.**

---

## Global Constraints

이 절은 **모든 과제에 그대로 적용된다.** 과제마다 다시 적지 않는다.

1. **세는 mode 를 나열하지 않는다.** 「그날 `daily_activity` 에 그 `(day, user_id)` 행이 있는가」로만 본다.
   `challenge_log.mode` CHECK 는 여덟 가지이고 `learn-typing-card`·`typing-card` 가 전체 반복의 **65.2%** 다.
2. **응답에 `user_id` 를 싣지 않는다.** 이 API 는 JWT 가 없어(`--no-verify-jwt`) 남의 `user_id` 하나면 그 사람 행세가 된다.
3. **자격 판정은 서버에서만.** 화면이 잠겨 있어도 액션은 열려 있다. 클라이언트가 보낸 `answers` 를 **저장하지 않는다.**
4. **날짜는 `evtToday()`(index.ts:4806-4808) 만 쓴다.** `ymd()` 는 UTC 라 KST 0~9시에 하루가 어긋난다.
5. **새 RPC 를 만들면 같은 파일 끝에** `revoke all on function … from public, anon, authenticated` +
   `grant execute … to service_role` 를 붙이고 `proacl` 확인 질의로 「anon 열림 0건」을 눈으로 본다.
   `drop function` 을 쓰지 않는다 — `create or replace` 는 ACL 을 지킨다.
6. **성도님 화면 금칙어:** 응모 · 당첨 · 자격 · 미달 · 전원 시상 · 달성 · 개근 · 100%.
   쓸 말: **신청 · 선물 · 채우다 · 함께하다.**
7. **새 js 파일을 만들지 않는다.** `tools/bump.py` 의 `TAGGED` 는 손으로 적힌 일곱이라,
   새 파일은 다음 bump 때 태그가 뒤처져 `preflight` 가 배포를 통째로 멈춘다.
8. **새 CSS 색을 만들지 않는다.** 첫 화면 색은 네 단계뿐이다.
9. **커밋은 경로를 못 박는다** — `git commit -m "…" -- <경로>`.
   `git add -A` · `git commit -a` · 넓은 `restore/reset/stash` **금지**(여러 세션이 같은 체크아웃을 쓴다).
   `tools/bump.py` 는 **맨 마지막 과제에서 한 번만** 돌린다.
10. **개발 먼저.** SQL·Edge Function 은 `ktpwthwqzgcqcrmsafdo`(개발)에서 확인한 뒤
    `xnomlgydifiqiybervtf`(운영). 운영 배포는 **맨 마지막 과제**에서 한 번에.
11. 커밋 메시지 끝에 붙인다: `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`

### 누가 무엇을 하나 (2026-09-23 정함)

**일꾼(구현자)은 코드를 쓰고 보고한다. 커밋은 하지 않는다**(2026-09-23 친구 결정 —
일꾼은 `git commit` 권한이 없고, 무엇보다 **다른 세션이 같은 파일을 고치는 중**이라
커밋 전에 `git diff --cached --stat` 으로 **남의 헝크가 섞였는지** 볼 사람이 필요하다).
**커밋·SQL 실행·배포·curl 검증은 컨트롤러(주 세션)가 한다.**
이 저장소가 이전 작업에서 정한 방식이다(`.superpowers/sdd/progress.md`).

### 개발 DB 에 SQL 을 돌리는 법 (브라우저 없이)

저장소의 `supabase/.temp` 는 **운영**에 링크돼 있다. 개발에 돌리려면 **스크래치 폴더를 따로 링크**한다.

    SP="<스크래치>/devwd"
    mkdir -p "$SP/supabase"
    printf '[api]\nenabled = true\n' > "$SP/supabase/config.toml"
    supabase --workdir "$SP" link --project-ref ktpwthwqzgcqcrmsafdo --yes
    supabase --workdir "$SP" db query --linked -f supabase/<파일>.sql

`--linked` 는 **Management API** 로 돌아서 DB 비밀번호가 필요 없다.
⚠️ 저장소 루트 `.env` 의 키 이름에 하이픈이 있어 CLI 가 dotenv 파서에서 죽는다 —
   그래서 **`.env` 가 없는 폴더**에서 부른다. 다 쓰면 지운다(링크 정보가 들어 있다).
⚠️ **개발인지 확인하는 법:** `select count(*) from users;` 가 **스물 남짓**이면 개발,
   **사백이 넘으면 운영**이다. 운영이면 **그 자리에서 멈춘다.**
운영 SQL(Task 11)은 컨트롤러가 친구에게 확인받고 돌린다.


### 확정된 값 (여러 파일에 같은 값이 들어간다 — 한 글자도 다르면 안 된다)

| 이름 | 값 |
|---|---|
| 회차 id | `autumn-2026` |
| `title` | `2026 가을 말씀 동행` |
| `short_title` | `가을 말씀 동행` |
| 측정 시작 `start` | `2026-10-11` (주일) |
| 측정 주 수 `weeks` | `6` (끝 `2026-11-21` 토) |
| 주당 일수 `perWeek` | `3` |
| 필요 주수 `need` | `3` |
| 최소 필요 주수 `minNeed` | `2` |
| `opens_on`(신청 시작) | `2026-10-27` |
| `closes_on`(신청 마감) | `2026-11-28` |
| `list_until`(명단 공개 종료) | `2026-12-13` |
| `FEAT_SINCE.stamp` | `2026-10-11` |

⚠️ **날짜를 옮기면 7일 단위로만** 옮기고, `supabase/event_stamp_2026.sql` 과 `app.js` 의
`FEAT_SINCE.stamp` **두 자리를 함께** 고친다.

---

## File Structure

| 파일 | 책임 | 새로/고침 |
|---|---|---|
| `supabase/event_streak_metrics.sql` | 기준선·효과 측정 질의 (코드와 무관) | 새로 |
| `supabase/event_streak.sql` | 주차 집계 RPC + 인덱스 + 권한 (**구조** — 회차를 넘어 산다) | 새로 |
| `supabase/dev_seed_stamp.sql` | 개발 DB 전용 가짜 42일 네 사람 | 새로 |
| `supabase/event_stamp_2026.sql` | **이 회차 한 건**의 행과 규칙(자료) | 새로 |
| `supabase/functions/api/index.ts` | `eventStamps` · `eventSignup` 재검사 · `eventRoster` 파생값 · 보정 둘 | 고침 |
| `js/api.js` | 새 액션 넷의 호출 한 줄씩 | 고침 |
| `js/events.js` | 도장판 · `phase` 분기 · 잠금 자리의 말 · 오류 문구 | 고침 |
| `app.js` | 금색 class · 진행 알약 · `FEAT_SINCE.stamp` · 진행 캐시 | 고침 |
| `admin-event.html` | 「주」 열 · 요약 배지 · CSV · 보정 · 읽기 전용 규칙 한 줄 | 고침 |
| `privacy/index.html` + 앱 안 개인정보 화면 | 「이벤트 명단 공개」 한 줄 | 고침 |
| `tests/event-smoke.sh` | 새 액션의 거부 경로를 지키는 스모크 | 고침 |

**왜 SQL 을 세 파일로 가르나.** `event_streak.sql` 은 **구조**(다음 회차도 그대로 쓴다),
`event_stamp_2026.sql` 은 **이 회차 자료**(회차마다 새 파일), `dev_seed_stamp.sql` 은
**개발 전용**이라 운영에 절대 안 돌린다. 한 파일에 섞으면 운영에서 가짜 자료를 돌릴 위험이 생긴다.
⚠️ 설계 문서 §6.3 은 RPC 를 `event_stamp_2026.sql` 에 두라고 적었다 — **이 계획이 그 한 줄을 뒤집는다.**
Task 2 에서 설계 문서의 그 줄도 함께 고친다.

---

## Task 1: 기준선 질의 파일 (`event_streak_metrics.sql`)

**왜 맨 앞인가.** 기준선은 **공지가 나가기 전에** 떠야 한다. 지난 이벤트에서 공지 주부터 이미 올랐다
(전환율 14.7 → 27.0%). 코드와 아무 의존이 없으므로 먼저 끝낸다.

⚠️ **창은 반드시 주일에 시작한다.** 계획 초안이 8/31·7/6 으로 적었는데 **둘 다 월요일**이었다
(2026-09-23 에 잡았다). 주일로 맞춘 값이 아래다.

**컨트롤러가 세 창을 이미 운영에서 돌렸다**(2026-09-23). 일꾼은 **그 숫자를 파일에 박아 넣기만** 한다.

**Files:**
- Create: `supabase/event_streak_metrics.sql`

**Interfaces:**
- Consumes: 없음
- Produces: 없음 (사람이 읽는 숫자)

- [ ] **Step 1: 파일을 만든다 — 아래 내용 그대로**

```sql
-- 가을 말씀 동행 — 기준선과 효과 측정
-- ⚠️ 이 저장소는 공개(public)입니다 — 비밀번호·키를 절대 넣지 마세요.
--
-- 쓰는 법: ② 의 `date '…'` 한 곳만 바꿔 가며 같은 질의를 돌린다.
--          다시 잴 때도 **이 파일을 그대로** 쓴다 — 질의를 새로 짜면 숫자가 조용히 갈린다.
-- 설계:   docs/superpowers/specs/2026-09-23-autumn-streak-event-design.md §9
--
-- ⚠️ 창의 시작일은 **반드시 주일**이다. Postgres date_trunc('week') 는 월요일 시작이라
--    쓰지 않는다 — 여기서는 floor((day - 시작일)/7) 로만 주를 가른다(서버와 같은 잣대).
--    2026-09-23 에 이 파일 초안이 8/31·7/6(둘 다 월요일)로 적혀 있던 것을 잡았다.
-- ⚠️ mode 를 세지 않는다. 그날 daily_activity 에 행이 있으면 한 칸이다.
--
-- ⚠️ **어느 DB 를 읽고 있는지 먼저 본다.** 저장소의 supabase/.temp 는 세션마다 바뀐다.
--    `select count(*) from users` 가 사백이 넘으면 운영, 스물 남짓이면 개발이다.
--    운영을 읽으려면 스크래치 폴더를 따로 링크한다:
--      supabase --workdir <스크래치> link --project-ref xnomlgydifiqiybervtf --yes
--      supabase --workdir <스크래치> db query --linked -f supabase/event_streak_metrics.sql

-- ① 창 ─────────────────────────────────────────────────────────
--   B 평시 6주   2026-07-05(주일) ~ 2026-08-15(토)   이벤트 전. **이것이 진짜 기준선이다.**
--   C 이벤트 중  2026-08-09(주일) ~ 2026-09-19(토)   「말씀암송이 답이다!」 한복판
--   A 직전 6주   2026-08-30(주일) ~ 2026-10-10(토)   ⚠️ **2026-10-11 에나 끝난다.** 그날 돌린다
--   D 본 회차    2026-10-11(주일) ~ 2026-11-21(토)   끝난 뒤에 돌린다

-- ② 문턱별 인원 ────────────────────────────────────────────────
with p as (select date '2026-07-05' as s, 6 as weeks, 3 as per_week),
d as (
  select da.user_id, da.day, ((da.day - p.s) / 7) as wk
    from daily_activity da, p
   where da.day >= p.s and da.day < p.s + (p.weeks * 7)
   group by da.user_id, da.day, p.s
),
w as (select user_id, wk, count(*) as days from d group by 1, 2),
q as (select user_id, count(*) filter (where days >= 3) as okw from w group by 1)
select count(*)                          as "활동한 분",
       count(*) filter (where okw >= 1)  as "1주 이상",
       count(*) filter (where okw >= 2)  as "2주 이상",
       count(*) filter (where okw >= 3)  as "3주 이상 ← 문턱",
       count(*) filter (where okw >= 4)  as "4주 이상",
       count(*) filter (where okw >= 6)  as "6주 모두"
  from q;

-- ③ 집계표가 로그와 어긋나지 않는지 (이 숫자가 흔들리면 위 값도 흔들린다)
-- select * from v2_activity_drift();
-- select count(*) as log_rows from challenge_log;

-- ④ 신청 대비 자격 (이벤트가 끝난 뒤)
-- select count(*) as 신청 from event_signups where event_id = 'autumn-2026';

-- ⑤ 종료 후 4주 지속 (12월에) — ② 를 s = '2026-11-22' 로 다시 돌린다.

-- ─────────────────────────────────────────────────────────────
-- 결과란 — 돌린 날과 값을 여기에 적는다. 적지 않으면 다시 잴 때 견줄 것이 없다.
--
-- 2026-09-23 · 운영(xnomlgydifiqiybervtf) · 공지 전
--   B 평시   2026-07-05~08-15   활동  66 · 1주 16 · 2주 13 · 3주 12 · 4주 10 · 6주 4
--   C 중간   2026-08-09~09-19   활동 185 · 1주 83 · 2주 58 · 3주 40 · 4주 16 · 6주 6
--   A 직전   2026-08-30~(9/23까지, 6주 미완)  활동 156 · 1주 74 · 2주 52 · 3주 35 · 4주 22
--
--   읽는 법: **평시에 문턱을 넘는 분은 12명**이다. 이벤트가 도는 동안 40명이 됐고
--            활동자 자체가 66 → 185명으로 세 배가 됐다. 그러니 이번 회차의 기대치는
--            12명이 아니라 그 사이 어딘가다. 끝난 뒤 D 창으로 견준다.
--
-- (A 2026-08-30~10-10 완성본) 돌린 날:            결과:
-- (D 2026-10-11~11-21)        돌린 날:            결과:
-- 공지 나간 날:
```

- [ ] **Step 2: 파일이 그대로 들어갔는지 본다**

```bash
grep -c "2026-07-05\|2026-08-30\|활동  66\|활동 185" supabase/event_streak_metrics.sql
```
기대: **4 이상**(위 네 조각이 다 들어 있다).

- [ ] **Step 3: 커밋**

```bash
git commit -m "$(printf 'feat(이벤트): 가을 말씀 동행 기준선 질의 — 공지 전에 떠 둔다\n\n공지가 나가면 숫자가 움직인다(지난 이벤트에서 공지 주부터 전환율 14.7→27.0%%).\n운영에서 세 창을 떠 결과란에 박았다 — 평시 6주에 문턱을 넘는 분은 12명,\n이벤트가 도는 동안 40명, 활동자는 66에서 185명으로 늘었다.\n\n창은 반드시 주일에 시작한다 — 초안의 8/31·7/6 은 둘 다 월요일이었다.\n\nCo-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>')" -- supabase/event_streak_metrics.sql
```

---

## Task 2: 주차 집계 RPC + 인덱스 (`event_streak.sql`)

**Files:**
- Create: `supabase/event_streak.sql`
- Modify: `docs/superpowers/specs/2026-09-23-autumn-streak-event-design.md` (§6.3 의 파일 이름 한 줄)

**Interfaces:**
- Consumes: `public.daily_activity (day date, user_id text, mode text, cnt int)`
- Produces: `v2_event_weeks(p_start date, p_weeks int, p_per_week int, p_users text[])`
  → `setof (user_id text, weeks_done int, week_days int[], all_weeks boolean, first_day date)`
  - `week_days` 는 **길이가 정확히 `p_weeks`** 인 배열. 0주차가 첫 칸이다.
  - `first_day` 는 **전 기간**에서 잰 그 사람의 가장 이른 활동일(중간 합류 판정에 쓴다).
  - `p_users` 가 `null` 이면 활동한 사람 전부, 배열이면 **그 명단 중 창 안에 활동이 있는 사람만**.
  - ⚠️ **활동이 없는 사람은 행이 아예 안 나온다**(0 으로 채운 행이 아니라 부재다).
    부르는 쪽이 「없으면 0 주」를 스스로 해야 한다 — Task 4 의 `evtStampsFor` 와
    Task 6 의 명단이 둘 다 이 자리를 밟는다. 안 하면 **기록이 없는 분이 명단에서 조용히 사라진다.**

- [ ] **Step 1: 실패하는 확인 질의를 먼저 돌린다**

```bash
SP="$(mktemp -d)" && mkdir -p "$SP/supabase" && cp -r supabase/.temp "$SP/supabase/"
supabase --workdir "$SP" db query --linked "select proname from pg_proc where proname = 'v2_event_weeks';"
```

기대: **0행** — 아직 함수가 없다. (이 명령은 운영을 읽는다. 읽기만 하므로 안전하다.)

- [ ] **Step 2: 파일을 만든다**

`supabase/event_streak.sql`:

```sql
-- 가을 말씀 동행 — 주차 집계 (구조. 회차를 넘어 산다)
-- ⚠️ 이 저장소는 공개(public)입니다 — 비밀번호·키를 절대 넣지 마세요.
--
-- 적용: Supabase 대시보드 → SQL Editor
--   ⚠️ **개발(ktpwthwqzgcqcrmsafdo) 먼저**, 확인한 뒤 운영(xnomlgydifiqiybervtf).
--   여러 번 돌려도 안전하다(create or replace · if not exists).
--
-- 설계: docs/superpowers/specs/2026-09-23-autumn-streak-event-design.md §6.3
--
-- ⚠️ mode 를 세지 않는다 — 「그날 행이 있는가」로만 본다.
--    challenge_log.mode CHECK 는 여덟 가지이고 learn-typing-card·typing-card 가
--    전체 반복의 65.2% 다. mode 를 열거하면 카드로만 하시는 분은 매일 하셔도 도장이 안 찍힌다.
--    (v2_mydays 가 이미 mode 를 안 가리고 sum 한다 — 같은 잣대다.)
--
-- ⚠️ date_trunc('week') 를 쓰지 않는다 — 그건 **월요일** 시작이다.
--    이 앱의 한 주는 주일에 시작한다(구절이 토·금에 올라와 주일부터 쓰인다).
--    시작일 기준 floor((day - start)/7) 로만 가른다. 시작일이 주일이면 경계가 저절로 맞는다.

-- 1) 인덱스 — PK 는 (day,user_id,mode) 이고 별도 인덱스는 (day) 뿐이라
--    「이 사람의 기간 내 날들」이 느리다. v2_mydays 도 함께 빨라진다.
create index if not exists daily_activity_user_day_idx
  on public.daily_activity (user_id, day);

-- 2) 주차 집계
create or replace function v2_event_weeks(
  p_start    date,
  p_weeks    int,
  p_per_week int,
  p_users    text[] default null
)
returns table(
  user_id    text,
  weeks_done int,
  week_days  int[],
  all_weeks  boolean,
  first_day  date
)
language sql stable security definer set search_path = public as $$
  with win as (
    -- 하루에 여러 번 해도 한 칸 — group by 가 그 일을 한다
    select da.user_id as uid, da.day, ((da.day - p_start) / 7) as wk
      from daily_activity da
     where da.day >= p_start
       and da.day <  p_start + (p_weeks * 7)
       and (p_users is null or da.user_id = any(p_users))
     group by da.user_id, da.day
  ),
  per_week as (
    select uid, wk, count(*)::int as days
      from win group by uid, wk
  ),
  agg as (
    select uid,
           count(*) filter (where days >= p_per_week)::int as wd
      from per_week group by uid
  )
  select a.uid,
         a.wd,
         (select array_agg(coalesce(pw.days, 0) order by g.wk)
            from generate_series(0, p_weeks - 1) as g(wk)
            left join per_week pw on pw.uid = a.uid and pw.wk = g.wk),
         (a.wd >= p_weeks),
         (select min(d.day) from daily_activity d where d.user_id = a.uid)
    from agg a;
$$;

-- 3) 권한 — 정책이 아니라 실행 권한으로 막는다.
--    ⚠️ 2026-09-23 에 stats-rpc-card.sql 이 이 두 줄을 빠뜨려 성도님 실명·교구·목장이
--       공개 키로 나갔다(supabase/security_close_stats_rpc.sql). 같은 자리를 반복하지 않는다.
revoke all    on function v2_event_weeks(date, int, int, text[]) from public, anon, authenticated;
grant  execute on function v2_event_weeks(date, int, int, text[]) to   service_role;

-- 4) 확인 ① — anon 에게 열려 있지 않은지. **0행이어야 한다.**
-- select proname, proacl from pg_proc
--  where proname = 'v2_event_weeks'
--    and (proacl::text like '%anon=%' or proacl::text like '%authenticated=%');

-- 5) 확인 ② — 배열 길이가 p_weeks 와 같은지, 0 이 제대로 들어가는지
-- select user_id, weeks_done, week_days, array_length(week_days,1) as len, all_weeks, first_day
--   from v2_event_weeks('2026-10-11', 6, 3) limit 5;
```

- [ ] **Step 3: 개발 DB 에 돌린다**

Supabase 대시보드(`ktpwthwqzgcqcrmsafdo`) → SQL Editor 에 파일을 통째로 붙여넣고 RUN.
기대: `Success. No rows returned`.

- [ ] **Step 4: 확인 질의 둘을 돌려 눈으로 본다**

같은 SQL Editor 에서:

```sql
select proname, proacl from pg_proc
 where proname = 'v2_event_weeks'
   and (proacl::text like '%anon=%' or proacl::text like '%authenticated=%');
```
기대: **0행.** 한 행이라도 나오면 여기서 멈추고 `revoke` 를 다시 돌린다.

```sql
select user_id, weeks_done, array_length(week_days,1) as len, all_weeks, first_day
  from v2_event_weeks('2026-10-11', 6, 3) limit 5;
```
기대: 개발 DB 는 거의 비어 있어 **0행이거나 한두 행.** 행이 있으면 `len` 이 **6** 이어야 한다.

- [ ] **Step 5: 설계 문서의 파일 이름 한 줄을 고친다**

`docs/superpowers/specs/2026-09-23-autumn-streak-event-design.md` §6.3 코드블록 첫 줄:

```diff
--- -- supabase/event_stamp_2026.sql 에 함께 둔다
+++ -- supabase/event_streak.sql (구조 — 회차를 넘어 산다. 회차 자료는 event_stamp_2026.sql)
```

- [ ] **Step 6: 커밋**

```bash
git commit -m "$(printf 'feat(이벤트): 주차 집계 RPC v2_event_weeks — mode 를 세지 않는다\n\n「그날 daily_activity 에 행이 있는가」로만 본다. mode 를 열거하면\nlearn-typing-card·typing-card(전체 반복의 65%%)가 빠져 카드로만 하시는 분은\n매일 하셔도 도장이 하나도 안 찍힌다.\n\n주 경계는 floor((day - start)/7) — date_trunc(week) 는 월요일 시작이라 안 쓴다.\n권한은 service_role 만(2026-09-23 stats-rpc 사고와 같은 자리).\n\nCo-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>')" -- supabase/event_streak.sql docs/superpowers/specs/2026-09-23-autumn-streak-event-design.md
```

---

## Task 3: 개발 DB 가짜 42일 (`dev_seed_stamp.sql`)

**왜 필요한가.** 개발 DB 는 사람 한 명·기록 몇 건뿐이라 **자격 판정을 한 번도 못 밟아 본다.**
네 사람을 만들어 규칙의 네 갈래(넘침 / 딱 / 미달 / 중간 합류)를 전부 밟는다.

**Files:**
- Create: `supabase/dev_seed_stamp.sql`

**Interfaces:**
- Consumes: `v2_event_weeks` (Task 2)
- Produces: 개발 DB 에 네 사람 — 이름으로 찾는다:
  `도장여섯`(6주 전부) · `도장셋`(딱 3주) · `도장둘`(2주 — 미달) · `늦게온이`(5주차부터 2주)

- [ ] **Step 1: 실패하는 확인을 먼저**

개발 SQL Editor:
```sql
select weeks_done, week_days from v2_event_weeks('2026-10-11', 6, 3);
```
기대: **0행** — 아직 아무 자료가 없다.

- [ ] **Step 2: 파일을 만든다**

`supabase/dev_seed_stamp.sql`:

```sql
-- 가을 말씀 동행 — **개발 DB 전용** 가짜 자료
-- ⚠️⚠️ 운영(xnomlgydifiqiybervtf)에 절대 돌리지 마세요. 성도님 기록에 가짜가 섞입니다.
--      개발은 ktpwthwqzgcqcrmsafdo 입니다. SQL Editor 위쪽 프로젝트 이름을 먼저 확인하세요.
--
-- 여러 번 돌려도 안전하다 — 먼저 지우고 다시 넣는다.
-- 규칙의 네 갈래를 전부 밟는다:
--   도장여섯  6주 모두 3일씩      → 자격 O · ✨ O
--   도장셋    1·2·3주만 3일씩     → 자격 O(딱)  · ✨ X
--   도장둘    1·2주만 3일씩       → 자격 X · 남은 주로 닿을 수 있음(기간 중이면)
--   늦게온이  5·6주만 3일씩, 그전 기록이 전혀 없음 → 중간 합류 → 필요 2주 → 자격 O

do $$
declare
  v_start date := '2026-10-11';
  v_verse int;
  r record;
  w int; d int;
begin
  -- 이 개발 DB 에 실제로 있는 구절 번호 하나(FK 때문에 아무 번호나 못 쓴다)
  select no into v_verse from verses order by no limit 1;
  if v_verse is null then
    raise exception '구절이 하나도 없습니다 — seed_verses 를 먼저 돌리세요';
  end if;

  -- ① 사람 넷 (identity_key 는 login 이 만드는 것과 같은 꼴이 아니어도 된다 —
  --    이 자료는 화면 로그인용이 아니라 서버 계산 확인용이다)
  delete from challenge_log where user_id in (select id from users where name in ('도장여섯','도장셋','도장둘','늦게온이'));
  delete from users where name in ('도장여섯','도장셋','도장둘','늦게온이');

  insert into users (type, gu, mok, name, identity_key) values
    ('교구','사랑','1','도장여섯','교구|사랑|1|도장여섯'),
    ('교구','사랑','1','도장셋',  '교구|사랑|1|도장셋'),
    ('교구','사랑','1','도장둘',  '교구|사랑|1|도장둘'),
    ('교구','사랑','1','늦게온이','교구|사랑|1|늦게온이');

  -- ② 기록 — created_at 을 과거로 넣어 트리거가 daily_activity 를 채우게 한다.
  --    ⚠️ daily_activity 에 직접 INSERT 하지 않는다. 트리거가 하는 일을 손으로 하면
  --       로그와 집계가 갈려 v2_activity_drift() 가 운다.
  --    ⚠️ mode 에 카드를 일부러 섞는다 — mode 를 세는 코드가 끼어들면 여기서 걸린다.
  for r in
    select * from (values
      ('도장여섯', 0),('도장여섯',1),('도장여섯',2),('도장여섯',3),('도장여섯',4),('도장여섯',5),
      ('도장셋',   0),('도장셋',  1),('도장셋',  2),
      ('도장둘',   0),('도장둘',  1),
      ('늦게온이', 4),('늦게온이',5)
    ) as t(nm, wk)
  loop
    w := r.wk;
    for d in 0..2 loop     -- 그 주의 첫 사흘
      insert into challenge_log (user_id, verse_no, mode, created_at)
      select u.id, v_verse,
             case d when 0 then 'learn-typing-card'
                    when 1 then 'typing-card'
                    else 'review-typing' end,
             (v_start + (w * 7) + d)::timestamp at time zone 'Asia/Seoul'
        from users u where u.name = r.nm;
    end loop;
  end loop;
end $$;

-- 확인 — 아래처럼 나와야 한다(차례는 다를 수 있다).
--   도장여섯  weeks_done 6 · week_days {3,3,3,3,3,3} · all_weeks t
--   도장셋    weeks_done 3 · week_days {3,3,3,0,0,0} · all_weeks f
--   도장둘    weeks_done 2 · week_days {3,3,0,0,0,0} · all_weeks f
--   늦게온이  weeks_done 2 · week_days {0,0,0,0,3,3} · first_day 2026-11-08
-- select u.name, w.weeks_done, w.week_days, w.all_weeks, w.first_day
--   from v2_event_weeks('2026-10-11', 6, 3) w join users u on u.id::text = w.user_id
--  order by u.name;
```

- [ ] **Step 3: 개발 DB 에 돌린다**

⚠️ SQL Editor 위쪽 프로젝트 이름이 **개발**(`ktpwthwqzgcqcrmsafdo`)인지 **먼저 눈으로 본다.**

- [ ] **Step 4: 확인 질의를 돌린다**

```sql
select u.name, w.weeks_done, w.week_days, w.all_weeks, w.first_day
  from v2_event_weeks('2026-10-11', 6, 3) w join users u on u.id::text = w.user_id
 order by u.name;
```

기대 — 네 행이 나오고 값이 파일 주석과 **정확히** 같다:

| name | weeks_done | week_days | all_weeks | first_day |
|---|---:|---|---|---|
| 늦게온이 | 2 | `{0,0,0,0,3,3}` | f | 2026-11-08 |
| 도장둘 | 2 | `{3,3,0,0,0,0}` | f | 2026-10-11 |
| 도장셋 | 3 | `{3,3,3,0,0,0}` | f | 2026-10-11 |
| 도장여섯 | 6 | `{3,3,3,3,3,3}` | t | 2026-10-11 |

- [ ] **Step 5: 집계가 로그와 어긋나지 않는지 본다**

```sql
select * from v2_activity_drift();
```
기대: `log_rows` 와 `agg_sum` 이 같다. 다르면 Step 2 의 `do $$` 블록이 `daily_activity` 를
직접 건드린 것이다 — 트리거만 쓰도록 되돌린다.

- [ ] **Step 6: 커밋**

```bash
git commit -m "$(printf 'test(이벤트): 개발 DB 가짜 42일 — 규칙의 네 갈래를 밟는다\n\n개발 DB 는 사람 한 명뿐이라 자격 판정을 한 번도 못 밟는다.\n넘침·딱·미달·중간합류 넷을 만든다. mode 에 카드를 일부러 섞어\nmode 를 세는 코드가 끼어들면 여기서 걸리게 했다.\n\n challenge_log 에만 넣는다 — daily_activity 는 트리거가 채운다.\n\nCo-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>')" -- supabase/dev_seed_stamp.sql
```

---

## Task 4: 서버 — `eventStamps` 액션

**Files:**
- Modify: `supabase/functions/api/index.ts` (이벤트 플랫폼 블록 — `evtRow` 아래, `eventOpenList` 위)
- Modify: `supabase/functions/api/index.ts` (`switch` 의 `case "eventOpenList"` 옆)
- Modify: `js/api.js:116` 아래
- Modify: `tests/event-smoke.sh`

**Interfaces:**
- Consumes: `v2_event_weeks`(Task 2) · `v2_mydays`(이미 있다) · `evtToday()` · `norm()` · `EVT_ID_RE`
- Produces:
  - `evtRule(ev): {start, weeks, perWeek, need, minNeed} | null`
  - `evtDayAdd(ymd: string, n: number): string`
  - `evtPhase(ev, rule, today): "before"|"measuring"|"signup"|"over"`
  - `evtNeedFor(rule, firstDay: string|null): number`
  - `evtStampsFor(userId, rule, today): Promise<{days, weekDays, weeksDone, need, eligible, allWeeks, canStillReach}>`
    — **Task 5·6 이 이 함수를 그대로 쓴다.** 두 벌을 두면 화면과 판정이 갈린다.
  - 액션 `eventStamps {user_id, event_id}`
  - `api.eventStamps(user_id, event_id)`

- [ ] **Step 1: 실패하는 스모크를 먼저 쓴다**

`tests/event-smoke.sh` 의 `echo "5) 관리자 액션은…"` **바로 위**에 끼워 넣는다:

```bash
echo "4-1) eventStamps - 신원·인자를 지킨다"
P1=$(call '{"action":"eventStamps"}')
chk "no-user 거부" "$(jqn 'd.get("error")' "$P1")" "no-user"
P2=$(call '{"action":"eventStamps","user_id":"00000000-0000-0000-0000-000000000000"}')
chk "bad-args 거부" "$(jqn 'd.get("error")' "$P2")" "bad-args"
P3=$(call '{"action":"eventStamps","user_id":"00000000-0000-0000-0000-000000000000","event_id":"definitely-not-a-real-event"}')
chk "not-found 거부" "$(jqn 'd.get("error")' "$P3")" "not-found"
chk "user_id 를 싣지 않는다" "$(jqn '"user_id" not in json.dumps(d)' "$P3")" "True"
```

- [ ] **Step 2: 실패를 확인한다**

```bash
bash tests/event-smoke.sh
```
기대: `4-1)` 의 네 줄이 **X** 로 나온다(액션이 없어 서버가 다른 것을 돌려준다).
맨 아래 `실패` 가 0 이 아니어야 한다.

- [ ] **Step 3: 도우미 다섯을 더한다**

`index.ts` 의 `evtRow` 함수 **바로 아래**(지금 `// 직분 기본값 ①` 주석 위)에 넣는다:

```ts
// ---------- 자격(도장판) ----------
// ⚠️ mode 를 세지 않는다. 「그날 daily_activity 에 행이 있는가」로만 본다 —
//    카드(learn-typing-card·typing-card)가 전체 반복의 65.2% 라, mode 를 열거하면
//    카드로만 하시는 분은 매일 하셔도 도장이 하나도 안 찍힌다.

// 날짜 더하기 — UTC 자정 기준으로만 더한다(시분초를 안 끌고 온다)
const evtDayAdd = (ymd: string, n: number) =>
  new Date(Date.parse(ymd + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);

// needs.eligibility 를 읽어 규칙으로. 모양이 틀리면 null — 「자격 회차가 아니다」다.
function evtRule(ev: any): any | null {
  const e = ((ev?.needs ?? {}) as any).eligibility;
  if (!e || typeof e !== "object") return null;
  const start = norm(e.start);
  const weeks = Number(e.weeks), perWeek = Number(e.perWeek), need = Number(e.need);
  const minNeed = Number(e.minNeed ?? 2);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return null;
  // ⚠️ 정수를 강제한다. 3.5 같은 값이 들어오면 evtCanReach 의 for 경계가 어긋난다.
  if (![weeks, perWeek, need, minNeed].every(Number.isInteger)) return null;
  if (!(weeks >= 1 && weeks <= 26)) return null;
  if (!(perWeek >= 1 && perWeek <= 7)) return null;
  if (!(need >= 1 && need <= weeks)) return null;
  if (!(minNeed >= 1 && minNeed <= need)) return null;
  return { start, weeks, perWeek, need, minNeed };
}

// 지금 어느 국면인가 — 화면이 날짜를 다시 재지 않게 서버가 정한다(verb 와 같은 까닭).
// ⚠️ 측정과 신청은 겹친다(10/27~11/21). 그때는 "signup" 이다 —
//    화면이 달라지는 것은 「단추가 열리느냐」이기 때문이다.
function evtPhase(ev: any, rule: any, today: string): string {
  const measureStart = rule ? rule.start : norm(ev.opens_on);
  if (today < measureStart) return "before";
  if (today < norm(ev.opens_on)) return "measuring";
  if (today <= norm(ev.closes_on)) return "signup";
  return "over";
}

// 이분에게 필요한 주 수 — 이벤트 중 처음 오신 분은 남은 주로 분모를 줄인다.
// ⚠️ firstDay 는 **전 기간**에서 잰다. 이벤트 안에서만 보면 기존 회원이 일부러 늦게
//    시작해 문턱을 낮출 수 있다(먼저 시작한 분이 손해를 본다).
function evtNeedFor(rule: any, firstDay: string | null): number {
  if (!firstDay || firstDay < rule.start) return rule.need;   // 기존에 쓰시던 분
  const wk = Math.floor(
    (Date.parse(firstDay + "T00:00:00Z") - Date.parse(rule.start + "T00:00:00Z")) / 86400000 / 7);
  if (wk < 0 || wk >= rule.weeks) return rule.need;
  const remain = rule.weeks - wk;                              // 그 주부터 남은 주 수
  return Math.min(rule.need, Math.max(rule.minNeed, Math.floor(remain / 2)));
}

// 남은 주를 다 채워도 닿을 수 있나. 못 닿는 분께 「세 주가 되면 열려요」를 계속 띄우면
// 헛수고를 권하는 것이고, 마감 화면에서 처음 알면 그게 「떨어졌다」가 된다.
function evtCanReach(rule: any, weekDays: number[], need: number, today: string): boolean {
  let done = 0, left = 0;
  for (let i = 0; i < rule.weeks; i++) {
    if ((weekDays[i] ?? 0) >= rule.perWeek) done++;
    else if (today <= evtDayAdd(rule.start, i * 7 + 6)) left++;  // 아직 안 끝난 주
  }
  return done + left >= need;
}

// 한 사람의 도장 — 화면(eventStamps)과 판정(eventSignup)이 **같은 함수**를 쓴다.
// 두 벌을 두면 「화면은 열렸는데 서버가 막는다」가 된다.
async function evtStampsFor(userId: string, rule: any, today: string) {
  const { data, error } = await db.rpc("v2_event_weeks", {
    p_start: rule.start, p_weeks: rule.weeks,
    p_per_week: rule.perWeek, p_users: [userId],
  });
  if (error) throw error;
  const row = ((data ?? []) as any[])[0] ?? null;
  const weekDays: number[] = row?.week_days ?? new Array(rule.weeks).fill(0);
  const firstDay: string | null = row?.first_day ? String(row.first_day).slice(0, 10) : null;
  const weeksDone = Number(row?.weeks_done ?? 0);
  const need = evtNeedFor(rule, firstDay);

  // 날짜별 횟수 — 도장판이 「이 계정으로 채운 날」을 날짜로 보여 준다.
  // v2_mydays 를 그대로 쓴다(앱의 다른 숫자와 같은 잣대를 지키려고).
  // ⚠️ 실패를 조용히 삼키지 않는다. {} 로 두면 「통신이 끊긴 날」과 「정말 안 한 날」이
  //    같아진다 — 이 기능이 지키려는 원칙을 바로 그 자리에서 어기는 것이다.
  // ⚠️ challenge_log 폴백(mydaysSlow)을 쓰지 않는다. 집계표를 우회하면 숫자가 조용히 갈린다(§6.4).
  //    모르면 **모른다고 말한다** — days 가 null 이면 화면은 날짜를 아예 안 그린다.
  //    주차(weekDays·weeksDone)는 위 v2_event_weeks 가 throw 로 지키므로 영향이 없다.
  const end = evtDayAdd(rule.start, rule.weeks * 7 - 1);
  const { data: md, error: mderr } = await db.rpc("v2_mydays", {
    p_user: userId, p_from: rule.start, p_to: end,
  });
  let days: Record<string, number> | null = null;
  if (!mderr) {
    days = {};
    for (const r of (md ?? []) as any[]) days[String(r.day)] = Number(r.cnt);
  }

  return {
    days, weekDays, weeksDone, need,
    eligible: weeksDone >= need,
    allWeeks: weeksDone >= rule.weeks,
    canStillReach: evtCanReach(rule, weekDays, need, today),
  };
}
```

- [ ] **Step 4: 액션을 더한다**

`eventOpenList` 함수 **바로 위**에 넣는다:

```ts
// ---------- eventStamps: 이 회차에서 이분의 도장 ----------
// ⚠️ eventOpenList 에 얹지 않는다 — 그건 매 부팅에 불리고 일부러 user_id 를 안 보낸다.
//    응답 모양을 첫 화면 게이트·이벤트 카드·관리자 미리보기 셋이 함께 쓴다.
async function eventStamps(b: any) {
  const userId = String(b.user_id ?? "").trim();
  if (!userId) return { ok: false, error: "no-user" };
  const eventId = norm(b.event_id);
  if (!EVT_ID_RE.test(eventId)) return { ok: false, error: "bad-args" };

  const { data: ev, error } = await db.from("events")
    .select("*").eq("id", eventId).maybeSingle();
  if (error) throw error;
  if (!ev) return { ok: false, error: "not-found" };

  const today = evtToday();
  const rule = evtRule(ev);
  // rule 이 null 이면 「자격 회차가 아니다」 — 화면은 도장판을 아예 안 그린다.
  if (!rule) return { ok: true, rule: null, phase: evtPhase(ev, null, today) };

  const st = await evtStampsFor(userId, rule, today);
  return { ok: true, rule, phase: evtPhase(ev, rule, today), ...st };
}
```

- [ ] **Step 5: switch 에 한 줄 더한다**

`case "eventOpenList": return json(await eventOpenList(body));` **바로 아래**:

```ts
      case "eventStamps":   return json(await eventStamps(body));
```

- [ ] **Step 6: `js/api.js` 에 한 줄 더한다**

`eventOpenList: (user_id) => supaCall("eventOpenList", { user_id }),` **바로 아래**:

```js
  eventStamps: (user_id, event_id) => supaCall("eventStamps", { user_id, event_id }),
```

- [ ] **Step 7: 문법을 본다**

```bash
python tools/preflight.py
```
기대: `[1] 자바스크립트 문법` 전부 통과. (⚠️ `index.ts` 는 여기서 안 본다 — Deno 가 배포 때 본다.)

- [ ] **Step 8: 개발에만 배포한다**

```bash
git status --short          # ⚠️ 남의 미커밋 코드가 index.ts 에 없는지 먼저 본다
supabase functions deploy api --no-verify-jwt --project-ref ktpwthwqzgcqcrmsafdo
```

- [ ] **Step 9: 스모크가 통과하는지 본다**

```bash
bash tests/event-smoke.sh
```
기대: `4-1)` 네 줄이 전부 **o**, 맨 아래 `실패 0`.

- [ ] **Step 10: 가짜 사람으로 값을 확인한다**

개발 SQL Editor 에서 `select id from users where name='도장셋';` 로 uuid 를 얻은 뒤:

```bash
UID=<위에서 얻은 uuid>
curl -s -X POST "https://ktpwthwqzgcqcrmsafdo.supabase.co/functions/v1/api" \
  -H "Content-Type: application/json" \
  -H "apikey: sb_publishable_eJKP6u95IU9_DBXTvnvYBA_-yGCf-0Y" \
  -H "Authorization: Bearer sb_publishable_eJKP6u95IU9_DBXTvnvYBA_-yGCf-0Y" \
  -d "{\"action\":\"eventStamps\",\"user_id\":\"$UID\",\"event_id\":\"autumn-2026\"}"
```

기대: 아직 회차 행이 없으므로 `{"ok":false,"error":"not-found"}`.
**이것이 맞는 결과다** — 회차는 Task 7 에서 만든다.

- [ ] **Step 11: 커밋**

```bash
git commit -m "$(printf 'feat(이벤트): eventStamps — 자격 계산을 서버가 한다\n\n도장판에 쓸 것을 새 액션 하나로 뺐다. eventOpenList 에 얹지 않는다 —\n그건 매 부팅에 불리고 일부러 user_id 를 안 보내며, 응답 모양을 셋이 함께 쓴다.\n\nevtStampsFor 하나를 화면과 판정이 함께 쓴다(두 벌을 두면 화면은 열리는데 서버가 막는다).\n중간에 처음 오신 분은 남은 주로 분모를 줄이되, firstDay 를 전 기간에서 잰다 —\n이벤트 안에서만 보면 기존 회원이 늦게 시작해 문턱을 낮출 수 있다.\n\nCo-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>')" -- supabase/functions/api/index.ts js/api.js tests/event-smoke.sh
```

---

## Task 5: 서버 — `eventSignup` 재검사 · 거절 슬러그 · `answers` 서버 계산

**Files:**
- Modify: `supabase/functions/api/index.ts` (`eventSignup`)
- Modify: `tests/event-smoke.sh`

**Interfaces:**
- Consumes: `evtRule`·`evtStampsFor`(Task 4)
- Produces: 거절 슬러그 `not-yet`(새로) · `not-eligible`(새로) · `closed-period`·`not-open`(이미 있다)
  — Task 8 의 `evtErrText` 가 이 셋을 문구로 옮긴다.

- [ ] **Step 1: 되돌이 방지 스모크를 쓴다**

⚠️ **이것은 「실패 먼저」 시험이 아니다.** 솔직하게 적어 둔다 —
이 액션의 응답은 **오늘 날짜와 회차 상태에 달려 있어** 실패를 먼저 만들 수가 없다.
**이 과제의 진짜 검증은 Task 7 의 Step 5~6** 이다(개발 DB 에서 날짜를 우리가 정해
`not-eligible` 과 `answers` 덮어쓰기를 **정확한 값으로** 확인한다).
여기 스모크는 **나중에 누가 이 자리를 되돌리지 못하게** 못 박는 울타리다.

`tests/event-smoke.sh` 의 `4-1)` 블록 **아래**에:

```bash
echo "4-2) eventSignup - 클라이언트가 보낸 answers 는 저장되지 않는다"
# 되돌이 방지용이다. 값이 날짜에 달려 있어 「실패 먼저」로 쓸 수 없다 —
# 자격 판정의 정확한 값은 개발 DB 에서 Task 7 Step 5~6 으로 확인한다.
G=$(call '{"action":"eventSignup","user_id":"00000000-0000-0000-0000-000000000000","event_id":"autumn-2026","answers":{"weeks":[9,9,9,9,9,9]}}')
chk "ok=false" "$(jqn 'd.get("ok")' "$G")" "False"
chk "지어낸 weeks 가 응답에 없다" "$(jqn '"[9, 9, 9, 9, 9, 9]" not in json.dumps(d)' "$G")" "True"
chk "거절 슬러그가 아는 것 중 하나" "$(jqn 'd.get("error") in ("not-found","not-eligible","not-yet","closed-period","not-open")' "$G")" "True"
chk "user_id 를 싣지 않는다" "$(jqn '"user_id" not in json.dumps(d)' "$G")" "True"
```

- [ ] **Step 2: 지금 상태를 확인한다**

```bash
bash tests/event-smoke.sh
```
기대: **맨 아래 `실패 0`.** (`autumn-2026` 회차가 아직 없어 `not-found` 로 거부된다 — 맞는 결과다.)


- [ ] **Step 3: 거절 슬러그를 세 갈래로 고친다**

`eventSignup` 안, 지금 이 두 줄을

```ts
  const isAdmin = adminError(b) === null;
  if (!evtOpenNow(ev, evtToday()) && !isAdmin) {
    // 「아직 안 열렸다」와 「마감했다」를 뭉개지 않는다 — 성도에게 할 말이 다르다.
    return { ok: false, error: ev.status === "open" ? "closed-period" : "not-open" };
  }
```

이렇게 바꾼다:

```ts
  const isAdmin = adminError(b) === null;
  const today = evtToday();
  if (!evtOpenNow(ev, today) && !isAdmin) {
    // 「아직 안 열렸다」·「아직 안 시작했다」·「마감했다」를 뭉개지 않는다.
    // ⚠️ 옛 코드는 status 가 open 이면 아직 시작 전이어도 「마감했어요」라고 답했다.
    if (ev.status !== "open") return { ok: false, error: "not-open" };
    return { ok: false, error: today < norm(ev.opens_on) ? "not-yet" : "closed-period" };
  }
```

- [ ] **Step 4: `answers` 를 서버 계산으로 바꾼다**

지금 이 두 줄을

```ts
  const answers = (b.answers && typeof b.answers === "object" && !Array.isArray(b.answers))
    ? b.answers : {};
```

이렇게 바꾼다:

```ts
  // 자격 회차 — 서버가 다시 센다. **화면이 잠겨 있어도 이 액션은 열려 있다.**
  // ⚠️ b.answers 를 읽지 않는다. JWT 가 없어 누구나 weeks:[9,9,9,9,9,9] 를 보낼 수 있다.
  const rule = evtRule(ev);
  let answers: any;
  if (rule) {
    const st = await evtStampsFor(userId, rule, today);
    if (!st.eligible && !isAdmin) return { ok: false, error: "not-eligible" };
    answers = {
      weeks: st.weekDays,
      weeksDone: st.weeksDone,
      need: st.need,
      rule: { start: rule.start, weeks: rule.weeks, perWeek: rule.perWeek, need: rule.need },
      computed_at: new Date().toISOString(),
    };
  } else {
    answers = (b.answers && typeof b.answers === "object" && !Array.isArray(b.answers))
      ? b.answers : {};
  }
```

⚠️ **스냅샷은 증빙일 뿐이다.** 시상 대상과 ✨ 는 **종료 뒤 다시 센다**(Task 6) —
일찍 신청한 분의 스냅샷은 3주로 굳기 때문이다.

- [ ] **Step 5: 개발에 배포하고 스모크를 돌린다**

```bash
git status --short
supabase functions deploy api --no-verify-jwt --project-ref ktpwthwqzgcqcrmsafdo
bash tests/event-smoke.sh
```
기대: `실패 0`.

- [ ] **Step 6: 커밋**

```bash
git commit -m "$(printf 'feat(이벤트): eventSignup 이 자격을 다시 센다 · answers 를 서버가 쓴다\n\n화면이 잠겨 있어도 이 액션은 열려 있다(JWT 가 없다). 자격 회차면 서버가\n다시 세어 미달이면 not-eligible 로 막고, 클라이언트가 보낸 answers 는 읽지 않는다.\n\n거절 슬러그를 세 갈래로 — 옛 코드는 status 가 open 이면 아직 시작 전이어도\n「마감했어요」라고 답했다.\n\nCo-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>')" -- supabase/functions/api/index.ts tests/event-smoke.sh
```

---

## Task 6: 서버 — 담당자용 (파생값 · 최종 집계 · 보정 둘)

**Files:**
- Modify: `supabase/functions/api/index.ts` (`eventRoster` · 새 액션 둘 · switch)
- Modify: `js/api.js`
- Modify: `tests/event-smoke.sh`

**Interfaces:**
- Consumes: `evtRule`·`evtStampsFor`·`evtDayAdd`(Task 4)
- Produces:
  - `eventRoster` 응답의 `rows[]` 에 `weeksDone:number`·`perfect:boolean`·`eligible:boolean`·
    `excused:boolean`·`computedAt:string` 이 **있을 수도 있다**(자격 회차를 골라 봤을 때만).
  - `eventRoster` 응답에 `missing[]` — **자격은 되는데 아직 신청 안 하신 분**
    (`{name, whoType, group, sub}` 만. **`user_id` 금지**).
  - 액션 `eventSetNote {pw, id, note}` · `eventExcuse {pw, id, excused, reason}`
  - `api.eventSetNote(pw, id, note)` · `api.eventExcuse(pw, id, excused, reason)`

- [ ] **Step 1: 실패하는 스모크를 먼저 쓴다**

`tests/event-smoke.sh` 의 `5) 관리자 액션은 비번 없이…` 블록 **안**, 마지막 `chk` 아래에:

```bash
N1=$(call '{"action":"eventSetNote","id":1,"note":"x"}')
chk "eventSetNote 거부" "$(jqn 'd.get("error") in ("unauthorized","no-password-set")' "$N1")" "True"
N2=$(call '{"action":"eventExcuse","id":1,"excused":true}')
chk "eventExcuse 거부" "$(jqn 'd.get("error") in ("unauthorized","no-password-set")' "$N2")" "True"
```

그리고 `6) 관리자 목록(비번이 있을 때만)` 블록의 `else` 안 마지막에:

```bash
  chk "missing 이 배열" "$(jqn 'isinstance(d.get("missing"), list)' "$RA")" "True"
  chk "missing 에도 user_id 가 없다" "$(jqn 'all("user_id" not in m for m in d.get("missing", []))' "$RA")" "True"
```

- [ ] **Step 2: 실패를 확인한다**

```bash
bash tests/event-smoke.sh
```
기대: `eventSetNote 거부`·`eventExcuse 거부` 두 줄이 **X**(액션이 없다). `실패` 가 0 이 아니다.

- [ ] **Step 3: `eventRoster` 에 파생값과 `missing` 을 더한다**

`eventRoster` 의 `return {` **바로 위**에 넣는다:

```ts
  // ── 자격 회차면 「지금 다시 센 값」을 함께 내려 준다 ───────────────────
  // ⚠️ 응모 시점 스냅샷(answers)으로 시상하지 않는다 — 일찍 신청한 분의 스냅샷은
  //    그때 값으로 굳어, 그 뒤 더 채워도 안 바뀐다(일찍 신청한 분이 벌을 받는다).
  // ⚠️ answers 원본은 내보내지 않는다. 파생값만.
  const rowsOut = (data ?? []).map((r: any) => ({
    id: r.id, eventId: r.event_id, name: r.name, whoType: r.who_type,
    group: r.group_name, sub: r.sub_name ?? "", position: r.position ?? "",
    phone: r.phone ?? "", memo: r.memo ?? "", note: r.note ?? "",
    source: r.source, at: r.created_at, hasUser: !!r.user_id,
    excused: !!((r.answers ?? {}) as any).excused,
  })) as any[];

  let missing: any[] = [];
  const pickedEv = eventId ? (evs ?? []).find((e: any) => e.id === eventId) : null;
  const pickedRule = pickedEv ? evtRule(pickedEv) : null;
  if (pickedRule) {
    const today = evtToday();
    // 신청한 분들 — 한 사람씩 다시 센다. 회차 하나의 신청자 수는 수십이라 이 정도면 된다.
    const { data: srows } = await db.from("event_signups")
      .select("id,user_id").eq("event_id", eventId).limit(2000);
    const byId = new Map<number, any>();
    for (const s of ((srows ?? []) as any[])) {
      if (!s.user_id) continue;
      const st = await evtStampsFor(String(s.user_id), pickedRule, today);
      byId.set(s.id, st);
    }
    const stampedAt = new Date().toISOString();
    for (const row of rowsOut) {
      const st = byId.get(row.id);
      if (!st) continue;
      row.weeksDone = st.weeksDone;
      row.perfect = st.allWeeks;
      row.eligible = st.eligible || row.excused;
      row.computedAt = stampedAt;
    }

    // 자격은 되는데 아직 신청 안 하신 분 — 마감 전에 알려 드리려고.
    // ⚠️ 이름·소속만. user_id 를 싣지 않는다.
    const signedUp = new Set(((srows ?? []) as any[]).map((s) => String(s.user_id)));
    const { data: all } = await db.rpc("v2_event_weeks", {
      p_start: pickedRule.start, p_weeks: pickedRule.weeks,
      p_per_week: pickedRule.perWeek, p_users: null,
    });
    const cand = ((all ?? []) as any[]).filter((w) => {
      if (signedUp.has(String(w.user_id))) return false;
      const fd = w.first_day ? String(w.first_day).slice(0, 10) : null;
      return Number(w.weeks_done) >= evtNeedFor(pickedRule, fd);
    });
    if (cand.length) {
      const { data: us } = await db.from("users")
        .select("id,type,gu,mok,bu,grade,name")
        .in("id", cand.map((w) => String(w.user_id)).slice(0, 300));
      missing = ((us ?? []) as any[]).map((u: any) => ({
        name: norm(u.name),
        whoType: u.type,
        group: u.type === "교구" ? norm(u.gu) : norm(u.bu),
        sub: u.type === "교구" ? norm(u.mok) : norm(u.grade),
      }));
    }
  }
```

그리고 `return { ok: true, events: …, rows: (data ?? []).map(…) }` 의 `rows` 를
`rows: rowsOut,` 로 바꾸고 `missing,` 를 더한다:

```ts
  return {
    ok: true,
    events: (evs ?? []).map((e: any) => ({ /* …지금 그대로… */ })),
    rows: rowsOut,
    missing,
  };
```

⚠️ `.in("id", […])` 에 **300개 상한**을 둔 것은 주소 길이 때문이다. 넘으면 그만큼만 보인다 —
그런 일이 생기면 화면에 「…외 N명」을 적는다(Task 10).

- [ ] **Step 4: 보정 액션 둘을 더한다**

`eventSave` 함수 **바로 위**에 넣는다:

```ts
// ---------- eventSetNote: 담당자 메모 ----------
// ⚠️ note 는 성도님 응답(evtRow·eventRosterPublic)에 절대 실리지 않는다 — 담당자만 본다.
async function eventSetNote(b: any) {
  const err = adminError(b);
  if (err) return { ok: false, error: err };
  const id = Number(b.id);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "bad-args" };
  const note = norm(b.note).slice(0, 500);
  const { error } = await db.from("event_signups")
    .update({ note, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
  return { ok: true };
}

// ---------- eventExcuse: 사정이 있으셨던 분을 인정 ----------
// 입원·장례·간병처럼 자동 규칙으로 못 잡는 자리. 사유를 반드시 남긴다.
// ⚠️ challenge_log·daily_activity 를 손대지 않는다 — 순위·통계·주간 리포트가 함께 오염된다.
//    event_signups 쪽에만 쓴다.
async function eventExcuse(b: any) {
  const err = adminError(b);
  if (err) return { ok: false, error: err };
  const id = Number(b.id);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "bad-args" };
  const excused = !!b.excused;
  const reason = norm(b.reason).slice(0, 200);
  if (excused && !reason) return { ok: false, error: "no-reason" };

  const { data: cur, error: e1 } = await db.from("event_signups")
    .select("answers").eq("id", id).maybeSingle();
  if (e1) throw e1;
  if (!cur) return { ok: false, error: "not-found" };

  const answers = { ...((cur.answers ?? {}) as any), excused, excuseReason: reason };
  const { error } = await db.from("event_signups")
    .update({ answers, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
  return { ok: true };
}
```

- [ ] **Step 5: switch 와 `js/api.js` 에 각각 두 줄**

`case "eventSave":` **바로 위**:

```ts
      case "eventSetNote":  return json(await eventSetNote(body));
      case "eventExcuse":   return json(await eventExcuse(body));
```

`js/api.js` 의 `eventSave:` **바로 위**:

```js
  eventSetNote: (pw, id, note) => supaCall("eventSetNote", { pw, id, note }),
  eventExcuse: (pw, id, excused, reason) => supaCall("eventExcuse", { pw, id, excused, reason }),
```

- [ ] **Step 6: 배포하고 스모크를 돌린다**

```bash
git status --short
supabase functions deploy api --no-verify-jwt --project-ref ktpwthwqzgcqcrmsafdo
bash tests/event-smoke.sh
ADMIN_PW=<개발 관리자 비번> bash tests/event-smoke.sh
```
기대: 둘 다 `실패 0`. 비번을 넣은 쪽에서 `missing 이 배열`·`missing 에도 user_id 가 없다` 가 **o**.

- [ ] **Step 7: 커밋**

```bash
git commit -m "$(printf 'feat(이벤트): 담당자용 — 다시 센 값 · 안 하신 분 · 보정 둘\n\n시상은 응모 시점 스냅샷이 아니라 **뽑는 시점에 다시 센 값**으로 한다.\n스냅샷으로 하면 일찍 신청한 분의 값이 그때로 굳어 벌을 받는다.\n\nmissing = 자격은 되는데 아직 신청 안 하신 분(이름·소속만, user_id 금지).\neventExcuse 는 event_signups 에만 쓴다 — challenge_log 를 손대면 순위·통계가 함께 오염된다.\n\nCo-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>')" -- supabase/functions/api/index.ts js/api.js tests/event-smoke.sh
```

---

## Task 7: 회차 행 (`event_stamp_2026.sql`)

**Files:**
- Create: `supabase/event_stamp_2026.sql`

**Interfaces:**
- Consumes: `public.events`
- Produces: `events` 의 `autumn-2026` 한 행 — **`status='draft'`** 라 아직 아무에게도 안 보인다.

- [ ] **Step 1: 파일을 만든다**

```sql
-- 가을 말씀 동행 — **이 회차 한 건**의 행과 규칙 (자료)
-- ⚠️ 이 저장소는 공개(public)입니다 — 비밀번호·키를 절대 넣지 마세요.
--
-- 적용: 개발 먼저, 확인한 뒤 운영. 여러 번 돌려도 안전하다(on conflict do update).
-- 구조(RPC·인덱스)는 supabase/event_streak.sql 에 있다 — 그것을 먼저 돌린다.
-- 설계: docs/superpowers/specs/2026-09-23-autumn-streak-event-design.md
--
-- ⚠️ status 는 **draft** 로 넣는다. 개시는 2026-10-11 아침에 담당자가
--    admin-event.html 에서 draft → open 으로 한 번 바꾸는 것이다(사람이 손으로 한다).
-- ⚠️ 측정 창(needs.eligibility.start + weeks)과 신청 창(opens_on/closes_on)은 **다르다.**
--    3주가 가장 빨리 성립하는 날이 10/27 이라, 그전에 신청을 열면 화면이 16일 동안
--    「등록하세요」라고 거짓말한다.
-- ⚠️ 날짜를 옮기면 app.js 의 FEAT_SINCE.stamp 도 함께 옮긴다(7일 단위로만).

insert into public.events
  (id, title, short_title, subtitle, season, kind, status,
   opens_on, closes_on, list_until, sort_order, needs, copy)
values (
  'autumn-2026',
  '2026 가을 말씀 동행',
  '가을 말씀 동행',
  '여섯 주 가운데 세 주를 채우시면 신청이 열려요',
  '2026-4Q',
  'signup',
  'draft',
  '2026-10-27',          -- 신청 시작(3주가 가장 빨리 성립하는 날)
  '2026-11-28',          -- 신청 마감(측정은 11/21 에 끝난다 — 일주일 여유)
  '2026-12-13',          -- 명단 공개 종료. ⚠️ 비우면 12월에도 첫 화면에 박혀 있다
  10,
  jsonb_build_object(
    'eligibility', jsonb_build_object(
      'start',   '2026-10-11',   -- 주일
      'weeks',   6,
      'perWeek', 3,
      'need',    3,
      'minNeed', 2               -- 이벤트 중 처음 오신 분의 최소 필요 주수
    )
  ),
  jsonb_build_object(
    'intro',
      '하루에 한 번만 말씀과 함께하면 그날 한 칸이 채워져요.' || chr(10) ||
      '한 주에 3일이면 그 주가 채워집니다 — 매일 하지 않아도 돼요.' || chr(10) ||
      '여섯 주 가운데 세 주만 채우시면 신청 단추가 열려요.' || chr(10) ||
      '신청하신 분께는 모두 드립니다.',
    'doneBadge', '✅ 신청하셨어요',
    'mineBtn',   '신청 내용 보기 →',
    'sentState', '신청'
  )
)
on conflict (id) do update set
  title       = excluded.title,
  short_title = excluded.short_title,
  subtitle    = excluded.subtitle,
  season      = excluded.season,
  opens_on    = excluded.opens_on,
  closes_on   = excluded.closes_on,
  list_until  = excluded.list_until,
  sort_order  = excluded.sort_order,
  needs       = excluded.needs,
  copy        = excluded.copy,
  updated_at  = now();
-- ⚠️ status 는 일부러 안 덮어쓴다 — 개시한 뒤 이 파일을 다시 돌려도
--    성도님 화면이 draft 로 되돌아가지 않게.

-- 확인 ① 규칙이 제대로 들어갔는지
-- select id, status, opens_on, closes_on, list_until, needs->'eligibility'
--   from public.events where id = 'autumn-2026';

-- 확인 ② 지금 성도님께 보이는 회차가 몇 개인지 — 둘이면 첫 화면이 「이벤트 2개」로 접힌다
-- select id, status, opens_on, closes_on, list_until from public.events
--  where status in ('open','closed') order by closes_on;
```

- [ ] **Step 2: 개발 DB 에 돌린다**

- [ ] **Step 3: 확인 질의 ①**

```sql
select id, status, opens_on, closes_on, list_until, needs->'eligibility'
  from public.events where id = 'autumn-2026';
```
기대: `status` 가 `draft`, `eligibility` 가 `{"need": 3, "start": "2026-10-11", "weeks": 6, "minNeed": 2, "perWeek": 3}`.

- [ ] **Step 4: 개발에서 `status` 를 잠깐 `open` 으로 올려 액션을 확인한다**

```sql
update public.events set status = 'open' where id = 'autumn-2026';
```

`도장셋`·`도장둘`·`늦게온이`의 uuid 로 각각:

```bash
curl -s -X POST "https://ktpwthwqzgcqcrmsafdo.supabase.co/functions/v1/api" \
  -H "Content-Type: application/json" \
  -H "apikey: sb_publishable_eJKP6u95IU9_DBXTvnvYBA_-yGCf-0Y" \
  -H "Authorization: Bearer sb_publishable_eJKP6u95IU9_DBXTvnvYBA_-yGCf-0Y" \
  -d "{\"action\":\"eventStamps\",\"user_id\":\"$UID\",\"event_id\":\"autumn-2026\"}"
```

기대 (오늘이 2026-09-23 이면 `phase` 는 `before`):

| 사람 | weeksDone | need | eligible | allWeeks |
|---|---:|---:|---|---|
| 도장셋 | 3 | 3 | `true` | `false` |
| 도장둘 | 2 | 3 | `false` | `false` |
| 늦게온이 | 2 | **2** | `true` | `false` |
| 도장여섯 | 6 | 3 | `true` | **`true`** |

⚠️ **`늦게온이` 의 `need` 가 2 가 아니면 `evtNeedFor` 가 틀린 것이다** — 여기서 멈추고 Task 4 로 돌아간다.

- [ ] **Step 5: 자격이 없는 사람으로 `eventSignup` 을 직접 불러 본다**

```bash
curl -s -X POST "…같은 주소…" -d "{\"action\":\"eventSignup\",\"user_id\":\"<도장둘 uuid>\",\"event_id\":\"autumn-2026\",\"answers\":{\"weeks\":[9,9,9,9,9,9]}}"
```

기대: `{"ok":false,"error":"not-yet"}` — 오늘이 `opens_on`(10/27) 전이기 때문이다.
개발에서만 `opens_on` 을 오늘로 당겨(`update public.events set opens_on = current_date where id='autumn-2026';`)
다시 부르면 **`{"ok":false,"error":"not-eligible"}`** 이어야 한다. **이것이 이 계획의 핵심 검증이다.**

- [ ] **Step 6: 자격이 있는 사람으로 신청해 `answers` 가 덮였는지 본다**

```bash
curl -s -X POST "…" -d "{\"action\":\"eventSignup\",\"user_id\":\"<도장셋 uuid>\",\"event_id\":\"autumn-2026\",\"answers\":{\"weeks\":[9,9,9,9,9,9]}}"
```
기대: `ok:true` 이고 `signup.answers.weeks` 가 **`[3,3,3,0,0,0]`**(지어낸 `9` 가 아니다).

- [ ] **Step 7: 공개 명단에 안 새는지 본다**

```bash
curl -s -X POST "…" -d '{"action":"eventRosterPublic","event_id":"autumn-2026"}'
```
기대: 이름·소속만 있고 `answers`·`user_id`·`weeks` 라는 낱말이 **한 번도 안 나온다.**

- [ ] **Step 8: 개발 DB 를 원래대로 돌린다**

```sql
update public.events set status='draft', opens_on='2026-10-27' where id='autumn-2026';
delete from event_signups where event_id = 'autumn-2026';
```

- [ ] **Step 9: 커밋**

```bash
git commit -m "$(printf 'feat(이벤트): autumn-2026 회차 행 — draft 로 넣는다\n\n측정 창(10/11~11/21)과 신청 창(10/27~11/28)을 가른다. 3주가 가장 빨리\n성립하는 날이 10/27 이라 그전에 열면 화면이 16일 동안 거짓말한다.\n\nstatus 는 on conflict 에서 일부러 안 덮어쓴다 — 개시한 뒤 이 파일을 다시 돌려도\n성도님 화면이 draft 로 되돌아가지 않게.\n\nCo-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>')" -- supabase/event_stamp_2026.sql
```

---

## Task 8: 이벤트 화면 — 도장판 (`js/events.js`)

**Files:**
- Modify: `js/events.js` (`evtLoad`·`evtDrawForm`·`evtCardHtml`·`evtSubmit`·`evtErrText`)

**Interfaces:**
- Consumes: `api.eventStamps`(Task 4) · 슬러그 `not-eligible`·`not-yet`·`no-rule`(Task 5)
- Produces: 전역 `evtStamp`(객체 또는 `null`) · `evtStampState`(`"unknown"`|`"ready"`) · `evtStampHtml(u)`

- [ ] **Step 1: 상태 두 개를 더한다**

`js/events.js` 의 `var _evtPreview = false;` **바로 아래**:

```js
// 도장판 — ⚠️ 「아직 모른다」와 「0주」를 뭉개지 않는다. 통신이 잠깐 끊긴 분께
//    「0주 채우셨어요」라고 말하면 사실이 아닌 말을 하는 것이다(evtState 와 같은 까닭).
var evtStamp = null;            // eventStamps 응답 또는 null
var evtStampState = "unknown";  // "unknown" | "ready"
```

- [ ] **Step 2: 도장판을 그리는 함수를 더한다**

`evtCardHtml` **바로 위**에 넣는다:

```js
// 한 주 칸의 날짜 범위 — 「1주 10/11~10/17」
function evtWeekLabel(start, i) {
  var a = new Date(Date.parse(start + "T00:00:00Z") + i * 7 * 86400000);
  var b = new Date(a.getTime() + 6 * 86400000);
  var f = function (d) { return (d.getUTCMonth() + 1) + "/" + d.getUTCDate(); };
  return (i + 1) + "주 " + f(a) + "~" + f(b);
}

// 도장판. ⚠️ evtDrawForm 의 `if (!canSignup)` **앞**에서 부른다 —
//    그 분기는 폼 대신 명단만 그려서, 신청 창이 열리기 전에는 도장판이 아예 안 보인다.
function evtStampHtml(u) {
  if (evtStampState !== "ready" || !evtStamp || !evtStamp.rule) {
    return '<div class="ev-note">기록을 맞추는 중이에요. 잠시 뒤 다시 열어 주세요.</div>';
  }
  var s = evtStamp, r = s.rule;
  var head = evtEsc(u.name) + " 님의 도장판 · 지금까지 " + s.weeksDone + "주 채웠어요";

  var cells = "";
  for (var i = 0; i < r.weeks; i++) {
    var n = (s.weekDays && s.weekDays[i]) || 0;
    var full = n >= r.perWeek;
    cells += '<div class="ev-wk' + (full ? " on" : "") + '">' +
      '<div class="ev-wk-t">' + evtEsc(evtWeekLabel(r.start, i)) + "</div>" +
      '<div class="ev-wk-v">' + (full ? "✓" : n + "일") + "</div></div>";
  }

  // 이번 주 남은 만큼을 말로. ⚠️ 「2일 남음」처럼 남은 것을 세면 빚처럼 읽힌다.
  var tail;
  if (s.eligible) {
    tail = s.allWeeks
      ? "여섯 주를 다 채우셨어요 ✨"
      : (r.need + "주를 채우셨어요. 남은 주도 편한 만큼 함께해요.");
  } else if (s.canStillReach) {
    tail = "지금까지 " + s.weeksDone + "주를 채우셨어요.<br>" +
      "세 주가 되면 이 자리에 신청 단추가 열려요.<br>" +
      "남은 주에 " + r.perWeek + "일씩만 채우시면 돼요.";
  } else {
    tail = "이번 신청은 여기까지예요. 채우신 " + s.weeksDone +
      "주는 그대로 남아요 — 다음에 또 함께해요.";
  }

  return '<div class="ev-stampbox">' +
    '<div class="ev-stamp-h">' + head + "</div>" +
    '<div class="ev-wks">' + cells + "</div>" +
    '<div class="ev-stamp-tail">' + tail + "</div>" +
    '<div class="ev-stamp-fine">한 날에 여러 번 하셔도 그날 한 칸이에요.<br>' +
    "인터넷이 연결된 상태에서 저장된 날만 셉니다.</div></div>";
}
```

⚠️ **「자격」·「미달」을 한 자도 쓰지 않았다.** 셈만 보여 준다.
⚠️ `need` 를 문구에 넣을 때 **「세 주」는 한글 수사**로 쓴다(단위를 두 번 세지 않는다).

- [ ] **Step 3: 도장판 CSS 를 `style.css` 끝에 더한다**

```css
/* 가을 말씀 동행 도장판 — 색은 이벤트(금색) 계열 하나만 빌려 쓴다. 새 색을 만들지 않는다. */
.ev-stampbox { margin: 14px 0; padding: 14px; border: 1px solid #e3e6ee; border-radius: 12px; background: #fff; }
.ev-stamp-h { font-weight: 700; margin-bottom: 10px; }
.ev-wks { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.ev-wk { border: 1px solid #e3e6ee; border-radius: 10px; padding: 8px 6px; text-align: center; }
.ev-wk.on { background: #fdf3d8; border-color: #c8a84b; color: #8a6a1e; }
.ev-wk-t { font-size: 12px; opacity: .75; }
.ev-wk-v { font-size: 20px; font-weight: 700; margin-top: 2px; }
.ev-stamp-tail { margin-top: 12px; line-height: 1.6; }
.ev-stamp-fine { margin-top: 10px; font-size: 13px; opacity: .7; line-height: 1.5; }
.dark .ev-stampbox { background: #151a21; border-color: #2b323d; }
.dark .ev-wk { border-color: #2b323d; }
.dark .ev-wk.on { background: #2a2417; border-color: #5a4e2a; color: #dcb669; }
```

- [ ] **Step 4: `evtLoad` 가 도장도 함께 받게 한다**

`evtLoad` 의 `.then(function (r) {` 블록 끝(`evtState = …` 줄 아래)에 이어 붙인다:

```js
    // 자격 회차가 있으면 그 도장도 받아 둔다. ⚠️ 하나뿐일 때만 — 둘 이상이면
    //    어느 것의 진행인지 화면이 말할 수 없다(첫 화면 라벨도 「이벤트 2개」가 된다).
    var withRule = evtEvents.filter(function (e) {
      return e.needs && e.needs.eligibility;
    });
    if (!uid || withRule.length !== 1 || !api.eventStamps) {
      evtStamp = null; evtStampState = "unknown";
      return;
    }
    return api.eventStamps(uid, withRule[0].id).then(function (s) {
      if (s && s.ok && s.rule) { evtStamp = s; evtStampState = "ready"; }
      else { evtStamp = null; evtStampState = "unknown"; }
    }).catch(function () { evtStamp = null; evtStampState = "unknown"; });
```

그리고 같은 함수의 `.catch(function (e) {` 안 `evtHint = "";` 아래에 더한다:

```js
    evtStamp = null; evtStampState = "unknown";
```

- [ ] **Step 5: `evtDrawForm` 이 `!canSignup` **앞**에서 도장판을 그리게 한다**

`evtDrawForm` 안, `(e.copy && e.copy.intro ? … : "")` 줄 **바로 다음**에 넣는다
(즉 `// ── 마감된 회차:` 주석 **위**):

```js
  // ⚠️ 이 줄은 `if (!canSignup)` **앞**에 있어야 한다. 그 분기는 폼 대신 명단만
  //    그려서, 신청 창이 열리기 전(measuring)에는 도장판이 아예 안 보이게 된다.
  if (e.needs && e.needs.eligibility) html += evtStampHtml(u);
```

- [ ] **Step 6: 잠긴 동안 「신청」 단추 대신 말을 둔다**

`evtDrawForm` 안, 제출 단추를 그리는 자리(`ev-submit` 을 만드는 줄) **바로 위**에 넣고,
단추 자체는 `evtLocked` 가 아닐 때만 그리도록 감싼다:

```js
  // ⚠️ disabled 단추를 그리지 않는다 — 어르신께 회색 단추는 「나는 안 된다」로 읽힌다.
  //    자격이 아직이면 단추 자리를 비운다(도장판이 이미 그 말을 하고 있다).
  // ⚠️ 「모른다」로는 잠그지 않는다. evtStampState 가 "ready" 일 때만 잠근다 —
  //    통신이 잠깐 끊긴 분을 영영 못 내게 하면 안 된다. 어차피 서버가 not-eligible 로 막는다.
  var evtLocked = !!(e.needs && e.needs.eligibility) &&
    evtStampState === "ready" && !!evtStamp && !evtStamp.eligible;
```

그리고 `ev-submit` 단추를 그리는 표현식을 `evtLocked ? "" : (<지금 그 표현식>)` 으로 감싼다.
⚠️ 단추를 안 그렸으면 **아래 `document.getElementById("ev-submit").addEventListener(...)` 도
같은 `if (!evtLocked)` 안으로** 넣는다 — 안 그러면 `null.addEventListener` 로 화면이 통째로 멈춘다.

- [ ] **Step 7: 카드 문구를 `copy` 에서 읽게 한다**

`evtCardHtml` 안의 두 줄을 바꾼다.

```diff
-  var btnLabel = e.mine ? "낸 것 보기 →" : verb + "하기 →";
+  // ⚠️ 하드코딩하지 않는다 — 6주를 다 채우고 신청만 안 한 분이 「참여」가 없는 카드를 본다.
+  var cp = e.copy || {};
+  var btnLabel = e.mine ? (cp.mineBtn || "낸 것 보기 →")
+    : (e.needs && e.needs.eligibility && !e.mine ? "도장판 보기 →" : verb + "하기 →");
```

```diff
-    (e.mine ? '<div class="ev-badge-done">✅ 참여하셨어요</div>' : "") +
+    (e.mine ? '<div class="ev-badge-done">' + evtEsc(cp.doneBadge || "✅ 참여하셨어요") + "</div>" : "") +
```

그리고 D-day 를 자격 회차에서는 빼도록:

```diff
-    (closed ? "" : '<span class="ev-dday' + (dday === "오늘 마감" ? " urgent" : "") +
+    (closed || (e.needs && e.needs.eligibility) ? "" : '<span class="ev-dday' + (dday === "오늘 마감" ? " urgent" : "") +
       '">' + evtEsc(dday) + "</span>") + "</div>" +
```

- [ ] **Step 8: 신청 완료 문구를 고치고 목록으로 튕기지 않게 한다**

`evtSubmit` 의 `.then(function () { appAlert("참여를 등록했어요. 고맙습니다!"); evtDrawListFresh(u); })` 를:

```js
  }).then(function () {
    var e2 = evtFind(eventId);
    if (e2 && e2.needs && e2.needs.eligibility) {
      // ⚠️ appAlert 한 줄로 끝내지 않는다 — 스냅샷을 성도님 말로 옮겨야
      //    「신청한 뒤에 한 주 쉬면 취소되나요」를 담당자에게 묻지 않는다.
      var wd = (evtStamp && evtStamp.weeksDone) || 0;
      appAlert("<b>신청이 끝났어요</b><br>" + evtEsc(u.name) +
        " 성도님 이름을 명단에 올렸어요.<br>지금까지 채우신 " + wd +
        "주를 그대로 적어 두었어요.<br>남은 주도 편한 만큼 함께해요.");
      renderEventForm(u, eventId);   // ⚠️ 목록으로 보내지 않는다 — 도장판과 함께 다시 본다
      return;
    }
    appAlert("참여를 등록했어요. 고맙습니다!");
    evtDrawListFresh(u);
  })
```

- [ ] **Step 9: 오류 문구 셋을 더한다**

`evtErrText` 의 `if (m === "bad-args")` 줄 **아래**:

```js
  if (m === "not-eligible") return "아직 신청이 열리지 않았어요.<br>여섯 주 가운데 세 주를 채우시면 열려요.";
  if (m === "not-yet") return "10월 27일부터 신청을 받아요.";
  if (m === "no-rule") return "준비 중이에요. 잠시 뒤 다시 열어 주세요.";
```

⚠️ 안 더하면 마지막 줄 `return m` 이 성도님 화면에 **「not-eligible」을 영문 그대로** 띄운다.

- [ ] **Step 10: 문법을 본다**

```bash
python tools/preflight.py
```
기대: 전부 통과.

- [ ] **Step 11: localhost 에서 눈으로 본다**

```bash
python -m http.server 8000
```

⚠️ 개발 DB 를 보려면 회차가 `open` 이어야 한다 — 개발에서만 잠깐 올린다:
`update public.events set status='open' where id='autumn-2026';`

브라우저에서 `http://localhost:8000/` → **오른쪽 위 「개발 DB」 띠가 보이는지 먼저 확인** →
`도장셋` 으로 로그인(사랑교구 1목장 도장셋) → 첫 화면 → 「가을 말씀 동행」 → 확인할 것:

1. 도장판 여섯 칸이 나오고 `{3,3,3,0,0,0}` 대로 앞 세 칸이 ✓ 다
2. 칸마다 「1주 10/11~10/17」 같은 날짜가 붙어 있다
3. 아래 작은 글씨 두 줄이 보인다
4. **잠긴 자리에 회색 단추가 아니라 말이 있다**(`도장둘` 로 다시 로그인해 확인)
5. 어두운 모드로 바꿔도 칸이 읽힌다

확인이 끝나면 개발 DB 를 되돌린다: `update public.events set status='draft' where id='autumn-2026';`

- [ ] **Step 12: 커밋**

```bash
git commit -m "$(printf 'feat(이벤트): 도장판 — 잠긴 자리에 단추 대신 말을 둔다\n\n어르신께 회색 단추는 「나는 안 된다」로 읽힌다. 그 자리에 셈만 보여 준다\n(「자격」·「미달」을 한 자도 쓰지 않는다).\n\n도장판은 `if (!canSignup)` **앞**에 그린다 — 그 분기는 폼 대신 명단만 그려서\n신청 창이 열리기 전에는 도장판이 아예 안 보인다.\n\n「모른다」를 0 으로 뭉개지 않는다 — 통신이 끊긴 분께 「0주」라고 말하지 않고,\n그때는 잠그지도 않는다(어차피 서버가 막는다).\n\nCo-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>')" -- js/events.js style.css
```

---

## Task 9: 첫 화면 (`app.js`)

**Files:**
- Modify: `app.js` (`FEAT_SINCE` · `clearPersonalData` · `renderSummary` 의 단추와 핸들러 · 진행 알약)

**Interfaces:**
- Consumes: `api.eventStamps`(Task 4) · `api.eventOpenList`(이미)
- Produces: `STAMP_KEY(uid)` · `fillStampPill(u)` · `bumpStampToday()`

- [ ] **Step 1: `FEAT_SINCE` 에 새 키를 더한다**

```diff
   event: "2026-09-10",        // 이벤트 플랫폼 — 썸머 써 바이블 명단을 여는 날
+  // ⚠️ 「event」키를 다시 쓰면 안 된다 — 9월에 썸머 명단을 눌러 본 분은
+  //    feat-seen-event 가 이미 1 이라(featIsNew 첫 줄) 영영 안 뜬다.
+  //    ⚠️ 개시일을 옮기면 supabase/event_stamp_2026.sql 과 함께 옮긴다.
+  stamp: "2026-10-11",        // 가을 말씀 동행 — 도장 시작일과 같은 날부터 NEW
```

- [ ] **Step 2: 단추를 금색으로 바꾸고 배지 키를 바꾼다**

`renderSummary` 안 `open-event-list` 를 그리는 줄:

```diff
-    ${eventVisible() ? `<button class="summary-help" id="open-event-list">🏅 ${boardEsc(eventLabelCached())}${newBadge("event")}</button>` : ""}
+    ${/* ⚠️ 새 CSS 를 쓰지 않는다 — .summary-help.event-cta 금색이 style.css:2046-2053 에
+          이미 있고 쓰는 곳이 0건이었다. class 를 한 단어 늘리는 것이 전부다.
+          ⚠️ 이름 뒤에 진행 문구를 이어 붙이지 않는다 — 이 단추는 nowrap+ellipsis 라
+          잘리는 쪽이 「이름」이다. 진행은 아래 fillStampPill 이 알약으로 꽂는다. */""}
+    ${eventVisible() ? `<button class="summary-help event-cta" id="open-event-list">🏅 ${boardEsc(eventLabelCached())}${newBadge("stamp")}</button>` : ""}
```

- [ ] **Step 3: 핸들러의 `markFeatSeen` 키를 바꾼다**

```diff
     if (b) b.addEventListener("click", () => {
-      markFeatSeen("event");
+      markFeatSeen("stamp");
```

- [ ] **Step 4: 진행 알약 CSS 를 `style.css` 끝에 더한다**

```css
/* 이벤트 단추 안 진행 알약 — .board-new 와 같은 방식(async 로 꽂는다) */
.summary-help .ev-pill { margin-left: 6px; padding: 1px 7px; border-radius: 999px;
  background: #c8a84b; color: #fff; font-size: 12px; font-weight: 700; vertical-align: middle; }
.dark .summary-help .ev-pill { background: #5a4e2a; color: #f2e4c2; }
```

- [ ] **Step 4-1: 회차 id 를 부팅 때 한 번 적어 둔다**

`app.js` 의 `EVENT_LABEL_KEY` 선언 옆에:

```js
// 자격(도장) 회차 id — **개인정보가 아니다**(EVENT_LABEL_KEY 와 같은 취급).
// 진행은 여기 담지 않는다. 그건 event-stamp::<user_id> 다.
const EVENT_STAMP_ID_KEY = "event-stamp-id";
```

`refreshEventOpen` 안, `localStorage.setItem(EVENT_LABEL_KEY, label);` **바로 아래**:

```js
    // 첫 화면 알약이 이걸 보고 eventStamps 를 **한 번만** 부른다(왕복을 둘로 늘리지 않으려고).
    // ⚠️ 둘 이상이면 빈 값 — 누구의 진행인지 화면이 말할 수 없다(라벨도 「이벤트 2개」가 된다).
    const stampEvs = list.filter((e) => e.needs && e.needs.eligibility);
    try { localStorage.setItem(EVENT_STAMP_ID_KEY, stampEvs.length === 1 ? stampEvs[0].id : ""); } catch (e) {}
```

⚠️ 앱을 처음 켠 그 순간에는 이 값이 아직 없을 수 있다 — 그때는 알약이 **다음 렌더에** 붙는다.
`refreshEventOpen` 은 값이 바뀌면 `renderSummary()` 를 부르므로 저절로 그렇게 된다.

- [ ] **Step 5: 알약을 꽂는 함수를 더한다**

`fillBoardBadge` 함수 **바로 아래**에 넣는다:

```js
// 가을 말씀 동행 — 이벤트 단추 안 진행 알약.
// ⚠️ EVENT_LABEL_KEY·EVENT_OPEN_KEY 에 담지 않는다. 그 둘은 user_id 로 안 나뉘어 있고
//    clearPersonalData 목록에도 없다 — 공용 기기에서 남의 진행이 남는다.
const STAMP_KEY = (uid) => `event-stamp::${uid}`;
let stampCache = null;   // { eventId, day, weekDays, perWeek, weeks, eligible }

function stampRead(uid) {
  try {
    const v = JSON.parse(localStorage.getItem(STAMP_KEY(uid)) || "null");
    // ⚠️ 날이 바뀌었거나 회차가 다르면 **그 자리에서 버린다** — 틀린 도장보다 없는 편이 낫다.
    if (!v || v.day !== todayYmd()) return null;
    return v;
  } catch { return null; }
}
function stampWrite(uid, v) {
  try { localStorage.setItem(STAMP_KEY(uid), JSON.stringify(v)); } catch {}
}

function applyStampPill() {
  const btn = document.getElementById("open-event-list");
  if (!btn || !stampCache) return;
  const old = btn.querySelector(".ev-pill");
  if (old) old.remove();
  const s = stampCache;
  const i = Math.floor(
    (Date.parse(todayYmd() + "T00:00:00Z") - Date.parse(s.start + "T00:00:00Z")) / 86400000 / 7);
  if (i < 0 || i >= s.weeks) return;                 // 기간 밖이면 아무것도 안 붙인다
  const n = (s.weekDays && s.weekDays[i]) || 0;
  let dots = "";
  for (let k = 0; k < s.perWeek; k++) dots += k < n ? "●" : "○";
  btn.insertAdjacentHTML("beforeend", `<span class="ev-pill">${dots}</span>`);
}

function fillStampPill(u) {
  applyStampPill();                                  // 캐시가 있으면 즉시(깜빡임 방지)
  if (!u || !u.user_id || !window.api || !api.eventStamps) return;
  // ⚠️ 여기서 eventOpenList 를 다시 부르지 않는다 — 첫 화면을 그릴 때마다 왕복이 둘이 된다.
  //    회차 id 는 부팅 때 refreshEventOpen 이 이미 받아 적어 둔 것을 읽는다(Step 5-1).
  let evId = "";
  try { evId = localStorage.getItem(EVENT_STAMP_ID_KEY) || ""; } catch {}
  if (!evId) return;                                 // 자격 회차가 없거나 둘 이상이다
  const cached = stampRead(u.user_id);
  if (cached && cached.eventId === evId) { stampCache = cached; applyStampPill(); }
  api.eventStamps(u.user_id, evId).then((s) => {
    if (!s || !s.ok || !s.rule) return;
    stampCache = {
      eventId: evId, day: todayYmd(), start: s.rule.start,
      weeks: s.rule.weeks, perWeek: s.rule.perWeek,
      weekDays: s.weekDays, eligible: !!s.eligible,
    };
    stampWrite(u.user_id, stampCache);
    applyStampPill();                                // ⚠️ renderSummary 를 다시 부르지 않는다
  }).catch(() => {});
}

// 활동 직후 오늘 칸을 그 자리에서 뒤집는다 — 하필 「방금 했는데」 하고 확인하는 순간이다.
// ⚠️ 자격(단추 열기)은 여기서 하지 않는다. 그것은 서버 응답을 받은 뒤에만.
function bumpStampToday() {
  if (!stampCache || stampCache.day !== todayYmd()) return;
  const i = Math.floor(
    (Date.parse(todayYmd() + "T00:00:00Z") - Date.parse(stampCache.start + "T00:00:00Z"))
    / 86400000 / 7);
  if (i < 0 || i >= stampCache.weeks) return;
  if (todayCountCache != null && todayCountCache > 1) return;   // 오늘 첫 번째일 때만
  stampCache.weekDays = (stampCache.weekDays || []).slice();
  stampCache.weekDays[i] = (stampCache.weekDays[i] || 0) + 1;
  applyStampPill();
}
```

- [ ] **Step 6: `renderSummary` 가 알약을 채우게 한다**

`loadTodayCount(u); // 첫 화면 '오늘 N회' 띠 채우기` 줄 **바로 아래**:

```js
  fillStampPill(u);  // 가을 말씀 동행 — 이벤트 단추 안 진행 알약(●●○)
```

⚠️ **`refreshEventOpen` 에 얹지 않는다.** 그건 부팅에 한 번만 돌아서,
암송을 마치고 홈에 와도 도장이 그대로다.

- [ ] **Step 7: 활동 직후 반영을 잇는다**

`bumpTodayCount` 함수 안 `applyTodayStrip();` **아래**:

```js
  bumpStampToday();   // 가을 말씀 동행 — 오늘 칸을 그 자리에서 뒤집는다
```

- [ ] **Step 8: `clearPersonalData` 에 진행 캐시를 더한다**

```diff
   const clearPersonalData = () => { … }
```
안의 목록 `.forEach` **바로 아래**에:

```js
  // 가을 말씀 동행 진행 캐시 — user_id 별이라 목록에 못 적는다. 앞자리로 훑어 지운다.
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.indexOf("event-stamp::") === 0) localStorage.removeItem(k);
    }
  } catch {}
```

- [ ] **Step 9: 문법을 본다**

```bash
python tools/preflight.py
```
기대: 전부 통과.

- [ ] **Step 10: localhost 에서 눈으로 본다**

개발 DB 의 회차를 잠깐 `open` 으로 올린 뒤 `도장셋` 으로 로그인해 확인:

1. 첫 화면 「함께」 묶음의 이벤트 단추가 **금색**이다(연한 남색이 아니다)
2. 그 단추 안에 `●●●` 또는 `○○○` 알약이 있다
3. **이름이 말줄임(…)으로 잘리지 않는다** — 브라우저 창을 320px 로 좁혀 본다
4. 암송을 한 번 하고 홈으로 돌아오면 알약이 한 칸 늘어 있다
5. 개발자 도구 콘솔에 오류가 **없다**(특히 `Cannot read properties of null`)
6. 회차를 `draft` 로 내리고 새로고침하면 단추와 알약이 **함께 사라진다**

- [ ] **Step 11: 커밋**

```bash
git commit -m "$(printf 'feat(이벤트): 첫 화면 금색 단추 + 진행 알약\n\n새 CSS 를 한 줄도 안 쓴다 — .summary-help.event-cta 금색이 이미 있었고\n쓰는 곳이 0건이었다. class 한 단어만 늘렸다.\n\n이름 뒤에 문구를 이어 붙이지 않는다(nowrap+ellipsis 라 잘리는 쪽이 이름이다) —\n.board-new 처럼 알약을 async 로 꽂는다.\n\nNEW 배지는 새 키 stamp 로 — event 키는 9월에 눌러 본 분께 영영 안 뜬다.\n진행 캐시는 event-stamp::<user_id> 로 따로 두고 clearPersonalData 에 넣었다.\n\nCo-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>')" -- app.js style.css
```

---

## Task 10: 관리 화면 (`admin-event.html`)

**Files:**
- Modify: `admin-event.html`

**Interfaces:**
- Consumes: `eventRoster` 의 `rows[].weeksDone/perfect/eligible/excused` 와 `missing[]`(Task 6) ·
  `api.eventSetNote`·`api.eventExcuse`

- [ ] **Step 1: 낡은 주석을 고친다**

`admin-event.html:459` 부근:

```diff
-  // ⚠️ eventSave 는 **받은 것으로 통째로 덮어쓴다.** 화면에 안 보이는 칸(kind)도
-  //    지금 값을 그대로 실어 보내야 한다 — 안 보내면 기본값으로 되돌아간다.
+  // ⚠️ 2026-09-10 이후 서버는 **보낸 칸만 바꾼다**(index.ts 의 `has("needs") ? … : cur.needs`).
+  //    그러니 needs·copy 를 **보내지 않는다** — 보내면 자격 규칙이 조용히 지워지고,
+  //    오류도 안 나며 아무에게도(또는 모두에게) 단추가 열린다.
```

- [ ] **Step 2: `load()` 가 `missing` 을 받게 한다**

`admin-event.html:213` 부근:

```diff
   evEvents = d.events || [];
   evRows = d.rows || [];
+  // 자격은 되는데 아직 신청 안 하신 분(이름·소속만 — 서버가 user_id 를 안 싣는다).
+  // ⚠️ 서버가 300명에서 자른다(.in 의 주소 길이) — 300이면 「외 더 있음」을 덧붙인다.
+  evMissing = d.missing || [];
```

그리고 `let evRows = [];` 옆에 `let evMissing = [];` 를 더한다.

- [ ] **Step 3: 요약 줄에 배지 셋을 더한다**

`evListHtml` 의 `<div class="sum">` 블록, `${evQ||evType||evGroup ? …}` 줄 **바로 위**에:

```js
      ${rows.some(r => r.weeksDone != null) ? `
        <span class="tag">채운 주 3주 이상 ${rows.filter(r=>r.eligible).length}명</span>
        <span class="tag">여섯 주 ${rows.filter(r=>r.perfect).length}명</span>
        <span class="tag">인정 ${rows.filter(r=>r.excused).length}명</span>` : ""}
      ${evMissing.length ? `<span class="tag">아직 신청 안 하신 분 ${evMissing.length}명${
        evMissing.length >= 300 ? " 외 더" : ""}</span>` : ""}
```

⚠️ `rows` 는 이미 `curRows()` 다(`evListHtml` 셋째 줄) — 회차가 좁혀진 뒤의 값이라 안전하다.

- [ ] **Step 4: 표에 「주」 열을 더한다**

`evListHtml` 의 `<thead>` 줄에서 `${head("at","등록일")}` **앞**에 한 칸을 끼운다:

```diff
-      ${head("position","직분")}${head("name","성명")}${head("at","등록일")}<th>기록</th>
+      ${head("position","직분")}${head("name","성명")}${head("weeksDone","주")}${head("at","등록일")}<th>기록</th>
```

그리고 `<tbody>` 의 각 줄에서 등록일 칸 **앞**에:

```diff
-        <td>${esc(r.position)}</td><td><b>${esc(r.name)}</b></td>
+        <td>${esc(r.position)}</td><td><b>${esc(r.name)}</b></td>
+        <td>${r.weeksDone == null ? "" :
+             esc(String(r.weeksDone)) + (r.perfect ? " ✨" : "") + (r.excused ? " (인정)" : "")}</td>
```

⚠️ **숫자 정렬.** `thead th[data-k]` 클릭 정렬은 문자열 비교라 `10 < 2` 가 된다.
`shown()` 의 정렬 비교에 `weeksDone` 갈래를 더한다 — `evSubRank`(375)가 「구역은 글자다」를
다루는 자리 바로 옆이다:

```js
    if (evSort.key === "weeksDone") {
      return (Number(a.weeksDone || 0) - Number(b.weeksDone || 0)) * evSort.dir;
    }
```

- [ ] **Step 5: 규칙을 읽기 전용 한 줄로 보여 준다**

`evListHtml` 의 `<h2>명단 — …</h2>` **바로 아래**:

```js
    ${rows.some(r => r.weeksDone != null) ? `<div class="sum"><span class="tag">
      도장 기간 2026-10-11 ~ 11-21 · 주 3일 · 6주 중 3주 (원본 supabase/event_stamp_2026.sql)
    </span></div>` : ""}
```

⚠️ **편집 칸을 만들지 않는다.** `eventRoster` 는 `events` 에서 `needs` 를 안 돌려주므로
(index.ts:4969-4970) 폼을 만들면 **빈 값을 저장해 규칙을 지우는 쪽**이 먼저 온다.

- [ ] **Step 6: CSV 단추와 보정 두 칸을 더한다**

`<button class="btn" id="q-print">🖨️ 인쇄</button>` **바로 아래**:

```html
      <button class="btn" id="q-csv">⬇️ CSV (찾은 것만)</button>
```

`<td>기록</td>` 칸 안, 기존 배지들 **뒤**에:

```js
        ${r.weeksDone == null ? "" : ` <button class="btn no-print" data-excuse="${r.id}" data-on="${r.excused?0:1}">${r.excused?"인정 취소":"인정"}</button>`}
        <button class="btn no-print" data-note="${r.id}">메모</button>
```

`wire()` 안(`q-print` 를 잇는 줄 아래)에 셋을 잇는다:

```js
  const cs = document.getElementById("q-csv");
  if(cs) cs.addEventListener("click", downloadCsv);
  app.querySelectorAll("[data-excuse]").forEach(b => b.addEventListener("click", () =>
    askExcuse(Number(b.getAttribute("data-excuse")), b.getAttribute("data-on") === "1")));
  app.querySelectorAll("[data-note]").forEach(b => b.addEventListener("click", () =>
    askNote(Number(b.getAttribute("data-note")), "")));
```

⚠️ `wire()` 는 `render()` 뒤에 불려야 하고, 조건부로 생기는 단추라 **`if(…)` 로 감싼다**
(`q-print` 등 기존 줄이 이미 그 꼴이다).

그리고 `kstDate` 함수 아래에 셋을 더한다:

```js
// ⚠️ 「찾은 것만」 나간다 — 화면에서 좁혀 놓고 전체가 나가면 담당자가 모르고 쓴다.
function downloadCsv(){
  const rows = shown();
  const head = ["이름","구분","소속","목장·학년","직분","주","여섯주","인정","등록일","메모"];
  const body = rows.map(r => [r.name, r.whoType, r.group, r.sub, r.position,
    r.weeksDone ?? "", r.perfect ? "O" : "", r.excused ? "O" : "",
    kstDate(r.at), (r.memo||"").replace(/[

]+/g," ")]);
  const csv = [head, ...body]
    .map(cols => cols.map(c => `"${String(c ?? "").replace(/"/g,'""')}"`).join(",")).join("

");
  // ⚠️ BOM 을 붙인다 — 없으면 엑셀이 한글을 깨뜨린다
  const blob = new Blob(["﻿" + csv], { type:"text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${evPick || "event"}-명단.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// 사정이 있으셨던 주를 인정 — 사유를 반드시 받는다(비우면 서버가 no-reason 으로 막는다)
async function askExcuse(id, on){
  const reason = on ? prompt("사유를 적어 주세요 (예: 10월 3주 입원)") : "";
  if(on && !reason) return;
  const d = await callApi({ action:"eventExcuse", pw:getPw(), id, excused:on, reason });
  if(!guard(d)) return;
  if(!d.ok){ alert("바꾸지 못했습니다 — " + (d.error||"")); return; }
  await load(evPick);
}
async function askNote(id, cur){
  const note = prompt("담당자 메모 (성도님께는 안 보입니다)", cur || "");
  if(note == null) return;
  const d = await callApi({ action:"eventSetNote", pw:getPw(), id, note });
  if(!guard(d)) return;
  if(!d.ok){ alert("저장하지 못했습니다 — " + (d.error||"")); return; }
  await load(evPick);
}
```

- [ ] **Step 7: 문법을 보고 localhost 에서 확인한다**

```bash
python tools/preflight.py
```

`http://localhost:8000/admin-event.html` → 개발 관리자 비번 → `autumn-2026` 회차 →
확인할 것: 「주」 열이 보인다 · 요약 배지 숫자가 맞다 · CSV 가 엑셀에서 한글이 안 깨진다 ·
인정 단추가 사유 없이는 저장되지 않는다.

- [ ] **Step 8: 커밋**

```bash
git commit -m "$(printf 'feat(이벤트 관리): 주 열 · 요약 배지 · CSV · 보정 두 칸\n\n시상 근거를 화면에서 바로 본다. needs 편집 칸은 일부러 안 만들었다 —\neventRoster 가 needs 를 안 돌려줘서 폼을 만들면 빈 값으로 규칙을 지우는 쪽이 먼저 온다.\n읽기 전용 한 줄만 두고 원본은 supabase/event_stamp_2026.sql 한 파일이다.\n\n459 의 낡은 주석을 고쳤다 — 서버는 2026-09-10 부터 보낸 칸만 바꾸는데\n주석이 여전히 「통째로 덮어쓴다」라고 말해, 믿고 needs 를 실어 보내면 규칙이 지워진다.\n\nCo-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>')" -- admin-event.html
```

---

## Task 11: 개인정보 · 계측 · 운영 배포

**Files:**
- Modify: `privacy/index.html`
- Modify: `app.js` (앱 안 개인정보 화면의 같은 문구)
- Modify: `supabase/functions/api/index.ts` (`FEATURES` 에 `event`)
- Modify: `index.html`·`app.js`·`style.css`·`js/*.js` (`tools/bump.py` 가 자동으로)

- [ ] **Step 1: `privacy/index.html` 에 한 줄 더한다**

`141` 부근 「이름과 소속은 도전 순위와 게시판에서…」 **바로 아래**:

```html
<li><b>이벤트에 신청하시면</b> 이름과 소속이 그 이벤트 명단에서 다른 성도님께 보입니다.
    명단은 이벤트가 끝나고 정해진 날까지만 보이고, 그 뒤에는 사라집니다.</li>
```

- [ ] **Step 2: 앱 안 개인정보 화면에 같은 문구를 더한다**

`app.js` 에서 `privacy` 화면을 그리는 자리를 찾아(`renderPrivacy` 계열) 같은 뜻의 한 줄을 더한다.

```bash
grep -n "도전 순위와 게시판" app.js
```
로 자리를 찾고, 그 문장 옆에 이벤트 명단을 더한다.
⚠️ **두 곳의 말이 달라지면 안 된다** — 같은 문장을 쓴다.

- [ ] **Step 3: `FEATURES` 에 `event` 를 더한다**

```diff
   "push",             // 알림을 눌러 앱이 열림
+  "event",            // 이벤트 화면을 엶 — ⚠️ 개시일부터 켠다. 나중에 켜면 그 구간이 영구히 빈다
 ]);
```

그리고 `js/events.js` 의 `renderEventList` 첫머리에서 한 번 부른다:

```js
  try { if (window.api && api.featureLog && u.user_id) api.featureLog(u.user_id, "event", ""); } catch (e) {}
```

⚠️ `api.featureLog` 의 인자 차례는 `js/api.js` 에서 확인하고 맞춘다.

- [ ] **Step 4: 개발에 배포하고 스모크를 마지막으로 돌린다**

```bash
git status --short
supabase functions deploy api --no-verify-jwt --project-ref ktpwthwqzgcqcrmsafdo
bash tests/event-smoke.sh
bash tests/smoke-readonly.sh
bash tests/feature-log-smoke.sh
```
기대: 셋 다 `실패 0`.

- [ ] **Step 5: 판 번호를 올린다**

```bash
python tools/bump.py
python tools/preflight.py
```
기대: `bump.py` 가 `?v=` 태그·`.splash-ver`·`APP_BUILD` 를 함께 올린다. `preflight` 전부 통과.
⚠️ **손으로 고치지 않는다.** 태그 하나를 빠뜨리면 옛 파일이 브라우저에 남는다.

- [ ] **Step 6: 커밋하고 민다**

```bash
git commit -m "$(printf 'feat(이벤트): 개인정보 두 곳 · 이벤트 화면 계측 · 판 올림\n\n명단이 공개되는데 privacy/ 4장은 순위·게시판·사진 셋만 적고 있었다.\n앱 안 화면과 **같은 문장**으로 두 곳에 더했다.\n\nfeatureLog 의 event 는 개시일부터 켠다 — 나중에 켜면 그 구간이 영구히 빈다.\n\nCo-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>')" -- privacy/index.html app.js js/events.js supabase/functions/api/index.ts index.html style.css js/api.js
git push
```

⚠️ `bump.py` 가 건드린 파일이 더 있으면 `git status --short` 로 보고 **그것만** 더한다.

- [ ] **Step 7: 운영에 Edge Function 을 배포한다**

```bash
git status --short          # ⚠️ 남의 미커밋 코드가 index.ts 에 없는지 **반드시** 본다
supabase functions deploy api --no-verify-jwt --project-ref xnomlgydifiqiybervtf
```

⚠️ `supabase functions deploy` 는 git 이 아니라 **작업 트리**를 올린다 — 남의 커밋 안 된 코드도 함께 나간다(2026-09-10 실제 사고).

- [ ] **Step 8: 운영 SQL 을 순서대로 돌린다**

운영 SQL Editor(`xnomlgydifiqiybervtf`)에서 **이 차례로**:

1. `supabase/event_streak.sql` 전체
2. 확인: `select proname, proacl from pg_proc where proname='v2_event_weeks' and (proacl::text like '%anon=%' or proacl::text like '%authenticated=%');` → **0행**
3. `supabase/event_stamp_2026.sql` 전체 (회차가 `draft` 로 들어간다 — 아직 아무도 못 본다)
4. 확인: `select id,status,opens_on,closes_on,list_until from public.events where status in ('open','closed') order by closes_on;`
   → ✅ **2026-09-23 확인: `summer-2026` 은 이미 목록에서 빠졌다**
     (`status='closed'` · `list_until='2026-09-20'` 이 지났다). 그래서 지금 첫 화면에는
     이벤트 단추가 **아예 없고**, 이 기능을 배포해도 10/11 에 `draft → open` 을 누르기
     전까지 성도님 화면은 안 바뀐다.
   → 그래도 **이 자리에서 한 번 더 본다.** 그 사이 누가 회차를 열어 둘이 되면
     첫 화면 라벨이 「이벤트 2개」로 접혀(app.js:365) 진행 줄의 주인이 사라진다.

⚠️ `dev_seed_stamp.sql` 은 **절대 운영에 돌리지 않는다.**

- [ ] **Step 9: 배포를 「이번 판에만 있는 표식」으로 확인한다**

```bash
V=$(grep -o 'app.js?v=[0-9a-z]*' index.html | head -1 | cut -d= -f2)
curl -s "https://gocheok.onlybible.kr/app.js?v=$V" | grep -o 'APP_BUILD = "[0-9a-z]*"'
curl -s "https://gocheok.onlybible.kr/app.js?v=$V" | grep -c 'event-stamp::'
```
기대: `APP_BUILD` 가 `index.html` 의 `?v=` 와 **같다** · 둘째 명령이 **1 이상**.
⚠️ 이전 판에도 있던 이름으로 검사하면 CDN 이 옛 파일을 내보내도 통과해 「배포 완료」로 오인한다.

- [ ] **Step 10: 운영에서 관리자 암호로 draft 회차가 서는지 본다**

```bash
ADMIN_PW=<운영 관리자 비번> EVT_ENV=prod bash tests/event-smoke.sh
```
기대: `실패 0`. **여기까지 성도님 화면은 한 번도 바뀌지 않았다.**

---

## 개시 — 사람이 손으로 하는 한 번

- [ ] **2026-10-11(주일) 아침** — `admin-event.html` 에서 `autumn-2026` 의 상태를
      **`draft` → `open`** 으로 바꾼다. **이것이 개시 행위다.**
      직후 확인 둘: ① 첫 화면에 금색 단추가 뜨는지 ② 알약의 도장 수가 그날 암송과 맞는지
- [ ] **2026-10-27** — 신청 창이 날짜로 저절로 열린다(손댈 것 없다). 열린 날 목장·주보로 알린다
- [ ] **2026-11-22 이후** — 관리 화면에서 명단·CSV 를 뽑는다.
      「자격은 되는데 아직 신청 안 하신 분」도 함께 본다
- [ ] **12월** — `supabase/event_streak_metrics.sql` 을 같은 창 규칙으로 다시 돌려 결과란에 적는다.
      `list_until`(12/13)이 지나면 단추는 저절로 사라진다

---

## 자체 점검 (계획을 쓴 뒤 설계와 대조한 결과)

| 설계 §  | 무엇 | 어느 과제 |
|---|---|---|
| §3 규칙·중간 합류 | `evtNeedFor` · `v2_event_weeks.first_day` | Task 2·4 |
| §4 날짜 두 쌍 | `opens_on` 10/27 · `needs.eligibility.start` 10/11 | Task 7 |
| §5 mode 를 안 센다 | RPC 가 `group by day` 만 한다 | Task 2 (+ Task 3 가 카드를 섞어 지킨다) |
| §6.1 `needs.eligibility` | `event_stamp_2026.sql` | Task 7 |
| §6.2 `eventStamps`·`phase`·`canStillReach` | 새 액션 | Task 4 |
| §6.3 RPC·인덱스·권한 | `event_streak.sql` | Task 2 |
| §6.4 `evtToday()` | 모든 새 코드가 그것만 쓴다 | Task 4·5 |
| §6.5 재검사·슬러그·`answers` | `eventSignup` | Task 5 |
| §6.6 ✨ 는 종료 뒤 재계산 | `eventRoster` 가 매번 다시 센다 | Task 6 |
| §6.7 담당자용·보정·`missing` | `eventRoster`·`eventSetNote`·`eventExcuse` | Task 6 |
| §7.1 금색·알약·NEW·캐시·게이트 | `app.js` | Task 9 |
| §7.2 도장판 위치·잠금·모른다·오류문구·`copy` | `js/events.js` | Task 8 |
| §7.3 관리 화면 | `admin-event.html` | Task 10 |
| §8 문구 | 도장판·알약·완료·오류 | Task 8·9 |
| §9 기준선·`featureLog` | `event_streak_metrics.sql`·`FEATURES` | Task 1·11 |
| §10 개인정보 두 곳·공개 명단 | `privacy/`·앱 안 화면 | Task 11 |
| §11 계정 합치기 | ⚠️ **과제로 만들지 않았다** — 개시 전 담당자가 `adminPreviewMemberMerge` 로 한 번 훑는 **운영 절차**다. 위 「개시」 목록에 없으니 담당자에게 따로 알린다 |
| §13 배포 순서 | 코드 먼저 · `git status` 먼저 | Task 11 |

⚠️ **설계 §11(계정이 갈린 분)의 「관리자 전용 신청 삭제」는 이 계획에 없다.**
이번 회차는 신청이 10/27 부터라 개시 전 합치기로 충분하고, 액션을 하나 더 만드는 값어치가
그 위험보다 크지 않다고 보았다. **필요해지면 그때 만든다** — 그 판단을 여기 적어 둔다.
