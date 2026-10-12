# SQL 적용 기록 · 반영 현황 한 장 (2026-10-12)

> **언제 읽나:** SQL(마이그레이션)을 개발·운영에 넣을 때 · 「지금 무엇이 어디에 올라가 있나」를 볼 때
> 도구 둘: `tools/sql-applied.py`(SQL 을 넣었다는 기록) · `tools/status.py`(화면·함수·문·Actions 한 장)

## 왜
여러 세션이 병렬로 일하면서 가장 힘든 것이 「정확히 반영됐는지 확인 못 함」이었다. 어긋남은 오류가 아니라 **조용히** 생긴다 —
남의 것이 딸려 나가고, 내 것이 빠지고, CDN 이 옛 app.js 를 내보내고, SQL 을 개발에만 넣거나 옛 판을 넣는다.
기준을 **origin/main** 하나로 두고, 실제로 올라가 있는 것을 거기에 견준다.

## SQL 을 넣은 뒤 한 줄
```bash
# 1) 개발에 넣는다(지금처럼 — SQL Editor 또는 저장소 밖 link 폴더에서 supabase db query --linked --file …)
python tools/sql-applied.py record supabase/duty.sql --dev
# 2) localhost 확인 뒤 운영에 넣는다
python tools/sql-applied.py record supabase/duty.sql --prod --note "봉사 당번 4단계"
```
- **record 는 SQL 을 돌리지 않는다** — 「돌렸다」고 적기만 한다. 돌리지 않은 파일을 record 하면 거짓 기록이 된다.
- 기본은 **개발**이다(모르면 개발 — `js/config.js` 와 같은 원칙). 운영은 `--prod` 를 손으로 준다.
- 파일 여럿을 한 번에: `record a.sql b.sql --dev`. 같은 판을 다시 넣었으면 다시 record — 때가 오늘로 고쳐진다.
- `note` 끝에 `git 가지@커밋` 이 저절로 붙는다(`+수정` = 커밋 안 된 판). 커밋 안 됐거나 origin/main 과 다른 판이면 ⚠ 를 찍는다(막지는 않는다 — 개발에서 가지 판을 시험하는 것은 정상이다).

## 지금 어디까지 들어갔나
```bash
python tools/sql-applied.py status --dev     # supabase/*.sql 각각
python tools/sql-applied.py status --prod
python tools/sql-applied.py status --prod --all   # 「기록 없음」까지 모두
```
| 판정 | 뜻 |
|---|---|
| 같음 | 지금 파일의 판을 그 DB 에 넣었다고 기록돼 있다 |
| **바뀜** | 그 파일을 넣은 기록은 있는데 **그 뒤 파일이 바뀌었다** — 다시 넣어야 하나 본다(종료코드 1) |
| 파일 없음 | 기록만 있고 파일이 없다(이름을 바꿨거나 지웠다) |
| 기록 없음 | 기록이 없다 — 이 도구 전에 넣은 것 · 시드·시험 데이터·한 번 쓰고 버린 SQL 도 여기 든다 |

판은 **이 체크아웃의 파일** 기준이다. main 의 판과 견주려면 main 을 받은(또는 worktree 의) 체크아웃에서 돌린다.

## 어떻게 되어 있나
- 표 `public.schema_applied(file, sha256, applied_at, applied_by, note)` — 기본 키 `(file, sha256)`. 만드는 SQL 은 `supabase/schema_applied.sql`(반복 실행 안전).
  RLS 를 켜고 정책 없이 · `anon`·`authenticated` revoke — 공개 키로 `GET /rest/v1/schema_applied` 를 하면 `permission denied` 가 와야 한다.
- 지문(sha256)은 **줄 끝을 LF 로 맞추고 BOM 을 뗀 내용**으로 셈한다 — 윈도(CRLF)·맥(LF) 체크아웃이 같은 판을 같다고 본다.
- CLI 는 **저장소 밖 link 폴더**에서 부른다 — 운영 `~/.gocheok-backup/supa-prod` · 개발 `~/.gocheok-backup/supa-dev`(`tools/backup-db.py` 와 같은 폴더 · 없으면 만들어 link).
  저장소의 `supabase/.temp` 는 세션마다 가리키는 곳이 바뀌어 쓰지 않는다. link 폴더가 다른 프로젝트를 가리키면 도구가 멈춘다(다시 link 하지 않는다).
- SQL 은 임시 파일로 넘긴다(명령줄의 한글이 깨지는 일을 피한다).

## 처음 한 번(DB 마다)
```bash
# 개발 — 2026-10-12 에 넣었다
# 운영 — 아직. 친구가 넣을 때:
cd ~/.gocheok-backup/supa-prod && supabase db query --linked --file C:/Projects/bible-memorize-church-app-v2/supabase/schema_applied.sql
cd C:/Projects/bible-memorize-church-app-v2 && python tools/sql-applied.py record supabase/schema_applied.sql --prod
```
지난 SQL 을 거슬러 기록하지는 않는다 — 운영에 무엇이 어떤 판으로 들어가 있는지 지금은 증명할 길이 없다(「기록 없음」이 그 사실 그대로다). 앞으로 넣는 것부터 적는다.

## 반영 현황 한 장 — `tools/status.py`
```bash
python tools/status.py          # 운영
python tools/status.py --dev    # 개발(화면 칸은 건너뜀 — 개발에는 사이트가 없다)
```
읽기만 한다(쓰는 요청·관리자 암호·service_role 키를 안 쓴다 · 개인정보를 찍지 않는다). 못 본 칸은 「모름」. 다름이 있으면 종료코드 1.
1. **화면** — 운영 `index.html` 의 `?v=` · 그 주소 `app.js` 의 `APP_BUILD` · 스플래시 판 번호를 origin/main 과 견준다(CLAUDE.md 「배포 확인」). 태그는 같은데 `APP_BUILD` 만 다르면 CDN 이 옛 app.js 를 내보내는 중이다.
2. **함수** — 올라간 `api`·`mcp` 를 `supabase functions download <이름> --use-api`(Docker 없이)로 **저장소 밖 임시 폴더**에 받아, origin/main 의 `supabase/functions/<이름>/` + 상대 import 로 끌어오는 파일과 내용·파일 목록을 견준다. `api` 는 `case "…"` 액션을 파일 전체에서 모아 「운영에만」·「main 에만(아직 안 올라감)」을 찍는다(파일이 나뉘어도 된다). 받은 폴더는 끝나면 지운다.
3. **문** — 공개 키로 `getConfig`(키 목록은 origin/main 의 `PUBLIC_CONFIG_KEYS`) + origin/main 의 `app.js`·`js/*.js` 의 상수 스위치(`const 이름_LIVE|_OPEN|_HIDE…|_GUIDE = true|false|{…: true|false}` 꼴 — 이름을 박지 않는다). 긴 값은 모양만(「목록 2개」·「{키 8개: …}」).
4. **최근 Actions** — `gh run list --limit 3`. origin/main 머리를 배포한 줄에 「← origin/main」.

⚠️ 스위치를 새로 만들면 이 꼴(`_LIVE`·`_OPEN`·`_HIDE…`·`_OFF`·`_ON`·`_GUIDE`·`_VISIBLE`)을 따르면 저절로 잡힌다 — 줄 머리 `const`, 값은 true/false 또는 그것만 든 `{…}`.
