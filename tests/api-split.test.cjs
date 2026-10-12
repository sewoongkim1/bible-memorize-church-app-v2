// api 파일 나누기(2026-10-12 · docs/notes/backend-api.md 「파일 나누기」) — 들여오기가 맞물리는가 · 떼어 낸 영역의 순수 규칙.
//
//   node --test tests/api-split.test.cjs
//
// ⚠️ **꾸러미를 하나도 쓰지 않는다**(node:test·node:assert·node:fs·node:path·node:vm 뿐) — tools/preflight.py 가 배포 앞 그물에 건다.
//
// 무엇을 지키나
//   ① index.ts 가 영역 파일(./x.ts)에서 들여오는 이름이 그 파일에 정말 export 돼 있는가.
//      이 PC 에는 deno 가 없어 `deno check` 를 못 돌린다 — 이름 하나가 어긋나면 배포가 아니라 **첫 요청에서** 함수가 통째로 죽는다.
//   ② 들여온 이름을 index.ts 가 다시 선언하지 않는가(두 번 선언 = 배포 실패) · 영역 파일이 index.ts 를 들여오지 않는가(고리).
//   ③ 같은 도우미를 두 파일에 두지 않는가 — _shared.ts 의 export 를 다른 파일이 따로 선언하면 걸린다.
//   ④ 쉴만한 물가(psalm.ts) 순수 규칙 — 열린 편수 · 설정 값 읽기.
//   ⑤ 다른 파일이 export 한 이름(_shared.ts·영역 파일)을 쓰면 그 파일이 들여왔는가 — 옮기다 import 한 줄을 빠뜨리면
//      deno 가 없는 이 PC 에서는 아무 데서도 안 걸리고 **그 갈래를 처음 부를 때** ReferenceError 로 죽는다(2026-10-12 2단계에서
//      묵상 위젯이 쓰는 WIDGET_YMD_RE 를 빠뜨릴 뻔했다).
//   ⑥ 가정 축복 기도문(blessing.ts) 순수 규칙 — 받침 · 이름 토큰 채우기(ㄹ 받침이면 「로」).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const DIR = path.resolve(__dirname, '..', 'supabase', 'functions', 'api');
const read = (f) => fs.readFileSync(path.join(DIR, f), 'utf8').replace(/\r\n/g, '\n');
const INDEX = read('index.ts');
const FILES = fs.readdirSync(DIR).filter((f) => f.endsWith('.ts'));
// 줄 머리의 선언 이름(함수·const·let·class) — 문자열·주석 안의 것은 안 센다
const declared = (src) => new Set([...src.matchAll(/^(?:export\s+)?(?:async\s+)?(?:function\s*\*?\s*|const\s+|let\s+|class\s+)([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]));
const exported = (src) => new Set([...src.matchAll(/^export\s+(?:async\s+)?(?:function\s*\*?\s*|const\s+|let\s+|class\s+)([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]));
const importsOf = (src) => [...src.matchAll(/^import\s*\{([^}]*)\}\s*from\s*"(\.\/[^"]+)";/gm)]
  .map((m) => ({ from: m[2].slice(2), names: m[1].split(',').map((s) => s.trim()).filter(Boolean) }));

test('① index.ts 가 들여오는 이름은 그 파일에 export 돼 있다', () => {
  const imps = importsOf(INDEX);
  assert.ok(imps.length >= 2, 'index.ts 에서 영역 파일 import 를 못 찾았다 — 이 검사가 낡았다');
  for (const f of FILES) {
    for (const { from, names } of importsOf(read(f))) {
      assert.ok(FILES.includes(from), f + ' 가 없는 파일 ' + from + ' 을 들여온다');
      const ex = exported(read(from));
      for (const n of names) assert.ok(ex.has(n), f + ' 가 ' + from + ' 에서 ' + n + ' 을 들여오는데 export 가 없다');
    }
  }
});

test('② 들여온 이름을 다시 선언하지 않는다 · 영역 파일은 index.ts 를 들여오지 않는다', () => {
  for (const f of FILES) {
    const src = read(f), mine = declared(src);
    for (const { from, names } of importsOf(src)) {
      assert.notEqual(from, 'index.ts', f + ' 가 index.ts 를 들여온다 — 들머리를 부르면 고리가 생긴다(공용은 _shared.ts 로)');
      for (const n of names) assert.ok(!mine.has(n), f + ' 가 ' + from + ' 에서 들여온 ' + n + ' 을 또 선언한다(두 번 선언 = 배포 실패)');
    }
  }
});

test('③ _shared.ts 의 것을 다른 파일이 따로 두지 않는다', () => {
  const shared = exported(read('_shared.ts'));
  for (const n of ['db', 'kstDay', 'adminError', 'SUPER_OK', 'INTERNAL_OK', 'ADMIN_PW_ONLY', 'WIDGET_YMD_RE', 'widgetYmd', 'ymdDayNumber', 'fetchAllRows'])
    assert.ok(shared.has(n), '_shared.ts 에 ' + n + ' 이 없다 — 이 검사가 낡았다');
  for (const f of FILES.filter((x) => x !== '_shared.ts')) {
    const mine = declared(read(f));
    for (const n of shared) assert.ok(!mine.has(n), f + ' 가 _shared.ts 의 ' + n + ' 을 따로 선언한다 — 한 곳에만 둔다');
  }
  assert.ok(!/createClient\(/.test(INDEX), 'index.ts 가 db 를 따로 만든다 — _shared.ts 의 db 하나만 쓴다');
});

// ── ④ 쉴만한 물가 순수 규칙 ──
const PSALM = read('psalm.ts');
const S = PSALM.indexOf('// ── 쉴만한 물가 — 순수 함수 (여기부터) ──');
const E = PSALM.indexOf('// ── 쉴만한 물가 — 순수 함수 (여기까지) ──');
assert.ok(S >= 0 && E > S, 'psalm.ts 에서 순수 구간 표식을 못 찾았다 — 이 검사가 낡았다');
const pure = PSALM.slice(S, E);
assert.ok(!/:\s*(any|string|number|boolean|Record|Set|Promise)\b/.test(pure),
  'psalm.ts 순수 구간에 타입 표기가 들어왔다 — node:vm 이 못 돌린다. 표기를 빼거나 구간 밖으로 옮겨라');
const P = vm.runInContext(pure + '\n;({ PSALM_DEFAULT, psalmCfgOf, psalmOpenOn })', vm.createContext({}));
const J = (x) => JSON.parse(JSON.stringify(x));

test('④ psalmOpenOn — 시작일이 1편째 · 그 전은 0 · totalDays 에서 멈춘다 · 틀린 날짜는 0', () => {
  const cfg = { start: '2026-09-21', totalDays: 180 };
  assert.equal(P.psalmOpenOn(cfg, '2026-09-20'), 0);
  assert.equal(P.psalmOpenOn(cfg, '2026-09-21'), 1);
  assert.equal(P.psalmOpenOn(cfg, '2026-10-12'), 22);
  assert.equal(P.psalmOpenOn(cfg, '2027-03-19'), 180);   // 180번째 날
  assert.equal(P.psalmOpenOn(cfg, '2027-12-31'), 180);
  assert.equal(P.psalmOpenOn({ start: '2026-09-21', totalDays: 10 }, '2026-10-12'), 10);
  assert.equal(P.psalmOpenOn({ start: 'nope', totalDays: 180 }, '2026-10-12'), 0);
  assert.equal(P.psalmOpenOn(cfg, ''), 0);
});

test('④ psalmCfgOf — 칸이 없거나 꼴이 틀리면 그 칸만 기본값', () => {
  assert.deepEqual(J(P.PSALM_DEFAULT), { start: '2026-09-21', totalDays: 180 });
  assert.deepEqual(J(P.psalmCfgOf({})), { start: '2026-09-21', totalDays: 180 });
  assert.deepEqual(J(P.psalmCfgOf({ start: '2026-10-01', totalDays: '30' })), { start: '2026-10-01', totalDays: 30 });
  assert.deepEqual(J(P.psalmCfgOf({ start: 20261001, totalDays: 'x' })), { start: '2026-09-21', totalDays: 180 });
});

// ── ⑤ 남의 export 를 쓰면 들여왔는가 ──
// 주석·문자열을 걷어 낸 코드에서 이름을 찾는다(case "getBlessings": 같은 글자는 안 센다).
const codeOnly = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g, '""')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

test('⑤ 다른 파일이 export 한 이름을 쓰면 그 파일에서 들여왔다', () => {
  const exportsBy = new Map(FILES.map((f) => [f, exported(read(f))]));
  for (const f of FILES) {
    const src = read(f), mine = declared(src), code = codeOnly(src);
    const imported = new Set(importsOf(src).flatMap((x) => x.names));
    for (const [g, names] of exportsBy) {
      if (g === f) continue;
      for (const n of names) {
        if (mine.has(n) || imported.has(n)) continue;
        assert.ok(!new RegExp('(^|[^\\w$.])' + n.replace(/\$/g, '\\$') + '(?![\\w$])', 'm').test(code),
          f + ' 가 ' + g + ' 의 ' + n + ' 을 쓰는데 들여오지 않았다 — 배포는 되고 그 갈래를 처음 부를 때 함수가 죽는다');
      }
    }
  }
});

// ── ⑥ 가정 축복 기도문 순수 규칙 ──
const BLESS = read('blessing.ts');
const BS = BLESS.indexOf('// ── 축복 기도문 — 순수 함수 (여기부터) ──');
const BE = BLESS.indexOf('// ── 축복 기도문 — 순수 함수 (여기까지) ──');
assert.ok(BS >= 0 && BE > BS, 'blessing.ts 에서 순수 구간 표식을 못 찾았다 — 이 검사가 낡았다');
const bpure = BLESS.slice(BS, BE);
assert.ok(!/\)\s*:\s*\w|\(\s*\w+\s*:\s*\w/.test(bpure),
  'blessing.ts 순수 구간에 타입 표기가 들어왔다 — node:vm 이 못 돌린다. 표기를 빼거나 구간 밖으로 옮겨라');
const B = vm.runInContext(bpure + '\n;({ BLESS_WIDGET_NAME, blessJong, blessFill })', vm.createContext({}));

test('⑥ blessJong — 마지막 글자의 받침 번호(없으면 0 · ㄹ 은 8 · 한글이 아니면 0)', () => {
  assert.equal(B.blessJong('우리 가족'), 1);   // 족 = ㄱ
  assert.equal(B.blessJong('김철수'), 0);
  assert.equal(B.blessJong('김하늘'), 8);       // 늘 = ㄹ
  assert.equal(B.blessJong('이영'), 21);        // 영 = ㅇ
  assert.equal(B.blessJong('Tom'), 0);
});

test('⑥ blessFill — 이름 토큰 · 받침 따라 조사 · ㄹ 받침은 「로」', () => {
  const T = '{이름}{이} {이름}{을} {이름}{은} {이름}{과} {이름}{으로}';
  assert.equal(B.blessFill(T, '김철수'), '김철수가 김철수를 김철수는 김철수와 김철수로');
  assert.equal(B.blessFill(T, '우리 가족'), '우리 가족이 우리 가족을 우리 가족은 우리 가족과 우리 가족으로');
  assert.equal(B.blessFill(T, '김하늘'), '김하늘이 김하늘을 김하늘은 김하늘과 김하늘로');
  assert.equal(B.blessFill(null, '김철수'), '');
  assert.equal(B.blessFill('{이름}님 {이름}님', '박'), '박님 박님');   // 모두 바꾼다
  assert.equal(B.BLESS_WIDGET_NAME, '우리 가족');
});
