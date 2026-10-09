# 성경암송 관리(안전 묶음) — 교회 어드민 이전 설계 (2026-10-09)

관리 기능 이전(백로그 4-5)에서, **크론·외부 연동 없이 사람만 쓰는 SUPER 액션 묶음**을 하루에 교회 어드민으로 옮긴다. 알림 발송·주간 리포트·monitor(크론·메일 공용 타깃)·설교·찬양(워크플로·Gemini·제3레포)은 **이번에서 제외** — 각각 고유 위험이 있어 별도 세션에서 신중히.

## 왜 이 묶음만 오늘인가 (조사 결론 · 2026-10-09)

- `sendPush`·`weeklyReport`·`monitor`·`weeklyVersePush`·`eveningPush` 는 **사람 버튼이자 크론 5+개·GitHub Action 의 공용 타깃**이고 `ADMIN_PW_ONLY`(암호만)다. 크론을 먼저 내부 키로 재배선하지 않으면 걷을 수 없다 → 오늘 건드리면 **아침 알림·금요 리포트가 깨진다.**
- 설교·찬양은 담당자가 **매주 쓰는 GitHub 워크플로**·Gemini(비용)·제3레포(praise)라 공백 없는 컷오버가 필요 → 통째로 별도.
- **반면** 게시판 관리·통계·설정·필사 명단·말씀 질문 기록은 **크론·외부 없는 SUPER 액션**이라 오늘 안전하게 옮길 수 있다.

## 범위 (이번에 옮기는 것)

성경암송 `admin-stats.html`(+ `admin-sermon-chat.html`)의 아래 카드. 전부 성경암송 `api` 가 백엔드.

| church-admin 메뉴(새) | 성경암송 api 액션 | 비고 |
|---|---|---|
| 📊 **통계** | `stats` · `participants` · `verseStats` · `blessingUsage` · `ranking`(읽기) | RPC(v2_stats 등) 재사용 · participants 의 성도 검색은 「성도 계정」(이미 이전)으로 링크 |
| 🚩 **게시판 관리** | `boardList` · `boardModerate` · `boardReply` · `boardPost` · `boardReports` · `boardReportResolve` · `sermonAnswerReports` · `sermonAnswerReportResolve` | 숨기기·🚩신고·AI답 알림 · 이미지 스토리지·`sermon_ai_cache` uncache 주의 |
| ⚙️ **앱 설정·문구** | `getConfig`/`saveConfig`(introSlides·dailyMessage·heartMessages·milestoneMessages·event·passagesPublic) · `eventEntrants` · `getPassages`/`savePassage`/`deletePassage` | 「내 안에 거하는 말씀」 포함 |
| ✍️ **필사 명단** | `pilsaList` · `pilsaSetStatus` | |
| 💬 **말씀 질문 기록** | `sermonChatLog` · `embedSermons` · `clearChatCache` · `clearSummaryCache` | 색인 다시 만들기(embedSermons)는 사람 버튼 |

**제외(별도):** 알림 발송(sendPush·testPush·pushStats·pushSubscribers·pushHistory·pushPreview) · 주간 리포트(weeklyReport) · monitor · 설교·찬양(sermon*·verseImg*·staff*) · 찬양 아카이브(praise 함수) · 사역신청·이벤트 명단(이미 이전).

## 방식 — 내부 키 프록시

**백엔드·RPC·외부를 하나도 건드리지 않는다.** church-admin 이 성경암송 api 의 위 액션을 **내부 키(`x-internal-key` = `SUPABASE_SERVICE_ROLE_KEY`)로 호출**하고, **church-admin 의 역할(`canCall`)이 진짜 게이트**다.

- 성경암송 api: 위조 불가 심볼 **`INTERNAL_OK`** 를 둔다. dispatcher 진입에서 `sameSecret(x-internal-key, SERVICE_ROLE_KEY)` 이고 액션이 **화이트리스트 `INTERNAL_ADMIN_OK`** 에 있으면 `body[INTERNAL_OK]=true`. `adminError` 는 **맨 앞에서** `b[INTERNAL_OK]===true` 면 `null`(통과) — pw 검사보다 먼저.
  - 화이트리스트 = 이 묶음의 액션만(위 표). `sendPush`·`weeklyReport` 등은 **넣지 않는다**(내부 키로도 안 열림).
  - ⚠️ 내부 키 = service_role 는 이미 DB 전권이라 추가 노출은 없다. 화이트리스트는 명확성·방어심층.
  - `INTERNAL_OK` 는 Symbol 이라 JSON 으로 위조 불가(`SUPER_OK` 와 같은 방식).
- church-admin: 기존 `appApiInternal(body,label)`(이미 x-internal-key 를 붙인다)로 각 액션을 부르는 **얇은 프록시 핸들러** + 화면 모듈. 역할은 `canCall` 이 건다.

## 역할

- 새 역할 **`memorizeadmin`(라벨 "성경암송 관리")** 하나. 위 다섯 메뉴 액션 전부 이 역할(+super).
- 성격이 다르지만(관리/조회/설정) 한 사람이 성경암송 운영을 보는 일이라 역할 하나로 묶는다(친구 결정 2026-10-09). 나중에 필요하면 쪼갠다.

## 걷기는 이번에 안 한다 (중요)

- 성경암송 `admin-stats.html`·`admin-sermon-chat.html` 과 api 액션을 **그대로 둔다** — 거기엔 아직 안 옮긴 알림·리포트·설교가 함께 있어 제거할 수 없다. 이번은 church-admin 에 **추가(복제)만** 한다. 둘 다 작동한다(같은 DB·api · 충돌 없음).
- **최종 걷기**(admin-stats 제거·액션 얼림·허브 타일·암호 폐지)는 **모든 묶음(알림·리포트·설교·찬양)까지 옮긴 뒤 마지막 묶음 ⑦** 에서 한꺼번에. 그래야 성경암송 쪽이 반쯤 열린 위험 상태가 안 된다.

## 파일 지도

**성경암송 (`api`):**
- `supabase/functions/api/index.ts` — `INTERNAL_OK` 심볼 · `INTERNAL_ADMIN_OK` 화이트리스트(이 묶음 액션) · `adminError` 맨 앞 한 줄 · dispatcher 진입 스탬프 한 블록. (액션 함수 자체는 안 바꾼다.)

**교회 어드민 (`C:\Projects\church-admin`):**
- `supabase/functions/church-admin/authz.ts` — 역할 `memorizeadmin` + `ACTION_ROLES` 에 프록시 액션들.
- `supabase/functions/church-admin/index.ts` — 프록시 핸들러(각 액션을 `appApiInternal` 로 위임) + switch 라우팅. (통계·게시판·설정·필사·말씀기록 묶음별로 파일을 나눠도 됨 — memorize-admin.ts 등.)
- `supabase/sql/018_memorizeadmin_role.sql` — 역할 한 줄(`admin_roles` insert).
- `js/menus/registry.js` — 메뉴 다섯(또는 그룹 「성경암송」).
- `js/menus/memorize/*.js` — 화면 모듈 다섯(stats·board·config·pilsa·chatlog).
- `tests/authz.test.mjs`·`tests/registry.test.mjs` — 새 역할·액션·메뉴.

## 구현 차례 (안전·낮은 위험부터)

1. 성경암송 api: `INTERNAL_OK` + 화이트리스트 + adminError 한 줄 (개발→확인). ⚠️ 이게 핵심 토대.
2. church-admin: 역할 SQL + authz.
3. **🚩 게시판 관리**(가장 낮은 위험 · 패턴 확립) → 개발 배포·확인.
4. **✍️ 필사 명단** · **💬 말씀 질문 기록**(작음).
5. **📊 통계**(읽기 · RPC 재사용).
6. **⚙️ 앱 설정·문구**(getConfig/saveConfig · 여러 키).
7. 운영 반영(각 단계 또는 끝에 한 번 · church-admin 운영 배포 + 프런트 push · 성경암송 api 는 토대 1 만 운영 배포).

## 위험·주의

- ⚠️ **성경암송 api 토대(1) 운영 배포는 신중.** `adminError` 맨 앞에 `INTERNAL_OK` 분기를 더한다 — 기존 암호·SUPER 경로는 그대로여야 한다(회귀: 관리자 암호·총괄·크론·MCP 가 지금처럼 동작하는지 배포 직후 확인). 되돌리기=api 옛 판 재배포.
- `boardModerate` 의 이미지 삭제(스토리지)·`sermonAnswerReportResolve` 의 `sermon_ai_cache` uncache 가 함께 돈다 — 프록시라 그대로 동작.
- `participants`/통계 세부의 성도 검색은 `adminFindMembers`(걷음) → church-admin 「성도 계정」으로 링크하거나 생략.
- `ranking` 은 가드가 없고 앱도 쓴다(me 없는 관리자 경로) — 통계 화면에선 me 없이 from/to 로 부른다(오늘 활동 게이트 안 걸림).
- `getConfig` 는 관리 설정 키(ADMIN_CONFIG_KEYS: loginLimit·lifePin)는 안 건드린다(이 묶음 밖).
- church-admin 배포는 작업 트리를 올린다 — 배포 전 `git status`.
- **NFC** 등 각 화면 고유 함정은 포팅 시 해당 화면 로직을 따른다.

## 보안

- `INTERNAL_OK` 는 `sameSecret`(상수 시간 비교) 통과 + 화이트리스트일 때만. Symbol 이라 위조 불가.
- church-admin 의 `canCall(memorizeadmin)` 이 사람 게이트. 카카오 로그인 + 역할 부여 + 승인.
- 성경암송 api 의 암호·SUPER·ADMIN_PW_ONLY 경로는 **그대로** — 내부 키 분기는 **추가**일 뿐.
