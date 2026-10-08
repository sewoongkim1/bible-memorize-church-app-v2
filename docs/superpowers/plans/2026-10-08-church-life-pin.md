# 교회 생활 확인 번호 — 서버 핵심 (Plan 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 성경암송 `api` 에 「교회 생활」 확인 번호(휴대폰 뒷자리 4자리)의 **서버 뼈대**를 만든다 — 번호 정하기·맞히기·기기 기억·문(lifeError)·풀기 요청·세 값 스위치. 화면은 없고 스위치는 꺼진 채 나간다(성도님께 아무 변화 없음). 스모크로 시험한다.

**Architecture:** 번호 자체는 저장하지 않고 서버 비밀값(`LIFE_PIN_SECRET`)을 섞은 해시만 둔다. 확인을 마친 기기는 서버가 준 임의 토큰의 해시로 기억한다. 「내 이름으로 하는 일」 액션은 `lifeError(b)` 가 첫 줄에서 막는다 — 스위치가 `off` 면 통과, `test` 면 시험 참여자에게만, `on` 이면 모두. 세지 못하거나 표가 없으면 **막지 않는다**(로그인·신청이 멈추는 것보다 자물쇠가 하루 쉬는 쪽).

**Tech Stack:** Supabase Postgres(SQL) · Deno Edge Function(`supabase/functions/api/index.ts`, TypeScript, 한 파일) · 순수 함수 시험은 Node `tests/*.cjs`(preflight) · 액션 시험은 개발 DB 스모크(`tests/*.sh` 또는 python).

## Global Constraints

- 배포 순서: **SQL·Edge Function 모두 개발 먼저**(`--project-ref ktpwthwqzgcqcrmsafdo`) → localhost 확인 → 운영(`xnomlgydifiqiybervtf`). 이 Plan 은 **개발까지만**. 운영 반영은 Plan 끝의 친구 확인 뒤.
- `api` 는 공유 파일이다 — 배포 전 `git status` 로 남의 미커밋 코드가 없는지 본다. 커밋은 `git apply --cached` 로 내 헝크만(공용 파일 규칙 · CLAUDE.md 「여러 세션」).
- 공개 저장소다 — 비밀값·키를 커밋하지 않는다. `LIFE_PIN_SECRET` 은 Supabase 시크릿으로만 둔다.
- 새 표에는 `enable row level security` + `revoke all … from public, anon, authenticated` + `grant … to service_role` 를 **그 자리에서**. `TO authenticated` 금지(운영 카카오 로그인).
- ⚠️ 새 user_id 표는 기록 합치기(`supabase/member_merge.sql`)의 **넷**(옮기기·FK 허용목록 없음·counts·트리거)을 함께 건드린다 — 안 하면 그 계정 합치기가 멈추고 `tests/member-merge-coverage.test.cjs` 가 preflight 에서 막는다.
- 값을 상수로: `LIFE_DEVICE_DAYS = 180` · `LIFE_PIN_FAILS_PER_DAY = 5` · 기기 수 `LIFE_MAX_DEVICES = 10`(설계 §11 친구 결정).
- 문구는 어느 경우에도 참인 말만. 오류는 앱이 그대로 보여 주는 **읽을 수 있는 글**(영어 코드 금지).
- 판 올리기는 `python tools/bump.py` 한 번(이 Plan 은 app.js 를 안 건드리니 bump 불필요 — Edge Function 만).
- 배포 전 **항상** `python tools/preflight.py`.

---

## File Structure

- `supabase/life_pin.sql` — **Create.** 표 셋(`life_pins`·`life_devices`·`life_reset_requests`) + 인덱스 + RLS/권한. 여러 번 돌려도 되게(`if not exists`).
- `supabase/member_merge.sql` — **Modify.** 세 표를 옮기기·counts·트리거에 더한다. ⚠️ life_pins·life_reset_requests 는 PK/행 모양이 특별하다(아래 Task 1).
- `supabase/functions/api/index.ts` — **Modify.** 순수 함수 묶음(해시·상태·스위치) + 액션 다섯 + `lifeError` + 17개 액션 첫 줄 + 스위치 + 스위치 case 등록.
- `tests/life-pin.test.cjs` — **Create.** 순수 함수 시험(preflight 가 돌린다).
- `tests/life-pin-smoke.sh` — **Create.** 개발 DB 스모크(정하기·다른 기기·다섯 번 틀림·풀기 요청·문이 막는 17개).

이 Plan 밖(후속):
- **Plan 2(앱 화면):** 입구 모달(정하기/맞히기)·설정·`supaCall` 자동 device·입구 wrapping. 성도님이 겪는 화면.
- **Plan 3(교회 어드민 + 교적):** 「🔑 확인 번호 풀기」 메뉴·교적 맞대기(internalPinMatch)·사역신청 번호 빼기·연락처 표(life_contacts)·방침.

---

## Task 1: 표 셋 + 기록 합치기

**Files:**
- Create: `supabase/life_pin.sql`
- Modify: `supabase/member_merge.sql` (옮기기 본체 · `member_merge_counts` 113- · 트리거 do-block 78-110)
- Test: `tests/member-merge-coverage.test.cjs`(이미 있음 — 돌려서 통과 확인)

**Interfaces:**
- Produces: 표 `public.life_pins(user_id uuid pk, pin_hash text, set_at timestamptz, fails int, fail_day date)` · `public.life_devices(id uuid pk, user_id uuid, token_hash text, created_at timestamptz, seen_at timestamptz)` · `public.life_reset_requests(id bigserial pk, user_id uuid, status text, created_at timestamptz, handled_at timestamptz, handled_by text)`. 서버 액션(Task 3-5)이 service_role 로 읽고 쓴다.

- [ ] **Step 1: `supabase/life_pin.sql` 작성**

```sql
-- 교회 생활 확인 번호 (2026-10-08 · 보안 점검 · 설계 docs/superpowers/specs/2026-10-08-church-life-pin-design.md)
--
-- ■ 왜: JWT 없는 API라 순위·게시판이 이름·소속을 보여 주어 로그인 명단이 된다. 「내 이름으로 하는 일」에
--    들어갈 때 휴대폰 뒷자리 4자리를 묻는다. 번호 자체는 두지 않고 서버 비밀값을 섞은 해시만 둔다.
-- ■ 순서: 표가 먼저(빈 표는 아무도 안 읽는다). 표가 없어도 api 는 막지 않는다(lifeError 가 조용히 통과).
-- ⚠️ 어떤 응답에도 pin_hash·token_hash·user_id 를 싣지 않는다.
-- 개발 → 운영 순으로 실행. 여러 번 돌려도 된다.

create table if not exists public.life_pins (
  user_id   uuid primary key,
  pin_hash  text not null,
  set_at    timestamptz not null default now(),
  fails     int not null default 0,
  fail_day  date
);

create table if not exists public.life_devices (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  token_hash  text not null,
  created_at  timestamptz not null default now(),
  seen_at     timestamptz not null default now()
);
create index if not exists life_devices_user on public.life_devices (user_id);
create unique index if not exists life_devices_token on public.life_devices (token_hash);

create table if not exists public.life_reset_requests (
  id          bigserial primary key,
  user_id     uuid not null,
  status      text not null default 'open' check (status in ('open', 'done', 'cancelled')),
  created_at  timestamptz not null default now(),
  handled_at  timestamptz,
  handled_by  text
);
create index if not exists life_reset_open on public.life_reset_requests (status) where status = 'open';
create index if not exists life_reset_user on public.life_reset_requests (user_id);

alter table public.life_pins           enable row level security;
alter table public.life_devices        enable row level security;
alter table public.life_reset_requests enable row level security;
revoke all on public.life_pins, public.life_devices, public.life_reset_requests from public, anon, authenticated;
revoke all on sequence public.life_reset_requests_id_seq from public, anon, authenticated;
grant select, insert, update, delete on public.life_pins, public.life_devices, public.life_reset_requests to service_role;
grant usage on sequence public.life_reset_requests_id_seq to service_role;
```

- [ ] **Step 2: 개발 DB 에 돌린다**

Run: `supabase --workdir <스크래치/sbdev> db query --linked -f "$(절대경로)/supabase/life_pin.sql"`
Expected: 오류 없이 `"rows"` 가 보인다(users 416 이면 운영 · 이 명령은 개발에 link 한 임시 폴더로 — 메모리 supabase-sql-needs-user 참고).
⚠️ 공개 키로 막혔는지 확인: `curl -s -o /dev/null -w "%{http_code}" ".../rest/v1/life_pins?select=user_id&limit=1" -H "apikey: <개발 anon>"` → **401**.

- [ ] **Step 3: `member_merge.sql` 옮기기 본체에 life_devices 더하기 (단순 redirect)**

`life_devices` 는 user_id 칸이라 다른 표와 같다. 트리거 do-block(78-110)의 첫 `foreach t in array array[...]` 목록 끝(`'duty_signups'` 뒤)에 `'life_devices'` 를 더한다. **life_pins·life_reset_requests 는 넣지 않는다**(Step 4·5 에서 따로).

```sql
    'ios_push_tokens','ministry_history_requests','edu_enrollments','duty_signups','life_devices'] loop
```

같은 목록을 `member_merge_counts`(113-)의 `foreach t in array array[...]` 에도 더한다(`'duty_signups'` 뒤에 `'life_devices'`).

- [ ] **Step 4: 합치기 본체에 life_pins·life_reset_requests·life_devices 를 손으로 옮기는 줄 추가**

`admin_merge_members` 또는 합치기 본체 함수(member_merge.sql 의 실제 이동 UPDATE 들이 있는 곳 — `update public.<t> set user_id = p_target …` 꼴을 grep 으로 찾는다)에서, 옮기는 UPDATE 들 사이에 아래를 더한다. life_pins 는 PK 충돌을 ON CONFLICT 로 막는다(남는 계정 번호가 이기고, 없으면 옮긴다 — 설계).

```sql
-- 확인 번호(2026-10-08): 남는 계정에 번호가 있으면 그대로 두고, 없을 때만 옮긴다. 기기는 트리거가 옮기지만
--   합친 뒤엔 둘 다 다시 맞히게 **모두 지운다**(설계 §4). 풀기 요청은 옮긴다(위 redirect 목록에 없으니 여기서).
update public.life_pins set user_id = p_target where user_id = p_source
  on conflict (user_id) do nothing;             -- 남는 쪽에 이미 있으면 안 옮김(옛 줄은 아래에서 지움)
delete from public.life_pins where user_id = p_source;
delete from public.life_devices where user_id in (p_source, p_target);
update public.life_reset_requests set user_id = p_target where user_id = p_source;
```

⚠️ `p_source`·`p_target` 이름은 그 함수의 실제 인자 이름에 맞춘다(grep 으로 확인). `update … on conflict` 는 UPDATE 에 안 되므로, 실제로는 다음 꼴로 쓴다:

```sql
delete from public.life_pins s where s.user_id = p_source
  and exists (select 1 from public.life_pins t where t.user_id = p_target);   -- 남는 쪽에 있으면 옛 줄 버림
update public.life_pins set user_id = p_target where user_id = p_source;       -- 없으면 옮김(이제 충돌 없음)
delete from public.life_devices where user_id in (p_source, p_target);
update public.life_reset_requests set user_id = p_target where user_id = p_source;
```

- [ ] **Step 5: member_merge_counts 에 life_pins·life_reset_requests 수 더하기**

`member_merge_counts` 끝의 특수 칸(board_blocks 꼴) 옆에 더한다 — 세기만(옮기기와 모양이 달라 foreach 에 안 넣는다):

```sql
  if to_regclass('public.life_pins') is not null then
    select count(*) into n from public.life_pins where user_id = p_id;
    result := result || jsonb_build_object('life_pins', n);
  end if;
  if to_regclass('public.life_reset_requests') is not null then
    select count(*) into n from public.life_reset_requests where user_id = p_id;
    result := result || jsonb_build_object('life_reset_requests', n);
  end if;
```

- [ ] **Step 6: member_merge.sql 을 개발 DB 에 돌린다**

Run: `supabase --workdir <sbdev> db query --linked -f "$(절대경로)/supabase/member_merge.sql"`
Expected: 오류 없이 끝.

- [ ] **Step 7: 합치기 커버리지 시험 통과 확인**

Run: `node --test tests/member-merge-coverage.test.cjs`
Expected: PASS(「합치기가 사용자를 가리키는 표를 모두 안다」 포함). life_devices 는 foreach 로, life_pins·life_reset_requests 는 KNOWN_GAPS 가 아니라 **특수 처리**로 인정되어야 한다 — 시험이 이 둘을 「옮기지 않는다」로 잡으면, 시험 머리 주석대로 `tests/member-merge.test.cjs` 에 실제 합쳐 보는 경우를 더하거나 커버리지 시험에 「특수 이동」 목록을 더한다(시험 파일 구조를 보고 결정).

- [ ] **Step 8: 커밋**

```bash
git apply --cached <life_pin.sql 과 member_merge.sql 의 내 헝크>
git commit -m "feat(확인 번호): 표 셋 + 기록 합치기 — life_pins·life_devices·life_reset_requests (개발)"
```

---

## Task 2: 순수 함수 + 시험 (preflight)

**Files:**
- Modify: `supabase/functions/api/index.ts`(순수 함수 묶음 — `kstDayStartIso`·`hmacHex` 근처 · 2026-10-08 로그인 제한 때 넣은 것 재사용)
- Test: `tests/life-pin.test.cjs`(Create)

**Interfaces:**
- Produces: `lifePinHash(secret, userId, pin) → Promise<string>` · `lifeDeviceHash(secret, token) → Promise<string>` · `lifeGateState({hasPin, deviceOk, locked, switchOn, isTester}) → "off"|"new"|"ask"|"ok"|"locked"` · `lifePinValid(pin) → boolean` · `lifeFailsToday(fails, failDay, today) → number`. Task 3-5 가 쓴다.

- [ ] **Step 1: 실패하는 시험 작성 — `tests/life-pin.test.cjs`**

순수 함수를 index.ts 에서 꺼내 쓰는 방식은 기존 `tests/*.cjs` 가 index.ts 를 문자열로 읽어 `eval`/정규식으로 떼거나, 함수를 복사해 검증한다. 기존 한 파일(예: `tests/event-perday.test.cjs`)의 방식을 그대로 따른다. 여기서는 로직을 그대로 옮겨 적어 검증한다(index.ts 와 **글자까지 같게** 유지 — 시험 머리에 그렇게 적는다).

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');

// ⚠️ 아래 네 함수는 index.ts 의 같은 이름 함수와 **글자까지 같아야 한다**(순수 로직 복사 검증).
function lifePinValid(pin) { return typeof pin === 'string' && /^[0-9]{4}$/.test(pin); }
function lifeFailsToday(fails, failDay, today) { return failDay === today ? (Number(fails) || 0) : 0; }
function lifeGateState(s) {
  if (!s.switchOn) return 'off';
  if (s.switchOn === 'test' && !s.isTester) return 'off';
  if (s.locked) return 'locked';
  if (!s.hasPin) return 'new';
  return s.deviceOk ? 'ok' : 'ask';
}

test('4자리만 받는다', () => {
  for (const ok of ['0000', '1234', '9999']) assert.equal(lifePinValid(ok), true);
  for (const no of ['123', '12345', 'abcd', '12 3', '', null, 12]) assert.equal(lifePinValid(no), false);
});
test('틀린 횟수는 오늘 것만 센다', () => {
  assert.equal(lifeFailsToday(4, '2026-10-08', '2026-10-08'), 4);
  assert.equal(lifeFailsToday(4, '2026-10-07', '2026-10-08'), 0);   // 날이 바뀌면 0
  assert.equal(lifeFailsToday(0, null, '2026-10-08'), 0);
});
test('문 상태 다섯', () => {
  assert.equal(lifeGateState({ switchOn: false }), 'off');
  assert.equal(lifeGateState({ switchOn: 'test', isTester: false }), 'off');
  assert.equal(lifeGateState({ switchOn: 'test', isTester: true, hasPin: false }), 'new');
  assert.equal(lifeGateState({ switchOn: 'on', hasPin: false }), 'new');
  assert.equal(lifeGateState({ switchOn: 'on', hasPin: true, deviceOk: false }), 'ask');
  assert.equal(lifeGateState({ switchOn: 'on', hasPin: true, deviceOk: true }), 'ok');
  assert.equal(lifeGateState({ switchOn: 'on', hasPin: true, locked: true }), 'locked');
});
```

- [ ] **Step 2: 시험이 실패하는지 확인**

Run: `node --test tests/life-pin.test.cjs`
Expected: 이 파일만 돌리면 통과한다(함수가 파일 안에 있으므로). 실패→통과 TDD 대신 여기서는 **로직 고정**이 목적이다. index.ts 에 같은 로직을 넣은 뒤 Step 4 에서 대조한다.

- [ ] **Step 3: index.ts 에 네 순수 함수 + 해시 둘 추가**

`hmacHex`(2026-10-08 로그인 제한 때 추가) 아래에 넣는다. 해시는 pin/token 을 HMAC-SHA256 으로:

```ts
// ── 교회 생활 확인 번호 — 순수/해시 (2026-10-08) ──
const LIFE_DEVICE_DAYS = 180, LIFE_PIN_FAILS_PER_DAY = 5, LIFE_MAX_DEVICES = 10;
const lifePinValid = (pin: unknown): pin is string => typeof pin === "string" && /^[0-9]{4}$/.test(pin);
const lifeFailsToday = (fails: number, failDay: string | null, today: string) => failDay === today ? (Number(fails) || 0) : 0;
function lifeGateState(s: { switchOn: string | false; isTester?: boolean; locked?: boolean; hasPin?: boolean; deviceOk?: boolean }): string {
  if (!s.switchOn) return "off";
  if (s.switchOn === "test" && !s.isTester) return "off";
  if (s.locked) return "locked";
  if (!s.hasPin) return "new";
  return s.deviceOk ? "ok" : "ask";
}
// 번호·토큰 자체는 두지 않는다 — 비밀값을 섞은 해시만. 비밀값이 없으면 막지 않는 쪽으로(아래 lifeError).
async function lifePinHash(secret: string, userId: string, pin: string) { return await hmacHex(secret, "life-pin|" + userId + "|" + pin); }
async function lifeDeviceHash(secret: string, token: string) { return await hmacHex(secret, "life-dev|" + token); }
const lifeSwitch = async (): Promise<string | false> => {
  try {
    const { data } = await db.from("app_config").select("value").eq("key", "lifePin").maybeSingle();
    const v = (data?.value ?? "").toString();
    return v === "on" || v === "test" ? v : false;
  } catch { return false; }
};
```

`ADMIN_CONFIG_KEYS` 에 `"lifePin"` 을 더한다(공개로 읽히지 않게 — getConfig/saveConfig 는 이미 ADMIN_CONFIG_KEYS 를 본다). 2026-10-08 로그인 제한 때 만든 `ADMIN_CONFIG_KEYS = new Set(["loginLimit"])` → `new Set(["loginLimit", "lifePin"])`.

- [ ] **Step 4: 로직이 시험과 같은지 대조**

`tests/life-pin.test.cjs` 의 세 함수 본문을 index.ts 의 것과 눈으로 대조(글자까지). Run: `node --test tests/life-pin.test.cjs` → PASS. `node --check`(preflight 이 함):
Run: `python tools/preflight.py`
Expected: 모두 통과(새 cjs 를 preflight 가 자동으로 집어 돌린다).

- [ ] **Step 5: 커밋**

```bash
git commit -m "feat(확인 번호): 순수 함수·해시 + 시험 — 4자리 검사·틀린 횟수·문 상태 (개발)"
```

---

## Task 3: 번호 정하기·맞히기·문 상태 (lifePinSet · lifePinCheck · lifeGate)

**Files:**
- Modify: `supabase/functions/api/index.ts`(액션 함수 + switch case 등록 379- 부근)

**Interfaces:**
- Consumes: Task 2 의 `lifePinHash`·`lifeDeviceHash`·`lifePinValid`·`lifeFailsToday`·`lifeGateState`·`lifeSwitch`·`storeUid`·`kstDay`·`LIFE_*`. `ministryIsTester`(기존 · 시험 참여자 판정).
- Produces: 액션 `lifeGate`·`lifePinSet`·`lifePinCheck`. 성공 시 기기 토큰(hex 64자)을 응답 `device` 로 준다. Task 5(lifeError)가 life_devices 를 읽는다.

- [ ] **Step 1: 기기 발급 도우미 + 세 액션 작성 (index.ts)**

```ts
// 확인된 기기 하나 만든다 — 임의 토큰(앱 localStorage) · 서버엔 해시만. 오래된/넘치는 기기는 치운다.
async function lifeIssueDevice(secret: string, userId: string): Promise<string> {
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32))).map((x) => x.toString(16).padStart(2, "0")).join("");
  await db.from("life_devices").insert({ user_id: userId, token_hash: await lifeDeviceHash(secret, token) });
  // 180일 안 쓴 기기 지우고, 10대를 넘으면 오래된 것부터 지운다
  const cut = new Date(Date.now() - LIFE_DEVICE_DAYS * 86400000).toISOString();
  await db.from("life_devices").delete().eq("user_id", userId).lt("seen_at", cut);
  const { data } = await db.from("life_devices").select("id,created_at").eq("user_id", userId).order("created_at", { ascending: false });
  const extra = (data ?? []).slice(LIFE_MAX_DEVICES).map((r: any) => r.id);
  if (extra.length) await db.from("life_devices").delete().in("id", extra);
  return token;
}
async function lifePinRow(userId: string) {
  const { data } = await db.from("life_pins").select("pin_hash,fails,fail_day").eq("user_id", userId).maybeSingle();
  return data as { pin_hash: string; fails: number; fail_day: string | null } | null;
}
async function lifeDeviceOk(secret: string, userId: string, device: unknown): Promise<boolean> {
  const tok = typeof device === "string" && /^[0-9a-f]{64}$/.test(device) ? device : "";
  if (!tok) return false;
  const h = await lifeDeviceHash(secret, tok);
  const { data } = await db.from("life_devices").select("id").eq("user_id", userId).eq("token_hash", h).maybeSingle();
  if (data) { await db.from("life_devices").update({ seen_at: new Date().toISOString() }).eq("id", (data as any).id); return true; }
  return false;
}

// lifeGate — 교회 생활 입구가 묻는다: 정해야 하나 / 맞혀야 하나 / 그냥 들어가나 / 잠겼나 / 꺼졌나
async function lifeGate(b: any) {
  const uid = storeUid(b.user_id);
  const sw = await lifeSwitch();
  if (!uid) return { ok: true, state: sw ? "new" : "off" };     // 로그인 전이면 화면이 먼저 로그인시킨다
  const isTester = sw === "test" ? await ministryIsTester(uid) : true;
  const secret = Deno.env.get("LIFE_PIN_SECRET") ?? "";
  if (!secret) return { ok: true, state: "off" };               // 비밀값 없으면 자물쇠 끔(막지 않는다)
  const row = await lifePinRow(uid);
  const today = kstDay(new Date().toISOString());
  const locked = !!row && lifeFailsToday(row.fails, row.fail_day, today) >= LIFE_PIN_FAILS_PER_DAY;
  const deviceOk = !!row && await lifeDeviceOk(secret, uid, b.device);
  return { ok: true, state: lifeGateState({ switchOn: sw, isTester, locked, hasPin: !!row, deviceOk }) };
}

// lifePinSet — 번호가 **없을 때만** 정한다(두 번 넣어 확인하는 것은 앱이 한다)
async function lifePinSet(b: any) {
  const uid = storeUid(b.user_id);
  if (!uid) return { ok: false, error: "로그인한 뒤에 정할 수 있어요" };
  if (!lifePinValid(b.pin)) return { ok: false, error: "숫자 4자리를 넣어 주세요" };
  const secret = Deno.env.get("LIFE_PIN_SECRET") ?? "";
  if (!secret) return { ok: false, error: "준비 중이에요. 잠시 뒤 다시 해 주세요" };
  if (await lifePinRow(uid)) return { ok: false, error: "already-set" };   // 이미 있으면 맞히기로(앱이 처리)
  const { error } = await db.from("life_pins").insert({ user_id: uid, pin_hash: await lifePinHash(secret, uid, b.pin) });
  if (error) { if (/duplicate key/i.test(String(error.message))) return { ok: false, error: "already-set" }; throw error; }
  const device = await lifeIssueDevice(secret, uid);
  return { ok: true, device };
}

// lifePinCheck — 맞으면 이 기기를 기억한다 · 틀리면 남은 횟수 · 다섯 번째에 잠근다
async function lifePinCheck(b: any) {
  const uid = storeUid(b.user_id);
  if (!uid) return { ok: false, error: "로그인한 뒤에 할 수 있어요" };
  if (!lifePinValid(b.pin)) return { ok: false, error: "숫자 4자리를 넣어 주세요" };
  const secret = Deno.env.get("LIFE_PIN_SECRET") ?? "";
  if (!secret) return { ok: false, error: "준비 중이에요. 잠시 뒤 다시 해 주세요" };
  const row = await lifePinRow(uid);
  if (!row) return { ok: false, error: "no-pin" };            // 번호가 없다 → 앱이 정하기로
  const today = kstDay(new Date().toISOString());
  const failsToday = lifeFailsToday(row.fails, row.fail_day, today);
  if (failsToday >= LIFE_PIN_FAILS_PER_DAY) return { ok: false, error: "locked" };
  if ((await lifePinHash(secret, uid, b.pin)) === row.pin_hash) {
    await db.from("life_pins").update({ fails: 0, fail_day: null }).eq("user_id", uid);
    const device = await lifeIssueDevice(secret, uid);
    return { ok: true, device };
  }
  const left = LIFE_PIN_FAILS_PER_DAY - failsToday - 1;
  await db.from("life_pins").update({ fails: failsToday + 1, fail_day: today }).eq("user_id", uid);
  return { ok: false, error: left > 0 ? "wrong" : "locked", left: Math.max(0, left) };
}
```

- [ ] **Step 2: switch 에 세 case 등록 (index.ts 379- 부근, login case 근처)**

```ts
      case "lifeGate":      return json(await lifeGate(body));
      case "lifePinSet":    return json(await lifePinSet(body));
      case "lifePinCheck":  return json(await lifePinCheck(body));
```

- [ ] **Step 3: 문법 확인 + 개발 배포**

Run: `node --check supabase/functions/api/index.ts` → OK
Run: `python tools/preflight.py` → 모두 통과
Run: `supabase functions deploy api --no-verify-jwt --project-ref ktpwthwqzgcqcrmsafdo`
Expected: `Deployed Functions.`
⚠️ 개발에 `LIFE_PIN_SECRET` 시크릿이 있어야 한다 — 없으면 state 가 늘 "off". 설정: `supabase secrets set LIFE_PIN_SECRET=<임의 32자+> --project-ref ktpwthwqzgcqcrmsafdo`(값은 커밋하지 않는다).

- [ ] **Step 4: 손으로 한 번 불러 확인(개발)**

`app_config.lifePin = "on"` 을 개발에 넣고(스모크가 할 일이지만 손 확인), 시험 계정으로 lifeGate → "new" → lifePinSet{pin:"1234"} → device 받음 → lifeGate{device} → "ok" → 다른 device 로 lifeGate → "ask". (자세한 자동 검증은 Task 6 스모크.)

- [ ] **Step 5: 커밋**

```bash
git commit -m "feat(확인 번호): lifeGate·lifePinSet·lifePinCheck — 정하기·맞히기·기기 기억·잠금 (개발)"
```

---

## Task 4: 풀기 요청 (lifeResetRequest)

**Files:**
- Modify: `supabase/functions/api/index.ts`

**Interfaces:**
- Consumes: `storeUid`·`kstDayStartIso`(2026-10-08).
- Produces: 액션 `lifeResetRequest`. life_reset_requests 에 열린 줄을 만든다(하루 한 번). ⚠️ 담당자가 **처리하는** 화면은 Plan 3(교회 어드민). 이 Plan 에선 요청을 **쌓기만** 하고, 스모크·개발은 SQL 로 푼다.

- [ ] **Step 1: 액션 작성 (index.ts)**

```ts
// 풀기 요청 — 번호를 잊었거나 남이 먼저 정한 경우. 하루 한 번만(도배 방지). 처리는 교회 어드민(Plan 3).
async function lifeResetRequest(b: any) {
  const uid = storeUid(b.user_id);
  if (!uid) return { ok: false, error: "로그인한 뒤에 할 수 있어요" };
  const dup = await db.from("life_reset_requests").select("id").eq("user_id", uid).eq("status", "open")
    .gte("created_at", kstDayStartIso()).limit(1);
  if (!dup.error && dup.data && dup.data.length) return { ok: true, already: true };
  const { error } = await db.from("life_reset_requests").insert({ user_id: uid });
  if (error) throw error;
  return { ok: true };
}
```

switch 에 등록: `case "lifeResetRequest": return json(await lifeResetRequest(body));`

- [ ] **Step 2: 문법·배포**

Run: `node --check …` → OK · `python tools/preflight.py` → 통과 · `supabase functions deploy api … ktpwthwqzgcqcrmsafdo`

- [ ] **Step 3: 커밋**

```bash
git commit -m "feat(확인 번호): lifeResetRequest — 풀어 달라 요청 쌓기(처리는 교회 어드민) (개발)"
```

---

## Task 5: 문(lifeError) + 17개 액션 + 스위치

**Files:**
- Modify: `supabase/functions/api/index.ts`

**Interfaces:**
- Consumes: `lifeSwitch`·`storeUid`·`ministryIsTester`·`lifeDeviceOk`·`lifePinRow`·`lifeFailsToday`·`kstDay`·`LIFE_PIN_FAILS_PER_DAY`.
- Produces: `lifeError(b) → Promise<string | null>` — 통과면 null, 아니면 오류 코드(`pin-needed`·`pin-locked`). 17개 액션 첫 줄에 건다.

- [ ] **Step 1: lifeError 작성 (index.ts · staffRoleError 근처)**

```ts
// 「내 이름으로 하는 일」의 문 — 확인을 마친 기기만. 관리자 비번은 지나간다.
// ⚠️ 스위치 off 거나(또는 test 인데 시험 참여자 아님) 비밀값이 없으면 **막지 않는다**(null).
// ⚠️ 세다가 오류가 나도 막지 않는다 — 신청·기록이 멈추는 것보다 자물쇠가 쉬는 쪽.
async function lifeError(b: any): Promise<string | null> {
  try {
    if (!adminError(b)) return null;                       // 관리자 비번
    const sw = await lifeSwitch();
    if (!sw) return null;
    const uid = storeUid(b.user_id);
    if (!uid) return null;                                 // user_id 없는 요청은 각 액션이 알아서 막는다
    if (sw === "test" && !(await ministryIsTester(uid))) return null;
    const secret = Deno.env.get("LIFE_PIN_SECRET") ?? "";
    if (!secret) return null;
    const row = await lifePinRow(uid);
    if (!row) return "pin-needed";                         // 번호를 아직 안 정함 → 앱이 정하기 창
    const today = kstDay(new Date().toISOString());
    if (lifeFailsToday(row.fails, row.fail_day, today) >= LIFE_PIN_FAILS_PER_DAY) return "pin-locked";
    return (await lifeDeviceOk(secret, uid, b.device)) ? null : "pin-needed";  // 이 기기가 확인 안 됨 → 맞히기 창
  } catch (_) { return null; }
}
```

- [ ] **Step 2: 17개 액션 첫 줄에 lifeError 걸기**

각 액션 함수의 **첫 줄**(user_id 를 읽기 전/직후)에 `{ const e = await lifeError(b); if (e) return { ok: false, error: e }; }` 를 더한다. 대상(설계 §5):
`ministryMine`·`ministryApply`·`ministryCancel`·`ministryHistoryMine`·`ministryHistoryRequest`·`eduMine`·`eduApply`·`eduCancel`·`eduCert`·`dutyMine`·`dutyApply`·`dutyCancel`·`dutyPast`·`dutyAsk`·`pilsaMine`·`pilsaApply`·`pilsaCancel`.
⚠️ **ministryApply·ministryCancel 처럼 복합조건이 있는 액션은 lifeError 를 맨 앞에** 둔다(그 뒤의 기간·preview·tester 판정보다 먼저). ⚠️ `lifeError` 는 adminError 를 보므로, 관리자·담당자 암호로 부르면 지나간다(담당자 화면·크론 영향 없음).

예(ministryMine):
```ts
async function ministryMine(b: any) {
  const e = await lifeError(b); if (e) return { ok: false, error: e };
  const userId = String(b.user_id || "");
  …
```

- [ ] **Step 3: 걸었는지 세어 확인**

Run: `grep -c "await lifeError(b)" supabase/functions/api/index.ts`
Expected: **18**(함수 정의 1 + 17개 호출). 17개가 모두 맞는 함수인지 눈으로 확인.

- [ ] **Step 4: 문법·배포**

Run: `node --check …` · `python tools/preflight.py`(⚠️ store-review.test.cjs 가 글자로 함수 머리를 찾는다 — ministryMine 등 머리가 바뀌면 그 시험이 깨질 수 있다. 깨지면 시험의 앵커를 손본다) · `supabase functions deploy api … ktpwthwqzgcqcrmsafdo`

- [ ] **Step 5: 커밋**

```bash
git commit -m "feat(확인 번호): lifeError 문 + 교회 생활 17개 액션 · 세 값 스위치(off/test/on) (개발)"
```

---

## Task 6: 개발 스모크 + 운영 반영 판단

**Files:**
- Test: `tests/life-pin-smoke.sh`(Create)

- [ ] **Step 1: 스모크 작성 — `tests/life-pin-smoke.sh`**

기존 `tests/*-smoke.sh`(예 `tests/duty-smoke.sh`)의 틀을 따른다 — 개발 주소·anon 을 환경변수로, `call()` 도우미로 JSON POST. 검증:

```
EVT_ENV=dev 기본. 개발 DB 에 app_config.lifePin='on' 넣고(끝에 지움) LIFE_PIN_SECRET 은 이미 설정됨 가정.
① 시험 계정 login → uid
② lifeGate{uid}            → state:"new"
③ lifePinSet{uid,pin:"1234"} → ok · device1 받음
④ lifePinSet{uid,pin:"1234"} → error:"already-set"
⑤ lifeGate{uid,device:device1} → "ok"
⑥ lifeGate{uid,device:"다른64자"} → "ask"
⑦ lifePinCheck{uid,pin:"0000"} ×4 → wrong(left 3,2,1,0) · 5번째 → "locked"
⑧ lifeGate{uid,device:device1} → "locked"(오늘)
⑨ (SQL) life_pins.fail_day 를 어제로 → lifeGate → "ok"(날 바뀜)
⑩ lifePinCheck{uid,pin:"1234"} → ok · device2 · fails 0
⑪ 문: pilsaMine{uid}(device 없음) → error:"pin-needed" · pilsaMine{uid,device:device2} → ok
⑫ 문(복합): ministryApply{uid,...}(device 없음) → "pin-needed"(기간/ preview 보다 먼저)
⑬ lifeResetRequest{uid} → ok · 또 → already:true
⑭ 응답 어디에도 pin_hash·token_hash·user_id 없음(JSON 전체 검사)
⑮ app_config.lifePin='test' + 비시험 계정 → lifeGate "off" · pilsaMine device 없이 ok(안 막음)
끝: 시험 계정·life_* 줄·app_config.lifePin 지움
```

- [ ] **Step 2: 스모크 돌리기(개발)**

Run: `EVT_ENV=dev bash tests/life-pin-smoke.sh`
Expected: 전부 통과(0 실패). 실패하면 그 Task 로 돌아가 고친다.

- [ ] **Step 3: 커밋**

```bash
git commit -m "test(확인 번호): 개발 스모크 — 정하기·잠금·날 바뀜·문 17개·새지 않음 (개발)"
```

- [ ] **Step 4: 친구 확인 요청(운영 반영 전 멈춤)**

운영 반영은 이 Plan 밖이다. 친구에게:
- 운영에 `LIFE_PIN_SECRET` 시크릿 설정(값은 친구가 · 커밋 안 함) · `supabase functions deploy api … xnomlgydifiqiybervtf` · `life_pin.sql`·`member_merge.sql` 운영 실행.
- ⚠️ 운영 `app_config.lifePin` 은 **아직 넣지 않는다**(스위치 off 유지) — 화면(Plan 2)·교회 어드민 풀기(Plan 3)가 없으면 성도님이 번호를 정해도 풀 길이 없다. 스위치는 Plan 2·3 끝나고 `test` 부터.

---

## Self-Review

**1. Spec coverage(설계 §4-5·9):** 표 life_pins·life_devices·life_reset_requests(Task 1 · life_contacts 는 Plan 3) · 액션 lifeGate·lifePinSet·lifePinCheck·lifeResetRequest(Task 3-4 · lifeContactSave 는 Plan 3) · 문 lifeError + 17개(Task 5) · 스위치 off/test/on(Task 3·5) · 기록 합치기(Task 1) · 순수 함수 시험(Task 2) · 스모크(Task 6). 설계 §5 의 `lifePinChange` 는 친구 결정 10(스스로 바꾸기 없음)으로 뺐음 — 없는 게 맞다. internalPinMatch·교적 이어두기(§5·친구 결정 8)·사역신청 번호 빼기(§4)는 **Plan 3**(교회 어드민·교인명부 필요) — 이 Plan 의 경계 밖임을 File Structure 에 적었다.
**2. Placeholder scan:** SQL·순수 함수·액션·lifeError 는 완전한 코드. member_merge 의 p_source/p_target 이름과 합치기 본체 위치는 「grep 으로 확인」이라 적었다(그 함수가 긴 SQL 이라 실제 인자명 확인이 필요 — 실행자가 grep 한 줄로 확정). 스모크는 단계별 기대값을 다 적었고 틀은 기존 파일을 따른다.
**3. Type consistency:** `lifePinHash`·`lifeDeviceHash`·`lifeDeviceOk`·`lifePinRow`·`lifeIssueDevice`·`lifeGateState`·`lifeSwitch`·`lifeError` 이름이 Task 2-5 에서 일관. 기기 토큰은 hex 64자(32바이트)로 통일(발급·검사·스모크). 응답 `device` 키 일관. 스위치 값 `"on"|"test"|false` 일관.

## Execution Handoff

(아래 핸드오프는 이 Plan 을 실행할 때 고른다.)
