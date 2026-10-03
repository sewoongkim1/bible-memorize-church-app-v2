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

// 줄 칸은 api mhRowOut 과 같다(직분 position 은 2026-10-02 부터 오지 않는다 — 교회 어드민이 안 보낸다)
const row = (id, year, committee, team, o = {}) => ({ id, year, committee, team, role_title: '', ...o });
// 신청 칸은 api mhReqOut 과 같다 — committee_text: null(옛 한 칸 신청·다른 종류) 또는 글자(두 칸 신청 · 2026-10-02)
const req = (o) => ({ id: 1, history_id: null, kind: 'find_me', detail: '', year: null, committee_text: null, team_text: '', status: '신청', answer: '', created_at: '', ...o });

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

// 빠진 사역 「부서」「팀」 두 칸(2026-10-02 친구 요청 「네 두칸으로 해주세요」) — 교회 어드민 parseRequest 두 칸 갈래와 같은 규칙
//   committee_text 가 글자면 두 칸(둘 중 하나만 있어도 된다 · 칸마다 100자) · 글자가 아니면 옛 한 칸(team_text 꼭)
test('mhCheck 두 칸 — 부서나 팀 하나는 있어야 · 칸마다 100자 · 연도는 그대로 · 공백은 서버처럼 줄여 센다', () => {
  const c = fn('mhCheck');
  const m = (committee_text, team_text, year = '2023') => c({ kind: 'missing', year, committee_text, team_text, detail: '' });
  assert.equal(m('찬양위원회', '시온성가대'), null);
  assert.equal(m('찬양위원회', ''), null, '부서만 적어도 된다');
  assert.equal(m('', '시온성가대'), null, '팀만 적어도 된다');
  assert.equal(m(' ', '  '), 'need-team');
  assert.equal(m('', ''), 'need-team');
  assert.equal(m('가'.repeat(101), ''), 'too-long');
  assert.equal(m('', '가'.repeat(101)), 'too-long');
  assert.equal(m('가'.repeat(100), '나'.repeat(100)), null, '칸마다 100자 — 합쳐서 세지 않는다');
  assert.equal(m('가' + ' '.repeat(150) + '나', ''), null, '공백 덩어리는 한 칸으로 줄여 센다(서버 tidy)');
  assert.equal(m('찬양위원회', '시온성가대', '20'), 'bad-year');
  assert.equal(m('', '', '20'), 'bad-year', '연도를 먼저 본다(서버와 같은 차례)');
  // committee_text 가 글자가 아니면 옛 한 칸 — team_text 가 꼭 있어야 한다(옛 캐시 앱·서버 갈래와 같다)
  assert.equal(c({ kind: 'missing', year: '2023', committee_text: null, team_text: '' }), 'need-team');
  assert.equal(c({ kind: 'missing', year: '2023', committee_text: null, team_text: '찬양위원회 시온성가대' }), null);
});

test('mhMissingText·목록 머리 — 두 칸은 「부서 · 팀」(빈 칸 뺌) · 옛 한 칸(committee_text null·칸 없음)은 team_text 그대로', () => {
  const t = fn('mhMissingText');
  assert.equal(t(req({ kind: 'missing', committee_text: '찬양위원회', team_text: '시온성가대' })), '찬양위원회 · 시온성가대');
  assert.equal(t(req({ kind: 'missing', committee_text: '찬양위원회', team_text: '' })), '찬양위원회');
  assert.equal(t(req({ kind: 'missing', committee_text: '', team_text: '시온성가대' })), '시온성가대');
  assert.equal(t(req({ kind: 'missing', committee_text: null, team_text: '찬양위원회 시온성가대' })), '찬양위원회 시온성가대');
  const old = req({ kind: 'missing', team_text: '찬양위원회 시온성가대' });
  delete old.committee_text;   // 옛 api(mhReqOut 에 칸이 없던 판)
  assert.equal(t(old), '찬양위원회 시온성가대');
  const out = fn('mhRequestsHtml')([
    req({ id: 4, kind: 'missing', year: 2024, committee_text: '찬양위원회', team_text: '시온성가대' }),
    req({ id: 5, kind: 'missing', year: 2022, committee_text: '봉사위원회', team_text: '' }),
    req({ id: 3, kind: 'missing', year: 2023, committee_text: null, team_text: '교육위원회 유년부' }),
    req({ id: 2, kind: 'missing', year: 2021, committee_text: '<b>', team_text: '팀' }),
  ], []);
  assert.ok(out.includes('빠진 사역(2024) — 찬양위원회 · 시온성가대'));
  assert.ok(out.includes('빠진 사역(2022) — 봉사위원회<'), '빈 팀 칸 뒤에 「 · 」가 붙었다');
  assert.ok(out.includes('빠진 사역(2023) — 교육위원회 유년부'));
  assert.ok(out.includes('&lt;b&gt; · 팀') && !out.includes('<b> · 팀'), '부서 칸이 escape 되지 않았다');   // 「<b>4</b>건」은 머리의 굵은 글씨
});

test('정정 창 「빠진 사역」 — 연도·부서·팀 세 칸(부서 · 팀 한 칸은 없다) · 보낼 때 committee_text 와 team_text', () => {
  const html = fn('mhMissingFieldsHtml')();
  const input = (id) => {
    const m = new RegExp('<input [^>]*id="' + id + '"[^>]*>').exec(html);
    assert.ok(m, id + ' 칸이 없다');
    return m[0];
  };
  const committee = input('mh-committee'), team = input('mh-team');
  for (const [el, ph] of [[committee, '찬양위원회'], [team, '시온성가대']]) {
    assert.ok(el.includes('class="min-alert-input mh-in"'), el);
    assert.ok(el.includes('maxlength="100"'), el);
    assert.ok(el.includes('placeholder="' + ph + '"'), el);
  }
  assert.ok(html.includes('<label class="mh-l" for="mh-committee">부서</label>'));
  assert.ok(html.includes('<label class="mh-l" for="mh-team">팀</label>'));
  assert.ok(html.indexOf('id="mh-year"') < html.indexOf('id="mh-committee"') && html.indexOf('id="mh-committee"') < html.indexOf('id="mh-team"'), '칸 차례가 연도 · 부서 · 팀이 아니다');
  assert.ok(!html.includes('부서 · 팀'), '옛 한 칸 이름표가 남았다');
  // 창(mhAsk)은 이 칸들을 쓰고, 빠진 사역일 때 두 칸을 함께 보낸다
  const ask = pickFn('mhAsk');
  assert.ok(ask.includes('mhMissingFieldsHtml()'), '정정 창이 mhMissingFieldsHtml 을 쓰지 않는다');
  assert.ok(/committee_text\s*=\s*box\.querySelector\("#mh-committee"\)\.value/.test(ask), '정정 창이 부서 칸을 committee_text 로 보내지 않는다');
  assert.ok(ask.includes('box.querySelector("#mh-team").value'), '정정 창이 팀 칸을 보내지 않는다');
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

test('줄에 직분을 보이지 않는다 · 고르기에 「팀·부서가 틀려요」가 없다(2026-10-01 친구 요청)', () => {
  const out = fn('mhHistoryHtml')([row(5, 2026, '방송전산부', '방송실 운영', { position: '안수집사' })], []);
  assert.ok(out.includes('방송전산부') && out.includes('방송실 운영'));
  assert.ok(!out.includes('안수집사'), '줄에 직분이 보인다');
  const kinds = vm.runInContext('MH_LINE_KINDS.map(function (x) { return x.k; })', ctx);
  assert.deepEqual([...kinds], ['not_mine', 'other']);
  assert.equal(vm.runInContext('MH_KIND_TEXT.wrong_team', ctx), '팀·부서가 틀려요', '이미 낸 신청 표시 글은 남긴다');
});

// ── 플레이스토어 앱에서 「사역현황」 숨김(2026-10-02 · MINISTRY_HIDE_ON_PLAY) ──
// 문(ministryVisible)과 그것이 부르는 것들을 떼어 가짜 localStorage·sessionStorage·location·loadUser·window.matchMedia 위에서 돌린다.
// ⚠️ 스위치의 지금 값(true/false)을 검사에 박지 않는다 — 심사가 통과해 false 로 바꾼 날에도 이 검사는 그대로 통과해야 한다.
function pickFn(name) {
  const at = source.indexOf('function ' + name + '(');
  assert.ok(at >= 0, 'app.js 에서 ' + name + ' 을 못 찾았다 — 이 검사가 낡았다');
  let i = source.indexOf('{', at), depth = 0;
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) break;
  }
  return source.slice(at, i + 1);
}
function pickConst(re, what) {
  const m = re.exec(source);
  assert.ok(m, 'app.js 에서 ' + what + ' 을 못 찾았다 — 이 검사가 낡았다');
  return m[0];
}
// display — 이 창이 어떤 모양으로 열렸나(matchMedia('(display-mode: …)') 가짜).
//   'standalone' = 플레이스토어 앱(TWA · android-app/twa-manifest.json) · 'browser' = 크롬 보통 탭
//   'throw' = matchMedia 가 던진다 · 'none' = matchMedia 가 없다
function fakeWindow(display) {
  if (display === 'none') return {};
  return {
    matchMedia: (q) => {
      if (display === 'throw') throw new Error('matchMedia 고장');
      const m = /\(display-mode:\s*([a-z-]+)\)/.exec(q);
      return { matches: !!m && m[1] === display };
    },
  };
}
// session — 이번 실행 표식(sessionStorage play-app-session): true = 있다 · false = 없다 · 'throw' = sessionStorage 가 던진다
function doorCtx({ hide, play = false, session = false, display = 'standalone', preview = false, tester = false, period = { open: '2000-01-01', close: '2999-12-31' }, extra = [] }) {
  const store = {}, sess = {};
  if (play) store['play-store-app'] = '1';
  if (session === true) sess['play-app-session'] = '1';
  if (tester) store['ministry-tester::u1'] = '1';
  if (period) store['ministry-period'] = JSON.stringify(period);
  const bad = () => { throw new Error('sessionStorage 막힘'); };
  const c = vm.createContext({
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    sessionStorage: session === 'throw' ? { getItem: bad, setItem: bad }
      : { getItem: (k) => (k in sess ? sess[k] : null), setItem: (k, v) => { sess[k] = String(v); } },
    location: { search: preview ? '?preview=ministry' : '' },
    loadUser: () => ({ user_id: 'u1' }),
    window: fakeWindow(display),
  });
  const sw = pickConst(/const MINISTRY_HIDE_ON_PLAY = (?:true|false);/, 'MINISTRY_HIDE_ON_PLAY').replace(/true|false/, String(hide));
  vm.runInContext([
    sw,
    pickConst(/const PLAY_APP_KEY = "[^"]+";/, 'PLAY_APP_KEY'),
    pickConst(/const PLAY_SESSION_KEY = "[^"]+";/, 'PLAY_SESSION_KEY'),
    pickConst(/const MIN_PERIOD_KEY = "[^"]+";/, 'MIN_PERIOD_KEY'),
    pickConst(/const MIN_TESTER_KEY = "[^"]+";/, 'MIN_TESTER_KEY'),
    pickFn('isPlayStoreApp'), pickFn('openedByPlayApp'), pickFn('isBrowserTab'), pickFn('ministryPeriodCached'), pickFn('ministryTesterCached'),
    pickFn('ministryHiddenOnPlay'), pickFn('ministryVisible'),
    ...extra,
  ].join('\n'), c);
  return c;
}

test('플레이스토어 앱 — 스위치가 켜져 있으면 신청 기간·시험 참여자여도 문이 닫힌다', () => {
  const c = doorCtx({ hide: true, play: true });
  assert.equal(c.ministryHiddenOnPlay(), true);
  assert.equal(c.ministryVisible(), false, '신청 기간인데 플레이스토어 앱에 사역현황이 보인다');
  assert.equal(doorCtx({ hide: true, play: true, tester: true, period: null }).ministryVisible(), false, '시험 참여자에게 보인다');
});

test('플레이스토어 앱이 아니면(웹·아이폰) 스위치가 켜져 있어도 그대로 보인다', () => {
  const c = doorCtx({ hide: true, play: false });
  assert.equal(c.ministryHiddenOnPlay(), false);
  assert.equal(c.ministryVisible(), true);
  assert.equal(doorCtx({ hide: true, tester: true, period: null }).ministryVisible(), true, '웹 시험 참여자에게 안 보인다');
  assert.equal(doorCtx({ hide: true, period: null }).ministryVisible(), false, '기간 밖·시험 참여자 아님은 원래대로 닫혀야 한다');
});

test('스위치를 끄면(심사 통과한 날) 플레이스토어 앱에도 다시 보인다', () => {
  const c = doorCtx({ hide: false, play: true });
  assert.equal(c.ministryHiddenOnPlay(), false);
  assert.equal(c.ministryVisible(), true);
});

test('관리자 미리보기(?preview=ministry)는 플레이스토어 앱에서도 열린다', () => {
  assert.equal(doorCtx({ hide: true, play: true, preview: true, period: null }).ministryVisible(), true);
});

test('플레이스토어 앱(표식 + standalone)은 숨는다 — 앱 창은 크롬 탭이 아니다', () => {
  const c = doorCtx({ hide: true, play: true, display: 'standalone' });
  assert.equal(c.isBrowserTab(), false);
  assert.equal(c.ministryHiddenOnPlay(), true);
  assert.equal(c.ministryVisible(), false, '플레이스토어 앱 창에 사역현황이 보인다');
});

test('앱이 깔린 폰의 크롬 탭(표식 + browser)은 그대로 보인다 — 「웹은 그대로」', () => {
  const c = doorCtx({ hide: true, play: true, display: 'browser' });
  assert.equal(c.isBrowserTab(), true);
  assert.equal(c.ministryHiddenOnPlay(), false);
  assert.equal(c.ministryVisible(), true, '크롬 탭인데 표식 때문에 사역현황이 숨었다');
  assert.equal(doorCtx({ hide: true, play: true, display: 'browser', tester: true, period: null }).ministryVisible(), true, '크롬 탭 시험 참여자에게 안 보인다');
});

test('matchMedia 가 던지거나 없으면 크롬 탭이 아닌 것으로 본다 — 플레이스토어 앱은 숨는 쪽', () => {
  for (const display of ['throw', 'none']) {
    const c = doorCtx({ hide: true, play: true, display });
    assert.equal(c.isBrowserTab(), false, display);
    assert.equal(c.ministryHiddenOnPlay(), true, display);
    assert.equal(c.ministryVisible(), false, display + ' — 플레이스토어 앱에 사역현황이 보인다');
  }
  assert.equal(doorCtx({ hide: true, play: false, display: 'throw' }).ministryVisible(), true, '표식이 없는 웹은 matchMedia 가 고장 나도 보인다');
});

// 이번 실행 표식(sessionStorage play-app-session · 2026-10-02) — TWA 가 맞춤 탭으로 열리면(fallbackType "customtabs")
//   창 모양이 "browser" 라 기기 표식 + 창 모양만으로는 못 잡는다.
test('이번 실행 표식 + 크롬 탭 모양(맞춤 탭으로 열린 앱)은 숨는다', () => {
  const c = doorCtx({ hide: true, session: true, display: 'browser' });
  assert.equal(c.isBrowserTab(), true);
  assert.equal(c.openedByPlayApp(), true);
  assert.equal(c.ministryHiddenOnPlay(), true);
  assert.equal(c.ministryVisible(), false, '맞춤 탭으로 열린 앱에 사역현황이 보인다');
  assert.equal(doorCtx({ hide: true, play: true, session: true, display: 'browser', tester: true, period: null }).ministryVisible(), false, '맞춤 탭 시험 참여자에게 보인다');
  assert.equal(doorCtx({ hide: true, session: true, display: 'standalone' }).ministryVisible(), false, '기기 표식을 못 적은 앱 창에 보인다');
  assert.equal(doorCtx({ hide: false, session: true, display: 'browser' }).ministryVisible(), true, '스위치를 끄면 다시 보여야 한다');
});

test('이번 실행 표식이 없으면 기기 표식이 남아 있어도 크롬 탭에서는 보인다 — 「웹은 그대로」', () => {
  const c = doorCtx({ hide: true, play: true, session: false, display: 'browser' });
  assert.equal(c.openedByPlayApp(), false);
  assert.equal(c.ministryHiddenOnPlay(), false);
  assert.equal(c.ministryVisible(), true, '앱이 깔렸던 폰의 크롬 탭에서 사역현황이 숨었다');
  // sessionStorage 가 던지면 「이번 실행 표식 없음」 — 기기 표식 + 창 모양으로 본다
  assert.equal(doorCtx({ hide: true, play: true, session: 'throw', display: 'browser' }).ministryVisible(), true, 'sessionStorage 가 막힌 크롬 탭에서 숨었다');
  assert.equal(doorCtx({ hide: true, play: true, session: 'throw', display: 'standalone' }).ministryVisible(), false, 'sessionStorage 가 막힌 앱 창에 보인다');
});

// referrer 줄(app.js 최상위) — 떼어 와 가짜 document.referrer 위에서 돌린다.
function referrerRun(referrer, { localThrows = false } = {}) {
  const block = /const PLAY_APP_KEY = "[^"]+";[\s\S]*?(?=\nfunction isPlayStoreApp\()/.exec(source);
  assert.ok(block, 'app.js 에서 referrer 줄을 못 찾았다 — 이 검사가 낡았다');
  const store = {}, sess = {};
  const bad = () => { throw new Error('localStorage 막힘'); };
  vm.runInContext(block[0], vm.createContext({
    document: { referrer },
    localStorage: localThrows ? { getItem: bad, setItem: bad } : { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    sessionStorage: { getItem: (k) => (k in sess ? sess[k] : null), setItem: (k, v) => { sess[k] = String(v); } },
  }));
  return { store, sess };
}

test('referrer 줄 — android-app://<패키지> 로 열리면 기기 표식과 이번 실행 표식을 함께 남긴다 · 보통 탭은 아무것도 안 남긴다', () => {
  for (const ref of ['android-app://kr.onlybible.gocheok.memorize', 'android-app://kr.onlybible.gocheok.memorize.dev']) {
    const { store, sess } = referrerRun(ref);
    assert.equal(store['play-store-app'], '1', ref);
    assert.equal(sess['play-app-session'], '1', ref);
  }
  for (const ref of ['', 'https://gocheok.onlybible.kr/', 'https://www.google.com/', 'android-app://com.android.chrome']) {
    const { store, sess } = referrerRun(ref);
    assert.deepEqual(Object.keys(store).concat(Object.keys(sess)), [], (ref || '빈 referrer') + ' 에 표식이 생겼다');
  }
  const blocked = referrerRun('android-app://kr.onlybible.gocheok.memorize', { localThrows: true });
  assert.equal(blocked.sess['play-app-session'], '1', 'localStorage 가 막히면 이번 실행 표식도 못 남긴다');
});

test('clearPersonalData — sessionStorage 를 비워도 이번 실행 표식만은 다시 남긴다(앱에서 「내 정보 지우기」 뒤에도 숨게)', () => {
  const body = pickFn('clearPersonalData');
  const keys = [...new Set(body.match(/\b[A-Z][A-Z0-9_]*_KEY\b/g) || [])].filter((k) => k !== 'PLAY_SESSION_KEY');
  const run = (withFlag) => {
    const local = { 'play-store-app': '1' };
    const sess = { 'board-recent': '{}', 'build-fix': 'x' };
    if (withFlag) sess['play-app-session'] = '1';
    vm.runInContext([
      ...keys.map((k) => 'var ' + k + ' = "stub-' + k + '";'),
      // clearPersonalData 는 이제 이벤트 플랫폼 기기 공용 캐시 비우기를 resetEventDeviceCache()
      //   하나에 맡긴다(2026-10-03 재검토 — 중복 제거) — 그 함수의 실제 동작(localStorage·
      //   js/events.js 전역·stampCache·todayCountCache 비우기)은 이 검사의 관심사가 아니므로
      //   no-op 스텁만 둔다. 호출됐는지 자체도 이 검사가 보는 것(PLAY_SESSION_KEY 복원)과
      //   무관해 따로 확인하지 않는다.
      'function resetEventDeviceCache() {}',
      pickConst(/const PLAY_SESSION_KEY = "[^"]+";/, 'PLAY_SESSION_KEY'),
      pickFn('openedByPlayApp'),
      body,
      'clearPersonalData();',
    ].join('\n'), vm.createContext({
      localStorage: {
        get length() { return Object.keys(local).length; },
        key: (i) => Object.keys(local)[i] ?? null,
        getItem: (k) => (k in local ? local[k] : null),
        removeItem: (k) => { delete local[k]; },
      },
      sessionStorage: {
        getItem: (k) => (k in sess ? sess[k] : null),
        setItem: (k, v) => { sess[k] = String(v); },
        clear: () => { for (const k of Object.keys(sess)) delete sess[k]; },
      },
    }));
    return { local, sess };
  };
  const kept = run(true);
  assert.deepEqual(Object.keys(kept.sess), ['play-app-session'], '이번 실행 표식이 지워졌거나 다른 것이 남았다');
  assert.equal(kept.local['play-store-app'], '1', '기기 표식을 지웠다');
  assert.deepEqual(Object.keys(run(false).sess), [], '없던 이번 실행 표식이 생겼다');
});

// NEW 배지 — 하나뿐인 NEW 를 숨은 "ministry" 가 가져가면 안 된다.
//   FEAT_SINCE 는 진짜 날짜 대신 「오늘 ministry · 어제 song」으로 바꿔 넣는다(오늘 날짜와 무관하게 돌게).
function kstDate(ms) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}
function featCtx(opts) {
  pickConst(/const FEAT_SINCE = \{[\s\S]*?\n\};/, 'FEAT_SINCE');   // 이름이 바뀌면 낡았다고 알린다
  const since = 'const FEAT_SINCE = ' + JSON.stringify({ ministry: kstDate(Date.now()), song: kstDate(Date.now() - 86400000) }) + ';';
  return doorCtx({
    ...opts,
    extra: [
      since,
      pickConst(/const FEAT_NEW_DAYS = \d+;/, 'FEAT_NEW_DAYS'),
      pickFn('kstDateParts'), pickFn('kstDayNumber'), pickFn('featSeen'), pickFn('featIsNew'), pickFn('newestNewFeat'),
    ],
  });
}

test('newestNewFeat — 문(ministryVisible)이 닫혀 사역 단추가 안 보이면 "ministry" 를 건너뛴다(다음으로 새것이 NEW)', () => {
  // 플레이스토어 앱 숨김
  assert.equal(featCtx({ hide: true, play: true, display: 'standalone' }).newestNewFeat(), 'song', '숨은 사역신청이 NEW 를 가져갔다');
  assert.equal(featCtx({ hide: true, session: true, display: 'browser' }).newestNewFeat(), 'song', '맞춤 탭으로 열린 앱에서 숨은 사역신청이 NEW 를 가져갔다');
  assert.equal(featCtx({ hide: true, play: true, display: 'browser' }).newestNewFeat(), 'ministry', '크롬 탭은 원래대로');
  assert.equal(featCtx({ hide: true, play: false }).newestNewFeat(), 'ministry', '웹은 원래대로');
  assert.equal(featCtx({ hide: false, play: true }).newestNewFeat(), 'ministry', '스위치를 끄면 원래대로');
  // 기간 밖 — 플레이스토어와 상관없이 원래부터 문이 닫힌 경우
  assert.equal(featCtx({ hide: false, period: null }).newestNewFeat(), 'song', '기간 정보가 없어 안 보이는 사역신청이 NEW 를 가져갔다');
  assert.equal(featCtx({ hide: false, period: { open: '2000-01-01', close: '2000-01-02' } }).newestNewFeat(), 'song', '기간이 지나 안 보이는 사역신청이 NEW 를 가져갔다');
  assert.equal(featCtx({ hide: false, period: null, tester: true }).newestNewFeat(), 'ministry', '시험 참여자는 기간 밖에도 보인다');
  assert.equal(featCtx({ hide: false, period: null, preview: true }).newestNewFeat(), 'ministry', '관리자 미리보기는 보인다');
});

test('첫 화면의 사역 단추는 모두 문(ministryVisible) 뒤에 있다 — 새 단추가 문을 건너뛰면 플레이스토어 앱에 샌다', () => {
  const ids = ['id="open-ministry"', 'id="open-ministry-history"'];
  let n = 0;
  for (const id of ids) {
    for (let at = source.indexOf(id); at >= 0; at = source.indexOf(id, at + 1)) {
      // 감싼 「${ … }」 를 거슬러 찾는다 — 그 안의 ${ministryYear()}·${newBadge(…)} 는 짝을 맞춰 건너뛴다
      let open = -1;
      for (let i = at - 1, depth = 0; i > 0; i--) {
        if (source[i] === '}') depth++;
        else if (source[i] === '{') { if (depth > 0) depth--; else { if (source[i - 1] === '$') open = i - 1; break; } }
      }
      assert.ok(source.startsWith('${ministryVisible() && ', open), id + ' 가 ministryVisible() 조건 밖에 있다(' + source.slice(open, open + 40) + ')');
      n++;
    }
  }
  assert.equal(n, 3, '사역 단추 수가 바뀌었다(사역현황 둘 + 「함께」 🤝 하나) — 이 검사를 함께 고칠 것');
});
