-- member_profile.sql 다음. 개발 검증 후 운영에 적용한다.
-- 실제 병합은 관리자 미리보기/동일인 확인을 거친 RPC 호출에서만 수행한다.
--
-- ■ 실행 순서(개발 먼저 → 운영) — 여러 번 돌려도 안전하다(create or replace · 트리거는 지우고 다시 단다)
--   1) schema.sql · app_config.sql · member_profile.sql (처음 한 번)
--   2) 사용자 연관 표·칸을 만드는 SQL — users_consents.sql · board_blocks.sql · board_reports.sql ·
--      sermon_answer_reports.sql (2026-10-01) · ios_push_tokens.sql · push_evening.sql (2026-09-15·23) ·
--      교회 어드민 저장소 supabase/sql/008_ministry_history_requests.sql (2026-10-01 · 정정 신청) ·
--      edu.sql (2026-10-05 · 교육신청).
--      ⚠️ 표가 **먼저** 있어야 아래 쓰기 연결 트리거가 그 표에 붙는다. 없는 표는 건너뛴다(to_regclass) —
--      나중에 그 표를 만들면 이 파일을 **다시** 돌린다(교회 어드민이 008 표를 지웠다 다시 만들어도 마찬가지).
--   3) 이 파일 전체
--   4) **개발에서만** — 가상 성도로 합쳐 보고 전부 되돌린다(BEGIN … ROLLBACK). 운영에서는 돌리지 않는다.
--      supabase/tests/member_merge_consents.dev.sql          (가리기·신고·AI 답 알림·동의 날짜)
--      supabase/tests/member_merge_requests_devices.dev.sql  (정정 신청 · 아이폰 알림 기기 · 합친 뒤 옛 번호로 온 가리기)
--      「통과」 줄이 나오거나 오류 없이 끝나야 한다.
--   ⚠️ 새 사용자 연관 표를 만들면 ① 합치기 본체의 옮기기 ② 두 허용 목록(FK·user_id) ③ member_merge_counts
--      ④ 쓰기 연결 트리거 — 넷을 함께 더하고 이 파일을 다시 돌린다. 빠뜨리면 그 기록이 있는 계정은
--      merge-unsupported-records 로 멈춘다(기록은 안 잃는다 — 2026-10-01 가리기·신고·AI 답 알림이 그랬고,
--      감사해 보니 아이폰 알림 기기(2026-09-15)·정정 신청(2026-10-01)도 그랬다 — 둘째 판에서 넣었다).
begin;
set local lock_timeout = '5s';   -- 표 스물한 개에 트리거를 다시 다는 DDL 이 긴 질의 뒤에 줄 서서 앱 쓰기까지 멈춰 세우지 않게 5초만 기다린다(넘으면 이 파일 전체가 되돌려진다 — 그대로 다시 돌리면 된다)
create table if not exists public.user_merges (
  source_user_id uuid primary key,
  target_user_id uuid not null references public.users(id),
  source_profile jsonb not null,
  target_profile jsonb not null,
  reason text not null,
  created_at timestamptz not null default now(),
  check (source_user_id <> target_user_id)
);
alter table public.user_merges enable row level security;
revoke all on public.user_merges from public, anon, authenticated;
grant all on public.user_merges to service_role;
create index if not exists user_merges_target on public.user_merges(target_user_id);

-- 예전 앱이 합치기 전 번호로 저장하더라도 대상 사용자에게 기록된다.
-- 합치기와 저장이 겹치면 트랜잭션 잠금을 기다린 뒤 최신 연결을 확인한다.
-- 두 사람 사이의 줄(칸 둘 — 가리기 board_blocks · 응원 rank_cheers)이 **옮긴 결과** 두 칸이 같은 사람이 되면 그 줄은 버린다
--   (return null — 넣지도 고치지도 않는다 · 오류 없음). 합치기 본체도 두 계정 사이 줄을 버리고(가리기) 자기 응원을 지운다(응원).
--   2026-10-01 검토 F2: 합치는 바로 그 순간 옛 기기가 「남는 쪽 글」을 가리면 api 는 (옛 번호, 남는 번호)를 넣고, 이 트리거가
--   (남는, 남는)으로 바꿔 CHECK board_blocks_not_self(23514)에 걸려 HTTP 500 이 났다. 이제 0줄로 끝나고 api 는 { ok:true } 를 준다
--   (api 입구가 옛 번호를 먼저 남는 번호로 바꾸므로, 평소에는 api 의 own 검사가 먼저 막는다 — 이 길은 그 사이의 경합뿐이다).
--   옮기지 않은 줄(처음부터 같은 사람)은 그대로 두어 CHECK 가 계속 지킨다.
create or replace function public.redirect_merged_member_write()
returns trigger language plpgsql security invoker set search_path = public as $$
declare col text; original text; resolved uuid; row_data jsonb := to_jsonb(new); saved_stage integer; moved boolean := false;
begin
  perform pg_advisory_xact_lock(7240910, 1);
  foreach col in array tg_argv loop
    original := row_data->>col;
    if original ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      select target_user_id into resolved from public.user_merges where source_user_id = original::uuid;
      if found then row_data := jsonb_set(row_data, array[col], to_jsonb(resolved::text)); moved := true; end if;
    end if;
  end loop;
  if moved and tg_nargs = 2 and lower(row_data->>tg_argv[0]) = lower(row_data->>tg_argv[1]) then
    return null;
  end if;
  if tg_table_name='progress' then
    select stage into saved_stage from public.progress where user_id=(row_data->>'user_id')::uuid
      and verse_no=(row_data->>'verse_no')::int and lang=row_data->>'lang';
    if found then row_data := jsonb_set(row_data, '{stage}', to_jsonb(greatest(saved_stage,(row_data->>'stage')::int))); end if;
  end if;
  new := jsonb_populate_record(new, row_data);
  return new;
end;
$$;
revoke all on function public.redirect_merged_member_write() from public, anon, authenticated;
grant execute on function public.redirect_merged_member_write() to service_role;
do $$
declare t text;
begin
  -- 2026-10-02 둘째 판 — 아이폰 알림 기기(ios_push_tokens) · 정정 신청(ministry_history_requests · 교회 어드민 008).
  --   정정 신청에도 다는 까닭: 「새 사용자 연관 표는 넷(옮기기·허용 목록·기록 수·트리거)을 함께」가 이 파일의 규칙이고,
  --   이 표엔 FK 가 없어 합친 뒤 옛 번호로 들어온 신청은 **아무 오류 없이** 사라진 계정 번호에 붙어 성도님 화면에서 안 보인다.
  --   트리거가 남는 번호로 옮긴다 — 남는 쪽에 같은 줄의 열린 신청이 이미 있으면 부분 unique 가 23505 로 막고,
  --   교회 어드민 internalHistoryRequest 가 already-open 으로 답한다(500 아님).
  foreach t in array array['progress','challenge_log','reviews','passage_progress','blessing_log','feature_log',
    'board_posts','board_replies','board_reactions','event_entries','push_subscriptions',
    'pilsa_orders','ministry_orders','event_signups','daily_activity',
    'ios_push_tokens','ministry_history_requests','edu_enrollments'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists redirect_merged_member_write on public.%I', t);
      execute format('create trigger redirect_merged_member_write before insert or update on public.%I for each row execute function public.redirect_merged_member_write(''user_id'')', t);
    end if;
  end loop;
  if to_regclass('public.rank_cheers') is not null then
    drop trigger if exists redirect_merged_member_write on public.rank_cheers;
    create trigger redirect_merged_member_write before insert or update on public.rank_cheers
      for each row execute function public.redirect_merged_member_write('from_user_id','target_user_id');
  end if;
  -- 2026-10-01 — 사용자 칸 이름이 user_id 가 아닌 표(구글 출시 심사 전): 가리기 · 게시판 신고 · AI 답 알림
  if to_regclass('public.board_blocks') is not null then
    drop trigger if exists redirect_merged_member_write on public.board_blocks;
    create trigger redirect_merged_member_write before insert or update on public.board_blocks
      for each row execute function public.redirect_merged_member_write('blocker_id','blocked_id');
  end if;
  foreach t in array array['board_reports','sermon_answer_reports'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists redirect_merged_member_write on public.%I', t);
      execute format('create trigger redirect_merged_member_write before insert or update on public.%I for each row execute function public.redirect_merged_member_write(''reporter_id'')', t);
    end if;
  end loop;
end $$;

create or replace function public.member_merge_counts(p_id uuid)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare t text; n bigint; result jsonb := '{}';
begin
  -- ⚠️ 이 목록은 **합치기 본체가 실제로 옮기는 표**와 같아야 한다. 여기 없는 표는 미리보기
  --    (adminPreviewMemberMerge)에 아예 안 보이고 합친 뒤 before/after 에도 흔적이 안 남는다 —
  --    옮기기는 제대로 되는데 담당자 눈에는 「그런 기록이 없었다」로 보인다.
  --    2026-09-23 에 blessing_log·daily_activity·feature_log 셋이 이렇게 빠져 있었다.
  --    2026-10-02 둘째 판: ios_push_tokens(아이폰 알림 기기) · ministry_history_requests(정정 신청 — 원본 수 + 대상 수 −
  --    합친 뒤 수 = 지운 열린 신청 수. 남는 쪽에 같은 줄의 열린 신청이 있던 것만 지운다).
  foreach t in array array['challenge_log','progress','reviews','passage_progress','board_posts',
    'board_replies','event_entries','pilsa_orders','ministry_orders','event_signups','push_subscriptions',
    'blessing_log','daily_activity','feature_log','ios_push_tokens','ministry_history_requests','edu_enrollments'] loop
    if to_regclass('public.' || t) is not null then
      execute format('select count(*) from public.%I where user_id::text=$1',t) into n using p_id::text;
      result := result || jsonb_build_object(t,n);
    end if;
  end loop;
  -- 사용자 칸 이름이 다른 표(2026-10-01). 가리기는 가린 줄과 가려진 줄을 함께 센다(합치면 둘 다 옮긴다).
  if to_regclass('public.board_blocks') is not null then
    select count(*) into n from public.board_blocks where blocker_id=p_id or blocked_id=p_id;
    result := result || jsonb_build_object('board_blocks',n);
  end if;
  if to_regclass('public.board_reports') is not null then
    select count(*) into n from public.board_reports where reporter_id=p_id;
    result := result || jsonb_build_object('board_reports',n);
  end if;
  if to_regclass('public.sermon_answer_reports') is not null then
    select count(*) into n from public.sermon_answer_reports where reporter_id=p_id;
    result := result || jsonb_build_object('sermon_answer_reports',n);
  end if;
  return result;
end;
$$;

create or replace function public.admin_preview_member_merge(p_source_id uuid, p_source_key text, p_target_key text)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare s public.users; t public.users;
begin
  select * into s from public.users where id=p_source_id;
  if not found or s.identity_key is distinct from p_source_key then
    return jsonb_build_object('ok',false,'error','member-changed');
  end if;
  select * into t from public.users where identity_key=p_target_key;
  if not found then
    select u.* into t from public.user_identity_aliases a join public.users u on u.id=a.user_id where a.identity_key=p_target_key;
  end if;
  if t.id is null or t.id=s.id then return jsonb_build_object('ok',false,'error','merge-target-missing'); end if;
  return jsonb_build_object('ok',true,'source',to_jsonb(s),'target',to_jsonb(t),
    'source_counts',public.member_merge_counts(s.id),'target_counts',public.member_merge_counts(t.id));
end;
$$;

create or replace function public.admin_merge_members(p_source_id uuid, p_target_id uuid,
  p_source_key text, p_target_key text, p_reason text)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare s public.users; t public.users; ref record; n bigint; before_counts jsonb;
begin
  if p_source_id = p_target_id or nullif(btrim(p_reason),'') is null or length(p_reason)>300 then
    return jsonb_build_object('ok',false,'error','invalid-merge');
  end if;
  perform pg_advisory_xact_lock(7240910, 1);
  select * into s from public.users where id=p_source_id for update;
  select * into t from public.users where id=p_target_id for update;
  -- 통신 오류 뒤 같은 요청을 다시 보내도 합치기는 한 번만 수행한다.
  if s.id is null and t.id is not null and exists(select 1 from public.user_merges
    where source_user_id=p_source_id and target_user_id=p_target_id) then
    return jsonb_build_object('ok',true,'merged',true,'already_merged',true,'user',to_jsonb(t));
  end if;
  if s.id is null or t.id is null or s.identity_key is distinct from p_source_key or t.identity_key is distinct from p_target_key then
    return jsonb_build_object('ok',false,'error','member-changed');
  end if;
  -- 사역/상세 이벤트 신청은 답변·연락처·관리 상태를 임의로 덮어쓸 수 없다.
  if to_regclass('public.ministry_orders') is not null then
    if exists(select 1 from public.ministry_orders a join public.ministry_orders b
      on a.year=b.year and a.team_id=b.team_id where a.user_id=s.id::text and b.user_id=t.id::text) then
      return jsonb_build_object('ok',false,'error','merge-ministry-conflict');
    end if;
  end if;
  if to_regclass('public.event_signups') is not null then
    if exists(select 1 from public.event_signups a join public.event_signups b on a.event_id=b.event_id
      where a.user_id=s.id and b.user_id=t.id) then
      return jsonb_build_object('ok',false,'error','merge-signup-conflict');
    end if;
  end if;
  if to_regclass('public.edu_enrollments') is not null then
    -- 두 계정이 같은 강좌에 **살아 있는** 신청(신청·확정·대기 · 그리고 반려 — 2026-10-05 친구 「반려 유지」: 반려는 담당자가 정한 기록이라
    --   합치면서 지우거나 덮지 않는다)을 함께 가지면 멈춘다 — 담당자가 한쪽을 정리한 뒤 합친다.
    if exists(select 1 from public.edu_enrollments a join public.edu_enrollments b on a.course_id=b.course_id
      where a.user_id=s.id and b.user_id=t.id
        and a.status in ('applied','confirmed','waitlisted','declined') and b.status in ('applied','confirmed','waitlisted','declined')) then
      return jsonb_build_object('ok',false,'error','merge-edu-conflict');
    end if;
  end if;
  -- 새 기능이 추가되어도 모르는 FK를 cascade 삭제하지 않는다. auth.users 참조는 제외.
  for ref in select c.conrelid::regclass as tbl, a.attname as col
    from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=any(c.conkey)
    where c.contype='f' and c.confrelid='public.users'::regclass and c.conrelid not in
      ('public.user_merges'::regclass,'public.user_identity_aliases'::regclass,'public.user_profile_changes'::regclass)
  loop
    if ref.tbl::text not in ('progress','challenge_log','reviews','passage_progress','blessing_log','feature_log',
      'push_subscriptions','board_posts','board_replies','event_signups',
      'board_blocks','board_reports','sermon_answer_reports',
      'ios_push_tokens','ministry_history_requests','edu_enrollments') then
      execute format('select count(*) from %s where %I::text=$1',ref.tbl,ref.col) into n using s.id::text;
      if n>0 then return jsonb_build_object('ok',false,'error','merge-unsupported-records'); end if;
    end if;
  end loop;
  for ref in select c.table_name as tbl,c.column_name as col
    from information_schema.columns c join information_schema.tables b
      on b.table_schema=c.table_schema and b.table_name=c.table_name
    where c.table_schema='public' and b.table_type='BASE TABLE' and c.column_name='user_id'
      and c.table_name not in ('progress','challenge_log','reviews','passage_progress','blessing_log','feature_log',
        'push_subscriptions','board_posts','board_replies','board_reactions','event_entries',
        'daily_activity','pilsa_orders','ministry_orders','event_signups','user_identity_aliases','user_profile_changes',
        'board_blocks','board_reports','sermon_answer_reports',
        'ios_push_tokens','ministry_history_requests','edu_enrollments')
  loop
    execute format('select count(*) from public.%I where %I::text=$1',ref.tbl,ref.col) into n using s.id::text;
    if n>0 then return jsonb_build_object('ok',false,'error','merge-unsupported-records'); end if;
  end loop;
  before_counts := jsonb_build_object('source',public.member_merge_counts(s.id),'target',public.member_merge_counts(t.id));

  insert into public.progress(user_id,verse_no,lang,stage,updated_at,hearted,hearted_at)
    select t.id,verse_no,lang,stage,updated_at,hearted,hearted_at from public.progress where user_id=s.id
    on conflict(user_id,verse_no,lang) do update set
      stage=greatest(progress.stage,excluded.stage),updated_at=greatest(progress.updated_at,excluded.updated_at),
      hearted=coalesce(progress.hearted,false) or coalesce(excluded.hearted,false),
      hearted_at=least(progress.hearted_at,excluded.hearted_at);
  delete from public.progress where user_id=s.id;
  -- 마지막으로 복습한 쪽의 일정 한 벌을 유지한다(날짜와 상자를 섞지 않는다).
  insert into public.reviews(user_id,verse_no,box,due_at,last_at)
    select t.id,verse_no,box,due_at,last_at from public.reviews where user_id=s.id
    on conflict(user_id,verse_no) do update set box=excluded.box,due_at=excluded.due_at,last_at=excluded.last_at
    where coalesce(excluded.last_at,'-infinity'::date)>coalesce(reviews.last_at,'-infinity'::date);
  delete from public.reviews where user_id=s.id;
  if to_regclass('public.passage_progress') is not null then
    insert into public.passage_progress(user_id,passage_id,done_seq,completed_at,updated_at)
      select t.id,passage_id,done_seq,completed_at,updated_at from public.passage_progress where user_id=s.id
      on conflict(user_id,passage_id) do update set
        done_seq=array(select distinct x from unnest(passage_progress.done_seq || excluded.done_seq) as x order by x),
        completed_at=least(passage_progress.completed_at,excluded.completed_at),
        updated_at=now();
    delete from public.passage_progress where user_id=s.id;
  end if;
  if to_regclass('public.blessing_log') is not null then
    insert into public.blessing_log(user_id,day,no,cnt)
      select t.id,day,no,cnt from public.blessing_log where user_id=s.id
      on conflict(user_id,day,no) do update set cnt=blessing_log.cnt+excluded.cnt;
    delete from public.blessing_log where user_id=s.id;
  end if;
  if to_regclass('public.feature_log') is not null then
    insert into public.feature_log(user_id,day,feature,item,cnt)
      select t.id,day,feature,item,cnt from public.feature_log where user_id=s.id
      on conflict(user_id,day,feature,item) do update set cnt=feature_log.cnt+excluded.cnt;
    delete from public.feature_log where user_id=s.id;
  end if;
  if to_regclass('public.event_entries') is not null then
    insert into public.event_entries(event_id,user_id,entered_at)
      select event_id,t.id::text,entered_at from public.event_entries where user_id=s.id::text
      on conflict(event_id,user_id) do update set entered_at=least(event_entries.entered_at,excluded.entered_at);
    delete from public.event_entries where user_id=s.id::text;
  end if;
  if to_regclass('public.board_reactions') is not null then
    insert into public.board_reactions(target,target_id,user_id,emoji,who,created_at)
      select target,target_id,t.id::text,emoji,who,created_at from public.board_reactions where user_id=s.id::text
      on conflict(target,target_id,user_id,emoji) do nothing;
    delete from public.board_reactions where user_id=s.id::text;
  end if;
  if to_regclass('public.rank_cheers') is not null then
    insert into public.rank_cheers(target_user_id,from_user_id,cheer_date,from_name,created_at)
      select case when target_user_id=s.id::text then t.id::text else target_user_id end,
        case when from_user_id=s.id::text then t.id::text else from_user_id end,cheer_date,from_name,created_at
      from public.rank_cheers where target_user_id=s.id::text or from_user_id=s.id::text
      on conflict(target_user_id,from_user_id,cheer_date) do nothing;
    delete from public.rank_cheers where target_user_id=s.id::text or from_user_id=s.id::text;
    delete from public.rank_cheers where target_user_id=t.id::text and from_user_id=t.id::text;
  end if;
  -- 게시판 가리기(2026-10-01 board_blocks.sql) — 응원처럼 두 사람 사이의 줄이다. 가린 쪽·가려진 쪽 칸을 모두 남는 번호로.
  -- 두 계정 사이의 줄(원본↔대상)은 옮기면 자기 자신을 가리게 되므로 버린다(CHECK board_blocks_not_self).
  -- 같은 분을 두 계정이 다 가렸으면(또는 같은 분이 두 계정을 다 가렸으면) 남는 쪽 줄 하나만(unique board_blocks_once).
  if to_regclass('public.board_blocks') is not null then
    insert into public.board_blocks(blocker_id,blocked_id,blocked_name,created_at)
      select case when blocker_id=s.id then t.id else blocker_id end,
        case when blocked_id=s.id then t.id else blocked_id end,blocked_name,created_at
      from public.board_blocks where (blocker_id=s.id or blocked_id=s.id)
        and not (blocker_id in (s.id,t.id) and blocked_id in (s.id,t.id))
      on conflict(blocker_id,blocked_id) do nothing;
    delete from public.board_blocks where blocker_id=s.id or blocked_id=s.id;
  end if;
  -- 게시판 신고 · AI 답 알림(2026-10-01) — 줄 번호와 처리 상태를 지킨 채 신고한 분만 옮긴다(관리자가 줄 번호로 처리한다).
  -- 같은 글(답글) · 같은 질문을 두 계정이 다 신고했으면 한 줄만 남긴다(unique — 한 분이 한 번만):
  --   처리 전 줄이 원본에만 있으면 그 줄을 남기고(처리 전 신고가 관리자 목록에서 사라지면 안 된다), 아니면 남는 쪽 줄을 남긴다.
  if to_regclass('public.board_reports') is not null then
    delete from public.board_reports b using public.board_reports a
      where a.reporter_id=s.id and b.reporter_id=t.id and b.post_id=a.post_id
        and coalesce(b.reply_id,0)=coalesce(a.reply_id,0) and a.resolved_at is null and b.resolved_at is not null;
    delete from public.board_reports a where a.reporter_id=s.id and exists(select 1 from public.board_reports b
      where b.reporter_id=t.id and b.post_id=a.post_id and coalesce(b.reply_id,0)=coalesce(a.reply_id,0));
    update public.board_reports set reporter_id=t.id where reporter_id=s.id;
  end if;
  if to_regclass('public.sermon_answer_reports') is not null then
    delete from public.sermon_answer_reports b using public.sermon_answer_reports a
      where a.reporter_id=s.id and b.reporter_id=t.id and md5(b.question)=md5(a.question)
        and a.resolved_at is null and b.resolved_at is not null;
    delete from public.sermon_answer_reports a where a.reporter_id=s.id and exists(select 1 from public.sermon_answer_reports b
      where b.reporter_id=t.id and md5(b.question)=md5(a.question));
    update public.sermon_answer_reports set reporter_id=t.id where reporter_id=s.id;
  end if;
  -- 아이폰 알림 기기(ios_push_tokens · 2026-09-15) — 기기 줄을 그대로 두고 주인만 남는 번호로.
  --   알림 시각(hour)·저녁(evening)은 기기 줄의 것 그대로(웹 알림 push_subscriptions 와 같은 대접).
  --   device_token 은 표 전체에서 unique 라 두 계정이 같은 기기를 가질 수 없다 — 그래도 겹치면(unique 를 바꾼 DB)
  --   남는 쪽 줄 하나만 둔다. ⚠️ 옮기지 않으면 맨 아래 users 삭제의 on delete cascade 가 이 줄을 **조용히** 지운다.
  if to_regclass('public.ios_push_tokens') is not null then
    delete from public.ios_push_tokens a where a.user_id=s.id and exists(select 1 from public.ios_push_tokens b
      where b.user_id=t.id and b.device_token=a.device_token);
    update public.ios_push_tokens set user_id=t.id where user_id=s.id;
  end if;
  -- 사역 이력 정정 신청(ministry_history_requests · 교회 어드민 008 · 2026-10-01) — 정한 규칙(그 표의 주인 세션 a8 과 맞춤):
  --   ① 남는 쪽에 **같은 줄**(history_id)의 열린 신청이 이미 있으면 — find_me 는 남는 쪽에 열린 find_me 가 있으면 —
  --      원본의 그 **열린** 신청은 지운다. 「반영 안 함」으로 닫지 않는다(성도님 화면에 거절로 보인다).
  --   ② 나머지(닫힌 신청 · 남는 쪽에 짝이 없는 열린 신청 · missing)는 user_id 만 남는 번호로. 상태는 절대 안 바꾼다.
  --      줄 번호·updated_at·교인ID(person_id)·신청 때 이름 사본(who_*)은 그대로 — 게시글 이름처럼 그때의 기록이다.
  --   열린 = status in ('신청','확인 중') — 008 의 부분 unique 둘(mhr_open_line_uq (user_id,history_id) ·
  --   mhr_open_find_uq (user_id) where kind='find_me')과 같은 조건이라 ①을 지우고 나면 ②가 unique 에 걸리지 않는다.
  --   ⚠️ 교회 어드민 history-check.ts REQ_OPEN 과 같은 글자다 — 그쪽이 상태를 늘리면 여기도 고친다.
  --   표가 없는 DB(개발·다른 DB · 008 전)에서는 건너뛴다.
  if to_regclass('public.ministry_history_requests') is not null then
    delete from public.ministry_history_requests a
      where a.user_id=s.id and a.status in ('신청','확인 중')
        and exists(select 1 from public.ministry_history_requests b
          where b.user_id=t.id and b.status in ('신청','확인 중')
            and ((a.history_id is not null and b.history_id=a.history_id) or (a.kind='find_me' and b.kind='find_me')));
    update public.ministry_history_requests set user_id=t.id where user_id=s.id;
  end if;
  -- 보호자 확인 · 게시판 이용 규칙 동의 날짜(2026-10-01 users_consents.sql) — users 칸이라 남는 쪽 행에 받아 둔다.
  --   보호자 확인은 「처음 한 번」 — 남는 쪽에 있으면 그대로, 없으면 원본 날짜(coalesce).
  --   규칙 동의는 「마지막」 — 더 늦은 날짜(greatest 는 null 을 건너뛴다). 서버가 BOARD_RULES_SINCE 보다 이르면 다시 묻기
  --   때문에, 남는 쪽의 옛 동의를 고집하면 원본에서 새 규칙에 동의한 분께 한 번 더 묻게 된다.
  --   칸이 없는 DB(users_consents.sql 전)에서는 건너뛴다. user_merges.source_profile 에는 원본 날짜가 그대로 남는다.
  --   (칸 확인은 pg_attribute 로 — information_schema 는 부르는 역할의 권한으로 걸러 보여 주어, 권한이 어긋나면 조용히 건너뛴다.)
  if (select count(*) from pg_attribute where attrelid='public.users'::regclass
      and attname in ('guardian_ok_at','board_rules_at') and attnum>0 and not attisdropped)=2 then
    update public.users u set guardian_ok_at=coalesce(u.guardian_ok_at,s.guardian_ok_at),
      board_rules_at=greatest(u.board_rules_at,s.board_rules_at) where u.id=t.id;
  end if;
  -- 교육신청 — 같은 강좌에 두 줄이 남지 않게(unique(course_id,user_id)) 한쪽이 **취소** 줄이면 취소 줄을 지운다
  --   (반려·살아 있는 줄이 함께인 경우는 위 충돌 검사가 이미 멈췄다). 원본이 취소면 원본 줄을, 남는 쪽이 취소면 남는 쪽 줄을,
  --   둘 다 취소면 원본 줄만(남는 쪽 기록을 남긴다). 뒤 오류 반환에 지운 줄이 남지 않게 검사가 모두 끝난 여기서 지운다.
  if to_regclass('public.edu_enrollments') is not null then
    delete from public.edu_enrollments a using public.edu_enrollments b
      where a.course_id=b.course_id and a.user_id=s.id and b.user_id=t.id and a.status = 'cancelled';
    delete from public.edu_enrollments b using public.edu_enrollments a
      where a.course_id=b.course_id and a.user_id=s.id and b.user_id=t.id and b.status = 'cancelled';
  end if;
  -- 로그/게시물/신청/구독은 행을 삭제하거나 다시 생성하지 않고 소유자만 옮긴다.
  for ref in select table_name,data_type from information_schema.columns where table_schema='public'
    and column_name='user_id' and table_name in ('challenge_log','board_posts','board_replies',
      'push_subscriptions','pilsa_orders','ministry_orders','event_signups','user_profile_changes','user_identity_aliases','edu_enrollments')
  loop
    execute format('update public.%I set user_id=$1::%s where user_id=$2::%s',ref.table_name,ref.data_type,ref.data_type)
      using t.id::text,s.id::text;
  end loop;
  -- challenge_log의 기존 트리거는 UPDATE를 집계하지 않는다. 두 사람의 집계를 로그로 재생성.
  if to_regclass('public.daily_activity') is not null then
    delete from public.daily_activity where user_id in(s.id::text,t.id::text);
    insert into public.daily_activity(day,user_id,mode,cnt)
      select (created_at at time zone 'Asia/Seoul')::date,t.id::text,mode,count(*)::int
      from public.challenge_log where user_id=t.id group by 1,3;
  end if;
  update public.app_config c set value=(select jsonb_agg(distinct case when k=s.identity_key then t.identity_key else k end)
    from jsonb_array_elements_text(c.value) as keys(k)),updated_at=now()
    where c.key='pilsaAdmins' and c.value ? s.identity_key;
  insert into public.user_identity_aliases(identity_key,user_id) values(s.identity_key,t.id)
    on conflict(identity_key) do update set user_id=excluded.user_id;
  update public.user_merges set target_user_id=t.id where target_user_id=s.id;
  insert into public.user_merges(source_user_id,target_user_id,source_profile,target_profile,reason)
    values(s.id,t.id,to_jsonb(s),to_jsonb(t),p_reason);
  -- user_merges 에는 합치기 **전** 두 프로필을 남겼다. 이력과 돌려주는 user 는 받아 둔 동의 날짜가 든 지금 행으로.
  select * into t from public.users where id=t.id;
  insert into public.user_profile_changes(user_id,before_profile,after_profile,reason)
    values(t.id,to_jsonb(s),to_jsonb(t),'기록 합치기: ' || p_reason);
  delete from public.users where id=s.id;
  return jsonb_build_object('ok',true,'merged',true,'user',to_jsonb(t),'before_counts',before_counts,
    'after_counts',public.member_merge_counts(t.id));
end;
$$;
revoke all on function public.member_merge_counts(uuid) from public,anon,authenticated;
revoke all on function public.admin_preview_member_merge(uuid,text,text) from public,anon,authenticated;
revoke all on function public.admin_merge_members(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.member_merge_counts(uuid) to service_role;
grant execute on function public.admin_preview_member_merge(uuid,text,text) to service_role;
grant execute on function public.admin_merge_members(uuid,uuid,text,text,text) to service_role;
commit;
