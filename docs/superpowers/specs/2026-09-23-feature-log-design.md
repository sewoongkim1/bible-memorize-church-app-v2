# 못 재는 기능에 기록을 심는다 — 설계 (2026-09-23)

## 0. 한 줄

시편 액자·매일 묵상·말씀 앨범·사용 설명서·푸시 열람 다섯 곳이 **서버에 아무 흔적도 안 남긴다.**
`blessing_log` 가 이미 검증한 모양(「하루 × 사람 × 번호 = 1행, 다시 봐도 `cnt` 만 올림」)을
**통합 표 하나**로 일반화해 심고, 보는 법을 SQL 파일 둘에 박아 둔다.

## 1. 왜 지금 하나

2026-09-23 사용 분석(`docs/analysis/2026-09-23-usage-analysis.md` 4장)에서 드러난 것은
「사용률이 낮다」가 아니라 **「사용률을 알 수가 없다」** 였다.

| 기능 | 서버에 남는 기록 | 잴 수 있나 |
|---|---|---|
| 암송 · 도전 · 복습 | `challenge_log` → `daily_activity` | ✅ |
| 가정 축복 기도문 | `blessing_log` | ✅ **본보기** |
| 게시판 · 응원 · 필사 · 이벤트 | 각자의 표 | ✅ |
| 쉴만한 물가(시편 180편) | **없음** | ❌ |
| 매일 묵상 | **없음** | ❌ |
| 말씀 앨범(이어 듣기·TTS) | **없음** | ❌ |
| 사용 설명서 · `guide/` | **없음** | ❌ |
| 위젯(아이폰·안드로이드) | **없음** | ❌ |
| 푸시 **열람** | 발송만(`push_log`) | ❌ |

시편 쪽에 남는 흔적은 「시편 구절을 **암송**한 기록」 248회·14명뿐이다.
액자로 읽는 행위 자체가 기록되지 않으니 **180편이 몇 명에게 닿는지 알 수 없다.**

카드 모드가 그랬다 — 도입하고도 여덟 달을 측정 못 하다가 2026-09-02에야 28.5%인 걸 알았다
(`docs/notes/metrics.md`). 같은 일이 지금 다섯 기능에서 벌어지고 있다.

### ⚠️ 이 설계가 바로잡는 두 가지 오해

1. `CLAUDE.md` 의 남은 과제에 「2주 뒤 전환율(`supabase/psalm_metrics.sql`)」 이 적혀 있는데
   **그 파일은 저장소에 없다**(`psalm_dev_seed.sql`·`psalm_frames.sql` 만 있다).
   없는 파일을 과제로 남겨 두면 그 과제는 영원히 미뤄진다 — 이번에 **실제로 만든다.**
2. 운영 DB 에 `visits`·`activity_log` 표가 있어 방문 계측이 있는 것처럼 보이지만,
   이 앱의 Edge Function 은 그 이름을 **한 번도 쓰지 않는다**(`grep` 0건).
   형제 앱(찬양·말씀)이 같은 Supabase 프로젝트를 쓰기 때문에 보이는 것이다.
   **이 앱 것으로 오해하면 안 된다.**

## 2. 범위

**이번에 심는 곳** — 시편 액자 · 매일 묵상 · 말씀 앨범 · 사용 설명서 + 푸시 열람.

**이번에 빼는 것 — 위젯.** 이유를 적어 둔다(안 적으면 「넷인데 왜 셋이지」가 된다).
`ios-app/.../WidgetShared.swift` 에 **「위젯은 로그인 없이 보이는 공개 정보만 다룬다 —
`user_id`·개인정보는 절대 담지 않는다」** 가 원칙으로 박혀 있다. 아래 표는 `user_id` 가
기본키라 **위젯 기록은 여기에 못 들어온다.** 넣으려면 그 원칙을 깨거나 익명 기기값을
새로 만들어야 하고, 그건 이 작업과 성격이 다른 결정이다.
→ 다음 판에서 **「횟수·기기 수만 세는 별도 표」** 로 따로 다룬다.

**이번에 빼는 것 — 아이폰 네이티브 푸시(APNs).** 지금 실기기에서 알림이 안 뜬다
(`CLAUDE.md` 다음 작업 절). 동작을 확인할 수 없는 경로에 계측을 얹으면
「기록이 0인 것」과 「알림이 안 뜨는 것」을 구별할 수 없다.

## 3. 설계 ① — 무엇을 「한 번」으로 세나

**이 장이 이 설계에서 가장 조용히 틀어질 자리다.**

매일 묵상은 **하루 한 번 저절로 뜬다**(`app.js` `maybeShowWeeklyMeditation` — localStorage 로
그날 본 것을 기억한다). 이걸 그냥 기록하면 **「묵상을 본 사람 = 앱을 연 사람」** 이 되어
숫자가 뜻을 잃는다. 앨범도 **화면만 열고 안 듣는 것**과 **듣기 시작한 것**은 다른 이야기다.

그래서 `feature` 값을 **행위 단위로** 나눈다. `daily_activity` 가 `mode` 를 기본키에 넣어
`learn-typing`·`review-voice` 를 나눠 둔 것과 같은 발상이다 —
**잘게 남겨 두면 합계로 다시 묶을 수 있지만, 뭉쳐서 남기면 영영 못 나눈다.**

| `feature` | 언제 한 번 | `item` 의 뜻 | 이걸로 답하는 질문 |
|---|---|---|---|
| `psalm` | 시편 액자 한 편을 펼쳐 볼 때 | 편 번호(`no`) | 180편이 **몇 명**에게 닿나 · 어느 편이 읽히나 |
| `meditation` | 성도님이 **눌러서** 열 때 | 그 주 구절 번호 | 스스로 찾아 읽는 분이 몇 명인가 |
| `meditation-auto` | 하루 한 번 **저절로** 뜰 때 | 그 주 구절 번호 | 위 숫자의 분모 |
| `album` | 앨범 화면을 열 때 | 0 | |
| `album-play` | **듣기를 시작**할 때 | 0 | 열고도 안 듣는 분이 얼마나 되나 |
| `guide` | `guide/` 를 열 때 | 0 | 설명서가 쓰이나 |
| `push` | 알림을 눌러 앱이 열릴 때 | 0 | 켜 둔 분 중 **실제로 누르는** 비율 |

### ⚠️ `push` 의 `item` 이 0 인 이유

푸시 payload 의 주소는 `https://gocheok.onlybible.kr/` 뿐이라 **구절 번호가 실려 있지 않다**
(`supabase/functions/api/index.ts` 의 `sendWeeklyVersePush`). 「어느 구절 알림이 먹혔나」는
`day` 로 역산한다(`verses.date` 가 있으니 된다). 서버 푸시 payload 를 건드리지 않는다 —
알림 주소를 바꾸는 것은 기능 변경이고, 이 작업의 범위가 아니다.

### ⚠️ `item` 은 `not null default 0` 이다

Postgres 기본키에는 null 을 못 넣는다. `blessing_log` 가 `no` 를 not null 로 둔 것과 같다.

## 4. 설계 ② — 표 · 함수 · 보안 (`supabase/feature_log.sql`)

```sql
create table if not exists public.feature_log (
  user_id uuid not null references public.users(id) on delete cascade,
  day     date not null default ((now() at time zone 'Asia/Seoul')::date),
  feature text not null,             -- psalm | meditation | meditation-auto | album | album-play | guide | push
  item    int  not null default 0,   -- 기능마다 뜻이 다르다(3장의 표)
  cnt     int  not null default 1,
  primary key (user_id, day, feature, item)
);

alter table public.feature_log enable row level security;   -- 표를 만든 그 자리에서
create index if not exists feature_log_day_idx  on public.feature_log (day);
create index if not exists feature_log_feat_idx on public.feature_log (feature, day);

create or replace function public.v2_feature_log(uid uuid, f text, n int)
returns void language sql security definer set search_path = public as $$
  insert into public.feature_log (user_id, feature, item) values (uid, f, coalesce(n, 0))
  on conflict (user_id, day, feature, item) do update set cnt = public.feature_log.cnt + 1;
$$;
revoke all on function public.v2_feature_log(uuid, text, int) from public, anon, authenticated;
grant execute on function public.v2_feature_log(uuid, text, int) to service_role;
```

**왜 이 모양인가** (전부 이미 한 번씩 대가를 치른 자리다)

- **한국 시간 기준 날짜.** UTC 로 두면 밤에 보신 것이 다음 날로 넘어간다.
- **열 때마다 한 행씩 쌓지 않는다.** `challenge_log` 는 로그 11,052행인데 집계는 579행이었다.
  `blessing_log` 는 처음부터 집계 모양으로 시작했다 — 이 표도 같다.
- **RLS 를 표 만든 그 자리에서 켠다.** `event_entries` 가 그걸 빠뜨려 `user_id` 47건이
  공개 키로 읽혔다(2026-08-25). 이 표에도 `user_id` 가 있어 더더욱 그렇다.
- **뷰(view)를 만들지 않는다.** 뷰는 RLS 대상이 아니라 만든 사람(postgres) 권한으로 돌아
  밑 테이블의 RLS 를 지나간다 — `v_ranking_all` 이 그렇게 133행을 흘렸다.
  꼭 만들어야 하면 `revoke all ... from anon, authenticated` + `security_invoker = on`.
- **함수는 `service_role` 만.** Edge Function 만 쓴다.

### ⚠️ `feature` 에 DB `CHECK` 제약을 걸지 않는다

걸면 **「허용 목록이 세 곳(화면·서버·DB)」** 함정을 그대로 밟는다. 나중에 위젯이나 새 기능을
더할 때 앱은 보내는데 저장만 조용히 막혀, 화면에는 「연결이 고르지 않아요」만 뜬다
(`challenge_log.mode` CHECK 제약에서 한 번 겪었다 — `docs/notes/memorize-flow.md`).
→ **허용 목록은 `index.ts` 한 곳에만** 두고, 모르는 값은 조용히 버린다.

### ⚠️ `member_merge.sql` 에 이 표를 더한다

같은 분이 두 계정으로 갈렸다가 합쳐질 때 이 표도 따라가야 한다. 그 파일은 표 이름을
**손으로 나열**하고 있어서(`array['progress','challenge_log',...]`), 빠뜨리면 외래키에 걸려
**합치기 자체가 실패**한다. `blessing_log` 가 들어간 자리 셋을 그대로 따라 한 줄씩 더한다.

## 5. 설계 ③ — 서버 액션 하나 · 앱 심는 자리 다섯

### 서버 (`supabase/functions/api/index.ts`)

`blessingLog` 를 그대로 본뜬다.

```ts
const FEATURES = new Set(["psalm","meditation","meditation-auto","album","album-play","guide","push"]);

async function featureLog(b: any) {
  if (!b.user_id || !FEATURES.has(String(b.feature))) return { ok: true, skipped: true };
  try {
    const { error } = await db.rpc("v2_feature_log",
      { uid: b.user_id, f: String(b.feature), n: Number(b.item) || 0 });
    if (error) return { ok: true, skipped: "db" };     // 표가 없는 판에서도 앱은 돈다
  } catch (_e) { return { ok: true, skipped: "error" }; }
  return { ok: true };
}
```

`switch` 에 `case "featureLog"` 한 줄, `js/api.js` 에 `featureLog` 한 줄.

**⚠️ 절대 예외를 던지지 않는다.** 기록 때문에 시편 액자가 안 열리면 본말이 뒤집힌다.
표가 아직 없는 판(개발 DB·옛 판)에서도 앱은 그대로 돌아야 한다.

**⚠️ 응답에 `user_id` 를 싣지 않는다.** 이 API 는 JWT 가 없어 클라이언트가 준 `user_id` 를
그대로 믿는다 — 남의 `user_id` 하나면 그 사람 행세가 된다.

### 앱 (`app.js` 공용 함수 하나 + 다섯 자리)

```js
// 같은 (기능,항목)을 60초 안에 다시 보내지 않는다 — 화면이 다시 그려지는 것과
// 사람이 다시 들어오는 것을 가른다. 분 단위 이상 재방문은 그대로 cnt 가 올라간다.
const featSent = {};                                   // 창을 닫으면 사라진다(메모리만)
function logFeature(feature, item) {
  try {
    const u = loadUser();
    if (!u || !u.user_id) return;                      // 로그인 전이면 아무것도 안 한다
    const k = feature + ":" + (item || 0), now = Date.now();
    if (featSent[k] && now - featSent[k] < 60000) return;
    featSent[k] = now;
    api.featureLog({ user_id: u.user_id, feature: feature, item: item || 0 });
  } catch (e) {}                                       // 기록이 화면을 막는 일은 없다
}
```

`await` 하지 않는다 — 응답을 기다릴 이유가 없고, 기다리면 느린 통신에서 화면이 늦어진다.
`blessingLog` 를 부르는 자리(`app.js`)와 같은 방식이다.

| 파일 | 자리 | 부르는 것 |
|---|---|---|
| `js/psalm.js` | `drawPsalmHome()` — 오늘 편을 그린 직후 | `psalm`, 편 번호 |
| `app.js` | 묵상 창을 여는 호출부(`force` 여부를 아는 자리) | `meditation` / `meditation-auto` |
| `app.js` | `renderAlbum()` 시작부 | `album`, 0 |
| `app.js` | `albumPlayStart()` | `album-play`, 0 |
| `guide/index.html` | 페이지가 열릴 때 | `guide`, 0 |

**왜 60초 중복창인가.** `cnt` 의 뜻은 「그날 몇 번 열었나」다. 억제를 아예 안 하면 화면이
다시 그려질 때마다 가짜로 올라가고, 하루 단위로 억제하면 `cnt` 가 1로 고정돼 뜻이 사라진다.
60초는 그 사이를 가른다.

**`guide/` 는 별도 페이지다.** `js/api.js`·`js/config.js` 를 안 쓰는 독립 HTML 이라
`../js/config.js` 하나만 불러 10줄짜리 `fetch` 를 직접 넣는다(키를 두 곳에 적지 않기 위해서다).
⚠️ `tools/bump.py` 는 `index.html` 만 훑으므로 **이 태그에는 캐시번호가 안 붙는다** —
`config.js` 를 고치는 날엔 `guide/` 도 함께 봐야 한다.

### ⚠️ `guide` 숫자는 「앱 안에서 누른 분」만이다

`guide/` 는 **일부러 로그인이 필요 없게 만든 페이지**다(그 파일 머리에 그렇게 적혀 있다 —
「설치 전에도, 로비에서 QR로도 바로 열린다」). localStorage 에 `user_id` 가 없는 분은
기록되지 않는다. 그러니 이 숫자는 **「설명서를 본 사람 수」가 아니라 「앱에 로그인한 채
설명서를 누른 사람 수」** 다. 나중에 이 숫자를 읽을 때 그 차이를 잊으면 안 된다.
로비 QR·주보로 들어온 분까지 세려면 익명 계측이 필요하고, 그건 위젯과 같은 성격의
별도 결정이다(이번 범위 밖).

### 푸시 열람 (`sw.js` + `app.js`)

`notificationclick` 이 여는 주소에 `from=push` 를 붙이고, **이미 열려 있는 창에는
`postMessage` 로 알린다**(`clients.matchAll` 에서 `focus()` 만 하면 주소가 안 바뀐다).
앱은 시작할 때 그 표식을 보고 한 번 기록한 뒤 **`history.replaceState` 로 주소에서 지운다** —
안 지우면 새로고침마다 다시 세어진다.

기존 딥링크(`?v=38`)와 섞여도 안전하도록 파라미터로 붙인다(`?v=38&from=push`).
⚠️ `?go=` 에 `+ < # % 백틱` 을 쓰면 조용히 깨진다는 함정이 있다(`docs/notes/capture-tools.md`) —
`from=push` 는 영문 소문자뿐이라 해당 없다.

## 6. 설계 ④ — 보는 법: SQL 파일 둘

### (가) `supabase/feature_log.sql`

표·함수·RLS 아래에 **「보는 법」 질의를 주석으로 박아 둔다**(`blessing_log.sql` 과 같은 결).
파일 하나만 열면 심는 법과 보는 법이 함께 있다.

1. 기능별 한눈에 — 사람 수 · 횟수 · 첫날 · 마지막날
2. 날짜별 추이 (기능 × 날짜)
3. **능동 대 수동** — `meditation` ÷ `meditation-auto`
4. **앨범 새는 자리** — `album` 연 사람 중 `album-play` 까지 간 비율
5. 사람별 본 날수 분포 (한 번 보고 마셨나, 이어 보시나)
6. 소속별 (⚠️ 이름이 나오므로 관리자만)

### (나) `supabase/psalm_metrics.sql`

`CLAUDE.md` 의 「2주 뒤 전환율」 과제를 실제로 끝낼 수 있게 만든다.

```sql
-- ② 전환율 — 액자를 본 분 중 몇 %가 암송까지 갔나
--    ⚠️ 여기서는 daily_activity 가 아니라 challenge_log 를 읽는다.
--       집계표에는 verse_no 가 없어 「시편 구절인지」를 가릴 수가 없다.
--       (순위·mydays 가 집계표를 읽는 것과는 다른 이야기다 — 이건 순위가 아니다.)
with seen as (select distinct user_id from feature_log where feature = 'psalm'),
     memo as (select distinct user_id from challenge_log where verse_no > 1000)
select (select count(*) from seen)                                as 액자를_본_사람,
       (select count(*) from memo)                                as 암송까지_간_사람,
       round(100.0 * (select count(*) from seen s join memo m using(user_id))
                   / nullif((select count(*) from seen), 0), 1)   as 전환율_퍼센트;
```

여기에 ① 닿는 범위 ③ 이어 보는 정도 ④ 어느 편이 읽히나(`verses.track='psalm'` 제목까지)
⑤ 묵상 창 배너를 거쳐 온 비율을 함께 넣는다.

시편 구절 번호는 `1000 + day_no` 다(`js/psalm.js` 의 `PSALM_NO_BASE = 1000`).

### ⚠️ 「2주 뒤」의 기준일은 개시일이 아니라 배포일이다

지금 잰 248회·14명은 **「암송 기록」이지 「열람」이 아니다.** 이 파일이 생겨도
**앞으로의 열람만** 잴 수 있다 — 2026-09-12 개시부터 오늘까지의 열람은 영영 없다.
그래서 전환율을 보는 시점은 **기록을 심어 배포한 날 + 2주** 다.

## 7. 설계 ⑤ — 배포 순서

**표(SQL)가 먼저다.** 새 표에 새 액션만 얹는 경우라 빈 표는 아무도 안 읽는다.
반대로 코드를 먼저 내보내면 `v2_feature_log` 가 없어 전부 `skipped:"db"` 로 버려진다
(앱은 멀쩡히 돌지만 그 며칠치가 사라진다).

1. 개발 DB(`ktpwthwqzgcqcrmsafdo`) SQL Editor 에서 `feature_log.sql` 실행
2. 개발에 `api` 배포 → `python -m http.server` 로 localhost 에서 다섯 자리 확인
   (개발 DB 에 행이 실제로 쌓이는지 본다 — 화면이 안 깨지는 것만으로는 확인이 아니다)
3. 운영 DB 에 같은 SQL 실행
4. 운영에 `api` 배포
5. `python tools/bump.py` → 커밋·푸시 → **이번 판에만 있는 표식**으로 배포 확인

### ⚠️ 4번 전에 `git status` 를 본다

`supabase functions deploy` 는 git 이 아니라 **작업 트리를 올린다** — 남의 커밋 안 된 코드도
함께 나간다. 2026-09-23 현재 이 저장소에는 다른 세션의 변경이 남아 있다
(`admin.html`·`store/listing-ios-ko.txt`·`docs/analysis/` 등).

### ⚠️ 커밋은 경로를 못 박는다

여러 세션이 같은 체크아웃을 쓴다. `git add -A` 금지 —
`git commit -- <경로>` 로 내 파일만 담고, 공용 파일(`app.js`·`index.ts`)은
`git apply --cached` 로 내 헝크만 담는다. 커밋 직전 `git diff --cached` 로 남의 것이 없는지 본다.

## 8. 성공 기준

배포 다음 날 개발이 아닌 **운영** DB 에서 이것들이 0 이 아니어야 한다.

- `select feature, count(distinct user_id), sum(cnt) from feature_log group by feature;`
  → `psalm`·`meditation-auto`·`album` 세 줄은 반드시 나온다(자동으로 닿는 경로다).
- `meditation` · `album-play` · `guide` · `push` 는 0 일 수 있다 —
  **그 0 자체가 이 작업이 찾던 답이다.**

2주 뒤 `psalm_metrics.sql` ②를 돌려 시편 전환율을 처음으로 숫자로 말할 수 있다.

## 9. 하지 않는 것 (YAGNI)

- **관리자 화면 칸** — 이번 목적은 분석이지 운영 화면이 아니다. SQL 로 충분하다.
- **주간 리포트 메일 한 줄** — 메일 템플릿과 `weekly_report` 를 함께 고쳐야 한다. 나중에.
- **`blessing_log` 흡수** — 운영 데이터 이사 + `member_merge.sql` + admin 통계 칸이 함께
  바뀌어야 한다. 기록을 심으려다 멀쩡한 것을 건드리게 된다. 나란히 둔다.
- **체류 시간·스크롤 깊이** — 「몇 명에게 닿나」를 모르는 상태에서 깊이를 재는 것은 순서가 틀렸다.
