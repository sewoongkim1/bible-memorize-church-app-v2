// 사역신청 「몇 시쯤」 시간 구간 — 겹치지 않고 빈틈이 없는가 · 운영의 시작 시각 분포(2026-10-25)가 모두 한 구간에 걸리는가.
// js/ministry.js 를 통째로 읽어(필요한 곳만 가짜로 채워) 실제 minMatch 로 센다.
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
const bands = JSON.parse(vm.runInContext('JSON.stringify(MIN_BANDS)', ctx));
const match = (key, t) => {
  vm.runInContext('minF = { day: [], freq: [], band: [' + JSON.stringify(key) + '] }; minQ = ""', ctx);
  return vm.runInContext('minMatch', ctx)(t);
};
const at = (from) => ({ id: 1, team: 't', group: '', committee: 'c', from, day: { sun: true }, freq: {} });

test('구간은 겹치지 않고(앞 구간의 끝 = 다음 구간의 시작) 빈틈이 없다', () => {
  assert.ok(bands.length >= 3);
  for (let i = 0; i < bands.length; i++) {
    assert.ok(bands[i].a < bands[i].b, bands[i].k);
    if (i) assert.equal(bands[i].a, bands[i - 1].b, bands[i - 1].k + ' → ' + bands[i].k + ' 사이에 빈틈이나 겹침이 있다');
  }
  assert.ok(bands[0].a <= 6 && bands[bands.length - 1].b >= 14, '운영 시작 시각(6시~14시)을 덮지 못한다');
});

test('운영의 시작 시각 7가지(06·08·09·10·12·13·14시)는 모두 정확히 한 구간에 걸린다', () => {
  for (const from of ['06:00', '08:00', '09:00', '10:00', '12:00', '13:00', '14:00']) {
    const hit = bands.filter((b) => match(b.k, at(from)));
    assert.equal(hit.length, 1, from + ' 이 ' + hit.length + '개 구간에 걸린다');
  }
});

test('경계 — 구간의 시작 시각은 그 구간에, 끝 시각은 다음 구간에(반쯤 열린 구간)', () => {
  const b = bands.find((x) => x.k === '9-10');
  assert.ok(match(b.k, at('09:00')) && match(b.k, at('09:59')) && !match(b.k, at('10:00')) && !match(b.k, at('08:59')));
});

test('시각이 없는 팀(시작 시각 모름)은 구간을 고르면 빠진다 — 「모름」을 어느 구간에도 넣지 않는다', () => {
  for (const b of bands) assert.equal(match(b.k, at('')), false);
});
