---
name: screen-check
description: 성경암송 앱 화면을 localhost(= 개발 DB)에 띄워 확인하고, 여러 화면에 걸친 CSS·레이아웃이면 tools/screen-sweep.py 로 39화면 × 8조건을 잰다 — 8000 아닌 포트 · 「개발 DB」 띠 확인 · 헤드리스 캡처 함정 · 끝나면 내가 띄운 PID 만 끈다. "화면 확인해줘", "localhost 로 띄워", "스크린샷 찍어 봐", "화면 점검", "screen-sweep 돌려", "레이아웃 깨졌는지 봐줘", "어두운 모드·큰 글씨에서 봐줘" 같은 요청이나, 화면을 고친 뒤 release 전에 사용.
---

# 화면 확인 (screen-check)

> localhost 는 **저절로 개발 DB** 를 본다(`js/config.js` — `gocheok.onlybible.kr` 만 운영, 그 밖은 모두 개발). 운영 화면으로 시험하지 않는다.
> 상세와 ⚠️ 함정 원문은 `docs/notes/capture-tools.md` — 찍거나 재는 스크립트를 쓰기 전에 읽는다.

## ① 서버를 띄운다 — 8000 이 아닌 포트, PID 를 받아 둔다
같은 PC 의 다른 세션들이 `localhost:8000` 을 쓴다. 겹치면 **남의 나무**(다른 가지·다른 판)를 보고 판단하게 된다.
```powershell
$p = Start-Process -FilePath python -ArgumentList '-m','http.server','8123','--bind','127.0.0.1' `
     -WorkingDirectory '<내 worktree>' -PassThru -WindowStyle Hidden
$p.Id      # 이 번호를 적어 둔다 — 끌 때 이것만 끈다
```
(Bash 라면 `run_in_background` 로 띄우고 `$!` 를 파일에 적어 둔다.) 포트가 이미 쓰이면 다른 번호로.

## ② 「개발 DB」 띠부터 본다
`http://127.0.0.1:8123/` — 화면 **오른쪽 위에 「개발 DB」 띠**(`#dev-env-mark`)가 떠야 한다. 안 보이면 운영을 보고 있는 것이다 → 멈춘다.
- 개발 DB 에는 가짜 사람만 있다 — 목록이 비어 보여도 고장이 아니다.
- 문 달린 기능은 미리보기 주소(`?psalm=1`·`?song=1`)나 개발 `ministryTesters` 에 넣은 시험 계정으로(스킬 `gated-feature`).
- 캐시가 옛 파일을 주면 `?v=` 가 아니라 서비스워커 탓일 수 있다 — 새 시크릿 창으로.

## ③ 여러 화면에 걸친 CSS·레이아웃이면 — `tools/screen-sweep.py`
```bash
python tools/screen-sweep.py --port 8766                         # 전부(8조건 × 39화면 · 8분 남짓)
python tools/screen-sweep.py --port 8766 --runs app-390,pwa-390   # 조건만
python tools/screen-sweep.py --port 8766 --steps 24-psalm-home
python tools/screen-sweep.py --site <고치기 전 판 폴더> --out tmp/sweep-old --port 8767
python tools/screen-sweep.py --seed --compare tmp/sweep-old/results.json --port 8766
```
- 도구가 **제 서버를 스스로 띄우고 끈다**(기본 8765). 다른 세션이 같은 포트로 돌리는 중이면 그 서버에 붙으니 `--port` 를 바꾼다.
- 재는 것: JS 오류·요청 실패·가로 넘침과 범인·깨진 그림·undefined/NaN·아이폰 안전 영역(상태바·홈 막대). 조건: 폭 320/390/430 · 글씨 크게/아주 크게 · 어두운 모드 · 아이폰 앱 · 홈 화면 웹앱.
- 준비물 pip `playwright`(설치된 크롬 `channel="chrome"`). 개발 DB 에 시험 회원 「화면점검」(믿음-99)이 생긴다.
- 결과 `tmp/screen-sweep/results.json` + 사진 — `tmp/` 는 git 무시. 커밋하지 않는다.
- ⚠️ **app 모드의 위쪽 「(fits)」 경고는 실기기로 한 번 보고 믿는다** — 🔒 관리 페이지에서 도구는 「깔림」이라 했는데 실기기는 멀쩡했다(2026-09-20).

## ④ 헤드리스 크롬으로 직접 찍을 때의 함정
- **뷰포트가 526px 로 고정**된다(`--window-size` 무관) — 430px 로 찍으면 잘린 그림이 넘친 것처럼 보인다. 폭 고정 `div` 여러 개를 한 장에 늘어놓아 찍는다.
- `--dump-dom` 은 이 PC 에서 **통째로 빈 출력** — `--screenshot` 으로 찍어 PNG 를 읽는다.
- `?go=` 캡처 JS 에 `+ < # %` 백틱을 쓰지 않는다 — 조용히 깨진다(2026-09-03 네 번).
- `--virtual-time-budget` 은 CSS 트랜지션을 안 돌린다 — 픽셀 높이가 아니라 클래스·aria 값으로 판단.
- 스크롤한 뒤엔 `position:fixed` 가 사진에 안 찍힌다 — 숫자(`getBoundingClientRect`)로 잰다.
- 하네스 HTML 은 스크래치에. 저장소 안에 만들었으면 커밋 전에 지운다.

## ⑤ 끝나면 — 내가 띄운 것만 끈다
```powershell
Stop-Process -Id <①에서 받은 번호>
```
헤드리스 크롬은 내 `--user-data-dir`(스크래치)이 명령줄에 든 것만.
**왜:** 2026-09-30 「http.server 8000」 명령줄 패턴으로 껐더니 세 개가 꺼졌고 내 것은 하나였다 — 다른 세션의 서버를 끊었다.

## ⑥ 보고
본 화면·조건 · 「개발 DB」 띠를 확인했다는 것 · sweep 요약(새로 생긴 경고만) · 실기기로 볼 것이 남았으면 목록으로.
