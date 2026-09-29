// 「우리 교구 안에서」 순위 — narrowRanking(거르기 · 재번호 · 3명 게이트) 검사.
//
//   node --test tests/ranking-scope.test.cjs
//
// ⚠️ **꾸러미를 하나도 쓰지 않는다**(node:test·node:assert·node:fs·node:path·node:vm 뿐).
//    그래서 tools/preflight.py 가 이 검사를 배포 앞 그물에 걸 수 있다 —
//    tests/member-*.test.cjs 는 PGlite·jsdom·typescript 가 있어야 해서 못 걸었다.
//    ⚠️ 여기에 require('jsdom') 같은 줄을 더하는 순간 배포가 통째로 멈춘다. 더하지 말 것.
//
// app.js 는 브라우저용 전역 스크립트라 require() 할 수 없다. tests/member-profile.test.cjs 가
// applyServerUser 를 떼어 내는 것과 같은 방식으로, 두 표식 사이만 잘라 vm 에서 돌린다.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const start = source.indexOf('const MIN_SCOPE_ROWS =');
const end = source.indexOf('async function loadRankingBody(');
assert.ok(start >= 0, 'app.js 에서 MIN_SCOPE_ROWS 를 못 찾았다 — 이 검사가 낡았다');
assert.ok(end > start, 'app.js 에서 narrowRanking 이 loadRankingBody 바로 앞에 없다 — 이 검사가 낡았다');
const context = vm.createContext({});
vm.runInContext(source.slice(start, end), context);
const narrowRanking = context.narrowRanking;
assert.equal(typeof narrowRanking, 'function', 'narrowRanking 을 못 떼어 냈다');

// 서버 ranking 응답의 줄 모양 그대로 (index.ts 가 주는 칸들).
const row = (rank, name, sosok, count, gubun = '교구') => ({
  rank, name, gubun, sosok, sebu: '1', count, typing: count, voice: 0,
  activeToday: true, cheers: 0, iCheered: false, liveNow: false,
});

// 사랑 5명 · 소망 3명 · 청년부 1명이 서버 등수대로 섞여 있는 목록.
const sample = () => [
  row(1, '가성도', '사랑', 40),
  row(2, '나성도', '소망', 33),
  row(3, '다성도', '사랑', 30),
  row(4, '라성도', '소망', 28),
  row(5, '마성도', '사랑', 22),
  row(6, '바성도', '청년부', 20, '교회학교'),
  row(7, '사성도', '소망', 18),
  row(8, '아성도', '사랑', 9),
  row(9, '자성도', '사랑', 4),
];
const me = (sosok, gubun = '교구') => ({ gubun, sosok });

// ① 다른 소속이 안 섞인다
test('같은 소속 줄만 남는다 — 다른 교구·교회학교는 한 줄도 안 섞인다', () => {
  const list = sample();
  const out = narrowRanking(list, me('사랑'));
  assert.equal(out.ok, true);
  assert.deepEqual(out.list.map((x) => x.name), ['가성도', '다성도', '마성도', '아성도', '자성도']);
  assert.ok(out.list.every((x) => x.sosok === '사랑' && x.gubun === '교구'));
  assert.equal(out.count, 5);
  // 서버가 준 순서(cnt desc)를 그대로 보존한다 — 거른 뒤 다시 정렬하지 않는다
  assert.deepEqual(out.list.map((x) => x.count), [40, 30, 22, 9, 4]);
  // 교회학교는 부서명이 그대로 sosok 이다 — 교구 목록에 섞이지 않는다
  const bu = narrowRanking(list, me('청년부', '교회학교'));
  assert.equal(bu.count, 1);
  assert.equal(bu.ok, false);
});

// ② 번호가 1부터다
test('화면 등수는 1부터 빠짐없이 이어진다 — 서버 등수(1·3·5·8·9)와 다르다', () => {
  const out = narrowRanking(sample(), me('사랑'));
  assert.deepEqual(out.ranks, [1, 2, 3, 4, 5]);
  assert.equal(out.ranks.length, out.list.length);
  assert.deepEqual(out.list.map((x) => x.rank), [1, 3, 5, 8, 9]); // 원본은 그대로 성긴 채
  // 🥇🥈🥉 와 .rank-row.top 이 같은 값을 봐야 한다 — 금색 줄은 ranks[i] <= 3 인 셋
  assert.deepEqual(out.ranks.filter((n) => n <= 3), [1, 2, 3]);
});

// ③ 원본 x.rank 가 안 변한다
test('원본 목록을 건드리지 않는다 — x.rank 도 길이도 그대로', () => {
  const list = sample();
  const before = list.map((x) => ({ ...x }));
  const len = list.length;
  narrowRanking(list, me('사랑'));
  narrowRanking(list, me('소망'));
  narrowRanking(list, null);
  assert.equal(list.length, len);
  assert.deepEqual(list, before);
  // 「내 순위」 바가 보는 객체(me = list.find(...))의 등수가 그대로여야 전체 순위를 복구할 수 있다
  const mine = list.find((x) => x.name === '자성도');
  assert.equal(mine.rank, 9);
});

// ④ 걸러진 원소가 원본과 같은 객체다 (===)
test('걸러진 줄은 원본과 같은 객체다 — 사본을 만들지 않는다', () => {
  const list = sample();
  const out = narrowRanking(list, me('사랑'));
  for (const x of out.list) assert.ok(list.includes(x), `${x.name} 이 사본이다`);
  assert.equal(out.list[0], list[0]);
  assert.equal(out.list[4], list[8]);
  // 응원은 배열 원소를 제자리에서 고친다(giveRankCheer) — 좁힌 화면에서 누른 👏가
  // 「전체」로 돌아가도 그대로 보여야 한다. 사본을 쓰면 여기서 깨진다.
  const target = out.list[1];
  target.iCheered = true;
  target.cheers = (target.cheers || 0) + 1;
  assert.equal(list[2].iCheered, true);
  assert.equal(list[2].cheers, 1);
});

// ⑤ 3명 게이트 — 세 갈래
test('게이트 (a) 같은 소속 3명 이상이면 켠다', () => {
  const out = narrowRanking(sample(), me('소망'));
  assert.equal(out.ok, true);
  assert.equal(out.reason, '');
  assert.equal(out.count, 3);
  assert.deepEqual(out.ranks, [1, 2, 3]);
});

test('게이트 (b) 2명 이하면 안 켜고, 안내 문구에 쓸 N 을 준다', () => {
  const two = [row(1, '가성도', '화평', 10), row(2, '나성도', '사랑', 9), row(3, '다성도', '화평', 8)];
  const out = narrowRanking(two, me('화평'));
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'too-few');
  assert.equal(out.count, 2);        // 「이번 기간에 …에서 기록하신 분은 2명이에요」
  // ⚠️ 빈 배열은 .length 로 본다 — vm 으로 떼어 낸 코드가 만든 [] 는 realm 이 달라
  //    deepEqual/deepStrictEqual 둘 다 「구조는 같은데 참조가 다르다」로 떨어진다(검사만의 사정).
  assert.equal(out.list.length, 0);
  assert.equal(out.ranks.length, 0);
  // 나 혼자 · 한 명도 없음도 같은 갈래
  assert.equal(narrowRanking(two, me('기쁨')).count, 0);
  assert.equal(narrowRanking(two, me('기쁨')).reason, 'too-few');
});

test('게이트 (c) 비로그인 · 소속 빈칸이면 칩을 안 그린다', () => {
  for (const bad of [null, undefined, {}, { gubun: '교구' }, { gubun: '교구', sosok: '' }, { sosok: '사랑' }]) {
    const out = narrowRanking(sample(), bad);
    assert.equal(out.ok, false, JSON.stringify(bad));
    assert.equal(out.reason, 'no-scope', JSON.stringify(bad));
    assert.equal(out.count, 0);
    assert.equal(out.list.length, 0);
    assert.equal(out.ranks.length, 0);
  }
});

test('목록이 비어 있거나 배열이 아니어도 터지지 않는다', () => {
  for (const bad of [[], null, undefined]) {
    const out = narrowRanking(bad, me('사랑'));
    assert.equal(out.ok, false);
    assert.equal(out.reason, 'too-few');
    assert.equal(out.count, 0);
  }
});
