// ============================================================
// 이벤트 플랫폼 (분기 회차) — 2026-09-10
//   설계: docs/superpowers/specs/2026-09-10-event-platform-design.html
//   계획: docs/superpowers/plans/2026-09-10-event-platform.md
//
//   ⚠️ app.js 밖에 지었다. 지금 이 저장소는 여러 작업이 app.js 를 함께 쓰고 있어
//      화면 코드를 밖에 두면 충돌 표면이 「분기 넷 + 한 단어」로 줄어든다.
//      loadUser·homeFabLabel·stopSpeaking·appAlert·appConfirm·renderSummary·
//      renderEntryScreen 은 app.js 의 전역이라 런타임에 그냥 불린다
//      (js/psalm.js 와 같은 방식).
//
//   ⚠️ 이름이 renderEvent* 인 것이 이미 다섯 있다(Step/Board/Done/Button/Admin) —
//      전부 옛 「말씀 이벤트」(퀴즈형, app_config('event') + event_entries) 것이다.
//      여기서는 List/Form 만 쓰고 CSS 는 .ev- 접두사를 쓴다(.event-* 는 그쪽 것).
//
//   ⚠️ 참여는 앱 로그인으로만 받는다 — user_id 가 신원의 전부다. 이름·소속을
//      묻지 않고 로그인 정보를 그대로 쓴다.
// ============================================================

// ── 상태 ─────────────────────────────────────────────────────
// ⚠️ 불리언이 아니라 세 값이다. 숨기는 것은 같아도 **할 말이 다르다** —
//    「지금 불러올 수 없어요」와 「지금 열린 이벤트가 없어요」를 섞으면,
//    통신이 잠깐 끊긴 분께 「기간이 지났습니다」라고 사실이 아닌 말을 하게 된다.
//    (2026-09-10 사역신청 작업이 실제로 그럴 뻔했다.)
var evtState = "unknown"; // "unknown" | "none" | "some"
var evtEvents = [];       // eventOpenList 의 events
var evtMine = [];         // 내가 낸 것(회차를 넘어 전부)
var evtHint = "";         // 직분 기본값
var evtForm = null;       // 등록/고치기 중인 값 { eventId, position, phone, memo }
var _evtPreview = false;  // ?preview=event 로 들어왔나(관리자)

// 도장판 — ⚠️ 「아직 모른다」와 「0주」를 뭉개지 않는다. 통신이 잠깐 끊긴 분께
//    「0주 채우셨어요」라고 말하면 사실이 아닌 말을 하는 것이다(evtState 와 같은 까닭).
var evtStamp = null;            // eventStamps 응답 또는 null
var evtStampState = "unknown";  // "unknown" | "ready"
// evtStamp 를 받은 날(KST YYYY-MM-DD) — 도장판을 자정 넘겨 띄워 둔 채 다시 그리면 todayCount 는
//   「어제 합」이다. 오늘이 아니면 오늘 합을 「모른다」(null)로 읽는다(app.js applyStampPill 의
//   `s.day === todayYmd()` 규칙과 같다 · 검토 2026-10-03).
var evtStampDay = null;

// 신원이 바뀔 때(로그아웃 · 「로그인 정보변경」) 이 파일의 전역을 비운다(2026-10-03).
//   ⚠️ app.js clearPersonalData 가 typeof 로 빌려 쓴다 — 안 비우면 공용 기기에서 다음
//   분(또는 같은 분의 새 신원) 화면에 **앞사람의 시험 회차 도장·명단**이 새로고침 전까지 남는다.
//   evtForm·evtHint·evtState 는 화면을 열 때마다 evtLoad/evtDrawForm 이 다시 채우므로 안 건드린다.
function evtResetState() {
  evtStamp = null; evtStampState = "unknown"; evtStampDay = null;
  evtRoster = null; evtRosterFor = "";
  evtEvents = []; evtMine = [];
}

function evtEsc(v) {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// URL 의 ?ev=<회차id> 를 1회 읽어 반환(읽은 뒤 URL 정리 → 새로고침 재진입 방지)
// 서버의 EVT_ID_RE 와 같은 모양이다.
function getEvtDeepLink() {
  try {
    var p = new URLSearchParams(location.search).get("ev");
    var id = (p || "").trim();
    if (/^[a-z0-9][a-z0-9-]{1,40}$/.test(id)) {
      history.replaceState(null, "", location.pathname);
      return id;
    }
  } catch (e) {}
  return null;
}

// 옛 js/api.js 를 물고 있는 브라우저에서 「함수가 없습니다」 대신 조용히 숨기려고
function evtApiReady() {
  return !!(window.api && api.eventOpenList && api.eventSignup);
}

// 첫 화면 노출 게이트는 **여기 두지 않는다.** app.js 의 `refreshEventOpen()`·
// `eventVisible()`(297·306줄)이 그 일을 한다 — 첫 화면은 동기 렌더라 게이트가
// 그 파일 안에 있는 편이 자연스럽고, 두 벌을 두면 조용히 갈라진다.
// (2026-09-10 여기에 같은 것을 한 벌 더 만들었다가 지웠다.)

// 지금 로그인한 분이 uid 그대로인가 — 늦게 온 응답을 버릴지 가른다(app.js refreshEventOpen 과
//   같은 가드 · 검토 2026-10-03). loadUser 는 app.js 에 있다(이 파일이 먼저 실리지만 부를 때는 있다).
function evtSameUser(uid) {
  var now = (typeof loadUser === "function" && loadUser()) || {};
  return (now.user_id || "") === (uid || "");
}

// ── 불러오기 ─────────────────────────────────────────────────
// ⚠️ 응답이 오기 전에 로그아웃·「로그인 정보변경」이 있으면(evtResetState 로 비운 뒤) 그 응답은
//    **아무것도 쓰지 않고 버린다** — 안 버리면 앞사람의 회차·「이미 내신 것」·도장이 이 파일의
//    전역에 되살아난다(공용 기기). 그때 resolve 값은 false(부른 쪽이 화면도 그리지 않게).
function evtLoad(u) {
  if (!evtApiReady()) {
    evtState = "unknown";
    return Promise.resolve(true);
  }
  var uid = (u && u.user_id) || "";
  return api.eventOpenList(uid).then(function (r) {
    if (!evtSameUser(uid)) return false;
    evtEvents = (r && r.events) || [];
    evtMine = (r && r.mine) || [];
    evtHint = (r && r.positionHint) || "";
    evtState = evtEvents.length ? "some" : "none";

    // 자격 회차가 있으면 그 도장도 받아 둔다. ⚠️ 둘 이상이면(시험 회차 + 진짜 회차가
    //    함께 보일 때) testOnly 가 아닌 쪽을 고른다(app.js refreshEventOpen 과 같은 규칙 ·
    //    2026-10-03) — 실제로는 진짜 자격 회차가 하나뿐이라는 전제다. 전부 testOnly면
    //    첫 번째를 쓴다.
    var withRule = evtEvents.filter(function (e) {
      return e.needs && e.needs.eligibility;
    });
    var picked = withRule.length
      ? (withRule.filter(function (e) { return !e.testOnly; })[0] || withRule[0])
      : null;
    if (!uid || !picked || !api.eventStamps) {
      evtStamp = null; evtStampState = "unknown"; evtStampDay = null;
      return true;
    }
    // 받은 날은 **부를 때** 날짜로 적는다 — 자정 직전에 불러 직후에 받으면 「어제 것일 수 있다」 쪽(모른다)으로 기운다.
    var callDay = todayYmd();
    return api.eventStamps(uid, picked.id).then(function (s) {
      if (!evtSameUser(uid)) return false;   // 도장 응답도 같은 가드(목록 응답과 사이에 로그아웃했을 수 있다)
      if (s && s.ok && s.rule) { evtStamp = s; evtStampState = "ready"; evtStampDay = callDay; }
      else { evtStamp = null; evtStampState = "unknown"; evtStampDay = null; }
      return true;
    }).catch(function () {
      if (!evtSameUser(uid)) return false;
      evtStamp = null; evtStampState = "unknown"; evtStampDay = null;
      return true;
    });
  }).catch(function (e) {
    if (!evtSameUser(uid)) return false;
    // 서버가 옛 판이라 액션이 없다 · 표가 없다 · 통신 실패 — 전부 「모른다」다.
    // 「없다」로 뭉개지 않는다.
    evtState = "unknown";
    evtEvents = []; evtMine = []; evtHint = "";
    evtStamp = null; evtStampState = "unknown"; evtStampDay = null;
    if (window.console) console.warn("eventOpenList 실패:", e && e.message);
    return true;
  });
}

function evtFind(id) {
  for (var i = 0; i < evtEvents.length; i++) {
    if (evtEvents[i].id === id) return evtEvents[i];
  }
  return null;
}
function evtMineOf(id) {
  for (var i = 0; i < evtMine.length; i++) {
    if (evtMine[i].eventId === id) return evtMine[i];
  }
  return null;
}

// 「자동 대상」 회차인가(설계 §9 · 2026-10-03) — 서버 index.ts 의 evtAuto 와 같은 판정.
//   신청이 없다: 필요한 주를 채우시면(또는 담당자가 인정해 넣으시면) 그것으로 대상이다.
//   ⚠️ 성도님 화면에는 「선물 대상」이라 쓰지 않는다(친구 2026-10-04 — 선물이 목적으로 보인다 · evtAutoTail).
//   그래서 신청 단추·「이렇게 등록됩니다」·공개 명단을 그리지 않는다(evtDrawForm).
// ⚠️ 이 깃발이 없는 회차는 예전과 똑같이 그린다.
function evtAuto(e) { return !!(e && e.needs && e.needs.auto === true); }

// 남은 날 — 마감 당일은 「오늘 마감」. KST 로 잰다(서버와 같은 잣대).
function evtDdayText(closesOn) {
  try {
    var today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    var a = new Date(today + "T00:00:00Z").getTime();
    var b = new Date(closesOn + "T00:00:00Z").getTime();
    var d = Math.round((b - a) / 86400000);
    if (d < 0) return "마감";
    if (d === 0) return "오늘 마감";
    return d + "일 남음";
  } catch (e) { return ""; }
}

// ── 목록 화면 ────────────────────────────────────────────────
// focusId: 딥링크(?ev=)로 들어왔을 때 그 회차의 등록 화면을 바로 연다.
function renderEventList(focusId) {
  // 열람 기록 — app.js 의 전역 logFeature 를 그대로 쓴다(js/psalm.js 와 같은 방식).
  // ⚠️ FEATURES(index.ts)에 "event" 가 없으면 서버가 조용히 버린다(skipped:true) — 화면은 안 죽는다.
  if (typeof logFeature === "function") logFeature("event", 0);
  if (typeof stopSpeaking === "function") stopSpeaking();
  var u = loadUser();
  if (!u) { renderEntryScreen(); return; }
  evtForm = null;

  document.getElementById("app").innerHTML =
    '<div class="ev-wrap"><div class="ev-loading">불러오는 중…</div></div>' +
    '<button class="home-fab" id="ev-home" aria-label="첫 화면으로">' +
    homeFabLabel(u, true) + "</button>";
  window.scrollTo(0, 0);
  document.getElementById("ev-home")
    .addEventListener("click", function () { renderSummary(); });

  evtLoad(u).then(function (fresh) {
    // 응답을 버렸으면(그사이 로그아웃·다른 분) 앞사람 u 로 화면을 그리지 않는다(evtLoad 위 주석).
    // ⚠️ 단 처음 오신 분이 로그인이 끝나기 전(user_id 가 아직 없을 때) 🏅 을 눌렀고 그사이 user_id 가
    //    생긴 경우도 여기로 온다 — 그대로 두면 「불러오는 중…」에 멈춘다. 그 화면이 아직 떠 있고
    //    누가 로그인해 있으면 지금 분으로 한 번 다시 부른다(로그아웃이면 loadUser() 가 없고,
    //    다른 화면으로 갔으면 .ev-loading 이 없어 다시 부르지 않는다 · 검토 2026-10-03).
    if (fresh === false) {
      if (loadUser() && document.querySelector(".ev-wrap .ev-loading")) renderEventList(focusId);
      return;
    }
    // 딥링크로 특정 회차를 지목했고 그것을 볼 수 있으면 바로 등록 화면으로
    if (focusId && evtFind(focusId)) { renderEventForm(u, focusId); return; }
    // 회차가 하나뿐이면 목록을 건너뛴다 — 고를 것이 없는데 고르라고 하지 않는다.
    // (마감된 회차 하나만 있는 지금이 그렇다. 그 안에 명단이 있다.)
    if (!focusId && evtEvents.length === 1) {
      renderEventForm(u, evtEvents[0].id); return;
    }
    var pickable = evtEvents.filter(function (e) { return e.canSignup && !e.mine; });
    if (!focusId && pickable.length === 1 && evtMine.length === 0) {
      renderEventForm(u, pickable[0].id); return;
    }
    evtDrawList(u, focusId);
  });
}

function evtDrawList(u, focusId) {
  var wrap = document.querySelector(".ev-wrap");
  if (!wrap) return;

  if (evtState === "unknown") {
    wrap.innerHTML =
      '<div class="ev-head"><h2 class="ev-title">함께하는 이벤트</h2></div>' +
      '<div class="ev-empty"><div class="ev-empty-ic">📡</div>' +
      "<p>지금 불러올 수 없어요.<br>잠시 뒤 다시 눌러 주세요.</p>" +
      '<button class="ev-retry" id="ev-retry">다시 시도</button></div>';
    document.getElementById("ev-retry")
      .addEventListener("click", function () { renderEventList(focusId); });
    return;
  }

  if (evtState === "none" && !evtMine.length) {
    wrap.innerHTML =
      '<div class="ev-head"><h2 class="ev-title">함께하는 이벤트</h2></div>' +
      '<div class="ev-empty"><div class="ev-empty-ic">🗓️</div>' +
      "<p>지금 열린 이벤트가 없어요.<br>새 이벤트가 열리면 알려 드릴게요.</p></div>";
    return;
  }

  wrap.innerHTML =
    '<div class="ev-head"><h2 class="ev-title">함께하는 이벤트</h2></div>' +
    evtSentHtml() +
    evtEvents.map(evtCardHtml).join("");

  evtEvents.forEach(function (e) {
    var btn = document.getElementById("ev-go-" + e.id);
    if (btn) {
      btn.addEventListener("click", function () { renderEventForm(u, e.id); });
    }
  });
}

// 「이미 내신 것」 — 회차를 넘어 전부. 사역신청의 minSentListHtml 과 같은 자리다.
// ⚠️ 겹친 회차를 볼 때 「내가 뭘 냈더라」가 먼저 궁금하다. 카드 사이에서 찾아
//    훑지 않게 맨 위에 모아 둔다.
function evtSentHtml() {
  // ⚠️ 자동 대상 회차의 줄은 뺀다(설계 §9 · 2026-10-03) — 성도님이 낸 것이 아니라 담당자가 인정해
  //    넣은 줄이다. 「이미 내신 것 · 접수」로 보이면 「따로 신청하지 않으셔도 돼요」와 앞뒤가 안 맞는다
  //    (대상이신 것은 그 회차 도장판이 말한다). 다른 회차의 줄은 예전 그대로다.
  var sent = evtMine.filter(function (m) { return !evtAuto(evtFind(m.eventId)); });
  if (!sent.length) return "";
  return '<div class="ev-sent"><div class="ev-sent-t">📋 이미 내신 것 <b>' +
    sent.length + "건</b></div>" +
    sent.map(function (m) {
      var e = evtFind(m.eventId);
      var nm = e ? (e.shown || e.title) : m.eventId;
      return '<div class="ev-sent-r"><span class="ev-sent-n">' + evtEsc(nm) +
        '</span><span class="ev-sent-s">접수</span></div>';
    }).join("") + "</div>";
}

// 「2026-10-27」 → 「10월 27일」. 성도님께는 연도를 말하지 않는다(올해 일이 뻔하다).
function evtDateKo(ymd) {
  var m = /^\d{4}-(\d{2})-(\d{2})$/.exec(String(ymd || ""));
  return m ? (Number(m[1]) + "월 " + Number(m[2]) + "일") : String(ymd || "");
}

// 한글 수사 — 문구에 아라비아 숫자를 박으면 「3주」처럼 읽혀 딱딱하다.
// ⚠️ 필요 주수는 **사람마다 다르다**(이벤트 중 처음 오신 분은 두 주일 수 있다).
//    그래서 문구에 「세 주」를 박으면 그분께 사실이 아닌 말을 하게 된다.
function evtKoNum(n) {
  var w = ["", "한", "두", "세", "네", "다섯", "여섯", "일곱", "여덟", "아홉", "열"];
  n = Number(n);
  if (!isFinite(n) || n < 0) n = 0;   // 화면에 「NaN」이 뜨는 일은 없어야 한다
  return (n >= 1 && n < w.length) ? w[n] : String(n);
}

// 한 주 칸의 날짜 범위 — 「1주 10/18~10/24」
function evtWeekLabel(start, i) {
  var a = new Date(Date.parse(start + "T00:00:00Z") + i * 7 * 86400000);
  var b = new Date(a.getTime() + 6 * 86400000);
  var f = function (d) { return (d.getUTCMonth() + 1) + "/" + d.getUTCDate(); };
  return (i + 1) + "주 " + f(a) + "~" + f(b);
}

// 시작일로부터 n 일 뒤의 날짜 키(YYYY-MM-DD) — evtWeekLabel 과 같은 UTC 계산.
// 서버 eventStamps 의 days 키(v2_mydays 의 day)와 같은 모양이어야 한다.
function evtDayYmd(start, n) {
  return new Date(Date.parse(start + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
}

// ── 자동 대상 끝 문구 — 순수 함수 (여기부터) ──
// 「자동 대상」 회차(설계 §9-2 · 2026-10-04 바뀜)의 도장판 머리·주 칸·맨 아래 한 문단을 고른다.
//   tests/event-auto.test.cjs 가 이 두 표식 사이를 떼어 내 node:vm 에서 돌린다 — 그래서 전역
//   (evtStamp·evtMineOf·todayYmd·stampToday)을 읽지 않고 **인자로만** 받는다(evtKoNum 은 시험이 따로 떼어 간다).
// 친구(2026-10-04 · 도장판을 보고): 「선물 대상」이라는 말은 빼 달라(선물이 목적으로 보인다) —
//   「두 주를 채우셨어요」 대신 **이벤트 기간에 함께한 날**과 **앞으로 며칠 더**를 응원으로 말한다.
// ⚠️ 머리·끝 문구에 쓰지 않는 말: 「선물」·「대상이에요」·「N 주를 채우셨어요」(주 수를 앞세우는 말)·「자격」·
//    「달성」·「당첨」·「상」·「순위」·「1등」·「여기까지」·「신청」. (안내 copy.intro 의 「소정의 선물」은 친구가 정한 그대로.)
// ⚠️ 굵은 0 을 박지 않는다 — 함께한 날이 0 이면 그 문장을 빼고 말한다(나무라지 않는다).
// ⚠️ 날 수는 아라비아 숫자(「3일」 — 커질 수 있다), 주 수를 말할 때만 evtKoNum(「여섯 주」).

// 화면에 보일 주별 날 수 — 서버 weekDays 에 「오늘 살아 있는 +1」을 얹는다(app.js applyStampPill 과 같은 규칙:
//   srvToday 를 알고(null 아님), 오늘 합(liveToday = stampToday(srvToday))이 막 perDay 를 넘었는데 서버는 아직이면
//   이번 주 +1). 측정 기간 밖이면 얹지 않는다.
//   ⚠️ 서버 값을 고쳐 저장하지 않는다(새 배열) — 다시 받으면 서버 값으로 저절로 맞는다.
//   ⚠️ 주 칸·머리·끝 문구가 **모두 이 배열 하나**를 본다 — 칸과 문구의 숫자가 어긋나면 안 된다.
function evtAutoWeekDays(weekDays, r, todayIdx, srvToday, liveToday) {
  var weeks = Number(r.weeks) || 0;
  var perDay = Number(r.perDay) || 1;
  var out = [];
  for (var i = 0; i < weeks; i++) out.push(Number(weekDays && weekDays[i]) || 0);
  if (isFinite(todayIdx) && todayIdx >= 0 && todayIdx < weeks * 7 && srvToday != null &&
      (Number(liveToday) || 0) >= perDay && (Number(srvToday) || 0) < perDay) {
    out[Math.floor(todayIdx / 7)] += 1;
  }
  return out;
}

// 함께한 날 — 도장이 찍힌 날(그날 합 ≥ perDay) 수를 측정 기간 전체로 더한다.
function evtAutoDaysTogether(wd) {
  var n = 0;
  for (var i = 0; i < wd.length; i++) n += Number(wd[i]) || 0;
  return n;
}

// 채운 주 수(한 주 perWeek 일 이상) — 같은 배열로 센다.
function evtAutoWeeksDone(wd, r) {
  var pw = Number(r.perWeek) || 1, done = 0;
  for (var i = 0; i < wd.length; i++) if ((Number(wd[i]) || 0) >= pw) done++;
  return done;
}

// 앞으로 며칠 — 기준(need 주 · 한 주 perWeek 일)에 닿는 **가장 적은** 날 수 D.
//   wd: evtAutoWeekDays 결과 · need: 서버 s.need(이벤트 중 처음 오신 분은 2) · todayStamped: 오늘이 이미 한 칸인가
//   돌려주는 것 { days, thisWeek }:
//     days     — D. 0 = 이미 닿았다 · null = 남은 주(이번 주 포함 · 측정 끝까지)로 못 닿는다
//     thisWeek — 이번 주를 채우려면 더 필요한 날(이번 주를 아직 채울 수 있을 때만 · 아니면 0)
//   · 남은 필요 주 = need − 채운 주.
//   · 이번 주가 아직 안 찼고 이번 주 남은 날(오늘 포함 · 오늘 이미 찍혔으면 오늘 빼고) 안에 모자란 날을 채울 수
//     있으면 D = (perWeek − 이번 주 날 수) + perWeek × (남은 필요 주 − 1). 아니면 다음 주부터 D = perWeek × 남은 필요 주.
//   · 측정 전(todayIdx < 0)이면 모든 주가 앞에 있다.
function evtDaysToGo(wd, r, need, todayIdx, todayStamped) {
  var weeks = Number(r.weeks) || 0;
  var pw = Number(r.perWeek) || 1;
  var left = (Number(need) || 0) - evtAutoWeeksDone(wd, r);   // 남은 필요 주
  if (left <= 0) return { days: 0, thisWeek: 0 };
  var ti = isFinite(todayIdx) ? todayIdx : -1;
  if (ti >= weeks * 7) return { days: null, thisWeek: 0 };    // 측정이 끝났다
  if (ti < 0) return { days: weeks >= left ? pw * left : null, thisWeek: 0 };
  var cw = Math.floor(ti / 7);                                // 이번 주
  var after = weeks - cw - 1;                                 // 다음 주부터 측정 끝까지 남은 주
  var have = Number(wd[cw]) || 0;
  if (have < pw) {
    var avail = 7 - (ti % 7) - (todayStamped ? 1 : 0);         // 이번 주에 아직 찍을 수 있는 날
    var miss = pw - have;
    if (miss <= avail && after + 1 >= left) return { days: miss + pw * (left - 1), thisWeek: miss };
  }
  return { days: after >= left ? pw * left : null, thisWeek: 0 };
}

// 도장판 머리의 「{이름} 님의 도장판 · 」 뒤 — n: 함께한 날(evtAutoDaysTogether) · weeksDone: 채운 주(evtAutoWeeksDone).
//   참여 일수에 더해 채운 주수도 함께 보여 준다(친구 2026-10-10). ⚠️ 0일에는 「0일」을 박지 않는다
//   (이 화면은 나무라지 않는다 · 시험 assertClean) — 셀 것이 생기면(1일~) 그때 수를 보여 준다.
function evtAutoHead(n, weeksDone) {
  if (!n) return "첫 칸을 기다리고 있어요";
  return "지금까지 " + n + "일 함께하셨어요" + (weeksDone ? " · " + weeksDone + "주 채움" : "");
}

// 도장판 맨 아래 한 문단.
//   s: eventStamps 응답(weekDays·eligible·allWeeks·need) · r: s.rule
//   mine: 그 회차에 내 줄이 있나 — 담당자가 인정해 넣은 분이다(서버 eligible 은 주만 센다).
//   todayIdx: 측정 시작일부터 오늘까지 날 수(0 = 첫날) — r.weeks*7 이상이면 측정이 끝났다(11/29~).
//   srvToday: 서버가 준 오늘 합(받은 날이 오늘이 아니거나 모르면 null) · liveToday: stampToday(srvToday)
//     — evtStampHtml 이 주 칸에 넘기는 것과 **같은 값**을 넘긴다(evtAutoWeekDays 하나로 센다).
function evtAutoTail(s, r, mine, todayIdx, srvToday, liveToday) {
  var weeks = Number(r.weeks) || 0;
  var pw = Number(r.perWeek) || 1;
  var perDay = Number(r.perDay) || 1;
  var ti = isFinite(todayIdx) ? todayIdx : -1;
  var wd = evtAutoWeekDays(s.weekDays, r, ti, srvToday, liveToday);
  var n = evtAutoDaysTogether(wd);
  var done = evtAutoWeeksDone(wd, r);
  // ⚠️ s.need 를 쓴다(중간에 처음 오신 분은 두 주다). 없으면(옛 응답) 회차 기본값 r.need.
  var need = Number(s.need) || Number(r.need) || 1;
  // 서버 eligible — 또는 오늘 막 채운 주(+1)로 닿은 분(서버가 따라오면 eligible 이 된다 · 「앞으로 0일」을 안 띄운다)
  var reached = !!s.eligible || done >= need;
  var every = !!s.allWeeks || (weeks > 0 && done >= weeks);
  var stamped = ti >= 0 && ti < weeks * 7 &&
    Math.max(Number(srvToday) || 0, Number(liveToday) || 0) >= perDay;
  var said = n ? "이벤트 기간에 " + n + "일 함께하셨어요." : "";
  var sparkle = every ? "✨ 매주 빠짐없이 함께하셨어요." : "";
  var lines = function (a) { return a.filter(function (x) { return !!x; }).join("<br>"); };

  // 측정이 끝났다(11/29~) — 감사로 맺는다. 「필요한 날을 모두 채우셨어요」는 정말 채우신 분만(인정 줄은 아니다).
  if (ti >= weeks * 7) {
    return lines([said, reached ? "필요한 날을 모두 채우셨어요 🙂" : "",
      evtKoNum(weeks) + " 주 동안 함께해 주셔서 고맙습니다.", sparkle]);
  }
  // 기준을 채우셨다
  if (reached) {
    return lines([said, "필요한 날을 모두 채우셨어요 🙂 남은 날도 편한 만큼 말씀과 함께해요.", sparkle]);
  }
  // 담당자가 넣은 줄만 있다 — 「필요한 날을 채우셨어요」라고 하지 않는다(사실이 아니다).
  //   이 갈래를 빠뜨리면 인정받은 분이 「앞으로 며칠」이나 「한 걸음 한 걸음」을 본다.
  if (mine) {
    return lines([said, "함께해 주셔서 고마워요 — 남은 날도 편한 만큼 말씀과 함께해요."]);
  }
  var go = evtDaysToGo(wd, r, need, ti, stamped);
  // 닿을 수 있다 — 앞으로 며칠(+ 이번 주를 아직 채울 수 있으면 이번 주 몇 일)
  if (go.days) {
    // 이번 주만 채우면 끝나는 경우(go.thisWeek === go.days) — 「앞으로 1일(한 주에 3일씩)」은 서로 어긋나 읽히고,
    //   그 하루가 이번 주를 넘기면 다음 주 3일이 된다. 그래서 「이번 주에 N일」로 바로 말한다(2026-10-04 검토).
    var onlyThisWeek = !!go.thisWeek && go.thisWeek === go.days;
    var goText = onlyThisWeek
      // 이번 주에 이미 한 날이 있을 때만 「더」(이번 주를 아직 시작 안 했으면 「이번 주에 3일 더」는 어색하다)
      ? (n ? "<b>이번 주에 " + go.days + "일" + (go.thisWeek < pw ? " 더" : "") + "</b> 함께하시면 돼요."
           : "<b>이번 주에 " + go.days + "일</b> 함께하시면 돼요")
      : (n ? "<b>앞으로 " + go.days + "일 더</b> 함께하시면 돼요(한 주에 " + pw + "일씩)."
           : "<b>앞으로 " + go.days + "일</b> 함께하시면 돼요(한 주에 " + pw + "일씩)");
    var first = n
      ? said + "<br>" + goText
      // 측정 전(ti < 0)은 「앞으로 N일」을 빼고 「시작하는 날부터…」만 둔다(친구 2026-10-10 — 아직 시작 전이라
      //   「앞으로 15일」이 오해를 준다). 측정 중(ti >= 0)은 「앞으로 N일 더」 응원을 그대로 둔다(§9-2 친구).
      : (ti < 0
          ? "시작하는 날부터 하루 " + perDay + "번이면 한 칸이에요."
          : goText + " — 오늘 " + perDay + "번이면 첫 칸이에요.");
    // 이번 주 한 줄 — 이번 주에 아직 한 날도 없으면 「X일이면」(아무것도 안 했는데 「더」는 어색하다)
    var weekText = (go.thisWeek && !onlyThisWeek)
      ? (go.thisWeek >= pw ? "이번 주는 " + go.thisWeek + "일이면 채워져요."
                           : "이번 주는 " + go.thisWeek + "일 더 하시면 채워져요.")
      : "";
    return lines([first, weekText, "오늘도 말씀과 함께 힘내요 🙂"]);
  }
  // 남은 주로 못 닿는다 — 기준을 다시 말하지 않고, 「여기까지」·「떨어졌다」 결의 말도 하지 않는다.
  return lines([said, "한 걸음 한 걸음이 귀해요 — 남은 날도 말씀과 함께해요."]);
}
// ── 자동 대상 끝 문구 — 순수 함수 (여기까지) ──

// 도장판. ⚠️ evtDrawForm 의 `if (!canSignup)` **앞**에서 부른다 —
//    그 분기는 폼 대신 명단만 그려서, 신청 창이 열리기 전에는 도장판이 아예 안 보인다.
// e: 이 도장판의 회차 — 「자동 대상」(evtAuto)이면 머리·주 칸·끝 문구를 evtAutoHead·evtAutoWeekDays·evtAutoTail 로
//    고른다(2026-10-04 · 없으면 예전 문구·예전 칸 그대로).
function evtStampHtml(u, e) {
  // ⚠️ weekDays 가 통째로 없으면 0 으로 그리면 안 된다 — 그건 「모른다」다.
  if (evtStampState !== "ready" || !evtStamp || !evtStamp.rule || !evtStamp.weekDays) {
    return '<div class="ev-note">기록을 맞추는 중이에요. 잠시 뒤 다시 열어 주세요.</div>';
  }
  var s = evtStamp, r = s.rule;
  var perDay = r.perDay || 1;   // 없으면 1(옛 서버 · 2026-10-03 이전) — 「하루 한 번이라도」
  var auto = evtAuto(e);
  // 오늘이 측정 몇째 날인가(0 = 첫날) — 아래 7일 띠와 자동 대상 문구가 함께 쓴다.
  var todayIdx = Math.floor(
    (Date.parse(todayYmd() + "T00:00:00Z") - Date.parse(r.start + "T00:00:00Z")) / 86400000);
  // ⚠️ 받은 날(evtStampDay)이 오늘이 아니면 서버 오늘 합은 「어제 것」이다 — 「모른다」(null)로 둔다
  //    (app.js applyStampPill 과 같은 규칙 · 검토 2026-10-03). 그때 오늘 칸은 stampToday 가
  //    이 기기에서 오늘 센 수(todayCountCache)만으로 그린다 — 어제 합을 「오늘」로 보이지 않는다.
  //    s.days 까지 없으면(통신 실패) 그것도 「모른다」(null) — app.js fillStampPill 의 srvToday 와 같은 식.
  var srvTodayVal = (evtStampDay !== todayYmd()) ? null
    : (s.todayCount != null ? s.todayCount : (s.days ? (s.days[todayYmd()] || 0) : null));
  // ⚠️ 오늘은 stampToday(app.js)로 「지금 살아있는」 값을 쓴다 — 방금 활동을
  //    마쳤는데 서버 집계가 아직 안 따라왔을 때를 위해서다(typeof 로 빌려 쓴다).
  var liveToday = typeof stampToday === "function" ? stampToday(srvTodayVal) : (srvTodayVal || 0);
  // 자동 대상 회차(2026-10-04)는 주 칸·머리·끝 문구가 「오늘 살아 있는 +1」을 얹은 **같은 배열**을 본다
  //   (evtAutoWeekDays · 첫 화면 알약과 같은 규칙) — 칸과 「N일 함께하셨어요」가 어긋나지 않게.
  //   다른 회차는 예전 그대로 서버 weekDays 다.
  var wdShown = auto ? evtAutoWeekDays(s.weekDays, r, todayIdx, srvTodayVal, liveToday) : s.weekDays;
  var head = evtEsc(u.name) + " 님의 도장판 · " +
    (auto ? evtAutoHead(evtAutoDaysTogether(wdShown), evtAutoWeeksDone(wdShown, r))
     : (s.weeksDone ? ("지금까지 " + evtKoNum(s.weeksDone) + " 주 채웠어요")
                    : "첫 주를 채우는 중이에요"));

  // 채운 칸 표시 — 자동 대상(가을 말씀암송 동행)은 🍂 단풍잎으로(친구 2026-10-09). 지금 auto 회차는 가을뿐이다.
  //   ⚠️ 채운 칸에만 — 빈 칸은 조용한 「·」, 부분은 「n일」/「n/perDay」 그대로(나무라지 않는다). 다른 회차는 ✓.
  var okMark = auto ? "🍂" : "✓";
  var cells = "";
  for (var i = 0; i < r.weeks; i++) {
    var n = (wdShown && wdShown[i]) || 0;
    var full = n >= r.perWeek;
    cells += '<div class="ev-wk' + (full ? " on" : "") + '">' +
      '<div class="ev-wk-t">' + evtEsc(evtWeekLabel(r.start, i)) + "</div>" +
      // ⚠️ 빈 주에 굵은 「0일」을 박지 않는다 — 이 화면의 말투는 「나무라지 않는다」인데
      //    굵은 0 이 넉 장이면 그게 나무라는 것이다. 채운 칸은 축하하고 빈 칸은 조용히 둔다.
      //    하루라도 하신 주는 그 숫자를 보여 드린다(그건 격려다).
      '<div class="ev-wk-v' + (n ? "" : " zero") + '">' +
      (full ? okMark : (n ? n + "일" : "·")) + "</div></div>";
  }

  // 이번 주 7일 띠 — 하루 N번(perDay)부터 「그날 한 칸」의 속내를 보여 준다.
  // ⚠️ s.days 가 null 이면(「모른다」) 그리지 않는다 — 통신이 끊긴 날을 「0번」으로
  //    보이면 사실이 아닌 말이 된다. 측정 전(before)·이번 주가 창 밖이어도 안 그린다
  //    (days/todayCount 는 [start, start+weeks*7-1] 구간만 안다 · index.ts eventStamps).
  var daysHtml = "";
  var inWindow = todayIdx >= 0 && todayIdx < r.weeks * 7;
  if (s.days && inWindow && (s.phase === "measuring" || s.phase === "signup")) {
    var wkStart = Math.floor(todayIdx / 7) * 7;
    var dayNames = ["일", "월", "화", "수", "목", "금", "토"];
    var dcells = "";
    for (var k = 0; k < 7; k++) {
      var dn = wkStart + k;
      var ymd = evtDayYmd(r.start, dn);
      var isToday = (dn === todayIdx);
      // 오늘은 위 liveToday(stampToday) — 서버 집계가 아직 안 따라왔을 때를 위해서다.
      var n2 = isToday ? liveToday : (s.days[ymd] || 0);
      var full2 = n2 >= perDay;
      var part2 = !full2 && n2 > 0;
      dcells += '<div class="ev-day' + (full2 ? " on" : "") + (part2 ? " part" : "") +
        (isToday ? " today" : "") + '">' +
        '<div class="ev-day-t">' + (isToday ? "오늘" : dayNames[new Date(ymd + "T00:00:00Z").getUTCDay()]) + '</div>' +
        // ⚠️ 빈 날(0)·미래 칸은 .ev-wk-v.zero 와 같은 조용한 모양(리뷰 2026-10-03) — 나무라지 않는다.
        '<div class="ev-day-v' + (!full2 && !part2 ? " zero" : "") + '">' +
        (full2 ? okMark : (part2 ? (n2 + "/" + perDay) : "·")) +
        "</div></div>";
    }
    daysHtml = '<div class="ev-days">' + dcells + '</div>';
  }

  // 이번 주 남은 만큼을 말로. ⚠️ 「2일 남음」처럼 남은 것을 세면 빚처럼 읽힌다.
  var tail;
  if (auto) {
    // 자동 대상 회차(설계 §9 · 2026-10-04 바뀜) — 「신청 단추가 열려요」도 「선물 대상」도 아니고,
    //   함께한 날·앞으로 며칠을 응원으로 말한다(「앞으로 며칠」은 친구가 응원으로 말해 달라 한 것이다 —
    //   「며칠 남음」처럼 빚으로 세지 않고 「더 함께하시면 돼요」로 쓴다). 주 칸과 같은 srvTodayVal·liveToday 를 넘긴다.
    tail = evtAutoTail(s, r, !!(e && evtMineOf(e.id)), todayIdx, srvTodayVal, liveToday);
  } else if (s.eligible) {
    // ⚠️ 채우신 주를 말한다(필요 주수가 아니다) — 다섯 주 채운 분께 「세 주 채우셨어요」는 틀린 말이다.
    tail = s.allWeeks
      ? (evtKoNum(r.weeks) + " 주를 다 채우셨어요 ✨")
      : (evtKoNum(s.weeksDone) + " 주를 채우셨어요. 남은 주도 편한 만큼 함께해요.");
  } else if (s.canStillReach) {
    // ⚠️ s.need 를 쓴다. 중간에 처음 오신 분은 두 주면 열린다 — 「세 주」를 박으면 안 된다.
    tail = "지금까지 " + evtKoNum(s.weeksDone) + " 주를 채우셨어요.<br>" +
      evtKoNum(s.need) + " 주가 되면 이 자리에 신청 단추가 열려요.<br>" +
      "남은 주에 " + r.perWeek + "일씩만 채우시면 돼요.";
  } else {
    tail = "이번 신청은 여기까지예요. 채우신 " + evtKoNum(s.weeksDone) +
      " 주는 그대로 남아요 — 다음에 또 함께해요.";
  }

  // 아래 안내 줄(ev-stamp-fine 「하루에 N번 하시면…」·「…저장된 날만 셉니다」)은 뺐다(친구 2026-10-10) —
  //   intro 박스·머리·끝 문구가 이미 같은 말을 한다.
  // ev-auto — 자동 대상 회차만 머리·끝 문구를 낱말 단위로 접는다(style.css · 「지금까지 1 / 일」처럼 숫자와
  //   「일」이 갈라지지 않게 · 2026-10-04). 다른 회차의 상자는 예전 그대로다.
  return '<div class="ev-stampbox' + (auto ? " ev-auto" : "") + '">' +
    '<div class="ev-stamp-h">' + head + "</div>" +
    '<div class="ev-wks">' + cells + "</div>" +
    daysHtml +
    '<div class="ev-stamp-tail">' + tail + "</div></div>";
}

// 자동 대상 회차의 측정 기간 — { start, end }(YYYY-MM-DD). 규칙이 온전하지 않으면 null(기간 칸을 비운다).
//   needs.eligibility 는 서버가 손대지 않은 원래 값이라 여기서 모양을 다시 본다.
function evtMeasureRange(e) {
  var el = (e && e.needs && e.needs.eligibility) || null;
  var st = el ? String(el.start || "") : "";
  var wk = el ? Number(el.weeks) : 0;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(st) || !(wk >= 1)) return null;
  return { start: st, end: evtDayYmd(st, wk * 7 - 1) };
}

function evtCardHtml(e) {
  // 자동 대상 회차(설계 §9) — 신청이 없을 뿐 끝난 회차가 아니다. 흐리게(.closed) 하지 않고,
  //   기간 칸은 신청 창(opensOn~closesOn) 대신 **측정 기간**을, 단추는 「도장판 보기」를 쓴다.
  //   copy.doneBadge·mineBtn(「신청하셨어요」 류)은 쓰지 않는다 — 담당자가 인정해 넣은 줄도 「낸 것」이 아니다.
  if (evtAuto(e)) return evtAutoCardHtml(e);
  var closed = !e.canSignup;
  var cls = "ev-card" + (e.mine ? " done" : "") + (closed ? " closed" : "");
  var dday = evtDdayText(e.closesOn);
  // ⚠️ 마감된 회차도 눌러서 들어갈 수 있어야 한다 — 그 안에 **명단**이 있다.
  //    옛 사이트는 마감되면 조회까지 죽어 막다른 화면이 됐다.
  // ⚠️ 「등록」/「조회」는 서버가 정해 내려준다(verb) — 화면마다 따로 판단하면 갈라진다.
  var verb = e.verb || (closed ? "조회" : "등록");
  // ⚠️ 하드코딩하지 않는다 — 6주를 다 채우고 신청만 안 한 분이 「참여」가 없는 카드를 본다.
  var cp = e.copy || {};
  var btnLabel = e.mine ? (cp.mineBtn || "낸 것 보기 →")
    : (e.needs && e.needs.eligibility && !e.mine ? "도장판 보기 →" : verb + "하기 →");
  return '<div class="' + cls + '">' +
    (e.season ? '<div class="ev-season">' + evtEsc(e.season) + "</div>" : "") +
    '<h3 class="ev-card-t">' + evtEsc(e.shown || e.title) + "</h3>" +
    (e.subtitle ? '<p class="ev-card-s">' + evtEsc(e.subtitle) + "</p>" : "") +
    '<div class="ev-meta"><span class="ev-period">' + evtEsc(e.opensOn) +
    " ~ " + evtEsc(e.closesOn) + "</span>" +
    (closed || (e.needs && e.needs.eligibility) ? "" : '<span class="ev-dday' + (dday === "오늘 마감" ? " urgent" : "") +
      '">' + evtEsc(dday) + "</span>") + "</div>" +
    (e.mine ? '<div class="ev-badge-done">' + evtEsc(cp.doneBadge || "✅ 참여하셨어요") + "</div>" : "") +
    '<button class="ev-go" id="ev-go-' + evtEsc(e.id) + '">' + btnLabel + "</button>" +
    "</div>";
}

// 자동 대상 회차의 목록 카드(설계 §9) — 위 evtCardHtml 과 같은 뼈대에서 신청 이야기만 뺐다.
//   남은 날(D-day)도 안 단다 — 닫히는 날이 「신청 마감」으로 읽힌다.
function evtAutoCardHtml(e) {
  var mr = evtMeasureRange(e);
  var hasRule = !!(e.needs && e.needs.eligibility);
  return '<div class="ev-card">' +
    (e.season ? '<div class="ev-season">' + evtEsc(e.season) + "</div>" : "") +
    '<h3 class="ev-card-t">' + evtEsc(e.shown || e.title) + "</h3>" +
    (e.subtitle ? '<p class="ev-card-s">' + evtEsc(e.subtitle) + "</p>" : "") +
    (mr ? '<div class="ev-meta"><span class="ev-period">' + evtEsc(mr.start) +
      " ~ " + evtEsc(mr.end) + "</span></div>" : "") +
    '<button class="ev-go" id="ev-go-' + evtEsc(e.id) + '">' +
    (hasRule ? "도장판 보기 →" : "보기 →") + "</button>" +
    "</div>";
}

// ── 등록 폼 ──────────────────────────────────────────────────
function renderEventForm(u, eventId) {
  // 명단을 먼저 받아 두고 한 번에 그린다 — 두 번 그리면 화면이 덜컹거린다.
  // (「처음 오신 분이 보는 화면」이라 기다림이 짧아야 한다.)
  var e0 = evtFind(eventId);
  // ⚠️ 자동 대상 회차(설계 §9)는 공개 명단이 없다 — 받으러 가지 않는다(서버도 빈 명단을 준다).
  if (e0 && !e0.canSignup && !evtAuto(e0) && evtRosterFor !== evtRosterKey(eventId, u && u.user_id)) {
    evtLoadRoster(eventId, u && u.user_id).then(function () { evtDrawForm(u, eventId); });
    return;
  }
  evtDrawForm(u, eventId);
}

function evtDrawForm(u, eventId) {
  var e = evtFind(eventId);
  if (!e) { renderEventList(null); return; }
  var mine = evtMineOf(eventId);
  var needs = e.needs || {};
  var canSignup = !!e.canSignup;

  if (!evtForm || evtForm.eventId !== eventId) {
    evtForm = {
      eventId: eventId,
      position: (mine && mine.position) || evtHint || "",
      // ⚠️ 전화번호는 다른 기능(필사·사역신청)에서 가져오지 않는다.
      //    privacy/ 가 용도를 한정해 적어 두었다. 같은 회차에서 내가 낸 값만 채운다.
      phone: (mine && mine.phone) || "",
      memo: (mine && mine.memo) || "",
    };
  }

  var isGu = u.type === "교구";
  var who = isGu
    ? [u.gu, u.mok ? u.mok + "목장" : ""].filter(Boolean).join(" ")
    : [u.bu, u.grade].filter(Boolean).join(" ");

  var html =
    '<div class="ev-head"><h2 class="ev-title">' + evtEsc(e.shown || e.title) + "</h2>" +
    '<button class="ev-back" id="ev-back">← 목록</button></div>' +
    (e.subtitle ? '<p class="ev-lead">' + evtEsc(e.subtitle) + "</p>" : "") +
    // ⚠️ ev-intro 가 줄바꿈을 살린다(white-space:pre-line) — SQL 의 chr(10) 이 그대로
    //    공백으로 접히면 「하루 3번」 같은 줄이 한 문단에 묻힌다(2026-10-03).
    (e.copy && e.copy.intro
      ? '<div class="ev-note ev-intro">' + evtEsc(e.copy.intro) + "</div>" : "");

  // ⚠️ 이 줄은 `if (!canSignup)` **앞**에 있어야 한다. 그 분기는 폼 대신 명단만
  //    그려서, 신청 창이 열리기 전(measuring)에는 도장판이 아예 안 보이게 된다.
  if (e.needs && e.needs.eligibility) html += evtStampHtml(u, e);

  // ── 자동 대상 회차(설계 §9): 머리·안내·도장판까지만 ──────────────────
  // 신청이 없다 — 「…부터 신청을 받아요」·공개 명단·「이렇게 등록됩니다」·등록/취소 단추를 그리지 않는다.
  // 대상이신지는 도장판 끝 문구(evtAutoTail)가 말한다. 홈·목록 단추만 잇는다.
  if (evtAuto(e)) {
    document.getElementById("app").innerHTML =
      '<div class="ev-wrap">' + html + "</div>" +
      '<button class="home-fab" id="ev-home" aria-label="첫 화면으로">' +
      homeFabLabel(u, true) + "</button>";
    window.scrollTo(0, 0);
    document.getElementById("ev-home")
      .addEventListener("click", function () { renderSummary(); });
    document.getElementById("ev-back")
      .addEventListener("click", function () { evtForm = null; renderEventList(null); });
    return;
  }

  // ── 마감된 회차: 폼 대신 「전체 명단」(안에서 내 것도 찾아 준다) ──────
  // 옛 사이트는 마감되면 조회까지 죽어 막다른 화면이 됐다. 여기서는 마감이
  // 「등록만 막히고 보는 것은 살아 있는」 상태다(events.status = closed).
  if (!canSignup) {
    // ⚠️ 「이 정보로 명단에서 찾습니다」·「참여하셨어요」 카드를 여기서 뺐다
    //    (2026-09-13 성도님 지적 — 셋이 같은 말을 반복했다: 이 안내, mine-card,
    //    그리고 명단 안의 「찾았어요」). 명단 쪽 하나만 남긴다.
    // ⚠️ **「아직 신청 전」과 「마감」은 다르다.** 측정 중(measuring)에는 명단이 비어 있는 것이
    //    당연한데, 그때 명단을 보여 주면 「참여자 0명」 + 「명단에서 자기를 찾아보라」는
    //    앞뒤가 안 맞는 말을 하게 된다. 그런데 이 화면이 **10/18~11/2 열엿새 동안** 보인다(2026-10-03 한 주 미룸).
    //    phase 는 서버가 정해 준다 — 화면이 날짜를 다시 재지 않는다.
    // ⚠️ phase 를 모를 때(통신이 끊겼을 때)는 지금까지 하던 대로 명단을 그린다.
    // ⚠️ **이 회차가 자격 회차일 때만** phase 로 갈린다. 이 검사를 빠뜨리면
    //    자격 요건이 없는 **다른 회차**를 열었을 때도 「10월 27일부터…도장만 채우시면」이
    //    떠서 날짜도 뜻도 틀린 말을 하게 된다(evtStamp 는 전역이다).
    var ph = (e.needs && e.needs.eligibility &&
              evtStampState === "ready" && evtStamp) ? evtStamp.phase : "";
    if (ph === "before" || ph === "measuring") {
      html += '<div class="ev-note">' + evtEsc(evtDateKo(e.opensOn)) +
        "부터 신청을 받아요.<br>그때까지는 도장만 채우시면 돼요.</div>";
    } else {
      html += evtRosterHtml(u, eventId) ||
        '<div class="ev-note">명단을 불러오지 못했어요. 잠시 뒤 다시 눌러 주세요.</div>';
    }
    document.getElementById("app").innerHTML =
      '<div class="ev-wrap">' + html + "</div>" +
      '<button class="home-fab" id="ev-home" aria-label="첫 화면으로">' +
      homeFabLabel(u, true) + "</button>";
    window.scrollTo(0, 0);
    document.getElementById("ev-home")
      .addEventListener("click", function () { renderSummary(); });
    document.getElementById("ev-back")
      .addEventListener("click", function () { evtForm = null; renderEventList(null); });
    return;
  }

  // 신원은 묻지 않는다 — 로그인 정보가 그대로 들어간다.
  // 등록 중(canSignup)에만 보여 준다 — 마감 뒤에는 명단 쪽 「찾았어요」 하나로 충분하다.
  html += '<div class="ev-who"><div class="ev-who-l">이렇게 등록됩니다</div>' +
    '<div class="ev-who-v"><b>' + evtEsc(u.name) + "</b> · " + evtEsc(who) +
    "</div></div>";

  if (needs.position) {
    // ⚠️ 목록을 여기 베껴 두지 않는다 — 사역신청(app.js:9081)·서버(index.ts)와 셋이
    //    갈라지면 한쪽만 고치게 된다. app.js 의 전역을 그대로 빌려 쓴다(런타임에 있다).
    //    app.js 가 아직 안 뜬 경우에만 쓰는 대비책을 뒤에 둔다.
    var POSITIONS = (typeof MIN_POSITIONS !== "undefined" && MIN_POSITIONS.length)
      ? MIN_POSITIONS
      : ["성도", "집사", "권사", "안수집사", "장로", "전도사", "목사", "사모", "학생"];
    html += '<div class="ev-field"><label class="ev-label">직분</label>' +
      '<div class="ev-chips" id="ev-pos">' +
      POSITIONS
        .map(function (p) {
          return '<button class="ev-chip' + (evtForm.position === p ? " on" : "") +
            '" data-pos="' + p + '">' + p + "</button>";
        }).join("") + "</div></div>";
  }
  if (needs.phone) {
    html += '<div class="ev-field"><label class="ev-label" for="ev-phone">휴대폰</label>' +
      '<input class="ev-input" id="ev-phone" type="tel" inputmode="numeric" ' +
      'placeholder="010-1234-5678" value="' + evtEsc(evtForm.phone) + '"></div>';
  }
  if (needs.memo) {
    html += '<div class="ev-field"><label class="ev-label" for="ev-memo">한 줄 남기기 ' +
      '<span class="ev-opt">(안 써도 됩니다)</span></label>' +
      '<textarea class="ev-input ev-ta" id="ev-memo" rows="3" maxlength="300">' +
      evtEsc(evtForm.memo) + "</textarea></div>";
  }

  // ⚠️ disabled 단추를 그리지 않는다 — 어르신께 회색 단추는 「나는 안 된다」로 읽힌다.
  //    자격이 아직이면 단추 자리를 비운다(도장판이 이미 그 말을 하고 있다).
  // ⚠️ 「모른다」로는 잠그지 않는다. evtStampState 가 "ready" 일 때만 잠근다 —
  //    통신이 잠깐 끊긴 분을 영영 못 내게 하면 안 된다. 어차피 서버가 not-eligible 로 막는다.
  var evtLocked = !!(e.needs && e.needs.eligibility) &&
    evtStampState === "ready" && !!evtStamp && !evtStamp.eligible;

  html += '<div class="ev-acts">' +
    (evtLocked ? "" : '<button class="ev-submit" id="ev-submit">' +
    (mine ? "고치기" : "참여 등록하기") + "</button>") +
    (mine ? '<button class="ev-cancel" id="ev-cancel">참여 취소</button>' : "") +
    "</div>";

  document.getElementById("app").innerHTML =
    '<div class="ev-wrap">' + html + "</div>" +
    '<button class="home-fab" id="ev-home" aria-label="첫 화면으로">' +
    homeFabLabel(u, true) + "</button>";
  window.scrollTo(0, 0);

  document.getElementById("ev-home")
    .addEventListener("click", function () { renderSummary(); });
  document.getElementById("ev-back")
    .addEventListener("click", function () { evtForm = null; renderEventList(null); });

  var pos = document.getElementById("ev-pos");
  if (pos) {
    pos.addEventListener("click", function (ev2) {
      var b = ev2.target && ev2.target.closest ? ev2.target.closest(".ev-chip") : null;
      if (!b) return;
      evtForm.position = b.getAttribute("data-pos");
      renderEventForm(u, eventId);
    });
  }
  var ph = document.getElementById("ev-phone");
  if (ph) {
    // 어르신이 하이픈을 신경 쓰지 않게 입력 중에 010-1234-5678 꼴로 정리한다
    // (필사 신청의 pilsaPhoneFmt 와 같은 규칙).
    ph.addEventListener("input", function () {
      var d = ph.value.replace(/[^0-9]/g, "").slice(0, 11);
      if (d.length > 7) ph.value = d.slice(0, 3) + "-" + d.slice(3, 7) + "-" + d.slice(7);
      else if (d.length > 3) ph.value = d.slice(0, 3) + "-" + d.slice(3);
      else ph.value = d;
      evtForm.phone = ph.value;
    });
  }
  var mm = document.getElementById("ev-memo");
  if (mm) mm.addEventListener("input", function () { evtForm.memo = mm.value; });

  if (!evtLocked) {
    document.getElementById("ev-submit")
      .addEventListener("click", function () { evtSubmit(u, eventId); });
  }
  var cc = document.getElementById("ev-cancel");
  if (cc) cc.addEventListener("click", function () { evtAskDrop(u, eventId); });
}

// ── 전체 명단 ────────────────────────────────────────────────
// 성도님이 그려 주신 모양: 소속으로 묶고 줄은 「이름-구역」.
//     화평
//      - 김세웅-20
// ⚠️ 이 화면의 노림수는 「자기 것이 있는지 보려고 가입하게」다. 그래서 **로그인한
//    분의 줄을 찾아 표시**한다 — 이관된 164명 중 101명은 앱 계정이 없어 「내 등록」이
//    안 뜨는데, 명단에서 자기 이름이 짚어지면 그 자리에서 확인이 끝난다.
var evtRoster = null;      // { event, total, groups } — 회차 + uid 조합마다 한 번만 받는다
var evtRosterFor = "";     // evtRosterKey(eventId, uid)

// ⚠️ uid 를 키에 넣는다(2026-10-03) — 시험 회차 명단은 시험 참여자에게만 내려오므로,
//    uid 없이 eventId 만으로 캐시하면 공용 기기에서 사람이 바뀐 뒤에도 앞사람(테스터)이
//    받은 명단이 다음 분(비테스터)에게 그대로 보일 수 있다.
function evtRosterKey(eventId, uid) { return eventId + "::" + (uid || ""); }

function evtLoadRoster(eventId, uid) {
  var key = evtRosterKey(eventId, uid);
  if (evtRosterFor === key && evtRoster) return Promise.resolve();
  if (!(window.api && api.eventRosterPublic)) return Promise.resolve();
  return api.eventRosterPublic(eventId, uid).then(function (r) {
    evtRoster = r; evtRosterFor = key;
  }).catch(function (e) {
    evtRoster = null; evtRosterFor = "";
    if (window.console) console.warn("eventRosterPublic 실패:", e && e.message);
  });
}

// 로그인한 분과 같은 줄인가 — 소속·세부·이름 셋으로 본다(앱의 신원 규칙과 같은 조각).
// ⚠️ 명단 줄 자체는 더 이상 이 값으로 꾸미지 않는다(아래 evtRosterHtml 참조) —
//    「본인 것을 찾았는가」만 위 안내 문구에 쓰고, 어느 줄인지는 표시하지 않는다.
function evtIsMeLine(u, group, m) {
  if (!u) return false;
  var isGu = u.type === "교구";
  var g = (isGu ? u.gu : u.bu) || "";
  var s = (isGu ? u.mok : u.grade) || "";
  return group === g && String(m.sub) === String(s) && m.name === u.name;
}

function evtRosterHtml(u, eventId) {
  if (evtRosterFor !== evtRosterKey(eventId, u && u.user_id) || !evtRoster) return "";
  var found = evtRoster.groups.some(function (g) {
    return g.members.some(function (m) { return evtIsMeLine(u, g.name, m); });
  });
  // ⚠️ 명단 줄에는 「← 나」를 달지 않는다(2026-09-10) — 본인 것은 이미 위쪽
  //    (mine-card·이 찾음 안내)에서 앞서 알려 줬으니, 164줄 사이에서 또 강조하는
  //    것은 같은 정보를 두 번 주는 것이다. 그래서 evtIsMeLine 은 위 found 값을
  //    구하는 데만 쓰고, 줄 자체는 누구나 같은 모양으로 그린다.
  var body = evtRoster.groups.map(function (g) {
    return '<div class="ev-grp"><div class="ev-grp-t"><span class="ev-grp-nm">' +
      evtEsc(g.name) + '</span><span class="ev-grp-n">' + g.count + '명</span></div>' +
      '<ul class="ev-grp-l">' +
      g.members.map(function (m) {
        return "<li>" + evtEsc(m.name) + "-" + evtEsc(m.sub) + "</li>";
      }).join("") + "</ul></div>";
  }).join("");

  // 「내 등록」이 안 뜨는 분께 까닭을 적어 준다 — 안 그러면 명단을 보고도 헤맨다.
  var hint = found
    ? '<div class="ev-found">✅ 명단에서 <b>' + evtEsc(u.name) + '</b> 님을 찾았어요.</div>'
    : '<div class="ev-note ev-miss">명단에서 <b>' + evtEsc(u.name) +
      '</b> 님을 못 찾았어요.<br>로그인하신 <b>소속·구역·이름</b>이 신청하실 때와 한 글자라도 다르면 못 찾습니다 — ' +
      '아래 명단에서 직접 확인해 보세요. 명단에 있는데 안 잡히면 담당자에게 알려 주세요.</div>';

  return '<div class="ev-roster"><div class="ev-roster-h">참여자 <b>' + evtRoster.total +
    '</b>명</div>' + hint + body + "</div>";
}

function evtSubmit(u, eventId) {
  var e = evtFind(eventId);
  var needs = (e && e.needs) || {};
  if (needs.position && !evtForm.position) {
    appAlert("직분을 골라 주세요."); return;
  }
  if (needs.phone) {
    var d = (evtForm.phone || "").replace(/[^0-9]/g, "");
    if (!d) { appAlert("휴대폰 번호를 적어 주세요."); return; }
    if (!/^01[016-9][0-9]{7,8}$/.test(d)) {
      appAlert("휴대폰 번호를 다시 확인해 주세요.<br><b>010-1234-5678</b> 꼴로 적어 주세요.");
      return;
    }
  }
  // ⚠️ user_id 는 로그인 직후 비어 있을 수 있다 — 서버가 준 값을 syncProgress 가
  //    나중에 채운다. 이 화면은 user_id 가 신원의 전부라 그 자리를 반드시 다룬다.
  if (!u.user_id) {
    appAlert("잠시 뒤 다시 눌러 주세요.<br>기록을 서버와 맞추는 중입니다.");
    return;
  }
  var btn = document.getElementById("ev-submit");
  var label = btn.textContent;
  btn.disabled = true; btn.textContent = "처리 중…";
  api.eventSignup({
    user_id: u.user_id,
    event_id: eventId,
    position: evtForm.position,
    phone: evtForm.phone,
    memo: evtForm.memo,
  }).then(function () {
    evtForm = null;
    return evtLoad(u);
  }).then(function (fresh) {
    if (fresh === false) return;   // 그사이 로그아웃·다른 분 — 앞사람 화면을 다시 그리지 않는다
    var e2 = evtFind(eventId);
    if (e2 && e2.needs && e2.needs.eligibility) {
      // ⚠️ appAlert 한 줄로 끝내지 않는다 — 스냅샷을 성도님 말로 옮겨야
      //    「신청한 뒤에 한 주 쉬면 취소되나요」를 담당자에게 묻지 않는다.
      var wd = (evtStamp && evtStamp.weeksDone) || 0;
      appAlert("<b>신청이 끝났어요</b><br>" + evtEsc(u.name) +
        " 성도님 이름을 명단에 올렸어요.<br>지금까지 채우신 " + wd +
        "주를 그대로 적어 두었어요.<br>남은 주도 편한 만큼 함께해요.");
      renderEventForm(u, eventId);   // ⚠️ 목록으로 보내지 않는다 — 도장판과 함께 다시 본다
      return;
    }
    appAlert("참여를 등록했어요. 고맙습니다!");
    evtDrawListFresh(u);
  }).catch(function (err) {
    btn.disabled = false; btn.textContent = label;
    appAlert(evtErrText(err, e));
  });
}

function evtAskDrop(u, eventId) {
  var mine = evtMineOf(eventId);
  if (!mine) return;
  var e = evtFind(eventId);
  // ⚠️ appConfirm(msg, opts) 두 인자다 — 객체 하나로 부르면 메시지가 비어 뜬다.
  //    msg 는 innerHTML 로 들어가므로 <br>·<b> 가 통한다(app.js:1289 appModal).
  appConfirm("참여를 취소할까요?<br>다시 등록하실 수 있어요.", {
    okText: "참여 취소", cancelText: "돌아가기", danger: true,
  }).then(function (yes) {
    if (!yes) return;
    return api.eventDrop(u.user_id, mine.id).then(function () {
      evtForm = null;
      return evtLoad(u);
    }).then(function (fresh) {
      if (fresh === false) return;   // 그사이 로그아웃·다른 분 — 앞사람 화면을 다시 그리지 않는다
      appAlert("참여를 취소했어요.");
      evtDrawListFresh(u);
    }).catch(function (err) { appAlert(evtErrText(err, e)); });
  });
}

// 목록을 다시 그린다 — 「하나뿐이면 폼으로 건너뛰기」를 타지 않게 목록으로 곧장.
function evtDrawListFresh(u) {
  document.getElementById("app").innerHTML =
    '<div class="ev-wrap"></div>' +
    '<button class="home-fab" id="ev-home" aria-label="첫 화면으로">' +
    homeFabLabel(u, true) + "</button>";
  window.scrollTo(0, 0);
  document.getElementById("ev-home")
    .addEventListener("click", function () { renderSummary(); });
  evtDrawList(u, null);
}

// 서버 슬러그를 성도님 말로 바꾼다 — 「아직 안 열렸다」와 「마감했다」를 뭉개지 않는다.
// e: evtFind 로 찾은 회차(있으면) — not-yet 에 그 회차의 진짜 opensOn 을 쓰려고
// (박힌 「10월 27일」은 이미 틀린 날짜였다. 진짜 회차는 11/3, 시험 회차는 10/4 · 2026-10-03).
function evtErrText(err, e) {
  var m = (err && err.message) || "";
  if (m === "closed-period") return "등록 기간이 지났어요.";
  if (m === "not-open") return "아직 열리지 않은 이벤트예요.";
  if (m === "not-found") return "이벤트를 찾을 수 없어요.";
  // 자동 대상 회차(설계 §9) — 서버가 성도님 신청·취소를 받지 않는다. 이 화면엔 그 단추가 없어 드물게만
  //   뜬다(목록을 받아 둔 뒤에 회차가 자동 대상으로 바뀌었는데 예전 폼에서 단추를 누른 경우).
  if (m === "auto-event") return "따로 신청하지 않으셔도 돼요.";
  if (m === "no-user") return "로그인 정보를 확인할 수 없어요. 다시 로그인해 주세요.";
  if (m === "bad-args") return "요청이 올바르지 않아요. 다시 시도해 주세요.";
  if (m === "not-eligible") return "아직 신청이 열리지 않았어요.<br>몇 주가 더 필요한지는 도장판에 적혀 있어요.";
  if (m === "not-yet") {
    var opensOn = e && e.opensOn;
    // ⚠️ opensOn 이 없을 때 "곧" + "부터 신청을 받아요" 로 이어 붙이면 "곧부터 신청을
    //    받아요"가 되어 어색하다(리뷰 2026-10-03) — 그 경우만 따로 문장을 쓴다.
    return opensOn ? (evtDateKo(opensOn) + "부터 신청을 받아요.") : "곧 신청을 받아요.";
  }
  if (m === "no-rule") return "준비 중이에요. 잠시 뒤 다시 열어 주세요.";
  if (m === "bad-rule") return "지금은 신청을 받을 수 없어요. 잠시 뒤에 다시 해 주세요.";
  if (m === "bad-position") return "직분을 다시 골라 주세요.";
  if (m === "bad-phone") return "휴대폰 번호를 다시 확인해 주세요.<br><b>010-1234-5678</b> 꼴로 적어 주세요.";
  return m || "잠시 뒤 다시 시도해 주세요.";
}
