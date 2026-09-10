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
