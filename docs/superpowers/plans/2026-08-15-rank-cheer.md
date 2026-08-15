# 말씀 도전 순위 — 서로 응원하기 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 「🏆 말씀 도전 순위」의 각 줄에 한 탭 응원(`👏`)을 붙여, 성도끼리 격려할 수 있게 한다. 단 오늘 자기도 한 번은 도전해야 남을 응원할 수 있다.

**Architecture:** 새 표 `rank_cheers`에 (대상, 보낸이, 날짜) 한 행씩 쌓는다. 대상은 클라이언트가 화면에 보이는 네 조각(`gubun·sosok·sebu·name`)으로 지목하고 **서버가 `identityKey`로 `users.id`를 되짚는다** — 이 API는 JWT가 없어 클라이언트가 보낸 `user_id`를 그대로 믿으므로, 남의 `user_id`를 응답에 실으면 안 된다. `ranking`이 같은 기간의 응원을 집계해 함께 내려주고, 화면은 순위 줄 오른쪽 끝에 칩 하나를 그린다.

**Tech Stack:** Vanilla JS PWA (`app.js` 단일 파일) · `style.css` · Supabase Edge Function (Deno/TypeScript) · PostgreSQL

## Global Constraints

- **폰에서 순위 줄은 절대 두 줄이 되면 안 된다.** 320px에서도 한 줄을 지킨다.
- 대상 성도의 `user_id`를 API 응답에 실어서는 안 된다. 클라이언트가 서버로 보내는 `user_id`는 언제나 자기 것뿐이다.
- 켬/끔은 색조가 아니라 **밝기**로 가른다 — 켠 칩은 `var(--navy)`로 채우고 글자를 `#fff`로 뒤집는다.
- 날짜 경계는 모두 **KST**. 서버는 `kstDay(iso)`, 클라이언트는 기존 `ymdKo`를 쓴다. 새로 만들지 않는다.
- 받은 응원이 0이면 숫자를 그리지 않는다(`👏0` 금지).
- 이 저장소는 공개다. SQL·코드에 비밀번호나 키를 넣지 않는다.
- 이 프로젝트에는 단위 테스트 프레임워크가 없다. 검증 수단은 세 가지뿐이다 — `tests/smoke-readonly.sh`(curl), 헤드리스 크롬 `--screenshot` 하네스, `node --check app.js`. `--dump-dom`은 이 PC에서 출력이 비므로 쓰지 않는다.
- 배포는 `python tools/bump.py`를 **한 번** 돌린 뒤 커밋·푸시한다. 캐시 태그를 손으로 고치지 않는다.

---

### Task 1: 서버 — `rank_cheers` 표와 `rankCheer`·`rankCheerers` 액션

**Files:**
- Create: `supabase/rank_cheers.sql`
- Modify: `supabase/functions/api/index.ts` (액션 라우팅 174행 부근, 게시판 함수들 앞)
- Modify: `tests/smoke-readonly.sh:48` 뒤에 한 줄 추가

**Interfaces:**
- Produces:
  - `cheerTargetKey(b: any): string` — `{gubun, sosok, sebu, name}`을 `users.identity_key`와 같은 문자열로 바꾼다
  - `hasTodayActivity(userId: string): Promise<boolean>` — 오늘(KST) `challenge_log` 기록이 1건이라도 있는지
  - 액션 `rankCheer` → `{ok:true, on:boolean}` 또는 `{ok:false, error:string}`
  - 액션 `rankCheerers` → `{ok:true, list:string[]}`

- [ ] **Step 1: SQL 파일을 만든다**

`supabase/rank_cheers.sql`:

```sql
-- 말씀 도전 순위 — 서로 응원하기(👏)
-- ⚠️ 이 저장소는 공개(public)입니다 — 비밀번호·키를 절대 넣지 마세요.
--
-- 적용: Supabase 대시보드 → SQL Editor에 붙여넣고 실행
--
-- 한 사람이 같은 사람에게 하루 한 번만 응원할 수 있다 → 기본키에 cheer_date까지 넣는다.
-- (다시 누르면 그 행만 지운다. 다음 날이면 다시 누를 수 있다.)
-- 기간 집계는 created_at이 아니라 cheer_date로 거른다 — 순위 조회의 from~to(KST 날짜)와 단위가 같아
-- 시간대 환산 없이 정확하다.

create table if not exists public.rank_cheers (
  target_user_id text        not null,   -- 응원을 받은 성도(users.id)
  from_user_id   text        not null,   -- 응원을 보낸 성도(users.id)
  cheer_date     date        not null,   -- KST 기준 날짜
  from_name      text,                   -- 보낸 당시 소속·이름(명단 표시용 스냅샷)
  created_at     timestamptz not null default now(),
  primary key (target_user_id, from_user_id, cheer_date)
);

-- 순위표를 그릴 때 기간으로 한 번에 긁어오기 위한 인덱스
create index if not exists idx_rank_cheers_date
  on public.rank_cheers (cheer_date);

-- RLS 기본 차단 — Edge Function(service_role)만 읽고 쓴다
alter table public.rank_cheers enable row level security;

-- 확인: select cheer_date, count(*) from rank_cheers group by cheer_date order by 1 desc;
```

- [ ] **Step 2: Supabase에 표를 만든다**

Supabase 대시보드 → SQL Editor → 위 파일 내용을 붙여넣고 실행.
Expected: `Success. No rows returned`

- [ ] **Step 3: 실패하는 검증을 먼저 돌린다**

```bash
curl -s -X POST "https://xnomlgydifiqiybervtf.supabase.co/functions/v1/api" \
  -H "Content-Type: application/json" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" \
  -d '{"action":"rankCheerers","gubun":"교구","sosok":"사랑","sebu":"3","name":"없는사람"}'
```

Expected: `{"error":"unknown action: rankCheerers"}` — 아직 액션이 없다.

- [ ] **Step 4: 헬퍼 두 개를 더한다**

`supabase/functions/api/index.ts`에서 `// ---------- ranking:` 주석(1383행 부근) **바로 앞**에 넣는다:

```ts
// ---------- 순위 응원(👏) ----------
// 대상은 순위표에 이미 보이는 네 조각으로만 지목한다. 이 API는 JWT가 없어
// 클라이언트가 보낸 user_id를 그대로 믿으므로, 남의 user_id를 응답에 실으면
// 누구나 그 사람 행세를 할 수 있다. 그래서 서버가 identity_key로 되짚는다.
function cheerTargetKey(b: any) {
  const gubun = norm(b.gubun);
  const isGu = gubun === "교구";
  return identityKey({
    type: gubun,
    gu: isGu ? b.sosok : "",
    mok: isGu ? b.sebu : "",
    bu: isGu ? "" : b.sosok,
    grade: isGu ? "" : b.sebu,
    name: b.name,
  });
}

// 오늘(KST) 내 활동(암송·도전·복습)이 하나라도 있어야 남을 응원할 수 있다.
// challenge_log가 세 활동의 공통 원천 — 순위표를 만드는 원천과 같다.
async function hasTodayActivity(userId: string) {
  const today = kstDay(new Date().toISOString());
  const { count, error } = await db.from("challenge_log")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", `${today}T00:00:00${KST}`)
    .lte("created_at", `${today}T23:59:59.999${KST}`);
  if (error) return false;
  return (count ?? 0) > 0;
}

// 대상의 users.id를 찾는다. 못 찾으면 null.
async function cheerTargetId(b: any): Promise<string | null> {
  const { data } = await db.from("users").select("id")
    .eq("identity_key", cheerTargetKey(b)).maybeSingle();
  return data?.id ?? null;
}
```

- [ ] **Step 5: `rankCheer`를 더한다**

같은 파일, Step 4 블록 바로 뒤에 잇는다:

```ts
async function rankCheer(b: any) {
  const fromId = String(b.user_id || "");
  if (!fromId) return { ok: false, error: "로그인한 뒤에 응원할 수 있어요" };

  const targetId = await cheerTargetId(b);
  if (!targetId) return { ok: false, error: "응원할 성도를 찾지 못했어요" };
  if (targetId === fromId) return { ok: false, error: "자기 자신은 응원할 수 없어요" };

  const today = kstDay(new Date().toISOString());

  // 취소는 자격을 묻지 않는다 — 이미 준 것은 그때 자격이 있었다는 뜻이다.
  if (b.on === false) {
    const { error } = await db.from("rank_cheers").delete()
      .eq("target_user_id", targetId).eq("from_user_id", fromId).eq("cheer_date", today);
    if (error) throw error;
    return { ok: true, on: false };
  }

  // 클라이언트에서도 막지만 여기가 진짜 관문이다.
  if (!(await hasTodayActivity(fromId))) {
    return { ok: false, error: "오늘 말씀을 한 번이라도 암송하면 응원할 수 있어요" };
  }
  const { error } = await db.from("rank_cheers").upsert({
    target_user_id: targetId, from_user_id: fromId, cheer_date: today,
    from_name: norm(b.who) || null,
  }, { onConflict: "target_user_id,from_user_id,cheer_date", ignoreDuplicates: true });
  if (error) throw error;
  return { ok: true, on: true };
}

// 그 성도를 응원한 사람 이름(기간 안). 자격·기간과 무관하게 누구나 읽을 수 있다.
async function rankCheerers(b: any) {
  const targetId = await cheerTargetId(b);
  if (!targetId) return { ok: true, list: [] };
  let q = db.from("rank_cheers").select("from_name, cheer_date").eq("target_user_id", targetId);
  if (b.from) q = q.gte("cheer_date", b.from);
  if (b.to)   q = q.lte("cheer_date", b.to);
  const { data, error } = await q.order("cheer_date", { ascending: false });
  if (error) throw error;
  return { ok: true, list: (data ?? []).map((r: any) => r.from_name).filter(Boolean) };
}
```

- [ ] **Step 6: 액션을 라우팅에 잇는다**

같은 파일 174행 부근, `// ---- 응원·기도·공감 게시판 ----` 주석 **바로 앞**에 넣는다:

```ts
      // ---- 순위 응원 ----
      case "rankCheer":     return json(await rankCheer(body));
      case "rankCheerers":  return json(await rankCheerers(body));
```

- [ ] **Step 7: 배포하고 검증이 통과하는지 본다**

```bash
supabase functions deploy api --no-verify-jwt --project-ref xnomlgydifiqiybervtf
```

그리고 Step 3의 curl을 다시 돌린다.
Expected: `{"ok":true,"list":[]}` — 없는 사람이라 빈 목록.

- [ ] **Step 8: 자격 관문이 실제로 막는지 확인한다**

오늘 활동이 없는 계정의 `user_id`로 직접 호출한다(클라이언트를 거치지 않는 경로가 진짜 관문이다):

```bash
curl -s -X POST "https://xnomlgydifiqiybervtf.supabase.co/functions/v1/api" \
  -H "Content-Type: application/json" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" \
  -d '{"action":"rankCheer","user_id":"오늘-활동-없는-uuid","gubun":"교구","sosok":"사랑","sebu":"3","name":"실제로있는성도"}'
```

Expected: `{"ok":false,"error":"오늘 말씀을 한 번이라도 암송하면 응원할 수 있어요"}`

- [ ] **Step 9: 스모크 테스트에 한 줄 더한다**

`tests/smoke-readonly.sh`의 48행(`13. 설교 아카이브 목록`) **뒤**에 넣는다:

```bash
check "14. 순위 응원 명단"                   "$(call "$BASE" '{"action":"rankCheerers","gubun":"교구","sosok":"사랑","sebu":"3","name":"없는사람"}')" '"ok":true'
```

- [ ] **Step 10: 스모크 전체를 돌린다**

```bash
bash tests/smoke-readonly.sh
```
Expected: `== 결과: 성공 14 · 실패 0 · 건너뜀 0 ==`

- [ ] **Step 11: 커밋**

```bash
git add supabase/rank_cheers.sql supabase/functions/api/index.ts tests/smoke-readonly.sh
git commit -m "feat(순위 응원): rank_cheers 표와 rankCheer·rankCheerers 액션을 더한다

대상은 화면에 보이는 네 조각으로 지목하고 서버가 identity_key로 되짚는다.
이 API는 JWT가 없어 클라이언트가 보낸 user_id를 그대로 믿으므로,
남의 user_id를 응답에 실으면 누구나 그 사람 행세를 할 수 있다.

응원 자격(오늘 내 활동 1건 이상)은 서버에서도 검사한다 — 클라이언트만
막으면 우회된다. 취소는 자격을 묻지 않는다."
```

---

### Task 2: 서버 — `ranking`에 `cheers`·`iCheered`·`canCheer`를 얹는다

**Files:**
- Modify: `supabase/functions/api/index.ts:1384-1407` (`ranking` 함수 전체)

**Interfaces:**
- Consumes: Task 1의 `hasTodayActivity`
- Produces: `ranking` 응답이 `{ok, list:[{rank, name, gubun, sosok, sebu, count, typing, voice, cheers, iCheered}], canCheer}`

- [ ] **Step 1: 실패하는 검증을 먼저 돌린다**

```bash
curl -s -X POST "https://xnomlgydifiqiybervtf.supabase.co/functions/v1/api" \
  -H "Content-Type: application/json" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" \
  -d '{"action":"ranking","from":"2020-01-01","to":"2026-12-31","includeLearn":true}' | head -c 300
```

Expected: 항목에 `cheers`·`iCheered`가 없고 최상위에 `canCheer`도 없다.

- [ ] **Step 2: `ranking`을 통째로 갈아끼운다**

`supabase/functions/api/index.ts:1384-1407`을 아래로 바꾼다. 바뀐 곳은 세 군데다 —
① 집계 맵에 `uid`를 남긴다 ② 응원을 집계한다 ③ 내보낼 때 `uid`를 떼고 `cheers`·`iCheered`를 붙인다.

```ts
async function ranking(b: any) {
  const includeLearn = !!b.includeLearn; // 앱 도전순위=true, 관리자 도전현황=false
  const data = await fetchAllRows(() => rangeFilter(
    db.from("challenge_log").select("user_id, mode, created_at, users(name,type,gu,mok,bu,grade)"), b));

  const map = new Map<string, any>();
  for (const row of data) {
    if (!includeLearn && !isChallengeMode(row.mode)) continue;
    const u = row.users ?? {};
    const e = map.get(row.user_id) ?? {
      uid: row.user_id,                  // 응원 집계를 붙이는 데만 쓰고 응답에서는 뗀다
      name: u.name, gubun: u.type,
      sosok: u.gu || u.bu || "", sebu: u.mok || u.grade || "",
      count: 0, typing: 0, voice: 0,
    };
    e.count++;
    if (String(row.mode).includes("typing")) e.typing++;
    if (String(row.mode).includes("voice")) e.voice++;
    map.set(row.user_id, e);
  }

  // ---- 응원 집계 ----
  // 숫자는 조회 기간(cheer_date) 기준, 켬(iCheered)은 '오늘' 기준이다.
  // 버튼이 하는 일이 "오늘 주기/취소"라 겉모습도 오늘을 따라야 어긋나지 않는다.
  const cheerCount = new Map<string, number>();
  const myToday = new Set<string>();
  let canCheer = false;
  try {
    const cheerRows = await fetchAllRows(() => {
      let q = db.from("rank_cheers").select("target_user_id");
      if (b.from) q = q.gte("cheer_date", b.from);
      if (b.to)   q = q.lte("cheer_date", b.to);
      return q;
    });
    for (const c of cheerRows) {
      cheerCount.set(c.target_user_id, (cheerCount.get(c.target_user_id) ?? 0) + 1);
    }
    const me = String(b.me || "");
    if (me) {
      const today = kstDay(new Date().toISOString());
      const { data: mine } = await db.from("rank_cheers")
        .select("target_user_id").eq("from_user_id", me).eq("cheer_date", today);
      for (const c of mine ?? []) myToday.add(c.target_user_id);
      canCheer = await hasTodayActivity(me);
    }
  } catch (_) {
    // 응원 집계가 실패해도 순위 자체는 보여준다 — 응원은 곁들이지 본체가 아니다.
  }

  const list = [...map.values()]
    .sort((a, b) => b.count - a.count)
    .map((x, i) => {
      const { uid, ...rest } = x;
      return {
        rank: i + 1, ...rest,
        cheers: cheerCount.get(uid) ?? 0,
        iCheered: myToday.has(uid),
      };
    });
  return { ok: true, list, canCheer };
}
```

- [ ] **Step 3: 배포하고 검증한다**

```bash
supabase functions deploy api --no-verify-jwt --project-ref xnomlgydifiqiybervtf
```

Step 1의 curl을 다시 돌린다.
Expected: 각 항목에 `"cheers":0,"iCheered":false`가 있고, 최상위에 `"canCheer":false`가 있다. **`uid`나 `user_id`는 없어야 한다.**

- [ ] **Step 4: user_id가 새지 않는지 못 박아 확인한다**

```bash
curl -s -X POST "https://xnomlgydifiqiybervtf.supabase.co/functions/v1/api" \
  -H "Content-Type: application/json" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" \
  -d '{"action":"ranking","from":"2020-01-01","to":"2026-12-31","includeLearn":true}' \
  | grep -o -E '"(uid|user_id)"' | head
```
Expected: 아무것도 출력되지 않는다.

- [ ] **Step 5: 관리자 화면이 안 깨졌는지 본다**

`admin-stats.html`의 도전 현황을 열어 목록이 그대로 나오는지 확인한다(필드가 늘기만 했으므로 깨지지 않아야 한다).

- [ ] **Step 6: 커밋**

```bash
git add supabase/functions/api/index.ts
git commit -m "feat(순위 응원): ranking이 기간별 응원 수와 내 오늘 여부를 함께 내려준다

숫자는 조회 기간(cheer_date) 기준, 켬은 오늘 기준으로 나눈다.
버튼이 하는 일이 '오늘 주기/취소'라 겉모습도 오늘을 따라야 한다.

집계에 쓰던 uid는 응답에서 뗀다 — 남의 user_id가 나가면 안 된다.
응원 집계가 실패해도 순위 자체는 보여준다."
```

---

### Task 3: 클라이언트 — 소속 표기 축약과 한 줄 레이아웃

**Files:**
- Modify: `app.js:5931` (`soLabel`)
- Modify: `style.css:2253-2263` (`.rank-row` 계열)
- Create: `<스크래치패드>/rank-oneline.html` (검증 하네스, 저장소에 넣지 않는다)

**Interfaces:**
- Produces: `soLabel(x)` — `{gubun, sosok, sebu}`를 `사랑-3` 꼴 문자열로

- [ ] **Step 1: 검증 하네스를 만든다**

스크래치패드에 `rank-oneline.html`을 만든다. `style.css`를 같은 폴더에 복사해 `./style.css`로 부른다(저장소를 더럽히지 않는다). 외부 폰트 `<link>`는 넣지 않는다 — 이 PC에서 로드가 멈춰 스크린샷이 안 찍힌다.

```html
<!doctype html>
<html lang="ko"><head><meta charset="utf-8" />
<link rel="stylesheet" href="./style.css" />
<style>
  body { font-family:"Malgun Gothic","맑은 고딕",sans-serif; background:#e9e4d8; padding:10px; }
  .grid { display:flex; gap:14px; align-items:flex-start; }
  .cap { font:700 11px monospace; padding:3px 0; }
  .phone { background:#fffdf7; outline:2px solid #c33; }
  .appish { max-width:600px; margin:0 auto; padding:6px 20px 28px; }
</style></head><body>
<div class="grid" id="g"></div>
<script>
// 최악 케이스까지 넣는다 — 4글자 이름 + 긴 소속 + 두 자리 응원 수
const ROWS = [
  ["\u{1F947}","김사랑","사랑-3","42회","on","5"],
  ["\u{1F948}","이은혜","믿음-12","38회","","3"],
  ["\u{1F949}","박민수","소망-남성","31회","",""],
  ["4","최지우","새가족","27회","on","12"],
  ["5","남궁민수","화평-20","9회","",""],
  ["12","김하늘","중등부-2","4회","","1"],
  ["37","황보라영","새가족-남성","2회","","8"],
];
const row = ([no,nm,so,cnt,on,c]) =>
  '<div class="rank-row">'
  + '<span class="rk-no">'+no+'</span><span class="rk-name">'+nm+'</span>'
  + '<span class="rk-so">'+so+'</span><span class="rk-cnt">'+cnt+'</span>'
  + '<button class="rk-cheer'+(on?" on":"")+'">\u{1F44F}'+(c?'<b>'+c+'</b>':'')+'</button></div>';
document.getElementById("g").innerHTML = [320,360,390,430].map(w=>`
  <div><div class="cap">${w}px</div>
    <div class="phone" style="width:${w}px"><main class="appish">
      <div class="rank-screen"><div class="rank-list">${ROWS.map(row).join("")}</div></div>
    </main></div></div>`).join("");
// 한 줄이면 모든 자식의 위/아래 좌표가 한 줄 높이 안에 든다
addEventListener("load", () => {
  document.querySelectorAll(".phone").forEach(ph => {
    let bad = 0;
    ph.querySelectorAll(".rank-row").forEach(r => {
      const k = [...r.children].map(c => c.getBoundingClientRect());
      const top = Math.min(...k.map(x=>x.top)), bot = Math.max(...k.map(x=>x.bottom));
      if (bot - top > Math.max(...k.map(x=>x.height)) + 2) bad++;
    });
    const cap = ph.previousElementSibling;
    cap.textContent += bad ? "  ← 두 줄 "+bad+"개" : "  ← 전부 한 줄 OK";
    cap.style.color = bad ? "#c33" : "#176b3a";
  });
});
</script></body></html>
```

- [ ] **Step 2: 하네스를 돌려 지금은 두 줄임을 확인한다**

```bash
cp style.css "$SCRATCH/style.css"
"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless --disable-gpu --no-sandbox \
  --hide-scrollbars --user-data-dir="$SCRATCH/cp" --window-size=1660,520 \
  --screenshot="$SCRATCH/rank-before.png" "file:///$SCRATCH/rank-oneline.html"
```

`rank-before.png`를 연다.
Expected: `.rk-cheer` 스타일이 아직 없어 칩이 맨 모양이고, 좁은 폭에서 **두 줄 N개**로 빨갛게 뜬다.

- [ ] **Step 3: `soLabel`을 바꾼다**

`app.js:5931`을 아래로 바꾼다:

```js
  // 소속 표기 — '사랑교구 3목장' → '사랑-3'. 순위 줄을 한 줄로 지키려고 짧게 쓴다.
  // 목장은 입력 단계에서 숫자 또는 '남성'만 허용되고(app.js의 검사), 99는 '없음'을 뜻한다.
  const soLabel = (x) => {
    const head = String(x.sosok || "").trim();
    let tail = String(x.sebu || "").trim();
    if (x.gubun === "교구") { if (tail === "99") tail = ""; }
    else tail = tail.replace(/학년$/, "");
    return tail ? `${head}-${tail}` : head;
  };
```

- [ ] **Step 4: 한 줄 레이아웃 CSS로 바꾼다**

`style.css:2253-2263`을 아래로 바꾼다. `gap`을 12→8로 좁히고, **소속만 신축 칸**으로 두어 모자라면 소속이 `…`로 줄게 한다. 나머지는 고정이라 줄이 늘어날 수 없다.

```css
.rank-row{
  display:flex; align-items:center; gap:8px;
  background:#fff; border:1px solid var(--border); border-radius:11px; padding:11px 14px;
}
.rank-row.top{ border-color:var(--gold); background:#fffdf6; }
.rank-row.me{ box-shadow:0 0 0 2px var(--navy) inset; }
.rank-row .rk-no{ flex:0 0 auto; font-size:1.05rem; font-weight:800; color:var(--navy); min-width:1.8em; text-align:center; }
.rank-row .rk-name{ flex:0 0 auto; white-space:nowrap; font-weight:700; color:#222; }
/* 소속만 남는 폭을 쓴다 — 모자라면 여기가 …로 줄고 줄은 절대 안 늘어난다 */
.rank-row .rk-so{
  flex:1 1 auto; min-width:0;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  color:var(--gray); font-size:.82rem;
}
.rank-row .rk-cnt{ flex:0 0 auto; font-weight:800; color:var(--navy); }
.rank-row.top .rk-cnt{ color:var(--gold); }
```

- [ ] **Step 5: 응원 칩 스타일을 더한다**

`style.css`의 위 블록 바로 뒤에 잇는다:

```css
/* 순위 응원 칩 — 켬/끔은 밝기로 가른다(색조만 바꾸면 흰 카드와 구분이 안 된다) */
.rk-cheer{
  flex:0 0 auto; display:inline-flex; align-items:center; gap:3px;
  cursor:pointer; font-family:inherit; font-size:.8rem; line-height:1.2;
  padding:4px 8px; border-radius:999px;
  border:1.5px solid var(--border); background:#fff; color:#5a6273;
}
.rk-cheer b{ font-size:.76rem; font-weight:800; color:#5a6273; }
.rk-cheer.on{ border-color:var(--navy); background:var(--navy); color:#fff; }
.rk-cheer.on b{ color:#fff; }
.rk-cheer:disabled{ opacity:.45; cursor:default; }
.rk-cheer.open{ box-shadow:0 0 0 2px rgba(26,58,107,.38); }
.dark .rk-cheer{ background:#1b2942; border-color:#2b3a5a; color:#b9c6dd; }
.dark .rk-cheer b{ color:#b9c6dd; }
.dark .rk-cheer.on{ background:#5c8ede; border-color:#8bb4f0; color:#fff; }
.dark .rk-cheer.on b{ color:#fff; }
```

- [ ] **Step 6: 하네스를 다시 돌려 한 줄인지 확인한다**

```bash
cp style.css "$SCRATCH/style.css"
"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless --disable-gpu --no-sandbox \
  --hide-scrollbars --user-data-dir="$SCRATCH/cp" --window-size=1660,520 \
  --screenshot="$SCRATCH/rank-after.png" "file:///$SCRATCH/rank-oneline.html"
```

`rank-after.png`를 연다.
Expected: 320·360·390·430px 네 칸 모두 **초록색 "전부 한 줄 OK"**. 320px의 마지막 줄만 소속이 `새가족…`으로 줄어든다.

- [ ] **Step 7: 문법을 확인하고 커밋**

```bash
node --check app.js
git add app.js style.css
git commit -m "feat(순위): 소속을 '사랑-3'으로 줄이고 줄을 한 줄로 고정한다

응원 칩이 들어갈 자리를 만든다. '사랑교구 3목장'(9자)이 '사랑-3'(4자)으로
줄어 약 64px을 번다. 목장은 입력 단계에서 숫자 또는 '남성'만 허용되고
99는 없음을 뜻하므로 축약이 안전하다.

소속만 신축 칸으로 두어 모자라면 소속이 …로 줄게 한다. 나머지 칸은
고정이라 이름·소속이 아무리 길어도 줄이 늘어날 수 없다. 320~430px에서
최악 케이스까지 렌더해 전부 한 줄임을 확인했다."
```

---

### Task 4: 클라이언트 — 응원 칩 동작·자격 배너·내 순위 바

**Files:**
- Modify: `js/api.js:47` (ranking에 `me` 추가), `js/api.js:59` 뒤 (rankCheer·rankCheerers)
- Modify: `app.js:5068-5070` (`callRanking`)
- Modify: `app.js:5920-5959` (`loadRankingBody`)
- Modify: `style.css` (Task 3 블록 뒤에 자격 배너·명단 줄)

**Interfaces:**
- Consumes: Task 1·2의 `rankCheer`·`rankCheerers` 액션과 `ranking`의 `cheers`·`iCheered`·`canCheer`
- Produces: 없음 (화면 끝단)

- [ ] **Step 1: API 래퍼를 더한다**

`js/api.js:47`을 바꾼다:

```js
  ranking: (from, to, includeLearn, me) => supaCall("ranking", { from, to, includeLearn, me }),   // 날짜(YYYY-MM-DD), includeLearn=학습 포함, me=내 user_id(응원 표시용)
```

같은 파일 59행(`boardReactors`) **뒤**에 잇는다:

```js
  // 순위 응원(👏) — 대상은 화면에 보이는 네 조각으로 지목한다(서버가 되짚는다)
  rankCheer: (gubun, sosok, sebu, name, user_id, who, on) =>
    supaCall("rankCheer", { gubun, sosok, sebu, name, user_id, who, on }),
  rankCheerers: (gubun, sosok, sebu, name, from, to) =>
    supaCall("rankCheerers", { gubun, sosok, sebu, name, from, to }),
```

- [ ] **Step 2: `callRanking`이 내 id를 함께 보내게 한다**

`app.js:5068-5070`을 바꾼다:

```js
async function callRanking(from, to) {
  // me=내 user_id — 응원 칩의 켬/끔과 자격(canCheer)을 서버가 판단한다.
  // 내 것만 보내므로 새로 새는 정보가 없다(게시판 공감과 같은 방식).
  return api.ranking(from, to, true, myUserId());
}
```

- [ ] **Step 3: `loadRankingBody`를 갈아끼운다**

`app.js:5920-5959`를 아래로 바꾼다:

```js
async function loadRankingBody(r) {
  const body = document.getElementById("rank-body");
  const u = loadUser();
  const data = await callRanking(r.from, r.to).catch(() => ({ ok: false }));
  if (!data || !data.ok) { body.innerHTML = `<p class="rank-msg err">순위를 불러오지 못했습니다.</p>`; return; }

  const list = data.list || [];
  const keyOf = (g, s, sb, n) => g + "|" + s + "|" + sb + "|" + n;
  const myKey = u ? keyOf(u.type, u.gu || u.bu || "", u.mok || u.grade || "", u.name) : null;
  const me = myKey ? list.find((x) => keyOf(x.gubun, x.sosok, x.sebu, x.name) === myKey) : null;
  const medal = (n) => (n === 1 ? "🥇" : n === 2 ? "🥈" : n === 3 ? "🥉" : n);
  // 소속 표기 — '사랑교구 3목장' → '사랑-3'. 순위 줄을 한 줄로 지키려고 짧게 쓴다.
  // 목장은 입력 단계에서 숫자 또는 '남성'만 허용되고(app.js의 검사), 99는 '없음'을 뜻한다.
  const soLabel = (x) => {
    const head = String(x.sosok || "").trim();
    let tail = String(x.sebu || "").trim();
    if (x.gubun === "교구") { if (tail === "99") tail = ""; }
    else tail = tail.replace(/학년$/, "");
    return tail ? `${head}-${tail}` : head;
  };

  // 응원을 '줄' 수 있는 조건 — 로그인했고, 오늘 활동이 있고, 보고 있는 기간이 오늘을 포함해야 한다.
  // 오늘이 안 들어간 기간(직접 지정)에서는 눌러도 숫자가 안 변해 어리둥절해진다.
  const today = ymdKo(new Date());
  const rangeHasToday = !r.to || r.to >= today;
  const canGive = !!u && !!data.canCheer && rangeHasToday;

  // 칩 — 남의 줄이면 응원 주기/취소, 내 줄이면 받은 명단 펼치기.
  // 하나의 칩이 두 뜻을 겸하지 않게 줄마다 뜻을 하나씩만 준다.
  const chip = (x, i, isMe) => {
    const n = x.cheers || 0;
    const num = n ? `<b>${n}</b>` : "";           // 0이면 숫자를 그리지 않는다
    if (isMe) {
      return `<button class="rk-cheer mine" data-mine="${i}" ${n ? "" : "disabled"}
        aria-label="내가 받은 응원 ${n}">👏${num}</button>`;
    }
    return `<button class="rk-cheer${x.iCheered ? " on" : ""}" data-give="${i}"
      ${canGive ? "" : "disabled"} aria-label="응원하기">👏${num}</button>`;
  };

  const myHtml = u
    ? `<div class="my-rank">
         <span class="mr-label">내 순위</span>
         ${me
            ? `<span class="mr-rank">${medal(me.rank)}</span><span class="mr-name">${u.name}</span><span class="mr-cnt">${me.count}회</span>`
            : `<span class="mr-name">${u.name}</span><span class="mr-cnt none">아직 기록 없음 — 도전해보세요! 🔥</span>`}
       </div>`
    : "";

  // 자격이 없으면 목록 위에 한 줄로 알린다. 줄마다 자물쇠를 달면 화면이 시끄러워진다.
  const lockHtml = (u && !data.canCheer && rangeHasToday)
    ? `<p class="rank-lock">🔒 오늘 말씀을 한 번이라도 암송하면 서로 응원할 수 있어요
         <button id="rk-go-test">도전하러 가기 ›</button></p>`
    : "";

  if (!list.length) {
    body.innerHTML = myHtml + `<p class="rank-msg">아직 도전 기록이 없어요.<br>첫 도전의 주인공이 되어보세요! 🔥</p>`;
    return;
  }

  const rows = list.map((x, i) => {
    const isMe = keyOf(x.gubun, x.sosok, x.sebu, x.name) === myKey;
    return `<div class="rank-row ${x.rank <= 3 ? "top" : ""} ${isMe ? "me" : ""}">
      <span class="rk-no">${medal(x.rank)}</span>
      <span class="rk-name">${x.name}</span>
      <span class="rk-so">${soLabel(x)}</span>
      <span class="rk-cnt">${x.count}회</span>
      ${chip(x, i, isMe)}
    </div><div class="rk-names" hidden></div>`;
  }).join("");

  body.innerHTML = myHtml + lockHtml + `<div class="rank-list">${rows}</div>` +
    `<p class="rank-more">전체 ${list.length}명 참여</p>`;

  const goTest = document.getElementById("rk-go-test");
  if (goTest) goTest.addEventListener("click", renderSummary);

  body.querySelectorAll("[data-give]").forEach((btn) => btn.addEventListener("click", () => {
    const x = list[+btn.dataset.give];
    giveRankCheer(x, btn.classList.contains("on") ? false : true, r);
  }));
  body.querySelectorAll("[data-mine]").forEach((btn) => btn.addEventListener("click", () => {
    showRankCheerers(list[+btn.dataset.mine], btn, r);
  }));
}

// 응원 주기/취소 — 서버가 자격을 다시 검사하므로 거절되면 그 문구를 그대로 보여준다.
async function giveRankCheer(x, on, r) {
  const u = loadUser();
  if (!u || !u.user_id) { appAlert("로그인하시면 응원할 수 있어요."); return; }
  let d;
  try { d = await api.rankCheer(x.gubun, x.sosok, x.sebu, x.name, u.user_id, boardWho(), on); }
  catch (e) { appAlert("응원을 저장하지 못했어요.<br>" + boardEsc(e && e.message ? e.message : e)); return; }
  if (!d || !d.ok) { appAlert(boardEsc((d && d.error) || "응원하지 못했어요.")); return; }
  loadRankingBody(r); // 숫자를 서버 기준으로 다시 받는다
}

// 내가 받은 응원 명단 — 모달 대신 줄 아래에 펼친다(다시 누르면 접힘).
// 자격·기간과 무관하게 언제나 볼 수 있다. 잠기는 것은 '주는 일'뿐이다.
async function showRankCheerers(x, btn, r) {
  const box = btn.closest(".rank-row").nextElementSibling;
  if (!box || !box.classList.contains("rk-names")) return;
  if (!box.hidden) { box.hidden = true; btn.classList.remove("open"); return; }
  box.hidden = false;
  btn.classList.add("open");
  box.innerHTML = '<div class="rx-names-top"><span class="rx-names-msg">불러오는 중…</span></div>';
  let list;
  try { list = (await api.rankCheerers(x.gubun, x.sosok, x.sebu, x.name, r.from, r.to)).list || []; }
  catch (e) { box.innerHTML = '<div class="rx-names-top"><span class="rx-names-msg">이름을 불러오지 못했어요.</span></div>'; return; }
  box.innerHTML = '<div class="rx-names-top"><span class="rx-names-e">👏</span>' +
    (list.length
      ? '<span class="rx-names-l">' + list.map((n) => boardEsc(n)).join(" · ") + '</span>'
      : '<span class="rx-names-msg">아직 받은 응원이 없어요.</span>') + '</div>';
}
```

- [ ] **Step 4: 자격 배너와 명단 줄 스타일을 더한다**

`style.css`의 Task 3 블록 뒤에 잇는다. 명단 줄은 게시판의 `.rx-names`를 그대로 재사용하고 바깥 여백만 맞춘다:

```css
/* 응원 자격 안내 — 줄마다 자물쇠를 달지 않고 목록 위에 한 줄로 알린다 */
.rank-lock{
  display:flex; align-items:center; flex-wrap:wrap; gap:6px 10px;
  background:var(--light); border:1px solid var(--border); border-radius:11px;
  padding:10px 13px; margin-bottom:10px; text-align:left;
  font-size:.82rem; line-height:1.5; color:#5a6273;
}
.rank-lock button{
  cursor:pointer; font-family:inherit; font-size:.78rem; font-weight:800;
  padding:4px 10px; border-radius:999px; white-space:nowrap;
  border:1px solid var(--navy); background:#fff; color:var(--navy);
}
.dark .rank-lock{ background:#1b2a47; border-color:#2b3a5a; color:#b9c6dd; }
.dark .rank-lock button{ background:#16233d; border-color:#5c7fb5; color:#cdd9f2; }

/* 내가 받은 응원 명단 — 게시판 .rx-names를 그대로 쓰고 순위 목록 간격만 맞춘다 */
.rank-list .rk-names{ margin:-3px 0 0; }
.rank-list .rk-names[hidden]{ display:none; }
```

`.rk-names`가 `.rx-names`의 모양을 물려받도록, `style.css`의 게시판 블록에서 **정확히 세 곳**의 선택자를 바꾼다. 자식 규칙(`.rx-names-top`·`.rx-names-e`·`.rx-names-l`·`.rx-names-msg`·`.dark .rx-names-l`)은 클래스 이름이 같아 손대지 않는다.

| 지금 | 바꿀 것 |
|---|---|
| `.rx-names { margin-top: 6px; …` | `.rx-names, .rk-names { margin-top: 6px; …` |
| `.rx-names[hidden] { display: none; }` | `.rx-names[hidden], .rk-names[hidden] { display: none; }` |
| `.dark .rx-names { background: #1b2a47; …` | `.dark .rx-names, .dark .rk-names { background: #1b2a47; …` |

- [ ] **Step 5: 문법 확인**

```bash
node --check app.js
```
Expected: 오류 없음

- [ ] **Step 6: 커밋**

```bash
git add js/api.js app.js style.css
git commit -m "feat(순위 응원): 순위 줄에 한 탭 응원(👏)을 붙인다

칩의 뜻은 줄마다 하나씩만 준다 — 남의 줄은 응원 주기/취소, 내 줄은
내가 받은 명단 펼치기. 하나의 칩이 두 뜻을 겸하면 눌렀을 때 무엇이
일어날지 알 수 없다.

오늘 자기 활동이 없으면 목록 위에 안내 한 줄을 띄우고 칩을 잠근다.
줄마다 자물쇠를 달면 화면이 시끄러워진다. 명단 보기는 자격·기간과
무관하게 열어 둔다 — 잠기는 것은 주는 일뿐이다.

오늘이 안 들어간 기간을 조회할 때도 주는 버튼만 잠근다. 응원은 오늘로
기록되는데 화면은 그 기간만 세므로 눌러도 숫자가 안 변하기 때문."
```

---

### Task 5: 배포와 실기기 검증

**Files:**
- Modify: `CLAUDE.md` (액션 목록·테이블 목록·주요 기능에 한 줄씩)
- Modify: 캐시 태그 일괄 (`python tools/bump.py`)

- [ ] **Step 1: `CLAUDE.md`를 갱신한다**

「**액션:**」 줄의 `ranking` 뒤에 잇는다: `· rankCheer/rankCheerers(순위 응원 👏 — 오늘 내 활동이 있어야 줄 수 있다)`

「**테이블:**」 줄 끝에 잇는다: `, rank_cheers(순위 응원 — 대상·보낸이·날짜가 기본키라 하루 한 번)`

「## 주요 기능」의 게시판 항목 뒤에 한 줄 더한다:

```markdown
- **순위 응원(2026-08-15):** 말씀 도전 순위 줄마다 `👏` 한 탭. **오늘 자기 도전 기록이 1건이라도 있어야** 남을 응원할 수 있다(서버에서도 검사). 하루 한 사람당 한 번, 다시 누르면 취소. 숫자는 조회 기간 기준·켬은 오늘 기준. 남의 줄 칩=응원 주기, 내 줄 칩=받은 명단 펼치기. 순위 줄은 폰에서 한 줄을 지켜야 해서 소속을 `사랑-3`으로 줄여 쓴다.
```

- [ ] **Step 2: 캐시 태그를 올린다**

```bash
python tools/bump.py
```
Expected: `판 번호 v3.169` 꼴로 오르고 `APP_BUILD`가 함께 바뀐다.

- [ ] **Step 3: 커밋·푸시**

```bash
git add -A
git commit -m "chore(순위 응원): 캐시 태그를 올리고 문서를 갱신한다"
git push origin main
```

- [ ] **Step 4: 배포가 반영될 때까지 기다린다**

```bash
until curl -s "https://gocheok.onlybible.kr/app.js?cb=$RANDOM" | grep -q 'rk-cheer'; do sleep 5; done
echo "반영됨"
```

- [ ] **Step 5: 스모크 전체를 돌린다**

```bash
bash tests/smoke-readonly.sh
```
Expected: `성공 14 · 실패 0`

- [ ] **Step 6: 실기기로 확인한다**

`gocheok.onlybible.kr` → 🏆 도전 순위. 아래를 눈으로 확인한다.

| 확인할 것 | 기대 |
|---|---|
| 오늘 아직 도전 안 한 상태 | 목록 위에 🔒 안내, 칩이 흐리고 안 눌림 |
| 한 구절 도전한 뒤 다시 순위 | 안내가 사라지고 칩이 살아남 |
| 남의 줄 칩 탭 | 숫자가 1 오르고 남색으로 채워짐 |
| 같은 칩 다시 탭 | 숫자가 1 줄고 흰 바탕으로 돌아감 |
| 내 줄 칩 탭 | 아래에 응원해 준 이름이 펼쳐짐 |
| 기간 탭을 오늘/이번주/전체로 바꿈 | 숫자가 기간에 따라 달라짐 |
| 날짜를 지난주로 직접 지정 | 주는 버튼이 잠기고 숫자만 보임 |
| 폰 세로 화면 | **어느 줄도 두 줄로 넘어가지 않음** |

- [ ] **Step 7: 어제 날짜 응원이 기간별로 옳게 세지는지 확인한다**

Supabase SQL Editor에서 어제 날짜 행을 하나 넣는다(자기 자신을 대상으로 넣어 두 id를 아는 상태로):

```sql
insert into rank_cheers (target_user_id, from_user_id, cheer_date, from_name)
values ('<대상-users.id>', '<보낸이-users.id>', current_date - 1, '테스트');
```

앱에서 확인한다.
Expected: 「오늘」 탭에서는 안 세고, 「이번주」·「전체」 탭에서는 세어진다.

확인이 끝나면 지운다:

```sql
delete from rank_cheers where from_name = '테스트';
```

---

## Self-Review

**스펙 대조** — 설계 문서의 각 절이 어느 작업에 담겼는지.

| 스펙 항목 | 담긴 곳 |
|---|---|
| 칩 뜻 분리(남의 줄/내 줄) | Task 4 Step 3의 `chip()` |
| 명단은 `.rx-names` 재사용 | Task 4 Step 3·4 |
| 명단 보기는 자격·기간 무관 | Task 4 Step 3의 `showRankCheerers`(잠금 조건 없음) |
| 「내 순위」 바 | Task 4 Step 3 — **내 줄 칩으로 대신한다**(아래 참고) |
| 0이면 숫자 감춤 | Task 4 Step 3의 `num` |
| 자격 안내 한 줄 | Task 4 Step 3의 `lockHtml`, Step 4의 `.rank-lock` |
| 켬=채움 | Task 3 Step 5의 `.rk-cheer.on` |
| 자격 서버 재검사 | Task 1 Step 5 |
| 기간=cheer_date | Task 1 Step 1, Task 2 Step 2 |
| 과거 기간 읽기 전용 | Task 4 Step 3의 `rangeHasToday` |
| 소속 축약 | Task 3 Step 3 |
| 한 줄 고정 | Task 3 Step 4, 검증은 Step 6 |
| user_id 비노출 | Task 2 Step 4가 못 박아 확인 |

**바뀐 결정 두 가지** (설계 문서와 다름 — 더 나아서 바꿨다):

1. **대상 저장을 `target_key text`에서 `target_user_id`로.** `identityKey`가 이미 `users.identity_key`와 같은 문자열을 만들므로, 서버가 그걸로 `users.id`를 되짚어 저장한다. 텍스트 키가 표기 흔들림으로 갈릴 위험이 없고, 대상의 id는 여전히 밖으로 나가지 않는다.
2. **「내 순위」 바에 칩을 따로 달지 않는다.** 순위 목록의 내 줄(`.rank-row.me`) 칩이 같은 일을 한다. 바에도 달면 같은 것이 한 화면에 두 번 나온다. 다만 **순위에 못 든 성도는 받은 응원을 볼 수 없다** — 도전 기록이 없으면 응원받을 일도 사실상 없으므로 지금은 남겨 둔다. 실제로 필요해지면 그때 바에 붙인다.

**빈 곳 점검** — 계획 안에 TBD·"적절히 처리" 같은 문구 없음. 코드가 필요한 모든 단계에 실제 코드가 들어 있음.

**이름 일관성** — `hasTodayActivity`(Task 1 정의 → Task 2 사용), `cheerTargetId`(Task 1 내부), `rankCheer`/`rankCheerers`(Task 1 정의 → Task 4 호출), `soLabel`(Task 3·4 같은 구현), `.rk-cheer`/`.rk-names`(Task 3·4 일치) 모두 확인함.
