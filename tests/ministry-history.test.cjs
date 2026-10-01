// 사역 이력 확인 — 화면 순수 묶음 검사(2026-10-01 · 설계 docs/superpowers/specs/2026-10-01-ministry-history-check-design.md §4).
//
//   node --test tests/ministry-history.test.cjs
//
// ⚠️ **꾸러미를 하나도 쓰지 않는다**(node:test·node:assert·node:fs·node:path·node:vm 뿐) — tools/preflight.py 가 배포 앞에 돌린다.
// app.js 는 브라우저용 전역 스크립트라 require() 할 수 없다. 두 표식 사이(순수 묶음)와 minEsc 를 잘라 vm 에서 돌린다.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(path.resolve(__dirname, '..'), 'app.js'), 'utf8');
const START = '// ── 사역 이력 확인 · 순수 ──', END = '// ── 사역 이력 확인 · 순수 끝 ──';
const start = source.indexOf(START), end = source.indexOf(END);
assert.ok(start >= 0 && end > start, 'app.js 에서 사역 이력 확인 순수 묶음 표식을 못 찾았다 — 이 검사가 낡았다');
const esc = /function minEsc\(t\) \{[\s\S]*?\n\}/.exec(source);
assert.ok(esc, 'app.js 에서 minEsc 를 못 찾았다 — 이 검사가 낡았다');
const ctx = vm.createContext({});
vm.runInContext(esc[0] + '\n' + source.slice(start, end), ctx);
const fn = (n) => { assert.equal(typeof ctx[n], 'function', n + ' 을 못 떼어 냈다'); return ctx[n]; };

const row = (id, year, committee, team, o = {}) => ({ id, year, committee, team, role_title: '', position: '집사', ...o });
const req = (o) => ({ id: 1, history_id: null, kind: 'find_me', detail: '', year: null, team_text: '', status: '신청', answer: '', created_at: '', ...o });

test('mhWhoText — 교구-목장 · 목장 99 는 교구만 · 교회학교는 부서·학년', () => {
  const w = fn('mhWhoText');
  assert.equal(w({ type: '교구', gu: '기쁨', mok: '12', name: '홍길동' }), '기쁨-12 홍길동');
  assert.equal(w({ type: '교구', gu: '기쁨', mok: '99', name: '홍길동' }), '기쁨 홍길동');
  assert.equal(w({ type: '교회학교', bu: '중등부', grade: '2학년', name: '홍길동' }), '중등부 2학년 홍길동');
  assert.equal(w(null), '');
});

test('mhStepsHtml — 지금 단계에 now · 「반영 안 함」은 끝 칸만 바뀐다', () => {
  const s = fn('mhStepsHtml');
  const mid = s('확인 중');
  assert.match(mid, /pl-step done"><i><\/i><span>신청/);
  assert.match(mid, /pl-step now"><i><\/i><span>확인 중/);
  assert.match(mid, /<span>반영<\/span>/);
  assert.match(s('반영 안 함'), /pl-step now"><i><\/i><span>반영 안 함/);
});

test('mhHistoryHtml — 해마다 묶고, 열린 신청이 있는 줄은 「신청함」 · 값은 escape', () => {
  const h = fn('mhHistoryHtml');
  const rows = [row(7, 2026, '교육위원회', '유년부', { role_title: '교사' }), row(8, 2026, '<b>', '팀'), row(3, 2025, '찬양위원회', '시온성가대')];
  const out = h(rows, [req({ history_id: 7, kind: 'not_mine', status: '확인 중' }), req({ history_id: 3, kind: 'not_mine', status: '반영' })]);
  assert.equal((out.match(/class="mh-year"/g) || []).length, 2);
  assert.ok(!out.includes('data-fix="7"'), '열린 신청 줄에 정정 단추가 있다');
  assert.ok(out.includes('신청함'));
  assert.ok(out.includes('data-fix="3"'), '끝난 신청 줄은 다시 정정할 수 있어야 한다');
  assert.ok(out.includes('유년부 교사'));
  assert.ok(out.includes('&lt;b&gt;') && !out.includes('<b>'));
  assert.match(h([], []), /아직 올라온 사역 기록이 없어요/);
});

test('mhRequestsHtml — 빠진 사역 · 찾아 주세요 · 줄 정정(빼 둔 줄은 「지난 기록」) · 담당자 말', () => {
  const r = fn('mhRequestsHtml');
  const out = r([
    req({ id: 3, kind: 'missing', year: 2023, team_text: '시온성가대', status: '반영', answer: '2023 시온성가대를 더했어요' }),
    req({ id: 2, kind: 'wrong_team', history_id: 9, detail: '호산나찬양대였어요', status: '반영 안 함', answer: '명단 원본이 집사예요' }),
    req({ id: 1, kind: 'not_mine', history_id: 99 }),
  ], [row(9, 2025, '찬양위원회', '시온성가대')]);
  assert.match(out, /내 정정 신청 <b>3<\/b>건/);
  assert.ok(out.includes('빠진 사역(2023) — 시온성가대'));
  assert.ok(out.includes('2025 시온성가대 — 팀·부서가 틀려요'));
  assert.ok(out.includes('지난 기록 — 내 것이 아니에요'));
  assert.ok(out.includes('명단 원본이 집사예요'));
  assert.equal(r([], []), '');
});

test('mhBodyHtml — 찾지 못하면 「찾아 주세요」(열린 것이 있으면 단추 없이) · 찾으면 빠진 사역 단추', () => {
  const b = fn('mhBodyHtml');
  const nf = b({ found: false, rows: [], requests: [] });
  assert.ok(nf.includes('id="mh-find"') && !nf.includes('id="mh-missing"') && nf.includes('id="mh-exit"'));
  assert.match(nf, /찾지 못했어요/);
  assert.ok(!b({ found: false, rows: [], requests: [req({})] }).includes('id="mh-find"'));
  const f = b({ found: true, rows: [row(1, 2025, '가', '나')], requests: [] });
  assert.ok(f.includes('id="mh-missing"') && !f.includes('id="mh-find"') && f.includes('data-fix="1"'));
});

test('mhCheck — 서버와 같은 규칙(그 밖에 설명 · 연도 · 부서팀 · 글자 수)', () => {
  const c = fn('mhCheck');
  assert.equal(c({ kind: 'not_mine', detail: '' }), null);
  assert.equal(c({ kind: 'other', detail: ' ' }), 'need-detail');
  assert.equal(c({ kind: 'other', detail: '가'.repeat(201) }), 'too-long');
  assert.equal(c({ kind: 'missing', year: '20', team_text: '팀' }), 'bad-year');
  assert.equal(c({ kind: 'missing', year: '2023', team_text: ' ' }), 'need-team');
  assert.equal(c({ kind: 'missing', year: '2023', team_text: '가'.repeat(101) }), 'too-long');
  assert.equal(c({ kind: 'missing', year: '2023', team_text: '시온성가대' }), null);
  assert.equal(c({ kind: 'find_me', detail: '' }), null);
});

test('mhOpenCount·mhErrText — 끝나지 않은 것만 센다 · 모르는 오류는 「잠시 뒤」', () => {
  assert.equal(fn('mhOpenCount')([req({ status: '신청' }), req({ status: '확인 중' }), req({ status: '반영' })]), 2);
  assert.match(fn('mhErrText')('already-open'), /이미 정정 신청/);
  assert.equal(fn('mhErrText')('???'), '잠시 뒤 다시 해 주세요.');
});

test('직분은 정정하지 않는다 — 순수 묶음에 wrong_position·「직분이 틀려요」가 없다(교적 기준 · 2026-10-01)', () => {
  const block = source.slice(start, end);
  assert.ok(!block.includes('wrong_position'), 'wrong_position 이 남았다');
  assert.ok(!block.includes('직분이 틀려요'), '「직분이 틀려요」가 남았다');
});
