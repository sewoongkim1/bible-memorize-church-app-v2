-- 교회 생활 — 교적과 안 맞은 분의 연락처 (2026-10-08 · Plan 5 · 설계 docs/superpowers/specs/2026-10-08-church-life-pin-design.md §5)
--
-- ■ 왜: 사역신청에서 번호를 걷는다. 교적과 이어진 분은 담당자가 교적에서 번호를 본다.
--    교적과 안 맞은 분(person_how='no')만 신청 저장 때 연락처를 한 번 남긴다 — 담당자가 연락할 길.
-- ■ 보관: 마지막으로 적은 날부터 180일(LIFE_CONTACT_DAYS). 사역신청 번호 규칙과 같다.
-- ⚠️ 어떤 응답에도 user_id 를 싣지 않는다. service_role 만 읽고 쓴다.
-- ⚠️ member_merge.sql 가 함께 안다 — 새것(updated_at 최신)을 남긴다.
-- 개발 → 운영 순으로 실행. 여러 번 돌려도 된다.

create table if not exists public.life_contacts (
  user_id    uuid primary key,
  phone      text not null,
  updated_at timestamptz not null default now()
);

alter table public.life_contacts enable row level security;
revoke all on public.life_contacts from public, anon, authenticated;
grant select, insert, update, delete on public.life_contacts to service_role;
