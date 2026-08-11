-- 한글·영어(NIV) 진도를 따로 센다
-- ⚠️ 이 저장소는 공개(public)입니다 — 비밀번호·키를 절대 넣지 마세요.
--
-- 적용: Supabase 대시보드 → SQL Editor에 붙여넣고 실행
--
-- 같은 구절이라도 한글로 외우는 것과 영어로 외우는 것은 서로 다른 암송이다.
-- 기존 행은 모두 한글(ko)로 남고, 영어 기록만 새 행으로 쌓인다.
-- 복습(reviews)·순위(challenge_log)는 언어를 가리지 않으므로 그대로 둔다.

alter table public.progress add column if not exists lang text not null default 'ko';

alter table public.progress drop constraint if exists progress_lang_chk;
alter table public.progress add constraint progress_lang_chk
  check (lang in ('ko', 'en'));

-- 기본키를 (user_id, verse_no) → (user_id, verse_no, lang)으로
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'progress_pkey' and conrelid = 'public.progress'::regclass
  ) then
    alter table public.progress drop constraint progress_pkey;
  end if;
end $$;

alter table public.progress add primary key (user_id, verse_no, lang);

-- 확인: select lang, count(*) from progress group by lang;
