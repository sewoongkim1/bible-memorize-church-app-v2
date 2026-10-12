// ✍️ 성경필사 노트 신청 화면 — app.js 에서 떼어 냈다(2026-10-12 · 필요할 때 받는다 · docs/notes/lazy-load.md · docs/notes/pilsa-orders.md).
//   들어오는 길: 첫 화면 「더 보기」의 「✍️ 성경필사 노트 신청」(확인 번호 문 뒤) · ?preview=pilsa — 모두 app.js 의 withLazyJs("pilsa", …).
//   ⚠️ 번호 꼴 pilsaPhoneFmt·pilsaPhoneOk 는 사역신청·js/events.js 도 써서 app.js 에 남겼다 — 여기로 옮기지 말 것.

// ------------------------------------------------------------
// 성경필사 노트 신청
//   원본(summer-bible 신청 폼)의 구성을 그대로 옮기되,
//   개인 정보(교구·목장·이름)는 암송 앱 로그인 정보로 대신한다(직분은 받지 않음).
//
//   고르는 것 : 필사 유형(오른쪽/아래쪽) · 번역본(개역개정/쉬운성경/NIV)
//               성경 단위별 부수(구약 21 + 신약 10 = 31단위) · 요청 사항
//   상한     : 총 5부. 기간 제한 없음.
//   상태 흐름 : 신청완료 → 준비중 → 준비완료 → 배부완료
//               성도가 고칠 수 있는 것은 '신청완료' 단계뿐이다.
//
//   ※ 지금은 화면만 — 서버 연동(submitPilsa/askCancelPilsa)은 다음 단계.
// ------------------------------------------------------------
const PILSA_TOTAL_MAX = 5;                 // 한 분당 총 부수 상한
const PILSA_PRICE = 3000;                  // 권당 가격(원)
function pilsaWon(n) { return (n * PILSA_PRICE).toLocaleString("ko-KR") + "원"; }
const PILSA_SIZE = [
  ["A4", "큰 것"],
  ["A5", "작은 것"],
];
// 지금 신청을 받지 않는 크기 — 값은 버튼에 그대로 적는 이유다.
// 다시 받으려면 이 줄에서 빼면 된다(다른 곳은 손댈 것이 없다).
// ⚠️ 목록에서 지우지는 않는다 — 이미 A5로 신청하신 분의 내용을 불러올 때
//    그 크기를 그대로 보여 주어야 하고, 2권 계산(pilsaMult)도 살아 있어야 한다.
const PILSA_SIZE_OFF = { "A5": "지금은 신청받지 않아요" };
function pilsaSizeOff(size) { return PILSA_SIZE_OFF[size] || ""; }
const PILSA_TYPE1 = [
  ["아래쪽 필사형", "본문 아래 필사 공간"],
  ["오른쪽 필사형", "본문 오른쪽에 필사 공간"],
];
// A5는 지면이 좁아 오른쪽 필사형을 만들 수 없다
const PILSA_TYPE1_BLOCKED = { "A5": ["오른쪽 필사형"] };
const PILSA_TYPE2 = ["개역개정", "쉬운성경", "NIV", "한영(개역개정/NIV)", "영한(NIV/개역개정)"];

function pilsaBlocked(size, t1) {
  const list = PILSA_TYPE1_BLOCKED[size] || [];
  return list.indexOf(t1) >= 0;
}

// 한 쪽에 두 언어를 나란히 넣으려면 지면이 넓어야 한다 —
// A4 + 오른쪽 필사형에서만 만들 수 있다.
const PILSA_DUAL = ["한영(개역개정/NIV)", "영한(NIV/개역개정)"];
function pilsaDualOff(f) { return f.size === "A5" || f.type1 === "아래쪽 필사형"; }
function pilsaT2Blocked(f, t2) {
  return PILSA_DUAL.indexOf(t2) >= 0 && pilsaDualOff(f);
}

// 묶음(sub)은 함께 제작되는 한 권이다 — 원본 목록 그대로
const PILSA_UNITS = {
  ot: [
    { id: "ot01", g: "모세오경", label: "창세기" },
    { id: "ot02", g: "모세오경", label: "출애굽기" },
    { id: "ot03", g: "모세오경", label: "레위기" },
    { id: "ot04", g: "모세오경", label: "민수기" },
    { id: "ot05", g: "모세오경", label: "신명기" },
    { id: "ot06", g: "역사서", label: "여호수아" },
    { id: "ot07", g: "역사서", label: "사사기", sub: "룻기" },
    { id: "ot08", g: "역사서", label: "사무엘상" },
    { id: "ot09", g: "역사서", label: "사무엘하" },
    { id: "ot10", g: "역사서", label: "열왕기상" },
    { id: "ot11", g: "역사서", label: "열왕기하" },
    { id: "ot12", g: "역사서", label: "역대상" },
    { id: "ot13", g: "역사서", label: "역대하" },
    { id: "ot14", g: "역사서", label: "에스라", sub: "느헤미야 · 에스더" },
    { id: "ot15", g: "시가서", label: "욥기" },
    { id: "ot16", g: "시가서", label: "시편" },
    { id: "ot17", g: "시가서", label: "잠언", sub: "전도서 · 아가" },
    { id: "ot18", g: "대선지서", label: "이사야" },
    { id: "ot19", g: "대선지서", label: "예레미야", sub: "예레미야애가" },
    { id: "ot20", g: "대선지서", label: "에스겔", sub: "다니엘" },
    { id: "ot21", g: "소선지서", label: "호세아", sub: "요엘 · 아모스 · 오바댜 · 요나 · 미가 · 나훔 · 하박국 · 스바냐 · 학개 · 스가랴 · 말라기" },
  ],
  nt: [
    { id: "nt01", g: "복음서", label: "마태복음" },
    { id: "nt02", g: "복음서", label: "마가복음" },
    { id: "nt03", g: "복음서", label: "누가복음" },
    { id: "nt04", g: "복음서", label: "요한복음" },
    { id: "nt05", g: "역사서", label: "사도행전" },
    { id: "nt06", g: "바울서신", label: "로마서" },
    { id: "nt07", g: "바울서신", label: "고린도전서", sub: "고린도후서" },
    { id: "nt08", g: "바울서신", label: "갈라디아서", sub: "에베소서 · 빌립보서 · 골로새서 · 데살로니가전서 · 데살로니가후서 · 디모데전서 · 디모데후서 · 디도서 · 빌레몬서" },
    { id: "nt09", g: "일반서신", label: "히브리서", sub: "야고보서 · 베드로전서 · 베드로후서 · 요한일서 · 요한이서 · 요한삼서 · 유다서" },
    { id: "nt10", g: "예언서", label: "요한계시록" },
  ],
};
const PILSA_ALL = PILSA_UNITS.ot.concat(PILSA_UNITS.nt);

const PILSA_STEPS = ["신청완료", "준비중", "준비완료", "배부완료"];
const PILSA_INFO = {
  "신청완료": { cls: "s1", ic: "📝", msg: "신청이 접수되었습니다. 준비에 <b>1주일 정도</b> 소요되며 <b>주일</b>에 전달해 드려요.<br>준비가 시작되기 전까지는 신청 내용을 고치거나 취소하실 수 있어요." },
  "준비중":   { cls: "s2", ic: "📦", msg: "노트를 준비하고 있습니다. 준비가 끝나면 돌아오는 <b>주일</b>에 전달해 드려요.<br>이 단계부터는 내용을 바꿀 수 없어요." },
  "준비완료": { cls: "s3", ic: "✅", msg: "노트가 준비되었습니다. 휴대폰으로도 알려드렸어요.<br>주일에 4층 새가족실에서 찾아가세요.<br>비용은 그때 내시면 됩니다." },
  "배부완료": { cls: "s4", ic: "🎁", msg: "노트를 받아 가셨습니다. 매일 한 구절씩 손으로 새겨 보세요." },
};

let pilsaForm = null;      // 작성 중인 신청 { type1, type2, qtys, memo }
let pilsaMine = null;      // 접수된 내 신청 { ...form, status, at }
let pilsaTab = "ot";       // 구약/신약 탭
let pilsaEditing = false;  // 접수된 신청을 고치는 중
let pilsaLoaded = false;   // 서버에서 내 신청을 불러왔는지


// 브라우저가 옛 js/api.js를 물고 있으면 필사 액션이 아예 없다 —
// "함수가 없습니다" 대신 새로고침을 안내한다.
function pilsaApiReady() { return !!(window.api && api.pilsaApply && api.pilsaMine); }

// 내 신청 한 건을 서버에서 가져온다(화면 진입 때 한 번)
async function pilsaLoadMine(u) {
  if (!pilsaApiReady()) { pilsaLoaded = true; return; }
  try {
    const r = await api.pilsaMine(u.user_id);
    pilsaMine = r.order || null;
    if (pilsaMine) pilsaForm = pilsaFormFrom(pilsaMine);
  } catch (_) {
    pilsaMine = null;          // 못 가져오면 새 신청 화면으로 — 저장할 때 다시 확인한다
  }
  pilsaLoaded = true;
}

// 접수된 신청 → 고치기 좋은 양식으로
function pilsaFormFrom(m) {
  return { size: m.size, type1: m.type1, type2: m.type2, phone: m.phone || "",
           qtys: Object.assign({}, m.qtys), memo: m.memo || "" };
}

// 서버가 「내 신청」 번호를 010-****-5678 로 가려서 줄 수 있다(Plan 5). 가려진 값은 이미 꼴이 맞으니
// 그대로 보여 주고, 아니면 평소대로 꼴을 맞춘다. 가려진 값을 pilsaPhoneFmt 에 넣으면 숫자만 남아 깨진다.
function pilsaPhoneMasked(v) { return String(v || "").includes("*"); }
function pilsaPhoneView(v) { return pilsaPhoneMasked(v) ? String(v) : pilsaPhoneFmt(v); }

function pilsaNewForm() { return { size: "", type1: "", type2: "", phone: "", qtys: {}, memo: "" }; }

// A5는 지면이 좁고 한영·영한은 두 언어를 같이 실어, 한 부가 두 권으로 나온다.
// (A5에서는 한영·영한을 못 고르므로 두 조건이 겹치는 일은 없다 — 배수는 최대 2)
function pilsaMult(f) {
  return (f.size === "A5" || PILSA_DUAL.indexOf(f.type2) >= 0) ? 2 : 1;
}
function pilsaMultWhy(f) {
  if (f.size === "A5") return "A5(작은 것)";
  if (PILSA_DUAL.indexOf(f.type2) >= 0) return "한영·영한";
  return "";
}
// 고른 부수 — 신청 상한(5부)은 이 값을 본다
function pilsaPicks(f) {
  return PILSA_ALL.reduce(function (a, u) { return a + (Number(f.qtys[u.id]) || 0); }, 0);
}
// 실제 만들어지는 권수 — 금액은 이 값을 본다
function pilsaTotal(f) {
  return pilsaPicks(f) * pilsaMult(f);
}
function pilsaPicked(f) {
  return PILSA_ALL.filter(function (u) { return (Number(f.qtys[u.id]) || 0) > 0; });
}
function pilsaUnitName(u) { return u.label + (u.sub ? " 외" : ""); }

// "화평 20목장" / "초등부 3학년" — 이름을 뺀 소속만(명단에 그대로 쓴다)
function pilsaAffil(u) {
  if (!u) return "";
  return u.type === "교구"
    ? [u.gu, u.mok ? u.mok + "목장" : ""].filter(Boolean).join(" ")
    : [u.bu, u.grade].filter(Boolean).join(" ");
}
// "화평 20목장 · 김세웅" / "초등부 3학년 · 김믿음"
function pilsaWho(u) {
  if (!u) return "";
  return [pilsaAffil(u), u.name].filter(Boolean).join(" · ");
}

function pilsaStepsHtml(cur) {
  const i = PILSA_STEPS.indexOf(cur);
  return '<div class="pl-steps">' + PILSA_STEPS.map(function (s, k) {
    return '<div class="pl-step ' + (k < i ? "done" : k === i ? "now" : "") +
           '"><i></i><span>' + s + '</span></div>';
  }).join("") + '</div>';
}

// ── 화면 맨 아래 동작 버튼 ────────────────────────────────────
// 취소는 접수된 신청이 있고 아직 '신청완료' 단계일 때만 나온다.
function pilsaActionsHtml(showForm) {
  const st = pilsaMine && pilsaMine.status;
  const editable = st === "신청완료";     // 이때만 성도가 고치거나 취소할 수 있다
  const finished = st === "배부완료";     // 받아 가셨으면 다시 신청할 수 있다
  const btns = [];
  if (showForm) {
    btns.push('<button class="pl-act go" id="pl-submit">' + (pilsaMine ? "수정 신청" : "신청") + '</button>');
  } else if (editable) {
    btns.push('<button class="pl-act go" id="pl-edit">수정하기</button>');
  } else if (finished) {
    btns.push('<button class="pl-act go" id="pl-new">새로 신청</button>');
  }
  if (editable) btns.push('<button class="pl-act danger" id="pl-cancel">취소</button>');
  btns.push('<button class="pl-act ghost" id="pl-exit">뒤로</button>');
  // 성경 31단위를 훑다 보면 화면이 길어진다 — 버튼은 늘 화면 아래에 못 박는다(.pl-acts.sticky)
  // ⚠️ 고칠 수 있을 때는 단추가 셋(수정하기·취소·뒤로)이라 좁은 폰에서 글자가 두 줄로 접힌다
  //    — 사역신청의 min-acts-3 과 같은 처리를 붙인다.
  return '<div class="pl-acts sticky' + (btns.length >= 3 ? " pl-acts-3" : "") + '">' +
    btns.join("") + '</div>';
}

function wirePilsaActions(u) {
  const ex = document.getElementById("pl-exit");
  if (ex) ex.addEventListener("click", function () {
    pilsaEditing = false;
    pilsaLoaded = false;        // 다시 들어오면 그동안 바뀐 상태를 새로 받는다
    renderSummary();
  });
  const sb = document.getElementById("pl-submit");
  if (sb) sb.addEventListener("click", function () { pilsaTrySubmit(u); });
  const ed = document.getElementById("pl-edit");
  if (ed) ed.addEventListener("click", function () {
    pilsaForm = pilsaFormFrom(pilsaMine);
    pilsaEditing = true;
    renderPilsaApply();
  });
  const nw = document.getElementById("pl-new");
  if (nw) nw.addEventListener("click", function () {
    pilsaMine = null;                 // 지난 신청은 끝났다 — 빈 양식으로 새로 시작
    pilsaForm = pilsaNewForm();
    pilsaEditing = false;
    pilsaTab = "ot";
    renderPilsaApply();
  });
  const cc = document.getElementById("pl-cancel");
  if (cc) cc.addEventListener("click", function () { askCancelPilsa(u); });
}

function pilsaTrySubmit(u) {
  const t = document.getElementById("pl-memo");
  if (t) pilsaForm.memo = t.value;
  const miss = [];
  if (!pilsaForm.size) miss.push("노트 크기");
  if (!pilsaForm.type1) miss.push("필사 유형");
  if (!pilsaForm.type2) miss.push("성경 번역본");
  if (!pilsaTotal(pilsaForm)) miss.push("성경 (부수를 1부 이상)");
  if (miss.length) { appAlert("다음을 골라 주세요.<br><b>" + miss.join(" · ") + "</b>"); return; }
  // 가려진 번호(수정 시 서버가 준 010-****-5678)는 못 고치니 빈 것으로 보고 다시 받는다(Plan 5)
  const ph = pilsaPhoneMasked(pilsaForm.phone) ? "" : (pilsaForm.phone || "").trim();
  if (!ph) {
    appAlert("휴대폰 번호를 적어 주세요.").then(function () {
      const el = document.getElementById("pl-phone");
      if (el) { el.classList.add("err"); el.focus(); }
    });
    return;
  }
  if (!pilsaPhoneOk(ph)) {
    appAlert("휴대폰 번호를 다시 확인해 주세요.<br><b>010-1234-5678</b> 꼴로 적어 주세요.").then(function () {
      const el = document.getElementById("pl-phone");
      if (el) { el.classList.add("err"); el.focus(); }
    });
    return;
  }
  renderPilsaConfirm(u);
}

// ── 신청 화면 ────────────────────────────────────────────────
function renderPilsaApply(keepScroll) {
  const u = loadUser();
  if (!u) { renderEntryScreen(); return; }
  // 서버에서 내 신청을 아직 못 가져왔으면 먼저 가져온다
  if (!pilsaLoaded) {
    document.getElementById("app").innerHTML =
      '<div class="pilsa-screen"><h2 class="rank-title">✍️ 성경필사 노트 신청</h2>' +
      '<p class="msg">신청 내용을 불러오는 중…</p></div>';
    window.scrollTo(0, 0);
    pilsaLoadMine(u).then(function () { renderPilsaApply(); });
    return;
  }
  if (!pilsaForm) pilsaForm = pilsaNewForm();
  const appEl = document.getElementById("app");
  const showForm = !pilsaMine || pilsaEditing;

  appEl.innerHTML =
    '<div class="pilsa-screen">' +
      '<h2 class="rank-title">✍️ 성경필사 노트 신청</h2>' +
      '<p class="pilsa-sub">준비가 끝나면 <b>휴대폰</b>으로 알려드립니다<br>' +
        '<b>4층 새가족실</b>에서 찾아가세요</p>' +
      (showForm ? pilsaFormHtml(u) : pilsaMineHtml(u)) +
      pilsaActionsHtml(showForm) +
    '</div>';

  window.scrollTo(0, keepScroll == null ? 0 : keepScroll);
  wirePilsaActions(u);
  if (showForm) wirePilsaForm(u);
}

function pilsaMineHtml(u) {
  const m = pilsaMine;
  const info = PILSA_INFO[m.status] || PILSA_INFO["신청완료"];
  return '<div class="pilsa-state ' + info.cls + '">' +
      '<div class="ps-top"><span class="ps-ic">' + info.ic + '</span>' +
      '<span class="ps-name">' + m.status + '</span></div>' +
      '<div class="ps-msg">' + info.msg + '</div></div>' +
    pilsaStepsHtml(m.status) +
    pilsaSummaryHtml(u, m) +
    (m.status === "신청완료" ? '' :
     m.status === "배부완료"
      ? '<div class="pl-help done">필사 노트가 더 필요하시면 <b>새로 신청</b>하실 수 있어요.</div>'
      : '<div class="pl-help lock">준비가 시작되어 변경할 수 없습니다.<br>' +
        '꼭 바꾸셔야 하면 <b>신앙운동팀</b>에 말씀해 주세요.</div>');
}

// 신청 내용 요약 — 확인 화면과 접수 뒤 화면이 함께 쓴다
function pilsaSummaryHtml(u, f) {
  const rows = pilsaPicked(f).map(function (x) {
    return '<div class="pc-row"><span>' + boardEsc(pilsaUnitName(x)) + '</span>' +
           '<b>' + f.qtys[x.id] + '부</b></div>';
  }).join("");
  return '<div class="pilsa-confirm">' +
      '<div class="pc-row"><span>신청자</span><b>' + boardEsc(pilsaWho(u)) + '</b></div>' +
      '<div class="pc-row"><span>노트 크기</span><b>' + boardEsc(f.size) + '</b></div>' +
      '<div class="pc-row"><span>필사 유형</span><b>' + boardEsc(f.type1) + '</b></div>' +
      '<div class="pc-row"><span>번역본</span><b>' + boardEsc(f.type2) + '</b></div>' +
      '<div class="pc-row"><span>휴대폰</span><b>' + boardEsc(pilsaPhoneView(f.phone) || "-") + '</b></div>' +
      (f.at ? '<div class="pc-row"><span>신청일</span><b>' + boardEsc(f.at) + '</b></div>' : '') +
    '</div>' +
    '<div class="pl-sec">성경 선택</div>' +
    '<div class="pilsa-confirm">' + rows +
      (pilsaMult(f) > 1
        ? '<div class="pc-row"><span>신청부수</span><b>' + pilsaPicks(f) + '부 × 2</b></div>'
        : '') +
      '<div class="pc-row total"><span>총 제작 권수</span><b>' + pilsaTotal(f) + '권</b></div>' +
    '</div>' +
    '<div class="pl-price">' +
      '<div class="pp-row"><span>예상 금액 <i>(권당 ' + PILSA_PRICE.toLocaleString("ko-KR") + '원)</i></span>' +
      '<b>' + pilsaWon(pilsaTotal(f)) + '</b></div>' +
      '<div class="pp-note">' +
      (pilsaMult(f) > 1
        ? '<b>' + pilsaMultWhy(f) + '</b>은 한 부가 <b>2권</b>이라 2배로 계산했습니다.<br>'
        : '') +
      '말씀 길이에 따라 한 단위가 여러 권으로 나올 수 있어, 실제 권수와 금액은 달라질 수 있습니다.<br>' +
      '<b>비용은 노트를 찾으실 때 내시면 됩니다.</b></div>' +
    '</div>' +
    (f.memo ? '<div class="pl-memo"><b>💬 요청사항</b><br>' + boardEsc(f.memo) + '</div>' : '');
}

// 고른 성경 요약 — ＋/− 때 이 부분만 갈아 끼운다
function pilsaSumInner(f) {
  const picked = pilsaPicked(f);
  if (!picked.length) return '<span class="none">아직 고르신 성경이 없습니다.</span>';
  const n = pilsaTotal(f);
  const mult = pilsaMult(f);
  return '<b>✅ ' + picked.length + '종 · ' +
    (mult > 1 ? '신청 ' + pilsaPicks(f) + '부 → ' : '') +
    '총 ' + n + '권 · ' + pilsaWon(n) + '</b><br><span>' +
    picked.map(function (x) { return boardEsc(pilsaUnitName(x)) + " " + f.qtys[x.id] + "부"; }).join(" · ") +
    '</span>';
}

function pilsaFormHtml(u) {
  const f = pilsaForm;
  const left = PILSA_TOTAL_MAX - pilsaPicks(f);
  const mult = pilsaMult(f);

  const sz = PILSA_SIZE.map(function (t) {
    const why = pilsaSizeOff(t[0]);
    return '<button class="pl-type' + (f.size === t[0] ? " on" : "") + '" data-size="' + t[0] + '"' +
      (why ? " disabled" : "") + '><b>' + t[0] + '</b><i>' +
      (why ? why : t[1]) + '</i></button>';
  }).join("");
  const t1 = PILSA_TYPE1.map(function (t) {
    const off = pilsaBlocked(f.size, t[0]);
    return '<button class="pl-type' + (f.type1 === t[0] ? " on" : "") + '" data-t1="' + t[0] + '"' +
      (off ? " disabled" : "") + '><b>' + t[0] + '</b><i>' +
      (off ? "A5에는 만들지 않아요" : t[1]) + '</i></button>';
  }).join("");
  const t2 = PILSA_TYPE2.map(function (t) {
    const off = pilsaT2Blocked(f, t);
    return '<button data-t2="' + t + '" class="' + (f.type2 === t ? "on" : "") + '"' +
      (off ? " disabled" : "") + '>' + t + '</button>';
  }).join("");

  let rows = "", lastG = null;
  PILSA_UNITS[pilsaTab].forEach(function (x) {
    if (x.g !== lastG) { rows += '<div class="pl-genre">' + x.g + '</div>'; lastG = x.g; }
    const q = Number(f.qtys[x.id]) || 0;
    rows +=
      '<div class="pl-unit">' +
        '<div class="pl-un"><b>' + boardEsc(x.label) + '</b>' +
          (x.sub ? '<i>+ ' + boardEsc(x.sub) + '</i>' : '') + '</div>' +
        '<div class="pl-ctl">' +
          '<button class="pl-mn" data-minus="' + x.id + '"' + (q ? "" : " disabled") + '>−</button>' +
          '<span class="pl-num' + (q ? " has" : "") + '">' + q + '</span>' +
          '<button class="pl-pl' + (left > 0 ? "" : " off") + '" data-plus="' + x.id + '">＋</button>' +
        '</div>' +
      '</div>';
  });

  return '<div class="pl-sec">필사 옵션</div>' +
    '<div class="pilsa-box">' +
      '<div class="pl-label">노트 크기</div>' +
      '<div class="pl-types" id="pl-size">' + sz + '</div>' +
      '<div class="pl-label" style="margin-top:14px">필사 유형</div>' +
      '<div class="pl-types" id="pl-t1">' + t1 + '</div>' +
      (f.size === "A5" ? '<div class="pl-note">A5는 <b>아래쪽 필사형</b>으로만 제작됩니다</div>' : '') +
      '<div class="pl-label" style="margin-top:14px">성경 번역본</div>' +
      '<div class="rank-filter pl-chips" id="pl-t2">' + t2 + '</div>' +
      (pilsaDualOff(f)
        ? '<div class="pl-note">한영·영한은 <b>A4 + 오른쪽 필사형</b>에서만 만들 수 있어요</div>'
        : '') +
    '</div>' +

    '<div class="pl-sec">성경 선택 및 부수</div>' +
    '<div class="pl-notice">신청 단위별로 부수를 골라 주세요. 묶음 항목은 함께 제작되는 한 권입니다.<br>' +
      // A5는 지금 못 고른다 — 이미 A5로 신청하신 분에게만 그대로 알려 준다
      (f.size === "A5"
        ? '<b>A5(작은 것)</b>와 <b>한영·영한</b>은 한 부가 <b>2권</b>으로 나와 권수와 금액이 2배가 됩니다.<br>'
        : '<b>한영·영한</b>은 한 부가 <b>2권</b>으로 나와 권수와 금액이 2배가 됩니다.<br>') +
      '말씀이 길면 <b>한 단위가 여러 권</b>으로 나올 수 있어 권수는 늘거나 줄 수 있습니다.<br>' +
      '<b>권당 3,000원</b> · ' +
      '<b>한 분당 총 ' + PILSA_TOTAL_MAX + '부까지</b> 신청하실 수 있어요' +
      '<span class="pl-left">' + (left > 0 ? " (앞으로 " + left + "부)" : " — 상한에 닿았습니다") + '</span></div>' +
    (mult > 1
      ? '<div class="pl-note x2">지금 고르신 <b>' + pilsaMultWhy(f) + '</b>은 한 부가 <b>2권</b>입니다 — ' +
        '아래에서 고르신 부수의 <b>2배</b>로 만들어지고, 금액도 2배로 계산됩니다.</div>'
      : '') +
    '<div class="rank-filter pl-tab" id="pl-tab">' +
      '<button data-tab="ot" class="' + (pilsaTab === "ot" ? "on" : "") + '">구약</button>' +
      '<button data-tab="nt" class="' + (pilsaTab === "nt" ? "on" : "") + '">신약</button>' +
    '</div>' +
    '<div class="pl-units">' + rows + '</div>' +
    '<div class="pl-sum2">' + pilsaSumInner(f) + '</div>' +

    '<div class="pl-sec">휴대폰 번호 <span class="req">필수</span></div>' +
    // 가려진 번호(010-****-5678)는 고칠 수 없으니 칸을 비워 다시 받는다 — 본인도 옛 번호를 보지 않는다(Plan 5).
    '<input type="tel" id="pl-phone" class="pl-memo-in pl-phone" inputmode="numeric" ' +
      'maxlength="13" placeholder="010-1234-5678" value="' + boardEsc(pilsaPhoneMasked(f.phone) ? "" : pilsaPhoneFmt(f.phone)) + '">' +
    '<div class="pl-hint">노트가 준비되면 이 번호로 알려드립니다' +
      (pilsaPhoneMasked(f.phone) ? ' <b>(번호를 다시 넣어 주세요)</b>' : '') + '</div>' +
    '<div class="pl-sec">요청사항 <span class="opt">선택</span></div>' +
    '<textarea id="pl-memo" class="pl-memo-in" rows="3" maxlength="300" ' +
      'placeholder="수량 조정, 그 밖에 요청하실 내용을 적어 주세요.">' + boardEsc(f.memo) + '</textarea>';
}

// ＋/− 는 화면을 다시 그리지 않는다 — 다시 그리면 보고 있던 자리를 잃는다.
// 숫자·잠금·요약·남은 부수만 제자리에서 갱신한다.
function pilsaRefreshCounts() {
  const f = pilsaForm;
  const left = PILSA_TOTAL_MAX - pilsaPicks(f);
  document.querySelectorAll(".pl-unit").forEach(function (row) {
    const plus = row.querySelector("[data-plus]");
    const minus = row.querySelector("[data-minus]");
    const num = row.querySelector(".pl-num");
    if (!plus || !num) return;
    const q = Number(f.qtys[plus.dataset.plus]) || 0;
    num.textContent = q;
    num.classList.toggle("has", q > 0);
    plus.classList.toggle("off", left <= 0);   // 잠그지 않는다 — 눌러 보면 이유를 알려 준다
    if (minus) minus.disabled = q <= 0;
  });
  const lf = document.querySelector(".pl-left");
  if (lf) lf.textContent = left > 0 ? " (앞으로 " + left + "부)" : " — 상한에 닿았습니다";
  const sum = document.querySelector(".pl-sum2");
  if (sum) sum.innerHTML = pilsaSumInner(f);
}

function wirePilsaForm(u) {
  const appEl = document.getElementById("app");
  const keepMemo = function () {
    const t = document.getElementById("pl-memo");
    if (t) pilsaForm.memo = t.value;
    const ph = document.getElementById("pl-phone");
    if (ph) pilsaForm.phone = ph.value;
  };
  appEl.querySelectorAll("[data-size]").forEach(function (b) {
    b.addEventListener("click", function () {
      keepMemo();
      pilsaForm.size = b.dataset.size;
      if (pilsaBlocked(pilsaForm.size, pilsaForm.type1)) pilsaForm.type1 = "";
      if (pilsaT2Blocked(pilsaForm, pilsaForm.type2)) pilsaForm.type2 = "";
      renderPilsaApply(window.scrollY);
    });
  });
  appEl.querySelectorAll("[data-t1]").forEach(function (b) {
    b.addEventListener("click", function () {
      keepMemo();
      pilsaForm.type1 = b.dataset.t1;
      if (pilsaT2Blocked(pilsaForm, pilsaForm.type2)) pilsaForm.type2 = "";
      renderPilsaApply(window.scrollY);
    });
  });
  appEl.querySelectorAll("[data-t2]").forEach(function (b) {
    b.addEventListener("click", function () {
      keepMemo(); pilsaForm.type2 = b.dataset.t2; renderPilsaApply(window.scrollY);
    });
  });
  document.getElementById("pl-tab").querySelectorAll("button").forEach(function (b) {
    b.addEventListener("click", function () {
      keepMemo(); pilsaTab = b.dataset.tab; renderPilsaApply(window.scrollY);
    });
  });
  appEl.querySelectorAll("[data-plus]").forEach(function (b) {
    b.addEventListener("click", function () {
      if (pilsaPicks(pilsaForm) >= PILSA_TOTAL_MAX) {
        appAlert("한 분당 <b>총 " + PILSA_TOTAL_MAX + "부까지</b> 신청하실 수 있습니다.<br><br>" +
          "다른 성경을 고르시려면 먼저 <b>−</b>로 부수를 줄여 주세요.<br>" +
          "더 필요하시면 <b>신앙운동팀</b>에 말씀해 주세요.", "🙏 신청 부수 안내");
        return;
      }
      const id = b.dataset.plus;
      pilsaForm.qtys[id] = (Number(pilsaForm.qtys[id]) || 0) + 1;
      pilsaRefreshCounts();
    });
  });
  appEl.querySelectorAll("[data-minus]").forEach(function (b) {
    b.addEventListener("click", function () {
      const id = b.dataset.minus;
      pilsaForm.qtys[id] = Math.max(0, (Number(pilsaForm.qtys[id]) || 0) - 1);
      pilsaRefreshCounts();
    });
  });
  const memo = document.getElementById("pl-memo");
  if (memo) memo.addEventListener("input", function () { pilsaForm.memo = memo.value; });
  const phone = document.getElementById("pl-phone");
  if (phone) phone.addEventListener("input", function () {
    phone.value = pilsaPhoneFmt(phone.value);      // 010-1234-5678 꼴로 자동 정리
    pilsaForm.phone = phone.value;
  });
}

// ── 확인 화면 ────────────────────────────────────────────────
function renderPilsaConfirm(u) {
  const appEl = document.getElementById("app");
  appEl.innerHTML =
    '<div class="pilsa-screen">' +
      '<h2 class="rank-title">📋 신청 내용 확인</h2>' +
      '<p class="pilsa-sub">아래 내용이 맞으면 ' + (pilsaMine ? "수정 신청" : "신청") + '을 눌러 주세요<br>' +
        '<span class="nb"><b>1주일 정도</b> 소요되며 <b>주일</b>에 전달해 드립니다</span></p>' +
      pilsaSummaryHtml(u, pilsaForm) +
      // 확인하지 않고 화면을 떠나는 일이 없게, 버튼을 아래에 붙여 둔다
      '<div class="pl-acts sticky">' +
        '<button class="pl-act go" id="pl-ok">' + (pilsaMine ? "수정 신청" : "신청") + '</button>' +
        '<button class="pl-act ghost" id="pl-again">뒤로</button>' +
      '</div>' +
    '</div>';
  window.scrollTo(0, 0);
  document.getElementById("pl-again").addEventListener("click", function () { renderPilsaApply(); });
  document.getElementById("pl-ok").addEventListener("click", function () { submitPilsa(u); });
}

async function askCancelPilsa(u) {
  const ok = await appConfirm(
    "신청하신 <b>필사 노트 " + pilsaTotal(pilsaMine) + "권</b>을 취소할까요?<br><br>언제든 다시 신청하실 수 있어요.",
    // 두 버튼이 모두 '취소'로 보이면 어느 쪽이 무엇인지 알 수 없다
    { title: "🗑 신청 취소", okText: "신청 취소", cancelText: "돌아가기", danger: true });
  if (!ok) return;
  if (pilsaMine && pilsaMine.id) {
    try {
      await api.pilsaCancel(u.user_id, pilsaMine.id);
    } catch (e) {
      await appAlert("취소하지 못했습니다.<br>" + boardEsc(e && e.message ? e.message : e));
      return;
    }
  }
  pilsaMine = null;
  pilsaEditing = false;
  pilsaForm = pilsaNewForm();
  await appAlert("신청이 취소되었습니다.");
  renderPilsaApply();
}

// 신청이든 수정이든 성도가 알아야 할 내용은 같다 — 한곳에서 만든다
function pilsaDoneMsg(n) {
  return "필사 노트 <b>" + n + "권</b>을 신청했습니다.<br><br>" +
    "준비에 <b>1주일 정도</b> 소요되며 <b>주일</b>에 전달해 드립니다.<br>" +
    "준비가 끝나면 휴대폰으로 알려드릴게요.";
}

async function submitPilsa(u) {
  const edit = !!pilsaMine;                 // 저장하면 pilsaMine이 바뀌니 먼저 잡아 둔다
  const label = edit ? "수정 신청" : "신청";
  const btn = document.getElementById("pl-ok");
  if (btn) { btn.disabled = true; btn.textContent = "처리 중…"; }
  if (!pilsaApiReady()) {
    if (btn) { btn.disabled = false; btn.textContent = label; }
    await appAlert("앱이 옛 버전이라 신청을 보낼 수 없습니다.<br>새로고침한 뒤 다시 신청해 주세요.");
    return;
  }
  try {
    const r = await api.pilsaApply({
      user_id: u.user_id,
      name: u.name,
      who: pilsaAffil(u),
      phone: pilsaForm.phone,
      size: pilsaForm.size, type1: pilsaForm.type1, type2: pilsaForm.type2,
      qtys: pilsaForm.qtys, memo: pilsaForm.memo,
    });
    pilsaMine = r.order;
    pilsaForm = pilsaFormFrom(pilsaMine);
    pilsaEditing = false;
    await appAlert(pilsaDoneMsg(pilsaMine.total), edit ? "✅ 수정 완료" : "✅ 신청 완료");
    renderPilsaApply();
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = label; }
    await appAlert("신청을 저장하지 못했습니다.<br>" + boardEsc(e && e.message ? e.message : e));
  }
}
