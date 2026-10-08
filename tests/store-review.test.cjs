// 구글 출시 심사 전 고칠 것(2026-10-01) — 순수 함수와 「여러 곳이 같은가」 검사.
//
//   node --test tests/store-review.test.cjs
//
// ⚠️ **꾸러미를 하나도 쓰지 않는다**(node:test·node:assert·node:fs·node:path·node:vm 뿐).
//    tools/preflight.py 가 이 검사를 배포 앞 그물에 건다 — require('jsdom') 같은 줄을 더하면 배포가 통째로 멈춘다.
//
// 무엇을 지키나
//   ① 보호자 확인 부서 — app.js · index.ts 두 곳이 글자까지 같고 같은 답을 내는가, 개인정보 안내 6항이 같은 부서를 말하는가
//   ② 게시판 이용 규칙 날짜 — app.js BOARD_RULES_VER = index.ts BOARD_RULES_SINCE (다르면 앱은 동의했다고 믿는데 서버가 막는다)
//   ③ 가리기 — 가린 분의 글·답글이 빠지는가(게시판 · 첫 화면 「새글 N」), 서버 응답에 가린 분의 user_id 가 안 나가는가
//   ④ AI 답 알리기 — 까닭 목록 세 곳(app · index.ts · SQL CHECK) · 길이 · 보관 90일 · 알린 분이 새지 않는가
//   ⑤ 개인정보 — 새로 모으는 것과 유튜브 문구가 privacy/ 와 앱 안 두 곳(renderPrivacyInfo · renderHelp 🔒)에 **모두** 있는가
//   ⑥ 새 표의 잠금(RLS · anon·authenticated revoke) · 스토어 문구의 사실 고침
//
// app.js·index.ts 는 require() 할 수 없어 두 표식 사이만 잘라 vm 에서 돌린다(본보기: tests/board-report.test.cjs).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

// 끝 표식은 시작 표식 **뒤에서** 찾는다(같은 줄표 주석이 파일 앞쪽에도 있어서)
function cut(source, start, end, where) {
  const s = source.indexOf(start);
  const e = s >= 0 ? source.indexOf(end, s + start.length) : -1;
  assert.ok(s >= 0, where + ' 에서 시작 표식을 못 찾았다 — 이 검사가 낡았다: ' + start);
  assert.ok(e > s, where + ' 에서 끝 표식이 시작보다 뒤에 없다 — 이 검사가 낡았다: ' + end);
  return source.slice(s, e);
}
const J = (x) => JSON.parse(JSON.stringify(x));
// 태그를 벗긴 글 — 링크 안 글자도 이어서 읽히게(「<a>YouTube 서비스 약관</a>에 동의」)
const textOf = (html) => String(html).replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');

const APP = read('app.js');
const TS = read('supabase/functions/api/index.ts');
const PRIVACY = read('privacy/index.html');

// ── 서버(index.ts) 순수 구간 ──
const tsSlice = cut(TS, '// ── 스토어 심사 — 순수 함수 (여기부터) ──', '// ── 스토어 심사 — 순수 함수 (여기까지) ──', 'index.ts');
assert.ok(!/:\s*(any|string|number|boolean|Record|Set|Promise)\b/.test(tsSlice),
  'index.ts 스토어 심사 순수 구간에 타입 표기가 들어왔다 — node:vm 이 못 돌린다. 표기를 빼거나 구간 밖으로 옮겨라');
const srv = vm.runInContext(tsSlice +
  '\n;({ GUARDIAN_BU, GUARDIAN_GRADE_BU, GUARDIAN_ADULT_WORDS, needsGuardian, BOARD_RULES_SINCE, boardRulesAccepted,' +
  ' boardDropBlocked, boardCountVisible, SERMON_REPORT_REASONS, SERMON_REPORT_LABELS, SERMON_REPORT_NOTE_MAX, SERMON_REPORT_ANSWER_MAX,' +
  ' SERMON_REPORT_KEEP_DAYS, sermonQuestionKey, sermonReportInput, sermonReportGroup, storeUid })', vm.createContext({}));

// ── 앱(app.js) 순수 구간 셋 ──
const appGuardian = vm.runInContext(
  cut(APP, '// ── 보호자 확인 — 순수 (여기부터) ──', '// ── 보호자 확인 — 순수 (여기까지) ──', 'app.js') +
  '\n;({ GUARDIAN_BU, GUARDIAN_GRADE_BU, GUARDIAN_ADULT_WORDS, needsGuardian,' +
  ' guardianRequired: typeof guardianRequired === "function" ? guardianRequired : undefined })', vm.createContext({}));
const appBoard = vm.runInContext(
  cut(APP, '// ── 게시판 규칙·가리기 — 순수 (여기부터) ──', '// ── 게시판 규칙·가리기 — 순수 (여기까지) ──', 'app.js') +
  '\n;({ BOARD_RULES_VER, BOARD_RULES, boardBlockErrorMsg })', vm.createContext({}));
const appAnswer = vm.runInContext(
  cut(APP, '// ── AI 답 알리기 — 순수 (여기부터) ──', '// ── AI 답 알리기 — 순수 (여기까지) ──', 'app.js') +
  '\n;({ SERMON_REPORT_REASONS, SERMON_REPORT_NOTE_MAX, sermonReportErrorMsg })', vm.createContext({}));

// 앱의 부서 목록(로그인 화면의 칩)
const BU_LIST = (() => {
  const m = APP.match(/const BU_LIST = \[([^\]]*)\]/);
  assert.ok(m, 'app.js 에서 BU_LIST 를 못 찾았다 — 이 검사가 낡았다');
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
})();

const UID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const UID2 = '11111111-2222-4333-8444-555555555555';

// ① 보호자 확인 ────────────────────────────────────────────────
test('보호자 확인 부서 — app.js 와 index.ts 의 목록이 글자까지 같다', () => {
  assert.deepEqual(J(appGuardian.GUARDIAN_BU), J(srv.GUARDIAN_BU));
  assert.deepEqual(J(appGuardian.GUARDIAN_GRADE_BU), J(srv.GUARDIAN_GRADE_BU));
  assert.deepEqual(J(appGuardian.GUARDIAN_ADULT_WORDS), J(srv.GUARDIAN_ADULT_WORDS));
});

test('보호자 확인 부서 — 모두 로그인 화면의 부서 목록(BU_LIST)에 있다', () => {
  for (const bu of [...J(srv.GUARDIAN_BU), ...Object.keys(J(srv.GUARDIAN_GRADE_BU))]) {
    assert.ok(BU_LIST.includes(bu), bu + ' 는 로그인 화면에 없는 부서다 — 이름이 바뀌었나?');
  }
});

const GRADES = ['', '1학년', '2학년', '3학년', '중1', '중2', '중3', '6학년', '3', '교사', '선생님', '부장', '1학년 교사'];
test('보호자 확인 — 앱과 서버가 모든 부서·학년에서 같은 답을 낸다', () => {
  for (const bu of [...BU_LIST, '소년부', '']) {
    for (const grade of GRADES) {
      const p = { type: '교회학교', bu, grade, name: '김믿음' };
      assert.equal(appGuardian.needsGuardian(p), srv.needsGuardian(p), bu + ' / ' + grade);
    }
  }
});

test('보호자 확인 — 어떤 분께 묻나(만 14세 미만이 있을 수 있는 부서)', () => {
  const ng = (bu, grade, type = '교회학교') => srv.needsGuardian({ type, bu, grade });
  for (const bu of ['영아부', '유아부', '유치부', '유년부', '초등부', '사랑부']) assert.equal(ng(bu, '3학년'), true, bu);
  assert.equal(ng('초등부', '6학년'), true);
  assert.equal(ng('중등부', '1학년'), true, '중1 은 만 12~13세');
  assert.equal(ng('중등부', '중2'), true, '중2 는 생일 전까지 만 13세');
  assert.equal(ng('중등부', '3학년'), false, '중3 은 3월에 이미 만 14세');
  assert.equal(ng('중등부', ''), true, '학년을 모르면 묻는다(보수 쪽)');
  assert.equal(ng('고등부', '1학년'), false);
  assert.equal(ng('청년부', ''), false);
  assert.equal(ng('초등부', '교사'), false, '그 부서 선생님은 어른');
  assert.equal(ng('유치부', '선생님'), false);
  assert.equal(ng('사랑', '3', '교구'), false, '교구는 묻지 않는다(교구 「사랑」은 사랑부가 아니다)');
  assert.equal(srv.needsGuardian(null), false);
  assert.equal(srv.needsGuardian({}), false);
  assert.equal(srv.needsGuardian({ type: '교회학교', bu: 'constructor', grade: '1' }), false, '프로토타입 이름에 속지 않는다');
});

test('보호자 확인 — 개인정보 안내 6항이 같은 부서를 말한다', () => {
  const p6 = textOf(cut(PRIVACY, '<h2 id="children">', '<h2>7. 문의</h2>', 'privacy/index.html'));
  for (const bu of J(srv.GUARDIAN_BU)) assert.ok(p6.includes(bu), 'privacy/ 6항에 ' + bu + ' 가 없다');
  assert.ok(p6.includes('중등부 1·2학년'), 'privacy/ 6항에 「중등부 1·2학년」이 없다');
  assert.ok(p6.includes('보호자(부모님)가 함께 확인했어요'), 'privacy/ 6항에 체크 문구가 없다');
  assert.ok(p6.includes('법정대리인'), 'privacy/ 6항에 법정대리인 동의가 없다');
});

test('보호자 확인 — 로그인 화면 · 확인 화면의 체크 문구가 주인이 정한 그대로다', () => {
  const entry = cut(APP, 'function renderEntryScreen(', '// 화면 1: 본인 기록 요약', 'app.js');
  assert.ok(entry.includes('보호자(부모님)가 함께 확인했어요'), '로그인 화면에 보호자 체크가 없다');
  assert.ok(/needsGuardian\(user\) && !document\.getElementById\("guardian-consent"\)\.checked/.test(entry),
    '로그인 화면이 체크 없이도 어린 부서를 들여보낸다');
  const gate = cut(APP, 'function renderGuardianCheck(', '// ------------------------------------------------------------', 'app.js');
  assert.ok(gate.includes('보호자(부모님)가 함께 확인했어요'));
  assert.ok(/required \? "" :/.test(gate), '새 로그인(required)인데도 「다음에」를 보여 준다');
});

test('보호자 확인 — 서버는 처음 한 번만 적고(이미 있으면 그대로), 체크가 없다고 로그인을 막지 않는다', () => {
  const login = cut(TS, 'async function login(b: any) {', '// ---------- app_config', 'index.ts');
  assert.ok(login.includes('b.guardian_ok === true'), 'login 이 guardian_ok 를 안 본다');
  assert.ok(login.includes('needsGuardian(user)'), 'login 이 서버 행(user)으로 부서를 판단하지 않는다');
  assert.ok(login.includes('.is("guardian_ok_at", null)'), '이미 있는 날짜를 덮어쓴다');
  assert.ok(!/return\s*\{\s*ok:\s*false[^}]*guardian/.test(login), 'login 이 보호자 체크 없다고 거절한다 — 옛 판 앱·아이폰 네이티브 로그인이 막힌다');
});

// 2026-10-01 검토 F2 — 아이폰 네이티브 로그인의 ?firstLogin=1 은 읽자마자 지워진다. 확인 화면에서 앱을 닫았다 열면
// fresh 가 거짓이 되어 「다음에 할게요」가 보였고, 누르면 guardian_ok 없이 login(= 모르는 이름이면 계정 만들기)까지 갔다.
const KID = { type: '교회학교', bu: '초등부', grade: '3학년', name: '김가짜' };
test('보호자 확인 — user_id 없는 어린이 부서 사용자는 「다음에」를 못 본다(fresh 가 거짓이어도)', () => {
  const req = appGuardian.guardianRequired;
  assert.equal(typeof req, 'function', 'app.js 보호자 순수 구간에 guardianRequired 가 없다');
  assert.equal(req(KID, false), true, 'user_id 가 없으면(서버 계정이 이 기기에 이어진 적 없음) 꼭 받아야 한다');
  assert.equal(req({ ...KID, user_id: '' }, false), true, '빈 user_id 도 없는 것이다');
  assert.equal(req({ ...KID, user_id: UID }, false), false, '이미 쓰시던 분(user_id 있음)은 「다음에」가 있다');
  assert.equal(req({ ...KID, user_id: UID }, true), true, '방금 로그인(fresh)이면 늘 꼭 받는다');
  assert.equal(req(null, false), true);

  const enter = cut(APP, 'async function enterAfterLogin(', '// 첫 로그인 축복 인사', 'app.js');
  const m = enter.match(/const (\w+) = guardianRequired\(loadUser\(\), !!\(opts && opts\.fresh\)\);/);
  assert.ok(m, 'enterAfterLogin 이 guardianRequired(loadUser(), fresh) 로 「꼭 받아야 하나」를 정하지 않는다');
  assert.ok(enter.includes('guardianPending(' + m[1] + ')'), 'guardianPending 에 같은 값을 넘기지 않는다');
  assert.ok(enter.includes('renderGuardianCheck(' + m[1] + ','), 'renderGuardianCheck 에 같은 값을 넘기지 않는다 — 「다음에」가 보인다');
  assert.ok(!/guardianPending\(!!\(opts && opts\.fresh\)\)/.test(enter), 'fresh 만 보고 묻는 옛 줄이 남아 있다');
});

test('보호자 확인 — 체크 전인 어린이 새 계정은 syncProgress 가 login(계정 만들기)을 부르지 않는다', () => {
  const sync = cut(APP, 'async function syncProgress(', 'function applyServerUser(', 'app.js');
  const g = sync.indexOf('if (needsGuardian(u) && !guardianOk(u) && guardianRequired(u, false)) return false;');
  assert.ok(g >= 0, 'syncProgress 에 보호자 확인 전 새 계정을 멈추는 줄이 없다 — 위젯·이벤트 주소처럼 enterAfterLogin 을 안 거친 「재확인」이 계정을 만든다');
  assert.ok(g < sync.indexOf('api.login('), '그 줄이 api.login 보다 뒤에 있다');
});

test('공용 기기 — 기록 지우기(clearPersonalData)가 보호자 확인·이용 규칙 기억도 지운다', () => {
  const clr = cut(APP, 'function clearPersonalData(', '// "사랑교구 3목장 김성도"', 'app.js');
  assert.ok(clr.includes('"guardian-"'), 'guardian-ok/guardian-later 를 안 지운다');
  assert.ok(clr.includes('"board-rules::"'), 'board-rules:: 를 안 지운다');
});

// ② 게시판 이용 규칙 ────────────────────────────────────────────
test('이용 규칙 날짜 — 앱 BOARD_RULES_VER 와 서버 BOARD_RULES_SINCE 가 같다', () => {
  assert.equal(appBoard.BOARD_RULES_VER, srv.BOARD_RULES_SINCE);
  assert.match(srv.BOARD_RULES_SINCE, /^\d{4}-\d{2}-\d{2}$/);
});

test('이용 규칙 — 하지 말 것(불쾌한 내용·행동)을 정의하고, 신고·가리기·공개를 알린다', () => {
  const t = textOf(J(appBoard.BOARD_RULES).join(' '));
  for (const w of ['욕설', '음란', '광고', '개인정보', '신고', '가리기', '공개']) assert.ok(t.includes(w), '규칙에 「' + w + '」가 없다');
});

test('boardRulesAccepted — 규칙 날짜(한국 시간 자정) 이후 동의만 「동의함」', () => {
  assert.equal(srv.boardRulesAccepted(null), false);
  assert.equal(srv.boardRulesAccepted(''), false);
  assert.equal(srv.boardRulesAccepted('not-a-date'), false);
  assert.equal(srv.boardRulesAccepted('2026-10-01T00:30:00+09:00'), true);
  assert.equal(srv.boardRulesAccepted('2026-09-30T23:59:00+09:00'), false);
  assert.equal(srv.boardRulesAccepted('2026-10-05T03:00:00.123456+00:00'), true);
});

test('글쓰기 문 — 관리자가 아니면 user_id 와 규칙 동의를 본다(boardPost · boardReply 둘 다)', () => {
  const gate = cut(TS, 'async function boardWriteGate(', 'async function boardPost(', 'index.ts');
  assert.ok(gate.includes('if (!adminError(b)) return null;'), '관리자 글을 막는다');
  assert.ok(gate.includes('"rules-needed"') && gate.includes('"no-user"'));
  const post = cut(TS, 'async function boardPost(', 'async function boardReply(', 'index.ts');
  const reply = cut(TS, 'async function boardReply(', 'async function boardDeleteMine(', 'index.ts');
  assert.ok(post.includes('await boardWriteGate(b)'), 'boardPost 가 규칙을 안 본다');
  assert.ok(reply.includes('await boardWriteGate(b)'), 'boardReply 가 규칙을 안 본다');
});

// ③ 가리기 ──────────────────────────────────────────────────────
const posts = [
  { id: 1, user_id: UID, name: '가' },
  { id: 2, user_id: UID2.toUpperCase(), name: '나' },
  { id: 3, name: '옛 글' },                       // user_id 없음(2026-08 이전)
];
const replies = [
  { id: 10, post_id: 1, user_id: UID2 },           // 가린 분이 남의 글에 단 답글
  { id: 11, post_id: 2, user_id: UID },            // 가린 분의 글에 달린 남의 답글 — 글과 함께 빠진다
  { id: 12, post_id: 3, user_id: UID },
  { id: 13, post_id: 1 },                          // 옛 답글
];

test('boardDropBlocked — 가린 분의 글·답글을 빼고, 그 글에 달린 답글도 함께 뺀다(대소문자 무시)', () => {
  const r = J(srv.boardDropBlocked(posts, replies, [UID2]));
  assert.deepEqual(r.posts.map((p) => p.id), [1, 3]);
  assert.deepEqual(r.replies.map((x) => x.id), [12, 13]);
});

test('boardDropBlocked — 가린 분이 없으면 그대로 · 옛 글은 가릴 수 없다 · 이상한 값에도 안 깨진다', () => {
  assert.deepEqual(J(srv.boardDropBlocked(posts, replies, [])).posts.length, 3);
  assert.deepEqual(J(srv.boardDropBlocked(posts, replies, null)).replies.length, 4);
  assert.deepEqual(J(srv.boardDropBlocked(null, undefined, [UID])), { posts: [], replies: [] });
  const r = J(srv.boardDropBlocked(posts, replies, [UID, UID2]));
  assert.deepEqual(r.posts.map((p) => p.id), [3], '옛 글(user_id 없음)은 남는다');
  assert.deepEqual(r.replies.map((x) => x.id), [], '남은 옛 글의 답글 중 가린 분의 것은 빠진다');
});

test('가리기 — 서버가 가린 분의 user_id 를 내보내지 않는다(목록 · 게시판)', () => {
  const list = cut(TS, 'async function boardBlocks(', 'async function boardUnblock(', 'index.ts');
  assert.ok(list.includes('.select("id,blocked_name,created_at")'), 'boardBlocks 가 정해진 칸 말고 더 고른다');
  assert.ok(!/blocked_id\s*[:,]/.test(list.split('.select(')[1] || ''), 'boardBlocks 응답에 blocked_id 가 실린다');
  const bl = cut(TS, 'async function boardList(', 'async function boardReactionMap(', 'index.ts');
  assert.ok(bl.includes('const { user_id, images, ...rest } = row;'), 'boardList 가 user_id 를 떼지 않는다');
  assert.ok(bl.includes('blockable: !!user_id'), 'blockable 을 참/거짓으로만 주지 않는다');
  assert.ok(!/blockedIds\s*[,}]/.test(bl.slice(bl.indexOf('return {'))), 'boardList 응답에 가린 분 목록이 실린다');
  const blk = cut(TS, 'async function boardBlock(', 'async function boardBlocks(', 'index.ts');
  assert.ok(!/return \{[^}]*[\s,{:]author\b/.test(blk), 'boardBlock 응답에 글쓴 분(author)이 실린다');   // 「no-author」 코드는 괜찮다
});

test('boardCountVisible — 첫 화면 「새글 N」이 게시판 목록과 같은 규칙으로 센다(가린 분 · 그분 글의 답글 · 옛 글)', () => {
  // 그 뒤 올라온 글 셋(가린 분 UID2 의 글 하나) · 새 답글이 달린 옛 글 둘(하나는 UID2 의 글) · 새 답글 넷
  const recent = [{ id: 21, user_id: UID }, { id: 22, user_id: UID2 }, { id: 23 }];
  const parents = [{ id: 5, user_id: UID2.toUpperCase() }, { id: 6, user_id: UID }];
  const fresh = [
    { id: 31, post_id: 21, user_id: UID },
    { id: 32, post_id: 22, user_id: UID },         // 가린 분의 새 글에 단 남의 답글 — 글과 함께 빠진다
    { id: 33, post_id: 5, user_id: UID },          // 가린 분의 옛 글에 단 남의 답글 — 빠진다
    { id: 34, post_id: 6, user_id: UID2 },         // 가린 분이 남의 옛 글에 단 답글 — 빠진다
  ];
  assert.equal(srv.boardCountVisible(recent, parents, fresh, [UID2]), 3, '글 21·23 + 답글 31');
  assert.equal(srv.boardCountVisible(recent, parents, fresh, []), 7, '가린 분이 없으면 예전 머릿수와 같다(글 3 + 답글 4)');
  // boardList 의 거르기와 같은 답 — 옛 글(parents)은 세지 않는다
  const kept = J(srv.boardDropBlocked(recent.concat(parents), fresh, [UID2]));
  assert.equal(srv.boardCountVisible(recent, parents, fresh, [UID2]),
    kept.posts.filter((p) => [21, 22, 23].includes(p.id)).length + kept.replies.length);
  assert.equal(srv.boardCountVisible(null, undefined, null, [UID]), 0, '이상한 값에도 안 깨진다');
});

test('boardCheck — 보는 분의 가린 분을 빼고 세고, 응답은 숫자 하나뿐 · 앱이 user_id 를 보낸다', () => {
  const chk = cut(TS, 'async function boardCheck(', '// ---------- 게시판 사진', 'index.ts');
  assert.ok(chk.includes('storeUid(b && b.user_id)') && chk.includes('boardBlockedIds(viewer)'), 'boardCheck 가 보는 분의 가린 분을 안 본다');
  assert.ok(chk.includes('boardCountVisible(recent, parents, replies, blocked)'), 'boardCheck 가 boardList 와 다른 규칙으로 센다');
  const rets = chk.match(/return \{[^}]*\}/g) || [];
  assert.ok(rets.length >= 2, 'boardCheck 의 return 을 못 찾았다 — 이 검사가 낡았다');
  for (const ret of rets) {
    assert.ok(/^return \{ ok: true, recent: /.test(ret), 'boardCheck 가 숫자 말고 더 싣는다: ' + ret);
  }
  const badge = cut(APP, 'async function fillBoardBadge(', '// 가을 말씀 동행', 'app.js');
  assert.ok(/api\.boardCheck\(seen \|\| undefined, uid \|\| undefined\)/.test(badge), '첫 화면 배지가 user_id 를 안 보낸다');
  assert.ok(badge.includes('c.uid === uid'), '배지 캐시가 사람마다가 아니다(공용 기기)');
  assert.ok(/boardCheck: \(since, user_id\) => supaCall\("boardCheck", \{ since, user_id \}\)/.test(read('js/api.js')), 'js/api.js boardCheck 가 user_id 를 안 싣는다');
});

test('boardBlockErrorMsg — 서버 코드를 그대로 보여 드리지 않는다', () => {
  const codes = ['no-user', 'own', 'admin', 'no-author', 'not-found', 'rules-needed', 'not-ready'];
  const fallback = appBoard.boardBlockErrorMsg('???');
  for (const c of codes) {
    const m = appBoard.boardBlockErrorMsg(c);
    assert.ok(m && !m.includes(c), c + ' 를 그대로 보여 준다');
    assert.notEqual(m, fallback, c + ' 가 기본 말로 떨어진다');
  }
  assert.match(fallback, /다시 해 주세요/);
});

// ④ AI 답 알리기 ─────────────────────────────────────────────────
const ASQL = read('supabase/sermon_answer_reports.sql');
test('AI 답 까닭 — 앱 · 서버 · DB CHECK 가 같고, 글씨도 같다', () => {
  const appCodes = J(appAnswer.SERMON_REPORT_REASONS).map((x) => x[0]);
  const srvCodes = J(srv.SERMON_REPORT_REASONS);
  const m = ASQL.match(/reason\s+text\s+not null\s+check\s*\(\s*reason\s+in\s*\(([^)]*)\)\s*\)/i);
  assert.ok(m, 'sermon_answer_reports.sql 에서 reason CHECK 를 못 찾았다');
  const sqlCodes = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  assert.deepEqual([...appCodes].sort(), [...srvCodes].sort());
  assert.deepEqual([...sqlCodes].sort(), [...srvCodes].sort());
  const labels = J(srv.SERMON_REPORT_LABELS);
  for (const [code, label] of J(appAnswer.SERMON_REPORT_REASONS)) assert.equal(labels[code], label, code);
});

test('AI 답 길이·보관 — 덧붙인 말 200 · 답 1200 · 90일이 앱 · 서버 · SQL · 개인정보 안내에서 같다', () => {
  assert.equal(appAnswer.SERMON_REPORT_NOTE_MAX, srv.SERMON_REPORT_NOTE_MAX);
  assert.equal(Number((ASQL.match(/char_length\(note\)\s*<=\s*(\d+)/) || [])[1]), srv.SERMON_REPORT_NOTE_MAX);
  assert.equal(Number((ASQL.match(/char_length\(answer\)\s+between\s+1\s+and\s+(\d+)/) || [])[1]), srv.SERMON_REPORT_ANSWER_MAX);
  const days = srv.SERMON_REPORT_KEEP_DAYS;
  assert.match(ASQL, new RegExp("resolved_at < now\\(\\) - interval '" + days + " days'"));
  const p3 = textOf(cut(PRIVACY, '<h2>3. 얼마나 보관하나</h2>', '<h2>4. 누가 볼 수 있나</h2>', 'privacy/index.html'));
  assert.ok(p3.includes('AI 답 알림') && p3.includes(days + '일 뒤 저절로 지워집니다'), 'privacy/ 3항에 AI 답 알림 보관이 없다');
  const priv = cut(APP, 'function renderPrivacyInfo(', 'function renderHelp(', 'app.js');
  assert.ok(textOf(priv).includes('AI 답 알림') && textOf(priv).includes(days + '일 뒤'), '앱 개인정보 화면에 AI 답 알림 보관이 없다');
});

test('sermonQuestionKey — sermonChat 캐시 열쇠와 같은 함수 · 예전 식과 같은 값', () => {
  const chat = cut(TS, 'async function sermonChat(b: any) {', '// ---------- sermonSummary', 'index.ts');
  assert.ok(chat.includes('const qkey = sermonQuestionKey(message);'), 'sermonChat 이 같은 열쇠 함수를 안 쓴다 — 알린 답·답 지우기가 엇나간다');
  const old = (m) => String(m).trim().replace(/\s+/g, ' ').slice(0, 500);
  for (const q of ['  용서에 대해\n 목사님이   뭐라고 하셨나요? ', '가'.repeat(700), '']) assert.equal(srv.sermonQuestionKey(q), old(q));
  assert.equal(srv.sermonQuestionKey(null), '');
});

test('sermonReportInput — 신원·까닭·질문을 확인하고, 답·덧붙인 말을 자른다', () => {
  assert.equal(srv.sermonReportInput({}).error, 'no-user');
  assert.equal(srv.sermonReportInput({ user_id: 'abc', reason: 'wrong', question: 'q' }).error, 'no-user');
  assert.equal(srv.sermonReportInput({ user_id: UID, reason: 'nope', question: 'q' }).error, 'bad-reason');
  assert.equal(srv.sermonReportInput({ user_id: UID, reason: '기타', question: 'q' }).error, 'bad-reason', '라벨 글씨는 안 받는다');
  assert.equal(srv.sermonReportInput({ user_id: UID, reason: 'wrong', question: '   ' }).error, 'bad-args');
  const v = J(srv.sermonReportInput({ user_id: UID.toUpperCase(), reason: 'other', question: ' 질문 ', answer: '😀'.repeat(1300), note: '  덧붙임\n\n말 ' }));
  assert.equal(v.userId, UID);
  assert.equal(v.question, '질문');
  assert.equal(Array.from(v.answer).length, 1200);
  assert.equal(v.note, '덧붙임 말');
  assert.equal(J(srv.sermonReportInput({ user_id: UID, reason: 'wrong', question: 'q', note: '  ' })).note, null);
});

test('sermonReportGroup — 질문 하나당 한 묶음 · 서버가 준 답을 앞세움 · 알린 분이 새지 않는다', () => {
  const rows = [
    { id: 1, question: 'Q1', answer: '앱 글', from_cache: false, reason: 'wrong', note: '틀려요', created_at: '2026-10-01T01:00:00Z', reporter_id: UID },
    { id: 2, question: 'Q1', answer: '서버 답', from_cache: true, reason: 'offensive', note: null, created_at: '2026-10-01T03:00:00Z', reporter_id: UID2 },
    { id: 3, question: 'Q2', answer: 'A2', from_cache: true, reason: 'other', note: null, created_at: '2026-10-01T05:00:00Z', user_id: UID },
  ];
  const g = J(srv.sermonReportGroup(rows));
  assert.deepEqual(g.map((x) => x.question), ['Q1', 'Q2']);
  assert.equal(g[0].count, 2);
  assert.equal(g[0].answer, '서버 답');
  assert.equal(g[0].from_cache, true);
  assert.equal(g[0].id, 2, '대표 번호는 가장 최근 알림');
  assert.deepEqual(g[0].reasons, { wrong: 1, offensive: 1 });
  const out = JSON.stringify(g);
  assert.ok(!out.includes('reporter') && !out.includes('user_id') && !out.includes(UID) && !out.includes(UID2), '알린 분이 묶음에 실렸다');
  assert.deepEqual(J(srv.sermonReportGroup(null)), []);
});

test('AI 답 알림 — 관리자 목록도 reporter_id 를 고르지 않는다', () => {
  const list = cut(TS, 'async function sermonAnswerReports(', 'async function sermonAnswerReportResolve(', 'index.ts');
  const sel = (list.match(/\.select\("([^"]*)"\)/) || [])[1] || '';
  assert.ok(sel && !sel.includes('reporter'), '관리자 목록이 reporter_id 를 고른다: ' + sel);
});

test('sermonReportErrorMsg — 서버 코드를 그대로 보여 드리지 않는다', () => {
  const fallback = appAnswer.sermonReportErrorMsg('???');
  for (const c of ['no-user', 'bad-reason', 'bad-args', 'not-ready']) {
    const m = appAnswer.sermonReportErrorMsg(c);
    assert.ok(m && !m.includes(c), c);
    assert.notEqual(m, fallback, c);
  }
});

// ⑤ 개인정보 — 세 곳이 같은 것을 말하나 ─────────────────────────
// 「새로 모으기 시작한 것은 privacy/ 와 앱 안 두 곳에 같은 날」(CLAUDE.md 「개인정보」). 하나라도 빠지면 배포가 멈춘다.
const PRIVACY_ITEMS = {
  '열람 기록': ['열람 기록'],
  '공감 · 순위 응원': ['공감', '순위 응원'],
  '이벤트 신청': ['이벤트 신청'],
  '음성 인식(소리는 서버로 안 온다)': ['음성 인식'],
  '게시판 이용 규칙 동의': ['이용 규칙'],
  '가린 분 목록': ['가린 분'],
  'AI 답 알림': ['AI 답 알림'],
  '보호자 확인': ['보호자(부모님)가 함께 확인했어요'],
  '마지막 접속 시각(users.last_seen_at — 2026-10-01 검토 F3)': ['마지막 접속 시각'],
  '유튜브 — API 서비스': ['YouTube API 서비스'],
  '유튜브 — 약관 동의 문장': ['YouTube 서비스 약관에 동의'],
  '유튜브 — 제3자 광고': ['광고를 보여 줄 수 있'],
  '유튜브 — 기기에 정보 저장·읽기': ['정보를 저장하거나 읽'],
};
const PRIVACY_LINKS = ['https://www.youtube.com/t/terms', 'https://policies.google.com/privacy'];

function privacySpots() {
  const priv = cut(APP, 'function renderPrivacyInfo(', 'function renderHelp(', 'app.js');
  const help = APP.slice(APP.indexOf('function renderHelp('));
  const s = help.indexOf('🔒 개인정보 안내');
  assert.ok(s >= 0, 'renderHelp 에서 「🔒 개인정보 안내」를 못 찾았다');
  const helpPriv = help.slice(s, help.indexOf('</section>', s));
  return { 'privacy/index.html': PRIVACY, 'renderPrivacyInfo': priv, 'renderHelp 🔒': helpPriv };
}

test('개인정보 — 새로 모으는 것 · 유튜브 문구가 privacy/ 와 앱 안 두 곳에 모두 있다', () => {
  const spots = privacySpots();
  for (const [where, raw] of Object.entries(spots)) {
    const t = textOf(raw);
    for (const [item, words] of Object.entries(PRIVACY_ITEMS)) {
      for (const w of words) assert.ok(t.includes(w), where + ' 에 「' + item + '」(' + w + ')가 없다');
    }
    for (const href of PRIVACY_LINKS) assert.ok(raw.includes('href="' + href + '"'), where + ' 에 링크 ' + href + ' 가 없다');
  }
});

// 2026-10-01 검토 F3 — 서버가 바깥으로 부르는 주소가 방침 2항 「아래 서비스가 기능 수행에 관여」 표에 다 있는가.
// Voyage AI(질문 글 → 설교 검색용 숫자)와 Resend(주간 보고 메일 — 참여자 이름·소속)가 빠져 있었다.
// 새 주소가 생기면 여기서 멈춘다: 성도님 정보가 가면 2항 표에 한 줄 + OUTBOUND_IN_POLICY,
// 안 가면 OUTBOUND_NO_MEMBER_DATA 에 까닭과 함께. (웹 푸시 주소는 기기마다 달라 코드에 글자로 없다 — 표의 「Google / Apple 푸시」)
const OUTBOUND_IN_POLICY = {
  'api.anthropic.com': { name: 'Anthropic', sends: '질문 글' },
  'api.voyageai.com': { name: 'Voyage AI', sends: '질문 글' },
  'api.resend.com': { name: 'Resend', sends: '이름·소속' },
  'api.push.apple.com': { name: 'Apple 푸시', sends: '알림 등록 정보' },
};
const OUTBOUND_NO_MEMBER_DATA = {
  'gocheok.onlybible.kr': '우리 주소(알림에 싣는 링크 글자)',
  'esm.sh': '서버 모듈을 받아 오는 곳(import)',
  'www.youtube.com': '설교 영상 주소 글자(요청이 아니다)',
  'generativelanguage.googleapis.com': '말씀 그림(담당자 전용 · contentError) — 구절과 담당자가 쓴 장면만',
  'api.github.com': '설교 올리기 워크플로 깨우기(담당자 전용) — 작업 번호만',
};
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
test('개인정보 2항 — 서버가 성도님 정보를 보내는 바깥 서비스가 표에 모두 있고, 무엇이 가는지도 적혀 있다', () => {
  const p2raw = cut(PRIVACY, '<h2>2. 어디에 보관하나</h2>', '<h2>3. 얼마나 보관하나</h2>', 'privacy/index.html');
  const rows = [...p2raw.matchAll(/<tr>[\s\S]*?<\/tr>/g)].map((x) => textOf(x[0]));
  const hosts = new Set([...TS.matchAll(/https:\/\/([a-z0-9.-]+)/gi)].map((x) => x[1].toLowerCase()));
  for (const h of hosts) {
    if (own(OUTBOUND_NO_MEMBER_DATA, h)) continue;
    assert.ok(own(OUTBOUND_IN_POLICY, h), 'index.ts 가 새 바깥 주소 ' + h + ' 를 부른다 — 성도님 정보가 가면 privacy/ 2항 표에 적고 ' +
      'OUTBOUND_IN_POLICY 에, 안 가면 OUTBOUND_NO_MEMBER_DATA 에 까닭과 함께 더하라');
    const { name, sends } = OUTBOUND_IN_POLICY[h];
    const row = rows.find((r) => r.includes(name));
    assert.ok(row, 'privacy/ 2항 표에 ' + name + '(' + h + ') 줄이 없다');
    assert.ok(row.includes(sends), 'privacy/ 2항 ' + name + ' 줄에 전달되는 것(' + sends + ')이 없다: ' + row);
  }
  assert.ok(rows.find((r) => r.includes('Resend')).includes('운영진'), 'Resend 줄이 운영진에게만 가는 메일이라는 것을 안 적었다');
});

test('개인정보 5항 — 「지워지는 것」에 빠진 것이 없다', () => {
  const p5 = textOf(cut(PRIVACY, '<h3 class="sub-h">삭제하면 무엇이 지워지고', '<h2 id="children">', 'privacy/index.html'));
  for (const w of ['게시판 글', '사진', '공감', '순위 응원', '게시판 신고', '가린 분 목록', '이용 규칙 동의',
    '질문 기록', 'AI 답 알림', '열람 기록', '이벤트 신청', '사역 신청', '보호자 확인', '알림 등록 정보', '성경필사']) {
    assert.ok(p5.includes(w), 'privacy/ 5항 「지워지는 것」에 「' + w + '」가 없다');
  }
});

// ⑥ 새 표의 잠금 · 스토어 문구 ───────────────────────────────────
test('새 표 — RLS 를 켜고 anon·authenticated 를 둘 다(표·시퀀스) revoke 한다', () => {
  for (const [file, table] of [['supabase/board_blocks.sql', 'board_blocks'], ['supabase/sermon_answer_reports.sql', 'sermon_answer_reports']]) {
    const sql = read(file);
    assert.match(sql, new RegExp('alter table public\\.' + table + ' enable row level security'), file + ' RLS');
    assert.match(sql, new RegExp('revoke all on public\\.' + table + ' from public, anon, authenticated'), file + ' revoke 표');
    assert.match(sql, new RegExp('revoke all on sequence public\\.' + table + '_id_seq from public, anon, authenticated'), file + ' revoke 시퀀스');
    assert.ok(!/to authenticated/i.test(sql.replace(/--.*$/mg, '')), file + ' 이 authenticated 에게 연다');
  }
  const cons = read('supabase/users_consents.sql').replace(/--.*$/mg, '');
  assert.ok(!/\b(grant|revoke|create policy)\b/i.test(cons), 'users_consents.sql 이 공용 users 표의 권한을 건드린다(교회 어드민이 같은 프로젝트를 쓴다)');
});

test('스토어 문구 — 사실이 아닌 한 줄과 거부되는 「1목장」이 없다', () => {
  for (const f of ['자료/store/listing-ko.txt', '자료/store/listing-ios-ko.txt']) {
    const t = read(f);
    assert.ok(!t.includes('본인 진도와 도전 순위에만 쓰입니다'), f + ' 에 사실이 아닌 문장이 남아 있다');
    assert.ok(!/\d+목장/.test(t), f + ' 의 심사자 안내에 「N목장」이 있다 — 목장 칸은 숫자만 받는다(MOK_RE)');
  }
  const ko = read('자료/store/listing-ko.txt');
  assert.ok(ko.includes('위 개인정보 수집·이용 안내를 확인하고 동의합니다'), 'listing-ko.txt 심사자 안내에 동의 체크칸이 없다');
});
