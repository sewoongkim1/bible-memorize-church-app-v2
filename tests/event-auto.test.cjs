// 가을 말씀암송 동행 — 신청 없이 「자동 대상」(needs.auto · 2026-10-03 · 설계 §9) 검사.
//
//   node --test tests/event-auto.test.cjs
//
// ⚠️ **꾸러미를 하나도 쓰지 않는다**(node:test·node:assert·node:fs·node:path·node:vm 뿐).
//    tools/preflight.py 가 이 검사를 배포 앞 그물에 건다 — require('jsdom') 같은 줄을 더하면 배포가 통째로 멈춘다.
//
// 무엇을 지키나
//   ① 도장판 머리·끝 문구(js/events.js evtAutoHead·evtAutoTail · 2026-10-04 바뀜) — 「선물 대상」을 빼고
//      **이벤트 기간에 함께한 날**과 **앞으로 며칠 더**를 응원으로 말하는지(친구 2026-10-04):
//      앞으로 며칠(evtDaysToGo) 표 · 닿음·채움(서버 eligible 또는 오늘 +1)·인정 줄(mine)·못 닿음·측정 끝난 뒤·✨
//      그리고 금지어(「선물」·「대상이에요」·「N 주를 채우셨어요」·「자격」·「달성」·「당첨」·「상」·「순위」·「1등」·
//      「여기까지」·「신청」) · 굵은 0(「0일」) · NaN
//   ② evtErrText 의 auto-event 문구
//   ③ 화면과 서버의 evtAuto 가 같은 판정인가 · 서버에서 「시험 회차 비테스터 not-found 가 먼저」인 순서
//   ④ 개인정보 — privacy/ 와 앱 안 두 곳(renderPrivacyInfo · renderHelp 🔒)이 같은 문장을 말하나(플레이 심사 뒤)
//   ⑤ 도장판(evtStampHtml)을 통째로 돌려 — 주 칸·머리·끝 문구가 같은 수(오늘 살아 있는 +1 포함)를 말하는지,
//      자동 대상이 아닌 회차는 예전 그대로(+1 없음 · 「N 주 채웠어요」)인지
//   ⑥ 자료 SQL 의 부제·시험 회차 안내에 「선물 대상」이 남지 않았는지
//
// js/events.js 는 브라우저용 전역 스크립트라 require() 할 수 없다. 두 표식 사이(자동 대상 순수 함수들)와
// 이름으로 찾은 함수(evtKoNum·evtErrText …)만 잘라 vm 에서 돌린다(tests/evening-push.test.cjs 와 같은 방식).
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
  '\n;globalThis.__evtAuto = { evtAutoTail, evtAutoHead, evtAutoWeekDays, evtAutoDaysTogether, evtDaysToGo, evtErrText };'
).runInThisContext();
const { evtAutoTail, evtAutoHead, evtAutoWeekDays, evtAutoDaysTogether, evtDaysToGo, evtErrText } = globalThis.__evtAuto;
for (const [nm, f] of Object.entries(globalThis.__evtAuto)) assert.equal(typeof f, 'function', nm + ' 을 못 떼어 냈다');

// 진짜 회차(autumn-2026)의 규칙 — 6주 · 주 3일 · 세 주 · 하루 3번
const R = { start: '2026-10-18', weeks: 6, perWeek: 3, need: 3, minNeed: 2, perDay: 3 };
// 시험 회차(autumn-2026-test) — 주 1일 · 한 주
const RT = { start: '2026-09-27', weeks: 6, perWeek: 1, need: 1, minNeed: 1, perDay: 3 };
// 주별 날 수(앞에서부터) — wk(3, 1) = [3, 1, 0, 0, 0, 0]
const wk = (...a) => { const o = [0, 0, 0, 0, 0, 0]; a.forEach((v, i) => { o[i] = v; }); return o; };
const st = (o) => Object.assign({ eligible: false, allWeeks: false, canStillReach: true, weekDays: wk(), weeksDone: 0, need: 3 }, o);
const ENDED = 6 * 7;   // 11/29 — 측정이 끝난 다음 날
// 끝 문구(글) — srv·live 를 안 주면 「오늘 아직 0번」(서버도 0 이라고 안다)
const tail = (s, todayIdx, o = {}) => textOf(evtAutoTail(s, o.r || R, !!o.mine, todayIdx,
  o.srv === undefined ? 0 : o.srv, o.live === undefined ? (o.srv || 0) : o.live));

// 성도님 화면(머리·끝 문구)에 쓰지 않는 말(친구 2026-10-04 · 설계 §9-2 · 9/23 설계 §8).
function assertClean(html, label) {
  const t = textOf(html);
  for (const w of ['선물', '대상', '자격', '달성', '당첨', '상', '순위', '1등', '여기까지', '신청', '응모', '미달']) {
    assert.ok(!t.includes(w), label + ' — 「' + w + '」가 들어갔다: ' + t);
  }
  // 「N 주를 채우셨어요」 꼴(주 수를 앞세우는 말) — 「필요한 날을 모두 채우셨어요」는 괜찮다
  assert.ok(!/주를 (다 )?채우셨어요/.test(t), label + ' — 「N 주를 채우셨어요」 꼴이 들어갔다: ' + t);
  assert.ok(!/(^|[^0-9])0일/.test(t), label + ' — 「0일」(굵은 0)을 박았다: ' + t);
  assert.ok(!/NaN|undefined|null|Infinity/.test(t), label + ' — NaN·undefined 가 화면에 나온다: ' + t);
}

test('① 앞으로 며칠(evtDaysToGo) — 기준에 닿는 가장 적은 날 수 · 이번 주 몇 일', () => {
  const go = (wdays, todayIdx, o = {}) => evtDaysToGo(wdays, o.r || R, o.need === undefined ? 3 : o.need, todayIdx, !!o.stamped);
  // 1) 첫날 0일 — 이번 주 3일 + 두 주 더(3×2)
  assert.deepEqual(go(wk(), 0), { days: 9, thisWeek: 3 });
  // 2) 이번 주(둘째 주 수요일) 2일 — 이번 주 1일 + 두 주 더
  assert.deepEqual(go(wk(0, 2), 10), { days: 7, thisWeek: 1 });
  // 3) 이번 주를 다 채웠다 — 남은 두 주는 다음 주부터(3×2) · 이번 주 말은 없다
  assert.deepEqual(go(wk(0, 3), 11), { days: 6, thisWeek: 0 });
  // 4) 오늘 이미 찍혔다(둘째 주 토요일 · 이번 주 2일에 오늘 포함) — 오늘을 빼면 이번 주에 남은 날이 없다 → 다음 주부터
  assert.deepEqual(go(wk(0, 2), 13, { stamped: true }), { days: 9, thisWeek: 0 });
  //    같은 날 아직 안 찍혔으면 오늘 하루로 이번 주를 채울 수 있다
  assert.deepEqual(go(wk(0, 2), 13), { days: 7, thisWeek: 1 });
  // 5) 토요일이라 이번 주를 못 채운다(첫 주 1일 · 모자란 2일 > 남은 1일) — 다음 주부터 세 주
  assert.deepEqual(go(wk(1), 6), { days: 9, thisWeek: 0 });
  // 6) 늦게 오신 분(need 2) — 「세 주」로 세지 않는다
  assert.deepEqual(go(wk(), 7, { need: 2 }), { days: 6, thisWeek: 3 });
  // 7) 남은 주로 못 닿는다(다섯째 주 · 0일 · 남은 두 주 < 세 주) → null
  assert.deepEqual(go(wk(), 30), { days: null, thisWeek: 0 });
  //    마지막 주 토요일 · 두 주 채움 · 이번 주 0일 — 서버 canStillReach 는 아직 true 지만 남은 하루로 3일은 못 채운다
  assert.deepEqual(go(wk(3, 3), 41), { days: null, thisWeek: 0 });
  // 8) 마지막 주(월요일) · 두 주 채움 — 이번 주 3일이면 된다
  assert.deepEqual(go(wk(3, 3), 36), { days: 3, thisWeek: 3 });
  // 이미 닿았다 → 0 · 측정이 끝났다 → null · 측정 전 → 모든 주가 앞에(이번 주 말은 없다)
  assert.deepEqual(go(wk(3, 3, 3), 20), { days: 0, thisWeek: 0 });
  assert.deepEqual(go(wk(3, 3), ENDED), { days: null, thisWeek: 0 });
  assert.deepEqual(go(wk(), -5), { days: 9, thisWeek: 0 });
  assert.deepEqual(go(wk(), NaN), { days: 9, thisWeek: 0 });
  // 시험 회차(주 1일 · 한 주) — 둘째 주 첫날 0일이면 오늘 하루
  assert.deepEqual(go(wk(), 7, { r: RT, need: 1 }), { days: 1, thisWeek: 1 });
});

test('② 함께한 날 = 도장 찍힌 날 합 · 오늘 살아 있는 +1(첫 화면 알약과 같은 규칙)', () => {
  // 서버가 이미 센 날만
  assert.deepEqual(evtAutoWeekDays(wk(3, 1, 2), R, 18, 0, 0), wk(3, 1, 2));
  assert.equal(evtAutoDaysTogether(evtAutoWeekDays(wk(3, 1, 2), R, 18, 0, 0)), 6);
  // 오늘 막 3번째를 마쳤는데 서버(오늘 2번)는 아직 — 이번 주(셋째 주) +1
  assert.deepEqual(evtAutoWeekDays(wk(3, 1, 2), R, 18, 2, 3), wk(3, 1, 3));
  // 서버도 이미 3번으로 안다 — 서버 weekDays 에 오늘이 들어 있다 → 더하지 않는다
  assert.deepEqual(evtAutoWeekDays(wk(3, 1, 3), R, 18, 3, 3), wk(3, 1, 3));
  // srvToday 를 모른다(null · 자정 넘김·통신 실패) → 「모른다」를 「아직」으로 단정하지 않는다
  assert.deepEqual(evtAutoWeekDays(wk(3, 1, 2), R, 18, null, 3), wk(3, 1, 2));
  // 오늘 아직 문턱 전(2번) → 더하지 않는다
  assert.deepEqual(evtAutoWeekDays(wk(3, 1, 2), R, 18, 1, 2), wk(3, 1, 2));
  // 측정 밖(전·끝난 뒤) → 더하지 않는다 · 서버 배열을 고쳐 쓰지 않는다(새 배열)
  assert.deepEqual(evtAutoWeekDays(wk(), R, -1, 0, 3), wk());
  assert.deepEqual(evtAutoWeekDays(wk(3), R, ENDED, 0, 3), wk(3));
  const srv = wk(0, 1);
  evtAutoWeekDays(srv, R, 10, 0, 3);
  assert.deepEqual(srv, wk(0, 1), '서버 weekDays 를 고쳐 썼다 — 다시 받으면 저절로 맞아야 한다');
  // 머리
  assert.equal(evtAutoHead(0), '첫 칸을 기다리고 있어요');
  assert.equal(evtAutoHead(7), '지금까지 7일 함께하셨어요');
  assertClean(evtAutoHead(0), '머리 · 0일');
  assertClean(evtAutoHead(12), '머리');
});

test('③ 닿을 수 있음 — 「이벤트 기간에 N일 … 앞으로 D일 더 …(한 주에 3일씩)」 + 이번 주 + 응원', () => {
  // 첫날 0일 — 첫 문장 대신 「앞으로 D일 함께하시면 돼요 … — 오늘 3번이면 첫 칸이에요.」
  assert.equal(tail(st(), 0),
    '앞으로 9일 함께하시면 돼요(한 주에 3일씩) — 오늘 3번이면 첫 칸이에요. 이번 주는 3일이면 채워져요. 오늘도 말씀과 함께 힘내요 🙂');
  // 이번 주 2일(앞 주 1일까지 3일)
  assert.equal(tail(st({ weekDays: wk(1, 2), weeksDone: 0 }), 10),
    '이벤트 기간에 3일 함께하셨어요. 앞으로 7일 더 함께하시면 돼요(한 주에 3일씩). 이번 주는 1일 더 하시면 채워져요. 오늘도 말씀과 함께 힘내요 🙂');
  // 「앞으로 D일 더」는 굵게
  assert.ok(evtAutoTail(st({ weekDays: wk(1, 2) }), R, false, 10, 0, 0).includes('<b>앞으로 7일 더</b>'));
  // 이번 주를 다 채웠다 — 이번 주 말 없이
  assert.equal(tail(st({ weekDays: wk(0, 3), weeksDone: 1 }), 11),
    '이벤트 기간에 3일 함께하셨어요. 앞으로 6일 더 함께하시면 돼요(한 주에 3일씩). 오늘도 말씀과 함께 힘내요 🙂');
  // 오늘 이미 찍혔다(토요일) — 서버도 안다(오늘 3번) → 다음 주부터
  assert.equal(tail(st({ weekDays: wk(0, 2) }), 13, { srv: 3 }),
    '이벤트 기간에 2일 함께하셨어요. 앞으로 9일 더 함께하시면 돼요(한 주에 3일씩). 오늘도 말씀과 함께 힘내요 🙂');
  // 오늘 막 찍었는데 서버(2번)는 아직 — 칸·머리·문구가 +1 로 같은 수(2일)
  assert.equal(tail(st({ weekDays: wk(0, 1) }), 13, { srv: 2, live: 3 }),
    '이벤트 기간에 2일 함께하셨어요. 앞으로 9일 더 함께하시면 돼요(한 주에 3일씩). 오늘도 말씀과 함께 힘내요 🙂');
  // 토요일이라 이번 주를 못 채운다 — 이번 주 말 없이 다음 주부터
  assert.equal(tail(st({ weekDays: wk(1) }), 6),
    '이벤트 기간에 1일 함께하셨어요. 앞으로 9일 더 함께하시면 돼요(한 주에 3일씩). 오늘도 말씀과 함께 힘내요 🙂');
  // 늦게 오신 분(need 2) — 「세 주」로 세지 않는다
  assert.equal(tail(st({ need: 2 }), 7),
    '앞으로 6일 함께하시면 돼요(한 주에 3일씩) — 오늘 3번이면 첫 칸이에요. 이번 주는 3일이면 채워져요. 오늘도 말씀과 함께 힘내요 🙂');
  // 마지막 주(월요일) · 두 주 채움
  assert.equal(tail(st({ weekDays: wk(3, 3), weeksDone: 2 }), 36),
    '이벤트 기간에 6일 함께하셨어요. 이번 주에 3일 함께하시면 돼요. 오늘도 말씀과 함께 힘내요 🙂');
  // 시험 회차(주 1일 · 한 주) — 새로 오신 시험 참여자
  assert.equal(tail(st({ need: 1 }), 7, { r: RT }),
    '이번 주에 1일 함께하시면 돼요 — 오늘 3번이면 첫 칸이에요. 오늘도 말씀과 함께 힘내요 🙂');
  // 옛 응답(need 없음) — 회차 기본값(세 주)으로 · 「0 주」·NaN 없이
  assert.equal(tail(st({ need: undefined }), 0),
    '앞으로 9일 함께하시면 돼요(한 주에 3일씩) — 오늘 3번이면 첫 칸이에요. 이번 주는 3일이면 채워져요. 오늘도 말씀과 함께 힘내요 🙂');
  assertClean(evtAutoTail(st({ weekDays: wk(1, 2) }), R, false, 10, 0, 0), '닿음');
});

test('④ 기준을 채움(서버 eligible · 오늘 +1) — 「필요한 날을 모두 채우셨어요 🙂」 · 모든 주 ✨', () => {
  assert.equal(tail(st({ eligible: true, weekDays: wk(3, 4, 3), weeksDone: 3 }), 22),
    '이벤트 기간에 10일 함께하셨어요. 필요한 날을 모두 채우셨어요 🙂 남은 날도 편한 만큼 말씀과 함께해요.');
  // 서버는 아직 두 주(셋째 주 2일)인데 오늘 막 세 번 — +1 로 셋째 주가 차서 닿았다(「앞으로 0일」을 띄우지 않는다)
  assert.equal(tail(st({ weekDays: wk(3, 3, 2), weeksDone: 2 }), 20, { srv: 1, live: 3 }),
    '이벤트 기간에 9일 함께하셨어요. 필요한 날을 모두 채우셨어요 🙂 남은 날도 편한 만큼 말씀과 함께해요.');
  // 여섯 주 모두 — ✨
  assert.equal(tail(st({ eligible: true, allWeeks: true, weekDays: wk(3, 3, 3, 3, 3, 3), weeksDone: 6 }), 41),
    '이벤트 기간에 18일 함께하셨어요. 필요한 날을 모두 채우셨어요 🙂 남은 날도 편한 만큼 말씀과 함께해요. ✨ 매주 빠짐없이 함께하셨어요.');
  // 시험 회차(한 주면 된다) — 친구 계정(10/3 토요일 하루)
  assert.equal(tail(st({ eligible: true, weekDays: wk(1), weeksDone: 1, need: 1 }), 7, { r: RT }),
    '이벤트 기간에 1일 함께하셨어요. 필요한 날을 모두 채우셨어요 🙂 남은 날도 편한 만큼 말씀과 함께해요.');
  // 주 수를 앞세우지 않는다 — 다섯 주 채운 분께도 「N 주를 채우셨어요」가 없다 · 모든 주가 아니면 ✨ 없음
  const h = evtAutoTail(st({ eligible: true, weekDays: wk(3, 3, 3, 3, 3), weeksDone: 5 }), R, false, 38, 0, 0);
  assert.ok(!textOf(h).includes('✨'), '모든 주를 안 채웠는데 ✨: ' + textOf(h));
  assertClean(h, '채움');
});

test('⑤ 담당자가 넣은 줄만(mine · eligible 아님) — 고마움 · 「필요한 날을 채우셨어요」라고 하지 않는다', () => {
  assert.equal(tail(st({ weekDays: wk(0, 0, 1), canStillReach: false }), 16, { mine: true }),
    '이벤트 기간에 1일 함께하셨어요. 함께해 주셔서 고마워요 — 남은 날도 편한 만큼 말씀과 함께해요.');
  // 0일이면 첫 문장을 뺀다(굵은 0 없이)
  assert.equal(tail(st(), 16, { mine: true }), '함께해 주셔서 고마워요 — 남은 날도 편한 만큼 말씀과 함께해요.');
  // 못 닿는 분이어도 「한 걸음 한 걸음」이 아니라 고마움(인정받은 분)
  const t = tail(st({ weekDays: wk(1) }), 30, { mine: true });
  assert.ok(!t.includes('필요한 날') && !t.includes('한 걸음') && !t.includes('앞으로'), t);
  // mine 이면서 서버 eligible — 채움 문구(사실이다)
  assert.ok(tail(st({ eligible: true, weekDays: wk(3, 3, 3), weeksDone: 3 }), 22, { mine: true }).includes('필요한 날을 모두 채우셨어요'));
  assertClean(evtAutoTail(st({ weekDays: wk(1) }), R, true, 16, 0, 0), '인정 줄');
});

test('⑥ 남은 주로 못 닿음 — 「한 걸음 한 걸음이 귀해요 …」(「여기까지」·「떨어졌다」 없이)', () => {
  assert.equal(tail(st({ weekDays: wk(1, 0, 0, 0, 2), canStillReach: false }), 30),
    '이벤트 기간에 3일 함께하셨어요. 한 걸음 한 걸음이 귀해요 — 남은 날도 말씀과 함께해요.');
  assert.equal(tail(st({ canStillReach: false }), 30), '한 걸음 한 걸음이 귀해요 — 남은 날도 말씀과 함께해요.');
  // 마지막 주 토요일 · 두 주 채움 · 이번 주 0일 — 서버 canStillReach 가 true 여도 남은 하루로는 못 닿는다
  assert.equal(tail(st({ weekDays: wk(3, 3), weeksDone: 2, canStillReach: true }), 41),
    '이벤트 기간에 6일 함께하셨어요. 한 걸음 한 걸음이 귀해요 — 남은 날도 말씀과 함께해요.');
  assertClean(evtAutoTail(st({ weekDays: wk(1) }), R, false, 30, 0, 0), '못 닿음');
});

test('⑦ 측정이 끝난 뒤 · 측정 전 — 감사로 맺고, 「오늘 …번이면 첫 칸」은 측정 중에만', () => {
  assert.equal(tail(st({ weekDays: wk(1, 2, 0, 2), canStillReach: false }), ENDED),
    '이벤트 기간에 5일 함께하셨어요. 여섯 주 동안 함께해 주셔서 고맙습니다.');
  assert.equal(tail(st({ eligible: true, weekDays: wk(3, 3, 3), weeksDone: 3, canStillReach: false }), ENDED),
    '이벤트 기간에 9일 함께하셨어요. 필요한 날을 모두 채우셨어요 🙂 여섯 주 동안 함께해 주셔서 고맙습니다.');
  assert.equal(tail(st({ eligible: true, allWeeks: true, weekDays: wk(3, 3, 3, 3, 3, 3), weeksDone: 6 }), ENDED),
    '이벤트 기간에 18일 함께하셨어요. 필요한 날을 모두 채우셨어요 🙂 여섯 주 동안 함께해 주셔서 고맙습니다. ✨ 매주 빠짐없이 함께하셨어요.');
  // 인정 줄(eligible 아님)은 끝난 뒤에도 「필요한 날을 채우셨어요」라고 하지 않는다
  assert.equal(tail(st({ weekDays: wk(1), canStillReach: false }), ENDED, { mine: true }),
    '이벤트 기간에 1일 함께하셨어요. 여섯 주 동안 함께해 주셔서 고맙습니다.');
  assert.equal(tail(st({ canStillReach: false }), ENDED), '여섯 주 동안 함께해 주셔서 고맙습니다.');
  // 측정 전 — 오늘은 세지 않으므로 「오늘 3번이면 첫 칸」 대신 「시작하는 날부터」
  assert.equal(tail(st(), -5),
    '앞으로 9일 함께하시면 돼요(한 주에 3일씩) — 시작하는 날부터 하루 3번이면 한 칸이에요. 오늘도 말씀과 함께 힘내요 🙂');
  // 날짜 계산이 틀어져도(NaN) NaN 을 안 띄운다
  assertClean(evtAutoTail(st({ weekDays: undefined, need: undefined }), R, false, NaN, null, 0), 'NaN');
});

test('⑦-2 금지어 전수 — 측정 전부터 끝난 뒤까지 · 여러 진행 · mine/eligible 조합 모두', () => {
  const pats = [wk(), wk(1), wk(3), wk(0, 2), wk(3, 3), wk(3, 1, 2), wk(3, 3, 3), wk(1, 0, 0, 0, 2),
    wk(3, 3, 3, 3, 3, 3), wk(7, 7, 7, 7, 7, 7)];
  let n = 0;
  for (const r of [R, RT]) for (let ti = -3; ti <= ENDED + 2; ti++) for (const w of pats) for (const mine of [false, true]) {
    for (const need of [r.need, 2]) for (const [srv, live] of [[0, 0], [2, 3], [3, 3], [null, 3]]) {
      const done = w.filter((x) => x >= r.perWeek).length;
      const s = st({ weekDays: w, weeksDone: done, need, eligible: done >= need, allWeeks: done >= r.weeks });
      const label = 'ti=' + ti + ' w=' + w + ' mine=' + mine + ' need=' + need + ' srv=' + srv;
      const h = evtAutoTail(s, r, mine, ti, srv, live);
      assertClean(h, label);
      assert.ok(textOf(h).length > 0, '빈 끝 문구 — ' + label);
      // 「앞으로 D일」의 D 는 양수
      const m = /앞으로 (\d+)일/.exec(textOf(h));
      if (m) assert.ok(Number(m[1]) > 0, '앞으로 0일 — ' + label + ': ' + textOf(h));
      assertClean(evtAutoHead(evtAutoDaysTogether(evtAutoWeekDays(w, r, ti, srv, live))), '머리 — ' + label);
      n++;
    }
  }
  assert.ok(n > 5000, '조합이 너무 적다: ' + n);
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
  // 관리자 갈래도 막는다(2026-10-04) — 조건에 !isAdmin 이 다시 붙으면 공용 관리자 암호로 인정·확정 줄을 덮을 수 있다
  const iAuto = su.indexOf('if (evtAuto(ev)) return { ok: false, error: "auto-event" };');
  const iOpen = su.indexOf('if (!evtOpenFor(ev, today, isTester) && !isAdmin)');
  assert.ok(iNF >= 0 && iAuto >= 0 && iOpen >= 0, 'eventSignup 의 세 검사 중 하나를 못 찾았다 — 이 검사가 낡았다');
  assert.ok(iNF < iAuto && iAuto < iOpen, 'eventSignup 순서가 틀렸다(not-found → auto-event → 기간)');

  // eventDrop — 시험 회차 비테스터는 auto-event 를 받지 않는다(isTester 조건) · 관리자 갈래도 막는다(2026-10-04)
  const dr = codeOf(fnSource(TS, 'eventDrop', 'index.ts'));
  assert.ok(/if \(ev && evtAuto\(ev\) && \(adminError\(b\) === null \|\| !evtTestOnly\(ev\) \|\| isTester\)\)/.test(dr),
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
  const SENT = '신청 없이 암송 기록으로 세는 이벤트도 있습니다 — 측정 기간에는 이름·소속을 담당자만 보고, 행사가 끝나면 기준을 채우신 분의 이름·소속을 그 이벤트 명단에 남기고(신청하지 않으셔도), 그 명단(이름·소속)을 게시판이나 앱 첫 화면에 올립니다(몇 주를 채웠는지·인정 사유는 올리지 않습니다).';
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

// ── 도장판 통째로(evtStampHtml) — 주 칸·머리·끝 문구가 같은 수를 말하나 ──
//   evtStampHtml 은 전역(evtStamp·todayYmd·stampToday·evtMineOf …)을 읽어서 따로 떼어 vm 맥락 하나에 심고 돌린다.
function stampBoard() {
  const ctx = vm.createContext({});
  vm.runInContext([
    'var evtStampState = "ready", evtStamp = null, evtStampDay = null, __today = "", __live = 0, __mine = false;',
    'function todayYmd() { return __today; }',
    // app.js stampToday 와 같은 식(이 기기에서 오늘 센 수 __live 와 서버 값 중 큰 쪽)
    'function stampToday(srv) { return Math.max(Number(srv) || 0, __live); }',
    'function evtMineOf(id) { return __mine ? { eventId: id } : null; }',
    fnSource(EVENTS, 'evtEsc', 'js/events.js'),
    fnSource(EVENTS, 'evtKoNum', 'js/events.js'),
    fnSource(EVENTS, 'evtAuto', 'js/events.js'),
    fnSource(EVENTS, 'evtWeekLabel', 'js/events.js'),
    fnSource(EVENTS, 'evtDayYmd', 'js/events.js'),
    tailSlice,
    fnSource(EVENTS, 'evtStampHtml', 'js/events.js'),
  ].join('\n'), ctx);
  return ctx;
}
function parseBoard(html) {
  const head = textOf((/<div class="ev-stamp-h">(.*?)<\/div>/.exec(html) || [])[1] || '');
  const cells = [];
  const re = /<div class="ev-wk( on)?"><div class="ev-wk-t">.*?<\/div><div class="ev-wk-v(?: zero)?">(.*?)<\/div><\/div>/g;
  let m;
  while ((m = re.exec(html))) cells.push({ on: !!m[1], v: m[2] });
  const tailT = textOf((/<div class="ev-stamp-tail">(.*?)<\/div>/.exec(html) || [])[1] || '');
  const todayOn = /<div class="ev-day on today">/.test(html);
  const boxCls = (/^<div class="([^"]*)">/.exec(html) || [])[1] || '';
  return { head, cells, tail: tailT, todayOn, boxCls };
}

test('⑫ 도장판 통째로 — 자동 대상은 주 칸·머리·끝 문구가 같은 수(오늘 +1) · 다른 회차는 예전 그대로', () => {
  const ctx = stampBoard();
  // 셋째 주 목요일(11/5) · 첫 주 3일 · 둘째 주 1일 · 셋째 주 11/1·11/2 두 날 + 오늘 서버는 2번(아직 칸 아님)
  const S = {
    ok: true, rule: R, phase: 'measuring',
    weekDays: wk(3, 1, 2), weeksDone: 1, need: 3, eligible: false, allWeeks: false, canStillReach: true,
    days: { '2026-10-18': 3, '2026-10-19': 3, '2026-10-20': 4, '2026-10-26': 3,
            '2026-11-01': 3, '2026-11-02': 5, '2026-11-05': 2 },
    todayCount: 2,
  };
  const AUTO = { id: 'autumn-2026', needs: { auto: true, eligibility: R } };
  const PLAIN = { id: 'autumn-2026', needs: { eligibility: R } };
  const U = { name: '김성도' };
  const draw = (e, o = {}) => {
    ctx.evtStamp = JSON.parse(JSON.stringify(S));
    ctx.__today = '2026-11-05';
    ctx.evtStampDay = o.day || '2026-11-05';
    ctx.__live = o.live === undefined ? 3 : o.live;
    ctx.__mine = !!o.mine;
    return parseBoard(ctx.evtStampHtml(U, e));
  };

  // A. 자동 대상 · 오늘 막 3번 — 서버는 아직(2번) → 셋째 주 칸이 ✓ 로 오르고 머리·끝 문구가 7일
  const a = draw(AUTO);
  assert.deepEqual(a.cells.map((c) => c.v), ['✓', '1일', '✓', '·', '·', '·']);
  assert.deepEqual(a.cells.map((c) => c.on), [true, false, true, false, false, false]);
  assert.ok(a.todayOn, '7일 띠의 오늘 칸이 ✓ 가 아니다');
  assert.equal(a.boxCls, 'ev-stampbox ev-auto', '자동 대상 상자에 ev-auto(낱말 단위로 접기)가 없다');
  assert.equal(a.head, '김성도 님의 도장판 · 지금까지 7일 함께하셨어요');
  assert.equal(a.tail,
    '이벤트 기간에 7일 함께하셨어요. 앞으로 3일 더 함께하시면 돼요(한 주에 3일씩). 오늘도 말씀과 함께 힘내요 🙂');
  // 칸의 수 = 머리의 수 = 끝 문구의 수(같은 배열 하나)
  const n = evtAutoDaysTogether(evtAutoWeekDays(S.weekDays, R, 18, 2, 3));
  assert.equal(n, 7);
  assert.ok(a.head.includes(n + '일') && a.tail.includes(n + '일 함께하셨어요'));
  for (const t of [a.head.replace('김성도 님의 도장판 · ', ''), a.tail]) assertClean(t, '도장판 A');

  // B. 오늘 아직 2번(문턱 전) — +1 없이 6일 · 이번 주 1일 더(오늘 포함 사흘 남음)
  const b = draw(AUTO, { live: 2 });
  assert.deepEqual(b.cells.map((c) => c.v), ['✓', '1일', '2일', '·', '·', '·']);
  assert.equal(b.head, '김성도 님의 도장판 · 지금까지 6일 함께하셨어요');
  assert.equal(b.tail,
    '이벤트 기간에 6일 함께하셨어요. 앞으로 4일 더 함께하시면 돼요(한 주에 3일씩). 이번 주는 1일 더 하시면 채워져요. 오늘도 말씀과 함께 힘내요 🙂');

  // C. 어제 받은 도장(자정 넘김) — 서버 오늘 합을 「모른다」 → 첫 화면 알약처럼 +1 을 건너뛴다(칸·머리·문구 모두 6일)
  const c = draw(AUTO, { day: '2026-11-04' });
  assert.deepEqual(c.cells.map((x) => x.v), ['✓', '1일', '2일', '·', '·', '·']);
  assert.equal(c.head, '김성도 님의 도장판 · 지금까지 6일 함께하셨어요');
  assert.ok(c.tail.startsWith('이벤트 기간에 6일 함께하셨어요.'), c.tail);

  // D. 담당자가 넣은 줄(mine) — 칸은 같고 끝 문구만 고마움
  const d = draw(AUTO, { mine: true, live: 2 });
  assert.equal(d.tail, '이벤트 기간에 6일 함께하셨어요. 함께해 주셔서 고마워요 — 남은 날도 편한 만큼 말씀과 함께해요.');

  // E. 자동 대상이 아닌 회차 — 예전 그대로(오늘 +1 을 칸에 얹지 않는다 · 「N 주 채웠어요」·「신청 단추가 열려요」)
  const e = draw(PLAIN);
  assert.deepEqual(e.cells.map((x) => x.v), ['✓', '1일', '2일', '·', '·', '·']);
  assert.equal(e.head, '김성도 님의 도장판 · 지금까지 한 주 채웠어요');
  assert.equal(e.tail,
    '지금까지 한 주를 채우셨어요. 세 주가 되면 이 자리에 신청 단추가 열려요. 남은 주에 3일씩만 채우시면 돼요.');
  assert.ok(e.todayOn, '다른 회차의 7일 띠(오늘 칸)는 예전처럼 살아 있는 값으로 ✓');
  assert.equal(e.boxCls, 'ev-stampbox', '다른 회차의 상자 class 가 바뀌었다');

  // F. 0일 — 머리 「첫 칸을 기다리고 있어요」 · 다른 회차는 「첫 주를 채우는 중이에요」 그대로
  ctx.evtStamp = Object.assign(JSON.parse(JSON.stringify(S)), { weekDays: wk(), weeksDone: 0, days: {}, todayCount: 0 });
  ctx.__live = 0; ctx.evtStampDay = '2026-11-05'; ctx.__mine = false;
  assert.equal(parseBoard(ctx.evtStampHtml(U, AUTO)).head, '김성도 님의 도장판 · 첫 칸을 기다리고 있어요');
  assert.equal(parseBoard(ctx.evtStampHtml(U, PLAIN)).head, '김성도 님의 도장판 · 첫 주를 채우는 중이에요');
});

test('⑬ 자료 SQL — 부제·시험 회차 안내에 「선물 대상」이 남지 않는다(옛 글자 가드는 그대로)', () => {
  const perday = read('supabase/event_autumn_2026_perday.sql');
  const testSql = read('supabase/event_autumn_2026_test.sql');
  const record = read('supabase/event_stamp_2026.sql');
  const NEW_SUB = '일곱 주 가운데 다섯 주, 말씀과 함께 걸어요';   // 2026-10-04 7주 가운데 5주(설계 §10)
  const m = /set subtitle = '([^']*)'/.exec(perday);
  assert.ok(m, 'perday.sql 에서 부제 update 를 못 찾았다');
  assert.equal(m[1], NEW_SUB);
  assert.ok(!/\d/.test(m[1]), '부제에 숫자를 박았다 — 3↔5 목록에 걸린다: ' + m[1]);
  // 가드 — 옛 글자 셋 중 하나일 때만(어드민에서 고친 값은 안 건드린다 · 2026-10-04 7주로 바꾸며 「여섯 주 가운데 세 주, …」가 옛 글자에 들어갔다)
  assert.ok(/and subtitle in \('여섯 주 가운데 세 주, 말씀과 함께 걸어요',\s*'여섯 주 가운데 세 주를 채우시면 선물 대상이 돼요',\s*'여섯 주 가운데 세 주를 채우시면 신청이 열려요'\)/.test(perday),
    'perday.sql 부제 가드가 옛 글자 세 가지가 아니다');
  // 시험 회차 안내 — 진짜 회차와 같은 결
  assert.ok(testSql.includes("'여섯 주 가운데 한 주를 채워 참여하신 분께는 모두 소정의 선물을 드려요 — 따로 신청하지 않으셔도 돼요.'"),
    '시험 회차 안내가 새 문장이 아니다');
  // 값(따옴표 안)에 「선물 대상」이 남지 않았다 — 가드의 옛 글자(where 절)만 빼고
  const values = (src) => (src.replace(/--.*$/gm, '').replace(/and subtitle in \([^)]*\)/g, '').match(/'[^']*'/g) || []);
  for (const [where, src] of [['perday.sql', perday], ['test.sql', testSql], ['event_stamp_2026.sql(기록)', record]]) {
    for (const v of values(src)) assert.ok(!v.includes('선물 대상'), where + ' 의 값에 「선물 대상」이 남았다: ' + v);
  }
  assert.ok(record.includes("'" + NEW_SUB + "'"), 'event_stamp_2026.sql 기록의 부제가 새 값이 아니다');
});
