// 🔊 듣기 — 성경 장·편·절 숫자를 한자어 수로 읽게(2026-11-01 · 꾸러미 없음 · preflight 가 건다)
//
//   node --test tests/tts-ko-num.test.cjs
//
// 왜: 기기 음성이 「누가복음 17장」을 「열일곱 장」으로 읽었다(「장」은 고유어 수와 붙는 셈). 음성에 넘기기 전에 숫자를 한글로 적어
//   「십칠장」으로 읽게 한다. 듣기는 모두 speakText · speakLong 을 지나므로 그 둘에서만 바꾼다(영어 음성은 그대로).
//   읽을 것: docs/notes/album-audio.md 「숫자 읽기」
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const APP = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const S = APP.indexOf('// ── 읽어 줄 숫자 — 순수 (여기부터) ──'), E = APP.indexOf('// ── 읽어 줄 숫자 — 순수 (여기까지) ──');
assert.ok(S >= 0 && E > S, 'app.js 에서 읽어 줄 숫자 순수 구간을 못 찾았다 — 이 검사가 낡았다');
const T = vm.runInContext(APP.slice(S, E) + '\n;({ koSinoNum, ttsKoRefs })', vm.createContext({}));

test('koSinoNum — 한자어 수(십·백·천 앞의 「일」은 뺀다)', () => {
  const cases = { 1: '일', 6: '육', 10: '십', 11: '십일', 16: '십육', 17: '십칠', 20: '이십', 23: '이십삼',
    100: '백', 105: '백오', 110: '백십', 119: '백십구', 150: '백오십', 176: '백칠십육', 1000: '천', 2001: '이천일', 9999: '구천구백구십구' };
  for (const [n, w] of Object.entries(cases)) assert.equal(T.koSinoNum(n), w, n);
  assert.equal(T.koSinoNum('007'), '칠', '앞의 0 은 읽지 않는다');
  assert.equal(T.koSinoNum('0'), '영');
  for (const x of ['12345', 'abc', '', null, undefined, '1.5']) assert.equal(T.koSinoNum(x), x == null ? '' : x, String(x));
});

test('ttsKoRefs — 요절(운영 구절 꼴 그대로)', () => {
  assert.equal(T.ttsKoRefs('누가복음 17장 16절. 예수의 발 아래에 엎드리어'), '누가복음 십칠장 십육절. 예수의 발 아래에 엎드리어');
  assert.equal(T.ttsKoRefs('시편 119편 105절'), '시편 백십구편 백오절');
  assert.equal(T.ttsKoRefs('창세기 1장 1절'), '창세기 일장 일절');
  assert.equal(T.ttsKoRefs('데살로니가전서 5장 16-18절'), '데살로니가전서 오장 십육절에서 십팔절', '범위');
  assert.equal(T.ttsKoRefs('요한복음 15장 7~8절'), '요한복음 십오장 칠절에서 팔절');
  assert.equal(T.ttsKoRefs('시편 23편'), '시편 이십삼편', '장·편만 있는 꼴');
  assert.equal(T.ttsKoRefs('17 장 16 절'), '십칠장 십육절', '사이 띄어쓰기');
});

test('ttsKoRefs — 장·편·절이 아닌 숫자 · 긴 수 · 빈 값은 그대로', () => {
  assert.equal(T.ttsKoRefs('주의 말씀은 내 발에 등이요'), '주의 말씀은 내 발에 등이요');
  assert.equal(T.ttsKoRefs('2026년 11월 1일 총 9242회'), '2026년 11월 1일 총 9242회');
  assert.equal(T.ttsKoRefs('12345장'), '12345장', '다섯 자리 넘는 수의 끝 넉 자리만 잘라 읽지 않는다');
  assert.equal(T.ttsKoRefs('Luke 17:16'), 'Luke 17:16');
  assert.equal(T.ttsKoRefs(''), '');
  assert.equal(T.ttsKoRefs(null), '');
});

test('듣기 두 길(speakText · speakLong)이 모두 한국어일 때만 바꿔 넘긴다', () => {
  const said = APP.slice(APP.indexOf('function ttsSaid('), APP.indexOf('\n', APP.indexOf('function ttsSaid(')));
  assert.match(said, /\^ko/, '한국어 음성에만');
  const st = APP.slice(APP.indexOf('function speakText('), APP.indexOf('\n}\n', APP.indexOf('function speakText(')));
  assert.match(st, /ttsSaid\(text, lang\)/, 'speakText');
  assert.doesNotMatch(st, /new SpeechSynthesisUtterance\(text\)/, 'speakText 가 바꾸기 전 글을 그대로 넘긴다');
  const sl = APP.slice(APP.indexOf('function speakLong('), APP.indexOf('\n}\n', APP.indexOf('function speakLong(')));
  assert.match(sl, /splitForSpeech\(ttsSaid\(text, lang\)\)/, 'speakLong');
  assert.equal((APP.match(/new SpeechSynthesisUtterance\(/g) || []).length, 2, '음성을 만드는 곳이 둘 말고 더 생겼다 — 거기도 ttsSaid 를 거치게');
});
