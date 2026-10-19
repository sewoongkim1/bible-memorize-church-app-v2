// ============================================================
// 🤝 사역신청(2027) · 🗂️ 사역 이력 확인 — 성도 화면 (2026-10-12 app.js 에서 떼어 냈다 · 필요할 때 받는다)
//   app.js 의 openMinistry()·openMinistryHistory() 가 확인 번호 문을 묻는 동안 받아(withLazyJs("ministry")) 그 뒤 renderMinistry·renderMinistryHistory 를 부른다.
//   문(ministryVisible)·기간·시험 참여자 캐시·MIN_POSITIONS·pilsaPhoneFmt/Ok 는 app.js 에 있다 — 첫 화면·js/events.js 가 동기로 쓴다.
//   ⚠️ 이 파일의 맨 위에는 선언만 둔다(받는 순간 돈다) · app.js 와 이름이 겹치면 받는 순간 SyntaxError — docs/notes/lazy-load.md · tests/lazy-load.test.cjs
// ============================================================

/* ==========================================================================
   사역신청 (2027) — 성도 화면
   설계: docs/superpowers/specs/2026-09-06-ministry-application-design.md
   계획: docs/superpowers/plans/2026-09-08-ministry-application.md

   흐름: 안내 → 부서 고르기(아코디언·최대 3) → 확인 → 제출 → 내 신청(진행 현황)
   ⚠️ 순위는 없다(2026-09-08 결정). 번호를 붙이지 않는다.
   ⚠️ 이름·교구·목장은 로그인 정보로 이미 있다 — 다시 묻지 않는다.
   ⚠️ 임명직은 목록에서 빼지 않고 잠근 채 보여 준다 — 부서 전체 구조가 보이도록.
   ========================================================================== */
let minCat = null;        // { year, period, list:[...] } — 화면 진입 때 한 번 받는다
let minMine = null;       // 내 신청 { items, max, used, left, openCount, position, at }
// ⚠️ 한 사람이 한 건이 아니라 **한 팀이 한 건**이다(2026-09-09). 담당자가 팀마다 따로
//    접수하고, 접수된 건은 잠기며, 3개가 안 찼으면 그 뒤에도 더 신청할 수 있기 때문이다.
let minLockedIds = [];    // 이미 결정돼 뺄 수 없는 팀(id 만)
let minLocked = [];       // [{ id, status }] — 딱지에 **진짜 상태**를 적으려고 함께 든다
let minSentIds = [];      // 이미 **낸** 것(신청완료) — 방금 고른 것과 구분해 딱지를 붙인다

/* ── 필터 ──────────────────────────────────────────────────────
   88팀을 위원회 아코디언만으로 훑기 어렵다는 성도님 지적에서 나왔다.
   ⚠️ 구간(6~9 …)은 **화면이 묶는다**. 서버·DB 는 시각 그대로 갖고 있어서,
      구간을 다시 그어도 부서에 두 번 묻지 않는다.
   ⚠️ 겹치는 구간이라 판정 규칙을 못 박아 둔다 — **모이는 시각이 그 구간에 들면 걸린다.**
      성도님이 묻는 것은 「몇 시에 나가야 하나」다.                                */
// 화면에는 성도님이 실제로 비교할 세 요일만 간결하게 내놓는다.
const MIN_DAYS = [
  { k: "sun",  t: "주일" },
  { k: "fri",  t: "금요일" },
  { k: "week", t: "수요일" },
];
// ⚠️ 주기는 팀마다 **여럿일 수 있다**(매주 또는 격주인 팀이 있다). 그래서 서버가
//    한 글자가 아니라 참·거짓 넷을 준다 — 요일과 같은 모양이라 같은 방식으로 다룬다.
//    ⚠️ 이 열쇠 이름은 DB 칸 이름(freq_weekly …)과 짝이다. 한쪽만 고치면 조용히 안 걸린다.
const MIN_FREQS = [
  { k: "weekly",   t: "매주" },
  { k: "biweekly", t: "격주" },
  { k: "monthly",  t: "한달" },
];
const MIN_BANDS = [
  { k: "6-9",   t: "6~9",   a: 6,  b: 9 },
  { k: "8-11",  t: "8~11",  a: 8,  b: 11 },
  { k: "10-13", t: "10~13", a: 10, b: 13 },
  { k: "14-16", t: "14~16", a: 14, b: 16 },
];
let minF = { day: [], freq: [], band: [] };
let minQ = "";            // 이름으로 찾기 — 필터와 같은 취급(켜지면 목록이 좁아진다)
function minFOn() {
  return minF.day.length + minF.freq.length + minF.band.length > 0 || !!minQ;
}
// 띄어쓰기·가운뎃점을 지우고 견준다 — 「오병이어 1팀」을 「오병이어1」로도 찾게
function minNorm(v) { return String(v || "").replace(/[\s·・.]/g, "").toLowerCase(); }

// 'HH:MM' → 시각(소수). 비었거나 모양이 틀리면 null = 「모름」
function minHour(v) {
  const m = /^(\d{2}):(\d{2})$/.exec(String(v || ""));
  return m ? Number(m[1]) + Number(m[2]) / 60 : null;
}
// ⚠️ 한 축 안은 「또는」, 축끼리는 「그리고」. 안 켠 축은 아무것도 거르지 않는다.
function minMatch(t) {
  if (minF.day.length) {
    const d = t.day || {};
    const none = !d.sun && !d.fri && !d.sat && !d.week;   // 비어 있음 = 정해진 날 없음
    const ok = minF.day.some(function (k) {
      return k === "none" ? none : !!d[k];
    });
    if (!ok) return false;
  }
  if (minF.freq.length) {
    const f = t.freq || {};
    // ⚠️ 아무것도 안 적힌 팀은 「그때그때」로 본다 — 비어 있음은 「모름」이지
    //    「해당 없음」이 아니다. 미기입을 제외로 짜면 회신율이 곧 실종률이 된다.
    const bare = !f.weekly && !f.biweekly && !f.monthly && !f.adhoc;
    const ok = minF.freq.some(function (k) {
      return k === "adhoc" ? (f.adhoc || bare) : !!f[k];
    });
    if (!ok) return false;
  }
  if (minQ) {
    const q = minNorm(minQ);
    const hay = minNorm(t.team + " " + t.group + " " + t.committee);
    if (hay.indexOf(q) < 0) return false;
  }
  if (minF.band.length) {
    const h = minHour(t.from);
    const ok = minF.band.some(function (k) {
      const b = MIN_BANDS.filter(function (x) { return x.k === k; })[0];
      if (!b) return false;
      if (b.k === "none") return h === null;        // 비어 있음 = 때마다 다름
      return h !== null && h >= b.a && h < b.b;     // 모이는 시각이 구간에 드는가
    });
    if (!ok) return false;
  }
  return true;
}
// 「고른 것」은 필터를 타지 않는다 — 숨기면 뺄 수가 없어진다
function minShown(t) {
  return minPicked.indexOf(t.id) >= 0 || minLockedIds.indexOf(t.id) >= 0 || minMatch(t);
}
let minPicked = [];       // 고른 팀 id (최대 3, 순위 아님)
let minOpen = null;       // 펼친 위원회 이름 (한 번에 하나)
let minLoaded = false;
let minStep = "pick";     // pick | confirm | done
let minPhoneVal = "";     // 휴대폰 번호 — 화면에만 잠깐 둔다(앱에 저장하지 않는다)
let minPosVal = "";       // 직분 — 골라서 낸다(자유 입력이 아니다)
// MIN_POSITIONS(직분 목록)는 app.js 에 남았다 — js/events.js 가 처음부터 typeof 로 빌려 쓴다(이 파일은 필요할 때 받는다).
const MIN_MAX = 3;

// 브라우저가 옛 js/api.js를 물고 있으면 사역 액션이 아예 없다
function minApiReady() { return !!(window.api && api.ministryCatalog && api.ministryApply); }

// ?preview=ministry 로 열면 기간 밖에도 시험해 볼 수 있다 — 서버가 관리자 비번을 보고 통과시킨다.
// ⚠️ 비번은 sessionStorage 에만 둔다(관리자 화면과 같은 열쇠). 성도님 화면에는 이 길이 없다.
// 관리자 미리보기 — **들어오는 길은 이 주소와 시험 참여자 명단 둘뿐이다.**
// ⚠️ 첫 화면에는 기간 밖에 아무것도 내놓지 않는다(성도님 결정 2026-09-10).
//    한때 「12월 13일부터」 줄을 눌러 들어가게 했다가, 성도님 전체에게 보이는 자리라
//    걷어냈다. 시험은 ?preview=ministry 로 한다.
//    2026-09-30: 교회 어드민 「🧪 시험 참여자」 명단에 오른 계정도 같은 문으로 들어온다
//    (그분 첫 화면에만 🤝 가 뜬다 · 서버도 명단을 보고 통과시킨다).
function minPrev() {
  return location.search.indexOf("preview=ministry") >= 0 || ministryTesterCached();
}
// ⚠️ **비번을 묻지 않는다.** 서버가 preview 깃발만으로 통과시키므로(2026-09-09),
//    물어 봤자 시험하시는 분들은 답을 모르고 그 자리에서 막힌다.
//    관리자 화면을 이미 연 탭이면 sessionStorage 에 들어 있어 그대로 함께 보낸다 —
//    신청 기간 전에 || b.preview 를 도로 막고 나면 그때는 이 값이 열쇠가 된다.
function minPw() {
  if (!minPrev()) return "";
  try { return sessionStorage.getItem("admin-pw") || ""; } catch (e) { return ""; }
}

// ⚠️ 팀 이름은 부서가 적어 보낸 값이라 반드시 escape 한다(app.js 에 공용 esc 가 없어 따로 둔다)
function minEsc(t) {
  return String(t == null ? "" : t)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// 필사 노트 신청과 같은 「단계 줄」. ⚠️ 미채택은 임명확정과 **나란한 끝**이지
// 그 앞 단계가 아니다 — 마지막 칸의 이름만 바꿔 끼운다.
const MIN_STEPS = ["신청완료", "접수완료", "임명확정"];
function minStepsHtml(cur) {
  const steps = (cur === "미채택" || cur === "취소")
    ? ["신청완료", "접수완료", cur]        // 임명확정과 나란한 끝이지 그 앞 단계가 아니다
    : MIN_STEPS;
  const i = steps.indexOf(cur);
  return '<div class="pl-steps">' + steps.map(function (t, k) {
    return '<div class="pl-step ' + (k < i ? "done" : k === i ? "now" : "") +
      ((cur === "미채택" || cur === "취소") && k === 2 && k === i ? " none" : "") +
      '"><i></i><span>' + minEsc(minStName(t)) + '</span></div>';
  }).join("") + '</div>';
}

// 화면에 쓰는 짧은 이름(2026-09-18 성도님) — 「신청완료→신청 · 접수완료→접수 · 임명확정→임명」.
// ⚠️ **값은 그대로 둔다.** "임명확정" 은 DB CHECK·서버 허용목록·관리자 화면이 함께 쓰는 값이라,
//    값을 바꾸려면 세 곳을 한꺼번에 고쳐야 한다(docs/notes 「허용 목록은 세 곳」). 보이는 말만 바꾼다.
const MIN_LABEL = { "신청완료": "신청", "접수완료": "접수", "임명확정": "임명" };
function minStName(st) { return MIN_LABEL[st] || st; }
const MIN_STATE = {
  "신청완료": { ic: "📝", cls: "s-wait", msg: "냈어요. 담당자가 접수하기 전까지는 고치실 수 있어요." },
  "접수완료": { ic: "📥", cls: "s-work", msg: "담당자가 접수했어요. 이제 고치실 수 없습니다." },
  "임명확정": { ic: "✅", cls: "s-done", msg: "임명이 확정됐어요. 첫 모임 안내를 기다려 주세요." },
  "미채택":   { ic: "🕊️", cls: "s-none", msg: "이번에는 다른 분이 임명되셨어요. 다음 기회에 함께해 주세요." },
  // ⚠️ 관리자가 부서장 요청을 받아 취소한 것이다. 성도님께는 **까닭을 적지 않는다** —
  //    사유는 관리자만 보기로 했고, 자세한 것은 부서에 여쭙는 편이 맞다.
  "취소":     { ic: "↩️", cls: "s-none", msg: "이 신청은 부서 요청으로 취소되었어요. 자세한 것은 해당 부서에 여쭤봐 주세요." },
};

async function minLoad(u) {
  if (!minApiReady()) { minLoaded = true; return; }
  try {
    const [cat, mine] = await Promise.all([api.ministryCatalog(), api.ministryMine(u.user_id)]);
    minCat = cat && cat.ok ? cat : null;
    minMine = mine && mine.mine ? mine.mine : null;
    minSyncPicked();
    minStep = minMine ? "done" : "pick";
  } catch (_) {
    minCat = null; minMine = null; minLockedIds = [];
  }
  minLoaded = true;
}

// 낸 것을 고르기 화면에 되살린다. ⚠️ 잠긴 팀은 minPicked 에 넣지 않는다 —
// 넣으면 성도가 그것을 눌러 뺄 수 있게 되고, 서버가 거절해 「왜 안 되지」가 된다.
function minSyncPicked() {
  const items = (minMine && minMine.items) || [];
  minLocked = items.filter(function (x) { return x.locked; })
    .map(function (x) { return { id: x.team_id, status: x.status }; });
  minLockedIds = minLocked.map(function (x) { return x.id; });
  minPicked = items.filter(function (x) { return !x.locked; })
    .map(function (x) { return x.team_id; });
  // ⚠️ 이 순간의 minPicked 가 「이미 낸 것」이다. 뒤에 성도님이 더 고르면 minPicked 는
  //    늘어나지만 minSentIds 는 그대로라, 둘을 견주어 딱지를 가른다.
  minSentIds = minPicked.slice();
}
function minLockStatus(id) {
  for (const x of minLocked) if (x.id === id) return x.status;
  return "접수완료";
}
// ⚠️ 「미채택」은 자리를 도로 내놓는다 — 안 그러면 떨어진 분이 다른 팀에 신청조차
//    못 하는 막다른 길이 된다. 서버도 같은 규칙으로 센다(countsToCap).
function minHeld() {
  // ⚠️ 서버의 countsToCap 과 **같은 규칙**이어야 한다 — 어긋나면 화면과 서버가 다른 수를 센다
  return minLocked.filter(function (x) {
    return x.status !== "미채택" && x.status !== "취소";
  }).length;
}
function minLeft() {
  return Math.max(0, MIN_MAX - minHeld() - minPicked.length);
}

function minTeam(id) {
  if (!minCat) return null;
  for (const t of minCat.list) if (t.id === id) return t;
  return null;
}
function minPeriodText() {
  const p = minCat && minCat.period;
  if (!p || !p.open) return "";
  const f = (s) => s.slice(5).replace("-", "월 ") + "일";
  return f(p.open) + " ~ " + f(p.close);
}
function minIsOpen() { return !!(minCat && minCat.period && minCat.period.isOpen); }

// 팀 한 줄에 붙는 작은 설명 — 시간·하는 일이 있으면 보여 주고, 없으면 이름만
// ⚠️ 이 셋은 **관리자만** 넣을 수 있고(ADMIN_SECRET), 서버가 꾸밈 태그만 남기고
//    거른 뒤에 내려준다. 그래서 여기서는 escape 하지 않고 그대로 그린다 —
//    escape 하면 <b> 가 글자로 보인다. 팀 이름 등 나머지는 전부 minEsc 를 거친다.
// 꾸밈 태그를 걷어 낸 맨 글자 — 줄여 쓸 때 길이를 재려면 태그가 없어야 한다
function minPlain(h) {
  return String(h == null ? "" : h)
    .replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\s+/g, " ").trim();
}

// 팀 단추에 붙는 **한 줄** — 「언제」가 먼저다(고를 때 가장 먼저 보는 것).
// ⚠️ 하는 일을 통째로 여기 넣지 않는다. 넣으면 팀마다 줄 높이가 제각각이 되어
//    88팀을 훑는 화면이 무너진다(2026-09-08 실측: 긴 설명 한 팀이 세 줄을 먹었다).
//    전체 내용은 「자세히」 창이 맡는다.
function minShortOf(t) {
  if (t.sched) return t.sched;                    // 서버가 걸러 둔 꾸밈만 남은 HTML
  if (t.desc) {
    const s = minPlain(t.desc);
    return minEsc(s.length > 38 ? s.slice(0, 38) + "…" : s);
  }
  return "";
}
// 「어와나 4개 중 하나만 신청」 같은 묶음에서 둘 이상 고른 것을 찾는다.
// ⚠️ **막지 않는다**(성도님 결정 2026-09-10) — 정말 둘 다 하실 분을 앱이 없애 버리고,
//    담당자가 조정할 여지도 사라진다. 보이게만 하고 결정은 성도님과 담당자에게 남긴다.
function minOverPicks() {
  const list = (minCat && minCat.list) || [];
  const by = {};
  for (const t of list) {
    if (!t.opt || !t.group) continue;
    if (minPicked.indexOf(t.id) < 0 && minLockedIds.indexOf(t.id) < 0) continue;
    const k = t.committee + "|" + t.group;
    (by[k] = by[k] || { opt: t.opt, group: t.group, teams: [] }).teams.push(t.team);
  }
  return Object.keys(by).map(function (k) { return by[k]; })
    .filter(function (g) { return g.teams.length > 1; });
}
function minOverHtml() {
  const over = minOverPicks();
  if (!over.length) return "";
  return over.map(function (g) {
    return '<div class="min-note min-over">⚠️ <b>' + minEsc(g.group) + '</b>은(는) ' +
      minEsc(g.opt) + '이에요. 지금 <b>' + g.teams.length + '개</b>를 고르셨습니다 — ' +
      minEsc(g.teams.join(", ")) + '.<br>그대로 내셔도 되지만, 담당자가 확인해 조정할 수 있어요.</div>';
  }).join("");
}

// 이미 낸 신청을 화면 위에 모아 보여 준다.
// ⚠️ **왜 있는가** — 2027 신청은 여러 번에 나눠 낼 수 있다(한 팀에 임명받은 뒤 다른 사역을
//    또 신청). 그때 신청서에 다시 들어오면 「내가 뭘 냈더라」가 먼저 궁금하다.
//    목록 아래에서 딱지를 찾아 훑지 않게 맨 위에 모아 둔다.
// ⚠️ 팀 명단(members)으로 「지금 섬기는 분」을 알아내려던 길은 버렸다 —
//    2026년 사역 자료가 없어 알아낼 수가 없고, 명단에는 관리자가 적은 분과 올해 접수자가
//    섞여 들어가 그걸 「내가 섬기던 자리」로 읽으면 없는 사실을 만들어 낸다.
function minSentListHtml() {
  const items = (minMine && minMine.items) || [];
  if (!items.length) return "";
  return '<div class="min-sent"><div class="min-sent-t">📋 신청건 : ' +
    '<b>' + items.length + '</b> 건</div>' +
    items.map(function (it) {
      const st = MIN_STATE[it.status] || MIN_STATE["신청완료"];
      return '<div class="min-sent-r">' +
        '<span class="min-sent-n">' + minEsc(it.team) +
        ' <span class="min-com">· ' + minEsc(it.committee) + '</span></span>' +
        '<span class="min-st ' + st.cls + '">' + st.ic + ' ' + minEsc(minStName(it.status)) + '</span></div>';
    }).join("") + '</div>';
}

// 신청서 맨 위 한 줄 — 무엇이 이미 정해졌는지 **상태마다 다른 말로**(2026-09-18 성도님).
// ⚠️ 「이미 결정된 3건」 한 문장으로 뭉치면, 임명을 받은 분도 접수만 된 분도 같은 말을 읽는다.
//    임명은 기쁜 소식이라 그 말부터 하고, 남은 자리는 0일 때 「남은 0자리만 고르시면」이 아니라
//    「더 고르실 자리는 없어요」로 말한다(0을 고르라는 말이 된다).
function minLockNoteHtml() {
  if (!minLocked.length) return "";
  const n = function (st) { return minLocked.filter(function (x) { return x.status === st; }).length; };
  const done = n("임명확정"), took = n("접수완료"), back = n("미채택") + n("취소");
  const left = Math.max(0, MIN_MAX - minHeld());
  let msg = "";
  if (done) msg += '<b>' + done + '개의 사역이 임명</b>되었습니다.';
  if (took) msg += (msg ? " " : "") + '담당자가 접수한 <b>' + took + '건</b>은 고치거나 뺄 수 없어요.';
  if (back) msg += (msg ? " " : "") + '<b>' + back + '건</b>은 취소되어 자리를 도로 내놓았어요.';
  msg += (msg ? " " : "") + (left
    ? '<b>남은 ' + left + '자리</b>를 더 고르실 수 있어요.'
    : '더 고르실 자리는 없어요.');
  return '<div class="min-note min-lock-note">' + (done ? "🎉" : "📥") + ' ' + msg + '</div>';
}
function minHasDetail(t) { return !!(t && (t.desc || t.capacity || t.sched || t.members || t.leader)); }
function minMoreBtn(t) {
  return minHasDetail(t)
    ? '<button class="min-more" data-more="' + t.id + '">보기 ›</button>' : "";
}

function renderMinistry(keepScroll) {
  const u = loadUser();
  if (!u) { renderEntryScreen(); return; }
  const appEl = document.getElementById("app");
  // 사역 신청 절차에서는 공용 「첫 화면으로」 큰 단추를 쓰지 않는다.
  // 각 화면 안의 「나가기」만 첫 화면으로 연결한다.
  const wireExit = function () {
    const b = document.getElementById("min-exit");
    if (b) b.onclick = renderSummary;
  };

  if (!minLoaded) {
    // ⚠️ 여기에도 단추를 둔다 — 통신이 멎으면 빠져나갈 길이 없어진다
    appEl.innerHTML = '<div class="min-screen">' + minTitleHtml("사역 신청서") +
      '<p class="msg">사역 목록을 불러오는 중…</p></div>';
    window.scrollTo(0, 0);
    minLoad(u).then(function () { renderMinistry(); });
    return;
  }
  if (!minCat) {
    appEl.innerHTML = '<div class="min-screen">' + minTitleHtml("사역 신청서") +
      '<p class="msg">사역 목록을 불러오지 못했어요.<br>잠시 뒤 다시 열어 주세요.</p>' +
      '<button class="min-ghost" id="min-exit">나가기</button></div>';
    wireExit();
    return;
  }

  const body = minStep === "done" ? minDoneHtml(u)
             : minStep === "confirm" ? minConfirmHtml()
             : minPickHtml();
  appEl.innerHTML = '<div class="min-screen">' + body + '</div>';
  window.scrollTo(0, keepScroll == null ? 0 : keepScroll);
  wireExit();
  if (minStep === "pick") wireMinPick(u);
  else if (minStep === "confirm") wireMinConfirm(u);
  else wireMinDone(u);
}

// 사역신청 화면 다섯 곳(불러오는 중·오류·신청서·확인·신청현황)의 타이틀을
// 한 자리에서 만든다 — 아이콘 배지·얼라인·글씨 크기가 화면마다 달라 보이던 것을
// 고치며(성도님 지적), 다음에 화면을 늘려도 여기만 건드리면 다 같이 맞는다.
function minTitleHtml(title, subtitleHtml) {
  return '<div class="min-intro"><h2 class="rank-title">' + title + '</h2>' +
    (subtitleHtml || "") + '</div>';
}

// ── 사역 이력 확인 · 순수 ── (tests/ministry-history.test.cjs 가 이 표식부터 「순수 끝」 표식까지 떼어 vm 에서 돌린다)
// 설계: docs/superpowers/specs/2026-10-01-ministry-history-check-design.md §4 · 2026-10-01
// ⚠️ 여기서는 DOM·전역 상태를 건드리지 않는다(minEsc 만 빌려 쓴다 — 시험이 그 함수도 함께 떼어 온다).
// ⚠️ kind·status 글자는 교회 어드민 history-check.ts·SQL 008 CHECK 와 같다(세 곳) — 보이는 말을 바꾸려면 MH_KIND_TEXT 만.
// ⚠️ 직분은 정정하지 않는다 — 교적 기준(2026-10-01 친구 결정). 줄에도 직분을 보이지 않는다(2026-10-01 친구 요청 · 연도·부서·팀·직책만).
// ⚠️ 「팀·부서가 틀려요」(wrong_team)는 고르기에서 뺐다(2026-10-01 친구 요청) — 이미 낸 신청 표시용으로 MH_KIND_TEXT·서버·SQL 008 CHECK 에는 남긴다.
const MH_LINE_KINDS = [
  { k: "not_mine", t: "내 것이 아니에요" },
  { k: "other", t: "그 밖에" },
];
const MH_KIND_TEXT = {
  not_mine: "내 것이 아니에요", wrong_team: "팀·부서가 틀려요",
  other: "그 밖에", missing: "빠진 사역", find_me: "내 기록 찾아 주세요",
};
const MH_OPEN = ["신청", "확인 중"];
const MH_DETAIL_MAX = 200, MH_TEAM_MAX = 100, MH_OPEN_MAX = 20;
const MH_YEAR_MIN = 2000, MH_MISSING_ROWS = 3;   // 빠진 사역 — 연도 2000~올해 · 한 창에 같은 해 3개까지(2026-10-19 친구)
const MH_ERR = {
  closed: "아직 열리지 않았어요.",
  "no-user": "로그인 정보를 찾지 못했어요. 첫 화면에서 다시 로그인해 주세요.",
  "already-open": "이미 정정 신청을 내셨어요. 담당자가 확인하고 있어요.",
  "too-many": "확인을 기다리는 신청이 20건이에요. 담당자가 확인한 뒤 다시 내 주세요.",
  "need-detail": "어떤 점이 틀렸는지 한 줄로 적어 주세요.",
  "need-team": "부서나 팀 이름을 적어 주세요.",
  "bad-year": "연도는 2000년부터 올해까지 적을 수 있어요(예: 2024).",
  "too-long": "글이 너무 길어요. 조금 줄여 주세요.",
  "not-yours": "이 기록은 지금 고칠 수 없어요. 화면을 다시 열어 주세요.",
  "not-found": "기록을 찾지 못해 이 신청은 낼 수 없어요.",
  "already-found": "기록을 이미 찾았어요. 줄마다 「정정」을 눌러 주세요.",
};
function mhErrText(code) { return MH_ERR[code] || "잠시 뒤 다시 해 주세요."; }

// 머리줄 「기쁨-12 홍길동」 — 목장 99(모름)는 교구만, 교회학교는 부서·학년
function mhWhoText(w) {
  if (!w) return "";
  const aff = w.type === "교회학교"
    ? [w.bu, w.grade].filter(Boolean).join(" ")
    : (w.mok && w.mok !== "99" ? w.gu + "-" + w.mok : (w.gu || ""));
  return (aff ? aff + " " : "") + (w.name || "");
}
function mhSubHtml(w) { return '<p class="min-sub">' + minEsc(mhWhoText(w)) + ' 성도님의 사역 기록</p>'; }

// 단계 줄 — 사역신청 minStepsHtml 과 같은 모양(.pl-steps). 「반영 안 함」은 반영과 나란한 끝이다(끝 칸만 바뀐다).
function mhStepsHtml(st) {
  const steps = st === "반영 안 함" ? ["신청", "확인 중", "반영 안 함"] : ["신청", "확인 중", "반영"];
  const i = steps.indexOf(st);
  return '<div class="pl-steps mh-steps">' + steps.map(function (t, k) {
    return '<div class="pl-step ' + (k < i ? "done" : k === i ? "now" : "") + '"><i></i><span>' + minEsc(t) + '</span></div>';
  }).join("") + '</div>';
}

function mhOpenIds(requests) {
  const s = {};
  (requests || []).forEach(function (r) { if (r.history_id != null && MH_OPEN.indexOf(r.status) >= 0) s[r.history_id] = true; });
  return s;
}
function mhOpenCount(requests) {
  return (requests || []).filter(function (r) { return MH_OPEN.indexOf(r.status) >= 0; }).length;
}
function mhHasOpenFind(requests) {
  return (requests || []).some(function (r) { return r.kind === "find_me" && MH_OPEN.indexOf(r.status) >= 0; });
}

// 기록 줄 — 해마다 묶는다(서버가 연도 내림차순으로 준다). 줄 하나 = 부서 · 팀 직책 · 직분 + [정정]
// ⚠️ 줄 열쇠는 기록 id 숫자뿐이다(교인ID·이름을 data-* 에 싣지 않는다).
function mhHistoryHtml(rows, requests) {
  if (!rows || !rows.length) return '<p class="mh-empty">아직 올라온 사역 기록이 없어요.</p>';
  const open = mhOpenIds(requests);
  let out = "", year = null;
  rows.forEach(function (r) {
    if (r.year !== year) {
      if (year !== null) out += '</div>';
      year = r.year;
      out += '<div class="mh-year"><div class="mh-year-t">' + minEsc(r.year) + '</div>';
    }
    const what = [r.committee, [r.team, r.role_title].filter(Boolean).join(" ")]
      .filter(function (x) { return x && String(x).trim(); }).map(minEsc).join(' <span class="mh-dot">·</span> ');
    out += '<div class="mh-row"><span class="mh-what">' + what + '</span>' +
      (open[r.id]
        ? '<span class="min-st s-wait mh-tag">신청함</span>'
        : '<button class="mh-fix" data-fix="' + Number(r.id) + '">정정</button>') + '</div>';
  });
  return out + '</div>';
}

// 기록 줄 이름 「2025 시온성가대」 — 빼 둔 줄이라 목록에 없으면 「지난 기록」
function mhRowLabel(row) {
  return row ? row.year + " " + ([row.team, row.committee].filter(Boolean)[0] || "") : "지난 기록";
}

// 빠진 사역 신청의 부서·팀 글 — 교회 어드민 requests-logic.js requestTeamText(담당자 화면)와 같은 규칙(2026-10-02 두 칸).
//   committee_text 가 글자면 두 칸 신청 → 「부서 · 팀」(빈 칸은 뺀다) · null 이거나 칸이 없으면(옛 한 칸 신청 · 옛 api) team_text 그대로.
function mhMissingText(q) {
  return q.committee_text != null
    ? [q.committee_text, q.team_text].filter(Boolean).join(" · ")
    : (q.team_text || "");
}

// 내 정정 신청 — 최근 것이 위(서버 차례 그대로). 담당자가 적은 말이 있으면 아래 한 줄(반영 안 함의 사유 등)
function mhRequestsHtml(requests, rows) {
  if (!requests || !requests.length) return "";
  const byId = {};
  (rows || []).forEach(function (r) { byId[r.id] = r; });
  return '<div class="min-sent mh-reqs"><div class="min-sent-t">📋 내 정정 신청 <b>' + requests.length + '</b>건</div>' +
    requests.map(function (q) {
      const head = q.kind === "missing" ? "빠진 사역(" + q.year + ") — " + mhMissingText(q)
        : q.kind === "find_me" ? MH_KIND_TEXT.find_me
        : mhRowLabel(q.history_id != null ? byId[q.history_id] : null) + " — " + (MH_KIND_TEXT[q.kind] || "");
      return '<div class="mh-req"><div class="mh-req-h">' + minEsc(head) + '</div>' +
        (q.detail ? '<div class="mh-req-d">' + minEsc(q.detail) + '</div>' : "") +
        mhStepsHtml(q.status) +
        (q.answer ? '<div class="mh-ans">💬 ' + minEsc(q.answer) + '</div>' : "") + '</div>';
    }).join("") + '</div>';
}

// 제목 아래 본문 전부 — d = ministryHistoryMine 응답 { found, rows, requests }
function mhBodyHtml(d) {
  const exit = '<button class="min-ghost" id="mh-exit">나가기</button>';
  if (!d.found) {
    return '<div class="min-note mh-none">교적의 교구·목장·이름과 맞는 기록을 찾지 못했어요.<br>' +
      '그사이 목장이 바뀌셨거나 같은 이름이 계시면 그럴 수 있어요. 아래를 누르시면 담당자가 찾아 드려요.</div>' +
      (mhHasOpenFind(d.requests) ? "" : '<button class="min-cta" id="mh-find">내 기록 찾아 주세요</button>') +
      mhRequestsHtml(d.requests, []) + exit;
  }
  return mhHistoryHtml(d.rows, d.requests) +
    '<button class="min-ghost mh-add" id="mh-missing">＋ 빠진 사역 추가하기</button>' +
    mhRequestsHtml(d.requests, d.rows) + exit;
}

// 정정 창 「빠진 사역」 칸 — 연도 · 부서 · 팀(2026-10-02 친구 요청 「네 두칸으로 해주세요」 · 그전에는 「부서 · 팀」 한 칸).
//   부서는 committee_text, 팀은 team_text 로 보낸다(mhAsk). 둘 중 하나만 적어도 된다(mhCheck).
// 사역 한 묶음 = 상자 하나(2026-10-19 친구 「사역으로 묶어서 쉽게 볼 수 있게」) — 첫 상자도 「사역 1」 · 빼기(✕)는 둘째부터
function mhMissingRowHtml(i) {
  return '<div class="mh-set" data-set="' + i + '">' +
    '<div class="mh-set-h"><span class="mh-l mh-set-t">사역 ' + (i + 1) + '</span>' +
      (i > 0 ? '<button type="button" class="mh-set-x" data-del aria-label="사역 ' + (i + 1) + ' 빼기">✕</button>' : "") + '</div>' +
    '<label class="mh-l" for="mh-committee-' + i + '">부서</label>' +
    '<input class="min-alert-input mh-in" id="mh-committee-' + i + '" maxlength="' + MH_TEAM_MAX + '" placeholder="예) 찬양위원회" autocomplete="off">' +
    '<label class="mh-l" for="mh-team-' + i + '">팀</label>' +
    '<input class="min-alert-input mh-in" id="mh-team-' + i + '" maxlength="' + MH_TEAM_MAX + '" placeholder="예) 시온성가대" autocomplete="off">' +
    '</div>';
}
// 연도는 한 번 · 부서·팀 묶음은 MH_MISSING_ROWS 개까지(2026-10-19 친구 「한 창에서 같은 해 3개까지」)
//   연도 칸 아래 안내 한 줄 — 받는 해(2000~올해 · mhCheck 와 같은 규칙)를 미리 보인다(2026-10-19 친구)
function mhMissingFieldsHtml(thisYear) {
  if (thisYear == null) thisYear = new Date().getFullYear();
  return '<label class="mh-l" for="mh-year">연도</label>' +
    '<input class="min-alert-input mh-in" id="mh-year" inputmode="numeric" maxlength="4" placeholder="예) 2024" autocomplete="off" aria-describedby="mh-year-hint">' +
    '<p class="mh-hint" id="mh-year-hint">' + MH_YEAR_MIN + '년부터 올해(' + thisYear + '년)까지 적을 수 있어요.</p>' +
    '<div id="mh-sets">' + mhMissingRowHtml(0) + '</div>' +
    '<button type="button" class="min-ghost mh-more" id="mh-more">＋ 같은 해 사역 하나 더</button>';
}

// 서버 tidy 와 같다(NFC · 공백 덩어리는 한 칸 · 앞뒤 공백 뺌) — 두 칸 글자 수를 서버처럼 센다
function mhTidy(s) { return String(s == null ? "" : s).normalize("NFC").replace(/\s+/g, " ").trim(); }

// 보내기 전 검사 — 교회 어드민 parseRequest 와 같은 규칙(정하는 것은 서버다 · 여기는 미리 알릴 뿐)
//   빠진 사역: committee_text 가 글자면 두 칸(부서나 팀 하나는 꼭 · 칸마다 100자) · 아니면 옛 한 칸(team_text 꼭)
function mhCheck(f, thisYear) {
  if (thisYear == null) thisYear = new Date().getFullYear();
  const detail = String(f.detail || "").trim();
  if (detail.length > MH_DETAIL_MAX) return "too-long";
  if (f.kind === "other" && !detail) return "need-detail";
  if (f.kind === "missing") {
    const y = Number(String(f.year || "").trim());
    if (!Number.isInteger(y) || y < MH_YEAR_MIN || y > thisYear) return "bad-year";
    if (typeof f.committee_text === "string") {
      const c = mhTidy(f.committee_text), t = mhTidy(f.team_text);
      if (!c && !t) return "need-team";
      if (c.length > MH_TEAM_MAX || t.length > MH_TEAM_MAX) return "too-long";
      return null;
    }
    const t = String(f.team_text || "").trim();
    if (!t) return "need-team";
    if (t.length > MH_TEAM_MAX) return "too-long";
  }
  return null;
}
// ── 사역 이력 확인 · 순수 끝 ──

// ── 사역 이력 확인 · 화면 (2026-10-01) ──
// ⚠️ 첫 화면 「사역현황」에서만 들어온다. 문은 서버가 다시 본다(closed → 「아직 열리지 않았어요」).
// ⚠️ api.* 는 error 가 있으면 throw 한다 — 오류 글자는 e.message 다.
let mhLoaded = false, mhData = null, mhErrCode = "";

async function mhLoad(u) {
  let data = null, err = "";
  if (!window.api || !api.ministryHistoryMine) err = "old";   // 옛 js/api.js
  else {
    try { data = await api.ministryHistoryMine(u.user_id, minPw()); }
    catch (e) { err = (e && e.message) || "net"; }
  }
  mhData = data; mhErrCode = err; mhLoaded = true;   // ⚠️ 한 번에 바꾼다 — 기다리는 동안 옛 화면의 [정정]이 null 을 만나지 않게
}

function renderMinistryHistory(keepScroll) {
  const u = loadUser();
  if (!u) { renderEntryScreen(); return; }
  const appEl = document.getElementById("app");
  const wireExit = function () { const b = document.getElementById("mh-exit"); if (b) b.onclick = renderSummary; };
  if (!mhLoaded) {
    // ⚠️ 여기에도 나가기를 둔다 — 통신이 멎으면 빠져나갈 길이 없어진다
    appEl.innerHTML = '<div class="min-screen">' + minTitleHtml("사역 이력 확인") +
      '<p class="msg" id="mh-loading">기록을 불러오는 중…</p><button class="min-ghost" id="mh-exit">나가기</button></div>';
    window.scrollTo(0, 0);
    wireExit();
    // 그사이 나가셨으면 다시 그리지 않는다(첫 화면을 덮지 않게)
    mhLoad(u).then(function () { if (document.getElementById("mh-loading")) renderMinistryHistory(); });
    return;
  }
  if (!mhData) {
    const msg = mhErrCode === "closed" ? mhErrText("closed")
      : mhErrCode === "no-user" ? mhErrText("no-user")
      : "기록을 불러오지 못했어요.<br>잠시 뒤 다시 열어 주세요.";
    appEl.innerHTML = '<div class="min-screen">' + minTitleHtml("사역 이력 확인") +
      '<p class="msg">' + msg + '</p><button class="min-ghost" id="mh-exit">나가기</button></div>';
    window.scrollTo(0, 0);
    wireExit();
    return;
  }
  appEl.innerHTML = '<div class="min-screen mh-screen">' + minTitleHtml("사역 이력 확인", mhSubHtml(mhData.who)) +
    mhBodyHtml(mhData) + '</div>';
  window.scrollTo(0, keepScroll == null ? 0 : keepScroll);
  wireExit();
  wireMinistryHistory(u);
}

function wireMinistryHistory(u) {
  const byId = {};
  (mhData.rows || []).forEach(function (r) { byId[r.id] = r; });
  document.querySelectorAll("#app [data-fix]").forEach(function (b) {
    b.addEventListener("click", function () {
      const row = byId[Number(b.dataset.fix)];
      if (row) mhAsk(u, row, "line");
    });
  });
  const add = document.getElementById("mh-missing");
  if (add) add.addEventListener("click", function () { mhAsk(u, null, "missing"); });
  const find = document.getElementById("mh-find");
  if (find) find.addEventListener("click", function () { mhAsk(u, null, "find_me"); });
}

// 정정 창 — 고르기(줄 정정) + 한 줄 설명(+ 빠진 사역은 연도·부서·팀 세 칸 — mhMissingFieldsHtml). 사역신청 창(.min-d-*)과 같은 모양.
// ⚠️ 브라우저 alert·prompt 를 쓰지 않는다. 오류는 창 안 한 줄(.mh-err)로 — 창 위에 창을 띄우지 않는다.
function mhAsk(u, row, mode) {
  if (!mhData) return;
  if (mode !== "find_me" && mhOpenCount(mhData.requests) >= MH_OPEN_MAX) { minAlert(mhErrText("too-many")); return; }
  const head = mode === "missing" ? "빠진 사역 추가하기"
    : mode === "find_me" ? "내 기록 찾아 주세요"
    : minEsc(row.year + " · " + [row.committee, [row.team, row.role_title].filter(Boolean).join(" ")].filter(Boolean).join(" · "));
  let kind = mode === "line" ? "" : mode;
  const box = document.createElement("div");
  box.className = "min-d-wrap";
  box.innerHTML = '<div class="min-d-box" role="dialog" aria-modal="true">' +
    '<div class="min-d-head"><div><div class="min-d-nm">' + head + '</div>' +
      '<div class="min-d-com">' + (mode === "line" ? "무엇이 틀렸나요?" : "담당자가 확인한 뒤 바로잡아 드려요") + '</div></div></div>' +
    '<div class="min-d-body">' +
      (mode === "line" ? '<div class="mh-kinds">' + MH_LINE_KINDS.map(function (x) {
        return '<button type="button" class="mh-kind" aria-pressed="false" data-kind="' + x.k + '">' + minEsc(x.t) + '</button>';
      }).join("") + '</div>' : "") +
      (mode === "missing" ? mhMissingFieldsHtml() : "") +
      '<label class="mh-l" for="mh-detail">한 줄 설명 <span class="mh-opt">' +
        (mode === "line" ? "(「그 밖에」는 꼭 적어 주세요)" : "(적지 않으셔도 돼요)") + '</span></label>' +
      '<textarea class="mh-ta" id="mh-detail" rows="3" maxlength="' + MH_DETAIL_MAX + '" placeholder="예) 그해에는 알토로 섬겼어요"></textarea>' +
      '<span class="min-alert-sub">건강·가정 형편 같은 사적인 사정은 적지 말아 주세요 — 같은 이름·소속으로 들어오면 보일 수 있어요.</span>' +
      '<p class="mh-err" id="mh-err" hidden></p>' +
    '</div>' +
    '<div class="min-d-foot min-d-foot-row"><button class="min-ghost" data-cancel>취소</button>' +
      '<button class="min-cta" data-ok' + (mode === "line" ? " disabled" : "") + '>신청</button></div></div>';
  document.body.appendChild(box);
  const ok = box.querySelector("[data-ok]");
  const errEl = box.querySelector("#mh-err");
  const showErr = function (code) {
    errEl.textContent = mhErrText(code); errEl.hidden = false;
    // 부서 칸이 생기며 .mh-err 가 스크롤 아래로 밀려 안 보일 수 있다(아이폰 SE·안드로이드 큰 글씨 실측) — 보이는 곳으로 끌어온다
    try { errEl.scrollIntoView({ block: "nearest" }); } catch (e) {}
  };
  function close() {
    document.removeEventListener("keydown", esc);
    if (box.parentNode) box.parentNode.removeChild(box);
  }
  const esc = function (e) { if (e.key === "Escape") { e.preventDefault(); close(); } };
  document.addEventListener("keydown", esc);
  box.addEventListener("click", function (e) { if (e.target === box) close(); });
  box.querySelector("[data-cancel]").addEventListener("click", close);
  box.querySelectorAll(".mh-kind").forEach(function (b) {
    b.addEventListener("click", function () {
      kind = b.dataset.kind;
      box.querySelectorAll(".mh-kind").forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
      ok.disabled = false;
    });
  });
  // 빠진 사역 — 부서·팀 묶음 더하기·빼기(최대 MH_MISSING_ROWS)
  const setsEl = box.querySelector("#mh-sets"), moreBtn = box.querySelector("#mh-more");
  const setCount = function () { return setsEl ? setsEl.querySelectorAll(".mh-set").length : 0; };
  const syncSets = function () {
    if (!setsEl) return;
    setsEl.querySelectorAll(".mh-set").forEach(function (el, i) {
      const t = el.querySelector(".mh-set-t"), x = el.querySelector("[data-del]");
      if (t) t.textContent = "사역 " + (i + 1);
      if (x) x.setAttribute("aria-label", "사역 " + (i + 1) + " 빼기");
    });
    moreBtn.hidden = setCount() >= MH_MISSING_ROWS;
  };
  if (moreBtn) {
    moreBtn.addEventListener("click", function () {
      if (setCount() >= MH_MISSING_ROWS) return;
      // 칸 id 는 번호가 겹치지 않게 지금 있는 것의 다음 번호를 쓴다(중간을 빼도 id 가 겹치지 않는다)
      let n = 0;
      setsEl.querySelectorAll(".mh-set").forEach(function (el) { n = Math.max(n, Number(el.dataset.set) + 1); });
      setsEl.insertAdjacentHTML("beforeend", mhMissingRowHtml(n));
      syncSets();
      const c = box.querySelector("#mh-committee-" + n); if (c) c.focus();
    });
    setsEl.addEventListener("click", function (e) {
      const x = e.target.closest ? e.target.closest("[data-del]") : null;
      if (!x) return;
      const set = x.closest(".mh-set"); if (set) set.remove();
      syncSets();
    });
  }
  ok.addEventListener("click", async function () {
    const base = {
      kind: kind, history_id: row ? row.id : null,
      detail: box.querySelector("#mh-detail").value,
      year: mode === "missing" ? box.querySelector("#mh-year").value : null,
      team_text: "",
    };
    let list = [base];
    if (mode === "missing") {
      // 두 칸(2026-10-02) — 빠진 사역일 때만 부서를 싣는다(다른 종류는 칸 자체를 보내지 않는다 · api 는 글자일 때만 넘긴다)
      list = [];
      box.querySelectorAll(".mh-set").forEach(function (el, i) {
        const c = el.querySelector("[id^=mh-committee-]").value, t = el.querySelector("[id^=mh-team-]").value;
        if (i > 0 && !c.trim() && !t.trim()) return;   // 둘째부터 둘 다 빈 묶음은 버린다(첫 묶음은 비면 need-team)
        list.push(Object.assign({}, base, { committee_text: c, team_text: t }));
      });
    }
    for (let i = 0; i < list.length; i++) {
      const bad = mhCheck(list[i]);
      if (bad) { showErr(bad); return; }
    }
    if (mode === "missing") {
      const open = mhOpenCount(mhData.requests);
      if (open + list.length > MH_OPEN_MAX) {
        errEl.textContent = "확인을 기다리는 신청이 " + open + "건이라 " + Math.max(0, MH_OPEN_MAX - open) + "건만 더 낼 수 있어요.";
        errEl.hidden = false;
        try { errEl.scrollIntoView({ block: "nearest" }); } catch (e) {}
        return;
      }
    }
    ok.disabled = true;
    let done = 0, failCode = "";
    for (let i = 0; i < list.length; i++) {
      try {
        await api.ministryHistoryRequest(u.user_id, list[i], minPw());
        done++;
      } catch (e) {
        failCode = (e && e.message) || "";
        if (i === 0) { ok.disabled = false; showErr(failCode); return; }   // 첫 건 실패 — 아무것도 안 들어갔다
        break;
      }
    }
    close();
    const y = window.scrollY;
    await mhLoad(u);
    // 둘째부터 막혔으면 화면을 떠나셨어도 알린다 — 무엇이 들어갔는지 이름으로(다시 낼 때 들어간 것을 또 내지 않게)
    const partial = done < list.length;
    const named = function (f) { return [mhTidy(f.committee_text), mhTidy(f.team_text)].filter(Boolean).join(" "); };
    const partialMsg = partial ? done + "건을 냈어요(" + list.slice(0, done).map(named).join(", ") + ").\n나머지 " +
      (list.length - done) + "건(" + list.slice(done).map(named).join(", ") + ")은 내지 못했어요 — " + mhErrText(failCode) + "\n다시 내 주세요." : "";
    // 그사이 나가셨으면 다시 그리지 않는다(첫 화면을 덮지 않게 — 불러오는 중 갈래의 mh-loading 지킴이와 같은 까닭). 신청은 이미 들어갔다.
    if (!document.querySelector("#app .mh-screen")) { if (partial) minAlert(partialMsg); return; }
    renderMinistryHistory(y);
    if (partial) {
      minAlert(partialMsg);
    } else {
      minAlert((done > 1 ? "정정 신청 " + done + "건을 냈어요." : "정정 신청을 냈어요.") + "\n담당자가 확인한 뒤 바로잡아 드려요.");
    }
  });
}

// 칩 한 줄. ⚠️ 새 색을 만들지 않는다 — 켜진 칩만 남색, 꺼진 칩은 흰 바탕.
// 남색 채움(지금 할 일)·금색(도전)은 건드리지 않는다.
function minChipRow(label, axis, items) {
  const on = minF[axis];
  return '<div class="min-fr"><span class="min-fr-l">' + label + '</span><span class="min-fr-c">' +
    items.map(function (it) {
      const k = it.k || it, t = it.t || it;
      const lit = on.indexOf(k) >= 0;
      // ⚠️ 켜진 칩에 ✕ 를 붙인다. 색만 바꿔 두면 「눌러서 끄는 것」인 줄 모르신다
      //    (성도님 제보 2026-09-10 — 「빼려면 어떻게 하나요」).
      return '<button class="min-chip' + (lit ? " on" : "") +
        '" data-f="' + axis + '" data-k="' + minEsc(k) + '"' +
        ' aria-pressed="' + lit + '"' +
        ' aria-label="' + minEsc(t) + (lit ? " 조건 빼기" : " 조건 넣기") + '">' +
        minEsc(t) + (lit ? '<span class="min-chip-x">✕</span>' : "") + '</button>';
    }).join("") + '</span></div>';
}
function minFilterHtml() {
  // ⚠️ 회신이 덜 왔는데 필터를 내놓으면 켜 봐야 안 걸러져 「고장 났다」가 된다.
  //    절반이 안 차면 줄 자체를 그리지 않는다.
  const list = (minCat && minCat.list) || [];
  const apply = list.filter(function (t) { return !t.appoint; });
  const filled = apply.filter(function (t) {
    const d = t.day || {}, f = t.freq || {};
    // ⚠️ freq 는 이제 **객체**다(참·거짓 넷). 예전처럼 `|| t.freq` 로 두면 빈 객체도
    //    참이라 **늘 채워진 것으로 세어** 이 안전장치가 통째로 무력해진다.
    return d.sun || d.fri || d.sat || d.week || t.from ||
      f.weekly || f.biweekly || f.monthly || f.adhoc;
  }).length;
  // ⚠️ 이 장치는 **성도님을 지키려는 것**이지 만드는 사람을 막으려는 게 아니다.
  //    ?preview=ministry 로 여는 관리자는 값이 없어도 필터를 볼 수 있어야 한다.
  if (!minPrev() && (!apply.length || filled * 2 < apply.length)) return "";

  // details 자체의 접기 기능을 쓴다 — 별도 열림/닫힘 상태나 필터 로직을 만들지 않는다.
  // 처음에는 한 줄만 보이고, 조건을 사용 중이면 현재 조건을 확인하도록 열린 채 그린다.
  return '<details class="min-filter"' + (minFOn() ? " open" : "") + '>' +
    '<summary class="min-filter-h">' +
      '<span class="min-filter-ico" aria-hidden="true">⌕</span>' +
      '<span class="min-filter-copy"><b>조건으로 빠르게 찾기</b>' +
        '<small>이름·요일·시간으로 사역을 좁혀 보세요</small></span>' +
      '<span class="min-filter-arr" aria-hidden="true"></span>' +
    '</summary>' +
    '<div class="min-filter-b">' +
      '<div class="min-fr min-fr-search"><span class="min-fr-l">사역 이름</span>' +
        '<input id="min-q" class="min-q" type="search" placeholder="예: 오병이어, 주차"' +
        ' value="' + minEsc(minQ) + '" autocomplete="off"></div>' +
      minChipRow("언제", "day", MIN_DAYS) +
      minChipRow("얼마나 자주", "freq", MIN_FREQS) +
      minChipRow("몇 시쯤", "band", MIN_BANDS) +
      '<button class="min-fclear" id="min-fclear"' + (minFOn() ? "" : " hidden") +
        '>✕ 조건 지우기</button>' +
    '</div></details>';
}

/* ── ① 부서 고르기 ─────────────────────────────────────────── */
// 목록만 만든다 — 다시 그릴 때 필터 상자를 건드리지 않으려고 떼어 두었다.
function minAccBuild() {
  const committees = [];
  for (const t of minCat.list) if (committees.indexOf(t.committee) < 0) committees.push(t.committee);

  // 먼저 몇 팀이 남는지 세어 둔다 — 그 수로 「펼칠지」를 정한다
  const shownAll = minFOn()
    ? minCat.list.filter(function (t) { return minShown(t); }).length
    : minCat.list.length;

  let acc = "";
  let shownN = 0;
  for (const c of committees) {
    const all = minCat.list.filter(function (t) { return t.committee === c; });
    // ⚠️ 고른 것은 필터를 타지 않는다(minShown) — 숨기면 뺄 수가 없어진다
    const mine = minFOn() ? all.filter(minShown) : all;
    if (!mine.length) continue;                    // 하나도 안 걸린 위원회는 통째로 뺀다
    shownN += mine.length;
    const got = mine.filter(function (t) {
      return minPicked.indexOf(t.id) >= 0 || minLockedIds.indexOf(t.id) >= 0;
    }).length;
    // ⚠️ 걸러 놓고도 접어 두면 「12팀 보임」이라 써 놓고 화면엔 위원회 줄만 남아
    //    「12팀이 어디 있지?」가 된다. 「한 번에 하나만」은 88팀이 길어서 둔 규칙이라,
    //    걸러서 짧아졌으면 그 이유가 사라진다. 20팀 이하로 줄면 전부 펼친다.
    const open = (minFOn() && shownAll <= 20) || minOpen === c;
    acc += '<div class="min-acc' + (open ? " open" : "") + '">' +
      '<button class="min-acc-h" data-acc="' + minEsc(c) + '" aria-expanded="' + open + '">' +
        '<span>' + minEsc(c) + (got ? ' <span class="min-got">' + got + '개 선택</span>' : "") + '</span>' +
        '<span class="min-n">' +
        (minFOn() && mine.length < all.length
          ? all.length + '팀 중 <b>' + mine.length + '팀</b>'
          : mine.length + '팀') +
        ' ' + (open ? "▴" : "▾") + '</span></button>';
    if (open) {
      acc += '<div class="min-acc-b">';
      let lastGrp = null;                                // null = 아직 아무 묶음도 안 열림
      for (const t of mine) {
        if (t.group !== lastGrp) {
          if (lastGrp !== null) acc += '</div>';          // 앞 묶음을 닫는다
          if (t.group) {
            // ⚠️ 그룹 이름과 안내문을 가운뎃점으로 잇지 않는다 — 「사랑부·어와나 ·
            //    어와나 4개 중 하나만 신청」처럼 한 문장으로 읽힌다(성도님 지적).
            //    이름은 제목, 안내는 그 아래 딱지로 층을 갈라 놓는다.
            acc += '<div class="min-grp"><div class="min-grp-h">' + minEsc(t.group) + '</div>' +
              (t.opt ? '<div class="min-grp-opt">' + minEsc(t.opt) + '</div>' : "") + '</div>';
            acc += '<div class="min-grp-b">';             // 이 묶음에 드는 팀들
          } else {
            acc += '<div class="min-grp-b none">';        // 묶음 없는 팀들
          }
        }
        lastGrp = t.group;
        const lock = minLockedIds.indexOf(t.id) >= 0;      // 이미 접수돼 뺄 수 없다
        const on = lock || minPicked.indexOf(t.id) >= 0;
        const meta = minShortOf(t);
        // ⚠️ 「자세히」는 고르기 단추 **안**에 넣을 수 없다(단추 안 단추는 안 된다).
        //    그래서 줄 전체를 감싸는 상자를 두고 형제로 나란히 놓는다.
        acc += '<div class="min-row' + (on ? " on" : "") + (t.appoint ? " off" : "") +
          (lock ? " lock" : "") + '">' +
          '<button class="min-team"' +
          // ⚠️ 잠긴 줄도 누를 수 있게 둔다(2026-09-18 성도님) — disabled 면 눌러도 아무 일이 없어
          //    「왜 안 빠지지」가 된다. 누르면 minTogglePick 이 까닭을 알리고 체크는 그대로 남는다.
          //    임명직도 같다(2026-10-02 친구) — 누르면 「임명직입니다 · 부서에 여쭤 주세요」.
          ' data-team="' + t.id + '">' +
          '<span class="min-info"><span class="min-nm">' + minEsc(t.team) +
          (t.appoint ? '<span class="min-tag appoint">임명직</span>' : "") +
          (lock ? '<span class="min-tag lock">' + minEsc(minStName(minLockStatus(t.id))) + '</span>'
            // ⚠️ 이미 낸 것과 방금 고른 것을 갈라 준다 — 둘 다 금색 체크뿐이면
            //    다시 들어온 성도님이 「낸 건가, 고르기만 한 건가」를 알 수 없다.
            : minSentIds.indexOf(t.id) >= 0 ? '<span class="min-tag sent">신청완료</span>'
            : "") + '</span>' +
          (meta ? '<span class="min-meta">' + meta + '</span>' : "") + '</span>' +
          '<span class="min-chk">' + (on ? "✓" : "") + '</span></button>' +
          minMoreBtn(t) + '</div>';
      }
      if (lastGrp !== null) acc += '</div>';            // 마지막 묶음 닫기
      acc += '</div>';
    }
    acc += '</div>';
  }
  return {
    shownN: shownN,
    html: acc
      ? acc
      // ⚠️ 「조건을 바꿔 보세요」는 도움이 안 된다 — 바꿀 후보를 짚어 드려야 한다
      : '<div class="min-none">고르신 조건에 맞는 사역이 없어요' + minFHintHtml() + '</div>',
  };
}

function minPickHtml() {
  const L = minAccBuild();
  const openNow = minIsOpen();
  return minTitleHtml("사역 신청서",
      '<p class="min-sub min-verse">“각각 은사를 받은 대로 … 선한 청지기 같이 서로 봉사하라”' +
        ' <span class="min-ref">벧전 4:10</span></p>') +
    // ⚠️ 안내문(.min-policy)을 화면에 늘 펴 두지 않는다(성도님 요청) — 소속 옆
    //    작은 단추로 접어 팝업으로만 연다. 신청 화면은 부서 찾기에 바로 들어간다.
    '<div class="min-who-row"><span class="min-who">👤 ' + minEsc(minWhoText()) + '</span>' +
      '<button class="min-policy-btn" id="min-policy-open">📌 신청안내</button></div>' +
    (openNow || minPrev() ? "" :
      '<div class="min-closed">지금은 신청 기간이 아니에요. 목록만 살펴보실 수 있습니다.</div>') +
    minLockNoteHtml() +
    // ⚠️ 필터보다 **위**이고, 필터를 켜도 그대로 남는다 — 이미 낸 것은 거를 대상이 아니다.
    minSentListHtml() +
    minOverHtml() +
    '<div class="min-browse-h"><span><b>사역 찾아보기</b>' +
      '<small>부서를 눌러 사역을 살펴보세요</small></span>' +
      '<div class="min-count' + (minPicked.length ? " has" : "") + '" id="min-count">' +
        '선택 <b>' + (minHeld() + minPicked.length) + '</b> / ' + MIN_MAX + '</div></div>' +
    minFilterHtml() +
    // ⚠️ 이 셋은 **자리를 지킨다**(id 고정). 찾기를 칠 때 이 셋만 갈아 끼우고
    //    필터 상자는 손대지 않아야 한글 조합이 안 끊긴다.
    '<div class="min-fnum" id="min-fnum"' + (minFOn() ? "" : " hidden") + '>' +
      '지금 <b>' + L.shownN + '팀</b> 보임</div>' +
    '<div class="min-acc-wrap" id="min-list">' + L.html + '</div>' +
    // 신청현황 화면과 **같은 자리·같은 모양** — 남색이 지금 할 일, 흰 바탕이 되돌아가기.
    // 이미 낸 것이 있으면 돌아갈 길을 둔다: 없으면 목록에 갇힌다.
    '<div class="min-acts">' +
      (openNow || minPrev()
        ? '<button class="min-cta" id="min-next"' + (minPicked.length ? "" : " disabled") + '>' +
          '신청하기' +
          '</button>'
        : "") +
      '<button class="min-ghost" id="min-exit">나가기</button>' +
    '</div>';
}

// 켜진 칩을 하나씩 빼 보고 **1팀 이상 남는 것만** 단추로 만든다.
// ⚠️ 0인 후보를 내놓으면 눌렀는데 또 빈 화면이라 두 번 속는 것이 된다.
function minFHintHtml() {
  const list = (minCat && minCat.list) || [];
  const keep = JSON.stringify(minF);
  const outs = [];
  for (const axis of ["day", "freq", "band"]) {
    for (const k of minF[axis].slice()) {
      minF[axis] = minF[axis].filter(function (x) { return x !== k; });
      const n = list.filter(function (t) { return !t.appoint && minShown(t); }).length;
      minF = JSON.parse(keep);
      if (n > 0) outs.push({ axis: axis, k: k, n: n });
    }
  }
  // ⚠️ 세 축 모두 {k,t} 꼴이 됐다 — 주기만 글자였던 때의 특례를 지운다.
  //    남겨 두면 「weekly」 같은 속이름이 성도님 화면에 그대로 나온다.
  const lab = function (axis, k) {
    const src = axis === "day" ? MIN_DAYS : (axis === "freq" ? MIN_FREQS : MIN_BANDS);
    const hit = src.filter(function (x) { return x.k === k; })[0];
    return hit ? hit.t : k;
  };
  return '<div class="min-none-b">' +
    outs.slice(0, 3).map(function (o) {
      return '<button class="min-ghost" data-fdrop="' + o.axis + '|' + minEsc(o.k) + '">' +
        '「' + minEsc(lab(o.axis, o.k)) + '」만 빼면 <b>' + o.n + '팀</b></button>';
    }).join("") +
    '<button class="min-ghost" id="min-fclear2">✕ 조건 모두 지우기</button></div>';
}

// ⚠️ **화면을 통째로 다시 그리지 않는다.** 입력칸이 새로 만들어지면 한글 조합이 끊긴다.
//    필터 상자는 그대로 두고 목록·숫자만 갈아 끼운 뒤, 목록 쪽 배선만 다시 건다.
function minRefreshList() {
  const L = minAccBuild();
  const box = document.getElementById("min-list");
  if (box) box.innerHTML = L.html;
  const n = document.getElementById("min-fnum");
  if (n) { n.hidden = !minFOn(); n.innerHTML = '지금 <b>' + L.shownN + '팀</b> 보임'; }
  const c = document.getElementById("min-count");
  if (c) {
    c.className = "min-count" + (minPicked.length ? " has" : "");
    c.innerHTML = "선택 <b>" + (minHeld() + minPicked.length) + "</b> / " + MIN_MAX;
  }
  const cl = document.getElementById("min-fclear");
  if (cl) cl.hidden = !minFOn();
  minWireList();
}

// 목록 안에서만 사는 배선 — 목록을 갈아 끼울 때마다 다시 건다
function minWireList() {
  for (const b of document.querySelectorAll("[data-acc]")) {
    b.addEventListener("click", function () {
      const c = this.getAttribute("data-acc");
      minOpen = (minOpen === c) ? null : c;      // 한 번에 하나만 — 기도문 아코디언과 같은 규칙
      renderMinistry(window.scrollY);
    });
  }
  for (const b of document.querySelectorAll("[data-team]")) {
    b.addEventListener("click", function () {
      if (minTogglePick(Number(this.getAttribute("data-team")))) renderMinistry(window.scrollY);
    });
  }
  for (const b of document.querySelectorAll("[data-fdrop]")) {
    b.addEventListener("click", function () {
      const p = this.getAttribute("data-fdrop").split("|");
      minF[p[0]] = minF[p[0]].filter(function (x) { return x !== p[1]; });
      renderMinistry(0);
    });
  }
  const c2 = document.getElementById("min-fclear2");
  if (c2) c2.addEventListener("click", minClearFilter);
  minWireMore();
}

function minClearFilter() {
  minF = { day: [], freq: [], band: [] };
  minQ = "";
  renderMinistry(0);
}

function wireMinPick(u) {
  minWireList();          // 아코디언·팀 단추·자세히·0개 안내 (목록을 갈아 끼울 때 다시 걸린다)

  // 칩은 자판이 아니라 눌러서 고르는 것이라 통째로 다시 그려도 된다
  for (const b of document.querySelectorAll("[data-f]")) {
    b.addEventListener("click", function () {
      const axis = this.getAttribute("data-f"), k = this.getAttribute("data-k");
      const i = minF[axis].indexOf(k);
      if (i >= 0) minF[axis].splice(i, 1); else minF[axis].push(k);
      renderMinistry(window.scrollY);
    });
  }
  const cl = document.getElementById("min-fclear");
  if (cl) cl.addEventListener("click", minClearFilter);

  const qel = document.getElementById("min-q");
  if (qel) {
    // ⚠️ **여기서만 화면을 통째로 다시 그리지 않는다.** 한 글자마다 다시 그리면
    //    입력칸이 새로 만들어져 한글 조합이 끊긴다 — 「오병」이 「ㅇㅗㅂㅕㅇ」이 된다
    //    (성도님 제보 2026-09-10). 포커스·커서를 되살려도 소용없다. 요소가 살아야 한다.
    qel.addEventListener("input", function () {
      minQ = this.value.trim();
      minRefreshList();
    });
    // 조합이 끝나는 순간에도 한 번 — 브라우저에 따라 input 이 안 오는 경우가 있다
    qel.addEventListener("compositionend", function () {
      minQ = this.value.trim();
      minRefreshList();
    });
  }

  const go = document.getElementById("min-next");
  if (go) go.addEventListener("click", function () { minStep = "confirm"; renderMinistry(); });

  const pol = document.getElementById("min-policy-open");
  if (pol) pol.addEventListener("click", minOpenPolicy);
}

// 사역 신청 안내 — 화면에 늘 펴 두지 않고 소속 옆 단추로 열리는 팝업 하나로
// (성도님 요청). 「사역 자세히 보기」(min-d-*)와 같은 창 모양을 그대로 쓴다.
function minPolicyModalHtml() {
  return '<div class="min-d-box" role="dialog" aria-modal="true">' +
    '<div class="min-d-head"><div><div class="min-d-nm">📌 사역 신청 안내</div></div>' +
      '<button class="min-d-x" data-dclose aria-label="닫기">✕</button></div>' +
    '<div class="min-d-body">' +
      '<div class="min-policy-key">' +
        '<span><b>최대 ' + MIN_MAX + '개</b></span>' +
        '<span><b>임명 후 시작</b></span>' +
      '</div>' +
      '<ol class="min-policy-ol">' +
        '<li>등록식 후 <b>3개월 이상 성실히 예배에 출석</b>한 성도님이 신청할 수 있습니다.</li>' +
        '<li>한 사람이 신청할 수 있는 사역은 <b>최대 ' + MIN_MAX + '개</b>이며, 자치회장도 사역 개수에 포함됩니다.</li>' +
        '<li>부장·팀장·회계·찬양대 지휘자·자치회장은 다른 부서에서 <b>동일한 사역을 겸직할 수 없습니다.</b></li>' +
        '<li>교사는 다른 교육부서 교사로, 찬양대원은 다른 찬양대원으로 이중 사역할 수 없습니다. 단, <b>새하늘찬양대는 예외</b>입니다.</li>' +
        '<li>신청 후 <b>임명을 받아야</b> 사역할 수 있으며, 임명 결과는 교회 홈페이지 게시판에서 확인합니다.</li>' +
        '<li>사역 신청은 <b>매년 새로</b> 해야 합니다.</li>' +
      '</ol></div>' +
    '<div class="min-d-foot"><button class="min-d-close2" data-dclose>닫기</button></div></div>';
}

function minOpenPolicy() {
  const box = document.createElement("div");
  box.className = "min-d-wrap";
  box.innerHTML = minPolicyModalHtml();
  document.body.appendChild(box);

  const esc = function (e) { if (e.key === "Escape") { e.preventDefault(); close(); } };
  function close() {
    document.removeEventListener("keydown", esc);
    if (box.parentNode) box.parentNode.removeChild(box);
  }
  document.addEventListener("keydown", esc);
  box.addEventListener("click", function (e) { if (e.target === box) close(); });   // 바깥 탭
  for (const x of box.querySelectorAll("[data-dclose]")) x.addEventListener("click", close);
}

// ⚠️ 사역 신청 절차에서 쓰던 브라우저 기본 alert()·prompt()는 이 앱 화면과
// 딴판이라 튀어 보인다(성도님 지적). 「사역 자세히 보기」와 같은 창(.min-d-*)
// 모양으로 두 가지를 대신한다 — 알림 하나, 입력 하나. 다른 화면은 손대지 않는다.
function minAlert(msg) {
  const box = document.createElement("div");
  box.className = "min-d-wrap";
  // ⚠️ 밋밋한 텍스트 링크(.min-d-close2)였을 때 "성의가 없다"는 지적을 받았다 —
  //    큰 남색 단추(.min-cta)와 아이콘을 줘서 실제 안내 창처럼 보이게 한다.
  box.innerHTML = '<div class="min-d-box min-alert-box" role="alertdialog" aria-modal="true">' +
    '<div class="min-d-body"><div class="min-alert-ico" aria-hidden="true">🔔</div>' +
      '<p class="min-alert-msg">' + minEsc(msg).replace(/\n/g, "<br>") + '</p></div>' +
    '<div class="min-d-foot"><button class="min-cta min-alert-ok" data-dclose autofocus>확인</button></div></div>';
  document.body.appendChild(box);
  const esc = function (e) { if (e.key === "Escape" || e.key === "Enter") { e.preventDefault(); close(); } };
  function close() {
    document.removeEventListener("keydown", esc);
    if (box.parentNode) box.parentNode.removeChild(box);
  }
  document.addEventListener("keydown", esc);
  box.addEventListener("click", function (e) { if (e.target === box) close(); });
  for (const x of box.querySelectorAll("[data-dclose]")) x.addEventListener("click", close);
}

// 예/아니오 확인 — 사역 신청 창과 같은 모양. 「그만두기」·바깥 탭·Esc 는 false
function minConfirm(msg, okLabel, cancelLabel) {
  return new Promise(function (resolve) {
    const box = document.createElement("div");
    box.className = "min-d-wrap";
    box.innerHTML = '<div class="min-d-box min-alert-box" role="alertdialog" aria-modal="true">' +
      '<div class="min-d-body"><div class="min-alert-ico" aria-hidden="true">⚠️</div>' +
        '<p class="min-alert-msg">' + minEsc(msg).replace(/\n/g, "<br>") + '</p></div>' +
      '<div class="min-d-foot min-d-foot-row">' +
        '<button class="min-ghost" data-cancel>' + minEsc(cancelLabel || "그만두기") + '</button>' +
        '<button class="min-cta" data-ok>' + minEsc(okLabel || "확인") + '</button></div></div>';
    document.body.appendChild(box);
    function done(v) {
      document.removeEventListener("keydown", esc);
      if (box.parentNode) box.parentNode.removeChild(box);
      resolve(v);
    }
    const esc = function (e) { if (e.key === "Escape") { e.preventDefault(); done(false); } };
    document.addEventListener("keydown", esc);
    box.addEventListener("click", function (e) { if (e.target === box) done(false); });
    box.querySelector("[data-cancel]").addEventListener("click", function () { done(false); });
    box.querySelector("[data-ok]").addEventListener("click", function () { done(true); });
  });
}

// 취소 확인용 번호 입력 — 취소를 누르거나 바깥을 탭하면 null(=그만둠)을 돌려준다
// 서버가 준 시각(ISO)을 한국 날짜 「2026.09.17」로 — 신청현황의 임명일·취소일
function minDay(raw) {
  const p = kstDateParts(raw);
  return p ? p.y + "." + String(p.m).padStart(2, "0") + "." + String(p.d).padStart(2, "0") : "";
}
// 받침에 따라 은/는 — 「장학은」「사랑부는」. 한글로 안 끝나면 은(는).
function minEunNeun(word) {
  const c = String(word || "").charCodeAt(String(word || "").length - 1);
  if (!(c >= 0xAC00 && c <= 0xD7A3)) return word + "은(는)";
  return word + ((c - 0xAC00) % 28 ? "은" : "는");
}
function minPromptPhone(msg, subMsg) {
  return new Promise(function (resolve) {
    const box = document.createElement("div");
    box.className = "min-d-wrap";
    box.innerHTML = '<div class="min-d-box" role="dialog" aria-modal="true">' +
      '<div class="min-d-body"><p class="min-alert-msg">' + minEsc(msg).replace(/\n/g, "<br>") +
        (subMsg ? '<span class="min-alert-sub">' + minEsc(subMsg) + '</span>' : "") + '</p>' +
        '<input class="min-alert-input" id="min-alert-ph" type="tel" inputmode="numeric" maxlength="13"' +
        ' placeholder="010-1234-5678" autocomplete="off"></div>' +
      '<div class="min-d-foot min-d-foot-row">' +
        '<button class="min-ghost" data-cancel>취소</button>' +
        '<button class="min-cta" data-ok>확인</button></div></div>';
    document.body.appendChild(box);
    const input = box.querySelector("#min-alert-ph");
    input.addEventListener("input", function () { this.value = pilsaPhoneFmt(this.value); });
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); ok(); } });
    setTimeout(function () { input.focus(); }, 0);
    function done(v) {
      document.removeEventListener("keydown", esc);
      if (box.parentNode) box.parentNode.removeChild(box);
      resolve(v);
    }
    function ok() { done(input.value); }
    const esc = function (e) { if (e.key === "Escape") { e.preventDefault(); done(null); } };
    document.addEventListener("keydown", esc);
    box.addEventListener("click", function (e) { if (e.target === box) done(null); });
    box.querySelector("[data-cancel]").addEventListener("click", function () { done(null); });
    box.querySelector("[data-ok]").addEventListener("click", ok);
  });
}

// 임명직을 눌렀을 때 — 신청이 아니라 부서가 임명하는 자리다(서버도 `appoint` 는 받지 않는다).
// 「다른 사역을 고르라」는 넣지 않는다 — 그 자리를 원하시는 분께는 부서에 여쭙는 길이 맞다(2026-10-02 친구).
function minAppointMsg(t) {
  const lead = minPlain(t.leader);
  return "「" + t.team + "」" + minEunNeun(t.team).slice(String(t.team).length) + " 임명직입니다.\n\n" +
    "이 사역을 섬기고 싶으시면\n해당 부서(" + t.committee + ")에 여쭤 주세요." +
    (lead ? "\n\n담당(문의): " + lead : "");
}

// 고르기·빼기 한 곳에서 — 목록에서도, 「자세히」 창에서도 같은 규칙을 따르게
function minTogglePick(id) {
  const ap = minTeam(id);
  if (ap && ap.appoint) { minAlert(minAppointMsg(ap)); return false; }
  if (minLockedIds.indexOf(id) >= 0) {
    // 접수·임명된 줄을 눌러 빼려 하면 까닭을 알리고 체크는 그대로 둔다(2026-09-18 성도님)
    const st = minLockStatus(id);
    const t = ((minCat && minCat.list) || []).find(function (x) { return x.id === id; });
    const nm = t ? minEunNeun(t.team) + " " : "";
    minAlert(st === "미채택" ? "이 사역은 이번에 다른 분이 임명되셨어요. 다른 사역을 골라 주세요."
        : st === "임명확정" ? nm + "이미 임명이 확정되어\n신청을 취소할 수 없어요."
        : st === "취소" ? "이 신청은 부서 요청으로 취소되었어요. 자세한 것은 해당 부서에 여쭤봐 주세요."
        : nm + "담당자가 이미 접수해\n신청을 취소할 수 없어요.");
    return false;
  }
  const i = minPicked.indexOf(id);
  if (i >= 0) { minPicked.splice(i, 1); return true; }
  if (minHeld() + minPicked.length >= MIN_MAX) {
    minAlert(minHeld()
      ? "이미 결정된 " + minHeld() + "개를 더하면 " + MIN_MAX + "개를 넘어요."
      : "사역 임명 원칙에 따라 최대 " + MIN_MAX + "개까지 신청하실 수 있어요.");
    return false;
  }
  minPicked.push(id);
  return true;
}

/* ── 사역 자세히 보기 ────────────────────────────────────────────
   ⚠️ 위원회 아코디언 **안에서 또 펼치지 않는다** — 위원회 → 팀 → 설명으로
      세 겹이 되면 첫 글자를 읽기까지 세 번 눌러야 한다(가정 축복 기도문에서
      같은 이유로 그룹 단계를 버렸다). 창은 겹이 아니라 「잠깐 들르는 곳」이라
      닫으면 보던 자리로 그대로 돌아온다.                                    */
function minWireMore() {
  for (const b of document.querySelectorAll("[data-more]")) {
    b.addEventListener("click", function (e) {
      e.stopPropagation();
      minOpenDetail(Number(this.getAttribute("data-more")));
    });
  }
}

function minDetailHtml(t) {
  const on = minPicked.indexOf(t.id) >= 0;
  const row = function (label, val) {
    return val ? '<div class="min-d-row"><div class="min-d-l">' + label + '</div>' +
      '<div class="min-d-v">' + val + '</div></div>' : "";
  };
  let rows = row("언제", t.sched) + row("하는 일", t.desc);
  // 담당자(문의처) — 「궁금하면 누구에게 물어야 하나」가 신청 전 가장 큰 물음이다
  // (2026-09-18 성도님 · 종이 양식의 문의처 칸과 같은 까닭). 「섬기는 분」 **위**에 놓는다.
  rows += row("담당(문의)", t.leader);
  // 「섬기는 분」 — 이름과 하는 일만으로는 「내가 낄 자리인가」가 안 그려진다.
  // 아는 얼굴이 하나라도 보이면 문턱이 확 낮아진다(성도님 요청 2026-09-09).
  // ⚠️ 관리자가 한 줄에 한 분씩 넣은 것이라 <br> 로 갈린다 — 줄마다 칩으로 세운다.
  let who = [];
  if (t.members) {
    who = String(t.members).split(/<br\s*\/?>/i)
      .map(function (x) { return x.trim(); }).filter(Boolean);
  }
  rows += '<div class="min-d-row"><div class="min-d-l">섬기는 분' +
    (who.length ? ' <span class="min-d-n">' + who.length + '명</span>' : "") + '</div>' +
    (who.length
      ? '<div class="min-d-who">' +
        who.map(function (x) { return '<span class="min-d-p">' + x + '</span>'; }).join("") + '</div>'
      : '<div class="min-d-empty">아직 등록된 분이 없습니다.</div>') + '</div>';
  rows += row("필요 인원", t.capacity);
  // 신청 화면(고르는 중)에서만 담기 단추를 둔다 — 확인·완료 화면에서는 읽기만.
  // ⚠️ 이미 결정된 팀에는 내놓지 않는다 — 눌렀는데 「뺄 수 없어요」가 뜨면
  //    성도님은 단추가 고장 난 줄 아신다(2026-09-09 감사).
  const lockSt = minLockedIds.indexOf(t.id) >= 0 ? minLockStatus(t.id) : "";
  const canPick = minStep === "pick" && !t.appoint && !lockSt;
  return '<div class="min-d-box" role="dialog" aria-modal="true">' +
    '<div class="min-d-head">' +
      '<div><div class="min-d-nm">' + minEsc(t.team) + '</div>' +
      '<div class="min-d-com">' + minEsc(t.committee) +
        (t.group ? ' · ' + minEsc(t.group) : "") + '</div></div>' +
      '<button class="min-d-x" data-dclose aria-label="닫기">✕</button></div>' +
    '<div class="min-d-body">' + rows +
      (t.appoint ? '<p class="min-d-note">이 사역은 <b>임명직</b>입니다 — 신청 목록에는 담기지 않아요. ' +
        '섬기고 싶으시면 해당 부서(' + minEsc(t.committee) + ')에 여쭤 주세요.</p>' : "") +
      // ⚠️ 임명은 「못 고칩니다」로 시작할 소식이 아니다(2026-09-18 성도님) — 축하부터 말한다.
      (lockSt === "임명확정"
        ? '<p class="min-d-note min-d-appt">🎉 <b>이 사역에 임명되었습니다.</b>' +
          '<span class="min-d-verse">“각각 은사를 받은 대로 하나님의 여러 가지 은혜를 맡은 ' +
          '선한 청지기 같이 서로 봉사하라” <span class="min-ref">벧전 4:10</span></span></p>'
        : lockSt ? '<p class="min-d-note">' +
          (lockSt === "미채택" ? '이번에는 다른 분이 임명되셨어요.'
            : lockSt === "취소" ? '이 신청은 <b>취소</b>되었어요 — 부서 요청으로 취소된 것이라 자세한 것은 해당 부서에 여쭤봐 주세요.'
            : '담당자가 이미 <b>접수</b>한 사역이라 고치거나 뺄 수 없습니다.') + '</p>' : "") +
      (t.opt ? '<p class="min-d-note">' + minEsc(t.opt) + '</p>' : "") + '</div>' +
    '<div class="min-d-foot">' +
      (canPick
        ? '<button class="min-d-go' + (on ? " off" : "") + '" data-dpick>' +
          (on ? "신청 목록에서 빼기" : "이 사역 담기") + '</button>'
        : "") +
      '<button class="min-d-close2" data-dclose>닫기</button></div></div>';
}

function minOpenDetail(id) {
  const t = minTeam(id);
  if (!t) return;
  const box = document.createElement("div");
  box.className = "min-d-wrap";
  box.innerHTML = minDetailHtml(t);
  document.body.appendChild(box);

  const esc = function (e) { if (e.key === "Escape") { e.preventDefault(); close(); } };
  function close() {
    document.removeEventListener("keydown", esc);
    if (box.parentNode) box.parentNode.removeChild(box);
  }
  document.addEventListener("keydown", esc);
  box.addEventListener("click", function (e) { if (e.target === box) close(); });   // 바깥 탭
  for (const x of box.querySelectorAll("[data-dclose]")) x.addEventListener("click", close);

  const go = box.querySelector("[data-dpick]");
  if (go) go.addEventListener("click", function () {
    // ⚠️ 창을 먼저 닫는다 — renderMinistry 가 화면을 다시 그려도 이 창은 body 에
    //    붙어 있어 살아남는다(그대로 두면 옛 상태의 창이 화면 위에 남는다).
    const y = window.scrollY;
    const ok = minTogglePick(t.id);
    close();
    if (ok) renderMinistry(y);
  });
}

/* ── ② 확인 ─────────────────────────────────────────────────── */
function minConfirmHtml() {
  let rows = "";
  for (const id of minPicked) {
    const t = minTeam(id); if (!t) continue;
    const meta = minShortOf(t);
    // ⚠️ 이름 줄은 **칸을 가로질러** 놓는다(2026-09-18 성도님) — 오른쪽 단추 옆에 끼우면
    //    폭이 좁아 「방송실 운영 · 방송전산부」가 두 줄로 접히고, 오른쪽에는 빈자리가 남았다.
    rows += '<div class="min-pick"><span class="min-pick-ck">✓</span>' +
      '<span class="min-nm">' + minEsc(t.team) +
      ' <span class="min-com">· ' + minEsc(t.committee) + '</span></span>' +
      '<span class="min-info">' + (meta ? '<span class="min-meta">' + meta + '</span>' : "") + '</span>' +
      '<button class="min-del" data-drop="' + t.id + '">취소</button></div>';
  }
  return minTitleHtml("신청 사역 확인", '<p class="min-sub">이 사역으로 신청합니다</p>') +
    (minLockedIds.length
      ? '<div class="min-note min-lock-note">📥 이미 접수된 <b>' + minLockedIds.length +
        '개</b>는 그대로 남습니다 — 아래 것만 새로 냅니다.</div>'
      : "") +
    '<div class="min-who">👤 ' + minEsc(minWhoText()) + '</div>' +
    minOverHtml() +
    rows +
    '<div class="min-p4"><label for="min-pos">직분</label>' +
      '<select id="min-pos" class="min-pos">' +
        '<option value="">선택하세요</option>' +
        MIN_POSITIONS.map(function (x) {
          return '<option value="' + minEsc(x) + '"' +
            (x === minPosVal ? " selected" : "") + '>' + minEsc(x) + '</option>';
        }).join("") +
      '</select></div>' +
    (lifeGateOn ? '' :
      '<div class="min-p4"><label for="min-phone">휴대폰</label>' +
        '<input id="min-phone" type="tel" inputmode="numeric" maxlength="13" placeholder="010-1234-5678"' +
        ' value="' + minEsc(pilsaPhoneFmt(minPhoneVal)) + '" autocomplete="off"></div>') +
    '<div class="min-note">' +
      (lifeGateOn
        ? '직분은 <b>임명</b>에 씁니다. 연락처는 따로 받지 않고, 필요할 때만 한 번 여쭤봐요.'
        : ((minMine ? '처음 신청하실 때 넣은 번호와 같아야 고쳐집니다. ' : '') +
           '직분과 휴대폰 번호는 <b>본인 확인·교적 대조와 임명 뒤 연락</b>에 씁니다. ' +
           '번호는 임명·취소가 정해진 뒤 지울 수 있고, <b>늦어도 180일</b>이 지나면 저절로 지웁니다.')) +
      '</div>' +
    '<button class="min-cta" id="min-submit">제출하기<span class="min-cta-s">신청 후 임명을 받아야 시작할 수 있어요</span></button>' +
    '<button class="min-ghost" id="min-back">사역신청 화면으로</button>';
}

function minWhoText() {
  const u = loadUser() || {};
  const who = u.type === "교구"
    ? [u.gu, u.mok ? u.mok + "목장" : ""].filter(Boolean).join(" ")
    : [u.bu, u.grade].filter(Boolean).join(" ");
  return (who ? who + " · " : "") + (u.name || "");
}

function wireMinConfirm(u) {
  for (const b of document.querySelectorAll("[data-drop]")) {
    b.addEventListener("click", function () {
      const id = Number(this.getAttribute("data-drop"));
      const i = minPicked.indexOf(id);
      if (i >= 0) minPicked.splice(i, 1);
      if (!minPicked.length) minStep = "pick";
      renderMinistry();
    });
  }
  document.getElementById("min-back").addEventListener("click", function () {
    minStep = "pick"; renderMinistry();
  });
  const posel = document.getElementById("min-pos");
  if (posel) posel.addEventListener("change", function () { minPosVal = this.value; });
  const phel = document.getElementById("min-phone");
  if (phel) phel.addEventListener("input", function () {
    this.value = pilsaPhoneFmt(this.value);        // 010-1234-5678 꼴로 자동 정리
    minPhoneVal = this.value;
  });
  const btn = document.getElementById("min-submit");
  btn.addEventListener("click", async function () {
    minPosVal = posel ? posel.value : "";
    if (MIN_POSITIONS.indexOf(minPosVal) < 0) {
      minAlert("직분을 골라 주세요.");
      if (posel) posel.focus();
      return;
    }
    minPhoneVal = phel ? pilsaPhoneFmt(phel.value) : "";
    if (!lifeGateOn && !pilsaPhoneOk(minPhoneVal)) {   // 확인 번호 켜진 분은 번호 칸이 없다(Plan 5)
      minAlert("휴대폰 번호를 010-1234-5678 꼴로 넣어 주세요.");
      if (phel) phel.focus();
      return;
    }
    btn.disabled = true; btn.textContent = "보내는 중…";
    const who = u.type === "교구"
      ? [u.gu, u.mok ? u.mok + "목장" : ""].filter(Boolean).join(" ")
      : [u.bu, u.grade].filter(Boolean).join(" ");
    try {
      const order = {
        user_id: u.user_id, name: u.name, who, choices: minPicked,
        phone: minPhoneVal, position: minPosVal, pw: minPw(), preview: minPrev(),
      };
      let r = await api.ministryApply(order);
      // 교적과 안 맞은 분: 연락처를 한 번 받고 다시 보낸다(확인 번호 문이 켜진 경우만 온다)
      let contactTries = 0;
      while (r && r.confirm === "contact-needed" && contactTries < 1) {
        contactTries++;
        const ok = await openLifeContact(u);
        if (!ok) { renderMinistry(); return; }
        r = await api.ministryApply(order);
      }
      // 같은 번호로 다른 소속의 신청이 있으면 서버가 한 번 묻는다(다른 교구·목장으로 로그인해 낸 경우)
      // ⚠️ 문구는 r.message — error 에 담으면 supaCall 이 던져 이 자리에 오지 못한다
      if (r && r.confirm === "dup-phone") {
        const go = await minConfirm(r.message || "같은 이름과 번호로 들어온 신청이 이미 있습니다. 그래도 신청할까요?", "그래도 신청", "그만두기");
        if (!go) { renderMinistry(); return; }
        r = await api.ministryApply(Object.assign({}, order, { dupOk: true }));
      }
      if (!r || !r.ok) { minAlert((r && r.error) || "신청을 저장하지 못했어요."); renderMinistry(); return; }
      minMine = r.mine;
      minSyncPicked();
      minStep = "done";
      renderMinistry();
    } catch (e) {
      minAlert(minErr(e, "연결이 고르지 않아 저장하지 못했어요. 잠시 뒤 다시 눌러 주세요."));
      renderMinistry();
    }
  });
}

/* ── ③ 내 신청(진행 현황) ───────────────────────────────────── */
function minDoneHtml(u) {
  const m = minMine;
  const items = (m && m.items) || [];
  // ⚠️ 화면 맨 위 한 줄은 「가장 덜 진행된 건」으로 말한다 — 셋이 제각각일 수 있는데
  //    아무거나 고르면 성도님이 자기 상태를 잘못 읽는다.
  // ⚠️ 목록에 있는 상태를 **하나도 빠뜨리지 말 것.** indexOf 가 -1 을 돌려주면
  //    그 상태가 무조건 최솟값이 되어, 끝난 한 건이 진행 중인 신청을 제치고
  //    맨 윗줄을 차지한다(2026-09-10 「취소」를 더하며 실제로 그랬다).
  const order = ["신청완료", "접수완료", "임명확정", "미채택", "취소"];
  let worst = items.length ? items[0].status : "신청완료";
  for (const it of items) if (order.indexOf(it.status) < order.indexOf(worst)) worst = it.status;

  let rows = "";
  for (const it of items) {
    const st = MIN_STATE[it.status] || MIN_STATE["신청완료"];
    const t = minTeam(it.team_id);
    const meta = t ? minShortOf(t) : "";
    // 신청일과 임명일을 한 줄로(2026-09-18 성도님) — decided_at 은 임명확정·취소 때 서버가 찍는다.
    // ⚠️ 옛 행은 decided_at 이 비어 있을 수 있다 — 없으면 이름표만 남기지 말고 통째로 뺀다.
    const decided = (it.status === "임명확정" || it.status === "미채택" || it.status === "취소")
      ? minDay(it.decided_at) : "";
    const dateLine = function (ic, label, day) {
      return '<span class="min-meta min-dates">' + ic + ' ' + label + ' <b>' + minEsc(day) + '</b></span>';
    };
    const dates = (it.at ? dateLine("📝", "신청", it.at) : "") +
      (decided
        ? dateLine(it.status === "임명확정" ? "🎉" : it.status === "취소" ? "🚫" : "🔕",
            it.status === "임명확정" ? "임명" : it.status === "취소" ? "취소" : "결정", decided)
        : "");
    // ⚠️ 첫 줄에 **이름과 상태를 나란히**(2026-09-18 성도님). 사역 시간(meta)은 이 카드에서 뺐다 —
    //    「내 신청」에서 궁금한 것은 「무엇을·어디까지」이고, 시간은 「보기」 창이 맡는다.
    rows += '<div class="min-pick"><span class="min-pick-ck ' + st.cls + '">' + st.ic + '</span>' +
      '<span class="min-hd"><span class="min-nm">' + minEsc(it.team) +
        ' <span class="min-com">· ' + minEsc(it.committee) + '</span></span>' +
        '<span class="min-st ' + st.cls + '">' + minEsc(minStName(it.status)) + '</span></span>' +
      '<span class="min-info">' + dates + '</span>' +
      (t ? minMoreBtn(t) : "") + '</div>';
  }

  const left = m ? m.left : MIN_MAX;
  // ⚠️ 고르기 화면이 (기간 || 미리보기) 로 제출까지 열어 두므로 여기도 같은 문을 써야 한다.
  //    minIsOpen() 만 보면 관리자가 ?preview=ministry 로 시험할 때 「내 신청」 화면에
  //    단추가 하나도 없어 **돌아갈 길이 사라진다**(2026-09-09 성도님 제보).
  const canAct = minIsOpen() || minPrev();
  const canEdit = !!(m && m.openCount) && canAct;
  const canAdd = left > 0 && canAct;
  // ⚠️ 「더 신청」·「고치기」·「목록 보기」는 **가는 곳이 같다**(고르기 화면 하나).
  //    셋을 따로 두면 한 화면에 똑같은 단추가 셋이 되어 무엇을 눌러야 하는지가
  //    오히려 흐려진다(성도님 지적). 단추는 하나다.
  const canGo = canAdd || canEdit;
  return minTitleHtml("사역 신청현황") +
    '<div class="min-who">👤 ' + minEsc(minWhoText()) + '</div>' +
    minStepsHtml(worst) +
    rows +
    '<div class="min-count has">' + (m ? m.used : 0) + ' / ' + MIN_MAX + ' 신청' +
      (left > 0 ? ' · <b>추가 ' + left + '사역 가능</b>' : "") + '</div>' +
    // 담당자가 결정을 되돌리면 3개를 넘길 수 있다 — 숨기지 말고 알린다
    (m && m.used > MIN_MAX
      ? '<div class="min-note min-lock">신청이 <b>' + m.used + '건</b>으로 ' + MIN_MAX +
        '개를 넘었어요. 하나를 빼시거나 담당자에게 알려 주세요.</div>' : "") +
    // ⚠️ 못 고치는 까닭이 둘인데 한 문장으로 뭉뚱그리면 성도님이 사실이 아닌 말을 읽는다
    (!canAct
      ? '<div class="min-note min-lock">지금은 신청 기간이 아니에요. ' +
        '기간(<b>' + minPeriodText() + '</b>)이 되면 여기서 고치실 수 있어요.</div>'
      : !canEdit
        ? '<div class="min-note min-lock">' +
          (items.length && items.every(function (x) { return x.status === "임명확정"; })
            ? '임명이 확정된 신청은 고치거나 뺄 수 없어요.'
            : '담당자가 접수한 신청은 고치거나 뺄 수 없어요.') + '</div>'
        : "") +
    // 단추를 한 줄에 나란히 — 수정은 남색(지금 할 일), 취소·나가기는 흰 바탕.
    // 기간이든 아니든 목록은 늘 볼 수 있다: 막다른 화면을 만들지 않는다.
    // ⚠️ 이 화면은 신청을 이미 낸 분이 여는 **첫 화면**이라(위 minStep 초기값)
    //    나가기가 여기 없으면 첫 화면으로 돌아갈 길이 없다(성도님 지적).
    // ⚠️ canEdit이면 단추가 셋이 된다 — 글자가 두 줄로 접히지 않게 min-acts-3으로
    //    좁은 화면용 글씨·여백을 따로 준다(성도님 지적, 실기기 확인).
    '<div class="min-acts' + (canEdit ? " min-acts-3" : "") + '">' +
      (canGo
        ? '<button class="min-cta" id="min-go">추가/수정</button>'   // 더하기도 이 단추로 한다(canAdd) — 「신청 수정」→「추가/수정」(2026-09-30 친구 요청)
        : '<button class="min-ghost" id="min-go">🗂️ 사역 목록 보기</button>') +
      (canEdit
        ? '<button class="min-ghost min-cancel" id="min-cancel">신청 취소</button>'
        : "") +
      '<button class="min-ghost" id="min-exit">나가기</button>' +
    '</div>';
}

// 서버가 준 까닭인지, 진짜 통신 오류인지 가른다.
// ⚠️ supaCall 은 {ok:false,error} 도 던지므로(js/api.js) 업무 규칙 거절이 여기로 온다.
//    「HTTP 500」 같은 것만 통신 탓으로 돌린다(2026-09-09 감사).
function minErr(e, fallback) {
  const m = e && e.message ? String(e.message) : "";
  return (m && m.indexOf("HTTP") !== 0 && m !== "Failed to fetch") ? m : fallback;
}

// 취소도 4자리로 한 번 확인한다 — 신청을 지우는 일이라 고치기와 같은 문턱을 둔다
let minCancelPh = "";
async function minCancelAsk() {
  // ⚠️ 접수·임명된 건은 서버가 남긴다(ministryCancel) — 무엇이 지워지고 무엇이 남는지 창에서 말한다.
  //    「신청 취소」만 보면 접수된 사역까지 다 없어지는 줄 아신다(2026-09-18 성도님).
  const items = (minMine && minMine.items) || [];
  const kept = items.filter(function (x) { return x.status === "접수완료" || x.status === "임명확정"; })
    .map(function (x) { return x.team; });
  const kill = items.filter(function (x) { return !x.locked; }).map(function (x) { return x.team; });
  const raw = await minPromptPhone(
    (kill.length ? kill.join(", ") + " 신청을 취소합니다." : "아직 접수 전인 신청을 취소합니다.") +
      (kept.length ? "\n접수·임명된 " + minEunNeun(kept.join(", ")) + " 그대로 남아요." : "") +
      "\n휴대폰 번호를 넣어 주세요.",
    "(처음 신청하실 때 넣으신 번호입니다)");
  if (raw == null) return false;                    // 취소·바깥 탭·esc — 아무 말 없이 그만둔다
  const ph = pilsaPhoneFmt(raw || "");
  if (!pilsaPhoneOk(ph)) { if (ph) minAlert("휴대폰 번호를 010-1234-5678 꼴로 넣어 주세요."); return false; }
  minCancelPh = ph;
  return true;
}

function wireMinDone(u) {
  minWireMore();
  // 더 신청하기·고치기·목록 보기가 모두 이 한 곳으로 간다.
  // ⚠️ 갈 때 안 잠긴 것을 함께 들고 간다(빈손으로 가면 낸 것을 잃는다).
  const go = document.getElementById("min-go");
  if (go) go.addEventListener("click", function () {
    minPhoneVal = "";         // 낼 때마다 번호를 다시 넣게 한다(최소 본인 확인)
    minPosVal = (minMine && minMine.position) || minPosVal;   // 직분은 그대로 둔다
    minSyncPicked();
    minStep = "pick"; renderMinistry();
  });
  const cancel = document.getElementById("min-cancel");
  if (cancel) cancel.addEventListener("click", async function () {
    if (!(await minCancelAsk())) return;
    cancel.disabled = true;
    try {
      const r = await api.ministryCancel(u.user_id, minPw(), minCancelPh, minPrev());
      if (!r || !r.ok) { minAlert((r && r.error) || "취소하지 못했어요."); cancel.disabled = false; return; }
      // ⚠️ 접수된 건은 취소해도 남는다 — 「전부 지웠다」로 치면 화면이 사실과 어긋난다.
      minMine = r.mine || null;
      minSyncPicked();
      minStep = minMine ? "done" : "pick";
      renderMinistry();
    } catch (e) {
      minAlert(minErr(e, "연결이 고르지 않아 취소하지 못했어요."));
      cancel.disabled = false;
    }
  });
}
