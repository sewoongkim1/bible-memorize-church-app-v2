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
const stripVs = (s) => String(s ?? "").replace(/️/g, "").trim();

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
