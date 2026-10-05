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
  // 수료(3단계) — 서버가 수료이고 취소 안 된 줄에만 completed·certNo 를 싣는다 · 취소 단추·취소 안내 줄은 없다(canCancel 에 기대지 않는다)
  //   「수료증 보기」 단추는 그리는 쪽이 cert 를 보고 붙인다
  if (m.status === 'confirmed' && m.completed === true && m.certNo) {
    return { tone: 'ok', head: '🎓 수료했어요', lines: ['수료번호 ' + m.certNo], cancelLine: '', cancelBtn: null, cancelAsk: '', cert: true };
  }
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
// 출석률(2단계 · 2026-10-05 친구 결정) — 지각 = 출석 · 공결은 분모에서 뺀다 · 아직 체크 안 한 회차는 분모에 넣지 않는다. denom 0 이면 pct null.
//   ⚠️ 함수 몸통은 교회 어드민 supabase/functions/church-admin/edu-rules.ts 의 eduAttendRate 와 **한 글자도 같게** 둔다(두 앱이 같은 규칙).
//      api(supabase/functions/api/index.ts)의 복사본과 같은지는 tests/edu-front.test.cjs 가 글자로 맞대 본다 · 시험 경우 목록도 두 저장소가 같다.
function eduAttendRate(c) {
  var n = function (v) { var x = Number(v); return Number.isFinite(x) && x > 0 ? Math.floor(x) : 0; };
  var o = c || {};
  var attended = n(o.present) + n(o.late);
  var denom = attended + n(o.absent);
  return { attended: attended, denom: denom, pct: denom > 0 ? Math.round(attended * 100 / denom) : null };
}
// 내 출석 한 줄(2단계) — 「출석 6/7 · 86%」 · 셈은 위 eduAttendRate 하나(규칙을 여기서 다시 짜지 않는다 · 서버 pct 와 같은 값).
//   a = 서버 attend {present, late, absent, excused, marked, pct}. 체크한 칸이 없으면(marked 0) 빈 글 — 줄을 그리지 않는다.
//   공결만 있으면 분모가 0 이라 「공결 2회」.
function eduAttendLine(a) {
  if (!a || !(Number(a.marked) > 0)) return '';
  var r = eduAttendRate(a);
  if (r.denom > 0) return '출석 ' + r.attended + '/' + r.denom + ' · ' + r.pct + '%';
  var ex = Math.floor(Number(a.excused));
  return ex > 0 ? '공결 ' + ex + '회' : '';
}
// 「🗓️ 일정」 카드 위 한 줄 — 「내 출석 6/7 · 86% (수료 기준 80%)」 · 공결만이면 「내 출석 · 공결 2회 (수료 기준 80%)」
function eduMyAttendLine(a, attendPct) {
  var base = eduAttendLine(a); if (!base) return '';
  var p = attendPct === null || attendPct === undefined || attendPct === '' ? NaN : Number(attendPct);
  return '내 ' + (base.indexOf('공결') === 0 ? '출석 · ' + base : base) + (Number.isFinite(p) ? ' (수료 기준 ' + p + '%)' : '');
}
// 회차 줄 오른쪽 표시(내 칸 myState) — 출석 ✅ · 지각 🕘 · 결석 ❌ · 공결은 글자 칩 · 체크 전(null)은 표시 없음
function eduStateMark(st) {
  var M = { present: { cls: 'present', icon: '✅', label: '출석' }, late: { cls: 'late', icon: '🕘', label: '지각' },
    absent: { cls: 'absent', icon: '❌', label: '결석' }, excused: { cls: 'excused', icon: '', label: '공결' } };
  return Object.prototype.hasOwnProperty.call(M, st) ? M[st] : null;   // 'toString' 같은 이름이 함수를 꺼내지 않게
}
// 「내 강좌」 카드 한 줄(3단계) — 「🎓 수료 · 고척-2026-0001」 · 수료가 아니면 빈 글
function eduCertLine(m) { return m && m.completed === true && m.certNo ? '🎓 수료 · ' + m.certNo : ''; }
// 수료증 화면의 오류 말 — eduCert 의 거절(no-user · bad-args · not-found · no-cert)
function eduCertErrText(code) {
  if (code === 'no-cert' || code === 'not-found') return '수료증을 찾을 수 없어요. 수료가 취소됐을 수 있어요 — 궁금하시면 담당자에게 말씀해 주세요.';
  if (code === 'no-user') return '로그인한 뒤에 볼 수 있어요.';
  return '지금 수료증을 불러올 수 없어요. 잠시 뒤 다시 열어 주세요.';
}

// ── 수료증 그림(3단계 · 2026-10-05) ──
//   교회 어드민 인쇄(js/menus/education/cert-template.js)와 **같은 틀** — 칸 자리는 EDU_CERT_GEOM(수료증 폭의 %) 한 곳.
//   ⚠️ 이 표는 교회 어드민 CERT_GEOM 과 같은 값·같은 차례다(두 저장소 시험에 같은 지문). 자리를 고치면 두 곳을 함께 고친다.
//   eduCertPlan 은 순수(글 폭 재기 measure 를 받는다) — 캔버스에 무엇을 어디에 그릴지만 정하고, 그리기는 eduCertDraw 가 한다.
//   ⚠️ 이름·명의·문안은 캔버스 fillText 로만 그린다(HTML 에 넣지 않는다) · 직인은 drawImage 로만.
var EDU_CERT_GEOM = {
  ratio: 0.7071,
  frame: 3.2, frameW: 0.3, gap: 0.6, innerW: 0.1,
  noTop: 6, noLeft: 6.6, noSize: 1.3,
  logoTop: 6.4, logoH: 7.8,
  titleTop: 16, titleSize: 5, titleTrack: 0.35,
  mainTop: 24.6, mainBottom: 51, mainW: 64, mainGap: 2.4,
  infoSize: 2, nameSize: 2.5, infoLH: 1.45, infoGap: 0.7, labelEm: 4.2, colGap: 2.2,
  bodyLH: 1.85, bodySizes: [2.2, 2, 1.8, 1.6, 1.45, 1.3, 1.15],
  dateTop: 53, dateSize: 2,
  issTop: 57.6, issSize: 2.6, issTrack: 0.1,
  sealH: 8.6, sealIn: 0.3
};
var EDU_CERT_W = 1754, EDU_CERT_H = 1240;   // A4 가로 150dpi 쯤 — 폰 화면에 꽉 차고, 인쇄해도 거칠지 않다
var EDU_CERT_INK = { frame: '#1a3a6b', strong: '#0d1b3e', soft: '#3b4660', text: '#1d2230' };   // 남색·먹색(교회 어드민 css .ec-cert 와 같은 색)
var EDU_CERT_FONT = '"Nanum Myeongjo", "Noto Serif KR", "AppleMyungjo", "Batang", serif';
function eduCertYmd(d) {   // 2026년 12월 13일(증서는 해를 늘 적는다) · 틀린 값은 빈 글
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d || '')); if (!m) return '';
  var t = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (isNaN(t.getTime()) || t.getUTCDate() !== +m[3]) return '';
  return (+m[1]) + '년 ' + (+m[2]) + '월 ' + (+m[3]) + '일';
}
function eduCertPeriod(from, to) {   // 2026년 10월 25일 ~ 2026년 12월 13일 · 같은 날이면 하루 · 한쪽만 있으면 그쪽만
  var a = eduCertYmd(from), b = eduCertYmd(to);
  if (a && b) return a === b ? a : a + ' ~ ' + b;
  if (a) return a + ' ~';
  return b ? '~ ' + b : '';
}
function eduCertCourseText(title, term) {   // 구원론 3차 (2026 하반기)
  var t = String(title || '').trim(), m = String(term || '').trim();
  return t + (m ? ' (' + m + ')' : '');
}
// 글자 폭 어림(em)·줄 수 어림·문안 크기 — 교회 어드민 cert-template.js 의 certTextEm·certLines·certInfoHeight·certBodySize 와 같은 셈
//   (두 곳이 같은 문안 크기에서 시작한다 — 캔버스는 그 뒤 실제로 재 보아 넘치면 한 단계씩 더 작게)
function eduCertTextEm(s) {
  var w = 0;
  Array.from(String(s || '')).forEach(function (ch) {
    var c = ch.codePointAt(0);
    if (ch === ' ') w += 0.3;
    else if (c >= 0x20 && c < 0x7f) w += 0.55;
    else if ((c >= 0x1100 && c <= 0x11ff) || (c >= 0x2e80 && c <= 0xa4cf) || (c >= 0xac00 && c <= 0xd7a3) || (c >= 0xf900 && c <= 0xfaff) || (c >= 0xfe30 && c <= 0xfe4f) || (c >= 0xff00 && c <= 0xffef) || c >= 0x20000) w += 1;
    else w += 0.8;
  });
  return w;
}
function eduCertLines(text, size, maxW) {
  var per = (maxW / size) * 0.92;
  return String(text || '').split('\n').reduce(function (n, p) { return n + Math.max(1, Math.ceil(eduCertTextEm(p.trim()) / per)); }, 0);
}
function eduCertInfoHeight(c) {
  var g = EDU_CERT_GEOM, valW = g.mainW - g.labelEm * g.infoSize - g.colGap;
  var rows = [g.nameSize * g.infoLH, eduCertLines(eduCertCourseText(c && c.title, c && c.term), g.infoSize, valW) * g.infoSize * g.infoLH];
  if (eduCertPeriod(c && c.from, c && c.to)) rows.push(g.infoSize * g.infoLH);
  return rows.reduce(function (a, b) { return a + b; }, 0) + (rows.length - 1) * g.infoGap;
}
function eduCertBodySize(c) {
  var g = EDU_CERT_GEOM, room = g.mainBottom - g.mainTop - eduCertInfoHeight(c) - g.mainGap;
  for (var i = 0; i < g.bodySizes.length; i++) if (eduCertLines(c && c.body, g.bodySizes[i], g.mainW) * g.bodySizes[i] * g.bodyLH <= room) return g.bodySizes[i];
  return g.bodySizes[g.bodySizes.length - 1];
}
// 직인은 PNG·JPEG data URL 일 때만(그 밖의 주소는 그리지 않는다 · 서버 checkCertSeal 꼴)
var EDU_SEAL_RE = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/;
function eduSealSrc(s) { return typeof s === 'string' && EDU_SEAL_RE.test(s) ? s : ''; }
// 글을 폭 maxW 안으로 줄 나누기 — 띄어쓰기 자리에서 끊고(keep-all), 한 낱말이 폭보다 길면 글자로 끊는다 · \n 은 새 문단
function eduCertWrap(text, maxW, measure) {
  var out = [];
  String(text == null ? '' : text).split('\n').forEach(function (para) {
    var line = '';
    para.trim().split(/ +/).forEach(function (word) {
      if (!word) return;
      var cand = line ? line + ' ' + word : word;
      if (measure(cand) <= maxW) { line = cand; return; }
      if (line) { out.push(line); line = ''; }
      if (measure(word) <= maxW) { line = word; return; }
      Array.from(word).forEach(function (ch) {
        if (line && measure(line + ch) > maxW) { out.push(line); line = ch; } else line += ch;
      });
    });
    out.push(line);
  });
  return out;
}
// 글자 사이를 벌려 쓴 글(「수료증」·이름·발급일·명의) — 글자마다 x · 끝 글자 뒤에도 벌림을 둔다(화면 letter-spacing 과 같다)
function eduCertSpaced(text, size, weight, track, measure) {
  var x = 0, chars = Array.from(String(text || '')).map(function (ch) {
    var w = measure(ch, size, weight), o = { ch: ch, x: x, w: w }; x += w + track * size; return o;
  });
  return { chars: chars, width: x };
}
// 수료증 한 장 그릴 차례 — c = eduCert 의 cert · measure(글, px, 굵기) → px · imgs = {logo:{w,h}|null, seal:{w,h}|null}
//   → {W, H, bodySize, ops:[{k:'rect',x,y,w,h,lw,color} | {k:'text',s,x,y,size,weight,color,align} | {k:'img',key,x,y,w,h}]}
//   글의 y 는 글자 가운데(textBaseline middle) · 교회 어드민 .ec-cert 와 같은 자리(css 줄높이·letter-spacing 셈 그대로)
function eduCertPlan(c, measure, imgs) {
  var g = EDU_CERT_GEOM, W = EDU_CERT_W, H = EDU_CERT_H, u = W / 100, ops = [], ink = EDU_CERT_INK, x = c || {};
  var text = function (s, px, py, size, weight, color, align) { ops.push({ k: 'text', s: s, x: px, y: py, size: size, weight: weight, color: color, align: align || 'left' }); };
  // 겹테두리 — css 의 border 는 상자 안쪽에 그려지므로 선 가운데 자리로 옮겨 긋는다(바깥 굵은 줄 · 안쪽 가는 줄)
  var o = (g.frame + g.frameW / 2) * u, i = (g.frame + g.frameW + g.gap + g.innerW / 2) * u;
  ops.push({ k: 'rect', x: o, y: o, w: W - 2 * o, h: H - 2 * o, lw: g.frameW * u, color: ink.frame });
  ops.push({ k: 'rect', x: i, y: i, w: W - 2 * i, h: H - 2 * i, lw: g.innerW * u, color: ink.frame });
  if (x.certNo) text('제 ' + x.certNo + ' 호', g.noLeft * u, (g.noTop + g.noSize * 0.65) * u, g.noSize * u, 400, ink.soft);
  var lg = imgs && imgs.logo;
  if (lg && lg.w > 0 && lg.h > 0) { var lh = g.logoH * u, lw = lh * lg.w / lg.h; ops.push({ k: 'img', key: 'logo', x: W / 2 - lw / 2, y: g.logoTop * u, w: lw, h: lh }); }
  // 「수료증」 — 글자 사이 0.35em · 끝 글자 뒤 벌림을 빼고 가운데(css 의 padding-left 와 같은 셈)
  var ts = g.titleSize * u, tt = eduCertSpaced('수료증', ts, 800, g.titleTrack, measure), tw = tt.width - g.titleTrack * ts;
  tt.chars.forEach(function (ch) { text(ch.ch, W / 2 - tw / 2 + ch.x, (g.titleTop + g.titleSize / 2) * u, ts, 800, ink.strong); });
  // 가운데 덩이 — 성명·과정·기간(칸 이름은 양쪽 맞춤) → 문안 · 둘을 묶어 가운데 칸의 세로 가운데에
  var is = g.infoSize * u, ns = g.nameSize * u, labelW = g.labelEm * is, gap = g.colGap * u, valW = (g.mainW - g.labelEm * g.infoSize - g.colGap) * u;
  var rows = [{ k: '성명', lines: [String(x.name || '')], size: ns, weight: 800, color: ink.strong, track: 0.12 },
    { k: '과정', lines: eduCertWrap(eduCertCourseText(x.title, x.term), valW, function (t) { return measure(t, is, 700); }), size: is, weight: 700, color: ink.text, track: 0 }];
  var period = eduCertPeriod(x.from, x.to);
  if (period) rows.push({ k: '기간', lines: [period], size: is, weight: 700, color: ink.text, track: 0 });
  var valMax = 0, infoH = 0;
  rows.forEach(function (r, n) {
    r.lh = r.size * g.infoLH; r.h = r.lh * r.lines.length;
    r.lines.forEach(function (l) { var w = r.track ? eduCertSpaced(l, r.size, r.weight, r.track, measure).width : measure(l, r.size, r.weight); if (w > valMax) valMax = w; });
    infoH += r.h + (n ? g.infoGap * u : 0);
  });
  valMax = Math.min(valMax, valW);
  var room = (g.mainBottom - g.mainTop) * u - infoH - g.mainGap * u, bw = g.mainW * u;
  var steps = g.bodySizes, k = Math.max(0, steps.indexOf(eduCertBodySize(c))), bs = steps[k] * u, lines = [];
  for (; k < steps.length; k++) {   // 어림(eduCertBodySize — 교회 어드민 인쇄와 같은 단계)에서 시작해, 실제로 재 보아 넘치면 한 단계씩 더 작게
    bs = steps[k] * u;
    lines = eduCertWrap(x.body, bw, function (t) { return measure(t, bs, 400); });
    if (lines.length * bs * g.bodyLH <= room || k === steps.length - 1) break;
  }
  var bodyH = lines.length * bs * g.bodyLH, mainH = (g.mainBottom - g.mainTop) * u;
  var y = g.mainTop * u + (mainH - (infoH + g.mainGap * u + bodyH)) / 2, gx = W / 2 - (labelW + gap + valMax) / 2;
  rows.forEach(function (r, n) {
    if (n) y += g.infoGap * u;
    var mid = y + r.lh / 2, lab = Array.from(r.k), ly = mid + (r.size - is) * 0.3;   // 큰 이름과 작은 칸 이름의 글자 바닥을 맞춘다(css baseline)
    text(lab[0], gx, ly, is, 400, ink.soft, 'left');
    text(lab[lab.length - 1], gx + labelW, ly, is, 400, ink.soft, 'right');
    r.lines.forEach(function (l, j) {
      var vy = mid + j * r.lh;
      if (r.track) eduCertSpaced(l, r.size, r.weight, r.track, measure).chars.forEach(function (ch) { text(ch.ch, gx + labelW + gap + ch.x, vy, r.size, r.weight, r.color); });
      else text(l, gx + labelW + gap, vy, r.size, r.weight, r.color);
    });
    y += r.h;
  });
  y += g.mainGap * u;
  lines.forEach(function (l, j) { if (l) text(l, W / 2, y + (j + 0.5) * bs * g.bodyLH, bs, 400, ink.text, 'center'); });
  var issued = eduCertYmd(x.issuedOn);
  if (issued) {
    var ds = g.dateSize * u, dt = eduCertSpaced(issued, ds, 400, 0.06, measure);
    dt.chars.forEach(function (ch) { text(ch.ch, W / 2 - dt.width / 2 + ch.x, (g.dateTop + g.dateSize * 0.65) * u, ds, 400, ink.text); });
  }
  // 발급 명의 + 직인 — 명의 끝에 직인 폭의 30% 를 겹쳐 찍는다(도장을 찍은 자리)
  var ss = g.issSize * u, it = eduCertSpaced(String(x.issuer || ''), ss, 800, g.issTrack, measure), ix = W / 2 - it.width / 2, iy = (g.issTop + g.issSize / 2) * u;
  it.chars.forEach(function (ch) { text(ch.ch, ix + ch.x, iy, ss, 800, ink.strong); });
  var sl = imgs && imgs.seal;
  if (sl && sl.w > 0 && sl.h > 0) { var sh = g.sealH * u, sw = sh * sl.w / sl.h; ops.push({ k: 'img', key: 'seal', x: ix + it.width - g.sealIn * sw, y: iy - sh / 2, w: sw, h: sh }); }
  return { W: W, H: H, bodySize: steps[Math.min(k, steps.length - 1)], ops: ops };
}
// 저장할 파일 이름 — 수료증_고척-2026-0001.png(파일 이름에 못 쓰는 글자·빈칸은 뺀다)
function eduCertFileName(no) { return '수료증_' + (String(no || '').replace(/[\\/:*?"<>|\s]/g, '') || '고척') + '.png'; }
// 알림 딥링크(4단계 · 2026-10-05) — 주소(전체 주소든 ?뒤든)의 edu=<강좌 id> 를 읽는다. uuid 꼴만 · 아니면 null.
//   api 의 확정·개강 전날 알림이 「https://gocheok.onlybible.kr/?edu=<강좌 id>」로 보낸다(서비스워커가 &from=push 를 붙인다).
var EDU_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function eduDeepLinkId(href) {
  var s = String(href == null ? '' : href), q = s.indexOf('?');
  if (q < 0) return null;
  var parts = s.slice(q + 1).split('#')[0].split('&');
  for (var i = 0; i < parts.length; i++) {
    var eq = parts[i].indexOf('=');
    if ((eq < 0 ? parts[i] : parts[i].slice(0, eq)) !== 'edu') continue;
    var v = ''; try { v = decodeURIComponent(eq < 0 ? '' : parts[i].slice(eq + 1)); } catch (e) { return null; }
    return EDU_UUID_RE.test(v.trim()) ? v.trim().toLowerCase() : null;
  }
  return null;
}
// ── 교육 순수 함수 (여기까지) ──

var eduState = { list: null, mine: [], open: true, tab: 'open', screen: 0, certUrl: '' };   // screen: 화면이 바뀔 때마다 올라가는 번호 — 늦게 온 응답이 다른 화면을 덮지 않게

// 알림을 눌러 들어온 길(?edu=<강좌 id> · 4단계) — 한 번 읽고 주소에서 edu 만 지운다(새로고침 때 또 열리지 않게 · 다른 파라미터는 둔다).
//   여는 것은 app.js routeAfterLoad(로그인했을 때만 renderEduCourse · 아니면 평소 길) · 이미 열린 창은 서비스워커 「from-push」 메시지(app.js)가 연다.
function eduTakeDeepLink() {
  try {
    if (!/[?&]edu=/.test(location.search)) return null;
    var id = eduDeepLinkId(location.search);
    var q = new URLSearchParams(location.search); q.delete('edu');
    var rest = q.toString();
    history.replaceState(null, '', location.pathname + (rest ? '?' + rest : ''));
    return id;
  } catch (e) { return null; }
}

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
        (eduAttendLine(m.attend) ? '<span class="edu-att">' + eduEsc(eduAttendLine(m.attend)) + '</span>' : '') +   // 출석(2단계) — 체크한 칸이 있을 때만
        (eduCertLine(m) ? '<span class="edu-cert-k">' + eduEsc(eduCertLine(m)) + '</span>' : '') +   // 수료(3단계) — 「🎓 수료 · 고척-2026-0001」
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
      var lines = mv.lines.concat(m.status === 'confirmed' && !mv.cert && c.place ? [c.place] : []);
      act = '<div class="edu-state ' + mv.tone + '"><b>' + eduEsc(mv.head) + '</b>' + lines.map(function (t) { return '<span>' + eduEsc(t) + '</span>'; }).join('') + '</div>' +
        (mv.cert ? '<button class="edu-btn" id="edu-cert">수료증 보기</button>' : '') +   // 수료(3단계) — 그림으로 보고 저장·공유
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
    // 회차 줄 오른쪽에 내 출석 표시(2단계 · myState — 내 칸만 · 체크 전은 없음)
    var sessLi = function (s) {
      var mk = eduStateMark(s.myState);
      return '<div class="edu-ss"><span class="edu-ss-n">' + s.no + '회</span><div class="edu-ss-b"><b>' + eduEsc(eduMdw(s.date)) + (s.start ? ' ' + eduEsc(s.start) : '') + '</b>' +
        (s.topic ? '<span>' + eduEsc(s.topic) + '</span>' : '') +
        (s.place && s.place !== c.place ? '<span class="edu-ss-p">' + eduEsc(s.place) + '</span>' : '') + '</div>' +
        (mk ? '<span class="edu-ss-m ' + mk.cls + '">' + (mk.icon ? '<span aria-hidden="true">' + mk.icon + '</span>' : '') + mk.label + '</span>' : '') + '</div>'; };
    var myAtt = m ? eduMyAttendLine(m.attend, c.attendPct) : '';   // 「내 출석 6/7 · 86% (수료 기준 80%)」 — 체크한 칸이 있을 때만
    var sess = ss.length ? '<div class="edu-about edu-sched"><div class="edu-about-h">🗓️ 일정 ' + ss.length + '회</div>' +
      (myAtt ? '<div class="edu-myatt">' + eduEsc(myAtt) + '</div>' : '') +
      '<div id="edu-sess">' + ss.slice(0, shown).map(sessLi).join('') + '</div>' +
      (ss.length > shown ? '<button class="edu-more" id="edu-more">＋ ' + (ss.length - shown) + '회 더 보기</button>' : '') + '</div>' : '';
    var rule = '출석 ' + c.attendPct + '% 이상' + (c.checkLabel ? ' + ' + c.checkLabel + ' 확인' : '');
    // 위 한 줄 — 왼쪽 칩 · 오른쪽 「← 교육」(암송·복습 화면 .test-top 과 같은 꼴 · 같은 .back-btn — 친구 2026-10-05)
    // 차례(친구 2026-10-05 「신청하기 버튼을 위로」): 제목 바로 아래 신청 칸(자리·신청 / 내 신청·취소) → 한눈에 → 강좌 소개 → 일정 → 수료 기준
    //   설명이 길어도 화면을 열자마자 신청 칸이 보이게. 「신청하기」는 확인 창을 한 번 더 거친다.
    w.innerHTML = '<div class="edu-top">' + chips + '<button class="back-btn" id="edu-back">← 교육</button></div>' +
      '<h2 class="edu-title">' + eduEsc(c.title) + '</h2>' + (c.term ? '<div class="edu-sub">' + eduEsc(c.term) + '</div>' : '') +
      act + (gl ? '<div class="edu-glance">' + gl + '</div>' : '') +
      (c.description ? '<div class="edu-about"><div class="edu-about-h">📝 강좌 소개</div><p class="edu-desc">' + eduEsc(c.description) + '</p></div>' : '') +   // 담당자가 쓴 글 — 한눈에 카드와 같은 카드로 갈라 보이게(친구 2026-10-05)
      sess +
      '<div class="edu-about"><div class="edu-about-h">🎓 수료 기준</div><p class="edu-desc">' + eduEsc(rule) + '</p></div>';
    document.getElementById('edu-back').addEventListener('click', function () { renderEduList(eduState.tab); });
    var cb = document.getElementById('edu-cert');
    if (cb) cb.addEventListener('click', function () { renderEduCert(m.id, id); });
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

// ── 수료증 보기(3단계 · 2026-10-05) — 내 수료증을 캔버스에 그려 그림으로 보여 주고 「저장·공유」 ──
//   자료는 api.eduCert(내 줄 · 수료 · 안 취소일 때만) · 틀은 eduCertPlan(교회 어드민 인쇄와 같은 자리).
//   ⚠️ 이름·명의·문안은 캔버스 fillText 로만(HTML 에 넣지 않는다) · 직인은 drawImage 로만 · 그림 alt 는 속성으로.
//   ⚠️ 아이폰 앱(WKWebView)·플레이 앱(TWA)에서 공유·내려받기·길게 눌러 저장이 되는지는 실기기로 볼 것(계획 「성도님 앱」).
function eduCertImage(src) {
  return new Promise(function (ok) {
    if (!src) { ok(null); return; }
    var im = new Image();
    im.onload = function () { ok(im); }; im.onerror = function () { ok(null); };
    im.src = src;
  });
}
function eduCertDraw(cert) {
  // 명조 글꼴 — 앱이 이미 부른 Nanum Myeongjo 의 한글 조각 가운데 이 수료증에 쓰는 글자의 조각을 받아 둔다(최대 5초 · 안 오면 기기 명조)
  var all = [cert.name, cert.title, cert.term, cert.body, cert.issuer, cert.certNo, '제 호 수료증 성명 과정 기간 년 월 일 ~ ()0123456789'].join(' ');
  var fonts = document.fonts && document.fonts.load
    ? Promise.all([400, 700, 800].map(function (w) { return document.fonts.load(w + ' 40px "Nanum Myeongjo"', all).catch(function () { return null; }); }))
    : Promise.resolve();
  var late = function (p, ms) { return Promise.race([p, new Promise(function (ok) { setTimeout(ok, ms); })]); };
  return Promise.all([late(fonts, 5000), eduCertImage('img/logo-gocheok.png'), eduCertImage(eduSealSrc(cert.seal))]).then(function (got) {
    var logo = got[1], seal = got[2];
    var cv = document.createElement('canvas'); cv.width = EDU_CERT_W; cv.height = EDU_CERT_H;
    var ctx = cv.getContext('2d');
    var font = function (size, weight) { return weight + ' ' + size + 'px ' + EDU_CERT_FONT; };
    var measure = function (t, size, weight) { ctx.font = font(size, weight); return ctx.measureText(t).width; };
    var plan = eduCertPlan(cert, measure, { logo: logo ? { w: logo.naturalWidth, h: logo.naturalHeight } : null, seal: seal ? { w: seal.naturalWidth, h: seal.naturalHeight } : null });
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, plan.W, plan.H);
    ctx.textBaseline = 'middle';
    plan.ops.forEach(function (o) {
      if (o.k === 'rect') { ctx.strokeStyle = o.color; ctx.lineWidth = o.lw; ctx.strokeRect(o.x, o.y, o.w, o.h); return; }
      if (o.k === 'text') { ctx.font = font(o.size, o.weight); ctx.fillStyle = o.color; ctx.textAlign = o.align; ctx.fillText(o.s, o.x, o.y); return; }
      var im = o.key === 'logo' ? logo : seal;
      if (!im) return;
      ctx.save();
      if (o.key === 'seal') { ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = 0.95; }   // 인주가 글씨 위에 찍힌 것처럼
      ctx.drawImage(im, o.x, o.y, o.w, o.h);
      ctx.restore();
    });
    return new Promise(function (ok, no) { cv.toBlob(function (b) { if (b) ok(b); else no(new Error('blob')); }, 'image/png'); });
  });
}
// 내려받기(공유가 안 되는 곳) — <a download> · 되었는지는 알 수 없으므로 「시작했어요」까지만 말한다
function eduCertDownload(url, name) {
  var a = document.createElement('a');
  a.href = url; a.download = name; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
}
function renderEduCert(eid, courseId) {
  var u = loadUser(); if (!u) { renderEntryScreen(); return; }
  var el = document.getElementById('app');
  el.innerHTML = '<div class="edu-wrap"><div class="edu-top"><div class="edu-chips"><span class="edu-chip on">🎓 수료</span></div><button class="back-btn" id="edu-back">← 강좌</button></div>' +
    '<h2 class="edu-title">수료증</h2><div id="edu-cert-box"><div class="ev-loading">수료증을 그리는 중…</div></div></div>' +
    '<button class="home-fab" id="edu-home" aria-label="첫 화면으로">' + homeFabLabel(u, true) + '</button>';
  window.scrollTo(0, 0);
  document.getElementById('edu-home').addEventListener('click', function () { renderSummary(); });
  document.getElementById('edu-back').addEventListener('click', function () { renderEduCourse(courseId); });
  var my = ++eduState.screen;
  var fail = function (code) {
    if (my !== eduState.screen) return;
    var b = document.getElementById('edu-cert-box'); if (b) b.innerHTML = '<p class="edu-empty">' + eduEsc(eduCertErrText(code)) + '</p>';
  };
  // ⚠️ api(supaCall)는 응답에 error 가 있으면 throw 한다 — 거절 코드는 .catch 의 err.message
  api.eduCert(eid, u.user_id || '').then(function (r) {
    if (my !== eduState.screen) return;
    if (!r || r.ok !== true || !r.cert) { fail(r && r.error); return; }
    var cert = r.cert;
    return eduCertDraw(cert).then(function (blob) {
      if (my !== eduState.screen) return;
      var box = document.getElementById('edu-cert-box'); if (!box) return;
      if (eduState.certUrl) { try { URL.revokeObjectURL(eduState.certUrl); } catch (e) {} }
      var url = eduState.certUrl = URL.createObjectURL(blob), name = eduCertFileName(cert.certNo);
      box.innerHTML = '<div class="edu-cert-img"><img id="edu-cert-pic"></div>' +
        '<button class="edu-btn" id="edu-cert-save">저장·공유</button>' +
        '<p class="edu-how">안 되면 그림을 길게 눌러 저장해 주세요</p>' +
        '<p class="edu-note edu-cert-msg" id="edu-cert-msg" role="status"></p>' +
        '<div class="edu-about"><div class="edu-about-h">🔎 진위 확인</div><p class="edu-desc">수료번호 <b>' + eduEsc(cert.certNo) + '</b><br>' +
        '수료번호로 진위를 확인할 수 있어요: gocheok.onlybible.kr/cert</p></div>';
      var pic = document.getElementById('edu-cert-pic');
      pic.alt = '수료증 — ' + String(cert.name || '') + ' · ' + String(cert.title || '');   // 속성으로(글자 그대로)
      pic.src = url;
      var say = function (t) { var x = document.getElementById('edu-cert-msg'); if (x) x.textContent = t; };
      document.getElementById('edu-cert-save').addEventListener('click', function () {
        var file = null;
        try { file = new File([blob], name, { type: 'image/png' }); } catch (e) {}
        var share = false;
        try { share = !!(file && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })); } catch (e) {}
        if (share) {   // 폰 — 공유 시트(사진에 저장·카톡 보내기)
          navigator.share({ files: [file], title: '수료증' }).catch(function (err) {
            if (err && err.name === 'AbortError') return;   // 성도님이 닫았다
            eduCertDownload(url, name); say('그림 파일 내려받기를 시작했어요.');
          });
          return;
        }
        eduCertDownload(url, name); say('그림 파일 내려받기를 시작했어요.');
      });
    });
  }).catch(function (err) { fail(err && err.message); });
}
