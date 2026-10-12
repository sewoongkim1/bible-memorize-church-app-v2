# 성경필사(암송) 이벤트 명단 — 교회 어드민으로 옮김

> **언제 읽나:** `events`·`event_signups`(사순절·썸머 써 바이블·소책자·가을 말씀암송 동행 명단)를 고치거나,
> `admin-event.html`·`api` 의 `event*` 관리 액션·`supabase/event_stamp_2026.sql` 을 손댈 때.
> 상태: **운영 — 2026-09-30 개시** · 성경암송 쪽 쓰기 셋 얼림(`EVT_MOVED`)
> 설계 `docs/superpowers/specs/2026-09-29-church-admin-bible-events-design.md` ·
> 코드 `c:\Projects\church-admin`(`js/menus/bibleevent/` · `supabase/functions/church-admin/events-*.ts`) ·
> 옛 동작 원문 그 저장소 `docs/port/event-roster-legacy.md` · 그 저장소 `CLAUDE.md` 「성경필사(암송)」 절

## 무엇이 어디로

| 일 | 이제(교회 어드민 「성경필사(암송)」 · 역할 `bibleevent`) | 전(성경암송) |
|---|---|---|
| 회차 만들기·설정(이름·기간·상태·공개 종료일) | 📋 회차·명단 → 회차 설정 | `admin-event.html` · `eventSave` |
| 담당자 메모 | 📋 줄 「고치기」 | `admin-event.html` 「메모」 · `eventSetNote` |
| 한 분 더하기 | 📋 「＋ 한 분 더하기」(교인명부로 찾아 채움) | 관리자 API `eventImport` 손 작업 · 직접 SQL |
| 명단 여러 줄 넣기 | 📤 명단 올리기(더하기만 — 통째 바꾸기 없음) | `eventImport`(그 회차 import 줄을 지우고 다시) |
| 사람별 이력·통계 | 👤 사람별 이력·통계 | 없음 |
| 자격 인정·미신청 목록(가을 말씀암송 동행) | — | **그대로** `admin-event.html` · `eventExcuse`·`eventRoster`(다음 단계에서 옮긴다) |
| 성도님 앱(신청·취소·명단·도장판) | — | **그대로** `eventOpenList`·`eventSignup`·`eventDrop`·`eventRosterPublic`·`eventStamps` |

## ⚠️ 함정

- **쓰는 곳은 하나.** `eventImport` 는 돌 때마다 그 회차의 `source='import'` 줄을 **전부 지우고** 다시 넣는다(2026-09-29 에 2,834행 중 2,833행이 import 였다).
  살아 있으면 어드민에서 고친 것·더한 분·줄 id·이어 둔 계정이 한 번에 사라진다. 그래서 2026-09-30 에
  `eventImport`·`eventSave`·`eventSetNote` 를 얼렸다(`api` `EVT_MOVED`). 비밀번호 확인 **바로 뒤**에서 `moved-to-church-admin` 을 돌려준다.
  비밀번호 없는 호출은 예전처럼 `unauthorized` 다(`tests/event-smoke.sh` 5) · 얼림은 5-1 이 `ADMIN_PW` 로 본다).
  화면 단추만 닫으면 관리자 비밀번호로 API 를 직접 부르는 길이 남는다. 그래서 **서버에서** 막았다. **되살리지 말 것.**
- ⚠️ **`api` 를 배포하는 세션은 얼림이 든 판에서 배포할 것.** 옛 작업 트리(얼림 커밋 전)에서 `supabase functions deploy api` 를 하면 얼림이 조용히 풀린다.
  배포 뒤에는 내려받아 `EVT_MOVED.has(` 가 셋인지 본다.
- ⚠️ **`api` 는 파일 통째 배포다(가을 말씀암송 동행 「하루 3번」·시험 회차 · 2026-10-03).** origin/main 을 합치지 않은
  옛 작업 트리에서 `supabase functions deploy api` 를 하면 `perDay`·시험 회차(`testOnly`)가 **오류 없이 조용히** 사라진다 —
  `perDay` 가 1 로 돌아가 하루 한 번만 해도 칸이 차고, 시험 회차는 그냥 draft 가 되어 시험 참여자에게도 안 보인다. 배포 전에
  `git fetch && git merge --ff-only origin/main` · 배포 뒤 `EVT_ENV=prod EXPECT_PER_DAY=3 bash tests/event-smoke.sh`(6-2 가 `rule.perDay` 를 본다 · **`EVT_ENV=prod` 를 빼면 개발을 본다** — 개발은 이미 3 이라 운영이 1 이어도 통과한다).
- ⚠️ **가을 「하루 3번」을 되돌릴 때는 `api` 만 되돌린다.** `v2_event_weeks` 는 5-인자 하나로 바뀌었고(`p_per_day` 기본 1)
  옛 `api` 의 4-키 호출도 그대로 받는다. 옛 체크아웃의 4-인자 `supabase/event_streak.sql` 을 다시 돌리면 함수가 **둘**이 되어
  4-키 호출이 모호해지고(PostgREST 가 못 고른다) 도장판·신청·명단이 500 이 난다 — **옛 파일을 돌리지 말 것.**
- **다른 쓰는 길도 닫았다:** `supabase/event_stamp_2026.sql` 은 `on conflict do update` 로 가을 회차의 제목·기간·공개 종료일·needs·copy 를 덮는다.
  그래서 어드민 개시 뒤에는 다시 돌리지 않는다(파일 머리에 적었다). 직접 SQL 로 `event_signups` 에 줄을 넣지 않는다.
  Claude 메모리의 「몇 분 더하기(eventRoster 백업 → eventImport)」 절차도 「교회 어드민 ＋ 한 분 더하기」로 고쳤다.
- **가을 말씀암송 동행 10/18 개시**(draft → open)도 교회 어드민 회차 설정에서 한다(가을 설계 §13-12). 저장하면 「이 회차가 성도님 첫 화면에 나타납니다」 확인 창이 뜬다.
- **표는 그대로다** — 칸·제약·RLS 를 바꾸지 않는다. 담당자가 넣은 줄은 `source='import'` + `note` 앞 `담당자가 더함`/`명단 올리기`/`소속: 교인명부로 채움`.
  `note`(담당자 메모)는 성도님 응답에 절대 싣지 않는다. `memo`(성도님 한 줄)와 다른 칸이다.
- **앱 계정은 만들지 않는다** — 이름·소속이 같은 계정이 이미 있으면 잇기만 한다(주간 리포트 「신규 인원」이 부풀지 않게).
  이어진 줄은 성도님 앱 「📋 이미 내신 것」에 보이고, 등록 기간 중인 회차면 성도님이 앱에서 고치거나 취소할 수 있다.
  ⚠️ **「이미 내신 것」은 지금 성도님께 보이는 회차의 줄만** 싣는다(`eventOpenList` 의 `mine` · 2026-09-30).
  담당자가 지난 회차(준비 중·보관·공개 종료일 지남)에 더해 계정을 이으면, 전에는 그 회차 ID(「lent-2022 접수」)가
  그대로 떴고 「고를 회차가 하나면 바로 열기」도 막혔다. 목록에 없는 회차의 줄은 그 화면에서 쓸 곳이 없다.
  (직분 힌트 `positionHint` 는 여전히 모든 줄을 본다 — 서버 안에서만 쓴다.)
- `admin-event.html` 에 남은 것: 명단 보기·인쇄·CSV·자격 인정(`eventExcuse` — 아직 `prompt()`/`alert()`). 얼리는 쪽이라 손대지 않았다. 옮길 때 직접 만든 창으로 바꾼다.
- **개인정보 안내:** 성경암송 `privacy/` 는 고치지 않았다(친구 결정 2026-09-29 — 담당자가 어드민에서 보는 일이고 앱이 새로 모으는 것이 없다).
  담당자 쪽 안내는 교회 어드민 `privacy.html` 7번이다. (참고: `privacy/` 는 이벤트 명단에 「이름과 소속」이 보인다고 적지만 실제로는 직분도 보인다. 전부터 있던 차이다.)
- **되돌리기:** 어드민에서 한 줄이라도 더하거나 고친 뒤에는 얼림을 풀지 않는다. `eventImport` 한 번에 그 줄들이 지워진다.

## 남은 것(다음 단계)

- 가을 말씀암송 동행의 자격 인정(`eventExcuse`)·미신청 목록을 교회 어드민으로 옮긴다. 그다음 `admin.html` 「🎉 이벤트 관리」 타일을 새 주소로 바꾼다(설계 §4-4). 지금 타일 설명(「회차 만들기 · …」)은 얼린 뒤와 맞지 않는다.
- 회차 차례(`sort_order`)는 어드민 회차 설정에 없다. 새 회차는 0 이고, 바꾸려면 개발 먼저 SQL 로 한다.

---

## CLAUDE.md 에서 옮김 2026-10-12

> CLAUDE.md 에서 옮겨 온 원문이다(2026-10-12, 다시 두 겹으로 나눔 — 내용은 한 글자도 안 고쳤다). 들여쓰기·체크 상자·「~~취소선~~」도 그대로다. 지금 상태는 CLAUDE.md 「다음 작업」의 한 줄을 볼 것.

### 맨 위 「어디에 무엇이」 표의 줄

| 이벤트 명단(사순절·썸머·소책자·가을 말씀암송 동행 — `events`·`event_signups`) — **2026-09-30 교회 어드민 「성경필사(암송)」으로 옮겼다** · `eventImport`·`eventSave`·`eventSetNote` 는 얼렸다(되살리지 말 것 · `api` 는 얼림이 든 판에서만 배포) | `docs/notes/bible-events-admin.md` · 설계 `docs/superpowers/specs/2026-09-29-church-admin-bible-events-design.md` |

### 「다음 작업」

- [ ] 🍂 **가을 말씀암송 동행 — 10/18(일) 개시**(**2026-10-04 바뀜: 측정 10/18~12/5 · 7주 가운데 5주 · 하루 3번 · 한 주 3일 · 늦게 오신 분도 같은 기준(11/5(목)까지 시작)** · 설계 §10 · 목록 12/20 · 공지 10/18 하루 · 11/3 알림 없음). 도장판은 「선물 대상」 없이 「지금까지 N일 함께 · 앞으로 D일 더」(§9-2 바뀜). **「하루 3번」(perDay 3)·🧪 시험 참여자 시험 회차 `autumn-2026-test` 는 2026-10-03 운영 반영 끝**(SQL·api·v3.514 `20261003c`·스모크 46/0). **같은 날 친구 결정으로 신청 없이 「자동 대상」(`needs.auto` · 공개 명단 없음 · 11/3 알림 없음 · 판 `20261003d` · 스모크 51/0)** — 끝나면 선물 대상 명단을 게시판·첫 화면에 올린다(방식 미정 · 그때 eventRosterPublic auto 갈래). ⏸ **개인정보 방침·공지는 안드로이드 심사 뒤**(설계 §9-4 문장 · `tests/event-auto.test.cjs` ⑪ skip). 친구: 🧪 시험 참여자 넣고 폰 확인 · 어드민 이름·날짜(~10/7) · **3↔5 결정과 주보 문구(10/14)** · 10/17 시험 회차 지우기+기준선(계획 Task 6) · 10/18 아침 「준비 중 → 열림」. ⚠️ `api` 는 origin/main 을 합친 트리에서만 배포(옛 트리면 perDay 가 조용히 1 로) · 확인은 `EVT_ENV=prod EXPECT_PER_DAY=3 bash tests/event-smoke.sh` · 되돌릴 땐 api 만(옛 4-인자 `event_streak.sql` 금지). 읽을 것 specs/2026-10-03-autumn-event-launch-design.md §8 · 계획 plans/2026-10-03-autumn-event-launch.md · `docs/notes/bible-events-admin.md`
