-- 저녁 알림 on/off — 「저녁만 끄는 길」을 만든다 (2026-09-23, 0판)
--
-- ⚠️ 기본값은 true(켜짐)다. 지금 구독자는 34명뿐이라, 기본을 false 로 두면
--    저녁 알림이 사실상 아무에게도 안 간다. 대신 문구를 함께 고쳐(0판)
--    「아침·저녁 두 번」을 동의 시점에 알려 드린다.
--
-- ⚠️ 저녁 on/off 는 **사람 단위**다(시각 hour 는 기기 단위인 것과 다르다).
--    한 분이 웹과 아이폰을 함께 쓰시면 저녁은 둘 다 같이 꺼지는 것이 자연스럽다.
--
-- 개발 먼저, 운영 그다음.

alter table public.push_subscriptions
  add column if not exists evening boolean not null default true;

alter table public.ios_push_tokens
  add column if not exists evening boolean not null default true;

-- 저녁 발송이 이 칸으로 거르므로 인덱스를 함께 둔다(구독이 늘어나도 싸게 거른다).
create index if not exists idx_push_sub_evening on public.push_subscriptions(evening);
create index if not exists idx_ios_push_evening on public.ios_push_tokens(evening);

-- 확인:
--   select evening, count(*) from public.push_subscriptions group by evening;
--   select evening, count(*) from public.ios_push_tokens   group by evening;
