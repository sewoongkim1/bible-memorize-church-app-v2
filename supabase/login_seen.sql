-- 로그인 횟수 제한의 장부 (2026-10-08 · 보안 점검)
--
-- ■ 왜
--   login 은 이름·소속만 받아 user_id 를 돌려준다. 그 이름·소속은 순위·게시판에 그대로 보인다.
--   한 접속 주소에서 하루에 로그인할 수 있는 「서로 다른 계정」 수를 묶어, 명단을 통째로 넣어
--   모든 분의 user_id 를 긁어 가는 것을 막는다(api `loginLimitError`).
--
-- ■ 무엇을 담나 — **접속 주소도 이름도 그대로 두지 않는다**
--   addr_hash   접속 주소를 날짜와 함께 바꾼 값(HMAC). 날짜가 섞여 어제와 오늘의 같은 주소를 이을 수 없다
--   day         한국 날짜
--   ident_hash  로그인한 계정(구분·소속·이름)을 같은 방식으로 바꾼 값
--   이틀 지난 줄은 api 가 지운다.
--
-- ■ 켜는 법 — 이 표만으로는 아무 일도 없다. app_config `loginLimit` 이 있어야 돈다:
--     insert into public.app_config(key, value) values ('loginLimit', '{"perDay": 5, "allow": []}')
--       on conflict (key) do update set value = excluded.value, updated_at = now();
--   ⚠️ 켜기 전에 docs/notes/security-check.md 「로그인 횟수 제한」의 둘(교회 와이파이 · 개인정보 안내)을 볼 것.
--
-- ⚠️ user_id 칸을 두지 않는다 — 기록 합치기(member_merge.sql)가 모르는 표의 user_id 를 보면 멈춘다.
-- 개발 → 운영 순으로 실행. 여러 번 돌려도 된다.

create table if not exists public.login_seen (
  addr_hash   text not null,
  day         date not null,
  ident_hash  text not null,
  created_at  timestamptz not null default now(),
  primary key (addr_hash, day, ident_hash)
);
create index if not exists login_seen_day on public.login_seen (day);

alter table public.login_seen enable row level security;
revoke all on public.login_seen from public, anon, authenticated;
grant select, insert, update, delete on public.login_seen to service_role;
