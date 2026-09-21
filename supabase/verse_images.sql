-- 말씀 연상 그림(설교·찬양 담당자 · 2026-09-21)
-- 설계: docs/superpowers/specs/2026-09-21-verse-image-staff-design.md 4장
-- ⚠️ 개발(ktpwthwqzgcqcrmsafdo) 먼저. 운영(xnomlgydifiqiybervtf)은 2026-09-27 안드로이드 심사가 끝난 뒤.
-- 새 표에 새 액션만 얹는다 — 표가 먼저, 함수가 나중. (getVerses 는 표가 없어도 살아남게 짰다)

-- 1) 저장한 그림 — 구절 × 칸(a 대표 · b 넓은 · c 가까운) 하나씩
create table if not exists public.verse_images (
  verse_no    int  not null,
  slot        text not null check (slot in ('a','b','c')),
  path        text not null,               -- 저장소 verse-img 안의 이름(바꿀 때마다 새 이름)
  alt         text not null,               -- 그림 설명 = alt(낭독기가 읽는다) — 실제 그림을 보고 적은 것
  scene_ko    text,                        -- 담당자가 고른 우리말 장면
  scene_en    text,                        -- 서버가 만든 영어 한 줄(프롬프트 기록 — 옛 prompts.md 대신)
  hidden      boolean not null default false,   -- 「내리기」
  created_by  text,                        -- 「소속 이름」 보이기용 — user_id 아님
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (verse_no, slot)
);
alter table public.verse_images enable row level security;
revoke all on public.verse_images from anon, authenticated;

-- 2) 뽑은 기록 — 한 구절 하루 15장을 센다(성공한 것만)
create table if not exists public.verse_image_gens (
  id          bigint generated always as identity primary key,
  verse_no    int  not null,
  slot        text not null,
  created_by  text,
  created_at  timestamptz not null default now()
);
create index if not exists verse_image_gens_verse_idx on public.verse_image_gens (verse_no, created_at desc);
alter table public.verse_image_gens enable row level security;
revoke all on public.verse_image_gens from anon, authenticated;

-- 3) 그림 통 — 읽기는 공개, 쓰기는 서버(service_role)만(board_images.sql 과 같은 방식)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('verse-img', 'verse-img', true, 524288, array['image/webp','image/jpeg'])
on conflict (id) do update
   set public = true, file_size_limit = 524288, allowed_mime_types = array['image/webp','image/jpeg'];

-- 4) 확인
select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'verse-img';
