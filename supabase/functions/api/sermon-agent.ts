// ============================================================
// 💬 「내게 주시는 말씀」 에이전트(2026-11-20) — api 의 한 영역
//   액션 sermonAgent 는 index.ts 의 switch 가 부른다 — case "sermonAgent" → sermonAgentStream(body, AGENT_DEPS).
//   ⚠️ 손대기 전에 docs/superpowers/specs/2026-11-20-sermon-agent-design.md(줄 꼴 §2-1 · 도구 §2-2 · 돌림 §2-3 · 되묻기 §2-4 · 저장 §2-5).
//   ⚠️ json() 이 아니라 NDJSON 흐름(Response)을 돌려준다 — 한 줄 = 한 사건(step · answer · fallback).
//   ⚠️ index.ts 를 들여오지 않는다(들머리와 고리) — index.ts 의 도우미는 deps(AGENT_DEPS)로 받는다.
//   ⚠️ sermonChat(index.ts)은 손대지 않는다 — 문(scAgent)이 닫힌 분과 되돌림(fallback)이 그 길을 쓴다.
// ============================================================

// ── 에이전트 — 순수 함수 (여기부터) ──
//   tests/sermon-agent.test.cjs 가 이 구간만 잘라(export 를 떼고) node:vm 에서 돌린다 — 타입 표기 · import 를 넣지 말 것.

// 상한(설계 §2-3) · give_answer 검증 수(§2-2) · 찾기 수
export const AGENT_LIMITS = { tools: 4, ai: 5, ms: 40000, verses: 2, chips: 3, chipLen: 30, whyLen: 60, sermonHits: 5, verseHits: 6, minSim: 0.4 };
const AGENT_ANSWER_MAX = 4000;   // 답 글자 수(코드포인트) — 2~4문단이면 넉넉하다

// 흐름 한 줄 — JSON 은 글 안의 줄바꿈을 \n 으로 적으므로 줄바꿈은 끝에 하나뿐이다
export function ndjsonLine(obj) {
  return JSON.stringify(obj) + "\n";
}

// 이 성도님께 보이는 구절 묶음 — 주간은 늘 · 주제별(navi) · 쉴만한 물가(psalm)는 === true 일 때만
//   (화면의 naviVisible · psalmVisible 과 같은 판정을 서버가 다시 한다 — 앱이 보낸 값은 믿지 않는다)
export function agentTracksFor(cfg) {
  const c = cfg && typeof cfg === "object" ? cfg : {};
  const out = ["weekly"];
  if (c.naviPublic === true) out.push("navi");
  if (c.psalmPublic === true) out.push("psalm");
  return out;
}

// 공백을 하나로 · 앞뒤를 걷고 · 코드포인트로 n 자(이모지 · 한글이 반으로 잘리지 않게)
function agentClip(s, n) {
  return Array.from(String(s == null ? "" : s).replace(/\s+/g, " ").trim()).slice(0, n).join("").trim();
}

// give_answer 입력 → 화면에 내보낼 꼴. 답이 비면 null(→ fallback).
//   구절 번호 · sermon_id 는 **이번 대화에서 도구가 실제로 돌려준 것**(seen)만 남긴다 — AI 가 지어낸 번호를 막는다.
//   seen 의 Set 은 instanceof 로 보지 않는다(시험의 vm 은 Set 이 다른 영역이다) — has 가 있으면 쓴다.
export function sanitizeAgentAnswer(raw, seen) {
  const r = raw && typeof raw === "object" ? raw : {};
  const answer = Array.from(String(r.answer == null ? "" : r.answer).trim()).slice(0, AGENT_ANSWER_MAX).join("").trim();
  if (!answer) return null;
  const vs = seen && seen.verseNos && typeof seen.verseNos.has === "function" ? seen.verseNos : null;
  const ss = seen && seen.sermonIds && typeof seen.sermonIds.has === "function" ? seen.sermonIds : null;
  const verses = [];
  const used = [];
  for (const v of (Array.isArray(r.verses) ? r.verses : [])) {
    if (verses.length >= AGENT_LIMITS.verses) break;
    const no = Number(v && v.no);
    if (!Number.isInteger(no) || !vs || !vs.has(no) || used.indexOf(no) >= 0) continue;
    used.push(no);
    verses.push({ no, why: agentClip(v.why, AGENT_LIMITS.whyLen) });
  }
  let sermon = null;
  const s = r.sermon;
  if (s && typeof s === "object" && ss) {
    const sid = String(s.sermon_id == null ? "" : s.sermon_id);
    if (sid && ss.has(sid)) sermon = { sermon_id: sid, why: agentClip(s.why, AGENT_LIMITS.whyLen) };
  }
  const chips = [];
  for (const c of (Array.isArray(r.chips) ? r.chips : [])) {
    if (chips.length >= AGENT_LIMITS.chips) break;
    const t = agentClip(c, AGENT_LIMITS.chipLen);
    if (t && chips.indexOf(t) < 0) chips.push(t);
  }
  return { answer, verses, sermon, chips };
}

// 문(app_config scAgent) — "on" 모두 · "test" 🧪 시험 참여자(ministryTesters) · 그 밖(빈 값 · 모르는 값)은 닫힘
export function scAgentGate(value, isTester) {
  if (value === "on") return true;
  if (value === "test") return isTester === true;
  return false;
}

// 마지막 차례의 tool_choice — give_answer 를 꼭 부르게.
//   억지 고르기({type:"tool"})는 Claude Opus 5.5 · Sonnet 5.5 · Fable 5.1/5.2(Mythos 도) 에서 400 이고, 그 밖의 5세대(Opus 5 · Sonnet 5 ·
//   Haiku 5.5 · Fable 5)는 thinking 을 안 보내면 생각이 켜진 채로 돌아 억지 고르기를 못 쓴다(생각과 함께는 auto · none 만).
//   4세대(opus-4-8 · 4-7 · 4-6 · sonnet-4-6 · haiku-4-5)는 thinking 을 안 보내면 생각 없이 돌아 억지 고르기를 받는다
//   → 4세대에만 억지로 · 나머지는 auto + 지시 글(agentNudge) · 그래도 give_answer 가 없으면 fallback(지금 길).
//   (2026-11-20 스킬 claude-api 로 확인 — 이 요청은 thinking 을 보내지 않는다. 모델 표가 바뀌면 이 판정과 시험 ⑥ 을 함께 고친다.)
export function agentFinalChoice(model) {
  const m = String(model == null ? "" : model);
  if (/^claude-(opus|sonnet|haiku)-4(-|$)/.test(m)) return { type: "tool", name: "give_answer" };
  return { type: "auto" };
}

// 첫 user 글 — 성도님 글(질문 · 단추)은 **믿지 않는 입력**이다. 꺾쇠를 걷어 태그를 닫거나 열지 못하게 하고 태그 안에 둔다.
//   prevNote 는 서버가 DB 에서 다시 꺼낸 교회 자료(앞에서 권한 구절 · 설교)다 — 화면이 보낸 글이 아니다.
export function agentUserText(message, chip, prevNote) {
  const clean = (s) => String(s == null ? "" : s).replace(/[<>]/g, " ").trim();
  const parts = ["<질문>\n" + clean(message) + "\n</질문>"];
  const c = clean(chip);
  if (c) {
    parts.push(String(prevNote == null ? "" : prevNote) || "[앞에서 권한 것은 다시 찾지 못했다]");
    parts.push("<되묻기 단추>\n" + c + "\n</되묻기 단추>");
    parts.push("성도님이 위 되묻기 단추를 눌렀다. 단추의 뜻에 맞게, 앞에서 권한 구절 · 설교와 겹치지 않게 새로 찾아 답하라.");
  }
  return parts.join("\n\n");
}
// ── 에이전트 — 순수 함수 (여기까지) ──
