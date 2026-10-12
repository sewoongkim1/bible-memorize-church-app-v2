---
name: new-table
description: 성경암송 Supabase 에 새 표·뷰·함수(RPC)·storage 칸을 만들 때 그 자리에서 닫는다 — RLS 켜기 · anon·authenticated revoke · TO authenticated 금지 · 뷰 security_invoker · user_id 를 응답·뷰에 안 싣기 · 공개 키로 행이 안 오는지 · 교회 어드민 check-authenticated-exposure.sql 0행. "표 만들어줘", "새 테이블", "뷰 추가", "RPC 함수 추가", "storage 버킷", "create table" 같은 요청이나, 새 기능이 저장할 곳을 설계할 때 사용. 넣는 차례(개발 먼저·코드와의 순서)는 sql-migrate.
---

# 새 표 (new-table)

> 이 API 는 **JWT 가 없다**(`--no-verify-jwt`). 클라이언트가 준 `user_id` 를 그대로 믿으므로 **남의 `user_id` 하나면 그 사람 행세**가 된다.
> 공개 키는 앱 코드(`js/config.js`)에 있어 누구나 가진 것과 같다. 그래서 표는 **서버(service_role)만** 읽고 쓰게 닫아 둔다 — CLAUDE.md 「보안 · 새어 나가는 길」.

## ① 표를 만드는 그 줄 바로 아래에서 닫는다
```sql
create table if not exists public.xxx ( … );
alter table public.xxx enable row level security;
revoke all on public.xxx from public, anon, authenticated;
grant all on public.xxx to service_role;
revoke all on sequence public.xxx_id_seq from public, anon, authenticated;   -- identity/serial 이면
```
**왜:** 2026-08-25 `event_entries` 가 RLS 를 빠뜨려 `user_id` 47건이 공개 키로 읽혔다. Supabase 는 public 의 새 표마다 anon·authenticated 에 기본 GRANT 를 준다 — RLS 만 켜고 정책이 없으면 `[]` 가 오고, revoke 까지 하면 아예 401 이다. 둘 다 한다(`supabase/duty.sql` 177~185줄이 본보기).

## ② 정책은 만들지 않는다 — 특히 `TO authenticated`
- 앱은 `api`(service_role)를 거쳐서만 읽고 쓴다. 정책이 필요해 보이면 그 일을 `api` 액션으로 옮긴다.
- ⚠️ **2026-09-28 부터 운영에 카카오 로그인이 켜졌다(교회 어드민)** — `authenticated` = 카카오 계정만 있으면 누구나다. 표·뷰·함수·storage 정책을 `TO authenticated` 로 열지 않는다. revoke 는 `anon`·`authenticated` **둘 다**.

## ③ 뷰 · 함수 · storage
- **뷰:** `alter view public.v_xxx set (security_invoker = on);` + `revoke all on public.v_xxx from anon, authenticated;`
  **왜:** 뷰는 만든 사람(postgres) 권한으로 돌아 밑 표의 RLS 를 지나간다 — `v_ranking_all` 133행(user_id·이름·교구·목장)이 그렇게 열려 있었다(`supabase/security_close_public_views.sql`). 대시보드 표 목록의 **UNRESTRICTED** 표시가 그 뜻이다.
- **함수:** `security definer` 면 `set search_path = public` · 만든 뒤 `revoke all on function public.xxx(인자형) from public, anon, authenticated;` — 함수는 기본으로 public 에 EXECUTE 가 붙고, SECURITY DEFINER 는 표 권한을 건너뛴다(`duty.sql` 1451줄~).
- **storage:** 공개 칸(`public = true`)은 정책이 없어도 **주소만 알면 누구나** 연다 — 게시판 사진(`board`)·연상 그림(`verse-img`)처럼 공개해도 되는 것만(`supabase/board_images.sql`·`verse_images.sql`). 새가족 카드·교인 사진 같은 개인정보는 비공개 칸 + 쓰기 정책 없음(⑥의 점검 ⑦이 교인 사진 칸을 본다). 공개 칸에 올릴 사진은 EXIF GPS 를 지운다(`docs/notes/board.md`).

## ④ `user_id` 는 어디에도 싣지 않는다
- 응답(목록·순위·게시판) · 뷰 · 로그 · 알림 글 · 내려받기 파일 어디에도. 남을 가리켜야 하면 그 표의 행 번호나 화면용 키를 쓴다.
  **왜:** `user_id` 가 곧 신원이다 — 순위 응원이 응답에 `user_id` 를 실을 뻔했다(`docs/notes/ranking-cheer.md`). 게시판도 `user_id` 미노출이 규칙이다.
- `user_id` 칸이 있는 표면 `supabase/member_merge.sql` 의 네 자리를 함께(스킬 `sql-migrate` ③).
- 값 목록 칸이면 CHECK 를 화면·서버와 같은 목록으로(세 곳 — `sql-migrate` ④).

## ⑤ 공개 키로 찔러 본다 — 개발 먼저, 운영도
```bash
curl -s -w "\nHTTP %{http_code}\n" "https://ktpwthwqzgcqcrmsafdo.supabase.co/rest/v1/xxx?select=*&limit=1" \
  -H "apikey: <js/config.js 의 개발 ANON>"
```
- 기대: `HTTP 401` · `"code":"42501" … permission denied for table xxx`(revoke 까지 됨).
- `[]` + `HTTP 200` 이면 RLS 만 켜진 것이다 — 막힌 것은 맞지만 **「빈 응답」은 「막혔다」의 증거가 아니다**(표가 비어 있어도 `[]`). revoke 를 빠뜨렸는지 본다.
- 행이 오면 열려 있는 것이다 → 바로 닫는다(개발 → 운영). 운영은 같은 줄을 `xnomlgydifiqiybervtf` 와 운영 ANON 으로.

## ⑥ 로그인한 쪽만 더 할 수 있는 것이 없나 — 0행
```bash
supabase --workdir "<운영 link 폴더>" db query --linked -f C:/Projects/church-admin/supabase/sql/check-authenticated-exposure.sql
```
**0행**이어야 한다(일곱 가지 — 로그인 전용 정책 · auth 로 가르는 정책 · authenticated 만 가진 권한·함수 · 교인 사진 칸 공개 …). link 폴더 만드는 법은 스킬 `sql-migrate` ⑤ — `supabase/.temp` 복사 금지. `-f` 는 절대 경로.
덤으로 `python tools/security-check.py --only AE` — A(공개 키로 행이 오나)·E(RLS 없는 표·revoke 없는 뷰·`to authenticated`·revoke 없는 DEFINER — SQL 파일 기준). 결과는 저장소 밖 `C:\Projects\보안점검\결과\` 에 쌓인다(저장소에 넣지 말 것).

## 하지 않는 것
- 「나중에 RLS 켜지」 · 정책으로 공개 키에 읽기를 열어 주기 · 개발에서 막혔다고 운영 확인을 건너뛰기 · 점검 결과 파일을 저장소에.
