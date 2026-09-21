-- ⚠️ 개발(ktpwthwqzgcqcrmsafdo) 전용 — 운영에서 돌리지 말 것(운영엔 이미 있다).
-- 운영 sermons 는 gocheok-sermons/supabase/schema.sql 뒤에 칸이 더해졌다 — api 의 toRow 가 쓰는 칸을 모두 넣는다.
create table if not exists public.sermons (
  id text primary key, title text not null, svc_date date,
  category text not null default '주일설교', preacher text default '차동혁 위임목사',
  scripture text, summary text, conclusion text,
  points jsonb default '[]'::jsonb, key_verse jsonb,
  questions jsonb default '[]'::jsonb, tags jsonb default '[]'::jsonb,
  daily_meditations jsonb default '[]'::jsonb,
  easy_explain text, memory_tip text,
  audio_script text, audio text,
  mem_verse_no int, mem_ref text, mem_text text,
  hidden boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.sermons enable row level security;
revoke all on public.sermons from anon, authenticated;

create extension if not exists vector with schema extensions;
create table if not exists public.sermon_chunks (
  id uuid primary key default gen_random_uuid(),
  sermon_id text not null, chunk_index integer not null default 0, content text not null,
  embedding extensions.vector(1024) not null,
  title text not null, svc_date date, scripture text, youtube_id text not null,
  created_at timestamptz not null default now()
);
create index if not exists sermon_chunks_sermon_idx on public.sermon_chunks (sermon_id);
alter table public.sermon_chunks enable row level security;
revoke all on public.sermon_chunks from anon, authenticated;
