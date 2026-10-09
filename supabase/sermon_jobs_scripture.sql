-- 설교 올리기 ② 에서 담당자가 넣는 「설교 구절」(scripture · 암송 구절과 다름).
-- 워크플로(gocheok-sermons)가 이 값을 설교 본문 구절로 그대로 쓴다 — 비어 있을 때만 AI 가 자막에서 뽑는다.
-- 개발 먼저, 그다음 운영. 되돌리기: alter table public.sermon_jobs drop column if exists scripture;
alter table public.sermon_jobs add column if not exists scripture text;
