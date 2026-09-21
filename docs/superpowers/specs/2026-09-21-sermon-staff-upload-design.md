# 설교 담당자가 관리자 화면에서 설교를 올린다 — 설계 (2026-09-21)

> **왜:** 지금까지 설교 반영은 친구가 집 컴퓨터에서 AI(Claude Code)에게 시켜서 했다
> (`gocheok-sermons/scripts/add-local.mjs` + `reflect-sermon` 스킬). 이 일을 **다른 분이 맡게 되었는데
> 그분은 AI 프롬프트를 쓸 수 없다.** 관리자 화면에서 끝나야 한다.
>
> **목표일:** 2026-09-27(주일) 설교를 담당자가 이 화면으로 올린다(친구가 옆에서 지켜본다).

## 0. 범위 — 셋으로 나눴다

| | 할 일 | 이 설계서 |
|---|---|---|
| ① | 설교 반영(링크 → 아카이브·3분 음성·암송 도우미·챗봇 색인) | **여기** |
| ② | 이번 주 암송구절 등록·설교 연결 | **여기** (①의 한 단계로 합쳤다) |
| ③ | 말씀 연상 그림 3장 | **다음 설계서** — 정해 둔 것만 9장에 적는다 |

## 1. 지금 무엇이 막혀 있나 (조사한 사실)

- `admin-sermon.html` 에 「➕ 유튜브 링크로 새 설교 추가」가 **이미 있다.** sermon 함수 `addByUrl` →
  GitHub Actions `add-sermon.yml` 을 깨운다.
- 그런데 **2026-08-09 뒤로 다섯 번 연속 실패**했다(`gh run list --workflow add-sermon.yml`).
  9/13 기록: 제목·날짜는 받았고 **자막만** `✗ 자막 실패` → AI 노트 `건너뜀(자막 없음)` →
  챗봇 색인 `no-sermons` 로 끝났다. **유튜브가 GitHub 서버(데이터센터 IP)에서 자막을 막는다**
  (자세한 사연은 메모리 `sermon-yt-bot-block`). 집 IP 에서는 쿠키 없이도 된다 — 그래서 그동안 집에서 했다.
- 나머지 단계(AI 노트 · Azure 음성 · 암송 연결 · DB 적재 · 챗봇 색인)는 서버에서도 잘 돈다.
- 화면은 실패해도 「✅ 처리 시작됨」만 띄우고 결과를 알려 주지 않는다.
- 설교자는 `2-notes.mjs` 에 `차동혁 위임목사` 로 **고정**이다 — 초청 설교자 주에는 친구가 나중에 고쳤다.
- 암송구절은 **설교보다 먼저 등록되고, 설교 링크(`verses.sermon_url`)만 주일 뒤에 채워진다**
  (38번: 날짜 9/19 토 · 링크는 9/20 설교). 설교↔구절 연결(`4-link.mjs`)은 **구절 쪽 링크로 찾는다** —
  링크를 먼저 넣지 않으면 연결이 빈 채로 들어가고, `importSermons` 가 `ignoreDuplicates` 라 **다시 돌려도 안 고쳐진다.**
- `4-link.mjs` 의 영상 번호 뽑기는 `?v=` 꼴만 안다(`youtu.be/…` 로 적힌 구절은 조용히 안 이어진다).

## 2. 성도님(친구)이 정한 것

| 물음 | 정한 것 |
|---|---|
| 맡길 범위 | 설교 + 암송구절 + 연상 그림까지 (그림은 다음 설계서) |
| 자막을 얻는 법 | **항상 붙여넣기** — 담당자가 PC 유튜브 「스크립트 표시」에서 복사해 붙인다. 외부 서비스 없음 |
| 담당자 확인 | **전용 암호 + 등록된 담당자** — 사역신청과 같은 방식 |
| 설교 암호 | 친구가 정해 알려 주었다. ⚠️ **파일·커밋·메모리 어디에도 적지 않는다** — Supabase 시크릿 `SERMON_STAFF_SECRET` 에만 넣는다(저장소가 공개다) |
| 그림 만드는 곳 | 구글 Gemini API 로 지금과 같은 모델(nano banana pro) |
| 첫 실전 | 2026-09-27 주일 설교 |

## 3. 담당자가 보는 화면 — `admin-sermon.html`

화면을 새로 만들지 않고 지금 화면을 고친다(두 벌로 두면 반드시 어긋난다 — `admin-ministry.html` 과 같은 까닭).

### 로그인
- **관리자:** 허브에서 넘어오면(`sessionStorage admin-pw`) 지금처럼 자동으로 들어온다. 모든 단추가 보인다.
- **담당자:** 사역신청 담당자와 똑같이 **이 기기의 앱 로그인 정보**(`localStorage memorize-user`)를 읽어
  「👤 소속 · 이름」을 보이고 **설교 암호만** 받는다. 앱에 로그인하지 않았으면 「이 기기에서 앱에 먼저 로그인해
  주세요」. 저장 칸은 `sermon-pw` · `sermon-staff` — ⚠️ `admin-pw` 에 넣지 않는다(허브·다른 도구가 그 암호로 부르다 줄줄이 실패한다).
- 담당자에게는 「삭제」가 안 보인다(서버도 막는다).

### 「새 설교 올리기」 — 네 단계

**① 링크** — 붙이면 영상 번호(11자)를 뽑는다(`watch?v=` · `youtu.be/` · `live/` · `shorts/` 모두).
유튜브 oEmbed 로 **썸네일·제목**을 바로 보인다(「이 영상이 맞나요?」 — oEmbed 는 이 도메인에 CORS 를 열어 준다, 2026-09-21 확인).
이미 아카이브에 있는 영상이면 여기서 「이미 올라와 있어요」로 멈춘다.

**② 자막 붙여넣기** — 옆에 안내:
1. 유튜브 설명란 「…더보기」 → 「스크립트 표시」
2. 오른쪽 스크립트 첫 줄을 누르고, 끝까지 내려 **Shift 를 누른 채 마지막 줄**을 누른다
3. `Ctrl+C` → 여기에 `Ctrl+V`

실제 유튜브 화면 캡처 2장(단추 위치 · 선택하는 법)을 붙인다 — 구현 중 로컬 크롬으로 찍고, 안 되면 친구에게 부탁한다.
붙이면 **정리**해서(5장) 「약 2만 3천 자 받았어요」를 보인다. 5,000자보다 짧으면
「일부만 복사된 것 같아요 — 끝까지 선택했는지 봐 주세요」(주일설교는 약 2.3만 자, 9/13·9/20 실측).

**③ 정보 확인** — 모두 고칠 수 있다.
- 제목: oEmbed 제목에서 `[고척교회]` · 목사님 꼬리표를 뗀 것(`add-video.mjs` 의 `cleanTitle` 과 같은 규칙)
- 예배일: 한국 날짜로 지난 주일(오늘이 주일이면 오늘)
- 구분: 주일설교 (목록 `CATS` — 화면과 서버 두 곳에 있다, 6장)
- 설교자: 차동혁 위임목사 — 초청 설교자 주에는 여기서 바꾼다
- **암송구절 연결** (서버 `getVerses` 로 이 영상 번호를 가진 구절을 찾는다):
  - 있으면: 「📖 38번(롬 14:8)과 연결돼요」
  - 없고 **링크가 빈 최근 구절**이 있으면: 「38번(롬 14:8)에 이 설교를 연결할까요?」 **[연결]** — 가장 흔한 경우
  - 없으면: **[새 암송구절 등록]**(칸이 이 자리에서 열린다 — 8장) 또는 **[암송구절 없이 올리기]**(새벽기도 등)
  - ⚠️ 연결·등록을 **먼저** 끝내야 「올리기」가 켜진다(없이 올리기를 고른 경우는 제외) — 1장의 순서 함정을 화면이 막는다.

**④ 올리기** — 진행 막대:
`자막 준비 → AI 노트 → 3분 음성 → 암송 연결 → 암송 도우미 → 저장 → 챗봇 색인 → 사이트 배포 → 확인`
10초마다 서버에 묻는다. 창을 닫았다 열어도 이어서 보인다(가장 최근 작업을 읽는다).
끝나면 결과 카드: 제목 · 본문 · 한 줄 요약 · 연결된 암송구절 · 「사이트에서 보기」.
실패하면 **멈춘 단계 + 까닭 한 줄 + [다시 시도] + 「친구에게 알려 주세요」.**

### 설교 목록(고치기)
지금 칸(제목 · 예배일 · 구분)에 **설교자**를 더한다. 저장은 **그 칸들과 숨김만** 바꾼다 — 지금의 `saveSermon` 은
객체 통째 upsert 라 빠진 칸이 null 이 된다(메모리 `sermon-yt-bot-block` ④).

## 4. 뒤에서 도는 구조

```
admin-sermon.html ──sermonJobCreate──▶ api 함수 ──▶ sermon_jobs 에 한 줄(자막·정보·상태)
                                          └──────▶ GitHub: gocheok-sermons 의 sermon-job.yml 깨우기(job_id, api_base)
sermon-job.yml: sermonJobGet 으로 자막·정보를 받아 → 2~6단계 → 커밋·푸시 → Pages 배포 → 확인
                단계마다 sermonJobUpdate(step) · 끝에 done / 실패하면 failed + 까닭
admin-sermon.html: 10초마다 sermonJobs 로 막대를 채운다
```

- **유튜브에 아예 가지 않는다.** 자막은 붙인 것, 제목·날짜·구분·설교자는 ③의 값. `yt-dlp` 도 쓰지 않는다 → 봇 차단과 무관.
- **담당자가 부르는 것은 이 저장소의 `api` 함수에 둔다**(sermon 함수가 아니라). 담당자 확인 코드가 거기 있다 —
  두 함수에 복사해 두면 한쪽만 고쳐진다. `api` 와 `sermon` 은 같은 Supabase 프로젝트라 `sermons` 표를 함께 본다.
  `admin-sermon.html` 은 이제 **`js/config.js` 를 따른다**(localhost = 개발 DB). sermon 함수의 `adminList`·`saveSermon`·
  `deleteSermon`·`addByUrl` 은 이 화면이 더는 부르지 않는다 — `addByUrl` 과 옛 `add-sermon.yml` 은 9/27 성공 뒤 지운다.
- **새 워크플로 `sermon-job.yml`**(gocheok-sermons) — 입력 `job_id` · `api_base`.
  - `api_base` 는 **두 주소만 받는다**(운영·개발 `…/functions/v1/api`) — 다른 값이면 곧바로 끝낸다(관리자 시크릿을 모르는 곳에 보내지 않게).
  - 운영이면 시크릿 `SERMON_ADMIN`, 개발이면 `DEV_SERMON_ADMIN`(친구가 한 번 넣는다)으로 `sermonJobGet`·`sermonJobUpdate` 를 부른다.
  - **개발 주소면 시험 모드:** AI 노트 · 음성 · 암송 연결까지만 하고 **DB 적재 · 챗봇 색인 · 커밋 · 배포를 건너뛴다.**
  - `concurrency: add-sermon` 을 함께 쓴다(옛 워크플로·음성 재생성과 겹치지 않게).
- **새 스크립트 `scripts/job-run.mjs`**(gocheok-sermons): 작업을 받아 `data/transcripts/<id>.txt` 와 `data/meta.json`
  한 줄(제목·날짜·구분·설교자)을 쓰고 → `2-notes` → `3-tts` → `4-link` → `4b-versehelp` → `5-migrate` → `6-embed` 를
  차례로 돌리며 단계마다 알린다. 기존 스크립트는 거의 그대로 쓰고 **넷만 고친다:**
  1. `2-notes.mjs` — 설교자·구분을 `meta.json` 의 값으로(없으면 지금 고정값)
  2. `5-migrate.mjs` — 적재가 실패하면 `process.exit(1)`(지금은 조용히 초록불)
  3. `4-link.mjs` — 영상 번호 뽑기를 화면과 같은 규칙으로(`youtu.be/` 등) · 주소를 `API_BASE` 로 받게
  4. 커밋 전 `git pull --rebase` — 같은 날 친구 PC(`add-local.mjs`)에서 올린 것과 부딪히지 않게
- **확인 단계:** 배포 뒤 sermon 함수 `getSermons` 에 그 영상이 **요약·음성 경로와 함께** 있는지, `sermon.onlybible.kr/audio/<id>.mp3`
  가 200 인지(배포가 늦으면 1분 안에서 몇 번 다시) 보고서야 `done`. **「스크립트가 끝났다」를 완료로 치지 않는다**(1장의 조용한 실패).
- **`add-local.mjs`(친구 PC 방식)는 그대로 둔다** — 급할 때 쓴다.

## 5. 자막 정리 규칙

화면이 정리하고(글자 수를 바로 보이려고), 서버가 한 번 더 본다(최소 길이).
- 시각만 있는 줄 지우기: `^\s*\d{1,2}:\d{2}(:\d{2})?\s*$`
- 줄 앞 시각 떼기: `^\s*\d{1,2}:\d{2}(:\d{2})?\s+`
- 줄바꿈·공백을 한 칸으로, NFC 로
- ⚠️ 유튜브 스크립트 창을 복사하면 무엇이 딸려 오는지(챕터 제목 · 「3초」 같은 읽기용 글 등)는 **실제로 복사한 글로 먼저 모은다**(시험 1).
  규칙은 그 표본에 맞춰 더한다.
- 서버 최소 1,000자(`2-notes` 는 300자 밑이면 건너뛴다 — 그보다 넉넉히), 최대 200,000자.

## 6. 데이터 · 액션

### 새 표 `sermon_jobs` (`supabase/sermon_jobs.sql`)
```sql
create table public.sermon_jobs (
  id          bigint generated always as identity primary key,
  video_id    text not null check (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  title       text not null,
  svc_date    date not null,
  category    text not null,
  preacher    text not null,
  transcript  text not null,
  status      text not null default 'queued' check (status in ('queued','running','done','failed')),
  step        text,            -- 지금(또는 멈춘) 단계
  error       text,            -- 실패 까닭 한 줄
  run_url     text,            -- GitHub 실행 주소
  created_by  text,            -- 올린 분 「소속 이름」(보이기용 · user_id 아님)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.sermon_jobs enable row level security;   -- ⚠️ 그 자리에서 켠다(CLAUDE.md 보안)
revoke all on public.sermon_jobs from anon, authenticated;
```
정책은 두지 않는다(서비스 키로만 읽고 쓴다). 자막은 공개 영상의 자막이라 개인정보가 아니다.
`category` 에는 CHECK 를 두지 않는다 — 목록은 화면 `CATS` 와 서버 두 곳이다(메모리 `allowlist-lives-in-three-places`: 셋으로 늘리지 않는다).

### `api` 함수에 더하는 액션

| 액션 | 누가 | 하는 일 |
|---|---|---|
| `sermonAuth` | 설교 암호 + 담당자 | 들어올 수 있는지만 (`ministryAuth` 와 같은 꼴) |
| `sermonStaffList` | 담당자·관리자 | 설교 목록(숨김 포함, 고칠 칸만) + 최근 작업 5개(자막 빼고) |
| `sermonJobCreate` | 담당자·관리자 | 검사 → `sermon_jobs` 에 넣고 → GitHub 깨우기. 깨우기 실패면 그 줄을 `failed` 로 두고 오류를 돌려준다 |
| `sermonJobs` | 담당자·관리자 | 최근 작업(자막 빼고) — 10초 묻기용 |
| `sermonJobRetry` | 담당자·관리자 | `failed` 인 작업만 `queued` 로 되돌리고 다시 깨운다 — 「이미 있음」 검사는 하지 않는다(첫 시도가 적재까지 갔을 수 있다 · 10장) |
| `sermonStaffSave` | 담당자·관리자 | 제목·예배일·구분·설교자·숨김 **다섯 칸만** 고친다 |
| `sermonDelete` | **관리자만** | 설교 삭제 |
| `staffVerseSave` | 담당자·관리자 | 암송구절 새로 넣기·설교 링크 잇기 (8장) |
| `sermonJobGet` · `sermonJobUpdate` | **관리자 암호만**(워크플로) | 작업 읽기(자막 포함) · 상태 적기 |
| `staffAdmins` · `staffAdminsSave` | **관리자만** | 담당자 명단 — `role: "ministry" \| "sermon"` |

`sermonJobCreate` 검사:
- 영상 번호 꼴 · 제목 · 날짜 · 구분(목록 안) · 설교자 · 자막 길이
- **이미 `sermons` 에 있으면** `exists` — 두 번 돌리면 AI 비용만 든다
- **한 번에 하나만:** `queued`/`running` 이면서 30분 안에 움직인 작업이 있으면 `busy`
  (30분 넘게 멈춘 작업은 막지 않는다 — 화면은 「멈춘 것 같아요」로 보인다). 암호가 새어도 AI 비용이 쌓이지 않게 한다.

## 7. 권한 — 사역신청 담당자 방식을 두 역할로 넓힌다

- 지금 `ministryAdminError` · `ministryStaffKey` · `ministryAdminKeys` · `ministryAdminsSave` 를
  **역할을 받는 공용 함수**로 바꾼다: `사역 = MINISTRY_SECRET + app_config ministryAdmins`,
  `설교 = SERMON_STAFF_SECRET + app_config sermonAdmins`. 옛 이름(`ministryAdminError`, `ministryAdmins` 액션 등)은
  감싸서 그대로 둔다 — 사역신청 화면을 건드리지 않는다.
- 지켜 온 규칙을 그대로 가져간다(`docs/notes/ministry-2027.md` 「사역신청 담당자 화면」):
  - 확인은 **액션마다** — 화면에서 한 번 보는 것으로 끝내지 않는다
  - **틀린 암호와 「맞는 암호 + 담당자 아님」은 같은 답**(`unauthorized`)
  - 담당자는 **키가 아니라 사람(user_id)으로** 맞댄다(소속이 바뀐 분 · 합쳐진 계정)
  - 명단 등록·해제는 **관리자 암호로만**, 한 분씩, users 에 있는 분만
  - 관리자 암호는 모두 통과 · `authCheck`(허브)에는 설교 암호를 쓰지 않는다
- 설교 암호로 **안 되는 것**을 개발 DB 에서 확인한다: `authCheck` · `stats` · `sendPush` · `saveVerse`(관리자용) ·
  `sermonDelete` · `sermonJobGet` · `staffAdminsSave` · 사역신청 액션.
- 관리자 화면 `admin-stats.html` 「🔑 사역신청 담당자」를 **「🔑 담당자」** 로 넓혀 **사역신청 · 설교** 두 명단을 보인다.

## 8. 암송구절 등록·연결(②) — `staffVerseSave`

- **링크 잇기(흔한 경우):** 이미 있는 구절에 `sermon_url` 만 넣는다. 다른 칸은 건드리지 않는다.
- **새 구절:** 순번(가장 큰 번호 + 1) · 날짜(가장 최근 구절 날짜 + 7일 — 지금 친구가 쓰는 규칙을 따라간다) ·
  출처(짧게 · 길게) · 말씀 본문 · 힌트 · 설교 제목 · 설교자 · 설교 링크.
  ⚠️ **영어(NIV) 칸은 담당자 화면에 두지 않고, 저장도 건드리지 않는다** — 관리자 `saveVerse` 는 행을 통째로 upsert 해서
  빈 칸을 보내면 영어 본문이 지워진다. 영어는 친구가 admin-stats 에서 대조·검수해 넣는다(지금처럼).
- 설교 링크는 늘 `https://www.youtube.com/watch?v=<id>` 꼴로 저장한다(`4-link` 가 틀림없이 찾게).
- 저장 전 한 번 묻는다: 「저장하면 앱 전체(이번 주 말씀·알림)에 바로 반영돼요」.

## 9. 다음 설계서(③ 연상 그림)로 넘기는 것 — 정해 둔 것만

- 그림은 **구글 Gemini API 로 nano banana pro**(지금 그림체 그대로). 친구가 Google AI Studio 키를 한 번 만들고 결제를 등록한다.
  장당 값·모델 이름은 그 설계서에서 확인한다.
- 그림 목록을 **`app.js` 의 `VERSE_IMG` 에서 DB 로** — 새 그림은 Supabase 저장소 + 표, 앱은 기존 116장(코드)과 DB 를 합쳐 보인다.
  배포 없이 바로 뜬다.
- 담당자 순서: 우리말 장면 제안 고르기 → 세 장 → 확인표로 눈 검수·그 장만 다시 뽑기 → 설명 한 줄 → 저장.
  화풍 문구는 고정(`img/verse/암송말씀_그림_만들기.md`).
- 권한은 이 설계서의 **설교 역할**을 그대로 쓴다.

## 10. 실패할 때

| 무엇이 | 화면 | 그 밖에 |
|---|---|---|
| GitHub 를 못 깨움(열쇠 만료 등) | 「올리기」 직후 오류 한 줄 | 작업은 `failed` |
| 깨웠는데 3분 넘게 `queued` | 「시작이 늦어지고 있어요」 | |
| 단계 중 실패 | 멈춘 단계 + 까닭 + [다시 시도] | **친구 텔레그램**(운영일 때만) |
| 스크립트가 죽어 상태를 못 적음 | 30분 뒤 「멈춘 것 같아요」 + [다시 시도] | 워크플로 `if: failure()` 가 `failed` 를 적고 텔레그램 |

- 텔레그램: gocheok-sermons 저장소에 `TELEGRAM_TOKEN` · `TELEGRAM_CHAT_ID` 를 **친구가** 넣는다(이 저장소 `monitor.yml` 과 같은 이름).
  없으면 알림만 건너뛴다. ⚠️ `gh secret set` 은 Claude Code 권한 필터가 막는다(메모리 `sermon-yt-bot-block` ②).
- [다시 시도]는 같은 자막으로 다시 돈다. ⚠️ **이미 DB 에 들어간 설교면 AI 노트를 다시 만들지 않는다** — `job-run.mjs` 가
  시작할 때 `getSermons` 에서 그 설교를 받아 `src/data/sermons.json` 에 넣어 두면 `2-notes` 가 「이미 있음」으로 건너뛰고,
  `3-tts` 는 **DB 에 있는 대본으로** 음성을 만든다. 이걸 안 하면 두 번째 노트로 음성을 만들고 DB 에는 첫 노트가 남아
  (`importSermons` 는 `ignoreDuplicates`) **음성과 글이 어긋난다.**
  커밋·푸시까지 갔다가 배포에서 실패했으면 저장소에 이미 있으니 모든 단계가 건너뛰고 배포·확인만 다시 된다.
  (`embedSermons` 를 같은 설교로 두 번 불러도 청크가 겹치지 않는지는 구현 때 확인한다.)

## 11. 시험

1. **자막 표본:** 실제 유튜브 스크립트 창에서 복사한 글 3가지(주일설교 · 새벽기도 · 챕터 있는 영상)를 `tests/` 에 두고,
   정리 규칙이 시각·딸려 온 글을 다 지우는지 본다(node 로 도는 작은 시험).
2. **담당자 확인(개발 DB):** 맞는 암호 + 등록된 분 / 맞는 암호 + 등록 안 된 분 / 틀린 암호 / 소속이 바뀐 분 /
   설교 암호로 7장의 막을 것들 — 사역 때 12가지처럼 한 표로 남긴다.
3. **처음부터 끝까지(시험 모드):** localhost → 개발 `api` → `sermon-job.yml`(개발 주소 = 시험 모드) → 진행 막대 · 결과 카드 ·
   실패 화면(일부러 짧은 자막 · 틀린 주소)을 본다. 운영 DB·저장소는 건드리지 않는다.
4. **실전(9/27 주일):** 담당자(또는 친구가 담당자로) 운영 화면에서 그날 설교를 올린다. 결과를 sermon.onlybible.kr · 암송앱
   암송 도우미 · 챗봇에서 확인한다. 성공하면 옛 `addByUrl` · `add-sermon.yml` 을 지운다.

## 12. 배포 순서 · 준비물

**친구가 해 줄 것**(제가 못 하는 자리)
- `supabase/sermon_jobs.sql` 을 **개발 → 운영** 순으로 SQL Editor 에서(메모리 `supabase-sql-needs-user`)
- 개발 DB 에 `sermons` 표가 없으면 `gocheok-sermons/supabase/schema.sql` 의 그 표도 개발에
- Supabase 시크릿: 운영·개발 모두 `SERMON_STAFF_SECRET`(설교 암호) · 개발에 `GH_DISPATCH_TOKEN`(운영엔 있다 — 만료일·권한은 시험 3에서 확인)
- gocheok-sermons 저장소 시크릿: `DEV_SERMON_ADMIN`(개발 관리자 암호) · `TELEGRAM_TOKEN` · `TELEGRAM_CHAT_ID`
- 관리자 화면 「🔑 담당자」에서 설교 담당자 등록(개발에 시험용 한 분 · 운영에 실제 담당자)

**순서** — 새 표에 새 액션만 얹으므로 **표가 먼저**(CLAUDE.md 「배포 순서는 기능마다 다르다」)
1. 개발: 표 → `api` 함수 → 워크플로·스크립트(gocheok-sermons 푸시) → localhost 시험 1~3
2. 운영: 표 → `api` 함수 → `admin-sermon.html` · `admin-stats.html` → `python tools/bump.py` → 푸시
- ⚠️ `supabase functions deploy api` 는 **작업 트리를 통째로** 올린다 — 배포 전 `git status` 로 남의 미완성 코드가 없는지 본다
  (메모리 `edge-function-shared-deploy`).
- ⚠️ 공용 파일(`index.ts` · `admin-stats.html`)은 `git commit -- <경로>` 로, 내 것만 담는다(메모리 `stage-only-changed-files`).

## 13. 다 되면 고칠 문서

- `docs/notes/` 에 `sermon-staff-upload.md` — 이 기능의 함정 기록. CLAUDE.md 표에 한 줄.
- `gocheok-sermons/docs/설교-url-반영-절차.md` 맨 위에 「이제 담당자는 관리자 화면으로 올린다 — 이 문서는 친구 PC 방식」.
- `reflect-sermon` 스킬: 설교 반영은 관리자 화면이 먼저라는 것.
