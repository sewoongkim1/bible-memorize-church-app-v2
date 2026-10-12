# 백업 — 운영 DB·Storage 를 암호화해 한 파일로 (2026-10-12)

> **언제 읽나:** 백업을 돌릴 때 · 되살려야 할 때 · `tools/backup-db.py` 를 고칠 때

## 왜 따로 받나
- 운영(Pro)의 자동 백업은 **매일 한 번(새벽 3:54 KST 무렵) · 7일**이다(`supabase backups list --project-ref xnomlgydifiqiybervtf`). 시점 복구(PITR)는 꺼져 있다.
- 자동 백업은 **프로젝트 통째로만** 되돌린다 — 표 하나를 살리려고 되돌리면 그 사이 다섯 앱(암송·찬양·말씀·어드민·MCP)의 기록이 함께 사라지고, 되돌리는 동안 접속이 끊긴다.
- **Storage 파일은 자동 백업에 없다**(공식 문서: DB 에는 파일의 정보만 있다). `newfamily`(새가족 카드)·`board`(게시판 사진)·`verse-img` 는 지금 유일본이다.
  교인 사진 `church-people-photos` 는 원본이 dimode·`C:\Projects\교인명부_작업\` 에도 있어 `--with-photos` 일 때만 받는다.

## 돌리기
```bash
python tools/backup-db.py --prod                  # → C:\Projects\백업\gocheok-prod-YYYY-MM-DD-HHMM.7z
python tools/backup-db.py --prod --with-photos    # 교인 사진까지(크다)
python tools/backup-db.py --dev                   # 개발(가짜) — 흐름 시험
```
준비: 7-Zip(`C:\Program Files\7-Zip`) · PostgreSQL 클라이언트(pg_dump 18) · 암호 파일 `~/.gocheok-backup/pass`(첫 줄) · Supabase CLI 로그인.
**DB 비밀번호는 필요 없다** — CLI 가 그때그때 임시 로그인 역할(`cli_login_postgres`)을 만든다. 그래서 CLI 가 로그인된 이 PC 에서만 돈다.
Docker 도 필요 없다 — CLI 의 `--dry-run` 스크립트를 이 PC 의 pg_dump 로 돌린다.

안에 드는 것: `roles.sql` · `schema.sql` · `data.sql`(public·auth·storage 메타) · `cron-jobs.json`(운영만) · `storage/<버킷>/` · `manifest.txt`(주요 표 행 수 — 되살린 뒤 견줄 기준).

## ⚠️ 지킬 것
- **교인명부가 들어 있다**(어느 교회 교인인가 = 종교 = 개인정보보호법의 민감정보). 7z 는 AES-256 · 파일 이름까지 숨긴다(`-mhe=on`). 평문 폴더는 끝나면 지운다.
- **암호는 저장소·대화·스크립트 어디에도 적지 않는다.** 비밀번호 관리자 + `~/.gocheok-backup/pass`. **잃으면 백업도 잃는다 — 두 사람이 알 것**(교회 명의로 옮길 때 정하는 공동 관리자).
- 보관 폴더를 저장소 안으로 주면 스크립트가 멈춘다(저장소는 공개다).
- **개발 DB 에 되살리지 말 것** — 개발에는 가짜 사람만 둔다는 원칙. 되살리기 연습은 버릴 곳(새 프로젝트·로컬 Postgres)에서.

## 되살리기
1. 7-Zip 으로 연다(암호).
2. 표 하나만 살릴 때: `data.sql` 에서 그 표의 `COPY "public"."표" … FROM stdin;` ~ `\.` 덩어리만 꺼내 임시 표에 넣고 비교한 뒤 옮긴다. **운영에 바로 붓지 말 것.**
3. 통째로(새 프로젝트에):
   ```bash
   psql --single-transaction --variable ON_ERROR_STOP=1 \
     --file roles.sql --file schema.sql \
     --command 'SET session_replication_role = replica' \
     --file data.sql --dbname "<새 프로젝트 연결 주소>"
   ```
   `admin_members` 에 순환 외래키 경고가 찍히는데, 위 `session_replication_role = replica` 가 그 때문이다.
4. Storage: `supabase storage cp -r storage/<버킷> ss:///<버킷> --experimental --linked`(새 프로젝트에 link 한 폴더에서).
5. 크론: `cron-jobs.json` 의 `command` 를 보고 다시 건다(Vault 의 값은 새 프로젝트에서 다시 넣어야 한다 — 백업의 Vault 는 그 프로젝트의 키로만 풀린다).
6. `manifest.txt` 의 행 수와 견준다.

## 함정(만들며 겪은 것)
- 윈도 pg_dump 는 CLI 스크립트의 줄인 옵션 `--quote-all-identifier` 를 못 알아듣는다 → 스크립트가 `…identifiers` 로 바꿔 돌린다.
- `supabase storage cp` 의 받을 곳을 `C:\…` 절대 경로로 주면 「Unsupported operation」 — 상대 경로 + `--workdir`.
- 파이썬에서 `supabase` 는 이름만으로 못 부른다(`supabase.CMD`) — `shutil.which` 로 전체 경로.
- pg_dump 의 한국어 메시지는 CP949 로 나와 깨진다 → `LC_ALL=C`.
