-- 사역신청 — 관리자 취소 상태 (2026-09-10)
-- ⚠️ 이 저장소는 공개(public)입니다 — 비밀번호·키를 절대 넣지 마세요.
-- ⚠️ **개발 DB(ktpwthwqzgcqcrmsafdo)에 먼저** 돌린 뒤 운영에 올린다.
--
-- 성도님 결정: 접수완료·임명확정된 뒤에는 **성도가 취소하지 못한다.**
-- 취소는 관리자가 한다. 관리자는 신청자가 아니라 **담당 부서장에게 오프라인으로**
-- 요청을 받아 처리하고, **사유를 적는다.** 그 사유는 **관리자만** 본다.
--
-- ⚠️ 행을 지우지 않고 「취소」 상태로 남긴다 — 지우면 사유도 함께 사라져
--    「왜 취소됐지」를 나중에 아무도 알 수 없다.
-- ⚠️ 취소는 **자리를 도로 내놓는다**(미채택과 같다). 안 그러면 취소당한 분이
--    다른 사역에 신청조차 못 하는 막다른 길이 된다.

alter table public.ministry_orders drop constraint if exists ministry_orders_status_chk;
alter table public.ministry_orders add constraint ministry_orders_status_chk
  check (status in ('신청완료', '접수완료', '임명확정', '미채택', '취소'));

-- note 는 **담당자 메모**다(취소 사유 포함). 성도 화면에는 절대 내보내지 않는다 —
-- 서버의 ministryRow 에서 뺐고, ministryList(관리자)에만 싣는다.
comment on column public.ministry_orders.note is
  '담당자 메모·취소 사유. 관리자 전용 — 성도 응답(ministryMine)에 실으면 안 된다.';

-- 확인
--   select team, status, note from ministry_orders where year = 2027;
