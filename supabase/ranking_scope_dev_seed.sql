-- 「우리 교구 안에서」 순위 칩 — **개발 DB 전용** 시드 (2026-09-23)
--   ⚠️⚠️ **운영(xnomlgydifiqiybervtf)에 절대 돌리지 말 것.** 가짜 성도 8명과 암송 기록 177건이
--        순위표·교구 순위·주간 리포트에 그대로 섞여 들어간다. 개발은 ktpwthwqzgcqcrmsafdo 다
--        (supabase/dev-setup.md). `supabase db query --linked` 는 **운영**이니 쓰지 말 것.
--
-- ■ 왜 필요한가
--   개발 DB에는 가짜 사람이 한둘뿐이고 screen-sweep 은 「믿음-99 화면점검」 **한 사람**으로 붙는다.
--   설명서·앱스토어 캡처 도구는 ranking 응답을 아예 {ok:true,list:[]} 로 막아 둔다.
--   시드 없이는 (a) 갈래 — 칩이 켜지고 목록이 걸러진 상태 — 가 **한 번도 안 그려진다.**
--
-- ■ 무엇이 들었나
--   같은 교구(믿음) 5명 + 다른 교구(사랑) 3명 = 8명. 횟수가 전부 달라 순위가 갈린다.
--   목장 번호를 90~96 으로 몰아 두었다(화면점검만 99) — 개발 DB에서 한눈에 가려내고 한 번에 지운다.
--   ┌ 이름   소속      합계  어제  오늘  지금(3분전)
--   │ 강믿음 믿음-90    41    25    15     1
--   │ 정온유 사랑-94    37    22    15     0
--   │ 김소망 믿음-91    33    20    13     0
--   │ 화면점검 믿음-99  22    12     9     1   ← screen-sweep·localhost 로그인 계정
--   │ 한은혜 사랑-95    18    18     0     0   ← 오늘 기록 없음 = 응원 잠김(locked) 확인용
--   │ 박사랑 믿음-92    12     6     6     0
--   │ 오평강 사랑-96     9     9     0     0   ← 잠김 둘째
--   └ 최기쁨 믿음-93     5     2     2     1
--   → 「전체」에서 화면점검은 4위, 「우리 교구(믿음)」로 거르면 3위(🥉)가 된다.
--     원본 x.rank 를 안 건드리고 i+1 로 다시 매기는 것(금색 줄도 함께)을 **눈으로** 볼 수 있는 배치다.
--
-- ■ daily_activity 는 손대지 않는다
--   challenge_log 의 INSERT/DELETE 트리거가 채우고 줄인다(daily-activity.sql).
--   직접 넣으면 두 번 세어져 v2_activity_drift() 가 어긋남을 보고한다(monitor 가 매일 부른다).
--   같은 까닭으로 **truncate 금지** — for each row 트리거는 TRUNCATE 에 안 걸린다.
--
-- ■ 여러 번 돌려도 안전하다
--   ① users 는 on conflict do nothing ② challenge_log 는 **먼저 지우고** 다시 넣는다
--   ③ rank_cheers 는 on conflict do update.
--
-- ■ ⚠️ KST 00:11 이전에는 돌리지 말 것
--   3) 의 「오늘」 행은 greatest() 로 **KST 오늘 00:01** 에 고정된다. 지금이 00:11 보다 이르면
--   그 00:01 이 `now() - 10분` 안에 들어와 **오늘 기록 전부가 「지금 함께 암송 중」**으로 보인다
--   (LIVE_MINUTES = 10).
--
-- ■ ⚠️ 부수 효과 둘
--   · 2) 가 위 여덟 명의 **기존 challenge_log 를 지운다** — 화면점검 계정으로 그동안 쌓인 기록도 사라진다.
--   · tools/screen-sweep.py 는 ranking 을 막지 않는다 — 이 시드 뒤로는 18-ranking·19-my-record
--     두 장에 가짜 이름 여덟이 나온다. 설명서·앱스토어 캡처 도구는 영향 없다.
--
-- ■ ⚠️ 고른 다섯 mode 는 전부 이름에 typing 이 들어간다
--   그래서 v2_ranking 의 voice 칸은 여덟 명 모두 **0** 이다. 순위 화면은 voice 를 안 그리므로
--   보이는 것에는 아무 영향이 없다.
--
-- 적용: Supabase 대시보드(ktpwthwqzgcqcrmsafdo) → SQL Editor 에 통째로 붙여넣고 RUN


-- ════════════════════════════════════════════════════════════
-- 0) 전제 확인 — **먼저 한 번만** 돌려 보고 결과를 눈으로 본다
--    verse_no 가 nullable 이어야 한다. 이 DB 에 그 마이그레이션을 안 돌렸고
--    verses 도 비어 있으면 3) 이 not-null 위반으로 멈춘다.
--
--    ⚠️ 이 파일이 쓰는 것들은 **운영 스키마로 대조해 확인했다**(2026-09-23):
--       · mode 다섯(learn-typing·typing·review-typing·learn-typing-card·typing-card)이
--         challenge_log_mode_check 의 여덟 값 안에 있다
--       · users_identity_key_key UNIQUE(identity_key) · rank_cheers PK(target,from,date)
--         → 두 on conflict 가 실제 제약과 맞는다
--       · users.id 기본값이 gen_random_uuid() 라 1) 이 id 를 안 넣어도 된다
--       · rank_cheers 의 user_id 두 칸이 text 다 → 4) 의 ::text 캐스트가 필요하다
--       · v2_ranking · v2_activity_drift · daily_activity_sync 가 모두 있다
--    **개발 DB 가 운영과 다르면** 0) 이나 5-a 에서 먼저 걸린다. 그때는 개발에
--    해당 마이그레이션(daily-activity.sql 등)을 먼저 돌린다.
-- ════════════════════════════════════════════════════════════
select (select is_nullable from information_schema.columns
         where table_schema='public' and table_name='challenge_log'
           and column_name='verse_no')            as verse_no_nullable,   -- 'YES' 여야 안전
       (select count(*) from public.verses)       as verses_행수;         -- 0 이면 위가 YES 여야 한다


begin;

-- ════════════════════════════════════════════════════════════
-- 1) 사람 여덟 — identity_key 는 여섯 조각(type|gu|mok|bu|grade|name)
--    ⚠️ 조각을 하나라도 빠뜨리면 그 계정으로 로그인해도 시드 행에 안 붙고 새 계정이 생긴다.
-- ════════════════════════════════════════════════════════════
insert into public.users (type, gu, mok, bu, grade, name, identity_key)
values
  ('교구', '믿음', '90', null, null, '강믿음',   '교구|믿음|90|||강믿음'),
  ('교구', '믿음', '91', null, null, '김소망',   '교구|믿음|91|||김소망'),
  ('교구', '믿음', '92', null, null, '박사랑',   '교구|믿음|92|||박사랑'),
  ('교구', '믿음', '93', null, null, '최기쁨',   '교구|믿음|93|||최기쁨'),
  ('교구', '믿음', '99', null, null, '화면점검', '교구|믿음|99|||화면점검'),
  ('교구', '사랑', '94', null, null, '정온유',   '교구|사랑|94|||정온유'),
  ('교구', '사랑', '95', null, null, '한은혜',   '교구|사랑|95|||한은혜'),
  ('교구', '사랑', '96', null, null, '오평강',   '교구|사랑|96|||오평강')
on conflict (identity_key) do nothing;

-- ════════════════════════════════════════════════════════════
-- 2) 먼저 지운다 — 다시 돌려도 횟수가 두 배가 되지 않게.
--    delete 트리거가 daily_activity 도 함께 줄인다(직접 손대지 않는다).
-- ════════════════════════════════════════════════════════════
delete from public.challenge_log c
 using public.users u
 where u.id = c.user_id
   and u.identity_key in (
     '교구|믿음|90|||강믿음','교구|믿음|91|||김소망','교구|믿음|92|||박사랑',
     '교구|믿음|93|||최기쁨','교구|믿음|99|||화면점검',
     '교구|사랑|94|||정온유','교구|사랑|95|||한은혜','교구|사랑|96|||오평강');

-- ════════════════════════════════════════════════════════════
-- 3) 암송·도전 기록 177건
--    · mode 는 CHECK 에 있는 여덟 값 중 다섯만 쓴다.
--      learn-* 이 섞여야 앱 순위(learn 포함)와 관리자 도전현황(learn 제외)의 차이도 개발에서 보인다.
--    · verse_no 는 verses 에 실제로 있는 번호를 골라 쓴다. verses 가 비어 있으면 null 이 되는데
--      nullable 이라 그대로 들어간다(FK 도 통과).
--    · 시각은 전부 KST 어제·오늘 — 순위 화면 기본 기간이 「전일~당일」이다.
-- ════════════════════════════════════════════════════════════
with seed(ikey, n_yday, n_today, n_live) as (values
  ('교구|믿음|90|||강믿음',   25, 15, 1),
  ('교구|믿음|91|||김소망',   20, 13, 0),
  ('교구|믿음|92|||박사랑',    6,  6, 0),
  ('교구|믿음|93|||최기쁨',    2,  2, 1),
  ('교구|믿음|99|||화면점검', 12,  9, 1),
  ('교구|사랑|94|||정온유',   22, 15, 0),
  ('교구|사랑|95|||한은혜',   18,  0, 0),
  ('교구|사랑|96|||오평강',    9,  0, 0)
),
pick as (
  select s.*, u.id as uid from seed s join public.users u on u.identity_key = s.ikey
),
rows_all as (
  -- 어제: KST 21:00 + g분 (최대 +25분 → 자정을 넘지 않는다)
  select p.uid, g,
         ((((now() at time zone 'Asia/Seoul')::date - 1) + time '21:00')
            at time zone 'Asia/Seoul') + make_interval(mins => g) as ts
    from pick p cross join lateral generate_series(1, p.n_yday) g
  union all
  -- 오늘: 지금에서 20분 + g*9분 만큼 뒤로. KST 오늘 00:01 보다 앞서지 않게 막는다.
  select p.uid, g,
         greatest(
           (((now() at time zone 'Asia/Seoul')::date + time '00:01') at time zone 'Asia/Seoul'),
           now() - interval '20 minutes' - make_interval(mins => g * 9)
         ) as ts
    from pick p cross join lateral generate_series(1, p.n_today) g
  union all
  -- 지금(최근 10분) — 「지금 함께 암송 중」 표시용. LIVE_MINUTES=10
  select p.uid, g, now() - interval '3 minutes' as ts
    from pick p cross join lateral generate_series(1, p.n_live) g
)
insert into public.challenge_log (user_id, verse_no, mode, created_at)
select r.uid,
       (select v.no from public.verses v order by v.no offset (r.g % 5) limit 1),
       (array['learn-typing','typing','review-typing','learn-typing-card','typing-card'])[1 + (r.g % 5)],
       r.ts
  from rows_all r;

-- ════════════════════════════════════════════════════════════
-- 4) 응원 세 건 (cheer_date 는 KST 오늘)
--    ⚠️ user_id 두 칸이 text 다 — ::text 캐스트가 필요하다.
--    · 주는 쪽·받는 쪽 **둘 다 오늘 기록이 있는 사람**으로만 골랐다 — 앱의 관문과 같은 조건이다.
--    · 화면점검이 받은 둘 중 하나는 **다른 교구(사랑)** 에서 온 것이다 —
--      「👏는 소속과 무관하다」를 개발에서 확인할 자리.
--    · 셋째 줄은 화면점검이 **준** 것 — 김소망 줄의 칩이 켜진(iCheered) 모습을 본다.
-- ════════════════════════════════════════════════════════════
insert into public.rank_cheers (target_user_id, from_user_id, cheer_date, from_name)
select t.id::text, f.id::text, (now() at time zone 'Asia/Seoul')::date, x.from_name
  from (values
    ('교구|믿음|99|||화면점검', '교구|믿음|90|||강믿음', '믿음-90 강믿음'),
    ('교구|믿음|99|||화면점검', '교구|사랑|94|||정온유', '사랑-94 정온유'),
    ('교구|믿음|91|||김소망',   '교구|믿음|99|||화면점검', '믿음-99 화면점검')
  ) as x(tkey, fkey, from_name)
  join public.users t on t.identity_key = x.tkey
  join public.users f on f.identity_key = x.fkey
on conflict (target_user_id, from_user_id, cheer_date)
do update set from_name = excluded.from_name;

commit;

-- ════════════════════════════════════════════════════════════
-- 5) 확인 — 커밋 뒤에 따로 실행한다
-- ════════════════════════════════════════════════════════════

-- 5-a. 집계표가 트리거로 잘 따라왔나 (log_rows 와 agg_sum 이 같아야 한다)
select * from v2_activity_drift();

-- 5-b. 화면이 실제로 부르는 그대로 — 기본 기간(전일~당일)
select * from v2_ranking(
  ((now() at time zone 'Asia/Seoul')::date - 1)::text,
  ((now() at time zone 'Asia/Seoul')::date)::text,
  true, '');
--   기대: 강믿음41 · 정온유37 · 김소망33 · 화면점검22 · 한은혜18 · 박사랑12 · 오평강9 · 최기쁨5
--         한은혜·오평강만 active_today = false
--         voice 는 여덟 명 모두 0 이 정상이다(고른 다섯 mode 가 전부 %typing% 이라서)

-- 5-c. 3명 게이트 — 「우리 교구」 칩이 켜질 소속인가 (app.js 가 세는 것과 같은 창)
select sosok, count(*) as 인원
  from v2_ranking(
    ((now() at time zone 'Asia/Seoul')::date - 1)::text,
    ((now() at time zone 'Asia/Seoul')::date)::text, true, '')
 group by sosok order by 인원 desc;
--   기대: 믿음 5 · 사랑 3  → 둘 다 (a) 갈래(칩 켜짐)

-- 5-d. 「지금 함께 암송 중」 — 최근 10분
select u.name, count(*) as 최근10분
  from public.challenge_log c join public.users u on u.id = c.user_id
 where c.created_at >= now() - interval '10 minutes'
 group by u.name order by u.name;
--   기대: 강믿음 1 · 최기쁨 1 · 화면점검 1  → 「지금 3명」

-- 로그인해서 볼 때: 교구 → 믿음 → 목장 99 → 이름 「화면점검」
--   (tools/screen-sweep.py 의 USER 와 같은 사람이라 도구와 손 확인이 같은 계정을 쓴다)


-- ════════════════════════════════════════════════════════════
-- 6) 되돌리기 — 시험이 끝나면 (개발 DB 에서만)
--    challenge_log 를 먼저 지워 트리거가 daily_activity 를 줄이게 한 뒤 사람을 지운다.
-- ════════════════════════════════════════════════════════════
-- delete from public.challenge_log c using public.users u
--  where u.id = c.user_id and u.mok in ('90','91','92','93','94','95','96');
-- delete from public.rank_cheers rc using public.users u
--  where (u.id::text = rc.target_user_id or u.id::text = rc.from_user_id)
--    and u.mok in ('90','91','92','93','94','95','96');
-- delete from public.users where mok in ('90','91','92','93','94','95','96');
-- (화면점검 99 는 screen-sweep 이 쓰므로 남긴다)
