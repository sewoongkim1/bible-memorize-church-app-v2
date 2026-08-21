-- 필사 신청 알림 받을 담당자 지정 (2026-08-21)
--
-- 성도가 「✍️ 성경필사 노트 신청」을 넣거나 고치면, 여기 적힌 분들의 폰으로
-- Web Push가 한 번 갑니다. 알림을 켜 두지 않은 분에게는 가지 않습니다.
--
-- 왜 코드가 아니라 여기에 두나:
--   이 저장소는 공개입니다. 담당자의 이름이나 user_id를 코드에 박으면 그대로
--   드러나고, 담당자가 바뀔 때마다 배포를 다시 해야 합니다.
--   app_config에 두면 이 SQL 한 번으로 바꿉니다.
--
-- ── 쓰는 법 ─────────────────────────────────────────────────
-- 아래 WHERE의 이름·교구·목장을 담당자에 맞게 고쳐 실행하세요.
-- 교회학교 소속이면 gu/mok 대신 bu/grade로 찾으면 됩니다.

insert into app_config (key, value, updated_at)
select 'pilsaAdmins',
       to_jsonb(array_agg(u.identity_key)),
       now()
  from users u
 where (u.name, u.gu, u.mok) in
       ( ('담당자이름', '교구이름', '목장번호')      -- 예: ('홍길동', '화평', '20')
       -- , ('두번째담당자', '교구이름', '목장번호')  -- 여러 명이면 줄을 늘리세요
       )
on conflict (key) do update
   set value = excluded.value, updated_at = now();

-- 확인 — 누가 등록됐는지, 그분이 알림을 켜 두었는지
select c.value as 등록된_identity_key,
       u.name, u.gu, u.mok,
       (select count(*) from push_subscriptions p where p.user_id = u.id) as 등록기기수
  from app_config c
  left join users u on u.identity_key = any (
        select jsonb_array_elements_text(c.value))
 where c.key = 'pilsaAdmins';

-- 끄려면(아무에게도 안 보내려면)
--   delete from app_config where key = 'pilsaAdmins';
