// 가을 말씀 동행 — v2_event_weeks 에 p_per_day(하루 문턱) · 글자 검사만.
//
//   node --test tests/event-perday.test.cjs
//
// ⚠️ **꾸러미를 하나도 쓰지 않는다**(node:test·node:assert·node:fs·node:path 뿐).
//    그래야 tools/preflight.py 가 배포 앞 그물에 걸 수 있다. SQL 을 실제로 돌려 보는
//    확인은 이 시험의 몫이 아니다(개발 DB 에서 손으로/Step 7 로 한다) — 여기는 글자만 본다.
//
// ⚠️ index.ts 의 두 가지(「rpc 호출마다 p_per_day」·「evtRule 이 perDay 를 읽는다」)는
//    이 작업(Task 9)이 아니라 다음 작업(Task 10)이 고친다. 그때까지는 FAIL 이 맞다.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const sql = fs.readFileSync(path.join(root, 'supabase/event_streak.sql'), 'utf8');
const ts = fs.readFileSync(path.join(root, 'supabase/functions/api/index.ts'), 'utf8');

// 중괄호 깊이를 세어 함수 { ... } 본문을 떼어 낸다(줄 순서가 바뀌어도 견딘다).
function extractFunctionBody(src, name) {
  const re = new RegExp('function\\s+' + name + '\\s*\\([^)]*\\)[^{]*\\{');
  const m = re.exec(src);
  assert.ok(m, `index.ts 에서 함수 ${name} 을 못 찾았다 — 이 검사가 낡았다`);
  let i = m.index + m[0].length;
  let depth = 1;
  const start = i;
  for (; i < src.length && depth > 0; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') depth--;
  }
  assert.ok(depth === 0, `${name} 의 닫는 중괄호를 못 찾았다`);
  return src.slice(start, i - 1);
}

// 괄호 깊이를 세어 rpc("이름", {...}) 호출 전체를 떼어 낸다.
function extractCall(src, rpcNameMarkerIndex) {
  const parenStart = src.indexOf('(', rpcNameMarkerIndex);
  assert.ok(parenStart >= 0, 'rpc(...) 의 여는 괄호를 못 찾았다');
  let depth = 0, i = parenStart;
  for (; i < src.length; i++) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')') { depth--; if (depth === 0) break; }
  }
  assert.ok(depth === 0, 'rpc(...) 의 닫는 괄호를 못 찾았다');
  return src.slice(parenStart, i + 1);
}

test('drop function(4-인자) 이 create(5-인자) 보다 앞에 있다', () => {
  const dropIdx = sql.indexOf('drop function if exists public.v2_event_weeks(date, int, int, text[])');
  const createIdx = sql.indexOf('create or replace function public.v2_event_weeks(');
  assert.ok(dropIdx >= 0, '옛 4-인자 서명을 지우는 drop 문이 없다');
  assert.ok(createIdx >= 0, 'public.v2_event_weeks 를 만드는 create 문이 없다');
  assert.ok(dropIdx < createIdx, 'drop 이 create 보다 뒤에 있다 — 두 오버로드가 한순간 같이 있으면 PostgREST 가 못 고른다');
});

test('create function 은 정확히 하나이고, 인자 목록 끝이 p_per_day int default 1 이다', () => {
  const matches = sql.match(/create\s+(or\s+replace\s+)?function\s+(public\.)?v2_event_weeks\s*\(/gi) || [];
  assert.equal(matches.length, 1, `create function ...v2_event_weeks( 가 ${matches.length}개 — 정확히 하나여야 한다`);

  const argsEndRe = /p_per_day\s+int\s+default\s+1[^\n]*\n\s*\)\s*\n?\s*returns\s+table/i;
  assert.ok(argsEndRe.test(sql), '인자 목록의 마지막이 p_per_day int default 1 이 아니다');
});

test('5-인자 revoke/grant 가 있고, 4-인자 revoke/grant 는 남아 있지 않다', () => {
  const revokeRe = /revoke\s+all\s+on\s+function\s+public\.v2_event_weeks\(date,\s*int,\s*int,\s*text\[\],\s*int\)\s+from\s+public,\s*anon,\s*authenticated/i;
  const grantRe = /grant\s+execute\s+on\s+function\s+public\.v2_event_weeks\(date,\s*int,\s*int,\s*text\[\],\s*int\)\s+to\s+service_role/i;
  assert.ok(revokeRe.test(sql), '5-인자 revoke 문이 없다');
  assert.ok(grantRe.test(sql), '5-인자 grant 문이 없다');

  // 4-인자(text[] 뒤에 바로 닫는 괄호) 서명은 drop 문 한 줄에만 남아야 한다.
  const fourArgHits = sql.match(/v2_event_weeks\(date,\s*int,\s*int,\s*text\[\]\)/g) || [];
  assert.equal(fourArgHits.length, 1, `4-인자 서명 v2_event_weeks(date, int, int, text[]) 가 ${fourArgHits.length}곳 — drop 문 한 곳만 남아야 한다(revoke/grant 에 남으면 안 된다)`);
});

test('함수 본문 — HAVING 없이 filter(where n >= ...) 로, sum(da.cnt) 로 하루 합을 잰다', () => {
  const firstDollar = sql.indexOf('$$', sql.indexOf('create or replace function public.v2_event_weeks('));
  assert.ok(firstDollar >= 0, '함수 본문 시작 $$ 를 못 찾았다');
  const secondDollar = sql.indexOf('$$', firstDollar + 2);
  assert.ok(secondDollar > firstDollar, '함수 본문 끝 $$ 를 못 찾았다');
  const body = sql.slice(firstDollar + 2, secondDollar);
  const codeOnly = body.replace(/--.*$/gm, ''); // 주석 속 "HAVING 을 안 쓴다" 같은 설명 글자는 빼고 본다

  assert.ok(!/\bhaving\b/i.test(codeOnly), '본문에 HAVING 이 있다 — 문턱 미달인 날만 있는 분의 행·first_day 가 사라진다');
  assert.ok(/filter\s*\(\s*where\s+n\s*>=/i.test(body), '본문에 filter (where n >= ...) 가 없다');
  assert.ok(/sum\(\s*da\.cnt\s*\)/i.test(body), '본문에 sum(da.cnt) 가 없다 — 하루 합을 모으지 않는다');
});

test('first_day 를 만드는 min(d.day) 부분식에는 p_per_day 가 없다', () => {
  const m = /\(\s*select\s+min\(d\.day\)\s+from\s+daily_activity\s+d\s+where\s+d\.user_id\s*=\s*a\.uid\s*\)/i.exec(sql);
  assert.ok(m, 'first_day 를 만드는 (select min(d.day) from daily_activity d where d.user_id = a.uid) 부분식을 못 찾았다');
  assert.ok(!/p_per_day/.test(m[0]), 'first_day 부분식에 p_per_day 가 들어갔다 — 문턱 미달만 있는 분도 first_day 가 나와야 한다');
});

test('⚠️ index.ts 의 rpc("v2_event_weeks") 호출마다 p_per_day 가 있다 (Task 10 에서 통과)', () => {
  const marker = 'rpc("v2_event_weeks"';
  const idxs = [];
  let from = 0;
  while (true) {
    const i = ts.indexOf(marker, from);
    if (i < 0) break;
    idxs.push(i);
    from = i + marker.length;
  }
  assert.ok(idxs.length >= 2, `rpc("v2_event_weeks" 호출이 ${idxs.length}번 — 적어도 둘이어야 한다`);
  for (const i of idxs) {
    const call = extractCall(ts, i);
    assert.ok(/p_per_day/.test(call), `rpc("v2_event_weeks" 호출에 p_per_day 가 없다: ${call.slice(0, 120)}...`);
  }
});

test('⚠️ evtRule 함수 본문이 perDay 를 읽는다 (Task 10 에서 통과)', () => {
  const body = extractFunctionBody(ts, 'evtRule');
  assert.ok(/perDay/.test(body), 'evtRule 본문에 perDay 가 없다');
});
