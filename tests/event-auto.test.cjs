// 가을 말씀암송 동행 — 신청 없이 「자동 대상」(needs.auto · 2026-10-03 · 설계 §9) 검사.
//
//   node --test tests/event-auto.test.cjs
//
// ⚠️ **꾸러미를 하나도 쓰지 않는다**(node:test·node:assert·node:fs·node:path·node:vm 뿐).
//    tools/preflight.py 가 이 검사를 배포 앞 그물에 건다 — require('jsdom') 같은 줄을 더하면 배포가 통째로 멈춘다.
//
// 무엇을 지키나
//   ① 도장판 끝 문구(js/events.js evtAutoTail) — 대상(서버 eligible)·인정 줄(mine)·닿음·못 닿음·측정 끝난 뒤·✨
//      여섯 주 다 채움에서 고르는 말과, 「신청」(「따로 신청하지 않으셔도」 말고)·「자격」·「달성」·「당첨」·「상」·
//      「순위」·「1등」을 안 쓰는지 · 굵은 0(「0 주」)을 안 박는지
//   ② evtErrText 의 auto-event 문구
//   ③ 화면과 서버의 evtAuto 가 같은 판정인가 · 서버에서 「시험 회차 비테스터 not-found 가 먼저」인 순서
//   ④ 개인정보 — privacy/ 와 앱 안 두 곳(renderPrivacyInfo · renderHelp 🔒)이 같은 문장을 말하나
//
// js/events.js 는 브라우저용 전역 스크립트라 require() 할 수 없다. 두 표식 사이(evtAutoTail)와
// 이름으로 찾은 함수(evtKoNum·evtErrText)만 잘라 같은 realm 에서 돌린다(tests/evening-push.test.cjs 와 같은 방식).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const EVENTS = read('js/events.js');
const APP = read('app.js');
const TS = read('supabase/functions/api/index.ts');
const PRIVACY = read('privacy/index.html');

// 끝 표식은 시작 표식 **뒤에서** 찾는다
function cut(source, start, end, where) {
  const s = source.indexOf(start);
  const e = s >= 0 ? source.indexOf(end, s + start.length) : -1;
  assert.ok(s >= 0, where + ' 에서 시작 표식을 못 찾았다 — 이 검사가 낡았다: ' + start);
  assert.ok(e > s, where + ' 에서 끝 표식이 시작보다 뒤에 없다 — 이 검사가 낡았다: ' + end);
  return source.slice(s, e);
}
// 중괄호 깊이를 세어 function 이름(...) { ... } 전체를 떼어 낸다(줄 순서가 바뀌어도 견딘다).
function fnSource(src, name, where) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\([^)]*\\)[^{]*\\{');
  const m = re.exec(src);
  assert.ok(m, where + ' 에서 함수 ' + name + ' 을 못 찾았다 — 이 검사가 낡았다');
  let i = m.index + m[0].length, depth = 1;
  for (; i < src.length && depth > 0; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') depth--;
  }
  assert.equal(depth, 0, where + ' 에서 ' + name + ' 의 닫는 중괄호를 못 찾았다');
  return src.slice(m.index, i);
}
// 태그를 벗긴 글 — <br> 는 줄바꿈이라 빈칸 하나로 읽는다
const textOf = (html) => String(html).replace(/<br\s*\/?>/g, ' ').replace(/<[^>]*>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
// 주석을 뺀 코드 — 「이렇게 등록됩니다」처럼 주석에도 적힌 글자에 순서 검사가 속지 않게
const codeOf = (src) => src.replace(/\/\/.*$/gm, '');

const tailSlice = cut(EVENTS, '// ── 자동 대상 끝 문구 — 순수 함수 (여기부터) ──',
  '// ── 자동 대상 끝 문구 — 순수 함수 (여기까지) ──', 'js/events.js');
new vm.Script(
  fnSource(EVENTS, 'evtKoNum', 'js/events.js') + '\n' +
  fnSource(EVENTS, 'evtErrText', 'js/events.js') + '\n' +
  tailSlice +
  '\n;globalThis.__evtAuto = { evtAutoTail, evtErrText };').runInThisContext();
const { evtAutoTail, evtErrText } = globalThis.__evtAuto;
assert.equal(typeof evtAutoTail, 'function', 'evtAutoTail 을 못 떼어 냈다');

// 진짜 회차(autumn-2026)의 규칙 — 6주 · 주 3일 · 세 주
const R = { start: '2026-10-18', weeks: 6, perWeek: 3, need: 3, minNeed: 2, perDay: 3 };
const st = (o) => Object.assign({ eligible: false, allWeeks: false, canStillReach: true, weeksDone: 0, need: 3 }, o);
const MID = 16;        // 측정 중(셋째 주)
const ENDED = 6 * 7;   // 11/29 — 측정이 끝난 다음 날

// 성도님 문구에 쓰지 않는 말(설계 §9-2 · 9/23 설계 §8). 「대상」 안의 「상」, 「따로 신청하지 않으셔도」 안의 「신청」은 괜찮다.
function assertClean(html, label) {
  const t = textOf(html);
  for (const w of ['자격', '달성', '당첨', '순위', '1등', '응모', '미달']) {
    assert.ok(!t.includes(w), label + ' — 「' + w + '」가 들어갔다: ' + t);
  }
  assert.ok(!t.replace(/대상/g, '').includes('상'), label + ' — 「상」이 들어갔다: ' + t);
  assert.ok(!t.replace(/따로 신청하지 않으셔도/g, '').includes('신청'), label + ' — 「신청」이 들어갔다: ' + t);
  assert.ok(!/(^|[^0-9])0 주/.test(t), label + ' — 「0 주」(굵은 0)를 박았다: ' + t);
  assert.ok(!/NaN|undefined/.test(t), label + ' — NaN·undefined 가 화면에 나온다: ' + t);
}

test('① 대상(서버 eligible) — 「선물 대상이에요 ✓ — 따로 신청하지 않으셔도 돼요」 + 채우신 주', () => {
  const h = evtAutoTail(st({ eligible: true, weeksDone: 4, canStillReach: true }), R, false, MID);
  const t = textOf(h);
  assert.ok(t.startsWith('선물 대상이에요 ✓ — 따로 신청하지 않으셔도 돼요.'), t);
  assert.ok(t.includes('네 주를 채우셨어요'), '필요 주수(세 주)가 아니라 채우신 주(네 주)를 말해야 한다: ' + t);
  assert.ok(t.includes('남은 주도 편한 만큼 함께해요'), t);
  assertClean(h, '대상');
});

test('② 인정 줄(mine) — 주가 모자라도·못 닿아도 「선물 대상」(담당자가 인정해 넣은 분)', () => {
  const h = evtAutoTail(st({ eligible: false, weeksDone: 1, canStillReach: false }), R, true, MID);
  const t = textOf(h);
  assert.ok(t.includes('선물 대상이에요 ✓'), t);
  assert.ok(!t.includes('이번엔 여기까지'), '인정받은 분께 「이번엔 여기까지예요」를 보이면 안 된다: ' + t);
  assertClean(h, '인정 줄');
  // 채운 주가 0 이어도 「0 주」를 박지 않는다
  const h0 = evtAutoTail(st({ eligible: false, weeksDone: 0, canStillReach: true }), R, true, MID);
  assert.ok(textOf(h0).includes('선물 대상이에요 ✓'));
  assertClean(h0, '인정 줄 · 0주');
});

test('③ 닿을 수 있음 — 「N 주가 되면 선물 대상이 돼요」 · 사람마다 다른 need 를 쓴다', () => {
  const h = evtAutoTail(st({ weeksDone: 1, canStillReach: true, need: 3 }), R, false, MID);
  const t = textOf(h);
  assert.ok(t.includes('지금까지 한 주를 채우셨어요'), t);
  assert.ok(t.includes('세 주가 되면 선물 대상이 돼요'), t);
  assert.ok(t.includes('남은 주에 3일씩만 채우시면 돼요'), t);
  assert.ok(!t.includes('선물 대상이에요'), t);
  assertClean(h, '닿음');
  // 이벤트 중 처음 오신 분(need 2) — 「세 주」를 박지 않는다
  const late = textOf(evtAutoTail(st({ weeksDone: 0, canStillReach: true, need: 2 }), R, false, MID));
  assert.ok(late.includes('두 주가 되면 선물 대상이 돼요'), late);
  assert.ok(!late.includes('지금까지'), '채운 주가 0 이면 「지금까지 …」 줄을 뺀다: ' + late);
  assertClean(late, '닿음 · 늦게 오신 분');
});

test('④ 못 닿음 — 「이번엔 여기까지예요 …」(지금 문구에서 「신청」만 뺀다)', () => {
  const h = evtAutoTail(st({ weeksDone: 2, canStillReach: false }), R, false, MID + 14);
  const t = textOf(h);
  assert.equal(t, '이번엔 여기까지예요. 채우신 두 주는 그대로 남아요 — 다음에 또 함께해요.');
  assertClean(h, '못 닿음');
  const t0 = textOf(evtAutoTail(st({ weeksDone: 0, canStillReach: false }), R, false, MID + 14));
  assert.equal(t0, '이번엔 여기까지예요 — 다음에 또 함께해요.');
});

test('⑤ 측정이 끝난 뒤 — 대상이 아니면 첫 줄이 감사, 대상이면 「선물 대상이에요 ✓」 유지 + 감사', () => {
  const no = textOf(evtAutoTail(st({ weeksDone: 2, canStillReach: false }), R, false, ENDED));
  assert.ok(no.startsWith('여섯 주 동안 함께해 주셔서 고맙습니다.'), no);
  assert.ok(no.includes('채우신 두 주는 그대로 남아 있어요'), no);
  assert.ok(!no.includes('선물 대상') && !no.includes('여기까지'), no);
  assertClean(no, '끝난 뒤 · 대상 아님');
  const no0 = textOf(evtAutoTail(st({ weeksDone: 0, canStillReach: false }), R, false, ENDED));
  assert.equal(no0, '여섯 주 동안 함께해 주셔서 고맙습니다. 다음 걸음에 또 함께해요.');

  const yes = textOf(evtAutoTail(st({ eligible: true, weeksDone: 3, canStillReach: false }), R, false, ENDED));
  assert.ok(yes.startsWith('선물 대상이에요 ✓ — 따로 신청하지 않으셔도 돼요.'), yes);
  assert.ok(yes.includes('여섯 주 동안 함께해 주셔서 고맙습니다'), yes);
  assert.ok(!yes.includes('남은 주도'), '측정이 끝났는데 「남은 주도」라고 하면 안 된다: ' + yes);
  assertClean(yes, '끝난 뒤 · 대상');
  // 인정 줄도 끝난 뒤에 대상 유지
  assert.ok(textOf(evtAutoTail(st({ weeksDone: 0, canStillReach: false }), R, true, ENDED)).includes('선물 대상이에요 ✓'));
});

test('⑥ 여섯 주를 다 채우신 분 — ✨ 그대로 + 선물 대상', () => {
  const h = evtAutoTail(st({ eligible: true, allWeeks: true, weeksDone: 6, canStillReach: true }), R, false, ENDED - 1);
  const t = textOf(h);
  assert.ok(t.includes('선물 대상이에요 ✓'), t);
  assert.ok(t.includes('여섯 주를 다 채우셨어요 ✨'), t);
  assertClean(h, '✨');
  const after = textOf(evtAutoTail(st({ eligible: true, allWeeks: true, weeksDone: 6, canStillReach: false }), R, false, ENDED));
  assert.ok(after.includes('여섯 주를 다 채우셨어요 ✨') && after.includes('고맙습니다'), after);
});

test('⑦ 측정 시작 전(todayIdx < 0) — 닿음 문구로, 날짜 계산이 틀어져도 NaN 을 안 띄운다', () => {
  const h = evtAutoTail(st({ weeksDone: 0, canStillReach: true, need: 3 }), R, false, -5);
  assert.equal(textOf(h), '세 주가 되면 선물 대상이 돼요. 남은 주에 3일씩만 채우시면 돼요.');
  assertClean(evtAutoTail(st({ weeksDone: undefined, need: undefined }), R, false, MID), 'need 없음');
});

test('⑧ evtErrText — auto-event 는 「따로 신청하지 않으셔도 돼요.」', () => {
  assert.equal(evtErrText(new Error('auto-event')), '따로 신청하지 않으셔도 돼요.');
  // 다른 슬러그는 그대로(예전 문구)
  assert.equal(evtErrText(new Error('closed-period')), '등록 기간이 지났어요.');
});

test('⑨ 화면과 서버의 evtAuto 가 같은 판정 · 서버 순서(시험 회차 비테스터 not-found 가 먼저)', () => {
  assert.match(EVENTS, /function evtAuto\(e\) \{ return !!\(e && e\.needs && e\.needs\.auto === true\); \}/);
  assert.match(TS, /function evtAuto\(ev: any\): boolean \{ return !!\(ev && ev\.needs && ev\.needs\.auto === true\); \}/);

  // evtOpenFor — 첫 줄이 자동 대상 거절이다(시험 회차여도 열리지 않는다)
  const openFor = fnSource(TS, 'evtOpenFor', 'index.ts');
  const ofCode = codeOf(openFor);
  assert.ok(ofCode.indexOf('if (evtAuto(ev)) return false;') >= 0, 'evtOpenFor 에 자동 대상 거절이 없다');
  assert.ok(ofCode.indexOf('if (evtAuto(ev)) return false;') < ofCode.indexOf('evtTestOnly(ev)'),
    'evtOpenFor 에서 자동 대상 거절이 시험 회차 갈래보다 뒤에 있다');

  // eventSignup — 시험 회차 비테스터 not-found → auto-event → 기간 검사 순서
  const su = codeOf(fnSource(TS, 'eventSignup', 'index.ts'));
  const iNF = su.indexOf('if (!isTester) return { ok: false, error: "not-found" };');
  const iAuto = su.indexOf('if (evtAuto(ev) && !isAdmin) return { ok: false, error: "auto-event" };');
  const iOpen = su.indexOf('if (!evtOpenFor(ev, today, isTester) && !isAdmin)');
  assert.ok(iNF >= 0 && iAuto >= 0 && iOpen >= 0, 'eventSignup 의 세 검사 중 하나를 못 찾았다 — 이 검사가 낡았다');
  assert.ok(iNF < iAuto && iAuto < iOpen, 'eventSignup 순서가 틀렸다(not-found → auto-event → 기간)');

  // eventDrop — 시험 회차 비테스터는 auto-event 를 받지 않는다(isTester 조건) · 관리자 갈래는 지나간다
  const dr = codeOf(fnSource(TS, 'eventDrop', 'index.ts'));
  assert.ok(/if \(ev && evtAuto\(ev\) && adminError\(b\) !== null && \(!evtTestOnly\(ev\) \|\| isTester\)\)/.test(dr),
    'eventDrop 의 자동 대상 거절 조건이 바뀌었다 — 비테스터·관리자 갈래를 다시 볼 것');
  assert.ok(dr.indexOf('"auto-event"') < dr.indexOf('"closed-period"'), 'eventDrop 에서 auto-event 가 closed-period 보다 뒤에 있다');

  // eventRosterPublic — not-found 가드 → 빈 명단 → event_signups 읽기 순서. 빈 명단에 이름 칸이 없다.
  const rp = codeOf(fnSource(TS, 'eventRosterPublic', 'index.ts'));
  const iGuard = rp.indexOf('!evtListableFor(ev, today, isTester)');
  const iEmpty = rp.indexOf('if (evtAuto(ev)) return { ok: true, event: evOut, total: 0, groups: [] };');
  const iRead = rp.indexOf('from("event_signups")');
  assert.ok(iGuard >= 0 && iEmpty >= 0 && iRead >= 0, 'eventRosterPublic 의 세 자리 중 하나를 못 찾았다 — 이 검사가 낡았다');
  assert.ok(iGuard < iEmpty && iEmpty < iRead, 'eventRosterPublic 순서가 틀렸다(not-found → 빈 명단 → 명단 읽기)');
});

test('⑩ 화면 — 자동 대상 회차는 명단을 받으러 가지 않고, 폼 대신 도장판까지만 그린다', () => {
  const rf = fnSource(EVENTS, 'renderEventForm', 'js/events.js');
  assert.ok(/!e0\.canSignup && !evtAuto\(e0\)/.test(rf), 'renderEventForm 이 자동 대상 회차에도 명단(evtLoadRoster)을 받는다');
  const df = codeOf(fnSource(EVENTS, 'evtDrawForm', 'js/events.js'));
  const iStamp = df.indexOf('html += evtStampHtml(u, e);');
  const iAuto = df.indexOf('if (evtAuto(e)) {');
  const iWho = df.indexOf('이렇게 등록됩니다');
  const iRoster = df.indexOf('evtRosterHtml(');
  const iSignupDate = df.indexOf('부터 신청을 받아요');
  assert.ok(iStamp >= 0 && iAuto > iStamp, 'evtDrawForm 의 자동 대상 갈래가 도장판 뒤에 없다');
  for (const [w, i] of [['이렇게 등록됩니다', iWho], ['공개 명단', iRoster], ['…부터 신청을 받아요', iSignupDate]]) {
    assert.ok(i > iAuto, 'evtDrawForm 에서 「' + w + '」가 자동 대상 갈래보다 앞에 있다 — 자동 대상 회차에도 그려진다');
  }
});

// ⏸ 안드로이드(플레이) 심사 중에는 개인정보 방침을 바꾸지 않는다(친구 2026-10-03) — 방침 문장을 되돌렸으므로 이 시험은 쉰다.
//    심사 통과 뒤 · 10/18 전에 설계 §9-4 의 문장을 세 곳(privacy/ 4항 · renderPrivacyInfo · renderHelp 🔒)에 넣고 test.skip → test 로 되살린다.
test.skip('⑪ 개인정보 — privacy/ 와 앱 안 두 곳이 같은 문장(신청 없이 세는 이벤트 · 끝나면 명단 공개) — 플레이 심사 뒤', () => {
  const SENT = '신청 없이 암송 기록으로 세는 이벤트도 있습니다 — 측정 기간에는 이름·소속을 담당자만 보고, 행사가 끝나면 선물 대상 명단(이름·소속)을 게시판이나 앱 첫 화면에 올립니다(몇 주를 채웠는지·인정 사유는 올리지 않습니다).';
  const p4 = cut(PRIVACY, '<h2>4. 누가 볼 수 있나</h2>', '</ul>', 'privacy/index.html');
  const priv = cut(APP, 'function renderPrivacyInfo(', 'function renderHelp(', 'app.js');
  const help = APP.slice(APP.indexOf('function renderHelp('));
  const s = help.indexOf('🔒 개인정보 안내');
  assert.ok(s >= 0, 'renderHelp 에서 「🔒 개인정보 안내」를 못 찾았다');
  const helpPriv = help.slice(s, help.indexOf('</section>', s));
  for (const [where, raw] of [['privacy/ 4항', p4], ['renderPrivacyInfo', priv], ['renderHelp 🔒', helpPriv]]) {
    assert.ok(textOf(raw).includes(SENT), where + ' 에 「' + SENT + '」가 없다');
  }
  // 「이벤트에 신청할 때만」(신청 회차)은 그대로 둔다
  assert.ok(PRIVACY.includes('이벤트에 신청할 때만'), 'privacy/ 2항 표의 「이벤트에 신청할 때만」이 사라졌다');
  assert.ok(textOf(PRIVACY).includes('신청 없이 암송 기록으로 세는 이벤트도 있습니다 — 4항'), 'privacy/ 2항 표에 4항을 가리키는 줄이 없다');
});
