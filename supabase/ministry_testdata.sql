-- 사역신청 테스트 데이터 — **개발 DB 전용**
-- ⚠️⚠️ **운영(xnomlgydifiqiybervtf)에서 절대 실행하지 말 것.**
--   가짜 성도와 가짜 신청이 들어가고, 신청 기간까지 열어 버린다.
--   개발 DB는 ktpwthwqzgcqcrmsafdo 다(supabase/dev-setup.md).
--
-- 순서: ministry.sql → ministry_seed_2027.sql → 이 파일
--
-- 왜 필요한가: 부서 확인 회신은 아직이고 신청 기간(12/13~12/27)도 멀었다.
-- 그 둘을 기다리면 백엔드를 한 줄도 확인할 수 없다. 그래서 개발 DB에서는
-- 기간을 열어 두고 시험 성도 한 명으로 흐름을 끝까지 돌려 본다.

-- ============================================================
-- 1) 개발에서는 신청 기간을 열어 둔다
--    ⚠️ 운영은 ministry.sql 의 12-13 ~ 12-27 이 맞다. 이 블록은 개발 전용.
-- ============================================================
insert into public.app_config (key, value)
values ('ministry', '{"year":2027,"open":"2026-01-01","close":"2027-12-31"}'::jsonb)
on conflict (key) do update set value = excluded.value, updated_at = now();

-- ============================================================
-- 2) 시험 성도 한 명
--    이름을 「테스트」로 시작하게 두어 통계·명단에서 바로 알아볼 수 있게 한다.
-- ============================================================
insert into public.users (type, gu, mok, name, identity_key)
values ('교구', '테스트', '1', '테스트성도', '교구|테스트|1|테스트성도')
on conflict (identity_key) do nothing;

-- ============================================================
-- 3) 시험 신청 — 제자양육부 신앙운동 한 팀
--    ⚠️ **한 행 = 한 팀** 이다(2026-09-09). 옛 choices 배열은 지워졌고,
--       유일 제약도 (year, user_id, team_id) 로 바뀌었다.
--    ⚠️ catalog id 는 bigserial 이라 미리 알 수 없다. 이름으로 찾아 넣는다.
-- ============================================================
insert into public.ministry_orders
  (year, user_id, name, who, position, phone4, team_id, committee, team, option, status)
select
  2027, u.id::text, u.name, '테스트 1목장', '집사', '0000',
  c.id, c.committee, c.team, '', '신청완료'
from public.users u
join public.ministry_catalog c
  on c.year = 2027
 and (c.committee, c.team) in (('제자양육부', '신앙운동'))
where u.identity_key = '교구|테스트|1|테스트성도'
on conflict (year, user_id, team_id) do update
  set position = excluded.position, phone4 = excluded.phone4, updated_at = now();

-- ============================================================
-- 확인
-- ============================================================
--   select count(*) from ministry_catalog where year = 2027;            -- 94
--   select o.status, o.committee, o.team, o.position, u.name
--     from ministry_orders o join users u on u.id::text = o.user_id
--    where o.year = 2027;
--   select key, value from app_config where key = 'ministry';

-- ============================================================
-- 치우기 — 시험이 끝나면 반드시 돌린다
--   ⚠️ 리허설로 넣은 시험 신청을 두면 첫날 숫자가 틀어진다(구현 계획 5단계).
-- ============================================================
-- delete from public.ministry_orders
--  where user_id in (select id::text from public.users where identity_key = '교구|테스트|1|테스트성도');
-- delete from public.users where identity_key = '교구|테스트|1|테스트성도';
