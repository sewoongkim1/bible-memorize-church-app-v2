// Same temporary NODE_PATH dependencies as member-profile.test.cjs. No real church DB access.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {PGlite}=require('@electric-sql/pglite');
const {JSDOM}=require('jsdom');
const ts=require('typescript');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
let db;
const profile=name=>({type:'교구',gu:'사랑',mok:'1',name,bu:null,grade:null,identity_key:`교구|사랑|1|||${name}`});
const query=async(sql,args=[]) => (await db.query(sql,args)).rows;
const login=async p=>(await query('select member_login($1::jsonb) r',[JSON.stringify(p)]))[0].r;
const merge=async(s,t)=>(await query('select admin_merge_members($1,$2,$3,$4,$5) r',[s.id,t.id,s.identity_key,t.identity_key,'개발 동일인 병합']))[0].r;
// 교회 어드민 저장소 supabase/sql/008_ministry_history_requests.sql(2026-10-01 운영) — 이 저장소 밖이라 begin…commit 사이를
//   **글자 그대로** 옮겨 적는다(칸·CHECK·부분 unique 둘이 운영과 같게). handled_by 가 가리키는 admin_members 는 빈 표로 세운다.
//   그 저장소가 곁에 있으면 아래 「008 사본이 원본과 같다」 검사가 주석을 뺀 글자로 맞대 본다(없으면 건너뛴다).
const MHR_008=`
create table if not exists ministry_history_requests (
  id          bigserial primary key,
  user_id     uuid not null,                       -- 앱 계정(users.id) — 어떤 응답에도 싣지 않는다
  person_id   int,                                 -- 신청 때 찾은 교인ID(찾지 못했으면 null)
  history_id  bigint,                              -- 정정할 줄(ministry_history.id) — 줄 정정만
  kind        text not null check (kind in ('not_mine', 'wrong_team', 'other', 'missing', 'find_me')),
  detail      text not null default '' check (char_length(detail) <= 200),
  year        int check (year between 1950 and 2100),                  -- missing 의 연도
  team_text   text not null default '' check (char_length(team_text) <= 100),   -- missing 의 「부서·팀」 글
  who_type    text not null default '',            -- 신청 때 로그인 소속·이름 사본(담당자가 찾을 때)
  who_group   text not null default '',            -- 교구 또는 부서
  who_sub     text not null default '',            -- 목장 또는 학년
  who_name    text not null default '',
  status      text not null default '신청' check (status in ('신청', '확인 중', '반영', '반영 안 함')),
  answer      text not null default '' check (char_length(answer) <= 300),   -- 담당자가 적은 말(반영 안 함의 사유 등)
  handled_by  uuid references admin_members(id) on delete set null,
  handled_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint mhr_line_chk check ((kind in ('not_mine', 'wrong_team', 'other')) = (history_id is not null)),
  constraint mhr_missing_chk check ((kind = 'missing') = (year is not null))
);
create index if not exists mhr_user_idx   on ministry_history_requests (user_id);
create index if not exists mhr_status_idx on ministry_history_requests (status, created_at);
-- 같은 때 두 번 눌러도 하나만(서버가 먼저 세지만, 동시에 들어온 둘은 여기서 막힌다 → 23505 → already-open)
create unique index if not exists mhr_open_line_uq on ministry_history_requests (user_id, history_id)
  where history_id is not null and status in ('신청', '확인 중');
create unique index if not exists mhr_open_find_uq on ministry_history_requests (user_id)
  where kind = 'find_me' and status in ('신청', '확인 중');

alter table ministry_history_requests enable row level security;
revoke all on ministry_history_requests from anon, authenticated;
revoke all on sequence ministry_history_requests_id_seq from anon, authenticated;
`;
const sqlBody=s=>s.split(/\r?\n/).map(l=>l.replace(/--.*$/,'')).join(' ').replace(/\s+/g,' ').trim();
before(async()=>{
 db=new PGlite();
 await db.exec(`
 create role anon;create role authenticated;create role service_role bypassrls;
 create table users(id uuid primary key default gen_random_uuid(),type text,gu text,mok text,bu text,grade text,name text,identity_key text unique,created_at timestamptz default now(),last_seen_at timestamptz);
 create table app_config(key text primary key,value jsonb,updated_at timestamptz default now());
 create table progress(user_id uuid references users(id) on delete cascade,verse_no int,lang text default 'ko',stage int,updated_at timestamptz default now(),hearted boolean default false,hearted_at timestamptz,primary key(user_id,verse_no,lang));
 create table challenge_log(id bigint generated always as identity primary key,user_id uuid references users(id) on delete cascade,verse_no int,mode text,created_at timestamptz default now());
 create table reviews(user_id uuid references users(id) on delete cascade,verse_no int,box int,due_at date,last_at date,primary key(user_id,verse_no));
 create table passage_progress(user_id uuid references users(id) on delete cascade,passage_id int,done_seq int[],completed_at timestamptz,updated_at timestamptz default now(),primary key(user_id,passage_id));
 create table blessing_log(user_id uuid references users(id) on delete cascade,day date default current_date,no int,cnt int,primary key(user_id,day,no));
 create table event_entries(event_id text,user_id text,entered_at timestamptz,primary key(event_id,user_id));
 create table board_posts(id bigint generated always as identity primary key,user_id uuid,name text);
 create table board_replies(id bigint generated always as identity primary key,user_id uuid,name text);
 create table board_reactions(target text,target_id bigint,user_id text,emoji text,who text,created_at timestamptz,primary key(target,target_id,user_id,emoji));
 create table rank_cheers(target_user_id text,from_user_id text,cheer_date date,from_name text,created_at timestamptz,primary key(target_user_id,from_user_id,cheer_date));
 create table push_subscriptions(id bigint generated always as identity primary key,user_id uuid references users(id) on delete cascade,endpoint text unique);
 create table pilsa_orders(id bigint generated always as identity primary key,user_id text,name text);
 create table ministry_orders(id bigint generated always as identity primary key,user_id text,year int,team_id int,note text,unique(year,user_id,team_id));
 create table event_signups(id bigint generated always as identity primary key,event_id text,user_id uuid references users(id) on delete cascade,answers jsonb,unique(event_id,user_id));
 create table daily_activity(day date,user_id text,mode text,cnt int,primary key(day,user_id,mode));
 `);
 const daily=read('supabase/daily-activity.sql');
 await db.exec(daily.slice(daily.indexOf('create or replace function daily_activity_sync()'),daily.indexOf('-- 3)')));
 await db.exec(read('supabase/member_profile.sql'));
 // 2026-10-01 구글 출시 심사 전 — 실제 파일 그대로(칸·unique·CHECK 가 운영과 같게). 합치기 SQL 보다 먼저 있어야 쓰기 연결 트리거가 붙는다.
 // 2026-10-02 둘째 판 — 아이폰 알림 기기(실제 파일 둘) · 정정 신청(교회 어드민 008 사본).
 for(const f of ['users_consents','board_blocks','board_reports','sermon_answer_reports','ios_push_tokens','push_evening'])await db.exec(read(`supabase/${f}.sql`));
 await db.exec('create table admin_members(id uuid primary key)');
 await db.exec(MHR_008);
 await db.exec(read('supabase/member_merge.sql'));
 await db.exec(read('supabase/member_merge.sql'));
 await db.exec('grant all on all tables in schema public to service_role;grant usage,select on all sequences in schema public to service_role');
});
after(async()=>await db?.close());

test('merge preserves both histories, max per-language stage, latest review, union passages and summed activity',async()=>{
 const s=await login(profile('이전성도')),t=await login(profile('현재성도')),other=await login(profile('다른성도'));
 for(const [u,stage,lang,hearted] of [[s,3,'ko',true],[t,1,'ko',false],[s,1,'en',false],[t,2,'en',true]])
  await query('insert into progress(user_id,verse_no,stage,lang,hearted) values($1,1,$2,$3,$4)',[u.id,stage,lang,hearted]);
 for(const [u,mode] of [[s,'typing'],[s,'typing'],[t,'typing'],[t,'voice']])
  await query("insert into challenge_log(user_id,verse_no,mode,created_at) values($1,1,$2,'2026-09-10')",[u.id,mode]);
 const oldLogs=await query('select id,verse_no,mode,created_at from challenge_log where user_id in($1,$2) order by id',[s.id,t.id]);
 await query("insert into reviews values($1,1,2,'2026-09-20','2026-09-10'),($2,1,3,'2026-09-30','2026-09-09')",[s.id,t.id]);
 await query("insert into passage_progress(user_id,passage_id,done_seq,completed_at) values($1,1,'{0,1}','2026-09-08'),($2,1,'{1,2}',null)",[s.id,t.id]);
 await query('insert into blessing_log(user_id,no,cnt) values($1,1,2),($2,1,3)',[s.id,t.id]);
 await query("insert into event_entries values('event',$1,'2026-09-01'),('event',$2,'2026-09-03')",[s.id,t.id]);
 await query("insert into board_posts(user_id,name) values($1,'old label'),($2,'new label')",[s.id,t.id]);
 await query("insert into board_replies(user_id,name) values($1,'old label')",[s.id]);
 await query("insert into board_reactions values('post',1,$1,'like','old',now()),('post',1,$2,'like','new',now())",[s.id,t.id]);
 await query("insert into rank_cheers values($1,$3,current_date,'other',now()),($2,$3,current_date,'other',now()),($1,$2,current_date,'new',now())",[s.id,t.id,other.id]);
 await query("insert into push_subscriptions(user_id,endpoint) values($1,'old-device'),($2,'new-device')",[s.id,t.id]);
 await query("insert into pilsa_orders(user_id,name) values($1,'old order'),($2,'new order')",[s.id,t.id]);
 await query("insert into ministry_orders(user_id,year,team_id,note) values($1,2027,1,'preserve'),($2,2027,2,'preserve2')",[s.id,t.id]);
 await query("insert into event_signups(event_id,user_id,answers) values('event1',$1,'{\"answer\":1}'),('event2',$2,'{\"answer\":2}')",[s.id,t.id]);
 await query("insert into app_config(key,value) values('pilsaAdmins',$1)",[JSON.stringify([s.identity_key])]);
 const preview=(await query('select admin_preview_member_merge($1,$2,$3) r',[s.id,s.identity_key,t.identity_key]))[0].r;
 assert.equal(preview.source_counts.challenge_log,2);assert.equal(preview.target_counts.challenge_log,2);
 await db.exec('set role service_role');
 let result;try{result=await merge(s,t)}finally{await db.exec('reset role')}
 assert.equal(result.ok,true);assert.equal(result.user.id,t.id);assert.equal(result.after_counts.challenge_log,4);
 assert.deepEqual(await query('select id,verse_no,mode,created_at from challenge_log where user_id=$1 order by id',[t.id]),oldLogs);
 assert.deepEqual((await query('select lang,stage,hearted from progress where user_id=$1 order by lang',[t.id])),[{lang:'en',stage:2,hearted:true},{lang:'ko',stage:3,hearted:true}]);
 const review=(await query('select box,due_at,last_at from reviews where user_id=$1',[t.id]))[0];assert.equal(review.box,2);assert.equal(new Date(review.due_at).toISOString().slice(0,10),'2026-09-20');
 const pp=(await query('select * from passage_progress where user_id=$1',[t.id]))[0];assert.deepEqual(pp.done_seq,[0,1,2]);assert.ok(pp.completed_at);
 assert.equal((await query('select cnt from blessing_log where user_id=$1',[t.id]))[0].cnt,5);
 assert.equal((await query('select count(*)::int n from event_entries where user_id=$1',[t.id]))[0].n,1);
 assert.equal((await query('select count(*)::int n from board_reactions where user_id=$1',[t.id]))[0].n,1);
 assert.equal((await query('select count(*)::int n from rank_cheers where target_user_id=$1',[t.id]))[0].n,1);
 assert.equal((await query('select sum(cnt)::int n from daily_activity where user_id=$1',[t.id]))[0].n,4);
 assert.equal((await query('select count(*)::int n from daily_activity where user_id=$1',[s.id]))[0].n,0);
 for(const table of ['board_posts','board_replies','push_subscriptions','pilsa_orders','ministry_orders','event_signups']){
  assert.equal((await query(`select count(*)::int n from ${table} where user_id::text=$1`,[s.id]))[0].n,0);
 }
 assert.equal((await login(profile('이전성도'))).id,t.id);assert.equal((await login(profile('현재성도'))).id,t.id);
 assert.deepEqual((await query("select value from app_config where key='pilsaAdmins'"))[0].value,[t.identity_key]);
 assert.equal((await merge(s,t)).already_merged,true);
 // Stale client/database writers route to survivor, without downgrading progress or double-counting.
 await query("insert into challenge_log(user_id,verse_no,mode,created_at) values($1,1,'voice','2026-09-10')",[s.id]);
 await query("insert into progress(user_id,verse_no,lang,stage) values($1,1,'ko',1) on conflict(user_id,verse_no,lang) do update set stage=excluded.stage",[s.id]);
 assert.equal((await query("select stage from progress where user_id=$1 and lang='ko'",[t.id]))[0].stage,3);
 assert.equal((await query('select sum(cnt)::int n from daily_activity where user_id=$1',[t.id]))[0].n,5);
 // Repeated merges flatten old ID mappings and preserve all login aliases.
 const third=await login(profile('최종성도'));assert.equal((await merge(t,third)).ok,true);
 assert.equal((await login(profile('이전성도'))).id,third.id);
 assert.equal((await query('select target_user_id from user_merges where source_user_id=$1',[s.id]))[0].target_user_id,third.id);
});

test('merge carries board blocks, board reports, AI answer flags and consent dates (2026-10-01)',async()=>{
 const s=await login(profile('가리기이전')),t=await login(profile('가리기현재')),x=await login(profile('가리기셋째')),y=await login(profile('가리기넷째'));
 const block=async(a,b,name)=>(await query('insert into board_blocks(blocker_id,blocked_id,blocked_name) values($1,$2,$3) returning id',[a.id,b.id,name]))[0].id;
 // 옮기기만(셋째) · 두 계정 사이(버림) · 옮기면 겹침(넷째 — 남는 쪽 줄)
 await block(s,x,'s>x');await block(x,s,'x>s');await block(s,t,'s>t');await block(t,s,'t>s');
 await block(s,y,'s>y');const keepTY=await block(t,y,'t>y');await block(y,s,'y>s');const keepYT=await block(y,t,'y>t');
 const [p1,p2,p3]=(await query("insert into board_posts(user_id,name) values($1,'글1'),($1,'글2'),($1,'글3') returning id",[x.id])).map(r=>r.id);
 const r1=(await query("insert into board_replies(user_id,name) values($1,'답1') returning id",[x.id]))[0].id;
 const report=async(post,reply,u,reason,resolved)=>(await query(
  'insert into board_reports(post_id,reply_id,reporter_id,reason,resolved_at,resolution) values($1,$2,$3,$4,$5,$6) returning id',
  [post,reply,u.id,reason,resolved?'2026-09-30T00:00:00Z':null,resolved?'kept':null]))[0].id;
 await report(p1,null,s,'spam',false);const keepT1=await report(p1,null,t,'other',false);        // 둘 다 열림 → 남는 쪽
 const openS=await report(p1,r1,s,'privacy',false);await report(p1,r1,t,'spam',true);              // 원본만 열림 → 열린 줄
 const movedS=await report(p2,null,s,'inappropriate',true);                                          // 원본만 → 그대로 옮김
 const flag=async(u,q,reason)=>(await query("insert into sermon_answer_reports(reporter_id,question,answer,reason) values($1,$2,'답',$3) returning id",[u.id,q,reason]))[0].id;
 await flag(s,'같은 질문','wrong');const keepTQ=await flag(t,'같은 질문','other');const movedQ=await flag(s,'다른 질문','offensive');
 await query("update users set guardian_ok_at='2026-09-30T01:00:00Z',board_rules_at='2026-10-01T03:00:00Z' where id=$1",[s.id]);
 const preview=(await query('select admin_preview_member_merge($1,$2,$3) r',[s.id,s.identity_key,t.identity_key]))[0].r;
 assert.deepEqual([preview.source_counts.board_blocks,preview.target_counts.board_blocks],[6,4]);
 assert.deepEqual([preview.source_counts.board_reports,preview.target_counts.board_reports],[3,2]);
 assert.deepEqual([preview.source_counts.sermon_answer_reports,preview.target_counts.sermon_answer_reports],[2,1]);
 await db.exec('set role service_role');
 let result;try{result=await merge(s,t)}finally{await db.exec('reset role')}
 assert.equal(result.ok,true,JSON.stringify(result));
 assert.deepEqual([result.after_counts.board_blocks,result.after_counts.board_reports,result.after_counts.sermon_answer_reports],[4,3,2]);
 // 가리기: 원본 번호는 어디에도 없고, 자기 자신을 가린 줄도 없고, 겹친 것은 남는 쪽 줄(번호 그대로)
 assert.equal((await query('select count(*)::int n from board_blocks where blocker_id=$1 or blocked_id=$1',[s.id]))[0].n,0);
 assert.equal((await query('select count(*)::int n from board_blocks where blocker_id=blocked_id'))[0].n,0);
 const blocks=await query('select id,blocker_id,blocked_id,blocked_name from board_blocks where blocker_id=$1 or blocked_id=$1 order by blocked_name',[t.id]);
 const who={[t.id]:'t',[x.id]:'x',[y.id]:'y'};
 assert.deepEqual(blocks.map(b=>`${who[b.blocker_id]}>${who[b.blocked_id]}:${b.blocked_name}`).sort(),['t>x:s>x','t>y:t>y','x>t:x>s','y>t:y>t']);
 assert.equal(blocks.find(b=>b.blocked_name==='t>y').id,keepTY);assert.equal(blocks.find(b=>b.blocked_name==='y>t').id,keepYT);
 // 신고: 줄 번호·처리 상태는 그대로, 신고한 분만 남는 쪽으로. 같은 글(답글)은 한 줄 — 열린 줄이 우선, 둘 다 같으면 남는 쪽
 assert.equal((await query('select count(*)::int n from board_reports where reporter_id=$1',[s.id]))[0].n,0);
 const reports=await query('select id,post_id,reply_id,reason,resolved_at from board_reports where reporter_id=$1 order by id',[t.id]);
 assert.deepEqual(reports.map(r=>r.id).sort((a,b)=>a-b),[keepT1,openS,movedS].sort((a,b)=>a-b));
 assert.equal(reports.find(r=>r.id===openS).resolved_at,null);assert.ok(reports.find(r=>r.id===movedS).resolved_at);
 assert.equal(reports.find(r=>r.id===keepT1).reason,'other');
 // AI 답 알림: 같은 질문은 남는 쪽 한 줄, 다른 질문은 번호 그대로 옮김
 assert.equal((await query('select count(*)::int n from sermon_answer_reports where reporter_id=$1',[s.id]))[0].n,0);
 assert.deepEqual((await query('select id from sermon_answer_reports where reporter_id=$1 order by id',[t.id])).map(r=>r.id),[keepTQ,movedQ].sort((a,b)=>a-b));
 // 동의 날짜: 남는 쪽이 비어 있었으니 원본 것을 받는다. 돌려주는 user 도 새 값
 const tu=(await query('select guardian_ok_at,board_rules_at from users where id=$1',[t.id]))[0];
 assert.equal(tu.guardian_ok_at.toISOString(),'2026-09-30T01:00:00.000Z');assert.equal(tu.board_rules_at.toISOString(),'2026-10-01T03:00:00.000Z');
 assert.ok(result.user.guardian_ok_at&&result.user.board_rules_at);
 assert.equal((await merge(s,t)).already_merged,true);
 // 합친 뒤 옛 번호로 들어온 신고·알림도 남는 쪽으로(쓰기 연결 트리거)
 await query("insert into board_reports(post_id,reporter_id,reason) values($1,$2,'spam')",[p3,s.id]);
 await query("insert into sermon_answer_reports(reporter_id,question,answer,reason) values($1,'세 번째 질문','답','other')",[s.id]);
 assert.equal((await query('select count(*)::int n from board_reports where post_id=$1 and reporter_id=$2',[p3,t.id]))[0].n,1);
 assert.equal((await query("select count(*)::int n from sermon_answer_reports where question='세 번째 질문' and reporter_id=$1",[t.id]))[0].n,1);
 // 양쪽 다 날짜가 있으면: 보호자 확인은 남는 쪽 그대로, 규칙 동의는 더 늦은 날짜
 const s2=await login(profile('동의이전')),t2=await login(profile('동의현재'));
 await query("update users set guardian_ok_at='2026-10-01T05:00:00Z',board_rules_at='2026-10-01T06:00:00Z' where id=$1",[s2.id]);
 await query("update users set guardian_ok_at='2026-09-01T00:00:00Z',board_rules_at='2026-09-01T00:00:00Z' where id=$1",[t2.id]);
 assert.equal((await merge(s2,t2)).ok,true);
 const t2u=(await query('select guardian_ok_at,board_rules_at from users where id=$1',[t2.id]))[0];
 assert.equal(t2u.guardian_ok_at.toISOString(),'2026-09-01T00:00:00.000Z');assert.equal(t2u.board_rules_at.toISOString(),'2026-10-01T06:00:00.000Z');
});

test('008 사본이 교회 어드민 원본과 같다(곁에 있을 때만 — 주석은 빼고 맞댄다)',t=>{
 const cands=[process.env.CHURCH_ADMIN_DIR,path.resolve(root,'..','church-admin'),path.resolve(root,'..','..','church-admin')]
  .filter(Boolean).map(d=>path.join(d,'supabase','sql','008_ministry_history_requests.sql'));
 const f=cands.find(p=>fs.existsSync(p));
 if(!f){t.skip('교회 어드민 저장소가 곁에 없다 — CHURCH_ADMIN_DIR 로 알려 주면 맞대 본다');return;}
 const src=fs.readFileSync(f,'utf8');
 const inner=src.slice(src.indexOf('begin;')+'begin;'.length,src.lastIndexOf('commit;'));
 assert.equal(sqlBody(MHR_008),sqlBody(inner),'교회 어드민 008 이 바뀌었다 — 이 검사의 MHR_008 사본과 member_merge.sql 의 정정 신청 규칙(열린 상태 · 부분 unique)을 함께 볼 것');
});

test('merge carries iPhone push devices and ministry history requests; stale two-person rows never 500 (2026-10-02)',async()=>{
 const s=await login(profile('기기이전')),t=await login(profile('기기현재')),x=await login(profile('기기셋째'));
 // 아이폰 알림 기기 — 원본 둘(시각·저녁이 서로 다르다) · 대상 하나. device_token 은 표 전체 unique 라 두 계정이 같은 기기를 못 가진다.
 const tok=async(u,token,hour,evening)=>(await query('insert into ios_push_tokens(user_id,device_token,hour,evening) values($1,$2,$3,$4) returning id',[u.id,token,hour,evening]))[0].id;
 const ts1=await tok(s,'tok-s1',6,false),ts2=await tok(s,'tok-s2',7,true),tt1=await tok(t,'tok-t1',8,true);
 // 정정 신청 — ① 남는 쪽에 같은 줄의 열린 신청(find_me 는 열린 find_me)이 있으면 원본의 열린 것은 지운다 ② 나머지는 상태 그대로 옮긴다
 const req=async(u,kind,hid,status,who='')=>(await query(
  'insert into ministry_history_requests(user_id,kind,history_id,year,status,who_name) values($1,$2,$3,$4,$5,$6) returning id',
  [u.id,kind,hid,kind==='missing'?2019:null,status,who]))[0].id;
 const dropLine=await req(s,'not_mine',101,'신청','옛 이름');            // ① 대상에 101 열림 → 지움
 const keepLineT=await req(t,'wrong_team',101,'확인 중');                 //    (종류가 달라도 같은 줄 — mhr_open_line_uq)
 const movedOpen=await req(s,'other',102,'확인 중','옛 이름');           // ② 대상의 102 는 닫힘 → 열린 채 옮김
 const closedT=await req(t,'not_mine',102,'반영 안 함');
 const movedClosed=await req(s,'not_mine',101,'반영');                    // ② 닫힌 것은 대상에 열린 101 이 있어도 옮김
 const dropFind=await req(s,'find_me',null,'신청');                        // ① 둘 다 열린 find_me → 원본 지움
 const keepFindT=await req(t,'find_me',null,'확인 중');
 const movedFindClosed=await req(s,'find_me',null,'반영 안 함');          // ② 닫힌 find_me → 옮김
 const movedMissing=await req(s,'missing',null,'신청');                    // ② missing 은 unique 가 없다 → 옮김
 const keepMissingT=await req(t,'missing',null,'신청');
 const stamp=new Map((await query('select id,updated_at from ministry_history_requests where user_id in($1,$2)',[s.id,t.id])).map(r=>[Number(r.id),r.updated_at.toISOString()]));
 const preview=(await query('select admin_preview_member_merge($1,$2,$3) r',[s.id,s.identity_key,t.identity_key]))[0].r;
 assert.deepEqual([preview.source_counts.ios_push_tokens,preview.target_counts.ios_push_tokens],[2,1]);
 assert.deepEqual([preview.source_counts.ministry_history_requests,preview.target_counts.ministry_history_requests],[6,4]);
 await db.exec('set role service_role');
 let result;try{result=await merge(s,t)}finally{await db.exec('reset role')}
 assert.equal(result.ok,true,JSON.stringify(result));
 // 원본 6 + 대상 4 − 지운 열린 신청 2 = 8
 assert.deepEqual([result.after_counts.ios_push_tokens,result.after_counts.ministry_history_requests],[3,8]);
 // 기기: 줄 번호·시각·저녁 그대로 주인만
 assert.equal((await query('select count(*)::int n from ios_push_tokens where user_id=$1',[s.id]))[0].n,0);
 const devs=await query('select id,device_token,hour,evening from ios_push_tokens where user_id=$1 order by device_token',[t.id]);
 assert.deepEqual(devs.map(d=>[Number(d.id),d.device_token,d.hour,d.evening]),[[Number(ts1),'tok-s1',6,false],[Number(ts2),'tok-s2',7,true],[Number(tt1),'tok-t1',8,true]]);
 // 정정 신청: 지운 둘은 없고, 나머지는 줄 번호·상태·updated_at·신청 때 이름 사본 그대로
 const n=v=>Number(v),byId=new Map((await query('select id,status,who_name,updated_at from ministry_history_requests where user_id=$1',[t.id])).map(r=>[n(r.id),r]));
 assert.deepEqual([...byId.keys()].sort((a,b)=>a-b),[keepLineT,movedOpen,closedT,movedClosed,keepFindT,movedFindClosed,movedMissing,keepMissingT].map(n).sort((a,b)=>a-b));
 assert.equal((await query('select count(*)::int n from ministry_history_requests where id in($1,$2) or user_id=$3',[dropLine,dropFind,s.id]))[0].n,0);
 assert.deepEqual([movedOpen,movedClosed,movedFindClosed,movedMissing,keepLineT].map(i=>byId.get(n(i)).status),['확인 중','반영','반영 안 함','신청','확인 중']);
 assert.equal(byId.get(n(movedOpen)).who_name,'옛 이름');
 for(const [id,r] of byId)assert.equal(r.updated_at.toISOString(),stamp.get(id),'합치기가 정정 신청의 updated_at 을 바꿨다(담당자 화면의 「그사이 바뀜」 검사가 걸린다)');
 // 합친 뒤 옛 번호로 — 기기를 다시 등록해도 한 줄(api 의 upsert 와 같은 꼴), 새 기기·새 신청은 남는 쪽으로
 await query("insert into ios_push_tokens(user_id,device_token,hour) values($1,'tok-s1',5) on conflict(device_token) do update set user_id=excluded.user_id,hour=excluded.hour",[s.id]);
 assert.deepEqual((await query("select user_id,hour from ios_push_tokens where device_token='tok-s1'")).map(r=>[r.user_id,r.hour]),[[t.id,5]]);
 await query("insert into ios_push_tokens(user_id,device_token) values($1,'tok-s3')",[s.id]);
 assert.equal((await query("select user_id from ios_push_tokens where device_token='tok-s3'"))[0].user_id,t.id);
 const late=(await query("insert into ministry_history_requests(user_id,kind,history_id) values($1,'not_mine',103) returning user_id",[s.id]))[0];
 assert.equal(late.user_id,t.id);
 //   남는 쪽에 같은 줄의 열린 신청이 있으면 부분 unique 가 막는다 — 교회 어드민이 23505 를 already-open 으로 답한다(500 아님)
 await assert.rejects(query("insert into ministry_history_requests(user_id,kind,history_id) values($1,'other',101)",[s.id]),e=>e.code==='23505');
 // F2 — 합친 뒤 옛 기기가 남는 쪽 글을 가리면 (옛, 남는) → 트리거가 (남는, 남는)으로 바꾼다 → 줄을 버린다(오류 없음 · 0줄)
 assert.deepEqual(await query('insert into board_blocks(blocker_id,blocked_id,blocked_name) values($1,$2,$3) returning id',[s.id,t.id,'f2-self']),[]);
 assert.equal((await query("select count(*)::int n from board_blocks where blocked_name='f2-self' or blocker_id=blocked_id"))[0].n,0);
 //   남의 글이면 남는 쪽 줄로 들어간다
 assert.equal((await query("insert into board_blocks(blocker_id,blocked_id,blocked_name) values($1,$2,'f2-other') returning blocker_id",[s.id,x.id]))[0].blocker_id,t.id);
 //   옮기지 않은 자기 가리기는 CHECK 가 그대로 막는다(트리거가 CHECK 를 덮지 않는다)
 await assert.rejects(query("insert into board_blocks(blocker_id,blocked_id,blocked_name) values($1,$1,'self')",[t.id]),/board_blocks_not_self/);
 //   응원도 같다 — 옛 번호로 남는 쪽에 보낸 응원은 자기 응원이 되어 버린다(합치기 본체도 자기 응원을 지운다)
 assert.deepEqual(await query("insert into rank_cheers values($1,$2,current_date,'f2',now()) returning from_user_id",[t.id,s.id]),[]);
 assert.equal((await query('select count(*)::int n from rank_cheers where target_user_id=$1 and from_user_id=$1',[t.id]))[0].n,0);

 // 둘째 쌍 — 남는 쪽에 짝이 없는 열린 find_me · 다른 줄의 열린 신청은 열린 채 옮긴다
 const s2=await login(profile('신청이전')),t2=await login(profile('신청현재'));
 const openFind=await req(s2,'find_me',null,'신청'),open104=await req(s2,'not_mine',104,'신청'),open105T=await req(t2,'not_mine',105,'확인 중');
 assert.equal((await merge(s2,t2)).ok,true);
 assert.deepEqual((await query('select id,status from ministry_history_requests where user_id=$1 order by id',[t2.id])).map(r=>[n(r.id),r.status]),
  [[n(openFind),'신청'],[n(open104),'신청'],[n(open105T),'확인 중']].sort((a,b)=>a[0]-b[0]));

 // 정정 신청 표가 없는 DB(개발·다른 DB · 008 전) — 건너뛰고 합친다. 기록 수에도 그 칸이 없다.
 const s3=await login(profile('표없음이전')),t3=await login(profile('표없음현재'));
 await db.exec('alter table ministry_history_requests rename to mhr_away');
 try{
  const r3=await merge(s3,t3);
  assert.equal(r3.ok,true,JSON.stringify(r3));
  assert.equal('ministry_history_requests' in r3.after_counts,false);assert.equal(r3.after_counts.ios_push_tokens,0);
 }finally{await db.exec('alter table mhr_away rename to ministry_history_requests')}
});

test('duplicate complex applications and unknown foreign keys block with no partial changes',async()=>{
 const s=await login(profile('충돌이전')),t=await login(profile('충돌현재'));
 await query("insert into ministry_orders(user_id,year,team_id,note) values($1,2027,5,'old'),($2,2027,5,'new')",[s.id,t.id]);
 assert.equal((await merge(s,t)).error,'merge-ministry-conflict');
 assert.equal((await query('select count(*)::int n from users where id in($1,$2)',[s.id,t.id]))[0].n,2);
 await query('delete from ministry_orders where user_id in($1,$2)',[s.id,t.id]);
 await query("insert into event_signups(event_id,user_id,answers) values('conflict',$1,'{}'),('conflict',$2,'{}')",[s.id,t.id]);
 assert.equal((await merge(s,t)).error,'merge-signup-conflict');
 await query('delete from event_signups where user_id in($1,$2)',[s.id,t.id]);
 await db.exec('create table future_records(user_id uuid references users(id) on delete cascade)');
 await query('insert into future_records values($1)',[s.id]);
 assert.equal((await merge(s,t)).error,'merge-unsupported-records');
 assert.equal((await query('select count(*)::int n from future_records'))[0].n,1);
 await db.exec('drop table future_records');
 assert.equal((await merge({...s,identity_key:'stale'},t)).error,'member-changed');
});

test('unexpected database error rolls back moved records, aliases, audit and source deletion',async()=>{
 const s=await login(profile('실패이전')),t=await login(profile('실패현재'));
 await query("insert into challenge_log(user_id,mode) values($1,'typing')",[s.id]);
 await db.exec("alter table user_merges add constraint test_fail check(reason<>'개발 동일인 병합') not valid");
 await assert.rejects(merge(s,t),/test_fail/);
 assert.equal((await query('select user_id from challenge_log where user_id=$1',[s.id])).length,1);
 assert.equal((await query('select * from users where id=$1',[s.id])).length,1);
 assert.equal((await query('select * from user_identity_aliases where identity_key=$1',[s.identity_key])).length,0);
 await db.exec('alter table user_merges drop constraint test_fail');
});

test('public roles cannot merge or read mappings; admin API demands same-person confirmation',async()=>{
 for(const role of ['anon','authenticated']){
  await db.exec(`set role ${role}`);
  await assert.rejects(db.query('select * from user_merges'),/permission denied/);
  await assert.rejects(db.query('select admin_merge_members(null,null,null,null,null)'),/permission denied/);
  await db.exec('reset role');
 }
 const source=read('supabase/functions/api/index.ts');
 const code=source.slice(source.indexOf('// ---------- 관리자 사용자 정보 변경 ----------'),source.indexOf('async function adminFindMembers'));
 let called=false;
 const context=vm.createContext({adminError:b=>b.pw==='test' ? null:'unauthorized',norm:v=>String(v||'').trim(),db:{rpc:async()=>{called=true;return {data:{ok:true},error:null}}}});
 vm.runInContext(ts.transpile(code,{target:ts.ScriptTarget.ES2022}),context);
 assert.equal((await context.adminMergeMembers({})).error,'unauthorized');
 const args={pw:'test',source_id:'11111111-1111-1111-1111-111111111111',target_id:'22222222-2222-2222-2222-222222222222',source_key:'old',target_key:'new',reason:'same person'};
 assert.equal((await context.adminMergeMembers(args)).error,'invalid-merge');assert.equal(called,false);
 assert.equal((await context.adminMergeMembers({...args,confirm_same_person:true})).ok,true);assert.equal(called,true);
});

test('verified merge migrates unsynced device progress and unions server/local passage progress',()=>{
 const storage=new Map();let user={...profile('이전'),user_id:'source',cid:'device'};
 const key=lang=>`progress-${lang}:${user.name}`;
 storage.set(key('ko'),JSON.stringify({1:{stage:3,passed:true}}));
 storage.set(key('en'),JSON.stringify({1:{stage:2,passed:true}}));
 storage.set('memorize-passage::source',JSON.stringify({1:{done:[0],completed:false}}));
 storage.set('memorize-passage::target',JSON.stringify({1:{done:[1],completed:false}}));
 const context=vm.createContext({localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
  loadProgress:lang=>JSON.parse(storage.get(key(lang))||'{}'),progressKey:key,blessKey:()=>`bless:${user.name}`,saveUser:u=>user=u});
 const source=read('app.js');vm.runInContext(source.slice(source.indexOf('function applyServerUser('),source.indexOf('// 복습은 서버가 소스 오브 트루스')),context);
 context.applyServerUser(user,{user_id:'target',user:{...profile('현재'),id:'target'},merged_from:'source',merged_passage_progress:[{passage_id:1,done_seq:[2],completed_at:'2026-09-10'}]});
 assert.equal(user.user_id,'target');assert.equal(user.cid,'device');
 assert.equal(JSON.parse(storage.get(key('ko')))[1].stage,3);assert.equal(JSON.parse(storage.get(key('en')))[1].stage,2);
 const passage=JSON.parse(storage.get('memorize-passage::target'))[1];assert.deepEqual(passage.done,[0,1,2]);assert.equal(passage.completed,true);
});

test('UI conflict offers preview and requires an explicit checkbox before merging',async()=>{
 const dom=new JSDOM(read('admin-members.html'),{url:'https://local.test',runScripts:'outside-only'}),w=dom.window,d=w.document;
 const s={...profile('홍길동'),id:'old',created_at:'2026-09-01'},t={...profile('홍길동'),gu:'화평',mok:'20',id:'new',identity_key:'교구|화평|20|||홍길동'};
 const calls=[];
 w.supaCall=async(action,b)=>{calls.push({action,b});
  if(action==='authCheck')return {ok:true};
  if(action==='adminFindMembers')return {ok:true,users:[s],more:false};
  if(action==='adminMemberHistory')return {ok:true,history:[]};
  if(action==='adminUpdateMember')throw Error('identity-conflict');
  if(action==='adminPreviewMemberMerge')return {ok:true,source:s,target:t,source_counts:{challenge_log:3,progress:2},target_counts:{challenge_log:5,progress:1}};
  if(action==='adminMergeMembers')return {ok:true,merged:true,user:t};
  throw Error(action);
 };
 w.eval(read('js/admin-members.js'));
 const tick=()=>new Promise(r=>setImmediate(r)),submit=id=>d.getElementById(id).dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 d.getElementById('password').value='test';submit('login-form');await tick();d.getElementById('query').value=s.name;submit('search-form');await tick();d.querySelector('#results button').click();
 d.getElementById('member-gu').value='화평';d.getElementById('member-mok').value='20';d.getElementById('reason').value='소속 이동';submit('edit-form');d.getElementById('save-button').click();await tick();
 assert.equal(d.getElementById('merge-panel').hidden,false);assert.match(d.getElementById('merge-target').textContent,/화평/);
 assert.equal(d.getElementById('merge-save').disabled,true);d.getElementById('merge-save').click();await tick();assert.equal(calls.filter(c=>c.action==='adminMergeMembers').length,0);
 d.getElementById('merge-same-person').checked=true;d.getElementById('merge-same-person').dispatchEvent(new w.Event('change'));d.getElementById('merge-save').click();d.getElementById('merge-save').click();await tick();
 const merges=calls.filter(c=>c.action==='adminMergeMembers');assert.equal(merges.length,1);assert.equal(merges[0].b.target_id,'new');assert.equal(merges[0].b.confirm_same_person,true);
 assert.match(d.getElementById('edit-status').textContent,/합쳤습니다/);assert.equal(d.getElementById('merge-panel').hidden,true);dom.window.close();
});
