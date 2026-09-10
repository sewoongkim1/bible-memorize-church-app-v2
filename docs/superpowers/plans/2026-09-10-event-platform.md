# 이벤트 플랫폼 구현 계획 (1~3단계)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 분기별로 회차를 여는 이벤트 플랫폼의 뼈대 — 표 둘 · Edge Function 액션 다섯 · 앱 화면 둘 — 을 만들어 `?preview=event`로 끝까지 확인할 수 있는 상태까지 간다.

**Architecture:** `events`(회차 정의) + `event_signups`(참가 기록) 두 표에 Edge Function 액션 다섯을 얹고, 앱 화면은 `js/events.js` 새 파일에 짓는다. 참여는 로그인한 앱 사용자만 가능하고(`user_id`가 신원의 전부), 「이벤트당 한 번」은 DB의 unique 제약 하나가 지킨다. 노출은 설정 키가 아니라 **데이터 자체**가 결정한다 — 열린 회차가 없으면 아무것도 보이지 않는다.

**Tech Stack:** Supabase Postgres · Deno Edge Function(`supabase/functions/api/index.ts`) · Vanilla JS(프레임워크 없음) · GitHub Pages

**설계 문서:** `docs/superpowers/specs/2026-09-10-event-platform-design.html`

**이 계획의 범위:** 설계 문서의 작업 순서 **1 · 1½ · 2 · 3단계**. 4단계(관리자 화면)·6단계(명단 이관)·7단계(첫 화면 단추)·8단계(운영 반영)는 남은 질문의 답을 받은 뒤 별도 계획서로 만든다. 이 계획을 끝내면 **관리자가 `?preview=event`로 성도님 화면을 그대로 확인할 수 있고, 성도님 화면에는 아무것도 나타나지 않는다.**

---

## Global Constraints

이 절의 값은 모든 Task에 적용된다. 하나라도 어기면 그 Task는 미완성이다.

- **개발 Supabase ref `ktpwthwqzgcqcrmsafdo` · 운영 `xnomlgydifiqiybervtf`.** `js/config.js`가 주소로 저절로 고른다(`gocheok.onlybible.kr`만 운영). 사람이 손으로 바꾸지 않는다.
- **SQL은 개발 DB에서 먼저 돌린 뒤 운영.** 운영 마이그레이션은 되돌릴 수 없다.
- **표를 만들면 그 자리에서 `alter table ... enable row level security;`** — 정책은 두지 않는다(= 기본 차단, Edge Function의 service_role만 통과). 이 한 줄을 빠뜨려 `event_entries`의 `user_id` 47건이 공개 키로 읽힌 사고가 있었다.
- **어떤 응답에도 `user_id`를 싣지 않는다.** 이 API는 `--no-verify-jwt`라 남의 `user_id` 하나면 그 사람 행세가 된다. 응답은 반드시 **화이트리스트 정형화 함수**를 지난다(스프레드 `...row`를 쓰지 않는다).
- **`{ ok: false }`를 돌려줄 때는 반드시 `error` 슬러그를 함께 싣는다.** `js/api.js`의 `supaCall`은 `data.error`가 없으면 성공으로 읽는다.
- **CHECK 제약은 언제나 `drop constraint if exists` → `add constraint` 쌍으로.** 여러 번 돌려도 안전해야 한다.
- **표를 개발·운영 양쪽에 먼저 만들고 나서 코드를 커밋한다.** Edge Function은 파일 하나를 통째로 배포하므로, 내가 커밋한 코드는 **다음에 누가 배포하든** 운영으로 나간다(2026-09-10 `getVerses` 장애).
- **공용 경로를 건드리지 않는다.** `getVerses`·`login`·`ranking`·파일 최상단·`PUBLIC_CONFIG_KEYS`·`app_config` 전부 손대지 않는다.
- **`git add -A` 금지.** `booklet/`·`psalm/`에 다른 작업물이 커밋 대기로 상주한다. `app.js`·`style.css`·`index.html`처럼 여럿이 함께 쓰는 파일은 **내 헝크만** 담는다(`git add -p`).
- **`python tools/bump.py`는 배포할 때만 돌린다.** 이 계획에는 bump 단계가 없다(운영 배포는 8단계, 별도 계획).
- **노출은 「닫힌 쪽으로 실패」한다.** 상태는 불리언이 아니라 `unknown` / `none` / `some` **세 값**이고, 숨기는 것은 같아도 **할 말이 다르다** — 「지금 불러올 수 없어요」와 「지금 열린 이벤트가 없어요」를 섞지 않는다.
- **직분 목록은 사역신청의 것을 그대로 쓴다:** `MIN_POSITIONS = ["성도","집사","권사","안수집사","장로","전도사","목사","학생"]` (index.ts:3586). 따로 만들면 갈라진다.
- **전화번호 정규식·정규화도 그대로 쓴다:** `PILSA_PHONE_RE`(index.ts:2621) · `pilsaPhone()`(index.ts:2624).
- **전화번호를 다른 기능(필사·사역신청)에서 가져오지 않는다.** `privacy/`가 용도를 한정해 적어 두었다.
- **성도가 적은 값은 화면에 그릴 때 반드시 escape.** 화면마다 자기 헬퍼를 둔다(`evtEsc`).

---

## File Structure

| 파일 | 책임 | 새로 만드나 |
|---|---|---|
| `supabase/events.sql` | 표 둘의 정의 · 제약 · 인덱스 · RLS | **새로** |
| `supabase/functions/api/index.ts` | 액션 다섯 + 헬퍼 넷을 파일 **아래쪽에** 배너 주석과 함께 추가, `switch`에 5줄 | 수정(추가만) |
| `js/api.js` | 클라이언트 래퍼 5줄 | 수정(추가만) |
| `js/events.js` | 이벤트 화면 전부(상태·불러오기·목록·폼·딥링크) | **새로** |
| `index.html` | `js/events.js` 스크립트 태그 1줄(`app.js`보다 **앞**) | 수정(1줄) |
| `tools/bump.py` | `TAGGED` 목록에 `js/events.js` 1줄 | 수정(1줄) |
| `style.css` | 파일 **맨 끝**에 `.ev-` 구역 | 수정(끝에 추가) |
| `app.js` | `getPreviewKind` 화이트리스트에 `"event"` · `routeAfterLoad`에 분기 4줄 | 수정(작은 헝크 2개) |
| `tests/event-smoke.sh` | 읽기 전용 스모크 | **새로** |

`js/events.js`를 별도 파일로 두는 이유: **지금 세 세션이 `app.js`를 함께 쓰고 있다.** 화면 코드를 밖에 지으면 충돌 표면이 「분기 4줄 + 한 단어」로 줄어든다. 시편 액자(`js/psalm.js`)가 같은 이유로 그렇게 했고, `loadUser`·`homeFabLabel`·`stopSpeaking` 같은 app.js 전역 함수는 그대로 빌려 쓴다(전역이라 런타임에 그냥 불린다).

---

## ⚠️ 설계 문서에서 고쳐야 할 것 하나

설계 문서는 중복 방지를 **부분 unique 인덱스**로 적었다:

```sql
create unique index event_signups_uniq
  on public.event_signups (event_id, user_id) where user_id is not null;   -- ❌
```

**이건 동작하지 않는다.** PostgREST의 `upsert(..., { onConflict: "event_id,user_id" })`는 `ON CONFLICT (event_id, user_id)`로 번역되는데, PostgreSQL은 **부분 인덱스를 추론에 쓰지 못한다** → `there is no unique or exclusion constraint matching the ON CONFLICT specification` 오류가 난다. 「고치기 = 덮어쓰기」가 통째로 막힌다.

**바른 형태는 부분이 아닌 일반 unique 제약이다:**

```sql
constraint event_signups_uniq unique (event_id, user_id)                    -- ✅
```

이것으로 의도가 그대로 지켜진다 — PostgreSQL은 unique 제약에서 **NULL을 서로 다른 값으로 본다**(기본 `NULLS DISTINCT`). 그래서 `user_id`가 `NULL`인 이관 행은 몇 개든 들어가고, `user_id`가 있는 앱 등록만 「회차당 한 번」에 묶인다. **부분 인덱스가 하려던 일을 NULL의 성질이 이미 해 준다.** Task 1에 바른 형태로 들어가 있고, Task 1의 마지막 단계에서 설계 문서도 고친다.

---

## Task 1: 표 둘 만들기

**Files:**
- Create: `supabase/events.sql`
- Modify: `supabase/dev-setup.md` (1절 파일 목록에 한 줄)
- Modify: `docs/superpowers/specs/2026-09-10-event-platform-design.html` (부분 unique → 일반 unique)

**Interfaces:**
- Consumes: 없음(첫 Task)
- Produces: 표 `public.events`(PK `id text`) · `public.event_signups`(PK `id bigserial`, unique `(event_id, user_id)`). Task 2가 이 컬럼 이름을 그대로 쓴다.

- [ ] **Step 1: `supabase/events.sql` 을 만든다**

```sql
-- 이벤트 플랫폼 — 회차 정의 + 참가 기록
-- ⚠️ 이 저장소는 공개(public)입니다 — 비밀번호·키를 절대 넣지 마세요.
--
-- 적용: Supabase 대시보드 → SQL Editor에 붙여넣고 실행
-- ⚠️ **개발 DB(ktpwthwqzgcqcrmsafdo)에 먼저** 돌린 뒤 운영(xnomlgydifiqiybervtf).
-- ⚠️ 여러 번 돌려도 안전하다(if not exists · drop/add 쌍).
--
-- 설계: docs/superpowers/specs/2026-09-10-event-platform-design.html
-- 계획: docs/superpowers/plans/2026-09-10-event-platform.md
--
-- 왜 표 둘인가 — 지금 앱의 이벤트는 회차 설정을 app_config('event') 한 행에 담아
-- 다음 회차를 열면 지난 회차가 덮여 사라진다. 분기마다 도는 것이 전제라면
-- 3년에 회차가 열둘이고, 그 시점에는 이미 성도님 기록이 얹혀 있다.

-- ① 회차 정의 ------------------------------------------------------
create table if not exists public.events (
  id          text        primary key,          -- 'summer-2026' 사람이 읽는 슬러그
  title       text        not null,             -- '2026 썸머 써 바이블 완서자 등록'
  subtitle    text        not null default '',
  season      text        not null default '',  -- '2026-3Q' 목록 묶음 표기
  kind        text        not null default 'signup',
  opens_on    date        not null,
  closes_on   date        not null,
  status      text        not null default 'draft',
  needs       jsonb       not null default '{}'::jsonb,  -- 무엇을 받는가
  copy        jsonb       not null default '{}'::jsonb,  -- 화면 문구
  sort_order  int         not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.events drop constraint if exists events_status_chk;
alter table public.events add  constraint events_status_chk
  check (status in ('draft', 'open', 'closed', 'archived'));

alter table public.events drop constraint if exists events_kind_chk;
alter table public.events add  constraint events_kind_chk
  check (kind in ('signup', 'quiz'));

-- 마감일이 시작일보다 앞설 수 없다(화면·서버에도 있지만 마지막 방어선을 DB에 둔다)
alter table public.events drop constraint if exists events_period_chk;
alter table public.events add  constraint events_period_chk
  check (closes_on >= opens_on);

create index if not exists idx_events_status on public.events (status, closes_on);

-- ② 참가 기록 ------------------------------------------------------
create table if not exists public.event_signups (
  id          bigserial   primary key,
  event_id    text        not null references public.events (id) on delete cascade,

  -- 앱에서 낸 것은 반드시 채워진다. NULL 은 이관된 옛 기록뿐이다.
  user_id     uuid        references public.users (id) on delete cascade,

  -- users.identity_key 와 **같은 규칙**(여섯 조각). 쓰임은 둘뿐이다:
  --   ① 이관된 옛 기록(user_id 없음)을 사람에 붙이기
  --   ② 직분 기본값을 지난 기록에서 찾기
  -- 중복 판정은 이 칸이 하지 않는다 — user_id 가 한다.
  ident_key   text        not null,

  -- 신원 스냅샷 — 그때 무엇을 냈는지가 남는다(사역신청과 같은 이유).
  who_type    text        not null,              -- '교구' | '교회학교'
  group_name  text        not null,              -- 교구 | 부서
  sub_name    text        not null default '',   -- 목장 | 학년
  name        text        not null,

  position    text        not null default '',   -- needs.position 일 때만
  phone       text        not null default '',   -- needs.phone 일 때만
  memo        text        not null default '',   -- 성도가 남기는 한 줄
  answers     jsonb       not null default '{}'::jsonb,

  note        text        not null default '',   -- 담당자 메모 — 성도 응답에 절대 싣지 않는다
  source      text        not null default 'app',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- 「이벤트당 한 번」 — 이 한 줄이 중복 검사를 대신한다.
  -- ⚠️ 부분 인덱스(where user_id is not null)로 쓰면 안 된다 — PostgreSQL 은 부분
  --    인덱스를 ON CONFLICT 추론에 쓰지 못해 upsert(고치기)가 통째로 막힌다.
  --    일반 unique 로 두면 의도가 그대로 지켜진다: unique 제약은 NULL 을 서로 다른
  --    값으로 보므로(기본 NULLS DISTINCT) user_id 가 NULL 인 이관 행은 몇 개든
  --    들어가고, user_id 가 있는 앱 등록만 회차당 하나로 묶인다.
  constraint event_signups_uniq unique (event_id, user_id)
);

-- 참여는 앱을 통해서만 — user_id 없는 행은 「이관된 옛 기록」뿐이다.
alter table public.event_signups drop constraint if exists event_signups_app_only_chk;
alter table public.event_signups add  constraint event_signups_app_only_chk
  check (user_id is not null or source = 'import');

alter table public.event_signups drop constraint if exists event_signups_source_chk;
alter table public.event_signups add  constraint event_signups_source_chk
  check (source in ('app', 'import'));

create index if not exists idx_event_signups_at
  on public.event_signups (event_id, created_at desc);

-- 회차를 넘어 「이 사람의 기록」을 찾는다 — 직분 기본값 · 옛 기록 매칭
create index if not exists idx_event_signups_ident
  on public.event_signups (ident_key);

-- ③ RLS — 정책을 두지 않는다 = 기본 차단. Edge Function(service_role)만 통과.
alter table public.events        enable row level security;
alter table public.event_signups enable row level security;

-- 확인 ①: 표와 제약이 다 들어갔는지
--   select conname from pg_constraint
--    where conrelid in ('public.events'::regclass, 'public.event_signups'::regclass)
--    order by 1;
--   → events_kind_chk · events_period_chk · events_pkey · events_status_chk ·
--     event_signups_app_only_chk · event_signups_event_id_fkey · event_signups_pkey ·
--     event_signups_source_chk · event_signups_uniq · event_signups_user_id_fkey
--
-- 확인 ②: RLS 가 켜졌는지 (둘 다 t 여야 한다)
--   select relname, relrowsecurity from pg_class
--    where relname in ('events','event_signups');
--
-- 확인 ③: 공개 키로 새어 나가지 않는지 (행이 오면 열려 있는 것이다 — 와야 할 응답은 빈 배열)
--   GET {SUPABASE_URL}/rest/v1/events?select=*&limit=1
```

- [ ] **Step 2: 개발 DB에서 실행하고 확인 ①②로 검증한다**

`ktpwthwqzgcqcrmsafdo` 대시보드 → SQL Editor → 위 파일 전체를 붙여넣고 실행.

그 다음 확인 ①을 돌린다. 기대: 위 주석에 적은 **제약 10개**가 모두 나온다.
확인 ②를 돌린다. 기대: `events | t` · `event_signups | t` 두 줄.

⚠️ 확인 ②가 `f`면 **여기서 멈춘다.** RLS가 꺼진 표는 공개 키로 읽힌다.

- [ ] **Step 3: 공개 키로 새어 나가지 않는지 확인한다 (확인 ③)**

Run:
```bash
curl -s "https://ktpwthwqzgcqcrmsafdo.supabase.co/rest/v1/events?select=*&limit=1" \
  -H "apikey: sb_publishable_eJKP6u95IU9_DBXTvnvYBA_-yGCf-0Y"
```
Expected: `[]` 가 아니라 권한 오류 JSON(예 `{"code":"42501",...}`) 또는 빈 배열 `[]`.
**행 하나라도 담긴 배열이 오면 실패다** — RLS가 안 걸린 것이므로 Step 2로 돌아간다.

- [ ] **Step 4: 운영 DB에도 같은 파일을 실행한다**

`xnomlgydifiqiybervtf` 대시보드 → SQL Editor → 같은 파일 전체 → 실행 → 확인 ①②를 똑같이 돌린다.

**왜 지금 하는가:** 빈 표는 아무도 읽지 않으므로 위험이 없고, 이것으로 「코드가 표보다 먼저 나가는」 사고를 원천 차단한다. Task 2에서 코드를 커밋하는 순간 그 코드는 **다음에 누가 배포하든** 운영으로 나간다.

- [ ] **Step 5: `supabase/dev-setup.md` 의 1절 파일 목록에 한 줄 더한다**

`supabase/dev-setup.md`를 열어 1절의 「③ 기능표」 묶음에서 `pilsa_orders.sql` 줄을 찾아 그 아래에 같은 서식으로 넣는다:

```markdown
- `events.sql` — 이벤트 플랫폼(회차 정의 + 참가 기록)
```

- [ ] **Step 6: 설계 문서의 부분 unique 를 일반 unique 로 고친다**

`docs/superpowers/specs/2026-09-10-event-platform-design.html`에서 아래 두 곳을 고친다.

첫째, `<pre>` 안의 DDL:
```
<i>-- 「이벤트당 한 번」 — 이 한 줄이 중복 검사를 대신한다(⑧)</i>
<i>-- 부분 unique: 이관된 옛 기록(user_id null)은 이 규칙 밖이다</i>
create unique index if not exists event_signups_uniq
  on public.event_signups (event_id, user_id) <b>where user_id is not null</b>;
```
이것을 아래로 바꾼다:
```
<i>-- 「이벤트당 한 번」 — 이 한 줄이 중복 검사를 대신한다(⑧)</i>
<i>-- ⚠️ 부분 인덱스(where user_id is not null)로 쓰면 안 된다 — PostgreSQL 은 부분</i>
<i>--    인덱스를 ON CONFLICT 추론에 쓰지 못해 upsert(고치기)가 통째로 막힌다.</i>
<i>--    일반 unique 로 두면 의도가 그대로 지켜진다: NULL 은 서로 다른 값으로 보므로</i>
<i>--    이관 행(user_id null)은 몇 개든 들어가고 앱 등록만 회차당 하나로 묶인다.</i>
  <b>constraint event_signups_uniq unique (event_id, user_id)</b>
```

둘째, 「제안 · 02」의 데이터 설명에서 `unique가 <code>(event_id, user_id)</code>라` 로 시작하는 문장은 그대로 두어도 맞다(부분이라고 적혀 있지 않다). `제안 · 04` 이관 절의 「부분 unique에 걸려 이관이 멈춘다」는 문장을 「같은 회차·같은 사람이 두 번 들어가 명단이 부풀어 오른다(이관 행은 `user_id`가 없어 unique가 막아 주지 않는다)」로 바꾼다.

- [ ] **Step 7: 커밋**

```bash
git add supabase/events.sql supabase/dev-setup.md docs/superpowers/specs/2026-09-10-event-platform-design.html
git commit -m "feat(이벤트 플랫폼): 표 둘 — 회차 정의 + 참가 기록

「이벤트당 한 번」을 unique 제약 하나가 지킨다. 상태 컬럼도 중복 검사도 없다.
user_id 없는 행은 이관된 옛 기록뿐이며 CHECK 로 굳혔다.

⚠️ 부분 unique 를 쓰지 않는다 — PostgreSQL 은 부분 인덱스를 ON CONFLICT 추론에
쓰지 못해 upsert(고치기)가 통째로 막힌다. 일반 unique 로 두면 NULL 이 서로 다른
값으로 취급되어 의도가 그대로 지켜진다.

개발·운영 양쪽 DB 에 먼저 적용한 뒤 커밋한다(Edge Function 은 파일 통째로
배포되므로 내 커밋이 남의 배포에 실려 나간다)."
```

---

## Task 2: Edge Function 액션 다섯 + 클라이언트 래퍼 + 스모크

**Files:**
- Modify: `supabase/functions/api/index.ts` (switch에 5줄 · 파일 끝에 헬퍼·액션 블록)
- Modify: `js/api.js` (`api` 객체에 5줄)
- Create: `tests/event-smoke.sh`

**Interfaces:**
- Consumes: Task 1의 표 `events` · `event_signups`. 기존 헬퍼 `json` · `adminError(b)` · `norm(s)` · `identityKey(u)` · `db` · `MIN_POSITIONS` · `PILSA_PHONE_RE` · `pilsaPhone(v)`.
- Produces:
  - `eventOpenList({user_id?, pw?}) → {ok:true, events:EvtView[], mine:EvtSignupView[], positionHint:string}`
  - `eventSignup({user_id, event_id, position?, phone?, memo?, answers?, pw?}) → {ok:true, signup:EvtSignupView}`
  - `eventDrop({user_id, id, pw?}) → {ok:true}`
  - `eventRoster({pw, event_id?}) → {ok:true, events:EvtAdminEvent[], rows:EvtAdminRow[]}`
  - `eventSave({pw, event:{...}}) → {ok:true, event:<events 행>}`
  - `EvtView = {id,title,subtitle,season,kind,opensOn,closesOn,status,needs,copy,canSignup,mine,sortOrder}`
  - `EvtSignupView = {id,eventId,position,phone,memo,answers,at}` — **`user_id`·`ident_key`·`note` 없음**
  - `EvtAdminRow = {id,eventId,name,whoType,group,sub,position,phone,memo,note,source,at,hasUser}` — **`user_id` 없음**
  - `js/api.js`: `api.eventOpenList(user_id)` · `api.eventSignup(payload)` · `api.eventDrop(user_id, id)` · `api.eventRoster(pw, event_id)` · `api.eventSave(pw, event)`
  - Task 3이 이 이름과 모양을 그대로 쓴다.

- [ ] **Step 1: 실패하는 스모크 테스트를 먼저 쓴다 — `tests/event-smoke.sh`**

```bash
#!/usr/bin/env bash
# 이벤트 플랫폼 — 읽기 전용 스모크. 기본은 개발 DB.
#   bash tests/event-smoke.sh                                개발
#   EVT_ENV=prod bash tests/event-smoke.sh                   운영
# 관리자 액션까지 보려면(비번을 아는 사람만):
#   ADMIN_PW=... bash tests/event-smoke.sh
#
# ⚠️ 쓰기(등록·저장)는 검사하지 않는다 — 성도님 DB에 쓰레기를 남기지 않으려고
#    거부되어야 하는 요청만 던진다. 실제 등록은 브라우저에서 확인한다.
set -u
if [ "${EVT_ENV:-dev}" = "prod" ]; then
  BASE="https://xnomlgydifiqiybervtf.supabase.co/functions/v1/api"
  KEY="sb_publishable_oLtieT_jw7Gjb8etEsy0jw_thBaDjl-"
else
  BASE="https://ktpwthwqzgcqcrmsafdo.supabase.co/functions/v1/api"
  KEY="sb_publishable_eJKP6u95IU9_DBXTvnvYBA_-yGCf-0Y"
fi

call() {
  curl -s -X POST "$BASE" -H "Content-Type: application/json" \
    -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -d "$1"
}

pass=0; fail=0; skip=0
chk() { # 이름, 실제, 기대
  if [ "$2" = "$3" ]; then echo "  ✓ $1 = $2"; pass=$((pass+1));
  else echo "  ✗ $1 = $2  (기대 $3)"; fail=$((fail+1)); fi
}
sk() { echo "  − $1 … 건너뜀 ($2)"; skip=$((skip+1)); }

# 파이썬 표현식을 sys.argv[1]로 넘긴다(코드 문자열에 갖다 붙이지 않는다).
jqn() {
  python -c '
import json, sys
d = json.load(sys.stdin)
print(eval(sys.argv[1]))
' "$1" <<< "$2"
}

echo "① eventOpenList — 로그인 없이도 목록은 열린다"
L=$(call '{"action":"eventOpenList"}')
chk "ok" "$(jqn 'd.get("ok")' "$L")" "True"
chk "events 가 배열" "$(jqn 'isinstance(d.get("events"), list)' "$L")" "True"
chk "mine 이 배열" "$(jqn 'isinstance(d.get("mine"), list)' "$L")" "True"
chk "draft 회차는 안 실린다" "$(jqn 'all(e["status"] != "draft" for e in d["events"])' "$L")" "True"
chk "archived 회차는 안 실린다" "$(jqn 'all(e["status"] != "archived" for e in d["events"])' "$L")" "True"
chk "user_id 를 싣지 않는다" "$(jqn '"user_id" not in json.dumps(d)' "$L")" "True"
chk "ident_key 를 싣지 않는다" "$(jqn '"ident_key" not in json.dumps(d)' "$L")" "True"

N=$(jqn 'len(d["events"])' "$L")
echo "  ℹ️ 보이는 회차 ${N}개"
if [ "$N" = "0" ]; then
  sk "정렬(등록 가능한 것이 먼저)" "회차가 없습니다"
else
  chk "정렬(등록 가능·미제출이 앞)" \
    "$(jqn 'all((not(d["events"][i]["canSignup"] and not d["events"][i]["mine"])) <= (not(d["events"][i+1]["canSignup"] and not d["events"][i+1]["mine"])) for i in range(len(d["events"])-1))' "$L")" "True"
fi

echo "② eventSignup — 신원이 없으면 거부한다"
S=$(call '{"action":"eventSignup","event_id":"nope"}')
chk "no-user 거부" "$(jqn 'd.get("error")' "$S")" "no-user"
chk "ok=false" "$(jqn 'd.get("ok")' "$S")" "False"

echo "③ eventSignup — 없는 회차는 거부한다"
S2=$(call '{"action":"eventSignup","user_id":"00000000-0000-0000-0000-000000000000","event_id":"definitely-not-a-real-event"}')
chk "not-found 거부" "$(jqn 'd.get("error")' "$S2")" "not-found"

echo "④ eventDrop — 인자가 모자라면 거부한다"
D=$(call '{"action":"eventDrop"}')
chk "bad-args 거부" "$(jqn 'd.get("error")' "$D")" "bad-args"

echo "⑤ 관리자 액션은 비번 없이 열리지 않는다"
R=$(call '{"action":"eventRoster"}')
chk "eventRoster 거부" "$(jqn 'd.get("error") in ("unauthorized","no-password-set")' "$R")" "True"
V=$(call '{"action":"eventSave","event":{"id":"x","title":"x","opens_on":"2026-01-01","closes_on":"2026-01-02"}}')
chk "eventSave 거부" "$(jqn 'd.get("error") in ("unauthorized","no-password-set")' "$V")" "True"

echo "⑥ 관리자 목록(비번이 있을 때만)"
if [ -z "${ADMIN_PW:-}" ]; then
  sk "eventRoster" "ADMIN_PW 환경변수가 없습니다"
  sk "관리자 응답에도 user_id 가 없다" "ADMIN_PW 환경변수가 없습니다"
else
  RA=$(call "{\"action\":\"eventRoster\",\"pw\":\"$ADMIN_PW\"}")
  chk "ok" "$(jqn 'd.get("ok")' "$RA")" "True"
  chk "events 가 배열" "$(jqn 'isinstance(d.get("events"), list)' "$RA")" "True"
  chk "rows 가 배열" "$(jqn 'isinstance(d.get("rows"), list)' "$RA")" "True"
  chk "관리자 응답에도 user_id 가 없다" "$(jqn '"user_id" not in json.dumps(d)' "$RA")" "True"
fi

echo
echo "통과 $pass · 건너뜀 $skip · 실패 $fail"
[ "$fail" = "0" ]
```

- [ ] **Step 2: 스모크를 돌려 실패를 확인한다**

Run:
```bash
bash tests/event-smoke.sh
```
Expected: ①의 첫 검사부터 실패한다 — `ok = None (기대 True)`. 서버에 `eventOpenList` 액션이 아직 없어 `{"error":"unknown action: eventOpenList"}` 가 돌아온다.

- [ ] **Step 3: `index.ts` 의 `switch` 에 5줄을 더한다**

`case "eventEntrants": return json(await eventEntrants(body));` 줄(index.ts:173 근처)을 찾아 **그 아래에** 아래를 넣는다. 기존 넷 바로 밑에 두고 주석 띠로 갈라 둔다 — 이름이 헷갈릴 만큼 비슷하기 때문이다.

```ts
      // ---- 이벤트 플랫폼 (분기 회차 · 2026-09-10) ----
      //  ⚠️ 위 event* 넷(eventEnter/Status/Board/Entrants)은 옛 「말씀 이벤트」(퀴즈형)
      //     것이다. 이름이 비슷하지만 표도 흐름도 다르다. 섞지 말 것.
      case "eventOpenList": return json(await eventOpenList(body));
      case "eventSignup":   return json(await eventSignup(body));
      case "eventDrop":     return json(await eventDrop(body));
      case "eventRoster":   return json(await eventRoster(body));
      case "eventSave":     return json(await eventSave(body));
```

- [ ] **Step 4: `index.ts` 맨 끝에 헬퍼와 액션 블록을 더한다**

파일 **맨 아래**에 아래 전체를 붙인다.

```ts
// ============================================================
// 이벤트 플랫폼 (분기 회차) — 2026-09-10
//   설계: docs/superpowers/specs/2026-09-10-event-platform-design.html
//
//   ⚠️ 위쪽 eventEnter/eventStatus/eventBoard/eventEntrants 는 옛 「말씀 이벤트」
//      (퀴즈형, app_config('event') + event_entries)다. 이 블록과 무관하다.
//
//   참여는 앱 로그인으로만 받는다 — user_id 가 신원의 전부이고, 「회차당 한 번」은
//   event_signups 의 unique 제약이 지킨다(서버가 중복을 검사하지 않는다).
//   노출은 설정 키가 아니라 데이터가 결정한다 — 열린 회차가 없으면 목록이 비어 있다.
// ============================================================

const EVT_STATUS = ["draft", "open", "closed", "archived"];
const EVT_KINDS = ["signup", "quiz"];
// 회차 id — URL(?ev=)과 파일명에 그대로 쓰이므로 좁게 묶는다
const EVT_ID_RE = /^[a-z0-9][a-z0-9-]{1,40}$/;
const EVT_MEMO_MAX = 300;

// ⚠️ 직분 기본값을 사역신청 기록에서도 찾을 것인가 — 「자기 기록을 자기에게 보여주는
//    것」이라 켜 두었다(설계 질문 2). 안 된다고 결정되면 이 한 줄을 false 로.
//    전화번호는 어느 쪽이든 가져오지 않는다 — privacy/ 가 용도를 한정해 적어 두었다.
const EVT_POSITION_FROM_MINISTRY = true;

// KST 오늘(YYYY-MM-DD). ymd(new Date())는 UTC라 자정 무렵 하루가 어긋난다.
const evtToday = () =>
  new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

// 지금 등록을 받는가 — 상태와 날짜를 함께 본다(기간 판정을 서버가 한다)
function evtOpenNow(ev: any, today: string): boolean {
  return ev.status === "open" && today >= ev.opens_on && today <= ev.closes_on;
}

// 성도에게 돌려줄 참가 기록 한 줄 — 화이트리스트.
// ⚠️ 스프레드(...r)를 쓰지 않는다. user_id · ident_key · note · 신원 스냅샷이
//    구조적으로 빠진다(앱은 이미 자기가 누구인지 안다).
function evtRow(r: any) {
  return {
    id: r.id,
    eventId: r.event_id,
    position: r.position ?? "",
    phone: r.phone ?? "",
    memo: r.memo ?? "",
    answers: r.answers ?? {},
    at: r.created_at,
  };
}

// 직분 기본값 ① 이 사람의 가장 최근 이벤트 직분(created_at desc 로 받아 온 목록)
function evtPositionHint(mine: any[]): string {
  for (const r of mine) {
    const p = norm(r.position);
    if (p && MIN_POSITIONS.has(p)) return p;
  }
  return "";
}

// 직분 기본값 ② 사역신청 기록. 없거나 목록에 없는 값이면 빈 문자열 —
// ⚠️ 추측해서 채우지 않는다. 틀린 직분이 미리 찍혀 있으면 그대로 내시는 분이 생긴다.
async function evtPositionFromMinistry(userId: string): Promise<string> {
  if (!EVT_POSITION_FROM_MINISTRY) return "";
  try {
    const { data } = await db.from("ministry_orders")
      .select("position,created_at").eq("user_id", userId)
      .order("created_at", { ascending: false }).limit(1);
    const p = norm(((data ?? [])[0] ?? {}).position);
    return MIN_POSITIONS.has(p) ? p : "";
  } catch (_) {
    return "";   // 사역신청 표가 없는 DB 에서도 이벤트가 죽지 않는다
  }
}

// ---------- eventOpenList: 보여 줄 회차 + 내가 낸 것 + 직분 기본값 ----------
async function eventOpenList(b: any) {
  const userId = String(b.user_id ?? "").trim();
  const today = evtToday();
  // draft 는 관리자 비번이 맞을 때만 — b.preview 같은 깃발을 쓰지 않는다.
  // (사역신청이 열어 둔 `|| b.preview` 는 서버가 확인할 수 없는 값이라 복사하지 않는다.)
  const isAdmin = adminError(b) === null;
  const statuses = isAdmin ? ["draft", "open", "closed"] : ["open", "closed"];

  const { data, error } = await db.from("events")
    .select("*").in("status", statuses);
  if (error) throw error;
  const rows = (data ?? []) as any[];

  let mine: any[] = [];
  let hint = "";
  if (userId) {
    const { data: ms, error: merr } = await db.from("event_signups")
      .select("*").eq("user_id", userId).order("created_at", { ascending: false });
    if (merr) throw merr;
    mine = (ms ?? []) as any[];
    hint = evtPositionHint(mine) || await evtPositionFromMinistry(userId);
  }
  const mineIds = new Set(mine.map((r) => r.event_id));

  const list = rows.map((r) => ({
    id: r.id,
    title: r.title,
    subtitle: r.subtitle ?? "",
    season: r.season ?? "",
    kind: r.kind,
    opensOn: r.opens_on,
    closesOn: r.closes_on,
    status: r.status,
    needs: r.needs ?? {},
    copy: r.copy ?? {},
    canSignup: evtOpenNow(r, today),
    mine: mineIds.has(r.id),
    sortOrder: r.sort_order ?? 0,
  }));

  // 겹칠 때 무엇이 위로 오는지가 곧 「무엇을 먼저 하세요」다.
  //   ① 등록할 수 있고 아직 안 낸 것 ② 마감 가까운 순 ③ sort_order ④ id
  list.sort((x, y) => {
    const px = (x.canSignup && !x.mine) ? 0 : 1;
    const py = (y.canSignup && !y.mine) ? 0 : 1;
    if (px !== py) return px - py;
    if (x.closesOn !== y.closesOn) return x.closesOn < y.closesOn ? -1 : 1;
    if (x.sortOrder !== y.sortOrder) return x.sortOrder - y.sortOrder;
    return x.id < y.id ? -1 : 1;
  });

  return { ok: true, events: list, mine: mine.map(evtRow), positionHint: hint };
}

// ---------- eventSignup: 등록 / 고치기(덮어쓰기) ----------
async function eventSignup(b: any) {
  const userId = String(b.user_id ?? "").trim();
  if (!userId) return { ok: false, error: "no-user" };
  const eventId = norm(b.event_id);
  if (!EVT_ID_RE.test(eventId)) return { ok: false, error: "bad-args" };

  const { data: ev, error: eerr } = await db.from("events")
    .select("*").eq("id", eventId).maybeSingle();
  if (eerr) throw eerr;
  if (!ev) return { ok: false, error: "not-found" };

  const isAdmin = adminError(b) === null;
  if (!evtOpenNow(ev, evtToday()) && !isAdmin) {
    // 「아직 안 열렸다」와 「마감했다」를 뭉개지 않는다 — 성도에게 할 말이 다르다.
    return { ok: false, error: ev.status === "open" ? "closed-period" : "not-open" };
  }

  // 이름·소속은 앱이 보낸 값을 믿지 않고 users 에서 가져온다.
  const { data: u, error: uerr } = await db.from("users")
    .select("type,gu,mok,bu,grade,name").eq("id", userId).maybeSingle();
  if (uerr) throw uerr;
  if (!u) return { ok: false, error: "no-user" };

  const needs = (ev.needs ?? {}) as any;
  const isGu = u.type === "교구";

  let position = "";
  if (needs.position) {
    position = norm(b.position);
    // 서버에서 allowlist 로 다시 거른다 — 자유 입력이면 「집사님」·「집사 」가 섞여
    // 교적 대조가 도로 사람 손일이 된다(사역신청과 같은 이유).
    if (!MIN_POSITIONS.has(position)) return { ok: false, error: "직분을 골라 주세요" };
  }
  let phone = "";
  if (needs.phone) {
    phone = pilsaPhone(b.phone);
    if (!PILSA_PHONE_RE.test(phone)) {
      return { ok: false, error: "휴대폰 번호를 확인해 주세요" };
    }
  }
  const memo = needs.memo ? norm(b.memo).slice(0, EVT_MEMO_MAX) : "";
  const answers = (b.answers && typeof b.answers === "object" && !Array.isArray(b.answers))
    ? b.answers : {};

  const row = {
    event_id: eventId,
    user_id: userId,
    ident_key: identityKey(u),
    who_type: u.type,
    group_name: isGu ? norm(u.gu) : norm(u.bu),
    sub_name: isGu ? norm(u.mok) : norm(u.grade),
    name: norm(u.name),
    position,
    phone,
    memo,
    answers,
    source: "app",
    updated_at: new Date().toISOString(),
  };

  // 두 번째 제출은 실패가 아니라 덮어쓰기다 — 「이벤트당 한 번」은 unique 가 지킨다.
  // ⚠️ onConflict 는 event_signups_uniq(일반 unique)를 추론한다. 부분 인덱스로
  //    두면 여기서 "no unique or exclusion constraint matching" 오류가 난다.
  const { data, error } = await db.from("event_signups")
    .upsert(row, { onConflict: "event_id,user_id" }).select().maybeSingle();
  if (error) throw error;
  return { ok: true, signup: evtRow(data) };
}

// ---------- eventDrop: 취소 = 행 삭제 ----------
async function eventDrop(b: any) {
  const userId = String(b.user_id ?? "").trim();
  const id = Number(b.id);
  if (!userId || !Number.isFinite(id)) return { ok: false, error: "bad-args" };

  // ⚠️ 순번 id 만으로 지우지 않는다 — 짐작 가능하다. 소유자 조건을 함께 건다.
  const { data: row, error: rerr } = await db.from("event_signups")
    .select("id,event_id").eq("id", id).eq("user_id", userId).maybeSingle();
  if (rerr) throw rerr;
  if (!row) return { ok: false, error: "not-found" };

  const { data: ev } = await db.from("events")
    .select("status,opens_on,closes_on").eq("id", row.event_id).maybeSingle();
  if (!(ev && evtOpenNow(ev, evtToday())) && adminError(b) !== null) {
    return { ok: false, error: "closed-period" };
  }

  const { error } = await db.from("event_signups")
    .delete().eq("id", id).eq("user_id", userId);
  if (error) throw error;
  return { ok: true };
}

// ---------- eventRoster: 관리자 명단 (이름·소속·직분·전화번호가 실리는 유일한 자리) ----------
async function eventRoster(b: any) {
  const err = adminError(b);
  if (err) return { ok: false, error: err };

  const { data: evs, error: e1 } = await db.from("events")
    .select("id,title,season,status,opens_on,closes_on,sort_order")
    .order("closes_on", { ascending: false });
  if (e1) throw e1;

  // 회차 칩에 적을 건수는 **추리기 전 전체 기준**이어야 한다(필사·사역과 같은 규약).
  const counts: Record<string, number> = {};
  const { data: all, error: e2 } = await db.from("event_signups")
    .select("event_id").limit(20000);
  if (e2) throw e2;
  (all ?? []).forEach((r: any) => {
    counts[r.event_id] = (counts[r.event_id] ?? 0) + 1;
  });

  const eventId = norm(b.event_id);
  let q = db.from("event_signups").select("*")
    .order("created_at", { ascending: false }).limit(2000);
  if (eventId) q = q.eq("event_id", eventId);
  const { data, error } = await q;
  if (error) throw error;

  return {
    ok: true,
    events: (evs ?? []).map((e: any) => ({
      id: e.id, title: e.title, season: e.season ?? "", status: e.status,
      opensOn: e.opens_on, closesOn: e.closes_on, count: counts[e.id] ?? 0,
    })),
    rows: (data ?? []).map((r: any) => ({
      id: r.id,
      eventId: r.event_id,
      name: r.name,
      whoType: r.who_type,
      group: r.group_name,
      sub: r.sub_name ?? "",
      position: r.position ?? "",
      phone: r.phone ?? "",
      memo: r.memo ?? "",
      note: r.note ?? "",
      source: r.source,
      at: r.created_at,
      // ⚠️ user_id 자체는 싣지 않는다. 「앱에서 낸 것인가」만 알려 준다.
      hasUser: !!r.user_id,
    })),
  };
}

// ---------- eventSave: 관리자 회차 만들기 / 고치기 ----------
async function eventSave(b: any) {
  const err = adminError(b);
  if (err) return { ok: false, error: err };

  const e = (b.event ?? {}) as any;
  const id = norm(e.id);
  if (!EVT_ID_RE.test(id)) {
    return { ok: false, error: "회차 ID는 영문 소문자·숫자·붙임표만 (예: summer-2026)" };
  }
  const title = norm(e.title);
  if (!title) return { ok: false, error: "이벤트 이름을 적어 주세요" };

  const opens = norm(e.opens_on);
  const closes = norm(e.closes_on);
  const dateOk = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
  if (!dateOk(opens) || !dateOk(closes)) return { ok: false, error: "기간을 골라 주세요" };
  if (closes < opens) return { ok: false, error: "마감일이 시작일보다 앞섭니다" };

  const status = EVT_STATUS.indexOf(norm(e.status)) >= 0 ? norm(e.status) : "draft";
  const kind = EVT_KINDS.indexOf(norm(e.kind)) >= 0 ? norm(e.kind) : "signup";
  const objOf = (v: any) =>
    (v && typeof v === "object" && !Array.isArray(v)) ? v : {};

  const row = {
    id,
    title,
    subtitle: norm(e.subtitle),
    season: norm(e.season),
    kind,
    opens_on: opens,
    closes_on: closes,
    status,
    needs: objOf(e.needs),
    copy: objOf(e.copy),
    sort_order: Number(e.sort_order) || 0,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await db.from("events")
    .upsert(row, { onConflict: "id" }).select().maybeSingle();
  if (error) throw error;
  return { ok: true, event: data };
}
```

- [ ] **Step 5: `js/api.js` 의 `api` 객체에 래퍼 5줄을 더한다**

`js/api.js`에서 `ministrySetStatus:` 줄(108줄 근처)을 찾아 그 아래에 넣는다:

```js

  // ---- 이벤트 플랫폼 (분기 회차) ----
  //  ⚠️ 위 event* 넷과 다른 기능이다. 표도 흐름도 별개.
  eventOpenList: (user_id) => supaCall("eventOpenList", { user_id }),
  eventSignup: (payload) => supaCall("eventSignup", payload),
  eventDrop: (user_id, id) => supaCall("eventDrop", { user_id, id }),
  eventRoster: (pw, event_id) => supaCall("eventRoster", { pw, event_id }),
  eventSave: (pw, event) => supaCall("eventSave", { pw, event }),
```

- [ ] **Step 6: 배포 전에 최신을 받고, 이 코드가 요구하는 칸이 실제로 있는지 확인한다**

Run:
```bash
git pull --ff-only
git log --oneline -3 -- supabase/functions/api/index.ts
```

그리고 **커밋 목록을 읽는 대신 DB 에 물어본다** — 남이 커밋한 코드가 무슨 칸을 필요로 하는지는 로그에 안 적혀 있다(2026-09-10 `psalm_frames.sql` 건). 개발 DB 대시보드에서:
```sql
select table_name, column_name from information_schema.columns
 where table_schema = 'public'
   and (table_name in ('events','event_signups')
        or (table_name = 'verses' and column_name in ('track','day_no','frame_art')))
 order by 1, 2;
```
기대: `events`·`event_signups`의 칸이 모두 나온다. `verses.track` 세 칸은 **없어도 된다** — `7742db4`가 그 경우에도 `getVerses`가 살아남게 폴백을 넣어 두었다. 다만 `git log`에 `7742db4`가 보이는지 확인한다. **안 보이면 배포하지 않는다.**

- [ ] **Step 7: 개발에 배포한다**

Run:
```bash
supabase functions deploy api --no-verify-jwt --project-ref ktpwthwqzgcqcrmsafdo
```
Expected: `Deployed Functions on project ktpwthwqzgcqcrmsafdo: api`

- [ ] **Step 8: 남의 경로가 멀쩡한지 먼저 확인한다**

내 것만 확인하면 내가 함께 내보낸 남의 코드가 깨진 것을 못 본다.

Run:
```bash
DEV_ANON=sb_publishable_eJKP6u95IU9_DBXTvnvYBA_-yGCf-0Y bash tests/psalm-smoke.sh
```
Expected: `실패 0`. 특히 `weekly 편수 = 35` 가 통과해야 한다 — 그것이 `getVerses`가 살아 있다는 뜻이다.

- [ ] **Step 9: 이벤트 스모크를 돌려 통과를 확인한다**

Run:
```bash
bash tests/event-smoke.sh
```
Expected: `실패 0`. 회차가 아직 하나도 없으므로 `보이는 회차 0개` 와 정렬 검사 1건 건너뜀이 정상이다.

- [ ] **Step 10: 커밋**

```bash
chmod +x tests/event-smoke.sh
git add supabase/functions/api/index.ts js/api.js tests/event-smoke.sh
git commit -m "feat(이벤트 플랫폼): 액션 다섯 + 스모크

eventOpenList · eventSignup · eventDrop · eventRoster · eventSave.
전부 새 함수라 남이 배포해도 getVerses·login·ranking 은 멀쩡하다.

- 응답은 evtRow() 화이트리스트를 지난다 — user_id·ident_key·note 가
  구조적으로 빠진다(스프레드를 쓰지 않는다)
- 기간을 서버가 검사한다. draft 는 ADMIN_SECRET 이 맞을 때만 실린다 —
  사역신청이 열어 둔 || b.preview 우회는 복사하지 않았다(서버가 확인할 수
  없는 값이라 액션 이름만 알면 누구나 기간 밖 신청을 넣을 수 있다)
- 「아직 안 열렸다(not-open)」와 「마감했다(closed-period)」를 뭉개지 않는다
- 직분·전화번호 규칙은 사역신청·필사의 것을 그대로 쓴다(갈라지면 한쪽만 고친다)
- 직분 기본값을 ministry_orders 에서도 찾는다(EVT_POSITION_FROM_MINISTRY).
  전화번호는 가져오지 않는다 — privacy/ 가 용도를 한정해 적어 두었다"
```

---

## Task 3: 앱 화면 둘 + 라우팅 + CSS

**Files:**
- Create: `js/events.js`
- Modify: `index.html` (스크립트 태그 1줄, `app.js`보다 앞)
- Modify: `tools/bump.py` (`TAGGED` 목록에 1줄)
- Modify: `style.css` (맨 끝에 `.ev-` 구역)
- Modify: `app.js` (`getPreviewKind` 화이트리스트 · `routeAfterLoad` 분기)

**Interfaces:**
- Consumes: Task 2의 `api.eventOpenList(user_id)` · `api.eventSignup(payload)` · `api.eventDrop(user_id, id)`. app.js 전역 `loadUser()` · `homeFabLabel(u, true)` · `stopSpeaking()` · `appAlert(html)` · `appConfirm(opts)` · `renderSummary()`.
- Produces: 전역 함수 `renderEventList(focusId)` · `getEvtDeepLink()` · 전역 변수 `_evtPreview`. app.js의 `routeAfterLoad`가 이 셋을 쓴다.

**화면을 셋이 아니라 둘로 짓는 이유:** 설계 문서는 「목록 · 등록 폼 · 내 등록」 셋으로 적었으나, 「내 등록」은 사역신청의 `minSentListHtml`처럼 **목록 화면 맨 위의 묶음**으로 두는 것이 낫다 — 화면을 하나 줄이고, 겹친 회차를 볼 때 「내가 뭘 냈더라」가 목록과 같은 화면에서 답이 된다. 설계의 뜻(회차를 넘어 전부 보여준다)은 그대로 지킨다.

- [ ] **Step 1: `js/events.js` 를 만든다**

```js
// ============================================================
// 이벤트 플랫폼 (분기 회차) — 2026-09-10
//   설계: docs/superpowers/specs/2026-09-10-event-platform-design.html
//
//   ⚠️ app.js 밖에 지었다. 지금 이 저장소는 여러 작업이 app.js 를 함께 쓰고 있어
//      화면 코드를 밖에 두면 충돌 표면이 「분기 넷 + 한 단어」로 줄어든다.
//      loadUser·homeFabLabel·stopSpeaking·appAlert·appConfirm·renderSummary 는
//      app.js 의 전역이라 런타임에 그냥 불린다(js/psalm.js 와 같은 방식).
//
//   ⚠️ 이름이 renderEvent* 인 것이 이미 다섯 있다(Step/Board/Done/Button/Admin) —
//      전부 옛 「말씀 이벤트」(퀴즈형) 것이다. 여기서는 List/Form 만 쓰고 CSS 는
//      .ev- 접두사를 쓴다(.event-* 는 그쪽 것이다).
// ============================================================

// ── 상태 ─────────────────────────────────────────────────────
// ⚠️ 불리언이 아니라 세 값이다. 숨기는 것은 같아도 **할 말이 다르다** —
//    「지금 불러올 수 없어요」와 「지금 열린 이벤트가 없어요」를 섞으면,
//    통신이 잠깐 끊긴 분께 「기간이 지났습니다」라고 사실이 아닌 말을 하게 된다.
var evtState = "unknown"; // "unknown" | "none" | "some"
var evtEvents = [];       // eventOpenList 의 events
var evtMine = [];         // 내가 낸 것(회차를 넘어 전부)
var evtHint = "";         // 직분 기본값
var evtForm = null;       // 등록/고치기 중인 값 { eventId, position, phone, memo }
var _evtPreview = false;  // ?preview=event 로 들어왔나(관리자)

function evtEsc(v) {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// URL 의 ?ev=<회차id> 를 1회 읽어 반환(읽은 뒤 URL 정리 → 새로고침 재진입 방지)
function getEvtDeepLink() {
  try {
    var p = new URLSearchParams(location.search).get("ev");
    var id = (p || "").trim();
    if (/^[a-z0-9][a-z0-9-]{1,40}$/.test(id)) {
      history.replaceState(null, "", location.pathname);
      return id;
    }
  } catch (e) {}
  return null;
}

function evtApiReady() {
  return !!(window.api && api.eventOpenList && api.eventSignup);
}

// ── 불러오기 ─────────────────────────────────────────────────
function evtLoad(u) {
  if (!evtApiReady()) {
    evtState = "unknown";
    return Promise.resolve();
  }
  var uid = (u && u.user_id) || "";
  return api.eventOpenList(uid).then(function (r) {
    evtEvents = (r && r.events) || [];
    evtMine = (r && r.mine) || [];
    evtHint = (r && r.positionHint) || "";
    evtState = evtEvents.length ? "some" : "none";
  }).catch(function (e) {
    // 서버가 옛 판이라 액션이 없다 · 표가 없다 · 통신 실패 — 전부 「모른다」다.
    // 「없다」로 뭉개지 않는다.
    evtState = "unknown";
    evtEvents = []; evtMine = []; evtHint = "";
    if (window.console) console.warn("eventOpenList 실패:", e && e.message);
  });
}

// 회차 하나 찾기
function evtFind(id) {
  for (var i = 0; i < evtEvents.length; i++) {
    if (evtEvents[i].id === id) return evtEvents[i];
  }
  return null;
}
function evtMineOf(id) {
  for (var i = 0; i < evtMine.length; i++) {
    if (evtMine[i].eventId === id) return evtMine[i];
  }
  return null;
}

// 남은 날 — 마감 당일은 D-day
function evtDdayText(closesOn) {
  try {
    var today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    var a = new Date(today + "T00:00:00Z").getTime();
    var b = new Date(closesOn + "T00:00:00Z").getTime();
    var d = Math.round((b - a) / 86400000);
    if (d < 0) return "마감";
    if (d === 0) return "오늘 마감";
    return d + "일 남음";
  } catch (e) { return ""; }
}

// ── 목록 화면 ────────────────────────────────────────────────
// focusId: 딥링크(?ev=)로 들어왔을 때 그 회차의 등록 화면을 바로 연다.
function renderEventList(focusId) {
  if (typeof stopSpeaking === "function") stopSpeaking();
  var u = loadUser();
  if (!u) { renderEntryScreen(); return; }
  evtForm = null;

  document.getElementById("app").innerHTML =
    '<div class="ev-wrap"><div class="ev-loading">불러오는 중…</div></div>' +
    '<button class="home-fab" id="ev-home" aria-label="첫 화면으로">' +
    homeFabLabel(u, true) + "</button>";
  window.scrollTo(0, 0);
  document.getElementById("ev-home")
    .addEventListener("click", function () { renderSummary(); });

  evtLoad(u).then(function () {
    // 딥링크로 특정 회차를 지목했고 그것을 볼 수 있으면 바로 등록 화면으로
    if (focusId && evtFind(focusId)) { renderEventForm(u, focusId); return; }
    // 열린 회차가 딱 하나면 목록을 건너뛴다 — 고를 것이 없는데 고르라고 하지 않는다
    var pickable = evtEvents.filter(function (e) { return e.canSignup && !e.mine; });
    if (!focusId && pickable.length === 1 && evtMine.length === 0) {
      renderEventForm(u, pickable[0].id); return;
    }
    evtDrawList(u, focusId);
  });
}

function evtDrawList(u, focusId) {
  var wrap = document.querySelector(".ev-wrap");
  if (!wrap) return;

  if (evtState === "unknown") {
    wrap.innerHTML =
      '<div class="ev-head"><h2 class="ev-title">함께하는 이벤트</h2></div>' +
      '<div class="ev-empty"><div class="ev-empty-ic">📡</div>' +
      "<p>지금 불러올 수 없어요.<br>잠시 뒤 다시 눌러 주세요.</p>" +
      '<button class="ev-retry" id="ev-retry">다시 시도</button></div>';
    document.getElementById("ev-retry")
      .addEventListener("click", function () { renderEventList(focusId); });
    return;
  }

  if (evtState === "none" && !evtMine.length) {
    wrap.innerHTML =
      '<div class="ev-head"><h2 class="ev-title">함께하는 이벤트</h2></div>' +
      '<div class="ev-empty"><div class="ev-empty-ic">🗓️</div>' +
      "<p>지금 열린 이벤트가 없어요.<br>새 이벤트가 열리면 알려 드릴게요.</p></div>";
    return;
  }

  wrap.innerHTML =
    '<div class="ev-head"><h2 class="ev-title">함께하는 이벤트</h2></div>' +
    evtSentHtml() +
    evtEvents.map(evtCardHtml).join("");

  evtEvents.forEach(function (e) {
    var btn = document.getElementById("ev-go-" + e.id);
    if (btn) {
      btn.addEventListener("click", function () { renderEventForm(u, e.id); });
    }
  });
}

// 「이미 내신 것」 — 회차를 넘어 전부. 사역신청의 minSentListHtml 과 같은 자리다.
// ⚠️ 겹친 회차를 볼 때 「내가 뭘 냈더라」가 먼저 궁금하다. 카드 사이에서 찾아
//    훑지 않게 맨 위에 모아 둔다.
function evtSentHtml() {
  if (!evtMine.length) return "";
  return '<div class="ev-sent"><div class="ev-sent-t">📋 이미 내신 것 <b>' +
    evtMine.length + "건</b></div>" +
    evtMine.map(function (m) {
      var e = evtFind(m.eventId);
      var nm = e ? e.title : m.eventId;
      return '<div class="ev-sent-r"><span class="ev-sent-n">' + evtEsc(nm) +
        '</span><span class="ev-sent-s">접수</span></div>';
    }).join("") + "</div>";
}

function evtCardHtml(e) {
  var closed = !e.canSignup;
  var cls = "ev-card" + (e.mine ? " done" : "") + (closed ? " closed" : "");
  var dday = evtDdayText(e.closesOn);
  var btnLabel = e.mine ? "낸 것 보기 →" : (closed ? "지난 이벤트" : "참여하기 →");
  return '<div class="' + cls + '">' +
    (e.season ? '<div class="ev-season">' + evtEsc(e.season) + "</div>" : "") +
    '<h3 class="ev-card-t">' + evtEsc(e.title) + "</h3>" +
    (e.subtitle ? '<p class="ev-card-s">' + evtEsc(e.subtitle) + "</p>" : "") +
    '<div class="ev-meta"><span class="ev-period">' + evtEsc(e.opensOn) +
    " ~ " + evtEsc(e.closesOn) + "</span>" +
    (closed ? "" : '<span class="ev-dday' + (dday === "오늘 마감" ? " urgent" : "") +
      '">' + evtEsc(dday) + "</span>") + "</div>" +
    (e.mine ? '<div class="ev-badge-done">✅ 참여하셨어요</div>' : "") +
    '<button class="ev-go" id="ev-go-' + evtEsc(e.id) + '"' +
    (closed && !e.mine ? " disabled" : "") + ">" + btnLabel + "</button>" +
    "</div>";
}

// ── 등록 폼 ──────────────────────────────────────────────────
function renderEventForm(u, eventId) {
  var e = evtFind(eventId);
  if (!e) { renderEventList(null); return; }
  var mine = evtMineOf(eventId);
  var needs = e.needs || {};

  if (!evtForm || evtForm.eventId !== eventId) {
    evtForm = {
      eventId: eventId,
      position: (mine && mine.position) || evtHint || "",
      phone: (mine && mine.phone) || "",   // ⚠️ 다른 기능에서 가져오지 않는다
      memo: (mine && mine.memo) || "",
    };
  }

  var isGu = u.type === "교구";
  var who = isGu
    ? [u.gu, u.mok ? u.mok + "목장" : ""].filter(Boolean).join(" ")
    : [u.bu, u.grade].filter(Boolean).join(" ");

  var html =
    '<div class="ev-head"><h2 class="ev-title">' + evtEsc(e.title) + "</h2>" +
    '<button class="ev-back" id="ev-back">← 목록</button></div>' +
    (e.subtitle ? '<p class="ev-lead">' + evtEsc(e.subtitle) + "</p>" : "") +
    (e.copy && e.copy.intro ? '<div class="ev-note">' + evtEsc(e.copy.intro) + "</div>" : "") +

    // 신원은 묻지 않는다 — 로그인 정보가 그대로 들어간다.
    '<div class="ev-who"><div class="ev-who-l">이렇게 등록됩니다</div>' +
    '<div class="ev-who-v"><b>' + evtEsc(u.name) + "</b> · " + evtEsc(who) + "</div></div>";

  if (needs.position) {
    html += '<div class="ev-field"><label class="ev-label">직분</label>' +
      '<div class="ev-chips" id="ev-pos">' +
      ["성도", "집사", "권사", "안수집사", "장로", "전도사", "목사", "학생"]
        .map(function (p) {
          return '<button class="ev-chip' + (evtForm.position === p ? " on" : "") +
            '" data-pos="' + p + '">' + p + "</button>";
        }).join("") + "</div></div>";
  }
  if (needs.phone) {
    html += '<div class="ev-field"><label class="ev-label" for="ev-phone">휴대폰</label>' +
      '<input class="ev-input" id="ev-phone" type="tel" inputmode="numeric" ' +
      'placeholder="010-1234-5678" value="' + evtEsc(evtForm.phone) + '"></div>';
  }
  if (needs.memo) {
    html += '<div class="ev-field"><label class="ev-label" for="ev-memo">한 줄 남기기 <span class="ev-opt">(안 써도 됩니다)</span></label>' +
      '<textarea class="ev-input ev-ta" id="ev-memo" rows="3" maxlength="300">' +
      evtEsc(evtForm.memo) + "</textarea></div>";
  }

  html += '<div class="ev-acts">' +
    '<button class="ev-submit" id="ev-submit">' +
    (mine ? "고치기" : "참여 등록하기") + "</button>" +
    (mine ? '<button class="ev-cancel" id="ev-cancel">참여 취소</button>' : "") +
    "</div>";

  document.getElementById("app").innerHTML =
    '<div class="ev-wrap">' + html + "</div>" +
    '<button class="home-fab" id="ev-home" aria-label="첫 화면으로">' +
    homeFabLabel(u, true) + "</button>";
  window.scrollTo(0, 0);

  document.getElementById("ev-home")
    .addEventListener("click", function () { renderSummary(); });
  document.getElementById("ev-back")
    .addEventListener("click", function () { evtForm = null; renderEventList(null); });

  var pos = document.getElementById("ev-pos");
  if (pos) {
    pos.addEventListener("click", function (ev2) {
      var b = ev2.target.closest(".ev-chip");
      if (!b) return;
      evtForm.position = b.getAttribute("data-pos");
      renderEventForm(u, eventId);
    });
  }
  var ph = document.getElementById("ev-phone");
  if (ph) {
    ph.addEventListener("input", function () {
      var d = ph.value.replace(/[^0-9]/g, "").slice(0, 11);
      if (d.length > 7) ph.value = d.slice(0, 3) + "-" + d.slice(3, 7) + "-" + d.slice(7);
      else if (d.length > 3) ph.value = d.slice(0, 3) + "-" + d.slice(3);
      else ph.value = d;
      evtForm.phone = ph.value;
    });
  }
  var mm = document.getElementById("ev-memo");
  if (mm) mm.addEventListener("input", function () { evtForm.memo = mm.value; });

  document.getElementById("ev-submit")
    .addEventListener("click", function () { evtSubmit(u, eventId); });
  var cc = document.getElementById("ev-cancel");
  if (cc) cc.addEventListener("click", function () { evtAskDrop(u, eventId); });
}

function evtSubmit(u, eventId) {
  var e = evtFind(eventId);
  var needs = (e && e.needs) || {};
  if (needs.position && !evtForm.position) {
    appAlert("직분을 골라 주세요."); return;
  }
  if (needs.phone) {
    var d = (evtForm.phone || "").replace(/[^0-9]/g, "");
    if (!d) { appAlert("휴대폰 번호를 적어 주세요."); return; }
    if (!/^01[016-9][0-9]{7,8}$/.test(d)) {
      appAlert("휴대폰 번호를 다시 확인해 주세요.<br><b>010-1234-5678</b> 꼴로 적어 주세요.");
      return;
    }
  }
  if (!u.user_id) {
    appAlert("잠시 뒤 다시 눌러 주세요.<br>기록을 서버와 맞추는 중입니다.");
    return;
  }
  var btn = document.getElementById("ev-submit");
  var label = btn.textContent;
  btn.disabled = true; btn.textContent = "처리 중…";
  api.eventSignup({
    user_id: u.user_id,
    event_id: eventId,
    position: evtForm.position,
    phone: evtForm.phone,
    memo: evtForm.memo,
  }).then(function () {
    evtForm = null;
    return evtLoad(u);
  }).then(function () {
    appAlert("참여를 등록했어요. 고맙습니다!");
    evtDrawListFresh(u);
  }).catch(function (err) {
    btn.disabled = false; btn.textContent = label;
    appAlert(evtErrText(err));
  });
}

function evtAskDrop(u, eventId) {
  var mine = evtMineOf(eventId);
  if (!mine) return;
  // ⚠️ appConfirm(msg, opts) 두 인자다 — 객체 하나로 부르면 메시지가 비어 뜬다.
  //    msg 는 innerHTML 로 들어가므로 <br>·<b> 가 통한다(app.js:1289 appModal).
  appConfirm("참여를 취소할까요?<br>다시 등록하실 수 있어요.", {
    okText: "참여 취소", cancelText: "돌아가기", danger: true,
  }).then(function (yes) {
    if (!yes) return;
    return api.eventDrop(u.user_id, mine.id).then(function () {
      evtForm = null;
      return evtLoad(u);
    }).then(function () {
      appAlert("참여를 취소했어요.");
      evtDrawListFresh(u);
    }).catch(function (err) { appAlert(evtErrText(err)); });
  });
}

// 목록을 다시 그린다 — 「하나뿐이면 폼으로 건너뛰기」를 타지 않게 목록으로 곧장.
function evtDrawListFresh(u) {
  document.getElementById("app").innerHTML =
    '<div class="ev-wrap"></div>' +
    '<button class="home-fab" id="ev-home" aria-label="첫 화면으로">' +
    homeFabLabel(u, true) + "</button>";
  window.scrollTo(0, 0);
  document.getElementById("ev-home")
    .addEventListener("click", function () { renderSummary(); });
  evtDrawList(u, null);
}

// 서버 슬러그를 성도님 말로 바꾼다 — 「아직 안 열렸다」와 「마감했다」를 뭉개지 않는다.
function evtErrText(err) {
  var m = (err && err.message) || "";
  if (m === "closed-period") return "등록 기간이 지났어요.";
  if (m === "not-open") return "아직 열리지 않은 이벤트예요.";
  if (m === "not-found") return "이벤트를 찾을 수 없어요.";
  if (m === "no-user") return "로그인 정보를 확인할 수 없어요. 다시 로그인해 주세요.";
  if (m === "bad-args") return "요청이 올바르지 않아요. 다시 시도해 주세요.";
  return m || "잠시 뒤 다시 시도해 주세요.";
}
```

- [ ] **Step 2: `index.html` 에 스크립트 태그를 더한다**

`index.html`의 106~110줄이 지금 이렇다:

```html
  <script src="js/config.js?v=20260910o"></script>
  <script src="js/api.js?v=20260910o"></script>
  <script src="js/push.js?v=20260910o"></script>
  <script src="js/psalm.js?v=20260910o"></script>
  <script src="app.js?v=20260910o"></script>
```

`js/psalm.js` 줄 **아래**(=`app.js`보다 앞)에 한 줄을 넣는다:

```html
  <script src="js/events.js?v=20260910o"></script>
```

⚠️ `?v=` 값은 **그 파일에 지금 적혀 있는 값을 그대로** 쓴다(위 예의 `20260910o`는 이 계획을 쓸 때의 값이고, 다른 작업이 그 사이 bump 를 돌렸으면 달라져 있다 — 열어 보고 옆 줄과 같게 맞춘다). `bump.py`가 다음 배포 때 함께 올려 준다.

⚠️ **`app.js`보다 앞**이어야 한다는 점이 중요하다. `js/events.js`는 `loadUser`·`homeFabLabel` 같은 app.js 전역을 부르는데, 그건 **실행 시점**에만 필요하므로 순서 자체는 어느 쪽이든 돌아간다. 다만 `js/psalm.js`가 같은 이유로 앞에 놓여 있으니 나란히 둔다.

- [ ] **Step 3: `tools/bump.py` 의 `TAGGED` 에 한 줄 더한다**

`tools/bump.py`의 `TAGGED` 목록(25줄 근처)에서 `"js/psalm.js"` 뒤에 `"js/events.js"`를 넣는다:

```python
TAGGED = ["app.js", "style.css", "js/config.js", "js/api.js", "js/push.js", "js/psalm.js", "js/events.js"]
```

⚠️ 이 목록은 손으로 적는 것이다. 빠뜨리면 `?v=` 태그가 안 올라 성도님 폰에 옛 파일이 영영 남는다.

- [ ] **Step 4: `style.css` 맨 끝에 `.ev-` 구역을 더한다**

시편 구역(`.ps-*`) **아래**, 파일 맨 끝에 붙인다.

```css

/* ============================================================
   이벤트 플랫폼 (분기 회차) — 2026-09-10
   ⚠️ .event-* 는 옛 「말씀 이벤트」(퀴즈형) 것이다. 여기는 .ev- 접두사.
   ============================================================ */
.ev-wrap {
  max-width: 560px; margin: 0 auto; padding: 16px 16px;
  /* .home-fab 은 position:fixed 로 본문 위를 덮는다 — 두 줄 단추(76px) 기준 여백.
     ⚠️ env() 를 여백에도 넣어야 한다. 단추의 bottom 이 안전영역만큼 올라가므로
        여백만 고정값이면 노치 폰에서 다시 겹친다. */
  padding-bottom: calc(96px + env(safe-area-inset-bottom, 0px));
}
.ev-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 14px; }
.ev-title { font-size: 20px; font-weight: 800; color: var(--navy); margin: 0; flex: 1; }
.ev-back, .ev-retry {
  background: #eef1f8; color: var(--navy); border: 1.5px solid var(--navy);
  border-radius: 10px; padding: 8px 14px; font-size: 15px; font-weight: 700; cursor: pointer;
}
.ev-lead { font-size: 15px; color: #555; margin: 0 0 12px; }
.ev-loading { text-align: center; color: #888; padding: 40px 0; font-size: 16px; }

.ev-empty { text-align: center; padding: 48px 16px; color: #666; }
.ev-empty-ic { font-size: 44px; margin-bottom: 12px; }
.ev-empty p { font-size: 16px; line-height: 1.7; margin: 0 0 18px; }

/* 이미 내신 것 — 목록 맨 위 */
.ev-sent {
  background: #f3f6fb; border: 1px solid #d6dff0; border-radius: 12px;
  padding: 12px 14px; margin-bottom: 16px;
}
.ev-sent-t { font-size: 14px; font-weight: 700; color: var(--navy); margin-bottom: 8px; }
.ev-sent-r { display: flex; align-items: center; gap: 8px; font-size: 15px; padding: 4px 0; }
.ev-sent-n { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ev-sent-s { font-size: 12px; font-weight: 700; color: #2f6b4f; background: #e6f2ec;
  border-radius: 6px; padding: 2px 8px; flex-shrink: 0; }

/* 회차 카드 */
.ev-card {
  background: #fff; border: 1.5px solid #e2dccf; border-radius: 14px;
  padding: 16px; margin-bottom: 14px;
}
.ev-card.done { border-color: #b9d8c6; background: #f7fcf9; }
.ev-card.closed { opacity: .72; }
.ev-season { font-size: 12px; font-weight: 700; color: #a08a52; letter-spacing: .04em;
  margin-bottom: 4px; }
.ev-card-t { font-size: 17px; font-weight: 800; color: var(--navy); margin: 0 0 6px; line-height: 1.4; }
.ev-card-s { font-size: 14px; color: #666; margin: 0 0 10px; line-height: 1.6; }
.ev-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
.ev-period { font-size: 13px; color: #777; }
.ev-dday { font-size: 12px; font-weight: 700; color: var(--navy);
  background: #eef1f8; border-radius: 6px; padding: 2px 8px; }
.ev-dday.urgent { color: #a8322a; background: #fbeeec; }
.ev-badge-done { font-size: 14px; font-weight: 700; color: #2f6b4f; margin-bottom: 10px; }

.ev-go {
  display: block; width: 100%; border: none; border-radius: 12px;
  padding: 14px 0; font-size: 16px; font-weight: 800; cursor: pointer;
  background: var(--navy); color: #fff;
}
.ev-card.done .ev-go { background: #eef1f8; color: var(--navy);
  border: 1.5px solid var(--navy); }
.ev-go[disabled] { background: #e7e2d8; color: #999; cursor: default; }

/* 폼 */
.ev-note { background: #fdf8ec; border: 1px solid #ecdcb4; border-radius: 10px;
  padding: 12px 14px; font-size: 14.5px; line-height: 1.7; color: #5a4a22; margin-bottom: 14px; }
.ev-who { background: #f3f6fb; border-radius: 10px; padding: 12px 14px; margin-bottom: 16px; }
.ev-who-l { font-size: 12.5px; color: #7a8496; margin-bottom: 3px; }
.ev-who-v { font-size: 16px; color: var(--navy); }
.ev-field { margin-bottom: 16px; }
.ev-label { display: block; font-size: 14.5px; font-weight: 700; color: var(--navy); margin-bottom: 7px; }
.ev-opt { font-weight: 400; color: #999; font-size: 13px; }
.ev-input {
  width: 100%; box-sizing: border-box; font-family: inherit; font-size: 16px;
  padding: 12px 13px; border: 1.5px solid #d8d2c6; border-radius: 10px; background: #fff;
}
.ev-input:focus { outline: 2px solid var(--navy); outline-offset: 1px; border-color: var(--navy); }
.ev-ta { resize: vertical; line-height: 1.6; }
.ev-chips { display: flex; flex-wrap: wrap; gap: 7px; }
.ev-chip {
  border: 1.5px solid #d8d2c6; background: #fff; color: #555; border-radius: 999px;
  padding: 8px 14px; font-size: 15px; font-weight: 600; cursor: pointer;
}
.ev-chip.on { background: var(--navy); border-color: var(--navy); color: #fff; }
.ev-acts { display: flex; flex-direction: column; gap: 9px; margin-top: 22px; }
.ev-submit {
  border: none; border-radius: 12px; padding: 15px 0; font-size: 17px; font-weight: 800;
  background: var(--navy); color: #fff; cursor: pointer;
}
.ev-submit[disabled] { opacity: .6; cursor: default; }
.ev-cancel {
  border: 1.5px solid #c9c2b4; background: #fff; color: #8a5a52; border-radius: 12px;
  padding: 12px 0; font-size: 15px; font-weight: 700; cursor: pointer;
}

/* 어두운 모드 — ⚠️ 이 앱은 prefers-color-scheme 을 쓰지 않는다.
   자바스크립트가 <body> 에 .dark 를 붙인다(style.css 에 .dark 셀렉터가 457개).
   미디어쿼리로 쓰면 설정에서 어둡게 켜도 하나도 안 먹는다.
   색은 기도문(.pr-*) 구역의 값을 그대로 따라간다 — 화면끼리 갈라지지 않게. */
.dark .ev-card { background: #151d2b; border-color: #33507d; }
.dark .ev-card.done { background: #14231c; border-color: #2f5a41; }
.dark .ev-card-t, .dark .ev-title, .dark .ev-who-v, .dark .ev-label,
.dark .ev-sent-t { color: #8fb3e6; }
.dark .ev-card-s, .dark .ev-period, .dark .ev-empty p, .dark .ev-who-l { color: #b9c2d0; }
.dark .ev-sent, .dark .ev-who { background: #1b2436; border-color: #33507d; }
.dark .ev-sent-s { background: #17301f; color: #8fd3ab; }
.dark .ev-input { background: #151d2b; border-color: #33507d; color: #dfe7f5; }
.dark .ev-chip { background: #182739; border-color: #33507d; color: #b9c2d0; }
.dark .ev-chip.on { background: #26406b; border-color: #26406b; color: #fff; }
.dark .ev-note { background: #211d12; border-color: #6b5a2c; color: #ddd0a8; }
.dark .ev-back, .dark .ev-retry,
.dark .ev-card.done .ev-go { background: #182739; color: #8fb3e6; border-color: #33507d; }
.dark .ev-dday { background: #182739; color: #8fb3e6; }
.dark .ev-cancel { background: #151d2b; border-color: #4a3a38; color: #d8a49c; }
.dark .ev-go[disabled] { background: #1b2436; color: #6b7280; }
.dark .ev-loading { color: #b9c2d0; }
```

⚠️ `--navy`·`--cream` 등은 `style.css` 위쪽 `:root`에 이미 정의돼 있는 이 앱의 토큰이다. 새로 만들지 말고 그대로 쓴다.

- [ ] **Step 5: `app.js` 의 `getPreviewKind` 화이트리스트에 `"event"` 를 더한다**

`app.js`의 `getPreviewKind()`(180줄 근처)에서 아래 줄을 찾는다:

```js
    if (p === "intro" || p === "blessing" || p === "daily" || p === "promo" || p === "pilsa" || p === "prayer") {
```

이렇게 바꾼다:

```js
    if (p === "intro" || p === "blessing" || p === "daily" || p === "promo" || p === "pilsa" || p === "prayer" || p === "event") {
```

- [ ] **Step 6: `app.js` 의 `routeAfterLoad` 에 분기를 더한다**

`routeAfterLoad()`에서 아래 두 줄을 찾는다:

```js
  // 어드민 미리보기(?psalm=1): 시편 말씀 액자 화면으로 곧바로 진입.
  if (_psalmPreview) { renderPsalmHome(); return; }
```

**그 아래에** 넣는다:

```js
  // 이벤트 플랫폼 — 회차 딥링크(?ev=<회차id>)와 관리자 미리보기(?preview=event).
  //  ⚠️ 성도님 첫 화면에는 아직 단추가 없다(노출은 「열린 회차가 있는가」가 결정한다).
  //     여는 날: renderSummary 의 「함께」 묶음에 한 줄을 더하면 된다.
  var _evDeep = (typeof getEvtDeepLink === "function") ? getEvtDeepLink() : null;
  if (_evDeep) {
    if (loadUser()) renderEventList(_evDeep); else renderEntryScreen();
    return;
  }
```

그리고 `if (preview === "pilsa") { ... }` 블록 **아래에** 넣는다:

```js
  if (preview === "event") {          // 이벤트 플랫폼 — 성도 화면 그대로 바로 진입
    if (typeof renderEventList !== "function") { renderEntryScreen(); return; }
    _evtPreview = true;
    if (loadUser()) renderEventList(null); else renderEntryScreen();
    return;
  }
```

- [ ] **Step 7: 개발 DB 에 확인용 회차 하나를 만든다**

`ktpwthwqzgcqcrmsafdo` 대시보드 → SQL Editor:

```sql
-- 개발 확인용. ⚠️ 운영에서는 절대 돌리지 말 것.
insert into public.events
  (id, title, subtitle, season, kind, opens_on, closes_on, status, needs, sort_order)
values
  ('dev-test-1', '개발 확인용 이벤트', '이 회차는 개발 DB 에만 있습니다', '2026-3Q',
   'signup', '2026-01-01', '2099-12-31', 'open',
   '{"position":true,"memo":true,"phone":false,"extra":[]}'::jsonb, 0),
  ('dev-draft-1', '아직 준비 중인 이벤트', '', '2026-4Q',
   'signup', '2026-01-01', '2099-12-31', 'draft', '{}'::jsonb, 0)
on conflict (id) do update set
  title = excluded.title, subtitle = excluded.subtitle, season = excluded.season,
  opens_on = excluded.opens_on, closes_on = excluded.closes_on,
  status = excluded.status, needs = excluded.needs, updated_at = now();

-- 확인: select id, status, opens_on, closes_on from events order by id;
```

- [ ] **Step 8: 스모크를 다시 돌려 정렬·draft 검사가 실제로 검증되는지 본다**

Run:
```bash
bash tests/event-smoke.sh
```
Expected: `실패 0` 이고, 이번에는 `보이는 회차 1개`(= `dev-test-1`만)가 뜬다.
`draft 회차는 안 실린다 = True` 가 **건너뜀이 아니라 통과**로 나와야 한다 — `dev-draft-1`이 DB에 있는데 목록에 없다는 것이 그 검사의 뜻이다.

- [ ] **Step 9: 브라우저에서 끝까지 해 본다**

Run:
```bash
python -m http.server 8000
```

그리고 브라우저에서 순서대로 확인한다.

1. `http://localhost:8000/` — 화면 오른쪽 위에 **「개발 DB」 띠**가 보이는가. **안 보이면 운영을 보고 있는 것이므로 여기서 멈춘다.**
2. 로그인한다(교구 → 아무 교구 · 목장 숫자 · 이름).
3. `http://localhost:8000/?preview=event` — 회차가 하나뿐이므로 **목록을 건너뛰고 등록 폼이 바로** 열려야 한다. 직분 칩 여덟 개와 「한 줄 남기기」가 보이고, 휴대폰 칸은 **없어야** 한다(`needs.phone: false`).
4. 「이렇게 등록됩니다」에 로그인한 이름·소속이 보이는가. **이름을 묻는 칸이 없어야 한다.**
5. 직분을 고르지 않고 「참여 등록하기」 → 「직분을 골라 주세요.」
6. 직분을 고르고 등록 → 「참여를 등록했어요」 → 목록 화면으로 가고, 맨 위에 **「📋 이미 내신 것 1건」**, 카드에 **「✅ 참여하셨어요」**가 보인다.
7. 카드의 「낸 것 보기 →」 → 직분이 **그대로 골라져 있다**(기본값이 아니라 낸 값).
8. 「고치기」로 다른 직분을 골라 저장 → 다시 열어 바뀐 값이 남았는지 확인(= `upsert`가 통했다는 뜻. 여기서 `no unique or exclusion constraint` 오류가 나면 Task 1의 unique 제약이 부분 인덱스로 들어간 것이다).
9. 「참여 취소」 → 확인 창 → 취소되고 목록에서 「이미 내신 것」이 사라진다.
10. `http://localhost:8000/?ev=dev-test-1` — 목록을 거치지 않고 그 회차 폼이 바로 열리고, **주소창의 `?ev=`가 지워진다.**
11. `http://localhost:8000/?ev=dev-draft-1` — `draft`라 목록에 없으므로 **목록 화면**이 뜬다(폼이 열리지 않는다).
12. 첫 화면(`http://localhost:8000/`)으로 가서 **「함께」 묶음에 이벤트 단추가 없는지** 확인한다. 이 계획에서는 아직 넣지 않는다.
13. 「모른다」 화면을 확인한다 — 브라우저 개발자도구 → Network → **Offline** 으로 바꾸고 `?preview=event` 를 새로 연다. **「지금 불러올 수 없어요 · 다시 시도」**가 떠야 한다. 「지금 열린 이벤트가 없어요」가 뜨면 세 값이 두 값으로 뭉개진 것이므로 `evtLoad`의 `catch`를 고친다.

- [ ] **Step 10: 개발 확인용 회차를 지운다**

`dev-test-1`·`dev-draft-1`은 개발 DB에만 있지만, 남겨 두면 다음 사람이 「이게 진짜 회차인가」로 헷갈린다.

```sql
delete from public.events where id in ('dev-test-1', 'dev-draft-1');
-- 확인: select count(*) from events;   → 0
```

⚠️ `on delete cascade` 라 참가 기록도 함께 지워진다(개발 DB의 시험 기록뿐이다).

- [ ] **Step 11: 커밋**

`app.js`·`style.css`·`index.html`·`tools/bump.py`는 다른 작업이 함께 쓰는 파일이므로 **내 헝크만** 담는다.

```bash
git add js/events.js
git add -p app.js style.css index.html tools/bump.py
git status --short
```
Expected: 위 다섯 파일만 스테이징돼 있고 `booklet/`·`psalm/`·`admin.html`은 담기지 않았다.

```bash
git commit -m "feat(이벤트 플랫폼): 앱 화면 둘 — 목록·등록 폼

js/events.js 새 파일. app.js 밖에 지었다 — 지금 여러 작업이 app.js 를 함께
쓰고 있어 화면 코드를 밖에 두면 충돌 표면이 「분기 넷 + 한 단어」로 줄어든다.

- 신원을 묻지 않는다. 로그인 정보가 그대로 들어가고 「이렇게 등록됩니다」로 보여 준다
- 노출은 데이터가 결정한다 — 열린 회차가 없으면 아무것도 안 뜬다. 첫 화면
  단추는 아직 넣지 않았다(?preview=event · ?ev= 로만 들어간다)
- 상태를 세 값으로 둔다: unknown / none / some. 「지금 불러올 수 없어요」와
  「지금 열린 이벤트가 없어요」를 뭉개지 않는다 — 뭉개면 통신이 끊긴 분께
  「기간이 지났습니다」라고 사실이 아닌 말을 하게 된다
- 열린 회차가 하나뿐이면 목록을 건너뛴다. 고를 것이 없는데 고르라고 하지 않는다
- 「이미 내신 것」을 목록 맨 위에 모은다(사역신청 minSentListHtml 과 같은 자리)
- 전화번호를 다른 기능에서 가져오지 않는다 — 같은 회차에서 자기가 낸 값만 채운다

⚠️ CSS 접두사는 .ev- 다. .event-* 는 옛 「말씀 이벤트」(퀴즈형) 것이다.
⚠️ tools/bump.py 의 TAGGED 에 js/events.js 를 넣었다 — 빠뜨리면 ?v= 태그가
   안 올라 성도님 폰에 옛 파일이 영영 남는다."
```

---

## 이 계획을 끝낸 뒤의 상태

- 개발·운영 DB 양쪽에 표 둘이 **비어 있는 채로** 있다.
- 개발 Edge Function에 액션 다섯이 있다. **운영에는 아직 배포하지 않았다**(8단계, 별도 계획).
- 성도님 화면에는 **아무 변화가 없다** — 첫 화면 단추가 없고, 열린 회차도 없다.
- 관리자는 `?preview=event`로 성도님 화면을 그대로 확인할 수 있다.
- `bash tests/event-smoke.sh` 가 통과한다.

## 다음 계획서에서 할 것 (이 계획의 범위 밖)

4단계 관리자 화면(`admin-stats.html`에 회차 편집 + 회차 칩 + 명단) · 6단계 명단 이관(`tools/event-import-sql.py`) · 7단계 첫 화면 단추와 `FEAT_SINCE`(**넣기 직전에 사역신청·시편 작업에 알린다** — `renderSummary`가 같은 자리다) · 8단계 운영 배포 · 9단계 `summer-bible` 리다이렉트 껍데기와 `privacy/`.

남은 질문 다섯의 답이 필요한 자리: 질문 1(성도 수정·취소 — 이 계획은 **열어 두고** 만들었다) · 질문 2(직분 기본값 출처 — `EVT_POSITION_FROM_MINISTRY` 한 줄로 껐다 켠다) · 질문 3(시트 CSV) · 질문 4(시작일·관리자 비번) · 질문 5(퀴즈형 흡수).
