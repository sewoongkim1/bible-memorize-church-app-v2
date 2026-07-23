# 긴 본문 암송("핵심 암송") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 주기도문·사도신경·시편1편·성령의 열매처럼 여러 절로 된 긴 본문을, 절 단위로 순차 암송하고 마지막에 전체를 이어서 암송해 "외운 말씀" 배지를 얻는 별도 섹션을 추가한다.

**Architecture:** 신규 테이블 `passages`(본문+절 jsonb 배열)·`passage_progress`(완료 기록) + Edge Function `api`에 4개 액션 추가. 클라이언트는 기존 암송 유틸(`pickBlankIndices`·`setupChallengeTyping`·`speakText`·`setupVoice`)을 재사용해 절별 채우기와 전체 이어서 화면을 그린다. 사용자 노출은 `passagesPublic` 설정 플래그로 게이트(어드민 준비 후 공개).

**Tech Stack:** Vanilla JS PWA(프레임워크 없음), Supabase(Postgres + Edge Function/Deno), GitHub Pages 배포.

## Global Constraints

- 자동화 테스트 프레임워크 없음 → 검증은 `node --check`(JS 문법), `curl`(API), 브라우저 수동 체크, 배포 후 `splash-ver`/`?v=` 플립으로 한다.
- 배포 규칙: `app.js`/`style.css` 수정 시 `index.html`의 `?v=` 캐시태그 갱신 + `.splash-ver` +0.001(항상 소수점 3자리). 현재 `v3.008`, `app.js?v=20260722g`, `style.css?v=20260722c`.
- Edge Function 배포: `supabase functions deploy api --no-verify-jwt --project-ref xnomlgydifiqiybervtf`.
- DB 적용: `supabase db query --linked -f <파일>` (linked 프로젝트 = xnomlgydifiqiybervtf).
- 별도 트랙: 기존 주간 구절 목록·랭킹·통계·복습에 영향 주지 않는다. 완료 기록만 서버에 남겨 향후 통합 여지 유지.
- 사용자 노출은 `passagesPublic` OFF가 기본. 어드민은 `?passages=1` 딥링크로 미리보기.
- 관리자 액션은 `adminError(b)`(ADMIN_SECRET) 통과 필수.
- 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- 기능 개발 중 main 푸시는 자동 배포되지만, 사용자 노출은 게이트로 막혀 있어 안전하다. 캐시태그/스플래시 버전 bump는 마지막 Task 8에서 1회.

---

### Task 1: DB 마이그레이션 — passages · passage_progress

**Files:**
- Create: `supabase/migrate_passages.sql`

**Interfaces:**
- Produces: 테이블 `public.passages(id serial pk, title, ref, category, lines jsonb, sort_order, is_active, created_at)`, `public.passage_progress(user_id uuid, passage_id int, done_seq int[], completed_at, updated_at, pk(user_id,passage_id))`.

- [ ] **Step 1: 마이그레이션 SQL 작성**

`supabase/migrate_passages.sql`:

```sql
-- 긴 본문 암송("핵심 암송"): 본문(passages) + 완료 기록(passage_progress). SQL Editor/CLI에서 1회 실행.
create table if not exists public.passages (
  id          serial primary key,
  title       text not null,
  ref         text,
  category    text,
  lines       jsonb not null default '[]'::jsonb,   -- 절 배열: ["...", "..."]
  sort_order  int   not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.passage_progress (
  user_id      uuid not null references public.users(id) on delete cascade,
  passage_id   int  not null references public.passages(id) on delete cascade,
  done_seq     int[] not null default '{}',          -- 완료한 절 인덱스(0-based)
  completed_at timestamptz,                            -- 전체 이어서 통과 시각
  updated_at   timestamptz not null default now(),
  primary key (user_id, passage_id)
);
```

- [ ] **Step 2: 적용**

Run: `supabase db query --linked -f supabase/migrate_passages.sql`
Expected: 에러 없이 실행(`rows: []`).

- [ ] **Step 3: 생성 확인**

Run:
```bash
supabase db query --linked "select table_name from information_schema.tables where table_schema='public' and table_name in ('passages','passage_progress') order by table_name;"
```
Expected: `passage_progress`, `passages` 두 행.

- [ ] **Step 4: 커밋**

```bash
git add supabase/migrate_passages.sql
git commit -m "핵심 암송 1: passages·passage_progress 테이블 마이그레이션"
```

---

### Task 2: Edge Function — 액션 4개 + passagesPublic 화이트리스트

**Files:**
- Modify: `supabase/functions/api/index.ts` (라우터 switch, `PUBLIC_CONFIG_KEYS`, seedVerses 뒤에 함수 추가)

**Interfaces:**
- Consumes: `db`, `adminError(b)`, `json()` (기존).
- Produces: 액션 `getPassages`→`{ok,passages:[{id,title,ref,category,lines[]}]}`, `savePassage`(pw,passage)→`{ok,id}`, `deletePassage`(pw,id)→`{ok}`, `savePassageProgress`(user_id,passage_id,doneSeq[],completed)→`{ok}`. 공개 설정 키 `passagesPublic`.

- [ ] **Step 1: 라우터에 액션 4개 추가**

`supabase/functions/api/index.ts`의 `case "seedVerses":` 줄 아래(현재 `case "generateNiv":` 다음 줄)에 추가:

```ts
      case "getPassages":         return json(await getPassages());
      case "savePassage":         return json(await savePassage(body));
      case "deletePassage":       return json(await deletePassage(body));
      case "savePassageProgress": return json(await savePassageProgress(body));
```

- [ ] **Step 2: passagesPublic 화이트리스트 추가**

`const PUBLIC_CONFIG_KEYS = new Set([...])` 줄을 찾아 `"passagesPublic"`를 추가:

```ts
const PUBLIC_CONFIG_KEYS = new Set(["heartMessages", "dailyMessage", "introSlides", "milestoneMessages", "passagesPublic"]);
```

- [ ] **Step 3: 함수 4개 구현**

`seedVerses` 함수 정의 블록 바로 뒤(`generateNiv` 함수 앞이나 뒤 아무 곳, 다른 함수 정의들 사이)에 추가:

```ts
// ---------- 긴 본문 암송("핵심 암송") ----------
async function getPassages() {
  const { data, error } = await db.from("passages")
    .select("id,title,ref,category,lines,sort_order")
    .eq("is_active", true).order("sort_order").order("id");
  if (error) throw error;
  const passages = (data ?? []).map((p: any) => ({
    id: p.id, title: p.title || "", ref: p.ref || "",
    category: p.category || "", lines: Array.isArray(p.lines) ? p.lines : [],
  }));
  return { ok: true, passages };
}

async function savePassage(b: any) {
  const err = adminError(b); if (err) return { ok: false, error: err };
  const p = b.passage || {};
  if (!p.title) return { ok: false, error: "title-required" };
  const lines = Array.isArray(p.lines)
    ? p.lines.map((s: any) => String(s || "").trim()).filter(Boolean) : [];
  if (!lines.length) return { ok: false, error: "lines-required" };
  const row: any = {
    title: p.title, ref: p.ref || null, category: p.category || null,
    lines, sort_order: p.sortOrder != null && p.sortOrder !== "" ? Number(p.sortOrder) : 0,
    is_active: p.is_active !== false,
  };
  if (p.id != null && p.id !== "") row.id = Number(p.id);
  const { data, error } = await db.from("passages").upsert(row).select("id").maybeSingle();
  if (error) throw error;
  return { ok: true, id: data?.id };
}

async function deletePassage(b: any) {
  const err = adminError(b); if (err) return { ok: false, error: err };
  if (b.id == null || b.id === "") return { ok: false, error: "id-required" };
  const { error } = await db.from("passages").delete().eq("id", Number(b.id));
  if (error) throw error;
  return { ok: true };
}

async function savePassageProgress(b: any) {
  if (!b.user_id || b.passage_id == null) return { ok: false, error: "bad-args" };
  const doneSeq = Array.isArray(b.doneSeq)
    ? b.doneSeq.map((n: any) => Number(n)).filter((n: number) => Number.isFinite(n)) : [];
  const row = {
    user_id: b.user_id, passage_id: Number(b.passage_id),
    done_seq: doneSeq, completed_at: b.completed ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await db.from("passage_progress").upsert(row, { onConflict: "user_id,passage_id" });
  if (error) throw error;
  return { ok: true };
}
```

- [ ] **Step 4: 배포**

Run: `supabase functions deploy api --no-verify-jwt --project-ref xnomlgydifiqiybervtf`
Expected: `Deployed Functions.`

- [ ] **Step 5: getPassages 응답 확인**

Run:
```bash
curl -s -X POST "https://xnomlgydifiqiybervtf.supabase.co/functions/v1/api" -H "Content-Type: application/json" -d '{"action":"getPassages"}'
```
Expected: `{"ok":true,"passages":[]}` (아직 데이터 없음).

- [ ] **Step 6: savePassage 인증 거부 확인(라우팅 정상)**

Run:
```bash
curl -s -X POST "https://xnomlgydifiqiybervtf.supabase.co/functions/v1/api" -H "Content-Type: application/json" -d '{"action":"savePassage","pw":"wrong","passage":{"title":"x","lines":["a"]}}'
```
Expected: `{"ok":false,"error":"unauthorized"}` (500 아님).

- [ ] **Step 7: 커밋**

```bash
git add supabase/functions/api/index.ts
git commit -m "핵심 암송 2: getPassages·savePassage·deletePassage·savePassageProgress 액션 + passagesPublic 키"
```

---

### Task 3: 클라이언트 API 래퍼 (js/api.js)

**Files:**
- Modify: `js/api.js` (`api` 객체에 메서드 추가)

**Interfaces:**
- Consumes: `supaCall` (기존), Task 2 액션.
- Produces: `api.getPassages()`, `api.savePassage(pw,passage)`, `api.deletePassage(pw,id)`, `api.savePassageProgress(user_id,passage_id,doneSeq,completed)`.

- [ ] **Step 1: 래퍼 추가**

`js/api.js`의 `seedVerses: (pw) => supaCall("seedVerses", { pw }),` 줄 아래에 추가:

```js
  getPassages: () => supaCall("getPassages", {}),
  savePassage: (pw, passage) => supaCall("savePassage", { pw, passage }),
  deletePassage: (pw, id) => supaCall("deletePassage", { pw, id }),
  savePassageProgress: (user_id, passage_id, doneSeq, completed) =>
    supaCall("savePassageProgress", { user_id, passage_id, doneSeq, completed }),
```

- [ ] **Step 2: 문법 검사**

Run: `node --check js/api.js`
Expected: 출력 없음(정상).

- [ ] **Step 3: 커밋**

```bash
git add js/api.js
git commit -m "핵심 암송 3: api.js에 passages 래퍼 4개 추가"
```

---

### Task 4: 어드민 — admin-stats.html에 "핵심 암송 관리" 카드 + 섹션

기존 "설교/말씀 관리"(`rep-content`→`renderContent`→`loadContentList`) 패턴을 그대로 본떠 본문 등록/수정 섹션을 추가한다. 인증(`callApi`·`getPw`·`renderLogin`·`PW_KEY`)은 이미 이 파일에 있어 재사용한다.

**Files:**
- Modify: `admin-stats.html` (메뉴 카드 1개 + 섹션 함수 2개 + 리스너 1줄)

**Interfaces:**
- Consumes: `callApi`, `getPw`, `renderLogin`, `renderMenu`, `htmlEsc`, `PW_KEY` (기존), `api` 액션(Task 2).
- Produces: `renderPassages()`, `loadPassageList(selId)` — 어드민 본문 CMS 화면.

- [ ] **Step 1: 메뉴 카드 추가**

`admin-stats.html`에서 `<div class="rep-card" id="rep-content">` 블록(설교/말씀 관리 카드) 전체 바로 아래에 새 카드 추가:

```html
      <div class="rep-card" id="rep-passages">
        <div class="ic">📜</div>
        <div class="rep-text">
          <div class="ti">핵심 암송 관리</div>
          <div class="de">주기도문·사도신경 등 긴 본문 등록·수정 · 공개 전환</div>
        </div>
        <div class="rep-arrow">›</div>
      </div>
```

- [ ] **Step 2: 카드 리스너 추가**

`document.getElementById("rep-content").addEventListener("click", renderContent);` 줄 아래에 추가:

```js
  document.getElementById("rep-passages").addEventListener("click", renderPassages);
```

- [ ] **Step 3: 섹션 함수 추가**

`loadContentList` 함수 정의 블록 전체 뒤(그 함수의 닫는 `}` 다음 줄)에 추가:

```js
// ---------- 핵심 암송(긴 본문) 관리 ----------
async function renderPassages(){
  document.getElementById("view").innerHTML=`
    <div class="head">
      <button class="back" id="back">← 메뉴</button>
      <h2>📜 핵심 암송 관리</h2>
    </div>
    <div id="pg-body"><div class="msg">불러오는 중...</div></div>`;
  document.getElementById("back").addEventListener("click", renderMenu);
  loadPassageList();
}
async function loadPassageList(selId){
  const body=document.getElementById("pg-body");
  const data=await callApi({action:"getPassages"}).catch(()=>({ok:false,error:"network"}));
  const list=(data&&data.passages)||[];
  const opts=`<option value="">+ 새 본문 추가</option>`+list.map(p=>`<option value="${p.id}">${p.id}. ${htmlEsc(p.title||"")}</option>`).join("");
  // 공개 플래그 현재값
  const cfg=await callApi({action:"getConfig",key:"passagesPublic"}).catch(()=>({value:null}));
  const isPublic=!!(cfg&&cfg.value);
  body.innerHTML=`
    <div class="push-card">
      <label class="push-lb">사용자 공개</label>
      <label class="chk" style="margin:6px 0;"><input type="checkbox" id="pg-public" ${isPublic?"checked":""}> 홈 화면에 '📜 핵심 암송' 노출(끄면 어드민만 <code>?passages=1</code>로 미리보기)</label>
      <div id="pg-public-msg" class="msg"></div>
      <hr style="border:none;border-top:1px solid var(--border);margin:14px 0;">
      <label class="push-lb">편집할 본문 선택</label>
      <select id="pg-sel" class="push-in">${opts}</select>
      <hr style="border:none;border-top:1px solid var(--border);margin:14px 0;">
      <label class="push-lb">제목 *</label><input id="pg-title" class="push-in" placeholder="예: 주기도문">
      <label class="push-lb">출처(선택)</label><input id="pg-ref" class="push-in" placeholder="예: 마 6:9-13">
      <label class="push-lb">분류(선택)</label><input id="pg-cat" class="push-in" placeholder="예: 기도문 / 신앙고백 / 시편 / 주제">
      <label class="push-lb">정렬 순서(숫자, 작을수록 위)</label><input id="pg-order" class="push-in" inputmode="numeric" placeholder="0">
      <label class="push-lb">본문 — <b>한 줄에 한 절</b> *</label>
      <textarea id="pg-lines" class="push-in" rows="8" placeholder="하늘에 계신 우리 아버지여&#10;이름이 거룩히 여김을 받으시오며&#10;나라가 임하시오며 ..."></textarea>
      <p class="push-hint">줄바꿈이 곧 절 경계입니다. 빈 줄은 자동으로 건너뜁니다.</p>
      <label class="chk" style="margin:10px 0;"><input type="checkbox" id="pg-active" checked> 활성(목록에 표시)</label>
      <button class="push-send" id="pg-save">💾 저장</button>
      <button class="push-off" id="pg-del" style="margin-top:8px;display:none;">🗑️ 이 본문 삭제</button>
      <div id="pg-result" class="msg"></div>
    </div>`;
  const sel=document.getElementById("pg-sel");
  function fill(p){
    document.getElementById("pg-title").value=p?(p.title||""):"";
    document.getElementById("pg-ref").value=p?(p.ref||""):"";
    document.getElementById("pg-cat").value=p?(p.category||""):"";
    document.getElementById("pg-order").value="";
    document.getElementById("pg-lines").value=p?((p.lines||[]).join("\n")):"";
    document.getElementById("pg-active").checked=true;
    document.getElementById("pg-del").style.display=p?"block":"none";
  }
  sel.addEventListener("change",()=>{ const p=list.find(x=>String(x.id)===sel.value); fill(p); });
  if(selId!=null){ sel.value=String(selId); fill(list.find(x=>String(x.id)===String(selId))); }
  // 공개 토글
  document.getElementById("pg-public").addEventListener("change",async(e)=>{
    const msg=document.getElementById("pg-public-msg"); msg.className="msg"; msg.textContent="저장 중...";
    const r=await callApi({action:"saveConfig",pw:getPw(),key:"passagesPublic",value:e.target.checked}).catch(()=>({ok:false,error:"network"}));
    if(!r.ok){ if(r.error==="unauthorized"){sessionStorage.removeItem(PW_KEY);renderLogin();return;} msg.className="msg err"; msg.textContent="실패: "+(r.error||"오류"); e.target.checked=!e.target.checked; return; }
    msg.className="msg"; msg.textContent=e.target.checked?"✅ 사용자에게 공개됩니다.":"✅ 숨김(어드민 미리보기만).";
  });
  // 저장
  document.getElementById("pg-save").addEventListener("click",async()=>{
    const lines=document.getElementById("pg-lines").value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
    const passage={
      id: sel.value || undefined,
      title: document.getElementById("pg-title").value.trim(),
      ref: document.getElementById("pg-ref").value.trim(),
      category: document.getElementById("pg-cat").value.trim(),
      sortOrder: document.getElementById("pg-order").value.trim(),
      lines,
      is_active: document.getElementById("pg-active").checked,
    };
    const r=document.getElementById("pg-result");
    if(!passage.title||!lines.length){ r.className="msg err"; r.textContent="제목과 본문(최소 1줄)은 필수예요."; return; }
    const btn=document.getElementById("pg-save"); btn.disabled=true; r.className="msg"; r.textContent="저장 중...";
    const data=await callApi({action:"savePassage",pw:getPw(),passage}).catch(()=>({ok:false,error:"network"}));
    btn.disabled=false;
    if(!data.ok){ if(data.error==="unauthorized"){sessionStorage.removeItem(PW_KEY);renderLogin();return;} r.className="msg err"; r.textContent="저장 실패: "+(data.error||"오류"); return; }
    r.className="msg"; r.textContent="✅ 저장되었습니다.";
    loadPassageList(data.id!=null?data.id:sel.value);
  });
  // 삭제
  document.getElementById("pg-del").addEventListener("click",async()=>{
    if(!sel.value) return;
    if(!confirm("이 본문을 삭제할까요? 되돌릴 수 없습니다.")) return;
    const r=document.getElementById("pg-result"); r.className="msg"; r.textContent="삭제 중...";
    const data=await callApi({action:"deletePassage",pw:getPw(),id:sel.value}).catch(()=>({ok:false,error:"network"}));
    if(!data.ok){ if(data.error==="unauthorized"){sessionStorage.removeItem(PW_KEY);renderLogin();return;} r.className="msg err"; r.textContent="삭제 실패: "+(data.error||"오류"); return; }
    loadPassageList();
  });
}
```

> 참고: `#view`·`.head`·`.back`·`.push-card`·`.push-in`·`.push-lb`·`.push-send`·`.push-off`·`.chk`·`.msg`·`htmlEsc`는 admin-stats.html이 이미 쓰는 클래스/함수다. `renderContent`가 쓰는 컨테이너 id(`view`)와 동일하게 맞춘다. (만약 `renderContent`가 다른 컨테이너 id를 쓰면 그걸로 맞출 것 — 파일에서 `renderContent`의 첫 `innerHTML` 대상 id를 확인해 동일하게 사용.)

- [ ] **Step 4: 브라우저 수동 확인**

1. `admin.html` → 로그인 → "성경암송 관리"(admin-stats.html) → "핵심 암송 관리" 카드 클릭.
2. 제목 `주기도문`, 출처 `마 6:9-13`, 본문에 7줄 입력(줄마다 한 절) → 저장 → "✅ 저장되었습니다."
3. `curl -s -X POST ".../api" -d '{"action":"getPassages"}'` → `lines` 배열 7개 확인.
4. 드롭다운에서 방금 본문 선택 → 필드가 채워지고 삭제 버튼 노출 확인.

- [ ] **Step 5: 커밋**

```bash
git add admin-stats.html
git commit -m "핵심 암송 4: admin-stats.html에 본문 등록/수정·공개토글 섹션 추가"
```

---

### Task 5: 사용자 — 홈 진입 버튼(게이트) + 본문 목록 화면

**Files:**
- Modify: `app.js` (초기화 훅, `renderSummary` 버튼, 신규 헬퍼·`renderPassageList`)

**Interfaces:**
- Consumes: `api.getPassages`(Task 3), `api.getConfig`, `loadUser`, `renderSummary` (기존).
- Produces: 전역 `_passagesPreview`; 함수 `getPassagesPreview()`, `refreshPassagesPublic()`, `passagesPublicCached()`, `passagesVisible()`, `loadPassages()`, `renderPassageList()`. 진행 헬퍼 `passageProgKey/loadPassageProg/savePassageProg/passageDone/passageCompleted`.

- [ ] **Step 1: 게이트·로더·진행 헬퍼 추가**

`app.js`의 `getDeepLinkVerseNo` 함수 정의 바로 아래에 추가:

```js
// 📜 핵심 암송(긴 본문) — 사용자 노출 게이트 & 데이터 로더 & 진행 기록
let _passagesPreview = false; // ?passages=1 이면 공개 플래그와 무관하게 노출(어드민 미리보기)
function getPassagesPreview() {
  try {
    if (new URLSearchParams(location.search).get("passages") === "1") {
      history.replaceState(null, "", location.pathname);
      return true;
    }
  } catch (e) {}
  return false;
}
const PASSAGES_PUB_KEY = "passages-public";
function passagesPublicCached() { try { return localStorage.getItem(PASSAGES_PUB_KEY) === "1"; } catch (e) { return false; } }
function refreshPassagesPublic() {
  if (!window.api || !api.getConfig) return;
  api.getConfig("passagesPublic").then((d) => {
    try { localStorage.setItem(PASSAGES_PUB_KEY, d && d.value ? "1" : "0"); } catch (e) {}
  }).catch(() => {});
}
function passagesVisible() { return _passagesPreview || passagesPublicCached(); }

let passagesCache = null;
async function loadPassages() {
  if (passagesCache) return passagesCache;
  if (!window.api || !api.getPassages) return [];
  try { const d = await api.getPassages(); passagesCache = (d && d.passages) || []; }
  catch (e) { passagesCache = []; }
  return passagesCache;
}

// 진행 기록(로컬) — { [passageId]: { done:[0,1,...], completed:bool } }
const PASSAGE_KEY = "memorize-passage";
function passageProgKey() { const u = loadUser(); return `${PASSAGE_KEY}::${u && u.user_id ? u.user_id : "guest"}`; }
function loadPassageProg() { try { return JSON.parse(localStorage.getItem(passageProgKey()) || "{}"); } catch (e) { return {}; } }
function savePassageProg(obj) { try { localStorage.setItem(passageProgKey(), JSON.stringify(obj)); } catch (e) {} }
function passageDone(id) { const p = loadPassageProg()[id]; return p && Array.isArray(p.done) ? p.done : []; }
function passageCompleted(id) { const p = loadPassageProg()[id]; return !!(p && p.completed); }
function syncPassageProgress(id, cur) {
  const u = loadUser();
  if (!u || !u.user_id || !api.savePassageProgress) return;
  api.savePassageProgress(u.user_id, id, cur.done, !!cur.completed).catch(() => {});
}
function markLineDone(id, seq) {
  const all = loadPassageProg(); const cur = all[id] || { done: [], completed: false };
  if (!cur.done.includes(seq)) cur.done.push(seq);
  all[id] = cur; savePassageProg(all); syncPassageProgress(id, cur);
}
function markPassageCompleted(id) {
  const all = loadPassageProg(); const cur = all[id] || { done: [], completed: false };
  cur.completed = true; all[id] = cur; savePassageProg(all); syncPassageProgress(id, cur);
}
```

- [ ] **Step 2: 초기화 훅 — 미리보기 감지 + 공개플래그 새로고침**

`getDeepLinkVerseNo()`를 호출하는 초기화 지점을 찾는다(`routeAfterLoad` 함수 안, 현재 파일 상단 86~110줄 영역). 그 함수 초입(다른 preview 처리들과 같은 곳)에 두 줄 추가:

```js
  _passagesPreview = getPassagesPreview();
  refreshPassagesPublic();
```

(주의: `getPassagesPreview()`는 URL을 정리하므로 `getDeepLinkVerseNo()`/`getPreviewKind()` 호출들과 같은 초기화 흐름에서 1회만 실행되게 둔다.)

- [ ] **Step 3: 홈 버튼 추가**

`renderSummary`의 HTML에서 `<button class="summary-help album-cta" id="open-album">📖 나의 말씀 앨범</button>` 줄 위에, 조건부로 버튼을 넣는다. 그 줄을 다음으로 교체:

```js
    ${passagesVisible() ? `<button class="summary-help passages-cta" id="open-passages">📜 핵심 암송 (긴 말씀)</button>` : ""}
    <button class="summary-help album-cta" id="open-album">📖 나의 말씀 앨범</button>
```

그리고 리스너 등록부(예: `document.getElementById("open-album").addEventListener(...)` 근처)에 추가:

```js
  { const b = document.getElementById("open-passages"); if (b) b.addEventListener("click", renderPassageList); }
```

- [ ] **Step 4: 본문 목록 화면**

`renderVerseList` 함수 정의 뒤(닫는 `}` 다음)에 추가:

```js
// 📜 핵심 암송 — 본문 목록
function renderPassageList() {
  const appEl = document.getElementById("app");
  appEl.innerHTML = `
    <div class="list-nav">
      <button class="remind-cta nav-record" id="pg-back">← 뒤로</button>
    </div>
    <div class="pg-list-title">📜 핵심 암송 <span class="pg-list-sub">긴 말씀을 절마다 익히고 이어서 외워요</span></div>
    <div id="pg-list" class="pg-list"><div class="pg-empty">불러오는 중…</div></div>
  `;
  document.getElementById("pg-back").addEventListener("click", renderSummary);
  const listEl = document.getElementById("pg-list");
  loadPassages().then((passages) => {
    if (!passages.length) { listEl.innerHTML = `<div class="pg-empty">아직 등록된 본문이 없어요.</div>`; return; }
    listEl.innerHTML = "";
    passages.forEach((p) => {
      const total = (p.lines || []).length;
      const done = passageDone(p.id).length;
      const complete = passageCompleted(p.id);
      const status = complete ? `<span class="pg-badge done">👑 외운 말씀</span>`
        : done > 0 ? `<span class="pg-badge prog">${done}/${total}절</span>`
        : `<span class="pg-badge">${total}절</span>`;
      const card = document.createElement("div");
      card.className = `pg-card${complete ? " complete" : ""}`;
      card.innerHTML = `
        <div class="pg-card-main">
          <div class="pg-card-title">${p.title}</div>
          ${p.ref ? `<div class="pg-card-ref">${p.ref}</div>` : ""}
        </div>
        ${status}`;
      card.addEventListener("click", () => renderPassageSteps(p));
      listEl.appendChild(card);
    });
  });
}
```

- [ ] **Step 5: 문법 검사**

Run: `node --check app.js`
Expected: 출력 없음.

> 이 시점엔 `renderPassageSteps`가 아직 없어 목록 카드 클릭은 에러가 난다. Task 6에서 추가하므로, Step 6 커밋 후 Task 6로 바로 이어간다(중간 배포는 게이트 OFF라 사용자 영향 없음).

- [ ] **Step 6: 커밋**

```bash
git add app.js
git commit -m "핵심 암송 5: 홈 진입 게이트·본문 목록 화면·진행 헬퍼"
```

---

### Task 6: 사용자 — 절 순차 암송 흐름

**Files:**
- Modify: `app.js` (`renderPassageSteps`, `renderPassageLine` 추가)

**Interfaces:**
- Consumes: `pickBlankIndices`, `setupChallengeTyping(verse,onComplete)`, `setupVoice(verse,stage,onPass)`, `speakText(text,onEnd,times,lang)`, `stopSpeaking` (기존); `loadPassages/passageDone/markLineDone/passageCompleted` (Task 5).
- Produces: `renderPassageSteps(p)`, `renderPassageLine(p, idx)`.

- [ ] **Step 1: 절 목록(진행 허브) 화면**

`renderPassageList` 함수 뒤에 추가:

```js
// 📜 한 본문의 절 목록(진행 허브) — 위에서부터 순차 잠금 해제
function renderPassageSteps(p) {
  stopSpeaking();
  const appEl = document.getElementById("app");
  const lines = p.lines || [];
  const done = passageDone(p.id);
  const nextIdx = lines.findIndex((_, i) => !done.includes(i)); // 아직 안 끝낸 첫 절
  const allDone = nextIdx === -1;
  const rows = lines.map((line, i) => {
    const isDone = done.includes(i);
    const isNext = i === nextIdx;
    const state = isDone ? "done" : isNext ? "next" : "lock";
    const icon = isDone ? "✓" : isNext ? "▶" : "🔒";
    return `<button class="pg-step ${state}" data-i="${i}" ${state === "lock" ? "disabled" : ""}>
        <span class="pg-step-ic">${icon}</span>
        <span class="pg-step-tx">${isDone || isNext ? line : "···"}</span>
      </button>`;
  }).join("");
  appEl.innerHTML = `
    <div class="test-screen">
      <div class="test-card">
        <div class="test-top">
          <div class="test-head">
            <div class="test-stage">${done.length}/${lines.length}절</div>
            <div class="test-ref">${p.title}</div>
          </div>
          <button class="back-btn" id="pg-steps-back">← 목록</button>
        </div>
        <div class="pg-steps">${rows}</div>
        ${allDone
          ? `<button class="next-btn" id="pg-final">🔥 전체 이어서 암송${passageCompleted(p.id) ? " (다시)" : ""}</button>`
          : `<div class="pg-steps-hint">한 절씩 순서대로 익혀요. ▶ 표시된 절을 눌러 시작하세요.</div>`}
        ${passageCompleted(p.id) ? `<div class="pg-complete-badge">👑 이 말씀을 외웠어요</div>` : ""}
      </div>
    </div>`;
  document.getElementById("pg-steps-back").addEventListener("click", renderPassageList);
  appEl.querySelectorAll(".pg-step:not([disabled])").forEach((btn) => {
    if (btn.classList.contains("lock")) return;
    btn.addEventListener("click", () => renderPassageLine(p, Number(btn.dataset.i)));
  });
  const fin = document.getElementById("pg-final");
  if (fin) fin.addEventListener("click", () => renderPassageFinal(p));
}
```

- [ ] **Step 2: 절 하나 암송 화면**

이어서 추가:

```js
// 📜 절 하나 암송 — 100% 빈칸, 보기/듣기/음성 도움. 완료 시 다음 절 잠금 해제.
function renderPassageLine(p, idx) {
  stopSpeaking();
  const appEl = document.getElementById("app");
  const line = (p.lines || [])[idx] || "";
  const tokens = line.trim().split(/\s+/);
  const wordsHtml = tokens.map((word, i) =>
    `<input class="word-input" data-answer="${word}" data-blank="${i}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" style="width:${Array.from(word).length + 1}em" />`
  ).join(" ");
  const answerHtml = tokens.map((w) => `<strong class="ans-word">${w}</strong>`).join(" ");
  // setupChallengeTyping/setupVoice가 기대하는 verse 유사 객체(영어 아님 → isEnMode=false)
  const lineVerse = { no: p.id * 1000 + idx, text: line, refShort: p.title };
  appEl.innerHTML = `
    <div class="test-screen">
      <div class="test-card">
        <div class="btn-row">
          <button class="answer-btn" id="show-answer-btn">보기</button>
          <button class="answer-btn" id="listen-answer-btn" aria-label="정답 음성으로 듣기">🔊 듣기</button>
          <button class="voice-btn" id="voice-toggle">🎤 암송</button>
        </div>
        <div class="test-top">
          <div class="test-head">
            <div class="test-stage">${idx + 1}절 / ${(p.lines || []).length}</div>
            <div class="test-ref">${p.title}</div>
          </div>
          <button class="back-btn" id="pg-line-back">← 절 목록</button>
        </div>
        <div class="test-sentence">${wordsHtml}</div>
        <div class="challenge-remain" id="ch-remain"></div>
        <div id="result-area"></div>
        <div id="answer-panel" class="answer-panel" hidden>
          <div class="answer-title">정답</div>
          <div class="answer-text">${answerHtml}</div>
          <button class="back-to-test-btn" id="back-to-test-btn">돌아가서 계속하기</button>
        </div>
        <div id="voice-panel" class="voice-panel" hidden>
          <div class="voice-status" id="voice-status">🎙️ 듣고 있어요… <b>‘암송 종료’</b>를 누를 때까지 계속 들어요</div>
          <div class="voice-live" id="voice-live"></div>
        </div>
        <div id="voice-result" class="voice-result"></div>
      </div>
    </div>`;
  document.getElementById("pg-line-back").addEventListener("click", () => { stopSpeaking(); renderPassageSteps(p); });
  setupAnswerToggle();
  const listenBtn = document.getElementById("listen-answer-btn");
  listenBtn.addEventListener("click", () => {
    if (window.speechSynthesis && window.speechSynthesis.speaking) { stopSpeaking(); listenBtn.textContent = "🔊 듣기"; return; }
    listenBtn.textContent = "⏹ 정지";
    speakText(line, () => { listenBtn.textContent = "🔊 듣기"; }, 1, "ko-KR");
  });
  const onDone = () => {
    markLineDone(p.id, idx);
    stopSpeaking();
    setTimeout(() => renderPassageSteps(p), 350); // 정답 표시 잠깐 보이고 절 목록으로
  };
  setupChallengeTyping(lineVerse, onDone);
  setupVoice(lineVerse, 3, onDone);
}
```

- [ ] **Step 3: 문법 검사**

Run: `node --check app.js`
Expected: 출력 없음.

- [ ] **Step 4: 브라우저 수동 확인 (하드 리로드)**

1. `gocheok.onlybible.kr/?passages=1` 접속(미리보기 게이트) → 홈에 "📜 핵심 암송" 노출 → 클릭.
2. 주기도문 카드 → 절 목록(1절 ▶, 나머지 🔒).
3. 1절 클릭 → 빈칸 채우기. 보기/듣기(ko-KR) 동작. 타이핑으로 다 채우면 절 목록으로 돌아오고 1절 ✓, 2절 ▶ 열림.
4. 순서대로 진행해 마지막 절 완료 시 "🔥 전체 이어서 암송" 버튼 노출.

> 이 시점에 `renderPassageFinal`이 없어 마지막 버튼은 에러다. Task 7에서 추가.

- [ ] **Step 5: 커밋**

```bash
git add app.js
git commit -m "핵심 암송 6: 절 목록 진행 허브 + 절 단위 암송 화면"
```

---

### Task 7: 사용자 — 전체 이어서 + 완료 배지 + 서버 기록

**Files:**
- Modify: `app.js` (`renderPassageFinal`, `renderPassageDone` 추가)

**Interfaces:**
- Consumes: `setupChallengeTyping`, `setupVoice`, `speakText`, `stopSpeaking`, `markPassageCompleted`, `renderPassageSteps`, `renderPassageList` (앞 태스크).
- Produces: `renderPassageFinal(p)`, `renderPassageDone(p)`.

- [ ] **Step 1: 전체 이어서 화면**

`renderPassageLine` 함수 뒤에 추가:

```js
// 📜 전체 이어서 암송 — 모든 절을 이어붙여 100% 빈칸. 통과 시 완료 배지.
function renderPassageFinal(p) {
  stopSpeaking();
  const appEl = document.getElementById("app");
  const lines = p.lines || [];
  // 절별로 한 줄씩, 각 줄의 단어를 빈칸 input으로. 절 경계는 <div class="pg-final-line">로 구분.
  let blankIdx = 0;
  const linesHtml = lines.map((line) => {
    const inputs = line.trim().split(/\s+/).map((word) =>
      `<input class="word-input" data-answer="${word}" data-blank="${blankIdx++}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" style="width:${Array.from(word).length + 1}em" />`
    ).join(" ");
    return `<div class="pg-final-line">${inputs}</div>`;
  }).join("");
  const fullText = lines.join(" ");
  const fullVerse = { no: p.id * 1000, text: fullText, refShort: p.title };
  appEl.innerHTML = `
    <div class="test-screen">
      <div class="test-card">
        <div class="btn-row">
          <button class="answer-btn" id="listen-answer-btn" aria-label="정답 음성으로 듣기">🔊 듣기</button>
          <button class="voice-btn" id="voice-toggle">🎤 암송</button>
        </div>
        <div class="test-top">
          <div class="test-head">
            <div class="test-stage challenge-badge">🔥 전체</div>
            <div class="test-ref">${p.title}</div>
          </div>
          <button class="back-btn" id="pg-final-back">← 절 목록</button>
        </div>
        <div class="pg-final-hint">처음부터 끝까지 이어서 외워보세요!</div>
        <div class="test-sentence pg-final-sentence">${linesHtml}</div>
        <div class="challenge-remain" id="ch-remain"></div>
        <div id="result-area"></div>
        <div id="voice-panel" class="voice-panel" hidden>
          <div class="voice-status" id="voice-status">🎙️ 듣고 있어요… <b>‘암송 종료’</b>를 누를 때까지 계속 들어요</div>
          <div class="voice-live" id="voice-live"></div>
        </div>
        <div id="voice-result" class="voice-result"></div>
      </div>
    </div>`;
  document.getElementById("pg-final-back").addEventListener("click", () => { stopSpeaking(); renderPassageSteps(p); });
  const listenBtn = document.getElementById("listen-answer-btn");
  listenBtn.addEventListener("click", () => {
    if (window.speechSynthesis && window.speechSynthesis.speaking) { stopSpeaking(); listenBtn.textContent = "🔊 듣기"; return; }
    listenBtn.textContent = "⏹ 정지";
    speakText(fullText, () => { listenBtn.textContent = "🔊 듣기"; }, 1, "ko-KR");
  });
  const onDone = () => { markPassageCompleted(p.id); stopSpeaking(); renderPassageDone(p); };
  setupChallengeTyping(fullVerse, onDone);
  setupVoice(fullVerse, 3, onDone);
}

// 📜 완료 축하
function renderPassageDone(p) {
  const appEl = document.getElementById("app");
  appEl.innerHTML = `
    <div class="summary-screen">
      <div class="summary-card cd-card">
        <div class="cd-emoji">👑</div>
        <div class="cd-title">${p.title} 완주!</div>
        <div class="cd-sub">전체를 이어서 외웠어요. 정말 잘하셨어요! 🙌</div>
        <div class="cd-count">'외운 말씀' 배지가 달렸어요.</div>
        <button class="summary-go" id="pg-done-list">다른 본문 보기</button>
        <button class="summary-help" id="pg-done-again">다시 암송</button>
      </div>
    </div>`;
  document.getElementById("pg-done-list").addEventListener("click", renderPassageList);
  document.getElementById("pg-done-again").addEventListener("click", () => renderPassageSteps(p));
}
```

- [ ] **Step 2: 문법 검사**

Run: `node --check app.js`
Expected: 출력 없음.

- [ ] **Step 3: 브라우저 수동 확인 (하드 리로드)**

1. `?passages=1`로 진입 → 모든 절 완료 → "🔥 전체 이어서 암송" → 전체 빈칸 화면.
2. 전체를 타이핑(또는 🎤 음성)으로 채우면 완주 화면(👑) 노출.
3. 목록으로 돌아오면 해당 본문 카드에 "👑 외운 말씀" 배지.
4. 서버 확인:
```bash
supabase db query --linked "select passage_id, done_seq, completed_at from public.passage_progress order by updated_at desc limit 3;"
```
Expected: 방금 완료한 passage의 `completed_at`이 채워짐.

- [ ] **Step 4: 커밋**

```bash
git add app.js
git commit -m "핵심 암송 7: 전체 이어서 암송 + 완주 배지 + 서버 완료 기록"
```

---

### Task 8: 스타일 + 배포 마무리(캐시태그/스플래시)

**Files:**
- Modify: `style.css` (핵심 암송 목록·스텝·전체이어서 스타일)
- Modify: `index.html` (`?v=` 캐시태그 + `.splash-ver` v3.009)

**Interfaces:**
- Consumes: 앞 태스크의 클래스명(`pg-list`, `pg-card`, `pg-badge`, `pg-step`, `pg-steps`, `pg-final-line`, `pg-complete-badge`, `passages-cta` 등).

- [ ] **Step 1: 스타일 추가**

`style.css` 맨 끝에 추가(기존 `--navy/--gold/--cream/--border/--gray` 변수 재사용, 다크모드 포함):

```css
/* =====================================================================
   📜 핵심 암송(긴 본문)
   ===================================================================== */
.summary-help.passages-cta { border-color: var(--gold); }
.pg-list-title { font-weight: 800; color: var(--navy); font-size: 1.05rem; margin: 8px 4px 12px; }
.pg-list-sub { display: block; font-size: .8rem; font-weight: 500; color: var(--gray); margin-top: 2px; }
.pg-list { display: flex; flex-direction: column; gap: 10px; }
.pg-empty { color: var(--gray); text-align: center; padding: 30px 0; }
.pg-card {
  display: flex; align-items: center; gap: 10px;
  padding: 14px 16px; background: var(--white); border: 1px solid var(--border);
  border-radius: 14px; cursor: pointer;
}
.pg-card.complete { border-color: var(--gold); background: #fdf9ee; }
.pg-card-main { flex: 1; min-width: 0; }
.pg-card-title { font-weight: 700; color: var(--navy); }
.pg-card-ref { font-size: .8rem; color: var(--gray); margin-top: 2px; }
.pg-badge { flex-shrink: 0; font-size: 12px; font-weight: 700; color: var(--gray); background: var(--light); border-radius: 999px; padding: 4px 11px; }
.pg-badge.prog { color: var(--navy); background: #eef1f8; }
.pg-badge.done { color: #8a6d1f; background: #faf1d3; }
.pg-steps { display: flex; flex-direction: column; gap: 8px; margin: 14px 0; }
.pg-step {
  display: flex; align-items: center; gap: 10px; text-align: left;
  padding: 12px 14px; border-radius: 12px; border: 1px solid var(--border);
  background: var(--white); font-family: inherit; font-size: .95rem; color: #333; cursor: pointer;
}
.pg-step.done { border-color: #cfe6d5; background: #f2f9f4; color: #2c5f2d; }
.pg-step.next { border-color: var(--navy); background: #eef1f8; color: var(--navy); font-weight: 700; }
.pg-step.lock { color: #b8b2a2; cursor: default; }
.pg-step-ic { flex-shrink: 0; width: 20px; text-align: center; }
.pg-step-tx { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pg-steps-hint, .pg-final-hint { color: var(--gray); font-size: .85rem; text-align: center; margin: 8px 0; }
.pg-complete-badge { margin-top: 12px; text-align: center; font-weight: 700; color: #8a6d1f; }
.pg-final-sentence { display: flex; flex-direction: column; gap: 10px; }
.pg-final-line { line-height: 2.1; }
.dark .pg-card { background: #1b2233; border-color: #33405c; }
.dark .pg-card.complete { background: #2a2413; border-color: #6b5a2a; }
.dark .pg-card-title, .dark .pg-list-title { color: #cdd9f2; }
.dark .pg-step { background: #1b2233; border-color: #33405c; color: #cdd9f2; }
.dark .pg-step.done { background: #17311f; border-color: #2f5a42; color: #8fd6ab; }
.dark .pg-step.next { background: #232c3f; border-color: #4a5e86; color: #cdd9f2; }
.dark .pg-badge { background: #232c3f; color: #9fb0cc; }
```

- [ ] **Step 2: 캐시태그 + 스플래시 버전 갱신**

`index.html`에서:
- `style.css?v=20260722c` → `style.css?v=20260723a`
- `app.js?v=20260722g` → `app.js?v=20260723a`
- `<div class="splash-ver">v3.008</div>` → `<div class="splash-ver">v3.009</div>`

- [ ] **Step 3: 문법 검사**

Run: `node --check app.js`
Expected: 출력 없음.

- [ ] **Step 4: 커밋 · 푸시 · 배포 확인**

```bash
git add style.css index.html
git commit -m "핵심 암송 8: 목록·절·전체 스타일 + 캐시태그·스플래시 v3.009"
git push origin main
```
그다음 Actions 완료 대기 후:
```bash
curl -s "https://gocheok.onlybible.kr/?_=$(date +%s)" | grep -o 'app.js?v=[0-9a-z]*\|splash-ver">v[0-9.]*'
```
Expected: `splash-ver">v3.009` · `app.js?v=20260723a`.

- [ ] **Step 5: 통합 수동 검증(실기기 권장)**

1. `?passages=1` → 홈 버튼 노출 → 주기도문 절별 진행 → 전체 이어서 → 👑 완주.
2. 다크모드에서 목록·절·전체 화면 가독성 확인.
3. 어드민 "핵심 암송 관리"에서 "사용자 공개" 체크 → 일반 접속(쿼리 없이)에서도 홈에 버튼 노출 확인 → 다시 해제.
4. 기존 주간 구절 암송·복습·랭킹이 정상(별도 트랙, 영향 없음) 확인.

---

## Self-Review 체크

- **스펙 커버리지**: 메뉴 구조(Task 4·5), 데이터 모델(Task 1), 절 순차+전체 이어서(Task 6·7), 어드민 입력(Task 4), 완료 배지·언제든 다시(Task 7), 서버 완료 기록(Task 2·5·7), 공개 플래그(Task 2·4·5) — 전부 태스크로 매핑됨. 스펙의 "별도 admin-passages.html"은 DRY 위해 admin-stats.html 섹션으로 정제(어드민 입력 요구 충족).
- **범위(YAGNI)**: 영어 병행·간격반복 복습·랭킹 노출 제외(스펙과 일치).
- **타입 일관성**: `passage` 객체 필드(id,title,ref,category,sortOrder,lines,is_active) 어드민↔API 일치. 진행 shape `{done:[],completed:bool}` 로컬↔`savePassageProgress(user_id,passage_id,doneSeq,completed)` 서버 일치. `setupChallengeTyping(verse,onComplete)`·`setupVoice(verse,stage,onPass)`·`speakText(text,onEnd,times,lang)`·`pickBlankIndices` 기존 시그니처 그대로 사용.
- **주의(구현자 확인 포인트)**: (a) admin-stats.html의 섹션 컨테이너 id는 `renderContent`가 쓰는 것과 동일하게 맞출 것. (b) `setupChallengeTyping`은 `#ch-remain`, `setupVoice`는 `#voice-toggle/#voice-panel/#voice-status/#voice-live/#voice-result`, `setupAnswerToggle`은 `#show-answer-btn/#answer-panel/#back-to-test-btn` 요소를 요구 — 각 화면 HTML에 포함돼 있는지 확인(계획에 포함해 둠). (c) 초기화 훅에서 `getPassagesPreview()`가 URL을 1회만 정리하도록 기존 preview 처리와 같은 위치에 둘 것.
