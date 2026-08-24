-- 배부가 끝난 필사 신청의 휴대폰 번호를 지운다 (2026-08-24)
--
-- 개인정보 안내(gocheok.onlybible.kr/privacy/)에 「성경필사 노트 신청의 휴대폰 번호는
-- 배부가 끝나면 지웁니다」라고 적었다. 적어 두는 것만으로는 약속이 지켜지지 않으니
-- 이미 배부가 끝난 건을 여기서 한 번 정리한다.
--
-- 앞으로는 서버가 알아서 지운다 — pilsaSetStatus가 '배부완료'로 바꿀 때 phone을 비운다.
-- 그래서 이 파일은 '지금까지 쌓인 것'을 위한 한 번짜리다.
--
-- ⚠️ 되돌릴 수 없다. 지운 번호는 성도님께 다시 물어보는 수밖에 없다.
--    그래서 배부완료 건만 건드린다 — 신청완료·준비중·준비완료 건은 담당자가
--    아직 연락할 일이 남아 있다.
--
-- Supabase → SQL Editor 에 붙여 넣고 세 블록을 차례로 실행한다.

-- 1) 지우기 전 — 무엇이 얼마나 있는지 눈으로 확인한다
select status                        as 상태,
       count(*)                      as 건수,
       count(nullif(phone, ''))      as 번호_있음
from public.pilsa_orders
group by status
order by status;

-- 2) 배부완료 건만 지운다
update public.pilsa_orders
   set phone = '', updated_at = now()
 where status = '배부완료'
   and phone <> '';

-- 3) 지운 뒤 — 배부완료의 '번호_있음'이 0이 되어야 한다
select status                        as 상태,
       count(*)                      as 건수,
       count(nullif(phone, ''))      as 번호_있음
from public.pilsa_orders
group by status
order by status;
