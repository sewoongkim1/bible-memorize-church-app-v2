# 시편 말씀 액자 구현 계획 (2026-09-10)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> 설계: `docs/superpowers/specs/2026-09-10-psalm-frame-design.html` (14장)
> **이 문서는 「어떤 순서로, 어디까지가 한 덩어리인지」를 정한다.** 무엇을 왜 만드는지는 설계 문서에 있다.

**Goal:** 시편 180구절을 하루에 한 편씩 열어, 액자 그림 안에서 0단계(읽고 듣기)부터 3단계(전체 빈칸)까지 외우는 새 코너를 만든다.

**Architecture:** 시편 구절을 기존 `verses` 표에 `track='psalm'`·`no ≥ 1001`로 넣는다. `progress`·`challenge_log`·`reviews`가 이미 `verse_no` 하나로 묶여 있어 **순위와 복습이 저절로 함께 돈다.** 서버는 `getVerses`만 갈래를 타고, 나머지 액션은 한 줄도 안 고친다. 화면은 `js/psalm.js` 새 파일로 짓고 `app.js`는 세 자리만 손댄다.

**Tech Stack:** Vanilla JS PWA · Supabase Edge Function(Deno/TS) · PostgreSQL · openpyxl(자료 도구)

---

## Global Constraints

이 절의 값은 **모든 과제의 요구사항에 암묵적으로 포함된다.**

| 항목 | 값 |
|---|---|
| 1일차 | **2026-09-21(월)** · 180일차 **2027-03-19(금)** |
| 설정 자리 | `app_config` 키 **`psalm`**, 값 `{"start":"2026-09-21","totalDays":180}` (**jsonb** — 맨 문자열 금지) |
| 시편 구절 번호 | **`no = 1000 + day_no`** → 1001~1180. `verse_no ≥ 1001`이 곧 「시편이다」 |
| 표 컬럼 | `verses.track`(`'weekly'`\|`'psalm'`) · `verses.day_no`(1~180) · `verses.frame_art`(1~12) |
| 길이 잣대 | **글자수(공백 제외) + 낱말수 ≤ 76**, ≥ 30. **3단계(전체 빈칸) 기준** |
| 액자 글씨 | **20~34px 사이로 가둔다.** `--psalm-fs`로 따로 잰다 |
| `challenge_log.mode` | **새로 만들지 않는다.** `learn-typing`·`learn-typing-card` 그대로 |
| DB 순서 | **개발 `ktpwthwqzgcqcrmsafdo` 먼저 → 운영 `xnomlgydifiqiybervtf`** |
| 배포 | `python tools/bump.py` **한 번**. 캐시태그·판번호·APP_BUILD를 손으로 고치지 않는다 |
| 커밋 | **고친 파일만 스테이징.** `git add -A` 금지 — `booklet/`에 커밋 대기 작업이 상주한다 |

**절대 하지 않는 것**
- `em`으로 빈칸 폭을 고정 — 글씨 크기 설정(xl)과 곱해져 한 칸이 202px이 된다
- 시편 구절을 전역 `verses` 배열에 넣기 — 첫 화면 진행 막대·앨범·어려운 도전 여덟 곳이 통째로 의미가 바뀐다
- 180편이 든 정적 JSON 폴백 만들기 — 「안 열린 구절은 서버가 안 내려보낸다」가 잠금의 전부다
- 성경 본문을 AI가 채우기

---

## 과제 지도

| # | 과제 | 산출물 | 담당자 자료 필요? |
|---|---|---|---|
| 1 | DB 확장 + 개발 씨앗 | `supabase/psalm_dev_seed.sql` | ✗ |
| 2 | 서버 — `getVerses` 갈래 | `supabase/functions/api/index.ts` | ✗ |
| 3 | 액자 소재 여섯 장 더 | `img/frame/leaf7~12.webp` | ✗ |
| 4 | `js/psalm.js` — 자료·첫 화면 | 새 파일 + `index.html` + `bump.py` | ✗ |
| 5 | 액자 + 0단계 | `js/psalm.js` · `style.css` | ✗ |
| 6 | 1~3단계 (빈칸·카드) | `js/psalm.js` + `app.js`(`onDone` 인자) | ✗ |
| 7 | 완료 화면 | `js/psalm.js` | ✗ |
| 8 | `app.js` 세 자리 | `app.js` | ✗ |
| 9 | 5줄 실측 검증 | `tools/psalm-measure.py` | ✗ |
| 10 | 실자료 반영 + 배포 | `supabase/psalm_frames.sql` | **✓** |

**1~9는 담당자 자료 없이 전부 할 수 있다.** 자료는 10에서만 필요하다 — 그래서 자료를 기다리며 놀지 않는다.

---

### Task 1: DB 확장 + 개발 씨앗

`verses` 표에 컬럼 셋을 더하고, 화면을 만들 동안 쓸 씨앗 구절을 개발 DB에 넣는다.

**Files:**
- Create: `supabase/psalm_dev_seed.sql`
- (참고, 이미 있음) `tools/psalm-fit.py` — 실자료가 오면 `supabase/psalm_frames.sql`을 만든다

**Interfaces:**
- Produces: `verses.track` / `verses.day_no` / `verses.frame_art` 컬럼 · `app_config('psalm')` 설정 · 개발 DB에 `no` 1001~1020 시편 트랙 구절 20편

> **왜 개발 씨앗을 따로 두나** — 담당자 자료가 오기 전에도 화면을 다 만들 수 있어야 한다.
> 그렇다고 성경 본문을 지어내면 안 되므로, **이미 검증된 주간 35구절 중 길이가 맞는 것을 복제**한다.
> 시편이 아니지만 개발 DB에서만 살고 운영에는 절대 안 간다.

- [ ] **Step 1: 지금 상태를 먼저 본다 (실패를 확인)**

```bash
curl -s -X POST "https://ktpwthwqzgcqcrmsafdo.supabase.co/functions/v1/api" \
  -H "Content-Type: application/json" \
  -H "apikey: $DEV_ANON" -H "Authorization: Bearer $DEV_ANON" \
  -d '{"action":"getVerses","track":"psalm"}' | python -c "import json,sys;d=json.load(sys.stdin);print('verses',len(d.get('verses',[])),'openCount',d.get('openCount'))"
```

`$DEV_ANON`은 `js/config.js`의 개발 프로젝트 anon 키다.

기대: `verses 35 openCount None` — **`track`을 무시하고 주간 35구절을 그대로 돌려준다.** 이것이 지금 상태다.

- [ ] **Step 2: `supabase/psalm_dev_seed.sql` 을 만든다**

```sql
-- 시편 말씀 액자 — 표 확장 + 「개발 DB 전용」 씨앗
-- ⚠️ 운영 DB(xnomlgydifiqiybervtf)에 돌리지 말 것. 시편이 아닌 구절을 복제한 것이다.
--    운영에는 tools/psalm-fit.py 가 만드는 supabase/psalm_frames.sql 을 쓴다.

-- ① 표 확장 ------------------------------------------------------------
alter table public.verses
  add column if not exists track     text not null default 'weekly',  -- 'weekly' | 'psalm'
  add column if not exists day_no    int,        -- 1~180 · 열리는 순서
  add column if not exists frame_art smallint;   -- 1~12 · 액자 그림(구절마다 고정)

create index if not exists idx_verses_track on public.verses(track, day_no);
update public.verses set track = 'weekly' where track is null;

-- ② 시작일 ------------------------------------------------------------
-- ⚠️ app_config.value 는 jsonb 다 — 맨 문자열을 넣으면 실패한다
insert into public.app_config (key, value)
  values ('psalm', '{"start":"2026-09-21","totalDays":180}'::jsonb)
  on conflict (key) do update set value = excluded.value, updated_at = now();

-- ③ 개발 씨앗 20편 -----------------------------------------------------
-- 길이 잣대(글자수+낱말수 ≤ 76)를 통과하는 주간 구절만 골라 복제한다.
with fit as (
  select v.no, v.ref, v.ref_short, v.ref_full, v.text,
         row_number() over (order by v.no) as n
    from public.verses v
   where v.track = 'weekly'
     and v.text is not null
     and length(replace(btrim(v.text), ' ', ''))
         + coalesce(array_length(string_to_array(btrim(v.text), ' '), 1), 0) <= 76
)
insert into public.verses (no, track, day_no, frame_art, ref, ref_short, ref_full, text, week, is_active)
select 1000 + n, 'psalm', n, ((n - 1) % 12) + 1,
       ref, ref_short, ref_full, text, null, true
  from fit where n <= 20
on conflict (no) do update set
  track = excluded.track, day_no = excluded.day_no, frame_art = excluded.frame_art,
  ref = excluded.ref, ref_short = excluded.ref_short, ref_full = excluded.ref_full,
  text = excluded.text, is_active = excluded.is_active;

-- ④ 확인 ---------------------------------------------------------------
select track, count(*) as 편수, min(no) as 첫번호, max(no) as 끝번호
  from public.verses group by track order by track;

select greatest(0, least(180,
       ((now() at time zone 'Asia/Seoul')::date - date '2026-09-21') + 1)) as 오늘_열린_편수;
```

- [ ] **Step 3: 개발 DB SQL Editor에서 돌린다**

`https://supabase.com/dashboard/project/ktpwthwqzgcqcrmsafdo/sql` 에 붙여 넣고 실행.

기대 출력:
```
track   | 편수 | 첫번호 | 끝번호
psalm   |   20 |   1001 |   1020
weekly  |   35 |      1 |     35
```
그리고 `오늘_열린_편수` = **0** (오늘이 9-10이고 시작이 9-21이므로 아직 안 열렸다).

- [ ] **Step 4: 컬럼이 실제로 생겼는지 확인**

```sql
select column_name, data_type, column_default
  from information_schema.columns
 where table_schema='public' and table_name='verses'
   and column_name in ('track','day_no','frame_art')
 order by column_name;
```
기대: 세 줄. `track`의 default가 `'weekly'::text`.

- [ ] **Step 5: 커밋**

```bash
git add supabase/psalm_dev_seed.sql
git commit -m "feat(시편 액자): verses 표 확장 + 개발 DB 씨앗 SQL

track·day_no·frame_art 컬럼과 app_config('psalm') 설정.
개발 씨앗은 주간 구절 중 길이가 맞는 20편을 복제한 것이다 —
성경 본문을 지어내지 않으면서 자료를 기다리는 동안 화면을 만들 수 있다.
⚠️ 운영에는 psalm-fit.py 가 만드는 psalm_frames.sql 을 쓴다."
```

---

### Task 2: 서버 — `getVerses`의 track 갈래

**Files:**
- Modify: `supabase/functions/api/index.ts` — `getVerses()` (648줄 근처), 액션 분기(125줄), 그리고 방어적으로 `latestVerse()`(324줄)·`monitor` 말씀 신선도(574줄)

**Interfaces:**
- Consumes: Task 1의 `verses.track`·`day_no`, `app_config('psalm')`
- Produces:
  - `getVerses()` — 지금과 똑같이 **주간 35구절만**
  - `getVerses({track:"psalm"})` → `{ ok, verses:[{no, dayNo, frameArt, refShort, refFull, text}], openCount, totalDays, startDate }`
  - `openCount` = 오늘까지 열린 편수(0~180). **안 열린 구절은 응답에 없다.**

- [ ] **Step 1: 확인 명령을 먼저 만들고 실패를 본다**

`tests/psalm-smoke.sh` 를 만든다:

```bash
#!/usr/bin/env bash
# 시편 말씀 액자 — 읽기 전용 스모크. 기본은 개발 DB.
#   bash tests/psalm-smoke.sh              개발
#   PSALM_ENV=prod bash tests/psalm-smoke.sh   운영
set -u
if [ "${PSALM_ENV:-dev}" = "prod" ]; then
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

W=$(call '{"action":"getVerses"}')
P=$(call '{"action":"getVerses","track":"psalm"}')

jqn() { python -c "import json,sys;d=json.load(sys.stdin);print($1)" <<< "$2"; }

echo "① 주간(track 없음) — 지금과 똑같아야 한다"
chk "weekly 편수" "$(jqn 'len(d[\"verses\"])' "$W")" "35"
chk "weekly 최대 no" "$(jqn 'max(v[\"no\"] for v in d[\"verses\"])' "$W")" "35"

echo "② 시편"
chk "openCount 있음" "$(jqn '\"openCount\" in d' "$P")" "True"
chk "안 열린 구절 없음" "$(jqn 'all(v[\"dayNo\"] <= d[\"openCount\"] for v in d[\"verses\"])' "$P")" "True"
chk "편수 = openCount 이하" "$(jqn 'len(d[\"verses\"]) <= d[\"openCount\"]' "$P")" "True"
chk "totalDays" "$(jqn 'd[\"totalDays\"]' "$P")" "180"
chk "startDate" "$(jqn 'd[\"startDate\"]' "$P")" "2026-09-21"

echo
echo "통과 $pass · 실패 $fail"
[ "$fail" -eq 0 ]
```

- [ ] **Step 2: 돌려서 실패를 확인한다**

```bash
DEV_ANON="<js/config.js의 개발 anon 키>" bash tests/psalm-smoke.sh
```
기대: `② 시편`의 다섯 줄이 전부 ✗ (아직 `openCount`가 없다). `① 주간`은 ✓.

- [ ] **Step 3: `index.ts`에 설정 읽기와 열린 편수 계산을 더한다**

`getVerses()` 바로 위에 넣는다:

```ts
// ---------- 시편 말씀 액자: 열린 편수 ----------
// 하루에 한 편씩 열린다. 「안 열린 구절은 응답에 싣지 않는다」가 잠금의 전부다 —
// 화면에서 가리는 것이 아니라 폰에 아예 없게 한다. 시계를 바꿔도 못 연다.
const PSALM_DEFAULT = { start: "2026-09-21", totalDays: 180 };

async function psalmConfig(): Promise<{ start: string; totalDays: number }> {
  try {
    const { data } = await db.from("app_config").select("value").eq("key", "psalm").maybeSingle();
    const v = (data && data.value) || {};
    return {
      start: typeof v.start === "string" ? v.start : PSALM_DEFAULT.start,
      totalDays: Number.isFinite(Number(v.totalDays)) ? Number(v.totalDays) : PSALM_DEFAULT.totalDays,
    };
  } catch { return PSALM_DEFAULT; }
}

// KST 오늘(YYYY-MM-DD). 서버는 UTC로 도니 +9시간을 더해 자른다.
function psalmKstToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

function psalmOpenCount(cfg: { start: string; totalDays: number }): number {
  const t = Date.parse(psalmKstToday() + "T00:00:00Z");
  const s = Date.parse(cfg.start + "T00:00:00Z");
  if (!Number.isFinite(t) || !Number.isFinite(s)) return 0;
  const days = Math.floor((t - s) / 86400000) + 1;
  return Math.max(0, Math.min(cfg.totalDays, days));
}
```

- [ ] **Step 4: `getVerses()`를 갈래로 나눈다**

기존 `async function getVerses() {` 를 통째로 아래로 바꾼다:

```ts
// ---------- getVerses: 앱 표시용 말씀 목록 ----------
//   인자 없음 / track:"weekly"  → 주간 암송 35구절 (지금까지와 똑같다)
//   track:"psalm"               → 시편 말씀 액자 · 「오늘까지 열린 것만」
// ⚠️ 기본을 weekly 로 두는 것이 중요하다 — 폰에 남아 있는 옛 앱은 track 을 안 보내는데,
//    그때 180편이 딸려 가면 첫 화면 진행 막대가 「전체 215」로 깨진다.
async function getVerses(b: any = {}) {
  if (b && b.track === "psalm") return await getPsalmVerses();
  const { data, error } = await db.from("verses")
    .select("no,date,ref_short,ref_full,ref,text,text_en,ref_en,hint,pastor,sermon_title,sermon_url")
    .eq("is_active", true).eq("track", "weekly").order("no");
  if (error) throw error;
  const verses = (data ?? []).map((v: any) => ({
    no: v.no, date: v.date,
    refShort: v.ref_short || v.ref || "",
    refFull: v.ref_full || v.ref || "",
    text: v.text || "",
    textEn: v.text_en || "",
    refEn: v.ref_en || "",
    hintText: v.hint || "",
    sermonTitle: v.sermon_title || "",
    pastor: v.pastor || "",
    url: v.sermon_url || "",
  }));
  return { ok: true, verses };
}

async function getPsalmVerses() {
  const cfg = await psalmConfig();
  const open = psalmOpenCount(cfg);
  const base = { ok: true, openCount: open, totalDays: cfg.totalDays, startDate: cfg.start };
  if (open <= 0) return { ...base, verses: [] };
  const { data, error } = await db.from("verses")
    .select("no,day_no,frame_art,ref_short,ref_full,ref,text")
    .eq("is_active", true).eq("track", "psalm")
    .lte("day_no", open).order("day_no");
  if (error) throw error;
  const verses = (data ?? []).map((v: any) => ({
    no: v.no,
    dayNo: v.day_no,
    frameArt: v.frame_art || 1,
    refShort: v.ref_short || v.ref || "",
    refFull: v.ref_full || v.ref || "",
    text: v.text || "",
  }));
  return { ...base, verses };
}
```

- [ ] **Step 5: 액션 분기에 body를 넘긴다**

`index.ts` 125줄:
```ts
      case "getVerses":     return json(await getVerses());
```
→
```ts
      case "getVerses":     return json(await getVerses(body));
```

- [ ] **Step 6: 주간 전용 조회 두 곳을 방어적으로 좁힌다**

지금은 시편 구절의 `date`가 null이라 저절로 걸러지지만, 나중에 누가 `date`를 넣으면 조용히 깨진다. 명시한다.

`latestVerse()` (324줄 근처):
```ts
    const { data } = await db.from("verses")
      .select("no,ref_short,ref_full,ref,text,date").eq("is_active", true);
```
→
```ts
    const { data } = await db.from("verses")
      .select("no,ref_short,ref_full,ref,text,date")
      .eq("is_active", true).eq("track", "weekly");   // 이번 주 말씀은 주간 트랙만
```

`monitor`의 말씀 신선도 (574줄 근처):
```ts
  const { data: vs } = await db.from("verses").select("date").eq("is_active", true);
```
→
```ts
  const { data: vs } = await db.from("verses").select("date")
    .eq("is_active", true).eq("track", "weekly");     // 시편 액자는 주차 개념이 없다
```

- [ ] **Step 7: 개발에 배포하고 스모크를 다시 돌린다**

```bash
supabase functions deploy api --no-verify-jwt --project-ref ktpwthwqzgcqcrmsafdo
DEV_ANON="<개발 anon 키>" bash tests/psalm-smoke.sh
```
기대: **통과 7 · 실패 0**. 오늘이 9-21 전이면 `openCount`가 0이고 `verses`가 비어 있는 것이 정상이다.

- [ ] **Step 8: 잠금이 진짜인지 확인한다 — 시작일을 하루 당겨 본다**

개발 DB SQL Editor:
```sql
update public.app_config
   set value = jsonb_set(value, '{start}', to_jsonb((current_date - 4)::text))
 where key = 'psalm';
```
스모크를 다시 돌린다 → `openCount` 5, `verses` 5편, `dayNo`가 1~5. **6편 이상 안 온다.**

되돌린다:
```sql
update public.app_config
   set value = '{"start":"2026-09-21","totalDays":180}'::jsonb where key = 'psalm';
```

> ⚠️ 개발 중에는 화면을 보려면 열려 있어야 하니 **시작일을 당겨 둔 채로 작업한다.**
> Task 10에서 운영에 넣기 전에 반드시 `2026-09-21`로 되돌린다.

- [ ] **Step 9: 커밋**

```bash
git add supabase/functions/api/index.ts tests/psalm-smoke.sh
git commit -m "feat(시편 액자): getVerses 에 track 갈래 · 열린 편수만 내려보낸다

track 없음/weekly 는 지금과 한 글자도 다르지 않다(폰에 남은 옛 앱 보호).
track:psalm 은 app_config('psalm')의 start 로 openCount 를 재고
day_no <= openCount 만 돌려준다 — 안 열린 구절은 폰에 아예 없다.
latestVerse·monitor 는 track='weekly' 로 좁혔다(지금도 date null 로
걸러지지만 나중에 date 가 들어가면 조용히 깨진다)."
```

---

### Task 3: 액자 소재 여섯 장 더

지금 `img/frame/leaf1~6.webp` 여섯 장을 열두 장으로 늘린다.

**Files:**
- Create: `img/frame/leaf7.webp` ~ `img/frame/leaf12.webp`
- Modify: `img/frame/prompts.md` (없으면 생성) — 어떤 화풍으로 만들었는지 남긴다

**Interfaces:**
- Produces: `frameArt` 1~12에 대응하는 소재 열두 장. 한 장 높이 600px, 30KB 이하

- [ ] **Step 1: 원본 폴더에 쓸 만한 것이 있는지 먼저 본다 (공짜가 우선)**

```bash
python - <<'EOF'
from PIL import Image
import glob, os
for p in sorted(glob.glob(r"C:\Projects\말씀카드_B7\소재\*.png")):
    im = Image.open(p)
    bb = im.getbbox() if im.mode == "RGBA" else None
    print(f"{os.path.basename(p):14s} {im.size} {im.mode} {os.path.getsize(p)//1024}KB  bbox={bb}")
EOF
```

`sprig1~3`·`raw4~6`이 투명 배경(RGBA)이고 잎·꽃·열매 모양이면 그대로 쓴다.

- [ ] **Step 2: 쓸 만한 것을 변환한다**

```bash
python tools/frame-art.py
```

⚠️ `tools/frame-art.py`가 `leaf7~12`도 만들도록 대상 목록을 넓혀야 한다.
⚠️ **`alpha_quality`를 반드시 넣는다** — 기본값 100은 알파를 무손실로 넣어 파일이 두 배가 된다.

- [ ] **Step 3: 모자라는 만큼 AI 수채화로 만든다**

`img/verse/prompts.md`와 같은 계열의 화풍으로. 필요한 것은 **꽃 셋 · 열매 셋**.

```
watercolor and ink botanical sprig, soft muted sage and warm gold tones,
loose brush strokes on cream paper, delicate ink outlines,
transparent background, no human figures, no text, no border
— 소재: (7) 들꽃 한 다발  (8) 백합 두 송이  (9) 나리꽃
        (10) 포도 한 송이와 잎  (11) 무화과 가지  (12) 석류 열매와 잎
```

⚠️ 금지어는 `no faces`가 **아니다** — 그러면 새·짐승까지 걸린다. **`no human figures`**로 쓴다.

- [ ] **Step 4: 크기와 무게를 확인한다**

```bash
python - <<'EOF'
from PIL import Image
import glob, os
tot = 0
for p in sorted(glob.glob("img/frame/leaf*.webp"), key=lambda s: int(''.join(c for c in os.path.basename(s) if c.isdigit()))):
    im = Image.open(p); kb = os.path.getsize(p)//1024; tot += kb
    flag = "  ← 너무 큼" if kb > 35 else ""
    print(f"{os.path.basename(p):14s} {im.size} {kb:3d}KB{flag}")
print(f"합계 {tot}KB (열두 장)")
EOF
```
기대: 열두 줄 · 높이 600 · 한 장 35KB 이하 · 합계 350KB 이하.
**한 번 열 때 받는 것은 그중 한 장뿐이다**(액자 하나가 잎가지 한 장만 쓴다).

- [ ] **Step 5: 커밋**

```bash
git add img/frame/leaf7.webp img/frame/leaf8.webp img/frame/leaf9.webp \
        img/frame/leaf10.webp img/frame/leaf11.webp img/frame/leaf12.webp \
        img/frame/prompts.md tools/frame-art.py
git commit -m "feat(시편 액자): 액자 소재 여섯 장 더 — 꽃 셋·열매 셋

여섯 장 → 열두 장. 금색·군청 두 색과 곱해 24가지 얼굴이 된다.
액자 색을 늘리지 않은 이유는 설계 05장에 있다(금색 글씨가 잎가지 위에서
대비 1.86:1까지 떨어져, 색을 늘리면 색×잎가지 조합을 전부 다시 재야 한다)."
```

---

### Task 4: `js/psalm.js` — 자료 불러오기와 첫 화면

**Files:**
- Create: `js/psalm.js`
- Modify: `index.html` (스크립트 태그) · `tools/bump.py` (`TAGGED` 목록) · `js/api.js` (`getVerses`가 track을 받게)

**Interfaces:**
- Consumes: Task 2의 `getVerses({track:"psalm"})`
- Produces:
  - `loadPsalmVerses(force?) → Promise<Array>` — 열린 구절. 전역 `psalmVerses`·`psalmOpen`·`psalmTotal`을 채운다
  - `psalmByNo(no) → verse|null`
  - `isPsalmNo(no) → boolean` (`no >= 1001`)
  - `renderPsalmHome()` — 코너 첫 화면
  - `psalmToday() → verse|null` — 오늘의 한 편

> ⚠️ **`psalm*` 이름이 비어 있는지 먼저 확인했다**(2026-09-10, `app.js`·`style.css` 둘 다 0건).
> `renderBlessing` 사건 — 이미 쓰이던 이름을 다시 지어 **로그인할 때마다 축복 인사 대신 기도문이 뜰 뻔했다.**
> 새 함수를 더할 때마다 `grep -n "함수이름" app.js js/*.js` 를 먼저 돌린다.

- [ ] **Step 1: `js/api.js`가 track을 받게 한다**

72줄:
```js
  getVerses: () => supaCall("getVerses", {}),
```
→
```js
  // track 을 안 주면 지금과 똑같이 주간 35구절. "psalm" 이면 시편 말씀 액자(열린 것만).
  getVerses: (track) => supaCall("getVerses", track ? { track } : {}),
```

- [ ] **Step 2: `js/psalm.js`의 자료 부분을 쓴다**

```js
// ============================================================
// 시편 말씀 액자 — 하루에 한 편씩 열리는 시편 180구절 암송
//   설계: docs/superpowers/specs/2026-09-10-psalm-frame-design.html
//
// ⚠️ 시편 구절은 전역 `verses` 배열에 넣지 않는다. 넣는 순간 첫 화면 진행 막대·
//    앨범·어려운 도전·다음 구절 등 여덟 곳의 의미가 통째로 바뀐다.
// ⚠️ 화면에 들어올 때만 받는다 — 첫 화면에서 미리 받으면 글꼴 765KB 사건과 같은 길이다.
// ============================================================

const PSALM_NO_BASE = 1000;   // 시편 구절 번호 = 1000 + day_no. 이 번호가 곧 「시편이다」

let psalmVerses = [];         // 열린 구절만 (서버가 안 열린 것은 안 내려보낸다)
let psalmOpen = 0;            // 오늘까지 열린 편수
let psalmTotal = 180;
let psalmStartDate = "";
let psalmLoaded = false;

function isPsalmNo(no) { return Number(no) > PSALM_NO_BASE; }
function psalmByNo(no) { return psalmVerses.find((v) => v.no === Number(no)) || null; }

async function loadPsalmVerses(force) {
  if (psalmLoaded && !force) return psalmVerses;
  const d = await api.getVerses("psalm");
  psalmVerses = (d && d.verses) || [];
  psalmOpen = Number(d && d.openCount) || 0;
  psalmTotal = Number(d && d.totalDays) || 180;
  psalmStartDate = (d && d.startDate) || "";
  psalmLoaded = true;
  return psalmVerses;
}

// 오늘의 한 편 = 열린 것 중 마지막(dayNo === psalmOpen)
function psalmToday() {
  if (!psalmVerses.length) return null;
  return psalmVerses.find((v) => v.dayNo === psalmOpen) || psalmVerses[psalmVerses.length - 1];
}

// 몇 편을 3단계까지 마쳤나 — getPassedStage 는 app.js 의 것을 그대로 쓴다
function psalmDoneCount() {
  return psalmVerses.filter((v) => getPassedStage(v.no) >= 3).length;
}
```

- [ ] **Step 3: 첫 화면을 쓴다 (같은 파일에 이어서)**

```js
function renderPsalmHome() {
  stopSpeaking();
  const u = loadUser();
  const app = document.getElementById("app");
  app.innerHTML = `<div class="ps-wrap"><div class="ps-loading">불러오는 중…</div></div>
    <button class="home-fab" id="ps-home" aria-label="첫 화면으로">${homeFabLabel(u, true)}</button>`;
  window.scrollTo(0, 0);
  document.getElementById("ps-home").addEventListener("click", () => { stopSpeaking(); renderSummary(); });

  loadPsalmVerses().then(() => drawPsalmHome()).catch(() => {
    const el = document.querySelector(".ps-loading");
    if (el) el.textContent = "말씀을 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.";
  });
}

function drawPsalmHome() {
  const wrap = document.querySelector(".ps-wrap");
  if (!wrap) return;

  // 아직 시작 전
  if (psalmOpen <= 0) {
    const d = psalmStartDate ? psalmStartDate.replace(/-/g, ".") : "";
    wrap.innerHTML = `<div class="ps-soon">
      <div class="ps-soon-icon">📿</div>
      <div class="ps-soon-t">${d} 에 시작해요</div>
      <div class="ps-soon-s">시편 말씀을 하루에 한 편씩 함께 외웁니다</div>
    </div>`;
    return;
  }

  const today = psalmToday();
  const done = psalmDoneCount();
  const past = psalmVerses.filter((v) => v.dayNo !== (today && today.dayNo))
                          .sort((a, b) => b.dayNo - a.dayNo);

  // 늦게 오신 분을 달랜다 — 「49편이나 밀렸다」로 읽히지 않게 하는 것이 이 줄이 하는 일 전부다
  const catchUp = past.length >= 7
    ? `<div class="ps-catch">지난 말씀 ${past.length}편이 기다리고 있어요 · 서두르지 않으셔도 돼요</div>`
    : "";

  wrap.innerHTML = `
    <div class="ps-head">
      <span class="ps-day">${psalmOpen}일차</span>
      <span class="ps-total">전체 ${psalmTotal}편</span>
    </div>
    ${today ? psalmFrameHtml(today, { preview: true }) : ""}
    <button class="ps-go" id="ps-start">외우기 시작</button>
    <div class="ps-progress">${done > 0
      ? `${psalmTotal}편 중 <b>${done}편</b> 마쳤어요`
      : "아직 시작 전이에요 · 오늘 한 편부터"}</div>
    ${catchUp}
    ${past.length ? `
      <button class="ps-acc-btn" id="ps-past-btn" aria-expanded="false" aria-controls="ps-past">
        지난 말씀 ${past.length}편 <span class="ps-caret">▾</span>
      </button>
      <div class="ps-acc" id="ps-past" hidden>
        ${past.map((v) => `
          <button class="ps-past-row" data-no="${v.no}">
            <span class="ps-past-day">${v.dayNo}일차</span>
            <span class="ps-past-ref">${v.refFull}</span>
            <span class="ps-past-mark">${getPassedStage(v.no) >= 3 ? "✅" : ""}</span>
          </button>`).join("")}
      </div>` : ""}
  `;

  const go = document.getElementById("ps-start");
  if (go && today) go.addEventListener("click", () => renderPsalmStage(today, 0));

  const pb = document.getElementById("ps-past-btn");
  if (pb) pb.addEventListener("click", () => {
    const box = document.getElementById("ps-past");
    const open = pb.getAttribute("aria-expanded") === "true";
    pb.setAttribute("aria-expanded", String(!open));
    box.hidden = open;
  });

  wrap.querySelectorAll(".ps-past-row").forEach((b) => {
    b.addEventListener("click", () => {
      const v = psalmByNo(b.dataset.no);
      if (v) renderPsalmStage(v, 0);
    });
  });
}
```

- [ ] **Step 4: `index.html`에 스크립트를 더한다**

108줄 다음(`js/push.js` 아래, `app.js` **위**):
```html
  <script src="js/psalm.js?v=20260909o"></script>
```

⚠️ `app.js` **위**에 둔다 — `app.js`가 첫 화면에서 `renderPsalmHome`을 부른다.
⚠️ `?v=` 값은 지금 index.html에 있는 것과 같게 적는다. 다음 `bump.py`가 한꺼번에 올린다.

- [ ] **Step 5: ⚠️ `bump.py`의 `TAGGED`에 더한다 — 빠뜨리면 캐시태그가 안 붙는다**

`tools/bump.py` 25줄:
```python
TAGGED = ["app.js", "style.css", "js/config.js", "js/api.js", "js/push.js"]
```
→
```python
TAGGED = ["app.js", "style.css", "js/config.js", "js/api.js", "js/push.js", "js/psalm.js"]
```

> **이것이 이 계획에서 가장 조용한 함정이다.** `TAGGED`는 손으로 적은 목록이라
> 새 파일이 저절로 들어가지 않는다. 빠뜨리면 `?v=`가 안 올라
> **고쳐도 성도님 폰에는 옛 `psalm.js`가 영영 남는다.** 증상이 「배포했는데 안 바뀐다」라
> 원인을 CDN이나 서비스워커에서 찾게 된다.

- [ ] **Step 6: 붙었는지 확인한다**

```bash
python tools/bump.py
grep -o 'js/psalm\.js?v=[0-9a-z]*' index.html
```
기대: `js/psalm.js?v=<오늘날짜+글자>` 한 줄. 다른 태그들과 같은 값이어야 한다.

- [ ] **Step 7: localhost에서 화면을 본다**

```bash
python -m http.server 8000
```
브라우저에서 `http://localhost:8000/?psalm=1` (Task 8에서 진입로를 만들기 전까지는 콘솔에서 `renderPsalmHome()`을 직접 불러도 된다).

확인할 것:
- 오른쪽 위에 **「개발 DB」 띠**가 보인다 (안 보이면 운영을 보고 있는 것이다 — 즉시 멈춘다)
- 「N일차 / 전체 180편」·오늘의 액자·「외우기 시작」·진행 한 줄
- 「지난 말씀」을 누르면 그 자리에서 펴지고 접힌다

- [ ] **Step 8: 커밋**

```bash
git add js/psalm.js js/api.js index.html tools/bump.py
git commit -m "feat(시편 액자): js/psalm.js — 자료 불러오기와 코너 첫 화면

시편 구절은 전역 verses 배열에 넣지 않는다(넣으면 첫 화면 진행 막대·앨범·
어려운 도전 등 여덟 곳의 의미가 바뀐다). 코너에 들어올 때만 받는다.
오늘 한 편이 주인공이고 지난 말씀은 아코디언으로 접어 둔다.

⚠️ bump.py 의 TAGGED 에 js/psalm.js 를 더했다 — 손으로 적는 목록이라
   빠뜨리면 캐시태그가 안 붙어 성도님 폰에 옛 파일이 영영 남는다."
```

---

### Task 5: 액자 렌더러 + 0단계

**Files:**
- Modify: `js/psalm.js` · `style.css`

**Interfaces:**
- Consumes: `psalmVerses`(Task 4), `img/frame/leaf1~12.webp`(Task 3)
- Produces:
  - `psalmFrameHtml(verse, opts) → string` — 액자 한 장. `opts.preview`면 읽기 전용, 아니면 `opts.bodyHtml`을 액자 안에 넣는다
  - `renderPsalmStage(verse, stage)` — `stage` 0~3. 이 과제에서는 0만 동작한다
  - `psalmFitFont(verse) → number` — 그 구절에 맞는 글씨 크기(20~34px)

- [ ] **Step 1: 액자 짝을 정한다 (같은 파일)**

```js
// 액자 = 색(금색/군청) × 잎가지(1~12). 구절마다 고정이다 —
// 무작위로 하면 「같은 그림이 기억의 고리」가 되지 못한다.
// 색은 잎가지 번호의 홀짝으로 가른다(둘 다 12장에 고르게 퍼진다).
function psalmFrame(verse) {
  const art = Math.min(12, Math.max(1, Number(verse.frameArt) || 1));
  return { art, color: art % 2 ? "gold" : "navy", pos: art % 3 === 0 ? "d" : "b" };
}

// 3단계에서 차지하는 가로 길이(em) = 글자수(공백 제외) + 낱말수.
// 빈칸(.word-input)이 낱말마다 1em 씩 넓어지기 때문이다 — 0단계 기준으로 재면
// 3단계에서 6~7줄이 되어 액자를 뚫는다. tools/psalm-fit.py 와 같은 식이다.
function psalmWidthEm(text) {
  const t = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (!t.length) return 0;
  return t.join("").length + t.length;
}

const PSALM_USABLE_PX = 1370;   // 액자 안쪽 322px × 5줄 × 낭비 15%
function psalmFitFont(verse) {
  const w = psalmWidthEm(verse.text);
  if (!w) return 28;
  return Math.round(Math.max(20, Math.min(34, PSALM_USABLE_PX / w)));
}
```

- [ ] **Step 2: 액자 HTML을 쓴다**

```js
// ⚠️ 액자 색(--ps-fr)은 바깥 상자에 붙인다 — ❖ 장식도 같은 색을 쓰는데
//    CSS 변수는 형제에게 안 내려가고 자손에게만 내려간다(기도문 액자에서 배운 것).
// ⚠️ 잎가지 폭은 「화면의 짧은 쪽」 기준 픽셀로 넣는다 — %로 두면 액자의 가로를 따라
//    돌려 보기에서 두 배로 부푼다.
function psalmFrameHtml(verse, opts) {
  const o = opts || {};
  const fr = psalmFrame(verse);
  const leaf = "img/frame/leaf" + fr.art + ".webp?v=" + APP_BUILD;
  const shortSide = Math.min(window.innerWidth || 390, window.innerHeight || 700);
  const lw = Math.round(shortSide * 0.28);
  const fs = o.fontSize || psalmFitFont(verse);
  const body = o.bodyHtml != null ? o.bodyHtml : psalmEsc(verse.text);
  return `
    <div class="ps-frame ps-fr-${fr.color} ps-pos-${fr.pos}" style="--ps-lw:${lw}px;--psalm-fs:${fs}px">
      <img class="ps-leaf l" src="${leaf}" alt="" aria-hidden="true">
      <img class="ps-leaf r" src="${leaf}" alt="" aria-hidden="true">
      <div class="ps-fr-in">
        <div class="ps-fr-ref">${verse.refFull}</div>
        <div class="ps-fr-orn" aria-hidden="true"><i></i>${PRAY_ORN}<i></i></div>
        <div class="ps-fr-body">${body}</div>
      </div>
    </div>`;
}
```

`PRAY_ORN`(❖ SVG)은 `app.js`에 이미 있고 `psalm.js`가 `app.js`보다 먼저 실행되지만
**함수 안에서 쓰이므로 실행 시점에는 이미 정의되어 있다.** `const`는 호이스팅되지 않으니
**모듈 최상위에서 `PRAY_ORN`을 참조하지 말 것.**

**`app.js`에 `escapeHtml`은 없다**(2026-09-10 확인 — 있는 것은 `prayEsc`·`boardEsc` 둘뿐이고
둘 다 그 화면 전용이다). 같은 계열로 `psalmEsc`를 `psalm.js`에 둔다:
```js
function psalmEsc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
```

- [ ] **Step 3: 0단계 화면을 쓴다**

```js
// 0단계 — 읽고 들어보는 칸. 횟수를 세지 않는다.
// 준비되셨다 싶을 때 누르시면 된다 — 이미 외우신 분께 걸림돌을 두지 않는다.
function renderPsalmStage(verse, stage) {
  if (stage > 0) return renderPsalmBlank(verse, stage);   // Task 6
  stopSpeaking();
  const u = loadUser();
  const app = document.getElementById("app");
  app.innerHTML = `
    <div class="ps-wrap ps-stage">
      <div class="ps-head">
        <span class="ps-day">${verse.dayNo}일차</span>
        <span class="ps-step">읽어 보세요</span>
        <button class="ps-back" id="ps-back">← 목록</button>
      </div>
      ${psalmFrameHtml(verse)}
      <div class="ps-tools">
        <button class="ps-tool" id="ps-listen">🔊 들어보기</button>
      </div>
      <button class="ps-go" id="ps-next">다음 →</button>
    </div>
    <button class="home-fab" id="ps-home" aria-label="첫 화면으로">${homeFabLabel(u, true)}</button>`;
  window.scrollTo(0, 0);

  document.getElementById("ps-home").addEventListener("click", () => { stopSpeaking(); renderSummary(); });
  document.getElementById("ps-back").addEventListener("click", () => { stopSpeaking(); renderPsalmHome(); });
  document.getElementById("ps-next").addEventListener("click", () => {
    stopSpeaking();
    const passed = getPassedStage(verse.no);
    renderPsalmStage(verse, passed >= 3 ? 1 : Math.min(3, passed + 1));
  });

  // 낭독은 「요절 → (쉼) → 말씀」 — 앨범·말씀 목록과 같은 순서다.
  document.getElementById("ps-listen").addEventListener("click", () => {
    speakText(verseSpokenText({ ...verse, refFull: verse.refFull, text: verse.text }));
  });
}
```

⚠️ `speakText`·`verseSpokenText`·`stopSpeaking`·`homeFabLabel`·`getPassedStage`는 `app.js`의 것이다.
이름이 맞는지 먼저 확인한다: `grep -n "function speakText\|function verseSpokenText\|function homeFabLabel" app.js`
(다르면 실제 이름으로 바꾼다 — **추측해서 부르지 않는다.**)

- [ ] **Step 4: CSS를 쓴다 — `style.css` 맨 끝에 붙인다**

⚠️ **끝에 둔다.** 앞쪽 규칙(`.summary-actions .summary-go` 등)이 뒤에 있으면 덮어써 버린다.

```css
/* ===== 시편 말씀 액자 ============================================ */
/* 기도문 액자(.pr-*)와 같은 양식이되, 암송 화면이라 크기를 다시 잰다. */
.ps-wrap{
  max-width:520px;margin:0 auto;padding:14px 14px calc(96px + env(safe-area-inset-bottom,0px));
}
.ps-loading,.ps-soon{text-align:center;padding:48px 16px;color:var(--ink2,#4a5560)}
.ps-soon-icon{font-size:44px}
.ps-soon-t{font-size:20px;font-weight:700;color:var(--navy,#1a3a6b);margin-top:10px}
.ps-soon-s{margin-top:6px}

.ps-head{display:flex;align-items:center;gap:10px;margin:2px 0 12px}
.ps-day{background:var(--navy,#1a3a6b);color:#fff;border-radius:999px;padding:3px 12px;
        font-size:14px;font-weight:700}
.ps-total,.ps-step{color:var(--ink2,#4a5560);font-size:14px}
.ps-back{margin-left:auto;background:none;border:none;color:var(--navy,#1a3a6b);
         font-size:15px;padding:6px 4px;cursor:pointer}

/* --- 액자 --- */
.ps-frame{
  position:relative;overflow:hidden;border-radius:4px;
  padding:7px;background:#fffef9;
  border:3px double var(--ps-fr,#c3a253);
}
.ps-fr-gold{--ps-fr:#c3a253}
.ps-fr-navy{--ps-fr:#1a3a6b}
.ps-fr-in{
  position:relative;z-index:1;
  border:1px solid color-mix(in srgb, var(--ps-fr) 45%, transparent);
  padding:20px 30px 24px;
}
.ps-fr-ref{
  text-align:center;font-size:14px;font-weight:700;letter-spacing:.05em;
  color:var(--ps-fr);
  /* 금색 글씨는 잎가지 위에서 대비가 1.86:1까지 떨어진다 → 바탕색 테를 두른다 */
  text-shadow:0 0 2px #fffef9,0 0 4px #fffef9;
}
.ps-fr-orn{display:flex;align-items:center;justify-content:center;gap:8px;margin:8px 0 14px;
           color:var(--ps-fr)}
.ps-fr-orn i{flex:1;height:1px;background:color-mix(in srgb,var(--ps-fr) 40%,transparent)}
.ps-fr-orn .pr-orn-d{width:14px;height:14px}
.ps-fr-body{
  font-size:var(--psalm-fs,26px);line-height:1.62;color:#12294b;
  text-align:center;word-break:keep-all;
}
/* 잎가지 — 폭은 app.js 가 「화면의 짧은 쪽」 기준 픽셀(--ps-lw)로 넣는다.
   %로 두면 액자의 가로를 따라 돌려 보기에서 두 배로 부푼다. */
.ps-leaf{position:absolute;width:var(--ps-lw,110px);height:auto;opacity:.5;pointer-events:none}
.ps-pos-b .ps-leaf.l{left:-6px;bottom:-6px}
.ps-pos-b .ps-leaf.r{right:-6px;bottom:-6px;transform:scaleX(-1)}
.ps-pos-d .ps-leaf.l{left:-8px;top:-10px;transform:rotate(180deg)}
.ps-pos-d .ps-leaf.r{display:none}

/* 어두운 모드 — 수채화를 그대로 두면 「때 묻은 얼룩」이 된다.
   screen 혼합도 소용없었다(잎가지가 중간 톤이라 거의 안 뜬다).
   흐린 워터마크로 만든다. 다시 색을 살리려 하지 말 것. */
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]) .ps-frame{background:#161a21}
  :root:not([data-theme="light"]) .ps-fr-body{color:#dde5f0}
  :root:not([data-theme="light"]) .ps-fr-ref{text-shadow:0 0 2px #161a21,0 0 4px #161a21}
  :root:not([data-theme="light"]) .ps-leaf{filter:grayscale(1) brightness(2.6);opacity:.28}
}
:root[data-theme="dark"] .ps-frame{background:#161a21}
:root[data-theme="dark"] .ps-fr-body{color:#dde5f0}
:root[data-theme="dark"] .ps-fr-ref{text-shadow:0 0 2px #161a21,0 0 4px #161a21}
:root[data-theme="dark"] .ps-leaf{filter:grayscale(1) brightness(2.6);opacity:.28}

/* --- 단추 --- */
.ps-go{
  display:block;width:100%;margin:16px 0 10px;padding:18px 12px;
  background:var(--navy,#1a3a6b);color:#fff;border:none;border-radius:12px;
  font-size:19px;font-weight:700;cursor:pointer;min-height:60px;
}
.ps-tools{display:flex;gap:8px;justify-content:center;margin-top:12px}
.ps-tool{
  background:#fff;color:var(--navy,#1a3a6b);border:1px solid #cfd8e4;border-radius:10px;
  padding:10px 18px;font-size:16px;cursor:pointer;
}
.ps-progress{text-align:center;color:var(--ink2,#4a5560);font-size:15px;margin:4px 0 2px}
.ps-progress b{color:var(--navy,#1a3a6b)}
.ps-catch{text-align:center;color:#8a6216;background:#fff8ec;border:1px solid #e8c98a;
          border-radius:8px;padding:9px 12px;font-size:14px;margin:10px 0}

/* --- 지난 말씀 아코디언 --- */
.ps-acc-btn{
  display:block;width:100%;margin-top:18px;padding:13px 14px;text-align:left;
  background:#fff;border:1px solid #dfe4ea;border-radius:10px;
  font-size:16px;color:var(--navy,#1a3a6b);cursor:pointer;
}
.ps-caret{float:right;transition:transform .18s}
.ps-acc-btn[aria-expanded="true"] .ps-caret{transform:rotate(180deg)}
.ps-acc[hidden]{display:none}
.ps-past-row{
  display:flex;align-items:center;gap:10px;width:100%;padding:12px 14px;
  background:none;border:none;border-bottom:1px solid #eee7d8;font-size:16px;
  text-align:left;cursor:pointer;
}
.ps-past-day{color:var(--ink2,#4a5560);font-size:13px;min-width:46px}
.ps-past-ref{flex:1;color:var(--navy,#1a3a6b)}
.ps-past-mark{min-width:20px;text-align:right}

/* 320px 폰 — 좌우 30px 여백은 화면의 19%다. 줄인다. */
@media (max-width:340px){ .ps-fr-in{padding:18px 20px 20px} }
```

- [ ] **Step 5: 액자가 다섯 줄 안에 드는지 눈으로 본다**

`python -m http.server 8000` → 개발 DB 씨앗 구절 20편을 하나씩 열어 본다.
확인:
- 액자 안 말씀이 **다섯 줄 이하**
- 「🔊 들어보기」가 요절부터 읽는다 (「◯◯편 ◯절. 말씀…」)
- 어두운 모드(개발자도구 → Rendering → prefers-color-scheme: dark)에서 잎가지가 **흐린 워터마크**로 보이고 얼룩이 아니다
- 글씨 크기 설정을 「아주 크게」로 바꿔도 **액자 안 글씨는 안 바뀐다**(`--psalm-fs`로 따로 재기 때문)

- [ ] **Step 6: 커밋**

```bash
git add js/psalm.js style.css
git commit -m "feat(시편 액자): 액자 렌더러와 0단계

액자는 구절마다 고정이다(frameArt) — 무작위면 「같은 그림이 기억의 고리」가
되지 못한다. 색은 잎가지 번호의 홀짝으로 가른다.

0단계는 읽고 들어보는 칸이고 횟수를 세지 않는다 — 이미 외우신 분께
걸림돌을 두지 않기 위해서다.

⚠️ 액자 글씨는 --psalm-fs 로 따로 잰다(글씨 크기 설정과 곱해지면 안 된다).
⚠️ 잎가지 폭은 「화면의 짧은 쪽」 기준 픽셀 — %면 돌려 보기에서 두 배가 된다.
⚠️ 어두운 모드 수채화는 흐린 워터마크로 둔다. 색을 살리려 하지 말 것."
```

---

### Task 6: 1~3단계 — 액자 안의 빈칸과 카드

**Files:**
- Modify: `app.js` — `setupAutoCheck`(5561줄)·`checkAllComplete`(5684줄)에 선택 인자 `onDone` 추가
- Modify: `js/psalm.js` · `style.css`

**Interfaces:**
- Consumes: `psalmFrameHtml`(Task 5), `app.js`의 `pickBlankIndices` · `setupAutoCheck` · `saveProgress` · `isCardMode`/`setCardMode`/`isCardStart`
- Produces: `renderPsalmBlank(verse, stage)` — stage 1~3

> ⚠️ **`setupChallengeTyping`을 쓰지 않는다.** 그건 도전·복습·긴 본문이 함께 쓰는 공용 함수(4곳)라
> 여기서 손대면 그쪽 기록이 제약에 걸려 사라진다. 암송 화면과 같은 **`setupAutoCheck`**를 쓴다 —
> 그 안의 입력 정규화(3벌식·iOS의 NFD 자모 분리, 천지인 조합 중 낱자모 판정)는
> **손으로 얻은 것이라 절대 베껴 쓰지 않는다.**
>
> ⚠️ **그런데 `setupAutoCheck`는 자체 완료 경로를 갖고 있다**(2026-09-10 확인).
> `checkAllComplete`가 `saveProgress` → `#result-area`에 쓰기 → `showStageDoneModal` →
> `renderTestScreen`/`startChallenge`까지 **전부 주간 암송 화면에 묶여 있다.**
> 그대로 부르면 시편 화면에서 **주간 1번 구절로 튕긴다.**
> → **선택 인자 `onDone`을 더한다**(Step 1). 인자를 안 주면 지금 동작과 한 글자도 다르지 않다.
>
> ⚠️ **`norm`은 전역이 아니다** — `setupAutoCheck` 안의 지역 함수다. 밖에서 부르면
> `norm is not defined`로 **카드 모드일 때만** 화면이 통째로 멈춘다(자판 쓰는 분은 멀쩡해서 못 알아챈다).

- [ ] **Step 1: `setupAutoCheck`에 `onDone`을 더한다 (`app.js`)**

호출부는 두 곳뿐이다(2026-09-10 확인: `setupAutoCheck` 5095줄 1곳, `checkAllComplete` 5582줄 1곳).
**인자를 더하기만 하므로 기존 호출은 그대로 돈다.**

`app.js` 5561줄:
```js
function setupAutoCheck(verse, stage) {
```
→
```js
// onDone: 자기 완료 경로를 가진 화면(시편 말씀 액자)이 넘겨받는 자리.
//   안 주면 지금까지와 한 글자도 다르지 않다.
function setupAutoCheck(verse, stage, onDone) {
```

5582줄:
```js
    else checkAllComplete(inputs, verse, stage);
```
→
```js
    else checkAllComplete(inputs, verse, stage, onDone);
```

5684줄, `checkAllComplete`의 앞부분:
```js
function checkAllComplete(inputs, verse, stage) {
  const allCorrect = inputs.every((inp) => inp.classList.contains("correct"));
  if (!allCorrect) return;

  // saveProgress보다 먼저 봐야 한다 — 저장하고 나면 이미 '한 구절 마친 사람'이 된다.
  const wasFirst = isFirstJourney();
```
→
```js
function checkAllComplete(inputs, verse, stage, onDone) {
  const allCorrect = inputs.every((inp) => inp.classList.contains("correct"));
  if (!allCorrect) return;

  // ⚠️ 아래는 전부 주간 암송 화면에 묶여 있다 — #result-area · showStageDoneModal ·
  //    전역 verses(다음 구절). 자기 완료 경로를 가진 화면은 여기서 넘겨받는다.
  //    시편 말씀 액자가 그 첫 경우다(그대로 두면 주간 1번 구절로 튕긴다).
  if (onDone) { onDone(); return; }

  // saveProgress보다 먼저 봐야 한다 — 저장하고 나면 이미 '한 구절 마친 사람'이 된다.
  const wasFirst = isFirstJourney();
```

- [ ] **Step 2: 지금 동작이 안 깨졌는지 먼저 확인한다**

localhost에서 **주간 구절**을 1단계부터 끝까지 해 본다.
- 1단계를 마치면 가운데 창(`showStageDoneModal`)이 뜨고 「2단계로 계속하기」가 있다
- 3단계를 마치면 이전/다시/다음 네비와 「마음에 둠」이 있다
- 「🔁 반복해서 쓰기」를 켜면 자동으로 새 3단계가 나온다

**하나라도 다르면 인자를 잘못 넣은 것이다.** 여기서 멈추고 되돌린다.

- [ ] **Step 3: 빈칸 화면을 쓴다**

```js
// 1~3단계 — 액자는 그대로 있고 안쪽 글자만 빈칸이 된다.
// 「암송카드 한 장을 받아 채워 간다」는 느낌이 여기서 산다.
function renderPsalmBlank(verse, stage) {
  stopSpeaking();
  const u = loadUser();
  const tokens = String(verse.text || "").trim().split(/\s+/);
  const ratio = stage === 1 ? 0.25 : stage === 2 ? 0.65 : 1.0;
  const flags = pickBlankIndices(tokens, ratio);

  const bodyHtml = tokens.map((word, i) => {
    if (!flags[i]) return `<span class="word-fixed">${psalmEsc(word)}</span>`;
    // ⚠️ em 이 아니라 ch 로 잰다 — em 은 --psalm-fs 와 곱해져 큰 글씨 구절에서 액자를 뚫는다.
    const w = Array.from(word).length;
    return `<input class="word-input" data-answer="${psalmEsc(word)}"`
         + ` autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"`
         + ` style="width:${(w + 1) * 1.05}ch" />`;
  }).join(" ");

  const app = document.getElementById("app");
  app.innerHTML = `
    <div class="ps-wrap ps-stage${isCardMode() ? " ps-card-on" : ""}">
      <div class="ps-head">
        <span class="ps-day">${verse.dayNo}일차</span>
        <span class="ps-step">${stage}단계</span>
        <button class="ps-back" id="ps-back">← 목록</button>
      </div>
      ${psalmFrameHtml(verse, { bodyHtml })}
      <div class="ps-tools">
        <button class="ps-tool" id="ps-answer">보기</button>
        <button class="ps-tool" id="ps-listen">🔊 듣기</button>
        <button class="ps-tool" id="ps-mode">${isCardMode() ? "⌨️ 쓰기" : "👆 카드"}</button>
      </div>
      <div id="card-tray" class="card-tray"></div>
      <div id="ps-answer-panel" class="ps-answer" hidden>
        <div class="ps-answer-t">정답</div>
        <div class="ps-answer-b">${tokens.map((w, i) =>
          flags[i] ? `<strong>${psalmEsc(w)}</strong>` : psalmEsc(w)).join(" ")}</div>
        <button class="ps-tool" id="ps-answer-back">돌아가서 계속하기</button>
      </div>
      <div id="ps-result"></div>
    </div>
    <button class="home-fab" id="ps-home" aria-label="첫 화면으로">${homeFabLabel(u, true)}</button>`;
  window.scrollTo(0, 0);

  document.getElementById("ps-home").addEventListener("click", () => { stopSpeaking(); renderSummary(); });
  document.getElementById("ps-back").addEventListener("click", () => { stopSpeaking(); renderPsalmHome(); });
  document.getElementById("ps-listen").addEventListener("click", () => speakText(verseSpokenText(verse)));

  const ap = document.getElementById("ps-answer-panel");
  document.getElementById("ps-answer").addEventListener("click", () => { ap.hidden = false; });
  document.getElementById("ps-answer-back").addEventListener("click", () => { ap.hidden = true; });

  document.getElementById("ps-mode").addEventListener("click", () => {
    setCardMode(!isCardMode());
    renderPsalmBlank(verse, stage);
  });

  psalmSetupCheck(verse, stage);
}
```

- [ ] **Step 4: 채점과 완료 처리를 쓴다**

```js
// ⚠️ mode 는 "typing" / "card" 를 보낸다 — 주간 암송 화면과 똑같다.
//    서버(saveProgress)가 learn-typing / learn-typing-card 로 옮겨 주고,
//    제약이 아직 안 넓혀진 DB에서는 조용히 learn-typing 으로 되돌리는 폴백까지 있다.
//    여기서 "learn-typing" 을 직접 보내면 서버가 그것을 다시 매핑해
//    엉뚱한 값이 되거나 제약에 걸린다.
// ⚠️ 시편은 verse_no ≥ 1001 로 이미 갈리므로 새 mode 를 만들지 않는다.
function psalmSetupCheck(verse, stage) {
  let cardUsedHere = false;
  const tray = document.getElementById("card-tray");
  if (isCardMode() && tray) {
    psalmBuildTray(verse, () => { cardUsedHere = true; },
                   () => psalmStageDone(verse, stage, true));
  }
  // 자판 경로 — app.js 의 setupAutoCheck 를 그대로 쓰고 완료만 넘겨받는다.
  setupAutoCheck(verse, stage, () => psalmStageDone(verse, stage, cardUsedHere));
}

// 이 구절이 그분의 '첫 완주'인가 — saveProgress 보다 먼저 봐야 한다.
// ⚠️ isFirstJourney() 는 전역 verses(주간 35구절)만 센다. 시편만 하시는 분은
//    아무리 마쳐도 계속 true 라 축하 문구가 매번 뜬다 — 시편 쪽도 함께 본다.
function psalmWasFirst() {
  return isFirstJourney() && psalmDoneCount() === 0;
}

function psalmStageDone(verse, stage, cardUsed) {
  const wasFirst = psalmWasFirst();
  // ⚠️ 카드 여부는 isCardMode() 가 아니라 실제로 카드를 눌렀는지로 본다 —
  //    카드로 켜 두고 자판으로 치신 분을 카드 사용자로 세면 측정이 흐려진다.
  saveProgress(verse.no, stage, cardUsed ? "card" : "typing");
  if (stage < 3) return renderPsalmStage(verse, stage + 1);
  renderPsalmDone(verse, wasFirst);   // 3단계면 복습은 saveProgress 안에서 이미 예약됐다
}
```

- [ ] **Step 5: 카드 쟁반을 쓴다**

```js
// 낱말을 눌러 채우는 방식. 자판이 벽인 분이 54명(전체의 32%)이다.
// ⚠️ 쟁반은 액자 「밖」 아래에 둔다 — 안에 넣으면 다섯 줄 규칙이 무의미해진다.
function psalmBuildTray(verse, onCardUse, onAllDone) {
  const tray = document.getElementById("card-tray");
  const inputs = Array.from(document.querySelectorAll(".word-input"));
  if (!tray || !inputs.length) return;

  // ⚠️ norm 은 setupAutoCheck 안의 지역 함수다 — 여기에 따로 둔다.
  //    없이 부르면 카드 모드일 때만 화면이 통째로 멈춘다.
  const norm = (s) => String(s || "").trim().normalize("NFC");

  const words = inputs.map((i) => norm(i.dataset.answer));
  const shuffled = words.slice().sort(() => Math.random() - 0.5);
  tray.innerHTML = shuffled.map((w, k) =>
    `<button class="card-word" data-w="${psalmEsc(w)}" data-k="${k}">${psalmEsc(w)}</button>`).join("");

  tray.addEventListener("click", (e) => {
    const b = e.target.closest(".card-word");
    if (!b || b.disabled) return;
    const target = inputs.find((i) => !i.classList.contains("correct"));
    if (!target) return;
    if (norm(target.dataset.answer) !== norm(b.dataset.w)) {
      b.classList.add("shake");
      setTimeout(() => b.classList.remove("shake"), 320);
      return;
    }
    target.value = norm(target.dataset.answer);
    target.classList.add("correct");
    b.disabled = true;
    onCardUse();
    if (inputs.every((i) => i.classList.contains("correct"))) setTimeout(onAllDone, 260);
  });
}
```

- [ ] **Step 6: CSS를 더한다 (`style.css` 끝)**

```css
/* 액자 안 빈칸 — 폭은 ch 로 잰다. em 이면 --psalm-fs 와 곱해져 액자를 뚫는다. */
.ps-fr-body .word-input{
  font-size:inherit;font-family:inherit;line-height:1.4;
  border:none;border-bottom:2px solid #b9c4d2;background:#f4f7fb;
  border-radius:3px;text-align:center;padding:0 2px;margin:0 1px;
  color:#12294b;min-width:2.2ch;
}
.ps-fr-body .word-input.correct{background:#eef7f0;border-bottom-color:#4a8b5a;color:#2f6b3f}
.ps-fr-body .word-input.wrong{background:#fdeeee;border-bottom-color:#b04a4a;color:#8a2f2f}
.ps-fr-body .word-fixed{white-space:nowrap}

.ps-answer{background:#fffdf6;border:1px solid #e3dcc9;border-radius:10px;padding:14px;margin-top:12px}
.ps-answer[hidden]{display:none}
.ps-answer-t{font-size:13px;color:#8a6216;font-weight:700;margin-bottom:6px}
.ps-answer-b{font-size:17px;line-height:1.7;color:#12294b}
.ps-answer-b strong{color:#1a3a6b}

/* 카드 쟁반은 액자 밖 아래 */
.ps-wrap .card-tray{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:14px}
.ps-wrap:not(.ps-card-on) .card-tray{display:none}
.ps-wrap .card-word{
  background:#fff;border:1px solid #cfd8e4;border-radius:10px;
  padding:11px 15px;font-size:18px;color:#12294b;cursor:pointer;min-height:46px;
}
.ps-wrap .card-word:disabled{opacity:.32;background:#f2f2f2;cursor:default}
.ps-wrap .card-word.shake{animation:ps-shake .3s}
@keyframes ps-shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-5px)}75%{transform:translateX(5px)}}

@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]) .ps-fr-body .word-input{background:#1d2430;border-bottom-color:#4a5666;color:#dde5f0}
  :root:not([data-theme="light"]) .ps-wrap .card-word{background:#1d2430;border-color:#39424f;color:#dde5f0}
}
```

- [ ] **Step 7: 다섯 줄이 3단계에서도 지켜지는지 본다**

localhost에서 씨앗 구절 20편을 **3단계로** 열어 본다(2단계까지 마친 뒤, 또는 콘솔에서
`renderPsalmBlank(psalmVerses[0], 3)`).

확인:
- 액자 안이 **다섯 줄 이하**
- 「👆 카드」로 바꾸면 쟁반이 **액자 밖 아래**에 뜬다
- 카드로 한 낱말을 맞히면 초록으로 바뀌고 그 카드가 흐려진다
- 틀린 카드를 누르면 흔들리기만 하고 아무것도 안 채워진다
- 다 맞히면 다음 단계(또는 3단계면 완료 화면)로 넘어간다
- **콘솔에 `norm is not defined`가 없다** — 이게 나오면 카드 모드에서만 화면이 멈춘다

- [ ] **Step 8: 기록이 제대로 남는지 확인한다**

개발 DB SQL Editor:
```sql
select verse_no, mode, count(*)
  from public.challenge_log
 where verse_no >= 1001
 group by verse_no, mode order by verse_no;
```
기대: `mode`가 **`learn-typing` 또는 `learn-typing-card`뿐이다.** 다른 값이 있으면 잘못 짠 것이다.

```sql
select verse_no, stage from public.progress where verse_no >= 1001 order by verse_no;
select verse_no, box, due_at from public.reviews where verse_no >= 1001;
```
기대: 3단계까지 마친 구절이 `reviews`에도 있다 — **복습이 저절로 예약된다.**

- [ ] **Step 9: 커밋**

```bash
git add app.js js/psalm.js style.css
git commit -m "feat(시편 액자): 1~3단계 — 액자 안의 빈칸과 카드

액자는 그대로 있고 안쪽 글자만 빈칸이 된다. 카드 쟁반은 액자 밖 아래에 둔다
(안에 넣으면 다섯 줄 규칙이 무의미해진다).

setupAutoCheck·checkAllComplete 에 선택 인자 onDone 을 더했다. 안 주면 지금과
한 글자도 다르지 않다 — 그 아래는 전부 주간 암송 화면(#result-area·
showStageDoneModal·전역 verses)에 묶여 있어 시편에 쓰면 1번 구절로 튕긴다.
입력 정규화(3벌식·iOS NFD, 천지인 조합 중 자모)는 손으로 얻은 것이라 베끼지 않고
그대로 물려받는다.

⚠️ setupChallengeTyping 은 쓰지 않는다 — 도전·복습·긴 본문이 함께 쓰는
   공용 함수(4곳)라 여기서 손대면 그쪽 기록이 제약에 걸려 사라진다.
⚠️ norm 은 setupAutoCheck 안의 지역 함수라 카드 쪽에 따로 뒀다 —
   없으면 카드 모드일 때만 화면이 통째로 멈춘다.
⚠️ 빈칸 폭은 ch — em 이면 --psalm-fs 와 곱해져 액자를 뚫는다.
⚠️ 클라이언트가 보내는 mode 는 typing/card 다 — 서버가 learn-typing /
   learn-typing-card 로 옮긴다. learn- 을 직접 보내면 안 된다."
```

---

### Task 7: 완료 화면

**Files:**
- Modify: `js/psalm.js` · `style.css`

**Interfaces:**
- Consumes: `psalmVerses`, `isFirstJourney`, `FIRST_DONE_HTML`(app.js)
- Produces: `renderPsalmDone(verse, wasFirst)`

> ⚠️ **`showStageDoneModal`을 쓰지 않는다.** 그것은 전역 `verses`에서 「다음 말씀」을 찾는다 —
> 시편 구절에 쓰면 `verses.findIndex`가 `-1`을 돌려주고 **주간 1번 구절로 튕겨 나간다.**

- [ ] **Step 1: 완료 화면을 쓴다**

```js
function renderPsalmDone(verse, wasFirst) {
  stopSpeaking();
  const u = loadUser();
  // 다음 편 = 열린 것 중 dayNo 가 하나 큰 것. 없으면 오늘 것까지 다 한 것이다.
  const next = psalmVerses.find((v) => v.dayNo === verse.dayNo + 1) || null;
  const done = psalmDoneCount();
  const app = document.getElementById("app");
  app.innerHTML = `
    <div class="ps-wrap ps-done">
      <div class="ps-done-icon">🎉</div>
      <div class="ps-done-t">다 외우셨어요!</div>
      <div class="ps-done-ref">${verse.refFull}</div>
      ${wasFirst ? FIRST_DONE_HTML : `
        <div class="ps-done-s">말씀 앨범에 담겼고, 복습이 예약됐어요</div>`}
      <div class="ps-done-bar">${psalmTotal}편 중 <b>${done}편</b> 마쳤어요</div>
      ${next
        ? `<button class="ps-go" id="ps-next">다음 말씀 ▶ <span class="ps-next-ref">${next.refFull}</span></button>`
        : `<div class="ps-done-wait">오늘 열린 말씀은 여기까지예요 · 내일 한 편이 더 열려요</div>`}
      <button class="ps-tool ps-wide" id="ps-again">↺ 이 말씀 다시 암송</button>
      <button class="ps-tool ps-wide" id="ps-list">지난 말씀 보기</button>
    </div>
    <button class="home-fab" id="ps-home" aria-label="첫 화면으로">${homeFabLabel(u, true)}</button>`;
  window.scrollTo(0, 0);

  document.getElementById("ps-home").addEventListener("click", () => renderSummary());
  document.getElementById("ps-list").addEventListener("click", () => renderPsalmHome());
  document.getElementById("ps-again").addEventListener("click", () => renderPsalmStage(verse, 3));
  const nb = document.getElementById("ps-next");
  if (nb && next) nb.addEventListener("click", () => renderPsalmStage(next, 0));
}
```

- [ ] **Step 2: CSS (`style.css` 끝)**

```css
.ps-done{text-align:center;padding-top:26px}
.ps-done-icon{font-size:52px}
.ps-done-t{font-size:24px;font-weight:700;color:var(--navy,#1a3a6b);margin-top:8px}
.ps-done-ref{font-size:16px;color:var(--ink2,#4a5560);margin-top:4px}
.ps-done-s{margin-top:12px;color:#3f6b4a;background:#f0f6f0;border:1px solid #bcd6bc;
           border-radius:9px;padding:11px 14px;font-size:15px}
.ps-done-bar{margin:16px 0 4px;color:var(--ink2,#4a5560);font-size:15px}
.ps-done-bar b{color:var(--navy,#1a3a6b)}
.ps-done-wait{margin:16px 0;color:#8a6216;background:#fff8ec;border:1px solid #e8c98a;
              border-radius:9px;padding:12px 14px;font-size:15px}
.ps-next-ref{display:block;font-size:14px;font-weight:400;opacity:.85;margin-top:3px}
.ps-tool.ps-wide{display:block;width:100%;margin-top:8px}
```

- [ ] **Step 3: 확인**

3단계를 끝까지 마쳐 본다.
- 완료 화면이 뜨고 「다음 말씀 ▶」에 **다음 편의 요절**이 적혀 있다
- 오늘 열린 마지막 편을 마치면 「내일 한 편이 더 열려요」가 뜬다 — **주간 구절로 튕기지 않는다**
- 첫 완주라면 `FIRST_DONE_HTML`(앨범·복습 안내)이 뜬다

- [ ] **Step 4: 커밋**

```bash
git add js/psalm.js style.css
git commit -m "feat(시편 액자): 완료 화면

⚠️ showStageDoneModal 을 쓰지 않는다 — 그것은 전역 verses 에서 다음 말씀을
   찾으므로 시편 구절에 쓰면 findIndex 가 -1 을 돌려주고 주간 1번으로 튕긴다.
   다음 편은 psalmVerses 에서 dayNo+1 로 찾는다. 없으면 「내일 한 편이 더
   열려요」 — 그것이 이 코너의 리듬이다."
```

---

### Task 8: `app.js` 세 자리

**Files:**
- Modify: `app.js` — 첫 화면(1858줄 근처) · 복습 큐(6866줄 근처) · 앨범(8060줄 근처) · `FEAT_SINCE`(1165줄 근처)

**Interfaces:**
- Consumes: `renderPsalmHome`·`loadPsalmVerses`·`psalmByNo`·`isPsalmNo`·`psalmVerses`(Task 4)
- Produces: 첫 화면 진입로 · 복습에서 시편 구절이 안 사라짐 · 앨범 필터 칩

#### 8-A. 첫 화면 진입로

- [ ] **Step 1: `FEAT_SINCE`에 날짜를 적는다**

```js
const FEAT_SINCE = {
  ministry: "2026-12-13",
  psalm: "2026-09-21",        // 시편 말씀 액자 — 1일차와 같은 날부터 NEW
  prayer: "2026-09-03",
```

> ⚠️ **안 적으면 NEW가 아예 안 뜬다**(`featIsNew`가 `FEAT_SINCE[k]` 없으면 `false`).
> 영원히 붙어 있느니 안 뜨는 편이 낫다는 판단이라 그렇게 되어 있다.

- [ ] **Step 2: 「함께」 묶음에 한 줄을 더한다**

`app.js` 1858줄, 「응원·기도·공감」 **바로 아래**:
```js
    <button class="summary-help" id="open-board">💬 응원·기도·공감</button>
    <button class="summary-help" id="open-psalm">📿 시편 말씀 액자${newBadge("psalm")}</button>
    <button class="summary-help" id="open-prayer">🙏 가정 축복 기도문${newBadge("prayer")}</button>
```

> ⚠️ **`.summary-help`을 쓴다** — 「연한 남색 = 앱 안 기능」. 새 색을 주지 않는다.
> 색을 하나 늘릴 때마다 나머지가 그만큼 흐려진다.

- [ ] **Step 3: 클릭을 붙인다**

1911줄 근처(`open-passages` 옆):
```js
  { const b = document.getElementById("open-psalm"); if (b) b.addEventListener("click", () => { markFeatSeen("psalm"); renderPsalmHome(); }); }
```

- [ ] **Step 4: 미리보기 진입로를 둔다**

`app.js` 121줄 근처(`?passages=1`과 같은 자리):
```js
    if (new URLSearchParams(location.search).get("psalm") === "1") { renderPsalmHome(); return; }
```
정확한 자리는 `grep -n 'passages=1' app.js`로 찾아 그 옆에 같은 꼴로 넣는다.

#### 8-B. 복습 큐 — **이것이 유일한 필수 수정이다**

- [ ] **Step 5: 지금 상태를 먼저 확인한다 (버그를 눈으로 본다)**

개발 DB에서 시편 구절 하나를 3단계까지 마친 뒤, 복습 일정을 오늘로 당긴다:
```js
// 브라우저 콘솔
// ⚠️ 복습 키는 사용자별이다("memorize-review::<사용자>") — 키를 손으로 쓰지 말고
//    app.js 의 loadReview/saveReviewData 를 쓴다.
const r = loadReview();
Object.keys(r).filter(n => Number(n) > 1000).forEach(n => r[n].next = "2020-01-01");
saveReviewData(r);
console.log("복습 예정:", dueReviewNos());
startReview();
```

기대(버그): `dueReviewNos()`에는 1001이 들어 있는데 **복습 화면이 안 뜨고 첫 화면으로 돌아간다.**
`startReview`의 `verses.filter(...)`가 시편 구절을 못 찾기 때문이다.

- [ ] **Step 6: `startReview`를 고친다**

`app.js` 6866줄:
```js
function startReview() {
  const dueNos = dueReviewNos();
  const queue = verses.filter((v) => dueNos.includes(v.no));
  if (!queue.length) { renderSummary(); return; }
  renderReview(queue, 0);
}
```
→
```js
// ⚠️ 시편 말씀 액자 구절(no ≥ 1001)은 전역 verses 에 없다 — 여기서 합쳐 찾지 않으면
//    복습 큐에서 조용히 사라진다(예약은 되는데 화면에 안 나온다).
//    시편은 아직 안 받았을 수 있으니 필요할 때만 기다린다.
async function startReview() {
  const dueNos = dueReviewNos();
  if (dueNos.some(isPsalmNo)) {
    try { await loadPsalmVerses(); } catch (e) { /* 못 받으면 주간 것만이라도 복습한다 */ }
  }
  const pool = verses.concat(psalmVerses || []);
  const queue = pool.filter((v) => dueNos.includes(v.no));
  if (!queue.length) { renderSummary(); return; }
  renderReview(queue, 0);
}
```

⚠️ `startReview`가 `async`가 되었으니 부르는 쪽이 반환값을 쓰지 않는지 확인한다:
`grep -n "startReview" app.js` — 전부 `onclick`류면 그대로 두어도 된다.

- [ ] **Step 7: 시편 구절은 액자로 복습한다**

`renderReview(queue, idx)` 맨 앞에 한 줄:
```js
function renderReview(queue, idx) {
  const verse = queue[idx];
  // 시편 액자 구절은 액자로 복습한다 — 외울 때와 같은 그림이어야 기억의 고리가 이어진다
  if (isPsalmNo(verse.no)) return renderPsalmReview(queue, idx);
  const appEl = document.getElementById("app");
```

`js/psalm.js`에 더한다. **`psalmReviewCtx` 선언을 `psalmStageDone`보다 위에 둔다**
(`let`은 호이스팅돼도 TDZ라, 먼저 실행되는 자리에서 참조하면 터진다):

```js
let psalmReviewCtx = null;   // 복습 중이면 { queue, idx }

// 복습 — 3단계(전체 빈칸)를 액자 안에서. 외울 때와 같은 그림이어야 기억의 고리가 이어진다.
// ⚠️ 깃발을 render 「전에」 세운다 — psalmSetupCheck 가 render 안에서 콜백을 걸기 때문이다.
function renderPsalmReview(queue, idx) {
  psalmReviewCtx = { queue, idx };
  renderPsalmBlank(queue[idx], 3);
}
```

그리고 `psalmStageDone`(Task 6 Step 4)을 복습을 알아보게 고친다:
```js
function psalmStageDone(verse, stage, cardUsed) {
  // 복습 중이면 진도를 다시 저장하지 않는다 — 복습은 간격을 미루는 일이다
  if (psalmReviewCtx && psalmReviewCtx.queue[psalmReviewCtx.idx].no === verse.no) {
    const { queue, idx } = psalmReviewCtx;
    psalmReviewCtx = null;
    advanceReview(verse.no);
    // ⚠️ postChallenge 는 **구절 객체**를 받는다(verse_no 가 아니다) — app.js:7120.
    // ⚠️ 복습은 review- 접두사로 남긴다(2026-09-02 결정). 보이는 숫자는 안 바뀐다
    //    (순위·통계가 %typing%·includes("typing") 으로 세므로 그대로 들어간다).
    // ⚠️ 복습 화면에는 원래 카드가 없어 `review-typing-card` 가 CHECK 제약에 없다.
    //    카드로 풀었어도 `review-typing` 으로 남긴다 — 구분보다 기록이 먼저다.
    //    구분하고 싶으면 supabase/migrate_modes_card.sql 에 그 값을 **먼저** 더한다.
    postChallenge(verse, "review-typing");
    if (idx + 1 < queue.length) return renderReview(queue, idx + 1);
    return renderSummary();
  }
  const wasFirst = psalmWasFirst();
  saveProgress(verse.no, stage, cardUsed ? "card" : "typing");
  if (stage < 3) return renderPsalmStage(verse, stage + 1);
  renderPsalmDone(verse, wasFirst);
}
```

⚠️ 복습 화면 머리글이 「3단계」로 보인다. `renderPsalmBlank`의 `ps-step` 자리를
`psalmReviewCtx ? "복습" : stage + "단계"` 로 바꾼다 — **복습인 줄 모르면
「왜 또 이 말씀이지」가 된다.**

#### 8-C. 앨범 필터 칩

- [ ] **Step 8: 앨범에 트랙 칩을 더한다**

`app.js` `renderAlbum()` 맨 앞:
```js
let albumTrack = "weekly";   // "weekly" | "psalm" | "all" — 기본은 지금과 똑같다
```
(전역 선언은 다른 `albumXxx` 전역들 옆에 둔다: `grep -n "let albumOrder\|let albumPickMode" app.js`)

```js
function renderAlbum() {
  const u = loadUser();
  const appEl = document.getElementById("app");
  const pool = albumTrack === "psalm" ? (psalmVerses || [])
             : albumTrack === "all" ? verses.concat(psalmVerses || [])
             : verses;
  const done = pool.filter((v) => getPassedStage(v.no) >= 3);
```
(기존 `const done = verses.filter(...)` 줄을 위 두 줄로 바꾼다.)

- [ ] **Step 9: 칩 UI와 지연 로딩**

목록 위(`.rank-filter` 근처)에 넣는다:
```js
  const trackChips = `
    <div class="album-track">
      ${[["weekly","주간 말씀"],["psalm","시편 액자"],["all","전부"]].map(([k, label]) =>
        `<button class="atk${albumTrack === k ? " on" : ""}" data-track="${k}">${label}</button>`).join("")}
    </div>`;
```
그리고 클릭:
```js
  appEl.querySelectorAll(".atk").forEach((b) => b.addEventListener("click", async () => {
    const k = b.dataset.track;
    // 시편은 코너에 들어갈 때만 받는다 — 칩을 누르는 이 순간이 그 자리다
    if (k !== "weekly" && !psalmLoaded) {
      b.textContent = "불러오는 중…";
      try { await loadPsalmVerses(); } catch (e) {}
    }
    albumTrack = k;
    albumPicks.clear();
    albumOrder = null;
    renderAlbum();
  }));
```

⚠️ `albumPicks`·`albumOrder`의 실제 이름을 확인한다(`grep -n "albumPicks\|albumOrder" app.js`).
칩을 바꾸면 **고른 것과 섞은 순서를 비운다** — 다른 목록의 선택이 남아 있으면
「전부 듣기」가 화면에 없는 것을 읽는다.

- [ ] **Step 10: CSS (`style.css` 끝)**

```css
.album-track{display:flex;gap:6px;justify-content:center;margin:10px 0 6px}
.album-track .atk{
  background:#fff;border:1px solid #cfd8e4;border-radius:999px;
  padding:7px 15px;font-size:15px;color:#4a5560;cursor:pointer;
}
.album-track .atk.on{background:#1a3a6b;border-color:#1a3a6b;color:#fff;font-weight:700}
```

- [ ] **Step 11: 확인**

- 첫 화면 「함께」에 「📿 시편 말씀 액자」가 **「응원·기도·공감」 바로 아래**에 있고, 색이 다른 앱 안 기능과 같다
- 앨범 기본이 「주간 말씀」이고, 그 화면이 **지금과 한 픽셀도 다르지 않다**
- 「시편 액자」 칩을 누르면 시편 완료 구절만 보인다 · 「📻 3분요약」 칩이 안 뜬다(설교가 없다)
- 「전부」를 누르면 둘 다 보이고 「▶️ 전부 듣기」의 예상 시간이 그만큼 길어진다
- 복습 큐에 시편 구절이 **뜬다** (Step 5의 방법으로 다시 확인)

- [ ] **Step 12: 커밋**

```bash
git add app.js style.css js/psalm.js
git commit -m "feat(시편 액자): app.js 세 자리 — 진입로·복습 큐·앨범 칩

① 첫 화면 「함께」 묶음, 응원·기도·공감 바로 아래. 연한 남색(앱 안 기능)
   — 새 색을 주지 않는다. FEAT_SINCE.psalm 에 9/21 을 적었다(안 적으면 NEW 가
   아예 안 뜬다).
② 복습 큐 — startReview 가 verses 만 훑어 시편 구절이 조용히 사라지고 있었다.
   두 배열을 합쳐 찾고, 시편이면 액자로 복습한다. 이것이 유일한 필수 수정이다.
③ 앨범에 「주간 말씀 / 시편 액자 / 전부」 칩. 기본은 주간이라 지금 쓰시던 분께는
   아무것도 안 바뀐다. 칩을 바꾸면 고른 것·섞은 순서를 비운다 —
   안 그러면 「전부 듣기」가 화면에 없는 것을 읽는다.

⚠️ showStageDoneModal·setupChallengeTyping 은 건드리지 않았다(공용 경로)."
```

---

### Task 9: 5줄 실측 검증

눈으로 본 것을 **숫자로 못 박는다.**

**Files:**
- Create: `tools/psalm-measure.py`

**Interfaces:**
- Consumes: localhost에 뜬 앱 · 개발 DB 씨앗 구절
- Produces: 구절별 실측 줄수 표 (콘솔 + `psalm/측정결과.txt`). 다섯 줄을 넘는 구절이 있으면 **종료코드 1**

> ⚠️ **`app.js`에는 `?go=` 실행 자리가 없다**(2026-09-10 확인). 그 장치는
> `tools/capture-guide-shots.py`가 **임시 index.html에 씨앗 스크립트를 끼워** 만드는 것이다.
> 이 도구도 **같은 방식**을 쓴다 — 새로 발명하지 않는다.
>
> ⚠️ **헤드리스 크롬은 뷰포트가 526px로 고정된다** — `--window-size`와 무관하다.
> 폰 폭 390px로 재려면 컨테이너 폭을 CSS로 못 박고 재야 한다.
> 넓은 창에서 재면 **여백 손해를 절반으로 과소평가한다**(기도문 액자에서 실제로 그랬다).
>
> ⚠️ `?go=`에 넘기는 값에는 **`+` `<` `#` `%` 백틱**을 쓰지 않는다 — URL이 두 번 해독돼
> 조용히 깨진다. 그래서 **측정 코드는 전부 씨앗 스크립트에 두고 `?go=`로는 `psalmMeasure()`
> 한 마디만 보낸다.** 금지 문자가 아예 지나가지 않는다.

- [ ] **Step 1: `tools/psalm-measure.py` 를 쓴다**

```python
# -*- coding: utf-8 -*-
"""
시편 말씀 액자 — 액자 안 말씀이 실제로 몇 줄인지 잰다.

tools/capture-guide-shots.py 와 같은 방식이다: index.html 을 복사해 씨앗 스크립트를
끼운 임시 파일을 만들고, 로컬 서버로 띄워 ?go= 로 부른다. 다 재면 임시 파일을 지운다.

⚠️ 헤드리스 뷰포트는 526px 고정이라 .ps-wrap 을 CSS 로 못 박고 잰다.
⚠️ 측정 코드는 씨앗 안에 둔다 — ?go= 로는 `psalmMeasure()` 한 마디만 보낸다.
   (URL 이 두 번 해독돼 + < # % 백틱이 조용히 깨지는 것을 원천 회피)

먼저: (이 도구가 알아서 python -m http.server 를 띄운다)
사용법: python tools/psalm-measure.py [--stage 3] [--width 390]
"""
import argparse, json, os, re, subprocess, sys, tempfile, time

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT = os.path.join(ROOT, "psalm", "측정결과.txt")
PORT = 8731
TMP = "_psalm_measure.html"

SEED = """
<script>
function psalmMeasure() {
  var W = __WIDTH__, STAGE = __STAGE__;
  var st = document.createElement("style");
  st.textContent = ".ps-wrap{max-width:" + W + "px !important;width:" + W + "px !important}";
  document.head.appendChild(st);
  var out = [];
  psalmVerses.forEach(function (v) {
    renderPsalmStage(v, STAGE);
    var b = document.querySelector(".ps-fr-body");
    if (!b) { out.push({ no: v.no, err: "no body" }); return; }
    var cs = getComputedStyle(b);
    var fs = parseFloat(cs.fontSize);
    var lh = parseFloat(cs.lineHeight) || fs * 1.62;
    out.push({
      no: v.no, ref: v.refFull,
      fs: Math.round(fs), lh: Math.round(lh), h: b.offsetHeight,
      lines: Math.round(b.offsetHeight / lh),
      over: b.scrollWidth > b.clientWidth
    });
  });
  document.title = "RESULT" + JSON.stringify(out);
}
window.addEventListener("DOMContentLoaded", function () {
  var go = new URLSearchParams(location.search).get("go") || "";
  if (!go) return;
  var n = 0;
  var t = setInterval(function () {
    n++;
    if (typeof psalmVerses !== "undefined" && psalmVerses && psalmVerses.length) {
      clearInterval(t);
      try { eval(go); } catch (e) { document.title = "ERR " + e.message; }
    } else if (typeof renderPsalmHome === "function" && n === 2) {
      renderPsalmHome();
    } else if (n > 120) {
      clearInterval(t);
      document.title = "ERR psalmVerses 가 안 채워졌습니다";
    }
  }, 100);
});
</script>
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--stage", type=int, default=3)
    ap.add_argument("--width", type=int, default=390)
    a = ap.parse_args()

    html = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
    seed = SEED.replace("__WIDTH__", str(a.width)).replace("__STAGE__", str(a.stage))
    if "</body>" not in html:
        raise SystemExit("index.html 에 </body> 가 없습니다.")
    tmp_path = os.path.join(ROOT, TMP)
    open(tmp_path, "w", encoding="utf-8").write(html.replace("</body>", seed + "</body>"))

    srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--bind", "127.0.0.1"],
                           cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.5)
    try:
        url = "http://127.0.0.1:%d/%s?go=psalmMeasure()" % (PORT, TMP)
        with tempfile.TemporaryDirectory() as prof:
            r = subprocess.run(
                [CHROME, "--headless", "--disable-gpu", "--hide-scrollbars",
                 "--user-data-dir=" + prof, "--virtual-time-budget=20000",
                 "--dump-dom", url],
                capture_output=True, text=True, encoding="utf-8", timeout=180)
        dom = r.stdout or ""
    finally:
        srv.terminate()
        try: os.remove(tmp_path)
        except OSError: pass

    m = re.search(r"<title>(RESULT|ERR )(.*?)</title>", dom, re.S)
    if not m:
        raise SystemExit("측정 실패 — 결과 제목을 못 찾았습니다. 개발 DB에 시편 구절이 있는지,
"
                         "시작일이 오늘 이전으로 당겨져 있는지 보세요.")
    if m.group(1) == "ERR ":
        raise SystemExit("측정 실패 — " + m.group(2).strip())
    data = json.loads(m.group(2))

    bad = [d for d in data if d.get("lines", 0) > 5 or d.get("over")]
    lines = ["시편 말씀 액자 — 액자 실측 (폭 %dpx · %d단계)" % (a.width, a.stage), "-" * 62]
    for d in data:
        mark = "   ← 넘침" if d in bad else ""
        lines.append("no %-5s %-20s %2d줄  글씨 %2dpx  높이 %3dpx%s"
                     % (d.get("no"), d.get("ref", ""), d.get("lines", 0),
                        d.get("fs", 0), d.get("h", 0), mark))
    lines += ["-" * 62, "구절 %d편 · 다섯 줄 넘김 %d편" % (len(data), len(bad))]
    txt = "
".join(lines)
    print(txt)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    open(OUT, "w", encoding="utf-8", newline="
").write(txt + "
")
    print("
저장: " + os.path.normpath(OUT))
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: 개발 DB의 시작일을 당겨 구절을 열어 둔다**

측정하려면 구절이 열려 있어야 한다. 개발 DB SQL Editor:
```sql
update public.app_config
   set value = jsonb_set(value, '{start}', to_jsonb((current_date - 19)::text))
 where key = 'psalm';
```
(씨앗이 20편이므로 19일 전으로 당기면 전부 열린다.)

- [ ] **Step 3: 잰다 — 폰 폭 390px, 3단계**

```bash
python tools/psalm-measure.py --stage 3 --width 390
echo "종료코드 $?"
```
기대: **다섯 줄 넘김 0편**, 종료코드 **0**.

넘치는 것이 있으면 **글씨를 더 줄이지 말고** `psalmFitFont`의 `PSALM_USABLE_PX`(1370)를
실제 값에 맞춘다 — 낭비율 15%가 틀렸다는 뜻이다. 재고 다시 잰다.

- [ ] **Step 4: 320px 폰에서도 잰다**

```bash
python tools/psalm-measure.py --stage 3 --width 320
```
넘치면 `@media (max-width:340px)`의 `.ps-fr-in` 여백을 줄인다(20px → 16px).
**글씨를 20px 아래로 내리지 않는다** — 그러면 어르신이 못 읽으신다.

- [ ] **Step 5: 0단계도 재서 아래쪽도 확인한다**

```bash
python tools/psalm-measure.py --stage 0 --width 390
```
0단계는 빈칸이 없어 더 짧다. **한 줄짜리 구절이 있으면 액자가 허전하다** —
`psalm-fit.py`의 「짧음」 경고와 같은 구절인지 대조한다.

- [ ] **Step 6: 시작일을 되돌린다**

```sql
update public.app_config
   set value = jsonb_set(value, '{start}', '"2026-09-21"'::jsonb) where key = 'psalm';
```

> ⚠️ **되돌리는 것을 잊지 말 것.** 당겨 둔 채로 Task 10에 가면
> 운영 시드를 만들 때 그 값이 따라갈 수 있다.

- [ ] **Step 7: 커밋**

```bash
git add tools/psalm-measure.py psalm/측정결과.txt
git commit -m "test(시편 액자): 액자 줄수 실측 도구

눈으로 본 것을 숫자로 못 박는다. 3단계·390px 에서 다섯 줄 이하인지 재고
결과를 psalm/측정결과.txt 에 남긴다. 넘치면 종료코드 1.

capture-guide-shots.py 와 같은 방식 — index.html 에 씨앗을 끼운 임시 파일을
띄우고 ?go= 로 부른다(app.js 에는 ?go= 실행 자리가 없다).

⚠️ 헤드리스 뷰포트는 526px 고정이라 .ps-wrap 을 CSS 로 못 박고 잰다 —
   넓은 창에서 재면 여백 손해를 절반으로 과소평가한다.
⚠️ 측정 코드는 씨앗 안에 두고 ?go= 로는 psalmMeasure() 한 마디만 보낸다 —
   URL 이 두 번 해독돼 + < # % 백틱이 조용히 깨지는 것을 원천 회피한다."
```

---

### Task 10: 실자료 반영 + 배포

**담당자 자료(180구절 개역개정 본문)가 도착한 뒤에 한다.** 마감 09-17(목).

**Files:**
- Create: `supabase/psalm_frames.sql` (도구가 만든다)
- Modify: `index.html`·`app.js`(bump) · 게시판 공지 · `renderManual` 목차

- [ ] **Step 1: 자료를 잰다**

```bash
python tools/psalm-fit.py
```
「너무 김」·「출처 못 읽음」·「중복」이 **0편**이 될 때까지 담당자와 주고받는다.
군더더기(절 번호·겹공백)는 `--fix`로 다듬는다:
```bash
python tools/psalm-fit.py --fix
```

- [ ] **Step 2: 시드를 만든다**

```bash
python tools/psalm-fit.py --sql
head -30 supabase/psalm_frames.sql
```
확인: 시작일이 **`2026-09-21`**인지, 구절 수가 기대와 같은지.

- [ ] **Step 3: 개발 DB에 먼저 넣는다**

개발 SQL Editor에 `supabase/psalm_frames.sql` 전체를 붙여 넣고 실행 → 확인 질의 두 개를 본다.

```bash
DEV_ANON="<개발 anon 키>" bash tests/psalm-smoke.sh
```

- [ ] **Step 4: 개발에서 시작일을 당겨 30편을 열어 본다**

```sql
update public.app_config
   set value = jsonb_set(value, '{start}', to_jsonb((current_date - 29)::text))
 where key = 'psalm';
```
localhost에서:
```bash
python tools/psalm-measure.py --stage 3 --width 390
python tools/psalm-measure.py --stage 3 --width 320
```
기대: **넘김 0편.**

되돌린다:
```sql
update public.app_config
   set value = jsonb_set(value, '{start}', '"2026-09-21"'::jsonb) where key = 'psalm';
```

- [ ] **Step 5: 운영에 넣는다**

```bash
supabase functions deploy api --no-verify-jwt --project-ref xnomlgydifiqiybervtf
```
운영 SQL Editor에 `supabase/psalm_frames.sql` 실행.

⚠️ 시작일이 **`2026-09-21`**인지 다시 확인한다:
```sql
select value from public.app_config where key = 'psalm';
```
기대: `{"start": "2026-09-21", "totalDays": 180}`

- [ ] **Step 6: 프런트를 배포한다**

```bash
python tools/bump.py
git add index.html app.js style.css js/psalm.js supabase/psalm_frames.sql
git commit -m "feat(시편 액자): 실자료 180편 반영 · 9/21 열림"
git push
```

- [ ] **Step 7: ⚠️ 「이번 판에만 있는 표식」으로 배포를 확인한다**

```bash
V=$(grep -o 'app.js?v=[0-9a-z]*' index.html | head -1 | cut -d= -f2)
curl -s "https://gocheok.onlybible.kr/app.js?v=$V" | grep -o 'APP_BUILD = "[0-9a-z]*"'
curl -s "https://gocheok.onlybible.kr/js/psalm.js?v=$V" | grep -c "renderPsalmHome"
```
기대: `APP_BUILD`가 `$V`와 **같고**, `psalm.js`에서 1 이상.

> ⚠️ 이전 판에도 있던 이름으로 검사하면 CDN이 옛 파일을 내보내도 통과해 「배포 완료」로 오인한다.
> `js/psalm.js`는 **이번 판에 처음 생긴 파일**이라 그 자체가 표식이다.

- [ ] **Step 8: 운영 스모크**

```bash
PSALM_ENV=prod PROD_ANON="<운영 anon 키>" bash tests/psalm-smoke.sh
```
기대: 통과 7·실패 0. 9-21 전이면 `openCount` 0, `verses` 빈 배열 — **정상이다.**

- [ ] **Step 9: 안내를 올린다**

- 게시판 공지 (작성자 「제자양육부」) — 9/20(주일)
- `renderManual` 목차에 「시편 말씀 액자」 한 항목 (`grep -n "renderManual" app.js`로 자리를 찾는다)
- 주보 광고

- [ ] **Step 10: `CLAUDE.md`를 갱신한다**

「주요 기능」에 절을 더하고, 「다음 작업」의 시편 항목을 **완료로 옮긴다.**
남는 것: ① 액자 소재를 더 늘릴지 ② 180일 뒤 두 바퀴째 ③ 2주 뒤 전환율 확인.

- [ ] **Step 11: 2주 뒤 재 본다 (2026-10-05)**

`supabase/psalm_metrics.sql`을 만들어 네 가지를 고정한다. **손으로 다시 쓰지 않는다** —
파일로 고정해야 다음에 잰 값과 나란히 놓을 수 있다.

```sql
-- ① 들어오시는가 — 전체 활동자 중 시편 액자를 해 보신 분의 비율
with act as (select distinct user_id from challenge_log
              where created_at >= now() - interval '14 days'),
     ps  as (select distinct user_id from challenge_log
              where created_at >= now() - interval '14 days' and verse_no >= 1001)
select (select count(*) from ps) as 시편_참여자,
       (select count(*) from act) as 전체_활동자,
       round(100.0 * (select count(*) from ps) / nullif((select count(*) from act),0), 1) as 비율;
-- 목표: 2주 안에 30%. 카드 모드가 8일 만에 32%였다.

-- ② 매일 오시는가 — 이 코너의 존재 이유가 이 숫자다
select (created_at at time zone 'Asia/Seoul')::date as 날,
       count(distinct user_id) as 사람, count(*) as 횟수
  from challenge_log where verse_no >= 1001
   and created_at >= now() - interval '14 days'
 group by 1 order by 1;

-- ③ 끝까지 가시는가 — 단계 분포
select stage, count(*) as 구절수, count(distinct user_id) as 사람
  from progress where verse_no >= 1001 group by stage order by stage;

-- ④ 본진을 잠식하는가 ⚠️ — 주간 35구절만 따로 본다
select date_trunc('week', (created_at at time zone 'Asia/Seoul'))::date as 주,
       count(distinct user_id) as 활동자,
       count(distinct user_id) filter (where mode not like 'learn-%') as 도전자,
       round(100.0 * count(distinct user_id) filter (where mode not like 'learn-%')
             / nullif(count(distinct user_id),0), 1) as 전환율
  from challenge_log
 where verse_no < 1001 and created_at >= date '2026-08-24'
 group by 1 order by 1;
```

⚠️ **④가 떨어지면 본진을 잠식하는 것이다** — 첫 화면에서 시편 액자 자리를 낮춘다.
기준선은 **08-31주 37.3%**.
⚠️ 09-07주 이후는 복습이 `review-`로 빠졌으므로 **그 이전 주와 나란히 놓지 않는다**
(`supabase/challenge_funnel.sql`에 적어 둔 것과 같은 주의다).

---

## 자료 없이 갈 수 있는 데까지

담당자 자료가 늦어도 **Task 1~9는 전부 끝낼 수 있다.** 그리고 Task 10에서도 두 갈래가 있다.

| 상황 | 어떻게 |
|---|---|
| 자료가 30편만 왔다 | **그대로 연다.** 하루에 한 편씩만 쓰이므로 한 달을 간다. `day_no`가 없는 구절은 안 내려가고 화면은 열린 것만 그린다 — 뒤이어 채워도 아무 데도 안 깨진다 |
| 자료가 9/19까지 안 온다 | `app_config('psalm')`의 `start`를 **`2026-09-28`**로 옮긴다. **배포가 필요 없다** |
| 액자 소재를 못 만들었다 | 여섯 장으로 먼저 연다. `frame_art`가 DB에 있으니 나중에 그 구절만 바꾸면 된다 |

**「9월 21일에 맞추느라 본문을 대충 채우는」 일만은 하지 않는다** — 틀린 성경이 올라가는 것이 일주일 늦는 것보다 훨씬 비싸다.

---

## 만들지 않는 것 (설계 10장)

이 목록에 있는 것을 「이왕 하는 김에」 넣지 않는다. **하나하나 이유가 있어 뺀 것이다.**

| 안 만드는 것 | 왜 |
|---|---|
| **영어(NIV) 모드** | 180개 영문을 성경과 대조해 검수할 사람이 없다. 틀린 성경보다 없는 편이 낫다 |
| **🎤 음성 암송** | 도전에서 2회·2명으로 사실상 죽었다(2026-09-02 측정). **단 🔊 듣기(TTS)는 넣는다** — 0단계의 핵심이다 |
| **💡 쉬운 풀이 · 🧠 기억법 · 🖼️ 연상 그림 · 설교 연결** | 180개분의 AI 생성·검수 비용. 필요하면 나중에 자주 열리는 구절부터 |
| **어려운 도전(밑줄 지우기) 합류** | 「말씀 도전」 쪽 장치다 |
| **액자 「크게 보기」 회전(⟳)** | 암송 중에는 자판이 올라와 있어 쓸 자리가 없다 |
| **주제별 찾기** | 하루에 하나씩 열리므로 고를 것이 없다. 180일 뒤에 필요하면 그때 |
| **두 바퀴째 · 개인별 시작일** | 180일 뒤에 다시 이야기한다 |
| **180편이 든 정적 JSON 폴백** | 「안 열린 구절은 서버가 안 내려보낸다」가 잠금의 전부다 — 그 파일을 배포하면 잠금이 무의미해진다 |

## 손대지 않는 것 (지키는 선)

| 자리 | 왜 |
|---|---|
| `showStageDoneModal` | 전역 `verses`에서 다음 말씀을 찾는다 — 시편에 쓰면 주간 1번으로 튕긴다 |
| `setupChallengeTyping` | 도전·복습·긴 본문이 함께 쓰는 공용 함수(4곳). 여기서 mode를 바꾸면 그쪽 기록이 사라진다 |
| `challenge_log.mode`의 CHECK 제약 | 시편은 `verse_no ≥ 1001`로 이미 갈린다. 제약을 안 건드리는 것이 이 설계의 이득이다 |
| 전역 `verses` 배열 | 시편을 넣으면 첫 화면 진행 막대·앨범·어려운 도전·다음 구절 여덟 곳의 의미가 바뀐다 |
| 첫 화면 「오늘 할 일」 큰 단추 | 그건 주간 35구절 본진의 흐름이다. 「화면에 딱 하나」라는 규칙을 깨지 않는다 |
| `admin-stats.html`의 말씀 편집 | `getVerses`가 weekly만 돌려주므로 관리자 화면은 그대로 35구절만 보인다 — 의도한 것이다. 시편은 엑셀·SQL로 관리한다 |

## 나중에 확인할 것 (막지는 않음)

- **관리자 구절별 통계**(`verseStats` → `v2_verse_stats`)에 시편 180행이 더 붙는다. 관리자 화면에서 `verse_no ≥ 1001`을 접거나 라벨로 구분한다.
- **주간 리포트**(`weeklyReport`)가 구절별로 집계한다면 시편이 섞인다. `verseLabelMap`은 무해하지만 집계 쪽을 한 번 읽어 본다.
- **복습에 카드가 들어갔다.** `review-typing-card`를 남기려면 `supabase/migrate_modes_card.sql`에 그 값을 **먼저** 더한다. 그 전까지는 `review-typing`으로 통일한다.
