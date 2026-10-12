---
name: release
description: 성경암송 앱(gocheok.onlybible.kr) 화면을 고친 뒤 운영에 내보내고 배포를 확인한다 — bump → preflight → 경로 지정 커밋 → 푸시 → Actions 대기 → 「이번 판에만 있는 표식」 확인. "배포해줘", "올려줘", "푸시해줘", "bump 하고 올려", "릴리스" 같은 요청이나, app.js·style.css·index.html·js/*.js 를 고친 작업을 마무리할 때 사용. Edge Function(api) 배포는 이 스킬이 아니라 tools/deploy-fn.py.
---

# 화면 배포 (release)

> 이 저장소는 **푸시 = 배포**다. 아래 차례는 2026-08~10 에 한 번씩 사고를 내고 생긴 것이다 — 건너뛰지 말 것.
> 문서·도구만 바꾼 커밋(사이트로 안 나가는 것 — `python tools/site.py` 로 확인)은 ①을 건너뛰고 ②부터.

## 0. 먼저 볼 것
- `git fetch origin` → `git status -sb` — 내 main 이 origin/main 보다 **뒤처졌으면** 먼저 맞춘다(남의 커밋 위에 올린다).
- `git status -s` — **남의 변경**(내가 안 고친 파일)이 보이면 그 파일은 담지 않는다. 공유 체크아웃이다.
- 같은 파일을 남도 고치는 중이면(`app.js`·`style.css`·`index.html`) `git apply --cached` 로 **내 헝크만** 담는다.

## ① 판 올리기 — 화면 파일을 고쳤을 때만
```bash
python tools/bump.py
```
`?v=` 캐시 태그 · 스플래시 판 번호 · `APP_BUILD` 가 함께 오른다. **손으로 고치지 말 것.**
bump 가 바꾼 파일(`index.html`·`app.js`·`admin*.html` 등)의 diff 가 **태그·판 번호 줄뿐인지** 본다:
```bash
git diff -U0 -- index.html app.js admin.html | grep '^[-+]' | grep -v '^+++\|^---'
```

## ② 점검
```bash
python tools/preflight.py      # 「모두 통과 — 배포해도 된다」가 나와야 한다
```
걸리면 고친 뒤 다시. ⚠️ 깨진 채 푸시하면 **다른 세션의 배포까지 막힌다**(2026-10-04~05 다섯 번).

## ③ 커밋 — 경로를 못 박는다
```bash
git add -- <내가 고친 파일들>          # git add -A · git add . 금지
git diff --cached --stat               # 남의 파일이 없는지
git commit -m "..."                    # 메시지 끝에 Co-Authored-By 줄
git show --stat HEAD                   # 들어간 것 다시 확인
```
기능 커밋과 bump 커밋은 나눠도 되고 합쳐도 된다. bump 는 **PR 에 넣지 않는다**(협업자 PR 은 머지한 뒤 한 번).

## ④ 푸시와 배포 대기
```bash
git fetch -q origin && git log --oneline HEAD..origin/main   # 그사이 남이 올렸으면 먼저 합친다
git push origin main
ID=$(gh run list --branch main --limit 1 --json databaseId -q '.[0].databaseId')
gh run watch "$ID" --exit-status --interval 15
```

## ⑤ 배포 확인 — 「이번 판에만 있는 표식」
```bash
V=$(grep -o 'app.js?v=[0-9a-z]*' index.html | head -1 | cut -d= -f2)
curl -s "https://gocheok.onlybible.kr/app.js?v=$V" | grep -o 'APP_BUILD = "[0-9a-z]*"'   # = $V 이어야 한다
```
그리고 **이번에 새로 넣은 것**(새 함수 이름·새 문구)이 라이브에 있는지, 지운 것이 **사라졌는지** `curl … | grep` 으로 본다.
⚠️ 이전 판에도 있던 이름으로 확인하면 CDN 이 옛 파일을 줘도 통과한다(2026-08-25 두 번 오인).

## ⑥ 친구에게 보고
- 올린 커밋 범위(`옛..새`) · 판(`v3.xxx` · 태그) · ⑤의 결과.
- 실기기에서 볼 것이 있으면 목록으로(예: 시험 참여자 폰 · 아이폰 앱 · 알림 눌러 들어오기).
- 문이 닫힌 기능이면 「성도님께는 아직 안 보인다」를 함께.

## 하지 않는 것
- Edge Function 은 `python tools/deploy-fn.py api --dev|--prod`(배포 가드) — `supabase functions deploy` 직접 금지.
- SQL 은 개발 먼저 · SQL Editor 손 적용 — 이 스킬 밖.
- 자동 권한 검사가 커밋·푸시를 막으면 우회하지 말고 친구에게 알린다.
