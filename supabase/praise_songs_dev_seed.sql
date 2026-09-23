-- 개발 DB 전용 — 찬양 아카이브 songs 표 + 시드 (2026-09-23)
--   ⚠️⚠️ **운영(xnomlgydifiqiybervtf)에 절대 돌리지 말 것.** 운영에는 songs 표가 이미 있고
--        1,700곡이 들어 있다. 이 파일은 개발(ktpwthwqzgcqcrmsafdo)에만 쓴다.
--
-- ■ 왜 필요한가
--   개발 프로젝트에는 songs 표가 아예 없다(REST 로 찔러 보면 PGRST205). 그래서 「오늘의 찬양」을
--   개발에서 확인할 수가 없다 — 단추에 곡명이 안 뜬다.
--
-- ■ 무엇이 들었나
--   찬양대·중창단 25곡 + 특별찬양 5곡(= 뽑혀야 하는 것)
--   + **일부러 섞은 걸러질 것 다섯** — 칸타타(12분 초과) · 찬양팀 · 곡명이 「찬양」 · 곡명=찬양대 이름 · hidden.
--   그래야 daily_song.sql 의 거르개가 실제로 도는지 개발에서 볼 수 있다.
--
-- ■ DDL 은 c:/Projects/praise-songs/supabase/schema.sql 을 그대로 베끼고,
--   운영에만 있는 두 칸(category_ordering·choir_ordering)을 더했다.

create table if not exists public.songs (
  id                text primary key,
  song              text not null,
  choir             text,
  category          text,
  svc_date          date,
  duration          text,
  duration_sec      int default 0,
  views             int default 0,
  thumbnail         text,
  is_full           boolean not null default false,
  hidden            boolean not null default false,
  category_ordering int,
  choir_ordering    int,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_songs_date     on public.songs(svc_date desc);
create index if not exists idx_songs_category on public.songs(category);

-- ⚠️ 표를 만들면 그 자리에서 RLS 를 켠다(운영 schema.sql 과 같다).
alter table public.songs enable row level security;

insert into public.songs (id, song, choir, category, svc_date, duration, duration_sec, thumbnail, is_full, hidden) values
  ('YkJgzSWSo2I', '나 드리리', '가브리엘찬양대', '찬양대', '2026-07-05', '4:13', 253, 'https://i.ytimg.com/vi/YkJgzSWSo2I/hqdefault.jpg', false, true),
  ('VN4lyBUGPDU', '나', '시온찬양대', '찬양대', '2026-07-05', '5:26', 326, 'https://i.ytimg.com/vi/VN4lyBUGPDU/hqdefault.jpg', false, false),
  ('YzoAfs4SLHM', '감사 찬송', '임마누엘찬양대', '찬양대', '2026-07-05', '3:16', 196, 'https://i.ytimg.com/vi/YzoAfs4SLHM/hqdefault.jpg', false, false),
  ('mYEP1ZGpseY', '감사로 찬양 드리세', '할렐루야찬양대', '찬양대', '2026-07-05', '2:13', 133, 'https://i.ytimg.com/vi/mYEP1ZGpseY/hqdefault.jpg', false, false),
  ('jJuFfzzyXNQ', '주님 뜻대로', '가브리엘찬양대', '찬양대', '2026-06-28', '4:06', 246, 'https://i.ytimg.com/vi/jJuFfzzyXNQ/hqdefault.jpg', false, false),
  ('91EGx39J960', '주님을 노래해 할렐루야', '시온찬양대', '찬양대', '2026-06-28', '2:10', 130, 'https://i.ytimg.com/vi/91EGx39J960/hqdefault.jpg', false, false),
  ('WIGNr5brUQQ', '주 예수 이름 높이어', '임마누엘찬양대', '찬양대', '2026-06-28', '4:26', 266, 'https://i.ytimg.com/vi/WIGNr5brUQQ/hqdefault.jpg', false, false),
  ('07UQafz56rA', '나는 죽고 내 안에 그리스도만', '할렐루야찬양대', '찬양대', '2026-06-28', '4:06', 246, 'https://i.ytimg.com/vi/07UQafz56rA/hqdefault.jpg', false, false),
  ('R-fe_nZ0Gng', '사명', '실로암찬양대', '찬양대', '2026-06-21', '4:52', 292, 'https://i.ytimg.com/vi/R-fe_nZ0Gng/hqdefault.jpg', false, false),
  ('ulEW4IRkC6o', '주만 경외하라', '가브리엘찬양대', '찬양대', '2026-06-21', '4:51', 291, 'https://i.ytimg.com/vi/ulEW4IRkC6o/hqdefault.jpg', false, false),
  ('bhuBbR6A4nA', '주께로 행진하세', '시온찬양대', '찬양대', '2026-06-21', '2:52', 172, 'https://i.ytimg.com/vi/bhuBbR6A4nA/hqdefault.jpg', false, false),
  ('JOvTCJyG0cQ', '섬김', '임마누엘찬양대', '찬양대', '2026-06-21', '4:39', 279, 'https://i.ytimg.com/vi/JOvTCJyG0cQ/hqdefault.jpg', false, false),
  ('vGuTRen2e1g', '사랑', '할렐루야찬양대', '찬양대', '2026-06-21', '3:53', 233, 'https://i.ytimg.com/vi/vGuTRen2e1g/hqdefault.jpg', false, false),
  ('bz1mj00Ok9o', '눈을 열어', '가브리엘찬양대', '찬양대', '2026-06-14', '4:06', 246, 'https://i.ytimg.com/vi/bz1mj00Ok9o/hqdefault.jpg', false, false),
  ('U5UX2yDtMTA', '그 사랑', '시온찬양대', '찬양대', '2026-06-14', '4:20', 260, 'https://i.ytimg.com/vi/U5UX2yDtMTA/hqdefault.jpg', false, false),
  ('I4CkzeHxa4c', '주 영광 선포하라', '임마누엘찬양대', '찬양대', '2026-06-14', '2:47', 167, 'https://i.ytimg.com/vi/I4CkzeHxa4c/hqdefault.jpg', false, false),
  ('oW-4392-uAY', '누가 우리를', '할렐루야찬양대', '찬양대', '2026-06-14', '4:02', 242, 'https://i.ytimg.com/vi/oW-4392-uAY/hqdefault.jpg', false, false),
  ('q6YFk6jRlNQ', '에수님 안에서', '가브리엘찬양대', '찬양대', '2026-06-07', '3:15', 195, 'https://i.ytimg.com/vi/q6YFk6jRlNQ/hqdefault.jpg', false, false),
  ('TLRikH9V_8w', '그런 나라가 되게 하소서', '시온찬양대', '찬양대', '2026-06-07', '4:40', 280, 'https://i.ytimg.com/vi/TLRikH9V_8w/hqdefault.jpg', false, false),
  ('bDjkVtf6KO8', '나는 예배자입니다', '임마누엘찬양대', '찬양대', '2026-06-07', '4:18', 258, 'https://i.ytimg.com/vi/bDjkVtf6KO8/hqdefault.jpg', false, false),
  ('ee8OJpjUUqA', '하늘 가는 밝은 길이', '할렐루야찬양대', '찬양대', '2026-06-07', '3:48', 228, 'https://i.ytimg.com/vi/ee8OJpjUUqA/hqdefault.jpg', false, false),
  ('42OfoEJSEOM', '놀라운 주님의 사랑', '가브리엘찬양대', '찬양대', '2026-05-31', '5:16', 316, 'https://i.ytimg.com/vi/42OfoEJSEOM/hqdefault.jpg', false, false),
  ('g372WZfTtGA', '주기도', '시온찬양대', '찬양대', '2026-05-31', '4:26', 266, 'https://i.ytimg.com/vi/g372WZfTtGA/hqdefault.jpg', false, false),
  ('_M_E4Fehxqw', '온 천하 만물 우러러', '임마누엘찬양대', '찬양대', '2026-05-31', '3:06', 186, 'https://i.ytimg.com/vi/_M_E4Fehxqw/hqdefault.jpg', false, false),
  ('7P-NulXRN0I', '내 간절한 소원', '할렐루야찬양대', '찬양대', '2026-05-31', '4:33', 273, 'https://i.ytimg.com/vi/7P-NulXRN0I/hqdefault.jpg', false, false),
  ('n6FFoxRN6tM', '아주 먼 옛날', '특송·특별찬양', '특별찬양', '2026-07-05', '3:42', 222, 'https://i.ytimg.com/vi/n6FFoxRN6tM/hqdefault.jpg', false, false),
  ('gxgcfzBaXOM', '아무것도 두려워 말라', '특송·특별찬양', '특별찬양', '2026-06-01', '3:41', 221, 'https://i.ytimg.com/vi/gxgcfzBaXOM/hqdefault.jpg', false, false),
  ('ZqX2P_1tFz4', '십자가를 질 수 있나', '특송·특별찬양', '특별찬양', '2026-05-01', '3:24', 204, 'https://i.ytimg.com/vi/ZqX2P_1tFz4/hqdefault.jpg', false, false),
  ('0Eoezc5Kvuc', '순종하는 삶', '특송·특별찬양', '특별찬양', '2026-03-20', '3:11', 191, 'https://i.ytimg.com/vi/0Eoezc5Kvuc/hqdefault.jpg', false, false),
  ('Z1pgvAAKU_o', '하나님 당신의 마음이 있는곳에', '특송·특별찬양', '특별찬양', '2026-03-15', '3:29', 209, 'https://i.ytimg.com/vi/Z1pgvAAKU_o/hqdefault.jpg', false, false),
  ('it95ORA64G4', '시온찬양대 칸타타', '시온찬양대', '찬양대', '2025-12-25', '25:32', 1532, 'https://i.ytimg.com/vi/it95ORA64G4/hqdefault.jpg', false, false),
  ('48f5xrjmLHk', '새 힘 얻으리', '기타찬양', '찬양팀', '2026-05-05', '5:32', 332, 'https://i.ytimg.com/vi/48f5xrjmLHk/hqdefault.jpg', false, false),
  ('GWb1yRkn-Io', '찬양', '기타찬양', '특별찬양', '2026-07-05', '4:48', 288, 'https://i.ytimg.com/vi/GWb1yRkn-Io/hqdefault.jpg', false, false),
  ('ZngqB1D69RQ', '임마누엘찬양대', '임마누엘찬양대', '찬양대', '2025-09-14', '10:13', 613, 'https://i.ytimg.com/vi/ZngqB1D69RQ/hqdefault.jpg', false, false)
on conflict (id) do nothing;

notify pgrst, 'reload schema';
