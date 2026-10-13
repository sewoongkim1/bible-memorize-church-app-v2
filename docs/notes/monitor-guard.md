# 매일 점검(monitor)을 넓힌 것 — GitHub 60일 멈춤 대비 · 교회 어드민 점검 (2026-10-12)

매일 07:12 KST 에 `.github/workflows/monitor.yml` 이 `api` 의 `monitor` 액션을 부르고, 문제가 있으면 텔레그램으로 알린다(CLAUDE.md 「모니터링」).
여기에 두 가지를 더했다.

## GitHub 60일 멈춤 대비

### 무엇이 문제인가
GitHub 은 **공개 저장소에 60일 동안 커밋이 없으면 예약 워크플로(schedule)를 저절로 끈다**(상태 `disabled_inactivity`).
`monitor.yml`·`security-check.yml` 이 둘 다 꺼진다. 경보를 보내는 쪽이 꺼지므로 **텔레그램이 소리 없이 멈춘다** — 그 안에서는 「멈췄다」를 알릴 길이 없다.
지금은 커밋이 거의 매일 있어 먼 이야기지만, 앱이 안정되어 손을 놓는 때가 바로 그때다.
같은 길로 잡히는 것: 환경 시크릿 `MONITOR_KEY`(2026-10-13 까지는 `ADMIN_SECRET`)를 지우거나 틀리게 바꿈(워크플로가 「건너뜀」으로 조용히 끝난다) · GitHub Actions 장애.

### 고른 안 — GitHub 밖(Supabase)에서 「마지막 점검 시각」을 본다
1. `monitor.yml` 이 `monitor` 를 부를 때 `src:"gha"` 를 싣는다 → `api` 가 **암호 확인 뒤, 점검보다 먼저** 흔적 `app_config.monitorRun = {at}` 을 남긴다.
   - ⚠️ `src` 없는 부름(관리자 화면 `admin-stats.html` · 교회 어드민 「시스템 상태」)은 흔적을 안 남긴다 — 그것까지 세면 사람이 화면을 여는 날마다 GitHub 이 멈춘 것을 가린다.
2. Supabase **pg_cron `monitor-watch`**(매일 03:00 UTC = 12:00 KST · `supabase/monitor_watch_cron.sql`)가 `api` 의 내부 액션 `internalMonitorWatch` 를 부른다
   (Vault `edu_remind_service_key` — 교육·당번 전날 알림과 같은 키).
   흔적이 **36시간**을 넘었으면 **Resend 메일**(받는 분 `REPORT_RECIPIENTS` — 주간 리포트와 같은 분)로 알린다. 메일에는 GitHub 공개 API 로 읽은 두 워크플로의 상태와 되살리는 법이 실린다.
   - 07:12 에 돌고 12:00 에 보므로 평소엔 5시간 전 흔적이다. **한 번 거른 것으로는 안 울리고 이틀째 낮에 운다**(GitHub 은 붐빌 때 예약 실행을 가끔 빼먹는다).
   - 멈춰 있는 동안 **하루 한 번** 온다. 되살려 한 번 돌리면 그친다.
3. 거꾸로 `monitor` 는 지킴이의 흔적 `app_config.monitorWatchRun` 이 36시간을 넘으면 problems 에 한 줄 → 텔레그램. **둘이 서로를 본다.**
4. 두 흔적 모두 **한 번이라도 생긴 뒤부터만** 본다(`monitorAgeH` 가 null = 「모른다」 → 알리지 않는다). 크론을 걸기 전·개발에서 헛경보가 없다.

판정·메일 글은 `api` 의 순수 구간 「감시의 감시」(`monitorAgeH`·`monitorWatchProblems`·`monitorWfStates`·`monitorStaleMail`) — 시험 `tests/monitor-guard.test.cjs`(preflight).
개발 끝까지 시험 `bash tests/monitor-watch.dev.sh`(dry — 메일 없이).

### 왜 이 길인가 — 견준 것
- **알림 길: Resend 메일.** Supabase 에는 텔레그램 키가 없다. 관리자 기기 웹 푸시는 「관리자 기기」가 따로 정해져 있지 않고, 메일은 주간 리포트가 매주 쓰는 검증된 길이다.
  ⚠️ 메일이 실패하면(키 만료 등) 흔적의 `mailed` 에 까닭이 남을 뿐 다른 길은 없다 — 주간 리포트가 안 오는 것으로도 알 수 있다.
- **새 표를 만들지 않았다** — `app_config` 의 서버 전용 키 두 줄(`dutyRemindRun` 과 같은 꼴). `PUBLIC_CONFIG_KEYS`·`ADMIN_CONFIG_KEYS` 에 넣지 않는다(앱이 읽는 키가 아니다).
- **(나) GitHub API 로 되살리기는 하지 않았다.** 워크플로를 다시 켜려면(`PUT /repos/…/actions/workflows/{id}/enable`) `actions:write` 권한의 토큰이 GitHub **밖**에 있어야 한다.
  - 환경(production) 시크릿은 `MONITOR_KEY`·`TELEGRAM_*` 뿐이고(`MONITOR_KEY` 는 api 가 monitor · weeklyReport 만 열어 주는 전용 키 · 2026-10-13), 워크플로 안의 `GITHUB_TOKEN` 은 워크플로가 꺼지면 쓸 수 없다.
  - Supabase 의 `GH_DISPATCH_TOKEN` 은 설교 작업을 gocheok-sermons 저장소로 보내는 토큰이다 — 이 저장소에 대한 권한이 있는지는 값을 안 보고는 모르고, 있더라도 **다른 일에 쓰라고 준 토큰을 넓혀 쓰지 않는다.**
  - 하려면: 이 저장소만 · Actions 쓰기만 주는 fine-grained 토큰을 새로 만들어 `api` 시크릿에 넣고, `internalMonitorWatch` 가 `disabled_inactivity` 를 보면 enable 을 부르게 한다(만료일 관리가 따른다). 지금은 메일로 사람이 켠다.

### 멈췄다는 메일이 오면
1. GitHub 저장소 → Actions → 「장애 모니터」·「보안 점검」 → **Enable workflow**(또는 `gh workflow enable monitor.yml` · `gh workflow enable security-check.yml`)
   — ⚠️ 커밋을 하나 올리는 것만으로는 **다시 켜지지 않는다.**
2. 「장애 모니터」 → **Run workflow** 한 번 → 흔적이 새로 남아 다음 날부터 메일이 그친다.
3. 상태가 `active` 인데도 멈췄으면: Actions 의 실행 기록 · 환경 시크릿 `MONITOR_KEY`(틀리면 `monitor` 가 unauthorized 로 끝나 흔적을 못 남긴다 · 비었으면 「건너뜀」).

### 운영에 내는 차례
1. 가지를 main 에 → `python tools/deploy-fn.py api --prod`(api 먼저 — 옛 api 는 `src` 를 몰라 흔적을 안 남길 뿐 깨지지 않는다)
2. 다음 날 07:12(또는 「장애 모니터」 Run workflow) 뒤 `select value from app_config where key = 'monitorRun';` 이 생겼는지
3. `supabase/monitor_watch_cron.sql` 을 운영 주소로 바꾼 사본으로 운영에 → 파일 끝 「확인」의 손 부름(dry)으로 `{"ok":true,"state":"ok"}` 를 본다.
   거꾸로 걸어도 헛경보는 없지만(흔적이 없으면 「모른다」), 그동안은 지키는 것이 없다.

### 걷을 때
`select cron.unschedule('monitor-watch'); delete from app_config where key = 'monitorWatchRun';` — 흔적을 안 지우면 `monitor` 가 「지킴이가 N시간째 돌지 않았다」고 알린다.

## 교회 어드민 점검

교회 어드민(admin.onlybible.kr · 별도 저장소 `c:\Projects\church-admin` · 함수 `church-admin`)에는 매일 점검이 없었다.
성경암송 `monitor.yml` 의 같은 단계(텔레그램 시크릿이 이미 있다)에서 함께 본다 — **공개로 볼 수 있는 것만**(키 없음 · 쓰는 요청 없음).

| 보는 것 | 정상 | 이상이면 |
|---|---|---|
| `https://admin.onlybible.kr/` | HTTP 200 | `• 화면 admin.onlybible.kr 응답 404` 꼴 |
| `POST …/functions/v1/church-admin` 에 `{"action":"me"}` (토큰 없이) | **HTTP 401 + `"error":"unauthenticated"`** — 함수 자신이 준 답이다(`index.ts` 의 토큰 검사) = 살아 있다 | `• 함수 church-admin 응답이 이상합니다 (HTTP 404 · {"code":"NOT_FOUND"…})` 꼴 — 부팅 실패(5xx)·삭제(404)·게이트웨이 오류는 다른 꼴로 온다 |

- 한 번 빗나가면 **20초 뒤 한 번 더** 본다(순간 오류로 헛경보를 내지 않게). 둘째도 이상하면 성경암송 경보와 **같은 텔레그램 한 통**에 「🔴 교회 어드민」 묶음으로 붙는다.
- 진단 모드(`weekly_test`·`force_alert` · `diag_send` 는 2026-10-13 뺌)에서는 돌지 않는다 — 평소 점검(예약 실행 · 입력 없는 Run workflow)에서만.
- ⚠️ 교회 어드민이 토큰 없는 부름의 답을 바꾸면(`unauthenticated` 낱말 · 401) 이 점검이 매일 운다 — 그때는 `monitor.yml` 의 `ca_check` 를 함께 고친다.
- 보지 않는 것: 로그인 뒤의 동작 · DB 권한(그것은 매주 보안 점검 · `docs/notes/security-check.md`).
