# 아이폰 위젯 보강 — 잠금 화면 · 오늘의 묵상 · 오늘의 축복 기도문 (설계)

**날짜**: 2026-09-20
**배경**: iOS 앱 1.0.1 이 심사를 통과했다. 지금 위젯은 「이번주 말씀」(홈 화면 작게·중간) 하나이고,
누르면 첫 화면이 열린다. 친구와 정한 방향(2026-09-20 대화):
- 잠금 화면에도 이번 주 구절을 두고, **누르면 그 구절 암송 화면으로 바로** 간다.
- 새 위젯 둘 — **오늘의 묵상**, **오늘의 축복 기도문** — 을 **따로** 만든다.
- 기도문의 `{이름}` 자리에는 **「우리 가족」** 을 넣는다(앱이 로그인 이름을 넘겨주는 장치는 만들지 않는다).
- 잠금 화면에는 **본문을 그대로**(첫 글자 가림 없이) 보인다.
- 방법은 **A — 서버가 계산하고 위젯은 보여 주기만** 한다.

안드로이드 앱은 TWA(웹 껍데기)라 위젯이 없다 — 이 설계는 아이폰만 다룬다.

---

## ① 위젯 목록과 크기

| 위젯 | 놓는 곳 · 크기 | 보여 주는 것 | 누르면 |
|---|---|---|---|
| **이번주 말씀**(기존 보강) | 홈 작게·중간(그대로) + **잠금 화면 네모(accessoryRectangular)** + **잠금 화면 한 줄(accessoryInline)** | 네모: 구절 이름 + 본문 앞 2줄 · 한 줄: 「구절 이름 · 본문 첫머리」 | 그 구절 암송 화면(`?v=번호`) |
| **오늘의 묵상**(새) | 홈 중간·크게 | 제목(있으면) + 묵상 글 + 오늘의 적용 질문(중간은 앞부분, 크게는 전부) | 매일 묵상 창(`?w=meditation`) |
| **오늘의 축복 기도문**(새) | 홈 중간·크게 | 제목·출처 + 기도문(「우리 가족」으로 채움, 중간은 앞부분·크게는 전부 — 가장 긴 편 247자) | 기도문 화면(`?w=prayer`) — 앱의 「오늘 한 편」과 같은 편 |

- 세 위젯 모두 지금 위젯과 같은 글꼴(serif)·배경. 어두운 모드는 시스템을 따른다.
- 묵상·기도문에 **작게**는 두지 않는다 — 두세 줄로는 뜻이 안 전해진다.
- 기도문 위젯은 「우리 가족」으로 읽고, 눌러서 들어가면 앱은 지금처럼 로그인 이름으로 같은 편을 보여 준다.
- 묵상 자료가 없는 때(주일 예배 직후 잠깐)에는 앱과 같은 안내 문구를 보인다.
- 세 위젯은 **같은 위젯 익스텐션**(`kr.onlybible.gocheok.memorize.todayverse`) 안에 둔다 — 새 번들 ID·서명이 필요 없다.

## ② 서버 액션 (`supabase/functions/api/index.ts` · 공개 · `user_id` 없음)

### 공통 — 「이번 주 구절」을 앱과 같은 기준으로
지금 서버의 `latestVerse()` 는 **시각**(`Date.parse(date) <= now`, 즉 UTC 자정)으로 고르고,
앱의 `getWeeklyVerseInfo()` 는 **한국 날짜**(`kstDayNumber(date) <= 오늘`)로 고른다. 그래서 구절이 바뀌는 날
0~9시에는 서버(=지금 위젯)가 지난 구절을 보인다. 새 헬퍼 `weeklyVerseKst(ymd?)` 가 앱과 같은 기준으로
`{ cur, prev }` 를 돌려준다(오늘 이전 것이 없으면 가장 이른 것 = 앱의 「곧 시작할 말씀」, prev 없음).
⚠️ 아침 알림 등 `latestVerse()` 를 쓰는 기존 경로는 **이번에 건드리지 않는다**(범위 밖 — 친구에게 따로 알렸다).

### `getWeeklyVerse`(기존, 위젯용) — 응답 모양 그대로 `{ no, ref, text, prev }`
- `latestVerse()` 대신 `weeklyVerseKst()` 를 쓴다. 이 액션을 부르는 곳은 위젯뿐이다.

### `getTodayMeditation` — `{ ok, ready, date, dayLabel, heading, message, question, sermonTitle, usingPrev }`
app.js `maybeShowWeeklyMeditation` 의 고르는 규칙을 그대로 옮긴다:
1. `weeklyVerseKst()` 로 이번 주 구절과 직전 주 구절.
2. 설교 = `sermons` 표에서 `hidden=false`, `mem_verse_no` 가 그 구절 번호, `summary` 가 있는 것 중 `svc_date` 가 가장 늦은 것
   (앱의 `findSermonForVerse` — `getSermons` 가 `svc_date` 내림차순으로 주므로 첫 것).
   ⚠️ `sermon` 함수의 `getSermons` 를 부르지 않는다 — 142편·1.9MB 라 위젯이 새로 고칠 때마다 받기엔 무겁다.
   두 구절 번호만 골라 필요한 칸만 읽는다(`title,svc_date,summary,points,questions,daily_meditations,mem_verse_no`).
   칸 이름은 gocheok-sermons 저장소 `sermon` 함수의 `toApp` 과 같다.
3. `sermonCycleStarted`: 자료(요일묵상·핵심포인트·질문 중 하나)가 있고 `svc_date < 오늘` 이면 시작됨. 날짜를 못 읽으면 시작됨.
   시작 전이고 직전 주 설교에 자료가 있으면 직전 주 것으로(`usingPrev`).
4. `buildWeeklyMeditations`: 요일묵상이 있으면 그것(메시지나 질문이 있는 것만), 없으면 핵심포인트(`halfText`)+질문,
   그것도 없으면 설교가 없을 때 「이번 주 설교 묵상 자료를 준비하고 있어요…」(`ready:false`), 설교는 있는데 비었으면 구절 본문 + 기본 질문.
5. 요일 인덱스 = 월 0 … 일 6, `pick = dayIdx % items.length`.
- `**굵게**` 표시는 벗긴다(위젯은 글자만 그린다).

### `getTodayBlessing` — `{ ok, date, no, title, ref, prayer }`
- 목록: `getBlessings` 와 같은 조회(`is_active`, `sort_order` → `no` 순).
- 오늘 편: 앱 `prayToday(n)` 은 `new Date(todayYmd()+"T00:00:00")` 을 **폰의 지역 시간**으로 읽는다. 한국 시간 폰에서는
  `floor((Date.UTC(y,m,d) − 9시간) / 1일)` = **(그날의 UTC 날수 − 1)** 이 된다. 서버는 이 값 `% n` 을 쓴다
  (성도님 폰은 한국 시간이다 — 외국 시간대 폰은 앱이 하루 다른 편을 보일 수 있으나 앱 쪽 동작이라 그대로 둔다).
- `{이름}` → 「우리 가족」, 조사는 앱 `prayFill` 과 같은 규칙(「족」은 받침 ㄱ → 이·을·은·과·으로). ⚠️ ㄹ 받침 규칙까지 그대로 옮긴다.

### 세 액션 공통
- 선택 입력 `date: "YYYY-MM-DD"` — 그날 기준으로 계산한다(시험용 · 공개 정보뿐이라 열어 둔다). 없으면 오늘(한국).
- 규칙이 **app.js 와 서버 두 곳**에 있게 된다 — 양쪽 주석과 `docs/notes/meditation.md`·`prayer-book.md` 에 「함께 고칠 것」.

## ③ 눌렀을 때 화면 연결

- 위젯: `widgetURL(gocheokmemorize://verse?no=31 | ://meditation | ://prayer)`.
- 앱 `Info.plist`: URL 스킴 `gocheokmemorize` 등록.
- `AppDelegate.application(_:open:options:)`: 스킴이 맞으면 웹 주소로 바꿔 브리지 웹뷰에 `load`
  (`/?v=31` · `/?w=meditation` · `/?w=prayer`), 아니면 지금처럼 Capacitor 로 넘긴다.
  - 첫 로그인 전(`hasLoggedInBefore` 없음)이면 무시한다 — 네이티브 로그인이 먼저다.
  - 새 문서를 여는 것이라 `--app-safe-top` 이 사라진다 → 앱을 켤 때처럼 1초·3초 뒤 `configureNativeAppCss()` 를 다시 부른다.
- 웹 `app.js routeAfterLoad`: `?w=` 를 한 번 읽고 주소를 정리한다(`?v=`·`?preview=` 와 같은 방식).
  - `prayer` → 로그인돼 있으면 `renderPrayerBook()`.
  - `meditation` → 로그인돼 있으면 첫 화면을 그리되 하루 1회 자동 묵상은 막고(`_skipAutoDaily`),
    「매일 묵상」 단추와 똑같이 `maybeShowWeeklyMeditation(true, true)`(요일 탭 있음).
  - 로그인 안 돼 있으면 평소처럼 로그인 화면.
- `?v=` 는 이미 있다(로그인 없이도 암송 화면).

## ④ 실패 대비 · 확인

**위젯**
- 받은 것이 성공이면 위젯 익스텐션의 `UserDefaults` 에 위젯별로 저장해 둔다.
- 실패하면 저장해 둔 마지막 것을 보이고 **30분 뒤** 다시 시도한다(지금은 실패해도 자정까지 기다린다).
- 새로 고침: 이번주 말씀·기도문은 다음 한국 자정. 묵상은 다음 자정과 6시간 뒤 중 이른 때
  (주일 설교가 늦게 올라와도 반나절 안에 따라온다).

**서버**
- 개발 → 운영 순서로 배포. 새 액션은 읽기만 하므로 앱 빌드보다 먼저 올려도 안전하다. 배포 전 `git status`, 배포 뒤 남의 경로(`getVerses`·`ranking`)도 찔러 본다.
- **대조 시험 `tests/widget-parity.py`**: 운영 사이트를 로그인 없이(읽기만) 열고, 한국 시간대·**고정 시계**로 14일을 하루씩 옮기며
  웹의 함수(`getWeeklyVerseInfo`·`findSermonForVerse`·`sermonCycleStarted`·`buildWeeklyMeditations`·`prayToday`·`prayFill`)가
  고르는 결과를 서버 `date=` 결과와 한 글자까지 대조한다.

**앱**(Mac 이 없어 Codemagic 빌드 → TestFlight 실기기)
- 버전 1.0.1 → **1.1.0**(새 기능).
- 실기기 확인표: 잠금 화면에 네모·한 줄 추가 → 본문이 보이는지 / 누르면 그 구절 암송 화면 / 묵상·기도문 위젯이
  앱과 같은 내용인지 / 앱이 꺼진 상태·켜진 상태에서 눌러 보기 / 비행기 모드에서 마지막 내용이 남는지.

## 범위 밖
- 나의 복습·연속 참여 위젯(App Group 필요) · 기도문 이름 넘겨주기 · 안드로이드 위젯 · 아침 알림의 `latestVerse()` 기준.
