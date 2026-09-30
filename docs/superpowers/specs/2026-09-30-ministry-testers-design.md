# 사역신청 시험 참여자 (2026-09-30)

> 친구 요청: 「첫 메뉴의 사역신청을 특정 사람들에게 열어 시험하려 한다. 사람을 더할 어드민 메뉴와,
> 그분이 로그인했을 때 첫 화면에서 들어갈 수 있게.」 — 설계 승인 2026-09-30.

## 지금
- 첫 화면 🤝 사역신청은 **기간(app_config `ministry` · 운영 2026-12-13~12-27)에만** 보인다(`ministryVisible()`).
- 기간 밖에는 `?preview=ministry` 주소를 아는 사람만 시험한다. 서버는 `b.preview` 깃발만 보고 통과시킨다
  (2026-09-09 일부러 열어 둠 · 12/13 전에 걷을 계획).

## 달라지는 것
- **교회 어드민 「🤝 사역신청」 묶음에 「🧪 시험 참여자」**(역할 `ministry`). 이름으로 앱 계정을 찾아
  소속·마지막 접속을 보고 **한 분씩** 더하기·빼기. 앱에 한 번이라도 로그인한 분만 찾을 수 있다.
- 명단에 오른 분이 앱에 로그인하면 **기간 밖에도 첫 화면에 🤝 사역신청**이 보이고 신청·고치기·취소가 된다
  (`?preview=ministry` 와 같은 동작). 다른 성도님께는 아무것도 달라지지 않는다.

## 저장 — 새 표·SQL 없음
- app_config **`ministryTesters`** = identity_key 배열(`ministryAdmins` 와 같은 모양).
- `PUBLIC_CONFIG_KEYS` 에 넣지 않는다(이름이 든다). app_config 는 공개 키로 안 읽힌다(2026-09-30 확인 — 빈 배열).
- **키가 아니라 사람(user_id)으로** 맞댄다 — 소속이 바뀐 분의 옛 키는 `user_identity_aliases` 로 간다(담당자 확인과 같은 규칙).

## 교회 어드민(church-admin)
- 액션 셋(역할 `ministry`): `ministryTesters`(명단) · `ministryTesterFind`(이름으로 앱 계정 찾기) · `ministryTesterSave`(`op` add|remove, `key`).
  - 응답에 `user_id` 를 싣지 않는다. 손잡이는 identity_key(이름·소속으로 만든 값 — 비밀이 아니다).
  - 더하기는 **users 에 있는 키만**. 저장 뒤 **다시 읽은** 명단을 돌려준다(읽고-고쳐-쓰기).
  - 바꾼 기록 `ministry.tester`(`{op, name, who}`).
- 세 곳: `authz.ts` ACTION_ROLES · `index.ts` switch · `tests/server.dev.test.mjs` PROBE.
- 화면 `js/menus/ministry/testers.js` + `registry.js` 한 줄 · `audit.js` 라벨.

## 성경암송 앱(v2)
- `api` 새 액션 **`ministryTester {user_id}` → `{ok, tester}`** — 그 계정이 명단에 있는가 하나만.
- `ministryApply`·`ministryCancel` 기간 검사에 **시험 참여자면 통과**를 더한다. 지금은 `b.preview` 로도 통과하지만,
  12/13 전에 `|| b.preview` 를 걷어도 시험 참여자는 그대로 되게.
- `app.js`: 시작할 때 `refreshMinistryTester()` → localStorage `ministry-tester::<user_id>`("1"/"0") 캐시.
  **모르면 숨긴다**(캐시 없음 = 안 보임). 값이 바뀌면 첫 화면이면 다시 그린다(`refreshEventOpen` 과 같은 방식).
  `ministryVisible()`·`minPrev()` 에 `ministryTesterCached()` 를 더한다.

## 그대로 두는 것
- `?preview=ministry` 는 지금처럼 누구나(12/13 전에 걷을지는 기존 계획대로 친구가 정한다).
- 시험 신청은 진짜 신청 현황에 섞인다 — 12/13 전에 지우는 것은 기존 계획과 같다(명단이 있어 가리기 쉬워진다).

## 배포 순서
`api`(개발→운영) → 앱 bump·푸시 → church-admin 함수(개발→운영) → 어드민 화면 푸시.
앱이 먼저 나가도 액션이 없으면 `catch` → 숨김이라 안전하다.

## 확인
- church-admin 개발 서버 시험(PROBE · 역할 없는 분 막힘).
- 개발 DB localhost: 명단에 넣은 계정으로 로그인 → 단추 보임 · 신청 저장 · 빼면 단추 사라짐. preflight 둘 다.
