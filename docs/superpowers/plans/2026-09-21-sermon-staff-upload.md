# 설교·찬양 담당자 — 관리자 화면에서 설교 올리기 · 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AI 프롬프트를 쓸 수 없는 담당자가 「설교·찬양 관리」 화면에서 **① 설교/말씀 등록 → ② 설교 내용 등록(자막 붙여넣기)** 두 단계로 설교를 올리고, 진행과 결과를 화면에서 본다.

**Architecture:** 화면은 새 파일 없이 `admin-stats.html?only=sermon` 모드(사역신청 담당자 화면과 같은 길). 담당자 확인은 `api` 함수의 사역신청 담당자 코드를 두 역할(`ministry`·`content`)로 넓혀 쓴다. 올리기는 `sermon_jobs` 표에 한 줄 넣고 gocheok-sermons 의 `sermon-job.yml` 을 깨워, 기존 파이프라인(2~6단계)을 유튜브 없이 돌리며 단계마다 표에 적는다.

**Tech Stack:** Vanilla JS(admin-stats.html 인라인) · Supabase Edge Function(Deno, `api`·`praise`) · Postgres · GitHub Actions · Node 22(gocheok-sermons 스크립트) · `node:test`

**설계서:** `docs/superpowers/specs/2026-09-21-sermon-staff-upload-design.md` — 이 계획과 다르면 **이 계획이 맞다**(설계 뒤 성도님이 「두 단계 메뉴」를 정했다 · 아래 「설계와 달라진 것」).

## Global Constraints

- 🔒 **설교·찬양 암호는 어떤 파일·커밋·메모리·로그에도 적지 않는다.** Supabase 시크릿 `CONTENT_STAFF_SECRET` 에만(친구가 대시보드에서 넣는다).
- 🚦 **운영 반영은 2026-09-27 안드로이드 비공개 테스트가 끝난 뒤(Phase B).** 그 전(Phase A)에는 **개발 DB(`ktpwthwqzgcqcrmsafdo`)에만** 배포한다. 운영 SQL·운영 함수 배포·`main` 병합·`bump.py` 는 Phase B 에서만.
- 🌳 성경암송 작업은 **worktree `C:\Projects\bm-sermon-staff`(가지 `feat/sermon-staff`)** 에서만 한다 — 다른 세션이 `C:\Projects\bible-memorize-church-app-v2` 에서 일하고 있다. gocheok-sermons 도 **worktree `C:\Projects\gs-sermon-staff`(가지 `feat/sermon-staff`)**. gocheok-sermons `main` 에는 Task 6 의 `sermon-job.yml` **한 파일만** 올린다(친구 확인 받음 — 불리기 전엔 아무 일도 안 하고, 안드로이드 앱 사이트와 무관).
- 커밋은 `git commit -m "…" -- <경로들>` 로 내 파일만. 커밋 끝줄: `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
- `supabase functions deploy` 는 **작업 트리를 통째로** 올린다 — 배포 전 worktree 에서 `git status --short` 가 비어 있는지 본다.
- 서버 확인은 **액션마다**. 틀린 암호와 「맞는 암호 + 담당자 아님」은 **같은 답 `unauthorized`**. 응답에 `user_id` 를 싣지 않는다.
- 새 표는 그 자리에서 `enable row level security` + `revoke all … from anon, authenticated`.
- 화면 표준 v1(`docs/notes/ministry-admin-ui.md`): 주 동작 48px(`.push-send`) · 보조 44px(`.push-btn.ghost`·`.back-btn`) · 칩 36px · 글씨 13px 이상 · 제목 줄 `.rep-head.mn-top` · 결과 안내는 `mnNote()` · 놓치면 안 되는 것은 `mnDialog()` · 화면마다 `window.scrollTo(0,0)`.
- 한글 이름은 NFC. 명령줄 `curl` 에 한글을 쓰지 않는다(깨진다 — 파이썬으로 UTF-8 본문을 보낸다).
- **같은 목록이 두 곳:** 설교 구분 `SERMON_CATS` = `admin-stats.html` · `api` 함수. **같은 규칙이 세 곳:** 영상 번호 뽑기 = `admin-stats.html stVideoId` · `api ytIdOf` · gocheok-sermons `scripts/job-lib.mjs vidOf`. 하나를 고치면 나머지도.
- 설교 구분 목록(그대로 복사): `["주일설교","금요성령집회","새벽기도회","송구영신예배","특별집회","청년예배"]`
- 개발 주소 `https://ktpwthwqzgcqcrmsafdo.supabase.co/functions/v1/api`(키 `sb_publishable_eJKP6u95IU9_DBXTvnvYBA_-yGCf-0Y`) · 운영 `https://xnomlgydifiqiybervtf.supabase.co/functions/v1/api`(키 `sb_publishable_oLtieT_jw7Gjb8etEsy0jw_thBaDjl-`) — 공개 키라 적어도 된다.

## 설계와 달라진 것 (2026-09-21 성도님)

1. **두 단계 메뉴:** 「① 설교/말씀 등록」(기존 「📖 설교/말씀 관리」 화면 — 암송구절 + 설교 영상 링크) → 「② 설교 내용 등록」(자막 붙여넣기). 설계 3장의 「② 안에서 구절 등록 칸을 여는 것」·「[연결] 단추」는 **만들지 않는다.** ②는 연결된 구절이 없으면 「① 에서 먼저」로 보낸다. ①에서 저장하면 「② 설교 내용 등록으로 →」 단추(링크를 들고 간다).
2. **개발까지만, 운영은 9/27 뒤.** 9/27 설교는 지금처럼 친구 PC(`add-local.mjs`)로 올린다. 담당자 첫 실전은 운영 반영 뒤.
3. 설계 3장 「🔑 담당자」는 역할마다 한 화면: 성경암송 관리의 「🔑 사역신청 담당자」 · 설교·찬양 관리의 「🔑 설교·찬양 담당자」(같은 함수 `renderStaffAdmins(role)`).
4. **찾은 버그도 함께 고친다:** 「설교/말씀 관리」에서 구절을 열어 저장만 해도 **날짜가 하루씩 당겨진다**(`isoDateInput` 이 UTC 로 읽는다 — 38번 9/19 토가 칸에 9/18 로 보이고 저장하면 9/18). 34~36번이 금요일인 까닭으로 보인다. Task 8.

## 파일 지도

| 파일 | 저장소 | 할 일 |
|---|---|---|
| `supabase/sermon_jobs.sql` | 성경암송 | **새로** — 작업 표 |
| `supabase/dev-sermons-tables.sql` | 성경암송 | **새로** — 개발 DB 에만: `sermons`·`sermon_chunks` |
| `supabase/functions/api/index.ts` | 성경암송 | 담당자 역할 넓히기 · 설교 액션 11개 |
| `tests/sermon-staff-smoke.py` | 성경암송 | **새로** — 권한·검사 스모크(개발) |
| `admin-stats.html` | 성경암송 | 모드 · 로그인 · 메뉴 · 도우미 덩이 · 설교 목록 · ①·② 화면 · 담당자 화면 · CSS |
| `tests/sermon-text.test.cjs` | 성경암송 | **새로** — 도우미 덩이 시험(node 만) |
| `admin-sermon.html` | 성경암송 | `admin-stats.html?only=sermon` 으로 넘기는 주소로 |
| `admin.html` | 성경암송 | 허브 도구 이름·설명 |
| `admin-praise.html` · `praise-api.js` | 성경암송 | (Phase B) 담당자로 들어오기 |
| `scripts/job-lib.mjs` · `job-lib.test.mjs` | gocheok-sermons | **새로** — 순수 함수 + 시험 |
| `scripts/job-api.mjs` · `job-run.mjs` · `job-verify.mjs` · `job-fail.mjs` | gocheok-sermons | **새로** |
| `scripts/2-notes.mjs` · `4-link.mjs` · `5-migrate.mjs` | gocheok-sermons | 작은 고침 |
| `.github/workflows/sermon-job.yml` | gocheok-sermons | **새로** |
| `supabase/functions/praise/index.ts` | praise-songs | (Phase B) 담당자 통과 |

---

# Phase A — 개발 (지금 ~ 9/26)

### Task 1: 작업 폴더와 개발 DB 준비

**Files:**
- Create: `supabase/sermon_jobs.sql`
- Create: `supabase/dev-sermons-tables.sql`

**Interfaces:**
- Produces: 표 `public.sermon_jobs`(칸은 아래 SQL 그대로) — Task 3 의 액션이 읽고 쓴다. 개발 DB 의 `public.sermons`·`public.sermon_chunks`.

- [ ] **Step 1: worktree 두 개 만들기**

```bash
cd /c/Projects/bible-memorize-church-app-v2 && git fetch -q && git worktree add -b feat/sermon-staff /c/Projects/bm-sermon-staff origin/main
cd /c/Projects/gocheok-sermons && git fetch -q && git worktree add -b feat/sermon-staff /c/Projects/gs-sermon-staff origin/main
cd /c/Projects/gs-sermon-staff && npm ci
```
Expected: 두 폴더가 생기고 `git -C /c/Projects/bm-sermon-staff branch --show-current` → `feat/sermon-staff`.

- [ ] **Step 2: `supabase/sermon_jobs.sql` 쓰기** (worktree `C:\Projects\bm-sermon-staff`)

```sql
-- 설교 올리기 작업 기록 — 설교·찬양 담당자(2026-09-21)
-- 설계: docs/superpowers/specs/2026-09-21-sermon-staff-upload-design.md 6장
-- ⚠️ 개발(ktpwthwqzgcqcrmsafdo) 먼저. 운영(xnomlgydifiqiybervtf)은 2026-09-27 안드로이드 심사가 끝난 뒤.
-- 새 표에 새 액션만 얹는다 — 표가 먼저, 함수가 나중(빈 표는 아무도 안 읽는다).
create table if not exists public.sermon_jobs (
  id          bigint generated always as identity primary key,
  video_id    text not null check (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  title       text not null,
  svc_date    date not null,
  category    text not null,             -- ⚠️ CHECK 없음 — 목록은 화면·서버 두 곳(SERMON_CATS)
  preacher    text not null,
  transcript  text not null,             -- 공개 영상의 자막 — 개인정보 아님
  status      text not null default 'queued' check (status in ('queued','running','done','failed')),
  step        text,                      -- 지금(또는 멈춘) 단계
  error       text,                      -- 실패 까닭 한 줄(담당자 화면에 그대로 보인다)
  run_url     text,                      -- GitHub 실행 주소
  created_by  text,                      -- 올린 분 「소속 이름」 — 보이기용, user_id 아님
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
-- 한 번에 하나만 — 두 사람이 같은 순간 눌러도 진행 중인 작업은 하나다(AI 비용이 쌓이지 않게)
create unique index if not exists sermon_jobs_one_active
  on public.sermon_jobs ((true)) where status in ('queued','running');
create index if not exists sermon_jobs_updated_idx on public.sermon_jobs (updated_at desc);
alter table public.sermon_jobs enable row level security;   -- ⚠️ 그 자리에서 켠다
revoke all on public.sermon_jobs from anon, authenticated;
```

- [ ] **Step 3: `supabase/dev-sermons-tables.sql` 쓰기** — 개발 DB 에는 말씀 아카이브 표가 없다(2026-09-21 확인: `PGRST205`)

```sql
-- ⚠️ 개발(ktpwthwqzgcqcrmsafdo) 전용 — 운영에서 돌리지 말 것(운영엔 이미 있다).
-- 운영 sermons 는 gocheok-sermons/supabase/schema.sql 뒤에 칸이 더해졌다 — api 의 toRow 가 쓰는 칸을 모두 넣는다.
create table if not exists public.sermons (
  id text primary key, title text not null, svc_date date,
  category text not null default '주일설교', preacher text default '차동혁 위임목사',
  scripture text, summary text, conclusion text,
  points jsonb default '[]'::jsonb, key_verse jsonb,
  questions jsonb default '[]'::jsonb, tags jsonb default '[]'::jsonb,
  daily_meditations jsonb default '[]'::jsonb,
  easy_explain text, memory_tip text,
  audio_script text, audio text,
  mem_verse_no int, mem_ref text, mem_text text,
  hidden boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.sermons enable row level security;
revoke all on public.sermons from anon, authenticated;

create extension if not exists vector with schema extensions;
create table if not exists public.sermon_chunks (
  id uuid primary key default gen_random_uuid(),
  sermon_id text not null, chunk_index integer not null default 0, content text not null,
  embedding extensions.vector(1024) not null,
  title text not null, svc_date date, scripture text, youtube_id text not null,
  created_at timestamptz not null default now()
);
create index if not exists sermon_chunks_sermon_idx on public.sermon_chunks (sermon_id);
alter table public.sermon_chunks enable row level security;
revoke all on public.sermon_chunks from anon, authenticated;
```

- [ ] **Step 4: 친구에게 부탁** — 제가 SQL 을 못 돌린다(CLI 로그인 없음 · 메모리 `supabase-sql-needs-user`)

> 개발 프로젝트(ktpwthwqzgcqcrmsafdo) SQL Editor 에서 ① `supabase/dev-sermons-tables.sql` ② `supabase/sermon_jobs.sql` 순서로 실행해 주세요. 운영은 9/27 뒤에 ②만.

- [ ] **Step 5: 표가 생겼는지 공개 키로 본다** — 잠겨 있어야 한다(행이 아니라 빈 배열 또는 권한 오류)

```bash
K=sb_publishable_eJKP6u95IU9_DBXTvnvYBA_-yGCf-0Y
for t in sermon_jobs sermons sermon_chunks; do printf "$t: "; curl -s "https://ktpwthwqzgcqcrmsafdo.supabase.co/rest/v1/$t?select=*&limit=1" -H "apikey: $K" -H "Authorization: Bearer $K" | cut -c1-90; echo; done
```
Expected: 셋 다 `PGRST205`(표 없음)이 **아니다**. `[]` 또는 `permission denied` 면 맞다.

- [ ] **Step 6: 커밋** (worktree)

```bash
cd /c/Projects/bm-sermon-staff && git add -- supabase/sermon_jobs.sql supabase/dev-sermons-tables.sql && git commit -m "feat(설교 담당자): 작업 표 sermon_jobs · 개발 DB 용 말씀 아카이브 표

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" -- supabase/sermon_jobs.sql supabase/dev-sermons-tables.sql
```

---

### Task 2: `api` — 담당자 역할을 둘로 넓히기

**Files:**
- Modify: `supabase/functions/api/index.ts` — 「사역신청 담당자 확인」 덩이(`async function ministryAdminError` 부터 `async function ministryAdminsSave` 끝까지)와 라우터 `switch`

**Interfaces:**
- Produces:
  - `staffRoleError(b: any, role: "ministry" | "content"): Promise<string | null>` — null 이면 통과
  - `contentError(b: any): Promise<string | null>` = `staffRoleError(b, "content")`
  - 액션 `contentAuth {pw, staff}` → `{ok:true, role:"content"|"admin"}` / 403 `{ok:false,error:"unauthorized"}`
  - 액션 `staffVerify {role:"content", pw, staff}` → `{ok:true}` / 403 — Phase B 찬양 함수가 부른다
  - 액션 `staffAdmins {pw, role}` · `staffAdminsSave {pw, role, op:"add"|"remove", key}` → `{ok, admins:[…]}` (옛 `ministryAdmins`·`ministryAdminsSave` 는 `role:"ministry"` 로 그대로 산다)
  - app_config 키 `contentAdmins` · 시크릿 `CONTENT_STAFF_SECRET`

- [ ] **Step 1: 덩이 바꾸기** — `async function ministryAdminError(b: any)` 함수 **하나만** 아래로 바꾼다(위 주석은 그대로 둔다)

```ts
// 담당자 역할 — 사역신청(2026-09-17) · 설교·찬양(2026-09-21). 역할마다 암호 하나 + 등록된 담당자 명단.
// 설교·찬양 담당자는 설교를 올리고 암송구절·찬양을 고친다 — 관리자 암호를 드리면 알림 발송·성도 정보까지 열린다.
const STAFF_ROLES: Record<string, { secret: string; list: string }> = {
  ministry: { secret: "MINISTRY_SECRET", list: "ministryAdmins" },
  content:  { secret: "CONTENT_STAFF_SECRET", list: "contentAdmins" },
};
async function staffRoleError(b: any, role: string): Promise<string | null> {
  if (!adminError(b)) return null;
  const r = STAFF_ROLES[role];
  const s = r ? Deno.env.get(r.secret) : "";
  if (!s || (b.pw ?? "") !== s) return adminError(b);
  // ⚠️ 담당자가 아니어도 「unauthorized」 — 틀린 암호와 **같은 답**(2026-09-17 리뷰)
  return (await staffUserId(b, role)) ? null : "unauthorized";
}
const ministryAdminError = (b: any) => staffRoleError(b, "ministry");
const contentError = (b: any) => staffRoleError(b, "content");
```

- [ ] **Step 2: `ministryStaffKey` 를 역할을 받게** — 함수 이름과 첫 두 줄만 바꾼다

찾을 것:
```ts
async function ministryStaffKey(b: any): Promise<string | null> {
  const st = b.staff && typeof b.staff === "object" && !Array.isArray(b.staff) ? b.staff : null;
  if (!st || !norm(st.name)) return null;
  const keys = await ministryAdminKeys();
```
바꿀 것:
```ts
async function staffUserId(b: any, role: string): Promise<string | null> {
  const st = b.staff && typeof b.staff === "object" && !Array.isArray(b.staff) ? b.staff : null;
  if (!st || !norm(st.name)) return null;
  const keys = await staffKeys(role);
```

- [ ] **Step 3: 명단 읽기·보기·저장을 역할로** — `async function ministryAdminKeys()` · `async function ministryAdmins(b: any)` · `async function ministryAdminsSave(b: any)` 셋을 아래로 바꾼다(`ministryAdminsView` 는 그대로 둔다)

```ts
async function staffKeys(role: string): Promise<string[]> {
  const r = STAFF_ROLES[role];
  if (!r) return [];
  const { data, error } = await db.from("app_config").select("value").eq("key", r.list).maybeSingle();
  if (error) throw error;
  return Array.isArray(data?.value) ? (data!.value as any[]).map((x) => norm(String(x))).filter(Boolean) : [];
}

async function staffAdmins(b: any) {
  const err = adminError(b); if (err) return { ok: false, error: err };
  const role = STAFF_ROLES[b.role] ? b.role : "";
  if (!role) return { ok: false, error: "invalid" };
  return { ok: true, admins: await ministryAdminsView(await staffKeys(role)) };
}

async function staffAdminsSave(b: any) {
  const err = adminError(b); if (err) return { ok: false, error: err };
  const role = STAFF_ROLES[b.role] ? b.role : "";
  const op = String(b.op || "");
  const key = norm(b.key);
  if (!role || (op !== "add" && op !== "remove") || !key || key.length > 200) return { ok: false, error: "invalid" };
  const keys = await staffKeys(role);
  if (op === "add") {
    const { data: u, error } = await db.from("users").select("id").eq("identity_key", key).maybeSingle();
    if (error) throw error;
    if (!u) return { ok: false, error: "no-user" };
    if (keys.indexOf(key) < 0) keys.push(key);
  } else {
    const i = keys.indexOf(key);
    if (i >= 0) keys.splice(i, 1);
  }
  const { error } = await db.from("app_config").upsert(
    { key: STAFF_ROLES[role].list, value: keys, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw error;
  // ⚠️ 메모리의 목록이 아니라 **다시 읽은 목록**을 돌려준다 — 두 저장이 겹쳐 한쪽이 덮였으면 화면이 사실을 보인다
  return { ok: true, admins: await ministryAdminsView(await staffKeys(role)) };
}
```

- [ ] **Step 4: 라우터** — `case "ministryAuth"` 바로 아래에 둘을 더하고, `ministryAdmins` 두 줄을 바꾼다

```ts
      case "contentAuth": {    // 설교·찬양 관리 로그인 — 관리자 비번, 또는 설교·찬양 비번 + 등록된 담당자(2026-09-21)
        const e = await contentError(body);
        if (e) return json({ ok: false, error: e }, 403);
        return json({ ok: true, role: adminError(body) ? "content" : "admin" });
      }
      case "staffVerify": {    // 찬양 함수가 묻는다 — 이 비번·담당자가 설교·찬양 담당자로 통과하나
        if (body.role !== "content") return json({ ok: false, error: "invalid" }, 400);
        const e = await contentError(body);
        return json(e ? { ok: false, error: e } : { ok: true }, e ? 403 : 200);
      }
```
```ts
      case "ministryAdmins":     return json(await staffAdmins({ ...body, role: "ministry" }));      // 담당자 명단(관리자만)
      case "ministryAdminsSave": return json(await staffAdminsSave({ ...body, role: "ministry" }));  // 한 분씩 추가·빼기(관리자만)
      case "staffAdmins":        return json(await staffAdmins(body));       // 역할별 명단(관리자만 · role)
      case "staffAdminsSave":    return json(await staffAdminsSave(body));
```

- [ ] **Step 5: 옛 이름이 남았는지 본다**

Run: `grep -n "ministryStaffKey\|ministryAdminKeys\|async function ministryAdmins\b" supabase/functions/api/index.ts`
Expected: 아무것도 안 나온다.

- [ ] **Step 6: 커밋** — 배포는 Task 4 에서 함께

```bash
git commit -m "feat(api): 담당자 역할을 사역신청·설교찬양 둘로 — contentAuth · staffVerify · staffAdmins

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" -- supabase/functions/api/index.ts
```

---

### Task 3: `api` — 설교 올리기 액션

**Files:**
- Modify: `supabase/functions/api/index.ts` — 파일 끝(마지막 함수 뒤)에 새 덩이 · 라우터에 11줄

**Interfaces:**
- Consumes: `contentError`, `adminError`, `norm`, `db`, `json`(Task 2)
- Produces (화면·워크플로가 쓰는 꼴 — **이름 그대로**):
  - 작업 `Job = { id:number, videoId, title, date:"YYYY-MM-DD", category, preacher, status:"queued"|"running"|"done"|"failed", step, error, runUrl, createdBy, createdAt, updatedAt }`
  - `sermonStaffList {pw,staff}` → `{ok, role, sermons:[{id,title,date,category,preacher,scripture,memVerseNo,memRef,hidden,hasNote,hasScript,audio}], jobs:Job[] }`
  - `sermonJobCreate {pw,staff,job:{videoId,title,date,category,preacher,transcript}}` → `{ok, job}` / `{ok:false, error:"exists"|"busy"|"dispatch"|"bad-video"|"no-title"|"bad-date"|"bad-category"|"no-preacher"|"short-transcript"|"long-transcript", detail?, job?}`
  - `sermonJobs {pw,staff}` → `{ok, jobs:Job[]}` (최근 움직인 순 5개)
  - `sermonJobRetry {pw,staff,id}` → `{ok, job}` / `not-failed`·`busy`·`dispatch`
  - `sermonStaffSave {pw,staff,sermon:{id,title,date,category,preacher,hidden}}` → `{ok}`
  - `sermonDelete {pw,id}` — 관리자만
  - `staffVerseSave {pw,staff,verse:{no,date,refShort,refFull,text,hintText,pastor,sermonTitle,url,is_active}}` → `{ok, url}` / `no-required`·`required`·`bad-url`
  - `sermonJobGet {pw,id}` → `{ok, job: 표 한 줄 그대로(snake_case · transcript 포함)}` — 관리자만(워크플로)
  - `sermonJobUpdate {pw,id,status?,step?,error?,run_url?}` → `{ok}` — 관리자만(워크플로)
  - 시크릿 `GH_DISPATCH_TOKEN`(있음) · `GH_DISPATCH_REF`(없으면 `main`)

- [ ] **Step 1: 파일 끝에 덩이를 더한다**

```ts
// ============================================================
// 설교 올리기 — 설교·찬양 담당자(2026-09-21)
//   설계: docs/superpowers/specs/2026-09-21-sermon-staff-upload-design.md 4·6장
//   화면(설교·찬양 관리 → ② 설교 내용 등록)이 sermon_jobs 에 한 줄 넣고 gocheok-sermons 의
//   sermon-job.yml 을 깨운다. 워크플로가 sermonJobGet 으로 자막을 받아 파이프라인을 돌리며
//   sermonJobUpdate 로 단계를 적는다. 유튜브에는 가지 않는다(GitHub 서버에서 자막이 막힌다).
// ============================================================
// ⚠️ 같은 목록이 화면(admin-stats.html SERMON_CATS)에도 있다 — 함께 고칠 것
const SERMON_CATS = ["주일설교", "금요성령집회", "새벽기도회", "송구영신예배", "특별집회", "청년예배"];
const JOB_STATUS = ["queued", "running", "done", "failed"];
const JOB_STEPS = ["dispatch", "prep", "notes", "tts", "link", "versehelp", "save", "embed", "publish", "verify"];
const JOB_COLS = "id,video_id,title,svc_date,category,preacher,status,step,error,run_url,created_by,created_at,updated_at";
const GH_SERMON_WORKFLOW =
  "https://api.github.com/repos/sewoongkim1/gocheok-sermons/actions/workflows/sermon-job.yml/dispatches";

const toJob = (r: any) => ({
  id: r.id, videoId: r.video_id, title: r.title, date: r.svc_date, category: r.category,
  preacher: r.preacher, status: r.status, step: r.step, error: r.error, runUrl: r.run_url,
  createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at,
});

// 영상 번호 — ⚠️ 같은 규칙이 세 곳: 여기 · admin-stats.html stVideoId · gocheok-sermons scripts/job-lib.mjs vidOf
function ytIdOf(u: unknown): string {
  const s = String(u ?? "").trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  const m = s.match(/(?:[?&]v=|youtu\.be\/|\/live\/|\/shorts\/|\/embed\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : "";
}

// 올린 분 「소속 이름」 — 보이기용(user_id 를 싣지 않는다)
function staffLabel(b: any): string {
  if (!adminError(b)) return "관리자";
  const st = b.staff || {};
  const mok = norm(st.mok) ? norm(st.mok).replace(/목장$/, "") + "목장" : "";
  return [st.gu, mok, st.bu, st.grade, st.name].map(norm).filter(Boolean).join(" ").slice(0, 60);
}

// 30분 넘게 소식이 없는 작업은 멈춘 것으로 본다 — 그래야 「한 번에 하나만」이 영원히 막지 않는다.
// 워크플로는 단계마다 updated_at 을 새로 적는다(가장 긴 단계도 몇 분).
async function sermonJobsSweep() {
  const cut = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { error } = await db.from("sermon_jobs")
    .update({ status: "failed", error: "30분 넘게 소식이 없어 멈춘 것으로 봤어요", updated_at: new Date().toISOString() })
    .in("status", ["queued", "running"]).lt("updated_at", cut);
  if (error) throw error;
}

async function sermonRecentJobs() {
  const { data, error } = await db.from("sermon_jobs").select(JOB_COLS)
    .order("updated_at", { ascending: false }).limit(5);
  if (error) throw error;
  return (data ?? []).map(toJob);
}

async function sermonJobFail(id: number, step: string, msg: string) {
  const { data, error } = await db.from("sermon_jobs")
    .update({ status: "failed", step, error: String(msg).slice(0, 300), updated_at: new Date().toISOString() })
    .eq("id", id).select(JOB_COLS).maybeSingle();
  if (error) throw error;
  return data ? toJob(data) : null;
}

async function dispatchSermonJob(id: number): Promise<{ ok: boolean; error?: string }> {
  const token = Deno.env.get("GH_DISPATCH_TOKEN");
  if (!token) return { ok: false, error: "GH_DISPATCH_TOKEN 시크릿 미설정" };
  // 개발 DB 는 가지(feat/sermon-staff)에서 시험한다 — GH_DISPATCH_REF 로 고른다. 운영은 main.
  const ref = Deno.env.get("GH_DISPATCH_REF") || "main";
  const apiBase = `${Deno.env.get("SUPABASE_URL")}/functions/v1/api`;
  const r = await fetch(GH_SERMON_WORKFLOW, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "gocheok-sermon-admin", "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref, inputs: { job_id: String(id), api_base: apiBase } }),
  });
  if (r.status === 204) return { ok: true };
  return { ok: false, error: `GitHub ${r.status}: ${(await r.text()).slice(0, 200)}` };
}

async function sermonStaffList(b: any) {
  const err = await contentError(b); if (err) return { ok: false, error: err };
  const { data, error } = await db.from("sermons")
    .select("id,title,svc_date,category,preacher,scripture,mem_verse_no,mem_ref,hidden,summary,points,key_verse,audio_script,audio")
    .order("svc_date", { ascending: false });
  if (error) throw error;
  const sermons = (data ?? []).map((r: any) => ({
    id: r.id, title: r.title, date: r.svc_date || "", category: r.category, preacher: r.preacher || "",
    scripture: r.scripture || "", memVerseNo: r.mem_verse_no ?? null, memRef: r.mem_ref || "", hidden: !!r.hidden,
    hasNote: !!(r.summary && (r.points || []).length && r.key_verse), hasScript: !!r.audio_script, audio: r.audio || "",
  }));
  return { ok: true, role: adminError(b) ? "content" : "admin", sermons, jobs: await sermonRecentJobs() };
}

async function sermonJobCreate(b: any) {
  const err = await contentError(b); if (err) return { ok: false, error: err };
  const j = b.job || {};
  const video_id = String(j.videoId || "");
  if (!/^[A-Za-z0-9_-]{11}$/.test(video_id)) return { ok: false, error: "bad-video" };
  const title = norm(j.title).normalize("NFC").slice(0, 200);
  if (!title) return { ok: false, error: "no-title" };
  const svc_date = String(j.date || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(svc_date)) return { ok: false, error: "bad-date" };
  const category = String(j.category || "");
  if (!SERMON_CATS.includes(category)) return { ok: false, error: "bad-category" };
  const preacher = norm(j.preacher).normalize("NFC").slice(0, 60);
  if (!preacher) return { ok: false, error: "no-preacher" };
  const transcript = String(j.transcript || "").normalize("NFC").replace(/\s+/g, " ").trim();
  if (transcript.length < 1000) return { ok: false, error: "short-transcript" };
  if (transcript.length > 200000) return { ok: false, error: "long-transcript" };
  // 이미 있으면 받지 않는다 — 두 번 돌리면 AI 비용만 든다
  const { data: ex, error: e1 } = await db.from("sermons").select("id").eq("id", video_id).maybeSingle();
  if (e1) throw e1;
  if (ex) return { ok: false, error: "exists" };
  await sermonJobsSweep();
  const { data: row, error: e2 } = await db.from("sermon_jobs")
    .insert({ video_id, title, svc_date, category, preacher, transcript, created_by: staffLabel(b) })
    .select(JOB_COLS).single();
  if (e2) {
    if ((e2 as any).code === "23505") return { ok: false, error: "busy" };   // sermon_jobs_one_active
    throw e2;
  }
  const d = await dispatchSermonJob(row.id);
  if (!d.ok) return { ok: false, error: "dispatch", detail: d.error, job: await sermonJobFail(row.id, "dispatch", d.error!) };
  return { ok: true, job: toJob(row) };
}

async function sermonJobs(b: any) {
  const err = await contentError(b); if (err) return { ok: false, error: err };
  await sermonJobsSweep();
  return { ok: true, jobs: await sermonRecentJobs() };
}

async function sermonJobRetry(b: any) {
  const err = await contentError(b); if (err) return { ok: false, error: err };
  const id = Number(b.id);
  if (!Number.isInteger(id)) return { ok: false, error: "invalid" };
  await sermonJobsSweep();
  // ⚠️ 「이미 있음」은 보지 않는다 — 첫 시도가 저장까지 갔다가 멈췄을 수 있다(설계 10장)
  const { data: row, error } = await db.from("sermon_jobs")
    .update({ status: "queued", step: null, error: null, run_url: null, updated_at: new Date().toISOString() })
    .eq("id", id).eq("status", "failed").select(JOB_COLS).maybeSingle();
  if (error) {
    if ((error as any).code === "23505") return { ok: false, error: "busy" };
    throw error;
  }
  if (!row) return { ok: false, error: "not-failed" };
  const d = await dispatchSermonJob(id);
  if (!d.ok) return { ok: false, error: "dispatch", detail: d.error, job: await sermonJobFail(id, "dispatch", d.error!) };
  return { ok: true, job: toJob(row) };
}

async function sermonStaffSave(b: any) {
  const err = await contentError(b); if (err) return { ok: false, error: err };
  const s = b.sermon || {};
  const id = String(s.id || "");
  const title = norm(s.title).normalize("NFC");
  if (!id || !title) return { ok: false, error: "invalid" };
  const { data: cur, error: e1 } = await db.from("sermons").select("category").eq("id", id).maybeSingle();
  if (e1) throw e1;
  if (!cur) return { ok: false, error: "not-found" };
  const category = String(s.category || "");
  // 목록 밖의 옛 구분은 그대로 두는 것만 허락한다(바꾸면 목록 안에서)
  if (!SERMON_CATS.includes(category) && category !== cur.category) return { ok: false, error: "bad-category" };
  const date = String(s.date || "");
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "bad-date" };
  // ⚠️ 다섯 칸만 바꾼다 — 옛 saveSermon 은 통째 upsert 라 빠진 칸이 null 이 됐다
  const { error } = await db.from("sermons").update({
    title, svc_date: date || null, category, preacher: norm(s.preacher).normalize("NFC") || null,
    hidden: !!s.hidden, updated_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) throw error;
  return { ok: true };
}

async function sermonDelete(b: any) {
  const err = adminError(b); if (err) return { ok: false, error: err };
  const id = String(b.id || "");
  if (!/^[A-Za-z0-9_-]{6,40}$/.test(id)) return { ok: false, error: "invalid" };
  // 챗봇이 지운 설교를 인용하지 않게 색인부터
  const { error: e1 } = await db.from("sermon_chunks").delete().eq("sermon_id", id);
  if (e1) throw e1;
  const { error: e2 } = await db.from("sermons").delete().eq("id", id);
  if (e2) throw e2;
  return { ok: true };
}

// ① 설교/말씀 등록의 담당자 저장 — 한글 칸만. ⚠️ text_en·ref_en 은 건드리지 않는다
//    (관리자 saveVerse 는 행을 통째로 upsert 해서, 빈 칸을 보내면 영어 본문이 지워진다).
async function staffVerseSave(b: any) {
  const err = await contentError(b); if (err) return { ok: false, error: err };
  const v = b.verse || {};
  const no = Number(v.no);
  if (!Number.isInteger(no) || no < 1 || no > 9999) return { ok: false, error: "no-required" };
  const refShort = norm(v.refShort).normalize("NFC");
  const text = String(v.text ?? "").normalize("NFC").trim();
  if (!refShort || !text) return { ok: false, error: "required" };
  let url = String(v.url ?? "").trim();
  if (url) {
    const id = ytIdOf(url);
    if (!id) return { ok: false, error: "bad-url" };
    url = `https://www.youtube.com/watch?v=${id}`;   // 4-link 가 틀림없이 찾는 꼴로
  }
  const refFull = norm(v.refFull).normalize("NFC");
  const row: any = {
    date: v.date || null, ref_short: refShort, ref_full: refFull || null, ref: refFull || refShort, text,
    hint: norm(v.hintText).normalize("NFC") || null, pastor: norm(v.pastor).normalize("NFC") || null,
    sermon_title: norm(v.sermonTitle).normalize("NFC") || null, sermon_url: url || null,
    is_active: v.is_active !== false,
  };
  const { data: ex, error: e1 } = await db.from("verses").select("no").eq("no", no).maybeSingle();
  if (e1) throw e1;
  const { error } = ex
    ? await db.from("verses").update(row).eq("no", no)
    : await db.from("verses").insert({ no, week: no, ...row });
  if (error) throw error;
  return { ok: true, url };
}

async function sermonJobGet(b: any) {
  const err = adminError(b); if (err) return { ok: false, error: err };
  const id = Number(b.id);
  if (!Number.isInteger(id)) return { ok: false, error: "invalid" };
  const { data, error } = await db.from("sermon_jobs").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? { ok: true, job: data } : { ok: false, error: "not-found" };
}

async function sermonJobUpdate(b: any) {
  const err = adminError(b); if (err) return { ok: false, error: err };
  const id = Number(b.id);
  if (!Number.isInteger(id)) return { ok: false, error: "invalid" };
  const patch: any = { updated_at: new Date().toISOString() };
  if (b.status != null) { if (!JOB_STATUS.includes(b.status)) return { ok: false, error: "bad-status" }; patch.status = b.status; }
  if (b.step != null) { if (!JOB_STEPS.includes(b.step)) return { ok: false, error: "bad-step" }; patch.step = b.step; }
  if (b.error !== undefined) patch.error = b.error == null ? null : String(b.error).slice(0, 300);
  if (b.run_url != null) patch.run_url = String(b.run_url).slice(0, 300);
  const { data, error } = await db.from("sermon_jobs").update(patch).eq("id", id).select("id").maybeSingle();
  if (error) {
    if ((error as any).code === "23505") return { ok: false, error: "busy" };
    throw error;
  }
  return data ? { ok: true } : { ok: false, error: "not-found" };
}
```

- [ ] **Step 2: 라우터** — `case "embedSermons"` 줄 아래에

```ts
      // ---- 설교 올리기 — 설교·찬양 담당자(2026-09-21) ----
      case "sermonStaffList": return json(await sermonStaffList(body));
      case "sermonJobCreate": return json(await sermonJobCreate(body));
      case "sermonJobs":      return json(await sermonJobs(body));
      case "sermonJobRetry":  return json(await sermonJobRetry(body));
      case "sermonStaffSave": return json(await sermonStaffSave(body));
      case "sermonDelete":    return json(await sermonDelete(body));
      case "staffVerseSave":  return json(await staffVerseSave(body));
      case "sermonJobGet":    return json(await sermonJobGet(body));      // 워크플로 — 관리자 암호만
      case "sermonJobUpdate": return json(await sermonJobUpdate(body));   // 워크플로 — 관리자 암호만
```

- [ ] **Step 3: 커밋**

```bash
git commit -m "feat(api): 설교 올리기 액션 — 작업 만들기·보기·다시 시도 · 설교 고치기 · 담당자 구절 저장

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" -- supabase/functions/api/index.ts
```

---

### Task 4: 개발에 배포하고 권한 스모크

**Files:**
- Create: `tests/sermon-staff-smoke.py`

**Interfaces:**
- Consumes: Task 2·3 의 액션 이름 그대로
- 준비(친구): 개발 프로젝트 시크릿 `CONTENT_STAFF_SECRET`(설교·찬양 암호) · `GH_DISPATCH_TOKEN`(운영과 같은 토큰이어도 된다 — gocheok-sermons 에 Actions 쓰기 권한) · `GH_DISPATCH_REF=feat/sermon-staff`

- [ ] **Step 1: 스모크를 쓴다**

```python
# -*- coding: utf-8 -*-
"""설교·찬양 담당자 권한 스모크 — **개발 DB 전용**(운영에서 돌리지 말 것).

    ADMIN_PW=<개발 관리자 암호> STAFF_PW=<설교·찬양 암호> python tests/sermon-staff-smoke.py

⚠️ 암호를 이 파일에 적지 않는다(공개 저장소). 환경 변수로만 받는다.
⚠️ 한글은 파이썬이 UTF-8 로 보낸다 — 명령줄 curl 에 한글을 쓰면 깨져서 서버 버그로 오인한다.
시험용 담당자: 개발 DB 의 「교구 사랑 1목장 사역담당시험」(사역신청 시험에도 쓰는 분).
"""
import json, os, sys, urllib.request, urllib.error
try: sys.stdout.reconfigure(encoding="utf-8")
except Exception: pass

BASE = "https://ktpwthwqzgcqcrmsafdo.supabase.co/functions/v1/api"
KEY = "sb_publishable_eJKP6u95IU9_DBXTvnvYBA_-yGCf-0Y"
ADMIN, STAFF = os.environ["ADMIN_PW"], os.environ["STAFF_PW"]
ME = {"type": "교구", "gu": "사랑", "mok": "1", "name": "사역담당시험"}
ME_KEY = "교구|사랑|1|||사역담당시험"
NOBODY = {"type": "교구", "gu": "사랑", "mok": "1", "name": "없는사람시험"}

def call(p):
    req = urllib.request.Request(BASE, data=json.dumps(p).encode("utf-8"),
        headers={"Content-Type": "application/json", "apikey": KEY, "Authorization": "Bearer " + KEY})
    try:
        with urllib.request.urlopen(req) as r: return json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return json.loads(e.read() or b"{}")

fails = 0
def chk(name, got, want):
    global fails
    ok = got == want
    fails += 0 if ok else 1
    print(("  o " if ok else "  X ") + name + " = " + repr(got) + ("" if ok else "   (기대 " + repr(want) + ")"))

# 준비: 시험 담당자를 설교·찬양 명단에 넣는다(여러 번 돌려도 같다)
r = call({"action": "staffAdminsSave", "pw": ADMIN, "role": "content", "op": "add", "key": ME_KEY})
chk("명단에 넣기", r.get("ok"), True)

print("[1] 로그인")
chk("틀린 암호", call({"action": "contentAuth", "pw": "wrong", "staff": ME}).get("error"), "unauthorized")
chk("맞는 암호 + 등록 안 된 분", call({"action": "contentAuth", "pw": STAFF, "staff": NOBODY}).get("error"), "unauthorized")
chk("맞는 암호 + 등록된 분", call({"action": "contentAuth", "pw": STAFF, "staff": ME}).get("role"), "content")
chk("관리자 암호", call({"action": "contentAuth", "pw": ADMIN}).get("role"), "admin")
chk("목장 「1목장」으로 적어도", call({"action": "contentAuth", "pw": STAFF, "staff": dict(ME, mok="1목장")}).get("role"), "content")

print("[2] 설교·찬양 암호로 막혀야 하는 것")
S = {"pw": STAFF, "staff": ME}
for a, extra in [("authCheck", {}), ("stats", {}), ("sendPush", {"title": "x", "body": "x"}),
                 ("saveVerse", {"verse": {"no": 9999}}), ("sermonDelete", {"id": "AAAAAAAAAAA"}),
                 ("sermonJobGet", {"id": 1}), ("sermonJobUpdate", {"id": 1, "step": "notes"}),
                 ("staffAdminsSave", {"role": "content", "op": "add", "key": ME_KEY}),
                 ("ministryList", {}), ("adminFindMembers", {"query": "x"})]:
    chk(a, call(dict(S, action=a, **extra)).get("error"), "unauthorized")
print("[3] 사역 암호와 섞이지 않는다")
chk("설교 암호로 ministryAuth", call(dict(S, action="ministryAuth")).get("error"), "unauthorized")

print("[4] 담당자에게 열린 것")
r = call(dict(S, action="sermonStaffList"))
chk("sermonStaffList", r.get("ok"), True)
chk("응답에 user_id 없음", "user_id" in json.dumps(r), False)
chk("sermonJobs", call(dict(S, action="sermonJobs")).get("ok"), True)
print("[5] 검사")
J = {"videoId": "AAAAAAAAAAA", "title": "시험", "date": "2026-09-20", "category": "주일설교",
     "preacher": "차동혁 위임목사", "transcript": "가" * 1200}
chk("영상 번호", call(dict(S, action="sermonJobCreate", job=dict(J, videoId="bad"))).get("error"), "bad-video")
chk("구분", call(dict(S, action="sermonJobCreate", job=dict(J, category="없는구분"))).get("error"), "bad-category")
chk("짧은 자막", call(dict(S, action="sermonJobCreate", job=dict(J, transcript="가" * 50))).get("error"), "short-transcript")
chk("구절 링크 꼴", call(dict(S, action="staffVerseSave", verse={"no": 9998, "refShort": "시험", "text": "시험", "url": "https://example.com"})).get("error"), "bad-url")
print("[6] 찬양 함수가 묻는 길")
chk("staffVerify 담당자", call({"action": "staffVerify", "role": "content", "pw": STAFF, "staff": ME}).get("ok"), True)
chk("staffVerify 틀린 암호", call({"action": "staffVerify", "role": "content", "pw": "wrong", "staff": ME}).get("error"), "unauthorized")
chk("staffVerify 다른 역할", call({"action": "staffVerify", "role": "ministry", "pw": STAFF, "staff": ME}).get("error"), "invalid")

print("\n실패 %d" % fails)
sys.exit(1 if fails else 0)
```

- [ ] **Step 2: worktree 가 깨끗한지 보고 개발에 배포**

```bash
cd /c/Projects/bm-sermon-staff && git status --short   # 비어 있어야 한다
supabase functions deploy api --no-verify-jwt --project-ref ktpwthwqzgcqcrmsafdo
```
Expected: `Deployed Functions on project ktpwthwqzgcqcrmsafdo: api`

- [ ] **Step 3: 스모크를 돌린다** (암호는 친구가 알려 준 값을 이 셸에만)

Run: `ADMIN_PW='…' STAFF_PW='…' python tests/sermon-staff-smoke.py`
Expected: 모든 줄이 `o`, 끝에 `실패 0`. `X` 가 있으면 그 액션의 권한 검사부터 본다.

- [ ] **Step 4: 사역신청이 그대로인지** — 기존 사역 담당자 로그인이 살아 있어야 한다

Run: `python -c "import json,urllib.request as u;r=u.Request('https://ktpwthwqzgcqcrmsafdo.supabase.co/functions/v1/api',data=json.dumps({'action':'ministryAdmins','pw':'$ADMIN_PW'}).encode(),headers={'Content-Type':'application/json','apikey':'sb_publishable_eJKP6u95IU9_DBXTvnvYBA_-yGCf-0Y'});print(json.loads(u.urlopen(r).read())['ok'])"`
Expected: `True`

- [ ] **Step 5: 커밋**

```bash
git add -- tests/sermon-staff-smoke.py && git commit -m "test(설교 담당자): 권한 스모크 — 로그인 다섯 · 막힐 것 열하나 · 검사 넷

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" -- tests/sermon-staff-smoke.py
```

---

### Task 5: gocheok-sermons — 순수 함수와 작은 고침

**Files:** (worktree `C:\Projects\gs-sermon-staff`)
- Create: `scripts/job-lib.mjs`, `scripts/job-lib.test.mjs`
- Modify: `scripts/2-notes.mjs`(한 줄) · `scripts/4-link.mjs`(머리) · `scripts/5-migrate.mjs`(끝 줄)

**Interfaces:**
- Produces: `PROD_API`, `DEV_API`, `modeOf(base) → "prod"|"dev"|null`, `anonKeyOf(base)`, `vidOf(u) → string`, `mergeMeta(meta, job) → meta[]`, `adoptSermon(sermons, row) → sermons[]`, `noteOf(sermons, id) → sermon|null`

- [ ] **Step 1: 시험부터**

```js
// node --test scripts/job-lib.test.mjs — 준비물 없이(node 만)
import { test } from "node:test";
import assert from "node:assert/strict";
import { modeOf, anonKeyOf, vidOf, mergeMeta, adoptSermon, noteOf, PROD_API, DEV_API } from "./job-lib.mjs";

test("주소는 두 개만 안다", () => {
  assert.equal(modeOf(PROD_API), "prod");
  assert.equal(modeOf(DEV_API), "dev");
  assert.equal(modeOf("https://evil.example/functions/v1/api"), null);
  assert.equal(modeOf(undefined), null);
  assert.notEqual(anonKeyOf(PROD_API), anonKeyOf(DEV_API));
});

test("영상 번호 — 여러 꼴", () => {
  for (const u of ["https://www.youtube.com/watch?v=9YgDMXP77NE", "https://youtu.be/9YgDMXP77NE?si=abc",
    "https://www.youtube.com/live/9YgDMXP77NE", "https://youtube.com/shorts/9YgDMXP77NE",
    "https://www.youtube.com/watch?feature=share&v=9YgDMXP77NE", "9YgDMXP77NE"]) assert.equal(vidOf(u), "9YgDMXP77NE", u);
  assert.equal(vidOf(""), "");
  assert.equal(vidOf("https://example.com/watch?v=short"), "");
});

test("meta — 같은 영상은 한 줄, 날짜 최신순", () => {
  const meta = [{ id: "OLDOLDOLD01", title: "옛", date: "2026-09-13" }, { id: "9YgDMXP77NE", title: "틀린", date: "" }];
  const job = { video_id: "9YgDMXP77NE", title: "새 제목", svc_date: "2026-09-20", category: "주일설교", preacher: "초청 목사" };
  const out = mergeMeta(meta, job);
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], { id: "9YgDMXP77NE", title: "새 제목", date: "2026-09-20", category: "주일설교", preacher: "초청 목사" });
});

test("다시 시도 — DB 에 있던 설교가 sermons.json 을 이긴다", () => {
  const out = adoptSermon([{ id: "A", summary: "로컬" }, { id: "B" }], { id: "A", summary: "DB" });
  assert.equal(out.length, 2);
  assert.equal(out.find((s) => s.id === "A").summary, "DB");
  assert.equal(noteOf(out, "A").summary, "DB");
  assert.equal(noteOf(out, "B"), null);   // 요약 없는 것은 노트가 아니다
});
```

- [ ] **Step 2: 돌려서 실패를 본다**

Run: `node --test scripts/job-lib.test.mjs`
Expected: FAIL — `Cannot find module …/job-lib.mjs`

- [ ] **Step 3: `scripts/job-lib.mjs`**

```js
// 관리자 화면 설교 올리기(sermon-job.yml)가 쓰는 순수 함수 — job-lib.test.mjs 가 시험한다.
export const PROD_API = "https://xnomlgydifiqiybervtf.supabase.co/functions/v1/api";
export const DEV_API = "https://ktpwthwqzgcqcrmsafdo.supabase.co/functions/v1/api";
const KEYS = {
  [PROD_API]: "sb_publishable_oLtieT_jw7Gjb8etEsy0jw_thBaDjl-",
  [DEV_API]: "sb_publishable_eJKP6u95IU9_DBXTvnvYBA_-yGCf-0Y",
};
// ⚠️ 이 둘 말고는 모른다고 답한다 — 모르는 주소에 관리자 암호를 보내지 않게
export const modeOf = (base) => (base === PROD_API ? "prod" : base === DEV_API ? "dev" : null);
export const anonKeyOf = (base) => KEYS[base] || KEYS[PROD_API];

// 영상 번호 — ⚠️ 같은 규칙이 세 곳: 여기 · 성경암송 admin-stats.html stVideoId · api 함수 ytIdOf
export function vidOf(u) {
  const s = String(u ?? "").trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  const m = s.match(/(?:[?&]v=|youtu\.be\/|\/live\/|\/shorts\/|\/embed\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : "";
}

// 작업 한 건을 data/meta.json 한 줄로 — 제목·날짜·구분·설교자는 담당자가 확인한 값(유튜브에 가지 않는다)
export function mergeMeta(meta, job) {
  const rest = (meta || []).filter((m) => m.id !== job.video_id);
  rest.push({ id: job.video_id, title: job.title, date: job.svc_date, category: job.category, preacher: job.preacher });
  return rest.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}

// 다시 시도: DB 에 이미 들어간 설교는 그 내용이 맞다(AI 노트를 다시 만들면 음성과 글이 어긋난다)
export function adoptSermon(sermons, row) {
  return [row, ...(sermons || []).filter((s) => s.id !== row.id)];
}

export const noteOf = (sermons, id) => (sermons || []).find((s) => s.id === id && s.summary) || null;
```

- [ ] **Step 4: 시험 통과**

Run: `node --test scripts/job-lib.test.mjs`
Expected: `# pass 4` `# fail 0`

- [ ] **Step 5: `2-notes.mjs` — 설교자·구분을 작업 값으로**

찾을 것:
```js
        id: m.id, title: m.title, preacher: PREACHER, series: SERIES, date: m.date || "",
```
바꿀 것:
```js
        // 설교자·구분은 관리자 화면에서 확인한 값이 있으면 그것(초청 설교자 주 · 2026-09-21), 없으면 예전 고정값
        id: m.id, title: m.title, preacher: m.preacher || PREACHER, series: SERIES, date: m.date || "",
        ...(m.category ? { category: m.category } : {}),
```

- [ ] **Step 6: `4-link.mjs` — 주소를 받고, 영상 번호를 같은 규칙으로**

찾을 것:
```js
import { readFileSync, writeFileSync } from "node:fs";

const API = "https://xnomlgydifiqiybervtf.supabase.co/functions/v1/api";
const KEY = "sb_publishable_oLtieT_jw7Gjb8etEsy0jw_thBaDjl-";
const OUT = "src/data/sermons.json";
const vidOf = (u) => (/[?&]v=([^&]+)/.exec(u || "") || [])[1] || "";
```
바꿀 것:
```js
import { readFileSync, writeFileSync } from "node:fs";
import { PROD_API, anonKeyOf, vidOf } from "./job-lib.mjs";

// 관리자 화면 시험(개발 DB)은 API_BASE 로 개발 주소를 준다. 없으면 운영(친구 PC·예전 그대로).
// ⚠️ 영상 번호는 youtu.be/… 꼴도 알아본다(예전엔 ?v= 만 알아 조용히 안 이어졌다)
const API = process.env.API_BASE || PROD_API;
const KEY = anonKeyOf(API);
const OUT = "src/data/sermons.json";
```

- [ ] **Step 7: `5-migrate.mjs` — 적재 실패는 진짜 실패로**

찾을 것:
```js
console.log(j.ok ? `✅ 테이블 적재 완료: ${j.count}편` : `❌ 실패: ${j.error}`);
```
바꿀 것:
```js
// ⚠️ 실패해도 0 으로 끝나 Actions 가 초록불이던 자리(메모리 sermon-yt-bot-block) — 이제 빨간불로 멈춘다
if (!j.ok) { console.log(`❌ 실패: ${j.error}`); process.exit(1); }
console.log(`✅ 테이블 적재 완료: ${j.count}편`);
```

- [ ] **Step 8: 친구 PC 방식이 그대로인지** — 4-link 를 운영으로 한 번(쓰기는 로컬 파일뿐)

Run: `node scripts/4-link.mjs && git diff --stat -- src/data/sermons.json`
Expected: `매칭 완료: N/…편` 이 나오고 `sermons.json` 이 **바뀌지 않는다**(바뀌면 새 규칙이 옛 연결을 다르게 본 것 — 그 줄을 본다). 확인 뒤 `git checkout -- src/data/sermons.json`.

- [ ] **Step 9: 커밋**

```bash
git add -- scripts/job-lib.mjs scripts/job-lib.test.mjs && git commit -m "feat(파이프라인): 관리자 화면 올리기용 순수 함수 · 설교자/구분을 작업 값으로 · 적재 실패는 빨간불

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" -- scripts/job-lib.mjs scripts/job-lib.test.mjs scripts/2-notes.mjs scripts/4-link.mjs scripts/5-migrate.mjs
```

---

### Task 6: gocheok-sermons — 작업 돌리기 스크립트와 워크플로

**Files:** (worktree `C:\Projects\gs-sermon-staff`)
- Create: `scripts/job-api.mjs`, `scripts/job-run.mjs`, `scripts/job-verify.mjs`, `scripts/job-fail.mjs`, `.github/workflows/sermon-job.yml`

**Interfaces:**
- Consumes: `sermonJobGet`·`sermonJobUpdate`(Task 3), `modeOf`·`anonKeyOf`·`mergeMeta`·`adoptSermon`·`noteOf`(Task 5)
- Produces: `jobApi(env) → { id, get(): Promise<row>, update(fields): Promise }` · 워크플로 입력 `job_id`·`api_base`
- 준비(친구): gocheok-sermons 저장소 시크릿 `DEV_SERMON_ADMIN`(개발 관리자 암호) · `TELEGRAM_TOKEN` · `TELEGRAM_CHAT_ID`(성경암송 `monitor.yml` 과 같은 값)

- [ ] **Step 1: `scripts/job-api.mjs`**

```js
// sermon_jobs 한 건을 읽고 적는다 — api 함수의 sermonJobGet·sermonJobUpdate(관리자 암호).
import { modeOf, anonKeyOf } from "./job-lib.mjs";

export function jobApi(env) {
  const base = env.API_BASE, pw = env.SERMON_ADMIN, id = Number(env.JOB_ID);
  // ⚠️ 모르는 주소면 여기서 멈춘다 — 관리자 암호를 그리로 보내지 않는다
  if (!modeOf(base)) throw new Error(`모르는 API_BASE: ${base}`);
  if (!pw || !Number.isInteger(id)) throw new Error("SERMON_ADMIN · JOB_ID 가 필요하다");
  const key = anonKeyOf(base);
  async function call(action, extra = {}) {
    const r = await fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({ action, pw, id, ...extra }),
    });
    const j = await r.json().catch(() => ({}));
    if (!j.ok) throw new Error(`${action}: ${j.error || "HTTP " + r.status}`);
    return j;
  }
  return { id, get: async () => (await call("sermonJobGet")).job, update: (fields) => call("sermonJobUpdate", fields) };
}
```

- [ ] **Step 2: `scripts/job-run.mjs`**

```js
// 관리자 화면(설교·찬양 관리 → ② 설교 내용 등록)에서 올린 작업 한 건 — sermon-job.yml 이 부른다.
//   유튜브에는 가지 않는다: 자막은 담당자가 붙인 것(sermon_jobs.transcript), 제목·날짜·구분·설교자도 그 값.
//   설계: bible-memorize-church-app-v2/docs/superpowers/specs/2026-09-21-sermon-staff-upload-design.md 4장
// 환경: API_BASE · SERMON_ADMIN · JOB_ID · RUN_URL · ANTHROPIC_API_KEY · AZURE_SPEECH_KEY · AZURE_SPEECH_REGION
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { jobApi } from "./job-api.mjs";
import { modeOf, mergeMeta, adoptSermon, noteOf } from "./job-lib.mjs";

const SERMON_FN = "https://xnomlgydifiqiybervtf.supabase.co/functions/v1/sermon";
const SERMON_KEY = "sb_publishable_oLtieT_jw7Gjb8etEsy0jw_thBaDjl-";
const OUT = "src/data/sermons.json";
const MODE = modeOf(process.env.API_BASE);
const api = jobApi(process.env);
// 멈춘 단계 → 담당자 화면에 보일 한 줄
const FAIL = {
  prep: "자막을 준비하지 못했어요", notes: "AI 노트를 만들지 못했어요", tts: "3분 음성을 만들지 못했어요",
  link: "암송구절에 잇지 못했어요", versehelp: "암송 도우미를 만들지 못했어요",
  save: "설교를 저장하지 못했어요", embed: "챗봇 색인을 만들지 못했어요",
};
const readSermons = () => (existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : []);
let step = "prep";
async function run(name, args) {
  step = name;
  await api.update({ step: name });
  console.log(`\n▶ ${name}`);
  execFileSync("node", args, { stdio: "inherit", env: process.env });
}

try {
  const job = await api.get();
  const id = job.video_id;
  await api.update({ status: "running", step: "prep", error: null, run_url: process.env.RUN_URL || null });
  console.log(`설교 올리기 #${job.id}: ${id} · ${job.title} · ${job.svc_date} (${MODE})`);

  mkdirSync("data/transcripts", { recursive: true });
  writeFileSync(`data/transcripts/${id}.txt`, job.transcript, "utf8");
  const meta = existsSync("data/meta.json") ? JSON.parse(readFileSync("data/meta.json", "utf8")) : [];
  writeFileSync("data/meta.json", JSON.stringify(mergeMeta(meta, job), null, 2), "utf8");

  // 다시 시도: 첫 시도가 저장까지 갔으면 DB 내용으로 이어 간다(설계 10장)
  if (MODE === "prod") {
    const r = await fetch(SERMON_FN, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SERMON_KEY, Authorization: `Bearer ${SERMON_KEY}` },
      body: JSON.stringify({ action: "getSermons" }),
    });
    const row = ((await r.json()).sermons || []).find((s) => s.id === id);
    if (row) {
      writeFileSync(OUT, JSON.stringify(adoptSermon(readSermons(), row), null, 2), "utf8");
      console.log("  이미 DB 에 있는 설교 — 그 내용으로 이어 간다");
    }
  }

  await run("notes", ["scripts/2-notes.mjs"]);
  // 2-notes 는 한 편이 실패해도 0 으로 끝난다 — 결과로 본다
  if (!noteOf(readSermons(), id)) throw new Error("AI 노트가 비어 있어요");
  await run("tts", ["scripts/3-tts.mjs"]);
  if (!noteOf(readSermons(), id)?.audio) throw new Error("음성 파일이 만들어지지 않았어요");
  await run("link", ["scripts/4-link.mjs"]);
  await run("versehelp", ["scripts/4b-versehelp.mjs"]);

  if (MODE === "dev") {
    await api.update({ status: "done", step: "verify", error: null });
    console.log("\n🧪 시험 모드(개발 DB) — 저장·챗봇·커밋·배포는 건너뛴다");
    process.exit(0);
  }
  await run("save", ["scripts/5-migrate.mjs"]);
  await run("embed", ["scripts/6-embed.mjs", id]);
  await api.update({ step: "publish" });
  console.log("\n✅ 만들기 끝 — 커밋·배포·확인은 워크플로가 이어서 한다");
} catch (e) {
  const msg = `${FAIL[step] || "멈췄어요"} — ${String(e.message || e).split("\n")[0].slice(0, 160)}`;
  console.error("❌", msg);
  await api.update({ status: "failed", error: msg }).catch((x) => console.error("상태 기록도 실패:", x.message));
  process.exit(1);
}
```

- [ ] **Step 3: `scripts/job-verify.mjs`**

```js
// 배포 뒤 — 설교가 사이트에 정말 들어갔는지 보고서야 「완료」라고 적는다.
//   「스크립트가 끝났다」를 완료로 치지 않는다(옛 add-sermon.yml 은 자막이 없어도 초록불이었다).
import { jobApi } from "./job-api.mjs";

const SERMON_FN = "https://xnomlgydifiqiybervtf.supabase.co/functions/v1/sermon";
const SERMON_KEY = "sb_publishable_oLtieT_jw7Gjb8etEsy0jw_thBaDjl-";
const SITE = "https://sermon.onlybible.kr/";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const api = jobApi(process.env);
const job = await api.get();
const id = job.video_id;
await api.update({ step: "verify" });

let row = null, audioOk = false;
for (let i = 0; i < 9 && !(row && audioOk); i++) {        // 20초 × 9 = 3분까지 — Pages 배포가 늦을 때
  if (i) await sleep(20000);
  try {
    const r = await fetch(SERMON_FN, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SERMON_KEY, Authorization: `Bearer ${SERMON_KEY}` },
      body: JSON.stringify({ action: "getSermons" }),
    });
    row = ((await r.json()).sermons || []).find((s) => s.id === id && s.summary) || null;
  } catch { /* 다음 번에 */ }
  if (row?.audio) {
    try { audioOk = (await fetch(SITE + row.audio, { method: "HEAD" })).ok; } catch { /* 다음 번에 */ }
  }
  console.log(`  확인 ${i + 1}: 설교 ${row ? "있음" : "없음"} · 음성 ${audioOk ? "열림" : "아직"}`);
}
if (!(row && audioOk)) {
  await api.update({ status: "failed", error: row ? "음성 파일이 사이트에 아직 안 보여요(배포 확인 필요)" : "설교가 사이트 목록에 안 보여요" });
  process.exit(1);
}
await api.update({ status: "done", error: null });
console.log("✅ 확인 끝 — 사이트에 들어갔다");
```

- [ ] **Step 4: `scripts/job-fail.mjs`**

```js
// 워크플로가 도중에 죽었을 때 — 작업을 「멈춤」으로 적고(스크립트가 이미 적었으면 그대로) 운영이면 친구에게 텔레그램.
import { jobApi } from "./job-api.mjs";
import { modeOf } from "./job-lib.mjs";

const api = jobApi(process.env);
let job = null;
try { job = await api.get(); } catch (e) { console.error("작업을 못 읽었다:", e.message); }
if (job && job.status !== "failed") {
  await api.update({ status: "failed", error: "GitHub 작업이 도중에 멈췄어요" }).catch(() => {});
  try { job = await api.get(); } catch { /* 위 값으로 */ }
}
const tg = process.env.TG_TOKEN, chat = process.env.TG_CHAT;
if (modeOf(process.env.API_BASE) === "prod" && tg && chat) {
  const text = ["⚠️ 설교 올리기 실패",
    job ? `${job.title} (${job.svc_date}) · ${job.created_by || ""}` : `작업 #${process.env.JOB_ID}`,
    job ? `${job.step || ""} — ${job.error || ""}` : "", process.env.RUN_URL || ""].filter(Boolean).join("\n");
  await fetch(`https://api.telegram.org/bot${tg}/sendMessage`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text }),
  }).catch(() => {});
}
```

- [ ] **Step 5: `.github/workflows/sermon-job.yml`**

```yaml
name: 설교 올리기 (관리자 화면)

# 성경암송 「설교·찬양 관리 → ② 설교 내용 등록」이 api 함수를 거쳐 이 워크플로를 깨운다(sermon_jobs 한 건).
# 유튜브에 가지 않는다 — 자막은 담당자가 붙인 것. 옛 add-sermon.yml 은 GitHub 서버에서 자막이 막혀 실패했다.
# ⚠️ api_base 는 두 주소만 받는다(모르는 곳에 관리자 암호를 보내지 않게). 개발 주소면 시험 모드
#    (노트·음성·연결까지만 — 저장·챗봇·커밋·배포는 건너뛴다).
# ⚠️ 입력은 env 로만 쓴다 — ${{ inputs.* }} 를 run: 에 바로 넣으면 명령이 끼어들 수 있다.

on:
  workflow_dispatch:
    inputs:
      job_id:
        description: 'sermon_jobs 번호'
        required: true
        type: string
      api_base:
        description: 'api 함수 주소(운영/개발)'
        required: true
        type: string

permissions:
  contents: write
  pages: write
  id-token: write

concurrency:
  group: add-sermon
  cancel-in-progress: false

env:
  JOB_ID: ${{ inputs.job_id }}
  API_BASE: ${{ inputs.api_base }}
  RUN_URL: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}

# ⚠️ 일을 넷으로 나눈다 — github-pages 환경은 보통 main 에서만 배포를 허락한다.
#    한 일(job)에 environment 를 걸면 개발 시험(가지 feat/sermon-staff)이 **시작부터** 막힌다.
jobs:
  make:
    runs-on: ubuntu-latest
    outputs:
      mode: ${{ steps.target.outputs.mode }}
    steps:
      - name: 주소·번호 확인
        id: target
        run: |
          case "$JOB_ID" in (''|*[!0-9]*) echo "작업 번호가 이상하다: $JOB_ID"; exit 1;; esac
          case "$API_BASE" in
            https://xnomlgydifiqiybervtf.supabase.co/functions/v1/api) echo "mode=prod" >> "$GITHUB_OUTPUT" ;;
            https://ktpwthwqzgcqcrmsafdo.supabase.co/functions/v1/api) echo "mode=dev" >> "$GITHUB_OUTPUT" ;;
            *) echo "모르는 주소: $API_BASE"; exit 1 ;;
          esac
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci

      - name: 설교 만들기 (노트·음성·연결·저장·챗봇)
        env:
          SERMON_ADMIN: ${{ steps.target.outputs.mode == 'prod' && secrets.SERMON_ADMIN || secrets.DEV_SERMON_ADMIN }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          AZURE_SPEECH_KEY: ${{ secrets.AZURE_SPEECH_KEY }}
          AZURE_SPEECH_REGION: ${{ secrets.AZURE_SPEECH_REGION }}
        run: node scripts/job-run.mjs

      - name: 오디오·데이터 커밋
        if: steps.target.outputs.mode == 'prod'
        run: |
          git config user.name "김세웅"
          git config user.email "sewkim00@gmail.com"
          git add public/audio src/data/sermons.json data/meta.json data/sermons_rows.json
          if git diff --cached --quiet; then
            echo "변경 없음(다시 시도 — 이미 올라가 있다)"
          else
            git commit -m "설교 올리기(관리자 화면 #$JOB_ID)"
            git pull --rebase   # 같은 날 친구 PC(add-local.mjs)에서 올린 것과 부딪히지 않게
            git push
          fi

      - name: 빌드
        if: steps.target.outputs.mode == 'prod'
        run: npm run build
      - if: steps.target.outputs.mode == 'prod'
        uses: actions/configure-pages@v5
      - if: steps.target.outputs.mode == 'prod'
        uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: make
    if: needs.make.outputs.mode == 'prod'
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4

  verify:
    needs: deploy
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: 확인 (사이트에 정말 들어갔나)
        env:
          SERMON_ADMIN: ${{ secrets.SERMON_ADMIN }}
        run: node scripts/job-verify.mjs

  fail:
    needs: [make, deploy, verify]
    # 모르는 주소면(mode 가 비면) 부르지 않는다 — 관리자 암호를 그리로 보내지 않게
    if: failure() && needs.make.outputs.mode != ''
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: 실패 기록·알림
        env:
          SERMON_ADMIN: ${{ needs.make.outputs.mode == 'prod' && secrets.SERMON_ADMIN || secrets.DEV_SERMON_ADMIN }}
          TG_TOKEN: ${{ secrets.TELEGRAM_TOKEN }}
          TG_CHAT: ${{ secrets.TELEGRAM_CHAT_ID }}
        run: node scripts/job-fail.mjs
```
(`job-verify.mjs`·`job-fail.mjs` 는 `node:` 모듈과 `fetch` 만 쓴다 — `npm ci` 가 필요 없다)

- [ ] **Step 6: 문법 확인**

Run: `for f in scripts/job-api.mjs scripts/job-run.mjs scripts/job-verify.mjs scripts/job-fail.mjs; do node --check $f && echo "ok $f"; done && node --test scripts/job-lib.test.mjs`
Expected: `ok` 넷 · `# fail 0`

- [ ] **Step 7: 이 PC 에서 개발 작업 하나를 끝까지** — Actions 없이 스크립트만(집 인터넷 · 개발 DB)

1) 개발에 작업을 하나 만든다(깨우기는 아직 실패해도 된다 — 작업 줄은 남는다). 자막은 로컬에 있는 9/20 설교 것:
```bash
cd /c/Projects/gs-sermon-staff
PYTHONIOENCODING=utf-8 ADMIN_PW='…' python - <<'EOF'
import json, os, urllib.request
t = open(r"C:/Projects/gocheok-sermons/data/transcripts/9YgDMXP77NE.txt", encoding="utf-8").read()
p = {"action": "sermonJobCreate", "pw": os.environ["ADMIN_PW"], "job": {"videoId": "9YgDMXP77NE",
     "title": "시험 — 9월 20일 설교", "date": "2026-09-20", "category": "주일설교", "preacher": "차동혁 위임목사", "transcript": t}}
r = urllib.request.Request("https://ktpwthwqzgcqcrmsafdo.supabase.co/functions/v1/api", data=json.dumps(p).encode("utf-8"),
    headers={"Content-Type": "application/json", "apikey": "sb_publishable_eJKP6u95IU9_DBXTvnvYBA_-yGCf-0Y"})
try: print(urllib.request.urlopen(r).read().decode())
except urllib.error.HTTPError as e: print(e.read().decode())
EOF
```
Expected: `"job":{"id":N,…}` 가 들어 있다(`ok:true` 또는 `error:"dispatch"` — 둘 다 이 단계에선 괜찮다). **N 을 적어 둔다.**

2) 스크립트를 돌린다(`.env` 의 AI·음성 키 · 개발 관리자 암호):
```bash
set -a; . ./.env 2>/dev/null || . /c/Projects/gocheok-sermons/.env; set +a
JOB_ID=N API_BASE=https://ktpwthwqzgcqcrmsafdo.supabase.co/functions/v1/api SERMON_ADMIN='<개발 관리자 암호>' node scripts/job-run.mjs
```
Expected: `▶ notes` `✓ 9YgDMXP77NE (1/1)` `▶ tts` `▶ link` `▶ versehelp` `🧪 시험 모드`. 그다음 `sermonJobs` 로 그 작업이 `status:"done"` 인지 본다.

3) 로컬에 생긴 산출물은 커밋하지 않는다 — `git status --short` 로 바뀐 것을 보고 새 스크립트 말고는 되돌린다:
   `git checkout -- data src/data` · 새 mp3 는 `git clean -n public/audio` 로 목록을 본 뒤 `git clean -f public/audio/9YgDMXP77NE.mp3`
   (`4b-versehelp` 가 `data/verse_help_update.sql` 도 고친다 — 그것도 되돌림 대상)

- [ ] **Step 8: 커밋·가지 올리기**

```bash
git add -- scripts/job-api.mjs scripts/job-run.mjs scripts/job-verify.mjs scripts/job-fail.mjs .github/workflows/sermon-job.yml
git commit -m "feat(파이프라인): 관리자 화면 설교 올리기 — sermon-job.yml · 작업 읽고 단계 적기 · 배포 뒤 확인 · 실패 알림

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" -- scripts/job-api.mjs scripts/job-run.mjs scripts/job-verify.mjs scripts/job-fail.mjs .github/workflows/sermon-job.yml
git push -u origin feat/sermon-staff
```

- [ ] **Step 9: 워크플로 파일만 gocheok-sermons `main` 에** — GitHub 은 **기본 가지에 있는 워크플로만** 부를 수 있다(실제로 도는 코드는 `GH_DISPATCH_REF` 가지의 것). 친구 확인을 받은 한 파일.

```bash
cd /c/Projects/gocheok-sermons && git status --short   # 남의 작업이 있으면 건드리지 않고 이 파일만
git fetch -q && git checkout main && git pull --ff-only
git checkout feat/sermon-staff -- .github/workflows/sermon-job.yml
git commit -m "ci: 설교 올리기(관리자 화면) 워크플로 자리 — 가지 feat/sermon-staff 에서 시험

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" -- .github/workflows/sermon-job.yml
git push
```
Expected: `gh workflow list -R sewoongkim1/gocheok-sermons` 에 `설교 올리기 (관리자 화면)` 이 보인다.

---

### Task 7: 화면 — 「설교·찬양 관리」 모드 · 로그인 · 메뉴

**Files:** (worktree `C:\Projects\bm-sermon-staff`)
- Modify: `admin-stats.html` — 모드 덩이(`const MINISTRY_ONLY = …` 부터 `if(MINISTRY_ONLY){ … }` 까지) · `renderLogin` 첫 줄 · `renderMinistryLogin` · `minAuthLost` · `renderMenu` 의 두 카드와 두 줄 · 새 `renderSermonMenu`
- Modify: `admin-sermon.html`(통째로) · `admin.html`(TOOLS 한 줄)

**Interfaces:**
- Produces: 전역 `ONLY`, `MINISTRY_ONLY`, `SERMON_ONLY`, `STAFF_MODE`(담당자로 들어온 화면), `getPw()`, `getStaff()`, `STAFF_CFG`, `renderSermonMenu()` · 카드 id `rep-content`(①) `rep-sermonup`(②) `rep-sermonlist` `rep-medlib` `rep-praise` `rep-contentadmins`
- Consumes (다음 Task 들이 만든다 — 함수 선언이라 순서 상관없음): `renderContent`(있음), `renderSermonUpload`(Task 11), `renderSermonList`(Task 9), `renderMedLibrary`(있음), `renderStaffAdmins`(Task 12)

- [ ] **Step 1: 모드 덩이 바꾸기**

찾을 것(주석 넷 아래):
```js
const MINISTRY_ONLY = new URLSearchParams(location.search).get("only") === "ministry";
const PW_KEY = MINISTRY_ONLY ? "ministry-pw" : "admin-pw";
const STAFF_KEY = "ministry-staff";
function getStaff(){
  if(!MINISTRY_ONLY) return null;
  try { return JSON.parse(sessionStorage.getItem(STAFF_KEY) || "null"); } catch(_) { return null; }
}
if(MINISTRY_ONLY){
  document.title = "사역신청 관리";
  document.querySelector(".topbar h1").textContent = "🤝 사역신청 관리";
  document.getElementById("hub-link").hidden = true;
}
```
바꿀 것:
```js
// 설교·찬양 관리(admin-sermon.html → ?only=sermon · 2026-09-21)도 같은 길이다. 허브에서 넘어온 관리자는
// 관리자 암호 그대로(모든 카드), 담당자는 설교·찬양 암호 + 앱 로그인 정보.
const ONLY = (q => (q === "ministry" || q === "sermon") ? q : null)(new URLSearchParams(location.search).get("only"));
const MINISTRY_ONLY = ONLY === "ministry";
const SERMON_ONLY = ONLY === "sermon";
const STAFF_MODE = MINISTRY_ONLY || (SERMON_ONLY && !sessionStorage.getItem("admin-pw"));
const PW_KEY = MINISTRY_ONLY ? "ministry-pw" : STAFF_MODE ? "content-pw" : "admin-pw";
const STAFF_KEY = SERMON_ONLY ? "content-staff" : "ministry-staff";
const STAFF_CFG = SERMON_ONLY
  ? { title:"설교·찬양 관리", pw:"설교·찬양 암호", auth:"contentAuth", who:"설교·찬양 담당자" }
  : { title:"사역신청 관리", pw:"사역신청 암호", auth:"ministryAuth", who:"사역신청 담당자" };
function getStaff(){
  if(!STAFF_MODE) return null;
  try { return JSON.parse(sessionStorage.getItem(STAFF_KEY) || "null"); } catch(_) { return null; }
}
if(MINISTRY_ONLY){
  document.title = "사역신청 관리";
  document.querySelector(".topbar h1").textContent = "🤝 사역신청 관리";
  document.getElementById("hub-link").hidden = true;
}
if(SERMON_ONLY){
  document.title = "설교·찬양 관리";
  document.querySelector(".topbar h1").textContent = "⛪ 설교·찬양 관리";
  if(STAFF_MODE) document.getElementById("hub-link").hidden = true;
}
```

- [ ] **Step 2: `renderLogin` 첫 줄**

찾을 것: `  if(MINISTRY_ONLY) return renderMinistryLogin();`
바꿀 것: `  if(STAFF_MODE) return renderMinistryLogin();   // 사역신청 · 설교·찬양 담당자 — 문구는 STAFF_CFG`

- [ ] **Step 3: `renderMinistryLogin` 의 문구를 `STAFF_CFG` 로** — 함수 안에서 아래 다섯 자리만 바꾼다

| 찾을 것 | 바꿀 것 |
|---|---|
| `<h2>🔒 사역신청 관리</h2>`(두 곳) | `<h2>🔒 ${STAFF_CFG.title}</h2>` |
| `placeholder="사역신청 암호"` | `placeholder="${STAFF_CFG.pw}"` |
| `err.textContent="사역신청 암호를 입력하세요.";` | ``err.textContent=`${STAFF_CFG.pw}를 입력하세요.`;`` |
| `callApi({ action:"ministryAuth", pw, staff })` | `callApi({ action:STAFF_CFG.auth, pw, staff })` |
| `이 사역신청 담당자로 등록되어 있지 않습니다.` | `이 ${STAFF_CFG.who}로 등록되어 있지 않습니다.` |

그리고 `if(d.ok){` 바로 아래 첫 줄에 넣는다:
```js
      // 설교·찬양 관리에 관리자 암호를 넣었으면 관리자로 연다 — 담당자 칸이 아니라 admin-pw 에
      if(SERMON_ONLY && d.role==="admin"){ sessionStorage.setItem("admin-pw", pw); location.reload(); return; }
```

- [ ] **Step 4: `minAuthLost`**

찾을 것: `  if(!MINISTRY_ONLY || !d || d.error!=="unauthorized") return false;`
바꿀 것: `  if(!STAFF_MODE || !d || d.error!=="unauthorized") return false;`

- [ ] **Step 5: `renderMenu` — 설교 모드로 가지를 치고, 두 카드를 옮긴다**

찾을 것: `  if(MINISTRY_ONLY) return renderMinistryMenu();`
바꿀 것:
```js
  if(MINISTRY_ONLY) return renderMinistryMenu();
  if(SERMON_ONLY) return renderSermonMenu();
```
`renderMenu` 안에서 `<div class="rep-card" id="rep-medlib">` 카드 덩이(닫는 `</div>` 셋까지)를 **지우고**, `<div class="rep-card" id="rep-content">` 카드 덩이를 아래로 **바꾼다**:
```html
      <div class="rep-card" id="rep-sermonhub">
        <div class="ic">⛪</div>
        <div class="rep-text">
          <div class="ti">설교·찬양 관리 →</div>
          <div class="de">설교/말씀 등록 · 설교 내용 등록 · 매일 묵상 조회 · 찬양 (2026-09 이리로 옮겼어요)</div>
        </div>
        <div class="rep-arrow">›</div>
      </div>
```
아래쪽 연결 줄에서 두 줄을 지우고 한 줄을 넣는다:
```js
  document.getElementById("rep-sermonhub").addEventListener("click", ()=>{ location.href="admin-stats.html?only=sermon"; });
```
(지울 것: `document.getElementById("rep-medlib")…renderMedLibrary);` · `document.getElementById("rep-content")…renderContent);`)

- [ ] **Step 6: `renderSermonMenu` 를 `renderMinistryMenu` 함수 바로 뒤에**

```js
// ---------- 설교·찬양 관리 메뉴 (2026-09-21) ----------
// ⚠️ 막는 것은 서버다 — 설교·찬양 암호는 contentError 를 거치는 액션만 통과한다. 메뉴를 줄이는 것은 편의.
function renderSermonMenu(){
  window.scrollTo(0, 0);
  logoutBtn.hidden = false;
  const st = getStaff();
  const card = (id, ic, ti, de) => `<div class="rep-card" id="${id}"><div class="ic">${ic}</div>
      <div class="rep-text"><div class="ti">${ti}</div><div class="de">${de}</div></div><div class="rep-arrow">›</div></div>`;
  app.innerHTML = `
    <div class="section-title">${st && st.name ? htmlEsc(st.name)+" 담당자님 — " : ""}설교 올리기 (두 단계)</div>
    <div class="card-grid">
      ${card("rep-content", "①", "설교/말씀 등록", "이번 주 암송구절과 설교 영상 링크 — 먼저 이것부터")}
      ${card("rep-sermonup", "②", "설교 내용 등록", "자막을 붙여넣으면 AI 노트 · 3분 음성 · 챗봇까지")}
    </div>
    <div class="section-title">살펴보기 · 고치기</div>
    <div class="card-grid">
      ${card("rep-sermonlist", "📜", "설교 목록", "제목·예배일·구분·설교자 고치기 · 숨김 · 점검")}
      ${card("rep-medlib", "🌿", "매일 묵상 조회", "주차별 7일 묵상 내용(주제·메시지·질문)")}
      ${STAFF_MODE ? "" : card("rep-praise", "🎵", "찬양 아카이브 관리", "곡 등록 · 콤보순서 · 조회수 · 사용현황")}
      ${STAFF_MODE ? "" : card("rep-contentadmins", "🔑", "설교·찬양 담당자", "이 화면에 들어올 분 등록 · 빼기")}
    </div>`;
  document.getElementById("rep-content").addEventListener("click", renderContent);
  document.getElementById("rep-sermonup").addEventListener("click", renderSermonUpload);
  document.getElementById("rep-sermonlist").addEventListener("click", renderSermonList);
  document.getElementById("rep-medlib").addEventListener("click", renderMedLibrary);
  const pr = document.getElementById("rep-praise");
  if(pr) pr.addEventListener("click", ()=>{ location.href="admin-praise.html"; });
  const ca = document.getElementById("rep-contentadmins");
  if(ca) ca.addEventListener("click", ()=>renderStaffAdmins("content"));
  // 새로고침으로 들어왔어도 한 번 되짚는다 — 그사이 빠진 분이 메뉴를 계속 보지 않게
  if(STAFF_MODE) callApi({ action:"contentAuth", pw:getPw(), staff:getStaff() }).then(minAuthLost).catch(()=>{});
}
```
(찬양 카드를 담당자에게 여는 것은 Phase B Task 14 — 그때 `STAFF_MODE ? "" :` 를 뗀다.)

- [ ] **Step 7: `admin-sermon.html` 을 넘기는 주소로** (통째로 바꾼다)

```html
<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>설교·찬양 관리</title>
<!-- 설교·찬양 담당자께 드리는 주소(2026-09-21). 관리자 통계 화면을 「설교·찬양만」 방식으로 연다.
     예전 이 파일의 설교 목록·점검은 그 화면의 「📜 설교 목록」으로 옮겼다(두 벌로 두면 어긋난다).
     ⚠️ 막는 것은 서버다 — 설교·찬양 암호는 그 액션만 통과하고, 액션마다 등록된 담당자인지 본다. -->
<script>location.replace("admin-stats.html?only=sermon");</script>
<noscript><meta http-equiv="refresh" content="0;url=admin-stats.html?only=sermon"></noscript>
</head>
<body>
<p><a href="admin-stats.html?only=sermon">설교·찬양 관리로 가기</a></p>
</body>
</html>
```

- [ ] **Step 8: 허브 한 줄** — `admin.html` 의 `TOOLS` 에서

찾을 것: `    { ic:"📜", title:"말씀 아카이브 관리", desc:"설교 제목 · 예배일 · 구분 · 숨김 · 삭제", href:"admin-sermon.html" },`
바꿀 것: `    { ic:"⛪", title:"설교·찬양 관리", desc:"설교 올리기(두 단계) · 설교 목록 · 매일 묵상 · 담당자 — 담당자도 이 주소로", href:"admin-sermon.html" },`

- [ ] **Step 9: 문법** — 인라인 스크립트를 떼어 `node --check`

Run:
```bash
python - <<'EOF'
import re,subprocess,io
h=io.open("admin-stats.html",encoding="utf-8").read()
s=[m for m in re.findall(r"<script>([\s\S]*?)</script>",h) if len(m)>1000]
io.open("/tmp/as.js","w",encoding="utf-8").write("\n".join(s))
print(subprocess.run(["node","--check","/tmp/as.js"],capture_output=True,text=True).stderr or "문법 통과")
EOF
```
Expected: `문법 통과` — 아직 없는 함수(`renderSermonUpload` 등)는 문법 오류가 아니다(Task 9~12 에서 생긴다).

- [ ] **Step 10: 커밋** (화면은 Task 9~12 까지 가야 다 선다 — 가지라 괜찮다)

```bash
git commit -m "feat(관리자): 설교·찬양 관리 모드(?only=sermon) — 담당자 로그인 · 두 단계 메뉴 · 성경암송 메뉴에서 옮김

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" -- admin-stats.html admin-sermon.html admin.html
```

---

### Task 8: 화면 — 도우미 덩이와 시험 · 날짜 버그

**Files:**
- Modify: `admin-stats.html` — `function isoDateInput` 을 도우미 덩이로 바꾼다
- Create: `tests/sermon-text.test.cjs`

**Interfaces:**
- Produces: `stVideoId(u)→string` · `stCleanTranscript(t)→string` · `stCleanTitle(t)→string` · `stKstDate(d)→"YYYY-MM-DD"|""` · `stLastSundayKst(now:Date)→"YYYY-MM-DD"` · `stAddDays(ymd,n)→"YYYY-MM-DD"` · `stKorCount(n)→"2.3만 자"` · `isoDateInput(d)`(이제 한국 날짜)

- [ ] **Step 1: 시험부터** — `tests/sermon-text.test.cjs`

```js
// node --test tests/sermon-text.test.cjs — 준비물 없이(node 만). admin-stats.html 의 sermon-text 덩이를 떼어 돌린다.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'..','admin-stats.html'),'utf8');
const m=html.match(/\/\/ ==== sermon-text[\s\S]*?\/\/ ==== \/sermon-text ====/);
assert.ok(m,'admin-stats.html 에서 sermon-text 덩이를 못 찾았다');
const ctx={}; vm.createContext(ctx); vm.runInContext(m[0],ctx);

test('영상 번호 — 여러 꼴 (job-lib.test.mjs 와 같은 표본)',()=>{
  for(const u of ['https://www.youtube.com/watch?v=9YgDMXP77NE','https://youtu.be/9YgDMXP77NE?si=abc',
    'https://www.youtube.com/live/9YgDMXP77NE','https://youtube.com/shorts/9YgDMXP77NE',
    'https://www.youtube.com/watch?feature=share&v=9YgDMXP77NE','9YgDMXP77NE']) assert.equal(ctx.stVideoId(u),'9YgDMXP77NE',u);
  assert.equal(ctx.stVideoId(''),'');
  assert.equal(ctx.stVideoId('https://example.com/watch?v=short'),'');
});

test('자막 — 시각이 제 줄에 있는 꼴',()=>{
  assert.equal(ctx.stCleanTranscript('0:03\n오늘 말씀은\n0:07\n요한복음 3:16절\n1:02:15\n아멘'),'오늘 말씀은 요한복음 3:16절 아멘');
});
test('자막 — 시각이 줄 앞에 붙은 꼴 · 빈 줄 · 윈도 줄바꿈',()=>{
  assert.equal(ctx.stCleanTranscript('0:03 오늘 말씀은\r\n\r\n12:07  사랑입니다\r\n'),'오늘 말씀은 사랑입니다');
});
test('자막 — 본문 속 장절(3:16)은 지우지 않는다',()=>{
  assert.equal(ctx.stCleanTranscript('3:16절 말씀을 봅니다'),'3:16절 말씀을 봅니다');
});
test('자막 — 자모 분리(NFD)는 완성형으로',()=>{
  assert.equal(ctx.stCleanTranscript('하나님'.normalize('NFD')),'하나님');
});

test('제목 — 교회 머리표·목사님 꼬리표·날짜를 뗀다(add-video.mjs cleanTitle + 5-migrate 날짜)',()=>{
  assert.equal(ctx.stCleanTitle('[고척교회] 하나님은 공장장이 아니라 아버지입니다 ㅣ 차동혁 위임목사'),'하나님은 공장장이 아니라 아버지입니다');
  assert.equal(ctx.stCleanTitle('2026.09.20 주일예배 | 홍길동 목사'),'주일예배');
  assert.equal(ctx.stCleanTitle(''),'');
});

test('한국 날짜 — 9/19 0시(한국)가 9/18 로 보이던 버그',()=>{
  assert.equal(ctx.stKstDate('2026-09-18T15:00:00+00:00'),'2026-09-19');
  assert.equal(ctx.isoDateInput('2026-09-18T15:00:00+00:00'),'2026-09-19');
  // 열고 저장을 되풀이해도 날짜가 그대로다(화면은 칸 값 + "T00:00:00+09:00" 로 저장한다)
  let d='2026-09-18T15:00:00+00:00';
  for(let i=0;i<3;i++) d=ctx.isoDateInput(d)+'T00:00:00+09:00';
  assert.equal(ctx.isoDateInput(d),'2026-09-19');
  assert.equal(ctx.stKstDate(''),'');
  assert.equal(ctx.stKstDate('엉뚱'),'');
});

test('지난 주일(한국)',()=>{
  assert.equal(ctx.stLastSundayKst(new Date('2026-09-20T01:00:00Z')),'2026-09-20');   // 주일 오전 10시
  assert.equal(ctx.stLastSundayKst(new Date('2026-09-21T03:00:00Z')),'2026-09-20');   // 월요일
  assert.equal(ctx.stLastSundayKst(new Date('2026-09-19T16:00:00Z')),'2026-09-20');   // UTC 토요일 = 한국 주일 새벽 1시
  assert.equal(ctx.stLastSundayKst(new Date('2026-09-26T14:00:00Z')),'2026-09-20');   // 한국 토요일 밤 11시
});
test('날짜 더하기 · 글자 수',()=>{
  assert.equal(ctx.stAddDays('2026-09-19',7),'2026-09-26');
  assert.equal(ctx.stAddDays('2026-12-28',7),'2027-01-04');
  assert.equal(ctx.stAddDays('',7),'');
  assert.equal(ctx.stKorCount(23916),'2.4만 자');
  assert.equal(ctx.stKorCount(4800),'4,800자');
});
```

- [ ] **Step 2: 돌려서 실패를 본다**

Run: `node --test tests/sermon-text.test.cjs`
Expected: FAIL — `admin-stats.html 에서 sermon-text 덩이를 못 찾았다`

- [ ] **Step 3: `isoDateInput` 함수를 덩이로 바꾼다**

찾을 것:
```js
function isoDateInput(d){ // 'YYYY-MM-DDTHH:mm' → date input용 'YYYY-MM-DD'
  if(!d) return ""; const x=new Date(d); if(isNaN(x)) return "";
  return x.toISOString().slice(0,10);
}
```
바꿀 것:
```js
// ==== sermon-text — tests/sermon-text.test.cjs 가 이 덩이를 그대로 떼어 시험한다(덩이 밖을 부르지 말 것) ====
// 영상 번호 — ⚠️ 같은 규칙이 세 곳: 여기 · api 함수 ytIdOf · gocheok-sermons scripts/job-lib.mjs vidOf
function stVideoId(u){
  const s=String(u==null?"":u).trim();
  if(/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  const m=s.match(/(?:[?&]v=|youtu\.be\/|\/live\/|\/shorts\/|\/embed\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : "";
}
// 유튜브 「스크립트 표시」에서 복사한 글 → 자막 본문. 줄 앞 시각(0:03 · 1:02:15)과 빈 줄을 지운다.
// ⚠️ 시각 뒤에 빈칸이 있을 때만 — 「3:16절」 같은 본문 속 장절을 지우지 않게
function stCleanTranscript(t){
  return String(t==null?"":t).normalize("NFC").split(/\r?\n/)
    .map(l=>l.replace(/^\s*\d{1,2}:\d{2}(?::\d{2})?(?=\s|$)\s*/,""))
    .filter(l=>l.trim())
    .join(" ").replace(/\s+/g," ").trim();
}
// 유튜브 제목 → 설교 제목 — gocheok-sermons add-video.mjs cleanTitle + 5-migrate 의 날짜 떼기와 같은 규칙
function stCleanTitle(t){
  return String(t==null?"":t).normalize("NFC")
    .replace(/^\[고척교회\]\s*/,"")
    .replace(/\s*[lIㅣ|]+\s*[차치]동혁\s*(위임|담임)?\s*목사(님)?\s*$/,"")
    .replace(/[ㅣ|].*$/,"")
    .replace(/^\d{4}\.\d{2}\.\d{2}\s+/,"")
    .trim();
}
// DB 의 시각(UTC) → 한국 날짜. ⚠️ 예전 isoDateInput 은 UTC 로 읽어 한국 0시 구절이 하루 전으로 보였고,
//    화면이 그 값 + "T00:00:00+09:00" 으로 저장해 **열고 저장할 때마다 하루씩 당겨졌다**(2026-09-21 발견).
function stKstDate(d){
  if(!d) return ""; const x=new Date(d); if(isNaN(x)) return "";
  return new Date(x.getTime()+9*3600*1000).toISOString().slice(0,10);
}
function stLastSundayKst(now){
  const k=new Date(now.getTime()+9*3600*1000);   // 한국 시각을 UTC 칸에 얹어 읽는다
  k.setUTCDate(k.getUTCDate()-k.getUTCDay());     // 일=0 → 그대로, 월=1 → 하루 전 …
  return k.toISOString().slice(0,10);
}
function stAddDays(ymd,n){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(ymd||"")) return "";
  const d=new Date(ymd+"T00:00:00Z"); d.setUTCDate(d.getUTCDate()+n);
  return d.toISOString().slice(0,10);
}
function stKorCount(n){ return n>=10000 ? (n/10000).toFixed(1)+"만 자" : n.toLocaleString("en-US")+"자"; }
function isoDateInput(d){ return stKstDate(d); }   // date 칸용 — 한국 날짜
// ==== /sermon-text ====
```

- [ ] **Step 4: 시험 통과**

Run: `node --test tests/sermon-text.test.cjs`
Expected: `# pass 10` `# fail 0`

- [ ] **Step 5: 커밋**

```bash
git add -- tests/sermon-text.test.cjs && git commit -m "fix(관리자): 설교/말씀 관리 날짜가 열고 저장할 때마다 하루씩 당겨지던 것 · 설교 올리기 도우미 덩이와 시험

isoDateInput 이 UTC 로 읽어 한국 0시(38번 9/19 토)가 칸에 9/18 로 보였고, 화면이 그 값에
+09:00 을 붙여 저장해 하루 당겨졌다. 34~36번이 금요일인 까닭으로 보인다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" -- admin-stats.html tests/sermon-text.test.cjs
```

---

### Task 9: 화면 — 📜 설교 목록 (옛 admin-sermon.html)

**Files:**
- Modify: `admin-stats.html` — `</style>` 바로 앞에 CSS 덩이 · `renderSermonMenu` 뒤에 새 함수들

**Interfaces:**
- Consumes: `sermonStaffList`·`sermonStaffSave`·`sermonDelete`(Task 3), `STAFF_MODE`·`getPw`·`getStaff`·`minAuthLost`(Task 7), `mnDialog`·`mnNote`·`plEsc`·`htmlEsc`(있음)
- Produces: `SERMON_CATS`(화면 목록) · `SERMON_SITE` · `renderSermonList()` · CSS `.su-*`·`.sl-*`

- [ ] **Step 1: CSS** — 파일의 **마지막** `</style>` 바로 앞에

```css
/* ═══ 설교·찬양 관리 (2026-09-21) — 표준 v1 의 값만 쓴다 ═══ */
.su-step{display:flex;align-items:center;gap:8px;margin:18px 0 8px;font-weight:800;color:var(--navy);font-size:1rem;}
.su-step b{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;
  background:var(--navy);color:#fff;font-size:14px;flex:none;}
.su-video{display:flex;gap:12px;align-items:center;margin:8px 0;}
.su-video img{width:120px;height:68px;object-fit:cover;border-radius:8px;flex:none;}
.su-video .t{font-size:14px;line-height:1.45;}
.su-verse{margin:14px 0;padding:12px 14px;border-radius:12px;border:1px solid #dde3ee;background:#f7f9fd;font-size:14px;line-height:1.55;}
.su-verse:empty{display:none;}
.su-verse.warn{background:#fdf6e7;border-color:#e9d39c;}
.su-verse .push-btn{margin-top:8px;}
.su-verse label{display:flex;align-items:center;gap:8px;min-height:var(--tap);margin-top:6px;}
.su-warn{color:var(--error);font-weight:700;}
.su-prog{list-style:none;margin:10px 0 0;padding:0;}
.su-prog li{display:flex;align-items:center;gap:10px;min-height:36px;font-size:14px;color:#6b778c;}
.su-prog li::before{content:"○";width:22px;text-align:center;flex:none;}
.su-prog li.done{color:var(--green);} .su-prog li.done::before{content:"✓";font-weight:800;}
.su-prog li.now{color:var(--navy);font-weight:800;} .su-prog li.now::before{content:"▶";}
.su-prog li.bad{color:var(--error);font-weight:800;} .su-prog li.bad::before{content:"✕";}
.su-res{margin-top:12px;font-size:14px;line-height:1.6;}
.su-res .sum{margin:6px 0 10px;}
.sl-row{border:1px solid #dde3ee;border-radius:12px;background:#fff;padding:14px;margin-bottom:var(--gap);}
.sl-row.hid{opacity:.62;}
.sl-grid{display:grid;grid-template-columns:1fr;gap:4px 10px;}
@media (min-width:640px){.sl-grid{grid-template-columns:2fr 1fr 1fr 1fr;}}
.sl-meta{font-size:13px;color:#6b778c;margin:8px 0;word-break:break-all;}
.sl-acts{display:flex;gap:8px;flex-wrap:wrap;}
.sl-acts button{min-height:var(--tap);padding:0 16px;font-size:.95rem;border-radius:10px;font-family:inherit;font-weight:700;cursor:pointer;}
.sl-acts .save{background:var(--navy);color:#fff;border:0;min-height:var(--tap-lg);}
.sl-acts .ghost{background:#eef3fb;color:#1a3a6b;border:1px solid #a9c3e8;}
.sl-acts .del{background:#fdeceb;color:#a33;border:1px solid #e7b3ad;}
```

- [ ] **Step 2: 설교 목록 함수들** — `renderSermonMenu` 바로 뒤에

```js
// ⚠️ 같은 목록이 api 함수 SERMON_CATS 에도 있다 — 함께 고칠 것
const SERMON_CATS = ["주일설교","금요성령집회","새벽기도회","송구영신예배","특별집회","청년예배"];
const SERMON_SITE = "https://sermon.onlybible.kr/";

// ---------- 📜 설교 목록 — 옛 admin-sermon.html(2026-09-21 이리로 옮김) ----------
// 저장은 제목·예배일·구분·설교자·숨김 다섯 칸만(sermonStaffSave). 삭제는 관리자만(서버도 막는다).
let slAll = [];
async function renderSermonList(){
  window.scrollTo(0, 0);
  app.innerHTML = `
    <div class="rep-head mn-top"><button class="back-btn" id="back">← 메뉴</button><h2>📜 설교 목록</h2></div>
    <div class="adm-acts"><button class="push-btn ghost" id="sl-check">🩺 점검</button></div>
    <div class="push-card">
      <input id="sl-q" class="push-in" placeholder="제목·구분·설교자로 찾기">
      <div id="sl-count" class="push-hint"></div>
      <div id="sl-rows"><p class="msg">불러오는 중...</p></div>
    </div>`;
  document.getElementById("back").addEventListener("click", renderMenu);
  document.getElementById("sl-q").addEventListener("input", slRender);
  document.getElementById("sl-check").addEventListener("click", slCheck);
  const d = await callApi({ action:"sermonStaffList", pw:getPw(), staff:getStaff() }).catch(()=>({ok:false,error:"network"}));
  if(minAuthLost(d)) return;
  const box = document.getElementById("sl-rows"); if(!box) return;
  if(!d.ok){ box.innerHTML = `<p class="msg err">불러오지 못했습니다 (${htmlEsc(d.error||"")})</p>`; return; }
  slAll = d.sermons || [];
  slRender();
}
function slRender(){
  const box = document.getElementById("sl-rows"); if(!box) return;
  const q = (document.getElementById("sl-q").value || "").trim().toLowerCase();
  const list = slAll.filter(s => !q || [s.title, s.category, s.preacher].join(" ").toLowerCase().includes(q));
  document.getElementById("sl-count").textContent = `${list.length}편 / 전체 ${slAll.length}편`;
  // 목록에 없는 옛 구분도 그대로 보이게(고르면 그대로 저장된다)
  const cats = s => (SERMON_CATS.includes(s.category) ? SERMON_CATS : [s.category, ...SERMON_CATS]);
  box.innerHTML = list.map(s => `<div class="sl-row${s.hidden?" hid":""}" data-id="${htmlEsc(s.id)}">
      <div class="sl-grid">
        <div><label class="push-lb">제목</label><input class="push-in" data-f="title" value="${htmlEsc(s.title)}"></div>
        <div><label class="push-lb">예배일</label><input class="push-in" type="date" data-f="date" value="${htmlEsc(s.date)}"></div>
        <div><label class="push-lb">구분</label><select class="push-in" data-f="category">${cats(s).map(c=>`<option${c===s.category?" selected":""}>${htmlEsc(c)}</option>`).join("")}</select></div>
        <div><label class="push-lb">설교자</label><input class="push-in" data-f="preacher" value="${htmlEsc(s.preacher)}"></div>
      </div>
      <div class="sl-meta">${htmlEsc(s.id)} · 📖 ${htmlEsc(s.scripture||"")}${s.memRef?" · 암송 "+htmlEsc(s.memRef):""}${s.hidden?" · 숨김":""}</div>
      <div class="sl-acts">
        <button class="save" data-act="save">저장</button>
        <button class="ghost" data-act="hide">${s.hidden?"공개":"숨김"}</button>
        ${STAFF_MODE ? "" : `<button class="del" data-act="del">삭제</button>`}
      </div></div>`).join("") || `<p class="msg">찾는 설교가 없습니다.</p>`;
  box.querySelectorAll("[data-act]").forEach(b => b.addEventListener("click", () => slAct(b.closest(".sl-row").dataset.id, b.dataset.act, b)));
}
async function slAct(id, act, btn){
  const s = slAll.find(x => x.id === id); if(!s) return;
  if(act === "del"){
    if(!(await mnDialog({ icon:"🗑️", title:"설교 삭제", tone:"danger", ok:"삭제", cancel:"그만두기",
      html:`<b>${plEsc(s.title)}</b><br>이 설교를 아카이브에서 지울까요?`,
      note:"챗봇 색인도 함께 지워집니다. 되돌릴 수 없습니다.", noteTone:"off" }))) return;
    const d = await callApi({ action:"sermonDelete", pw:getPw(), id }).catch(()=>({ok:false,error:"network"}));
    if(!d.ok){ mnNote("삭제하지 못했습니다: "+(d.error||""), "warn"); return; }
    slAll = slAll.filter(x => x.id !== id); mnNote("삭제했습니다"); slRender(); return;
  }
  const row = btn.closest(".sl-row");
  const v = f => row.querySelector(`[data-f="${f}"]`).value.trim();
  const next = { id, title:v("title"), date:v("date"), category:v("category"), preacher:v("preacher"),
                 hidden: act === "hide" ? !s.hidden : s.hidden };
  if(!next.title){ mnNote("제목을 넣어 주세요", "warn"); return; }
  btn.disabled = true;
  const d = await callApi({ action:"sermonStaffSave", pw:getPw(), staff:getStaff(), sermon:next }).catch(()=>({ok:false,error:"network"}));
  btn.disabled = false;
  if(minAuthLost(d)) return;
  if(!d.ok){ mnNote("저장하지 못했습니다: "+(d.error||""), "warn"); return; }
  Object.assign(s, next);
  mnNote(act === "hide" ? (s.hidden ? "숨겼습니다" : "공개했습니다") : "저장했습니다");
  if(act === "hide") slRender();
}
function slTestAudio(url){
  return new Promise(res => {
    const a = new Audio(); let done = false;
    const fin = ok => { if(done) return; done = true; a.src = ""; res(ok); };
    a.onloadedmetadata = () => fin(true); a.onerror = () => fin(false);
    setTimeout(() => fin(false), 8000); a.src = url;
  });
}
async function slCheck(){
  const btn = document.getElementById("sl-check"); btn.disabled = true; btn.textContent = "점검 중…";
  const res = await Promise.all(slAll.map(async s => {
    const errs = [];
    if(!s.hasNote) errs.push("노트");
    if(!s.hasScript) errs.push("대본");
    if(!s.audio) errs.push("오디오 없음");
    else if(!(await slTestAudio(SERMON_SITE + s.audio))) errs.push("오디오 재생 안 됨");
    return { s, errs };
  }));
  btn.disabled = false; btn.textContent = "🩺 점검";
  const bad = res.filter(r => r.errs.length), linked = slAll.filter(s => s.memVerseNo).length;
  mnDialog({ icon:"🩺", title:"점검 결과", ok:"닫기", cancel:null,
    html:`총 <b>${slAll.length}</b>편 · 정상 <b>${slAll.length-bad.length}</b> · 문제 <b>${bad.length}</b> · 📖 암송 연결 <b>${linked}</b>`
      + (bad.length
        ? `<div style="text-align:left;margin-top:10px;max-height:40vh;overflow:auto;font-size:14px">${bad.map(r=>`<div>• <b>${plEsc(r.s.title)}</b> ${plEsc(r.s.date)} — ${r.errs.map(plEsc).join(", ")}</div>`).join("")}</div>`
        : `<div style="margin-top:8px">✅ 모든 설교가 정상이에요</div>`) });
}
```

- [ ] **Step 3: 문법** — Task 7 Step 9 의 명령

Expected: `문법 통과`

- [ ] **Step 4: 커밋**

```bash
git commit -m "feat(관리자): 설교·찬양 관리 — 📜 설교 목록(설교자 칸 · 다섯 칸만 저장 · 삭제는 관리자만)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" -- admin-stats.html
```

---

### Task 10: 화면 — ① 설교/말씀 등록(기존 화면)의 담당자 모드

**Files:**
- Modify: `admin-stats.html` — `renderContent` · `loadContentList`

**Interfaces:**
- Consumes: `staffVerseSave`(Task 3), `stAddDays`·`isoDateInput`(Task 8), `STAFF_MODE`·`SERMON_ONLY`(Task 7)
- Produces: 전역 `cmPrefillUrl`(② 가 「① 로 가기」 때 넣는다) · `cmAfterSave(no, url)` · ① 저장 뒤 「② 설교 내용 등록으로 →」 단추(`suPrefill` 을 채우고 `renderSermonUpload()`)

- [ ] **Step 1: `renderContent` 제목 줄**

찾을 것:
```js
    <div class="rep-head">
      <button class="back-btn" id="back">← 메뉴</button>
      <h2>📖 설교/말씀 관리</h2>
    </div>
    <div id="cms-body"><div class="msg">불러오는 중...</div></div>`;
```
바꿀 것:
```js
    <div class="rep-head mn-top">
      <button class="back-btn" id="back">← 메뉴</button>
      <h2>${SERMON_ONLY ? "① 설교/말씀 등록" : "📖 설교/말씀 관리"}</h2>
    </div>
    ${SERMON_ONLY ? `<p class="push-hint" style="margin:0 0 10px">이번 주 암송구절을 고르고 <b>설교 영상 링크</b>를 넣어 저장한 뒤 ② 로 가세요. 링크를 먼저 넣어야 설교와 구절이 이어집니다.</p>` : ""}
    <div id="cms-body"><div class="msg">불러오는 중...</div></div>`;
```

- [ ] **Step 2: 영어 칸·초기 적재를 담당자에게서 숨긴다** — `loadContentList` 의 HTML 안

(가) 찾을 것: `      ${list.length? "" : `<p class="push-hint">아직 DB에 말씀이 없어요.`
바꿀 것: `      ${list.length || STAFF_MODE ? "" : `<p class="push-hint">아직 DB에 말씀이 없어요.`

(나) 영어 넷(`영어 출처(NIV, 선택)` label·input · `영어 본문(NIV, 선택)` label·textarea · `🤖 NIV 생성 (AI)` 단추 · 그 아래 `push-hint`)을 한 덩이로 감싼다:
```js
      <div id="c-niv"${STAFF_MODE ? " hidden" : ""}>
      <label class="push-lb">영어 출처(NIV, 선택)</label><input id="c-refen" class="push-in" placeholder="예: 1 Timothy 1:11">
      <label class="push-lb">영어 본문(NIV, 선택)</label><textarea id="c-texten" class="push-in" rows="3"></textarea>
      <button class="push-fill" id="c-gen-niv">🤖 NIV 생성 (AI)</button>
      <p class="push-hint">AI가 만든 본문은 실제 NIV와 다를 수 있어요. 성경과 대조·검수 후 저장하세요. 영어 본문이 있는 구절만 앱에서 한/영 전환이 나타납니다.</p>
      </div>
```

- [ ] **Step 3: 「+ 새 말씀 추가」의 기본값** — `fill(v)` 의 첫 두 줄

찾을 것:
```js
    document.getElementById("c-no").value=v?v.no:"";
    document.getElementById("c-date").value=v?isoDateInput(v.date):"";
```
바꿀 것:
```js
    // 새 구절이면 번호는 가장 큰 번호 + 1, 날짜는 가장 최근 구절 + 7일(지금 쓰는 규칙을 따라간다)
    document.getElementById("c-no").value=v?v.no:(cmMaxNo?cmMaxNo+1:"");
    document.getElementById("c-date").value=v?isoDateInput(v.date):(cmLatest&&cmLatest.date?stAddDays(isoDateInput(cmLatest.date),7):"");
```
그리고 `const opts=` 줄 **바로 위**에:
```js
  const cmSorted=[...list].sort((a,b)=>Number(b.no)-Number(a.no));
  const cmLatest=cmSorted[0]||null, cmMaxNo=cmLatest?Number(cmLatest.no):0;
```
(`const opts=` 줄의 `[...list].sort((a,b)=>Number(b.no)-Number(a.no))` 는 `cmSorted` 로 바꿔 둔다 — 같은 값)

- [ ] **Step 4: 저장 — 담당자는 `staffVerseSave`, 뒤에 ② 로 가는 단추**

`c-save` 처리기 안에서 두 검사 줄(`if(!verse.no||…)` · `if(verse.textEn&&!verse.refEn)…`) **바로 아래**에:
```js
    if(STAFF_MODE) return cmStaffSave(verse);
```
같은 처리기 끝의
```js
    r.className="msg"; r.textContent="✅ 저장되었습니다.";
    loadContentList(verse.no);
```
를
```js
    cmAfterSave(verse.no, verse.url);
```
로 바꾼다.

`loadContentList` 함수 **뒤**에 더한다:
```js
// ② 설교 내용 등록이 「① 로 가기」 때 넣는 링크 — 가장 최근 구절에 미리 채워 둔다
let cmPrefillUrl = "";
const CM_ERR = { "no-required":"순번을 넣어 주세요.", required:"출처(짧게)·말씀 본문은 꼭 넣어 주세요.",
                 "bad-url":"설교 영상 링크를 알아보지 못했어요 — 유튜브 주소를 넣어 주세요." };
async function cmStaffSave(verse){
  const r=document.getElementById("c-result"), btn=document.getElementById("c-save");
  if(!(await mnDialog({ icon:"💾", title:"저장할까요?", ok:"저장", cancel:"그만두기",
    html:`<b>${plEsc(verse.no)}번 ${plEsc(verse.refShort)}</b>`,
    note:"저장하면 앱 전체(이번 주 말씀·알림)에 바로 반영돼요." }))) return;
  btn.disabled=true; r.className="msg"; r.textContent="저장 중...";
  const d=await callApi({ action:"staffVerseSave", pw:getPw(), staff:getStaff(), verse }).catch(()=>({ok:false,error:"network"}));
  btn.disabled=false;
  if(minAuthLost(d)) return;
  if(!d.ok){ r.className="msg err"; r.textContent="저장 실패: "+(CM_ERR[d.error]||d.error||"오류"); return; }
  cmAfterSave(verse.no, d.url);
}
async function cmAfterSave(no, url){
  await loadContentList(no);
  const r=document.getElementById("c-result"); if(!r) return;
  r.className="msg"; r.textContent="✅ 저장되었습니다.";
  if(SERMON_ONLY && url){
    const b=document.createElement("button");
    b.className="push-send"; b.textContent="② 설교 내용 등록으로 →";
    b.addEventListener("click", ()=>{ suPrefill=url; renderSermonUpload(); });
    r.after(b);
  }
}
```
`loadContentList` 의 **마지막 줄**(`c-save` 처리기를 붙인 뒤, 함수를 닫기 전)에:
```js
  if(cmPrefillUrl){
    const u=cmPrefillUrl; cmPrefillUrl="";
    if(cmLatest){ sel.value=String(cmLatest.no); fill(cmLatest); }
    const cu=document.getElementById("c-url"), res=document.getElementById("c-result");
    res.className="msg";
    if(!cu.value.trim()){ cu.value=u; res.textContent=`가장 최근 구절(${cmLatest?cmLatest.no+"번":"새 구절"})에 설교 링크를 넣어 두었어요. 맞는지 보고 저장해 주세요.`; }
    else if(stVideoId(cu.value)!==stVideoId(u)) res.textContent="가장 최근 구절에 이미 다른 링크가 있어요. 링크를 넣을 구절을 골라 주세요.";
  }
```

- [ ] **Step 5: 문법** — Task 7 Step 9 의 명령. Expected: `문법 통과`

- [ ] **Step 6: 커밋**

```bash
git commit -m "feat(관리자): ① 설교/말씀 등록 — 담당자는 한글 칸만 저장 · 새 구절 번호·날짜 채움 · 저장 뒤 ② 로

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" -- admin-stats.html
```

---

### Task 11: 화면 — ② 설교 내용 등록

**Files:**
- Modify: `admin-stats.html` — Task 9 의 함수들 뒤에

**Interfaces:**
- Consumes: `sermonStaffList`·`sermonJobCreate`·`sermonJobs`·`sermonJobRetry`(Task 3) · `stVideoId`·`stCleanTranscript`·`stCleanTitle`·`stLastSundayKst`·`stKorCount`(Task 8) · `SERMON_CATS`(Task 9) · `cmPrefillUrl`(Task 10) · `SERMON_FN`·`SERMON_ANON`·`mdBold`(있음)
- Produces: `renderSermonUpload()` · 전역 `suPrefill`

- [ ] **Step 1: 함수들을 더한다**

```js
// ---------- ② 설교 내용 등록 (2026-09-21) ----------
// 설계: docs/superpowers/specs/2026-09-21-sermon-staff-upload-design.md 3·4장
// ⚠️ 유튜브에 가지 않는다 — 자막은 담당자가 붙인 것, 제목·날짜·구분·설교자는 이 화면의 값
//    (유튜브가 GitHub 서버에서 자막을 막아 옛 「링크로 추가」가 2026-08 부터 실패했다).
const SU_STEPS = [["prep","자막 준비"],["notes","AI 노트"],["tts","3분 음성"],["link","암송 연결"],["versehelp","암송 도우미"],
                  ["save","저장"],["embed","챗봇 색인"],["publish","사이트 배포"],["verify","확인"]];
const SU_ERR = {
  exists:"이미 올라와 있는 설교예요 — 「📜 설교 목록」에서 확인해 주세요.",
  busy:"다른 설교가 올라가는 중이에요. 끝난 뒤 다시 눌러 주세요.",
  "short-transcript":"자막이 너무 짧아요 — 스크립트를 끝까지 복사했는지 봐 주세요.",
  "long-transcript":"자막이 너무 길어요 — 다른 글이 섞였는지 봐 주세요.",
  "bad-video":"영상 링크를 알아보지 못했어요.", "bad-date":"예배일을 넣어 주세요.", "bad-category":"구분을 골라 주세요.",
  "no-title":"제목을 넣어 주세요.", "no-preacher":"설교자를 넣어 주세요.",
  dispatch:"작업을 시작하지 못했어요 — 친구에게 알려 주세요.", "not-failed":"멈춘 작업만 다시 시도할 수 있어요.",
};
let suPrefill = "";          // ① 에서 넘겨준 링크
let suState = null;          // { id, verse, noVerse, transcript, autoTitle }
let suTimer = null;
let suBusy = false;
let suSermonIds = new Set();

async function renderSermonUpload(){
  window.scrollTo(0, 0);
  clearInterval(suTimer);
  suState = { id:"", verse:null, noVerse:false, transcript:"", autoTitle:"" };
  const pre = suPrefill; suPrefill = "";
  app.innerHTML = `
    <div class="rep-head mn-top"><button class="back-btn" id="back">← 메뉴</button><h2>② 설교 내용 등록</h2></div>
    <div id="su-job"></div>
    <div class="push-card" id="su-form">
      <div class="su-step"><b>1</b> 설교 영상 링크</div>
      <input id="su-url" class="push-in" placeholder="https://www.youtube.com/watch?v=..." value="${htmlEsc(pre)}">
      <div id="su-video" class="su-video"></div>
      <div class="su-step"><b>2</b> 자막 붙여넣기</div>
      <details class="mc-guide" open><summary>📌 자막 복사하는 법 (PC)</summary><div class="ma-help">
        ① 유튜브에서 설교 영상을 열고, 영상 아래 설명란의 <b>「…더보기」</b>를 누른 뒤 <b>「스크립트 표시」</b>를 누릅니다.<br>
        ② 오른쪽에 뜬 스크립트의 <b>첫 줄</b>을 한 번 누르고, 맨 아래까지 내려 <b>Shift 를 누른 채 마지막 줄</b>을 누릅니다.<br>
        ③ <b>Ctrl+C</b> 로 복사한 뒤, 아래 칸을 누르고 <b>Ctrl+V</b> 로 붙여넣습니다. 시각(0:03 같은 것)은 저절로 지워집니다.
      </div></details>
      <textarea id="su-text" class="push-in" rows="6" placeholder="여기에 자막을 붙여넣어 주세요"></textarea>
      <div id="su-count" class="push-hint"></div>
      <div class="su-step"><b>3</b> 정보 확인</div>
      <label class="push-lb">제목</label><input id="su-title" class="push-in">
      <label class="push-lb">예배일</label><input id="su-date" class="push-in" type="date" value="${stLastSundayKst(new Date())}">
      <label class="push-lb">구분</label><select id="su-cat" class="push-in">${SERMON_CATS.map(c=>`<option>${c}</option>`).join("")}</select>
      <label class="push-lb">설교자</label><input id="su-preacher" class="push-in" value="차동혁 위임목사">
      <p class="push-hint">초청 설교자가 오신 주에는 설교자를 바꿔 주세요.</p>
      <div id="su-verse" class="su-verse"></div>
      <button class="push-send" id="su-go" disabled>🚀 올리기</button>
      <p class="push-hint" id="su-why"></p>
    </div>`;
  document.getElementById("back").addEventListener("click", ()=>{ clearInterval(suTimer); renderMenu(); });
  let t = null;
  document.getElementById("su-url").addEventListener("input", ()=>{ clearTimeout(t); t = setTimeout(suLoadVideo, 400); });
  document.getElementById("su-text").addEventListener("input", suOnText);
  ["su-title","su-date","su-cat","su-preacher"].forEach(id => document.getElementById(id).addEventListener("input", suCheck));
  document.getElementById("su-go").addEventListener("click", suGo);
  suCheck();
  const d = await callApi({ action:"sermonStaffList", pw:getPw(), staff:getStaff() }).catch(()=>({ok:false,error:"network"}));
  if(minAuthLost(d)) return;
  if(!d.ok){ const j=document.getElementById("su-job"); if(j) j.innerHTML=`<p class="msg err">불러오지 못했습니다 (${htmlEsc(d.error||"")})</p>`; return; }
  suSermonIds = new Set((d.sermons||[]).map(s => s.id));
  // 가장 최근 작업: 진행 중이면 그것부터, 끝났으면 하루 안의 것만 보인다
  const last = (d.jobs||[])[0];
  if(last && (last.status==="queued" || last.status==="running" || Date.now()-new Date(last.updatedAt).getTime() < 24*3600*1000)) suShowJob(last);
  if(pre) suLoadVideo();
}

async function suLoadVideo(){
  const box = document.getElementById("su-video"); if(!box) return;
  const raw = document.getElementById("su-url").value;
  const id = stVideoId(raw);
  suState.id = ""; suState.verse = null;
  const vbox = document.getElementById("su-verse"); vbox.className = "su-verse"; vbox.innerHTML = "";
  if(!id){ box.innerHTML = raw.trim() ? `<p class="msg err">유튜브 영상 링크를 알아보지 못했어요.</p>` : ""; suCheck(); return; }
  if(suSermonIds.has(id)){ box.innerHTML = `<p class="msg err">${SU_ERR.exists}</p>`; suCheck(); return; }
  box.innerHTML = `<p class="msg">영상을 확인하는 중...</p>`;
  let title = "", thumb = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  try{   // oEmbed 는 이 도메인에 CORS 를 열어 준다(2026-09-21 확인)
    const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent("https://www.youtube.com/watch?v="+id)}`);
    if(r.ok){ const j = await r.json(); title = j.title || ""; thumb = j.thumbnail_url || thumb; }
  }catch(_){}
  if(stVideoId(document.getElementById("su-url")?.value) !== id) return;   // 그사이 링크가 바뀌었다
  suState.id = id;
  box.innerHTML = `<img src="${htmlEsc(thumb)}" alt=""><div class="t">${title ? `<b>${htmlEsc(title)}</b><br>` : ""}<span class="push-hint">이 영상이 맞나요? (${htmlEsc(id)})</span></div>`;
  const tIn = document.getElementById("su-title"), clean = stCleanTitle(title);
  if(clean && (!tIn.value.trim() || tIn.value === suState.autoTitle)){ tIn.value = clean; suState.autoTitle = clean; }
  await suLoadVerse(id);
  suCheck();
}

async function suLoadVerse(id){
  const box = document.getElementById("su-verse"); if(!box) return;
  const d = await callApi({ action:"getVerses" }).catch(()=>({ok:false}));
  const v = (d.verses||[]).find(x => stVideoId(x.url) === id);
  suState.verse = v || null;
  if(v){ box.className = "su-verse"; box.innerHTML = `📖 <b>${htmlEsc(v.no)}번 (${htmlEsc(v.refShort)})</b>과 연결돼요 — 암송 도우미(쉬운 풀이·기억법)도 함께 만들어져요.`; return; }
  box.className = "su-verse warn";
  box.innerHTML = `⚠️ 이 링크를 가진 암송구절이 없어요.<br>이번 주 암송구절 설교라면 <b>① 설교/말씀 등록</b>에서 이 링크를 먼저 넣어 주세요 — 나중에 넣으면 이어지지 않아요.
    <br><button class="push-btn ghost" id="su-to1">① 설교/말씀 등록으로 가기</button>
    <label><input type="checkbox" id="su-nov"${suState.noVerse?" checked":""}> 암송구절 없이 올리기 (새벽기도 등)</label>`;
  document.getElementById("su-to1").addEventListener("click", ()=>{ clearInterval(suTimer); cmPrefillUrl = "https://www.youtube.com/watch?v="+id; renderContent(); });
  document.getElementById("su-nov").addEventListener("change", e=>{ suState.noVerse = e.target.checked; suCheck(); });
}

function suOnText(){
  suState.transcript = stCleanTranscript(document.getElementById("su-text").value);
  const n = suState.transcript.length, el = document.getElementById("su-count");
  el.className = "push-hint" + (n && n < 5000 ? " su-warn" : "");
  el.textContent = !n ? "" : n < 5000 ? `${stKorCount(n)} — 일부만 복사된 것 같아요. 스크립트를 끝까지 선택했는지 봐 주세요.`
                                      : `약 ${stKorCount(n)} 받았어요.`;
  suCheck();
}

function suCheck(){
  const go = document.getElementById("su-go"); if(!go || !suState) return;
  const why = [];
  if(!suState.id) why.push("영상 링크");
  if(suState.transcript.length < 1000) why.push("자막");
  if(!document.getElementById("su-title").value.trim()) why.push("제목");
  if(!document.getElementById("su-date").value) why.push("예배일");
  if(!document.getElementById("su-preacher").value.trim()) why.push("설교자");
  if(suState.id && !suState.verse && !suState.noVerse) why.push("암송구절 연결(또는 「없이 올리기」)");
  go.disabled = why.length > 0 || suBusy;
  document.getElementById("su-why").textContent = why.length ? "아직 필요한 것: " + why.join(" · ") : "";
}

async function suGo(){
  if(suBusy) return;
  const job = { videoId:suState.id, title:document.getElementById("su-title").value.trim(),
    date:document.getElementById("su-date").value, category:document.getElementById("su-cat").value,
    preacher:document.getElementById("su-preacher").value.trim(), transcript:suState.transcript };
  if(!(await mnDialog({ icon:"🚀", title:"설교 올리기", ok:"올리기", cancel:"그만두기",
    html:`<b>${plEsc(job.title)}</b><br>${plEsc(job.date)} · ${plEsc(job.category)} · ${plEsc(job.preacher)}`,
    note:"몇 분 걸려요. 이 창을 닫아도 계속 진행되고, 다시 열면 이어서 보여요." }))) return;
  suBusy = true; suCheck();
  const d = await callApi({ action:"sermonJobCreate", pw:getPw(), staff:getStaff(), job }).catch(()=>({ok:false,error:"network"}));
  suBusy = false;
  if(minAuthLost(d)) return;
  if(!d.ok){
    if(d.job) suShowJob(d.job);
    mnDialog({ icon:"⚠️", title:"올리지 못했습니다", tone:"danger", ok:"확인", cancel:null,
      html: plEsc(SU_ERR[d.error] || ("오류: "+(d.error||""))) + (d.detail ? `<br><small>${plEsc(d.detail)}</small>` : "") });
    suCheck(); return;
  }
  suSermonIds.add(job.videoId);
  suShowJob(d.job);
}

function suShowJob(job){
  const box = document.getElementById("su-job"); if(!box) return;
  const active = job.status === "queued" || job.status === "running";
  const form = document.getElementById("su-form"); if(form) form.hidden = active;
  const idx = SU_STEPS.findIndex(s => s[0] === job.step);
  const items = SU_STEPS.map(([k, label], i) => {
    const c = job.status === "done" ? "done"
      : job.status === "failed" ? (i < idx ? "done" : i === idx ? "bad" : "")
      : job.status === "running" ? (i < idx ? "done" : i === idx ? "now" : "") : "";
    return `<li class="${c}">${label}</li>`;
  }).join("");
  const head = job.status === "done" ? "✅ 다 올렸어요" : job.status === "failed" ? "⚠️ 멈췄어요"
    : job.status === "queued" ? "⏳ 시작을 기다리는 중" : "⏳ 올리는 중 — 몇 분 걸려요";
  // ⚠️ createdAt 이 아니라 updatedAt — 다시 시도한 작업은 만든 지 오래라 곧바로 「늦어진다」가 떴다
  const ageMin = (Date.now() - new Date(job.updatedAt).getTime()) / 60000;
  let note = "";
  if(job.status === "queued" && ageMin > 3) note = `<p class="msg err">시작이 늦어지고 있어요. 5분이 넘도록 그대로면 친구에게 알려 주세요.</p>`;
  if(job.status === "failed") note = `<p class="msg err">${htmlEsc(job.error || "까닭을 모릅니다")}</p>
      <p class="push-hint">친구에게 알려 주세요.${job.runUrl ? ` <a href="${htmlEsc(job.runUrl)}" target="_blank" rel="noopener">작업 기록</a>` : ""}</p>
      <button class="push-send" id="su-retry">🔁 다시 시도</button>`;
  box.innerHTML = `<div class="push-card"><div class="su-step">${head}</div>
    <div><b>${htmlEsc(job.title)}</b> <span class="push-hint">${htmlEsc(job.date)} · ${htmlEsc(job.createdBy || "")}</span></div>
    <ul class="su-prog">${items}</ul>${note}<div id="su-res"></div>
    ${active ? "" : `<button class="push-btn ghost" id="su-new">➕ 다른 설교 올리기</button>`}</div>`;
  const rt = document.getElementById("su-retry"); if(rt) rt.addEventListener("click", ()=>suRetry(job.id, rt));
  const nw = document.getElementById("su-new"); if(nw) nw.addEventListener("click", renderSermonUpload);
  clearInterval(suTimer);
  if(active) suTimer = setInterval(suPoll, 10000);
  if(job.status === "done") suShowResult(job);
}

async function suPoll(){
  if(!document.getElementById("su-job")){ clearInterval(suTimer); return; }   // 다른 화면으로 갔다
  const d = await callApi({ action:"sermonJobs", pw:getPw(), staff:getStaff() }).catch(()=>null);
  if(!d) return;                       // 한 번 끊겨도 다음 번에 다시
  if(minAuthLost(d)){ clearInterval(suTimer); return; }
  if(d.ok && d.jobs && d.jobs[0]) suShowJob(d.jobs[0]);
}

async function suRetry(id, btn){
  btn.disabled = true;
  const d = await callApi({ action:"sermonJobRetry", pw:getPw(), staff:getStaff(), id }).catch(()=>({ok:false,error:"network"}));
  btn.disabled = false;
  if(minAuthLost(d)) return;
  if(!d.ok){
    if(d.job) suShowJob(d.job);
    mnDialog({ icon:"⚠️", title:"다시 시작하지 못했습니다", tone:"danger", ok:"확인", cancel:null,
      html: plEsc(SU_ERR[d.error] || ("오류: "+(d.error||""))) + (d.detail ? `<br><small>${plEsc(d.detail)}</small>` : "") });
    return;
  }
  suShowJob(d.job);
}

async function suShowResult(job){
  const box = document.getElementById("su-res"); if(!box) return;
  if(window.SUPA.env !== "prod"){ box.innerHTML = `<p class="push-hint">🧪 개발 DB 시험 모드 — AI 노트·음성까지만 만들고 저장·배포는 건너뛰었어요.</p>`; return; }
  try{
    const r = await fetch(SERMON_FN, { method:"POST", headers:{ "Content-Type":"application/json", apikey:SERMON_ANON, Authorization:"Bearer "+SERMON_ANON },
      body: JSON.stringify({ action:"getSermons" }) });
    const s = ((await r.json()).sermons || []).find(x => x.id === job.videoId);
    if(!s){ box.innerHTML = `<p class="push-hint">사이트 목록에서 아직 안 보여요 — 잠시 뒤 새로고침해 보세요.</p>`; return; }
    box.innerHTML = `<div class="su-res">📖 ${htmlEsc(s.scripture || "")}${s.memRef ? ` · 암송 ${htmlEsc(s.memRef)}` : ""}
      <div class="sum">${mdBold(s.summary || "")}</div>
      <a class="push-btn ghost" href="${SERMON_SITE}?s=${encodeURIComponent(s.id)}" target="_blank" rel="noopener">사이트에서 보기</a></div>`;
  }catch(_){ box.innerHTML = ""; }
}
```

- [ ] **Step 2: 문법** — Task 7 Step 9. Expected: `문법 통과`

- [ ] **Step 3: localhost 로 화면이 서는지** (개발 DB · 담당자로)

```bash
cd /c/Projects/bm-sermon-staff && python -m http.server 8123
```
브라우저에서 ① `http://localhost:8123/index.html` 에서 개발 DB 시험 담당자(교구 사랑 1목장 사역담당시험)로 앱 로그인 → ② `http://localhost:8123/admin-sermon.html` → 설교·찬양 암호 → 메뉴 카드 넷(①·②·📜·🌿)이 보이고 🎵·🔑 는 **안 보인다** → ② 화면에서 링크를 넣으면 썸네일·제목이 뜨고, 짧은 글을 붙이면 「일부만 복사된 것 같아요」, 필요한 것이 다 차야 「🚀 올리기」가 켜진다.
Expected: 콘솔 오류 없음. 오른쪽 위에 「개발 DB」 띠.

- [ ] **Step 4: 커밋**

```bash
git commit -m "feat(관리자): ② 설교 내용 등록 — 링크·자막 붙여넣기·정보 확인·진행 막대·결과·다시 시도

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" -- admin-stats.html
```

---

### Task 12: 화면 — 🔑 담당자 화면을 역할로

**Files:**
- Modify: `admin-stats.html` — `function renderMinistryAdmins` · `maLoad` · `maRenderList` · `maSave` · `renderMinistryAdmins` 위의 `let maFound`

**Interfaces:**
- Consumes: `staffAdmins`·`staffAdminsSave`(Task 2)
- Produces: `renderStaffAdmins(role: "ministry"|"content")` · `renderMinistryAdmins()`(= `renderStaffAdmins("ministry")`, 기존 카드 그대로)

- [ ] **Step 1: 문구 표와 역할 변수** — `let maFound = [];` 바로 위에

```js
// 🔑 담당자 화면 — 역할마다 같은 화면(사역신청 · 설교·찬양, 2026-09-21)
let maRole = "ministry";
const MA_TEXT = {
  ministry: { title:"🔑 사역신청 담당자", name:"사역신청 담당자", page:"admin-ministry.html", pw:"사역신청 암호",
              scope:"사역신청 두 메뉴(현황 · 사역팀 정보)만 보고, 사역신청 자료는 모두 봅니다.", out:"사역관리 페이지" },
  content:  { title:"🔑 설교·찬양 담당자", name:"설교·찬양 담당자", page:"admin-sermon.html", pw:"설교·찬양 암호",
              scope:"설교 올리기(두 단계) · 설교 목록 · 매일 묵상 조회만 봅니다. 삭제·알림·통계는 못 합니다.", out:"설교·찬양 관리 화면" },
};
```

- [ ] **Step 2: `renderMinistryAdmins` 를 둘로**

`function renderMinistryAdmins(){` 줄을 아래 세 줄로 바꾼다:
```js
function renderMinistryAdmins(){ renderStaffAdmins("ministry"); }
function renderStaffAdmins(role){
  maRole = MA_TEXT[role] ? role : "ministry";
  const T = MA_TEXT[maRole];
```
그 함수 HTML 안의 네 자리를 바꾼다:

| 찾을 것 | 바꿀 것 |
|---|---|
| `<h2>🔑 사역신청 담당자</h2>` | `<h2>${T.title}</h2>` |
| `<b>사역신청 관리 화면</b>(<a href="admin-ministry.html" target="_blank" rel="noopener">admin-ministry.html</a>)에는` | `<b>${T.out}</b>(<a href="${T.page}" target="_blank" rel="noopener">${T.page}</a>)에는` |
| `<b>사역신청 암호</b>와 함께` | `<b>${T.pw}</b>와 함께` |
| `들어오신 분은 사역신청 두 메뉴(현황 · 사역팀 정보)만 보고, 사역신청 자료는 모두 봅니다.` | `들어오신 분은 ${T.scope}` |

그리고 같은 함수에 두 번 들어간 `document.getElementById("ma-q").addEventListener("keydown", …)` 줄 중 **하나를 지운다**(엔터를 누르면 두 번 찾던 것).

- [ ] **Step 3: 서버 부르기를 역할로**

| 함수 | 찾을 것 | 바꿀 것 |
|---|---|---|
| `maLoad` | `callApi({ action:"ministryAdmins", pw:getPw() })` | `callApi({ action:"staffAdmins", pw:getPw(), role:maRole })` |
| `maSave` | `callApi({ action:"ministryAdminsSave", pw:getPw(), op, key })` | `callApi({ action:"staffAdminsSave", pw:getPw(), role:maRole, op, key })` |
| `maRenderList` | `등록된 담당자가 없습니다 — 사역신청 암호로는 아무도 들어오지 못합니다.` | `등록된 담당자가 없습니다 — ${MA_TEXT[maRole].pw}로는 아무도 들어오지 못합니다.` |
| `maRenderList` | `사역신청 담당자에서 뺄까요?` | `${MA_TEXT[maRole].name}에서 뺄까요?` |
| `maRenderList` | `이분은 사역관리 페이지에 <b>바로</b> 들어오지 못합니다.` | `이분은 ${MA_TEXT[maRole].out}에 <b>바로</b> 들어오지 못합니다.` |

- [ ] **Step 4: 「← 메뉴」가 제 메뉴로** — `renderStaffAdmins` 는 `renderMenu` 로 돌아간다(모드가 가른다). 따로 고칠 것 없음을 확인만:

Run: `grep -n 'getElementById("back").addEventListener("click", renderMenu)' admin-stats.html | wc -l`
Expected: 0 이 아니다.

- [ ] **Step 5: 문법 · localhost** — 관리자로 `http://localhost:8123/admin-stats.html?only=sermon`(허브에서 개발 관리자 암호로 들어온 뒤) → 「🔑 설교·찬양 담당자」 → 시험 담당자가 보인다(Task 4 에서 넣었다). 성경암송 관리의 「🔑 사역신청 담당자」도 그대로 열린다.

- [ ] **Step 6: 커밋**

```bash
git commit -m "feat(관리자): 🔑 담당자 화면을 역할로 — 사역신청 · 설교·찬양 한 화면 · 엔터 두 번 찾던 것

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" -- admin-stats.html
```

---

### Task 13: 처음부터 끝까지 — 개발 DB 시험 모드로

**Files:** 없음(시험만). 필요하면 앞 Task 로 돌아가 고친다.

**Interfaces:**
- Consumes: 전부. 준비(친구): 개발 시크릿 `GH_DISPATCH_TOKEN`·`GH_DISPATCH_REF=feat/sermon-staff` · gocheok-sermons 시크릿 `DEV_SERMON_ADMIN`

- [ ] **Step 1: 개발 함수 다시 배포** (Task 4 이후 바뀐 게 없으면 건너뛴다)

```bash
cd /c/Projects/bm-sermon-staff && git status --short && supabase functions deploy api --no-verify-jwt --project-ref ktpwthwqzgcqcrmsafdo
```

- [ ] **Step 2: 개발 DB 를 비운 상태로** — Task 6 Step 7 의 시험 작업이 `done` 이면 「한 번에 하나만」에 걸리지 않는다. 개발 `sermons` 에 9YgDMXP77NE 가 없어야 한다(시험 모드는 저장하지 않는다).

- [ ] **Step 3: 화면으로 한 편** — localhost · 담당자로
  1. ① 설교/말씀 등록 → 「+ 새 말씀 추가」 → 번호·날짜가 채워지는지(개발 DB 가 비어 있으면 비어 있다 — 그러면 39 · 2026-09-26 을 손으로) → 출처·본문·링크 `https://youtu.be/9YgDMXP77NE` → 저장 → 확인 창 → 「✅ 저장되었습니다」 + 「② 설교 내용 등록으로 →」
  2. 그 단추 → ② 에 링크가 들어 있고 썸네일·제목, 「📖 39번 … 과 연결돼요」
  3. 자막: 로컬 파일을 **유튜브 창 꼴로** 만들어 붙인다(시각 줄 섞인 꼴):
     ```bash
     python -c "import io,re;t=io.open(r'C:/Projects/gocheok-sermons/data/transcripts/9YgDMXP77NE.txt',encoding='utf-8').read();w=t.split(' ');print('\n'.join(f'{i//20}:{i%60:02d}\n'+' '.join(w[i:i+12]) for i in range(0,len(w),12)))" > /tmp/yt-panel.txt
     ```
     `/tmp/yt-panel.txt` 를 열어 전부 복사 → 붙이기 → 「약 2.3만 자 받았어요」
  4. 「🚀 올리기」 → 확인 → 진행 막대. `gh run list -R sewoongkim1/gocheok-sermons --workflow sermon-job.yml -L 1` 에 새 실행이 뜬다(가지 `feat/sermon-staff`).
  5. 창을 닫았다 다시 ② 를 열면 진행이 이어서 보인다.
  6. 끝나면 「✅ 다 올렸어요」 + 「🧪 개발 DB 시험 모드」.
Expected: 막대가 `자막 준비 → … → 암송 도우미` 까지 채워지고 `done`. 실패하면 멈춘 단계와 한 줄이 보인다 → 그 단계의 스크립트 로그(`작업 기록` 링크)부터.

- [ ] **Step 4: 실패 화면** — 개발 시크릿 `GH_DISPATCH_REF` 를 잠시 `없는가지` 로 바꾸고 다른 영상(아무 설교 링크)으로 올리기 → 「작업을 시작하지 못했어요」 창 + 작업 카드에 「⚠️ 멈췄어요」·「🔁 다시 시도」 → 시크릿을 `feat/sermon-staff` 로 되돌리고 「다시 시도」 → 진행.
Expected: 두 번째에 진행된다. (이 영상의 시험 작업은 끝까지 가도 된다 — 개발이라 저장하지 않는다)

- [ ] **Step 5: 동시에 둘** — 진행 중일 때 다른 창에서 또 올리기 → 「다른 설교가 올라가는 중이에요」.

- [ ] **Step 6: 권한 스모크 한 번 더** — `ADMIN_PW=… STAFF_PW=… python tests/sermon-staff-smoke.py` → `실패 0`

- [ ] **Step 7: 화면 조건 둘러보기** — 좁은 폰(360px)에서 ②·📜 화면이 가로로 넘치지 않는지 (`docs/notes/capture-tools.md` 를 먼저 읽고 헤드리스 크롬 캡처 · ⚠️ 헤드리스 뷰포트는 526px 고정이라 잘린 그림을 레이아웃 버그로 오인하지 말 것 — 메모리 `headless-chrome-viewport`)

- [ ] **Step 8: 가지 올리기**

```bash
cd /c/Projects/bm-sermon-staff && git push -u origin feat/sermon-staff
```
⚠️ **PR 을 열어도 머지하지 않는다** — 머지 = 운영 배포다. Phase B 에서.

---

# Phase B — 운영 (2026-09-27 안드로이드 심사가 끝난 뒤)

### Task 14: 찬양 아카이브도 담당자가

**Files:**
- Modify: `C:\Projects\praise-songs\supabase\functions\praise\index.ts`
- Modify: `admin-praise.html` · `praise-api.js` · `admin-stats.html`(`renderSermonMenu` 한 줄 · `MA_TEXT.content.scope`)

**Interfaces:**
- Consumes: `staffVerify`(Task 2 — 운영에 배포된 뒤)
- Produces: 찬양 함수가 `b.staff` 를 받으면 담당자로 통과 — `authCheck`·`ytFetch`·`adminList`·`saveSong`·`setOrdering`·`refreshViews`·`usageStats`. **관리자만:** `deleteSong`·`importSongs`

- [ ] **Step 1: 찬양 함수** — `const isAdmin = () => b.secret === ADMIN_SECRET;` 바로 아래에

```ts
  // 설교·찬양 담당자(2026-09-21) — 관리자 암호가 아니면 성경암송 api 함수에 「등록된 담당자인가」만 묻는다.
  // ⚠️ 담당자 확인 코드를 여기에 복사하지 않는다(소속이 바뀐 분·합쳐진 계정을 따라가는 코드가 두 벌이 된다).
  const canEdit = async () => isAdmin() || await staffOk(b);
```
`Deno.serve(` 앞에(파일 위쪽 함수들 곁에):
```ts
const API_FN = `${Deno.env.get("SUPABASE_URL")}/functions/v1/api`;
async function staffOk(b: any): Promise<boolean> {
  if (!b.staff || typeof b.staff !== "object" || !b.secret) return false;
  const key = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  try {
    const r = await fetch(API_FN, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(key ? { apikey: key, Authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify({ action: "staffVerify", role: "content", pw: b.secret, staff: b.staff }),
    });
    return !!(await r.json()).ok;
  } catch { return false; }
}
```
그리고 `authCheck`·`ytFetch`·`adminList`·`saveSong`·`setOrdering`·`refreshViews`·`usageStats` 일곱 곳의 `if (!isAdmin())` 를 `if (!(await canEdit()))` 로, `authCheck` 는:
```ts
      case "authCheck": {
        const ok = await canEdit();
        return json(ok ? { ok: true, role: isAdmin() ? "admin" : "content" } : { ok: false, error: "권한 없음" }, ok ? 200 : 403);
      }
```
`deleteSong`·`importSongs` 는 **그대로**(`isAdmin()`).

- [ ] **Step 2: `praise-api.js` 의 `call` 본문**

찾을 것: `      body: JSON.stringify({ action, ...body }),`
바꿀 것:
```js
      // 설교·찬양 담당자로 들어왔으면 누구인지 함께(서버가 성경암송 api 에 묻는다 · 2026-09-21)
      body: JSON.stringify({ action, ...body, ...(window.PRAISE_STAFF ? { staff: window.PRAISE_STAFF } : {}) }),
```

- [ ] **Step 3: `admin-praise.html`**
  - `login()` 의 `sessionStorage.setItem("admin-pw", SECRET);` → `if (!window.PRAISE_STAFF) sessionStorage.setItem("admin-pw", SECRET);   // ⚠️ 담당자 암호를 admin-pw 에 넣으면 허브·다른 도구가 줄줄이 실패한다`
  - 목록의 삭제 단추 `<button class="ghost" style="color:#c0392b" onclick="delSong('${s.id}')">삭제</button>` → `${window.PRAISE_STAFF ? "" : `<button class="ghost" style="color:#c0392b" onclick="delSong('${s.id}')">삭제</button>`}`
  - 세션 복원 덩이를:
    ```js
    (function () {
      const s = sessionStorage.getItem("admin-pw") || sessionStorage.getItem("padm");
      const cp = sessionStorage.getItem("content-pw");
      let st = null; try { st = JSON.parse(sessionStorage.getItem("content-staff") || "null"); } catch (_) {}
      if (s) { $("pw").value = s; login(); }
      else if (cp && st) { window.PRAISE_STAFF = st; $("pw").value = cp; login(); }   // 설교·찬양 관리에서 넘어온 담당자
      $("pw").addEventListener("keydown", (e) => { if (e.key === "Enter") login(); });
    })();
    ```
  - `logout()` → `function logout() { sessionStorage.removeItem("padm"); if (window.PRAISE_STAFF) { location.href = "admin-sermon.html"; return; } location.reload(); }`
  - 로그인 화면(`#gate`)의 `gate-msg` 아래에: `<p class="muted" style="font-size:13px;margin-top:10px">설교·찬양 담당자는 <a href="admin-sermon.html">설교·찬양 관리</a>에서 들어와 주세요.</p>`
  - 캐시태그 두 줄 `praise-config.js?v=20260709a` · `praise-api.js?v=20260709a` → `?v=20260928a` (`bump.py` 는 이 둘을 안 올린다)

- [ ] **Step 4: 메뉴에서 찬양 카드를 담당자에게** — `renderSermonMenu` 의
`${STAFF_MODE ? "" : card("rep-praise", …)}` → `${card("rep-praise", "🎵", "찬양 아카이브 관리", "곡 등록 · 콤보순서 · 조회수 · 사용현황")}`
그리고 `MA_TEXT.content.scope` 를 `"설교 올리기(두 단계) · 설교 목록 · 매일 묵상 조회 · 찬양 아카이브만 봅니다. 삭제·알림·통계는 못 합니다."`

- [ ] **Step 5: 찬양 함수 배포**(운영뿐 — 개발 프로젝트가 없다) — Task 15 의 운영 `api` 배포 **뒤**에

```bash
cd /c/Projects/praise-songs && git status --short && supabase functions deploy praise --no-verify-jwt --project-ref xnomlgydifiqiybervtf
```

- [ ] **Step 6: 시험(운영 · 곡을 지우지 않는 것만)** — 담당자로 설교·찬양 관리 → 🎵 → 목록이 뜨고 **삭제 단추가 없다** → 곡 하나 순서 바꾸기 저장이 된다 → 관리자로 들어가면 삭제 단추가 있다. 틀린 암호로 `praise` `adminList` 를 부르면 `권한 없음`.

- [ ] **Step 7: 커밋** — praise-songs 와 성경암송 각각

```bash
cd /c/Projects/praise-songs && git commit -m "feat(찬양): 설교·찬양 담당자도 곡 등록·순서 — 성경암송 api staffVerify 에 묻는다 · 삭제·일괄은 관리자만

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" -- supabase/functions/praise/index.ts && git push
cd /c/Projects/bm-sermon-staff && git commit -m "feat(관리자): 찬양 아카이브도 설교·찬양 담당자가

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" -- admin-praise.html praise-api.js admin-stats.html
```

---

### Task 15: 운영 반영

**Files:** 코드 없음 — 순서가 전부다.

- [ ] **Step 1: 친구 — 운영 준비**
  - 운영 SQL Editor: `supabase/sermon_jobs.sql` **만**(⚠️ `dev-sermons-tables.sql` 은 돌리지 말 것)
  - 운영 시크릿: `CONTENT_STAFF_SECRET` (`GH_DISPATCH_TOKEN` 은 있다 · `GH_DISPATCH_REF` 는 넣지 않는다 → `main`)
- [ ] **Step 2: gocheok-sermons 가지를 `main` 으로** — 친구 PC 방식(`add-local.mjs`)도 이 변경을 쓰니, 병합 뒤 `node --test scripts/job-lib.test.mjs` 와 Task 5 Step 8 을 `main` 에서 한 번 더.
  ```bash
  cd /c/Projects/gocheok-sermons && git status --short && git checkout main && git pull --ff-only && git merge --no-ff feat/sermon-staff && git push
  ```
- [ ] **Step 3: 운영 `api` 배포** — ⚠️ worktree 에서(본 체크아웃의 남의 미완성 코드가 실리지 않게), `main` 을 받아 합친 뒤
  ```bash
  cd /c/Projects/bm-sermon-staff && git fetch -q && git merge origin/main && git status --short
  supabase functions deploy api --no-verify-jwt --project-ref xnomlgydifiqiybervtf
  ```
  확인: 운영에서 틀린 암호로 `contentAuth` → `unauthorized`, 관리자 암호로 `staffAdmins role=ministry` → 사역 담당자 명단 그대로.
- [ ] **Step 4: 운영에 담당자 등록** — 허브 → 설교·찬양 관리 → 🔑 설교·찬양 담당자 → 실제 담당자. (담당자는 그 PC 에서 앱에 **먼저 로그인**해 두어야 한다)
- [ ] **Step 5: Task 14 Step 5 · 6(찬양 함수)**
- [ ] **Step 6: 화면 병합·배포** — ⚠️ **다른 세션이 쓰는 본 체크아웃에서 합치지 않는다.** worktree 에서 `main` 을 합치고
  `bump.py` 까지 한 뒤 그 가지를 `main` 으로 올린다(본 체크아웃은 다음 `pull` 때 따라온다)
  ```bash
  cd /c/Projects/bm-sermon-staff && git fetch -q && git merge origin/main && git status --short
  python tools/bump.py && git status --short          # bump 가 고친 파일을 본다
  git commit -m "chore: bump — 설교·찬양 담당자

  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" -- <bump 가 고친 파일들 그대로>
  python tools/preflight.py && node --test tests/sermon-text.test.cjs
  git push origin HEAD:main
  ```
  (푸시가 거절되면 그사이 누가 `main` 에 올린 것 — `git fetch && git merge origin/main` 뒤 `bump.py` 부터 다시)
- [ ] **Step 7: 배포 확인** — 이번 판에만 있는 표식: 라이브 `admin-stats.html` 에 `==== sermon-text` 가 있고, `admin-sermon.html` 이 `only=sermon` 으로 넘긴다.
  ```bash
  curl -s "https://gocheok.onlybible.kr/admin-stats.html?t=$(date +%s)" | grep -c "==== sermon-text"
  curl -s "https://gocheok.onlybible.kr/admin-sermon.html?t=$(date +%s)" | grep -c "only=sermon"
  ```
  Expected: 둘 다 1 이상.
- [ ] **Step 8: 첫 실전** — 친구가 지켜보는 가운데 담당자가 그 주 설교를 ① → ② 로. 결과를 sermon.onlybible.kr · 암송앱 암송 도우미 · 챗봇(「내게 주시는 말씀」)에서 본다. 실패하면 텔레그램이 오는지도.
- [ ] **Step 9: 옛 길 치우기**(첫 실전이 성공한 뒤) — gocheok-sermons `.github/workflows/add-sermon.yml` 삭제 · `supabase/functions/sermon/index.ts` 의 `addByUrl` 케이스 삭제 → sermon 함수 배포. 개발 시크릿 `GH_DISPATCH_REF` 는 지운다.

---

### Task 16: 문서

**Files:**
- Create: `docs/notes/sermon-staff-upload.md`
- Modify: `CLAUDE.md`(표 한 줄 · 「다음 작업」) · `C:\Projects\gocheok-sermons\docs\설교-url-반영-절차.md`(맨 위) · `.claude/skills/reflect-sermon/SKILL.md`(맨 위)

- [ ] **Step 1: `docs/notes/sermon-staff-upload.md`** — 이 기능의 함정만(설계서에 있는 것은 링크로):
  - 구조 한 문단 + 설계서·계획서 링크
  - ⚠️ 날짜 버그(`isoDateInput` UTC) — 34~36번이 금요일인 까닭 · 되돌리려면 날짜를 손으로 고쳐 저장
  - ⚠️ 워크플로는 기본 가지에 있어야 불린다 · 개발은 `GH_DISPATCH_REF`
  - ⚠️ `sermon_jobs_one_active` · 30분 스윕
  - ⚠️ 영상 번호 규칙 세 곳 · `SERMON_CATS` 두 곳
  - ⚠️ 다시 시도는 DB 내용을 이어 쓴다(음성·글 어긋남)
  - ⚠️ 담당자는 그 PC 에서 앱에 먼저 로그인
  - 개발 시험 순서(Task 13 요약)
- [ ] **Step 2: CLAUDE.md** — 표에 `| 설교·찬양 관리(담당자 · 설교 올리기) | docs/notes/sermon-staff-upload.md |` · 「관리자」 절의 `admin-sermon.html` 줄을 「설교·찬양 관리(`admin-stats.html?only=sermon`) — 담당자 전용 암호 + 등록된 담당자」로 · 「다음 작업」의 이 항목을 끝냄으로
- [ ] **Step 3: 설교 반영 절차 문서 맨 위**: `> 2026-10 부터 담당자는 **관리자 화면(설교·찬양 관리)** 으로 올린다. 이 문서는 친구 PC 방식(급할 때).`
- [ ] **Step 4: reflect-sermon 스킬 맨 위**: 같은 한 줄 + 「담당자가 올린 설교가 멈췄다는 제보면 `sermon_jobs` 와 `sermon-job.yml` 실행 기록부터」
- [ ] **Step 5: 커밋** — 각 저장소에서 경로로

---

## 자체 점검 (계획을 쓴 뒤)

- 설계서 3장 화면·로그인 → Task 7·9·10·11 · 4장 구조 → Task 3·5·6 · 5장 자막 규칙 → Task 8 · 6장 표·액션 → Task 1·3 · 7장 권한 → Task 2·4·12 · 8장 구절 → Task 10 · 10장 실패 → Task 3(스윕·다시 시도)·6(fail·텔레그램)·11(화면) · 11장 시험 → Task 4·8·13 · 12장 순서 → Task 1·4·15 · 13장 문서 → Task 16 · 14장 찬양 → Task 14.
- 설계 5장 「실제로 복사한 글로 먼저 모은다」 → Task 13 Step 3 은 흉내 낸 꼴이다. **실제 유튜브 창에서 복사한 글 한 편을 친구에게 받아** `tests/sermon-text.test.cjs` 에 표본으로 더한다(Phase B 첫 실전 전까지). 규칙이 모자라면 `stCleanTranscript` 에 더하고 시험을 늘린다.
- 이름 맞춤: `toJob` 의 `videoId/date/runUrl/createdBy/createdAt/updatedAt` ↔ 화면 `suShowJob`·`suShowResult` · `sermonJobGet` 은 snake(`video_id`·`svc_date`·`transcript`) ↔ `job-run.mjs`·`mergeMeta` · `staffAdmins{role}` ↔ `maLoad` · `contentAuth` ↔ `STAFF_CFG.auth` · `suPrefill`(Task 11) ↔ `cmAfterSave`(Task 10) · `cmPrefillUrl`(Task 10) ↔ `suLoadVerse`(Task 11).
