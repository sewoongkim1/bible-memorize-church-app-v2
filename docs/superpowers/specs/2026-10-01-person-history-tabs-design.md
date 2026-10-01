# 교회 어드민 — 교인명부 「자세히」 창의 사역·성경필사 탭 · 잇기 표 · 사역신청 번호 보관 설계

- 날짜: 2026-10-01 · 세션: 교인명부 세션(bible-memorize-church-app-v2-99) · 코드: `c:\Projects\church-admin`
- 함께 일하는 세션: **b6**(「사역 이력」 표 — `2026-10-01-church-admin-ministry-history-design.md`) · **e5**(성경필사 화면·서버)
- 앞선 설계: `2026-09-29-church-people-directory-design.md`(교인명부) · `2026-09-29-church-admin-bible-events-design.md`(성경필사)

## 0. 요청과 친구 결정(2026-10-01)

요청: 「교인명부 팝업에 사역신청 현황 및 성경필사 참여 현황이 조회될 수 있도록 · 사역은 과거 기록도 포함 · 년도별로 사역을 넣을 수 있는 방안과 표시하는 부분도」.

| 물음 | 친구 결정 |
|---|---|
| 기록과 교인을 잇는 법 | **교인ID 로 잇는다. 못 찾으면 null**(성경필사·사역신청 모두) |
| 교인ID 를 적는 곳 | **교회 어드민 「잇기 표」**(앱 표·앱 코드는 그대로) |
| 지난 해 사역 기록 | **교회 어드민에 따로** — 표는 **b6 세션**이 만든다(「사역 이력」 · 섬긴 사역=임명만). 이 세션은 읽기·「이분 것」만 |
| 사역신청 휴대폰 번호 | **임명·취소해도 바로 지우지 않는다** — 「결정된 신청 번호 지우기」 **단추** + **결정 뒤 180일 자동** |
| 이력을 보는 사람 | **교인명부 역할(·총괄)이면 사역·성경필사 둘 다** — 메모·사유·전화·앱 계정은 빼고 |
| 창 배치 | **오른쪽 칸에 탭** 「교적 · 🤝 사역 N · ✍️ 성경필사 N」 |
| 손으로 잇기 | **「자세히」 창의 탭에서** 「이분 것」 |
| 자동 잇기 규칙(2부) | 「맞음」(이름·소속 한 분) 또는 (사역만) **번호가 맞는 분 한 분**일 때만. 「같은 이름 한 분뿐」만으로는 잇지 않는다 |

## 1. 범위

- **이번:** 잇기 표(SQL 006) · 번호 180일 예약 작업(SQL 007) · 자동 잇기 순수 모듈 · 서버 액션 넷 + `peoplePerson` 응답 넓히기 · 사역신청·성경필사 목록에서 그때그때 잇기 · 「자세히」 창 탭 · 신청 현황 「번호 지우기」 단추 · 교인 현황 「기록 잇기 맞추기」(총괄) · 개인정보 안내 두 곳 · 시험.
- **안 함:** 「사역 이력」 표·메뉴·올리기·다시 맞추기(b6) · 이력으로 넘기기(b6 §8) · 앱 표(`ministry_orders`·`event_signups`)에 칸 더하기 · 옛 성경암송 관리 화면(`api` 담당자용 사역 액션 — 「얼림」 · 그쪽은 지금처럼 결정 때 바로 지운다, 더 엄격한 쪽이라 둔다).

## 2. 표

### 2.1 잇기 표 — `supabase/sql/006_people_links.sql`

```sql
create table if not exists people_links (
  kind        text   not null check (kind in ('order','signup')),  -- order = ministry_orders · signup = event_signups
  row_id      bigint not null,                                     -- 그 표의 id(FK 없음 — 앱 쪽에서 줄이 지워져도 남는다)
  person_id   int,                                                 -- 교인ID · null = 못 맞춤/이분 아님 · FK 없음(명부가 바뀌어도 줄은 남는다)
  link_how    text   not null default 'auto' check (link_how in ('auto','manual','none')),
  match_basis text   not null default '',                          -- 「맞음」·「번호」·「사람이 이음」
  import_id   bigint,                                              -- auto 일 때 맞춘 명부(church_people_imports.id)
  linked_by   uuid references admin_members(id) on delete set null,
  linked_at   timestamptz,
  updated_at  timestamptz not null default now(),
  primary key (kind, row_id)
);
create index if not exists people_links_person_idx on people_links (person_id) where person_id is not null;
alter table people_links enable row level security;
revoke all on people_links from anon, authenticated;
```

- `link_how` 는 b6 「사역 이력」 표와 **같은 말**: `auto` = 규칙이 정함(다시 맞추기가 바꾼다) · `manual` = 사람이 「이분 것」 · `none` = 사람이 「이분 아님」. **`manual`·`none` 은 자동이 절대 덮지 않는다.**
- 줄이 없으면 「아직 맞춰 보지 않음」. auto 로 맞춰 봤는데 못 찾았으면 `person_id null, link_how 'auto'`(다음 명부에서 다시 본다).
- 운영 적용 뒤 `check-authenticated-exposure.sql` 0행.

### 2.2 「사역 이력」 표(b6 · 읽기만)

b6 설계 §7 약속 그대로: `ministry_history` 에서 `person_id = $1 and deleted_at is null` · 칸 `id, year, committee, team, role_title, position, mok, source` · `order by year desc, committee, team`. **`order_id` 가 있는 줄의 원래 신청(`ministry_orders.id`)은 사역 탭에서 신청 쪽으로 읽지 않는다**(두 번 보이지 않게 · 줄 단위).
표가 아직 없으면(운영 SQL 005 전) 사역 탭은 올해 신청만 보인다 — 서버가 표 없음 오류(42P01)를 「이력 없음」으로 받는다.

## 3. 자동 잇기 — `supabase/functions/church-admin/people-links.ts`(순수 · Node 시험이 같은 파일을 읽는다)

- **사역신청 줄:** `ministryApplicant` 와 같은 맞대는 줄(`applicantFromWho(name, who, phone)` · 이름·소속이 빈 옛 줄은 앱 계정에서 채움 — `orderChurchNoPhone` 과 같은 방식). 고르기: ① 같은 소속(`sameAffiliation`) 딱 한 분 → 그분(근거 「맞음」) ② 같은 소속이 없거나 여럿이고 번호가 있으면 그 가운데(같은 소속이 없으면 같은 이름 전부, 목장 모르는 줄은 같은 교구 먼저 — `personPickFor` 와 같은 차례) **번호가 맞는 분 딱 한 분** → 그분(근거 「번호」) ③ 그 밖 null.
- **성경필사 줄:** `signupSame`(교구 줄 아이 빼기 · 옮겨 적은 줄 맞음) 기준 같은 소속 **딱 한 분** → 그분(근거 「맞음」). 그 밖 null. (명단 교적 표시 「교적 ✓」와 늘 같은 결론.)
- **「이름이 명부에 한 분뿐」은 자동으로 잇지 않는다**(소속이 다르면 명부에 없는 다른 분일 수 있다 — 창의 「아직 안 이어진 기록」으로 사람이 잇는다).
- 결정 함수 `autoLink(cands, applicant, opts) → { person_id, basis }` 하나를 사역·성경필사가 함께 쓴다(성경필사는 isSame 으로 `signupSame` 을 넘긴다).

### 3.1 언제 잇나

1. **처음 한 번 · 명부를 새로 올린 뒤:** 교인 현황 화면에 총괄만 보이는 **「기록 잇기 맞추기」** 단추(`peopleLinkSync`). 사역신청 줄 전부(모든 해)와 성경필사 줄 전부(초안 회차 빼고)를 돌아 `auto` 줄만 고쳐 쓰고 「새로 이음 N · 바뀜 K · 못 맞춤 M」을 보여 준다. 기록 `people.linksync`(수만). 교회 어드민 `CLAUDE.md` 교인명부 절 「새 명단이 오면」 순서 끝에 한 줄.
2. **그때그때:** 신청 현황(`ministryList`) · 종이 명단 넣기(`ministryPaperSave`) · 성경필사 명단(`evRoster`)·올리기·더하기·고치기에서, 이미 읽은 교적 후보(`churchLookup`)로 **잇기 줄이 없거나 `auto` 인데 `import_id` 가 지금 명부보다 옛것인 줄**만 맞춰 `upsert` 한다(사람이 정한 줄은 읽기만). 교적 표시를 계산하는 자리라 묻기가 늘지 않는다(잇기 표 한 번 읽기·한 번 쓰기).
3. 번호로 이은 줄은 나중에 번호를 지워도 그대로 남는다.

## 4. 「자세히」 창 탭

```
┌──────────┬─[교적] [🤝 사역 6] [✍️ 성경필사 4]──────────┐
│ 사진     │ 2027  예배위원회 · 안내팀          임명   │
│ 홍길동   │       전도부 · 행복전도대 토요일    접수   │
│ 안수집사 │ 2026  예배위원회 · 안내팀 · 팀장   임명   │
│ 화평 20  │ 2025  교육위원회 · 중등부 · 교사   임명   │
│ ☎ 전화   │ ───────────────────────────────────── │
│          │ 이름이 같고 아직 안 이어진 기록 2건 ▸  │
└──────────┴────────────────────────────────────────┘
```

- 탭은 오른쪽 칸 위. 처음은 「교적」(지금 그대로). 숫자 = 이 분과 이어진 기록 수(`person_id` 가 이분이고 `link_how` auto·manual).
- 왼쪽 칸은 그대로 — PC 1366×657 무스크롤 유지(창 높이는 왼쪽 단이 정한다 · 탭 안만 스크롤). 폰은 같은 탭 + 창 세로 스크롤.
- **🤝 사역:** 해 내림차순. 한 줄 「해 · 위원회 · 팀 · 직책」 + 상태. 앱 신청(모든 해 · 이력으로 넘긴 줄 빼고)은 신청·접수·임명·취소 칩(신청 현황과 같은 색), 사역 이력은 「임명」. 하위 선택(`option`)은 팀 뒤 「(선택)」. **메모·취소 사유·전화·앱 계정은 싣지 않는다.**
- **✍️ 성경필사:** 회차 시작일 내림차순. 「2026 사순절 마가복음 · 그때 소속 · 직분」(be-year `statLabel` 과 같은 표기 — 합쳐지지 않았으면 같은 규칙을 이 모듈에). 초안(draft) 회차는 넣지 않는다. 가을 말씀 동행의 자격 판정은 보이지 않는다(참여 줄만).
- **아직 안 이어진 기록:** 탭 아래 「이름이 같고 아직 안 이어진 기록 N건 ▸」 — **탭을 누를 때** 불러온다(`peopleHistory` · 이름으로 넓게 찾아 느리다). 줄마다 「이분 것」. `link_how='none'` 줄은 여기 나오지 않는다(사역 이력 메뉴·다른 분 창에서는 이을 수 있다).
- **이어진 줄:** 작은 「풀기」 → 그 자리에서 「정말 풀까요? 예 · 아니요」(창 위에 창을 띄우지 않는다). 풀면 `auto` 로 되돌리고 그 줄만 다시 맞춘다(같은 분이 다시 붙으면 「이분 아님」을 권한다 — 「이분 아님」 단추를 함께 둔다).
- 가족 칩으로 넘어가면 보던 탭을 그대로 연다.
- ⚠️ `ui.js dialog` 는 본문 안 `button[data-v]` 를 닫기로 받는다 — 탭·잇기 단추에 `data-v` 를 쓰지 않는다. `data-fam`·`data-fam-all` 도 쓰지 않는다(person-popup·search 가 읽는다).
- ⚠️ 창 폭 좁히기(`.pd-few`·`.pd-empty`)가 이력을 세지 않는다 — 이력이 있으면 좁히지 않는다.

## 5. 서버 액션(`authz.ts` ACTION_ROLES + `index.ts` case + `tests/server.dev.test.mjs` PROBE 셋 모두)

| 액션 | 역할 | 하는 일 · 기록 |
|---|---|---|
| `peoplePerson`(넓힘) | directory | 응답에 `history: { counts:{ministry, bible}, ministry:[…], bible:[…] }`(명시적 칸 지도) · 기록은 지금처럼 `people.view` 한 줄 |
| `peopleHistory` | directory | `{id}` → 이름이 같고 안 이어진 사역 신청·사역 이력·성경필사 줄(칸 지도 · 소속·직분·해/회차만). 기록 없음(창을 연 `people.view` 가 이미 있다) |
| `peopleLink` | directory | `{kind:'order'|'signup'|'history', row, person, how:'manual'|'none'|'auto'}` · order/signup 은 잇기 표, history 는 b6 `historyLinkPatch`/`historyUnlinkPatch` 로 그 표 · 기록 order/signup `people.link {kind,row,how}` · history 는 b6 약속대로 `history.link {id, by:"directory"}`(이름·교인ID 는 싣지 않는다) |
| `peopleLinkSync` | super | §3.1-1 · `people.linksync` 수만 |
| `ministryPhoneClear` | ministry | 그 해 결정된(임명확정·미채택·취소) 줄의 번호를 null · `ministry.phoneclear {count}` |

- `peopleLink` 는 대상 줄의 이름이 이 교인 이름(`nameKey`)과 같은지 서버가 다시 본다(다른 사람 줄을 잇지 못하게). `manual` 은 그 person_id 가 지금 명부에 있어야 한다.
- 이력 응답에 `user_id`·`ident_key`·`memo`·`phone`·`answers`·`note` 를 싣지 않는다(시험이 키 집합을 대조).

## 6. 사역신청 번호 보관

- 교회 어드민 `ministry.ts statusPatch` 와 `ministryPaper` 넣기에서 결정 때 `phone=null` 을 뺀다(`decided_at` 은 그대로). `ministrySetStatus` 의 `phoneCleared` 는 늘 false 가 되고, 화면 `clearPhone` 은 번호 지우기 단추 뒤에 쓴다.
- **단추:** 신청 현황 위 「결정된 신청 번호 지우기(N건)」(N = 그 해 결정·번호 있음) → 확인 창 → `ministryPhoneClear` → 목록 다시 불러오기(교적 표시는 번호 없이 다시 셈).
- **자동:** `supabase/sql/007_ministry_phone_expire.sql` — `ministry_phone_expire()`(security definer · `update ministry_orders set phone=null, updated_at=now() where phone is not null and decided_at < now() - interval '180 days'` · 지운 수를 돌려줌) + `cron.schedule('ministry-phone-expire', '17 18 * * *', ...)`(매일 03:17 KST). `revoke execute … from public, anon, authenticated`.
- 교적 표시: 번호가 지워져도 잇기 표의 교인ID 는 남는다.

## 7. 개인정보 안내(배포와 같은 날)

- **성경암송 `privacy/index.html`**(공개 · 스토어 심사 페이지): 사역 신청 휴대폰 번호 「임명이 정해지면 바로 지웁니다」 → 「임명·취소가 정해진 뒤 담당자가 지우며, 늦어도 180일이 지나면 저절로 지웁니다」. 앱 안 개인정보 화면 문구도 같이 확인(성경암송 `CLAUDE.md` 「개인정보」 — 두 곳을 함께).
- **교회 어드민 `privacy.html`**: 6번 「보는 사람」에 「교인명부 역할은 자세히 창에서 그분의 사역(올해 신청·지난 해 임명)과 성경필사 참여도 본다(메모·사유·전화·앱 계정 빼고)」 · 「기록과 교인을 잇는 교인ID 와 누가 이었는지가 남는다」. 7번 「보는 사람」에 「교인명부 역할(자세히 창에서 그분 참여만)」. 사역신청 번호 보관 문구(180일).

## 8. 다른 세션과의 약속

- **b6:** §2.2 읽기 · `peopleLink` kind `history` 는 b6 `history-match.ts` 의 `historyLinkPatch`/`historyUnlinkPatch` 를 쓴다 · **이력으로 넘길 때(b6 §8) 이 잇기 표(`people_links` kind `order`)의 `person_id`·`link_how` 를 그대로 옮긴다** · SQL 번호는 b6 005, 이쪽 006·007 · 「표가 열렸다」 알림을 받으면 사역 탭이 지난 해를 붙인다(그 전엔 올해 신청만).
- **e5:** 성경필사 서버의 명단 읽기·올리기·더하기·고치기에 「그때그때 잇기」 한 줄(`linkSignups(rows, idx)`)이 들어간다 · 「…」 옮겨 적기는 규칙상 「맞음」이 되어 저절로 이어진다(따로 사람 잇기 없음).

## 9. 시험

- **순수** `tests/people-links.test.mjs`: `autoLink`(맞음·번호·같은 이름 한 분은 안 잇기·목장 모르는 줄·아이 빼기·옮겨 적은 줄) · 사람이 정한 줄을 안 덮음 · 옛 명부 auto 다시 맞춤 · 이력으로 넘긴 신청 빼기(order_id) · 탭 HTML(줄바꿈 글자 없음·esc·`data-v`/`data-fam` 없음) · 상태 칩.
- **개발 서버** `tests/server.dev.test.mjs`: PROBE 넷 · 역할(ministry 만은 `peopleHistory`·`peopleLink` forbidden · directory 는 이력 보임) · 응답 키 집합(메모·전화·앱 계정 없음) · 잇기·풀기·이분 아님 기록 · 번호 지우기 · 동명이인 가짜 명부 시드(`fake_people.py` 에 동명이인 몇 쌍 · 가짜 신청·명단 줄).
- **SQL** 007 은 개발에서 `select ministry_phone_expire()` 로 한 번 돌려 본다(180일 지난 가짜 줄).
- **화면:** PC 1366×657 탭 넣고 무스크롤 · 폰 390·320 · 탭 전환·가족 넘어가기·풀기 확인(가짜 데이터 · Playwright).

## 10. 여는 순서

1. 교회 어드민 가지(worktree `person-history`)에서 만든다.
2. 개발: SQL 006·007 → 함수 → localhost.
3. **친구 허락 뒤** 운영 SQL 006·007 → 노출 점검 0행 → 운영 함수 → main 푸시(화면) → 같은 날 성경암송 `privacy/` 문구 + bump·푸시.
4. 운영에서 총괄이 「기록 잇기 맞추기」 한 번 → 수를 친구께 보고.
5. b6 「표가 열렸다」 뒤 사역 탭에 지난 해가 붙는지 확인.

## 11. 함정

- 번호를 오래 두는 만큼 **약속을 문서와 코드 두 곳에서 지킨다** — 180일 작업이 실제로 도는지(`cron.job_run_details`) 배포 다음 날 본다.
- 잇기 표·사역 이력 표 모두 FK 가 없다 — 명부에서 빠진 분의 person_id 는 「끊김」으로 남는다(창에는 그분이 없으니 보이지 않는다 · `peopleLinkSync` 가 auto 를 다시 맞춘다).
- 성경필사 줄은 앱 계정을 지우면 cascade 로 사라진다 — 잇기 줄만 남아도 해가 없다(읽을 때 원래 줄이 없으면 건너뛴다).
- 「자세히」 창은 세 입구(교인 찾기·성경필사·사역신청 이름 누르기)가 함께 쓴다 — 탭은 세 곳 모두에 보인다(모두 교인명부 역할·총괄일 때만 열린다).
