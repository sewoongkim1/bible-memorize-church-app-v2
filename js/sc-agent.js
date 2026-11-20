// ============================================================
// 💬 「내게 주시는 말씀」 에이전트 화면(2026-11-20) — 단계 줄 · 답 · 「이렇게 해 보세요」 카드 · 되묻기 단추 · 🚩 이 답 알리기
//   설계 docs/superpowers/specs/2026-11-20-sermon-agent-design.md §1 · 서버 액션 sermonAgent(api · NDJSON 줄 step · answer · fallback)
//   필요할 때 받는다(app.js LAZY_JS.scAgent — scAsk 가 문 scAgentVisible 을 보고 부른다 · docs/notes/lazy-load.md).
//   app.js 에 있는 것: 문(scAgentVisible · scAgentCached · refreshScAgent) · 돌아갈 곳(scAgentReturnNo · scAgentBackTo — 암송 화면 「답으로」) ·
//     출처 줄(scSourcesHtml) · 지금 길(scAskClassic) · 설교 팝업(scOpenSermon) · 굵게(scEmphasis) · 알리기(openAnswerReport).
//   ⚠️ 맨 위 이름은 scAgent · SCG_ 로 시작한다 — app.js · 처음부터 실리는 js 와 겹치면 받는 순간 SyntaxError(tests/sermon-agent.test.cjs).
//   ⚠️ boardEsc 는 따옴표를 바꾸지 않는다 — 서버 · AI 가 준 글은 속성(data-…="…")에 넣지 않는다. 속성에는 번호만.
//   ⚠️ 빈 화면을 보이지 않는다 — 첫 질문에 답이 없으면(fallback 줄 · 통신 실패 · 빈 답) 지금 길(scAskClassic → sermonChat)로 한 번 더 묻는다.
// ============================================================

// ── 에이전트 화면 — 순수 (여기부터) ──
//   tests/sermon-agent.test.cjs 가 이 구간만 잘라 node:vm 에서 돌린다 — document · api · app.js 의 이름을 쓰지 말 것.

// 흘려받은 글 조각 → 다 온 줄(JSON 하나씩)만 풀어 낸다. 덜 온 끝줄은 rest 로 돌려 다음 조각 앞에 붙인다(js/api.js supaStream).
//   빈 줄 · 깨진 JSON · 객체가 아닌 줄(null · 배열 · 글 · 숫자)은 버린다 · \r\n 도 받는다(trim). 끝맺을 때는 rest 에 "\n" 을 한 번 더 넣는다.
function scAgentParseChunk(rest, chunk) {
  const buf = String(rest == null ? "" : rest) + String(chunk == null ? "" : chunk);
  const lines = buf.split("\n");
  const tail = lines.pop();
  const events = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    try {
      const o = JSON.parse(line);
      if (o && typeof o === "object" && !Array.isArray(o)) events.push(o);
    } catch (_) { /* 깨진 줄은 버린다 */ }
  }
  return { events, rest: tail };
}
// ── 에이전트 화면 — 순수 (여기까지) ──
