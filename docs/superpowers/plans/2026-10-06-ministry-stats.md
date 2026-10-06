# 교회 어드민 「📊 사역 통계」 — 만드는 계획 (2026-10-06)

> 설계 `docs/superpowers/specs/2026-10-06-ministry-stats-design.md`(친구 확인 2026-10-06). 코드는 교회 어드민 저장소(`c:\Projects\church-admin` · 작업 폴더 `C:\Projects\church-admin-edu`).
> 한 사람이 차례로 만든다(서브에이전트 없음). 과제가 끝날 때마다 아래 칸에 표시하고 커밋 번호를 적는다.

**목표:** 사역 이력 17년치를 부서 이음표로 잇고, 해마다 봉사자·자리와 계속·돌아옴·처음·나감을 큰 분류·계열별로 보여 주는 메뉴 하나.

**얼개:** SQL 함수가 사람을 번호로 바꾼 재료 한 묶음(jsonb)을 내고 → Edge Function 안의 순수 모듈이 세어 → 묶음 숫자만 화면에 준다. 화면은 표와 SVG 막대(라이브러리 없음).

## 지켜야 할 것(모든 과제에)

- 개발 먼저, 그다음 운영. SQL → 함수 → 화면 차례(푸시 = 운영 화면).
- 새 표·함수는 RLS 켜고 `anon`·`authenticated` revoke. `TO authenticated` 금지. 운영에 올린 뒤 `check-authenticated-exposure.sql` 0줄.
- 함수 배포 전에 배포된 것을 내려받아 기대 커밋과 대조한다.
- 응답·화면·저장소에 이름·교인ID·사람 번호·태어난 해를 싣지 않는다. 운영 줄을 들여다보지 않는다(묶음 수와 부서·팀 이름만).
- 새 액션 = `authz.ts` `ACTION_ROLES` + `index.ts` case + `tests/server.dev.test.mjs` `PROBE` 셋 모두.
- 고르기는 `.tabs` 단추(시스템 select 금지) · 서버 글자는 `esc` · 이벤트는 이 화면의 `el` 에만.
- 푸시 전에 `python tools/preflight.py`.

## 과제

- [ ] **1. SQL 013** — `supabase/sql/013_ministry_stats.sql`
  - `mh_key(text)`(NFC · 띄어쓰기 없음) · 표 `ministry_dept_map`(부서 열쇠, 팀 열쇠 → 큰 분류 · 계열 · 중분류 · 표준 팀) · 표 `ministry_list_gaps`(scope, year_from, year_to) + 씨앗 넷
  - `ministry_stats_facts()` → `{years, map, seats, people, gaps, unmapped, source_date}` · service_role 만
  - 사람 종류: m(교인) · g(떠난 분 — 못 이은 까닭 앞머리 글자 넷 · `link_how='none'` · 이어졌지만 명부에 없는 교인ID) · u(아직 못 정함)
  - 끝에 확인 select(표 줄 수 · 권한 0 · 재료의 줄 수)
- [ ] **2. 이음표 씨앗** — `tools/history/dept_lineage_draft.py --seed-sql <파일>` → `supabase/sql/013b_ministry_dept_map_seed.sql`
  - 열쇠는 `mh_key` 와 같은 다듬기 · `on conflict … do update … where source = 'seed'` · 쌍 수 = 2차 엑셀의 쌍 수(띄어쓰기 없앤 열쇠 기준)
- [ ] **3. 세는 규칙** — `supabase/functions/church-admin/ministry-stats.ts`(순수) + `tests/ministry-stats.test.mjs`
  - `buildStats(facts)` → `{years, sourceDate, units, inner, meta}` · 단위 `all3`·`g:<큰 분류>`·`f:<계열>`
  - 줄마다: seats · people · multi · gap · prev · stay · back · first · firstEver · firstOther · left · moved · rest · gone · keep · demo(나이 평균·나이대 · 성별 · 직분 — 봉사자 30명 이상 · 1~4명 칸은 -1)
  - 시험: 계속·돌아옴·처음 둘·옮김·쉼·떠남 · 일부인 해 건너뛰기(큰 분류·계열·`*`·끝 없는 것) · 유지율 5명 규칙 · 30명 규칙 · 「5 미만」 · 미정 · 못 이은 까닭 글자가 TS 상수와 SQL 에 함께 있나
  - 진짜 자료 대조(이 PC): `tools/history/stats_check.py` — 통합 엑셀을 「이름 = 사람」 재료로 만들어 `buildStats` 와 파이썬 어림을 맞댄다(수만)
- [ ] **4. 서버 액션** — `ministryStats`(역할 `ministry`) · `index.ts` case · `authz.ts` · `PROBE` · `tests/ministry-stats.dev.test.mjs`(응답에 사람 정보 없음)
- [ ] **5. 화면** — `js/menus/ministry/stats.js` + `stats-logic.js` + `css/admin.css`(`.mst-*`) + `registry.js` + `tests/ministry-stats-logic.test.mjs`
  - 미리보기 구성 그대로: 범위 단추 → 카드 넷 → 쌓은 막대 → 해마다 수 → 계열별/안쪽 나눔 → 나이·성별·직분 → 세는 법 → 엑셀
  - 폰(390px)·PC(1100px) 화면을 찍어 본다(가짜 `call` 에 진짜 모양의 묶음)
- [ ] **6. 여는 순서** — SQL 013·013b 개발 → 함수 개발 → 로컬 화면 → SQL 운영 → 함수 운영(내려받아 대조) → 푸시 → 운영 확인(재료의 해별 줄 수 · 이음표에 없는 쌍 수)
- [ ] **7. 문서** — church-admin `CLAUDE.md` · v2 `docs/notes/ministry-stats.md`(새) · v2 `CLAUDE.md` 지도 한 줄 · 작업 기록(`docs/analysis`)

## 진행 기록

| 과제 | 상태 | 커밋 |
|---|---|---|
