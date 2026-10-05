# 🎓 교육 — 강좌 자세히 화면 다시 짜기 · 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 성도님 앱 강좌 자세히 화면(`renderEduCourse`)을 A안 「한눈에 카드」 + 「자리·신청」 칸 상태 열두 가지 + 신청 전 확인 창으로 바꾼다.

**Architecture:** 무엇을 보여 줄지는 `js/edu.js` 의 **순수 함수 구역**(표식 `// ── 교육 순수 함수 (여기부터/여기까지) ──`)에 둔 함수 넷이 정하고, `renderEduCourse` 는 그 결과를 HTML 로 옮기기만 한다. 서버·SQL·목록·내 강좌 카드는 손대지 않는다.

**Tech Stack:** Vanilla JS(ES5 꼴 — `var`·`function`), `style.css`, `node:test`(`tests/edu-front.test.cjs` — preflight 가 돌린다).

**설계:** `docs/superpowers/specs/2026-10-05-edu-course-detail-redesign-design.md` (이하 「설계」)

## Global Constraints

- 작업 공간: `C:\Projects\v2-wt\edu-detail` (가지 `edu-detail`, `origin/main` 에서 뗌). 공유 체크아웃(`C:\Projects\bible-memorize-church-app-v2`)은 쓰지 않는다.
- 화면은 서버가 준 값을 **골라 보여 주기만** 한다 — 정원·대기·취소 마감을 다시 정하지 않는다(남은 자리 = `capacity - confirmed` 뺄셈만).
- 성도님 화면에 **「반려」라는 말을 쓰지 않는다**(⑫ 「이번 신청은 확정되지 않았어요」).
- 요일 꼴은 기존 `eduMdw` 그대로 `(일)`.
- 화면에 넣는 모든 글자는 `eduEsc` 를 거친다. `appModal` 의 `msg` 는 HTML 그대로 들어간다.
- 새 색을 만들지 않는다: 연한 남색 `#eef1f8`(=`.summary-help`) · 어두울 때 `#232c3f`/`#cdd9f2`/`#3a4a68`(=`.med-song-cta`) · 어두울 때 초록 `#17311f`/`#8fd6ab`/`#2f5a42`(=`.event-cta.done`) · 밝을 때 초록은 `var(--green)` 과 그 투명값.
- 커밋은 경로를 못 박는다(`git add <파일>` · `add -A` 금지). 커밋 끝 줄 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- 교육 화면 글씨는 `html[data-fs]`(글씨 크게) 설정을 따르지 않는다(지금도 그렇다 — 이번 범위 밖). 설계 §6 의 「아주 큼」 줄은 해당 없음.

## 파일

| 파일 | 하는 일 |
|---|---|
| `js/edu.js` | 순수 함수 넷 더함(과제 1) · `renderEduCourse` 다시 씀 · `eduPeriodLine`·`eduApplyMessage` 지움(과제 2) |
| `tests/edu-front.test.cjs` | 새 함수 시험(과제 1) · 지운 함수 시험 뺌(과제 2) |
| `style.css` | `.edu-*` 구역에 새 칸 · `.edu-info`·`.edu-mine` 지움(과제 3) |
| (스크래치) `…/scratchpad/edu-harness/` | 눈 확인용 틀 — 커밋 안 함(과제 4) |

---

### Task 1: 순수 함수 넷 — 무엇을 보여 줄지

**Files:**
- Modify: `js/edu.js` (순수 함수 구역 안, `eduPeriodLine` 바로 아래 · `// ── 교육 순수 함수 (여기까지) ──` 위)
- Test: `tests/edu-front.test.cjs` (맨 끝에 덧붙임)

**Interfaces:**
- Consumes: 같은 구역의 `eduMdw(d)`·`eduYmdw(d)`·`eduRangeEnd(a, b)`(이미 있음).
- Produces:
  - `eduWhenLine(c)` → `string` — `c.firstDate`·`c.lastDate`·`c.sessionsCount` 를 씀.
  - `eduPhaseChip(phase)` → `string` — `'모집 중'|'곧 열려요'|'모집 끝'|'진행 중'|''`.
  - `eduSeatView(c, gateOpen)` → `{ off: boolean, head: string, sub: string, how: string, btn: null|'신청하기'|'대기 신청하기', ask: null|{ title: string, line: string, ok: string } }`
  - `eduMineView(m)` → `null | { tone: 'ok'|'on'|'soft', head: string, lines: string[], cancelLine: string, cancelBtn: null|'신청 취소'|'대기 취소', cancelAsk: string }`

- [ ] **Step 1: 시험을 먼저 쓴다** — `tests/edu-front.test.cjs` 끝에 붙인다.

```js
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
```

- [ ] **Step 2: 실패를 본다**

Run: `cd /c/Projects/v2-wt/edu-detail && node --test tests/edu-front.test.cjs`
Expected: 새 시험 일곱이 `ctx.eduWhenLine is not a function` 꼴로 FAIL, 옛 시험은 PASS.

- [ ] **Step 3: 함수를 쓴다** — `js/edu.js` 의 `eduPeriodLine` 함수 바로 아래(`function eduPhaseLabel` 위)에 넣는다.

```js
function eduWhenLine(c) {   // 📅 언제 — 서버가 고른 firstDate·lastDate(교육 기간이 있으면 그것 · 뒤집힌 기간은 끝이 비어 온다) + 회차 수. 화면은 다시 고르지 않는다
  if (!c) return '';
  var n = c.sessionsCount ? c.sessionsCount + '회' : '', a = eduYmdw(c.firstDate);
  if (!a) return n;
  var b = c.lastDate && c.lastDate !== c.firstDate ? eduRangeEnd(c.firstDate, c.lastDate) : '';
  return a + (b ? ' ~ ' + b : '') + (n ? ' · ' + n : '');
}
function eduPhaseChip(phase) {   // 자세히 화면 머리 칩 — 숫자는 싣지 않는다(정원은 「자리·신청」 칸 한 곳에만)
  return { open: '모집 중', upcoming: '곧 열려요', closed: '모집 끝', running: '진행 중' }[phase] || '';
}
// 「자리·신청」 칸 — 신청 전(설계 §4 ①~⑦ · 문 닫힘). 서버가 준 값을 고르기만 한다(남은 자리는 뺄셈뿐).
function eduSeatView(c, gateOpen) {
  var off = function (head, sub) { return { off: true, head: head, sub: sub || '', how: '', btn: null, ask: null }; };
  var TALK = '함께하고 싶으시면 담당자에게 말씀해 주세요';
  if (c.phase === 'upcoming') return off(eduMdw(c.applyFrom) ? eduMdw(c.applyFrom) + '부터 신청할 수 있어요' : '곧 신청을 받아요', '그때 다시 열어 주세요');
  if (c.phase !== 'open') return off('신청을 마감했어요', TALK);
  if (gateOpen === false) return off('아직 신청을 받지 않아요', '');
  var until = eduMdw(c.applyTo) ? eduMdw(c.applyTo) + '까지 신청' : '';
  var join = function (a) { return a.filter(Boolean).join(' · '); };
  var NOW = '누르시면 바로 확정돼요. 첫 시간 전날까지 앱에서 취소할 수 있어요.';
  var on = function (head, sub, how, btn, ask) { return { off: false, head: head, sub: sub, how: how, btn: btn, ask: ask }; };
  var askNow = { title: '🎓 신청할까요?', line: '선착순이라 누르시면 바로 확정돼요.', ok: '신청하기' };
  if (c.mode === 'approve') {   // edu_apply 는 approve 면 정원과 상관없이 applied — 「남은 자리」는 확정된 분만 세어 많아 보이므로 정원만
    return on(c.capacity == null ? '인원 제한 없이 받아요' : '정원 ' + c.capacity + '명', join([until, '담당자 확정']),
      '신청하시면 담당자가 확인한 뒤 확정해요.', '신청하기', { title: '🎓 신청할까요?', line: '담당자가 확인한 뒤 확정해요.', ok: '신청하기' });
  }
  if (c.capacity == null) return on('인원 제한 없이 받아요', until, NOW, '신청하기', askNow);
  var left = c.capacity - (c.confirmed || 0);
  if (left > 0) return on(left + '자리 남았어요', join([until, '선착순']), NOW, '신청하기', askNow);
  if (c.waitlist) {
    return on('정원이 찼어요', join([c.waitlisted ? '지금 대기 ' + c.waitlisted + '분' : '', until]),
      '대기로 신청하시면 자리가 날 때 순서대로 확정돼요.', '대기 신청하기', { title: '🎓 대기로 신청할까요?', line: '자리가 나면 순서대로 확정돼요.', ok: '대기 신청하기' });
  }
  return off('정원이 찼어요', TALK);   // ⑤ — 눌러도 「정원이 찼어요」만 나올 단추는 두지 않는다
}
// 「자리·신청」 칸 — 신청 뒤(설계 §4 ⑧~⑫). 장소 줄은 그리는 쪽이 붙인다(강좌 값).
function eduMineView(m) {
  if (!m) return null;
  if (m.status === 'declined') {   // 성도님 화면에 「반려」를 쓰지 않는다(친구 2026-10-05) — 「반려 유지」는 서버가 지킨다
    return { tone: 'soft', head: '이번 신청은 확정되지 않았어요', lines: ['궁금하시면 담당자에게 말씀해 주세요.'], cancelLine: '', cancelBtn: null, cancelAsk: '' };
  }
  var V = { confirmed: ['ok', '✅ 확정됐어요', []],
    applied: ['on', '📝 신청했어요', ['담당자가 확인하고 있어요. 확정되면 「내 강좌」에 「확정」으로 바뀌어요.']],
    waitlisted: ['on', '⏳ 대기 ' + (m.waitNo || 1) + '번이에요', ['자리가 나면 순서대로 확정돼요.']] }[m.status];
  if (!V) return null;
  var lines = V[2].slice(), ns = m.nextSession;
  if (m.status === 'confirmed' && ns && eduMdw(ns.date)) lines.push((ns.no === 1 ? '첫 시간' : '다음 시간') + ' · ' + eduMdw(ns.date) + (ns.start ? ' ' + ns.start : ''));
  var wait = m.status === 'waitlisted';
  return { tone: V[0], head: V[1], lines: lines,
    cancelLine: m.canCancel ? (eduMdw(m.cancelUntil) ? eduMdw(m.cancelUntil) + '까지' : '첫 시간 전날까지') + ' 앱에서 취소할 수 있어요.' : '시작한 뒤에는 취소를 담당자에게 말씀해 주세요.',
    cancelBtn: m.canCancel ? (wait ? '대기 취소' : '신청 취소') : null,
    cancelAsk: wait ? '대기를 취소할까요?' : '신청을 취소할까요?' };
}
```

- [ ] **Step 4: 통과를 본다**

Run: `cd /c/Projects/v2-wt/edu-detail && node --test tests/edu-front.test.cjs`
Expected: 모두 PASS(옛 시험 + 새 시험 일곱).

- [ ] **Step 5: 커밋**

```bash
cd /c/Projects/v2-wt/edu-detail && git add js/edu.js tests/edu-front.test.cjs && git commit -m "feat(교육 자세히): 순수 함수 넷 — 언제 줄·단계 칩·자리·신청 칸(신청 전 ①~⑦)·내 신청(⑧~⑫ · 「반려」 말 안 씀)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- js/edu.js tests/edu-front.test.cjs
```

---

### Task 2: 자세히 화면 다시 그리기

**Files:**
- Modify: `js/edu.js` — `renderEduCourse` 통째(지금 `function renderEduCourse(id) {` 부터 파일 끝 `}` 까지) · 순수 구역의 `eduPeriodLine`·`eduApplyMessage` 지움
- Modify: `tests/edu-front.test.cjs` — `test('eduApplyMessage …')`·`test('eduPeriodLine …')` 두 덩이 지움

**Interfaces:**
- Consumes: 과제 1 의 `eduWhenLine`·`eduPhaseChip`·`eduSeatView`·`eduMineView` · app.js 의 `loadUser()`·`userLines(u)`(`{ l1: 소속, l2: '이름 성도님' }`)·`appConfirm(msg, opts)`·`appAlert(msg)`·`homeFabLabel`·`renderSummary`·`renderEntryScreen` · `api.eduCourse/eduApply/eduCancel`(⚠️ 응답에 `error` 가 있으면 throw — 코드는 `err.message`).
- Produces: `renderEduCourse(id, opt)` — `opt = { focus?: boolean, note?: string }`. 다른 곳(`eduDrawList`)은 지금처럼 `renderEduCourse(id)`. DOM id: `edu-act`(자리·신청 칸 전체) · `edu-apply` · `edu-cancel` · `edu-msg` · `edu-sess` · `edu-more` · `edu-back` · `edu-home`.

- [ ] **Step 1: 쓰지 않게 될 함수와 그 시험을 지운다**

`js/edu.js` 순수 구역에서 `function eduPeriodLine(c) { … }`(3줄)와 `function eduApplyMessage(r) { … }`(7줄)를 지운다. `eduYmdw`·`eduRangeEnd` 는 `eduWhenLine` 이 쓰므로 남긴다.
`tests/edu-front.test.cjs` 에서 `test('eduApplyMessage — 결과마다 한 줄', …)` 덩이와 `test('eduPeriodLine — 교육 기간 한 줄(시작일이 없으면 빈 글)', …)` 덩이를 지운다.

Run: `cd /c/Projects/v2-wt/edu-detail && grep -rn "eduPeriodLine\|eduApplyMessage" js app.js tests`
Expected: `js/edu.js` 의 `renderEduCourse` 안 `eduPeriodLine` 한 곳·`eduApplyMessage` 한 곳만(Step 2 에서 사라진다).

- [ ] **Step 2: `renderEduCourse` 를 통째로 바꾼다** — `function renderEduCourse(id) {` 부터 파일 끝까지를 아래로.

```js
// 강좌 자세히(설계 docs/superpowers/specs/2026-10-05-edu-course-detail-redesign-design.md — A안 한눈에 카드)
//   opt.focus: 다시 그린 뒤 「자리·신청」 칸을 화면 가운데로(신청·취소 뒤 — 알림 창 대신 결과를 그 자리에서 보여 준다)
//   opt.note: 그 칸 위 회색 한 줄(「취소했어요.」)
function renderEduCourse(id, opt) {
  opt = opt || {};
  var u = loadUser(); if (!u) { renderEntryScreen(); return; }
  var el = document.getElementById('app');
  el.innerHTML = '<div class="edu-wrap"><div class="ev-loading">불러오는 중…</div></div>' +
    '<button class="home-fab" id="edu-home" aria-label="첫 화면으로">' + homeFabLabel(u, true) + '</button>';
  window.scrollTo(0, 0);
  document.getElementById('edu-home').addEventListener('click', function () { renderSummary(); });
  var my = ++eduState.screen;
  api.eduCourse(id, u.user_id || '').then(function (r) {
    if (my !== eduState.screen) return;
    var w = document.querySelector('.edu-wrap'); if (!w) return;
    if (!r || !r.ok) { w.innerHTML = '<p class="edu-empty">' + eduEsc(eduErrText(r && r.error)) + '</p>'; return; }
    var c = r.course, m = r.mine, mv = eduMineView(m), sv = mv ? null : eduSeatView(c, eduState.open);
    var chip = eduPhaseChip(c.phase);
    var chips = '<div class="edu-chips"><span class="edu-chip">' + eduEsc(c.kindLabel) + '</span>' +
      (chip ? '<span class="edu-chip' + (c.phase === 'open' ? ' on' : '') + '">' + eduEsc(chip) + '</span>' : '') + '</div>';
    var gl = [['📅', '언제', eduWhenLine(c)], ['📍', '어디서', c.place], ['🙋', '대상', c.target],
      ['📚', '먼저 들으실 과정', c.prereq && c.prereq.length ? c.prereq.join(', ') : ''], ['👤', '강사', c.teacher], ['📘', '교재비', c.fee]]
      .filter(function (x) { return x[2]; })
      .map(function (x) { return '<div class="edu-gl"><span class="edu-gl-i" aria-hidden="true">' + x[0] + '</span><span class="edu-gl-k">' + x[1] + '</span><span class="edu-gl-v">' + eduEsc(x[2]) + '</span></div>'; }).join('');
    var act;
    if (mv) {
      var lines = mv.lines.concat(m.status === 'confirmed' && c.place ? [c.place] : []);
      act = '<div class="edu-state ' + mv.tone + '"><b>' + eduEsc(mv.head) + '</b>' + lines.map(function (t) { return '<span>' + eduEsc(t) + '</span>'; }).join('') + '</div>' +
        (mv.cancelLine ? '<p class="edu-how">' + eduEsc(mv.cancelLine) + '</p>' : '') +
        (mv.cancelBtn ? '<button class="edu-btn ghost" id="edu-cancel">' + eduEsc(mv.cancelBtn) + '</button>' : '');
    } else {
      act = '<div class="edu-seat' + (sv.off ? ' off' : '') + '"><b>' + eduEsc(sv.head) + '</b>' + (sv.sub ? '<span>' + eduEsc(sv.sub) + '</span>' : '') + '</div>' +
        (sv.how ? '<p class="edu-how">' + eduEsc(sv.how) + '</p>' : '') +
        (sv.btn ? '<button class="edu-btn" id="edu-apply">' + eduEsc(sv.btn) + '</button>' : '');
    }
    act = '<div class="edu-act" id="edu-act">' + (opt.note ? '<p class="edu-note">' + eduEsc(opt.note) + '</p>' : '') + act +
      '<p class="edu-msg" id="edu-msg" role="status"></p></div>';
    var ss = c.sessions || [], shown = ss.length <= 4 ? ss.length : 2;   // 4회까지는 다 · 5회부터는 2회 + 「더 보기」
    var sessLi = function (s) {
      return '<li>' + s.no + ' · ' + eduEsc(eduMdw(s.date)) + (s.start ? ' ' + eduEsc(s.start) : '') + (s.topic ? ' — ' + eduEsc(s.topic) : '') +
        (s.place && s.place !== c.place ? ' · ' + eduEsc(s.place) : '') + '</li>'; };
    var sess = ss.length ? '<h3 class="edu-h">일정 ' + ss.length + '회</h3><ul class="edu-sess" id="edu-sess">' + ss.slice(0, shown).map(sessLi).join('') + '</ul>' +
      (ss.length > shown ? '<button class="edu-more" id="edu-more">＋ ' + (ss.length - shown) + '회 더 보기</button>' : '') : '';
    var rule = '출석 ' + c.attendPct + '% 이상' + (c.checkLabel ? ' + ' + c.checkLabel + ' 확인' : '');
    w.innerHTML = '<button class="edu-back" id="edu-back">← 교육</button>' + chips +
      '<h2 class="edu-title">' + eduEsc(c.title) + '</h2>' + (c.term ? '<div class="edu-sub">' + eduEsc(c.term) + '</div>' : '') +
      (c.description ? '<p class="edu-desc">' + eduEsc(c.description) + '</p>' : '') +
      (gl ? '<div class="edu-glance">' + gl + '</div>' : '') + act + sess +
      '<h3 class="edu-h">수료 기준</h3><p class="edu-desc">' + eduEsc(rule) + '</p>';
    document.getElementById('edu-back').addEventListener('click', function () { renderEduList(eduState.tab); });
    var more = document.getElementById('edu-more');
    if (more) more.addEventListener('click', function () { document.getElementById('edu-sess').innerHTML = ss.map(sessLi).join(''); more.remove(); });
    if (opt.focus) { var box = document.getElementById('edu-act'); if (box && box.scrollIntoView) box.scrollIntoView({ block: 'center' }); }
    // ⚠️ api(supaCall)는 응답에 error 가 있으면 throw 한다 — 오류 말은 .catch 의 err.message(서버 오류 코드)로 고른다.
    var say = function (t) { var x = document.getElementById('edu-msg'); if (x) x.textContent = t; };
    var ap = document.getElementById('edu-apply');
    if (ap) ap.addEventListener('click', function () {
      // 확인 창 한 번(친구 2026-10-05) — 누구 이름으로 들어가는지 · 누르면 어떻게 되는지. appModal 의 msg 는 HTML 그대로라 모두 eduEsc.
      var l = userLines(u);
      var msg = '<b>' + eduEsc(c.title) + '</b><div class="edu-who">' + eduEsc(l.l2) + (l.l1 ? ' · ' + eduEsc(l.l1) : '') + '</div>' + eduEsc(sv.ask.line);
      appConfirm(msg, { title: sv.ask.title, okText: sv.ask.ok, cancelText: '돌아가기' }).then(function (yes) {
        if (!yes) return;
        ap.disabled = true;
        // 서버가 거절한 것(자리·기간·문)은 알리고 지금 상태로 다시 그린다 — 같은 단추를 또 누르지 않게. 통신 실패는 단추를 다시 켠다.
        var refused = function (code) {
          if (code === 'not-open') eduState.open = false;
          if (code === 'full' || code === 'closed-period' || code === 'not-yet' || code === 'not-open') { appAlert(eduErrText(code)); renderEduCourse(id, { focus: true }); return; }
          say(eduErrText(code)); ap.disabled = false;
        };
        api.eduApply(id, u.user_id || '').then(function (x) {
          if (!x || x.ok === false) { refused(x && x.error); return; }   // 지금은 supaCall 이 throw 하지만, 풀어도 성공처럼 안 보이게
          renderEduCourse(id, { focus: true });   // 알림 창 없이 — 칸이 ⑧~⑩ 으로 바뀐 것을 그 자리에서 보여 준다
        }).catch(function (err) { refused(err && err.message); });
      });
    });
    var cn = document.getElementById('edu-cancel');
    if (cn) cn.addEventListener('click', function () {
      appConfirm(eduEsc(mv.cancelAsk), { okText: mv.cancelBtn, cancelText: '돌아가기', danger: true }).then(function (yes) {
        if (!yes) return;
        cn.disabled = true;
        // 담당자가 먼저 처리했거나(not-active) 그새 시작했으면(too-late) 알리고 지금 상태로 다시 그린다
        var failed = function (code) {
          if (code === 'not-active' || code === 'too-late') { appAlert(eduErrText(code)); renderEduCourse(id, { focus: true }); return; }
          say(eduErrText(code)); cn.disabled = false;
        };
        return api.eduCancel(m.id, u.user_id || '').then(function (x) {
          if (!x || x.ok === false) { failed(x && x.error); return; }
          renderEduCourse(id, { focus: true, note: '취소했어요.' });
        }).catch(function (err) { failed(err && err.message); });
      });
    });
  }).catch(function () {
    if (my !== eduState.screen) return;
    var w = document.querySelector('.edu-wrap'); if (w) w.innerHTML = '<p class="edu-empty">' + eduErrText('') + '</p>';
  });
}
```

- [ ] **Step 3: 시험·문법**

Run: `cd /c/Projects/v2-wt/edu-detail && node --check js/edu.js && node --test tests/edu-front.test.cjs && grep -rn "eduPeriodLine\|eduApplyMessage" js app.js tests; echo "grep-exit=$?"`
Expected: 시험 모두 PASS · grep 결과 없음(`grep-exit=1`).

- [ ] **Step 4: 커밋**

```bash
cd /c/Projects/v2-wt/edu-detail && git add js/edu.js tests/edu-front.test.cjs && git commit -m "feat(교육 자세히): A안 — 칩·한눈에 카드·자리·신청 칸·확인 창(이름·소속)·신청/취소 뒤 알림 창 대신 그 칸으로 · 일정 5회부터 접기 · eduPeriodLine·eduApplyMessage 지움

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- js/edu.js tests/edu-front.test.cjs
```

---

### Task 3: CSS

**Files:**
- Modify: `style.css` — `.edu-*` 구역(지금 5901~5932줄 · `.edu-wrap` 부터 keep-all 줄까지)

**Interfaces:**
- Consumes: 과제 2 의 클래스 — `.edu-chips` `.edu-chip(.on)` `.edu-glance` `.edu-gl` `.edu-gl-i` `.edu-gl-k` `.edu-gl-v` `.edu-act` `.edu-seat(.off)` `.edu-state(.ok|.on|.soft)` `.edu-how` `.edu-note` `.edu-more` `.edu-who`(확인 창 `.am-msg` 안).
- Produces: 없음.

- [ ] **Step 1: 안 쓰게 된 규칙을 지운다**

지운다: `.edu-info { … }` 줄 · `.edu-mine { … }` 줄 · `.edu-mine b { … }` 줄.
고친다(선택자에서 그 둘만 뺀다):
- `.dark .edu-title, .dark .edu-h, .dark .edu-card b, .dark .edu-mine b, .dark .edu-back { color: #8fb3e6; }` → `.dark .edu-title, .dark .edu-h, .dark .edu-card b, .dark .edu-back { color: #8fb3e6; }`
- `.dark .edu-card, .dark .edu-mine { … }` → `.dark .edu-card { … }`
- `.dark .edu-desc, .dark .edu-info, .dark .edu-sess { … }` → `.dark .edu-desc, .dark .edu-sess { … }`
- keep-all 줄 → `.edu-title, .edu-sub, .edu-desc, .edu-sess, .edu-card b, .edu-card span, .edu-gl-v, .edu-seat, .edu-state, .edu-how, .edu-note, .am-msg .edu-who { word-break: keep-all; overflow-wrap: anywhere; }`

Run: `cd /c/Projects/v2-wt/edu-detail && grep -n "edu-info\|edu-mine" style.css js/*.js app.js; echo "grep-exit=$?"`
Expected: 결과 없음(`grep-exit=1`).

- [ ] **Step 2: 새 칸을 keep-all 줄 바로 위에 더한다**

```css
/* 교육 자세히(2026-10-05 다시 짬 · 설계 docs/superpowers/specs/2026-10-05-edu-course-detail-redesign-design.md)
   ⚠️ 새 색을 만들지 않는다 — 연한 남색은 .summary-help, 어두운 남색·초록은 .med-song-cta·.event-cta.done 과 같은 값 */
.edu-chips { display: flex; gap: 6px; flex-wrap: wrap; margin: 2px 0 6px; }
.edu-chip { font-size: 13px; font-weight: 700; padding: 2px 10px; border-radius: 999px; background: var(--light); color: var(--navy); }
.edu-chip.on { background: rgba(44, 95, 45, .12); color: var(--green); }
.edu-glance { background: var(--white); border: 1px solid var(--border); border-radius: 14px; padding: 2px 14px; margin: 12px 0; }
.edu-gl { display: flex; gap: 8px; align-items: baseline; padding: 8px 0; font-size: 15px; line-height: 1.5; }
.edu-gl + .edu-gl { border-top: 1px dashed var(--border); }
.edu-gl-i { flex: 0 0 auto; }
.edu-gl-k { flex: 0 0 auto; min-width: 3.4em; color: var(--gray); font-size: 14px; }
.edu-gl-v { flex: 1; min-width: 0; font-weight: 600; }
.edu-act { margin: 14px 0 4px; }
.edu-seat, .edu-state { display: flex; flex-direction: column; gap: 2px; padding: 11px 14px; border-radius: 14px; }
.edu-seat { background: #eef1f8; border: 1px solid var(--border); }
.edu-seat.off { background: var(--light); }
.edu-seat b, .edu-state b { font-size: 17px; color: var(--navy); }
.edu-seat.off b, .edu-state.soft b { color: var(--gray); }
.edu-seat span, .edu-state span { font-size: 14px; line-height: 1.55; }
.edu-state { background: var(--white); border: 1.5px solid var(--navy); }
.edu-state.ok { border-color: var(--green); }
.edu-state.ok b { color: var(--green); }
.edu-state.soft { background: var(--light); border-color: var(--border); }
.edu-how { font-size: 14px; line-height: 1.6; margin: 8px 0 0; }
.edu-act .edu-btn { margin-top: 10px; font-size: 17px; }
.edu-act .edu-btn.ghost { font-size: 15px; padding: 10px; }
.edu-note { font-size: 15px; color: var(--gray); margin: 0 0 8px; }
.edu-more { border: 0; background: transparent; color: var(--navy); font-weight: 700; font-size: 15px; padding: 6px 0; cursor: pointer; font-family: inherit; }
.am-msg .edu-who { margin: 8px 0; padding: 8px 10px; border-radius: 10px; background: var(--light); font-weight: 700; }
.dark .edu-chip { background: #232a3a; color: #cdd9f2; }
.dark .edu-chip.on { background: #17311f; color: #8fd6ab; }
.dark .edu-glance { background: #151d2b; border-color: #33507d; }
.dark .edu-gl + .edu-gl { border-top-color: #33507d; }
.dark .edu-gl-k, .dark .edu-note { color: #b9c2d0; }
.dark .edu-gl-v, .dark .edu-seat span, .dark .edu-state span, .dark .edu-how { color: #dbe2ee; }
.dark .edu-seat { background: #232c3f; border-color: #3a4a68; }
.dark .edu-seat b, .dark .edu-state b { color: #cdd9f2; }
.dark .edu-seat.off, .dark .edu-state.soft { background: #1b2233; border-color: #33405a; }
.dark .edu-seat.off b, .dark .edu-state.soft b { color: #b9c2d0; }
.dark .edu-state { background: #151d2b; border-color: #8fb3e6; }
.dark .edu-state.ok { border-color: #2f5a42; background: #17311f; }
.dark .edu-state.ok b { color: #8fd6ab; }
.dark .edu-more { color: #8fb3e6; }
.dark .am-msg .edu-who { background: #232c3f; color: #dbe2ee; }
```

- [ ] **Step 3: 확인**

Run: `cd /c/Projects/v2-wt/edu-detail && python tools/preflight.py`
Expected: 마지막 줄에 통과(실패 0) — 문법·캐시태그·순수 함수 시험 포함.

- [ ] **Step 4: 커밋**

```bash
cd /c/Projects/v2-wt/edu-detail && git add style.css && git commit -m "style(교육 자세히): 칩·한눈에 카드·자리·신청 칸·내 신청 칸·확인 창 이름 상자 · 어두운 모드 짝 · .edu-info/.edu-mine 지움(새 색 없음)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- style.css
```

---

### Task 4: 눈으로 확인 (커밋 안 함)

서버·DB 를 건드리지 않고 상태 열두 가지를 다 보려고, 진짜 `style.css`·`js/edu.js` 를 그대로 불러 가짜 `api` 로 그리는 틀을 만든다. 틀은 작업 공간의 `tmp/edu-harness/`(`.gitignore` 의 `/tmp/` — 커밋되지 않는다), 찍는 것은 `tools/screen-sweep.py` 와 같은 playwright(`channel="chrome"`).

**Files:**
- Create: `tmp/edu-harness/index.html` (작업 공간 안 · 무시됨)
- Create: `<스크래치>/edu-shots.py` (스크래치 = `C:/Users/sewki/AppData/Local/Temp/claude/c--Projects-bible-memorize-church-app-v2/d47e83b4-d3e7-4ec9-adae-5b85d4756df2/scratchpad`)

- [ ] **Step 1: 틀** — `tmp/edu-harness/index.html`

```html
<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/style.css"></head>
<body><div id="app"></div>
<script>
// ?s=1..12(설계 §4 번호) · &dark=1
var Q = new URLSearchParams(location.search), S = Number(Q.get('s') || 1);
if (Q.get('dark') === '1') document.body.classList.add('dark');
var base = { id: 'c1', title: '구원론 3차', kind: 'regular', kindLabel: '정규 과정', term: '구원론 가을학기', teacher: '담당 목사님', place: '5층 세미나실',
  fee: '없음', target: '권사', capacity: 24, mode: 'auto', waitlist: false, applyFrom: '2026-10-05', applyTo: '2026-10-18', status: 'open', phase: 'open',
  sessionsCount: 8, firstDate: '2026-10-25', lastDate: '2026-12-13', confirmed: 0, waitlisted: 0, description: '주일 오후예배 후 1시간 30분',
  prereq: [], attendPct: 80, checkLabel: null,
  sessions: [1, 2, 3, 4, 5, 6, 7, 8].map(function (n) { var d = new Date(Date.UTC(2026, 9, 25 + (n - 1) * 7)); return { no: n, date: d.toISOString().slice(0, 10), start: '14:30', end: '16:00', topic: n === 1 ? '구원이란 무엇인가' : '', place: '' }; }) };
var mine = function (st, extra) { return Object.assign({ id: 9, courseId: 'c1', status: st, statusLabel: st, waitNo: st === 'waitlisted' ? 2 : null, canCancel: true, cancelUntil: '2026-10-24', nextSession: { no: 1, date: '2026-10-25', start: '14:30' } }, extra || {}); };
var CASES = {
  1: [{}, null], 2: [{ mode: 'approve' }, null], 3: [{ capacity: null }, null], 4: [{ confirmed: 24, waitlist: true, waitlisted: 2 }, null],
  5: [{ confirmed: 24 }, null], 6: [{ phase: 'upcoming', applyFrom: '2026-10-11' }, null], 7: [{ phase: 'closed' }, null],
  8: [{}, mine('confirmed')], 9: [{ mode: 'approve' }, mine('applied')], 10: [{ confirmed: 24, waitlist: true, waitlisted: 2 }, mine('waitlisted')],
  11: [{ phase: 'running' }, mine('confirmed', { canCancel: false, nextSession: { no: 3, date: '2026-11-08', start: '14:30' } })], 12: [{}, mine('declined')] };
var cs = CASES[S] || CASES[1];
// app.js 대신 필요한 것만
function loadUser() { return { user_id: 'u', type: '교구', gu: '3교구', mok: '2', name: '김은혜' }; }
function userLines(u) { return { l1: u.gu + ' ' + u.mok + '목장', l2: u.name + ' 성도님' }; }
function homeFabLabel() { return '<span class="hf-act">🏠 첫 화면으로</span><span class="hf-sub">3교구-2 김은혜 성도님</span>'; }
function renderSummary() {} function renderEntryScreen() {} function renderEduList() {} function logFeature() {}
// app.js 의 appModal 을 옮겨 둔 것(확인 창 모양을 진짜로 보려고 · 2241~2269줄과 같은 꼴)
var AM_ICON_RE = /^(\p{Extended_Pictographic}(?:\u200d\p{Extended_Pictographic}|\ufe0f)*)\s*/u;
function appModal(o) {
  return new Promise(function (resolve) {
    var title = o.title || '', ico = '', t = title, m = AM_ICON_RE.exec(title);
    if (m) { ico = m[1]; t = title.slice(m[0].length); }
    var wrap = document.createElement('div'); wrap.id = 'app-modal'; wrap.className = 'am-overlay show';
    wrap.innerHTML = '<div class="am-card" role="dialog">' + (ico ? '<div class="am-ico">' + ico + '</div>' : '') + (t ? '<div class="am-title">' + t + '</div>' : '') +
      '<div class="am-msg">' + o.msg + '</div><div class="am-btns">' + (o.cancelText ? '<button class="am-btn am-cancel">' + o.cancelText + '</button>' : '') +
      '<button class="am-btn am-ok' + (o.danger ? ' danger' : '') + '">' + (o.okText || '확인') + '</button></div></div>';
    document.body.appendChild(wrap);
  });
}
function appAlert(msg) { return appModal({ msg: msg }); }
function appConfirm(msg, opts) { return appModal(Object.assign({ msg: msg, cancelText: '취소' }, opts || {})); }
var api = { eduCourse: function () { return Promise.resolve({ ok: true, course: Object.assign({}, base, cs[0]), mine: cs[1] }); } };
</script>
<script src="/js/edu.js"></script>
<script>renderEduCourse('c1');</script>
</body></html>
```

- [ ] **Step 2: 찍는 글** — `<스크래치>/edu-shots.py`

```python
# 교육 자세히 화면 상태 열두 가지 × 밝게/어둡게 + 확인 창 둘 — 틀(tmp/edu-harness)을 찍는다
import sys
from playwright.sync_api import sync_playwright
OUT = sys.argv[1]
URL = "http://localhost:8765/tmp/edu-harness/index.html"
with sync_playwright() as pw:
    b = pw.chromium.launch(channel="chrome", headless=True)
    p = b.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    errs = []
    p.on("pageerror", lambda e: errs.append(str(e)))
    for s in range(1, 13):
        for d in (0, 1):
            p.goto(f"{URL}?s={s}&dark={d}")
            p.wait_for_selector("#edu-act")
            p.screenshot(path=f"{OUT}/s{s:02d}-d{d}.png", full_page=True)
    for s in (1, 4):   # 확인 창 — ① 신청 · ④ 대기 신청
        p.goto(f"{URL}?s={s}")
        p.click("#edu-apply")
        p.wait_for_selector(".am-card")
        p.screenshot(path=f"{OUT}/confirm-s{s}.png")
    p.goto(f"{URL}?s=1")   # 「더 보기」 펼침
    p.click("#edu-more")
    p.screenshot(path=f"{OUT}/more.png", full_page=True)
    b.close()
print("pageerrors:", errs)
```

- [ ] **Step 3: 띄우고 찍는다** — ⚠️ 포트 8000 은 다른 세션 것일 수 있다. 8765 로 띄우고 **내 PID 만** 끈다.

```bash
SCR=C:/Users/sewki/AppData/Local/Temp/claude/c--Projects-bible-memorize-church-app-v2/d47e83b4-d3e7-4ec9-adae-5b85d4756df2/scratchpad
mkdir -p "$SCR/edu-shots"
cd /c/Projects/v2-wt/edu-detail && python -m http.server 8765 >/dev/null 2>&1 & echo $! > "$SCR/edu-http.pid"
python "$SCR/edu-shots.py" "$SCR/edu-shots"
```
Expected: `pageerrors: []` · 사진 스물일곱 장.

- [ ] **Step 4: 사진을 Read 로 연다** — 볼 것:
  - 번호마다 설계 §4 문구 그대로 · 「반려」가 어디에도 없음(⑫)
  - ⑤⑥⑦ 에 단추 없음 · ④ 단추가 「대기 신청하기」 · ⑪ 취소 단추 없음 + 「시작한 뒤에는…」
  - ⑧ 초록 테 · 「첫 시간 · 10월 25일(일) 14:30」 · 「5층 세미나실」 · 「10월 24일(토)까지 …」
  - 한눈에 카드 다섯 줄(언제 `2026년 10월 25일(일) ~ 12월 13일(일) · 8회`) · 칩 「정규 과정」「모집 중」
  - 일정 2회 + 「＋ 6회 더 보기」 → `more.png` 에서 여덟 줄
  - 확인 창: 「🎓」 · 「신청할까요?」/「대기로 신청할까요?」 · 이름 상자 「김은혜 성도님 · 3교구 2목장」 · 「돌아가기 / 신청하기」
  - 어두울 때 글씨가 바탕에 묻히지 않음 · 단어 중간 줄바꿈 없음 · 아래 🏠 단추가 마지막 줄을 가리지 않음(full_page 끝)
  어긋나면 과제 2·3 으로 돌아가 고치고 다시 찍는다.
- [ ] **Step 5: 끈다** — `kill $(cat "$SCR/edu-http.pid")` · `rm -rf tmp/edu-harness`.

---

### Task 5: 배포

- [ ] **Step 1: 최신 main 위로** — `cd /c/Projects/v2-wt/edu-detail && git fetch -q origin && git rebase origin/main` (충돌이 `js/edu.js` 에서 나면 남의 변경을 살리고 이 계획의 함수·화면을 다시 얹는다).
- [ ] **Step 2:** `python tools/preflight.py` — 통과.
- [ ] **Step 3: bump** — `python tools/bump.py` → `git add index.html app.js sw.js` 등 bump 가 바꾼 파일만 경로로(`git status --short` 로 확인) → 커밋 `chore: bump … — 교육 자세히 화면 다시 짬(시험 참여자만 보임)`.
- [ ] **Step 4: 푸시** — `git push origin edu-detail:main`(관리자 푸시 · Actions 가 preflight 뒤 배포).
- [ ] **Step 5: 배포 확인(이번 판에만 있는 표식)**

```bash
V=$(grep -o 'js/edu.js?v=[0-9a-z]*' index.html | head -1 | cut -d= -f2)
curl -s "https://gocheok.onlybible.kr/js/edu.js?v=$V" | grep -c "자리 남았어요"
```
Expected: `1` 이상(옛 판에는 없는 문구). 0 이면 몇 분 뒤 다시.

- [ ] **Step 6: 기록** — `docs/notes/education.md` 「지금 상태」 아래에 한 줄: 자세히 화면 A안(설계 링크) · 「반려」 말 안 씀 · 확인 창 · 목록·내 강좌 카드 말 맞추기는 「나중」. 경로 커밋 후 푸시(bump 불필요 — 문서만 · 단 preflight 먼저).
