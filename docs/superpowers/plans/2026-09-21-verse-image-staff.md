# 설교·찬양 담당자 — 말씀 연상 그림 만들기 · 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 담당자가 「설교·찬양 관리 → ③ 연상 그림」에서 구절을 고르고, AI 가 제안한 우리말 장면으로 Gemini 그림을 만들어 눈으로 검수한 뒤 저장하면, 성도님 앱의 🖼️ 탭에 **배포 없이** 바로 뜬다.

**Architecture:** `api` 함수에 액션 여섯(`verseImg*`)과 `getVerses` 의 `images` 칸을 더한다. 장면 제안·우리말→영어·그림 설명은 Claude, 그림은 Gemini `gemini-3-pro-image`. 생성 결과는 화면으로만 가고, 담당자가 「쓰기」를 누르면 브라우저가 1080px WebP 로 줄여 Supabase 저장소 `verse-img` 와 표 `verse_images` 에 저장한다. 앱(`app.js`)은 DB 그림이 있으면 그것, 없으면 옛 `img/verse/`.

**Tech Stack:** Supabase Edge Function(Deno) · Postgres · Supabase Storage · Anthropic Messages API(json_schema 출력 · 그림 입력) · Google Gemini `generateContent`(이미지) · Vanilla JS(admin-stats.html · app.js) · Canvas `toBlob`

**설계서:** `docs/superpowers/specs/2026-09-21-verse-image-staff-design.md`

## Global Constraints

- 🔒 **키는 어떤 파일·커밋·메모리·로그에도 적지 않는다.** Gemini 키는 Supabase 시크릿 `GEMINI_API_KEY` 에만(친구가 넣거나, 친구 허락 뒤 `supabase secrets set` — 값을 명령줄에 찍지 않는 길로).
- 🚦 설교 올리기와 같이: **Phase A 는 개발 DB 에만**, 운영 반영은 2026-09-27 안드로이드 심사 뒤(설교 올리기 Task 15 와 함께).
- 🌳 작업 폴더 **`C:\Projects\bm-sermon-staff`**(가지 `feat/sermon-staff`)에서만. 본 체크아웃(`C:\Projects\bible-memorize-church-app-v2`)은 건드리지 않는다.
- 커밋은 `git commit -m "…" -- <경로들>` · 끝줄 `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` · `bump.py` 는 Phase B 에서만.
- ⚠️ **화풍 문구는 `img/verse/암송말씀_그림_만들기.md` 2장을 글자 그대로**(Task 2 에 옮겨 둔 것 그대로 — 고치지 않는다).
- 새 액션은 모두 **`contentError`**(설교·찬양 담당자 또는 관리자). 응답에 `user_id` 없음. 새 표는 그 자리에서 RLS + `revoke`.
- 한 구절 하루(24시간) **15장** · 저장 파일 **500KB** 까지 · WebP(`RIFF…WEBP`) 또는 JPEG(`FF D8 FF`)만 · 그림 설명은 **필수**(1~80자).
- 칸: `a` = 대표(수채·먹선), `b` = 짝 넓은 장면(구아슈), `c` = 짝 가까이(구아슈). 짝 설명은 **「구아슈·색연필 화풍 — 」**로 시작(기존 관례).
- 화면 표준 v1 — 주 동작 48px(`.push-send`) · 보조 44px(`.push-btn.ghost`) · 제목 줄 `.rep-head.mn-top` · `mnNote`/`mnDialog` · 화면마다 `window.scrollTo(0,0)`.
- ⚠️ `getVerses` 는 **표가 없는 DB 에서도 살아야 한다**(성도님 앱의 본진) — 그림 조회가 실패하면 그림 없이 돌려준다.

## 파일 지도

| 파일 | 할 일 |
|---|---|
| `supabase/verse_images.sql` | **새로** — 표 둘 + 저장소 칸 `verse-img` |
| `supabase/functions/api/index.ts` | 연상 그림 덩이(파일 끝) · 라우터 6줄 · `getVerses` 에 `images` |
| `tests/sermon-staff-smoke.py` | 연상 그림 권한·검사 줄 더하기 |
| `admin-stats.html` | ③ 메뉴 카드 · ② 끝 단추 · `renderVerseImages` 화면 |
| `app.js` | 🖼️ 탭이 DB 그림을 먼저 |

---

### Task 1: 표와 저장소 칸

**Files:** Create `supabase/verse_images.sql`

**Interfaces:** Produces 표 `verse_images`, `verse_image_gens`, 저장소 칸 `verse-img`(공개 읽기).

- [ ] **Step 1: SQL 을 쓴다**

```sql
-- 말씀 연상 그림(설교·찬양 담당자 · 2026-09-21)
-- 설계: docs/superpowers/specs/2026-09-21-verse-image-staff-design.md 4장
-- ⚠️ 개발(ktpwthwqzgcqcrmsafdo) 먼저. 운영(xnomlgydifiqiybervtf)은 2026-09-27 안드로이드 심사가 끝난 뒤.
-- 새 표에 새 액션만 얹는다 — 표가 먼저, 함수가 나중. (getVerses 는 표가 없어도 살아남게 짰다)

-- 1) 저장한 그림 — 구절 × 칸(a 대표 · b 넓은 · c 가까운) 하나씩
create table if not exists public.verse_images (
  verse_no    int  not null,
  slot        text not null check (slot in ('a','b','c')),
  path        text not null,               -- 저장소 verse-img 안의 이름(바꿀 때마다 새 이름)
  alt         text not null,               -- 그림 설명 = alt(낭독기가 읽는다) — 실제 그림을 보고 적은 것
  scene_ko    text,                        -- 담당자가 고른 우리말 장면
  scene_en    text,                        -- 서버가 만든 영어 한 줄(프롬프트 기록 — 옛 prompts.md 대신)
  hidden      boolean not null default false,   -- 「내리기」
  created_by  text,                        -- 「소속 이름」 보이기용 — user_id 아님
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (verse_no, slot)
);
alter table public.verse_images enable row level security;
revoke all on public.verse_images from anon, authenticated;

-- 2) 뽑은 기록 — 한 구절 하루 15장을 센다(성공한 것만)
create table if not exists public.verse_image_gens (
  id          bigint generated always as identity primary key,
  verse_no    int  not null,
  slot        text not null,
  created_by  text,
  created_at  timestamptz not null default now()
);
create index if not exists verse_image_gens_verse_idx on public.verse_image_gens (verse_no, created_at desc);
alter table public.verse_image_gens enable row level security;
revoke all on public.verse_image_gens from anon, authenticated;

-- 3) 그림 통 — 읽기는 공개, 쓰기는 서버(service_role)만(board_images.sql 과 같은 방식)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('verse-img', 'verse-img', true, 524288, array['image/webp','image/jpeg'])
on conflict (id) do update
   set public = true, file_size_limit = 524288, allowed_mime_types = array['image/webp','image/jpeg'];

-- 4) 확인
select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'verse-img';
```

- [ ] **Step 2: 친구에게** — 개발 SQL Editor 에서 실행. 확인: 공개 키로 `GET /rest/v1/verse_images?select=*&limit=1` → `42501`(잠김).
- [ ] **Step 3: 커밋** — `git add -- supabase/verse_images.sql && git commit -m "feat(연상 그림): 표 verse_images·verse_image_gens · 저장소 칸 verse-img …" -- supabase/verse_images.sql`

---

### Task 2: `api` — 연상 그림 액션 여섯과 `getVerses` 의 그림

**Files:** Modify `supabase/functions/api/index.ts` — 파일 끝에 덩이, 라우터(`case "staffVerseSave"` 아래)에 6줄, `getVerses` 안.

**Interfaces:**
- Consumes: `contentError`, `adminError`, `staffLabel`, `norm`, `db`(설교 올리기 Task 2·3)
- Produces(화면이 쓰는 꼴 — 이름 그대로):
  - `verseImgList {pw,staff}` → `{ok, images:[{verseNo,slot,url,alt,hidden,updatedAt}], used:{[verseNo]:n}, daily:15}`
  - `verseImgScenes {pw,staff,verseNo}` → `{ok, scenes:[string,string,string]}` / `ai`·`no-verse`
  - `verseImgGenerate {pw,staff,verseNo,slot,sceneKo}` → `{ok, image(base64), mime, sceneEn, left}` / `limit`·`no-image`·`gen`·`ai`·`no-key`·`bad-scene`·`bad-slot`·`no-verse`
  - `verseImgAlt {pw,staff,verseNo,slot,image,mime}` → `{ok, alt}` / `ai`·`bad-file`
  - `verseImgSave {pw,staff,verseNo,slot,image,mime,alt,sceneKo,sceneEn}` → `{ok, url}` / `bad-file`·`too-big`·`no-alt`·`bad-slot`·`no-verse`·`save`
  - `verseImgHide {pw,staff,verseNo,slot,hidden}` → `{ok}` / `not-found`
  - `getVerses` 의 구절에 `images:[{slot,url,alt}]`(숨김 제외 · `a` 가 있을 때만 · a→b→c)
  - 시크릿: `GEMINI_API_KEY`(필수) · `VERSE_IMG_MODEL`(없으면 `gemini-3-pro-image`) · `VERSE_IMG_SIZE`(없으면 `1K`) · `SCENE_MODEL`(없으면 `claude-sonnet-5`)

- [ ] **Step 1: 파일 끝에 덩이**

```ts
// ============================================================
// 말씀 연상 그림 — 설교·찬양 담당자(2026-09-21)
//   설계: docs/superpowers/specs/2026-09-21-verse-image-staff-design.md
//   화면(③ 연상 그림) → 장면(Claude) → 그림(Gemini) → 브라우저가 줄인 것을 저장. 앱은 getVerses 의 images 로 받는다.
//   ⚠️ 쓰지 않은 그림은 어디에도 저장하지 않는다 — 생성 결과는 화면으로만 간다.
// ============================================================
const VIMG_BUCKET = "verse-img";
const VIMG_SLOTS = ["a", "b", "c"];
const VIMG_DAILY = 15;
const VIMG_MAX_BYTES = 500_000;
const vimgModel = () => Deno.env.get("VERSE_IMG_MODEL") || "gemini-3-pro-image";
const vimgSize = () => Deno.env.get("VERSE_IMG_SIZE") || "1K";
const sceneModel = () => Deno.env.get("SCENE_MODEL") || "claude-sonnet-5";
const vimgUrl = (p: string) => db.storage.from(VIMG_BUCKET).getPublicUrl(p).data.publicUrl;

// ⚠️ 화풍 문구 — img/verse/암송말씀_그림_만들기.md 2장을 **글자 그대로** 옮겼다. 한 글자도 바꾸지 말 것
//    (이미 들어간 116장과 「같은 책의 그림」으로 보여야 한다). 안내서를 고치면 여기도 함께.
const VIMG_STYLE_A = [
  "Soft watercolor painting with delicate ink linework, warm muted earth tones,",
  "cream paper background, generous white space, gentle and reverent mood.",
  "The illustration is painted directly onto the plain cream page with no border,",
  "no frame, no rectangle outline, no card, no drop shadow around the edges —",
  "the subject and background fade softly and irregularly into the bare cream",
  "paper at the edges, never a straight or hard edge, never a boxy or",
  "rounded-rectangle silhouette.",
  "This is a single subject resting in open space, not a page inside another",
  "book, not on a stand or easel — no easel, no book, no sketchbook, no spiral",
  "binding, no book spine, no page curl.",
  "This is a flat digital illustration viewed straight-on, not a photograph of a",
  "physical painting — no photographed paper sheet, no visible paper corners or",
  "torn edges, no tilted or angled page, no tabletop or surface visible beyond",
  "the illustration.",
  "No people, no human figures, no buildings, no text, no lettering,",
  "no letters or writing of any kind, no signature, no watermark, no monogram.",
].join("\n");
const VIMG_STYLE_BC = [
  "Soft gouache and colored pencil illustration, rich saturated warm tones,",
  "visible pencil grain and soft matte texture, slightly more solid and",
  "painterly than watercolor, cream paper background, generous white space,",
  "gentle and reverent mood. The illustration is painted directly onto the",
  "plain cream page with no border, no frame, no rectangle outline, no card,",
  "no drop shadow around the edges — the subject and background fade softly",
  "and irregularly into the bare cream paper at the edges, never a straight",
  "or hard edge, never a boxy or rounded-rectangle silhouette.",
  "This is a single subject resting in open space, not a page inside another",
  "book, not on a stand or easel — no easel, no book, no sketchbook, no spiral",
  "binding, no book spine, no page curl.",
  "This is a flat digital illustration viewed straight-on, not a photograph of a",
  "physical painting — no photographed paper sheet, no visible paper corners or",
  "torn edges, no tilted or angled page, no tabletop or surface visible beyond",
  "the illustration.",
  "No people, no human figures, no buildings, no text, no lettering,",
  "no letters or writing of any kind, no signature, no watermark, no monogram.",
].join("\n");
const VIMG_TAIL: Record<string, string> = {
  a: "", b: " Wide open scene with distant space around it.", c: " Close-up view of the subject filling the frame.",
};
const vimgPrompt = (sceneEn: string, slot: string) =>
  `${sceneEn}${VIMG_TAIL[slot]}\n\n${slot === "a" ? VIMG_STYLE_A : VIMG_STYLE_BC}`;

// 장면을 짓는 규칙 — 안내서 3장(한 가지 · 빛으로 맺기 · 뜻이 아니라 사물 · 사람은 흔적으로)
const VIMG_SCENE_RULES = [
  "당신은 교회 성경 암송 앱의 삽화가입니다. 구절을 읽고 떠오르는 **한 장면**을 짓습니다.",
  "- 한 가지 사물이나 풍경만 담습니다(여러 장면을 섞지 않기).",
  "- 뜻을 그리지 말고 사물을 그립니다(「말씀이 등불」 → 등불).",
  "- 빛으로 분위기를 맺습니다(새벽, 따스한 오후 빛, 달빛 등).",
  "- 사람은 그리지 않습니다. 사람이 나오는 구절은 그 일의 흔적으로 바꿉니다(「손에 든 다림줄」 → 줄에 매달려 멈춘 추와 발치의 주춧돌).",
  "- 글자·책 속 글씨·두루마리 위 글씨, 다른 종교의 상징, 건물은 넣지 않습니다.",
  "예) 시 119:105 → 밤 돌길 위, 몇 걸음 앞만 비추는 작은 등불 / 창 12:2 → 새벽 언덕 위 홀로 가지를 넓게 펼친 올리브나무",
].join("\n");

async function vimgClaude(system: string, content: unknown, schema: unknown, maxTokens = 400): Promise<any | null> {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({
        model: sceneModel(), max_tokens: maxTokens, system,
        output_config: { format: { type: "json_schema", schema } },
        messages: [{ role: "user", content }],
      }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) return null;
    const d = await res.json();
    return JSON.parse((d.content ?? []).find((x: any) => x.type === "text")?.text ?? "null");
  } catch { return null; }
}

async function vimgVerse(no: number) {
  const { data: v, error } = await db.from("verses").select("no,ref_short,ref,text").eq("no", no).maybeSingle();
  if (error) throw error;
  if (!v) return null;
  // 이어진 설교가 있으면 한 줄 요약도 장면의 실마리로(없어도 된다)
  const { data: s } = await db.from("sermons").select("summary")
    .eq("mem_verse_no", no).order("svc_date", { ascending: false }).limit(1).maybeSingle();
  return { no: v.no, ref: v.ref_short || v.ref || "", text: v.text || "", summary: (s as any)?.summary || "" };
}

async function vimgUsedToday(no: number): Promise<number> {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count, error } = await db.from("verse_image_gens").select("id", { count: "exact", head: true })
    .eq("verse_no", no).gte("created_at", since);
  if (error) throw error;
  return count ?? 0;
}

// 파일 앞머리 — 확장자가 아니라 내용으로 본다
function vimgKind(bytes: Uint8Array): "webp" | "jpg" | null {
  const s = (a: number, b: number) => String.fromCharCode(...bytes.slice(a, b));
  if (bytes.length > 12 && s(0, 4) === "RIFF" && s(8, 12) === "WEBP") return "webp";
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  return null;
}
function vimgDecode(raw: unknown): Uint8Array | null {
  try {
    const s = String(raw ?? "");
    const b64 = s.includes(",") ? s.slice(s.indexOf(",") + 1) : s;
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch { return null; }
}

// getVerses 가 부른다 — 숨김 제외, 대표(a)가 있는 구절만, a→b→c
async function vimgPublicMap(): Promise<Map<number, { slot: string; url: string; alt: string }[]>> {
  const { data, error } = await db.from("verse_images").select("verse_no,slot,path,alt").eq("hidden", false);
  if (error) throw error;
  const by = new Map<number, any[]>();
  for (const r of (data ?? []) as any[]) {
    if (!by.has(r.verse_no)) by.set(r.verse_no, []);
    by.get(r.verse_no)!.push({ slot: r.slot, url: vimgUrl(r.path), alt: r.alt });
  }
  const out = new Map<number, { slot: string; url: string; alt: string }[]>();
  for (const [no, list] of by) {
    if (!list.some((x) => x.slot === "a")) continue;
    out.set(no, list.sort((x, y) => VIMG_SLOTS.indexOf(x.slot) - VIMG_SLOTS.indexOf(y.slot)));
  }
  return out;
}

async function verseImgList(b: any) {
  const err = await contentError(b); if (err) return { ok: false, error: err };
  const { data, error } = await db.from("verse_images")
    .select("verse_no,slot,path,alt,hidden,updated_at").order("verse_no", { ascending: false });
  if (error) throw error;
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: g, error: e2 } = await db.from("verse_image_gens").select("verse_no").gte("created_at", since);
  if (e2) throw e2;
  const used: Record<string, number> = {};
  for (const r of (g ?? []) as any[]) used[r.verse_no] = (used[r.verse_no] || 0) + 1;
  return {
    ok: true, daily: VIMG_DAILY, used,
    images: (data ?? []).map((r: any) => ({
      verseNo: r.verse_no, slot: r.slot, url: vimgUrl(r.path), alt: r.alt, hidden: !!r.hidden, updatedAt: r.updated_at,
    })),
  };
}

async function verseImgScenes(b: any) {
  const err = await contentError(b); if (err) return { ok: false, error: err };
  const v = await vimgVerse(Number(b.verseNo));
  if (!v) return { ok: false, error: "no-verse" };
  const out = await vimgClaude(VIMG_SCENE_RULES + "\n세 가지 장면을 서로 다른 사물로 짓고, 각각 우리말 한 문장(20~60자)으로 씁니다.",
    `[구절] ${v.ref}\n${v.text}${v.summary ? `\n[그 주 설교 한 줄] ${v.summary}` : ""}`,
    { type: "object", additionalProperties: false, required: ["scenes"],
      properties: { scenes: { type: "array", items: { type: "string" } } } }, 600);
  const scenes = (out?.scenes ?? []).map((x: unknown) => norm(x).normalize("NFC")).filter((x: string) => x.length >= 5 && x.length <= 120).slice(0, 3);
  if (scenes.length < 3) return { ok: false, error: "ai" };
  return { ok: true, scenes };
}

async function verseImgGenerate(b: any) {
  const err = await contentError(b); if (err) return { ok: false, error: err };
  const no = Number(b.verseNo), slot = String(b.slot || "");
  if (!VIMG_SLOTS.includes(slot)) return { ok: false, error: "bad-slot" };
  const sceneKo = norm(b.sceneKo).normalize("NFC");
  if (sceneKo.length < 2 || sceneKo.length > 300) return { ok: false, error: "bad-scene" };
  const v = await vimgVerse(no);
  if (!v) return { ok: false, error: "no-verse" };
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) return { ok: false, error: "no-key" };
  const used = await vimgUsedToday(no);
  if (used >= VIMG_DAILY) return { ok: false, error: "limit" };
  // 우리말 장면 → 영어 한 줄. ⚠️ 한 줄·300자로 잘라 넣는다 — 화풍 문구를 흔들 수 없게
  const tr = await vimgClaude(VIMG_SCENE_RULES + "\nTranslate the given Korean scene into ONE English sentence for an illustration prompt. " +
    "Start with 'A single' or 'A quiet' when natural, end with the light (e.g. 'at dawn'). No people, no text. Output only that sentence.",
    `[구절] ${v.ref} ${v.text}\n[장면] ${sceneKo}`,
    { type: "object", additionalProperties: false, required: ["en"], properties: { en: { type: "string" } } }, 200);
  const sceneEn = String(tr?.en ?? "").replace(/[\r\n"`]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);
  if (sceneEn.length < 10) return { ok: false, error: "ai" };
  let res: Response;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${vimgModel()}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: vimgPrompt(sceneEn, slot) }] }],
        generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "4:3", imageSize: vimgSize() } },
      }),
      signal: AbortSignal.timeout(110000),   // 함수 한도 150초 안에서 끊는다
    });
  } catch { return { ok: false, error: "gen" }; }
  if (!res.ok) return { ok: false, error: "gen", detail: `Gemini ${res.status}: ${(await res.text()).slice(0, 160)}` };
  const d = await res.json().catch(() => null);
  const parts = d?.candidates?.[0]?.content?.parts ?? [];
  const img = parts.find((p: any) => p.inlineData?.data)?.inlineData;
  if (!img) return { ok: false, error: "no-image", detail: String(d?.candidates?.[0]?.finishReason ?? d?.promptFeedback?.blockReason ?? "") };
  const { error: e2 } = await db.from("verse_image_gens").insert({ verse_no: no, slot, created_by: staffLabel(b) });
  if (e2) throw e2;
  return { ok: true, image: img.data, mime: img.mimeType || "image/png", sceneEn, left: VIMG_DAILY - used - 1 };
}

async function verseImgAlt(b: any) {
  const err = await contentError(b); if (err) return { ok: false, error: err };
  const mime = String(b.mime || "");
  const bytes = vimgDecode(b.image);
  if (!bytes || !vimgKind(bytes) || !["image/webp", "image/jpeg"].includes(mime) || bytes.length > VIMG_MAX_BYTES) return { ok: false, error: "bad-file" };
  const raw = String(b.image); const data = raw.includes(",") ? raw.slice(raw.indexOf(",") + 1) : raw;
  const out = await vimgClaude(
    "그림을 보고, 무엇이 보이는지 우리말 한 구절(15~40자)로 적습니다. 화면 낭독기가 읽는 설명입니다. " +
    "「그림」「수채화」 같은 말과 마침표 없이, 보이는 사물·빛·자리만. 보이지 않는 뜻을 보태지 않습니다.",
    [{ type: "image", source: { type: "base64", media_type: mime, data } }, { type: "text", text: "이 그림의 설명 한 구절" }],
    { type: "object", additionalProperties: false, required: ["alt"], properties: { alt: { type: "string" } } }, 200);
  const alt = norm(out?.alt).normalize("NFC").replace(/[.。]$/, "").slice(0, 80);
  if (alt.length < 4) return { ok: false, error: "ai" };
  return { ok: true, alt };
}

async function verseImgSave(b: any) {
  const err = await contentError(b); if (err) return { ok: false, error: err };
  const no = Number(b.verseNo), slot = String(b.slot || "");
  if (!VIMG_SLOTS.includes(slot)) return { ok: false, error: "bad-slot" };
  const alt = norm(b.alt).normalize("NFC");
  if (!alt || alt.length > 80) return { ok: false, error: "no-alt" };
  const bytes = vimgDecode(b.image);
  const kind = bytes ? vimgKind(bytes) : null;
  const mime = String(b.mime || "");
  if (!bytes || !kind || (kind === "webp" ? mime !== "image/webp" : mime !== "image/jpeg")) return { ok: false, error: "bad-file" };
  if (bytes.length > VIMG_MAX_BYTES) return { ok: false, error: "too-big" };
  const { data: v, error: e0 } = await db.from("verses").select("no").eq("no", no).maybeSingle();
  if (e0) throw e0;
  if (!v) return { ok: false, error: "no-verse" };
  // 바꿀 때마다 새 이름 — 캐시에 옛 그림이 남지 않게. 이름은 서버가 정한다
  const path = `${no}${slot === "a" ? "" : slot}-${Date.now()}.${kind}`;
  const { error: e1 } = await db.storage.from(VIMG_BUCKET).upload(path, bytes, { contentType: mime, upsert: false });
  if (e1) return { ok: false, error: "save", detail: e1.message };
  const { data: old, error: e2 } = await db.from("verse_images").select("path").eq("verse_no", no).eq("slot", slot).maybeSingle();
  if (e2) throw e2;
  const { error: e3 } = await db.from("verse_images").upsert({
    verse_no: no, slot, path, alt,
    scene_ko: norm(b.sceneKo).normalize("NFC").slice(0, 300) || null,
    scene_en: String(b.sceneEn ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, 300) || null,
    hidden: false, created_by: staffLabel(b), updated_at: new Date().toISOString(),
  }, { onConflict: "verse_no,slot" });
  if (e3) throw e3;
  if (old?.path && old.path !== path) await db.storage.from(VIMG_BUCKET).remove([old.path]).catch(() => {});   // 옛 파일 치우기 실패가 저장을 막지 않는다
  return { ok: true, url: vimgUrl(path) };
}

async function verseImgHide(b: any) {
  const err = await contentError(b); if (err) return { ok: false, error: err };
  const no = Number(b.verseNo), slot = String(b.slot || "");
  if (!VIMG_SLOTS.includes(slot)) return { ok: false, error: "bad-slot" };
  const { data, error } = await db.from("verse_images")
    .update({ hidden: !!b.hidden, updated_at: new Date().toISOString() })
    .eq("verse_no", no).eq("slot", slot).select("verse_no").maybeSingle();
  if (error) throw error;
  return data ? { ok: true } : { ok: false, error: "not-found" };
}
```

- [ ] **Step 2: 라우터** — `case "staffVerseSave"` 줄 아래에

```ts
      // ---- 말씀 연상 그림 — 설교·찬양 담당자(2026-09-21) ----
      case "verseImgList":     return json(await verseImgList(body));
      case "verseImgScenes":   return json(await verseImgScenes(body));
      case "verseImgGenerate": return json(await verseImgGenerate(body));
      case "verseImgAlt":      return json(await verseImgAlt(body));
      case "verseImgSave":     return json(await verseImgSave(body));
      case "verseImgHide":     return json(await verseImgHide(body));
```

- [ ] **Step 3: `getVerses` 에 그림** — `const verses = (data ?? []).map((v: any) => ({` 바로 위에:

```ts
  // 말씀 연상 그림(DB · 2026-09-21) — ⚠️ 표가 아직 없는 DB 에서도 살아남아야 한다(위 track 과 같은 까닭).
  //   그림 조회가 실패하면 그림 없이 돌려준다(말씀 목록은 성도님 앱의 본진이다).
  let imgMap = new Map<number, { slot: string; url: string; alt: string }[]>();
  try { imgMap = await vimgPublicMap(); } catch (e) { console.error("verse images:", (e as Error)?.message ?? e); }
```
그리고 map 안 마지막 칸(`url: v.sermon_url || "",`) 아래에:
```ts
    images: imgMap.get(v.no),          // 없으면 JSON 에서 빠진다 — 옛 앱은 이 칸을 모른 채 지나간다
```

- [ ] **Step 4: 문법** — `npx -y esbuild@0.24.0 supabase/functions/api/index.ts --log-level=warning > /dev/null` · 이름 중복 grep(`VIMG_|vimg|verseImg` 각 한 번씩 정의)
- [ ] **Step 5: 커밋** — `git commit -m "feat(api): 연상 그림 — 장면 제안·그림 만들기·설명·저장·내리기 · getVerses 에 images" -- supabase/functions/api/index.ts`

---

### Task 3: 개발 배포 · 스모크 · 그림 크기 재기

**Files:** Modify `tests/sermon-staff-smoke.py`

- [ ] **Step 1: 스모크에 더한다** — 파일의 `print("\n실패 %d" % fails)` 바로 위에

```python
print("[7] 연상 그림")
chk("verseImgList 담당자", call(dict(S, action="verseImgList")).get("ok"), True)
chk("verseImgList 틀린 암호", call({"action": "verseImgList", "pw": "wrong", "staff": ME}).get("error"), "unauthorized")
chk("칸 d", call(dict(S, action="verseImgGenerate", verseNo=1, slot="d", sceneKo="시험 장면")).get("error"), "bad-slot")
chk("빈 장면", call(dict(S, action="verseImgGenerate", verseNo=1, slot="a", sceneKo="")).get("error"), "bad-scene")
import base64
fake = base64.b64encode(b"not an image at all" * 10).decode()
chk("가짜 파일", call(dict(S, action="verseImgSave", verseNo=1, slot="a", image=fake, mime="image/webp", alt="시험")).get("error"), "bad-file")
big = base64.b64encode(b"RIFF\x00\x00\x00\x00WEBP" + b"\x00" * 600_000).decode()
chk("큰 파일", call(dict(S, action="verseImgSave", verseNo=1, slot="a", image=big, mime="image/webp", alt="시험")).get("error"), "too-big")
tiny = base64.b64encode(b"RIFF\x00\x00\x00\x00WEBPVP8 " + b"\x00" * 20).decode()
chk("빈 설명", call(dict(S, action="verseImgSave", verseNo=1, slot="a", image=tiny, mime="image/webp", alt="")).get("error"), "no-alt")
chk("없는 칸 내리기", call(dict(S, action="verseImgHide", verseNo=999, slot="a", hidden=True)).get("error"), "not-found")
chk("getVerses 는 그대로", call({"action": "getVerses"}).get("ok"), True)
```

- [ ] **Step 2: 친구** — 개발 시크릿 `GEMINI_API_KEY`. (친구 허락이 있으면 제어자가 `supabase secrets set --project-ref ktpwthwqzgcqcrmsafdo --env-file <임시 파일>` 로 — 값을 명령줄·화면에 찍지 않는다, 임시 파일은 곧바로 지운다.)
- [ ] **Step 3: 개발 배포** — `git status --short` 비었는지 → `supabase functions deploy api --no-verify-jwt --project-ref ktpwthwqzgcqcrmsafdo`
- [ ] **Step 4: 스모크** — `ADMIN_PW=… STAFF_PW=… python tests/sermon-staff-smoke.py` → `실패 0`
- [ ] **Step 5: 그림 크기 재기(1장 · 개발 1번 구절)** — 파이썬으로 `verseImgScenes` → 첫 장면으로 `verseImgGenerate slot=a` → 받은 base64 를 PNG 로 풀어 크기를 잰다(Pillow). **긴 변이 1080 보다 작으면** 개발 시크릿 `VERSE_IMG_SIZE=2K` 로 하고 다시 잰다. 결과(크기·걸린 초·바이트)를 진행 원장에 적는다. 그림 한 장은 제어자가 눈으로 본다(화풍·액자화).
- [ ] **Step 6: 커밋** — `git commit -m "test(연상 그림): 스모크 — 권한·칸·장면·가짜·큰 파일·빈 설명·내리기" -- tests/sermon-staff-smoke.py`

---

### Task 4: 화면 — ③ 연상 그림

**Files:** Modify `admin-stats.html` — `renderSermonMenu` 카드, `suShowResult`, CSS 덩이, 새 함수들(② 덩이 뒤)

**Interfaces:**
- Consumes: Task 2 액션 · `STAFF_MODE`·`getPw`·`getStaff`·`minAuthLost`·`callApi`·`mnDialog`·`mnNote`·`htmlEsc`·`plEsc`·`renderMenu`
- Produces: `renderVerseImages()` · 전역 `viPrefillNo` · `viShrink(b64, mime)`

- [ ] **Step 1: 메뉴 카드** — `renderSermonMenu` 의 ② 카드 줄 아래에
```js
      ${card("rep-verseimg", "③", "연상 그림", "그 주 암송구절의 그림 — 장면을 고르면 AI 가 그려요")}
```
연결 줄들 곁에: `document.getElementById("rep-verseimg").addEventListener("click", renderVerseImages);`

- [ ] **Step 2: ② 가 끝나면 ③ 으로** — `suShowResult` 의 맨 앞(첫 줄 `const box = …` 아래)에
```js
  // 연결된 구절이 있으면 ③ 연상 그림으로 이어 간다(그 구절 번호를 들고)
  const vno = suState && suState.verse ? suState.verse.no : null;
  if(vno){
    const go = document.createElement("button");
    go.className = "push-send"; go.textContent = "③ 연상 그림 만들기 →";
    go.addEventListener("click", ()=>{ clearInterval(suTimer); viPrefillNo = vno; renderVerseImages(); });
    box.after(go);
  }
```

- [ ] **Step 3: CSS** — Task 9 의 `/* ═══ 설교·찬양 관리 (2026-09-21)` 덩이 끝에
```css
.vi-slot{border:1px solid #dde3ee;border-radius:12px;background:#fff;padding:14px;margin:var(--gap) 0;}
.vi-slot h3{font-size:1rem;color:var(--navy);margin:0 0 8px;}
.vi-img{width:100%;max-width:640px;aspect-ratio:4/3;object-fit:contain;background:#fdf8f0;border-radius:10px;display:block;margin:8px 0;}
.vi-thumb{width:120px;aspect-ratio:4/3;object-fit:cover;border-radius:8px;flex:none;}
.vi-have{display:flex;gap:12px;align-items:center;font-size:14px;margin:6px 0;}
.vi-checks label{display:flex;align-items:center;gap:10px;min-height:var(--tap);font-size:14px;}
.vi-checks input{width:22px;height:22px;flex:none;}
.vi-scenes label{display:flex;align-items:flex-start;gap:10px;min-height:var(--tap);font-size:14px;padding:6px 0;}
.vi-acts{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;}
.vi-left{font-size:14px;color:#6b778c;}
```

- [ ] **Step 4: 화면 함수들** — ② 덩이(`async function suShowResult`) 뒤에

```js
// ---------- ③ 연상 그림 (2026-09-21) ----------
// 설계: docs/superpowers/specs/2026-09-21-verse-image-staff-design.md 3장
// ⚠️ 쓰지 않은 그림은 저장하지 않는다 — 「쓰기」 전의 그림은 이 화면의 메모리에만 있다.
const VI_SLOTS = [["a","대표 그림 (수채·먹선)"],["b","짝 — 넓은 장면 (구아슈·색연필)"],["c","짝 — 가까이 본 장면 (구아슈·색연필)"]];
const VI_CHECKS = ["글자·서명·낙관이 없다","사람(손·발·뒷모습 포함)이 없다","액자·카드처럼 네모나게 잘리지 않았다",
                   "종이를 찍은 사진처럼 보이지 않는다","이젤·스케치북·책이 없다","구절의 뜻과 맞다(다른 종교 상징이 없다)"];
const VI_ERR = {
  limit:"오늘은 이 구절에 더 뽑을 수 없어요 — 내일 다시 해 주세요.",
  "no-image":"이 장면으로는 그림이 안 나왔어요 — 장면을 조금 바꿔 주세요.",
  gen:"그림을 만들지 못했어요 — 다시 눌러 주세요.", ai:"AI 가 답하지 않았어요 — 잠시 뒤 다시 눌러 주세요.",
  "no-key":"그림 열쇠가 없어요 — 친구에게 알려 주세요.", "bad-file":"그림 파일이 이상해요 — 다시 만들어 주세요.",
  "too-big":"그림이 너무 커요 — 다시 만들어 주세요.", "no-alt":"그림 설명을 적어 주세요.", "bad-scene":"장면을 적어 주세요.",
  "no-verse":"그 구절을 찾지 못했어요.", save:"저장하지 못했어요 — 다시 눌러 주세요.",
  network:"인터넷 연결을 확인해 주세요 — 잠시 뒤 다시 눌러 주세요.",
};
let viPrefillNo = null;
let viState = null;   // { verses, db:{no:{slot:{url,alt,hidden}}}, used, daily, no, scene, gen:{slot:{b64,mime,sceneEn}}, pairs }

// 브라우저가 긴 변 1080px 로 줄인다 — WebP(0.78), 못 만들면 JPEG(0.85)
async function viShrink(b64, mime){
  const img = new Image(); img.src = `data:${mime};base64,${b64}`; await img.decode();
  const k = Math.min(1, 1080 / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  const toBlob = (t, q) => new Promise(r => c.toBlob(r, t, q));
  let blob = await toBlob("image/webp", 0.78);
  if(!blob || blob.type !== "image/webp") blob = await toBlob("image/jpeg", 0.85);   // 사파리 등
  const out = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(",")[1]); fr.onerror = rej; fr.readAsDataURL(blob); });
  return { b64: out, mime: blob.type, bytes: blob.size, w: c.width, h: c.height };
}

async function viHasOld(no){   // 옛 그림 파일(1~38번 등)이 있나 — 같은 주소의 HEAD
  try { const r = await fetch(`img/verse/${no}.webp`, { method:"HEAD", cache:"no-store" }); return r.ok; } catch(_) { return false; }
}

async function renderVerseImages(){
  window.scrollTo(0, 0);
  app.innerHTML = `
    <div class="rep-head mn-top"><button class="back-btn" id="back">← 메뉴</button><h2>③ 연상 그림</h2></div>
    <div class="push-card" id="vi-body"><p class="msg">불러오는 중...</p></div>`;
  document.getElementById("back").addEventListener("click", renderMenu);
  const [vd, ld] = await Promise.all([
    callApi({ action:"getVerses" }).catch(()=>({ok:false,error:"network"})),
    callApi({ action:"verseImgList", pw:getPw(), staff:getStaff() }).catch(()=>({ok:false,error:"network"})),
  ]);
  if(minAuthLost(ld)) return;
  const body = document.getElementById("vi-body"); if(!body) return;
  if(!vd.ok || !ld.ok){ body.innerHTML = `<p class="msg err">불러오지 못했습니다 — 화면을 다시 열어 주세요 (${htmlEsc((vd.error||ld.error)||"")})</p>`; return; }
  const verses = [...(vd.verses||[])].sort((a,b)=>Number(b.no)-Number(a.no));
  const dbi = {};
  for(const x of ld.images||[]){ (dbi[x.verseNo] = dbi[x.verseNo] || {})[x.slot] = x; }
  const old = {};
  await Promise.all(verses.slice(0, 60).filter(v=>!dbi[v.no]).map(async v=>{ old[v.no] = await viHasOld(v.no); }));
  viState = { verses, db:dbi, old, used: ld.used||{}, daily: ld.daily||15, no:null, scene:"", scenes:[], gen:{}, pairs:false };
  const has = v => !!(dbi[v.no] && dbi[v.no].a && !dbi[v.no].a.hidden) || !!old[v.no];
  const pick = viPrefillNo || (verses.find(v=>!has(v)) || verses[0] || {}).no;
  viPrefillNo = null;
  body.innerHTML = `
    <label class="push-lb">구절</label>
    <select id="vi-sel" class="push-in">${verses.map(v=>`<option value="${v.no}">${htmlEsc(v.no)}. ${htmlEsc(v.refShort||"")} ${has(v)?"· 🖼️ 그림 있음":"· 그림 없음"}</option>`).join("")}</select>
    <div id="vi-verse"></div>`;
  const sel = document.getElementById("vi-sel");
  if(pick != null) sel.value = String(pick);
  sel.addEventListener("change", ()=>viOpen(Number(sel.value)));
  if(pick != null) viOpen(Number(pick));
}

function viOpen(no){
  viState.no = no; viState.scene = ""; viState.scenes = []; viState.gen = {}; viState.pairs = !!(viState.db[no] && (viState.db[no].b || viState.db[no].c));
  const v = viState.verses.find(x=>Number(x.no)===no) || {};
  const box = document.getElementById("vi-verse"); if(!box) return;
  const left = viState.daily - (viState.used[no]||0);
  box.innerHTML = `
    <div class="su-verse">📖 <b>${htmlEsc(v.refShort||"")}</b><br>${htmlEsc(v.text||"")}</div>
    ${viState.old[no] && !(viState.db[no]||{}).a ? `<p class="push-hint">이 구절에는 예전에 넣은 그림이 있어요. 새로 만들어 저장하면 새 그림이 앞서 보여요.</p>` : ""}
    <div class="su-step"><b>1</b> 장면 고르기</div>
    <button class="push-btn ghost" id="vi-sugg">🤖 장면 제안 받기</button>
    <div id="vi-scenes" class="vi-scenes"></div>
    <label class="push-lb">장면 (고쳐 써도 돼요)</label>
    <textarea id="vi-scene" class="push-in" rows="2" maxlength="300" placeholder="예: 새벽 언덕 위 홀로 가지를 넓게 펼친 올리브나무"></textarea>
    <p class="vi-left" id="vi-left">오늘 이 구절에 ${left}장 더 뽑을 수 있어요.</p>
    <div id="vi-slots"></div>`;
  document.getElementById("vi-sugg").addEventListener("click", viSuggest);
  document.getElementById("vi-scene").addEventListener("input", e=>{ viState.scene = e.target.value.trim(); });
  viRenderSlots();
}

async function viSuggest(){
  const btn = document.getElementById("vi-sugg"); btn.disabled = true; btn.textContent = "생각하는 중…";
  const d = await callApi({ action:"verseImgScenes", pw:getPw(), staff:getStaff(), verseNo:viState.no }).catch(()=>({ok:false,error:"network"}));
  btn.disabled = false; btn.textContent = "🤖 장면 제안 다시 받기";
  if(minAuthLost(d)) return;
  if(!d.ok){ mnNote(VI_ERR[d.error] || ("오류: "+(d.error||"")), "warn"); return; }
  viState.scenes = d.scenes;
  const box = document.getElementById("vi-scenes");
  box.innerHTML = d.scenes.map((s,i)=>`<label><input type="radio" name="vi-sc" value="${i}"> ${htmlEsc(s)}</label>`).join("");
  box.querySelectorAll("input").forEach(r=>r.addEventListener("change", ()=>{
    const t = document.getElementById("vi-scene"); t.value = viState.scenes[Number(r.value)]; viState.scene = t.value;
  }));
}

function viRenderSlots(){
  const box = document.getElementById("vi-slots"); if(!box) return;
  const dbs = viState.db[viState.no] || {};
  const slots = VI_SLOTS.filter(([k])=> k==="a" || viState.pairs);
  box.innerHTML = slots.map(([k,label])=>`
    <div class="vi-slot" id="vi-slot-${k}">
      <div class="su-step"><b>${k==="a"?"2":"3"}</b> ${label}</div>
      ${dbs[k] ? `<div class="vi-have"><img class="vi-thumb" src="${htmlEsc(dbs[k].url)}" alt=""><div>${htmlEsc(dbs[k].alt)}${dbs[k].hidden?" <b>(내림)</b>":""}
        <div class="vi-acts"><button class="push-btn ghost" data-hide="${k}">${dbs[k].hidden?"되올리기":"내리기"}</button></div></div></div>
        <p class="push-hint">아래에서 새로 만들어 저장하면 이 그림을 바꿔요.</p>` : ""}
      <button class="push-send" data-gen="${k}">🎨 ${dbs[k]?"새로 만들기":"그림 만들기"}</button>
      <div id="vi-out-${k}"></div>
    </div>`).join("") + (viState.pairs ? "" : `<button class="push-btn ghost" id="vi-pairs">짝 그림도 만들기 (넓은 장면 · 가까이)</button>`);
  box.querySelectorAll("[data-gen]").forEach(b=>b.addEventListener("click", ()=>viGenerate(b.dataset.gen, b)));
  box.querySelectorAll("[data-hide]").forEach(b=>b.addEventListener("click", ()=>viHide(b.dataset.hide)));
  const pr = document.getElementById("vi-pairs"); if(pr) pr.addEventListener("click", ()=>{ viState.pairs = true; viRenderSlots(); });
}

async function viGenerate(slot, btn){
  if(!viState.scene){ mnNote("먼저 장면을 고르거나 적어 주세요", "warn"); return; }
  const out = document.getElementById("vi-out-"+slot);
  btn.disabled = true; out.innerHTML = `<p class="msg">그리는 중… 30초쯤 걸려요</p>`;
  const d = await callApi({ action:"verseImgGenerate", pw:getPw(), staff:getStaff(), verseNo:viState.no, slot, sceneKo:viState.scene }).catch(()=>({ok:false,error:"network"}));
  btn.disabled = false;
  if(minAuthLost(d)) return;
  if(!d.ok){ out.innerHTML = `<p class="msg err">${htmlEsc(VI_ERR[d.error] || ("오류: "+(d.error||"")))}</p>`; return; }
  viState.used[viState.no] = (viState.used[viState.no]||0) + 1;
  const left = document.getElementById("vi-left"); if(left) left.textContent = `오늘 이 구절에 ${d.left}장 더 뽑을 수 있어요.`;
  viState.gen[slot] = { b64:d.image, mime:d.mime, sceneEn:d.sceneEn };
  out.innerHTML = `<img class="vi-img" src="data:${htmlEsc(d.mime)};base64,${d.image}" alt="">
    <div class="vi-checks">${VI_CHECKS.map((c,i)=>`<label><input type="checkbox" data-ck="${i}"> ${c}</label>`).join("")}</div>
    <div class="vi-acts"><button class="push-btn ghost" data-again>🔁 다시 뽑기</button><button class="push-send" data-use disabled>✅ 이 그림 쓰기</button></div>
    <div data-save></div>`;
  const use = out.querySelector("[data-use]");
  const cks = [...out.querySelectorAll("[data-ck]")];
  cks.forEach(c=>c.addEventListener("change", ()=>{ use.disabled = !cks.every(x=>x.checked); }));
  out.querySelector("[data-again]").addEventListener("click", ()=>viGenerate(slot, btn));
  use.addEventListener("click", ()=>viUse(slot, out));
}

async function viUse(slot, out){
  const g = viState.gen[slot]; if(!g) return;
  const box = out.querySelector("[data-save]");
  box.innerHTML = `<p class="msg">그림을 줄이고 설명을 만드는 중…</p>`;
  let small;
  try { small = await viShrink(g.b64, g.mime); } catch(_) { box.innerHTML = `<p class="msg err">${VI_ERR["bad-file"]}</p>`; return; }
  g.small = small;
  const d = await callApi({ action:"verseImgAlt", pw:getPw(), staff:getStaff(), verseNo:viState.no, slot, image:small.b64, mime:small.mime }).catch(()=>({ok:false,error:"network"}));
  if(minAuthLost(d)) return;
  const pre = slot === "a" ? "" : "구아슈·색연필 화풍 — ";
  const alt = d.ok ? (pre + d.alt) : pre;
  box.innerHTML = `<label class="push-lb">그림 설명 (낭독기가 읽어요 — 그림에 보이는 것을 적어 주세요)</label>
    <input class="push-in" data-alt maxlength="80" value="${htmlEsc(alt)}">
    ${d.ok ? "" : `<p class="push-hint">설명을 제안받지 못했어요 — 직접 적어 주세요.</p>`}
    <button class="push-send" data-store>💾 저장</button>`;
  box.querySelector("[data-store]").addEventListener("click", ()=>viSave(slot, box));
}

async function viSave(slot, box){
  const g = viState.gen[slot]; const alt = box.querySelector("[data-alt]").value.trim();
  if(!alt){ mnNote(VI_ERR["no-alt"], "warn"); return; }
  const btn = box.querySelector("[data-store]"); btn.disabled = true; btn.textContent = "저장 중…";
  const d = await callApi({ action:"verseImgSave", pw:getPw(), staff:getStaff(), verseNo:viState.no, slot,
    image:g.small.b64, mime:g.small.mime, alt, sceneKo:viState.scene, sceneEn:g.sceneEn }).catch(()=>({ok:false,error:"network"}));
  btn.disabled = false; btn.textContent = "💾 다시 저장";
  if(minAuthLost(d)) return;
  if(!d.ok){ mnNote(VI_ERR[d.error] || ("오류: "+(d.error||"")), "warn"); return; }
  (viState.db[viState.no] = viState.db[viState.no] || {})[slot] = { url:d.url, alt, hidden:false };
  delete viState.gen[slot];
  mnNote("저장했어요 — 앱에 바로 떠요");
  viRenderSlots();
}

async function viHide(slot){
  const cur = (viState.db[viState.no]||{})[slot]; if(!cur) return;
  const hidden = !cur.hidden;
  if(hidden && !(await mnDialog({ icon:"🖼️", title:"그림 내리기", tone:"danger", ok:"내리기", cancel:"그만두기",
    html:"이 그림을 앱에서 내릴까요?", note:"언제든 「되올리기」로 다시 보이게 할 수 있어요." }))) return;
  const d = await callApi({ action:"verseImgHide", pw:getPw(), staff:getStaff(), verseNo:viState.no, slot, hidden }).catch(()=>({ok:false,error:"network"}));
  if(minAuthLost(d)) return;
  if(!d.ok){ mnNote(VI_ERR[d.error] || ("오류: "+(d.error||"")), "warn"); return; }
  cur.hidden = hidden; mnNote(hidden ? "내렸어요" : "다시 보이게 했어요"); viRenderSlots();
}
```

- [ ] **Step 5: 문법** — 인라인 스크립트 `node --check`(설교 올리기 계획의 파이썬 조각) · `node --test tests/sermon-text.test.cjs`
- [ ] **Step 6: 커밋** — `git commit -m "feat(관리자): ③ 연상 그림 — 장면 제안·그림 만들기·확인표·설명·저장·짝 그림·내리기" -- admin-stats.html`

---

### Task 5: 성도님 앱 — 🖼️ 탭이 DB 그림을 먼저

**Files:** Modify `app.js` — 🖼️ 탭 두 자리

- [ ] **Step 1: 탭을 띄우는 줄**

찾을 것: `    if (VERSE_IMG[verse.no]) items.push({ k: "img", label: "🖼️ 그림" });`
바꿀 것:
```js
    // DB 그림(설교·찬양 담당자가 만든 것 · 2026-09-21)이 있으면 그것이 앞선다 — getVerses 의 images(대표 a 가 있을 때만 온다)
    const dbImgs = Array.isArray(verse.images) && verse.images.length ? verse.images : null;
    if (dbImgs || VERSE_IMG[verse.no]) items.push({ k: "img", label: "🖼️ 그림" });
```

- [ ] **Step 2: 그림 목록과 주소**

찾을 것:
```js
          const imgs = [{ file: String(verse.no), alt: VERSE_IMG[verse.no] },
                        ...(VERSE_IMG_MORE[verse.no] || [])];
```
바꿀 것:
```js
          const imgs = dbImgs
            ? dbImgs.map((x) => ({ url: x.url, alt: x.alt }))
            : [{ file: String(verse.no), alt: VERSE_IMG[verse.no] }, ...(VERSE_IMG_MORE[verse.no] || [])];
```
찾을 것: `            img.src = \`img/verse/${imgs[idx].file}.webp?v=${APP_BUILD}\`;`
바꿀 것:
```js
            // DB 그림은 저장소 주소 그대로 — 바꿀 때마다 이름이 바뀌니 ?v= 를 붙이지 않는다
            img.src = imgs[idx].url || `img/verse/${imgs[idx].file}.webp?v=${APP_BUILD}`;
```

- [ ] **Step 3: 문법** — `node --check app.js` · `python tools/preflight.py`(캐시태그 검사는 Phase B 의 bump 전이라 통과해야 한다 — 태그는 안 바뀌었다)
- [ ] **Step 4: 커밋** — `git commit -m "feat(앱): 🖼️ 그림 — 담당자가 만든 DB 그림을 먼저, 없으면 예전 그림" -- app.js`

---

### Task 6: 개발 시험 — 처음부터 끝까지

- [ ] **Step 1: 개발 배포**(Task 2 뒤 바뀐 것이 있으면) · 스모크 `실패 0`
- [ ] **Step 2: 화면(localhost · 담당자)** — ③ 연상 그림 → 1번 구절 → 장면 제안 → 대표 그림 만들기(30초 안팎) → 확인표 여섯 칸 → 쓰기 → 설명 제안 → 저장 → 「저장했어요」 → 짝 그림도 만들기 → b·c 하나씩. (4~6장 · 한 장은 일부러 「다시 뽑기」)
- [ ] **Step 3: 성도님 앱(localhost)** — 1번 구절 암송 화면 🖼️ 탭에 **새 그림**, 「🔄 보기 (1/3)」 · 옛 그림만 있는 구절은 그대로 · 대표를 「내리기」 하면 옛 그림으로(옛 그림이 없으면 탭이 사라짐)
- [ ] **Step 4: 화면 점검** — 390px 오류·가로 넘침·36px 미만(설교 올리기 때의 점검 스크립트에 ③ 을 더해)
- [ ] **Step 5: 최종 전체 리뷰**(연상 그림 가지분) → 고칠 것 → 진행 원장

### Task 7: 운영 반영(9/27 뒤 · 설교 올리기 Task 15 와 한 번에)

- [ ] `supabase/verse_images.sql` 운영 · 운영 시크릿 `GEMINI_API_KEY`(+ Task 3 에서 정한 `VERSE_IMG_SIZE`)
- [ ] 설교 올리기 Task 15 의 순서 그대로(api 배포 → 화면·`app.js` 합치기 → `bump.py` → 배포 확인). 이번 판에만 있는 표식: 라이브 `app.js` 에 `const dbImgs = Array.isArray(verse.images)`
- [ ] 첫 실전: 그 주 구절의 대표 그림을 담당자가 만들고, 친구가 앱에서 본다
- [ ] 문서: `docs/notes/verse-image-staff.md`(화풍 문구는 서버 상수와 안내서 두 곳 · 하루 15장 · 내리기 · 1K/2K 결정) · `img/verse/암송말씀_그림_만들기.md` 맨 위에 「담당자는 관리자 화면 ③ 으로」

## 자체 점검

- 설계 3장 화면 → Task 4 · 4장 구조·표·저장소·액션·getVerses·app.js → Task 1·2·5 · 5장 실패 → Task 2(오류 코드)·4(VI_ERR·JPEG 대체) · 6장 시험 → Task 3·6 · 7장(DB 가 앞섬·짝만 있으면 안 보임) → Task 2 `vimgPublicMap`·Task 5 · 9장 운영 → Task 7.
- 이름: 액션 `verseImgList/Scenes/Generate/Alt/Save/Hide` · 칸 `a/b/c` · 응답 `images[].{verseNo,slot,url,alt,hidden}`(목록) · `getVerses` `images[].{slot,url,alt}` ↔ `app.js` `dbImgs` · `viPrefillNo`(Task 4 Step 2 ↔ Step 4).
- ⚠️ 구현 때 확인: Gemini 응답의 `inlineData`·`imageConfig.imageSize` 이름(Task 3 Step 5 에서 실제로 한 장 뽑아 확인 — 다르면 Task 2 를 고친다).
