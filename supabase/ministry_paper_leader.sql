-- 사역신청 — ① 종이(오프라인) 신청 표시 ② 사역마다 담당자 한 줄 (2026-09-18)
-- ⚠️ 이 저장소는 공개(public)입니다 — 비밀번호·키를 절대 넣지 마세요.
-- ⚠️ **개발 DB(ktpwthwqzgcqcrmsafdo)에 먼저** 돌린 뒤 운영(xnomlgydifiqiybervtf)에 올린다.
-- ⚠️ **이 SQL 이 먼저, 코드가 나중이다.** 새 칸을 읽고 쓰는 코드를 먼저 올리면
--    칸이 없는 DB 에서 사역 목록 조회가 통째로 실패한다(성도님 화면이 빈다).

-- ── 1) 종이로 받은 신청 표시 ────────────────────────────────────────
-- 왜 받나: 12월 신청은 앱과 종이가 섞인다. 담당자가 화면에서 가려 보고,
--          나중에 「앱 몇 건·종이 몇 건」을 셀 수 있어야 한다(성도님 결정 2026-09-18).
-- ⚠️ 종이 건은 **앱 알림이 가지 않는다**(그분이 앱을 안 쓰실 수 있다) — 임명 안내는
--    담당자가 따로 한다. 화면이 그 사실을 말해 주어야 해서 표시가 필요하다.
alter table public.ministry_orders
  add column if not exists source text not null default 'app';

alter table public.ministry_orders drop constraint if exists ministry_orders_source_chk;
alter table public.ministry_orders add constraint ministry_orders_source_chk
  check (source in ('app', 'paper'));

comment on column public.ministry_orders.source is
  'app = 성도님이 앱에서 낸 신청 · paper = 담당자가 종이 신청을 대신 넣은 것';

-- ── 2) 사역마다 담당자 한 줄 ───────────────────────────────────────
-- 왜 받나: 「궁금하면 누구에게 물어야 하나」가 신청 전 가장 큰 물음이다(종이 양식에도
--          문의처 칸을 둔 것과 같은 까닭). 화면에서는 「섬기는 분」 **위**에 보인다.
-- ⚠️ 그냥 글자다(성도님 결정 2026-09-18) — 계정과 잇지 않는다. 담당자가 교체되면
--    관리자 화면에서 고쳐 쓰면 된다.
--    예)  김세웅 안수집사 (010-1234-5678)
alter table public.ministry_catalog
  add column if not exists leader_note text;

comment on column public.ministry_catalog.leader_note is
  '사역 담당자(문의처) — 관리자가 손으로 넣는 한 줄. 화면에서 「섬기는 분」 위에 보인다';

-- 확인
--   select source, count(*) from ministry_orders where year = 2027 group by source;
--   select id, committee, team, leader_note from ministry_catalog where year = 2027 limit 5;
