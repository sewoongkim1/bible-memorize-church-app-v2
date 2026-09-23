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
| 위젯(아이폰·안드로이드) | **없음** | ❌ → ⚠️ **묵상 위젯만 됐다**(2장 — 처음 전제가 틀렸다) |
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

### ⚠️ 「위젯은 이 표에 못 들어온다」 — 틀린 전제였다 (2026-09-23 같은 날 고침)

처음 이 장은 이렇게 적었다. `ios-app/.../WidgetShared.swift` 에 **「위젯은 로그인 없이 보이는
공개 정보만 다룬다 — `user_id`·개인정보는 절대 담지 않는다」** 가 원칙으로 박혀 있고, 아래 표는
`user_id` 가 기본키이니 **위젯 기록은 여기에 못 들어온다**, 넣으려면 그 원칙을 깨거나 익명
기기값을 새로 만들어야 한다 — 그래서 뺀다.

**그 전제는 「위젯 프로세스가 스스로 서버에 보고할 때」만 맞다.** 실제 길은 다르다. 위젯을 누르면
위젯이 보고하는 것이 아니라 **로그인된 앱이** `/?w=meditation` 으로 열린다
(`AppDelegate.openFromWidget` → `app.js` 의 `getWidgetTarget`). 그 시점에 앱은 이미
`user_id` 를 들고 있다 — 위젯은 여전히 공개 정보만 다루고, 원칙은 하나도 안 깨진다.
**푸시 열람을 `?from=push` 로 재는 것과 글자 그대로 같은 구조**인데, 바로 아래 절에 그 구조를
적어 두고도 위젯에는 같은 수가 있다는 것을 못 봤다. 네이티브 코드도 스토어 심사도 필요 없다.
→ **이번에 실제로 심었다**(`meditation-widget`, 3장 표).

### 그래도 아직 못 재는 것 (실제 코드를 확인하고 적는다)

- **이번주 말씀 위젯 — 못 가른다.** 아이폰 `TodayVerseWidget.swift` 의 `link` 는
  **모든 크기가 함께 쓰는 하나**다(잠금 네모 · 잠금 시계 위 한 줄 · 홈 가로 · 홈 「크게」).
  전부 `gocheokmemorize://verse?no=N` → `AppDelegate` 가 `/?v=N` 로 바꿔 싣는다. 그 주소는
  **말씀 아카이브(sermon.onlybible.kr) 딥링크와 글자 그대로 같다** — 위젯에서 온 것인지
  아카이브에서 온 것인지 가를 수가 없다. 안드로이드도 같다(`WidgetLogic.verseUrl` → `/?v=번호`).
  ⚠️ **홈 「크게」가 별도 스킴이라 못 가른다는 말은 사실이 아니다**(설계 검토 중 그렇게 적힐 뻔했다) —
  `systemLarge` 는 화면 모양만 다른 가지이고 주소는 같은 `link` 를 쓴다. 갈라지는 자리는 단 하나,
  **구절 번호를 모를 때 `://home`** 인데 그건 앱만 열고 아무 표식도 안 남기는 길이다.
  → 가르려면 위젯 쪽 주소에 표식을 더해야 한다(예: `?v=N&from=widget`). **이번 범위 밖이고,
    아이폰은 스토어 판을 새로 내야 반영된다.**
- **기기(아이폰/안드로이드)·위젯 크기 — 못 가른다.** 안드로이드 위젯도 같은 `/?w=meditation` 을
  쓴다(`android-app/.../WidgetLogic.java` 의 `MEDITATION_URL`). 플레이스토어에 나가는 날부터
  같은 `meditation-widget` 칸에 섞여 든다 — 그날 이후 숫자를 「아이폰 위젯」이라 부르면 틀린다.
- **축복 기도문 위젯(`/?w=prayer`) — 가를 수는 있는데 안 심었다.** 주소가 이미 갈라져 있어
  묵상과 똑같이 하면 된다. 안 한 이유는 기도문 열람이 이 표가 아니라 **`blessing_log`** 에
  남기 때문이다(`app.js` `drawPrayer`) — 거기에 갈래를 더하는 것은 다른 표의 모양을 바꾸는
  일이라 성격이 다르다. ⚠️ 그래서 **기도문은 지금도 「한 통」이다** — 위젯으로 온 분과 단추로
  누른 분이 `blessing_log` 에 섞여 있다. 묵상에서 고친 그 결함이 기도문에는 그대로 남아 있다.

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
| `meditation` | 첫 화면 **「오늘의 묵상」 단추**로 열 때 | 그 주 구절 번호 | 앱 안에서 스스로 찾아 읽는 분이 몇 명인가 |
| `meditation-widget` | **위젯을 눌러** 열 때(`?w=meditation`) | 그 주 구절 번호 | 위젯이 실제로 쓰이나 — 이것도 능동이다 |
| `meditation-auto` | 하루 한 번 **저절로** 뜰 때 | 그 주 구절 번호 | 위 둘과 함께 분모(합집합)를 이룸 — 아래 ⚠️ 참고 |
| (안 남김) | 관리자 **미리보기**(`?preview=daily`) | — | 성도님 행위가 아니다 — 아래 ⚠️ 참고 |
| `album` | 앨범 화면을 열 때 | 0 | |
| `album-play` | **듣기를 시작**할 때 | 0 | 열고도 안 듣는 분이 얼마나 되나 |
| `guide` | `guide/` 를 열 때 | 0 | 설명서가 쓰이나 |
| `push` | 알림을 눌러 앱이 열릴 때 | 0 | 켜 둔 분 중 **실제로 누르는** 비율 |

### ⚠️ 묵상은 **한 통이 아니라 세 갈래**다 (2026-09-23 같은 날 고침)

처음엔 `maybeShowWeeklyMeditation(force)` 의 `force` 하나로 `meditation` / `meditation-auto` 둘만
갈랐다. **그런데 `force=true` 로 들어오는 길이 셋이었다** — 첫 화면 단추 · 위젯 탭(`?w=meditation`) ·
관리자 미리보기(`?preview=daily`). 셋이 한 통에 담기면 「스스로 찾아 읽는 분」 숫자가 부풀고,
쌓인 행에는 `day·feature·item` 만 남아 **나중에 갈라낼 방법이 아예 없다.** 그래서 `source` 인자를
하나 더해(화면 동작은 안 바뀌고 **기록 이름만** 갈린다) 이렇게 나눴다.

| 부르는 자리 | 넘기는 것 | 남는 `feature` |
|---|---|---|
| `app.js` — 첫 화면 「오늘의 묵상」 단추(`open-meditation`) | `(true, true)` | `meditation` |
| `app.js` — 위젯 탭(`?w=meditation`, `widgetTo === "meditation"`) | `(true, true, "widget")` | `meditation-widget` |
| `app.js` — 하루 한 번 자동 팝업(`maybeShowDailyMessage`, `catch` 폴백 포함) | `()` | `meditation-auto` |
| `app.js` — 관리자 미리보기(`previewDailyMessage`, `?preview=daily`) | `(true, false, "preview")` | **안 남김** |

**⚠️ 관리자 미리보기는 기록하지 않는다.** 담당자가 확인하려고 연 것이지 성도님이 읽은 것이 아니다.
남기면 그만큼 숫자가 부푸는데, 그 부풀림은 **소수의 관리자가 여러 번 누르는 것**이라 표본이 작은
초기에 특히 크게 튄다. 「안 남기는 것」이 이 자리에서는 더 정확한 기록이다.

### ⚠️ 그래서 묵상 비율의 분모는 **합집합**이다 (하나로 다른 하나를 나누면 안 된다)

세 갈래는 서로 겹친다 — 한 사람이 자동으로도 보고 단추로도 열 수 있다. 그래서
`meditation ÷ meditation-auto` 처럼 하나를 다른 하나로 나누면 **100% 를 넘을 수 있어 「몫」이
될 수 없다.** 분모는 셋의 **합집합**(묵상을 한 번이라도 본 분, 한 사람당 한 번만 셈)이어야 한다.

- **묵상을 본 분** = `meditation` ∪ `meditation-widget` ∪ `meditation-auto`
- **스스로 찾아 연 분** = `meditation` ∪ `meditation-widget` (위젯 탭도 일부러 누른 능동이다)
- `능동_비율_퍼센트` = 둘째 ÷ 첫째 — 분자가 분모의 부분집합이라 0~100 을 벗어나지 않는다
  (실제 `feature_log.sql` ③이 이 모양으로 짜여 있다).

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
  feature text not null,             -- psalm | meditation | meditation-widget | meditation-auto | album | ... (늘어난다)
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

⚠️ **이 원칙은 지켜졌지만, 배포하고 하루도 안 지나 다른 두 세션이 벌써 이 표에 값을 더 썼다**
(2026-09-23 실측 — `song` 은 `index.ts` 가 스스로 부르는 서버 안쪽 호출이라 애초에 허용 목록을
거치지 않고, `ranking-scope` 는 그 목록에 값을 더한 경우다). 허용 목록이 한 곳이라는 원칙과는
별개로, **값을 늘리는 사람(허용 목록에 더하든, 서버 안쪽에서 직접 부르든)은 `supabase/feature_log.sql`
머리의 「item 의 뜻」 표도 그 자리에서 함께 고친다.** 이 표를 안 고치면 원칙은 지켜졌는데도 분석
파일(다음에 볼 사람이 믿고 읽는 곳)만 낡는다 — 실제로 이번 리뷰에서 그렇게 낡아 있는 것이 잡혔다.

### ⚠️ `member_merge.sql` 에 이 표를 더한다

같은 분이 두 계정으로 갈렸다가 합쳐질 때 이 표도 따라가야 한다. 그 파일은 표 이름을
**손으로 나열**하고 있어서(`array['progress','challenge_log',...]`), 빠뜨리면 외래키에 걸려
**합치기 자체가 실패**한다. `blessing_log` 가 들어간 자리 셋을 그대로 따라 한 줄씩 더한다.

## 5. 설계 ③ — 서버 액션 하나 · 앱 심는 자리 다섯

### 서버 (`supabase/functions/api/index.ts`)

`blessingLog` 를 그대로 본뜬다.

```ts
const FEATURES = new Set(["psalm","meditation","meditation-widget","meditation-auto",
                          "album","album-play","guide","push"]);   // ⚠️ 여기만 고친다 — 늘어난다

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
| `app.js` | 묵상 창을 여는 호출부 **넷**(3장의 표 — 어느 길로 들어왔는지 아는 자리) | `meditation` / `meditation-widget` / `meditation-auto` / 안 남김 |
| `app.js` | 앨범을 **여는 단추**(`open-album` 클릭 핸들러) — `renderAlbum()` 시작부가 **아니다** | `album`, 0 |
| `app.js` | `albumPlayStart()` | `album-play`, 0 |
| `guide/index.html` | 페이지가 열릴 때 | `guide`, 0 |

**왜 60초 중복창인가.** `cnt` 의 뜻은 「그날 몇 번 열었나」다. 억제를 아예 안 하면 화면이
다시 그려질 때마다 가짜로 올라가고, 하루 단위로 억제하면 `cnt` 가 1로 고정돼 뜻이 사라진다.
60초는 그 사이를 가른다.

**⚠️ 앨범은 `renderAlbum()` 시작부가 아니라 여는 단추에서 부른다 — 처음 이 설계가 틀렸던 자리다
(2026-09-23 실측 리뷰로 고침).** `renderAlbum()` 은 화면을 그리는 함수라, 그 화면 안 갈래 칩·
가리기·섞기·고르기 같은 칩을 누르면 자기 자신을 다시 불러 다시 그린다. 함수 시작부에 로그를
두면 60초가 지난 뒤의 재조작마다 "다시 그림"이 "다시 엶"으로 잡혀 `album` 의 `sum(cnt)` 가
다른 기능보다 부풀려진다. **「화면을 열었다」를 재려면 여는 동작(단추)에 심어야지, 그리는
동작(함수)에 심으면 안 된다** — 이 둘을 같은 것으로 여긴 것이 설계 단계의 착오였다.

**`guide/` 는 별도 페이지다.** `js/api.js`·`js/config.js` 를 안 쓰는 독립 HTML 이라
`../js/config.js` 하나만 불러 10줄짜리 `fetch` 를 직접 넣는다(키를 두 곳에 적지 않기 위해서다).
⚠️ `tools/bump.py` 는 `index.html` 만 훑으므로 **이 태그에는 캐시번호가 안 붙는다** —
`config.js` 를 고치는 날엔 `guide/` 도 함께 봐야 한다.

### ⚠️ `guide` 숫자는 「앱 안에서 누른 분」만이다

`guide/` 는 **일부러 로그인이 필요 없게 만든 페이지**다(그 파일 머리에 그렇게 적혀 있다 —
「설치 전에도, 로비에서 QR로도 바로 열린다」). localStorage 에 `user_id` 가 없는 분은
기록되지 않는다. 그러니 이 숫자는 **「설명서를 본 사람 수」가 아니라 「앱에 로그인한 채
설명서를 누른 사람 수」** 다. 나중에 이 숫자를 읽을 때 그 차이를 잊으면 안 된다.
로비 QR·주보로 들어온 분까지 세려면 **로그인 없는 분을 세는 익명 계측**이 필요하고,
그건 이 표(기본키에 `user_id` 가 있다)로는 못 하는 다른 성격의 결정이다(이번 범위 밖).
⚠️ 위젯을 예로 들지 말 것 — 위젯은 **로그인된 앱이 열려 기록하므로 익명 계측이 필요 없었다**
(2장). 이 자리와 위젯을 같은 문제로 묶은 것이 처음 설계가 위젯을 뺀 까닭이었다.

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
3. **능동 대 수동** — (`meditation` ∪ `meditation-widget`) ÷ (그 둘 ∪ `meditation-auto`) —
   **분모는 합집합이다.** 하나를 다른 하나로 그대로 나누면 두 집합이 겹쳐 100% 를 넘을 수 있어
   몫이 아니다(위 3장 표 뒤 ⚠️ 참고). 관리자 미리보기는 애초에 안 남으므로 뺄 것이 없다.
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
⑤ **겹침**(묵상을 본 분 중 액자도 본 분의 비율)을 함께 넣는다.

### ⚠️ ⑤는 「거쳐 왔다」가 아니라 「겹친다」다 (실측 뒤 고침)

처음엔 이 항목을 「묵상 창 배너를 거쳐 온 비율」이라 적었는데, 이건 **인과 주장**이다 — 묵상을
본 것이 액자를 보게 된 **원인**이라는 뜻을 담는다. `feature_log` 는 그날 무엇을 봤는지만 남기지
**무엇이 무엇으로 이어졌는지는 남기지 않는다.** 실제로 짠 질의(`feature_log.sql` ③)는 정직하게
`겹침_퍼센트` 라 부른다 — 두 기능을 같은 날 둘 다 본 분의 비율일 뿐, 묵상 배너를 눌러서 액자로
건너갔다는 뜻이 아니다. **이 데이터로는 인과 버전을 잴 수 없다** — 나중에 누가 「거쳐 온 비율」로
되돌리려 하면, 그건 잴 수 있는 것이 아니라 이 표의 한계라는 것을 먼저 확인할 것.

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
- `meditation` · `meditation-widget` · `album-play` · `guide` · `push` 는 0 일 수 있다 —
  **그 0 자체가 이 작업이 찾던 답이다.** 특히 `meditation-widget` 이 0 이면 그것은
  「위젯을 깔아 둔 분이 잠금화면에서 안 누른다」는 뜻이다 — 1.1.0 을 출시한 값어치를 처음으로
  숫자로 보는 자리다. ⚠️ 다만 **아이폰 위젯을 쓰는 분 자체가 몇 분 안 될 수 있다** — 0 을
  「위젯이 쓸모없다」로 곧장 읽지 말 것.
- ⚠️ **2026-09-23 하루치의 `meditation` 에는 관리자 미리보기가 섞여 있다**(같은 날 고쳤다).
  첫 주 숫자를 볼 때 그 하루를 빼거나, 최소한 섞였다고 밝힐 것.

2주 뒤(= **2026-10-07**) `psalm_metrics.sql` ②를 돌려 시편 전환율을 처음으로 숫자로 말할 수 있다.

## 9. 하지 않는 것 (YAGNI)

- **관리자 화면 칸** — 이번 목적은 분석이지 운영 화면이 아니다. SQL 로 충분하다.
- **주간 리포트 메일 한 줄** — 메일 템플릿과 `weekly_report` 를 함께 고쳐야 한다. 나중에.
- **`blessing_log` 흡수** — 운영 데이터 이사 + `member_merge.sql` + admin 통계 칸이 함께
  바뀌어야 한다. 기록을 심으려다 멀쩡한 것을 건드리게 된다. 나란히 둔다.
- **체류 시간·스크롤 깊이** — 「몇 명에게 닿나」를 모르는 상태에서 깊이를 재는 것은 순서가 틀렸다.
- **이번주 말씀 위젯·기도문 위젯 가르기** — 둘 다 **할 수는 있다**(2장). 말씀 위젯은 주소에
  `&from=widget` 을 더하고 스토어 판을 새로 내야 하고, 기도문은 `blessing_log` 의 모양을
  바꿔야 한다. ⚠️ **「위젯은 원리상 못 잰다」로 적지 말 것** — 이번에 바로 그 전제가 틀렸다.
  안 하는 이유는 「못 해서」가 아니라 **「스토어 판·다른 표를 건드려야 해서」**다.
- **위젯 기기·크기 가르기(아이폰/안드로이드, 잠금/홈)** — 지금은 `meditation-widget` 한 칸에
  섞인다. 가르려면 주소에 표식을 더해야 하고, 그건 양쪽 스토어 판을 새로 내는 일이다.
