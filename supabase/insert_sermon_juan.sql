-- 2026-07-19 '주 안에서, 주께 하듯'(골로새서 3:18-25) 설교 등록/보정
-- 유튜브 봇차단(Actions)으로 파이프라인 자동취득이 실패해, 전사본을 로컬에서 받아
-- 요약/핵심포인트/맺음말을 채워 직접 upsert 한다. (importSermons는 ignoreDuplicates라 이후 덮이지 않음)
-- 실행: Supabase Dashboard → SQL Editor 에 붙여넣고 Run

-- 결론(맺음말) 컬럼 보장(한 번만 필요, 이미 있으면 무시)
alter table public.sermons add column if not exists conclusion text;

insert into public.sermons
  (id, title, svc_date, category, preacher, scripture, summary, points, conclusion,
   mem_ref, mem_text, hidden, updated_at)
values (
  'SqMbhfxvLDc',
  $T$주 안에서, 주께 하듯$T$,
  '2026-07-19',
  '주일설교',
  $PR$차동혁 위임목사$PR$,
  $SC$골로새서 3:18-25$SC$,
  $S$이번 주 암송말씀은 골로새서 3장 23절, “무슨 일을 하든지 마음을 다하여 주께 하듯 하고 사람에게 하듯 하지 말라”입니다. 우리는 흔히 신앙의 한계선을 교회 울타리 안으로만 그어 놓고, 교회에서만 거룩하면 된다고 여기기 쉽습니다. 그러나 하나님은 온 우주의 왕이시기에 그분이 들어가지 못하시는 금지 구역이란 없습니다. 출근길도, 사무실도, 우리 가정도 모두 하나님의 영토입니다. 오늘 본문은 우리의 가정과 일터가 곧 복음의 ‘땅 끝’이라 말씀하며, 그 땅 끝에 어떻게 예수님의 깃발을 꽂고 살아갈 수 있는지를 세 가지로 보여 줍니다.$S$,
  $P$[
    {"heading":"가정에서는 — 주 안에서","body":"본문 18~21절은 아내와 남편, 자녀와 부모가 모든 일을 ‘주 안에서’ 행하라고 말씀합니다. 여기 ‘복종하다’는 억지로가 아니라, 마리아가 주님의 발치에 스스로 앉아 말씀을 들었던 것처럼(눅 10:39) 자발적으로 상대의 자리에 나를 내려놓는 것입니다. 서로 사랑하라는 말씀도 목숨을 내놓는 아가페 사랑을 뜻합니다. 이번 한 주, 대화의 주인공을 ‘나’에서 ‘너’로, 다시 ‘예수님’으로 옮기는 ‘마리아 대화법’으로 우리 가정에 천국의 새싹이 돋아나기를 바랍니다."},
    {"heading":"일터에서는 — 주께 하듯","body":"23절은 무슨 일을 하든지 마음을 다하여, 곧 영혼까지 끌어모아 ‘주께 하듯’ 하라고 말씀합니다. 사람의 눈치를 보고 사람을 기쁘게 하는 일은 세상의 성공은 얻어도 하늘의 상급은 남지 않습니다. 그러나 누가 보든 보지 않든 하나님을 의식하며 일하면, 세상의 일조차 주님을 섬기는 예배가 됩니다. ‘메리와 하나님’이라 적힌 이름표를 달고 계산대를 설교단 삼았던 한 점원처럼, 우리의 일터에도 예수님의 깃발이 꽂히기를 바랍니다."},
    {"heading":"상은 — 주께서 주십니다","body":"24~25절은 그 상을 ‘주께서’ 기업의 상으로 주신다고 약속합니다. 기업의 상은 일을 얼마나 잘했는지 따져 주는 임금이 아니라, 자녀에게 물려주는 상속입니다. 하나님은 외모로 취하지 않으시며, 우리가 잘해서가 아니라 그분의 자녀이기에 우리를 예뻐하십니다. 사람은 몰라줘도 하나님은 주 안에서 주께 하듯 한 우리의 섬김을 결코 잊지 않으시고 하늘의 상급으로 갚아 주십니다."}
  ]$P$::jsonb,
  $C$아프리카에서 50년을 섬기고 은퇴한 노 선교사 부부를 아무도 마중 나오지 않았을 때, 하나님은 ‘너는 아직 집에 온 것이 아니다, 내가 줄 상이 있다’고 하셨습니다. 아무도 보지 않는 교회 마당에서 땀 흘려 그늘막을 고치던 성도들의 수고를, 하나님은 하늘에서 사진으로 찍어 천국 사진첩에 차곡차곡 쌓아 두십니다. 그러니 이 한 주도 가정 생활은 주 안에서, 사회생활은 주께 하듯 하시기 바랍니다. 우리 가정과 일터에 예수님의 깃발을 꽂아 그곳이 하나님의 영토임을 선포하는 복된 한 주 되시기를 예수님의 이름으로 축복합니다.$C$,
  $MR$골로새서 3:23$MR$,
  $MT$무슨 일을 하든지 마음을 다하여 주께 하듯 하고 사람에게 하듯 하지 말라$MT$,
  false,
  now()
)
on conflict (id) do update set
  title      = excluded.title,
  svc_date   = excluded.svc_date,
  category   = excluded.category,
  preacher   = excluded.preacher,
  scripture  = excluded.scripture,
  summary    = excluded.summary,
  points     = excluded.points,
  conclusion = excluded.conclusion,
  mem_ref    = excluded.mem_ref,
  mem_text   = excluded.mem_text,
  hidden     = false,
  updated_at = now();

-- 확인:
-- select id, title, svc_date, scripture, jsonb_array_length(points) pts,
--        left(summary,24) summary, left(conclusion,24) conclusion, hidden
--   from public.sermons where id = 'SqMbhfxvLDc';
