# 설교·찬양 담당자 — 관리자 화면에서 설교 올리기 (2026-09-30 운영)

> 설계 `docs/superpowers/specs/2026-09-21-sermon-staff-upload-design.md` · 계획 `docs/superpowers/plans/2026-09-21-sermon-staff-upload.md`
> (계획이 설계보다 우선). 여기에는 **한 번씩 사고를 낸 자리와 함정만** 적는다.
> 연상 그림(③)은 `docs/notes/verse-image-staff.md`.

## 구조 한 문단

AI 프롬프트를 못 쓰는 담당자가 매주 설교를 올리도록, 친구 PC(`add-local.mjs`) 방식을 관리자 화면으로 옮겼다.
**설교·찬양 관리**(`admin-stats.html?only=sermon` · 허브의 `admin-sermon.html` 이 넘긴다)에 담당자 전용 암호(`CONTENT_STAFF_SECRET`)
+ **등록된 담당자**(역할 `content`)로 들어온다. ① 설교/말씀 등록(구절·날짜) → ② 설교 내용 등록(유튜브 링크 + **자막 붙여넣기**)
→ `api` 가 `sermon_jobs` 에 한 줄을 넣고 gocheok-sermons 의 `sermon-job.yml`(「설교 올리기 (관리자 화면)」)을 부른다 →
워크플로가 노트·음성·연결·저장·챗봇 색인·커밋·Pages 배포·확인(`job-verify`)까지 하고 단계마다 `sermon_jobs` 에 적는다.
실패하면 `fail` 잡이 텔레그램으로 「작업 #N」 알림을 보낸다. 찬양 아카이브(🎵)도 담당자가 곡 등록·순서를 한다(삭제·일괄은 관리자만).

자막은 **항상 붙여넣기**다 — 유튜브가 GitHub 서버에서 자막을 막는다(`sermon-yt-bot-block` 메모리).

## ⚠️ 함정

- **다시 시도는 화면에서만.** GitHub 화면의 Re-run 은 작업을 되살리지 못하고(stale — 다른 실행이 맡은 줄에는 쓰지 않는다),
  끝난 실행을 Re-run 하면 **가짜 실패 알림**이 간다. 다시 시도마다 `attempt` 가 1 씩 오르고, 옛 실행은 새 시도의 줄에 쓰지 못한다.
- **다시 시도는 DB 내용을 이어 쓴다** — 앞 시도가 만든 음성·글이 남아 있으면 어긋날 수 있다. 이상하면 결과를 보고 판단한다.
- **같은 설교를 친구 PC(`add-local.mjs`)로 동시에 올리지 말 것** — 두 쪽 커밋의 rebase 가 부딪히고 음성·글이 어긋날 수 있다.
- **지우기보다 숨김.** 지운 설교는 다음 올리기 때 `sermons.json` 에서 되살아난다.
- **한 번에 하나만** — `sermon_jobs_one_active`(진행 중 `queued`·`running` 한 줄만 허용하는 유일 인덱스). 두 사람이 같은 순간 눌러도
  하나만 들어간다(AI 비용이 쌓이지 않게). **30분 넘게 소식이 없으면** 스윕이 `failed`(「30분 넘게 소식이 없어 멈춘 것으로 봤어요」)로
  바꾼다 — 안 그러면 멈춘 작업 하나가 「한 번에 하나만」을 영원히 막는다.
- **워크플로는 기본 가지(main)에 있어야 불린다.** 개발은 `api` 비밀값 `GH_DISPATCH_REF` 로 가지를 고른다 — **운영에는 넣지 않는다**(없어야 main).
  가지(`feat/sermon-staff`)를 지우기 **전에** 개발의 `GH_DISPATCH_REF` 를 지운다(아니면 개발 디스패치가 422).
- **운영 `api` 는 gocheok-sermons 쪽을 main 에 합친 뒤에만 올린다** — 새 `api` 는 디스패치에 `attempt` 를 싣는데 옛 워크플로에는
  그 입력이 없어 GitHub 가 422 로 거절한다(반대로 옛 `api` 는 새 워크플로와도 돈다).
- **영상 번호 규칙은 네 곳**: `admin-stats.html`(화면) · `supabase/functions/api/index.ts` · gocheok-sermons `scripts/job-lib.mjs` ·
  `supabase/sermon_jobs.sql` 의 CHECK. 하나만 고치면 화면은 받고 저장이 막힌다(메모리 「허용 목록은 세 곳」과 같은 꼴).
- **`SERMON_CATS`(설교 구분)는 두 곳**: `admin-stats.html` · `api` — 표에는 CHECK 가 없다.
- **담당자는 그 PC 에서 앱에 먼저 로그인해 두어야 한다** — 담당자 확인은 앱 로그인이 남긴 「소속·이름」을 사람(user_id)으로 풀어 맞댄다.
- **날짜 버그(2026-09-21 main 에서 고침 `3bf3141`)** — `admin-stats` 의 `isoDateInput` 이 UTC 로 읽어, 구절을 열고 저장할 때마다
  날짜가 하루씩 당겨졌다. 34~36번 구절이 금요일로 들어가 있는 까닭이 이것이다. 되돌리려면 날짜를 손으로 고쳐 저장한다.
- ⚠️ **담당자 암호를 관리자 암호와 같게 넣지 말 것** — 서버(`staffRoleError`)는 **관리자 암호를 먼저** 통과시킨다. 같게 넣으면
  담당자가 관리자가 된다(삭제·알림·통계, 그리고 세 앱 공용 관리자 암호). 2026-09-30 운영에 처음 넣을 때 실제로 같게 들어가
  `supabase secrets list` 의 **지문(digest)이 같은 것**으로 찾았다. 값은 못 보지만 지문이 같으면 값이 같다 — 비밀값을 넣은 뒤엔 지문을 대조한다.
  (지금 `CONTENT_STAFF_SECRET` 은 사역 암호 `MINISTRY_SECRET` 과 같은 값 — 친구 결정으로 그대로 둔다. 역할별 등록 명단이 따로 막는다.)
- **찬양 함수는 담당자 확인 코드를 복사하지 않는다** — `praise` 가 `api` 의 `staffVerify` 에 묻는다(코드 두 벌 금지).
  `admin-praise.html` 은 담당자 암호를 `admin-pw` 에 넣지 않는다(넣으면 허브·다른 도구가 줄줄이 실패). `praise-config.js`·`praise-api.js` 의
  캐시태그는 `bump.py` 가 안 올린다 — 손으로.

## 운영 반영 기록 (2026-09-30)

운영 SQL `sermon_jobs.sql`·`verse_images.sql`(⚠️ `dev-sermons-tables.sql` 은 운영에 돌리지 않는다) → gocheok-sermons main `17ab19f` →
운영 `api`(배포 전 운영 = main 0줄 차 · 올린 뒤 내려받아 worktree 와 0줄 차 · 구절 39·순위·사역 담당자 3명 전후 같음) →
운영 `praise`(praise-songs main `13d903b`) → 화면 main `7f148b5`(v3.499) → 텔레그램 시험(`job_id=999999` · 도착 확인).
진행 원장: `C:\Projects\bm-sermon-staff\.superpowers\sdd\progress.md`.

⚠️ 운영 SQL·함수 배포는 자동 모드가 막는다 — 친구가 `Bash(supabase:*)` 를 허용했고, **명령이 `supabase` 로 시작해야** 그 규칙에 맞는다.

## 남은 것

1. 담당자 등록(허브 → 설교·찬양 관리 → 🔑 설교·찬양 담당자) — 담당자는 그 PC 에서 앱에 먼저 로그인
2. **친구가 운영에서 한 편을 끝까지**(예: 암송구절 없는 새벽기도) — 저장·챗봇 색인·커밋·`pull --rebase`·Pages 배포·`job-verify` 는
   개발 시험에서 한 번도 안 돌았다. 사이트·3분 음성·챗봇(「내게 주시는 말씀」)에서 확인한 뒤 담당자 첫 실전
3. 실제 유튜브 「스크립트 표시」에서 복사한 글 한 편을 `tests/sermon-text.test.cjs` 표본으로
4. 첫 실전이 성공한 뒤 옛 길 치우기 — gocheok-sermons `add-sermon.yml` · `sermon` 함수의 `addByUrl` · 개발 `GH_DISPATCH_REF`

## 개발 시험 순서(Phase A, 계획 Task 13 요약)

개발 DB(`ktpwthwqzgcqcrmsafdo`)에 `dev-sermons-tables.sql` → `sermon_jobs.sql` · 개발 비밀값 `CONTENT_STAFF_SECRET`·`GH_DISPATCH_TOKEN`·
`GH_DISPATCH_REF`(가지) · gocheok-sermons 비밀값 `DEV_SERMON_ADMIN`·`TELEGRAM_*` → localhost 에서 담당자로 ① → ② → 가지의 워크플로가 돈다.
권한 스모크 `tests/sermon-staff-smoke.py`(개발 전용 · 암호는 환경 변수로만).
