-- 테스트 계정의 암송·도전 기록 지우기 (2026-08-25)
--
-- ⚠️⚠️ 김세웅이 **둘** 있습니다.
--        · 화평 3목장  — 테스트용 (지울 것)
--        · 화평 20목장 — 필사 담당자 계정 (절대 건드리면 안 됨)
--      이름만 보고 지우면 진짜 기록이 날아갑니다.
--      그래서 1)에서 **눈으로 확인한 뒤** 2)를 실행하세요. 되돌릴 수 없습니다.
--
-- ■ 집계표는 알아서 따라옵니다
--   daily_activity 는 challenge_log 의 INSERT·DELETE 트리거로 동기화됩니다.
--   따로 손대지 마세요 — 지우면 순위·마이데이 숫자도 함께 줄어듭니다.
--
-- ■ identity_key 모양 : 교구|화평|3|||김세웅
--   (type|gu|mok|bu|grade|name — 교회학교면 gu·mok 자리가 비고 bu·grade가 찹니다)


-- ════════════════════════════════════════════════════════════
-- 1) 먼저 확인 — 지울 사람이 정말 그 사람인지 눈으로 본다
-- ════════════════════════════════════════════════════════════
select u.id,
       u.identity_key,
       u.name, u.gu, u.mok,
       (select count(*) from challenge_log c where c.user_id = u.id) as 암송_도전_기록,
       (select count(*) from progress     p where p.user_id = u.id) as 진도_기록,
       (select count(*) from reviews      r where r.user_id = u.id) as 복습_예약,
       u.created_at
  from users u
 where u.name = '김세웅'
 order by u.gu, u.mok;
--   ↑ 여러 줄이 나오면 **화평 3목장** 줄의 identity_key 가
--     '교구|화평|3|||김세웅' 인지 확인하세요. 다르면 아래 값을 그 줄에 맞게 고칩니다.


-- ════════════════════════════════════════════════════════════
-- 2) 지우기 — 암송·도전 기록만 (요청하신 것)
--    daily_activity 는 트리거가 알아서 줄여 줍니다.
-- ════════════════════════════════════════════════════════════
delete from challenge_log
 where user_id in (
   select id from users where identity_key = '교구|화평|3|||김세웅'
 );


-- ════════════════════════════════════════════════════════════
-- 3) 확인 — 기록이 0이 되고, 순위에서도 사라졌는지
-- ════════════════════════════════════════════════════════════
select u.identity_key,
       (select count(*) from challenge_log c where c.user_id = u.id) as 남은_기록,
       (select coalesce(sum(d.cnt),0) from daily_activity d where d.user_id = u.id) as 집계표_합계
  from users u
 where u.identity_key = '교구|화평|3|||김세웅';
--   둘 다 0 이어야 합니다. 집계표가 0이 아니면 트리거가 없는 것이니 알려 주세요.


-- ════════════════════════════════════════════════════════════
-- (선택) 더 지우고 싶을 때 — 필요할 때만 주석을 풀어 실행
-- ════════════════════════════════════════════════════════════

-- 4-a. 진도·복습까지 (말씀 앨범·복습 예약도 함께 사라집니다)
-- delete from progress         where user_id in (select id from users where identity_key = '교구|화평|3|||김세웅');
-- delete from reviews          where user_id in (select id from users where identity_key = '교구|화평|3|||김세웅');
-- delete from passage_progress where user_id in (select id from users where identity_key = '교구|화평|3|||김세웅');

-- 4-b. 그 계정이 남긴 나머지 (게시판 글·공감·응원·이벤트 응모·알림 등록)
-- delete from board_reactions   where user_id in (select id from users where identity_key = '교구|화평|3|||김세웅');
-- delete from board_replies     where user_id in (select id from users where identity_key = '교구|화평|3|||김세웅');
-- delete from board_posts       where user_id in (select id from users where identity_key = '교구|화평|3|||김세웅');
-- delete from rank_cheers       where from_user_id   in (select id from users where identity_key = '교구|화평|3|||김세웅')
--                                  or target_user_id in (select id from users where identity_key = '교구|화평|3|||김세웅');
-- delete from event_entries     where user_id in (select id from users where identity_key = '교구|화평|3|||김세웅');
-- delete from push_subscriptions where user_id in (select id from users where identity_key = '교구|화평|3|||김세웅');
-- delete from pilsa_orders      where user_id in (select id from users where identity_key = '교구|화평|3|||김세웅');

-- 4-c. 계정 자체를 지움 — 4-a·4-b 를 **모두** 실행한 뒤에만.
--      ⚠️ 대부분의 표는 user_id가 text라 외래키가 없습니다. 즉 막아 주는 장치가 없고,
--         빠뜨린 표가 있으면 주인 없는 행으로 조용히 남습니다. 4-a·4-b를 먼저 하세요.
--         (passage_progress만 uuid 외래키라 on delete cascade로 함께 지워집니다)
-- delete from users where identity_key = '교구|화평|3|||김세웅';
