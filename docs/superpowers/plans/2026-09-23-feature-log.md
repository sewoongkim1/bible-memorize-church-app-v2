# 못 재는 기능에 기록을 심는다 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 시편 액자·매일 묵상·말씀 앨범·사용 설명서·푸시 열람 다섯 곳에 열람 기록을 심어, 다음 분석에서 「몇 명에게 닿나」를 숫자로 답할 수 있게 한다.

**Architecture:** 통합 표 `feature_log(user_id, day, feature, item, cnt)` 하나 + Edge Function 액션 `featureLog` 하나 + 앱 공용 함수 `logFeature()` 하나. `blessing_log` 가 검증한 모양(하루×사람×번호 1행, `cnt` 만 증가)을 그대로 일반화한다. 기록은 **부수적**이라 실패해도 화면을 막지 않는다.

**Tech Stack:** Postgres(Supabase) · Deno Edge Function(TypeScript) · Vanilla JS · bash+curl 스모크 테스트

**설계 문서:** `docs/superpowers/specs/2026-09-23-feature-log-design.md` — 「왜 이 모양인가」는 전부 거기 있다. 이 계획은 「어떻게」만 적는다.

## Global Constraints

- **개발 DB 먼저, 운영은 확인 뒤.** 개발 `ktpwthwqzgcqcrmsafdo` · 운영 `xnomlgydifiqiybervtf`.
- **배포 순서는 SQL이 먼저, 코드가 나중.** 새 표에 새 액션만 얹는 경우라 빈 표는 아무도 안 읽는다.
- **기록은 절대 화면을 막지 않는다.** 서버 액션은 예외를 던지지 않고, 앱은 `await` 하지 않는다.
- **응답에 `user_id` 를 싣지 않는다.** 이 API 는 JWT 가 없다.
- **표를 만들면 그 자리에서 `enable row level security`.** 뷰는 만들지 않는다.
- **`feature` 에 DB `CHECK` 제약을 걸지 않는다.** 허용 목록은 `index.ts` 한 곳에만 둔다.
- **`feature` 값 일곱 (이 철자 그대로):** `psalm` · `meditation` · `meditation-auto` · `album` · `album-play` · `guide` · `push`
- **커밋은 경로를 못 박는다.** `git add -A` 금지. 여러 세션이 같은 체크아웃을 쓴다. 커밋 직전 `git diff --cached --name-only` 로 남의 파일이 없는지 본다.
- **`python tools/bump.py` 는 맨 마지막 한 번**(Task 9). 중간에 돌리면 `index.html`·`app.js` 가 남과 충돌한다.
- 이 저장소는 **공개**다. 키·비밀번호를 커밋하지 않는다(`DEV_ANON` 은 환경변수로 받는다).

---

## File Structure

| 파일 | 새로/고침 | 책임 |
|---|---|---|
| `supabase/feature_log.sql` | 새로 | 표·함수·RLS + 「보는 법」 질의 여섯 |
| `supabase/psalm_metrics.sql` | 새로 | 시편 전환율·닿는 범위 질의 (`CLAUDE.md` 의 미완 과제) |
| `supabase/member_merge.sql` | 고침 | 계정 합치기가 이 표를 알게 (네 자리) |
| `supabase/functions/api/index.ts` | 고침 | `featureLog` 액션 하나 + `switch` 한 줄 |
| `tests/feature-log-smoke.sh` | 새로 | 액션 스모크 — `psalm-smoke.sh` 본을 따른다 |
| `js/api.js` | 고침 | `featureLog` 한 줄 |
| `app.js` | 고침 | 공용 `logFeature()` + 묵상 2·앨범 2·푸시 1 자리 |
| `js/psalm.js` | 고침 | 시편 액자 한 자리 |
| `guide/index.html` | 고침 | 설명서 한 자리(독립 fetch) |
| `sw.js` | 고침 | 알림 클릭에 `from=push` 표식 |

---

## Task 1: 표 · 함수 · 계정 합치기

**Files:**
- Create: `supabase/feature_log.sql`
- Modify: `supabase/member_merge.sql` (네 자리)

**Interfaces:**
- Produces: 표 `public.feature_log(user_id uuid, day date, feature text, item int, cnt int)` · 함수 `public.v2_feature_log(uid uuid, f text, n int) returns void`

- [ ] **Step 1: `supabase/feature_log.sql` 을 만든다**

```sql
-- 못 재는 기능에 기록을 심는다 — 열람 기록 통합 표 (2026-09-23)
--   Supabase SQL Editor 에서 1회 실행. ⚠️ 개발(ktpwthwqzgcqcrmsafdo) 먼저, 확인 뒤 운영.
--   설계: docs/superpowers/specs/2026-09-23-feature-log-design.md
--
-- ■ 왜 남기나
--   시편 액자·매일 묵상·말씀 앨범·사용 설명서·푸시 열람이 서버에 흔적을 안 남겨
--   「몇 명에게 닿나」를 말할 수가 없었다(2026-09-23 사용 분석 4장).
--   카드 모드가 그랬다 — 도입하고 여덟 달을 측정 못 하다가 28.5%인 걸 뒤늦게 알았다.
--
-- ■ blessing_log 를 일반화한 것이다. 한 사람이 하루에 한 항목을 여러 번 봐도 **한 행**이다.
--   열 때마다 한 행씩 쌓으면 금세 커진다(challenge_log 11,052행 → 집계 579행).
--
-- ■ 날짜는 한국 시간 기준이다. UTC 로 두면 밤에 보신 것이 다음 날로 넘어간다.
--
-- ■ feature 값 일곱 — psalm · meditation · meditation-auto · album · album-play · guide · push
--   ⚠️ **CHECK 제약을 일부러 걸지 않았다.** 걸면 허용 목록이 화면·서버·DB 세 곳이 되어,
--      새 기능을 더할 때 앱은 보내는데 저장만 조용히 막힌다(challenge_log.mode 에서 겪었다).
--      허용 목록은 supabase/functions/api/index.ts 의 FEATURES 한 곳에만 둔다.
--
-- ■ item 의 뜻은 기능마다 다르다
--     psalm                      = 구절 번호 no (= 1000 + day_no)
--     meditation, meditation-auto = 그 주 구절 번호
--     album, album-play, guide, push = 0

create table if not exists public.feature_log (
  user_id uuid not null references public.users(id) on delete cascade,
  day     date not null default ((now() at time zone 'Asia/Seoul')::date),
  feature text not null,
  item    int  not null default 0,      -- 기본키에 null 을 못 넣어 0 을 기본값으로 둔다
  cnt     int  not null default 1,
  primary key (user_id, day, feature, item)
);

-- ⚠️ 표를 만들면 그 자리에서 RLS 를 켠다 — 안 켜면 공개 키로 통째로 읽힌다.
--    2026-08-25 event_entries 가 그걸 빠뜨려 user_id 47건이 새어 나갔다.
--    이 표에도 user_id 가 있어 더더욱 그렇다. Edge Function(service_role)만 읽고 쓴다.
alter table public.feature_log enable row level security;

create index if not exists feature_log_day_idx  on public.feature_log (day);
create index if not exists feature_log_feat_idx on public.feature_log (feature, day);

-- 한 번 여는 것을 한 번 세는 함수. 있으면 cnt 를 올리고 없으면 만든다.
create or replace function public.v2_feature_log(uid uuid, f text, n int)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.feature_log (user_id, feature, item) values (uid, f, coalesce(n, 0))
  on conflict (user_id, day, feature, item) do update set cnt = public.feature_log.cnt + 1;
$$;

revoke all on function public.v2_feature_log(uuid, text, int) from public, anon, authenticated;
grant execute on function public.v2_feature_log(uuid, text, int) to service_role;
```

- [ ] **Step 2: 개발 DB 에서 실행한다**

Supabase Dashboard → 프로젝트 **`ktpwthwqzgcqcrmsafdo`**(개발) → SQL Editor → 위 파일을 통째로 붙여넣고 RUN.

기대: `Success. No rows returned`

- [ ] **Step 3: 표가 실제로 생겼는지, 그리고 공개 키로 안 읽히는지 확인한다**

SQL Editor 에서:

```sql
select count(*) from public.feature_log;                    -- 0 이 나와야 한다
select public.v2_feature_log(
  (select id from public.users limit 1), 'psalm', 1042);     -- 한 번 넣어 본다
select * from public.feature_log;                            -- cnt=1 인 한 행
select public.v2_feature_log(
  (select id from public.users limit 1), 'psalm', 1042);     -- 같은 것을 또
select * from public.feature_log;                            -- 여전히 한 행, cnt=2
delete from public.feature_log;                              -- 시험한 것을 지운다
```

기대: **행이 둘로 늘지 않고 `cnt` 가 2 가 된다.** 이것이 이 표의 핵심이다.

그리고 **RLS 가 정말 막는지**를 터미널에서 본다(⚠️ 공개 키로 읽히면 `user_id` 가 새는 것이다):

```bash
curl -s "https://ktpwthwqzgcqcrmsafdo.supabase.co/rest/v1/feature_log?select=*&limit=1" \
  -H "apikey: $DEV_ANON" -H "Authorization: Bearer $DEV_ANON"
```

기대: `[]` 또는 권한 오류. **행이 오면 RLS 가 안 걸린 것이다 — 멈추고 `alter table ... enable row level security` 를 다시 확인한다.**

- [ ] **Step 4: `supabase/member_merge.sql` 네 자리를 고친다**

같은 분이 두 계정으로 갈렸다가 합쳐질 때 이 표가 따라가야 한다. 빠뜨리면 외래키에 걸려 **합치기 자체가 실패**한다.

**(1)** 트리거를 다는 표 목록 — `'blessing_log',` 뒤에 더한다:

```sql
  foreach t in array array['progress','challenge_log','reviews','passage_progress','blessing_log','feature_log',
    'board_posts','board_replies','board_reactions','event_entries','push_subscriptions',
    'pilsa_orders','ministry_orders','event_signups','daily_activity'] loop
```

**(2)** FK cascade 검사에서 빼는 목록 — `'blessing_log',` 뒤에 더한다:

```sql
    if ref.tbl::text not in ('progress','challenge_log','reviews','passage_progress','blessing_log','feature_log',
      'push_subscriptions','board_posts','board_replies','event_signups') then
```

**(3)** `user_id` 칼럼 검사에서 빼는 목록 — `'blessing_log',` 뒤에 더한다:

```sql
      and c.table_name not in ('progress','challenge_log','reviews','passage_progress','blessing_log','feature_log',
        'push_subscriptions','board_posts','board_replies','board_reactions','event_entries',
        'daily_activity','pilsa_orders','ministry_orders','event_signups','user_identity_aliases','user_profile_changes')
```

**(4)** 실제로 옮기는 블록 — `blessing_log` 블록(`if to_regclass('public.blessing_log') is not null then ... end if;`) **바로 뒤**에 더한다:

```sql
  if to_regclass('public.feature_log') is not null then
    insert into public.feature_log(user_id,day,feature,item,cnt)
      select t.id,day,feature,item,cnt from public.feature_log where user_id=s.id
      on conflict(user_id,day,feature,item) do update set cnt=feature_log.cnt+excluded.cnt;
    delete from public.feature_log where user_id=s.id;
  end if;
```

- [ ] **Step 5: 고친 `member_merge.sql` 을 개발 DB 에서 실행한다**

SQL Editor 에 **파일 전체**를 붙여넣고 RUN(`create or replace` 라 여러 번 돌려도 안전하다).

기대: `Success. No rows returned`

- [ ] **Step 6: 계정 합치기가 아직 도는지 확인한다**

```bash
node tests/member-merge.test.cjs
```

기대: 전부 통과. ⚠️ **이 테스트는 npm 꾸러미가 필요하다** — `Cannot find module` 이 나오면 `npm install` 을 먼저 하거나, 안 되면 이 단계를 건너뛰고 Step 5 의 RUN 이 성공한 것으로 갈음한다(그 경우 Task 9 에서 운영에 넣기 전에 한 번 더 확인한다).

- [ ] **Step 7: 커밋**

```bash
git add supabase/feature_log.sql supabase/member_merge.sql
git diff --cached --name-only    # 이 둘만 나와야 한다
git commit -- supabase/feature_log.sql supabase/member_merge.sql -m "feat(계측): 열람 기록 통합 표 feature_log — 표·함수·RLS·계정 합치기"
```

---

## Task 2: 서버 액션 `featureLog`

**Files:**
- Create: `tests/feature-log-smoke.sh`
- Modify: `supabase/functions/api/index.ts` (액션 함수 하나 + `switch` 한 줄)

**Interfaces:**
- Consumes: Task 1 의 `v2_feature_log(uid, f, n)`
- Produces: 액션 `featureLog` — 요청 `{action:"featureLog", user_id, feature, item}` → 응답 `{ok:true}` 또는 `{ok:true, skipped:"..."}`. **어떤 경우에도 `ok:false` 나 HTTP 오류를 내지 않는다.**

- [ ] **Step 1: 실패하는 스모크 테스트를 쓴다**

`tests/feature-log-smoke.sh`:

```bash
#!/usr/bin/env bash
# 열람 기록(featureLog) — 읽기/쓰기 스모크. 기본은 개발 DB.
#   DEV_ANON=... bash tests/feature-log-smoke.sh
#   FL_ENV=prod PROD_ANON=... bash tests/feature-log-smoke.sh
#
# ⚠️ 실제로 행이 쌓였는지는 여기서 못 본다(RLS 로 공개 키가 못 읽는다 — 그게 맞다).
#    행 확인은 SQL Editor 에서 한다. 여기서 보는 것은 **액션이 무엇을 돌려주는가** 다.
set -u
if [ "${FL_ENV:-dev}" = "prod" ]; then
  BASE="https://xnomlgydifiqiybervtf.supabase.co/functions/v1/api"
  KEY="${PROD_ANON:?PROD_ANON 환경변수가 필요합니다}"
else
  BASE="https://ktpwthwqzgcqcrmsafdo.supabase.co/functions/v1/api"
  KEY="${DEV_ANON:?DEV_ANON 환경변수가 필요합니다}"
fi

call() {
  curl -s -X POST "$BASE" -H "Content-Type: application/json" \
    -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -d "$1"
}

pass=0; fail=0
chk() { # 이름, 실제, 기대
  if [ "$2" = "$3" ]; then echo "  ✓ $1 = $2"; pass=$((pass+1));
  else echo "  ✗ $1 = $2  (기대 $3)"; fail=$((fail+1)); fi
}

echo "■ 시험용 계정을 하나 만든다(개발 DB — login 은 모르는 이름이면 계정을 만들어 준다)"
UID_JSON=$(call '{"action":"login","type":"교구","gu":"계측","mok":"계측","name":"계측시험"}')
# TEST_UID를 쓰는 이유: UID는 bash 기본 환경변수(OS user id)라 할당이 무시된다
TEST_UID=$(echo "$UID_JSON" | grep -o '"user_id":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -z "$TEST_UID" ]; then
  TEST_UID=$(echo "$UID_JSON" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
fi
if [ -z "$TEST_UID" ]; then echo "  ✗ 시험 계정을 못 만들었다: $UID_JSON"; exit 1; fi
echo "  · user_id = ${TEST_UID:0:8}…"

echo "■ 올바른 기록은 ok"
for F in psalm meditation meditation-auto album album-play guide push; do
  R=$(call "{\"action\":\"featureLog\",\"user_id\":\"$TEST_UID\",\"feature\":\"$F\",\"item\":0}")
  chk "$F" "$(echo "$R" | grep -o '"ok":true')" '"ok":true'
done

echo "■ 같은 것을 두 번 보내도 ok (표에서는 cnt 만 오른다)"
R=$(call "{\"action\":\"featureLog\",\"user_id\":\"$TEST_UID\",\"feature\":\"psalm\",\"item\":1042}")
chk "psalm 재호출" "$(echo "$R" | grep -o '"ok":true')" '"ok":true'

echo "■ 모르는 feature 는 조용히 버린다(오류가 아니다)"
R=$(call "{\"action\":\"featureLog\",\"user_id\":\"$TEST_UID\",\"feature\":\"몰라\",\"item\":0}")
chk "모르는 feature ok"      "$(echo "$R" | grep -o '"ok":true')"    '"ok":true'
chk "모르는 feature skipped" "$(echo "$R" | grep -o '"skipped"')"    '"skipped"'

echo "■ user_id 가 없으면 조용히 버린다"
R=$(call '{"action":"featureLog","feature":"psalm","item":1}')
chk "user_id 없음 ok"      "$(echo "$R" | grep -o '"ok":true')" '"ok":true'
chk "user_id 없음 skipped" "$(echo "$R" | grep -o '"skipped"')" '"skipped"'

echo "■ 응답에 user_id 가 실리면 안 된다(이 API 에는 JWT 가 없다)"
R=$(call "{\"action\":\"featureLog\",\"user_id\":\"$TEST_UID\",\"feature\":\"psalm\",\"item\":7}")
chk "응답에 user_id 없음" "$(echo "$R" | grep -c 'user_id')" "0"

echo ""
echo "통과 $pass · 실패 $fail"
[ "$fail" -eq 0 ]
```

- [ ] **Step 2: 테스트를 돌려 실패를 확인한다**

```bash
DEV_ANON=$(grep -o 'sb_publishable_eJKP[^"]*' js/config.js) bash tests/feature-log-smoke.sh
```

기대: **`featureLog` 를 모르는 액션이라 전부 `✗`.** 아직 서버에 그 액션이 없으니 당연하다. 여기서 통과가 뜨면 테스트가 잘못된 것이다.

- [ ] **Step 3: 액션을 구현한다**

`supabase/functions/api/index.ts` 의 `blessingLog` 함수(파일 안에서 `async function blessingLog` 로 찾는다) **바로 뒤**에 더한다:

```ts
// ---------- 열람 기록(featureLog) ----------
// 못 재던 기능들이 「몇 명에게 닿는지」를 남긴다 — blessing_log 를 일반화한 것이다.
// ⚠️ 허용 목록은 **여기 한 곳뿐이다.** DB 에 CHECK 를 걸지 않았다 — 걸면 목록이 세 곳이
//    되어 새 기능을 더할 때 앱은 보내는데 저장만 조용히 막힌다(challenge_log.mode 에서 겪었다).
// ⚠️ 실패해도 조용히 넘긴다. 기록 때문에 시편 액자가 안 열리면 본말이 뒤집힌다.
// ⚠️ 표(feature_log.sql)를 아직 안 만든 판에서도 앱은 그대로 돌아야 한다.
// ⚠️ 응답에 user_id 를 싣지 않는다 — 이 API 에는 JWT 가 없다.
const FEATURES = new Set([
  "psalm",            // 시편 액자 한 편을 펼쳐 봄 (item = 구절 번호)
  "meditation",       // 성도님이 눌러서 연 묵상 (item = 그 주 구절 번호)
  "meditation-auto",  // 하루 한 번 저절로 뜬 묵상 (위 숫자의 분모)
  "album",            // 앨범 화면을 엶
  "album-play",       // 듣기를 시작함 — 화면만 열고 마는 분을 가른다
  "guide",            // 사용 설명서를 엶
  "push",             // 알림을 눌러 앱이 열림
]);

async function featureLog(b: any) {
  if (!b.user_id || !FEATURES.has(String(b.feature))) return { ok: true, skipped: true };
  try {
    const { error } = await db.rpc("v2_feature_log", {
      uid: b.user_id, f: String(b.feature), n: Number(b.item) || 0,
    });
    if (error) {
      const m = String(error.message || "");
      const why = /does not exist|schema cache|function/i.test(m) ? "no-table"
                : /foreign key|violates/i.test(m) ? "no-user" : "db";
      return { ok: true, skipped: why };
    }
  } catch (_e) {
    return { ok: true, skipped: "error" };
  }
  return { ok: true };
}
```

그리고 `switch` 의 `case "blessingLog":` 줄 **바로 뒤**에 한 줄:

```ts
      case "featureLog":          return json(await featureLog(body));
```

- [ ] **Step 4: 개발에 배포한다**

```bash
git status --short          # ⚠️ 먼저 본다 — deploy 는 git 이 아니라 작업 트리를 올린다
supabase functions deploy api --no-verify-jwt --project-ref ktpwthwqzgcqcrmsafdo
```

기대: `Deployed Functions on project ktpwthwqzgcqcrmsafdo: api`

- [ ] **Step 5: 테스트를 다시 돌려 통과를 확인한다**

```bash
DEV_ANON=$(grep -o 'sb_publishable_eJKP[^"]*' js/config.js) bash tests/feature-log-smoke.sh
```

기대: `통과 13 · 실패 0`

- [ ] **Step 6: 행이 실제로 쌓였는지 개발 DB 에서 본다**

SQL Editor(개발):

```sql
select feature, item, cnt from public.feature_log order by feature, item;
```

기대: 일곱 `feature` 가 보이고, `psalm` 은 `item=0`(cnt 1) · `item=7`(cnt 1) · `item=1042`(cnt 1) 세 행. **`몰라` 는 없어야 한다.**

시험 흔적을 지운다:

```sql
delete from public.feature_log
 where user_id in (select id from public.users where name = '계측시험');
delete from public.users where name = '계측시험';
```

- [ ] **Step 7: 커밋**

```bash
git add tests/feature-log-smoke.sh
git diff --cached --name-only
git commit -- tests/feature-log-smoke.sh supabase/functions/api/index.ts -m "feat(계측): featureLog 액션 — 허용 목록 한 곳 · 실패해도 조용히"
```

⚠️ `index.ts` 는 여러 세션이 함께 쓰는 파일이다. `git diff --cached` 로 **내 헝크만** 담겼는지 보고, 남의 것이 섞였으면 `git reset` 후 `git apply --cached` 로 내 헝크만 담는다.

---

## Task 3: 앱 공용 함수 `logFeature()`

**Files:**
- Modify: `js/api.js` (한 줄)
- Modify: `app.js` (공용 함수 하나)

**Interfaces:**
- Consumes: Task 2 의 액션 `featureLog`
- Produces: 전역 함수 `logFeature(feature, item)` — 반환값 없음. Task 4·5·6·7 이 이것만 부른다.

- [ ] **Step 1: `js/api.js` 에 한 줄 더한다**

`blessingLog: (p) => supaCall("blessingLog", p),` 줄 **바로 뒤**:

```js
  featureLog: (p) => supaCall("featureLog", p),          // 열람 기록 — 응답을 기다리지 않는다
```

- [ ] **Step 2: `app.js` 에 공용 함수를 더한다**

`blessingLog` 를 부르는 줄(`api.blessingLog({ user_id: u.user_id, no: b.no })` — 파일에서 그 문자열로 찾는다)이 든 함수 **바로 앞**에 둔다. 두 기록이 한자리에 모여 있어야 나중에 찾기 쉽다.

```js
// ---------- 열람 기록 ----------
// 못 재던 기능이 「몇 명에게 닿는지」를 남긴다(설계: docs/superpowers/specs/2026-09-23-feature-log-design.md).
// ⚠️ await 하지 않는다 — 기다릴 이유가 없고, 기다리면 느린 통신에서 화면이 늦어진다.
// ⚠️ 어떤 실패도 화면을 막지 않는다. 기록 때문에 액자가 안 열리면 본말이 뒤집힌다.
// ⚠️ 같은 (기능,항목)을 60초 안에 다시 보내지 않는다 — 화면이 다시 그려지는 것과
//    사람이 다시 들어오는 것을 가른다. 하루로 막으면 cnt 가 1 에 고정돼 뜻이 사라지고,
//    아예 안 막으면 재렌더마다 가짜로 오른다. 60초가 그 사이를 가른다.
const featSent = {};                       // 창을 닫으면 사라진다(메모리만 · localStorage 를 쓰지 않는다)
function logFeature(feature, item) {
  try {
    const u = loadUser();
    if (!u || !u.user_id) return;          // 로그인 전이면 아무것도 안 한다
    const k = feature + ":" + (item || 0), now = Date.now();
    if (featSent[k] && now - featSent[k] < 60000) return;
    featSent[k] = now;
    api.featureLog({ user_id: u.user_id, feature: feature, item: item || 0 });
  } catch (e) {}
}
```

- [ ] **Step 3: 문법을 검사한다**

```bash
python tools/preflight.py
```

기대: 통과(0.4초 안). ⚠️ 여기서 걸리면 **푸시해도 배포가 아예 안 돈다** — 지금 고친다.

- [ ] **Step 4: localhost 에서 함수가 살아 있는지 본다**

```bash
python -m http.server 8000
```

브라우저에서 `http://localhost:8000` → **오른쪽 위에 「개발 DB」 띠가 보이는지 먼저 확인한다**(안 보이면 운영을 보고 있는 것이다 — 멈춘다). 로그인한 뒤 콘솔에서:

```js
logFeature("psalm", 1042);   // 아무 오류도 안 나야 한다
logFeature("psalm", 1042);   // 60초 안이라 두 번째는 안 나간다
```

개발자도구 Network 탭에서 `api` 요청이 **한 번만** 나갔는지 본다.

- [ ] **Step 5: 커밋**

```bash
git diff --cached --name-only
git commit -- js/api.js app.js -m "feat(계측): 앱 공용 logFeature() — 60초 중복창, 실패 무시"
```

---

## Task 4: 시편 액자 · 말씀 앨범 세 자리

**Files:**
- Modify: `js/psalm.js` (`drawPsalmHome` 안 한 줄)
- Modify: `app.js` (`renderAlbum` · `albumPlayStart` 각 한 줄)

**Interfaces:**
- Consumes: Task 3 의 `logFeature(feature, item)`

- [ ] **Step 1: 시편 액자에 심는다**

`js/psalm.js` 의 `drawPsalmHome()` 안, `psalmHomeDay = shown.dayNo;` 줄 **바로 뒤**:

```js
  // 이 액자가 실제로 펼쳐졌다 — 「180편이 몇 명에게 닿나」는 이 기록으로만 알 수 있다.
  // item 은 dayNo 가 아니라 구절 번호(no)다 — challenge_log.verse_no 와 같은 값이라야
  // 「액자를 본 분 중 몇 %가 암송까지 갔나」를 join 으로 잴 수 있다(psalm_metrics.sql).
  if (typeof logFeature === "function") logFeature("psalm", shown.no);
```

⚠️ `drawPsalmHome()` 은 「◀ 이전 / 다음 ▶」 로 넘길 때마다 다시 불린다. **그것이 맞다** — 다른 편을 본 것이므로 `item` 이 달라 각각 한 행이 된다. 같은 편을 다시 그리는 경우는 60초 중복창이 막는다.

- [ ] **Step 2: 앨범 화면에 심는다**

`app.js` 의 `function renderAlbum() {` 안, `const u = loadUser();` 줄 **바로 뒤**:

```js
  logFeature("album", 0);          // 화면을 연 것. 아래 album-play 와 짝이다
```

- [ ] **Step 3: 앨범 듣기 시작에 심는다**

`app.js` 의 `function albumPlayStart(items) {` 안, `if (!items.length) { ... return; }` 줄 **바로 뒤**(고를 것이 없어 돌아가는 경우는 재생이 아니다):

```js
  logFeature("album-play", 0);     // 실제로 듣기 시작한 것. album 과의 차이가 「열고도 안 듣는 분」이다
```

- [ ] **Step 4: 문법 검사**

```bash
python tools/preflight.py
```

기대: 통과

- [ ] **Step 5: localhost 에서 세 자리를 다 밟아 본다**

`python -m http.server 8000` → 「개발 DB」 띠 확인 → 로그인 →
① 시편 액자를 열고 「다음 ▶」 로 한 번 넘긴다 ② 앨범 화면을 연다 ③ 구절을 골라 듣기를 시작한다.

⚠️ **시편은 게이트가 있다** — 개발에서 안 열리면 주소에 `?psalm=1` 을 붙여 연다.
⚠️ **앨범은 3단계까지 마친 구절이 있어야** 목록이 보인다. 없으면 개발 계정으로 한 구절을 끝까지 마친 뒤 연다.

개발 DB SQL Editor:

```sql
select feature, item, cnt from public.feature_log order by feature, item;
```

기대: `album`(1행) · `album-play`(1행) · `psalm`(**두 행** — 넘겨 본 편이 둘이므로 `item` 이 다르다)

- [ ] **Step 6: 커밋**

```bash
git diff --cached --name-only
git commit -- js/psalm.js app.js -m "feat(계측): 시편 액자·앨범 열기·듣기 시작에 기록을 심는다"
```

---

## Task 5: 매일 묵상 — 능동과 수동을 가른다

**Files:**
- Modify: `app.js` (`maybeShowWeeklyMeditation` 안 한 자리)

**Interfaces:**
- Consumes: Task 3 의 `logFeature(feature, item)`

**왜 이 태스크가 따로인가:** 묵상은 **하루 한 번 저절로 뜬다.** 그냥 기록하면 「묵상을 본 사람 = 앱을 연 사람」이 되어 숫자가 뜻을 잃는다. 그래서 `meditation`(눌러서)과 `meditation-auto`(저절로)를 갈라 남긴다. **이 구분을 못 하면 이 태스크는 실패한 것이다.**

- [ ] **Step 1: 자동/수동을 가르는 자리를 찾는다**

`app.js` 의 `function maybeShowWeeklyMeditation(force, withTabs) {` 안에서 이 블록을 찾는다:

```js
    if (!force) {                                // 하루 1회만 자동 표시(미리보기는 무시). 이번주 구절 기준으로 고정(대체 여부 무관).
      const key = dailyMsgSeenKey(`med-${info.verse.no}-${pick}`);
      try { if (localStorage.getItem(key) === "1") return; } catch {}
      try { localStorage.setItem(key, "1"); } catch {}
    }
```

`force` 가 거짓이면 자동 팝업이고, 참이면 성도님이 눌러서 연 것이다. **그리고 이 블록은 「오늘 이미 봤으면」 `return` 으로 빠져나간다** — 그 경우는 창이 안 뜨므로 기록도 하면 안 된다.

- [ ] **Step 2: 그 블록 바로 뒤에 한 줄을 더한다**

```js
    if (!force) {                                // 하루 1회만 자동 표시(미리보기는 무시). 이번주 구절 기준으로 고정(대체 여부 무관).
      const key = dailyMsgSeenKey(`med-${info.verse.no}-${pick}`);
      try { if (localStorage.getItem(key) === "1") return; } catch {}
      try { localStorage.setItem(key, "1"); } catch {}
    }
    // ⚠️ 여기는 창이 **실제로 뜨는 것이 확정된** 자리다(위에서 '오늘 이미 봤으면' return 했다).
    //    저절로 뜬 것과 눌러서 연 것을 가른다 — 뭉쳐 남기면 「묵상을 본 사람 = 앱을 연 사람」이
    //    되어 숫자가 뜻을 잃는다. 나중에 meditation ÷ meditation-auto 로 능동 비율을 본다.
    logFeature(force ? "meditation" : "meditation-auto", info.verse.no);
```

⚠️ `item` 은 `verse.no` 가 아니라 **`info.verse.no`** 다 — `verse` 는 지난주 자료로 대체됐을 수 있고(`usingPrev`), 그러면 「이번 주에 몇 명이 묵상을 봤나」가 지난주 구절 번호로 흩어진다. 위의 `dailyMsgSeenKey` 도 같은 이유로 `info.verse.no` 를 쓴다.

- [ ] **Step 3: 문법 검사**

```bash
python tools/preflight.py
```

기대: 통과

- [ ] **Step 4: 두 갈래를 다 밟아 본다**

`python -m http.server 8000` → 「개발 DB」 띠 확인 → 로그인.

**(가) 자동** — 오늘 처음 들어가면 묵상 창이 저절로 뜬다. 이미 봤다면 콘솔에서 지우고 새로고침한다:

```js
Object.keys(localStorage).filter(k => k.includes("med-")).forEach(k => localStorage.removeItem(k));
location.reload();
```

**(나) 수동** — 첫 화면에서 「오늘의 묵상」 단추를 눌러 연다.

개발 DB SQL Editor:

```sql
select feature, item, cnt from public.feature_log where feature like 'meditation%';
```

기대: **`meditation` 과 `meditation-auto` 두 행**이 각각 있고 `item` 이 같다(같은 주 구절이므로).
한쪽만 나오면 `force` 분기가 안 잡힌 것이다 — Step 2 를 다시 본다.

- [ ] **Step 5: 커밋**

```bash
git diff --cached --name-only
git commit -- app.js -m "feat(계측): 매일 묵상 — 눌러서 연 것과 저절로 뜬 것을 갈라 남긴다"
```

---

## Task 6: 사용 설명서 `guide/`

**Files:**
- Modify: `guide/index.html`

**Interfaces:**
- Consumes: Task 2 의 액션 `featureLog` (⚠️ Task 3 의 `logFeature` 를 쓰지 **않는다** — 이 페이지는 `app.js` 를 안 읽는다)

**⚠️ 이 숫자의 뜻:** `guide/` 는 **일부러 로그인이 필요 없게 만든 페이지**다(파일 머리 주석 — 「설치 전에도, 로비에서 QR로도 바로 열린다」). 그래서 이 기록은 **「설명서를 본 사람 수」가 아니라 「앱에 로그인한 채 설명서를 누른 사람 수」** 다. 나중에 읽을 때 그 차이를 잊으면 안 된다.

- [ ] **Step 1: `config.js` 를 불러 온다**

`guide/index.html` 에서 `<script>` 로 시작하는 줄(인라인 스크립트가 시작되는 자리 — `var STEPS = [` 위)을 찾아, 그 **바로 앞**에 한 줄을 넣는다:

```html
<!-- 열람 기록에 쓸 Supabase 주소·공개 키. 주소를 보고 운영/개발이 저절로 갈린다.
     ⚠️ tools/bump.py 는 index.html 만 훑으므로 이 태그에는 캐시번호가 안 붙는다 —
        js/config.js 를 고치는 날엔 이 페이지도 함께 봐야 한다. -->
<script src="../js/config.js"></script>
```

- [ ] **Step 2: 기록 한 조각을 넣는다**

같은 파일의 인라인 `<script>` **맨 위**(`var STEPS = [` 바로 앞)에 넣는다:

```js
// ---------- 열람 기록 ----------
// 이 설명서가 실제로 쓰이는지 남긴다. ⚠️ 이 페이지는 로그인이 필요 없다 —
// localStorage 에 user_id 가 없는 분(로비 QR·주보로 온 분)은 기록되지 않는다.
// 그러니 이 숫자는 「앱에 로그인한 채 설명서를 누른 사람 수」다.
// ⚠️ 무엇이 실패해도 설명서는 그대로 열려야 한다 — 전부 try 안에 둔다.
(function () {
  try {
    var raw = localStorage.getItem("memorize-user");
    if (!raw || !window.SUPA) return;
    var uid = (JSON.parse(raw) || {}).user_id;
    if (!uid) return;
    fetch(window.SUPA.URL + "/functions/v1/api", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + window.SUPA.ANON,
        "apikey": window.SUPA.ANON,
      },
      body: JSON.stringify({ action: "featureLog", user_id: uid, feature: "guide", item: 0 }),
    }).catch(function () {});
  } catch (e) {}
})();
```

⚠️ `"memorize-user"` 는 `app.js:683` 의 `const USER_KEY = "memorize-user"` 를 옮겨 적은 것이다(2026-09-23 확인). 이 페이지는 `loadUser()` 를 못 쓰므로 **키 이름이 두 곳에 적히는 것을 감수한 것**이고, `USER_KEY` 를 바꾸는 날엔 이 파일도 함께 고쳐야 한다. 틀리면 오류 없이 **조용히 0건**이 된다.

- [ ] **Step 3: localhost 에서 확인한다**

`python -m http.server 8000` → 로그인한 상태에서 `http://localhost:8000/guide/` 를 연다.

개발자도구 Network 탭에 `api` POST 가 **한 번** 보이고 응답이 `{"ok":true}` 여야 한다.

개발 DB SQL Editor:

```sql
select feature, cnt from public.feature_log where feature = 'guide';
```

기대: 한 행. **안 나오면** ① localStorage 키 이름 ② `window.SUPA` 가 undefined 는 아닌지(콘솔에서 `window.SUPA` 를 쳐 본다) 둘을 본다.

- [ ] **Step 4: 로그인 안 한 상태에서도 설명서가 멀쩡한지 본다**

시크릿 창에서 `http://localhost:8000/guide/` 를 연다.

기대: **설명서가 평소대로 열리고 콘솔에 오류가 없다.** 기록은 안 남는다(그게 맞다).

- [ ] **Step 5: 커밋**

```bash
git diff --cached --name-only
git commit -- guide/index.html -m "feat(계측): 사용 설명서 열람 기록 — 로그인한 분만 잡힌다"
```

---

## Task 7: 푸시 열람

**Files:**
- Modify: `sw.js` (`notificationclick`)
- Modify: `app.js` (시작할 때 표식을 읽는 함수 하나 + 부르는 자리)

**Interfaces:**
- Consumes: Task 3 의 `logFeature(feature, item)`
- Produces: 없음(마지막 자리다)

- [ ] **Step 1: 서비스워커가 표식을 붙이게 한다**

`sw.js` 의 `notificationclick` 블록을 통째로 바꾼다:

```js
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "./";
  // 알림을 눌러 들어온 것임을 앱에 알린다 — 발송(push_log)은 남지만 「누가 눌렀는지」는
  // 지금껏 아무 데도 안 남았다. 앱이 이 표식을 보고 한 번 기록한 뒤 주소에서 지운다.
  // ⚠️ 기존 딥링크(?v=38)와 섞여도 안전하도록 파라미터로 붙인다.
  const marked = url + (url.indexOf("?") >= 0 ? "&" : "?") + "from=push";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) {
          // ⚠️ 이미 열린 창은 focus 만 하고 주소가 안 바뀐다 — 그래서 따로 알린다.
          try { c.postMessage({ type: "from-push" }); } catch (_) {}
          return c.focus();
        }
      }
      return self.clients.openWindow(marked);
    })
  );
});
```

- [ ] **Step 2: 앱이 그 표식을 읽게 한다**

`app.js` 의 `getDeepLinkVerseNo()` 함수 **바로 뒤**에 더한다(딥링크 파라미터를 읽는 함수들이 그 자리에 모여 있다):

```js
// URL의 ?from=push 를 1회 읽어 기록한다(읽은 뒤 주소를 정리 → 새로고침 시 재기록 방지).
// 알림은 발송(push_log)만 남고 「누가 눌렀는지」는 지금껏 아무 데도 안 남았다.
// ⚠️ item 은 0 이다 — 푸시 payload 의 주소에 구절 번호가 실려 있지 않다.
//    「어느 구절 알림이 먹혔나」는 day 로 역산한다(verses.date 가 있다).
// ⚠️ 주소를 지우는 것이 핵심이다. 안 지우면 새로고침마다 다시 세어진다.
//    다른 파라미터(?v=)가 함께 있을 수 있으므로 from 만 빼고 나머지는 살린다.
function readPushMark() {
  try {
    const q = new URLSearchParams(location.search);
    if (q.get("from") !== "push") return;
    q.delete("from");
    const rest = q.toString();
    history.replaceState(null, "", location.pathname + (rest ? "?" + rest : ""));
    logFeature("push", 0);
  } catch (e) {}
}

// 이미 열려 있는 창을 알림으로 되살린 경우 — 주소가 안 바뀌므로 서비스워커가 따로 알려 준다.
try {
  navigator.serviceWorker.addEventListener("message", (e) => {
    if (e.data && e.data.type === "from-push") logFeature("push", 0);
  });
} catch (e) {}
```

- [ ] **Step 3: 시작할 때 부른다**

`app.js` 의 `maybeShowIntro(() => {` 블록 안, `if (loadUser()) enterAfterLogin({ fresh: firstLogin });` 줄 **바로 앞**에 한 줄:

```js
    readPushMark();          // 로그인한 분만 기록된다(logFeature 안에서 거른다)
```

⚠️ `?v=` 를 읽는 `getDeepLinkVerseNo()` 보다 **먼저 부르면 안 된다** — 그쪽이 `history.replaceState(null, "", location.pathname)` 로 파라미터를 통째로 지워 버리는 경우가 있다. 위 자리(`enterAfterLogin` 직전)면 순서가 맞다. 확인은 Step 5 에서 `?v=1&from=push` 로 한다.

- [ ] **Step 4: 문법 검사**

```bash
python tools/preflight.py
```

기대: 통과

- [ ] **Step 5: 주소로 직접 밟아 본다**(진짜 알림을 기다릴 필요가 없다)

`python -m http.server 8000` → 「개발 DB」 띠 확인 → 로그인 → 주소창에 직접:

```
http://localhost:8000/?from=push
```

기대: ① 주소가 곧바로 `http://localhost:8000/` 로 정리된다 ② 새로고침해도 다시 기록되지 않는다.

그리고 딥링크와 섞인 경우:

```
http://localhost:8000/?v=1&from=push
```

기대: **구절 1 암송 화면이 열리고**(딥링크가 살아 있다) 기록도 한 번 남는다.

개발 DB SQL Editor:

```sql
select feature, item, cnt from public.feature_log where feature = 'push';
```

기대: 한 행, `cnt = 2`(위에서 두 번 밟았다 — 60초 중복창에 걸렸다면 1 일 수 있다. 그때는 1분 뒤 다시 밟아 2 가 되는지 본다).

- [ ] **Step 6: 커밋**

```bash
git diff --cached --name-only
git commit -- sw.js app.js -m "feat(계측): 푸시 열람 — 알림을 눌러 들어온 것을 한 번 남긴다"
```

---

## Task 8: 보는 법 — SQL 파일 둘

**Files:**
- Modify: `supabase/feature_log.sql` (「보는 법」 주석을 파일 끝에 더한다)
- Create: `supabase/psalm_metrics.sql`

**Interfaces:**
- Consumes: Task 1 의 표 · Task 4~7 이 쌓은 행

- [ ] **Step 1: `supabase/feature_log.sql` 끝에 「보는 법」을 더한다**

```sql
-- ─────────────────────────────────────────────────────────────
-- 보는 법 (관리자 SQL Editor 에서)
-- ─────────────────────────────────────────────────────────────

-- ① 기능별 한눈에
select feature,
       count(distinct user_id) as 사람,
       sum(cnt)                as 횟수,
       min(day) as 처음, max(day) as 마지막
from public.feature_log
group by feature order by 사람 desc;

-- ② 날짜별 추이
select day, feature, count(distinct user_id) as 사람, sum(cnt) as 횟수
from public.feature_log
group by day, feature order by day desc, feature limit 100;

-- ③ 매일 묵상 — 눌러서 연 분 대 저절로 뜬 분
--    이 비율이 「스스로 찾아 읽는 분」의 몫이다. 저절로 뜬 것만 많으면 그 기능은
--    성도님이 고른 것이 아니라 앱이 들이민 것이다.
select (select count(distinct user_id) from public.feature_log where feature='meditation')      as 눌러서_연_분,
       (select count(distinct user_id) from public.feature_log where feature='meditation-auto') as 저절로_뜬_분,
       round(100.0 * (select count(distinct user_id) from public.feature_log where feature='meditation')
                   / nullif((select count(distinct user_id) from public.feature_log where feature='meditation-auto'), 0), 1)
                                                                                                 as 능동_비율_퍼센트;

-- ④ 말씀 앨범 — 열고도 안 듣는 분
with o as (select distinct user_id from public.feature_log where feature='album'),
     p as (select distinct user_id from public.feature_log where feature='album-play')
select (select count(*) from o)                                   as 화면을_연_분,
       (select count(*) from p)                                   as 듣기까지_간_분,
       round(100.0 * (select count(*) from p) / nullif((select count(*) from o),0), 1) as 전환율_퍼센트;

-- ⑤ 한 번 보고 마셨나, 이어 보시나 — 기능별·사람별 본 날수 분포
select feature, 본_날수, count(*) as 사람수 from (
  select feature, user_id, count(distinct day) as 본_날수
  from public.feature_log group by feature, user_id
) t group by feature, 본_날수 order by feature, 본_날수;

-- ⑥ 누가 얼마나 (⚠️ 이름이 나오므로 관리자만 · 밖으로 내보내지 말 것)
select u.gu, u.mok, u.name, f.feature,
       count(distinct f.day) as 본_날수, sum(f.cnt) as 횟수, max(f.day) as 마지막
from public.feature_log f join public.users u on u.id = f.user_id
group by u.gu, u.mok, u.name, f.feature
order by 횟수 desc limit 50;
```

- [ ] **Step 2: `supabase/psalm_metrics.sql` 을 만든다**

```sql
-- 쉴만한 물가(시편·잠언·전도서 180편) — 닿는 범위와 전환율 (2026-09-23)
--   읽기 전용. SQL Editor 에서 필요한 질의만 골라 돌린다.
--
-- ■ 왜 이 파일이 늦었나
--   CLAUDE.md 의 남은 과제에 「2주 뒤 전환율(supabase/psalm_metrics.sql)」 이 적혀 있었는데
--   **그 파일이 저장소에 없었다.** 없는 파일을 과제로 남겨 두면 그 과제는 계속 미뤄진다.
--
-- ⚠️ 기준일은 **개시일(2026-09-12)이 아니라 열람 기록을 배포한 날**이다.
--    그 전의 열람은 아무 데도 안 남아 영영 없다. 여기서 보이는 것은 배포 뒤부터다.
--
-- ⚠️ 시편 구절 번호 = 1000 + day_no (js/psalm.js 의 PSALM_NO_BASE = 1000).
--    verses.track = 'psalm' 인 행들이다.

-- ① 닿는 범위 — 액자를 몇 명이 보나
select count(distinct user_id) as 액자를_본_사람,
       count(distinct item)    as 펼쳐진_편수,
       sum(cnt)                as 총_펼친_횟수,
       min(day) as 처음, max(day) as 마지막
from public.feature_log where feature = 'psalm';

-- ② 전환율 — 액자를 본 분 중 몇 %가 암송까지 갔나  ★ 이 파일의 핵심
--    ⚠️ 여기서는 daily_activity 가 아니라 challenge_log 를 읽는다.
--       집계표에는 verse_no 가 없어 「시편 구절인지」를 가릴 수가 없다.
--       (순위·mydays 가 집계표를 읽는 것과는 다른 이야기다 — 이건 순위가 아니다.)
with seen as (select distinct user_id from public.feature_log where feature = 'psalm'),
     memo as (select distinct user_id from public.challenge_log where verse_no > 1000)
select (select count(*) from seen)                                as 액자를_본_사람,
       (select count(*) from memo)                                as 암송까지_간_사람,
       (select count(*) from seen s join memo m using (user_id))   as 둘_다,
       round(100.0 * (select count(*) from seen s join memo m using (user_id))
                   / nullif((select count(*) from seen), 0), 1)   as 전환율_퍼센트;

-- ③ 이어 보시나 — 사람별 본 날수 분포
select 본_날수, count(*) as 사람수 from (
  select user_id, count(distinct day) as 본_날수
  from public.feature_log where feature = 'psalm' group by user_id
) t group by 본_날수 order by 본_날수;

-- ④ 어느 편이 읽히나 (제목까지)
select f.item as 구절번호, v.day_no as 일차, v.ref_full as 본문,
       count(distinct f.user_id) as 사람, sum(f.cnt) as 횟수
from public.feature_log f
left join public.verses v on v.no = f.item
where f.feature = 'psalm'
group by f.item, v.day_no, v.ref_full
order by 사람 desc, 횟수 desc
limit 30;

-- ⑤ 매일 묵상 창의 시편 배너를 거쳐 오시나 — 묵상을 본 분 중 액자도 본 분
with med as (select distinct user_id from public.feature_log where feature like 'meditation%'),
     ps  as (select distinct user_id from public.feature_log where feature = 'psalm')
select (select count(*) from med)                                 as 묵상을_본_사람,
       (select count(*) from med m join ps p using (user_id))      as 액자도_본_사람,
       round(100.0 * (select count(*) from med m join ps p using (user_id))
                   / nullif((select count(*) from med), 0), 1)    as 겹침_퍼센트;
```

- [ ] **Step 3: 질의가 실제로 도는지 개발 DB 에서 확인한다**

SQL Editor(개발)에서 **두 파일의 질의를 하나씩 전부** 돌린다.

기대: **오류 없이 결과가 나온다**(행이 0 이어도 좋다 — 여기서 보는 것은 질의가 도는가다).

⚠️ ④가 쓰는 `verses.ref_full`·`verses.day_no` 는 원래 스키마에 없고 마이그레이션으로 더해진 칼럼이다(`migrate_verses_cms.sql`·`psalm_frames.sql`). 2026-09-23 기준 둘 다 있는 것을 확인했다. `column does not exist` 가 나면 그 DB 에 마이그레이션이 덜 돈 것이니, 질의를 고치지 말고 **어느 마이그레이션이 빠졌는지**를 먼저 본다.

- [ ] **Step 4: 커밋**

```bash
git add supabase/psalm_metrics.sql
git diff --cached --name-only
git commit -- supabase/feature_log.sql supabase/psalm_metrics.sql -m "docs(계측): 보는 법 질의 — feature_log 여섯 · psalm_metrics 다섯"
```

---

## Task 9: 운영 배포

**Files:** 없음(배포와 확인만). 마지막에 `index.html`·`app.js` 가 `bump.py` 로 바뀐다.

- [ ] **Step 1: 개발에서 다섯 자리가 다 찍혔는지 마지막으로 본다**

개발 DB SQL Editor:

```sql
select feature, count(distinct user_id) as 사람, sum(cnt) as 횟수
from public.feature_log group by feature order by feature;
```

기대: **일곱 `feature` 가 전부 한 번씩은 나와 있다.** 빠진 것이 있으면 그 태스크로 돌아간다.

- [ ] **Step 2: 운영 DB 에 SQL 을 넣는다 — 코드보다 먼저**

Supabase Dashboard → **`xnomlgydifiqiybervtf`**(운영) → SQL Editor →
`supabase/feature_log.sql` 전체를 붙여넣고 RUN → 이어서 `supabase/member_merge.sql` 전체를 붙여넣고 RUN.

기대: 둘 다 `Success. No rows returned`

- [ ] **Step 3: 운영에서도 RLS 가 막는지 확인한다**

```bash
curl -s "https://xnomlgydifiqiybervtf.supabase.co/rest/v1/feature_log?select=*&limit=1" \
  -H "apikey: $PROD_ANON" -H "Authorization: Bearer $PROD_ANON"
```

기대: `[]` 또는 권한 오류. **행이 오면 여기서 멈춘다** — `user_id` 가 공개된 것이다.

- [ ] **Step 4: 운영에 Edge Function 을 배포한다**

```bash
git status --short
```

⚠️ **여기서 남의 커밋 안 된 변경이 보이면 그 세션에 확인한 뒤 진행한다.** `supabase functions deploy` 는 git 이 아니라 **작업 트리**를 올려서, 남의 미완성 코드가 함께 운영에 나간다.

```bash
supabase functions deploy api --no-verify-jwt --project-ref xnomlgydifiqiybervtf
```

기대: `Deployed Functions on project xnomlgydifiqiybervtf: api`

- [ ] **Step 5: 운영 액션이 사는지 확인한다**

```bash
curl -s -X POST "https://xnomlgydifiqiybervtf.supabase.co/functions/v1/api" \
  -H "Content-Type: application/json" -H "apikey: $PROD_ANON" -H "Authorization: Bearer $PROD_ANON" \
  -d '{"action":"featureLog","feature":"psalm","item":1}'
```

기대: `{"ok":true,"skipped":true}` (`user_id` 가 없어 건너뛴 것 — 액션이 살아 있다는 뜻이다)

- [ ] **Step 6: 판 번호를 올린다**

```bash
python tools/bump.py
```

⚠️ **여기서 처음이자 마지막으로 돌린다.** 캐시태그(`app.js`·`style.css`·`js/*.js`)·스플래시 판·`APP_BUILD` 가 함께 오른다. 손으로 고치지 않는다.

- [ ] **Step 7: 푸시 전 마지막 검사**

```bash
python tools/preflight.py
```

기대: 통과. 걸리면 **배포 단계가 아예 안 돈다** — 고치고 다시 돌린다.

- [ ] **Step 8: 커밋·푸시**

```bash
git diff --name-only index.html app.js      # bump.py 가 건드린 것만 나와야 한다
git commit -- index.html app.js -m "chore: 열람 기록 배포 — 판 번호"
git push
```

⚠️ `git add -A` 금지. 다른 파일(`js/psalm.js`·`sw.js`·`guide/index.html` 등)은 **앞 태스크에서 이미 커밋됐다** — 여기서 다시 나열하면 그 사이 남이 고친 것까지 딸려 나간다. `bump.py` 가 건드리는 것은 `index.html` 과 `app.js` 뿐이다.

- [ ] **Step 9: 배포를 「이번 판에만 있는 표식」으로 확인한다**

```bash
V=$(grep -o 'app.js?v=[0-9a-z]*' index.html | head -1 | cut -d= -f2)
curl -s "https://gocheok.onlybible.kr/app.js?v=$V" | grep -o 'APP_BUILD = "[0-9a-z]*"'
curl -s "https://gocheok.onlybible.kr/app.js?v=$V" | grep -c 'logFeature'
```

기대: `APP_BUILD` 가 `index.html` 의 `?v=` 와 **같고**, `logFeature` 가 **0이 아니다.**

⚠️ 이전 판에도 있던 이름(`renderAlbum` 같은)으로 확인하면 CDN 이 옛 파일을 내보내도 통과해 「배포 완료」로 오인한다(2026-08-25 에 두 번 그랬다). `logFeature` 는 이번 판에만 있는 이름이다.

- [ ] **Step 10: 다음 날 아침, 운영에 실제로 쌓였는지 본다**

운영 SQL Editor:

```sql
select feature, count(distinct user_id) as 사람, sum(cnt) as 횟수
from public.feature_log group by feature order by 사람 desc;
```

**성공 기준:**
- `psalm` · `meditation-auto` · `album` **세 줄은 반드시 나온다**(저절로 닿는 경로다). 안 나오면 심은 자리가 안 불리는 것이다 — 그 태스크로 돌아간다.
- `meditation` · `album-play` · `guide` · `push` 는 **0 일 수 있다. 그 0 자체가 이 작업이 찾던 답이다.**

- [ ] **Step 11: `CLAUDE.md` 의 남은 과제를 갱신한다**

「쉴만한 물가」 항목의 `② 2주 뒤 전환율(supabase/psalm_metrics.sql)` 을 고친다 — 파일이 이제 **실제로 있고**, 기준일이 개시일이 아니라 **배포일 + 2주** 라는 것을 적는다. 그리고 「측정」 줄에 `docs/notes/metrics.md` 와 나란히 이 설계 문서를 건다.

```bash
git diff --cached --name-only
git commit -- CLAUDE.md -m "docs: 열람 기록 배포 — psalm_metrics.sql 과제 갱신"
git push
```

---

## 나중에 (이번 범위 밖 — 설계 문서 9장)

- **위젯** — `user_id` 를 담지 않는 것이 위젯의 원칙이라 이 표에 못 들어온다. 「횟수·기기 수만 세는 별도 표」가 필요하다.
- **아이폰 네이티브 푸시(APNs)** — 지금 실기기에서 알림이 안 뜬다. 동작을 못 보는 경로에 계측을 얹으면 「기록이 0」과 「알림이 안 뜸」을 구별할 수 없다.
- **로비 QR·주보로 온 분의 설명서 열람** — 익명 계측이 필요하다(위젯과 같은 성격의 결정).
- **관리자 화면 칸 · 주간 리포트 한 줄 · 체류 시간** — 「몇 명에게 닿나」를 모르는 상태에서 깊이를 재는 것은 순서가 틀렸다.
