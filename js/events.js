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

// ── 불러오기 ─────────────────────────────────────────────────
function evtLoad(u) {
  if (!evtApiReady()) {
    evtState = "unknown";
    return Promise.resolve();
  }
  var uid = (u && u.user_id) || "";
  return api.eventOpenList(uid).then(function (r) {
    evtEvents = (r && r.events) || [];
    evtMine = (r && r.mine) || [];
    evtHint = (r && r.positionHint) || "";
    evtState = evtEvents.length ? "some" : "none";
  }).catch(function (e) {
    // 서버가 옛 판이라 액션이 없다 · 표가 없다 · 통신 실패 — 전부 「모른다」다.
    // 「없다」로 뭉개지 않는다.
    evtState = "unknown";
    evtEvents = []; evtMine = []; evtHint = "";
    if (window.console) console.warn("eventOpenList 실패:", e && e.message);
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

  evtLoad(u).then(function () {
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
  if (!evtMine.length) return "";
  return '<div class="ev-sent"><div class="ev-sent-t">📋 이미 내신 것 <b>' +
    evtMine.length + "건</b></div>" +
    evtMine.map(function (m) {
      var e = evtFind(m.eventId);
      var nm = e ? (e.shown || e.title) : m.eventId;
      return '<div class="ev-sent-r"><span class="ev-sent-n">' + evtEsc(nm) +
        '</span><span class="ev-sent-s">접수</span></div>';
    }).join("") + "</div>";
}

function evtCardHtml(e) {
  var closed = !e.canSignup;
  var cls = "ev-card" + (e.mine ? " done" : "") + (closed ? " closed" : "");
  var dday = evtDdayText(e.closesOn);
  // ⚠️ 마감된 회차도 눌러서 들어갈 수 있어야 한다 — 그 안에 **명단**이 있다.
  //    옛 사이트는 마감되면 조회까지 죽어 막다른 화면이 됐다.
  // ⚠️ 「등록」/「조회」는 서버가 정해 내려준다(verb) — 화면마다 따로 판단하면 갈라진다.
  var verb = e.verb || (closed ? "조회" : "등록");
  var btnLabel = e.mine ? "낸 것 보기 →" : verb + "하기 →";
  return '<div class="' + cls + '">' +
    (e.season ? '<div class="ev-season">' + evtEsc(e.season) + "</div>" : "") +
    '<h3 class="ev-card-t">' + evtEsc(e.shown || e.title) + "</h3>" +
    (e.subtitle ? '<p class="ev-card-s">' + evtEsc(e.subtitle) + "</p>" : "") +
    '<div class="ev-meta"><span class="ev-period">' + evtEsc(e.opensOn) +
    " ~ " + evtEsc(e.closesOn) + "</span>" +
    (closed ? "" : '<span class="ev-dday' + (dday === "오늘 마감" ? " urgent" : "") +
      '">' + evtEsc(dday) + "</span>") + "</div>" +
    (e.mine ? '<div class="ev-badge-done">✅ 참여하셨어요</div>' : "") +
    '<button class="ev-go" id="ev-go-' + evtEsc(e.id) + '">' + btnLabel + "</button>" +
    "</div>";
}

// ── 등록 폼 ──────────────────────────────────────────────────
function renderEventForm(u, eventId) {
  // 명단을 먼저 받아 두고 한 번에 그린다 — 두 번 그리면 화면이 덜컹거린다.
  // (「처음 오신 분이 보는 화면」이라 기다림이 짧아야 한다.)
  var e0 = evtFind(eventId);
  if (e0 && !e0.canSignup && evtRosterFor !== eventId) {
    evtLoadRoster(eventId).then(function () { evtDrawForm(u, eventId); });
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
    (e.copy && e.copy.intro
      ? '<div class="ev-note">' + evtEsc(e.copy.intro) + "</div>" : "") +

    // 신원은 묻지 않는다 — 로그인 정보가 그대로 들어간다.
    //  마감된 회차에서는 「등록됩니다」가 아니라 「이 정보로 찾습니다」다.
    '<div class="ev-who"><div class="ev-who-l">' +
    (canSignup ? "이렇게 등록됩니다" : "이 정보로 명단에서 찾습니다") + "</div>" +
    '<div class="ev-who-v"><b>' + evtEsc(u.name) + "</b> · " + evtEsc(who) +
    "</div></div>";

  // ── 마감된 회차: 폼 대신 「내 등록 + 전체 명단」 ──────────────
  // 옛 사이트는 마감되면 조회까지 죽어 막다른 화면이 됐다. 여기서는 마감이
  // 「등록만 막히고 보는 것은 살아 있는」 상태다(events.status = closed).
  if (!canSignup) {
    if (mine) {
      html += '<div class="ev-mine-card"><div class="ev-mine-t">✅ 참여하셨어요</div>' +
        (mine.position ? '<div class="ev-mine-v">' + evtEsc(mine.position) + "</div>" : "") +
        '<div class="ev-mine-at">' + evtEsc(String(mine.at || "").slice(0, 10)) + " 신청</div></div>";
    }
    html += evtRosterHtml(u, eventId) ||
      '<div class="ev-note">명단을 불러오지 못했어요. 잠시 뒤 다시 눌러 주세요.</div>';
    document.getElementById("app").innerHTML =
      '<div class="ev-wrap">' + html + "</div>" +
      '<button class="home-fab" id="ev-home" aria-label="첫 화면으로">' +
      homeFabLabel(u, true) + "</button>";
    window.scrollTo(0, 0);
    document.getElementById("ev-home")
      .addEventListener("click", function () { renderSummary(); });
    document.getElementById("ev-back")
      .addEventListener("click", function () { evtForm = null; renderEventList(null); });
    // ⚠️ 명단 줄 안에서 「← 나」를 표시하거나 그 자리로 스크롤하지 않는다
    //    (2026-09-10 성도님 지시) — 본인 것은 이미 위 안내(찾았어요/mine-card)에서
    //    「앞에」 알려 줬으니, 아래 명단 안에서 또 짚어 주는 것은 중복이다.
    return;
  }

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

  html += '<div class="ev-acts">' +
    '<button class="ev-submit" id="ev-submit">' +
    (mine ? "고치기" : "참여 등록하기") + "</button>" +
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

  document.getElementById("ev-submit")
    .addEventListener("click", function () { evtSubmit(u, eventId); });
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
var evtRoster = null;      // { event, total, groups } — 회차마다 한 번만 받는다
var evtRosterFor = "";

function evtLoadRoster(eventId) {
  if (evtRosterFor === eventId && evtRoster) return Promise.resolve();
  if (!(window.api && api.eventRosterPublic)) return Promise.resolve();
  return api.eventRosterPublic(eventId).then(function (r) {
    evtRoster = r; evtRosterFor = eventId;
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
  if (evtRosterFor !== eventId || !evtRoster) return "";
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
  }).then(function () {
    appAlert("참여를 등록했어요. 고맙습니다!");
    evtDrawListFresh(u);
  }).catch(function (err) {
    btn.disabled = false; btn.textContent = label;
    appAlert(evtErrText(err));
  });
}

function evtAskDrop(u, eventId) {
  var mine = evtMineOf(eventId);
  if (!mine) return;
  // ⚠️ appConfirm(msg, opts) 두 인자다 — 객체 하나로 부르면 메시지가 비어 뜬다.
  //    msg 는 innerHTML 로 들어가므로 <br>·<b> 가 통한다(app.js:1289 appModal).
  appConfirm("참여를 취소할까요?<br>다시 등록하실 수 있어요.", {
    okText: "참여 취소", cancelText: "돌아가기", danger: true,
  }).then(function (yes) {
    if (!yes) return;
    return api.eventDrop(u.user_id, mine.id).then(function () {
      evtForm = null;
      return evtLoad(u);
    }).then(function () {
      appAlert("참여를 취소했어요.");
      evtDrawListFresh(u);
    }).catch(function (err) { appAlert(evtErrText(err)); });
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
function evtErrText(err) {
  var m = (err && err.message) || "";
  if (m === "closed-period") return "등록 기간이 지났어요.";
  if (m === "not-open") return "아직 열리지 않은 이벤트예요.";
  if (m === "not-found") return "이벤트를 찾을 수 없어요.";
  if (m === "no-user") return "로그인 정보를 확인할 수 없어요. 다시 로그인해 주세요.";
  if (m === "bad-args") return "요청이 올바르지 않아요. 다시 시도해 주세요.";
  return m || "잠시 뒤 다시 시도해 주세요.";
}
