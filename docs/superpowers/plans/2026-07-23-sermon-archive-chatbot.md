# 설교 아카이브 챗봇 (관리자 베타) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 고척교회 말씀암송앱의 관리자 허브에, 올해 설교 39개를 RAG로 검색·질의하는 챗봇(근거 기반 요약 + 출처/유튜브 링크)을 추가한다.

**Architecture:** 신규 `sermon_chunks` 테이블 + `match_sermon_chunks` RPC(pgvector, 통합 Supabase 프로젝트)에 설교를 임베딩하고, 기존 `api` Edge Function(Deno)에 관리자 전용 액션 두 개(`embedSermons` 색인, `sermonChat` 질의)를 추가한다. 프론트는 `admin.html` 허브에 새 관리자 페이지 `admin-sermon-chat.html`를 연결한다.

**Tech Stack:** Deno Edge Function(Supabase), pgvector, Voyage AI `voyage-3-large`(1024-dim), Anthropic Claude(`claude-opus-4-8`), Vanilla JS PWA.

## Global Constraints

- Edge Function 배포: `supabase functions deploy api --no-verify-jwt --project-ref xnomlgydifiqiybervtf`
- 관리자 인증: `api/index.ts`의 `adminError(b)`가 `b.pw === ADMIN_SECRET`를 검사(요청 필드명은 `pw`). 새 액션 두 개 모두 함수 첫 줄에서 `adminError` 검사.
- 임베딩: Voyage `voyage-3-large`, `output_dimension: 1024`, `input_type` = 색인 시 `"document"` / 질의 시 `"query"`. **`VOYAGE_API_KEY` 시크릿을 프로젝트에 추가해야 함**(현재 없음, myfavorite `.env.local` 값 사용).
- Claude: `claude-opus-4-8`, 헤더 `x-api-key`+`anthropic-version: 2023-06-01`, endpoint `https://api.anthropic.com/v1/messages`(기존 `generateNiv` 패턴 그대로).
- 공유 DB(`xnomlgydifiqiybervtf`, 3개 앱 공용): **신규 테이블/RPC만 추가**하고 기존 테이블(users, sermons, verses, progress 등)은 절대 변경하지 않는다.
- 프론트 → `api` 호출: `POST ${window.SUPA.URL}/functions/v1/api`, 헤더 `apikey`+`Authorization: Bearer ${window.SUPA.ANON}`, 바디 `{ action, pw, ... }`.
- `sermons` 컬럼 형태: `id`(text=유튜브영상ID), `title`, `svc_date`(date), `scripture`(text), `summary`(text), `points`(jsonb: `[{heading, body}]`), `daily_meditations`(jsonb: `[{heading, message, question}]`), `hidden`(bool). supabase-js는 jsonb를 파싱된 배열로 반환한다.
- **이 프로젝트에는 단위 테스트 프레임워크가 없다**(package.json/deno/vitest 없음). 각 태스크의 "테스트"는 **실제 호출 검증**이다: SQL 쿼리 실행, 배포 후 `curl`, 브라우저 확인. 이는 이 저장소의 확립된 검증 방식이다.
- 프론트 배포는 gocheok 규칙(GitHub Pages, push→Actions). admin 페이지 변경은 캐시태그 대상이 아니므로 `index.html ?v=`/스플래시 갱신은 이번 범위에 해당 없음(main app.js/style.css를 바꾸지 않음).

---

## File Structure

- **Create** `supabase/sermon_chunks.sql` — 신규 테이블 + HNSW 인덱스 + `match_sermon_chunks` RPC + grant. (Task 1)
- **Modify** `supabase/functions/api/index.ts` — Voyage 임베딩 헬퍼, 설교 청킹 헬퍼, `embedSermons`·`sermonChat` 액션 함수, switch 케이스 2개 추가. (Task 2, 3)
- **Create** `admin-sermon-chat.html` — 관리자 챗봇 UI(질문/답변/출처/색인 버튼). (Task 4)
- **Modify** `admin.html` — `TOOLS` 배열에 항목 1개 추가. (Task 4)

---

## Task 1: DB 스키마 — sermon_chunks 테이블 + match_sermon_chunks RPC

**Files:**
- Create: `supabase/sermon_chunks.sql`

**Interfaces:**
- Produces: 테이블 `public.sermon_chunks(id uuid, sermon_id text, chunk_index int, content text, embedding vector(1024), title text, svc_date date, scripture text, youtube_id text, created_at timestamptz)`. RPC `match_sermon_chunks(query_embedding vector(1024), match_count int) returns table(id uuid, sermon_id text, content text, title text, svc_date date, scripture text, youtube_id text, similarity float)`.

- [ ] **Step 1: SQL 파일 작성**

`supabase/sermon_chunks.sql`:

```sql
-- 설교 아카이브 챗봇 (관리자 베타) — RAG 벡터 스토어
--
-- ⚠️ 이 DB는 3개 앱(성경암송/찬양/말씀 + myfavorite)이 공유한다. 이 파일은
-- 신규 테이블 sermon_chunks와 RPC match_sermon_chunks만 추가하며, 기존
-- 테이블(sermons 등)은 건드리지 않는다.
--
-- 임베딩은 myfavorite content_chunks와 동일하게 Voyage voyage-3-large(1024차원).
-- vector 확장은 프로젝트 규약상 extensions 스키마에 이미 설치돼 있다.

create table if not exists sermon_chunks (
  id uuid primary key default gen_random_uuid(),
  sermon_id text not null,
  chunk_index integer not null default 0,
  content text not null,
  embedding extensions.vector(1024) not null,
  -- 검색 결과에서 조인 없이 바로 인용/링크에 쓰도록 메타를 비정규화해 둔다.
  title text not null,
  svc_date date,
  scripture text,
  youtube_id text not null,
  created_at timestamptz not null default now()
);

-- 재색인(embedSermons)이 sermon_id 단위로 기존 청크를 지우고 다시 넣으므로 인덱스.
create index if not exists sermon_chunks_sermon_idx on sermon_chunks (sermon_id);

-- HNSW 코사인 인덱스 (myfavorite content_chunks 패턴).
create index if not exists sermon_chunks_embedding_idx
  on sermon_chunks
  using hnsw (embedding extensions.vector_cosine_ops);

-- RLS deny-all: 정책을 두지 않아 anon/authenticated 접근을 전면 차단하고,
-- 서비스 롤(api Edge Function)만 RLS를 우회한다. (myfavorite cron_run_log 패턴)
alter table sermon_chunks enable row level security;

-- 코사인 유사도 검색 RPC. search_path를 함수에 고정해 <=> 연산자가 항상
-- resolve되게 하고, SECURITY DEFINER는 쓰지 않는다(service_role 전용).
create or replace function match_sermon_chunks(
  query_embedding extensions.vector(1024),
  match_count int default 5
)
returns table (
  id uuid,
  sermon_id text,
  content text,
  title text,
  svc_date date,
  scripture text,
  youtube_id text,
  similarity float
)
language sql
stable
set search_path = public, extensions
as $$
  select
    id,
    sermon_id,
    content,
    title,
    svc_date,
    scripture,
    youtube_id,
    1 - (embedding <=> query_embedding) as similarity
  from sermon_chunks
  order by embedding <=> query_embedding
  limit match_count;
$$;

-- anon 키로 PostgREST rpc() 직접 호출을 막고 service_role만 실행 가능하게.
revoke execute on function match_sermon_chunks(extensions.vector(1024), int) from public;
grant execute on function match_sermon_chunks(extensions.vector(1024), int) to service_role;
```

- [ ] **Step 2: 마이그레이션 적용 (되돌리기 어려운 작업 — 사용자 확인 후 실행)**

공유 프로덕션 DB에 스키마를 추가하므로 실행 전 사용자에게 확인받는다. 확인되면:

Run:
```bash
supabase db query -f supabase/sermon_chunks.sql --linked
```

Expected: 오류 없이 완료(빈 결과 또는 성공 메시지).

- [ ] **Step 3: 테이블·RPC 생성 검증**

Run:
```bash
supabase db query "select count(*) as chunks from sermon_chunks;" --linked
```
Expected: `{"chunks": 0}` (테이블 존재, 아직 비어 있음).

Run (RPC가 존재하고 호출 가능한지 — 0 벡터로 스모크):
```bash
supabase db query "select count(*) from match_sermon_chunks(array_fill(0::real, array[1024])::extensions.vector, 5);" --linked
```
Expected: `{"count": 0}` (RPC 실행됨, 매칭 청크 없음).

- [ ] **Step 4: Commit**

```bash
git add supabase/sermon_chunks.sql
git commit -m "feat(sermon-chat): add sermon_chunks table and match RPC"
```

---

## Task 2: embedSermons 액션 — 설교 청킹·임베딩·적재

**Files:**
- Modify: `supabase/functions/api/index.ts` (switch에 케이스 추가 + 헬퍼/액션 함수 추가)

**Interfaces:**
- Consumes: Task 1의 `sermon_chunks` 테이블. `sermons` 테이블(읽기).
- Produces:
  - `embedVoyage(texts: string[], inputType: "document" | "query"): Promise<number[][]>` — Voyage 임베딩 헬퍼(Task 3도 사용).
  - `chunkSermon(s): { chunk_index, content }[]` — 설교 1건을 청크 배열로. (Task 3의 컨텍스트 구성은 이 형식을 참조하지 않지만 content 헤더 규칙 `[제목 — 소제목]`을 공유)
  - 액션 `embedSermons` — body `{ pw, sermonId? }`, 반환 `{ ok, sermons, chunks }`.

- [ ] **Step 1: Voyage 임베딩 헬퍼 추가**

`api/index.ts`의 `adminError` 함수 바로 아래(라인 ~53)에 추가:

```ts
// ---------- 설교 챗봇: Voyage 임베딩 (myfavorite lib/voyage.ts의 Deno 이식) ----------
const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
async function embedVoyage(
  texts: string[],
  inputType: "document" | "query",
): Promise<number[][]> {
  const key = Deno.env.get("VOYAGE_API_KEY");
  if (!key) throw new Error("VOYAGE_API_KEY 시크릿 미설정");
  const res = await fetch(VOYAGE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      input: texts,
      model: "voyage-3-large",
      input_type: inputType,
      output_dimension: 1024,
    }),
  });
  if (!res.ok) throw new Error(`voyage-${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  return (j.data ?? []).map((d: any) => d.embedding as number[]);
}

// 설교 1건 → 청크 배열. summary·각 point·각 daily_meditation을 개별 청크로 쪼개고,
// 검색·인용 시 맥락이 남도록 각 청크 앞에 `[제목 — 소제목]` 헤더를 붙인다.
function chunkSermon(s: any): { chunk_index: number; content: string }[] {
  const out: { chunk_index: number; content: string }[] = [];
  const title = (s.title ?? "").toString().trim();
  const push = (label: string, bodyRaw: unknown) => {
    const body = (bodyRaw ?? "").toString().trim();
    if (!body) return;
    out.push({ chunk_index: out.length, content: `[${title} — ${label}]\n${body}` });
  };
  push("요약", s.summary);
  for (const p of (s.points ?? [])) push(p.heading ?? "본문", p.body);
  for (const m of (s.daily_meditations ?? [])) push(m.heading ?? "묵상", m.message);
  return out;
}
```

- [ ] **Step 2: embedSermons 액션 함수 추가**

`generateNiv` 함수 아래(라인 ~675)에 추가:

```ts
// ---------- embedSermons: 설교를 청킹·임베딩해 sermon_chunks에 적재 (관리자) ----------
// body: { pw, sermonId? }  — sermonId 있으면 단건, 없으면 hidden=false 전체 재색인.
async function embedSermons(b: any) {
  const err = adminError(b); if (err) return { ok: false, error: err };

  let q = db.from("sermons")
    .select("id, title, svc_date, scripture, summary, points, daily_meditations")
    .eq("hidden", false);
  if (b.sermonId) q = db.from("sermons")
    .select("id, title, svc_date, scripture, summary, points, daily_meditations")
    .eq("id", b.sermonId);
  const { data: sermons, error } = await q;
  if (error) throw error;
  if (!sermons?.length) return { ok: false, error: "no-sermons" };

  let totalChunks = 0;
  for (const s of sermons) {
    const chunks = chunkSermon(s);
    if (!chunks.length) continue;
    // Voyage 배치 한도를 고려해 넉넉히 자른다(설교 1건 청크 수는 십수 개 수준).
    const vectors = await embedVoyage(chunks.map((c) => c.content), "document");
    const rows = chunks.map((c, i) => ({
      sermon_id: s.id,
      chunk_index: c.chunk_index,
      content: c.content,
      embedding: vectors[i],
      title: s.title,
      svc_date: s.svc_date,
      scripture: s.scripture,
      youtube_id: s.id, // sermons.id가 유튜브 영상 ID
    }));
    // 멱등: 해당 설교의 기존 청크를 지우고 다시 넣는다(설교 내용 수정 반영).
    await db.from("sermon_chunks").delete().eq("sermon_id", s.id);
    const { error: insErr } = await db.from("sermon_chunks").insert(rows);
    if (insErr) throw insErr;
    totalChunks += rows.length;
  }
  return { ok: true, sermons: sermons.length, chunks: totalChunks };
}
```

- [ ] **Step 3: switch에 케이스 추가**

`api/index.ts`의 `case "generateNiv":` 줄(라인 86) 바로 아래에 추가:

```ts
      case "embedSermons":  return json(await embedSermons(body));
      case "sermonChat":    return json(await sermonChat(body));
```

(`sermonChat`은 Task 3에서 구현하지만, switch는 함수 선언 호이스팅 덕분에 두 줄을 함께 넣어도 배포 전까지 문제없다. Task 3 배포 전까지 `sermonChat` 호출은 하지 않는다.)

- [ ] **Step 4: VOYAGE_API_KEY 시크릿 등록 (사용자 확인 후 — 외부 비밀 주입)**

myfavorite `.env.local`의 `VOYAGE_API_KEY` 값을 공유 프로젝트 시크릿으로 등록:

Run:
```bash
supabase secrets set VOYAGE_API_KEY=<myfavorite .env.local의 값> --project-ref xnomlgydifiqiybervtf
```
Expected: `Finished supabase secrets set.`

- [ ] **Step 5: 배포**

Task 3의 `sermonChat`이 아직 없으면 배포 시 switch에서 미정의 참조로 실패한다. 따라서 **Task 3 Step 1까지 마친 뒤 함께 배포**한다. 이 태스크만 단독 검증하려면 switch의 `sermonChat` 줄을 잠시 주석 처리하고 배포한 뒤, Task 3에서 해제한다.

이 태스크 단독 배포(권장: 주석 처리 후):
```bash
supabase functions deploy api --no-verify-jwt --project-ref xnomlgydifiqiybervtf
```
Expected: `Deployed Functions on project xnomlgydifiqiybervtf: api`.

- [ ] **Step 6: 색인 실행 & 검증 (실제 호출)**

Run (관리자 비번은 실제 `ADMIN_SECRET` 값으로 치환):
```bash
curl -s -X POST "https://xnomlgydifiqiybervtf.supabase.co/functions/v1/api" \
  -H "Content-Type: application/json" \
  -H "apikey: sb_publishable_oLtieT_jw7Gjb8etEsy0jw_thBaDjl-" \
  -H "Authorization: Bearer sb_publishable_oLtieT_jw7Gjb8etEsy0jw_thBaDjl-" \
  -d '{"action":"embedSermons","pw":"<ADMIN_SECRET>"}'
```
Expected: `{"ok":true,"sermons":39,"chunks":<수백 개>}` 형태.

Run (적재 검증):
```bash
supabase db query "select count(*) as chunks, count(distinct sermon_id) as sermons from sermon_chunks;" --linked
```
Expected: `chunks` 수백, `sermons` 39.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/api/index.ts
git commit -m "feat(sermon-chat): add embedSermons action + Voyage embedding helper"
```

---

## Task 3: sermonChat 액션 — 검색 + 근거 기반 답변

**Files:**
- Modify: `supabase/functions/api/index.ts` (액션 함수 추가; switch 케이스는 Task 2 Step 3에서 이미 추가)

**Interfaces:**
- Consumes: Task 2의 `embedVoyage`. Task 1의 `match_sermon_chunks` RPC.
- Produces: 액션 `sermonChat` — body `{ pw, message }`, 반환 `{ ok, answer, sources: [{ title, svc_date, scripture, youtube_id }] }` 또는 `{ ok: true, answer: "그 주제로 하신 설교를 찾지 못했습니다.", sources: [] }`.

- [ ] **Step 1: sermonChat 액션 함수 추가**

Task 2에서 추가한 `embedSermons` 함수 아래에 추가:

```ts
// ---------- sermonChat: 설교 아카이브 검색 + 근거 기반 답변 (관리자) ----------
// body: { pw, message }
async function sermonChat(b: any) {
  const err = adminError(b); if (err) return { ok: false, error: err };
  const message = (b.message ?? "").toString().trim();
  if (!message) return { ok: false, error: "message-required" };
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return { ok: false, error: "ANTHROPIC_API_KEY 시크릿 미설정" };

  // 1) 질문 임베딩 → 벡터 검색
  const [qvec] = await embedVoyage([message], "query");
  const { data: matches, error } = await db.rpc("match_sermon_chunks", {
    query_embedding: qvec,
    match_count: 5,
  });
  if (error) throw error;

  // 2) 유사도 임계값 미만이면 창작 대신 솔직히 없다고 답한다.
  const hits = (matches ?? []).filter((m: any) => m.similarity >= 0.4);
  if (!hits.length) {
    return { ok: true, answer: "그 주제로 하신 설교를 찾지 못했습니다.", sources: [] };
  }

  // 3) 검색된 발췌를 컨텍스트로 Claude 호출(근거 기반, 창작 금지).
  const context = hits.map((m: any, i: number) =>
    `[발췌 ${i + 1}] ${m.title} (${m.svc_date ?? "날짜미상"} · ${m.scripture ?? ""})\n${m.content}`
  ).join("\n\n");
  const system = [
    "너는 고척교회 설교 아카이브 검색 도우미다. 차동혁 목사님의 설교를 교인이 찾을 수 있게 돕는다.",
    "아래 '설교 발췌'에 담긴 내용만 근거로 답하라. 발췌에 없는 내용을 지어내지 말고, 목사님이 하지 않은 새로운 주장을 창작하지 말라.",
    "너 자신이 목사인 것처럼 설교하지 말라 — 어디까지나 '목사님이 이렇게 말씀하셨습니다'라고 안내하는 도우미다.",
    "출처를 반드시 밝혀라: \"차동혁 목사님은 [날짜] '[제목]' 설교에서 이렇게 말씀하셨습니다\" 형태.",
    "발췌만으로 답하기 어려우면 솔직히 '해당 내용을 설교에서 충분히 찾지 못했습니다'라고 말하라.",
    "한국어로, 2~4문단 이내로 따뜻하고 담백하게 답하라.",
  ].join("\n");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: Deno.env.get("SERMON_CHAT_MODEL") || "claude-opus-4-8",
      max_tokens: 1200,
      system,
      messages: [{ role: "user", content: `질문: ${message}\n\n[설교 발췌]\n${context}` }],
    }),
  });
  if (!res.ok) return { ok: false, error: `anthropic-${res.status}: ${(await res.text()).slice(0, 300)}` };
  const d = await res.json();
  const answer = ((d.content ?? []).find((x: any) => x.type === "text")?.text ?? "").trim();

  // 4) 출처는 중복 설교를 합쳐 반환(같은 설교의 여러 청크가 잡힐 수 있음).
  const seen = new Set<string>();
  const sources = hits.filter((m: any) => {
    if (seen.has(m.sermon_id)) return false;
    seen.add(m.sermon_id); return true;
  }).map((m: any) => ({
    title: m.title, svc_date: m.svc_date, scripture: m.scripture, youtube_id: m.youtube_id,
  }));

  return { ok: true, answer, sources };
}
```

- [ ] **Step 2: (Task 2에서 주석 처리했다면) switch의 sermonChat 줄 주석 해제 후 배포**

Run:
```bash
supabase functions deploy api --no-verify-jwt --project-ref xnomlgydifiqiybervtf
```
Expected: `Deployed Functions on project xnomlgydifiqiybervtf: api`.

- [ ] **Step 3: 질의 검증 — 자료가 있는 질문 (실제 호출)**

Run (`<ADMIN_SECRET>` 치환):
```bash
curl -s -X POST "https://xnomlgydifiqiybervtf.supabase.co/functions/v1/api" \
  -H "Content-Type: application/json" \
  -H "apikey: sb_publishable_oLtieT_jw7Gjb8etEsy0jw_thBaDjl-" \
  -H "Authorization: Bearer sb_publishable_oLtieT_jw7Gjb8etEsy0jw_thBaDjl-" \
  -d '{"action":"sermonChat","pw":"<ADMIN_SECRET>","message":"일터에서 어떻게 신앙생활을 해야 하나요?"}'
```
Expected: `{"ok":true,"answer":"차동혁 목사님은 2026-07-19 '주 안에서, 주께 하듯' 설교에서…","sources":[{"title":"주 안에서, 주께 하듯","youtube_id":"SqMbhfxvLDc",...}]}` 형태. answer가 출처를 밝히고, 발췌 범위를 벗어난 창작이 없는지 육안 확인.

- [ ] **Step 4: 질의 검증 — 자료가 없는 질문 (환각 방지 확인)**

Run:
```bash
curl -s -X POST "https://xnomlgydifiqiybervtf.supabase.co/functions/v1/api" \
  -H "Content-Type: application/json" \
  -H "apikey: sb_publishable_oLtieT_jw7Gjb8etEsy0jw_thBaDjl-" \
  -H "Authorization: Bearer sb_publishable_oLtieT_jw7Gjb8etEsy0jw_thBaDjl-" \
  -d '{"action":"sermonChat","pw":"<ADMIN_SECRET>","message":"양자역학의 불확정성 원리를 설명해줘"}'
```
Expected: `{"ok":true,"answer":"그 주제로 하신 설교를 찾지 못했습니다.","sources":[]}` — 관련 설교가 없으면 창작하지 않고 없다고 답하는지 확인.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/api/index.ts
git commit -m "feat(sermon-chat): add sermonChat grounded-answer action"
```

---

## Task 4: 관리자 프론트엔드 — 챗봇 페이지 + 허브 진입점

**Files:**
- Create: `admin-sermon-chat.html`
- Modify: `admin.html` (`TOOLS` 배열, 라인 ~74 아래에 항목 추가)

**Interfaces:**
- Consumes: `api` 액션 `authCheck`, `embedSermons`, `sermonChat`(필드 `pw`).

- [ ] **Step 1: admin.html TOOLS 배열에 항목 추가**

`admin.html`의 `말씀 아카이브 관리` 항목(라인 74) 바로 아래에 추가:

```js
    { ic:"🔎", title:"설교 물어보기(베타)", desc:"설교 아카이브를 AI로 검색·질의 · 색인 관리", href:"admin-sermon-chat.html" },
```

- [ ] **Step 2: admin-sermon-chat.html 작성**

`admin-sermon-chat.html`:

```html
<!doctype html>
<html lang="ko">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>설교 물어보기 (베타)</title>
<style>
  :root { --navy:#1a3a6b; --gold:#a67c12; --line:#e2ded2; --ink:#17223a; --mute:#7c8598; }
  * { box-sizing:border-box; }
  body { margin:0; font-family:system-ui,"Malgun Gothic",sans-serif; background:#f4f2ec; color:var(--ink); }
  header { background:var(--navy); color:#fff; padding:14px 18px; display:flex; align-items:center; gap:12px; position:sticky; top:0; z-index:10; }
  header h1 { font-size:16px; margin:0; flex:1; }
  header a, header button { color:#fff; background:rgba(255,255,255,.12); border:1px solid rgba(255,255,255,.2); border-radius:8px; padding:6px 12px; font-size:13px; text-decoration:none; cursor:pointer; }
  main { max-width:720px; margin:0 auto; padding:16px; }
  .ask { display:flex; gap:8px; margin-bottom:14px; }
  .ask input { flex:1; padding:11px 14px; border:1px solid var(--line); border-radius:10px; font-size:15px; }
  .ask button { padding:11px 20px; background:var(--navy); color:#fff; border:0; border-radius:10px; font-weight:700; cursor:pointer; }
  .ask button:disabled { opacity:.6; cursor:default; }
  .answer { background:#fff; border:1px solid var(--line); border-radius:12px; padding:16px 18px; font-size:15px; line-height:1.75; white-space:pre-wrap; }
  .sources { margin-top:14px; }
  .src { display:block; background:#eef4ff; border:1px solid #cfe0f7; border-radius:10px; padding:10px 12px; margin-bottom:8px; text-decoration:none; color:var(--navy); font-size:14px; }
  .src .yt { color:#c0392b; font-weight:700; }
  .src .meta { color:var(--mute); font-size:12px; font-family:ui-monospace,monospace; }
  .disclaimer { margin-top:16px; font-size:12px; color:var(--mute); line-height:1.6; }
  .empty { color:var(--mute); text-align:center; padding:40px 0; }
  .login { max-width:320px; margin:60px auto; text-align:center; }
  .login input { width:100%; padding:11px; border:1px solid var(--line); border-radius:8px; margin:10px 0; }
  .login button { width:100%; padding:11px; background:var(--navy); color:#fff; border:0; border-radius:8px; font-weight:700; cursor:pointer; }
  .toast { position:fixed; bottom:20px; left:50%; transform:translateX(-50%); background:#222; color:#fff; padding:10px 18px; border-radius:20px; font-size:13px; opacity:0; transition:opacity .3s; pointer-events:none; }
  .toast.show { opacity:1; }
</style>
</head>
<body>
<div id="app"></div>
<div class="toast" id="toast"></div>
<script>
const FN = "https://xnomlgydifiqiybervtf.supabase.co/functions/v1/api";
const KEY = "sb_publishable_oLtieT_jw7Gjb8etEsy0jw_thBaDjl-";
let pw = sessionStorage.getItem("admin-pw") || "";
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s==null?"":s).replace(/[&<>"]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

async function call(action, body={}) {
  const r = await fetch(FN, { method:"POST", headers:{ "Content-Type":"application/json", apikey:KEY, Authorization:"Bearer "+KEY },
    body: JSON.stringify({ action, pw, ...body }) });
  return r.json();
}
function toast(m){ const t=$("toast"); t.textContent=m; t.classList.add("show"); setTimeout(()=>t.classList.remove("show"),1800); }

function renderLogin(msg){
  $("app").innerHTML = `<div class="login"><h2>설교 물어보기 (베타)</h2>
    ${msg?`<p style="color:#c0392b;font-size:13px">${msg}</p>`:""}
    <input id="pw" type="password" placeholder="관리자 비밀번호" />
    <button id="go">로그인</button></div>`;
  $("go").onclick = tryLogin;
  $("pw").onkeydown = (e)=>{ if(e.key==="Enter") tryLogin(); };
}
async function tryLogin(){
  pw = $("pw") ? $("pw").value : pw;
  const j = await call("authCheck");
  if(j.ok){ sessionStorage.setItem("admin-pw", pw); renderMain(); }
  else renderLogin("비밀번호가 틀렸어요.");
}
function renderMain(){
  $("app").innerHTML = `<header>
      <h1>🔎 설교 물어보기 (베타)</h1>
      <button id="reindex">🔄 색인 다시 만들기</button>
      <a href="admin.html">← 허브</a>
    </header>
    <main>
      <div class="ask">
        <input id="q" placeholder="예) 용서에 대해 목사님이 뭐라고 하셨나요?" />
        <button id="send">질문</button>
      </div>
      <div id="out"><div class="empty">궁금한 것을 물어보세요. 올해 설교에서 찾아 답해드립니다.</div></div>
    </main>`;
  $("send").onclick = ask;
  $("q").onkeydown = (e)=>{ if(e.key==="Enter") ask(); };
  $("reindex").onclick = reindex;
}
async function ask(){
  const message = $("q").value.trim();
  if(!message){ toast("질문을 입력하세요"); return; }
  const btn = $("send"); btn.disabled = true; btn.textContent = "찾는 중…";
  $("out").innerHTML = `<div class="empty">설교를 검색하고 있어요…</div>`;
  try {
    const j = await call("sermonChat", { message });
    if(!j.ok){ $("out").innerHTML = `<div class="empty">오류: ${esc(j.error||"")}</div>`; return; }
    const srcHtml = (j.sources||[]).map(s => `
      <a class="src" href="https://youtube.com/watch?v=${esc(s.youtube_id)}" target="_blank" rel="noopener">
        <span class="yt">📺 ${esc(s.title)}</span>
        <span class="meta"> · ${esc(s.svc_date||"")} · ${esc(s.scripture||"")}</span>
      </a>`).join("");
    $("out").innerHTML = `
      <div class="answer">${esc(j.answer)}</div>
      ${srcHtml ? `<div class="sources">${srcHtml}</div>` : ""}
      <div class="disclaimer">※ 이 답변은 설교 아카이브를 검색한 AI 요약입니다. 정확한 내용은 원 설교를 확인하세요.</div>`;
  } finally {
    btn.disabled = false; btn.textContent = "질문";
  }
}
async function reindex(){
  if(!confirm("올해 설교 전체를 다시 색인할까요? (1~2분 소요)")) return;
  const btn = $("reindex"); btn.disabled = true; btn.textContent = "색인 중…";
  try {
    const j = await call("embedSermons");
    toast(j.ok ? `✅ 색인 완료: 설교 ${j.sermons}편 · 청크 ${j.chunks}개` : "실패: "+(j.error||""));
  } finally {
    btn.disabled = false; btn.textContent = "🔄 색인 다시 만들기";
  }
}
// 허브에서 넘어오면 자동 로그인
if(pw) tryLogin(); else renderLogin();
</script>
</body>
</html>
```

- [ ] **Step 3: 배포 (git push → GitHub Actions)**

Run:
```bash
git add admin.html admin-sermon-chat.html
git commit -m "feat(sermon-chat): add admin chatbot page and hub entry"
git push
```
Expected: push 성공, GitHub Actions가 GitHub Pages로 배포.

- [ ] **Step 4: 브라우저 검증 (실제 화면)**

1. `https://gocheok.onlybible.kr/admin.html` 접속 → 관리자 비번 로그인 → 허브에 "🔎 설교 물어보기(베타)" 카드가 보이는지 확인.
2. 카드 클릭 → `admin-sermon-chat.html`로 이동, 자동 로그인되는지 확인.
3. "용서에 대해 목사님이 뭐라고 하셨나요?" 질문 → 답변 + 출처(유튜브 링크) + 하단 안내문이 나오는지 확인.
4. 출처의 📺 링크 클릭 → 해당 설교 유튜브로 연결되는지 확인.

- [ ] **Step 5: (Step 1~2가 별도 커밋이 아니면 생략) 최종 커밋**

Step 3에서 이미 커밋·푸시 완료.

---

## Self-Review

**Spec coverage:**
- A안(gocheok api 함수 자체 구현) → Task 2·3. ✅
- 근거 기반 요약 + 출처 명시 + 창작 금지 → Task 3 Step 1 system 프롬프트 + Step 3·4 검증. ✅
- 유튜브 링크 → Task 3(sources.youtube_id) + Task 4(src 링크). ✅
- 관리자 메뉴/ADMIN_SECRET 게이트 → Task 4(admin.html TOOLS) + 모든 액션 `adminError`. ✅
- 올해 39개 임베딩(summary+points+daily_meditations) → Task 2 `chunkSermon`+`embedSermons`. ✅
- 신규 테이블/RPC만, 기존 테이블 불변 → Task 1(sermon_chunks만). ✅
- VOYAGE_API_KEY 추가 → Task 2 Step 4. ✅
- 답변 형식(출처+링크+안내문) → Task 4 Step 2. ✅
- 자료 없을 때 솔직히 답 → Task 3 Step 1(임계값) + Step 4 검증. ✅
- 제외 항목(교인 노출/작년 이전/대화 이력) → 계획에 미포함(YAGNI 준수). ✅

**Placeholder scan:** 모든 코드 스텝에 실제 코드 포함, 검증은 실제 curl/SQL/브라우저. `<ADMIN_SECRET>`·`<myfavorite .env.local의 값>`은 실행자가 실제 비밀로 치환해야 하는 자리로 명시. 플레이스홀더 아님. ✅

**Type consistency:** `embedVoyage(texts, inputType)`는 Task 2 정의 → Task 3 재사용(동일 시그니처). `match_sermon_chunks` 반환 컬럼(id, sermon_id, content, title, svc_date, scripture, youtube_id, similarity)이 Task 1 RPC ↔ Task 3 `hits` 사용과 일치. `sources` 필드(title, svc_date, scripture, youtube_id)가 Task 3 반환 ↔ Task 4 렌더링과 일치. ✅
