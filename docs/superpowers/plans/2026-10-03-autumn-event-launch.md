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
| Create `자료/marketing/autumn-2026/문구.md` | 주보 · 단톡 · 게시판 · 알림 둘 |
| Create `자료/marketing/autumn-2026/poster.py` → `poster-a3.pdf`·`poster-a3.png`·`slide-16x9.pdf`·`slide-16x9.png` | 포스터·슬라이드 |
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
- Create: `자료/marketing/autumn-2026/문구.md`

**Interfaces:**
- Produces: Task 5(포스터)·Task 7(게시판·알림)이 이 파일의 글을 그대로 쓴다

- [ ] **Step 1: 파일을 쓴다(아래 그대로)**

> ⚠️ 아래 본문의 「하루 한 번」(2절 단톡 · 3절 게시판) → **§8 에서 하루 3번으로 바뀜**(Task 13 · 2026-10-03).
> 지금 문구의 원본은 `자료/marketing/autumn-2026/문구.md` 다 — 여기서 베끼지 말 것(주보·4절·5절 문장도 그 뒤에 바뀌었다).

````markdown
# 2026 가을 말씀암송 동행 — 공지 문구

> 넘길 날: 주보 10/14(수) 담당 목사님께 · 나머지 10/18(주일) 아침. 「상」·「순위」는 쓰지 않는다.

## 1. 주보 광고 (오른쪽 「오직 성경, 말씀이 답이다!」 칸 · 표 + QR `자료/marketing/qr-code.png`)
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
cd /c/Projects/v2-mh-merge && git add "자료/marketing/autumn-2026/문구.md"
git commit -m "docs(이벤트): 가을 말씀암송 동행 공지 문구 — 주보·단톡·게시판·알림 둘" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git push origin mh-merge:main
```

---

### Task 5: 포스터 A3 · 슬라이드 16:9

**Files:**
- Create: `자료/marketing/autumn-2026/poster.py`
- Create(생성물): `자료/marketing/autumn-2026/poster-a3.pdf` · `poster-a3.png` · `slide-16x9.pdf` · `slide-16x9.png`

**Interfaces:**
- Consumes: `자료/marketing/qr-data-uri.txt` · `자료/marketing/logo-data-uri.txt` · `자료/marketing/event-poster.py` 의 `HEAD`(CSS)를 그대로 쓴다

- [ ] **Step 1: `poster.py` 를 쓴다** — `event-poster.py` 의 `HEAD` 문자열·`poster_a3()`·`slide_169()` 틀을 그대로 복사하고, 본문만 아래로 바꾼다. 경로는 `M = 'C:/Projects/bible-memorize-church-app-v2/자료/marketing/'` 대신 이 파일 기준(`os.path.dirname(__file__) + '/../'`)으로 읽는다. 끝에 Playwright 로 PDF·PNG 를 뽑는다.

본문(A3 · 슬라이드 공통 문구):
- kicker `성도 참여 이벤트`
- h1 `가을<br><em>말씀암송</em> 동행` (슬라이드: `가을 <em>말씀암송</em> 동행`)
- sub(→ §8 에서 하루 3번으로 바뀜 · `poster.py` 의 `PER_DAY`) `하루 한 번 말씀을 암송하시면 한 칸.<br>한 주에 3일이면 그 주가 채워집니다. <b style="color:#fff">매일 하지 않아도 괜찮아요.</b>`
- prize: lb `여섯 주 가운데 세 주를 채우신 분` · bg `🎁 신청하신 분 모두 선물` · sm `신청 11월 3일(화) ~ 12월 5일(토)`
- steps(→ §8 에서 하루 3번으로 바뀜): `QR을 찍고<br>교구·이름 입력` · `하루 한 번<br>말씀 암송` · `첫 화면 🏅에서<br>도장 확인`
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
cd /c/Projects/v2-mh-merge && git add 자료/marketing/autumn-2026/poster.py 자료/marketing/autumn-2026/poster-a3.pdf 자료/marketing/autumn-2026/poster-a3.png 자료/marketing/autumn-2026/slide-16x9.pdf 자료/marketing/autumn-2026/slide-16x9.png
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
- [ ] **Step 3-1: 시험 회차 지우기(설계 §8-2 · 개발 먼저 → 운영)** — `event_signups` 는 cascade 로 함께 지워진다.
  ```sql
  delete from events where id = 'autumn-2026-test';
  -- 확인 — 둘 다 0 이어야 한다
  select count(*) from events where id = 'autumn-2026-test';
  select count(*) from event_signups where event_id = 'autumn-2026-test';
  ```
  ⚠️ 위 Step 3 의 확인 질의는 `status in ('open','closed')` 만 걸러서 **draft 인 시험 회차는 거기 안 보인다** — 남았는지는 이 두 질의로만 안다.
  (`supabase/event_autumn_2026_test.sql` 은 10/17 이 지나면 가드가 막아 다시 돌려도 되살아나지 않는다.)
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

---

## 추가 (2026-10-03 같은 날) — 「하루 3번」 규칙 + 시험 참여자 시험 (설계 §8)

### 추가 Global Constraints
- 「한 번」 = `daily_activity.cnt` 를 **모드 구분 없이 더한** 하루 합(= `v2_mydays` · 앱 「오늘 N회」). 하루 한 칸 = 합 ≥ `perDay`.
- `needs.eligibility.perDay` 정수 1~50 · 없으면 1. **autumn-2026 = 3**(10/14 까지 5 로 바뀔 수 있음 — 숫자 한 곳 + 같은 SQL 의 문구).
- `first_day` 는 「아무 활동이든 처음 한 날」 그대로. 문턱 미달인 날만 있는 사람도 **행이 나와야** 한다(HAVING 금지 · `count(*) filter` 로).
- 시험 회차 `autumn-2026-test`: `status draft` · `needs.testOnly = true` · 제목·짧은 이름 「[시험] 가을 말씀암송 동행」(→ 짧은 이름은 「[시험] 가을 동행」으로 줄임 · 첫 화면 알약 360px · 가지 마지막 검토 2026-10-03) · `eligibility {start:"2026-09-27", weeks:6, perWeek:1, need:1, minNeed:1, perDay:3}` · `opens_on 2026-10-04` · `closes_on 2026-10-17` · `list_until 2026-10-17`.
- `testOnly` 회차는 **status 와 무관하게** `ministryIsTester(user_id)` 인 계정에게만 목록·도장·신청·취소·명단에 나온다. 그 밖에는 **없는 회차와 똑같이**(`not-found` · 목록에서 빠짐). 테스터에게는 draft 를 open 처럼(날짜 창은 그대로) 다룬다. **`testOnly` 없는 draft(진짜 autumn-2026)는 테스터에게도 안 보인다.**
- 테스터 판정은 testOnly 행이 있고 user_id 가 있을 때만, **실패하면 false**(일시 오류로 목록 전체가 죽으면 안 된다).
- 배포 순서: **개발 SQL → 개발 api → (개발 확인) → 운영 SQL → 운영 api → 프런트 bump·push → 운영 자료 SQL(perDay·시험 회차)**. `v2_event_weeks` 는 옛 4-인자 서명을 **drop 하고** 5-인자 하나만 남긴다(두 개면 PostgREST 가 못 고른다) · 권한 두 줄을 같은 트랜잭션에서.
- `needs.eligibility` 가 있는데 `evtRule` 이 null(모양이 틀림)이면 신청을 **막는다**(`bad-rule`) — 클라이언트 `answers` 를 그대로 저장하는 길로 떨어지지 않게.
- SQL 파일을 `supabase --workdir <스크래치> db query --linked -f` 로 돌릴 때는 **절대경로**(상대경로는 workdir 기준이라 못 찾는다).

### Task 9: `v2_event_weeks` 에 `p_per_day` (SQL) + 글자 검사 시험

**Files:**
- Modify: `supabase/event_streak.sql` (함수 · 권한 · 확인 질의 · 머리 주석)
- Modify: `supabase/dev_seed_stamp.sql` (하루 perDay 줄 · 모드 섞기 · 사람 둘 더 · 기대값)
- Modify: `supabase/event_streak_metrics.sql` (`p` 에 `per_day` · `d` 에 `sum(cnt)` · `count(*) filter`)
- Create: `tests/event-perday.test.cjs` (node 내장만)
- Modify: `tools/preflight.py` (PURE_TESTS 에 한 줄)

**Interfaces:**
- Produces: `public.v2_event_weeks(p_start date, p_weeks int, p_per_week int, p_users text[] default null, p_per_day int default 1) returns table(user_id text, weeks_done int, week_days int[], all_weeks boolean, first_day date)` — 위치 호출 `(start, weeks, perWeek)` 와 이름 호출 `{p_start,p_weeks,p_per_week,p_users}` 가 그대로 산다.

- [ ] **Step 1: 시험을 먼저 쓴다** — `tests/event-perday.test.cjs`(node:test · node:assert · fs · path 만):
  - `supabase/event_streak.sql` 에 `drop function if exists public.v2_event_weeks(date, int, int, text[])` 가 `create or replace function public.v2_event_weeks(` **앞에** 있다.
  - `create ... function ...v2_event_weeks(` 는 **정확히 하나**이고 인자 목록 끝이 `p_per_day int default 1` 이다.
  - `revoke all on function public.v2_event_weeks(date, int, int, text[], int) from public, anon, authenticated` 와 `grant execute on function public.v2_event_weeks(date, int, int, text[], int) to service_role` 가 있고(공백 수는 느슨하게), **4-인자 revoke/grant 가 남아 있지 않다.**
  - 함수 본문에 `having` 이 없고 `filter (where n >= ` 가 있다 · `sum(da.cnt)` 가 있다 · `first_day` 를 만드는 `min(d.day)` 부분식에 `p_per_day` 가 없다.
  - `supabase/functions/api/index.ts` 의 `rpc("v2_event_weeks"` 호출마다 같은 객체 안에 `p_per_day` 가 있다(호출 수 ≥ 2).
  - `evtRule` 함수 본문이 `perDay` 를 읽는다.
  Run: `node --test tests/event-perday.test.cjs` → Expected: FAIL(아직 안 고쳤다).
- [ ] **Step 2: `event_streak.sql` 을 고친다** — 함수와 권한을 아래로(지금 주석은 살리고 「하루 합 ≥ p_per_day 면 한 칸 · 2026-10-03」 을 더한다):
```sql
begin;
-- ⚠️ 옛 4-인자 서명을 지운다 — 남겨 두면 기본값 때문에 PostgREST 가 두 오버로드 사이에서 못 골라 도장판·신청이 500 이 난다.
drop function if exists public.v2_event_weeks(date, int, int, text[]);
create or replace function public.v2_event_weeks(
  p_start    date,
  p_weeks    int,
  p_per_week int,
  p_users    text[] default null,
  p_per_day  int    default 1        -- 하루 합(cnt, 모드 구분 없이)이 이 수 이상이어야 한 칸 · 2026-10-03
)
returns table(user_id text, weeks_done int, week_days int[], all_weeks boolean, first_day date)
language sql stable security definer set search_path = public as $$
  with win as (
    -- 하루 한 줄로 모으되 그날 합을 n 에 남긴다. ⚠️ HAVING 으로 거르지 않는다 —
    --    문턱 미달인 날만 있는 분도 행·first_day 가 살아야 「처음 오신 분 완화」가 맞다.
    select da.user_id as uid, da.day, ((da.day - p_start) / 7) as wk, sum(da.cnt)::int as n
      from daily_activity da
     where da.day >= p_start
       and da.day <  p_start + (p_weeks * 7)
       and (p_users is null or da.user_id = any(p_users))
     group by da.user_id, da.day
  ),
  per_week as (
    select uid, wk, (count(*) filter (where n >= greatest(coalesce(p_per_day, 1), 1)))::int as days
      from win group by uid, wk
  ),
  agg as (
    select uid,
           count(*) filter (where days >= p_per_week)::int as wd
      from per_week group by uid
  )
  select a.uid,
         a.wd,
         (select array_agg(coalesce(pw.days, 0) order by g.wk)
            from generate_series(0, p_weeks - 1) as g(wk)
            left join per_week pw on pw.uid = a.uid and pw.wk = g.wk),
         (a.wd >= p_weeks),
         (select min(d.day) from daily_activity d where d.user_id = a.uid)
    from agg a;
$$;
revoke all     on function public.v2_event_weeks(date, int, int, text[], int) from public, anon, authenticated;
grant  execute on function public.v2_event_weeks(date, int, int, text[], int) to   service_role;
commit;
```
  확인 ① 질의를 「정확히 1행 · `pg_get_function_identity_arguments` = `p_start date, p_weeks integer, p_per_week integer, p_users text[], p_per_day integer` · proacl 에 `anon=`/`authenticated=`/`=X` 없음(proacl null 도 안 됨)」 으로 바꾼다. 확인 ② 예시에 `p_per_day => 3` 판을 하나 더.
- [ ] **Step 3: `dev_seed_stamp.sql`** — 하루에 `perDay`(3) 줄을 **모드를 섞어**(예 `learn-typing`·`typing`·`review-typing`) 넣게 바꾸고, 사람 둘을 더한다: 「모자란날」(하루 2줄 → `p_per_day 3` 에서 칸 0 · 행은 나와야) · 「늦게온모자람」(첫 활동이 창 안 · 문턱 미달만 → 행과 first_day 가 있어야). 기대값 주석을 `p_per_day => 3` 기준과 `=> 1`(옛 값과 같음) 둘로 적는다. ⚠️ 「운영이면 멈춘다」 빗장은 그대로.
- [ ] **Step 4: `event_streak_metrics.sql`** — `p` 에 `3 as per_day`, `d` 에 `sum(da.cnt) as n`, `w` 를 `count(*) filter (where n >= p.per_day)` 로(HAVING 금지 — 「활동한 분」 뜻이 바뀐다). 11줄 주석 「하루 합 cnt 가 per_day 이상이면 한 칸」. 결과란의 옛 숫자에 「(per_day 1)」을 붙인다.
- [ ] **Step 5: `tools/preflight.py`** — PURE_TESTS 에 `"tests/event-perday.test.cjs"` 한 줄(다른 줄은 건드리지 않는다).
- [ ] **Step 6:** `node --test tests/event-perday.test.cjs` → index.ts 항목 둘(p_per_day·evtRule)만 아직 FAIL(Task 10 에서 통과). 나머지 PASS.
- [ ] **Step 7: 개발 DB 에 돌린다** — `supabase --workdir <sb-dev> db query --linked -f "C:/Projects/v2-mh-merge/supabase/event_streak.sql"` → 확인 ① 1행·권한 깨끗 → `dev_seed_stamp.sql` → `select * from v2_event_weeks('2026-10-18',6,3, null, 3)` 와 `(..., 1)` 이 기대값 주석과 같은지.
- [ ] **Step 8: 커밋(로컬)** — 위 파일만 경로를 못 박아.

### Task 10: api — `perDay` · 시험 회차(`testOnly`) · 개발 배포

**Files:**
- Modify: `supabase/functions/api/index.ts` (evtRule · evtStampsFor · eventStamps · eventOpenList · eventSignup · eventDrop · eventRoster · eventRosterPublic · 새 helper)
- Modify: `tests/event-smoke.sh` (비테스터 차단 항목)

**Interfaces:**
- Consumes: Task 9 의 5-인자 RPC
- Produces(응답): `eventStamps` → `rule.perDay` · `days`(날짜별 합 · 이미 있음) · `todayCount`(오늘 합 · 새 칸, `days` 가 null 이면 null). `eventOpenList` → 시험 참여자 요청(user_id 있음)에만 `autumn-2026-test` 가 `events[]` 에 실리고 각 회차에 `testOnly` 칸. 신청 새 오류 슬러그 `bad-rule`.

- [ ] **Step 1: helper** (evtOpenNow 근처):
```ts
// 시험 회차(2026-10-03 · 설계 §8-2) — needs.testOnly 가 true 면 시험 참여자에게만.
function evtTestOnly(ev: any): boolean { return !!(ev && ev.needs && ev.needs.testOnly === true); }
// 시험 참여자인가 — 실패하면 false(닫는다). 일시 오류로 목록 전체가 죽으면 안 된다.
async function evtIsTester(userId: string): Promise<boolean> {
  if (!userId) return false;
  try { return await ministryIsTester(userId); } catch (_) { return false; }
}
// 신청이 지금 열려 있나(사람별) — 시험 회차는 시험 참여자에게만, status 와 무관하게(draft 도) 날짜 창으로.
function evtOpenFor(ev: any, today: string, isTester: boolean): boolean {
  if (evtTestOnly(ev)) return isTester && today >= ev.opens_on && today <= ev.closes_on;
  return evtOpenNow(ev, today);
}
// 목록에 보이나(사람별)
function evtListableFor(ev: any, today: string, isTester: boolean): boolean {
  if (evtTestOnly(ev)) return isTester && ["draft", "open", "closed"].includes(ev.status) && (!ev.list_until || today <= ev.list_until);
  return evtListable(ev, today);
}
```
  `evtListable` 첫 줄에 `if (evtTestOnly(ev)) return false;`(누가 status 를 open 으로 바꿔도 새지 않게).
- [ ] **Step 2: `evtRule`** — `const perDay = Number(e.perDay ?? 1)` · 정수 검사 목록에 넣고 `1 <= perDay <= 50` · 반환 객체에 `perDay`.
- [ ] **Step 3: `evtStampsFor`** — RPC 인자에 `p_per_day: rule.perDay` · 반환에 `todayCount: days ? (days[today] ?? 0) : null`.
- [ ] **Step 4: `eventStamps`** — 회차를 읽은 뒤 `if (evtTestOnly(ev) && adminError(b) !== null && !(await evtIsTester(userId))) return { ok: false, error: "not-found" };`
- [ ] **Step 5: `eventOpenList`** — 비관리자도 `draft` 를 select 하고(거름은 아래가 한다), `rows.some(evtTestOnly) && userId` 일 때만 `isTester = await evtIsTester(userId)`. 거름을 `isAdmin || evtListableFor(r, today, isTester)` 로, `canSignup`·`verb` 를 `evtOpenFor(r, today, isTester)` 로. 각 회차에 `testOnly: evtTestOnly(r)`. ⚠️ 비관리자에게 testOnly 아닌 draft 가 **절대** 안 실리는지(`evtListableFor` → `evtListable` 은 open·closed 만).
- [ ] **Step 6: `eventSignup`** — 회차를 읽은 뒤: testOnly 면 `isTester = isAdmin || await evtIsTester(userId)`, false 면 `not-found`. 열림 판정을 `evtOpenFor(ev, today, isTester)` 로(testOnly+테스터면 `status !== "open"` → `not-open` 분기를 건너뛰고 날짜로 `not-yet`/`closed-period`). **`ev.needs?.eligibility` 가 있는데 `evtRule(ev)` 가 null 이면 `{ok:false, error:"bad-rule"}`.** 스냅샷 `answers.rule` 에 `perDay`·`minNeed` 를 더한다.
- [ ] **Step 7: `eventDrop`** — 회차 select 에 `needs` 를 더하고, testOnly 면 테스터 판정 → `evtOpenFor` 로.
- [ ] **Step 8: `eventRoster`** — events select 에 `needs` 를 더한다(최종 집계 블록이 처음 살아난다 — 그 블록의 RPC 에 `p_per_day: pickedRule.perDay`). 출력 events 에 `testOnly`.
- [ ] **Step 9: `eventRosterPublic`** — `user_id` 를 받고 select 에 `needs`. 문을 `evtTestOnly(ev) ? (await evtIsTester(userId) && list_until 안 지남) : evtListable(ev, today)` 로. 응답에 user_id 를 싣지 않는다.
- [ ] **Step 10: `tests/event-smoke.sh`** — 읽기 전용 항목 더하기: 비테스터 uuid(`00000000-0000-0000-0000-000000000000`)로 ① `eventOpenList` 에 `autumn-2026-test` 가 없다 ② `eventStamps`·`eventSignup`·`eventRosterPublic` 에 `autumn-2026-test` → `not-found`. 기존 「익명 목록에 draft 없음」은 그대로 통과해야 한다.
- [ ] **Step 11:** `node --test tests/event-perday.test.cjs` 전부 PASS · `deno` 가 있으면 `deno check supabase/functions/api/index.ts`(없으면 건너뛰고 보고).
- [ ] **Step 12: 개발 배포** — `git status --short` 로 남의 미커밋 코드가 없는지 → `supabase functions deploy api --no-verify-jwt --project-ref ktpwthwqzgcqcrmsafdo` → `bash tests/event-smoke.sh`(개발).
- [ ] **Step 13: 커밋(로컬)**.

### Task 11a: 프런트 — 「하루 N번」 도장판 · 첫 화면 알약

**Files:** Modify `app.js`(stampRead·stampWrite·applyStampPill·fillStampPill·bumpStampToday·unbumpTodayCount·loadTodayCount 뒤) · `js/events.js`(evtStampHtml·evtDrawForm intro·evtErrText) · `style.css`(새 class · `.dark` 짝)
**Interfaces:** Consumes Task 10 의 `eventStamps` 응답 `rule.perDay`(없으면 1) · `days`(날짜→하루 합 · null 이면 「모른다」) · `todayCount`.

- **도장 계산 helper 하나를 `app.js` 에** 두고 `js/events.js` 가 `typeof` 로 빌려 쓴다(두 벌 금지 — events.js 가 먼저 실린다):
  `stampToday(srvToday)` = `max(srvToday, todayCountDay === todayYmd() ? todayCountCache : 0)` · 이번 주 보이는 수 = `srvWeekDays[i] + ((liveToday >= perDay && srvToday < perDay) ? 1 : 0)`. **`weekDays` 를 고쳐 저장하지 않는다**(되돌림이 저절로 맞게).
- `stampCache`(event-stamp::uid)에 `perDay`·`srvWeekDays`·`srvToday`(= `s.todayCount ?? s.days?.[today] ?? 0`)를 담는다(→ 실제 코드는 둘 다 모르면 0 이 아니라 **null**(「모른다」) · `applyStampPill` 은 `srvToday` 가 null 이면 +1 을 건너뛴다 · 리뷰 2026-10-03). `stampRead` 는 `perDay` 가 없는 옛 모양을 **버린다**. `fillStampPill` 의 `Math.max` 합치기를 걷고 위 계산으로. 그리기 전에 `stampCache.eventId === localStorage EVENT_STAMP_ID_KEY` 를 확인.
- `bumpStampToday` 는 칸을 뒤집지 않고 `applyStampPill()` 만 부른다(오늘 수는 `bumpTodayCount` 가 이미 올렸다). `unbumpTodayCount`·`loadTodayCount` 응답 뒤에도 `applyStampPill()`.
- **첫 화면 알약은 지금처럼 점(●○)만**(글자 없음 — 320px 에서 잘린다 · 9/23 원칙).
- **도장판(evtStampHtml):** `var perDay = r.perDay || 1`. 주 칸(.ev-wk)은 그대로(서버 `weekDays` 가 이미 문턱을 넘긴 날만 센다). 그 아래 **이번 주 7일 띠**(`.ev-days` 7열 · `.ev-day.on/.part/.today` · `.ev-day-t` 요일 · `.ev-day-v` 값): 날마다 `n = s.days[ymd]`(오늘은 `stampToday`) → `n >= perDay` ✓ · `0 < n < perDay` 「n/perDay」 · 0 「·」 · 오늘은 위 줄 「오늘」 아래 줄 값(320px 에서 두 줄). 날짜 키는 `evtWeekLabel` 과 같은 UTC 계산의 `evtDayYmd(start, n)`(`YYYY-MM-DD`). `s.days === null` 이면 띠를 그리지 않는다. 측정 전(phase before)·이번 주가 창 밖이면 띠를 그리지 않는다.
- 285줄 문구: `perDay === 1` 이면 지금 문장 그대로, 아니면 「하루에 {perDay}번 하시면 그날 한 칸이에요. 한 번은 첫 화면 「오늘 N회」와 같은 수예요.」(→ 가지 마지막 검토 2026-10-03: 「N」이 글자 그대로 보이고 0회면 첫 화면에 그 띠가 없어 「암송·도전·복습을 하나 마칠 때마다 한 번이고, 첫 화면에 「오늘 1회」처럼 쌓여요.」로 바꿈)
- intro 줄바꿈: `.ev-intro{white-space:pre-line}`(또는 `\n`→`<br>`) — SQL 의 `chr(10)` 이 살아야 한다.
- `evtErrText(err, e)`: `not-yet` → `evtDateKo(e.opensOn)+"부터 신청을 받아요."`(박힌 「10월 27일」 삭제) · `bad-rule` → 「지금은 신청을 받을 수 없어요. 잠시 뒤에 다시 해 주세요.」 · `bad-position`·`bad-phone` → 성도님 말로. 부르는 곳(evtSubmit·evtAskDrop)에서 회차를 넘긴다.
- CSS 는 지금 금색 계열(.ev-wk.on 과 같은 색)만 · 새 색 금지(docs/notes/home-screen.md) · `.dark` 짝.
- 확인: `node --check app.js js/events.js` · localhost(개발 DB · 개발 시험 회차/개발 자료)에서 도장판·띠 · `python tools/screen-sweep.py` 로 이벤트 화면 320px. 커밋(로컬).

### Task 11b: 프런트 — 시험 참여자에게만 시험 회차

**Files:** Modify `app.js`(refreshEventOpen·refreshMinistryTester·enterAfterLogin·clearPersonalData) · `js/events.js`(evtLoad·evtLoadRoster·renderEventForm 명단 부르는 곳) · `js/api.js`(eventRosterPublic)

- `refreshEventOpen`: **로그인 상태이고 `ministryTesterCached()` 일 때만** `api.eventOpenList(u.user_id)`, 아니면 지금처럼 user_id 없이(모든 성도님께 보내면 매 부팅 조회가 는다). 자격 회차가 둘 이상이면 **`testOnly` 가 아닌 쪽**을 고른다(같은 규칙을 `js/events.js` evtLoad 85줄 「하나뿐일 때만」에도).
- `refreshMinistryTester`: 값이 바뀌면(`before !== now`) `refreshEventOpen()` 도 부른다. `enterAfterLogin` 의 `syncProgress` 뒤(user_id 가 생긴 뒤)에 `refreshMinistryTester()` 를 한 번 더.
- `clearPersonalData`: `EVENT_OPEN_KEY`·`EVENT_LABEL_KEY`·`EVENT_STAMP_ID_KEY` 를 지우고 `todayCountCache = null; todayCountDay = null;` · `js/events.js` 전역(evtStamp·evtStampState·evtRoster·evtRosterFor·evtEvents·evtMine)을 비우는 함수가 있으면 부르고, 없으면 만들어 부른다(`typeof` 로).
- `js/api.js`: `eventRosterPublic: (event_id, user_id) => supaCall("eventRosterPublic", { event_id, user_id })` · `evtLoadRoster(eventId, uid)` 로 넘기고, 명단 캐시 키에 uid 를 넣는다.
- `markFeatSeen("stamp")` 는 그대로(시험 참여자가 10/18 NEW 를 못 볼 수 있는 것은 받아들인다).
- 확인: `node --check` · localhost 에서 개발 시험 계정(개발 `ministryTesters` 에 든 계정)으로 「[시험] …」 단추가 첫 화면에 뜨고, 다른 개발 계정·로그아웃 뒤에는 사라지는지. 커밋(로컬).

### Task 12: 회차 자료 — autumn-2026 `perDay 3` · 시험 회차 (개발 먼저)

**Files:**
- Create: `supabase/event_autumn_2026_perday.sql` — `do $$ declare v_per_day int := 3; ... $$` 하나로 `needs.eligibility.perDay` 와 `copy.intro` 를 **같은 숫자로** 바꾼다(가드: 행 있음 · draft · 신청 0건). intro:
  `'하루에 ' || v_per_day || '번 말씀을 암송하시면 그날 한 칸이 채워져요.' || chr(10) || '한 주에 3일이면 그 주가 채워집니다 — 매일 하지 않아도 돼요.' || chr(10) || '여섯 주 가운데 세 주만 채우시면 신청 단추가 열려요.' || chr(10) || '신청하신 분께는 모두 드립니다.'`
  머리에 「5 로 바꾸려면 v_per_day 한 곳만 고쳐 다시 돌린다 · **10/14 까지** · 개시 뒤에는 돌리지 않는다(가드가 막는다)」.
- Create: `supabase/event_autumn_2026_test.sql` — 시험 회차 insert(추가 Global Constraints 값 그대로 · `on conflict (id) do update` · `status` 는 덮지 않는다) · copy.intro 첫 줄 「시험 회차예요 — 🧪 시험 참여자에게만 보여요.」 + 하루 3번 · 한 주에 1일 · 한 주만 채우시면 · 신청하신 분께 · 맨 아래 **주석으로** `-- 10/17 지우기: delete from public.events where id = 'autumn-2026-test';  -- 신청은 cascade 로 함께`.
- Modify: `supabase/event_stamp_2026.sql` — 기록 값에 `'perDay', 3` 과 새 intro(돌리지 않는다).
- [ ] 개발에 둘 다 돌리고(절대경로) 확인: autumn-2026 `perDay 3`·intro 새 문구 · autumn-2026-test 행. 개발 `app_config.ministryTesters` 에 개발 시험 계정 identity_key 가 있는지 보고, 없으면 **개발에만** 하나 넣는다(운영 명단은 친구가 교회 어드민에서).
- [ ] 커밋(로컬).

### Task 13: 공지 문구 · 포스터 — 「하루 3번」 + 고칠 곳 둘

- `자료/marketing/autumn-2026/문구.md`: 「하루 한 번 말씀을 암송하시면」 → 「하루 3번 말씀을 암송하시면」(모든 절) · 주보 「10월 18일(주일)부터 6주 동안」 → 「**10월 18일(주일)부터 11월 28일(토)까지** 6주 동안」, 끝의 「(~11월 28일)」 삭제 · 10/18 알림 「세 주를 채우신 분께 선물을 드려요.」 → 「세 주를 채우고 신청하신 분께 선물을 드려요.」 · 머리에 「3 은 10/14 까지 5 로 바뀔 수 있다 — 바뀌면 이 파일·포스터·`event_autumn_2026_perday.sql` 을 함께」.
- `자료/marketing/autumn-2026/poster.py`: 숫자는 파일 위 상수 `PER_DAY = 3` 하나에서 — sub 「하루 {PER_DAY}번 말씀을 암송하시면 한 칸.」 · 둘째 단계 「하루 {PER_DAY}번<br>말씀 암송」. `if __name__ == "__main__":` 가드(import 하면 다시 뽑지 않게). 다시 뽑아 PNG 를 눈으로.
- [ ] 커밋(로컬).

### Task 14: 운영 반영 · 시험 준비 끝 (컨트롤러)

- [ ] 운영 SQL `event_streak.sql`(절대경로) → 확인 ① 1행·권한 → 운영 api 배포(⚠️ `git status` · 얼린 액션이 든 판인지) → `EVT_ENV=prod bash tests/event-smoke.sh`.
- [ ] 프런트(Task 11) bump → push → `APP_BUILD` 확인.
- [ ] 운영 자료 SQL 둘(`event_autumn_2026_perday.sql` · `event_autumn_2026_test.sql`).
- [ ] **친구:** 교회 어드민 ⚙️ 시스템 → 🧪 시험 참여자에 시험할 분(친구 본인 포함) → 폰에서: 첫 화면 🏅 「[시험] 가을 동행」(짧은 이름 · 회차가 여럿이면 「이벤트 N개」) · 도장판 1주 9/27~10/3 · 「오늘 n/3」 · 3번째에 도장 · 신청·취소.
- [ ] 교회 어드민 가지 `autumn-excuse` 세션에 알림: 새 RPC 서명(`p_per_day` 끝 · 기본 1) · `eligRule` 에 `perDay`·`eligWeeks` 에 `p_per_day` · 원문 사본(`tests/fixtures/evt-legacy.ts`)을 새 v2 커밋으로 다시 뜨기 · **옛 체크아웃의 `event_streak.sql` 을 개발에 돌리지 말 것**(4-인자가 되살아나 모호성).
- [ ] 문서: CLAUDE.md 가을 줄 · `docs/notes/bible-events-admin.md` 한 줄 · 메모.
- ⚠️ **되돌리기는 `api` 만**(가지 마지막 검토 2026-10-03) — 5-인자 `v2_event_weeks` 는 옛 `api` 의 4-키 호출도 기본값으로 받는다.
  옛 체크아웃의 4-인자 `supabase/event_streak.sql` 을 다시 돌리면 함수가 **둘**이 되어 4-키 호출이 모호해진다(도장판·신청·명단 500) — **옛 파일을 돌리지 말 것.**
- ⚠️ **`api` 는 파일 통째 배포** — origin/main 을 합치지 않은 옛 트리(공용 체크아웃·다른 worktree)에서 배포하면 perDay·시험 회차가
  **조용히** 사라진다(perDay 가 1 로 돌아간다). 배포 전 `git fetch && git merge --ff-only origin/main` · 배포 뒤 단계마다
  `EVT_ENV=prod bash tests/event-smoke.sh` 6-2(① 구조 SQL 뒤 ok · ② api 뒤 `rule.perDay`·`todayCount` · ④ 자료 SQL 뒤 `EVT_ENV=prod EXPECT_PER_DAY=3`) · ④ 뒤 전체 스모크 한 번 더.
  ⚠️ **`EVT_ENV=prod` 를 빼면 개발을 본다** — 개발은 이미 perDay 3 이라, 운영이 1 로 돌아가 있어도 그대로 통과해 버린다.
