// 기록 합치기가 「사용자를 가리키는 표」를 다 아는가 — 글자만 보는 검사 (2026-10-01).
//
//   node --test tests/member-merge-coverage.test.cjs
//
// ⚠️ **꾸러미를 하나도 쓰지 않는다**(node:test·node:assert·node:fs·node:path 뿐).
//    그래서 tools/preflight.py 가 이 검사를 배포 앞 그물에 건다 — require('@electric-sql/pglite') 같은 줄을
//    더하는 순간 배포가 통째로 멈춘다. 실제로 합쳐 보는 검사는 tests/member-merge.test.cjs(PGlite)다.
//
// 왜: supabase/member_merge.sql 의 합치기(admin_merge_members)는 users 를 가리키는 **모르는 표**에
//     원본 계정의 줄이 있으면 merge-unsupported-records 로 멈춘다(기록은 안 잃는다 — 일부러 그렇게 만들었다).
//     그런데 새 표를 만든 세션이 합치기를 모르면, 그 기능을 한 번이라도 쓴 계정은 **조용히** 합칠 수 없게 된다.
//     2026-10-01 가리기·게시판 신고·AI 답 알림이 그랬고, 감사해 보니 ios_push_tokens(2026-09-15)도 그랬다.
//
// 무엇을 보나 — supabase/*.sql 에서 users 를 가리키는 표를 찾는다
//   (`references users(id)` 칸 · 이름이 `…user_id` 인 칸 · `alter table … add column … user_id`):
//   ① 그 표가 합치기 본체에 나오는가(옮기거나 다루는가) — 허용 목록 셋은 빼고 센다(목록에만 넣으면 옮긴 게 아니다)
//   ② users FK 가 있으면 FK 허용 목록(또는 FK 제외 목록)에 있는가
//   ③ `user_id` 칸이 있으면 user_id 허용 목록에 있는가
//   ④ 아래 KNOWN_GAPS(알고 있는 빈틈)는 **정말 아직 빈틈인가** — 고쳤으면 목록에서 빼라고 알려 준다.
//
// 걸리면: member_merge.sql 에 그 표의 옮기기 · 두 허용 목록 · member_merge_counts · 쓰기 연결 트리거를 더하고
//   tests/member-merge.test.cjs 에 실제로 합쳐 보는 경우를 더한다(member_merge.sql 머리 「실행 순서」).
//   지금 옮길 수 없으면 KNOWN_GAPS 에 까닭과 함께 적는다 — 그 기능을 쓴 계정은 합치기가 멈춘다는 뜻이다.
// ⚠️ 교회 어드민 저장소(c:\Projects\church-admin\supabase\sql)의 표는 여기서 못 본다 — 같은 DB 라 합치기는 그 표도
//    본다(정정 신청 ministry_history_requests.user_id). docs/member-profile-admin.md 「알고 있는 멈춤」에 적어 둔다.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

// 알고 있는 빈틈 — 합치기가 이 표의 원본 줄을 보면 멈춘다. 고치면 이 줄을 지운다(④가 알려 준다).
const KNOWN_GAPS = {
  ios_push_tokens: '아이폰 앱 알림(APNs) 기기 — 2026-09-15 부터. 알림을 켠 아이폰 계정을 「옮겨 가는 쪽」으로 합치면 멈춘다. '
    + '고칠 때: user_id 를 남는 번호로(device_token 은 unique 라 겹침 없음) · 두 허용 목록 · counts · 트리거.',
};

const strip = (sql) => sql.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');

function userTables() {
  const found = {};   // 표 → { fk:Set, userId:boolean, where:Set }
  const add = (t, f, col, fk) => {
    const e = (found[t] = found[t] || { fk: new Set(), userId: false, where: new Set() });
    e.where.add(f);
    if (fk) e.fk.add(col);
    if (col === 'user_id') e.userId = true;
  };
  const dir = path.join(root, 'supabase');
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.sql'))) {
    const src = strip(fs.readFileSync(path.join(dir, f), 'utf8'));
    for (const m of src.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]*)\s*\(([\s\S]*?)\n\s*\)\s*;/gi)) {
      for (const line of m[2].split('\n')) {
        const col = (line.trim().match(/^([a-z_][a-z0-9_]*)\s/i) || [])[1];
        if (!col) continue;
        const fk = /references\s+(?:public\.)?users\s*\(/i.test(line);
        if (fk || /user_id$/i.test(col)) add(m[1], f, col.toLowerCase(), fk);
      }
    }
    for (const m of src.matchAll(/alter\s+table\s+(?:public\.)?([a-z_][a-z0-9_]*)\s+add\s+column\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*)\s+([^;,\n]*)/gi)) {
      const fk = /references\s+(?:public\.)?users\s*\(/i.test(m[3]);
      if (fk || /user_id$/i.test(m[2])) add(m[1], f, m[2].toLowerCase(), fk);
    }
  }
  return found;
}

const merge = strip(read('supabase/member_merge.sql'));
const bodyStart = merge.indexOf('create or replace function public.admin_merge_members');
assert.ok(bodyStart >= 0, 'member_merge.sql 에서 admin_merge_members 를 못 찾았다 — 이 검사가 낡았다');
const body = merge.slice(bodyStart, merge.indexOf('$$;', bodyStart));
const listAfter = (marker, end) => {
  const s = body.indexOf(marker);
  assert.ok(s >= 0, 'member_merge.sql 에서 「' + marker + '」를 못 찾았다 — 이 검사가 낡았다');
  return new Set([...body.slice(s, body.indexOf(end, s)).matchAll(/'(?:public\.)?([a-z_][a-z0-9_]*)'/g)].map((x) => x[1]));
};
const fkExcluded = listAfter('c.conrelid not in', 'loop');
const fkAllowed = listAfter('ref.tbl::text not in', 'then');
const userIdAllowed = listAfter('c.table_name not in', 'loop');
// ①은 허용 목록 **밖**에서 찾는다 — 목록 셋을 잘라 낸 본체(옮기는 자리)만 본다.
//   목록에 이름만 넣고 옮기지 않으면 merge-unsupported-records 멈춤만 사라지고, users FK 가 on delete cascade 인 표
//   (ios_push_tokens 등)의 원본 줄은 마지막 `delete from public.users where id=s.id` 에 **조용히 함께 지워진다.**
//   (2026-10-01 검토: 목록까지 본체로 셌더니 두 목록에만 넣은 ios_push_tokens 를 ③이 「이제 다룬다」고 했고,
//    그 말대로 KNOWN_GAPS 를 비우면 넷 다 통과했다.) 옮기는 목록(`table_name in (…)`)과 `public.X` 문은 자르지 않는다.
const cut = (x, marker, end) => {
  const a = x.indexOf(marker);
  const b = a < 0 ? -1 : x.indexOf(end, a);
  assert.ok(a >= 0 && b >= 0, 'member_merge.sql 에서 「' + marker + '」 목록을 못 잘라 냈다 — 이 검사가 낡았다');
  return x.slice(0, a) + x.slice(b);
};
const moveBodyOf = (b) => cut(cut(cut(b, 'c.conrelid not in', 'loop'), 'ref.tbl::text not in', 'then'), 'c.table_name not in', 'loop');
const mentionedIn = (src) => (t) => new RegExp("'" + t + "'|public\\." + t + '\\b').test(src);
const mentioned = mentionedIn(moveBodyOf(body));

const tables = userTables();

test('허용 목록에만 적힌 표는 「옮긴다」로 세지 않는다 — 목록에만 넣으면 멈춤이 사라지고 줄은 cascade 로 지워진다', () => {
  const t = 'zz_listed_only';
  const injected = body
    .replace(/(c\.conrelid not in\s*\()/, "$1'public." + t + "'::regclass,")
    .replace(/(ref\.tbl::text not in\s*\()/, "$1'" + t + "',")
    .replace(/(c\.table_name not in\s*\()/, "$1'" + t + "',");
  assert.equal(injected.split(t).length - 1, 3, '세 목록에 이름을 넣지 못했다 — 이 검사가 낡았다');
  assert.equal(mentionedIn(moveBodyOf(injected))(t), false,
    '목록에만 있는 표를 「합치기 본체에 나온다」로 셌다 — ②가 빈틈을 놓치고 ③이 「다룬다」고 잘못 말한다');
  // 옮기는 자리는 그대로 찾는다(잘라 낸 범위가 넓지 않나) — insert·delete 문 · 옮기는 목록(table_name in)
  //   (2026-10-01 세 표는 ⑤가 따로 본다 — 여기는 그 전부터 옮기던 표만 써서 이 검사 자체만 시험한다)
  for (const m of ['progress', 'rank_cheers', 'challenge_log', 'user_identity_aliases'])
    assert.ok(mentioned(m), m + ' 는 합치기가 옮기는데 못 찾았다 — 잘라 낸 범위가 넓다');
  assert.match(moveBodyOf(body), /table_name in \('challenge_log'/, '옮기는 목록(table_name in)까지 잘라 냈다 — 잘라 낸 범위가 넓다');
});

test('사용자를 가리키는 표를 찾는다(검사 자체가 낡지 않았나)', () => {
  for (const t of ['progress', 'challenge_log', 'board_posts', 'board_blocks', 'board_reports', 'sermon_answer_reports', 'rank_cheers'])
    assert.ok(tables[t], t + ' 를 못 찾았다 — supabase/*.sql 을 읽는 방식이 낡았다');
  assert.ok(fkAllowed.has('progress') && userIdAllowed.has('daily_activity') && fkExcluded.has('user_merges'),
    'member_merge.sql 의 허용 목록을 못 읽었다 — 이 검사가 낡았다');
});

test('합치기가 사용자를 가리키는 표를 모두 안다 — 모르면 그 기능을 쓴 계정은 합칠 수 없다', () => {
  const missing = [];
  for (const [t, e] of Object.entries(tables)) {
    if (KNOWN_GAPS[t]) continue;
    const where = [...e.where].join(', ');
    if (!mentioned(t)) missing.push(`${t}(${where}) — 합치기 본체에 없다(옮기지 않는다)`);
    if (e.fk.size && !fkAllowed.has(t) && !fkExcluded.has(t))
      missing.push(`${t}(${where}) — users FK(${[...e.fk].join('·')})가 FK 허용 목록에 없다 → merge-unsupported-records`);
    if (e.userId && !userIdAllowed.has(t) && t !== 'user_merges')
      missing.push(`${t}(${where}) — user_id 칸이 user_id 허용 목록에 없다 → merge-unsupported-records`);
  }
  assert.deepEqual(missing, [], '\n  ' + missing.join('\n  ')
    + '\n  → supabase/member_merge.sql 머리 「실행 순서」의 ⚠️ 넷을 더하거나, 이 검사의 KNOWN_GAPS 에 까닭과 함께 적을 것');
});

test('알고 있는 빈틈은 정말 아직 빈틈이다 — 고쳤으면 KNOWN_GAPS 에서 지울 것', () => {
  for (const t of Object.keys(KNOWN_GAPS)) {
    assert.ok(tables[t], `KNOWN_GAPS 의 ${t} 가 supabase/*.sql 에 없다 — 표를 지웠으면 목록에서도 지울 것`);
    const handled = mentioned(t) && (!tables[t].fk.size || fkAllowed.has(t)) && (!tables[t].userId || userIdAllowed.has(t));
    assert.equal(handled, false, `${t} 는 이제 합치기가 다룬다 — KNOWN_GAPS 에서 지울 것`);
  }
});

test('2026-10-01 세 표 · 동의 날짜 — 옮기기 · 허용 목록 · 기록 수 · 쓰기 연결 트리거', () => {
  for (const t of ['board_blocks', 'board_reports', 'sermon_answer_reports']) {
    assert.ok(fkAllowed.has(t) && userIdAllowed.has(t), t + ' 가 두 허용 목록에 다 있어야 한다');
    assert.match(merge, new RegExp("jsonb_build_object\\('" + t + "'"), t + ' 가 member_merge_counts 에 있어야 한다(미리보기에 보인다)');
    assert.match(merge, new RegExp('create trigger redirect_merged_member_write[^;]*' + (t === 'board_blocks' ? 'public\\.board_blocks' : "%I") ), t + ' 쓰기 연결 트리거');
  }
  assert.match(merge, /array\['board_reports','sermon_answer_reports'\][\s\S]*?redirect_merged_member_write\(''reporter_id''\)/, '신고 두 표의 트리거는 reporter_id 를 본다');
  assert.match(merge, /redirect_merged_member_write\('blocker_id','blocked_id'\)/, '가리기 트리거는 두 칸을 본다');
  assert.match(body, /not \(blocker_id in \(s\.id,t\.id\) and blocked_id in \(s\.id,t\.id\)\)/, '두 계정 사이의 가리기 줄은 옮기지 않는다(자기 자신을 가리게 된다)');
  assert.match(body, /on conflict\(blocker_id,blocked_id\) do nothing/, '같은 분을 둘 다 가렸으면 남는 쪽 줄 하나');
  assert.match(body, /update public\.board_reports set reporter_id=t\.id where reporter_id=s\.id/, '신고는 줄 번호를 지킨 채 옮긴다');
  assert.match(body, /update public\.sermon_answer_reports set reporter_id=t\.id where reporter_id=s\.id/, 'AI 답 알림도 줄 번호를 지킨 채');
  assert.match(body, /guardian_ok_at=coalesce\(u\.guardian_ok_at,s\.guardian_ok_at\)/, '보호자 확인은 남는 쪽 우선');
  assert.match(body, /board_rules_at=greatest\(u\.board_rules_at,s\.board_rules_at\)/, '규칙 동의는 더 늦은 날짜');
  // 권한 줄은 그대로 — 공개 역할에 열지 않는다(운영 카카오 로그인: authenticated = 누구나)
  assert.doesNotMatch(merge, /to\s+(anon|authenticated)\b/i, 'member_merge.sql 이 anon·authenticated 에게 무엇을 열면 안 된다');
  for (const f of ['member_merge_counts(uuid)', 'admin_preview_member_merge(uuid,text,text)', 'admin_merge_members(uuid,uuid,text,text,text)'])
    assert.ok(merge.includes('revoke all on function public.' + f + ' from public,anon,authenticated'), f + ' 의 revoke 줄');
});
