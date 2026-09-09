-- 사역신청 — 직분 받기 + 팀별 「지금 섬기는 분」 (2026-09-09)
-- ⚠️ 이 저장소는 공개(public)입니다 — 비밀번호·키를 절대 넣지 마세요.
-- ⚠️ **개발 DB(ktpwthwqzgcqcrmsafdo)에 먼저** 돌린 뒤 운영에 올린다.

-- ── 1) 신청서에 직분 ───────────────────────────────────────────────
-- 왜 받나: 담당자가 명단을 교적과 맞대 볼 때 이름만으로는 동명이인이 갈리지 않고,
--          임명 뒤 팀 명단을 「김세웅 안수집사」꼴로 적을 때 그대로 쓴다.
-- ⚠️ 값은 고른 것만 들어온다(서버 allowlist) — 자유 입력이면 「집사님」·「집사 」가
--    섞여 교적 대조가 도로 사람 손일이 된다.
alter table public.ministry_orders
  add column if not exists position text;

alter table public.ministry_orders drop constraint if exists ministry_orders_position_chk;
alter table public.ministry_orders add constraint ministry_orders_position_chk
  check (position is null or position in
    ('성도','집사','권사','안수집사','장로','전도사','목사','학생'));

-- ── 2) 팀마다 「지금 섬기는 분」 ─────────────────────────────────────
-- 왜 받나: 이름과 하는 일만으로는 「내가 낄 자리인가」가 안 그려진다.
--          아는 얼굴이 하나라도 보이면 신청 문턱이 확 낮아진다(성도님 요청 2026-09-09).
-- ⚠️ **관리자가 손으로 넣는다.** 이 앱은 교적·조직표를 갖고 있지 않다.
--    자동으로 채우려면 신청 결과를 쓸 수밖에 없는데, 그건 「올해 임명 결과」이지
--    「지금 섬기는 분」이 아니고, 확정 전 신청자를 남에게 보이는 일이 된다.
-- ⚠️ 한 줄에 한 분씩 적는다(줄바꿈은 <br> 로 저장된다).
--    예)  김세웅 안수집사 (화평-20)
alter table public.ministry_catalog
  add column if not exists members_note text;

-- 확인
--   select id, committee, team, members_note from ministry_catalog where year = 2027 limit 5;
--   select name, position, phone4, status from ministry_orders where year = 2027;
