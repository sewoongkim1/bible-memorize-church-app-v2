-- 시편 말씀 액자 — 표 확장 + 구절 시드
-- tools/psalm-fit.py 가 만든 파일이다. 손으로 고치지 말고 엑셀을 고쳐 다시 돌린다.
-- 만든 날 2026-09-10 · 구절 10편 · 1일차 2026-09-21(월)
--
-- ⚠️ 개발 DB(ktpwthwqzgcqcrmsafdo)에서 먼저 돌린 뒤 운영(xnomlgydifiqiybervtf).
-- ⚠️ 여러 번 돌려도 안전하다(on conflict do update).

-- ① 표 확장 --------------------------------------------------------
alter table public.verses
  add column if not exists track     text not null default 'weekly',  -- 'weekly' | 'psalm'
  add column if not exists day_no    int,        -- 1~180 · 열리는 순서
  add column if not exists frame_art smallint;   -- 1~12 · 액자 그림(구절마다 고정)

create index if not exists idx_verses_track on public.verses(track, day_no);

-- 기존 35구절이 'weekly' 인지 확인(default 가 들어갔으므로 이미 그렇다)
update public.verses set track = 'weekly' where track is null;

-- ② 시작일 ----------------------------------------------------------
-- ⚠️ app_config.value 는 jsonb 다. ministry 설정과 같이 키 하나에 객체를 담는다.
insert into public.app_config (key, value)
  values ('psalm', '{"start":"2026-09-21","totalDays":180}'::jsonb)
  on conflict (key) do update set value = excluded.value, updated_at = now();

-- ③ 구절 --------------------------------------------------------------
insert into public.verses (no, track, day_no, frame_art, ref, ref_short, ref_full, text, week, is_active)
values
  (1001, 'psalm', 1, 1, '시 1:1', '시 1:1', '시편 1편 1절', '복 있는 사람은 악인들의 꾀를 따르지 아니하며 죄인들의 길에 서지 아니하며 오만한 자들의 자리에 앉지 아니하고', null, true),
  (1002, 'psalm', 2, 2, '시 1:2', '시 1:2', '시편 1편 2절', '오직 여호와의 율법을 즐거워하여 그의 율법을 주야로 묵상하는도다', null, true),
  (1003, 'psalm', 3, 3, '시 1:3', '시 1:3', '시편 1편 3절', '그는 시냇가에 심은 나무가 철을 따라 열매를 맺으며 그 잎사귀가 마르지 아니함 같으니 그가 하는 모든 일이 다 형통하리로다', null, true),
  (1004, 'psalm', 4, 4, '시 3:3', '시 3:3', '시편 3편 3절', '여호와여 주는 나의 방패시요 나의 영광이시요 나의 머리를 드시는 자이시니이다', null, true),
  (1005, 'psalm', 5, 5, '시 3:6', '시 3:6', '시편 3편 6절', '천만인이 나를 에워싸 진 친다 하여도 나는 두려워하지 아니하리이다', null, true),
  (1006, 'psalm', 6, 6, '시 3:7', '시 3:7', '시편 3편 7절', '주께서 내 마음에 두신 기쁨은 그들의 곡식과 새 포도주가 풍성할 때보다 더하니이다', null, true),
  (1007, 'psalm', 7, 7, '시 5:12', '시 5:12', '시편 5편 12절', '여호와여 주는 의인에게 복을 주시고 방패로 함 같이 은혜로 그를 호위하시리이다', null, true),
  (1008, 'psalm', 8, 8, '시 7:17', '시 7:17', '시편 7편 17절', '내가 여호와께 그의 의를 따라 감사함이여 지존하신 여호와의 이름을 찬양하리로다', null, true),
  (1009, 'psalm', 9, 9, '시 8:1', '시 8:1', '시편 8편 1절', '여호와 우리 주여 주의 이름이 온 땅에 어찌 그리 아름다운지요', null, true),
  (1010, 'psalm', 10, 10, '시 11:7', '시 11:7', '시편 11편 7절', '여호와는 의로우사 의로운 일을 좋아하시나니 정직한 자는 그의 얼굴을 뵈오리로다', null, true)
on conflict (no) do update set
  track = excluded.track, day_no = excluded.day_no, frame_art = excluded.frame_art,
  ref = excluded.ref, ref_short = excluded.ref_short, ref_full = excluded.ref_full,
  text = excluded.text, is_active = excluded.is_active;

-- ④ 확인 ------------------------------------------------------------
-- 편수·번호대·오늘 열린 수가 맞는지 본다
select track, count(*) as 편수, min(no) as 첫번호, max(no) as 끝번호,
       min(day_no) as 첫날, max(day_no) as 끝날
  from public.verses group by track order by track;

-- 오늘 몇 편이 열려 있어야 하는가(서버가 계산하는 것과 같은 식)
select greatest(0, least(180,
       ((now() at time zone 'Asia/Seoul')::date - date '2026-09-21') + 1)) as 오늘_열린_편수;

