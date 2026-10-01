-- 기록 합치기 점검 — 가리기 · 게시판 신고 · AI 답 알림 · 동의 날짜를 옮기는가 (2026-10-01)
-- ⚠️ 이 저장소는 공개(public)입니다 — 비밀번호·키·실명을 절대 넣지 마세요. 아래 이름은 모두 가상입니다.
--
-- ■ 무엇을 보나: supabase/member_merge.sql 의 admin_merge_members 가 api(adminMergeMembers)와 같은 꼴로 불렸을 때
--   ① board_blocks — 가린 쪽·가려진 쪽 칸을 남는 번호로 옮기고, 두 계정 사이 줄은 버리고, 겹치면 남는 쪽 줄 하나
--   ② board_reports · sermon_answer_reports — 줄 번호·처리 상태를 지킨 채 신고한 분만 옮기고, 겹치면 한 줄
--      (처리 전 줄이 원본에만 있으면 그 줄, 아니면 남는 쪽 줄)
--   ③ users.guardian_ok_at(남는 쪽 우선 · 없으면 원본) · users.board_rules_at(더 늦은 날짜)
--   ④ 미리보기·합친 뒤 기록 수(member_merge_counts)에 세 표가 보이고, 다시 불러도 한 번만(already_merged),
--      합친 뒤 옛 번호로 들어온 신고도 남는 쪽으로 간다(쓰기 연결 트리거)
--
-- ■ 언제 · 어디서: **개발(ktpwthwqzgcqcrmsafdo) 전용.** 고친 member_merge.sql 을 개발에 **먼저** 돌린 다음.
--   (옛 함수면 merge-unsupported-records 로 떨어진다 — 이 점검이 바로 그걸 잡으려는 것이다.)
--   users 가 200명이 넘으면 운영으로 보고 아무것도 하지 않고 멈춘다(개발은 수십 명 · 운영은 사백이 넘는다).
--
-- ■ 남는 것: 없다. 처음부터 끝까지 BEGIN … ROLLBACK 이다 — 가상 성도·글·신고·가리기 줄 모두 되돌린다.
--   (합치기가 잠깐 거는 잠금 pg_advisory_xact_lock(7240910,1) 도 ROLLBACK 과 함께 풀린다.)
--
-- ■ 실행(컨트롤러):
--   supabase --workdir <개발에 link 한 스크래치 폴더> db query --linked "select count(*) from users"   -- 수십이면 개발
--   supabase --workdir <같은 폴더> db query --linked -f <이 파일의 절대 경로>
--   ⚠️ 한글이 든 SQL 은 명령줄에 붙이지 말고 이 파일(-f)로만 — 명령줄 한글은 깨진다.
--
-- ■ 결과 읽기: 통과면 'member_merge_consents: 통과' 한 줄. CLI 가 마지막 문(ROLLBACK)의 결과만 보여 주면
--   빈 결과로 보일 수 있다 — 그때는 **ERROR 가 없으면 통과**다. 떨어지면
--   ERROR: member_merge_consents: <무엇이 틀렸나> 가 나온다. 어느 쪽이든 아무것도 남지 않는다.

begin;

do $check$
declare
  tag  text := left(md5(random()::text || clock_timestamp()::text), 8);   -- 가상 식별자가 진짜와도, 동시 실행과도 안 겹치게
  k_s  text; k_t  text; k_x  text; k_y  text; k_s2 text; k_t2 text;
  v_s  uuid; v_t  uuid; v_x  uuid; v_y  uuid; v_s2 uuid; v_t2 uuid;
  p1 bigint; p2 bigint; p3 bigint; r1 bigint;
  keep_ty bigint; keep_yt bigint;                       -- 가리기: 겹쳐서 남아야 할 남는 쪽 줄
  keep_t1 bigint; open_s bigint; moved_s bigint;        -- 게시판 신고
  keep_tq bigint; open_sq bigint; moved_q bigint;       -- AI 답 알림
  pv jsonb; r jsonb; n int; got text; as_service boolean := false;
  prev_role text := current_user;   -- 합치기 뒤 돌아올 역할(reset role 은 CLI 의 로그인 역할 cli_login_* 로 떨어질 수 있다)
  g timestamptz; b timestamptz;
begin
  -- ── 0) 여기가 개발인가 · 준비물이 있나 ─────────────────────────────
  select count(*) into n from public.users;
  if n > 200 then
    raise exception 'member_merge_consents: users 가 %명 — 운영으로 보여 멈춥니다. 이 점검은 개발에서만 돌립니다.', n;
  end if;
  if to_regclass('public.board_blocks') is null or to_regclass('public.board_reports') is null
     or to_regclass('public.sermon_answer_reports') is null then
    raise exception 'member_merge_consents: 개발에 board_blocks · board_reports · sermon_answer_reports 표가 없습니다 — 그 SQL 셋을 먼저 돌리세요.';
  end if;
  if (select count(*) from information_schema.columns where table_schema='public' and table_name='users'
      and column_name in ('guardian_ok_at','board_rules_at')) <> 2 then
    raise exception 'member_merge_consents: users 에 guardian_ok_at · board_rules_at 칸이 없습니다 — users_consents.sql 을 먼저 돌리세요.';
  end if;
  if to_regprocedure('public.admin_merge_members(uuid,uuid,text,text,text)') is null then
    raise exception 'member_merge_consents: admin_merge_members 함수가 없습니다 — member_merge.sql 을 먼저 돌리세요.';
  end if;
  select count(*) into n from pg_trigger where tgname='redirect_merged_member_write' and not tgisinternal
    and tgrelid in ('public.board_blocks'::regclass,'public.board_reports'::regclass,'public.sermon_answer_reports'::regclass);
  if n <> 3 then
    raise exception 'member_merge_consents: 세 표의 쓰기 연결 트리거가 %개뿐입니다(3이어야 한다) — 고친 member_merge.sql 을 표를 만든 **뒤에** 다시 돌리세요.', n;
  end if;

  -- ── 1) 가상 성도 여섯 — 원본(옮겨 가는 쪽) · 대상(남는 쪽) · 셋째 · 넷째 · 동의 날짜용 한 쌍 ──────
  --    교구 「합치기점검」 은 실제로 없는 교구다. 식별자 끝의 tag 로 진짜·다른 실행과 겹치지 않는다.
  k_s  := '교구|합치기점검|0|||가상원본'  || tag;
  k_t  := '교구|합치기점검|0|||가상대상'  || tag;
  k_x  := '교구|합치기점검|0|||가상셋째'  || tag;
  k_y  := '교구|합치기점검|0|||가상넷째'  || tag;
  k_s2 := '교구|합치기점검|0|||가상원본둘' || tag;
  k_t2 := '교구|합치기점검|0|||가상대상둘' || tag;
  insert into public.users(type,gu,mok,name,identity_key) values('교구','합치기점검','0','가상원본'||tag,k_s)  returning id into v_s;
  insert into public.users(type,gu,mok,name,identity_key) values('교구','합치기점검','0','가상대상'||tag,k_t)  returning id into v_t;
  insert into public.users(type,gu,mok,name,identity_key) values('교구','합치기점검','0','가상셋째'||tag,k_x)  returning id into v_x;
  insert into public.users(type,gu,mok,name,identity_key) values('교구','합치기점검','0','가상넷째'||tag,k_y)  returning id into v_y;
  insert into public.users(type,gu,mok,name,identity_key) values('교구','합치기점검','0','가상원본둘'||tag,k_s2) returning id into v_s2;
  insert into public.users(type,gu,mok,name,identity_key) values('교구','합치기점검','0','가상대상둘'||tag,k_t2) returning id into v_t2;

  -- ── 2) 가리기 여덟 줄 — 옮기기만 · 두 계정 사이(버림) · 옮기면 겹침(남는 쪽 줄) ─────────────
  insert into public.board_blocks(blocker_id,blocked_id,blocked_name) values
    (v_s,v_x,'원본>셋째'), (v_x,v_s,'셋째>원본'),          -- 옮기기만 → 대상>셋째 · 셋째>대상
    (v_s,v_t,'원본>대상'), (v_t,v_s,'대상>원본'),          -- 두 계정 사이 → 버림(자기 자신을 가리게 된다)
    (v_s,v_y,'원본>넷째'), (v_y,v_s,'넷째>원본');          -- 아래 대상 줄과 겹침 → 대상 줄이 남는다
  insert into public.board_blocks(blocker_id,blocked_id,blocked_name) values(v_t,v_y,'대상>넷째') returning id into keep_ty;
  insert into public.board_blocks(blocker_id,blocked_id,blocked_name) values(v_y,v_t,'넷째>대상') returning id into keep_yt;

  -- ── 3) 셋째가 쓴 가상 글 셋 · 답글 하나, 그리고 신고 다섯 ─────────────────────────
  insert into public.board_posts(name,content,user_id) values('합치기점검 가상셋째','합치기 점검용 가상 글 1 — 되돌린다',v_x) returning id into p1;
  insert into public.board_posts(name,content,user_id) values('합치기점검 가상셋째','합치기 점검용 가상 글 2 — 되돌린다',v_x) returning id into p2;
  insert into public.board_posts(name,content,user_id) values('합치기점검 가상셋째','합치기 점검용 가상 글 3 — 되돌린다',v_x) returning id into p3;
  insert into public.board_replies(post_id,name,content,user_id) values(p1,'합치기점검 가상셋째','합치기 점검용 가상 답글 — 되돌린다',v_x) returning id into r1;
  -- 글1: 둘 다 처리 전 → 대상 줄이 남는다
  insert into public.board_reports(post_id,reporter_id,reason) values(p1,v_s,'spam');
  insert into public.board_reports(post_id,reporter_id,reason) values(p1,v_t,'other') returning id into keep_t1;
  -- 글1 의 답글: 원본은 처리 전 · 대상은 처리 뒤 → 처리 전인 원본 줄이 남는다(관리자 목록에서 사라지면 안 된다)
  insert into public.board_reports(post_id,reply_id,reporter_id,reason) values(p1,r1,v_s,'privacy') returning id into open_s;
  insert into public.board_reports(post_id,reply_id,reporter_id,reason,resolved_at,resolved_by,resolution)
    values(p1,r1,v_t,'spam',now(),'admin','kept');
  -- 글2: 원본만, 처리 뒤 → 줄 번호·처리 상태 그대로 옮긴다
  insert into public.board_reports(post_id,reporter_id,reason,resolved_at,resolved_by,resolution)
    values(p2,v_s,'inappropriate',now(),'admin','hidden') returning id into moved_s;

  -- ── 4) AI 답 알림 다섯 ─────────────────────────────────────────────
  insert into public.sermon_answer_reports(reporter_id,question,answer,reason) values(v_s,'합치기 점검 질문 가','가상 답','wrong');
  insert into public.sermon_answer_reports(reporter_id,question,answer,reason) values(v_t,'합치기 점검 질문 가','가상 답','other') returning id into keep_tq;
  insert into public.sermon_answer_reports(reporter_id,question,answer,reason) values(v_s,'합치기 점검 질문 나','가상 답','offensive') returning id into open_sq;
  insert into public.sermon_answer_reports(reporter_id,question,answer,reason,resolved_at,resolution)
    values(v_t,'합치기 점검 질문 나','가상 답','wrong',now(),'kept');
  insert into public.sermon_answer_reports(reporter_id,question,answer,reason) values(v_s,'합치기 점검 질문 다','가상 답','other') returning id into moved_q;

  -- ── 5) 동의 날짜 — 원본에만 ────────────────────────────────────────
  update public.users set guardian_ok_at='2026-09-30 10:00+09', board_rules_at='2026-10-01 12:00+09' where id=v_s;

  -- ── 6) 미리보기(api adminPreviewMemberMerge 와 같은 꼴) ───────────────────────
  pv := public.admin_preview_member_merge(p_source_id => v_s, p_source_key => k_s, p_target_key => k_t);
  if coalesce((pv->>'ok')::boolean,false) is not true then
    raise exception 'member_merge_consents: 미리보기가 실패했습니다 — %', pv->>'error';
  end if;
  got := concat_ws(',', pv->'source_counts'->>'board_blocks', pv->'target_counts'->>'board_blocks',
                        pv->'source_counts'->>'board_reports', pv->'target_counts'->>'board_reports',
                        pv->'source_counts'->>'sermon_answer_reports', pv->'target_counts'->>'sermon_answer_reports');
  if got is distinct from '6,4,3,2,3,2' then
    raise exception 'member_merge_consents: 미리보기 기록 수가 다릅니다(가리기 원본·대상, 신고 원본·대상, AI 알림 원본·대상) — 기대 6,4,3,2,3,2 · 실제 %',
      coalesce(nullif(got,''), '(세 표가 안 보임 — 옛 member_merge_counts 입니다. 고친 member_merge.sql 을 돌리세요)');
  end if;

  -- ── 7) 합치기 — api(adminMergeMembers)처럼 service_role 로, 같은 이름의 인자로 ─────────────
  begin
    set local role service_role;
    as_service := true;
  exception when others then
    raise notice 'member_merge_consents: service_role 로 바꾸지 못해 지금 역할(%)로 부릅니다.', current_user;
  end;
  r := public.admin_merge_members(p_source_id => v_s, p_target_id => v_t, p_source_key => k_s,
                                  p_target_key => k_t, p_reason => '개발 점검 — 가상 성도 합치기(되돌림)');
  if as_service then execute format('set local role %I', prev_role); end if;   -- reset role 이 아니라 부르기 전 역할로
  if coalesce((r->>'ok')::boolean,false) is not true then
    raise exception 'member_merge_consents: 합치기가 거절됐습니다 — % (고친 member_merge.sql 을 개발에 먼저 돌렸나요?)', r->>'error';
  end if;
  got := concat_ws(',', r->'after_counts'->>'board_blocks', r->'after_counts'->>'board_reports', r->'after_counts'->>'sermon_answer_reports');
  if got is distinct from '4,3,3' then
    raise exception 'member_merge_consents: 합친 뒤 기록 수가 다릅니다(가리기, 신고, AI 알림) — 기대 4,3,3 · 실제 %', got;
  end if;

  -- ── 8) 가리기 ─────────────────────────────────────────────────────
  select count(*) into n from public.board_blocks where blocker_id=v_s or blocked_id=v_s;
  if n <> 0 then raise exception 'member_merge_consents: 가리기 — 원본 번호 줄이 %개 남았습니다(0이어야 한다)', n; end if;
  select count(*) into n from public.board_blocks where blocker_id=v_t and blocked_id=v_t;
  if n <> 0 then raise exception 'member_merge_consents: 가리기 — 자기 자신을 가린 줄이 생겼습니다'; end if;
  select string_agg(case blocker_id when v_t then '대상' when v_x then '셋째' when v_y then '넷째' end || '>' ||
                    case blocked_id when v_t then '대상' when v_x then '셋째' when v_y then '넷째' end || ':' || blocked_name, ' '
                    order by blocked_name collate "C")
    into got from public.board_blocks where blocker_id=v_t or blocked_id=v_t;
  -- 지금 칸(가린>가려진) : 가릴 때 붙인 이름(어느 줄에서 왔나). 원본>셋째 줄이 대상>셋째 로, 셋째>원본 줄이 셋째>대상 으로.
  if got is distinct from '넷째>대상:넷째>대상 대상>넷째:대상>넷째 셋째>대상:셋째>원본 대상>셋째:원본>셋째' then
    raise exception 'member_merge_consents: 가리기 — 남은 줄이 다릅니다. 실제: %', got;
  end if;
  if not exists(select 1 from public.board_blocks where id=keep_ty and blocker_id=v_t and blocked_id=v_y)
     or not exists(select 1 from public.board_blocks where id=keep_yt and blocker_id=v_y and blocked_id=v_t) then
    raise exception 'member_merge_consents: 가리기 — 겹친 줄에서 남는 쪽 줄(번호 그대로)이 남지 않았습니다';
  end if;

  -- ── 9) 게시판 신고 ───────────────────────────────────────────────────
  select count(*) into n from public.board_reports where reporter_id=v_s;
  if n <> 0 then raise exception 'member_merge_consents: 신고 — 원본 번호 줄이 %개 남았습니다', n; end if;
  select string_agg(id::text, ',' order by id) into got from public.board_reports where reporter_id=v_t;
  if got is distinct from (select string_agg(x::text, ',' order by x) from unnest(array[keep_t1,open_s,moved_s]) x) then
    raise exception 'member_merge_consents: 신고 — 남은 줄 번호가 다릅니다. 기대 %,%,% · 실제 %', keep_t1, open_s, moved_s, got;
  end if;
  if exists(select 1 from public.board_reports where id=open_s and resolved_at is not null) then
    raise exception 'member_merge_consents: 신고 — 처리 전이던 원본 줄이 처리된 것으로 바뀌었습니다';
  end if;
  if not exists(select 1 from public.board_reports where id=moved_s and resolution='hidden' and resolved_at is not null) then
    raise exception 'member_merge_consents: 신고 — 옮긴 줄의 처리 상태(숨김)를 잃었습니다';
  end if;

  -- ── 10) AI 답 알림 ──────────────────────────────────────────────────
  select count(*) into n from public.sermon_answer_reports where reporter_id=v_s;
  if n <> 0 then raise exception 'member_merge_consents: AI 답 알림 — 원본 번호 줄이 %개 남았습니다', n; end if;
  select string_agg(id::text, ',' order by id) into got from public.sermon_answer_reports where reporter_id=v_t;
  if got is distinct from (select string_agg(x::text, ',' order by x) from unnest(array[keep_tq,open_sq,moved_q]) x) then
    raise exception 'member_merge_consents: AI 답 알림 — 남은 줄 번호가 다릅니다. 기대 %,%,% · 실제 %', keep_tq, open_sq, moved_q, got;
  end if;

  -- ── 11) 동의 날짜 · 감사 기록 · 원본 행 ────────────────────────────────
  select guardian_ok_at, board_rules_at into g, b from public.users where id=v_t;
  if g is distinct from timestamptz '2026-09-30 10:00+09' or b is distinct from timestamptz '2026-10-01 12:00+09' then
    raise exception 'member_merge_consents: 동의 날짜 — 대상이 원본 날짜를 받지 못했습니다(보호자 % · 규칙 %)', g, b;
  end if;
  if (r->'user'->>'guardian_ok_at') is null or (r->'user'->>'board_rules_at') is null then
    raise exception 'member_merge_consents: 합치기가 돌려준 user 에 받은 동의 날짜가 없습니다';
  end if;
  if not exists(select 1 from public.user_merges where source_user_id=v_s and target_user_id=v_t
                and source_profile->>'guardian_ok_at' is not null) then
    raise exception 'member_merge_consents: user_merges 에 원본의 동의 날짜가 남지 않았습니다';
  end if;
  if exists(select 1 from public.users where id=v_s) then
    raise exception 'member_merge_consents: 원본 users 행이 남았습니다';
  end if;

  -- ── 12) 다시 불러도 한 번만 · 옛 번호로 들어온 신고는 남는 쪽으로 ───────────────────
  r := public.admin_merge_members(p_source_id => v_s, p_target_id => v_t, p_source_key => k_s,
                                  p_target_key => k_t, p_reason => '개발 점검 — 가상 성도 합치기(되돌림)');
  if coalesce((r->>'already_merged')::boolean,false) is not true then
    raise exception 'member_merge_consents: 두 번째 합치기가 already_merged 가 아닙니다 — %', r->>'error';
  end if;
  insert into public.board_reports(post_id,reporter_id,reason) values(p3,v_s,'spam');
  insert into public.sermon_answer_reports(reporter_id,question,answer,reason) values(v_s,'합치기 점검 질문 라','가상 답','other');
  if not exists(select 1 from public.board_reports where post_id=p3 and reporter_id=v_t)
     or not exists(select 1 from public.sermon_answer_reports where question='합치기 점검 질문 라' and reporter_id=v_t) then
    raise exception 'member_merge_consents: 합친 뒤 옛 번호로 들어온 신고·알림이 남는 쪽으로 가지 않았습니다(쓰기 연결 트리거)';
  end if;

  -- ── 13) 양쪽 다 날짜가 있으면 — 보호자 확인은 남는 쪽 그대로, 규칙 동의는 더 늦은 날짜 ─────────────
  update public.users set guardian_ok_at='2026-10-01 14:00+09', board_rules_at='2026-10-01 15:00+09' where id=v_s2;
  update public.users set guardian_ok_at='2026-09-01 09:00+09', board_rules_at='2026-09-01 09:00+09' where id=v_t2;
  r := public.admin_merge_members(p_source_id => v_s2, p_target_id => v_t2, p_source_key => k_s2,
                                  p_target_key => k_t2, p_reason => '개발 점검 — 가상 성도 합치기(되돌림)');
  if coalesce((r->>'ok')::boolean,false) is not true then
    raise exception 'member_merge_consents: 둘째 쌍 합치기가 거절됐습니다 — %', r->>'error';
  end if;
  select guardian_ok_at, board_rules_at into g, b from public.users where id=v_t2;
  if g is distinct from timestamptz '2026-09-01 09:00+09' or b is distinct from timestamptz '2026-10-01 15:00+09' then
    raise exception 'member_merge_consents: 동의 날짜(둘째 쌍) — 기대 보호자 2026-09-01 09:00(남는 쪽) · 규칙 2026-10-01 15:00(늦은 쪽) · 실제 % · %', g, b;
  end if;

  raise notice 'member_merge_consents: 통과 (합치기를 부른 역할: %)', case when as_service then 'service_role' else current_user::text end;
end
$check$;

select 'member_merge_consents: 통과' as result;

rollback;
