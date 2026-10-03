# 가을 말씀암송 동행 개시 준비 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 이미 만들어 둔 가을 이벤트(`autumn-2026`, draft)의 이름·측정 시작일을 바꾸고, 공지물을 만들고, 10/18에 연다.

**Architecture:** 이벤트 규칙·도장판·자격 계산은 2026-09-23 설계로 이미 운영에 있다(판 v3.481). 이번 일은 ① 회차 행의 측정 시작일 한 칸을 SQL 로 옮기고 ② 이름·신청 창은 친구가 교회 어드민에서 고치고 ③ 날짜가 박힌 코드·자료 몇 줄을 맞추고 ④ 공지물(주보·포스터·슬라이드·단톡·게시판·알림)을 만들고 ⑤ 날짜에 맞춰 연다.

**Tech Stack:** Supabase(Postgres · Edge Function `api`) · Vanilla JS(`app.js`·`js/events.js`) · Python + Playwright(포스터 PDF·PNG) · 교회 어드민(admin.onlybible.kr)

**설계:** `docs/superpowers/specs/2026-10-03-autumn-event-launch-design.md` (규칙 원본은 `2026-09-23-autumn-streak-event-design.md`)

## Global Constraints

- 이름: `title` **「2026 가을 말씀암송 동행」** · `short_title` **「가을 말씀암송 동행」**
- 측정: **2026-10-18(일) ~ 2026-11-28(토)** · 6주 · 주 3일 · 3주 — `needs.eligibility = {start:"2026-10-18", weeks:6, perWeek:3, need:3, minNeed:2}`
- 신청 창: `opens_on` **2026-11-03** · `closes_on` **2026-12-05** · `list_until` **2026-12-20**
- 주: 1주 10/18~10/24 · 2주 10/25~10/31 · 3주 11/01~11/07 · 4주 11/08~11/14 · 5주 11/15~11/21 · 6주 11/22~11/28
- 선물: 「소정의 선물」 · 전화번호 받지 않음 · 공지 10/18 하루 · 11/3 신청 열림 알림 한 번
- 문구에 「상」·「순위」·「1등」을 쓰지 않는다. QR·주소는 `https://gocheok.onlybible.kr` 하나.
- ⚠️ `supabase/event_stamp_2026.sql` 을 **다시 돌리지 않는다**(어드민에서 고친 칸을 덮는다).
- ⚠️ SQL 은 **개발(`ktpwthwqzgcqcrmsafdo`) 먼저**, 확인 뒤 운영(`xnomlgydifiqiybervtf`). `supabase/.temp` 를 믿지 말고 스크래치 폴더를 직접 link 한다(`users` 가 사백 넘으면 운영, 스물 남짓이면 개발).
- ⚠️ 교회 어드민 가지 `autumn-excuse`(다른 세션)는 건드리지 않는다.
- ⚠️ v2 공용 체크아웃 대신 worktree `C:\Projects\v2-mh-merge`(가지 `mh-merge`)에서 일하고 `git push origin mh-merge:main` — 시작 전에 `git fetch && git merge --ff-only origin/main`. `git add -A`·`stash` 금지, 경로를 못 박아 커밋.
- 관리자 암호는 `C:\Projects\bible-memorize-church-app-v2\.env` 의 `PROD_ADMIN_SECRET`(운영)·`.env.dev` 의 `ADMIN_SECRET`(개발) — **값을 화면에 찍지 않는다.**

---

## File Structure

| 파일 | 할 일 |
|---|---|
| Create `supabase/event_autumn_2026_move.sql` | 측정 시작일 한 칸 옮기기(가드 둘) + 확인 질의 |
| Modify `app.js` (`FEAT_SINCE.stamp`) | NEW 배지 날짜 |
| Modify `admin-event.html:364` · `js/events.js` 주석 | 날짜 문구 |
| Modify `supabase/event_stamp_2026.sql` | 값만 새로 적기(돌리지 않음 · 머리 경고) |
| Modify `supabase/event_streak_metrics.sql` · `supabase/dev_seed_stamp.sql` · `supabase/event_streak.sql` | 창·시작일 |
| Create `marketing/autumn-2026/문구.md` | 주보 · 단톡 · 게시판 · 알림 둘 |
| Create `marketing/autumn-2026/poster.py` → `poster-a3.pdf`·`poster-a3.png`·`slide-16x9.pdf`·`slide-16x9.png` | 포스터·슬라이드 |
| Modify `CLAUDE.md` · `docs/backlog.md` · `docs/notes/bible-events-admin.md` | 날짜·이름·할 일 |

---

### Task 1: 측정 시작일 SQL (개발 → 운영)

**Files:**
- Create: `supabase/event_autumn_2026_move.sql`

**Interfaces:**
- Produces: 운영·개발 `events` 의 `autumn-2026` 행 `needs->'eligibility'->>'start' = '2026-10-18'` (Task 3·6 이 이 값을 본다)

- [ ] **Step 1: SQL 파일을 쓴다**

```sql
-- 가을 말씀암송 동행 — 측정 시작일을 2026-10-11 → 2026-10-18 로 (한 주 미룸 · 2026-10-03 친구 결정)
-- ⚠️ 이 저장소는 공개(public)입니다 — 비밀번호·키를 절대 넣지 마세요.
-- 설계: docs/superpowers/specs/2026-10-03-autumn-event-launch-design.md §2
--
-- 왜 SQL 인가: 교회 어드민 회차 설정은 needs 를 받지 않는다(EV_EDIT_KEYS). 이름·신청 창은 친구가 어드민에서 고친다.
-- ⚠️ event_stamp_2026.sql 을 다시 돌리지 말 것 — 어드민에서 고친 칸을 덮는다. 이 파일은 start 한 칸만 바꾼다.
-- 적용: 개발 먼저 → 확인 → 운영. 두 번 돌려도 같다(이미 10-18 이면 아무것도 안 바꾼다).

do $$
declare
  v_status text;
  v_signups int;
begin
  select status into v_status from public.events where id = 'autumn-2026';
  if v_status is null then
    raise exception 'autumn-2026 행이 없다 — 이 DB 에 회차가 들어가 있는지 먼저 보라';
  end if;
  if v_status <> 'draft' then
    raise exception 'autumn-2026 이 이미 %이다 — 연 뒤에는 규칙을 바꾸지 않는다(9/23 설계 §13)', v_status;
  end if;
  select count(*) into v_signups from public.event_signups where event_id = 'autumn-2026';
  if v_signups > 0 then
    raise exception '신청이 %건 있다 — 시작일을 바꾸면 과거 판정이 소급해 바뀐다', v_signups;
  end if;

  update public.events
     set needs = jsonb_set(needs, '{eligibility,start}', '"2026-10-18"'::jsonb),
         updated_at = now()
   where id = 'autumn-2026'
     and needs->'eligibility'->>'start' is distinct from '2026-10-18';
end $$;

-- 확인 — start 가 10-18 이고 신청 시작(opens_on)이 그보다 뒤인지
select id, status, title, short_title, opens_on, closes_on, list_until,
       needs->'eligibility' as eligibility,
       (opens_on > (needs->'eligibility'->>'start')::date) as "신청이 측정보다 뒤"
  from public.events where id = 'autumn-2026';
```

- [ ] **Step 2: `event_signups` 의 회차 열 이름을 확인한다**

Run: `grep -n "event_id\|create table.*event_signups" supabase/*.sql | head`
Expected: `event_signups` 에 `event_id` 열이 있다. 이름이 다르면 Step 1 의 `where event_id =` 를 그 이름으로 고친다.

- [ ] **Step 3: 개발에 돌린다**

```bash
SCR="C:/Users/sewki/AppData/Local/Temp/claude/c--Projects-bible-memorize-church-app-v2/3475310b-8039-4783-b0d3-8e90e66211b3/scratchpad/sb-dev"
mkdir -p "$SCR" && cd /c/Projects/v2-mh-merge
supabase --workdir "$SCR" link --project-ref ktpwthwqzgcqcrmsafdo --yes
supabase --workdir "$SCR" db query --linked "select count(*) from users"          # 스물 남짓이면 개발
supabase --workdir "$SCR" db query --linked -f supabase/event_autumn_2026_move.sql
```
Expected: 마지막 select 한 줄 — `status draft` · `eligibility` 의 `start` `2026-10-18` · `신청이 측정보다 뒤 true`.
`autumn-2026 행이 없다` 가 나오면 개발에 회차가 없는 것이다 — 그때만 개발에 한해 `supabase/event_stamp_2026.sql` 을 돌린 뒤 다시 한다(운영에서는 절대 돌리지 않는다).

- [ ] **Step 4: 운영에 돌린다**

```bash
SCR="C:/Users/sewki/AppData/Local/Temp/claude/c--Projects-bible-memorize-church-app-v2/3475310b-8039-4783-b0d3-8e90e66211b3/scratchpad/sb-prod"
mkdir -p "$SCR" && cd /c/Projects/v2-mh-merge
supabase --workdir "$SCR" link --project-ref xnomlgydifiqiybervtf --yes
supabase --workdir "$SCR" db query --linked "select count(*) from users"          # 사백이 넘으면 운영
supabase --workdir "$SCR" db query --linked -f supabase/event_autumn_2026_move.sql
```
Expected: Step 3 과 같은 한 줄. `opens_on` 은 아직 옛 값(2026-10-27)이어도 `신청이 측정보다 뒤 true` (10-27 > 10-18).

- [ ] **Step 5: 커밋**

```bash
cd /c/Projects/v2-mh-merge
git add supabase/event_autumn_2026_move.sql
git commit -m "feat(이벤트): 가을 말씀암송 동행 측정 시작 10/18 — start 한 칸만 옮기는 SQL(draft·신청 0건일 때만) · 개발·운영 반영" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin mh-merge:main
```

---

### Task 2: 날짜가 박힌 코드·자료·문서 맞추기 → bump

**Files:**
- Modify: `app.js` (`FEAT_SINCE` 의 `stamp:` 줄)
- Modify: `admin-event.html:364`
- Modify: `js/events.js` (주석 두 곳: `「1주 10/11~10/17」`, `10/11~10/26 열엿새`)
- Modify: `supabase/event_stamp_2026.sql` · `supabase/event_streak_metrics.sql` · `supabase/dev_seed_stamp.sql` · `supabase/event_streak.sql`
- Modify: `CLAUDE.md` · `docs/backlog.md` · `docs/notes/bible-events-admin.md`

**Interfaces:**
- Consumes: Task 1 의 start 2026-10-18
- Produces: 운영 판(bump) — 첫 화면 NEW 배지가 10/18 부터

- [ ] **Step 1: `app.js`**

`stamp: "2026-10-11",        // 가을 말씀 동행 — 도장 시작일과 같은 날부터 NEW` 를
`stamp: "2026-10-18",        // 가을 말씀암송 동행 — 도장 시작일과 같은 날부터 NEW(2026-10-03 한 주 미룸)` 로.

- [ ] **Step 2: `admin-event.html:364`**

`도장 기간 2026-10-11 ~ 11-21 · 주 3일 · 6주 중 3주 (원본 supabase/event_stamp_2026.sql)` 를
`도장 기간 2026-10-18 ~ 11-28 · 주 3일 · 6주 중 3주 (회차 설정은 교회 어드민 · 시작일 supabase/event_autumn_2026_move.sql)` 로.

- [ ] **Step 3: `js/events.js` 주석**

`// 한 주 칸의 날짜 범위 — 「1주 10/11~10/17」` → `// 한 주 칸의 날짜 범위 — 「1주 10/18~10/24」`
`이 화면이 **10/11~10/26 열엿새 동안** 보인다.` → `이 화면이 **10/18~11/2 열엿새 동안** 보인다(2026-10-03 한 주 미룸).`

- [ ] **Step 4: `supabase/event_stamp_2026.sql` — 값만 새로 적는다(돌리지 않는다)**

머리 경고 블록 바로 아래에 한 줄을 더한다:
`-- 2026-10-03: 이름·날짜를 바꿨다(이름은 교회 어드민 · 시작일은 event_autumn_2026_move.sql). 아래 값은 그 결과를 옮겨 적은 기록이다 — 돌리지 말 것.`
그리고 값: `'2026 가을 말씀 동행'`→`'2026 가을 말씀암송 동행'` · `'가을 말씀 동행'`→`'가을 말씀암송 동행'` · `'2026-10-27'`→`'2026-11-03'` · `'2026-11-28'`(closes)→`'2026-12-05'` · `'2026-12-13'`→`'2026-12-20'` · `'start', '2026-10-11'`→`'start', '2026-10-18'`. 주석 「측정은 11/21 에 끝난다」→「측정은 11/28 에 끝난다」, 「2026-10-11 아침」→「2026-10-18 아침」, 「10월 11일에 시작해요」→「10월 18일에 시작해요」.

- [ ] **Step 5: `supabase/event_streak_metrics.sql` 창**

① 창 주석을:
```
--   A 직전 6주   2026-09-06(주일) ~ 2026-10-17(토)   ⚠️ **2026-10-18 에나 끝난다.** 개시 아침(공지 전)에 돌린다
--   D 본 회차    2026-10-18(주일) ~ 2026-11-28(토)   끝난 뒤에 돌린다
```
로 바꾸고, 결과란의 `(D 2026-10-11~11-21)` 를 `(D 2026-10-18~11-28)` 로.

- [ ] **Step 6: `supabase/dev_seed_stamp.sql` · `supabase/event_streak.sql`**

`v_start date := '2026-10-11';` → `'2026-10-18'` · 두 파일의 `v2_event_weeks('2026-10-11', 6, 3)` 예시 → `'2026-10-18'`.

- [ ] **Step 7: 남은 옛 날짜가 없는지 본다**

Run: `grep -rn "2026-10-11\|10/11~\|11-21\b" app.js js/ admin-event.html supabase/event_stamp_2026.sql supabase/event_streak_metrics.sql supabase/dev_seed_stamp.sql supabase/event_streak.sql`
Expected: 결과 없음(머리 기록 줄의 「2026-10-11 → 2026-10-18」 같은 설명은 남아도 된다).

- [ ] **Step 8: 문서**

- `CLAUDE.md` 표의 이벤트 명단 줄 「가을 말씀 동행」 → 「가을 말씀암송 동행」. 「다음 작업」에 한 줄:
  `- [ ] 🍂 **가을 말씀암송 동행 — 10/18(일) 개시**(측정 10/18~11/28 · 신청 11/3~12/5 · 목록 12/20 · 공지 10/18 하루 · 11/3 알림). 친구: 어드민 이름·날짜(~10/7) · 주보 문구(10/14) · 10/18 아침 「준비 중 → 열림」. 읽을 것 specs/2026-10-03-autumn-event-launch-design.md · 계획 plans/2026-10-03-autumn-event-launch.md`
- `docs/backlog.md` 「10/11 전」 줄 → `**10/18** 가을 말씀암송 동행 개시 … 측정 10/18~11/28 · 신청 11/3~12/5`, 5절의 10/11·10/27~11/28 도 새 날짜로.
- `docs/notes/bible-events-admin.md` 의 「가을 말씀 동행 10/11 개시」 → 「가을 말씀암송 동행 10/18 개시」.

- [ ] **Step 9: 검사 · bump · 커밋 · 배포 확인**

```bash
cd /c/Projects/v2-mh-merge
git fetch -q origin && git merge --ff-only origin/main
node --check app.js && node --check js/events.js
python tools/bump.py && python tools/preflight.py
git add app.js js/events.js admin-event.html index.html admin.html supabase/event_stamp_2026.sql supabase/event_streak_metrics.sql supabase/dev_seed_stamp.sql supabase/event_streak.sql CLAUDE.md docs/backlog.md docs/notes/bible-events-admin.md
git status --short     # 내 것 말고 담긴 것이 없는지
git commit -m "feat(이벤트): 가을 말씀암송 동행 — 날짜 10/18~11/28 · 신청 11/3~12/5 로 코드·자료·문서 맞춤 · NEW 배지 10/18" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin mh-merge:main
V=$(grep -o 'app.js?v=[0-9a-z]*' index.html | head -1 | cut -d= -f2); for i in $(seq 1 30); do B=$(curl -s "https://gocheok.onlybible.kr/app.js?v=$V&t=$i" | grep -o 'APP_BUILD = "[0-9a-z]*"'); echo "$B"; echo "$B" | grep -q "$V" && break; sleep 10; done
```
Expected: preflight 「모두 통과」 · 마지막 줄의 `APP_BUILD` 가 `index.html` 의 `?v=` 와 같다. (`bump.py` 가 고친 파일 목록이 위와 다르면 `git status` 에 보이는 대로 더한다.)

---

### Task 3: 교회 어드민 회차 설정 (친구) → 확인 (Claude)

**Files:** 없음(운영 자료)

**Interfaces:**
- Consumes: Task 1(start 10-18)
- Produces: 운영 `autumn-2026` 이 Global Constraints 의 이름·신청 창 값과 같다

- [ ] **Step 1: 친구에게 부탁한다(그대로 보낸다)**

> 교회 어드민(admin.onlybible.kr) → 성경필사(암송) → 📋 회차·명단 → 「가을 말씀 동행」 회차 설정에서
> 제목 `2026 가을 말씀암송 동행` · 짧은 이름 `가을 말씀암송 동행` · 신청 시작 `2026-11-03` · 신청 마감 `2026-12-05` · 공개 종료 `2026-12-20` 으로 바꾸고 저장해 주세요. **상태는 「준비 중」 그대로** 두세요.

- [ ] **Step 2: 운영에서 확인한다**

Run(Task 1 Step 4 의 운영 스크래치 그대로):
```bash
SCR="C:/Users/sewki/AppData/Local/Temp/claude/c--Projects-bible-memorize-church-app-v2/3475310b-8039-4783-b0d3-8e90e66211b3/scratchpad/sb-prod"
supabase --workdir "$SCR" db query --linked "select id,status,title,short_title,opens_on,closes_on,list_until,needs->'eligibility'->>'start' as start from public.events where id='autumn-2026'"
```
Expected: `draft | 2026 가을 말씀암송 동행 | 가을 말씀암송 동행 | 2026-11-03 | 2026-12-05 | 2026-12-20 | 2026-10-18`

---

### Task 4: 공지 문구 묶음

**Files:**
- Create: `marketing/autumn-2026/문구.md`

**Interfaces:**
- Produces: Task 5(포스터)·Task 7(게시판·알림)이 이 파일의 글을 그대로 쓴다

- [ ] **Step 1: 파일을 쓴다(아래 그대로)**

````markdown
# 2026 가을 말씀암송 동행 — 공지 문구

> 넘길 날: 주보 10/14(수) 담당 목사님께 · 나머지 10/18(주일) 아침. 「상」·「순위」는 쓰지 않는다.

## 1. 주보 광고 (오른쪽 「오직 성경, 말씀이 답이다!」 칸 · 표 + QR `marketing/qr-code.png`)
```
「가을 말씀암송 동행」
10월 18일(주일)부터 6주 동안, 한 주에 3일 말씀을 암송하시면 그 주가 채워집니다.
여섯 주 가운데 세 주를 채우신 분은 11월 3일부터 신청하실 수 있고,
신청하신 분께는 소정의 선물을 드립니다. (~11월 28일)
QR을 찍고 교구·이름을 넣으면 바로 시작됩니다. 사용법은 1층 로비에서 도와드립니다.
```

## 2. 목장·단톡 안내문
```
🍂 2026 가을 말씀암송 동행 (10/18~11/28)
하루 한 번 말씀을 암송하시면 한 칸, 한 주에 3일이면 그 주가 채워져요.
여섯 주 가운데 세 주를 채우시면 11/3부터 신청 단추가 열리고,
신청하신 분 모두께 소정의 선물을 드려요. 매일 하지 않아도 괜찮아요 😊
중간에 처음 오셔도 남은 주로 함께하실 수 있어요.
👉 https://gocheok.onlybible.kr (교구·목장·이름만 넣으면 시작)
```

## 3. 앱 게시판 글 (이름 「신앙운동팀」)
```
🍂 2026 가을 말씀암송 동행이 시작됩니다 (10/18~11/28)

오늘부터 여섯 주 동안 말씀과 함께 걸어요.
· 하루 한 번 말씀을 암송하시면 그날 한 칸이 채워져요.
· 한 주에 3일이면 그 주가 채워집니다 — 매일 하지 않아도 돼요.
· 여섯 주 가운데 세 주를 채우시면 11월 3일부터 신청 단추가 열려요.
· 신청하신 분 모두께 소정의 선물을 드립니다.

첫 화면의 🏅 「가을 말씀암송 동행」 단추를 누르시면 내 도장판이 보여요.
중간에 처음 오신 분은 남은 주에 맞춰 필요한 주 수가 줄어들어요(화면에 나와요).
```

## 4. 전체 알림 — 10/18 개시 직후
- 제목: `🍂 가을 말씀암송 동행이 시작돼요`
- 내용: `오늘부터 6주, 한 주에 3일 말씀을 암송하시면 그 주가 채워져요. 세 주를 채우신 분께 선물을 드려요.`
- 주소: `https://gocheok.onlybible.kr/?ev=autumn-2026`

## 5. 전체 알림 — 11/3 신청 열림
- 제목: `🍂 가을 말씀암송 동행 신청이 열렸어요`
- 내용: `세 주를 채우신 분은 지금 신청하실 수 있어요(12/5까지). 아직이신 분도 남은 주로 채우실 수 있어요.`
- 주소: `https://gocheok.onlybible.kr/?ev=autumn-2026`
````

- [ ] **Step 2: 친구에게 보여 주고 고칠 곳을 받는다** — 받은 대로 고친 뒤 Step 3.

- [ ] **Step 3: 커밋**

```bash
cd /c/Projects/v2-mh-merge && git add "marketing/autumn-2026/문구.md"
git commit -m "docs(이벤트): 가을 말씀암송 동행 공지 문구 — 주보·단톡·게시판·알림 둘" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git push origin mh-merge:main
```

---

### Task 5: 포스터 A3 · 슬라이드 16:9

**Files:**
- Create: `marketing/autumn-2026/poster.py`
- Create(생성물): `marketing/autumn-2026/poster-a3.pdf` · `poster-a3.png` · `slide-16x9.pdf` · `slide-16x9.png`

**Interfaces:**
- Consumes: `marketing/qr-data-uri.txt` · `marketing/logo-data-uri.txt` · `marketing/event-poster.py` 의 `HEAD`(CSS)를 그대로 쓴다

- [ ] **Step 1: `poster.py` 를 쓴다** — `event-poster.py` 의 `HEAD` 문자열·`poster_a3()`·`slide_169()` 틀을 그대로 복사하고, 본문만 아래로 바꾼다. 경로는 `M = 'C:/Projects/bible-memorize-church-app-v2/marketing/'` 대신 이 파일 기준(`os.path.dirname(__file__) + '/../'`)으로 읽는다. 끝에 Playwright 로 PDF·PNG 를 뽑는다.

본문(A3 · 슬라이드 공통 문구):
- kicker `성도 참여 이벤트`
- h1 `가을<br><em>말씀암송</em> 동행` (슬라이드: `가을 <em>말씀암송</em> 동행`)
- sub `하루 한 번 말씀을 암송하시면 한 칸.<br>한 주에 3일이면 그 주가 채워집니다. <b style="color:#fff">매일 하지 않아도 괜찮아요.</b>`
- prize: lb `여섯 주 가운데 세 주를 채우신 분` · bg `🎁 신청하신 분 모두 선물` · sm `신청 11월 3일(화) ~ 12월 5일(토)`
- steps: `QR을 찍고<br>교구·이름 입력` · `하루 한 번<br>말씀 암송` · `첫 화면 🏅에서<br>도장 확인`
- when `10월 18일(주일) <b>~</b> 11월 28일(토)`
- QR 옆 작은 글 `휴대폰 카메라로 QR을 비추면<br>바로 열립니다. 중간에 오셔도 함께해요.`
- foot `문의 · 제자양육부 신앙운동팀`

출력부:
```python
from playwright.sync_api import sync_playwright
OUT = os.path.dirname(os.path.abspath(__file__))
pages = [('poster-a3', poster_a3(), dict(width='297mm', height='420mm'), (1123, 1587)),
         ('slide-16x9', slide_169(), dict(width='1920px', height='1080px'), (1920, 1080))]
with sync_playwright() as pw:
    b = pw.chromium.launch(channel='chrome', headless=True)
    for name, html, pdf_size, (w, h) in pages:
        p = b.new_page(viewport={'width': w, 'height': h})
        p.set_content(html, wait_until='networkidle')
        p.wait_for_timeout(800)   # 글꼴
        p.pdf(path=os.path.join(OUT, name + '.pdf'), print_background=True, **pdf_size)
        p.screenshot(path=os.path.join(OUT, name + '.png'), full_page=False)
        p.close()
    b.close()
print('ok')
```

- [ ] **Step 2: 돌린다**

Run: `cd /c/Projects/v2-mh-merge/marketing/autumn-2026 && python poster.py && ls -la *.pdf *.png`
Expected: `ok` · PDF 둘 · PNG 둘.

- [ ] **Step 3: 눈으로 본다** — PNG 둘을 Read 로 열어 넘침·잘림·글꼴(명조 제목)·QR 이 읽히는지 확인하고, 친구에게 PNG 를 보여 준다. 고칠 곳은 본문만 고쳐 Step 2 를 다시.

- [ ] **Step 4: 커밋**

```bash
cd /c/Projects/v2-mh-merge && git add marketing/autumn-2026/poster.py marketing/autumn-2026/poster-a3.pdf marketing/autumn-2026/poster-a3.png marketing/autumn-2026/slide-16x9.pdf marketing/autumn-2026/slide-16x9.png
git commit -m "feat(이벤트): 가을 말씀암송 동행 포스터 A3 · 슬라이드 16:9" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git push origin mh-merge:main
```

---

### Task 6: 기준선 · 개시 전 확인 (10/17 · 공지 전)

**Files:**
- Modify: `supabase/event_streak_metrics.sql` (결과란에 숫자 적기)

- [ ] **Step 1: A 창(9/6~10/17) 과 B 창(7/5~8/15)을 운영에서 돌린다** — 파일 ② 의 `date '…'` 한 곳만 바꿔 가며(`2026-09-06`, `2026-07-05`). 함께 `select count(*) from challenge_log` · `select * from v2_activity_drift()` 를 적는다.
- [ ] **Step 2: 결과를 파일 결과란에 적는다**(돌린 날 2026-10-17 · 공지 전).
- [ ] **Step 3: 개시 전 확인 셋**
  - `select id,status,opens_on,closes_on,list_until from public.events where status in ('open','closed') order by closes_on` — `summer-2026` 등이 `list_until` 이 지나지 않은 채 남아 있으면 첫 화면이 「이벤트 2개」로 접힌다 → 친구와 정한다.
  - Task 3 Step 2 질의 그대로 — 값이 Global Constraints 와 같다.
  - 운영 API `eventOpenList` 를 관리자 암호(`adminPw` = `PROD_ADMIN_SECRET`, UTF-8 파일 body)로 불러 `autumn-2026` 이 draft 로·새 이름·새 날짜로 오는지. 암호 없이 부르면 **안 와야** 한다(성도님 화면은 아직 안 바뀐다).
- [ ] **Step 4: 커밋** — `docs(이벤트): 가을 말씀암송 동행 기준선 A·B (10/17 · 공지 전)`

---

### Task 7: 개시 (10/18 주일 아침)

- [ ] **Step 1: 친구** — 교회 어드민 → 성경필사(암송) → 📋 회차 설정 → 「가을 말씀암송 동행」 **「준비 중 → 열림」** → 확인 창 「보이게 하기」.
- [ ] **Step 2: Claude 확인** — `?ev=autumn-2026` 으로 열어(친구 폰 또는 친구 계정) 첫 화면 🏅 「가을 말씀암송 동행」 단추 · 도장판 1주 10/18~10/24 · 오늘 칸이 `mydays` 와 같은지.
- [ ] **Step 3: 게시판 글** — `boardPost`(`name` 「신앙운동팀」 · `content` = 문구.md 3절 · `adminPw` = `PROD_ADMIN_SECRET`)를 UTF-8 파일 body 로 보낸다(명령줄 한글은 깨진다 — 메모 `curl-korean-encoding`). 돌아온 `id` 를 기록.
- [ ] **Step 4: 전체 알림** — `sendPush`(`title`·`body`·`url` = 문구.md 4절 · 관리자 암호). `push_log` 에 줄이 남았는지 본다.
- [ ] **Step 5: 친구** — 문구.md 2절을 목장 단톡에.
- [ ] **Step 6: 기록** — CLAUDE.md 「다음 작업」 가을 줄을 「10/18 개시함 · 게시판 글 id N · 알림 발송」으로.

---

### Task 8: 신청 열림 알림 (11/3)

- [ ] **Step 1:** 자격이 찬 계정으로 `?ev=autumn-2026` 신청 단추가 열려 있는지 본다(없으면 `eventStamps` 응답의 `phase`·`eligible`).
- [ ] **Step 2:** `sendPush`(문구.md 5절).
- [ ] **Step 3:** CLAUDE.md 가을 줄에 「11/3 알림 발송」 · 다음 할 일 「11/29 이후 최종 집계(교회 어드민 자격 인정·미신청 목록) · 12월 `event_streak_metrics.sql` D 창」.
