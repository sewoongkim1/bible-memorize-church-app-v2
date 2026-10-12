---
name: fn-deploy
description: 성경암송 Edge Function(api·mcp)을 배포 가드 `tools/deploy-fn.py` 로 개발 → localhost·스모크 → 운영 → 운영 스모크 차례로 올린다. "api 배포해줘", "함수 올려줘", "Edge Function 배포", "서버 고친 것 운영에", "supabase functions deploy" 같은 요청이나, `supabase/functions/` 를 고친 작업을 마무리할 때 사용. 화면(app.js·style.css) 배포는 이 스킬이 아니라 release.
---

# Edge Function 배포 (fn-deploy)

> 원본 규칙은 `docs/notes/backend-api.md` 「배포 가드」 — 다르면 그 문서와 `tools/deploy-fn.py` 가 맞다.
> **`supabase functions deploy` 를 손으로 치지 않는다.** 가드에 걸리면 걸린 까닭을 고친다.

## 0. 먼저 볼 것 — 어느 나무를 올리나
- 가드는 **스크립트가 있는 저장소 뿌리**(`tools/` 의 위)를 올린다. worktree 에서 돌리면 그 worktree 가 올라간다.
  **왜:** `supabase functions deploy` 는 git 이 아니라 작업 트리 파일을 통째로 올린다 — 2026-09-23 스크래치 사본에서 `cd` 하고 올렸는데
  공유 체크아웃의 남의 미완성 `index.ts` 가 개발에 나갔다.
- `git fetch origin` → `git status -sb`. 가지가 origin/main 보다 **뒤처졌으면** `git merge origin/main` 부터.
  **왜:** 낡은 나무로 올리면 남이 main 에 넣은 액션(봉사 당번 일곱·교육)이 **오류 없이 사라진다** — 가을 이벤트 `perDay` 가 조용히 1 로 돌아간 일이 그것이다.
- 고친 것은 **커밋까지** 해 둔다 — 커밋 안 된 변경·추적 안 된 파일이 함수 경로(`supabase/functions/<이름>/` + 상대 import 한 `_shared` 류)에 있으면 개발에서도 막힌다.
- 새 표·새 칸을 읽는 코드면 **SQL 이 먼저**다 → 스킬 `sql-migrate`.
  **왜:** 2026-09-10 `verses.track` 을 읽는 코드가 SQL 없이 남의 배포에 실려 나가 `getVerses` 가 통째로 실패했다.

## ① 개발에 올린다
```bash
python tools/deploy-fn.py api --dev                  # main 과 같은 판
python tools/deploy-fn.py api --dev --allow-ahead    # main 에 아직 없는 내 가지를 시험할 때
python tools/deploy-fn.py api --dev --dry-run        # 검사만(배포 명령은 찍기만)
```
- 걸리면 종료코드 1 — 「막음」 줄을 읽는다. `case "…"` 액션이 **빠진다**고 나오면 낡은 나무다(0의 `git merge origin/main`).
- 이름은 `api` 또는 `mcp`(`supabase/functions/` 의 폴더). `mcp` 에는 스모크가 없다 — 고친 동작을 한 번 직접 불러 확인.

## ② localhost 와 개발 스모크
- `python -m http.server <8000 아닌 포트>` 로 띄워 화면으로 확인 — 오른쪽 위 **「개발 DB」 띠**가 떠야 개발이다(스킬 `screen-check`).
- 스모크는 **기본이 개발**이다. 고친 기능에 맞는 것을 고른다:
```bash
bash tests/duty-smoke.sh
bash tests/edu-smoke.sh
bash tests/event-smoke.sh
bash tests/board-report-smoke.sh
bash tests/store-review-smoke.sh
```
  `psalm-smoke.sh`·`song-smoke.sh`·`feature-log-smoke.sh`·`push-evening-smoke.sh` 는 공개 키를 환경 변수로 받는다(`DEV_ANON=…` — `js/config.js` 의 공개 값).
  `ministry-history-smoke.sh`·`sermon-staff-smoke.py`·`life-pin-smoke.py` 는 **개발 전용**이다 — 머리 주석의 준비물을 먼저 본다.
- 이번에 더한 액션은 한 번 직접 불러 **이번 판에만 있는 표식**(새 액션 이름·새 칸)이 오는지 본다.

## ③ main 에 넣는다
가지에서 시험했으면 PR 머지(또는 친구의 main 푸시) 뒤 `git fetch origin` · `git merge origin/main`.
**왜:** 운영은 `origin/main` 과 내용이 **같을 때만** 통과한다 — 앞선 가지를 운영에 올리면 다음 사람이 main 으로 올리는 순간 내 것이 사라진다.

## ④ 운영에 올린다
```bash
python tools/deploy-fn.py api --prod --dry-run   # 먼저 검사만
python tools/deploy-fn.py api --prod             # 플래그가 곧 확인이다(입력 확인 없음)
```
운영 ref `xnomlgydifiqiybervtf` · 개발 ref `ktpwthwqzgcqcrmsafdo` — 스크립트가 크게 찍는다. 다르면 멈춘다.

## ⑤ 운영 스모크
```bash
EVT_ENV=prod bash tests/duty-smoke.sh
EVT_ENV=prod bash tests/edu-smoke.sh
EVT_ENV=prod EXPECT_PER_DAY=3 bash tests/event-smoke.sh
```
⚠️ **`EVT_ENV=prod` 를 빼면 개발을 본다** — 개발은 이미 새 값이라 운영이 옛 값으로 돌아가 있어도 통과한다.
⚠️ 스모크마다 운영 스위치 이름이 **다르다**: `PSALM_ENV=prod PROD_ANON=…` · `BR_ENV=prod` · `SR_ENV=prod` · `SONG_ENV=prod PROD_ANON=…` ·
`FL_ENV=prod PROD_ANON=…` · `PE_ENV=prod PROD_ANON=…`. 각 파일 머리 주석을 보고 쓴다.
관리자 비번이 필요한 `tests/smoke-readonly.sh`(운영 전용 13개)는 비번을 `.env` 의 `PROD_ADMIN_SECRET` 에서 **그 명령 안에서만** 읽는다 — 값을 찍지 않는다.
- 내 기능만 보지 말고 **남의 경로도 한 번**(`getVerses`·`ranking`) — 함께 실려 나간 남의 코드가 깨졌는지는 내 스모크로 안 보인다.

## ⑥ 친구에게 보고
올린 커밋(`git rev-parse --short HEAD`) · 개발·운영 각각 통과한 스모크와 수 · 새로 더한/뺀 액션 이름 · 화면도 고쳤으면 「화면은 release 로 따로」.

## 하지 않는 것
- 가드를 피해 `supabase functions deploy` 직접 · 얼려 둔 액션(`eventImport`·`eventSave`·`eventSetNote`)을 되살린 판 배포.
- 운영 먼저 · 스모크 없이 「배포 완료」 보고.
