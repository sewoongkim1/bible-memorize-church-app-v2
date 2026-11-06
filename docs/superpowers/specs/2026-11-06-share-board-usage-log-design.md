# 보내기 · 게시판 이용 기록(누가) — 설계 (2026-11-06)

> 친구 요청: 「카카오 등의 공유를 누가 사용하는지, 그리고 게시판을 누가 보는지의 정보를 확인할 수 있도록 로깅을 해 주세요」.
> 친구가 정한 것(2026-11-06): 심사 중인 판 없음 · 보는 곳 = 교회 어드민 📊 성경암송 통계 새 탭 · 보관 = 다른 열람 기록처럼 운영하는 동안 · 만 14세 미만 어린 부서는 빼고 기록.
> 조사: 워크플로 wf_2efa673d-df4(기존 열람 기록 · 진입점 · 교회 어드민 · 개인정보 네 갈래 + 검토).

## 1. 한 줄 요약
이미 운영 중인 **열람 기록 표 `feature_log`**(사람 × 한국 날짜 × 값 × 항목 → 그날 횟수 `cnt`)에 **값 다섯**을 더해 남기고,
교회 어드민 「📊 성경암송 통계」에 **「📤 보내기 · 💬 게시판」 탭**을 더해 이름 · 소속별로 본다. 새 표 · SQL 은 없다(값에 CHECK 가 없다 · `feature_log.sql:21`).

## 2. 이름 표 — 네 갈래(서버 · 앱 · 개인정보 · 교회 어드민)가 함께 쓰는 약속
### 2-1. 값(feature) 다섯
| 값 | 언제 한 줄을 남기나(정확한 자리) | item |
|---|---|---|
| `board` | 게시판 화면을 그릴 때 — `renderBoard()` 첫 줄, `markBoardSeen()` 앞(부르는 곳은 첫 화면 `#open-board` 하나) · `loadBoard`·서버 `boardList` 에는 넣지 않는다(글쓰기 · 공감 · 가리기 뒤마다 다시 불리고 교회 어드민도 부른다) | `0` |
| `share-open` | 보내기 판(`pshOpen`)을 **새로** 열 때 — `pshReuse` 로 다시 쓰는 판은 세지 않는다 · 관리자 묵상 미리보기에서 연 판은 남기지 않는다 | 종류 코드 `1`·`2`·`3` |
| `share-kakao` | `pshKakaoGo` 에서 `Kakao.Share.sendDefault` 가 예외 없이 끝난 다음 줄(첫 누름 · 늦게 뜬 「카카오톡 열기」 둘 다 여기를 지난다) · 통신 끊김 · SDK 예외 · 그림 올리기 실패는 세지 않는다 | `3` |
| `share-sheet` | `navigator.share(...)` 가 **resolve** 했을 때(공유 창에서 앱을 골랐다) · `AbortError`(닫음) · `InvalidStateError`(이미 떠 있음)는 세지 않는다 | 종류 코드 |
| `share-save` | 공유 창이 없거나 실패해 **그림 내려받기를 시작**했을 때, 또는 **글 · 주소 복사가 끝났을 때** | 종류 코드 |

- 이름은 소문자와 하이픈만(`tests/navi.test.cjs` ⑤ 가 `[a-z-]+` 로 본다).
- 「보냈다」는 어느 길로도 알 수 없다 — 카카오 `sendDefault` 는 결과를 돌려주지 않고, 공유 창은 어느 앱을 골랐는지 · 실제로 보냈는지 알려 주지 않는다. 그래서 기록 이름도 화면 글도 **「카카오톡을 열었다 · 공유 창으로 넘겼다 · 내려받았다/복사했다」** 까지만 쓴다.

### 2-2. 종류 코드(item) — 무엇을 보내나
| 코드 | 무엇 | 어디서 |
|---|---|---|
| 1 | 가정 축복 기도문(그림) | 기도문 화면 · 「🙏 오늘의 기도」 창 → `openPrayShare` |
| 2 | 오늘의 묵상(그림) | 묵상 창 → `openMedShare` |
| 3 | 이번 주 말씀(그림 · 카카오 카드) | 첫 화면 카카오톡 아이콘 → `openVerseShare` |
| 4 | 가을 말씀암송 동행 안내(글) | 「📢 목장에 알리기」 `shareEvent` |
| 5 | 앱 소개(글) | 설정 「🔗 공유하기」 `shareApp` |
| 6 | 외운 말씀(글) | 암송 마침 「🙌 말씀 나누기」 `shareMyVerse` |
| 7 | 교육 수료증(그림) | `js/edu.js` 수료증 |
| 8 | 앱 설치 주소(글) | 이번 주 말씀 판 둘째 단계(`pshSendLink` · `pshCopyLink`) |
| 9 | 이번 주 말씀 주소(글) | 첫 화면 옛 단추 `shareWeeklyVerse`(지금 숨김 `WEEKLY_SHARE=false` — 켜면 그대로 세진다) |

- 관리자 묵상 미리보기(`?preview=daily` → `previewDailyMessage` → `showMeditationModal` 의 source `"preview"`)에서 연 판은 **그 판에서 일어난 일을 하나도 남기지 않는다**(판 열기 · 카톡 · 공유 창 · 저장 모두) — 판 상태에 표식(`pshState.noLog`)을 둔다.
  범위는 **묵상 판만**이다(2026-11-06 검토): 미리보기 창의 「🙏 기도」 단추 → 「오늘의 기도」 창 → 기도문 판은 표식을 넘기지 않아 남는다 — 관리자 본인이 두 번 더 눌러야 하는 좁은 길이라 그대로 둔다(교회 어드민 탭에 그 관리자 줄이 보이면 이 까닭).
- 복사 성공은 `navigator.clipboard.writeText` 가 resolve 했을 때, 또는 옛 길 `document.execCommand("copy")` 가 `true` 를 돌려줬을 때.

### 2-3. 남기지 않는 것
기도문 판의 이름 칸(「누구를 위한 기도인가요?」 · `pshState.name`) · 받는 분 · 고른 앱 · 글 내용 · 파일 이름 · 어느 게시판 글을 읽었는지.
로그인 전(딥링크 `?v=` 손님 등)은 `logFeature` 가 `user_id` 가 없어 저절로 빠진다.

### 2-4. 어린 부서(만 14세 미만)는 남기지 않는다
판정은 이미 있는 `needsGuardian()` 하나(화면 `app.js:2610` · 서버 `supabase/functions/api/index.ts:4950` — 같은 규칙).
- 화면: `logFeature` 가 다섯 값은 `needsGuardian(loadUser())` 면 보내지 않는다.
- 서버: `featureLog` 가 다섯 값은 `users`(type · bu · grade)를 읽어 `needsGuardian` 이면 `{ ok: true, skipped: "guardian" }` · 읽기 실패도 남기지 않는다.
- 읽기: `featureUsage` 도 `needsGuardian` 인 줄은 뺀다(세 겹).

### 2-5. 서버 읽기 액션 `featureUsage`(성경암송 api · 관리자 전용)
- 본보기는 `blessingUsage`(`supabase/functions/api/blessing.ts:88`) — `adminError` 먼저 · `fetchAllRows`(1,000줄 쪽 넘기기) · `users` 잇기 · 기간 `from`/`to`(한국 날짜 · `day` 로 거름) · 표가 없는 DB 에서도 빈 결과.
- 읽는 값은 **이 다섯뿐**(시편 · 묵상 같은 다른 열람 기록을 이름째 열지 않는다).
- 응답에 **`user_id` 를 싣지 않는다**(이 API 에는 JWT 가 없다 — 남의 `user_id` 하나면 그 사람 행세가 된다).
- 교회 어드민이 내부 키로 부르므로 `INTERNAL_ADMIN_OK` 에 넣는다.
- 자리: `supabase/functions/api/index.ts` 의 `featureLog` 바로 아래(같은 파일의 `needsGuardian` 을 그대로 쓴다 · `adminError` · `fetchAllRows` · `db` 는 이미 `_shared.ts` 에서 가져와 있다) · switch 에 `case "featureUsage"`.
- 받는 것: `{ from?, to? }`(한국 날짜 `YYYY-MM-DD` · 없으면 기간 제한 없음 — `blessingUsage` 와 같다).
- 응답 꼴(칸 이름은 `blessingUsage` 의 `gubun · sosok · sebu` 를 따른다 — 교회 어드민 `blessingWho` 꼴을 다시 쓸 수 있게):
  ```
  { ok: true,
    summary: { board: { people, count }, share: { people, count } },
    byKind:  [{ item, label, open, kakao, sheet, save, people }],          // item 1~9 · 쓰인 종류만
    byUser:  [{ gubun, sosok, sebu, name, boardDays, boardCount, open, kakao, sheet, save, last }] }
  ```
  - `board.people` = 게시판 줄이 있는 분 수 · `board.count` = 그 cnt 합.
  - `share.people` = `share-kakao`·`share-sheet`·`share-save` 줄이 하나라도 있는 분 수 · `share.count` = 그 셋의 cnt 합(판 열기는 넣지 않는다 — 열고 안 보낸 분을 가르려고).
  - `byKind` — 종류(item)마다 `open`·`kakao`·`sheet`·`save` 는 cnt 합, `people` 은 그 종류로 kakao·sheet·save 를 한 분 수 · `label` 은 2-2 의 「무엇」을 서버가 붙인다(종류 이름은 서버 한 곳 `SHARE_KINDS`) · item 차례대로.
  - `byUser` — `gubun` = users.type · `sosok` = gu 또는 bu · `sebu` = mok 또는 grade(`blessingUsage` 와 같다) · `boardDays` = 게시판 줄이 있는 날 수 · `boardCount`·`open`·`kakao`·`sheet`·`save` = cnt 합 · `last` = 다섯 값 가운데 가장 늦은 날 ·
    차례는 (boardCount + open + kakao + sheet + save) 큰 순, 같으면 `last` 늦은 순.
  - 기록이 없거나 표가 없는 DB: `{ ok: true, summary: { board: { people: 0, count: 0 }, share: { people: 0, count: 0 } }, byKind: [], byUser: [] }`.

### 2-6. 교회 어드민 화면
- 「📊 성경암송 통계」(`js/menus/memorize/stats.js` · `stats-logic.js`) 다섯째 탭 **「📤 보내기 · 💬 게시판」** — 기간 고르기는 다른 탭과 같은 것.
- 위: 요약(게시판 연 분 · 횟수 / 보내기 쓴 분 · 횟수) → 가운데: 종류별(판 열기 · 카톡 열기 · 공유 창 · 내려받기·복사) → 아래: 누가(구분 · 소속 · 이름 · 게시판 날수·횟수 · 카톡 · 공유 창 · 저장 · 판 열기 · 마지막 날) · 모두 `esc`.
- 역할: 지금 📊 통계와 같은 `memorizeadmin`(총괄은 늘 통과). 서버 `authz.ts` `ACTION_ROLES` · `index.ts` 성경암송 중계 case · `tests/server.dev.test.mjs` PROBE 셋을 함께. 읽기라 `MEM_WRITE` 에는 넣지 않는다.
- 내려받기(CSV)는 만들지 않는다(📊 통계의 원칙 — `stats.js:7-9`).
- 「한 번 보면 나가는 숫자」임을 화면에 한 줄로: 「카톡인지 문자인지, 실제로 보냈는지는 앱이 알 수 없어요 · 날짜까지만 남아요 · 만 14세 미만 어린 부서는 남기지 않아요」.

### 2-7. 개인정보 안내(사실인 말만 · 같은 날)
- 앱 세 자리 — `privacy/index.html`(1항 「열람 기록」 줄에 게시판 · 새 줄 「보내기 기록」 · 「주로 합계로」 → 「합계와 함께 누가(이름·소속)」 · 4항 첫 `</ul>` 안 · 5항 지워지는 것 · 「마지막 수정」 날짜) · `app.js` `renderPrivacyInfo`(열람 기록 li · 보내기 기록 li · 이용 목적 「기능이 쓰이는지 살펴 앱을 고치는 일」) · `renderHelp` 🔒(그 밖에 남는 것 · 공개 범위).
- 담는 말: 무엇(게시판을 연 날·횟수 · 보내기 판 열기 · 카카오톡 열기 · 공유 창으로 넘김 · 내려받기·복사의 날·종류·횟수) · 왜(기능이 쓰이는지 보고 앱을 고치기 위해) · 누가 보나(운영진 — 총괄 · 성경암송 담당자만 이름·소속과 함께) · 남지 않는 것(받는 분 · 실제로 보냈는지 · 고른 앱) · 어린 부서는 남기지 않음 · 보관(운영하는 동안 · 계정을 지우면 함께).
- 그대로 둘 것: 2항 카카오 줄 · 앱 안 카카오 절 · 도움말 카카오 문장(`tests/pray-share.test.cjs` 850~857 정규식 — 「보내시는 분의 이름·소속 같은 개인정보는 없습니다」는 카카오로 가는 것 이야기라 계속 참) · 로그인 화면 동의 문장(「자세히 보기」에 적으면 참).
- 교회 어드민 `privacy.html` — 성경암송 메뉴에서 열람 기록(게시판 포함) · 보내기 기록을 이름·소속별로 본다는 한 줄.
- 스토어: 플레이 데이터 보안 「앱 상호작용 · 수집 · 필수 · 앱 기능 · 분석」은 이미 신고돼 있어 칸은 그대로 · `자료/store/README.md` 5절 「무엇」 칸에 「게시판 열람 · 보내기 단추」 · 아이폰 App Privacy 「제품 상호작용」 목적에 「분석」이 있는지 다음 제출 때 확인(담당자 확인 목록).

## 3. 배포 차례(이 차례가 아니면 기록이 조용히 버려지거나, 방침보다 기록이 먼저 쌓인다)
1. **api**(`FEATURES` 다섯 · 어린 부서 거르기 · `featureUsage` · `INTERNAL_ADMIN_OK`) — `python tools/deploy-fn.py api --dev` → 개발 스모크 → main 푸시 → `--prod` → 운영 스모크.
   앱이 아직 다섯 값을 안 보내므로 이 단계에서는 아무것도 쌓이지 않는다.
2. **앱 + 방침 세 자리 한 번에**(release · bump) — 이 판부터 기록이 쌓인다. 방침과 같은 판이라 「적은 것 외에는 모으지 않습니다」가 계속 참.
3. **교회 어드민**(함수 개발 → 운영 · 화면 푸시) — 1 다음이면 아무 때나(읽기만).
앱이 api 보다 먼저 나가면 새 값이 `{ ok: true, skipped: true }` 로 버려져 그 구간이 영영 빈다(메모리 feature-log-live).

## 4. 시험
- api: `tests/navi.test.cjs` ⑤(값이 FEATURES · `feature_log.sql` 머리 표 · `tests/feature-log-smoke.sh` 목록에 다 있나) · 어린 부서 거르기 · `featureUsage` 가 `INTERNAL_ADMIN_OK` 에 있고 응답에 `user_id` 가 없다 · 개발 스모크(다섯 값 쓰기 · 어린 부서 skipped · 비번 없이 `featureUsage` 는 닫힘).
- 앱: `tests/pray-share.test.cjs`(판 열기 · 카톡 · 공유 창 · 내려받기 · 복사 · 취소는 안 셈 · 미리보기는 안 셈 · 이름 칸 값이 실리지 않음 — vm 에 가짜 `logFeature`) · `shareLink` 종류 · 게시판 한 줄 · `logFeature` 어린 부서 거르기 · 고친 자리를 글자로 잡던 정규식(221 · 228 · 232 · 233) 손보기.
- 개인정보: `tests/store-review.test.cjs` PRIVACY_ITEMS 에 「보내기 기록」 · 5항 목록 · `event-auto` ⑪(4항 첫 `</ul>`) · `board-report`(3항) 그대로.
- 교회 어드민: `tests/mem-stats-logic.test.mjs`(탭 다섯 · 보기 함수) · `ACTION_ROLES` · PROBE.
- 운영 확인: 시험 계정으로 게시판 · 판 셋 · 카카오 · 공유 창 · 취소를 한 번씩 → 교회 어드민 탭에서 이름이 뜨는지(취소는 안 떠야).

## 5. 위험과 막는 법
- **방침보다 기록이 먼저** → 2 의 한 판에 함께.
- **user_id 새는 것** → `featureUsage` · 화면 어디에도 안 싣는다 · 뷰를 만들지 않는다 · `feature_log` 정책을 더하지 않는다(`TO authenticated` 금지).
- **기록을 지어낼 수 있다**(JWT 없음 — 남의 `user_id` 로 `featureLog`) → 「누가」 표는 참고이지 증거가 아니다(화면 한 줄로 알린다).
- **감시로 느껴질 수 있다** → 성도님께는 어디에도 보이지 않고, 운영진만, 방침에 적은 용도로만.
- **시험이 글자를 잡고 있다** → pray-share 정규식 · store-review · event-auto ⑪ · board-report 를 같은 커밋에서 맞춘다 — 깨진 채 오르면 모든 세션의 배포가 막힌다.
- **공용 체크아웃** → 갈래마다 손으로 만든 git worktree · 경로 지정 커밋 · `git apply --cached`.
- **첫날 숫자가 낮다** → 켜 둔 앱에는 옛 `js/pray-share.js` 가 남는다(다시 켤 때까지) — 「안 쓴다」로 읽지 않는다.
- **날짜까지만**(시각 없음) · 60초 안 같은 값은 한 번 · 공용 기기는 그 기기의 이름으로.
