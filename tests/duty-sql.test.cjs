// 봉사 당번 SQL — 글자만 보는 검사(2026-10-06 · 설계 docs/superpowers/specs/2026-10-06-duty-roster-design.md §4·§12).
//
//   node --test tests/duty-sql.test.cjs
//
// ⚠️ **꾸러미를 하나도 쓰지 않는다**(node:test·node:assert·node:fs·node:path 뿐) — tools/preflight.py 가 배포 앞 그물에 건다.
// 왜: duty_* 함수는 security definer 라 표의 RLS 를 지나간다. revoke 를 한 함수라도 빠뜨리면 앱에 든 공개 키로
//     /rest/v1/rpc/duty_apply(p_staff = true) 를 바로 부를 수 있고, 교회 어드민의 check-authenticated-exposure.sql 은
//     anon·authenticated 둘 다 열린 함수를 잡지 못한다(차등 점검). 함수를 더하거나 인자를 바꿀 때 이 검사가 권한 줄을 함께 고치게 한다.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const raw = fs.readFileSync(path.join(root, 'supabase', 'duty.sql'), 'utf8');
// 줄 끝이 CRLF 여도 주석을 뗀다(member-merge-coverage 와 같은 까닭)
const sql = raw.split(/\r?\n/).map((l) => l.replace(/--.*$/, '')).join('\n');

const TABLES = ['duty_boards', 'duty_lines', 'duty_days', 'duty_slots', 'duty_signups', 'duty_notify_log'];
const fnNames = [...sql.matchAll(/create or replace function public\.(duty_[a-z_]+)\s*\(/g)].map((m) => m[1]);

test('표 여섯 — 만든 자리에서 RLS 를 켜고 공개 역할 권한을 뺀다', () => {
  const made = [...sql.matchAll(/create table if not exists public\.(duty_[a-z_]+)/g)].map((m) => m[1]);
  assert.deepEqual(made.sort(), [...TABLES].sort(), '표 목록이 달라졌다 — 이 검사의 TABLES 와 파일 끝 확인 질의를 함께 고칠 것');
  for (const t of TABLES) {
    assert.match(sql, new RegExp('alter table public\\.' + t + '\\s+enable row level security'), t + ' — RLS');
  }
  const rv = sql.match(/revoke all on ((?:public\.duty_[a-z_]+,?\s*)+) from public, anon, authenticated;/);
  assert.ok(rv, '표 revoke 줄(public, anon, authenticated)');
  for (const t of TABLES) assert.ok(rv[1].includes('public.' + t), t + ' — revoke 줄에 없다');
  for (const s of ['duty_lines_id_seq', 'duty_slots_id_seq', 'duty_signups_id_seq']) {
    assert.match(sql, new RegExp('revoke all on sequence[^;]*public\\.' + s + '[^;]*from public, anon, authenticated;'), s + ' — 시퀀스 revoke');
  }
});

test('함수마다 revoke(public·anon·authenticated) + service_role 에만 grant', () => {
  assert.ok(fnNames.length >= 20, '함수를 못 찾았다 — 이 검사가 낡았다');
  assert.equal(new Set(fnNames).size, fnNames.length, '같은 이름의 함수가 둘 — 인자를 바꿨으면 옛 서명을 drop 할 것(권한 줄도 서명마다)');
  for (const f of fnNames) {
    assert.match(sql, new RegExp('revoke all on function public\\.' + f + '\\([^;]*\\) from public, anon, authenticated;'), f + ' — revoke 줄이 없다');
    assert.match(sql, new RegExp('grant execute on function public\\.' + f + '\\([^;]*\\) to service_role;'), f + ' — service_role grant 줄이 없다');
  }
  const revoked = [...sql.matchAll(/revoke all on function public\.(duty_[a-z_]+)\(/g)].map((m) => m[1]);
  assert.deepEqual(revoked.sort(), [...fnNames].sort(), '권한 줄과 함수 목록이 다르다(지운 함수의 권한 줄이 남았거나 그 반대)');
});

test('공개 역할에 여는 줄 · 뷰 · 줄을 돌려주는 함수가 없다', () => {
  assert.doesNotMatch(sql, /\bto\s+(anon|authenticated|public)\b/i, 'anon·authenticated·public 에게 무엇도 열지 않는다');
  assert.doesNotMatch(sql, /create\s+(or\s+replace\s+)?view/i, '뷰는 RLS 대상이 아니다 — duty_*_view 는 함수다');
  assert.doesNotMatch(sql, /returns\s+(table|setof)\b/i, '줄을 돌려주는 함수는 PostgREST 가 1,000줄에서 자른다 — jsonb 하나·bigint[] 하나로');
});

test('쓰는 함수는 security definer + search_path 고정', () => {
  for (const m of sql.matchAll(/create or replace function public\.(duty_[a-z_]+)\s*\([\s\S]*?\bas \$\$/g)) {
    const head = m[0];
    assert.match(head, /set search_path = public/, m[1] + ' — search_path 고정');
    if (/language plpgsql/.test(head)) assert.match(head, /security definer/, m[1] + ' — security definer');
  }
});

test('잠기는 시각(전날 19:00)은 duty_cutoff 한 곳에만 있다', () => {
  assert.equal((sql.match(/19:00/g) || []).length, 1, '19:00 이 한 곳이 아니다 — 크론·화면·다른 함수에 따로 적지 말 것');
  assert.match(sql, /function public\.duty_cutoff\(p_date date\)[\s\S]*?\(\(p_date - 1\) \+ time '19:00'\) at time zone 'Asia\/Seoul'/);
});

test('담당자 길 인자는 null 이 새지 않게 다듬는다 · 본인 취소는 내 줄인지 함수 안에서 본다', () => {
  for (const f of ['duty_apply', 'duty_cancel']) {
    const body = sql.slice(sql.indexOf('create or replace function public.' + f + '('));
    assert.match(body.slice(0, body.indexOf('end $$;')), /p_staff := coalesce\(p_staff, false\);/, f + ' — p_staff coalesce');
  }
  const cancel = sql.slice(sql.indexOf('create or replace function public.duty_cancel('));
  assert.match(cancel.slice(0, cancel.indexOf('end $$;')), /if not p_staff and \(p_user is null or e\.user_id is distinct from p_user\) then return jsonb_build_object\('ok',false,'error','not-found'\)/);
  const apply = sql.slice(sql.indexOf('create or replace function public.duty_apply('));
  assert.match(apply.slice(0, apply.indexOf('end $$;')), /p_force := coalesce\(p_force, false\) and p_staff;/, '본인은 force 가 안 먹는다');
});

// 함수마다 몸통(다음 함수 머리 앞까지)
const bodies = (() => {
  const at = [...sql.matchAll(/create or replace function public\.(duty_[a-z_]+)\s*\(/g)].map((m) => [m[1], m.index]);
  const end = sql.indexOf('revoke all on function');
  return at.map(([name, i], k) => [name, sql.slice(i, k + 1 < at.length ? at[k + 1][1] : end)]);
})();

test('지원 줄을 쓰는 함수는 전역 잠금(7240910, 1)을 잡는다 — 표에 직접 쓰는 길을 두지 않는다', () => {
  // 쓰기 연결 트리거(member_merge.sql)가 지원 줄을 쓸 때 이 잠금을 쥔다 — 함수가 먼저 잡지 않으면 「줄 → 전역」 차례가 되어 다른 함수와 교착한다
  const writers = bodies.filter(([, b]) => /(insert into|update|delete from) public\.duty_signups\b/.test(b)).map(([n]) => n);
  assert.ok(writers.includes('duty_apply') && writers.includes('duty_note_set'), '지원 줄을 쓰는 함수를 못 찾았다 — 이 검사가 낡았다: ' + writers.join(','));
  for (const [name, b] of bodies) {
    if (!writers.includes(name)) continue;
    const lock = b.indexOf('pg_advisory_xact_lock(7240910, 1)');
    const write = b.search(/(insert into|update|delete from) public\.duty_signups\b/);
    const rowLock = b.search(/from public\.duty_signups[^;]*for update/);
    assert.ok(lock >= 0, name + ' — 전역 잠금이 없다');
    assert.ok(lock < write, name + ' — 전역 잠금이 쓰기보다 뒤다');
    if (rowLock >= 0) assert.ok(lock < rowLock, name + ' — 전역 잠금이 지원 줄 잠금(for update)보다 뒤다');
  }
});

test('날짜 줄·자리를 만드는 함수는 당번 잠금(7240912)을 먼저 잡는다 — 틀 고치기·빼기와 한 줄로', () => {
  const makers = bodies.filter(([, b]) => /insert into public\.duty_(days|slots)\b/.test(b)).map(([n]) => n);
  assert.deepEqual(makers.sort(), ['duty_date_add', 'duty_day_set', 'duty_days_off', 'duty_ensure_slots']);
  for (const name of [...makers, 'duty_line_save', 'duty_line_remove']) {
    const b = bodies.find(([n]) => n === name)[1];
    const lock = b.indexOf('pg_advisory_xact_lock(7240912, hashtext(');
    assert.ok(lock >= 0, name + ' — 당번 잠금이 없다');
    const first = b.search(/(insert into public\.duty_(days|slots)\b|for (no key )?update)/);
    assert.ok(first < 0 || lock < first, name + ' — 당번 잠금이 첫 쓰기·줄 잠금보다 뒤다');
  }
});

test('파일 끝 확인 질의의 기대 수가 함수·표 수와 같다', () => {
  const m = raw.match(/기대: tables (\d+) · functions (\d+) · rls on (\d+)/);
  assert.ok(m, '확인 질의의 기대 주석을 못 찾았다');
  assert.equal(Number(m[1]), TABLES.length);
  assert.equal(Number(m[2]), fnNames.length, '함수를 더했으면 확인 질의의 기대 수(functions · service_role can execute)도 고칠 것');
  assert.equal(Number(m[3]), TABLES.length);
});

test('기록 합치기가 duty_signups 를 안다(네 자리 + 옮기기)', () => {
  const merge = fs.readFileSync(path.join(root, 'supabase', 'member_merge.sql'), 'utf8').split(/\r?\n/).map((l) => l.replace(/--.*$/, '')).join('\n');
  const trig = merge.slice(merge.indexOf('create or replace function public.redirect_merged_member_write'), merge.indexOf('create or replace function public.member_merge_counts'));
  assert.match(trig, /'duty_signups'[^;]*?\] loop/, '쓰기 연결 트리거 목록');
  const counts = merge.slice(merge.indexOf('function public.member_merge_counts'), merge.indexOf('function public.admin_preview_member_merge'));
  assert.match(counts, /'duty_signups'/, 'member_merge_counts');
  const body = merge.slice(merge.indexOf('create or replace function public.admin_merge_members'));
  assert.match(body, /if to_regclass\('public\.duty_signups'\) is not null then/, '표가 있을 때만');
  assert.match(body, /merge-duty-conflict/, '앞날 겹침은 멈춘다');
  assert.match(body, /update public\.duty_signups set user_id=t\.id where user_id=s\.id;/, '주인 옮기기(명시적으로 — cascade 로 조용히 지워지지 않게)');
  const del = body.indexOf('delete from public.duty_signups');
  const upd = body.indexOf('update public.duty_signups set user_id=t.id');
  assert.ok(del >= 0 && upd > del, '같은 자리의 겹친 줄을 **먼저** 정리하고 옮긴다 — 거꾸로면 unique(slot_id, user_id) 에 걸려 합치기가 멈춘다');
});
