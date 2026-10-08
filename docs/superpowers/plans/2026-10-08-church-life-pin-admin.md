# 교회 생활 확인 번호 — 담당자 풀기 (Plan 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. 체크박스(`- [ ]`)로 추적.

**Goal:** 교회 어드민(admin.onlybible.kr)에 **「🔑 확인 번호 풀기」** 메뉴를 더해, 번호를 잊었거나 남이 먼저 정한 성도님을 **총괄 관리자**가 풀어 준다. 이것이 있어야 확인 번호를 시험 참여자에게 켤 수 있다(지금은 풀 길이 없어 못 켠다).

**Architecture:** 성경암송 앱의 `lifeResetRequest`(Plan 1)가 `life_reset_requests` 에 쌓은 요청을, 교회 어드민 함수가 **같은 Supabase DB 를 service_role 로 읽어** 목록으로 보여 준다. 「풀기」를 누르면 그분의 `life_pins`·`life_devices` 를 지우고(다음에 새로 정하게) 요청을 done 으로 바꾼다. 역할은 **super(총괄)** 만(친구 결정 1). 기존 「정정 신청」(historyRequest) 화면과 같은 틀.

**Tech Stack:** church-admin 저장소(`C:\Projects\church-admin`) · Deno Edge Function `church-admin` · 화면은 ES 모듈(`js/menus/system/*.js`) · 캐시태그는 Actions 의 `stamp.py` 가 자동(손 bump 없음).

## Global Constraints

- 저장소: **church-admin**(`C:\Projects\church-admin`). 성경암송이 아니다. 작업 폴더가 origin/main 과 같은지 먼저 본다(`git -C C:\Projects\church-admin fetch && git rev-list --count HEAD..origin/main` = 0).
- 배포: 함수는 **개발 먼저** `supabase functions deploy church-admin --project-ref ktpwthwqzgcqcrmsafdo` → 확인 → 운영 `xnomlgydifiqiybervtf`. 이 Plan 은 **개발까지**.
- SQL 새 표 없음(Plan 1 의 `life_reset_requests`·`life_pins`·`life_devices` 를 읽고 지운다). **개발·운영 둘 다 life_pin.sql 이 이미 돌아 있어야** 한다(개발 됨 · 운영은 Plan 1 운영 반영 때).
- 응답에 `user_id`·`pin_hash`·`token_hash` 를 **싣지 않는다**(이름·소속·요청 시각만).
- 바꾼 것은 `admin_audit` 에 남긴다(기존 `audit(ctx, action, target, detail)` · detail 에 개인정보·번호 금지).
- 커밋 전 `git -C C:\Projects\church-admin status` 로 남의 미커밋 코드 확인. 공용 파일(index.ts·authz.ts·registry.js)은 내 헝크만.
- church-admin preflight: `python C:\Projects\church-admin\tools\preflight.py` (push 전).

## File Structure

- `supabase/functions/church-admin/authz.ts` — **Modify.** `ACTION_ROLES` 에 `lifeResetList: "super"`·`lifeResetDo: "super"`.
- `supabase/functions/church-admin/index.ts` — **Modify.** 두 함수 + 두 case(kakao+role 갈래 2492- 부근).
- `js/menus/registry.js` — **Modify.** 시스템 그룹에 메뉴 한 줄.
- `js/menus/system/life-reset.js` — **Create.** 목록+풀기 화면(testers.js 틀).

이 Plan 밖(후속):
- **Plan 4(교적 맞대기):** 성경암송 api 가 이름+4자리를 교인명부와 맞대 교적ID 를 잇는다(`internalPinMatch` · 설계 §5). 신청 저장 때·새 명부 올린 뒤.
- **Plan 5(사역신청 번호 빼기 + 연락처):** `ministryApply` 번호 칸 걷기 · `life_contacts`(교적 안 맞은 분만) · 「내 신청」 번호 가리기.

---

## Task 1: 서버 — 풀기 목록·풀기 실행

**Files:**
- Modify: `supabase/functions/church-admin/authz.ts`(ACTION_ROLES)
- Modify: `supabase/functions/church-admin/index.ts`

**Interfaces:**
- Produces: 액션 `lifeResetList`(super) → `{ ok, rows:[{ id, name, who, at }] }` · `lifeResetDo`(super) `{ request_id }` → `{ ok }`. `user_id` 는 응답에 없다.

- [ ] **Step 1: authz.ts ACTION_ROLES 에 두 줄 (auditList: "super" 아래)**

```ts
  auditList: "super",
  // 교회 생활 확인 번호 풀기(2026-10-08) — 번호를 잊었거나 남이 먼저 정한 분을 총괄이 푼다.
  lifeResetList: "super",
  lifeResetDo: "super",
```

- [ ] **Step 2: index.ts 에 두 함수 (membersSetStatus 근처 · super 전용 함수들 옆)**

⚠️ 이름·소속은 성경암송 `users`(같은 DB)에서 가져온다. `db` 는 이 파일의 service_role 클라이언트.

```ts
// 교회 생활 확인 번호 풀기(2026-10-08 · 설계 docs 성경암송 2026-10-08-church-life-pin-design.md §7)
// 성경암송 앱 lifeResetRequest 가 life_reset_requests 에 쌓은 열린 요청을 보여 주고, 풀면 그분 번호·기기를 지운다.
async function lifeResetList() {
  const { data, error } = await db.from("life_reset_requests")
    .select("id,user_id,created_at").eq("status", "open").order("created_at", { ascending: true }).limit(200);
  if (error) throw error;
  const reqs = (data ?? []) as { id: number; user_id: string; created_at: string }[];
  const ids = [...new Set(reqs.map((r) => r.user_id))];
  const who = new Map<string, { name: string; gu: string; mok: string; bu: string; grade: string; type: string }>();
  if (ids.length) {
    const u = await db.from("users").select("id,name,gu,mok,bu,grade,type").in("id", ids);
    for (const x of (u.data ?? []) as any[]) who.set(x.id, x);
  }
  const whoText = (x: any) => !x ? "앱 계정을 찾을 수 없어요"
    : (x.type === "교구" ? [x.gu, x.mok].filter(Boolean).join("-") : [x.bu, x.grade].filter(Boolean).join(" "));
  const rows = reqs.map((r) => {
    const x = who.get(r.user_id);
    return { id: r.id, name: x ? x.name : "(알 수 없음)", who: whoText(x), at: r.created_at };
  });
  return { ok: true, rows };
}

async function lifeResetDo(ctx: Ctx, b: any) {
  const reqId = Number(b.request_id);
  if (!Number.isFinite(reqId)) return { ok: false, error: "bad-args" };
  const { data: r, error } = await db.from("life_reset_requests").select("user_id,status").eq("id", reqId).maybeSingle();
  if (error) throw error;
  if (!r) return { ok: false, error: "not-found" };
  const uid = (r as any).user_id as string;
  // 번호·기기를 지운다 — 다음에 들어올 때 새로 정하게. (요청이 이미 done 이어도 지우는 것은 안전)
  await db.from("life_pins").delete().eq("user_id", uid);
  await db.from("life_devices").delete().eq("user_id", uid);
  await db.from("life_reset_requests").update({ status: "done", handled_at: new Date().toISOString(), handled_by: ctx.member?.id ?? null }).eq("id", reqId);
  // 혹시 같은 분의 다른 열린 요청도 함께 닫는다(여러 번 눌렀을 수 있다)
  await db.from("life_reset_requests").update({ status: "done", handled_at: new Date().toISOString(), handled_by: ctx.member?.id ?? null }).eq("user_id", uid).eq("status", "open");
  await audit(ctx, "life.reset", String(reqId), {});   // 번호·user_id·이름 안 남긴다
  return { ok: true };
}
```

⚠️ `ctx.member?.id` 가 `audit`·`handled_by` 에 맞는 꼴인지(멤버 uuid) 기존 `membersApprove` 등의 `audit` 호출·`handled_by` 쓰임과 대조해 맞춘다. `Ctx` 타입·`audit` 시그니처는 index.ts 머리(107·120 부근).

- [ ] **Step 3: index.ts 분기에 두 case (membersSetStatus case 아래)**

```ts
      case "lifeResetList":    return json(await lifeResetList());
      case "lifeResetDo":      return json(await lifeResetDo(ctx, b));
```

- [ ] **Step 4: 문법·개발 배포**

Run: `python C:\Projects\church-admin\tools\preflight.py`(또는 그 저장소 방식) → 통과
Run: `cd C:\Projects\church-admin && supabase functions deploy church-admin --project-ref ktpwthwqzgcqcrmsafdo`
Expected: `Deployed Functions.`

- [ ] **Step 5: 커밋(church-admin)**

```bash
git -C C:\Projects\church-admin add supabase/functions/church-admin/authz.ts supabase/functions/church-admin/index.ts
git -C C:\Projects\church-admin commit -m "feat(확인 번호 풀기): lifeResetList·lifeResetDo(super) — 번호·기기 지우고 요청 done (개발)"
```

---

## Task 2: 화면 — 「🔑 확인 번호 풀기」

**Files:**
- Create: `js/menus/system/life-reset.js`
- Modify: `js/menus/registry.js`

**Interfaces:**
- Consumes: `call("lifeResetList")`·`call("lifeResetDo", { request_id })` · `core/ui.js`(esc·kstTime·toast·dialog·busy·errorText).

- [ ] **Step 1: `js/menus/system/life-reset.js` (testers.js 틀)**

```js
// 🔑 확인 번호 풀기 — 성경암송 앱에서 「담당자에게 풀어 달라고」 온 요청.
//   풀면 그분의 확인 번호·확인한 기기를 지운다 → 다음에 교회 생활에 들어올 때 새로 정한다.
//   역할 super(총괄)만. 응답에 user_id·번호는 없다.
import { esc, kstTime, toast, dialog, busy, errorText } from "../../core/ui.js";

const TITLE = `<h2 class="page-title">🔑 확인 번호 풀기</h2>`;

function card(r) {
  return `<div class="card" data-id="${r.id}">
    <div><b>${esc(r.name)}</b> <span class="muted">${esc(r.who)}</span></div>
    <div class="muted">요청 ${esc(kstTime(r.at))}</div>
    <div class="acts"><button type="button" class="btn primary" data-act="reset">풀어 주기</button></div>
  </div>`;
}

export async function render(el, { call }) {
  el.innerHTML = TITLE + `<p class="empty">불러오는 중…</p>`;
  const r = await call("lifeResetList");
  if (!r.ok) { el.innerHTML = TITLE + `<p class="empty">${esc(errorText(r))}</p>`; return; }
  const draw = (rows) => {
    el.innerHTML = TITLE
      + `<p class="muted">번호를 잊었거나, 남이 먼저 정해 못 들어오는 분이 보낸 요청이에요. 풀어 주면 그분이 다음에 새로 정해요.</p>`
      + (rows.length ? rows.map(card).join("") : `<p class="empty">기다리는 요청이 없어요.</p>`);
    el.querySelectorAll('[data-act="reset"]').forEach((btn) => {
      btn.addEventListener("click", async () => {
        const wrap = btn.closest(".card"); const id = Number(wrap.dataset.id);
        const name = wrap.querySelector("b")?.textContent || "이분";
        const okGo = await dialog({ title: "확인 번호를 풀까요?", text: `${name}의 확인 번호를 지워요. 그분이 다음에 교회 생활에 들어올 때 새로 정하게 돼요.`, ok: "풀어 주기", cancel: "그만두기" });
        if (!okGo) return;
        await busy(el, async () => {
          const d = await call("lifeResetDo", { request_id: id });
          if (d.ok) { toast("풀었어요."); rows = rows.filter((x) => x.id !== id); draw(rows); }
          else toast(errorText(d));
        });
      });
    });
  };
  let rows = r.rows || [];
  draw(rows);
}
```

⚠️ `dialog`·`busy`·`toast` 의 정확한 인자는 `js/core/ui.js`(dialog 41·busy 74·toast 24·errorText 154)에서 대조해 맞춘다(위는 기존 화면 쓰임 기준 · 다르면 그 화면들과 같게). `card` 클래스·`.acts`·`.btn primary`·`.muted`·`.empty` 는 testers.js 와 같은 기존 클래스.

- [ ] **Step 2: registry.js 시스템 그룹에 메뉴 (audit 아래 · role super)**

```js
  { id: "life-reset", group: "시스템", icon: "🔑", label: "확인 번호 풀기", desc: "교회 생활 확인 번호를 잊은 분 풀어 주기",
    role: "super", load: () => import("./system/life-reset.js") },
```

- [ ] **Step 3: 문법·배포(화면은 Actions 의 stamp.py 가 캐시태그)**

Run: `node --check js/menus/system/life-reset.js` → OK
Run: `python C:\Projects\church-admin\tools\preflight.py` → 통과

- [ ] **Step 4: 커밋·푸시(church-admin — 화면은 push 하면 Actions 가 배포·stamp)**

```bash
git -C C:\Projects\church-admin add js/menus/system/life-reset.js js/menus/registry.js
git -C C:\Projects\church-admin commit -m "feat(확인 번호 풀기): 🔑 확인 번호 풀기 화면(super) + 메뉴 (개발·배포)"
git -C C:\Projects\church-admin push origin main   # 또는 PR — church-admin 협업 규칙 따름
```

---

## Task 3: 개발 확인

- [ ] **Step 1: 요청 하나 만들고(개발) 풀기까지**

개발 DB 에 시험 계정 + 열린 요청을 만든다:
```bash
cd C:\Projects\bible-memorize-church-app-v2 && set -a; . ./.env.dev; set +a
# 시험 계정 로그인(개발) → uid
UID=$(curl -s "$DEV_API" -d '{"action":"login","type":"교구","gu":"풀기확인","mok":"1","name":"풀기대상"}' -H "apikey: $DEV_ANON" -H "Content-Type: application/json" | python -c "import sys,json;print(json.load(sys.stdin)['user_id'])")
# 그 계정으로 번호 정하고(스위치 임시 on 필요) 요청 — 또는 SQL 로 life_reset_requests 한 줄
```
간단히 SQL 로: `insert into life_reset_requests(user_id) values ('<uid>');` + `insert into life_pins(user_id,pin_hash) values('<uid>','x');`(지워지는지 보려고).

- [ ] **Step 2: 교회 어드민 개발에서 확인**

church-admin 개발 화면(로컬 또는 개발 배포)에서 총괄로 로그인 → 🔑 확인 번호 풀기 → 그 요청이 **이름·소속**으로 보이나 → 「풀어 주기」 → 토스트 → 목록에서 사라짐.
SQL 로 확인: `select count(*) from life_pins where user_id='<uid>'`(0 이어야) · `select status from life_reset_requests where user_id='<uid>'`(done).
응답에 user_id·pin_hash 없는지(개발자도구 네트워크).

- [ ] **Step 3: 치우기**

```sql
delete from life_reset_requests where user_id='<uid>'; delete from life_pins where user_id='<uid>'; delete from users where id='<uid>';
```

- [ ] **Step 4: 친구 확인 — 이제 켤 수 있다**

Plan 1(서버)·2(화면)·3(풀기)이 개발에 다 있으면 **확인 번호를 시험 참여자에게 켤 준비 완료**. 운영 반영 순서(친구와):
1. 운영에 `LIFE_PIN_SECRET`(성경암송 api) 시크릿 · `life_pin.sql` 운영 실행 · api·church-admin 운영 배포.
2. 교회 어드민에서 총괄이 「🔑 확인 번호 풀기」 보이는지.
3. 성경암송 운영 `app_config.lifePin='test'` → 🧪 시험 참여자 몇 분께 「교회 생활 들어갈 때 번호 한 번 정하시게 됩니다」 안내 → 한 바퀴(정하기·다른 폰·잊어서 풀기).
4. 방침(개인정보 — 확인 번호·기기·연락처) · 플레이 심사 뒤 `'on'`.
⚠️ Plan 4(교적 맞대기)·5(사역신청 번호 빼기)는 켠 뒤에 더해도 된다 — 켜는 데 꼭 필요한 건 풀기(이 Plan)까지다.

## Self-Review

**1. Spec 커버(설계 §7):** 「🔑 확인 번호 풀기」 메뉴(Task 2) · 요청 목록·풀기(Task 1) · super 만(authz) · user_id 안 실음 · 바꾼 기록(audit). 교적 이어짐 표시·잘못 이어진 것 풀기는 Plan 4. 연락처는 Plan 5.
**2. Placeholder:** 서버 두 함수·화면·registry 완전한 코드. ⚠️ 두 곳은 「기존과 대조」로 적음(실행자가 확인): `audit`·`ctx.member.id`·`handled_by` 꼴(index.ts 기존 호출), `dialog/busy/toast` 인자(ui.js) — church-admin 관용구라 그 저장소 코드에 맞춘다. 이건 placeholder 가 아니라 「이 저장소 패턴을 따르라」는 지시(파일·함수·줄 명시).
**3. Type 일관:** `lifeResetList`·`lifeResetDo` 이름이 authz·index·화면에서 일치. `request_id` 키 일치. life_pins·life_devices·life_reset_requests 칸이 Plan 1 SQL 과 일치(user_id·status·handled_at·handled_by).
