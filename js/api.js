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
  saveProgress: (user_id, verse_no, stage, mode, lang) => supaCall("saveProgress", { user_id, verse_no, stage, mode, lang }),
  saveHeart: (user_id, verse_no, hearted, lang) => supaCall("saveHeart", { user_id, verse_no, hearted, lang }),   // 내 마음에 두었나이다 체크/해제
  getConfig: (key) => supaCall("getConfig", { key }),                    // 앱 설정 읽기(공개 키)
  saveConfig: (pw, key, value) => supaCall("saveConfig", { pw, key, value }),   // 앱 설정 저장(관리자)
  challenge: (user_id, verse_no, mode, score) => supaCall("challenge", { user_id, verse_no, mode, score }),
  advanceReview: (user_id, verse_no) => supaCall("advanceReview", { user_id, verse_no }),
  ranking: (from, to, includeLearn, me) => supaCall("ranking", { from, to, includeLearn, me }),   // 날짜(YYYY-MM-DD), includeLearn=학습 포함, me=내 user_id(응원 표시용)
  guRanking: (from, to) => supaCall("guRanking", { from, to }),   // 교구별 순위 { ok, list:[{rank,gu,count,people,avg}] }
  mydays: (user_id, from, to) => supaCall("mydays", { user_id, from, to }),
  verseCounts: (user_id) => supaCall("verseCounts", { user_id }),   // { ok, counts:{ verse_no:n } } 암송·도전·복습 전부
  savePush: (user_id, subscription, hour) => supaCall("savePush", { user_id, subscription, hour }),
  removePush: (endpoint) => supaCall("removePush", { endpoint }),
  testPush: (endpoint, hour, preview) => supaCall("testPush", { endpoint, hour, preview }),
  boardList: (user_id) => supaCall("boardList", { user_id }),
  // 공감 이모지 — on=false면 취소, boardReactors는 누른 사람 이름
  boardReact: (target, target_id, user_id, who, emoji, on) =>
    supaCall("boardReact", { target, target_id, user_id, who, emoji, on }),
  boardReactors: (target, target_id, emoji) =>
    supaCall("boardReactors", { target, target_id, emoji }),
  // 순위 응원(👏) — 대상은 화면에 보이는 네 조각으로 지목한다(서버가 user_id로 되짚는다)
  rankCheer: (gubun, sosok, sebu, name, user_id, who, on) =>
    supaCall("rankCheer", { gubun, sosok, sebu, name, user_id, who, on }),
  // 나를 응원한 사람 이름만 — 남의 명단은 물어볼 수 없다(숫자만 보인다)
  rankCheerers: (user_id, from, to) => supaCall("rankCheerers", { user_id, from, to }),
  boardCheck: (since) => supaCall("boardCheck", { since }),   // 최근 7일(또는 since 이후) 새 글/답글 개수 { ok, recent }
  boardPost: (name, content, user_id, images) => supaCall("boardPost", { name, content, user_id, images }),
  // 사진은 브라우저에서 줄인 뒤 한 장씩 보낸다(한 번에 보내면 요청이 너무 커지고,
  // 몇 장째 올라가는 중인지 알려 줄 수도 없다).
  boardUpload: (mime, data) => supaCall("boardUpload", { mime, data }),
  boardReply: (post_id, name, content, user_id) => supaCall("boardReply", { post_id, name, content, user_id }),
  boardDeleteMine: (kind, id, user_id, who) => supaCall("boardDeleteMine", { kind, id, user_id, who }),
  // track 을 안 주면 지금과 똑같이 주간 35구절. "psalm" 이면 시편 말씀 액자(열린 것만).
  getVerses: (track) => supaCall("getVerses", track ? { track } : {}),
  getSermons: () => sermonCall("getSermons"),   // 말씀 아카이브 설교 목록 { ok, sermons:[{memVerseNo,scripture,summary,title,...}] }
  saveVerse: (pw, verse) => supaCall("saveVerse", { pw, verse }),
  seedVerses: (pw) => supaCall("seedVerses", { pw }),
  getPassages: () => supaCall("getPassages", {}),
  getBlessings: () => supaCall("getBlessings", {}),
  blessingLog: (p) => supaCall("blessingLog", p),
  savePassage: (pw, passage) => supaCall("savePassage", { pw, passage }),
  deletePassage: (pw, id) => supaCall("deletePassage", { pw, id }),
  savePassageProgress: (user_id, passage_id, doneSeq, completed) =>
    supaCall("savePassageProgress", { user_id, passage_id, doneSeq, completed }),
  getPassageProgress: (user_id) => supaCall("getPassageProgress", { user_id }),     // 내 마디 진행(기기 동기화용)
  passageHelp: (passage_id, idx) => supaCall("passageHelp", { passage_id, idx }),   // 마디 도우미 { ok, easy, tip, en }
  passageHelpAll: (passage_id) => supaCall("passageHelpAll", { passage_id }),       // 전체 도우미 { ok, items:[{easy,tip,en}|null] }
  // 설교말씀 도우미(RAG 챗봇) — 성도는 user_id로 인가·로깅된다.
  sermonChat: (message, user_id) => supaCall("sermonChat", { message, user_id }),
  sermonSummary: (sermonId, user_id) => supaCall("sermonSummary", { sermonId, user_id }),
  // 말씀 이벤트 — 응모 기록/조회(성도), 응모자 명단(관리자)
  eventEnter: (event_id, user_id) => supaCall("eventEnter", { event_id, user_id }),
  eventStatus: (event_id, user_id) => supaCall("eventStatus", { event_id, user_id }),
  eventBoard: (event_id) => supaCall("eventBoard", { event_id }),
  eventEntrants: (pw, event_id) => supaCall("eventEntrants", { pw, event_id }),
  // 성경필사 노트 신청 — 내 신청(최근 1건)·신청/수정·취소, 관리자 명단·상태변경
  pilsaMine: (user_id) => supaCall("pilsaMine", { user_id }),
  pilsaApply: (order) => supaCall("pilsaApply", order),
  pilsaCancel: (user_id, id) => supaCall("pilsaCancel", { user_id, id }),
  pilsaList: (pw) => supaCall("pilsaList", { pw }),
  pilsaSetStatus: (pw, id, status) => supaCall("pilsaSetStatus", { pw, id, status }),
  // 사역신청 — 사역팀 목록·내 신청·신청/수정·취소, 관리자 명단·상태변경
  //   ⚠️ choices 는 팀 id 배열(최대 3). 순위는 없다(2026-09-08 결정).
  ministryCatalog: () => supaCall("ministryCatalog", {}),
  ministryMine: (user_id) => supaCall("ministryMine", { user_id }),
  ministryApply: (order) => supaCall("ministryApply", order),
  ministryCancel: (user_id, pw, phone, preview) => supaCall("ministryCancel", { user_id, pw, phone, preview }),
  ministryList: (pw) => supaCall("ministryList", { pw }),
  ministrySetStatus: (pw, id, status) => supaCall("ministrySetStatus", { pw, id, status }),

  // ---- 이벤트 플랫폼 (분기 회차) ----
  //  ⚠️ 위 event* 넷(eventEnter/Status/Board/Entrants)은 옛 「말씀 이벤트」(퀴즈형)
  //     것이다. 이름이 비슷하지만 표도 흐름도 다르다 — 섞지 말 것.
  eventOpenList: (user_id) => supaCall("eventOpenList", { user_id }),
  eventSignup: (payload) => supaCall("eventSignup", payload),
  eventDrop: (user_id, id) => supaCall("eventDrop", { user_id, id }),
  eventRoster: (pw, event_id) => supaCall("eventRoster", { pw, event_id }),
  eventSave: (pw, event) => supaCall("eventSave", { pw, event }),
};

window.api = api;
