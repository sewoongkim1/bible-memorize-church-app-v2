-- 이벤트 플랫폼 — 화면용 짧은 이름 + 명단 공개 종료일
-- ⚠️ 이 저장소는 공개(public)입니다 — 비밀번호·키를 절대 넣지 마세요.
--
-- 적용: Supabase 대시보드 → SQL Editor에 붙여넣고 실행
-- ⚠️ **개발 DB(ktpwthwqzgcqcrmsafdo)에 먼저** 돌린 뒤 운영(xnomlgydifiqiybervtf).
-- ⚠️ 여러 번 돌려도 안전하다(add column if not exists).
--
-- ⚠️⚠️ **이 SQL 을 두 DB 에 먼저 돌린 뒤에야 코드를 커밋한다.**
--    새 코드가 이 칸들을 읽는데, 칸이 없으면 eventOpenList 가 통째로 실패하고
--    그러면 첫 화면 이벤트 단추가 죽는다. 그리고 이 저장소는 작업 트리를 여러
--    세션이 공유해서, **커밋하지 않아도 누가 배포하면 함께 나간다.**
--    (2026-09-10 psalm_frames 건이 정확히 그 사고였다.)
--
-- 설계: docs/superpowers/specs/2026-09-10-event-platform-design.html

alter table public.events
  -- 화면에 쓰는 짧은 이름. 비어 있으면 title 을 쓴다.
  --   title       "2026 썸머 써 바이블 완서자 등록"   ← 관리자 목록·명단 제목용(길어도 된다)
  --   short_title "썸머 써 바이블"                  ← 첫 화면 단추용(한 줄에 들어가야 한다)
  -- ⚠️ 첫 화면 단추는 **한 줄이 규칙**이다. 22자면 폰(390px)에서 두 줄로 넘어가고,
  --    글씨 크게 쓰시는 어르신 설정에서는 확실히 넘친다.
  add column if not exists short_title text not null default '',

  -- 명단을 언제까지 보여 줄 것인가(KST 날짜). **null 이면 기한 없음**(지금까지의 동작).
  -- ⚠️ closes_on 과 다른 것이다:
  --      closes_on  = 등록을 언제까지 받나   (지나면 등록만 막힌다)
  --      list_until = 명단을 언제까지 보이나 (지나면 성도님께 아예 안 보인다)
  --    마감 뒤에도 명단은 계속 보이는 것이 기본이다 — 옛 썸머 사이트가 마감되면
  --    조회까지 죽어 막다른 화면이 되던 것을 고친 자리라, 그 성질을 지운 게 아니라
  --    **끝나는 날을 정할 수 있게** 한 것이다.
  add column if not exists list_until date;

-- 확인:
-- select id, title, short_title, status, opens_on, closes_on, list_until from public.events;
--
-- 지금 있는 회차에 짧은 이름을 넣고 싶으면(예시 — 어드민 화면에서 해도 된다):
-- update public.events set short_title = '썸머 써 바이블' where id = 'summer-2026';
