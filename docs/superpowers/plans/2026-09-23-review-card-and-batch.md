# 복습 살리기 — 카드 모드 + 3구절 묶음 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 복습 화면에 카드 모드를 넣고, 밀린 복습을 「가장 오래 밀린 것부터 3구절씩」 나눠 보여 준다.

**Architecture:** 복습 화면은 **이미 공용 `setupChallengeTyping` 을 쓴다**. 카드 쟁반은 그 함수가
`#card-tray` 가 있는 화면에서만 만든다 — 그래서 템플릿에 div 한 줄과 토글 단추만 넣으면 입력 로직은
그대로 돈다. 자르기는 `dueReviewNos()` **한 곳**에서 한다(호출처가 `renderSummary`·`startReview`
둘뿐이라 첫 화면 숫자·큐 길이·완료 화면 숫자가 저절로 같아진다).

**Tech Stack:** Vanilla JS(프레임워크 없음) · `app.js` 단일 대형 파일 · Supabase Edge Function(Deno/TS) ·
PostgreSQL CHECK 제약 · 시험은 Playwright(Python)

**설계문서:** `docs/superpowers/specs/2026-09-23-review-card-and-batch-design.md` — **먼저 읽을 것.**

---

## Global Constraints

- **답·주석·화면 문구는 모두 한글.** 이 앱 사용자는 교회 성도님이고 어르신이 많다.
- **배포 순서는 SQL → 서버 → 프런트.** 뒤집으면 복습 기록이 안 남는데 `advanceReview` 는 그대로 돌아
  **복습 일정만 밀려난다**(되돌릴 수 없다). Task 1·2가 **운영에 적용되기 전에는 Task 3~5를 push 하지 않는다.**
- **이 저장소는 push 가 곧 배포다.** 커밋은 자유롭게 하되 push 는 Task 8에서 한 번만.
- **`git commit -- <경로>` 로 경로를 못 박는다.** 여러 세션이 같은 인덱스를 공유한다 — `git add -A` 금지.
  커밋 전 `git diff --cached --stat` 으로 남의 파일이 없는지 본다.
- **`python tools/bump.py` 는 Task 8에서 딱 한 번.** 손으로 캐시태그를 고치지 않는다.
- **mode 문자열은 `review-typing-card` 하나만 새로 만든다.** `review-card` 는 금지 — 이름에 `typing` 이
  없어 순위·통계의 `%typing%` 집계에서 조용히 빠진다.
- **공용 `setupChallengeTyping` 의 `onComplete("typing")`(app.js:7674)을 건드리지 않는다.**
  본문 마디(app.js:4332)·본문 전체(4429)가 `mode === "typing"` 을 문자열로 직접 비교한다(4316).
  `tests/event-input.py` 가 이 값을 못 박아 두었다.
- **`isPsalmNo` 방어(app.js:1176-1180)를 걷어내지 않는다.** 2026-09-13 사고(no=1005)가 되살아난다.
- **되돌리기:** `REVIEW_BATCH` 를 999로 두면 자르기가 무효, `.sort()` 한 줄을 빼면 정렬이 무효.

### `$SB` — 운영 DB 조회용 작업 폴더 만들기

아래 명령들이 쓰는 `$SB` 는 **저장소 루트가 아니다.** 저장소 루트의 `.env` 8번째 줄
키 이름에 하이픈이 있어 supabase CLI 의 dotenv 파서가 죽는다
(`LegacyDbConfigLoadError: failed to parse environment file: .env`).
⚠️ **친구 파일이니 `.env` 를 고치지 말 것.** 대신 링크 정보만 복사해 쓴다:

```bash
SB=<스크래치패드 경로>
mkdir -p "$SB/sb/supabase"
cp -r /c/Projects/bible-memorize-church-app-v2/supabase/.temp "$SB/sb/supabase/"
supabase --workdir "$SB/sb" db query --linked "select 1;"   # 확인
```

⚠️ `--linked` 는 **운영**(`xnomlgydifiqiybervtf`)을 가리킨다. 개발 DB 조회·DDL 은
Supabase Dashboard 의 SQL Editor 를 쓴다.
⚠️ 다 쓰면 `rm -rf "$SB/sb"` — `linked-project.json` 에 키가 들어 있을 수 있다.

---

## File Structure

| 파일 | 책임 | 하는 일 |
|---|---|---|
| `supabase/migrate_modes_review_card.sql` | **생성** | `challenge_log.mode` CHECK 에 `review-typing-card` 추가 |
| `supabase/functions/api/index.ts` | 수정 | `challenge()` 폴백이 접두사를 보존하게 |
| `app.js` | 수정 | 복습 카드 모드 · 3구절 묶음 · 정렬 · 문구 |
| `supabase/schema.sql` | 수정 | 낡은 CHECK 목록 갱신 |
| `supabase/review_metrics.sql` | **생성** | 다시 잴 때 쓰는 고정 질의 + 기준선 |
| `tests/review-card.py` | **생성** | 카드 쟁반·토글·mode 매핑 회귀 시험 |
| `tests/review-batch.py` | **생성** | 정렬·자르기 회귀 시험 |
| `tools/screen-sweep.py` | 수정 | 복습 두 줄(자판·카드) 추가 |
| 주석·문서 11곳 | 수정 | Task 7 목록 참조 |

---

## Task 1: DB — CHECK 제약에 `review-typing-card` 추가

**Files:**
- Create: `supabase/migrate_modes_review_card.sql`
- Modify: `supabase/schema.sql:53` (낡은 목록 갱신)

**Interfaces:**
- Produces: `challenge_log.mode` 가 `'review-typing-card'` 를 받아들인다. Task 2·3이 여기에 기댄다.

- [ ] **Step 1: 지금 제약에 무엇이 있는지 먼저 본다**

⚠️ 아래 SQL 의 `do $$` 루프는 `contype='c'` 인 제약을 **이름 불문 전부** 지운다.
지금 `challenge_log` 의 CHECK 는 mode 하나뿐이지만(schema.sql:49-56), 돌리기 전에 확인한다.

```bash
SB=<스크래치패드>/sb   # supabase/.temp 를 .env 없는 폴더에 복사해 둔 곳
supabase --workdir "$SB" db query --linked \
  "select conname, pg_get_constraintdef(oid) from pg_constraint
    where conrelid='public.challenge_log'::regclass and contype='c';"
```

기대: `challenge_log_mode_check` **한 줄만** 나온다. 두 줄 이상이면 멈추고 사람에게 묻는다.

- [ ] **Step 2: 마이그레이션 파일을 만든다**

`supabase/migrate_modes_review_card.sql`:

```sql
-- challenge_log.mode 에 '카드로 채운 복습'을 더한다 (2026-09-23)
--
-- ⚠️ 이 파일은 제약을 지웠다 다시 만든다 — 몇 번을 실행해도 안전하다.
--    migrate_modes_card.sql(2026-08-25)의 목록을 그대로 물려받고 한 줄만 더했다.
--
-- ■ 왜
--   복습 화면에만 카드 모드가 없었다. 2026-09-23 실측 — 암송은 카드 59.6%,
--   도전은 77.5%인데 복습은 자판 99.9%다. 암송·도전에서 카드로 외우시던 분이
--   복습에 오면 갑자기 자판만 있는 화면을 만난다.
--   복습은 전체 반복의 0.6%(755회)뿐이고 대상 174명 중 122명(70.1%)이 한 번도 안 했다.
--
-- ■ 왜 'review-typing-card' 인가 ('review-card' 가 아니라)
--   순위·통계가 타이핑을 `mode like '%typing%'` 으로 센다. 이름에 typing 이 들어가야
--   지금까지의 숫자가 그대로 유지되면서 카드만 따로 가려낼 수 있다.
--   'review-card' 로 지으면 그 집계에서 **조용히 빠진다**(오류가 안 난다).
--
-- ■ ⚠️ 안 하면 어떻게 되나 — 도전 때와 다르다
--   도전 카드(typing-card)는 서버에 폴백이 있어 제약이 늦어도 기록이 살아남았다.
--   복습은 그 폴백이 `m === "typing-card"` 정확 일치라 **안 걸린다**(이번에 함께 넓힌다).
--   게다가 postChallenge 가 실패해도 바로 다음 줄 advanceReview 는 그대로 돌아
--   **기록은 안 남고 복습 일정만 다음 박스로 밀려난다.** 재시도 대기열도 없다.
--   → 그래서 이 SQL 이 **반드시 먼저**다.
--
-- 실행: Supabase Dashboard → SQL Editor. **개발(ktpwthwqzgcqcrmsafdo) 먼저, 그다음 운영.**

do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.challenge_log'::regclass and contype = 'c'
  loop
    execute 'alter table public.challenge_log drop constraint ' || quote_ident(c);
  end loop;
end $$;

alter table public.challenge_log add constraint challenge_log_mode_check
  check (mode in ('typing','voice','review-typing','review-voice',
                  'learn-typing','learn-voice',
                  'learn-typing-card',     -- 암송 화면을 카드로
                  'typing-card',           -- 말씀 도전을 카드로
                  'review-typing-card'));  -- 복습을 카드로 (2026-09-23)

-- 확인 — 목록에 review-typing-card 가 들어갔는지
select conname, pg_get_constraintdef(oid) as 제약
  from pg_constraint
 where conrelid = 'public.challenge_log'::regclass and contype = 'c';
```

- [ ] **Step 3: 개발 DB 에 적용하고 확인한다**

개발 프로젝트는 `ktpwthwqzgcqcrmsafdo` 다. Supabase SQL Editor 에 위 파일을 통째로 붙여넣고 RUN.

기대 출력: `제약` 칸에 `review-typing-card` 가 포함된 `CHECK ((mode = ANY (ARRAY[...])))`.

- [ ] **Step 4: 운영 DB 에 적용하고 확인한다**

운영은 `xnomlgydifiqiybervtf`. 같은 파일을 SQL Editor 에 붙여넣고 RUN.

확인:

```bash
supabase --workdir "$SB" db query --linked \
  "select pg_get_constraintdef(oid) from pg_constraint
    where conrelid='public.challenge_log'::regclass and contype='c';"
```

기대: 반환 문자열에 `review-typing-card` 가 들어 있다.

- [ ] **Step 5: `schema.sql` 의 낡은 목록을 갱신한다**

`supabase/schema.sql:53` 이 아직 카드 값 없는 6개 목록이다. 새 개발 DB 를 세우는 사람만 밟는 함정이라
오래 안 드러난다. 다음으로 바꾼다:

```sql
  mode        text not null check (mode in ('typing','voice','review-typing','review-voice',
                                            'learn-typing','learn-voice',
                                            'learn-typing-card','typing-card','review-typing-card')),
```

- [ ] **Step 6: 커밋**

```bash
git add supabase/migrate_modes_review_card.sql supabase/schema.sql
git diff --cached --stat        # 이 둘만 있어야 한다
git commit -m "feat(복습): challenge_log.mode 에 review-typing-card 를 허용한다

복습 화면에 카드 모드를 넣기 위한 첫 단계. 개발·운영 양쪽에 적용 완료.
schema.sql 의 낡은 목록(카드 두 값이 빠진 6개)도 함께 맞췄다." \
  -- supabase/migrate_modes_review_card.sql supabase/schema.sql
```

---

## Task 2: 서버 — 폴백이 접두사를 보존하게

**Files:**
- Modify: `supabase/functions/api/index.ts` — `async function challenge(b: any)` (2130줄 근처)

**Interfaces:**
- Consumes: Task 1의 넓혀진 CHECK 제약
- Produces: 클라이언트가 보낸 `review-typing-card` 가 그대로 저장된다. 제약이 없는 DB 에서는
  **접두사를 보존한 채** 되돌아간다(`review-typing`).

- [ ] **Step 1: 지금 코드를 확인한다**

```bash
sed -n '/^async function challenge/,/^}/p' supabase/functions/api/index.ts
```

기대: 폴백 조건이 `if (error && m === "typing-card")` 인 것을 눈으로 확인.

- [ ] **Step 2: 폴백을 접두사 보존으로 바꾼다**

`async function challenge(b: any)` 안에서, 아래 기존 블록을

```ts
  // 제약(migrate_modes_card.sql)이 아직 안 넓혀진 DB면 새 값이 거부된다.
  // 그때는 기록을 잃지 말고 옛 값으로 되돌린다 — 구분보다 기록이 먼저다.
  if (error && m === "typing-card") {
    const retry = await db.from("challenge_log").insert({
      user_id: b.user_id, verse_no: b.verse_no,
      mode: "typing", score: b.score ?? null,
    });
    error = retry.error;
  }
```

다음으로 바꾼다:

```ts
  // 제약(migrate_modes_card.sql · migrate_modes_review_card.sql)이 아직 안 넓혀진 DB면
  // 새 값이 거부된다. 그때는 기록을 잃지 말고 옛 값으로 되돌린다 — 구분보다 기록이 먼저다.
  // ⚠️ 되돌릴 값은 **접두사를 보존**해야 한다. 전부 "typing"으로 통일하면 복습과
  //    긴 본문(app.js:454 logPassageActivity 가 learn-* 를 이 액션으로 보낸다)이
  //    「도전」으로 둔갑해 전환율이 조용히 부풀어 오른다 —
  //    challenge_funnel.sql 의 도전 판정이 `mode not like 'learn%' and not like 'review%'` 다.
  //    2026-09-02 이전에 겪은 그 사고를 다시 만드는 셈이 된다.
  if (error && typeof m === "string" && m.endsWith("-card")) {
    const base = m.startsWith("review-") ? "review-typing"
               : m.startsWith("learn-")  ? "learn-typing"
               : "typing";
    const retry = await db.from("challenge_log").insert({
      user_id: b.user_id, verse_no: b.verse_no,
      mode: base, score: b.score ?? null,
    });
    error = retry.error;
  }
```

- [ ] **Step 3: 개발에 배포하기 전에 작업 트리를 본다**

⚠️ `supabase functions deploy` 는 git 이 아니라 **작업 트리를 올린다.**
다른 세션의 커밋 안 된 `index.ts` 변경이 함께 나간다.

```bash
git status --short supabase/functions/api/index.ts
git diff supabase/functions/api/index.ts
```

기대: **내가 방금 고친 블록만** diff 에 보인다. 남의 변경이 섞여 있으면 멈추고 사람에게 묻는다.

- [ ] **Step 4: 개발에 배포한다**

```bash
supabase functions deploy api --no-verify-jwt --project-ref ktpwthwqzgcqcrmsafdo
```

기대: `Deployed Functions on project ktpwthwqzgcqcrmsafdo`

- [ ] **Step 5: 개발에서 새 mode 가 실제로 들어가는지 확인한다**

⚠️ 명령줄에 한글 리터럴을 쓰면 깨진다 — body 를 UTF-8 파일로 만들어 보낸다.

먼저 개발 DB 에서 아무 `users.id` 와 아무 `verses.no` 를 하나씩 얻는다.
**개발 SQL Editor(ktpwthwqzgcqcrmsafdo)** 에서:

```sql
select (select id from users limit 1) as uid, (select no from verses limit 1) as vno;
```

그 두 값을 넣어 보낸다:

```bash
cat > "$SB/ch.json" <<'JSON'
{"action":"challenge","user_id":"여기에-uid","verse_no":1,"mode":"review-typing-card"}
JSON
curl -s -X POST "https://ktpwthwqzgcqcrmsafdo.supabase.co/functions/v1/api" \
  -H "Content-Type: application/json" --data-binary "@$SB/ch.json"
```

기대: `{"ok":true, ...}` (오류 문자열이 아니어야 한다)

그리고 실제로 들어갔는지 — 개발 SQL Editor 에서:

```sql
select mode, count(*) from challenge_log where mode like 'review%' group by 1;
```

기대: `review-typing-card` 행이 1 이상.

- [ ] **Step 5b: 시험 기록을 지운다**

방금 넣은 한 줄은 시험용이다. 개발 DB 라 해가 없지만 측정에 섞이니 지운다:

```sql
delete from challenge_log where mode = 'review-typing-card';
```

⚠️ `daily_activity` 트리거가 집계도 함께 줄여 준다(daily-activity.sql 의 DELETE 갈래).

- [ ] **Step 6: 운영에 배포한다**

```bash
git status --short supabase/functions/api/index.ts   # 다시 한 번
supabase functions deploy api --no-verify-jwt --project-ref xnomlgydifiqiybervtf
```

- [ ] **Step 7: 커밋**

```bash
git add supabase/functions/api/index.ts
git diff --cached --stat        # 이 파일 하나만
git commit -m "fix(복습): challenge 폴백이 mode 접두사를 보존하게

제약이 안 넓혀진 DB 에서 되돌릴 때 전부 typing 으로 통일하면 복습과 긴 본문이
도전으로 둔갑해 전환율이 조용히 부풀어 오른다. review-* 는 review-typing 으로,
learn-* 는 learn-typing 으로 되돌린다.

전에는 폴백 조건이 m === 'typing-card' 정확 일치라 복습 카드에는 아예 안 걸렸다 —
그 상태로 프런트가 먼저 나가면 기록은 안 남는데 advanceReview 는 그대로 돌아
복습 일정만 밀려난다." \
  -- supabase/functions/api/index.ts
```

---

## Task 3: 프런트 — 복습 카드 모드

**Files:**
- Modify: `app.js` — `renderReview`(7487~) 템플릿·핸들러·`onDone`, `startReview`(7462~)
- Test: `tests/review-card.py` (생성)

**Interfaces:**
- Consumes: Task 1의 CHECK, Task 2의 폴백
- Produces:
  - `reviewLogMode(mode: string) => "review-voice" | "review-typing-card" | "review-typing"`
    — 최상위 함수. Task 4·5는 안 쓰지만 `tests/review-card.py` 가 직접 부른다.
  - 복습 화면에 `#card-tray`(쟁반)와 `#rv-mode-toggle`(토글 단추)이 존재한다.
  - 복습 완료 시 `postChallenge(verse, reviewLogMode(mode))` 가 불린다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`tests/review-card.py` 를 만든다. `tests/event-input.py` 의 구조를 그대로 따른다
(로컬 http 서버를 띄우고 Playwright 로 연 뒤 app.js 의 함수를 직접 부른다).

```python
# -*- coding: utf-8 -*-
"""
복습 화면 카드 모드 회귀 시험 (2026-09-23).

복습은 암송·도전과 달리 **타자와 음성이 같은 onDone 을 공유**한다(app.js 의
setupChallengeTyping 과 setupVoice 에 같은 콜백을 넘긴다). 그래서 도전 코드를
그대로 베껴 cardUsed 를 먼저 보면 🎤 로 마친 기록이 review-typing-card 로 남는다.
이 시험이 그 실수를 막는다.

사용법:  python tests/review-card.py
"""
import subprocess, sys, time
from playwright.sync_api import sync_playwright

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

ROOT = r"C:\Projects\bible-memorize-church-app-v2"
PORT = 8802

VERSE = {"no": 1, "ref": "요 1:1", "refShort": "요 1:1", "text": "태초에 말씀이 계시니라", "week": 1}

# 복습 화면을 그리기 전에 바깥 세계를 막는다 — 서버로 나가는 길과 다음 화면으로 넘어가는 길.
SETUP = """
(verse) => {
  window.verses = [verse];
  window.__posted = null;
  window.postChallenge = (v, m) => { window.__posted = m; };
  window.advanceReview = () => {};
  window.reviewNext = () => {};
  window.fillVerseHelp = () => {};
  window.fillSermonSummaryBtn = () => {};
  window.setupHeartCheck = () => {};
  window.initStickyRef = () => {};
  window.scrollPastBtnRow = () => {};
  renderReview([verse], 0);
}
"""

# 빈칸을 카드로 전부 채운다(카드 모드일 때만 쟁반이 있다)
FILL_BY_CARD = """
() => {
  const tray = document.getElementById('card-tray');
  Array.from(document.querySelectorAll('.word-input')).map(i => i.dataset.answer).forEach(a => {
    const btn = Array.from(tray.querySelectorAll('.wcard')).find(b => b.textContent === a && !b.disabled);
    if (btn) btn.click();
  });
}
"""

# 빈칸을 자판으로 전부 채운다
FILL_BY_TYPING = """
() => {
  document.querySelectorAll('.word-input').forEach((el) => {
    el.value = el.dataset.answer;
    el.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: false }));
    el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
  });
}
"""

fails = []
srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT)], cwd=ROOT,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    time.sleep(1.2)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()

        def check(name, cond, extra=""):
            print(("PASS  " if cond else "FAIL  ") + name + ("" if cond else "  " + str(extra)))
            if not cond:
                fails.append(name)

        def open_review(card):
            page.goto(f"http://localhost:{PORT}/", wait_until="load")
            page.evaluate("(on) => localStorage.setItem('input-card-mode', on ? '1' : '0')", card)
            page.evaluate("() => localStorage.setItem('card-start', '0')")
            page.evaluate(SETUP, VERSE)
            page.wait_for_timeout(300)

        # ① 카드 모드면 쟁반에 낱말 카드가 생긴다
        open_review(True)
        cards = page.locator("#card-tray .wcard").count()
        check("카드 모드면 쟁반이 생긴다(낱말 %d장)" % cards, cards == 3, cards)

        # ② 자판 모드면 쟁반이 비어 있다
        open_review(False)
        cards0 = page.locator("#card-tray .wcard").count()
        check("자판 모드면 쟁반이 비어 있다", cards0 == 0, cards0)

        # ③ 토글 단추가 있고 누르면 바뀐다
        open_review(False)
        has_toggle = page.locator("#rv-mode-toggle").count() == 1
        check("토글 단추 #rv-mode-toggle 이 있다", has_toggle)
        if has_toggle:
            page.locator("#rv-mode-toggle").click()
            page.wait_for_timeout(300)
            after = page.locator("#card-tray .wcard").count()
            check("토글을 누르면 카드로 바뀐다(낱말 %d장)" % after, after == 3, after)

        # ④ 카드로 마치면 review-typing-card 로 남는다
        open_review(True)
        page.evaluate(FILL_BY_CARD)
        page.wait_for_timeout(700)
        posted = page.evaluate("() => window.__posted")
        check("카드로 마치면 review-typing-card", posted == "review-typing-card", posted)

        # ⑤ 자판으로 마치면 review-typing 으로 남는다
        open_review(False)
        page.evaluate(FILL_BY_TYPING)
        page.wait_for_timeout(900)
        posted = page.evaluate("() => window.__posted")
        check("자판으로 마치면 review-typing", posted == "review-typing", posted)

        # ⑥ ★ 카드 모드를 켜 두고 음성으로 마치면 review-voice 여야 한다.
        #    복습은 타자·음성이 같은 onDone 을 공유하므로, 도전 코드를 그대로 베껴
        #    카드 여부를 먼저 보면 여기서 review-typing-card 가 나온다.
        #    판정 자체는 reviewLogMode() 로 뽑혀 있어 화면 없이 바로 부를 수 있다.
        open_review(True)
        m = page.evaluate("() => reviewLogMode('voice')")
        check("카드를 켜 두고 음성으로 마치면 review-voice", m == "review-voice", m)
        m = page.evaluate("() => reviewLogMode('typing')")
        check("카드를 켜 두고 자판이면 review-typing-card", m == "review-typing-card", m)
        open_review(False)
        m = page.evaluate("() => reviewLogMode('voice')")
        check("자판 모드에서 음성이면 review-voice", m == "review-voice", m)

        browser.close()
finally:
    srv.terminate()

print()
print("모두 통과" if not fails else "실패 %d건: %s" % (len(fails), ", ".join(fails)))
sys.exit(1 if fails else 0)
```

⚠️ ⑥번은 mode 판정을 화면 없이 부를 수 있어야 한다. Step 5에서 그 판정을
**최상위 함수 `reviewLogMode(mode)` 로 뽑는다** — `renderReview` 안 클로저에 두면
밖에서 부를 길이 없어 시험용 손잡이를 프로덕션 코드에 심게 된다. 뽑아 두면
손잡이가 필요 없고, 판정 규칙이 한자리에 모여 다음 사람이 읽기도 쉽다.

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

```bash
python tests/review-card.py
```

기대: ①③④⑥이 FAIL (`#card-tray` 도 `#rv-mode-toggle` 도 아직 없다).
②⑤는 통과할 수도 있다(쟁반이 없으니 0장이고, 자판은 원래 `review-typing`).

- [ ] **Step 3: `renderReview` 템플릿에 토글 단추와 쟁반을 넣는다**

`app.js` 의 `renderReview` 안, btn-row(7508-7512 근처)를

```js
        <div class="btn-row">
          <button class="answer-btn" id="show-answer-btn">보기</button>
          <button class="answer-btn" id="listen-answer-btn" aria-label="정답 음성으로 듣기">🔊 듣기</button>
          <button class="voice-btn" id="voice-toggle">🎤 암송</button>
        </div>
```

다음으로 바꾼다(단추 하나를 끝에 더한다 — `.test-card .btn-row` 가 `flex-wrap:wrap` 이라 줄바꿈으로 받는다):

```js
        <div class="btn-row">
          <button class="answer-btn" id="show-answer-btn">보기</button>
          <button class="answer-btn" id="listen-answer-btn" aria-label="정답 음성으로 듣기">🔊 듣기</button>
          <button class="voice-btn" id="voice-toggle">🎤 암송</button>
          <button class="answer-btn mode-btn" id="rv-mode-toggle">${isCardMode() ? "⌨️ 쓰기" : "👆 카드"}</button>
        </div>
```

그리고 `.test-sentence` 바로 밑(7520-7521 사이)에 쟁반을 넣는다 — 도전(app.js:7407)과 같은 자리다:

```js
        <div class="test-sentence">${wordsHtml}</div>
        <div id="card-tray" class="card-tray"></div>
        <div class="challenge-remain" id="ch-remain"></div>
```

- [ ] **Step 4: 토글 핸들러를 단다**

`renderReview` 안, `rv-exit` 리스너(7543 근처) 바로 뒤에 넣는다:

```js
  // 복습도 카드로 할 수 있어야 한다. 2026-09-23 실측 — 암송은 카드 59.6%,
  // 도전은 77.5%인데 복습만 자판 99.9%였다. 카드로 외우시던 분이 복습에 오면
  // 갑자기 자판만 있는 화면을 만나던 자리다.
  document.getElementById("rv-mode-toggle").addEventListener("click", () => {
    stopSpeaking();
    setCardMode(!isCardMode());
    renderReview(queue, idx);
  });
```

- [ ] **Step 5: mode 판정을 함수로 뽑고 `onDone` 이 그것을 쓰게 한다**

먼저 `advanceReview` 함수 바로 뒤(app.js:1196 근처 — 복습 정책이 모인 자리)에
최상위 함수를 하나 더한다:

```js
// 복습 기록에 쓸 mode 를 고른다.
// ⚠️ **음성을 먼저 가른다.** 복습은 타자와 음성이 **같은 콜백을 공유**하기 때문이다
//    (renderReview 가 setupChallengeTyping 과 setupVoice 에 같은 onDone 을 넘긴다).
//    도전은 두 콜백이 갈려 있어 음성이 "voice" 로 박혀 있지만 여기는 아니다 —
//    카드 여부를 먼저 보면 카드를 누르다 🎤 로 마친 기록이 review-typing-card 로 남아
//    「음성은 사실상 죽었다」는 판단 근거가 흔들린다.
// ⚠️ "review-" + mode 로 이어 붙이면 카드일 때 **review-card** 가 나온다. 이름에
//    typing 이 없어 순위·통계의 %typing% 집계에서 조용히 빠진다 — 반드시
//    review-typing-card 꼴이어야 한다(supabase/migrate_modes_review_card.sql).
// ⚠️ 「카드로 했다」의 기준은 isCardMode()(모드를 켠 상태)다 — 암송(saveProgress 의
//    isCardMode ? "card" : "typing")·시편(psalmStageDone)과 같은 정의라야
//    세 화면 숫자를 나란히 놓을 수 있다.
function reviewLogMode(mode) {
  if (mode === "voice") return "review-voice";
  return isCardMode() ? "review-typing-card" : "review-typing";
}
```

그다음 `renderReview` 안의 `onDone`(7560~7574)에서

```js
    postChallenge(verse, "review-" + (mode || "voice"));
```

를 다음으로 바꾼다(옛 mode 주석 가운데 「복습 화면에는 카드 입력이 없어…」 문단은 지운다 —
이제 사실이 아니다):

```js
    postChallenge(verse, reviewLogMode(mode));
```

⚠️ `mode` 가 빈 값으로 올 수 있던 옛 `(mode || "voice")` 방어는 사라진다.
`setupChallengeTyping` 은 늘 `"typing"` 을, `setupVoice` 는 늘 `"voice"` 를 준다 —
둘 다 값을 주므로 방어가 필요 없고, 설령 빈 값이 와도 `reviewLogMode` 는
`review-typing`/`review-typing-card` 를 돌려주어 제약에 걸리지 않는다.

- [ ] **Step 6: `startReview` 에 카드 상태 리셋을 넣는다**

`async function startReview()` 의 `try {` 바로 다음 줄에 넣는다:

```js
    // 구절마다 설정값으로 되돌린다 — 도전에서 켠 카드가 복습까지 따라오지 않게.
    // ⚠️ renderReview 가 아니라 **여기**여야 한다. 토글이 renderReview 를 다시 그리는
    //    방식이라, 리셋을 renderReview 안에 두면 👆를 누르는 순간 설정값으로 되돌아가
    //    「눌러도 안 바뀐다」가 된다(시편이 피한 방식 그대로 — js/psalm.js 의
    //    renderPsalmReview 에 리셋, renderPsalmBlank 만 재렌더).
    setCardMode(isCardStart());
```

- [ ] **Step 7: 시험을 돌려 통과를 확인한다**

```bash
python tests/review-card.py
```

기대: `모두 통과` (여섯 줄 전부 PASS)

- [ ] **Step 8: 공용 함수 회귀 시험을 돌린다**

```bash
python tests/event-input.py
```

기대: 기존과 같이 전부 PASS. ⚠️ 여기서 실패하면 공용 `setupChallengeTyping` 을 건드린 것이다 — 되돌린다.

- [ ] **Step 9: 커밋**

```bash
git add app.js tests/review-card.py
git diff --cached --stat        # 이 둘만
git commit -m "feat(복습): 카드 모드를 넣는다

복습은 이미 공용 setupChallengeTyping 을 쓰고 있었고, 카드 쟁반은 그 함수가
#card-tray 가 있는 화면에서만 만든다 — 템플릿에 div 한 줄과 토글 단추가 없었던 것이
「복습에 카드가 없다」의 전부였다.

mode 는 음성을 먼저 가른다. 복습은 타자·음성이 같은 onDone 을 공유해서(도전은 갈려 있다)
cardUsed/카드를 먼저 보면 음성 기록이 카드로 둔갑한다. 판정 기준은 isCardMode() —
암송·시편과 같은 정의라야 세 화면 숫자를 나란히 놓을 수 있다.

카드 상태 리셋은 startReview 에 둔다. renderReview 에 두면 토글이 안 먹는다.

덤: 카드를 켜 두신 분이 복습에서 첫 칸 포커스를 못 받던 잠복 버그도 함께 풀린다." \
  -- app.js tests/review-card.py
```

---

## Task 4: 프런트 — 3구절 묶음 + 가장 오래 밀린 것부터

**Files:**
- Modify: `app.js` — `REVIEW_INTERVALS` 옆(1140), `dueReviewNos`(1171~), `startReview`(7462~)
- Test: `tests/review-batch.py` (생성)

**Interfaces:**
- Consumes: 없음(순수 프런트)
- Produces: `dueReviewNos()` 가 **최대 `REVIEW_BATCH`(3)개**를, **`next` 오름차순**으로 돌려준다.
  `startReview` 의 큐가 그 순서를 보존한다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`tests/review-batch.py`:

```python
# -*- coding: utf-8 -*-
"""
복습 큐 회귀 시험 — 「가장 오래 밀린 것부터 3구절씩」 (2026-09-23).

예전에는 dueReviewNos 에 정렬이 아예 없어 Object.keys 의 정수 키 순회(사실상 구절
번호순)에 기대고 있었고, startReview 가 verses.filter 로 그 순서마저 덮었다.
그래서 번호가 큰 구절은 30일을 밀려도 차례가 안 왔다(2026-09-23 실측 456건).

사용법:  python tests/review-batch.py
"""
import subprocess, sys, time
from playwright.sync_api import sync_playwright

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

ROOT = r"C:\Projects\bible-memorize-church-app-v2"
PORT = 8803

# 구절 다섯 개. 밀린 정도를 일부러 번호와 **반대로** 준다 —
# no=5 가 가장 오래 밀렸고 no=1 이 가장 덜 밀렸다.
SEED = """
() => {
  window.verses = [1,2,3,4,5].map(n => ({ no: n, ref: 'ref'+n, refShort: 'ref'+n, text: '말씀 ' + n, week: 1 }));
  const r = {};
  //           no:   기한(next)  — 작을수록 오래 밀린 것
  r[1] = { level: 0, next: '2026-09-20' };
  r[2] = { level: 0, next: '2026-09-18' };
  r[3] = { level: 0, next: '2026-09-16' };
  r[4] = { level: 0, next: '2026-09-14' };
  r[5] = { level: 0, next: '2026-09-12' };
  localStorage.setItem('memorize-review', JSON.stringify(r));
  return dueReviewNos();
}
"""

fails = []
srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT)], cwd=ROOT,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    time.sleep(1.2)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.goto(f"http://localhost:{PORT}/", wait_until="load")
        page.wait_for_timeout(400)

        def check(name, cond, extra=""):
            print(("PASS  " if cond else "FAIL  ") + name + ("" if cond else "  실제 " + str(extra)))
            if not cond:
                fails.append(name)

        nos = page.evaluate(SEED)
        check("세 구절만 돌려준다", len(nos) == 3, nos)
        check("가장 오래 밀린 것부터 (5,4,3)", nos == [5, 4, 3], nos)

        # 큐 순서가 verses 배열 순으로 덮이지 않는지
        queue = page.evaluate("""
        () => {
          const dueNos = dueReviewNos();
          const q = dueNos.map((no) => verses.find((v) => v.no === no)).filter(Boolean);
          return q.map(v => v.no);
        }
        """)
        check("큐가 그 순서를 보존한다", queue == [5, 4, 3], queue)

        # 기한이 같으면 구절 번호순
        same = page.evaluate("""
        () => {
          const r = {};
          r[7] = { level: 0, next: '2026-09-15' };
          r[3] = { level: 0, next: '2026-09-15' };
          r[9] = { level: 0, next: '2026-09-15' };
          window.verses = [3,7,9].map(n => ({ no: n, ref: 'r'+n, refShort: 'r'+n, text: '말씀', week: 1 }));
          localStorage.setItem('memorize-review', JSON.stringify(r));
          return dueReviewNos();
        }
        """)
        check("기한이 같으면 구절 번호순 (3,7,9)", same == [3, 7, 9], same)

        # 아직 기한이 안 된 것은 안 나온다
        future = page.evaluate("""
        () => {
          const r = {};
          r[1] = { level: 0, next: '2099-01-01' };
          r[2] = { level: 0, next: '2026-09-10' };
          window.verses = [1,2].map(n => ({ no: n, ref: 'r'+n, refShort: 'r'+n, text: '말씀', week: 1 }));
          localStorage.setItem('memorize-review', JSON.stringify(r));
          return dueReviewNos();
        }
        """)
        check("기한이 안 된 것은 빠진다", future == [2], future)

        browser.close()
finally:
    srv.terminate()

print()
print("모두 통과" if not fails else "실패 %d건: %s" % (len(fails), ", ".join(fails)))
sys.exit(1 if fails else 0)
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

```bash
python tests/review-batch.py
```

기대: 「세 구절만 돌려준다」가 FAIL(실제 `[1,2,3,4,5]`), 「가장 오래 밀린 것부터」도 FAIL.

- [ ] **Step 3: `REVIEW_BATCH` 상수를 더한다**

`app.js:1140` 의 `const REVIEW_INTERVALS = [3, 7, 14, 30, 60];` 바로 아래에 넣는다
(복습 정책이 한자리에 모인다):

```js
// 한 번에 보여 줄 복습 구절 수. **상한이 아니라 묶음**이다 — 다 하면 그다음 묶음이
// 곧바로 기한이 된다(advanceReview 가 마친 구절을 즉시 다음 간격으로 밀기 때문).
// 2026-09-23 실측 — 복습한 날 그날 복습 구절 중위값이 3이고, 한 사람 평균 13.9건이
// 밀려 있었다(2,383건 중 73.6%를 21~40건 밀린 52명이 쥐고 있었다). 적체 자체가 벽이었다.
// ⚠️ 되돌리려면 이 값만 큰 수(999)로 바꾸면 자르기가 무효가 된다.
const REVIEW_BATCH = 3;
```

- [ ] **Step 4: `dueReviewNos` 에 정렬과 자르기를 넣는다**

`dueReviewNos()` 의 `return` 문을 다음으로 바꾼다(기존 두 `filter` 와 그 주석은 그대로 둔다):

```js
  return Object.keys(r).filter((no) => r[no] && r[no].next <= t).map(Number)
    // ⚠️ 지금 verses 안에 없는 no(관리자가 지웠거나 번호가 바뀐 것)는 뺀다 — 안 그러면
    //    「복습 N구절」 단추가 뜨고도 눌러도 찾을 게 없어 아무 일도 없는 것처럼
    //    보인다(성도님 제보 2026-09-13 — "처음부터 안 나오게").
    .filter((no) => verses.some((v) => v.no === no))
    // ⚠️ 가장 오래 밀린 것부터. 전에는 정렬이 **아예 없어** Object.keys 의 정수 키
    //    순회(사실상 구절 번호순)에 암묵적으로 기대고 있었다. 그래서 번호가 큰 구절은
    //    30일을 밀려도 차례가 안 왔다(2026-09-23 실측 — 30일 이상 밀린 것 456건).
    .sort((a, b) => (r[a].next < r[b].next ? -1 : r[a].next > r[b].next ? 1 : a - b))
    // 묶음으로 자른다. 여기 한 곳에서 자르면 첫 화면 숫자·큐 길이·완료 화면 숫자가
    // 저절로 같은 수가 된다(호출처가 renderSummary 와 startReview 둘뿐이다).
    .slice(0, REVIEW_BATCH);
```

- [ ] **Step 5: `startReview` 의 큐가 순서를 보존하게 한다**

`startReview` 안의

```js
    const queue = verses.filter((v) => dueNos.includes(v.no));
```

를 다음으로 바꾼다:

```js
    // ⚠️ verses.filter 로 만들면 순서가 verses 배열 순(서버 order("no") = 구절 번호순)으로
    //    덮여 dueReviewNos 가 정한 「오래 밀린 순」이 통째로 버려진다. dueNos 를 축으로 만든다.
    const queue = dueNos.map((no) => verses.find((v) => v.no === no)).filter(Boolean);
```

- [ ] **Step 6: 시험을 돌려 통과를 확인한다**

```bash
python tests/review-batch.py
python tests/review-card.py
python tests/event-input.py
```

기대: 세 개 모두 `모두 통과`.

- [ ] **Step 7: 커밋**

```bash
git add app.js tests/review-batch.py
git diff --cached --stat
git commit -m "feat(복습): 밀린 복습을 가장 오래된 것부터 3구절씩 나눠 보여 준다

2026-09-23 실측 — 복습 대기 2,841건 중 83.9%가 기한 지남이고 174명 중 122명이
한 번도 안 했다. 한 사람 평균 13.9건이 밀려 적체 자체가 벽이었다.
복습한 날 그날 복습 구절 중위값이 3이라 그 숫자를 골랐다.

상한이 아니라 묶음이다 — 다 하면 그다음 묶음이 곧바로 기한이 되므로 더 하실 수 있다.

정렬을 함께 넣는다. 전에는 dueReviewNos 에 정렬이 아예 없었고 startReview 가
verses.filter 로 순서를 덮어 **번호가 큰 구절은 30일을 밀려도 차례가 안 왔다**
(30일 이상 밀린 것 456건). 자르기만 넣고 정렬을 안 넣으면 그 구절들이 영영 안 나온다.

되돌리려면 REVIEW_BATCH 를 999로." \
  -- app.js tests/review-batch.py
```

---

## Task 5: 문구 — 「오늘」을 빼고 「더 하기」를 준다

**Files:**
- Modify: `app.js` — `renderSummary` 의 복습 단추(2002), `renderReviewDone`(7585~7598)

**Interfaces:**
- Consumes: Task 4의 `dueReviewNos()`(최대 3)
- Produces: 화면 문구가 「묶음」이라는 사실과 어긋나지 않는다.

- [ ] **Step 1: 첫 화면 큰 단추에서 「오늘」을 뺀다**

`app.js:2002` 의

```js
        tx: `오늘 복습 ${dueCount}구절`, sub: "잊기 전에 다시 한 번" }
```

를 다음으로 바꾼다:

```js
        tx: `복습 ${dueCount}구절`, sub: "잊기 전에 다시 한 번" }
```

⚠️ 「오늘」을 빼는 이유: 이제 3구절은 **묶음**이라 다 하면 또 나온다. 「오늘」이라고 하면
하루에 다섯 번 「오늘 복습 3구절」을 보게 되어 말이 거짓이 된다.
⚠️ 작은 줄(app.js:2011 `복습 ${dueCount}구절`)은 **이미 「오늘」이 없다** — 그대로 둔다.
⚠️ 밀린 총수는 화면에 쓰지 않는다(적체가 벽이라는 이번 가설과 정면으로 부딪친다).
⚠️ 색을 새로 만들지 않는다 — 복습은 이미 청록(`.review-cta`)을 갖고 있다.
⚠️ NEW 배지를 쓰지 않는다 — 화면에 하나뿐이라 「쉴만한 물가」·「이벤트」에서 배지를 빼앗는다.

- [ ] **Step 2: 완료 화면을 고친다**

`renderReviewDone(count)` 를 통째로 다음으로 바꾼다:

```js
function renderReviewDone(count) {
  const appEl = document.getElementById("app");
  // 다음 묶음이 남아 있나 — 방금 마친 구절들은 advanceReview 가 기한을 미뤘으므로
  // 여기서 다시 물으면 「아직 기한 지난 것이 남았나」가 그대로 나온다(최대 REVIEW_BATCH).
  const more = dueReviewNos().length;
  appEl.innerHTML = `
    <div class="summary-screen">
      <div class="summary-card cd-card">
        <div class="cd-emoji">🎉</div>
        <div class="cd-title">복습 완료!</div>
        <div class="cd-sub">복습 ${count}구절을 마쳤어요. 잘하셨어요! 🙌</div>
        <div class="cd-count">${more ? `말씀 ${more}구절이 더 기다리고 있어요.` : "다음 복습은 자동으로 안내됩니다."}</div>
        ${more ? `<button class="summary-go review-cta" id="rv-more">🔁 ${more}구절 더 하기</button>` : ""}
        <button class="${more ? "summary-change" : "summary-go"}" id="rv-home">기록 화면으로</button>
      </div>
    </div>`;
  if (more) document.getElementById("rv-more").addEventListener("click", startReview);
  document.getElementById("rv-home").addEventListener("click", renderSummary);
}
```

바뀐 것 넷:
1. 「오늘 복습 N구절을 마쳤어요」 → 「복습 N구절을 마쳤어요」
2. 남은 것이 있으면 「말씀 N구절이 더 기다리고 있어요」 (없으면 기존 문구)
3. 남은 것이 있으면 **「🔁 N구절 더 하기」** 단추 — 누르면 `startReview()` 가 새 묶음을 만든다
4. 단추가 둘일 때는 「기록 화면으로」를 `summary-change`(보조)로 내린다 —
   도전 완료 화면(`renderChallengeDone`)이 쓰는 위계 그대로다

⚠️ 「단위를 두 번 쓰지 말 것」 규칙(`docs/notes/home-screen.md`) — 「밀린 137구절 중 3구절」 같은 꼴은 금지다.
위 문구는 한 번씩만 쓴다.

- [ ] **Step 3: 눈으로 확인한다**

```bash
python -m http.server 8080
```

브라우저에서 `http://localhost:8080/` 을 연 뒤 콘솔에서:

```js
verses = [1,2,3,4,5].map(n => ({no:n, ref:'요 1:'+n, refShort:'요 1:'+n, text:'말씀 '+n, week:1}));
localStorage.setItem('memorize-review', JSON.stringify({
  1:{level:0,next:'2026-09-20'}, 2:{level:0,next:'2026-09-18'},
  3:{level:0,next:'2026-09-16'}, 4:{level:0,next:'2026-09-14'}, 5:{level:0,next:'2026-09-12'}}));
renderReviewDone(3);
```

기대: 「복습 3구절을 마쳤어요」 · 「말씀 2구절이 더 기다리고 있어요」 ·
「🔁 2구절 더 하기」(청록) · 「기록 화면으로」(보조).

⚠️ `dueReviewNos()` 가 5개 중 3개를 이미 잘라 주므로 위 상태에서 `more` 는 **3**이다
(방금 마친 것을 advanceReview 로 밀지 않았기 때문). 실제 흐름에서는 2가 된다.
문구가 나오는지만 본다.

- [ ] **Step 4: 시험을 다시 돌린다**

```bash
python tests/review-card.py
python tests/review-batch.py
python tests/event-input.py
```

기대: 셋 다 `모두 통과`.

- [ ] **Step 5: 커밋**

```bash
git add app.js
git diff --cached --stat
git commit -m "feat(복습): 문구에서 「오늘」을 빼고 완료 화면에 「더 하기」를 준다

3구절은 상한이 아니라 묶음이라 다 하면 또 나온다 — 「오늘 복습 3구절」이라고 하면
하루에 다섯 번 같은 말을 보게 되어 거짓이 된다.

완료 화면은 남은 것이 있으면 「말씀 N구절이 더 기다리고 있어요」와 「🔁 N구절 더 하기」를
보여 준다(누르면 startReview 가 새 묶음을 만든다). 단추가 둘일 때 「기록 화면으로」는
보조로 내린다 — 도전 완료 화면과 같은 위계다.

밀린 총수는 안 보여 준다. 적체 자체가 벽이라는 이번 가설과 정면으로 부딪친다." \
  -- app.js
```

---

## Task 6: 측정 질의를 파일로 고정한다

**Files:**
- Create: `supabase/review_metrics.sql`

**Interfaces:**
- Consumes: 없음
- Produces: 2주 뒤 같은 잣대로 다시 잴 수 있는 고정 질의

도전은 `challenge_funnel.sql` 이 「다시 잴 때는 이 파일을 그대로 쓴다」로 잣대를 못 박아 두었는데
복습에는 그런 파일이 없다. 손으로 다시 쓰면 앞뒤를 견줄 수 없다.

- [ ] **Step 1: 파일을 만든다**

`supabase/review_metrics.sql`:

```sql
-- ============================================================
-- 복습 측정 — 다시 잴 때 **이 파일을 그대로** 쓴다 (2026-09-23)
--   Supabase SQL Editor 에 붙여넣고 RUN. 읽기만 한다.
--   ⚠️ 조건이 한 글자만 달라도 기준선과 견줄 수 없다. 손으로 다시 쓰지 말 것.
--
-- ■ 무엇을 「복습」으로 세나
--     복습  review-typing · review-voice · review-typing-card
--     암송  learn-*        /  도전  그 밖(typing · typing-card · voice)
--
-- ■ 기준선 (2026-09-23 — 카드 모드·3구절 묶음 **직전**)
--     ① 복습 총 반복 755회 (전체 123,776회의 0.6%)
--        review-typing 754 · review-voice 1 · review-typing-card 0
--     ② 복습한 사람 42명 (활동자 225명의 18.7%) · 최근 7일 18명
--     ③ 한 번도 복습 안 한 사람 122명 / 174명 (70.1%)
--     ④ 밀린 건 2,383건 (대상 171명 · 중위 6건 · 평균 13.9건 · 최대 43건)
--     ⑤ 복습한 날 그날 복습 구절 중위 3 · 평균 4.7 · 최대 28
--
-- ⚠️ ④는 서버 reviews 표 기준이라 **앱 화면에 뜨는 수와 다르다** — 앱은 시편 예약과
--    verses 에 없는 no 를 걸러 낸다(app.js dueReviewNos). 같은 것으로 놓지 말 것.
-- ============================================================

-- ① 모드별 반복 (카드가 실제로 쓰이나)
select mode, count(*) as 반복, count(distinct user_id) as 사람
  from challenge_log
 where mode like 'review%'
 group by mode order by 반복 desc;

-- ② 복습한 사람 수 (누적 · 최근 7일)
select '누적 복습한 사람' as k, count(distinct user_id)::text as v
  from challenge_log where mode like 'review%'
union all
select '최근 7일', count(distinct user_id)::text
  from challenge_log where mode like 'review%' and created_at >= now() - interval '7 days'
order by 1;

-- ③ 한 번도 복습 안 한 사람 (복습 대상 가운데)
with tgt as (select distinct user_id from reviews),
     did as (select distinct user_id from challenge_log where mode like 'review%')
select count(*) as 복습대상,
       count(*) filter (where t.user_id not in (select user_id from did)) as 한번도안함
  from tgt t;

-- ④ 밀린 정도 (사람별)
with od as (
  select user_id, count(*) n from reviews
   where due_at <= (now() at time zone 'Asia/Seoul')::date
   group by 1
)
select count(*) as 밀린사람, sum(n) as 밀린건수,
       (percentile_cont(0.5) within group (order by n))::int as 중위,
       round(avg(n),1) as 평균, max(n) as 최대
  from od;

-- ⑤ 복습한 날, 그날 몇 구절을 했나 (묶음 크기가 맞는지 보는 잣대)
with d as (
  select user_id, (created_at at time zone 'Asia/Seoul')::date as dt,
         count(distinct verse_no) as v
    from challenge_log where mode like 'review%'
   group by 1,2
)
select (percentile_cont(0.5) within group (order by v))::int as 중위,
       round(avg(v),1) as 평균, max(v) as 최대, count(*) as "사람x날"
  from d;

-- ⑥ 카드 비중 (복습 안에서)
select round(100.0 * count(*) filter (where mode = 'review-typing-card') / nullif(count(*),0), 1) as 카드비중_퍼센트,
       count(*) as 복습총반복
  from challenge_log where mode like 'review%';
```

- [ ] **Step 2: 운영에서 한 번 돌려 기준선이 맞는지 확인한다**

```bash
supabase --workdir "$SB" db query --linked -f supabase/review_metrics.sql
```

기대: ①이 `review-typing 754` · `review-voice 1` 로 나온다(파일 머리의 기준선과 같아야 한다).
다르면 그 사이에 기록이 더 쌓인 것이니 **파일 머리의 기준선을 그 값으로 고쳐 적는다.**

- [ ] **Step 3: 커밋**

```bash
git add supabase/review_metrics.sql
git diff --cached --stat
git commit -m "docs(측정): 복습 측정 질의를 파일로 고정한다

도전은 challenge_funnel.sql 이 잣대를 파일에 못 박아 두었는데 복습에는 없었다.
2026-09-23 기준선(카드·묶음 직전)을 머리에 적어 두어 2주 뒤 같은 잣대로 견줄 수 있게 한다." \
  -- supabase/review_metrics.sql
```

---

## Task 7: 낡아진 주석·문서를 고친다

**Files:** 아래 표의 11곳

이번 변경으로 **거짓이 되는** 문장들이다. 그대로 두면 다음 세션이 없는 것을 있다고,
있는 것을 없다고 읽는다.

- [ ] **Step 1: 코드 주석 넷**

| 파일 | 고칠 것 |
|---|---|
| `app.js` `onDone` 안 (7564-7570 근처) | 「복습 화면에는 카드 입력이 없어 `review-typing-card` 는 나오지 않는다. 복습에도 카드를 넣게 되면 제약에 **먼저** 더할 것」 → **넣었다**로. Task 3에서 그 자리를 이미 고쳤다면 남은 옛 문장만 지운다 |
| `js/psalm.js` (433-435 근처) | 「주간 복습(renderReview)에는 카드 입력 자체가 없어 견줄 자리가 없다」 → 「주간 복습에도 카드가 생겼다(2026-09-23) — 두 화면이 같은 뜻으로 센다」 |
| `js/psalm.js` (448-450 근처) | 카드 여부를 안 남기는 까닭 → 주간 복습이 `review-typing-card` 를 쓰게 된 사실을 덧붙인다 |
| `js/psalm.js` (455 근처) | 「startReview 의 pool = `verses.concat(psalmVerses)`」 → **이미 거짓이다.** 지금은 `dueNos.map(...)` 이고 시편은 복습 대상이 아니다 |

- [ ] **Step 2: `docs/notes/` 둘**

| 파일 | 고칠 것 |
|---|---|
| `docs/notes/memorize-flow.md:19` | 「복습 화면에는 카드 입력이 없다 · 넣게 되면 `migrate_modes_card.sql` 에 먼저 더할 것」 → **넣었다**로 고치고 `migrate_modes_review_card.sql` 을 가리킨다. 새 함정 한 줄 추가: 「복습은 타자·음성이 **같은 onDone 을 공유**한다 — mode 를 가를 때 음성을 먼저 가른다」 |
| `docs/notes/metrics.md:7` | 「⚠️ 복습 화면에는 아직 카드가 없다」 → 2026-09-23에 넣었다고 고치고 기준선(복습 755회·카드 0%)과 `supabase/review_metrics.sql` 을 가리킨다 |

- [ ] **Step 3: SQL 주석 셋**

| 파일 | 고칠 것 |
|---|---|
| `supabase/challenge_funnel.sql:26·142` | 「카드는 **도전 화면에서만** 갈리므로 `typing-card` 는 복습이 섞일 수 없다」 → **근거가 무너졌다.** 질의(147줄 `mode = 'typing-card'`)는 정확 일치라 숫자는 안 틀어지지만, 「mode **이름이 달라서** 안 섞인다」로 고친다. ⚠️ 다음에 재는 사람이 이 주석을 믿고 `like '%card'` 로 느슨하게 고치면 복습이 도전으로 둔갑한다 — 그 경고를 함께 적는다 |
| `supabase/stats-rpc.sql:7-8` | mode 목록 주석에 `review-typing-card` 를 더한다 |
| `supabase/daily-activity.sql:17` | 같은 목록 주석에 더한다 |

- [ ] **Step 4: 설명서 셋**

| 파일 | 고칠 것 |
|---|---|
| `app.js:6913` · `app.js:7198` (앱 안 설명서) | 복습 간격만 말하고 **개수를 한 마디도 안 한다.** 「한 번에 3구절씩 나와요. 더 하고 싶으시면 마친 뒤 「더 하기」를 누르세요.」 한 줄을 보탠다 — **두 곳 모두** |
| `guide/index.html:168` | 「3단계는 … 자판이 번거로우시면 👆 카드」가 **암송 화면만** 말한다 → 「암송·도전·복습에서 모두 쓸 수 있어요」로 |
| `docs/구조.md:65-71` | 「입력 두 가지」 절이 암송 mode 만 적고 복습에는 mode 이야기가 없다 → 복습 세 값(`review-typing`·`review-voice`·`review-typing-card`)을 적고 71줄의 「이름에 typing 이 들어가야」 규칙이 그대로 유효함을 밝힌다 |

⚠️ `guide/index.html:155`(「복습할 말씀이 있으면 「오늘 복습」…」)는 **개수를 안 말하므로 그대로 두어도 맞다.**
다만 Task 5에서 단추 문구가 「복습 N구절」로 바뀌었으니 「오늘 복습」이라는 표현만 「복습」으로 맞춘다.

- [ ] **Step 5: 커밋**

```bash
git add app.js js/psalm.js docs/notes/memorize-flow.md docs/notes/metrics.md \
        supabase/challenge_funnel.sql supabase/stats-rpc.sql supabase/daily-activity.sql \
        guide/index.html docs/구조.md
git diff --cached --stat
git commit -m "docs: 복습 카드·묶음으로 낡아진 주석 열한 곳을 고친다

「복습에는 카드가 없다」가 세 곳(app.js·psalm.js·memorize-flow.md·metrics.md),
mode 목록 주석이 두 곳, 「카드는 도전에서만 갈린다」가 challenge_funnel.sql 두 자리,
설명서가 세 곳이다. js/psalm.js 의 「pool = verses.concat(psalmVerses)」는 이미 거짓이었다." \
  -- app.js js/psalm.js docs/notes/memorize-flow.md docs/notes/metrics.md \
     supabase/challenge_funnel.sql supabase/stats-rpc.sql supabase/daily-activity.sql \
     guide/index.html docs/구조.md
```

---

## Task 8: 최종 검증 · 화면 확인 · 배포

**Files:**
- Modify: `tools/screen-sweep.py` (복습 두 줄 추가), `index.html`·`app.js`·`style.css`(bump 가 자동으로)

- [ ] **Step 1: `screen-sweep.py` 에 복습 두 줄을 더한다**

`tools/screen-sweep.py` 의 `STEPS` 배열에서 `("36-blessing", ...)` **바로 뒤**,
`("P1-privacy-page", ...)` 앞에 다음 두 줄을 넣는다(`P*` 는 별도 페이지라 뒤에 모여 있다).

형식은 `(이름, [동작 문자열 목록])` 이고, 카드 줄은 `06-test-stage3-card` 가 하는 것처럼
`localStorage` 로 상태를 심고 렌더한 뒤 **되돌린다**:

```python
    ("37-review-typing", ["renderReview([verses[0]],0)"]),
    ("38-review-card", ["localStorage.setItem('input-card-mode','1'); renderReview([verses[0]],0); localStorage.setItem('input-card-mode','0');"]),
```

- [ ] **Step 2: 시험 셋과 preflight 를 돌린다**

```bash
python tests/review-card.py
python tests/review-batch.py
python tests/event-input.py
python tools/preflight.py
```

기대: 앞의 셋은 `모두 통과`, preflight 는 오류 없음.

- [ ] **Step 3: 화면을 쓸어 본다**

```bash
python tools/screen-sweep.py
```

기대: `40-review-typing` 과 `41-review-card` 가 찍힌다.
**눈으로 볼 것 셋** — ① 단추 넷이 줄바꿈으로 잘 앉았나 ② 카드 쟁반이 빈칸을 가리지 않나
③ 「아주 큼」 글씨(`data-fs="xl"`)에서 넘치지 않나.

⚠️ 화면을 찍거나 재기 전에 `docs/notes/capture-tools.md` 를 읽는다.

- [ ] **Step 4: 실기기 확인(사람)**

아이폰에서 복습 → 👆 카드 → 카드로 채워 완료까지. 볼 것:
- 카드를 눌렀을 때 화면이 튀지 않나(2026-09-18에 `preventScroll` 로 막은 자리)
- 요절 고정 배너(네이티브 오버레이)가 쟁반을 가리지 않나
- 완료 화면의 「더 하기」가 다음 묶음으로 잘 가나

- [ ] **Step 5: 판 번호를 올린다**

```bash
python tools/bump.py
```

⚠️ 손으로 캐시태그를 고치지 않는다. 판 번호는 소수점 세 자리다.

- [ ] **Step 6: 배포 전 마지막 점검**

```bash
git status --short
```

⚠️ **Task 1·2가 운영에 적용됐는지 다시 확인한다.** 안 됐으면 여기서 멈춘다 —
프런트가 먼저 나가면 복습 기록이 안 남는데 일정만 밀려난다(되돌릴 수 없다).

```bash
supabase --workdir "$SB" db query --linked \
  "select pg_get_constraintdef(oid) from pg_constraint
    where conrelid='public.challenge_log'::regclass and contype='c';"
```

기대: `review-typing-card` 가 들어 있다.

- [ ] **Step 7: 커밋하고 푸시한다(= 배포)**

```bash
git add index.html app.js style.css tools/screen-sweep.py
git diff --cached --stat
git commit -m "chore: 판 번호 올림 — 복습 카드 모드 · 3구절 묶음

screen-sweep 에 복습 두 줄(자판·카드)을 더했다." \
  -- index.html app.js style.css tools/screen-sweep.py
git push
```

- [ ] **Step 8: 배포를 확인한다**

「이번 판에만 있는 표식」으로 확인한다 — 이전 판에도 있던 이름으로 검사하면
CDN 이 옛 파일을 내보내도 통과해 「배포 완료」로 오인한다.

```bash
V=$(grep -o 'app.js?v=[0-9a-z]*' index.html | head -1 | cut -d= -f2)
curl -s "https://gocheok.onlybible.kr/app.js?v=$V" | grep -o 'APP_BUILD = "[0-9a-z]*"'
curl -s "https://gocheok.onlybible.kr/app.js?v=$V" | grep -c 'rv-mode-toggle'
```

기대: `APP_BUILD` 가 `index.html` 의 `?v=` 와 같고, `rv-mode-toggle` 이 1 이상.

- [ ] **Step 9: 하루 뒤 실제로 들어오는지 본다**

```bash
supabase --workdir "$SB" db query --linked -f supabase/review_metrics.sql
```

기대: ①에 `review-typing-card` 행이 생긴다.
⚠️ **안 생기면 화면이 아니라 기록 경로를 의심한다** — 제약·폴백·mode 매핑 순으로 본다.

---

## 남은 것 (이 계획 밖 — 별건으로 잡을 것)

| 무엇 | 왜 지금 안 하나 |
|---|---|
| 첫 화면 「오늘 할 일」 점유 풀기 | `dueCount>0` 이면 암송·도전이 영영 큰 단추가 못 된다(app.js:2000-2007). 밀린 174명이 그 상태다. **진짜 문제지만** 첫 화면 우선순위를 바꾸는 일이라 이번 변경과 섞으면 무엇이 효과인지 못 가른다 |
| 서버 `ymd()` 의 UTC 버그 | `index.ts:120` 이 UTC 라 KST 09시 이전 복습은 간격이 7일이 아니라 **6일**로 저장된다. 아침 알림이 KST 05~08시라 **푸시 보고 들어온 분은 항상 이 창에 든다** |
| 암송 화면 재완료를 복습으로 쳐 주기 | 지금은 같은 구절을 암송 화면에서 다시 마쳐도 복습 빚이 **1건도 안 줄어든다**. 고치면 「반복해서 쓰기」를 켠 분이 하루에도 여러 번 다음 박스로 밀린다 — 하루 1회 묶음이 함께 필요 |
| 시편 `reviews` 행 정리 | 서버가 `no>1000` 행을 계속 만든다(index.ts:2080·1964). 앱은 거르지만 DB·관리자 숫자가 부풀어 있다 |
| 로컬 `advanceReview` 의 조용한 실패 | `app.js:1194 .catch(() => {})` — 서버가 실패하면 다음 동기화의 통째 교체로 옛 기한이 되살아난다. 「분명히 복습했는데 또 떠 있다」 |

---

## 2주 뒤 볼 것 (2026-10-07 이후)

`supabase/review_metrics.sql` 을 **그대로** 돌려 기준선과 견준다.

| 보는 것 | 기준선(2026-09-23) | 기대 |
|---|---|---|
| 복습 카드 비중 | 0% | 암송(59.6%)·도전(77.5%)에 가까워지나 |
| 복습한 사람 | 누적 42명 · 최근 7일 18명 | 늘었나 |
| 한 번도 복습 안 한 사람 | 122 / 174 (70.1%) | 줄었나 |
| 밀린 건 | 2,383건 (중위 6) | 줄었나 |
| 그날 복습 구절 | 중위 3 · 평균 4.7 | 묶음 3이 맞는 크기였나 |

⚠️ **카드와 묶음을 같은 판에 냈으므로 「복습이 늘었다」의 원인을 둘로 못 가른다.**
다만 카드는 `review-typing-card` 로 갈리니 **카드 사용률은 따로 잴 수 있다** — 섞이는 것은 묶음 효과뿐이다.
