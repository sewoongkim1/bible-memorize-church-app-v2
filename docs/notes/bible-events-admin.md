# 성경필사(암송) 이벤트 명단 — 교회 어드민으로 옮김

> **언제 읽나:** `events`·`event_signups`(사순절·썸머 써 바이블·소책자·가을 말씀 동행 명단)를 고치거나,
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
| 자격 인정·미신청 목록(가을 말씀 동행) | — | **그대로** `admin-event.html` · `eventExcuse`·`eventRoster`(다음 단계에서 옮긴다) |
| 성도님 앱(신청·취소·명단·도장판) | — | **그대로** `eventOpenList`·`eventSignup`·`eventDrop`·`eventRosterPublic`·`eventStamps` |

## ⚠️ 함정

- **쓰는 곳은 하나.** `eventImport` 는 돌 때마다 그 회차의 `source='import'` 줄을 **전부 지우고** 다시 넣는다(2026-09-29 에 2,834행 중 2,833행이 import 였다).
  살아 있으면 어드민에서 고친 것·더한 분·줄 id·이어 둔 계정이 한 번에 사라진다. 그래서 2026-09-30 에
  `eventImport`·`eventSave`·`eventSetNote` 를 얼렸다(`api` `EVT_MOVED`). 비밀번호 확인 **바로 뒤**에서 `moved-to-church-admin` 을 돌려준다.
  비밀번호 없는 호출은 예전처럼 `unauthorized` 다(`tests/event-smoke.sh` 5) · 얼림은 5-1 이 `ADMIN_PW` 로 본다).
  화면 단추만 닫으면 관리자 비밀번호로 API 를 직접 부르는 길이 남는다. 그래서 **서버에서** 막았다. **되살리지 말 것.**
- ⚠️ **`api` 를 배포하는 세션은 얼림이 든 판에서 배포할 것.** 옛 작업 트리(얼림 커밋 전)에서 `supabase functions deploy api` 를 하면 얼림이 조용히 풀린다.
  배포 뒤에는 내려받아 `EVT_MOVED.has(` 가 셋인지 본다.
- **다른 쓰는 길도 닫았다:** `supabase/event_stamp_2026.sql` 은 `on conflict do update` 로 가을 회차의 제목·기간·공개 종료일·needs·copy 를 덮는다.
  그래서 어드민 개시 뒤에는 다시 돌리지 않는다(파일 머리에 적었다). 직접 SQL 로 `event_signups` 에 줄을 넣지 않는다.
  Claude 메모리의 「몇 분 더하기(eventRoster 백업 → eventImport)」 절차도 「교회 어드민 ＋ 한 분 더하기」로 고쳤다.
- **가을 말씀 동행 10/11 개시**(draft → open)도 교회 어드민 회차 설정에서 한다(가을 설계 §13-12). 저장하면 「이 회차가 성도님 첫 화면에 나타납니다」 확인 창이 뜬다.
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

- 가을 말씀 동행의 자격 인정(`eventExcuse`)·미신청 목록을 교회 어드민으로 옮긴다. 그다음 `admin.html` 「🎉 이벤트 관리」 타일을 새 주소로 바꾼다(설계 §4-4). 지금 타일 설명(「회차 만들기 · …」)은 얼린 뒤와 맞지 않는다.
- 회차 차례(`sort_order`)는 어드민 회차 설정에 없다. 새 회차는 0 이고, 바꾸려면 개발 먼저 SQL 로 한다.
