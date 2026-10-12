# 📚 네비게이토 성경암송(2026-10-13 · 문 닫힘 — 🧪 시험 참여자 · `?navi=1` 만)

> **언제 읽나:** `js/navi.js` · 첫 화면 「암송 과정」 · `verses` 의 `track='navi'` 줄(2001~) · `supabase/functions/api/navi.ts` · 구절 번호 판정(`isPsalmNo`·`isNonWeeklyNo`)을 손댈 때, 그리고 **성도님께 여는 날**.
> 설계 `docs/superpowers/specs/2026-10-13-navigators-design.md`(승인 · 「바꾼 것」 절) · 계획 `docs/superpowers/plans/2026-10-13-navigators.md`.

## 무엇
첫 화면 **「암송 과정」** 묶음(2026-10-13 친구 — 「함께」 바로 위 · 쉴만한 물가 · 내 안에 거하는 말씀 · 네비게이토 · 퀴즈 넷이 한 묶음 · `docs/notes/home-screen.md`) → 📚 네비게이토 성경암송 → **묶음 목록**(7) → **구절 목록**(주제 이름 아래 두 구절씩 · 이 묶음 듣기) → **3단계 암송**(주간과 같은 생김새 · 카드 · 반복해서 쓰기 · 마음에 둠) → 단계 완료 창(「다음 말씀 ▶」은 **그 묶음 안** · 끝이면 「남은 말씀 ▶」 · 다 마치면 「묶음 목록으로」).
- 묶음: 그리스도인의 확신(5 · 2001~2005) · 그리스도인의 생활 지침(8 · 2011~2018) · A 새로운 삶 · B 그리스도를 전파함 · C 하나님을 의뢰함 · D 그리스도 제자의 자격 · E 그리스도를 닮아 감(각 12 · 2021~ · 2041~ · 2061~ · 2081~ · 2101~2112). **카드 73장**.
- 본문: 대한성서공회 **개역개정 4판** 원문(교회가 사용 허가를 받았다 — 친구 2026-10-13 · 허가 문서는 저장소에 없다). 엑셀 `자료/navi/네비게이토_구절입력_73.xlsx` I열 → `python tools/navi-fit.py --sql` → `supabase/navi_verses.sql`. **AI 가 본문을 쓰거나 고치지 않는다**(쉴만한 물가 규칙 · 도구는 공백만 다듬는다).
- 기록: 주간과 같은 길 — `saveProgress(no, stage, "typing"|"card")` → `progress` · `challenge_log`(learn-typing / learn-typing-card) → **오늘 N회 · 도전 순위 · 가을 동행 도장에 함께 센다**. 마음에 둠도 같은 `progress.hearted`. 다른 기기와의 동기화도 저절로(로그인 병합이 번호를 가리지 않는다).
- 1단계에서 뺀 것(나중에): 나의 말씀 앨범 · 묶음별 말씀 도전 · 영어(NIV) · 복습 · 딥링크(`?v=`) · 🎤 소리 내어 암송 · 풀이·기억법 · 교회 어드민 편집 화면.

## 번호대 · 두 판정 ⚠️
- 1~999 주간 · 1001~1999 쉴만한 물가 · 2001~ 네비게이토. 앱 `js/psalm.js`(처음부터 실림 · 순수 표식 안) · 서버 `index.ts` 가 **같은 이름·같은 값**.
- **`isPsalmNo`(1001~1999) = 물가 화면으로 보냄**(앱의 복습 화면 `renderReview` · 앨범 `goTest` 두 자리) · **`isNonWeeklyNo`(1000 초과) = 복습에 넣지 않음**(앱 `ensureReviewScheduled`·`dueReviewNos` · 서버 로그인 자동 예약·`saveProgress`). 2026-10-13 전에는 `isPsalmNo`(1000 초과) 하나가 둘 다 했다 — 범위만 좁히면 네비게이토 복습 예약이 조용히 쌓이고(물가 41행 사고 2026-09-23), 그대로 두면 네비게이토가 물가 화면으로 간다. 서버의 `isPsalmNo` 는 걷었다(서버 두 자리가 모두 「복습에서 뺌」이었다).
- 지표 `supabase/psalm_metrics.sql` 의 「시편 암송」 범위도 1001~1999(읽기 전용 파일 — DB 에 넣는 것이 아니다).
- 한 번 넣은 번호는 **바꾸지도 지우지도 않는다**(`progress`·`challenge_log`·`reviews` 가 on delete cascade) — 내릴 때는 `update public.verses set is_active=false where no=… and track='navi'`. `tools/navi-fit.py` 가 이미 만든 SQL 과 견줘 재배정을 막는다(`--force` 로만).
- 설교 담당자 올리기(`staffVerseSave` · 1000 이상 `bad-no`)·연상 그림(`vimgVerse`)은 네비게이토 줄을 건드리지 않는다.

## 문(門) — 하나뿐이다
- `naviVisible() = _naviPreview(?navi=1) || naviOpenCached()(app_config naviPublic === true) || ministryTesterCached()(🧪)` — `app.js` · 첫 화면 동기 렌더라 캐시를 본다(`navi-public` · `refreshNaviOpen` 은 `routeAfterLoad`).
- ⚠️ **카드 줄은 켠 채(`is_active=true`)로 넣었다**(설계 §3 의 「꺼진 채」를 바꿨다 — 그러면 🧪 시험 참여자도 못 본다). 안전한 까닭: 주간을 읽는 곳(`getVerses` 기본 · `latestVerse` · `weeklyVerseKst` · monitor · `verseNextNo`)이 모두 `track='weekly'` 로 거르고, 옛 앱은 `track` 을 안 보내 주간만 받는다. 구절은 공개된 성경 본문이라 서버가 막을 것이 없다(이름·개인정보 없음 · 쓰기는 본인 기록뿐).
- 그래서 **`naviVisible` 을 넓히면 그대로 성도님께 열린다** — 문을 손댈 때는 이 줄을 먼저 본다.
- 시드 SQL 은 다시 돌려도 `is_active` 를 **덮지 않는다**(on conflict 갈래에 없다) — 내려 둔 카드가 되살아나지 않는다. 엑셀 메모 「빼기」는 처음 넣을 때만 먹는다.

## 세 값 — 받음 · 없음 · 모름
- 서버 `getNaviVerses`: 성공 `{ok:true, navi:true, verses}` · 읽기 오류(칸이 없는 DB 등) `{ok:false, error:"navi-unavailable"}`.
- ⚠️ **`navi:true` 표식이 없으면 「모름」** — 이 갈래가 없는 옛 함수는 `track:"navi"` 를 몰라 **주간 구절**을 돌려준다. 표식을 빼면 주간 말씀이 네비게이토 화면에 그려진다(`nvReadAnswer` · 시험 ④).
- 화면 말: 모름 「말씀을 지금 불러올 수 없어요. 잠시 뒤 다시 열어 주세요.」 + 다시 불러오기 · 없음 「아직 준비 중이에요.」(「곧」을 약속하지 않는다).

## 화면에서 지킨 것
- **주간 화면 함수(`startTest`·`renderTestScreen`·`showStageDoneModal`·`renderCompleteNav`)를 쓰지 않는다** — 전역 `verses`(주간)에 묶여 있어 네비게이토 구절을 넘기면 주간 1번으로 튄다. 생김새(`.test-screen`)와 공용 부품(`pickBlankIndices` · `setupAutoCheck` 의 onDone · 카드 · 반복 · 마음에 둠 · `setupAnswerToggle` · `initStickyRef`)만 빌린다.
- 전역 `verses` 에 넣지 않는다(첫 화면 「N구절 마쳤어요」·이번 주 말씀·다음 말씀·도전 풀이 그대로인지 확인함).
- **전체 수를 쓰지 않는다** — 묶음 줄은 「3구절 마침」 · 다 마치면 「🎉 다 마쳤어요」(첫 화면에서 전체 수를 뺀 것과 같은 까닭). 「앨범에 담겼어요」·「복습이 예약됐어요」를 쓰지 않는다(네비게이토는 둘 다 아니다 — 그래서 `FIRST_DONE_HTML` 도 안 쓴다).
- 카드 번호(엑셀 F열 「A-1」)는 DB 에 담지 않았다 — 번호 매기는 법을 카드 실물과 대조 못 했다. 목록의 작은 수는 묶음 안 차례.
- 지연 파일 — `LAZY_JS.navi`(`js/navi.js` · fn `renderNaviHome`) · 들어오는 길은 `openNavi()` 하나(첫 화면 단추). 미리 받지 않는다(열면 모두에게 보이는 단추). 맨 위 이름은 `nv`/`NV_` 머리(겹치면 받는 순간 SyntaxError — `tests/lazy-load.test.cjs`).
- 열람 기록: 단추 누름에서 `logFeature("navi", 0)` — 서버 `FEATURES` 에 아직 없어 조용히 건너뛴다(**여는 날 더한다**).

## 여는 날(친구가 정한다) — 차례
> **2026-10-13 친구 「네비게이토 성경암송 열어 주세요」 — 진행:** ④ 서버 `FEATURES` 에 `navi`(운영 · `feature_log.sql` 머리 · 스모크 목록) ✅ · ⑤ `FEAT_SINCE.navi = "2026-10-13"` · 설명서 한 장 · 연 날 첫 화면 그 자리에서 다시 그리기(`refreshNaviOpen`) — 화면 배포 · ⑥ `naviPublic` 은 **친구가 화면을 본 뒤**(친구 「배포해 주시면 먼저 화면 확인하겠습니다」). 친구 실기기 시험 기록(운영 10/13 03:04~03:10 · 고전 10:13 · 쓰기 1·카드 2 · 다 마침 · 복습 예약 0)으로 기록 길 확인.
1. **네비게이토 이름 허락** — 이름·주제 이름·번호 체계를 화면에 써도 되는지(공개된 정책이 없다 · 한국네비게이토선교회 02-336-3387 · 출판사 02-334-3305). 허락 전이면 메뉴 이름을 「주제별 성경암송」으로(첫 화면 단추 글 · `js/navi.js` 머리 글 · 설명서).
2. **카드 실물 대조** — 생활 지침 8구절 주제 이름(친구가 채움) · 5확신/생활 지침 장절.
3. 플레이 심사 중이면 심사 뒤(새 화면 · 공지).
4. 서버 `FEATURES` 에 `"navi"`(+ `supabase/feature_log.sql` 머리 표 한 줄 — 값만 늘리면 SQL 을 다시 넣을 일은 없다) → `python tools/deploy-fn.py api --dev` → `--prod`.
5. 앱: `FEAT_SINCE.navi = "<여는 날>"` · 설명서(`MANUAL`)에 한 장(`when: () => naviVisible()` · 단추 자리는 A안이면 「암송 과정」) → bump → 푸시.
6. 운영 `app_config`: `insert into app_config(key, value) values ('naviPublic', 'true'::jsonb) on conflict (key) do update set value = excluded.value, updated_at = now();` — 값이 바뀌면 `refreshNaviOpen` 이 첫 화면을 그 자리에서 다시 그려, 켠 날 앱을 연 그 실행부터 보인다(2026-10-13 · psalm·edu 는 다음 실행부터).
7. 확인: 시험 참여자 **아닌** 계정으로 운영에서 단추 · `NAVI_ENV=prod PROD_ANON=… NAVI_EXPECT=73 bash tests/navi-smoke.sh`.

## 시험 · 확인
- `node --test tests/navi.test.cjs`(preflight) — ① 번호대(앱·서버·지표) ② 서버 갈래·표식·허용 키 ③ 시드 SQL 꼴(73 · 2001~2112 · is_active 안 덮음 · delete 없음 · 본문에 숫자·괄호·영문 없음) ④ 화면 순수 함수(세 값 · 주제 칸 · 「다음」 · 쓰면 안 되는 말 · 주간 화면 함수 안 부름).
- `DEV_ANON=… bash tests/navi-smoke.sh` · 운영 `NAVI_ENV=prod PROD_ANON=…` — 주간에 안 섞임 · 물가 1001~1999 · navi 표식·번호·칸 · `naviPublic` 허용.
- `tools/screen-sweep.py` 단계 51~54(첫 화면 단추 → 묶음 · A 묶음 · 1단계 · 3단계 C-12). 리셋에 `_naviPreview=true`.
- 2026-10-13 개발 DB 로 끝까지 눌러 봄: 묶음 7 → A(주제 6칸 · 12장 · 이 묶음 듣기 약 5분) → 1·2·3단계(쓰기·카드) → 완료 창 「다음 말씀 ▶」 → 목록 「다 마침」 → 묶음 「1구절 마침」 · 서버 `challenge_log` learn-typing / learn-typing-card · `reviews` 1000 초과 0 · 첫 화면 주간 숫자 그대로 · 반복해서 쓰기(창 없이 새 3단계) · 마음에 둠(목록 👑·힌트 · 다시 열면 3단계). 8조건 × 5화면 sweep 오류 0.
- ⚠️ app 모드 sweep 의 「상태바에 가림 (fits)」 경고가 묶음 목록(51)에 뜬다 — 한 화면에 들어가는 짧은 화면 + 로고 띠라 이벤트(29)·내 안에 거하는 말씀(31)과 같은 경고다(도구 머리: 「실기기로 한 번 보고 믿을 것」). **아이폰 앱 실기기로 확인할 것.**
