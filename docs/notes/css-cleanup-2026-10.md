# style.css 쓰이지 않는 규칙 걷기 (2026-10)

> **언제 읽나:** 걷어 낸 모양을 되살려야 할 때 · 같은 정리를 다시 할 때.
> 기준 판: `origin/main` `d26cc09`(2026-10-12)의 `style.css` — 아래 **줄 번호는 그 판 기준**이다.

## 무엇을 했나

- 통째로 지운 규칙 **178개** + 선택자 목록에서 뺀 선택자 **32개**(규칙 23개 안). 그 규칙만 설명하던 주석 17개도 함께 지웠다(아래 원문에 있다).
- 남은 규칙은 **글자 하나 안 바뀌었다** — 다시 읽어 「남은 선택자 × 선언」 2,735개가 앞뒤 같고 **차례도 같다**(캐스케이드가 그대로)는 것을 기계로 대조했다.
- 크기(사이트에 나가는 LF 기준): **366,069 → 347,697 바이트**(−18,372 · −5.0%) · gzip **95,077 → 91,268**(−3.8KB).
- 일부러 남긴 것: `.ext-cta`(app.js 주석이 되돌릴 때 쓰라고 남긴다고 함) · 이름 조각으로 조립될 수 있는 것(`k-*`·`pr-fr-*`·`ps-fr-*`·`ps-pos-*`·`pr-pos-*` — 실제로 조립된다) · 코드 **주석**에만 이름이 남은 규칙(주석을 걷어 내고 세면 더 나오지만, JS 주석을 기계로 가르는 것이 믿을 만하지 않아 손대지 않았다).
- `@keyframes` 11개·`:root` 토큰 21개는 모두 아직 쓰여 하나도 안 지웠다.

## 어떻게 「안 쓰인다」고 정했나 (보수적으로)

1. 선택자의 클래스·id 이름이 화면 파일 어디에도 **낱말로** 없다 — 찾은 곳: `index.html`·`*.html`(admin 포함)·`app.js`·`sw.js`·`js/**/*.js`·루트 `*.json`·`guide/`·`quiz/`·`cert/`·`privacy/`·`ios-app/**/*.swift`·`android-app/**`(java·kt·xml)·`supabase/functions/**/*.ts`. **주석 안에 있어도 쓰인 것으로 쳤다**(예: `.ext-cta` 는 app.js 주석이 「되돌릴 때 쓰라고 남겨 둔다」고 해서 남겼다).
2. **조립도 없다** — 이름을 `-`·`_` 에서 끊은 앞 조각이 따옴표·`${` 앞에 나오거나(`"stat-" + kind`), 뒤 조각이 따옴표·`}` 뒤에 나오면(`x + "-done"`) 쓰인 것으로 쳤다. 이 규칙에 걸린 것 중 둘(`ev-mine-card` — 조각 `"-card"` 는 서버의 도전 모드 이름 · `min-state-m` — 조각 `"-m"` 은 마음에 둠 체크의 id 꼬리)은 손으로 확인해 죽은 것으로 쳤다.
3. `:not(...)` 안의 이름은 따지지 않았고, `:is/:where/:has` 는 괄호 밖만 봤다. 벤더 의사 선택자(`::-webkit-…`)가 든 선택자는 목록에서 빼지 않았다(목록 전체가 무효가 되는 규칙을 건드리지 않게).
4. 이름마다 `git log -S` 로 화면 코드에서 언제 사라졌는지 봤다(아래 표 「마지막 흔적」). 비어 있으면 이 저장소의 화면 코드에 **한 번도 없던** 이름 — v1 에서 CSS 만 따라온 것.
5. 화면이 같다는 증거 — `tools/screen-sweep.py`(50단계 × 8조건, 개발 DB, `--seed`)를 스크래치 사본에 세 가지를 더해 돌렸다(도구 자체는 안 고쳤다):
   - **같은 화면에서 맞바꾸기(A/B):** 단계마다 그 자리에서 옛 `style.css` 를 끄고 새 것을 **같은 자리에** 끼운 뒤(전환·애니메이션은 잠시 멈춤) 모든 요소 × (본체·`::before`·`::after`)의 **계산된 스타일 전 항목**을 비교 — **400화면·조건, 199,935칸에서 차이 0.** (시험 삼아 산 규칙 하나 `.todo-go` 이름을 바꿔 넣으면 20칸이 바로 잡혔다 — 재는 법이 눈을 뜨고 있다는 확인.) 별도 페이지 셋(`privacy/`·`quiz/`·`guide/`)은 `style.css` 를 안 부른다.
   - **크롬 CSS 쓰임 기록**(CDP `CSS.takeCoverageDelta`, 걷기 전 판): 쓰인 규칙 1,146개 가운데 **지운 규칙은 0개.**
   - 도구의 배치 지문(`--compare`)은 걷기 전·후 따로 돌린 두 판 사이에서 5화면이 1px 어긋났는데(기도문 4·사역 1 — 가로 1px), 같은 화면에서 맞바꾼 비교가 0이라 **개발 DB 상태·글꼴 받는 때가 다른 데서 온 흔들림**이다(시험 회원의 기록이 점검 중에 쌓여 화면 글이 바뀐다).

⚠️ 이 정리 뒤에 지운 이름을 화면 코드에 다시 쓰면 **스타일 없이** 뜬다 — 아래 원문을 되살려 쓸 것.

## 죽은 이름과 마지막 흔적

| 이름 | 화면 코드에서 마지막으로 바뀐 커밋(`git log -S`) |
|---|---|
| `.ab-sub` | de11d9c 2026-08-08 |
| `.act-sub` | c79e361 2026-09-02 |
| `.album-cta` | c79e361 2026-09-02 |
| `.album-filter` | de11d9c 2026-08-08 |
| `.board-cta` | c79e361 2026-09-02 |
| `.complete-badge` | 78d8493 2026-07-23 |
| `.complete-row` | 72e6433 2026-07-08 |
| `.edu-h` | 10486d0 2026-10-05 |
| `.entry-sub` | 1bf46ec 2026-10-03 |
| `.entry-title` | (없음 — v1 에서 따라온 CSS) |
| `.ev-mine-at` | 637091b 2026-09-13 |
| `.ev-mine-card` | 637091b 2026-09-13 |
| `.ev-mine-t` | 637091b 2026-09-13 |
| `.ev-mine-v` | 637091b 2026-09-13 |
| `.event-card-desc` | 1ce31a9 2026-08-07 |
| `.gauge-bar` | cdc0d6a 2026-07-18 |
| `.gauge-fill` | cdc0d6a 2026-07-18 |
| `.gauge-pct` | (없음 — v1 에서 따라온 CSS) |
| `.gauge-sub` | cdc0d6a 2026-07-18 |
| `.gauge-wrap` | cdc0d6a 2026-07-18 |
| `.hero-subtitle` | 10c7245 2026-07-19 |
| `.icon-share` | 8a752fd 2026-08-31 |
| `.intro-foot` | (없음 — v1 에서 따라온 CSS) |
| `.list-nav` | 367d485 2026-08-09 |
| `.min-d-none` | 7167625 2026-09-12 |
| `.min-note-t` | 7167625 2026-09-12 |
| `.min-serving` | 03758ff 2026-09-10 |
| `.min-serving-h` | 441599e 2026-09-10 |
| `.min-serving-t` | 03758ff 2026-09-10 |
| `.min-state` | f7ef507 2026-09-09 |
| `.min-state-m` | f7ef507 2026-09-09 |
| `.min-state-t` | f7ef507 2026-09-09 |
| `.nav-btn` | 9148f53 2026-09-10 |
| `.nav-record` | 367d485 2026-08-09 |
| `.nav-user` | (없음 — v1 에서 따라온 CSS) |
| `.page-title` | (없음 — v1 에서 따라온 CSS) |
| `.passages-act` | b930c82 2026-09-02 |
| `.passages-cta` | 350b1da 2026-07-24 |
| `.pg-complete-badge` | 78d8493 2026-07-23 |
| `.pg-list-sub` | 4b855e7 2026-07-23 |
| `.pg-list-title` | 4b855e7 2026-07-23 |
| `.pg-step` | 78d8493 2026-07-23 |
| `.pg-step-ic` | 78d8493 2026-07-23 |
| `.pg-step-tx` | 78d8493 2026-07-23 |
| `.pg-steps` | 78d8493 2026-07-23 |
| `.pg-steps-hint` | 78d8493 2026-07-23 |
| `.pilsa-ask` | 27de278 2026-08-11 |
| `.pilsa-cta` | c79e361 2026-09-02 |
| `.pilsa-err` | (없음 — v1 에서 따라온 CSS) |
| `.pilsa-go` | 3e82910 2026-08-11 |
| `.pilsa-me` | 3e82910 2026-08-11 |
| `.pilsa-result` | 9608742 2026-08-11 |
| `.pilsa-tab` | 9608742 2026-08-11 |
| `.pl-qty` | 27de278 2026-08-11 |
| `.pr-sub` | 9608742 2026-08-11 |
| `.praise-cta` | c79e361 2026-09-02 |
| `.ps-acc` | 99749c2 2026-09-10 |
| `.ps-acc-btn` | 99749c2 2026-09-10 |
| `.ps-caret` | 99749c2 2026-09-10 |
| `.ps-catch` | 99749c2 2026-09-10 |
| `.ps-past-day` | 99749c2 2026-09-10 |
| `.ps-past-mark` | 99749c2 2026-09-10 |
| `.ps-past-ref` | 99749c2 2026-09-10 |
| `.ps-past-row` | 99749c2 2026-09-10 |
| `.ps-progress` | 99749c2 2026-09-10 |
| `.ps-total` | ec75170 2026-09-11 |
| `.quiz-cta` | c79e361 2026-09-02 |
| `.remind-cta` | 367d485 2026-08-09 |
| `.result-actions` | (없음 — v1 에서 따라온 CSS) |
| `.result-label` | (없음 — v1 에서 따라온 CSS) |
| `.result-score` | (없음 — v1 에서 따라온 CSS) |
| `.sermon-banner` | 528891f 2026-07-16 |
| `.sermon-banner-icon` | 528891f 2026-07-16 |
| `.sermon-banner-pastor` | (없음 — v1 에서 따라온 CSS) |
| `.sermon-banner-soon` | 528891f 2026-07-16 |
| `.sermon-banner-text` | 528891f 2026-07-16 |
| `.sermon-banner-title` | 528891f 2026-07-16 |
| `.sermon-cta` | c79e361 2026-09-02 |
| `.sermon-link` | (없음 — v1 에서 따라온 CSS) |
| `.stat-box` | c4061b1 2026-09-02 |
| `.stat-grid` | c4061b1 2026-09-02 |
| `.stat-lbl` | c4061b1 2026-09-02 |
| `.stat-num` | c4061b1 2026-09-02 |
| `.summary-next` | (없음 — v1 에서 따라온 CSS) |
| `.theme-toggle` | (없음 — v1 에서 따라온 CSS) |
| `.weekly-ref` | f21e54c 2026-07-19 |


## 지운 원문 (줄 번호는 `d26cc09` 판)

### 89–92줄

```css
.hero-subtitle {
  font-size: 13px; font-weight: 500;
  color: rgba(255, 255, 255, 0.65); letter-spacing: 3px;
}
```

### 122–138줄 (주석과 함께 문단째)

```css
/* '매일 암송 구절 알림 받기' 버튼 — 요약 카드 안에서 다른 버튼과 같은 너비 */
.remind-cta {
  display: block;
  width: 100%;
  margin: 0 0 8px;
  text-align: center;
  background: #eef1f8;
  border: 1.5px solid var(--navy);
  color: var(--navy);
  font-weight: 700;
  text-decoration: none;
  padding: 12px;
  border-radius: 12px;
  font-size: .98rem;
  transition: background 0.15s, color 0.15s;
}
.remind-cta:hover { background: var(--navy); color: #fff; }
```

### 140–150줄 (주석과 함께 문단째)

```css
/* 본문 상단 제목 (가운데 정렬) */
.page-title {
  display: block;
  text-align: center;
  font-family: "Noto Sans KR", sans-serif; /* 헤더 tagline-main과 동일 폰트 */
  font-size: 12.8px;
  font-weight: 800;
  color: var(--navy);
  letter-spacing: -0.3px;
  margin-bottom: 20px;
}
```

### 749–780줄 (주석과 함께 문단째)

```css
/* 단계 위 설교 영상 링크 */
.sermon-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  background: linear-gradient(135deg, #0d1b3e 0%, #1a3a6b 100%);
  color: var(--white);
  text-decoration: none;
  padding: 12px 16px;
  border-radius: 10px;
  margin-top: 18px;
}
.sermon-banner:hover { filter: brightness(1.1); }
.sermon-banner-icon {
  flex-shrink: 0;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--gold);
  color: var(--navy-dark);
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.sermon-banner-text { display: flex; flex-direction: column; gap: 1px; line-height: 1.35; }
.sermon-banner-title { font-size: 14px; font-weight: 700; }
.sermon-banner-pastor { font-size: 11px; color: rgba(255, 255, 255, 0.7); }
/* 설교 영상 준비 중(URL 없음) — 회색 안내, 클릭 불가 */
.sermon-banner-soon { background: linear-gradient(135deg, #6b7280 0%, #8a93a5 100%); cursor: default; }
.sermon-banner-soon:hover { filter: none; }
.sermon-banner-soon .sermon-banner-icon { background: #e5e7eb; color: #6b7280; }
```

### 1183–1191줄 근처(사이의 산 규칙은 남김)

```css
.result-score {
  font-family: "Nanum Myeongjo", serif;
  font-size: 34px;
  font-weight: 800;
  color: var(--navy);
  margin-top: 20px;
}
.result-label { color: var(--gray); margin-top: 2px; }
.result-actions { margin-top: 14px; }
```

### 1206–1220줄 근처(사이의 산 규칙은 남김)

```css
.complete-badge {
  display: inline-block;
  background: var(--gold);
  color: var(--navy);
  font-weight: 800;
  font-size: 16px;
  padding: 9px 20px;
  border-radius: 24px;
  margin-bottom: 12px;
  font-family: "Nanum Myeongjo", serif;
}
.complete-row { display: flex; gap: 8px; justify-content: center; align-items: center; flex-wrap: nowrap; }
.complete-row .complete-badge { margin-bottom: 0; font-size: 14px; padding: 8px 14px; white-space: nowrap; }
.complete-row .next-btn { padding: 9px 14px; font-size: 13px; white-space: nowrap; }
```

### 1236–1244줄 근처(사이의 산 규칙은 남김)

```css
.sermon-link {
  display: block;
  margin-top: 8px;
  color: var(--navy);
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
}
.sermon-link:hover { text-decoration: underline; }
```

### 1257–1264줄 근처(사이의 산 규칙은 남김)

```css
.entry-title {
  font-family: "Nanum Myeongjo", serif; color: var(--navy);
  font-size: 1.2rem; text-align: center; margin-bottom: 6px;
}
.entry-sub {
  color: var(--gray); font-size: .8rem; text-align: center;
  line-height: 1.45; margin-bottom: 14px;
}
```

### 1370–1374줄 근처(사이의 산 규칙은 남김)

```css
.summary-icon.icon-share { background: #e8f0fb; border-color: #c3d5ef; color: var(--navy); }
.summary-icon.icon-share:hover { background: #dbe7f8; }
.dark .summary-icon.icon-share { background: #22314c; border-color: #35507a; color: #bcd2f2; }
```

### 1512–1526줄 (주석과 함께 문단째)

```css
.gauge-wrap { margin-bottom: 6px; }
.gauge-pct {
  font-size: 2.6rem; font-weight: 800; color: var(--gold);
  font-family: "Nanum Myeongjo", serif; line-height: 1;
}
.gauge-bar {
  height: 12px; background: var(--light); border-radius: 999px;
  overflow: hidden; margin: 0 0 4px;
}
.gauge-fill {
  height: 100%; background: linear-gradient(90deg, var(--gold), #e0c674);
  border-radius: 999px; transition: width .5s ease;
}
.gauge-sub { color: var(--gray); font-size: .85rem; }
.gauge-sub b { color: var(--navy); }
```

### 1569–1586줄 (주석과 함께 문단째)

```css
.stat-grid {
  display: grid; grid-template-columns: repeat(4, 1fr);
  gap: 8px; margin-bottom: 12px;
}
.stat-box {
  border-radius: 12px; padding: 8px 6px; border: 1px solid var(--border);
  background: var(--cream);
}
.stat-num { font-size: 1.5rem; font-weight: 800; color: var(--navy); }
.stat-lbl { font-size: .72rem; color: var(--gray); margin-top: 2px; }
/* 통계 4칸 색 사다리: 마음에 둠(금) → 완료(초록) → 진행중(파랑) → 미시도(회색).
   금색은 '마음에 둠'(성취) 전용 — 👑 금배지와 같은 어법. */
.stat-box.status-heart { background: #fdf3d6; border-color: #e3c777; }
.stat-box.status-heart .stat-num { color: #8a6d1f; }
.stat-box.status-done { background: #eaf5ec; border-color: #bcdfc1; }
.stat-box.status-done .stat-num { color: var(--green); }
.stat-box.status-s2 { background: #fff6e0; border-color: #ecd9a0; }
.stat-box.status-s1 { background: #f0f4fb; border-color: #c9d8ef; }
```

### 1616–1622줄

```css
.weekly-ref {
  color: var(--navy);
  font-family: "Nanum Myeongjo", serif;
  font-size: 1.15rem;
  font-weight: 800;
  line-height: 1.35;
}
```

### 1717–1721줄 (주석과 함께 문단째)

```css
.summary-next {
  font-size: .92rem; color: #444; margin-bottom: 12px;
  padding: 9px; background: var(--cream); border-radius: 10px;
}
.summary-next b { color: var(--navy); }
```

### 1786줄

```css
.summary-actions .act-sub { font-size: .82rem; font-weight: 700; opacity: .92; }
```

### 1905–1914줄 (주석과 함께 문단째)

```css
/* 고척교회 찬양 아카이브 버튼 — 은은한 금색 톤(주변 버튼과 조화) */
.summary-help.praise-cta { background: #f7efda; color: #8a6a1e; border-color: #d9b96a; }
.summary-help.praise-cta:hover { background: #d9b96a; color: #fff; }
.dark .summary-help.praise-cta { background: #2a271b; color: #d9b96a; border-color: #5a4e2a; }
.dark .summary-help.praise-cta:hover { background: #5a4e2a; color: #fff; }
/* 나의 말씀 앨범 버튼 — 보라 톤으로 구분 */
.summary-help.album-cta { background: #f2eefb; color: #5b3fa8; border-color: #5b3fa8; }
.summary-help.album-cta:hover { background: #5b3fa8; color: #fff; }
.dark .summary-help.album-cta { background: #251f39; color: #c3b0ee; border-color: #4a3d6b; }
.dark .summary-help.album-cta:hover { background: #4a3d6b; color: #fff; }
```

### 1916–1920줄 (주석과 함께 문단째)

```css
/* 성경암송 퀴즈 — quiz/ 화면의 남색·금색을 그대로 가져와 눌렀을 때 낯설지 않게. */
.summary-help.quiz-cta { background: #eaf0f9; color: #1a3a6b; border-color: #1a3a6b; }
.summary-help.quiz-cta:hover { background: #1a3a6b; color: #fff; }
.dark .summary-help.quiz-cta { background: #182739; color: #8fb3e6; border-color: #33507d; }
.dark .summary-help.quiz-cta:hover { background: #33507d; color: #fff; }
```

### 1930–1931줄 근처(사이의 산 규칙은 남김)

```css
.album-banner .ab-sub { font-size: .82rem; color: #6a7688; margin-top: 4px; }
.album-filter { margin-bottom: 10px; }
```

### 2040–2043줄 근처(사이의 산 규칙은 남김)

```css
.summary-help.sermon-cta { background: #e7f4f4; color: #0f6d73; border-color: #0f6d73; }
.summary-help.sermon-cta:hover { background: #0f6d73; color: #fff; }
.dark .summary-help.sermon-cta { background: #16292b; color: #6fc7cc; border-color: #2f5457; }
.dark .summary-help.sermon-cta:hover { background: #2f5457; color: #fff; }
```

### 2080–2081줄 근처(사이의 산 규칙은 남김)

```css
.summary-go.passages-act { background: linear-gradient(135deg,#8a6d1f,#b08d2e); color:#fff; border-color:#8a6d1f; }
.summary-go.passages-act:hover { background: linear-gradient(135deg,#775e1a,#9c7d26); border-color:#775e1a; }
```

### 2150–2153줄 근처(사이의 산 규칙은 남김)

```css
.summary-help.board-cta { background: #eaf3ee; color: #2f6b4f; border-color: #2f6b4f; }
.summary-help.board-cta:hover { background: #2f6b4f; color: #fff; }
.dark .summary-help.board-cta { background: #1c3328; color: #7fc7a0; border-color: #2f6b4f; }
.dark .summary-help.board-cta:hover { background: #2f6b4f; color: #fff; }
```

### 2235줄

```css
.event-card-desc { font-size: .88rem; color: #6b5a2e; margin-bottom: 11px; }
```

### 2261–2264줄 근처(사이의 산 규칙은 남김)

```css
.dark .event-card-desc { color: #c9bd93; }
.dark .event-card.done .event-card-desc { color: #8fd6ab; }
```

### 2376–2411줄 (주석과 함께 문단째)

```css
/* ---------- 목록 상단 네비 ---------- */
.list-nav {
  display: flex; flex-direction: column; align-items: stretch; gap: 8px;
  max-width: 720px; margin: 0 auto 6px; padding: 2px 0;
}
/* 기록보기: 요약 화면 '암송하러 가기'와 동일 스타일 — 채운 네이비 */
.list-nav .nav-record {
  max-width: none; width: 100%; text-align: center;
  padding: 12px; font-size: .98rem; font-weight: 700; border-radius: 12px;
  background: var(--navy); color: #fff; border: 1.5px solid var(--navy);
}
.list-nav .nav-record:hover { background: var(--navy-dark); color: #fff; }
/* 도움말: 요약 화면 '도움말 보기'와 동일 스타일 — 옅은 네이비 + 네이비 테두리 */
.list-nav .help-btn {
  width: 100%; padding: 12px; font-size: .98rem; font-weight: 700; border-radius: 12px;
  background: #eef1f8; color: var(--navy); border: 1.5px solid var(--navy);
}
.list-nav .help-btn:hover { background: var(--navy); color: #fff; }
.nav-btn {
  background: transparent; border: 1px solid var(--border); border-radius: 999px;
  padding: 7px 14px; font-size: .85rem; color: var(--navy); cursor: pointer;
  font-family: inherit; font-weight: 500;
}
.nav-btn:hover { background: var(--white); }
/* 로그인 정보를 담은 '내 기록' 버튼 — 알림 버튼(remind-cta)과 동일 스타일 */
.nav-record {
  margin: 0; cursor: pointer; font-family: inherit;
  font-size: .88rem; /* remind-cta .98rem의 0.9배 */
}
.nav-record:hover { background: var(--navy); color: #fff; }
.nav-user {
  display: flex; flex-direction: column; align-items: flex-end;
  color: var(--navy); font-weight: 700; line-height: 1.25; text-align: right;
}
.nav-user .nav-user-l1 { font-size: .82rem; white-space: nowrap; }
.nav-user .nav-user-l2 { font-size: .9rem; white-space: nowrap; }
```

### 2498줄

```css
.intro-foot { margin-top: 16px; font-size: 0.78rem; color: var(--gray); }
```

### 3015–3021줄 근처(사이의 산 규칙은 남김)

```css
.theme-toggle{
  position:absolute; top:8px; right:12px; z-index:5;
  width:34px; height:34px; border-radius:999px; cursor:pointer;
  background:rgba(255,255,255,.15); border:1px solid rgba(255,255,255,.35);
  font-size:16px; line-height:1; color:#fff;
}
.theme-toggle:hover{ background:rgba(255,255,255,.28); }
```

### 3037줄 — 선택자 목록에서 뺌: `.dark .page-title` · `.dark .entry-title` · `.dark .stat-num` · `.dark .gauge-pct`

뺀 앞의 선택자 목록:

```css
.dark .page-title, .dark .verse-ref, .dark .test-ref, .dark .rank-title,
.dark .summary-hello, .dark .cd-title, .dark .entry-title, .dark .help-title,
.dark .stat-num, .dark .rk-name, .dark .rk-cnt, .dark .mr-label,
.dark .test-stage, .dark .answer-title, .dark .gauge-pct, .dark .rank-row .rk-no { … }
```

### 3044줄 — 선택자 목록에서 뺌: `.dark .stat-box`

뺀 앞의 선택자 목록:

```css
.dark .verse-card, .dark .test-card, .dark .summary-card, .dark .entry-card,
.dark .answer-panel, .dark .rank-row, .dark .kpi, .dark .stat-box,
.dark .my-rank, .dark .mc-cell, .dark .voice-result, .dark .test-sentence,
.dark .word-fixed { … }
```

### 3048줄 — 선택자 목록에서 뺌: `.dark .entry-sub` · `.dark .gauge-sub` · `.dark .summary-next`

뺀 앞의 선택자 목록:

```css
.dark .verse-hint, .dark .entry-sub, .dark .cd-sub, .dark .gauge-sub,
.dark .summary-next, .dark .help-section p, .dark .help-section li,
.dark .challenge-hint-line, .dark .rank-msg, .dark .mc-summary { … }
```

### 3051줄 — 선택자 목록에서 뺌: `.dark .summary-next b` · `.dark .gauge-sub b`

뺀 앞의 선택자 목록:

```css
.dark .help-section b, .dark .summary-next b, .dark .gauge-sub b { … }
```

### 3054줄 — 선택자 목록에서 뺌: `.dark .remind-cta` · `.dark .nav-btn` · `.dark .nav-record`

뺀 앞의 선택자 목록:

```css
.dark .remind-cta, .dark .back-btn, .dark .answer-btn, .dark .help-btn,
.dark .summary-help, .dark .summary-change, .dark .nav-btn, .dark .nav-record,
.dark .rank-filter button, .dark .card-listen, .dark .myrec-toggle button,
.dark .myrec-nav button, .dark .rank-dates .rd-go, .dark .back-to-test-btn { … }
```

### 3060줄 — 선택자 목록에서 뺌: `.dark .remind-cta:hover`

뺀 앞의 선택자 목록:

```css
.dark .remind-cta:hover, .dark .answer-btn:hover, .dark .help-btn:hover,
.dark .rank-filter button:hover { … }
```

### 3075–3077줄 근처(사이의 산 규칙은 남김)

```css
.dark .stat-box.status-heart{ background:#2b2717; border-color:#8d7531; }
.dark .stat-box.status-heart .stat-num{ color:#e8d9a3; }
.dark .stat-box.status-done{ background:#17301f; }
```

### 3082–3086줄 근처(사이의 산 규칙은 남김)

```css
.dark .stat-box.status-s2{ background:#2b2717; border-color:#4a4327; }
.dark .stat-box.status-s2 .stat-num{ color:#e8d9a3; }
.dark .stat-box.status-s1{ background:#1b2740; border-color:#33405a; }
.dark .stat-box.status-s1 .stat-num{ color:#a8c4f0; }
.dark .stat-box.status-done .stat-num{ color:#8fd7a0; }
```

### 3108줄

```css
.dark .weekly-ref{ color:#e8d9a3; }
```

### 3219줄 — 선택자 목록에서 뺌: `html[data-fs="lg"] .remind-cta`

뺀 앞의 선택자 목록:

```css
html[data-fs="lg"] .summary-install,
html[data-fs="lg"] .remind-cta { … }
```

### 3221줄 — 선택자 목록에서 뺌: `html[data-fs="xl"] .remind-cta`

뺀 앞의 선택자 목록:

```css
html[data-fs="xl"] .summary-install,
html[data-fs="xl"] .remind-cta { … }
```

### 3225줄 — 선택자 목록에서 뺌: `html[data-fs="lg"] .page-title`

뺀 앞의 선택자 목록:

```css
html[data-fs="lg"] h1, html[data-fs="lg"] .page-title { … }
```

### 3226줄 — 선택자 목록에서 뺌: `html[data-fs="xl"] .page-title`

뺀 앞의 선택자 목록:

```css
html[data-fs="xl"] h1, html[data-fs="xl"] .page-title { … }
```

### 3501–3503줄 근처(사이의 산 규칙은 남김)

```css
.summary-help.passages-cta { border-color: var(--gold); }
.pg-list-title { font-weight: 800; color: var(--navy); font-size: 1.05rem; margin: 8px 4px 12px; }
.pg-list-sub { display: block; font-size: .8rem; font-weight: 500; color: var(--gray); margin-top: 2px; }
```

### 3519–3529줄 근처(사이의 산 규칙은 남김)

```css
.pg-steps { display: flex; flex-direction: column; gap: 8px; margin: 14px 0; }
.pg-step {
  display: flex; align-items: center; gap: 10px; text-align: left;
  padding: 12px 14px; border-radius: 12px; border: 1px solid var(--border);
  background: var(--white); font-family: inherit; font-size: .95rem; color: #333; cursor: pointer;
}
.pg-step.done { border-color: #cfe6d5; background: #f2f9f4; color: #2c5f2d; }
.pg-step.next { border-color: var(--navy); background: #eef1f8; color: var(--navy); font-weight: 700; }
.pg-step.lock { color: #b8b2a2; cursor: default; }
.pg-step-ic { flex-shrink: 0; width: 20px; text-align: center; }
.pg-step-tx { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
```

### 3530줄 — 선택자 목록에서 뺌: `.pg-steps-hint`

뺀 앞의 선택자 목록:

```css
.pg-steps-hint, .pg-final-hint { … }
```

### 3531줄

```css
.pg-complete-badge { margin-top: 12px; text-align: center; font-weight: 700; color: #8a6d1f; }
```

### 3544줄 — 선택자 목록에서 뺌: `.dark .pg-list-title`

뺀 앞의 선택자 목록:

```css
.dark .pg-card-title, .dark .pg-list-title { … }
```

### 3545–3547줄 근처(사이의 산 규칙은 남김)

```css
.dark .pg-step { background: #1b2233; border-color: #33405c; color: #cdd9f2; }
.dark .pg-step.done { background: #17311f; border-color: #2f5a42; color: #8fd6ab; }
.dark .pg-step.next { background: #232c3f; border-color: #4a5e86; color: #cdd9f2; }
```

### 3559줄

```css
.pilsa-tab { margin-bottom: 14px; }
```

### 3561–3567줄 (주석과 함께 문단째)

```css
.pilsa-me {
  display: flex; align-items: center; gap: 10px;
  background: #f2f5fb; border: 1px solid var(--border); border-radius: 12px;
  padding: 12px 14px; margin-bottom: 14px;
}
.pilsa-me .pm-k { font-size: .78rem; font-weight: 700; color: #8a95a8; flex: none; }
.pilsa-me .pm-v { font-size: .95rem; font-weight: 800; color: var(--navy); }
```

### 3574–3581줄 근처(사이의 산 규칙은 남김)

```css
.pl-qty { display: grid; grid-template-columns: repeat(5, 1fr); gap: 7px; margin-top: 12px; }
.pl-qty button {
  padding: 12px 0; font-size: .95rem; font-weight: 800; font-family: inherit;
  color: var(--navy); background: #fff; border: 1.5px solid var(--border);
  border-radius: 10px; cursor: pointer; transition: all .15s;
}
.pl-qty button:hover { background: var(--cream); }
.pl-qty button.on { background: var(--navy); border-color: var(--navy); color: #fff; }
```

### 3584–3593줄 (주석과 함께 문단째)

```css
.pilsa-go {
  display: block; width: 100%; margin-top: 12px; padding: 14px;
  font-size: 1rem; font-weight: 800; font-family: inherit;
  color: #fff; background: var(--navy); border: 1.5px solid var(--navy);
  border-radius: 12px; cursor: pointer;
}
.pilsa-go:hover { background: var(--navy-dark); }
.pilsa-go.ghost { background: #eef1f8; color: var(--navy); }
.pilsa-go.ghost:hover { background: var(--navy); color: #fff; }
.pilsa-go[disabled] { opacity: .6; cursor: default; }
```

### 3604줄

```css
.pilsa-ask { text-align: center; font-size: .88rem; color: #6a7688; margin: 14px 0 2px; }
```

### 3606–3611줄 (주석과 함께 문단째)

```css
.pilsa-result { border-radius: 12px; padding: 16px; font-size: .92rem; line-height: 1.65; }
.pilsa-result.ok   { background: #eaf6ee; border: 1.5px solid #a9d8bb; color: #1f5c3a; }
.pilsa-result.dup  { background: #fdf6e3; border: 1.5px solid #e6cf94; color: #7a5f16; }
.pilsa-result.none { background: #f4f6fa; border: 1.5px solid var(--border); color: #6a7688; }
.pilsa-result b { color: inherit; }
.pr-sub { display: inline-block; margin-top: 8px; font-size: .78rem; color: #8a95a8; }
```

### 3613–3615줄 (주석과 함께 문단째)

```css
.pilsa-err { background: #fdedec; border: 1.5px solid #f5b7b1; border-radius: 10px;
             padding: 10px 13px; margin-top: 12px; font-size: .85rem; color: #c0392b; }
.pilsa-err[hidden] { display: none; }
```

### 3617–3625줄 근처(사이의 산 규칙은 남김)

```css
.dark .pilsa-me { background: #202a3d; border-color: #3a4a68; }
.dark .pilsa-me .pm-v { color: #cdd9f2; }
.dark .pl-qty button { background: #2a3450; border-color: #3a4a68; color: #c3cee6; }
.dark .pl-qty button.on { background: #3a4a68; border-color: #56688c; color: #fff; }
.dark .pilsa-go.ghost { background: #2a3450; color: #c3cee6; }
.dark .pilsa-result.none { background: #202a3d; border-color: #3a4a68; color: #9aa6bb; }
```

### 3655–3656줄 근처(사이의 산 규칙은 남김)

```css
.pilsa-go.danger { background: #fff; color: #c0392b; border-color: #e8b4ae; }
.pilsa-go.danger:hover { background: #c0392b; color: #fff; border-color: #c0392b; }
```

### 3668줄

```css
.dark .pilsa-go.danger { background: #2a3450; color: #f0a49b; border-color: #6b4a46; }
```

### 3799–3803줄 (주석과 함께 문단째)

```css
/* 첫화면 — 성경필사 노트 신청 */
.summary-help.pilsa-cta { background: #eef3fb; color: #1a3a6b; border-color: #1a3a6b; }
.summary-help.pilsa-cta:hover { background: #1a3a6b; color: #fff; }
.dark .summary-help.pilsa-cta { background: #1e2a44; color: #cdd9f2; border-color: #3a5680; }
.dark .summary-help.pilsa-cta:hover { background: #3a5680; color: #fff; }
```

### 4496줄 — 선택자 목록에서 뺌: `.summary-go.passages-act`

뺀 앞의 선택자 목록:

```css
.summary-go.sermon-act, .summary-go.med-act, .summary-go.passages-act { … }
```

### 4505줄 — 선택자 목록에서 뺌: `.summary-go.passages-act:hover`

뺀 앞의 선택자 목록:

```css
.summary-go.sermon-act:hover, .summary-go.med-act:hover, .summary-go.passages-act:hover { … }
```

### 4512줄 — 선택자 목록에서 뺌: `.dark .summary-go.passages-act`

뺀 앞의 선택자 목록:

```css
.dark .summary-go.sermon-act, .dark .summary-go.med-act, .dark .summary-go.passages-act { … }
```

### 4515줄 — 선택자 목록에서 뺌: `.dark .summary-go.passages-act:hover`

뺀 앞의 선택자 목록:

```css
.dark .summary-go.sermon-act:hover, .dark .summary-go.med-act:hover,
.dark .summary-go.passages-act:hover { … }
```

### 4520줄 — 선택자 목록에서 뺌: `.stat-grid[hidden]`

뺀 앞의 선택자 목록:

```css
.stat-grid[hidden], #more-box[hidden] { … }
```

### 4944줄

```css
.min-note .min-note-t { display: block; margin-bottom: 3px; }
```

### 5084–5085줄 근처(사이의 산 규칙은 남김)

```css
.dark .min-serving { background: #17311f; border-color: #2f5a42; }
.dark .min-serving-t { color: #8fd6ab; }
.dark .min-serving-h { color: #7fae90; }
```

### 5219–5225줄 (주석과 함께 문단째)

```css
.min-state { border-radius: 12px; padding: 14px; margin-bottom: 12px; text-align: center; }
.min-state-t { font-size: 1.05rem; font-weight: 800; margin-bottom: 4px; }
.min-state-m { font-size: .86rem; line-height: 1.6; }
.min-state.s-wait { background: #eef1f8; color: var(--navy); }
.min-state.s-work { background: #fbf1d8; color: #8a6a1e; }
.min-state.s-done { background: #e7f3e8; color: #2c5f2d; }
.min-state.s-none { background: #f2f2f2; color: var(--gray); }
```

### 5314줄 — 선택자 목록에서 뺌: `.min-d-none`

뺀 앞의 선택자 목록:

```css
.min-d-none, .min-d-note { … }
```

### 5411줄 — 선택자 목록에서 뺌: `.ps-total`

뺀 앞의 선택자 목록:

```css
.ps-total,.ps-step { … }
```

### 5492–5495줄 근처(사이의 산 규칙은 남김)

```css
.ps-progress{text-align:center;color:var(--gray);font-size:15px;margin:4px 0 2px}
.ps-progress b{color:var(--navy,#1a3a6b)}
.ps-catch{text-align:center;color:#8a6216;background:#fff8ec;border:1px solid #e8c98a;
          border-radius:8px;padding:9px 12px;font-size:14px;margin:10px 0}
```

### 5497–5515줄 (주석과 함께 문단째)

```css
/* --- 지난 말씀 아코디언 --- */
.ps-acc-btn{
  display:block;width:100%;margin-top:18px;padding:13px 14px;text-align:left;
  background:#fff;border:1px solid #dfe4ea;border-radius:10px;
  font-size:16px;color:var(--navy,#1a3a6b);cursor:pointer;
}
.ps-caret{float:right;transition:transform .18s}
.ps-acc-btn[aria-expanded="true"] .ps-caret{transform:rotate(180deg)}
.ps-acc[hidden]{display:none}
.ps-past-row{
  display:flex;align-items:center;gap:10px;width:100%;padding:12px 14px;
  background:none;border:none;border-bottom:1px solid var(--border,#eee7d8);font-size:16px;
  text-align:left;cursor:pointer;
}
.ps-past-day{color:var(--gray);font-size:13px;min-width:46px}
.ps-past-ref{flex:1;color:var(--navy,#1a3a6b)}
/* ✅ 하나만 들어가던 칸이다 — 「마음에 둠」까지 하신 편은 ✅👑 두 자가 들어와 폭이 모자라면
   요절(.ps-past-ref)을 밀어낸다. 줄바꿈도 막는다(왕관만 아랫줄로 떨어지면 표식이 아니다). */
.ps-past-mark{min-width:44px;text-align:right;white-space:nowrap}
```

### 5581줄 — 선택자 목록에서 뺌: `.dark .ps-past-ref` · `.dark .ps-progress b`

뺀 앞의 선택자 목록:

```css
.dark .ps-back,
.dark .ps-past-ref,
.dark .ps-progress b,
.dark .ps-done-t,
.dark .ps-done-bar b { … }
```

### 5586줄 — 선택자 목록에서 뺌: `.dark .ps-acc-btn`

뺀 앞의 선택자 목록:

```css
.dark .ps-tool,
.dark .ps-acc-btn { … }
```

### 5588줄 — 선택자 목록에서 뺌: `.dark .ps-catch`

뺀 앞의 선택자 목록:

```css
.dark .ps-catch,
.dark .ps-done-wait { … }
```

### 5738–5743줄 근처(사이의 산 규칙은 남김)

```css
.ev-mine-card{background:linear-gradient(135deg,#f0f7f3,#e7f3ec);
  border:1.5px solid #b9d8c6;border-radius:14px;padding:14px 16px;margin-bottom:18px;
  box-shadow:0 2px 8px rgba(47,107,79,.08)}
.ev-mine-t{font-size:16px;font-weight:800;color:#2f6b4f;margin-bottom:3px}
.ev-mine-v{font-size:15px;color:#3d5f4d}
.ev-mine-at{font-size:13px;color:#7a8f83;margin-top:2px}
```

### 5774–5778줄 근처(사이의 산 규칙은 남김)

```css
.dark .ev-mine-card{background:linear-gradient(135deg,#14231c,#122019);border-color:#2f5a41;
  box-shadow:0 2px 8px rgba(0,0,0,.25)}
.dark .ev-mine-t{color:#8fd3ab}
.dark .ev-mine-v{color:#b9d8c6}
.dark .ev-mine-at{color:#7f9a8c}
```

### 5957줄

```css
.edu-h { font-size: 16px; font-weight: 800; color: var(--navy); margin: 14px 0 4px; }
```

### 5965줄 — 선택자 목록에서 뺌: `.dark .edu-h`

뺀 앞의 선택자 목록:

```css
.dark .edu-title, .dark .edu-h, .dark .edu-card b { … }
```
