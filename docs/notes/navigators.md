# 📚 네비게이토 성경암송(2026-10-13 · 문 닫힘 — 🧪 시험 참여자 · `?navi=1` 만)

> **언제 읽나:** `js/navi.js` · 첫 화면 「암송 과정」 · `verses` 의 `track='navi'` 줄(2001~) · `supabase/functions/api/navi.ts` · 구절 번호 판정(`isPsalmNo`·`isNonWeeklyNo`)을 손댈 때, 그리고 **성도님께 여는 날**.
> 설계 `docs/superpowers/specs/2026-10-13-navigators-design.md`(승인 · 「바꾼 것」 절) · 계획 `docs/superpowers/plans/2026-10-13-navigators.md`.

## 무엇
첫 화면 **「암송 과정」** 묶음(2026-10-13 친구 — 「함께」 바로 위 · 쉴만한 물가 · 내 안에 거하는 말씀 · 네비게이토 · 퀴즈 넷이 한 묶음 · `docs/notes/home-screen.md`) → 📚 네비게이토 성경암송 → **묶음 목록**(7) → **구절 목록**(주제 이름 아래 두 구절씩 · 이 묶음 듣기) → **3단계 암송**(주간과 같은 생김새 · 카드 · 반복해서 쓰기 · 마음에 둠) → 단계 완료 창(「다음 말씀 ▶」은 **그 묶음 안** · 끝이면 「남은 말씀 ▶」 · 다 마치면 「묶음 목록으로」).
- 묶음: 그리스도인의 확신(5 · 2001~2005) · 그리스도인의 생활 지침(8 · 2011~2018) · A 새로운 삶 · B 그리스도를 전파함 · C 하나님을 의뢰함 · D 그리스도 제자의 자격 · E 그리스도를 닮아 감(각 12 · 2021~ · 2041~ · 2061~ · 2081~ · 2101~2112). **카드 73장**.
- 본문: 대한성서공회 **개역개정 4판** 원문(교회가 사용 허가를 받았다 — 친구 2026-10-13 · 허가 문서는 저장소에 없다). 엑셀 `자료/navi/네비게이토_구절입력_73.xlsx` I열 → `python tools/navi-fit.py --sql` → `supabase/navi_verses.sql`. **AI 가 본문을 쓰거나 고치지 않는다**(쉴만한 물가 규칙 · 도구는 공백과 **문장부호**만 다듬는다 — 2026-10-16 친구 「암송 구절에 쉼표 등은 제외」 · 2011 요 15:5 · 2028 빌 4:6-7 의 쉼표 둘 · 주간 말씀 본문도 문장부호가 없다 · 시험 ③ 이 지킨다).
- 기록: 주간과 같은 길 — `saveProgress(no, stage, "typing"|"card")` → `progress` · `challenge_log`(learn-typing / learn-typing-card) → **오늘 N회 · 도전 순위 · 가을 동행 도장에 함께 센다**. 마음에 둠도 같은 `progress.hearted`. 다른 기기와의 동기화도 저절로(로그인 병합이 번호를 가리지 않는다).
- 1단계에서 뺀 것(나중에): 나의 말씀 앨범 · 묶음별 말씀 도전 · 복습 · 딥링크(`?v=`) · 🎤 소리 내어 암송 · 🖼️ 그림(친구 2026-10-16 「그림은 제외」) · 교회 어드민 편집 화면.
- **💡 풀이 · 🧠 기억법 · 영어(NIV) — 2026-10-16 더했다**(아래 「풀이 · 기억법 · 영어」 절).

## 풀이 · 기억법 · 영어(2026-10-16 · 친구 「그림은 제외하고 나머지 진행」 → 「모두 반영」)
- **칸**: `verses.help_easy`(💡 풀이) · `help_tip`(🧠 기억법) — 주제별 줄에만(`supabase/navi_help.sql`). 영어는 주간과 같은 `text_en` · `ref_en`(「Rom 6:23」 꼴). api `naviVerseOf` 가 `helpEasy·helpTip·textEn·refEn` 으로 싣는다(시험 ②).
- **값**: `python 자료/navi/make-help-drafts.py`(초안 JSON · 검토 엑셀) → `--sql` → `자료/navi/navi_help_data.sql` → 개발 → 운영(2026-10-16 · 73구절 모두). ⚠️ **NIV 본문이 든 세 파일(초안 JSON · 엑셀 · 데이터 SQL)은 `.gitignore`** — 공개 저장소에 올리지 않는다. 다시 넣으려면 이 PC 에서 `--sql` 을 다시 돌린다.
  - 풀이 · 기억법 근거: 그 구절이 우리 교회 설교 본문에 있으면(10구절) 그 설교 요약 · 없으면 **구절 본문만**(주간 말씀 도우미 `4b-versehelp.mjs` 와 같은 원칙 · 네비게이토 해설 자료는 안 씀 — 허락 없음). 모델 claude-opus-5-5.
  - NIV: AI 초안 → **Claude 가 NIV 2011 과 한 구절씩 대조(2026-10-16 · 73 모두 맞음)** — 사람이 인쇄본과 대조하지는 않았다(친구 「모두 반영」). 성도님 제보가 오면 그 줄만 `update public.verses set text_en = … where no = … and track = 'navi'`. 레 19:11 의 문단마다 되풀이되는 짝 없는 여는 따옴표는 뺐다(`niv_clean`). NIV 2011 표현(「children of God」 · 「all this」 등)은 1984 판과 다르다 — 초안의 AI 메모 16건이 엑셀 L열에.
  - 저작권: 주간 영어 모드와 같은 NIV(Biblica) 표기를 영어 화면 · 🌐 영어 탭 아래에 둔다(`nivAttributionHtml` · `NIV_ATTRIBUTION_TEXT`).
- **화면**: 주간과 같은 부품 — `renderNaviTest` 에 `#help-slot` + app.js `fillVerseHelp(verse)`(구절에 `helpEasy`/`helpTip` 이 있으면 설교 자료를 받지 않고 그것을 쓴다 · 주간은 그대로). 탭: 💡 풀이 · 🧠 기억법 · 반대쪽 언어(한글 화면엔 🌐 영어 · 영어 화면엔 🇰🇷 한글).
- **영어로 외우기**: 별도 단추가 없다 — 주간과 같이 **⚙️ 설정 → 🌐 암송 언어 → English (NIV)**(`getLang`). `isEnMode(verse)` 가 참이면 본문 · 장절(`verseRefFull` → refEn) · 듣기(en-US) · 목록 카드 · 묶음 듣기 · Lora 글꼴(`.test-screen.en`)이 영어로.
  - ⚠️ **진도는 언어마다 따로**(주간과 같다 — `progress.lang`). js/navi.js 는 `nvLang(verse)` 를 `saveProgress` · `getPassedStage` 에 **꼭 넘긴다** — app.js `verseLang(no)` 는 전역 `verses`(주간)에서 찾으므로 주제별 구절이면 늘 `ko` 를 돌려준다(그대로 두면 영어로 외운 것이 한글 진도에 쌓인다 · 시험 ④).
- **빈칸 · 카드에 문장부호를 넣지 않는다**(친구 「암송 구절에 쉼표 등은 제외」) — `nvWords` 가 낱말 앞뒤 부호(「"Come,」의 「"」 · 「,」)를 떼어 빈칸 밖 글자(`.nv-punct` · 빈칸과 한 덩어리 `.nv-wb`)로 둔다. 「God's」 처럼 낱말 안 부호는 그대로(채점 `easyEnNorm` 이 부호를 안 본다). 줄표로 붙은 「God—this」 는 두 조각(띄우지 않고 붙여 그림). ⚠️ **영어 본문 자체는 NIV 그대로**(부호를 지우면 인용이 달라진다 · 「God's」→「Gods」) — 쓰는 칸에만 없다. 주간 영어 화면(`renderTestScreen`)은 아직 옛 꼴(빈칸에 쉼표가 붙는다) — 같게 하려면 친구에게 묻고.
- 🎤 소리 내어 암송 · 설교 연결은 여전히 없다(설교에 매이지 않은 구절).

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
- **화면 옷은 주간 암송과 같은 A안(2026-10-14 v3.635)** — `renderNaviTest` 끝에서 `applyMemoLayout(verse, stage, () => renderNaviTest(verse, stage))`. ⚠️ 세 번째 인자를 빼면 「옛 화면으로」가 `renderTestScreen`(주간)을 불러 주간 1번으로 튄다. 스위치 · 롤백은 `design-refresh.md` 「암송 · 말씀 도전 화면 A안을 모든 성도님께」.
- **목록 · 완료 창도 A(2026-10-14 v3.636)** — 묶음 목록은 흰 카드 줄 목록(`.nv-a` · `.nv-rows`) · 「‹ 묶음 목록」 테두리 단추 · 「▶ 듣기」 · 완료 창은 app.js `applyStageDoneA` 를 부른다(주간 창 함수 아님 — ④ 시험 그대로). ⚠️ 제목 템플릿 「📚 주제별 성경암송」 글자는 ⑥ 시험이 지키므로 A 는 그린 뒤 바꾼다.
- 열람 기록: 단추 누름에서 `logFeature("navi", 0)` — 서버 `FEATURES` 에 아직 없어 조용히 건너뛴다(**여는 날 더한다**).

## 여는 날(친구가 정한다) — 차례
> **2026-10-13 친구 「네비게이토 성경암송 열어 주세요」 — 진행:** ④ 서버 `FEATURES` 에 `navi`(운영 · `feature_log.sql` 머리 · 스모크 목록) ✅ · ⑤ `FEAT_SINCE.navi = "2026-10-13"` · 설명서 한 장 · 연 날 첫 화면 그 자리에서 다시 그리기(`refreshNaviOpen`) — 화면 배포 · ⑥ `naviPublic` 은 **친구가 화면을 본 뒤**(친구 「배포해 주시면 먼저 화면 확인하겠습니다」). 친구 실기기 시험 기록(운영 10/13 03:04~03:10 · 고전 10:13 · 쓰기 1·카드 2 · 다 마침 · 복습 예약 0)으로 기록 길 확인.
1. **네비게이토 이름 허락** — 이름·주제 이름·번호 체계를 화면에 써도 되는지(공개된 정책이 없다 · 한국네비게이토선교회 02-336-3387 · 출판사 02-334-3305). 허락 전이면 메뉴 이름을 「주제별 성경암송」으로(첫 화면 단추 글 · `js/navi.js` 머리 글 · 설명서).
   → **2026-10-13 친구 「주제별 성경암송」 — 허락 전이라 화면 이름을 바꿔서 연다**(다섯 자리: 첫 화면 단추 · `js/navi.js` 제목 · 못 불러옴 알림 · 설명서 제목·그림·첫 걸음 · `tests/navi.test.cjs` ⑥ 이 화면 글에 「네비게이토」가 없는지 본다). 코드 이름(`navi`·`naviPublic`·`track='navi'`)은 그대로. 묶음·주제 이름(그리스도인의 확신 …)은 그대로 — 허락을 받으면 이름을 되돌리고 ⑥ 을 함께 고친다.
2. **카드 실물 대조** — 생활 지침 8구절 주제 이름(친구가 채움) · 5확신/생활 지침 장절.
3. 플레이 심사 중이면 심사 뒤(새 화면 · 공지).
4. 서버 `FEATURES` 에 `"navi"`(+ `supabase/feature_log.sql` 머리 표 한 줄 — 값만 늘리면 SQL 을 다시 넣을 일은 없다) → `python tools/deploy-fn.py api --dev` → `--prod`.
5. 앱: `FEAT_SINCE.navi = "<여는 날>"` · 설명서(`MANUAL`)에 한 장(`when: () => naviVisible()` · 단추 자리는 A안이면 「암송 과정」) → bump → 푸시.
6. ✅ **2026-10-13 10:08 열었다**(친구 「열어주세요」 → 「주제별 성경암송」 — 화면 이름을 먼저 바꿔 배포(v3.610)한 뒤 · 개발 먼저 → 운영 · 운영 users 504 · getConfig true · `NAVI_ENV=prod … NAVI_EXPECT=73` 스모크 11/0 · 개발에서 시험 참여자 표식을 지운 계정으로 단추 「주제별 성경암송 NEW」·화면 제목 확인). 운영 `app_config`: `insert into app_config(key, value) values ('naviPublic', 'true'::jsonb) on conflict (key) do update set value = excluded.value, updated_at = now();` — 값이 바뀌면 `refreshNaviOpen` 이 첫 화면을 그 자리에서 다시 그려, 켠 날 앱을 연 그 실행부터 보인다(2026-10-13 · psalm·edu 는 다음 실행부터).
7. 확인: 시험 참여자 **아닌** 계정으로 운영에서 단추 · `NAVI_ENV=prod PROD_ANON=… NAVI_EXPECT=73 bash tests/navi-smoke.sh`.

## 시험 · 확인
- `node --test tests/navi.test.cjs`(preflight) — ① 번호대(앱·서버·지표) ② 서버 갈래·표식·허용 키 · 새 칸 넷 ③ 시드 SQL 꼴(73 · 2001~2112 · is_active 안 덮음 · delete 없음 · 본문에 숫자·괄호·영문·**문장부호** 없음) ④ 화면 순수 함수(세 값 · 영어 · 풀이 칸 · 주제 칸 · 「다음」 · `nvWords` · 쓰면 안 되는 말 · 주간 화면 함수 안 부름 · 진도 언어 nvLang).
- `DEV_ANON=… bash tests/navi-smoke.sh` · 운영 `NAVI_ENV=prod PROD_ANON=…` — 주간에 안 섞임 · 물가 1001~1999 · navi 표식·번호·칸 · `naviPublic` 허용.
- `tools/screen-sweep.py` 단계 51~54(첫 화면 단추 → 묶음 · A 묶음 · 1단계 · 3단계 C-12). 리셋에 `_naviPreview=true`.
- 2026-10-13 개발 DB 로 끝까지 눌러 봄: 묶음 7 → A(주제 6칸 · 12장 · 이 묶음 듣기 약 5분) → 1·2·3단계(쓰기·카드) → 완료 창 「다음 말씀 ▶」 → 목록 「다 마침」 → 묶음 「1구절 마침」 · 서버 `challenge_log` learn-typing / learn-typing-card · `reviews` 1000 초과 0 · 첫 화면 주간 숫자 그대로 · 반복해서 쓰기(창 없이 새 3단계) · 마음에 둠(목록 👑·힌트 · 다시 열면 3단계). 8조건 × 5화면 sweep 오류 0.
- ⚠️ app 모드 sweep 의 「상태바에 가림 (fits)」 경고가 묶음 목록(51)에 뜬다 — 한 화면에 들어가는 짧은 화면 + 로고 띠라 이벤트(29)·내 안에 거하는 말씀(31)과 같은 경고다(도구 머리: 「실기기로 한 번 보고 믿을 것」). **아이폰 앱 실기기로 확인할 것.**
