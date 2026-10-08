# 교회 생활 확인 번호 — 교적 맞대기 (Plan 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. 체크박스로 추적.
> ⚠️ **먼저 친구 결정(§0) 셋을 받고 시작한다.** 이 Plan 은 저장 자리·언제 맞대는지에 결정이 남아 있다.

**Goal:** 확인 번호(= 휴대폰 뒷자리 4자리)를 정한 분을 **교인명부(church_people)와 맞대** 같은 사람이면 **교적ID(person_id)를 이어 둔다**(친구 결정 8). 이름이 같고 뒷자리까지 같은 **한 분으로 딱 좁혀질 때만** 자동으로 잇는다. 담당자 화면에 「교적과 이어짐 / 아직 안 이어짐」을 보인다.

**Architecture:** 번호 자체는 어디에도 없고 해시만 있다(`life_pins.pin_hash` = `HMAC(LIFE_PIN_SECRET, "life-pin|"+user_id+"|"+pin)`). 교회 어드민이 **같은 비밀값**으로 교인명부의 **연락처 뒷자리 4**로 같은 해시를 만들어 본다(번호를 주고받지 않는다). 맞는 분이 **정확히 하나**면 그 person_id 를 잇는다. api 가 교회 어드민을 내부 키로 역호출(`internalPinMatch`) — 교육·당번 알림과 같은 길.

**Tech Stack:** 성경암송 `api`(internalPinMatch 호출·person_id 저장) · 교회 어드민 `church-admin`(맞대기·교인명부 읽기) · 두 함수 같은 Supabase 프로젝트.

## 0. 친구 결정 (시작 전 · 셋)

1. **자동 잇기 기준** — 이름이 같고 뒷자리까지 같은 분이 **정확히 1명**일 때만 자동으로 잇는다(제안). 2명 이상이면 안 잇고 담당자가 고른다. (더 엄격히: 이름+소속+뒷자리까지 봐도 됨 — church_people 에 소속 칸이 있으면.)
2. **언제 맞대나** — ① 성도님이 **교회 생활에 들어와 번호를 정한 직후**(바로 맞대 둔다) ② **새 명부를 올린 뒤**(그때 안 이어진 분 다시). 제안: 둘 다. (①만, 또는 신청 저장 때만도 가능.)
3. **못 이어진 분 처리** — 그냥 「아직 안 이어짐」으로 두고 담당자가 「자세히」에서 손으로 잇는다(교인명부에 이미 「이분 것/이분 아님」이 있다). 새 길을 안 만든다(제안).

⚠️ **Plan 5(사역신청 번호 빼기)와 얽혀 있다.** 「교적과 맞나」= person_id 가 이어졌나 로 Plan 5 가 번호를 받을지 정한다. Plan 4 를 먼저 하고 Plan 5 가 그 결과를 쓴다.

## File Structure

- `supabase/life_pin.sql` — **Modify.** `life_pins` 에 `person_id int` · `person_how text`(auto·staff·no) · `matched_at timestamptz`. (또는 §0-1 결정에 따라 작은 표.)
- `supabase/functions/api/index.ts` — **Modify.** 번호 정한 직후·신청 저장 때 `internalPinMatch` 호출 → 응답의 person_id 를 life_pins 에 저장. 「교적과 맞나」를 쓰는 자리(Plan 5)에서 읽는다.
- `C:\Projects\church-admin\supabase\functions\church-admin\index.ts` — **Modify.** 내부 액션 `internalPinMatch`(internalKeyOk 갈래).
- `C:\Projects\church-admin\supabase\functions\church-admin\people-match.ts` — **읽고 재사용**(이름·연락처 맞대기 순수 함수가 이미 있다). 뒷자리 해시 비교만 더한다.
- 교회 어드민 담당자 화면(신청 현황·자세히) — 「교적과 이어짐/아직」 표시. (이미 people_links 로 신청 줄을 잇고 있으니 그 표시 자리에 계정 이음도.)

## Task 1: 표 — life_pins 에 교적 칸

- [ ] **Step 1: life_pin.sql 에 칸 더하기(여러 번 돌려도 되게)**

```sql
alter table public.life_pins add column if not exists person_id  int;
alter table public.life_pins add column if not exists person_how text not null default '';   -- auto · staff · no(못 맞춤)
alter table public.life_pins add column if not exists matched_at timestamptz;
create index if not exists life_pins_person on public.life_pins (person_id) where person_id is not null;
```
개발 → 운영. ⚠️ 응답에 person_id 를 **싣지 않는다**(담당자 화면도 「이어짐/아직」만).

- [ ] **Step 2: 개발 반영·공개 키 401 확인 · 커밋**

## Task 2: 교회 어드민 — internalPinMatch

**Interfaces:** 내부 액션 `internalPinMatch({ user_id, who })` → `{ ok, matched: "one"|"none"|"many", person_id? }`. x-internal-key 로만.

- [ ] **Step 1: people-match.ts 를 읽어 이름 맞대기·연락처 뒷자리 꺼내는 규칙 확인**

church_people 의 `phone1`·`phone2`·`phone_digits` 에서 뒷자리 4를 꺼낸다(숫자만 · 여러 번호면 각각). 이름 맞대기는 people-match.ts 의 기존 규칙(공백·NFC 등)을 그대로.

- [ ] **Step 2: index.ts 에 internalPinMatch (internalKeyOk 갈래 · internalMyHistory 옆)**

```ts
// 확인 번호 교적 맞대기(2026-10-08) — 번호를 주고받지 않는다. 같은 비밀값으로 교인명부 뒷자리로 해시를 만들어 life_pins.pin_hash 와 본다.
async function internalPinMatch(b: any) {
  const uid = String(b.user_id || ""); const who = b.who && typeof b.who === "object" ? b.who : {};
  if (!uid) return { ok: false, error: "no-user" };
  const secret = Deno.env.get("LIFE_PIN_SECRET") ?? "";
  if (!secret) return { ok: true, matched: "none" };            // 비밀값 없으면 못 맞댄다(막지 않는다)
  const { data: pin } = await db.from("life_pins").select("pin_hash").eq("user_id", uid).maybeSingle();
  if (!pin) return { ok: true, matched: "none" };
  const name = norm(who.name);
  if (!name) return { ok: true, matched: "none" };
  // 이름이 같은 교인(소속으로 더 좁힐 수 있으면 §0-1 대로). 많으면 뒷자리로 가른다.
  const cands = await findPeopleByName(name);                   // people-match.ts/people-query 의 기존 찾기 재사용
  const hit: number[] = [];
  for (const p of cands) {
    for (const last4 of phoneLast4s(p)) {                        // phone1·phone2·phone_digits 에서 뒷자리들
      const h = await hmacHex(secret, "life-pin|" + uid + "|" + last4);   // api 와 같은 공식(life-db 에 옮겨 공유)
      if (h === pin.pin_hash) { hit.push(p.person_id); break; }
    }
  }
  const uniq = [...new Set(hit)];
  if (uniq.length === 1) return { ok: true, matched: "one", person_id: uniq[0] };
  return { ok: true, matched: uniq.length ? "many" : "none" };
}
```
⚠️ `hmacHex`·해시 공식(`"life-pin|"+uid+"|"+pin`)은 **성경암송 api 와 글자까지 같아야** 한다 — 순수 함수로 양쪽이 공유할 파일(life-db.ts 같은)에 두거나, 양쪽에 같은 코드 + 시험으로 고정. ⚠️ `findPeopleByName`·`phoneLast4s` 는 people-match/people-query 의 기존 것을 쓰거나 작은 순수 함수로(시험 포함).

- [ ] **Step 3: 내부 갈래에 case + 배포 · 커밋(church-admin)**

```ts
      case "internalPinMatch": return json(await internalPinMatch(b));
```

## Task 3: 성경암송 api — 맞대 두고 저장

- [ ] **Step 1: 맞대기 도우미 — 번호 정한 직후·신청 저장 때**

```ts
// 아직 안 이어진 계정이면 교회 어드민에 맞대 보고, 한 분으로 좁혀지면 person_id 를 적어 둔다. 실패해도 조용히.
async function lifeMatchPerson(uid: string, who: any) {
  try {
    const { data } = await db.from("life_pins").select("person_id,person_how").eq("user_id", uid).maybeSingle();
    if (!data || data.person_id || data.person_how === "staff") return;   // 이미 이었거나 담당자가 정한 것은 안 건드린다
    const j = await churchAdminInternal({ action: "internalPinMatch", user_id: uid, who });
    if (!j || j.ok !== true) return;
    if (j.matched === "one") await db.from("life_pins").update({ person_id: j.person_id, person_how: "auto", matched_at: new Date().toISOString() }).eq("user_id", uid);
    else await db.from("life_pins").update({ person_how: "no", matched_at: new Date().toISOString() }).eq("user_id", uid);
  } catch (_) { /* 맞대기 실패가 번호 정하기·신청을 막지 않는다 */ }
}
```

- [ ] **Step 2: lifePinSet 성공 뒤 + (Plan 5 에서) 신청 저장 뒤에 부른다**

`lifePinSet` 끝에서 `who = users 에서 읽은 소속·이름`으로 `lifeMatchPerson(uid, who)` (await 하지 말고 뒤에서 돌게 하거나, 응답 전에 한 번). ⚠️ who 는 앱이 보낸 값이 아니라 **users 에서** 읽는다.

- [ ] **Step 3: 개발 배포·스모크** — 교인명부에 「이름=시험·연락처 뒷자리=1234」인 가짜 교인을 개발에 한 줄 넣고, 그 이름+1234 로 번호 정하면 person_id 가 이어지나 · 뒷자리 다르면 안 이어짐 · 동명이인 둘이면 안 이어짐(many).

## Task 4: 담당자 화면 — 교적과 이어짐 표시

- [ ] **Step 1: 신청 현황·자세히에 계정 이음 상태** — 교회 어드민이 그 분의 life_pins.person_how 를 읽어 「교적과 이어짐(auto/staff)」·「아직 안 이어짐(no/빈값)」. 이미 people_links 로 신청 줄을 보여 주는 자리 옆.

- [ ] **Step 2: 잘못 이어진 것 풀기** — 교인명부 「이분 아님」이 계정 이음에도 닿게(person_how='staff' 로 덮거나 지움). §0-3 대로 새 길 최소화.

## Task 5: 새 명부 올린 뒤 다시 맞대기

- [ ] **Step 1: peopleLinkSync(교회 어드민)에 「안 이어진 life_pins 다시 맞대기」 추가** — person_id 가 null 이고 person_how≠'staff' 인 life_pins 를 훑어 internalPinMatch. 수가 많으면 배치. (§0-2 ②)

## 운영 반영·시험
- 해시 공식·findPeopleByName·phoneLast4s 순수 시험(양쪽 같은 값) → preflight.
- 개발 스모크(맞음 one·뒷자리 다름 none·동명이인 many·이미 이어진 것 안 건드림).
- 운영은 Plan 1~3 운영 반영 뒤. ⚠️ 진짜 명부는 저장소 밖 — 개발엔 가짜만.

## Self-Review
**1. 설계 커버(§5·결정 8):** 맞는 순간 이어 둠(Task3)·한 분으로 좁혀질 때만(Task2 one)·담당자 표시(Task4)·새 명부 뒤 다시(Task5)·사람이 정한 줄은 자동이 안 덮음(person_how='staff').
**2. Placeholder:** 핵심(해시 맞대기·저장) 완전. `findPeopleByName`·`phoneLast4s` 는 「people-match.ts 재사용 또는 작은 순수 함수」로 — 그 파일을 읽고 정한다(church-admin 관용구). 담당자 화면 자리는 기존 people_links 표시 옆(파일은 Task4 에서 확인).
**3. Type 일관:** 해시 공식 `"life-pin|"+uid+"|"+last4` 가 api·church-admin 양쪽 같은 글자 · matched "one"/"none"/"many" · person_how "auto"/"staff"/"no".
**4. ⚠️ 가장 큰 위험:** 해시 공식이 두 곳에서 어긋나면 **영영 안 맞댄다**(조용히). 순수 시험으로 양쪽 같은 값을 고정하고, 개발에서 실제로 한 번 이어지는지 본다.
