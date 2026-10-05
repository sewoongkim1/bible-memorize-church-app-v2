// 🎓 교육 — 강좌 목록·자세히·신청·내 강좌(2026-10-05 · 설계 docs/superpowers/specs/2026-10-05-education-courses-design.md §7)
//   ⚠️ 정원·대기·취소 마감은 서버(SQL 함수)가 정한다 — 화면은 받은 값을 보여 주기만 한다(다시 계산하지 않는다).
//   ⚠️ 문(eduVisible — app.js)은 첫 화면 단추를 숨기는 것뿐, 막는 것은 서버(eduApply 의 not-open)다.

// ── 교육 순수 함수 (여기부터) ──
function eduMd(d) {   // 날짜 없음·틀린 값은 빈 글(NaN월 NaN일 이 화면에 나가지 않게)
  if (!d || !/^\d{4}-\d{2}-\d{2}/.test(String(d))) return '';
  var t = new Date(String(d).slice(0, 10) + 'T00:00:00Z'); if (isNaN(t.getTime())) return '';
  return (t.getUTCMonth() + 1) + '월 ' + t.getUTCDate() + '일';
}
function eduMdw(d) {   // 10월 9일(금) — 날짜만 있는 값(KST 달력날)이라 UTC 자정으로 읽어 요일이 밀리지 않는다
  var m = eduMd(d); if (!m) return '';
  return m + '(' + '일월화수목금토'.charAt(new Date(String(d).slice(0, 10) + 'T00:00:00Z').getUTCDay()) + ')';
}
function eduYmdw(d) {   // 2027년 3월 3일(수) — 교육 기간 한 줄(연도가 있어야 해를 넘기는 기간이 헷갈리지 않는다)
  var m = eduMdw(d); return m ? String(d).slice(0, 4).replace(/^0+/, '') + '년 ' + m : '';
}
function eduRangeEnd(a, b) {   // 같은 해면 연도를 줄인다: 5월 19일(수) · 해가 다르면 2028년 1월 5일(수)
  return String(a).slice(0, 4) === String(b).slice(0, 4) ? eduMdw(b) : eduYmdw(b);
}
function eduWhenLine(c) {   // 📅 언제 — 서버가 고른 firstDate·lastDate(교육 기간이 있으면 그것 · 뒤집힌 기간은 끝이 비어 온다) + 회차 수. 화면은 다시 고르지 않는다
  if (!c) return '';
  var n = c.sessionsCount ? c.sessionsCount + '회' : '', a = eduYmdw(c.firstDate);
  if (!a) return n;
  var b = c.lastDate && c.lastDate !== c.firstDate ? eduRangeEnd(c.firstDate, c.lastDate) : '';
  return a + (b ? ' ~ ' + b : '') + (n ? ' · ' + n : '');
}
function eduPhaseChip(phase) {   // 자세히 화면 머리 칩 — 숫자는 싣지 않는다(정원은 「자리·신청」 칸 한 곳에만)
  return { open: '모집 중', upcoming: '곧 열려요', closed: '모집 끝', running: '진행 중' }[phase] || '';
}
// 「자리·신청」 칸 — 신청 전(설계 §4 ①~⑦ · 문 닫힘). 서버가 준 값을 고르기만 한다(남은 자리는 뺄셈뿐).
function eduSeatView(c, gateOpen) {
  var off = function (head, sub) { return { off: true, head: head, sub: sub || '', how: '', btn: null, ask: null }; };
  var TALK = '함께하고 싶으시면 담당자에게 말씀해 주세요';
  if (c.phase === 'upcoming') return off(eduMdw(c.applyFrom) ? eduMdw(c.applyFrom) + '부터 신청할 수 있어요' : '곧 신청을 받아요', '그때 다시 열어 주세요');
  if (c.phase !== 'open') return off('신청을 마감했어요', TALK);
  if (gateOpen === false) return off('아직 신청을 받지 않아요', '');
  var until = eduMdw(c.applyTo) ? eduMdw(c.applyTo) + '까지 신청' : '';
  var join = function (a) { return a.filter(Boolean).join(' · '); };
  var NOW = '누르시면 바로 확정돼요. 첫 시간 전날까지 앱에서 취소할 수 있어요.';
  var on = function (head, sub, how, btn, ask) { return { off: false, head: head, sub: sub, how: how, btn: btn, ask: ask }; };
  var askNow = { title: '🎓 신청할까요?', line: '선착순이라 누르시면 바로 확정돼요.', ok: '신청하기' };
  if (c.mode === 'approve') {   // edu_apply 는 approve 면 정원과 상관없이 applied — 「남은 자리」는 확정된 분만 세어 많아 보이므로 정원만
    return on(c.capacity == null ? '인원 제한 없이 받아요' : '정원 ' + c.capacity + '명', join([until, '담당자 확정']),
      '신청하시면 담당자가 확인한 뒤 확정해요.', '신청하기', { title: '🎓 신청할까요?', line: '담당자가 확인한 뒤 확정해요.', ok: '신청하기' });
  }
  if (c.capacity == null) return on('인원 제한 없이 받아요', until, NOW, '신청하기', askNow);
  var left = c.capacity - (c.confirmed || 0);
  if (left > 0) return on(left + '자리 남았어요', join([until, '선착순']), NOW, '신청하기', askNow);
  if (c.waitlist) {
    return on('정원이 찼어요', join([c.waitlisted ? '지금 대기 ' + c.waitlisted + '분' : '', until]),
      '대기로 신청하시면 자리가 날 때 순서대로 확정돼요.', '대기 신청하기', { title: '🎓 대기로 신청할까요?', line: '자리가 나면 순서대로 확정돼요.', ok: '대기 신청하기' });
  }
  return off('정원이 찼어요', TALK);   // ⑤ — 눌러도 「정원이 찼어요」만 나올 단추는 두지 않는다
}
// 「자리·신청」 칸 — 신청 뒤(설계 §4 ⑧~⑫). 장소 줄은 그리는 쪽이 붙인다(강좌 값).
function eduMineView(m) {
  if (!m) return null;
  if (m.status === 'declined') {   // 성도님 화면에 「반려」를 쓰지 않는다(친구 2026-10-05) — 「반려 유지」는 서버가 지킨다
    return { tone: 'soft', head: '이번 신청은 확정되지 않았어요', lines: ['궁금하시면 담당자에게 말씀해 주세요.'], cancelLine: '', cancelBtn: null, cancelAsk: '' };
  }
  var V = { confirmed: ['ok', '✅ 확정됐어요', []],
    applied: ['on', '📝 신청했어요', ['담당자가 확인하고 있어요. 확정되면 「내 강좌」에 「확정」으로 바뀌어요.']],
    waitlisted: ['on', '⏳ 대기 ' + (m.waitNo || 1) + '번이에요', ['자리가 나면 순서대로 확정돼요.']] }[m.status];
  if (!V) return null;
  var lines = V[2].slice(), ns = m.nextSession;
  if (m.status === 'confirmed' && ns && eduMdw(ns.date)) lines.push((ns.no === 1 ? '첫 시간' : '다음 시간') + ' · ' + eduMdw(ns.date) + (ns.start ? ' ' + ns.start : ''));
  var wait = m.status === 'waitlisted';
  return { tone: V[0], head: V[1], lines: lines,
    cancelLine: m.canCancel ? (eduMdw(m.cancelUntil) ? eduMdw(m.cancelUntil) + '까지' : '첫 시간 전날까지') + ' 앱에서 취소할 수 있어요.' : '시작한 뒤에는 취소를 담당자에게 말씀해 주세요.',
    cancelBtn: m.canCancel ? (wait ? '대기 취소' : '신청 취소') : null,
    cancelAsk: wait ? '대기를 취소할까요?' : '신청을 취소할까요?' };
}
function eduPhaseLabel(c) {
  if (c.phase === 'upcoming') return c.applyFrom ? eduMd(c.applyFrom) + '부터 신청' : '곧 신청을 받아요';
  if (c.phase === 'closed') return '모집 끝';
  if (c.phase === 'running') return '진행 중';
  if (c.capacity == null) return '모집 중';
  if (c.confirmed >= c.capacity) return c.waitlist ? '모집 중 · 정원 참 · 대기 ' + (c.waitlisted || 0) : '정원 참';
  return '모집 중 · ' + c.confirmed + '/' + c.capacity;
}
function eduStatusLine(m) { return m.status === 'waitlisted' ? '대기 ' + (m.waitNo || 1) + '번' : m.statusLabel; }
function eduErrText(code) {
  var W = { 'full': '정원이 찼어요.', 'too-late': '시작한 뒤에는 앱에서 취소할 수 없어요. 담당자에게 말씀해 주세요.',
    'not-open': '아직 신청을 받지 않아요.', 'not-yet': '아직 신청 기간이 아니에요.', 'closed-period': '신청 기간이 지났어요.',
    'not-found': '강좌를 찾을 수 없어요.', 'no-user': '로그인한 뒤에 신청할 수 있어요.',
    'not-active': '이미 처리된 신청이에요.' };   // 담당자가 먼저 취소·반려했다(edu_cancel) — 화면을 지금 상태로 다시 그린다
  return W[code] || '잠시 뒤 다시 해 주세요.';
}
// 화면 글자 이스케이프 — 제 것을 쓴다(boardEsc 가 없으면 날 글자가 나가던 것 · 최종 검토 2026-10-05)
var EDU_ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function eduEsc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) { return EDU_ESC[ch]; }); }
// ── 교육 순수 함수 (여기까지) ──

var eduState = { list: null, mine: [], open: true, tab: 'open', screen: 0 };   // screen: 화면이 바뀔 때마다 올라가는 번호 — 늦게 온 응답이 다른 화면을 덮지 않게

function renderEduList(tab) {
  var u = loadUser();
  if (!u) { renderEntryScreen(); return; }
  if (typeof logFeature === 'function') logFeature('edu', 0);
  var el = document.getElementById('app');
  el.innerHTML = '<div class="edu-wrap"><div class="ev-loading">불러오는 중…</div></div>' +
    '<button class="home-fab" id="edu-home" aria-label="첫 화면으로">' + homeFabLabel(u, true) + '</button>';
  window.scrollTo(0, 0);
  document.getElementById('edu-home').addEventListener('click', function () { renderSummary(); });
  var my = ++eduState.screen;
  api.eduList(u.user_id || '').then(function (r) {
    if (my !== eduState.screen) return;
    eduState.list = r.courses || []; eduState.mine = r.mine || []; eduState.open = r.open !== false;   // 서버가 문(eduOpen·시험 참여자)을 알려 준다
    eduDrawList(tab || (eduState.mine.length ? 'mine' : 'open'));
  }).catch(function () {
    if (my !== eduState.screen) return;
    var w = document.querySelector('.edu-wrap');
    if (w) w.innerHTML = '<p class="edu-empty">지금 불러올 수 없어요. 잠시 뒤 다시 열어 주세요.</p>';
  });
}

function eduDrawList(tab) {
  var w = document.querySelector('.edu-wrap'); if (!w) return;
  eduState.tab = tab;
  var open = eduState.list.filter(function (c) { return c.phase === 'open'; });
  var soon = eduState.list.filter(function (c) { return c.phase === 'upcoming'; });
  var tabs = [['open', '모집 중'], ['soon', '곧 열려요'], ['mine', '내 강좌']];
  var head = '<h2 class="edu-title">🎓 교육</h2><div class="edu-tabs">' + tabs.map(function (t) {
    return '<button class="edu-tab' + (t[0] === tab ? ' on' : '') + '" data-tab="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div>';
  var body;
  if (tab === 'mine') {
    body = eduState.mine.length ? eduState.mine.map(function (m, i) {
      return '<div class="edu-card" data-i="' + i + '"><span class="edu-k">' + eduEsc(eduStatusLine(m)) + '</span>' +
        '<b>' + eduEsc(m.title) + '</b><span>' + eduEsc(m.term) + '</span>' +
        (m.nextSession ? '<span>다음 시간 · ' + eduEsc(eduMdw(m.nextSession.date)) + (m.nextSession.start ? ' ' + eduEsc(m.nextSession.start) : '') + '</span>' : '') +
        '</div>'; }).join('') : '<p class="edu-empty">아직 신청한 강좌가 없어요.</p>';
  } else {
    var list = tab === 'soon' ? soon : open;
    body = list.length ? list.map(function (c, i) {
      return '<div class="edu-card" data-i="' + i + '"><span class="edu-k">' + eduEsc(c.kindLabel) + '</span>' +
        '<b>' + eduEsc(c.title) + (c.term ? ' <small>(' + eduEsc(c.term) + ')</small>' : '') + '</b>' +
        (c.firstDate ? '<span>' + eduEsc(eduMd(c.firstDate)) + (c.lastDate && c.lastDate !== c.firstDate ? ' ~ ' + eduEsc(eduMd(c.lastDate)) : '') + (c.sessionsCount ? ' · ' + c.sessionsCount + '회' : '') + '</span>' : '') +
        '<span>' + eduEsc(eduPhaseLabel(c)) + (c.mode === 'approve' ? ' · 담당자 확정' : '') + '</span></div>'; }).join('')
      : '<p class="edu-empty">' + (tab === 'soon' ? '곧 열릴 강좌가 없어요.' : '지금 모집 중인 강좌가 없어요.') + '</p>';
  }
  var door = (!eduState.open && tab !== 'mine') ? '<p class="edu-empty">' + eduErrText('not-open') + '</p>' : '';
  w.innerHTML = head + door + '<div class="edu-list">' + body + '</div>';
  w.querySelectorAll('.edu-tab').forEach(function (b) { b.addEventListener('click', function () { eduDrawList(b.dataset.tab); }); });
  var rows = tab === 'mine' ? eduState.mine : (tab === 'soon' ? soon : open);   // 강좌 번호는 화면 글자(data-*)에 싣지 않고 이 배열에서 꺼낸다
  w.querySelectorAll('.edu-card').forEach(function (c) { c.addEventListener('click', function () {
    var row = rows[Number(c.dataset.i)]; if (row) renderEduCourse(tab === 'mine' ? row.courseId : row.id);
  }); });
}

// 강좌 자세히(설계 docs/superpowers/specs/2026-10-05-edu-course-detail-redesign-design.md — A안 한눈에 카드)
//   opt.focus: 다시 그린 뒤 「자리·신청」 칸을 화면 가운데로(신청·취소 뒤 — 알림 창 대신 결과를 그 자리에서 보여 준다)
//   opt.note: 그 칸 위 회색 한 줄(「취소했어요.」)
function renderEduCourse(id, opt) {
  opt = opt || {};
  var u = loadUser(); if (!u) { renderEntryScreen(); return; }
  var el = document.getElementById('app');
  el.innerHTML = '<div class="edu-wrap"><div class="ev-loading">불러오는 중…</div></div>' +
    '<button class="home-fab" id="edu-home" aria-label="첫 화면으로">' + homeFabLabel(u, true) + '</button>';
  window.scrollTo(0, 0);
  document.getElementById('edu-home').addEventListener('click', function () { renderSummary(); });
  var my = ++eduState.screen;
  api.eduCourse(id, u.user_id || '').then(function (r) {
    if (my !== eduState.screen) return;
    var w = document.querySelector('.edu-wrap'); if (!w) return;
    if (!r || !r.ok) { w.innerHTML = '<p class="edu-empty">' + eduEsc(eduErrText(r && r.error)) + '</p>'; return; }
    var c = r.course, m = r.mine, mv = eduMineView(m), sv = mv ? null : eduSeatView(c, eduState.open);
    var chip = eduPhaseChip(c.phase);
    var chips = '<div class="edu-chips"><span class="edu-chip">' + eduEsc(c.kindLabel) + '</span>' +
      (chip ? '<span class="edu-chip' + (c.phase === 'open' ? ' on' : '') + '">' + eduEsc(chip) + '</span>' : '') + '</div>';
    var gl = [['📅', '언제', eduWhenLine(c)], ['📍', '어디서', c.place], ['🙋', '대상', c.target],
      ['📚', '먼저 들으실 과정', c.prereq && c.prereq.length ? c.prereq.join(', ') : ''], ['👤', '강사', c.teacher], ['📘', '교재비', c.fee]]
      .filter(function (x) { return x[2]; })
      .map(function (x) {
        var v = x[1] === '언제'   // 날짜 덩이가 중간에서 안 끊기게(「12월 / 13일」) — 줄은 덩이 사이(~ ·)에서만 바꾼다
          ? x[2].split(' ~ ').map(function (a) { return a.split(' · ').map(function (b) { return '<span class="edu-nw">' + eduEsc(b) + '</span>'; }).join(' · '); }).join(' ~ ')
          : eduEsc(x[2]);
        return '<div class="edu-gl"><span class="edu-gl-i" aria-hidden="true">' + x[0] + '</span><span class="edu-gl-k">' + x[1] + '</span><span class="edu-gl-v">' + v + '</span></div>'; }).join('');
    var act;
    if (mv) {
      var lines = mv.lines.concat(m.status === 'confirmed' && c.place ? [c.place] : []);
      act = '<div class="edu-state ' + mv.tone + '"><b>' + eduEsc(mv.head) + '</b>' + lines.map(function (t) { return '<span>' + eduEsc(t) + '</span>'; }).join('') + '</div>' +
        (mv.cancelLine ? '<p class="edu-how">' + eduEsc(mv.cancelLine) + '</p>' : '') +
        (mv.cancelBtn ? '<button class="edu-btn ghost danger" id="edu-cancel">' + eduEsc(mv.cancelBtn) + '</button>' : '');
    } else {
      act = '<div class="edu-seat' + (sv.off ? ' off' : '') + '"><b>' + eduEsc(sv.head) + '</b>' + (sv.sub ? '<span>' + eduEsc(sv.sub) + '</span>' : '') + '</div>' +
        (sv.how ? '<p class="edu-how">' + eduEsc(sv.how) + '</p>' : '') +
        (sv.btn ? '<button class="edu-btn" id="edu-apply">' + eduEsc(sv.btn) + '</button>' : '');
    }
    act = '<div class="edu-act" id="edu-act">' + (opt.note ? '<p class="edu-note">' + eduEsc(opt.note) + '</p>' : '') + act +
      '<p class="edu-msg" id="edu-msg" role="status"></p></div>';
    var ss = c.sessions || [], shown = ss.length <= 4 ? ss.length : 2;   // 4회까지는 다 · 5회부터는 2회 + 「더 보기」
    // 일정·수료 기준도 「📝 강좌 소개」와 같은 카드로(친구 2026-10-05 「일정도 박스로 구분」) — 회차마다 한 줄 · 줄 사이 점선
    var sessLi = function (s) {
      return '<div class="edu-ss"><span class="edu-ss-n">' + s.no + '회</span><div class="edu-ss-b"><b>' + eduEsc(eduMdw(s.date)) + (s.start ? ' ' + eduEsc(s.start) : '') + '</b>' +
        (s.topic ? '<span>' + eduEsc(s.topic) + '</span>' : '') +
        (s.place && s.place !== c.place ? '<span class="edu-ss-p">' + eduEsc(s.place) + '</span>' : '') + '</div></div>'; };
    var sess = ss.length ? '<div class="edu-about edu-sched"><div class="edu-about-h">🗓️ 일정 ' + ss.length + '회</div><div id="edu-sess">' + ss.slice(0, shown).map(sessLi).join('') + '</div>' +
      (ss.length > shown ? '<button class="edu-more" id="edu-more">＋ ' + (ss.length - shown) + '회 더 보기</button>' : '') + '</div>' : '';
    var rule = '출석 ' + c.attendPct + '% 이상' + (c.checkLabel ? ' + ' + c.checkLabel + ' 확인' : '');
    // 위 한 줄 — 왼쪽 칩 · 오른쪽 「← 교육」(암송·복습 화면 .test-top 과 같은 꼴 · 같은 .back-btn — 친구 2026-10-05)
    w.innerHTML = '<div class="edu-top">' + chips + '<button class="back-btn" id="edu-back">← 교육</button></div>' +
      '<h2 class="edu-title">' + eduEsc(c.title) + '</h2>' + (c.term ? '<div class="edu-sub">' + eduEsc(c.term) + '</div>' : '') +
      (c.description ? '<div class="edu-about"><div class="edu-about-h">📝 강좌 소개</div><p class="edu-desc">' + eduEsc(c.description) + '</p></div>' : '') +   // 담당자가 쓴 글 — 한눈에 카드와 같은 카드로 갈라 보이게(친구 2026-10-05)
      (gl ? '<div class="edu-glance">' + gl + '</div>' : '') + act + sess +
      '<div class="edu-about"><div class="edu-about-h">🎓 수료 기준</div><p class="edu-desc">' + eduEsc(rule) + '</p></div>';
    document.getElementById('edu-back').addEventListener('click', function () { renderEduList(eduState.tab); });
    var more = document.getElementById('edu-more');
    if (more) more.addEventListener('click', function () { document.getElementById('edu-sess').innerHTML = ss.map(sessLi).join(''); more.remove(); });
    if (opt.focus) { var box = document.getElementById('edu-act'); if (box && box.scrollIntoView) box.scrollIntoView({ block: 'center' }); }
    // ⚠️ api(supaCall)는 응답에 error 가 있으면 throw 한다 — 오류 말은 .catch 의 err.message(서버 오류 코드)로 고른다.
    var say = function (t) { var x = document.getElementById('edu-msg'); if (x) x.textContent = t; };
    var ap = document.getElementById('edu-apply');
    if (ap) ap.addEventListener('click', function () {
      // 확인 창 한 번(친구 2026-10-05) — 누구 이름으로 들어가는지 · 누르면 어떻게 되는지. appModal 의 msg 는 HTML 그대로라 모두 eduEsc.
      var l = userLines(u);
      var msg = '<div class="edu-ask"><b>' + eduEsc(c.title) + '</b><div class="edu-who">' + eduEsc(l.l2) + (l.l1 ? ' · ' + eduEsc(l.l1) : '') + '</div>' + eduEsc(sv.ask.line) + '</div>';
      appConfirm(msg, { title: sv.ask.title, okText: sv.ask.ok, cancelText: '돌아가기' }).then(function (yes) {
        if (!yes) return;
        ap.disabled = true;
        // 서버가 거절한 것(자리·기간·문)은 알리고 지금 상태로 다시 그린다 — 같은 단추를 또 누르지 않게. 통신 실패는 단추를 다시 켠다.
        var refused = function (code) {
          if (code === 'not-open') eduState.open = false;
          if (code === 'full' || code === 'closed-period' || code === 'not-yet' || code === 'not-open') { appAlert(eduErrText(code)); renderEduCourse(id, { focus: true }); return; }
          say(eduErrText(code)); ap.disabled = false;
        };
        api.eduApply(id, u.user_id || '').then(function (x) {
          if (!x || x.ok === false) { refused(x && x.error); return; }   // 지금은 supaCall 이 throw 하지만, 풀어도 성공처럼 안 보이게
          renderEduCourse(id, { focus: true });   // 알림 창 없이 — 칸이 ⑧~⑩ 으로 바뀐 것을 그 자리에서 보여 준다
        }).catch(function (err) { refused(err && err.message); });
      });
    });
    var cn = document.getElementById('edu-cancel');
    if (cn) cn.addEventListener('click', function () {
      appConfirm(eduEsc(mv.cancelAsk), { okText: mv.cancelBtn, cancelText: '돌아가기', danger: true }).then(function (yes) {
        if (!yes) return;
        cn.disabled = true;
        // 담당자가 먼저 처리했거나(not-active) 그새 시작했으면(too-late) 알리고 지금 상태로 다시 그린다
        var failed = function (code) {
          if (code === 'not-active' || code === 'too-late') { appAlert(eduErrText(code)); renderEduCourse(id, { focus: true }); return; }
          say(eduErrText(code)); cn.disabled = false;
        };
        return api.eduCancel(m.id, u.user_id || '').then(function (x) {
          if (!x || x.ok === false) { failed(x && x.error); return; }
          renderEduCourse(id, { focus: true, note: '취소했어요.' });
        }).catch(function (err) { failed(err && err.message); });
      });
    });
  }).catch(function () {
    if (my !== eduState.screen) return;
    var w = document.querySelector('.edu-wrap'); if (w) w.innerHTML = '<p class="edu-empty">' + eduErrText('') + '</p>';
  });
}
