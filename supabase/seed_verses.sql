-- ============================================================
-- verses 시드 (verses.json → DB). 재실행 안전(ON CONFLICT).
-- 표시용 상세필드(refShort/hintText/pastor)는 클라이언트 verses.json 사용.
-- DB verses 는 FK 무결성 + 관리자 통계용(no/ref/text/설교).
-- ============================================================
insert into public.verses (no, week, ref, text, sermon_title, sermon_url) values
(1, 1, '시편 119편 105절', '주의 말씀은 내 발에 등이요 내 길에 빛이니이다', '오직 성경, 말씀이 답이다!', 'https://www.youtube.com/watch?v=fEKH6MCOhtU&list=PLmW-GwY4IF3yRWzP8gEPtAUvKqNeVstCf&index=32'),
(2, 2, '창세기 12장 2절', '내가 네 이름을 창대하게 하리니 너는 복이 될지라', '새해 복이 되세요', 'https://www.youtube.com/watch?v=clBpqFk4mMk&list=PLmW-GwY4IF3yRWzP8gEPtAUvKqNeVstCf&index=25'),
(3, 3, '여호수아 1장 8절', '이 율법책을 네 입에서 떠나지 말게하며 다 지켜 행하라 그리하면 네가 형통하리라', '이 율법책을 떠나지 말게 하라', 'https://www.youtube.com/watch?v=qUewsTFzdzg&list=PLmW-GwY4IF3yRWzP8gEPtAUvKqNeVstCf&index=23'),
(4, 4, '출애굽기 13장 22절', '낮에는 구름기둥, 밤에는 불기둥이 백성 앞에서 떠나지 아니하리라', '믿고 가는 길', 'https://www.youtube.com/watch?v=ZLE3C8GZvQI&list=PLmW-GwY4IF3yRWzP8gEPtAUvKqNeVstCf&index=22'),
(5, 5, '레위기 20장 26절', '내가 또 너희를 나의 소유로 삼으려고 너희를 만민 중에서 구별하였음이니라', '거룩하게 삽시다', 'https://www.youtube.com/watch?v=4vQWVvj7970&list=PLmW-GwY4IF3yRWzP8gEPtAUvKqNeVstCf&index=21'),
(6, 6, '사도행전 16장 31절', '주 예수를 믿으라 그리하면 너와 네집이 구원을 받으리라', '주 예수를 믿으라', 'https://www.youtube.com/watch?v=O6NmpvcYyD8&list=PLmW-GwY4IF3y3e8moiN6bS-AwhAzzwyya&index=36'),
(7, 7, '사도행전 16장 14절', '주께서 그 마음을 열어 바울의 말을 따르게 하신지라', '마음을 여시는 하나님', 'https://www.youtube.com/watch?v=8fn81TLFXG8&list=PLmW-GwY4IF3yRWzP8gEPtAUvKqNeVstCf&index=20'),
(8, 8, '누가복음 4장 8절', '주 너의 하나님께 경배하고 다만 그를 섬가라', '광야의 세 가지 질문', 'https://www.youtube.com/watch?v=vRQzw_vTYxw&list=PLmW-GwY4IF3yRWzP8gEPtAUvKqNeVstCf&index=19'),
(9, 9, '신명기 8장 6절', '네 하나님 여호와의 명령을 지켜 그의 길을 따라가며 그를 경외할지라', '기억하고 선포하고 순종하라', 'https://www.youtube.com/watch?v=WZLKQa_cSdI&list=PLmW-GwY4IF3yRWzP8gEPtAUvKqNeVstCf&index=18'),
(10, 10, '마가복음 12장 17절', '가이사의 것은 가이사에게, 하나님의 것은 하나님께 바치라', '아름다운 엉망진창', 'https://www.youtube.com/watch?v=enbDbanMMmc&list=PLmW-GwY4IF3yRWzP8gEPtAUvKqNeVstCf&index=17'),
(11, 11, '사사기 8장 23절', '내가 너희를 다스리지 아니하겠고 여호와께서 너희를 다스리시리라', '1도의 위험', 'https://www.youtube.com/watch?v=mMnK13pKrWU&list=PLmW-GwY4IF3yRWzP8gEPtAUvKqNeVstCf&index=16'),
(12, 12, '베드로전서 4장 16절', '만일 그리스도인으로 고난을 받으면 그 이름으로 하나님께 영광을 돌리라', '그리스도인이란', 'https://www.youtube.com/watch?v=YFtktRjB_bw&list=PLmW-GwY4IF3yRWzP8gEPtAUvKqNeVstCf&index=15'),
(13, 13, '마가복음 11장 3절', '주가 쓰시겠다 하라 그리하면 즉시 이리로 보내리라', '주가 쓰시겠다 하라', 'https://www.youtube.com/watch?v=jg50nRA68vc&list=PLmW-GwY4IF3yRWzP8gEPtAUvKqNeVstCf&index=14'),
(14, 14, '마가복음 16장 6절', '너희가 십자가에 못 박히신 나사렛 예수를 찾는구나 그가 살아나셨고 여기 계시지 아니하니라', '빈 손, 빈 무덤', 'https://www.youtube.com/watch?v=_IGCmd3z_tQ&list=PLmW-GwY4IF3yRWzP8gEPtAUvKqNeVstCf&index=12'),
(15, 15, '민수기 14장 24절', '그러나 내 종 갈렙은 그 마음이 그들과 달라서 나를 온전히 따랐은즉 … 그의 자손이 그 땅을 차지하리라', '갈렙처럼 보고 먹고 따르라', 'https://www.youtube.com/watch?v=njrok9CiqBE&list=PLmW-GwY4IF3yRWzP8gEPtAUvKqNeVstCf&index=10'),
(16, 16, '사무엘상 26장 24절', '오늘 왕의 생명을 내가 중히 여긴 것 같이 내 생명을 여호와께서 중히 여기셔서 모든 환란에서 나를 구하여 내시기를 바라나이다', '으른입니까, 어른입니까?', 'https://www.youtube.com/watch?v=JfGTRQE7uNY&list=PLmW-GwY4IF3yRWzP8gEPtAUvKqNeVstCf&index=9'),
(17, 17, '잠언 4장 6절', '지혜를 버리지 말라 그가 너를 보호하리라 그를 사랑하라 그가 너를 지키리라', '예수님을 대하는 법', 'https://www.youtube.com/watch?v=zw6P2oNxrSE&list=PLmW-GwY4IF3yRWzP8gEPtAUvKqNeVstCf&index=8'),
(18, 18, '역대상 22장 12절', '여호와께서 네게 지혜와 총명을 주사… 네 하나님 여호와의 율법을 지키게 하시기를 더욱 원하로라', '다윗처럼 축복합니다', 'https://www.youtube.com/watch?v=ekyFC04potg&list=PLmW-GwY4IF3yRWzP8gEPtAUvKqNeVstCf&index=7'),
(19, 19, '누가복음 1장 28절', '은혜를 받은 자여 평안할지어다 주께서 너와 함께하시도다', '은혜를 받은 자여', 'https://www.youtube.com/watch?v=yKGONbd_7Rg&list=PLmW-GwY4IF3yRWzP8gEPtAUvKqNeVstCf&index=6'),
(20, 20, '시편 3장 6절', '천만인이 나를 에워싸 진 친다 하여도 나를 두려워하지 아니하리이다', '천만인이 에워싸도 기도', 'https://www.youtube.com/watch?v=c686fX60fHg&list=PLmW-GwY4IF3yRWzP8gEPtAUvKqNeVstCf&index=5'),
(21, 21, '데살로니가전서 5장 16-18절', '항상 기뻐하라 쉬지 말고 기도하라 범사에 감사하라', '성령의 언어', 'https://www.youtube.com/watch?v=qdH4O1ocFes&list=PLmW-GwY4IF3yRWzP8gEPtAUvKqNeVstCf&index=4'),
(22, 22, '마태복음 28장 19절', '너희는 가서 모든 민족을 제자로 삼아 아버지와 아들과 성령의 이름으로 세례를 베풀고', '아버지와 아들과 성령의 이름 안으로', 'https://www.youtube.com/watch?v=7AyjSnmnbOc&list=PLmW-GwY4IF3yRWzP8gEPtAUvKqNeVstCf&index=3'),
(23, 23, '사도행전 16장 10절', '이는 하나님이 저 사람들에게 복음을 전하라고 우리를 부르신 줄로 인정함이러라', '건너와서 도우라', 'https://www.youtube.com/watch?v=5LJruOQx-4k&list=PLmW-GwY4IF3yRWzP8gEPtAUvKqNeVstCf&index=2'),
(24, 24, '시편 116편 1절', '여호와께서 내 음성과 내 간구를 들으시므로 내가 그를 사랑하는도다', '건너와서 도우시는 하나님', 'https://www.youtube.com/watch?v=-7OqMxRHOdM&list=PLmW-GwY4IF3yRWzP8gEPtAUvKqNeVstCf&index=1'),
(25, 25, '요한계시록 2장 7절', '이기는 그에게는 내가 하나님의 낙원에 있는 생명나무의 열매를 주어 먹게 하리라', '교회에 왔더니 예수만 보여요', 'https://www.youtube.com/watch?v=qY_mGiV6YrE&t=1492s'),
(26, 26, '디모데전서 1장 11절', '이 교훈은 내게 맡기신 바 복되신 하나님의 영광의 복음을 따름이니라', '유리 보석에 속지 마십시오', 'https://www.youtube.com/watch?v=KEDbbyZuM9g')
on conflict (no) do update set
  week = excluded.week,
  ref = excluded.ref,
  text = excluded.text,
  sermon_title = excluded.sermon_title,
  sermon_url = excluded.sermon_url;
