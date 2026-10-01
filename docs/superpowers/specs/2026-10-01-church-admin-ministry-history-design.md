# 교회 어드민 — 사역 이력(지난 해 사역 임명 · 교인ID) 설계

- 날짜: 2026-10-01 · 세션 b6(이 문서) · 저장소: 교회 어드민 `c:\Projects\church-admin`(코드) · 이 문서는 형제 저장소 관례대로 여기에
- 함께 일하는 세션: **교인명부 세션(bible-memorize-church-app-v2-99)** — 교인명부 「자세히」 창의 사역·성경필사 탭과 앱 표 쪽 「잇기 표」를 맡는다. 이 표는 **읽기만** 하고, 「이분 것」 잇기만 이 문서 §7 의 약속대로 쓴다.
- ⚠️ 이 문서에는 이름·교인ID 를 적지 않는다(공개 저장소). 수와 규칙만.

## 0. 요청과 친구 결정

친구 요청(2026-10-01): 사역신청 명단 엑셀(2022~2026, 해마다 「N차」 최종본)을 한 시트로 합치고 교적ID 를 붙여 달라 → 이어서
① 과거 해 데이터는 더 들어온다(늘 더할 수 있어야) ② 못 맞춘 데이터는 계속 고치고·더하고·뺀다 ③ 교적정보(교인명부 자세히 창)에서 볼 수 있게
다른 세션이 작업 중이니, 이 데이터를 적재할 수 있게 해 달라.

| 물음 | 친구 결정 |
|---|---|
| 어디에 넣나 | **새 표 하나(사역 이력)** — 지금 사역신청 표(`ministry_orders`)·앱은 손대지 않는다 |
| 2027년부터는 | 앱 사역신청으로 받고, 임명이 끝난 뒤 그해 임명확정 줄을 **「이력으로 넘기기」**로 이 표에 옮긴다 — **설계만 지금, 만들기는 2027 임명 전** |
| 못 맞춘 줄을 고치는 곳 | **교회 어드민 화면** — 새 메뉴 「사역 이력」(올리기·거르기·고치기·더하기·빼기) |
| 누가 쓰나 | **사역신청 담당자(역할 `ministry`)** + 총괄. 교인ID 숫자는 가린다(교인명부·총괄에게만 보인다) |
| 두 세션 나누기 | **표는 이 세션, 창은 교인명부 세션** |
| 같은 해를 다시 올리면 | **더하기만** — 이미 있는 같은 줄은 건너뛴다. 빼는 것은 화면에서 |
| 교인명부 세션 요청(수용) | 직책 칸 · person_id 색인 · 줄 id · 넘긴 줄은 줄 단위 `order_id`(unique) · 넘길 때 그쪽 잇기 표의 교인ID 를 그대로 · 「이분 것」은 그쪽 액션(역할 `directory`) |

앞서 같은 날 만든 엑셀(`church-admin/Data/2022-2026_사역임명_통합.xlsx` · 저장소 밖에 둘 것 — §9)은 이 표의 첫 적재 원본이자 대조 시험의 기대값이다.

## 1. 범위

- **이번:** 표 둘(SQL 005) · 맞춤 규칙 순수 모듈 · 서버 액션 · 「사역 이력」 메뉴 · 공용 「잇기 고치기」 함수(교인명부 세션이 부른다) · 시험 · 개인정보 안내 한 절 · 운영 첫 적재(친구가 화면에서).
- **나중(설계만 §8):** 이력으로 넘기기(2027 임명 전).
- **안 함:** 교인명부 자세히 창 탭(교인명부 세션) · 앱 표에 칸 더하기 · 직책 자동 채우기(엑셀에 없다).

## 2. 표 — `supabase/sql/005_ministry_history.sql`

```sql
create table if not exists ministry_history_imports (
  id           bigserial primary key,
  imported_at  timestamptz not null default now(),
  member_id    uuid references admin_members(id) on delete set null,
  file_name    text not null default '',
  years        int[] not null default '{}',
  total        int not null default 0,      -- 파일에서 읽은 줄
  added        int not null default 0,
  skipped_same int not null default 0,      -- 이미 있는 같은 줄
  skipped_deleted int not null default 0,   -- 빼 둔 줄과 같음
  skipped_dup  int not null default 0       -- 파일 안 겹침
);

create table if not exists ministry_history (
  id           bigserial primary key,
  year         int  not null check (year between 1950 and 2100),
  committee    text not null default '',    -- 부서(위원회) — 엑셀 「부서」
  team         text not null default '',    -- 팀명
  role_title   text not null default '',    -- 직책(팀장·부팀장 …) — 엑셀에 없으면 빈칸
  name         text not null,               -- 그때의 이름(원문 · NFC)
  position     text not null default '',    -- 그때의 직분(원문)
  mok          text not null default '',    -- 그때의 목장(원문 「기쁨-19」·「청년05또래」)
  renewal      text not null default '',    -- 신규 / 유지
  src_note     text not null default '',    -- 원본 메모(2022 H열 등)
  person_id    int,                         -- 교인ID(church_people.person_id) · null = 못 맞춤/이분 아님 · FK 없음(명부가 바뀌어도 줄은 남는다)
  link_how     text not null default 'auto' check (link_how in ('auto','manual','none')),
  match_basis  text not null default '',    -- 맞춤 근거(person_id 가 있을 때)
  match_reason text not null default '',    -- 못 맞춘 사유 = 화면·내려받기의 「비고」(person_id 가 없을 때)
  linked_by    uuid references admin_members(id) on delete set null,
  linked_at    timestamptz,
  source       text not null default 'excel' check (source in ('excel','app')),
  source_file  text not null default '',
  import_id    bigint references ministry_history_imports(id) on delete set null,
  order_id     bigint,                      -- source='app' 일 때 원래 ministry_orders.id(§8)
  src_key      text not null,               -- 같은 줄 열쇠(§3.2) — 올린 그대로, 고쳐도 안 바뀐다
  deleted_at   timestamptz,                 -- 빼 둔 때(지우지 않는다)
  deleted_by   uuid references admin_members(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check ((source = 'app') = (order_id is not null))
);
create unique index if not exists ministry_history_src_key_uq on ministry_history (src_key);
create unique index if not exists ministry_history_order_uq   on ministry_history (order_id) where order_id is not null;
create index if not exists ministry_history_person_idx on ministry_history (person_id) where deleted_at is null;
create index if not exists ministry_history_year_idx   on ministry_history (year);

alter table ministry_history_imports enable row level security;
alter table ministry_history         enable row level security;
revoke all on ministry_history, ministry_history_imports from anon, authenticated;
revoke all on sequence ministry_history_id_seq, ministry_history_imports_id_seq from anon, authenticated;
```

- 역할은 새로 만들지 않는다(`ministry` · `directory` · `super` 그대로).
- **link_how:** `auto` = 규칙이 정함(다시 맞추기가 바꾼다) · `manual` = 사람이 「이분」으로 이음 · `none` = 사람이 「이분 아님」으로 비움. **`manual`·`none` 은 자동 맞춤이 절대 덮지 않는다** — 사역 이력 메뉴에서든 자세히 창 「이분 것」에서든.
- **src_key 를 고친 값으로 바꾸지 않는 까닭:** 화면에서 이름 오타를 고친 뒤 같은 파일을 다시 올려도 옛 줄이 또 들어오지 않게.
- **지우지 않고 deleted_at:** 다시 올려도 뺀 줄이 되살아나지 않게(살펴보기에 「빼 둔 줄과 같음 N」).
- 운영에서 만든 뒤 `check-authenticated-exposure.sql` 0행 확인.

## 3. 들어오는 길

### 3.1 엑셀 올리기(살펴보기 → 넣기 · 성경필사 명단 올리기와 같은 모양)
1. 파일 고르기·끌어다 놓기 → `js/core/xlsx.js` `loadXlsx`(SheetJS) 로 화면이 읽는다.
2. **표 머리 찾기:** 첫 시트에서 「이름」과 「팀명」(또는 「팀」)이 함께 든 첫 줄. 칸은 이름으로 찾는다 — 년도·부서·팀명·이름·직분·목장·신규/유지(「신규 / 유지」)·직책·비고·원본 메모. 원본 해마다 파일(1행 제목·3행 머리·A열 빈칸·H열 메모)과 통합 파일(1행 머리·「년도」 칸) 둘 다 읽힌다. 2022 원본의 머리 없는 H열 메모는 「원본 메모」로.
3. **해:** 「년도」 칸 → 없으면 파일 이름의 네 자리(19xx·20xx) → 없으면 `pickOne` 으로 고른다. 화면이 「2024년 898줄」처럼 보여 준다.
4. 다듬기: NFC · 앞뒤 빈칸 · 이름·직분·목장·부서·팀이 모두 빈 줄은 버린다. 한 번에 최대 3,000줄(통합 파일 4,093줄은 해 묶음으로 나눠 보낸다 — 화면이 해마다 차례로).
5. **살펴보기**(`historyUploadCheck` · 아무것도 안 쓴다): 새 줄 · 이미 있음 · 빼 둔 줄과 같음 · 파일 안 겹침 수 + 새 줄의 맞춤 미리보기(붙음 N / 못 붙임 N · 사유별 수).
6. **넣기**(`historyUploadSave`): 새 줄만 넣고(`link_how='auto'`) → **다시 맞추기(§3.3)를 이어서 돈다** → 결과 수 · `ministry_history_imports` 한 줄 · 기록 `history.upload`(수만 납작하게).

### 3.2 같은 줄
`src_key` = `해|부서|팀|이름|목장|직분` — 칸마다 NFC · 모든 띄어쓰기 없앰(이름은 끝 영문자 대문자). 신규/유지·직책·메모는 열쇠에 넣지 않는다.
2022~2026 통합 4,093줄에서 이 열쇠의 겹침은 0 이다(2026-10-01 셈). 파일 안에서 같은 열쇠가 또 나오면 첫 줄만(「파일 안 겹침」).
화면 「한 줄 더하기」도 그때 값으로 src_key 를 만든다 — 나중에 같은 줄이 든 파일을 올리면 건너뛴다.

### 3.3 다시 맞추기(`historyRematch` · 올리기 뒤에 저절로 · 단추로도)
- 대상: `link_how='auto'` 이고 뺀 적 없는 줄 **전부**(모든 해). 다른 해 줄이 근거가 되므로(§4.4) 해 하나만 돌리지 않는다.
- 후보: 대상 줄 이름들의 `church_people` 만 `name_key in (...)` 으로(100개씩 — `inChunks`). 가족 근거(§4.3)에 쓰는 세대주·주소 칸은 서버 안에서만.
- 바뀐 줄만 고쳐 쓴다(person_id·match_basis·match_reason·updated_at). 기록 `history.rematch` 「붙음 N→M · 바뀜 K」.
- 12월 새 교인명부를 올린 뒤 누르는 단추로도 둔다. `manual` 줄의 교인ID 가 새 명부에 없으면 고치지 않고 화면에 「명부에 없음」으로만 보인다.

### 3.4 화면에서 고치기 — §5
### 3.5 이력으로 넘기기 — §8(나중)

## 4. 맞춤 규칙 — `supabase/functions/church-admin/history-match.ts`(순수 모듈 · Node 시험이 같은 파일을 읽는다)

`people-match.ts` 의 `nameKey`·`mokNumber`·`candMen`·`candKid`·`sameAffiliation`(남성 목장 규칙 포함)과 `events-people.ts` 의 「아이는 kind2 먼저」를 그대로 쓴다.
아래는 2026-10-01 파이썬 시험판(3,964/4,093) → 독립 검증 다섯 갈래(규칙 이식·독립 재구현 대조·상식 점검·약한 근거 뒷받침·못 맞춘 줄 살리기)에서 나온 것을 더한 규칙이다.

### 4.1 명단 줄 읽기
- 목장 → `교구`(gu·목장 번호·남성) / `새가족` / `청년`(「청년」·「청년부」·「청년1부」·「청년NN또래」·「NN또래」 · 직분 「청년」) / `학생`(「학생」 · 직분 학생·어린이·고등부·중등부) / `모름`(빈칸·「-」·「2교구 20목장」 같은 숫자 교구 · 교구만).
- 붙여 쓴 꼴 「기쁨25」·「소망남성」 읽기 · 오타 「가쁨」→기쁨 · 「믿은」→믿음.
- ⚠️ **2025년 이전 명단의 「기쁨-1」은 `모름`(교구도 모름)으로 읽는다.** 맞춘 분이 지금 소망·은혜·섬김에 흩어져 있고(기쁨은 16/75), 2026 명단의 「기쁨-1」은 진짜 기쁨 01목장이다(11/11). 목장을 모를 때 쓰던 자리 표시로 본다 — 친구 확인 대기.
- 직분 → 성별(권사=여 · 장로·안수집사=남 · 남성 목장=남) · 계급(0 없음·성도·청년 / 1 집사·서리집사 / 2 권사·안수집사 / 3 장로 · 은퇴·명예·협동·이명은 계급 유지).

### 4.2 후보와 빼기(다른 분으로 본다)
후보 = 교인명부에서 `nameKey` 가 같은 분 + (명단에 끝 영문자가 없으면) 「이름A·이름B」 꼴 + (그래도 없으면) 괄호를 뗀 이름.
다음은 **모든 단계 전에** 뺀다:
1. **성별** — 줄의 성별과 명부 성별이 다르면(명부가 비면 통과). 검증: 강한 맞춤 1,614/1,614 일치 · 명부의 권사 495 모두 여, 안수집사 176·장로 54 모두 남.
2. **등록일** — 명부 등록일의 해가 명단 해보다 늦으면. 검증: 맞춘 3,072줄 중 0건.
3. **아이** — 어른 줄(직분이 성도·집사 이상이거나 청년 줄)인데 명부가 아이면. 아이 = 출생 연도가 있으면 「그해 19세 미만」, 없으면 kind2 교회학교·학생(kind2 교회학교인 20세 이상 1,117명 — 낡은 값이라 나이를 먼저 본다).
   직분이 **빈** 교구 줄은 명부의 아이도 후보로 둔다 — 단 그해 14세 이상이고 가족 목장 글자가 줄의 목장과 같을 때만(부모와 함께 섬기는 고등부 도우미 · 검증 2줄). 근거 끝에 ` · 학생으로 봄` 을 붙인다.
4. **직분 없는 청년** — 줄 직분이 집사 이상인데 명부가 kind2 청년(또는 아이)이고 명부 직분이 비었으면. 검증: 같은 소속 3,294줄 중 반례 0.
5. **청년 나이** — 청년 줄인데 그해 45세 이상.
6. **또래** — 「NN또래」 줄은 출생 연도 끝 두 자리 = NN(1~2월생은 NN+1 도) 인 분만. 검증: 21/21.
⚠️ 직분 계급이 **낮아졌다**는 것만으로는 빼지 않는다(명부 직분이 비거나 낡은 분이 많다 — 같은 목장 정답 10/488 이 걸린다).

### 4.3 고르는 차례(첫 번째로 한 분이 남는 단계에서 정한다)
| 차례 | 단계 | 근거(match_basis) |
|---|---|---|
| 1 | 같은 소속(교구+목장 · 남성 목장 · 새가족 · 청년끼리 · 학생끼리) 한 분 | `같은 소속` (청년·학생은 `같은 구분(청년)`·`같은 구분(학생)`) |
| 2 | 같은 교구 한 분 | `같은 교구(목장 다름)` / `같은 교구(목장 모름)` · 다른 교구에 같은 이름이 있으면 ` · 다른 교구에 같은 이름` 을 붙인다 |
| 3 | 교인명부에 이름이 한 분 | `이름이 한 분뿐(소속 다름)` / `이름이 한 분뿐(소속 모름)` — 2026-09-29 친구 규칙(이벤트 명단) |
| 4 | 여럿 남으면: 직분 갈래가 같은 분(권사·목사 갈래만 — 집사↔권사는 쓰지 않는다) | `직분으로 가림` |
| 5 | 여럿 남으면: 가족(같은 세대주+주소)이 **같은 해 같은 목장 글자**로 명단에 있는 분 | `가족이 같은 해 같은 목장` (검증 249 맞음 / 1 어긋남) |
각 단계에서 둘 이상이 남으면 4·5 를 그 안에서 먼저 돌려 본다. 그래도 못 가리면 다음 단계로 가지 않고 비운다(사유 §4.6).

### 4.4 다른 해로 잇기(1차 결과가 나온 뒤 · 빈 줄과 약한 줄만)
- **같은 팀 「유지」:** 이웃한 해(±1) 같은 팀(이름 다듬기: 「사역팀-」·「미취학-」·「아동-」·「청소년-」 떼기 · 빈칸·괄호 없앰 · 「주일찬양(2부)」=「주일2부찬양」)에서 같은 이름이 `같은 소속` 으로 한 분에게 붙었고, **뒤쪽 해 줄이 「유지」**, 그 해 그 팀에 같은 이름·같은 갈래(어른/청년) 줄이 하나뿐이면 그분 → `다른 해 같은 팀`. 검증 655 맞음 / 8 어긋남(대부분 한 팀의 진짜 동명이인 — 그래서 셋째 조건).
- **같은 이름·같은 목장 글자·같은 직분 ±1년** → `다른 해 같은 목장`.
- 약한 줄(2·3단계)을 덮는 것은 다른 해 근거가 **다른 분을 가리킬 때만**(검증에서 틀린 9줄이 모두 이 꼴). `같은 소속` 줄은 덮지 않는다.
- 위 둘은 한 번 더 돈다(사슬) — 그 뒤 §4.5·§4.6 검사를 다시.

### 4.5 오타(「교적에 없음」 줄만)
같은 교구+목장(또는 같은 남성 목장)에 **이름이 한 글자만 다르고 글자 수가 같은** 어른 한 분이 있고, 그분이 **다른 해 같은 팀**에 붙어 있으며 그 해 그 팀엔 없으면 → `이름 한 글자 다름(오타로 봄)`. 검증 14줄(셋은 한 분의 2023년 표기 오타).

### 4.6 같은 해 겹침과 못 맞춘 사유
- 같은 해에 소속이 **다른 교구**인 두 줄이 한 분으로 모이면 약한 쪽을 비운다(같으면 둘 다). **같은 교구에서 목장만 다르면 둘 다 그분으로 둔다**(검증: 지금까지 비운 10줄이 모두 같은 교구의 목장 글자 차이 — 해 중간 이동·오타).
- 비고(match_reason) 문구 — 화면·내려받기 그대로:

| 사유 | 문구 |
|---|---|
| 같은 이름 없음 | 교인명부에 같은 이름이 없음 |
| 같은 소속 여럿 | 같은 목장에 같은 이름 N명 — 누군지 못 가림 |
| 같은 교구 여럿 | 같은 교구에 같은 이름 N명(목장은 명부와 다름) — 누군지 못 가림 |
| 소속 다른 여럿 | 교인명부에 같은 이름 N명, 적힌 소속과 같은 분이 없음 — 누군지 못 가림 |
| 빼고 나니 없음(아이·청년뿐) | 교인명부의 같은 이름은 교회학교 학생·직분 없는 청년뿐 — 다른 분으로 봄 |
| 빼고 나니 없음(성별·등록·나이) | 교인명부의 같은 이름은 직분과 성별(또는 등록일·나이)이 맞지 않음 — 다른 분으로 봄 |
| 같은 해 겹침 | 같은 해에 다른 교구의 같은 이름 줄이 있고 명부엔 한 분 — 어느 줄인지 못 가림 |
| 사람이 비움 | 이분 아님(담당자 확인) |

### 4.7 기대값(대조 시험 §10 의 기준)
파이썬 시험판 3,964 붙음 → 틀린 약 12줄 바로잡고 약 80줄 더 붙여 **약 4,030 붙음 / 약 60 못 맞춤**. 남는 줄의 대부분은 명부에 같은 이름이 없는 분(떠난 분·교인 아닌 봉사자)과 가릴 근거가 없는 동명이인이다.
틀렸다고 확인된 꼴: 권사→남자 1(+같은 분 2026 줄 3) · 권사→같은 교구의 젊은 집사(맞는 분은 은혜로 옮긴 권사) 3 · 집사→직분 없는 20대 청년 4 · 안수집사→직분 없는 36세 1 · 고등부 줄→10세 1.

## 5. 「사역 이력」 메뉴 — `js/menus/ministry/history.js`(+ `history-logic.js` 순수)

- 자리: 사역신청 묶음 · 역할 `ministry`(총괄 포함). `registry.js` 한 줄.
- **맨 위:** 📤 엑셀 올리기 · ＋ 한 줄 더하기 · 🔄 다시 맞추기 · ⬇ 내려받기.
- **거르기:** 해(`pickMany`) · 「못 맞춘 줄만」 · 「근거 약한 줄만」(차례 2·3·다른 해·오타) · 이름·팀 찾기. 요약: 해마다 「N줄 · 붙음 N · 못 맞춤 N」.
- **목록:** 해 · 부서 · 팀 · 이름 · 직분 · 목장 · 교적(✓ 이어짐 / △ 확인 — 근거 약함 / — 못 맞춤 + 사유). 폰은 카드. 1,000행 넘으면 서버가 쪽으로 준다.
- **줄 창(`openForm`/`dialog`):** 원문 칸 · 지금 상태·근거·사유 · **후보 목록**(이름·구분·소속·세부·직분·교적 목장 + 「다른 해에 이 팀 N번」) · 단추 「이분」·「이분 아님」·「자동으로 되돌리기」·「고치기」(이름·목장·직분·부서·팀·직책 — 고친 뒤 그 줄 다시 맞춤)·「빼기」.
- **교인ID 가리기:** `ministry` 만 가진 분의 응답에는 person_id 가 없다. 후보는 `person_id` 오름차순 차례 번호로만 보이고, 「이분」은 `{rowId, pick, fp}` 를 보낸다 — `fp` = 그 목록 person_id 들의 해시. 서버는 같은 목록을 다시 만들어 `fp` 가 같을 때만 적는다(다르면 `candidates-changed` → 화면이 다시 연다). `directory`·`super` 에게는 교인ID 와 「자세히」(교인명부 `openPerson`)가 보인다(`ministryPerson` 의 full/basic 과 같은 판단 — 서버가 `ctx.roles` 로).
- **내려받기:** 2026-10-01 엑셀과 같은 모양(년도·부서·팀명·이름·교적ID·비고·직분·목장·신규/유지·원본 메모·원본 파일·맞춤 근거). 교적ID 칸은 `directory`·`super` 일 때만 채운다. 기록 `history.export`.
- 팝업 없음 규칙(`dialog`·`toast`·`picker.js`) · `busy()` · `<select>` 금지 그대로.

## 6. 서버 액션(`authz.ts` ACTION_ROLES + `index.ts` case + `tests/server.dev.test.mjs` PROBE 셋 모두)

| 액션 | 역할 | 하는 일 · 기록 |
|---|---|---|
| `historyList` | ministry | 거르기·쪽 · 요약 수 |
| `historyUploadCheck` | ministry | 살펴보기(안 쓴다) |
| `historyUploadSave` | ministry | 넣기 + 다시 맞추기 · `history.upload` |
| `historyRowAdd` / `historyRowSave` / `historyRowDelete` | ministry | 한 줄 · `history.add`·`history.edit`·`history.delete`(빼기 = deleted_at) |
| `historyCandidates` | ministry | 줄 하나의 후보(가린 모양/full) · `people.lookup`(`from:"history"`) |
| `historyLink` | ministry | 「이분」(pick+fp)·「이분 아님」·「자동으로 되돌리기」 · `history.link` |
| `historyRematch` | ministry | §3.3 · `history.rematch` |
| `historyExport` | ministry | 내려받기 · `history.export` |

모든 쓰기는 `updated_at` 을 고친다. 기록의 detail 에는 이름·교인ID 를 싣지 않는다(줄 id·해·수만) — `js/menus/system/audit.js`·`tests/audit.test.mjs` 에 새 action 이름을 더한다.

## 7. 교인명부 세션(99)과의 약속

- **읽기:** `ministry_history` 에서 `person_id = $1 and deleted_at is null`, 칸 `id, year, committee, team, role_title, position, mok, source` · `order by year desc, committee, team`. 자세히 창 한 줄 = 「해 · 위원회 · 팀 · 직책」.
- **넘긴 줄:** `order_id` 가 있는 줄의 원래 신청(`ministry_orders.id = order_id`)은 그쪽 창이 사역신청 쪽에서 읽지 않는다(줄 단위 — 그쪽 제안).
- **「이분 것」 쓰기:** 그쪽 액션(역할 `directory` · 예: `peopleLink` kind `history`)이 이 표 줄 하나를 고친다. 고치는 모양은 이 세션이 `history-match.ts` 에 두는 **`historyLinkPatch(personId | null, memberId, nowIso)`** 하나로 만든다:
  `{ person_id, link_how: personId ? 'manual' : 'none', linked_by: memberId, linked_at: nowIso, match_basis: personId ? '사람이 이음' : '', match_reason: personId ? '' : '이분 아님(담당자 확인)', updated_at: nowIso }`. 기록은 `history.link`(`{id, by:"directory"}`).
  「잇기 풀기」(자동으로 되돌리기)는 `{ link_how:'auto', linked_by:null, linked_at:null }` 를 쓴 뒤 그 줄만 다시 맞춘다 — `historyUnlinkPatch()` 도 같은 파일에.
  줄 하나 다시 맞추기는 DB 를 읽어야 해서 순수 모듈과 따로 **`history-db.ts` 의 `rematchHistoryRows(db, ids: number[])`** 로 내보낸다(대상 줄의 이름으로 명부·다른 해 줄을 읽어 §4 를 돌리고 `auto` 줄만 고친다 · 바꾼 수를 돌려준다). 그쪽 `peopleLink`(kind `history`)는 이 셋을 import 한다.
- **넘길 때의 교인ID:** §8 — 그쪽 「잇기 표」의 값(사람이 이음 포함)을 그대로 옮긴다.
- 그쪽 설계: `docs/superpowers/specs/2026-10-01-person-history-tabs-design.md` · 사역 탭은 `ministry_history` 가 없으면(42P01) 올해 신청만 보인다.
- **표가 열리는 날**(운영 SQL 005 적용) 이 세션이 그쪽에 메시지로 알린다. 그 전에 그쪽은 개발 DB 의 가짜 이력으로 만든다.

## 8. 이력으로 넘기기(나중 — 2027 임명 전에 만든다)

- `historyFromOrders {year}` (역할 ministry · 살펴보기→넣기): `ministry_orders` 의 그 해 `status='임명확정'` 줄 → `source='app'`, `order_id = id`, `committee·team·name·position·who(→ mok)` 스냅샷. 하위 선택(`option` · 어와나 택1 등)은 `team` 뒤에 「팀 (선택)」으로 붙인다(직책이 아니다).
- 교인ID: 교인명부 세션 잇기 표 `people_links`(SQL 006 · PK `(kind,row_id)`)에서
  `select person_id, link_how, linked_by, linked_at from people_links where kind='order' and row_id = <ministry_orders.id>` 를 그대로 옮긴다
  (`manual`·`none` 이면 link_how 도 그대로 · 그쪽 `match_basis` 가 있으면 그것도). 줄이 없으면 §4 로 자동.
- 이미 넘긴 `order_id` 는 건너뛴다(unique). 나중에 임명이 더 나면 다시 누르면 더해진다. 취소된 신청의 넘긴 줄은 「빼기」로.
- `src_key` 는 `app|order_id` — 엑셀 열쇠와 섞이지 않는다.

## 9. 보안 · 개인정보

- 표 둘은 서버만(RLS·revoke) · 운영 적용 뒤 노출 점검 0행.
- `ministry` 역할 응답에 person_id 없음(§5). 교인ID 가 나가는 것은 `directory`·`super` 의 full 뿐 — 교회 어드민 기존 원칙 그대로.
- 진짜 엑셀·결과는 저장소 밖. 지금 `church-admin/Data/` 는 git 이 무시하지 않는다 → `.gitignore` 에 `Data/` 를 더하고 친구에게 저장소 밖으로 옮기길 권한다. `tools/leak-scan.mjs`·pre-commit 이 xlsx 를 잡는지 확인.
- 교회 어드민 `privacy.html` 에 한 절: 「지난 해 사역 임명 명단(교회가 만든 엑셀)을 옮겨 적고, 교인명부와 잇는 교인ID 를 함께 둔다 · 사역신청 담당자가 고치고, 교인명부 담당자가 교적 창에서 본다」.
- 개발 DB 에는 가짜 명부(`fake_people.py`)와 가짜 이력만.

## 10. 시험

- **순수 시험** `tests/history-match.test.mjs`: §4 의 규칙마다 가짜 명부로(성별·등록·아이·청년·또래 빼기, 차례 1~5, 유지 잇기, 오타, 같은 해 겹침, 기쁨-1, 남성 목장, A/B 꼴) · `historyLinkPatch`·`src_key`·표 머리 찾기·해 정하기(`history-logic.js`).
- **이 PC 에서만 도는 대조 시험** `tools/history/check_real.mjs`(저장소에는 스크립트만): 진짜 명부 정리본(`C:\Projects\교인목록_2026_09_29_정리.xlsx`)과 통합 엑셀로 `history-match.ts` 를 돌려 §4.7 기대값과 사유별 수·검증 지적 줄을 맞대 본다. 결과는 수만 찍는다.
- **개발 서버 시험** `tests/server.dev.test.mjs`: PROBE 에 새 액션 10개 · 가짜 이력 올리기→살펴보기→넣기→다시 맞추기→잇기(가린 모양 fp 어긋남 포함)→빼기→다시 올리기(건너뜀) 한 바퀴.
- 화면: localhost + 헤드리스로 폰·PC 폭 확인.

## 11. 여는 순서

1. 교회 어드민 따로 가지(worktree `ministry-history`)에서 만든다 — 다른 세션의 가지와 섞이지 않게.
2. 개발: SQL 005 → 함수 → localhost(개발 DB · 가짜 이력)로 화면.
3. **친구 허락 뒤** 운영 SQL 005 → 노출 점검 0행 → 운영 함수 → main 머지·푸시(화면).
4. 친구가 운영 화면에서 엑셀을 올린다(통합 파일 하나 또는 해마다) → 수 확인(§4.7).
5. 교인명부 세션에 「표가 열렸다」 알림(§7). 성경암송 `CLAUDE.md` 지도에 한 줄 + `docs/notes/` 문서, 교회 어드민 `CLAUDE.md` 에 절.

## 12. 함정

- 서버 맞춤과 파이썬 시험판은 같은 규칙이어야 한다 — 대조 시험(§10)이 그 다리다. 파이썬 시험판(`match_church_id.py`)은 세션 임시 폴더에 있었고 저장소에 넣지 않는다.
- 다시 맞추기는 모든 해를 함께 돈다 — 해 하나만 돌리면 다른 해 근거(§4.4)가 빠져 결과가 달라진다.
- 같은 열쇠에 신규/유지를 넣지 않는다(같은 줄의 「유지」 표기만 바뀐 파일이 새 줄로 들어온다).
- 「기쁨-1」 규칙(§4.1)은 추정이다 — 친구가 다르게 말하면 이 한 줄과 시험만 고친다.
- `nameKey` 는 NFC 다(앱 신원 키 `appIdentityKey` 와 다르다 — 이 표는 앱 계정과 잇지 않는다).
