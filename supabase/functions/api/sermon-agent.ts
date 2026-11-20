// ============================================================
// 💬 「내게 주시는 말씀」 에이전트(2026-11-20) — api 의 한 영역
//   액션 sermonAgent 는 index.ts 의 switch 가 부른다 — case "sermonAgent" → sermonAgentStream(body, AGENT_DEPS).
//   ⚠️ 손대기 전에 docs/superpowers/specs/2026-11-20-sermon-agent-design.md(줄 꼴 §2-1 · 도구 §2-2 · 돌림 §2-3 · 되묻기 §2-4 · 저장 §2-5).
//   ⚠️ json() 이 아니라 NDJSON 흐름(Response)을 돌려준다 — 한 줄 = 한 사건(step · answer · fallback).
//   ⚠️ index.ts 를 들여오지 않는다(들머리와 고리) — index.ts 의 도우미는 deps(AGENT_DEPS)로 받는다.
//   ⚠️ sermonChat(index.ts)은 손대지 않는다 — 문(scAgent)이 닫힌 분과 되돌림(fallback)이 그 길을 쓴다.
// ============================================================
import { getPsalmVerses } from "./psalm.ts";   // 쉴만한 물가 잠금 — 안 열린 편은 안 내려보낸다(같은 판정을 쓴다)

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

// ---------- 형 ----------
// deps 의 꼴 — index.ts 의 AGENT_DEPS 가 채운다.
//   ⚠️ "db" 는 따옴표로 둔다 — tests/api-split.test.cjs ⑤ 가 맨 이름 db 를 _shared.ts 의 것으로 보고 「들여오지 않았다」로 막는다. 늘 deps.db 로 부른다.
type AgentDeps = {
  "db": any;
  embedVoyage: (texts: string[], inputType: "document" | "query") => Promise<number[][]>;
  sermonQuestionKey: (m: unknown) => string;
  kstDayStartIso: () => string;
  ministryIsTester: (userId: string) => Promise<boolean>;
  readConfig: (key: string) => Promise<any>;
  cors: Record<string, string>;
  chat: { maxChars: number; perDay: number; allPerDay: number };
};
type AgentVerse = { no: number; track: string; ref: string; text: string };
type AgentRun = {
  seen: { verseNos: Set<number>; sermonIds: Set<string> };   // 도구가 실제로 돌려준 것 — sanitizeAgentAnswer 가 본다
  hits: Map<string, any>;                // sermon_id → 처음 잡힌 발췌 줄(출처 칸을 만든다)
  verseInfo: Map<number, AgentVerse>;    // find_verses 가 돌려준 구절(답 줄의 ref · text · track)
  visible: Map<number, AgentVerse> | null;   // 이 성도님께 보이는 구절(한 번만 읽는다)
  tracks: string[];
  toolCalls: number; aiCalls: number; inTok: number; outTok: number; stepId: number;
  sermonDone: boolean; verseDone: boolean;
};
type AgentSend = (obj: Record<string, unknown>) => void;

// ---------- 도구 ① search_sermons — sermonChat 과 같은 길(Voyage → match_sermon_chunks 5개 → 유사도 0.4 이상) ----------
async function agentSearchSermons(deps: AgentDeps, run: AgentRun, query: string): Promise<{ n: number; content: string }> {
  const [qvec] = await deps.embedVoyage([query], "query");
  const { data, error } = await deps.db.rpc("match_sermon_chunks", { query_embedding: qvec, match_count: AGENT_LIMITS.sermonHits });
  if (error) throw error;
  const hits = (data ?? []).filter((m: any) => m.similarity >= AGENT_LIMITS.minSim);
  const ids = new Set<string>();
  for (const m of hits) {
    const sid = String(m.sermon_id);
    ids.add(sid);
    run.seen.sermonIds.add(sid);
    if (!run.hits.has(sid)) run.hits.set(sid, m);
  }
  if (!hits.length) return { n: 0, content: "이 찾을 말로는 유사도 0.4 이상인 설교 발췌가 없다." };
  const content = hits.map((m: any, i: number) =>
    `[발췌 ${i + 1}] sermon_id=${m.sermon_id} · ${m.title} (${m.svc_date ?? "날짜미상"} · ${m.scripture ?? ""})\n${m.content}`
  ).join("\n\n");
  return { n: ids.size, content };
}

// ---------- 도구 ② find_verses — 이 성도님께 보이는 묶음의 구절만 ----------
// 보이는 구절 — 주간: 아직 오지 않은 주(date 가 지금 뒤)는 뺀다 · 물가: getPsalmVerses() 가 돌려준(열린) 편만 · navi: tracks 에 있을 때 전부.
async function agentVisibleVerses(deps: AgentDeps, run: AgentRun): Promise<Map<number, AgentVerse>> {
  if (run.visible) return run.visible;
  const { data, error } = await deps.db.from("verses").select("no, track, ref, text, date")
    .eq("is_active", true).in("track", run.tracks);
  if (error) throw error;
  let psalmOpen: Set<number> | null = null;
  if (run.tracks.includes("psalm")) {
    const p: any = await getPsalmVerses();
    psalmOpen = new Set((p?.verses ?? []).map((v: any) => Number(v.no)));
  }
  // 한국 날짜 번호 — 화면 getWeeklyVerseInfo(kstDayNumber)와 같은 셈: 날짜가 오늘(한국) 이전인 주만 「온 주」다
  const kd = (ms: number) => Math.floor((ms + 9 * 3600 * 1000) / 86400000);
  const today = kd(Date.now());
  const map = new Map<number, AgentVerse>();
  for (const v of data ?? []) {
    const no = Number(v.no);
    if (!v.text) continue;
    if (v.track === "psalm" && !(psalmOpen && psalmOpen.has(no))) continue;
    if (v.track === "weekly" && v.date && kd(Date.parse(v.date)) > today) continue;   // 아직 오지 않은 주(날짜를 못 읽으면 NaN → 남긴다)
    map.set(no, { no, track: String(v.track), ref: String(v.ref ?? ""), text: String(v.text) });
  }
  run.visible = map;
  return map;
}

// 본문 해시 — 모델 이름을 함께 넣는다(임베딩 모델이 바뀌면 모두 다시 채운다). index.ts embedVoyage 의 모델과 같다.
const AGENT_EMBED_MODEL = "voyage-3-large";
async function agentHashText(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(AGENT_EMBED_MODEL + "\n" + s));
  return Array.from(new Uint8Array(buf)).map((x) => x.toString(16).padStart(2, "0")).join("");
}

// 임베딩이 없거나 본문이 바뀐 구절만 찾기 **직전에** 채운다(설계 §2-2) — 새 주간 구절이 들어온 첫 질문만 조금 느리다.
//   64개씩 Voyage(document) → verse_embed upsert. 둘이 동시에 채워도 같은 값으로 덮을 뿐이다.
async function agentFillVerseEmbeds(deps: AgentDeps, visible: Map<number, AgentVerse>): Promise<number> {
  const tracks = [...new Set([...visible.values()].map((v) => v.track))];
  const { data, error } = await deps.db.from("verse_embed").select("track, no, text_hash").in("track", tracks);
  if (error) throw error;
  const have = new Map<string, string>((data ?? []).map((r: any) => [r.track + ":" + r.no, String(r.text_hash)]));
  const stale: { v: AgentVerse; input: string; hash: string }[] = [];
  for (const v of visible.values()) {
    const input = `${v.ref} ${v.text}`;
    const hash = await agentHashText(input);
    if (have.get(v.track + ":" + v.no) !== hash) stale.push({ v, input, hash });
  }
  for (let i = 0; i < stale.length; i += 64) {
    const part = stale.slice(i, i + 64);
    const vecs = await deps.embedVoyage(part.map((x) => x.input), "document");
    const at = new Date().toISOString();
    const rows = part.map((x, j) => ({ track: x.v.track, no: x.v.no, text_hash: x.hash, embedding: vecs[j], updated_at: at }));
    const { error: e2 } = await deps.db.from("verse_embed").upsert(rows, { onConflict: "track,no" });
    if (e2) throw e2;
  }
  return stale.length;
}

async function agentFindVerses(deps: AgentDeps, run: AgentRun, topic: string): Promise<{ n: number; content: string }> {
  const visible = await agentVisibleVerses(deps, run);
  if (!visible.size) return { n: 0, content: "지금 이 성도님께 보이는 암송 구절이 없다." };
  await agentFillVerseEmbeds(deps, visible);
  const [qvec] = await deps.embedVoyage([topic], "query");
  const { data, error } = await deps.db.rpc("match_verse_embed", {
    query_embedding: qvec, tracks: run.tracks, match_count: AGENT_LIMITS.verseHits * 2,
  });
  if (error) throw error;
  // 표에 남은 옛 줄(그사이 꺼지거나 잠긴 구절)은 보이는 묶음으로 한 번 더 거른다 — 밖의 것은 AI 에게도 안 보인다
  const rows = (data ?? []).filter((r: any) => visible.has(Number(r.no))).slice(0, AGENT_LIMITS.verseHits);
  const found: AgentVerse[] = rows.map((r: any) => visible.get(Number(r.no))!);
  for (const v of found) {
    run.seen.verseNos.add(v.no);
    run.verseInfo.set(v.no, v);
  }
  if (!found.length) return { n: 0, content: "맞는 암송 구절을 찾지 못했다." };
  return { n: found.length, content: found.map((v) => `no=${v.no} · ${v.ref}\n${v.text}`).join("\n\n") };
}

// ---------- 도구 부름 하나 → step 줄 + tool_result ----------
// step 줄은 도구를 부르기 **직전**(start · q = AI 가 넘긴 찾을 말 그대로)과 결과를 받은 **직후**(done · n / fail)에 보낸다.
//   정해 둔 문구를 시간 맞춰 띄우지 않는다(설계 §1-1). 한도를 넘은 부름 · 모르는 도구 · 빈 찾을 말은 줄 없이 오류 결과만.
async function agentRunTool(deps: AgentDeps, run: AgentRun, tu: any, send: AgentSend): Promise<any> {
  const name = String(tu?.name ?? "");
  const input = tu?.input && typeof tu.input === "object" ? tu.input : {};
  const bad = (msg: string) => ({ type: "tool_result", tool_use_id: tu?.id, is_error: true, content: msg });
  const kind = name === "search_sermons" ? "sermon" : name === "find_verses" ? "verse" : "";
  if (!kind) return bad("없는 도구다. search_sermons · find_verses · give_answer 만 쓸 수 있다.");
  if (run.toolCalls >= AGENT_LIMITS.tools) return bad("도구 한도(4번)를 다 썼다. 지금까지 찾은 것으로 give_answer 를 불러라.");
  const q = agentClip(kind === "sermon" ? input.query : input.topic, 60);
  if (!q) return bad((kind === "sermon" ? "query" : "topic") + " 가 비었다.");
  run.toolCalls++;
  const id = ++run.stepId;
  send({ t: "step", id, kind, q, state: "start" });
  try {
    const r = kind === "sermon" ? await agentSearchSermons(deps, run, q) : await agentFindVerses(deps, run, q);
    if (kind === "sermon") run.sermonDone = true; else run.verseDone = true;
    send({ t: "step", id, kind, q, state: "done", n: r.n });
    return { type: "tool_result", tool_use_id: tu.id, content: r.content };
  } catch (e) {
    console.error("sermonAgent tool", name, String((e as Error)?.message ?? e).slice(0, 200));
    send({ t: "step", id, kind, q, state: "fail" });
    return bad("찾기에 실패했다. 이 도구 없이 지금까지 찾은 것으로 계속하라.");
  }
}
