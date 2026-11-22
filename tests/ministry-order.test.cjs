// 사역 신청서 「사역 찾아보기」의 부서(위원회) 줄 차례 — 교육위원회 · 찬양부를 맨 앞에, 나머지는 가나다순(2026-11-22).
// js/ministry.js 를 통째로 읽어(필요한 곳만 가짜로 채워) 실제 minCommitteeOrder 를 부른다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'ministry.js'), 'utf8');
const ctx = {
  window: {}, console, location: { search: '' },
  document: { getElementById() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; }, addEventListener() {} },
  localStorage: { getItem() { return null; } }, sessionStorage: { getItem() { return null; } },
};
vm.createContext(ctx);
vm.runInContext(src, ctx);
const order = (names) => JSON.parse(JSON.stringify(vm.runInContext('minCommitteeOrder', ctx)(names)));

test('교육위원회 · 찬양부가 맨 앞이고, 나머지는 가나다순이다', () => {
  // 운영 목록이 오는 차례(sort_order)를 흉내 낸다 — 찬양부가 뒤쪽에 있다
  const fromDb = ['감사위원회', '교육위원회', '교회봉사부', '문화스포츠부', '방송전산부', '새가족부',
    '선교부', '예배부', '찬양부', '전도부', '제자양육부', '총무부', '목양부', '재정부'];
  assert.deepEqual(order(fromDb), ['교육위원회', '찬양부',
    '감사위원회', '교회봉사부', '목양부', '문화스포츠부', '방송전산부', '새가족부',
    '선교부', '예배부', '재정부', '전도부', '제자양육부', '총무부']);
});

test('앞에 둘 부서가 목록에 없으면 있는 것만 앞에 두고 빈자리를 만들지 않는다', () => {
  assert.deepEqual(order(['선교부', '찬양부', '감사위원회']), ['찬양부', '감사위원회', '선교부']);
  assert.deepEqual(order(['선교부', '감사위원회']), ['감사위원회', '선교부']);
});

test('받은 목록을 바꾸지 않는다', () => {
  const names = ['선교부', '교육위원회', '감사위원회'];
  order(names);
  assert.deepEqual(names, ['선교부', '교육위원회', '감사위원회']);
});
