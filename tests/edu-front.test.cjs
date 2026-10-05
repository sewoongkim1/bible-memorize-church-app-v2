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
  'function maskName(name) {': 'f75ac72b195255346b43f1e82b89a6ceaf7e35f6a0f73f9116be1cd8588dea78',
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

test('maskName(진위 확인의 가린 이름) — 한 글자 그대로 · 두 글자 뒤를 * · 세 글자 넘으면 처음과 끝만 · NFC·앞뒤 빈칸', () => {
  assert.equal(certCtx.maskName('홍길동'), '홍*동');
  assert.equal(certCtx.maskName('이수'), '이*');
  assert.equal(certCtx.maskName('남궁가나'), '남**나');
  assert.equal(certCtx.maskName('김'), '김');
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
});
