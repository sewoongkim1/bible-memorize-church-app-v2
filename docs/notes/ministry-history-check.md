# 사역현황 · 사역 이력 확인 · 정정 신청 (2026-10-01)

> **언제 읽나:** 첫 화면 「사역현황」 묶음 · `renderMinistryHistory` · `api` `ministryHistory*` · 교회 어드민 `internalMyHistory`·`internalHistoryRequest`·`ministry_history_requests` 를 손볼 때
> 설계 `docs/superpowers/specs/2026-10-01-ministry-history-check-design.md` · 계획 `docs/superpowers/plans/2026-10-01-ministry-history-check.md`

- **문은 사역신청과 하나다(`ministryVisible()` · 서버는 기간·시험 참여자·관리자 비번).** 기간(12/13~12/27)이 끝나면 「사역 이력 확인」도 숨는다 — 친구 결정 「같이 오픈」. 늘 열고 싶어지면 게이트를 그때 나눈다.
- ⚠️ **`b.preview` 는 받지 않는다** — 서버가 확인할 수 없다. 미리보기 화면은 관리자 비번(`minPw()`)으로만 통과한다.
- **본인 찾기 규칙은 교회 어드민 `people-match.ts` `matchLoginPerson` 한 곳**(교구 = 교구+목장+이름, 교회학교 = 부서+이름 · `sameAffiliation` 그대로). ⚠️ 그 파일의 `sameAffiliation`·`mokNumber` 를 고치면 앱 화면도 바뀐다. 앱 쪽에 규칙을 복사하지 말 것.
- ⚠️ **로그인은 본인 확인이 아니다** — 다른 분 이름·소속으로 들어오면 그분 기록이 보인다(친구 확인). 그래서 보이는 칸을 홈페이지 명단에 오르던 칸(연도·부서·팀·직책·직분)으로만 좁혔고 **신청만으로 기록이 바뀌지 않는다.** 칸을 늘리려면 이 전제부터 다시 볼 것.
- **교회 어드민 함수의 새 입구:** `x-internal-key` 머리가 있으면 토큰 검사 **앞에서** 내부 갈래로만 간다. 내부 액션은 `ACTION_ROLES` 에 없다(토큰으로 부르면 unknown-action — 시험이 본다).
- **kind·status 글자는 세 곳**(SQL 008 CHECK · `history-check.ts` · `app.js` `MH_*`). 보이는 말만 바꾸려면 `MH_KIND_TEXT`.
- **응답 칸은 `historyRowOut`·`requestOut` 이 정한다** — 교인ID·`user_id`·맞춤 근거·그때 목장을 싣지 않는다(`tests/history-check.dev.test.mjs` 가 키 집합과 숫자·uuid 누출을 본다).
- 앱 계정이 합쳐지면(`member-merge`) 옛 계정의 정정 신청은 새 계정 화면에 안 보인다(표가 `user_id` 로 묶는다 — 합치기 코드는 이 표를 모른다). 생기면 담당자가 처리하면 된다.
- **남은 것 — 담당자 처리 메뉴(교회 어드민 · 설계 §7).** ⚠️ **12/13 신청 기간 전에 있어야 한다** — 기간이 열리면 성도님 모두에게 단추가 보인다.

## 받아들인 위험(2026-10-01 친구 확인)

- 「찾음/못 찾음」 자체가 「이 목장에 이 이름이 명부에 한 분 있다」를 알려 준다(기록 0줄이어도) — 문이 열린 동안(시험 참여자 · 12/13~12/27)만.
- 남의 이름으로 들어와 그분 줄마다 「내 것이 아니에요」를 걸 수 있다(진짜 본인은 「신청함」에 막힌다) · 계정을 마음대로 만들어 「찾아 주세요」를 많이 넣을 수 있다 → §7 담당자 메뉴가 처리 전 본인 확인을 거친다.
- 정정 신청 글·담당자 답은 같은 이름·소속으로 들어오는 사람에게 보인다(안내·창 문구로 알림).
- **MH_LIVE 스위치** — 운영 서버(교회 어드민 내부 갈래·정정 신청 표)가 올라가기 전까지 운영 주소에서는 첫 화면 「사역현황」 묶음을 숨긴다(🤝 는 「함께」 원래 자리로). 개발·localhost(`window.SUPA.env === "dev"`)에서는 늘 켜진다. 계획 Task 9(운영 반영)에서 `const MH_LIVE = true;` 로 바꾼다.
- 과제 9 합칠 때 autumn-excuse 가지와 `Deno.serve(` 앞·import 덩어리에서 충돌 — 풀 때 `x-internal-key` 갈래가 토큰 검사보다 **앞에** 남아야 한다.
- 운영에서 문을 열기 전에 b6 의 맞춤(person_id 잇기)이 끝나 있어야 한다 — 안 그러면 「기록 0줄」이 보여 「빠진 사역」 신청이 쏟아진다.
