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

const api = {
  // 식별→진도·복습 동기화. u = {type, gu, mok, bu, grade, name}
  login: (u) => supaCall("login", u),
  saveProgress: (user_id, verse_no, stage, mode) => supaCall("saveProgress", { user_id, verse_no, stage, mode }),
  challenge: (user_id, verse_no, mode, score) => supaCall("challenge", { user_id, verse_no, mode, score }),
  advanceReview: (user_id, verse_no) => supaCall("advanceReview", { user_id, verse_no }),
  ranking: (from, to, includeLearn) => supaCall("ranking", { from, to, includeLearn }),   // 날짜(YYYY-MM-DD), includeLearn=학습 포함
  mydays: (user_id, from, to) => supaCall("mydays", { user_id, from, to }),
  savePush: (user_id, subscription, hour) => supaCall("savePush", { user_id, subscription, hour }),
  removePush: (endpoint) => supaCall("removePush", { endpoint }),
  testPush: (endpoint, hour) => supaCall("testPush", { endpoint, hour }),
  getVerses: () => supaCall("getVerses", {}),
  saveVerse: (pw, verse) => supaCall("saveVerse", { pw, verse }),
  seedVerses: (pw) => supaCall("seedVerses", { pw }),
};

window.api = api;
