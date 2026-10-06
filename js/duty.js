// 🙋 봉사 당번 — 당번 목록·내 당번·자세히·지원·취소·「못 가게 됐어요」(2026-10-06 · 설계 docs/superpowers/specs/2026-10-06-duty-roster-design.md §6)
//   ⚠️ 정원·겹침·잠금·쉼은 서버(SQL 함수 supabase/duty.sql)가 정한다 — 화면은 받은 판정(why·locked·lockAt·canCancel·canAsk)을 보여 주기만 한다.
//   ⚠️ 문(dutyVisible — app.js)은 첫 화면 단추를 숨기는 것뿐, 막는 것은 서버다(dutyGate — 읽기도 막는다 · 당번표에 이름이 나가므로).
//   ⚠️ 이름·담당자가 적은 글은 모두 dutyEsc 로 넣는다. appModal 의 msg 는 HTML 그대로 들어간다 — 거기 넣는 글도 모두 dutyEsc.
//   ⚠️ 자리·지원 번호는 화면 글자(data-*)에 싣지 않는다 — 차례 번호만 싣고 dutyState 의 배열에서 꺼낸다.

// ── 봉사 당번 순수 함수 (여기부터) ──
var DUTY_ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function dutyEsc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) { return DUTY_ESC[ch]; }); }
function dutyMd(d) {   // 10월 18일 — 날짜 없음·틀린 값은 빈 글
  if (!d || !/^\d{4}-\d{2}-\d{2}/.test(String(d))) return '';
  var t = new Date(String(d).slice(0, 10) + 'T00:00:00Z'); if (isNaN(t.getTime())) return '';
  return (t.getUTCMonth() + 1) + '월 ' + t.getUTCDate() + '일';
}
function dutyMdw(d) {   // 10월 18일(일) — 날짜만 있는 값(한국 달력날)이라 UTC 자정으로 읽어 요일이 밀리지 않는다
  var m = dutyMd(d); if (!m) return '';
  return m + '(' + '일월화수목금토'.charAt(new Date(String(d).slice(0, 10) + 'T00:00:00Z').getUTCDay()) + ')';
}
// 서버가 준 잠기는 때(ISO) → 「10월 17일(토) 저녁 7시」(한국 시각 · 분이 있으면 「7시 30분」). 「저녁 7시」라는 숫자를 화면에 따로 적지 않는다.
function dutyLockText(iso) {
  var t = Date.parse(iso || ''); if (isNaN(t)) return '';
  var k = new Date(t + 9 * 3600 * 1000), h = k.getUTCHours(), m = k.getUTCMinutes();
  var part = h < 12 ? '오전' : h < 18 ? '오후' : '저녁', h12 = h % 12 === 0 ? 12 : h % 12;
  return dutyMdw(k.toISOString().slice(0, 10)) + ' ' + part + ' ' + h12 + '시' + (m ? ' ' + m + '분' : '');
}
function dutySlotName(s) { return [s && s.service, s && s.task].filter(Boolean).join(' '); }   // 2부 설거지
function dutyTimeText(s) { return [s && s.start, s && s.end].filter(Boolean).join('~'); }      // 11:30~12:30
function dutyCountWord(n) {   // 한 분 · 두 분 · 세 분 · 네 분 · 5분 …
  var W = ['', '한', '두', '세', '네'], k = Math.floor(Number(n));
  if (!(k > 0)) return '';
  return k < W.length ? W[k] + ' 분' : k + '분';
}
function dutySeatWord(n) {   // 한 자리 · 두 자리 · 세 자리 · 네 자리 · 5자리 …
  var W = ['', '한', '두', '세', '네'], k = Math.floor(Number(n));
  if (!(k > 0)) return '';
  return k < W.length ? W[k] + ' 자리' : k + '자리';
}
function dutyNeedText(s) {   // 빈 자리 한 줄 — 「한 분 더 필요해요」 · 「다 찼어요」
  var left = (Number(s && s.capacity) || 0) - (Number(s && s.n) || 0);
  return left > 0 ? dutyCountWord(left) + ' 더 필요해요' : '다 찼어요';
}
// 「못 가게 됐어요」 까닭 — 서버 값(cant·mistake·notme)과 성도님께 보이는 말
var DUTY_WHY = [['cant', '사정이 생겨 못 가게 됐어요'], ['mistake', '잘못 눌렀어요'], ['notme', '제가 지원한 게 아니에요']];
function dutyWhyText(why) {
  for (var i = 0; i < DUTY_WHY.length; i++) if (DUTY_WHY[i][0] === why) return DUTY_WHY[i][1];
  return '못 간다고 알렸어요';
}
// 내 줄의 모습 — x = { locked, lockAt, off(그날·그 자리 쉼), status, byStaff, staffAdded, asked, why }
//   → { tone: ok|lock|soft|ask, head, sub, btn: null | { act: cancel|ask|unask, label } }
//   담당자가 뺀 줄은 「담당자가 빼 드렸어요」(성도님 화면에 removed 같은 말을 쓰지 않는다).
function dutyMyView(x) {
  var o = x || {};
  if (o.status && o.status !== 'active') return { tone: 'soft', head: '담당자가 빼 드렸어요', sub: '안 나오셔도 돼요. 궁금하시면 담당자께 말씀해 주세요.', btn: null };
  // 쉬는 날 — 안 나오셔도 된다. 다시 열리면 줄이 그대로 살아나므로, 그때 못 오실 분이 미리 뺄 수 있게 취소는 남긴다(잠기기 전 · 내가 지원한 줄만)
  if (o.off) return { tone: 'soft', head: '😴 이날은 쉬어요', sub: '안 나오셔도 돼요. 다시 서게 되면 그대로 이어져요.',
    btn: !o.locked && !o.staffAdded ? { act: 'cancel', label: '지원 취소' } : null };
  if (o.asked) return { tone: 'ask', head: '📨 담당자께 알렸어요', sub: dutyWhyText(o.why) + ' — 담당자가 확인하고 정리해 드려요.', btn: { act: 'unask', label: '알림 거두기' } };
  if (o.locked) return { tone: 'lock', head: '🔒 확정됐어요', sub: '이대로 서시면 돼요. 앱에서는 취소할 수 없어요 — 못 오시게 되면 아래 단추로 알려 주세요.', btn: { act: 'ask', label: '못 가게 됐어요' } };
  if (o.staffAdded) return { tone: 'ok', head: '✅ 담당자가 넣어 드렸어요', sub: '이대로 서시면 돼요. 못 오시게 되면 아래 단추로 알려 주세요.', btn: { act: 'ask', label: '못 가게 됐어요' } };
  var until = dutyLockText(o.lockAt);
  return { tone: 'ok', head: '✅ 지원했어요', sub: '이대로 서시면 돼요.' + (until ? ' ' + until + '까지 앱에서 취소할 수 있어요.' : ''), btn: { act: 'cancel', label: '지원 취소' } };
}
// 자리 한 칸의 모습 — day = {off, locked, lockAt} · slot = 서버 duty_board_view 의 자리(why·mine·n·capacity)
//   → { kind, my: dutyMyView | null, line: 상태 한 줄, btn: null | { act: apply, label } }
//   찬 자리·쉬는 자리·시작한 자리·지원을 받지 않는 자리에는 단추를 두지 않는다(눌러도 거절만 나올 단추는 없다).
function dutySlotView(day, slot) {
  var d = day || {}, s = slot || {}, m = s.mine;
  if (m) {
    return { kind: 'mine', line: '', btn: null,
      my: dutyMyView({ locked: d.locked === true, lockAt: d.lockAt, off: d.off === true || s.off === true, status: m.status, byStaff: m.byStaff === true,
        staffAdded: m.staffAdded === true, asked: m.asked === true, why: m.why }) };
  }
  var w = s.why || '';
  if (w === 'off' || d.off === true || s.off === true) return { kind: 'off', my: null, line: '쉬어요', btn: null };
  if (w === 'closed') return { kind: 'closed', my: null, line: '담당자가 넣는 자리예요', btn: null };
  if (w === 'started') return { kind: 'started', my: null, line: '이미 시작했어요', btn: null };
  if (w === 'full') return { kind: 'full', my: null, line: '다 찼어요', btn: null };
  if (w) return { kind: 'closed', my: null, line: '지금은 지원을 받지 않아요', btn: null };   // 모르는 까닭 — 단추를 두지 않는다
  return { kind: 'open', my: null, line: dutyNeedText(s), btn: { act: 'apply', label: '지원하기' } };
}
// 그날 머리 아래 한 줄 — 쉼 · 확정 · 언제까지 취소할 수 있나
function dutyDayLine(d) {
  var o = d || {};
  if (o.off) return '😴 이날은 쉬어요' + (o.note ? ' — ' + o.note : '');
  var note = o.note ? ' · ' + o.note : '';
  if (o.locked) return '🔒 확정된 날이에요 — 지금 지원하면 앱에서 취소할 수 없어요' + note;
  var until = dutyLockText(o.lockAt);
  return (until ? until + '까지 앱에서 취소할 수 있어요' : '') + (until ? note : (o.note || ''));
}
// 지원 확인 창의 글 — locked 면 「취소할 수 없는 날」 창(단추 「취소 못 해도 지원하기」)
//   → { title, ok, lines: [굵은 줄, 여느 줄 …] } — 그리는 쪽이 모두 dutyEsc 해서 넣는다
function dutyApplyAsk(board, day, slot, who, locked) {
  var when = dutyMdw(day && day.date) + ' · ' + dutySlotName(slot);
  var where = [dutyTimeText(slot), board && board.place].filter(Boolean).join(' · ');
  var base = { strong: when, where: where, who: who || '' };
  if (locked) {
    return { title: '⚠️ 취소할 수 없는 날이에요', ok: '취소 못 해도 지원하기', strong: base.strong, where: base.where, who: base.who,
      lines: ['확정된 날이라 지원하면 앱에서 취소할 수 없어요.', '못 오시게 되면 담당자께 알려 주셔야 해요.', '이 자리에 이름이 보여요.'] };
  }
  var until = dutyLockText(day && day.lockAt);
  return { title: '🙋 지원할까요?', ok: '지원하기', strong: base.strong, where: base.where, who: base.who,
    lines: ['이 자리에 이름이 보여요.', until ? until + '까지 앱에서 취소할 수 있어요.' : '확정되기 전까지 앱에서 취소할 수 있어요.'] };
}
// 서버 거절 → 성도님께 보일 말. x = 거절에 딸려 온 값(overlap 의 with · too-many 의 max)
function dutyErrText(code, x) {
  var o = x || {};
  if (code === 'overlap') {
    var w = o.with;
    if (w && (w.board || w.service)) {
      return '같은 날 겹치는 시간에 이미 ' + [w.board, [w.service, w.task].filter(Boolean).join(' ')].filter(Boolean).join(' ') + (w.start ? '(' + w.start + ')' : '') + ' 당번이 있어요.';
    }
    return '같은 날 겹치는 시간에 이미 다른 당번이 있어요.';
  }
  if (code === 'too-many') return '이 당번은 한 분이 ' + (dutySeatWord(o.max) || '정해진 수') + '까지 미리 잡아 둘 수 있어요. 서신 뒤에 다시 지원해 주세요.';
  var W = { 'full': '방금 자리가 찼어요.', 'closed': '지금은 앱에서 지원을 받지 않는 자리예요. 담당자께 말씀해 주세요.', 'off': '쉬는 날이에요.',
    'past': '지난 날짜예요.', 'started': '이미 시작한 자리예요.', 'not-yet': '아직 지원을 받지 않는 날짜예요.', 'after-until': '지원을 받지 않는 날짜예요.',
    'removed-by-staff': '담당자가 빼 드린 자리예요. 다시 서시려면 담당자께 말씀해 주세요.',
    'guardian': '어린이·청소년 부서는 앱에서 지원하지 않아요. 부서 선생님이나 담당자께 말씀해 주세요.',
    'bad-name': '당번표에 실을 수 없는 이름이에요. 설정의 「로그인 정보변경」에서 이름을 고친 뒤 지원해 주세요.',
    'locked': '확정된 날이라 앱에서 취소할 수 없어요. 「못 가게 됐어요」로 담당자께 알려 주세요.',
    'staff-row': '담당자가 넣어 드린 자리라 앱에서 취소할 수 없어요. 「못 가게 됐어요」로 알려 주세요.',
    'not-locked': '아직 확정 전이라 「지원 취소」로 바로 취소하실 수 있어요.',
    'not-active': '이미 처리된 지원이에요.', 'changed': '그사이 자리가 바뀌었어요. 다시 확인해 주세요.',
    'not-open': '아직 봉사 당번을 열지 않았어요.', 'no-user': '로그인한 뒤에 지원할 수 있어요.', 'not-found': '찾을 수 없어요. 다시 열어 주세요.' };
  return Object.prototype.hasOwnProperty.call(W, code) ? W[code] : '잠시 뒤 다시 해 주세요.';
}
// 거절 뒤 화면을 다시 받아야 하는가 — 서버 상태가 내가 보던 것과 달라졌다는 뜻의 거절들
function dutyNeedsReload(code) {
  return ['full', 'closed', 'off', 'past', 'started', 'not-yet', 'after-until', 'removed-by-staff', 'locked', 'staff-row', 'not-locked', 'not-active', 'changed', 'not-found'].indexOf(code) >= 0;
}
// 당번 카드의 한 줄 — 「손이 필요한 날 · 10월 18일(일) 한 분 · 10월 25일(일) 두 분」 · 지원 멈춤 당번은 그 말
function dutyBoardLine(b) {
  if (!b) return '';
  if (b.status === 'closed') return '담당자가 넣는 당번이에요 — 당번표를 볼 수 있어요';
  var need = (b.need || []).filter(function (x) { return x && dutyMdw(x.date) && Number(x.need) > 0; });
  if (!need.length) return '가까운 날은 다 찼어요';
  return '손이 필요한 날 · ' + need.map(function (x) { return dutyMdw(x.date) + ' ' + dutyCountWord(x.need); }).join(' · ');
}
// 「내 당번」 카드 — m = 서버 duty_mine 의 한 줄 → { title, where, my: dutyMyView, chips: [글] }
function dutyMineCard(m) {
  var o = m || {};
  var chips = [];
  if (o.movedFrom != null && o.status === 'active') chips.push('담당자가 자리를 옮겨 드렸어요');
  if (o.overlap === true && o.status === 'active') chips.push('⚠️ 같은 날 시간이 겹치는 다른 당번이 있어요');
  return { title: [dutyMdw(o.date), o.board].filter(Boolean).join(' · '),
    where: [dutySlotName(o), dutyTimeText(o), o.place].filter(Boolean).join(' · '),
    my: dutyMyView({ locked: o.locked === true, lockAt: o.lockAt, off: o.off === true, status: o.status, byStaff: o.byStaff === true, staffAdded: o.staffAdded === true,
      asked: o.asked === true, why: o.why }),
    note: o.off && o.note ? o.note : '', chips: chips };
}
// 문의 한 줄 — 번호가 있으면 눌러서 바로 걸린다(숫자만 tel: 로 · 나머지 글자는 모두 이스케이프)
function dutyContactHtml(t) {
  var s = String(t == null ? '' : t); if (!s) return '';
  var m = s.match(/0\d{1,2}[-\s]?\d{3,4}[-\s]?\d{4}/);
  if (!m) return dutyEsc(s);
  return dutyEsc(s.slice(0, m.index)) + '<a class="duty-tel" href="tel:' + m[0].replace(/\D/g, '') + '">' + dutyEsc(m[0]) + '</a>' + dutyEsc(s.slice(m.index + m[0].length));
}
// ── 봉사 당번 순수 함수 (여기까지) ──

// screen: 화면이 바뀔 때마다 올라가는 번호 — 늦게 온 응답이 다른 화면을 덮지 않게 · at: 지금 보는 화면(list|board) · loadedAt: 마지막으로 받은 때
var dutyState = { screen: 0, at: '', boards: [], mine: [], cur: '', board: null, days: [], loadedAt: 0, busy: false };

function dutyShell(u, keep) {
  var el = document.getElementById('app');
  el.innerHTML = '<div class="duty-wrap"><div class="ev-loading">불러오는 중…</div></div>' +
    '<button class="home-fab" id="duty-home" aria-label="첫 화면으로">' + homeFabLabel(u, true) + '</button>';
  if (!keep) window.scrollTo(0, 0);
  document.getElementById('duty-home').addEventListener('click', function () { renderSummary(); });
}
function dutyFail(text) {
  var w = document.querySelector('.duty-wrap');
  if (w) w.innerHTML = '<h2 class="duty-title">🙋 봉사 당번</h2><p class="duty-empty">' + dutyEsc(text) + '</p>';
}
function dutyMyHtml(v, idx) {   // 내 줄 상자 — idx = 단추가 가리킬 차례 번호(속성 글)
  return '<div class="duty-my ' + v.tone + '"><b>' + dutyEsc(v.head) + '</b>' + (v.sub ? '<span>' + dutyEsc(v.sub) + '</span>' : '') + '</div>' +
    (v.btn ? '<button class="duty-btn ghost' + (v.btn.act === 'cancel' ? ' danger' : '') + '" data-act="' + v.btn.act + '" ' + idx + '>' + dutyEsc(v.btn.label) + '</button>' : '');
}

// ── 당번 목록 + 내 당번 ──
//   opt.stay: 당번이 하나뿐이어도 목록에 머문다(자세히에서 돌아올 때) · opt.soft: 화면을 비우지 않고 받은 뒤 바꾼다(다시 보일 때) · opt.note: 맨 위 한 줄
function renderDutyList(opt) {
  opt = opt || {};
  var u = loadUser(); if (!u) { renderEntryScreen(); return; }
  if (!opt.soft && typeof logFeature === 'function') logFeature('duty', 0);
  if (!opt.soft || !document.querySelector('.duty-wrap')) dutyShell(u, false);
  var my = ++dutyState.screen; dutyState.at = 'list';
  api.dutyList(u.user_id || '').then(function (r) {
    if (my !== dutyState.screen) return;
    dutyState.loadedAt = Date.now();
    if (!r || r.open === false) { dutyState.boards = []; dutyState.mine = []; dutyFail(dutyErrText('not-open')); return; }
    dutyState.boards = r.boards || []; dutyState.mine = r.mine || [];
    // 당번이 하나뿐이고 내 당번이 없으면 목록을 건너뛴다(첫 화면에서 들어올 때만)
    if (!opt.stay && !opt.soft && dutyState.boards.length === 1 && !dutyState.mine.length) { renderDutyBoard(dutyState.boards[0].id); return; }
    dutyDrawList(opt.note || '');
  }).catch(function () {
    if (my !== dutyState.screen || opt.soft) return;
    dutyFail('지금 불러올 수 없어요. 잠시 뒤 다시 열어 주세요.');
  });
}

function dutyDrawList(note) {
  var w = document.querySelector('.duty-wrap'); if (!w) return;
  var mine = dutyState.mine, boards = dutyState.boards;
  var mineHtml = mine.length ? '<div class="duty-sec">내 당번</div>' + mine.map(function (m, i) {
    var c = dutyMineCard(m);
    return '<div class="duty-card mine" data-m="' + i + '"><b>' + dutyEsc(c.title) + '</b>' + (c.where ? '<span>' + dutyEsc(c.where) + '</span>' : '') +
      (c.note ? '<span>📌 ' + dutyEsc(c.note) + '</span>' : '') +
      c.chips.map(function (t) { return '<span class="duty-chipline">' + dutyEsc(t) + '</span>'; }).join('') +
      dutyMyHtml(c.my, 'data-m="' + i + '"') + '</div>';
  }).join('') : '';
  var boardHtml = boards.length ? boards.map(function (b, i) {
    return '<div class="duty-card" data-b="' + i + '" role="button" tabindex="0"><b>' + dutyEsc(b.title) + '</b>' + (b.place ? '<span>📍 ' + dutyEsc(b.place) + '</span>' : '') +
      '<span class="duty-need' + (b.status === 'open' && (b.need || []).length ? ' on' : '') + '">' + dutyEsc(dutyBoardLine(b)) + '</span></div>';
  }).join('') : '<p class="duty-empty">지금 열린 당번이 없어요.</p>';
  w.innerHTML = '<h2 class="duty-title">🙋 봉사 당번</h2>' + (note ? '<p class="duty-note" role="status">' + dutyEsc(note) + '</p>' : '') +
    mineHtml + '<div class="duty-sec">당번</div>' + boardHtml;
  w.onclick = function (ev) {
    var btn = ev.target.closest('button[data-act]');
    if (btn) { var m = mine[Number(btn.dataset.m)]; if (m) dutyMyAct(btn, btn.dataset.act, m.id, { date: m.date, slot: m }, function (n) { renderDutyList({ stay: true, soft: true, note: n }); }); return; }
    var bc = ev.target.closest('.duty-card[data-b]');
    if (bc) { var b = boards[Number(bc.dataset.b)]; if (b) renderDutyBoard(b.id); return; }
    var mc = ev.target.closest('.duty-card.mine');
    if (mc) { var mm = mine[Number(mc.dataset.m)]; if (mm) renderDutyBoard(mm.boardId, { focusDate: mm.date }); }
  };
  w.onkeydown = function (ev) {   // 카드에 초점을 두고 Enter·빈칸 — 눌러서 여는 것과 같게
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    var bc = ev.target.closest && ev.target.closest('.duty-card[data-b]');
    if (bc && ev.target === bc) { ev.preventDefault(); var b = boards[Number(bc.dataset.b)]; if (b) renderDutyBoard(b.id); }
  };
}

// ── 당번 자세히 — 날짜마다 자리 ──
//   opt.focusDate: 그 날짜를 화면 가운데로 · opt.note: 그 날짜 머리 아래 한 줄(「취소했어요.」) · opt.soft: 화면을 비우지 않고 받은 뒤 바꾼다(자리 지킴)
function renderDutyBoard(id, opt) {
  opt = opt || {};
  var u = loadUser(); if (!u) { renderEntryScreen(); return; }
  if (!opt.soft || !document.querySelector('.duty-wrap')) dutyShell(u, false);
  var my = ++dutyState.screen; dutyState.at = 'board'; dutyState.cur = id;
  api.dutyBoard(id, u.user_id || '').then(function (r) {
    if (my !== dutyState.screen) return;
    dutyState.loadedAt = Date.now();
    if (!r || r.open === false) { dutyFail(dutyErrText('not-open')); return; }
    dutyState.board = r.board || {}; dutyState.days = r.days || [];
    dutyDrawBoard(u, r.today || '', opt);
  }).catch(function (err) {
    if (my !== dutyState.screen || opt.soft) return;
    var w = document.querySelector('.duty-wrap');
    if (w) w.innerHTML = '<div class="duty-top"><span></span><button class="back-btn" id="duty-back">← 봉사 당번</button></div><p class="duty-empty">' +
      dutyEsc(err && err.message === 'not-found' ? '지금은 볼 수 없는 당번이에요.' : '지금 불러올 수 없어요. 잠시 뒤 다시 열어 주세요.') + '</p>';
    var bk = document.getElementById('duty-back'); if (bk) bk.addEventListener('click', function () { renderDutyList({ stay: true }); });
  });
}

function dutyDrawBoard(u, today, opt) {
  var w = document.querySelector('.duty-wrap'); if (!w) return;
  var b = dutyState.board, days = dutyState.days, y = window.scrollY;
  var slotHtml = function (d, s, di, si) {
    var v = dutySlotView(d, s), names = (s.names || []).filter(Boolean);
    return '<div class="duty-slot' + (v.kind === 'mine' ? ' mine' : '') + (v.kind === 'off' ? ' off' : '') + '">' +
      '<div class="duty-slot-h"><b>' + dutyEsc(dutySlotName(s)) + '</b><span>' + dutyEsc(dutyTimeText(s)) + '</span>' +
      '<span class="duty-cnt' + (v.kind === 'open' ? ' need' : '') + '">' + (Number(s.n) || 0) + '/' + (Number(s.capacity) || 0) + '</span></div>' +
      '<div class="duty-names">' + (names.length ? names.map(dutyEsc).join(' · ') : '아직 아무도 없어요') + '</div>' +
      (v.my ? dutyMyHtml(v.my, 'data-d="' + di + '" data-s="' + si + '"')
        : '<div class="duty-line' + (v.kind === 'open' ? ' need' : '') + '">' + dutyEsc(v.line) + '</div>' +
          (v.btn ? '<button class="duty-btn" data-act="apply" data-d="' + di + '" data-s="' + si + '">' + dutyEsc(v.btn.label) + '</button>' : '')) + '</div>';
  };
  var dayHtml = days.map(function (d, di) {
    var line = dutyDayLine(d);
    return '<section class="duty-day' + (d.off ? ' off' : '') + (d.locked ? ' locked' : '') + '" data-date="' + dutyEsc(d.date) + '">' +
      '<div class="duty-day-h"><b>' + dutyEsc(dutyMdw(d.date)) + '</b>' + (d.date === today ? '<span class="duty-today">오늘</span>' : '') + '</div>' +
      (line ? '<p class="duty-day-s">' + dutyEsc(line) + '</p>' : '') +
      (opt.note && opt.focusDate === d.date ? '<p class="duty-note" role="status">' + dutyEsc(opt.note) + '</p>' : '') +
      (d.slots || []).map(function (s, si) { return slotHtml(d, s, di, si); }).join('') + '</section>';
  }).join('');
  w.innerHTML = '<div class="duty-top"><span class="duty-kind">' + (b.status === 'closed' ? '담당자가 넣는 당번' : '지원 받는 중') + '</span>' +
      '<button class="back-btn" id="duty-back">← 봉사 당번</button></div>' +
    '<h2 class="duty-title">' + dutyEsc(b.title) + '</h2>' +
    (b.description ? '<p class="duty-desc">' + dutyEsc(b.description) + '</p>' : '') +
    (b.place || b.contact ? '<div class="duty-glance">' + (b.place ? '<div><span aria-hidden="true">📍</span> ' + dutyEsc(b.place) + '</div>' : '') +
      (b.contact ? '<div><span aria-hidden="true">📞</span> ' + dutyContactHtml(b.contact) + '</div>' : '') + '</div>' : '') +
    (b.status === 'closed' ? '<p class="duty-note">이 당번은 담당자가 넣어요 — 앱에서는 당번표와 내 당번을 볼 수 있어요.</p>' : '') +
    (days.length ? dayHtml : '<p class="duty-empty">지금 보이는 날짜가 없어요.</p>');
  document.getElementById('duty-back').addEventListener('click', function () { renderDutyList({ stay: true }); });
  if (opt.soft) window.scrollTo(0, y);   // 다시 받은 뒤에도 보던 자리 그대로
  else if (opt.focusDate) {
    var box = null;
    w.querySelectorAll('.duty-day').forEach(function (x) { if (x.dataset.date === opt.focusDate) box = x; });
    if (box && box.scrollIntoView) box.scrollIntoView({ block: 'start' });
  }
  var again = function (date, note) { renderDutyBoard(dutyState.cur, { soft: true, focusDate: date, note: note || '' }); };
  w.onclick = function (ev) {
    var btn = ev.target.closest('button[data-act]'); if (!btn) return;
    var d = days[Number(btn.dataset.d)], s = d && (d.slots || [])[Number(btn.dataset.s)]; if (!s) return;
    if (btn.dataset.act === 'apply') dutyApplyFlow(btn, u, b, d, s, again);
    else if (s.mine) dutyMyAct(btn, btn.dataset.act, s.mine.id, { date: d.date, slot: s }, function (n) { again(d.date, n); });
  };
}

// ── 지원 — 확인 창 한 번 · 잠긴 날은 「취소할 수 없는 날」 창(ack_locked) ──
//   화면을 열어 둔 사이 잠겼으면 서버가 locked-day 로 알려 준다(아무것도 안 씀) → 그 창을 띄운 뒤 다시 보낸다.
function dutyAskHtml(a) {
  return '<div class="duty-ask"><b>' + dutyEsc(a.strong) + '</b>' + (a.where ? '<div>' + dutyEsc(a.where) + '</div>' : '') +
    (a.who ? '<div class="duty-who">' + dutyEsc(a.who) + '</div>' : '') +
    a.lines.map(function (t) { return '<div>' + dutyEsc(t) + '</div>'; }).join('') + '</div>';
}
function dutyApplyFlow(btn, u, board, day, slot, again) {
  if (dutyState.busy) return;
  var l = userLines(u), who = l.l2 + (l.l1 ? ' · ' + l.l1 : '');
  var send = function (ack) {
    dutyState.busy = true; btn.disabled = true;
    var done = function () { dutyState.busy = false; if (btn.isConnected) btn.disabled = false; };
    api.dutyApply(slot.id, u.user_id || '', ack).then(function () { done(); again(day.date, ''); })   // 알림 창 없이 — 그 칸이 「✅ 지원했어요」로 바뀐다
      .catch(function (err) {
        done();
        var code = err && err.message, x = (err && err.data) || {};
        if (code === 'locked-day' && !ack) { ask(true); return; }
        if (code === 'not-open') { appAlert(dutyEsc(dutyErrText(code))); renderDutyList({ stay: true }); return; }
        appAlert(dutyEsc(dutyErrText(code, x)));
        if (dutyNeedsReload(code)) again(day.date, '');
      });
  };
  var ask = function (locked) {
    var a = dutyApplyAsk(board, day, slot, who, locked);
    appConfirm(dutyAskHtml(a), { title: a.title, okText: a.ok, cancelText: '돌아가기', danger: locked }).then(function (yes) { if (yes) send(locked); });
  };
  ask(day.locked === true);
}

// ── 내 줄 — 취소 · 못 가게 됐어요 · 알림 거두기 ── after(note) = 끝난 뒤 다시 그리기
function dutyPickWhy() {   // 까닭 셋 가운데 하나 — 고르면 그 값, 닫으면 null
  return new Promise(function (resolve) {
    var old = document.getElementById('app-modal'); if (old) old.remove();
    var wrap = document.createElement('div');
    wrap.id = 'app-modal'; wrap.className = 'am-overlay';
    wrap.innerHTML = '<div class="am-card" role="dialog" aria-modal="true"><div class="am-title">못 가게 됐어요</div>' +
      '<div class="am-msg">담당자께 알려 드려요. 자리는 담당자가 확인하고 정리해요.</div>' +
      '<div class="duty-why">' + DUTY_WHY.map(function (x) { return '<button class="am-btn duty-why-b" data-why="' + x[0] + '">' + dutyEsc(x[1]) + '</button>'; }).join('') + '</div>' +
      '<div class="am-btns"><button class="am-btn am-cancel">돌아가기</button></div></div>';
    var close = function (v) { wrap.classList.remove('show'); setTimeout(function () { wrap.remove(); }, 160); resolve(v); };
    wrap.addEventListener('click', function (e) {
      var b = e.target.closest('[data-why]');
      if (b) { close(b.dataset.why); return; }
      if (e.target === wrap || e.target.closest('.am-cancel')) close(null);
    });
    document.body.appendChild(wrap);
    requestAnimationFrame(function () { wrap.classList.add('show'); });
  });
}
function dutyMyAct(btn, act, signupId, at, after) {
  if (dutyState.busy) return;
  var u = loadUser(); if (!u) { renderEntryScreen(); return; }
  var label = dutyMdw(at.date) + ' ' + dutySlotName(at.slot);
  var run = function (call, okNote) {
    dutyState.busy = true; btn.disabled = true;
    var done = function () { dutyState.busy = false; if (btn.isConnected) btn.disabled = false; };
    call().then(function () { done(); after(okNote); }).catch(function (err) {
      done();
      var code = err && err.message;
      if (code === 'not-open') { appAlert(dutyEsc(dutyErrText(code))); renderDutyList({ stay: true }); return; }
      appAlert(dutyEsc(dutyErrText(code)));
      if (dutyNeedsReload(code)) after('');
    });
  };
  if (act === 'cancel') {
    appConfirm(dutyEsc(label + ' 지원을 취소할까요?'), { okText: '지원 취소', cancelText: '돌아가기', danger: true }).then(function (yes) {
      if (yes) run(function () { return api.dutyCancel(signupId, u.user_id || ''); }, '취소했어요.');
    });
  } else if (act === 'ask') {
    dutyPickWhy().then(function (why) {
      if (why) run(function () { return api.dutyAsk(signupId, u.user_id || '', why); }, '담당자께 알렸어요.');
    });
  } else if (act === 'unask') {
    appConfirm(dutyEsc('담당자께 보낸 알림을 거둘까요? 그대로 서시는 것으로 돼요.'), { okText: '알림 거두기', cancelText: '돌아가기' }).then(function (yes) {
      if (yes) run(function () { return api.dutyAsk(signupId, u.user_id || '', null); }, '알림을 거뒀어요.');
    });
  }
}

// 다른 앱에 다녀오면(화면이 다시 보이면) 자료를 다시 받는다 — 그사이 자리가 찼거나 확정됐을 수 있다. 확인 창이 떠 있으면 건드리지 않는다.
document.addEventListener('visibilitychange', function () {
  if (document.hidden || dutyState.busy || !document.querySelector('.duty-wrap') || document.getElementById('app-modal')) return;
  if (Date.now() - dutyState.loadedAt < 15000) return;
  if (dutyState.at === 'board' && dutyState.cur) renderDutyBoard(dutyState.cur, { soft: true });
  else if (dutyState.at === 'list') renderDutyList({ stay: true, soft: true });
});
