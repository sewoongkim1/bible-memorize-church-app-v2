-- 사역신청 — 휴대폰 뒷 4자리 (2026-09-08)
-- ⚠️ 이 저장소는 공개(public)입니다 — 비밀번호·키를 절대 넣지 마세요.
-- ⚠️ **개발 DB(ktpwthwqzgcqcrmsafdo)에 먼저** 돌린 뒤 운영에 올린다.
--
-- 왜 받나 — 두 가지다.
--   ① **최소 본인 확인.** 이 앱은 비밀번호가 없다(교구·목장·이름으로 로그인).
--      신청을 고치거나 취소할 때 이 4자리를 다시 받아 맞는지 본다.
--      완전한 인증은 아니지만, 남이 우연히 남의 신청을 건드리는 일은 막는다.
--   ② **교적 대조.** 담당자가 신청자 명단을 교적과 맞대 볼 때 쓴다.
--      ⚠️ 앱은 교적을 모른다 — 자동으로 맞춰 보지 못한다. 사람이 본다.
--
-- ⚠️ 뒷 4자리만 받는다. 번호 전체를 받지 않는 것은 그것으로 충분하고,
--    적게 가질수록 지킬 것도 적기 때문이다(개인정보 안내 /privacy/ 에 함께 적었다).

alter table public.ministry_orders
  add column if not exists phone4 text;

-- 숫자 4자리만 — 빈 값(옛 행)은 그대로 둔다
alter table public.ministry_orders drop constraint if exists ministry_orders_phone4_chk;
alter table public.ministry_orders add constraint ministry_orders_phone4_chk
  check (phone4 is null or phone4 ~ '^[0-9]{4}$');

-- 확인
--   select id, name, phone4, status from ministry_orders where year = 2027;
