# 관리자 문에 「총괄 관리자와 같은 사람」 확인 더하기 (설계 · 2026-10-08)

상태: **설계 · 부분.** 코드는 아직 안 바꿨다. 사람이 아닌 호출자(크론·모니터·MCP·설교/찬양 파이프라인) 목록을 **아직 다 못 모았다**(워크플로가 주간 한도에 걸림 · 아래 §6). 그걸 끝내기 전에는 서버를 바꾸지 않는다.

## 1. 정한 것 (친구)
성경암송 관리자 액션은 지금 암호 하나(ADMIN_SECRET)만 본다 → **암호가 맞고 + 그 브라우저에서 앱에 로그인된 사람(b.staff)이 교회 어드민의 「총괄 관리자」와 같은 사람**일 때만 통과하게 바꾼다. 담당자 화면이 이미 쓰는 staffRoleError 와 같은 뼈대(index.ts:193-225). 관리 기능을 교회 어드민으로 다 옮기기 전까지의 **임시 자물쇠**다(backlog 4-5).

## 2. 서버 — 「총괄 관리자」를 교회 어드민 표에서 읽는다
같은 Supabase 프로젝트라 service_role 로 `admin_members`·`admin_role_grants` 를 **읽기만** 한다(교회 어드민 함수를 부르지 않아도 된다). 뼈대는 staffUserId(index.ts:210)와 같다 — b.staff 를 성경암송 users 의 사람으로 풀고, 그 사람이 활성 총괄인지 본다.

⚠️ **반드시 지킬 것(교회 어드민 쪽 분석이 짚은 함정 — 하나라도 놓치면 사람이 통째로 잠기거나 정지된 총괄이 통과한다):**
- **`status='active'` 를 함께 본다.** 정지(disabled)해도 admin_role_grants 줄은 남는다(교회 어드민 index.ts:326 은 status 만 바꾼다). 역할 줄만 읽으면 정지된 총괄이 통과한다.
- **캐시하지 말 것 · 읽기만 할 것.** 요청마다 읽어야 교회 어드민에서 역할을 빼거나 정지한 것이 다음 요청부터 닫힌다. admin_* 표에 쓰지 않는다(member_merge 가 모르는 user_id 를 보면 멈춘다 — admin_members 에 user_id 칸이 없어 안전하지만 아예 안 건드린다).
- **키는 성경암송의 norm·identityKey 로 만든다**(NFC 를 안 한다). 교회 어드민 authz.ts 의 NFC 판을 그대로 옮기면 자모분리로 가입한 분과 영영 안 맞는다.
- **목장 표기를 양방향으로.** 지금 ministryStaffCandidates(index.ts:231)는 「20목장→20」 한 방향뿐이다. 총괄 줄이 「20」이고 users 줄이 「20목장」이면 못 찾는다. 교회 어드민 identityCandidates 는 양방향 — 그 규칙을 쓴다. **별칭(user_identity_aliases)까지** 풀어 비교한다(이름·소속을 바꾼 총괄).
- **admin_role_grants → admin_members FK 가 둘**(member_id·granted_by). 붙여 읽기(embed)는 모호하다 → 교회 어드민처럼 두 번 나눠 묻는다.
- SQL 함수·뷰로 묶으면 security_invoker + anon·authenticated 둘 다 revoke + service_role 만 execute.
- **「마지막 총괄」 잠김 막기:** 지금 활성 총괄은 한 분(운영·개발 모두 「교구·화평·20·김세웅」). 그분의 여섯 칸이 성경암송 users(또는 별칭)의 한 사람으로 **실제로 풀리는지** 켜기 전에 확인한다. 안 풀리면 아무도 못 들어온다.

**예외(암호만으로 지나가는 좁은 목록)** — §6 이 끝나야 확정. 지금까지 아는 것: 크론 sendPush×4·weeklyReport·weeklyVersePush · 모니터 monitor·weeklyReport·sendPush(diag) · MCP findMember·memberParticipation. ⚠️ 교회 어드민이 성경암송 api 를 부르는 것(eventRoster·eventExcuse·미신청 등)이 있는지 **미확인**(§6 의 other-repos·scripts 가 못 돎).

## 3. 화면 — 고칠 자리 여섯 (pages 분석 완료)
관리자 암호를 보내는 화면은 **공용 도우미 한 곳에 한 줄**씩이면 된다: 「payload.pw 가 있고 staff 가 비었으면 앱 로그인 정보(localStorage `memorize-user` 의 여섯 칸)를 staff 로 채운다」. 담당자 모드는 이미 staff 를 싣고 있어 안 건드려진다.

| # | 자리 | 고침 | 신원 |
|---|---|---|---|
| 1 | `admin-stats.html:972-981` callApi | 첫머리 한 줄(minStaffOf(minAppUser())) | 있음 — minAppUser·minStaffOf(1136-1144) |
| 2 | `admin.html:104` verify(도우미 없음) | 본문에 staff + 신원 함수 한 벌 | 없음 → `memorize-user` 읽는 함수 옮겨 적기 |
| 3 | `admin-event.html:177-184` callApi | 첫머리 한 줄 + 신원 함수 | 없음 → 같은 함수 |
| 4 | `js/admin-members.js:29` call | pw 옆에 staff + 신원 함수 · `admin-members.html:65` 태그 손으로 올림(bump 가 안 올림) | 없음 → 같은 함수 |
| 5 | `admin-sermon-chat.html:112-114` call | auth 에 staff · 신원 함수(이 화면은 config.js 도 안 부름) | member 뿐(여섯 칸 아님) |
| 6 | `app.js` minPw(11570) 호출 넷 → `js/api.js` supaCall(5-19) | supaCall 에서 pw 있고 staff 없으면 loadUser 여섯 칸을 staff 로 | 있음 — loadUser(1241) |

- **praise-api.js** 는 이미 staff 를 싣는다(14줄) — api 만 바꾸면 찬양 화면은 고칠 것 없음. 찬양 **함수(praise)**에도 같은 규칙을 걸려면 다른 저장소 일(§6 other-repos).
- 안 고치면 깨지는 꼴: 관리자 모드 pw 호출이 모두 unauthorized → 화면이 `admin-pw` 를 지우고 로그인으로 돌림 → 다시 넣어도 되풀이. boardList 는 조용히 틀어진다(숨긴 글 빠진 목록). → **서버와 화면을 같은 배포에 올린다.**
- 안내 문구: 앱에 로그인 안 한 브라우저에는 「이 기기에서 앱에 먼저 로그인해 주세요」(담당자용 안내와 같은 갈래), 「암호가 맞지 않거나 지금 로그인된 분이 총괄 관리자가 아닙니다」.
- 시험: `tests/member-profile.test.cjs`·`member-merge.test.cjs` 가 admin-members 를 JSDOM 에 올려 빈 localStorage 로 로그인한다 → staff 를 「있으면 싣는」 식이면 그대로 통과(막는 식이면 `memorize-user` 를 심어야 함).

## 4. 교회 어드민 쪽 — 서버는 고칠 것 없음, 문서만
친구 방향대로 교회 어드민 **서버 코드는 안 고친다**(성경암송이 두 표를 읽기만). 역할 목록은 표 `admin_roles` 한 곳 — 「성경암송 관리」 역할을 따로 둘지(§11 결정)만 정하면 줄 하나로 추가된다. 낡는 문장을 함께 고친다: `001_admin_tables.sql:3` · CLAUDE.md:35·98-99 · privacy.html:41(총괄 이름·소속을 성경암송 문에도 쓰게 되면 한 문장).

## 5. 도구
`tools/security-check.py` GUARDS(79줄)에 새 문 함수 이름을 더한다(안 그러면 그 액션을 공개·user_id 로 분류). ⚠️ 2026-10-08 에 분류를 「거절(early-return)에 쓴 것만 관리자 문」으로 고쳤으니, 새 문도 그 꼴(`const e = …; if (e) return`)로 써야 「관리자·담당자」로 잡힌다.

## 6. 아직 못 한 것 (주간 한도 · 7pm KST 이후)
워크플로 `admin-gate-callers` 에서 **세 갈래가 못 돌았다**:
- **find:scripts** — 크론 SQL·모니터·MCP·tests·tools 가 pw 로 부르는 액션을 하나하나(인자·「크론이 부르는 모양으로 좁히는 규칙」까지).
- **find:semantics** — adminError 100곳의 모양(갈래·복합조건·본문 재조립), 기계 액션의 좁히기 규칙, 글자로 찾는 시험.
- **find:other-repos** — gocheok-sermons·praise-songs 의 파이프라인과 Claude 스킬·메모가 성경암송 api 를 pw 로 부르는가(설교 반영·찬양 관리). **이게 「예외 목록」을 확정한다.**
→ 재개: `Workflow({scriptPath: '…\\admin-gate-callers-wf_98bf6917-563.js', resumeFromRunId: 'wf_98bf6917-563'})` (끝난 셋은 캐시로 즉시 돌아온다).

## 7. 큰 한계 (바꾼 뒤에도)
이 자물쇠는 **본인 확인이 아니다.** b.staff 도 교회 어드민의 여섯 칸도 본인이 적은 이름·소속이다. 암호를 알고 총괄이 누구인지 아는 사람은 지나간다. 진짜 본인 확인은 관리 기능을 교회 어드민(카카오 로그인 + 역할)으로 다 옮겨야 된다(backlog 4-5) — 또는 「교회 어드민에 카카오로 로그인한 총괄만 성경암송 관리 화면에 들어가는 짧게 사는 서명 표」(토큰 갈래 · 내부 통로에서 발급하면 안 됨 — 열쇠가 서비스 키라서).
