-- 사역신청 — 한 행 = 한 팀 으로 편다 (2026-09-09)
-- ⚠️ 이 저장소는 공개(public)입니다 — 비밀번호·키를 절대 넣지 마세요.
-- ⚠️ **개발 DB(ktpwthwqzgcqcrmsafdo)에 먼저** 돌린 뒤 운영에 올린다.
--
-- 왜 바꾸나 — 성도님이 요구한 세 가지가 모두 「팀마다 따로」를 가리킨다(2026-09-09).
--   ① 담당자가 **접수완료**하면 그 팀 명단에 이름이 보인다
--   ② **접수완료 전까지만** 성도가 고칠 수 있다
--   ③ 접수완료된 뒤에도 **3개가 안 찼으면 또 신청**할 수 있다
-- 전에는 한 사람이 한 행이고 고른 팀 셋이 choices 배열에 들어 있었다. 그러면
-- ①은 세 팀에 한꺼번에만 올릴 수 있고(부서마다 따로 접수하지 못한다),
-- ③은 행이 통째로 잠겨 더 담을 자리가 없다.
--
-- ⚠️ choices 칸은 아직 지우지 않는다. 지금 돌고 있는 함수가 그 칸을 읽으므로,
--    함수를 새로 올린 뒤 ministry_per_team_drop.sql 로 따로 지운다.

begin;

-- 1) 새 칸 — 팀 하나를 행에 박는다(스냅샷: 목록이 바뀌어도 무엇을 냈는지 남는다)
alter table public.ministry_orders
  add column if not exists team_id   bigint,
  add column if not exists committee text,
  add column if not exists team      text,
  add column if not exists option    text;

-- 2) 행을 늘리기 전에 막는 제약부터 푼다
alter table public.ministry_orders drop constraint if exists ministry_orders_max3_chk;
alter table public.ministry_orders alter column choices drop not null;
do $$
declare c text;
begin
  -- unique (year, user_id) 의 실제 이름을 짐작하지 않는다 — 유일 제약을 찾아 지운다
  for c in select conname from pg_constraint
            where conrelid = 'public.ministry_orders'::regclass and contype = 'u'
  loop execute format('alter table public.ministry_orders drop constraint %I', c); end loop;
end $$;

-- 3) choices 배열을 행으로 편다
insert into public.ministry_orders
  (year, user_id, name, who, position, phone4, team_id, committee, team, option,
   status, note, created_at, updated_at, decided_at, notified_at)
select o.year, o.user_id, o.name, o.who, o.position, o.phone4,
       (c->>'id')::bigint, c->>'committee', c->>'team', coalesce(c->>'option', ''),
       o.status, o.note, o.created_at, o.updated_at, o.decided_at, o.notified_at
  from public.ministry_orders o
       cross join lateral jsonb_array_elements(coalesce(o.choices, '[]'::jsonb)) c
 where o.team_id is null;

delete from public.ministry_orders where team_id is null;

-- 4) 이제 한 사람이 한 팀에 한 번만
alter table public.ministry_orders alter column team_id set not null;
alter table public.ministry_orders
  add constraint ministry_orders_uni unique (year, user_id, team_id);

-- 5) 상태 사다리 — 「검토중」 자리를 「접수완료」가 대신한다.
--    담당자가 눌러 **잠그는** 그 자리이고, 그 순간 팀 명단에 이름이 올라간다.
alter table public.ministry_orders drop constraint if exists ministry_orders_status_chk;
update public.ministry_orders set status = '접수완료' where status = '검토중';
alter table public.ministry_orders add constraint ministry_orders_status_chk
  check (status in ('신청완료', '접수완료', '임명확정', '미채택'));

-- 6) 팀 명단을 뽑는 길 — 「이 팀에 접수된 분」을 자주 묻게 된다
create index if not exists ministry_orders_team_idx
  on public.ministry_orders (year, team_id, status);

commit;

-- 확인
--   select year,user_id,team,status from ministry_orders where year=2027 order by user_id,team;
--   select conname from pg_constraint where conrelid='public.ministry_orders'::regclass;
