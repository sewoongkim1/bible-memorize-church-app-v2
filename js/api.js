// ============================================================
// 클라이언트 → API 미들웨어(Edge Function) 호출 래퍼
//   모든 데이터 요청은 이 함수를 통해 Edge Function 'api' 로 전달된다.
// ============================================================
async function supaCall(action, payload = {}) {
  const res = await fetch(`${window.SUPA.URL}/functions/v1/api`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${window.SUPA.ANON}`,
      "apikey": window.SUPA.ANON,
    },
    body: JSON.stringify({ action, ...payload }),
  });
  let data = {};
  try { data = await res.json(); } catch (_) {}
  if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// 말씀 아카이브(형제 앱) Edge Function 'sermon' 호출 — 설교 요약 참조용(읽기 전용).
async function sermonCall(action, payload = {}) {
  const res = await fetch(`${window.SUPA.URL}/functions/v1/sermon`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${window.SUPA.ANON}`,
      "apikey": window.SUPA.ANON,
    },
    body: JSON.stringify({ action, ...payload }),
  });
  let data = {};
  try { data = await res.json(); } catch (_) {}
  if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

const api = {
  // 식별→진도·복습 동기화. u = {type, gu, mok, bu, grade, name}
  login: (u) => supaCall("login", u),
  saveProgress: (user_id, verse_no, stage, mode) => supaCall("saveProgress", { user_id, verse_no, stage, mode }),
  saveHeart: (user_id, verse_no, hearted) => supaCall("saveHeart", { user_id, verse_no, hearted }),   // 내 마음에 두었나이다 체크/해제
  getConfig: (key) => supaCall("getConfig", { key }),                    // 앱 설정 읽기(공개 키)
  saveConfig: (pw, key, value) => supaCall("saveConfig", { pw, key, value }),   // 앱 설정 저장(관리자)
  challenge: (user_id, verse_no, mode, score) => supaCall("challenge", { user_id, verse_no, mode, score }),
  advanceReview: (user_id, verse_no) => supaCall("advanceReview", { user_id, verse_no }),
  ranking: (from, to, includeLearn) => supaCall("ranking", { from, to, includeLearn }),   // 날짜(YYYY-MM-DD), includeLearn=학습 포함
  guRanking: (from, to) => supaCall("guRanking", { from, to }),   // 교구별 순위 { ok, list:[{rank,gu,count,people,avg}] }
  mydays: (user_id, from, to) => supaCall("mydays", { user_id, from, to }),
  verseCounts: (user_id) => supaCall("verseCounts", { user_id }),   // { ok, counts:{ verse_no:n } } 암송·도전·복습 전부
  savePush: (user_id, subscription, hour) => supaCall("savePush", { user_id, subscription, hour }),
  removePush: (endpoint) => supaCall("removePush", { endpoint }),
  testPush: (endpoint, hour, preview) => supaCall("testPush", { endpoint, hour, preview }),
  boardList: () => supaCall("boardList", {}),
  boardPost: (name, content, user_id) => supaCall("boardPost", { name, content, user_id }),
  boardReply: (post_id, name, content, user_id) => supaCall("boardReply", { post_id, name, content, user_id }),
  boardDeleteMine: (kind, id, user_id, who) => supaCall("boardDeleteMine", { kind, id, user_id, who }),
  getVerses: () => supaCall("getVerses", {}),
  getSermons: () => sermonCall("getSermons"),   // 말씀 아카이브 설교 목록 { ok, sermons:[{memVerseNo,scripture,summary,title,...}] }
  saveVerse: (pw, verse) => supaCall("saveVerse", { pw, verse }),
  seedVerses: (pw) => supaCall("seedVerses", { pw }),
  getPassages: () => supaCall("getPassages", {}),
  savePassage: (pw, passage) => supaCall("savePassage", { pw, passage }),
  deletePassage: (pw, id) => supaCall("deletePassage", { pw, id }),
  savePassageProgress: (user_id, passage_id, doneSeq, completed) =>
    supaCall("savePassageProgress", { user_id, passage_id, doneSeq, completed }),
  // 설교말씀 도우미(RAG 챗봇) — 성도는 user_id로 인가·로깅된다.
  sermonChat: (message, user_id) => supaCall("sermonChat", { message, user_id }),
  sermonSummary: (sermonId, user_id) => supaCall("sermonSummary", { sermonId, user_id }),
};

window.api = api;
