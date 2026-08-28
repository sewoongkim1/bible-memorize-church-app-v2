# 개발용 Supabase 만들기 (운영과 분리)

운영 프로젝트 `xnomlgydifiqiybervtf`(bible-memorize-church, 서울)에는 **성도님의 실제 기록**이 들어 있다.
개발·시험은 여기서 하지 않는다. 이 문서는 **개발용 프로젝트를 처음부터 세우는 순서**다.

| | 프로젝트 | ref |
|---|---|---|
| 운영 | `bible-memorize-church` · sewoongkim1's Org | `xnomlgydifiqiybervtf` |
| 개발 | `bible-memorize-dev` · gocheok-dev | `ktpwthwqzgcqcrmsafdo` |

둘 다 서울(ap-northeast-2) · Free. **2026-08-27에 개발 프로젝트를 세웠다.**

> ⚠️ **성도 데이터는 한 줄도 복사하지 않는다.** 개발 DB에는 가짜 사람(홍길동 · 사랑 1목장)만 넣는다.
> 말씀 구절(`verses`)은 개인정보가 아니므로 그대로 넣어도 된다 — 오히려 넣어야 화면이 돈다.

---

## 0. 프로젝트 자리 만들기 (대시보드에서만 됨)

CLI에는 `projects list`만 있어 **만들기·지우기는 대시보드**에서 해야 한다.
무료 플랜은 활성 프로젝트 2개까지다.

1. https://supabase.com/dashboard → **New project** · 이름 `bible-memorize-dev`
   - 지역은 **Seoul (ap-northeast-2)** — 운영과 같게 두어야 지연 차로 헷갈리지 않는다
2. 한도가 찼다고 나오면 안 쓰는 프로젝트를 먼저 지운다
   (2026-08-27에 도쿄의 `sewoongkim1's Project`를 그렇게 정리했다 — 네 저장소 어디서도 부르지 않는 것을 확인하고 지웠다)

> ⚠️ 지울 때는 **이름과 지역을 반드시 확인한다.**
> 운영은 `bible-memorize-church` · **서울** · `xnomlgydifiqiybervtf` 이고,
> 여기에는 성도님 기록과 암송 로그가 들어 있다. **삭제는 되돌릴 수 없다.**

---

## 1. 스키마 재현 — SQL Editor에서 이 순서로

각 파일을 열어 **위에서부터 차례로** 붙여 실행한다.
⚠️ **걸렸던 곳은 여기에 적어 둔다.**
- 2026-08-27 `pilsa_admin_notify.sql` — `app_config.value` not null 위반. 스키마가 아니라 사람 등록이어서 **돌리지 않는다**(2절).
  그 파일은 모두 못 찾았을 때 사람이 읽을 수 있게 멈추도록 고쳤다(운영에서도 이름 오타 한 번이면 같은 오류가 난다).
- 2026-08-27 `daily_meditations.sql` · `verse_help.sql` — `public.sermons`를 고친다. **돌리지 않는다**(2절).
- 2026-08-27 `cron_last_run_rpc.sql` — `cron.job_run_details` 없음. pg_cron을 안 켜둔 것이 의도다. **돌리지 않는다**(2절).

### ① 뼈대
```
schema.sql              users · verses · progress · challenge_log · reviews · push_subscriptions
seed_verses.sql         말씀 구절 씨앗
```

### ② verses·progress 넓히기 (순서 중요)
```
migrate_verses_cms.sql          설교 제목·영상 등 표시용 컬럼
migrate_verses_english.sql      text_en · ref_en (영어 NIV)
migrate_progress_lang.sql       progress에 lang — PK가 바뀐다
migrate_modes.sql               challenge_log.mode CHECK를 learn-* 까지
migrate_modes_card.sql          카드 모드(typing-card · learn-typing-card)
migrate_challenge_log_nullable.sql
migrate_passages.sql            긴 본문 암송(passages · passage_progress)
```

### ③ 기능 테이블
```
app_config.sql          설정 저장소(pilsaAdmins · AI 캐시 등)
monitor.sql             push_log
push_hour.sql           구독마다 받을 시각
push_log_body.sql
hearted.sql             마음에 둠
board.sql               게시판
board_userid.sql        본인 글 삭제
board_reactions.sql     공감 이모지
board_images.sql        사진 첨부 + Storage 통
rank_cheers.sql         순위 응원 👏
pilsa_orders.sql        필사 노트 신청
event_entries.sql       말씀 이벤트 응모
```

### ④ 집계·통계
```
daily-activity.sql      집계표 + challenge_log 트리거 (순위·mydays가 이걸 읽는다)
stats-rpc.sql           v2_stats · v2_participants
stats-rpc-card.sql      위 둘의 '카드' 열 보정 — stats-rpc.sql 뒤에 와야 한다
```

### ⑤ 보안 — 반드시 마지막에
```
security_close_public_views.sql   익명 키로 새던 뷰·표를 닫는다
```

---

## 2. 개발에서는 **돌리지 않는** 것

### 자동 발송 (pg_cron)
```
push_cron.sql · push_cron_hourly.sql · weekly_verse_push_cron.sql · weekly_report.sql
```
개발 프로젝트에서 이걸 켜면 **알림과 메일이 실제로 나간다.** 켜지 않는다.

```
cron_last_run_rpc.sql
```
`cron.job_run_details`를 읽는데 그건 **pg_cron 확장이 켜져 있어야** 생긴다.

> ⚠️ **개발에는 pg_cron을 일부러 켜지 않는다.** 확장이 없으면 위 cron 넷을
> 실수로 돌려도 **그 자리에서 소리내며 실패한다.** 켜 두면 조용히 잡이고
> 언젠가 실제로 발송된다. **없는 것이 안전장치다** — 시크릿을 빼 것과 같은 이치다.
>
> 대가로 개발의 `monitor`는 「주간 리포트 메일 실행 기록을 찾을 수 없습니다」를
> 항상 말한다. 개발에는 정말로 cron이 없으니 맞는 말이다(호출은 try로 감싸 있어 멈추지는 않는다).

### 한 번 쓰고 끝난 데이터 수정
```
insert_sermon_juan.sql · update_sermon_shalom.sql
cleanup_test_user_logs.sql · pilsa_phone_cleanup.sql
```

### 사람을 등록하는 것
```
pilsa_admin_notify.sql
```
스키마가 아니라 **필사 담당자를 골라 넣는 스크립트**다. 개발 DB에는 등록할 사람이 없다.

### `sermons` 표를 고치는 것 (말씀 아카이브 영역)
```
daily_meditations.sql · verse_help.sql
```
둘 다 `public.sermons`를 `alter`·`update` 한다. 그 표는 말씀 아카이브 것이라
**개발 프로젝트에는 없다**(이 저장소에는 그 표의 DDL 자체가 없다).

> ⚠️ **그래서 개발에서는 이 기능들이 동작하지 않는다** — 「오늘의 묵상」,
> 「쉬운 풀이·기억법」, 말씀 아카이브 연동, 설교 챗봇.
> 암송·도전·복습·순위·게시판·필사는 모두 정상이다.
> 그 기능까지 개발에서 보려면 말씀 아카이브도 개발 프로젝트를 가져야 한다.

### 다른 앱(말씀 아카이브) 것
```
sermon_ai_cache.sql · sermon_chat_log.sql · sermon_chunks.sql
```
이 프로젝트는 세 앱이 함께 쓰지만, **개발용에는 성경암송이 쓰는 것만** 옮긴다.
나머지 둘은 각자 필요해질 때 하면 된다.

---

## 3. Edge Function 올리기

같은 코드를 `--project-ref`만 바꿔 올린다.

```bash
supabase functions deploy api --no-verify-jwt --project-ref <개발-ref>
```

### 시크릿 — 개발에는 최소한만

| 시크릿 | 개발에 넣나 | 왜 |
|---|---|---|
| `ADMIN_SECRET` | ✅ **운영과 다른 값으로** | 같은 값을 쓰면 분리한 뜻이 없다 |
| `ANTHROPIC_API_KEY` | 필요할 때만 | 부르면 돈이 나간다 |
| `VAPID_*` | ❌ | 없으면 실수해도 알림이 안 나간다 |
| `RESEND_API_KEY` | ❌ | 없으면 메일이 안 나간다 |
| `TELEGRAM_*` | ❌ | 개발 경보로 실제 채널을 어지럽히지 않는다 |

**없는 것이 안전장치다.** 개발에서 `sendPush`를 잘못 불러도 키가 없으면 아무 데도 가지 않는다.

개발용 `ADMIN_SECRET`은 저장소 밖 **`.env.dev`**에 있다(`.gitignore`의 `.env.*`에 걸려 커밋되지 않는다).
바꾸거나 다시 넣을 때는 값을 명령줄에 치지 말고 파일로 넘긴다 — 명령줄은 기록에 남는다.

```bash
supabase secrets set --env-file .env.dev --project-ref ktpwthwqzgcqcrmsafdo
```

---

## 4. 앱이 어느 쪽을 볼지 — `js/config.js` ✅ 적용됨

**사람이 손으로 고르지 않는다.** 반드시 잊고, 잊은 채로 커밋된다.
**주소를 보고 저절로 갈린다.**

```
gocheok.onlybible.kr  →  운영
그 밖의 모든 주소      →  개발   (localhost · 미리보기 · 브랜치 · github.io)
```

기본값이 **개발** 옆인 것이 핵심이다. 새 미리보기 주소가 생겨도 운영에 붙지 않는다.
반대로 두면(모르는 주소 → 운영) 실수 한 번이 성도님 기록을 건드린다.
**잘못 갈렸을 때 '빈 화면'은 눈에 보이지만 '남의 기록을 지운 것'은 안 보인다** — 보이는 쪽으로 틀리게 둔다.

개발 쪽일 때는 화면 오른쌄에 **「개발 DB」 띄**가 뜼다. 빈 목록을 보고 고장으로 오해하지 않도록.

### 관리자 화면도 같이 갈린다

`admin.html` · `admin-stats.html` 도 `js/config.js`를 읽어 같은 규칙을 따른다.
이게 없으면 **개발자가 로컬에서 관리자 화면을 열어 운영을 만지게** 된다 —
알림 발송·글 삭제·필사 상태 변경까지 닿는 화면이라 가장 위험한 자리다.

⚠️ **예외 셋** — 형제 앱은 아직 개발 프로젝트가 없어 운영을 그대로 본다.

| 파일 | 왜 |
|---|---|
| `admin-sermon.html` | 말씀 아카이브(sermon 함수) |
| `admin-sermon-chat.html` | 설교 챗봇 — `sermon_chunks`가 운영에만 있다 |
| `praise-config.js` | 찬양 아카이브(praise 함수) |
| `admin-stats.html`의 `SERMON_FN` | 구절에 설교를 엮을 때만 쓴다 |

그쪽이 각자 개발 프로젝트를 갖게 되면 이 예외를 지우면 된다.

---

## 5. 다 됐는지 확인하는 법

개발 프로젝트 주소로 앱을 띄우고

1. 가짜 이름으로 로그인이 되는가 (`users`에 행이 생기는가)
2. 한 구절을 3단계까지 마쳐 `progress` · `challenge_log` · `daily_activity` 셋이 함께 늘어나는가
   — 셋이 안 맞으면 `daily-activity.sql`의 트리거가 안 걸린 것이다
3. 관리자 통계에서 **타이핑 + 음성 = 총횟수** 인가
   — 안 맞으면 `stats-rpc-card.sql`을 안 돌린 것이다
4. 공개 키로 `GET /rest/v1/v_ranking_all?select=*&limit=1` 이 **막히는가**
   — 열려 있으면 `security_close_public_views.sql`을 안 돌린 것이다
