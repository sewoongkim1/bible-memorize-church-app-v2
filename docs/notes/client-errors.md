# 화면 오류 모으기 (`client_errors` · 2026-10-12 · 문 닫힘)

> **언제 읽나:** 이 장치를 켜거나(문 열기) · 모으는 칸을 바꾸거나 · 오류 표를 볼 때.
> 지금 상태: 코드·SQL·api 는 **개발에만** 들어갔다. 운영 SQL·운영 api·개인정보 안내는 **아직** — 친구가 방침을 고칠지 정한 뒤.

## 왜
테스터가 친구 한 명뿐이라, 성도님 폰에서 나는 화면(JS) 오류를 아무도 모른다. 제보가 오기 전까지는 「아무 일 없다」로 보인다.

## 어떻게 생겼나
| 자리 | 무엇 |
|---|---|
| `app.js` 맨 위 「화면 오류 모으기 (여기부터)~(여기까지)」 | `window` 의 `error`·`unhandledrejection` → api `clientError`. 파일 맨 위라 app.js 가 위에서부터 도는 동안 난 오류도 받는다(app.js 자체의 문법 오류는 못 받는다 — preflight 의 `node --check` 가 막는다) |
| `supabase/functions/api/client-errors.ts` | 액션 `clientError` — 문 확인 → `cerrClean`(아는 칸만 · 다시 거름) → `v2_client_error` |
| `supabase/client_errors.sql` | 표 `client_errors` · 함수 `v2_client_error` · 90일 정리 cron · **머리에 보는 질의 셋** |
| `tests/client-errors.test.cjs` | preflight [3] — 나가는 몸의 칸 이름 · 심어 둔 개인 값이 안 실리나 · 문 · 잠금 |

### 모으는 것 (여섯 칸 + 날짜)
| 칸 | 예 | 어디서 |
|---|---|---|
| `build` | `20261012d` | `APP_BUILD` |
| `shell` | `web` · `play` · `ios` | 이미 있는 판정 — `isNativeApp()`(js/push.js) · `openedByPlayApp()` |
| `screen` | `renderTestScreen` | 오류 스택에서 처음 만나는 `render…` 함수 이름(앱에 「지금 화면」 변수가 없어서). 모르면 빈 칸 |
| `msg` | `TypeError: Cannot read properties of undefined (reading 'no')` | 오류 **첫 줄 200자** — 앱과 서버가 같은 규칙(`cerrScrub`)으로 두 번 거른다: 주소의 `?`·`#` 뒤 · 계정 번호(uuid) → `<id>` · 전자우편 → `<email>` · 네 자리 넘는 숫자(전화·확인 번호) → `<n>`. 약속 거절은 앞에 `(promise)` |
| `src` | `app.js:6612:15` · `js/duty.js:120:7` | 우리 주소의 경로:줄:칸만(`?v=` 뗌). 남의 주소(확장 프로그램 등)면 **아예 안 보낸다** |
| `browser` | `android-samsung` · `ios-safari` · `android-kakaotalk` | UA 에서 운영체제·브라우저 **계열만** |
| `day` | `2026-10-12` | 서버가 한국 날짜로 적는다 |

### 모으지 않는 것
`user_id` · 이름 · 소속 · 전체 스택 · 주소의 `?` 뒤(딥링크에 개인 값이 섞인다) · UA 원문 · 기기 토큰(`life-device` — 그래서 `supaCall` 을 안 쓰고 `fetch` 를 직접 쓴다) · IP(표에 칸이 없다 — Supabase 의 요청 기록에는 남지만 이 표와 잇지 않는다).
표에 `users` 를 가리키는 칸이 없으므로 **기록 합치기(`member_merge.sql`)와 상관없다.** ⚠️ 칸을 더하려면 아래 방침 문장부터 고치고 시험의 칸 목록을 함께.

### 줄이는 장치
- 같은 오류(판·화면·글·자리)는 **한 기기에서 하루 한 번**(`localStorage errlog-sent` · 30개까지 기억 · 저장소를 못 쓰면 그 실행 안에서만).
- **한 번 열 때 다섯 건까지.**
- 안 보내는 것: 통신 끊김(`Failed to fetch`·`Load failed` 등) · `Script error.`(교차 출처 — 내용이 비어 온다) · ResizeObserver 경고 · 그림·스크립트 못 받음(자원 오류) · 남의 스크립트.
- 서버: 같은 날 같은 오류는 **한 줄에 개수(`cnt`)만** 올린다 · 하루 **500줄**(서로 다른 오류)이 차면 새 줄은 버린다 · 한 줄의 개수는 1,000,000 에서 멈춘다. 공개 키만 있으면 누구나 부를 수 있는 액션이라 둔 한도다.
- 보관 **90일** — 매일 03:45 KST cron(`client-errors-purge`) + 새 줄을 넣을 때 함수가 한 번 더(cron 없는 개발 DB 에서도).

## 문 — `app_config.errorLogOn`
- **`true` 하나일 때만 열림.** 없음·`false`·글자 `"true"`·`1` 은 닫힘. 화면은 캐시(`localStorage errlog-open`)를 보고, 캐시가 없으면(모름) 닫힘.
- 화면은 앱을 연 뒤 **4초 뒤** `getConfig("errorLogOn")` 로 캐시를 고친다 — 그래서 문을 연 날은 **그다음 실행부터** 보낸다.
- 서버도 같은 문을 다시 본다(`clientError` — 닫혔으면 `{ok:true, skipped:"closed"}` · 설정을 못 읽어도 받지 않는다). 이 응답은 화면에 안 보이므로 「모름」도 그냥 안 받는다.
- `PUBLIC_CONFIG_KEYS` 에 `errorLogOn` 이 들어 있다(빠지면 켜도 앱이 영영 모른다 — 시험이 본다).
- 급히 끌 때: 아래 「문 닫기」 한 줄. 코드 배포가 필요 없다.

## 켜는 차례 (친구가 정한 뒤)
1. 친구가 **개인정보 방침을 고치기로 정한다** — 스토어 심사 중이면 심사 뒤(스킬 `copy-truth` ③).
2. main 에 머지(이 가지 `feat/client-errors`).
3. 운영 SQL: `supabase/client_errors.sql` 을 운영 link 폴더로(스킬 `sql-migrate` ⑤⑧) → 파일 맨 아래 「확인」 → `python tools/sql-applied.py record supabase/client_errors.sql --prod` → 교회 어드민 `check-authenticated-exposure.sql` **0행**.
   새 표에 새 액션만 얹는 경우라 **표가 먼저**다(빈 표는 아무도 안 읽는다 · 문이 닫혀 있으면 api 는 표를 보지도 않는다).
4. 운영 api: `python tools/deploy-fn.py api --prod`(스킬 `fn-deploy`) → 닫힌 채 `clientError` 를 불러 `{"ok":true,"skipped":"closed"}` 가 오는지(= 이번 판에만 있는 표식).
5. 화면: `python tools/bump.py` → 푸시(스킬 `release`) — 닫힌 채 나가도 아무것도 안 보낸다.
6. **방침 세 자리를 한 커밋에**(아래 문장 안) → bump → 푸시.
7. 친구가 정한 날 **문 열기**(운영 SQL Editor):
   ```sql
   insert into app_config(key, value) values ('errorLogOn', 'true'::jsonb)
   on conflict (key) do update set value = excluded.value, updated_at = now();
   ```
8. 다음 날 `supabase/client_errors.sql` 머리의 ⓐ 질의로 본다.

문 닫기(되돌리기): 위 줄의 `'true'` 를 `'false'` 로. 통째로 걷는 줄은 SQL 파일 머리 「되돌리기」.

## 방침에 넣을 문장 안 (켤 때 · 세 자리를 한 커밋에)
> 지금은 넣지 않았다(문이 닫혀 있어 사실이 아니다 · 친구가 아직 정하지 않았다). **문을 여는 날과 같은 날**에 넣는다.
> 넣을 때 「90일」 · 「이름·소속·계정은 함께 보내지 않는다」가 세 자리에서 같은 말인지 본다.

**① `privacy/index.html` 1항 「무엇을 모으나」 표 — 「열람 기록」 줄 아래에 한 줄**
```html
<tr>
  <td><b>화면 오류 기록</b><br>(앱 화면에 오류가 났을 때 — 앱 판·앱 종류(웹/플레이 앱/아이폰 앱)·오류가 난 화면·오류 내용 첫 줄·브라우저 종류·날짜)</td>
  <td>화면에 오류가 났을 때 저절로</td>
  <td>앱의 고장을 찾아 고치기 위해<br>
    <b>이름·소속·계정 번호와 함께 보내지 않아</b> 누구의 기기에서 난 오류인지 알 수 없습니다. 운영진만 봅니다</td>
</tr>
```
**3항 「얼마나 보관하나」 — 신고·AI 답 알림 문단 뒤에**
```html
<p>
  <b>화면 오류 기록</b>은 <b>90일 뒤 저절로 지워집니다.</b> 누구의 기록인지 알 수 없게 모으므로 한 분의 것만 골라 지울 수는 없습니다.
</p>
```
(4항 「누가 볼 수 있나」에 「화면 오류 기록은 운영진만 봅니다」를 더해도 좋다. 5항 「삭제하면 무엇이 지워지나」에는 「화면 오류 기록은 누구의 것인지 모르게 모아 계정을 지워도 남고, 90일 뒤 저절로 지워집니다」.)

**② `app.js` `renderPrivacyInfo` — 「열람 기록」 `<li>` 아래에**
```html
<li><b>화면 오류 기록</b> — 앱 화면에 오류가 나면 앱 판·앱 종류·오류가 난 화면·오류 내용 첫 줄·브라우저 종류를 보내요 <small>(이름·소속·계정은 함께 보내지 않아요 · 90일 뒤 지워요)</small></li>
```

**③ `app.js` `renderHelp` 「🔒 개인정보 안내」 — 「그 밖에 남는 것」 문장의 「…열람 기록」 뒤에**
> `, 앱 화면에 오류가 났을 때의 <b>화면 오류 기록</b>(앱 판·화면·오류 첫 줄·브라우저 종류 — 이름·소속·계정 없이 · <b>90일</b>이면 지워요)`

**④ 스토어 신고** — 플레이 데이터 보안(`자료/store/data-safety-play-*.csv`)의 「앱 활동 → 앱 비정상 종료 로그 / 진단」 · 애플 App Privacy 의 「Diagnostics → Crash Data / Other Diagnostic Data」(사용자와 연결 안 됨 · 추적 안 함 · 앱 기능·분석 목적). 담당자 확인 목록에 올린다.

## 개발에서 확인한 것 (2026-10-12)
- SQL 을 개발에 두 번 돌림(두 번째도 오류 없음) · RLS 켜짐 · anon·authenticated 권한 0 · 공개 키로 표 `401 42501` · 공개 키로 `rpc/v2_client_error` 도 `401 42501`. 개발 DB 에는 pg_cron 이 없어 정리 작업은 안 걸렸다(함수가 지운다).
- api 개발 배포(`deploy-fn.py api --dev --allow-ahead` · 액션 172).
- 문 없음 → `{"ok":true,"skipped":"closed"}` · 문 열고 같은 몸 두 번 → 한 줄 `cnt 2`(몸에 실어 보낸 `user_id`·`name` 은 버려지고, `?v=38&name=…` 은 지워지고, 전화번호는 `<n>`) · 문 다시 닫음(`errorLogOn = false`) → `closed`.
- 실제 브라우저(헤드리스)에서 오류를 일으켜 보내는 것은 안 해 봤다 — 화면 덩어리는 시험이 가짜 window 위에서 그대로 돌린다.

## 보는 법
`supabase/client_errors.sql` 머리의 ⓐ(최근 7일 판·껍데기·화면별) · ⓑ(많이 난 오류 그대로) · ⓒ(새 판에서만 나는 오류). 관리 화면은 만들지 않는다 — 관리 기능은 교회 어드민으로 옮기는 중이라 성경암송 관리 화면에 새 기능을 더하지 않는다. 화면이 필요해지면 교회 어드민에.
⚠️ `cnt` 는 「몇 분이」가 아니다 — 한 기기는 같은 오류를 하루 한 번만 보내니 「그날 그 오류를 겪은 기기 수」에 가깝지만, 저장소를 못 쓰는 기기(사생활 보호 창)는 열 때마다 다시 보낸다.
