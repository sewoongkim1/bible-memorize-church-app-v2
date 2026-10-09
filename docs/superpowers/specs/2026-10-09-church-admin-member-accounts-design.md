# 성도 계정 관리 — 교회 어드민 이전 설계 (2026-10-09)

관리 기능을 모두 교회 어드민(admin.onlybible.kr)으로 옮기는 큰 과제(백로그 4-5)의 **두 번째 묶음**. 첫 묶음(이벤트 명단·사역신청)은 이미 옮겼다. 이번은 **성도 계정 관리**(`admin-members`): 성도(앱 계정) 찾기·이름/소속 변경·변경 이력·계정 합치기.

## 왜

성경암송의 관리자 문은 암호 하나(`ADMIN_SECRET`, 세 앱 공용)다. 누가 들어왔는지 모르고, 암호가 새면 86개 액션이 한꺼번에 열린다. 교회 어드민은 카카오 로그인 + 승인 + 역할이라 「누가·어느 메뉴까지」가 사람마다 정해지고 바꾼 기록이 남는다. 성도 계정은 **개인정보가 가장 무겁고**(이름·소속 변경), 합치기는 **계정을 지워 되돌릴 수 없다** — 그래서 제대로 된 권한 뒤로 옮긴다.

## 현황 (조사 2026-10-09)

**성경암송 쪽(옮길 것):** 프런트 한 쌍(`admin-members.html` + `js/admin-members.js`), API 액션 5개, 뒤의 RPC·트리거.
- 액션 5개 — `adminFindMembers`(users 이름 검색·51건), `adminUpdateMember`(RPC `admin_update_member_profile`), `adminMemberHistory`(user_profile_changes 20건), `adminPreviewMemberMerge`(RPC `admin_preview_member_merge`), `adminMergeMembers`(RPC `admin_merge_members`). 모두 `adminError` + 관리자 문(SUPER_OK) 뒤. `ADMIN_PW_ONLY` 예외 아님.
- `member_merge.sql`(527줄) — RPC 3개 + 쓰기 리다이렉트 트리거 1개. 합치기 본체 `admin_merge_members`(~350줄)가 성경암송 사용자 연관 표 ~30개를 표마다 다른 규칙으로 병합. **성경암송 데이터 모델에 깊이 묶여 있다.**
- `member_profile.sql` — `user_identity_aliases`(옛 식별자 → 같은 계정 별칭), `user_profile_changes`(변경 이력). 둘 다 service_role 에만 grant.
- ⚠️ `findMember`·`memberParticipation` 은 `admin-members` 가 안 쓴다 — **MCP 전용** 조회 액션이라 이 묶음에서 뺀다(그대로 둔다).

**교회 어드민 쪽(받을 곳):** 같은 Supabase 프로젝트를 service_role 로 직접 붙는다. `users` 를 이미 직접 읽고, 위 세 RPC 는 service_role 에 grant 돼 있어 **`db.rpc()` 로 바로 부를 수 있다**(지금은 안 부름). 교인명부(`church_people`, 교적, 읽기 전용)와 앱 계정(`users`)은 **다른 표**다. 메뉴는 `js/menus/registry.js` 한 줄 + `authz.ts` 역할 + 화면 모듈로 추가한다.

## 설계

### 1. 범위 · 화면

- 교회 어드민 **교인명부 그룹에 새 메뉴 「👤 성도 계정」**. 검색 대상은 **앱 계정 `users`**(교적 `church_people` 아님).
- 화면은 `admin-members` 를 그대로 옮긴다: **이름 검색 → 결과 목록(등록일·최근접속·[수정]) → 수정(교구/교회학교 토글·소속·이름·변경 사유 필수·낙관적 잠금 `expected_key`) → 저장 · 변경 이력 20건 · 소속 충돌 시 합치기 패널**.
- **교인 「자세히」 창에는 넣지 않는다** — 그 창은 교적(church_people) 기준이고 앱 계정과는 확인 번호로 이어진 일부만 닿아 전체 계정을 못 덮는다. 전체를 다루는 독립 메뉴 하나로 간다(YAGNI · 자세히 통합은 나중에 필요하면).

### 2. 서버 액션 · 데이터 접근

교회 어드민 `index.ts` 에 새 액션 5개. 전부 service_role 로 같은 DB 에 직접(알림 없어 내부 키 불필요).

| 새 액션(church-admin) | 하는 일 | 방식 | 역할 |
|---|---|---|---|
| `memberFind` | 이름으로 `users` 검색(ilike·51건 제한·등록일·최근접속) | 표 직접 읽기 | `members` |
| `memberUpdate` | 이름·소속 변경(낙관적 잠금 `expected_key` · 변경 사유) | `db.rpc("admin_update_member_profile")` | `members` |
| `memberHistory` | 변경 이력 20건 | `user_profile_changes` 직접 읽기 | `members` |
| `memberMergePreview` | 합칠 두 계정 + 건수 미리보기 | `db.rpc("admin_preview_member_merge")` | `super` |
| `memberMerge` | 실제 합치기 | `db.rpc("admin_merge_members")` | `super` |

- **합치기 로직(RPC 3개·트리거·~350줄 SQL)은 성경암송 저장소에 그대로 둔다.** 트리거가 앱 쓰기에 붙어 있어야 하고 RPC 는 성경암송 표를 다룬다. 교회 어드민은 `db.rpc()` 로 **부르기만** 한다.
- `adminUpdateMember` 가 DB 유니크(23505)를 `identity-conflict` 로, `adminMergeMembers` 가 `merge-record-conflict` 로 바꾸던 처리도 새 액션에 옮긴다.
- 반환 꼴(목록·이력·미리보기·합치기 결과)은 지금 성경암송 응답과 같게 두어 화면 로직을 최대한 그대로 옮긴다.

### 3. 역할 · 권한

- 새 역할 **`members`(라벨 "성도 계정")** 를 `authz.ts` `knownRoles` 에 추가.
- `ACTION_ROLES`: `memberFind`·`memberUpdate`·`memberHistory` = `"members"` · `memberMergePreview`·`memberMerge` = `"super"`. (super 는 `canCall` 에서 모든 액션 자동 통과.)
- `members` 역할인 분이 수정 중 소속 충돌(`identity-conflict`)이 나면, 화면은 합치기 패널 대신 **「이 소속은 다른 계정이 쓰는 중이에요 — 총괄에게 계정 합치기를 요청하세요」** 안내를 띄운다(합치기는 super 만).
- 메뉴 「👤 성도 계정」은 `members`·`super` 에게 보인다. **합치기 버튼은 화면에서 super 에게만** 노출(`me` 응답의 roles 로 판단) + 서버가 역할로 한 번 더 막는다(화면 숨김은 편의, 차단은 서버).
- 친구가 「시스템 → 담당자·역할」에서 역할을 부여한다.

### 4. 배포 순서 · 걷기

1. **교회 어드민 먼저** — 액션 5개 + 역할 `members` + 메뉴 + 화면 모듈. 개발 배포 → 확인 → 운영 배포.
2. 친구가 역할을 부여하고 **운영에서 한 바퀴**(찾기·수정·이력·합치기) 확인.
3. **확인된 뒤에야 성경암송 쪽을 걷는다** — 5개 `admin*` 액션을 **얼리고**(`{ok:false, error:"moved-to-church-admin"}`) · `admin-members.html`·`js/admin-members.js` 제거 · 허브(`admin.html`)의 「성도 정보」 타일 제거 · bump.
- **되돌리기:** 교회 어드민 옛 판 재배포. 성경암송은 3단계 전까지 옛 화면 그대로라 언제든 멈춘다.

## 그대로 두는 것

- `member_merge.sql`·RPC 3개·트리거 (성경암송 표·앱 쓰기 트리거).
- `member_profile.sql`·`user_identity_aliases`·`user_profile_changes` (RPC 가 쓴다 · 같은 DB).
- `findMember`·`memberParticipation` (MCP 전용 · `ADMIN_PW_ONLY`).
- 관리자 문(SUPER_OK)이 성경암송 api 에서 교회 어드민 `admin_members`/`admin_role_grants` 를 읽는 교차 참조 (다른 묶음도 씀).

## 파일 지도

**교회 어드민(`C:\Projects\church-admin`):**
- `supabase/functions/church-admin/index.ts` — 새 액션 5개(`memberFind`·`memberUpdate`·`memberHistory`·`memberMergePreview`·`memberMerge`) + switch 라우팅.
- `supabase/functions/church-admin/authz.ts` — `knownRoles` 에 `members` · `ACTION_ROLES` 에 다섯 액션.
- `js/menus/registry.js` — 메뉴 「👤 성도 계정」 한 줄(그룹 교인명부 · 역할 `members` · lazy import).
- `js/menus/people/member-accounts.js`(새 파일) — 화면 모듈(검색·수정·이력·합치기 패널). 순수 렌더는 `admin-members.js` 로직을 옮겨 온다.
- `tests/registry.test.mjs`·`tests/authz.test.mjs` — 새 역할·액션 등록 반영.

**성경암송(`C:\Projects\bible-memorize-church-app-v2`) — 3단계에서 걷을 것:**
- `supabase/functions/api/index.ts` — `adminFindMembers`·`adminUpdateMember`·`adminMemberHistory`·`adminPreviewMemberMerge`·`adminMergeMembers` 얼림.
- `admin-members.html`·`js/admin-members.js` 제거 · `admin.html` 타일 제거.
- (그대로) `supabase/member_merge.sql`·`member_profile.sql`.

## 지킬 것 · 함정

- ⚠️ 앞으로 교회 어드민에 `user_id` 가진 새 표가 생기면 `member_merge.sql` 네 곳(본체 옮기기·허용목록 둘·counts) + 트리거 foreach + `tests/member-merge-coverage.test.cjs` 에 등록해야 합치기가 그 표를 놓치지 않는다(지금 규칙 그대로).
- ⚠️ 합치기는 advisory lock(7240910)과 같은 DB 를 공유한다 — 교회 어드민이 부르든 성경암송이 부르든 같은 잠금을 탄다.
- ⚠️ 3단계(성경암송 걷기)는 **교회 어드민 운영 확인 뒤에만**. 먼저 걷으면 성도 정보 관리가 한동안 어디에도 없게 된다.
- ⚠️ 교회 어드민 배포는 작업 트리를 올린다 — 배포 전 그 저장소 `git status` 로 남의 미커밋 확인(공유 체크아웃).
- `member_merge.sql`·RPC 를 운영에 다시 돌리지 않는다(이미 운영에 있음). 교회 어드민은 **부르기만** 한다.
