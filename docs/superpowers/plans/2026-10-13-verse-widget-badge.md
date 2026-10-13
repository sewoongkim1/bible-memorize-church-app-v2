# 이번주 말씀 위젯 머리말 「🐑 3일째」 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 이번주 말씀 위젯(아이폰·안드로이드 홈 중간·크게) 머리줄 오른쪽에 서버가 만든 「🐑 3일째」를 보인다.

**Architecture:** 서버 `getWeeklyVerse` 가 `badge`(이모지 + 이 말씀 며칠째)·`badgeDate`(셈한 한국 날짜)를 더해 내려 주고, 위젯은 `badgeDate` 가 오늘일 때만 그 글자를 그대로 그린다. 이모지는 `verses.emoji` 칸 — 지금 41개는 SQL 로 채우고, 새 구절은 위젯이 처음 부를 때 서버가 응답 뒤에 AI 로 목록 안에서 하나 골라 채운다.

**Tech Stack:** Supabase Edge Function(Deno · `supabase/functions/api`) · Postgres · Android RemoteViews(Java · JUnit) · iOS WidgetKit(SwiftUI) · node 내장 시험(`node:test`).

설계: `docs/superpowers/specs/2026-10-13-verse-widget-badge-design.md`

## Global Constraints

- 위젯은 공개 정보만 — 요청·응답에 `user_id`·개인정보를 절대 싣지 않는다.
- 머리말 꼴: 첫날 `🐑 새 말씀`, 그 뒤 `🐑 N일째`(7 넘어도 그대로). 날짜 없는 구절·시작 전 구절은 이모지만. 이모지 없으면 며칠째만. 둘 다 없으면 `badge` 칸을 보내지 않는다.
- 머리말은 **새 줄을 만들지 않는다** — 머리줄 오른쪽 끝, 머리줄과 같은 글씨 크기·회색·한 줄.
- 잠금 화면·돌려 보기·묵상·기도문 위젯은 손대지 않는다.
- 이모지 목록은 40개 고정(아래 Task 2 의 `VERSE_EMOJIS`) — 유니코드 7.0 이하 · 피부색 수식·ZWJ 없음.
- AI 채움은 `date` 입력 없는 요청에서, 이번 구절 `emoji` 가 비었을 때만 · 응답 뒤(`EdgeRuntime.waitUntil`) · 같은 구절은 isolate 안에서 10분에 한 번 · 저장은 `emoji is null` 인 줄만.
- 모델은 `VERSE_EMOJI_MODEL`(기본 `claude-opus-5-5` · effort `low` · 기본 모델일 때만 서버 쪽 대체 `fallbacks: "default"`).
- ⚠️ 차례: **SQL(칸) → api**(api 가 칸을 읽는다 · 칸이 없으면 위젯 응답이 통째로 실패) · 개발 먼저 · 운영 api 는 origin/main 과 같은 판만(`tools/deploy-fn.py`).
- 아이폰 위젯 코드는 두 벌(`ios-app/native/TodayVerseWidget/` · `ios-app/ios/App/TodayVerseWidget/`)을 **같게**. 새 Swift 파일 금지. kind `TodayVerseWidget`·클래스 `VerseWidget` 이름 바꾸지 말 것.
- 공용 파일은 경로를 못 박아 커밋(`git add -- <파일>` · `app.js`·`index.ts` 처럼 남도 고치는 파일은 `git diff --cached` 로 남의 헝크가 없는지 본 뒤) · 푸시 전 `python tools/preflight.py`.
- 웹(`app.js`·`index.html`)은 고치지 않는다 — bump 없음.

---

### Task 1: 이모지 칸 + 41개 채움 SQL (개발 DB)

**Files:**
- Create: `supabase/verse_emoji.sql`

**Interfaces:**
- Produces: `public.verses.emoji text`(null 가능) — Task 3 의 `weeklyVerseKst` 가 읽는다.

- [ ] **Step 1: 41개 표를 친구에게 보이고 확인 받기** (이 표 그대로 SQL 이 된다 — 바꾸라는 줄이 있으면 고친 뒤 Step 2)

| no | 구절 | 이모지 | 까닭 |
|---|---|---|---|
| 1 | 시 119:105 | 🕯️ | 내 발에 등 |
| 2 | 창 12:2 | ⭐ | 복이 될지라(아브라함) |
| 3 | 수 1:8 | 📖 | 율법책 |
| 4 | 출 13:22 | 🔥 | 불기둥 |
| 5 | 레 20:26 | ✨ | 구별하였음 |
| 6 | 행 16:31 | 🏠 | 너와 네 집 |
| 7 | 행 16:14 | 🚪 | 마음을 열어 |
| 8 | 눅 4:8 | 🙏 | 경배하고 섬기라 |
| 9 | 신 8:6 | 👣 | 그의 길을 따라가며 |
| 10 | 막 12:17 | ⚖️ | 가이사의 것은 가이사에게 |
| 11 | 삿 8:23 | 👑 | 여호와께서 다스리시리라 |
| 12 | 벧전 4:16 | ✝️ | 그리스도인으로 고난 |
| 13 | 막 11:3 | 🌿 | 주가 쓰시겠다(예루살렘 입성) |
| 14 | 막 16:6 | 🌅 | 살아나셨고 |
| 15 | 민 14:24 | ⛰️ | 갈렙 — 그 땅 |
| 16 | 삼상 26:24 | ⚖️ | 중히 여긴 것 같이 |
| 17 | 잠 4:6 | 🗝️ | 지혜를 버리지 말라 |
| 18 | 대상 22:12 | 💡 | 지혜와 총명 |
| 19 | 눅 1:28 | 🎁 | 은혜를 받은 자여 |
| 20 | 시 3:6 | 🛡️ | 천만인이 에워싸도 |
| 21 | 살전 5:16-18 | 🎶 | 항상 기뻐하라 |
| 22 | 마 28:19 | 🕊️ | 성령의 이름으로 세례 |
| 23 | 행 16:10 | 🌍 | 복음을 전하라고 |
| 24 | 시 116:1 | ❤️ | 그를 사랑하는도다 |
| 25 | 계 2:7 | 🌳 | 생명나무 |
| 26 | 딤전 1:11 | ☀️ | 영광의 복음 |
| 27 | 눅 5:10 | 🐟 | 사람을 취하리라 |
| 28 | 사 26:3 | ⚓ | 심지가 견고한 자 |
| 29 | 골 3:23 | 🌾 | 무슨 일을 하든지 |
| 30 | 요이 1:12 | 🏠 | 가서 대면하여 |
| 31 | 마 10:31 | 🐦 | 참새보다 귀하니라 |
| 32 | 삼상 16:7 | ❤️ | 중심을 보느니라 |
| 33 | 막 6:31 | 🌙 | 잠깐 쉬어라 |
| 34 | 사 48:15 | 👣 | 그 길이 형통하리라 |
| 35 | 슥 4:10 | 🌱 | 작은 일의 날 |
| 36 | 합 2:4 | ⏳ | 믿음으로 말미암아 살리라(기다림) |
| 37 | 고전 3:7 | 💧 | 물 주는 이 |
| 38 | 롬 14:8 | ✝️ | 주의 것이로다 |
| 39 | 마 11:19 | 🍇 | 그 행한 일로(열매) |
| 40 | 딤전 3:15 | 🏛️ | 진리의 기둥과 터 |
| 41 | 요 17:22 | 🙏 | 하나가 되게(예수님의 기도) |

- [ ] **Step 2: SQL 파일 쓰기** — `supabase/verse_emoji.sql`

```sql
-- ============================================================
-- 이번주 말씀 위젯 머리말 「🐑 3일째」(2026-10-13) — 구절마다 이모지 하나
--   설계 docs/superpowers/specs/2026-10-13-verse-widget-badge-design.md
--   · 새 표가 아니라 verses 의 칸 하나 — 본문과 같은 공개 정보라 RLS 는 verses 그대로.
--   · 목록 밖 값은 서버(api verse-emoji.ts)가 보여 주지 않는다 — DB CHECK 는 두지 않는다(목록을 늘릴 때 SQL 이 따라오지 않게).
--   · 다시 돌려도 안전 — 칸은 if not exists · 채움은 emoji 가 빈 줄만(사람이 고친 것을 덮지 않는다).
--   ⚠️ api 보다 **먼저** 넣는다 — weeklyVerseKst 가 이 칸을 읽는다. 칸이 없으면 위젯 응답이 통째로 실패한다.
--   새 구절은 위젯이 처음 부를 때 서버가 AI 로 목록 안에서 골라 채운다. 사람이 고치려면:
--     update public.verses set emoji = '🕊️' where no = 42;
-- ============================================================
alter table public.verses add column if not exists emoji text;

update public.verses v set emoji = x.emoji
from (values
  (1, '🕯️'), (2, '⭐'), (3, '📖'), (4, '🔥'), (5, '✨'),
  (6, '🏠'), (7, '🚪'), (8, '🙏'), (9, '👣'), (10, '⚖️'),
  (11, '👑'), (12, '✝️'), (13, '🌿'), (14, '🌅'), (15, '⛰️'),
  (16, '⚖️'), (17, '🗝️'), (18, '💡'), (19, '🎁'), (20, '🛡️'),
  (21, '🎶'), (22, '🕊️'), (23, '🌍'), (24, '❤️'), (25, '🌳'),
  (26, '☀️'), (27, '🐟'), (28, '⚓'), (29, '🌾'), (30, '🏠'),
  (31, '🐦'), (32, '❤️'), (33, '🌙'), (34, '👣'), (35, '🌱'),
  (36, '⏳'), (37, '💧'), (38, '✝️'), (39, '🍇'), (40, '🏛️'),
  (41, '🙏')
) as x(no, emoji)
where v.no = x.no and v.emoji is null;
```

- [ ] **Step 3: 개발 DB 에 넣기** — 스킬 `sql-migrate` 차례(개발 `ktpwthwqzgcqcrmsafdo`). 넣은 뒤:

Run: `python tools/sql-applied.py record supabase/verse_emoji.sql --dev`
그리고 확인 질의(같은 스킬의 질의 길로): `select no, emoji from public.verses where no <= 41 order by no;`
Expected: 개발에 있는 주간 구절(1~26 안팎)마다 위 표의 이모지. `select count(*) from public.verses where emoji is not null and no > 41;` → 0.

- [ ] **Step 4: 커밋**

```bash
git add -- supabase/verse_emoji.sql
git commit -m "feat(위젯 머리말): verses.emoji 칸 + 주간 구절 41개 이모지 — 개발 DB 적용" -- supabase/verse_emoji.sql
git show --stat HEAD
```

---

### Task 2: 서버 순수 함수 — 이모지 목록 · 머리말 셈 (+ 시험)

**Files:**
- Create: `supabase/functions/api/verse-emoji.ts`
- Create: `tests/verse-badge.test.cjs`
- Modify: `tools/preflight.py`(PURE_TESTS 한 줄)

**Interfaces:**
- Produces (verse-emoji.ts export):
  - `widgetVerseBadge(emoji: unknown, startDay: number | null, today: number): string` — startDay·today 는 `ymdDayNumber` 값.
  - `queueVerseEmojiFill(no: number, ref: string, text: string): void` — 응답 뒤 AI 채움(Task 3 에서 index.ts 가 부른다).
- 순수 구간(시험이 vm 으로 돌림): `VERSE_EMOJIS`, `verseEmojiOf(raw)`, `verseBadge(emoji, startDay, today)`.

- [ ] **Step 1: 실패하는 시험 쓰기** — `tests/verse-badge.test.cjs`

```js
// 이번주 말씀 위젯 머리말 「🐑 3일째」(2026-10-13) — 서버 순수 함수 · SQL 꼴 · 위젯 두 폰의 배선(꾸러미 없음 · preflight 가 건다)
//
//   node --test tests/verse-badge.test.cjs
//
// 무엇을 지키나(docs/superpowers/specs/2026-10-13-verse-widget-badge-design.md)
//   ① 머리말 셈 — 첫날 「새 말씀」 · N일째 · 날짜 없음/시작 전은 이모지만 · 목록 밖 이모지는 안 보임 · 둘 다 없으면 ""
//   ② 이모지 목록 — 40개 · 겹침 없음 · 피부색 수식·ZWJ 없음(안드로이드 7.0 에서 □ 가 된다)
//   ③ SQL — 칸은 if not exists · 41줄 · 모두 목록 안 · 빈 줄만 채움
//   ④ index.ts 배선 — emoji 칸을 읽는다 · badge/badgeDate · AI 채움은 date 입력 없을 때만
//   ⑤ 위젯 — 아이폰 두 벌이 같다 · badgeDate 를 오늘과 견준다 · 안드로이드 두 레이아웃에 widget_badge
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = (...f) => fs.readFileSync(path.join(root, ...f), 'utf8').replace(/\r\n/g, '\n');
const slice = (src, a, b, what) => {
  const s = src.indexOf(a), e = src.indexOf(b, s + a.length);
  assert.ok(s >= 0 && e > s, what + ' — 표식을 못 찾았다(이 검사가 낡았다)');
  return src.slice(s, e);
};

const VE = read('supabase', 'functions', 'api', 'verse-emoji.ts');
const pure = slice(VE, '// ── 위젯 머리말 — 순수 함수 (여기부터) ──', '// ── 위젯 머리말 — 순수 함수 (여기까지) ──', 'verse-emoji.ts');
assert.ok(!/\)\s*:\s*\w|\(\s*\w+\s*:\s*\w/.test(pure),
  'verse-emoji.ts 순수 구간에 타입 표기가 들어왔다 — node:vm 이 못 돌린다. 표기를 빼거나 구간 밖으로 옮겨라');
const P = vm.runInContext(pure + '\n;({ VERSE_EMOJIS, verseEmojiOf, verseBadge })', vm.createContext({}));
const strip = (s) => s.replace(/\uFE0F/g, '');

test('① verseBadge — 첫날 새 말씀 · N일째 · 날짜 없음/시작 전은 이모지만 · 목록 밖은 안 보임', () => {
  assert.equal(P.verseBadge('🐑', 100, 100), '🐑 새 말씀');
  assert.equal(P.verseBadge('🐑', 100, 102), '🐑 3일째');
  assert.equal(P.verseBadge('🐑', 100, 109), '🐑 10일째');      // 한 말씀이 7일을 넘겨도 그대로
  assert.equal(P.verseBadge(null, 100, 102), '3일째');
  assert.equal(P.verseBadge('', 100, 100), '새 말씀');
  assert.equal(P.verseBadge('🐑', null, 102), '🐑');            // 날짜 없는 구절
  assert.equal(P.verseBadge('🐑', 105, 102), '🐑');             // 곧 시작할 말씀
  assert.equal(P.verseBadge('💀', 100, 100), '새 말씀');         // 목록 밖
  assert.equal(P.verseBadge(null, null, 102), '');
});

test('① verseEmojiOf — 이체 선택자 없이 와도 목록의 꼴로 · 앞뒤 공백 · 목록 밖은 ""', () => {
  assert.equal(P.verseEmojiOf('🕊️'), '🕊️');
  assert.equal(P.verseEmojiOf('🕊'), '🕊️');                    // U+FE0F 없이
  assert.equal(P.verseEmojiOf(' 🐑 '), '🐑');
  assert.equal(P.verseEmojiOf('💀'), '');
  assert.equal(P.verseEmojiOf(null), '');
  assert.equal(P.verseEmojiOf(undefined), '');
});

test('② 목록 — 40개 · 겹침 없음 · 피부색 수식·ZWJ 없음', () => {
  const L = Array.from(P.VERSE_EMOJIS);
  assert.equal(L.length, 40);
  assert.equal(new Set(L.map(strip)).size, 40, '겹치는 이모지가 있다');
  for (const e of L) {
    assert.ok(!/[\u{1F3FB}-\u{1F3FF}]/u.test(e), e + ' — 피부색 수식');
    assert.ok(!e.includes('\u200D'), e + ' — ZWJ 조합');
  }
});

test('③ SQL — 칸은 if not exists · 41줄 · 모두 목록 안 · 빈 줄만 채움', () => {
  const sql = read('supabase', 'verse_emoji.sql');
  assert.ok(sql.includes('alter table public.verses add column if not exists emoji text;'));
  assert.ok(sql.includes('where v.no = x.no and v.emoji is null;'), '사람이 고친 것을 덮지 않게 — emoji is null 인 줄만');
  const rows = [...sql.matchAll(/\((\d+), '([^']+)'\)/g)].map((m) => [Number(m[1]), m[2]]);
  assert.equal(rows.length, 41);
  assert.deepEqual(rows.map((r) => r[0]), Array.from({ length: 41 }, (_, i) => i + 1));
  const list = new Set(Array.from(P.VERSE_EMOJIS));
  for (const [no, e] of rows) assert.ok(list.has(e), no + '번 ' + e + ' — 목록에 없는 꼴(이체 선택자까지 같아야 한다)');
});
```

- [ ] **Step 2: 시험이 실패하는지 보기**

Run: `node --test tests/verse-badge.test.cjs`
Expected: FAIL — `ENOENT ... verse-emoji.ts`

- [ ] **Step 3: 순수 함수 + 겉 함수 쓰기** — `supabase/functions/api/verse-emoji.ts`

```ts
// ============================================================
// 이번주 말씀 위젯 머리말 「🐑 3일째」(2026-10-13) — api 의 한 영역
//   설계 docs/superpowers/specs/2026-10-13-verse-widget-badge-design.md
//   getWeeklyVerse(index.ts getWeeklyVerseForWidget)가 badge·badgeDate 로 내려 준다 — 위젯은 그 글자를 그대로 그린다.
//   이모지 = verses.emoji(supabase/verse_emoji.sql). 빈 구절은 위젯이 처음 부를 때 응답 뒤에 AI 가 목록 안에서 골라 채운다.
//   ⚠️ 위젯은 공개 정보만 — user_id 를 받지도 싣지도 않는다.
// ============================================================
import { db } from "./_shared.ts";

// ── 위젯 머리말 — 순수 함수 (여기부터) ──
//   tests/verse-badge.test.cjs 가 이 구간만 잘라 node:vm 에서 돌린다 — 타입 표기·import 를 넣지 말 것.
// 이모지 목록 — 안드로이드 7.0(minSdk 24)에서도 네모 칸으로 안 나오게 유니코드 7.0 이하만.
// 사람 모양은 피부색이 갈리지 않는 🙏 👣 만. 늘리면 시험의 40 도 함께 고친다.
const VERSE_EMOJIS = [
  "🐑", "🕊️", "🙏", "❤️", "✝️", "📖", "🌱", "🌿", "🌳", "🌾",
  "🍇", "🍞", "🐟", "🐦", "💧", "🌊", "☀️", "🌅", "🌙", "⭐",
  "✨", "💡", "🔥", "☁️", "🌈", "⛰️", "🏠", "🏛️", "🚪", "👣",
  "🛡️", "⚓", "👑", "🗝️", "⚖️", "⏳", "🕯️", "🎁", "🎶", "🌍",
];

// 이체 선택자(U+FE0F)를 떼고 견준다 — 같은 그림이 붙은 꼴·안 붙은 꼴 둘 다로 올 수 있다
const stripVs = (s) => String(s ?? "").replace(/\uFE0F/g, "").trim();

// 목록 안이면 목록에 적힌 꼴 그대로, 아니면 빈 글자
function verseEmojiOf(raw) {
  const k = stripVs(raw);
  if (!k) return "";
  for (const e of VERSE_EMOJIS) if (stripVs(e) === k) return e;
  return "";
}

// 머리말 — startDay·today 는 날 번호(ymdDayNumber). startDay 가 없거나(날짜 없는 구절) 오늘보다 뒤면(곧 시작) 며칠째를 쓰지 않는다.
function verseBadge(emoji, startDay, today) {
  const e = verseEmojiOf(emoji);
  let day = "";
  if (typeof startDay === "number" && typeof today === "number" && startDay <= today) {
    const n = today - startDay + 1;
    day = n === 1 ? "새 말씀" : n + "일째";
  }
  return [e, day].filter(Boolean).join(" ");
}
// ── 위젯 머리말 — 순수 함수 (여기까지) ──

export function widgetVerseBadge(emoji: unknown, startDay: number | null, today: number): string {
  return verseBadge(emoji, startDay, today);
}

// ---- 빈 이모지 채우기 — 응답 뒤에 · AI 가 목록 안에서 하나 ----
const VERSE_EMOJI_DEFAULT_MODEL = "claude-opus-5-5";
const VERSE_EMOJI_RETRY_MS = 10 * 60 * 1000;
const verseEmojiTried = new Map<number, number>();   // 구절 번호 → 마지막 시도(이 isolate 안 · 실패가 이어질 때 매 요청 AI 를 부르지 않게)

export function queueVerseEmojiFill(no: number, ref: string, text: string): void {
  const now = Date.now();
  const last = verseEmojiTried.get(no);
  if (last !== undefined && now - last < VERSE_EMOJI_RETRY_MS) return;
  verseEmojiTried.set(no, now);
  const job = fillVerseEmoji(no, ref, text).catch((e) => console.error("fillVerseEmoji", e));
  try {
    const rt = (globalThis as any).EdgeRuntime;
    if (rt && typeof rt.waitUntil === "function") rt.waitUntil(job);
  } catch (e) { console.error("fillVerseEmoji", e); }
}

async function fillVerseEmoji(no: number, ref: string, text: string): Promise<void> {
  const emoji = await pickVerseEmoji(ref, text);
  if (!emoji) return;
  // 빈 줄만 — 여럿이 함께 채워도 처음 것 하나만 남고, 사람이 넣은 것은 덮지 않는다
  const { error } = await db.from("verses").update({ emoji }).eq("no", no).is("emoji", null);
  if (error) throw error;
}

async function pickVerseEmoji(ref: string, text: string): Promise<string> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return "";                                    // 키가 없으면 조용히 — 머리말은 며칠째만
  const model = Deno.env.get("VERSE_EMOJI_MODEL") || VERSE_EMOJI_DEFAULT_MODEL;
  const fallback = model === VERSE_EMOJI_DEFAULT_MODEL;      // 서버 쪽 대체는 기본 모델에서만 켠다(다른 모델은 받지 않을 수 있다)
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      ...(fallback ? { "anthropic-beta": "server-side-fallback-2026-07-01" } : {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      ...(fallback ? { fallbacks: "default" } : {}),
      system: [
        "한국 교회 성경 암송 앱의 홈 화면 위젯에 이번 주 암송 구절과 함께 작은 그림 글자 하나를 붙입니다.",
        "주어진 목록 안에서 이 구절의 핵심 낱말이나 장면을 가장 잘 떠올리게 하는 것 하나를 고르세요.",
        "성도님들이 보고 구절을 떠올리는 실마리가 되도록, 차분하고 어울리는 것을 고릅니다.",
      ].join("\n"),
      output_config: {
        effort: "low",
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: { emoji: { type: "string", enum: VERSE_EMOJIS } },
            required: ["emoji"],
            additionalProperties: false,
          },
        },
      },
      messages: [{ role: "user", content: `[출처] ${ref}\n[본문] ${text}` }],
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) return "";
  const d = await res.json();
  if (d.stop_reason !== "end_turn") return "";               // 거절(refusal)·잘림(max_tokens)이면 이번엔 건너뛴다
  let out: any = {};
  try { out = JSON.parse((d.content ?? []).find((x: any) => x.type === "text")?.text ?? "{}"); } catch (_) {}
  return verseEmojiOf(out.emoji);                            // 목록 밖이면 "" — 저장하지 않는다
}
```

- [ ] **Step 4: 시험이 통과하는지 보기**

Run: `node --test tests/verse-badge.test.cjs`
Expected: PASS — ①②③ 모두(④⑤ 는 Task 3·5·6 에서 더한다).

- [ ] **Step 5: preflight 에 걸기** — `tools/preflight.py` 의 PURE_TESTS 마지막 줄 다음에(줄 158 근처의 `# 📱 안드로이드 플레이 앱 위 띠` 묶음 뒤):

```python
# 🐑 이번주 말씀 위젯 머리말(2026-10-13) — 머리말 셈·이모지 목록(서버 순수) · SQL 꼴 · index.ts 배선 · 위젯 두 폰(아이폰 두 벌이 같은가)
PURE_TESTS += ["tests/verse-badge.test.cjs"]
```

Run: `python tools/preflight.py`
Expected: 끝에 통과(종료코드 0). `tests/api-split.test.cjs` 도 통과해야 한다(새 파일이 _shared.ts 이름을 다시 선언하지 않는가).

- [ ] **Step 6: 커밋**

```bash
git add -- supabase/functions/api/verse-emoji.ts tests/verse-badge.test.cjs tools/preflight.py
git commit -m "feat(위젯 머리말): 서버 순수 함수 — 이모지 목록 40 · 「🐑 3일째」 셈 · AI 채움(응답 뒤)" -- supabase/functions/api/verse-emoji.ts tests/verse-badge.test.cjs tools/preflight.py
git show --stat HEAD
```

---

### Task 3: index.ts 배선 — `getWeeklyVerse` 에 badge·badgeDate (개발 배포 · 스모크)

**Files:**
- Modify: `supabase/functions/api/index.ts` — import 줄(14 근처) · `weeklyVerseKst`(약 913~953) · `getWeeklyVerseForWidget`(약 954~957)
- Create: `tests/verse-badge-smoke.py`
- Modify: `tests/verse-badge.test.cjs`(④ 더함)

**Interfaces:**
- Consumes: `widgetVerseBadge`, `queueVerseEmojiFill`(Task 2) · `ymdDayNumber`, `widgetYmd`(_shared.ts — 이미 import 됨)
- Produces: 응답 `{ no, ref, text, prev, badge?, badgeDate? }` — Task 5·6 위젯이 읽는다.

- [ ] **Step 1: 실패하는 시험 더하기** — `tests/verse-badge.test.cjs` 끝에

```js
test('④ index.ts — emoji 칸을 읽는다 · badge/badgeDate · AI 채움은 date 입력 없을 때만', () => {
  const INDEX = read('supabase', 'functions', 'api', 'index.ts');
  assert.ok(/^import \{ widgetVerseBadge, queueVerseEmojiFill \} from "\.\/verse-emoji\.ts";/m.test(INDEX), 'import 줄');
  const kst = slice(INDEX, 'async function weeklyVerseKst(', '\n}\n', 'weeklyVerseKst');
  assert.ok(kst.includes('const COLS = "no,ref_short,ref_full,ref,text,date,emoji";'), 'emoji 칸을 읽는다');
  assert.ok(kst.includes('startDay: x.v.date ? x.day : null'), '날짜 없는 구절은 며칠째를 쓰지 않는다');
  const fn = slice(INDEX, 'async function getWeeklyVerseForWidget(', '\n}\n', 'getWeeklyVerseForWidget');
  assert.ok(fn.includes('widgetVerseBadge(wk.meta.emoji, wk.meta.startDay, ymdDayNumber(ymd))'));
  assert.ok(fn.includes('out.badgeDate = ymd'));
  assert.ok(/if \(!\(b && b\.date\) && wk\.cur\.no != null && !wk\.meta\.emoji\) queueVerseEmojiFill\(/.test(fn),
    'AI 채움은 date 입력 없는 요청 · 이모지가 빈 구절에서만');
  assert.ok(!/\.\.\.wk\b(?!\.)/.test(fn), 'wk 를 통째로 펼치면 meta 가 응답에 실린다');
});
```

Run: `node --test tests/verse-badge.test.cjs`
Expected: FAIL — `import 줄`

- [ ] **Step 2: import 한 줄** — `supabase/functions/api/index.ts` 의 `import { clientError } from "./client-errors.ts";` 줄 바로 다음에

```ts
import { widgetVerseBadge, queueVerseEmojiFill } from "./verse-emoji.ts";   // 이번주 말씀 위젯 머리말 「🐑 3일째」(2026-10-13)
```

- [ ] **Step 3: `weeklyVerseKst` 에 meta** — 타입 줄과 함수를 아래처럼 바꾼다(머리 주석 ⚠️ 두 덩이는 그대로 둔다)

`type WidgetVerse = ...` 줄 다음에 한 줄 더한다:
```ts
type WidgetVerseMeta = { emoji: string | null; startDay: number | null };   // 위젯 머리말(badge)용 — 응답에 그대로 싣지 않는다
```

함수 머리를:
```ts
async function weeklyVerseKst(ymd: string): Promise<{ cur: WidgetVerse; prev: WidgetVerse | null; meta: WidgetVerseMeta } | null> {
  const COLS = "no,ref_short,ref_full,ref,text,date,emoji";
```

`const shape = ...` 정의 바로 다음에:
```ts
  const metaOf = (x: any): WidgetVerseMeta => ({
    emoji: x.v.emoji ?? null,
    startDay: x.v.date ? x.day : null,   // 날짜 없는 구절은 dayOf 가 「오늘」로 보지만 며칠째는 쓰지 않는다(매일 「새 말씀」이 된다)
  });
```

끝의 두 return 을:
```ts
  if (idx < 0) return { cur: shape(dated[0]), prev: null, meta: metaOf(dated[0]) };      // 앱의 「곧 시작할 말씀」
  return { cur: shape(dated[idx]), prev: idx > 0 ? shape(dated[idx - 1]) : null, meta: metaOf(dated[idx]) };
```

- [ ] **Step 4: `getWeeklyVerseForWidget`** — 함수 전체를

```ts
async function getWeeklyVerseForWidget(b: any) {
  const ymd = widgetYmd(b);
  const wk = await weeklyVerseKst(ymd);
  if (!wk) return {};
  const out: any = { ...wk.cur, prev: wk.prev };
  // 머리말 「🐑 3일째」(2026-10-13) — badgeDate 로 위젯이 「오늘 셈한 것인가」를 본다(어제 받아 적어 둔 「3일째」를 숨기려고)
  const badge = widgetVerseBadge(wk.meta.emoji, wk.meta.startDay, ymdDayNumber(ymd));
  if (badge) { out.badge = badge; out.badgeDate = ymd; }
  // 이모지가 빈 이번 구절 — 실제 오늘(date 입력 없음)에만 응답 뒤에 AI 로 채운다(시험판 date 로 앞날 구절의 AI 호출을 부르지 못하게)
  if (!(b && b.date) && wk.cur.no != null && !wk.meta.emoji) queueVerseEmojiFill(wk.cur.no, wk.cur.ref, wk.cur.text);
  return out;
}
```

- [ ] **Step 5: 시험 통과 · preflight**

Run: `node --test tests/verse-badge.test.cjs && node --test tests/api-split.test.cjs && python tools/preflight.py`
Expected: 모두 PASS. (`weeklyVerseKst` 를 부르는 다른 곳 — 묵상 `wk.cur` — 은 meta 를 안 쓰므로 그대로다: `grep -n "weeklyVerseKst(" supabase/functions/api/index.ts` 로 두 곳뿐인지 본다.)

- [ ] **Step 6: 스모크 스크립트** — `tests/verse-badge-smoke.py`

```python
"""이번주 말씀 위젯 머리말 「🐑 3일째」 스모크(2026-10-13) — 공개 키로 getWeeklyVerse 를 불러 badge 를 견준다(읽기만).

사용법:  python tests/verse-badge-smoke.py          개발(ktpwthwqzgcqcrmsafdo)
         python tests/verse-badge-smoke.py --prod   운영
보는 것:  ① date 없이 — badgeDate 가 오늘(한국) · 며칠째가 getVerses 의 시작일로 셈한 것과 같다
          ② date = 그 구절 시작일 — 「새 말씀」으로 끝난다
          ③ 이모지가 있나(없으면 「AI 채움 대기」로 알리고, 15초 뒤 한 번 더 부른다)
"""
import datetime as D
import json
import sys
import time
import urllib.request

PROD = "--prod" in sys.argv
URL = ("https://xnomlgydifiqiybervtf" if PROD else "https://ktpwthwqzgcqcrmsafdo") + ".supabase.co/functions/v1/api"
KEY = "sb_publishable_oLtieT_jw7Gjb8etEsy0jw_thBaDjl-" if PROD else "sb_publishable_eJKP6u95IU9_DBXTvnvYBA_-yGCf-0Y"
KST = D.timezone(D.timedelta(hours=9))


def call(body):
    req = urllib.request.Request(URL, data=json.dumps(body).encode("utf-8"), method="POST",
                                 headers={"apikey": KEY, "Authorization": "Bearer " + KEY,
                                          "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    today = D.datetime.now(KST).date()
    verses = {int(v["no"]): v for v in call({"action": "getVerses"}).get("verses", [])}
    w = call({"action": "getWeeklyVerse"})
    no = w.get("no")
    raw = (verses.get(int(no)) or {}).get("date") if no is not None else None
    start = D.datetime.fromisoformat(raw).astimezone(KST).date() if raw else None
    print(f"[{'운영' if PROD else '개발'}] 이번 구절 {no} · 시작 {start} · badge {w.get('badge')!r} · badgeDate {w.get('badgeDate')!r}")
    bad = []
    if w.get("badgeDate") != today.isoformat():
        bad.append(f"① badgeDate {w.get('badgeDate')} ≠ 오늘 {today}")
    if start and start <= today:
        n = (today - start).days + 1
        want = "새 말씀" if n == 1 else f"{n}일째"
        if not str(w.get("badge", "")).endswith(want):
            bad.append(f"① badge 끝이 {want!r} 가 아니다")
        first = call({"action": "getWeeklyVerse", "date": start.isoformat()})
        if first.get("no") == no and not str(first.get("badge", "")).endswith("새 말씀"):
            bad.append(f"② 시작일({start}) badge {first.get('badge')!r} — 「새 말씀」이 아니다")
    if " " not in str(w.get("badge", "")):
        print("③ 이모지 없음 — AI 채움 대기 · 15초 뒤 다시")
        time.sleep(15)
        again = call({"action": "getWeeklyVerse"})
        print(f"③ 다시: badge {again.get('badge')!r}")
    print("통과" if not bad else "실패:\n  " + "\n  ".join(bad))
    sys.exit(1 if bad else 0)


main()
```

- [ ] **Step 7: 커밋** — 배포 가드는 올라갈 파일이 깨끗해야(커밋돼야) 개발에도 올린다. 그래서 배포 앞에 커밋한다.

```bash
git status --short -- supabase/functions/api/     # index.ts 에 내 것 말고 남의 고침이 섞였는지 본다
# 섞이지 않았으면:
git add -- supabase/functions/api/index.ts tests/verse-badge.test.cjs tests/verse-badge-smoke.py
# 섞였으면: git diff -- supabase/functions/api/index.ts > "$TEMP/vb.patch" → 내 헝크(import 한 줄 · weeklyVerseKst · getWeeklyVerseForWidget)만
#           남기고 지운 뒤 git apply --cached "$TEMP/vb.patch" · 시험 두 파일은 git add -- 로
git diff --cached --stat     # 이 세 파일뿐인지 · index.ts 에 남의 헝크가 없는지
git commit -m "feat(위젯 머리말): getWeeklyVerse 에 badge·badgeDate — 이번 구절 이모지 + 며칠째 · 빈 이모지는 응답 뒤 AI 채움"
git show --stat HEAD
```

- [ ] **Step 8: 개발 배포 · 스모크** — 스킬 `fn-deploy` 차례

Run: `python tools/deploy-fn.py api --dev --allow-ahead`
Run: `python tests/verse-badge-smoke.py`
Expected: `badge` 가 「(이모지) N일째」 또는 「(이모지) 새 말씀」 · `통과`.

AI 채움 확인(개발): 스킬 `sql-migrate` 의 질의 길로 개발 DB 에서 이번 구절(스모크가 찍은 no)의 이모지를 비운다 —
`update public.verses set emoji = null where no = <그 no>;` → `python tests/verse-badge-smoke.py` 를 다시 돌린다.
Expected: 첫 응답은 「N일째」만, ③ 「15초 뒤 다시」에서 이모지가 붙는다. 붙지 않으면 개발 시크릿에 `ANTHROPIC_API_KEY` 가 있는지
(`supabase secrets list --project-ref ktpwthwqzgcqcrmsafdo` — 이름만 본다) · 함수 로그의 `fillVerseEmoji` 를 본다.
끝나면 그 구절 이모지를 Task 1 표의 값으로 되돌린다(AI 가 고른 것이 표와 다르면 표 값으로).

---

### Task 4: 운영 반영 — SQL → 푸시 → api → 스모크

**Files:** 없음(반영만) · `docs/notes/backend-api.md`(getWeeklyVerse 줄)

- [ ] **Step 1: 운영 SQL** — 스킬 `sql-migrate`(운영 `xnomlgydifiqiybervtf`) · 백업이 필요한지 그 스킬이 말하는 대로.
넣은 뒤 `python tools/sql-applied.py record supabase/verse_emoji.sql --prod --note "위젯 머리말 이모지"`
확인: `select count(*) from public.verses where no between 1 and 41 and emoji is not null;` → 41

- [ ] **Step 2: 문서 한 줄** — `docs/notes/backend-api.md` 에서 `getWeeklyVerse` 가 적힌 줄에 덧붙인다:
`· 2026-10-13 부터 badge(「🐑 3일째」)·badgeDate(셈한 한국 날짜) — 옛 위젯은 무시 · 이모지는 verses.emoji · 빈 것은 응답 뒤 AI 채움(verse-emoji.ts)`

- [ ] **Step 3: 커밋 · preflight · 푸시**

```bash
git add -- docs/notes/backend-api.md
git commit -m "docs(backend-api): getWeeklyVerse 머리말 칸 둘" -- docs/notes/backend-api.md
python tools/preflight.py && git push
```
Expected: pre-push 훅의 preflight 통과 · Actions 초록.

- [ ] **Step 4: 운영 api · 스모크** — 스킬 `fn-deploy`

Run: `python tools/deploy-fn.py api --prod`
Run: `python tests/verse-badge-smoke.py --prod`
Expected: 이번 구절 41 → `badge` 「🙏 N일째」(10/11 시작 — 10/13 이면 「🙏 3일째」) · `통과`.
`python tools/status.py` → api 파일 「같음」.

---

### Task 5: 안드로이드 위젯 — 머리줄 오른쪽 `widget_badge`

**Files:**
- Modify: `android-app/app/src/main/java/kr/onlybible/gocheok/memorize/widget/WidgetLogic.java`
- Modify: `android-app/app/src/test/java/kr/onlybible/gocheok/memorize/widget/WidgetLogicTest.java`
- Modify: `android-app/app/src/main/res/layout/widget_verse_medium.xml`
- Modify: `android-app/app/src/main/res/layout/widget_verse_large.xml`
- Modify: `android-app/app/src/main/java/kr/onlybible/gocheok/memorize/widget/VerseWidget.java`
- Modify: `tests/verse-badge.test.cjs`(⑤ 안드로이드)

**Interfaces:**
- Consumes: 응답의 `badge`, `badgeDate`(Task 3)
- Produces: `WidgetLogic.kstYmd(long nowMillis): String` · `WidgetLogic.verseBadge(JSONObject j, long nowMillis): String`

- [ ] **Step 1: 실패하는 JUnit 시험** — `WidgetLogicTest.java` 의 마지막 `}` 앞에

```java
    // ── 이번주 말씀 머리말(2026-10-13) — badgeDate 가 오늘(한국)일 때만. 어제 받아 둔 「3일째」는 사실이 아니게 된다 ──
    @Test public void kstYmd_aroundKstMidnight() {
        assertEquals("2026-10-13", WidgetLogic.kstYmd(t("2026-10-13T14:59:59Z")));   // KST 23:59:59
        assertEquals("2026-10-14", WidgetLogic.kstYmd(t("2026-10-13T15:00:00Z")));   // KST 다음 날 00:00
    }

    @Test public void verseBadge_shownOnSameKstDay() throws Exception {
        JSONObject json = j("{\"text\":\"말씀\",\"badge\":\"🐑 3일째\",\"badgeDate\":\"2026-10-13\"}");
        assertEquals("🐑 3일째", WidgetLogic.verseBadge(json, t("2026-10-12T15:00:00Z")));   // KST 10-13 00:00
        assertEquals("🐑 3일째", WidgetLogic.verseBadge(json, t("2026-10-13T14:59:59Z")));   // KST 10-13 23:59:59
    }

    @Test public void verseBadge_hiddenAfterKstMidnight() throws Exception {
        JSONObject json = j("{\"text\":\"말씀\",\"badge\":\"🐑 3일째\",\"badgeDate\":\"2026-10-13\"}");
        assertEquals("", WidgetLogic.verseBadge(json, t("2026-10-13T15:00:00Z")));
    }

    @Test public void verseBadge_missingFieldsHide() throws Exception {
        long now = t("2026-10-13T01:00:00Z");
        assertEquals("", WidgetLogic.verseBadge(j("{\"text\":\"말씀\",\"badge\":\"🐑 3일째\"}"), now));
        assertEquals("", WidgetLogic.verseBadge(j("{\"text\":\"말씀\",\"badgeDate\":\"2026-10-13\"}"), now));
        assertEquals("", WidgetLogic.verseBadge(null, now));
    }
```

Run(`android-app/` 에서): `./gradlew --no-daemon testDevDebugUnitTest`
Expected: FAIL — `cannot find symbol: method kstYmd`

- [ ] **Step 2: WidgetLogic 에 두 함수** — `verseUrl` 다음, `// ── 돌려 보기 위젯` 줄 앞에

```java
    /** 한국 날짜 「YYYY-MM-DD」 — 서버 badgeDate 와 견준다. java.time 대신 SimpleDateFormat(안드로이드 8.0 미만에도 있다). */
    public static String kstYmd(long nowMillis) {
        java.text.SimpleDateFormat f = new java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US);
        f.setTimeZone(java.util.TimeZone.getTimeZone("Asia/Seoul"));
        return f.format(new java.util.Date(nowMillis));
    }

    /**
     * 이번주 말씀 머리말 「🐑 3일째」(2026-10-13) — 서버가 셈한 날(badgeDate)이 오늘(한국)일 때만.
     * 받기에 실패해 적어 둔 것으로 그릴 때 어제의 「3일째」가 오늘 남지 않게 한다.
     */
    public static String verseBadge(JSONObject j, long nowMillis) {
        String badge = str(j, "badge").trim();
        if (badge.isEmpty()) return "";
        return str(j, "badgeDate").equals(kstYmd(nowMillis)) ? badge : "";
    }
```

Run: `./gradlew --no-daemon testDevDebugUnitTest`
Expected: PASS(새 넷 포함 전부)

- [ ] **Step 3: 두 레이아웃 머리줄** — `widget_verse_medium.xml` 의 머리줄 `LinearLayout`(마크+이름)을 통째로:

```xml
    <!-- 머리줄 — 마크 · 이름 · (오른쪽 끝) 머리말 「🐑 3일째」(2026-10-13 · 없으면 gone). 새 줄을 만들지 않는다 — 69자 구절이 잘린다. -->
    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:gravity="center_vertical"
        android:orientation="horizontal">
        <ImageView
            android:layout_width="wrap_content"
            android:layout_height="16dp"
            android:adjustViewBounds="true"
            android:importantForAccessibility="no"
            android:src="@drawable/church_mark" />
        <TextView
            android:id="@+id/widget_title"
            android:layout_width="0dp"
            android:layout_height="wrap_content"
            android:layout_marginStart="4dp"
            android:layout_weight="1"
            android:ellipsize="end"
            android:maxLines="1"
            android:text="@string/widget_verse_name"
            android:textColor="@color/widget_secondary"
            android:textSize="11sp" />
        <TextView
            android:id="@+id/widget_badge"
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:layout_marginStart="8dp"
            android:maxLines="1"
            android:textColor="@color/widget_secondary"
            android:textSize="11sp"
            android:visibility="gone" />
    </LinearLayout>
```

`widget_verse_large.xml` 도 같은 꼴로(값만 다르다 — 마크 높이 `22dp` · 이름 `layout_marginStart="6dp"` · 두 글씨 `15sp`):

```xml
    <!-- 머리줄 — 마크 · 이름 · (오른쪽 끝) 머리말 「🐑 3일째」(2026-10-13 · 없으면 gone). -->
    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:gravity="center_vertical"
        android:orientation="horizontal">
        <ImageView
            android:layout_width="wrap_content"
            android:layout_height="22dp"
            android:adjustViewBounds="true"
            android:importantForAccessibility="no"
            android:src="@drawable/church_mark" />
        <TextView
            android:id="@+id/widget_title"
            android:layout_width="0dp"
            android:layout_height="wrap_content"
            android:layout_marginStart="6dp"
            android:layout_weight="1"
            android:ellipsize="end"
            android:maxLines="1"
            android:text="@string/widget_verse_name"
            android:textColor="@color/widget_secondary"
            android:textSize="15sp" />
        <TextView
            android:id="@+id/widget_badge"
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:layout_marginStart="8dp"
            android:maxLines="1"
            android:textColor="@color/widget_secondary"
            android:textSize="15sp"
            android:visibility="gone" />
    </LinearLayout>
```
(⚠️ 빈칸을 밀어 주는 데 `<View>` 를 쓰지 말 것 — RemoteViews 가 못 부풀리는 판이 있다. 이름 칸의 `layout_weight="1"` 이 그 일을 한다.)

- [ ] **Step 4: VerseWidget.render** — 두 갈래에 한 줄씩

```java
        if (WidgetLogic.verseValid(json)) {
            v.setTextViewText(R.id.widget_body, WidgetLogic.str(json, "text"));
            setTextOrHide(v, R.id.widget_ref, WidgetLogic.str(json, "ref"));
            setTextOrHide(v, R.id.widget_badge, WidgetLogic.verseBadge(json, System.currentTimeMillis()));
        } else {
            v.setTextViewText(R.id.widget_body, c.getString(R.string.widget_verse_fail));
            setTextOrHide(v, R.id.widget_ref, "");
            setTextOrHide(v, R.id.widget_badge, "");
        }
```

- [ ] **Step 5: 배선 시험 ⑤(안드로이드)** — `tests/verse-badge.test.cjs` 끝에

```js
test('⑤ 안드로이드 — 두 레이아웃에 widget_badge(처음엔 gone) · VerseWidget 이 오늘 견준 값을 넣는다', () => {
  const RES = ['android-app', 'app', 'src', 'main', 'res', 'layout'];
  for (const f of ['widget_verse_medium.xml', 'widget_verse_large.xml']) {
    const x = read(...RES, f);
    const badge = slice(x, 'android:id="@+id/widget_badge"', '/>', f);
    assert.ok(badge.includes('android:visibility="gone"'), f + ' — 처음엔 숨김');
    assert.ok(badge.includes('android:maxLines="1"'), f + ' — 한 줄');
    assert.ok(!/<View\b/.test(x), f + ' — RemoteViews 에 <View> 금지');
  }
  const vw = read('android-app', 'app', 'src', 'main', 'java', 'kr', 'onlybible', 'gocheok', 'memorize', 'widget', 'VerseWidget.java');
  assert.ok(vw.includes('setTextOrHide(v, R.id.widget_badge, WidgetLogic.verseBadge(json, System.currentTimeMillis()));'));
});
```

Run: `node --test tests/verse-badge.test.cjs && ./gradlew --no-daemon testDevDebugUnitTest assembleDevDebug`(`android-app/` 에서)
Expected: PASS · 시험판 APK 생성.

- [ ] **Step 6: 시험판 실기기(가능하면)** — 스킬 `store-release` 의 시험판 길(`adb install -r app/build/outputs/apk/dev/debug/app-dev-debug.apk`). 시험판은 개발 서버를 보므로 개발 이번 구절의 머리말이 보이면 된다. 볼 것: 머리줄 오른쪽 「(이모지) N일째」 · 본문이 안 잘림 · 어두운 모드.
adb 가 안 붙어 있으면 이 단계는 건너뛰고 친구 확인으로 넘긴다(Task 7).

- [ ] **Step 7: 커밋**

```bash
git add -- android-app/app/src/main/java/kr/onlybible/gocheok/memorize/widget/WidgetLogic.java android-app/app/src/test/java/kr/onlybible/gocheok/memorize/widget/WidgetLogicTest.java android-app/app/src/main/res/layout/widget_verse_medium.xml android-app/app/src/main/res/layout/widget_verse_large.xml android-app/app/src/main/java/kr/onlybible/gocheok/memorize/widget/VerseWidget.java tests/verse-badge.test.cjs
git commit -m "feat(안드로이드 위젯): 이번주 말씀 머리줄 오른쪽 「🐑 3일째」 — 오늘(한국) 셈한 것만" -- android-app/app/src/main/java/kr/onlybible/gocheok/memorize/widget/WidgetLogic.java android-app/app/src/test/java/kr/onlybible/gocheok/memorize/widget/WidgetLogicTest.java android-app/app/src/main/res/layout/widget_verse_medium.xml android-app/app/src/main/res/layout/widget_verse_large.xml android-app/app/src/main/java/kr/onlybible/gocheok/memorize/widget/VerseWidget.java tests/verse-badge.test.cjs
git show --stat HEAD
```

---

### Task 6: 아이폰 위젯 — `WidgetHeader(trailing:)` · 자정 장 (두 벌)

**Files:**
- Modify: `ios-app/native/TodayVerseWidget/WidgetShared.swift` 와 `ios-app/ios/App/TodayVerseWidget/WidgetShared.swift`(같게)
- Modify: `ios-app/native/TodayVerseWidget/TodayVerseWidget.swift` 와 `ios-app/ios/App/TodayVerseWidget/TodayVerseWidget.swift`(같게)
- Modify: `tests/verse-badge.test.cjs`(⑤ 아이폰)

**Interfaces:**
- Consumes: 응답의 `badge`, `badgeDate`(Task 3)
- Produces: `func kstYmd(_ date: Date) -> String` · `WidgetHeader(title:large:trailing:)`(trailing 기본 nil — 묵상·기도문·돌려 보기 호출은 그대로 컴파일된다)

- [ ] **Step 1: 실패하는 배선 시험** — `tests/verse-badge.test.cjs` 끝에

```js
test('⑤ 아이폰 — 위젯 코드 두 벌이 같다 · badgeDate 를 장의 날짜(한국)와 견준다 · 자정에 장을 하나 더 깐다', () => {
  for (const f of ['TodayVerseWidget.swift', 'WidgetShared.swift', 'TodayVerseWidgetBundle.swift', 'MeditationWidget.swift', 'BlessingWidget.swift']) {
    assert.equal(read('ios-app', 'native', 'TodayVerseWidget', f), read('ios-app', 'ios', 'App', 'TodayVerseWidget', f),
      f + ' — native/ 와 ios/App/ 이 다르다(두 벌을 같이 고친다)');
  }
  const sh = read('ios-app', 'native', 'TodayVerseWidget', 'WidgetShared.swift');
  assert.ok(sh.includes('func kstYmd(_ date: Date) -> String'));
  assert.ok(sh.includes('var trailing: String? = nil'), 'WidgetHeader 의 새 칸은 기본값 nil — 다른 위젯 호출이 그대로 컴파일된다');
  const tv = read('ios-app', 'native', 'TodayVerseWidget', 'TodayVerseWidget.swift');
  assert.ok(tv.includes('entry.badgeDate == kstYmd(entry.date)'), '오늘 셈한 머리말만');
  assert.ok(tv.includes('Timeline(entries: [now, after], policy: .after(when))'), '자정에 머리말 없는 장');
  assert.ok((tv.match(/trailing: badgeText/g) || []).length === 2, '중간·크게 두 곳');
  assert.ok(!/accessory[A-Za-z]*:[\s\S]{0,400}trailing/.test(tv), '잠금 화면에는 넣지 않는다');
});
```

Run: `node --test tests/verse-badge.test.cjs`
Expected: FAIL — `func kstYmd` 없음

- [ ] **Step 2: WidgetShared.swift** — `nextKSTMidnight()` 함수 다음에:

```swift
// 한국 날짜 「YYYY-MM-DD」 — 이번주 말씀 머리말의 badgeDate 와 견준다(2026-10-13).
func kstYmd(_ date: Date) -> String {
    let f = DateFormatter()
    f.calendar = Calendar(identifier: .gregorian)
    f.locale = Locale(identifier: "en_US_POSIX")
    f.timeZone = TimeZone(identifier: "Asia/Seoul")
    f.dateFormat = "yyyy-MM-dd"
    return f.string(from: date)
}
```

`WidgetHeader` 를 통째로:

```swift
struct WidgetHeader: View {
    let title: String
    var large: Bool = false
    // 오른쪽 끝 한 줄 — 이번주 말씀의 머리말 「🐑 3일째」(2026-10-13). 없으면 지금 모양 그대로(묵상·기도문·돌려 보기).
    var trailing: String? = nil

    var body: some View {
        HStack(spacing: large ? 6 : 4) {
            Image("ChurchMark")
                .resizable()
                .scaledToFit()
                // 13pt 로 먼저 그려 봤더니 마크가 점처럼 보였다 — 글씨보다 한 치수 크게 둔다.
                // (그림은 24pt 기준 3배까지 있어 22pt 로 써도 흐려지지 않는다)
                .frame(height: large ? 22 : 16)
                .accessibilityHidden(true)
            Text(title)
                .font(large ? .subheadline : .caption2)
                .foregroundStyle(.secondary)
                .lineLimit(1)
            if let trailing = trailing, !trailing.isEmpty {
                Spacer(minLength: 8)
                Text(trailing)
                    .font(large ? .subheadline : .caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
        }
    }
}
```

- [ ] **Step 3: TodayVerseWidget.swift** — 엔트리·만들기·타임라인·화면

`VerseEntry` 를:
```swift
struct VerseEntry: TimelineEntry {
    let date: Date
    let no: Int?
    let reference: String
    let text: String
    let badge: String       // 머리줄 오른쪽 「🐑 3일째」(2026-10-13) — badgeDate 가 이 장의 날짜(한국)와 같을 때만 보인다
    let badgeDate: String
}
```

`verseEntry(from:)` 를:
```swift
private func verseEntry(from json: [String: Any]?, date: Date = Date()) -> VerseEntry {
    guard let json = json, let text = json["text"] as? String, !text.isEmpty else {
        return VerseEntry(date: date, no: nil, reference: "", text: "말씀을 불러오지 못했습니다", badge: "", badgeDate: "")
    }
    return VerseEntry(date: date,
                      no: json["no"] as? Int,
                      reference: json["ref"] as? String ?? "",
                      text: text,
                      badge: json["badge"] as? String ?? "",
                      badgeDate: json["badgeDate"] as? String ?? "")
}
```

`placeholder` 의 `VerseEntry(...)` 에 `badge: "", badgeDate: ""` 를 더한다:
```swift
        VerseEntry(date: Date(), no: nil, reference: "요한복음 3:16",
                   text: "하나님이 세상을 이처럼 사랑하사 독생자를 주셨으니", badge: "", badgeDate: "")
```

`getTimeline` 을:
```swift
    func getTimeline(in context: Context, completion: @escaping (Timeline<VerseEntry>) -> Void) {
        fetchWithFallback(kind: verseWidgetKind, action: "getWeeklyVerse", isValid: verseIsValid) { json, fresh in
            let midnight = nextKSTMidnight()
            let now = verseEntry(from: json)
            // 자정에 같은 내용의 장을 하나 더 — 그 장은 날짜가 바뀌어 머리말이 숨는다.
            // 시스템이 새로 받기를 미뤄도 어제의 「3일째」가 오늘 남지 않는다(2026-10-13).
            let after = verseEntry(from: json, date: midnight)
            let when = refreshDate(fresh: fresh, next: midnight)
            completion(Timeline(entries: [now, after], policy: .after(when)))
        }
    }
```

`TodayVerseWidgetView` 의 `link` 다음에:
```swift
    // 머리말은 서버가 오늘 셈한 것만 — 적어 둔 어제 응답의 「3일째」는 사실이 아니게 된다
    private var badgeText: String? {
        guard !entry.badge.isEmpty, entry.badgeDate == kstYmd(entry.date) else { return nil }
        return entry.badge
    }
```

두 곳의 머리글을:
- `.systemLarge` 갈래: `WidgetHeader(title: "이번주 말씀", large: true, trailing: badgeText)`
- `default`(중간) 갈래: `WidgetHeader(title: "이번주 말씀", trailing: badgeText)`

(잠금 화면 두 갈래 `.accessoryInline`·`.accessoryRectangular` 는 손대지 않는다.)

- [ ] **Step 4: 두 벌 맞추기**

```bash
cp ios-app/native/TodayVerseWidget/WidgetShared.swift ios-app/ios/App/TodayVerseWidget/WidgetShared.swift
cp ios-app/native/TodayVerseWidget/TodayVerseWidget.swift ios-app/ios/App/TodayVerseWidget/TodayVerseWidget.swift
```

Run: `node --test tests/verse-badge.test.cjs && python tools/preflight.py`
Expected: PASS(①~⑤ 전부)

- [ ] **Step 5: 커밋**

```bash
git add -- ios-app/native/TodayVerseWidget/WidgetShared.swift ios-app/ios/App/TodayVerseWidget/WidgetShared.swift ios-app/native/TodayVerseWidget/TodayVerseWidget.swift ios-app/ios/App/TodayVerseWidget/TodayVerseWidget.swift tests/verse-badge.test.cjs
git commit -m "feat(아이폰 위젯): 이번주 말씀 머리줄 오른쪽 「🐑 3일째」 — 오늘 셈한 것만 · 자정에 머리말 없는 장" -- ios-app/native/TodayVerseWidget/WidgetShared.swift ios-app/ios/App/TodayVerseWidget/WidgetShared.swift ios-app/native/TodayVerseWidget/TodayVerseWidget.swift ios-app/ios/App/TodayVerseWidget/TodayVerseWidget.swift tests/verse-badge.test.cjs
git show --stat HEAD
```

---

### Task 7: 판 올리기 · 빌드 · 문서 · 친구 몫

**Files:**
- Modify: `ios-app/ios/App/App.xcodeproj/project.pbxproj`(`MARKETING_VERSION = 1.1.1;` 네 곳 → `1.1.2`)
- Modify: `android-app/app/build.gradle`(`versionCode 5` → `6` · `versionName "1.1.1"` → `"1.1.2"`)
- Modify: `docs/notes/android-app.md` · `docs/notes/ios-app.md`(새 절) · `CLAUDE.md`(다음 작업 한 줄) · 설계 문서(진행 표시)

- [ ] **Step 1: 판 번호**

```bash
sed -i 's/MARKETING_VERSION = 1\.1\.1;/MARKETING_VERSION = 1.1.2;/' ios-app/ios/App/App.xcodeproj/project.pbxproj
grep -c "MARKETING_VERSION = 1.1.2;" ios-app/ios/App/App.xcodeproj/project.pbxproj     # Expected: 4
sed -i 's/versionCode 5$/versionCode 6/; s/versionName "1\.1\.1"/versionName "1.1.2"/' android-app/app/build.gradle
grep -n "versionCode\|versionName" android-app/app/build.gradle                       # Expected: 6 · "1.1.2"
```

- [ ] **Step 2: 안드로이드 정식판 빌드** — 스킬 `store-release`(서명 `keystore.properties` · 키 커밋 금지)

Run(`android-app/` 에서): `./gradlew --no-daemon testDevDebugUnitTest bundleProdRelease`
결과 .aab 를 저장소 밖 `C:\Projects\성경암송-1.1.2-위젯머리말\성경암송-1.1.2-versionCode6.aab` 로 옮긴다(지난 판과 같은 자리 규칙).

- [ ] **Step 3: 문서**
- `docs/notes/android-app.md` · `docs/notes/ios-app.md` 끝에 같은 뜻의 절:
  `## 이번주 말씀 머리말 「🐑 3일째」(2026-10-13 · 아이폰 1.1.2 · 안드로이드 versionCode 6)` — 무엇(머리줄 오른쪽 · 서버 badge 그대로 · badgeDate 가 오늘일 때만) · ⚠️ 새 줄 금지(69자) · 잠금 화면 금지 · 끄는 법(api 가 badge 를 안 보내면 지금 모양) · 설계 문서 링크.
- `CLAUDE.md` 「다음 작업」에 한 줄:
  `- [ ] 🐑 **이번주 말씀 위젯 머리말 「🐑 3일째」 — 서버·SQL 운영(2026-10-13) · 아이폰 1.1.2 / 안드로이드 versionCode 6 업로드는 친구.** 나간 뒤 실기기(머리말 · 69자 안 잘림 · 비행기 모드로 하루 넘기면 숨음 · 낮은 안드로이드에서 □ 아님). 읽을 것 docs/superpowers/specs/2026-10-13-verse-widget-badge-design.md`
- 설계 문서 머리에 `진행: 서버·SQL 운영 · 위젯 판 빌드(업로드 대기)` 한 줄.

- [ ] **Step 4: 커밋 · preflight · 푸시**

```bash
git add -- ios-app/ios/App/App.xcodeproj/project.pbxproj android-app/app/build.gradle docs/notes/android-app.md docs/notes/ios-app.md CLAUDE.md docs/superpowers/specs/2026-10-13-verse-widget-badge-design.md
git diff --cached --stat        # 이 여섯 파일뿐인지
git commit -m "chore(위젯 머리말): 아이폰 1.1.2 · 안드로이드 versionCode 6 — 문서"
python tools/preflight.py && git push
```

- [ ] **Step 5: 친구에게 넘길 것**(스킬 `store-release` 의 친구 몫 그대로)
- 안드로이드: Play Console 업로드(내부 테스트 → 확인 → 프로덕션) — .aab 자리 알려 드리기.
- 아이폰: Codemagic 빌드 → TestFlight → 심사(맥이 없어 **컴파일은 Codemagic 이 처음** — 실패하면 로그를 받아 고친다).
- 실기기 확인표: 머리말이 보이나 · 69자 구절(삼상 26:24 — 지금 구절이 아니면 넘어감)이 안 잘리나 · 어두운 모드 · 큰 글씨 · 비행기 모드로 자정을 넘기면 머리말이 숨나 · 안드로이드 낮은 판에서 이모지가 □ 가 아닌가.
- 다음 새 구절(42 · 10/18 무렵)이 들어온 날, 운영 스모크(`python tests/verse-badge-smoke.py --prod`)로 AI 가 이모지를 채웠는지 · 고른 것이 어울리는지 함께 본다.
