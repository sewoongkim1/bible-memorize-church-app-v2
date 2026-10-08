# 게시판(응원·기도·공감) · 사진

> CLAUDE.md 에서 옮겨 온 상세 기록이다(2026-09-12, 두 겹으로 나눔 — 내용은 한 글자도 안 고쳤다).
> **언제 읽나:** 게시판 글·답글·사진 업로드(`boardPost`·`boardUpload`·`boardList`)를 손볼 때
> ⚠️ 여기 ⚠️ 표시는 대부분 **실제로 한 번씩 사고를 겪고** 남긴 것이다. 요약해 옮기지 말고 그대로 둘 것.

- **게시판 사진(2026-08-25):** 글 하나에 **최대 4장**(`BOARD_PHOTO_MAX`), **답글에는 없다**(화면이 복잡해진다). **브라우저 → Edge Function(`boardUpload`) → Storage** 순으로 올린다 — 브라우저가 Storage로 직접 올리게 두면 이 API는 JWT가 없어 **공개 키로 아무나 아무거나 올릴 수 있다.** ⚠️ **사진은 반드시 브라우저에서 캔버스로 다시 그려 보낸다**(`shrinkImage`): ① **크기 — 이게 실제로 폰에서 업로드를 끊었다.** 1280px·품질 0.8은 한 장이 1MB를 넘겨 「Failed to fetch」가 났다(2026-08-25). **1080px·품질 0.7 → 300KB 근처**(`BOARD_PHOTO_TARGET`)로 낮추니 됐다. 품질을 다 낮춰도 크면 그림 자체를 한 번 더 줄인다 — 잘게 찍힌 사진은 품질만으로 안 준다. **화질보다 '올라가는 것'이 먼저다.** 서버·CORS·서비스워커·배포는 모두 무죄였다(5MB 본문도 CORS 머리글과 함께 정상 응답했고, `sw.js`는 POST를 그냥 통과시킨다) — **다음에 같은 증상이면 그 넷을 다시 뒤지지 말고 크기부터 볼 것.** ② **더 중요 — EXIF에 찍은 장소의 GPS가 들어 있다.** 그대로 올리면 집에서 찍은 사진에 집 주소가 붙어 공개 게시판에 올라간다. 캔버스로 다시 그리면 화소만 남고 EXIF가 사라진다. 한 장씩 올리며 「(2/4)」를 보여 준다 — 말없이 멈춰 있으면 어르신은 고장인 줄 알고 다시 누르신다. **DB에는 파일 이름만** 저장하고 주소는 내보낼 때 만든다(`boardImgUrl`); 이름은 UUID라 짐작할 수 없다. 통은 **public** — 주소를 아는 사람은 앱 밖에서도 볼 수 있고, 그 사실을 개인정보 안내에 적어 두었다. **글을 지우면(본인 삭제 포함) 사진도 지운다**(`boardDropImages`) — 관리자가 되살리면 글만 돌아온다. 관리자 물리삭제는 **행을 지우기 전에** 사진을 치운다(지운 뒤엔 어떤 파일이었는지 알 길이 없다). 준비: `supabase/board_images.sql`(images 컬럼 + 통 + 익명 쓰기 정책 없음). 실행 전엔 사진만 안 올라가고 글은 정상이다(폴백).

- **게시판(응원·기도·공감):** ⚠️ `boardList`는 **응답에 `user_id`를 싣지 않는다**(2026-08-24 수정 — 그전엔 `select("*")` 결과를 `...row`로 통째로 펼쳐 모든 글·답글의 작성자 `user_id`가 새어 나갔다). 클라이언트가 필요한 건 「내 글인가」 하나뿐이라 **`isMine` 참/거짓만** 내려준다. 본인 글 판별은 `isMine` 또는 소속+이름 일치(옛 글). **새 액션을 만들 때도 같은 규칙** — 이 API는 JWT가 없어 남의 `user_id`가 새면 그 이름으로 글쓰기·진도 저장·순위 응원까지 가능해진다.

- **게시판(응원·기도·공감):** 2026-08-15 「질문 나눔」에서 이름을 바꿨다 — 질문은 AI 「내게 주시는 말씀」이 받고, 게시판은 성도 간 격려 전용으로 성격을 옮겼다. boardList/Post/Reply, 관리자 moderate · 공감 이모지 👍🙏❤️😊🎉(`board_reactions`, boardReact/boardReactors) — 여러 개 누를 수 있고 칩을 누르면 누른 사람 이름

## 🚩 신고 (2026-10-01)

> **언제 읽나:** 신고 단추·신고 창·관리자 「🚩 신고 N」·`board_reports` 를 손볼 때.
> 표 `supabase/board_reports.sql` · 서버 `boardReport`·`boardReports`·`boardReportResolve`(index.ts 「게시판 신고」 블록) ·
> 앱 `openBoardReport`(app.js) · 관리자 `loadBoardReports`(admin-stats.html) · 검사 `tests/board-report.test.cjs`·`tests/board-report-smoke.sh`

- **왜 만들었나:** 구글 플레이 「사용자 제작 콘텐츠(UGC)」 정책이 **앱 안에서 불쾌한 글을 신고하는 길**과 그것을 처리하는 운영을 요구한다. 아이폰은 「운영진이 게시판을 직접 살핀다」는 설명으로 심사를 통과했지만, 구글은 문구가 「앱 안 신고」다. 플레이스토어 앱은 이 웹을 그대로 띄우는 껍데기(TWA)라 **웹에 넣으면 앱에도 그대로 보인다**(새 빌드가 필요 없다).
- **흐름:** 남의 글·답글 meta 줄 끝 「🚩 신고」 → 앱 고유의 창(`.am-overlay` — 시스템 `confirm`·`alert`·`prompt` 를 쓰지 않는다)에서 까닭 넷(부적절한 내용 · 광고·도배 · 개인정보 노출 · 기타) 중 하나 + 덧붙일 말(선택, 200자) → 「신고했어요 — 운영진이 확인할게요」 토스트, 단추는 「🚩 신고함」으로 잠긴다. 관리자 「게시판 관리」 맨 위 「🚩 신고 N」 — 글·답글별로 몇 분이·무슨 까닭으로·덧붙인 말·사진 → **숨기기**(기존 `boardModerate` hide 를 그대로 쓰고 신고를 닫는다 · 숨김해제는 아래 목록에서) / **처리 완료**(글은 두고 신고만 닫는다).
- **단추가 안 붙는 곳:** 내 글(삭제 단추 자리 — `boardIsMine` 은 소속+이름 일치도 내 글로 본다) · 관리자 답글(`is_admin`) · 관리자 공지(`rich`). 서버도 본인 글이면 `own` 으로 막는다(user_id 가 있는 글만 — 옛 글은 화면이 막는다).
- ⚠️ **신고한 분(`reporter_id`)은 어떤 응답에도 싣지 않는다 — 관리자 목록에도.** 서버는 고르지도 않는다(`select("id,post_id,reply_id,reason,note,created_at")`). 운영진에게 필요한 것은 「어느 글이 · 몇 분에게 · 무슨 까닭으로」이고, 누가 신고했는지가 새면 보복이 생긴다. 이 API 는 JWT 가 없어 user_id 가 새면 그 사람 행세가 된다(위 boardList 사고). 꼭 봐야 하면 SQL Editor 에서.
- ⚠️ **까닭 목록은 세 곳이다** — `app.js BOARD_REPORT_REASONS`(칩) · `index.ts BOARD_REPORT_REASONS`(+ 관리자 화면 글씨 `BOARD_REPORT_LABELS`) · `board_reports.sql` CHECK. 한 곳만 고치면 화면은 열리는데 저장이 막힌다(DB CHECK 에 걸려 500). `tests/board-report.test.cjs` 가 셋(그리고 글씨)이 같은지 **preflight 에서** 맞대 보므로 하나만 고치면 배포가 멈춘다. DB 값은 영어 코드라 글씨를 바꿔도 CHECK 는 안 건드린다.
- ⚠️ **한 분이 한 글(답글)을 한 번만** — unique 인덱스 `(reporter_id, post_id, coalesce(reply_id,0))`. 두 번째는 서버가 `{ ok:true, already:true }` 로 받고 앱은 **같은 인사**를 보인다. 「이미 신고하셨습니다」 오류로 보이면 어르신은 고장인 줄 아신다. 처리 완료된 글을 같은 분이 다시 신고해도 「이미」다(다른 분의 신고는 새로 열린다).
- ⚠️ **보관 90일은 개인정보 안내가 약속한 숫자다.** 처리 전은 처리될 때까지, 처리 뒤(숨김·처리 완료)는 90일 뒤 지운다 — pg_cron `board-reports-purge`(매일 03:40 KST) + 관리자가 신고 목록을 열 때 서버가 한 번 더(cron 없는 DB 대비). 글이 지워지면(관리자 완전삭제) cascade 로, 신고한 분의 users 행이 지워지면 cascade 로 함께 지워진다. ⚠️ **글쓴 분이 직접 지운 글(`boardDeleteMine` — `deleted` 표시뿐)의 신고는 안 지워진다** — 관리자 목록에 「본인삭제」로 계속 열려 있다가, 처리하면 그때부터 90일이다. 같은 방침에서 「글을 지우면」은 본인 삭제를 뜻하므로(4항 사진 · 5항 「내 글 지우기」) `privacy/` 3항은 둘을 나눠 적는다 — 처음엔 「신고된 글이 지워지면 신고도 함께 지워진다」고 뭉뚱그려 지켜지지 않는 약속이 될 뻔했다(검사가 본다). **본인 삭제가 신고를 지우게 바꾸지 말 것** — 글은 되살릴 수 있어서, 욕설을 쓰고 신고받은 뒤 스스로 지워 처리 기록을 없애는 길이 생긴다. 숫자를 바꾸려면 `BOARD_REPORT_KEEP_DAYS` · SQL cron · `privacy/` 1·3·4·5항 · 앱 안 두 곳(`renderPrivacyInfo`·`renderHelp`)을 함께 — 검사가 「90일」 이 그 자리들에 다 있는지 본다.
- **알림:** 신고가 들어오면 app_config `boardAdmins`(identity_key 배열 — `pilsaAdmins` 와 같은 방식, 등록은 `board_reports.sql` 맨 아래 주석)의 폰으로 Web Push. ⚠️ 쏟아지지 않게 **그 글의 첫 신고일 때만 · 10분에 한 번까지**(push_log `board-report` 로 본다) — 비번 없는 로그인이라 한 사람이 계정을 여럿 만들어 신고를 쏟을 수 있다. 본문에 글 내용도 신고한 분도 안 싣는다(잠금 화면에 뜬다). 알림이 실패해도 신고는 받는다(`try/catch`). `boardAdmins` 가 비면 알림 없이 관리자 화면에만 쌓인다. monitor 는 push_log 의 daily 행만 보므로 헛경보가 안 난다.
- **표가 없을 때:** `boardReport`·`boardReports`·`boardReportResolve` 가 `not-ready` 로 답한다(500 아님) — 앱은 「지금은 신고를 받을 수 없어요」, 관리자는 「신고 표가 아직 없습니다」. 그래도 순서는 **표 먼저**(새 표에 새 액션만 얹는 경우 — CLAUDE.md 「배포 순서는 기능마다 다르다」).
- ~~⚠️ **기록 합치기(member_merge.sql)의 빈틈:** 합치기는 users 를 가리키는 모르는 FK 가 있으면 멈춘다(`merge-unsupported-records`). 신고를 한 번이라도 한 계정을 「옮겨 가는 쪽」으로 합치려 하면 멈춘다(기록은 안 잃는다). 생기면 그 계정의 처리된 신고를 지우거나 member_merge 에 `board_reports(reporter_id)` 옮기기를 더한다(같은 글을 둘 다 신고했으면 한 줄만 — unique).~~
  → **2026-10-01 같은 날 옮기기를 더했다** — 줄 번호·처리 상태를 지킨 채 `reporter_id` 만 남는 번호로. 같은 글(답글)을 둘 다 신고했으면 한 줄 — 처리 전 줄이 옮겨 가는 쪽에만 있으면 그 줄(처리 전 신고가 관리자 목록에서 사라지면 안 된다), 아니면 남는 쪽 줄. ⚠️ users 를 가리키는 새 표를 만들면 `member_merge.sql` 머리 「실행 순서」의 넷을 함께 더한다 — 빠뜨리면 `tests/member-merge-coverage.test.cjs` 가 배포 앞에서 멈춘다. 기준표 `docs/member-profile-admin.md`.
- ~~**차단(사용자 막기)은 없다.**~~ → **2026-10-01 「🙈 가리기」를 넣었다**(아래 절). 구글 UGC 하위 규칙에 「사용자 차단」이 있고, 우리 앱은 아무 이름으로나 들어올 수 있어 「공개 UGC」로 읽힐 수 있어서다(자료/store/README.md 4절 ③). 운영진 조치(숨기기·완전삭제)는 그대로다.
- **신고 창 문구(2026-10-01):** 「운영진이 **이 글과 글쓴 분**을 함께 살펴요」 — 구글의 「콘텐츠·**사용자** 신고」를 신고 창 하나로 답한다(따로 「사용자 신고」 단추를 두지 않는다).

## 📜 이용 규칙 · 🙈 가리기 (2026-10-01)

> **언제 읽나:** 이용 규칙 문구·동의 창, 가리기 단추·「가린 분」 목록, `boardWriteGate`·`board_blocks` 를 손볼 때.
> 표·칸 `supabase/users_consents.sql`(users.board_rules_at) · `supabase/board_blocks.sql` · 서버 `boardWriteGate`·`boardRulesAccept`·
> `boardBlock`·`boardBlocks`·`boardUnblock`·boardList 거르기(index.ts 「구글 출시 심사 전」 블록) · 앱 `openBoardRules`·`blockBoardAuthor`·
> `openBoardBlockedList` · 검사 `tests/store-review.test.cjs`·`tests/store-review-smoke.sh` · 전체 기록 `docs/notes/store-review.md`

- **왜:** 구글 UGC 정책 — "Requires users accept the app's terms of use and/or user policy **before users can create or upload UGC**" ·
  "Defines objectionable content and behaviors" · 공개 UGC 는 "report users and content, and **to block users**".
- **이용 규칙:** 처음 글·답글을 쓰기 전에 한 번 — 하지 말 것 여섯 줄(`BOARD_RULES`) + 「위 규칙을 지키겠습니다」 체크 → 서버 `users.board_rules_at`.
  ⚠️ **서버가 문을 지킨다**(`boardWriteGate` — boardPost·boardReply 둘 다). 관리자 글(비번)은 지나간다. **user_id 없는 글은 이제 안 받는다**(`no-user`).
  ⚠️ 규칙을 바꾸면 `BOARD_RULES_SINCE`(index.ts)·`BOARD_RULES_VER`(app.js)를 **같은 날짜로** 올린다 — 모두에게 다시 묻는다(검사가 둘을 맞대 본다).
  ⚠️ 앱이 「동의함」이라 기억하는데 서버가 `rules-needed` 를 주면(다른 기기·규칙 날짜 변경) 기억을 지우고 규칙 창을 다시 띄운 뒤 **한 번 더** 보낸다(`boardWriteWithRules`).
  칸이 없는 DB(SQL 전)는 규칙 확인이 **통과**다 — 함수가 먼저 나가도 글쓰기가 멈추지 않게.
- **가리기:** 남의 글·답글 meta 줄 「🙈 가리기」 → 앱 창(시스템 창 아님)으로 한 번 확인 → **내 화면에서만** 그분의 글·답글이 빠진다(상대는 모른다).
  ⚠️ **앱은 글 번호만 보낸다 — 글쓴 분은 서버가 찾는다.** `blocked_id` 는 어떤 응답에도 안 나간다(이 API 는 JWT 가 없어 user_id 가 새면 그 사람 행세가 된다).
  게시판 응답의 글마다 `blockable` 은 **참/거짓만**(글쓴 분을 아는 글 · 관리자 글 아님) — 옛 글(user_id 없음)·관리자 답글·공지에는 단추가 없다.
  그분 글에 달린 **남의 답글도 글과 함께** 빠진다(글이 안 보이니 매달 곳이 없다). 관리자 화면(boardList pw)은 거르지 않는다.
- **「🙈 가린 분 N명 · 다시 보기」:** 이름(가릴 때의 표시 이름 `blocked_name`)과 이 표의 줄 번호만 내려온다 → 「다시 보기」 = 그 줄을 지운다(`boardUnblock` — 내 줄만).
- **첫 화면 「새글 N」도 가린 분을 뺀다(2026-10-01 B):** 앱이 `boardCheck` 에 내 user_id 를 함께 보내고, 가린 분이 있으면 서버가 그 뒤 올라온 글·답글의 번호와 글쓴 분만 읽어 **boardList 와 같은 규칙**(`boardCountVisible` → `boardDropBlocked`)으로 센다 — 처음엔 머릿수만 세서, 가린 분이 글을 올린 날 「새글 1」을 보고 열면 아무것도 없었다. 가린 분이 없으면(대부분) 예전처럼 머릿수만(`head`) 센다. ⚠️ 응답은 `{ ok, recent }` 뿐이다(검사·스모크가 본다). 배지 캐시(sessionStorage `board-recent`)는 사람마다(`uid`) — 공용 기기.
- **알려진 빈틈:** ~~기록 합치기는 board_blocks 줄이 있는 계정(가렸거나 가려진)을 멈춘다(`board_blocks.sql` 머리).~~ → 2026-10-01 같은 날 합치기가 옮긴다(가린 쪽·가려진 쪽 칸 모두 · 두 계정 사이 줄은 버림 · 겹치면 남는 쪽 줄 — `docs/member-profile-admin.md`). 규칙 동의 날짜(`board_rules_at`)도 더 늦은 쪽을 받는다. 공감 칩의 「누른 분」 이름(`boardReactors`)·공감 수에는 가린 분도 그대로 들어간다(글이 아니라 손대지 않았다).

## 2026-10-08 보안 점검에서 고친 셋 — 사진의 문 · 이름 · 하루 횟수
- **사진(`boardUpload`)에 문이 생겼다.** 전에는 아무 확인 없이 받았다 — 공개 키만 있으면 누구나 공개 칸에 끝없이 올릴 수 있었고, 글에 안 붙인 사진도 주소로 열렸다.
  이제 ① `users` 에 있는 `user_id` 만 ② 하루 20장(`BOARD_UPLOADS_PER_DAY`) ③ 하루 지나도 글에 안 붙은 사진은 서버가 치운다(`boardSweepUploads` — 올릴 때마다 열 장씩).
  기록은 새 표 `board_uploads`(`supabase/board_uploads.sql` · RLS · 올린 분 칸 이름은 `uploader` — `user_id` 로 짓거나 users FK 를 걸면 기록 합치기가 그 계정에서 멈춘다).
  ⚠️ **사진의 문은 이용 규칙을 보지 않는다** — 앱은 사진을 먼저 올리고 글을 보낼 때 규칙 창을 띄운다. 여기서 `rules-needed` 를 주면 규칙 창이 뜨기도 전에 끝난다.
  ⚠️ **치우기는 지우기 전에 글을 다시 찾아본다**(`board_posts.images` 에 그 이름이 있으면 `kept`). 찾아보지 못하면 멈춘다 — 이 확인을 빼지 말 것.
  ⚠️ 앱은 `api.boardUpload(mime, data, user_id)` 로 **user_id 를 함께 보낸다**. 안 보내는 것은 옛 판이라 서버가 「앱을 닫았다가 다시 연 뒤 올려 주세요」라고 답한다.
- **글·답글의 이름은 서버가 만든다**(`boardWriter` → `boardWhoOf`). 전에는 앱이 보낸 `name` 을 그대로 써서 다른 성도님 이름이나 「관리자」·「담임목사」라는 글자로 글을 쓸 수 있었다.
  ⚠️ `boardWhoOf`(index.ts)와 `boardWho`(app.js)는 **같은 규칙**이어야 한다 — 옛 글의 「내 글」 판정(`boardIsMine`)이 이름 일치를 본다. 관리자 글(비번)만 보낸 이름을 쓴다.
- **하루 횟수** — 글 20 · 답글 60 · 사진 20(한국 날짜). 2026-10-08 까지 운영의 최대는 한 분이 하루에 글 4 · 답글 2 였다.
  ⚠️ 넘었을 때의 오류는 **읽을 수 있는 글**이다 — 앱이 「등록 실패: 」·「사진을 올리지 못했어요: 」 뒤에 그대로 붙여 보여 준다. 영어 코드로 바꾸지 말 것.
- 「내게 주시는 말씀」(`sermonChat`)도 같은 날 한 분 하루 20번 · 모두 합쳐 300번 · 질문 500자(그때까지 성도님 최대는 한 분 하루 8번 · 모두 53번).
  넘으면 오류가 아니라 **답으로** 알린다(`limited: true`) — 앱은 오류를 모두 「잠시 후 다시 시도해 주세요」로 보여 까닭을 못 전한다. 관리자 화면(비번)은 세지 않는다.
