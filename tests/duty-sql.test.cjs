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
  // 날짜 더하기는 「이 당번의 살아 있는 틀인가」도 잠금 **뒤에** 본다 — 틀 빼기를 기다린 뒤 낡은 답으로 자리를 만들지 않게(두 번째 검토의 검증에서 잡힘)
  const add = bodies.find(([n]) => n === 'duty_date_add')[1];
  assert.ok(add.indexOf('pg_advisory_xact_lock(7240912') < add.indexOf('l.board_id = p_board and l.active'), 'duty_date_add — 틀 확인이 당번 잠금보다 앞이다');
});

test('담당자 요약 수의 shown 은 앱 당번표(duty_board_view)와 같은 범위를 센다 — 오늘 ~ 오늘+보이는 기간 · 끝 날짜까지', () => {
  const a = sql.indexOf('create or replace function public.duty_board_counts');
  const body = sql.slice(a, sql.indexOf('end $$', a));
  assert.ok(/'shown',\s*\(select count\(\*\)::int from public\.duty_slots s where s\.board_id = i\.id and s\.on_date between duty_today\(\) and duty_today\(\) \+ b\.open_days\s+and \(b\.until_date is null or s\.on_date <= b\.until_date\)\)/.test(body),
    'shown 의 범위가 달라졌다 — 앱 당번표의 날짜 범위와 같아야 담당자 화면의 「앱에 날짜가 안 보여요」가 참이다');
  const view = sql.slice(sql.indexOf('create or replace function public.duty_board_view'));
  assert.ok(/d\.on_date between d0 and d0 \+ b\.open_days\s+and \(b\.until_date is null or d\.on_date <= b\.until_date\)/.test(view), '앱 당번표의 날짜 범위(이 시험이 견주는 쪽)가 달라졌다 — shown 도 함께 고칠 것');
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

test('고침 검토 반영(2026-10-07) — 옮기기 전 자리의 live · 전날 알림 잡기의 날짜(옛 꼴은 지우고 만든다 · 권한 줄은 새 꼴) · 알림 재료의 칸 · hadUser 네 갈래', () => {
  const body = (name) => { const a = sql.indexOf('create or replace function public.' + name + '('); assert.ok(a >= 0, name); return sql.slice(a, sql.indexOf('$$;', a)); };
  const mv = body('duty_move');
  assert.ok(mv.includes("'live', (s1.on_date > duty_today() or (s1.on_date = duty_today() and (now() at time zone 'Asia/Seoul')::time < l1.end_time))"), 'moved_from.live — 떠나는 자리가 아직 안 끝났나(앞날 · 오늘 끝 시각 전)');
  assert.ok(mv.includes("if s2.on_date < duty_today() and s1.on_date >= duty_today() then return jsonb_build_object('ok',false,'error','to-past'); end if;"), 'to-past — 앞날(오늘 포함) 줄 → 지난 날 자리만');
  const iDrop = sql.indexOf('drop function if exists public.duty_notify_claim(text, bigint[]);'), iMake = sql.indexOf('create or replace function public.duty_notify_claim(p_kind text, p_ids bigint[], p_date date default null)');
  assert.ok(iDrop > 0 && iMake > iDrop, '옛 꼴(인자 둘)을 지우고 만든다');
  const cl = body('duty_notify_claim');
  assert.ok(cl.includes('and not s.off and not d.off and (p_date is null or s.on_date = p_date)') && cl.includes('on conflict (signup_id, kind) do nothing') && cl.includes("e.status = 'active' and e.user_id is not null"));
  assert.ok(sql.includes('revoke all on function public.duty_notify_claim(text, bigint[], date) from public, anon, authenticated;') && sql.includes('grant execute on function public.duty_notify_claim(text, bigint[], date) to service_role;'));
  assert.equal(/duty_notify_claim\(text, bigint\[\]\) (from|to) /.test(sql), false, '옛 꼴의 권한 줄이 남지 않았다');
  const rows = body('duty_notify_rows');
  for (const k of ["'confirmed', d.confirmed_at is not null", "'ended', (s.on_date = duty_today() and (now() at time zone 'Asia/Seoul')::time >= l.end_time)",
    "x.slot_id = e.slot_id and x.id <> e.id and x.status = 'active'", "'movedFrom', e.moved_from", "b.status in ('open','closed')"]) assert.ok(rows.includes(k), k);
  const ap = body('duty_apply');
  assert.equal((ap.match(/'hadUser'/g) || []).length, 4, 'duty_apply 의 성공 갈래 넷(이음 · 이미 · 되살림 · 새 줄)마다 hadUser');
  assert.ok(ap.includes("'linked',true,'hadUser',true") && ap.includes("'already',true,'locked',v_locked,'hadUser',e.user_id is not null")
    && ap.includes("'hadUser',(select y.user_id is not null from public.duty_signups y where y.id = e.id)"), '되살림은 쓰고 난 줄을 다시 읽는다(되살리며 계정을 잇는 경우)');
});

test('지난 봉사(duty_past · 2026-10-07) — 읽기만 하는 함수다(표에 쓰지 않는다) · 잠금을 잡지 않는다 · 목록보다 먼저 만들어진다', () => {
  const a = sql.indexOf('create or replace function public.duty_past('), e = sql.indexOf('$$;', a);
  assert.ok(a > 0 && e > a);
  const body = sql.slice(a, e);
  assert.match(body, /returns jsonb language sql stable security definer set search_path = public/);
  assert.doesNotMatch(body, /\b(insert|update|delete)\b/i, '읽기만');
  assert.doesNotMatch(body, /advisory|for update/i, '잠금 없음');
  assert.ok(a < sql.indexOf('create or replace function public.duty_list_view('), 'duty_list_view 가 부르므로 그보다 앞에');
});

test('숨긴 때(hidden_at · 독립 확인 반영 2026-10-07) — 트리거 한 곳이 적는다 · 옛 보관 당번을 채우는 문장은 트리거보다 앞 · 지난 봉사는 보관한 당번에서 그때까지 끝난 자리만', () => {
  // 칸 — 새 DB(create table)와 이미 있는 DB(alter) 둘 다
  assert.match(sql, /updated_at\s+timestamptz not null default now\(\),\s+hidden_at\s+timestamptz,\s+archived_at\s+timestamptz\s*\);/, 'create table 에 hidden_at · archived_at');
  assert.ok(sql.includes('alter table public.duty_boards add column if not exists hidden_at timestamptz;'), '이미 있는 표에는 alter 로');
  // 트리거 함수 — 새 줄·보이는 상태 = null · 보이다가 숨김 = 지금 · 숨긴 채 = 옛 값(손으로도 못 바꾼다)
  const a = sql.indexOf('create or replace function public.duty_board_hidden_stamp()'), e = sql.indexOf('end $$;', a);
  assert.ok(a > 0 && e > a, 'duty_board_hidden_stamp');
  const body = sql.slice(a, e);
  assert.match(body, /returns trigger language plpgsql security definer set search_path = public/);
  assert.ok(body.includes("if tg_op = 'INSERT' or new.status in ('open','closed') then new.hidden_at := null;"), '새 당번 · 보이는 상태');
  assert.ok(body.includes("elsif old.status in ('open','closed') then new.hidden_at := now();"), '보이다가 숨김');
  assert.ok(body.includes('else new.hidden_at := old.hidden_at;'), '숨긴 채의 저장은 처음 숨긴 때를 지킨다');
  assert.doesNotMatch(body, /\b(insert into|update public|delete from)\b/i, '트리거는 그 줄만 고친다(다른 표를 쓰지 않는다)');
  const iTrig = sql.indexOf('create trigger duty_boards_hidden_stamp before insert or update on public.duty_boards');
  assert.ok(iTrig > e && sql.indexOf('drop trigger if exists duty_boards_hidden_stamp on public.duty_boards;') < iTrig && sql.indexOf('drop trigger if exists duty_boards_hidden_stamp on public.duty_boards;') > 0, '다시 돌려도 되게 지우고 만든다');
  assert.ok(sql.slice(iTrig, sql.indexOf(';', iTrig)).includes('for each row execute function public.duty_board_hidden_stamp()'));
  assert.doesNotMatch(sql.slice(iTrig, sql.indexOf(';', iTrig)), /update of/, '어느 칸을 고치든 돈다(상태만 볼 때 놓치는 저장이 없게 — 숨긴 채 hidden_at 을 손으로 바꾸는 것도 되돌린다)');
  // 옛 보관 당번 채우기 — 트리거가 생기기 **전에** 돈다(뒤에 돌면 「숨긴 채의 저장」이라 옛 값(null)으로 되돌려진다) · 보관만(준비 중은 언제 숨겼는지 모른다)
  const fill = "update public.duty_boards set hidden_at = updated_at where status = 'archived' and hidden_at is null;";
  assert.ok(sql.includes(fill) && sql.indexOf(fill) < a, '채우는 문장은 트리거 함수보다 앞');
  assert.equal(sql.split('hidden_at').length - 1 >= 8, true);
  // hidden_at 을 쓰는 곳은 그 채우기와 트리거뿐 — 다른 함수가 손대지 않는다
  const writes = [...sql.matchAll(/hidden_at\s*(:=|=)(?!=)/g)].length;
  assert.equal(writes, 4, 'hidden_at 을 적는 곳: 채우기 1 + 트리거의 세 갈래');
  // 세는 규칙은 duty_past 한 곳(duty-front 시험이 글자로 본다) — 여기서는 다른 읽기가 보관한 당번의 줄을 「서 있는 것」으로 치지 않는지만 본다
  const mine = sql.slice(sql.indexOf('create or replace function public.duty_mine(p_user uuid)'));
  assert.ok(mine.slice(0, mine.indexOf('$$;')).includes("b.status in ('open','closed')"), '내 당번은 보이는 당번만');
});

test('쉬는 날(독립 확인 반영 2026-10-07) — 거는 것은 오늘 이후만 · 다시 열기는 지난 날도(오늘 − 400일까지) · 보관한 당번은 둘 다 거절', () => {
  const a = sql.indexOf('create or replace function public.duty_days_off('), e = sql.indexOf('end $$;', a);
  const body = sql.slice(a, e);
  assert.ok(body.includes("if p_off is null or p_from is null or p_to is null or p_to < p_from or p_to - p_from > 92 or p_to > d0 + 400"), '기간 92일 · 오늘 + 400일 안');
  assert.ok(body.includes('or (p_off and p_from < d0) or (not p_off and p_from < d0 - 400) then'), '거는 것은 오늘 이후 · 다시 열기는 오늘 − 400일까지');
  assert.doesNotMatch(body, /or p_from < d0 or/, '옛 줄(다시 열기도 오늘 이후만)이 남지 않았다');
  assert.ok(body.indexOf("if b.status = 'archived' then return jsonb_build_object('ok',false,'error','archived'); end if;") > 0, '보관한 당번');
});

test('보관한 때(archived_at · 👥 봉사자 2026-10-07) — 같은 트리거가 적는다 · 이미 보관한 당번은 updated_at 으로 채운다(트리거보다 앞)', () => {
  assert.ok(sql.includes('alter table public.duty_boards add column if not exists archived_at timestamptz;'), '이미 있는 표에는 alter 로');
  const a = sql.indexOf('create or replace function public.duty_board_hidden_stamp()'), e = sql.indexOf('end $$;', a);
  const body = sql.slice(a, e);
  assert.ok(body.includes("if new.status <> 'archived' then new.archived_at := null;"), '보관이 아니면 비운다');
  assert.ok(body.includes("elsif tg_op = 'INSERT' or old.status is distinct from 'archived' then new.archived_at := now();"), '보관으로 바꾼 때(새로 만든 보관 당번 포함) = 지금');
  assert.ok(body.includes('else new.archived_at := old.archived_at;'), '보관한 채의 저장은 옛 값');
  assert.ok(body.indexOf('new.archived_at') > body.indexOf('new.hidden_at'), '숨긴 때 다음에');
  const fill = "update public.duty_boards set archived_at = updated_at where status = 'archived' and archived_at is null;";
  assert.ok(sql.includes(fill) && sql.indexOf(fill) < a, '채우는 문장은 트리거 함수보다 앞');
  assert.equal([...sql.matchAll(/archived_at\s*(:=|=)(?!=)/g)].length, 4, 'archived_at 을 적는 곳: 채우기 1 + 트리거의 세 갈래');
});

test('👥 봉사자(duty_people · 2026-10-07) — 읽기만 · 부른 쪽이 준 당번 안에서만 · 신원 칸을 싣지 않는다 · 섰던 날의 규칙 · 자리마다 한 번', () => {
  const a = sql.indexOf('create or replace function public.duty_people('), e = sql.indexOf('$$;', a);
  assert.ok(a > 0 && e > a, 'duty_people');
  const body = sql.slice(a, e);
  assert.match(body, /^create or replace function public\.duty_people\(p_boards uuid\[\], p_year int default null, p_signup bigint default null\)\s+returns jsonb language sql stable security definer set search_path = public as \$\$/);
  assert.doesNotMatch(body, /\b(insert|update|delete)\b/i, '읽기만');
  assert.doesNotMatch(body, /advisory|for update/i, '잠금 없음');
  // 당번 범위 — 부른 쪽이 준 당번(p_boards) 안의 줄만 읽고, 사람을 잇는 것도 그 줄만으로(ed·reach 는 ln 에서만 나온다)
  assert.ok(body.includes("where s.board_id = any(coalesce(p_boards, array[]::uuid[])) and e.end_reason is distinct from 'merge'"), 'p_boards · 합치기로 정리된 줄 빼기');
  assert.equal((body.match(/from public\.duty_signups/g) || []).length, 1, '지원 줄을 읽는 곳은 한 곳(범위를 거른 ln)');
  assert.ok(body.includes("where ln.user_id is not null and ln.ident_key like 'person|%'"), '계정과 명부 키를 함께 가진 줄이 잇는다');
  assert.ok(/reach\(node, r\) as \(\s+select distinct ln\.node, ln\.node from ln\s+union\s+select reach\.node, ed\.b from reach join ed on ed\.a = reach\.r\s+\)/.test(body), '잇기(같은 사람 묶음)');
  // 섰던 날 — 당번이 살아 있던 동안 끝난 자리
  // (독립 검토 반영) 묻는 것은 둘 — 자리가 끝났나(끝 시각 ≤ 지금) · 보관하기 전이었나. 준비 중 당번은 살아 있는 명단(숨긴 때 hidden_at 을 보지 않는다 — 그것은 성도님 앱의 규칙)
  for (const k of ["case when b.status = 'archived' then coalesce(b.archived_at, b.updated_at) else 'infinity'::timestamptz end as live_until",
    "((s.on_date + l.end_time) at time zone 'Asia/Seoul') as ends_at",
    "case when ln.status = 'active' and ln.ends_at > now() and ln.board_status <> 'archived' then 'upcoming'",
    "when ln.status = 'active' and not ln.day_off and not ln.slot_off and ln.ends_at <= least(now(), ln.live_until) then 'served'"]) assert.ok(body.includes(k), k);
  // 수는 자리마다 한 번 · 앞으로의 수에 쉬는 날·쉬는 자리는 넣지 않는다 · 그해 = p_year(틀리면 올해)
  assert.ok(body.includes("count(distinct li.slot_id) filter (where li.kind = 'served') as served"));
  assert.ok(body.includes("count(distinct li.slot_id) filter (where li.kind = 'upcoming' and not li.day_off and not li.slot_off) as upcoming"));
  assert.ok(body.includes("case when p_year between 2000 and 2100 then p_year else extract(year from duty_today())::int end as yr"));
  // 답의 칸 — 사람 목록 · 이력 · 줄. 신원 칸(user_id·ident_key·교인ID)·담당자 메모는 없다
  const keys = [...body.matchAll(/'([a-zA-Z]+)', /g)].map((m) => m[1]);
  for (const k of ['ok', 'today', 'year', 'people', 'id', 'name', 'whoType', 'group', 'sub', 'hasApp', 'directory', 'served', 'inYear', 'upcoming', 'last', 'next',
    'person', 'total', 'rows', 'date', 'board', 'boardStatus', 'service', 'task', 'start', 'end', 'kind', 'why', 'off', 'asked', 'askWhy', 'moved', 'source', 'error']) assert.ok(keys.includes(k), k);
  assert.deepEqual(keys.filter((k) => /user|ident|key|note|person_id|uid/i.test(k)), [], '신원 칸이 답에 없다');
  const outs = body.slice(body.indexOf('select case when p_signup is null then ('));
  assert.equal(/\b(user_id|ident_key|staff_note|r\.node)\b/.test(outs.replace(/bool_or\(li\.user_id is not null\)|li\.ident_key like 'person\|%'/g, '')), false, '답을 짓는 곳은 신원 칸을 읽지 않는다');
  assert.ok(body.includes("when me.r is null then jsonb_build_object('ok', false, 'error', 'not-found')"), '범위 밖 줄 = not-found');
  assert.equal(/hidden_at/.test(body.replace(/^\s*--.*$/gm, '')), false, '담당자 셈은 숨긴 때를 보지 않는다(보관한 때만)');
  assert.ok(body.includes("when q.day_off then 'off-day' when q.slot_off then 'off-slot' else 'archived' end"), '빠진 기록의 까닭 — 남는 것은 보관한 뒤의 자리');
  assert.ok(body.includes('limit 400'), '이력은 400줄까지');
  assert.ok(sql.includes('revoke all on function public.duty_people(uuid[], int, bigint) from public, anon, authenticated;') && sql.includes('grant execute on function public.duty_people(uuid[], int, bigint) to service_role;'));
  // 성도님 앱의 규칙(duty_past)은 바뀌지 않았다 — 준비 중을 세지 않고 보관은 숨긴 때까지
  const past = sql.slice(sql.indexOf('create or replace function public.duty_past('), sql.indexOf('$$;', sql.indexOf('create or replace function public.duty_past(')));
  assert.ok(past.includes("and (b.status in ('open','closed')") && !past.includes('archived_at'), 'duty_past 는 그대로');
});
