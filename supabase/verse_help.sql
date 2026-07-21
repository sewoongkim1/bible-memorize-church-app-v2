-- 암송 도우미(쉬운 풀이 · 암송 기억법) 컬럼 추가 + 이번 주 설교 내용 채우기
-- Supabase SQL Editor에서 그대로 실행하세요.
--   easy_explain : 그 주 암송구절을 아이·어르신 눈높이로 쉽게 풀이(설교 맥락 안에서)
--   memory_tip   : 그 구절을 외우는 요령(끊어읽기·대구·첫글자·연상)
-- 이후 설교는 scripts/4b-versehelp.mjs 가 자동 생성해 5-migrate 로 함께 올라갑니다.

alter table public.sermons add column if not exists easy_explain text;
alter table public.sermons add column if not exists memory_tip   text;

-- 이번 주(골 3:23 · 무슨 일을 하든지 마음을 다하여 주께 하듯 하고)
update public.sermons set
  easy_explain = $E$이 말씀은 "무슨 일이든" 하나님께 드리듯 하라는 뜻이에요. 여기서 '주께 하듯'은 옆에 있는 사람이 아니라 하나님이 보고 계신다고 여기며 일한다는 말이에요. 그래서 설거지나 공부, 회사 일처럼 아무도 알아주지 않는 일도 똑같이 귀합니다. 칭찬을 받으려고 애쓰는 대신, 하나님이 기뻐하실 마음으로 정성껏 하는 것이지요.$E$,
  memory_tip = $M$"무슨 일을 하든지 / 마음을 다하여 / 주께 하듯 하고 / 사람에게 하듯 하지 말라" — 이렇게 네 덩어리로 끊어 읽어 보세요. 뒤의 두 덩어리는 '주께 하듯'과 '사람에게 하듯'이 짝을 이룹니다. "주께는 하듯, 사람에게는 하지 말라"로 대비시켜 두면 순서가 헷갈리지 않아요.$M$
where id = 'SqMbhfxvLDc';

select id, mem_ref, left(easy_explain, 30) as easy, left(memory_tip, 30) as tip
from public.sermons where easy_explain is not null;
