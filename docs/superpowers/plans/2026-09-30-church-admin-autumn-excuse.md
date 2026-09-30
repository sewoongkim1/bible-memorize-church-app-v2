# 교회 어드민 — 가을 말씀 동행 자격 인정·미신청 목록 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 성경암송 `admin-event.html` 에 남아 있던 가을 말씀 동행(`autumn-2026`)의 자격 인정(`eventExcuse`)과 「자격은 되는데 아직 신청 안 하신 분」 목록을 교회 어드민(admin.onlybible.kr) 📋 회차·명단의 자격 회차 화면으로 옮기고, 같은 날 성경암송 `eventExcuse` 를 얼리고 `eventRoster` 의 `note` 를 빼고 `admin.html` 「🎉 이벤트 관리」 타일을 새 주소로 바꾼다.

**Architecture:** 교회 어드민 함수(`supabase/functions/church-admin`)에 새 액션 다섯(읽기 `evEligRows`·`evEligMissing` · 쓰기 `evExcuseCheck`·`evExcuseAdd`·`evExcuseSet`)을 더하고, 셈·표기 규칙은 새 순수 모듈 `events-elig.ts`(성경암송 `evtRule`·`evtNeedFor`·`evtCanReach` 의 글자 그대로 사본 + 인정 표기)에 둔다. 주 수는 성경암송 RPC `v2_event_weeks` 를 그대로 부르고, 인정은 `note` 머리 표기 「자격 인정: 사유」로 둔다(표·SQL·역할을 고치지 않는다). 화면은 `js/menus/bibleevent/` 에 순수 `elig-logic.js` 와 창 셋 `excuse-form.js` 를 더하고 `roster*.js`·`row-form.js` 를 고친다. 운영은 두 단계 — 1단계(읽기 · 쓰기 셋은 운영 게이트로 닫힘) → 2단계(성경암송 얼리기 → 게이트 열기 → 옛 화면·타일).

**Tech Stack:** Supabase Edge Function(Deno, TypeScript) · PostgREST(supabase-js `rpc`·`from`) · 빌드 없는 브라우저 ES 모듈 · Node `node:test`(`--experimental-strip-types`) · 헤드리스 크롬(CDP · Node 22 전역 `WebSocket`) · 카카오 로그인 + `admin_roles` 역할.

**설계:** 성경암송 저장소 `docs/superpowers/specs/2026-09-30-church-admin-autumn-excuse-design.md` — 「★ 친구 결정(2026-09-30)」 절이 본문보다 앞선다(물음 1 = (다) 둘 다 · 물음 18 = 역할 받을 분은 모두 운영진 · 물음 8 = 이름·소속 보이고 내려받기, 신청 창 동안만 · 물음 16 = 선물 명단 확정은 11/28 뒤 · 나머지는 10절 권하는 기본값). 이 계획과 어긋나면 설계가 맞다 — 단 아래 「계획이 고른 해석」은 설계가 둘로 읽히던 자리다.
**앞 계획(꼴을 따른다):** 성경암송 저장소 `docs/superpowers/plans/2026-09-29-church-admin-bible-events.md`.

**과제 차례:** `1 → 2 → … → 11`. 운영에 닿는 것은 Task 11 에서만(Task 1 의 운영 **읽기** 확인 하나 빼고).

## Global Constraints

- 코드 저장소 `C:\Projects\church-admin`, 작업 가지 `autumn-excuse`(워크트리 `C:\Projects\church-admin\.worktrees\autumn-excuse`). **be-polish 가 main 에 합쳐진 뒤에** main 에서 낸다(Task 1 Step 1). 성경암송 저장소 `C:\Projects\bible-memorize-church-app-v2` 는 Task 11 2단계에서만 고친다(그 전에는 `git show`·읽기만).
- **푸시 = 운영 화면.** Task 11 전에는 어느 저장소도 푸시하지 않는다. 운영 함수 배포·운영 쓰기는 Task 11 에서만, 친구가 옆에서 허락한 뒤. 커밋은 과제마다, 한국어 제목, 끝줄 `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- **배포 금지 창 10/10(토)~10/12(월)** — 10/11(주일) 아침 담당자가 가을 회차를 「준비 중 → 열림」. 이 사흘은 **운영** 함수 배포·운영 푸시·운영 DB 쓰기를 하지 않는다(개발 함수 배포·개발 시험·운영 **읽기**는 된다). 1단계(읽기)는 **10/13(화) 이후**(설계 날짜표 — 그 전에 끝났어도 기다린다) · 10/13~10/16 목표 · 2단계(쓰기) 목표 **10/20(화)** · 늦어도 **10/26(월)** · 10/27(화) 신청 창·인정 창·미신청 목록이 날짜로 열리는 첫날. 10/11~10/26 에 들어오는 사정 문의는 담당자가 종이에 받아 두고(이름·소속·사유·동의) 10/27 부터 「✅ 인정하며 넣기」로 옮긴다. 선물 명단 확정은 신청 마감(11/28) 뒤(친구 결정).
- **운영 쓰기 날 판정은 사람이 달력을 세지 않고 파이썬 한 줄로**(한국 날짜 · Task 11 S1-0·S2-0 이 그대로 쓴다):
  `PYTHONIOENCODING=utf-8 python -c "import datetime as d;t=d.datetime.now(d.timezone(d.timedelta(hours=9))).date();print(t, '배포 금지(10/10~10/12)' if d.date(2026,10,10)<=t<=d.date(2026,10,12) else ('1단계 전(10/13 부터)' if t<d.date(2026,10,13) else '운영 쓰기 가능한 날'))"`
- **표·칸·제약·RLS·RPC·역할을 고치지 않는다 — 운영 새 SQL 없음.** 표 `events`·`event_signups` 와 RPC `v2_event_weeks(p_start date, p_weeks int, p_per_week int, p_users text[] default null)`(실행 권한 `service_role` 만 — 교회 어드민 함수는 service role 로 돈다)는 성경암송 것 그대로. 개발 DB 에 RPC·트리거가 없을 때만 성경암송의 **기존** 파일 `supabase/daily-activity.sql`·`supabase/event_streak.sql` 을 **개발에만** 돌린다.
- 역할은 `bibleevent`(「성경필사(암송)」) 또는 `super` — 새 역할 없음. **역할 받을 분이 모두 운영진(신앙운동팀)이라는 전제**(친구 결정 · 물음 18) 위에서 성경암송 `privacy/` 는 고치지 않는다. 운영진 밖의 분께 드리게 되면 먼저 친구에게 — 이 두 기능(미신청 목록·도장 확인)을 `super` 로 올리거나 성경암송 `privacy/` 4번을 고쳐야 한다.
- 새 액션 다섯 — 액션마다 **세 곳**: `authz.ts` `ACTION_ROLES` 한 줄 · `index.ts` switch case · `tests/server.dev.test.mjs` `PROBE`(아무것도 안 바뀌는 입력 — 없는 회차·줄 0). 하나라도 빠지면 400·시험 실패.
- **인정 표기** = 자격 회차 줄 `note` 의 첫 조각 `자격 인정: <사유>`, 뒤 메모는 ` / ` 로 잇는다(예 `자격 인정: 10월 3주 입원 / 담당자가 더함`). 사유: 앞뒤 빈칸 떼고 가운데 빈칸·줄바꿈은 한 칸 · 1~200자(`no-reason`·`reason-too-long`) · **띄어 쓴 빗금 ` / ` 와 앞·뒤 끝의 `/` 만 금지**(`reason-bad-char` — 「10/18~10/24 입원」은 된다) · 표기를 붙인 뒤 `note` 전체가 500자를 넘으면 `note-too-long`. **`answers` 는 읽지도 쓰지도 않는다.** 자격 회차가 아닌 회차의 `note` 는 이 뜻으로 읽지 않는다.
- **메모로 인정을 만들거나 지울 수 없다**: 자격 회차 줄의 `evRowSave`(메모)는 지금 표기를 서버가 다시 붙이고 · 보낸 메모가 지금 표기 그대로 시작하면 그 표기를 떼고 받고(옛 화면 호환) · 그 밖에 (NFC 로 맞춰) `자격 인정:` 으로 시작하면 `excuse-via-memo` · 메모 창 상한은 `500 − (표기 길이 + 3)`.
- **창**: 인정 `excuseWindow` = `opens_on` ≤ 오늘 ≤ `list_until`(비면 끝 없음) — 밖이면 `excuse-not-open`/`excuse-period-over` · 미신청 이름 `missingWindow` = `opens_on` ~ `closes_on` 동안만, 마감 뒤엔 `total` 만(이름 없음) · 측정 `eligPhase` = before / measuring / ended(끝난 다음 날부터 — 가을 11/22~) · ✨(여섯 주 모두 채움)는 ended 에서만.
- **셈**은 성경암송 `evtRule`·`evtNeedFor`·`evtCanReach`(커밋 `1498177` · `supabase/functions/api/index.ts` 5145-5199줄)를 글자 그대로 옮긴다(`events-elig.ts`) — 성도님 도장판(`evtStampsFor`)과 같은 RPC·같은 `needFor`. RPC 행이 없는 계정은 0주·첫 활동일 없음(= need 그대로) · 계정 없는 줄(`user_id` 없음)은 `null`(모름)이지 0 이 아니다 · 계정 있는 줄이 하나도 없으면 RPC 를 부르지 않는다(빈 배열을 `null` 로 바꾸지 말 것 — `null` 은 전 계정) · RPC 가 1,000행을 돌려주면 `count-capped` 로 멈춘다(조용히 모자란 목록을 내지 않는다).
- **누출**: 어떤 응답에도 `user_id`·`ident_key`·`answers`·계정 id 가 없다. `evExcuseCheck` 는 이미 명단에 있거나(`already`) 이미 자격이 되었거나(`eligibleNow`) 계정이 없거나 둘 이상이면 **주 값을 싣지 않고**, 인정 창 밖이면 주 값을 읽지도 않는다.
- **기록**(`admin_audit`): `event.excuse`(줄 id · 사유 글 없음) · `event.excuse-check`(회차 id · 이름·계정 수·무엇을 보였나만 · 성공한 확인은 **늘** 남긴다) · `event.missing`(회차 id · 상태와 **수만**). 셋 다 「바꾼 기록」 보기로 간다 — `js/menus/system/audit.js` `LABEL`·`detailText` 와 `tests/audit.test.mjs` 를 함께 고친다(안 고치면 기록 줄이 오류 없이 빈칸이다). `evEligRows` 는 남기지 않는다.
- **`evExcuseAdd`**: `source='import'` · 계정은 하나일 때만 잇는다 · 직분은 회차 `needs.position` 이 참일 때만(아니면 `""` — 공개 명단에 직분이 새지 않게) · `note = 자격 인정: 사유 / 담당자가 더함 [/ 메모]` · 동의 `consent === true` 필수 · 같은 분이면 `already`(거절만 — 그 줄 메뉴에서 인정) · 계정 둘 이상 `ambiguous-account` · 이미 자격 `already-eligible`. 자격 회차의 `evRowAdd`·`evUploadCheck/Save`·`evRowDelete` 는 **여전히** `eligibility-event`.
- **운영 게이트**(계획이 고른 해석 ①): 쓰기 셋은 `index.ts` `EXCUSE_LIVE_PROD = false`·화면 `elig-logic.js` `EXCUSE_UI_PROD = false` 로 **운영에서만** 닫고, 개발(localhost·개발 DB)에서는 늘 연다. 2단계 ⓑ에서 둘을 **함께** `true` 로 한 커밋을 배포한다.
  서버 게이트는 **닫히는 쪽으로 틀린다** — `SUPABASE_URL` 에 **개발** 참조(`ktpwthwqzgcqcrmsafdo`)가 있을 때만 열리고, 모르는 주소(빈 값·내부 주소)는 운영과 같이 닫힌다(`excuseGateOpen` · 운영 주소를 찾아 닫는 꼴이면 주소가 예상과 다를 때 1단계부터 운영에서 열린다).
- **다른 세션이 함께 움직인다**(2026-09-30 기준 — `be-decide`(성경필사 친구 결정 셋 · M2 `pastEventCreatedAt` 등)·`people-link`(교인명부 이름 누르기) 워크트리, main 의 🧪 시험 참여자). 그래서 ① 앵커는 과제마다 다시 세고(줄 번호 금지), ② **개발 함수 배포는 작업 트리를 통째로 올려 남의 개발 판을 덮는다** — 개발 배포 전에 `ListAgents` 로 church-admin 을 고치는 세션이 있으면 `SendMessage` 로 알리고, 그쪽이 개발에서 시험 중이면 끝난 뒤에 올린다(내 시험이 `unknown-action` 이면 내 판을, 남의 시험이 깨졌다고 하면 그쪽 판을 다시 올린다 — 서로 덮지 않게 차례를 정한다), ③ 운영 함수 배포는 main 에 들어와 있지만 아직 운영에 안 나간 **남의 커밋까지** 내보낸다 — Task 11 이 배포 전에 운영 판을 내려받아 견준다.
- **Bash 도구에서 `sleep` 을 앞에 두고 기다리지 않는다**(도구가 막는다) — Actions 실행은 `gh run list --workflow deploy.yml --commit <푸시한 해시>` 로 **그 커밋의 실행**을 찾고, 없으면 `python -c "import time;time.sleep(3)"` 로 몇 번 다시 묻는다(가장 최근 실행을 잡으면 앞 판의 실행을 보고 「배포 끝」으로 오인한다).
- **팝업 없음**: `alert`·`confirm`·`prompt`·`beforeunload`·`<select>`·`<input type=date|time>`·`datalist` 금지 → `ui.js` `dialog`/`toast` · `js/core/modal.js` `openForm` · `js/core/picker.js` `pickOne`. 동의 칸은 `<label>` 안 checkbox(📤 올리기 `.be-up-fill` 모양), 접힘 칸은 `<details>`.
- **UI 표준 v1**: 주 단추 48px(`btn primary`) · 둘째 44px · 칩 36px · 글자 13px 이상 · 폰 카드 / PC(≥1024px) 표 · CSS 는 `be-` 접두 · 320px 폭에서 옆으로 넘치지 않는다.
- **앵커**: 줄 번호로 찾지 않는다(be-polish·다른 세션이 줄을 민다). 고치기 전에 앵커가 **한 번만** 나오는지 `grep -cF` 로 본다 — 1 이 아니면 멈추고 눈으로 본다. 이 PC 는 `core.autocrlf=true` — 앵커 끝에 `$` 를 쓰지 않고, CRLF 파일은 `sed -i` 대신 **Edit 도구**로 고친다. 기존 import 줄은 다시 쓰지 않고 새 import 문을 더한다.
- `index.ts` 문법 검사는 **개발 함수 배포**(워크트리 루트에서)가 한다(`node --check` 는 TS 를 못 잡는다). 배포는 작업 트리를 통째로 올린다 — 배포 전 `git status --short` 가 비어야 한다.
- 날짜는 파이썬으로 본다(Git Bash 의 `TZ=Asia/Seoul` 은 안 먹는다): `python -c "import datetime as d;print(d.datetime.now(d.timezone(d.timedelta(hours=9))).strftime('%Y-%m-%d %H:%M'))"`. **한글을 찍는** 파이썬은 앞에 `PYTHONIOENCODING=utf-8` 을 둔다(없으면 Git Bash 콘솔이 cp949 로 받아 글자가 깨진다 — 2026-09-30 이 계획을 검토하며 확인).
- **공개 저장소**: 실명·전화·진짜 명단을 코드·시험·문서에 넣지 않는다 — 시험 이름은 `ca-test-…`, 보기 이름은 음절 표(`도하늘`·`라바다` 등), 개발 데모 계정은 `데모앱성도…`.
- 순수 모듈 `.ts` 는 원격 import·enum·namespace·parameter property·non-null 단언(`!`) 금지(Node 시험이 그대로 읽는다).

## 계획이 고른 해석 — 설계가 둘로 읽히던 자리

1. **운영 게이트로 두 단계를 낸다.** 설계 7절은 1단계(읽기)·2단계(쓰기)를 따로 내라 하고, 과제 차례는 서버 쓰기(Task 4)가 화면 읽기(Task 6)보다 앞이다. 두 단계를 커밋 순서로 가르면 1단계 판이 없다 → 쓰기 셋을 `EXCUSE_LIVE_PROD`/`EXCUSE_UI_PROD` 로 **운영에서만** 닫은 채 1단계에 모두 내고, 2단계는 게이트를 여는 한 커밋이 된다(쓰는 곳이 둘인 창도, 없는 창도 설계 7절과 같다 — ⓐ 얼림 → ⓑ 게이트 연 함수 → ⓒ 화면).
2. **`evRowSave` 표기 지킴은 1단계(읽기)와 함께 낸다.** 설계 3절 「표기를 읽는 쪽과 지키는 쪽이 따로 나가면 그 사이 메모로 인정을 흉내 낼 수 있다」가 7절 목록(지킴을 2단계 ⓑ에 둠)보다 앞선다 — 읽는 쪽(`evEligRows`)이 1단계에 나가므로 지킴도 1단계다. 막기만 하므로 쓰는 곳이 바뀌지 않는다.
3. **`evEligRows` 응답에 두 칸을 더한다** — `counts`(요약 · 서버가 `source` 로 「다시 센 값이 모자란 앱 줄」을 센다)와 `asksPosition`(창 3 의 직분 칸을 보일지). 설계 3절 칸 목록에는 없다.
4. **개발 시험 회차를 새로 만든다.** 설계 8절은 기존 `EV_EL_ID`(2000년)를 「창 밖 = 거절 시험용」이라 했지만 그 회차는 `list_until` 이 비어 인정 창 **안**이다. → 날을 「오늘」에서 세는 자격 회차 다섯(열림·직분 받음·미래·지남·규칙 틀림)을 시험이 만든다.
5. **RPC 1,000행은 「멈춤」을 고른다**(설계는 쪽 나누기 또는 멈춤) — `count-capped` · 화면 「주 수를 세지 못했어요」. 운영 활동 계정은 수백이다(Task 1 Step 5 가 본다).
6. **화면의 메모 표시는 늘 `stripExcuse(r.note)`** — 서버 `noteRest` 와 같은 값이고(같은 보기 파일로 맞댄다), 줄을 고친 뒤에도 옛 `noteRest` 가 남지 않는다. `noteRest` 는 응답에 그대로 둔다.
7. **`event.excuse` 의 `reason`** 은 「사유를 적었다」 — add·set·reason 은 `true`, unset·drop 은 `false`. drop 의 `hasNote` 는 표기를 뺀 나머지 메모가 있었는지.
8. **`evExcuseAdd` 의 `note`(덧붙일 메모)는 서버만 받는다** — 설계 4절 창 3 에 칸이 없어 화면은 늘 `""`. 메모는 넣은 뒤 줄 메뉴 「📝 메모 고치기」로.
9. **개인정보 안내(교회 어드민 `privacy.html` 7번)는 설계 7절대로 1단계 커밋에 전부**(인정 문장 포함) 싣는다 — 2단계가 열리기 전 며칠 먼저 적힌다(빠뜨리는 쪽보다 낫다).
10. **옛 `admin-event.html`** 은 설계 5절 2 가 적은 것만 걷는다(인정 단추·`askExcuse`·`admErr`·`prompt`/`alert`·CSV 다섯 칸·미신청 배지). 표의 「주」 칸·도장 기간 띠·요약 태그는 옛 버그로 늘 안 그려지므로 둔다.
11. `evExcuseCheck` 가 `already` 로 답할 때 기록의 `account` 는 `null`(계정을 찾기 전에 멈춘다).
12. **`evExcuseAdd` 의 줄 짓기는 구현하는 날의 `evRowAdd` 를 따른다**(설계 §3 「`evRowAdd` 와 같은 줄 짓기」). 지금(2026-09-30) main 의 `evRowAdd` 에는 없지만 `be-decide` 가지(M2)가 「마감일이 지난 회차에 넣는 줄의 낸 날(`created_at`) = 그 마감일 한국 자정」(`pastEventCreatedAt`)을 더한다 — 그 가지가 먼저 main 에 들어오면 `evExcuseAdd` 에도 같은 한 줄을 넣는다(가을 회차는 11/29~12/13 에 넣는 인정 줄이 여기에 걸린다). Task 4 Step 7 과 Task 11 S1-1 이 본다.
13. **`excuse-not-open` 의 날짜** — 설계 오류표는 「인정은 신청이 열린 날(○월 ○일)부터 …」인데 `MESSAGES` 는 한 벌이라 날짜를 모른다. 서버가 `opensOn` 을 함께 주므로 창(`excuse-form.js`)은 그 날짜로 글을 짓고(`elig-logic.js` `notOpenText`), `MESSAGES` 에는 날짜 없는 말을 둔다(다른 곳에서 새어 나와도 틀린 말이 되지 않게).

## 파일 지도

| 파일 | 맡는 일 | 과제 |
|---|---|---|
| `supabase/functions/church-admin/events-elig.ts` | 셈(`eligRule`·`needFor`·`canReach`)·날짜 셋·인정 표기·줄 파생·요약·미신청 고르기·게이트 | 2 |
| `tests/events-elig.test.mjs` · `tests/fixtures/excuse-marker.json` · `tests/fixtures/evt-legacy.ts` | 순수 시험 · 표기 보기(서버·화면 공용) · 성경암송 원문 사본(1498177) | 2 |
| `supabase/functions/church-admin/authz.ts` · `tests/authz.test.mjs` | 새 액션 다섯의 역할 | 3·4 |
| `supabase/functions/church-admin/index.ts` | `evEligRows`·`evEligMissing`·`evRowSave` 표기 지킴 / `evExcuseCheck`·`evExcuseAdd`·`evExcuseSet`·게이트 | 3·4 |
| `tests/server.dev.test.mjs` | PROBE · 시험 회차·계정·활동 · 개발 시험 | 3·4 |
| `js/menus/system/audit.js` · `tests/audit.test.mjs` | 기록 이름 셋 | 5 |
| `js/menus/bibleevent/elig-logic.js` · `tests/be-elig-logic.test.mjs` | 화면 순수 논리(띠·요약·주 칸·메뉴·내려받기·미신청 글·도장 확인 글·UI 게이트) | 6 |
| `js/menus/bibleevent/roster-ui.js`·`roster.js`·`row-form.js`·`roster-logic.js` · `js/core/ui.js` · `css/admin.css` · `tests/be-roster-ui.test.mjs` | 자격 회차 화면(읽기) · 메모 창 · 오류 말 | 6 |
| `js/menus/bibleevent/excuse-form.js` · `tests/be-excuse-form.test.mjs` | 창 셋 · 팝업 없음 검사 · 줄 메뉴·「✅ 인정하며 넣기」 배선 | 7 |
| `privacy.html` · `CLAUDE.md`(교회 어드민) | 개인정보 안내 7번(+6번 한 줄) · 문서 | 8 |
| `tests/seed-bible-events-dev.mjs` | 개발 가짜 회차 `ca-demo-el-open`(인정 창 열림) | 9 |
| `C:\Projects\church-admin\.superpowers\sdd\autumn-excuse\harness\ae-auth.mjs`·`ae-check.mjs`(커밋 안 됨) | 헤드리스 확인 | 10 |
| (성경암송) `supabase/functions/api/index.ts` · `tests/event-smoke.sh` · `admin-event.html` · `admin.html` · `docs/notes/bible-events-admin.md` · `CLAUDE.md` | 얼리기·`note` 빼기 · 스모크 · 옛 화면 · 타일 · 문서 | 11 |

---

### Task 1: 선행 확인(읽기만) · 작업 가지

**Files:**
- Create(git): 가지 `autumn-excuse` · 워크트리 `C:\Projects\church-admin\.worktrees\autumn-excuse`
- Create(저장소 밖): `C:\Users\sewki\.church-admin\autumn-excuse\checks-dev.sql` · `checks-prod.sql`
- Read only: church-admin main · 성경암송 커밋 `1498177` 의 `supabase/functions/api/index.ts` · 개발 DB · 운영 DB(**읽기만** — 설계 7절 1)

**Interfaces:**
- Consumes: main 에 be-polish 가 합쳐졌다는 표식 둘(`js/menus/bibleevent/roster-logic.js` 의 `export const NOTE_EDIT_MAX = 500;` · `supabase/functions/church-admin/events-rows.ts` 의 `export function inChunks(`) · link 된 작업 폴더 `~/.church-admin/supa-dev`(개발)·`~/.church-admin/supa-prod`(운영) · `~/.church-admin/dev.env`(`DEV_URL`·`DEV_ANON`·`DEV_SERVICE_KEY`)
- Produces: 워크트리(Task 2~10 의 모든 명령은 `cd /c/Projects/church-admin/.worktrees/autumn-excuse` 에서) · 개발 DB 준비(RPC·트리거·`verses`) · 친구에게 알릴 운영 읽기 결과(옛 `answers.excused` 수 · 가을 회차 설정 · 활동 계정 수)

> 이 과제는 **어느 저장소의 코드도 바꾸지 않는다.** 운영은 읽기만 한다(`select`). 푸시하지 않는다.

- [ ] **Step 1: be-polish 가 main 에 들어왔는가**

```bash
cd /c/Projects/church-admin
git fetch origin || echo "FETCH-FAILED (local 판정만 본다)"
git status -sb | head -1
git log --oneline -1 main
echo "NOTE_EDIT_MAX: $(git show main:js/menus/bibleevent/roster-logic.js | grep -c 'export const NOTE_EDIT_MAX = 500;')"
echo "inChunks:      $(git show main:supabase/functions/church-admin/events-rows.ts | grep -c 'export function inChunks(')"
git worktree list
```
Expected: `NOTE_EDIT_MAX: 1` · `inChunks: 1` → Step 2 로.
하나라도 `0` 이면 be-polish(성경필사 손질 가지)가 아직 main 에 없다 — 이 계획의 앵커(특히 `row-form.js` 의 `NOTE_EDIT_MAX`)는 be-polish 판 글자다. **멈추고** 친구에게 묻는다:
> 친구, 가을 말씀 동행 인정 작업을 시작하려는데 be-polish(성경필사 손질)가 아직 main 에 안 들어왔어요. 이 계획은 be-polish 판 글자를 앵커로 써요. be-polish 를 먼저 합칠까요, 아니면 be-polish 끝에서 가지를 낼까요?

「be-polish 끝에서」라고 하시면 Step 2 의 `main` 을 `be-polish` 로 바꿔 가지를 내고, Task 11 Step S1-1 에서 be-polish 가 main 에 먼저 합쳐졌는지 다시 본다.

- [ ] **Step 2: 작업 가지와 워크트리**

```bash
cd /c/Projects/church-admin
git branch --list autumn-excuse
test -e .worktrees/autumn-excuse && echo EXISTS || echo FREE
git check-ignore -v .worktrees/ | head -1
```
Expected: 첫 줄 아무것도 없음 · `FREE` · `.git/info/exclude:<줄>:.worktrees/	.worktrees/`. 가지·폴더가 이미 있으면 **지우지 말고** 멈춰 친구에게 묻는다.

```bash
cd /c/Projects/church-admin
git worktree add .worktrees/autumn-excuse -b autumn-excuse main
cd /c/Projects/church-admin/.worktrees/autumn-excuse
git status --short --branch
git config core.hooksPath
python tools/preflight.py | tail -1
echo "START=$(git rev-parse --short HEAD)"
```
Expected: `Preparing worktree (new branch 'autumn-excuse')` · `## autumn-excuse` · `.githooks` · `모두 통과` · `START=<해시>`(적어 둔다).

- [ ] **Step 3: 이 계획이 고칠 자리의 앵커를 한 번에 본다**

```bash
cd /c/Projects/church-admin/.worktrees/autumn-excuse
c() { printf '%s  %s  <- %s\n' "$(grep -cF -- "$2" "$1")" "$2" "$1"; }
S=supabase/functions/church-admin
c $S/index.ts 'const cors = {'
c $S/index.ts 'Deno.serve(async (req) => {'
c $S/index.ts '      case "evPerson":       return json(await evPerson(ctx, b));'
c $S/index.ts '  const note = hasNote ? legacyNorm(p.note) : (cur.note ?? "");     // 메모는 한 줄로(성경암송 eventSetNote 와 같다)'
c $S/authz.ts '  evPerson: "bibleevent",'
c tests/authz.test.mjs '    "evRowAdd", "evRowDelete", "evRowSave", "evStats", "evUploadCheck", "evUploadSave"]);'
c tests/server.dev.test.mjs '  evPerson: { name: "" },'
c tests/server.dev.test.mjs '  if (errs.length) throw new Error("정리 실패 "'
c js/menus/system/audit.js '  "people.lookup": "명부 찾기(성경필사)", "people.fill": "명부로 빈칸 채움(성경필사)",'
c js/menus/system/audit.js '  if (r.action === "people.lookup") return `‘${d.q || ""}’ · ${d.count ?? 0}명`;'
c privacy.html '      보관과 삭제: 명단의 보관과 공개 기간은 성경암송 앱의 안내('
c js/menus/bibleevent/roster.js 'import { personPayload } from "./person-logic.js";'
c js/menus/bibleevent/roster-ui.js 'export const ELIG_LINE = '
c js/menus/bibleevent/row-form.js 'noteField(init.note, NOTE_EDIT_MAX)'
c js/menus/bibleevent/roster-logic.js 'export function csvText(rows) {'
c js/core/ui.js '  "too-many": "한 번에 600줄까지 올릴 수 있어요 — 나눠서 올려 주세요",'
c privacy.html '      명단은 성경암송 앱의 것이고, 이 화면은 무엇을 새로 모으지 않고 그 명단을 그대로 읽고 고쳐요.<br>'
c CLAUDE.md '- 개발 화면 확인용 가짜 회차: '
c tests/seed-bible-events-dev.mjs 'const [U1, , U3] = users;'
c css/admin.css '.be-pp-note{padding:8px 10px;border-radius:8px;background:var(--ghost-bg);color:var(--navy);font-size:13px;line-height:1.5}'
grep -rcE 'events-elig|evElig|evExcuse|elig-logic|excuse-form' $S js tests | grep -v ':0$' || echo "새 이름 없음"
echo "pastEventCreatedAt(be-decide M2): $(grep -c 'pastEventCreatedAt(' $S/index.ts)"
git log --oneline -8 main
```
Expected: 모든 줄 맨 앞이 `1` · `새 이름 없음` · `pastEventCreatedAt` 은 `0`(be-decide 가 아직 main 밖) 또는 `2` 이상(들어왔다 — 계획이 고른 해석 ⑫: Task 4 Step 7 의 「be-decide 가 들어왔으면」 Edit 을 한다). 앵커 줄이 `0` 이면 그 과제에서 앵커를 새 글자에 맞춘 뒤 진행하고, 이 계획의 해당 Step 글도 고쳐 둔다. 앵커 줄이 `2` 이상이면 앵커를 더 길게 잡는다.
(2026-09-30 기준 알려진 어긋남: `be-decide` 가 들어오면 `audit.js` 의 `people.fill` 줄과 `privacy.html` 7번 「기록:」 줄이 바뀐다 — 이 계획은 그 두 줄을 앵커로 쓰지 않는다(Task 5 ③ 은 `people.lookup` 줄 · Task 8 ⑥ 은 「보관과 삭제:」 줄). main 의 🧪 시험 참여자는 `authz.ts`·`PROBE` 의 `evPerson` 줄 **뒤**에 사역 줄을 더했다 — 앵커 바로 뒤에 끼우면 된다.)

- [ ] **Step 4: 개발 DB — RPC·트리거·구절·실행 권한(읽기)**

Write 로 `C:\Users\sewki\.church-admin\autumn-excuse\checks-dev.sql`:
```sql
-- 가을 인정 계획 Task 1 Step 4 — 개발 읽기만. users 가 스물 남짓이어야 개발이다(사백이 넘으면 운영 — 멈춘다).
select 'users' as k, count(*)::text as v from users
union all select 'rpc v2_event_weeks', count(*)::text from pg_proc where proname = 'v2_event_weeks'
union all select 'trigger trg_daily_activity', count(*)::text from pg_trigger where tgname = 'trg_daily_activity'
union all select 'verses', count(*)::text from verses
union all select 'rpc 가 anon/authenticated 에 열림(0 이어야)', count(*)::text from pg_proc
  where proname = 'v2_event_weeks' and (proacl::text like '%anon=%' or proacl::text like '%authenticated=%')
union all select 'challenge_log mode check', count(*)::text from pg_constraint where conname = 'challenge_log_mode_check';
```
```bash
cat ~/.church-admin/supa-dev/supabase/.temp/project-ref; echo       # ktpwthwqzgcqcrmsafdo 여야 한다 — 다르면 멈춘다
supabase --workdir ~/.church-admin/supa-dev db query --linked -f C:/Users/sewki/.church-admin/autumn-excuse/checks-dev.sql
```
Expected: `users` 스물 남짓 · `rpc v2_event_weeks | 1` · `trigger trg_daily_activity | 1` · `verses` 1 이상 · 열림 `0` · `challenge_log mode check | 1`.
- RPC 나 트리거가 `0` 이면 성경암송 기존 파일을 **개발에만** 돌린다(`-f` 는 절대 경로 · 새 SQL 이 아니다 · 운영에는 이미 있다):
  ```bash
  supabase --workdir ~/.church-admin/supa-dev db query --linked -f C:/Projects/bible-memorize-church-app-v2/supabase/daily-activity.sql
  supabase --workdir ~/.church-admin/supa-dev db query --linked -f C:/Projects/bible-memorize-church-app-v2/supabase/event_streak.sql
  ```
  그다음 checks-dev.sql 을 다시 돌려 `1`·`1` 을 본다.
- `verses` 가 `0` 이면 성경암송 `supabase/seed_verses.sql` 을 개발에만 돌린다(시험이 `challenge_log.verse_no` FK 로 구절 하나를 쓴다).

service role 로 RPC 가 불리는지(교회 어드민 함수와 같은 권한):
```bash
set -a; . ~/.church-admin/dev.env; set +a
node -e '
const U=process.env.DEV_URL,K=process.env.DEV_SERVICE_KEY;
const h={apikey:K,"Content-Type":"application/json",...(K.startsWith("sb_secret_")?{}:{Authorization:"Bearer "+K})};
fetch(U+"/rest/v1/rpc/v2_event_weeks",{method:"POST",headers:h,body:JSON.stringify({p_start:"2026-09-01",p_weeks:6,p_per_week:3})})
 .then(async(r)=>{const t=await r.text();let j=null;try{j=JSON.parse(t)}catch{};console.log(r.status,Array.isArray(j)?"배열 "+j.length+"줄":t.slice(0,200));});'
```
Expected: `200 배열 N줄`(N 은 0 이상).

- [ ] **Step 5: 운영 — 읽기만(설계 7절 1 ①~⑤)**

Write 로 `C:\Users\sewki\.church-admin\autumn-excuse\checks-prod.sql`(한글이 든 SQL 은 명령줄에 쓰지 않고 파일로 — 명령줄 한글은 깨진다):
```sql
-- 가을 인정 계획 Task 1 Step 5 — 운영 **읽기만**(쓰기 없음). users 가 사백이 넘어야 운영이다.
select 'users' as k, count(*)::text as v from users
union all
select 'excused=true · ' || event_id, count(*)::text from event_signups where answers->>'excused' = 'true' group by event_id
union all
select 'autumn rows', count(*)::text from event_signups where event_id = 'autumn-2026'
union all
select 'autumn import', count(*)::text from event_signups where event_id = 'autumn-2026' and source = 'import'
union all
select 'autumn no user', count(*)::text from event_signups where event_id = 'autumn-2026' and user_id is null
union all
select 'note 가 「자격 인정:」으로 시작', count(*)::text from event_signups where note like '자격 인정:%'
union all
select 'autumn event', concat_ws(' | ', status, opens_on, closes_on, list_until, needs->'eligibility', (needs ? 'position')::text)
  from events where id = 'autumn-2026'
union all
select 'active 42 days', count(distinct user_id)::text from daily_activity where day >= (now() at time zone 'Asia/Seoul')::date - 42
union all
select 'rpc exists', count(*)::text from pg_proc where proname = 'v2_event_weeks';
```
```bash
cat ~/.church-admin/supa-prod/supabase/.temp/project-ref; echo      # xnomlgydifiqiybervtf 여야 한다
supabase --workdir ~/.church-admin/supa-prod db query --linked -f C:/Users/sewki/.church-admin/autumn-excuse/checks-prod.sql
```
Expected(2026-09-30 설계 기준 — 판정은 아래):
- `users` 사백 넘음 · `excused=true · …` 줄이 **없다**(옛 인정 단추는 한 번도 안 떴다 — 설계 0절 1) · `autumn rows | 0`(10/27 전) · `autumn import | 0` · `autumn no user | 0` · `note 가 「자격 인정:」으로 시작 | 0`
- `autumn event | draft | 2026-10-27 | 2026-11-28 | 2026-12-13 | {"need": 3, "start": "2026-10-11", "weeks": 6, "minNeed": 2, "perWeek": 3} | false`(10/11 뒤면 `open`)
- `active 42 days` 수백 이하(1,000 에 한참 못 미침) · `rpc exists | 1`

판정:
- `excused=true` 줄이 가을 회차에 있으면 **멈추고** 친구에게(물음 15 — 표기로 옮겨 적을지). 다른 회차에만 있으면 옮기지 않고 친구에게 알린다(그 `excuseReason` 을 지울지는 성경암송 쪽 SQL — 이 계획 밖).
- `note 가 「자격 인정:」으로 시작` 이 0 이 아니면 **멈춘다** — 그 줄이 인정으로 읽힌다. 친구와 그 줄을 본다.
- `autumn event` 의 날짜·규칙이 위와 다르면 **멈추고** 친구에게 묻는다(담당자가 회차 설정에서 날짜를 바꿨을 수 있다 — 이 계획의 날짜표가 달라진다).
- `active 42 days` 가 800 을 넘으면 친구에게 알린다(`count-capped` 가 가까워진다).

- [ ] **Step 6: 성경암송 원문 고정(읽기)**

```bash
V2=/c/Projects/bible-memorize-church-app-v2
git -C $V2 cat-file -e 1498177 && echo HAS-1498177
git -C $V2 show 1498177:supabase/functions/api/index.ts | sed -n '5145,5199p' | md5sum
git -C $V2 show 1498177:supabase/functions/api/index.ts | sed -n '5145,5146p;5199p' | cat -A | cut -c1-60
git -C $V2 diff --stat 1498177 HEAD -- supabase/functions/api/index.ts
```
Expected: `HAS-1498177` · 첫 칸 `8a35f39b7ff8f9d3cbcb375725b78929`(꼬리는 셸에 따라 `  -` 또는 ` *-` — Git Bash 의 md5sum 은 ` *-` 를 찍는다) · `cat -A` 세 줄 = **빈 줄**(`$` 하나 — 5145 는 빈 줄이다) · `// M-kM-^BM- …`(5146 「// 날짜 더하기 — …」 주석이 바이트로 보인다) · `}$`(5199 evtCanReach 의 닫는 괄호) · 마지막 줄은 비었거나(그 뒤로 api 가 안 바뀜) 다른 세션의 변경 통계(2026-09-30 에 이미 700줄 남짓 — 참고만, 원문은 1498177 로 고정한다 · HEAD 의 `evtRule` 은 5205 줄 근처로 밀렸다).

- [ ] **Step 7: 결과를 적는다(커밋 없음)**

`C:\Projects\church-admin\.superpowers\sdd\bible-events\progress.md`(저장소에 안 들어간다) 끝에 한 줄:
`가을 인정 Task 1 (<날짜>): 가지 autumn-excuse START=<해시> · be-polish main 에 있음 · 개발 RPC/트리거/verses OK · 운영 읽기 — excused 0 · autumn 줄 0 · 표기 0 · 설정 같음 · 활동 <N>`

---

### Task 2: 순수 모듈 `events-elig.ts` — 셈(성경암송 사본)·날짜 셋·인정 표기·줄 파생·요약·미신청 고르기

**Files:**
- Create: `supabase/functions/church-admin/events-elig.ts`
- Create: `tests/events-elig.test.mjs`
- Create: `tests/fixtures/excuse-marker.json`(표기 보기 — Task 6 화면 시험도 읽는다)
- Create: `tests/fixtures/evt-legacy.ts`(성경암송 `1498177` 5145-5199줄 원문 사본 — `git show` 로 옮긴다)

**Interfaces:**
- Consumes: `paper.ts` `legacyNorm(s: unknown): string`(앞뒤 떼고 빈칸 하나로) · `events-rules.ts` `checkNote(note): string | null`(시험만)
- Produces(`events-elig.ts` · Task 3·4·6 이 이 이름 그대로 쓴다):
  - 형: `EligRule = {start,weeks,perWeek,need,minNeed}` · `WeekRow = {user_id, weeks_done, week_days: number[]|null, first_day: string|null}` · `Stamp = {weekDays: number[], firstDay: string|null, weeksDone: number, need: number}` · `EligOut = {id, excused, excuseReason, noteRest, weeksDone: number|null, need: number|null, byWeeks: boolean|null, ok: boolean|null, perfect: boolean|null}`
  - 상수: `DEV_REF = "ktpwthwqzgcqcrmsafdo"`(게이트는 개발에서만 저절로 열린다 — 닫히는 쪽으로 틀린다) · `RPC_CAP = 1000` · `EXCUSE_HEAD = "자격 인정: "`(7자) · `EXCUSE_SEP = " / "` · `EXCUSE_REASON_MAX = 200`
  - 셈: `eligRule(needs): EligRule|null` · `ruleEnd(rule): string` · `ruleOut(rule): {start,end,weeks,perWeek,need,minNeed}` · `needFor(rule, firstDay): number` · `canReach(rule, weekDays, need, today): boolean`
  - 날짜: `eligPhase(rule, today): "before"|"measuring"|"ended"` · `excuseWindow(ev, today): "not-open"|"open"|"over"` · `missingWindow(ev, today): "not-open"|"open"|"closed"`(ev 는 `{opens_on, closes_on, list_until}`)
  - 표기: `excuseOf(note): string|null` · `stripExcuse(note): string` · `withExcuse(reason: string|null, rest): string` · `checkReason(raw): {reason, error: string|null}` · `guardMemo(curNote, sent): {note, error: string|null}`
  - 줄: `rpcCapped(n): boolean` · `stampOf(rule, w: WeekRow|null|undefined): Stamp` · `weekFullOf(rule, weekDays): boolean[]` · `eligRowOut(r: {id,user_id,note}, rule, phase, by: Map<string,WeekRow>): EligOut` · `eligCounts(list: {source, out: EligOut}[], phase): {total, ok, byWeeks, byExcuse, noAccount, recheckShort, perfect: number|null}` · `missingPick(weeks: WeekRow[], signed: Iterable<string>, rule): string[]` · `missingOut(u): {name, who_type, group, sub}` · `asksPosition(needs): boolean` · `excuseGateOpen(supabaseUrl: unknown, liveProd: boolean): boolean`(개발 주소만 저절로 열림 — 모르는 주소는 닫힘)

- [ ] **Step 1: 성경암송 원문 사본 — `tests/fixtures/evt-legacy.ts`**

```bash
cd /c/Projects/church-admin/.worktrees/autumn-excuse
test -e tests/fixtures/evt-legacy.ts && echo EXISTS || echo FREE
mkdir -p tests/fixtures
cat > tests/fixtures/evt-legacy.ts <<'EOF'
// 성경암송 api 의 자격 셈 원문 사본(가을 인정 계획 Task 2) — tests/events-elig.test.mjs 가 events-elig.ts 와 같은 입력으로 맞댄다.
// 원본: bible-memorize-church-app-v2 커밋 1498177 · supabase/functions/api/index.ts 5145-5199줄(evtDayAdd·evtRule·evtPhase·evtNeedFor·evtCanReach).
// ⚠️ 손으로 고치지 말 것 — 「원문 시작」~「원문 끝」 사이는 git show 로 그대로 옮겼다(md5 8a35f39b7ff8f9d3cbcb375725b78929).
//    새 셈(events-elig.ts)을 이 원문에 맞추고, 이 원문을 새 셈에 맞추지 않는다.
// 원문 152줄의 norm(성경암송 api) — events-rules 쪽 legacyNorm 과 같은 식
const norm = (s: unknown) => (s ?? "").toString().trim().replace(/\s+/g, " ");
// ---- 원문 시작 ----
EOF
git -C /c/Projects/bible-memorize-church-app-v2 show 1498177:supabase/functions/api/index.ts | sed -n '5145,5199p' >> tests/fixtures/evt-legacy.ts
cat >> tests/fixtures/evt-legacy.ts <<'EOF'
// ---- 원문 끝 ----
export { evtDayAdd, evtRule, evtPhase, evtNeedFor, evtCanReach };
EOF
sed -n '/^\/\/ ---- 원문 시작 ----/,/^\/\/ ---- 원문 끝 ----/p' tests/fixtures/evt-legacy.ts | sed '1d;$d' | tr -d '\r' | md5sum
node --experimental-strip-types --input-type=module -e "const L = await import('./tests/fixtures/evt-legacy.ts'); console.log(Object.keys(L).sort().join(','));"
```
Expected: `FREE` · 첫 칸 `8a35f39b7ff8f9d3cbcb375725b78929`(꼬리 ` *-`/`  -` 는 셸마다 다르다) · `evtCanReach,evtDayAdd,evtNeedFor,evtPhase,evtRule`(ExperimentalWarning 한 줄은 괜찮다). 해시가 다르면 사본이 틀렸다 — 파일을 지우고 다시(손으로 고치지 않는다).

- [ ] **Step 2: 표기 보기 — `tests/fixtures/excuse-marker.json`(Write)**

```json
{
  "_": "가을 말씀 동행 인정 표기 보기 — 서버 시험(events-elig.test.mjs)과 화면 시험(be-elig-logic.test.mjs)이 함께 읽는다. 표기 규칙을 바꾸면 이 파일·events-elig.ts·elig-logic.js 를 함께.",
  "read": [
    { "note": "", "reason": null, "rest": "" },
    { "note": "담당자가 더함", "reason": null, "rest": "담당자가 더함" },
    { "note": "자격 인정: 10월 3주 입원", "reason": "10월 3주 입원", "rest": "" },
    { "note": "자격 인정: 10월 3주 입원 / 담당자가 더함", "reason": "10월 3주 입원", "rest": "담당자가 더함" },
    { "note": "자격 인정: 10/18~10/24 입원 / 담당자가 더함 / 전화로 여쭘", "reason": "10/18~10/24 입원", "rest": "담당자가 더함 / 전화로 여쭘" },
    { "note": "  자격 인정:   간병   /  담당자가 더함 ", "reason": "간병", "rest": "담당자가 더함" },
    { "note": "자격 인정:", "reason": null, "rest": "자격 인정:" },
    { "note": "자격 인정: ", "reason": null, "rest": "자격 인정:" },
    { "note": "자격인정: 간병", "reason": null, "rest": "자격인정: 간병" },
    { "note": "담당자가 더함 / 자격 인정: 간병", "reason": null, "rest": "담당자가 더함 / 자격 인정: 간병" },
    { "note": "자격 인정: 간병", "nfd": true, "reason": null }
  ],
  "with": [
    { "reason": "간병", "rest": "", "note": "자격 인정: 간병" },
    { "reason": "간병", "rest": "담당자가 더함", "note": "자격 인정: 간병 / 담당자가 더함" },
    { "reason": null, "rest": " 메모 ", "note": "메모" },
    { "reason": "10/18 입원", "rest": "담당자가 더함 / 전화", "note": "자격 인정: 10/18 입원 / 담당자가 더함 / 전화" }
  ],
  "reason": [
    { "in": "  10월 3주   입원 ", "reason": "10월 3주 입원", "error": null },
    { "in": "", "error": "no-reason" },
    { "in": "   ", "error": "no-reason" },
    { "in": "10/18~10/24 입원", "reason": "10/18~10/24 입원", "error": null },
    { "in": "입원 / 간병", "error": "reason-bad-char" },
    { "in": "/입원", "error": "reason-bad-char" },
    { "in": "입원/", "error": "reason-bad-char" },
    { "in": "입원 /간병", "error": null },
    { "repeat": ["가", 200], "error": null },
    { "repeat": ["가", 201], "error": "reason-too-long" }
  ],
  "memo": [
    { "cur": "", "sent": "보통 메모", "note": "보통 메모", "error": null },
    { "cur": "", "sent": "자격 인정: 가짜", "error": "excuse-via-memo" },
    { "cur": "", "sent": "자격 인정:가짜", "error": "excuse-via-memo" },
    { "cur": "", "sent": "자격 인정: 가짜", "sentNfd": true, "error": "excuse-via-memo" },
    { "cur": "자격 인정: 간병 / 담당자가 더함", "sent": "새 메모", "note": "자격 인정: 간병 / 새 메모", "error": null },
    { "cur": "자격 인정: 간병 / 담당자가 더함", "sent": "", "note": "자격 인정: 간병", "error": null },
    { "cur": "자격 인정: 간병 / 담당자가 더함", "sent": "자격 인정: 간병 / 담당자가 더함 / 전화", "note": "자격 인정: 간병 / 담당자가 더함 / 전화", "error": null },
    { "cur": "자격 인정: 간병", "sent": "자격 인정: 간병", "note": "자격 인정: 간병", "error": null },
    { "cur": "자격 인정: 간병", "sent": "  자격 인정: 간병  /  새 ", "note": "자격 인정: 간병 / 새", "error": null },
    { "cur": "자격 인정: 간병 / 담당자가 더함", "sent": "자격 인정: 입원 / 담당자가 더함", "error": "excuse-via-memo" },
    { "cur": "자격 인정: 간병", "sent": "자격 인정: 간병 / 자격 인정: 입원", "error": "excuse-via-memo" }
  ]
}
```

- [ ] **Step 3: 실패하는 시험 — `tests/events-elig.test.mjs`(Write)**

```js
// 가을 말씀 동행 — 자격 셈·인정 표기(supabase/functions/church-admin/events-elig.ts) 순수 시험 · 가을 인정 계획 Task 2.
// ⚠️ 셈은 성경암송 원문 사본(tests/fixtures/evt-legacy.ts — 커밋 1498177)과 같은 입력으로 맞댄다. 한쪽만 고치면 여기서 깨진다.
// ⚠️ 표기 보기는 tests/fixtures/excuse-marker.json — 화면 시험(be-elig-logic.test.mjs)도 같은 파일을 읽는다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as E from "../supabase/functions/church-admin/events-elig.ts";
import * as L from "./fixtures/evt-legacy.ts";
import { checkNote } from "../supabase/functions/church-admin/events-rules.ts";

const FX = JSON.parse(readFileSync(new URL("./fixtures/excuse-marker.json", import.meta.url), "utf8"));
const AUT = { start: "2026-10-11", weeks: 6, perWeek: 3, need: 3, minNeed: 2 };
const AUT_NEEDS = { eligibility: { start: "2026-10-11", weeks: 6, perWeek: 3, need: 3, minNeed: 2 } };
const AUT_EV = { opens_on: "2026-10-27", closes_on: "2026-11-28", list_until: "2026-12-13" };
const day = (n) => new Date(Date.parse("2026-10-11T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const el = (o) => ({ eligibility: { ...AUT_NEEDS.eligibility, ...o } });

test("eligRule — 성경암송 evtRule 과 같은 입력에 같은 답(회차 줄이 아니라 needs 를 받는다) · minNeed 기본 2 · 모양이 틀리면 null", () => {
  const cases = [AUT_NEEDS, el({ minNeed: undefined }), el({ start: " 2026-10-11 " }), el({ weeks: "6", perWeek: "3", need: "3" }),
    null, undefined, {}, "x", { eligibility: null }, { eligibility: "x" }, el({ start: "2026-10-1" }), el({ start: "2026/10/11" }),
    el({ weeks: 3.5 }), el({ weeks: 0 }), el({ weeks: 27 }), el({ perWeek: 0 }), el({ perWeek: 8 }), el({ need: 7 }), el({ need: 0 }),
    el({ minNeed: 4 }), el({ minNeed: 0 }), el({ minNeed: 2.5 }), el({ weeks: 26, need: 26, minNeed: 1 })];
  for (const n of cases) assert.deepEqual(E.eligRule(n), L.evtRule({ needs: n }), String(JSON.stringify(n)));
  assert.deepEqual(E.eligRule(AUT_NEEDS), AUT);
  assert.deepEqual(E.eligRule(el({ minNeed: undefined })), AUT);
  assert.equal(E.eligRule(el({ weeks: 3.5 })), null);
  assert.equal(E.eligRule(null), null);
  assert.equal(E.ruleEnd(AUT), "2026-11-21");
  assert.deepEqual(E.ruleOut(AUT), { start: "2026-10-11", end: "2026-11-21", weeks: 6, perWeek: 3, need: 3, minNeed: 2 });
});

test("needFor — 가을 설계 §3 표(1주 3 · 2~6주 2) · 첫 활동일 없음·시작 전·끝난 뒤는 need 그대로 · 성경암송 evtNeedFor 와 같다", () => {
  const table = [[null, 3], ["2026-10-01", 3], [day(0), 3], [day(6), 3], [day(7), 2], [day(14), 2], [day(21), 2], [day(28), 2],
    [day(35), 2], [day(41), 2], [day(42), 3]];
  for (const [fd, want] of table) {
    assert.equal(E.needFor(AUT, fd), want, String(fd));
    assert.equal(E.needFor(AUT, fd), L.evtNeedFor(AUT, fd), "원문과 다름 " + fd);
  }
  const r4 = { start: "2000-02-06", weeks: 4, perWeek: 3, need: 3, minNeed: 2 };
  for (let n = -3; n < 35; n++) {
    const fd = new Date(Date.parse("2000-02-06T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
    assert.equal(E.needFor(r4, fd), L.evtNeedFor(r4, fd), fd);
  }
});

test("canReach — 채운 주 + 안 끝난 주 ≥ need · 여섯째 주에 처음 오신 분(2주 필요)은 닿을 수 없다 · 성경암송 evtCanReach 와 같다", () => {
  const cases = [
    [[3, 3, 0, 0, 0, 0], 3, day(35), true],     // 두 주 + 여섯째 주 하나 = 3
    [[3, 3, 0, 0, 0, 0], 3, day(42), false],    // 끝난 뒤 — 남은 주 없음
    [[3, 0, 0, 0, 0, 0], 3, day(35), false],
    [[0, 0, 0, 0, 0, 0], 2, day(35), false],    // 여섯째 주 첫 활동 — 두 주가 필요한데 남은 주는 하나
    [[0, 0, 0, 0, 0, 0], 3, day(-1), true],     // 시작 전 — 여섯 주가 다 남았다
    [[2, 2, 2, 2, 2, 2], 3, day(28), false],    // 주 3일에 못 미치는 주는 채운 주가 아니다 · 남은 주 둘
  ];
  for (const [wd, need, today, want] of cases) {
    assert.equal(E.canReach(AUT, wd, need, today), want, JSON.stringify([wd, need, today]));
    assert.equal(E.canReach(AUT, wd, need, today), L.evtCanReach(AUT, wd, need, today), "원문과 다름");
  }
});

test("eligPhase · excuseWindow · missingWindow — 10/10·10/11·11/21·11/22 · 10/26·10/27·12/13·12/14 · 10/26·10/27·11/28·11/29", () => {
  assert.deepEqual(["2026-10-10", "2026-10-11", "2026-11-21", "2026-11-22"].map((d) => E.eligPhase(AUT, d)),
    ["before", "measuring", "measuring", "ended"]);
  assert.deepEqual(["2026-10-26", "2026-10-27", "2026-12-13", "2026-12-14"].map((d) => E.excuseWindow(AUT_EV, d)),
    ["not-open", "open", "open", "over"]);
  assert.equal(E.excuseWindow({ ...AUT_EV, list_until: null }, "2027-06-01"), "open");
  assert.deepEqual(["2026-10-26", "2026-10-27", "2026-11-28", "2026-11-29"].map((d) => E.missingWindow(AUT_EV, d)),
    ["not-open", "open", "open", "closed"]);
  // 성경암송 evtPhase 는 측정·신청이 겹칠 때를 「signup」이라 부른다(이름이 다르다) — 시작 전만 같은지 본다
  assert.equal(L.evtPhase({ opens_on: "2026-10-27", closes_on: "2026-11-28" }, AUT, "2026-10-10"), "before");
});

test("인정 표기 — 읽기·떼기(보기 파일) · 붙이기 · 사유 검사(띄어 쓴 「 / 」·끝의 「/」만 막는다 · 10/18 은 된다) · 500자", () => {
  for (const c of FX.read) {
    const n = c.nfd ? c.note.normalize("NFD") : c.note;
    assert.equal(E.excuseOf(n), c.reason, JSON.stringify(c));
    assert.equal(E.stripExcuse(n), c.nfd ? n : c.rest, JSON.stringify(c));
  }
  for (const c of FX.with) assert.equal(E.withExcuse(c.reason, c.rest), c.note, JSON.stringify(c));
  for (const c of FX.reason) {
    const raw = c.repeat ? c.repeat[0].repeat(c.repeat[1]) : c.in;
    const got = E.checkReason(raw);
    assert.equal(got.error, c.error, JSON.stringify(c).slice(0, 80));
    if (c.reason !== undefined) assert.equal(got.reason, c.reason);
  }
  assert.equal(E.EXCUSE_HEAD.length, 7);
  const r200 = "가".repeat(200);
  assert.equal(E.withExcuse(r200, "나".repeat(290)).length, 500);
  assert.equal(checkNote(E.withExcuse(r200, "나".repeat(290))), null);
  assert.equal(checkNote(E.withExcuse(r200, "나".repeat(291))), "note-too-long");
});

test("guardMemo — 자격 회차 줄의 메모: 표기는 서버가 다시 붙인다 · 「자격 인정:」으로 시작하면 excuse-via-memo(NFD 도) · 지금 표기 그대로 시작하면 받는다", () => {
  for (const c of FX.memo) {
    const sent = c.sentNfd ? c.sent.normalize("NFD") : c.sent;
    const g = E.guardMemo(c.cur, sent);
    assert.equal(g.error, c.error, JSON.stringify(c));
    if (!c.error) assert.equal(g.note, c.note, JSON.stringify(c));
  }
});

test("stampOf · eligRowOut — 행 없음 = 0주·need 그대로 · 계정 없는 줄은 모름(null) · 인정이면 ok · ✨ 는 끝난 뒤만 · 주로 채움은 인정과 따로", () => {
  const late = { user_id: "u-late", weeks_done: 2, week_days: [0, 0, 0, 3, 3, 0], first_day: day(21) };
  const by = new Map([["u-late", late]]);
  assert.deepEqual(E.stampOf(AUT, null), { weekDays: [0, 0, 0, 0, 0, 0], firstDay: null, weeksDone: 0, need: 3 });
  assert.deepEqual(E.stampOf(AUT, late), { weekDays: [0, 0, 0, 3, 3, 0], firstDay: day(21), weeksDone: 2, need: 2 });
  assert.deepEqual(E.weekFullOf(AUT, [0, 0, 0, 3, 3, 2]), [false, false, false, true, true, false]);
  const out = (r, phase = "measuring") => E.eligRowOut(r, AUT, phase, by);
  assert.deepEqual(out({ id: 1, user_id: "u-late", note: "" }),
    { id: 1, excused: false, excuseReason: "", noteRest: "", weeksDone: 2, need: 2, byWeeks: true, ok: true, perfect: null });
  assert.deepEqual(out({ id: 2, user_id: "u-none", note: "자격 인정: 간병 / 담당자가 더함" }),
    { id: 2, excused: true, excuseReason: "간병", noteRest: "담당자가 더함", weeksDone: 0, need: 3, byWeeks: false, ok: true, perfect: null });
  assert.deepEqual(out({ id: 3, user_id: null, note: "담당자가 더함" }),
    { id: 3, excused: false, excuseReason: "", noteRest: "담당자가 더함", weeksDone: null, need: null, byWeeks: null, ok: null, perfect: null });
  assert.equal(out({ id: 4, user_id: null, note: "자격 인정: 종이로 암송" }).ok, true);
  assert.equal(out({ id: 5, user_id: "u-late", note: "" }, "ended").perfect, false);
  const six = new Map([["u6", { user_id: "u6", weeks_done: 6, week_days: [3, 3, 3, 3, 3, 3], first_day: "2026-01-01" }]]);
  assert.equal(E.eligRowOut({ id: 6, user_id: "u6", note: "" }, AUT, "ended", six).perfect, true);
  assert.equal(E.eligRowOut({ id: 6, user_id: "u6", note: "" }, AUT, "measuring", six).perfect, null);
});

test("도장판과 같은 셈 — 같은 RPC 줄에서 필요 주·자격·닿을 수 있나가 성경암송 evtStampsFor 의 셈과 같다(행 없음 = 0주·need 3)", () => {
  // evtStampsFor(성경암송 api 5203-5238)의 셈 부분만 — RPC·v2_mydays 호출은 빼고 그대로 옮겼다
  const legacy = (rule, row, today) => {
    const weekDays = row?.week_days ?? new Array(rule.weeks).fill(0);
    const firstDay = row?.first_day ? String(row.first_day).slice(0, 10) : null;
    const weeksDone = Number(row?.weeks_done ?? 0);
    const need = L.evtNeedFor(rule, firstDay);
    return { weeksDone, need, eligible: weeksDone >= need, canStillReach: L.evtCanReach(rule, weekDays, need, today) };
  };
  const rows = [null,
    { user_id: "a", weeks_done: 3, week_days: [3, 3, 3, 0, 0, 0], first_day: "2026-03-01" },
    { user_id: "b", weeks_done: 2, week_days: [3, 3, 0, 0, 0, 0], first_day: day(0) },
    { user_id: "c", weeks_done: 2, week_days: [0, 0, 0, 3, 3, 0], first_day: day(22) },
    { user_id: "d", weeks_done: 0, week_days: [0, 0, 0, 0, 0, 2], first_day: day(36) },
    { user_id: "e", weeks_done: 1, week_days: [0, 5, 1, 0, 0, 0], first_day: "2025-12-24" }];
  for (const today of [day(-1), day(20), day(35), day(41), day(45)]) for (const row of rows) {
    const s = E.stampOf(AUT, row);
    assert.deepEqual({ weeksDone: s.weeksDone, need: s.need, eligible: s.weeksDone >= s.need,
      canStillReach: E.canReach(AUT, s.weekDays, s.need, today) }, legacy(AUT, row, today), today + " " + JSON.stringify(row));
  }
});

test("eligCounts — 주로 채움 + 인정으로 = 자격 됨(겹쳐 세지 않는다) · 계정 없음 · 다시 센 값이 모자란 앱 줄 · ✨ 는 끝난 뒤만", () => {
  const o = (x) => ({ id: 0, excused: false, excuseReason: "", noteRest: "", weeksDone: 0, need: 3, byWeeks: false, ok: false, perfect: null, ...x });
  const list = [
    { source: "app", out: o({ weeksDone: 3, byWeeks: true, ok: true }) },
    { source: "app", out: o({ weeksDone: 3, byWeeks: true, ok: true, excused: true }) },   // 인정 받고 주로도 채움 — 「주로 채움」에만
    { source: "app", out: o({ weeksDone: 2 }) },                                            // 다시 센 값이 모자란 앱 줄
    { source: "app", out: o({ weeksDone: 1, excused: true, ok: true }) },
    { source: "import", out: o({ weeksDone: null, need: null, byWeeks: null, ok: true, excused: true }) },
    { source: "import", out: o({ weeksDone: null, need: null, byWeeks: null, ok: null }) },
  ];
  const c = E.eligCounts(list, "measuring");
  assert.deepEqual(c, { total: 6, ok: 4, byWeeks: 2, byExcuse: 2, noAccount: 2, recheckShort: 1, perfect: null });
  assert.equal(c.byWeeks + c.byExcuse, c.ok);
  assert.equal(list.filter((x) => x.out.ok === true).length, c.ok);
  assert.equal(E.eligCounts([{ source: "app", out: o({ weeksDone: 6, byWeeks: true, ok: true, perfect: true }) }], "ended").perfect, 1);
  assert.deepEqual(E.eligCounts([], "measuring"), { total: 0, ok: 0, byWeeks: 0, byExcuse: 0, noAccount: 0, recheckShort: 0, perfect: null });
});

test("missingPick · missingOut — 신청한 계정은 빼고 need 를 채운 계정만(늦게 오신 분은 두 주) · 겹침 없이 · 교구·교회학교 칸", () => {
  const w = (id, done, fd) => ({ user_id: id, weeks_done: done, week_days: null, first_day: fd });
  const weeks = [w("a", 3, "2026-01-01"), w("b", 2, "2026-01-01"), w("c", 2, day(22)), w("d", 3, day(0)), w("a", 3, "2026-01-01")];
  assert.deepEqual(E.missingPick(weeks, ["d"], AUT), ["a", "c"]);
  assert.deepEqual(E.missingPick([], [], AUT), []);
  assert.deepEqual(E.missingOut({ type: "교구", gu: " 사랑 ", mok: "5", bu: "", grade: "", name: "도하늘" }),
    { name: "도하늘", who_type: "교구", group: "사랑", sub: "5" });
  assert.deepEqual(E.missingOut({ type: "교회학교", gu: "", mok: "", bu: "청년부", grade: "", name: "라바다" }),
    { name: "라바다", who_type: "교회학교", group: "청년부", sub: "" });
});

test("작은 것 — 1,000행이면 셀 수 없다 · 직분을 받는 회차 · 운영 게이트(2단계 전엔 개발만 열린다 — 운영·모르는 주소는 닫힘)", () => {
  assert.equal(E.rpcCapped(999), false);
  assert.equal(E.rpcCapped(1000), true);
  assert.equal(E.asksPosition({ position: true, eligibility: {} }), true);
  assert.equal(E.asksPosition(AUT_NEEDS), false);
  assert.equal(E.asksPosition(null), false);
  assert.equal(E.excuseGateOpen("https://ktpwthwqzgcqcrmsafdo.supabase.co", false), true);
  assert.equal(E.excuseGateOpen("https://xnomlgydifiqiybervtf.supabase.co", false), false);
  assert.equal(E.excuseGateOpen("https://xnomlgydifiqiybervtf.supabase.co", true), true);
  // 닫히는 쪽으로 틀린다 — 모르는 주소(빈 값·내부 주소)는 운영처럼 닫힌다(운영 주소를 찾아 닫는 꼴이면 여기서 열려 버린다)
  for (const u of ["", undefined, null, "http://kong:8000", "https://example.supabase.co"]) assert.equal(E.excuseGateOpen(u, false), false, String(u));
});
```

- [ ] **Step 4: 돌려서 실패를 본다**

```bash
cd /c/Projects/church-admin/.worktrees/autumn-excuse
node --experimental-strip-types --test tests/events-elig.test.mjs
```
Expected: FAIL — `Cannot find module '…/supabase/functions/church-admin/events-elig.ts'` · `# fail 1`.

- [ ] **Step 5: `supabase/functions/church-admin/events-elig.ts`(Write)**

```ts
// 성경필사(암송) — 가을 말씀 동행(자격 회차)의 셈과 인정 표기(순수 함수 · 2026-10 · 가을 인정 계획 Task 2)
//   설계: 성경암송 저장소 docs/superpowers/specs/2026-09-30-church-admin-autumn-excuse-design.md §2·§3
//   서버(Deno, index.ts)와 시험(Node, tests/events-elig.test.mjs)이 **같은 파일**을 읽는다 — authz.ts 와 같은 제약
//   (원격 import·enum·namespace·parameter property·non-null 단언 금지 · node --experimental-strip-types 가 그대로 읽는다).
// ⚠️ eligRule·needFor·canReach 는 성경암송 api 의 evtRule·evtNeedFor·evtCanReach(커밋 1498177 · 5151·5181·5192줄)를 글자 그대로 옮겼다.
//    성도님 도장판(evtStampsFor)과 **같은 셈**이어야 「앱에서는 신청 단추가 열렸는데 어드민은 미달」이 안 생긴다.
//    tests/fixtures/evt-legacy.ts 가 그 원문 사본이고 시험이 같은 입력으로 두 쪽을 맞댄다 — 한쪽만 고치지 말 것.
// ⚠️ 「자격 회차인가」(막기)는 events-rules.ts isEligEvent 그대로다. 여기 eligRule 이 null 이면 「규칙을 못 읽음」이지 「0명」이 아니다.
// ⚠️ 인정은 note 의 첫 조각 「자격 인정: 사유」다(뒤 메모는 「 / 」로 잇는다). answers 는 읽지도 쓰지도 않는다.
//    화면(js/menus/bibleevent/elig-logic.js)에 읽기 함수가 한 벌 더 있다 — tests/fixtures/excuse-marker.json 을 두 시험이 함께 읽는다.
import { legacyNorm } from "./paper.ts";

export type EligRule = { start: string; weeks: number; perWeek: number; need: number; minNeed: number };
// v2_event_weeks 한 줄(성경암송 supabase/event_streak.sql) — 창 안에 활동이 없는 계정은 줄이 **없다**
export type WeekRow = { user_id: string; weeks_done: number; week_days: number[] | null; first_day: string | null };
export type Stamp = { weekDays: number[]; firstDay: string | null; weeksDone: number; need: number };
export type EligOut = {
  id: number; excused: boolean; excuseReason: string; noteRest: string;
  weeksDone: number | null; need: number | null; byWeeks: boolean | null; ok: boolean | null; perfect: boolean | null;
};

export const DEV_REF = "ktpwthwqzgcqcrmsafdo";    // 개발 프로젝트 — 인정 셋의 게이트(excuseGateOpen)는 여기서만 저절로 열린다
export const RPC_CAP = 1000;                      // PostgREST max_rows — v2_event_weeks 가 이만큼 돌려주면 잘렸을 수 있다
export const EXCUSE_HEAD = "자격 인정: ";
export const EXCUSE_SEP = " / ";
export const EXCUSE_REASON_MAX = 200;

const dayAdd = (ymd: string, n: number): string =>
  new Date(Date.parse(ymd + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);

// ── 셈 — 성경암송 원문 그대로 ──

// needs.eligibility 를 읽어 규칙으로(evtRule 5151-5165 · 회차 줄이 아니라 needs 를 받는다). 모양이 틀리면 null.
export function eligRule(needs: unknown): EligRule | null {
  const e = ((needs ?? {}) as any).eligibility;
  if (!e || typeof e !== "object") return null;
  const start = legacyNorm(e.start);
  const weeks = Number(e.weeks), perWeek = Number(e.perWeek), need = Number(e.need);
  const minNeed = Number(e.minNeed ?? 2);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return null;
  // ⚠️ 정수를 강제한다. 3.5 같은 값이 들어오면 canReach 의 for 경계가 어긋난다.
  if (![weeks, perWeek, need, minNeed].every(Number.isInteger)) return null;
  if (!(weeks >= 1 && weeks <= 26)) return null;
  if (!(perWeek >= 1 && perWeek <= 7)) return null;
  if (!(need >= 1 && need <= weeks)) return null;
  if (!(minNeed >= 1 && minNeed <= need)) return null;
  return { start, weeks, perWeek, need, minNeed };
}
export const ruleEnd = (rule: EligRule): string => dayAdd(rule.start, rule.weeks * 7 - 1);
export const ruleOut = (rule: EligRule) =>
  ({ start: rule.start, end: ruleEnd(rule), weeks: rule.weeks, perWeek: rule.perWeek, need: rule.need, minNeed: rule.minNeed });

// 이분에게 필요한 주 수(evtNeedFor 5181-5188). firstDay 는 **전 기간**의 첫 활동일(RPC first_day) —
// 이벤트 안에서만 보면 기존 회원이 일부러 늦게 시작해 문턱을 낮출 수 있다.
export function needFor(rule: EligRule, firstDay: string | null): number {
  if (!firstDay || firstDay < rule.start) return rule.need;
  const wk = Math.floor(
    (Date.parse(firstDay + "T00:00:00Z") - Date.parse(rule.start + "T00:00:00Z")) / 86400000 / 7);
  if (wk < 0 || wk >= rule.weeks) return rule.need;
  const remain = rule.weeks - wk;
  return Math.min(rule.need, Math.max(rule.minNeed, Math.floor(remain / 2)));
}

// 남은 주를 다 채워도 닿을 수 있나(evtCanReach 5192-5199) — 채운 주 + 안 끝난 주 ≥ need
export function canReach(rule: EligRule, weekDays: number[], need: number, today: string): boolean {
  let done = 0, left = 0;
  for (let i = 0; i < rule.weeks; i++) {
    if ((weekDays[i] ?? 0) >= rule.perWeek) done++;
    else if (today <= dayAdd(rule.start, i * 7 + 6)) left++;
  }
  return done + left >= need;
}

// ── 날짜로 가르는 것 셋(새로) — 화면 elig-logic.js 에 사본이 있고 시험이 같은 날짜 표로 맞댄다 ──
export function eligPhase(rule: EligRule, today: string): "before" | "measuring" | "ended" {
  if (today < rule.start) return "before";
  if (today > ruleEnd(rule)) return "ended";
  return "measuring";
}
type EvDates = { opens_on?: unknown; closes_on?: unknown; list_until?: unknown };
// 인정 창 — 신청이 열린 날(opens_on)부터 명단 공개 종료일(list_until)까지. list_until 이 비면 끝이 없다.
// 인정 셋(도장 확인·넣기·고치기)이 **같은 함수**로 본다.
export function excuseWindow(ev: EvDates, today: string): "not-open" | "open" | "over" {
  if (today < legacyNorm(ev.opens_on)) return "not-open";
  const until = legacyNorm(ev.list_until);
  if (until && today > until) return "over";
  return "open";
}
// 미신청 목록 — 신청 창(opens_on ~ closes_on) 동안만 이름, 마감 뒤엔 수만(알려 드릴 수 없게 된 분의 이름을 둘 까닭이 없다)
export function missingWindow(ev: EvDates, today: string): "not-open" | "open" | "closed" {
  if (today < legacyNorm(ev.opens_on)) return "not-open";
  if (today <= legacyNorm(ev.closes_on)) return "open";
  return "closed";
}

// ── 인정 표기 ──
// 첫 조각이 「자격 인정: 사유」면 사유, 아니면 null. 완성형 글자로만 읽는다(맥 자모분리 「자격 인정:」은 표기가 아니다 —
// 그런 메모는 guardMemo 가 막는다). 사유에는 띄어 쓴 「 / 」가 없으므로(checkReason) 첫 「 / 」가 이음표다.
export function excuseOf(note: unknown): string | null {
  const n = legacyNorm(note);
  if (!n.startsWith(EXCUSE_HEAD)) return null;
  const i = n.indexOf(EXCUSE_SEP, EXCUSE_HEAD.length);
  const reason = (i < 0 ? n.slice(EXCUSE_HEAD.length) : n.slice(EXCUSE_HEAD.length, i)).trim();
  return reason ? reason : null;
}
// 표기를 뺀 나머지 메모 — 표기가 없으면 메모 그대로(한 줄로)
export function stripExcuse(note: unknown): string {
  const n = legacyNorm(note);
  if (excuseOf(n) === null) return n;
  const i = n.indexOf(EXCUSE_SEP, EXCUSE_HEAD.length);
  return i < 0 ? "" : n.slice(i + EXCUSE_SEP.length);
}
// 사유(없으면 null)와 나머지 메모로 note 를 짓는다
export function withExcuse(reason: string | null, rest: unknown): string {
  const r = legacyNorm(rest);
  if (!reason) return r;
  return EXCUSE_HEAD + reason + (r ? EXCUSE_SEP + r : "");
}
// 사유 검사 — 한 줄로 다듬고 1~200자 · 띄어 쓴 「 / 」와 앞·뒤 끝의 「/」만 막는다(「10/18~10/24 입원」은 된다)
export function checkReason(raw: unknown): { reason: string; error: string | null } {
  const reason = legacyNorm(raw);
  if (!reason) return { reason, error: "no-reason" };
  if (reason.length > EXCUSE_REASON_MAX) return { reason, error: "reason-too-long" };
  if (reason.includes(EXCUSE_SEP) || reason.startsWith("/") || reason.endsWith("/")) return { reason, error: "reason-bad-char" };
  return { reason, error: null };
}
// 자격 회차 줄의 메모 고치기(evRowSave) — 표기는 서버가 지킨다(설계 §2).
//   · 보낸 메모가 지금 표기 그대로 시작하면 그 표기를 떼고 나머지만 받는다(옛 화면 · 배포 사이 열려 있던 탭)
//   · 그 밖에 (NFC 로 맞춰) 「자격 인정:」으로 시작하면 excuse-via-memo — 인정은 evExcuseAdd·evExcuseSet 으로만
//   · 돌려주는 note 는 지금 표기 + 나머지(길이 검사는 부르는 쪽이 checkNote 로)
export function guardMemo(curNote: unknown, sent: unknown): { note: string; error: string | null } {
  const reason = excuseOf(curNote);
  let s = legacyNorm(sent);
  if (reason !== null) {
    const head = EXCUSE_HEAD + reason;
    if (s === head) s = "";
    else if (s.startsWith(head + EXCUSE_SEP)) s = s.slice(head.length + EXCUSE_SEP.length);
  }
  if (s.normalize("NFC").startsWith(EXCUSE_HEAD.trimEnd().normalize("NFC"))) return { note: "", error: "excuse-via-memo" };
  return { note: withExcuse(reason, s), error: null };
}

// ── 줄마다 · 요약 · 미신청 ──
export const rpcCapped = (n: number): boolean => n >= RPC_CAP;

// 한 계정의 도장(evtStampsFor 5210-5237 의 셈) — RPC 줄이 없으면 0주·첫 활동일 없음
export function stampOf(rule: EligRule, w: WeekRow | null | undefined): Stamp {
  const wd = w && Array.isArray(w.week_days) ? w.week_days : null;
  const weekDays = wd ? wd.map((d) => Number(d) || 0) : new Array(rule.weeks).fill(0);
  const firstDay = w && w.first_day ? String(w.first_day).slice(0, 10) : null;
  const weeksDone = Number((w && w.weeks_done) ?? 0);
  return { weekDays, firstDay, weeksDone, need: needFor(rule, firstDay) };
}
// 주마다 채웠는지만(날 수는 싣지 않는다 — 도장 확인 창)
export const weekFullOf = (rule: EligRule, weekDays: number[]): boolean[] =>
  Array.from({ length: rule.weeks }, (_, i) => (weekDays[i] ?? 0) >= rule.perWeek);

// 명단 한 줄의 자격 — 계정 없는 줄은 주를 모른다(null) · ok = 주로 채움 ∨ 인정 · byWeeks = 주로 채움만(요약이 겹쳐 세지 않게) ·
// perfect(✨ 여섯 주 모두)는 측정이 끝난 뒤만
export function eligRowOut(r: { id: number; user_id: unknown; note: unknown }, rule: EligRule, phase: string,
  by: Map<string, WeekRow>): EligOut {
  const reason = excuseOf(r.note);
  const excused = reason !== null;
  const base = { id: r.id, excused, excuseReason: reason ?? "", noteRest: stripExcuse(r.note) };
  if (!r.user_id) return { ...base, weeksDone: null, need: null, byWeeks: null, ok: excused ? true : null, perfect: null };
  const s = stampOf(rule, by.get(String(r.user_id)));
  const byWeeks = s.weeksDone >= s.need;
  return { ...base, weeksDone: s.weeksDone, need: s.need, byWeeks, ok: byWeeks || excused,
    perfect: phase === "ended" ? s.weeksDone >= rule.weeks : null };
}

// 요약 — 「주로 채움」(byWeeks 참 — 인정이 있어도 여기로) + 「인정으로」(byWeeks 가 참이 아니고 인정) = 「자격 됨」.
// 다시 센 값이 모자란 앱 줄 = 앱에서 낸 줄인데 byWeeks 거짓이고 인정 없음(신청 때는 서버가 확인했다 — 설계 4절 ⚠️).
export function eligCounts(list: { source: string; out: EligOut }[], phase: string) {
  let byWeeks = 0, byExcuse = 0, noAccount = 0, recheckShort = 0, perfect = 0;
  for (const { source, out } of list) {
    if (out.byWeeks === true) byWeeks++;
    else if (out.excused) byExcuse++;
    if (out.weeksDone === null) noAccount++;
    if (source === "app" && out.byWeeks === false && !out.excused) recheckShort++;
    if (out.perfect === true) perfect++;
  }
  return { total: list.length, ok: byWeeks + byExcuse, byWeeks, byExcuse, noAccount, recheckShort,
    perfect: phase === "ended" ? perfect : null };
}

// 자격은 되는데 아직 신청 안 하신 계정 — 신청 줄의 계정을 빼고 weeks_done ≥ needFor(first_day)(성경암송 eventRoster 5558-5563)
export function missingPick(weeks: WeekRow[], signed: Iterable<string>, rule: EligRule): string[] {
  const s = new Set([...signed].map(String));
  const out = new Set<string>();
  for (const w of weeks) {
    const uid = String(w.user_id);
    if (s.has(uid)) continue;
    const st = stampOf(rule, w);
    if (st.weeksDone >= st.need) out.add(uid);
  }
  return [...out];
}
// users 한 줄 → 미신청 한 줄(교구: gu·mok / 교회학교: bu·grade — 성경암송 5571-5576 그대로 · users.type 이 곧 who_type)
export function missingOut(u: { type?: unknown; gu?: unknown; mok?: unknown; bu?: unknown; grade?: unknown; name?: unknown }) {
  const gu = legacyNorm(u.type) === "교구";
  return { name: legacyNorm(u.name), who_type: legacyNorm(u.type), group: legacyNorm(gu ? u.gu : u.bu), sub: legacyNorm(gu ? u.mok : u.grade) };
}
// 회차가 직분을 받는가(needs.position === true) — 아니면 담당자 줄에도 직분을 넣지 않는다(공개 명단에 새지 않게)
export const asksPosition = (needs: unknown): boolean =>
  !!needs && typeof needs === "object" && (needs as any).position === true;
// 인정 셋의 운영 게이트 — 개발(DEV_REF)은 늘 열리고, 그 밖(운영·모르는 주소)은 liveProd 가 참일 때만 열린다.
// ⚠️ 닫히는 쪽으로 틀린다 — 「운영 주소면 닫는다」로 쓰면 SUPABASE_URL 이 예상과 다른 꼴일 때 1단계부터 운영에서 열린다.
export const excuseGateOpen = (supabaseUrl: unknown, liveProd: boolean): boolean =>
  liveProd || String(supabaseUrl ?? "").includes(DEV_REF);
```

- [ ] **Step 6: 돌려서 통과를 본다**

```bash
cd /c/Projects/church-admin/.worktrees/autumn-excuse
node --experimental-strip-types --test tests/events-elig.test.mjs
```
Expected: `# tests 11` · `# pass 11` · `# fail 0`. 「원문과 다름」이 뜨면 사본(`evt-legacy.ts`)이 아니라 `events-elig.ts` 를 원문에 맞춘다.

- [ ] **Step 7: preflight · 커밋**

```bash
cd /c/Projects/church-admin/.worktrees/autumn-excuse
python tools/preflight.py | tail -1
git add supabase/functions/church-admin/events-elig.ts tests/events-elig.test.mjs tests/fixtures/excuse-marker.json tests/fixtures/evt-legacy.ts
git commit -F - <<'EOF'
feat(성경필사): 가을 말씀 동행 자격 셈·인정 표기 순수 모듈(events-elig.ts) — 성경암송 evtRule·evtNeedFor·evtCanReach 사본과 맞대는 시험 · 표기 보기 파일

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
git show --stat HEAD
```
Expected: `모두 통과` · 파일 넷만.

---

### Task 3: 서버 읽기 둘(`evEligRows`·`evEligMissing`) · `evRowSave` 표기 지킴 · 개발 시험

이 과제가 끝나면 `bibleevent` 담당자가 자격 회차의 줄별 주 수·자격·인정과 「아직 신청 안 하신 분」을 **읽을** 수 있고(화면은 Task 6), 자격 회차 줄의 메모로는 인정 표기를 만들거나 지울 수 없다. 표기를 읽는 쪽과 지키는 쪽이 **같은 배포**로 나간다(계획이 고른 해석 ②).

**Files:**
- Modify: `supabase/functions/church-admin/authz.ts` — 앵커 `  evPerson: "bibleevent",` 바로 뒤에 두 줄(과 설명)
- Modify: `tests/authz.test.mjs` — bibleevent 블록의 기대 목록 두 줄(앵커로 바꾸기)
- Modify: `supabase/functions/church-admin/index.ts` — 새 import 문 하나(앵커 `const cors = {` 바로 앞) · 새 절(앵커 `Deno.serve(async (req) => {` 바로 앞) · `evRowSave` 의 `const note = …` 한 줄 · switch case 둘(앵커 `      case "evPerson":       return json(await evPerson(ctx, b));` 바로 뒤)
- Modify: `tests/server.dev.test.mjs` — `PROBE`(앵커 `  evPerson: { name: "" },` 바로 뒤) · `after()`(앵커 `  if (errs.length) throw new Error("정리 실패 "` 바로 앞) · 파일 끝에 가을 인정 시험 자료와 시험 다섯

**Interfaces:**
- Consumes:
  - Task 2 `events-elig.ts`: `asksPosition` · `eligCounts` · `eligPhase` · `eligRowOut` · `eligRule` · `guardMemo` · `missingOut` · `missingPick` · `missingWindow` · `rpcCapped` · `ruleOut` · `type EligRule` · `type WeekRow`
  - 기존 `index.ts`: `db` · `json` · `audit(ctx, action, target, detail)` · `allRows(build)` · `evRead(id)`(EV_COLS — `needs` 포함 · 모양이 틀린 id 는 `null`) · `isEligEvent(needs)` · `kstToday()` · `legacyNorm` · `evRowSave` 안의 `cur`·`ev`·`p`·`hasNote` · `type Ctx`
  - 기존 `server.dev.test.mjs`: `STAMP` · `UUID_RE` · `RX_SECRET` · `CHURCH_COLS`(누출 시험의 표지 — 새로 짓지 않는다) · `rest(path, method, data)` · `call(token, action, extra)` · `people.bibleevent`·`people.super` · `EV_ID`(보통 회차 · 2000-01) · `after()` 의 `step(label, fn)` · 「성경필사 시험 회차」 단계(이번 실행의 `ca-test-*STAMP*` 회차를 지운다 — 줄은 CASCADE)
- Produces:
  - `authz.ts` `ACTION_ROLES`: `evEligRows`·`evEligMissing` → `"bibleevent"`
  - `index.ts` 도움 함수(Task 4 가 그대로 쓴다): `eligWeeks(rule: EligRule, users: string[] | null): Promise<WeekRow[] | null>`(1,000행이면 `null`) · `eligEvent(eventId): Promise<{ev, rule: EligRule|null} | {error}>`
  - 액션: `evEligRows {event_id}` → `{ok, state:"no-rule", asksPosition}` · `{ok, state:"before", rule, asksPosition}` · `{ok, state:"measuring"|"ended", rule:{start,end,weeks,perWeek,need,minNeed}, asksPosition, computedAt, counts:{total,ok,byWeeks,byExcuse,noAccount,recheckShort,perfect}, rows: EligOut[]}` · 오류 `not-found`·`not-eligibility-event`·`count-capped`
  - `evEligMissing {event_id}` → `{ok, state:"no-rule"}` · `{ok, state:"not-open", opensOn}` · `{ok, state:"open", computedAt, total, rows:[{name, who_type, group, sub}]}` · `{ok, state:"closed", computedAt, total}` · 오류 같음 — open·closed 일 때 기록 `event.missing` `{event_id, state, total}`
  - `evRowSave`: 자격 회차 줄이면 `note = guardMemo(cur.note, patch.note).note` · 오류 `excuse-via-memo`
  - `server.dev.test.mjs`(Task 4 가 쓴다): `AE_TODAY` · `aeDay(base, n)` · `AE = {open, pos, future, over, bad, u:{…}, row:{…}}` · `aeName(tag)` · `AE_START` · `AE_ANSWER` · `AE_REASON` · `AE_SECRET` · `aeFixtures()` · `aeRow(id)` · `AE_ROW_KEYS` · `aeClean(label, body)` · `after()` 단계 「가을 인정 시험 계정」

시험 자료(`aeFixtures()` 가 한 번 만든다 — 날은 모두 「오늘」(한국 날짜)에서 센다):

| 회차 | 날짜 | needs |
|---|---|---|
| `AE.open` `ca-test-aeo-<STAMP>` | 측정 시작 `AE_START`=오늘−35 · 6주 · 신청 오늘−7 ~ 오늘+14 · `list_until` 없음 | eligibility 만(직분 안 받음) |
| `AE.pos` `ca-test-aep-<STAMP>` | 같음 | eligibility + `position: true` |
| `AE.future` `ca-test-aef-<STAMP>` | 측정 오늘+10 · 신청 오늘+30 ~ +60 | eligibility |
| `AE.over` `ca-test-aex-<STAMP>` | 측정 2000-02-06 · 4주 · 신청 2000-02-20 ~ 03-04 · `list_until` 2000-03-10 | eligibility(4주) |
| `AE.bad` `ca-test-aeb-<STAMP>` | 신청 오늘−7 ~ +14 | eligibility `start: "2026-13-40"`(규칙을 못 읽음) |

| 계정(`aeName(tag)` · 교구 사랑 1 — 따로 적은 것만 다르다) | 활동(주마다 첫 사흘) | 줄 |
|---|---|---|
| `full` | `AE_START` 기준 0·1·2주 → 3/3 | `AE.open` 앱 줄 · answers `{q: AE_ANSWER}` |
| `two` | 0·1주 → 2/3 | `AE.open` 앱 줄(다시 센 값이 모자람) |
| `one` | 0주 → 1/3 · 닿을 수 없음 | 없음 |
| `late` | 3·4주(첫 활동 4째 주 → 필요 2) → 2/2 | 없음(미신청 목록에 나온다) |
| `lshort` | 4주(필요 2) → 1/2 · 닿을 수 있음 | 없음 |
| `none` | 없음 | 없음 |
| `exapp` | 1주(필요 2) → 1/2 | `AE.open` 앱 줄 · note `자격 인정: 앱 줄 사유` |
| `twin`(은혜 2 · 은혜 2목장 — 계정 둘) | 없음 | 없음 |
| `old`(소망 3) | 2000-02-06 기준 0~3주 → 4/2 · ✨ | `AE.over` 앱 줄 |
| `old2`(소망 4) | 2000-02-06 기준 0~2주 | 없음(마감 뒤 수에 든다) |
| (계정 없음) `paper` | — | `AE.open` 담당자 줄 · note `자격 인정: 종이로 암송 / 담당자가 더함` · `AE.over` 담당자 줄 note `자격 인정: 지난 사유` |

- [ ] **Step 1: 선행 확인 — Task 2 의 이름 · 앵커 · 이 과제의 이름이 아직 없는가**

```bash
cd /c/Projects/church-admin/.worktrees/autumn-excuse
node --experimental-strip-types --input-type=module -e "
const m = await import('./supabase/functions/church-admin/events-elig.ts');
for (const k of ['asksPosition','eligCounts','eligPhase','eligRowOut','eligRule','guardMemo','missingOut','missingPick','missingWindow','rpcCapped','ruleOut'])
  if (typeof m[k] !== 'function') throw new Error('events-elig.ts 에 ' + k + ' 가 없다');
console.log('Task 2 이름 모두 있음');"
S=supabase/functions/church-admin; T=tests
c() { printf '%s  %s  <- %s\n' "$(grep -cF -- "$2" "$1")" "$2" "$1"; }
c $S/index.ts 'const cors = {'
c $S/index.ts 'Deno.serve(async (req) => {'
c $S/index.ts '      case "evPerson":       return json(await evPerson(ctx, b));'
c $S/index.ts '  const note = hasNote ? legacyNorm(p.note) : (cur.note ?? "");     // 메모는 한 줄로(성경암송 eventSetNote 와 같다)'
c $S/authz.ts '  evPerson: "bibleevent",'
c $T/authz.test.mjs '  assert.deepEqual(acts.sort(), ["evEventCreate", "evEventSave", "evEvents", "evHistory", "evPeopleLookup", "evPerson", "evRoster",'
c $T/authz.test.mjs '    "evRowAdd", "evRowDelete", "evRowSave", "evStats", "evUploadCheck", "evUploadSave"]);'
c $T/server.dev.test.mjs '  evPerson: { name: "" },'
c $T/server.dev.test.mjs '  if (errs.length) throw new Error("정리 실패 "'
grep -cE 'events-elig|evElig|eligWeeks|eligEvent|guardMemo|aeFixtures' $S/index.ts $S/authz.ts $T/authz.test.mjs $T/server.dev.test.mjs
```
Expected: `Task 2 이름 모두 있음` · 앵커 아홉 줄 모두 `1` · 마지막 네 파일 모두 `:0`. 하나라도 어긋나면 멈추고 그 자리를 눈으로 본다.

- [ ] **Step 2: 실패하는 권한 시험 — `tests/authz.test.mjs`**

Edit — old(두 줄):
```js
  assert.deepEqual(acts.sort(), ["evEventCreate", "evEventSave", "evEvents", "evHistory", "evPeopleLookup", "evPerson", "evRoster",
    "evRowAdd", "evRowDelete", "evRowSave", "evStats", "evUploadCheck", "evUploadSave"]);
```
new:
```js
  assert.deepEqual(acts.sort(), ["evEligMissing", "evEligRows", "evEventCreate", "evEventSave", "evEvents", "evHistory", "evPeopleLookup",
    "evPerson", "evRoster", "evRowAdd", "evRowDelete", "evRowSave", "evStats", "evUploadCheck", "evUploadSave"]);
```
```bash
cd /c/Projects/church-admin/.worktrees/autumn-excuse
node --experimental-strip-types --test tests/authz.test.mjs
```
Expected: FAIL — bibleevent 블록 한 건(`Expected values to be strictly deep-equal` · `evEligMissing`·`evEligRows` 없음) · `# fail 1`.

- [ ] **Step 3: `authz.ts` — 두 줄**

앵커 `  evPerson: "bibleevent",` **바로 뒤에**(그 뒤에 사역 시험 참여자 같은 다른 세션의 줄이 있어도 그 줄들 **앞**에 끼운다 — `};` 바로 앞을 찾지 않는다):
```ts
  // 가을 말씀 동행 자격(가을 인정 계획 Task 3 · 설계 v2 2026-09-30-church-admin-autumn-excuse-design.md §3) — 읽기 둘.
  // 줄별 주 수·자격·인정(evEligRows · 기록 없음) · 자격은 되셨는데 신청 안 하신 분(evEligMissing · 신청 창 동안만 이름 · event.missing 수만).
  // ⚠️ 신청하지 않은 분의 암송 활동을 보인다 — 이 역할은 운영진(신앙운동팀)에게만(친구 결정 · 성경암송 privacy/ 4번).
  evEligRows: "bibleevent",
  evEligMissing: "bibleevent",
```
```bash
cd /c/Projects/church-admin/.worktrees/autumn-excuse
node --experimental-strip-types --test tests/authz.test.mjs tests/registry.test.mjs
```
Expected: `# fail 0`. (아직 커밋하지 않는다 — switch case 와 함께 Step 10 에서. 이 두 줄만 배포되면 400 `unknown-action`.)

- [ ] **Step 4: 개발 시험 — `tests/server.dev.test.mjs` 세 곳**

① PROBE — 앵커 `  evPerson: { name: "" },` **바로 뒤에**:
```js
  // 가을 말씀 동행 자격(가을 인정 계획 Task 3) — 없는 회차 → not-found(RPC·기록 없음)
  evEligRows: { event_id: "ca-test-probe-none" },
  evEligMissing: { event_id: "ca-test-probe-none" },
```

② after() — 앵커 `  if (errs.length) throw new Error("정리 실패 "` 로 시작하는 줄 **바로 앞에**:
```js
  // 가을 인정(Task 3·4) — 시험 계정(ca-test-ae…-STAMP). challenge_log·event_signups 는 CASCADE 로 지워지고
  //   daily_activity 는 challenge_log 트리거가 줄인다(직접 지우지 않는다). 시험 회차는 「성경필사 시험 회차」 단계가 이미 지웠다.
  await step("가을 인정 시험 계정", async () => {
    await rest(`users?name=like.ca-test-ae*-${STAMP}`, "DELETE");
    assert.equal((await rest(`users?select=id&name=like.ca-test-ae*-${STAMP}`, "GET")).length, 0, "가을 인정 시험 계정이 남았다");
  });
```

③ 파일 **맨 끝에**:
```js

// ---------- 성경필사(암송) — 가을 말씀 동행 자격: 주 수·미신청 목록·메모의 인정 표기 (가을 인정 계획 Task 3) ----------
// 날은 모두 「오늘」(한국 날짜)에서 센다 — 인정 창이 열린 회차가 늘 오늘을 품게. 계정의 날은 challenge_log 를 과거 시각으로 넣어
// 트리거가 daily_activity 를 채우게 한다(성경암송 supabase/dev_seed_stamp.sql 과 같은 방법 — daily_activity 에 직접 넣지 않는다).
// 지우기: after() 「가을 인정 시험 계정」 — 계정을 지우면 challenge_log·event_signups 가 CASCADE, daily_activity 는 트리거가 되돌린다.
const AE_TODAY = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const aeDay = (base, n) => new Date(Date.parse(base + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const AE_START = aeDay(AE_TODAY, -35);   // 여섯 주 가운데 다섯 주가 지났고 여섯째 주(오늘)가 진행 중
const AE = { open: "ca-test-aeo-" + STAMP, pos: "ca-test-aep-" + STAMP, future: "ca-test-aef-" + STAMP,
  over: "ca-test-aex-" + STAMP, bad: "ca-test-aeb-" + STAMP, u: {}, row: {} };
const aeName = (tag) => `ca-test-ae${tag}-${STAMP}`;
const AE_ANSWER = "ca-test-aeanswer-" + STAMP;             // 앱 줄 answers 에만 있는 값 — 응답에 보이면 샌 것이다
const AE_REASON = "ca-test-사유 10/18 입원 " + STAMP;       // 붙여 쓴 빗금은 된다 · 기록(admin_audit)에 이 글이 실리면 안 된다
const AE_ROW_KEYS = ["byWeeks", "excuseReason", "excused", "id", "need", "noteRest", "ok", "perfect", "weeksDone"];
// 감출 칸 — 이 파일의 누출 시험과 한 벌(RX_SECRET: user_id·auth_user_id·ident_key·answers·phone·memo·person_id + 교인명부 칸 CHURCH_COLS).
// UUID 꼴 값은 파일 머리의 UUID_RE 하나로 본다(「누출 시험이 모두 이것 하나를 쓴다」 — 따로 짓지 않는다).
const AE_SECRET = [...RX_SECRET, ...CHURCH_COLS];
let aeReady = null;

function aeFixtures() {
  aeReady ??= (async () => {
    // 지난번이 도중에 멈춰 남긴 시험 계정 — **한 시간 넘은 것만**(다른 세션이 개발에서 같은 시험을 돌리는 중이면 건드리지 않게)
    const stale = new Date(Date.now() - 3600 * 1000).toISOString();
    await rest(`users?name=like.ca-test-ae*&created_at=lt.${stale}`, "DELETE");
    const [verse] = await rest("verses?select=no&order=no&limit=1", "GET");
    assert.ok(verse, "개발 verses 가 비었다 — 성경암송 supabase/seed_verses.sql 을 개발에 먼저(가을 인정 계획 Task 1 Step 4)");
    const elig = (start, weeks = 6) => ({ start, weeks, perWeek: 3, need: 3, minNeed: 2 });
    const ev = (id, title, o) => ({ id, title: "ca-test " + title + " " + STAMP, short_title: "", subtitle: "", season: "",
      kind: "signup", status: "draft", ...o });
    // ⚠️ PostgREST 배치 insert 는 객체들의 칸이 모두 같아야 한다(PGRST102) — 다섯 모두 같은 칸
    await rest("events", "POST", [
      ev(AE.open, "가을 인정", { opens_on: aeDay(AE_TODAY, -7), closes_on: aeDay(AE_TODAY, 14), list_until: null,
        needs: { eligibility: elig(AE_START) } }),
      ev(AE.pos, "가을 인정 직분", { opens_on: aeDay(AE_TODAY, -7), closes_on: aeDay(AE_TODAY, 14), list_until: null,
        needs: { position: true, eligibility: elig(AE_START) } }),
      ev(AE.future, "가을 인정 미래", { opens_on: aeDay(AE_TODAY, 30), closes_on: aeDay(AE_TODAY, 60), list_until: null,
        needs: { eligibility: elig(aeDay(AE_TODAY, 10)) } }),
      ev(AE.over, "가을 인정 지난", { opens_on: "2000-02-20", closes_on: "2000-03-04", list_until: "2000-03-10",
        needs: { eligibility: elig("2000-02-06", 4) } }),
      ev(AE.bad, "가을 인정 규칙 틀림", { opens_on: aeDay(AE_TODAY, -7), closes_on: aeDay(AE_TODAY, 14), list_until: null,
        needs: { eligibility: { start: "2026-13-40", weeks: 6, perWeek: 3, need: 3 } } }),
    ]);
    const user = async (tag, gu = "사랑", mok = "1") => {
      const name = aeName(tag);
      const [u] = await rest("users", "POST", { type: "교구", gu, mok, name, identity_key: `교구|${gu}|${mok}|||${name}` });
      return u.id;
    };
    for (const tag of ["full", "two", "one", "late", "lshort", "none", "exapp"]) AE.u[tag] = await user(tag);
    AE.u.old = await user("old", "소망", "3");
    AE.u.old2 = await user("old2", "소망", "4");
    AE.u.twinA = await user("twin", "은혜", "2");       // 같은 분 계정이 둘(「2」·「2목장」) → ambiguous-account · account many
    AE.u.twinB = await user("twin", "은혜", "2목장");
    // 활동 — 주 w 의 첫 사흘(시작일에서 7일 단위) · 낮 12시(한국) — 트리거가 한국 날짜로 daily_activity 를 채운다
    const plan = [["full", AE_START, [0, 1, 2]], ["two", AE_START, [0, 1]], ["one", AE_START, [0]], ["late", AE_START, [3, 4]],
      ["lshort", AE_START, [4]], ["exapp", AE_START, [1]], ["old", "2000-02-06", [0, 1, 2, 3]], ["old2", "2000-02-06", [0, 1, 2]]];
    const logs = [];
    for (const [tag, start, weeks] of plan) for (const w of weeks) for (const d of [0, 1, 2])
      logs.push({ user_id: AE.u[tag], verse_no: verse.no, mode: "typing", created_at: aeDay(start, w * 7 + d) + "T12:00:00+09:00" });
    await rest("challenge_log", "POST", logs);
    const put = async (x) => (await rest("event_signups", "POST", x))[0];
    const sig = (event_id, tag, extra = {}) => ({ event_id, user_id: null, source: "import", who_type: "교구", group_name: "사랑",
      sub_name: "1", name: aeName(tag), ident_key: `교구|사랑|1|||${aeName(tag)}`, position: "", phone: "", memo: "",
      answers: {}, note: "", ...extra });
    AE.row.full = await put(sig(AE.open, "full", { user_id: AE.u.full, source: "app", answers: { q: AE_ANSWER } }));
    AE.row.two = await put(sig(AE.open, "two", { user_id: AE.u.two, source: "app" }));
    AE.row.exapp = await put(sig(AE.open, "exapp", { user_id: AE.u.exapp, source: "app", note: "자격 인정: 앱 줄 사유" }));
    AE.row.paper = await put(sig(AE.open, "paper", { note: "자격 인정: 종이로 암송 / 담당자가 더함" }));
    AE.row.oldApp = await put(sig(AE.over, "old", { user_id: AE.u.old, source: "app", group_name: "소망", sub_name: "3",
      ident_key: `교구|소망|3|||${aeName("old")}` }));
    AE.row.overEx = await put(sig(AE.over, "paper", { note: "자격 인정: 지난 사유" }));
  })();
  return aeReady;
}
const aeRow = async (id) => (await rest(
  `event_signups?select=id,user_id,ident_key,name,position,note,source,updated_at&id=eq.${id}`, "GET"))[0];
const aeKeys = (v, out = []) => {
  if (Array.isArray(v)) v.forEach((x) => aeKeys(x, out));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { out.push(k); aeKeys(x, out); }
  return out;
};
// 응답 어디에도 UUID 꼴 값(계정 id)·앱 줄 answers 값·신원 키 꼴(「교구|사랑|1|||이름」)·감출 칸 이름(교인명부 칸 포함)이 없다
function aeClean(label, body) {
  const s = JSON.stringify(body);
  assert.ok(!UUID_RE.test(s), label + " 응답에 UUID 꼴 값: " + (s.match(UUID_RE) || [""])[0]);
  assert.ok(!s.includes(AE_ANSWER), label + " 응답에 앱 줄 answers 값이 실렸다");
  assert.ok(!s.includes("|||"), label + " 응답에 신원 키 꼴 값이 실렸다");
  const bad = aeKeys(body).filter((k) => AE_SECRET.includes(k));
  assert.deepEqual(bad, [], label + " 응답에 감출 칸: " + bad.join(","));
}

test("가을 인정 evEligRows: 줄마다 주 수·필요 주·자격·인정(메모 표기에서)·표기 뺀 메모 · 요약은 겹쳐 세지 않는다 · 측정 중엔 ✨ 없음", async () => {
  await aeFixtures();
  const t = people.bibleevent.token;
  const r = await call(t, "evEligRows", { event_id: AE.open });
  assert.equal(r.body.ok, true, JSON.stringify(r.body));
  aeClean("evEligRows", r.body);
  assert.deepEqual(Object.keys(r.body).sort(), ["asksPosition", "computedAt", "counts", "ok", "rows", "rule", "state"]);
  assert.equal(r.body.state, "measuring");
  assert.equal(r.body.asksPosition, false);
  assert.deepEqual(r.body.rule, { start: AE_START, end: aeDay(AE_START, 41), weeks: 6, perWeek: 3, need: 3, minNeed: 2 });
  assert.ok(Math.abs(Date.parse(r.body.computedAt) - Date.now()) < 5 * 60 * 1000, "센 시각이 지금이어야 한다");
  for (const x of r.body.rows) assert.deepEqual(Object.keys(x).sort(), AE_ROW_KEYS);
  const by = (id) => r.body.rows.find((x) => x.id === id);
  const pick = (x) => [x.weeksDone, x.need, x.byWeeks, x.ok, x.excused, x.excuseReason, x.noteRest, x.perfect];
  assert.deepEqual(pick(by(AE.row.full.id)), [3, 3, true, true, false, "", "", null]);
  assert.deepEqual(pick(by(AE.row.two.id)), [2, 3, false, false, false, "", "", null]);
  assert.deepEqual(pick(by(AE.row.exapp.id)), [1, 2, false, true, true, "앱 줄 사유", "", null]);
  assert.deepEqual(pick(by(AE.row.paper.id)), [null, null, null, true, true, "종이로 암송", "담당자가 더함", null]);
  assert.deepEqual(r.body.counts, { total: 4, ok: 3, byWeeks: 1, byExcuse: 2, noAccount: 1, recheckShort: 1, perfect: null });
  assert.equal(r.body.counts.byWeeks + r.body.counts.byExcuse, r.body.counts.ok);
});

test("가을 인정 evEligRows: 시작 전(before) · 규칙을 못 읽음(no-rule — 0명이 아니다) · 줄 없음 · 끝난 뒤(✨) · 자격 회차 아님 · 없는 회차", async () => {
  await aeFixtures();
  const t = people.bibleevent.token;
  const f = await call(t, "evEligRows", { event_id: AE.future });
  assert.deepEqual(Object.keys(f.body).sort(), ["asksPosition", "ok", "rule", "state"]);
  assert.deepEqual([f.body.state, f.body.rule.start], ["before", aeDay(AE_TODAY, 10)]);
  assert.deepEqual((await call(t, "evEligRows", { event_id: AE.bad })).body, { ok: true, state: "no-rule", asksPosition: false });
  const p = await call(t, "evEligRows", { event_id: AE.pos });
  assert.equal(p.body.asksPosition, true);
  assert.deepEqual(p.body.rows, []);
  assert.deepEqual(p.body.counts, { total: 0, ok: 0, byWeeks: 0, byExcuse: 0, noAccount: 0, recheckShort: 0, perfect: null });
  const o = await call(t, "evEligRows", { event_id: AE.over });
  assert.equal(o.body.state, "ended", JSON.stringify(o.body));
  const old = o.body.rows.find((x) => x.id === AE.row.oldApp.id);
  assert.deepEqual([old.weeksDone, old.need, old.byWeeks, old.perfect], [4, 2, true, true]);   // 첫 활동이 시작일 → 필요 2(원문 그대로)
  const ox = o.body.rows.find((x) => x.id === AE.row.overEx.id);
  assert.deepEqual([ox.weeksDone, ox.perfect, ox.excused, ox.ok], [null, null, true, true]);
  assert.equal(o.body.counts.perfect, 1);
  assert.equal((await call(t, "evEligRows", { event_id: EV_ID })).body.error, "not-eligibility-event");
  for (const bad of [{ event_id: "ca-test-none-" + STAMP }, { event_id: "BAD ID" }, {}])
    assert.equal((await call(t, "evEligRows", bad)).body.error, "not-found", JSON.stringify(bad));
});

test("가을 인정 evEligMissing: 신청 창 동안 이름·소속(신청한 계정은 빼고 · 늦게 오신 분은 두 주) · 창 전 not-open · 마감 뒤 수만 · event.missing 은 수만", async () => {
  await aeFixtures();
  const t = people.bibleevent.token;
  const m = await call(t, "evEligMissing", { event_id: AE.open });
  assert.equal(m.body.ok, true, JSON.stringify(m.body).slice(0, 300));
  aeClean("evEligMissing", m.body);
  assert.deepEqual(Object.keys(m.body).sort(), ["computedAt", "ok", "rows", "state", "total"]);
  assert.equal(m.body.state, "open");
  assert.equal(m.body.total, m.body.rows.length);
  for (const x of m.body.rows) assert.deepEqual(Object.keys(x).sort(), ["group", "name", "sub", "who_type"]);
  const names = new Set(m.body.rows.map((x) => x.name));
  assert.deepEqual(m.body.rows.find((x) => x.name === aeName("late")), { name: aeName("late"), who_type: "교구", group: "사랑", sub: "1" });
  for (const tag of ["full", "two", "one", "lshort", "none", "exapp"]) assert.ok(!names.has(aeName(tag)), tag + " 은 목록에 없어야 한다");
  assert.deepEqual((await call(t, "evEligMissing", { event_id: AE.future })).body, { ok: true, state: "not-open", opensOn: aeDay(AE_TODAY, 30) });
  const cl = await call(t, "evEligMissing", { event_id: AE.over });
  assert.deepEqual(Object.keys(cl.body).sort(), ["computedAt", "ok", "state", "total"]);
  assert.equal(cl.body.state, "closed");
  assert.ok(cl.body.total >= 1, "old2(신청 안 함 · 자격 됨)가 수에 들어가야 한다");
  assert.deepEqual((await call(t, "evEligMissing", { event_id: AE.bad })).body, { ok: true, state: "no-rule" });
  assert.equal((await call(t, "evEligMissing", { event_id: EV_ID })).body.error, "not-eligibility-event");
  const logs = (await call(people.super.token, "auditList", { limit: 200 })).body.rows
    .filter((x) => x.action === "event.missing" && [AE.open, AE.over, AE.future].includes(x.target));
  assert.deepEqual(logs.map((x) => x.detail.state).sort(), ["closed", "open"], "창 전(not-open)은 남기지 않는다");
  for (const x of logs) {
    assert.deepEqual(Object.keys(x.detail).sort(), ["event_id", "state", "total"]);
    assert.ok(!JSON.stringify(x.detail).includes(aeName("late")), "기록에 이름이 실렸다");
  }
});

test("가을 인정 evEligMissing: 200명을 넘어도 자르지 않는다(users 는 200개씩 · 옛 300명 자르기 없음)", async () => {
  await aeFixtures();
  const [verse] = await rest("verses?select=no&order=no&limit=1", "GET");
  const N = 205;
  const made = await rest("users", "POST", Array.from({ length: N }, (_, i) => {
    const name = aeName("m" + i), mok = String((i % 30) + 1);
    return { type: "교구", gu: "기쁨", mok, name, identity_key: `교구|기쁨|${mok}|||${name}` };
  }));
  assert.equal(made.length, N);
  const logs = [];
  for (const u of made) for (const w of [3, 4]) for (const d of [0, 1, 2])      // 넷째 주 첫 활동 → 필요 2 · 두 주 채움
    logs.push({ user_id: u.id, verse_no: verse.no, mode: "typing", created_at: aeDay(AE_START, w * 7 + d) + "T12:00:00+09:00" });
  for (let i = 0; i < logs.length; i += 500) await rest("challenge_log", "POST", logs.slice(i, i + 500));
  const m = await call(people.bibleevent.token, "evEligMissing", { event_id: AE.open });
  assert.equal(m.body.ok, true, JSON.stringify(m.body).slice(0, 300));
  const names = new Set(m.body.rows.map((x) => x.name));
  const lost = made.filter((u) => !names.has(u.name)).length;
  assert.equal(lost, 0, `${lost}명이 빠졌다`);
  assert.equal(m.body.total, m.body.rows.length);
});

test("가을 인정 메모 고치기(evRowSave): 자격 회차 줄의 표기는 서버가 지킨다 · 메모로 「자격 인정:」은 못 적는다(NFD 도) · 옛 화면 저장은 받는다 · 더하기·빼기는 여전히 막힘", async () => {
  await aeFixtures();
  const t = people.bibleevent.token;
  const save = (row, note) => call(t, "evRowSave", { id: row.id, expect: row.updated_at, patch: { note } });
  let paper = await aeRow(AE.row.paper.id);
  // ① 표기 뒤 메모만 바꾼다 — 창은 표기를 뺀 나머지만 보낸다
  const s1 = await save(paper, "전화로 여쭘");
  assert.equal(s1.body.ok, true, JSON.stringify(s1.body));
  assert.equal(s1.body.row.note, "자격 인정: 종이로 암송 / 전화로 여쭘");
  paper = await aeRow(AE.row.paper.id);
  assert.equal(paper.note, "자격 인정: 종이로 암송 / 전화로 여쭘");
  // ② 메모로 표기를 만들거나 바꾸지 못한다(NFD 로 흉내 내도)
  for (const fake of ["자격 인정: 가짜", "자격 인정:가짜", "자격 인정: 가짜".normalize("NFD"), "자격 인정: 입원 / 전화로 여쭘"])
    assert.equal((await save(paper, fake)).body.error, "excuse-via-memo", fake);
  assert.equal((await aeRow(AE.row.paper.id)).note, "자격 인정: 종이로 암송 / 전화로 여쭘", "거절한 뒤 그대로");
  // ③ 옛 화면 — note 를 통째로 보였다가 돌려보낸다(지금 표기 그대로 시작) → 받는다
  const s3 = await save(paper, "자격 인정: 종이로 암송 / 전화로 여쭘 / 다시 확인");
  assert.equal(s3.body.ok, true, JSON.stringify(s3.body));
  assert.equal((await aeRow(AE.row.paper.id)).note, "자격 인정: 종이로 암송 / 전화로 여쭘 / 다시 확인");
  // ④ 메모를 비워도 표기는 남는다
  paper = await aeRow(AE.row.paper.id);
  assert.equal((await save(paper, "")).body.row.note, "자격 인정: 종이로 암송");
  // ⑤ 표기가 없는 앱 줄 — 보통 메모는 되고, 표기는 못 만든다
  const two = await aeRow(AE.row.two.id);
  assert.equal((await save(two, "자격 인정: 흉내")).body.error, "excuse-via-memo");
  assert.equal((await save(two, "보통 메모")).body.row.note, "보통 메모");
  // ⑥ 메모 밖 칸·더하기·빼기는 여전히 막힌다(인정 두 액션만 예외 — Task 4)
  const p2 = await aeRow(AE.row.paper.id);
  assert.equal((await call(t, "evRowSave", { id: p2.id, expect: p2.updated_at, patch: { position: "집사" } })).body.error, "app-row-note-only");
  assert.equal((await call(t, "evRowDelete", { id: p2.id, expect: p2.updated_at })).body.error, "eligibility-event");
  assert.equal((await call(t, "evRowAdd", { event_id: AE.open,
    row: { who_type: "교구", group: "사랑", sub: "1", name: aeName("add") } })).body.error, "eligibility-event");
  // 기록 — event.edit 의 메모는 글 없이 참만(SEC-1) · 사유가 기록에 실리지 않는다
  const logs = (await call(people.super.token, "auditList", { limit: 200 })).body.rows
    .filter((x) => x.action === "event.edit" && x.target === String(AE.row.paper.id));
  assert.ok(logs.length >= 3, "메모 고침 기록 " + logs.length);
  assert.ok(!JSON.stringify(logs.map((x) => x.detail)).includes("종이로 암송"), "기록에 인정 사유가 실렸다");
});
```

```bash
cd /c/Projects/church-admin/.worktrees/autumn-excuse
node --check tests/server.dev.test.mjs && echo "server.dev 문법 통과"
```

- [ ] **Step 5: 개발 시험을 옛 함수에 대고 돌려 실패를 본다**

```bash
cd /c/Projects/church-admin/.worktrees/autumn-excuse
set -a; . ~/.church-admin/dev.env; set +a
node --experimental-strip-types --test tests/server.dev.test.mjs 2>&1 | grep -E '^not ok|^# (pass|fail)|정리 실패'
```
Expected: FAIL — 「권한 표」(`evEligRows` 가 400 `unknown-action`)와 새 시험 다섯(`가을 인정 evEligRows…` 둘 · `evEligMissing…` 둘 · `메모 고치기…`)이 `not ok` · 「PROBE 가 있다」는 통과 · `정리 실패` 줄 없음(시험 계정·회차가 지워진다).

- [ ] **Step 6: `index.ts` — 새 import 문(기존 import 줄은 그대로)**

앵커 `const cors = {`(Step 1 에서 1) 줄 **바로 앞에**(마지막 import 문 뒤 · 빈 줄 앞):
```ts
// 가을 말씀 동행 자격(가을 인정 계획 Task 3) — 이 과제의 이름은 events-elig.ts 에서만 · Task 4 는 자기 이름만 새 줄로
import { asksPosition, eligCounts, eligPhase, eligRowOut, eligRule, guardMemo, missingOut, missingPick, missingWindow, rpcCapped, ruleOut, type EligRule, type WeekRow } from "./events-elig.ts";
```
```bash
cd /c/Projects/church-admin/.worktrees/autumn-excuse
node -e '
const s=require("fs").readFileSync(process.argv[1],"utf8");
const names=[];for(const m of s.matchAll(/^import\s*\{([^}]*)\}\s*from/gm))for(const p of m[1].split(","))if(p.trim())names.push(p.trim().replace(/^type\s+/,"").split(/\s+as\s+/).pop());
const dup=[...new Set(names.filter((n,i)=>names.indexOf(n)!==i))];
console.log(dup.length?"겹친 이름: "+dup.join(", "):"import 이름 "+names.length+"개 — 겹침 없음");process.exit(dup.length?1:0);' supabase/functions/church-admin/index.ts
```
Expected: `import 이름 N개 — 겹침 없음`.

- [ ] **Step 7: `index.ts` — 도움 함수 둘 · 액션 둘**

앵커 `Deno.serve(async (req) => {` 줄 **바로 앞에**:
```ts
// ---------- 성경필사(암송) — 가을 말씀 동행 자격: 주 수·미신청 목록 (가을 인정 계획 Task 3 · 2026-10) ----------
// 설계: v2 docs/superpowers/specs/2026-09-30-church-admin-autumn-excuse-design.md §2·§3 · 셈과 표기는 events-elig.ts.
// ⚠️ 주 수는 성경암송 RPC v2_event_weeks(service_role 만 — 이 함수는 service role 로 돈다) 한 번으로. 성도님 도장판(evtStampsFor)과
//    같은 RPC·같은 needFor — 행이 없는 계정은 0주·첫 활동일 없음(= need 그대로). 계정 없는 줄은 「모른다」(null)이지 0 이 아니다.
// ⚠️ p_users 가 null 이면 **전 계정**이다 — 계정 있는 줄이 하나도 없으면 부르지 않는다(빈 배열을 null 로 바꾸지 말 것).
// ⚠️ RPC 는 집합을 돌려주는 함수라 PostgREST 1,000행에서 오류 없이 잘린다 — 1,000행이면 count-capped 로 멈춘다.
// ⚠️ user_id·ident_key·answers 는 응답에 없다 — answers 는 읽지도 않는다. 인정은 note 머리 「자격 인정: 사유」.
// ⚠️ 표기를 읽는 evEligRows 와 표기를 지키는 evRowSave(아래 guardMemo)는 **같은 배포**로 나간다(설계 §3).

// v2_event_weeks — 1,000행에 닿았으면 null(부르는 쪽이 count-capped)
async function eligWeeks(rule: EligRule, users: string[] | null): Promise<WeekRow[] | null> {
  const { data, error } = await db.rpc("v2_event_weeks", {
    p_start: rule.start, p_weeks: rule.weeks, p_per_week: rule.perWeek, p_users: users,
  });
  if (error) throw error;
  const rows = (data ?? []) as WeekRow[];
  return rpcCapped(rows.length) ? null : rows;
}

// 자격 회차의 앞 검사 — { ev, rule }(규칙을 못 읽으면 rule 이 null) 또는 { error }
async function eligEvent(eventId: unknown): Promise<any> {
  const ev = await evRead(eventId);
  if (!ev) return { error: "not-found" };
  if (!isEligEvent(ev.needs)) return { error: "not-eligibility-event" };
  return { ev, rule: eligRule(ev.needs) };
}

// 📋 자격 회차 명단의 주 수·자격·인정 — 명단(evRoster)과 따로 부른다(셈이 실패해도 명단은 보이게). 기록은 남기지 않는다.
async function evEligRows(b: any) {
  const g = await eligEvent(b.event_id);
  if (g.error) return { ok: false, error: g.error };
  const ev = g.ev, rule: EligRule | null = g.rule;
  const asks = asksPosition(ev.needs);
  if (!rule) return { ok: true, state: "no-rule", asksPosition: asks };
  const phase = eligPhase(rule, kstToday());
  if (phase === "before") return { ok: true, state: "before", rule: ruleOut(rule), asksPosition: asks };
  const rows = await allRows(() => db.from("event_signups").select("id,user_id,note,source")
    .eq("event_id", ev.id).order("id", { ascending: true }));
  const uids = [...new Set(rows.map((r) => r.user_id).filter(Boolean).map(String))];
  let by = new Map<string, WeekRow>();
  if (uids.length) {
    const weeks = await eligWeeks(rule, uids);
    if (!weeks) return { ok: false, error: "count-capped" };
    by = new Map(weeks.map((w) => [String(w.user_id), w]));
  }
  const list = rows.map((r) => ({ source: r.source === "app" ? "app" : "import", out: eligRowOut(r, rule, phase, by) }));
  return { ok: true, state: phase, rule: ruleOut(rule), asksPosition: asks, computedAt: new Date().toISOString(),
    counts: eligCounts(list, phase), rows: list.map((x) => x.out) };
}

// 👥 자격은 되셨는데 아직 신청 안 하신 분 — 신청 창(opens_on~closes_on) 동안만 이름, 마감 뒤엔 수만.
// 부를 때마다 event.missing(수만 · 이름 없음) — 신청하지 않은(동의하지 않은) 분의 이름이 담당자 화면·파일로 나가는 유일한 길이다.
async function evEligMissing(ctx: Ctx, b: any) {
  const g = await eligEvent(b.event_id);
  if (g.error) return { ok: false, error: g.error };
  const ev = g.ev, rule: EligRule | null = g.rule;
  if (!rule) return { ok: true, state: "no-rule" };
  const win = missingWindow(ev, kstToday());
  if (win === "not-open") return { ok: true, state: "not-open", opensOn: ev.opens_on };
  const [weeks, signed] = await Promise.all([
    eligWeeks(rule, null),
    allRows(() => db.from("event_signups").select("id,user_id").eq("event_id", ev.id)
      .not("user_id", "is", null).order("id", { ascending: true })),
  ]);
  if (!weeks) return { ok: false, error: "count-capped" };
  const ids = missingPick(weeks, signed.map((r) => String(r.user_id)), rule);
  const computedAt = new Date().toISOString();
  if (win === "closed") {
    await audit(ctx, "event.missing", ev.id, { event_id: ev.id, state: "closed", total: ids.length });
    return { ok: true, state: "closed", computedAt, total: ids.length };
  }
  const rows: ReturnType<typeof missingOut>[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db.from("users").select("id,type,gu,mok,bu,grade,name").in("id", ids.slice(i, i + 200));
    if (error) throw error;
    for (const u of (data ?? []) as any[]) rows.push(missingOut(u));
  }
  await audit(ctx, "event.missing", ev.id, { event_id: ev.id, state: "open", total: ids.length });
  return { ok: true, state: "open", computedAt, total: ids.length, rows };
}

```
(`rows.length` 가 `total` 보다 작을 수 있는 것은 그 사이 계정이 지워졌을 때뿐이다 — 개발 시험은 같음을 본다.)

- [ ] **Step 8: `evRowSave` — 자격 회차 줄의 표기 지킴**

앵커(Step 1 에서 1) — old(한 줄):
```ts
  const note = hasNote ? legacyNorm(p.note) : (cur.note ?? "");     // 메모는 한 줄로(성경암송 eventSetNote 와 같다)
```
new:
```ts
  let note = hasNote ? legacyNorm(p.note) : (cur.note ?? "");     // 메모는 한 줄로(성경암송 eventSetNote 와 같다)
  // 가을 말씀 동행(자격 회차) 줄 — 인정 표기 「자격 인정: 사유」는 **서버가 지킨다**(가을 인정 설계 §2). 창은 표기를 뺀 나머지만 보내고,
  //   지금 표기 그대로 시작하는 옛 화면의 저장은 받고, 그 밖에 (NFC 로 맞춰) 「자격 인정:」으로 시작하면 excuse-via-memo.
  //   인정은 evExcuseAdd·evExcuseSet 으로만 바뀐다(기록 event.excuse). 표기를 읽는 evEligRows 와 같은 배포로 나간다.
  if (hasNote && isEligEvent(ev.needs)) {
    const g = guardMemo(cur.note, p.note);
    if (g.error) return { ok: false, error: g.error };
    note = g.note;
  }
```
(바로 아래 `const nbad = hasNote ? checkNote(note) : null;` 이 표기를 붙인 뒤의 길이로 500 을 본다 — 그대로 둔다.)

- [ ] **Step 9: switch case 둘**

앵커 `      case "evPerson":       return json(await evPerson(ctx, b));` 줄 **바로 뒤에**:
```ts
      case "evEligRows":    return json(await evEligRows(b));
      case "evEligMissing": return json(await evEligMissing(ctx, b));
```

- [ ] **Step 10: 넣은 자리 확인 · preflight · 커밋**

```bash
cd /c/Projects/church-admin/.worktrees/autumn-excuse
F=supabase/functions/church-admin/index.ts
grep -cF 'from "./events-elig.ts";' $F                                          # 1
grep -cE '^async function (eligWeeks|eligEvent|evEligRows|evEligMissing)\(' $F   # 4
grep -cE 'case "(evEligRows|evEligMissing)":' $F                                 # 2
grep -cF 'const g = guardMemo(cur.note, p.note);' $F                             # 1
grep -cF 'let note = hasNote ? legacyNorm(p.note)' $F                            # 1
git diff HEAD -- $F | grep -c '^-[^-]'                                           # 1 — 바뀐 줄은 const note 한 줄뿐
python tools/preflight.py | tail -1
git add supabase/functions/church-admin/authz.ts supabase/functions/church-admin/index.ts tests/authz.test.mjs tests/server.dev.test.mjs
git commit -F - <<'EOF'
feat(성경필사): 가을 말씀 동행 자격 읽기 둘(evEligRows·evEligMissing) · 자격 회차 메모의 인정 표기를 서버가 지킨다(excuse-via-memo) · 개발 시험

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
git show --stat HEAD
git status --short
```
Expected: 주석대로의 수 · `모두 통과` · 파일 넷 · 빈 status.

- [ ] **Step 11: 개발 함수 배포(= 문법 검사) · 개발 시험**

```bash
cd /c/Projects/church-admin/.worktrees/autumn-excuse     # 워크트리 루트(supabase/functions/church-admin 이 있는 곳)
git log --oneline HEAD..main | head -5                    # 비어야 한다
supabase functions deploy church-admin --no-verify-jwt --project-ref ktpwthwqzgcqcrmsafdo
set -a; . ~/.church-admin/dev.env; set +a
node --experimental-strip-types --test tests/server.dev.test.mjs 2>&1 | grep -E '^not ok|^# (pass|fail)|정리 실패'
```
Expected: `git log` 줄 없음 · `Deployed Functions on project ktpwthwqzgcqcrmsafdo: church-admin` · `# fail 0` · `정리 실패` 없음.
- 배포가 문법 오류로 실패하면 고쳐 **새 커밋**으로 → Step 10~11 다시.
- `git log HEAD..main` 에 줄이 나오면 `git merge --no-edit main` 으로 따라잡고 Step 10 부터(충돌이 나면 멈추고 친구에게). 다른 세션이 main 판을 개발에 배포하면 이 액션들이 개발에서 사라진다 — 시험이 400 `unknown-action` 이면 먼저 다시 배포한다.
- 배포 **전에** `ListAgents` — church-admin 을 고치는 세션(be-decide·people-link 등)이 개발에서 시험 중이면 `SendMessage` 로 「가을 인정 판을 개발 church-admin 에 올립니다(그쪽 개발 판을 덮어요) — 괜찮을 때 알려 주세요」를 보내고 답을 받은 뒤에 올린다(Global Constraints 「다른 세션」).
- ⚠️ 운영(`xnomlgydifiqiybervtf`)에는 배포하지 않는다(Task 11). 푸시하지 않는다.

---

### Task 4: 서버 쓰기 셋(`evExcuseCheck`·`evExcuseAdd`·`evExcuseSet`) · 운영 게이트 · 개발 시험

이 과제가 끝나면 개발에서 담당자가 한 분의 도장을 확인하고(기록 `event.excuse-check`), 문턱 아래 분을 사유·동의와 함께 명단에 넣고(`event.excuse`), 있는 줄의 인정을 켜고·사유를 고치고·거둘 수 있다. **운영에서는 2단계 여는 날까지 `excuse-not-live` 로 닫혀 있다**(계획이 고른 해석 ①).

**Files:**
- Modify: `supabase/functions/church-admin/authz.ts` — 앵커 `  evEligMissing: "bibleevent",`(Task 3) 바로 뒤에 셋
- Modify: `tests/authz.test.mjs` — Task 3 이 고친 기대 목록 두 줄
- Modify: `supabase/functions/church-admin/index.ts` — 새 import 문 하나(앵커 `const cors = {` 바로 앞) · 새 절(앵커 `Deno.serve(async (req) => {` 바로 앞) · switch case 셋(앵커 `      case "evEligMissing": return json(await evEligMissing(ctx, b));` 바로 뒤)
- Modify: `tests/server.dev.test.mjs` — PROBE(앵커 `  evEligMissing: { event_id: "ca-test-probe-none" },` 바로 뒤) · 파일 끝에 시험 셋

**Interfaces:**
- Consumes:
  - Task 2 `events-elig.ts`: `canReach` · `checkReason` · `excuseGateOpen` · `excuseOf` · `excuseWindow` · `stampOf` · `stripExcuse` · `weekFullOf` · `withExcuse` · `type Stamp`(`asksPosition`·`eligRule`·`EligRule` 등은 Task 3 이 이미 들였다 — 다시 들이지 않는다)
  - Task 3 `index.ts`: `eligWeeks(rule, users)` · `eligEvent(eventId)`
  - 기존 `index.ts`: `evRead` · `evRowRead(id)` · `evRowChurch(r)`(쓰기 **전에** 부른다) · `rowOut(r, church)` · `EV_ROW_COLS` · `sameInEvent(eventId, row)` · `usersByKeys(keys)` · `formRow` · `checkRow` · `checkNote` · `identKey` · `tagNote` · `ADD_TAG` · `oddPosition` · `sameKeys` · `type EvRow` · `audit` · `kstToday`
  - Task 3 `server.dev.test.mjs`: `aeFixtures()` · `AE` · `aeName` · `aeRow` · `aeClean` · `AE_REASON` · `AE_TODAY` · `aeDay` · `EV_ID` · `ROW_OUT_KEYS`
- Produces:
  - 액션(모두 `bibleevent` · 운영 게이트가 닫혀 있으면 맨 앞에서 `{ok:false, error:"excuse-not-live"}`):
    - `evExcuseCheck {event_id, row:{who_type,group,sub,name,position}}` → `{ok, already:true, church}` · `{ok, account:"none"|"many", church}` · `{ok, account:"one", eligibleNow:true, church}` · `{ok, account:"one", weekFull: boolean[], weeksDone, need, canReach, church}` — 오류 `not-found`·`not-eligibility-event`·`no-rule`·`excuse-not-open`(+`opensOn`)·`excuse-period-over`·판정표 코드. 답 직전 기록 `event.excuse-check` `{event_id, name, account: "one"|"many"|"none"|null, shown: "weeks"|"already"|"eligible"|"none"}`
    - `evExcuseAdd {event_id, row, reason, consent, note}` → `{ok, row: RowOut, linked, warnings: string[]}` — 오류 차례 `not-eligibility-event`·`no-rule`·`excuse-not-open`·`excuse-period-over`·`needs-consent`·`no-reason`·`reason-too-long`·`reason-bad-char`·판정표 코드·`already`·`ambiguous-account`·`already-eligible`·`note-too-long` · 기록 `event.excuse` `{event_id, name, mode:"add", before:{excused:false}, after:{excused:true}, reason:true, linked, consent:true, row:{who_type,group,sub,position}}`
    - `evExcuseSet {id, expect, excused, reason, drop}` → 켜기·사유 `{ok, row}` · 앱 줄 끄기 `{ok, row}` · 담당자 줄 끄기(`drop:true`) `{ok, deleted:{id,name}}` — 오류 `not-found`·`conflict`·위 기간·규칙 코드·`invalid`(excused 가 참/거짓이 아님)·사유 코드·`needs-drop`·`note-too-long` · 기록 `event.excuse` `mode` = `set`·`reason`·`unset`·`drop`(drop 은 `row:{who_type,group,sub,position,hasNote,source,hasUser}`)
  - 상수 `EXCUSE_LIVE_PROD = false`(Task 11 2단계 ⓑ가 `true` 로 바꾼다 — 글자 그대로 찾는다)

- [ ] **Step 1: 선행 확인**

```bash
cd /c/Projects/church-admin/.worktrees/autumn-excuse
S=supabase/functions/church-admin; T=tests
c() { printf '%s  %s  <- %s\n' "$(grep -cF -- "$2" "$1")" "$2" "$1"; }
c $S/index.ts 'async function eligWeeks('
c $S/index.ts 'async function eligEvent('
c $S/index.ts '      case "evEligMissing": return json(await evEligMissing(ctx, b));'
c $S/index.ts 'Deno.serve(async (req) => {'
c $S/index.ts 'const cors = {'
c $S/index.ts 'async function sameInEvent('
c $S/index.ts 'async function usersByKeys('
c $S/index.ts 'async function evRowChurch('
c $S/authz.ts '  evEligMissing: "bibleevent",'
c $T/authz.test.mjs '  assert.deepEqual(acts.sort(), ["evEligMissing", "evEligRows", "evEventCreate", "evEventSave", "evEvents", "evHistory", "evPeopleLookup",'
c $T/authz.test.mjs '    "evPerson", "evRoster", "evRowAdd", "evRowDelete", "evRowSave", "evStats", "evUploadCheck", "evUploadSave"]);'
c $T/server.dev.test.mjs '  evEligMissing: { event_id: "ca-test-probe-none" },'
c $T/server.dev.test.mjs 'function aeFixtures() {'
grep -cE 'evExcuse|EXCUSE_LIVE_PROD|excuseOff|excuseEvent|oneStamp|accountsOf' $S/index.ts $S/authz.ts $T/server.dev.test.mjs
echo "pastEventCreatedAt: $(grep -c 'pastEventCreatedAt(' $S/index.ts)"
```
Expected: 앵커 열세 줄 모두 `1` · 셋째 명령 세 파일 `:0` · `pastEventCreatedAt` 가 `0` 이면 Step 7 의 evExcuseAdd 를 그대로, `2` 이상이면(be-decide M2 가 main 에 있다) Step 7 끝의 「be-decide 가 들어왔으면」 Edit 을 함께 한다(계획이 고른 해석 ⑫).

- [ ] **Step 2: 실패하는 권한 시험**

`tests/authz.test.mjs` — old(두 줄 · Task 3):
```js
  assert.deepEqual(acts.sort(), ["evEligMissing", "evEligRows", "evEventCreate", "evEventSave", "evEvents", "evHistory", "evPeopleLookup",
    "evPerson", "evRoster", "evRowAdd", "evRowDelete", "evRowSave", "evStats", "evUploadCheck", "evUploadSave"]);
```
new:
```js
  assert.deepEqual(acts.sort(), ["evEligMissing", "evEligRows", "evEventCreate", "evEventSave", "evEvents", "evExcuseAdd", "evExcuseCheck",
    "evExcuseSet", "evHistory", "evPeopleLookup", "evPerson", "evRoster", "evRowAdd", "evRowDelete", "evRowSave", "evStats",
    "evUploadCheck", "evUploadSave"]);
```
```bash
cd /c/Projects/church-admin/.worktrees/autumn-excuse
node --experimental-strip-types --test tests/authz.test.mjs
```
Expected: FAIL · `# fail 1`(bibleevent 블록).

- [ ] **Step 3: `authz.ts` — 셋**

앵커 `  evEligMissing: "bibleevent",` **바로 뒤에**:
```ts
  // 인정 셋(가을 인정 계획 Task 4 · 2단계) — 도장 확인(event.excuse-check · 늘 남긴다) · 인정하며 넣기 · 있는 줄의 인정·사유·거두기(event.excuse).
  // 운영에서는 2단계 여는 날까지 index.ts EXCUSE_LIVE_PROD 로 닫혀 있다(excuse-not-live).
  evExcuseCheck: "bibleevent",
  evExcuseAdd: "bibleevent",
  evExcuseSet: "bibleevent",
```
```bash
cd /c/Projects/church-admin/.worktrees/autumn-excuse
node --experimental-strip-types --test tests/authz.test.mjs tests/registry.test.mjs
```
Expected: `# fail 0`. (커밋은 Step 9 에서 case 와 함께.)

- [ ] **Step 4: 개발 시험 — PROBE 셋 · 시험 셋(파일 끝)**

① PROBE — 앵커 `  evEligMissing: { event_id: "ca-test-probe-none" },` **바로 뒤에**:
```js
  // 인정 셋(가을 인정 계획 Task 4) — 없는 회차·줄 0 → not-found(도장 확인 기록 없음 · 아무것도 안 쓴다)
  evExcuseCheck: { event_id: "ca-test-probe-none", row: {} },
  evExcuseAdd: { event_id: "ca-test-probe-none", row: {}, reason: "", consent: false },
  evExcuseSet: { id: 0, expect: "", excused: false },
```

② 파일 **맨 끝에**(Task 3 시험 뒤 — 파일 차례로 돈다 · T4 시험은 Task 3 의 메모 시험이 남긴 줄 상태를 전제한다):
```js

// ---------- 성경필사(암송) — 가을 말씀 동행 인정 셋: 도장 확인 · 인정하며 넣기 · 인정 켜기·고치기·거두기 (가을 인정 계획 Task 4) ----------
// 개발 DB 는 게이트가 늘 열려 있다(운영만 EXCUSE_LIVE_PROD 로 닫힌다). 시험 자료는 Task 3 의 aeFixtures().

test("가을 인정 evExcuseCheck(도장 확인): 계정 하나면 주별 채움·필요 주·닿을 수 있나 · 이미 명단/이미 자격/계정 없음·둘은 주 값 없음 · 기간 밖·규칙·회차는 거절(기록 없음) · 성공만 event.excuse-check", async () => {
  await aeFixtures();
  const t = people.bibleevent.token;
  const chk = (tag, extra = {}, ev = AE.open) => call(t, "evExcuseCheck", { event_id: ev,
    row: { who_type: "교구", group: "사랑", sub: "1", name: aeName(tag), position: "", ...extra } });
  const ls = await chk("lshort");
  assert.equal(ls.body.ok, true, JSON.stringify(ls.body));
  aeClean("evExcuseCheck", ls.body);
  assert.deepEqual(Object.keys(ls.body).sort(), ["account", "canReach", "church", "need", "ok", "weekFull", "weeksDone"]);
  assert.deepEqual([ls.body.account, ls.body.weekFull, ls.body.weeksDone, ls.body.need, ls.body.canReach],
    ["one", [false, false, false, false, true, false], 1, 2, true]);
  const one = await chk("one");
  assert.deepEqual([one.body.weekFull, one.body.weeksDone, one.body.need, one.body.canReach],
    [[true, false, false, false, false, false], 1, 3, false]);
  const none = await chk("none");
  assert.deepEqual([none.body.weekFull, none.body.weeksDone, none.body.need, none.body.canReach],
    [[false, false, false, false, false, false], 0, 3, false]);
  const late = await chk("late");
  assert.deepEqual(Object.keys(late.body).sort(), ["account", "church", "eligibleNow", "ok"]);
  assert.equal(late.body.eligibleNow, true);
  assert.deepEqual(Object.keys((await chk("full")).body).sort(), ["already", "church", "ok"]);
  const twin = await chk("twin", { group: "은혜", sub: "2" });
  assert.deepEqual([twin.body.account, "weekFull" in twin.body], ["many", false]);
  const ghost = await chk("ghost");
  assert.deepEqual([ghost.body.account, "weekFull" in ghost.body], ["none", false]);
  // 거절 — 주 값을 읽지 않고 기록도 없다
  assert.equal((await chk("lshort", {}, AE.future)).body.error, "excuse-not-open");
  assert.equal((await chk("lshort", {}, AE.over)).body.error, "excuse-period-over");
  assert.equal((await chk("lshort", {}, AE.bad)).body.error, "no-rule");
  assert.equal((await chk("lshort", {}, EV_ID)).body.error, "not-eligibility-event");
  assert.equal((await chk("lshort", { name: "" })).body.error, "no-name");
  const logs = (await call(people.super.token, "auditList", { limit: 200 })).body.rows
    .filter((x) => x.action === "event.excuse-check" && String(x.detail?.name || "").includes(String(STAMP)));
  const got = logs.map((x) => `${x.detail.name.replace("ca-test-ae", "").replace("-" + STAMP, "")}:${x.detail.account}:${x.detail.shown}`).sort();
  assert.deepEqual(got, ["full:null:already", "ghost:none:none", "late:one:eligible", "lshort:one:weeks", "none:one:weeks",
    "one:one:weeks", "twin:many:none"]);
  for (const x of logs) {
    assert.equal(x.target, AE.open);
    assert.deepEqual(Object.keys(x.detail).sort(), ["account", "event_id", "name", "shown"]);
  }
});

test("가을 인정 evExcuseAdd(인정하며 넣기): 차례대로 거절 · 넣은 줄(import · 표기 · 계정 이음 · 직분은 회차가 받을 때만) · 계정 없음 경고 · 같은 분 already · 기록에 사유 글 없음", async () => {
  await aeFixtures();
  const t = people.bibleevent.token;
  const row = (tag, o = {}) => ({ who_type: "교구", group: "사랑", sub: "1", name: aeName(tag), position: "집사", ...o });
  const add = (tag, extra = {}, ev = AE.open) => call(t, "evExcuseAdd",
    { event_id: ev, reason: AE_REASON, consent: true, note: "", row: row(tag), ...extra });
  // 거절 — 아무것도 안 들어간다
  assert.equal((await add("lshort", {}, EV_ID)).body.error, "not-eligibility-event");
  assert.equal((await add("lshort", {}, AE.bad)).body.error, "no-rule");
  assert.equal((await add("lshort", {}, AE.future)).body.error, "excuse-not-open");
  assert.equal((await add("lshort", {}, AE.over)).body.error, "excuse-period-over");
  assert.equal((await add("lshort", { consent: false })).body.error, "needs-consent");
  assert.equal((await add("lshort", { consent: "true" })).body.error, "needs-consent");
  assert.equal((await add("lshort", { reason: "   " })).body.error, "no-reason");
  assert.equal((await add("lshort", { reason: "가".repeat(201) })).body.error, "reason-too-long");
  assert.equal((await add("lshort", { reason: "입원 / 간병" })).body.error, "reason-bad-char");
  assert.equal((await add("lshort", { reason: "/입원" })).body.error, "reason-bad-char");
  assert.equal((await add("lshort", { row: row("lshort", { name: "" }) })).body.error, "no-name");
  assert.equal((await add("full")).body.error, "already");
  assert.equal((await add("twin", { row: row("twin", { group: "은혜", sub: "2" }) })).body.error, "ambiguous-account");
  assert.equal((await add("late")).body.error, "already-eligible");
  for (const tag of ["lshort", "late", "twin"])
    assert.equal((await rest(`event_signups?select=id&event_id=eq.${AE.open}&name=eq.${aeName(tag)}`, "GET")).length, 0, tag);
  // 넣기 — 계정 하나(이어짐) · 가을 회차(직분 안 받음)는 직분이 빈칸
  const a = await add("lshort");
  assert.equal(a.body.ok, true, JSON.stringify(a.body));
  aeClean("evExcuseAdd", a.body);
  assert.deepEqual(Object.keys(a.body.row).sort(), ROW_OUT_KEYS);
  assert.deepEqual([a.body.row.source, a.body.row.hasUser, a.body.row.position, a.body.row.note, a.body.linked],
    ["import", true, "", `자격 인정: ${AE_REASON} / 담당자가 더함`, true]);
  assert.deepEqual(a.body.warnings, []);
  const d = await aeRow(a.body.row.id);
  assert.deepEqual([d.user_id, d.ident_key, d.position], [AE.u.lshort, `교구|사랑|1|||${aeName("lshort")}`, ""]);
  AE.row.added = a.body.row;
  assert.equal((await add("lshort")).body.error, "already");
  // 넣은 뒤의 셈 — 주로는 모자라지만 인정으로 자격
  const er = (await call(t, "evEligRows", { event_id: AE.open })).body.rows.find((x) => x.id === a.body.row.id);
  assert.deepEqual([er.weeksDone, er.need, er.byWeeks, er.excused, er.ok, er.noteRest], [1, 2, false, true, true, "담당자가 더함"]);
  // 계정 없음(종이로 암송) · 직분을 받는 회차 · 덧붙일 메모
  const g = await add("paper2", { note: "덧붙임", row: row("paper2", { position: "권사" }) }, AE.pos);
  assert.equal(g.body.ok, true, JSON.stringify(g.body));
  assert.deepEqual([g.body.row.hasUser, g.body.row.position, g.body.row.note, g.body.linked],
    [false, "권사", `자격 인정: ${AE_REASON} / 담당자가 더함 / 덧붙임`, false]);
  assert.equal(g.body.warnings.length, 1);
  assert.match(g.body.warnings[0], /앱 계정을 못 찾았어요/);
  // 기록 — 사유 글 없이
  const logs = (await call(people.super.token, "auditList", { limit: 200 })).body.rows
    .filter((x) => x.action === "event.excuse" && [String(a.body.row.id), String(g.body.row.id)].includes(x.target));
  assert.equal(logs.length, 2);
  assert.deepEqual(logs.find((x) => x.target === String(a.body.row.id)).detail, { event_id: AE.open, name: aeName("lshort"),
    mode: "add", before: { excused: false }, after: { excused: true }, reason: true, linked: true, consent: true,
    row: { who_type: "교구", group: "사랑", sub: "1", position: "" } });
  assert.ok(!JSON.stringify(logs.map((x) => x.detail)).includes(AE_REASON), "기록에 사유 글이 실렸다");
});

test("가을 인정 evExcuseSet: 사유 고치기 · 같은 사유면 쓰지 않음 · 앱 줄 거두기(표기만) · 켜기 · 담당자 줄은 drop 이 있어야 빠진다 · 동시 수정 · 기간 밖 · 기록", async () => {
  await aeFixtures();
  const t = people.bibleevent.token;
  const set = (r, extra) => call(t, "evExcuseSet", { id: r.id, expect: r.updated_at, ...extra });
  let ex = await aeRow(AE.row.exapp.id);
  const r1 = await set(ex, { excused: true, reason: "새 사유" });
  assert.equal(r1.body.ok, true, JSON.stringify(r1.body));
  aeClean("evExcuseSet", r1.body);
  assert.equal(r1.body.row.note, "자격 인정: 새 사유");
  assert.equal((await set(ex, { excused: true, reason: "또" })).body.error, "conflict", "옛 expect");
  ex = await aeRow(AE.row.exapp.id);
  assert.equal((await set(ex, { excused: true, reason: "새 사유" })).body.row.updated_at, ex.updated_at, "같은 사유면 쓰지 않는다");
  assert.equal((await set(ex, { excused: true, reason: "a / b" })).body.error, "reason-bad-char");
  assert.equal((await set(ex, { excused: "yes" })).body.error, "invalid");
  // 앱 줄 거두기 — drop 을 보내도 표기만 떼고 줄은 남는다
  const r2 = await set(ex, { excused: false, drop: true });
  assert.equal(r2.body.ok, true, JSON.stringify(r2.body));
  assert.equal(r2.body.row.note, "");
  assert.equal((await aeRow(AE.row.exapp.id)).source, "app");
  ex = await aeRow(AE.row.exapp.id);
  // 켜기 — 주 수를 보지 않는다
  assert.equal((await set(ex, { excused: true, reason: "다시 인정" })).body.row.note, "자격 인정: 다시 인정");
  // 담당자 줄(인정으로 들어온 줄) — drop 없으면 needs-drop(그대로), 있으면 빠진다
  const paper = await aeRow(AE.row.paper.id);
  assert.equal((await set(paper, { excused: false })).body.error, "needs-drop");
  assert.ok(await aeRow(AE.row.paper.id), "needs-drop 뒤 줄은 그대로");
  const r4 = await set(paper, { excused: false, drop: true });
  assert.equal(r4.body.ok, true, JSON.stringify(r4.body));
  assert.deepEqual(r4.body.deleted, { id: paper.id, name: aeName("paper") });
  assert.equal(await aeRow(AE.row.paper.id), undefined);
  assert.equal((await set(paper, { excused: false, drop: true })).body.error, "not-found");
  // 기간 밖 · 없는 줄 · 자격 회차가 아닌 회차의 줄(보통 회차 EV_ID — 아무것도 안 쓴다)
  assert.equal((await set(await aeRow(AE.row.overEx.id), { excused: false, drop: true })).body.error, "excuse-period-over");
  assert.equal((await call(t, "evExcuseSet", { id: 0, expect: "", excused: false })).body.error, "not-found");
  const [plain] = await rest(`event_signups?select=id,updated_at,note&event_id=eq.${EV_ID}&order=id&limit=1`, "GET");
  assert.ok(plain, "보통 회차 시험 줄이 없다(before())");
  assert.equal((await set(plain, { excused: true, reason: "가짜" })).body.error, "not-eligibility-event");
  assert.equal((await aeRow(plain.id)).note, plain.note, "보통 회차 줄의 메모가 바뀌었다");
  // 기록 — 차례 · 사유 글 없음 · drop 은 줄 모양
  const logs = (await call(people.super.token, "auditList", { limit: 200 })).body.rows
    .filter((x) => x.action === "event.excuse" && [String(AE.row.exapp.id), String(AE.row.paper.id)].includes(x.target))
    .reverse();   // auditList 는 최근 먼저
  assert.deepEqual(logs.map((x) => x.detail.mode), ["reason", "unset", "set", "drop"]);
  const { row: dropRow, ...drop } = logs[3].detail;
  assert.deepEqual(drop, { event_id: AE.open, name: aeName("paper"), mode: "drop", before: { excused: true }, after: { excused: false }, reason: false });
  assert.deepEqual({ ...dropRow, hasNote: typeof dropRow.hasNote },
    { who_type: "교구", group: "사랑", sub: "1", position: "", hasNote: "boolean", source: "import", hasUser: false });
  const txt = JSON.stringify(logs.map((x) => x.detail));
  for (const s of ["새 사유", "다시 인정", "종이로 암송"]) assert.ok(!txt.includes(s), "기록에 사유 글: " + s);
});

// 누출(설계 §8 「다섯 응답 전체」) — 위 시험들이 행복한 길 하나씩만 aeClean 으로 봤다. 여기서는 다섯 액션의 **모든 응답 모양**을 한 번씩 받아
// 같은 표지(UUID_RE · RX_SECRET+CHURCH_COLS 칸 이름 · 앱 줄 answers 값 · 신원 키 꼴)로 본다. 파일 차례상 맨 끝 — 앞 시험의 줄 상태를 흔들지 않게
// 넣은 줄(「one」)은 이 안에서 인정 거두고 뺀다.
test("가을 인정 누출: 다섯 액션의 모든 응답 모양 — UUID 꼴 값·감출 칸(교인명부 칸 포함)·앱 줄 answers 값·신원 키 꼴이 없다", async () => {
  await aeFixtures();
  const t = people.bibleevent.token;
  const row = (tag, o = {}) => ({ who_type: "교구", group: "사랑", sub: "1", name: aeName(tag), position: "", ...o });
  const resps = [
    ["evEligRows 측정 중", await call(t, "evEligRows", { event_id: AE.open })],
    ["evEligRows 끝난 뒤", await call(t, "evEligRows", { event_id: AE.over })],
    ["evEligRows 시작 전", await call(t, "evEligRows", { event_id: AE.future })],
    ["evEligRows 규칙 못 읽음", await call(t, "evEligRows", { event_id: AE.bad })],
    ["evEligMissing 신청 창", await call(t, "evEligMissing", { event_id: AE.open })],
    ["evEligMissing 마감 뒤", await call(t, "evEligMissing", { event_id: AE.over })],
    ["evEligMissing 창 전", await call(t, "evEligMissing", { event_id: AE.future })],
    ["evExcuseCheck 주 값", await call(t, "evExcuseCheck", { event_id: AE.open, row: row("one") })],
    ["evExcuseCheck 이미 자격", await call(t, "evExcuseCheck", { event_id: AE.open, row: row("late") })],
    ["evExcuseCheck 이미 명단", await call(t, "evExcuseCheck", { event_id: AE.open, row: row("full") })],
    ["evExcuseCheck 계정 둘", await call(t, "evExcuseCheck", { event_id: AE.open, row: row("twin", { group: "은혜", sub: "2" }) })],
    ["evExcuseCheck 계정 없음", await call(t, "evExcuseCheck", { event_id: AE.open, row: row("ghost") })],
  ];
  const add = await call(t, "evExcuseAdd", { event_id: AE.open, row: row("one"), reason: AE_REASON, consent: true, note: "" });
  resps.push(["evExcuseAdd 계정 이음", add]);
  assert.equal(add.body.ok, true, JSON.stringify(add.body));
  const d0 = await aeRow(add.body.row.id);
  resps.push(["evExcuseSet 사유 고침", await call(t, "evExcuseSet", { id: d0.id, expect: d0.updated_at, excused: true, reason: "ca-test-바꾼 사유" })]);
  const d1 = await aeRow(add.body.row.id);
  resps.push(["evExcuseSet 거두고 뺌", await call(t, "evExcuseSet", { id: d1.id, expect: d1.updated_at, excused: false, drop: true })]);
  assert.equal(await aeRow(add.body.row.id), undefined, "거두고 뺀 줄이 남았다");
  for (const [label, r] of resps) {
    assert.equal(r.body.ok, true, label + " " + JSON.stringify(r.body).slice(0, 200));
    aeClean(label, r.body);
  }
});
```
```bash
cd /c/Projects/church-admin/.worktrees/autumn-excuse
node --check tests/server.dev.test.mjs && echo "server.dev 문법 통과"
set -a; . ~/.church-admin/dev.env; set +a
node --experimental-strip-types --test tests/server.dev.test.mjs 2>&1 | grep -E '^not ok|^# (pass|fail)|정리 실패'
```
Expected: FAIL — 「권한 표」와 새 시험 넷(`가을 인정 evExcuseCheck…`·`evExcuseAdd…`·`evExcuseSet…`·`누출…`)이 `not ok`(400 `unknown-action`) · Task 3 시험은 통과 · `정리 실패` 없음.

- [ ] **Step 5: `index.ts` — 새 import 문**

앵커 `const cors = {` 줄 **바로 앞에**(Task 3 의 events-elig import 줄 뒤가 된다):
```ts
// 가을 말씀 동행 인정 셋(가을 인정 계획 Task 4) — Task 3 이 들인 이름(asksPosition·eligRule·EligRule 등)은 다시 들이지 않는다
import { canReach, checkReason, excuseGateOpen, excuseOf, excuseWindow, stampOf, stripExcuse, weekFullOf, withExcuse, type Stamp } from "./events-elig.ts";
```
그리고 Task 3 Step 6 의 「겹친 이름」 검사를 다시 돌린다 → `겹침 없음`.

- [ ] **Step 6: `index.ts` — 게이트 · 도움 함수 셋**

앵커 `Deno.serve(async (req) => {` 줄 **바로 앞에**(Task 3 절 뒤):
```ts
// ---------- 성경필사(암송) — 가을 말씀 동행 자격 인정 셋 (가을 인정 계획 Task 4 · 2단계) ----------
// 설계 §3 「새 액션 다섯」의 쓰기 셋. 옛 eventExcuse 에서 일부러 버린 것 — 아무 회차·아무 때나·200자 조용히 자르기(설계 §3).
// ⚠️ 운영에서는 2단계 여는 날까지 닫아 둔다 — 성경암송 eventExcuse 가 얼기 **전에** 여기가 열리면 인정을 쓰는 곳이 둘이 된다
//    (answers.excused 와 note 표기에 갈라져 서로 안 보인다 · 설계 §7 「두 곳이 쓰는 창은 만들지 않는다」).
//    여는 날(계획 Task 11 2단계 ⓑ) EXCUSE_LIVE_PROD 와 화면 elig-logic.js EXCUSE_UI_PROD 를 **함께** true 로 한 커밋을 배포한다.
//    개발 DB 에서는 늘 열려 있다(개발 시험·localhost 확인).
// ⚠️ 자격 회차의 잠금(evRowAdd·evUpload*·evRowDelete 의 eligibility-event)은 그대로다 — 자격 회차에 줄이 생기고 빠지는 길은
//    성도님 앱(신청·취소)과 사유·동의·기록이 붙는 이 두 액션(evExcuseAdd · evExcuseSet 의 drop)뿐이다(가을 설계 §12).
const EXCUSE_LIVE_PROD = false;
const excuseOff = () => !excuseGateOpen(Deno.env.get("SUPABASE_URL") ?? "", EXCUSE_LIVE_PROD);
const NO_ACCOUNT_WARN = "이 이름·소속으로는 앱 계정을 못 찾았어요 — 앱을 쓰시는 분이면 앱에 적힌 소속으로 넣어야 나중에 명단에 두 번 오르지 않아요";

// 인정 셋의 앞 검사 — 회차 · 자격 회차 · 규칙 · 기간(excuseWindow — 셋이 같은 함수로 본다). { ev, rule } 또는 { error(, opensOn) }
async function excuseEvent(eventId: unknown): Promise<any> {
  const g = await eligEvent(eventId);
  if (g.error) return g;
  if (!g.rule) return { error: "no-rule" };
  const w = excuseWindow(g.ev, kstToday());
  if (w === "not-open") return { error: "excuse-not-open", opensOn: g.ev.opens_on };
  if (w === "over") return { error: "excuse-period-over" };
  return g;
}

// 이름·소속으로 찾은 앱 계정 id(겹침 없이) — 한 분 더하기(evRowAdd)와 같은 찾기(sameKeys · 별칭 포함)
async function accountsOf(row: EvRow): Promise<string[]> {
  return [...new Set([...(await usersByKeys(sameKeys(row))).values()].flat())];
}

// 한 계정의 도장 — 성도님 도장판(evtStampsFor)과 같은 RPC·같은 셈(행이 없으면 0주)
async function oneStamp(rule: EligRule, uid: string): Promise<Stamp> {
  const weeks = await eligWeeks(rule, [uid]);
  return stampOf(rule, (weeks ?? []).find((w) => String(w.user_id) === uid) ?? null);
}

```

- [ ] **Step 7: `index.ts` — 액션 셋**

다시 앵커 `Deno.serve(async (req) => {` 줄 **바로 앞에**(Step 6 뒤):
```ts
// 🔎 도장 확인 — 「인정하며 넣기」 창에서 한 분의 주별 채움. 계정 id 는 싣지 않는다(넣기는 서버가 처음부터 다시 판정한다).
// ⚠️ 이름 네 조각으로 한 분의 활동을 들여다보는 유일한 길이라 — 기간 밖이면 주 값을 읽지 않고, 이미 명단에 있거나·이미 자격이거나·
//    계정이 없거나 둘 이상이면 주 값을 싣지 않고, 답을 돌려주기 **직전에** event.excuse-check 를 **늘** 남긴다(주 값은 남기지 않는다).
async function evExcuseCheck(ctx: Ctx, b: any) {
  if (excuseOff()) return { ok: false, error: "excuse-not-live" };
  const g = await excuseEvent(b.event_id);
  if (g.error) return { ok: false, ...g };
  const row = formRow(b.row);
  const bad = checkRow(row);
  if (bad) return { ok: false, error: bad };
  const church = await evRowChurch(row);
  const logCheck = (account: string | null, shown: string) =>
    audit(ctx, "event.excuse-check", g.ev.id, { event_id: g.ev.id, name: row.name, account, shown });
  if (await sameInEvent(g.ev.id, row)) { await logCheck(null, "already"); return { ok: true, already: true, church }; }
  const accounts = await accountsOf(row);
  if (accounts.length !== 1) {
    const account = accounts.length ? "many" : "none";
    await logCheck(account, "none");
    return { ok: true, account, church };
  }
  const s = await oneStamp(g.rule, accounts[0]);
  if (s.weeksDone >= s.need) { await logCheck("one", "eligible"); return { ok: true, account: "one", eligibleNow: true, church }; }
  await logCheck("one", "weeks");
  return { ok: true, account: "one", weekFull: weekFullOf(g.rule, s.weekDays), weeksDone: s.weeksDone, need: s.need,
    canReach: canReach(g.rule, s.weekDays, s.need, kstToday()), church };
}

// ✅ 인정하며 명단에 넣기 — 문턱 아래 분을 사유·동의와 함께(가을 설계 §12 「대리 등록은 보정 창구로만」의 실제 모양).
// 차례(설계 §3): 자격 회차 → 규칙 → 기간 → 동의 → 사유 → 모양 → 같은 분(already — 거절만 · 그 줄 메뉴에서 인정) → 계정 둘 이상
//   (ambiguous-account — 먼저 합치기) → 계정 하나면 다시 세어 이미 자격이면 already-eligible(스스로 신청하시게) → 넣기.
// 직분은 회차가 받을 때만(needs.position — 가을 회차는 앱 줄이 모두 빈칸이라 담당자 줄만 공개 명단에 직분이 드러나지 않게).
async function evExcuseAdd(ctx: Ctx, b: any) {
  if (excuseOff()) return { ok: false, error: "excuse-not-live" };
  const g = await excuseEvent(b.event_id);
  if (g.error) return { ok: false, ...g };
  if (b.consent !== true) return { ok: false, error: "needs-consent" };
  const rc = checkReason(b.reason);
  if (rc.error) return { ok: false, error: rc.error };
  const formed = formRow(b.row);
  const row: EvRow = { ...formed, position: asksPosition(g.ev.needs) ? formed.position : "" };
  const bad = checkRow(row);
  if (bad) return { ok: false, error: bad };
  if (await sameInEvent(g.ev.id, row)) return { ok: false, error: "already" };
  const accounts = await accountsOf(row);
  if (accounts.length > 1) return { ok: false, error: "ambiguous-account" };
  const userId = accounts.length === 1 ? accounts[0] : null;
  if (userId) {
    const s = await oneStamp(g.rule, userId);
    if (s.weeksDone >= s.need) return { ok: false, error: "already-eligible" };
  }
  const note = withExcuse(rc.reason, tagNote(ADD_TAG, b.note));
  const nbad = checkNote(note);
  if (nbad) return { ok: false, error: nbad };
  const warnings: string[] = [];
  if (!userId) warnings.push(NO_ACCOUNT_WARN);
  if (row.position && oddPosition(row.position)) warnings.push(`직분 「${row.position}」 — 앱 직분 목록에 없어요(적은 그대로 넣었어요)`);
  const church = await evRowChurch(row);
  const { data: saved, error } = await db.from("event_signups").insert({
    event_id: g.ev.id, user_id: userId, ident_key: identKey(row),
    who_type: row.who_type, group_name: row.group_name, sub_name: row.sub_name, name: row.name, position: row.position,
    note, source: "import", updated_at: new Date().toISOString(),
  }).select(EV_ROW_COLS).single();
  if (error) {
    // (event_id, user_id) unique — 그 사이 성도님이 앱에서 신청하셨거나 둘이 동시에 넣었다. 500 이 아니라 「이미 있음」.
    if ((error as any).code === "23505") return { ok: false, error: "already" };
    throw error;
  }
  await audit(ctx, "event.excuse", String(saved.id), {
    event_id: g.ev.id, name: row.name, mode: "add", before: { excused: false }, after: { excused: true }, reason: true,
    linked: !!userId, consent: true,
    row: { who_type: row.who_type, group: row.group_name, sub: row.sub_name, position: row.position },
  });
  return { ok: true, row: rowOut(saved, church), linked: !!userId, warnings };
}

// ✏️ 있는 줄의 인정 켜기·사유 고치기·거두기. 켜기는 주 수를 보지 않는다(옛 동작 그대로 — 화면이 이미 자격인 줄엔 메뉴를 안 띄운다).
// 끄기 — 앱 줄은 표기만 뗀다 · 담당자 줄(자격 회차의 담당자 줄은 인정으로만 생긴다)은 drop:true 가 있어야 줄을 뺀다(needs-drop).
// 모두 updated_at 조건부 — 그 사이 바뀌었으면 conflict, 지워졌으면(성도님이 앱에서 취소) not-found. 기록 event.excuse 에 사유 글은 없다.
async function evExcuseSet(ctx: Ctx, b: any) {
  if (excuseOff()) return { ok: false, error: "excuse-not-live" };
  const id = Number(b.id) || 0;
  if (!Number.isSafeInteger(id) || id <= 0) return { ok: false, error: "not-found" };
  const cur = await evRowRead(id);
  if (!cur) return { ok: false, error: "not-found" };
  if (String(b.expect ?? "") !== cur.updated_at) return { ok: false, error: "conflict" };
  const g = await excuseEvent(cur.event_id);
  if (g.error) return { ok: false, ...g };
  if (typeof b.excused !== "boolean") return { ok: false, error: "invalid" };
  const was = excuseOf(cur.note);
  const rest = stripExcuse(cur.note);
  const church = await evRowChurch(cur);
  const gone = async () => ((await evRowRead(id)) ? "conflict" : "not-found");
  const write = async (note: string) => {
    const { data, error } = await db.from("event_signups").update({ note, updated_at: new Date().toISOString() })
      .eq("id", id).eq("updated_at", cur.updated_at).select(EV_ROW_COLS);
    if (error) throw error;
    return data?.length ? data[0] : null;
  };
  if (b.excused) {
    const rc = checkReason(b.reason);
    if (rc.error) return { ok: false, error: rc.error };
    if (was === rc.reason) return { ok: true, row: rowOut(cur, church) };          // 바뀐 것이 없다 — 쓰지 않는다
    const note = withExcuse(rc.reason, rest);
    const nbad = checkNote(note);
    if (nbad) return { ok: false, error: nbad };
    const saved = await write(note);
    if (!saved) return { ok: false, error: await gone() };
    await audit(ctx, "event.excuse", String(id), { event_id: cur.event_id, name: cur.name, mode: was === null ? "set" : "reason",
      before: { excused: was !== null }, after: { excused: true }, reason: true });
    return { ok: true, row: rowOut(saved, church) };
  }
  if (was === null) return { ok: true, row: rowOut(cur, church) };                 // 이미 인정이 없다 — 쓰지 않는다
  if (cur.source === "import") {
    if (b.drop !== true) return { ok: false, error: "needs-drop" };
    const { data: del, error } = await db.from("event_signups").delete()
      .eq("id", id).eq("updated_at", cur.updated_at).select("id");
    if (error) throw error;
    if (!del?.length) return { ok: false, error: await gone() };
    await audit(ctx, "event.excuse", String(id), { event_id: cur.event_id, name: cur.name, mode: "drop",
      before: { excused: true }, after: { excused: false }, reason: false,
      row: { who_type: cur.who_type, group: cur.group_name, sub: cur.sub_name, position: cur.position,
        hasNote: !!rest, source: cur.source, hasUser: !!cur.user_id } });   // 메모는 있었는지만(글은 남기지 않는다)
    return { ok: true, deleted: { id: cur.id, name: cur.name } };
  }
  const saved = await write(rest);
  if (!saved) return { ok: false, error: await gone() };
  await audit(ctx, "event.excuse", String(id), { event_id: cur.event_id, name: cur.name, mode: "unset",
    before: { excused: true }, after: { excused: false }, reason: false });
  return { ok: true, row: rowOut(saved, church) };
}

```

**be-decide 가 들어왔으면**(Step 1 의 `pastEventCreatedAt` 가 `2` 이상 — `evRowAdd` 가 지난 회차 줄의 낸 날을 마감일로 짓는다 · 계획이 고른 해석 ⑫) evExcuseAdd 도 같게 — Edit 하나(evExcuseAdd 안의 여섯 줄 · `g.ev.id` 와 「그 사이 성도님이」 주석이 든 판이라 evRowAdd 와 겹치지 않는다) old:
```ts
  const church = await evRowChurch(row);
  const { data: saved, error } = await db.from("event_signups").insert({
    event_id: g.ev.id, user_id: userId, ident_key: identKey(row),
    who_type: row.who_type, group_name: row.group_name, sub_name: row.sub_name, name: row.name, position: row.position,
    note, source: "import", updated_at: new Date().toISOString(),
  }).select(EV_ROW_COLS).single();
```
new:
```ts
  const church = await evRowChurch(row);
  // 지난 회차(마감일 < 오늘 KST)면 낸 날을 그 마감일 한국 자정으로 — evRowAdd 와 같은 줄 짓기(be-decide M2 · 가을 회차는 11/29~12/13 에 넣는 인정 줄)
  const createdAt = pastEventCreatedAt(g.ev.closes_on, kstToday());
  const { data: saved, error } = await db.from("event_signups").insert({
    event_id: g.ev.id, user_id: userId, ident_key: identKey(row),
    who_type: row.who_type, group_name: row.group_name, sub_name: row.sub_name, name: row.name, position: row.position,
    note, source: "import", updated_at: new Date().toISOString(),
    ...(createdAt ? { created_at: createdAt } : {}),
  }).select(EV_ROW_COLS).single();
```
(old 는 `g.ev.id` 줄이 있어 한 번만 맞는다 — `grep -cF 'event_id: g.ev.id, user_id: userId, ident_key: identKey(row),' $S/index.ts` 가 `1`. `pastEventCreatedAt` 는 be-decide 의 import 줄이 이미 들였다 — 다시 들이지 않는다. 확인: `grep -c 'pastEventCreatedAt(' $S/index.ts` 가 하나 늘었는지 · Step 9 의 `^-[^-]` 는 그대로 `0`.) 들어오지 않았으면 건너뛰고, Task 11 S1-1 이 main 을 합칠 때 다시 본다.

- [ ] **Step 8: switch case 셋**

앵커 `      case "evEligMissing": return json(await evEligMissing(ctx, b));` 줄 **바로 뒤에**:
```ts
      case "evExcuseCheck": return json(await evExcuseCheck(ctx, b));
      case "evExcuseAdd":   return json(await evExcuseAdd(ctx, b));
      case "evExcuseSet":   return json(await evExcuseSet(ctx, b));
```

- [ ] **Step 9: 넣은 자리 확인 · preflight · 커밋**

```bash
cd /c/Projects/church-admin/.worktrees/autumn-excuse
F=supabase/functions/church-admin/index.ts
grep -cF 'from "./events-elig.ts";' $F                                                   # 2
grep -cE '^async function (excuseEvent|accountsOf|oneStamp|evExcuseCheck|evExcuseAdd|evExcuseSet)\(' $F   # 6
grep -cE 'case "(evExcuseCheck|evExcuseAdd|evExcuseSet)":' $F                            # 3
grep -cF 'const EXCUSE_LIVE_PROD = false;' $F                                            # 1
grep -c 'if (excuseOff()) return { ok: false, error: "excuse-not-live" };' $F            # 3
git diff HEAD -- $F | grep -c '^-[^-]'                                                   # 0 — 더하기만
python tools/preflight.py | tail -1
git add supabase/functions/church-admin/authz.ts supabase/functions/church-admin/index.ts tests/authz.test.mjs tests/server.dev.test.mjs
git commit -F - <<'EOF'
feat(성경필사): 가을 말씀 동행 인정 셋(evExcuseCheck·evExcuseAdd·evExcuseSet) — 도장 확인 기록 · 동의·사유 필수 · 직분은 회차가 받을 때만 · 운영은 게이트로 닫음(EXCUSE_LIVE_PROD)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
git show --stat HEAD
git status --short
```
Expected: 주석대로 · `모두 통과` · 파일 넷 · 빈 status.

- [ ] **Step 10: 개발 함수 배포 · 개발 시험**

```bash
cd /c/Projects/church-admin/.worktrees/autumn-excuse
git log --oneline HEAD..main | head -5
supabase functions deploy church-admin --no-verify-jwt --project-ref ktpwthwqzgcqcrmsafdo
set -a; . ~/.church-admin/dev.env; set +a
node --experimental-strip-types --test tests/server.dev.test.mjs 2>&1 | grep -E '^not ok|^# (pass|fail)|정리 실패'
```
Expected: 빈 `git log` · `Deployed Functions on project ktpwthwqzgcqcrmsafdo: church-admin` · `# fail 0` · `정리 실패` 없음. 실패하면 고쳐 새 커밋 → 다시. 운영에는 배포하지 않는다.

---

### Task 5: 바꾼 기록 이름 셋 — `event.excuse` · `event.excuse-check` · `event.missing`

이 과제가 끝나면 총괄 관리자의 「📜 바꾼 기록」에 가을 인정 기록 셋이 한국말 이름과 한 줄 설명으로 보인다(보기 기록 둘은 「(보기)」). 안 더하면 기록 줄이 오류 없이 빈칸이다.

**Files:**
- Modify: `js/menus/system/audit.js` — 앵커 셋: `  "people.lookup": "명부 찾기(성경필사)", "people.fill": "명부로 빈칸 채움(성경필사)",` · `export function detailText(r) {` · `  if (r.action === "people.lookup") return \`‘${d.q || ""}’ · ${d.count ?? 0}명\`;`(그 **앞**에 끼운다 — `people.fill` 줄은 be-decide 가 여러 줄로 바꾸므로 앵커로 쓰지 않는다)
- Modify: `tests/audit.test.mjs` — 앵커 `const NEW = [` 로 시작하는 줄 · 파일 끝에 시험 셋

**Interfaces:**
- Consumes: 서버(Task 3·4)가 남기는 `detail` —
  - `event.excuse` target=줄 id · `{event_id, name, mode:"add"|"set"|"reason"|"unset"|"drop", before:{excused}, after:{excused}, reason: boolean, linked?, consent?, row?:{who_type,group,sub,position[,hasNote,source,hasUser]}}`
  - `event.excuse-check` target=회차 id · `{event_id, name, account:"one"|"many"|"none"|null, shown:"weeks"|"already"|"eligible"|"none"}`
  - `event.missing` target=회차 id · `{event_id, state:"open"|"closed", total}`
  - 기존 `audit.js`: `LABEL` · `detailText(r)` · `joinDot` · `rowWho(w)` · `SRC`
- Produces: `LABEL["event.excuse"]`·`["event.excuse-check"]`·`["event.missing"]` · `detailText` 의 세 갈래(사유 글을 절대 싣지 않는다)

- [ ] **Step 1: 선행 확인**

```bash
cd /c/Projects/church-admin/.worktrees/autumn-excuse
F=js/menus/system/audit.js
grep -cF '  "people.lookup": "명부 찾기(성경필사)", "people.fill": "명부로 빈칸 채움(성경필사)",' $F
grep -c '^export function detailText(r) {' $F
grep -cF '  if (r.action === "people.lookup") return `‘${d.q || ""}’ · ${d.count ?? 0}명`;' $F
grep -c '^const NEW = \[' tests/audit.test.mjs
grep -c 'event.excuse\|event.missing' $F tests/audit.test.mjs
grep -cE 'audit\(ctx, "event\.(excuse|missing)|"event\.excuse-check"' supabase/functions/church-admin/index.ts
```
Expected: `1` · `1` · `1` · `1` · 두 파일 `:0` · 마지막은 `5` 이상(`event.missing` 둘 · `event.excuse-check` 하나(logCheck) · `event.excuse` 넷 — 서버 칸 이름이 위 Consumes 와 다르면 서버가 아니라 여기 기대값을 맞춘다).

- [ ] **Step 2: 실패하는 시험 — `tests/audit.test.mjs`**

① Edit — `const NEW = [` 로 시작하는 한 줄 old:
```js
const NEW = ["event.create", "event.settings", "event.add", "event.edit", "event.delete", "event.upload", "people.lookup", "people.fill"];
```
new:
```js
const NEW = ["event.create", "event.settings", "event.add", "event.edit", "event.delete", "event.upload", "people.lookup", "people.fill",
  "event.excuse", "event.excuse-check", "event.missing"];   // 뒤 셋은 가을 말씀 동행 인정(가을 인정 계획 Task 5)
```
② 파일 **맨 끝에**:
```js

test("가을 인정 event.excuse — 모드마다 한 줄 · 사유 글은 싣지 않는다(기록에 없다) · 넣기는 계정 이음·동의 · 빼기는 출처", () => {
  const add = { event_id: "autumn-2026", name: "도하늘", mode: "add", before: { excused: false }, after: { excused: true },
    reason: true, linked: true, consent: true, row: { who_type: "교구", group: "사랑", sub: "5", position: "" } };
  assert.equal(detailText(R("event.excuse", add, "301")), "도하늘 · 인정하며 넣음 · 사랑 5목장 · 회차 autumn-2026 · 앱 계정 이음 · 동의 받음");
  assert.equal(detailText(R("event.excuse", { event_id: "autumn-2026", name: "도하늘", mode: "set",
    before: { excused: false }, after: { excused: true }, reason: true })), "도하늘 · 인정 · 회차 autumn-2026");
  assert.equal(detailText(R("event.excuse", { event_id: "autumn-2026", name: "도하늘", mode: "reason",
    before: { excused: true }, after: { excused: true }, reason: true })), "도하늘 · 인정 사유 고침 · 회차 autumn-2026");
  assert.equal(detailText(R("event.excuse", { event_id: "autumn-2026", name: "도하늘", mode: "unset",
    before: { excused: true }, after: { excused: false }, reason: false })), "도하늘 · 인정 거둠 · 회차 autumn-2026");
  assert.equal(detailText(R("event.excuse", { event_id: "autumn-2026", name: "라바다", mode: "drop", before: { excused: true },
    after: { excused: false }, reason: false, row: { who_type: "교구", group: "믿음", sub: "3", position: "", hasNote: false,
      source: "import", hasUser: false } })), "라바다 · 인정 거두고 뺌 · 믿음 3목장 · 회차 autumn-2026 · 📋 이관");
  assert.match(LABEL["event.excuse"], /인정/);
});

test("가을 인정 event.excuse-check · event.missing — 「(보기)」 이름 · 계정 수와 무엇을 보였나 · 미신청은 수만", () => {
  assert.match(LABEL["event.excuse-check"], /\(보기\)$/);
  assert.match(LABEL["event.missing"], /\(보기\)$/);
  assert.equal(detailText(R("event.excuse-check", { event_id: "autumn-2026", name: "도하늘", account: "one", shown: "weeks" }, "autumn-2026")),
    "도하늘 · 회차 autumn-2026 · 계정 하나 · 주별 채움을 봄");
  assert.equal(detailText(R("event.excuse-check", { event_id: "autumn-2026", name: "도하늘", account: null, shown: "already" })),
    "도하늘 · 회차 autumn-2026 · 계정 — · 이미 명단에 있음");
  assert.equal(detailText(R("event.excuse-check", { event_id: "autumn-2026", name: "도하늘", account: "many", shown: "none" })),
    "도하늘 · 회차 autumn-2026 · 계정 둘 이상 · 주 값 안 보임");
  assert.equal(detailText(R("event.missing", { event_id: "autumn-2026", state: "open", total: 12 }, "autumn-2026")),
    "회차 autumn-2026 · 신청 창(이름) · 12명");
  assert.equal(detailText(R("event.missing", { event_id: "autumn-2026", state: "closed", total: 3 })),
    "회차 autumn-2026 · 마감 뒤(수만) · 3명");
});
```
```bash
cd /c/Projects/church-admin/.worktrees/autumn-excuse
node --experimental-strip-types --test tests/audit.test.mjs
```
Expected: FAIL — 첫 시험(한국말 이름 · `event.excuse` 없음)과 새 둘 · `# fail 3`.

- [ ] **Step 3: `audit.js` — 세 군데(Edit)**

① `LABEL` — 앵커 `  "people.lookup": "명부 찾기(성경필사)", "people.fill": "명부로 빈칸 채움(성경필사)",` 줄 **바로 뒤에**:
```js
  // 가을 말씀 동행 자격(가을 인정 계획 Task 5) — 사유 글은 기록에 없다 · 보기 둘은 「(보기)」(「바꾼 기록」 보기에 함께 나온다)
  "event.excuse": "성경필사 자격 인정", "event.excuse-check": "성경필사 도장 확인(보기)", "event.missing": "성경필사 미신청 목록(보기)",
```
② `export function detailText(r) {` 줄 **바로 앞에**:
```js
// 가을 말씀 동행 자격(가을 인정 계획 Task 5) — event.excuse 에는 사유 글이 없다(reason 은 「적었다」는 뜻뿐 · 입원·간병은 건강 정보다)
const EXCUSE_MODE = { add: "인정하며 넣음", set: "인정", reason: "인정 사유 고침", unset: "인정 거둠", drop: "인정 거두고 뺌" };
const EXCUSE_ACCOUNT = { one: "하나", many: "둘 이상", none: "없음" };
const EXCUSE_SHOWN = { weeks: "주별 채움을 봄", already: "이미 명단에 있음", eligible: "이미 자격 됨", none: "주 값 안 보임" };

```
③ 앵커 `  if (r.action === "people.lookup") return \`‘${d.q || ""}’ · ${d.count ?? 0}명\`;` 줄 **바로 앞에**(detailText 안 · 성경필사 갈래들 끝 — be-decide 가 바꾸는 `people.fill` 줄은 앵커로 쓰지 않는다):
```js
  if (r.action === "event.excuse") {
    const w = d.row || {};
    return joinDot(d.name, EXCUSE_MODE[d.mode] || d.mode, rowWho(w), w.position, `회차 ${d.event_id || ""}`,
      d.linked ? "앱 계정 이음" : "", d.consent ? "동의 받음" : "",
      d.mode === "drop" ? (SRC[w.source] || w.source) : "", d.mode === "drop" && w.hasUser ? "계정 이어짐" : "");
  }
  if (r.action === "event.excuse-check") {
    return joinDot(d.name, `회차 ${d.event_id || ""}`, `계정 ${EXCUSE_ACCOUNT[d.account] || "—"}`, EXCUSE_SHOWN[d.shown] || d.shown);
  }
  if (r.action === "event.missing") {
    return joinDot(`회차 ${d.event_id || ""}`, d.state === "closed" ? "마감 뒤(수만)" : "신청 창(이름)", `${d.total ?? 0}명`);
  }
```

- [ ] **Step 4: 통과 · preflight · 커밋**

```bash
cd /c/Projects/church-admin/.worktrees/autumn-excuse
node --experimental-strip-types --test tests/audit.test.mjs
python tools/preflight.py | tail -1
git add js/menus/system/audit.js tests/audit.test.mjs
git commit -m "feat(성경필사): 바꾼 기록에 가을 인정 셋(자격 인정·도장 확인(보기)·미신청 목록(보기)) — 사유 글은 싣지 않는다" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git show --stat HEAD
```
Expected: `# fail 0` · `모두 통과` · 파일 둘.

---

### Task 6: 화면 — 자격 회차 읽기(규칙 띠·요약·주 칸·👥 아직 신청 안 하신 분·내려받기) · 메모 창 · 오류 말

이 과제가 끝나면 📋 회차·명단에서 자격 회차를 열면 규칙 띠와 요약(「주로 채움 + 인정으로 = 자격 됨」)이 보이고, 줄마다 주 칸(「3/3주 ✓」·「2/3주 · 신청 때는 확인됨」·「계정 없음 — 주를 셀 수 없어요」·「✅ 인정 · 사유」)이 붙고, 메모는 표기를 뺀 나머지만 보이며, 접힘 칸 「👥 아직 신청 안 하신 분」을 열면 목록과 내려받기가 나온다. 셈을 못 했으면 0 이 아니라 「세지 못했어요」다. 인정 창·단추는 Task 7.

**Files:**
- Create: `js/menus/bibleevent/elig-logic.js`(순수) · `tests/be-elig-logic.test.mjs`
- Modify: `js/core/ui.js` — `MESSAGES`(앵커 `  "too-many": …` 줄 뒤에 새 코드 · 두 줄 바꾸기)
- Modify: `js/menus/bibleevent/roster-logic.js` — `csvText(rows, more = null)`(앵커 셋)
- Modify: `js/menus/bibleevent/roster-ui.js` — import 셋 · `ELIG_LINE` · `cardHtml`·`tableHtml`·`listHtml`·`rowMenuOptions` 바꾸기 · `eligStaticHtml`·`missingBodyHtml` 더하기
- Modify: `js/menus/bibleevent/row-form.js` — 자격 회차 줄의 메모 창(표기 뺀 나머지 · 상한)
- Modify: `js/menus/bibleevent/roster.js` — 셈 부르기·띠·요약·주 칸·접힘 칸·내려받기
- Modify: `css/admin.css` — 앵커 `.be-pp-note{…}` 줄 **바로 뒤**(2026-09-30 부터는 파일 끝이 아니다 — main 의 🧪 시험 참여자 `.mt-*` 블록이 그 뒤에 붙었다. 끝을 찾지 말고 앵커 뒤에 끼운다)
- Modify: `tests/be-roster-ui.test.mjs` — `ELIG_LINE` 기대 글 · 새 시험 넷

**Interfaces:**
- Consumes:
  - 서버(Task 3): `evEligRows {event_id}` → `{ok, state, rule?, asksPosition, computedAt?, counts?, rows?: EligOut[]}` · `evEligMissing {event_id}` → `{ok, state:"no-rule"|"not-open"|"open"|"closed", opensOn?, computedAt?, total?, rows?}` · `evEvents` 의 `today`(한국 날짜)
  - Task 2 `tests/fixtures/excuse-marker.json` · `events-elig.ts`(시험만 — 맞대기)
  - 기존: `roster-logic.js` `csvCell`·`norm`·`groupRows`·`subText`·`whoText` · `person-logic.js` `nameButtonHtml` · `ui.js` `esc`·`errorText`·`toast` · `row-form.js` `openRowForm`
- Produces:
  - `elig-logic.js`: `EXCUSE_HEAD` · `EXCUSE_REASON_MAX` · `NOTE_MAX` · `EXCUSE_CHIPS` · `SPLIT_CHIP` · `SPLIT_NOTE` · `REASON_TIP` · `CHECK_LOG_TIP` · `APP_NOTE` · `MISSING_APPROX` · `MISSING_NO_ADD` · `MISSING_FILE_TIP` · `EXCUSE_UI_PROD` · `excuseUiOn(env)` · `kstStamp(iso)` · `excuseOf(note)` · `stripExcuse(note)` · `noteRestMax(note)` · `excuseWindow(ev,today)` · `missingWindow(ev,today)` · `notOpenText(opensOn)` · `excuseWhy(ev,today,uiOn)` · `ruleBandText(el)` · `eligSumText(el)` · `weekText(r,er)` · `eligMenuOptions(r,er,ctx)` · `eligCsvMore(byId,el)` · `missingHead(m)` · `missingCsv(rows)` · `missingCsvName(evId,n,now?)` · `checkText(c)` · `checkBlock(c)` · `consentText(asks,title)` — Task 7 이 창·메뉴에 쓴다
  - `roster-ui.js`: `ELIG_LINE`(새 글) · `cardHtml(r, dup, el = null)` · `tableHtml(groups, dups, el = null)` · `listHtml(groups, dups, wide, el = null)` — `el = {byId: Map<string, EligOut>}` · `rowMenuOptions(r, ev, el = null)` — `el = {counted, why, row}` · `eligStaticHtml(why)` · `missingBodyHtml(m)`
  - `roster-logic.js`: `csvText(rows, more = null)` — `more = {head: string[], cells: (r) => unknown[]}`
  - `roster.js` 안(Task 7 이 쓴다): `today` · `uiOn()` · `elig` · `eligById` · `reload()` · `stale(code)`
  - `ui.js` `MESSAGES` 새 코드 열다섯(`not-eligibility-event`·`no-rule`·`excuse-not-open`·`excuse-period-over`·`excuse-not-live`·`needs-consent`·`no-reason`·`reason-too-long`·`reason-bad-char`·`ambiguous-account`·`already-eligible`·`needs-drop`·`excuse-via-memo`·`count-capped`·`needs-check`)

- [ ] **Step 1: 선행 확인**

```bash
cd /c/Projects/church-admin/.worktrees/autumn-excuse
c() { printf '%s  %s  <- %s\n' "$(grep -cF -- "$2" "$1")" "$2" "$1"; }
B=js/menus/bibleevent
c js/core/ui.js '  "too-many": "한 번에 600줄까지 올릴 수 있어요 — 나눠서 올려 주세요",'
c js/core/ui.js '  "app-row-note-only": "앱에서 낸 신청(또는 자격 회차의 줄)은 메모만 고칠 수 있어요",'
c js/core/ui.js '  "eligibility-event": "자격 회차(가을 말씀 동행 같은)의 명단은 더하기·올리기·빼기를 하지 않아요 — 메모만 고칠 수 있어요",'
c $B/roster-logic.js 'export function csvText(rows) {'
c $B/roster-logic.js '  const head = ["이름", "구분", "소속", "세부", "직분", "출처", "교적"];'
c $B/roster-logic.js '    r.church ? [r.church.state, r.church.reason].filter(Boolean).join(" · ") : ""]);'
c $B/roster-ui.js 'import { nameButtonHtml } from "./person-logic.js";'
c $B/roster-ui.js 'export const ELIG_LINE = '
c $B/roster-ui.js 'export function cardHtml(r, dup) {'
c $B/roster-ui.js 'export function tableHtml(groups, dups) {'
c $B/roster-ui.js 'export function listHtml(groups, dups, wide) {'
c $B/roster-ui.js 'export function rowMenuOptions(r, ev) {'
c $B/row-form.js 'import { GU_ORDER, ROW_KEYS, NOTE_FORM_MAX, NOTE_EDIT_MAX, norm, whoText, rowPatch } from "./roster-logic.js";'
c $B/row-form.js '    : "🔒 자격 회차의 줄이라 메모만 고칠 수 있어요";'
c $B/row-form.js '    : { who_type: "교구", group: "", sub: "", name: "", position: "", note: "" };'
c $B/row-form.js 'noteField(init.note, NOTE_EDIT_MAX)'
c $B/row-form.js '      const patch = rowPatch(row, v, noteOnly ? ["note"] : ROW_KEYS);'
c $B/roster.js 'import { personPayload } from "./person-logic.js";'
c $B/roster.js '  const events = sortEvents(evs.events || []);'
c $B/roster.js '      ${ev.hasEligibility ? ELIG_LINE : ""}'
c $B/roster.js '  const find = (id) => rows.find((x) => String(x.id) === String(id));'
c $B/roster.js '    list.innerHTML = listHtml(groups, dups, mqWide.matches);'
c $B/roster.js '    download(csvText(vis), `${ev.id}_명단_${vis.length}명_${stamp()}.csv`);'
c $B/roster.js '  async function pickFilter(b) {'
c $B/roster.js '    else if (act === "csv") exportCsv();'
c $B/roster.js '  // <details> 의 toggle 은 거품이 일지 않는다 — 잡는 단계(capture)에서 받는다'
c $B/roster.js 'mqWide.addEventListener("change", onMq);'
c tests/be-roster-ui.test.mjs 'import { errorText } from "../js/core/ui.js";'
c tests/be-roster-ui.test.mjs '  assert.ok(ELIG_LINE.includes("자격 규칙은 여기서 바꾸지 않습니다 · 이 회차는 한 분 더하기·올리기를 하지 않습니다(가을 설계 §12)"));'
c css/admin.css '.be-pp-note{padding:8px 10px;border-radius:8px;background:var(--ghost-bg);color:var(--navy);font-size:13px;line-height:1.5}'
ls $B/elig-logic.js tests/be-elig-logic.test.mjs 2>&1 | grep -c "No such file"
```
Expected: 앵커 서른 줄 모두 `1` · 마지막 `2`. (`mqWide.addEventListener("change", onMq);` 는 파일 끝 `draw();` 바로 위 한 번 — Step 9 ⑩ 의 앵커.)

- [ ] **Step 2: 실패하는 시험 — `tests/be-elig-logic.test.mjs`(Write)**

```js
// 📋 가을 말씀 동행(자격 회차) 화면 논리 — 순수 함수 시험(가을 인정 계획 Task 6). 이름은 음절 표로 지은 가짜(도하늘 …)만.
// ⚠️ 인정 표기·창은 서버 events-elig.ts 와 **같아야** 한다 — 같은 보기 파일(tests/fixtures/excuse-marker.json)·같은 날짜 표로 맞댄다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as E from "../js/menus/bibleevent/elig-logic.js";
import * as S from "../supabase/functions/church-admin/events-elig.ts";
import { csvText } from "../js/menus/bibleevent/roster-logic.js";
import { errorText } from "../js/core/ui.js";

const FX = JSON.parse(readFileSync(new URL("./fixtures/excuse-marker.json", import.meta.url), "utf8"));
const AUT = { opens_on: "2026-10-27", closes_on: "2026-11-28", list_until: "2026-12-13" };
const RULE = { start: "2026-10-11", end: "2026-11-21", weeks: 6, perWeek: 3, need: 3, minNeed: 2 };
const ER = (o) => ({ id: 1, excused: false, excuseReason: "", noteRest: "", weeksDone: 3, need: 3, byWeeks: true, ok: true, perfect: null, ...o });

test("인정 표기 읽기 — 서버 events-elig.ts 와 같은 보기 파일에서 같은 답", () => {
  for (const c of FX.read) {
    const n = c.nfd ? c.note.normalize("NFD") : c.note;
    assert.equal(E.excuseOf(n), c.reason, JSON.stringify(c));
    assert.equal(E.excuseOf(n), S.excuseOf(n), "서버와 다름 " + JSON.stringify(c));
    assert.equal(E.stripExcuse(n), c.nfd ? n : c.rest, JSON.stringify(c));
    assert.equal(E.stripExcuse(n), S.stripExcuse(n), "서버와 다름 " + JSON.stringify(c));
  }
});

test("창 — 인정 창(opens_on~list_until)·미신청 창(opens_on~closes_on) · 서버와 같은 날짜 표", () => {
  const ex = [["2026-10-26", "not-open"], ["2026-10-27", "open"], ["2026-12-13", "open"], ["2026-12-14", "over"]];
  for (const [d, want] of ex) { assert.equal(E.excuseWindow(AUT, d), want, d); assert.equal(S.excuseWindow(AUT, d), want, d); }
  assert.equal(E.excuseWindow({ ...AUT, list_until: null }, "2027-01-01"), S.excuseWindow({ ...AUT, list_until: null }, "2027-01-01"));
  const mi = [["2026-10-26", "not-open"], ["2026-10-27", "open"], ["2026-11-28", "open"], ["2026-11-29", "closed"]];
  for (const [d, want] of mi) { assert.equal(E.missingWindow(AUT, d), want, d); assert.equal(S.missingWindow(AUT, d), want, d); }
});

test("excuseWhy — 인정 창이 닫힌 까닭 한 줄(날짜를 적는다) · 운영에서 2단계 전이면 준비 중 · 열렸으면 빈 글 · UI 게이트", () => {
  assert.equal(E.excuseWhy(AUT, "2026-10-26", true), "인정은 신청이 열린 날(10월 27일)부터 할 수 있어요");
  assert.equal(E.excuseWhy(AUT, "2026-12-14", true), "명단 공개가 끝난 회차예요 — 인정은 닫혔어요");
  assert.equal(E.excuseWhy(AUT, "2026-10-27", false), "인정 기능은 준비 중이에요 — 그동안 사정 문의는 종이에 받아 두세요");
  assert.equal(E.excuseWhy(AUT, "2026-10-27", true), "");
  assert.equal(E.notOpenText("2026-10-27"), "인정은 신청이 열린 날(10월 27일)부터 할 수 있어요");   // 서버 excuse-not-open 의 opensOn 으로 창이 쓰는 글(설계 §3 오류표)
  assert.equal(E.excuseUiOn("dev"), true);
  assert.equal(E.excuseUiOn("prod"), E.EXCUSE_UI_PROD);
});

test("ruleBandText — 설계 4절 문장 · 시작 전·측정 중·끝난 뒤 · 모름을 0 으로 그리지 않는다", () => {
  assert.equal(E.ruleBandText({ ok: true, state: "measuring", rule: RULE, computedAt: "2026-10-30T05:05:00Z" }),
    "📏 도장 기간 10.11 ~ 11.21 · 한 주에 3일이면 그 주 ✓ · 여섯 주 중 세 주(이 기간에 처음 오신 분은 두 주) · 지금: 측정 중 · 10월 30일 14:05 에 센 값");
  assert.ok(E.ruleBandText({ ok: true, state: "before", rule: RULE }).endsWith("측정 전 — 10월 11일부터 셉니다"));
  assert.ok(E.ruleBandText({ ok: true, state: "ended", rule: RULE, computedAt: "2026-11-23T00:00:00Z" })
    .endsWith("측정 끝(11월 21일) — 이 뒤로는 주 수가 늘지 않아요 · 11월 23일 09:00 에 센 값"));
  assert.equal(E.ruleBandText({ state: "loading" }), "📏 주 수를 세는 중…");
  assert.equal(E.ruleBandText(null), "📏 주 수를 세는 중…");
  assert.equal(E.ruleBandText({ state: "error", error: "server" }), "주 수를 세지 못했어요 — ↻ 새로 불러오기를 눌러 주세요");
  assert.equal(E.ruleBandText({ state: "error", error: "count-capped" }), "주 수를 세지 못했어요 — 활동한 계정이 1,000을 넘었어요(담당 개발자에게 알려 주세요)");
  assert.equal(E.ruleBandText({ ok: true, state: "no-rule" }), "자격 규칙을 읽지 못했어요 — 담당 개발자에게 알려 주세요");
});

test("eligSumText — 주로 채움 + 인정으로 = 자격 됨(겹쳐 세지 않는다) · ✨ 는 끝난 뒤만 · 다시 센 값이 모자란 앱 줄 · 셈 전엔 빈 글", () => {
  const c = { total: 12, ok: 5, byWeeks: 3, byExcuse: 2, noAccount: 1, recheckShort: 0, perfect: null };
  assert.equal(E.eligSumText({ ok: true, state: "measuring", rule: RULE, counts: c }),
    "명단 12명 · 자격 됨 5명(주로 채움 3 · 인정으로 2) · 계정 없음 1명");
  assert.equal(E.eligSumText({ ok: true, state: "ended", rule: RULE, counts: { ...c, perfect: 2, recheckShort: 1 } }),
    "명단 12명 · 자격 됨 5명(주로 채움 3 · 인정으로 2) · 계정 없음 1명 · ✨ 여섯 주 2명 · 다시 센 값이 모자란 앱 줄 1");
  for (const el of [null, { state: "loading" }, { state: "error" }, { ok: true, state: "before", rule: RULE }, { ok: true, state: "no-rule" }])
    assert.equal(E.eligSumText(el), "");
});

test("weekText — 3/3주 ✓ · 2/3주 · 신청 때는 확인됨(앱 줄) · 계정 없음 · ✅ 인정 · 사유 · ✨ · 셈 전 「—」", () => {
  const app = { source: "app" }, imp = { source: "import" };
  assert.equal(E.weekText(app, undefined), "—");
  assert.equal(E.weekText(app, ER()), "3/3주 ✓");
  assert.equal(E.weekText(app, ER({ weeksDone: 2, byWeeks: false, ok: false })), "2/3주 · 신청 때는 확인됨");
  assert.equal(E.weekText(imp, ER({ weeksDone: 1, need: 2, byWeeks: false, ok: false })), "1/2주");
  assert.equal(E.weekText(app, ER({ weeksDone: 2, byWeeks: false, excused: true, excuseReason: "10월 3주 입원" })), "2/3주 · ✅ 인정 · 10월 3주 입원");
  assert.equal(E.weekText(imp, ER({ weeksDone: null, need: null, byWeeks: null, ok: null })), "계정 없음 — 주를 셀 수 없어요");
  assert.equal(E.weekText(imp, ER({ weeksDone: null, need: null, byWeeks: null, excused: true, excuseReason: "종이로 암송" })),
    "계정 없음 — 주를 셀 수 없어요 · ✅ 인정 · 종이로 암송");
  assert.equal(E.weekText(app, ER({ weeksDone: 6, perfect: true })), "6/3주 ✓ · ✨");
});

test("eligMenuOptions — 설계 4절 일곱 경우(창 밖·셈 전이면 메모만)", () => {
  const on = { counted: true, why: "" };
  const v = (r, e, ctx) => E.eligMenuOptions(r, e, ctx).map((o) => o.value);
  const app = { source: "app" }, imp = { source: "import" }, short = ER({ weeksDone: 2, byWeeks: false, ok: false });
  assert.deepEqual(v(app, short, on), ["excuse", "edit"]);                                               // 앱 줄 · 다시 센 값이 모자람
  assert.match(E.eligMenuOptions(app, short, on)[0].hint, /신청 때는 서버가 확인했어요/);
  assert.deepEqual(v(app, ER(), on), ["edit"]);                                                          // 앱 줄 · 이미 자격
  assert.match(E.eligMenuOptions(app, ER(), on)[0].hint, /주로 채우셔서 인정이 필요 없어요/);
  assert.deepEqual(v(app, { ...short, excused: true, excuseReason: "간병", ok: true }, on), ["reason", "unset", "edit"]);   // 인정된 앱 줄
  assert.deepEqual(v(imp, { ...short, excused: true, excuseReason: "간병", ok: true }, on), ["reason", "drop", "edit"]);   // 인정된 담당자 줄
  assert.equal(E.eligMenuOptions(imp, { ...short, excused: true }, on)[1].label, "↩️ 인정 거두고 명단에서 빼기");
  assert.deepEqual(v(imp, short, on), ["excuse", "edit"]);                                               // 담당자 줄 · 인정 없음
  assert.deepEqual(v(app, undefined, { counted: false, why: "" }), ["edit"]);                            // 셈 전
  assert.match(E.eligMenuOptions(app, undefined, { counted: false, why: "" })[0].hint, /주 수를 센 뒤에 인정할 수 있어요/);
  assert.deepEqual(v(imp, { ...short, excused: true }, { counted: true, why: "명단 공개가 끝난 회차예요 — 인정은 닫혔어요" }), ["edit"]);   // 창 밖
  assert.equal(E.eligMenuOptions(imp, short, { counted: true, why: "닫힌 까닭" })[0].hint, "닫힌 까닭");
  assert.deepEqual(v(app, short, null), ["edit"]);
});

test("내려받기 — 자격 회차는 채운 주·필요 주·자격·인정(사유 없음) · 끝난 뒤 여섯 주 · 모르는 값은 「모름」 · 보통 회차는 그대로", () => {
  const byId = new Map([
    ["1", ER({ id: 1 })],
    ["2", ER({ id: 2, excused: true, excuseReason: "간병", weeksDone: null, need: null, byWeeks: null, ok: true })],
    ["3", ER({ id: 3, weeksDone: 1, byWeeks: false, ok: false })],
  ]);
  const rows = [1, 2, 3, 4].map((id) => ({ id, name: "도하늘" + id, who_type: "교구", group: "사랑", sub: "5", position: "", source: "app", church: null }));
  const lines = csvText(rows, E.eligCsvMore(byId, { ok: true, state: "measuring", rule: RULE })).slice(1).split("\r\n");
  assert.equal(lines[0], '"이름","구분","소속","세부","직분","출처","교적","채운 주","필요 주","자격","인정"');
  assert.ok(lines[1].endsWith('"3","3","O",""'), lines[1]);
  assert.ok(lines[2].endsWith('"모름","모름","O","O"'), lines[2]);
  assert.ok(lines[3].endsWith('"1","3","",""'), lines[3]);
  assert.ok(lines[4].endsWith('"모름","모름","모름","모름"'), lines[4]);
  assert.ok(!lines.join("\n").includes("간병"), "사유를 싣지 않는다");
  const ended = csvText(rows.slice(0, 1), E.eligCsvMore(new Map([["1", ER({ perfect: true })]]), { ok: true, state: "ended", rule: RULE }));
  assert.ok(ended.includes('"여섯 주"') && ended.endsWith('"3","3","O","","O"'), ended);
  assert.equal(csvText(rows.slice(0, 1)).slice(1).split("\r\n")[0], '"이름","구분","소속","세부","직분","출처","교적"');
});

test("미신청 — 상태 글 넷을 뭉개지 않는다 · 내려받기 네 칸(BOM · \\r\\n · 수식 막기) · 파일 이름(한국 시각)", () => {
  assert.equal(E.missingHead({ state: "not-open", opensOn: "2026-10-27" }), "10월 27일 신청이 열린 뒤에 보여요");
  assert.equal(E.missingHead({ state: "open", total: 0, rows: [], computedAt: "2026-10-30T05:05:00Z" }), "지금은 없어요");
  assert.equal(E.missingHead({ state: "open", total: 2, rows: [{}, {}], computedAt: "2026-10-30T05:05:00Z" }),
    "자격은 되셨는데 아직 신청하지 않으신 분 2명 · 10월 30일 14:05 기준");
  assert.equal(E.missingHead({ state: "closed", total: 7 }), "신청이 마감됐어요 — 자격은 되셨는데 신청하지 않으신 분은 7명이었어요");
  assert.equal(E.missingHead({ state: "error", error: "server" }), "불러오지 못했어요");
  assert.equal(E.missingHead({ state: "loading" }), "불러오는 중…");
  assert.equal(E.missingHead({ ok: true, state: "no-rule" }), "자격 규칙을 읽지 못했어요");
  const csv = E.missingCsv([{ name: "도하늘", who_type: "교구", group: "사랑", sub: "5" }, { name: "=라바다", who_type: "교회학교", group: "청년부", sub: "" }]);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.deepEqual(csv.slice(1).split("\r\n"), ['"이름","구분","소속","세부"', '"도하늘","교구","사랑","5"', `"'=라바다","교회학교","청년부",""`]);
  assert.equal(E.missingCsvName("autumn-2026", 12, new Date("2026-10-30T05:05:00Z")), "autumn-2026_미신청_12명_20261030-1405.csv");
});

test("noteRestMax · 도장 확인 글 · 넣기를 막는 결과 · 동의 문장", () => {
  assert.equal(E.noteRestMax(""), 500);
  assert.equal(E.noteRestMax("담당자가 더함"), 500);
  assert.equal(E.noteRestMax("자격 인정: 간병 / 전화"), 500 - ("자격 인정: 간병".length + 3));
  assert.equal(E.noteRestMax("자격 인정: " + "가".repeat(200)), 500 - (7 + 200 + 3));
  assert.equal(E.checkText({ ok: true, account: "one", weekFull: [true, false, true, false, false, false], weeksDone: 2, need: 3, canReach: false }),
    "앱 계정 찾음 · 1주 ✓ · 2주 · 3주 ✓ · 4주 · 5주 · 6주 · 채운 주 2 / 필요 3 · 남은 주로는 닿기 어려워요");
  assert.ok(E.checkText({ ok: true, account: "one", weekFull: [false, true], weeksDone: 1, need: 2, canReach: true }).endsWith("남은 주로 닿을 수 있어요"));
  assert.ok(E.checkText({ ok: true, already: true }).startsWith("이미 명단에 있어요"));
  assert.ok(E.checkText({ ok: true, account: "one", eligibleNow: true }).startsWith("이미 자격이 되셨어요"));
  assert.ok(E.checkText({ ok: true, account: "none" }).startsWith("이 이름·소속으로는 앱 계정을 못 찾았어요"));
  assert.ok(E.checkText({ ok: true, account: "many" }).startsWith("같은 이름·소속의 앱 계정이 둘 이상이에요"));
  assert.equal(E.checkBlock(null), "needs-check");
  assert.equal(E.checkBlock({ already: true }), "already");
  assert.equal(E.checkBlock({ account: "many" }), "ambiguous-account");
  assert.equal(E.checkBlock({ account: "one", eligibleNow: true }), "already-eligible");
  assert.equal(E.checkBlock({ account: "none" }), null);
  assert.equal(E.checkBlock({ account: "one", weekFull: [] }), null);
  assert.equal(E.consentText(false, "가을 말씀 동행"), "그분(또는 가족)께 여쭙고, 가을 말씀 동행 명단에 이름과 소속이 오르는 것을 허락받았어요");
  assert.ok(E.consentText(true, "가을 말씀 동행").includes("이름·소속·직분"));
  assert.deepEqual(E.EXCUSE_CHIPS, ["입원·수술", "장례", "간병", "통신이 끊긴 날", "종이로 암송", "계정이 갈림"]);
});

test("오류 말 — 새 코드는 모두 한국말 · reason-bad-char 는 bad-char 와 다른 말 · 바뀐 두 줄은 인정을 말한다", () => {
  for (const code of ["not-eligibility-event", "no-rule", "excuse-not-open", "excuse-period-over", "excuse-not-live", "needs-consent",
    "no-reason", "reason-too-long", "reason-bad-char", "ambiguous-account", "already-eligible", "needs-drop", "excuse-via-memo",
    "count-capped", "needs-check"]) assert.notEqual(errorText({ error: code }), "처리하지 못했어요", code);
  assert.notEqual(errorText({ error: "reason-bad-char" }), errorText({ error: "bad-char" }));
  assert.match(errorText({ error: "reason-bad-char" }), /10\/18/);
  assert.match(errorText({ error: "app-row-note-only" }), /메모와 인정만/);
  assert.match(errorText({ error: "eligibility-event" }), /인정하며 넣기/);
});
```

`tests/be-roster-ui.test.mjs` 두 곳:

① old(한 줄):
```js
  assert.ok(ELIG_LINE.includes("자격 규칙은 여기서 바꾸지 않습니다 · 이 회차는 한 분 더하기·올리기를 하지 않습니다(가을 설계 §12)"));
```
new:
```js
  assert.ok(ELIG_LINE.includes("자격 규칙은 여기서 바꾸지 않습니다 · 한 분 더하기·올리기는 하지 않고, 사정이 있으셨던 분은 「✅ 인정하며 넣기」로만 넣습니다(가을 설계 §12)"));
  assert.ok(ELIG_LINE.includes("줄은 메모와 인정만 고쳐요"));
```
② 앵커 `import { errorText } from "../js/core/ui.js";` 줄 **바로 뒤에** 새 import 한 줄, 그리고 파일 **맨 끝에** 시험 넷:
```js
import { eligStaticHtml, missingBodyHtml } from "../js/menus/bibleevent/roster-ui.js";   // 가을 인정(Task 6)
```
```js

test("가을 인정 — 자격 회차 줄: 카드에 📏 주 칸·표기 뺀 메모 · 표에 「주」 칸(여덟 칸 · 직분 뒤) · 셈 전이면 「—」 · 보통 회차는 그대로", () => {
  const r = { ...ROW, source: "app", note: "자격 인정: 간병 / 전화로 여쭘" };
  const byId = new Map([[String(r.id), { id: r.id, excused: true, excuseReason: "간병", noteRest: "전화로 여쭘", weeksDone: 2, need: 3,
    byWeeks: false, ok: true, perfect: null }]]);
  const c = cardHtml(r, false, { byId });
  assert.ok(c.includes("📏 2/3주 · ✅ 인정 · 간병"), c);
  assert.ok(c.includes("📝 전화로 여쭘") && !c.includes("자격 인정:"), c);
  const t = tableHtml([{ key: "교구|화평", label: "화평", rows: [r] }], new Set(), { byId });
  assert.equal((t.match(/<th>/g) || []).length, 8);
  assert.ok(t.includes('colspan="8"') && t.indexOf("<th>직분</th>") < t.indexOf("<th>주</th>"));
  assert.ok(!t.includes("자격 인정:"));
  assert.ok(cardHtml(r, false, { byId: new Map() }).includes("📏 —"));
  const plain = cardHtml({ ...ROW, note: "자격 인정: x" }, false);
  assert.ok(!plain.includes("be-el-wk") && plain.includes("자격 인정: x"), "자격 회차가 아니면 주 칸 없이 메모 그대로");
});

test("가을 인정 — 자격 회차 조각: 규칙 띠·요약 자리 · 인정 창이 닫힌 까닭 한 줄 · 접힘 칸(열 때 부른다) · 새 ELIG_LINE", () => {
  const h = eligStaticHtml("인정은 신청이 열린 날(10월 27일)부터 할 수 있어요");
  assert.ok(h.includes('class="be-el-rule"') && h.includes("be-el-sum") && h.includes('<details class="be-miss">'));
  assert.ok(h.includes("인정은 신청이 열린 날(10월 27일)부터 할 수 있어요") && h.includes("be-el-why"));
  assert.ok(!eligStaticHtml("").includes("be-el-why"));
  assert.ok(!h.includes('data-act="person"'), "접힘 칸은 열기 전에 이름을 담지 않는다");
});

test("가을 인정 — 👥 아직 신청 안 하신 분: 넷 상태를 뭉개지 않는다 · 이름 단추·교구 먼저 묶음 · 넣기 단추 없음 · 내려받기는 신청 창 동안만", () => {
  assert.ok(missingBodyHtml({ state: "loading" }).includes("불러오는 중"));
  assert.ok(missingBodyHtml({ ok: true, state: "not-open", opensOn: "2026-10-27" }).includes("10월 27일 신청이 열린 뒤에 보여요"));
  assert.ok(missingBodyHtml({ ok: true, state: "open", total: 0, rows: [], computedAt: "2026-10-30T05:05:00Z" }).includes("지금은 없어요"));
  const err = missingBodyHtml({ state: "error", error: "server" });
  assert.ok(err.includes("불러오지 못했어요") && err.includes('data-act="miss-reload"'));
  const cl = missingBodyHtml({ ok: true, state: "closed", total: 7, computedAt: "2026-11-30T00:00:00Z" });
  assert.ok(cl.includes("신청하지 않으신 분은 7명이었어요") && !cl.includes("miss-csv") && !cl.includes("be-name"));
  const open = missingBodyHtml({ ok: true, state: "open", total: 2, computedAt: "2026-10-30T05:05:00Z", rows: [
    { name: "라<바다>", who_type: "교회학교", group: "청년부", sub: "" }, { name: "도하늘", who_type: "교구", group: "사랑", sub: "5" }] });
  assert.ok(open.includes("자격은 되셨는데 아직 신청하지 않으신 분 2명 · 10월 30일 14:05 기준"));
  assert.ok(open.includes('data-act="person"') && open.includes("라&lt;바다&gt;") && !open.includes("<바다>"));
  assert.ok(open.indexOf("사랑") < open.indexOf("청년부"), "교구 먼저");
  assert.ok(open.includes('data-act="miss-csv"') && open.includes("알려 드린 뒤에는 파일을 지워 주세요"));
  assert.ok(open.includes("계정이 둘로 갈린 분") && open.includes("담당자가 대신 넣지 않아요"));
  assert.ok(!open.includes("excuse-add"), "이 목록에는 넣기 단추가 없다");
});

test("가을 인정 — rowMenuOptions: 자격 회차는 eligMenuOptions 로(셈 전·창 밖이면 메모만) · 보통 회차는 그대로", () => {
  const ELEV = { ...EV, hasEligibility: true };
  const er = { id: 7, excused: false, excuseReason: "", noteRest: "", weeksDone: 1, need: 3, byWeeks: false, ok: false, perfect: null };
  assert.deepEqual(rowMenuOptions(ROW, ELEV, { counted: true, why: "", row: er }).map((o) => o.value), ["excuse", "edit"]);
  assert.deepEqual(rowMenuOptions(ROW, ELEV, { counted: false, why: "", row: undefined }).map((o) => o.value), ["edit"]);
  assert.deepEqual(rowMenuOptions(ROW, ELEV, { counted: true, why: "닫힘", row: er }).map((o) => o.value), ["edit"]);
  assert.deepEqual(rowMenuOptions(ROW, EV, { counted: true, why: "", row: er }).map((o) => o.value), ["edit", "del"]);
});
```

- [ ] **Step 3: 돌려서 실패를 본다**

```bash
cd /c/Projects/church-admin/.worktrees/autumn-excuse
node --experimental-strip-types --test tests/be-elig-logic.test.mjs tests/be-roster-ui.test.mjs 2>&1 | tail -8
```
Expected: FAIL — `be-elig-logic` 은 `Cannot find module …/elig-logic.js` · `be-roster-ui` 는 `does not provide an export named 'eligStaticHtml'`(파일째 실패) · `# fail 2`.

- [ ] **Step 4: `js/menus/bibleevent/elig-logic.js`(Write)**

```js
// 📋 가을 말씀 동행(자격 회차) — 화면 논리(순수 함수 · 가을 인정 계획 Task 6). tests/be-elig-logic.test.mjs 가 같은 파일을 읽는다(DOM 없음).
// 설계: v2 docs/superpowers/specs/2026-09-30-church-admin-autumn-excuse-design.md §2·§4.
// ⚠️ 셈(주 수·필요 주·자격)은 서버(events-elig.ts · evEligRows)가 한다 — 여기는 글·메뉴·내려받기 꼴만 만든다.
// ⚠️ 인정 표기 읽기(excuseOf·stripExcuse)·창(excuseWindow·missingWindow)은 서버 events-elig.ts 와 **같아야** 한다 —
//    브라우저는 .ts 를 못 읽어 한 벌 더 두고, 시험이 tests/fixtures/excuse-marker.json 과 같은 날짜 표로 두 쪽을 맞댄다.
// ⚠️ 「모름」과 「0」을 뭉개지 않는다 — 셈을 못 했으면 「—」·「모름」이지 0 이 아니다.
import { csvCell, norm } from "./roster-logic.js";

export const EXCUSE_HEAD = "자격 인정: ";
const SEP = " / ";
export const EXCUSE_REASON_MAX = 200;
export const NOTE_MAX = 500;   // 서버 BE_NOTE_MAX
export const EXCUSE_CHIPS = ["입원·수술", "장례", "간병", "통신이 끊긴 날", "종이로 암송", "계정이 갈림"];
export const SPLIT_CHIP = "계정이 갈림";
export const SPLIT_NOTE = "먼저 계정 합치기를 총괄 관리자에게 청해 주세요 — 합치면 주가 합쳐져 인정이 필요 없을 수 있어요(가을 설계 §11 「합치기 → 신청」)";
export const REASON_TIP = "사유는 짧게 — 병명은 적지 않아요";
export const CHECK_LOG_TIP = "찾아본 분의 이름이 기록에 남아요";
export const APP_NOTE = "성도님 앱에는 「✅ 신청하셨어요」와 함께 도장판의 모자란 주가 그대로 보여요(「이번 신청은 여기까지예요」가 뜰 수도 있어요) · " +
  "신청 기간 중 「참여 취소」를 누르시면 명단에서 빠지고 다시 넣어 드려야 해요 — 여쭐 때 함께 말씀드려 주세요";
export const MISSING_APPROX = "앱 계정 기준이에요 — 계정이 둘로 갈린 분은 신청한 계정과 다른 계정이 여기 뜰 수 있어요";
export const MISSING_NO_ADD = "자격이 되셨어도 담당자가 대신 넣지 않아요 — 성도님이 앱에서 직접 신청하시도록 알려 드려요(가을 설계 §10)";
export const MISSING_FILE_TIP = "알려 드린 뒤에는 파일을 지워 주세요";

// 2단계(쓰기)를 운영에서 여는 날(계획 Task 11 2단계 ⓑ)까지 운영 화면(admin.onlybible.kr)은 인정 단추를 숨긴다 —
// 서버도 운영에서는 excuse-not-live 로 막는다(index.ts EXCUSE_LIVE_PROD). 두 값을 **함께** true 로 바꾼다. 개발·localhost 는 늘 보인다.
export const EXCUSE_UI_PROD = false;
export const excuseUiOn = (env) => env !== "prod" || EXCUSE_UI_PROD;

const KO = ["영", "한", "두", "세", "네", "다섯", "여섯", "일곱", "여덟", "아홉", "열"];
const ko = (n) => (Number.isInteger(n) && n >= 0 && n <= 10 ? KO[n] : String(n));
const num = (x) => Number(x || 0).toLocaleString("ko-KR");
const md = (d) => { const p = String(d || "").split("-"); return p.length === 3 ? `${Number(p[1])}월 ${Number(p[2])}일` : ""; };
const dot = (d) => { const p = String(d || "").split("-"); return p.length === 3 ? `${p[1]}.${p[2]}` : ""; };
// ISO 시각 → 「10월 30일 14:05」(한국 시각)
export function kstStamp(iso) {
  const t = Date.parse(iso || "");
  if (isNaN(t)) return "";
  const k = new Date(t + 9 * 3600 * 1000).toISOString();
  return `${Number(k.slice(5, 7))}월 ${Number(k.slice(8, 10))}일 ${k.slice(11, 16)}`;
}

// ── 인정 표기(서버 events-elig.ts 사본) ──
export function excuseOf(note) {
  const n = norm(note);
  if (!n.startsWith(EXCUSE_HEAD)) return null;
  const i = n.indexOf(SEP, EXCUSE_HEAD.length);
  const reason = (i < 0 ? n.slice(EXCUSE_HEAD.length) : n.slice(EXCUSE_HEAD.length, i)).trim();
  return reason ? reason : null;
}
export function stripExcuse(note) {
  const n = norm(note);
  if (excuseOf(n) === null) return n;
  const i = n.indexOf(SEP, EXCUSE_HEAD.length);
  return i < 0 ? "" : n.slice(i + SEP.length);
}
// 자격 회차 줄의 메모 창 상한 — 500 − (표기 + 「 / 」). 표기가 없으면 500.
export function noteRestMax(note) {
  const r = excuseOf(note);
  return r === null ? NOTE_MAX : NOTE_MAX - (EXCUSE_HEAD.length + r.length + SEP.length);
}

// ── 창(서버 사본) ──
export function excuseWindow(ev, today) {
  if (today < norm(ev && ev.opens_on)) return "not-open";
  const until = norm(ev && ev.list_until);
  if (until && today > until) return "over";
  return "open";
}
export function missingWindow(ev, today) {
  if (today < norm(ev && ev.opens_on)) return "not-open";
  if (today <= norm(ev && ev.closes_on)) return "open";
  return "closed";
}
// 설계 §3 오류표 「인정은 신청이 열린 날(○월 ○일)부터 할 수 있어요」 — 서버 excuse-not-open 의 opensOn 으로 창(excuse-form.js)도 이 글을 쓴다
//   (ui.js MESSAGES 는 한 벌이라 날짜를 모른다 — 거기엔 날짜 없는 말을 둔다 · 계획이 고른 해석 ⑬)
export const notOpenText = (opensOn) => `인정은 신청이 열린 날(${md(opensOn)})부터 할 수 있어요`;
// 인정 창이 닫힌 까닭 한 줄(열렸으면 "") — 단추를 회색으로 두지 않고 이 글을 보인다(설계 4절)
export function excuseWhy(ev, today, uiOn) {
  const w = excuseWindow(ev, today);
  if (w === "not-open") return notOpenText(ev.opens_on);
  if (w === "over") return "명단 공개가 끝난 회차예요 — 인정은 닫혔어요";
  if (!uiOn) return "인정 기능은 준비 중이에요 — 그동안 사정 문의는 종이에 받아 두세요";
  return "";
}

// ── 글 ──
// 규칙 띠 — 서버 rule 로(화면이 날짜를 박지 않는다)
export function ruleBandText(el) {
  if (!el || el.state === "loading") return "📏 주 수를 세는 중…";
  if (el.state === "error") return el.error === "count-capped"
    ? "주 수를 세지 못했어요 — 활동한 계정이 1,000을 넘었어요(담당 개발자에게 알려 주세요)"
    : "주 수를 세지 못했어요 — ↻ 새로 불러오기를 눌러 주세요";
  if (el.state === "no-rule" || !el.rule) return "자격 규칙을 읽지 못했어요 — 담당 개발자에게 알려 주세요";
  const r = el.rule;
  const head = `📏 도장 기간 ${dot(r.start)} ~ ${dot(r.end)} · 한 주에 ${r.perWeek}일이면 그 주 ✓ · ` +
    `${ko(r.weeks)} 주 중 ${ko(r.need)} 주(이 기간에 처음 오신 분은 ${ko(r.minNeed)} 주)`;
  if (el.state === "before") return `${head} · 측정 전 — ${md(r.start)}부터 셉니다`;
  const now = el.state === "ended" ? `측정 끝(${md(r.end)}) — 이 뒤로는 주 수가 늘지 않아요` : "지금: 측정 중";
  return `${head} · ${now} · ${kstStamp(el.computedAt)} 에 센 값`;
}
// 요약 — 괄호 안 둘은 겹치지 않는다(주로 채움 + 인정으로 = 자격 됨 · 서버 eligCounts)
export function eligSumText(el) {
  const c = el && el.counts;
  if (!c) return "";
  let s = `명단 ${num(c.total)}명 · 자격 됨 ${num(c.ok)}명(주로 채움 ${num(c.byWeeks)} · 인정으로 ${num(c.byExcuse)}) · 계정 없음 ${num(c.noAccount)}명`;
  if (c.perfect != null) s += ` · ✨ ${ko(el.rule && el.rule.weeks)} 주 ${num(c.perfect)}명`;
  if (c.recheckShort) s += ` · 다시 센 값이 모자란 앱 줄 ${num(c.recheckShort)}`;
  return s;
}
// 줄의 주 칸 — er 가 없으면(셈 전·실패) 「—」
export function weekText(r, er) {
  if (!er) return "—";
  const parts = [];
  if (er.weeksDone == null) parts.push("계정 없음 — 주를 셀 수 없어요");
  else {
    parts.push(`${er.weeksDone}/${er.need}주${er.byWeeks ? " ✓" : ""}`);
    // 앱 줄은 신청할 때 서버가 자격을 확인했다 — 다시 센 값이 모자라도 「그때 적어 두었어요」를 부정하지 않게(설계 4절 ⚠️)
    if (r && r.source === "app" && er.byWeeks === false && !er.excused) parts.push("신청 때는 확인됨");
  }
  if (er.excused) parts.push(`✅ 인정 · ${er.excuseReason}`);
  if (er.perfect) parts.push("✨");
  return parts.join(" · ");
}
// 자격 회차 줄 메뉴(설계 4절 일곱 경우) — ctx = { counted: 주 수를 셌나, why: 인정 창이 닫힌 까닭(열렸으면 "") }
export function eligMenuOptions(r, er, ctx) {
  const memo = (hint) => (hint ? { value: "edit", label: "📝 메모 고치기", hint } : { value: "edit", label: "📝 메모 고치기" });
  if (!ctx) return [memo("주 수를 센 뒤에 인정할 수 있어요")];
  if (ctx.why) return [memo(ctx.why)];
  if (!ctx.counted || !er) return [memo("주 수를 센 뒤에 인정할 수 있어요")];
  if (er.excused) {
    return [{ value: "reason", label: "✏️ 인정 사유 고치기", hint: er.excuseReason || "사유를 바꿔요" },
      r.source === "app" ? { value: "unset", label: "↩️ 인정 거두기", hint: "줄은 그대로 남고 인정 표시만 없어져요" }
        : { value: "drop", label: "↩️ 인정 거두고 명단에서 빼기", hint: "담당자가 넣은 줄이라 명단에서도 빠져요" },
      memo("")];
  }
  if (r.source === "app") {
    if (er.byWeeks === false) return [{ value: "excuse", label: "✅ 자격 인정", hint: "신청 때는 서버가 확인했어요 — 선물 명단에 확실히 넣으시려면" }, memo("")];
    return [memo("주로 채우셔서 인정이 필요 없어요")];
  }
  return [{ value: "excuse", label: "✅ 자격 인정", hint: "사유를 적어 인정해요" }, memo("")];
}
// 명단 내려받기에 더할 칸 — 채운 주·필요 주·자격(O)·인정(O) · 끝난 뒤 여섯 주(O). 사유는 싣지 않는다. 모르는 값은 「모름」.
export function eligCsvMore(byId, el) {
  const ended = !!el && el.state === "ended";
  const head = ["채운 주", "필요 주", "자격", "인정", ...(ended ? [`${ko(el.rule && el.rule.weeks)} 주`] : [])];
  const U = "모름";
  const ox = (v) => (v === true ? "O" : v === false ? "" : U);
  return {
    head,
    cells: (r) => {
      const er = byId && byId.get(String(r.id));
      if (!er) return head.map(() => U);
      return [er.weeksDone == null ? U : er.weeksDone, er.need == null ? U : er.need, ox(er.ok), er.excused ? "O" : "",
        ...(ended ? [ox(er.perfect)] : [])];
    },
  };
}
// 👥 머리 한 줄 — 신청 창 전 · 0명 · 실패 · 마감 뒤 수만(넷을 뭉개지 않는다)
export function missingHead(m) {
  if (!m || m.state === "loading") return "불러오는 중…";
  if (m.state === "error") return "불러오지 못했어요";
  if (m.state === "no-rule") return "자격 규칙을 읽지 못했어요";
  if (m.state === "not-open") return `${md(m.opensOn)} 신청이 열린 뒤에 보여요`;
  if (m.state === "closed") return `신청이 마감됐어요 — 자격은 되셨는데 신청하지 않으신 분은 ${num(m.total)}명이었어요`;
  if (!m.total) return "지금은 없어요";
  return `자격은 되셨는데 아직 신청하지 않으신 분 ${num(m.total)}명 · ${kstStamp(m.computedAt)} 기준`;
}
export function missingCsv(rows) {
  const head = ["이름", "구분", "소속", "세부"];
  const body = (rows || []).map((r) => [r.name, r.who_type, r.group, r.sub]);
  return "\uFEFF" + [head, ...body].map((x) => x.map(csvCell).join(",")).join("\r\n");   // BOM 은 글자 그대로 넣지 않고 \uFEFF(roster-logic.js csvText 와 같게)
}
export function missingCsvName(evId, n, now = new Date()) {
  const k = new Date(now.getTime() + 9 * 3600 * 1000).toISOString();
  return `${evId}_미신청_${n}명_${k.slice(0, 10).replace(/-/g, "")}-${k.slice(11, 16).replace(":", "")}.csv`;
}
// 🔎 도장 확인 결과 한 줄(창 3)
export function checkText(c) {
  if (!c) return "";
  if (c.already) return "이미 명단에 있어요 — 그 줄 메뉴(⋯)에서 「✅ 자격 인정」으로 해 주세요";
  if (c.account === "many") return "같은 이름·소속의 앱 계정이 둘 이상이에요 — 먼저 계정을 합쳐야 해요(총괄 관리자에게 말씀해 주세요)";
  if (c.account === "none") return "이 이름·소속으로는 앱 계정을 못 찾았어요 — 종이로 암송하신 분이면 그대로 넣으시고, " +
    "앱을 쓰시는 분이면 앱에 적힌 교구·목장으로 다시 찾아 주세요(다른 소속으로 넣으면 나중에 명단에 두 번 오를 수 있어요)";
  if (c.eligibleNow) return "이미 자격이 되셨어요 — 앱에서 직접 신청하시도록 알려 드려 주세요";
  const weeks = (c.weekFull || []).map((f, i) => `${i + 1}주${f ? " ✓" : ""}`).join(" · ");
  return `앱 계정 찾음 · ${weeks} · 채운 주 ${c.weeksDone} / 필요 ${c.need} · ${c.canReach ? "남은 주로 닿을 수 있어요" : "남은 주로는 닿기 어려워요"}`;
}
// 넣기를 막을 확인 결과 — 서버도 같은 까닭으로 거절한다(already·ambiguous-account·already-eligible) · 확인 전이면 needs-check
export function checkBlock(c) {
  if (!c) return "needs-check";
  if (c.already) return "already";
  if (c.account === "many") return "ambiguous-account";
  if (c.eligibleNow) return "already-eligible";
  return null;
}
export const consentText = (asks, title) =>
  `그분(또는 가족)께 여쭙고, ${title} 명단에 ${asks ? "이름·소속·직분" : "이름과 소속"}이 오르는 것을 허락받았어요`;
```

- [ ] **Step 5: `js/core/ui.js` — `MESSAGES`(Edit 셋)**

① 앵커 `  "too-many": "한 번에 600줄까지 올릴 수 있어요 — 나눠서 올려 주세요",` 줄 **바로 뒤에**:
```js
  // 가을 말씀 동행 자격 인정·미신청(가을 인정 설계 §3 오류 코드) — reason-bad-char 는 bad-char(이름·소속)와 다른 말이다
  "not-eligibility-event": "꾸준함을 재는 회차(가을 말씀 동행 같은)에서만 할 수 있어요",
  "no-rule": "이 회차의 자격 규칙을 읽지 못했어요 — 담당 개발자에게 알려 주세요",
  "excuse-not-open": "인정은 신청이 열린 날부터 할 수 있어요",
  "excuse-period-over": "명단 공개가 끝난 회차예요",
  "excuse-not-live": "인정 기능은 아직 준비 중이에요 — 그동안 사정 문의는 종이에 받아 두세요",
  "needs-consent": "그분께 여쭙고 동의를 받았는지 확인해 주세요",
  "no-reason": "사유를 적어 주세요(빈칸만으로는 안 돼요)",
  "reason-too-long": "사유는 200자까지예요",
  "reason-bad-char": "사유에 띄어 쓴 빗금 「 / 」는 쓸 수 없어요 — 「10/18」처럼 붙여 쓰시면 돼요",
  "ambiguous-account": "같은 이름·소속의 앱 계정이 둘 이상이에요 — 계정을 먼저 합쳐야 해요(총괄 관리자에게 말씀해 주세요)",
  "already-eligible": "이미 자격이 되셨어요 — 앱에서 직접 신청하시도록 알려 드려 주세요",
  "needs-drop": "담당자가 넣은 줄이라 인정을 거두면 명단에서도 빠져요 — 한 번 더 확인해 주세요",
  "excuse-via-memo": "인정은 「✅ 자격 인정」으로 해 주세요(메모로는 바뀌지 않아요)",
  "count-capped": "활동한 계정이 1,000을 넘어 한 번에 세지 못했어요 — 담당 개발자에게 알려 주세요",
  "needs-check": "먼저 「🔎 도장 확인」을 눌러 주세요",
```
② old:
```js
  "app-row-note-only": "앱에서 낸 신청(또는 자격 회차의 줄)은 메모만 고칠 수 있어요",
```
new:
```js
  "app-row-note-only": "앱에서 낸 신청은 메모만, 자격 회차의 줄은 메모와 인정만 고칠 수 있어요",
```
③ old:
```js
  "eligibility-event": "자격 회차(가을 말씀 동행 같은)의 명단은 더하기·올리기·빼기를 하지 않아요 — 메모만 고칠 수 있어요",
```
new:
```js
  "eligibility-event": "자격 회차(가을 말씀 동행 같은)의 명단은 더하기·올리기·빼기를 하지 않아요 — 사정이 있으셨던 분은 「✅ 인정하며 넣기」로",
```

- [ ] **Step 6: `roster-logic.js` — `csvText(rows, more = null)`(Edit 셋)**

① old `export function csvText(rows) {` → new:
```js
// more = { head, cells(r) } — 가을 말씀 동행(자격 회차) 명단은 채운 주·필요 주·자격·인정 칸을 뒤에 더한다(elig-logic.js eligCsvMore)
export function csvText(rows, more = null) {
```
② old `  const head = ["이름", "구분", "소속", "세부", "직분", "출처", "교적"];` → new:
```js
  const head = ["이름", "구분", "소속", "세부", "직분", "출처", "교적", ...(more ? more.head : [])];
```
③ old `    r.church ? [r.church.state, r.church.reason].filter(Boolean).join(" · ") : ""]);` → new:
```js
    r.church ? [r.church.state, r.church.reason].filter(Boolean).join(" · ") : "", ...(more ? more.cells(r) : [])]);
```

- [ ] **Step 7: `roster-ui.js`(Edit 여섯)**

① 앵커 `import { nameButtonHtml } from "./person-logic.js";` 줄 **바로 뒤에**:
```js
// 가을 말씀 동행(자격 회차) — 주 칸·표기 뺀 메모·👥 아직 신청 안 하신 분·줄 메뉴(가을 인정 계획 Task 6)
import { errorText } from "../../core/ui.js";
import { groupRows } from "./roster-logic.js";
import { weekText, stripExcuse, missingHead, eligMenuOptions, MISSING_APPROX, MISSING_NO_ADD, MISSING_FILE_TIP } from "./elig-logic.js";
```
② `export const ELIG_LINE = ` 로 시작하는 한 줄을 **통째로** 바꾼다 — new:
```js
export const ELIG_LINE = `<p class="be-note">🔒 자격 회차예요 — 자격 규칙은 여기서 바꾸지 않습니다 · 한 분 더하기·올리기는 하지 않고, 사정이 있으셨던 분은 「✅ 인정하며 넣기」로만 넣습니다(가을 설계 §12) · 줄은 메모와 인정만 고쳐요</p>`;
```
③ `cardHtml` — old(함수 통째 — `export function cardHtml(r, dup) {` 부터 그 함수의 닫는 `}` 까지):
```js
export function cardHtml(r, dup) {
  const sub = subText(r);
  return `<div class="be-row${dup ? " dup" : ""}"><div class="be-row-h"><div class="be-row-nm">` +
    `${nameButtonHtml(r)}${posHtml(r)}${sub ? `<span class="be-row-sub">${esc(sub)}</span>` : ""}` +
    `<span class="be-badges">${srcHtml(r)}${userHtml(r)}${churchBadgeHtml(r.church)}${dupHtml(dup)}</span></div>${moreHtml(r)}</div>` +
    (r.note ? `<div class="be-memo">📝 ${esc(r.note)} <i>(담당자만 봄)</i></div>` : "") + `</div>`;
}
```
new:
```js
// 가을 말씀 동행 — el = { byId: Map<줄 id, EligOut> }(자격 회차일 때만). 주 칸은 셈 전이면 「—」 · 메모는 인정 표기를 뺀 나머지
// (사유가 주 칸과 메모에 두 번 뜨지 않게 · 서버 noteRest 와 같은 값 — 줄을 고친 뒤에도 옛 값이 남지 않게 늘 note 에서 뗀다)
const wkText = (r, el) => weekText(r, el.byId.get(String(r.id)));
const memoOf = (r, el) => (el ? stripExcuse(r.note) : r.note || "");

export function cardHtml(r, dup, el = null) {
  const sub = subText(r);
  const memo = memoOf(r, el);
  return `<div class="be-row${dup ? " dup" : ""}"><div class="be-row-h"><div class="be-row-nm">` +
    `${nameButtonHtml(r)}${posHtml(r)}${sub ? `<span class="be-row-sub">${esc(sub)}</span>` : ""}` +
    `<span class="be-badges">${srcHtml(r)}${userHtml(r)}${churchBadgeHtml(r.church)}${dupHtml(dup)}</span></div>${moreHtml(r)}</div>` +
    (el ? `<div class="be-el-wk">📏 ${esc(wkText(r, el))}</div>` : "") +
    (memo ? `<div class="be-memo">📝 ${esc(memo)} <i>(담당자만 봄)</i></div>` : "") + `</div>`;
}
```
④ `tableHtml` — old(함수 통째):
```js
export function tableHtml(groups, dups) {
  const head = `<tr><th>이름</th><th>소속</th><th>직분</th><th>출처</th><th>교적</th><th>담당자 메모</th><th><span class="be-sr">고치기·빼기</span></th></tr>`;
  const body = groups.map((g) => `<tbody><tr class="be-tgrp"><th colspan="7" scope="colgroup">${esc(g.label)} <em>${num(g.rows.length)}명</em></th></tr>` +
    g.rows.map((r) => `<tr${dups.has(r.id) ? ` class="dup"` : ""}><td>${nameButtonHtml(r)} ${dupHtml(dups.has(r.id))}</td>` +
      `<td>${esc(subText(r))}</td><td>${esc(r.position || "")}</td><td>${srcHtml(r)} ${userHtml(r)}</td>` +
      `<td>${churchBadgeHtml(r.church)}</td><td class="be-tnote">${esc(r.note || "")}</td><td>${moreHtml(r)}</td></tr>`).join("") +
    `</tbody>`).join("");
  return `<div class="be-tbl-wrap"><table class="be-table"><thead>${head}</thead>${body}</table></div>`;
}
```
new:
```js
export function tableHtml(groups, dups, el = null) {
  const n = el ? 8 : 7;   // 자격 회차는 「주」 칸 하나(직분 뒤)
  const head = `<tr><th>이름</th><th>소속</th><th>직분</th>${el ? "<th>주</th>" : ""}<th>출처</th><th>교적</th><th>담당자 메모</th><th><span class="be-sr">고치기·빼기</span></th></tr>`;
  const body = groups.map((g) => `<tbody><tr class="be-tgrp"><th colspan="${n}" scope="colgroup">${esc(g.label)} <em>${num(g.rows.length)}명</em></th></tr>` +
    g.rows.map((r) => `<tr${dups.has(r.id) ? ` class="dup"` : ""}><td>${nameButtonHtml(r)} ${dupHtml(dups.has(r.id))}</td>` +
      `<td>${esc(subText(r))}</td><td>${esc(r.position || "")}</td>${el ? `<td class="be-el-td">${esc(wkText(r, el))}</td>` : ""}` +
      `<td>${srcHtml(r)} ${userHtml(r)}</td>` +
      `<td>${churchBadgeHtml(r.church)}</td><td class="be-tnote">${esc(memoOf(r, el))}</td><td>${moreHtml(r)}</td></tr>`).join("") +
    `</tbody>`).join("");
  return `<div class="be-tbl-wrap"><table class="be-table"><thead>${head}</thead>${body}</table></div>`;
}
```
⑤ `listHtml` — old(함수 통째):
```js
export function listHtml(groups, dups, wide) {
  if (!groups.length) return `<p class="empty">조건에 맞는 줄이 없어요</p>`;
  if (wide) return tableHtml(groups, dups);
  return groups.map((g) => `<section class="be-grp" aria-label="${esc(g.label)}"><h3 class="be-grp-h">${esc(g.label)} <em>${num(g.rows.length)}명</em></h3>` +
    g.rows.map((r) => cardHtml(r, dups.has(r.id))).join("") + `</section>`).join("");
}
```
new:
```js
export function listHtml(groups, dups, wide, el = null) {
  if (!groups.length) return `<p class="empty">조건에 맞는 줄이 없어요</p>`;
  if (wide) return tableHtml(groups, dups, el);
  return groups.map((g) => `<section class="be-grp" aria-label="${esc(g.label)}"><h3 class="be-grp-h">${esc(g.label)} <em>${num(g.rows.length)}명</em></h3>` +
    g.rows.map((r) => cardHtml(r, dups.has(r.id), el)).join("") + `</section>`).join("");
}
```
⑥ `rowMenuOptions` — old(함수 통째 · 머리 주석 한 줄은 그대로 둔다):
```js
export function rowMenuOptions(r, ev) {
  if (r.source === "app") return [{ value: "edit", label: "📝 메모 고치기", hint: "성도님이 앱에서 낸 신청이라 메모만 고칠 수 있어요 · 빼기는 성도님이 앱에서 해요" }];
  if (ev.hasEligibility) return [{ value: "edit", label: "📝 메모 고치기", hint: "자격 회차의 줄이라 메모만 고칠 수 있어요" }];
  return [{ value: "edit", label: "✏️ 고치기", hint: "이름·소속·직분·메모" },
    { value: "del", label: "🗑 빼기", hint: "한 번 더 확인한 뒤 빠져요" }];
}
```
new:
```js
// el(자격 회차일 때) = { counted: 주 수를 셌나, why: 인정 창이 닫힌 까닭("" 이면 열림), row: 그 줄의 EligOut } — elig-logic.js eligMenuOptions
export function rowMenuOptions(r, ev, el = null) {
  if (ev.hasEligibility) return eligMenuOptions(r, el && el.row, el);
  if (r.source === "app") return [{ value: "edit", label: "📝 메모 고치기", hint: "성도님이 앱에서 낸 신청이라 메모만 고칠 수 있어요 · 빼기는 성도님이 앱에서 해요" }];
  return [{ value: "edit", label: "✏️ 고치기", hint: "이름·소속·직분·메모" },
    { value: "del", label: "🗑 빼기", hint: "한 번 더 확인한 뒤 빠져요" }];
}

// ---- 가을 말씀 동행(자격 회차) 조각(가을 인정 계획 Task 6) ----
// 규칙 띠·요약 자리(roster.js 가 셈을 받은 뒤 채운다) · 인정 창이 닫힌 까닭 한 줄 · 👥 접힘 칸(열 때 부른다 — 이름을 미리 받지 않는다)
export function eligStaticHtml(why) {
  return `<p class="be-el-rule" aria-live="polite"></p><p class="muted be-el-sum"></p>` +
    (why ? `<p class="be-note be-el-why">${esc(why)}</p>` : "") +
    `<details class="be-miss"><summary>👥 아직 신청 안 하신 분(자격은 되셨어요)</summary>` +
    `<div class="be-miss-b"><p class="muted">열면 불러와요</p></div></details>`;
}
// 👥 접힘 칸 속 — 넷 상태(신청 창 전·0명·실패·마감 뒤 수만)를 뭉개지 않는다 · 이름은 명단과 같은 이름 단추(교적 창) · 넣기 단추는 없다
export function missingBodyHtml(m) {
  const head = `<p class="be-miss-h">${esc(missingHead(m))}</p>`;
  if (m && m.state === "error") {
    return head + `<p class="be-warn">${esc(errorText({ error: m.error }))}</p>` +
      `<button type="button" class="btn" data-act="miss-reload">↻ 다시 불러오기</button>`;
  }
  if (!m || m.state !== "open" || !(m.rows || []).length) return head;
  return head + `<p class="muted">${esc(MISSING_APPROX)}</p><p class="be-note">${esc(MISSING_NO_ADD)}</p>` +
    groupRows(m.rows).map((g) => `<section class="be-grp" aria-label="${esc(g.label)}"><h3 class="be-grp-h">${esc(g.label)} <em>${num(g.rows.length)}명</em></h3>` +
      g.rows.map((r) => `<div class="be-row"><div class="be-row-h"><div class="be-row-nm">${nameButtonHtml(r)}` +
        `${subText(r) ? `<span class="be-row-sub">${esc(subText(r))}</span>` : ""}</div></div></div>`).join("") + `</section>`).join("") +
    `<div class="adm-acts"><button type="button" class="btn" data-act="miss-csv">⬇️ 이 목록 내려받기</button></div>` +
    `<p class="be-hint">${esc(MISSING_FILE_TIP)}</p>`;
}
```

- [ ] **Step 8: `row-form.js` — 자격 회차 줄의 메모 창(Edit 다섯)**

① 앵커 `import { GU_ORDER, ROW_KEYS, NOTE_FORM_MAX, NOTE_EDIT_MAX, norm, whoText, rowPatch } from "./roster-logic.js";` 줄 **바로 뒤에**:
```js
// 가을 말씀 동행(자격 회차) 줄의 메모 창 — 인정 표기를 뺀 나머지만(가을 인정 계획 Task 6)
import { noteRestMax, stripExcuse } from "./elig-logic.js";
```
② old `    : "🔒 자격 회차의 줄이라 메모만 고칠 수 있어요";` → new:
```js
    : "🔒 자격 회차의 줄이라 여기서는 메모만 고쳐요 — 인정은 줄 메뉴의 「✅ 자격 인정」으로 해요(인정 표기는 서버가 지켜요)";
```
③ 앵커 `    : { who_type: "교구", group: "", sub: "", name: "", position: "", note: "" };` 줄 **바로 뒤에**:
```js
  // 가을 말씀 동행(자격 회차) 줄 — 메모 창은 인정 표기(「자격 인정: 사유」)를 뺀 나머지만 보이고, 서버가 표기를 다시 붙인다(가을 인정 설계 §2).
  //   상한은 500 − (표기 + 「 / 」) — 표기가 앞에 붙어도 서버 500자에 걸리지 않게. 바뀐 것은 나머지끼리 견준다.
  const eligRow = !!row && !!ev.hasEligibility;
  if (eligRow) init.note = stripExcuse(row.note);
  const noteMax = eligRow ? noteRestMax(row.note) : NOTE_EDIT_MAX;
```
④ old `noteField(init.note, NOTE_EDIT_MAX)` → new `noteField(init.note, noteMax)`
⑤ old `      const patch = rowPatch(row, v, noteOnly ? ["note"] : ROW_KEYS);` → new:
```js
      const patch = rowPatch(eligRow ? { ...row, note: init.note } : row, v, noteOnly ? ["note"] : ROW_KEYS);
```

- [ ] **Step 9: `roster.js`(Edit 열)**

① 앵커 `import { personPayload } from "./person-logic.js";` 줄 **바로 뒤에**:
```js
// 가을 말씀 동행(자격 회차) — 규칙 띠·요약·주 칸·👥 아직 신청 안 하신 분·내려받기 칸(가을 인정 계획 Task 6)
import { eligCsvMore, eligSumText, excuseUiOn, excuseWhy, missingCsv, missingCsvName, ruleBandText } from "./elig-logic.js";
import { eligStaticHtml, missingBodyHtml } from "./roster-ui.js";
// 2단계(쓰기)를 운영에서 여는 날까지 운영 화면은 인정 단추를 숨긴다(elig-logic.js EXCUSE_UI_PROD) — 개발·localhost 는 늘 보인다
const uiOn = () => excuseUiOn(globalThis.SUPA && globalThis.SUPA.env);
```
② 앵커 `  const events = sortEvents(evs.events || []);` 줄 **바로 뒤에**:
```js
  const today = String(evs.today || "");   // 한국 날짜(서버 kstToday) — 인정 창·미신청 창을 화면도 같은 날로 본다
```
③ old `      ${ev.hasEligibility ? ELIG_LINE : ""}` → new:
```js
      ${ev.hasEligibility ? ELIG_LINE + eligStaticHtml(excuseWhy(ev, today, uiOn())) : ""}
```
④ 앵커 `  const find = (id) => rows.find((x) => String(x.id) === String(id));` 줄 **바로 뒤에**:
```js
  // 가을 말씀 동행 — 주 수는 명단과 따로 부른다(셈이 실패해도 명단은 보인다 · 가을 인정 설계 §3). 「모름」을 0 으로 그리지 않는다.
  let elig = ev.hasEligibility ? { state: "loading" } : null;
  let eligById = new Map();
  let missing = null;   // 👥 아직 신청 안 하신 분 — 접힘 칸을 처음 열 때 부른다(명단을 열 때마다 이름을 받지 않는다)
  const eligView = () => (ev.hasEligibility ? { byId: eligById } : null);
```
⑤ old `    list.innerHTML = listHtml(groups, dups, mqWide.matches);` → new:
```js
    list.innerHTML = listHtml(groups, dups, mqWide.matches, eligView());
    if (ev.hasEligibility) {
      el.querySelector(".be-el-rule").textContent = ruleBandText(elig);
      el.querySelector(".be-el-sum").textContent = eligSumText(elig);
    }
```
⑥ old `    download(csvText(vis), \`${ev.id}_명단_${vis.length}명_${stamp()}.csv\`);` → new:
```js
    download(ev.hasEligibility ? csvText(vis, eligCsvMore(eligById, elig)) : csvText(vis), `${ev.id}_명단_${vis.length}명_${stamp()}.csv`);
```
⑦ 앵커 `  async function pickFilter(b) {` 줄 **바로 앞에**:
```js
  // 가을 말씀 동행 — 주 수·자격·인정(evEligRows)
  async function loadElig() {
    const r = await call("evEligRows", { event_id: ev.id });
    if (!el.isConnected) return;
    elig = r.ok ? r : { state: "error", error: r.error };
    eligById = new Map((r.ok && Array.isArray(r.rows) ? r.rows : []).map((x) => [String(x.id), x]));
    draw();
  }
  // 👥 아직 신청 안 하신 분(evEligMissing — 부를 때마다 서버가 event.missing 을 남긴다)
  async function loadMissing() {
    const box = el.querySelector(".be-miss-b");
    if (!box) return;
    missing = { state: "loading" };
    box.innerHTML = missingBodyHtml(missing);
    const r = await call("evEligMissing", { event_id: ev.id });
    if (!el.isConnected) return;
    missing = r.ok ? r : { state: "error", error: r.error };
    box.innerHTML = missingBodyHtml(missing);
  }
  function exportMissing() {
    const list = missing && missing.state === "open" ? groupRows(missing.rows || []).flatMap((g) => g.rows) : [];
    if (!list.length) { toast("내려받을 줄이 없어요"); return; }
    download(missingCsv(list), missingCsvName(ev.id, list.length));
    toast(`⬇️ ${list.length}분을 내려받았어요 — 알려 드린 뒤에는 파일을 지워 주세요`);
  }
```
⑧ 앵커 `    else if (act === "csv") exportCsv();` 줄 **바로 뒤에**:
```js
    else if (act === "miss-csv") exportMissing();
    else if (act === "miss-reload") loadMissing();
```
⑨ 앵커 `  // <details> 의 toggle 은 거품이 일지 않는다 — 잡는 단계(capture)에서 받는다` 줄 **바로 앞에**:
```js
  // 👥 접힘 칸 — 처음 열 때만 부른다(닫았다 다시 열면 받은 것을 그대로 · 「↻ 새로 불러오기」면 새로)
  el.addEventListener("toggle", (e) => {
    if (e.target instanceof Element && e.target.matches("details.be-miss") && e.target.open && !missing) loadMissing();
  }, true);
```
⑩ 파일 끝 — old(두 줄 + 닫는 괄호):
```js
mqWide.addEventListener("change", onMq);
  draw();
}
```
new:
```js
mqWide.addEventListener("change", onMq);
  draw();
  if (ev.hasEligibility) loadElig();   // 셈은 명단을 그린 뒤 따로(실패해도 명단은 보인다)
}
```
(⑩ 의 old 는 앞 줄의 끝 조각 `mqWide.addEventListener("change", onMq);` 부터 잡는다 — 그 줄 머리는 be-polish 판에 따라 다르다.)

- [ ] **Step 10: `css/admin.css` — `.be-pp-note` 줄 뒤**

앵커 `.be-pp-note{padding:8px 10px;border-radius:8px;background:var(--ghost-bg);color:var(--navy);font-size:13px;line-height:1.5}` 줄 **바로 뒤에**:
```css
/* 가을 말씀 동행(자격 회차) — 규칙 띠·요약·주 칸·👥 아직 신청 안 하신 분(가을 인정 계획 Task 6) · 320px 에서도 옆으로 넘치지 않게 */
.be-el-rule{margin:0 0 8px;padding:9px 12px;border-radius:10px;background:var(--light);color:var(--navy-dark);font-size:14px;line-height:1.55;overflow-wrap:anywhere}
.be-el-sum{margin:0 0 12px;font-size:14px;line-height:1.55;overflow-wrap:anywhere}
.be-el-sum:empty{display:none}
.be-el-wk{margin-top:6px;font-size:14px;color:var(--navy-dark);overflow-wrap:anywhere}
.be-el-td{min-width:7em;font-size:14px}
.be-miss{margin:0 0 12px;border:1px solid var(--border);border-radius:10px;background:var(--cream)}
.be-miss>summary{list-style:none;display:flex;align-items:center;min-height:var(--tap);padding:0 12px;cursor:pointer;font-size:15px;font-weight:700;color:var(--navy)}
.be-miss>summary::-webkit-details-marker{display:none}
.be-miss[open]>summary{border-bottom:1px solid var(--border)}
.be-miss-b{padding:10px 12px 12px}
.be-miss-h{margin:0 0 8px;font-size:14px;font-weight:700;color:var(--navy);overflow-wrap:anywhere}
```

- [ ] **Step 11: 통과 · preflight · 커밋**

```bash
cd /c/Projects/church-admin/.worktrees/autumn-excuse
node --experimental-strip-types --test tests/be-elig-logic.test.mjs tests/be-roster-ui.test.mjs tests/be-roster-logic.test.mjs 2>&1 | tail -4
grep -rnE 'alert\(|confirm\(|prompt\(|<select|type="date"' js/menus/bibleevent/elig-logic.js js/menus/bibleevent/roster.js js/menus/bibleevent/roster-ui.js || echo "시스템 창 없음"
python tools/preflight.py | tail -1
git add js/menus/bibleevent/elig-logic.js js/menus/bibleevent/roster-ui.js js/menus/bibleevent/roster.js js/menus/bibleevent/row-form.js \
  js/menus/bibleevent/roster-logic.js js/core/ui.js css/admin.css tests/be-elig-logic.test.mjs tests/be-roster-ui.test.mjs
git commit -F - <<'EOF'
feat(성경필사): 가을 말씀 동행 화면(읽기) — 규칙 띠·요약(주로 채움+인정으로=자격 됨)·줄마다 주 칸·표기 뺀 메모·👥 아직 신청 안 하신 분·내려받기 칸 · 오류 말

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
git show --stat HEAD
```
Expected: `# fail 0` · `시스템 창 없음` · `모두 통과` · 파일 아홉.

---

### Task 7: 화면 — 인정 창 셋(`excuse-form.js`) · 줄 메뉴 · 「✅ 인정하며 넣기」 · 팝업 없음 검사

이 과제가 끝나면(개발·localhost) 자격 회차 화면에 인정 창이 열린 동안 「✅ 인정하며 넣기」가 보이고, 줄 메뉴에 「✅ 자격 인정」·「✏️ 인정 사유 고치기」·「↩️ 인정 거두기」(담당자 줄은 「↩️ 인정 거두고 명단에서 빼기」)가 설계 4절 일곱 경우대로 뜬다. 운영 화면은 `EXCUSE_UI_PROD = false` 라 까닭 한 줄만 보인다.

**Files:**
- Create: `js/menus/bibleevent/excuse-form.js` · `tests/be-excuse-form.test.mjs`
- Modify: `js/menus/bibleevent/roster.js` — import 한 줄 · `.adm-acts` 한 줄 · `rowMenu` 머리 · 새 함수 하나 · click 한 줄
- Modify: `css/admin.css` — Task 6 CSS 뒤(앵커 `.be-miss-h{…}` 줄)

**Interfaces:**
- Consumes:
  - 서버(Task 4): `evExcuseCheck`·`evExcuseAdd`·`evExcuseSet`(모양은 Task 4 Interfaces) · 기존 `evPeopleLookup {name}` → `{ok, source:{date,total}|null, people:[{name, who_type, group, sub, position}]}`
  - Task 6 `elig-logic.js`: `APP_NOTE`·`CHECK_LOG_TIP`·`EXCUSE_CHIPS`·`EXCUSE_REASON_MAX`·`REASON_TIP`·`SPLIT_CHIP`·`SPLIT_NOTE`·`checkBlock`·`checkText`·`consentText`·`notOpenText`·`weekText`·`excuseWhy` · `roster.js` 안의 `today`·`uiOn()`·`elig`·`eligById`·`reload()`·`stale(code)` · `roster-ui.js` `rowMenuOptions(r, ev, el)`
  - 기존: `js/core/modal.js` `openForm({title, html, okLabel, cancelLabel, danger, onOpen(root), isDirty(root), onSubmit(root)})` — `onSubmit` 이 `{ok:true, value}` 면 닫고 value · `{ok:false, error|message}` 면 창 안 빨간 줄 · `{ok:false}` 면 그대로 · `js/core/picker.js` `pickOne({anchor, title, options:[{value,label,hint?}], value})` → 값 | `null` · `ui.js` `esc`·`toast`·`dialog`·`errorText` · `roster-logic.js` `GU_ORDER`·`norm`·`whoText`
- Produces: `excuse-form.js` — `openExcuseSet({call, row, er, onStale}) → Promise<RowOut|null>` · `openExcuseUnset({call, row, onStale}) → Promise<object|null>` · `openExcuseAdd({call, ev, asksPosition, onStale}) → Promise<RowOut|null>`

- [ ] **Step 1: 선행 확인**

```bash
cd /c/Projects/church-admin/.worktrees/autumn-excuse
node --input-type=module -e "
const m = await import('./js/menus/bibleevent/elig-logic.js');
for (const k of ['APP_NOTE','CHECK_LOG_TIP','EXCUSE_CHIPS','EXCUSE_REASON_MAX','REASON_TIP','SPLIT_CHIP','SPLIT_NOTE','checkBlock','checkText','consentText','notOpenText','weekText','excuseWhy'])
  if (typeof m[k] === 'undefined') throw new Error('elig-logic.js 에 ' + k + ' 가 없다');
console.log('Task 6 이름 모두 있음');"
B=js/menus/bibleevent
c() { printf '%s  %s  <- %s\n' "$(grep -cF -- "$2" "$1")" "$2" "$1"; }
c $B/roster.js 'import { eligStaticHtml, missingBodyHtml } from "./roster-ui.js";'
c $B/roster.js '      <div class="adm-acts">${ev.hasEligibility ? "" : `<button type="button" class="btn primary" data-act="add">＋ 한 분 더하기</button>`}'
c $B/roster.js '    const pick = await pickOne({ anchor: b, title: `${r.name}님 줄`, options: rowMenuOptions(r, ev) });'
c $B/roster.js '    if (!pick || !el.isConnected) return;'
c $B/roster.js '  async function rowMenu(b) {'
c $B/roster.js '    else if (act === "add") addRow();'
c css/admin.css '.be-miss-h{margin:0 0 8px;font-size:14px;font-weight:700;color:var(--navy);overflow-wrap:anywhere}'
ls $B/excuse-form.js tests/be-excuse-form.test.mjs 2>&1 | grep -c "No such file"
```
Expected: `Task 6 이름 모두 있음` · 앵커 일곱 줄 모두 `1` · 마지막 `2`. (`    if (!pick || !el.isConnected) return;` 가 `1` 이 아니면 Step 5 ③ 은 바로 앞 `const pick …` 줄과 함께 두 줄을 앵커로 잡는다 — 아래 old 가 그 두 줄이다.)

- [ ] **Step 2: 실패하는 시험 — `tests/be-excuse-form.test.mjs`(Write)**

```js
// 인정 창 셋(js/menus/bibleevent/excuse-form.js) — Node 에서 읽히는지 · 성경필사(암송) 화면 어디에도 시스템 창·<select>·날짜 칸이 없는지
// (가을 인정 계획 Task 7). 창을 여닫는 동작은 헤드리스 확인(Task 10)이 본다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

test("excuse-form.js 가 Node 에서 읽힌다 — 창 셋을 내보낸다 · 회차·명단 화면도 함께 읽힌다", async () => {
  const m = await import("../js/menus/bibleevent/excuse-form.js");
  for (const k of ["openExcuseSet", "openExcuseUnset", "openExcuseAdd"]) assert.equal(typeof m[k], "function", k);
  const r = await import("../js/menus/bibleevent/roster.js");
  assert.equal(typeof r.render, "function");
});

test("성경필사(암송) 화면에 브라우저·시스템 창이 없다 — alert·confirm·prompt·<select>·날짜·시각 칸·datalist·beforeunload(주석은 빼고 본다)", () => {
  const dir = new URL("../js/menus/bibleevent/", import.meta.url);
  const bad = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".js"))) {
    const src = readFileSync(new URL(f, dir), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const re of [/\balert\(/, /\bconfirm\(/, /\bprompt\(/, /<select/i, /type=["']?(date|time)\b/i, /\bdatalist\b/i, /beforeunload/])
      if (re.test(src)) bad.push(`${f}: ${re}`);
  }
  assert.deepEqual(bad, []);
});
```
```bash
cd /c/Projects/church-admin/.worktrees/autumn-excuse
node --experimental-strip-types --test tests/be-excuse-form.test.mjs
```
Expected: FAIL — 첫 시험 `Cannot find module …/excuse-form.js` · 둘째는 통과 · `# fail 1`.

- [ ] **Step 3: `js/menus/bibleevent/excuse-form.js`(Write)**

```js
// ✅ 가을 말씀 동행 자격 인정 — 직접 만든 창 셋(js/core/modal.js openForm · row-form.js 와 같은 꼴 · 가을 인정 계획 Task 7).
// 설계: v2 docs/superpowers/specs/2026-09-30-church-admin-autumn-excuse-design.md §4 「창 셋」.
//   ① openExcuseSet — 있는 줄에 ✅ 자격 인정 / ✏️ 인정 사유 고치기(evExcuseSet excused:true)
//   ② openExcuseUnset — ↩️ 인정 거두기(앱 줄 — 표기만) / 인정 거두고 명단에서 빼기(담당자 줄 — drop:true) · 한 창 두 단계
//   ③ openExcuseAdd — ✅ 인정하며 넣기: ① 누구(교인명부 찾기 → pickOne) ② 🔎 도장 확인(evExcuseCheck — 기록에 남는다) ③ 사유 + 동의 칸
// ⚠️ 브라우저·시스템 창 없음 — 고르기는 picker.js pickOne, 동의는 <label> 안 checkbox(📤 올리기의 「빈칸 채우기」와 같은 모양).
// ⚠️ 판정은 서버가 처음부터 다시 한다(도장 확인 결과를 믿지 않는다) — 창은 적은 그대로 보내고 서버 코드를 창 안 빨간 줄로 보인다.
// ⚠️ 사유는 담당자만 보고, 바꾼 기록(event.excuse)에는 「적었다」만 남는다 — 병명은 적지 않게 안내한다.
// ⚠️ 다른 분이 먼저 바꿨거나 성도님이 앱에서 취소하셨으면(conflict·not-found) 창 안에 알리고, 창이 닫히면 onStale(code).
import { esc, toast, dialog, errorText } from "../../core/ui.js";
import { openForm } from "../../core/modal.js";
import { pickOne } from "../../core/picker.js";
import { GU_ORDER, norm, whoText } from "./roster-logic.js";
import { APP_NOTE, CHECK_LOG_TIP, EXCUSE_CHIPS, EXCUSE_REASON_MAX, REASON_TIP, SPLIT_CHIP, SPLIT_NOTE,
  checkBlock, checkText, consentText, notOpenText, weekText } from "./elig-logic.js";

const STALE = {
  conflict: "다른 분이 먼저 이 줄을 바꿨어요 — 「닫기」를 누르면 새로 불러올게요",
  "not-found": "이 줄(회차)을 찾지 못했어요 — 다른 분이 뺐거나 성도님이 앱에서 취소하셨을 수 있어요. 「닫기」를 누르면 새로 불러올게요",
};
// 서버 거절 → 창 안 빨간 줄. 인정 창이 아직 안 열렸으면(excuse-not-open) 서버가 준 opensOn 으로 날짜를 적는다
// (설계 §3 오류표 「인정은 신청이 열린 날(○월 ○일)부터 …」 — ui.js MESSAGES 는 날짜를 모른다 · 계획이 고른 해석 ⑬)
const refusal = (r) => (r && r.error === "excuse-not-open" && r.opensOn ? { ok: false, message: notOpenText(r.opensOn) } : r);

// 사유 칸 · 미리 고르는 말 칩(누르면 칸을 채운다 — 고칠 수 있다) · 병명 안내 · 「계정이 갈림」이면 합치기 먼저 한 줄
function reasonHtml(v) {
  return `<label class="field"><span>인정 사유 <small>(꼭 적어요 · ${EXCUSE_REASON_MAX}자까지 · 지금 <b data-count>0</b>자)</small></span>` +
    `<input data-f="reason" value="${esc(v)}" maxlength="${EXCUSE_REASON_MAX}" autocomplete="off" placeholder="예: 10월 3주 입원"></label>` +
    `<div class="be-el-chips" role="group" aria-label="미리 고르는 말">${EXCUSE_CHIPS.map((c) =>
      `<button type="button" class="be-el-chip" data-chip="${esc(c)}">${esc(c)}</button>`).join("")}</div>` +
    `<p class="be-hint">${esc(REASON_TIP)} · 사유는 담당자만 보고, 바꾼 기록에는 적었다는 것만 남아요</p>` +
    `<p class="be-note" data-split hidden>${esc(SPLIT_NOTE)}</p>`;
}
function wireReason(root) {
  const input = root.querySelector('[data-f="reason"]'), count = root.querySelector("[data-count]");
  const upd = () => { count.textContent = String(input.value.length); };
  root.addEventListener("click", (e) => {
    const c = e.target.closest("[data-chip]");
    if (!c) return;
    input.value = c.dataset.chip;
    root.querySelector("[data-split]").hidden = c.dataset.chip !== SPLIT_CHIP;
    upd();
    input.focus({ preventScroll: true });
  });
  input.addEventListener("input", upd);
  upd();
}
const readReason = (root) => norm(root.querySelector('[data-f="reason"]').value);
const roHtml = (row, er) => `<div class="be-ro"><b>${esc(row.name)}</b> <span>${esc(whoText(row))}</span>` +
  (er ? ` <span>${esc(weekText(row, er))}</span>` : "") + `</div>`;

// ① 있는 줄에 인정 / 사유 고치기 → 고친 줄(RowOut) · 닫거나 바뀐 것이 없으면 null
export async function openExcuseSet({ call, row, er = null, onStale = null } = {}) {
  const editing = !!(er && er.excused);
  let first = "", staleCode = "";
  const out = await openForm({
    title: editing ? "✏️ 인정 사유 고치기" : "✅ 자격 인정",
    okLabel: editing ? "사유 바꾸기" : "인정하기",
    html: roHtml(row, er) + reasonHtml(editing ? er.excuseReason : ""),
    onOpen: (root) => { wireReason(root); first = readReason(root); },
    isDirty: (root) => readReason(root) !== first,
    onSubmit: async (root) => {
      const r = await call("evExcuseSet", { id: row.id, expect: row.updated_at, excused: true, reason: readReason(root) });
      if (!r.ok && STALE[r.error]) { staleCode = r.error; return { ok: false, message: STALE[r.error] }; }
      return r.ok ? { ok: true, value: r.row } : refusal(r);
    },
  });
  if (!out) { if (staleCode && onStale) onStale(staleCode); return null; }
  toast(editing ? "✏️ 인정 사유를 고쳤어요" : `✅ ${row.name} 님을 인정했어요`);
  return out;
}

// ② 인정 거두기 — 한 창 두 단계(① 무엇을 거두는지 ② 「네, 거둡니다」). 담당자 줄이면 제목부터 「명단에서도 빠져요」 → drop:true.
export async function openExcuseUnset({ call, row, onStale = null } = {}) {
  const drop = row.source !== "app";
  let step = 1, staleCode = "";
  const out = await openForm({
    title: drop ? "↩️ 인정을 거두면 명단에서도 빠져요" : "↩️ 인정을 거둘까요?",
    okLabel: drop ? "거두고 빼기" : "거두기", cancelLabel: "그만두기", danger: true,
    html: roHtml(row, null) +
      `<p class="be-hint">${drop ? "담당자가 인정하며 넣은 줄이라, 인정을 거두면 줄이 명단에서 빠지고 성도님 앱의 명단에서도 사라져요"
        : "성도님이 앱에서 낸 신청이라 줄은 그대로 남고 인정 표시만 없어져요"}</p>` +
      `<p class="be-warn" data-step2 hidden>⚠️ 마지막 확인이에요 — 「네, 거둡니다」를 누르면 바로 바뀌어요</p>`,
    onSubmit: async (root) => {
      if (step === 1) {
        step = 2;
        root.querySelector("[data-step2]").hidden = false;
        root.querySelector(".be-ok").textContent = "네, 거둡니다";
        // 두 번 톡톡 눌러 두 단계가 한꺼번에 지나가지 않게 — 창이 onSubmit 동안 단추를 잠그므로 잠긴 채 잠깐 둔다
        await new Promise((res) => setTimeout(res, 600));
        return { ok: false };
      }
      const r = await call("evExcuseSet", { id: row.id, expect: row.updated_at, excused: false, drop });
      if (!r.ok && STALE[r.error]) { staleCode = r.error; return { ok: false, message: STALE[r.error] }; }
      return r.ok ? { ok: true, value: r } : refusal(r);
    },
  });
  if (!out) { if (staleCode && onStale) onStale(staleCode); return null; }
  toast(drop ? "↩️ 인정을 거두고 명단에서 뺐어요" : "↩️ 인정을 거뒀어요");
  return out;
}

// ③ 인정하며 넣기 — 누구 칸(구분·교구·목장 / 부서·학년 · 직분은 회차가 받을 때만)
function whoHtml(asks) {
  return `<div class="field"><span>이름</span><div class="be-find">` +
      `<input data-f="name" maxlength="40" autocomplete="off" enterkeyhint="search" aria-label="이름">` +
      `<button type="button" class="btn" data-act="find">🔎 찾기</button></div></div>` +
    `<p class="be-hint" data-find aria-live="polite">이름을 적고 「찾기」를 누르면 교인명부에서 고를 수 있어요 · 찾은 이름은 교인명부 열람 기록에 남아요</p>` +
    `<input type="hidden" data-f="who_type" value="교구">` +
    `<div class="seg" role="group" aria-label="구분"><button type="button" data-t="교구" class="on" aria-pressed="true">교구</button>` +
      `<button type="button" data-t="교회학교" aria-pressed="false">교회학교</button></div>` +
    `<div data-for="교구"><div class="field"><span>교구</span><input type="hidden" data-f="gu" value="">` +
      `<button type="button" class="pk-field empty" data-pick="gu" aria-haspopup="dialog" aria-expanded="false"><span class="pk-field-v">교구 고르기</span>` +
      `<span class="pk-field-x" aria-hidden="true"></span></button></div>` +
      `<label class="field"><span>목장 <small>(숫자 또는 남성 · 모르면 비워 두기 · 앱에 적힌 소속으로)</small></span>` +
      `<input data-f="mok" maxlength="40" autocomplete="off"></label></div>` +
    `<div data-for="교회학교" hidden><label class="field"><span>부서 <small>(예: 청년부 · 중등부)</small></span>` +
      `<input data-f="bu" maxlength="40" autocomplete="off"></label>` +
      `<label class="field"><span>학년·세부 <small>(모르면 비워 두기)</small></span><input data-f="grade" maxlength="40" autocomplete="off"></label></div>` +
    (asks ? `<label class="field"><span>직분 <small>(이 회차는 직분을 받아요)</small></span><input data-f="position" maxlength="40" autocomplete="off"></label>` : "");
}
function readWho(root) {
  const g = (k) => norm(root.querySelector(`[data-f="${k}"]`)?.value);
  const t = g("who_type") === "교회학교" ? "교회학교" : "교구";
  const gu = t === "교구";
  return { who_type: t, group: gu ? g("gu") : g("bu"), sub: gu ? g("mok") : g("grade"), name: g("name"), position: g("position") };
}

// → 넣은 줄(RowOut) · 닫으면 null
export async function openExcuseAdd({ call, ev, asksPosition = false, onStale = null } = {}) {
  let first = "", staleCode = "", check = null, extra = null, seq = 0;
  const title = ev.short_title || ev.title || "이 회차";
  const snap = (root) => JSON.stringify([readWho(root), readReason(root), root.querySelector('[data-f="consent"]').checked]);
  const out = await openForm({
    title: "✅ 인정하며 넣기", okLabel: "인정하며 넣기",
    html: `<p class="be-note">① 누구인지 정하고 ② 「🔎 도장 확인」을 누른 뒤 ③ 사유와 동의를 적어 넣어요 — 넣으면 성도님께 보이는 명단에도 올라가요</p>` +
      `<div data-who>${whoHtml(asksPosition)}</div>` +
      `<div class="be-el-checkbar"><button type="button" class="btn" data-act="check">🔎 도장 확인</button>` +
      `<small class="muted">${esc(CHECK_LOG_TIP)}</small></div>` +
      `<p class="be-el-check" data-check aria-live="polite" hidden></p>` +
      reasonHtml("") +
      `<label class="be-up-fill"><input type="checkbox" data-f="consent"><span><b>${esc(consentText(asksPosition, title))}</b>` +
      `<small>동의 없이 명단에 올리지 않아요(가을 설계 §10)</small></span></label>` +
      `<p class="be-hint" data-appnote hidden>${esc(APP_NOTE)}</p>`,
    onOpen: (root) => {
      const $ = (s) => root.querySelector(s);
      const checkLine = $("[data-check]"), appNote = $("[data-appnote]"), findHint = $("[data-find]");
      // 누구(① 칸)가 바뀌면 도장 확인을 지운다 — 넣기 전에 다시 확인(넣기는 서버가 어차피 다시 판정한다)
      const clearCheck = () => { check = null; seq++; checkLine.hidden = true; checkLine.textContent = ""; appNote.hidden = true; };
      const setF = (k, v) => { const i = $(`[data-f="${k}"]`); if (i) i.value = v ?? ""; };
      const setType = (t) => {
        setF("who_type", t);
        root.querySelectorAll(".seg [data-t]").forEach((b) => {
          const on = b.dataset.t === t;
          b.classList.toggle("on", on);
          b.setAttribute("aria-pressed", String(on));
        });
        root.querySelectorAll("[data-for]").forEach((d) => { d.hidden = d.dataset.for !== t; });
        clearCheck();
      };
      const showGu = () => {
        const v = $('[data-f="gu"]').value, b = $('[data-pick="gu"]');
        b.querySelector(".pk-field-v").textContent = v || "교구 고르기";
        b.setAttribute("aria-label", `교구, ${v || "고르기"}`);
        b.classList.toggle("empty", !v);
      };
      const find = async (btn) => {
        if (btn.disabled) return;   // 찾는 중 — Enter 를 거듭 눌러도 한 번만(교인명부 기록이 두 줄이 되지 않게)
        const name = norm($('[data-f="name"]').value);
        if (!name) { findHint.textContent = "이름을 먼저 적어 주세요"; return; }
        btn.disabled = true;
        findHint.textContent = "교인명부에서 찾는 중…";
        const r = await call("evPeopleLookup", { name });
        btn.disabled = false;
        if (!btn.isConnected) return;
        if (!r.ok) { findHint.textContent = errorText(r); return; }
        if (!r.source) { findHint.textContent = "교인명부가 아직 없어요 — 손으로 적어 주세요"; return; }
        const people = r.people || [];
        if (!people.length) { findHint.textContent = `교인명부 ${r.source.date} 기준 ‘${name}’ — 같은 이름이 없어요, 손으로 적어 주세요`; return; }
        findHint.textContent = `교인명부 ${r.source.date} 기준 ‘${name}’ ${people.length}분`;
        const got = await pickOne({ anchor: btn, title: `‘${name}’ — 어느 분이세요?`, options: people.map((p, i) => ({ value: String(i),
          label: p.name, hint: [p.who_type ? whoText(p) || p.who_type : "소속을 정할 수 없어요", p.position].filter(Boolean).join(" · ") })) });
        if (got === null || !btn.isConnected) return;
        const p = people[Number(got)];
        setF("name", p.name);
        if (p.who_type === "교구" || p.who_type === "교회학교") {
          setType(p.who_type);
          if (p.who_type === "교구") { setF("gu", p.group); setF("mok", p.sub); showGu(); } else { setF("bu", p.group); setF("grade", p.sub); }
        }
        if (asksPosition && p.position) setF("position", p.position);
        clearCheck();
        findHint.textContent = "✅ 교인명부 값으로 채웠어요 — 손으로 고칠 수 있어요 · 앱에 적힌 소속과 다르면 앱 쪽으로 고쳐 주세요";
      };
      const doCheck = async (btn) => {
        if (btn.disabled) return;
        const who = readWho(root);
        const my = ++seq;
        btn.disabled = true;
        checkLine.hidden = false;
        checkLine.textContent = "도장을 확인하는 중…";
        const r = await call("evExcuseCheck", { event_id: ev.id, row: who });
        btn.disabled = false;
        if (my !== seq || !btn.isConnected) return;   // 그 사이 누구 칸이 바뀌었다 — 옛 답을 쓰지 않는다
        if (!r.ok) { check = null; checkLine.textContent = refusal(r).message || errorText(r); appNote.hidden = true; return; }
        check = { key: JSON.stringify(who), res: r };
        checkLine.textContent = checkText(r);
        appNote.hidden = r.account !== "one" || !!r.eligibleNow || !!r.already;
      };
      root.addEventListener("click", async (e) => {
        const t = e.target.closest(".seg [data-t]");
        if (t) { setType(t.dataset.t); return; }
        const pk = e.target.closest('[data-pick="gu"]');
        if (pk) {
          const got = await pickOne({ anchor: pk, title: "교구 고르기", value: $('[data-f="gu"]').value,
            options: GU_ORDER.map((g) => ({ value: g, label: g })) });
          if (got !== null && pk.isConnected) { setF("gu", got); showGu(); clearCheck(); }
          return;
        }
        const fb = e.target.closest('[data-act="find"]');
        if (fb) { find(fb); return; }
        const cb = e.target.closest('[data-act="check"]');
        if (cb) doCheck(cb);
      });
      $('[data-f="name"]').addEventListener("keydown", (e) => {
        if (e.key !== "Enter" || e.isComposing || e.keyCode === 229) return;
        e.preventDefault();   // 창의 「인정하며 넣기」가 아니라 찾기
        find($('[data-act="find"]'));
      });
      root.addEventListener("input", (e) => { if (e.target.closest("[data-who]")) clearCheck(); });
      wireReason(root);
      showGu();
      first = snap(root);
    },
    isDirty: (root) => snap(root) !== first,
    onSubmit: async (root) => {
      const who = readWho(root);
      if (!check || check.key !== JSON.stringify(who)) return { ok: false, error: "needs-check" };
      const block = checkBlock(check.res);
      if (block) return { ok: false, error: block };
      if (!root.querySelector('[data-f="consent"]').checked) return { ok: false, error: "needs-consent" };
      const r = await call("evExcuseAdd", { event_id: ev.id, row: who, reason: readReason(root), consent: true, note: "" });
      if (!r.ok && r.error === "not-found") { staleCode = "not-found"; return { ok: false, message: STALE["not-found"] }; }
      if (!r.ok) return refusal(r);
      extra = { warnings: r.warnings || [] };
      return { ok: true, value: r.row };
    },
  });
  if (!out) { if (staleCode && onStale) onStale(staleCode); return null; }
  toast(`✅ ${out.name} 님을 인정해 명단에 넣었어요 — 성도님께 보이는 명단에도 올라가요`);
  if (extra && extra.warnings.length) {
    await dialog({ title: "확인해 주세요", text: extra.warnings.map(String).join(" · "), ok: "알겠어요", cancel: null });
  }
  return out;
}
```

- [ ] **Step 4: 첫 시험 통과를 본다**

```bash
cd /c/Projects/church-admin/.worktrees/autumn-excuse
node --experimental-strip-types --test tests/be-excuse-form.test.mjs
```
Expected: `# pass 2` · `# fail 0`.

- [ ] **Step 5: `roster.js` 배선(Edit 다섯)**

① 앵커 `import { eligStaticHtml, missingBodyHtml } from "./roster-ui.js";`(Task 6) 줄 **바로 뒤에**:
```js
// 인정 창 셋(가을 인정 계획 Task 7)
import { openExcuseAdd, openExcuseSet, openExcuseUnset } from "./excuse-form.js";
```
② old(한 줄):
```js
      <div class="adm-acts">${ev.hasEligibility ? "" : `<button type="button" class="btn primary" data-act="add">＋ 한 분 더하기</button>`}
```
new:
```js
      <div class="adm-acts">${ev.hasEligibility ? (excuseWhy(ev, today, uiOn()) ? "" : `<button type="button" class="btn primary" data-act="excuse-add">✅ 인정하며 넣기</button>`) : `<button type="button" class="btn primary" data-act="add">＋ 한 분 더하기</button>`}
```
(인정 창이 닫혔으면 단추 대신 Task 6 의 까닭 한 줄(`be-el-why`)만 보인다 — 단추를 회색으로 두지 않는다.)

③ old(두 줄):
```js
    const pick = await pickOne({ anchor: b, title: `${r.name}님 줄`, options: rowMenuOptions(r, ev) });
    if (!pick || !el.isConnected) return;
```
new:
```js
    // 가을 말씀 동행 — 셈 전·인정 창 밖이면 메모만(elig-logic.js eligMenuOptions · 설계 4절 일곱 경우)
    const elCtx = ev.hasEligibility ? { counted: !!(elig && Array.isArray(elig.rows)), why: excuseWhy(ev, today, uiOn()),
      row: eligById.get(String(r.id)) } : null;
    const pick = await pickOne({ anchor: b, title: `${r.name}님 줄`, options: rowMenuOptions(r, ev, elCtx) });
    if (!pick || !el.isConnected) return;
    if (pick === "excuse" || pick === "reason") {
      const u = await openExcuseSet({ call, row: r, er: elCtx && elCtx.row, onStale: stale });
      if (u && el.isConnected) reload();   // 주 칸·요약을 다시 센다
      return;
    }
    if (pick === "unset" || pick === "drop") {
      const u = await openExcuseUnset({ call, row: r, onStale: stale });
      if (u && el.isConnected) reload();
      return;
    }
```
④ 앵커 `  async function rowMenu(b) {` 줄 **바로 앞에**:
```js
  // ✅ 인정하며 넣기 — 넣은 뒤에는 새로 불러온다(주 칸·요약을 다시 센다)
  async function addExcuse() {
    const saved = await openExcuseAdd({ call, ev, asksPosition: !!(elig && elig.asksPosition), onStale: stale });
    if (saved && el.isConnected) reload();
  }
```
⑤ 앵커 `    else if (act === "add") addRow();` 줄 **바로 뒤에**:
```js
    else if (act === "excuse-add") addExcuse();
```

- [ ] **Step 6: CSS — 칩·도장 확인 줄**

앵커 `.be-miss-h{margin:0 0 8px;font-size:14px;font-weight:700;color:var(--navy);overflow-wrap:anywhere}`(Task 6) 줄 **바로 뒤에**:
```css
/* 인정 창 셋(가을 인정 계획 Task 7) — 미리 고르는 말 칩 36px · 도장 확인 줄 · 동의 칸은 .be-up-fill 모양 그대로 */
.be-el-chips{display:flex;flex-wrap:wrap;gap:6px;margin:-4px 0 10px}
.be-el-chip{min-height:var(--chip);padding:0 12px;border:1px solid var(--border);border-radius:18px;background:#fff;color:var(--navy);font-size:14px;cursor:pointer}
.be-el-chip:hover,.be-el-chip:focus-visible{border-color:var(--navy)}
.be-el-checkbar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:0 0 8px}
.be-el-checkbar small{font-size:13px}
.be-el-check{margin:0 0 12px;padding:9px 12px;border-radius:10px;background:var(--ghost-bg);color:var(--navy);font-size:14px;line-height:1.55;overflow-wrap:anywhere}
```

- [ ] **Step 7: 전부 · preflight · 커밋**

```bash
cd /c/Projects/church-admin/.worktrees/autumn-excuse
node --experimental-strip-types --test tests/be-excuse-form.test.mjs tests/be-elig-logic.test.mjs tests/be-roster-ui.test.mjs 2>&1 | tail -3
grep -c 'data-act="excuse-add"' js/menus/bibleevent/roster.js                   # 1
grep -cE 'pick === "(excuse|reason|unset|drop)"' js/menus/bibleevent/roster.js  # 2
python tools/preflight.py | tail -1
git add js/menus/bibleevent/excuse-form.js js/menus/bibleevent/roster.js css/admin.css tests/be-excuse-form.test.mjs
git commit -F - <<'EOF'
feat(성경필사): 가을 말씀 동행 인정 창 셋(excuse-form.js) — 자격 인정·사유 고치기·거두기(두 단계)·인정하며 넣기(도장 확인·동의 칸) · 줄 메뉴 일곱 경우 · 팝업 없음 시험

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
git show --stat HEAD
```
Expected: `# fail 0` · `1` · `2` · `모두 통과` · 파일 넷. 창을 여닫는 동작은 Task 10 에서 헤드리스로 본다.

---

### Task 8: 개인정보 안내 7번(+6번 한 줄) · 교회 어드민 `CLAUDE.md`

이 과제가 끝나면 교회 어드민 `privacy.html` 이 이 기능이 새로 보는 것(주 수·자격·인정·미신청 목록·도장 확인)과 남기는 기록을 사실대로 적고, `CLAUDE.md` 에는 「가을 말씀 동행 자격 인정·미신청」 절과 두 단계 날짜 자리가 생긴다. **이 안내는 1단계 커밋에 전부 들어간다**(설계 7절 3 · 계획이 고른 해석 ⑨). 성경암송 `privacy/` 는 손대지 않는다(역할 받는 분이 모두 운영진이라는 전제 — 친구 결정).

**Files:**
- Modify: `privacy.html` — 앵커 일곱(아래 Step 1)
- Modify: `CLAUDE.md`(교회 어드민) — 앵커 다섯

**Interfaces:**
- Consumes: Task 3~7 의 동작(무엇을 보고 · 무엇을 남기나) · 설계 6절 문장
- Produces: `privacy.html` 7번의 새 문장(Task 11 이 라이브에서 `꾸준함을 재는 회차` 를 찾는다) · `CLAUDE.md` 의 표식 글 둘 — **`1단계(읽기) 개발 중 — 여는 날 날짜를 적는다`** · **`2단계(쓰기) 개발 중 — 여는 날 날짜를 적는다`**(Task 11 이 글자 그대로 찾아 날짜로 바꾼다) · 게이트 줄 `  - ⚠️ 인정 셋은 **운영에서 게이트로 닫혀 있다**` 와 「남긴 것」 줄(Task 11 2단계가 과거형으로 바꾼다)

- [ ] **Step 1: 앵커 확인**

```bash
cd /c/Projects/church-admin/.worktrees/autumn-excuse
c() { printf '%s  %s\n' "$(grep -cF -- "$1" "$2")" "$1"; }
P=privacy.html
c '      명단은 성경암송 앱의 것이고, 이 화면은 무엇을 새로 모으지 않고 그 명단을 그대로 읽고 고쳐요.<br>' $P
c '      앱 계정과 이어졌는지(예·아니오만), 「교적과 맞는지」 표시, 담당자 메모(담당자만 보고, 성도님 화면에는 나가지 않아요).<br>' $P
c '      보지 않는 것: 앱 계정 번호, 성도님이 앱에 적으신 한 줄 메모와 전화번호, 가을 말씀 동행의 자격 판정 기록.<br>' $P
c '      내려받기: 화면에 보이는 명단과 통계를 엑셀(CSV)로 내려받을 수 있어요. 담당자 메모는 싣지 않아요.' $P
c '      회차를 새로 공개할 때는 담당자가 이 점을 한 번 더 확인하고 공개해요.<br>' $P
c '      보관과 삭제: 명단의 보관과 공개 기간은 성경암송 앱의 안내(' $P
c '      이름을 누르면(성경필사(암송) 명단):' $P
M=CLAUDE.md
c '규칙은 순수 모듈 여섯 — ' $M
c '`events-person.ts`(이름을 누르면 교적 창). Node 시험이 같은 파일을 읽는다.' $M
c '- 성경암송 쪽에 **남긴 것**: `eventRoster`(읽기)·`eventExcuse`(자격 인정)·자격 회차 미신청 목록 — 가을 말씀 동행용, 다음 단계에서 옮긴다(그때 성경암송 `admin.html` 이벤트 타일도 이리로).' $M
c '  자격 회차엔 더하기·올리기·빼기가 막힌다(`eligibility-event` · 가을 설계 §12). 회차 설정의 시작일은 `eligibilityStart(needs)` 보다 앞설 수 없다(`before-eligibility`).' $M
c '- 개인정보 안내는 `privacy.html` 7번(+6번 쓰는 곳·보는 사람·기록). 성경암송 `privacy/` 는 손대지 않았다(친구 결정 — 앱이 새로 모으는 것이 없다).' $M
c '- 개발 화면 확인용 가짜 회차: ' $M
grep -c '꾸준함을 재는 회차' $P; grep -c '가을 말씀 동행 자격 인정·미신청' $M
```
Expected: 열세 줄(privacy 일곱 · CLAUDE.md 여섯) 모두 `1` · 마지막 둘 `0`. (`CLAUDE.md` 「개발 화면 확인용 가짜 회차」 줄은 그 절의 마지막 줄이다 — 새 절 머리는 그 줄 **뒤**에 붙는다.)

- [ ] **Step 2: `privacy.html`(Edit 일곱 · 한 줄 앵커 · 바꾸기 넷(①③④⑦)·끼우기 셋(②⑤⑥))**

① old:
```html
      명단은 성경암송 앱의 것이고, 이 화면은 무엇을 새로 모으지 않고 그 명단을 그대로 읽고 고쳐요.<br>
```
new:
```html
      명단은 성경암송 앱의 것이고, 이 화면은 무엇을 새로 모으지 않고 그 명단을 그대로 읽고 고쳐요.
      다만 꾸준함을 재는 회차(가을 말씀 동행)에서는 성경암송 앱의 활동 기록으로 주마다 채우셨는지를 세어 봐요(새로 모으는 것은 없어요).<br>
```
② 앵커 `      앱 계정과 이어졌는지(예·아니오만), 「교적과 맞는지」 표시, 담당자 메모(담당자만 보고, 성도님 화면에는 나가지 않아요).<br>` 줄 **바로 뒤에**:
```html
      꾸준함을 재는 회차(가을 말씀 동행)에서 더 보는 것: 줄마다 채운 주 수 · 필요한 주 수 · 자격이 되었는지 · 담당자가 인정했는지와 그 사유,
      측정이 끝난 뒤에는 여섯 주를 다 채우셨는지 · 자격은 되셨는데 아직 신청하지 않으신 분의 이름·구분·소속·세부(신청을 알려 드리려는 용도 ·
      담당자만 봐요 · 신청 기간 동안만 — 마감 뒤에는 인원수만) · 사정이 있으셨던 분을 인정해 넣을 때, 그분 앱 계정의 주별 채움(채웠는지만)과
      채운 주 수(인정 기간 동안만 · 이미 명단에 있거나 이미 자격이 되신 분은 보지 않아요).<br>
```
③ old:
```html
      보지 않는 것: 앱 계정 번호, 성도님이 앱에 적으신 한 줄 메모와 전화번호, 가을 말씀 동행의 자격 판정 기록.<br>
```
new:
```html
      보지 않는 것: 앱 계정 번호, 성도님이 앱에 적으신 한 줄 메모와 전화번호, 날마다의 활동(몇 번 · 어떤 구절 — 주 단위 셈만 봐요).<br>
```
④ old:
```html
      내려받기: 화면에 보이는 명단과 통계를 엑셀(CSV)로 내려받을 수 있어요. 담당자 메모는 싣지 않아요.
```
new:
```html
      내려받기: 화면에 보이는 명단과 통계를 엑셀(CSV)로 내려받을 수 있어요. 담당자 메모는 싣지 않아요.
      꾸준함을 재는 회차에서는 명단에 주·자격·인정 여부(사유는 빼고)가 함께 실리고, 아직 신청 안 하신 분 목록(이름·구분·소속·세부 · 신청 기간 동안만)도 내려받을 수 있어요.
```
⑤ 앵커 `      회차를 새로 공개할 때는 담당자가 이 점을 한 번 더 확인하고 공개해요.<br>` 줄 **바로 뒤에**:
```html
      인정해 넣은 분은 본인(또는 가족)께 여쭙고 동의를 받은 뒤 넣어요 — 그 회차 명단에 이름과 소속이 보여요(회차가 직분을 받을 때만 직분도).
      인정 사유는 성도님 화면에 나가지 않아요.<br>
```
⑥ 앵커 `      보관과 삭제: 명단의 보관과 공개 기간은 성경암송 앱의 안내(` 로 시작하는 줄 **바로 앞에**(7번 「기록:」 두 줄은 고치지 않는다 — be-decide 가 그 둘째 줄을 바꾸므로 앵커로 쓰면 먼저 들어온 쪽에 따라 깨진다):
```html
      가을 말씀 동행에서는 인정하며 넣기·사유 고치기·거두기(그분 이름·소속 · 사유 글은 남기지 않고 적었다는 것만), 도장 확인으로 찾아본 분의 이름,
      아직 신청 안 하신 분 목록을 본 때와 인원수(이름은 남기지 않아요)도 남겨요.<br>
```
⑦ old:
```html
      이름을 누르면(성경필사(암송) 명단):
```
new:
```html
      이름을 누르면(성경필사(암송) 명단과 아직 신청 안 하신 분 목록):
```

```bash
cd /c/Projects/church-admin/.worktrees/autumn-excuse
grep -c '꾸준함을 재는 회차' privacy.html                     # 3
grep -c '<div class="card">' privacy.html; grep -c '</div>' privacy.html   # 같은 수(카드를 새로 만들지 않았다)
python tools/preflight.py | tail -1
git add privacy.html
git commit -m "docs(성경필사): 개인정보 안내 7번 — 가을 말씀 동행의 주 수·자격·인정·미신청 목록·도장 확인과 그 기록 · 6번 이름을 누르면 한 줄" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git show --stat HEAD
```
Expected: `3` · 두 수가 같다 · `모두 통과` · `privacy.html` 하나(`deploy.yml` 의 `cp` 목록에 이미 있다 — 따로 할 일 없음).

- [ ] **Step 3: 교회 어드민 `CLAUDE.md`(Edit 다섯)**

① old `규칙은 순수 모듈 여섯 — ` → new `규칙은 순수 모듈 일곱 — `
② old:
```markdown
`events-person.ts`(이름을 누르면 교적 창). Node 시험이 같은 파일을 읽는다.
```
new:
```markdown
`events-person.ts`(이름을 누르면 교적 창) · `events-elig.ts`(자격 회차 셈·인정 표기 — 아래 「가을 말씀 동행 자격 인정·미신청」). Node 시험이 같은 파일을 읽는다.
```
③ old(한 줄):
```markdown
- 성경암송 쪽에 **남긴 것**: `eventRoster`(읽기)·`eventExcuse`(자격 인정)·자격 회차 미신청 목록 — 가을 말씀 동행용, 다음 단계에서 옮긴다(그때 성경암송 `admin.html` 이벤트 타일도 이리로).
```
new:
```markdown
- 성경암송 쪽에 **남긴 것**: `eventRoster`(읽기 — 옛 `admin-event.html` 보기·인쇄). 자격 인정(`eventExcuse`)·미신청 목록은 아래 「가을 말씀 동행 자격 인정·미신청」으로 옮긴다 — 2단계 여는 날 성경암송이 `eventExcuse` 를 얼리고 `eventRoster` 의 `note` 를 뺀다(그 전까지는 성경암송이 인정을 쓰는 곳이다 · 그날 `admin.html` 이벤트 타일도 이리로).
```
④ 앵커 `  자격 회차엔 더하기·올리기·빼기가 막힌다(…)` 줄 **바로 뒤에**:
```markdown
  예외는 가을 인정 두 액션뿐(`evExcuseAdd` 인정하며 넣기 · `evExcuseSet` 의 인정 거두고 빼기) — 사유·동의·기록(`event.excuse`)이 붙는다. 자격 회차 줄의 메모는 인정 표기를 서버가 지킨다(아래 절).
```
⑤ `- 개발 화면 확인용 가짜 회차: ` 로 시작하는 줄 **바로 뒤에**(빈 줄·`## 비상 절차` 앞):
```markdown
- **가을 말씀 동행 자격 인정·미신청**(1단계(읽기) 개발 중 — 여는 날 날짜를 적는다 · 2단계(쓰기) 개발 중 — 여는 날 날짜를 적는다 ·
  설계 v2 `docs/superpowers/specs/2026-09-30-church-admin-autumn-excuse-design.md` · 계획 v2 `docs/superpowers/plans/2026-09-30-church-admin-autumn-excuse.md`):
  📋 자격 회차 화면 안에 규칙 띠·줄별 주 수·요약·👥 아직 신청 안 하신 분(`evEligRows`·`evEligMissing`) + 인정 셋(`evExcuseCheck`·`evExcuseAdd`·`evExcuseSet` · 화면 `excuse-form.js`).
  셈은 `events-elig.ts`(성경암송 `evtRule`·`evtNeedFor`·`evtCanReach` 사본 — `tests/fixtures/evt-legacy.ts` 와 맞대는 시험이 있다) + RPC `v2_event_weeks`(service_role · 1,000행이면 `count-capped`).
  - ⚠️ 인정은 `note` 머리 표기 **「자격 인정: 사유」**(뒤 메모는 ` / `) — `answers` 는 읽지도 쓰지도 않는다. 자격 회차 줄의 `evRowSave`(메모)는 표기를 **서버가 다시 붙이고**,
    메모로 「자격 인정:」을 적으면(NFD 포함) `excuse-via-memo`. 메모 창 상한은 `500 − (표기 + 3)`. 표기 읽기는 서버 `events-elig.ts` 와 화면 `elig-logic.js` 두 벌 —
    `tests/fixtures/excuse-marker.json` 을 두 시험이 함께 읽는다. 표기 규칙을 바꾸면 셋을 함께.
  - ⚠️ 인정 셋은 **운영에서 게이트로 닫혀 있다**(`index.ts` `EXCUSE_LIVE_PROD` · `elig-logic.js` `EXCUSE_UI_PROD` — 2단계 여는 날 둘을 함께 `true` · 서버 게이트는 개발 주소에서만 저절로 열리고 모르는 주소는 닫힌다 `excuseGateOpen`). 성경암송 `eventExcuse` 를 얼리기 **전에** 열면 인정을 쓰는 곳이 둘이 된다(answers 와 note 표기에 갈라진다).
  - 인정 창은 `opens_on` ~ `list_until`(`excuseWindow`), 미신청 이름은 `opens_on` ~ `closes_on` 동안만(마감 뒤엔 수만 · `missingWindow`). 인정하며 넣은 줄은 `source='import'` + `자격 인정: 사유 / 담당자가 더함` ·
    직분은 회차 `needs.position` 이 참일 때만(공개 명단에 직분이 새지 않게) · 동의 필수(`needs-consent`) · 이미 자격이면 `already-eligible` · 계정 둘 이상이면 `ambiguous-account` · 같은 분이면 `already`(거절만).
  - 기록: `event.excuse`(사유 글 없음 — `reason` 은 적었는지뿐) · `event.excuse-check`(도장 확인 — 늘 남긴다 · 이름만) · `event.missing`(수만). 셋 다 「바꾼 기록」 보기.
  - 성도님 앱은 인정을 모른다(도장판·「참여 취소」 그대로) — 인정해 넣은 분이 앱에서 취소하시면 줄과 표기가 함께 지워지고 여기 기록엔 넣은 것만 남는다.
  - ⚠️ 이 기능은 신청하지 않은 분의 암송 활동(주마다 채웠는지)을 보인다 — 「성경필사(암송)」 역할은 **운영진(신앙운동팀)에게만**(친구 결정 2026-09-30 · 성경암송 `privacy/` 4번 「암송 기록은 본인과 운영진이 봅니다」).
    운영진 밖의 분께 드려야 하면 먼저 성경암송 `privacy/` 를 고치거나 이 두 기능을 `super` 로 올린다.
  - 개발 화면 확인: 가짜 회차 `ca-demo-el-open`(인정 창 열림 · 날은 오늘에서 센다 — `tests/seed-bible-events-dev.mjs`).
```
```bash
cd /c/Projects/church-admin/.worktrees/autumn-excuse
grep -c "1단계(읽기) 개발 중 — 여는 날 날짜를 적는다" CLAUDE.md                # 1
grep -c "2단계(쓰기) 개발 중 — 여는 날 날짜를 적는다" CLAUDE.md                # 1
grep -c '^  - ⚠️ 인정 셋은 \*\*운영에서 게이트로 닫혀 있다\*\*' CLAUDE.md      # 1
grep -c '^- 성경암송 쪽에 \*\*남긴 것\*\*: `eventRoster`(읽기 — 옛' CLAUDE.md   # 1
python tools/preflight.py | tail -1
git add CLAUDE.md
git commit -m "docs(성경필사): CLAUDE.md 가을 말씀 동행 자격 인정·미신청 절 — 표기·게이트·창·기록·역할은 운영진에게만" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git show --stat HEAD
```
Expected: `1` 넷 · `모두 통과` · `CLAUDE.md` 하나.

---

### Task 9: 개발 가짜 회차 늘리기 — `ca-demo-el-open`(인정 창 열림)

설계 7절 2 「localhost 에서 친구 확인(개발 DB · 가짜 회차 `ca-demo-` 에 자격 회차 하나 더)」. 기존 `ca-demo-el` 은 운영 가을 회차와 같은 날짜(신청 10/27~)라 10/27 전에는 인정 창이 닫혀 「까닭 한 줄」 확인용이 되고, 새 `ca-demo-el-open` 은 날을 **오늘에서 세어** 인정 창·미신청 목록이 늘 열려 있다.

**Files:**
- Modify: `tests/seed-bible-events-dev.mjs` — 앵커 둘(`const BIG = "ca-demo-big", SMALL = "ca-demo-small", EL = "ca-demo-el";` · `console.log(\`넣었다: 회차 3 · …`)

**Interfaces:**
- Consumes: 기존 시드의 `rest`·`row(eventId, who, group, sub, name, position, extra)`·`app(eventId, u, position, extra)`·`insertRows`·`appIdentityKey`·`DEMO_USER`(= `데모앱성도`)·`now()`·`clean()`(회차 `ca-demo-*` 와 사용자 `데모앱성도*` 를 지운다 — 사용자의 `challenge_log` 는 CASCADE, `daily_activity` 는 트리거가 되돌린다)
- Produces(Task 10 이 이 이름·수를 믿는다): 회차 `ca-demo-el-open`(측정 오늘−35 · 6주 · 신청 오늘−7 ~ 오늘+14 · 공개 종료 오늘+30 · 직분 안 받음) · 앱 사용자 다섯 — `데모앱성도라`(사랑 5 · 0·1·2주 → 3/3 · 명단) · `데모앱성도마`(사랑 5 · 0·1주 → 2/3 · 명단 — 「신청 때는 확인됨」) · `데모앱성도바`(사랑 6 · 1주 → 1/2 · 명단 밖 — 인정하며 넣기) · `데모앱성도사`(사랑 6 · 3·4주 → 2/2 · 명단 밖 — 미신청 목록) · `데모앱성도아`(믿음 2 · 0·1·2주 · 명단 밖 — 미신청 목록) · 담당자 줄 `차하늘`(사랑 7 · 계정 없음 · `자격 인정: 종이로 암송 / 담당자가 더함`) → 요약 「명단 3명 · 자격 됨 2명(주로 채움 1 · 인정으로 1) · 계정 없음 1명 · 다시 센 값이 모자란 앱 줄 1」

- [ ] **Step 1: 앵커 확인**

```bash
cd /c/Projects/church-admin/.worktrees/autumn-excuse
F=tests/seed-bible-events-dev.mjs
grep -cF 'const BIG = "ca-demo-big", SMALL = "ca-demo-small", EL = "ca-demo-el";' $F
grep -cF 'console.log(`넣었다: 회차 3 · 줄 ${big.length} + ${small.length} + 2 · 앱 사용자 ${users.length}`);' $F
grep -c 'ca-demo-el-open\|데모앱성도라' $F
```
Expected: `1` · `1` · `0`.

- [ ] **Step 2: 시드 고치기(Edit 둘)**

① old:
```js
const BIG = "ca-demo-big", SMALL = "ca-demo-small", EL = "ca-demo-el";
```
new:
```js
const BIG = "ca-demo-big", SMALL = "ca-demo-small", EL = "ca-demo-el";
// 인정 창이 열린 자격 회차(가을 인정 계획 Task 9) — 날은 오늘(한국 날짜)에서 센다. ca-demo-el 은 운영 가을 회차와 같은 날짜라
// 10/27 전에는 인정 창이 닫혀 있다(「까닭 한 줄」 확인용).
const ELO = "ca-demo-el-open";
```
② old:
```js
console.log(`넣었다: 회차 3 · 줄 ${big.length} + ${small.length} + 2 · 앱 사용자 ${users.length}`);
```
new:
```js
// ⑥-2 인정 창이 열린 자격 회차(가을 인정 계획 Task 9) — 측정은 다섯 주 전 시작 · 신청은 일주일 전 열림 · 공개 종료 한 달 뒤.
//    앱 사용자 다섯의 날은 challenge_log 를 과거 시각으로 넣어 트리거가 daily_activity 를 채우게 한다(성경암송 supabase/dev_seed_stamp.sql 과
//    같은 방법 — daily_activity 에 직접 넣지 않는다). clean() 이 사용자를 지우면 challenge_log 는 CASCADE, daily_activity 는 트리거가 되돌린다.
const kst = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const dayOf = (base, n) => new Date(Date.parse(base + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const ELO_START = dayOf(kst, -35);
const [verse] = await rest("verses?select=no&order=no&limit=1");
if (!verse) throw new Error("개발 verses 가 비었다 — 성경암송 supabase/seed_verses.sql 을 개발에 먼저");
const more = [];
for (const [gu, mok, suffix] of [["사랑", "5", "라"], ["사랑", "5", "마"], ["사랑", "6", "바"], ["사랑", "6", "사"], ["믿음", "2", "아"]]) {
  const name = DEMO_USER + suffix;
  const [u] = await rest("users", "POST", { type: "교구", gu, mok, name,
    identity_key: appIdentityKey({ type: "교구", gu, mok, bu: "", grade: "", name }) });
  more.push(u);
}
const [U4, U5, U6, U7, U8] = more;
const logs = [];
for (const [u, weeks] of [[U4, [0, 1, 2]], [U5, [0, 1]], [U6, [1]], [U7, [3, 4]], [U8, [0, 1, 2]]])
  for (const w of weeks) for (const d of [0, 1, 2])
    logs.push({ user_id: u.id, verse_no: verse.no, mode: "typing", created_at: dayOf(ELO_START, w * 7 + d) + "T12:00:00+09:00" });
await rest("challenge_log", "POST", logs);
await rest("events", "POST", { id: ELO, title: "화면 확인 — 자격 회차(인정 창 열림)", short_title: "자격 인정", subtitle: "인정·미신청 목록 확인용",
  season: "2026-4Q", kind: "signup", status: "draft", opens_on: dayOf(kst, -7), closes_on: dayOf(kst, 14), list_until: dayOf(kst, 30),
  needs: { eligibility: { start: ELO_START, weeks: 6, perWeek: 3, need: 3, minNeed: 2 } }, updated_at: now() });
await insertRows([
  app(ELO, U4, ""),                                                                            // 3/3주 ✓(주로 채움)
  app(ELO, U5, ""),                                                                            // 2/3주 · 신청 때는 확인됨 — 「✅ 자격 인정」 확인용
  row(ELO, "교구", "사랑", "7", "차하늘", "", { note: "자격 인정: 종이로 암송 / 담당자가 더함" }),  // 계정 없음 · 인정
]);
console.log(`넣었다: 회차 4 · 줄 ${big.length} + ${small.length} + 2 + 3 · 앱 사용자 ${users.length + more.length}`);
console.log(`자격 인정 확인용: ${ELO} — 측정 ${ELO_START}부터 · 신청 ${dayOf(kst, -7)} ~ ${dayOf(kst, 14)} · 명단 라·마·차하늘 · 명단 밖 바(1주)·사·아(자격 됨)`);
```

- [ ] **Step 3: 개발에서 돌려 본다 · 셈이 맞는지 서버로 본다**

```bash
cd /c/Projects/church-admin/.worktrees/autumn-excuse
node --check tests/seed-bible-events-dev.mjs && echo "문법 통과"
set -a; . ~/.church-admin/dev.env; set +a
node --experimental-strip-types tests/seed-bible-events-dev.mjs 2>&1 | grep -E '^(지웠다|넣었다|자격 인정 확인용)'
```
Expected: `지웠다: …` · `넣었다: 회차 4 · 줄 1100 + 12 + 2 + 3 · 앱 사용자 8` · `자격 인정 확인용: ca-demo-el-open — …`.

셈 확인은 Task 10 의 헤드리스가 화면으로 본다(A2 요약 글이 위 Produces 문장과 같아야 한다). 커밋:
```bash
cd /c/Projects/church-admin/.worktrees/autumn-excuse
python tools/preflight.py | tail -1
git add tests/seed-bible-events-dev.mjs
git commit -m "test(성경필사): 개발 가짜 회차에 인정 창이 열린 자격 회차 ca-demo-el-open(날은 오늘에서 센다 · 앱 사용자 다섯의 활동)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git show --stat HEAD
```

---

### Task 10: 헤드리스 확인 · localhost 친구 확인

이 과제는 코드를 새로 짜지 않는다(하네스는 커밋되지 않는 `.superpowers/sdd/` 에 둔다). 개발 DB·localhost 에서 헤드리스 크롬으로 화면을 눌러 보고, **시스템 창이 한 번도 안 뜨는지**를 CDP `Page.javascriptDialogOpening` 으로 지킨다(처음에 일부러 `alert` 하나를 띄워 감시가 잡는지 본다 — 양성 대조). 걸린 것은 해당 과제로 돌아가 시험 먼저 고친다. **친구가 「됐다」고 할 때까지 Task 11 로 가지 않는다.**

**Files(커밋 안 됨 — `.superpowers/sdd/.gitignore` 가 `*`):**
- Create: `C:\Projects\church-admin\.superpowers\sdd\autumn-excuse\harness\ae-auth.mjs`
- Create: `C:\Projects\church-admin\.superpowers\sdd\autumn-excuse\harness\ae-check.mjs`

**Interfaces:**
- Consumes: 개발 함수가 워크트리 판(Task 3·4 배포) · Task 9 시드(`ca-demo-el-open` 과 사용자 이름) · 앱 세션 저장 열쇠 `localStorage["church-admin-auth"]`(`js/core/auth.js` `storageKey`) · 화면의 DOM 표식(`.be-el-rule`·`.be-el-sum`·`.be-list .be-name[data-name]`·`[data-act="row"]`·`.pk-dim .pk-opt`·`.be-modal`·`.be-ok`·`.be-err`·`.be-ask`·`[data-be="leave"]`·`.adm-toast`·`details.be-miss`·`[data-act="miss-csv"]`·`[data-act="excuse-add"]`·`[data-f="…"]`·`[data-pick="gu"]`·`[data-act="check"]`·`[data-check]`·`[data-appnote]`·`.be-el-chip`)
- Produces: `ae-results.json` · 끝줄 `통과 N · 실패 0 · 시스템 창 0` · 친구 확인 기록(progress.md 한 줄)

- [ ] **Step 1: 로그인 계정 — `ae-auth.mjs`(Write)**

```js
// 가을 인정 계획 Task 10 — 카카오 없이 로그인: 개발 auth 에 이메일 계정 하나(「성경필사(암송)」만)를 만들어 ae-accounts.json 에 적는다.
//   set -a; . ~/.church-admin/dev.env; set +a
//   node C:/Projects/church-admin/.superpowers/sdd/autumn-excuse/harness/ae-auth.mjs          # 만들기(있으면 비밀번호를 파일과 맞춤)
//   node C:/Projects/church-admin/.superpowers/sdd/autumn-excuse/harness/ae-auth.mjs --clean  # 지우기(admin_members·역할은 CASCADE)
// ⚠️ 개발 프로젝트(ktpwthwqzgcqcrmsafdo)만. 담당자 이름은 「데모담당자다」(지어낸 이름) · 이 폴더는 커밋되지 않는다.
import { readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const URL_ = process.env.DEV_URL, SERVICE = process.env.DEV_SERVICE_KEY;
if (!URL_ || !URL_.includes("ktpwthwqzgcqcrmsafdo")) throw new Error("개발 프로젝트에만 — dev.env 를 확인할 것");
if (!SERVICE) throw new Error("DEV_SERVICE_KEY 가 없다");
const svc = { apikey: SERVICE, "Content-Type": "application/json", ...(SERVICE.startsWith("sb_secret_") ? {} : { Authorization: "Bearer " + SERVICE }) };
const FILE = join(HERE, "ae-accounts.json");
const EMAIL = "ca-demo-ae-be-1@example.test";

async function j(r) { const t = await r.text(); try { return JSON.parse(t); } catch { return { raw: t }; } }
async function rest(path, method = "GET", data) {
  const r = await fetch(URL_ + "/rest/v1/" + path, { method, headers: { ...svc, Prefer: "return=representation" },
    body: data ? JSON.stringify(data) : undefined });
  const x = await j(r);
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${JSON.stringify(x).slice(0, 300)}`);
  return x;
}
async function findUser() {
  for (let page = 1; page < 50; page++) {
    const r = await j(await fetch(`${URL_}/auth/v1/admin/users?page=${page}&per_page=200`, { headers: svc }));
    const list = r.users || [];
    const u = list.find((x) => x.email === EMAIL);
    if (u) return u;
    if (list.length < 200) return null;
  }
  return null;
}

if (process.argv.includes("--clean")) {
  const u = await findUser();
  if (u) console.log("지움", EMAIL, (await fetch(URL_ + "/auth/v1/admin/users/" + u.id, { method: "DELETE", headers: svc })).status);
  else console.log("없음", EMAIL);
  rmSync(FILE, { force: true });
  process.exit(0);
}
const acc = existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : { email: EMAIL, password: "Demo!" + randomBytes(9).toString("base64url") };
let u = await findUser();
if (!u) {
  u = await j(await fetch(URL_ + "/auth/v1/admin/users", { method: "POST", headers: svc,
    body: JSON.stringify({ email: EMAIL, password: acc.password, email_confirm: true }) }));
  if (!u.id) throw new Error("사용자 만들기 실패: " + JSON.stringify(u).slice(0, 300));
} else {
  await fetch(URL_ + "/auth/v1/admin/users/" + u.id, { method: "PUT", headers: svc, body: JSON.stringify({ password: acc.password }) });
}
const ms = await rest(`admin_members?select=id,status&auth_user_id=eq.${u.id}`);
let mid = ms[0]?.id;
if (!mid) {
  const [m] = await rest("admin_members", "POST", { auth_user_id: u.id, name: "데모담당자다", type: "교구", gu: "사랑", mok: "1",
    status: "active", approved_at: new Date().toISOString() });
  mid = m.id;
} else if (ms[0].status !== "active") await rest(`admin_members?id=eq.${mid}`, "PATCH", { status: "active" });
await rest(`admin_role_grants?member_id=eq.${mid}`, "DELETE");        // 역할을 정확히 bibleevent 하나로
await rest("admin_role_grants", "POST", { member_id: mid, role_id: "bibleevent" });
writeFileSync(FILE, JSON.stringify(acc, null, 2));
console.log(`준비됨 ${EMAIL} · 역할 bibleevent`);
```

- [ ] **Step 2: 확인 스크립트 — `ae-check.mjs`(Write)**

```js
// 가을 인정 계획 Task 10 — 헤드리스 크롬으로 localhost 화면을 눌러 본다(개발 DB · 가짜 회차 ca-demo-el-open · 역할 bibleevent 만).
//   준비: http 8851(워크트리 루트) · 크롬 9851(헤드리스) · 시드(Task 9) · node ae-auth.mjs
//   set -a; . ~/.church-admin/dev.env; set +a; node C:/Projects/church-admin/.superpowers/sdd/autumn-excuse/harness/ae-check.mjs
//   끝줄 「통과 N · 실패 M · 시스템 창 K」 — 실패·시스템 창이 모두 0 이어야 한다. 결과는 ae-results.json.
// 시스템 창 감시 = CDP Page.javascriptDialogOpening(브라우저가 alert·confirm·prompt·beforeunload 창을 띄우면 온다).
//   처음에 일부러 alert 하나를 띄워 감시가 정말 잡는지 본다(양성 대조) — 못 잡으면 나머지를 돌리지 않는다.
// ⚠️ 이 스크립트는 개발 명단을 바꾼다(A6~A11) — 돌리기 전에 늘 시드를 다시 심는다(Task 9 Step 3 명령).
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CDP = "http://127.0.0.1:9851", ORIGIN = "http://127.0.0.1:8851", EV = "ca-demo-el-open";
const DL = join(HERE, "dl");
const URL_ = process.env.DEV_URL, ANON = process.env.DEV_ANON;
if (!URL_ || !URL_.includes("ktpwthwqzgcqcrmsafdo")) throw new Error("개발 프로젝트에만 — dev.env 를 확인할 것");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const q = JSON.stringify;

function wsConnect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let id = 0;
    const pending = new Map(), listeners = new Map();
    ws.addEventListener("message", (e) => {
      const m = JSON.parse(e.data);
      if (m.id && pending.has(m.id)) {
        const p = pending.get(m.id); pending.delete(m.id);
        m.error ? p.rej(new Error(m.error.message)) : p.res(m.result);
      } else if (m.method) (listeners.get(m.method) || []).forEach((f) => { try { f(m.params); } catch (err) { console.error(err); } });
    });
    ws.addEventListener("open", () => resolve({
      send: (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); }),
      on: (ev, f) => { if (!listeners.has(ev)) listeners.set(ev, []); listeners.get(ev).push(f); },
    }));
    ws.addEventListener("error", reject);
  });
}

// ① 세션(카카오 대신 — ae-auth.mjs 의 이메일 계정)
const acc = JSON.parse(readFileSync(join(HERE, "ae-accounts.json"), "utf8"));
const session = await (await fetch(URL_ + "/auth/v1/token?grant_type=password", { method: "POST",
  headers: { apikey: ANON, "Content-Type": "application/json" }, body: JSON.stringify({ email: acc.email, password: acc.password }) })).json();
if (!session.access_token) throw new Error("로그인 실패 — node ae-auth.mjs 를 먼저: " + JSON.stringify(session).slice(0, 200));
if (!session.expires_at) session.expires_at = Math.floor(Date.now() / 1000) + (session.expires_in || 3600);

// ② 받기 폴더(브라우저 전체) · ③ 탭 — 새 문서마다 세션을 심고, 브라우저 대화상자가 뜨면 SYS 에 적고 닫는다
rmSync(DL, { recursive: true, force: true }); mkdirSync(DL, { recursive: true });
const browser = await wsConnect((await (await fetch(CDP + "/json/version")).json()).webSocketDebuggerUrl);
const downloads = [];
browser.on("Browser.downloadWillBegin", (p) => downloads.push(p.suggestedFilename));
await browser.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: DL, eventsEnabled: true });
const info = await (await fetch(`${CDP}/json/new?about:blank`, { method: "PUT" })).json();
const tab = await wsConnect(info.webSocketDebuggerUrl);
for (const m of ["Page.enable", "Runtime.enable", "Network.enable"]) await tab.send(m);
await tab.send("Network.setCacheDisabled", { cacheDisabled: true });
const SYS = [];
tab.on("Page.javascriptDialogOpening", (p) => {
  SYS.push(`${p.type}: ${p.message}`);
  tab.send("Page.handleJavaScriptDialog", { accept: true }).catch(() => {});
});
await tab.send("Page.addScriptToEvaluateOnNewDocument",
  { source: `try { localStorage.setItem("church-admin-auth", ${q(q(session))}); } catch (e) {}` });
// 셈 실패 흉내(A14) — evEligRows 만 500 으로 돌려준다
let failElig = false;
tab.on("Fetch.requestPaused", async (p) => {
  try {
    const b = p.request.postData ? JSON.parse(p.request.postData) : {};
    if (failElig && p.request.method === "POST" && b.action === "evEligRows") {
      await tab.send("Fetch.fulfillRequest", { requestId: p.requestId, responseCode: 500,
        responseHeaders: [{ name: "Content-Type", value: "application/json" }, { name: "Access-Control-Allow-Origin", value: "*" }],
        body: Buffer.from(JSON.stringify({ ok: false, error: "server", code: "harness" })).toString("base64") });
      return;
    }
  } catch { /* 본문이 JSON 이 아니면 그대로 보낸다 */ }
  await tab.send("Fetch.continueRequest", { requestId: p.requestId }).catch(() => {});
});

async function ev(expr) {
  const r = await tab.send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception?.description || r.exceptionDetails.text || "").slice(0, 300));
  return r.result.value;
}
async function waitFor(expr, ms = 15000) {
  const t0 = Date.now();
  for (;;) {
    let v = false;
    try { v = await ev(`!!(${expr})`); } catch { /* 아직 없다 */ }
    if (v) return true;
    if (Date.now() - t0 > ms) throw new Error("기다림 넘침: " + expr.slice(0, 160));
    await sleep(150);
  }
}
async function click(sel, text = "") {
  await ev(`(() => { const all = [...document.querySelectorAll(${q(sel)})];
    const e = ${text ? `all.find((x) => x.textContent.includes(${q(text)}))` : "all[0]"};
    if (!e) throw new Error("없음: " + ${q(sel + " " + text)});
    e.scrollIntoView({ block: "center" }); e.click(); return true; })()`);
}
async function setVal(sel, v) {
  await ev(`(() => { const e = document.querySelector(${q(sel)}); if (!e) throw new Error("없음: " + ${q(sel)});
    e.focus(); e.value = ${q(v)}; e.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
}
const text = (sel) => ev(`(document.querySelector(${q(sel)})?.textContent || "").replace(/\\s+/g, " ").trim()`);
const has = (sel) => ev(`!!document.querySelector(${q(sel)})`);
async function esc() {
  await tab.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await tab.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await sleep(300);
}
const viewport = (w, h, mobile) => tab.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile });
async function open() {
  await tab.send("Page.navigate", { url: "about:blank" }); await sleep(100);
  await tab.send("Page.navigate", { url: `${ORIGIN}/#/be-roster?ev=${EV}` });
  await waitFor(`document.querySelector('.be-list') && document.querySelector('.be-el-rule') && !document.querySelector('.be-el-rule').textContent.includes('세는 중')`, 25000);
  await sleep(300);
}
const rowSel = (name) => `(() => { const b = [...document.querySelectorAll('.be-list .be-name')].find((x) => x.dataset.name === ${q(name)});
  return b && (b.closest('.be-row') || b.closest('tr')); })()`;
const rowText = (name) => ev(`(${rowSel(name)}?.textContent || "").replace(/\\s+/g, " ").trim()`);
async function rowMenu(name, option) {
  await ev(`(() => { const r = ${rowSel(name)}; const m = r && r.querySelector('[data-act="row"]');
    if (!m) throw new Error("줄 메뉴 없음: " + ${q(name)}); m.scrollIntoView({ block: "center" }); m.click(); return true; })()`);
  await waitFor(`document.querySelector('.pk-dim .pk-opt')`, 5000); await sleep(350);
  await click(".pk-dim .pk-opt", option);
  await waitFor(`document.querySelector('.be-modal')`, 5000); await sleep(300);
}
const waitToast = (part, ms = 15000) => waitFor(`(document.querySelector('.adm-toast')?.textContent || '').includes(${q(part)})`, ms);
const waitErr = (part, ms = 8000) => waitFor(`(document.querySelector('.be-modal .be-err')?.textContent || '').includes(${q(part)})`, ms);
async function closeModal() {
  await esc();
  if (await has(".be-ask:not([hidden])")) await click('.be-modal [data-be="leave"]');
  await waitFor(`!document.querySelector('.be-modal')`, 5000);
}
async function pickGu(gu) {
  await click('.be-modal [data-pick="gu"]');
  await waitFor(`document.querySelector('.pk-dim .pk-opt')`, 5000); await sleep(350);
  await click(".pk-dim .pk-opt", gu); await sleep(300);
}

const results = [];
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
async function check(id, what, fn) {
  const before = SYS.length;
  let ok = true, evidence = "";
  try { evidence = String((await fn()) ?? ""); } catch (e) { ok = false; evidence = String(e?.message || e); }
  if (SYS.length > before) { ok = false; evidence += " · 시스템 창: " + SYS.slice(before).join(" / "); }
  results.push({ id, what, ok, evidence });
  console.log(`${ok ? "통과" : "실패"}  ${id} ${what} — ${evidence.slice(0, 240)}`);
}

// ④ 양성 대조 — 감시가 진짜 브라우저 창을 잡는가
await viewport(390, 844, true);
await open();
await ev(`setTimeout(() => alert("대조"), 0), true`);
await sleep(800);
if (SYS.length !== 1) { console.log("감시가 alert 를 못 잡았다 — 멈춘다", SYS); process.exit(2); }
SYS.length = 0;
console.log("양성 대조 통과 — 시스템 창 감시 켜짐");

await check("A1", "규칙 띠 — 기간·주 3일·여섯 주 중 세 주·측정 중·센 시각", async () => {
  const t = await text(".be-el-rule");
  for (const s of ["📏 도장 기간", "한 주에 3일이면 그 주 ✓", "여섯 주 중 세 주(이 기간에 처음 오신 분은 두 주)", "지금: 측정 중", "에 센 값"])
    expect(t.includes(s), "띠에 없음: " + s + " | " + t);
  return t;
});
await check("A2", "요약 — 주로 채움 + 인정으로 = 자격 됨 · 계정 없음 · 다시 센 값이 모자란 앱 줄 · ✨ 없음", async () => {
  const t = await text(".be-el-sum");
  expect(t === "명단 3명 · 자격 됨 2명(주로 채움 1 · 인정으로 1) · 계정 없음 1명 · 다시 센 값이 모자란 앱 줄 1", t);
  return t;
});
await check("A3", "폰 카드 주 칸 — 3/3주 ✓ · 2/3주 · 신청 때는 확인됨 · 계정 없음 + 인정 · 메모는 표기 뺀 나머지", async () => {
  const a = await rowText("데모앱성도라"), b = await rowText("데모앱성도마"), c = await rowText("차하늘");
  expect(a.includes("📏 3/3주 ✓"), a);
  expect(b.includes("📏 2/3주 · 신청 때는 확인됨"), b);
  expect(c.includes("계정 없음 — 주를 셀 수 없어요 · ✅ 인정 · 종이로 암송"), c);
  expect(c.includes("📝 담당자가 더함") && !c.includes("자격 인정:"), "메모에 표기가 보인다: " + c);
  return [a, b, c].join(" ｜ ");
});
await check("A4", "PC 표 — 「주」 칸 하나(직분 뒤) · 여덟 칸", async () => {
  await viewport(1280, 800, false); await open();
  const th = await ev(`[...document.querySelectorAll('.be-table thead th')].map((x) => x.textContent.trim()).join("|")`);
  expect(th.startsWith("이름|소속|직분|주|출처|교적|담당자 메모"), th);
  await viewport(390, 844, true); await open();
  return th;
});
await check("A5", "👥 아직 신청 안 하신 분 — 열 때 불러온다 · 이름 단추 · 신청한 분·못 미친 분은 없다 · 넣기 단추 없음 · 내려받기(네 칸)", async () => {
  expect(!(await has(".be-miss-b .be-name")), "열기 전에 이름을 받았다");
  await click("details.be-miss > summary");
  await waitFor(`(document.querySelector('.be-miss-h')?.textContent || '').includes('아직 신청하지 않으신 분')`, 15000);
  const names = await ev(`[...document.querySelectorAll('.be-miss-b .be-name')].map((x) => x.dataset.name).join(",")`);
  for (const n of ["데모앱성도사", "데모앱성도아"]) expect(names.includes(n), "목록에 없음: " + n + " | " + names);
  for (const n of ["데모앱성도라", "데모앱성도마", "데모앱성도바"]) expect(!names.includes(n), "목록에 있으면 안 됨: " + n);
  expect(!(await has('.be-miss-b [data-act="excuse-add"]')), "이 목록에는 넣기 단추가 없어야 한다");
  const before = downloads.length;
  await click('[data-act="miss-csv"]');
  for (let i = 0; i < 50 && downloads.length === before; i++) await sleep(200);
  expect(downloads.length > before, "내려받기가 시작되지 않았다");
  const fname = downloads[downloads.length - 1];
  expect(/^ca-demo-el-open_미신청_\d+명_\d{8}-\d{4}\.csv$/.test(fname), fname);
  for (let i = 0; i < 25 && !existsSync(join(DL, fname)); i++) await sleep(200);
  const csv = readFileSync(join(DL, fname), "utf8");
  expect(csv.startsWith('\uFEFF"이름","구분","소속","세부"'), csv.slice(0, 60));
  return fname + " · " + names;
});
await check("A6", "✅ 자격 인정(앱 줄 · 다시 센 값이 모자람) — 칩으로 사유 · 인정하기 · 요약 「인정으로 2」 · 줄에 「✅ 인정 · 간병」", async () => {
  await open();
  await rowMenu("데모앱성도마", "✅ 자격 인정");
  await click(".be-modal .be-el-chip", "간병");
  expect((await ev(`document.querySelector('.be-modal [data-f="reason"]').value`)) === "간병", "칩이 칸을 채우지 않았다");
  await click(".be-modal .be-ok");
  await waitToast("님을 인정했어요");
  await waitFor(`(document.querySelector('.be-el-sum')?.textContent || '').includes('인정으로 2')`, 15000);
  const t = await rowText("데모앱성도마");
  expect(t.includes("✅ 인정 · 간병"), t);
  return t;
});
await check("A7", "📝 메모 고치기 — 창은 표기를 뺀 나머지만 · 상한 500-(표기+3) · 저장 뒤에도 표기는 남는다", async () => {
  await rowMenu("데모앱성도마", "📝 메모 고치기");
  const v = await ev(`document.querySelector('.be-modal [data-f="note"]').value`);
  const max = await ev(`document.querySelector('.be-modal [data-f="note"]').maxLength`);
  expect(v === "", "메모 창에 표기가 보인다: " + v);
  expect(max === 500 - ("자격 인정: 간병".length + 3), "상한 " + max);
  await setVal('.be-modal [data-f="note"]', "전화로 여쭘");
  await click(".be-modal .be-ok");
  await waitToast("줄을 고쳤어요");
  await sleep(500);
  const t = await rowText("데모앱성도마");
  expect(t.includes("📝 전화로 여쭘") && t.includes("✅ 인정 · 간병") && !t.includes("자격 인정:"), t);
  return `상한 ${max} · ${t}`;
});
await check("A8", "메모로 「자격 인정:」은 못 적는다 — 창 안 빨간 줄(excuse-via-memo) · 창은 그대로", async () => {
  await rowMenu("데모앱성도마", "📝 메모 고치기");
  await setVal('.be-modal [data-f="note"]', "자격 인정: 흉내");
  await click(".be-modal .be-ok");
  await waitErr("메모로는 바뀌지 않아요");
  const e = await text(".be-modal .be-err");
  await closeModal();
  return e;
});
await check("A9", "↩️ 인정 거두기(앱 줄) — 한 창 두 단계 · 줄은 남고 인정 표시만 없어진다", async () => {
  await rowMenu("데모앱성도마", "↩️ 인정 거두기");
  await click(".be-modal .be-ok");
  await waitFor(`document.querySelector('.be-modal [data-step2]') && !document.querySelector('.be-modal [data-step2]').hidden`, 3000);
  await sleep(800);
  await click(".be-modal .be-ok");
  await waitToast("인정을 거뒀어요");
  await waitFor(`(document.querySelector('.be-el-sum')?.textContent || '').includes('인정으로 1')`, 15000);
  const t = await rowText("데모앱성도마");
  expect(t && !t.includes("✅ 인정"), t);
  return t;
});
await check("A10", "✅ 인정하며 넣기 — 손으로 · 도장 확인 전엔 막힘 · 🔎 도장 확인(주별) · 동의 없으면 빨간 줄 · 넣기 · 명단에 「✅ 인정」", async () => {
  await click('[data-act="excuse-add"]');
  await waitFor(`document.querySelector('.be-modal [data-f="name"]')`, 5000); await sleep(300);
  await setVal('.be-modal [data-f="name"]', "데모앱성도바");
  await pickGu("사랑");
  await setVal('.be-modal [data-f="mok"]', "6");
  await click(".be-modal .be-ok");
  await waitErr("도장 확인");
  await click('.be-modal [data-act="check"]');
  await waitFor(`(document.querySelector('.be-modal [data-check]')?.textContent || '').includes('채운 주')`, 15000);
  const c = await text(".be-modal [data-check]");
  expect(c === "앱 계정 찾음 · 1주 · 2주 ✓ · 3주 · 4주 · 5주 · 6주 · 채운 주 1 / 필요 2 · 남은 주로 닿을 수 있어요", c);
  expect(!(await ev(`document.querySelector('.be-modal [data-appnote]').hidden`)), "앱 계정 안내 줄이 안 보인다");
  await click(".be-modal .be-el-chip", "통신이 끊긴 날");
  await click(".be-modal .be-ok");
  await waitErr("동의");
  await ev(`document.querySelector('.be-modal [data-f="consent"]').click(), true`);
  await click(".be-modal .be-ok");
  await waitToast("명단에 넣었어요");
  await waitFor(`[...document.querySelectorAll('.be-list .be-name')].some((x) => x.dataset.name === "데모앱성도바")`, 15000);
  const t = await rowText("데모앱성도바");
  expect(t.includes("1/2주") && t.includes("✅ 인정 · 통신이 끊긴 날"), t);
  return c + " ｜ " + t;
});
await check("A11", "↩️ 인정 거두고 명단에서 빼기(담당자 줄) — 제목이 먼저 알린다 · 두 단계 · 줄이 빠진다", async () => {
  await rowMenu("데모앱성도바", "↩️ 인정 거두고 명단에서 빼기");
  const title = await text(".be-modal .be-title");
  expect(title.includes("명단에서도 빠져요"), title);
  await click(".be-modal .be-ok"); await sleep(800); await click(".be-modal .be-ok");
  await waitToast("명단에서 뺐어요");
  await waitFor(`![...document.querySelectorAll('.be-list .be-name')].some((x) => x.dataset.name === "데모앱성도바")`, 15000);
  return title;
});
await check("A12", "이미 자격 되신 분·이미 명단에 있는 분 — 도장 확인이 주 값 없이 알린다 · 넣기는 막힌다", async () => {
  await click('[data-act="excuse-add"]');
  await waitFor(`document.querySelector('.be-modal [data-f="name"]')`, 5000); await sleep(300);
  await setVal('.be-modal [data-f="name"]', "데모앱성도사");
  await pickGu("사랑");
  await setVal('.be-modal [data-f="mok"]', "6");
  await click('.be-modal [data-act="check"]');
  await waitFor(`(document.querySelector('.be-modal [data-check]')?.textContent || '').includes('이미 자격이 되셨어요')`, 15000);
  const a = await text(".be-modal [data-check]");
  expect(!a.includes("채운 주"), a);
  await setVal('.be-modal [data-f="name"]', "데모앱성도라");
  await setVal('.be-modal [data-f="mok"]', "5");
  await click('.be-modal [data-act="check"]');
  await waitFor(`(document.querySelector('.be-modal [data-check]')?.textContent || '').includes('이미 명단에 있어요')`, 15000);
  const b = await text(".be-modal [data-check]");
  await ev(`document.querySelector('.be-modal [data-f="consent"]').click(), true`);
  await click(".be-modal .be-el-chip", "간병");
  await click(".be-modal .be-ok");
  await waitErr("이미");
  await closeModal();
  return a + " ｜ " + b;
});
await check("A13", "창 닫기 — 바뀐 입력이면 Esc 에 창 안에서 한 번 더 묻는다 · 뒤로 가기 한 칸이 창만 닫는다", async () => {
  await click('[data-act="excuse-add"]');
  await waitFor(`document.querySelector('.be-modal [data-f="name"]')`, 5000); await sleep(300);
  await setVal('.be-modal [data-f="name"]', "가나다");
  await esc();
  expect(await has(".be-ask:not([hidden])"), "바뀐 입력인데 묻지 않고 닫혔다");
  await click('.be-modal [data-be="leave"]');
  await waitFor(`!document.querySelector('.be-modal')`, 5000);
  const hash = await ev("location.hash");
  await click('[data-act="excuse-add"]');
  await waitFor(`document.querySelector('.be-modal')`, 5000); await sleep(300);
  await ev("history.back(), true"); await sleep(800);
  expect(!(await has(".be-modal")), "뒤로 가기가 창을 닫지 않았다");
  expect((await ev("location.hash")) === hash, "뒤로 가기가 화면까지 옮겼다");
  return hash;
});
await check("A14", "셈이 실패하면 0 이 아니라 「세지 못했어요」 · 명단은 그대로 · 요약 없음 · 주 칸 「—」 · 인정 메뉴를 내지 않는다", async () => {
  failElig = true;
  await tab.send("Fetch.enable", { patterns: [{ urlPattern: "*functions/v1/church-admin*", requestStage: "Request" }] });
  try {
    await tab.send("Page.navigate", { url: "about:blank" }); await sleep(100);
    await tab.send("Page.navigate", { url: `${ORIGIN}/#/be-roster?ev=${EV}` });
    await waitFor(`(document.querySelector('.be-el-rule')?.textContent || '').includes('세지 못했어요')`, 25000);
    const band = await text(".be-el-rule"), sum = await text(".be-el-sum"), a = await rowText("데모앱성도라");
    expect(sum === "", "요약이 숫자를 그렸다: " + sum);
    expect(a.includes("📏 —"), "주 칸이 비었거나 0 이다: " + a);
    await ev(`(() => { const r = ${rowSel("데모앱성도라")}; r.querySelector('[data-act="row"]').click(); return true; })()`);
    await waitFor(`document.querySelector('.pk-dim .pk-opt')`, 5000); await sleep(350);
    const opts = await ev(`[...document.querySelectorAll('.pk-dim .pk-opt')].map((x) => x.textContent.replace(/\\s+/g, " ").trim()).join(" | ")`);
    await esc();
    expect(opts.startsWith("📝 메모 고치기") && !opts.includes("자격 인정"), opts);
    return band + " ｜ " + opts;
  } finally {
    failElig = false;
    await tab.send("Fetch.disable");
  }
});
await check("A15", "폰 폭 360px — 규칙 띠·요약·주 칸이 옆으로 넘치지 않는다", async () => {
  await viewport(360, 740, true); await open();
  const w = await ev(`({ sw: document.documentElement.scrollWidth, iw: innerWidth })`);
  expect(w.sw <= w.iw + 1, JSON.stringify(w));
  return JSON.stringify(w);
});

writeFileSync(join(HERE, "ae-results.json"), JSON.stringify({ at: new Date().toISOString(), results, sys: SYS }, null, 2));
const pass = results.filter((r) => r.ok).length;
console.log(`\n통과 ${pass} · 실패 ${results.length - pass} · 시스템 창 ${SYS.length}`);
await fetch(`${CDP}/json/close/${info.id}`).catch(() => {});
process.exit(results.length - pass || SYS.length ? 1 : 0);
```

- [ ] **Step 3: http·헤드리스 크롬 켜기(PowerShell 도구 · 이 세션이 띄운 PID 만 적어 둔다)**

```powershell
$wt = "C:\Projects\church-admin\.worktrees\autumn-excuse"
$h = "C:\Projects\church-admin\.superpowers\sdd\autumn-excuse\harness"
$http = Start-Process -FilePath python -ArgumentList "-m","http.server","8851","--bind","127.0.0.1","--directory",$wt -WindowStyle Hidden -PassThru
$chrome = Start-Process -FilePath "C:\Program Files\Google\Chrome\Application\chrome.exe" -ArgumentList "--headless=new","--remote-debugging-port=9851","--user-data-dir=$h\chrome-profile","--no-first-run","--no-default-browser-check","about:blank" -WindowStyle Hidden -PassThru
"http=$($http.Id)`nchrome=$($chrome.Id)" | Out-File -Encoding utf8 "$h\ae.pids"
Get-Content "$h\ae.pids"
```
Expected: `http=<PID>` · `chrome=<PID>`. 8851·9851 이 이미 쓰이고 있으면(다른 세션) 다른 두 번호로 바꾸고 `ae-check.mjs` 의 `CDP`·`ORIGIN` 도 맞춘다 — **남의 프로세스를 끄지 않는다.**

- [ ] **Step 4: 개발 함수가 워크트리 판인가 · 시드 · 계정 · 확인 돌리기**

```bash
cd /c/Projects/church-admin/.worktrees/autumn-excuse
git status --short                                   # 비어야 한다
supabase functions deploy church-admin --no-verify-jwt --project-ref ktpwthwqzgcqcrmsafdo   # 다른 세션이 main 판을 올렸을 수 있다 — 다시 올린다
set -a; . ~/.church-admin/dev.env; set +a
node --experimental-strip-types tests/seed-bible-events-dev.mjs 2>&1 | grep -E '^(넣었다|자격 인정 확인용)'
H=/c/Projects/church-admin/.superpowers/sdd/autumn-excuse/harness
node $H/ae-auth.mjs
node $H/ae-check.mjs
```
Expected: `Deployed Functions …` · `넣었다: 회차 4 …` · `준비됨 ca-demo-ae-be-1@example.test · 역할 bibleevent` · `양성 대조 통과 — 시스템 창 감시 켜짐` · `통과  A1` … `통과  A15` · 끝줄 **`통과 15 · 실패 0 · 시스템 창 0`**.
- `실패` 가 있으면 증거 줄을 보고 **해당 과제로 돌아가** 순수 시험을 먼저 더해 고친 뒤(새 커밋) Step 4 를 처음부터 다시 돈다(시드를 다시 심어야 A6~A12 의 자료가 처음 모양이다).
- 하네스 자체의 한계(헤드리스에서 안 되는 조작)로 실패한 것은 `harness-limit` 으로 따로 적고, 그 항목은 Step 6 에서 사람이 눈으로 본다.

- [ ] **Step 5: 정적 확인 · 정리**

```bash
cd /c/Projects/church-admin/.worktrees/autumn-excuse
grep -rnE 'alert\(|confirm\(|prompt\(|<select|type="date"' js/menus/bibleevent/ | grep -v '^\S*:[0-9]*:\s*//' || echo "시스템 창·select·날짜 칸 없음(주석 빼고)"
node --experimental-strip-types --test tests/be-excuse-form.test.mjs 2>&1 | tail -2
node /c/Projects/church-admin/.superpowers/sdd/autumn-excuse/harness/ae-auth.mjs --clean
```
그리고 PowerShell 로 이 세션이 띄운 두 PID 만 끈다(이미지 이름으로 끄지 않는다 — 다른 세션의 크롬까지 닫힌다):
```powershell
$h = "C:\Projects\church-admin\.superpowers\sdd\autumn-excuse\harness"
Get-Content "$h\ae.pids" | ForEach-Object { $p = [int]($_ -split "=")[1]; try { Stop-Process -Id $p -Force -ErrorAction Stop } catch {} }
Get-NetTCPConnection -LocalPort 8851,9851 -State Listen -ErrorAction SilentlyContinue | Measure-Object | Select-Object -ExpandProperty Count
```
Expected: `시스템 창·select·날짜 칸 없음(주석 빼고)` · `# fail 0` · `지움 ca-demo-ae-be-1@example.test 200` · 마지막 `0`(두 포트가 비었다).
개발 `ca-demo-` 회차는 친구 확인용으로 남긴다(다시 심으면 처음 모양).

- [ ] **Step 6: localhost 에서 친구와 확인(친구가 「헤드리스 결과로 됐다」고 하면 건너뛴다)**

```bash
cd /c/Projects/church-admin/.worktrees/autumn-excuse
set -a; . ~/.church-admin/dev.env; set +a
node --experimental-strip-types tests/seed-bible-events-dev.mjs 2>&1 | grep -E '^(넣었다|자격 인정 확인용)'
python -m http.server 8000 --bind 127.0.0.1
```
친구가 `http://localhost:8000/#/be-roster?ev=ca-demo-el-open` 을 열어(오른쪽 위 「개발 DB」 띠 · 카카오 로그인 · 「성경필사(암송)」 역할) 본다:
- ☐ 규칙 띠·요약 글이 설계 4절 문장과 같다 · 폰(좁은 창)과 PC(넓은 창) 모두 넘치지 않는다
- ☐ 줄 메뉴가 줄마다 설계 4절 표대로 · 「✅ 자격 인정」 창의 칩·병명 안내·「계정이 갈림」 한 줄
- ☐ 「✅ 인정하며 넣기」 — 「🔎 찾기」 후보 고르개 · 도장 확인 글 · 「찾아본 분의 이름이 기록에 남아요」 · 동의 칸 · 앱 계정 안내 한 줄
- ☐ 👥 접힘 칸 — 이름 단추를 누르면 교적 창 · 「⬇️ 이 목록 내려받기」 파일을 엑셀로 열면 한글이 깨지지 않는다
- ☐ `#/be-roster?ev=ca-demo-el` — 「✅ 인정하며 넣기」 대신 「인정은 신청이 열린 날(10월 27일)부터 할 수 있어요」 한 줄 · 👥 칸은 「10월 27일 신청이 열린 뒤에 보여요」
- ☐ 총괄 계정으로 📜 바꾼 기록 — 「성경필사 자격 인정」·「성경필사 도장 확인(보기)」·「성경필사 미신청 목록(보기)」 줄에 사유 글이 없다
- ☐ 어느 동작에서도 브라우저·시스템 창이 안 뜬다

`C:\Projects\church-admin\.superpowers\sdd\bible-events\progress.md` 끝에 한 줄:
`가을 인정 Task 10 (<날짜>): 헤드리스 15 통과 · 0 실패 · 시스템 창 0(양성 대조 확인) · 친구 확인 <됨/생략> · 고친 것 <없음 또는 커밋 목록>`

**친구가 「열어도 된다」고 할 때까지 Task 11 로 가지 않는다.**

---

### Task 11: 운영 여는 날 — 1단계(읽기) · 2단계(쓰기)

설계 7절을 따른다. 운영 표는 안 고치고 새 역할도 없다 — **코드만**이다.
- **1단계(읽기)** — 교회 어드민 운영 함수(읽기 둘 · `evRowSave` 표기 지킴 · 쓰기 셋은 `EXCUSE_LIVE_PROD = false` 로 닫힌 채) → church-admin 푸시(화면 + `privacy.html` 7번). 성경암송은 건드리지 않는다. 쓰는 곳이 안 바뀌므로 「두 곳이 쓰는 창」이 생기지 않는다. 날짜: **10/13(화)~10/16(금)**.
- **2단계(쓰기) — 같은 날 차례로**: ⓐ 성경암송 `api` 얼리기(`eventExcuse` → `EVT_MOVED` 넷) + `eventRoster` 의 `note` 빼기(개발 → 운영) → ⓑ 게이트를 연 교회 어드민 **운영 함수** → ⓒ church-admin **푸시** → ⓓ 역할 받은 분 확인 → 성경암송 `admin-event.html`·`admin.html`·문서 푸시 → 표식 확인. 날짜: **목표 10/20(화) · 늦어도 10/26(월)**. 「쓰는 곳이 없는 창」은 ⓐ~ⓑ 사이 몇 분뿐(10/27 전이면 줄이 없어 아무 일도 없다 · 그 뒤라도 그 몇 분의 문의는 종이로). 「두 곳이 쓰는 창」은 만들지 않는다 — 그래서 얼림이 먼저다.

> ⚠️ **배포 금지 10/10(토)~10/12(월).** 모든 운영 쓰기(함수 셋 · 푸시 셋)는 **친구가 옆에 있고 허락한 뒤**에 한다. auto mode 가 운영 쓰기를 막으면 우회하지 않고 친구에게 묻는다.
> ⚠️ 성경암송 관리자 비밀번호는 대화·파일·명령 출력에 **찍지 않는다**. 스모크의 `ADMIN_PW` 는 친구가 허락하면 성경암송 `.env.dev`(`ADMIN_SECRET` — 개발)·`.env`(`PROD_ADMIN_SECRET` — 운영)에서 값을 찍지 않고 읽는다(아래 명령 그대로 · `echo`·`set -x` 금지). 허락하지 않으면 친구가 자기 창에서 `read -rs ADMIN_PW && export ADMIN_PW` 로 친다.
> ⚠️ 셸 상태는 명령마다 사라진다 — 단계마다 변수를 다시 적는다. 작업 파일은 저장소 밖 `~/.church-admin/launch-autumn-excuse/`(`C:\Users\sewki\.church-admin\launch-autumn-excuse\`).
> ⚠️ 성경암송 저장소는 여러 세션이 한 체크아웃을 함께 쓴다 — `git add -A`·`commit -a`·넓은 `restore/reset/stash` 금지 · 커밋 뒤 `git show --stat` · `supabase functions deploy` 는 작업 트리를 올리므로 성경암송 `api` 는 **내 커밋을 `git archive` 로 푼 폴더**에서만 올린다.
> ⚠️ 두 저장소 모두 줄 번호로 찾지 않는다 — 앵커 글 · `grep -c` 로 한 번만 나오는지 먼저.

**Files:**
- 교회 어드민(워크트리 → main): `CLAUDE.md`(표식 글 둘 · 2단계 두 줄) · `supabase/functions/church-admin/index.ts`(`EXCUSE_LIVE_PROD` — 2단계) · `js/menus/bibleevent/elig-logic.js`(`EXCUSE_UI_PROD` — 2단계)
- 성경암송 `C:\Projects\bible-memorize-church-app-v2`(2단계만):
  - Modify: `supabase/functions/api/index.ts` — 앵커 `const EVT_MOVED = new Set(["eventImport", "eventSave", "eventSetNote"]);` · 「남긴 것」 주석 한 줄 · `async function eventExcuse(b: any) {` 머리 · `eventRoster` 의 `    phone: r.phone ?? "", memo: r.memo ?? "", note: r.note ?? "",`
  - Modify: `tests/event-smoke.sh` — 5-1 제목·건너뜀 줄·넷째 줄 · 6) 두 줄
  - Modify(스크립트): `admin-event.html` · `admin.html` · `docs/notes/bible-events-admin.md` · `CLAUDE.md`(표의 「이벤트 명단」 줄)

**Interfaces:**
- Consumes: 가지 `autumn-excuse` 끝(Task 1~10 · Task 10 친구 OK) · Task 8 의 표식 글 둘과 게이트 줄·「남긴 것」 줄 · 성경암송 얼림 자리(`EVT_MOVED` · 커밋 `1498177` 판)
- Produces: 운영 교회 어드민 함수(새 액션 다섯) · admin.onlybible.kr 화면 · 운영 성경암송 `api` 에서 `eventExcuse` 가 비밀번호가 맞으면 `{ok:false, error:"moved-to-church-admin"}`(없거나 틀리면 예전처럼 `unauthorized`) · `eventRoster` 줄에 `note` 없음 · `admin.html` 타일 둘 · 옛 화면 보기·인쇄 전용 · 문서

#### 1단계(읽기)

- [ ] **Step S1-0: 여는 날 확인 — 여섯 가지가 모두 「예」일 때만**

```bash
python -c "import datetime as d;print(d.datetime.now(d.timezone(d.timedelta(hours=9))).strftime('%Y-%m-%d %H:%M'))"
PYTHONIOENCODING=utf-8 python -c "import datetime as d;t=d.datetime.now(d.timezone(d.timedelta(hours=9))).date();print(t, '배포 금지(10/10~10/12)' if d.date(2026,10,10)<=t<=d.date(2026,10,12) else ('1단계 전(10/13 부터)' if t<d.date(2026,10,13) else '운영 쓰기 가능한 날'))"
cd /c/Projects/church-admin/.worktrees/autumn-excuse
git status --short; git log --oneline -1
python tools/preflight.py | tail -1
mkdir -p ~/.church-admin/launch-autumn-excuse
```
1. 둘째 줄 끝이 **`운영 쓰기 가능한 날`** 이다(한국 날짜 10/13 이후 — 10/10~10/12 는 배포 금지, 그 전은 설계 날짜표상 1단계 전 · 사람이 달력을 세지 않는다).
2. Task 10 에서 친구가 「열어도 된다」고 했다.
3. 워크트리 status 가 비었다 · preflight `모두 통과`.
4. 다른 세션: `ListAgents` 로 본다. church-admin 을 고치는 세션이 있으면 `SendMessage` 로 묻고 답을 받는다 — 「오늘 교회 어드민 함수를 운영에 배포하고 main 을 푸시합니다(가을 말씀 동행 1단계). 커밋 안 한 것·배포 안 한 커밋이 있나요? 끝났다고 할 때까지 함수 배포와 main 푸시를 미뤄 주실 수 있나요?」
5. 친구가 옆에 있고 운영 쓰기(함수 하나 · 푸시 하나)를 허락했다.
6. 친구가 **역할 받을 분이 모두 운영진(신앙운동팀)** 임을 다시 확인했다(물음 18 — 1단계부터 미신청 목록이 운영에 있다).

- [ ] **Step S1-1: main 따라잡기 · 개발 다시 시험(운영 쓰기 없음)**

```bash
cd /c/Projects/church-admin
git fetch origin
git status -sb | head -1
git log --oneline origin/main..main
git log --oneline autumn-excuse..main
```
Expected: 첫 줄 `## main...origin/main`(`[behind N]` 는 괜찮다) · 둘째 명령 **아무것도 없음**(있으면 로컬 main 에 남의 안 나간 커밋 — 멈추고 친구에게) · `behind` 면 `git merge --ff-only origin/main`.
셋째 명령이 커밋을 찍으면 가지에 먼저 합쳐 시험한다:
```bash
cd /c/Projects/church-admin/.worktrees/autumn-excuse
git merge main -m "merge: main 을 autumn-excuse 로(가을 인정 1단계 전)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git status --short
python tools/preflight.py | tail -1
supabase functions deploy church-admin --no-verify-jwt --project-ref ktpwthwqzgcqcrmsafdo
set -a; . ~/.church-admin/dev.env; set +a
node --experimental-strip-types --test tests/server.dev.test.mjs 2>&1 | grep -E '^not ok|^# (pass|fail)|정리 실패'
```
Expected: 빈 status · `모두 통과` · `Deployed …` · `# fail 0`. 충돌이 나면 **양쪽을 다 살린다**(목록·표·import 문은 두 쪽 줄을 모두) — 그래도 모르겠으면 멈추고 친구에게. 합친 뒤 화면이 크게 바뀌었으면 Task 10 Step 4 를 다시 돈다.
합친 뒤 **줄 짓기 맞추기**(계획이 고른 해석 ⑫ — main 의 evRowAdd 가 새 줄 짓기를 얻었는데 evExcuseAdd 는 모른다):
```bash
cd /c/Projects/church-admin/.worktrees/autumn-excuse
F=supabase/functions/church-admin/index.ts
echo "pastEventCreatedAt 부르기 $(grep -c 'pastEventCreatedAt(' $F) · evExcuseAdd 안 $(sed -n '/^async function evExcuseAdd(/,/^}/p' $F | grep -c 'pastEventCreatedAt(')"
```
Expected: `0 · 0`(be-decide 가 아직 main 밖) 또는 `3 · 1`(들어왔고 evExcuseAdd 도 맞춰 있다). **`2 · 0`** 이면 Task 4 Step 7 끝의 「be-decide 가 들어왔으면」 Edit 을 지금 하고, 새 커밋(`fix(성경필사): 인정하며 넣기도 지난 회차 줄의 낸 날을 마감일로 — evRowAdd 와 같은 줄 짓기(be-decide M2)`) → preflight → 개발 배포 → 개발 시험 → 이 단계 처음부터.

- [ ] **Step S1-2: 운영 다시 읽기(Task 1 Step 5 의 파일 그대로)**

```bash
cat ~/.church-admin/supa-prod/supabase/.temp/project-ref; echo      # xnomlgydifiqiybervtf
supabase --workdir ~/.church-admin/supa-prod db query --linked -f C:/Users/sewki/.church-admin/autumn-excuse/checks-prod.sql
```
Expected: Task 1 과 같은 판정(`excused=true` 없음 · 표기 0 · `autumn event | open | 2026-10-27 | 2026-11-28 | 2026-12-13 | …`(10/11 에 담당자가 열었다) · 활동 수백 이하). 가을 회차가 아직 `draft` 면 친구에게 알린다(10/11 개시를 잊었을 수 있다 — 이 작업과 무관하게 회차 설정에서 연다).

- [ ] **Step S1-3: `CLAUDE.md` 1단계 날짜(Edit)**

```bash
cd /c/Projects/church-admin/.worktrees/autumn-excuse
python -c "import datetime as d;print(d.datetime.now(d.timezone(d.timedelta(hours=9))).strftime('%Y-%m-%d'))"
grep -c "1단계(읽기) 개발 중 — 여는 날 날짜를 적는다" CLAUDE.md
```
Expected: 오늘 · `1`. **Edit 도구로**(CRLF — `sed -i` 금지) old `1단계(읽기) 개발 중 — 여는 날 날짜를 적는다` → new `1단계(읽기) YYYY-MM-DD 운영 개시`(YYYY-MM-DD 는 위에서 찍은 오늘).
```bash
cd /c/Projects/church-admin/.worktrees/autumn-excuse
git diff --stat
git add CLAUDE.md
git commit -m "docs(성경필사): 가을 말씀 동행 1단계(읽기) 운영 개시 날짜" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git status --short
```
Expected: `CLAUDE.md | 2 +-` · 빈 status.

- [ ] **Step S1-4: 교회 어드민 운영 함수 — 워크트리 그대로(쓰기 셋은 닫힌 판)**

먼저 **지금 운영에 떠 있는 판**을 내려받아 main 과 견준다 — 이 배포는 워크트리를 통째로 올리므로 main 에 들어와 있지만 아직 운영에 안 나간 **남의 커밋**(예: 🧪 시험 참여자 서버 액션)까지 함께 내보내고, 운영에만 있고 커밋이 없는 코드는 지운다:
```bash
cd /c/Projects/church-admin
L=~/.church-admin/launch-autumn-excuse; rm -rf "$L/pre-ca-s1"; mkdir -p "$L/pre-ca-s1/supabase"
supabase functions download church-admin --project-ref xnomlgydifiqiybervtf --use-api --workdir "$(cygpath -w "$L/pre-ca-s1")"
D=$(dirname "$(find "$L/pre-ca-s1" -name index.ts | head -1)"); echo "$D"
for f in $(git ls-files supabase/functions/church-admin | sed 's#supabase/functions/church-admin/##'); do
  if diff -q <(tr -d '\r' < "$D/$f" 2>/dev/null) <(git show main:supabase/functions/church-admin/$f | tr -d '\r') >/dev/null; then echo "같음 $f"; else echo "다름 $f"; fi
done
```
Expected: 모든 줄 `같음`(운영 = main). `다름` 이 있으면 **배포하지 않고** 그 파일의 차이(`diff <(tr -d '\r' < "$D/<파일>") <(git show main:supabase/functions/church-admin/<파일> | tr -d '\r')`)를 친구에게 보인다 — main 에 운영에 안 나간 남의 커밋이 있으면 그 커밋의 주인(S1-0 ④ 에서 물은 세션)이 「함께 나가도 된다」고 한 뒤에만 간다.
```bash
cd /c/Projects/church-admin
git fetch origin; git log --oneline main..origin/main; git log --oneline origin/main..main; git log --oneline autumn-excuse..main
cd /c/Projects/church-admin/.worktrees/autumn-excuse
git status --short
grep -cF 'const EXCUSE_LIVE_PROD = false;' supabase/functions/church-admin/index.ts      # 1 — 1단계는 닫힌 판이어야 한다
git rev-parse HEAD > ~/.church-admin/launch-autumn-excuse/ca-s1-sha.txt
supabase functions deploy church-admin --no-verify-jwt --project-ref xnomlgydifiqiybervtf
L=~/.church-admin/launch-autumn-excuse; rm -rf "$L/dl-ca-s1"; mkdir -p "$L/dl-ca-s1/supabase"
supabase functions download church-admin --project-ref xnomlgydifiqiybervtf --use-api --workdir "$(cygpath -w "$L/dl-ca-s1")"
D=$(dirname "$(find "$L/dl-ca-s1" -name index.ts | head -1)"); echo "$D"
for f in $(git ls-files supabase/functions/church-admin | sed 's#supabase/functions/church-admin/##'); do
  if diff -q <(tr -d '\r' < "$D/$f" 2>/dev/null) <(git show HEAD:supabase/functions/church-admin/$f | tr -d '\r') >/dev/null; then echo "같음 $f"; else echo "다름 $f"; fi
done
grep -c 'case "evEligRows"\|case "evExcuseAdd"' "$D/index.ts"
grep -cF 'const EXCUSE_LIVE_PROD = false;' "$D/index.ts"
curl -s -w "  HTTP %{http_code}\n" -X POST https://xnomlgydifiqiybervtf.supabase.co/functions/v1/church-admin -H "Content-Type: application/json" -d '{"action":"evEligRows"}'
```
Expected: `git log` 셋 모두 비었다 · 빈 status · `1` · `Deployed Functions on project xnomlgydifiqiybervtf: church-admin` · 모든 줄 `같음`(`events-elig.ts` 포함 — 2026-09-30 기준 열셋 + 하나 = 열넷, 그 사이 다른 세션이 모듈을 더했으면 그만큼 더) · `2` · `1` · `{"ok":false,"error":"unauthenticated"}  HTTP 401`.
`다름`·빠진 파일이 있으면 **푸시하지 않고** 다시 배포한다(모듈 하나가 빠지면 모든 요청이 500).

- [ ] **Step S1-5: main 합치기 · 푸시(= 운영 화면) · 이번 판에만 있는 표식**

```bash
cd /c/Projects/church-admin
git fetch origin; git log --oneline main..origin/main; git log --oneline origin/main..main
git status --short     # main 체크아웃은 다른 세션도 쓴다 — 커밋 안 한 남의 파일이 합치기와 겹치면 git 이 멈춘다(그러면 그 세션과 차례를 정한다 · stash·restore 로 치우지 않는다)
git merge --no-ff autumn-excuse -m "merge: 가을 말씀 동행 자격 1단계(autumn-excuse) — 주 수·미신청 목록·메모 표기 지킴 · 인정 셋은 운영 게이트로 닫힘" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
test "$(git rev-parse 'main^{tree}')" = "$(git rev-parse 'autumn-excuse^{tree}')" && echo "합친 판 = 시험한 판"
git log --oneline origin/main..main | head -30
git push origin main
SHA=$(git rev-parse HEAD); RUN=""
for i in 1 2 3 4 5 6 7 8 9 10; do RUN=$(gh run list -R sewoongkim1/church-admin --workflow deploy.yml --commit "$SHA" --limit 1 --json databaseId -q '.[0].databaseId'); [ -n "$RUN" ] && break; python -c "import time;time.sleep(3)"; done
echo "RUN=$RUN (커밋 $SHA 의 실행 — 비었으면 멈추고 Actions 화면을 본다)"; gh run watch -R sewoongkim1/church-admin "$RUN" --exit-status
```
Expected: `git log` 둘 비었다 · 충돌 없음 · `합친 판 = 시험한 판` · 나갈 목록은 이 가지의 커밋과 합치기 커밋뿐 · Actions ✓(배포 전 점검 → 캐시 해시 → Pages).

표식 — 이전 판에 **없던 파일**의 해시(저장소 원본으로 잰다 · 이 PC 는 CRLF):
```bash
cd /c/Projects/church-admin
for f in js/menus/bibleevent/elig-logic.js js/menus/bibleevent/excuse-form.js js/menus/bibleevent/roster-ui.js; do
  LOCAL=$(git show HEAD:$f | python -c "import sys,hashlib;print(hashlib.sha1(sys.stdin.buffer.read()).hexdigest()[:10])")
  LIVE=$(curl -s "https://admin.onlybible.kr/?t=$(date +%s)" | grep -o "$f?v=[0-9a-f]*" | head -1 | cut -d= -f2)
  echo "$f local $LOCAL · live $LIVE $([ "$LOCAL" = "$LIVE" ] && echo 같음 || echo 다름)"
done
curl -s "https://admin.onlybible.kr/privacy.html?t=$(date +%s)" | grep -c "꾸준함을 재는 회차"
```
Expected: 세 줄 `같음` · `3`. `다름`·빈 값이면 CDN 이 옛 판이다 — 1~2분 뒤 다시(10분이 넘으면 Actions 로그를 본다).

- [ ] **Step S1-6: 친구 읽기 확인(운영 · 읽기만)**

친구(총괄 또는 「성경필사(암송)」 역할)가 admin.onlybible.kr → 📋 회차·명단 → 「가을 말씀 동행」:
- ☐ 규칙 띠 「📏 도장 기간 10.11 ~ 11.21 · … · 지금: 측정 중 · ○월 ○일 ○○:○○ 에 센 값」
- ☐ 요약 「명단 0명 · 자격 됨 0명(주로 채움 0 · 인정으로 0) · 계정 없음 0명」(10/27 전)
- ☐ 「✅ 인정하며 넣기」 단추 대신 「인정은 신청이 열린 날(10월 27일)부터 할 수 있어요」 한 줄
- ☐ 👥 접힘 칸을 열면 「10월 27일 신청이 열린 뒤에 보여요」
- ☐ 다른 회차(사순절 등)는 예전 그대로(주 칸·띠 없음 · 「＋ 한 분 더하기」 있음)

- [ ] **Step S1-7: 기록**

`C:\Projects\church-admin\.superpowers\sdd\bible-events\progress.md` 끝에:
`가을 인정 1단계 LIVE (<날짜>): 운영 함수 $(cat ~/.church-admin/launch-autumn-excuse/ca-s1-sha.txt) · 파일 14 같음 · 게이트 닫힘(EXCUSE_LIVE_PROD=false) · main 합침·푸시 · 라이브 elig-logic.js·excuse-form.js·roster-ui.js 해시 같음 · privacy 7번 · 친구 읽기 확인`
워크트리·가지는 2단계까지 둔다.

#### 2단계(쓰기) — 같은 날 차례로

- [ ] **Step S2-0: 여는 날 확인 — 여덟 가지가 모두 「예」일 때만**

```bash
python -c "import datetime as d;print(d.datetime.now(d.timezone(d.timedelta(hours=9))).strftime('%Y-%m-%d %H:%M'))"
PYTHONIOENCODING=utf-8 python -c "import datetime as d;t=d.datetime.now(d.timezone(d.timedelta(hours=9))).date();print(t, '배포 금지(10/10~10/12)' if d.date(2026,10,10)<=t<=d.date(2026,10,12) else ('1단계 전(10/13 부터)' if t<d.date(2026,10,13) else ('늦어도 날(10/26)을 넘김 — 친구에게 알린다' if t>d.date(2026,10,26) else '운영 쓰기 가능한 날')))"
```
1. 1단계가 운영에 있다(S1-7).
2. 둘째 줄 끝이 `운영 쓰기 가능한 날` 이다. **`늦어도 날(10/26)을 넘김`** 이면 친구에게 알리고 진행한다(10/27 부터 사정 문의가 들어온다 — 그동안은 종이로 받는다). `배포 금지`·`1단계 전` 이면 멈춘다.
3. 친구 결정 넷(설계 ★)과 권하는 기본값이 그대로다 — 친구에게 한 번 더 묻는다.
4. 친구가 **「성경필사(암송)」 역할을 받을 분(담당자)이 누구이고 모두 운영진(신앙운동팀)** 임을 확인했다(물음 14·18 — ⓓ 전에 역할을 준다).
5. 성경암송 담당자가 지금 옛 화면에서 인정을 누르고 있지 않다(옛 인정 단추는 한 번도 안 떴다 — 설계 0절 1).
6. 다른 세션: `ListAgents` → 성경암송·교회 어드민을 고치는 세션에 `SendMessage` — 「오늘 성경암송 api 를 개발·운영에 배포합니다(eventExcuse 얼림 · eventRoster note 빼기). 교회 어드민 함수도 운영에 배포하고 main 을 푸시하고, 성경암송 main 도 푸시합니다. api 에 커밋 안 한 것·배포 안 한 커밋이 있나요? 끝났다고 할 때까지 두 저장소의 함수 배포와 main 푸시를 미뤄 주실 수 있나요?」 — 답을 받는다.
7. 친구가 옆에 있고 운영 쓰기(함수 둘 · 푸시 둘)를 허락했다.
8. 스모크 비밀번호를 어떻게 넣을지 친구와 정했다(`.env` 에서 찍지 않고 · 또는 친구가 직접).

- [ ] **Step S2-1: 성경암송 글 네 곳 — 스크립트 준비 · 앵커만 확인(`--check` · 아무것도 쓰지 않는다)**

Write 로 `C:\Users\sewki\.church-admin\launch-autumn-excuse\autumn_v2_docs.py`:
```python
# -*- coding: utf-8 -*-
# 가을 말씀 동행 자격 인정 2단계 — 성경암송 쪽 글 네 곳(admin-event.html · admin.html · docs/notes/bible-events-admin.md · CLAUDE.md)을 한 번에.
#   python autumn_v2_docs.py --check   앵커만 본다(아무 파일도 안 쓴다) — 2단계 ⓐ(얼리기) 전에
#   python autumn_v2_docs.py           쓴다 — ⓒ(교회 어드민 푸시)와 역할 확인 뒤(ⓓ)에
# 앵커가 **정확히 한 번** 맞을 때만 쓰고, 하나라도 어긋나면 아무 파일도 안 쓰고 멈춘다. 줄 끝(CRLF/LF)은 파일 것을 그대로 둔다.
import datetime, os, sys

V2 = r"C:\Projects\bible-memorize-church-app-v2"
CHECK = "--check" in sys.argv
TODAY = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9))).strftime("%Y-%m-%d")   # 한국 날짜
out = {}

def load(rel):
    raw = open(os.path.join(V2, rel), "rb").read().decode("utf-8")
    return raw, ("\r\n" if "\r\n" in raw else "\n"), raw.replace("\r\n", "\n")

def patch(rel, pairs, cuts=()):
    raw, nl, s = load(rel)
    for start, end, repl in cuts:                       # start 부터 end 앞까지 걷어 낸다
        if s.count(start) != 1 or s.count(end) != 1: sys.exit(f"{rel}: 걷어 낼 자리가 한 번이 아니다 — 멈춘다: {start[:40]!r}")
        a, b = s.index(start), s.index(end)
        if a > b: sys.exit(f"{rel}: 걷어 낼 자리 차례가 틀렸다 — 멈춘다")
        s = s[:a] + repl.replace("{TODAY}", TODAY) + s[b:]
    for old, new in pairs:
        n = s.count(old)
        if n != 1: sys.exit(f"{rel}: 한 번이어야 하는데 {n}번 — 멈춘다: {old[:60]!r}")
        s = s.replace(old, new.replace("{TODAY}", TODAY))
    out[rel] = s.replace("\n", nl).encode("utf-8")

# ① admin-event.html — 보기·인쇄 전용으로(인정 단추·askExcuse·admErr·prompt/alert 걷기 · CSV 다섯 칸·미신청 배지 걷기 · 띠·머리 주석)
patch("admin-event.html", [
  ("    ⚠️ 교회 어드민으로 옮김(2026-09-30): 회차 만들기·설정·담당자 메모·명단 고치기는 admin.onlybible.kr 「성경필사(암송)」.\n"
   "       서버 eventSave·eventSetNote·eventImport 는 moved-to-church-admin(얼림). 이 화면에 남은 것은\n"
   "       명단 보기·인쇄·CSV·자격 인정(eventExcuse)뿐 — 설계 docs/superpowers/specs/2026-09-29-church-admin-bible-events-design.md §4\n",
   "    ⚠️ 교회 어드민으로 옮김(2026-09-30 · {TODAY}): 회차 만들기·설정·담당자 메모·명단 고치기·자격 인정·아직 신청 안 하신 분은\n"
   "       admin.onlybible.kr 「성경필사(암송)」. 서버 eventSave·eventSetNote·eventImport·eventExcuse 는 moved-to-church-admin(얼림)이고\n"
   "       eventRoster 는 담당자 메모(note)를 싣지 않는다. 이 화면에 남은 것은 명단 보기·인쇄·CSV 뿐 —\n"
   "       설계 docs/superpowers/specs/2026-09-29-church-admin-bible-events-design.md §4 · 2026-09-30-church-admin-autumn-excuse-design.md §5\n"),
  ("// ⚠️ 회차 만들기·설정·담당자 메모·명단 고치기는 교회 어드민 한 곳에서 한다(2026-09-30 부터).\n"
   "//    서버 eventSave·eventSetNote·eventImport 는 moved-to-church-admin 을 돌려준다(얼림) — 여기에 저장 단추를\n"
   "//    되살려도 저장되지 않는다. 남은 쓰기는 자격 인정(eventExcuse)뿐(가을 말씀 동행 · 다음 단계에서 옮긴다).\n"
   "//    docs/notes/bible-events-admin.md\n"
   "const MOVED_HTML = `<div class=\"moved no-print\">회차 만들기·설정과 담당자 메모는 <b>교회 어드민 → 성경필사(암송)</b>에서 합니다 —\n"
   "  <a href=\"https://admin.onlybible.kr/#/be-roster\" target=\"_blank\" rel=\"noopener\">admin.onlybible.kr</a>\n"
   "  (카카오 로그인 · 「성경필사(암송)」 역할)</div>`;\n",
   "// ⚠️ 회차 만들기·설정·담당자 메모·명단 고치기·자격 인정은 교회 어드민 한 곳에서 한다(2026-09-30 · {TODAY} 부터).\n"
   "//    서버 eventSave·eventSetNote·eventImport·eventExcuse 는 moved-to-church-admin 을 돌려준다(얼림) — 여기에 저장·인정 단추를\n"
   "//    되살려도 저장되지 않는다. 이 화면은 보기·인쇄 전용이다. docs/notes/bible-events-admin.md\n"
   "const MOVED_HTML = `<div class=\"moved no-print\">회차 만들기·설정과 담당자 메모는 <b>교회 어드민 → 성경필사(암송)</b>에서 합니다 —\n"
   "  <a href=\"https://admin.onlybible.kr/#/be-roster\" target=\"_blank\" rel=\"noopener\">admin.onlybible.kr</a>\n"
   "  (카카오 로그인 · 「성경필사(암송)」 역할)<br>\n"
   "  자격 인정과 아직 신청 안 하신 분은 <b>교회 어드민 → 성경필사(암송) → 📋 가을 말씀 동행</b>에서 봅니다 —\n"
   "  <a href=\"https://admin.onlybible.kr/#/be-roster?ev=autumn-2026\" target=\"_blank\" rel=\"noopener\">admin.onlybible.kr/#/be-roster?ev=autumn-2026</a></div>`;\n"),
  ("      ${evMissing.length ? `<span class=\"tag\">아직 신청 안 하신 분 ${evMissing.length}명${\n"
   "        evMissingTotal > evMissing.length ? ` 외 ${evMissingTotal - evMissing.length}명` : \"\"}</span>` : \"\"}\n", ""),
  ("          ${r.weeksDone == null ? \"\" : ` <button class=\"btn no-print\" data-excuse=\"${r.id}\" data-on=\"${r.excused?0:1}\">${r.excused?\"인정 취소\":\"인정\"}</button>`}\n", ""),
  ("  //    둘을 한 칸에 뭉치면 성도님이 하신 말이 사라진다 — 칸을 나눠 싣는다. 인정 사유도 함께.\n"
   "  const head = [\"이름\",\"구분\",\"소속\",\"목장·학년\",\"직분\",\"주\",\"여섯주\",\"인정\",\"인정 사유\",\n"
   "                \"등록일\",\"성도 메모\",\"담당자 메모\"];\n",
   "  //    둘을 한 칸에 뭉치면 성도님이 하신 말이 사라진다 — 칸을 나눠 싣는다.\n"
   "  //    주·여섯주·인정·인정 사유·담당자 메모 칸은 {TODAY} 에 뺐다 — 서버가 note 를 싣지 않고(인정 사유가 새지 않게),\n"
   "  //    주·인정은 한 번도 채워진 적 없이 빈칸이라 「아님」으로 읽혔다. 그 값들은 교회 어드민 📋 내려받기에 있다.\n"
   "  const head = [\"이름\",\"구분\",\"소속\",\"목장·학년\",\"직분\",\"등록일\",\"성도 메모\"];\n"),
  ("  const body = rows.map(r => [r.name, r.whoType, r.group, r.sub, r.position,\n"
   "    r.weeksDone ?? \"\", r.perfect ? \"O\" : \"\", r.excused ? \"O\" : \"\", oneline(r.excuseReason),\n"
   "    kstDate(r.at), oneline(r.memo), oneline(r.note)]);\n",
   "  const body = rows.map(r => [r.name, r.whoType, r.group, r.sub, r.position,\n"
   "    kstDate(r.at), oneline(r.memo)]);\n"),
  ("  app.querySelectorAll(\"[data-excuse]\").forEach(b => b.addEventListener(\"click\", () =>\n"
   "    askExcuse(Number(b.getAttribute(\"data-excuse\")), b.getAttribute(\"data-on\") === \"1\")));\n", ""),
], cuts=[
  ("// 사정이 있으셨던 주를 인정 — 사유를 반드시 받는다(비우면 서버가 no-reason 으로 막는다)\n",
   "// 담당자 메모(askNote · eventSetNote)는 교회 어드민 줄 「고치기」로 옮겼다.",
   # ⚠️ 이 주석에 옛 함수 이름·「prompt(」·「alert(」·「📋 가을 말씀 동행」을 적지 않는다 — S2-10 의 grep(0 이어야 함·1 이어야 함)과 라이브 확인이 이 글자를 센다
   "// 자격 인정(옛 인정 창 · eventExcuse)은 교회 어드민 「성경필사(암송)」 가을 말씀 동행 화면의 「✅ 자격 인정」으로 옮겼다({TODAY}) — 이 화면에 남은 시스템 창은 「🖨 인쇄」 하나다.\n"),
])

# ② admin.html — 「🎉 이벤트 관리」 타일을 새 주소로 + 옛 화면은 인쇄 타일 한 줄로(설계 5절 3 · 검토 E3)
patch("admin.html", [
  ("    { ic:\"🎉\", title:\"이벤트 관리\", desc:\"회차 만들기 · 신청 명단 · 인쇄\", href:\"admin-event.html\" },\n",
   "    { ic:\"🎉\", title:\"이벤트 관리 (교회 어드민)\", desc:\"성경필사(암송) — 회차·명단·자격 인정 · 카카오 로그인\", href:\"https://admin.onlybible.kr/#/be-roster\" },\n"
   "    { ic:\"🖨\", title:\"이벤트 명단 인쇄 (옛 화면)\", desc:\"보기·인쇄 전용 — 고치기·인정은 교회 어드민\", href:\"admin-event.html\" },\n"),
])

# ③ docs/notes/bible-events-admin.md — 표 한 줄 · 얼림 넷 · 남은 것
patch("docs/notes/bible-events-admin.md", [
  ("| 자격 인정·미신청 목록(가을 말씀 동행) | — | **그대로** `admin-event.html` · `eventExcuse`·`eventRoster`(다음 단계에서 옮긴다) |",
   "| 자격 인정·미신청 목록(가을 말씀 동행) | 📋 회차·명단 → 가을 말씀 동행(「✅ 인정하며 넣기」·줄 메뉴 「✅ 자격 인정」·👥 아직 신청 안 하신 분) — {TODAY} | `admin-event.html` 「인정」·`eventExcuse`(얼림) · `eventRoster` 는 보기·인쇄용으로 남고 `note` 를 싣지 않는다 |"),
  ("  배포 뒤에는 내려받아 `EVT_MOVED.has(` 가 셋인지 본다.",
   "  배포 뒤에는 내려받아 `EVT_MOVED.has(` 가 넷인지 본다({TODAY} 부터 `eventExcuse` 까지 넷)."),
  ("- `admin-event.html` 에 남은 것: 명단 보기·인쇄·CSV·자격 인정(`eventExcuse` — 아직 `prompt()`/`alert()`). 얼리는 쪽이라 손대지 않았다. 옮길 때 직접 만든 창으로 바꾼다.",
   "- `admin-event.html` 에 남은 것: 명단 보기·인쇄·CSV 뿐({TODAY} — 자격 인정 단추·`prompt()`/`alert()`·CSV 의 주·인정·담당자 메모 칸과 「아직 신청 안 하신 분」 배지를 걷었다). "
   "`admin.html` 에는 「🖨 이벤트 명단 인쇄 (옛 화면)」 타일로 남았다(관리자 비밀번호가 있어야 열린다 — 「성경필사(암송)」 역할만 받은 담당자는 어드민 ⬇️ 내려받기를 엑셀에서 인쇄한다).\n"
   "- ⚠️ **`eventRoster` 는 `note` 를 싣지 않는다**({TODAY}) — 가을 말씀 동행 인정 사유(건강 정보일 수 있다)가 `note` 머리 「자격 인정: 사유」에 들어가, "
   "세 앱 공용 관리자 비밀번호만으로 새지 않게. **되살리지 말 것.** 인정은 `answers.excused` 가 아니라 이 표기다 — 성경암송 쪽 누구도 읽지 않는다(성도님 앱은 인정을 모른다 · 가을 인정 설계 §9)."),
  ("- 가을 말씀 동행의 자격 인정(`eventExcuse`)·미신청 목록을 교회 어드민으로 옮긴다. 그다음 `admin.html` 「🎉 이벤트 관리」 타일을 새 주소로 바꾼다(설계 §4-4). 지금 타일 설명(「회차 만들기 · …」)은 얼린 뒤와 맞지 않는다.",
   "- ~~가을 말씀 동행 자격 인정·미신청 목록 옮기기~~ — {TODAY} 끝(설계 `docs/superpowers/specs/2026-09-30-church-admin-autumn-excuse-design.md` · `admin.html` 타일도 바꿨다). "
   "남은 것: 12/13(명단 공개 종료) 뒤 옛 `admin-event.html`·`eventRoster` 를 걷을지 · 성도님 앱이 인정을 읽게 할지(설계 물음 12) · 주보·목장 공지 「사정이 있으셨던 분은 담당자에게」(물음 19)."),
])

# ④ 성경암송 CLAUDE.md 표의 「이벤트 명단」 줄
patch("CLAUDE.md", [
  ("`eventImport`·`eventSave`·`eventSetNote` 는 얼렸다(되살리지 말 것 · `api` 는 얼림이 든 판에서만 배포)",
   "`eventImport`·`eventSave`·`eventSetNote`·`eventExcuse` 는 얼렸다(자격 인정·미신청 목록도 {TODAY} 어드민 📋 가을 말씀 동행으로 · `eventRoster` 는 `note` 를 싣지 않는다 · 되살리지 말 것 · `api` 는 얼림이 든 판에서만 배포)"),
])

if CHECK:
    print("앵커 모두 한 번씩 맞음 — 아무 파일도 쓰지 않았다:", ", ".join(out))
    sys.exit(0)
for rel, data in out.items():                     # 모든 앵커가 맞은 뒤에만 쓴다
    open(os.path.join(V2, rel), "wb").write(data)
    print("고침", rel)
print("날짜", TODAY)
```
```bash
PYTHONIOENCODING=utf-8 python ~/.church-admin/launch-autumn-excuse/autumn_v2_docs.py --check
git -C /c/Projects/bible-memorize-church-app-v2 status --short -- admin-event.html admin.html docs/notes/bible-events-admin.md CLAUDE.md
```
Expected: `앵커 모두 한 번씩 맞음 — 아무 파일도 쓰지 않았다: admin-event.html, admin.html, docs/notes/bible-events-admin.md, CLAUDE.md` · 둘째 명령 아무것도 없음. 「멈춘다」가 나오면 그 앵커를 `grep -n` 으로 찾아 글자가 어떻게 달라졌는지 보고 스크립트의 그 old 만 고쳐 다시 `--check`.

- [ ] **Step S2-2: 성경암송 — 출발점 · 스모크 시험 먼저(실패를 본다)**

```bash
V2=/c/Projects/bible-memorize-church-app-v2
git -C $V2 fetch origin
git -C $V2 status -sb | head -1
git -C $V2 status --short -- supabase/functions/api/index.ts tests/event-smoke.sh
cd $V2
F=supabase/functions/api/index.ts
grep -cF 'const EVT_MOVED = new Set(["eventImport", "eventSave", "eventSetNote"]);' $F
grep -cF '//    남긴 것: eventRoster(읽기) · eventExcuse(자격 인정 — 가을 말씀 동행용, 다음 단계에서 옮긴다) · 성도님 앱 액션 전부.' $F
grep -A2 -F 'async function eventExcuse(b: any) {' $F
grep -cF '    phone: r.phone ?? "", memo: r.memo ?? "", note: r.note ?? "",' $F
grep -c 'EVT_MOVED.has(' $F
S=tests/event-smoke.sh
grep -cF 'echo "5-1) 교회 어드민으로 옮긴 쓰기 셋은 비밀번호가 맞아도 막힌다(eventRoster·eventExcuse 는 남긴다)"' $S
grep -cF '  sk "eventSave·eventSetNote·eventImport 얼림" "ADMIN_PW 환경변수가 없습니다"' $S
grep -cF '  chk "eventImport 얼림" "$(jqn '"'"'d.get("error")'"'"' "$F3")" "moved-to-church-admin"' $S
grep -cF '  sk "관리자 응답에도 user_id 가 없다" "ADMIN_PW 환경변수가 없습니다"' $S
grep -cF '  chk "missing 에도 user_id 가 없다"' $S
```
Expected: 첫 줄 `## main...origin/main`(`[ahead N]` 은 문서 커밋 — 괜찮다 · `behind` 면 `git -C $V2 merge --ff-only origin/main`) · 둘째 명령 **아무것도 없음**(무엇이 찍히면 다른 세션이 그 파일을 고치는 중 — 멈추고 순서를 맞춘다) · `1` · `1` · 셋째 줄 머리가 `  const err = adminError(b);`·`  if (err) return { ok: false, error: err };` · `1` · `3` · 스모크 앵커 다섯 모두 `1`.

`tests/event-smoke.sh` — Edit 넷:
① old `echo "5-1) 교회 어드민으로 옮긴 쓰기 셋은 비밀번호가 맞아도 막힌다(eventRoster·eventExcuse 는 남긴다)"` → new:
```bash
echo "5-1) 교회 어드민으로 옮긴 쓰기 넷은 비밀번호가 맞아도 막힌다(eventRoster 읽기만 남긴다)"
```
② old `  sk "eventSave·eventSetNote·eventImport 얼림" "ADMIN_PW 환경변수가 없습니다"` → new:
```bash
  sk "eventSave·eventSetNote·eventImport·eventExcuse 얼림" "ADMIN_PW 환경변수가 없습니다"
```
③ 앵커 `  chk "eventImport 얼림" …` 줄 **바로 뒤에**:
```bash
  # eventExcuse(자격 인정)도 교회 어드민 📋 가을 말씀 동행으로 옮겨 얼렸다(가을 인정 설계 §5-1).
  #   ⚠️ id 0 — 얼리기 **전**에 돌려도 bad-args 로 멈춰 아무 줄도 안 바뀐다(5) 의 id 1 을 비밀번호와 함께 쓰지 않는다 —
  #   excused:false 나 사유를 붙이는 순간 실제 1번 줄의 answers 를 고친다).
  F4=$(call "{\"action\":\"eventExcuse\",\"pw\":\"$ADMIN_PW\",\"id\":0,\"excused\":false,\"reason\":\"\"}")
  chk "eventExcuse 얼림" "$(jqn 'd.get("error")' "$F4")" "moved-to-church-admin"
```
④ 앵커 `  sk "관리자 응답에도 user_id 가 없다" "ADMIN_PW 환경변수가 없습니다"` 줄 **바로 뒤에**:
```bash
  sk "eventRoster 줄에 note 칸이 없다" "ADMIN_PW 환경변수가 없습니다"
```
그리고 `  chk "missing 에도 user_id 가 없다"` 로 시작하는 줄 **바로 뒤에**:
```bash
  # 담당자 메모(note)에는 자격 인정 사유(건강 정보일 수 있다)가 들어간다 — 공용 관리자 비밀번호 응답에 싣지 않는다(가을 인정 설계 §5-1)
  #   ⚠️ 줄이 0 이면 all() 이 저절로 참이다 — 줄이 있어야만 참이 되게 함께 본다(헛도는 검사가 되지 않게 · event_id 없이 부르면 모든 회차 줄 2,000까지)
  chk "eventRoster 줄에 note 칸이 없다" "$(jqn 'len(d.get("rows", [])) > 0 and all("note" not in r for r in d["rows"])' "$RA")" "True"
```

실패 먼저(개발 `api` 는 아직 옛 판 · 개발 비밀번호 — 값을 찍지 않는다):
```bash
cd /c/Projects/bible-memorize-church-app-v2
bash tests/event-smoke.sh 2>&1 | grep -E "얼림|거부|note 칸|^통과"
ADMIN_PW="$(grep -m1 '^ADMIN_SECRET=' .env.dev | cut -d= -f2- | tr -d '\r' | sed 's/^"//;s/"$//')" bash tests/event-smoke.sh 2>&1 | grep -E "얼림|note 칸|^통과"
```
Expected: 비밀번호 없이 — 5) 거부 넷 `o` · 5-1·6) 건너뜀 · `실패 0`. 비밀번호로 — `o` 얼림 셋 · `X eventExcuse 얼림 = bad-args  (기대 moved-to-church-admin)` · `X eventRoster 줄에 note 칸이 없다 = False  (기대 True)` · `실패 2`. (`unauthorized` 면 비밀번호가 틀렸다 · `no-password-set` 이면 개발에 비밀번호가 없다 — 친구와 정한다.)
개발 `event_signups` 가 비어 있으면(가짜 회차 `ca-demo-` 를 지웠으면) 「note 칸이 없다」는 고친 뒤에도 `False` 다 — 교회 어드민 워크트리에서 Task 9 Step 3 의 시드 명령으로 다시 심고 돈다.

- [ ] **Step S2-3: 성경암송 `api` — 얼림 넷째 · `note` 빼기(Edit 넷) · 커밋 ①**

① old `const EVT_MOVED = new Set(["eventImport", "eventSave", "eventSetNote"]);` → new:
```ts
const EVT_MOVED = new Set(["eventExcuse", "eventImport", "eventSave", "eventSetNote"]);
```
② old `//    남긴 것: eventRoster(읽기) · eventExcuse(자격 인정 — 가을 말씀 동행용, 다음 단계에서 옮긴다) · 성도님 앱 액션 전부.` → new:
```ts
//    남긴 것: eventRoster(읽기 — note 는 싣지 않는다) · 성도님 앱 액션 전부.
//    eventExcuse(자격 인정)도 교회 어드민 📋 가을 말씀 동행으로 옮겨 얼렸다 — 인정은 이제 note 머리 「자격 인정: 사유」이고
//    answers.excused 는 아무도 읽지 않는다. 되살리면 인정이 두 곳(answers·note)에 갈라진다.
//    설계 docs/superpowers/specs/2026-09-30-church-admin-autumn-excuse-design.md §5 · 옛 eventRoster 의 자격 블록 버그는 고치지 않는다(얼린 쪽)
```
③ old(세 줄):
```ts
async function eventExcuse(b: any) {
  const err = adminError(b);
  if (err) return { ok: false, error: err };
```
new:
```ts
async function eventExcuse(b: any) {
  const err = adminError(b);
  if (err) return { ok: false, error: err };
  if (EVT_MOVED.has("eventExcuse")) return { ok: false, error: "moved-to-church-admin" };
```
④ old `    phone: r.phone ?? "", memo: r.memo ?? "", note: r.note ?? "",` → new:
```ts
    phone: r.phone ?? "", memo: r.memo ?? "",
    // ⚠️ note(담당자 메모)는 싣지 않는다 — 가을 말씀 동행 인정 사유(입원·간병처럼 건강 정보일 수 있다)가 note 머리
    //    「자격 인정: 사유」로 들어가, 세 앱 공용 관리자 비밀번호만으로 통째로 나가고 CSV 로 떨어진다(가을 인정 설계 §5-1 · 검토 A1).
    //    메모의 집은 교회 어드민이다(그쪽 내려받기는 메모를 싣지 않는다). 되살리지 말 것.
```
(다른 곳의 `note: r.note` — 필사 신청 쪽 — 은 이벤트가 아니라 그대로 둔다. `js/api.js` 의 `eventExcuse` 감싸개도 그대로 — 서버가 막는다.)

```bash
V2=/c/Projects/bible-memorize-church-app-v2
grep -c 'EVT_MOVED.has(' $V2/supabase/functions/api/index.ts          # 4
git -C $V2 diff --stat -- supabase/functions/api/index.ts tests/event-smoke.sh
git -C $V2 commit -m "feat(이벤트): 자격 인정(eventExcuse)도 교회 어드민으로 — moved-to-church-admin(얼림 넷) · eventRoster 는 note 를 싣지 않는다(인정 사유가 새지 않게)" -m "가을 인정 설계 docs/superpowers/specs/2026-09-30-church-admin-autumn-excuse-design.md §5 · tests/event-smoke.sh 5-1 넷째 줄(id 0) · 6) note 칸 없음" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>" -- supabase/functions/api/index.ts tests/event-smoke.sh
git -C $V2 show --stat HEAD
git -C $V2 rev-parse HEAD > ~/.church-admin/launch-autumn-excuse/v2-freeze-sha.txt; cat ~/.church-admin/launch-autumn-excuse/v2-freeze-sha.txt
```
Expected: `4` · 두 파일 통계 · 커밋에 **두 파일만**(다른 파일이 보이면 되돌리지 말고 그 세션에 알리고 친구와 정한다 — 남도 `index.ts` 를 고치는 중이면 `git -C $V2 diff -U0 -- supabase/functions/api/index.ts` 에서 내 헝크만 `git apply --cached --unidiff-zero` 로 담고 **경로 없이** 커밋한다).
⚠️ 이 순간부터 공용 체크아웃의 `api/index.ts` 에 얼림 넷이 있다 — S2-0 ⑥ 의 약속(배포 미루기)을 믿고 쉬지 않고 이어 간다.

- [ ] **Step S2-4: 성경암송 개발 `api` 배포 — 커밋한 그대로(`git archive`) · 스모크 통과**

```bash
L=~/.church-admin/launch-autumn-excuse; V2=/c/Projects/bible-memorize-church-app-v2; MINE=$(cat $L/v2-freeze-sha.txt)
rm -rf "$L/v2-api" "$L/pre-dev"; mkdir -p "$L/v2-api" "$L/pre-dev/supabase"
git -C $V2 archive $MINE supabase/functions/api | tar -x -C "$L/v2-api"
supabase functions download api --project-ref ktpwthwqzgcqcrmsafdo --use-api --workdir "$(cygpath -w "$L/pre-dev")"
F=$(find "$L/pre-dev" -name index.ts | head -1); echo "$F"
diff <(tr -d '\r' < "$F") <(git -C $V2 show $MINE^:supabase/functions/api/index.ts | tr -d '\r') > "$L/pre-dev.diff"; wc -l < "$L/pre-dev.diff"
```
Expected: 내려받은 경로 · `0`(지금 개발에 떠 있는 것 = 내 커밋 바로 앞). 0 이 아니면 `$L/pre-dev.diff` 를 친구에게 보인다 — 다른 세션이 개발에 올려 둔 시험 코드를 덮게 되므로 그 세션의 괜찮다는 답을 받은 뒤에 올린다.
```bash
L=~/.church-admin/launch-autumn-excuse
supabase functions deploy api --no-verify-jwt --project-ref ktpwthwqzgcqcrmsafdo --workdir "$(cygpath -w "$L/v2-api")"
rm -rf "$L/dl-dev"; mkdir -p "$L/dl-dev/supabase"
supabase functions download api --project-ref ktpwthwqzgcqcrmsafdo --use-api --workdir "$(cygpath -w "$L/dl-dev")"
grep -c 'EVT_MOVED.has(' "$(find "$L/dl-dev" -name index.ts | head -1)"
cd /c/Projects/bible-memorize-church-app-v2
bash tests/event-smoke.sh 2>&1 | tail -6
ADMIN_PW="$(grep -m1 '^ADMIN_SECRET=' .env.dev | cut -d= -f2- | tr -d '\r' | sed 's/^"//;s/"$//')" bash tests/event-smoke.sh 2>&1 | grep -E "얼림|note 칸|^통과"
```
Expected: `Deployed Functions on project ktpwthwqzgcqcrmsafdo: api` · `4` · 비밀번호 없이 `실패 0`(7) 남의 경로 셋 True) · 비밀번호로 `o` 얼림 넷 · `o eventRoster 줄에 note 칸이 없다 = True` · `실패 0`. 배포가 문법으로 실패하면 고쳐 새 커밋(`v2-freeze-sha.txt` 를 새 해시로) → 이 단계를 다시.

- [ ] **Step S2-5: 교회 어드민 — 게이트 열기 커밋 · 개발 배포 · 개발 시험(운영 쓰기 없음)**

```bash
cd /c/Projects/church-admin
git fetch origin; git log --oneline origin/main..main; git log --oneline autumn-excuse..main
cd /c/Projects/church-admin/.worktrees/autumn-excuse
git status --short
grep -cF 'const EXCUSE_LIVE_PROD = false;' supabase/functions/church-admin/index.ts
grep -cF 'export const EXCUSE_UI_PROD = false;' js/menus/bibleevent/elig-logic.js
grep -c "2단계(쓰기) 개발 중 — 여는 날 날짜를 적는다" CLAUDE.md
grep -c '^  - ⚠️ 인정 셋은 \*\*운영에서 게이트로 닫혀 있다\*\*' CLAUDE.md
grep -c '^- 성경암송 쪽에 \*\*남긴 것\*\*: `eventRoster`(읽기 — 옛' CLAUDE.md
```
Expected: 첫 `git log` 비었다 · 둘째가 커밋을 찍으면(1단계 뒤 main 이 움직였다) `git merge main` 을 워크트리에서 하고 S1-1 끝의 「줄 짓기 맞추기」를 다시 본 뒤 preflight·개발 시험을 먼저 돈다(합친 남의 커밋은 ⓑ 로 운영에 함께 나간다 — 그 주인의 답을 S2-0 ⑥ 에서 받았는지 본다) · 빈 status · `1` 다섯.

Edit 다섯(CRLF — Edit 도구로):
① `supabase/functions/church-admin/index.ts` — old `const EXCUSE_LIVE_PROD = false;` → new `const EXCUSE_LIVE_PROD = true;   // 2단계 YYYY-MM-DD 열림 — 다시 닫지 말 것(성경암송 eventExcuse 는 얼었다)`
② `js/menus/bibleevent/elig-logic.js` — old `export const EXCUSE_UI_PROD = false;` → new `export const EXCUSE_UI_PROD = true;   // 2단계 YYYY-MM-DD 열림`
③ `CLAUDE.md` — old `2단계(쓰기) 개발 중 — 여는 날 날짜를 적는다` → new `2단계(쓰기) YYYY-MM-DD 운영 개시`
④ `CLAUDE.md` — `  - ⚠️ 인정 셋은 **운영에서 게이트로 닫혀 있다**` 로 시작하는 한 줄을 통째로 → new:
```markdown
  - 인정 셋의 운영 게이트(`index.ts` `EXCUSE_LIVE_PROD` · `elig-logic.js` `EXCUSE_UI_PROD`)는 2단계(YYYY-MM-DD)에 함께 열었다 — **다시 닫지 말 것**(성경암송 `eventExcuse` 는 얼었으니 닫으면 인정을 쓸 곳이 없다).
```
⑤ `CLAUDE.md` — `- 성경암송 쪽에 **남긴 것**: \`eventRoster\`(읽기 — 옛` 으로 시작하는 한 줄을 통째로 → new:
```markdown
- 성경암송 쪽에 **남긴 것**: `eventRoster`(읽기만 — 옛 `admin-event.html` 보기·인쇄 · `note` 를 싣지 않는다). 자격 인정(`eventExcuse`)은 YYYY-MM-DD 에 얼렸다(`EVT_MOVED` 넷 · **되살리지 말 것** — 인정이 answers 와 note 표기로 갈라진다) · 성경암송 `admin.html` 「🎉 이벤트 관리」 타일은 이리로 온다.
```
(YYYY-MM-DD 는 오늘 — S2-0 에서 찍은 날짜.)

```bash
cd /c/Projects/church-admin/.worktrees/autumn-excuse
grep -cF 'const EXCUSE_LIVE_PROD = true;' supabase/functions/church-admin/index.ts      # 1
grep -cF 'export const EXCUSE_UI_PROD = true;' js/menus/bibleevent/elig-logic.js        # 1
git diff --stat
python tools/preflight.py | tail -1
git add supabase/functions/church-admin/index.ts js/menus/bibleevent/elig-logic.js CLAUDE.md
git commit -m "feat(성경필사): 가을 말씀 동행 2단계 — 인정 셋 운영 게이트를 연다(EXCUSE_LIVE_PROD·EXCUSE_UI_PROD) · 성경암송 eventExcuse 얼림과 같은 날" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git status --short
supabase functions deploy church-admin --no-verify-jwt --project-ref ktpwthwqzgcqcrmsafdo
set -a; . ~/.church-admin/dev.env; set +a
node --experimental-strip-types --test tests/server.dev.test.mjs 2>&1 | grep -E '^not ok|^# (pass|fail)|정리 실패'
```
Expected: `1` · `1` · 파일 셋(index.ts·elig-logic.js 한 줄씩 · CLAUDE.md 석 줄) · `모두 통과`(be-elig-logic 의 `excuseUiOn("prod") === EXCUSE_UI_PROD` 는 값이 바뀌어도 통과한다) · 빈 status · `Deployed …` · `# fail 0`.

- [ ] **Step S2-6: 얼리기 직전 확인 — 교회 어드민 main · 운영 `api` 가 내 커밋 바로 앞과 같은가**

```bash
cd /c/Projects/church-admin
git fetch origin; git log --oneline main..origin/main; git log --oneline origin/main..main; git log --oneline autumn-excuse..main
git -C .worktrees/autumn-excuse status --short
L=~/.church-admin/launch-autumn-excuse; V2=/c/Projects/bible-memorize-church-app-v2; MINE=$(cat $L/v2-freeze-sha.txt)
rm -rf "$L/pre-prod"; mkdir -p "$L/pre-prod/supabase"
supabase functions download api --project-ref xnomlgydifiqiybervtf --use-api --workdir "$(cygpath -w "$L/pre-prod")"
F=$(find "$L/pre-prod" -name index.ts | head -1)
diff <(tr -d '\r' < "$F") <(git -C $V2 show $MINE^:supabase/functions/api/index.ts | tr -d '\r') > "$L/pre-prod.diff"; wc -l < "$L/pre-prod.diff"
```
Expected: 넷 모두 아무것도 없음 · `0`. **0 이 아니면 운영에 올리지 않는다** — ① 커밋은 됐는데 운영에 아직 안 나간 남의 코드(내 배포가 그것까지 내보낸다) ② 운영에만 있고 커밋이 없는 코드(내 배포가 지운다) 둘 중 하나다. `$L/pre-prod.diff` 를 친구에게 보이고 그 코드의 주인과 정한 뒤에만 간다.

교회 어드민 운영 함수도 **ⓐ 전에** 같은 식으로 본다 — ⓐ~ⓑ 사이(쓰는 곳이 없는 몇 분)에 이 확인을 하면 창이 길어진다. 지금 운영 판은 1단계에서 올린 판(`ca-s1-sha.txt`)과 같아야 하고, ⓑ 는 거기서 게이트 한 줄·문서만 다른 판을 올린다:
```bash
cd /c/Projects/church-admin/.worktrees/autumn-excuse
L=~/.church-admin/launch-autumn-excuse; S1=$(cat $L/ca-s1-sha.txt); echo "1단계 판 $S1"
rm -rf "$L/pre-ca-s2"; mkdir -p "$L/pre-ca-s2/supabase"
supabase functions download church-admin --project-ref xnomlgydifiqiybervtf --use-api --workdir "$(cygpath -w "$L/pre-ca-s2")"
D=$(dirname "$(find "$L/pre-ca-s2" -name index.ts | head -1)")
for f in $(git ls-tree -r --name-only $S1 supabase/functions/church-admin | sed 's#supabase/functions/church-admin/##'); do
  if diff -q <(tr -d '\r' < "$D/$f" 2>/dev/null) <(git show $S1:supabase/functions/church-admin/$f | tr -d '\r') >/dev/null; then echo "같음 $f"; else echo "다름 $f"; fi
done
git diff --stat $S1 HEAD -- supabase/functions/church-admin
```
Expected: 모든 줄 `같음`(운영 = 1단계 판 — 그 사이 아무도 운영 church-admin 을 올리지 않았다) · 마지막 통계는 `index.ts` 한 줄(게이트)뿐이거나, S2-5 에서 main 을 합쳤으면 그 합친 커밋들까지(그 커밋의 주인이 「함께 나가도 된다」고 했는지 S2-0 ⑥ 의 답으로 본다). `다름` 이 있으면 **ⓐ 로 가지 않는다** — 누가 무엇을 올렸는지 친구와 먼저 본다(모르고 ⓑ 를 하면 그 판을 지운다).
친구에게: 「지금부터 성경암송 인정 쓰기를 얼리고, 곧바로 교회 어드민 인정을 엽니다. 그 사이 몇 분은 인정을 넣을 곳이 없어요(10/27 전이면 넣을 줄도 없어요).」

- [ ] **Step S2-7: ⓐ 성경암송 운영 `api` — 같은 폴더를 그대로 · 넷 · 스모크**

```bash
L=~/.church-admin/launch-autumn-excuse
supabase functions deploy api --no-verify-jwt --project-ref xnomlgydifiqiybervtf --workdir "$(cygpath -w "$L/v2-api")"
rm -rf "$L/dl-prod"; mkdir -p "$L/dl-prod/supabase"
supabase functions download api --project-ref xnomlgydifiqiybervtf --use-api --workdir "$(cygpath -w "$L/dl-prod")"
grep -c 'EVT_MOVED.has(' "$(find "$L/dl-prod" -name index.ts | head -1)"
cd /c/Projects/bible-memorize-church-app-v2
EVT_ENV=prod bash tests/event-smoke.sh 2>&1 | tail -6
ADMIN_PW="$(grep -m1 '^PROD_ADMIN_SECRET=' .env | cut -d= -f2- | tr -d '\r' | sed 's/^"//;s/"$//')" EVT_ENV=prod bash tests/event-smoke.sh 2>&1 | grep -E "얼림|note 칸|^통과"
```
Expected: `Deployed Functions on project xnomlgydifiqiybervtf: api` · **`4`**(배포 성공 문구는 무엇이 올라갔는지 말하지 않는다 — 내려받은 `4` 가 증거) · 비밀번호 없이 `실패 0` · 비밀번호로 `o` 얼림 넷 · `o eventRoster 줄에 note 칸이 없다 = True` · `실패 0`.
**이 순간부터 옛 인정(`eventExcuse`)이 막혔고 `eventRoster` 가 메모를 내보내지 않는다.** 곧바로 S2-8 로.

- [ ] **Step S2-8: ⓑ 교회 어드민 운영 함수 — 게이트 연 판 · 내려받아 대조**

```bash
cd /c/Projects/church-admin/.worktrees/autumn-excuse
git status --short
git rev-parse HEAD > ~/.church-admin/launch-autumn-excuse/ca-s2-sha.txt
supabase functions deploy church-admin --no-verify-jwt --project-ref xnomlgydifiqiybervtf
L=~/.church-admin/launch-autumn-excuse; rm -rf "$L/dl-ca-s2"; mkdir -p "$L/dl-ca-s2/supabase"
supabase functions download church-admin --project-ref xnomlgydifiqiybervtf --use-api --workdir "$(cygpath -w "$L/dl-ca-s2")"
D=$(dirname "$(find "$L/dl-ca-s2" -name index.ts | head -1)")
for f in $(git ls-files supabase/functions/church-admin | sed 's#supabase/functions/church-admin/##'); do
  if diff -q <(tr -d '\r' < "$D/$f" 2>/dev/null) <(git show HEAD:supabase/functions/church-admin/$f | tr -d '\r') >/dev/null; then echo "같음 $f"; else echo "다름 $f"; fi
done
grep -cF 'const EXCUSE_LIVE_PROD = true;' "$D/index.ts"
```
Expected: 빈 status · `Deployed …` · 모든 줄 `같음` · `1`. `다름` 이면 푸시하지 않고 다시 배포한다.

- [ ] **Step S2-9: ⓒ church-admin 푸시(= 운영 화면) · 표식**

```bash
cd /c/Projects/church-admin
git fetch origin; git log --oneline main..origin/main; git log --oneline origin/main..main
git merge --no-ff autumn-excuse -m "merge: 가을 말씀 동행 자격 2단계(autumn-excuse) — 인정 셋 운영 게이트 열기" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
test "$(git rev-parse 'main^{tree}')" = "$(git rev-parse 'autumn-excuse^{tree}')" && echo "합친 판 = 시험한 판"
git push origin main
SHA=$(git rev-parse HEAD); RUN=""
for i in 1 2 3 4 5 6 7 8 9 10; do RUN=$(gh run list -R sewoongkim1/church-admin --workflow deploy.yml --commit "$SHA" --limit 1 --json databaseId -q '.[0].databaseId'); [ -n "$RUN" ] && break; python -c "import time;time.sleep(3)"; done
echo "RUN=$RUN (커밋 $SHA 의 실행 — 비었으면 멈추고 Actions 화면을 본다)"; gh run watch -R sewoongkim1/church-admin "$RUN" --exit-status
f=js/menus/bibleevent/elig-logic.js
LOCAL=$(git show HEAD:$f | python -c "import sys,hashlib;print(hashlib.sha1(sys.stdin.buffer.read()).hexdigest()[:10])")
LIVE=$(curl -s "https://admin.onlybible.kr/?t=$(date +%s)" | grep -o "$f?v=[0-9a-f]*" | head -1 | cut -d= -f2)
echo "local $LOCAL · live $LIVE"
curl -s "https://admin.onlybible.kr/$f?v=$LIVE" | grep -c 'export const EXCUSE_UI_PROD = true;'
```
Expected: `git log` 둘 비었다 · `합친 판 = 시험한 판` · Actions ✓ · local = live · `1`. 다르면 1~2분 뒤 다시.

- [ ] **Step S2-10: ⓓ 역할 확인 → 성경암송 글 네 곳 쓰기 · 커밋 ② · 푸시 · 표식**

먼저 친구가 🔑 담당자·역할에서 가을 말씀 동행 담당자에게 「성경필사(암송)」 역할이 있는지 본다(없으면 준다 — 이름은 어디에도 적지 않는다). **그 뒤에** 타일을 바꾼다(물음 14).
```bash
V2=/c/Projects/bible-memorize-church-app-v2
git -C $V2 status --short -- admin-event.html admin.html docs/notes/bible-events-admin.md CLAUDE.md
PYTHONIOENCODING=utf-8 python ~/.church-admin/launch-autumn-excuse/autumn_v2_docs.py
cd $V2
PYTHONIOENCODING=utf-8 python - <<'PY'
import re, subprocess, tempfile, os
s = open(r"C:\Projects\bible-memorize-church-app-v2\admin-event.html", encoding="utf-8").read()
blocks = re.findall(r"<script>(.*?)</script>", s, re.S)
assert len(blocks) == 1, len(blocks)
p = os.path.join(tempfile.gettempdir(), "admin-event-inline.js")
open(p, "w", encoding="utf-8").write(blocks[0])
r = subprocess.run(["node", "--check", p])
print("인라인 스크립트 문법", "통과" if r.returncode == 0 else "실패")
PY
grep -cE 'askExcuse|admErr|prompt\(|alert\(|data-excuse|evMissing\.length \?' admin-event.html
grep -c '📋 가을 말씀 동행' admin-event.html
grep -c '이벤트 관리 (교회 어드민)\|이벤트 명단 인쇄 (옛 화면)' admin.html
git diff --stat -- admin-event.html admin.html docs/notes/bible-events-admin.md CLAUDE.md
```
Expected: 첫 명령 아무것도 없음(` M CLAUDE.md` 가 찍히면 남도 CLAUDE.md 를 고치는 중 — 스크립트는 돌리되 커밋은 아래 「남도 고치는 중이면」 순서) · `고침` 넷과 `날짜 <오늘>` · `인라인 스크립트 문법 통과` · `0` · `1` · `2` · 줄바꿈만 바뀐 파일 없음(수백 줄이면 CRLF 가 바뀐 것 — 멈춘다).

커밋 ②(경로를 못 박는다):
```bash
V2=/c/Projects/bible-memorize-church-app-v2
git -C $V2 commit -m "feat(이벤트): admin-event.html 보기·인쇄 전용(자격 인정·prompt/alert·CSV 다섯 칸·미신청 배지 걷기) · admin.html 이벤트 타일을 교회 어드민으로 + 옛 화면 인쇄 타일 · 문서" -m "가을 인정 설계 docs/superpowers/specs/2026-09-30-church-admin-autumn-excuse-design.md §5-2·§5-3" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>" -- admin-event.html admin.html docs/notes/bible-events-admin.md CLAUDE.md
git -C $V2 show --stat HEAD
```
Expected: 네 파일만. 남도 `CLAUDE.md` 를 고치는 중이었으면 — `git -C $V2 diff -U0 -- CLAUDE.md > ~/.church-admin/launch-autumn-excuse/claude-all.patch` 에서 「이벤트 명단」 줄 헝크 하나만 남겨 `claude-mine.patch` 로 저장 → `git -C $V2 apply --cached --unidiff-zero …/claude-mine.patch` → 나머지 세 파일 `git add` → `git -C $V2 diff --cached --stat` 으로 내 것뿐인지 본 **뒤에** 경로 없이 커밋.

푸시:
```bash
V2=/c/Projects/bible-memorize-church-app-v2
git -C $V2 fetch origin
git -C $V2 status -sb | head -1
git -C $V2 log --oneline origin/main..main
cd $V2 && python tools/preflight.py | tail -3
git -C $V2 push origin main
SHA=$(git -C $V2 rev-parse HEAD); RUN=""
for i in 1 2 3 4 5 6 7 8 9 10; do RUN=$(gh run list -R sewoongkim1/bible-memorize-church-app-v2 --workflow deploy.yml --commit "$SHA" --limit 1 --json databaseId -q '.[0].databaseId'); [ -n "$RUN" ] && break; python -c "import time;time.sleep(3)"; done
echo "RUN=$RUN (커밋 $SHA 의 실행 — 비었으면 멈추고 Actions 화면을 본다)"; gh run watch -R sewoongkim1/bible-memorize-church-app-v2 "$RUN" --exit-status
curl -s "https://gocheok.onlybible.kr/admin-event.html?t=$(date +%s)" | grep -c '📋 가을 말씀 동행'
curl -s "https://gocheok.onlybible.kr/admin-event.html?t=$(date +%s)" | grep -c 'askExcuse'
curl -s "https://gocheok.onlybible.kr/admin.html?t=$(date +%s)" | grep -c '이벤트 관리 (교회 어드민)\|이벤트 명단 인쇄 (옛 화면)'
```
Expected: 나갈 커밋은 이 일의 것(커밋 ①·②)과 문서 커밋뿐(다른 세션의 기능 커밋이 섞였으면 **멈추고** 친구에게 — 푸시가 그것까지 성도님 화면에 내보낸다 · `behind` 면 먼저 `merge --ff-only origin/main`) · preflight 통과 · Actions ✓ · `1` · `0` · `2`. `app.js`·`style.css` 를 고치지 않았으므로 `bump.py` 는 돌리지 않는다(`admin-event.html`·`admin.html` 은 `?v=` 태그를 쓰지 않는다).

- [ ] **Step S2-11: 친구 확인(운영 · 읽기만)**

- ☐ gocheok.onlybible.kr/admin.html — 「🎉 이벤트 관리 (교회 어드민)」 누르면 admin.onlybible.kr 📋 회차·명단 · 바로 아래 「🖨 이벤트 명단 인쇄 (옛 화면)」
- ☐ 옛 `admin-event.html`(Ctrl+F5) — 회차 설정 칸의 띠에 「자격 인정과 아직 신청 안 하신 분은 … 📋 가을 말씀 동행에서」 · 가을 회차 줄에 「인정」 단추 없음 · CSV 에 「담당자 메모」·「주」·「인정」 칸 없음 · 인쇄 그대로
- ☐ admin.onlybible.kr 가을 말씀 동행 — 10/27 전이면 「인정은 신청이 열린 날(10월 27일)부터 할 수 있어요」 한 줄(「준비 중」 문구가 **아니다** — 게이트가 열렸다) · 10/27 부터 「✅ 인정하며 넣기」가 뜬다
- ☐ **10/27(화) 아침 한 번 더**: 「✅ 인정하며 넣기」 단추 · 👥 접힘 칸이 이름을 보인다 · 종이로 받아 둔 사정 문의를 「✅ 인정하며 넣기」로 옮긴다(동의 확인 칸 · 사유는 짧게 · 병명 없이)
- ☐ 주보·목장 공지 한 줄(물음 19 — 「입원·간병 등으로 도장을 채우지 못하신 분은 ○○에게 말씀해 주세요」)을 친구가 담당자와 정했는지

- [ ] **Step S2-12: 기록 · 메모리 · 정리**

`C:\Projects\church-admin\.superpowers\sdd\bible-events\progress.md` 끝에:
`가을 인정 2단계 LIVE (<날짜>): 성경암송 api 얼림 넷 $(cat v2-freeze-sha.txt)(eventExcuse → moved-to-church-admin · eventRoster note 없음 · 개발·운영 스모크 0 실패) · 교회 어드민 운영 함수 게이트 열림 $(cat ca-s2-sha.txt)(파일 같음) · main 합침·푸시 · 라이브 EXCUSE_UI_PROD=true · 성경암송 admin-event.html·admin.html·docs/notes·CLAUDE.md 푸시 · 역할 확인(이름 안 적음)`
그리고 「남은 것」: 12/13 뒤 옛 `admin-event.html`·`eventRoster` 걷을지 · 성도님 앱이 인정을 읽게 할지(물음 12) · 선물 명단 확정(11/28 뒤)에 인정 줄이 빠지지 않았는지.

Claude 메모리(`C:\Users\sewki\.claude\projects\c--Projects-bible-memorize-church-app-v2\memory\` · 저장소 밖 · 실명을 옮기지 않는다):
```bash
M=/c/Users/sewki/.claude/projects/c--Projects-bible-memorize-church-app-v2/memory
grep -c '^- 남은 것:' $M/bible-events-admin-live.md
grep -c '(bible-events-admin-live.md)' $M/MEMORY.md
```
Expected: `1` · `1`. Edit 둘:
- `bible-events-admin-live.md` 의 `- 남은 것:` 줄은 **통째로 바꾸지 않는다** — 그 줄에는 이 일과 상관없는 ①(담당자 역할 주기)·③(회차 차례) 이 함께 들어 있다(2026-09-30 기준). 그 줄 안의 ② 조각(「② 가을 말씀 동행의 자격 인정(`eventExcuse`)·미신청 목록을 어드민으로 옮기기 … 이벤트 타일을 새 주소로」)만 `② ~~자격 인정·미신청 목록 옮기기·admin.html 타일~~ — <날짜> 끝` 으로 고치고(Edit 도구 · old 는 그 조각 글자 그대로), 그 줄 **바로 뒤에** 한 줄을 더한다: `- 가을 말씀 동행 자격 인정·미신청 목록 — <날짜> 교회 어드민으로 옮김(1단계 <날짜> · 2단계 <날짜>) · 성경암송 eventExcuse 얼림(EVT_MOVED 넷 · api 는 얼림 넷이 든 판에서만 배포) · eventRoster 는 note 를 싣지 않는다 · admin.html 타일 바꿈. 남은 것: 12/13 뒤 옛 admin-event.html 걷을지 · 성도님 앱이 인정을 읽게 할지 · 선물 명단(11/28 뒤)`. ①·③ 이 이미 끝났는지는 친구에게 물어 그 조각만 지운다(짐작으로 지우지 않는다).
- `MEMORY.md` 의 `(bible-events-admin-live.md)` 가 든 줄 끝에 ` · 가을 인정 <날짜> 옮김(eventExcuse 얼림 넷 · eventRoster note 없음)` 을 더한다.

다른 세션에 알림(S2-0 ⑥ 에서 배포를 미뤄 달라고 한 세션 모두 · `SendMessage`): 「끝났습니다. 성경암송 `api` 는 이제 **얼림 넷(`EVT_MOVED.has(` 넷 · eventExcuse 포함)과 `eventRoster` note 빼기가 든 판(origin/main 의 <v2-freeze-sha> 이후)**에서만 배포해 주세요 — 옛 작업 트리·가지에서 올리면 옛 인정이 되살아나 인정을 쓰는 곳이 둘이 되고, 인정 사유가 공용 비밀번호 응답으로 샙니다. 교회 어드민 함수도 main(게이트 열린 판) 이후에서만.」

워크트리 정리:
```bash
cd /c/Projects/church-admin
git worktree remove .worktrees/autumn-excuse
git branch -d autumn-excuse
git worktree list
rm -rf ~/.church-admin/launch-autumn-excuse ~/.church-admin/autumn-excuse
```
Expected: `autumn-excuse` 가 목록에서 사라진다(`-d` 가 거절되면 합치기가 안 된 것 — 멈춘다). 내려받은 함수 사본이 든 작업 폴더를 지운다.

**문제가 생기면(되돌리기):**
- ⚠️ **성경암송 얼림은 풀지 않는다**(설계 5절 1) — 풀면 인정이 `answers`(옛)와 `note` 표기(새) 두 곳에 갈라져 서로 안 보인다. 교회 어드민 쪽이 서지 못하면 그동안 인정은 종이로 받는다.
- 교회 어드민 쓰기 셋만 닫아야 하면(버그): 워크트리(또는 main)에서 `EXCUSE_LIVE_PROD`·`EXCUSE_UI_PROD` 를 `false` 로 되돌린 커밋 → 개발 배포·시험 → 운영 함수 → 푸시. 읽기(1단계)는 남는다.
- 화면만 되돌릴 때: `git -C /c/Projects/church-admin revert -m 1 --no-edit <합치기 커밋>` → 푸시. 서버 액션은 남아 있어도 메뉴가 부르지 않는다.
- ⓐ 뒤 ⓑ 전에 멈췄다면(몇 분): 교회 어드민 1단계 판이 운영에 있으니 명단 보기는 되고 인정만 못 넣는다 — 원인을 고쳐 ⓑ 부터 잇는다.

---

## 계획 검토에서 고친 것 (2026-09-30 · 설계 대조 검토 1회)

> 읽기만 해서 검토했다 — 성경암송 v2 `main` `1ec3473`(api `index.ts` 는 커밋 `1498177` 과도 대조) · church-admin `main` `ee4c48f`(🧪 시험 참여자가 막 들어온 판) · 가지 `be-decide` `ce3c2cf` · `people-link` `b7fb63a`.
> 배포·SQL·운영/개발 서버 호출은 하지 않았다. 앵커는 `grep -cF` 로, 성경암송 쪽 스크립트(S2-1)는 **메모리 안에서만** 돌려 결과를 셌다(파일에 쓰지 않음). 실명 없음 — 보기 이름은 음절 표(도하늘·라바다·차하늘)와 `ca-test-`·`데모앱성도…` 뿐임을 다시 확인했다.
> 각 줄은 **무엇이 틀렸나(근거) → 어디를 어떻게 고쳤나**.

### 설계와 어긋나거나 시험이 헛돌던 자리
1. **BOM 을 글자 그대로 넣었다 — 기존 시험이 깨진다.** `elig-logic.js` `missingCsv` 와 그 시험이 보이지 않는 U+FEFF 를 문자열 안에 그대로 두었다. church-admin `tests/be-roster-logic.test.mjs` 는 `js/menus/bibleevent/*.js` 어디에도 U+FEFF 글자가 **없어야** 한다고 본다(preflight 가 돈다 → 배포 안 됨). → 두 곳 모두 이스케이프 `\uFEFF`(roster-logic.js `csvText` 와 같은 꼴)로(Task 6 Step 2·4).
2. **스모크 「eventRoster 줄에 note 칸이 없다」가 헛돌 수 있었다.** `all(... for r in rows)` 는 줄이 0 이면 저절로 참 — 개발 명단이 비면 얼리기 **전에도** 통과한다. → `len(rows) > 0 and all(...)` 로, 개발이 비었으면 시드를 다시 심으라는 줄(Task 11 S2-2).
3. **누출 시험이 설계 §8 「다섯 응답 전체」에 못 미쳤다.** `aeClean` 이 행복한 길 하나씩만 보고, UUID 꼴을 따로 지은 정규식(`AE_UUID`)으로 봤으며(파일 머리 규칙 「누출 시험은 모두 `UUID_RE` 하나」), 감출 칸에 `person_id`·교인명부 칸(`CHURCH_COLS`)이 없었다(`evExcuseCheck`·`evExcuseAdd` 는 `church` 를 싣는다). → `aeClean` 이 `UUID_RE`·`RX_SECRET`+`CHURCH_COLS`·신원 키 꼴(`|||`)을 쓰고, Task 4 끝에 **다섯 액션의 모든 응답 모양**(주 값·이미 자격·이미 명단·계정 둘·계정 없음 · 측정 중·끝난 뒤·시작 전·규칙 못 읽음 · 신청 창·마감 뒤·창 전 · 넣기·사유 고침·거두고 뺌)을 도는 누출 시험 하나(Task 3 Step 4 · Task 4 Step 4).
4. **`evExcuseSet` 의 「자격 회차가 아닌 곳」 시험이 없었다**(설계 §8 — 다른 넷은 있었다). → 보통 회차(`EV_ID`) 줄로 `not-eligibility-event` · 메모가 그대로인지(Task 4 Step 4).
5. **`excuse-not-open` 의 말에 날짜가 없었다**(설계 §3 오류표 「(○월 ○일)부터」). `MESSAGES` 는 날짜를 모른다. → `elig-logic.js` `notOpenText(opensOn)`(띠의 `excuseWhy` 도 이것) · 창 셋이 서버 `opensOn` 으로 그 글을 쓰는 `refusal()` · 시험 한 줄(계획이 고른 해석 ⑬ · Task 6·7).
6. **줄 짓기가 `evRowAdd` 와 갈라질 수 있었다.** 설계 §3 「`evRowAdd` 와 같은 줄 짓기」 — 그런데 `be-decide`(M2)가 `evRowAdd` 에 「지난 회차 줄의 낸 날 = 마감일」(`pastEventCreatedAt`)을 더하는 중이다. 먼저 main 에 들어오면 인정하며 넣은 줄(가을 11/29~12/13)만 오늘 날짜가 되어 「가장 최근 줄」 판정이 흔들린다. → 계획이 고른 해석 ⑫ · Task 1 Step 3·Task 4 Step 1 에서 세고 · Task 4 Step 7 에 조건부 Edit(정확한 old/new) · Task 11 S1-1·S2-5 에서 main 을 합친 뒤 「줄 짓기 맞추기」.

### 배포 차례 · 날짜 · 운영 안전
7. **운영 게이트가 열리는 쪽으로 틀렸다.** `excuseGateOpen` 이 「주소에 운영 참조가 있으면 닫는다」라 `SUPABASE_URL` 이 예상과 다른 꼴이면 **1단계부터 운영에서 쓰기 셋이 열려** 성경암송 `eventExcuse` 와 두 곳이 쓰는 창이 생긴다(설계 §7 「두 곳이 쓰는 창은 만들지 않는다」). → 개발 참조(`DEV_REF`)가 있을 때만 저절로 열리고 모르는 주소는 닫힘 · 시험에 빈 값·내부 주소 다섯(Task 2 · Global Constraints · CLAUDE.md 절).
8. **1단계 날짜가 설계보다 이를 수 있었다.** S1-0 은 「10/10~10/12 가 아니다」만 봐서 10/9 이전 운영 배포를 막지 않았다(설계 날짜표 · 물음 14: 1단계 10/13~). 금지 창도 「운영」 쓰기인지 적혀 있지 않았다. → Global Constraints 에 「10/10~10/12 운영 쓰기 금지(개발은 된다)·1단계 10/13 이후」 · S1-0·S2-0 에 한국 날짜를 파이썬이 판정하는 한 줄(`운영 쓰기 가능한 날` / `배포 금지` / `1단계 전` / `늦어도 날을 넘김`).
9. **한글을 찍는 파이썬이 Git Bash 에서 깨졌다.** 위 판정 줄을 실제로 돌려 보니 cp949 로 깨져 나왔다. → `PYTHONIOENCODING=utf-8` 을 앞에 두고, Global Constraints 에 규칙 한 줄.
10. **Actions 기다리기가 도구에 막히고, 앞 판의 실행을 볼 수 있었다.** `sleep 5; gh run list --limit 1` 은 ① Bash 도구가 앞머리 `sleep` 을 막고 ② 새 실행이 아직 없으면 **앞 판의 실행**을 잡아 「배포 끝」으로 오인한다. → 세 곳(S1-5·S2-9·S2-10) 모두 `--workflow deploy.yml --commit <푸시한 해시>` 로 그 커밋의 실행을 찾고, 없으면 파이썬으로 3초씩 다시 묻는다.
11. **운영 church-admin 배포가 남의 커밋을 몰래 내보낼 수 있었다.** 성경암송 `api` 는 배포 전 운영 판을 내려받아 견줬는데(S2-6), church-admin 은 그 확인이 없었다 — 2026-09-30 에만 main 에 🧪 시험 참여자 서버 액션이 들어왔고, 워크트리 배포는 그것까지 운영에 올린다. → S1-4 에 「운영 = main」 대조(다르면 주인에게 묻고 간다) · S2-6 에 「운영 = 1단계 판」 대조를 **ⓐ 전에**(ⓐ~ⓑ 사이 쓰는 곳이 없는 몇 분을 늘리지 않게).
12. **성경암송 옛 화면 주석이 확인 grep 을 스스로 깨뜨렸다.** S2-1 스크립트가 남기는 주석 「자격 인정(askExcuse · … prompt()/alert())은 교회 어드민 📋 가을 말씀 동행 …」 때문에 S2-10 의 `grep -cE 'askExcuse|…|prompt\(|alert\('` 가 `0` 이 아니라 `1`, `📋 가을 말씀 동행` 이 `1` 이 아니라 `2`, 라이브 `askExcuse` 가 `0` 이 아니라 `1` 이 된다(메모리 안에서 패치를 돌려 셌다). → 주석을 그 글자 없이 다시 씀 · 다시 돌려 `0`·`1`·타일 `2`·인라인 스크립트 문법 통과 확인.
13. **다른 세션과의 개발 배포 충돌이 적혀 있지 않았다.** 개발 함수 배포는 작업 트리를 통째로 올려 `be-decide`·`people-link` 가 개발에 올린 판을 덮는다(반대도). → Global Constraints 「다른 세션」 · Task 3 Step 11 에 배포 전 `ListAgents`/`SendMessage` · S1-5 에 공용 main 체크아웃의 남의 미커밋 파일 확인(치우지 않는다) · S2-12 에 「`api` 는 얼림 넷이 든 판에서만」 알림.

### 앵커 · 글자 · 명령
14. **Task 1 Step 6 의 기대값이 틀렸다.** `1498177` 의 5145 줄은 「// 날짜 더하기 …」가 아니라 **빈 줄**이다(주석은 5146 · md5 `8a35f39b…` 는 맞다). Git Bash 의 `md5sum` 꼬리는 `  -` 가 아니라 ` *-` 다. → `sed -n '5145,5146p;5199p' | cat -A` 와 그에 맞는 기대값 · 해시 꼬리를 셸 무관으로(Task 1 Step 6 · Task 2 Step 1).
15. **다른 가지가 바꾸는 줄을 앵커로 썼다.** `audit.js` 의 `people.fill` 한 줄과 `privacy.html` 7번 「기록:」 둘째 줄은 `be-decide` 가 바꾼다 — 먼저 들어오면 Task 5 ③·Task 8 ⑥ 이 `0` 으로 멈춘다. → Task 5 ③ 은 `people.lookup` 줄 **앞**에 끼우고, Task 8 ⑥ 은 「보관과 삭제:」 줄 **앞**에 새 줄을 끼운다(기록 줄은 고치지 않음 · 「꾸준함을 재는 회차」 셈은 그대로 `3`). 두 앵커 모두 main·be-decide 에서 `1` 임을 확인했고 Task 1 Step 3 에 더했다.
16. **「파일 끝」·「`};` 앞」이 이미 사실이 아니다.** main 에 🧪 시험 참여자가 들어오며 `css/admin.css` 의 `.be-pp-note` 뒤에 `.mt-*` 가, `authz.ts`·`PROBE` 의 `evPerson` 뒤에 사역 줄이 붙었다. → 「앵커 바로 뒤(그 뒤 남의 줄 앞)」로 고쳐 적음(Task 3 Step 3 · Task 6 Step 10).
17. **숫자 셋이 틀렸다.** Task 8 Step 1 앵커는 열둘이 아니라 **열셋**(privacy 일곱·CLAUDE.md 여섯) · Task 4 Step 4 의 처음 실패는 새 시험 **넷**(누출 더함) · S1-4 의 「같음 열넷」은 다른 세션이 모듈을 더하면 달라진다고 적음.
18. **메모리 정리가 남의 할 일을 지울 뻔했다.** S2-12 가 `bible-events-admin-live.md` 의 `- 남은 것:` 줄을 통째로 바꾸면 이 일과 상관없는 ①(역할 주기)·③(회차 차례)이 사라진다. → ② 조각만 줄 긋고 새 줄을 더함 · ①·③ 은 친구에게 물어서만.

### 검토했지만 고칠 것이 없던 것
- 세 곳 규칙: 새 액션 다섯 모두 `ACTION_ROLES`·`switch`·`PROBE`(없는 회차·줄 0 → `not-found` · 기록·쓰기 없음) · `authz.test.mjs` 기대 목록의 코드 포인트 차례(`evEligMissing` < `evEligRows` < `evEventCreate` … `evEvents` < `evExcuseAdd` …)가 맞다.
- 얼림 차례: ⓐ(S2-7 성경암송 `eventExcuse` 얼림 + `eventRoster` note 빼기 · 개발은 S2-4 에서 먼저) → ⓑ(S2-8 게이트 연 함수) → ⓒ(S2-9 화면) — 1단계는 쓰기 셋이 게이트로 닫혀 있고 `evRowSave` 는 표기를 막기만 해 쓰는 곳이 둘인 창이 없다. 1단계 동안 가을 줄의 `note` 에 사유가 들어갈 길이 없어(성경암송 `eventSetNote` 는 이미 얼었다) 옛 `eventRoster` 의 `note` 노출도 새지 않는다.
- 셈: `events-elig.ts` 의 `eligRule`·`needFor`·`canReach` 는 `1498177` 원문과 글자까지 같고(원문 블록 md5 확인), 시험 보기의 기대값(가을 §3 표 · `canReach` 여섯 · `eligCounts` 여섯 줄 · 개발 시험의 `full`·`two`·`exapp`·`paper`·`old` 값)을 손으로 다시 셌다 — 모두 맞다. `v2_event_weeks` 의 `first_day` 는 전 기간 최솟값, 창 안 활동이 없으면 행이 없다(`event_streak.sql`) — 계획의 가정과 같다.
- 성경암송 S2-1 스크립트 앵커 네 파일 모두 지금 HEAD 에서 한 번씩 맞고, 패치 뒤 인라인 스크립트가 문법상 온전하다(메모리 안에서 확인).
- 화면: `roster-ui.js`·`roster.js`·`row-form.js` 의 옛 글자(old)가 main 과 글자까지 같고, 새로 들이는 이름(`errorText`·`groupRows`·`notOpenText` 등)이 그 파일들에 이미 없다(두 번 선언 없음) · 서버 새 이름도 main·be-decide·people-link 어디와도 겹치지 않는다 · 시스템 창 검사(주석 뺀 정규식)가 지금 `bibleevent/*.js` 에서 0 건.
- 날짜: 모든 한국 날짜는 파이썬(또는 시험 안의 +9h)으로 구하고 `TZ=Asia/Seoul date` 는 쓰지 않는다 · 캐시 무력화의 `$(date +%s)` 는 시간대와 무관하다.
- **고친 뒤 메모리 안에서 돌려 본 것**(파일을 만들지 않고 계획의 코드 조각을 그대로 이어 붙여): 전체 파일 꼴의 코드 조각 열여섯(`events-elig.ts`·index.ts 절 셋·시험 파일들·`elig-logic.js`·`excuse-form.js`·하네스 둘·시드 조각) 문법 통과 · Task 2 순수 시험 **11/11**(1498177 원문 사본과 맞대기 포함 · 닫히는 쪽 게이트 포함) · Task 6 `be-elig-logic` **11/11** · `be-roster-ui` 새 시험 넷 통과(실패 하나는 stdin 실행이라 다른 화면 파일을 상대 경로로 못 찾은 것 — 계획과 무관) · Task 5 `audit` **12/12** 를 main 과 `be-decide` 두 판에서.
