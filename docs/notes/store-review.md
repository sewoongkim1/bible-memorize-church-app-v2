# 구글 출시 심사 전 고친 것 (2026-10-01)

> **언제 읽나:** 보호자 확인(어린 부서 로그인) · 게시판 이용 규칙 · 「🙈 가리기」 · 「🚩 이 답 알리기」 ·
> 개인정보 안내의 유튜브 문구를 손볼 때. 그리고 Play Console 「앱 콘텐츠」를 다시 채울 때.
> **근거와 결정:** `store/README.md` 「구글 출시 심사 전 결정(2026-10-01)」(1~7절 · 출처 16) — 이 문서는 **만든 것**의 기록이다.
> **친구 결정(2026-10-01):** ① 「광고 포함: 예」 + 앱 안 유튜브 재생은 그대로 + 방침에 YouTube API 문구 ② 대상 13세 이상만
> ③ 어린 부서는 보호자 확인 ④ 게시판 이용 규칙 동의 · 이분 글 가리기 · AI 답 알리기.

## 무엇을 만들었나 — 파일 지도

| 무엇 | 앱(app.js) | 서버(index.ts) | 표·칸(SQL 파일) | 검사 |
|---|---|---|---|---|
| 보호자 확인 | `needsGuardian` · 로그인 화면 `#guardian-row` · `renderGuardianCheck` · `enterAfterLogin` 첫 줄 · `syncProgress` 의 `guardian_ok` | `login` 의 `guardian_ok_at` 한 번 적기 · 같은 `needsGuardian` | `users_consents.sql`(users.guardian_ok_at) | `tests/store-review.test.cjs` |
| 게시판 이용 규칙 | `BOARD_RULES`·`BOARD_RULES_VER` · `openBoardRules` · `ensureBoardRules` · `boardWriteWithRules` | `boardWriteGate`(boardPost·boardReply) · `boardRulesAccept` · `BOARD_RULES_SINCE` · boardList `rulesOk` | `users_consents.sql`(users.board_rules_at) | 같은 검사 · `tests/store-review-smoke.sh` |
| 🙈 가리기 | `blockBoardAuthor` · `openBoardBlockedList` · `#bf-blocked` · 첫 화면 배지 `fillBoardBadge`(user_id 함께) | `boardBlock`·`boardBlocks`·`boardUnblock` · boardList 거르기(`boardDropBlocked`) · `blockable` · boardCheck 거르기(`boardCountVisible`) | `board_blocks.sql` | 같은 검사 · 스모크 |
| 🚩 이 답 알리기 | `openAnswerReport` · `SERMON_REPORT_REASONS` | `sermonAnswerReport` · 관리자 `sermonAnswerReports`·`sermonAnswerReportResolve` · `sermonQuestionKey` | `sermon_answer_reports.sql` | 같은 검사 · 스모크 |
| 관리자 화면 | — | — | — | `admin-stats.html` 「게시판 관리」의 「🚩 AI 답 알림」 |
| 개인정보 | `renderPrivacyInfo` · `renderHelp` 🔒 · 로그인 화면 요약 | — | — | `privacy/index.html` 1~6항 · 세 곳이 같은지 검사 |

## ① 보호자 확인

**왜:** 대상 연령을 **13세 이상**으로 골랐다(13세 미만을 고르면 가족 정책 전체 — 광고 SDK·유튜브 자기 지정·웹뷰 등 — 가 걸린다.
README 3절). 그런데 로그인 「교회학교」에 영아·유아·유치·유년·초등부가 있으니 어린이가 쓰는 것을 **알고 있다.**
그래서 「어린이용 앱」이 아니라 **「보호자와 함께 쓰는 앱」**으로 정리했다. 한국 개인정보 보호법(만 14세 미만 →
법정대리인 동의)도 같은 자리다 — 방침 6항이 「보호자 동의를 받고 써 주세요」라는 **부탁**뿐이던 것을 **체크와 기록**으로 바꿨다.

**어느 부서에 묻나(`needsGuardian` — app.js·index.ts 두 곳, 검사가 맞대 본다):**
- **늘 묻는다:** 영아부 · 유아부 · 유치부 · 유년부 · 초등부(초6 = 만 11~12세) · **사랑부**
  - 사랑부는 나이로 가를 수 없는 부서라(교육위원회 「사랑부·어와나」 묶음 — 연령이 섞여 있을 수 있다) 보수 쪽으로 묻는다.
    ⚠️ **교회 담당자 확인 필요** — 사랑부가 어른 성도 위주라면 빼도 된다(두 곳 목록 + privacy/ 6항 + 검사).
- **학년으로 가른다:** 중등부 **1·2학년**(중1 = 만 12~13세 · 중2 는 그해 생일 전까지 만 13세). **3학년은 안 묻는다**
  (3월 새 학년에 이미 만 14세 — 2026 중3 은 2011년생). 학년 칸에 숫자가 없으면 **묻는다**(보수 쪽).
- **안 묻는다:** 고등부 · 청년부 · 교구 · 목록 밖 부서(관리자가 고친 「소년부」 등 — 화면에서 고를 수 없다)
- **학년 칸에 교사·선생·부장·전도사·강도사·목사·간사·총무**가 있으면 어른으로 본다(그 부서 선생님이 부서로 들어오신 경우).

**흐름:**
- **새 계정(웹 로그인 폼):** 어린 부서를 고르면 「보호자(부모님)가 함께 확인했어요」 줄이 나오고(`#guardian-row`) 체크해야 「시작하기」가
  된다 → 이 기기에 `guardian-ok::s|부서|학년|이름` = 날짜 → `syncProgress` 가 login 에 `guardian_ok:true` → 서버가
  `users.guardian_ok_at` 을 **처음 한 번만** 적는다(`.is("guardian_ok_at", null)`). **체크 전에는 서버에 계정을 만들지 않는다.**
- **아이폰 네이티브 로그인(`?firstLogin=1`):** 그 화면(Swift)은 이 칸을 모른다 → 웹이 열리면 `enterAfterLogin` 이 첫 화면·동기화보다
  **먼저** 확인 화면을 띄운다. **새 로그인이라 「다음에」가 없다** — 체크해야 들어간다. ⚠️ 네이티브 화면에 체크를 더하려면 Mac 빌드가 필요하다(지금은 안 했다).
- **이 기능 전부터 쓰시던 어린이:** 다음에 열 때 같은 화면이 뜨고 「다음에 할게요」가 있다 → 그날은 안 묻고(`guardian-later::`), 다음 날 다시 묻는다.
  **잠그지 않는다** — 진도를 잃게 막는 것보다 한 번 더 묻는 편이 낫다(친구 결정 「no lock-outs」).
- **다른 기기에서 이미 확인:** login 응답의 `user.guardian_ok_at` 이 있으면 이 기기도 확인한 것으로 기억한다.
- **서버는 체크가 없다고 로그인을 막지 않는다** — 옛 판 앱(캐시)·네이티브 로그인이 통째로 막히기 때문. 화면이 묻는다.
- **공용 기기:** `clearPersonalData` 가 `guardian-` 앞자리를 지운다.

**⚠️ 교회 담당자 확인 필요(법 문구) — 단언하지 않는다:**
- 「체크 한 번」이 개인정보 보호법 제22조의2·시행령이 정한 **법정대리인 동의 확인 방법**으로 충분한가
  (시행령은 문자·전화·서면 등 확인 방법을 정해 두었다). 지금 방침 6항은 「동의가 필요하다 · 체크해야 시작한다 · 날짜를 기록한다」만
  적었고 「법을 충족한다」고 쓰지 않았다. 더 센 방법(보호자 휴대폰 문자 확인 등)이 필요하다고 하면 그때 설계한다.
- 사랑부를 대상에 넣을지(위).
- 어린이 부서에 이미 있는 계정 수 — README 3절 SQL(이름 없이 부서별 숫자) · `users_consents.sql` 끝 「확인」에 보호자 확인 수도 있다.

## ② 게시판 이용 규칙

- 처음 글·답글 전에 **이용 규칙 창**(하지 말 것 여섯 줄 — 구글 UGC: "Defines objectionable content and behaviors") →
  「위 규칙을 지키겠습니다」 체크 → `boardRulesAccept` → `users.board_rules_at`. 이 기기에도 `board-rules::<user_id>` = 규칙 날짜.
- **서버가 문을 지킨다**(`boardWriteGate`) — 관리자 글이 아니면 user_id 와 규칙 동의(`BOARD_RULES_SINCE` 이후)가 있어야 받는다.
  없으면 `no-user`·`rules-needed`. 앱은 `rules-needed` 를 받으면 기억을 지우고 규칙 창을 다시 띄운 뒤 **한 번 더** 보낸다.
  ⚠️ 이제 **user_id 없는 글은 안 받는다**(예전엔 「익명」이 됐다) — 가리기도 글쓴 분을 알아야 된다.
- ⚠️ **규칙을 바꾸면** `BOARD_RULES_SINCE`(index.ts)와 `BOARD_RULES_VER`(app.js)를 **같은 날짜로** 올린다 — 모두에게 다시 묻는다.
  다르면 앱은 「동의함」이라 믿는데 서버가 막는다(검사가 본다).
- 칸이 없는 DB(SQL 전)에서는 규칙 확인이 **통과**다(막지 않는다) — 함수가 먼저 나가도 글쓰기가 멈추지 않게.
- 「📜 게시판 이용 규칙 보기」 — 게시판 위 안내 상자 끝. 언제든 읽을 수 있다.

## ③ 🙈 가리기 — 내 화면에서만

- 남의 글·답글 meta 줄에 「🙈 가리기」 — 서버가 `blockable`(글쓴 분을 아는 글 · 관리자 글 아님)을 참으로 준 글에만.
  옛 글(user_id 없는 2026-08 이전 글)·관리자 답글·공지에는 없다.
- 앱은 **글 번호만** 보낸다 → 서버가 그 글에서 글쓴 분을 찾아 `board_blocks(blocker_id, blocked_id, blocked_name)`.
  ⚠️ **blocked_id 는 어떤 응답에도 안 나간다.** 「가린 분」 목록은 **이름(가릴 때의 표시 이름)과 이 표의 줄 번호**만.
- `boardList` 가 보는 분의 가린 분을 빼고 보낸다 — 그분 글에 달린 **남의 답글도 글과 함께** 빠진다. 관리자 화면은 그대로 다 본다.
- 「🙈 가린 분 N명 · 다시 보기」 — 목록에서 「다시 보기」 = 그 줄을 지운다.
- 첫 화면 「새글 N」(`boardCheck`)도 가린 분의 글·답글을 뺀다 — 앱이 user_id 를 함께 보내고, 가린 분이 있을 때만 서버가 `boardCountVisible`(= boardList 와 같은 `boardDropBlocked`)로 센다. 응답은 숫자 하나(B · 2026-10-01).
- 알려진 빈틈: 기록 합치기(member_merge)는 board_blocks 줄이 있는 계정을 멈춘다(SQL 머리). 공감 칩의 「누른 분」 이름·공감 수는 가린 분도 센다.

## ④ 🚩 이 답 알리기 — 「내게 주시는 말씀」

- 답 아래(로그인한 분께만). 까닭 셋(설교와 다르거나 틀려요 · 불쾌하거나 부적절해요 · 기타) + 덧붙인 말 200자.
  ⚠️ **까닭은 세 곳**(app.js · index.ts · SQL CHECK) — 검사가 맞대 본다.
- 서버는 답을 **캐시(sermon_ai_cache)에서 먼저** 찾는다(`from_cache`) — 앱이 보낸 글보다 실제로 준 답이 앞선다.
  ⚠️ 캐시 열쇠는 `sermonQuestionKey` 하나 — `sermonChat` 도 이것을 쓴다(값은 예전 식과 같다). 갈라지면 「답 지우기」가 엉뚱한 줄을 지운다.
- 관리자 「게시판 관리」 → 「🚩 AI 답 알림 N」 — 질문별 묶음 · **처리 완료**(답은 그대로) / **답 지우기**(캐시를 지워 다음 같은 질문 때
  새로 만든다 — 같은 질문의 열린 알림을 모두 닫는다). 알린 분은 관리자에게도 안 보인다. 처리 뒤 **90일**이면 지운다(cron + 목록 열 때).
- 알림: `boardAdmins`(게시판 신고와 같은 분들)께 10분에 한 번까지 Web Push(push_log `answer-report`) — 본문에 질문·답 없음.

## ⑤ 개인정보 — 세 곳이 같은 말을

`privacy/` · `renderPrivacyInfo` · `renderHelp` 🔒 에 같은 항목이 있어야 한다 — `tests/store-review.test.cjs` 의 `PRIVACY_ITEMS` 가
배포 앞에서 본다(열람 기록 · 공감·순위 응원 · 이벤트 신청 · 음성 인식 · 이용 규칙 · 가린 분 · AI 답 알림 · 보호자 확인 · 유튜브 넷 + 링크 둘).
⚠️ 새로 무엇을 모으기 시작하면 **이 목록에 한 줄 더하고** 세 곳과 `store/README.md` 5절 표를 같은 날 고친다.

**유튜브(친구 결정 1):** YouTube API Services 개발자 정책 III.A 가 방침에 요구하는 것 — API 서비스를 쓴다 · YouTube 서비스 약관
링크(https://www.youtube.com/t/terms) + 「쓰시면 약관에 동의」 · 구글 개인정보처리방침 링크(https://policies.google.com/privacy) ·
제3자가 광고를 보여 줄 수 있다 · 기기에 정보를 저장·읽을 수 있다. 앱 안 재생(파사드 · nocookie · `docs/notes/today-song.md` 규칙)은 **그대로**다.
⚠️ 우리는 별도 「이용약관」 페이지가 없어 약관 동의 문장을 방침(2항 `#youtube`)과 앱 안 두 곳에 두었다.

## 배포 순서(컨트롤러) — 표·칸이 먼저

1. 개발 SQL: `users_consents.sql` → `board_blocks.sql` → `sermon_answer_reports.sql`(각 파일 끝 「확인」)
2. 개발 api 배포 → `bash tests/store-review-smoke.sh` · `bash tests/board-report-smoke.sh` · localhost 화면 확인
3. 운영 SQL 셋 → `check-authenticated-exposure.sql` 0행
4. 운영 api 배포 → `SR_ENV=prod bash tests/store-review-smoke.sh`
5. `python tools/bump.py` → 푸시(= 프런트 배포) → 「이번 판에만 있는 표식」 확인
⚠️ **api 를 프런트보다 먼저.** 프런트(새 앱)가 먼저 나가면 「🙈 가리기」·「알리기」가 unknown action 으로 실패하고, 규칙 창의 동의가 저장 안 된다.
⚠️ api 가 먼저 나가고 프런트가 늦으면 **옛 앱의 글쓰기가 `rules-needed` 로 막힌다**(몇 분 — 「등록 실패: rules-needed」). 두 배포를 붙여서 한다.
