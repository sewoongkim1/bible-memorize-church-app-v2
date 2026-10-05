// 교육신청 화면 순수 함수 — js/edu.js 의 표식 사이를 떼어 node:vm 에서 돌린다(꾸러미 없음 · preflight 가 건다)
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'edu.js'), 'utf8');
const a = src.indexOf('// ── 교육 순수 함수 (여기부터) ──'), b = src.indexOf('// ── 교육 순수 함수 (여기까지) ──');
assert.ok(a >= 0 && b > a, '표식을 못 찾았다');
const ctx = {}; vm.createContext(ctx); vm.runInContext(src.slice(a, b), ctx);

test('eduPhaseLabel', () => {
  assert.equal(ctx.eduPhaseLabel({ phase: 'upcoming', applyFrom: '2027-01-03' }), '1월 3일부터 신청');
  assert.equal(ctx.eduPhaseLabel({ phase: 'open', capacity: 20, confirmed: 14, waitlisted: 0, mode: 'auto' }), '모집 중 · 14/20');
  assert.equal(ctx.eduPhaseLabel({ phase: 'open', capacity: 20, confirmed: 20, waitlisted: 3, mode: 'auto', waitlist: true }), '모집 중 · 정원 참 · 대기 3');
  assert.equal(ctx.eduPhaseLabel({ phase: 'closed' }), '모집 끝');
  assert.equal(ctx.eduPhaseLabel({ phase: 'running' }), '진행 중');
});

test('eduStatusLine', () => {
  assert.equal(ctx.eduStatusLine({ status: 'waitlisted', statusLabel: '대기', waitNo: 1 }), '대기 1번');
  assert.equal(ctx.eduStatusLine({ status: 'confirmed', statusLabel: '확정' }), '확정');
});

test('eduErrText', () => {
  assert.equal(ctx.eduErrText('full'), '정원이 찼어요.');
  assert.equal(ctx.eduErrText('too-late'), '시작한 뒤에는 앱에서 취소할 수 없어요. 담당자에게 말씀해 주세요.');
  assert.equal(ctx.eduErrText('not-open'), '아직 신청을 받지 않아요.');
  assert.equal(ctx.eduErrText('x'), '잠시 뒤 다시 해 주세요.');
  assert.equal(ctx.eduErrText('not-active'), '이미 처리된 신청이에요.');   // 담당자가 먼저 취소·반려한 줄
});

test('eduMd — 없거나 틀린 날짜는 빈 글', () => {
  assert.equal(ctx.eduMd(null), '');
  assert.equal(ctx.eduMd('x'), '');
  assert.equal(ctx.eduMd('2027-01-03'), '1월 3일');
});

test('eduMdw — 요일(날짜만 있는 값은 밀리지 않는다)', () => {
  assert.equal(ctx.eduMdw('2026-10-09'), '10월 9일(금)');
  assert.equal(ctx.eduMdw('2027-01-03'), '1월 3일(일)');
  assert.equal(ctx.eduMdw(null), '');
});

test('eduPhaseLabel — 정원 차고 대기 없음', () => {
  assert.equal(ctx.eduPhaseLabel({ phase: 'open', capacity: 1, confirmed: 1, waitlisted: 0, waitlist: false }), '정원 참');
});

test('eduEsc — boardEsc 없이도 다섯 글자를 막는다(빈 값은 빈 글)', () => {
  assert.equal(typeof ctx.boardEsc, 'undefined');   // 순수 묶음만 돌린다 — 남의 함수에 기대지 않는다
  assert.equal(ctx.eduEsc(`<b class="x">A&B's</b>`), '&lt;b class=&quot;x&quot;&gt;A&amp;B&#39;s&lt;/b&gt;');
  assert.equal(ctx.eduEsc(null), '');
  assert.equal(ctx.eduEsc(undefined), '');
  assert.equal(ctx.eduEsc(12), '12');
});

test('eduWhenLine — 서버가 고른 시작·끝 + 회차 수', () => {
  assert.equal(ctx.eduWhenLine({ firstDate: '2026-10-25', lastDate: '2026-12-13', sessionsCount: 8 }), '2026년 10월 25일(일) ~ 12월 13일(일) · 8회');
  assert.equal(ctx.eduWhenLine({ firstDate: '2027-11-03', lastDate: '2028-01-05', sessionsCount: 0 }), '2027년 11월 3일(수) ~ 2028년 1월 5일(수)');
  assert.equal(ctx.eduWhenLine({ firstDate: '2027-03-03', lastDate: '2027-03-03', sessionsCount: 1 }), '2027년 3월 3일(수) · 1회');
  assert.equal(ctx.eduWhenLine({ firstDate: '2027-03-03', lastDate: null, sessionsCount: 0 }), '2027년 3월 3일(수)');
  assert.equal(ctx.eduWhenLine({ firstDate: null, lastDate: null, sessionsCount: 8 }), '8회');
  assert.equal(ctx.eduWhenLine({ firstDate: 'x', sessionsCount: 0 }), '');
  assert.equal(ctx.eduWhenLine({}), '');
  assert.equal(ctx.eduWhenLine(null), '');
});

test('eduPhaseChip — 칩에는 숫자가 없다', () => {
  assert.equal(ctx.eduPhaseChip('open'), '모집 중');
  assert.equal(ctx.eduPhaseChip('upcoming'), '곧 열려요');
  assert.equal(ctx.eduPhaseChip('closed'), '모집 끝');
  assert.equal(ctx.eduPhaseChip('running'), '진행 중');
  assert.equal(ctx.eduPhaseChip('x'), '');
});

const OPEN = { phase: 'open', mode: 'auto', capacity: 24, confirmed: 0, waitlisted: 0, waitlist: false, applyTo: '2026-10-18' };
const pick = (v) => JSON.parse(JSON.stringify(v));   // vm 안 객체를 밖의 deepEqual 과 맞춘다

test('eduSeatView ① 선착순 · 자리 있음', () => {
  assert.deepEqual(pick(ctx.eduSeatView(OPEN, true)), { off: false, head: '24자리 남았어요', sub: '10월 18일(일)까지 신청 · 선착순',
    how: '누르시면 바로 확정돼요. 첫 시간 전날까지 앱에서 취소할 수 있어요.', btn: '신청하기',
    ask: { title: '🎓 신청할까요?', line: '선착순이라 누르시면 바로 확정돼요.', ok: '신청하기' } });
  assert.equal(ctx.eduSeatView({ ...OPEN, confirmed: 21 }, true).head, '3자리 남았어요');
  assert.equal(ctx.eduSeatView({ ...OPEN, applyTo: null }, true).sub, '선착순');   // 마감일 없으면 뺀다
});

test('eduSeatView ② 담당자 확정 — 정원만', () => {
  const v = pick(ctx.eduSeatView({ ...OPEN, mode: 'approve', confirmed: 30 }, true));
  assert.equal(v.head, '정원 24명');
  assert.equal(v.sub, '10월 18일(일)까지 신청 · 담당자 확정');
  assert.equal(v.how, '신청하시면 담당자가 확인한 뒤 확정해요.');
  assert.equal(v.btn, '신청하기');
  assert.deepEqual(v.ask, { title: '🎓 신청할까요?', line: '담당자가 확인한 뒤 확정해요.', ok: '신청하기' });
  assert.equal(ctx.eduSeatView({ ...OPEN, mode: 'approve', capacity: null }, true).head, '인원 제한 없이 받아요');
});

test('eduSeatView ③ 인원 제한 없음', () => {
  const v = ctx.eduSeatView({ ...OPEN, capacity: null }, true);
  assert.equal(v.head, '인원 제한 없이 받아요');
  assert.equal(v.sub, '10월 18일(일)까지 신청');
  assert.equal(v.btn, '신청하기');
});

test('eduSeatView ④ 정원 참 · 대기 받음 — 단추가 「대기 신청하기」', () => {
  const v = pick(ctx.eduSeatView({ ...OPEN, confirmed: 24, waitlist: true, waitlisted: 2 }, true));
  assert.equal(v.head, '정원이 찼어요');
  assert.equal(v.sub, '지금 대기 2분 · 10월 18일(일)까지 신청');
  assert.equal(v.how, '대기로 신청하시면 자리가 날 때 순서대로 확정돼요.');
  assert.equal(v.btn, '대기 신청하기');
  assert.deepEqual(v.ask, { title: '🎓 대기로 신청할까요?', line: '자리가 나면 순서대로 확정돼요.', ok: '대기 신청하기' });
  assert.equal(ctx.eduSeatView({ ...OPEN, confirmed: 24, waitlist: true, waitlisted: 0 }, true).sub, '10월 18일(일)까지 신청');
});

test('eduSeatView ⑤⑥⑦·문 닫힘 — 누를 단추가 없다', () => {
  const full = ctx.eduSeatView({ ...OPEN, confirmed: 24 }, true);
  assert.equal(full.off, true); assert.equal(full.btn, null); assert.equal(full.ask, null);
  assert.equal(full.head, '정원이 찼어요'); assert.equal(full.sub, '함께하고 싶으시면 담당자에게 말씀해 주세요');
  const soon = ctx.eduSeatView({ phase: 'upcoming', applyFrom: '2026-10-11' }, true);
  assert.equal(soon.head, '10월 11일(일)부터 신청할 수 있어요'); assert.equal(soon.sub, '그때 다시 열어 주세요'); assert.equal(soon.btn, null);
  assert.equal(ctx.eduSeatView({ phase: 'upcoming' }, true).head, '곧 신청을 받아요');
  for (const p of ['closed', 'running']) {
    const v = ctx.eduSeatView({ phase: p }, true);
    assert.equal(v.head, '신청을 마감했어요'); assert.equal(v.btn, null);
  }
  const shut = ctx.eduSeatView(OPEN, false);
  assert.equal(shut.head, '아직 신청을 받지 않아요'); assert.equal(shut.btn, null); assert.equal(shut.off, true);
  assert.equal(ctx.eduSeatView({ phase: 'closed' }, false).head, '신청을 마감했어요');   // 단계가 문보다 먼저
});

test('eduMineView ⑧~⑫ — 신청한 뒤', () => {
  const ok = pick(ctx.eduMineView({ status: 'confirmed', canCancel: true, cancelUntil: '2026-10-24', nextSession: { no: 1, date: '2026-10-25', start: '14:30' } }));
  assert.deepEqual(ok, { tone: 'ok', head: '✅ 확정됐어요', lines: ['첫 시간 · 10월 25일(일) 14:30'],
    cancelLine: '10월 24일(토)까지 앱에서 취소할 수 있어요.', cancelBtn: '신청 취소', cancelAsk: '신청을 취소할까요?' });
  assert.deepEqual(pick(ctx.eduMineView({ status: 'confirmed', canCancel: false, nextSession: { no: 3, date: '2026-11-08', start: null } })).lines, ['다음 시간 · 11월 8일(일)']);
  const late = ctx.eduMineView({ status: 'confirmed', canCancel: false, nextSession: null });
  assert.equal(late.lines.length, 0); assert.equal(late.cancelBtn, null);
  assert.equal(late.cancelLine, '시작한 뒤에는 취소를 담당자에게 말씀해 주세요.');
  const ap = ctx.eduMineView({ status: 'applied', canCancel: true, cancelUntil: null });
  assert.equal(ap.tone, 'on'); assert.equal(ap.head, '📝 신청했어요');
  assert.equal(ap.lines[0], '담당자가 확인하고 있어요. 확정되면 「내 강좌」에 「확정」으로 바뀌어요.');
  assert.equal(ap.cancelLine, '첫 시간 전날까지 앱에서 취소할 수 있어요.');   // cancelUntil 이 없을 때
  const wt = ctx.eduMineView({ status: 'waitlisted', waitNo: 2, canCancel: true, cancelUntil: '2026-10-24' });
  assert.equal(wt.head, '⏳ 대기 2번이에요'); assert.equal(wt.lines[0], '자리가 나면 순서대로 확정돼요.');
  assert.equal(wt.cancelBtn, '대기 취소'); assert.equal(wt.cancelAsk, '대기를 취소할까요?');
  const no = pick(ctx.eduMineView({ status: 'declined', statusLabel: '반려' }));
  assert.deepEqual(no, { tone: 'soft', head: '이번 신청은 확정되지 않았어요', lines: ['궁금하시면 담당자에게 말씀해 주세요.'], cancelLine: '', cancelBtn: null, cancelAsk: '' });
  assert.equal(JSON.stringify(no).indexOf('반려'), -1);   // 성도님 화면에 「반려」를 쓰지 않는다
  assert.equal(ctx.eduMineView(null), null);
  assert.equal(ctx.eduMineView({ status: 'cancelled' }), null);
});

// ---------- 출석부(2단계 · 2026-10-05) ----------
// 출석률 시험 경우 — 교회 어드민 tests/edu-rules.test.mjs 와 같은 목록(두 앱이 같은 결과 · 고치면 두 곳을 함께)
const ATTEND_RATE_CASES = [
  [{ present: 5, late: 1, absent: 1, excused: 1 }, { attended: 6, denom: 7, pct: 86 }],
  [{ present: 0, late: 0, absent: 0, excused: 0 }, { attended: 0, denom: 0, pct: null }],
  [{ excused: 3 }, { attended: 0, denom: 0, pct: null }],
  [{ absent: 2 }, { attended: 0, denom: 2, pct: 0 }],
  [{ present: 2, late: 1 }, { attended: 3, denom: 3, pct: 100 }],
  [{ late: 4, absent: 1, excused: 2 }, { attended: 4, denom: 5, pct: 80 }],
  [{ present: 1, absent: 7 }, { attended: 1, denom: 8, pct: 13 }],
  [{ present: 29, absent: 171 }, { attended: 29, denom: 200, pct: 15 }],
  [{ present: 2, absent: 1 }, { attended: 2, denom: 3, pct: 67 }],
  [{ present: "3", late: null, absent: -1, excused: "x" }, { attended: 3, denom: 3, pct: 100 }],
  [{ present: 2.7, absent: 1.2 }, { attended: 2, denom: 3, pct: 67 }],
  [null, { attended: 0, denom: 0, pct: null }],
  [undefined, { attended: 0, denom: 0, pct: null }],
];

test('eduAttendRate — 지각=출석 · 공결은 분모에서 뺌 · 체크 안 한 회차는 없음 · 분모 0 이면 pct null · 반올림은 ×100 먼저', () => {
  for (const [input, want] of ATTEND_RATE_CASES) {
    // vm 안에서 만든 객체는 다른 realm 이라 deepStrictEqual 의 프로토타입 비교가 어긋난다 — JSON 으로 옮겨 견준다
    assert.deepEqual(JSON.parse(JSON.stringify(ctx.eduAttendRate(input))), want, JSON.stringify(input));
  }
});

// 출석률 함수 글자의 지문 — 교회 어드민 tests/edu-rules.test.mjs 에 **같은 값**이 박혀 있다(어느 쪽이든 글자가 바뀌면 그쪽 시험이 떨어진다).
//   규칙을 일부러 바꿀 때는 세 곳(교회 어드민 edu-rules.ts · 이 저장소 js/edu.js · api 복사본)을 같은 글자로 고치고 두 시험의 값을 함께 바꾼다.
//   지문 = sha256(「function eduAttendRate(c) {」부터 첫 줄머리 「}」까지 · 줄끝 LF)
const EDU_ATTEND_RATE_SHA256 = 'ff0225b92431708dc662d43e5ee9a5b41eb1b6dd3c8a32d0d93e40125b69b323';

test('eduAttendRate — api(supabase/functions/api/index.ts)의 복사본이 js/edu.js 의 것과 한 글자도 같다(규칙이 갈리지 않게) · 지문이 교회 어드민과 같다', () => {
  const pick = (text) => {
    const t = text.replace(/\r\n/g, '\n');
    const a = t.indexOf('function eduAttendRate(c) {');
    const b = t.indexOf('\n}\n', a);
    assert.ok(a >= 0 && b > a, '함수를 못 찾았다');
    return t.slice(a, b + 2);
  };
  const api = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'api', 'index.ts'), 'utf8');
  assert.equal(pick(api), pick(src));
  assert.equal(api.split('function eduAttendRate(').length - 1, 1, 'api 에 둘 이상');
  assert.equal(require('node:crypto').createHash('sha256').update(pick(src)).digest('hex'), EDU_ATTEND_RATE_SHA256,
    '출석률 함수 글자가 바뀌었다 — 교회 어드민 edu-rules.ts·api 복사본과 두 시험의 지문을 함께 고칠 것');
});

// ---------- 내 출석 표시(2단계 화면 · 2026-10-05) ----------
test('eduAttendLine — 「출석 a/b · p%」 · 셈은 eduAttendRate(서버 pct 와 같은 값) · 체크 전이면 빈 글 · 공결만이면 「공결 N회」', () => {
  assert.equal(ctx.eduAttendLine({ present: 5, late: 1, absent: 1, excused: 1, marked: 8, pct: 86 }), '출석 6/7 · 86%');
  assert.equal(ctx.eduAttendLine({ present: 2, late: 0, absent: 1, excused: 0, marked: 3, pct: 67 }), '출석 2/3 · 67%');
  assert.equal(ctx.eduAttendLine({ present: 0, late: 0, absent: 2, excused: 0, marked: 2, pct: 0 }), '출석 0/2 · 0%');
  assert.equal(ctx.eduAttendLine({ present: 0, late: 0, absent: 0, excused: 2, marked: 2, pct: null }), '공결 2회');
  assert.equal(ctx.eduAttendLine({ present: 0, late: 0, absent: 0, excused: 0, marked: 0, pct: null }), '');   // 아직 체크 안 함 — 줄 없음
  assert.equal(ctx.eduAttendLine({ present: 3, marked: 0 }), '');   // marked 가 0 이면(서버 계약) 그리지 않는다
  assert.equal(ctx.eduAttendLine(null), '');
  assert.equal(ctx.eduAttendLine(undefined), '');
  // 위 출석률 시험 경우마다 — 줄의 % 가 eduAttendRate 의 pct 와 같다(규칙을 두 번 짜지 않았다)
  for (const [input, want] of ATTEND_RATE_CASES) {
    if (!input || want.denom === 0) continue;
    const a = { ...input, marked: 1 };
    assert.equal(ctx.eduAttendLine(a), '출석 ' + want.attended + '/' + want.denom + ' · ' + want.pct + '%', JSON.stringify(input));
  }
});

test('eduMyAttendLine — 「내 출석 6/7 · 86% (수료 기준 80%)」 · 기준이 없으면 괄호 없이 · 공결만 · 체크 전은 빈 글', () => {
  const a = { present: 5, late: 1, absent: 1, excused: 1, marked: 8, pct: 86 };
  assert.equal(ctx.eduMyAttendLine(a, 80), '내 출석 6/7 · 86% (수료 기준 80%)');
  assert.equal(ctx.eduMyAttendLine(a, 0), '내 출석 6/7 · 86% (수료 기준 0%)');
  assert.equal(ctx.eduMyAttendLine(a, null), '내 출석 6/7 · 86%');
  assert.equal(ctx.eduMyAttendLine(a, undefined), '내 출석 6/7 · 86%');
  assert.equal(ctx.eduMyAttendLine({ excused: 2, marked: 2 }, 80), '내 출석 · 공결 2회 (수료 기준 80%)');
  assert.equal(ctx.eduMyAttendLine({ marked: 0 }, 80), '');
  assert.equal(ctx.eduMyAttendLine(null, 80), '');
});

test('eduStateMark — 출석 ✅ · 지각 🕘 · 결석 ❌ · 공결은 글자만 · 체크 전·모르는 값은 null', () => {
  assert.deepEqual(pick(ctx.eduStateMark('present')), { cls: 'present', icon: '✅', label: '출석' });
  assert.deepEqual(pick(ctx.eduStateMark('late')), { cls: 'late', icon: '🕘', label: '지각' });
  assert.deepEqual(pick(ctx.eduStateMark('absent')), { cls: 'absent', icon: '❌', label: '결석' });
  assert.deepEqual(pick(ctx.eduStateMark('excused')), { cls: 'excused', icon: '', label: '공결' });
  for (const x of [null, undefined, '', 'x', 'toString', 'constructor', '__proto__']) assert.equal(ctx.eduStateMark(x), null, String(x));
});

// ---------- 수료(3단계 · 2026-10-05) — api 의 maskName·eduCertNoValid·eduCertBody(진위 확인·내 수료증) ----------
// 세 함수는 교회 어드민 supabase/functions/church-admin/edu-rules.ts 와 **한 글자도 같다** — 그쪽 tests/edu-rules.test.mjs 에 같은 지문이 박혀 있다.
//   규칙을 일부러 바꿀 때는 두 곳(교회 어드민 edu-rules.ts · 이 저장소 api)을 같은 글자로 고치고 두 시험의 값을 함께 바꾼다.
//   지문 = sha256(「function 이름(…) {」부터 첫 줄머리 「}」까지 · 줄끝 LF) — eduAttendRate 와 같은 셈.
const CERT_FN_SHA256 = {
  'function maskName(name) {': '76968ab11c23a08576a2c0007892be7f38c766102ef04d92256ebce27361c8fd',
  'function eduCertNoValid(s) {': 'add57082b525160f77794f21653de377ecaf2f775be270a0785b63b5d0be47e3',
  'function eduCertBody(body, title) {': '9061e91bd5d14439e5fd96b52b4f88592623a47be29c248ad5f7146589e104d4',
};
const apiSrc = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'api', 'index.ts'), 'utf8').replace(/\r\n/g, '\n');
const certCtx = {}; vm.createContext(certCtx);
for (const head of Object.keys(CERT_FN_SHA256)) {
  const a0 = apiSrc.indexOf(head), b0 = apiSrc.indexOf('\n}\n', a0);
  if (a0 >= 0 && b0 > a0) vm.runInContext(apiSrc.slice(a0, b0 + 2), certCtx);
}

test('수료 규칙 세 함수 — api 복사본이 한 덩이씩 하나뿐 · 지문이 교회 어드민과 같다', () => {
  for (const [head, sha] of Object.entries(CERT_FN_SHA256)) {
    const a0 = apiSrc.indexOf(head), b0 = apiSrc.indexOf('\n}\n', a0);
    assert.ok(a0 >= 0 && b0 > a0, '함수를 못 찾았다 ' + head);
    assert.equal(apiSrc.split(head.split('(')[0] + '(').length - 1, 1, 'api 에 둘 이상 ' + head);
    assert.equal(require('node:crypto').createHash('sha256').update(apiSrc.slice(a0, b0 + 2)).digest('hex'), sha,
      head + ' 글자가 바뀌었다 — 교회 어드민 edu-rules.ts 와 두 시험의 지문을 함께 고칠 것');
  }
});

test('maskName(진위 확인의 가린 이름) — 한 글자는 * · 두 글자 뒤를 * · 세 글자 넘으면 처음과 끝만 · NFC·앞뒤 빈칸', () => {
  assert.equal(certCtx.maskName('홍길동'), '홍*동');
  assert.equal(certCtx.maskName('이수'), '이*');
  assert.equal(certCtx.maskName('남궁가나'), '남**나');
  assert.equal(certCtx.maskName('김'), '*', '한 글자 이름을 그대로 내보내지 않는다(검토 반영)');
  assert.equal(certCtx.maskName(' 김 '), '*');
  for (const x of ['', null, undefined, '   ']) assert.equal(certCtx.maskName(x), '', String(x));
  assert.equal(certCtx.maskName('  홍길동 '), '홍*동');
  assert.equal(certCtx.maskName('홍길동'.normalize('NFD')), '홍*동');
  assert.equal(certCtx.maskName('\u{1F600}가'), '\u{1F600}*');
});

test('eduCertNoValid·eduCertBody — 번호 꼴(9999 다음 자리 늚) · 앞뒤 빈칸·자모분리는 아님 · {과정} 을 모두 채움 · $& 도 글자 그대로', () => {
  for (const s of ['고척-2026-0001', '고척-2026-10000', '고척-2999-123456']) assert.equal(certCtx.eduCertNoValid(s), true, s);
  for (const s of ['고척-2026-001', '고척-26-0001', ' 고척-2026-0001', '고척-2026-0001 ', 'X-2026-0001', '', null, 20260001,
    '고척-2026-0001'.normalize('NFD')]) assert.equal(certCtx.eduCertNoValid(s), false, String(s));
  assert.equal(certCtx.eduCertBody('위 사람은 「{과정}」 과정을 마쳤습니다.', '제자훈련'), '위 사람은 「제자훈련」 과정을 마쳤습니다.');
  assert.equal(certCtx.eduCertBody('{과정} · {과정}', '$& 반'), '$& 반 · $& 반');
  assert.equal(certCtx.eduCertBody(null, 'x'), '');
});

test('eduVerify·eduCert — api 에 있고 eduVerify 는 꼴을 먼저 본 뒤 정확히 같은 번호 하나만(목록·like 없음) · user_id 를 읽지 않는다', () => {
  const fn = (name) => {
    const a0 = apiSrc.indexOf('async function ' + name + '(');
    assert.ok(a0 > 0, name);
    return apiSrc.slice(a0, apiSrc.indexOf('\n}\n', a0));
  };
  const v = fn('eduVerify');
  assert.ok(v.indexOf('eduCertNoValid(no)') > 0 && v.indexOf('eduCertNoValid(no)') < v.indexOf('.from('), '꼴을 먼저');
  assert.ok(/\.eq\("cert_no", no\)\.maybeSingle\(\)/.test(v), '정확히 같은 번호 하나');
  assert.ok(!/\.like\(|\.ilike\(|\.in\(|user_id|group_name|sub_name|who_type/.test(v), '검색·목록·user_id·소속');
  assert.ok(/name: maskName\(e\.name\)/.test(v));
  const c = fn('eduCert');
  assert.ok(/\.eq\("id", eid\)\.eq\("user_id", userId\)/.test(c), '내 줄만');
  assert.ok(/cert_revoked === true/.test(c) && /no-cert/.test(c));
  assert.ok(/case "eduCert":/.test(apiSrc) && /case "eduVerify":/.test(apiSrc));
  // (검토 반영) 살아 있는 수료(번호 있고 취소 아님) 줄은 앱에서 취소 단추가 없다 — edu_cancel 의 has-cert 와 같은 셈
  const m = fn('eduMineOut');
  assert.ok(/const activeCert = !!r\.cert_no && r\.cert_revoked !== true;/.test(m), 'activeCert');
  assert.ok(/const canCancel = [^\n]*&& !activeCert;/.test(m), 'canCancel 이 activeCert 를 본다');
});
// ---------- 수료 화면(3단계 · 2026-10-05) — 내 강좌 수료 줄 · 자세히 「수료증 보기」 · 수료증 그림(캔버스 차례) · 진위 확인 페이지 ----------
test('eduMineView — 수료한 분은 「🎓 수료했어요」·수료번호 · 취소 단추·안내 없음(canCancel 에 기대지 않는다) · cert 표시', () => {
  assert.deepEqual(pick(ctx.eduMineView({ status: 'confirmed', completed: true, certNo: '고척-2026-0001', canCancel: false, nextSession: null })),
    { tone: 'ok', head: '🎓 수료했어요', lines: ['수료번호 고척-2026-0001'], cancelLine: '', cancelBtn: null, cancelAsk: '', cert: true });
  const on = ctx.eduMineView({ status: 'confirmed', completed: true, certNo: '고척-2026-0001', canCancel: true, cancelUntil: '2026-10-24' });
  assert.equal(on.cancelBtn, null); assert.equal(on.cancelLine, '');
  // 수료가 아니거나 번호가 없으면(취소된 수료는 서버가 completed false · certNo null 로 준다) 예전 그대로
  const plain = pick(ctx.eduMineView({ status: 'confirmed', completed: false, certNo: null, canCancel: false, nextSession: null }));
  assert.equal(plain.head, '✅ 확정됐어요'); assert.equal(plain.cert, undefined);
  assert.equal(ctx.eduMineView({ status: 'confirmed', completed: true, certNo: null }).head, '✅ 확정됐어요');
  assert.equal(ctx.eduMineView({ status: 'confirmed', completed: 'true', certNo: '고척-2026-0001' }).head, '✅ 확정됐어요', 'true 만');
});

test('eduCertLine·eduCertErrText·eduCertFileName', () => {
  assert.equal(ctx.eduCertLine({ completed: true, certNo: '고척-2026-0001' }), '🎓 수료 · 고척-2026-0001');
  for (const m of [{ completed: false, certNo: '고척-2026-0001' }, { completed: true, certNo: null }, null, {}]) assert.equal(ctx.eduCertLine(m), '', JSON.stringify(m));
  assert.ok(ctx.eduCertErrText('no-cert').startsWith('수료증을 찾을 수 없어요'));
  assert.equal(ctx.eduCertErrText('not-found'), ctx.eduCertErrText('no-cert'), '남의 줄·없는 줄도 같은 말');
  assert.equal(ctx.eduCertErrText('no-user'), '로그인한 뒤에 볼 수 있어요.');
  assert.equal(ctx.eduCertErrText('HTTP 500'), '지금 수료증을 불러올 수 없어요. 잠시 뒤 다시 열어 주세요.');
  assert.equal(ctx.eduCertFileName('고척-2026-0001'), '수료증_고척-2026-0001.png');
  assert.equal(ctx.eduCertFileName('a/b:c* d'), '수료증_abcd.png');
  assert.equal(ctx.eduCertFileName(''), '수료증_고척.png');
});

// 자리 표의 지문 — 교회 어드민 tests/edu-certs-logic.test.mjs 에 **같은 값**이 박혀 있다(cert-template.js CERT_GEOM · 인쇄).
//   자리를 일부러 고칠 때는 두 곳(이 저장소 js/edu.js EDU_CERT_GEOM · 교회 어드민 CERT_GEOM)을 같은 값·같은 차례로 고치고 두 지문을 함께 바꾼다.
const CERT_GEOM_SHA256 = '957637f91b3f4464e1861611440b2ca3391dddc6ff6aefa543b8fa0e194c45e8';
test('EDU_CERT_GEOM — 교회 어드민 인쇄(CERT_GEOM)와 같은 자리 표(지문) · A4 가로 그림 크기', () => {
  const sha = require('node:crypto').createHash('sha256').update(JSON.stringify(ctx.EDU_CERT_GEOM)).digest('hex');
  assert.equal(sha, CERT_GEOM_SHA256, '자리 표가 바뀌었다 — 교회 어드민 cert-template.js CERT_GEOM·두 시험 지문을 함께 고칠 것 (지금 ' + sha + ')');
  assert.equal(ctx.EDU_CERT_W, 1754);
  assert.ok(Math.abs(ctx.EDU_CERT_H / ctx.EDU_CERT_W - 210 / 297) < 0.001);
});

// 교회 어드민 cert-template.js(certTextEm·certLines·certInfoHeight·certBodySize)로 뽑은 값 — 두 곳이 같은 문안 크기에서 시작한다.
//   한쪽 셈을 고치면 그쪽으로 다시 뽑아 이 표를 바꾼다(교회 어드민에서 node 로 같은 경우를 돌린다).
const CERT_BODY = '위 사람은 고척교회가 주관한 「구원론 3차」 과정을 성실히 마쳤기에 이 증서를 드립니다.';
const CERT_EST_CASES = [
  [{ title: '구원론 3차', term: '2026 하반기', from: '2026-10-25', to: '2026-12-13', body: CERT_BODY }, [40.4, 2, 10.825, 2.2]],
  [{ title: '제자훈련 1단계 — 말씀과 삶을 함께 나누는 열두 주 과정', term: '2027 상반기', from: '2027-03-03', to: '2027-05-19', body: CERT_BODY }, [40.4, 2, 13.725, 2.2]],
  [{ title: '교사 연수', term: '', from: null, to: null, body: CERT_BODY + '\n' + CERT_BODY }, [81.6, 4, 7.225, 2.2]],
  [{ title: '구원론 3차', term: '2026 하반기', from: '2026-10-25', to: '2026-12-13', body: '가'.repeat(120) }, [120, 5, 10.825, 1.6]],
  [{ title: '구원론 3차', term: '2026 하반기', from: '2026-10-25', to: null, body: '가나다 '.repeat(50) }, [165, 6, 10.825, 1.3]],
  [{ title: 'A Long English Course Title For Testing', term: '2026 Fall', from: '2026-10-25', to: '2026-12-13', body: '가'.repeat(300) }, [300, 11, 13.725, 1.15]],
];
test('수료증 어림 셈 — 교회 어드민과 같은 값(문안 크기 단계가 갈리지 않는다)', () => {
  for (const [c, [em, lines, info, size]] of CERT_EST_CASES) {
    assert.ok(Math.abs(ctx.eduCertTextEm(c.body) - em) < 1e-9, 'em ' + c.title);
    assert.equal(ctx.eduCertLines(c.body, 2, 64), lines, 'lines ' + c.title);
    assert.ok(Math.abs(ctx.eduCertInfoHeight(c) - info) < 1e-9, 'info ' + c.title);
    assert.equal(ctx.eduCertBodySize(c), size, 'size ' + c.title);
  }
});

test('eduCertYmd·eduCertPeriod·eduCertCourseText·eduSealSrc', () => {
  assert.equal(ctx.eduCertYmd('2026-12-13'), '2026년 12월 13일');
  for (const x of ['2026-02-30', '', null, '2026-1-3']) assert.equal(ctx.eduCertYmd(x), '', String(x));
  assert.equal(ctx.eduCertPeriod('2026-10-25', '2026-12-13'), '2026년 10월 25일 ~ 2026년 12월 13일');
  assert.equal(ctx.eduCertPeriod('2026-10-25', '2026-10-25'), '2026년 10월 25일');
  assert.equal(ctx.eduCertPeriod('2026-10-25', null), '2026년 10월 25일 ~');
  assert.equal(ctx.eduCertPeriod(null, '2026-12-13'), '~ 2026년 12월 13일');
  assert.equal(ctx.eduCertPeriod(null, null), '');
  assert.equal(ctx.eduCertCourseText('구원론 3차', '2026 하반기'), '구원론 3차 (2026 하반기)');
  assert.equal(ctx.eduCertCourseText(' 교사 연수 ', null), '교사 연수');
  assert.equal(ctx.eduSealSrc('data:image/png;base64,iVBORw0KGgo='), 'data:image/png;base64,iVBORw0KGgo=');
  assert.equal(ctx.eduSealSrc('data:image/jpeg;base64,/9j/4A=='), 'data:image/jpeg;base64,/9j/4A==');
  for (const bad of ['javascript:alert(1)', 'https://x.example/s.png', 'img/seal.png', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,a"b', null, 1]) {
    assert.equal(ctx.eduSealSrc(bad), '', String(bad));
  }
});

test('eduCertWrap — 띄어쓰기에서 끊고 · 폭보다 긴 낱말은 글자로 · \\n 은 새 줄 · 빈 글도 한 줄', () => {
  const m = (s) => Array.from(s).length;   // 한 글자 = 1
  assert.deepEqual(pick(ctx.eduCertWrap('가나 다라 마바사', 5, m)), ['가나 다라', '마바사']);
  assert.deepEqual(pick(ctx.eduCertWrap('가나다라마바사아자', 4, m)), ['가나다라', '마바사아', '자']);
  assert.deepEqual(pick(ctx.eduCertWrap('가나\n다라', 10, m)), ['가나', '다라']);
  assert.deepEqual(pick(ctx.eduCertWrap('  가   나  ', 10, m)), ['가 나']);
  assert.deepEqual(pick(ctx.eduCertWrap('', 10, m)), ['']);
  assert.deepEqual(pick(ctx.eduCertWrap(null, 10, m)), ['']);
  const sp = ctx.eduCertSpaced('수료증', 10, 800, 0.5, (s, size) => size);
  assert.deepEqual(pick(sp.chars.map((c) => c.x)), [0, 15, 30]);
  assert.equal(sp.width, 45, '끝 글자 뒤 벌림까지(화면 letter-spacing 과 같다)');
});

// 캔버스 차례 — 글 폭은 어림(eduCertTextEm × 크기)으로 재는 가짜 measure
const fakeMeasure = (t, size) => ctx.eduCertTextEm(t) * size;
const CERT_DATA = { name: '홍길동', title: '구원론 3차', term: '2026 하반기', from: '2026-10-25', to: '2026-12-13', certNo: '고척-2026-0001', issuedOn: '2026-12-13',
  issuer: '고척교회 담임목사 홍길동', body: CERT_BODY, seal: 'data:image/png;base64,iVBORw0KGgo=' };
const IMGS = { logo: { w: 477, h: 605 }, seal: { w: 365, h: 368 } };
test('eduCertPlan — 칸이 모두 있고 그림 안 · 로고·「수료증」은 가운데 · 위에서 아래 차례 · 직인은 명의 끝에 30% 겹침', () => {
  const p = ctx.eduCertPlan(CERT_DATA, fakeMeasure, IMGS), g = ctx.EDU_CERT_GEOM, u = p.W / 100;
  assert.equal(p.W, 1754); assert.equal(p.H, 1240); assert.equal(p.bodySize, 2.2);
  const texts = p.ops.filter((o) => o.k === 'text'), all = texts.map((o) => o.s).join('');
  for (const t of ['제 고척-2026-0001 호', '구원론 3차 (2026 하반기)', '2026년 10월 25일 ~ 2026년 12월 13일']) assert.ok(texts.some((o) => o.s === t), t);
  for (const t of ['수료증', '성명', '과정', '기간', '홍길동', '2026년12월13일', '고척교회담임목사홍길동']) assert.ok(all.replace(/ /g, '').includes(t), t);
  assert.ok(texts.some((o) => o.align === 'center' && o.s.startsWith('위 사람은')), '문안은 가운데 맞춤');
  assert.equal(p.ops.filter((o) => o.k === 'rect').length, 2, '겹테두리');
  // 모두 그림 안
  for (const o of p.ops) {
    const w = o.k === 'text' ? fakeMeasure(o.s, o.size) : o.w;
    const x0 = o.k === 'text' ? (o.align === 'center' ? o.x - w / 2 : o.align === 'right' ? o.x - w : o.x) : o.x;
    assert.ok(x0 >= 0 && x0 + w <= p.W && o.y >= 0 && o.y <= p.H, JSON.stringify(o));
  }
  // 로고·제목 가운데
  const logo = p.ops.find((o) => o.k === 'img' && o.key === 'logo');
  assert.ok(Math.abs(logo.x + logo.w / 2 - p.W / 2) < 0.01 && Math.abs(logo.h - g.logoH * u) < 0.01);
  const tc = texts.filter((o) => o.size === g.titleSize * u);
  assert.equal(tc.length, 3);
  assert.ok(Math.abs((tc[0].x + tc[2].x + fakeMeasure(tc[2].s, tc[2].size)) / 2 - p.W / 2) < 0.01, '「수료증」 가운데');
  // 위에서 아래 차례 — 제목 < 성명 < 기간 < 문안 < 발급일 < 명의
  const yOf = (pred) => texts.find(pred).y;
  const yTitle = tc[0].y, yName = yOf((o) => o.s === '홍' && o.weight === 800 && o.size === g.nameSize * u), yPeriod = yOf((o) => o.s.startsWith('2026년 10월'));
  const yBody = yOf((o) => o.s.startsWith('위 사람은')), yDate = yOf((o) => o.size === g.dateSize * u && o.s === '2'), yIss = yOf((o) => o.size === g.issSize * u);
  assert.ok(yTitle < yName && yName < yPeriod && yPeriod < yBody && yBody < yDate && yDate < yIss, [yTitle, yName, yPeriod, yBody, yDate, yIss].join(' '));
  assert.ok(yBody > g.mainTop * u && yBody < g.mainBottom * u);
  // 직인 — 명의 글줄 끝(끝 글자 뒤 벌림 포함)에 직인 폭의 30% 가 겹친다 · 명의 줄 가운데에
  const iss = texts.filter((o) => o.size === g.issSize * u), last = iss[iss.length - 1];
  const end = last.x + fakeMeasure(last.s, last.size) + g.issTrack * last.size;
  const seal = p.ops.find((o) => o.k === 'img' && o.key === 'seal');
  assert.ok(Math.abs((end - seal.x) / seal.w - g.sealIn) < 1e-9, '30% 겹침');
  assert.ok(Math.abs(seal.y + seal.h / 2 - last.y) < 1e-9 && Math.abs(seal.h - g.sealH * u) < 1e-9);
  assert.ok(seal.y + seal.h < p.H - (g.frame + g.frameW + g.gap) * u, '직인이 안쪽 테두리 안');
  // 명의 글줄(끝 벌림 포함)은 가운데
  assert.ok(Math.abs((iss[0].x + end) / 2 - p.W / 2) < 0.01);
});

test('eduCertPlan — 직인·로고가 없으면 그 그림만 빠진다 · 기간이 없으면 기간 줄이 없다 · 이름·명의·문안은 글 그대로(꺾쇠도 글자로 그린다)', () => {
  const p = ctx.eduCertPlan({ ...CERT_DATA, seal: null, from: null, to: null, body: '1 < 2 > 0 <b>', issuer: '<img src=x>' }, fakeMeasure, { logo: null, seal: null });
  assert.equal(p.ops.filter((o) => o.k === 'img').length, 0);
  const texts = p.ops.filter((o) => o.k === 'text');
  assert.ok(!texts.some((o) => o.s === '간'), '기간 칸 이름 없음');
  assert.ok(texts.some((o) => o.s === '1 < 2 > 0 <b>'), '문안 그대로');
  assert.ok(texts.map((o) => o.s).join('').includes('<img'), '명의 그대로(글자로)');
  assert.ok(!texts.some((o) => o.s.includes('&lt;')), '이스케이프하지 않는다(캔버스는 글자를 그린다)');
  const none = ctx.eduCertPlan({}, fakeMeasure, null);
  assert.equal(none.ops.filter((o) => o.k === 'rect').length, 2);
  assert.ok(!none.ops.some((o) => o.k === 'text' && o.s.startsWith('제 ')), '번호가 없으면 「제 … 호」 없음');
});

test('eduCertPlan — 긴 문안은 한 단계씩 작게 · 문안 끝이 가운데 칸 안(발급일과 겹치지 않는다)', () => {
  const g = ctx.EDU_CERT_GEOM;
  for (const body of ['가'.repeat(120), '가나다 '.repeat(50), '가'.repeat(300), CERT_BODY + '\n' + CERT_BODY + '\n' + CERT_BODY]) {
    const c = { ...CERT_DATA, body };
    const p = ctx.eduCertPlan(c, fakeMeasure, IMGS), u = p.W / 100;
    assert.ok(g.bodySizes.indexOf(p.bodySize) >= g.bodySizes.indexOf(ctx.eduCertBodySize(c)), '어림보다 크게 고르지 않는다');
    const lines = p.ops.filter((o) => o.k === 'text' && o.align === 'center');   // 문안 줄만 가운데 맞춤
    const bottom = lines[lines.length - 1].y + p.bodySize * u * g.bodyLH / 2;
    assert.ok(bottom <= g.mainBottom * u + 0.01, body.slice(0, 8) + ' ' + bottom + ' > ' + g.mainBottom * u);
  }
});

test('renderEduCert·eduCertDraw — 이름·명의·문안은 캔버스로만(innerHTML 에 넣지 않는다) · 직인은 eduSealSrc 를 거쳐 drawImage 로만 · 저장·공유 · 진위 확인 안내', () => {
  const lf = src.replace(/\r\n/g, '\n');
  const fnSrc = (name) => { const a0 = lf.indexOf('function ' + name + '('); assert.ok(a0 > 0, name); return lf.slice(a0, lf.indexOf('\n}\n', a0)); };
  const r = fnSrc('renderEduCert'), d = fnSrc('eduCertDraw');
  for (const k of ['cert.body', 'cert.issuer', 'cert.seal']) assert.ok(!r.includes(k), 'renderEduCert 가 ' + k + ' 를 쓰지 않는다');
  assert.ok(/eduCertImage\(eduSealSrc\(cert\.seal\)\)/.test(d) && /drawImage/.test(d) && /fillText/.test(d));
  assert.ok(!/innerHTML/.test(d), '그리기에는 innerHTML 이 없다');
  assert.ok(/pic\.alt = /.test(r) && /pic\.src = url/.test(r), 'alt·src 는 속성으로');
  assert.ok(r.includes('navigator.canShare({ files: [file] })') && r.includes('navigator.share({ files: [file]') && r.includes('eduCertDownload(url, name)'));
  assert.ok(r.includes('안 되면 그림을 길게 눌러 저장해 주세요') && r.includes('수료번호로 진위를 확인할 수 있어요: gocheok.onlybible.kr/cert'));
  assert.ok(r.includes('home-fab') && r.includes("renderEduCourse(courseId)"), '첫 화면 단추 · 뒤로(강좌)');
  assert.ok(/document\.fonts\.load/.test(d) && /'img\/logo-gocheok\.png'/.test(d));
  // 「수료증 보기」는 자세히의 내 칸(mv.cert)에서 · 내 강좌 카드는 eduCertLine
  assert.ok(src.includes("(mv.cert ? '<button class=\"edu-btn\" id=\"edu-cert\">수료증 보기</button>' : '')"));
  assert.ok(src.includes('renderEduCert(m.id, id)') && src.includes("eduEsc(eduCertLine(m))"));
});

test('api.js — eduCert(enrollment_id, user_id)·eduVerify(no)', () => {
  const a = fs.readFileSync(path.join(__dirname, '..', 'js', 'api.js'), 'utf8');
  assert.ok(a.includes('eduCert: (enrollment_id, user_id) => supaCall("eduCert", { enrollment_id, user_id })'));
  assert.ok(a.includes('eduVerify: (no) => supaCall("eduVerify", { no })'));
});

// ---------- 진위 확인 페이지 cert/index.html(로그인 없이) ----------
const certPage = fs.readFileSync(path.join(__dirname, '..', 'cert', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const pageCtx = {}; vm.createContext(pageCtx);
{
  const a0 = certPage.indexOf('// ── 진위 확인 순수 함수 (여기부터) ──'), b0 = certPage.indexOf('// ── 진위 확인 순수 함수 (여기까지) ──');
  assert.ok(a0 >= 0 && b0 > a0, '진위 확인 표식을 못 찾았다');
  vm.runInContext(certPage.slice(a0, b0), pageCtx);
}
test('cert/ — 번호 꼴은 서버 eduCertNoValid 와 같다 · 넣은 글 다듬기(빈칸·여러 붙임표·「고척-」 빠뜨림)', () => {
  for (const s of ['고척-2026-0001', '고척-2026-10000', '고척-2999-123456', '고척-2026-001', '고척-26-0001', ' 고척-2026-0001', 'X-2026-0001', '', '고척-2026-1234567']) {
    assert.equal(pageCtx.CERT_NO_RE.test(s), certCtx.eduCertNoValid(s), s);
  }
  assert.equal(pageCtx.certNoNorm(' 고척 - 2026 - 0001 '), '고척-2026-0001');
  assert.equal(pageCtx.certNoNorm('고척–2026—0001'), '고척-2026-0001');
  assert.equal(pageCtx.certNoNorm('고척－2026－0001'), '고척-2026-0001');
  assert.equal(pageCtx.certNoNorm('2026-0001'), '고척-2026-0001');
  assert.equal(pageCtx.certNoNorm('제 고척-2026-0001 호'), '고척-2026-0001');
  assert.equal(pageCtx.certNoNorm('제고척-2026-0001호'), '고척-2026-0001');
  assert.equal(pageCtx.certNoNorm('고척-2026-0001'.normalize('NFD')), '고척-2026-0001');
  assert.equal(pageCtx.certNoNorm(null), '');
  assert.equal(pageCtx.certYmdKo('2026-12-13'), '2026년 12월 13일');
});

test('cert/ — 확인됨·취소됨·없음 세 결과 + 넣기 전·꼴·통신 오류 · 이름은 서버 것 그대로(다시 가리지 않는다)', () => {
  const ok = pick(pageCtx.certVerifyView({ ok: true, valid: true, revoked: false, title: '구원론 3차', term: '2026 하반기', completedOn: '2026-12-13', name: '홍*동' }, '고척-2026-0001', ''));
  assert.equal(ok.tone, 'ok'); assert.equal(ok.head, '✅ 확인된 수료증이에요');
  assert.deepEqual(ok.rows, [['이름', '홍*동'], ['과정', '구원론 3차'], ['학기', '2026 하반기'], ['수료일', '2026년 12월 13일'], ['수료번호', '고척-2026-0001']]);
  assert.equal(pick(pageCtx.certVerifyView({ ok: true, valid: true, name: '*', title: 't', term: '', completedOn: null }, 'n', '')).rows[0][1], '*', '한 글자 이름도 서버가 가린 그대로');
  const rv = pick(pageCtx.certVerifyView({ ok: true, valid: false, revoked: true, title: '구원론 3차', term: '2026 하반기', completedOn: '2026-12-13', name: '홍*동' }, '고척-2026-0002', ''));
  assert.equal(rv.tone, 'rv'); assert.equal(rv.head, '취소된 수료증이에요');
  assert.ok(!rv.rows.some((x) => x[0] === '수료일'), '취소된 수료에는 수료일을 싣지 않는다');
  const none = pick(pageCtx.certVerifyView({ ok: true, valid: false }, '고척-2026-0099', ''));
  assert.equal(none.tone, 'none'); assert.equal(none.head, '찾을 수 없는 번호예요'); assert.deepEqual(none.rows, []);
  assert.equal(pageCtx.certVerifyView(null, '', 'empty').head, '수료번호를 넣어 주세요');
  assert.equal(pageCtx.certVerifyView(null, 'x', 'bad-no').head, '번호 꼴이 맞지 않아요');
  assert.equal(pageCtx.certVerifyView(null, 'x', 'net').tone, 'err');
  assert.equal(pageCtx.certVerifyView({ ok: false, error: 'x' }, 'x', '').tone, 'err');
});

test('cert/ — 로그인 없이 · ../js/config.js·../js/api.js 를 ?v= 없이 · supaCall("eduVerify") · 서버 글자는 textContent(innerHTML 없음) · ?no= 로 바로 확인', () => {
  assert.ok(certPage.includes('<script src="../js/config.js"></script>') && certPage.includes('<script src="../js/api.js"></script>'));
  assert.ok(!/(src|href)="[^"]*\?v=/.test(certPage), 'bump.py 가 모르는 캐시태그를 두지 않는다(preflight [2]·[2-1] 은 루트 index.html 만 본다)');
  assert.ok(certPage.includes("supaCall('eduVerify', { no: no })"));
  assert.ok(!/\.innerHTML|insertAdjacentHTML|document\.write/.test(certPage) && /\.textContent = /.test(certPage), '서버 글자는 textContent 로만');
  assert.ok(!/loadUser|user_id/.test(certPage), '로그인·user_id 를 쓰지 않는다');
  assert.ok(certPage.includes("new URLSearchParams(location.search).get('no')"));
  assert.ok(certPage.includes('localStorage.getItem("theme") === "dark"') && certPage.includes('html.dark'), '앱과 같은 어두운 모드');
  assert.ok(certPage.includes('../img/logo-gocheok.png'));
  assert.ok(!/fonts\.googleapis/.test(certPage), '웹폰트를 부르지 않는다');
});

// ---------- 앱 알림(4단계 · 2026-10-05) — 딥링크 · 알림 문구(api 순수 구간) · 보내는 길 · SQL · 크론 ----------
const EDU_ID = '11111111-1111-4111-8111-111111111111';
test('eduDeepLinkId — ?edu=<강좌 id>(uuid 꼴만 · 소문자로) · 전체 주소·다른 파라미터와 섞여도 · 아니면 null', () => {
  assert.equal(ctx.eduDeepLinkId('?edu=' + EDU_ID), EDU_ID);
  assert.equal(ctx.eduDeepLinkId('https://gocheok.onlybible.kr/?edu=' + EDU_ID.toUpperCase() + '&from=push'), EDU_ID);
  assert.equal(ctx.eduDeepLinkId('?from=push&edu=' + EDU_ID), EDU_ID);
  assert.equal(ctx.eduDeepLinkId('/?edu=' + encodeURIComponent(EDU_ID) + '#top'), EDU_ID);
  assert.equal(ctx.eduDeepLinkId('?edu=' + EDU_ID + '&edu=22222222-2222-4222-8222-222222222222'), EDU_ID, '첫 edu 만');
  for (const x of ['?edu=abc', '?edu=', '?edu', '?xedu=' + EDU_ID, '?v=38', 'https://gocheok.onlybible.kr/', 'edu=' + EDU_ID, '?edu=%E0%A4%A',
    '?edu=' + EDU_ID + 'x', '?edu=../' + EDU_ID, '', null, undefined, 12]) assert.equal(ctx.eduDeepLinkId(x), null, String(x));
});

// api 의 「교육 알림 문구」 순수 구간(타입 표기 없음)을 떼어 돌린다 — evening-push.test.cjs 와 같은 방식
const noteCtx = {}; vm.createContext(noteCtx);
{
  const S = '// ── 교육 알림 문구 — 순수 함수 (여기부터) ──', E = '// ── 교육 알림 문구 — 순수 함수 (여기까지) ──';
  const a0 = apiSrc.indexOf(S), b0 = apiSrc.indexOf(E, a0 + S.length);
  assert.ok(a0 >= 0 && b0 > a0, 'api 의 교육 알림 문구 표식을 못 찾았다');
  const slice = apiSrc.slice(a0, b0);
  assert.ok(!/:\s*(any|string|number|boolean|Record|Set)\b/.test(slice), '알림 문구 구간에 타입 표기가 들어왔다 — node:vm 이 못 돌린다');
  vm.runInContext(slice, noteCtx);
}
test('교육 알림 문구 — 친구 결정 그대로(확정 · 자리가 나서 · 개강 전날) · 회차·시각·장소가 없으면 그 부분만 뺀다', () => {
  const n = noteCtx;
  const first = { date: '2026-10-25', start: '14:00', first: true };
  assert.equal(n.eduConfirmedText('구원론 3차', first, false), '구원론 3차 신청이 확정됐어요 — 첫 시간 10월 25일(일) 14:00');
  assert.equal(n.eduConfirmedText('구원론 3차', first, true), '자리가 나서 구원론 3차 신청이 확정됐어요 — 첫 시간 10월 25일(일) 14:00');
  assert.equal(n.eduConfirmedText('구원론 3차', null, false), '구원론 3차 신청이 확정됐어요', '회차가 없으면 앞부분만');
  assert.equal(n.eduConfirmedText('구원론 3차', { date: '2026-10-25', start: '', first: true }, false), '구원론 3차 신청이 확정됐어요 — 첫 시간 10월 25일(일)');
  assert.equal(n.eduConfirmedText('구원론 3차', { date: '2026-11-01', start: '19:30', first: false }, true), '자리가 나서 구원론 3차 신청이 확정됐어요 — 다음 시간 11월 1일(일) 19:30', '진행 중에 확정');
  assert.equal(n.eduConfirmedText('구원론 3차', { date: 'x', start: '14:00', first: true }, false), '구원론 3차 신청이 확정됐어요', '틀린 날짜는 앞부분만');
  assert.equal(n.eduFirstDayText('구원론 3차', '14:00:00', '본당'), '내일 구원론 3차 첫 시간이에요 — 14:00 · 본당');
  assert.equal(n.eduFirstDayText('구원론 3차', null, '본당'), '내일 구원론 3차 첫 시간이에요 — 본당');
  assert.equal(n.eduFirstDayText('구원론 3차', '14:00:00', ''), '내일 구원론 3차 첫 시간이에요 — 14:00');
  assert.equal(n.eduFirstDayText('구원론 3차', '', null), '내일 구원론 3차 첫 시간이에요');
});
test('eduNextSession — 오늘(한국) 이후 첫 회차 · 첫 회차가 지났으면 다음 시간(first false) · 남은 회차 없으면 null', () => {
  const n = noteCtx, ss = [{ on_date: '2026-10-25', start_time: '14:00:00' }, { on_date: '2026-11-01', start_time: null }];
  assert.deepEqual(pick(n.eduNextSession(ss, '2026-10-20')), { date: '2026-10-25', start: '14:00', first: true });
  assert.deepEqual(pick(n.eduNextSession(ss, '2026-10-25')), { date: '2026-10-25', start: '14:00', first: true }, '그날이면 그 회차');
  assert.deepEqual(pick(n.eduNextSession(ss, '2026-10-26')), { date: '2026-11-01', start: '', first: false });
  for (const [list, today] of [[ss, '2026-11-02'], [[], '2026-10-20'], [null, '2026-10-20'], [[{}], '2026-10-20']]) assert.equal(n.eduNextSession(list, today), null);
  assert.equal(n.eduNoteDay('2026-10-25'), '10월 25일(일)');
  for (const x of ['', null, 'x', '2026-1-3']) assert.equal(n.eduNoteDay(x), '', String(x));
  assert.equal(n.eduNoteTime('09:05:00'), '09:05'); assert.equal(n.eduNoteTime('14:00'), '14:00'); assert.equal(n.eduNoteTime(null), '');
});
test('eduPlain — 알림 글은 글자 그대로(HTML 이스케이프 없음) · 줄바꿈·제어·방향 바꿈 글자는 빈칸 · NFC · 길면 「…」', () => {
  const n = noteCtx;
  assert.equal(n.eduPlain('구원론\n3차\t<b>&', 40), '구원론 3차 <b>&');
  assert.equal(n.eduPlain('A\u202eB\u200bC\u0007D', 40), 'A B C D');
  assert.equal(n.eduPlain('구원론'.normalize('NFD'), 40), '구원론');
  assert.equal(n.eduPlain('  ', 40), ''); assert.equal(n.eduPlain(null, 40), '');
  const long = n.eduPlain('가'.repeat(80), 40);
  assert.equal(Array.from(long).length, 40); assert.ok(long.endsWith('…'));
  assert.equal(Array.from(n.eduConfirmedText('가'.repeat(80), null, false)).length, 40 + ' 신청이 확정됐어요'.length, '제목은 40자에서 자른다');
});
test('eduClaimedIds — 잡힌 번호는 bigint[] 하나(숫자 배열)로 온다 · 옛 꼴(표 [{enrollment_id}])도 읽는다 · 틀린 값·배열 아님은 버린다(검토 반영)', () => {
  const ids = (x) => Array.from(noteCtx.eduClaimedIds(x)).sort((a, b) => a - b);
  assert.deepEqual(ids([3, 1, 2]), [1, 2, 3]);
  assert.deepEqual(ids([{ enrollment_id: 7 }, { enrollment_id: '8' }]), [7, 8], '옛 꼴(표)');
  assert.deepEqual(ids(['5', 5, 0, -1, 1.5, 'x', null, undefined, {}, 2 ** 60]), [5], '틀린 값은 버린다 · 같은 번호는 하나');
  for (const x of [null, undefined, {}, '1,2', 3]) assert.deepEqual(ids(x), [], String(x));
  const big = Array.from({ length: 1001 }, (_, i) => i + 1);
  assert.equal(noteCtx.eduClaimedIds(big).size, 1001, '1,000개를 넘어도 다 읽는다');
});

test('보내는 길 — 내부 액션 둘은 서비스 키(sameSecret)부터 · 기기 먼저 → edu_notify_claim → 보냄 · 응답·기록에 user_id 없음 · 즉시 확정은 안 알림', () => {
  const fn = (name) => { const a0 = apiSrc.indexOf('async function ' + name + '('); assert.ok(a0 > 0, name); return apiSrc.slice(a0, apiSrc.indexOf('\n}\n', a0)); };
  assert.ok(apiSrc.includes('case "internalEduNotify": return json(await internalEduNotify(req, body));'));
  assert.ok(apiSrc.includes('case "internalEduRemind": return json(await internalEduRemind(req));'));
  for (const name of ['internalEduNotify', 'internalEduRemind']) {
    const f = fn(name), gate = f.indexOf('sameSecret(req.headers.get("x-internal-key") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "")');
    assert.ok(gate > 0, name + ' 문');
    for (const k of ['.from(', '.rpc(', 'eduNotify', 'fetchAllRows', 'eduKst()']) { const i = f.indexOf(k); assert.ok(i < 0 || i > gate, name + ' 가 문보다 먼저 ' + k); }
    assert.ok(f.includes('return { ok: false, error: "unauthorized" };'), name);
    assert.ok(!/return \{[^}]*user_id/.test(f), name + ' 응답에 user_id');
  }
  const n = fn('internalEduNotify');
  assert.ok(n.includes('if (b.kind !== "confirmed") return { ok: false, error: "bad-kind" };') && n.includes('return { ok: true, sent, skipped: ids.length - sent };'));
  const r = fn('internalEduRemind');
  assert.ok(r.includes('.not("status", "in", "(draft,archived,done)")'), '초안·보관·마침 뺌');
  assert.ok(r.includes('(ss[0]?.on_date ?? c.starts_on ?? null) !== day'), '첫 날 = coalesce(첫 회차, 시작일)');
  assert.ok(r.includes('eduNotifySend("first_day"'));
  const s = fn('eduNotifySend');
  const iGate = s.indexOf('if (!(await eduOpenNow())) {'), iTesters = s.indexOf('const testers = await ministryTesterIds();');
  const iLoop = s.indexOf('for (let i = 0; i < cand.length; i += EDU_CLAIM_CHUNK) {');
  const iDev = s.indexOf('eduDevicesOf('), iClaim = s.indexOf('db.rpc("edu_notify_claim"'), iPush = s.indexOf('eduPushDevices(');
  assert.ok(iGate > 0 && iGate < iTesters && iTesters < iLoop, '문(eduOpen → 시험 참여자 명단 한 번)은 덩이 고리 앞');
  assert.ok(s.includes('cand = cand.filter((r) => testers.has(String(r.user_id)));'), '시험 참여자만 남긴다(걸러진 줄은 잡지 않는다)');
  assert.ok(!s.includes('ministryIsTester('), '분마다 ministryIsTester 를 부르지 않는다');
  assert.ok(iLoop < iDev && iDev < iClaim && iClaim < iPush, '덩이마다 기기 → 잡기 → 보냄');
  assert.ok(s.includes('p_ids: part.map((r) => Number(r.id))') && s.includes('const claimed = eduClaimedIds(got);'), '덩이(part)만 잡고 · 배열 하나로 읽는다');
  assert.ok(s.includes('if (!claimed.has(Number(r.id))) continue;'), '잡힌 신청에만');
  assert.ok(apiSrc.includes('const EDU_CLAIM_CHUNK = 500;'), '덩이 500');
  const op = fn('eduOpenNow');
  assert.ok(op.includes('.eq("key", "eduOpen")') && op.includes('if (error) throw error;') && op.includes('return data?.value === true;'), '문은 true 하나 · 오류는 던진다');
  const ti = fn('ministryTesterIds');
  assert.ok(ti.includes('.eq("key", "ministryTesters")') && ti.includes('ministryKeysToUsers(keys)'), '시험 참여자 명단 → 사람(한 번)');
  assert.ok(fn('ministryIsTester').includes('(await ministryTesterIds()).has(userId)'), 'ministryIsTester 도 같은 길');
  const dv = fn('eduDevicesOf');
  assert.ok(dv.includes('fetchAllRows(() => db.from("push_subscriptions")') && dv.includes('fetchAllRows(() => db.from("ios_push_tokens")'), '기기도 1,000줄 넘게 이어 받는다');
  assert.equal((dv.match(/\.order\("id"\)\)/g) || []).length, 2, '이어 받기는 id 차례로');
  const p = fn('eduPushDevices');
  assert.ok(p.includes('webPushList(web,') && p.includes('sendApns(t.device_token, title, body, o)'), '웹 푸시 + 아이폰');
  const logPart = p.slice(p.indexOf('const note'));
  assert.ok(p.includes('insert({ ...logBase, body, note })') && !/user_id|device_token|endpoint/.test(logPart), 'push_log 에 user_id·기기 없음');
  const c = fn('eduCancel');
  assert.ok(c.includes('if (r.ok && r.promoted != null) eduAfterResponse(eduNotifyConfirmed([Number(r.promoted)], true), "eduCancel notify");'),
    '취소로 올라간 분 — 안에서 · 응답 뒤에(기다리지 않는다)');
  assert.ok(!/await eduNotify/.test(c), '취소한 성도님은 알림 보내기를 기다리지 않는다');
  const bg = apiSrc.slice(apiSrc.indexOf('function eduAfterResponse('), apiSrc.indexOf('\n}\n', apiSrc.indexOf('function eduAfterResponse(')));
  assert.ok(bg.includes('p.catch(') && bg.includes('rt.waitUntil(job)') && bg.includes('typeof rt.waitUntil === "function"') && !bg.includes('await'),
    'EdgeRuntime.waitUntil 이 있으면 맡기고 · 없으면 띄워 둔다 · 오류는 삼킨다');
  assert.ok(!fn('eduApply').includes('eduNotify'), '선착순 즉시 확정은 알리지 않는다(친구 결정)');
  // pushToSubs(필사·사역·신고)는 예전 그대로 — 웹 푸시만 · push_log 한 줄
  const ps = fn('pushToSubs');
  assert.ok(ps.includes('await webPushList(list, payload)') && ps.includes('insert({ mode, title, sent, failed, total: list.length, ok: sent > 0 })'));
});

test('앱 — 딥링크(routeAfterLoad · 로그인했을 때만 · 플레이 앱은 평소 길) · 이미 열린 창은 서비스워커 url · eduTakeDeepLink 는 edu 만 지운다', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
  const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
  const ra = app.slice(app.indexOf('function routeAfterLoad() {'), app.indexOf('\n}\n', app.indexOf('function routeAfterLoad() {')));
  const iMark = ra.indexOf('readPushMark();'), iEdu = ra.indexOf('eduTakeDeepLink()'), iVerse = ra.indexOf('getDeepLinkVerseNo()');
  assert.ok(iMark >= 0 && iMark < iEdu && iEdu < iVerse, 'from=push 를 먼저 읽고 · 구절 딥링크보다 앞');
  assert.ok(ra.includes('if (_eduDeep && loadUser() && !ministryHiddenOnPlay() && eduVisible()) { renderEduCourse(_eduDeep); return; }'),
    '로그인 안 했거나 🎓 가 안 보이는 분(eduVisible)은 평소 길');
  assert.ok(/type === "from-push"[\s\S]{0,200}eduDeepLinkId\(e\.data\.url\)[\s\S]{0,120}loadUser\(\) && !ministryHiddenOnPlay\(\) && eduVisible\(\)/.test(app), '이미 열린 창도 같은 조건');
  assert.ok(sw.includes('c.postMessage({ type: "from-push", url: url })'), '서비스워커가 알림 주소를 싣는다');
  const t = src.slice(src.indexOf('function eduTakeDeepLink() {'), src.indexOf('\n}\n', src.indexOf('function eduTakeDeepLink() {')));
  assert.ok(t.includes("q.delete('edu')") && t.includes('history.replaceState(null') && t.includes('eduDeepLinkId(location.search)'));
});

test('SQL — edu_notify_log(기본 키 신청·kind · cascade · RLS · service_role 만) · edu_notify_claim · edu_course_refill 의 ids', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'edu.sql'), 'utf8').replace(/\r\n/g, '\n');
  const t = sql.slice(sql.indexOf('create table if not exists public.edu_notify_log ('), sql.indexOf(');', sql.indexOf('create table if not exists public.edu_notify_log (')));
  assert.ok(t.includes('enrollment_id bigint not null references public.edu_enrollments(id) on delete cascade'));
  assert.ok(t.includes("check (kind in ('confirmed','first_day'))") && t.includes('primary key (enrollment_id, kind)'));
  assert.ok(!/^\s*[a-z_]*user_id\s/m.test(t), 'user_id 칸이 없다(기록 합치기 대상이 아니다)');
  for (const line of ['alter table public.edu_notify_log    enable row level security;', 'revoke all on public.edu_notify_log from public, anon, authenticated;',
    'grant all on public.edu_notify_log to service_role;', 'revoke all on function public.edu_notify_claim(text, bigint[]) from public, anon, authenticated;',
    'grant execute on function public.edu_notify_claim(text, bigint[]) to service_role;']) assert.ok(sql.includes(line), line);
  const f = sql.slice(sql.indexOf('create or replace function public.edu_notify_claim('), sql.indexOf('$$;', sql.indexOf('create or replace function public.edu_notify_claim(')));
  assert.ok(f.includes("e.status = 'confirmed' and e.user_id is not null") && f.includes('on conflict (enrollment_id, kind) do nothing'));
  assert.ok(f.includes('returns bigint[] language sql') && !/returns\s+(table|setof)/i.test(f), '잡은 번호는 bigint[] 하나(표면 PostgREST 가 1,000줄에서 자른다)');
  assert.ok(f.includes("select coalesce(array_agg(ins.enrollment_id order by ins.enrollment_id), '{}'::bigint[]) from ins"), '없으면 빈 배열(NULL 아님)');
  const iDrop = sql.indexOf("to_regprocedure('public.edu_notify_claim(text, bigint[])')"), iMake = sql.indexOf('create or replace function public.edu_notify_claim(');
  const dropPart = sql.slice(iDrop, iMake);
  assert.ok(iDrop > 0 && iDrop < iMake && dropPart.includes("(proretset or prorettype <> 'bigint[]'::regtype)") &&
    dropPart.includes('drop function public.edu_notify_claim(text, bigint[]);'), '옛 꼴(표)이면 지우고 만든다(다시 돌려도 안전)');
  const ss = sql.slice(sql.indexOf('create or replace function public.edu_staff_set('), sql.indexOf('end $$;', sql.indexOf('create or replace function public.edu_staff_set(')));
  assert.ok(ss.includes("if e.status = p_status then return jsonb_build_object('ok',true,'promoted',null,'already',true); end if;"), '바뀐 것 없음 = already');
  const rf = sql.slice(sql.indexOf('create or replace function public.edu_course_refill('), sql.indexOf('end $$;', sql.indexOf('create or replace function public.edu_course_refill(')));
  assert.ok(rf.includes("ids := ids || jsonb_build_array(w);") && rf.includes("return jsonb_build_object('ok',true,'promoted',n,'ids',ids);"));
  assert.ok(!/to\s+authenticated/i.test(sql.replace(/--.*$/gm, '')), 'TO authenticated 로 열지 않는다');
});

test('크론 edu_remind_cron.sql — 매일 10:00 UTC(19:00 KST) · 지우고 다시 건다 · 키는 Vault(돌 때 이름으로 읽는다 · 파일·명령에 없음) · 주소는 자리표 · pg_cron·pg_net 없으면 알리기만', () => {
  const c = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'edu_remind_cron.sql'), 'utf8').replace(/\r\n/g, '\n');
  const code = c.replace(/--.*$/gm, '');
  assert.ok(c.includes("v_url text := 'YOUR_API_URL';"), '주소 자리표');
  assert.ok(!/v_key|YOUR_SERVICE_ROLE_KEY/.test(code), '키 자리표·변수가 없다(키는 Vault)');
  assert.ok(!/sb_secret_|sb_publishable_|eyJ[A-Za-z0-9_-]{10,}/.test(c), '키가 들어 있다');
  const iUn = c.indexOf("perform cron.unschedule(jobid) from cron.job where jobname = 'edu-first-day-remind';");
  const iSch = c.indexOf("perform cron.schedule('edu-first-day-remind', '0 10 * * *',");
  assert.ok(iUn > 0 && iUn < iSch, '지우고 다시 건다');
  assert.ok(c.indexOf("extname = 'pg_cron'") < iUn && c.indexOf("extname = 'pg_net'") < iUn && c.indexOf('raise notice') < iUn, '확장이 없으면 알리기만');
  const iNoKey = c.indexOf("raise exception 'Vault 에 edu_remind_service_key");
  assert.ok(c.indexOf('raise notice') < iNoKey, '개발(확장 없음)에서는 Vault 를 보기 전에 알리고 끝난다');
  assert.ok(c.indexOf("raise exception 'YOUR_API_URL") < iUn, '주소 자리표 그대로면 멈춘다');
  assert.ok(iNoKey > 0 && iNoKey < iUn && c.slice(c.lastIndexOf('if not exists', iNoKey), iNoKey).includes("from vault.decrypted_secrets where name = 'edu_remind_service_key'"),
    'Vault 에 그 이름이 없으면 걸지 않고 멈춘다');
  const cmd = c.slice(c.indexOf('format($cmd$'), c.indexOf('$cmd$, v_url))'));
  assert.ok(cmd.includes("'x-internal-key',(select decrypted_secret from vault.decrypted_secrets where name = 'edu_remind_service_key'))"),
    '명령은 돌 때마다 Vault 에서 이름으로 읽는다(키를 명령에 박지 않는다)');
  assert.equal((cmd.match(/%L/g) || []).length, 1, '명령에 끼우는 값은 주소 하나뿐');
  assert.ok(c.includes('$cmd$, v_url));') && cmd.includes("jsonb_build_object('action','internalEduRemind')"));
  assert.ok(c.includes("select vault.create_secret('<") && c.includes("'edu_remind_service_key'") &&
    c.includes("select vault.update_secret((select id from vault.secrets where name = 'edu_remind_service_key'), '<새 키>');"),
    '처음 한 번(create_secret)·키 바꾸기(update_secret)를 적어 둔다');
  assert.ok(!/push_evening|EVENING_LIVE/.test(code), '저녁 알림과 무관');
});
