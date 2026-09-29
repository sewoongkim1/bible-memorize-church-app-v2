# 교회 어드민 — 교인명부 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** dimode 교인목록(8,672명)과 사진(4,645장)을 교회 어드민(admin.onlybible.kr)에 올려, 새 역할 「교인명부(`directory`)」를 받은 담당자가 사람 찾기·현황을 보고, 사역 담당자는 사역 화면에서 「교적 ✓ / 교적 확인 / 교적 없음」 표시만 보게 한다.

**Architecture:** 명부는 운영 DB 새 표 `church_people`(+ 올린 기록 `church_people_imports`), 사진은 비공개 Storage 칸 `church-people-photos` — 둘 다 어드민 서버(service role)만 연다. 서버 `church-admin` 에 액션 넷(`peopleSearch`·`peoplePerson`·`peopleStats`·`peopleExport`)을 더하고, 사역 액션 둘(`ministryList`·`ministryPaperCheck/Save`)의 줄마다 `church:{state,reason}` 을 붙인다. 순수 규칙은 `people-match.ts`(맞대기)·`people-query.ts`(찾기 조건·현황)로 두고 Node 시험이 같은 파일을 읽는다. 명단 올리기는 저장소 밖 작업 폴더에서 돌리는 파이썬 스크립트 넷(풀기·사진 받기·가짜 명부·살펴보기/넣기).

**Tech Stack:** 1~5단계와 같음 — 빌드 없는 ES 모듈 화면 · Deno Edge Function(`npm:@supabase/supabase-js@2.117.2`) · Node `node --experimental-strip-types --test` · Python 3(lxml·Pillow — 이 PC 에 있다, CI 에서는 안 돈다).

**설계:** `docs/superpowers/specs/2026-09-29-church-people-directory-design.md`(v2 저장소). **코드는 `c:\Projects\church-admin`** 에 쓴다 — 아래 경로는 모두 그 저장소 기준.

## Global Constraints

- **진짜 명단(이름·연락처·주소·사진)은 저장소에 절대 들어가지 않는다.** 원본·작업 폴더는 `C:\Projects\` 아래 저장소 밖(`C:\Projects\교인명부_작업\<기준일>\`). 커밋 전 `git status` 로 확인한다.
- **개발 DB 에는 가짜 명부만**(`meta.fake=true`), **운영에는 진짜만** — 올리기 스크립트가 반대 방향을 거절한다.
- 올리지 않는 칸: **기타사항 · 최종수정일 · 최종심방일 · dimode 사진 주소**(사진 주소는 작업 폴더 `photo_urls.json` 에만).
- 새 표는 만든 자리에서 **RLS 켜고 `anon`·`authenticated` revoke**. 운영은 카카오 로그인이 켜져 있다 — **`TO authenticated` 로 열지 않는다.** 사진 칸은 `public=false`·정책 없음.
- 새 액션 = `authz.ts` `ACTION_ROLES` + `index.ts` `switch` case + `tests/server.dev.test.mjs` `PROBE` — **셋 다.**
- 역할 id **`directory`**(라벨 「교인명부」) — `admin_roles` 표 한 줄. 코드·CHECK 에 역할 목록을 박지 않는다.
- 사역 담당자 응답에는 `church: { state, reason }` **두 칸만** — state 는 `맞음`·`확인 필요`·`없음`, reason 은 `""`·`소속 다름`·`같은 이름 N명`·`같은 소속에 같은 이름 N명`. **교적 값(연락처·주소·생년월일·직분)을 싣지 않는다.** 명부가 한 번도 안 올라왔으면 `church: null`(화면이 표시를 그리지 않는다).
- 열람 기록: `people.search`(검색어·거르기·결과 수·쪽) · `people.view`(교인ID·이름) · `people.export`(거르기·명수) · `people.import`(스크립트). 「바꾼 기록」 기본 보기에서는 `people.*` 를 빼고, 「교인명부 기록」 보기에서만 보인다.
- 사진 주소 만료 **600초**. 목록은 **50명씩**. 명부가 **90일**을 넘으면 「오래됐어요」. 올리기에서 빠짐이 **5%** 를 넘으면 멈춘다(`--allow-drop` 으로만 넘김).
- church-admin 은 **푸시 = 운영 화면 반영** — Task 1~10 은 **커밋만.** 푸시는 Task 11 에서 운영 서버·데이터가 끝난 **뒤**.
- 개발 `ktpwthwqzgcqcrmsafdo` 먼저, 운영 `xnomlgydifiqiybervtf` 는 Task 11 에서만. SQL 은 `supabase --workdir ~/.church-admin/supa-dev|supa-prod db query --linked -f <절대 경로>`.
- 함수 배포는 **작업 트리 전체**가 나간다 — 배포 전 `git status` 가 깨끗해야 한다.
- 화면 표준 v1 · 확인·알림은 `dialog`/`toast` · 사용자·서버 글자는 `esc` · `dialog` 의 html 에는 줄바꿈 글자를 넣지 않는다(본문이 `white-space:pre-line`).
- 커밋 끝에 `Co-Authored-By:` 한 줄(실제로 일한 모델 이름).

---

### Task 1: 안전장치 먼저 — 명단이 커밋되지 않게

**Files:**
- Create: `tools/leak-scan.mjs`, `tests/leak-scan.test.mjs`
- Modify: `tools/preflight.py`, `.gitignore`

**Interfaces:**
- Produces: `findLeaks(files: {path: string, text: string|null}[]): string[]` · `PHONE_LIMIT = 20` · `SHEET_OK: Set<string>` — `node tools/leak-scan.mjs` 는 `git ls-files` 전체를 보고 걸리면 exit 1.

- [ ] **Step 1: 실패하는 시험을 쓴다** — `tests/leak-scan.test.mjs`

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { findLeaks, PHONE_LIMIT } from "../tools/leak-scan.mjs";

// 번호는 여기서 만들어 쓴다 — 이 파일 자체가 검사에 걸리지 않게
const phones = (n) => Array.from({ length: n }, (_, i) => `010-5${String(i).padStart(3, "0")}-4321`).join("\n");

test("서로 다른 휴대폰 번호가 스무 개 넘게 든 글 파일은 걸린다", () => {
  const out = findLeaks([{ path: "notes/list.md", text: phones(PHONE_LIMIT) }]);
  assert.equal(out.length, 1);
  assert.match(out[0], /notes\/list\.md/);
});

test("스무 개 아래거나 같은 번호를 되풀이한 시험 파일은 안 걸린다", () => {
  assert.deepEqual(findLeaks([{ path: "tests/a.mjs", text: phones(PHONE_LIMIT - 1) }]), []);
  assert.deepEqual(findLeaks([{ path: "tests/b.mjs", text: "010-0000-0000\n".repeat(200) }]), []);
});

test("표 파일(xls·xlsx·csv)은 빈 양식 말고는 걸린다", () => {
  assert.equal(findLeaks([{ path: "files/사역명단_올리기_양식.xlsx", text: null }]).length, 0);
  assert.equal(findLeaks([{ path: "교인목록.xls", text: null }]).length, 1);
  assert.equal(findLeaks([{ path: "out/명단.CSV", text: "" }]).length, 1);
});

test("그림처럼 글이 아닌 파일(text=null)은 넘어간다", () => {
  assert.deepEqual(findLeaks([{ path: "img/og-admin.png", text: null }]), []);
});
```

- [ ] **Step 2: 돌려서 실패를 본다**

Run: `node --experimental-strip-types --test tests/leak-scan.test.mjs`
Expected: FAIL — `Cannot find module '../tools/leak-scan.mjs'`

- [ ] **Step 3: `tools/leak-scan.mjs` 를 쓴다**

```js
// 공개 저장소에 교인 명단이 들어가지 않게 — preflight 가 부른다(node tools/leak-scan.mjs · 2026-09-29 교인명부).
// 한 번 커밋되면 지워도 기록에 남는다. 이름 규칙(.gitignore)을 피해 들어온 파일까지 여기서 잡는다.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const PHONE_RE = /01[016-9]-?\d{3,4}-?\d{4}/g;
export const PHONE_LIMIT = 20;                          // 서로 다른 휴대폰 번호가 이만큼이면 명단으로 본다
export const SHEET_OK = new Set(["files/사역명단_올리기_양식.xlsx"]);   // 빈 양식(이름·번호 없음)
const SHEET_EXT = /\.(xls|xlsx|csv)$/i;

export function findLeaks(files) {
  const out = [];
  for (const { path: p, text } of files) {
    if (SHEET_EXT.test(p) && !SHEET_OK.has(p)) { out.push(`${p} — 표 파일(명단일 수 있다)`); continue; }
    if (text == null) continue;
    const nums = new Set((text.match(PHONE_RE) || []).map((m) => m.replace(/\D/g, "")));
    if (nums.size >= PHONE_LIMIT) out.push(`${p} — 서로 다른 휴대폰 번호 ${nums.size}개`);
  }
  return out;
}

function readText(abs) {
  const buf = readFileSync(abs);
  return buf.includes(0) ? null : buf.toString("utf8");   // 0 바이트가 있으면 그림·압축 파일
}

// 직접 돌릴 때만(시험이 import 할 때는 안 돈다). 윈도는 드라이브 글자 대소문자가 섞여 들어와 소문자로 견준다 —
// 어긋나면 검사가 아예 안 돌고 「통과」로 보이는 사고가 난다.
const same = (a, b) => (process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b);
if (process.argv[1] && same(path.resolve(process.argv[1]), fileURLToPath(import.meta.url))) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const list = execFileSync("git", ["ls-files", "-z"], { cwd: root }).toString("utf8").split("\0").filter(Boolean);
  const leaks = findLeaks(list.map((p) => ({ path: p, text: readText(path.join(root, p)) })));
  if (leaks.length) { console.error(leaks.join("\n")); process.exit(1); }
  console.log(`명단 검사 통과 — 파일 ${list.length}개`);
}
```

- [ ] **Step 4: 시험이 통과하는지 본다**

Run: `node --experimental-strip-types --test tests/leak-scan.test.mjs`
Expected: PASS 4/4

- [ ] **Step 5: preflight 에 넣는다** — `tools/preflight.py` 의 `[3] 캐시 표식` 블록 **뒤**, `print()` 앞에:

```python
print("\n[4] 명단이 커밋되지 않았나 (교인명부 · tools/leak-scan.mjs)")
run("명단 검사", ["node", os.path.join("tools", "leak-scan.mjs")])
```

- [ ] **Step 6: `.gitignore` 끝에 더한다**

```
# 교인명부(2026-09-29) — 명단·사진·작업 폴더는 저장소 밖(C:\Projects\교인명부_작업\)에 둔다. 혹시 안으로 들어와도 커밋되지 않게.
교인*
*.xls
people*.json
photos.json
photo_urls.json
교인명부_작업/
```

- [ ] **Step 7: 전체 점검**

Run: `node tools/leak-scan.mjs` → Expected: `명단 검사 통과 — 파일 5x개`(이 줄이 **나와야** 검사가 실제로 돈 것이다)
Run: `python tools/preflight.py` → Expected: `[4]` 에 `통과  명단 검사` · 마지막 줄 `모두 통과`

- [ ] **Step 8: 커밋(푸시 안 함)**

```bash
git add tools/leak-scan.mjs tests/leak-scan.test.mjs tools/preflight.py .gitignore
git commit -m "chore(교인명부): 명단이 커밋되지 않게 — preflight 명단 검사 · .gitignore"
```

---

### Task 2: 표 · 역할 · 사진 칸(SQL 003) + 노출 점검 ⑦ — 개발에 반영

**Files:**
- Create: `supabase/sql/003_church_people.sql`
- Modify: `supabase/sql/check-authenticated-exposure.sql`

**Interfaces:**
- Produces: 표 `church_people`(칸은 아래 SQL 그대로 — 이후 모든 Task 가 이 이름을 쓴다) · `church_people_imports(id, imported_at, source_date, total, added, changed, removed, photos)` · 역할 `directory` · Storage 칸 `church-people-photos`.

- [ ] **Step 1: `supabase/sql/003_church_people.sql` 을 쓴다**

```sql
-- 교회 어드민 — 교인명부 (2026-09-29 · 설계 v2 docs/superpowers/specs/2026-09-29-church-people-directory-design.md)
-- ⚠️ 개발(ktpwthwqzgcqcrmsafdo) 먼저, 그다음 운영(xnomlgydifiqiybervtf).
-- ⚠️ 서버(church-admin 함수의 service role)만 읽고 쓴다. 공개 키·로그인 사용자(카카오 계정만 있으면 누구나) 모두 막는다.
--    RLS 를 켜고 정책을 두지 않으며 anon·authenticated 권한을 뺀다. 사진 칸은 public=false · 정책 없음.
-- ⚠️ 원본은 dimode(교적 프로그램)다 — 이 표는 읽기 전용 사본. 고치는 길은 올리기 스크립트(tools/people/) 하나뿐.
-- 여러 번 돌려도 안전하다(if not exists · on conflict).
begin;

create table if not exists church_people (
  person_id       int primary key,                  -- dimode 교인ID
  name            text not null default '',
  position        text not null default '',
  position_detail text not null default '',
  gender          text not null default '',
  birth           text not null default '',          -- 원본 글자 그대로(「1975-03-02」·「1975」·「--」)
  birth_date      date,                              -- 날짜로 읽히는 것만
  lunar           text not null default '',
  age             numeric,                           -- 명단 기준일의 나이(원본 그대로 · 음수·소수도 있다)
  spouse          text not null default '',
  spouse_position text not null default '',
  household_head  text not null default '',
  household_rel   text not null default '',
  household_id    int,                               -- 신앙세대주의 교인ID(원본 PersonMiniViewJs 번호 · 가족 묶기).
                                                     -- 세대주가 이 명단에 없을 수 있어 FK 를 걸지 않는다(2026-09-29: 331명)
  kind1           text not null default '',
  kind2           text not null default '',
  kind3           text not null default '',
  registered      text not null default '',
  registered_date date,
  reg_type        text not null default '',
  phone1          text not null default '',
  phone2          text not null default '',
  guide           text not null default '',
  email           text not null default '',
  mok_path        text not null default '',
  mok1            text not null default '',
  mok2            text not null default '',
  mok3            text not null default '',
  mok_leader      text not null default '',
  school_path     text not null default '',
  school_dept     text not null default '',
  teacher         text not null default '',
  youth_path      text not null default '',
  mission         text not null default '',
  address         text not null default '',
  address_jibun   text not null default '',
  has_photo       boolean not null default false,
  photo_hash      text not null default '',          -- 사진 md5 — 다시 올릴 때 바뀐 사진만 올린다
  name_key        text not null default '',          -- 이름 NFC · 띄어쓰기 없음(찾기·맞대기)
  phone_digits    text not null default '',          -- 연락처1·2 숫자만, 띄어쓰기로 이음(전화 뒷자리 찾기·맞대기)
  updated_at      timestamptz not null default now()
);
create index if not exists church_people_name_key_idx on church_people (name_key);
create index if not exists church_people_mok1_idx on church_people (mok1);
create index if not exists church_people_household_idx on church_people (household_id);

create table if not exists church_people_imports (
  id          bigserial primary key,
  imported_at timestamptz not null default now(),
  source_date date not null,                         -- 명단 기준일(dimode 에서 내려받은 날)
  total       int not null,
  added       int not null default 0,
  changed     int not null default 0,
  removed     int not null default 0,
  photos      int not null default 0                 -- 이번에 올린 사진 수
);

alter table church_people         enable row level security;
alter table church_people_imports enable row level security;
revoke all on church_people, church_people_imports from anon, authenticated;
revoke all on sequence church_people_imports_id_seq from anon, authenticated;

insert into admin_roles (id, label, description) values
  ('directory', '교인명부', '교인 찾기 · 현황 · 내려받기')
on conflict (id) do nothing;

-- 사진 칸 — 공개 끔 · 정책 없음(서버만 연다). 이미 있으면 공개만 다시 끈다.
insert into storage.buckets (id, name, public) values ('church-people-photos', 'church-people-photos', false)
on conflict (id) do update set public = false;

commit;

select 'church_people' as t, count(*) from church_people
union all select 'imports', count(*) from church_people_imports
union all select 'role directory', count(*) from admin_roles where id = 'directory'
union all select 'bucket 공개(0이어야)', count(*) from storage.buckets where id = 'church-people-photos' and public;
```

- [ ] **Step 2: 노출 점검에 ⑦을 더한다** — `supabase/sql/check-authenticated-exposure.sql`
  - 머리 주석 `-- 보는 것 여섯 가지:` 를 `-- 보는 것 일곱 가지:` 로, `--   ⑥ …` 줄 **다음에** 한 줄:
    `--   ⑦ 교인명부 사진 칸(church-people-photos)이 공개(public=true)인가 — 정책이 없어도 공개 칸은 누구나 연다. 다른 앱이 일부러 공개로 둔 칸은 보지 않는다.`
  - 마지막 `) x` 바로 **앞**(⑥ 의 `and pg_get_functiondef(...) ~ …` 줄 다음)에:

```sql
  union all
  -- ⑦ 교인명부 사진 칸이 공개인가(2026-09-29) — 칸 이름을 박는다(같은 프로젝트의 다른 앱 공개 칸은 대상이 아니다)
  select '7 공개 사진 칸', 'storage', b.id, 'public = true'
  from storage.buckets b
  where b.id = 'church-people-photos' and b.public
```

- [ ] **Step 3: 개발에 돌린다**

Run: `supabase --workdir ~/.church-admin/supa-dev db query --linked -f C:/Projects/church-admin/supabase/sql/003_church_people.sql`
Expected: 마지막 표 — `church_people 0` · `imports 0` · `role directory 1` · `bucket 공개(0이어야) 0`
(먼저 `supabase --workdir ~/.church-admin/supa-dev db query --linked "select count(*) from users"` 가 **스물 남짓**이면 개발이다. 사백이 넘으면 운영 — 멈춘다.)

- [ ] **Step 4: 개발에서 노출 점검**

Run: `supabase --workdir ~/.church-admin/supa-dev db query --linked -f C:/Projects/church-admin/supabase/sql/check-authenticated-exposure.sql`
Expected: **0행**

- [ ] **Step 5: 커밋(푸시 안 함)**

```bash
git add supabase/sql/003_church_people.sql supabase/sql/check-authenticated-exposure.sql
git commit -m "feat(교인명부): 표 둘 · 역할 directory · 비공개 사진 칸 (SQL 003, 개발 적용) · 노출 점검 ⑦"
```

---

### Task 3: 맞대기 규칙 — `people-match.ts`

**Files:**
- Create: `supabase/functions/church-admin/people-match.ts`, `tests/people-match.test.mjs`

**Interfaces:**
- Produces (Task 4·6 이 쓴다):
  - `MATCH_GU: string[]` = `["믿음","소망","사랑","섬김","은혜","화평","기쁨","새가족"]`
  - `nameKey(s): string` · `phoneDigits(s): string` · `mokNumber(s): number | null`
  - `type Cand = { mok1, mok3, school_dept: string; phones: string[] }` · `toCand(dbRow): Cand`
  - `type Applicant = { type: "교구"|"교회학교"; gu: string; mok: number|null; bu: string; name: string; phone: string }`
  - `applicantFromWho(name, who, phone): Applicant` · `applicantFromPaper(row{gu,mok,name,phone}): Applicant`
  - `sameAffiliation(c: Cand, a: Applicant): boolean`
  - `type Church = { state: "맞음"|"확인 필요"|"없음"; reason: string }` · `matchChurch(cands: Cand[]|undefined, a): Church`
  - `LOOKUP_BAD: RegExp` · `lookupKeys(names: unknown[]): string[]` · `churchFor(idx: Map<string, Cand[]>|null, a): Church|null`

- [ ] **Step 1: 실패하는 시험** — `tests/people-match.test.mjs`

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  nameKey, phoneDigits, mokNumber, toCand, applicantFromWho, applicantFromPaper,
  sameAffiliation, matchChurch, churchFor, lookupKeys,
} from "../supabase/functions/church-admin/people-match.ts";

const C = (o) => toCand({ mok1: "", mok3: "", school_dept: "", phone_digits: "", ...o });
const A = (o) => ({ type: "교구", gu: "", mok: null, bu: "", name: "김철수", phone: "", ...o });

test("nameKey — 띄어쓰기를 없애고 자모분리(NFD)를 완성형으로", () => {
  assert.equal(nameKey(" 김 철수 "), "김철수");
  assert.equal(nameKey("\u1100\u1175\u11B7철수"), "김철수");
  assert.equal(nameKey(null), "");
  assert.equal(phoneDigits("010-1234 5678"), "01012345678");
});

test("mokNumber — 명부 「기쁨-12목장」과 앱 「12」·「12목장」이 같은 수", () => {
  assert.equal(mokNumber("기쁨-12목장"), 12);
  assert.equal(mokNumber("기쁨-01목장"), 1);
  assert.equal(mokNumber("12"), 12);
  assert.equal(mokNumber("12목장"), 12);
  assert.equal(mokNumber("0목장"), 0);
  assert.equal(mokNumber("청년-03"), 3);
  assert.equal(mokNumber("화평 남성목장"), null);
  assert.equal(mokNumber("3월"), null);
  assert.equal(mokNumber(""), null);
});

test("toCand — 전화 칸을 번호 목록으로", () => {
  assert.deepEqual(C({ mok1: "기쁨", mok3: "기쁨-12목장", phone_digits: "01011112222 026861234" }),
    { mok1: "기쁨", mok3: "기쁨-12목장", school_dept: "", phones: ["01011112222", "026861234"] });
});

test("applicantFromWho — 신청 현황의 소속 글자를 푼다", () => {
  assert.deepEqual(applicantFromWho("김철수", "기쁨 12목장", "010-1111-2222"),
    { type: "교구", gu: "기쁨", mok: 12, bu: "", name: "김철수", phone: "010-1111-2222" });
  assert.deepEqual(applicantFromWho("이영희", "고등부 1학년", ""),
    { type: "교회학교", gu: "", mok: null, bu: "고등부", name: "이영희", phone: "" });
  const t = applicantFromWho("x", "시험 0목장", "");               // 목록에 없는 교구라도 「N목장」이면 교구
  assert.equal(t.type, "교구"); assert.equal(t.gu, "시험"); assert.equal(t.mok, 0);
  assert.equal(applicantFromWho("x", "새가족", "").type, "교구");
  assert.equal(applicantFromWho("x", "청년부 청년1", "").bu, "청년부");
});

test("applicantFromPaper — 종이 명단 줄", () => {
  assert.deepEqual(applicantFromPaper({ gu: "화평", mok: "20목장", name: "박하나", phone: "010-1234-5678" }),
    { type: "교구", gu: "화평", mok: 20, bu: "", name: "박하나", phone: "010-1234-5678" });
});

test("sameAffiliation — 교구·목장 / 새가족은 교구만 / 교회학교는 부서 또는 청년부", () => {
  assert.equal(sameAffiliation(C({ mok1: "기쁨", mok3: "기쁨-12목장" }), A({ gu: "기쁨", mok: 12 })), true);
  assert.equal(sameAffiliation(C({ mok1: "기쁨", mok3: "기쁨-13목장" }), A({ gu: "기쁨", mok: 12 })), false);
  assert.equal(sameAffiliation(C({ mok1: "소망", mok3: "소망-12목장" }), A({ gu: "기쁨", mok: 12 })), false);
  assert.equal(sameAffiliation(C({ mok1: "기쁨", mok3: "기쁨-12목장" }), A({ gu: "기쁨", mok: null })), false);
  assert.equal(sameAffiliation(C({ mok1: "새가족", mok3: "3월" }), A({ gu: "새가족" })), true);
  assert.equal(sameAffiliation(C({ school_dept: "고등부" }), A({ type: "교회학교", bu: "고등부" })), true);
  assert.equal(sameAffiliation(C({ mok1: "청년부", mok3: "청년-03" }), A({ type: "교회학교", bu: "청년부" })), true);
  assert.equal(sameAffiliation(C({ school_dept: "중등부" }), A({ type: "교회학교", bu: "고등부" })), false);
});

test("matchChurch — 없음 · 맞음 · 같은 소속 여럿 · 소속 다름(전화) · 같은 이름 N명", () => {
  const a = A({ gu: "기쁨", mok: 12, phone: "010-1111-2222" });
  assert.deepEqual(matchChurch(undefined, a), { state: "없음", reason: "" });
  assert.deepEqual(matchChurch([], a), { state: "없음", reason: "" });
  assert.deepEqual(matchChurch([C({ mok1: "기쁨", mok3: "기쁨-12목장" })], a), { state: "맞음", reason: "" });
  assert.deepEqual(matchChurch([C({ mok1: "기쁨", mok3: "기쁨-12목장" }), C({ mok1: "기쁨", mok3: "기쁨-12목장" })], a),
    { state: "확인 필요", reason: "같은 소속에 같은 이름 2명" });
  assert.deepEqual(matchChurch([C({ mok1: "소망", mok3: "소망-3목장", phone_digits: "01011112222" })], a),
    { state: "확인 필요", reason: "소속 다름" });
  assert.deepEqual(matchChurch([C({ mok1: "소망", mok3: "소망-3목장" }), C({ mok1: "사랑", mok3: "사랑-1목장" })], a),
    { state: "확인 필요", reason: "같은 이름 2명" });
});

test("churchFor — 명부 없음은 null · 이름에 .in() 을 깨는 글자가 있으면 null · 결과는 두 칸만", () => {
  const idx = new Map([["김철수", [C({ mok1: "기쁨", mok3: "기쁨-12목장", phone_digits: "01099998888" })]]]);
  assert.equal(churchFor(null, A({ gu: "기쁨", mok: 12 })), null);
  assert.equal(churchFor(idx, A({ name: '김,"철수' })), null);
  assert.equal(churchFor(idx, A({ name: "" })), null);
  const r = churchFor(idx, A({ name: "김 철수", gu: "기쁨", mok: 12 }));
  assert.deepEqual(Object.keys(r).sort(), ["reason", "state"]);
  assert.equal(r.state, "맞음");
  assert.deepEqual(churchFor(idx, A({ name: "박없음" })), { state: "없음", reason: "" });
});

test("lookupKeys — 겹침·빈 것·깨는 글자를 뺀다", () => {
  assert.deepEqual(lookupKeys(["김 철수", "김철수", "", null, "이(영희)"]), ["김철수"]);
});
```

- [ ] **Step 2: 실패를 본다**

Run: `node --experimental-strip-types --test tests/people-match.test.mjs`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: `supabase/functions/church-admin/people-match.ts`**

```ts
// 교인명부 — 사역신청 줄을 교적과 맞대는 규칙(순수 함수 · 2026-09-29)
//   서버(Deno, index.ts)와 시험(Node, tests/people-match.test.mjs)이 **같은 파일**을 읽는다 —
//   authz.ts 와 같은 제약(원격 import·enum 금지, node --experimental-strip-types 가 그대로 읽는다).
// ⚠️ 사역 담당자에게는 { state, reason } 두 칸만 간다. 교적의 값(연락처·주소·생년월일·직분)은 이 모듈 밖으로 내보내지 않는다.

// 성경암송 앱 GU_LIST 와 같은 차례
export const MATCH_GU = ["믿음", "소망", "사랑", "섬김", "은혜", "화평", "기쁨", "새가족"];

export const nameKey = (s: unknown): string => String(s ?? "").normalize("NFC").replace(/\s+/g, "");
export const phoneDigits = (s: unknown): string => String(s ?? "").replace(/\D/g, "");

// 「기쁨-12목장」·「12」·「12목장」·「청년-03」 → 12·12·12·3 (끝에 붙은 수). 없으면 null.
export function mokNumber(s: unknown): number | null {
  const m = /(\d+)\s*(?:목장)?\s*$/.exec(String(s ?? "").trim());
  return m ? Number(m[1]) : null;
}

export type Cand = { mok1: string; mok3: string; school_dept: string; phones: string[] };
export type Applicant = { type: "교구" | "교회학교"; gu: string; mok: number | null; bu: string; name: string; phone: string };
export type Church = { state: "맞음" | "확인 필요" | "없음"; reason: string };

export function toCand(r: any): Cand {
  return {
    mok1: String(r?.mok1 ?? ""), mok3: String(r?.mok3 ?? ""), school_dept: String(r?.school_dept ?? ""),
    phones: String(r?.phone_digits ?? "").split(/\s+/).filter(Boolean),
  };
}

// 신청 현황의 who — 「기쁨 12목장」(교구) · 「고등부 1학년」(교회학교). 목록 밖 교구라도 둘째 말이 「N목장」이면 교구로 본다.
export function applicantFromWho(name: unknown, who: unknown, phone: unknown): Applicant {
  const parts = String(who ?? "").trim().split(/\s+/).filter(Boolean);
  const head = parts[0] ?? "";
  const n = String(name ?? ""), p = String(phone ?? "");
  if (MATCH_GU.includes(head) || /목장$/.test(parts[1] ?? "")) {
    return { type: "교구", gu: head, mok: mokNumber(parts.slice(1).join("")), bu: "", name: n, phone: p };
  }
  return { type: "교회학교", gu: "", mok: null, bu: head, name: n, phone: p };
}

export function applicantFromPaper(r: any): Applicant {
  return { type: "교구", gu: String(r?.gu ?? ""), mok: mokNumber(r?.mok), bu: "", name: String(r?.name ?? ""), phone: String(r?.phone ?? "") };
}

export function sameAffiliation(c: Cand, a: Applicant): boolean {
  if (a.type === "교구") {
    if (!a.gu || c.mok1 !== a.gu) return false;
    if (a.gu === "새가족") return true;              // 새가족의 명부 목장 칸은 연도·월이다 — 교구만 본다
    return a.mok !== null && mokNumber(c.mok3) === a.mok;
  }
  return !!a.bu && (c.school_dept === a.bu || c.mok1 === a.bu);   // 청년부는 명부의 목장 첫 칸에 있다
}

export function matchChurch(cands: Cand[] | undefined, a: Applicant): Church {
  const list = cands ?? [];
  if (!list.length) return { state: "없음", reason: "" };
  const same = list.filter((c) => sameAffiliation(c, a));
  if (same.length === 1) return { state: "맞음", reason: "" };
  if (same.length > 1) return { state: "확인 필요", reason: `같은 소속에 같은 이름 ${same.length}명` };
  const ph = phoneDigits(a.phone);
  if (ph && list.some((c) => c.phones.includes(ph))) return { state: "확인 필요", reason: "소속 다름" };
  return { state: "확인 필요", reason: `같은 이름 ${list.length}명` };
}

// supabase-js .in() 은 " \ 를 이스케이프하지 않고 , ( ) 는 감싸기만 한다(authz.parseIdentity 참고) — 그런 이름은 묻지 않는다
export const LOOKUP_BAD = /["\\,()]/;
export const lookupKeys = (names: unknown[]): string[] =>
  [...new Set(names.map(nameKey).filter((k) => k && !LOOKUP_BAD.test(k)))];

// 명부가 없거나(null) 물을 수 없는 이름이면 null — 화면은 표시를 그리지 않는다(「교적 없음」은 사실이 아닐 수 있다)
export function churchFor(idx: Map<string, Cand[]> | null, a: Applicant): Church | null {
  if (!idx) return null;
  const k = nameKey(a.name);
  if (!k || LOOKUP_BAD.test(k)) return null;
  return matchChurch(idx.get(k), a);
}
```

- [ ] **Step 4: 통과를 본다**

Run: `node --experimental-strip-types --test tests/people-match.test.mjs`
Expected: PASS 9/9

- [ ] **Step 5: preflight → 커밋**

```bash
python tools/preflight.py
git add supabase/functions/church-admin/people-match.ts tests/people-match.test.mjs
git commit -m "feat(교인명부): 교적 맞대기 순수 모듈 — 목장 번호·새가족·교회학교·전화로 소속 다름"
```

---

### Task 4: 찾기 조건 · 현황 세기 — `people-query.ts`

**Files:**
- Create: `supabase/functions/church-admin/people-query.ts`, `tests/people-query.test.mjs`

**Interfaces:**
- Consumes: `MATCH_GU` (Task 3)
- Produces (Task 5 가 쓴다):
  - `PAGE_SIZE = 50` · `PHOTO_TTL = 600`
  - `type Search = { name, tail, mok1, kind2, kind3, position: string; noPhoto: boolean; household: number | null; page: number }`
  - `parseSearch(b): { ok: true; s: Search } | { ok: false; error: "invalid" }` — `b.household` 는 세대주 교인ID(가족 보기)
  - `searchDetail(s: Search): Record<string, string|boolean>`
  - `AGE_BANDS: string[]` · `ageBand(age): string`
  - `statsOf(rows)` → `{ total, noPhoto, households, gu: {gu,n,moks}[], kind2, kind3, position, school: [string,number][], age: {band,m,f,x}[], options: {mok1,kind2,kind3,position: string[]} }`

- [ ] **Step 1: 실패하는 시험** — `tests/people-query.test.mjs`

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSearch, searchDetail, ageBand, statsOf, PAGE_SIZE, PHOTO_TTL } from "../supabase/functions/church-admin/people-query.ts";

test("parseSearch — 숫자 4자리 이상은 전화 뒷자리, 그 밖은 이름(글자·숫자·- 만)", () => {
  assert.equal(parseSearch({ q: " 김 철수 " }).s.name, "김철수");
  assert.equal(parseSearch({ q: "ca-test-min" }).s.name, "ca-test-min");   // 개발 시험 이름이 그대로 찾아져야 한다
  assert.equal(parseSearch({ q: "5678" }).s.tail, "5678");
  assert.equal(parseSearch({ q: "5678" }).s.name, "");
  assert.equal(parseSearch({ q: "010-1234-5678" }).s.tail, "01012345678");
  assert.equal(parseSearch({ q: "12" }).s.tail, "");                 // 세 자리 이하는 전화로 보지 않는다
  assert.equal(parseSearch({ q: "%_김'" }).s.name, "김");            // ilike 와일드카드·따옴표는 빠진다
  assert.equal(parseSearch({}).s.page, 0);
  assert.equal(parseSearch({ page: 3 }).s.page, 3);
  assert.equal(parseSearch({ page: -1 }).ok, false);
  assert.equal(parseSearch({ page: 1.5 }).ok, false);
  assert.equal(parseSearch({ noPhoto: "true" }).s.noPhoto, false);  // 참은 true 만
  assert.equal(parseSearch({ noPhoto: true }).s.noPhoto, true);
  assert.equal(parseSearch({ mok1: " 기쁨 " }).s.mok1, "기쁨");
  assert.equal(parseSearch({}).s.household, null);                  // 가족 보기(세대주 교인ID)
  assert.equal(parseSearch({ household: 45458 }).s.household, 45458);
  assert.equal(parseSearch({ household: "45458" }).s.household, 45458);
  assert.equal(parseSearch({ household: "" }).s.household, null);
  assert.equal(parseSearch({ household: "x" }).ok, false);
  assert.equal(parseSearch({ household: -1 }).ok, false);
  assert.equal(PAGE_SIZE, 50);
  assert.equal(PHOTO_TTL, 600);   // 사진 주소 10분 — 설계 값
});

test("searchDetail — 빈 거르기는 기록에 남기지 않는다", () => {
  assert.deepEqual(searchDetail(parseSearch({ mok1: "기쁨", noPhoto: true }).s), { mok1: "기쁨", noPhoto: true });
  assert.deepEqual(searchDetail(parseSearch({ household: 45458 }).s), { household: "45458" });
  assert.deepEqual(searchDetail(parseSearch({}).s), {});
});

test("ageBand", () => {
  assert.equal(ageBand(null), "모름");
  assert.equal(ageBand(""), "모름");
  assert.equal(ageBand(-3), "모름");
  assert.equal(ageBand(5), "10살 아래");
  assert.equal(ageBand(19), "10대");
  assert.equal(ageBand(51), "50대");
  assert.equal(ageBand(80), "80살 이상");
  assert.equal(ageBand("9.9"), "10살 아래");
});

test("statsOf — 교구 차례 · 목장 수 · 사진 없음 · 가구 수 · 연령대×성별 · 거르기 목록", () => {
  const R = (o) => ({ mok1: "", mok3: "", kind2: "", kind3: "", position: "", school_dept: "", gender: "", age: null, has_photo: true, household_id: null, ...o });
  const s = statsOf([
    R({ mok1: "기쁨", mok3: "기쁨-01목장", kind2: "장년", position: "집사", gender: "남", age: 51, household_id: 1 }),
    R({ mok1: "기쁨", mok3: "기쁨-02목장", kind2: "장년", position: "집사", gender: "여", age: 55, has_photo: false, household_id: 1 }),
    R({ mok1: "믿음", mok3: "믿음-01목장", kind2: "장년", position: "권사", gender: "여", age: 70, household_id: 3 }),
    R({ kind2: "교회학교", school_dept: "고등부", gender: "남", age: 17 }),
  ]);
  assert.equal(s.total, 4);
  assert.equal(s.noPhoto, 1);
  assert.equal(s.households, 2);                                 // 세대주 교인ID 가 없는 분은 세지 않는다
  assert.deepEqual(s.gu.map((g) => g.gu), ["믿음", "기쁨", "(목장 없음)"]);   // 앱 교구 차례, 목록 밖은 뒤
  assert.deepEqual(s.gu.find((g) => g.gu === "기쁨"), { gu: "기쁨", n: 2, moks: 2 });
  assert.deepEqual(s.position[0], ["집사", 2]);
  assert.deepEqual(s.school, [["고등부", 1]]);
  assert.deepEqual(s.age.find((a) => a.band === "50대"), { band: "50대", m: 1, f: 1, x: 0 });
  assert.deepEqual(s.options.mok1, ["믿음", "기쁨"]);
  assert.ok(!s.options.position.includes("(없음)"));
});
```

- [ ] **Step 2: 실패를 본다** — `node --experimental-strip-types --test tests/people-query.test.mjs` → FAIL(모듈 없음)

- [ ] **Step 3: `supabase/functions/church-admin/people-query.ts`**

```ts
// 교인명부 — 찾기 조건 풀기 · 현황 세기(순수 함수 · 2026-09-29). authz.ts 와 같은 제약.
import { MATCH_GU } from "./people-match.ts";

export const PAGE_SIZE = 50;    // 목록 한 쪽
export const PHOTO_TTL = 600;   // 사진 주소 만료(초) — 새어 나가도 10분 뒤 닫힌다

export type Search = {
  name: string; tail: string; mok1: string; kind2: string; kind3: string; position: string; noPhoto: boolean;
  household: number | null;   // 가족 보기 — 신앙세대주의 교인ID
  page: number;
};

const clean = (s: unknown, max = 20): string => String(s ?? "").normalize("NFC").trim().slice(0, max);

// 검색어 하나로 이름과 전화 뒷자리를 가른다 — 숫자(띄어쓰기·- 빼고)만 4~11자리면 전화, 그 밖은 이름.
// 이름은 한글·영문·숫자·- 만 남긴다(ilike 의 % _ 가 사용자 글자로 들어가지 않게).
export function parseSearch(b: any): { ok: true; s: Search } | { ok: false; error: string } {
  const raw = clean(b?.q, 40);
  const digits = raw.replace(/[\s-]/g, "");
  const tail = /^\d{4,11}$/.test(digits) ? digits : "";
  const name = tail ? "" : raw.replace(/[^가-힣A-Za-z0-9-]/g, "");   // - 는 남긴다(시험 이름 ca-test-… · ilike 에 무해)
  const page = b?.page === undefined || b?.page === null ? 0 : Number(b.page);
  if (!Number.isSafeInteger(page) || page < 0 || page > 1000) return { ok: false, error: "invalid" };
  const hv = b?.household;
  const household = hv === undefined || hv === null || hv === "" ? null : Number(hv);
  if (household !== null && (!Number.isSafeInteger(household) || household <= 0)) return { ok: false, error: "invalid" };
  return { ok: true, s: { name, tail, mok1: clean(b?.mok1), kind2: clean(b?.kind2), kind3: clean(b?.kind3),
    position: clean(b?.position), noPhoto: b?.noPhoto === true, household, page } };
}

// 열람 기록에 남길 거르기 — 빈 것은 뺀다
export function searchDetail(s: Search): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (const k of ["mok1", "kind2", "kind3", "position"] as const) if (s[k]) out[k] = s[k];
  if (s.noPhoto) out.noPhoto = true;
  if (s.household) out.household = String(s.household);
  return out;
}

export const AGE_BANDS = ["10살 아래", "10대", "20대", "30대", "40대", "50대", "60대", "70대", "80살 이상", "모름"];
export function ageBand(age: unknown): string {
  if (age === null || age === undefined || age === "") return "모름";
  const n = Number(age);
  if (!Number.isFinite(n) || n < 0 || n > 120) return "모름";
  if (n < 10) return "10살 아래";
  if (n >= 80) return "80살 이상";
  return `${Math.floor(n / 10) * 10}대`;
}

type Pair = [string, number];
const NONE = "(없음)";
function countBy(rows: any[], f: (r: any) => string): Pair[] {
  const m = new Map<string, number>();
  for (const r of rows) { const k = f(r) || NONE; m.set(k, (m.get(k) ?? 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"));
}
const guRank = (g: string) => { const i = MATCH_GU.indexOf(g); return i < 0 ? 99 : i; };

// 숫자만 — 이름·연락처는 담지 않는다
export function statsOf(rows: any[]) {
  const byGu = new Map<string, { n: number; moks: Set<string> }>();
  for (const r of rows) {
    const g = r.mok1 || "(목장 없음)";
    if (!byGu.has(g)) byGu.set(g, { n: 0, moks: new Set() });
    const x = byGu.get(g)!;
    x.n++;
    if (r.mok3) x.moks.add(r.mok3);
  }
  const gu = [...byGu.entries()].map(([g, v]) => ({ gu: g, n: v.n, moks: v.moks.size }))
    .sort((a, b) => guRank(a.gu) - guRank(b.gu) || b.n - a.n || a.gu.localeCompare(b.gu, "ko"));
  const kind2 = countBy(rows, (r) => r.kind2);
  const kind3 = countBy(rows, (r) => r.kind3);
  const position = countBy(rows, (r) => r.position);
  const age = AGE_BANDS.map((band) => {
    const inB = rows.filter((r) => ageBand(r.age) === band);
    return { band, m: inB.filter((r) => r.gender === "남").length, f: inB.filter((r) => r.gender === "여").length,
      x: inB.filter((r) => r.gender !== "남" && r.gender !== "여").length };
  });
  const keys = (pairs: Pair[]) => pairs.map(([k]) => k).filter((k) => k !== NONE);
  return {
    total: rows.length,
    noPhoto: rows.filter((r) => !r.has_photo).length,
    households: new Set(rows.map((r) => r.household_id).filter(Boolean)).size,   // 신앙세대주 교인ID 기준
    gu, kind2, kind3, position,
    school: countBy(rows.filter((r) => r.school_dept), (r) => r.school_dept),
    age,
    options: { mok1: gu.map((g) => g.gu).filter((g) => g !== "(목장 없음)"), kind2: keys(kind2), kind3: keys(kind3), position: keys(position) },
  };
}
```

- [ ] **Step 4: 통과** — `node --experimental-strip-types --test tests/people-query.test.mjs` → PASS 4/4

- [ ] **Step 5: preflight → 커밋**

```bash
python tools/preflight.py
git add supabase/functions/church-admin/people-query.ts tests/people-query.test.mjs
git commit -m "feat(교인명부): 찾기 조건·현황 세기 순수 모듈"
```

---

### Task 5: 서버 — 교인명부 액션 넷 · 열람 기록 · 「교인명부 기록」 보기

**Files:**
- Modify: `supabase/functions/church-admin/authz.ts`, `supabase/functions/church-admin/index.ts`, `tests/authz.test.mjs`, `tests/server.dev.test.mjs`

**Interfaces:**
- Consumes: Task 3 `nameKey`… (Task 6 에서), Task 4 `parseSearch`·`searchDetail`·`statsOf`·`PAGE_SIZE`·`PHOTO_TTL`
- Produces (화면 Task 9·10 이 쓴다):
  - `peopleSearch {q?, mok1?, kind2?, kind3?, position?, noPhoto?, household?, page?}` → `{ ok, source: {source_date,total}|null, total, page, pageSize, rows: [{person_id,name,position,gender,age,mok1,mok3,school_dept,kind2,phone1,has_photo,household_id,household_rel,photo}] }` — `household` 는 세대주 교인ID(가족 보기)
  - `peoplePerson {id}` → `{ ok, person: {…PEOPLE_ALL_COLS, photo}, family: [{person_id,name,household_rel,gender,age,position}] }`(같은 `household_id` 의 다른 분 · 최대 50) 또는 `{ok:false,error:"not-found"}`
  - `peopleStats {}` → `{ ok, source|null, stats: statsOf(...)|null }`
  - `peopleExport {같은 거르기}` → `{ ok, source|null, rows: [...PEOPLE_ALL_COLS] }`
  - `auditList {limit, before?, kind?: "people"}` — kind 가 `"people"` 이면 `people.*` 만, 아니면 `people.*` 를 뺀다.

- [ ] **Step 1: `authz.test.mjs` 를 먼저 고친다(실패하게)**
  - `ministry 액션 × 사람 여섯 가지` 시험의 마지막 줄 `assert.deepEqual(knownRoles(), ["ministry", "super"]);` → `assert.deepEqual(knownRoles(), ["directory", "ministry", "super"]);`
  - 그 시험 **다음에** 새 시험:

```js
test("directory(교인명부) 액션 × 사람 — 교인명부 역할·총괄만 통과, 사역 담당은 막힘", () => {
  const cases = [
    [null, "not-registered"],
    [{ status: "pending", roles: ["directory"] }, "pending"],
    [{ status: "disabled", roles: ["directory"] }, "disabled"],
    [{ status: "active", roles: ["ministry"] }, "forbidden"],
    [{ status: "active", roles: ["directory"] }, "ok"],
    [{ status: "active", roles: ["super"] }, "ok"],
  ];
  const acts = Object.keys(ACTION_ROLES).filter((k) => ACTION_ROLES[k] === "directory");
  assert.deepEqual(acts.sort(), ["peopleExport", "peoplePerson", "peopleSearch", "peopleStats"]);
  for (const a of acts) for (const [m, want] of cases) assert.equal(canCall(a, m), want, a);
});
```

Run: `node --experimental-strip-types --test tests/authz.test.mjs` → FAIL(액션 없음)

- [ ] **Step 2: `authz.ts` `ACTION_ROLES` 끝(`ministryPaperSave: "ministry",` 다음)에**

```ts
  // 교인명부(2026-09-29) — 찾기·한 분 보기·현황·내려받기. 읽기만(원본은 dimode). 찾기·보기·내려받기는 열람 기록에 남는다.
  peopleSearch: "directory",
  peoplePerson: "directory",
  peopleStats: "directory",
  peopleExport: "directory",
```

Run: `node --experimental-strip-types --test tests/authz.test.mjs` → PASS

- [ ] **Step 3: `index.ts` — import 두 줄 더하기**(`import { appIdentityKey, … } from "./paper.ts";` 다음)

```ts
import { parseSearch, searchDetail, statsOf, PAGE_SIZE, PHOTO_TTL, type Search } from "./people-query.ts";
```

- [ ] **Step 4: `index.ts` — `auditList` 에 kind 거르기**. `if (Number.isSafeInteger(beforeId) && beforeId > 0) q = q.lt("id", beforeId);` 줄 **다음에**:

```ts
  // 교인명부 열람(people.*)은 따로 본다 — 찾기·보기가 많아 바꾼 일을 덮지 않게
  q = b.kind === "people" ? q.like("action", "people.%") : q.not("action", "like", "people.%");
```

- [ ] **Step 5: `index.ts` — 교인명부 액션.** `Deno.serve(` **바로 앞**에 붙인다:

```ts
// ---------- 교인명부 (2026-09-29) ----------
// 설계: v2 docs/superpowers/specs/2026-09-29-church-people-directory-design.md
// ⚠️ 읽기만 — 원본은 dimode, 고치는 길은 tools/people/load_people.py 하나.
// ⚠️ 찾기·보기·내려받기는 admin_audit 에 남긴다(people.*). 현황은 숫자만이라 남기지 않는다.
// ⚠️ 사진은 비공개 칸 — 10분짜리 서명 주소만 준다. 목록은 그 쪽 사람 것만 만든다.
const PEOPLE_BUCKET = "church-people-photos";
const PEOPLE_LIST_COLS = "person_id,name,position,gender,age,mok1,mok3,school_dept,kind2,phone1,has_photo,household_id,household_rel";
const PEOPLE_ALL_COLS = "person_id,name,position,position_detail,gender,birth,lunar,age,spouse,spouse_position," +
  "household_head,household_rel,household_id,kind1,kind2,kind3,registered,reg_type,phone1,phone2,guide,email," +
  "mok_path,mok1,mok2,mok3,mok_leader,school_path,school_dept,teacher,youth_path,mission,address,address_jibun,has_photo";
// 가족(같은 신앙세대주) — 자세히 보기 아래에 이름·관계만. 연락처는 그분을 눌러 열어야 보인다(열람 기록이 남게).
const FAMILY_COLS = "person_id,name,household_rel,gender,age,position";

// 명부 기준일 — 마지막으로 올린 기록. 한 번도 안 올렸으면 null(화면은 「아직 명부가 없어요」)
async function peopleSource(): Promise<{ source_date: string; total: number } | null> {
  const { data, error } = await db.from("church_people_imports").select("source_date,total")
    .order("id", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data ? { source_date: data.source_date, total: data.total } : null;
}

function peopleFilter(q: any, s: Search) {
  if (s.name) q = q.ilike("name_key", `%${s.name}%`);
  if (s.tail) q = q.ilike("phone_digits", `%${s.tail}%`);
  if (s.mok1) q = q.eq("mok1", s.mok1);
  if (s.kind2) q = q.eq("kind2", s.kind2);
  if (s.kind3) q = q.eq("kind3", s.kind3);
  if (s.position) q = q.eq("position", s.position);
  if (s.noPhoto) q = q.eq("has_photo", false);
  if (s.household) q = q.eq("household_id", s.household);
  return q;
}

// 사진 서명 주소 — 실패하면 사진만 빠진다(목록 전체를 실패로 만들지 않는다)
async function photoUrls(ids: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  if (!ids.length) return out;
  const { data, error } = await db.storage.from(PEOPLE_BUCKET).createSignedUrls(ids.map((id) => `${id}.jpg`), PHOTO_TTL);
  if (error) { console.error("photoUrls", error); return out; }
  for (const x of (data ?? []) as any[]) {
    const id = Number(String(x.path ?? "").replace(/\.jpg$/, ""));
    if (x.signedUrl && !x.error) out.set(id, x.signedUrl);
  }
  return out;
}

async function peopleSearch(ctx: Ctx, b: any) {
  const p = parseSearch(b);
  if (!p.ok) return { ok: false, error: p.error };
  const s = p.s;
  const source = await peopleSource();
  if (!source) return { ok: true, source: null, total: 0, page: 0, pageSize: PAGE_SIZE, rows: [] };
  const from = s.page * PAGE_SIZE;
  const { data, error, count } = await peopleFilter(db.from("church_people").select(PEOPLE_LIST_COLS, { count: "exact" }), s)
    .order("name_key", { ascending: true }).order("person_id", { ascending: true })
    .range(from, from + PAGE_SIZE - 1);
  if (error && (error as any).code !== "PGRST103") throw error;   // PGRST103 = 끝을 넘은 쪽 → 빈 쪽
  const rows = (error ? [] : data ?? []) as any[];
  const urls = await photoUrls(rows.filter((r) => r.has_photo).map((r) => r.person_id));
  await audit(ctx, "people.search", "", { q: norm(b.q).slice(0, 40), filters: searchDetail(s), total: count ?? 0, page: s.page });
  return { ok: true, source, total: count ?? 0, page: s.page, pageSize: PAGE_SIZE,
    rows: rows.map((r) => ({ ...r, photo: urls.get(r.person_id) ?? "" })) };
}

async function peoplePerson(ctx: Ctx, b: any) {
  const id = Number(b.id) || 0;
  if (!Number.isSafeInteger(id) || id <= 0) return { ok: false, error: "not-found" };
  const { data, error } = await db.from("church_people").select(PEOPLE_ALL_COLS).eq("person_id", id).maybeSingle();
  if (error) throw error;
  if (!data) return { ok: false, error: "not-found" };
  const urls = data.has_photo ? await photoUrls([id]) : new Map<number, string>();
  let family: any[] = [];
  if (data.household_id) {
    const { data: fam, error: e2 } = await db.from("church_people").select(FAMILY_COLS)
      .eq("household_id", data.household_id).neq("person_id", id).order("person_id", { ascending: true }).limit(50);
    if (e2) throw e2;
    family = fam ?? [];
  }
  await audit(ctx, "people.view", String(id), { name: data.name });
  return { ok: true, person: { ...data, photo: urls.get(id) ?? "" }, family };
}

async function peopleStats() {
  const source = await peopleSource();
  if (!source) return { ok: true, source: null, stats: null };
  const rows = await allRows(() => db.from("church_people")
    .select("mok1,mok3,kind2,kind3,position,school_dept,gender,age,has_photo,household_id").order("person_id", { ascending: true }));
  return { ok: true, source, stats: statsOf(rows) };
}

// 기록은 응답을 돌려주기 직전에 — 실패한 내려받기는 기록하지 않는다
async function peopleExport(ctx: Ctx, b: any) {
  const p = parseSearch({ ...b, page: 0 });
  if (!p.ok) return { ok: false, error: p.error };
  const source = await peopleSource();
  if (!source) return { ok: true, source: null, rows: [] };
  const rows = await allRows(() => peopleFilter(db.from("church_people").select(PEOPLE_ALL_COLS), p.s)
    .order("name_key", { ascending: true }).order("person_id", { ascending: true }));
  await audit(ctx, "people.export", "", { q: norm(b.q).slice(0, 40), filters: searchDetail(p.s), count: rows.length });
  return { ok: true, source, rows };
}
```

- [ ] **Step 6: `index.ts` switch** — `case "ministryPaperSave": …` 줄 **다음에**

```ts
      case "peopleSearch": return json(await peopleSearch(ctx, b));
      case "peoplePerson": return json(await peoplePerson(ctx, b));
      case "peopleStats":  return json(await peopleStats());
      case "peopleExport": return json(await peopleExport(ctx, b));
```

- [ ] **Step 7: 개발 서버 시험 — 사람·PROBE·권한 표**(`tests/server.dev.test.mjs`)
  - `PROBE` 끝에:

```js
  peopleSearch: { q: "ca-test-probe-없음" },
  peoplePerson: { id: 0 },
  peopleStats: {},
  peopleExport: { q: "ca-test-probe-없음" },
```

  - 파일 위 상수 모음(`const people = {};` 다음)에:

```js
// 교인명부(2026-09-29) 시험 자료 — 교인ID 990000001~ (가짜 명부 900001~ 와 겹치지 않게) · 끝나면 지운다
const PEOPLE_IDS = [990000001, 990000002];
const PHOTO_PATH = "church-people-photos/990000001.jpg";
let peopleImportId = null;
```

  - `before()` 첫 줄 `for (const k of ["none", "pending", "disabled", "ministry", "super"])` → `["none", "pending", "disabled", "ministry", "directory", "super"]`, 그리고 `await makeMember(people.ministry, …)` 다음 줄에 `await makeMember(people.directory, "active", ["directory"]);`
  - `before()` **끝**(`catalogRow = row0;` 다음)에:

```js
  // 교인명부 — 두 분(하나는 사진 있음) + 올린 기록 한 줄(명부 기준일이 있어야 교적 표시가 나온다) + 사진 한 장
  await rest("church_people", "POST", [
    { person_id: 990000001, name: "ca-test-min", name_key: "ca-test-min", mok1: "시험", mok2: "시험", mok3: "시험-0목장",
      mok_path: "시험 > 시험 > 시험-0목장", kind1: "교인", kind2: "장년", kind3: "출석교인", position: "집사",
      phone1: "010-0000-0000", phone_digits: "01000000000", address: "시험시 비밀주소 " + STAMP, has_photo: true, photo_hash: "t",
      household_id: 990000001, household_head: "ca-test-min", household_rel: "본인" },
    { person_id: 990000002, name: PAPER_NAME, name_key: PAPER_NAME, mok1: "시험", mok2: "시험", mok3: "시험-5목장",
      phone1: "010-1234-5678", phone_digits: "01012345678", has_photo: false,
      household_id: 990000001, household_head: "ca-test-min", household_rel: "아들1" },   // 두 분은 한 가족
  ]);
  const [imp] = await rest("church_people_imports", "POST",
    { source_date: "2000-01-01", total: 2, added: 2, changed: 0, removed: 0, photos: 1 });
  peopleImportId = imp.id;
  const up = await fetch(`${URL_}/storage/v1/object/${PHOTO_PATH}`, { method: "POST",
    headers: { ...svc, "Content-Type": "image/jpeg", "x-upsert": "true" }, body: new TextEncoder().encode("ca-test-photo") });
  assert.ok(up.ok, "시험 사진 올리기 실패: " + await up.text());
```

  - `after()` **끝**에:

```js
  // 교인명부 시험 자료
  await rest(`church_people?person_id=in.(${PEOPLE_IDS.join(",")})`, "DELETE");
  if (peopleImportId) await rest(`church_people_imports?id=eq.${peopleImportId}`, "DELETE");
  await fetch(`${URL_}/storage/v1/object/church-people-photos`, { method: "DELETE", headers: svc,
    body: JSON.stringify({ prefixes: ["990000001.jpg"] }) });
```

  - `권한 표` 시험의 `want` 와 사람 목록:

```js
  const want = (who, role) => ({
    none: "not-registered", pending: "pending", disabled: "disabled",
    ministry: role === "ministry" ? null : "forbidden",
    directory: role === "directory" ? null : "forbidden",
    super: null,
  })[who];
```
    그리고 `for (const who of ["none", "pending", "disabled", "ministry", "super"])` → `["none", "pending", "disabled", "ministry", "directory", "super"]`.

- [ ] **Step 8: 개발 서버 시험 — 새 시험 둘**(파일 끝에)

```js
test("교인명부: 찾기(이름·전화 뒷자리·사진 없음) · 한 분 · 현황 · 내려받기 · 사진 주소 · 열람 기록은 따로", async () => {
  const d = people.directory.token;
  const s = await call(d, "peopleSearch", { q: "ca-test-min" });
  assert.equal(s.body.ok, true, JSON.stringify(s.body));
  assert.equal(s.body.source.source_date, "2000-01-01");
  assert.equal(s.body.pageSize, 50);
  const row = s.body.rows.find((x) => x.person_id === 990000001);
  assert.ok(row, JSON.stringify(s.body));
  assert.deepEqual(Object.keys(row).sort(),
    ["age", "gender", "has_photo", "household_id", "household_rel", "kind2", "mok1", "mok3", "name", "person_id", "phone1",
     "photo", "position", "school_dept"]);
  assert.match(row.photo, /\/storage\/v1\/object\/sign\/church-people-photos\/990000001\.jpg\?token=/);
  assert.equal((await fetch(row.photo)).status, 200, "서명 주소로 사진이 열려야 한다");
  const t = await call(d, "peopleSearch", { q: "0000", mok1: "시험" });
  assert.ok(t.body.rows.some((x) => x.person_id === 990000001), "전화 뒷자리로 찾기");
  const np = await call(d, "peopleSearch", { q: PAPER_NAME, noPhoto: true });
  assert.deepEqual(np.body.rows.map((x) => x.person_id), [990000002]);
  assert.equal((await call(d, "peopleSearch", { page: -1 })).body.error, "invalid");
  // 가족 보기 — 세대주 교인ID 로 한 가족만
  const fam = await call(d, "peopleSearch", { household: 990000001 });
  assert.deepEqual(fam.body.rows.map((x) => x.person_id).sort(), [990000001, 990000002]);
  assert.equal((await call(d, "peopleSearch", { household: "x" })).body.error, "invalid");

  const one = await call(d, "peoplePerson", { id: 990000001 });
  assert.equal(one.body.ok, true, JSON.stringify(one.body));
  assert.equal(one.body.person.address, "시험시 비밀주소 " + STAMP);
  assert.equal(one.body.person.household_id, 990000001);
  assert.deepEqual(one.body.family.map((f) => f.person_id), [990000002]);          // 자기는 빼고
  assert.deepEqual(Object.keys(one.body.family[0]).sort(), ["age", "gender", "household_rel", "name", "person_id", "position"]);
  for (const k of ["name_key", "phone_digits", "photo_hash", "birth_date", "registered_date", "updated_at"]) {
    assert.equal(k in one.body.person, false, "내부 칸이 나갔다: " + k);
  }
  assert.equal((await call(d, "peoplePerson", { id: 1 })).body.error, "not-found");

  const st = await call(d, "peopleStats");
  assert.equal(st.body.ok, true, JSON.stringify(st.body));
  assert.ok(st.body.stats.total >= 2);
  assert.ok(st.body.stats.households >= 1);
  assert.ok(st.body.stats.options.mok1.includes("시험"));

  const ex = await call(d, "peopleExport", { q: "ca-test-min" });
  assert.deepEqual(ex.body.rows.map((x) => x.person_id), [990000001]);

  const logs = (await call(people.super.token, "auditList", { limit: 40, kind: "people" })).body.rows.map((r) => r.action);
  for (const a of ["people.search", "people.view", "people.export"]) assert.ok(logs.includes(a), a + " " + JSON.stringify(logs));
  const changes = (await call(people.super.token, "auditList", { limit: 100 })).body.rows.map((r) => r.action);
  assert.ok(!changes.some((a) => a.startsWith("people.")), "바꾼 기록 기본 보기에 열람이 섞였다");
});

test("교인명부 표·사진은 공개 키·로그인 사용자 모두 못 연다", async () => {
  for (const t of ["church_people", "church_people_imports"]) {
    const a = await fetch(`${URL_}/rest/v1/${t}?select=*&limit=1`, { headers: { apikey: ANON } });
    assert.notEqual(a.status, 200, "공개 키로 열림: " + t);
    const b = await fetch(`${URL_}/rest/v1/${t}?select=*&limit=1`,
      { headers: { apikey: ANON, Authorization: "Bearer " + people.super.token } });
    assert.notEqual(b.status, 200, "로그인 사용자로 열림: " + t);
  }
  const pub = await fetch(`${URL_}/storage/v1/object/public/${PHOTO_PATH}`);
  assert.notEqual(pub.status, 200, "공개 주소로 사진이 열림");
  const au = await fetch(`${URL_}/storage/v1/object/authenticated/${PHOTO_PATH}`,
    { headers: { apikey: ANON, Authorization: "Bearer " + people.super.token } });
  assert.notEqual(au.status, 200, "로그인 사용자로 사진이 열림");
  const sign = await fetch(`${URL_}/storage/v1/object/sign/${PHOTO_PATH}`, { method: "POST",
    headers: { apikey: ANON, Authorization: "Bearer " + people.super.token, "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn: 60 }) });
  assert.notEqual(sign.status, 200, "로그인 사용자가 서명 주소를 만듦");
});
```

- [ ] **Step 9: preflight · 커밋 · 개발 배포 · 개발 시험**

```bash
python tools/preflight.py
git add supabase/functions/church-admin/authz.ts supabase/functions/church-admin/index.ts tests/authz.test.mjs tests/server.dev.test.mjs
git commit -m "feat(교인명부): 서버 액션 넷(찾기·한 분·현황·내려받기) · 열람 기록 · 바꾼 기록과 따로 보기"
git status            # 깨끗해야 한다(배포는 작업 트리를 올린다)
supabase functions deploy church-admin --no-verify-jwt --project-ref ktpwthwqzgcqcrmsafdo
set -a; . ~/.church-admin/dev.env; set +a
node --experimental-strip-types --test tests/server.dev.test.mjs
```
Expected: 모든 시험 통과(새 둘 포함). 실패하면 고치고 **새 커밋**으로.

---

### Task 6: 서버 — 사역 화면의 교적 표시

**Files:**
- Modify: `supabase/functions/church-admin/index.ts`, `tests/server.dev.test.mjs`

**Interfaces:**
- Consumes: Task 3 `applicantFromWho`·`applicantFromPaper`·`churchFor`·`lookupKeys`·`toCand`·`type Cand`, Task 5 `peopleSource()`
- Produces: `ministryList` 의 `list[i].church` · `ministryPaperCheck/Save` 의 `rows[i].church` — 모두 `{state, reason} | null`.

- [ ] **Step 1: 실패하는 개발 시험** — `tests/server.dev.test.mjs` 의 「신청 현황: …」 시험 **다음에**(그 시험이 남긴 줄 하나를 쓴다):

```js
test("사역 화면의 교적 표시: 두 칸만 · 교적 값은 싣지 않는다 · 맞음/확인 필요/없음", async () => {
  const m = people.ministry.token;
  const list = await call(m, "ministryList");
  assert.equal(list.body.ok, true, JSON.stringify(list.body));
  const mine = list.body.list.filter((x) => x.name === "ca-test-min");
  assert.ok(mine.length >= 1);
  for (const x of mine) assert.deepEqual(x.church, { state: "맞음", reason: "" });
  assert.ok(!JSON.stringify(list.body).includes("비밀주소"), "교적 주소가 사역 응답에 실렸다");

  const row = (name) => ({ gu: "시험", mok: "0", name, position: "집사", phone: "010-1234-5678", team: "없는팀-" + STAMP });
  const chk = await call(m, "ministryPaperCheck", { rows: [row(PAPER_NAME), row("ca-test-nobody-" + STAMP)] });
  assert.equal(chk.body.ok, true, JSON.stringify(chk.body));
  assert.deepEqual(chk.body.rows[0].church, { state: "확인 필요", reason: "소속 다름" });   // 명부는 시험-5목장, 전화가 같다
  assert.deepEqual(chk.body.rows[1].church, { state: "없음", reason: "" });
});
```

Run(개발 함수는 아직 옛 판): `node --experimental-strip-types --test tests/server.dev.test.mjs` → 이 시험 FAIL(`church` 없음)

- [ ] **Step 2: `index.ts` import** — Task 5 에서 더한 `people-query.ts` import 줄 **위에**:

```ts
import { applicantFromPaper, applicantFromWho, churchFor, lookupKeys, toCand, type Cand } from "./people-match.ts";
```

- [ ] **Step 3: `index.ts` — 명부에서 이름으로 후보 묶기.** Task 5 의 `peopleSource()` **다음에**:

```ts
// 사역신청 줄을 교적과 맞댄다 — 명부가 한 번도 안 올라왔으면 null(화면이 표시를 아예 그리지 않는다).
// 신청자 이름으로만 묻는다(200개씩) — 8,672명 전체를 읽지 않게.
async function churchLookup(names: unknown[]): Promise<Map<string, Cand[]> | null> {
  if (!(await peopleSource())) return null;
  const keys = lookupKeys(names);
  const out = new Map<string, Cand[]>();
  for (let i = 0; i < keys.length; i += 200) {
    const { data, error } = await db.from("church_people").select("name_key,mok1,mok3,school_dept,phone_digits")
      .in("name_key", keys.slice(i, i + 200));
    if (error) throw error;
    for (const r of (data ?? []) as any[]) {
      if (!out.has(r.name_key)) out.set(r.name_key, []);
      out.get(r.name_key)!.push(toCand(r));
    }
  }
  return out;
}
```
  ⚠️ `peopleSource` 는 Task 5 에서 `Deno.serve` 앞에 두었다. `ministryList`·`ministryPaper` 는 그보다 **위**에 있지만 함수 선언은 끌어올려지니(호출 시점에 정의됨) 순서는 상관없다.

- [ ] **Step 4: `ministryList` 에 붙이기.** `return {` (ok·year·list 를 돌려주는 곳) **바로 앞**에:

```ts
  // 교적 표시(교인명부 · 2026-09-29) — { state, reason } 만. 교적 값은 싣지 않는다.
  const churchIdx = await churchLookup(rows.map((r) => r.name || umap.get(r.user_id)?.name || ""));
```
  그리고 `list: rows.map((r) => { … return { … phone: r.phone ?? "", source: … }; })` 의 돌려주는 객체 **마지막 칸 다음에** 한 칸:

```ts
        church: churchFor(churchIdx, applicantFromWho(r.name || u?.name || "", r.who || uWho, r.phone ?? "")),
```

- [ ] **Step 5: `ministryPaper` 에 붙이기.** `const rows = raws.map((r: any, i: number) => ministryPaperOne(r, i));` **다음 줄에**:

```ts
  // 교적 표시(교인명부 · 2026-09-29) — 오류 줄에도 붙인다(이름·소속을 고칠 때 도움이 된다). 교적 값은 싣지 않는다.
  const churchIdx = await churchLookup(rows.map((r: any) => r.name));
  for (const r of rows) r.church = churchFor(churchIdx, applicantFromPaper(r));
```

- [ ] **Step 6: preflight · 커밋 · 개발 배포 · 개발 시험**

```bash
python tools/preflight.py
git add supabase/functions/church-admin/index.ts tests/server.dev.test.mjs
git commit -m "feat(교인명부): 사역 신청 현황·종이 명단 줄마다 교적 표시(맞음·확인 필요·없음) — 교적 값은 싣지 않음"
git status
supabase functions deploy church-admin --no-verify-jwt --project-ref ktpwthwqzgcqcrmsafdo
set -a; . ~/.church-admin/dev.env; set +a
node --experimental-strip-types --test tests/server.dev.test.mjs
```
Expected: 모든 시험 통과.

---

### Task 7: 풀기 · 사진 받기 스크립트 — 진짜 명단으로 로컬에서만 확인

**Files:**
- Create: `tools/people/parse_people.py`, `tools/people/fetch_photos.py`

**Interfaces:**
- Produces(작업 폴더 `C:\Projects\교인명부_작업\<기준일>\` — 저장소 밖):
  - `people.json` = `{ "meta": {"source_date","fake": false,"source_file","count"}, "people": [ {person_id, name, position, position_detail, gender, birth, birth_date, lunar, age, spouse, spouse_position, household_head, household_rel, household_id, kind1, kind2, kind3, registered, registered_date, reg_type, phone1, phone2, guide, email, mok_path, mok1, mok2, mok3, mok_leader, school_path, school_dept, teacher, youth_path, mission, address, address_jibun, name_key, phone_digits} ] }`
  - `photo_urls.json` = `{ "<교인ID>": "<dimode 사진 주소>" }`
  - `photos/<교인ID>.jpg` · `photos.json` = `{ "<교인ID>": {"hash": md5, "mime": "image/jpeg"} | null }` (null = 기본 그림)

- [ ] **Step 1: `tools/people/parse_people.py`**

```python
# -*- coding: utf-8 -*-
"""교인명부 ① 풀기 (2026-09-29) — dimode 교인목록(이름은 .xls 지만 속은 HTML 표)을 DB 모양 JSON 으로.

  python tools/people/parse_people.py "C:/Projects/교인목록_2026_09_29.xls" --date 2026-09-29

쓰는 곳(저장소 밖): C:/Projects/교인명부_작업/<기준일>/people.json · photo_urls.json
⚠️ 원본 값 칸의 낱말을 하나도 빠뜨리지 않았는지 대조하고(빠짐 0), 빠지면 파일을 쓰지 않고 멈춘다 — 표 모양이 바뀐 것이다.
⚠️ 기타사항·최종수정일·최종심방일·dimode 사진 주소는 DB 에 올리지 않는다(설계 0장). 사진 주소는 photo_urls.json 에만.
⚠️ 교회학교 소속이 없는 분의 「교사」는 비운다 — 내보내기 프로그램이 모두에게 같은 한 사람을 찍는다(2026-09-29 확인).
⚠️ 「청년 리더」는 2026-09-29 에 8,672명 모두 비어 있어 칸을 두지 않았다. 값이 생기면 멈춘다 — 칸을 더할지 정할 것.
"""
import argparse, collections, datetime, json, os, re, sys, unicodedata
import lxml.html

sys.stdout.reconfigure(encoding="utf-8")
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WORK_ROOT = r"C:\Projects\교인명부_작업"


def one(s):
    return re.sub(r"\s+", " ", (s or "").replace("\xa0", " ")).strip()


def lines(el):
    return [one(x) for x in el.text_content().replace("\xa0", " ").split("\n") if one(x)]


def path_of(s):
    return [one(x) for x in one(s).split(">")] if one(s) else []


def shape(x):
    x = re.sub(r"[0-9]", "9", str(x))
    x = re.sub(r"[가-힣]", "가", x)
    return re.sub(r"[A-Za-z]", "a", x)


def records(html):
    """교인 한 분 = (원본 조각, 그 조각의 표)"""
    for p in re.split(r'<tr class="defaultDataTR1"\s*>', html)[1:]:
        yield p, lxml.html.fromstring("<table><tr>" + p + "</tr></table>")


def cells(doc):
    """칸 이름 → 값 칸(td). 「리더」는 앞 칸 이름을 붙여 가른다(목장 리더·청년 리더). 이름 없는 초록 칸은 지번주소."""
    tbl = doc.xpath('.//table[contains(@class,"tablelineno")]')[0]
    d, last, prev = {}, None, None
    for td in tbl.xpath(".//td"):
        cls = td.get("class") or ""
        if "tdtitle4" in cls:
            lab = one(td.text_content())
            if "기타사항" in lab:          # 값이 칸 안이 아니라 title 에 있다 — 올리지 않는다
                last = None
                continue
            if lab == "리더":
                lab = f"{prev} 리더"
            else:
                prev = lab
            last = lab
        elif "tddataListPic" in cls:
            d[last if last else "지번주소"] = td
            last = None
    return tbl, d


def parse_one(p, doc):
    r = {}
    m = re.search(r"RigthPerosonModify\((?:&#39;|')(\d+)", p)
    if not m:
        sys.exit("교인ID 를 못 찾았다 — 표 모양이 바뀌었다")
    r["교인ID"] = int(m.group(1))
    img = doc.xpath('.//img[contains(@id,"_imgP")]')
    r["사진주소"] = img[0].get("src", "") if img else ""
    _, d = cells(doc)

    td = d["이름 (직분)"]
    nm = td.xpath('.//span[contains(@class,"nameCvname")]/span')
    r["이름"] = one(nm[0].text_content()) if nm else ""
    full = one(td.text_content())
    tail = full[len(r["이름"]):] if full.startswith(r["이름"]) else full
    m = re.match(r"\s*\((.*?)\)\s*(.*)$", tail)
    jik, r["성별"] = (m.group(1), one(m.group(2))) if m else ("", one(tail))
    jp = one(jik).split(" ", 1)
    r["직분"] = jp[0]
    r["직분상세"] = jp[1] if len(jp) > 1 else ""

    td = d["생년월일 (나이)"]
    sp = td.xpath("./span")
    r["생년월일"] = one(sp[0].text_content()) if sp else ""
    t = one(td.text_content())
    m = re.search(r"([양음?])\s*\(", t)
    r["양음력"] = m.group(1) if m else ""
    m = re.search(r"\((-?[\d.]+)세\)", t)
    r["나이"] = (float(m.group(1)) if "." in m.group(1) else int(m.group(1))) if m else ""

    ln = lines(d["배우자"])
    r["배우자"] = ln[0] if ln else ""
    r["배우자직분"] = " ".join(ln[1:])

    td = d["신앙세대주"]
    li = td.xpath('.//div[@class="labelInfo"]')
    r["신앙세대주"] = one(li[0].text_content()) if li else ""
    fl = td.xpath('./div[@style="float:left"]')
    r["세대주관계"] = re.sub(r"^의\s*", "", one(fl[1].text_content()) if len(fl) > 1 else "")
    # 세대주의 교인ID — 이름 위에 마우스를 올리면 뜨는 창의 번호(PersonMiniViewJs('36580',…)).
    # 2026-09-29 대조: 관계가 「본인」인 4,334명 중 4,274명이 자기 교인ID 와 같다 → 같은 번호 체계. 가족 묶기에 쓴다.
    m = re.search(r"PersonMiniViewJs\('(\d+)'", lxml.html.tostring(td, encoding="unicode"))
    r["세대주ID"] = int(m.group(1)) if m else ""

    ks = [one(x.text_content()) for x in d["교인구분"].xpath("./span")] + ["", "", ""]
    r["교인구분1"], r["교인구분2"], r["교인구분3"] = ks[:3]

    td = d["등록일"]
    sp = td.xpath("./span")
    r["등록일"] = one(sp[0].text_content()) if sp else ""
    m = re.search(r"\(([^)]*)\)", one(td.text_content()))
    r["등록구분"] = one(m.group(1)) if m else ""

    td = d["연락처"]
    sp = td.xpath("./span")
    r["연락처1"] = one(sp[0].text_content()) if sp else ""
    t = one(td.text_content())
    rest = t[len(r["연락처1"]):] if t.startswith(r["연락처1"]) else t
    r["연락처2"] = one(re.sub(r"^\s*,", "", rest))

    r["인도자"] = ", ".join(lines(d["인도자"]))
    r["이메일"] = re.sub(r"\s*@\s*", "@", one(d["이메일"].text_content()))

    mk = path_of(d["목장"].text_content())
    r["목장(전체)"] = " > ".join(mk)
    r["목장1"], r["목장2"], r["목장3"] = (mk + ["", "", ""])[:3]
    r["목장리더"] = ", ".join(lines(d["목장 리더"]))

    sc = path_of(d["교회학교"].text_content())
    r["교회학교(전체)"] = " > ".join(sc)
    r["교회학교부서"] = sc[1] if len(sc) > 1 else ""
    r["교사"] = ", ".join(lines(d["교사"])) if sc else ""

    r["청년(전체)"] = " > ".join(path_of(d["청년"].text_content()))
    youth_leader = ", ".join(lines(d["청년 리더"]))
    if youth_leader:
        sys.exit(f"교인ID {r['교인ID']} 의 「청년 리더」에 값이 생겼다 — DB 칸을 더할지 정한 뒤 이 스크립트를 고칠 것")
    r["선교회"] = ", ".join(lines(d["선교회"]))
    r["주소"] = one(d["주소"].text_content())
    r["지번주소"] = one(d["지번주소"].text_content()) if "지번주소" in d else ""
    # 대조용으로만 읽는다(올리지 않는다)
    r["최종수정일"] = one(d["최종수정일"].text_content())
    r["최종심방일"] = one(d["최종심방일"].text_content())
    return r


def coverage(doc, rec):
    """원본 값 칸의 낱말이 rec 어딘가에 다 있나 — (대조한 수, 못 찾은 것 Counter)"""
    def cellstr(v):
        return str(int(v)) if isinstance(v, float) and v.is_integer() else str(v if v is not None else "")
    toks, parts = set(), []
    for v in rec.values():
        s = cellstr(v)
        parts.append(s)
        toks.update(t for t in re.split(r"[\s(),>]+", s) if t)
    hay = " ".join(parts)
    tbl, _ = cells(doc)
    total, miss = 0, collections.Counter()
    for td in tbl.xpath('.//td[contains(@class,"tddataListPic")]'):
        pv = td.getprevious()
        lab = one(pv.text_content()) if pv is not None else "(지번)"
        if lab == "교사" and not rec["교회학교(전체)"]:
            continue                      # 일부러 비운 자리
        for w in re.split(r"[\s(),>]+", td.text_content().replace("\xa0", " ")):
            if not w or w == "의":
                continue
            if re.fullmatch(r"-?[\d.]*세", w):
                w = w[:-1]
            if not w:
                continue
            total += 1
            if w not in toks and w not in hay:
                miss[(lab, shape(w))] += 1
    return total, miss


def iso_date(s):
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", s or ""):
        try:
            return datetime.date(*map(int, s.split("-"))).isoformat()
        except ValueError:
            return None
    return None


def to_db(r):
    phones = [re.sub(r"\D", "", x) for x in (r["연락처1"], r["연락처2"])]
    return {
        "person_id": r["교인ID"], "name": r["이름"], "position": r["직분"], "position_detail": r["직분상세"],
        "gender": r["성별"], "birth": r["생년월일"], "birth_date": iso_date(r["생년월일"]), "lunar": r["양음력"],
        "age": None if r["나이"] == "" else r["나이"],
        "spouse": r["배우자"], "spouse_position": r["배우자직분"],
        "household_head": r["신앙세대주"], "household_rel": r["세대주관계"], "household_id": r["세대주ID"] or None,
        "kind1": r["교인구분1"], "kind2": r["교인구분2"], "kind3": r["교인구분3"],
        "registered": r["등록일"], "registered_date": iso_date(r["등록일"]), "reg_type": r["등록구분"],
        "phone1": r["연락처1"], "phone2": r["연락처2"], "guide": r["인도자"], "email": r["이메일"],
        "mok_path": r["목장(전체)"], "mok1": r["목장1"], "mok2": r["목장2"], "mok3": r["목장3"], "mok_leader": r["목장리더"],
        "school_path": r["교회학교(전체)"], "school_dept": r["교회학교부서"], "teacher": r["교사"],
        "youth_path": r["청년(전체)"], "mission": r["선교회"], "address": r["주소"], "address_jibun": r["지번주소"],
        "name_key": re.sub(r"\s+", "", unicodedata.normalize("NFC", r["이름"])),
        "phone_digits": " ".join(p for p in phones if p),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("--date", required=True, help="명단 기준일 YYYY-MM-DD (dimode 에서 내려받은 날)")
    a = ap.parse_args()
    datetime.date.fromisoformat(a.date)
    work = os.path.abspath(os.path.join(WORK_ROOT, a.date))
    try:
        inside = os.path.commonpath([work, REPO]) == REPO
    except ValueError:
        inside = False
    if inside:
        sys.exit("작업 폴더가 저장소 안이다 — 멈춘다")
    html = open(a.src, encoding="utf-8", errors="replace").read()
    recs, total, missing = [], 0, collections.Counter()
    for p, doc in records(html):
        rec = parse_one(p, doc)
        t, miss = coverage(doc, rec)
        total += t
        missing.update(miss)
        recs.append(rec)
    ids = [r["교인ID"] for r in recs]
    if not recs or len(set(ids)) != len(ids):
        sys.exit(f"교인 {len(recs)}명 · 교인ID 겹침 {len(ids) - len(set(ids))} — 멈춘다")
    print(f"교인 {len(recs)}명 · 대조한 낱말 {total} · 못 찾은 낱말 {sum(missing.values())}")
    if missing:
        for k, n in missing.most_common(20):
            print(f"   {n:5d} {k}")
        sys.exit("원본 낱말이 빠졌다 — 파일을 쓰지 않고 멈춘다")
    os.makedirs(work, exist_ok=True)
    people = [to_db(r) for r in recs]
    meta = {"source_date": a.date, "fake": False, "source_file": os.path.basename(a.src), "count": len(people)}
    with open(os.path.join(work, "people.json"), "w", encoding="utf-8") as f:
        json.dump({"meta": meta, "people": people}, f, ensure_ascii=False)
    with open(os.path.join(work, "photo_urls.json"), "w", encoding="utf-8") as f:
        json.dump({str(r["교인ID"]): r["사진주소"] for r in recs if r["사진주소"]}, f, ensure_ascii=False)
    print("썼다:", work)


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: 진짜 명단으로 돌린다(로컬 · DB 안 건드림)**

Run: `python tools/people/parse_people.py "C:/Projects/교인목록_2026_09_29.xls" --date 2026-09-29`
Expected: `교인 8672명 · 대조한 낱말 210899 · 못 찾은 낱말 0` · `썼다: C:\Projects\교인명부_작업\2026-09-29`
(2026-09-29 에 같은 규칙으로 쟀던 수다. 조금 다르면 괜찮지만 **못 찾은 낱말은 0 이어야** 한다.)
  - 가족 번호 확인(수만): `python -c "import json;p=json.load(open(r'C:/Projects/교인명부_작업/2026-09-29/people.json',encoding='utf-8'))['people'];print(sum(1 for x in p if x['household_id']), len({x['household_id'] for x in p if x['household_id']}))"`
    → `8672 5388`(모두 세대주 번호가 있고 5,388가구)
⚠️ 결과의 **이름·번호를 화면에 찍지 않는다** — 수만 본다.

- [ ] **Step 3: `tools/people/fetch_photos.py`**

```python
# -*- coding: utf-8 -*-
"""교인명부 ② 사진 받기 (2026-09-29)

  python tools/people/fetch_photos.py --date 2026-09-29 [--seed "C:/Projects/교인사진_2026_09_29"]

photo_urls.json 의 주소에서 사진을 받아 <작업 폴더>/photos/<교인ID>.jpg 로 둔다(이어 받기 — 이미 있으면 건너뜀).
--seed 폴더에 같은 이름 파일이 있으면 받지 않고 복사한다(2026-09-29 에 받아 둔 것 · 기본 그림 하위 폴더까지 본다).
끝나면 dimode 기본 그림(「사진 없음」)을 골라 photos.json 을 쓴다: { "<교인ID>": {"hash","mime"} | null }
⚠️ dimode 서버에 부담이 가지 않게 동시에 3장 · 한 장마다 0.15초 쉰다.
⚠️ 하나라도 못 받으면 photos.json 을 쓰지 않는다 — 다시 돌리면 못 받은 것만 받는다.
"""
import argparse, collections, hashlib, json, os, shutil, sys, threading, time, urllib.request
from concurrent.futures import ThreadPoolExecutor

sys.stdout.reconfigure(encoding="utf-8")
WORK_ROOT = r"C:\Projects\교인명부_작업"
SEED_SUB = "_사진없음(기본그림)"
# dimode 기본 그림(회색 바탕 흰 사람 모양) — 2026-09-29 확인. 같은 그림이 100장 넘게 나와도 기본 그림으로 본다.
KNOWN_PLACEHOLDERS = {"cb677f32be4ed3a756afaec1c16b5edd"}
PLACEHOLDER_MIN = 100


def mime_of(b):
    if b[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if b[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if b[:4] == b"GIF8":
        return "image/gif"
    if b[:4] == b"RIFF" and b[8:12] == b"WEBP":
        return "image/webp"
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", required=True)
    ap.add_argument("--seed", default="")
    a = ap.parse_args()
    work = os.path.join(WORK_ROOT, a.date)
    out = os.path.join(work, "photos")
    os.makedirs(out, exist_ok=True)
    with open(os.path.join(work, "photo_urls.json"), encoding="utf-8") as f:
        urls = json.load(f)
    lock, st, fails = threading.Lock(), collections.Counter(), []

    def get(item):
        pid, url = item
        dst = os.path.join(out, f"{pid}.jpg")
        if os.path.exists(dst) and os.path.getsize(dst) > 0:
            with lock:
                st["skip"] += 1
            return
        if a.seed:
            for src in (os.path.join(a.seed, f"{pid}.jpg"), os.path.join(a.seed, SEED_SUB, f"{pid}.jpg")):
                if os.path.exists(src):
                    shutil.copyfile(src, dst)
                    with lock:
                        st["seed"] += 1
                    return
        last = ""
        for attempt in range(3):
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
                with urllib.request.urlopen(req, timeout=30) as r:
                    b = r.read()
                if not mime_of(b):
                    last = f"그림 아님({len(b)}B)"
                    break
                tmp = dst + ".part"
                with open(tmp, "wb") as f:
                    f.write(b)
                os.replace(tmp, dst)
                with lock:
                    st["ok"] += 1
                time.sleep(0.15)
                return
            except Exception as ex:
                last = type(ex).__name__
                time.sleep(2 * (attempt + 1))
        with lock:
            fails.append(f"{pid}\t{last}")

    t0 = time.time()
    with ThreadPoolExecutor(max_workers=3) as ex:
        for i, _ in enumerate(ex.map(get, urls.items()), 1):
            if i % 500 == 0:
                print(f"{i}/{len(urls)} 받음 {st['ok']} 복사 {st['seed']} 건너뜀 {st['skip']} 실패 {len(fails)} · {time.time() - t0:.0f}초", flush=True)
    print(f"끝: 받음 {st['ok']} · 복사 {st['seed']} · 건너뜀 {st['skip']} · 실패 {len(fails)}")
    if fails:
        with open(os.path.join(work, "photo_fails.txt"), "w", encoding="utf-8") as f:
            f.write("\n".join(fails))
        sys.exit("못 받은 사진이 있다 — photo_fails.txt · 다시 돌리면 그것만 받는다")
    info = {}
    for pid in urls:
        with open(os.path.join(out, f"{pid}.jpg"), "rb") as f:
            b = f.read()
        info[pid] = {"hash": hashlib.md5(b).hexdigest(), "mime": mime_of(b) or "image/jpeg"}
    cnt = collections.Counter(v["hash"] for v in info.values())
    ph = KNOWN_PLACEHOLDERS | {h for h, n in cnt.items() if n >= PLACEHOLDER_MIN}
    photos = {pid: (None if v["hash"] in ph else v) for pid, v in info.items()}
    with open(os.path.join(work, "photos.json"), "w", encoding="utf-8") as f:
        json.dump(photos, f)
    real = sum(1 for v in photos.values() if v)
    print(f"실제 사진 {real} · 기본 그림 {len(photos) - real}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: 받아 둔 사진으로 돌린다(네트워크 거의 안 씀)**

Run: `python tools/people/fetch_photos.py --date 2026-09-29 --seed "C:/Projects/교인사진_2026_09_29"`
Expected: `복사 8672` · `실패 0` · `실제 사진 4645 · 기본 그림 4027`

- [ ] **Step 5: 저장소에 명단이 없는지 본다 → 커밋**

```bash
git status --short            # tools/people/*.py 두 개만 보여야 한다(작업 폴더는 저장소 밖)
python tools/preflight.py
git add tools/people/parse_people.py tools/people/fetch_photos.py
git commit -m "feat(교인명부): 올리기 ①풀기(원본 낱말 대조) · ②사진 받기(기본 그림 골라내기) 스크립트"
```

---

### Task 8: 가짜 명부 · 살펴보기/넣기 스크립트 — 개발 DB 에서 한 바퀴

**Files:**
- Create: `tools/people/fake_people.py`, `tools/people/load_people.py`

**Interfaces:**
- Consumes: Task 7 의 `people.json`·`photos.json`·`photos/` 모양, Task 2 의 표·칸
- Produces: `python tools/people/load_people.py --work <폴더> --target dev|prod [--apply] [--allow-drop]` — 종료 코드 0(성공·살펴보기) · 2(5% 멈춤) · 1(오류)

- [ ] **Step 1: `tools/people/fake_people.py`**

```python
# -*- coding: utf-8 -*-
"""교인명부 — 개발 DB 용 가짜 명부 (2026-09-29). 진짜 명단은 개발에 넣지 않는다(설계 1장).

  python tools/people/fake_people.py              # 1판: 100명 · 사진 33장
  python tools/people/fake_people.py --variant 2  # 2판: 3명 빠짐 · 5명 직분 바뀜 · 2명 새로 · 사진 1장 바뀜
  python tools/people/fake_people.py --variant 3  # 3판: 10명 빠짐(5% 멈춤 시험 — 넣지 않는다)

쓰는 곳: C:/Projects/교인명부_작업/fake/ — meta.fake = true 라 운영에는 못 넣는다(load_people.py 가 거절).
"""
import argparse, datetime, hashlib, json, os, random, shutil, sys
from PIL import Image

sys.stdout.reconfigure(encoding="utf-8")
WORK = os.path.join(r"C:\Projects\교인명부_작업", "fake")
SURNAMES = "김이박최정강조윤장임한오서신권황안송류홍"
GIVEN = ["하늘", "바다", "가람", "나래", "다온", "라온", "마루", "보람", "새봄", "아라",
         "우람", "이슬", "초롱", "한결", "해솔", "누리", "도담", "미르", "별하", "온유"]
GU = ["믿음", "소망", "사랑", "섬김", "은혜", "화평", "기쁨"]
POS = [("집사", "서리집사"), ("권사", "시무권사"), ("안수집사", "시무안수집사"), ("장로", "시무장로"), ("성도", ""), ("", "")]
KIND3 = ["출석교인", "관리교인", "가끔교인"]
DEPTS = ["고등부", "중등부", "유년1부"]


def blank(pid):
    keys = ["name", "position", "position_detail", "gender", "birth", "lunar", "spouse", "spouse_position",
            "household_head", "household_rel", "kind1", "kind2", "kind3", "registered", "reg_type", "phone1", "phone2",
            "guide", "email", "mok_path", "mok1", "mok2", "mok3", "mok_leader", "school_path", "school_dept", "teacher",
            "youth_path", "mission", "address", "address_jibun", "name_key", "phone_digits"]
    r = {k: "" for k in keys}
    r.update({"person_id": pid, "birth_date": None, "registered_date": None, "age": None, "household_id": None})
    return r


def name_of(i):
    # ⚠️ 사람마다 따로 뽑는다 — 한 줄기로 이어 뽑으면 2판에서 몇 명만 빠져도 뒤의 모두가 「바뀜」이 된다
    if i in (5, 12):
        return "김하늘"          # 5·12 는 같은 이름(확인 필요 시험)
    rnd = random.Random(f"name-{i}")
    return rnd.choice(SURNAMES) + rnd.choice(GIVEN)


def person(i):
    rnd = random.Random(f"fake-{i}")
    r = blank(900000 + i)
    r["name"] = name_of(i)
    r["gender"] = "남" if i % 2 else "여"
    r["kind1"] = "교인"
    # 가족 — 1~60 은 셋씩 한 가족(첫 분이 세대주), 나머지는 혼자 세대주
    head = i - (i - 1) % 3 if i <= 60 else i
    r["household_id"] = 900000 + head
    r["household_head"] = name_of(head)
    r["household_rel"] = ["본인", "처", "아들1"][(i - 1) % 3] if i <= 60 else "본인"
    if i <= 70:
        gu, n = GU[head % 7], 1 + head % 12      # 가족은 같은 목장
        r.update(mok1=gu, mok2=gu, mok3=f"{gu}-{n:02d}목장", mok_path=f"{gu} > {gu} > {gu}-{n:02d}목장",
                 kind2="장년", kind3=KIND3[i % 3])
        r["position"], r["position_detail"] = POS[i % len(POS)]
        age = rnd.randint(30, 85)
    elif i <= 80:
        r.update(mok1="새가족", mok2="2026", mok3=f"{1 + i % 9}월", mok_path=f"새가족 > 2026 > {1 + i % 9}월",
                 kind2="장년", kind3="출석교인")
        age = rnd.randint(25, 70)
    elif i <= 90:
        r.update(mok1="청년부", mok2="청년1", mok3=f"청년-{i % 5 + 1:02d}", mok_path=f"청년부 > 청년1 > 청년-{i % 5 + 1:02d}",
                 kind2="청년", kind3="청년출석", youth_path="청년부 > 청년1부")
        age = rnd.randint(20, 34)
    else:
        dept = DEPTS[i % 3]
        r.update(school_dept=dept, school_path=f"교육위원회 > {dept} > 1학년 > 1반", teacher="시험교사(010-0000-9999)",
                 kind2="교회학교", kind3="출석교인")
        age = rnd.randint(8, 18)
    r["age"] = age
    r["birth"] = r["birth_date"] = f"{2026 - age}-03-15"
    r["lunar"] = "양"
    r["registered"] = r["registered_date"] = f"{2010 + i % 15}-05-02"
    r["reg_type"] = "세례" if i % 2 else ""
    r["phone1"] = f"010-0000-{i:04d}"
    r["address"] = f"시험시 시험구 시험로 {i}"
    r["name_key"] = r["name"]
    r["phone_digits"] = r["phone1"].replace("-", "")
    return r


def photo(pid, color, folder):
    p = os.path.join(folder, f"{pid}.jpg")
    Image.new("RGB", (120, 160), color).save(p, "JPEG", quality=80)
    with open(p, "rb") as f:
        return {"hash": hashlib.md5(f.read()).hexdigest(), "mime": "image/jpeg"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--variant", type=int, default=1, choices=[1, 2, 3])
    v = ap.parse_args().variant
    if os.path.basename(WORK) != "fake":
        sys.exit("가짜 명부 폴더 이름이 이상하다 — 멈춘다")
    shutil.rmtree(WORK, ignore_errors=True)
    folder = os.path.join(WORK, "photos")
    os.makedirs(folder)
    ids = list(range(1, 101))
    if v == 2:
        ids = [i for i in ids if i > 3] + [101, 102]
    if v == 3:
        ids = [i for i in ids if i > 10]
    people, photos = [], {}
    for i in ids:
        r = person(i)
        if v == 2 and 10 <= i <= 14:
            r["position"], r["position_detail"] = "장로", "시무장로"
        people.append(r)
        if i % 3 == 0:
            color = (200, 60, 60) if (v == 2 and i == 21) else ((i * 37) % 256, (i * 91) % 256, (i * 53) % 256)
            photos[str(900000 + i)] = photo(900000 + i, color, folder)
        else:
            photos[str(900000 + i)] = None
    meta = {"source_date": datetime.date.today().isoformat(), "fake": True, "source_file": f"fake-v{v}", "count": len(people)}
    with open(os.path.join(WORK, "people.json"), "w", encoding="utf-8") as f:
        json.dump({"meta": meta, "people": people}, f, ensure_ascii=False)
    with open(os.path.join(WORK, "photos.json"), "w", encoding="utf-8") as f:
        json.dump(photos, f)
    print(f"가짜 명부 {v}판 — {len(people)}명 · 사진 {sum(1 for x in photos.values() if x)}장 → {WORK}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: `tools/people/load_people.py`**

```python
# -*- coding: utf-8 -*-
"""교인명부 ③ 살펴보기 · ④ 넣기 (2026-09-29)

  python tools/people/load_people.py --work "C:/Projects/교인명부_작업/2026-09-29" --target prod            # 살펴보기(아무것도 안 바꿈)
  python tools/people/load_people.py --work "C:/Projects/교인명부_작업/2026-09-29" --target prod --apply    # 넣기

키(저장소 밖): ~/.church-admin/dev.env (DEV_URL · DEV_SERVICE_KEY) · ~/.church-admin/prod.env (PROD_URL · PROD_SERVICE_KEY)
⚠️ 개발에는 가짜 명부만(meta.fake=true), 운영에는 진짜만 — 반대면 멈춘다.
⚠️ 빠지는 사람이 지금 인원의 5% 를 넘으면 멈춘다(exit 2) — 한 교구만 내려받은 파일로 나머지가 지워지는 사고. 정말이면 --allow-drop.
⚠️ 순서: 사진 올리기 → 줄 넣기·고치기 → 빠진 분 지우기(줄·사진) → 올린 기록(church_people_imports · admin_audit).
   기록이 마지막이라 도중에 멈추면 화면의 「명부 기준일」은 옛 날짜 그대로다 — 다시 돌리면 남은 것만 맞춘다.
"""
import argparse, datetime, json, os, sys, urllib.error, urllib.request
from concurrent.futures import ThreadPoolExecutor

sys.stdout.reconfigure(encoding="utf-8")
BUCKET = "church-people-photos"
REF = {"dev": "ktpwthwqzgcqcrmsafdo", "prod": "xnomlgydifiqiybervtf"}
DATA_COLS = ["name", "position", "position_detail", "gender", "birth", "birth_date", "lunar", "age", "spouse",
             "spouse_position", "household_head", "household_rel", "household_id", "kind1", "kind2", "kind3", "registered",
             "registered_date", "reg_type", "phone1", "phone2", "guide", "email", "mok_path", "mok1", "mok2", "mok3",
             "mok_leader", "school_path", "school_dept", "teacher", "youth_path", "mission", "address", "address_jibun",
             "name_key", "phone_digits", "has_photo", "photo_hash"]
DROP_LIMIT = 0.05


def load_env(target):
    pre = "DEV" if target == "dev" else "PROD"
    f = os.path.expanduser(f"~/.church-admin/{target}.env")
    if not os.path.exists(f):
        sys.exit(f"{f} 가 없다 — {pre}_URL · {pre}_SERVICE_KEY 두 줄을 넣어 둘 것(저장소 밖)")
    vals = {}
    with open(f, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line.startswith("export "):
                line = line[7:]
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            vals[k.strip()] = v.strip().strip('"').strip("'")
    url, key = vals.get(pre + "_URL", "").rstrip("/"), vals.get(pre + "_SERVICE_KEY", "")
    if REF[target] not in url:
        sys.exit(f"{f} 의 {pre}_URL 이 {REF[target]} 가 아니다 — 멈춘다")
    if not key:
        sys.exit(f"{f} 에 {pre}_SERVICE_KEY 가 없다")
    return url, key


class Api:
    def __init__(self, url, key):
        self.url, self.key = url, key

    def hdr(self, extra=None):
        h = {"apikey": self.key}
        if not self.key.startswith("sb_secret_"):
            h["Authorization"] = "Bearer " + self.key
        h.update(extra or {})
        return h

    def call(self, method, path, body=None, extra=None, raw=False):
        h = self.hdr(extra)
        data = None
        if body is not None:
            data = body if raw else json.dumps(body, ensure_ascii=False).encode("utf-8")
            if not raw:
                h.setdefault("Content-Type", "application/json")
        req = urllib.request.Request(self.url + path, data=data, method=method, headers=h)
        try:
            with urllib.request.urlopen(req, timeout=180) as res:
                t = res.read()
                ctype = res.headers.get_content_type()
                return res.headers, (json.loads(t) if t and ctype == "application/json" else None)
        except urllib.error.HTTPError as e:
            sys.exit(f"{method} {path.split('?')[0]} → {e.code} {e.read()[:300]!r}")


def fetch_current(api):
    out, start = {}, 0
    cols = ",".join(["person_id"] + DATA_COLS)
    while True:
        _, rows = api.call("GET", f"/rest/v1/church_people?select={cols}&order=person_id",
                           extra={"Range-Unit": "items", "Range": f"{start}-{start + 999}"})
        if not rows:
            return out
        for r in rows:
            out[r["person_id"]] = r
        start += len(rows)


def same(a, b):
    for c in DATA_COLS:
        x, y = a.get(c), b.get(c)
        if c == "age":
            if (x is None) != (y is None) or (x is not None and float(x) != float(y)):
                return False
        elif (x if x is not None else "") != (y if y is not None else ""):
            return False
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--work", required=True)
    ap.add_argument("--target", required=True, choices=["dev", "prod"])
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--allow-drop", action="store_true")
    a = ap.parse_args()
    with open(os.path.join(a.work, "people.json"), encoding="utf-8") as f:
        data = json.load(f)
    with open(os.path.join(a.work, "photos.json"), encoding="utf-8") as f:
        photos = json.load(f)
    fake = bool(data["meta"].get("fake"))
    if a.target == "dev" and not fake:
        sys.exit("개발에는 가짜 명부만 넣는다 — 진짜 명단은 운영에만(설계 1장)")
    if a.target == "prod" and fake:
        sys.exit("운영에 가짜 명부를 넣으려 한다 — 멈춘다")
    api = Api(*load_env(a.target))

    new = {}
    for p in data["people"]:
        ph = photos.get(str(p["person_id"]))
        new[p["person_id"]] = {**p, "has_photo": bool(ph), "photo_hash": ph["hash"] if ph else ""}
    cur = fetch_current(api)
    added = [i for i in new if i not in cur]
    changed = [i for i in new if i in cur and not same(cur[i], new[i])]
    removed = [i for i in cur if i not in new]
    up_photos = [i for i in new if new[i]["has_photo"] and (i not in cur or cur[i].get("photo_hash") != new[i]["photo_hash"])]
    del_photos = [i for i in cur if cur[i].get("has_photo") and (i not in new or not new[i]["has_photo"])]
    print(f"[{a.target}] 기준일 {data['meta']['source_date']} · 파일 {len(new)}명 · 지금 DB {len(cur)}명")
    print(f"  새로 {len(added)} · 바뀜 {len(changed)} · 빠짐 {len(removed)} · 사진 올림 {len(up_photos)} · 사진 지움 {len(del_photos)}")
    if cur and len(removed) > DROP_LIMIT * len(cur) and not a.allow_drop:
        print(f"⚠️ 빠지는 분이 {len(removed)}명({len(removed) / len(cur):.1%}) — {DROP_LIMIT:.0%} 를 넘어 멈춘다.")
        print("   한 교구만 내려받은 파일이 아닌지 확인하고, 정말이면 --allow-drop 을 붙인다.")
        sys.exit(2)
    if not a.apply:
        print("살펴보기만 했다 — 넣으려면 --apply")
        return

    def upload(pid):
        with open(os.path.join(a.work, "photos", f"{pid}.jpg"), "rb") as f:
            b = f.read()
        api.call("POST", f"/storage/v1/object/{BUCKET}/{pid}.jpg", b,
                 {"Content-Type": photos[str(pid)]["mime"], "x-upsert": "true"}, raw=True)

    with ThreadPoolExecutor(max_workers=6) as ex:
        for n, _ in enumerate(ex.map(upload, up_photos), 1):
            if n % 500 == 0:
                print(f"  사진 {n}/{len(up_photos)}", flush=True)
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    rows = [{"person_id": i, **{c: new[i].get(c) for c in DATA_COLS}, "updated_at": now} for i in added + changed]
    for k in range(0, len(rows), 500):
        api.call("POST", "/rest/v1/church_people?on_conflict=person_id", rows[k:k + 500],
                 {"Prefer": "resolution=merge-duplicates,return=minimal"})
    for k in range(0, len(removed), 200):
        chunk = ",".join(str(i) for i in removed[k:k + 200])
        api.call("DELETE", f"/rest/v1/church_people?person_id=in.({chunk})", extra={"Prefer": "return=minimal"})
    for k in range(0, len(del_photos), 200):
        api.call("DELETE", f"/storage/v1/object/{BUCKET}", {"prefixes": [f"{i}.jpg" for i in del_photos[k:k + 200]]})
    rec = {"source_date": data["meta"]["source_date"], "total": len(new), "added": len(added),
           "changed": len(changed), "removed": len(removed), "photos": len(up_photos)}
    _, imp = api.call("POST", "/rest/v1/church_people_imports", rec, {"Prefer": "return=representation"})
    api.call("POST", "/rest/v1/admin_audit", {"member_id": None, "action": "people.import",
                                               "target": str(imp[0]["id"]), "detail": rec}, {"Prefer": "return=minimal"})
    h, _ = api.call("GET", "/rest/v1/church_people?select=person_id", extra={"Prefer": "count=exact", "Range": "0-0"})
    total = int((h.get("Content-Range") or "*/0").split("/")[-1])
    print(f"넣었다 — DB {total}명(파일 {len(new)}명) · 올린 기록 #{imp[0]['id']}")
    if total != len(new):
        sys.exit("DB 인원과 파일 인원이 다르다 — 확인할 것")


if __name__ == "__main__":
    main()
```

- [ ] **Step 3: 가짜 1판을 개발에 — 살펴보기 → 넣기**

```bash
python tools/people/fake_people.py
python tools/people/load_people.py --work "C:/Projects/교인명부_작업/fake" --target dev
python tools/people/load_people.py --work "C:/Projects/교인명부_작업/fake" --target dev --apply
```
Expected: 살펴보기 `새로 100 · 바뀜 0 · 빠짐 0 · 사진 올림 33` → 넣기 `넣었다 — DB 100명(파일 100명)`
  - 사진 올리기가 401/403 이면: 개발 키가 새 꼴(`sb_secret_…`)일 때 Storage 가 `Authorization` 을 요구하는 것이다 — `Api.hdr()` 에서
    `sb_secret_` 조건을 빼고 늘 `Authorization: Bearer <키>` 를 붙여 본 뒤, 그 결과를 이 계획과 `tests/server.dev.test.mjs` 의 `svc` 머리 주석에 적는다.

- [ ] **Step 4: 가짜 2판 — 다시 넣기**

```bash
python tools/people/fake_people.py --variant 2
python tools/people/load_people.py --work "C:/Projects/교인명부_작업/fake" --target dev --apply
```
Expected: `새로 2 · 바뀜 6 · 빠짐 3 · 사진 올림 2 · 사진 지움 1` → `DB 99명`
  (바뀜 6 = 직분 바뀐 900010~14 다섯 + 사진 색이 바뀐 900021 · 사진 올림 2 = 새로 온 900102 + 900021 · 사진 지움 1 = 빠진 900003)

- [ ] **Step 5: 5% 멈춤 · 방향 거절**

```bash
python tools/people/fake_people.py --variant 3
python tools/people/load_people.py --work "C:/Projects/교인명부_작업/fake" --target dev ; echo "exit=$?"
python tools/people/load_people.py --work "C:/Projects/교인명부_작업/2026-09-29" --target dev ; echo "exit=$?"
python tools/people/fake_people.py --variant 2      # 개발에 들어가 있는 판으로 되돌려 둔다
```
Expected: 첫째 `⚠️ 빠지는 분이 9명(9.1%)` · `exit=2` / 둘째 `개발에는 가짜 명부만 넣는다` · `exit=1`

- [ ] **Step 6: 개발 서버 시험이 여전히 통과(가짜 명부가 있는 채로)**

```bash
set -a; . ~/.church-admin/dev.env; set +a
node --experimental-strip-types --test tests/server.dev.test.mjs
```

- [ ] **Step 7: 커밋**

```bash
git status --short            # tools/people/ 두 파일만
python tools/preflight.py
git add tools/people/fake_people.py tools/people/load_people.py
git commit -m "feat(교인명부): 가짜 명부(개발 전용) · ③살펴보기/④넣기 스크립트 — 5% 멈춤 · 개발/운영 방향 거절"
```

---

### Task 9: 화면 — 교인 찾기 · 교인 현황

**Files:**
- Create: `js/menus/people/people-logic.js`, `js/menus/people/church-badge.js`, `js/menus/people/search.js`, `js/menus/people/stats.js`, `tests/people-logic.test.mjs`
- Modify: `js/menus/registry.js`, `css/admin.css`

**Interfaces:**
- Consumes: Task 5 액션 넷의 응답 모양
- Produces(Task 10 이 쓴다): `churchBadgeHtml(c)` · `CHURCH_LEGEND` · `hasChurch(rows)` (church-badge.js)
- 가족(2026-09-29 친구 요청 「가족단위로 묶어 보게」): 자세히 보기 아래 **가족 목록**(누르면 그분 자세히) · **「👪 가족 모두 목록으로」**(세대주 교인ID 로 찾기) · 현황의 **가구 수** · 내려받기의 **세대주 교인ID** 칸.

- [ ] **Step 1: 실패하는 시험** — `tests/people-logic.test.mjs`

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { sourceLine, affText, initialOf, csvText, EXPORT_COLS, detailRows, searchPayload, pageInfo, exportName, familyOrder }
  from "../js/menus/people/people-logic.js";
import { churchBadgeHtml, hasChurch } from "../js/menus/people/church-badge.js";

test("sourceLine — 없음 · 기준일 · 90일 넘으면 오래됨", () => {
  assert.deepEqual(sourceLine(null, "2026-09-29"), { text: "아직 명부가 없어요 — 새 명단을 올려 주세요", stale: true });
  assert.deepEqual(sourceLine({ source_date: "2026-09-29", total: 8672 }, "2026-10-01"),
    { text: "명부 기준일 2026-09-29 · 8,672명", stale: false });
  assert.equal(sourceLine({ source_date: "2026-06-01", total: 1 }, "2026-09-29").stale, true);
});

test("affText — 교구 목장 · 새가족 · 청년 · 교회학교", () => {
  assert.equal(affText({ mok1: "기쁨", mok3: "기쁨-12목장" }), "기쁨 12목장");
  assert.equal(affText({ mok1: "기쁨", mok3: "기쁨-01목장" }), "기쁨 1목장");
  assert.equal(affText({ mok1: "새가족", mok3: "3월" }), "새가족 3월");
  assert.equal(affText({ mok1: "청년부", mok3: "청년-03" }), "청년부 청년-03");
  assert.equal(affText({ mok1: "", mok3: "", school_dept: "고등부" }), "고등부");
  assert.equal(affText({}), "");
});

test("initialOf · pageInfo · exportName · searchPayload", () => {
  assert.equal(initialOf("김철수"), "김");
  assert.equal(initialOf(""), "?");
  assert.deepEqual(pageInfo(120, 1, 50), { from: 51, to: 100, hasPrev: true, hasNext: true });
  assert.deepEqual(pageInfo(0, 0, 50), { from: 0, to: 0, hasPrev: false, hasNext: false });
  assert.equal(exportName({ source_date: "2026-09-29" }, 12), "교인명부_2026-09-29_12명.csv");
  assert.deepEqual(searchPayload({ q: "김", mok1: "", kind2: "", kind3: "", position: "", noPhoto: 1, page: 2 }),
    { q: "김", mok1: "", kind2: "", kind3: "", position: "", noPhoto: true, household: null, page: 2 });
  assert.equal(searchPayload({ household: 45458 }).household, 45458);
});

test("familyOrder — 세대주가 맨 앞, 그다음 나이 많은 차례, 같으면 가나다", () => {
  const out = familyOrder([
    { person_id: 3, name: "다", age: 10 }, { person_id: 2, name: "나", age: 40 },
    { person_id: 1, name: "가", age: 38 }, { person_id: 4, name: "라", age: null },
  ], 1);
  assert.deepEqual(out.map((x) => x.person_id), [1, 2, 3, 4]);
  assert.deepEqual(familyOrder([], 1), []);
});

test("csvText — BOM · 머리글 · 따옴표 · 사진 있음/없음", () => {
  const csv = csvText([{ person_id: 1, name: '김"철수', has_photo: true }, { person_id: 2, name: "이영희", has_photo: false }]);
  assert.ok(csv.startsWith("\uFEFF"));
  const lines = csv.slice(1).split("\r\n");
  assert.equal(lines[0], EXPORT_COLS.map(([, h]) => `"${h}"`).join(","));
  assert.ok(lines[1].startsWith('"1","김""철수"'));
  assert.ok(lines[1].endsWith('"있음"'));
  assert.ok(lines[2].endsWith('"없음"'));
});

test("detailRows — 빈 칸은 빼고 연락처는 전화 표시", () => {
  const rows = detailRows({ position: "집사", position_detail: "서리집사", phone1: "010-1111-2222", phone2: "", address: "시험로 1" });
  assert.deepEqual(rows.find(([k]) => k === "직분"), ["직분", "집사 · 서리집사"]);
  assert.deepEqual(rows.find(([k]) => k === "연락처"), ["연락처", "010-1111-2222", "tel"]);
  assert.equal(rows.some(([k]) => k === "연락처 2"), false);
});

test("churchBadgeHtml — 셋 · null 은 빈 글자 · reason 은 esc", () => {
  assert.equal(churchBadgeHtml(null), "");
  assert.match(churchBadgeHtml({ state: "맞음", reason: "" }), /cb-ok.*교적 ✓/);
  assert.match(churchBadgeHtml({ state: "확인 필요", reason: "<b>소속 다름" }), /&lt;b&gt;소속 다름/);
  assert.match(churchBadgeHtml({ state: "없음", reason: "" }), /cb-none.*교적 없음/);
  assert.equal(hasChurch([{ church: null }, {}]), false);
  assert.equal(hasChurch([{ church: { state: "없음", reason: "" } }]), true);
});
```

Run: `node --experimental-strip-types --test tests/people-logic.test.mjs` → FAIL(모듈 없음)

- [ ] **Step 2: `js/menus/people/people-logic.js`**

```js
// 교인명부 화면 — 순수 함수(2026-09-29). tests/people-logic.test.mjs 가 같은 파일을 읽는다(DOM 을 쓰지 않는다).
export const STALE_DAYS = 90;

export function sourceLine(source, todayIso) {
  if (!source) return { text: "아직 명부가 없어요 — 새 명단을 올려 주세요", stale: true };
  const days = Math.floor((Date.parse(todayIso) - Date.parse(source.source_date)) / 86400000);
  const base = `명부 기준일 ${source.source_date} · ${Number(source.total || 0).toLocaleString("ko-KR")}명`;
  return days > STALE_DAYS
    ? { text: `${base} — 명부가 오래됐어요, 새 명단을 올려 주세요`, stale: true }
    : { text: base, stale: false };
}

// 소속 한 줄 — 「기쁨 12목장」 · 「새가족 3월」 · 「청년부 청년-03」 · 「고등부」
export function affText(p) {
  const m = /(\d+)목장$/.exec(String(p.mok3 || ""));
  if (p.mok1 && m && p.mok1 !== "새가족") return `${p.mok1} ${Number(m[1])}목장`;
  if (p.mok1 && p.mok3) return `${p.mok1} ${p.mok3}`;
  if (p.school_dept) return p.school_dept;
  return p.mok1 || "";
}

export const initialOf = (name) => String(name || "").trim().charAt(0) || "?";

export const searchPayload = (s) => ({
  q: s.q || "", mok1: s.mok1 || "", kind2: s.kind2 || "", kind3: s.kind3 || "", position: s.position || "",
  noPhoto: !!s.noPhoto, household: s.household || null, page: s.page || 0,
});

// 가족 차례 — 세대주(교인ID = 세대주 교인ID)가 맨 앞, 그다음 나이 많은 차례, 같으면 가나다
export function familyOrder(list, headId) {
  const age = (x) => (x.age === null || x.age === undefined || x.age === "" ? -1 : Number(x.age));
  return [...list].sort((a, b) => (b.person_id === headId) - (a.person_id === headId)
    || age(b) - age(a) || String(a.name).localeCompare(String(b.name), "ko"));
}

export function pageInfo(total, page, size) {
  return { from: total ? page * size + 1 : 0, to: Math.min(total, (page + 1) * size),
    hasPrev: page > 0, hasNext: (page + 1) * size < total };
}

export const exportName = (source, n) => `교인명부_${source?.source_date || "기준일없음"}_${n}명.csv`;

// 내려받기 칸 — 서버 PEOPLE_ALL_COLS 에서 목장 세 단계(목장 칸에 이미 있다)만 뺐다
export const EXPORT_COLS = [
  ["person_id", "교인ID"], ["name", "이름"], ["position", "직분"], ["position_detail", "직분상세"], ["gender", "성별"],
  ["birth", "생년월일"], ["lunar", "양음력"], ["age", "나이"], ["spouse", "배우자"], ["spouse_position", "배우자직분"],
  ["household_head", "신앙세대주"], ["household_rel", "세대주관계"], ["household_id", "세대주 교인ID"],
  ["kind1", "교인구분1"], ["kind2", "교인구분2"],
  ["kind3", "교인구분3"], ["registered", "등록일"], ["reg_type", "등록구분"], ["phone1", "연락처1"], ["phone2", "연락처2"],
  ["guide", "인도자"], ["email", "이메일"], ["mok_path", "목장"], ["mok_leader", "목장리더"], ["school_path", "교회학교"],
  ["teacher", "교사"], ["youth_path", "청년"], ["mission", "선교회"], ["address", "주소"], ["address_jibun", "지번주소"],
  ["has_photo", "사진"],
];

export function csvText(rows) {
  const cell = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
  const head = EXPORT_COLS.map(([, h]) => h);
  const body = rows.map((r) => EXPORT_COLS.map(([k]) => (k === "has_photo" ? (r[k] ? "있음" : "없음") : r[k])));
  return "\uFEFF" + [head, ...body].map((row) => row.map(cell).join(",")).join("\r\n");
}

// 자세히 보기 — [칸 이름, 값, 종류?]. 빈 값은 뺀다. 종류 "tel" 은 전화 걸기로 그린다.
export function detailRows(p) {
  const join = (...xs) => xs.filter(Boolean).join(" · ");
  const rows = [
    ["직분", join(p.position, p.position_detail)],
    ["성별 · 나이", join(p.gender, p.age != null && p.age !== "" ? `${p.age}세` : "")],
    ["생년월일", join(p.birth, p.lunar)],
    ["소속", affText(p)],
    ["목장 리더", p.mok_leader],
    ["교회학교", p.school_path],
    ["교사", p.teacher],
    ["청년", p.youth_path],
    ["선교회", p.mission],
    ["교인 구분", [p.kind1, p.kind2, p.kind3].filter(Boolean).join(" > ")],
    ["등록", join(p.registered, p.reg_type)],
    ["연락처", p.phone1, "tel"],
    ["연락처 2", p.phone2, "tel"],
    ["이메일", p.email],
    ["배우자", join(p.spouse, p.spouse_position)],
    ["신앙세대주", join(p.household_head, p.household_rel)],
    ["인도자", p.guide],
    ["주소", p.address],
    ["지번 주소", p.address_jibun],
  ];
  return rows.filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== "");
}
```

- [ ] **Step 3: `js/menus/people/church-badge.js`**

```js
// 사역 화면(신청 현황 · 종이 명단)의 교적 표시 — 서버가 준 { state, reason } 만 그린다(2026-09-29 교인명부).
// null 이면 아무것도 그리지 않는다(명부가 아직 없거나 물을 수 없는 이름 — 「교적 없음」은 사실이 아닐 수 있다).
import { esc } from "../../core/ui.js";

const CLS = { "맞음": "ok", "확인 필요": "check", "없음": "none" };
const TEXT = { "맞음": "교적 ✓", "확인 필요": "교적 확인", "없음": "교적 없음" };

export function churchBadgeHtml(c) {
  if (!c || !TEXT[c.state]) return "";
  return `<em class="cb cb-${CLS[c.state]}">${TEXT[c.state]}${c.reason ? ` <small>${esc(c.reason)}</small>` : ""}</em>`;
}

export const hasChurch = (rows) => (rows || []).some((r) => r && r.church);

export const CHURCH_LEGEND = `<p class="muted cb-legend">교적 표시 — <em class="cb cb-ok">교적 ✓</em> 이름·소속이 맞는 분이 한 분 ·
  <em class="cb cb-check">교적 확인</em> 소속이 다르거나 같은 이름이 여럿 · <em class="cb cb-none">교적 없음</em> 교적에 같은 이름이 없음</p>`;
```

Run: `node --experimental-strip-types --test tests/people-logic.test.mjs` → PASS 7/7

- [ ] **Step 4: `js/menus/people/search.js`**

```js
// 🔎 교인 찾기 (2026-09-29) — 이름·전화 뒷자리로 찾기 · 거르기 · 한 분 자세히 · 찾은 명단 내려받기.
// ⚠️ 찾기·보기·내려받기는 서버가 모두 기록한다(바꾼 기록 → 「교인명부 기록」).
// ⚠️ 사진 주소는 10분 뒤 만료된다 — 목록 사진은 바로 불러오고(eager), 못 불러오면 이름 첫 글자로 바꾼다.
//    자세히 보기는 열 때마다 서버가 새 주소를 준다.
// ⚠️ 내려받기는 **마지막으로 찾은 조건** 그대로다(칸을 바꾸고 「찾기」를 안 눌렀으면 옛 조건) — 화면의 수와 파일이 같게.
import { esc, toast, dialog, busy, errorText } from "../../core/ui.js";
import { sourceLine, affText, csvText, detailRows, searchPayload, initialOf, exportName, pageInfo, familyOrder }
  from "./people-logic.js";

const TITLE = `<h2 class="page-title">🔎 교인 찾기</h2>`;
// 찾기 조건은 메뉴를 옮겨 다녀도 남는다(임명현황과 같게). household = 가족 보기(세대주 교인ID)
const BLANK = { q: "", mok1: "", kind2: "", kind3: "", position: "", noPhoto: false, page: 0, household: null, householdName: "" };
let state = { ...BLANK };
let options = null;   // 거르기 목록 — 교인 현황(peopleStats)에서 한 번 받는다
const mqWide = window.matchMedia("(min-width:1024px)");

const iniHtml = (name, cls) => `<span class="${cls} pp-ini" aria-hidden="true">${esc(initialOf(name))}</span>`;
const photoHtml = (p, cls) => p.photo
  ? `<img class="${cls}" src="${esc(p.photo)}" alt="" loading="eager" referrerpolicy="no-referrer" data-ini="${esc(initialOf(p.name))}">`
  : iniHtml(p.name, cls);
const telHtml = (phone) => {
  const d = String(phone || "").replace(/\D/g, "");
  return d ? `<a class="pp-tel" href="tel:${d}">📞 ${esc(phone)}</a>` : `<span class="muted">번호 없음</span>`;
};
const ageText = (p) => [p.gender, p.age != null && p.age !== "" ? `${p.age}세` : ""].filter(Boolean).join(" · ");
const posHtml = (p) => (p.position ? `<em class="mn-pos">${esc(p.position)}</em>` : "");

// 가족 보기일 때만 관계(본인·처·아들1 …)를 붙인다
const relHtml = (p) => (state.household && p.household_rel ? `<span class="pp-rel">${esc(p.household_rel)}</span>` : "");

const cardsHtml = (rows) => rows.map((p) => `<div class="pp-card" data-id="${esc(p.person_id)}" role="button" tabindex="0">
    ${photoHtml(p, "pp-ph")}
    <div class="pp-main"><div>${relHtml(p)}<b>${esc(p.name)}</b>${posHtml(p)} <span class="muted">${esc(ageText(p))}</span></div>
      <div class="pp-aff">${esc(affText(p))}</div><div>${telHtml(p.phone1)}</div></div>
  </div>`).join("");

const tableHtml = (rows) => `<table class="pp-table"><thead><tr><th>사진</th><th>이름(직분)</th><th>성별·나이</th>` +
  `<th>소속</th><th>구분</th><th>연락처</th></tr></thead><tbody>` +
  rows.map((p) => `<tr class="pp-row" data-id="${esc(p.person_id)}" tabindex="0"><td>${photoHtml(p, "pp-ph sm")}</td>` +
    `<td>${relHtml(p)}<b>${esc(p.name)}</b>${posHtml(p)}</td><td>${esc(ageText(p))}</td><td>${esc(affText(p))}</td>` +
    `<td>${esc(p.kind2 || "")}</td><td>${telHtml(p.phone1)}</td></tr>`).join("") + `</tbody></table>`;

const selectHtml = (key, label, values) => `<label class="pp-sel"><span>${label}</span><select data-f="${key}">` +
  `<option value="">전체</option>${(values || []).map((v) =>
    `<option value="${esc(v)}"${state[key] === v ? " selected" : ""}>${esc(v)}</option>`).join("")}</select></label>`;

function download(text, name) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// 한 분 자세히 + 가족(같은 신앙세대주). 가족 이름을 누르면 이 창을 닫고 그분을 연다(열람 기록이 그분 몫으로 남는다).
// 「가족 모두 목록으로」는 onFamily(세대주 교인ID, 세대주 이름) — 목록을 그 가족으로 바꾼다.
async function openPerson(call, id, onFamily) {
  const r = await call("peoplePerson", { id: Number(id) });
  if (!r.ok) { toast(errorText(r)); return; }
  const p = r.person;
  const rows = detailRows(p).map(([k, v, kind]) => `<dt>${esc(k)}</dt><dd>${kind === "tel" ? telHtml(v) : esc(v)}</dd>`).join("");
  const photo = p.photo
    ? `<img class="pp-big" src="${esc(p.photo)}" alt="${esc(p.name)} 사진" referrerpolicy="no-referrer">`
    : `<div class="pp-big pp-ini">${esc(initialOf(p.name))}</div>`;
  const fam = familyOrder(r.family || [], p.household_id);
  const famHtml = !p.household_id || !fam.length ? "" :
    `<div class="pp-fam"><div class="pp-fam-t"><b>가족</b> <span class="muted">세대주 ${esc(p.household_head || "(명단에 없음)")} · ${fam.length + 1}명</span></div>` +
    fam.map((f) => `<button type="button" class="pp-fam-b" data-fam="${esc(f.person_id)}">${esc(f.name)} <small>${esc(
      [f.household_rel, f.age != null && f.age !== "" ? f.age + "세" : ""].filter(Boolean).join(" · "))}</small></button>`).join("") +
    `<button type="button" class="btn pp-fam-all" data-fam-all="${esc(p.household_id)}">👪 가족 모두 목록으로</button></div>`;
  // ⚠️ dialog 본문은 pre-line — html 안에 줄바꿈 글자를 넣지 않는다
  const closed = dialog({ title: p.name + (p.position ? " " + p.position : ""),
    html: `<div class="pp-detail">${photo}<dl>${rows}</dl>${famHtml}</div>`, ok: "닫기", cancel: null });
  const dlg = [...document.querySelectorAll(".dlg-dim")].pop();   // dialog 는 창을 곧바로(동기로) 붙인다
  dlg.addEventListener("click", (e) => {
    const f = e.target.closest("[data-fam]"), all = e.target.closest("[data-fam-all]");
    if (!f && !all) return;
    dlg.querySelector('[data-v="1"]').click();                    // 이 창을 닫고
    if (f) openPerson(call, f.dataset.fam, onFamily);
    else onFamily(Number(all.dataset.famAll), p.household_head || "");
  });
  await closed;
}

export async function render(el, { call, query }) {
  if (query && query.nophoto === "1") state = { ...state, noPhoto: true, page: 0 };
  el.innerHTML = TITLE + `<p class="empty">불러오는 중…</p>`;
  if (!options) {
    const st = await call("peopleStats");
    if (!st.ok) { el.innerHTML = TITLE + `<p class="empty">${esc(errorText(st))}</p>`; return; }
    if (!st.source) { el.innerHTML = TITLE + `<p class="empty">${esc(sourceLine(null).text)}</p>`; return; }
    options = st.stats.options;
  }
  el.innerHTML = TITLE + `<p class="pp-src muted"></p><p class="pp-famon" hidden></p>
    <form class="pp-form" autocomplete="off">
      <input type="search" class="search" name="q" placeholder="🔍 이름 또는 전화 뒷자리 4개" aria-label="찾기">
      <div class="pp-filters">${selectHtml("mok1", "교구", options.mok1)}${selectHtml("kind2", "구분", options.kind2)}` +
        `${selectHtml("kind3", "출석", options.kind3)}${selectHtml("position", "직분", options.position)}
        <label class="pp-chk"><input type="checkbox" data-f="noPhoto"${state.noPhoto ? " checked" : ""}> 사진 없는 분만</label></div>
      <div class="acts"><button type="submit" class="btn primary">찾기</button>
        <button type="button" class="btn" data-act="csv">⬇️ 내려받기</button></div>
    </form>
    <p class="muted pp-sum"></p><div class="pp-list"></div>
    <div class="acts pp-pager" hidden><button type="button" class="btn" data-act="prev">← 앞</button>
      <button type="button" class="btn" data-act="next">다음 →</button></div>`;
  const form = el.querySelector(".pp-form");
  form.q.value = state.q;
  let last = null;

  const readForm = () => {
    state.q = form.q.value.trim();
    el.querySelectorAll("select[data-f]").forEach((s) => { state[s.dataset.f] = s.value; });
    state.noPhoto = el.querySelector('input[data-f="noPhoto"]').checked;
    state.household = null;          // 「찾기」를 누르면 가족 보기는 끝난다
    state.householdName = "";
  };

  // 가족 보기 — 다른 조건은 모두 비우고 세대주 교인ID 하나로 찾는다
  const showFamily = (hid, headName) => {
    state = { ...BLANK, household: hid, householdName: headName };
    form.q.value = "";
    el.querySelectorAll("select[data-f]").forEach((s) => { s.value = ""; });
    el.querySelector('input[data-f="noPhoto"]').checked = false;
    load();
  };

  function draw() {
    if (!last) return;
    const info = pageInfo(last.total, last.page, last.pageSize);
    el.querySelector(".pp-sum").innerHTML = last.total
      ? `<b>${last.total.toLocaleString("ko-KR")}명</b> 중 ${info.from}–${info.to}` : "";
    const famOn = el.querySelector(".pp-famon");
    famOn.hidden = !state.household;
    famOn.innerHTML = state.household
      ? `👪 가족 보기 — 세대주 ${esc(state.householdName || String(state.household))} ` +
        `<button type="button" class="btn" data-act="famoff">✕ 가족 보기 끝</button>` : "";
    const shown = state.household ? familyOrder(last.rows, state.household) : last.rows;
    const list = el.querySelector(".pp-list");
    list.innerHTML = !shown.length ? `<p class="empty">조건에 맞는 분이 없어요</p>`
      : mqWide.matches ? tableHtml(shown) : cardsHtml(shown);
    list.querySelectorAll("img[data-ini]").forEach((img) => img.addEventListener("error", () => {
      const s = document.createElement("span");
      s.className = img.className + " pp-ini";
      s.textContent = img.dataset.ini;
      img.replaceWith(s);
    }, { once: true }));
    el.querySelector('[data-act="prev"]').disabled = !info.hasPrev;
    el.querySelector('[data-act="next"]').disabled = !info.hasNext;
    el.querySelector(".pp-pager").hidden = !(info.hasPrev || info.hasNext);
  }

  async function load() {
    const r = await busy(el, () => call("peopleSearch", searchPayload(state)));
    if (!r.ok) { el.querySelector(".pp-list").innerHTML = `<p class="empty">${esc(errorText(r))}</p>`; return; }
    last = r;
    const src = sourceLine(r.source, new Date().toISOString().slice(0, 10));
    const srcEl = el.querySelector(".pp-src");
    srcEl.textContent = src.text;
    srcEl.classList.toggle("stale", src.stale);
    draw();   // busy 가 단추를 되살린 뒤 — 앞/다음의 잠금은 여기서 다시 정한다
  }

  async function exportCsv() {
    if (!last || !last.total) { toast("내려받을 분이 없어요 — 먼저 찾아 주세요"); return; }
    const yes = await dialog({ title: "⬇️ 명단 내려받기", ok: `${last.total}명 받기`, cancel: "그만두기",
      html: `지금 조건으로 찾은 <b>${last.total.toLocaleString("ko-KR")}명</b>을 엑셀(CSV)로 받습니다.<br>받은 기록이 남아요 — 누가 · 언제 · 몇 명.` });
    if (!yes) return;
    const r = await busy(el, () => call("peopleExport", searchPayload({ ...state, page: 0 })));
    draw();
    if (!r.ok) { toast(errorText(r)); return; }
    download(csvText(r.rows), exportName(r.source, r.rows.length));
  }

  form.addEventListener("submit", (e) => { e.preventDefault(); readForm(); state.page = 0; load(); });
  el.addEventListener("click", (e) => {
    if (e.target.closest("a")) return;   // 전화 걸기는 그대로
    const b = e.target.closest("button[data-act]");
    if (b) {
      if (b.dataset.act === "prev" && state.page > 0) { state.page--; load(); }
      if (b.dataset.act === "next") { state.page++; load(); }
      if (b.dataset.act === "csv") exportCsv();
      if (b.dataset.act === "famoff") { state.household = null; state.householdName = ""; state.page = 0; load(); }
      return;
    }
    const row = e.target.closest("[data-id]");
    if (row) openPerson(call, row.dataset.id, showFamily);
  });
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.matches("[data-id]")) openPerson(call, e.target.dataset.id, showFamily);
  });
  // 폭이 바뀌면 카드↔표 — 이 화면을 떠나면 스스로 뗀다(status.js 와 같은 방식)
  const onMq = () => { if (el.isConnected) draw(); else mqWide.removeEventListener("change", onMq); };
  mqWide.addEventListener("change", onMq);
  load();
}
```

- [ ] **Step 5: `js/menus/people/stats.js`**

```js
// 📊 교인 현황 (2026-09-29) — 숫자만. 이름·연락처는 이 화면에 없다(서버 peopleStats 도 주지 않는다).
import { esc, errorText } from "../../core/ui.js";
import { sourceLine } from "./people-logic.js";

const TITLE = `<h2 class="page-title">📊 교인 현황</h2>`;
const n = (x) => Number(x || 0).toLocaleString("ko-KR");
const pairTable = (title, head, pairs) => !pairs.length ? "" :
  `<h3 class="sec-title">${esc(title)}</h3><table class="pp-stat"><thead><tr><th>${esc(head)}</th><th>인원</th></tr></thead>` +
  `<tbody>${pairs.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${n(v)}</td></tr>`).join("")}</tbody></table>`;

export async function render(el, { call }) {
  el.innerHTML = TITLE + `<p class="empty">불러오는 중…</p>`;
  const r = await call("peopleStats");
  if (!r.ok) { el.innerHTML = TITLE + `<p class="empty">${esc(errorText(r))}</p>`; return; }
  const src = sourceLine(r.source, new Date().toISOString().slice(0, 10));
  if (!r.source) { el.innerHTML = TITLE + `<p class="empty">${esc(src.text)}</p>`; return; }
  const s = r.stats;
  el.innerHTML = TITLE + `<p class="pp-src muted${src.stale ? " stale" : ""}">${esc(src.text)}</p>
    <div class="pp-kpis">
      <div class="card pp-kpi"><span class="muted">전체</span><b>${n(s.total)}명</b></div>
      <div class="card pp-kpi"><span class="muted">가구</span><b>${n(s.households)}</b><span class="muted">신앙세대주 기준</span></div>
      <a class="card pp-kpi" href="#/people?nophoto=1"><span class="muted">사진 없는 분</span><b>${n(s.noPhoto)}명</b>
        <span class="muted">눌러서 명단 보기 →</span></a>
    </div>
    <h3 class="sec-title">교구별</h3>
    <table class="pp-stat"><thead><tr><th>교구</th><th>목장 수</th><th>인원</th></tr></thead><tbody>
      ${s.gu.map((g) => `<tr><td>${esc(g.gu)}</td><td>${n(g.moks)}</td><td>${n(g.n)}</td></tr>`).join("")}</tbody></table>
    ${pairTable("장년 · 청년 · 교회학교", "구분", s.kind2)}
    ${pairTable("출석 구분", "출석", s.kind3)}
    ${pairTable("직분", "직분", s.position)}
    ${pairTable("교회학교 부서", "부서", s.school)}
    <h3 class="sec-title">연령대 · 성별</h3>
    <table class="pp-stat"><thead><tr><th>연령대</th><th>남</th><th>여</th><th>모름</th><th>합</th></tr></thead><tbody>
      ${s.age.map((a) => `<tr><td>${esc(a.band)}</td><td>${n(a.m)}</td><td>${n(a.f)}</td><td>${n(a.x)}</td>` +
        `<td>${n(a.m + a.f + a.x)}</td></tr>`).join("")}</tbody></table>`;
}
```

- [ ] **Step 6: `js/menus/registry.js`** — `appointed` 줄 **다음**, `members` 줄 **앞**에:

```js
  { id: "people", group: "교인명부", icon: "🔎", label: "교인 찾기", desc: "이름·전화 뒷자리로 찾기 · 사진 · 내려받기",
    role: "directory", load: () => import("./people/search.js") },
  { id: "people-stats", group: "교인명부", icon: "📊", label: "교인 현황", desc: "교구·부서·직분·연령대별 인원 · 사진 없는 분",
    role: "directory", load: () => import("./people/stats.js") },
```

- [ ] **Step 7: `css/admin.css` 끝에**

```css
/* 교인명부(2026-09-29) — 교인 찾기 · 교인 현황 */
.pp-src{margin:-4px 0 12px}
.pp-src.stale{color:var(--error);font-weight:700}
.pp-filters{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px}
.pp-sel{display:flex;flex-direction:column;gap:2px;font-size:13px;color:var(--gray);flex:1 1 140px;min-width:0}
.pp-sel select{min-height:var(--tap);padding:0 8px;border:1px solid var(--border);border-radius:10px;background:#fff;font-size:15px;color:#222}
.pp-chk{display:flex;align-items:center;gap:6px;min-height:var(--tap);font-size:14px;flex:1 1 140px}
.pp-chk input{width:20px;height:20px}
.pp-form .acts{margin-bottom:12px}
.pp-sum{margin-bottom:8px}
.pp-card{display:flex;gap:12px;align-items:flex-start;background:#fff;border:1px solid var(--border);border-radius:14px;padding:12px;margin-bottom:var(--gap);cursor:pointer}
.pp-card:focus-visible,.pp-row:focus-visible{outline:3px solid var(--ghost-bd);outline-offset:2px}
.pp-ph{width:56px;height:72px;border-radius:8px;object-fit:cover;flex:none;background:var(--light)}
.pp-ph.sm{width:36px;height:46px}
.pp-ini{display:inline-flex;align-items:center;justify-content:center;font-weight:800;color:var(--gray);background:var(--light)}
.pp-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.pp-main b{font-size:16px}
.pp-aff{font-size:14px;color:#333}
.pp-tel{display:inline-flex;align-items:center;min-height:var(--chip);font-weight:700;text-decoration:none}
.pp-table{width:100%;border-collapse:collapse;background:#fff;border:1px solid var(--border)}
.pp-table th,.pp-table td{padding:8px 10px;border-bottom:1px solid var(--light);text-align:left;font-size:14px;vertical-align:middle}
.pp-table thead th{background:var(--light);font-size:13px;color:var(--gray)}
.pp-row{cursor:pointer}
.pp-row:hover{background:var(--ghost-bg)}
.pp-pager{margin-top:8px}
.pp-detail{display:flex;flex-direction:column;align-items:center;gap:12px;white-space:normal}
.pp-big{width:150px;height:195px;border-radius:12px;object-fit:cover;font-size:48px}
.pp-detail dl{display:grid;grid-template-columns:max-content 1fr;gap:4px 12px;width:100%;font-size:14px}
.pp-detail dt{color:var(--gray)}
.pp-detail dd{overflow-wrap:anywhere}
.pp-fam{width:100%;display:flex;flex-wrap:wrap;gap:6px;align-items:center;border-top:1px solid var(--light);padding-top:10px}
.pp-fam-t{width:100%;font-size:14px}
.pp-fam-b{min-height:var(--chip);padding:0 12px;border-radius:999px;border:1px solid var(--border);background:#fff;cursor:pointer;font-size:14px}
.pp-fam-b small{color:var(--gray)}
.pp-fam-all{width:100%;margin-top:4px}
.pp-famon{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:-4px 0 10px;font-weight:700;color:var(--navy)}
.pp-rel{display:inline-flex;align-items:center;min-height:22px;padding:0 8px;margin-right:6px;border-radius:999px;background:var(--ghost-bg);color:var(--navy);font-size:12px;font-weight:700}
.pp-kpis{display:flex;gap:var(--gap);flex-wrap:wrap}
.pp-kpi{flex:1 1 160px;display:flex;flex-direction:column;gap:2px}
.pp-kpi b{font-size:1.4rem;color:var(--navy)}
.pp-stat{width:100%;border-collapse:collapse;background:#fff;border:1px solid var(--border);margin-bottom:8px}
.pp-stat th,.pp-stat td{padding:6px 10px;border-bottom:1px solid var(--light);font-size:14px;text-align:right}
.pp-stat th:first-child,.pp-stat td:first-child{text-align:left}
.pp-stat thead th{background:var(--light);color:var(--gray);font-size:13px}
/* 사역 화면의 교적 표시 */
.cb{display:inline-flex;align-items:center;gap:4px;min-height:22px;padding:0 8px;border-radius:999px;font-size:12px;font-style:normal;font-weight:700;margin-left:6px;white-space:nowrap}
.cb small{font-weight:400}
.cb-ok{background:#e6f2e6;color:var(--green)}
.cb-check{background:#fff3e0;color:#9a5b00}
.cb-none{background:var(--light);color:var(--gray)}
.cb-legend{margin:0 0 10px;line-height:2}
.cb-legend .cb{margin-left:0}
```

- [ ] **Step 8: 점검 · localhost 로 가짜 명부 보기 · 커밋**

```bash
python tools/preflight.py            # registry 시험(역할이 서버가 아는 것인지·모듈 파일이 있는지) 포함
python -m http.server 8000           # http://localhost:8000 — 개발 DB(가짜 명부 99명)
```
  확인(개발에서 총괄 관리자 계정으로): 🔎 교인 찾기 — 기준일 줄 · 이름 「김하늘」로 두 분 · 전화 「0005」 · 거르기 넷 · 사진 없는 분만 · 카드(폰 폭)/표(PC 폭) · 한 분 자세히(사진 있는 33명 중 하나 · 번호 누르면 전화) · 내려받기 확인 창 → CSV 가 엑셀에서 한글로 열린다 / 📊 교인 현황 — 표 여섯 · 「사진 없는 분」 누르면 찾기로.

```bash
git add js/menus/people/ tests/people-logic.test.mjs js/menus/registry.js css/admin.css
git commit -m "feat(교인명부): 화면 — 🔎 교인 찾기(카드/표·자세히·내려받기) · 📊 교인 현황"
```

---

### Task 10: 화면 — 사역 교적 표시 · 「교인명부 기록」 보기 · 개인정보 안내

**Files:**
- Modify: `js/menus/ministry/status.js`, `js/menus/ministry/status-ui.js`, `js/menus/ministry/paper.js`, `js/menus/system/audit.js`, `privacy.html`

**Interfaces:**
- Consumes: Task 9 `churchBadgeHtml`·`CHURCH_LEGEND`·`hasChurch`, Task 5 `auditList {kind}`, Task 6 `church`

- [ ] **Step 1: 신청 현황 — `status.js`**
  - import 모음 끝에 한 줄: `import { CHURCH_LEGEND, hasChurch } from "../people/church-badge.js";`
  - `normalize` 의 `who: x.who || "", name: x.name || "",` → `who: x.who || "", name: x.name || "", church: x.church || null,`
  - `<div class="acts mn-acts"><button type="button" class="btn" data-act="reload">↻ 새로 불러오기</button></div>` 줄 **바로 다음 줄에** `${hasChurch(rows) ? CHURCH_LEGEND : ""}`

- [ ] **Step 2: 신청 현황 조각 — `status-ui.js`**
  - import 끝에: `import { churchBadgeHtml } from "../people/church-badge.js";`
  - `cardHtml` 의 사람 줄: `` `<b>${esc(r.name)}</b>${r.position ? `<em class="mn-pos">${esc(r.position)}</em>` : ""}${paper}` `` → `${paper}` 뒤에 `${churchBadgeHtml(r.church)}` 를 붙인다.
  - `tableHtml` 의 `<td class="mn-tbl-nm">…${push}${paper}</td>` → `${paper}` 뒤에 `${churchBadgeHtml(r.church)}`.
  - 사람별 묶음 머리 `title = \`<span class="mn-grp-t">${esc(r0.name)}${pos ? …}` → `${esc(r0.name)}` 바로 뒤에 `${churchBadgeHtml(r0.church)}`.

- [ ] **Step 3: 종이 명단 — `paper.js`**
  - import 끝(23행 다음)에: `import { churchBadgeHtml, CHURCH_LEGEND, hasChurch } from "../people/church-badge.js";`
  - `rowHtml` 의 `<b>${esc(r.name || "(이름 없음)")}</b><small>…</small>` 다음에 `${churchBadgeHtml(r.church)}`
  - `listEl.innerHTML = mpRows.map(rowHtml).join("");` → `listEl.innerHTML = (hasChurch(mpRows) ? CHURCH_LEGEND : "") + mpRows.map(rowHtml).join("");`

- [ ] **Step 4: 바꾼 기록 — `audit.js` 를 통째로 바꾼다**

```js
// 바꾼 기록 — 총괄 관리자(super)만. 최근 100건.
// 「교인명부 기록」(people.*)은 따로 본다 — 찾기·보기가 많아 바꾼 일을 덮지 않게(서버 auditList 의 kind · 2026-09-29).
import { esc, kstTime, errorText } from "../../core/ui.js";

const TITLE = `<h2 class="page-title">📜 바꾼 기록</h2>`;
const LABEL = {
  register: "승인 요청", "register.update": "요청 고침",
  "members.approve": "승인", "members.roles": "역할 바꿈", "members.status": "상태 바꿈",
  "ministry.status": "사역 상태 바꿈", "ministry.delete": "사역 신청 삭제",
  "ministry.catalog": "사역팀 정보 고침", "ministry.order": "사역팀 차례 바꿈",
  "ministry.paper": "종이 명단 넣음",
  "people.search": "명부 찾기", "people.view": "교인 보기", "people.export": "명부 내려받기", "people.import": "명부 올림",
};
const STATUS = { pending: "대기", active: "사용", disabled: "정지" };
const KINDS = [["", "바꾼 기록"], ["people", "교인명부 기록"]];

const filtersText = (f) => Object.entries(f || {})
  .map(([k, v]) => (k === "noPhoto" ? "사진 없음" : k === "household" ? `가족(세대주 ${v})` : v)).join(" · ");

function detailText(r) {
  const d = r.detail || {};
  if (r.action === "members.approve") return "역할: " + (d.roles || []).join(", ");
  if (r.action === "members.roles") return (d.before || []).join(", ") + " → " + (d.after || []).join(", ");
  if (r.action === "members.status") return (STATUS[d.before] || d.before || "") + " → " + (STATUS[d.after] || d.after || "");
  if (r.action.startsWith("register")) return [d.gu, d.mok, d.bu, d.grade].filter(Boolean).join(" ");
  if (r.action === "ministry.status") return `${d.name || ""} · ${d.team || ""} · ${d.before || ""} → ${d.after || ""}${d.note ? " · 사유: " + d.note : ""}`;
  if (r.action === "ministry.delete") return `${d.name || ""} · ${d.who || ""} · ${d.committee || ""} ${d.team || ""} (${d.status || ""})`;
  if (r.action === "ministry.catalog") return `${d.team || ""} · ${(d.fields || []).join(", ")}`;
  if (r.action === "ministry.order") return `${(d.ids || []).length}팀`;
  if (r.action === "ministry.paper") return `저장 ${d.saved} · 새 계정 ${d.created} · 그대로 ${d.same} · 오류 ${d.errors}`;
  if (r.action === "people.search") {
    const f = filtersText(d.filters);
    return `${d.q ? `‘${d.q}’` : "(검색어 없음)"}${f ? " · " + f : ""} · ${d.total}명${d.page ? ` · ${d.page + 1}쪽` : ""}`;
  }
  if (r.action === "people.view") return d.name || "";
  if (r.action === "people.export") {
    const f = filtersText(d.filters);
    return `${d.count}명${d.q ? ` · ‘${d.q}’` : ""}${f ? " · " + f : ""}`;
  }
  if (r.action === "people.import") return `기준일 ${d.source_date} · 전체 ${d.total} · 새로 ${d.added} · 바뀜 ${d.changed} · 빠짐 ${d.removed} · 사진 ${d.photos}`;
  return "";
}

export async function render(el, { call, query }) {
  const kind = query && query.kind === "people" ? "people" : "";
  const tabs = `<div class="acts" style="margin-bottom:10px">${KINDS.map(([k, t]) =>
    `<a class="btn${k === kind ? " primary" : ""}" href="#/audit${k ? "?kind=" + k : ""}">${t}</a>`).join("")}</div>`;
  el.innerHTML = TITLE + tabs + `<p class="empty">불러오는 중…</p>`;
  const r = await call("auditList", { limit: 100, kind });
  if (!r.ok) { el.innerHTML = TITLE + tabs + `<p class="empty">${esc(errorText(r))}</p>`; return; }
  el.innerHTML = TITLE + tabs + `<p class="muted" style="margin-bottom:10px">최근 ${r.rows.length}건</p>` +
    (r.rows.length ? r.rows.map((x) => {
      const dt = detailText(x);
      const who = x.who || (x.action === "people.import" ? "(올리기 스크립트)" : "(지워진 분)");
      return `<div class="card">
      <div><b>${esc(LABEL[x.action] || x.action)}</b>${x.target ? ` · ${esc(x.target)}` : ""}</div>
      <div class="muted">${esc(kstTime(x.at))} · ${esc(who)}</div>
      ${dt ? `<div style="margin-top:4px;font-size:14px">${esc(dt)}</div>` : ""}
    </div>`;
    }).join("") : `<p class="empty">아직 기록이 없어요</p>`);
}
```

- [ ] **Step 5: 개인정보 안내 — `privacy.html`** 의 「5. 카카오 연결 끊기」 카드 **다음에**

```html
  <div class="card">
    <h3>6. 교인 정보(교인명부)</h3>
    <p>교회 교적 프로그램에 등록된 교인 정보를, 담당자가 교인을 찾아 연락하고 · 사역신청이 교적과 맞는지 확인하고 · 인원 현황을 보는 데 써요.<br>
      담는 것: 이름, 직분, 성별, 생년월일·나이, 배우자·신앙세대주(관계), 교인 구분, 등록일, 연락처, 인도자, 이메일,
      교구·목장·교회학교·청년부·선교회 소속, 주소, 사진.<br>
      담지 않는 것: 교적의 메모(기타사항)와 심방 기록.<br>
      보는 사람: 총괄 관리자가 「교인명부」 역할을 드린 담당자만 봐요. 사역신청 담당자에게는 「교적과 맞는지」 표시만 보여요.<br>
      기록: 누가 언제 누구를 찾아보고 내려받았는지 남겨요.<br>
      보관: 새 명단이 나오면 통째로 갈아 끼우고, 명단에서 빠진 분의 정보와 사진은 그때 지워요.<br>
      요청: 4번의 요청처(총괄 관리자 · 이메일 · 교회 사무실)로 말씀해 주세요.</p>
  </div>
```

- [ ] **Step 6: 점검 · localhost · 커밋**

```bash
python tools/preflight.py
python -m http.server 8000
```
  확인: 📋 신청 현황(건별 카드·PC 표·사람별 묶음)에 표시와 뜻풀이 줄 — 개발 신청자 이름이 가짜 명부에 없으면 「교적 없음」이 맞다 · 📋 종이 명단 — 가짜 명부의 이름(예: 「김하늘」 · 기쁨 5목장 / 기쁨 12목장)을 붙여 살펴보기 → 「교적 확인 · 같은 소속에…」 또는 「교적 ✓」 · 📜 바꾼 기록 — 두 단추, 「교인명부 기록」에 찾기·보기·내려받기·명부 올림 · `privacy.html` 6번.

```bash
git add js/menus/ministry/status.js js/menus/ministry/status-ui.js js/menus/ministry/paper.js js/menus/system/audit.js privacy.html
git commit -m "feat(교인명부): 사역 화면 교적 표시 · 바꾼 기록의 「교인명부 기록」 보기 · 개인정보 안내 6번"
```

---

### Task 11: 친구와 확인 → 운영 반영 → 문서 (**친구와 함께**)

**Files:**
- Modify: church-admin `CLAUDE.md`, `.superpowers/sdd/progress.md` · v2 `CLAUDE.md`(표 한 줄 · 다음 작업)

- [ ] **Step 1: localhost:8000 에서 친구가 확인**(개발 · 가짜 명부) — Task 9·10 의 확인 목록을 친구 폰·PC 로. 고칠 것이 나오면 고치고 **새 커밋**, 개발 함수 다시 배포, 개발 시험 다시.
- [ ] **Step 2: 운영 SQL** — 먼저 운영인지 확인(`select count(*) from users` 가 **사백 넘음**):

```bash
supabase --workdir ~/.church-admin/supa-prod db query --linked "select count(*) from users"
supabase --workdir ~/.church-admin/supa-prod db query --linked -f C:/Projects/church-admin/supabase/sql/003_church_people.sql
supabase --workdir ~/.church-admin/supa-prod db query --linked -f C:/Projects/church-admin/supabase/sql/check-authenticated-exposure.sql
```
Expected: 003 마지막 표 `role directory 1` · `bucket 공개(0이어야) 0` / 노출 점검 **0행**

- [ ] **Step 3: 운영 함수** — `git status` 깨끗 → `supabase functions deploy church-admin --no-verify-jwt --project-ref xnomlgydifiqiybervtf`
  - 이 시점엔 명부가 비어 있어 사역 화면의 교적 표시는 **안 나온다**(`church: null`) — 옛 화면 그대로가 맞다.
- [ ] **Step 4: 운영 키 파일 — 친구가 만든다.** Supabase 대시보드(운영) → Project Settings → API Keys → secret 키를 복사해 `~/.church-admin/prod.env` 에 두 줄:
  `PROD_URL=https://xnomlgydifiqiybervtf.supabase.co` · `PROD_SERVICE_KEY=<복사한 키>` (저장소 밖 · **이 파일 내용을 대화·커밋에 적지 않는다**)
- [ ] **Step 5: 진짜 명부를 운영에**

```bash
python tools/people/load_people.py --work "C:/Projects/교인명부_작업/2026-09-29" --target prod           # 살펴보기
python tools/people/load_people.py --work "C:/Projects/교인명부_작업/2026-09-29" --target prod --apply   # 넣기
```
Expected: 살펴보기 `새로 8672 · 바뀜 0 · 빠짐 0 · 사진 올림 4645` → 넣기 `넣었다 — DB 8672명(파일 8672명)`
  - 다시 노출 점검 → **0행**.
- [ ] **Step 6: 화면 푸시** — church-admin `git push`(푸시 = 운영 화면). Actions 가 끝나면 **이번 판에만 있는 글자**로 확인한다:
  `curl -s "https://admin.onlybible.kr/js/menus/registry.js?nocache=$(date +%s)" | grep -c people-stats` → 1 이상
  (옛 판에도 있던 이름으로 보면 CDN 이 옛 파일을 줘도 통과해 「배포 완료」로 착각한다.)
- [ ] **Step 7: 역할 주기 — 친구가 한다.** 총괄 관리자로 admin.onlybible.kr → 🔑 담당자·역할 → 교인명부를 볼 분에게 「교인명부」. 친구 폰으로: 교인 찾기·현황·자세히·내려받기 한 번씩 → 📜 「교인명부 기록」에 남았는지 · 사역 신청 현황에 교적 표시가 뜨는지.
- [ ] **Step 8: 문서**
  - church-admin `CLAUDE.md` 에 절 하나 — 「교인명부(2026-09-29)」: 새 명단이 오면 `parse_people.py → fetch_photos.py → load_people.py(살펴보기) → --apply` · 작업 폴더·키 위치 · ⚠️ 개발엔 가짜만 · 5% 멈춤 · 사진 칸은 비공개(⑦) · 사역 응답에 교적 값 금지 · 열람 기록은 「교인명부 기록」.
  - `.superpowers/sdd/progress.md` 에 한 줄(무엇을 운영에 올렸나 · 운영 수 8,672 / 사진 4,645).
  - v2 `CLAUDE.md` 「어디에 무엇이 적혀 있나」 표에 한 줄: `| 교인명부(어드민 · dimode 교인목록·사진) | docs/superpowers/specs/2026-09-29-church-people-directory-design.md |` · 다음 작업에 「dimode 에 사진 주소가 로그인 없이 열린다고 알리기」.
  - 친구에게 묻기: `~/.church-admin/prod.env` 를 지울지(다음 명단 때 다시 만들지) · `C:\Projects\교인목록_2026_09_29_정리.xlsx`·`교인사진_2026_09_29` 를 지울지.
- [ ] **Step 9: 커밋** — 각 저장소에서 바꾼 파일만 경로로(v2 는 여러 세션이 함께 쓰므로 `git diff --cached` 로 남의 것이 없는지 본다).
