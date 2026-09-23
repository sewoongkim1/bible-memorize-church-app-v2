-- 가을 말씀 동행 — **개발 DB 전용** 가짜 자료
-- ⚠️⚠️ 운영(xnomlgydifiqiybervtf)에 절대 돌리지 마세요. 성도님 기록에 가짜가 섞입니다.
--      개발은 ktpwthwqzgcqcrmsafdo 입니다. SQL Editor 위쪽 프로젝트 이름을 먼저 확인하세요.
--
-- 여러 번 돌려도 안전하다 — 먼저 지우고 다시 넣는다.
-- 규칙의 네 갈래를 전부 밟는다:
--   도장여섯  6주 모두 3일씩      → 자격 O · ✨ O
--   도장셋    1·2·3주만 3일씩     → 자격 O(딱)  · ✨ X
--   도장둘    1·2주만 3일씩       → 자격 X · 남은 주로 닿을 수 있음(기간 중이면)
--   늦게온이  5·6주만 3일씩, 그전 기록이 전혀 없음 → 중간 합류 → 필요 2주 → 자격 O

do $$
declare
  v_start date := '2026-10-11';
  v_verse int;
  r record;
  w int; d int;
begin
  -- 이 개발 DB 에 실제로 있는 구절 번호 하나(FK 때문에 아무 번호나 못 쓴다)
  select no into v_verse from verses order by no limit 1;
  if v_verse is null then
    raise exception '구절이 하나도 없습니다 — seed_verses 를 먼저 돌리세요';
  end if;

  -- ① 사람 넷 (identity_key 는 login 이 만드는 것과 같은 꼴이 아니어도 된다 —
  --    이 자료는 화면 로그인용이 아니라 서버 계산 확인용이다)
  delete from challenge_log where user_id in (select id from users where name in ('도장여섯','도장셋','도장둘','늦게온이'));
  delete from users where name in ('도장여섯','도장셋','도장둘','늦게온이');

  insert into users (type, gu, mok, name, identity_key) values
    ('교구','사랑','1','도장여섯','교구|사랑|1|도장여섯'),
    ('교구','사랑','1','도장셋',  '교구|사랑|1|도장셋'),
    ('교구','사랑','1','도장둘',  '교구|사랑|1|도장둘'),
    ('교구','사랑','1','늦게온이','교구|사랑|1|늦게온이');

  -- ② 기록 — created_at 을 과거로 넣어 트리거가 daily_activity 를 채우게 한다.
  --    ⚠️ daily_activity 에 직접 INSERT 하지 않는다. 트리거가 하는 일을 손으로 하면
  --       로그와 집계가 갈려 v2_activity_drift() 가 운다.
  --    ⚠️ mode 에 카드를 일부러 섞는다 — mode 를 세는 코드가 끼어들면 여기서 걸린다.
  for r in
    select * from (values
      ('도장여섯', 0),('도장여섯',1),('도장여섯',2),('도장여섯',3),('도장여섯',4),('도장여섯',5),
      ('도장셋',   0),('도장셋',  1),('도장셋',  2),
      ('도장둘',   0),('도장둘',  1),
      ('늦게온이', 4),('늦게온이',5)
    ) as t(nm, wk)
  loop
    w := r.wk;
    for d in 0..2 loop     -- 그 주의 첫 사흘
      insert into challenge_log (user_id, verse_no, mode, created_at)
      select u.id, v_verse,
             case d when 0 then 'learn-typing-card'
                    when 1 then 'typing-card'
                    else 'review-typing' end,
             (v_start + (w * 7) + d)::timestamp at time zone 'Asia/Seoul'
        from users u where u.name = r.nm;
    end loop;
  end loop;
end $$;

-- 확인 — 이 넷이 이 값으로 나온다(다른 사람이 함께 나올 수 있다).
--   도장여섯  weeks_done 6 · week_days {3,3,3,3,3,3} · all_weeks t
--   도장셋    weeks_done 3 · week_days {3,3,3,0,0,0} · all_weeks f
--   도장둘    weeks_done 2 · week_days {3,3,0,0,0,0} · all_weeks f
--   늦게온이  weeks_done 2 · week_days {0,0,0,0,3,3} · first_day 2026-11-08
-- select u.name, w.weeks_done, w.week_days, w.all_weeks, w.first_day
--   from v2_event_weeks('2026-10-11', 6, 3) w join users u on u.id::text = w.user_id
--  where u.name in ('도장여섯','도장셋','도장둘','늦게온이')
--  order by u.name;
