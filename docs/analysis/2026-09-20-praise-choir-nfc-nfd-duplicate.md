# 찬양 아카이브 — 찬양대 이름이 콤보에 두 개씩 뜨는 이유 (한글 유니코드 NFC/NFD 혼재)

> **한 줄 결론.** 같은 「시온찬양대」가 DB 에 **두 가지 유니코드 표기**로 들어가 있다.
> 하나는 완성형(NFC, `시`=1글자), 다른 하나는 자모분리(NFD, `ㅅ`+`ㅣ` 2글자).
> 눈에는 똑같이 보이지만 **문자열로는 다른 값**이라 목록을 만드는 `Map` 이 둘을 따로 센다.
> 2026-07-12 이후 등록된 **48곡**이 자모분리 쪽이고, 이 곡들은 **성도님 앱에서 찬양대 필터·검색으로 안 걸린다.**
> 작성 2026-09-20 · 대상 저장소: `bible-memorize-church-app-v2`(관리자 화면) · `praise-songs`(성도님 앱·서버)

## 1. 배경 — 왜 이걸 봤나

사용자 질문 그대로:

> "https://gocheok.onlybible.kr/admin-praise.html 에서 찬양대가 두개씩 뜨는 이유는 ?"

관리자 화면 「콤보 표시 순서 (구분 · 찬양대/팀)」의 오른쪽 목록에
`할렐루야찬양대`·`임마누엘찬양대`·`시온찬양대`·`가브리엘찬양대` 가 각각 연달아 두 번씩 나온다.
왼쪽 「구분」 목록(찬양대·찬양팀·중창단·특별찬양)은 멀쩡하다.

## 2. 전제와 범위

**용어부터.** 이 문서에서 「찬양 아카이브」는 worship.onlybible.kr(저장소 `praise-songs`) 이고,
관리 화면만 성경암송 저장소(`bible-memorize-church-app-v2`)의 `admin-praise.html` 에 얹혀 있다.
둘은 **같은 Supabase 프로젝트 `xnomlgydifiqiybervtf` 의 `songs` 표**를 본다.

- **본 것** — 공개 API `getSongs` 로 내려받은 운영 데이터 전량(1,705곡), 관리자 화면의 목록 생성 코드,
  성도님 앱의 콤보·필터·검색 코드, Edge Function `praise` 의 저장 경로.
- **안 본 것** — 유튜브 영상 제목을 누가 어떤 기기로 붙여 넣는지는 **확인하지 못했다**(5번 참고).
  숨김 곡(`hidden`)은 공개 API 가 안 내려주므로 48곡 안에 더 있을 수 있다.
- **환경** — 조회는 공개 키(읽기 전용)만 썼다. **DB 를 고치지 않았다.**

## 3. 분석

### 3.1 목록을 만드는 코드는 「문자열 그대로」를 열쇠로 쓴다

`admin-praise.html:271-281` (`buildOrderLists`):

```js
const catMap = new Map(), choirMap = new Map();
LIST.forEach((s) => {
  ...
  if (s.choir) { const o = s.choir_ordering ?? 9999; const c = choirMap.get(s.choir); ... }
});
```

`choirMap` 의 열쇠는 `s.choir` **원본 문자열**이다.
글자가 달라 보이지 않아도 코드포인트가 다르면 `Map` 은 **다른 열쇠**로 취급한다.
곧 목록에 두 줄이 생긴다 — 이게 화면에 보이는 그대로다.

### 3.2 실제로 두 가지 표기가 섞여 있다

운영 데이터를 직접 내려받아 이름별로 묶었다.

```bash
curl -s -X POST "https://xnomlgydifiqiybervtf.supabase.co/functions/v1/praise" \
  -H "apikey: <공개키>" -H "Authorization: Bearer <공개키>" \
  -H "Content-Type: application/json" -d '{"action":"getSongs"}'
```

`unicodedata.normalize("NFC", name)` 으로 정규화해 같아지는 것끼리 묶은 결과:

| 보이는 이름 | 표기 | 문자 길이 | 곡 수 | `choir_ordering` |
|---|---|---|---|---|
| 할렐루야찬양대 | NFC(완성형) | 7 | 167 | 1 |
| 할렐루야찬양대 | **NFD(자모분리)** | **18** | 12 | 2 |
| 임마누엘찬양대 | NFC | 7 | 456 | 3 |
| 임마누엘찬양대 | **NFD** | **18** | 12 | 4 |
| 시온찬양대 | NFC | 5 | 453 | 5 |
| 시온찬양대 | **NFD** | **13** | 12 | 6 |
| 가브리엘찬양대 | NFC | 7 | 425 | 7 |
| 가브리엘찬양대 | **NFD** | **17** | 11 | 8 |

「시온찬양대」가 NFC 에선 5글자, NFD 에선 13글자다.
`시` 하나가 `ㅅ`(U+1109) + `ㅣ`(U+1175) 두 코드포인트로 쪼개져 있기 때문이다.
**표기법만 다르고 화면에는 완전히 똑같이 그려진다** — 그래서 눈으로는 절대 못 찾는다.

`choir_ordering` 이 1~8 로 깔끔히 매겨진 것은, 이미 중복된 상태의 목록에서
「찬양대 순서 저장」을 누른 적이 있다는 뜻이다(`saveOrder` 가 화면 순서대로 1부터 다시 매긴다).

### 3.3 언제부터인가 — 2026-07-12 부터 매주

자모분리 이름을 쓰는 곡 **48곡**의 등록일:

```
2026-07-12  5곡     2026-08-16  4곡
2026-07-19  4곡     2026-08-23  3곡
2026-07-26  4곡     2026-08-26  1곡
2026-08-02  3곡     2026-08-31  4곡
2026-08-08  1곡     2026-09-06  4곡
2026-08-09  4곡     2026-09-16  6곡
                    2026-09-20  5곡
```

주일마다 네 찬양대 몫이 꼬박꼬박 들어온다. **일회성 사고가 아니라 지금도 계속 들어오는 중**이다.
그리고 이 48곡은 **곡 제목(`song`)도 전부 자모분리**다(48/48). 반대로 `category` 는 48곡 모두 멀쩡하다.

이 비대칭이 유입 경로를 가리킨다 — `admin-praise.html:129-132` 에서
`category` 는 `<select>` 고정 목록(`praise-config.js` 의 `CATEGORIES`, 코드에 박힌 완성형)에서 고르지만,
`song` 은 유튜브에서 받아온 제목(`admin-praise.html:218` `$("f-song").value = m.song`)이고
`choir` 는 사람이 입력칸에 넣는 값(`admin-praise.html:238`)이다.
**제목과 찬양대 이름만 오염됐다는 것은, 둘 다 「바깥에서 들어온 글자」라는 뜻**이다.

자모분리 표기는 **macOS 가 파일 이름·클립보드에서 쓰는 방식**이다.
7월 중순부터 영상 제목을 만들거나 붙여 넣는 경로에 맥이 끼어든 것으로 **추정**된다(5번 참고).

### 3.4 ★ 화면만의 문제가 아니다 — 성도님 앱에서 48곡이 사라진다

성도님 앱 `praise-songs/app.js` 도 같은 방식이다.

```js
// app.js:147-154  찬양대 콤보
function choirOptions() {
  const m = new Map();
  ALL.forEach((s) => { ... if (s.choir && !m.has(s.choir)) m.set(s.choir, s.choirOrder); });
```

```js
// app.js:172  필터
if (state.choir !== "전체" && s.choir !== state.choir) return false;
```

```js
// app.js:175-176  검색
const ok = cho ? toCho(s.song).includes(q.replace(/\s/g, ""))
               : s.song.toLowerCase().includes(q.toLowerCase());
```

세 곳이 전부 **정확한 문자열 일치**다. 결과:

1. **콤보에도 「시온찬양대」가 두 번 뜬다** — 성도님 화면도 관리자 화면과 똑같다.
2. **위쪽(완성형) 「시온찬양대」를 고르면 7월 중순 이후 최신 12곡이 안 나온다.**
   하필 **빠지는 쪽이 최신곡**이라 "요즘 곡이 안 올라왔네" 로 오해하기 딱 좋다.
3. **검색도 안 걸린다.** 성도님이 윈도/안드로이드/아이폰 자판으로 친 글자는 완성형이라
   자모분리 제목과 `includes` 가 맞지 않는다. 초성 검색(`toCho`)도 완성형 코드포인트를
   전제로 초성을 뽑으므로 마찬가지로 실패한다.

### 3.5 서버도 이 차이를 못 넘는다

`praise-songs/supabase/functions/praise/index.ts:128-132` — 새 곡을 저장할 때
같은 찬양대의 기존 순번을 물려받는 부분:

```ts
if (choirOrd == null && s.choir) {
  const { data } = await db.from("songs").select("choir_ordering")
    .eq("choir", s.choir).not("choir_ordering", "is", null).limit(1);
```

`.eq("choir", ...)` 역시 정확 일치라, 자모분리 이름으로 들어온 곡은 기존 순번을 **못 물려받는다.**
정규화하는 자리는 서버 어디에도 없다(`saveSong` 116~152행, `importSongs` 160~189행 모두).

## 4. 결론

- **원인** = 한글을 담는 두 가지 유니코드 표기(NFC 완성형 / NFD 자모분리)가 `songs.choir`·`songs.song` 에 섞였다.
  화면 코드는 문자열을 **정규화 없이** 열쇠·비교값으로 써서 둘을 다른 이름으로 본다.
- **범위** = 찬양대 4곳 × 각 11~12곡 = **48곡**(공개분 기준). 2026-07-12 이후 매주 유입 중.
- **영향** = 관리자 콤보 중복은 겉보기 증상이고, 실제 피해는 **성도님 앱에서 최신 48곡이
  찬양대 필터·검색에 안 잡히는 것**이다.

### 고치는 곳은 세 겹

| 겹 | 무엇 | 파일 |
|---|---|---|
| ① 이미 들어간 데이터 | `choir`·`song` 을 NFC 로 일괄 정규화 | 운영 DB SQL (아래) |
| ② 새로 들어오는 것 | 저장 직전에 NFC 로 맞춘다 | `praise-songs/supabase/functions/praise/index.ts` — `saveSong`(118행 부근)·`importSongs`(164행 부근) |
| ③ 화면 방어 | 목록·필터·검색에서 정규화한 값으로 비교 | `admin-praise.html:271` · `praise-songs/app.js:147,172,175` |

①만 해도 증상은 사라지지만 **다음 주일에 다시 생긴다.** ②가 진짜 수리다.
③은 과거 데이터가 또 들어올 때를 위한 안전망이다.

**① 에 쓸 SQL**(개발 → 운영 순서, 운영은 되돌릴 수 없으므로 개발에서 먼저 돌릴 것):

```sql
-- 몇 행이 바뀔지 먼저 본다
select count(*) from songs where song <> normalize(song, NFC) or choir <> normalize(choir, NFC);

-- 정규화
update songs
   set song  = normalize(song,  NFC),
       choir = normalize(choir, NFC)
 where song <> normalize(song, NFC) or choir <> normalize(choir, NFC);

-- 합쳐진 뒤 순번은 관리자 화면에서 「찬양대 순서 저장」을 한 번 눌러 1..N 으로 다시 매긴다
```

⚠ `normalize()` 는 PostgreSQL 13 이상 내장 함수다. Supabase 는 그보다 높지만 **실행 전에 확인할 것**.

## 4-1. 갱신 이력 — 조치 완료 (2026-09-20 같은 날)

세 겹을 모두 반영하고 운영 데이터로 확인했다.

| 겹 | 한 것 | 확인 |
|---|---|---|
| ② 새 유입 차단 | `praise/index.ts` 에 `nfc()` 헬퍼 — `ytFetch`·`saveSong`·`importSongs`·`setOrdering` | 함수 `praise` v17, 2026-09-20 20:03 배포 |
| ③ 화면 방어 | `app.js` 의 `norm()`, `admin-praise.html` 의 `loadList()` 에서 NFC | 라이브 파일에 표식 확인 |
| ① 기존 데이터 | `scripts/2026-09-20-normalize-nfc.sql` 실행 | 아래 |

배포 뒤 공개 `getSongs` 로 다시 받아 센 결과:

```
자모분리(NFD) 제목 0건 · 자모분리 찬양대 0건   (전 48건)
서로 다른 choir 문자열 19개 → 14개             (중복 없음)
시온찬양대 453곡 → 465곡
검색 「놓치지」 0곡 → 1곡
콤보 순서 변화 없음
```

⚠ 남은 것 하나 — 합쳐진 네 찬양대는 `choir_ordering` 이 아직 둘로 갈려 있다
(할렐루야 1·2, 임마누엘 3·4, 시온 5·6, 가브리엘 7·8).
**순서가 뒤집히지는 않지만**(확인함) 관리자 화면에서 「찬양대 순서 저장」을 한 번 누르면
1..14 로 깔끔히 다시 매겨진다.

## 5. ⚠ 불확실한 것 / 확인 필요

| 항목 | 왜 불확실한가 | 확인 방법 |
|---|---|---|
| 자모분리가 **어디서** 들어오나 | 유튜브 제목을 누가 어떤 기기로 만들고 붙여 넣는지 확인 못 했다. 맥(파인더·사파리 복사)이 가장 흔한 원인이지만 **추정**이다 | 7월 중순 이후 영상 업로드·제목 작성 담당자에게 기기를 묻는다. ②를 고치면 원인과 무관하게 막히긴 한다 |
| ~~숨김(`hidden`) 곡~~ | **해소** — SQL 은 `songs` 전체를 고치므로 숨김 곡도 함께 정규화됐다 | ④ 검산이 0 |
| ~~`normalize()` 가용~~ | **해소** — 운영은 PostgreSQL 17.6 이다 | 확인함 |
| 다른 표(재생 기록 등)에 이름이 복사돼 있는지 | `songs` 만 봤다 | `song_id` 로만 엮여 있으면 무관. 스키마 확인 |

## 6. 용어

| 용어 | 뜻 |
|---|---|
| NFC (완성형) | 한글 한 글자를 코드포인트 하나로 담는 방식. `시` = U+C2DC. 윈도·안드로이드·대부분의 웹이 쓴다 |
| NFD (자모분리) | 초성·중성·종성을 따로 담는 방식. `시` = U+1109 + U+1175. macOS 파일 이름·클립보드가 쓴다 |
| 정규화(normalize) | 두 표기를 한쪽으로 맞추는 것. JS `"시".normalize("NFC")`, SQL `normalize(col, NFC)` |
| 콤보 | 이 앱에서 구분·찬양대를 고르는 선택 목록 |
| `choir_ordering` | 콤보에서 찬양대를 늘어놓는 순번. 관리자 화면의 「찬양대 순서 저장」이 1부터 다시 매긴다 |

## 7. 출처

- 운영 데이터 — 공개 액션 `getSongs`(1,705곡, 2026-09-20 내려받음). 읽기 전용 공개 키 사용
- `bible-memorize-church-app-v2/admin-praise.html:129-132, 218, 238, 271-281, 296-306`
- `praise-songs/app.js:147-154, 172, 175-176`
- `praise-songs/supabase/functions/praise/index.ts:116-152(saveSong), 160-189(importSongs), 190-208(setOrdering)`
- `bible-memorize-church-app-v2/praise-config.js` — `CATEGORIES` 고정 목록
