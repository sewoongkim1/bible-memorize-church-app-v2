-- 기록 합치기 점검 (둘째 판) — 정정 신청 · 아이폰 알림 기기 · 합친 뒤 옛 번호로 온 가리기(F2) (2026-10-02)
-- ⚠️ 이 저장소는 공개(public)입니다 — 비밀번호·키·실명을 절대 넣지 마세요. 아래 이름·기기 번호는 모두 가상입니다.
--
-- ■ 무엇을 보나: supabase/member_merge.sql 의 admin_merge_members 가 api(adminMergeMembers)와 같은 꼴로 불렸을 때
--   ① ministry_history_requests(교회 어드민 008 · 정정 신청) — 정한 규칙(그 표의 주인 세션 a8 과 맞춤)
--      · 남는 쪽에 같은 줄(history_id)의 **열린** 신청이 있으면(find_me 는 열린 find_me 가 있으면) 원본의 열린 신청은 **지운다**
--        (「반영 안 함」으로 닫지 않는다 — 성도님 화면에 거절로 보인다)
--      · 나머지(닫힌 것 · 남는 쪽에 짝이 없는 열린 것 · missing)는 줄 번호·상태·updated_at·이름 사본 그대로 주인만 옮긴다
--        (가상 신청의 날짜는 그제·어제로 넣는다 — 합치기가 updated_at=now() 로 고치면 잡히게. 지우는 find_me 는 「확인 중」)
--      · 합친 뒤 옛 번호로 들어온 신청도 남는 쪽으로 · 남는 쪽에 같은 줄의 열린 신청이 있으면 23505(교회 어드민 already-open)
--      · **표가 없으면 「건너뜀」**(개발에 교회 어드민 008 을 아직 안 돌렸으면) — 합치기도 그 표를 건너뛴다
--   ② ios_push_tokens(아이폰 알림 기기) — 줄 번호·알림 시각 그대로 주인만 옮긴다. 합친 뒤 옛 기기가 같은 기기 번호로 다시
--      등록해도(api saveIosPushToken 의 upsert 꼴) 한 줄 · 새 기기는 남는 쪽으로. 표가 없으면 「건너뜀」.
--   ③ F2 — 합친 뒤 옛 번호로 「남는 쪽 글」을 가리면 (옛, 남는) → 트리거가 (남는, 남는)으로 바꾼다 → **오류 없이 0줄**
--      (전에는 CHECK board_blocks_not_self 23514 → api 500). 남의 글이면 남는 쪽 줄로. 처음부터 자기 자신인 줄은
--      CHECK 가 그대로 막는다. 응원(rank_cheers)도 같은 규칙 — 표가 있으면 본다.
--   ④ 미리보기·합친 뒤 기록 수(member_merge_counts)에 두 표가 보인다(정정 신청: 원본 6 + 대상 4 − 지운 2 = 8).
--
-- ■ 언제 · 어디서: **개발(ktpwthwqzgcqcrmsafdo) 전용.** 고친 member_merge.sql 을 개발에 **먼저** 돌린 다음.
--   (옛 함수면 merge-unsupported-records 로 떨어지거나 「옛 트리거」라고 멈춘다 — 이 점검이 바로 그걸 잡으려는 것이다.)
--   users 가 200명이 넘으면 운영으로 보고 아무것도 하지 않고 멈춘다(개발은 수십 명 · 운영은 사백이 넘는다).
--   supabase/tests/member_merge_consents.dev.sql(첫째 판)과 따로 돌린다 — 순서는 상관없다.
--
-- ■ 남는 것: 없다. 처음부터 끝까지 BEGIN … ROLLBACK 이다 — 가상 성도·기기·신청·가리기 줄 모두 되돌린다.
--   (합치기가 잠깐 거는 잠금 pg_advisory_xact_lock(7240910,1) 도 ROLLBACK 과 함께 풀린다. 넣은 줄은 커밋되지 않아
--    알림 발송·교회 어드민 화면 같은 다른 연결에는 한 번도 보이지 않는다.)
--
-- ■ 실행(컨트롤러):
--   supabase --workdir <개발에 link 한 스크래치 폴더> db query --linked "select count(*) from users"   -- 수십이면 개발
--   supabase --workdir <같은 폴더> db query --linked -f <이 파일의 절대 경로>
--   ⚠️ 한글이 든 SQL 은 명령줄에 붙이지 말고 이 파일(-f)로만 — 명령줄 한글은 깨진다.
--
-- ■ 결과 읽기: 통과면 'member_merge_requests_devices: 통과 — 정정 신청 확인함|건너뜀(표 없음) · 아이폰 기기 … · 가리기 F2 확인함 …'
--   한 줄. CLI 가 마지막 문(ROLLBACK)의 결과만 보여 주면 빈 결과로 보일 수 있다 — 그때는 **ERROR 가 없으면 통과**다
--   (무엇을 건너뛰었는지는 NOTICE 로도 남는다). 떨어지면 ERROR: member_merge_requests_devices: <무엇이 틀렸나>.
--   ⚠️ 「건너뜀」이 나왔는데 개발에 그 표가 있어야 한다면(교회 어드민 008 · ios_push_tokens.sql) 그 SQL 을 먼저 돌리고 이 파일을 다시.

begin;

do $check$
declare
  tag  text := left(md5(random()::text || clock_timestamp()::text), 8);   -- 가상 식별자가 진짜와도, 동시 실행과도 안 겹치게
  has_mhr boolean := to_regclass('public.ministry_history_requests') is not null;
  has_ios boolean := to_regclass('public.ios_push_tokens') is not null;
  has_cheer boolean := to_regclass('public.rank_cheers') is not null;
  k_s  text; k_t  text; k_x  text; k_s2 text; k_t2 text;
  v_s  uuid; v_t  uuid; v_x  uuid; v_s2 uuid; v_t2 uuid;
  -- 정정 신청: 지울 것 둘 · 남을 것 여덟(대상 넷 + 옮긴 넷)
  drop_line bigint; keep_line_t bigint; moved_open bigint; closed_t bigint; moved_closed bigint;
  drop_find bigint; keep_find_t bigint; moved_find_closed bigint; moved_missing bigint; keep_missing_t bigint;
  open_find2 bigint; open_l4 bigint; open_l5_t bigint;
  -- 아이폰 기기
  ts1 bigint; ts2 bigint; tt1 bigint; tok_s1 text; tok_s2 text; tok_t1 text; tok_s3 text;
  h0 bigint := 900000000 + (('x' || substr(tag,1,6))::bit(24)::int);   -- 가상 history_id(정정할 줄 번호 — FK 없음)
  pv jsonb; r jsonb; n int; got text; want text; as_service boolean := false;
  prev_role text := current_user;   -- 합치기 뒤 돌아올 역할(reset role 은 CLI 의 로그인 역할 cli_login_* 로 떨어질 수 있다)
  -- 정정 신청 날짜는 **어제·그제**로 넣는다 — 이 점검은 트랜잭션 하나라 now() 가 처음부터 끝까지 같다. 기본값(now())으로
  --   넣으면 합치기가 updated_at=now() 로 고쳐도 값이 같아 못 잡는다.
  old_c timestamptz := now() - interval '2 days';
  old_u timestamptz := now() - interval '1 day';
  res_mhr text := '건너뜀(표 없음)'; res_ios text := '건너뜀(표 없음)'; res_cheer text := '건너뜀(표 없음)';
begin
  -- ── 0) 여기가 개발인가 · 준비물이 있나 ─────────────────────────────
  select count(*) into n from public.users;
  if n > 200 then
    raise exception 'member_merge_requests_devices: users 가 %명 — 운영으로 보여 멈춥니다. 이 점검은 개발에서만 돌립니다.', n;
  end if;
  if to_regclass('public.board_blocks') is null then
    raise exception 'member_merge_requests_devices: 개발에 board_blocks 표가 없습니다 — supabase/board_blocks.sql 을 먼저 돌리세요(F2 를 봐야 합니다).';
  end if;
  if to_regprocedure('public.admin_merge_members(uuid,uuid,text,text,text)') is null then
    raise exception 'member_merge_requests_devices: admin_merge_members 함수가 없습니다 — member_merge.sql 을 먼저 돌리세요.';
  end if;
  if not exists(select 1 from pg_proc where oid = to_regprocedure('public.redirect_merged_member_write()')
                and prosrc like '%tg_nargs = 2%') then
    raise exception 'member_merge_requests_devices: 쓰기 연결 트리거 함수가 옛 판입니다(옮긴 결과 자기 자신이 된 줄을 버리지 않는다) — 고친 member_merge.sql 을 돌리세요.';
  end if;
  select count(*) into n from pg_trigger where tgname='redirect_merged_member_write' and not tgisinternal
    and tgrelid = 'public.board_blocks'::regclass;
  if n <> 1 then raise exception 'member_merge_requests_devices: board_blocks 에 쓰기 연결 트리거가 없습니다 — member_merge.sql 을 다시 돌리세요.'; end if;
  if has_ios then
    select count(*) into n from pg_trigger where tgname='redirect_merged_member_write' and not tgisinternal
      and tgrelid = to_regclass('public.ios_push_tokens');
    if n <> 1 then raise exception 'member_merge_requests_devices: ios_push_tokens 에 쓰기 연결 트리거가 없습니다 — 고친 member_merge.sql 을 표를 만든 **뒤에** 다시 돌리세요.'; end if;
  else
    raise notice 'member_merge_requests_devices: ios_push_tokens 표가 없어 아이폰 기기 점검은 건너뜁니다.';
  end if;
  if has_mhr then
    select count(*) into n from pg_trigger where tgname='redirect_merged_member_write' and not tgisinternal
      and tgrelid = to_regclass('public.ministry_history_requests');
    if n <> 1 then raise exception 'member_merge_requests_devices: ministry_history_requests 에 쓰기 연결 트리거가 없습니다 — 고친 member_merge.sql 을 교회 어드민 008 **뒤에** 다시 돌리세요.'; end if;
  else
    raise notice 'member_merge_requests_devices: ministry_history_requests 표가 없어(교회 어드민 008 전) 정정 신청 점검은 건너뜁니다.';
  end if;

  -- ── 1) 가상 성도 다섯 — 원본 · 대상 · 셋째(남의 글) · 둘째 쌍 ───────────────────────
  --    교구 「합치기점검」 은 실제로 없는 교구다. 식별자 끝의 tag 로 진짜·다른 실행과 겹치지 않는다.
  k_s  := '교구|합치기점검|0|||가상원본'   || tag;
  k_t  := '교구|합치기점검|0|||가상대상'   || tag;
  k_x  := '교구|합치기점검|0|||가상셋째'   || tag;
  k_s2 := '교구|합치기점검|0|||가상원본둘' || tag;
  k_t2 := '교구|합치기점검|0|||가상대상둘' || tag;
  insert into public.users(type,gu,mok,name,identity_key) values('교구','합치기점검','0','가상원본'||tag,k_s)   returning id into v_s;
  insert into public.users(type,gu,mok,name,identity_key) values('교구','합치기점검','0','가상대상'||tag,k_t)   returning id into v_t;
  insert into public.users(type,gu,mok,name,identity_key) values('교구','합치기점검','0','가상셋째'||tag,k_x)   returning id into v_x;
  insert into public.users(type,gu,mok,name,identity_key) values('교구','합치기점검','0','가상원본둘'||tag,k_s2) returning id into v_s2;
  insert into public.users(type,gu,mok,name,identity_key) values('교구','합치기점검','0','가상대상둘'||tag,k_t2) returning id into v_t2;

  -- ── 2) 아이폰 기기 — 원본 둘(시각 6·7) · 대상 하나(시각 8). 기기 번호는 가상(진짜 APNs 번호는 64자리 16진수) ──
  if has_ios then
    tok_s1 := 'merge-check-' || tag || '-s1'; tok_s2 := 'merge-check-' || tag || '-s2';
    tok_t1 := 'merge-check-' || tag || '-t1'; tok_s3 := 'merge-check-' || tag || '-s3';
    insert into public.ios_push_tokens(user_id,device_token,hour) values(v_s,tok_s1,6) returning id into ts1;
    insert into public.ios_push_tokens(user_id,device_token,hour) values(v_s,tok_s2,7) returning id into ts2;
    insert into public.ios_push_tokens(user_id,device_token,hour) values(v_t,tok_t1,8) returning id into tt1;
  end if;

  -- ── 3) 정정 신청 열 줄 — h0+1·h0+2 는 가상 「정정할 줄」 번호 · 날짜는 그제(created_at)·어제(updated_at) ───────────
  --    지우는 둘 중 하나(find_me)는 「확인 중」이다 — 「열린」 글자가 하나라도 틀리면(예: '확인중') 지우지 못해 부분 unique 로 떨어진다.
  if has_mhr then
    insert into public.ministry_history_requests(user_id,kind,history_id,status,who_name,created_at,updated_at) values(v_s,'not_mine',h0+1,'신청','합치기점검 옛 이름',old_c,old_u)   returning id into drop_line;      -- ① 지움
    insert into public.ministry_history_requests(user_id,kind,history_id,status,created_at,updated_at)          values(v_t,'wrong_team',h0+1,'확인 중',old_c,old_u)                    returning id into keep_line_t;    --   (종류가 달라도 같은 줄)
    insert into public.ministry_history_requests(user_id,kind,history_id,status,who_name,created_at,updated_at) values(v_s,'other',h0+2,'확인 중','합치기점검 옛 이름',old_c,old_u)    returning id into moved_open;     -- ② 열린 채 옮김
    insert into public.ministry_history_requests(user_id,kind,history_id,status,created_at,updated_at)          values(v_t,'not_mine',h0+2,'반영 안 함',old_c,old_u)                   returning id into closed_t;
    insert into public.ministry_history_requests(user_id,kind,history_id,status,created_at,updated_at)          values(v_s,'not_mine',h0+1,'반영',old_c,old_u)                         returning id into moved_closed;   -- ② 닫힌 것은 옮김
    insert into public.ministry_history_requests(user_id,kind,status,created_at,updated_at)                     values(v_s,'find_me','확인 중',old_c,old_u)                            returning id into drop_find;      -- ① 지움(「확인 중」)
    insert into public.ministry_history_requests(user_id,kind,status,created_at,updated_at)                     values(v_t,'find_me','신청',old_c,old_u)                               returning id into keep_find_t;
    insert into public.ministry_history_requests(user_id,kind,status,created_at,updated_at)                     values(v_s,'find_me','반영 안 함',old_c,old_u)                         returning id into moved_find_closed; -- ② 옮김
    insert into public.ministry_history_requests(user_id,kind,year,team_text,status,created_at,updated_at)      values(v_s,'missing',2019,'합치기점검 가상 팀','신청',old_c,old_u)      returning id into moved_missing;  -- ② unique 없음
    insert into public.ministry_history_requests(user_id,kind,year,team_text,status,created_at,updated_at)      values(v_t,'missing',2019,'합치기점검 가상 팀','신청',old_c,old_u)      returning id into keep_missing_t;
    -- 넣은 날짜가 그대로 들어갔나(008 에 날짜를 고치는 트리거가 생기면 아래 「바뀌지 않았다」 검사가 헛돈다 — 그때는 이 점검을 고칠 것)
    select count(*) into n from public.ministry_history_requests where user_id in (v_s, v_t)
      and (created_at is distinct from old_c or updated_at is distinct from old_u);
    if n <> 0 then
      raise exception 'member_merge_requests_devices: 정정 신청 — 가상 신청을 그제·어제 날짜로 넣지 못했습니다(%줄 · 008 에 날짜 트리거가 생겼나요? 이 점검을 고칠 것)', n;
    end if;
  end if;

  -- ── 4) 미리보기(api adminPreviewMemberMerge 와 같은 꼴) ───────────────────────
  pv := public.admin_preview_member_merge(p_source_id => v_s, p_source_key => k_s, p_target_key => k_t);
  if coalesce((pv->>'ok')::boolean,false) is not true then
    raise exception 'member_merge_requests_devices: 미리보기가 실패했습니다 — %', pv->>'error';
  end if;
  if has_ios then
    got := concat_ws(',', pv->'source_counts'->>'ios_push_tokens', pv->'target_counts'->>'ios_push_tokens');
    if got is distinct from '2,1' then
      raise exception 'member_merge_requests_devices: 미리보기 기록 수(아이폰 기기 원본·대상)가 다릅니다 — 기대 2,1 · 실제 % (비었으면 옛 member_merge_counts)', got;
    end if;
  end if;
  if has_mhr then
    got := concat_ws(',', pv->'source_counts'->>'ministry_history_requests', pv->'target_counts'->>'ministry_history_requests');
    if got is distinct from '6,4' then
      raise exception 'member_merge_requests_devices: 미리보기 기록 수(정정 신청 원본·대상)가 다릅니다 — 기대 6,4 · 실제 % (비었으면 옛 member_merge_counts)', got;
    end if;
  end if;

  -- ── 5) 합치기 — api(adminMergeMembers)처럼 service_role 로, 같은 이름의 인자로 ─────────────
  begin
    set local role service_role;
    as_service := true;
  exception when others then
    raise notice 'member_merge_requests_devices: service_role 로 바꾸지 못해 지금 역할(%)로 부릅니다.', current_user;
  end;
  r := public.admin_merge_members(p_source_id => v_s, p_target_id => v_t, p_source_key => k_s,
                                  p_target_key => k_t, p_reason => '개발 점검 — 가상 성도 합치기(되돌림)');
  if as_service then execute format('set local role %I', prev_role); end if;   -- reset role 이 아니라 부르기 전 역할로
  if coalesce((r->>'ok')::boolean,false) is not true then
    raise exception 'member_merge_requests_devices: 합치기가 거절됐습니다 — % (고친 member_merge.sql 을 개발에 먼저 돌렸나요? 「merge-unsupported-records」면 옛 함수입니다)', r->>'error';
  end if;
  if exists(select 1 from public.users where id=v_s) then
    raise exception 'member_merge_requests_devices: 원본 users 행이 남았습니다';
  end if;

  -- ── 6) 아이폰 기기 ──────────────────────────────────────────────────
  if has_ios then
    if (r->'after_counts'->>'ios_push_tokens') is distinct from '3' then
      raise exception 'member_merge_requests_devices: 합친 뒤 아이폰 기기 수 — 기대 3 · 실제 %', r->'after_counts'->>'ios_push_tokens';
    end if;
    select count(*) into n from public.ios_push_tokens where user_id=v_s;
    if n <> 0 then raise exception 'member_merge_requests_devices: 아이폰 기기 — 원본 번호 줄이 %개 남았습니다', n; end if;
    select string_agg(id::text || ':' || hour, ',' order by id) into got from public.ios_push_tokens where user_id=v_t;
    want := (select string_agg(x, ',' order by i) from unnest(array[ts1::text || ':6', ts2::text || ':7', tt1::text || ':8']) with ordinality as u(x,i));
    if got is distinct from want then
      raise exception 'member_merge_requests_devices: 아이폰 기기 — 줄 번호·알림 시각이 그대로 옮겨지지 않았습니다. 기대 % · 실제 %', want, got;
    end if;
    -- 합친 뒤 옛 기기가 같은 기기 번호로 다시 등록(api saveIosPushToken: upsert onConflict device_token) → 한 줄 · 남는 쪽
    insert into public.ios_push_tokens(user_id,device_token,hour) values(v_s,tok_s1,5)
      on conflict(device_token) do update set user_id=excluded.user_id, hour=excluded.hour;
    select count(*), string_agg(user_id::text || ':' || hour, ',') into n, got from public.ios_push_tokens where device_token=tok_s1;
    if n <> 1 or got is distinct from v_t::text || ':5' then
      raise exception 'member_merge_requests_devices: 아이폰 기기 — 같은 기기를 옛 번호로 다시 등록했더니 % 줄(%) — 남는 쪽 한 줄이어야 한다', n, got;
    end if;
    insert into public.ios_push_tokens(user_id,device_token) values(v_s,tok_s3);
    if not exists(select 1 from public.ios_push_tokens where device_token=tok_s3 and user_id=v_t) then
      raise exception 'member_merge_requests_devices: 아이폰 기기 — 합친 뒤 옛 번호로 등록한 새 기기가 남는 쪽으로 가지 않았습니다(쓰기 연결 트리거)';
    end if;
    res_ios := '확인함';
  end if;

  -- ── 7) 정정 신청 ─────────────────────────────────────────────────────
  if has_mhr then
    if (r->'after_counts'->>'ministry_history_requests') is distinct from '8' then
      raise exception 'member_merge_requests_devices: 합친 뒤 정정 신청 수 — 기대 8(원본 6 + 대상 4 − 지운 열린 신청 2) · 실제 %', r->'after_counts'->>'ministry_history_requests';
    end if;
    select count(*) into n from public.ministry_history_requests where id in (drop_line, drop_find) or user_id=v_s;
    if n <> 0 then raise exception 'member_merge_requests_devices: 정정 신청 — 지워야 할 원본의 열린 신청(남는 쪽에 같은 줄이 열려 있던 것)이나 원본 번호 줄이 %개 남았습니다', n; end if;
    select string_agg(id::text || ':' || status, ',' order by id) into got from public.ministry_history_requests where user_id=v_t;
    want := (select string_agg(x.id::text || ':' || x.st, ',' order by x.id) from (values
      (keep_line_t,'확인 중'),(moved_open,'확인 중'),(closed_t,'반영 안 함'),(moved_closed,'반영'),
      (keep_find_t,'신청'),(moved_find_closed,'반영 안 함'),(moved_missing,'신청'),(keep_missing_t,'신청')) as x(id,st));
    if got is distinct from want then
      raise exception 'member_merge_requests_devices: 정정 신청 — 남은 줄(번호:상태)이 다릅니다. 기대 % · 실제 %', want, got;
    end if;
    if not exists(select 1 from public.ministry_history_requests where id=moved_open and who_name='합치기점검 옛 이름') then
      raise exception 'member_merge_requests_devices: 정정 신청 — 신청 때 이름 사본(who_name)이 바뀌었습니다(그때의 기록이라 그대로 두어야 한다)';
    end if;
    -- 날짜는 넣은 그제·어제 그대로여야 한다(합치기가 updated_at=now() 로 고치면 여기서 잡힌다)
    select count(*) into n from public.ministry_history_requests where user_id=v_t
      and (created_at is distinct from old_c or updated_at is distinct from old_u);
    if n <> 0 then
      raise exception 'member_merge_requests_devices: 정정 신청 — 합치기가 created_at·updated_at 을 %줄 바꿨습니다(담당자 화면의 「그사이 바뀜」 검사가 걸린다)', n;
    end if;
    -- 합친 뒤 옛 번호로 들어온 신청 → 남는 쪽. 남는 쪽에 같은 줄의 열린 신청이 있으면 부분 unique 가 막는다(23505 → already-open)
    insert into public.ministry_history_requests(user_id,kind,history_id) values(v_s,'not_mine',h0+3);
    if not exists(select 1 from public.ministry_history_requests where history_id=h0+3 and user_id=v_t) then
      raise exception 'member_merge_requests_devices: 정정 신청 — 합친 뒤 옛 번호로 들어온 신청이 남는 쪽으로 가지 않았습니다(쓰기 연결 트리거)';
    end if;
    begin
      insert into public.ministry_history_requests(user_id,kind,history_id) values(v_s,'other',h0+1);
      raise exception 'member_merge_requests_devices: 정정 신청 — 남는 쪽에 같은 줄의 열린 신청이 있는데 옛 번호로 또 열렸습니다(부분 unique mhr_open_line_uq 가 안 막았다)';
    exception when unique_violation then
      null;   -- 기대대로 막혔다 — 교회 어드민 internalHistoryRequest 는 이것을 already-open 으로 답한다
    end;
    -- 둘째 쌍 — 남는 쪽에 짝이 없는 열린 find_me · 다른 줄의 열린 신청은 열린 채 옮긴다
    insert into public.ministry_history_requests(user_id,kind,status,created_at,updated_at) values(v_s2,'find_me','신청',old_c,old_u) returning id into open_find2;
    insert into public.ministry_history_requests(user_id,kind,history_id,status,created_at,updated_at) values(v_s2,'not_mine',h0+4,'신청',old_c,old_u) returning id into open_l4;
    insert into public.ministry_history_requests(user_id,kind,history_id,status,created_at,updated_at) values(v_t2,'not_mine',h0+5,'확인 중',old_c,old_u) returning id into open_l5_t;
    r := public.admin_merge_members(p_source_id => v_s2, p_target_id => v_t2, p_source_key => k_s2,
                                    p_target_key => k_t2, p_reason => '개발 점검 — 가상 성도 합치기(되돌림)');
    if coalesce((r->>'ok')::boolean,false) is not true then
      raise exception 'member_merge_requests_devices: 둘째 쌍 합치기가 거절됐습니다 — %', r->>'error';
    end if;
    select string_agg(id::text || ':' || status, ',' order by id) into got from public.ministry_history_requests where user_id=v_t2;
    want := (select string_agg(x.id::text || ':' || x.st, ',' order by x.id) from (values
      (open_find2,'신청'),(open_l4,'신청'),(open_l5_t,'확인 중')) as x(id,st));
    if got is distinct from want then
      raise exception 'member_merge_requests_devices: 정정 신청(둘째 쌍) — 짝 없는 열린 신청은 열린 채 옮겨야 한다. 기대 % · 실제 %', want, got;
    end if;
    select count(*) into n from public.ministry_history_requests where user_id=v_t2
      and (created_at is distinct from old_c or updated_at is distinct from old_u);
    if n <> 0 then
      raise exception 'member_merge_requests_devices: 정정 신청(둘째 쌍) — 합치기가 created_at·updated_at 을 %줄 바꿨습니다', n;
    end if;
    res_mhr := '확인함';
  end if;

  -- ── 8) F2 — 합친 뒤 옛 번호로 온 「두 사람 사이」 줄 ──────────────────────────────
  insert into public.board_blocks(blocker_id,blocked_id,blocked_name) values(v_s,v_t,'합치기점검 F2 자기');
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'member_merge_requests_devices: 가리기 F2 — 옛 번호로 남는 쪽을 가린 줄이 %줄 들어갔습니다(0줄이어야 한다)', n;
  end if;
  if exists(select 1 from public.board_blocks where blocked_name='합치기점검 F2 자기' or (blocker_id=v_t and blocked_id=v_t)) then
    raise exception 'member_merge_requests_devices: 가리기 F2 — 자기 자신을 가린 줄이 생겼습니다';
  end if;
  insert into public.board_blocks(blocker_id,blocked_id,blocked_name) values(v_s,v_x,'합치기점검 F2 남');
  if not exists(select 1 from public.board_blocks where blocked_name='합치기점검 F2 남' and blocker_id=v_t and blocked_id=v_x) then
    raise exception 'member_merge_requests_devices: 가리기 F2 — 옛 번호로 남의 글을 가린 줄이 남는 쪽으로 가지 않았습니다';
  end if;
  begin
    insert into public.board_blocks(blocker_id,blocked_id,blocked_name) values(v_t,v_t,'합치기점검 자기');
    raise exception 'member_merge_requests_devices: 가리기 — 처음부터 자기 자신인 줄을 CHECK 가 막지 않았습니다(트리거가 CHECK 를 덮으면 안 된다)';
  exception when check_violation then
    null;   -- 기대대로 막혔다(api 는 그 전에 own 으로 돌려보낸다)
  end;
  if has_cheer then
    insert into public.rank_cheers(target_user_id,from_user_id,cheer_date,from_name) values(v_t::text,v_s::text,current_date,'합치기점검 F2');
    get diagnostics n = row_count;
    if n <> 0 or exists(select 1 from public.rank_cheers where target_user_id=v_t::text and from_user_id=v_t::text) then
      raise exception 'member_merge_requests_devices: 응원 F2 — 옛 번호로 남는 쪽에 보낸 응원이 자기 응원으로 남았습니다';
    end if;
    res_cheer := '확인함';
  end if;

  perform set_config('mmcheck.result', format('member_merge_requests_devices: 통과 — 정정 신청 %s · 아이폰 기기 %s · 가리기 F2 확인함 · 응원 F2 %s (합치기를 부른 역할: %s)',
    res_mhr, res_ios, res_cheer, case when as_service then 'service_role' else current_user::text end), true);
  raise notice '%', current_setting('mmcheck.result');
end
$check$;

select current_setting('mmcheck.result', true) as result;

rollback;
