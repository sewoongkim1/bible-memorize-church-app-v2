-- 매일 묵상 발송 이력에 '본문(내용)'까지 남기기 위한 컬럼 추가(한 번만).
-- 없어도 제목(🌿 묵상 주제)·발송수는 기록되지만, 이걸 실행하면 알림 본문 전체가 이력에 남습니다.
-- 실행: Supabase Dashboard → SQL Editor 에 붙여넣고 Run
alter table public.push_log add column if not exists body text;
