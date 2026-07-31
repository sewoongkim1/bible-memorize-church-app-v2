# 홍보 포스터·영상 엔드카드 제작 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 성경암송 앱 홍보용 정적 이미지 3종(세로 포스터, 가로 포스터, 영상 엔드카드)을 HTML/CSS로 디자인하고 실제 인쇄·화면 배포가 가능한 PNG 파일로 렌더링한다.

**Architecture:** 각 산출물을 독립된 HTML 파일로 작성(디자인 토큰은 앱의 기존 브랜드 색상 재사용) → 로컬 헤드리스 Chrome으로 정확한 픽셀 크기의 PNG로 렌더링 → Read 도구로 결과물을 시각적으로 검증(잘림·겹침 없는지) → 필요시 CSS 보정 후 재렌더링. 외부 서비스는 QR코드 생성(api.qrserver.com) 한 곳만 빌드 타임에 1회 호출하고, 이후엔 base64로 내장해 완전히 오프라인으로 재현 가능하게 만든다.

**Tech Stack:** 순수 HTML/CSS(빌드 도구 없음), 헤드리스 Chrome(`--headless --screenshot`), curl(QR 생성), Read 도구(시각 검증). 이 저장소에 새 런타임 의존성을 추가하지 않는다.

## Global Constraints

- 색상 토큰(앱 style.css의 `:root`와 동일하게 유지): 네이비 `#1a3a6b`, 네이비 다크 `#0d1b3e`, 골드 `#c8a84b`, 크림 `#fdf8f0`
- 폰트: 헤딩은 세리프(`"Batang","Nanum Myeongjo",serif` — 별도 웹폰트 삽입 없이 시스템 폰트로 유사하게 재현), 본문은 `"Apple SD Gothic Neo","Malgun Gothic",sans-serif`
- 모든 산출물은 `marketing/` 디렉터리에 저장한다(신규 디렉터리)
- 렌더링은 Windows 경로 문제를 피하기 위해 반드시 `file:///$(cygpath -m <path>)` 형태의 URL을 사용한다(POSIX `/tmp/...` 경로를 그대로 file:// 에 넣으면 Chrome이 못 찾음 — 이미 확인된 함정)
- 헤드리스 Chrome은 항상 `--user-data-dir="C:\Temp\chrome-shot-profile"`로 전용 프로필을 지정한다(평소 쓰던 Chrome이 이미 열려 있으면 기본 프로필이 잠겨 있어 헤드리스 실행이 실패할 수 있음)
- QR코드는 `https://gocheok.onlybible.kr` 하나로 통일
- 각 이미지 렌더링 후 반드시 Read 도구로 열어 육안 확인한다(텍스트 잘림, 요소 겹침, 여백 붕괴가 없는지) — 문제가 있으면 CSS를 고치고 재렌더링한다

---

### Task 1: QR코드 자산 준비

**Files:**
- Create: `marketing/qr-data-uri.txt` (base64 data URI 문자열 하나만 담긴 텍스트 파일 — 이후 태스크에서 복사해 쓴다)

**Interfaces:**
- Produces: `marketing/qr-data-uri.txt`의 내용 — `data:image/png;base64,<...>` 형태의 문자열. Task 2·3·4가 이 값을 각 HTML의 `<img src="...">`에 그대로 붙여넣는다.

- [ ] **Step 1: marketing 디렉터리 생성**

Run: `mkdir -p marketing`

- [ ] **Step 2: QR코드 PNG 다운로드**

Run:
```bash
curl -s -o marketing/qr-code.png "https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=https://gocheok.onlybible.kr"
```

- [ ] **Step 3: 다운로드 확인**

Run: `file marketing/qr-code.png`
Expected: `marketing/qr-code.png: PNG image data, 300 x 300, ...` 형태 출력(1x1 픽셀 등 비정상 크기면 curl 실패이니 재시도)

- [ ] **Step 4: base64 data URI로 변환해 텍스트 파일로 저장**

Run:
```bash
echo -n "data:image/png;base64,$(base64 -w0 marketing/qr-code.png)" > marketing/qr-data-uri.txt
wc -c marketing/qr-data-uri.txt
```
Expected: 수백~수천 바이트 크기(0이면 실패)

- [ ] **Step 5: Read 도구로 원본 QR 이미지 육안 확인**

`Read` 도구로 `marketing/qr-code.png`를 열어, 정상적인 QR 패턴(모서리 3개 큰 사각형 포함)이 보이는지 확인한다.

- [ ] **Step 6: Commit**

```bash
git add marketing/qr-code.png marketing/qr-data-uri.txt
git commit -m "chore(홍보 소재): QR코드 자산 준비"
```

---

### Task 2: 세로 포스터 (게시판·인쇄용, A4 비율)

**Files:**
- Create: `marketing/poster-vertical.html`
- Create: `marketing/poster-vertical.png` (렌더 결과물, 2480×3508px = A4 @ 300dpi)

**Interfaces:**
- Consumes: `marketing/qr-data-uri.txt`의 data URI 문자열(Task 1)
- Produces: `marketing/poster-vertical.png` — 인쇄 가능한 최종 포스터 이미지

- [ ] **Step 1: QR data URI 값 읽어두기**

Run: `cat marketing/qr-data-uri.txt`

이 값을 다음 단계의 `QR_DATA_URI_HERE` 자리에 그대로 붙여넣는다(따옴표 안, `data:image/png;base64,...` 전체).

- [ ] **Step 2: `marketing/poster-vertical.html` 작성**

```html
<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin:0; padding:0; }
  body {
    width: 2480px; height: 3508px;
    background: linear-gradient(160deg, #fdf8f0 0%, #f6ecd8 100%);
    font-family: "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
    position: relative;
    overflow: hidden;
  }
  .glow {
    position: absolute; top: -300px; left: 50%; transform: translateX(-50%);
    width: 1800px; height: 1800px; border-radius: 50%;
    background: radial-gradient(circle, rgba(200,168,75,0.35) 0%, rgba(200,168,75,0) 70%);
  }
  .content {
    position: relative; z-index: 1;
    padding: 200px 180px 120px;
    display: flex; flex-direction: column; align-items: center; text-align: center;
    height: 100%;
  }
  .kicker {
    font-size: 38px; font-weight: 700; letter-spacing: 6px; color: #8a6d1f;
    text-transform: uppercase; margin-bottom: 36px;
  }
  .headline {
    font-family: "Batang", "Nanum Myeongjo", serif;
    font-size: 104px; font-weight: 700; color: #0d1b3e; line-height: 1.35;
    margin-bottom: 26px;
  }
  .verse-ref { font-size: 32px; color: #6b5a2e; margin-bottom: 64px; letter-spacing: 1px; }
  .phone {
    width: 600px; height: 1180px;
    background: #0d1b3e; border-radius: 58px; padding: 22px;
    box-shadow: 0 60px 120px rgba(13,27,62,0.35);
    margin-bottom: 64px;
  }
  .phone-screen {
    width: 100%; height: 100%; background: #fdf8f0; border-radius: 40px;
    overflow: hidden; display: flex; flex-direction: column;
  }
  .phone-header { background: linear-gradient(135deg, #0d1b3e, #1a3a6b); padding: 36px 30px 26px; text-align: center; }
  .phone-header .app-name { color: #fff; font-size: 25px; font-weight: 700; }
  .phone-body { flex:1; padding: 44px 38px; display:flex; flex-direction:column; gap:24px; }
  .verse-line { font-size: 28px; line-height: 1.8; color: #0d1b3e; text-align:left; }
  .blank { display:inline-block; border-bottom: 3px solid #c8a84b; width: 120px; height: 32px; margin: 0 6px -6px; }
  .heart-row { margin-top: auto; background:#fffaf0; border:2px solid #c8a84b; border-radius:18px; padding:22px; display:flex; align-items:center; gap:14px; }
  .crown { font-size: 36px; }
  .heart-text { font-size:22px; font-weight:700; color:#6b4e14; }
  .invite { font-size: 44px; color: #1a3a6b; font-weight: 700; margin-bottom: 48px; }
  .stats { display:flex; gap:22px; margin-bottom: 64px; }
  .stat-chip { background: #fff; border: 2px solid #ead9b0; border-radius: 16px; padding: 18px 34px; font-size: 28px; color: #1a3a6b; font-weight:700; }
  .footer { margin-top: auto; display:flex; flex-direction:column; align-items:center; gap:28px; }
  .cta { font-size: 42px; font-weight:800; color:#0d1b3e; font-family:"Nanum Myeongjo",serif; }
  .qr-wrap { background:#fff; padding:22px; border-radius:18px; box-shadow:0 10px 30px rgba(0,0,0,0.08); }
  .qr-wrap img { width: 210px; height:210px; display:block; }
  .url { font-size: 28px; color:#6b5a2e; letter-spacing:1px; }
</style>
</head>
<body>
  <div class="glow"></div>
  <div class="content">
    <div class="kicker">고척교회 성경말씀 암송</div>
    <div class="headline">주의 말씀은<br>내 발에 등이요</div>
    <div class="verse-ref">내 길에 빛이니이다 — 시편 119편 105절</div>

    <div class="phone">
      <div class="phone-screen">
        <div class="phone-header"><div class="app-name">📖 성경말씀 암송</div></div>
        <div class="phone-body">
          <div class="verse-line">주의 말씀은 내 <span class="blank"></span>에<br>등이요 내 <span class="blank"></span>에<br>빛이니이다</div>
          <div class="heart-row">
            <div class="crown">👑</div>
            <div class="heart-text">이 말씀을 내 마음에 두었나이다</div>
          </div>
        </div>
      </div>
    </div>

    <div class="invite">매주 한 구절, 함께 외워요</div>
    <div class="stats">
      <div class="stat-chip">71명 참여</div>
      <div class="stat-chip">누적 암송 5,000+회</div>
    </div>

    <div class="footer">
      <div class="cta">오늘부터, 함께해요</div>
      <div class="qr-wrap"><img src="QR_DATA_URI_HERE" /></div>
      <div class="url">gocheok.onlybible.kr</div>
    </div>
  </div>
</body>
</html>
```

`QR_DATA_URI_HERE` 부분을 Step 1에서 읽은 실제 data URI 값으로 치환해서 저장한다.

- [ ] **Step 3: 헤드리스 Chrome으로 PNG 렌더링**

Run:
```bash
"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless --disable-gpu \
  --user-data-dir="C:\Temp\chrome-shot-profile" \
  --screenshot="C:\Projects\bible-memorize-church-app-v2\marketing\poster-vertical.png" \
  --window-size=2480,3508 \
  "file:///$(cygpath -m marketing/poster-vertical.html)"
```
Expected: `N bytes written to file ...poster-vertical.png` 출력, 종료 코드 0

- [ ] **Step 4: 파일 생성 확인**

Run: `file marketing/poster-vertical.png`
Expected: `PNG image data, 2480 x 3508, ...`

- [ ] **Step 5: Read 도구로 육안 검증**

`Read` 도구로 `marketing/poster-vertical.png`를 연다. 아래를 확인한다:
- 헤드라인·태그라인·폰목업·초대문구·통계 배지·CTA·QR·URL이 전부 잘리지 않고 보이는지
- 폰목업 안 텍스트가 겹치거나 박스 밖으로 넘치지 않는지
- 상단과 하단 여백이 비대칭적으로 붕괴돼 있지 않은지

문제가 있으면(예: 아래쪽 요소가 잘림) `.content`의 `padding`이나 각 블록의 `margin-bottom` 값을 줄여 CSS를 수정하고, Step 3부터 다시 실행한다. 정상이면 다음 단계로.

- [ ] **Step 6: Commit**

```bash
git add marketing/poster-vertical.html marketing/poster-vertical.png
git commit -m "feat(홍보 소재): 세로 포스터(게시판·인쇄용) 제작"
```

---

### Task 3: 가로 포스터 (주일 광고 화면용, 16:9)

**Files:**
- Create: `marketing/poster-horizontal.html`
- Create: `marketing/poster-horizontal.png` (1920×1080px)

**Interfaces:**
- Consumes: `marketing/qr-data-uri.txt`의 data URI 문자열(Task 1)
- Produces: `marketing/poster-horizontal.png`

- [ ] **Step 1: `marketing/poster-horizontal.html` 작성**

```html
<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  body { width:1920px; height:1080px; background:linear-gradient(135deg,#fdf8f0,#f6ecd8); font-family:"Apple SD Gothic Neo","Malgun Gothic",sans-serif; position:relative; overflow:hidden; }
  .glow { position:absolute; top:-400px; right:-200px; width:1200px; height:1200px; border-radius:50%; background:radial-gradient(circle, rgba(200,168,75,0.3) 0%, rgba(200,168,75,0) 70%); }
  .wrap { position:relative; z-index:1; display:flex; align-items:center; height:100%; padding:0 100px; gap:80px; }
  .left { flex:1.15; }
  .kicker { font-size:26px; font-weight:700; letter-spacing:4px; color:#8a6d1f; text-transform:uppercase; margin-bottom:22px; }
  .headline { font-family:"Batang","Nanum Myeongjo",serif; font-size:70px; font-weight:700; color:#0d1b3e; line-height:1.3; margin-bottom:18px; }
  .verse-ref { font-size:23px; color:#6b5a2e; margin-bottom:44px; }
  .invite { font-size:31px; color:#1a3a6b; font-weight:700; margin-bottom:34px; }
  .stats { display:flex; gap:16px; margin-bottom:44px; }
  .stat-chip { background:#fff; border:2px solid #ead9b0; border-radius:14px; padding:14px 26px; font-size:21px; color:#1a3a6b; font-weight:700; }
  .footer-row { display:flex; align-items:center; gap:26px; }
  .cta { font-size:30px; font-weight:800; color:#0d1b3e; font-family:"Nanum Myeongjo",serif; }
  .qr-wrap { background:#fff; padding:13px; border-radius:14px; box-shadow:0 8px 24px rgba(0,0,0,0.08); }
  .qr-wrap img { width:104px; height:104px; display:block; }
  .url { font-size:19px; color:#6b5a2e; }
  .right { flex:0.85; display:flex; justify-content:center; }
  .phone { width:400px; height:820px; background:#0d1b3e; border-radius:42px; padding:16px; box-shadow:0 50px 100px rgba(13,27,62,0.35); }
  .phone-screen { width:100%; height:100%; background:#fdf8f0; border-radius:28px; overflow:hidden; display:flex; flex-direction:column; }
  .phone-header { background:linear-gradient(135deg,#0d1b3e,#1a3a6b); padding:26px 20px 18px; text-align:center; }
  .phone-header .app-name { color:#fff; font-size:18px; font-weight:700; }
  .phone-body { flex:1; padding:32px 24px; display:flex; flex-direction:column; gap:18px; }
  .verse-line { font-size:20px; line-height:1.75; color:#0d1b3e; text-align:left; }
  .blank { display:inline-block; border-bottom:2px solid #c8a84b; width:84px; height:22px; margin:0 4px -4px; }
  .heart-row { margin-top:auto; background:#fffaf0; border:2px solid #c8a84b; border-radius:16px; padding:16px; display:flex; align-items:center; gap:12px; }
  .crown { font-size:26px; }
  .heart-text { font-size:16px; font-weight:700; color:#6b4e14; }
</style>
</head>
<body>
  <div class="glow"></div>
  <div class="wrap">
    <div class="left">
      <div class="kicker">고척교회 성경말씀 암송</div>
      <div class="headline">주의 말씀은<br>내 발에 등이요</div>
      <div class="verse-ref">내 길에 빛이니이다 — 시편 119편 105절</div>
      <div class="invite">매주 한 구절, 함께 외워요</div>
      <div class="stats">
        <div class="stat-chip">71명 참여</div>
        <div class="stat-chip">누적 암송 5,000+회</div>
      </div>
      <div class="footer-row">
        <div class="cta">오늘부터, 함께해요</div>
        <div class="qr-wrap"><img src="QR_DATA_URI_HERE"/></div>
        <div class="url">gocheok.onlybible.kr</div>
      </div>
    </div>
    <div class="right">
      <div class="phone">
        <div class="phone-screen">
          <div class="phone-header"><div class="app-name">📖 성경말씀 암송</div></div>
          <div class="phone-body">
            <div class="verse-line">주의 말씀은 내 <span class="blank"></span>에<br>등이요 내 <span class="blank"></span>에<br>빛이니이다</div>
            <div class="heart-row"><div class="crown">👑</div><div class="heart-text">이 말씀을 내 마음에 두었나이다</div></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>
```

`QR_DATA_URI_HERE`를 Task 1에서 만든 실제 data URI로 치환한다.

- [ ] **Step 2: 헤드리스 Chrome으로 PNG 렌더링**

Run:
```bash
"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless --disable-gpu \
  --user-data-dir="C:\Temp\chrome-shot-profile" \
  --screenshot="C:\Projects\bible-memorize-church-app-v2\marketing\poster-horizontal.png" \
  --window-size=1920,1080 \
  "file:///$(cygpath -m marketing/poster-horizontal.html)"
```

- [ ] **Step 3: 파일 생성 확인**

Run: `file marketing/poster-horizontal.png`
Expected: `PNG image data, 1920 x 1080, ...`

- [ ] **Step 4: Read 도구로 육안 검증**

`Read`로 `marketing/poster-horizontal.png`를 열어, 좌측 텍스트 블록과 우측 폰목업이 겹치지 않는지, 하단 CTA·QR·URL 한 줄이 잘리지 않는지 확인한다. 문제가 있으면 `.left`/`.right`의 `flex` 비율이나 각 폰트 크기를 조정 후 Step 2부터 재실행한다.

- [ ] **Step 5: Commit**

```bash
git add marketing/poster-horizontal.html marketing/poster-horizontal.png
git commit -m "feat(홍보 소재): 가로 포스터(주일 광고 화면용) 제작"
```

---

### Task 4: 영상 엔드카드 (세로 9:16)

**Files:**
- Create: `marketing/video-endcard.html`
- Create: `marketing/video-endcard.png` (1080×1920px — 스펙 문서의 세로 영상 포맷과 동일 비율)

**Interfaces:**
- Consumes: `marketing/qr-data-uri.txt`의 data URI 문자열(Task 1)
- Produces: `marketing/video-endcard.png` — 영상 8번 장면(52–60초)에 8초간 고정해 쓸 정적 이미지

- [ ] **Step 1: `marketing/video-endcard.html` 작성**

```html
<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  body {
    width:1080px; height:1920px;
    background: linear-gradient(160deg,#0d1b3e,#1a3a6b 60%,#0d4a7a);
    font-family:"Apple SD Gothic Neo","Malgun Gothic",sans-serif;
    position: relative;
    display:flex; flex-direction:column; align-items:center; justify-content:center; gap:52px;
  }
  .glow {
    position:absolute; top:32%; left:50%; transform:translate(-50%,-50%);
    width:900px; height:900px; border-radius:50%;
    background:radial-gradient(circle, rgba(200,168,75,0.28) 0%, rgba(200,168,75,0) 70%);
  }
  .mark { font-size:64px; z-index:1; }
  .title { font-family:"Batang","Nanum Myeongjo",serif; font-size:62px; font-weight:700; color:#fff; text-align:center; line-height:1.4; z-index:1; }
  .cta { font-size:36px; font-weight:800; color:#f0dca0; z-index:1; }
  .qr-wrap { background:#fff; padding:24px; border-radius:20px; z-index:1; }
  .qr-wrap img { width:240px; height:240px; display:block; }
  .url { font-size:32px; color:#cdd9f2; letter-spacing:1px; z-index:1; }
</style>
</head>
<body>
  <div class="glow"></div>
  <div class="mark">📖</div>
  <div class="title">고척교회<br>성경말씀 암송</div>
  <div class="cta">오늘부터, 함께해요</div>
  <div class="qr-wrap"><img src="QR_DATA_URI_HERE"/></div>
  <div class="url">gocheok.onlybible.kr</div>
</body>
</html>
```

`QR_DATA_URI_HERE`를 실제 data URI로 치환한다.

- [ ] **Step 2: 헤드리스 Chrome으로 PNG 렌더링**

Run:
```bash
"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless --disable-gpu \
  --user-data-dir="C:\Temp\chrome-shot-profile" \
  --screenshot="C:\Projects\bible-memorize-church-app-v2\marketing\video-endcard.png" \
  --window-size=1080,1920 \
  "file:///$(cygpath -m marketing/video-endcard.html)"
```

- [ ] **Step 3: 파일 생성 확인**

Run: `file marketing/video-endcard.png`
Expected: `PNG image data, 1080 x 1920, ...`

- [ ] **Step 4: Read 도구로 육안 검증**

`Read`로 `marketing/video-endcard.png`를 열어, 세로 중앙 정렬이 자연스러운지, 글자·QR·URL이 화면 안에 다 들어오는지 확인한다. 문제 있으면 `gap` 값을 조정 후 재렌더링한다.

- [ ] **Step 5: Commit**

```bash
git add marketing/video-endcard.html marketing/video-endcard.png
git commit -m "feat(홍보 소재): 영상 엔드카드 제작"
```

---

### Task 5: 산출물 정리 및 스펙 문서 업데이트

**Files:**
- Modify: `docs/superpowers/specs/2026-07-31-promo-poster-video-design.md`

**Interfaces:**
- Consumes: Task 2·3·4에서 만든 3개 PNG 파일 경로

- [ ] **Step 1: 스펙 문서에 산출물 경로 추가**

`docs/superpowers/specs/2026-07-31-promo-poster-video-design.md`의 "제작 순서" 섹션 끝에 아래 표를 추가한다:

```markdown
## 완성된 정적 산출물

| 파일 | 용도 | 크기 |
|---|---|---|
| `marketing/poster-vertical.png` | 게시판·인쇄용 세로 포스터 | 2480×3508 (A4 @300dpi) |
| `marketing/poster-horizontal.png` | 주일 광고 화면용 가로 포스터 | 1920×1080 |
| `marketing/video-endcard.png` | 홍보 영상 8번 장면(엔드카드) | 1080×1920 |

나머지(Higgsfield AI 장면 5개, 실제 앱 화면 녹화 4개, 영상 편집)는 위 "영상 스토리보드"·"준비물" 섹션 가이드대로 직접 진행.
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-07-31-promo-poster-video-design.md
git commit -m "docs(홍보 기획): 완성된 정적 산출물 경로 스펙에 반영"
```
