-- 가을 말씀 동행 — **개발 DB 전용** 가짜 자료
-- ⚠️⚠️ 운영(xnomlgydifiqiybervtf)에 절대 돌리지 마세요. 성도님 기록에 가짜가 섞입니다.
--      개발은 ktpwthwqzgcqcrmsafdo 입니다. SQL Editor 위쪽 프로젝트 이름을 먼저 확인하세요.
--
-- 여러 번 돌려도 안전하다 — 먼저 지우고 다시 넣는다.
-- ⚠️ 2026-10-03 — v2_event_weeks 에 p_per_day(하루 합 문턱)가 생기면서 하루치를
--    "한 줄"이 아니라 "그날 모드를 섞은 여러 줄"로 바꿨다. daily_activity.cnt 는
--    challenge_log 가 느는 만큼(모드 구분 없이) 늘므로, 하루에 몇 줄을 넣느냐가
--    곧 그날의 합(n)이다. p_per_day => 3(가을 회차 값) 을 기준으로 사람을 짰다.
-- 규칙의 여섯 갈래를 전부 밟는다(⚠️ 처음 넷은 하루 3줄 — p_per_day 1·3 어느 쪽으로도 같다):
--   도장여섯  6주 모두 3일씩(하루 3줄)        → 자격 O · ✨ O (perDay 1·3 동일)
--   도장셋    1·2·3주만 3일씩(하루 3줄)       → 자격 O(딱)  · ✨ X (perDay 1·3 동일)
--   도장둘    1·2주만 3일씩(하루 3줄)         → 자격 X · 남은 주로 닿을 수 있음(기간 중이면) (perDay 1·3 동일)
--   늦게온이  5·6주만 3일씩(하루 3줄), 그전 기록이 전혀 없음 → 중간 합류 → 필요 2주 → 자격 O (perDay 1·3 동일)
--   모자란날  1주만 3일, 하루 2줄            → perDay 1 이면 그 주 3칸(자격엔 못 닿음) · perDay 3 이면 0칸(행은 나옴)
--   늦게온모자람  4주만 이틀, 하루 1줄        → perDay 1 이면 그 주 2칸 · perDay 3 이면 0칸(행·first_day 는 나옴)

-- ⚠️ 빗장 — 주석은 사람이 안 읽을 수 있다. 파일이 스스로 운영을 거부하게 한다.
--    개발은 사람이 수십, 운영은 사백이 넘는다(2026-09-23 기준 416명).
do $$
begin
  if (select count(*) from users) > 200 then
    raise exception '여기는 운영으로 보입니다(users %). dev_seed_stamp.sql 은 개발 전용입니다.',
      (select count(*) from users);
  end if;
end $$;

do $$
declare
  v_start date := '2026-10-18';
  v_verse int;
  v_modes text[] := array['learn-typing-card', 'typing-card', 'review-typing'];
  v_names text[] := array['교구|사랑|1|||도장여섯','교구|사랑|1|||도장셋','교구|사랑|1|||도장둘',
                           '교구|사랑|1|||늦게온이','교구|사랑|1|||모자란날','교구|사랑|1|||늦게온모자람'];
  r record;
  w int; d int; m int; n_rows int;
begin
  -- 이 개발 DB 에 실제로 있는 구절 번호 하나(FK 때문에 아무 번호나 못 쓴다)
  select no into v_verse from verses order by no limit 1;
  if v_verse is null then
    raise exception '구절이 하나도 없습니다 — seed_verses 를 먼저 돌리세요';
  end if;

  -- ① 사람 여섯
  -- ⚠️ **identity_key 는 여섯 조각이다** — `type|gu|mok|bu|grade|name`
  --    (index.ts 의 identityKey). 교구 성도는 bu·grade 가 비어 `교구|사랑|1|||이름` 이 된다.
  --    2026-09-23 에 네 조각으로 넣었다가, 이 계정으로 화면을 열었더니 login 이 못 알아보고
  --    **같은 이름의 새 계정을 만들어** 도장이 전부 0 으로 보였다. 제품 버그로 오인하기 딱 좋다.
  -- ⚠️ **이름으로 지우지 않는다.** 이 앱은 비밀번호가 없고 이름+소속으로 로그인해서
  --    동명이인이 실재한다. identity_key 는 이 파일이 만든 값이라 남과 겹칠 수 없다.
  delete from challenge_log where user_id in (
    select id from users where identity_key = any(v_names));
  delete from users where identity_key = any(v_names);

  insert into users (type, gu, mok, name, identity_key) values
    ('교구','사랑','1','도장여섯',    '교구|사랑|1|||도장여섯'),
    ('교구','사랑','1','도장셋',      '교구|사랑|1|||도장셋'),
    ('교구','사랑','1','도장둘',      '교구|사랑|1|||도장둘'),
    ('교구','사랑','1','늦게온이',    '교구|사랑|1|||늦게온이'),
    ('교구','사랑','1','모자란날',    '교구|사랑|1|||모자란날'),
    ('교구','사랑','1','늦게온모자람','교구|사랑|1|||늦게온모자람');

  -- ② 기록 — created_at 을 과거로 넣어 트리거가 daily_activity 를 채우게 한다.
  --    ⚠️ daily_activity 에 직접 INSERT 하지 않는다. 트리거가 하는 일을 손으로 하면
  --       로그와 집계가 갈려 v2_activity_drift() 가 운다.
  --    ⚠️ mode 에 카드를 일부러 섞는다 — mode 를 세는 코드가 끼어들면 여기서 걸린다.
  --    ⚠️ ndays·그날 줄 수(n_rows)를 사람마다 다르게 둔다 — p_per_day 로 가르는 시험이다.
  for r in
    select * from (values
      ('도장여섯',     0, 3), ('도장여섯',     1, 3), ('도장여섯',     2, 3),
      ('도장여섯',     3, 3), ('도장여섯',     4, 3), ('도장여섯',     5, 3),
      ('도장셋',       0, 3), ('도장셋',       1, 3), ('도장셋',       2, 3),
      ('도장둘',       0, 3), ('도장둘',       1, 3),
      ('늦게온이',     4, 3), ('늦게온이',     5, 3),
      ('모자란날',     0, 3),   -- 1주만, 하루 2줄(n_rows 는 아래서 이름으로 따로 정한다)
      ('늦게온모자람', 3, 2)    -- 4주만(0-base 3), 이틀, 하루 1줄
    ) as t(nm, wk, ndays)
  loop
    w := r.wk;
    n_rows := case r.nm
                when '모자란날'     then 2
                when '늦게온모자람' then 1
                else 3
              end;
    for d in 0..(r.ndays - 1) loop     -- 그 주의 첫 날들
      for m in 1..n_rows loop
        insert into challenge_log (user_id, verse_no, mode, created_at)
        select u.id, v_verse, v_modes[m],
               (v_start + (w * 7) + d)::timestamp at time zone 'Asia/Seoul'
          from users u where u.name = r.nm;
      end loop;
    end loop;
  end loop;
end $$;

-- 확인 — 이 여섯이 아래 값으로 나온다(다른 사람이 함께 나올 수 있다).
-- select u.name, w.weeks_done, w.week_days, w.all_weeks, w.first_day
--   from v2_event_weeks('2026-10-18', 6, 3, null, 3) w join users u on u.id::text = w.user_id
--  where u.name in ('도장여섯','도장셋','도장둘','늦게온이','모자란날','늦게온모자람')
--  order by u.name;
--
--   p_per_day => 3 (가을 회차 문턱 · 하루 2줄 이하로는 그 날이 안 찍힌다)
--     도장여섯      weeks_done 6 · week_days {3,3,3,3,3,3} · all_weeks t · first_day 2026-10-18
--     도장셋        weeks_done 3 · week_days {3,3,3,0,0,0} · all_weeks f · first_day 2026-10-18
--     도장둘        weeks_done 2 · week_days {3,3,0,0,0,0} · all_weeks f · first_day 2026-10-18
--     늦게온이      weeks_done 2 · week_days {0,0,0,0,3,3} · all_weeks f · first_day 2026-11-15
--     모자란날      weeks_done 0 · week_days {0,0,0,0,0,0} · all_weeks f · first_day 2026-10-18 (행은 나온다 — 활동 자체는 있다)
--     늦게온모자람  weeks_done 0 · week_days {0,0,0,0,0,0} · all_weeks f · first_day 2026-11-08 (행·first_day 는 나온다)
--
--   p_per_day => 1 (옛 값과 같다 — 하루 한 번이라도)
--     도장여섯      weeks_done 6 · week_days {3,3,3,3,3,3} · all_weeks t · first_day 2026-10-18  (바뀌지 않음)
--     도장셋        weeks_done 3 · week_days {3,3,3,0,0,0} · all_weeks f · first_day 2026-10-18  (바뀌지 않음)
--     도장둘        weeks_done 2 · week_days {3,3,0,0,0,0} · all_weeks f · first_day 2026-10-18  (바뀌지 않음)
--     늦게온이      weeks_done 2 · week_days {0,0,0,0,3,3} · all_weeks f · first_day 2026-11-15  (바뀌지 않음)
--     모자란날      weeks_done 1 · week_days {3,0,0,0,0,0} · all_weeks f · first_day 2026-10-18  (1주는 닿는다 — 하루 2줄도 1 이상이라 찍힌다)
--     늦게온모자람  weeks_done 0 · week_days {0,0,0,2,0,0} · all_weeks f · first_day 2026-11-08  (그 주 이틀은 찍히지만 perWeek 3 에는 못 닿는다)
