-- 교육신청 4단계 C — 교육 통계(edu_stats) 확인 — **개발에서만**(BEGIN … ROLLBACK). 운영에서 돌리지 않는다.
-- 끝에 「통과」 한 줄(select)이 나오면 끝. 하나라도 어긋나면 raise exception 으로 멈춘다(그때도 ROLLBACK 이라 남는 것 없음).
-- 비교는 전부 `is distinct from` — 함수가 오류를 내서 값이 NULL 이어도 조용히 지나가지 않게.
-- 보는 것(함수가 낸 수 = 줄을 직접 센 수):
--   ① 학기 하나: 강좌마다 신청·확정·대기·취소·반려·수료 수가 줄을 직접 센 값과 같다(정해 둔 값과도) · 보관 강좌·다른 학기 강좌는 빠진다
--   ② 출석률: 확정된 분마다 (출석+지각)×100÷(출석+지각+결석) 반올림(공결·체크 안 한 칸 뺌 · 분모 0 인 분 뺌 · 취소한 분의 출석은 안 셈)의
--      합·수·평균이 정수 셈(반올림 경계 12.5→13 · 37.5→38 · 평균 54.5→55)으로 따로 센 값과 같다
--   ③ 소속별: 확정·수료 수가 줄을 직접 센 값과 같다 · NFD 로 적힌 같은 교구는 한 칸 · 확정 아닌 줄은 안 센다 · 합계 = 강좌별 확정·수료 합
--   ④ p_term null·빈 글자 = 모든 학기(보관 빼고) · terms(빈 학기·보관 강좌뿐인 학기 빼고 · 가장 늦게 만든 강좌의 학기부터)
--   ⑤ 칸 지도 — 강좌·소속 칸 이름이 정해진 것뿐(이름·user_id·ident_key·메모 없음) · 권한은 service_role 만
begin;
do $$
declare
  tag text := substr(md5(random()::text), 1, 8);
  tm text; tm2 text; tm3 text;
  u uuid[] := array[]::uuid[]; uid uuid; i int; r jsonb; st jsonb; x jsonb;
  ca uuid; cb uuid; cc uuid; cd uuid; ce uuid;
  s bigint[];
  e1 bigint; e2 bigint; e3 bigint; e4 bigint; e5 bigint; e6 bigint; e7 bigint; e8 bigint; e9 bigint; es bigint;
  b1 bigint; b2 bigint; b3 bigint;
  n int; m int; att int; ab int; d int; psum int; pn int; pavg int; ids uuid[];
  rec record;
  nfd text := normalize('화평', NFD);
  idn jsonb;
begin
  if (select count(*) from public.users) > 200 then raise exception '운영 같은 DB 입니다(users > 200) — 개발에서만 돌리세요'; end if;
  tm := '통계시험-' || tag; tm2 := '통계시험2-' || tag; tm3 := '통계시험3-' || tag;
  if nfd = '화평' then raise exception 'NFD 글자를 만들지 못했다'; end if;

  for i in 1..10 loop
    insert into public.users(identity_key, type, gu, mok, name) values ('교구|통계시험|' || i || '|||' || tag, '교구', '통계시험', i::text, '이름' || tag || i)
      returning id into uid;
    u := u || uid;
  end loop;

  -- 강좌 — A·B(학기 tm) · C(학기 tm3 · 나중에 보관) · D(학기 tm2) · E(학기 없음 · 준비 중). 만든 때를 따로 둔다(한 트랜잭션은 now() 가 같다)
  insert into public.edu_courses(title, kind, term, capacity, mode, waitlist, status, created_at)
    values ('통계 A ' || tag, 'regular', tm, null, 'auto', true, 'open', now() - interval '3 hours') returning id into ca;
  insert into public.edu_courses(title, kind, term, capacity, mode, waitlist, status, created_at)
    values ('통계 B ' || tag, 'lecture', tm, null, 'approve', true, 'open', now() - interval '2 hours') returning id into cb;
  insert into public.edu_courses(title, kind, term, capacity, mode, waitlist, status, created_at)
    values ('통계 C ' || tag, 'lecture', tm3, null, 'auto', true, 'open', now() - interval '90 minutes') returning id into cc;
  insert into public.edu_courses(title, kind, term, capacity, mode, waitlist, status, created_at)
    values ('통계 D ' || tag, 'lecture', tm2, null, 'auto', true, 'open', now() - interval '1 hour') returning id into cd;
  insert into public.edu_courses(title, kind, term, capacity, mode, waitlist, status, created_at)
    values ('통계 E ' || tag, 'lecture', '', null, 'auto', true, 'draft', now()) returning id into ce;

  -- A: 확정 여섯(앱 다섯 + 대신 등록 새가족 하나) · 취소 하나(출석 있음) · 반려 · 신청 · 대기 하나씩
  --    ⚠️ 차례: 선착순·정원 없음이라 확정 줄이 빠지면 대기 첫 분이 올라간다(edu_promote) — 대기는 맨 끝에 만든다
  idn := jsonb_build_object('who_type','교구','group_name','화평','sub_name','1');
  e1 := (edu_apply(ca, u[1], idn || jsonb_build_object('name','이름' || tag || '1')) ->> 'id')::bigint;
  e2 := (edu_apply(ca, u[2], jsonb_build_object('name','이름' || tag || '2','who_type','교구','group_name','화평','sub_name','2')) ->> 'id')::bigint;
  e3 := (edu_apply(ca, u[3], jsonb_build_object('name','이름' || tag || '3','who_type','교구','group_name','소망','sub_name','1')) ->> 'id')::bigint;
  e4 := (edu_apply(ca, u[4], jsonb_build_object('name','이름' || tag || '4','who_type','교회학교','group_name','중등부','sub_name','2')) ->> 'id')::bigint;
  e5 := (edu_apply(ca, u[5], jsonb_build_object('name','이름' || tag || '5','who_type','교구','group_name', nfd,'sub_name','3')) ->> 'id')::bigint;
  e6 := (edu_apply(ca, u[6], jsonb_build_object('name','이름' || tag || '6','who_type','교구','group_name','소망','sub_name','2')) ->> 'id')::bigint;
  r := edu_apply(ca, null, jsonb_build_object('name','이름' || tag || 's','who_type','새가족','group_name','','sub_name','',
        'ident_key','staff|새가족|||이름' || tag || 's'), true);
  es := (r->>'id')::bigint;
  if (select count(*) from public.edu_enrollments where course_id = ca and status = 'confirmed') is distinct from 7::bigint then
    raise exception 'A 처음 확정 일곱이어야: %', (select count(*) from public.edu_enrollments where course_id = ca and status = 'confirmed');
  end if;

  -- 회차 여덟 · 출석
  insert into public.edu_sessions(course_id, no, on_date) select ca, g, date '2026-11-01' + (g - 1) * 7 from generate_series(1, 8) g;
  s := array(select id from public.edu_sessions where course_id = ca order by no);
  --   e1: 출석·지각·결석·공결 → 2×100÷3 = 66.7 → 67
  perform edu_attendance_set(s[1], e1, 'present'); perform edu_attendance_set(s[2], e1, 'late');
  perform edu_attendance_set(s[3], e1, 'absent');  perform edu_attendance_set(s[4], e1, 'excused');
  --   e2: 출석 셋 → 100
  for i in 1..3 loop perform edu_attendance_set(s[i], e2, 'present'); end loop;
  --   e3: 공결 하나뿐 → 분모 0 → 평균에서 뺀다
  perform edu_attendance_set(s[1], e3, 'excused');
  --   e4: 출석 1·결석 7 → 12.5 → 13(반올림 경계)
  perform edu_attendance_set(s[1], e4, 'present');
  for i in 2..8 loop perform edu_attendance_set(s[i], e4, 'absent'); end loop;
  --   e5: 출석 3·결석 5 → 37.5 → 38
  for i in 1..3 loop perform edu_attendance_set(s[i], e5, 'present'); end loop;
  for i in 4..8 loop perform edu_attendance_set(s[i], e5, 'absent'); end loop;
  --   e6: 출석 둘 뒤 취소 → 확정 아님 → 안 센다
  perform edu_attendance_set(s[1], e6, 'present'); perform edu_attendance_set(s[2], e6, 'present');
  if (select count(*) from public.edu_attendance where enrollment_id in (e1, e2, e3, e4, e5, e6)) is distinct from 26::bigint then
    raise exception '출석 칸 수: %', (select count(*) from public.edu_attendance where enrollment_id in (e1, e2, e3, e4, e5, e6));
  end if;
  r := edu_cancel(e6, true);
  if r->>'ok' is distinct from 'true' or r->>'promoted' is not null then raise exception 'e6 취소: %', r; end if;
  e8 := (edu_apply(ca, u[8], jsonb_build_object('name','이름' || tag || '8','who_type','교구','group_name','기쁨','sub_name','1')) ->> 'id')::bigint;
  r := edu_staff_set(e8, 'declined');
  if r->>'ok' is distinct from 'true' or r->>'promoted' is not null then raise exception 'e8 반려: %', r; end if;
  e9 := (edu_apply(ca, u[9], jsonb_build_object('name','이름' || tag || '9','who_type','교구','group_name','기쁨','sub_name','2')) ->> 'id')::bigint;
  r := edu_staff_set(e9, 'applied');
  if r->>'ok' is distinct from 'true' or r->>'promoted' is not null then raise exception 'e9 신청으로: %', r; end if;
  e7 := (edu_apply(ca, u[7], jsonb_build_object('name','이름' || tag || '7','who_type','교구','group_name','기쁨','sub_name','3')) ->> 'id')::bigint;
  r := edu_staff_set(e7, 'waitlisted');
  if r->>'ok' is distinct from 'true' or r->>'promoted' is not null then raise exception 'e7 대기로: %', r; end if;
  -- 수료 — e1·e2 수료 뒤 e2 수료 취소 → 지금 수료는 e1 하나
  r := edu_issue_certs(ca, array[e1, e2]);
  if r->>'ok' is distinct from 'true' then raise exception '수료: %', r; end if;
  r := edu_revoke_cert(e2);
  if r->>'ok' is distinct from 'true' then raise exception '수료 취소: %', r; end if;

  -- B(승인): 신청 · 확정 · 반려 하나씩
  b1 := (edu_apply(cb, u[1], jsonb_build_object('name','이름' || tag || '1','who_type','교구','group_name','화평','sub_name','1')) ->> 'id')::bigint;
  b2 := (edu_apply(cb, u[10], jsonb_build_object('name','이름' || tag || '10','who_type','교구','group_name','믿음','sub_name','4')) ->> 'id')::bigint;
  b3 := (edu_apply(cb, u[3], jsonb_build_object('name','이름' || tag || '3','who_type','교구','group_name','소망','sub_name','1')) ->> 'id')::bigint;
  if (select count(*) from public.edu_enrollments where id in (b1, b2, b3) and status = 'applied') is distinct from 3::bigint then raise exception 'B 신청 셋'; end if;
  r := edu_staff_set(b2, 'confirmed');
  if r->>'ok' is distinct from 'true' then raise exception 'b2 확정: %', r; end if;
  r := edu_staff_set(b3, 'declined');
  if r->>'ok' is distinct from 'true' then raise exception 'b3 반려: %', r; end if;

  -- C(보관 · 그 학기는 보관 강좌뿐) · D(다른 학기) · E(학기 없음 · 대신 등록)
  r := edu_apply(cc, u[2], jsonb_build_object('name','이름' || tag || '2','who_type','교구','group_name','화평','sub_name','2'));
  if r->>'status' is distinct from 'confirmed' then raise exception 'C: %', r; end if;
  update public.edu_courses set status = 'archived' where id = cc;
  r := edu_apply(cd, u[3], jsonb_build_object('name','이름' || tag || '3','who_type','교구','group_name','소망','sub_name','1'));
  if r->>'status' is distinct from 'confirmed' then raise exception 'D: %', r; end if;
  r := edu_apply(ce, null, jsonb_build_object('name','이름' || tag || 'e','ident_key','staff|새가족|||이름' || tag || 'e'), true);
  if r->>'status' is distinct from 'confirmed' then raise exception 'E: %', r; end if;

  -- ① 학기 하나 — 강좌 둘(A·B)뿐 · 만든 때 늦은 것부터(B → A)
  st := edu_stats(tm);
  if st->>'term' is distinct from tm then raise exception '① term: %', st->'term'; end if;
  ids := array(select (t.c->>'id')::uuid from jsonb_array_elements(st->'courses') with ordinality as t(c, o) order by t.o);
  if ids is distinct from array[cb, ca] then raise exception '① 강좌(B → A)여야: %', ids; end if;
  -- 정해 둔 값
  x := (select c from jsonb_array_elements(st->'courses') c where (c->>'id')::uuid = ca);
  if (x->>'applied')::int is distinct from 1 or (x->>'confirmed')::int is distinct from 6 or (x->>'waitlisted')::int is distinct from 1
     or (x->>'cancelled')::int is distinct from 1 or (x->>'declined')::int is distinct from 1 or (x->>'completed')::int is distinct from 1 then
    raise exception '① A 수: %', x;
  end if;
  if (x->>'attend_n')::int is distinct from 4 or (x->>'attend_sum')::int is distinct from 218 or (x->>'attend_avg')::int is distinct from 55 then
    raise exception '② A 출석률(67+100+13+38 = 218 · 넷 · 54.5 → 55)이어야: %', x;
  end if;
  if x->>'title' is distinct from '통계 A ' || tag or x->>'term' is distinct from tm or x->>'status' is distinct from 'open' then raise exception '① A 칸: %', x; end if;
  x := (select c from jsonb_array_elements(st->'courses') c where (c->>'id')::uuid = cb);
  if (x->>'applied')::int is distinct from 1 or (x->>'confirmed')::int is distinct from 1 or (x->>'waitlisted')::int is distinct from 0
     or (x->>'cancelled')::int is distinct from 0 or (x->>'declined')::int is distinct from 1 or (x->>'completed')::int is distinct from 0
     or (x->>'attend_n')::int is distinct from 0 or (x->>'attend_sum')::int is distinct from 0 or x->'attend_avg' is distinct from 'null'::jsonb then
    raise exception '① B 수: %', x;
  end if;

  -- ①·② 줄을 직접 센 값(강좌마다) — 상태별 수 · 수료 · 출석률은 정수 셈(반올림 = (2×출석×100 + 분모) ÷ (2×분모))
  for x in select c from jsonb_array_elements(edu_stats(null)->'courses') c where (c->>'id')::uuid in (ca, cb, cd, ce) loop
    for rec in select k.st from unnest(array['applied','confirmed','waitlisted','cancelled','declined']) as k(st) loop
      n := (select count(*) from public.edu_enrollments where course_id = (x->>'id')::uuid and status = rec.st);
      if (x->>rec.st)::int is distinct from n then raise exception '① % % : 함수 % · 직접 %', x->>'title', rec.st, x->>rec.st, n; end if;
    end loop;
    n := (select count(*) from public.edu_enrollments where course_id = (x->>'id')::uuid and completed and not cert_revoked);
    if (x->>'completed')::int is distinct from n then raise exception '① % 수료: 함수 % · 직접 %', x->>'title', x->>'completed', n; end if;
    psum := 0; pn := 0;
    for rec in select id from public.edu_enrollments where course_id = (x->>'id')::uuid and status = 'confirmed' loop
      att := (select count(*) from public.edu_attendance where enrollment_id = rec.id and state in ('present','late'));
      ab  := (select count(*) from public.edu_attendance where enrollment_id = rec.id and state = 'absent');
      d := att + ab;
      if d > 0 then psum := psum + (2 * att * 100 + d) / (2 * d); pn := pn + 1; end if;
    end loop;
    pavg := case when pn > 0 then (2 * psum + pn) / (2 * pn) end;
    if (x->>'attend_n')::int is distinct from pn or (x->>'attend_sum')::int is distinct from psum
       or (x->>'attend_avg')::int is distinct from pavg then
      raise exception '② % 출석률: 함수 %/%/% · 직접 %/%/%', x->>'title', x->>'attend_n', x->>'attend_sum', x->>'attend_avg', pn, psum, pavg;
    end if;
  end loop;

  -- ③ 소속별(학기 tm) — 정해 둔 값 · 줄을 직접 센 값 · 합계 = 강좌별 합
  if jsonb_array_length(st->'groups') is distinct from 5 then raise exception '③ 소속 다섯(화평·소망·믿음·중등부·새가족)이어야: %', st->'groups'; end if;
  x := (select g from jsonb_array_elements(st->'groups') g where g->>'who_type' = '교구' and g->>'group_name' = '화평');
  if (x->>'confirmed')::int is distinct from 3 or (x->>'completed')::int is distinct from 1 then
    raise exception '③ 화평(e1·e2·NFD e5 = 셋 · 수료 e1)이어야: %', x;
  end if;
  if exists (select 1 from jsonb_array_elements(st->'groups') g where g->>'group_name' = nfd) then raise exception '③ NFD 화평이 따로 남았다'; end if;
  x := (select g from jsonb_array_elements(st->'groups') g where g->>'who_type' = '교구' and g->>'group_name' = '소망');
  if (x->>'confirmed')::int is distinct from 1 or (x->>'completed')::int is distinct from 0 then raise exception '③ 소망(e3 · 취소 e6·반려 b3 빼고)이어야: %', x; end if;
  x := (select g from jsonb_array_elements(st->'groups') g where g->>'who_type' = '새가족');
  if x->>'group_name' is distinct from '' or (x->>'confirmed')::int is distinct from 1 then raise exception '③ 새가족(대신 등록)이어야: %', x; end if;
  if exists (select 1 from jsonb_array_elements(st->'groups') g where g->>'group_name' = '기쁨') then raise exception '③ 기쁨(대기·반려·신청뿐)은 안 나와야'; end if;
  for x in select g from jsonb_array_elements(st->'groups') g loop
    n := (select count(*) from public.edu_enrollments e join public.edu_courses c on c.id = e.course_id
          where c.term = tm and c.status <> 'archived' and e.status = 'confirmed'
            and btrim(normalize(e.who_type, NFC)) = x->>'who_type' and btrim(normalize(e.group_name, NFC)) = x->>'group_name');
    m := (select count(*) from public.edu_enrollments e join public.edu_courses c on c.id = e.course_id
          where c.term = tm and c.status <> 'archived' and e.status = 'confirmed' and e.completed
            and btrim(normalize(e.who_type, NFC)) = x->>'who_type' and btrim(normalize(e.group_name, NFC)) = x->>'group_name');
    if (x->>'confirmed')::int is distinct from n or (x->>'completed')::int is distinct from m then
      raise exception '③ %·% : 함수 %/% · 직접 %/%', x->>'who_type', x->>'group_name', x->>'confirmed', x->>'completed', n, m;
    end if;
  end loop;
  if (select sum((g->>'confirmed')::int) from jsonb_array_elements(st->'groups') g) is distinct from
     (select sum((c->>'confirmed')::int) from jsonb_array_elements(st->'courses') c) then raise exception '③ 소속 확정 합 ≠ 강좌 확정 합'; end if;
  if (select sum((g->>'completed')::int) from jsonb_array_elements(st->'groups') g) is distinct from
     (select sum((c->>'completed')::int) from jsonb_array_elements(st->'courses') c) then raise exception '③ 소속 수료 합 ≠ 강좌 수료 합'; end if;

  -- ④ 모든 학기 — null·빈 글자 같다 · 보관 C 빠짐 · D·E 들어감 · 학기 목록
  st := edu_stats(null);
  if st->'term' is distinct from 'null'::jsonb then raise exception '④ term null: %', st->'term'; end if;
  ids := array(select (t.c->>'id')::uuid from jsonb_array_elements(st->'courses') with ordinality as t(c, o) order by t.o);
  if not (ids @> array[ca, cb, cd, ce]) or cc = any(ids) then raise exception '④ 모든 학기(보관 빼고): %', ids; end if;
  if array_position(ids, ce) > array_position(ids, cd) or array_position(ids, cd) > array_position(ids, cb)
     or array_position(ids, cb) > array_position(ids, ca) then raise exception '④ 차례(만든 때 늦은 것부터): %', ids; end if;
  if (select array_agg(c->>'id' order by c->>'id') from jsonb_array_elements(edu_stats('')->'courses') c)
     is distinct from (select array_agg(c->>'id' order by c->>'id') from jsonb_array_elements(st->'courses') c) then
    raise exception '④ 빈 글자 = null 이어야';
  end if;
  if not (st->'terms' ? tm) or not (st->'terms' ? tm2) then raise exception '④ 학기 목록에 tm·tm2: %', st->'terms'; end if;
  if st->'terms' ? tm3 then raise exception '④ 보관 강좌뿐인 학기가 목록에 있다'; end if;
  if st->'terms' ? '' then raise exception '④ 빈 학기가 목록에 있다'; end if;
  if (select min(t.o) from jsonb_array_elements_text(st->'terms') with ordinality as t(v, o) where t.v = tm2)
     > (select min(t.o) from jsonb_array_elements_text(st->'terms') with ordinality as t(v, o) where t.v = tm) then
    raise exception '④ 학기 차례(tm2 의 강좌가 더 늦게 만들어졌다): %', st->'terms';
  end if;
  if jsonb_array_length(edu_stats('없는학기-' || tag)->'courses') is distinct from 0
     or jsonb_array_length(edu_stats('없는학기-' || tag)->'groups') is distinct from 0 then raise exception '④ 없는 학기는 빈 목록'; end if;

  -- ⑤ 칸 지도 · 권한
  st := edu_stats(tm);
  for x in select c from jsonb_array_elements(st->'courses') c loop
    if (select array_agg(k order by k collate "C") from jsonb_object_keys(x) k) is distinct from
       array['applied','attend_avg','attend_n','attend_sum','cancelled','completed','confirmed','declined','id','status','term','title','waitlisted'] then
      raise exception '⑤ 강좌 칸: %', (select array_agg(k order by k collate "C") from jsonb_object_keys(x) k);
    end if;
  end loop;
  for x in select g from jsonb_array_elements(st->'groups') g loop
    if (select array_agg(k order by k collate "C") from jsonb_object_keys(x) k) is distinct from array['completed','confirmed','group_name','who_type'] then
      raise exception '⑤ 소속 칸: %', (select array_agg(k order by k collate "C") from jsonb_object_keys(x) k);
    end if;
  end loop;
  if (select array_agg(k order by k collate "C") from jsonb_object_keys(st) k) is distinct from array['courses','groups','term','terms'] then
    raise exception '⑤ 맨 위 칸: %', (select array_agg(k order by k collate "C") from jsonb_object_keys(st) k);
  end if;
  if st::text like '%이름%' or st::text like '%user_id%' or st::text like '%ident_key%' or st::text like '%staff|%' then
    raise exception '⑤ 이름·계정·신원 키가 실렸다';
  end if;
  if has_function_privilege('anon', 'public.edu_stats(text)', 'execute') then raise exception '⑤ anon 이 부를 수 있다'; end if;
  if has_function_privilege('authenticated', 'public.edu_stats(text)', 'execute') then raise exception '⑤ authenticated 가 부를 수 있다'; end if;
  if not has_function_privilege('service_role', 'public.edu_stats(text)', 'execute') then raise exception '⑤ service_role 이 못 부른다'; end if;
  if not (select prosecdef from pg_proc where oid = 'public.edu_stats(text)'::regprocedure) then raise exception '⑤ security definer 가 아니다'; end if;
  set local role service_role;
  r := edu_stats(tm);
  reset role;
  if jsonb_array_length(r->'courses') is distinct from 2 then raise exception '⑤ service_role 로 부름: %', r; end if;
end $$;
select '통과' as result;
rollback;
