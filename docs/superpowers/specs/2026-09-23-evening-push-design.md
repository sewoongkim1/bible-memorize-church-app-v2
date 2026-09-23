# 저녁 알림 · 알림 권한을 「첫 구절 완료 직후」로 (2026-09-23)

> 어제 분석(`docs/analysis/2026-09-23-usage-analysis.md`) **3순위**를 설계로 옮긴 것.
> 근거 · 구독자는 활동일 **2.1배**·최근 7일 활동률 **1.6배**인데 활동자 225명 중 구독은 **27명(12.0%)** 뿐이다(3.8장).
> 알림은 아침(KST 5~8시) 한 번인데 반복 정점은 저녁 7시다.

> ⚠️ **`app.js`·`style.css` 는 줄 번호 대신 함수·선택자 이름으로 적었다.** 이 문서를 쓰는 동안
> 다른 세션이 `app.js` 를 고치고 있어 번호가 130줄쯤 밀리는 것을 실제로 겪었다. 이름으로 찾을 것.
> `index.ts`·`privacy/` 등 손대는 사람이 없던 파일만 번호를 남겼다(그것도 2026-09-23 기준이다).

---

## ⚠️ 먼저 — 분석 문서와 CLAUDE.md 가 **틀렸다**

분석 3순위는 「`latestVerse()` 가 UTC 자정 기준이라 구절이 바뀌는 날 0~9시에 지난 구절을 보낸다.
알림을 늘리기 전에 먼저 고칠 것」이라고 적었다. **그 버그는 존재하지 않는다.**

- `verses.date` 는 **항상 KST 자정 순간**으로 저장된다.
  관리자 폼이 `값 + "T00:00:00+09:00"` 을 붙인다(`admin-stats.html:2734`), 시드도 `…T15:00:00.000Z` 꼴이다.
  2026-09-23 운영 `getVerses` 38건 **전부** `T15:00:00+00:00`(= KST 00:00) · null 0건 · 비(非)자정 0건.
- `latestVerse` 는 `Date.parse(v.date)` 로 그 **순간**을 비교하므로(`index.ts:628`) **KST 자정에 정확히 넘어간다.**
- 검증: 2026-07-01 ~ 10-01 **2,232시간을 매시** 돌려 `latestVerse` 와 `weeklyVerseKst` 의 cur/prev 를
  대조했다 — **불일치 0건.**

실제로 9시간이 어긋나는 경우는 **SQL Editor 에서 손으로 `date='2026-10-03'` 처럼 날짜만 넣을 때뿐**이다
(Postgres 가 UTC 자정으로 해석한다).

### 그래서 고칠 곳 (이 설계의 0판에 포함)

| 파일 | 무엇 |
|---|---|
| `CLAUDE.md` | 「아침 알림(`latestVerse()`)은 아직 UTC 자정 기준」 줄 |
| `docs/analysis/2026-09-23-usage-analysis.md` · `.html` | 3순위 끝의 ⚠️ 절 |
| `supabase/functions/api/index.ts:664-665` | `weeklyVerseKst` 머리 주석의 같은 말 |

**정정 문구** — 「`verses.date` 는 KST 자정으로 저장되므로 `latestVerse` 도 KST 자정에 넘어간다.
어긋나는 것은 SQL Editor 에서 날짜만 손으로 넣은 행뿐이다. 진짜 방어는 `saveVerse` 에서 KST 자정으로
정규화하고 관리자 폼에서 **날짜를 필수 입력**으로 만드는 것.」

### ⚠️ 그리고 「`latestVerse` 를 `weeklyVerseKst` 로 갈아끼우기」는 **하지 않는다**

없는 버그를 고치려다 **되돌릴 수 없는 위험**을 새로 만든다.

- `latestVerse` 는 날짜 없는 구절을 **버린다**(`index.ts:627` `.filter(v => v.date)`).
- `weeklyVerseKst` 는 **오늘 것으로 본다**(`index.ts:679` `if (!raw) return today;`) — 앱과 맞추려고 일부러 그렇게 했다.
- 관리자 폼의 **날짜 칸은 필수가 아니다**(`admin-stats.html:2751` — 필수는 `no`·`refShort`·`text` 뿐).

> **사고 시나리오** · 담당자가 토요일 오후에 39번을 날짜 없이 먼저 넣는다(**2026-09-20 에 실제로 있었던 일** —
> `index.ts:666-667` 주석이 그 사건을 적어 두었다). 그러면 **주일 08:00 `weeklyVersePush`** 가
> 「📖 이번주 암송 말씀이 도착했어요!」로 **아직 시작도 안 한 구절을 전체 구독자에게, 되돌릴 수 없게** 뿌린다.

막아 주던 것은 `weeklyVersePush` 의 `if (!v || v.no == null)` 이 **아니다** — `no` 는 primary key 라
절대 null 이 아니고(`schema.sql:29`), 그 skip 은 **사문(死文)** 이다. 실제 보호막이 바로 그
`.filter(v => v.date)` 한 줄이었다.

→ 별도 과제로 남긴다: `weeklyVersePush` 의 skip 조건을 `!v || !v.date` 로 바꾸고, 관리자 폼에서 날짜를 필수로.

---

## 무엇을 만드는가

1. **저녁 알림** — 구독자 중 **오늘(KST) 활동이 없는 분**께 **저녁 20:00** 에 한 번.
   밀린 복습이 있으면 복습으로, 없으면 이번주 말씀으로. 사람마다 문구가 다르다.
2. **저녁만 끄는 토글** — `evening` 칸 + 설정 화면 토글. **기본 켜짐.**
3. **알림 권한 요청 자리 이동** — 「앱을 켠 직후」가 아니라 **첫 구절을 끝낸 직후** 완료 창 안에서.

### 정한 것 (이 순서로 물어 정했다)

| 갈림길 | 정한 것 | 까닭 |
|---|---|---|
| 저녁 대상 | **오늘 활동 없는 분만** | 하루 한 번을 안 넘는다. 새 설정·새 칸 없이 필터 하나로 된다 |
| 저녁 문구 | **복습 중심 개인화** | 2026-09-23 배포한 복습 카드 모드·3구절 묶음을 받쳐 준다 |
| 권한 요청 모양 | **완주 창 안 단추 하나** | 흐름을 안 끊는다. `sd-challenge` 라는 본보기가 이미 있다 |
| 아이폰 사파리(미설치) | **「홈 화면에 담기」로 바꿔 낸다** | 아이폰은 설치가 알림의 선행 조건이다 |
| 저녁 토글 | **칸 + 토글, 기본 켜짐** | 도달을 지키면서 탈출구를 만든다 |
| 발송 시각 | **저녁 20:00** | 아래 ⚠️ 를 알고 고른 값 |

> ⚠️ **20:00 은 저녁 습관층을 매일 오폭한다.** 분석 3.8장의 표에 저녁 **7·8·9·10시 = 55·56·51·55명**이다.
> 20:00 정각에 `daily_activity` 를 보면 21·22시에 늘 하시는 분들은 전원 「오늘 0행」이다.
> 이것을 알고 20:00 으로 정했다. 대신 두 가지로 누른다 —
> ① **저녁만 끄는 토글**이 있다 ② **문구에서 부정 전제를 뺀다**(「오늘 아직 못 하셨죠」 같은 말을 쓰지 않는다).
> 2주 뒤 해지율을 보고 21:00 으로 늦출지 다시 판단한다.

---

## 다섯 판으로 쪼갠다

한 판에 네 덩이를 담으면 밤 20시에 처음 실증되는 코드가 넷이 되어 원인을 가를 수 없다.
특히 `sendPush` 는 아침 크론 넷 · 주일 발송 · 관리자 수동 · `monitor` diag 가 **전부 지나는 길목**이라,
여기가 깨지면 **다음 날 새벽 5시에 전 구독자 대상으로** 드러난다.

| 판 | 무엇 | 사람에게 닿나 | 되돌리기 |
|---|---|---|---|
| **0** | 문구·동의 정정 + 저녁 토글 | 아니오 | 재푸시 |
| **1** | `sendPush` 수술만 (아무도 안 씀) | 아니오 | 이전 판 재배포 |
| **2** | `eveningPush` 액션 (친구 한 분께만 리허설) | 리허설만 | 액션을 안 부르면 끝 |
| **3** | 크론 등록 | **예** | `cron.unschedule` 한 줄 |
| **4** | 완료 창 초대 | **예** | 표식이 소모되면 못 되돌림 |

---

## 0판 — 문구·동의부터

### ⚠️ 왜 이것이 먼저인가

알림 동의 문구가 **「아침만」이라고 네 곳에서 약속**하고 있다. 저녁 알림이 나가는 순간 넷 다 거짓이 된다.

| 자리 | 지금 문구 |
|---|---|
| `js/push.js:115` | 「🔔 알림이 설정되었습니다! **매일 오전 H시에** 오늘의 묵상을 보내드려요.」 |
| app.js 설정의 「🕖 알림 시간 (아침)」 라벨 | 「🕖 알림 시간 **(아침)**」 |
| app.js 의 `id="enable-push"` 단추 부제 | 「( **매일 아침** · 위에서 시간 선택 )」 |
| **`privacy/index.html:104`** | 「**아침 말씀 알림**을 그 기기로 보내기 위해」 |

마지막 것은 **로그인 없이 열리는 공개 방침**이고 플레이스토어 심사에 낸 문서다.
CLAUDE.md 가 「모으는 것을 하나라도 빠뜨리면 그게 심사 반려 사유이고, 성도님께 사실이 아닌 말을 한 것이
된다」고 적어 둔 그 자리를, 이번엔 **보내는 것** 쪽에서 다시 밟는 셈이 된다.

⚠️ **앱 안 개인정보 화면(app.js)과 `privacy/` 두 곳을 함께 본다** — CLAUDE.md 개인정보 절.

### ⚠️ 저녁만 끄는 길이 지금 없다

`disablePush`(`js/push.js:127-147`)는 `sub.unsubscribe()` + `api.removePush(endpoint)` 로
**구독 자체를 지운다.** 알림 손잡이는 시각 넷(5·6·7·8시)뿐이고 종류별 on/off 는 표에도 UI 에도 없다.

저녁이 성가신 분의 유일한 선택지가 **전체 해제**가 된다. 그러면 아침까지 사라지고,
**크론을 내려도 그 구독은 안 돌아온다.** 구독자는 **34명이 전부**다 — 한 분이 3%다.

### 할 일

**SQL** — `supabase/push_evening.sql` (새 파일)

```sql
alter table public.push_subscriptions add column if not exists evening boolean not null default true;
alter table public.ios_push_tokens   add column if not exists evening boolean not null default true;
```

> 기본 `true` — 기존 34분은 그대로 받으시되 끌 수 있다.
> ⚠️ **개발 먼저, 운영 그다음**(CLAUDE.md SQL 절).
> ⚠️ 이미 성도님이 쓰는 표에 **칸을 더하는** 경우라 CLAUDE.md 규칙상 **코드가 먼저**다.
> 다만 이 칸은 새 칸이고 옛 코드가 안 읽으므로 순서가 실제로 문제되지 않는다 — 그래도 함수를 먼저 올린다.

**서버** — `setPushEvening` 액션(`user_id` + `on`) 하나. `savePush`·`saveIosPushToken` 은 건드리지 않는다
(기본값이 칸에서 나온다).

**프런트**
- `js/push.js` 에 `getPushEvening()` / `setPushEvening(on)` — `setPushHour` 와 같은 꼴.
  ⚠️ **네이티브 앱 분기를 잊지 말 것** — `setPushHour:41-49` 가 그 본보기다(이 분기가 없어 2026-09-16 에
  네이티브 사용자가 시간을 바꿔도 조용히 무시됐다).
- 설정 화면에 토글 한 줄. 글은 「🌙 저녁 8시에도 받기」.
- 위 문구 네 곳 정정.

**정정할 문구**
- `js/push.js:115` → 「🔔 알림이 설정되었습니다!\n매일 **아침 H시**와 **저녁 8시**에 말씀을 보내드려요.\n(저녁은 설정에서 끄실 수 있어요)\n방금 …」
- app.js 설정의 「🕖 알림 시간 (아침)」 라벨 → 「🕖 아침 알림 시간」
- app.js 의 `id="enable-push"` 단추 부제 → 「( 아침 · 저녁 두 번 · 위에서 아침 시간 선택 )」
- `privacy/index.html:104` → 「아침 말씀 알림」 → 「**말씀 알림**」
- 그리고 ⚠️ 절의 CLAUDE.md·분석 문서·`index.ts` 주석 세 곳도 이 판에서 함께 고친다.

---

## 1판 — `sendPush` 수술만 (아무도 안 쓴다)

### 무엇을 더하나

`sendPush`(`index.ts:1022`)에 셋:

1. 구독 select 에 `user_id` 한 칸
2. `b.only` 배열이 있으면 **JS 로** 거름
3. payload 를 루프 **안**에서 `b.userBodies?.[user_id]` 로 만듦

기존 호출은 이 셋이 없어 **지금과 똑같이 돈다.** 호출자 여섯을 전수 확인했다 —
라우터(`index.ts:400`) · `weeklyVersePush` 내부 호출(`index.ts:1106`) · 크론 네 잡(`push_cron_hourly.sql`) ·
주일 잡(`weekly_verse_push_cron.sql`) · `monitor.yml:80` diag · `admin-stats.html`.
어느 것도 `only`·`userBodies`·`user_id` 를 안 넘긴다. `js/api.js`·`app.js`·`tests/` 에는 `sendPush` 호출이 아예 없다.

### ⚠️ 여기서 조용히 틀어지는 자리 다섯 — 전부 막아야 한다

**① 발송 루프는 둘이다.** 웹푸시(`index.ts:1044~1063`)와 **APNs**(`index.ts:1065~1078`).
iOS 루프는 `select("id,device_token")` 에 **`user_id` 가 없고**, `sendApns` 는 payload 가 아니라
**함수 인자 `title`/`body` 를 쓴다**(`index.ts:1071`).

> 고치지 않으면 — 아이폰 앱 쓰시는 **14분은 오늘 암송을 다 마쳤어도 저녁 알림을 받고, 그것도
> 개인 문구가 아닌 아침 기본 문구로** 받는다.
> ⚠️ **지금은 증상이 안 보인다** — CLAUDE.md 대로 APNs 가 실기기에 안 뜨는 상태다.
> 그래서 **가장 나쁜 조합**이다: 배포 뒤 며칠 관찰해도 이상이 없어 「잘 됐다」로 닫히고,
> 몇 달 뒤 Mac+Xcode 로 APNs 를 고치는 날 14분 전원에게 한꺼번에 드러난다. **증상이 없을 때 고치는 게 싸다.**

→ `select("id,device_token,user_id")` · `only` 필터를 iOS 루프에도 · `title`/`body` 를
   `b.userBodies?.[t.user_id]` 우선으로 · `total` 은 **거른 뒤** 수로.

**② `title`·`body` 는 함수 스코프 `let` 이다**(`index.ts:1024`).
루프 안에서 **재대입하면** 루프 뒤의 iOS 발송과 `push_log` 가 **마지막 구독자의 개인 문구로 오염된다.**
→ 루프 안에서는 **지역 변수**로 만든다. 함수 스코프 `title`/`body` 는 건드리지 않는다.

**③ `b.only` 가 빈 배열일 때의 뜻을 정한다.**
`b.only && b.only.length` 로 쓰는 순간 **모두가 암송을 마친 날 전 구독자에게 저녁 알림이 나간다.**
→ `Array.isArray(b.only)` 면 **빈 배열도 「아무에게도」** 로 본다.

**④ 개인 문구 계산을 inner try 바깥에 두지 않는다.**
`b.userBodies` 가 없는 기존 호출에서 TypeError 가 나면 `sendPush` 가 통째로 빠져나가
**일부만 발송된 채 `push_log` 한 줄도 안 남는다.** → 옵셔널 접근(`?.`)으로 감싼다.

**⑤ `user_id` 를 select 에 더해도 응답·로그 어디에도 실리는 길이 없다** — 확인했다.
그래도 ⚠️ CLAUDE.md 보안 절대로 **응답에 절대 싣지 않는다**(`diag` 모드 포함).

### 확인하는 법

⚠️ **이 변경을 지켜 주는 자동 검사가 하나도 없다.** `tools/preflight.py:31` 은 `app.js`·`sw.js`·`js/*.js` 만
`node --check` 하고 **`supabase/functions/api/index.ts` 는 아예 안 본다.** `tests/widget-parity.py` 는
`latestVerse` 를 안 부른다. 회귀는 성도님 폰에서 처음 드러난다.

→ 개발 프로젝트에 올려 `sendPush`(`diag:true` + `user_id` 지정)와 `weeklyReport`(`send:false`)를 한 번씩
   불러 본문을 눈으로 본다. 그다음 운영에 올리고 **다음 날 아침 크론이 그대로 도는지 하루 지켜본다.**

---

## 2판 — `eveningPush` 액션

### 하는 일

```
1. 오늘(KST) = kstDay(now)                       ⚠️ ymd() 는 UTC 다. kstDay(index.ts:121) 를 쓸 것
2. daily_activity where day = 오늘  →  활동한 user_id 집합 A
3. 구독자 = push_subscriptions ∪ ios_push_tokens  (evening = true 인 것만)
4. 대상 = 구독자 − A                              (사람 단위로 먼저 정한다 — 아래 ⚠️)
5. 밀린 복습 = reviews ⨝ verses(is_active, track='weekly') where due_at <= 오늘
                → user_id 별 개수 map R
6. 사람마다 문구:
     R[u] >= 1 → 「🔁 복습이 기다려요」 / 「외운 말씀 N구절 다시 만나 보실래요?」   N = min(R[u], 3)
     R[u] = 0  → 「📖 오늘의 말씀」       / 이번주 말씀 한 줄
7. sendPush({ pw, only: 대상, userBodies: 문구맵, mode: "evening",
               url: "https://gocheok.onlybible.kr/?from=push&pe=1" })
8. push_log 에 mode='evening' 한 줄 — 대상이 0명인 날에도 남긴다
```

### ⚠️ 「밀린 복습」이 앱과 다르다 — 이 설계의 가장 큰 함정

`reviews.due_at <= 오늘` 은 앱이 말하는 「복습할 것」과 **같은 집합이 아니다.**

`dueReviewNos()`(app.js 의 `dueReviewNos()`)는 ① **시편 번호(>1000)를 지우고** ② 지금 `verses` 에 없는 `no`
(= `is_active` 아니거나 `track≠'weekly'`)를 빼고 ③ **그다음에** 3개로 자른다. 서버 표에는 그 필터가 없다.
`supabase/review_metrics.sql:34-35` 가 이미 이 갈라짐을 경고해 두었다.

**시편 예약은 옛 찌꺼기가 아니라 지금도 매일 새로 생긴다.**
2026-09-13 의 「시편은 복습 대상 아님」 결정이 app.js 의 `dueReviewNos()`(시편 제외) 한쪽에만 들어갔고,
서버 `saveProgress`(`index.ts:2188-2194`)와 `login`(`index.ts:2077-2080`)은 **`track` 을 안 보고**
3단계 구절마다 `reviews` 를 깐다. 앱은 시편을 복습하지 않으니 `advanceReview` 가 영영 안 불려
**영구 밀림**이 된다. `reviews` 에서 지워도 다음 로그인에 되살아난다.

> 고치지 않으면 — **주간 복습이 하나도 안 밀린 분께 매일 밤 「🔁 복습이 기다려요」가 가고,
> 눌러 들어가면 첫 화면에 복습 단추가 없다**(app.js 첫 화면의 복습 단추 분기(`dueCount > 0`) 의 분기는 `dueCount > 0` 하나뿐).
> 성도님께 사실이 아닌 말을 하는 것이다.

→ **최소 수리(이 판)** · `eveningPush` 질의를 `verses(is_active, track='weekly')` 로 조인해 좁힌다.
→ **근본 수리(별도 과제)** · `index.ts:2188-2194`·`2077-2080` 에 시편 제외를 넣어 오염을 멈춘다
   (함수 먼저, 표 정리는 그다음).

### ⚠️ 그 밖에 반드시 지킬 것

- **`latest` 를 절대 안 넘긴다.** `sendPush:1025-1029` 의 `if (b.latest)` 가 `dailyPushContent()` 로
  제목·본문을 **덮어쓴다**(`🌿 오늘의 묵상 …`). 켜는 순간 저녁 8시에 **아침과 똑같은 묵상 알림**이 한 번 더 나가고,
  `push_log` 의 title 도 아침 행과 구분이 안 된다. 말씀 한 줄이 필요하면 `eveningPush` 안에서
  `latestVerse()` 를 직접 불러 `userBodies` 를 만든다.
- **`adminError(b)` 필수.** 크론용 공개 키가 `push_cron_hourly.sql:14` 에 그대로 적혀 있고
  함수는 `--no-verify-jwt` 다. 막지 않으면 **누구나 전 구독자에게 무제한으로 알림을 쏠 수 있다.**
- **1000행 벽.** PostgREST 는 1000행까지만 준다(`index.ts:2259` 가 그 함정을 적어 두었다).
  밀린 복습이 이미 **2,383행**이다. 구독자 34명으로 좁히면 보통 안 걸리지만
  **시편 오염이 한 사람당 최대 180행**이라 몇 분만 쌓이면 조용히 넘긴다.
  → `track='weekly'` 조인으로 걷어내는 것이 먼저이고, 그래도 `fetchAllRows`(`index.ts:2264`)를 쓴다.
- **문구에서 「만」과 부정 전제를 뺀다.** 첫 화면은 app.js 첫 화면의 복습 단추 분기(`dueCount > 0`) 주석대로 **일부러**
  「오늘/만」을 피했다 — 3구절은 상한이 아니라 묶음이고, 다 하면 app.js 의 「3구절 더 하기」 이 곧장
  「3구절 더 하기」를 내민다. 알림의 「N구절**만**」은 그 결정을 되돌리는 표현이다.
- **사람 단위로 먼저 정한다.** 구독 행 47 ≠ 사람 34 — 웹과 아이폰을 둘 다 켜신 분은
  대상·문구를 기기 단위로 정하면 **개인화된 저녁 문구를 두 번** 받는다.
- **딥링크가 없다.** `app.js` 의 파라미터 처리(222-350)에 복습으로 가는 길이 없고,
  `sw.js:34-50` 은 이미 열린 창이면 focus 만 하고 주소를 안 바꾼다. 지금은 홈으로 보낸다 —
  첫 화면 맨 위가 복습 단추다. 딥링크는 별도 과제.

### ⚠️ 계측이 오염된다 — `?pe=1` 로 가른다

`sw.js:37-40` 이 `from=push` 를 붙이고 app.js 의 `readPushMark()` 와 서비스워커 message 리스너 이 **언제나** `logFeature("push", 0)` 을 부른다.
app.js `readPushMark()` 의 머리 주석이 「item 은 0 이다 … 어느 구절 알림이 먹혔나는 **day 로 역산한다**」고 적어 두었다.

하루에 발송이 둘이 되는 순간 그 역산이 깨진다 — 아침·저녁 클릭이 같은 한 칸에 섞여
**저녁 알림이 먹혔는지 영영 못 재고**, 아침 클릭률이 부풀어 보인다.
(카드 모드 쓰임을 여덟 달 못 잰 것과 같은 실패 모양이다 — `docs/notes/metrics.md`.)

→ 저녁 발송 url 에 `&pe=1` 을 달고, `readPushMark` 가 그것을 보아 `logFeature("push", 1)` 로 가른다.
   서버 `FEATURES` 는 이미 `push` 를 갖고 있어 추가가 없다. app.js `readPushMark()` 의 머리 주석도 그 자리에서 함께 고친다.

---

## 3판 — 크론

`supabase/push_evening_cron.sql` (새 파일) — 꼴·비번 취급은 `push_cron_hourly.sql` 을 그대로 베낀다.

```sql
select cron.schedule('evening-push', '0 11 * * *', $$   -- KST 20:00
  select net.http_post(
    url := 'https://xnomlgydifiqiybervtf.supabase.co/functions/v1/api',
    headers := jsonb_build_object('Content-Type','application/json',
      'apikey','sb_publishable_…', 'Authorization','Bearer sb_publishable_…'),
    body := jsonb_build_object('action','eveningPush','pw','YOUR_ADMIN_SECRET')
  ); $$);
-- 되돌리기:  select cron.unschedule('evening-push');
```

⚠️ **저장소가 공개다** — `pw` 는 `YOUR_ADMIN_SECRET` 자리표시자로 커밋하고, 실제 값으로 바꾼 것을
   **절대 커밋하지 않는다**(세 크론 파일이 모두 같은 관례다).

⚠️ **개발에는 걸지 않는다.** 개발에는 pg_cron 을 일부러 안 켜 두었고(`supabase/dev-setup.md:106`),
   크론 파일들은 **url 에 운영 ref 를 하드코딩**한다 — 개발에 거는 순간 성도님이 저녁 알림을 두 번 받는다.
   개발엔 `VAPID_*` 도 없어 **끝까지 검증할 수 없다.** 2판의 리허설이 그 자리를 대신한다.

⚠️ **크론을 함수보다 먼저 걸지 않는다.** `default: unknown action` 400 이 나는데
   **pg_net 은 응답 코드를 안 보므로 cron 기록은 `succeeded` 로 뜬다** —
   「잘 도는 것처럼 보이는데 아무것도 안 나간」 상태가 된다.

### ⚠️ `monitor` — 아침 패턴을 그대로 베끼면 **매일 100% 헛경보**

`monitor.yml:4` 은 `12 22 * * *` = **07:12 KST** 에 돈다. 아침 점검(`index.ts:1151-1160`)은
`.eq("mode","daily").gte("sent_at", 오늘 KST 자정)` 을 본다. 같은 꼴로 `mode='evening'` 을 찾으면
**오늘 저녁(20:00)은 아직 오지 않았으므로 늘 0건**이고, `monitor.yml` 끝이 `exit 1` 이라 매일 빨간 X 가 된다.

이레만 지나면 경보 피로로 **진짜 장애(아침 알림 중단)도 아무도 안 본다.**
이 저장소는 이미 같은 이유로 헛경보를 두 번 겪고 주석을 남겼다(`index.ts:1204-1207`·`1133-1137`).

→ 창을 **어제 하루(KST)** 로 잡는다 — `sent_at >= 어제0시KST AND sent_at < 오늘0시KST`.
  **행이 하나라도 있으면 통과.** 「발송 0건」은 아침과 같은 규칙(`total>0 && sent===0`)일 때만 문제로 올린다.
  ⚠️ **대상 0명인 밤은 장애가 아니라 모두가 참여한 가장 좋은 날이다** — `index.ts:1085` 의 `ok: sent > 0` 을
  그대로 믿으면 거꾸로 된 신호가 된다. 그래서 2판에서 **대상 0명이어도 로그 한 줄을 남긴다.**
  시작일 가드(`EVENING_SINCE`)를 두어 켠 첫날 헛경보도 막는다.

---

## 4판 — 완료 창의 알림 초대

### ⚠️ 이 판은 **b3598f5 가 먼저 나간 뒤에** 시작한다

안 푸시된 커밋 **b3598f5 「첫날 둘째 구절까지 — 완료 창의 「다음」을 고친다」** 가
**같은 `showStageDoneModal` 의 주 단추**를 고치는 중이다. 둘 다 어제 같은 분석에서 나왔다(1순위·3순위).

두 설계가 같은 주에 나가면 3단계+`wasFirst` 창에 누를 것이 **여섯**이 된다
(FIRST_DONE 두 줄 · heartCheck · 주 단추 · `sd-again` · `sd-list` · 🔔 초대).
`.cheer-overlay` 에는 `overflow` 가 없어(style.css 의 `.cheer-overlay`) 작은 폰에서 아래가 잘린다.

→ **b3598f5 를 먼저 내보내고 실제 화면을 확인한 뒤** 얹는다. 두 문서에 서로 링크를 적어 둔다.

### 무엇을 내나

`showStageDoneModal` 의 `stage >= 3 && wasFirst` 자리에 단추 하나.

| 상태 | 단추 |
|---|---|
| 이미 구독 중 · 네이티브 iOS 앱 · `Notification.permission === 'denied'` | **안 냄** |
| 켤 수 있음 | 「🔔 말씀 알림 받기」 → `enablePush()` |
| **아이폰 사파리(미설치)** | 「📱 홈 화면에 담고 알림 받기」 → `renderInstallGuide()` |
| 그 밖의 미지원 | **안 냄** |

> ⚠️ 문구는 「내일 아침에도」가 아니라 **「말씀 알림 받기」** — 0판에서 아침·저녁 둘 다가 되었기 때문이다.

### 이미 있는 것 (새로 만들지 말 것)

| 필요한 것 | 이미 있는 것 |
|---|---|
| 설치 안내 창 | **`renderInstallGuide()`, 인자 없음** (app.js 의 `renderInstallGuide()`) |
| standalone 판별 | **`manualInstalled()`** (app.js 의 `manualInstalled()`) |
| 권한 읽기 | `(window.Notification && Notification.permission) \|\| "default"` (app.js 에서 `Notification.permission` 을 읽는 두 자리) |
| 구독 확인 IIFE | app.js `renderSummary` 안의 구독 확인 IIFE (⚠️ 자리를 옮겨야 한다 — 아래) |
| 기록 | `logFeature(feature, item)` (app.js 의 `logFeature()`) |

### ⚠️ 손대기 전 반드시 볼 것 — 여덟

**① `wasFirst` 는 「첫 구절 완주」가 아니다.**
`doneVerseCount()`(app.js 의 `doneVerseCount()`)가 `getPassedStage` 를 **lang 없이** 부른다 — 지금 켜 둔 언어 토글이
키를 가른다(app.js 의 언어 토글(`getPassedStage` 키)·`5509`). 한글 20구절을 마친 고참이 영어로 바꾸면 `wasFirst === true` 가 되어
「첫 말씀」 축하와 초대가 함께 뜨고, 반대로 진짜 영어 초보는 영영 못 받는다.
→ `doneVerseCount()` 를 **언어 무관**으로 세거나, 초대 조건을 `wasFirst` 가 아닌 별도 함수로 뗀다.

**② 기존 성도님은 초대를 평생 못 본다.** 전원 `doneVerseCount() > 0` 이다.
→ **B(저녁 알림)의 대상과 C(구독 권유)의 대상이 정반대다.** C 는 **새로 오시는 분**을 위한 장치다.
   이미 계신 88% 께 닿으려면 별도 자리가 필요하다(별도 과제 — 예: 복습 3구절을 마친 뒤).

**③ 「반복해서 쓰기」를 켜 두신 분은 한 번도 안 묻고 끝난다.**
`saveProgress`(app.js `checkAllComplete` 의 `saveProgress`)가 `isRepeatPractice()` 이탈(`6394`)보다 **먼저**라 창이 안 뜬 채 `wasFirst` 가 소모된다.

**④ 창의 캡처 keydown 이 새 단추를 삼킨다.**
app.js `showStageDoneModal` 의 캡처 `keydown` 이 Enter/Space 를 가로채 주 단추를 누른다(체크박스만 면제).
**새 단추를 Enter/Space 로 누를 수 없다** — 기존 `sd-challenge` 도 같은 상태다.
→ `e.target` 이 창 안의 단추면 면제하도록 넓힌다.

**⑤ 설치 안내 창이 완료 창 **뒤에** 깔린다.**
`.iw-wrap` z-index **90**(style.css 의 `.iw-wrap`) < `.cheer-overlay` z-index **1000**(style.css 의 `.cheer-overlay`).
눌러도 화면이 그대로인데 로그에는 '눌림'이 정상으로 찍혀 **전환율만 0%** 가 된다.
→ 완료 창을 닫고 열거나 `.iw-wrap` z-index 를 올린다.

**⑥ `Notification` 을 맨 이름으로 읽으면 완료 창이 통째로 안 뜬다.**
아이폰 사파리(미설치)에서 ReferenceError 가 난다. app.js 에서 `Notification.permission` 을 읽는
기존 두 자리처럼 `window.Notification &&` 로 감쌀 것.

**⑦ 아이폰 사파리 미설치 = `js/push.js:78-79` 가 말하는 「미지원」과 같은 조건이다.**
「미지원 → 안 냄」을 **먼저** 검사하면 정작 설치 안내를 드려야 할 자리에서 초대가 아예 안 뜬다.
→ 순서를 **아이폰 사파리 먼저, 미지원 나중**으로.

**⑧ `enablePush()` 를 창 닫기 전에 부르면 Enter 한 번에 다음 구절로 넘어간다**(캡처 리스너 `4901`).
`docs/notes/memorize-flow.md:13` 이 이미 적어 둔 사고다. 그렇다고 `alarmFromHome()` 을 쓰면
성공 직후 `renderSummary()`(app.js `alarmFromHome()` 의 `renderSummary()`)로 **홈에 튕긴다.** 둘 다 드롭인이 아니다.
→ 전용 경로를 만든다. `go(fn)` 의 **setTimeout 금지 규칙은 권한 창에도 그대로 유효하다**
  (활성화 소실 → 사파리 `NotAllowedError` → 「알림 설정에 실패했습니다」라는 **거짓 메시지**).

### 구독 캐시를 어디에 두나

⚠️ **`renderSummary` 에 두면 안 된다.** 기존 확인 IIFE(app.js `renderSummary` 안의 구독 확인 IIFE)가 거기 있지만,
`?v=` 딥링크는 `renderSummary` 를 건너뛰고 `startTest` 로 직행하며(`routeAfterLoad:150`) **로그인도 없다.**
캐시 `undefined` 를 「미구독」으로 읽으면 이미 켜신 분께 초대가 뜨고, 눌러도 「먼저 로그인」만 나온다.

→ **`routeAfterLoad` 맨 앞**(app.js `routeAfterLoad()` 맨 앞 `readPushMark` 옆)에 심는다.
→ 비로그인 딥링크 방문자에게는 **초대를 아예 안 낸다**(`enablePush` 가 「먼저 로그인」으로 막고
  `logFeature` 도 기록을 건너뛴다 — 막다른 길 + 분모 누락).

### 한 번만 묻기

`localStorage["push-invite-asked"]` — 저장소 grep 0건, 충돌 없다.

⚠️ **눌렀거나 명시적으로 닫았을 때만 쓴다.** 바깥 탭·Escape 로 닫힌 경우는 다음 기회를 남긴다
(app.js `showStageDoneModal` 의 `close()`·`4922` 가 그냥 닫히게 돼 있다). `wasFirst` 는 일생에 한 번이라 **표식이 소모되면 못 되돌린다.**
`clearPersonalData`(app.js 의 `clearPersonalData()`)에 넣을지 정하고 주석을 남긴다.

### 계측

`logFeature("push-invite", 0)` = 냄 · `logFeature("push-invite", 1)` = 눌림.

- ✅ **60초 억제가 둘을 안 막는다** — 키가 `feature + ":" + (item||0)` 라 `push-invite:0` ≠ `push-invite:1`.
- ✅ **허용 목록은 서버 `FEATURES` Set 한 곳뿐**이다. `feature_log.feature` 에 **DB CHECK 은 일부러 안 걸었다**
  (`supabase/feature_log.sql:20-22` 가 그 결정과 까닭 — `challenge_log.mode` 사고 — 을 적어 두었다).
- ⚠️ `feature_log.sql` 머리 주석(37-40)이 **「feature 를 늘리면 이 주석도 함께 고친다」**고 명령한다.

⚠️ **초대를 눌러 알림을 켜면 그 즉시 예고 없는 시스템 배너가 한 번 더 뜬다** —
`js/push.js:114` 가 `api.testPush(…, true)` 로 오늘의 묵상을 그 자리에서 발송한다.
첫 구절을 막 끝낸 분이 축하 창 위에서 누르면 ① `appAlert` ② 몇 초 뒤 시스템 배너가 겹친다.
→ `enablePush` 에 인자 하나(`{preview:false}`)를 두거나 성공 안내를 완료 흐름에 맞게 따로 준다.

---

## 배포 순서와 ⚠️ 저장소 상태

**서버가 먼저다.** 프런트가 `push-invite` 를 보내는데 서버 `FEATURES` 에 없으면 조용히 버려진다.

각 판 안에서 — ① Edge Function **개발**(`ktpwthwqzgcqcrmsafdo`) → localhost 확인
② Edge Function **운영**(`xnomlgydifiqiybervtf`) ③ SQL(개발 → 운영) ④ `app.js` → `python tools/bump.py` → 푸시.

### ⚠️ 지금 작업 트리에 다른 세션이 일하고 있다 (2026-09-23 기준)

`CLAUDE.md` · `admin.html` · **`app.js`** · `style.css` · **`supabase/functions/api/index.ts`** ·
`docs/notes/*` · `supabase/feature_log.sql` · `tests/feature-log-smoke.sh` · `tools/screen-sweep.py` 등 13개.

- **`index.ts` 의 커밋 안 된 헝크가 하필 `FEATURES` Set(1393-1403)** 이다 — `meditation-widget` 을 더하는 중.
  **`supabase functions deploy` 를 누르면 그것이 운영에 함께 나간다**(CLAUDE.md 「배포는 git 이 아니라
  작업 트리를 올린다」). 배포 직전에 `git diff HEAD -- supabase/functions/api/index.ts` 를 **다시** 본다.
- **`bump.py` 는 `admin.html` 도 함께 고치는데 지금 그 파일에 남의 변경이 있다** — 같은 줄이라
  `git apply --cached` 로도 못 가른다. 친구가 그 헝크를 먼저 커밋하도록 한다.
- 커밋은 ⚠️ **`git add -A` 금지** · 공용 파일은 `git apply --cached` 로 내 헝크만 담고 **경로 없이** 커밋 ·
  커밋 뒤 `git show --stat` 으로 확인(MEMORY 「커밋에 경로를 못 박기」).

---

## 재는 법

| 무엇 | 어디 |
|---|---|
| 저녁 발송량 | `push_log where mode='evening'` |
| 저녁 알림 누름 | `feature_log where feature='push' and item=1` (아침은 `item=0`) |
| 초대 승낙률 | `feature_log feature='push-invite'` — `item=0` 본 사람 / `item=1` 누른 사람 |
| 구독 증가 | `push_subscriptions.created_at` 전후 |
| 저녁 해지 | `evening=false` 로 바꾼 수 — ⚠️ **이것이 20:00 판단의 시금석이다** |

2주 뒤 볼 것 — 해지율이 눈에 띄면 **21:00 으로 늦춘다.**

---

## 되돌리기

| 쉬운 것 | 되돌릴 수 없는 것 |
|---|---|
| 크론 — `cron.unschedule('evening-push')` 한 줄 | **이미 나간 알림** |
| Edge Function — 이전 판 재배포 (⚠️ 통째 배포라 남의 커밋도 함께 되돌아간다) | **성도님이 끈 구독** — 서버 행을 지운다 |
| `app.js` — bump 후 재푸시 | **`push-invite-asked` 표식** — `wasFirst` 는 일생에 한 번 |
| `evening` 토글을 전원 false 로 | 브라우저·안드로이드 시스템 수준 차단 |

되돌리기가 어려운 것이 전부 **사람 쪽**에 있다. 그래서 되돌릴 수 있는 판을 먼저, 사람에게 닿는 판을 뒤로 둔다.

---

## 이 설계에서 **일부러 뺀 것**

| 무엇 | 왜 |
|---|---|
| `latestVerse` → `weeklyVerseKst` 교체 | **고칠 버그가 없다.** 오히려 날짜 없는 구절을 전체 발송하게 된다 |
| 복습 딥링크(`?go=review`) | 지금 길이 없다. 홈 첫 단추가 복습이라 한 번 더 누르면 된다. 별도 과제 |
| 이미 계신 88% 께 구독 권하기 | C 는 구조상 **새로 오시는 분** 전용이다. 별도 자리가 필요하다 |
| 시간대별 저녁 선택 | 아침처럼 네 갈래를 주면 크론이 여덟이 된다. 20:00 하나로 시작한다 |

## 이어서 할 별도 과제

1. **`reviews` 시편 오염 멈추기** — `index.ts:2188-2194`·`2077-2080` 에 `track` 검사.
   (함수 먼저 → 표 정리. 이걸 고쳐야 저녁 문구가 오래 참이 된다)
2. **`weeklyVersePush` skip 을 `!v || !v.date` 로** + 관리자 폼 날짜 **필수** + `saveVerse` KST 자정 정규화
3. **`member_merge.sql` 에 `ios_push_tokens` 가 없다** — 계정을 합치면 그분의 아이폰 알림 구독이
   cascade 로 말없이 사라진다. 모수가 14라 한 분만 합쳐도 7%다
4. **이미 계신 88% 께 구독 권하는 자리**
5. **복습 딥링크**

---

## 검증 기록

이 설계는 2026-09-23 에 여덟 에이전트(일곱 갈래 + 완결성 비평)가 코드에 대고 적대적으로 검증했다.
`latestVerse`/`weeklyVerseKst` 는 2,232시간 시뮬레이션으로 대조했다.
위 ⚠️ 표시는 전부 **그 검증에서 나온 실제 자리**이고, 파일:줄이 붙은 것은 그때 확인한 값이다.
