# Plan 5 — 사역신청 번호 걷기 · 연락처(안 맞은 분만) · 「내 신청」 번호 가리기

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사역신청에서 휴대폰 번호 칸을 걷는다 — 교적과 이어진 분은 번호 없이 저장되고, 교적과 안 맞은 분만 그때 연락처를 한 번 남긴다(`life_contacts`, 180일). 필사 「내 신청」 응답의 번호는 `010-****-5678` 로 가린다.

**Architecture:** 설계 §5(교적 맞대기·사역신청 전화번호)·§9 step 4. 확인 번호 스위치(`app_config.lifePin`)가 **이 사용자에게 켜졌을 때만** 새 흐름이 돈다 — 스위치가 꺼진 운영에서는 오늘과 똑같이 동작한다(사역신청은 번호를 그대로 받는다). 스위치가 켜지면(§9 step 5, test→시험 참여자) 사역신청 번호 칸이 사라지고, `ministryApply` 가 `life_pins.person_id`(Plan 4 교적 맞대기 결과)를 보고 이어졌으면 번호 없이, 안 이어졌으면 `contact-needed` 로 연락처를 묻는다.

**Tech Stack:** Deno Edge Function(`supabase/functions/api/index.ts`) · Postgres(`supabase/*.sql`) · Vanilla JS(`app.js`·`js/api.js`) · node:test(`tests/life-pin.test.cjs`) · python 스모크(`tests/life-pin-smoke.py`).

## Global Constraints

- **개발 먼저.** SQL·Edge Function 모두 개발(`ktpwthwqzgcqcrmsafdo`)에서 돌리고 확인한 뒤에만 운영을 건드린다. 이 계획의 실행 범위는 **개발까지**다 — 운영 반영(Plan 4·5 합본)은 친구와 함께 하는 별도 단계(§9 step 4→5).
- **스위치 꺼짐 = 변화 없음.** 운영의 `app_config.lifePin` 은 지금 off 다. 모든 새 흐름은 `lifeActive(b)` 가 참일 때만 돈다. off 면 `ministryApply`·`ministryCancel` 은 **지금 코드와 글자까지 같은** 번호 검사를 한다.
- **12/13 성도님 흐름.** 사역신청은 살아 있는 성도님 화면이고 12/13~12/27 기간이 곧 열린다. 담당자가 성도님께 **연락할 길이 없어지면 안 된다** — 교적과 이어진 분은 담당자가 교적에서 번호를 보고, 안 이어진 분은 `life_contacts` 에 남긴 번호를 본다.
- **번호 자체는 최소한으로.** `ministry_orders.phone` 은 교적과 안 맞아 연락처를 남긴 분의 번호만 담는다(이어진 분은 빈 칸). 어떤 응답에도 `user_id`·`pin_hash`·`token_hash` 를 싣지 않는다.
- **curl 한글 금지.** 서버를 부를 때 한글은 명령줄 리터럴로 넣지 말고 python `json.dumps`(UTF-8)로. (`tests/life-pin-smoke.py` 가 이미 그렇게 한다.)
- **올리기 전 `python tools/preflight.py`.** 문서·SQL 만 바꿔도.
- **커밋은 경로를 못 박아** 스테이징한다(`git add -A` 금지). 공용 파일(`app.js`·`index.ts`·`js/api.js`)은 다른 세션도 건드릴 수 있으니 커밋 직전 `git diff --cached` 로 남의 헝크가 없는지 본다.
- **`bump.py` 는 커밋에 넣지 않는다**(app.js 를 고친 Task 8 은 예외적으로 로컬 확인용 bump 는 돌리되, 운영 반영 때 친구가 한 번 더 돌린다 — 아래 Task 8 참고).

---

## 파일 지도

- `supabase/life_contacts.sql` — **새 표**. `life_contacts(user_id uuid PK, phone text, updated_at timestamptz)` + RLS + revoke + grant service_role.
- `supabase/member_merge.sql` — 네 곳에 `life_contacts` 더하기(트리거 foreach · 수 세기 foreach · 열 안전 허용목록 · 전용 옮기기 본체).
- `supabase/functions/api/index.ts` — `LIFE_CONTACT_DAYS` 상수 · `maskPhone` 순수 · `lifeActive`·`lifePersonLinked`·`lifeContactPhone` 헬퍼 · `lifeContactSave` 액션 + switch case · `ministryApply`/`ministryCancel` 번호 흐름 · `pilsaMine`/`pilsaApply` 가리기.
- `tests/life-pin.test.cjs` — `maskPhone` 순수 함수 테스트(preflight 가 돌린다).
- `tests/life-pin-smoke.py` — 개발 스모크에 ⑥ 연락처·⑦ 사역 흐름·⑧ 번호 가리기 더하기.
- `js/api.js` — `lifeContactSave` 래퍼.
- `app.js` — `lifeGateOn` 추적 · 사역신청 번호 칸 가드 · `openLifeContact` 창 · 제출 흐름.

---

### Task 1: `life_contacts` 표 + 기록 합치기

**Files:**
- Create: `supabase/life_contacts.sql`
- Modify: `supabase/member_merge.sql` (4곳: ~89, ~127, ~270, ~487)
- Test: `supabase/member_merge_test.sql`(이미 있으면 그 커버리지 검사) 또는 개발 DB 에서 직접 확인

**Interfaces:**
- Produces: 표 `public.life_contacts` — `user_id uuid primary key`, `phone text not null`, `updated_at timestamptz not null default now()`. service_role 만 읽고 쓴다.

- [ ] **Step 1: `supabase/life_contacts.sql` 작성**

```sql
-- 교회 생활 — 교적과 안 맞은 분의 연락처 (2026-10-08 · Plan 5 · 설계 docs/superpowers/specs/2026-10-08-church-life-pin-design.md §5)
--
-- ■ 왜: 사역신청에서 번호를 걷는다. 교적과 이어진 분은 담당자가 교적에서 번호를 본다.
--    교적과 안 맞은 분(person_how='no')만 신청 저장 때 연락처를 한 번 남긴다 — 담당자가 연락할 길.
-- ■ 보관: 마지막으로 적은 날부터 180일(LIFE_CONTACT_DAYS). 사역신청 번호 규칙과 같다.
-- ⚠️ 어떤 응답에도 user_id 를 싣지 않는다. service_role 만 읽고 쓴다.
-- ⚠️ member_merge.sql 가 함께 안다 — 새것(updated_at 최신)을 남긴다.
-- 개발 → 운영 순으로 실행. 여러 번 돌려도 된다.

create table if not exists public.life_contacts (
  user_id    uuid primary key,
  phone      text not null,
  updated_at timestamptz not null default now()
);

alter table public.life_contacts enable row level security;
revoke all on public.life_contacts from public, anon, authenticated;
grant select, insert, update, delete on public.life_contacts to service_role;
```

- [ ] **Step 2: 개발 DB 에서 돌린다**

Run: `supabase db query --file supabase/life_contacts.sql`  (⚠️ `--linked` 는 운영이다 — 개발 스크래치를 link 한 상태인지 먼저 `supabase projects list` 로 확인. 개발이면 users 21행)
Expected: `CREATE TABLE` / `ALTER TABLE` / `REVOKE` / `GRANT` 성공(두 번째부터는 `already exists` 없이 조용히).

- [ ] **Step 3: 공개 키로 막혀 있는지 본다(보안)**

Run:
```bash
curl -s "https://ktpwthwqzgcqcrmsafdo.supabase.co/rest/v1/life_contacts?select=*&limit=1" \
  -H "apikey: sb_publishable_eJKP6u95IU9_DBXTvnvYBA_-yGCf-0Y"
```
Expected: 빈 배열이 아니라 권한 오류(`permission denied` 또는 `{"code":...}`). 행이 오면 RLS/권한이 샌 것 — 멈추고 고친다.

- [ ] **Step 4: `member_merge.sql` — 트리거 foreach 에 더하기** (~line 89)

`'life_devices','life_pins','life_reset_requests'] loop` 를 찾아 그 배열 끝에 `,'life_contacts'` 를 더한다:

```
    'life_devices','life_pins','life_reset_requests','life_contacts'] loop
```

- [ ] **Step 5: `member_merge.sql` — 수 세기 foreach 에 더하기** (~line 127)

`'life_pins','life_devices','life_reset_requests'] loop` (member_merge_counts 안) 를 찾아 끝에 `,'life_contacts'`:

```
    'life_pins','life_devices','life_reset_requests','life_contacts'] loop
```

- [ ] **Step 6: `member_merge.sql` — 열 안전 허용목록에 더하기** (~line 270)

`'life_pins','life_devices','life_reset_requests')` 를 찾아 `'life_contacts'` 를 더한다:

```
        'life_pins','life_devices','life_reset_requests','life_contacts')
```

- [ ] **Step 7: `member_merge.sql` — 전용 옮기기 본체 더하기** (~line 487, `life_reset_requests` 블록 바로 뒤)

```sql
  if to_regclass('public.life_reset_requests') is not null then
    update public.life_reset_requests set user_id=t.id where user_id=s.id;
  end if;
  -- 연락처(2026-10-08 Plan 5): 새것(updated_at 최신)을 남긴다.
  if to_regclass('public.life_contacts') is not null then
    delete from public.life_contacts c where c.user_id=s.id
      and exists (select 1 from public.life_contacts d where d.user_id=t.id and d.updated_at >= c.updated_at);
    delete from public.life_contacts where user_id=t.id
      and exists (select 1 from public.life_contacts d where d.user_id=s.id);
    update public.life_contacts set user_id=t.id where user_id=s.id;
  end if;
```

- [ ] **Step 8: `member_merge.sql` 개발 DB 에서 돌린다**

Run: `supabase db query --file supabase/member_merge.sql`
Expected: `CREATE FUNCTION` 성공, 오류 없음. 커버리지 검사가 있으면(아래) 돌려 통과 확인.

- [ ] **Step 9: 커버리지 — user_id 표가 모두 허용목록에 있나**

개발 DB 에서:
```sql
select c.table_name from information_schema.columns c
 join information_schema.tables b on b.table_schema=c.table_schema and b.table_name=c.table_name
 where c.table_schema='public' and b.table_type='BASE TABLE' and c.column_name='user_id'
   and c.table_name not in ('progress','challenge_log','reviews','passage_progress','blessing_log','feature_log',
     'push_subscriptions','board_posts','board_replies','board_reactions','event_entries',
     'daily_activity','pilsa_orders','ministry_orders','event_signups','user_identity_aliases','user_profile_changes',
     'board_blocks','board_reports','sermon_answer_reports',
     'ios_push_tokens','ministry_history_requests','edu_enrollments','duty_signups',
     'life_pins','life_devices','life_reset_requests','life_contacts');
```
Expected: 0행. 한 행이라도 오면 그 표를 허용목록·옮기기에 더하거나, `merge-unsupported-records` 가 뜰 것임을 안다(이번 범위 밖이면 멈추고 보고).

- [ ] **Step 10: 커밋**

```bash
git add supabase/life_contacts.sql supabase/member_merge.sql
git commit -m "feat(연락처): life_contacts 표 + 기록 합치기 — 교적 안 맞은 분의 사역 연락처(180일) (개발)"
```

---

### Task 2: `maskPhone` 순수 함수 + 테스트

**Files:**
- Modify: `supabase/functions/api/index.ts` (pilsaRow 근처 · ~line 3974 `pilsaPhone` 바로 아래)
- Test: `tests/life-pin.test.cjs`

**Interfaces:**
- Produces: `maskPhone(v: unknown): string` — 가운데를 가린 번호 문자열. 숫자 11자리 `01012345678`/정리된 `010-1234-5678` → `010-****-5678`. 숫자 10자리 → `0AA-***-BBBB`(뒤 4자리 남김). 그 밖/빈 값 → `""`.

- [ ] **Step 1: `tests/life-pin.test.cjs` 에 실패 테스트 더하기**

파일 맨 위 순수 함수 묶음(현재 `lifeFailsToday`·`lifeGateState` 가 복사돼 있는 자리) 아래에 `maskPhone` 복사본과 테스트를 더한다:

```js
// index.ts 의 maskPhone 과 글자까지 같게 둔다
function maskPhone(v) {
  const d = String(v == null ? '' : v).replace(/[^0-9]/g, '');
  if (d.length === 11) return d.slice(0, 3) + '-****-' + d.slice(7);
  if (d.length === 10) return d.slice(0, 3) + '-***-' + d.slice(6);
  return '';
}

test('maskPhone — 가운데를 가린다', () => {
  assert.equal(maskPhone('010-1234-5678'), '010-****-5678');
  assert.equal(maskPhone('01012345678'), '010-****-5678');
  assert.equal(maskPhone('0212345678'), '021-***-5678');   // 10자리
  assert.equal(maskPhone(''), '');
  assert.equal(maskPhone(null), '');
  assert.equal(maskPhone('abc'), '');
});
```

- [ ] **Step 2: 테스트를 돌려 실패를 본다**

Run: `node --test tests/life-pin.test.cjs`
Expected: `maskPhone` 테스트가 아니라 — 잠깐, 복사본을 파일 안에 넣었으니 바로 통과한다. 이 테스트의 뜻은 **index.ts 의 구현과 글자까지 같은지**를 사람이 대조하는 것. 그러니 Step 2 는 생략하고, 복사본이 통과하는지만 본다(PASS 면 복사본은 맞다).

Run: `node --test tests/life-pin.test.cjs`
Expected: PASS(새 `maskPhone` 테스트 포함).

- [ ] **Step 3: `index.ts` 에 같은 `maskPhone` 더하기** (~line 3974, `pilsaPhone` 함수 바로 아래)

```ts
// 성도 본인에게 보여 주는 「내 신청」의 번호는 가운데를 가린다(2026-10-08 Plan 5).
// ⚠️ 담당자 명단(pilsaList)·종이 명단에는 쓰지 않는다 — 노트·연락에 전체 번호가 필요하다.
function maskPhone(v: unknown): string {
  const d = String(v ?? "").replace(/[^0-9]/g, "");
  if (d.length === 11) return d.slice(0, 3) + "-****-" + d.slice(7);
  if (d.length === 10) return d.slice(0, 3) + "-***-" + d.slice(6);
  return "";
}
```

- [ ] **Step 4: 커밋**

```bash
git apply --cached <(git diff -- supabase/functions/api/index.ts)   # 내 헝크만
git add tests/life-pin.test.cjs
git commit -m "feat(번호 가리기): maskPhone 순수 함수 + 테스트 (개발)"
```
(⚠️ 다른 세션이 index.ts 를 건드리는 중이면 `git diff --cached` 로 내 헝크(maskPhone 추가)만 담겼는지 확인.)

---

### Task 3: api — 헬퍼 셋 + `lifeContactSave` 액션

**Files:**
- Modify: `supabase/functions/api/index.ts` (life 헬퍼 묶음 ~line 2659 `lifeMatchPerson` 뒤 · switch 문)

**Interfaces:**
- Consumes: `lifeSwitch()`, `ministryIsTester(uid)`, `adminError(b)`, `storeUid`, `lifeDeviceOk`, `lifePinRow`, `PILSA_PHONE_RE`, `pilsaPhone` (모두 이미 있음).
- Produces:
  - `lifeActive(b): Promise<boolean>` — 이 사용자에게 확인 번호 문이 켜져 있나(스위치 on, 또는 test+시험참여자 · 비밀값 있음 · uid 있음 · 관리자 비번 아님). 기기 확인 여부는 보지 않는다.
  - `lifePersonLinked(uid): Promise<{ linked: boolean; how: string }>` — `life_pins.person_id`·`person_how` 를 읽어 이어졌는지(person_id 있고 how ∈ {auto,staff})와 how 를 돌려준다.
  - `lifeContactPhone(uid): Promise<string>` — `life_contacts.phone`(없으면 `""`).
  - 액션 `lifeContactSave` — `{ user_id, device, phone }` → 기기 확인된 분(또는 관리자)만 upsert. 180일 지난 줄은 조용히 치운다.

- [ ] **Step 1: 상수 + 헬퍼 셋 + 액션 더하기** (`lifeMatchPerson` 함수가 끝나는 `}` 바로 뒤, `lifeError` 앞)

```ts
const LIFE_CONTACT_DAYS = 180;   // 교적과 안 맞은 분의 연락처 보관(친구 결정 §11-4 · 바꾸려면 여기 하나)

// 이 사용자에게 확인 번호 문이 켜져 있나 — 켜졌으면 사역신청이 번호 대신 교적 맞대기로 간다.
// ⚠️ lifeError 와 같은 「켜짐」 조건이되 기기 확인은 보지 않는다(ministryApply 는 이미 lifeError 를 지나왔다).
async function lifeActive(b: any): Promise<boolean> {
  try {
    if (!adminError(b)) return false;                 // 관리자 비번(담당자 암호 포함)은 옛 흐름
    const sw = await lifeSwitch();
    if (!sw) return false;
    const uid = storeUid(b.user_id);
    if (!uid) return false;
    if (sw === "test" && !(await ministryIsTester(uid))) return false;
    return !!(Deno.env.get("LIFE_PIN_SECRET") ?? "");
  } catch (_) { return false; }
}

// 교적과 이어졌나 — person_id 가 있고 사람/자동이 정한 줄(auto·staff)이면 이어진 것. no 는 「명부를 읽었는데 안 맞음」.
async function lifePersonLinked(uid: string): Promise<{ linked: boolean; how: string }> {
  try {
    const { data } = await db.from("life_pins").select("person_id,person_how").eq("user_id", uid).maybeSingle();
    const how = (data as any)?.person_how ?? "";
    const linked = !!(data as any)?.person_id && (how === "auto" || how === "staff");
    return { linked, how };
  } catch (_) { return { linked: false, how: "" }; }
}

async function lifeContactPhone(uid: string): Promise<string> {
  try {
    const { data } = await db.from("life_contacts").select("phone").eq("user_id", uid).maybeSingle();
    return norm((data as any)?.phone) || "";
  } catch (_) { return ""; }
}

// lifeContactSave — 교적과 안 맞은 분이 신청 저장 때 남기는 연락처. 기기 확인된 분만(또는 관리자). 180일 지난 줄은 치운다.
async function lifeContactSave(b: any) {
  const uid = storeUid(b.user_id);
  if (!uid) return { ok: false, error: "로그인한 뒤에 할 수 있어요" };
  const phone = pilsaPhone(b.phone);
  if (!PILSA_PHONE_RE.test(phone)) return { ok: false, error: "휴대폰 번호를 확인해 주세요 (010-1234-5678)" };
  const secret = Deno.env.get("LIFE_PIN_SECRET") ?? "";
  // 관리자 비번이 아니면 이 기기가 확인됐는지 본다(교회 생활 쓰기이므로)
  if (adminError(b) && !(secret && await lifeDeviceOk(secret, uid, b.device))) {
    return { ok: false, error: "pin-needed" };
  }
  const now = new Date().toISOString();
  const { error } = await db.from("life_contacts").upsert({ user_id: uid, phone, updated_at: now }, { onConflict: "user_id" });
  if (error) throw error;
  const cut = new Date(Date.now() - LIFE_CONTACT_DAYS * 86400000).toISOString();
  await db.from("life_contacts").delete().lt("updated_at", cut);
  return { ok: true };
}
```

- [ ] **Step 2: switch 문에 case 더하기**

`case "lifeResetRequest":` 줄을 찾아 그 아래에:

```ts
    case "lifeContactSave":  return json(await lifeContactSave(body));
```

- [ ] **Step 3: 커밋**

```bash
git apply --cached <(git diff -- supabase/functions/api/index.ts)
git commit -m "feat(연락처): lifeActive·lifePersonLinked·lifeContactPhone 헬퍼 + lifeContactSave 액션 (개발)"
```

---

### Task 4: api — `ministryApply`/`ministryCancel` 번호 흐름

**Files:**
- Modify: `supabase/functions/api/index.ts` (`ministryApply` ~line 6691 번호 블록 · dup 검사 조건 ~6730 · `ministryCancel` ~6789)

**Interfaces:**
- Consumes: `lifeActive`, `lifePersonLinked`, `lifeMatchPerson`, `lifeContactPhone`.

- [ ] **Step 1: `ministryApply` 번호 블록 바꾸기** (~line 6691~6701, `const phone = pilsaPhone(b.phone);` 부터 `kept` 검사까지)

지금:
```ts
  const phone = pilsaPhone(b.phone);
  if (!PILSA_PHONE_RE.test(phone)) {
    return { ok: false, error: "휴대폰 번호를 확인해 주세요 (010-1234-5678)" };
  }
  // ⚠️ 이미 낸 건이 있으면 그때 넣은 4자리와 같아야 한다 ...
  const kept = mine.filter((r) => MINISTRY_DECIDED.indexOf(r.status) < 0).map((r) => norm(r.phone)).filter(Boolean)[0];
  if (kept && kept !== phone) {
    return { ok: false, error: "휴대폰 번호가 처음 신청하실 때와 다릅니다" };
  }
```
바꿔:
```ts
  // 확인 번호 문이 이 분에게 켜졌으면(Plan 5) 번호를 받지 않는다 — 교적과 이어졌는지로 가른다.
  //   이어짐 → 번호 없이 저장(담당자는 교적에서 번호를 본다).
  //   안 이어짐(명부를 읽었는데 없음) → 연락처가 없으면 contact-needed 로 한 번 묻는다.
  //   못 읽음(null · person_how 빈칸) → 묻지 않고 저장한다(명부가 잠깐 안 읽혔을 뿐).
  // 스위치가 꺼진 평소에는 지금까지대로 번호를 그대로 받는다.
  let phone = "";
  if (await lifeActive(b)) {
    let link = await lifePersonLinked(userId);
    if (!link.linked) { await lifeMatchPerson(userId); link = await lifePersonLinked(userId); }
    if (!link.linked && link.how === "no") {
      phone = await lifeContactPhone(userId);
      if (!phone) {
        return { ok: false, confirm: "contact-needed",
          message: "교적에 등록된 번호와 맞지 않아요.\n담당자가 임명·연락을 위해 쓸 수 있게 연락처를 한 번만 남겨 주세요." };
      }
    }
  } else {
    phone = pilsaPhone(b.phone);
    if (!PILSA_PHONE_RE.test(phone)) {
      return { ok: false, error: "휴대폰 번호를 확인해 주세요 (010-1234-5678)" };
    }
  }
  // ⚠️ 이미 낸 건이 있으면 그때 넣은 4자리와 같아야 한다 — 비밀번호가 없는 앱의 최소 확인.
  //    (확인 번호 문이 켜진 분은 phone 이 빈칸일 수 있다 — 그럴 땐 이 검사를 건너뛴다.)
  const kept = mine.filter((r) => MINISTRY_DECIDED.indexOf(r.status) < 0).map((r) => norm(r.phone)).filter(Boolean)[0];
  if (phone && kept && kept !== phone) {
    return { ok: false, error: "휴대폰 번호가 처음 신청하실 때와 다릅니다" };
  }
```

- [ ] **Step 2: dup-phone 검사를 번호 있을 때만** (~line 6730)

지금:
```ts
  if (toAdd.length && !b.dupOk && name) {
```
바꿔(빈 번호로는 묻지 않는다 — 빈 칸끼리 「중복」이 되지 않게):
```ts
  if (toAdd.length && !b.dupOk && name && phone) {
```

- [ ] **Step 3: `ministryCancel` 번호 검사 가드** (~line 6789)

`ministryCancel` 안의 번호 검사를 읽는다:
```ts
  const kept = mine.filter((r) => MINISTRY_DECIDED.indexOf(r.status) < 0).map((r) => norm(r.phone)).filter(Boolean)[0];
  if (kept && kept !== pilsaPhone(b.phone)) {
```
그 앞에 `active` 를 구해 켜진 분에겐 건너뛴다:
```ts
  const active = await lifeActive(b);
  const kept = mine.filter((r) => MINISTRY_DECIDED.indexOf(r.status) < 0).map((r) => norm(r.phone)).filter(Boolean)[0];
  if (!active && kept && kept !== pilsaPhone(b.phone)) {
```
(⚠️ 이 블록 전체를 Read 로 먼저 보고, `return` 문구는 그대로 둔다.)

- [ ] **Step 4: 문법 검사**

Run: `python tools/preflight.py`
Expected: `[1] node --check` 통과(index.ts 포함), 캐시태그 검사 통과. 깨지면 고친다.

- [ ] **Step 5: 커밋**

```bash
git apply --cached <(git diff -- supabase/functions/api/index.ts)
git commit -m "feat(사역신청): 확인 번호 켜진 분은 번호 대신 교적 맞대기 · 안 맞으면 contact-needed (개발)"
```

---

### Task 5: api — `pilsaMine`·`pilsaApply` 번호 가리기

**Files:**
- Modify: `supabase/functions/api/index.ts` (`pilsaMine` ~line 4014 · `pilsaApply` 두 return ~4057·4064)

**Interfaces:**
- Consumes: `maskPhone`(Task 2), `pilsaRow`.

- [ ] **Step 1: `pilsaMine` return 가리기** (~line 4014)

지금:
```ts
  return { ok: true, order: r ? pilsaRow(r) : null };
```
바꿔:
```ts
  return { ok: true, order: r ? { ...pilsaRow(r), phone: maskPhone(r.phone) } : null };
```

- [ ] **Step 2: `pilsaApply` 두 return 가리기** (~line 4057·4064)

두 곳의 `return { ok: true, order: pilsaRow(data) };` 를 각각:
```ts
  return { ok: true, order: { ...pilsaRow(data), phone: maskPhone(data.phone) } };
```
(⚠️ `pilsaList`(담당자 명단, ~4104)의 `{ ...pilsaRow(r), ... }` 는 **건드리지 않는다** — 담당자는 전체 번호가 필요하다.)

- [ ] **Step 3: 문법 검사 + 커밋**

Run: `python tools/preflight.py` → 통과
```bash
git apply --cached <(git diff -- supabase/functions/api/index.ts)
git commit -m "feat(번호 가리기): 필사 「내 신청」 응답의 번호를 010-****-5678 로 (개발)"
```

---

### Task 6: 개발 배포 + 스모크

**Files:**
- Modify: `tests/life-pin-smoke.py` (⑥⑦⑧ 더하기)

- [ ] **Step 1: 개발에 배포**

Run: `supabase functions deploy api --no-verify-jwt --project-ref ktpwthwqzgcqcrmsafdo`
Expected: `Deployed Functions on project ktpwthwqzgcqcrmsafdo`. (일시 오류면 한 번 더.)

- [ ] **Step 2: `tests/life-pin-smoke.py` 에 검사 더하기**

파일 끝의 테스트 묶음(스위치를 `test`/`on` 으로 켠 뒤 돌리는 자리)에 더한다. 시험 계정 하나(매번 다른 이름)로 번호를 정해 교적이 안 맞게 한 뒤:

```python
# ⑥ 연락처 저장 — 기기 토큰 없이는 막히고, 있으면 저장된다
c0 = api("lifeContactSave", user_id=uid, phone="010-1234-5678")           # device 없음
assert c0.get("error") == "pin-needed", c0
c1 = api("lifeContactSave", user_id=uid, device=dev, phone="010-1234-5678")  # dev = 정할 때 받은 토큰
assert c1.get("ok") is True, c1

# ⑦ 사역신청 — 교적 안 맞은 분: 연락처 있으면 저장, 없으면 contact-needed
#    (연락처를 지운 새 계정으로 contact-needed 를 한 번 확인)

# ⑧ 필사 「내 신청」 번호 가리기
api("pilsaApply", user_id=uid, device=dev, name=nm, size="A4", type1="개역개정", type2="개역개정", qtys={"신약":1}, phone="010-9876-5432")
mine = api("pilsaMine", user_id=uid, device=dev)
assert mine["order"]["phone"] == "010-****-5432", mine
```
(⚠️ 실제 action 이름·인자는 파일 위쪽 헬퍼에 맞춘다. 끝 코드: 실패 있으면 1.)

- [ ] **Step 3: 스모크 돌린다**

Run: `set -a; . ./.env.dev; set +a; EVT_ENV=dev python tests/life-pin-smoke.py`
Expected: 모두 OK, 끝에 실패 0. (스위치를 켰다가 **off 로 되돌리는지** 확인 — 파일이 이미 그렇게 한다.)

- [ ] **Step 4: 커밋**

```bash
git add tests/life-pin-smoke.py
git commit -m "test(연락처): 개발 스모크 — lifeContactSave·사역 contact-needed·필사 번호 가리기 (개발)"
```

---

### Task 7: `js/api.js` — `lifeContactSave` 래퍼

**Files:**
- Modify: `js/api.js` (~line 91 `lifeResetRequest` 뒤)

- [ ] **Step 1: 래퍼 더하기**

`lifeResetRequest: (user_id) => supaCall("lifeResetRequest", { user_id }),` 아래에:
```js
  lifeContactSave: (user_id, phone) => supaCall("lifeContactSave", { user_id, phone }),
```
(⚠️ `supaCall` 이 localStorage 의 `device` 를 저절로 붙인다 — Plan 2 에서 그렇게 했다. 그래서 여기서 device 를 넘기지 않는다.)

- [ ] **Step 2: 커밋**

```bash
git add js/api.js
git commit -m "feat(연락처): js/api.js lifeContactSave 래퍼 (개발)"
```

---

### Task 8: app.js — 사역신청 번호 칸 가드 + 연락처 창

**Files:**
- Modify: `app.js` (`lifeEnter` ~4763 · 사역 confirm 렌더 ~12821 · `wireMinConfirm` 제출 ~12860 · 새 `openLifeContact`)

**Interfaces:**
- Consumes: `api.lifeContactSave`(Task 7), `api.ministryApply`.
- Produces: 모듈 변수 `lifeGateOn`(bool) · 함수 `openLifeContact(user): Promise<string|null>`.

- [ ] **Step 1: `lifeGateOn` 모듈 변수 + `lifeEnter` 에서 채우기**

`lifeDevice()` 함수 근처(~4759)에 더한다:
```js
let lifeGateOn = false;   // 확인 번호 문이 이 분에게 켜져 있나 — 사역신청 번호 칸을 가린다
```
`lifeEnter` 안에서 `const state = g && g.state;` 바로 아래에:
```js
  lifeGateOn = state !== "off";
```

- [ ] **Step 2: 사역 confirm 렌더 — 번호 칸을 가드** (~line 12821, `min-p4 … min-phone` 블록)

지금의 번호 입력 블록 + 안내문을 `lifeGateOn` 으로 가른다. 지금:
```js
    '<div class="min-p4"><label for="min-phone">휴대폰</label>' +
      '<input id="min-phone" type="tel" inputmode="numeric" maxlength="13" placeholder="010-1234-5678"' +
      ' value="' + minEsc(pilsaPhoneFmt(minPhoneVal)) + '" autocomplete="off"></div>' +
    '<div class="min-note">' + (minMine ? '처음 신청하실 때 넣은 번호와 같아야 고쳐집니다. ' : '') +
      '직분과 휴대폰 번호는 <b>본인 확인·교적 대조와 임명 뒤 연락</b>에 씁니다. ' +
      '번호는 임명·취소가 정해진 뒤 지울 수 있고, <b>늦어도 180일</b>이 지나면 저절로 지웁니다.</div>' +
```
바꿔:
```js
    (lifeGateOn ? '' :
      '<div class="min-p4"><label for="min-phone">휴대폰</label>' +
        '<input id="min-phone" type="tel" inputmode="numeric" maxlength="13" placeholder="010-1234-5678"' +
        ' value="' + minEsc(pilsaPhoneFmt(minPhoneVal)) + '" autocomplete="off"></div>') +
    '<div class="min-note">' +
      (lifeGateOn
        ? '직분은 <b>임명</b>에 씁니다. 연락처는 <b>교적</b>에서 확인하며, 교적과 다를 때만 한 번 여쭤봐요.'
        : ((minMine ? '처음 신청하실 때 넣은 번호와 같아야 고쳐집니다. ' : '') +
           '직분과 휴대폰 번호는 <b>본인 확인·교적 대조와 임명 뒤 연락</b>에 씁니다. ' +
           '번호는 임명·취소가 정해진 뒤 지울 수 있고, <b>늦어도 180일</b>이 지나면 저절로 지웁니다.')) +
      '</div>' +
```

- [ ] **Step 3: `openLifeContact` 창 더하기** (`openLifePin` 함수 근처 ~4806 뒤)

```js
// 교적과 안 맞은 분이 사역신청 저장 때 연락처를 한 번 남기는 창. 저장하면 true, 닫으면 false.
function openLifeContact(user) {
  return new Promise((resolve) => {
    const old = document.getElementById("lp-modal"); if (old) old.remove();
    const wrap = document.createElement("div"); wrap.id = "lp-modal"; wrap.className = "am-overlay";
    wrap.innerHTML = `
      <div class="am-card" role="dialog" aria-modal="true" aria-labelledby="lp-title">
        <div class="am-ico" aria-hidden="true">📞</div>
        <div class="am-title" id="lp-title">연락처를 남겨 주세요</div>
        <div class="am-msg">교적에 등록된 번호와 맞지 않아요.<br><span class="lp-sub">담당자가 임명·연락에 씁니다. 늦어도 180일이 지나면 저절로 지워요.</span></div>
        <input class="lp-pin" id="lp-contact" type="tel" inputmode="numeric" maxlength="13" placeholder="010-1234-5678" autocomplete="off" aria-label="휴대폰 번호" />
        <div class="lp-err" role="alert" hidden></div>
        <div class="am-btns">
          <button type="button" class="am-btn am-cancel">그만두기</button>
          <button type="button" class="am-btn am-ok" id="lp-contact-ok">남기기</button>
        </div>
      </div>`;
    const errEl = wrap.querySelector(".lp-err");
    const input = wrap.querySelector("#lp-contact");
    const close = (v) => { wrap.classList.remove("show"); setTimeout(() => wrap.remove(), 160); resolve(v); };
    input.addEventListener("input", function () { this.value = pilsaPhoneFmt(this.value); });
    wrap.addEventListener("click", (e) => { if (e.target === wrap) close(false); });
    wrap.querySelector(".am-cancel").addEventListener("click", () => close(false));
    wrap.querySelector("#lp-contact-ok").addEventListener("click", async () => {
      const ph = pilsaPhoneFmt(input.value);
      if (!pilsaPhoneOk(ph)) { errEl.textContent = "010-1234-5678 꼴로 넣어 주세요."; errEl.hidden = false; input.focus(); return; }
      try {
        const r = await api.lifeContactSave(myUserId(), ph);
        if (r && r.ok) { close(true); return; }
        errEl.textContent = (r && r.error === "pin-needed") ? "본인 확인이 필요해요. 다시 들어와 주세요." : "지금은 남기지 못했어요."; errEl.hidden = false;
      } catch (_) { errEl.textContent = "연결이 고르지 않아요. 잠시 뒤 다시 눌러 주세요."; errEl.hidden = false; }
    });
    document.body.appendChild(wrap);
    requestAnimationFrame(() => { wrap.classList.add("show"); input.focus(); });
  });
}
```

- [ ] **Step 4: `wireMinConfirm` 제출 — 번호 검사 가드 + contact-needed 처리** (~line 12867)

지금:
```js
    minPhoneVal = phel ? pilsaPhoneFmt(phel.value) : "";
    if (!pilsaPhoneOk(minPhoneVal)) {
      minAlert("휴대폰 번호를 010-1234-5678 꼴로 넣어 주세요.");
      if (phel) phel.focus();
      return;
    }
```
바꿔(켜진 분은 번호 칸이 없으니 검사하지 않는다):
```js
    minPhoneVal = phel ? pilsaPhoneFmt(phel.value) : "";
    if (!lifeGateOn && !pilsaPhoneOk(minPhoneVal)) {
      minAlert("휴대폰 번호를 010-1234-5678 꼴로 넣어 주세요.");
      if (phel) phel.focus();
      return;
    }
```
그리고 `order` 를 보낸 뒤 dup-phone 처리 블록 **앞**에 contact-needed 처리를 더한다(~line 12883, `let r = await api.ministryApply(order);` 바로 아래):
```js
      // 교적과 안 맞은 분: 연락처를 한 번 받고 다시 보낸다(확인 번호 문이 켜진 경우만 온다)
      let contactTries = 0;
      while (r && r.confirm === "contact-needed" && contactTries < 1) {
        contactTries++;
        const ok = await openLifeContact(u);
        if (!ok) { renderMinistry(); return; }
        r = await api.ministryApply(order);
      }
```
(⚠️ `order` 에 `phone: minPhoneVal` 이 그대로 들어가도 서버는 켜진 분에게 번호를 무시한다 — 그대로 둔다.)

- [ ] **Step 5: localhost 확인**

Run: `python -m http.server 8000` (내가 띄운 포트만 쓴다)
개발 DB(오른쪽 위 「개발 DB」 띠)에서, 스위치를 개발에서 `test`/`on` 으로 켠 상태로 시험 계정 로그인 → 사역신청에 **번호 칸이 없고**, 교적 안 맞으면 📞 연락처 창이 뜨는지. 스위치 off 로 되돌린 계정은 **번호 칸이 그대로** 보이는지.

- [ ] **Step 6: bump + 커밋**

Run: `python tools/bump.py`  (로컬 확인용 · ⚠️ 운영 반영 때 친구가 한 번 더 — Global Constraints)
```bash
git apply --cached <(git diff -- app.js)
git add js/api.js index.html style.css sw.js   # bump 가 건드린 것 — 단, 공용 파일은 diff --cached 로 확인
git commit -m "feat(사역신청): 확인 번호 켜진 분은 번호 칸을 가리고, 교적 안 맞으면 연락처 창 + bump (개발)"
```
(⚠️ bump 로 바뀐 `index.html` 등은 다른 세션과 충돌하기 쉽다 — 운영 반영 세션에서 친구가 bump 를 다시 돌리는 것이 규칙이므로, 여기 커밋은 **개발 확인용**이고 PR/운영에는 bump 를 다시 맞춘다.)

---

### Task 9: 자체 점검 + 개발 확인 요약

- [ ] **Step 1: preflight 한 번 더**

Run: `python tools/preflight.py` → 전부 통과.

- [ ] **Step 2: 순수 테스트 + 스모크 다시**

Run: `node --test tests/life-pin.test.cjs` → PASS
Run: `set -a; . ./.env.dev; set +a; EVT_ENV=dev python tests/life-pin-smoke.py` → 실패 0

- [ ] **Step 3: 스위치 off 회귀 — 운영 흐름이 그대로인지(개발에서)**

개발 스위치를 **off** 로 둔 채 시험 계정으로 `ministryApply`(번호 포함) 한 번 → 지금처럼 저장되는지. `ministryApply`(번호 틀림) → "휴대폰 번호를 확인해 주세요" 가 그대로 뜨는지. (스위치 off = 운영 현재 상태이므로, 운영에 배포해도 변화가 없음을 이걸로 확인한다.)

- [ ] **Step 4: 메모리·백로그 한 줄**

`MEMORY.md` 의 `security-hardening-2026-10` 에 「Plan 5 개발 완료」 한 줄, CLAUDE.md 「다음 작업」의 확인 번호 줄에 Plan 5 상태를 갱신(운영 미반영).

---

## 운영 반영(이 계획 밖 · 친구와 함께)

§9 step 4→5. 차례: ① `life_contacts.sql`·`member_merge.sql` 운영에서 돌린다 → ② `api` 운영 배포(`xnomlgydifiqiybervtf`) — 스위치 off 라 성도님 변화 없음, 배포 직후 사역신청(번호 포함) 한 번이 그대로 되는지 확인 → ③ 친구가 `bump.py` 한 번 → 앱 배포 → ④ (Plan 4 운영 church-admin 배포가 아직이면 함께) → ⑤ 스위치 `test` 로 시험 참여자 한 바퀴(설계 §9 step 5). **방침·공지 새 문장은 플레이 심사 뒤**(step 6).

## 자체 점검(writing-plans Self-Review)

- **스펙 커버리지:** §5 「ministryApply 번호 요구 안 함」=Task 4 · 「ministry_orders.phone 남김/종이 명단」=그대로 둠(Task 4 는 phone 칸만 다룸) · 「담당자 연락처 life_contacts→교적」=Task 1·3(life_contacts) + 교적은 Plan 4 로 이어짐 · 「필사 번호 받되 내 신청 가리기」=Task 2·5 · §11-4 180일=`LIFE_CONTACT_DAYS`(Task 3) · member_merge=Task 1.
- **플레이스홀더:** Task 6 스모크의 ⑦ 는 실제 헬퍼 이름에 맞춰 채운다고 명시 — 실행자가 파일 위쪽 패턴을 보고 채운다(그 외 TODO 없음).
- **타입 일관성:** `maskPhone`(Task 2) ↔ Task 5 사용 · `lifeActive`/`lifePersonLinked`/`lifeContactPhone`(Task 3) ↔ Task 4 사용 · `lifeGateOn`/`openLifeContact`(Task 8) 내부 일치 · `lifeContactSave`(Task 3 서버 ↔ Task 7 래퍼 ↔ Task 8 호출) 이름 같음.
