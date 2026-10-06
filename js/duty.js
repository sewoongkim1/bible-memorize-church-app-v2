// 🙋 봉사 당번 — 당번 목록·내 당번·자세히·지원·취소·「못 가게 됐어요」(2026-10-06 · 설계 docs/superpowers/specs/2026-10-06-duty-roster-design.md §6)
//   ⚠️ 정원·겹침·잠금·쉼은 서버(SQL 함수 supabase/duty.sql)가 정한다 — 화면은 받은 판정(why·locked·lockAt·staffAdded·me.why)을 보여 주기만 한다.
//   ⚠️ 문(dutyVisible — app.js)은 첫 화면 단추를 숨기는 것뿐, 막는 것은 서버다(dutyGate — 읽기도 막는다 · 당번표에 이름이 나가므로).
//   ⚠️ 이름·담당자가 적은 글은 모두 dutyEsc 로 넣는다. appModal 의 msg 는 HTML 그대로 들어간다 — 거기 넣는 글도 모두 dutyEsc.
//   ⚠️ 자리·지원 번호는 화면 글자(data-*)에 싣지 않는다 — 차례 번호만 싣고 dutyState 의 배열에서 꺼낸다.
//   ⚠️ 늦게 온 응답이 다른 화면을 덮지 않게 — 받는 쪽은 화면 번호(dutyState.screen)와 .duty-wrap 이 아직 있는지를 함께 본다.
//      일을 끝낸 뒤 다시 그리기는 dutyRedraw 로만 · soft(화면을 비우지 않고 다시 받기)는 당번 화면이 떠 있을 때만 돈다(tests/duty-flow.test.cjs).
//   ⚠️ 일(지원·취소·표시)의 답은 세 가지다 — 됐다 · 서버가 거절했다(표에 있는 코드) · **됐는지 알 수 없다**(통신이 끊김·서버 오류 — 요청이 안 나간 것과 답만 잃은 것을 가를 수 없다).
//      알 수 없으면 「잠시 뒤 다시 해 주세요」가 아니라 「확인하지 못했어요」라고 말하고 화면을 다시 받는다(dutyErrKnown). 알림은 dutyTell 로만 — 떠 있는 창을 지우지 않고, 로그아웃 뒤에는 버린다.
//   ⚠️ 날짜가 넷 이상인 당번은 **달력**으로 그린다(dutyCalUse) — 달력에서 날짜를 누르면 그날의 자리만 아래에 보인다. 날짜가 적으면(한두 번짜리 모집) 날짜 카드를 늘어놓는다.
//      고른 날(dutyState.calSel)은 화면 상태일 뿐 — 서버에 보내지 않고, 판정(why·locked…)은 받은 것을 그대로 쓴다. 달력 칸의 뜻(dutyCalCell)도 dutySlotView 에서 나온다(규칙을 다시 짜지 않는다).
//   ⚠️ 성도님께 하는 말은 어느 경우에도 참인 말만 — 「못 가게 됐어요」는 담당자 휴대폰으로 가는 알림이 아니라 당번표의 표시다(「알렸어요」라고 하지 않는다) ·
//      취소는 「확정 전까지」다(전날 저녁은 「늦어도」 — 담당자가 먼저 확정할 수 있다).

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
// 언제까지 취소할 수 있나 — 잠김은 「담당자 확정 또는 전날 저녁」이라 그 시각은 「늦어도」다.
//   「○일 저녁 7시까지 취소할 수 있어요」라고 단정하면 담당자가 먼저 확정한 날에 사실이 아닌 말이 된다(검토 반영 2026-10-06).
function dutyUntilText(lockAt) {
  var until = dutyLockText(lockAt);
  return '확정 전까지 앱에서 취소할 수 있어요' + (until ? '(늦어도 ' + until + '에 확정돼요).' : '.');
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
  return '못 간다고 표시했어요';
}
// 내 줄의 모습 — x = { locked, lockAt, off(그날이나 그 자리가 쉼), dayOff(그날이 쉼), status, byStaff, staffAdded, asked, why }
//   → { tone: ok|lock|soft|ask, head, sub, btn: null | { act: cancel|ask|unask, label } }
//   담당자가 뺀 줄은 「담당자가 빼 드렸어요」(성도님 화면에 removed 같은 말을 쓰지 않는다).
//   단추는 서버 규칙(duty_mine 의 canCancel·canAsk — 취소 = 내가 지원한 줄 · 안 잠김 / 알리기 = 잠겼거나 담당자가 넣은 줄)과 같은 뜻으로 고른다.
//   쉬는 날·자리에는 알리기 단추를 두지 않는다(안 나오셔도 되는 날이다) — tests/duty-front.test.cjs 가 조합마다 맞대 본다.
function dutyMyView(x) {
  var o = x || {};
  if (o.status && o.status !== 'active') return { tone: 'soft', head: '담당자가 빼 드렸어요', sub: '안 나오셔도 돼요. 궁금하시면 담당자께 말씀해 주세요.', btn: null };
  // 쉼 — 안 나오셔도 된다. 다시 열리면 줄이 그대로 살아나므로, 그때 못 오실 분이 미리 뺄 수 있게 취소는 남긴다(잠기기 전 · 내가 지원한 줄만).
  //   그날이 쉬는지 이 자리만 쉬는지에 따라 말을 가른다 — 자리만 쉬는데 「이날은 쉬어요」라고 하면 같은 날 다른 당번까지 빠지신다.
  if (o.off) {
    var cancel = !o.locked && !o.staffAdded ? { act: 'cancel', label: '지원 취소' } : null;
    return o.dayOff ? { tone: 'soft', head: '😴 이날은 쉬어요', sub: '안 나오셔도 돼요. 다시 서게 되면 그대로 이어져요.', btn: cancel }
      : { tone: 'soft', head: '😴 이 자리는 쉬어요', sub: '이 자리는 안 나오셔도 돼요. 다시 열리면 그대로 이어져요.', btn: cancel };
  }
  // 「못 가게 됐어요」 표시 — 담당자 휴대폰으로 가는 알림이 아니다(담당자 당번표에 표시가 뜬다). 그래서 「알렸어요」라고 하지 않고, 급하면 직접 연락하시게 한다.
  //   담당자가 그 뒤 확정을 풀어 잠기지 않은 내 지원 줄이 되면 바로 취소할 수 있다(취소하면 표시도 함께 지워진다).
  if (o.asked && !o.locked && !o.staffAdded) return { tone: 'ask', head: '📨 못 간다고 표시해 두셨어요', sub: '확정이 풀려 지금은 앱에서 바로 취소하실 수 있어요.', btn: { act: 'cancel', label: '지원 취소' } };
  if (o.asked) return { tone: 'ask', head: '📨 담당자 당번표에 표시했어요', sub: dutyWhyText(o.why) + ' — 담당자가 당번표에서 보고 정리해 드려요. 급하시면 담당자께 직접 연락해 주세요.', btn: { act: 'unask', label: '표시 거두기' } };
  if (o.locked) return { tone: 'lock', head: '🔒 확정됐어요', sub: '이대로 서시면 돼요. 앱에서는 취소할 수 없어요 — 못 오시게 되면 아래 단추로 알려 주세요.', btn: { act: 'ask', label: '못 가게 됐어요' } };
  if (o.staffAdded) return { tone: 'ok', head: '✅ 담당자가 넣어 드렸어요', sub: '이대로 서시면 돼요. 못 오시게 되면 아래 단추로 알려 주세요.', btn: { act: 'ask', label: '못 가게 됐어요' } };
  return { tone: 'ok', head: '✅ 지원했어요', sub: '이대로 서시면 돼요. ' + dutyUntilText(o.lockAt), btn: { act: 'cancel', label: '지원 취소' } };
}
// 자리 한 칸의 모습 — day = {off, locked, lockAt} · slot = 서버 duty_board_view 의 자리(why·mine·n·capacity) · me = {why}(이 계정이 앱에서 지원하지 못하는 까닭)
//   → { kind, my: dutyMyView | null, line: 상태 한 줄, btn: null | { act: apply, label } }
//   찬 자리·쉬는 자리·시작한 자리·지원을 받지 않는 자리에는 단추를 두지 않는다(눌러도 거절만 나올 단추는 없다) —
//   어린이·청소년 부서 계정·당번표에 실을 수 없는 이름의 계정(me.why)도 같다(까닭은 화면 맨 위 한 줄 — dutyMeNote).
function dutySlotView(day, slot, me) {
  var d = day || {}, s = slot || {}, m = s.mine;
  if (m) {
    return { kind: 'mine', line: '', btn: null,
      my: dutyMyView({ locked: d.locked === true, lockAt: d.lockAt, off: d.off === true || s.off === true, dayOff: d.off === true, status: m.status, byStaff: m.byStaff === true,
        staffAdded: m.staffAdded === true, asked: m.asked === true, why: m.why }) };
  }
  var w = s.why || '';
  if (w === 'off' || d.off === true || s.off === true) return { kind: 'off', my: null, line: '쉬어요', btn: null };
  if (w === 'closed') return { kind: 'closed', my: null, line: '담당자가 넣는 자리예요', btn: null };
  if (w === 'started') return { kind: 'started', my: null, line: '이미 시작했어요', btn: null };
  if (w === 'full') return { kind: 'full', my: null, line: '다 찼어요', btn: null };
  if (w) return { kind: 'closed', my: null, line: '지금은 지원을 받지 않아요', btn: null };   // 모르는 까닭 — 단추를 두지 않는다
  return { kind: 'open', my: null, line: dutyNeedText(s), btn: me && me.why ? null : { act: 'apply', label: '지원하기' } };
}
// 이 계정이 앱에서 지원하지 못하는 까닭 한 줄(당번 자세히 맨 위) — 서버가 준 me.why(guardian · bad-name) · 지원할 수 있으면 빈 글
function dutyMeNote(me) {
  var w = me && me.why;
  return w === 'guardian' || w === 'bad-name' ? dutyErrText(w) : '';
}
// 그날 머리 아래 한 줄 — 쉼 · 확정 · 언제 확정되나
//   staffOnly = 담당자가 넣는 당번(지원 멈춤) — 앱에서 지원·취소하지 않으므로 그 말을 쓰지 않는다(확정 여부와 메모만).
//   「언제까지 취소」는 내 줄 상자와 지원 확인 창이 말한다 — 여기서는 그날에 대해 늘 참인 말만(담당자가 넣어 준 줄을 가진 분도 같은 머리를 본다).
function dutyDayLine(d, staffOnly) {
  var o = d || {};
  if (o.off) return '😴 이날은 쉬어요' + (o.note ? ' — ' + o.note : '');
  var note = o.note ? ' · ' + o.note : '';
  if (staffOnly) return o.locked ? '🔒 확정된 날이에요' + note : (o.note || '');
  if (o.locked) return '🔒 확정된 날이에요 — 지금 지원하면 앱에서 취소할 수 없어요' + note;
  var until = dutyLockText(o.lockAt);
  return until ? '늦어도 ' + until + '에 확정돼요 — 확정 뒤에는 앱에서 취소할 수 없어요' + note : (o.note || '');
}
// 지원 확인 창의 글 — locked 면 「취소할 수 없는 날」 창(단추 「취소 못 해도 지원하기」)
//   → { title, ok, strong, where, who, lines: [여느 줄 …] } — 그리는 쪽이 모두 dutyEsc 해서 넣는다
function dutyApplyAsk(board, day, slot, who, locked) {
  var when = dutyMdw(day && day.date) + ' · ' + dutySlotName(slot);
  var where = [dutyTimeText(slot), board && board.place].filter(Boolean).join(' · ');
  if (locked) {
    return { title: '⚠️ 취소할 수 없는 날이에요', ok: '취소 못 해도 지원하기', strong: when, where: where, who: who || '',
      lines: ['확정된 날이라 지원하면 앱에서 취소할 수 없어요.', '못 오시게 되면 담당자께 알려 주셔야 해요.', '이 자리에 이름이 보여요.'] };
  }
  return { title: '🙋 지원할까요?', ok: '지원하기', strong: when, where: where, who: who || '',
    lines: ['이 자리에 이름이 보여요.', dutyUntilText(day && day.lockAt)] };
}
// 표에 없는 코드(통신이 끊김 · 서버 오류)는 **됐는지 알 수 없다** — 서버에는 이미 쓰였을 수 있다. 「다시 해 주세요」라고 하지 않고 확인하시게 한다(화면도 다시 받는다 — dutyErrKnown).
var DUTY_UNSURE = '연결이 고르지 않아 됐는지 확인하지 못했어요. 당번표에서 확인해 주세요.';
var DUTY_UNSURE_FAIL = '화면을 새로 받지 못했어요 — 잠시 뒤 다시 열어 확인해 주세요.';
// 서버 거절 → 성도님께 보일 말. x = 거절에 딸려 온 값(overlap 의 with · too-many 의 max)
//   'off' 는 그날이 쉬든 자리만 쉬든 같은 코드로 온다 — 「쉬는 날이에요」라고만 하면 자리만 쉴 때 같은 날 다른 당번까지 빠지신다.
//   'no-user'(서버에 계정 줄이 없다 — 기록을 합쳐 옛 계정이 사라진 기기)는 로그인돼 있는 분께 온다 — 「로그인한 뒤에」라고 하지 않는다(닫힘과 같은 말 · 목록으로 돌린다).
//   겹침에 with 가 없으면 준비 중 당번에 담당자가 넣어 둔 줄이다 — 「내 당번」에는 보이지 않으므로(받는 중·지원 멈춤 당번만 싣는다) 그 말을 함께 한다.
//     「아직 열리지 않은」이라고 하지 않는다 — 받는 중이던 당번을 준비로 되돌린 것일 수 있다(「지금 열려 있지 않은」).
//   'guardian' 은 어린이 부서만이 아니다(사랑부 · 중등부 1·2학년 포함 — 중3·고등부는 지원한다) — 부서 이름을 넘겨짚지 않는다.
function dutyErrText(code, x) {
  var o = x || {};
  if (code === 'overlap') {
    var w = o.with;
    if (w && (w.board || w.service)) {
      return '같은 날 겹치는 시간에 이미 ' + [w.board, [w.service, w.task].filter(Boolean).join(' ')].filter(Boolean).join(' ') + (w.start ? '(' + w.start + ')' : '') + ' 당번이 있어요.';
    }
    return '같은 날 겹치는 시간에 이미 다른 당번이 있어요. 「내 당번」에 보이지 않으면 지금 앱에 열려 있지 않은 당번이에요 — 담당자께 말씀해 주세요.';
  }
  if (code === 'too-many') return '이 당번은 한 분이 ' + (dutySeatWord(o.max) || '정해진 수') + '까지 미리 잡아 둘 수 있어요. 서신 뒤에 다시 지원해 주세요.';
  var W = { 'full': '방금 자리가 찼어요.', 'closed': '지금은 앱에서 지원을 받지 않는 자리예요. 담당자께 말씀해 주세요.', 'off': '쉬는 날이거나 쉬는 자리예요.',
    'past': '지난 날짜예요.', 'started': '이미 시작한 자리예요.', 'not-yet': '아직 지원을 받지 않는 날짜예요.', 'after-until': '지원을 받지 않는 날짜예요.',
    'removed-by-staff': '담당자가 빼 드린 자리예요. 다시 서시려면 담당자께 말씀해 주세요.',
    'guardian': '이 계정은 앱에서 바로 지원할 수 없어요(보호자 확인이 필요한 부서·학년이에요). 부서 선생님이나 담당자께 말씀해 주세요.',
    'bad-name': '당번표에 실을 수 없는 이름이에요. 설정의 「로그인 정보변경」에서 이름을 고친 뒤 지원해 주세요.',
    'locked': '확정된 날이라 앱에서 취소할 수 없어요. 「못 가게 됐어요」로 담당자께 알려 주세요.',
    'locked-day': '그사이 확정된 날이 됐어요. 다시 확인해 주세요.',
    'staff-row': '담당자가 넣어 드린 자리라 앱에서 취소할 수 없어요. 「못 가게 됐어요」로 알려 주세요.',
    'not-locked': '아직 확정 전이라 「지원 취소」로 바로 취소하실 수 있어요.',
    'not-active': '이미 처리된 지원이에요.', 'changed': '그사이 자리가 바뀌었어요. 다시 확인해 주세요.',
    'not-open': '지금은 봉사 당번을 쓸 수 없어요. 잠시 뒤 다시 열어 주세요.', 'no-user': '지금은 봉사 당번을 쓸 수 없어요. 잠시 뒤 다시 열어 주세요.', 'not-found': '찾을 수 없어요. 다시 열어 주세요.' };
  return Object.prototype.hasOwnProperty.call(W, code) ? W[code] : DUTY_UNSURE;
}
// 서버가 거절로 준 코드인가(제 말이 있는 것) — 아니면 됐는지 알 수 없는 답이다
function dutyErrKnown(code) { return dutyErrText(code) !== DUTY_UNSURE; }
// 거절 뒤 화면을 다시 받아야 하는가 — 서버 상태가 내가 보던 것과 달라졌다는 뜻의 거절들
function dutyNeedsReload(code) {
  return ['full', 'closed', 'off', 'past', 'started', 'not-yet', 'after-until', 'removed-by-staff', 'locked', 'locked-day', 'staff-row', 'not-locked', 'not-active', 'changed', 'not-found'].indexOf(code) >= 0;
}
// 당번 카드의 한 줄 — 「손이 필요한 날 · 10월 18일(일) 한 분 · 10월 25일(일) 두 분」 · 지원 멈춤 당번은 그 말
//   need 가 비는 때는 여럿이다(다 참 · 모두 쉬는 날 · 보이는 날짜가 아직 없음 · 오늘 시작한 자리만 남음) — 어느 쪽에도 참인 말만 쓴다.
function dutyBoardLine(b) {
  if (!b) return '';
  if (b.status === 'closed') return '담당자가 넣는 당번이에요 — 당번표를 볼 수 있어요';
  var need = (b.need || []).filter(function (x) { return x && dutyMdw(x.date) && Number(x.need) > 0; });
  if (!need.length) return '지금은 지원할 수 있는 자리가 없어요';
  return '손이 필요한 날 · ' + need.map(function (x) { return dutyMdw(x.date) + ' ' + dutyCountWord(x.need); }).join(' · ');
}
// 「내 당번」 카드 — m = 서버 duty_mine 의 한 줄 → { title, where, my: dutyMyView, note, chips: [글], contact }
//   note = 쉬는 **날**의 메모(자리만 쉴 때는 그날 메모를 붙이지 않는다 — 「손이 더 필요해요」 같은 메모가 「쉬어요」 옆에 붙는다)
//   contact = 스스로 뺄 수 없는 줄(잠김 · 담당자가 넣음 · 담당자가 뺌)에만 싣는 문의처 — 「담당자께」라고 말하는 줄에는 닿을 길을 함께 둔다
function dutyMineCard(m) {
  var o = m || {};
  var chips = [];
  if (o.movedFrom != null && o.status === 'active') chips.push('담당자가 자리를 옮겨 드렸어요');
  if (o.overlap === true && o.status === 'active') chips.push('⚠️ 같은 날 시간이 겹치는 다른 당번이 있어요');
  return { title: [dutyMdw(o.date), o.board].filter(Boolean).join(' · '),
    where: [dutySlotName(o), dutyTimeText(o), o.place].filter(Boolean).join(' · '),
    my: dutyMyView({ locked: o.locked === true, lockAt: o.lockAt, off: o.off === true, dayOff: o.dayOff === true, status: o.status, byStaff: o.byStaff === true,
      staffAdded: o.staffAdded === true, asked: o.asked === true, why: o.why }),
    note: o.dayOff === true && o.note ? o.note : '', chips: chips,
    contact: (o.status && o.status !== 'active') || o.locked === true || o.staffAdded === true ? String(o.contact == null ? '' : o.contact) : '' };
}
// 문의 한 줄 — 번호가 있으면 눌러서 바로 걸린다(숫자만 tel: 로 · 나머지 글자는 모두 이스케이프)
function dutyContactHtml(t) {
  var s = String(t == null ? '' : t); if (!s) return '';
  var m = s.match(/0\d{1,2}[-\s]?\d{3,4}[-\s]?\d{4}/);
  if (!m) return dutyEsc(s);
  return dutyEsc(s.slice(0, m.index)) + '<a class="duty-tel" href="tel:' + m[0].replace(/\D/g, '') + '">' + dutyEsc(m[0]) + '</a>' + dutyEsc(s.slice(m.index + m[0].length));
}
// ── 달력(2026-10-06 친구 요청 — 보이는 기간이 1년이면 날짜 카드가 52장이 된다) ──
// 날짜가 이 수 이상이면 달력으로 그린다. 매주 도는 당번은 보이는 기간이 4주만 돼도 4~5개라 늘 달력이고(2주면 2~3개라 늘 목록 — 주마다 뒤바뀌지 않는다),
//   한두 번짜리 모집(김장 등)은 날짜 카드를 그대로 보여 준다.
var DUTY_CAL_MIN = 4;
function dutyCalUse(days) { return (days || []).length >= DUTY_CAL_MIN; }
// 달력의 그날 한 칸 → { kind, n, cap, need, mine, locked }
//   kind: off(쉬는 날 — 그날이 쉬거나 자리가 모두 쉰다) | mine(내가 서는 날) | need(지원할 수 있는 빈 자리가 있다) |
//         none(날짜는 있지만 지금 지원할 자리가 없다 — 다 참·시작함·담당자가 넣는 자리)
//   n / cap: 채워진 인원 / 필요 인원(칸에 「1/2」로 적는다 — 친구 요청 2026-10-06). 쉬는 자리는 세지 않고, 담당자가 정원을 넘겨 넣은 자리는 정원까지만 센다
//     (한 자리에 셋을 넣었다고 다른 빈 자리가 찬 것처럼 보이지 않게 — 「3/3」인데 손이 필요한 날이 되지 않는다).
//   need: 지금 지원을 받는 빈 자리 수. 뜻은 자리 한 칸의 판정(dutySlotView = 서버가 준 why)에서 나온다(규칙을 다시 짜지 않는다).
//   내 줄이 있어도 담당자가 뺀 줄·쉬는 자리의 줄은 「내가 서는 날」로 치지 않는다.
//   me = { why, staffOnly } — staffOnly = 담당자가 넣는 당번(지원 멈춤). 그 당번의 자리는 모두 「담당자가 넣는 자리」(why closed)이고 그 정원이 곧 필요 인원이다.
//     받는 중 당번의 「담당자가 넣는 자리」는 남은 자리다(뺀 틀·요일을 바꾼 틀 — 새 지원을 받지 않는다): 서 있는 분은 세되 **빈 칸은 필요 인원으로 치지 않는다**
//     (서버의 「손이 필요한 수」도 남은 자리를 뺀다 — 「4/6」인데 지원할 자리가 없는 날이 되지 않게).
function dutyCalCell(day, me) {
  var d = day || {}, n = 0, cap = 0, need = 0, mine = false, live = 0, staffOnly = !!(me && me.staffOnly);
  (d.slots || []).forEach(function (s) {
    if (!s || s.off === true) return;
    var v = dutySlotView(d, s, me), c = Math.max(0, Number(s.capacity) || 0), k = Math.max(0, Number(s.n) || 0);
    if (v.kind === 'closed' && !staffOnly) c = Math.min(k, c);
    live++; cap += c; n += Math.min(k, c);
    if (v.kind === 'open') need += Math.max(0, c - k);
    if (v.kind === 'mine' && (!s.mine.status || s.mine.status === 'active')) mine = true;
  });
  if (d.off === true || live === 0) return { kind: 'off', n: 0, cap: 0, need: 0, mine: false, locked: d.locked === true };
  return { kind: mine ? 'mine' : need > 0 ? 'need' : 'none', n: n, cap: cap, need: need, mine: mine, locked: d.locked === true };
}
// 칸에 적는 글 — 「1/2」(채워진 인원/필요 인원) · 쉬는 날은 「쉼」 · 셀 것이 없는 날(아무도 없는 남은 자리뿐)은 빈 글
function dutyCalMark(cell) {
  var c = cell || {};
  return c.kind === 'off' ? '쉼' : !(Number(c.cap) > 0) ? '' : (Number(c.n) || 0) + '/' + (Number(c.cap) || 0);
}
// 그 칸을 읽어 주는 말(화면 낭독) — 「10월 18일(일) — 손이 필요한 날이에요 · 필요 2명 가운데 1명 채워졌어요」
function dutyCalLabel(day, cell) {
  var c = cell || {}, when = dutyMdw(day && day.date);
  if (c.kind === 'off') return when + ' — 쉬어요';
  var what = c.kind === 'mine' ? '내 당번이 있어요' : c.kind === 'need' ? '손이 필요한 날이에요' : '지금 지원할 수 있는 자리가 없어요';
  return when + ' — ' + what + (Number(c.cap) > 0 ? ' · 필요 ' + Number(c.cap) + '명 가운데 ' + (Number(c.n) || 0) + '명 채워졌어요' : '') + (c.locked === true ? ' · 확정된 날' : '');
}
// 날짜들이 걸친 달 — ['2026-10', '2026-11'] (이른 달부터 · 날짜가 없는 달은 건너뛴다)
function dutyCalMonths(days) {
  var out = [];
  (days || []).forEach(function (d) { var ym = String((d && d.date) || '').slice(0, 7); if (/^\d{4}-\d{2}$/.test(ym) && out.indexOf(ym) < 0) out.push(ym); });
  return out.sort();
}
function dutyCalTitle(ym) {   // 2026년 10월
  var s = String(ym || '');
  return /^\d{4}-\d{2}$/.test(s) ? Number(s.slice(0, 4)) + '년 ' + Number(s.slice(5, 7)) + '월' : '';
}
function dutyCalMonthWord(ym) {   // 10월 — 앞뒤 달 단추에
  var s = String(ym || '');
  return /^\d{4}-\d{2}$/.test(s) ? Number(s.slice(5, 7)) + '월' : '';
}
// 그 달의 칸들(일요일부터) — 앞 빈칸은 { date: '', n: 0 } · 날짜 칸은 { date: 'YYYY-MM-DD', n: 날 }
function dutyCalMonth(ym) {
  var s = String(ym || ''); if (!/^\d{4}-\d{2}$/.test(s)) return [];
  var y = Number(s.slice(0, 4)), m = Number(s.slice(5, 7)); if (!(m >= 1 && m <= 12)) return [];
  var pad = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(), last = new Date(Date.UTC(y, m, 0)).getUTCDate(), out = [];
  for (var i = 0; i < pad; i++) out.push({ date: '', n: 0 });
  for (var k = 1; k <= last; k++) out.push({ date: s + '-' + (k < 10 ? '0' + k : k), n: k });
  return out;
}
// 고를 날 — 바라는 날(want — 내 당번 카드로 온 날 · 방금 지원·취소한 날 · 전에 고른 날)이 당번표에 있으면 그날,
//   아니면 내가 서거나 손이 필요한 가장 이른 날, 그것도 없으면 첫 날. 날짜가 없으면 ''.
function dutyCalPick(days, want, me) {
  var list = days || [], i;
  if (!list.length) return '';
  for (i = 0; i < list.length; i++) if (want && list[i].date === want) return list[i].date;
  for (i = 0; i < list.length; i++) { var k = dutyCalCell(list[i], me).kind; if (k === 'mine' || k === 'need') return list[i].date; }
  return list[0].date;
}
// 앞뒤 달로 — 고른 날(sel)의 달에서 날짜가 있는 앞(prev)·다음(next) 달로 가 그 달에서 고를 날을 준다. 그쪽에 달이 없으면 ''.
function dutyCalStep(days, sel, dir, me) {
  var months = dutyCalMonths(days), at = months.indexOf(String(sel || '').slice(0, 7));
  var to = at < 0 ? '' : months[at + (dir === 'next' ? 1 : -1)];
  if (!to) return '';
  return dutyCalPick((days || []).filter(function (d) { return String((d && d.date) || '').slice(0, 7) === to; }), '', me);
}
// 달력 한 달(고른 날이 든 달) — 날짜가 있는 날만 누를 수 있다(단추). 칸: 날짜 아래 「채워진 인원/필요 인원」 · 손이 필요한 날은 초록 · 내 당번은 남색 ·
//   쉬는 날은 「쉼」 · 고른 날은 겹테두리 · 오늘은 표시(자리가 있는 날은 숫자 위 금색 줄 · 없는 날은 숫자 밑줄 — 밑줄이 인원 글에 얹히지 않게).
//   앞뒤 달 단추는 날짜가 있는 달로만(「◀ 10월」 · 「12월 ▶」 — 그쪽에 달이 없으면 단추도 없다) · 아래 풀이는 이 당번표에 실제로 있는 표시만.
function dutyCalHtml(days, sel, today, me) {
  var list = days || [], ym = String(sel || '').slice(0, 7), months = dutyCalMonths(list), at = months.indexOf(ym), by = {}, seen = {};
  list.forEach(function (d) { if (!d) return; var x = dutyCalCell(d, me); by[d.date] = { day: d, cell: x }; seen[x.kind] = true; });
  var cells = dutyCalMonth(ym).map(function (c) {
    if (!c.date) return '<span class="duty-cal-c"></span>';
    var it = by[c.date], tcls = c.date === today ? ' today' : '';
    if (!it) return '<span class="duty-cal-c' + tcls + '"><span>' + c.n + '</span></span>';
    var on = c.date === sel;
    return '<button type="button" class="duty-cal-c has k-' + it.cell.kind + (on ? ' on' : '') + tcls + '" data-date="' + dutyEsc(c.date) + '" aria-pressed="' + on +
      '" aria-label="' + dutyEsc(dutyCalLabel(it.day, it.cell) + (c.date === today ? ' · 오늘' : '')) + '"><span>' + c.n + '</span><i aria-hidden="true">' + dutyEsc(dutyCalMark(it.cell)) + '</i></button>';
  }).join('');
  var nav = function (dir, to) {
    if (!to) return '<span></span>';
    return '<button type="button" class="duty-cal-nav" data-cal="' + dir + '" aria-label="' + dutyEsc(dutyCalTitle(to)) + ' 보기">' +
      (dir === 'prev' ? '◀ <span class="m">' + dutyEsc(dutyCalMonthWord(to)) + '</span>' : '<span class="m">' + dutyEsc(dutyCalMonthWord(to)) + '</span> ▶') + '</button>';
  };
  var num = seen.need || seen.mine || seen.none ? '숫자는 채워진 인원 / 필요 인원이에요.' : '';
  var key = [seen.need ? '<span class="ki"><span class="k need" aria-hidden="true"></span>손이 필요한 날</span>' : '',
    seen.mine ? '<span class="ki"><span class="k mine" aria-hidden="true"></span>내 당번</span>' : ''].filter(Boolean).join(' · ');
  return '<div class="duty-cal" role="group" aria-label="날짜 고르기">' +
    '<div class="duty-cal-h">' + nav('prev', at > 0 ? months[at - 1] : '') + '<b>' + dutyEsc(dutyCalTitle(ym)) + '</b>' + nav('next', at >= 0 ? months[at + 1] : '') + '</div>' +
    '<div class="duty-cal-w" aria-hidden="true"><span>일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span>토</span></div>' +
    '<div class="duty-cal-g">' + cells + '</div>' +
    '<p class="duty-cal-k">' + [num, key, '날짜를 누르면 그날의 자리가 아래에 보여요.'].filter(Boolean).join('<br>') + '</p></div>';
}
// 알림을 눌러 들어온 주소인가(3단계) — 주소(전체 주소든 ? 뒤든)에 duty=1 이 있나.
//   api 의 당번 알림이 「https://gocheok.onlybible.kr/?duty=1」로 보낸다(서비스워커가 &from=push 를 붙인다).
function dutyDeepLink(href) {
  var s = String(href == null ? '' : href), q = s.indexOf('?');
  if (q < 0) return false;
  var parts = s.slice(q + 1).split('#')[0].split('&');
  for (var i = 0; i < parts.length; i++) if (parts[i] === 'duty=1') return true;
  return false;
}
// ── 봉사 당번 순수 함수 (여기까지) ──

// screen: 화면이 바뀔 때마다 올라가는 번호 — 늦게 온 응답이 다른 화면을 덮지 않게 · at: 지금 보는 화면(list|board|'' = 당번 화면을 떠남) ·
// me: 이 계정이 앱에서 지원하지 못하는 까닭({why}) · loadedAt: 마지막으로 받은 때 · busy·busyAt: 일을 보내는 중 ·
// calSel: 달력에서 고른 날(당번을 새로 열면 비운다 — 화면 상태일 뿐 서버에 보내지 않는다) ·
// tok: 보낸 일(지원·취소·표시)의 번호 — 20초가 넘어 늦게 온 답이 그 뒤에 보낸 다른 일의 막음을 풀지 않게 ·
// gen: 세대(로그아웃·신원 바꿈 때 올린다 — 앞사람의 일에 온 답을 다음 분께 알리지 않는다) ·
// first: 「내 당번」 카드로 새로 연 당번표가 첫 그리기에 고를 날짜 — 첫 읽기가 조용한 다시 받기에 밀려나도 뒤 읽기가 이어받는다(첫 그리기 뒤 비운다) ·
// wasCal: 바로 앞 그리기가 달력이었나(달력 ↔ 날짜 카드로 모양이 바뀐 그리기에서는 방금 한 날로 굴린다) ·
// reads: 읽기가 성공한 수(미뤄 둔 「화면을 못 받았다」는 말이 그사이 낡았는지 본다) ·
// owe: 일은 됐는데 화면을 아직 새로 받지 못한 동안 품고 있는 말(다음 읽기가 성공하면 지우고 · 실패하면 그때 알린다 — 다시 받기가 다른 다시 받기에 밀려나도 사라지지 않게)
var dutyState = { screen: 0, at: '', boards: [], mine: [], me: {}, cur: '', board: null, days: [], loadedAt: 0, busy: false, busyAt: 0, calSel: '', first: '', wasCal: false, tok: 0, gen: 0, owe: '', reads: 0 };
// 계정 번호(user_id)를 아직 못 받았을 때 — 첫 로그인 직후 서버 답을 기다리는 몇 초 · 로그인 호출이 실패한 실행.
//   그대로 서버를 부르면 「문 닫힘」 답이 와 「아직 열지 않았어요」라고 **사실이 아닌 말**을 하게 된다(문은 계정이 있어야 열린다).
var DUTY_NO_ID = '아직 서버와 연결되지 않았어요. 잠시 뒤 다시 열어 주세요.';
// 배포 직후 CDN 이 옛 js/api.js 를 주는 몇 분 — 「불러오는 중」에 갇히지 않게
var DUTY_OLD_API = '새 화면을 받는 중이에요. 잠시 뒤 다시 열어 주세요.';
var DUTY_LOAD_FAIL = '지금 불러올 수 없어요. 잠시 뒤 다시 열어 주세요.';
// 읽기가 「닫힘」으로 왔을 때 — 단추가 보인 분(문이 열렸거나 시험 참여자)께 닫힘 답이 오는 것은 문이 그사이 닫혔거나 **이 기기의 계정이 서버에 없을 때**
//   (기록을 합쳐 옛 계정이 사라진 기기 — 다음 로그인 동기화에서 새 계정을 받는다)다. 「아직 열지 않았어요」는 뒤쪽에서 사실이 아니므로 둘 다에 참인 말을 쓴다.
var DUTY_CLOSED = '지금은 봉사 당번을 볼 수 없어요. 잠시 뒤 다시 열어 주세요.';
// 일을 보내는 중인가 — 20초가 넘도록 답이 없으면 놓아 준다(통신이 끊긴 요청 하나가 모든 단추를 말없이 막지 않게).
//   그 뒤 같은 일을 다시 눌러도 서버가 한 번만 받는다(지원은 already · 취소는 not-active).
function dutyBusy() { return dutyState.busy && Date.now() - dutyState.busyAt < 20000; }
//   막음을 걸면(on) 그 일의 번호를 돌려준다 — 푸는 쪽은 제 번호일 때만 푼다(늦게 온 앞 일의 답이 지금 보내는 일의 막음을 풀지 않게).
function dutyHold(on) { dutyState.busy = !!on; dutyState.busyAt = on ? Date.now() : 0; if (on) dutyState.tok++; return dutyState.tok; }
// 당번 화면을 떠난다(첫 화면으로) — 화면 번호를 올려, 받는 중이던 응답이 뒤늦게 와도 버려지게 한다.
function dutyLeave() { dutyState.screen++; dutyState.at = ''; dutyState.owe = ''; dutyState.first = ''; }
// 알림 — 다른 창(확인 창·앞선 알림)이 떠 있으면 그 창을 지우지 않고 닫힌 뒤에 띄운다(appModal 은 떠 있는 창을 답 없이 지운다 — 늦게 온 거절이 읽던 확인 창을 없애지 않게).
//   gen = 그 일을 보낸 때의 세대 — 그사이 로그아웃·신원 바꿈이 있었으면 버린다(앞사람의 당번 이름·시각을 다음 분께 보이지 않는다). html 은 부르는 쪽이 dutyEsc 한 글.
//   「취소할 수 없는 날」 다시 묻기 창도 같은 길로 띄운다(dutyWhenClear) — 그 창이 떠 있던 알림을 지우지 않게.
//   기다리는 것들은 한 줄(dutyWait)에 서서 **온 차례대로** 뜬다(뒤에 온 알림이 앞지르지 않게) — 하나가 창을 띄우면 다음 것은 그 창이 닫힌 뒤에.
var dutyWait = [], dutyWaitOn = false;
function dutyWhenClear(gen, fn) { dutyWait.push({ gen: gen, fn: fn }); dutyWaitRun(); }
function dutyWaitRun() {
  if (dutyWaitOn) return;
  while (dutyWait.length) {
    if (document.getElementById('app-modal')) { dutyWaitOn = true; setTimeout(function () { dutyWaitOn = false; dutyWaitRun(); }, 400); return; }
    var it = dutyWait.shift();
    if (it.gen == null || it.gen === dutyState.gen) it.fn();
  }
}
function dutyTell(html, gen) { dutyWhenClear(gen, function () { appAlert(html); }); }
// 보내는 동안 자리 단추를 모두 끈다(다른 날짜 카드의 단추도) — 눌러도 말없이 버려지는 단추를 두지 않는다. 달력에서 날짜를 바꿔 다시 그려도 꺼진 모습이다
//   (그리는 쪽이 dutyBusy() 를 본다). 답이 오면 켜고, 20초가 넘도록 답이 없으면(dutyBusy 가 풀리는 때) 켠다.
function dutyButtons(on) {
  var w = document.querySelector('.duty-wrap'); if (!w || !w.querySelectorAll) return;
  w.querySelectorAll('button[data-act]').forEach(function (b) { b.disabled = !on; });
}
// 일을 보내기 시작한다 → { tok, done } — done() 은 제 번호일 때만 막음을 풀고 단추를 켠다(늦게 온 앞 일의 답이 지금 보내는 일의 막음을 풀지 않게).
function dutySendStart(btn) {
  var tok = dutyHold(true); btn.disabled = true; dutyButtons(false);
  var t = setTimeout(function () { if (dutyState.tok === tok && dutyState.busy && !dutyBusy()) dutyButtons(true); }, 20100);
  if (t && t.unref) t.unref();   // 시험(node)에서 이 시계가 끝나기를 기다리지 않게
  return { tok: tok, done: function () { if (dutyState.tok !== tok) return; dutyHold(false); dutyButtons(true); if (btn.isConnected) btn.disabled = false; } };
}
// 로그아웃·「로그인 정보변경」(app.js 가 부른다) — 앞사람의 당번·내 당번을 메모리에서 비우고, 그분 요청에 늦게 온 응답은 버려지게 화면 번호를 올린다.
function dutyResetState() {
  dutyLeave(); dutyState.boards = []; dutyState.mine = []; dutyState.me = {}; dutyState.cur = ''; dutyState.board = null; dutyState.days = [];
  dutyState.loadedAt = 0; dutyState.calSel = ''; dutyState.wasCal = false; dutyState.gen++; dutyState.tok++; dutyHold(false);
}

// 알림을 눌러 들어온 길(?duty=1 · 3단계) — 한 번 읽고 주소에서 duty 만 지운다(새로고침 때 또 열리지 않게 · 다른 파라미터는 둔다).
//   여는 것은 app.js routeAfterLoad(로그인했고 🙋 가 보이는 분만 renderDutyList · 아니면 평소 길) · 이미 열린 창은 서비스워커 「from-push」 메시지(app.js)가 연다.
function dutyTakeDeepLink() {
  try {
    if (!dutyDeepLink(location.search)) return false;
    var q = new URLSearchParams(location.search); q.delete('duty');
    var rest = q.toString();
    history.replaceState(null, '', location.pathname + (rest ? '?' + rest : ''));
    return true;
  } catch (e) { return false; }
}

function dutyShell(u) {
  var el = document.getElementById('app');
  el.innerHTML = '<div class="duty-wrap"><div class="ev-loading">불러오는 중…</div></div>' +
    '<button class="home-fab" id="duty-home" aria-label="첫 화면으로">' + homeFabLabel(u, true) + '</button>';
  window.scrollTo(0, 0);
  document.getElementById('duty-home').addEventListener('click', function () { dutyLeave(); renderSummary(); });
}
function dutyFail(text) {
  var w = document.querySelector('.duty-wrap');
  if (w) w.innerHTML = '<h2 class="duty-title">🙋 봉사 당번</h2><p class="duty-empty">' + dutyEsc(text) + '</p>';
}
function dutyMyHtml(v, idx) {   // 내 줄 상자 — idx = 단추가 가리킬 차례 번호(속성 글)
  return '<div class="duty-my ' + v.tone + '"><b>' + dutyEsc(v.head) + '</b>' + (v.sub ? '<span>' + dutyEsc(v.sub) + '</span>' : '') + '</div>' +
    (v.btn ? '<button class="duty-btn ghost' + (v.btn.act === 'cancel' ? ' danger' : '') + '" data-act="' + v.btn.act + '" ' + idx + (dutyBusy() ? ' disabled' : '') + '>' + dutyEsc(v.btn.label) + '</button>' : '');
}
// 일(지원·취소·표시)을 끝낸 뒤 다시 그리기 — scr = 그 일을 누른 때의 화면 번호 · failNote = 다시 받기가 실패하면 알릴 말(일은 됐다는 것).
//   그사이 당번 화면을 떠났으면(첫 화면 등) 아무것도 하지 않는다 — 늦게 온 응답이 다른 화면을 덮어 당번 화면으로 도로 끌어오지 않게.
//   당번 화면 안에서 옮겼으면(자세히 → 목록) 지금 보는 쪽을 다시 받는다(방금 한 일이 거기에도 보이게).
function dutyRedraw(scr, redraw, failNote) {
  if (!document.querySelector('.duty-wrap')) return;
  if (failNote) dutyState.owe = failNote;   // 이 다시 받기가 다른 다시 받기(화면이 다시 보일 때)에 밀려나도 이 말은 남는다
  if (dutyState.screen === scr) { redraw(); return; }
  if (dutyState.at === 'list') renderDutyList({ stay: true, soft: true, failNote: failNote });
  else if (dutyState.at === 'board' && dutyState.cur) renderDutyBoard(dutyState.cur, { soft: true, failNote: failNote });
}
// 읽기가 실패했을 때 — 방금 한 일이 있었으면 그 일은 됐다고 알린다(화면이 옛 모습이라 안 된 줄 아신다). 품고 있던 말은 한 번만 쓴다.
//   이 말은 「화면이 낡았다」는 뜻이다 — 떠 있는 창 뒤에서 기다리는 사이 새 화면을 받았으면(reads 가 올랐다) 버린다(새 화면 위에 「새로 받지 못했어요」가 뜨지 않게).
function dutySoftFail(opt) {
  var t = (opt && opt.failNote) || dutyState.owe || '';
  dutyState.owe = '';
  if (!t) return;
  var at = dutyState.reads;
  dutyWhenClear(dutyState.gen, function () { if (dutyState.reads === at) appAlert(dutyEsc(t)); });
}

// ── 당번 목록 + 내 당번 ──
//   opt.stay: 당번이 하나뿐이어도 목록에 머문다(자세히에서 돌아올 때) · opt.soft: 화면을 비우지 않고 받은 뒤 바꾼다(당번 화면이 떠 있을 때만) ·
//   opt.note: 맨 위 한 줄 · opt.failNote: soft 다시 받기가 실패하면 알릴 말
function renderDutyList(opt) {
  opt = opt || {};
  var u = loadUser(); if (!u) { renderEntryScreen(); return; }
  if (opt.soft && !document.querySelector('.duty-wrap')) return;   // soft = 당번 화면이 떠 있을 때만(떠난 뒤에는 그 화면을 덮지 않는다)
  if (!opt.soft) { if (typeof logFeature === 'function') logFeature('duty', 0); dutyShell(u); }
  var my = ++dutyState.screen; dutyState.at = 'list';
  if (!u.user_id || typeof api.dutyList !== 'function') { if (!opt.soft) dutyFail(u.user_id ? DUTY_OLD_API : DUTY_NO_ID); return; }   // 서버는 「문 닫힘」으로만 답하므로 부르지 않는다
  api.dutyList(u.user_id).then(function (r) {
    if (my !== dutyState.screen || !document.querySelector('.duty-wrap')) return;   // 받는 사이 다른 화면으로 갔다
    dutyState.loadedAt = Date.now(); dutyState.reads++;
    if (!r || r.open === false) { dutyState.boards = []; dutyState.mine = []; dutyFail(DUTY_CLOSED); dutySoftFail(opt); return; }
    dutyState.owe = '';   // 새 화면을 받았다 — 방금 한 일이 거기 보인다
    dutyState.boards = r.boards || []; dutyState.mine = r.mine || []; dutyState.me = r.me || {};
    // 당번이 하나뿐이고 내 당번이 없으면 목록을 건너뛴다(첫 화면에서 들어올 때만)
    if (!opt.stay && !opt.soft && dutyState.boards.length === 1 && !dutyState.mine.length) { renderDutyBoard(dutyState.boards[0].id); return; }
    dutyDrawList(opt.note || '');
  }).catch(function () {
    if (my !== dutyState.screen) return;
    // 다시 받기 실패 — 보던 화면을 그대로 둔다(「불러오는 중」만 떠 있었으면 그대로 두지 않고 알린다)
    if (opt.soft && !document.querySelector('.duty-wrap .ev-loading')) { dutySoftFail(opt); return; }
    dutyFail(DUTY_LOAD_FAIL); dutySoftFail(opt);   // 「불러오는 중」만 떠 있었다 — 못 불러왔다고 알리고, 방금 한 일이 있었으면 그 일은 됐다고도 알린다
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
      dutyMyHtml(c.my, 'data-m="' + i + '"') +
      (c.contact ? '<span class="duty-contact"><span aria-hidden="true">📞</span> ' + dutyContactHtml(c.contact) + '</span>' : '') + '</div>';
  }).join('') : '';
  var boardHtml = boards.length ? boards.map(function (b, i) {
    return '<div class="duty-card" data-b="' + i + '" role="button" tabindex="0"><b>' + dutyEsc(b.title) + '</b>' + (b.place ? '<span>📍 ' + dutyEsc(b.place) + '</span>' : '') +
      '<span class="duty-need' + (b.status === 'open' && (b.need || []).length ? ' on' : '') + '">' + dutyEsc(dutyBoardLine(b)) + '</span></div>';
  }).join('') : '<p class="duty-empty">지금 열린 당번이 없어요.</p>';
  w.innerHTML = '<h2 class="duty-title">🙋 봉사 당번</h2>' + (note ? '<p class="duty-note" role="status">' + dutyEsc(note) + '</p>' : '') +
    mineHtml + '<div class="duty-sec">당번</div>' + boardHtml;
  w.onclick = function (ev) {
    var btn = ev.target.closest('button[data-act]');
    if (btn) {
      var m = mine[Number(btn.dataset.m)];
      if (m) dutyMyAct(btn, btn.dataset.act, m.id, { date: m.date, slot: m }, function (n, f) { renderDutyList({ stay: true, soft: true, note: n, failNote: f }); });
      return;
    }
    if (ev.target.closest('a')) return;   // 문의 전화 — 카드 누름(자세히로 감)으로 번지지 않게
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

// ── 당번 자세히 — 날짜마다 자리(날짜가 넷 이상이면 달력 + 고른 날 하나) ──
//   opt.focusDate: 그 날짜를 화면에(달력이면 그날을 고른다) · opt.note: 그 날짜 머리 아래 한 줄(「취소했어요.」) · opt.soft: 화면을 비우지 않고 받은 뒤 바꾼다(자리 지킴) ·
//   opt.failNote: soft 다시 받기가 실패하면 알릴 말
function renderDutyBoard(id, opt) {
  opt = opt || {};
  var u = loadUser(); if (!u) { renderEntryScreen(); return; }
  if (opt.soft && !document.querySelector('.duty-wrap')) return;   // soft = 당번 화면이 떠 있을 때만
  // 새로 열면 달력의 고른 날을 비우고, 「내 당번」 카드로 왔으면 그 날짜를 첫 그리기까지 품는다(다시 받기 soft 는 고른 날을 지킨다)
  if (!opt.soft) { dutyShell(u); dutyState.calSel = ''; dutyState.first = opt.focusDate || ''; dutyState.wasCal = false; }
  var my = ++dutyState.screen; dutyState.at = 'board'; dutyState.cur = id;
  if (!u.user_id || typeof api.dutyBoard !== 'function') { if (!opt.soft) dutyFail(u.user_id ? DUTY_OLD_API : DUTY_NO_ID); return; }
  api.dutyBoard(id, u.user_id).then(function (r) {
    if (my !== dutyState.screen || !document.querySelector('.duty-wrap')) return;   // 받는 사이 다른 화면으로 갔다
    dutyState.loadedAt = Date.now(); dutyState.reads++;
    if (!r || r.open === false) { dutyFail(DUTY_CLOSED); dutySoftFail(opt); return; }
    dutyState.owe = '';   // 새 화면을 받았다
    dutyState.board = r.board || {}; dutyState.days = r.days || []; dutyState.me = r.me || {};
    dutyDrawBoard(u, r.today || '', opt);
  }).catch(function (err) {
    if (my !== dutyState.screen) return;
    // 다시 받기 실패 — 보던 화면을 그대로 둔다. 다만 당번이 사라졌으면(그사이 보관·준비로 바뀜 = not-found) 낡은 당번표와 단추를 남기지 않는다.
    var gone = !!err && err.message === 'not-found';
    if (opt.soft && !gone && !document.querySelector('.duty-wrap .ev-loading')) { dutySoftFail(opt); return; }
    var w = document.querySelector('.duty-wrap'); if (!w) return;
    w.innerHTML = '<div class="duty-top"><span></span><button class="back-btn" id="duty-back">← 봉사 당번</button></div><p class="duty-empty">' +
      dutyEsc(gone ? '지금은 볼 수 없는 당번이에요.' : DUTY_LOAD_FAIL) + '</p>';
    var bk = document.getElementById('duty-back'); if (bk) bk.addEventListener('click', function () { renderDutyList({ stay: true }); });
    dutySoftFail(opt);   // 방금 한 일이 있었으면 그 일은 됐다고 알린다(화면은 못 받았다)
  });
}

// 달력에서 날짜를 고른 뒤 — 그날 카드가 화면 아래쪽에 걸려 잘 안 보이면 달력을 화면 맨 위로 올린다(카드가 바로 아래에 온다). 이미 보이면 화면을 움직이지 않는다.
//   작은 화면(달력을 맨 위에 붙이면 그 아래 200px 도 안 남는다 — 320×568 · 6주짜리 달)에서는 달력 대신 **그날 카드**를 맨 위로 올린다
//   (달력이 화면을 다 차지해 카드가 🏠 단추 밑에 깔린다 — 달력은 위로 굴리면 다시 보인다). force = 이미 보여도 올린다(「내 당번」 카드로 들어올 때).
function dutyCalReveal(w, force) {
  var cal = w.querySelector('.duty-cal'), card = w.querySelector('.duty-day');
  if (!cal || !card || !card.getBoundingClientRect || !cal.scrollIntoView) return;
  if (!force && card.getBoundingClientRect().top <= window.innerHeight * 0.6) return;
  var calm = !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var tight = window.innerHeight - (Number(cal.getBoundingClientRect().height) || 0) < 200;
  (tight ? card : cal).scrollIntoView({ block: 'start', behavior: calm || force ? 'auto' : 'smooth' });
}

//   opt.pick: 달력에서 날짜를 골랐다 · opt.nav: 앞뒤 달 단추(prev|next)를 눌렀다 — 둘 다 서버를 부르지 않고 가진 자료로 다시 그린 것
function dutyDrawBoard(u, today, opt) {
  var w = document.querySelector('.duty-wrap'); if (!w) return;
  var b = dutyState.board, days = dutyState.days, y = window.scrollY;
  var staffOnly = b.status === 'closed';
  var me = { why: dutyState.me && dutyState.me.why, staffOnly: staffOnly };   // 달력 칸이 남은 자리(받는 중 당번)와 담당자가 넣는 당번의 자리를 가르게
  // 「내 당번」 카드로 새로 연 당번표의 첫 그리기인가 — 첫 읽기가 조용한 다시 받기에 밀려났으면 이 그리기(soft)가 그 날짜를 이어받는다
  var first = dutyState.first; dutyState.first = '';
  var focus = opt.focusDate || first || '', arrive = !!first;
  var hold = dutyBusy() ? ' disabled' : '';   // 보내는 동안 다시 그리면(달력에서 날짜를 바꿈) 자리 단추는 꺼진 모습
  var slotHtml = function (d, s, di, si) {
    var v = dutySlotView(d, s, me), names = (s.names || []).filter(Boolean);
    return '<div class="duty-slot' + (v.kind === 'mine' ? ' mine' : '') + (v.kind === 'off' ? ' off' : '') + '">' +
      '<div class="duty-slot-h"><b>' + dutyEsc(dutySlotName(s)) + '</b><span>' + dutyEsc(dutyTimeText(s)) + '</span>' +
      '<span class="duty-cnt' + (v.kind === 'open' ? ' need' : '') + '">' + (Number(s.n) || 0) + '/' + (Number(s.capacity) || 0) + '</span></div>' +
      '<div class="duty-names">' + (names.length ? names.map(dutyEsc).join(' · ') : '아직 아무도 없어요') + '</div>' +
      (v.my ? dutyMyHtml(v.my, 'data-d="' + di + '" data-s="' + si + '"')
        : '<div class="duty-line' + (v.kind === 'open' ? ' need' : '') + '">' + dutyEsc(v.line) + '</div>' +
          (v.btn ? '<button class="duty-btn" data-act="apply" data-d="' + di + '" data-s="' + si + '"' + hold + '>' + dutyEsc(v.btn.label) + '</button>' : '')) + '</div>';
  };
  var dayOne = function (d, di) {
    var line = dutyDayLine(d, staffOnly);
    return '<section class="duty-day' + (d.off ? ' off' : '') + (d.locked ? ' locked' : '') + '" data-date="' + dutyEsc(d.date) + '">' +
      '<div class="duty-day-h"><b>' + dutyEsc(dutyMdw(d.date)) + '</b>' + (d.date === today ? '<span class="duty-today">오늘</span>' : '') + '</div>' +
      (line ? '<p class="duty-day-s">' + dutyEsc(line) + '</p>' : '') +
      (opt.note && focus === d.date ? '<p class="duty-note" role="status">' + dutyEsc(opt.note) + '</p>' : '') +
      (d.slots || []).map(function (s, si) { return slotHtml(d, s, di, si); }).join('') + '</section>';
  };
  // 날짜가 많으면 달력 + 고른 날 하나만(차례 번호 di 는 days 의 자리 그대로 — 단추가 그 번호로 꺼낸다) · 적으면 날짜 카드를 모두.
  //   고른 날: 내 당번 카드로 온 날·방금 지원·취소한 날(focusDate)이 당번표에 있으면 그날 → 전에 고른 날 → 내가 서거나 손이 필요한 가장 이른 날
  var useCal = dutyCalUse(days), sel = '';
  if (useCal) {
    var hasFocus = !!focus && days.some(function (d) { return d.date === focus; });
    sel = dutyState.calSel = dutyCalPick(days, hasFocus ? focus : dutyState.calSel, me);
  }
  var switched = dutyState.wasCal !== useCal; dutyState.wasCal = useCal;   // 달력 ↔ 날짜 카드로 모양이 바뀌었다(날짜 수가 4 를 넘나듦)
  var dayHtml = useCal ? dutyCalHtml(days, sel, today, me) + days.map(function (d, di) { return d.date === sel ? dayOne(d, di) : ''; }).join('') : days.map(dayOne).join('');
  // 맨 위 한 줄 — 이 계정이 앱에서 지원하지 못하는 까닭(받는 중 당번에서만) · 내 당번 카드로 왔는데 그 날짜가 당번표에 안 보일 때
  //   (보이는 기간 밖에 담당자가 더해 둔 날 · 끝 날짜 뒤의 날 — 「아직」이라고 하지 않는다: 끝 날짜 뒤면 앞으로도 안 보인다)
  var meNote = staffOnly ? '' : dutyMeNote(me);
  var miss = arrive && dutyMdw(focus) && !days.some(function (d) { return d.date === focus; })
    ? dutyMdw(focus) + ' 당번은 지금 당번표에 보이지 않는 날짜예요 — 「내 당번」에서 확인해 주세요.' : '';
  w.innerHTML = '<div class="duty-top"><span class="duty-kind">' + (staffOnly ? '담당자가 넣는 당번' : '지원 받는 중') + '</span>' +
      '<button class="back-btn" id="duty-back">← 봉사 당번</button></div>' +
    '<h2 class="duty-title">' + dutyEsc(b.title) + '</h2>' +
    (b.description ? '<p class="duty-desc">' + dutyEsc(b.description) + '</p>' : '') +
    (b.place || b.contact ? '<div class="duty-glance">' + (b.place ? '<div><span aria-hidden="true">📍</span> ' + dutyEsc(b.place) + '</div>' : '') +
      (b.contact ? '<div><span aria-hidden="true">📞</span> ' + dutyContactHtml(b.contact) + '</div>' : '') + '</div>' : '') +
    (staffOnly ? '<p class="duty-note">이 당번은 담당자가 넣어요 — 앱에서는 당번표와 내 당번을 볼 수 있어요.</p>' : '') +
    (meNote ? '<p class="duty-note" role="note">' + dutyEsc(meNote) + '</p>' : '') +
    (miss ? '<p class="duty-note" role="status">' + dutyEsc(miss) + '</p>' : '') +
    // 다른 날을 보는 사이 끝난 일(달력) — 그날로 끌고 가지 않고 맨 위 한 줄로 알린다(어느 날·어느 자리인지 함께)
    (opt.topNote ? '<p class="duty-note" role="status">' + dutyEsc(opt.topNote) + '</p>' : '') +
    // 날짜가 비는 까닭은 여럿이다 — 자리 틀을 아직 안 넣음 · 담당자가 더한 날짜가 아직 보이는 기간 밖 · 끝 날짜가 지남(당겨짐). 화면은 어느 쪽인지 모른다.
    //   「담당자가 날짜를 넣으면」(이미 넣었을 수 있다) · 「날짜가 가까워지면」(끝 날짜가 지났으면 오지 않는다)처럼 까닭을 넘겨짚지 않는다 — 보이는 날짜가 없다는 것과 물을 곳만 말한다.
    (days.length ? dayHtml : '<p class="duty-empty">지금은 당번표에 보이는 날짜가 없어요 — 궁금하신 점은 담당자께 문의해 주세요.</p>');
  document.getElementById('duty-back').addEventListener('click', function () { renderDutyList({ stay: true }); });
  var dayBox = function (date) { var x = null; w.querySelectorAll('.duty-day').forEach(function (e) { if (e.dataset.date === date) x = e; }); return x; };
  if (arrive) {
    // 내 당번 카드로 왔다 — 그 날짜를 화면에. 달력이면 달력(작은 화면은 그날 카드)을 맨 위로 · 그 날짜가 당번표에 없으면 맨 위 안내 줄이 보이게 그대로 둔다
    if (useCal) { if (sel === focus) dutyCalReveal(w, true); }
    else { var box = dayBox(focus); if (box && box.scrollIntoView) box.scrollIntoView({ block: 'start' }); }
  } else if (opt.soft) {
    window.scrollTo(0, y);   // 다시 받은 뒤에도 보던 자리 그대로
    // …다만 달력 ↔ 날짜 카드로 모양이 바뀌었으면(날짜 수가 4 를 넘나듦) 방금 한 날의 카드가 밀려나 있다 — 그날로 굴린다
    if (switched && opt.focusDate) { if (useCal) dutyCalReveal(w, true); else { var moved = dayBox(opt.focusDate); if (moved && moved.scrollIntoView) moved.scrollIntoView({ block: 'start' }); } }
  }
  // 달력에서 날짜·달을 골랐다 — 다시 그려 단추가 새것이라 초점을 돌려주고(앞뒤 달 단추 · 그쪽 달이 더 없어 단추가 사라졌으면 고른 날), 날짜를 골랐으면 그날 카드가 보이게 한다
  if (opt.pick || opt.nav) {
    var f = (opt.nav && w.querySelector('button[data-cal="' + opt.nav + '"]')) || w.querySelector('.duty-cal-c.on');
    if (f && f.focus) f.focus({ preventScroll: true });
    if (opt.pick) dutyCalReveal(w);
  }
  // 일을 끝낸 뒤 다시 받기 — 그 날짜로 돌아가 그 칸의 바뀐 모습을 보여 준다. 다만 답을 기다리는 사이 달력에서 **다른 날을 보고 있으면**
  //   그날로 끌고 가지 않는다(보던 날의 단추를 누르려던 자리에 앞 일의 결과가 그려진다) — 보던 날에 머문 채 맨 위 한 줄(away = 「10월 18일(일) 2부 설거지 — 지원했어요.」)로 알린다.
  var again = function (date, note, failNote, away) {
    var elsewhere = dutyCalUse(dutyState.days) && !!dutyState.calSel && dutyState.calSel !== date;
    renderDutyBoard(dutyState.cur, elsewhere ? { soft: true, topNote: away || '', failNote: failNote } : { soft: true, focusDate: date, note: note || '', failNote: failNote });
  };
  w.onclick = function (ev) {
    // 달력 — 앞뒤 달 · 날짜 고르기. 서버를 다시 부르지 않고 가진 자료로 다시 그린다(화면 번호는 그대로 — 받는 중인 응답을 버리지 않는다).
    var nav = ev.target.closest('button[data-cal]');
    if (nav) {
      var to = dutyCalStep(days, dutyState.calSel, nav.dataset.cal, me);
      if (to) { dutyState.calSel = to; dutyDrawBoard(u, today, { soft: true, nav: nav.dataset.cal }); }
      return;
    }
    var cell = ev.target.closest('button[data-date]');
    if (cell) {
      var picked = cell.dataset.date;
      if (picked === dutyState.calSel) { dutyCalReveal(w); return; }   // 이미 고른 날 — 그날 카드만 보이게
      if (days.some(function (d) { return d.date === picked; })) { dutyState.calSel = picked; dutyDrawBoard(u, today, { soft: true, pick: true }); }
      return;
    }
    var btn = ev.target.closest('button[data-act]'); if (!btn) return;
    var d = days[Number(btn.dataset.d)], s = d && (d.slots || [])[Number(btn.dataset.s)]; if (!s) return;
    if (btn.dataset.act === 'apply') dutyApplyFlow(btn, u, b, d, s, again);
    else if (s.mine) dutyMyAct(btn, btn.dataset.act, s.mine.id, { date: d.date, slot: s }, function (n, f) { again(d.date, n, f, n ? dutyMdw(d.date) + ' ' + dutySlotName(s) + ' — ' + n : ''); });
  };
}

// ── 지원 — 확인 창 한 번 · 잠긴 날은 「취소할 수 없는 날」 창(ack_locked) ──
//   화면을 열어 둔 사이 잠겼으면 서버가 locked-day 로 알려 준다(아무것도 안 씀) → 그 창을 띄운 뒤 다시 보낸다.
function dutyAskHtml(a) {
  return '<div class="duty-ask"><b>' + dutyEsc(a.strong) + '</b>' + (a.where ? '<div>' + dutyEsc(a.where) + '</div>' : '') +
    (a.who ? '<div class="duty-who">' + dutyEsc(a.who) + '</div>' : '') +
    a.lines.map(function (t) { return '<div>' + dutyEsc(t) + '</div>'; }).join('') + '</div>';
}
var DUTY_RELOAD_TAIL = ' 다만 화면을 새로 받지 못했어요 — 잠시 뒤 다시 열어 확인해 주세요.';
function dutyApplyFlow(btn, u, board, day, slot, again) {
  if (dutyBusy()) return;
  var l = userLines(u), who = l.l2 + (l.l1 ? ' · ' + l.l1 : ''), scr = dutyState.screen, gen = dutyState.gen;
  var label = dutyMdw(day.date) + ' ' + dutySlotName(slot);   // 알림에 어느 자리인지 — 늦게 온 답이 다른 자리 일로 읽히지 않게
  var redo = function (failNote, away) { dutyRedraw(scr, function () { again(day.date, '', failNote, away); }, failNote); };
  var send = function (ack) {
    var done = dutySendStart(btn).done;
    api.dutyApply(slot.id, u.user_id || '', ack).then(function () { done(); if (gen === dutyState.gen) redo(label + ' — 지원은 됐어요.' + DUTY_RELOAD_TAIL, label + ' — 지원했어요.'); })   // 알림 창 없이 — 그 칸이 「✅ 지원했어요」로 바뀐다
      .catch(function (err) {
        done();
        if (gen !== dutyState.gen) return;   // 로그아웃·신원 바꿈 뒤에 온 답 — 앞사람의 일을 다음 분께 알리지 않는다
        var code = err && err.message, x = (err && err.data) || {};
        // 그사이 잠긴 날 — 아무것도 안 쓰였다. 아직 그 당번을 보고 있으면 「취소할 수 없는 날」 창을 띄우고,
        //   떠났으면 창은 띄우지 않되 **안 됐다는 것은 알린다**(확인 창에서 「지원하기」를 누르신 분이 지원한 줄 아신다).
        if (code === 'locked-day' && !ack) {
          var here = function () { return dutyState.at === 'board' && dutyState.cur === board.id && !!document.querySelector('.duty-wrap'); };
          // 창은 떠 있는 다른 창(앞선 알림)이 닫힌 뒤에 띄운다 — 그 창을 답 없이 지우지 않게. 닫힌 때에 이 당번을 떠났으면 창 대신 알린다.
          if (here()) { dutyWhenClear(gen, function () { if (here()) ask(true); else { appAlert(dutyEsc(label + ' 지원이 안 됐어요 — ' + dutyErrText(code))); redo(''); } }); return; }
          dutyTell(dutyEsc(label + ' 지원이 안 됐어요 — ' + dutyErrText(code)), gen); redo(''); return;
        }
        if (code === 'not-open' || code === 'no-user') { dutyTell(dutyEsc(dutyErrText(code)), gen); if (document.querySelector('.duty-wrap')) renderDutyList({ stay: true }); return; }
        dutyTell(dutyEsc(label + ' — ' + dutyErrText(code, x)), gen);
        if (!dutyErrKnown(code)) redo(DUTY_UNSURE_FAIL);   // 됐는지 알 수 없다(통신 끊김) — 화면을 다시 받아 보여 준다
        else if (dutyNeedsReload(code)) redo('');
      });
  };
  var ask = function (locked) {
    var a = dutyApplyAsk(board, day, slot, who, locked);
    appConfirm(dutyAskHtml(a), { title: a.title, okText: a.ok, cancelText: '돌아가기', danger: locked }).then(function (yes) { if (yes) send(locked); });
  };
  ask(day.locked === true);
}

// ── 내 줄 — 취소 · 못 가게 됐어요 · 표시 거두기 ── after(note, failNote) = 끝난 뒤 다시 그리기
function dutyPickWhy() {   // 까닭 셋 가운데 하나 — 고르면 그 값, 닫으면 null
  return new Promise(function (resolve) {
    var old = document.getElementById('app-modal'); if (old) old.remove();
    var wrap = document.createElement('div');
    wrap.id = 'app-modal'; wrap.className = 'am-overlay';
    wrap.innerHTML = '<div class="am-card" role="dialog" aria-modal="true"><div class="am-title">못 가게 됐어요</div>' +
      '<div class="am-msg">담당자가 보는 당번표에 표시해 드려요. 자리는 담당자가 확인하고 정리해요.<br>급하시면 담당자께 직접 연락해 주세요.</div>' +
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
  if (dutyBusy()) return;
  var u = loadUser(); if (!u) { renderEntryScreen(); return; }
  var label = dutyMdw(at.date) + ' ' + dutySlotName(at.slot), scr = dutyState.screen, gen = dutyState.gen;
  var run = function (call, okNote, failNote) {
    var done = dutySendStart(btn).done;
    call().then(function () { done(); if (gen === dutyState.gen) dutyRedraw(scr, function () { after(okNote, failNote); }, failNote); }).catch(function (err) {
      done();
      if (gen !== dutyState.gen) return;   // 로그아웃·신원 바꿈 뒤에 온 답
      var code = err && err.message;
      if (code === 'not-open' || code === 'no-user') { dutyTell(dutyEsc(dutyErrText(code)), gen); if (document.querySelector('.duty-wrap')) renderDutyList({ stay: true }); return; }
      dutyTell(dutyEsc(label + ' — ' + dutyErrText(code)), gen);
      if (!dutyErrKnown(code)) dutyRedraw(scr, function () { after('', DUTY_UNSURE_FAIL); }, DUTY_UNSURE_FAIL);   // 됐는지 알 수 없다 — 다시 받아 보여 준다
      else if (dutyNeedsReload(code)) dutyRedraw(scr, function () { after('', ''); }, '');
    });
  };
  if (act === 'cancel') {
    appConfirm(dutyEsc(label + ' 지원을 취소할까요?'), { okText: '지원 취소', cancelText: '돌아가기', danger: true }).then(function (yes) {
      if (yes) run(function () { return api.dutyCancel(signupId, u.user_id || ''); }, '취소했어요.', label + ' — 취소는 됐어요.' + DUTY_RELOAD_TAIL);
    });
  } else if (act === 'ask') {
    dutyPickWhy().then(function (why) {
      if (why) run(function () { return api.dutyAsk(signupId, u.user_id || '', why); }, '담당자 당번표에 표시했어요.', label + ' — 담당자 당번표에 표시는 됐어요.' + DUTY_RELOAD_TAIL);
    });
  } else if (act === 'unask') {
    appConfirm(dutyEsc('못 간다는 표시를 거둘까요? 그대로 서시는 것으로 돼요.'), { okText: '표시 거두기', cancelText: '돌아가기' }).then(function (yes) {
      if (yes) run(function () { return api.dutyAsk(signupId, u.user_id || '', null); }, '표시를 거뒀어요.', label + ' — 표시는 거뒀어요.' + DUTY_RELOAD_TAIL);
    });
  }
}

// 다른 앱에 다녀오면(화면이 다시 보이면) 자료를 다시 받는다 — 그사이 자리가 찼거나 확정됐을 수 있다. 확인 창이 떠 있거나 일을 보내는 중이면 건드리지 않는다.
document.addEventListener('visibilitychange', function () {
  if (document.hidden || dutyBusy() || !document.querySelector('.duty-wrap') || document.getElementById('app-modal')) return;
  if (Date.now() - dutyState.loadedAt < 15000) return;
  if (dutyState.at === 'board' && dutyState.cur) renderDutyBoard(dutyState.cur, { soft: true });
  else if (dutyState.at === 'list') renderDutyList({ stay: true, soft: true });
});
