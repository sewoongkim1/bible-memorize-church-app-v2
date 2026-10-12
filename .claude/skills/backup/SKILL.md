---
name: backup
description: 성경암송 운영 Supabase(DB + Storage 유일본)를 tools/backup-db.py 로 암호화(7-Zip AES-256)해 한 파일로 받고, manifest 를 확인한 뒤 친구에게 다른 곳으로 옮기라고 안내한다 — 교인 사진은 --with-photos · 암호 파일은 위치만 말하고 값은 절대 출력하지 않는다. "백업해줘", "DB 백업", "운영 백업 받아", "백업 돌려", "사진까지 백업", "큰 작업 전에 백업" 같은 요청이나, 운영에 큰 마이그레이션·일괄 수정을 하기 직전에 사용. 되살리기는 docs/notes/backup.md 「되살리기」를 따른다.
---

# 운영 백업 (backup)

> 원본 `docs/notes/backup.md` · 스크립트 `tools/backup-db.py`(머리 주석).
> **왜 따로 받나:** Supabase 자동 백업은 매일 한 번 · **7일**뿐이고 **프로젝트 통째로만** 되돌린다(표 하나를 살리려면 다섯 앱의 그 사이 기록이 함께 사라진다).
> 그리고 **Storage 파일은 자동 백업에 없다** — `newfamily`(새가족 카드)·`board`(게시판 사진)·`verse-img` 는 지금 유일본이다.

## ⚠️ 먼저 — 이 파일에는 교인명부가 들어 있다
어느 교회 교인인가 = 종교 = 개인정보보호법의 **민감정보**다.
- **암호는 저장소·대화·스크립트·명령 출력 어디에도 적지 않는다.** 암호 파일은 `~/.gocheok-backup/pass`(첫 줄) — **위치만** 말한다. `cat`·`head`·`type` 으로 열지 않는다.
- 평문 폴더는 남기지 않는다(`--keep-plain` 은 디버그용 · 그때도 저장소 밖 · 끝나면 지운다).
- 보관 폴더는 저장소 밖(`C:\Projects\백업` 기본) — 저장소 안을 주면 스크립트가 멈춘다(저장소는 공개다).

## ① 준비가 됐나 — 값은 보지 않고 있는지만
```bash
test -s ~/.gocheok-backup/pass && echo "암호 파일 있음" || echo "암호 파일 없음 — 친구에게"
test -x "/c/Program Files/7-Zip/7z.exe" && echo "7-Zip 있음"
ls "/c/Program Files/PostgreSQL/"*/bin/pg_dump.exe
supabase projects list >/dev/null && echo "CLI 로그인 됨"
```
DB 비밀번호·Docker 는 필요 없다 — CLI 가 그때그때 임시 로그인 역할(`cli_login_postgres`)을 만든다. 그래서 **CLI 가 로그인된 이 PC 에서만** 돈다.
암호 파일이 없으면 만들지 말고 친구에게 알린다 — 암호를 잃으면 백업도 잃는다(두 사람이 알아야 한다).

## ② 받는다
```bash
python tools/backup-db.py --prod                  # → C:\Projects\백업\gocheok-prod-YYYY-MM-DD-HHMM.7z
python tools/backup-db.py --prod --with-photos    # 교인 사진 칸(church-people-photos)까지 — 크다 · 원본은 dimode·교인명부_작업에도 있다
python tools/backup-db.py --dev                   # 스크립트를 고쳤으면 개발(가짜)로 흐름부터
```
들어가는 것: `roles.sql`·`schema.sql`·`data.sql`(public·auth·storage 메타) · `cron-jobs.json`(운영만) · `storage/<버킷>/` · `manifest.txt`.
운영 읽기가 권한 검사에 막히면 우회하지 말고 친구에게 알린다.

## ③ 확인한다 — manifest
출력 끝에서:
- `✓ 암호화·검사 N B` — 7-Zip 이 암호로 다시 열어 「Everything is Ok」를 본 뒤에만 이 줄이 나온다. 없으면 실패다(만든 파일은 스크립트가 지운다).
- **■ 주요 표 행 수** — `public.users` 가 **사백이 넘는다**(스물 남짓이면 개발을 받은 것) · `challenge_log`·`daily_activity`·`church_people` 가 「없음」이 아니다 · 지난 백업보다 크게 줄지 않았다.
- **■ Storage** — `board`·`verse-img`·`newfamily` 가 0 개가 아니다(`--with-photos` 면 사진 칸도).
- **■ 참고**에 경고가 있으면 그대로 친구에게 옮긴다.
- 평문 폴더를 남겼다는 「⚠️」 줄이 없어야 한다.

## ④ 친구에게 안내한다
- 파일 경로와 크기 · manifest 의 주요 수(사람 수·행 수 — **이름·내용은 옮기지 않는다**).
- **「외장 디스크나 교회 드라이브로 옮겨 주세요. 이 PC 에는 몇 개만 남기고 지워도 됩니다.」** — 같은 PC 에만 있으면 PC 를 잃을 때 함께 잃는다.
- 사진까지 받았으면 그 사실도(파일이 크다).

## 되살릴 때
`docs/notes/backup.md` 「되살리기」 그대로 — 표 하나는 `data.sql` 의 그 `COPY` 덩어리만 꺼내 **임시 표에서 견준 뒤** 옮긴다. 운영에 바로 붓지 않는다.
⚠️ **개발 DB 에 되살리지 않는다** — 개발에는 가짜 사람만 둔다는 원칙. 연습은 버릴 곳(새 프로젝트·로컬 Postgres)에서.

## 하지 않는 것
- 암호를 화면·로그·커밋 메시지에 찍기 · 7z 나 평문을 저장소·스크래치에 남기기 · 백업을 받았다고 운영 작업의 개발 먼저 차례를 건너뛰기.
