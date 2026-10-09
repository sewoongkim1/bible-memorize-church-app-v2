# 성도 계정 관리 — 교회 어드민 이전 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 성경암송 `admin-members`(성도 찾기·이름/소속 변경·변경 이력·계정 합치기)를 교회 어드민으로 옮긴다 — 새 메뉴 「👤 성도 계정」 + 새 역할 `members`(합치기만 super). 복잡한 합치기 로직은 성경암송에 그대로 두고 church-admin 이 `db.rpc()` 로 부른다.

**Architecture:** 설계 `docs/superpowers/specs/2026-10-09-church-admin-member-accounts-design.md`. church-admin 은 같은 Supabase 프로젝트를 service_role 로 직접 붙어 `users`·`user_profile_changes` 를 읽고, `admin_update_member_profile`·`admin_preview_member_merge`·`admin_merge_members` RPC(성경암송 소유·service_role grant)를 호출한다. 역할 게이트는 dispatch 전 `canCall(action, member)` 가 `authz.ts ACTION_ROLES` 로 건다.

**Tech Stack:** Deno Edge Function(`church-admin/index.ts`·`authz.ts`) · Postgres(`supabase/sql/017_*.sql`) · Vanilla JS ESM 모듈(`js/menus/people/member-accounts.js` · `core/ui.js` 헬퍼 · `core/api.js` call) · node:test(`tests/registry.test.mjs`·`tests/authz.test.mjs`).

## Global Constraints

- **작업 저장소는 `C:\Projects\church-admin`.** 성경암송(`C:\Projects\bible-memorize-church-app-v2`)은 **3단계(걷기)에서만** 건드린다 — 이 계획의 실행 범위는 church-admin 개발까지. 운영 배포·친구 확인·성경암송 걷기는 별도 단계(아래 「이 계획 밖」).
- **개발 먼저.** church-admin 함수·SQL 은 개발(`ktpwthwqzgcqcrmsafdo`)에 배포·실행하고 확인한 뒤에만 운영을 건드린다(운영은 이 계획 밖).
- **member_merge RPC/트리거/SQL 은 성경암송에 그대로 둔다 — 다시 실행하지 않는다.** church-admin 은 `db.rpc()` 로 부르기만 한다(이미 service_role grant).
- **합치기 패널 전체(미리보기+실행)는 super 전용.** `members` 역할은 찾기·변경·이력만.
- **검색 대상은 `users`(앱 계정)** — 교인명부 `church_people`(교적)가 아니다.
- **역할 게이트는 서버(`canCall`)가 건다.** 화면 숨김은 편의일 뿐.
- 커밋은 경로를 못 박아 스테이징(`git add -A` 금지). 공용 파일(`index.ts`·`authz.ts`·`registry.js`)은 커밋 직전 `git diff --cached` 로 남의 헝크 확인(공유 체크아웃).
- 한글을 서버에 보낼 때 curl 리터럴 금지 — python/UTF-8.

## 파일 지도

- `supabase/sql/017_member_accounts_role.sql` — **새 파일**. 역할 `members` 한 줄(`admin_roles` insert).
- `supabase/functions/church-admin/authz.ts` — `ACTION_ROLES` 에 5액션(`members`×3 · `super`×2).
- `supabase/functions/church-admin/index.ts` — 5액션 함수 + switch 라우팅.
- `js/menus/registry.js` — 메뉴 「👤 성도 계정」 한 줄.
- `js/menus/people/member-accounts.js` — **새 파일**. 화면 모듈(`render(el,{me,call})`).
- `tests/authz.test.mjs` · `tests/registry.test.mjs` — 새 역할·액션·메뉴 반영(자동 파생이면 확인만).

---

### Task 1: 역할 `members` (SQL)

**Files:**
- Create: `supabase/sql/017_member_accounts_role.sql`

**Interfaces:**
- Produces: `admin_roles` 에 `('members','성도 계정','성도 찾기·이름/소속 변경·변경 이력')` 줄. me 응답의 roles_info 라벨·「담당자·역할」 UI 가 이걸 읽는다.

- [ ] **Step 1: 파일 작성** (004 템플릿을 따른다)

```sql
-- 교회 어드민 — 성도 계정 관리 역할 (2026-10-09 · 설계 docs/superpowers/specs/2026-10-09-church-admin-member-accounts-design.md)
-- ⚠️ 개발(ktpwthwqzgcqcrmsafdo) 먼저, 그다음 운영(xnomlgydifiqiybervtf · 운영 배포 날).
-- ⚠️ 이 파일은 역할 한 줄뿐이다. users·user_profile_changes·member_merge 는 성경암송 앱의 것 — 칸·제약·RLS·함수를 바꾸지 않는다.
--    새 표·뷰·함수·정책이 없어 authenticated 노출도 늘지 않는다(운영에서 check-authenticated-exposure.sql 0행 확인).
-- 여러 번 돌려도 안전하다(on conflict do nothing).
begin;

insert into admin_roles (id, label, description) values
  ('members', '성도 계정', '성도 찾기 · 이름/소속 변경 · 변경 이력 (합치기는 총괄만)')
on conflict (id) do nothing;

commit;

select 'role members' as t, count(*) from admin_roles where id = 'members'
union all select 'label 성도 계정', count(*) from admin_roles where id = 'members' and label = '성도 계정';
```

- [ ] **Step 2: 개발 DB 에서 실행** (스크래치를 개발에 link · ⚠️ `--linked` 가 개발인지 users 수로 확인)

Run: `supabase db query --linked -f supabase/sql/017_member_accounts_role.sql`
Expected: 끝 select 가 `role members = 1`, `label 성도 계정 = 1`.

- [ ] **Step 3: 커밋**

```bash
git add supabase/sql/017_member_accounts_role.sql
git commit -m "feat(성도 계정): 역할 members 추가 (개발)"
```

---

### Task 2: authz — 5액션 역할 매핑

**Files:**
- Modify: `supabase/functions/church-admin/authz.ts` (`ACTION_ROLES` 객체 · peopleSearch 근처 ~58)

**Interfaces:**
- Consumes: `ACTION_ROLES`(객체 {action: role|role[]}), `knownRoles()`(값에서 자동 파생 — `members` 가 저절로 들어간다).
- Produces: dispatch 전 `canCall` 이 `memberFind`/`memberUpdate`/`memberHistory` 는 `members`(+super), `memberMergePreview`/`memberMerge` 는 `super` 로 건다.

- [ ] **Step 1: ACTION_ROLES 에 5줄 더한다** (`peopleSearch: "directory",` 줄 아래)

```ts
  memberFind: "members",
  memberUpdate: "members",
  memberHistory: "members",
  memberMergePreview: "super",
  memberMerge: "super",
```

- [ ] **Step 2: knownRoles 에 members 가 자동 포함되는지 확인**

Run: `cd /c/Projects/church-admin && node -e "import('./supabase/functions/church-admin/authz.ts').catch(()=>{});" 2>/dev/null; node --input-type=module -e "const m=await import('./supabase/functions/church-admin/authz.ts'); console.log(m.knownRoles());"`
(Deno TS 라 node 로 못 import 하면 생략 — Task 6 의 authz.test.mjs 가 대신 확인한다.)
Expected: 배열에 `"members"` 포함(없으면 ACTION_ROLES 값 오타).

- [ ] **Step 3: 커밋**

```bash
git apply --cached <(git diff -- supabase/functions/church-admin/authz.ts)
git commit -m "feat(성도 계정): authz — member* 5액션 역할 (members·super) (개발)"
```

---

### Task 3: index.ts — 5액션 + 라우팅

**Files:**
- Modify: `supabase/functions/church-admin/index.ts` (액션 함수 추가 · switch `case "peoplePerson"` 근처 ~2614 에 라우팅)

**Interfaces:**
- Consumes: `db`(service_role 클라이언트), `norm`, `audit(ctx,action,target,detail)`, `identityKey`(있으면 · 없으면 아래 로컬 함수). RPC: `admin_update_member_profile(p_user_id,p_expected_key,p_profile,p_reason)`, `admin_preview_member_merge(p_source_id,p_source_key,p_target_key)`, `admin_merge_members(p_source_id,p_target_id,p_source_key,p_target_key,p_reason)`.
- Produces: 액션 5개. 반환 꼴은 성경암송과 같게 —
  - `memberFind` → `{ ok, users:[{id,type,gu,mok,bu,grade,name,identity_key,created_at,last_seen_at}], more }`
  - `memberUpdate` → RPC 결과(`{ok,user,changed}` 또는 `{ok:false,error}`), 23505 → `{ok:false,error:"identity-conflict"}`
  - `memberHistory` → `{ ok, history:[{id,before_profile,after_profile,reason,created_at}] }`
  - `memberMergePreview` → RPC 결과(`{ok,source,target,source_counts,target_counts}`)
  - `memberMerge` → RPC 결과, 23505 → `{ok:false,error:"merge-record-conflict"}`

- [ ] **Step 1: identityKey 가 index.ts 에 있는지 확인**

Run: `grep -n "function identityKey\|identityKey(" /c/Projects/church-admin/supabase/functions/church-admin/index.ts | head`
있으면 그걸 쓴다. 없으면 authz.ts 의 꼴을 보고 로컬 헬퍼를 둔다(아래 Step 2 는 index.ts 에 identityKey 가 있다고 가정 · 없으면 `"교구|"+gu+"|"+mok+"|||"+name` / `"교회학교|||"+bu+"|"+grade+"|"+name` 꼴로 — ⚠️ 성경암송 `identityKey` 와 **글자까지 같아야** RPC 의 키 비교가 맞는다. 성경암송 `index.ts` 의 `identityKey` 를 먼저 읽어 같은 꼴을 쓴다).

- [ ] **Step 2: 액션 5개 추가** (`peoplePerson` 함수 근처, 사람이 읽기 좋은 자리에)

```ts
// ── 성도 계정 관리 (2026-10-09 · admin-members 이전) — users 를 직접 읽고, 합치기/변경은 성경암송 RPC 를 service_role 로 부른다.
//    역할 게이트는 dispatch 의 canCall 이 건다(members: find/update/history · super: merge).
const MEMBER_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function memberProfile(p: any) {
  const type = norm(p?.type), name = norm(p?.name);
  return { type, name,
    gu: type === "교구" ? norm(p?.gu) : null, mok: type === "교구" ? norm(p?.mok) : null,
    bu: type === "교회학교" ? norm(p?.bu) : null, grade: type === "교회학교" ? norm(p?.grade) : null };
}
function memberProfileOk(pr: any, reason: string): boolean {
  if (!["교구", "교회학교"].includes(pr.type) || !pr.name || pr.name.length > 80) return false;
  if (Object.values(pr).some((v: any) => v && (String(v).length > 80 || /[|<>"\x00-\x1f]/.test(String(v))))) return false;
  if (pr.type === "교구" && (!pr.gu || !/^(\d+|남성)$/.test(pr.mok || ""))) return false;
  if (pr.type === "교회학교" && (!pr.bu || !pr.grade)) return false;
  if (!reason || reason.length > 300) return false;
  return true;
}

async function memberFind(ctx: Ctx, b: any) {
  const q = norm(b.query);
  if (!q || q.length > 80) return { ok: false, error: "invalid-search" };
  const pattern = q.replace(/[\\%_]/g, "\\$&");
  const { data, error } = await db.from("users")
    .select("id,type,gu,mok,bu,grade,name,identity_key,created_at,last_seen_at")
    .ilike("name", `%${pattern}%`).order("name").order("id").limit(51);
  if (error) throw error;
  await audit(ctx, "member.search", "", { q: q.slice(0, 40), n: (data ?? []).length });
  return { ok: true, users: (data ?? []).slice(0, 50), more: (data ?? []).length > 50 };
}

async function memberHistory(_ctx: Ctx, b: any) {
  if (!MEMBER_UUID.test(b.user_id || "")) return { ok: false, error: "invalid-member" };
  const { data, error } = await db.from("user_profile_changes")
    .select("id,before_profile,after_profile,reason,created_at")
    .eq("user_id", b.user_id).order("id", { ascending: false }).limit(20);
  if (error) throw error;
  return { ok: true, history: data ?? [] };
}

async function memberUpdate(ctx: Ctx, b: any) {
  if (!MEMBER_UUID.test(b.user_id || "") || typeof b.expected_key !== "string" || !b.expected_key)
    return { ok: false, error: "invalid-member" };
  const pr = memberProfile(b.profile || {}), reason = norm(b.reason);
  if (!memberProfileOk(pr, reason)) return { ok: false, error: "invalid-profile" };
  const { data, error } = await db.rpc("admin_update_member_profile", {
    p_user_id: b.user_id, p_expected_key: b.expected_key,
    p_profile: { ...pr, identity_key: identityKey(pr) }, p_reason: reason,
  });
  if ((error as any)?.code === "23505") return { ok: false, error: "identity-conflict" };
  if (error) throw error;
  await audit(ctx, "member.update", b.user_id, { reason: reason.slice(0, 60) });
  return data;
}

async function memberMergePreview(_ctx: Ctx, b: any) {
  if (!MEMBER_UUID.test(b.user_id || "") || typeof b.expected_key !== "string" || !b.expected_key || !b.profile)
    return { ok: false, error: "invalid-member" };
  const pr = memberProfile(b.profile);
  const { data, error } = await db.rpc("admin_preview_member_merge", {
    p_source_id: b.user_id, p_source_key: b.expected_key, p_target_key: identityKey(pr),
  });
  if (error) throw error;
  return data;
}

async function memberMerge(ctx: Ctx, b: any) {
  if (b.confirm_same_person !== true || !MEMBER_UUID.test(b.source_id || "") || !MEMBER_UUID.test(b.target_id || "") ||
      b.source_id === b.target_id || typeof b.source_key !== "string" || typeof b.target_key !== "string" ||
      !norm(b.reason) || norm(b.reason).length > 300)
    return { ok: false, error: "invalid-merge" };
  const { data, error } = await db.rpc("admin_merge_members", {
    p_source_id: b.source_id, p_target_id: b.target_id, p_source_key: b.source_key,
    p_target_key: b.target_key, p_reason: norm(b.reason),
  });
  if ((error as any)?.code === "23505") return { ok: false, error: "merge-record-conflict" };
  if (error) throw error;
  await audit(ctx, "member.merge", b.source_id + "→" + b.target_id, { reason: norm(b.reason).slice(0, 60) });
  return data;
}
```

- [ ] **Step 3: switch 라우팅 5줄 추가** (`case "peoplePerson": ...` 아래)

```ts
      case "memberFind":         return json(await memberFind(ctx, b));
      case "memberHistory":      return json(await memberHistory(ctx, b));
      case "memberUpdate":       return json(await memberUpdate(ctx, b));
      case "memberMergePreview": return json(await memberMergePreview(ctx, b));
      case "memberMerge":        return json(await memberMerge(ctx, b));
```

- [ ] **Step 4: 커밋**

```bash
git apply --cached <(git diff -- supabase/functions/church-admin/index.ts)
git commit -m "feat(성도 계정): index.ts 5액션 — users 검색·변경·이력·합치기(RPC 호출) (개발)"
```

---

### Task 4: registry — 메뉴 「👤 성도 계정」

**Files:**
- Modify: `js/menus/registry.js` (교인명부 그룹 · `people-stats` 줄 아래 ~10)

**Interfaces:**
- Consumes: MENUS 배열 꼴 `{ id, group, icon, label, desc, role, load }`. 역할은 서버 authz 가 아는 것이어야(registry.test 가 강제) — Task 2 로 `members` 등록됨.

- [ ] **Step 1: 메뉴 한 줄 추가**

```js
  { id: "member-accounts", group: "교인명부", icon: "👤", label: "성도 계정", desc: "앱 계정 찾기 · 이름/소속 변경 · 변경 이력 · 합치기(총괄)",
    role: "members", load: () => import("./people/member-accounts.js") },
```

- [ ] **Step 2: 커밋**

```bash
git apply --cached <(git diff -- js/menus/registry.js)
git commit -m "feat(성도 계정): 메뉴 「👤 성도 계정」 (개발)"
```

---

### Task 5: 화면 모듈 member-accounts.js

**Files:**
- Create: `js/menus/people/member-accounts.js`

**Interfaces:**
- Consumes: `render(el, { me, call })` 계약(main.js:143). `me.roles` 로 super 판단. `call(action,payload)`(core/api.js). UI 헬퍼 `esc,toast,dialog,busy,errorText`(core/ui.js). 서버 액션: `memberFind`·`memberHistory`·`memberUpdate`·`memberMergePreview`·`memberMerge`.
- Produces: 검색→수정→이력→합치기 화면. 합치기 패널·버튼은 `me.roles.includes("super")` 일 때만. 비-super 가 소속 충돌을 만나면 「총괄에게 합치기를 요청하세요」 안내.

- [ ] **Step 1: 모듈 작성** (admin-members.js 로직을 church-admin 계약으로 옮긴다)

```js
// 👤 성도 계정 — 앱 계정(users) 찾기 · 이름/소속 변경 · 변경 이력 · 합치기(총괄만).
//   성경암송 admin-members 를 옮겨 왔다(2026-10-09). 합치기 로직(RPC)은 성경암송에 그대로 두고 서버가 부른다.
//   역할 members: 찾기·변경·이력. super: 합치기 패널 전체.
import { esc, toast, dialog, busy, errorText } from "../../core/ui.js";

const TITLE = `<h2 class="page-title">👤 성도 계정</h2>`;
const norm = (v) => String(v || "").trim().replace(/\s+/g, " ");
const label = (u) => u.type === "교구"
  ? `${u.name} · ${u.gu}교구 ${u.mok}목장`
  : `${u.name} · ${u.bu} ${u.grade || ""}`;
const COUNT_LABELS = { challenge_log: "암송·도전", progress: "진도", reviews: "복습", passage_progress: "긴 본문",
  board_posts: "게시글", board_replies: "답글", event_entries: "이벤트 참여", pilsa_orders: "필사 신청",
  ministry_orders: "사역 신청", event_signups: "상세 이벤트 신청", push_subscriptions: "알림 기기" };

export async function render(el, { me, call }) {
  const isSuper = !!(me && Array.isArray(me.roles) && me.roles.includes("super"));
  el.innerHTML = TITLE + `
    <form id="ma-search" class="row"><input id="ma-q" type="search" placeholder="이름으로 찾기" maxlength="80" autocomplete="off">
      <button class="btn primary" type="submit">찾기</button></form>
    <p id="ma-sstatus" class="muted"></p>
    <div id="ma-results"></div>
    <div id="ma-editor"></div>`;

  const $ = (id) => el.querySelector("#" + id);
  let selected = null, saving = false;

  function setStatus(id, text) { const n = $(id); if (n) n.textContent = text || ""; }

  async function search(q) {
    selected = null; $("ma-editor").innerHTML = ""; $("ma-results").innerHTML = "";
    setStatus("ma-sstatus", "찾는 중…");
    try {
      const d = await call("memberFind", { query: q });
      if (!d.ok) { setStatus("ma-sstatus", errorText(d)); return; }
      setStatus("ma-sstatus", d.more ? "50명까지만 보여요. 이름을 더 좁혀 주세요." : `${d.users.length}명`);
      $("ma-results").innerHTML = d.users.map((u) =>
        `<div class="card ma-row" data-u='${esc(JSON.stringify(u))}'>
          <div><b>${esc(label(u))}</b><div class="muted">등록 ${new Date(u.created_at).toLocaleDateString("ko-KR")} · 최근 ${u.last_seen_at ? new Date(u.last_seen_at).toLocaleDateString("ko-KR") : "없음"}</div></div>
          <button type="button" class="btn" data-act="edit">수정</button></div>`).join("");
      $("ma-results").querySelectorAll('[data-act="edit"]').forEach((btn) =>
        btn.addEventListener("click", () => openEdit(JSON.parse(btn.closest(".ma-row").dataset.u))));
    } catch (e) { setStatus("ma-sstatus", errorText(e)); }
  }

  function openEdit(u) {
    selected = u;
    const district = u.type === "교구";
    $("ma-editor").innerHTML = `
      <div class="card">
        <div class="muted">선택: ${esc(label(u))}</div>
        <form id="ma-edit" class="grid">
          <label>구분 <select id="ma-type"><option value="교구"${district ? " selected" : ""}>교구</option><option value="교회학교"${!district ? " selected" : ""}>교회학교</option></select></label>
          <label>이름 <input id="ma-name" maxlength="80" value="${esc(u.name || "")}"></label>
          <label class="ma-d">교구 <input id="ma-gu" maxlength="80" value="${esc(u.gu || "")}"></label>
          <label class="ma-d">목장 <input id="ma-mok" maxlength="80" value="${esc(u.mok || "")}" placeholder="숫자 또는 남성"></label>
          <label class="ma-s">부서 <input id="ma-bu" maxlength="80" value="${esc(u.bu || "")}"></label>
          <label class="ma-s">학년 <input id="ma-grade" maxlength="80" value="${esc(u.grade || "")}"></label>
          <label>변경 사유 <input id="ma-reason" maxlength="300" placeholder="바꾸는 까닭"></label>
          <button class="btn primary" type="submit">저장</button>
        </form>
        <p id="ma-estatus" class="muted"></p>
        <div id="ma-history"></div>
      </div>`;
    const toggle = () => {
      const d = $("ma-type").value === "교구";
      el.querySelectorAll(".ma-d").forEach((n) => n.hidden = !d);
      el.querySelectorAll(".ma-s").forEach((n) => n.hidden = d);
    };
    $("ma-type").addEventListener("change", toggle); toggle();
    $("ma-edit").addEventListener("submit", onSave);
    loadHistory(u.id);
  }

  function formProfile() {
    const type = $("ma-type").value;
    const pr = { type, name: norm($("ma-name").value) };
    if (type === "교구") { pr.gu = norm($("ma-gu").value); pr.mok = norm($("ma-mok").value); pr.bu = null; pr.grade = null; }
    else { pr.bu = norm($("ma-bu").value); pr.grade = norm($("ma-grade").value); pr.gu = null; pr.mok = null; }
    return pr;
  }

  async function onSave(e) {
    e.preventDefault(); if (!selected || saving) return;
    const profile = formProfile(), reason = norm($("ma-reason").value);
    if (!profile.name || !reason ||
        (profile.type === "교구" ? (!profile.gu || !/^(\d+|남성)$/.test(profile.mok)) : (!profile.bu || !profile.grade))) {
      setStatus("ma-estatus", "이름·소속과 변경 사유를 확인해 주세요 (목장은 숫자 또는 남성)."); return;
    }
    const pending = { user_id: selected.id, expected_key: selected.identity_key, profile, reason };
    const go = await dialog({ title: "이렇게 바꿀까요?",
      text: `${label(selected)}\n→ ${label(profile)}\n사유: ${reason}`, ok: "저장", cancel: "그만두기" });
    if (!go) return;
    saving = true;
    await busy($("ma-editor"), async () => {
      const r = await call("memberUpdate", pending);
      if (r.ok) { toast("바꿨어요."); selected = r.user; loadHistory(r.user.id); setStatus("ma-estatus", "저장했어요. 다시 찾아 확인해 주세요."); }
      else if (r.error === "identity-conflict") { await onConflict(pending); }
      else setStatus("ma-estatus", errorText(r));
    });
    saving = false;
  }

  // 소속 충돌 — super 면 합치기 패널, 아니면 안내만
  async function onConflict(pending) {
    if (!isSuper) {
      setStatus("ma-estatus", "이 소속은 다른 계정이 쓰는 중이에요 — 총괄에게 계정 합치기를 요청하세요.");
      return;
    }
    const d = await call("memberMergePreview", pending);
    if (!d.ok) { setStatus("ma-estatus", errorText(d)); return; }
    const counts = (side) => Object.entries(COUNT_LABELS)
      .filter(([k]) => d[side + "_counts"][k] !== undefined)
      .map(([k, t]) => `${t} ${Number(d[side + "_counts"][k]).toLocaleString("ko-KR")}건`).join(" · ");
    const go = await dialog({ title: "두 계정을 합칠까요?",
      text: `새 소속이 이미 다른 계정에 있어요. 같은 분이면 합칩니다(되돌릴 수 없어요).\n\n`
        + `원래: ${label(d.source)}\n  ${counts("source")}\n\n남길 쪽: ${label(d.target)}\n  ${counts("target")}`,
      ok: "같은 분 — 합치기", cancel: "그만두기" });
    if (!go) return;
    const r = await call("memberMerge", { source_id: d.source.id, target_id: d.target.id,
      source_key: d.source.identity_key, target_key: d.target.identity_key, reason: pending.reason, confirm_same_person: true });
    if (r.ok) { toast("합쳤어요."); selected = r.user; loadHistory(r.user.id); setStatus("ma-estatus", "두 기록을 합쳤어요."); }
    else setStatus("ma-estatus", errorText(r));
  }

  async function loadHistory(userId) {
    const h = $("ma-history"); if (!h) return;
    h.innerHTML = `<p class="muted">이력 불러오는 중…</p>`;
    try {
      const r = await call("memberHistory", { user_id: userId });
      if (!r.ok) { h.innerHTML = `<p class="muted">${esc(errorText(r))}</p>`; return; }
      h.innerHTML = `<h3 class="sub">변경 이력</h3>` + (r.history.length
        ? r.history.map((x) => `<div class="history-item"><small>${esc(new Date(x.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }))}</small>
            <div>${esc(label(x.before_profile))} → ${esc(label(x.after_profile))}</div><div class="muted">사유: ${esc(x.reason)}</div></div>`).join("")
        : `<p class="muted">변경 이력이 없어요.</p>`);
    } catch (e) { h.innerHTML = `<p class="muted">${esc(errorText(e))}</p>`; }
  }

  $("ma-search").addEventListener("submit", (e) => { e.preventDefault(); const q = norm($("ma-q").value); if (q) search(q); });
}
```

- [ ] **Step 2: 커밋**

```bash
git add js/menus/people/member-accounts.js
git commit -m "feat(성도 계정): 화면 모듈 — 검색·수정·이력·합치기(super) (개발)"
```

---

### Task 6: 테스트 (registry · authz)

**Files:**
- Modify (필요 시): `tests/registry.test.mjs` · `tests/authz.test.mjs`

**Interfaces:**
- Consumes: 기존 테스트가 「메뉴 역할이 모두 knownRoles 안」·「ACTION_ROLES 역할이 모두 정의됨」을 검사.

- [ ] **Step 1: 테스트를 돌려 새 메뉴·역할이 통과하는지 본다**

Run: `cd /c/Projects/church-admin && node --test tests/registry.test.mjs tests/authz.test.mjs 2>&1 | tail -15`
Expected: PASS. (registry.test 가 메뉴 역할 `members` 를 knownRoles 에서 찾고, authz.test 가 super 액션 목록을 본다면 `memberMergePreview`·`memberMerge` 를 추가해야 할 수 있다.)

- [ ] **Step 2: authz.test 의 super 목록(하드코딩)이 있으면 두 액션 더한다**

`tests/authz.test.mjs` 에 super 전용 액션을 나열한 검사가 있으면(예 PROBE·super 액션 배열) `memberMergePreview`·`memberMerge` 를 **정렬 위치에** 더한다. 없으면 Step 1 통과로 끝.

- [ ] **Step 3: 커밋** (바꿨을 때만)

```bash
git add tests/authz.test.mjs tests/registry.test.mjs
git commit -m "test(성도 계정): registry·authz 새 역할·액션 반영 (개발)"
```

---

### Task 7: 개발 배포 + 확인

- [ ] **Step 1: 개발 함수 배포**

Run: `cd /c/Projects/church-admin && supabase functions deploy church-admin --no-verify-jwt --project-ref ktpwthwqzgcqcrmsafdo 2>&1 | tail -3`
Expected: `Deployed Functions`.

- [ ] **Step 2: 액션이 역할 게이트를 타는지 확인(개발)**

개발 church-admin 은 카카오 로그인이 필요하다 — 토큰 없이 부르면 인증/역할에서 막혀야 한다. 내부 토큰·시험 계정이 있으면 그걸로, 없으면 최소한 **라우팅이 unknown-action 이 아닌지**(canCall 이 역할을 요구하는지) 확인한다:
Run(인증 없이):
```bash
curl -s "https://ktpwthwqzgcqcrmsafdo.supabase.co/functions/v1/church-admin" -H "Content-Type: application/json" -d '{"action":"memberFind","query":"김"}' | head -c 160; echo
```
Expected: `unknown-action` 이 **아니다**(인증/역할 오류여야 — 액션이 등록됐다는 뜻). `unknown-action` 이면 authz ACTION_ROLES 등록 누락.

- [ ] **Step 3: 개발 UI 로 한 바퀴**(가능하면) — 교회 어드민 개발 주소에서 super 로 로그인 → 「👤 성도 계정」 → 이름 검색 → 수정(개발 users 한 명) → 이력 뜨는지 → (소속 충돌 만들어) 합치기 패널. members 역할 계정으로는 합치기 패널 대신 안내가 뜨는지.

- [ ] **Step 4: 진행 기록** — church-admin `.superpowers/sdd/progress.md` 에 한 줄(개발 완료·운영 미반영).

---

## 이 계획 밖 (운영 반영 · 친구와 함께)

1. **church-admin 운영 배포** — `017_member_accounts_role.sql` 운영 실행(check-authenticated-exposure 0행 확인) → `supabase functions deploy church-admin --project-ref xnomlgydifiqiybervtf`.
2. 친구가 「시스템 → 담당자·역할」에서 **역할 `members`** 부여 → **운영에서 한 바퀴**(찾기·수정·이력·합치기) 확인.
3. **확인된 뒤 성경암송 걷기**(별도 세션 · 성경암송 저장소): `adminFindMembers`·`adminUpdateMember`·`adminMemberHistory`·`adminPreviewMemberMerge`·`adminMergeMembers` 를 `moved-to-church-admin` 으로 얼림 · `admin-members.html`·`js/admin-members.js` 제거 · `admin.html` 타일 제거 · bump · api 운영 배포. ⚠️ `member_merge.sql`·`member_profile.sql` 은 그대로.

## 자체 점검 (writing-plans Self-Review)

- **스펙 커버리지:** 설계 §1(독립 메뉴·users)=Task 4·5 · §2(5액션·RPC 호출)=Task 3 · §3(역할 members+super)=Task 1·2, 화면 super 분기=Task 5 · §4(배포 순서·걷기)=Task 7 + 「이 계획 밖」.
- **플레이스홀더:** Task 3 Step 1 의 identityKey 꼴은 "성경암송 identityKey 를 먼저 읽어 같게"로 명시(글자까지 같아야 RPC 키 비교가 맞음) · Task 6 은 테스트 하드코딩 유무에 따라 분기 명시.
- **타입 일관성:** 액션 이름(memberFind/Update/History/MergePreview/Merge)이 authz(Task 2)·index switch(Task 3)·화면 call(Task 5)·테스트(Task 6)에서 모두 같음 · RPC 파라미터는 성경암송 구현에서 그대로 복사(p_user_id·p_expected_key·p_profile·p_reason / p_source_id·p_source_key·p_target_key / p_source_id·p_target_id·p_source_key·p_target_key·p_reason).
