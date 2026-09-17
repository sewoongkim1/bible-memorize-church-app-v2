-- 사역신청 관리 화면(admin-ministry.html) 담당자 등록 (2026-09-17)
--
-- ⚠️⚠️ 이제는 **관리자 화면 「🔑 사역신청 담당자」에서** 한 분씩 추가·빼기 하세요(2026-09-17).
--      이 SQL 은 목록을 **통째로 바꾸므로 화면에서 넣은 분이 지워집니다.** 화면을 쓸 수 없을 때만 쓰세요.
--
-- 사역신청 담당자는 관리자 메뉴 전체가 아니라 사역신청 두 메뉴(현황 · 사역팀 정보)만 씁니다.
-- 들어오려면 둘 다 맞아야 합니다:
--   ① 사역신청 암호  — Edge Function 시크릿 MINISTRY_SECRET
--   ② 담당자 확인    — 여기 등록된 분(app_config `ministryAdmins`, identity_key 배열)
-- 관리자 암호(ADMIN_SECRET)로는 담당자 확인 없이 들어갑니다(관리자는 모든 자료를 본다).
--
-- 왜 코드가 아니라 여기에 두나: pilsa_admin_notify.sql 과 같습니다 — 저장소가 공개라
-- 이름을 코드에 박으면 그대로 드러나고, 담당자가 바뀔 때마다 배포를 다시 해야 합니다.
--
-- ⚠️ 이건 스키마가 아니라 '사람 등록'입니다. 운영에서 실행하세요.
--    개발 DB에는 시험용 「교구 사랑 1목장 사역담당시험」 한 분만 등록해 두었습니다.
-- ⚠️ 이 SQL 은 목록을 **통째로 바꿉니다**. 한 분을 더할 때도 기존 분들을 함께 적으세요.
--    (지금 누가 있는지는 맨 아래 「확인」 질의로 봅니다.)
-- 담당자의 이름·소속이 바뀌어도(성도 정보 관리) 서버가 옛 키를 별칭(user_identity_aliases)으로 따라가
-- 그분을 알아봅니다 — 다시 등록할 필요가 없습니다.
--
-- ── 쓰는 법 ─────────────────────────────────────────────────
-- 아래 WHERE의 이름·교구·목장을 담당자에 맞게 고쳐 실행하세요.
-- 교회학교 소속이면 gu/mok 대신 bu/grade로 찾으면 됩니다.
do $do$
declare
  keys text[];
begin
  select array_agg(u.identity_key) into keys
    from users u
   where (u.name, u.gu, u.mok) in
         ( ('담당자이름', '교구이름', '목장번호')      -- 예: ('홍길동', '화평', '20')
         -- , ('두번째담당자', '교구이름', '목장번호')  -- 여러 명이면 줄을 늘리세요
         );

  -- 한 명도 못 찾으면 집계가 NULL 이 되어 app_config.value(not null)에 알 수 없는 오류로 걸린다
  -- (pilsa_admin_notify.sql 에서 겪었다) — 사람이 읽을 수 있는 말로 먼저 멈춘다.
  if keys is null then
    raise exception
      '담당자를 찾지 못했습니다 — 아무도 등록하지 않았습니다. '
      'WHERE의 이름·교구·목장이 users의 값과 글자까지 똑같아야 합니다(앱에 한 번은 로그인하신 분이어야 합니다). '
      '교회학교 소속이면 gu/mok 대신 bu/grade로 찾으세요.';
  end if;

  insert into app_config (key, value, updated_at)
  values ('ministryAdmins', to_jsonb(keys), now())
  on conflict (key) do update
     set value = excluded.value, updated_at = now();

  raise notice '사역신청 담당자 %명을 등록했습니다.', array_length(keys, 1);
end
$do$;

-- 확인 — 누가 등록돼 있는지(목록에 있어도 users 에 없는 키는 서버가 통과시키지 않는다)
select k.key as 등록된_identity_key, u.name, u.gu, u.mok, u.bu, u.grade,
       (u.id is not null) as 앱사용자_있음
  from app_config c
  cross join lateral jsonb_array_elements_text(c.value) as k(key)
  left join users u on u.identity_key = k.key
 where c.key = 'ministryAdmins';

-- 모두 빼려면(사역신청 암호로는 아무도 못 들어오게)
--   delete from app_config where key = 'ministryAdmins';
