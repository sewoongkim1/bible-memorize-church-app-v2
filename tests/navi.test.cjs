// 📚 네비게이토 성경암송(2026-10-13) — 번호대 · 서버 갈래 · 시드 SQL 꼴 · 화면 순수 함수(꾸러미 없음 · preflight 가 건다)
//
//   node --test tests/navi.test.cjs
//
// 무엇을 지키나(docs/notes/navigators.md)
//   ① 번호대 — 「물가 화면으로 보냄」(isPsalmNo · 1001~1999)과 「복습에서 뺌」(isNonWeeklyNo · 1000 초과)이 갈렸는가.
//      한쪽만 고치면 네비게이토가 앨범·복습에서 물가 화면으로 가거나, 복습 예약이 조용히 쌓인다(물가 41행 사고 — 2026-09-23).
//   ② 서버 — getVerses(track:"navi") 갈래 · navi:true 표식 · naviPublic 허용 키(한 줄 Set — 다른 시험·status.py 가 정규식으로 읽는다).
//   ③ 시드 SQL — 73줄 · 2001~2112 · 모두 navi · 다시 돌려도 is_active 를 안 덮는다 · delete 없음.
//   ④ 화면 순수 함수(js/navi.js) — 묶음 · 주제 칸 · 세 값(받음·없음·모름) · 완료 뒤 「다음」 · 쓰면 안 되는 말.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = (...f) => fs.readFileSync(path.join(root, ...f), 'utf8').replace(/\r\n/g, '\n');
const J = (x) => JSON.parse(JSON.stringify(x));   // vm 안에서 만든 값은 realm 이 달라 deepEqual 이 떨어진다
const slice = (src, a, b, what) => {
  const s = src.indexOf(a), e = src.indexOf(b, s + a.length);
  assert.ok(s >= 0 && e > s, what + ' — 표식을 못 찾았다(이 검사가 낡았다)');
  return src.slice(s, e);
};
const codeOnly = (t) => t.split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '')).join('\n');

const APP = read('app.js'), PSALM = read('js', 'psalm.js');
const INDEX = read('supabase', 'functions', 'api', 'index.ts');

// ── ① 번호대 ──
test('① 번호대 — 물가는 1001~1999 · 주간이 아님은 1000 초과 · 앱과 서버가 같은 값', () => {
  const pure = slice(PSALM, '// ── 구절 번호대 — 순수 (여기부터) ──', '// ── 구절 번호대 — 순수 (여기까지) ──', 'js/psalm.js');
  const N = vm.runInContext(pure + '\n;({ PSALM_NO_BASE, NAVI_NO_BASE, isPsalmNo, isNonWeeklyNo })', vm.createContext({}));
  assert.equal(N.PSALM_NO_BASE, 1000); assert.equal(N.NAVI_NO_BASE, 2000);
  for (const [no, ps, nw] of [[1, false, false], [999, false, false], [1000, false, false], [1001, true, true], [1180, true, true],
    [1999, true, true], [2000, false, true], [2001, false, true], [2112, false, true], ['2021', false, true], ['1005', true, true]]) {
    assert.equal(N.isPsalmNo(no), ps, 'isPsalmNo ' + no);
    assert.equal(N.isNonWeeklyNo(no), nw, 'isNonWeeklyNo ' + no);
  }
  // 서버도 같은 값 — PSALM_NO_BASE 1000 · isNonWeeklyNo 하나(물가 화면 판정은 앱에만)
  assert.ok(/^const PSALM_NO_BASE = 1000;$/m.test(INDEX), 'index.ts PSALM_NO_BASE');
  assert.ok(INDEX.includes('function isNonWeeklyNo(no: any) { return Number(no) > PSALM_NO_BASE; }'), 'index.ts isNonWeeklyNo');
  assert.ok(!/\bisPsalmNo\b/.test(codeOnly(INDEX)), 'index.ts 에 isPsalmNo 가 남았다 — 서버의 두 자리는 「복습에서 뺌」이다');
  assert.equal(codeOnly(INDEX).split(/!isNonWeeklyNo\(/).length - 1, 2, '서버 복습 두 자리(로그인 자동 예약 · saveProgress)');
});

test('① 앱 — 복습 두 자리는 isNonWeeklyNo · 물가 화면으로 보내는 두 자리만 isPsalmNo', () => {
  const code = codeOnly(APP);
  const ens = slice(code, 'function ensureReviewScheduled(no) {', '\n}', 'ensureReviewScheduled');
  assert.ok(ens.includes('if (isNonWeeklyNo(no)) return;'), 'ensureReviewScheduled');
  const due = slice(code, 'function dueReviewNos() {', '\n}', 'dueReviewNos');
  assert.ok(due.includes('if (isNonWeeklyNo(key)) { delete r[key]; purged = true; }'), 'dueReviewNos');
  const uses = code.split('\n').filter((l) => /\bisPsalmNo\(/.test(l)).map((l) => l.trim());
  assert.deepEqual(uses, [
    'if (isPsalmNo(verse.no)) return renderPsalmReview(queue, idx);',
    'if (isPsalmNo(v.no)) renderPsalmStage(v, 0); else startTest(v);',
  ], 'isPsalmNo 는 복습 화면·앨범에서 「물가 화면으로 보냄」에만');
  // 지표 SQL 도 같은 범위 — 2001~ 이 「시편 암송」으로 세지면 안 된다
  const met = read('supabase', 'psalm_metrics.sql').split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');
  assert.ok(/verse_no between 1001 and 1999/.test(met) && !/verse_no > 1000/.test(met), 'psalm_metrics.sql 범위');
});

// ── ② 서버 ──
test('② 서버 — getVerses(track:"navi") 갈래 · navi:true 표식 · naviPublic 허용 키', () => {
  const NAVI = read('supabase', 'functions', 'api', 'navi.ts');
  const pure = slice(NAVI, '// ── 네비게이토 — 순수 함수 (여기부터) ──', '// ── 네비게이토 — 순수 함수 (여기까지) ──', 'navi.ts');
  assert.ok(!/:\s*(any|string|number|boolean|Record|Set|Promise)\b/.test(pure), 'navi.ts 순수 구간에 타입 표기 — node:vm 이 못 돌린다');
  const naviVerseOf = vm.runInContext(pure + '\n;naviVerseOf', vm.createContext({}));
  assert.deepEqual(J(naviVerseOf({ no: 2021, chapter: 'A', topic: '중심되신 그리스도', ref_short: '고후 5:17', ref_full: '고린도후서 5장 17절', ref: 'x', text: '그런즉 …' })),
    { no: 2021, chapter: 'A', topic: '중심되신 그리스도', refShort: '고후 5:17', refFull: '고린도후서 5장 17절', text: '그런즉 …',
      textEn: '', refEn: '', helpEasy: '', helpTip: '' });
  assert.deepEqual(J(naviVerseOf({ no: 2001, ref: '요일 5:11-12' })),
    { no: 2001, chapter: '', topic: '', refShort: '요일 5:11-12', refFull: '요일 5:11-12', text: '',
      textEn: '', refEn: '', helpEasy: '', helpTip: '' }, '빈 칸은 빈 글자로');
  // 영어(NIV) · 풀이 · 기억법(2026-10-16) — 영어는 주간과 같은 이름(textEn·refEn)이라야 app.js hasEn · isEnMode 가 그대로 먹는다
  assert.deepEqual(J(naviVerseOf({ no: 2043, text_en: 'For the wages …', ref_en: 'Rom 6:23', help_easy: '풀이', help_tip: '기억법' })),
    { no: 2043, chapter: '', topic: '', refShort: '', refFull: '', text: '',
      textEn: 'For the wages …', refEn: 'Rom 6:23', helpEasy: '풀이', helpTip: '기억법' });
  assert.ok(/\.select\("no,chapter,topic,ref_short,ref_full,ref,text,text_en,ref_en,help_easy,help_tip"\)/.test(NAVI), '새 칸 넷을 읽는다');
  // 응답 — 성공은 navi:true · 오류는 빈 목록이 아니라 ok:false(앱이 「모름」으로)
  assert.ok(/return \{ ok: true, navi: true, verses: \(data \?\? \[\]\)\.map\(naviVerseOf\) \};/.test(NAVI), 'navi:true 표식');
  assert.ok(/if \(error\) \{[\s\S]*?return \{ ok: false, error: "navi-unavailable" \};/.test(NAVI), '오류는 ok:false');
  assert.ok(/\.eq\("is_active", true\)\.eq\("track", "navi"\)\.order\("no"\)/.test(NAVI), '켜진 navi 줄 · 번호순');
  // index.ts — 들여오기 · 갈래(물가 다음 · 주간 앞)
  assert.ok(INDEX.includes('import { getNaviVerses } from "./navi.ts";'), 'import');
  const gv = slice(INDEX, 'async function getVerses(b: any = {}) {', '\n}', 'getVerses');
  const lines = gv.split('\n').map((l) => l.trim());
  assert.equal(lines[1], 'if (b && b.track === "psalm") return await getPsalmVerses();');
  assert.equal(lines[2], 'if (b && b.track === "navi") return await getNaviVerses();');
  const keys = /const PUBLIC_CONFIG_KEYS = new Set\(\[([^\]]*)\]\)/.exec(INDEX);
  assert.ok(keys && /"naviPublic"/.test(keys[1]), 'naviPublic 이 PUBLIC_CONFIG_KEYS 에 없다 — 켜도 앱이 영영 모른다');
});

// ── ③ 시드 SQL ──
test('③ 시드 SQL — 73줄 · 2001~2112 · 모두 navi · 다시 돌려도 is_active 를 안 덮는다 · delete 없음', () => {
  const raw = read('supabase', 'navi_verses.sql');
  const sql = raw.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');
  const rows = [...sql.matchAll(/^\s*\((\d+), '(\w+)', '(\w+)', '((?:[^']|'')*)', /gm)].map((m) => ({ no: +m[1], track: m[2], ch: m[3], topic: m[4] }));
  assert.equal(rows.length, 73, '카드 73장');
  assert.ok(rows.every((r) => r.track === 'navi'), "모두 'navi'");
  assert.equal(Math.min(...rows.map((r) => r.no)), 2001); assert.equal(Math.max(...rows.map((r) => r.no)), 2112);
  assert.equal(new Set(rows.map((r) => r.no)).size, 73, '번호 겹침 없음');
  const BAND = { assurance: [2001, 2010], guide: [2011, 2020], A: [2021, 2040], B: [2041, 2060], C: [2061, 2080], D: [2081, 2100], E: [2101, 2120] };
  const count = {};
  for (const r of rows) {
    assert.ok(BAND[r.ch], '모르는 묶음 ' + r.ch);
    assert.ok(r.no >= BAND[r.ch][0] && r.no <= BAND[r.ch][1], r.no + ' 이 ' + r.ch + ' 번호대 밖');
    assert.ok(r.topic.length > 0, r.no + ' 주제가 비었다');
    count[r.ch] = (count[r.ch] || 0) + 1;
  }
  assert.deepEqual(count, { assurance: 5, guide: 8, A: 12, B: 12, C: 12, D: 12, E: 12 });
  const upd = slice(sql, 'on conflict (no) do update set', ';', 'on conflict');
  assert.ok(!/is_active/.test(upd), 'on conflict 가 is_active 를 덮는다 — 다시 돌리면 내려 둔 카드가 되살아난다');
  assert.ok(/text = excluded\.text/.test(upd) && /chapter = excluded\.chapter/.test(upd), '본문·묶음은 엑셀을 따른다');
  assert.ok(!/\bdelete\s+from\b/i.test(sql) && !/\btruncate\b/i.test(sql), 'verses 를 지우면 기록이 cascade 로 지워진다');
  assert.ok(/add column if not exists chapter text/.test(sql) && /add column if not exists topic\s+text/.test(sql), '칸 둘');
  // 본문은 사람이 붙인 원문 그대로 — 숫자·괄호·영문이 없다(붙여 넣다 따라온 절 번호·각주)
  const texts = [...sql.matchAll(/^\s*\(\d+, 'navi', (?:'(?:[^']|'')*', ){5}'((?:[^']|'')*)', null, (true|false)\)/gm)].map((m) => m[1]);
  assert.equal(texts.length, 73, '본문 칸을 못 읽었다');
  for (const t of texts) assert.ok(t.length > 10 && !/[0-9A-Za-z()\[\]<>]/.test(t), '본문 꼴: ' + t.slice(0, 20));
  // 문장부호도 없다(2026-10-16 친구 「암송 구절에 쉼표 등은 제외」 — 빈칸 · 카드에 「안에,」로 붙어 나왔다 · tools/navi-fit.py 가 뺀다)
  for (const t of texts) assert.ok(!/[,.;:!?·…"“”‘’「」『』]/.test(t), '본문에 문장부호: ' + t.slice(0, 20));
});

// ── ④ 화면 순수 함수(js/navi.js) ──
const NAVI_JS = read('js', 'navi.js');
const NV = (() => {
  const pure = slice(NAVI_JS, '// ── 네비게이토 순수 함수 (여기부터) ──', '// ── 네비게이토 순수 함수 (여기까지) ──', 'js/navi.js');
  new vm.Script(pure + '\n;globalThis.__nv = { NV_CHAPTERS, nvChapterTitle, nvReadAnswer, nvByChapter, nvTopicGroups, nvDoneCount, nvPrevOf, nvNextOf, nvNextAfter, NV_MSG, nvChapterSub, nvWords };').runInThisContext();
  return globalThis.__nv;
})();
// 시드 SQL 에서 실제 카드를 꺼내 화면 함수에 넣는다 — 서버 답 꼴(naviVerseOf)과 같은 칸 이름
const SEED = [...read('supabase', 'navi_verses.sql').matchAll(/^\s*\((\d+), 'navi', '(\w+)', '((?:[^']|'')*)', '((?:[^']|'')*)', '(?:[^']|'')*', '((?:[^']|'')*)', '((?:[^']|'')*)', null, (?:true|false)\)/gm)]
  .map((m) => ({ no: +m[1], chapter: m[2], topic: m[3].replace(/''/g, "'"), refShort: m[4], refFull: m[5], text: m[6].replace(/''/g, "'") }));

test('④ 묶음 — 일곱 · 시드의 묶음 코드와 같다 · A~E 는 「A. 새로운 삶」', () => {
  assert.deepEqual(NV.NV_CHAPTERS.map((c) => c.code), ['assurance', 'guide', 'A', 'B', 'C', 'D', 'E']);
  assert.deepEqual([...new Set(SEED.map((v) => v.chapter))], ['assurance', 'guide', 'A', 'B', 'C', 'D', 'E'], '시드 차례 = 화면 차례');
  assert.equal(NV.nvChapterTitle('A'), 'A. 새로운 삶');
  assert.equal(NV.nvChapterTitle('assurance'), '그리스도인의 확신');
  assert.equal(NV.nvChapterTitle('guide'), '그리스도인의 생활 지침');
  assert.equal(NV.nvChapterTitle('Z'), '');
  // 묶음 이름은 양식 생성기(tools/navi-form-gen.py)의 이름과 같다 — 두 곳이 갈라지면 엑셀과 화면이 다른 이름을 부른다
  const gen = read('tools', 'navi-form-gen.py');
  for (const c of NV.NV_CHAPTERS) assert.ok(gen.includes('("' + c.code + '", "' + NV.nvChapterTitle(c.code) + '"'), c.code + ' 이름이 navi-form-gen.py 와 다르다');
});

test('④ 세 값 — 받음 · 없음 · 모름(옛 서버는 주간 구절을 준다 — navi:true 가 없으면 모름)', () => {
  const ok = NV.nvReadAnswer({ ok: true, navi: true, verses: SEED.slice().reverse() });
  assert.equal(ok.state, 'ok'); assert.equal(ok.verses.length, 73);
  assert.deepEqual(ok.verses.map((v) => v.no), SEED.map((v) => v.no).sort((a, b) => a - b), '번호순으로 다시 세운다');
  assert.equal(NV.nvReadAnswer({ ok: true, navi: true, verses: [] }).state, 'empty');
  // 옛 서버(navi 갈래 없음) — track 을 몰라 주간 구절을 돌려준다
  assert.equal(NV.nvReadAnswer({ ok: true, verses: [{ no: 38, refShort: '살전 5:16-18', refFull: '데살로니가전서 5장 16-18절', text: '항상 기뻐하라' }] }).state, 'unknown');
  for (const bad of [null, undefined, {}, { ok: false, error: 'navi-unavailable' }, { ok: true, navi: true }, { ok: true, navi: true, verses: 'x' }])
    assert.equal(NV.nvReadAnswer(bad).state, 'unknown', JSON.stringify(bad));
  // 번호대 밖 · 모르는 묶음 · 빈 본문은 버린다(남는 것이 없으면 없음)
  assert.equal(NV.nvReadAnswer({ ok: true, navi: true, verses: [{ no: 38, chapter: 'A', text: 'x' }, { no: 2021, chapter: 'Z', text: 'x' }, { no: 2022, chapter: 'A', text: '  ' }] }).state, 'empty');
});

test('④ 영어(NIV) · 풀이 · 기억법 — 서버 칸을 그대로 넘긴다 · 옛 서버(칸 없음)는 빈 글자', () => {
  const one = (v) => NV.nvReadAnswer({ ok: true, navi: true, verses: [Object.assign({ no: 2043, chapter: 'B', topic: '죄의 대가', refShort: '롬 6:23', refFull: '로마서 6장 23절', text: '죄의 삯은 사망이요' }, v)] }).verses[0];
  const a = one({ textEn: ' For the wages of sin is death ', refEn: 'Rom 6:23', helpEasy: '풀이', helpTip: '기억법' });
  assert.deepEqual([a.textEn, a.refEn, a.helpEasy, a.helpTip], ['For the wages of sin is death', 'Rom 6:23', '풀이', '기억법']);
  const b = one({});
  assert.deepEqual([b.textEn, b.refEn, b.helpEasy, b.helpTip], ['', '', '', ''], '옛 서버 — 한글만 · 도우미 탭 없음');
});

test('④ 빈칸 낱말(nvWords) — 앞뒤 문장부호는 빈칸 밖 · 낱말 안 부호는 그대로 · 줄표는 두 조각(붙여 그림)', () => {
  const W = (t) => J(NV.nvWords(t));
  assert.deepEqual(W('"Come, follow me," Jesus said'), [
    { pre: '"', core: 'Come', post: ',', glue: false }, { pre: '', core: 'follow', post: '', glue: false },
    { pre: '', core: 'me', post: ',"', glue: false }, { pre: '', core: 'Jesus', post: '', glue: false }, { pre: '', core: 'said', post: '', glue: false }]);
  assert.deepEqual(W("God's temple Jesus' sake"), [
    { pre: '', core: "God's", post: '', glue: false }, { pre: '', core: 'temple', post: '', glue: false },
    { pre: '', core: 'Jesus', post: "'", glue: false }, { pre: '', core: 'sake', post: '', glue: false }]);
  assert.deepEqual(W('God—this is'), [
    { pre: '', core: 'God', post: '—', glue: false }, { pre: '', core: 'this', post: '', glue: true }, { pre: '', core: 'is', post: '', glue: false }]);
  assert.deepEqual(W('a — b'), [
    { pre: '', core: 'a', post: '', glue: false }, { pre: '—', core: '', post: '', glue: false }, { pre: '', core: 'b', post: '', glue: false }], '부호뿐인 조각은 core 가 빈다');
  // 한글 — 부호가 없으면 낱말 그대로(지금까지와 같은 빈칸)
  assert.deepEqual(NV.nvWords('  나는 포도나무요  너희는 가지라 ').map((w) => w.core), ['나는', '포도나무요', '너희는', '가지라']);
  assert.ok(NV.nvWords('나는 포도나무요').every((w) => !w.pre && !w.post && !w.glue));
  // 시드 73구절 모두 — 조각을 다시 붙이면 본문과 같다(빈칸 밖으로 뺀 부호를 잃지 않는다)
  for (const v of SEED) {
    const ws = NV.nvWords(v.text);
    assert.equal(ws.map((w, i) => (i && !w.glue ? ' ' : '') + w.pre + w.core + w.post).join(''), v.text.trim().replace(/\s+/g, ' '), String(v.no));
  }
});

test('④ 주제 칸 — A~E 는 두 구절씩 여섯 칸 · 확신·생활 지침은 한 구절씩', () => {
  const all = NV.nvReadAnswer({ ok: true, navi: true, verses: SEED }).verses;
  const count = (code) => NV.nvTopicGroups(NV.nvByChapter(all, code)).map((g) => g.verses.length);
  for (const c of ['A', 'B', 'C', 'D', 'E']) assert.deepEqual(count(c), [2, 2, 2, 2, 2, 2], c);
  assert.deepEqual(count('assurance'), [1, 1, 1, 1, 1]);
  assert.deepEqual(count('guide'), [1, 1, 1, 1, 1, 1, 1, 1]);
  assert.deepEqual(J(NV.nvTopicGroups(NV.nvByChapter(all, 'A')).map((g) => g.topic)),
    ['중심되신 그리스도', '그리스도께 순종', '말씀', '기도', '교제', '증거']);
  // 같은 주제라도 떨어져 있으면 다른 칸(B 의 「구원의 확신」은 확신 묶음의 「구원의 확신」과 묶음이 달라 섞이지 않는다)
  assert.equal(NV.nvByChapter(all, 'B').filter((v) => v.topic === '구원의 확신').length, 2);
  assert.deepEqual(J(NV.nvTopicGroups([{ no: 1, topic: 'x' }, { no: 2, topic: 'y' }, { no: 3, topic: 'x' }]).map((g) => g.topic)), ['x', 'y', 'x']);
});

test('④ 완료 뒤 「다음」 — 묶음 안 다음 · 끝이면 안 마친 앞 구절 · 다 마치면 없음(처음으로 돌아가 갇히지 않는다)', () => {
  const all = NV.nvReadAnswer({ ok: true, navi: true, verses: SEED }).verses;
  const A = NV.nvByChapter(all, 'A');
  const passed = (done) => (no) => (done.includes(no) ? 3 : 0);
  assert.equal(NV.nvNextAfter(A, 2021, passed([])).verse.no, 2022);
  assert.equal(NV.nvNextAfter(A, 2021, passed([])).kind, 'next');
  // 마지막 구절 — 안 마친 앞 구절로
  const r = NV.nvNextAfter(A, 2032, passed([2021, 2022, 2032]));
  assert.equal(r.kind, 'left'); assert.equal(r.verse.no, 2023);
  // 다 마쳤으면 없음 → 「묶음 목록으로」
  assert.equal(NV.nvNextAfter(A, 2032, passed(A.map((v) => v.no))), null);
  assert.equal(NV.nvPrevOf(A, 2021), null); assert.equal(NV.nvPrevOf(A, 2022).no, 2021);
  assert.equal(NV.nvNextOf(A, 2032), null); assert.equal(NV.nvNextOf(A, 2031).no, 2032);
  assert.equal(NV.nvDoneCount(A, passed([2021, 2030, 9999])), 2);
});

test('④ 쓰는 말 — 마친 수만(전체 수 없음) · 앨범·복습 약속 없음 · 주간 화면 함수를 안 부른다', () => {
  assert.equal(NV.nvChapterSub(0, 12), '');
  assert.equal(NV.nvChapterSub(3, 12), '3구절 마침');
  assert.equal(NV.nvChapterSub(12, 12), '🎉 다 마쳤어요');
  assert.ok(!/\d+\s*\/\s*\d+|중\s*\d|\d+구절 중/.test(NAVI_JS.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')), '「N/전체」·「N구절 중」 꼴을 쓰지 않는다');
  const code = codeOnly(NAVI_JS);
  assert.ok(!/앨범에 담|복습이 예약|FIRST_DONE_HTML/.test(code), '네비게이토는 앨범·복습에 안 들어간다 — 그 말을 하면 거짓이 된다');
  for (const fn of ['startTest', 'renderTestScreen', 'showStageDoneModal', 'renderCompleteNav', 'renderVerseList', 'checkAllComplete'])
    assert.ok(!new RegExp('\\b' + fn + '\\(').test(code), fn + ' — 주간 화면 함수는 전역 verses(주간)에 묶여 있다');
  assert.ok(/setupAutoCheck\(verse, stage, \(\) => nvStageDone\(verse, stage, isCardMode\(\)\)\);/.test(code), '자기 완료 길(onDone)을 넘긴다 — 안 넘기면 주간 완료 길로 간다');
  assert.ok(/saveProgress\(verse\.no, stage, cardUsed \? "card" : "typing", nvLang\(verse\)\);/.test(code),
    'mode 는 typing/card(서버가 learn-* 로) · 언어는 nvLang 으로 넘긴다(app.js verseLang 은 주제별 구절을 몰라 늘 ko)');
  assert.ok(!/getPassedStage\(no\)/.test(code), '단계는 언어마다 — getPassedStage 에 nvLang 을 넘긴다');
  // 속성(last.verses · d.verses)은 빼고 맨 이름 verses 만 — 전역 verses(주간)에 넣거나 바꾸지 않는다
  assert.ok(!/(?<![.\w$])verses\s*\.\s*(push|concat|splice|unshift)\b|(?<![.\w$])verses\s*=(?!=)/.test(code), '전역 verses(주간)를 건드리지 않는다');
});

// ── ⑤ 열람 기록(2026-10-13 여는 날) ──
test('⑤ 열람 기록 — FEATURES 에 navi · 스모크 목록이 FEATURES 와 같다 · 머리 표에 navi 줄', () => {
  const blk = INDEX.slice(INDEX.indexOf('const FEATURES = new Set(['), INDEX.indexOf(']);', INDEX.indexOf('const FEATURES = new Set([')));
  const feats = [...blk.matchAll(/^\s*"([a-z-]+)"/gm)].map((m) => m[1]);
  assert.ok(feats.includes('navi'), 'FEATURES 에 navi 가 없다 — 앱이 보내는 logFeature("navi") 가 조용히 버려진다');
  // tests/feature-log-smoke.sh 는 FEATURES 전부를 돌려야 한다(빠진 값은 시험되지 않는다 — edu·duty 가 그렇게 빠져 있었다)
  const smoke = /^for F in ([^;]+); do/m.exec(read('tests', 'feature-log-smoke.sh'));
  assert.ok(smoke, 'feature-log-smoke.sh 의 for 줄을 못 찾았다 — 이 검사가 낡았다');
  assert.deepEqual(smoke[1].trim().split(/\s+/).sort(), feats.slice().sort(), 'feature-log-smoke.sh 목록 ≠ FEATURES');
  assert.ok(/^--\s+navi\s+= 0 고정/m.test(read('supabase', 'feature_log.sql')), 'feature_log.sql 머리 표에 navi 줄');
  assert.ok(/logFeature\("navi", 0\)/.test(APP), '앱은 단추 누름에서 navi 를 남긴다');
});

test('⑥ 화면 이름 — 「주제별 성경암송」(네비게이토 이름 사용 허락 전 · 친구 2026-10-13) · 화면에 나가는 글에 「네비게이토」가 없다', () => {
  const NAVI_JS = read('js', 'navi.js');
  assert.ok(APP.includes('id="open-navi">📚 주제별 성경암송'), '첫 화면 단추');
  assert.ok(NAVI_JS.includes('<h2 class="nv-title">📚 주제별 성경암송</h2>'), '화면 제목');
  assert.ok(APP.includes('icon: "📚", title: "주제별 성경암송",'), '설명서 제목');
  // 주석(// · /* */ · 템플릿 안 ${/* */})을 걷은 뒤 남은 코드·글에 「네비게이토」가 없어야 — 허락을 받으면 이 검사와 함께 바꾼다(docs/notes/navigators.md 「여는 날」 1)
  const strip = (t) => codeOnly(t.replace(/\/\*[\s\S]*?\*\//g, ''));
  for (const [name, src] of [['app.js', APP], ['js/navi.js', NAVI_JS]]) {
    const hits = strip(src).split('\n').filter((l) => l.includes('네비게이토'));
    assert.deepEqual(hits, [], name + ' — 화면에 나갈 수 있는 「네비게이토」');
  }
});
