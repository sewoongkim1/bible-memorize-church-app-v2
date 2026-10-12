---
name: gated-feature
description: 성경암송 앱에 아직 성도님께 보이면 안 되는 기능을 「문(게이트)」을 달고 만들고, 나중에 연다 — 상수(EVENING_LIVE 꼴) / app_config 설정값(dutyOpen·eduOpen·psalmPublic 꼴 · PUBLIC_CONFIG_KEYS) / 🧪 시험 참여자 · 서버도 같은 문 · 열림·닫힘·모름 세 값 · FEAT_SINCE · 연 뒤 걷기. "새 기능 숨겨서 올려", "시험 참여자만 보이게", "게이트 달아줘", "기능 공개해줘", "문 열어줘", "dutyOpen 켜", "아직 성도님께 안 보이게" 같은 요청이나, 미완성 기능을 main 에 넣을 때 사용.
---

# 문 달린 기능 (gated-feature)

> 이 저장소는 **푸시 = 배포**다. 「아직 안 끝났으니 괜찮다」가 성립하지 않는다 — 미완성 기능은 **처음 커밋부터** 문을 달고 시작한다.
> **왜:** 2026-09-10 시편 액자가 남의 커밋에 딸려 나가 성도님 첫 화면에 떴고, 운영 서버는 옛 판이라 「 에 시작해요」(날짜가 빈 채)로 보였다.
> 본보기: `app.js` 의 `psalmVisible`·`eduVisible`·`dutyVisible` · `js/push.js` 의 `EVENING_LIVE` · 문서 `docs/notes/duty-roster.md`·`education.md`·`today-song.md`.

## ① 문의 종류를 고른다
| 종류 | 본보기 | 여는 법 | 언제 |
|---|---|---|---|
| **데이터 자체** | 열린 회차·구절이 없으면 안 보임 | 행을 넣는다 | 가능하면 이것 — 캐시 층이 없어 「서버는 열렸는데 화면은 닫힘」이 안 생긴다 |
| **app_config 설정값** | `psalmPublic`·`songPublic`·`eduOpen`·`dutyOpen` | 운영 `app_config` 값 하나 | 날을 정해 여는 기능 · 코드 배포 없이 열고 닫아야 할 때 |
| **코드 상수** | `EVENING_LIVE`(`js/push.js`) · `WIDGET_GUIDE`·`MINISTRY_HIDE_ON_PLAY`(`app.js`) | 값 바꿈 → `python tools/bump.py` → 푸시 | 여는 조건이 「크론이 돌기 시작한 날」·「스토어에 나간 날」처럼 배포 사건일 때 |
| **🧪 시험 참여자** | `ministryTesterCached()` · 서버 `ministryTesterIds()`(`app_config.ministryTesters` — 교회 어드민 🧪 메뉴가 고친다) | 명단에 넣기 | 위 어느 것과도 겹쳐 쓴다(「열림이거나 시험 참여자」) |
| 미리보기 주소 | `?psalm=1`·`?song=1`(`_psalmPreview`) | 주소 | 개발·화면 점검용 |

## ② app_config 문이면 — 세 자리
1. **서버 허용 목록:** `supabase/functions/api/index.ts` 의 `PUBLIC_CONFIG_KEYS` 에 키를 더한다.
   **왜:** 빠뜨리면 `getConfig` 가 「허용되지 않은 키」로 거절해 **켜도 앱이 영영 모른다**(오늘의 찬양 — 배포 직전에야 잡힘). 이름이 든 명단·관리자 설정은 넣지 않는다(`ADMIN_CONFIG_KEYS`).
2. **앱 캐시:** 첫 화면은 동기 렌더라 미리 받아 둔 값을 본다 — `XXX_PUB_KEY` localStorage + `refreshXxx()` + `xxxOpenCached()`(`DUTY_PUB_KEY` 꼴). 판정은 **`d.value === true`** 로.
   **왜:** 문자열 `"false"` 는 자바스크립트에서 참이라 **켜진다**(today-song). 켠 날 성도님은 앱을 한 번 닫았다 열어야 보인다.
3. **서버도 같은 문:** 화면의 `xxxVisible()` 은 **단추를 숨길 뿐**이다. 막는 것은 서버다 — 쓰기는 `not-open`, 이름이 나가는 읽기도 막는다(`dutyGate`: 읽기는 `{ok:true, open:false}` 로 당번·이름·수 없이).
   서버 문은 `users` 에 그 계정이 **실제로 있는지**까지 본다(꼴만 맞는 UUID 는 닫힘 — `dutyGate`).

## ③ 세 값 — 열림 · 닫힘 · 모름
- 「모름」(아직 못 받음 · 통신 실패 · 서버가 옛 판 · 표 없음)과 「닫힘」을 **뭉개지 않는다.** 숨기는 동작은 같아도 **할 말이 다르다** — 「지금 불러올 수 없어요, 잠시 뒤 다시」 vs 「아직 열지 않았어요」.
  **왜:** 사역신청이 둘 다 `false` 로 뭉갰다가 통신이 잠깐 끊긴 분께 「기간이 지났습니다」라고 할 뻔했다.
- 서버에서 설정을 **못 읽은 것은 닫힘이 아니라 오류로 던진다**(`docs/notes/duty-roster.md` 「문은 두 겹이다」). `const { data } = …` 로 `error` 를 삼키지 않는다.
- 기본값은 늘 「안 보임」(닫힌 쪽으로 실패). 딥링크·알림으로 그 화면에 바로 닿은 분께는 까닭을 정확히 말한다.

## ④ 함께 챙길 것
- 플레이스토어 앱에서만 숨길 일이 있으면 `ministryHiddenOnPlay()` 를 문에 더한다(지금 `MINISTRY_HIDE_ON_PLAY = false` — 2026-10-09 출시 뒤 끔).
- 알림을 보내는 기능이면 **알림도 같은 문**으로 거른다(교육·봉사 당번: 닫힌 동안은 🧪 시험 참여자에게만 · 걸러진 분은 잡지 않는다).
- `tools/screen-sweep.py` 의 리셋에 미리보기(`_songPreview=true` 꼴)를 넣어야 8조건 점검에 찍힌다.
- 문이 닫힌 동안 성도님께 「곧 열려요」 같은 약속도 하지 않는다(`EVENING_LIVE=false` 동안 「저녁 8시에도」를 안 보인다) — 스킬 `copy-truth`.

## ⑤ 여는 날
1. **방침 먼저:** 새로 모으거나 보여 주는 것이 있으면 개인정보 안내(`privacy/` + 앱 안 `renderPrivacyInfo`·`renderHelp`)를 같은 날 · 스토어 심사 중이면 심사 뒤 — 스킬 `copy-truth`.
2. **NEW 배지:** `app.js` `FEAT_SINCE` 에 **여는 날짜**를 적는다(개발 날짜가 아니다 — 성도님이 보기도 전에 14일이 지나 버린다). ⚠️ 이미 쓴 키를 다시 쓰지 않는다(`event` — 한 번 눌러 본 분께 영영 안 뜬다).
3. **차례:** 서버(`api` — 스킬 `fn-deploy`) → 화면(스킬 `release`) → 마지막에 문을 연다. 화면이 서버보다 먼저면 시험 참여자 단추가 「지금 불러올 수 없어요」가 된다.
4. **문 열기:** 개발에서 먼저 —
   ```sql
   insert into app_config(key, value) values ('dutyOpen', 'true'::jsonb)
   on conflict (key) do update set value = excluded.value, updated_at = now();
   ```
   운영은 **친구가 정한 날 · 친구 확인 뒤**(스킬 `sql-migrate` ⑤의 link 폴더). 상수 문이면 값 바꿈 → bump → 푸시.
5. 시험 자료(시험 당번·시험 강좌·시험 회차)를 열기 **전에** 치운다 — 열린 뒤에는 성도님 화면·담당자 수에 섞인다(`duty-roster.md` 「4단계 앞에」).
6. 확인: 시험 참여자 **아닌** 계정으로 운영 화면에서 보이는지 · `EVT_ENV=prod` 스모크.

## ⑥ 연 뒤 걷기
되돌릴 일이 없어지면(몇 주) 문을 걷는다 — 미리보기 갈래 · 캐시 키 · 시험 참여자 갈래 · 꺼 둔 상수와 그 주석 · `screen-sweep.py` 의 리셋 줄.
**왜:** 문이 쌓이면 「이 단추는 왜 안 보이지」를 셀 자리가 늘고, 다음 세션이 꺼진 상수를 「아직 안 연 것」으로 읽는다.
⚠️ 서버의 문(`not-open`)은 화면보다 **나중에** 걷는다 — 옛 앱 캐시를 가진 분이 있다. 걷는 커밋은 따로(되돌리기 쉽게).

## 하지 않는 것
- 문 없이 「나중에 숨기면 된다」고 푸시 · 화면만 숨기고 서버는 열어 두기 · 「모름」을 「닫힘」 문구로.
