# 교회 어드민 시스템 설계 (1차: 사역신청)

- 날짜: 2026-09-28
- 상태: 설계 확정(구현 계획 전)
- 한 줄: 교회 담당자만 카카오 로그인으로 들어오는 **교회 전체 관리 웹**의 뼈대를 새로 세우고,
  지금 `admin-stats.html?only=ministry` 안에 있는 **사역신청 관리 화면**을 첫 메뉴로 옮겨 담는다.

## 0. 정한 것과 까닭

| 물음 | 정한 것 | 까닭 |
|---|---|---|
| 지금 사역 화면과의 관계 | **새 틀로 옮겨 담는다** | 이미 운영 중인 화면(여섯 개·표준 v1)을 버리지 않는다. 뼈대만 새로, 메뉴는 옮긴다 |
| 로그인 | **카카오 로그인**(Supabase Auth) | 50~70대 담당자가 암호를 외울 필요가 없다. 사람마다 계정이라 누가 고쳤는지 남는다 |
| 권한 단위 | **메뉴 단위 역할** | 사역 담당자는 모든 부서 신청을 본다(2026-09-17 결정 그대로). 부서 단위는 나중에 더할 자리만 남긴다 |
| 어디에 | **별도 저장소 + `admin.onlybible.kr` + 새 Edge Function `church-admin`** | 성도 앱 배포(bump·캐시태그)·여러 세션 충돌과 떨어진다. JWT 없는 `api` 구조를 물려받지 않는다 |
| 갈아탄 뒤 앱 | **입구만 남긴다** | 앱 설정 「🔒 관리 페이지 → 🤝 사역관리」 단추는 그대로, 누르면 새 웹이 열린다. 옛 화면·사역 암호는 없앤다 — 규칙이 두 벌이면 반드시 한쪽만 고쳐진다 |
| 화면 크기 | **폰 우선, PC 에서 넓게** | 같은 화면이 폭에 맞춰 바뀐다(따로 만들지 않는다) |

## 1. 전체 뼈대

```
[담당자 폰/PC 브라우저]
   admin.onlybible.kr  (새 저장소 church-admin · GitHub Pages)
        │ ① 카카오 로그인 → Supabase Auth 가 JWT 발급
        │ ② 모든 요청에 JWT
        ▼
[Edge Function church-admin]  (verify_jwt 켬)
   · JWT → 누구인지 → admin_members / admin_role_grants 로 역할 확인 (액션마다)
   · 바꾸는 요청은 admin_audit 에 기록
        ▼
[Supabase 운영 DB xnomlgydifiqiybervtf]  (개발은 ktpwthwqzgcqcrmsafdo)
   기존: ministry_orders · ministry_catalog · users … (그대로)
   새로: admin_members · admin_roles · admin_role_grants · admin_audit
```

### 저장소 모양 (빌드 없음 · 브라우저 ES 모듈)

```
index.html               로그인 화면 + 껍데기(머리줄·메뉴)
js/core/auth.js          카카오 로그인·세션 유지(supabase-js)
js/core/api.js           church-admin 호출 — 답을 ok / confirm / error 로 나눠 돌려준다
js/core/router.js        #/ministry/list 식 주소, 로그인 뒤 보던 화면으로 돌아오기
js/core/ui.js            표준 v1 부품: 단추·확인 창(mnDialog)·토스트(mnNote)·붙는 머리
js/core/config.js        주소를 보고 개발/운영 DB 를 저절로 고름 + 「개발 DB」 띠
js/menus/registry.js     메뉴 목록 { id, 이름, 역할, 모듈 }
js/menus/ministry/       list.js(신청 현황) · catalog.js(사역팀 정보)
                         paper.js(종이 명단) · appointed.js(임명현황)
js/menus/system/         members.js(담당자·역할 관리 — super 만) · audit.js(바꾼 기록)
css/tokens.css           :root 토큰
css/admin.css            사역신청 관리 표준 v1 을 그대로 옮김
supabase/functions/church-admin/index.ts
supabase/sql/            admin_* 표 SQL
tools/preflight.py       문법 + 액션·역할 표 검사
```

- 메뉴 하나 = 폴더 하나. `registry.js` 에 한 줄 더하면 새 부서 메뉴가 붙는다.
- **화면에서 메뉴를 숨기는 것은 편의일 뿐, 막는 것은 늘 서버다.**
- 기존 사역 표의 SQL 원본은 지금 저장소(`bible-memorize-church-app-v2`)에 그대로 둔다.

### 화면 폭

| | 폰 (~767px) | PC (1024px~) |
|---|---|---|
| 메뉴 | 머리줄 ☰ → 펼침 | 왼쪽 고정 메뉴 |
| 신청 현황 | 지금처럼 카드 | 표(이름·소속·사역·상태·신청일) |
| 기준 | 관리 화면 표준 v1(360~390px · 단추 44/48px · 글씨 13px 이상) | 같은 부품, 넓은 배치 |

## 2. 로그인과 권한

### 들어오는 순서
1. 「카카오로 시작하기」 → 처음이면 **교구·목장·이름**(앱 로그인과 같은 칸)을 한 번 적는다 → 「승인을 기다리고 있어요」.
2. 총괄 관리자(super)가 대기 목록에서 승인하며 역할을 준다. 목록에는 적은 이름·소속 **과 카카오 별명**을 함께 보인다.
3. 그다음부터는 로그인이 유지된다(supabase-js 세션·갱신 토큰).

초대 링크 방식은 쓰지 않는다 — 링크를 잃거나 만료되는 일이 담당자 연령대에서 잦다.

### 표 (모두 새로 · `enable row level security` 를 만든 자리에서 · anon/authenticated 권한 없음 · 서버(서비스 키)만 읽는다)

| 표 | 칸 |
|---|---|
| `admin_members` | id · auth_user_id(unique) · name · gu · mokjang · kakao_nickname · status(`pending`/`active`/`disabled`) · approved_by · approved_at · last_login_at · created_at |
| `admin_roles` | id(`super`·`ministry`) · label · description |
| `admin_role_grants` | member_id · role_id(→ admin_roles) · granted_by · granted_at |
| `admin_audit` | id · at · member_id · action · target · detail(jsonb) |

- 역할은 **표 한 곳에만** 있다. CHECK 나 코드 목록에 박지 않는다(「허용 목록이 세 곳」 사고 방지). 역할을 늘리려면 행 하나.
- 화면은 로그인 직후 `me` 액션으로 **쓸 수 있는 메뉴 목록**을 받아 그것만 그린다. 서버는 액션마다 다시 본다 →
  정지·역할 회수는 **다음 요청부터** 바로 먹힌다.

### 액션 · 역할

| 액션 | 역할 |
|---|---|
| `me` · `register`(대기 등록) | 로그인만 되어 있으면 |
| `ministryList` · `ministrySetStatus` · `ministryDelete` · `ministryCatalogSave` · `ministryCatalogOrder` · `ministryPaperCheck` · `ministryPaperSave` | `ministry` |
| `membersList` · `membersApprove` · `membersSetRoles` · `membersDisable` · `auditList` | `super` |

`super` 는 모든 액션을 통과한다. 이 표는 서버 코드 안 한 곳(`ACTION_ROLES`)에 두고, preflight 가 모든 액션에 역할이 있는지 본다.

### 처음 한 번
- 첫 super(관리자)는 카카오로 한 번 로그인해 대기로 들어간 뒤, **개발 → 운영** 순으로 SQL 한 줄로 `active` + `super` 를 준다. 그 뒤는 모두 화면에서.
- 기존 사역 담당자(`app_config.ministryAdmins`)가 대기 목록에 오르면 **「기존 사역 담당자와 같은 분」** 표시 —
  적은 교구·목장·이름을 `users`·`user_identity_aliases` 로 사람(user_id)까지 풀어 맞댄다(키끼리 비교 금지 — 2026-09-17 리뷰에서 겪음).

### ⚠️ 먼저 확인할 위험
- **카카오 이메일:** Supabase 카카오 로그인이 이메일을 요구한 적이 있고, 카카오는 이메일 동의에 비즈앱 전환이 필요할 수 있다.
  구현 **첫 단계**에서 개발 프로젝트로 「이메일 없이 로그인」이 되는지 확인한다. 안 되면 비즈앱 전환 여부를 친구와 다시 정한다.
- **앱 안 화면(WKWebView·TWA):** 앱에서 새 웹을 열 때는 **폰 기본 브라우저로** 연다. 앱 안 화면에서는 카카오톡 앱으로 넘어갔다
  돌아오지 못할 수 있다. 실기기(아이폰·갤럭시)로 확인한다.

## 3. 사역신청 메뉴 옮기기

### 원칙: 새로 짜지 않고 옮긴다
`admin-stats.html` 의 사역 코드(`renderMinistryAdmin`·`renderMinistryCatalog`·`renderMinistryPaper`·`renderMinistryAppointed`·
`mnCard`·`mnDialog`·`mnNote` …)를 메뉴별 파일로 떼어 옮긴다. **옮김 확인표**는 `docs/notes/ministry-2027.md` 와
`docs/notes/ministry-admin-ui.md` 의 ⚠️ 항목 전부 — 하나씩 새 화면에서 재현해 지운다. 예:
`rows.map(mnCard)` 둘째 인자 함정 · `.mn-grp[open]` 에 overflow 금지 · `hidden` 이 `display:flex` 에 지는 것 ·
시각은 주일에만 · 앱 신청과 겹친 종이 줄은 신청일을 안 고침 · 삭제는 창 두 번 · 틀린 암호와 「담당자 아님」 같은 답.

### 서버 액션의 거취

| 지금 `api` 에 있는 것 | 가는 곳 |
|---|---|
| 담당자용 7개(`ministryList`·`SetStatus`·`Delete`·`CatalogSave`·`CatalogOrder`·`PaperCheck`·`PaperSave`) | `church-admin` 으로 옮김 → 갈아탄 뒤 `api` 에서 **삭제** |
| 성도용(`ministryCatalog`·`ministryMine`·`ministryApply`·`ministryCancel`) | `api` 에 그대로 |
| `ministryAuth` · `ministryAdmins` · `ministryAdminsSave` · 사역 암호 `MINISTRY_SECRET` · `app_config.ministryAdmins` | 갈아탄 뒤 **없앰** |
| 임명 알림 `ministryNotify` → `pushToSubs` | **발송 코드는 한 벌만** — `api` 에 내부 전용 액션(서버끼리 공유 비밀로만 열림)을 두고 `church-admin` 이 부른다. 웹 푸시·`push_log`·`monitor` 가 얽힌 코드를 두 벌로 만들지 않는다 |

옮기는 동안 **옛 화면·옛 액션은 얼린다**(기능 추가 금지). 규칙이 두 벌인 기간을 짧게 두고 끝나면 지운다.

### 차례 (하나씩 개발 DB 에서 확인 → 운영)
1. **뼈대 · 로그인 · 담당자 관리** (1·2절) — 카카오 이메일 위험 확인이 이 단계의 첫 일
2. **임명현황** — 읽기만. 로그인→서버→자료 한 바퀴를 여기서 검증
3. **신청 현황** — 상태 바꾸기·삭제·임명 알림
4. **사역팀 정보** — 설명 고치기·차례
5. **종이 명단 올리기** — 엑셀 읽기·살펴보기·넣기

### 갈아타기
- **병행 기간:** 새 주소를 열고 담당자를 옮겨 오는 동안 옛 화면도 둔다(같은 DB 라 양쪽 숫자가 같다). 옛 화면 위에 「새 주소로 옮겼어요」 띠.
- **담당자 전원이 새로 로그인한 것을 확인하면:** `admin-ministry.html` → 새 주소로 넘김 · 앱 `MANAGE_LINKS` 의 사역관리 → 새 주소(브라우저로 열기) ·
  `api` 에서 위 표의 삭제 대상 제거 · `admin-stats.html` 의 사역 화면 걷어 냄.
- ⚠️ **신청이 몰리는 기간 한가운데에는 갈아타지 않는다.** 날짜는 사역신청 일정을 보고 친구가 정한다.

## 4. 오류 처리

| 상황 | 화면 |
|---|---|
| 로그인 만료 | 자동 갱신 → 안 되면 로그인 화면 → 로그인 뒤 **보던 화면으로** |
| 역할 회수·정지 | 「권한이 바뀌었어요」 → 메뉴 다시 그림 |
| 대기·미등록 | 「승인을 기다리고 있어요 — 담당자에게 알려 주세요」 |
| 두 담당자가 같은 신청을 동시에 바꿈 | 서버가 「바꾸기 전 상태」(`expect`)를 함께 받아 대조 → 다르면 `conflict` → 「다른 분이 먼저 바꿨어요」 + 그 줄 새로 불러옴 (**새로 더하는 것** — 지금은 나중 것이 조용히 덮는다) |
| 서버 오류 | 삼키지 않는다 — 한 문장 + 오류 번호. 저장 실패 시 적은 내용 유지 |

- 서버 답은 `{ok:true, …}` / `{ok:false, confirm, message}` / `{ok:false, error, code}` 세 가지로 **나눈다**
  (앱에서 되물음 문구를 `error` 에 넣어 확인 창이 안 뜨던 사고를 구조로 막는다).
- 바꾸는 액션은 모두 `admin_audit` 에 한 줄씩 남긴다.
- 확인·알림 창은 브라우저 `confirm/alert` 대신 공용 창만 쓴다(2026-09-17 결정 그대로).

## 5. 시험

1. **권한 표 시험(서버):** 미등록·대기·정지·ministry·super 다섯 사람 × 모든 액션을 개발 DB 에 대고 돌린다. 들어가야 할 것만 들어가야 한다.
2. **공개 키 점검:** `GET {URL}/rest/v1/admin_members?select=*&limit=1` 등 `admin_*` 넷 — **행이 하나라도 오면 실패.**
3. **preflight(배포 전, Actions):** `node --check` + `ACTION_ROLES` 에 빠진 액션이 없는지 + 메뉴 목록의 역할이 `admin_roles` 에 있는 값인지. 걸리면 배포 안 됨.
4. **화면:** 메뉴별로 360px·1280px 캡처. 개발 DB 에 400건(300명) 시험 자료.
5. **옮김 확인표:** 3절의 ⚠️ 항목을 하나씩 재현.
6. **갈아타기 전 대조:** 병행 기간에 옛·새 화면의 상태별 건수·임명 수를 나란히 — 하나라도 어긋나면 갈아타지 않는다.

## 6. 이번에 하지 않는 것
- 부서 단위 권한(찬양부 담당자는 찬양부만) — 역할 표 구조로 나중에 더할 수 있다.
- 사역신청 밖의 메뉴(찬양·말씀·통계 관리) — 같은 틀에 `registry.js` 한 줄씩으로 뒤에 붙인다. 이번 범위 아님.
- 성도용 신청 화면 변경 — 없다.
