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
function eduPeriodLine(c) {   // 교육 기간 · 2027년 3월 3일(수) ~ 5월 19일(수) — 시작일이 없으면 빈 글(회차 일정만 보인다)
  if (!c || !eduYmdw(c.startsOn)) return '';
  return '교육 기간 · ' + eduYmdw(c.startsOn) + (c.endsOn && c.endsOn !== c.startsOn && eduRangeEnd(c.startsOn, c.endsOn) ? ' ~ ' + eduRangeEnd(c.startsOn, c.endsOn) : '');
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
function eduApplyMessage(r) {
  if (r.status === 'declined') return '이 강좌는 담당자에게 말씀해 주세요';   // 반려 유지(친구 2026-10-05) — 다시 눌러도 반려 그대로
  if (r.already) return '이미 신청하셨어요';
  if (r.status === 'confirmed') return '확정됐어요';
  if (r.status === 'waitlisted') return '대기 ' + (r.waitNo || 1) + '번이에요 — 자리가 나면 확정돼요';
  return '신청했어요 — 담당자가 확정하면 「내 강좌」에 보여요';
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

function renderEduCourse(id) {
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
    var c = r.course, m = r.mine;
    var sess = (c.sessions || []).map(function (s) {
      return '<li>' + s.no + ' · ' + eduEsc(eduMdw(s.date)) + (s.start ? ' ' + eduEsc(s.start) : '') + (s.topic ? ' — ' + eduEsc(s.topic) : '') + '</li>'; }).join('');
    var info = [c.teacher && '강사 · ' + c.teacher, c.place && '장소 · ' + c.place, c.target && '대상 · ' + c.target, c.fee && '교재비 · ' + c.fee,
      c.prereq && c.prereq.length && '먼저 들으실 과정 · ' + c.prereq.join(', ')].filter(Boolean)
      .map(function (t) { return '<span>' + eduEsc(t) + '</span>'; }).join('');
    var pl = eduPeriodLine(c), period = pl ? '<p class="edu-desc">' + eduEsc(pl) + '</p>' : '';
    var rule = '출석 ' + c.attendPct + '% 이상' + (c.checkLabel ? ' + ' + c.checkLabel + ' 확인' : '');
    var act;
    if (m && ['applied', 'confirmed', 'waitlisted'].indexOf(m.status) >= 0) {
      act = '<div class="edu-mine"><b>' + eduEsc(eduStatusLine(m)) + '</b>' +
        (m.canCancel ? '<span>' + (eduMd(m.cancelUntil) ? eduEsc(eduMd(m.cancelUntil)) + '까지' : '첫 시간 전까지') + ' 앱에서 취소할 수 있어요</span>' +
          '<button class="edu-btn ghost" id="edu-cancel">신청 취소</button>'
          : '<span>시작한 뒤에는 담당자에게 말씀해 주세요</span>') + '</div>';   // 과제 7 검토 반영(2026-10-05) — 서버가 canCancel 을 준다
    } else if (m && m.status === 'declined') {
      act = '<div class="edu-mine"><b>' + eduEsc(eduStatusLine(m)) + '</b><span>이 강좌는 담당자에게 말씀해 주세요</span></div>';
    } else if (c.phase === 'open') {
      act = '<button class="edu-btn" id="edu-apply">신청하기</button>';
    } else {
      act = '<p class="edu-empty">' + eduEsc(eduPhaseLabel(c)) + '</p>';
    }
    w.innerHTML = '<button class="edu-back" id="edu-back">← 교육</button><h2 class="edu-title">' + eduEsc(c.title) + '</h2>' +
      '<div class="edu-sub">' + eduEsc(c.kindLabel) + (c.term ? ' · ' + eduEsc(c.term) : '') + ' · ' + eduEsc(eduPhaseLabel(c)) + '</div>' +
      (c.description ? '<p class="edu-desc">' + eduEsc(c.description) + '</p>' : '') +
      period + (info ? '<div class="edu-info">' + info + '</div>' : '') +
      (sess ? '<h3 class="edu-h">일정 ' + c.sessions.length + '회</h3><ul class="edu-sess">' + sess + '</ul>' : '') +
      '<h3 class="edu-h">수료 기준</h3><p class="edu-desc">' + eduEsc(rule) + '</p>' + act + '<p class="edu-msg" id="edu-msg" role="status"></p>';
    document.getElementById('edu-back').addEventListener('click', function () { renderEduList(eduState.tab); });
    // ⚠️ api(supaCall)는 응답에 error 가 있으면 throw 한다 — 오류 말은 .catch 의 err.message(서버 오류 코드)로 고른다.
    var say = function (t) { var x = document.getElementById('edu-msg'); if (x) x.textContent = t; };
    var ap = document.getElementById('edu-apply');
    if (ap) ap.addEventListener('click', function () {
      ap.disabled = true;
      api.eduApply(id, u.user_id || '').then(function (x) {
        if (!x || x.ok === false) { say(eduErrText(x && x.error)); ap.disabled = false; return; }   // 지금은 supaCall 이 throw 하지만, 풀어도 「신청했어요」가 안 뜨게
        appAlert(eduApplyMessage(x)); renderEduCourse(id);
      }).catch(function (err) { say(eduErrText(err && err.message)); ap.disabled = false; });
    });
    var cn = document.getElementById('edu-cancel');
    if (cn) cn.addEventListener('click', function () {
      // appConfirm(msg, opts) 두 인자 · Promise<boolean>(js/events.js 937줄과 같은 꼴)
      appConfirm('신청을 취소할까요?', { okText: '신청 취소', cancelText: '돌아가기', danger: true }).then(function (yes) {
        if (!yes) return;
        cn.disabled = true;
        // 담당자가 먼저 처리한 줄(not-active)이면 알리고 지금 상태로 다시 그린다 — 남은 「신청 취소」 단추를 또 누르지 않게
        var failed = function (code) {
          if (code === 'not-active') { appAlert(eduErrText(code)); renderEduCourse(id); return; }
          say(eduErrText(code)); cn.disabled = false;
        };
        return api.eduCancel(m.id, u.user_id || '').then(function (x) {
          if (!x || x.ok === false) { failed(x && x.error); return; }
          appAlert('취소했어요.'); renderEduCourse(id);
        }).catch(function (err) { failed(err && err.message); });
      });
    });
  }).catch(function () {
    if (my !== eduState.screen) return;
    var w = document.querySelector('.edu-wrap'); if (w) w.innerHTML = '<p class="edu-empty">' + eduErrText('') + '</p>';
  });
}
