-- 사역팀 목록 시드 (2027) — tools/ministry-seed-sql.py 가 만든다. 손으로 고치지 말 것.
-- 자료: ministry/ministry_catalog_2027_draft.json
-- ⚠️ 개발 DB 에 먼저 실행한 뒤 운영에 올린다.

begin;

-- upsert — id 를 지키고(신청이 팀 id 를 가리킨다), 관리자가 채운 값도 지킨다
insert into public.ministry_catalog
  (year, committee, group_name, team, kind, schedule_note, desc_note, capacity_note, option_note, sort_order, day_sun, day_fri, day_sat, day_week, time_from, time_to, freq_weekly, freq_biweekly, freq_monthly, freq_adhoc)
values
  (2027, '교육위원회', '', '장학', 'apply', '', '', '', '', 0, false, false, false, false, null, null, false, false, false, false),
  (2027, '교육위원회', '', '교회학교전도', 'apply', '', '', '', '', 1, false, false, false, false, null, null, false, false, false, false),
  (2027, '교육위원회', '', '사랑부', 'apply', '', '', '', '', 2, false, false, false, false, null, null, false, false, false, false),
  (2027, '교육위원회', '사랑부·어와나', '퍼글', 'apply', '', '', '', '어와나 4개 중 하나만 신청', 3, false, false, false, false, null, null, false, false, false, false),
  (2027, '교육위원회', '사랑부·어와나', '커비', 'apply', '', '', '', '어와나 4개 중 하나만 신청', 4, false, false, false, false, null, null, false, false, false, false),
  (2027, '교육위원회', '사랑부·어와나', '스팍스/티엔티', 'apply', '', '', '', '어와나 4개 중 하나만 신청', 5, false, false, false, false, null, null, false, false, false, false),
  (2027, '교육위원회', '사랑부·어와나', '트랙/저니', 'apply', '', '', '', '어와나 4개 중 하나만 신청', 6, false, false, false, false, null, null, false, false, false, false),
  (2027, '교육위원회', '미취학', '영아부', 'apply', '', '', '', '', 7, false, false, false, false, null, null, false, false, false, false),
  (2027, '교육위원회', '미취학', '유아부', 'apply', '', '', '', '', 8, false, false, false, false, null, null, false, false, false, false),
  (2027, '교육위원회', '미취학', '유치부', 'apply', '', '', '', '', 9, false, false, false, false, null, null, false, false, false, false),
  (2027, '교육위원회', '미취학', '새싹부', 'apply', '', '', '', '', 10, false, false, false, false, null, null, false, false, false, false),
  (2027, '교육위원회', '아동', '유년부 1부', 'apply', '', '', '', '', 11, false, false, false, false, null, null, false, false, false, false),
  (2027, '교육위원회', '아동', '유년부 2부', 'apply', '', '', '', '', 12, false, false, false, false, null, null, false, false, false, false),
  (2027, '교육위원회', '아동', '소년부 1부', 'apply', '', '', '', '', 13, false, false, false, false, null, null, false, false, false, false),
  (2027, '교육위원회', '아동', '소년부 2부', 'apply', '', '', '', '', 14, false, false, false, false, null, null, false, false, false, false),
  (2027, '교육위원회', '청소년', '중등부', 'apply', '', '', '', '', 15, false, false, false, false, null, null, false, false, false, false),
  (2027, '교육위원회', '청소년', '고등부', 'apply', '', '', '', '', 16, false, false, false, false, null, null, false, false, false, false),
  (2027, '교육위원회', '장년', '은빛시니어학교', 'apply', '', '', '', '', 17, false, false, false, false, null, null, false, false, false, false),
  (2027, '교육위원회', '', '행정운영', 'appoint', '', '', '', '', 18, false, false, false, false, null, null, false, false, false, false),
  (2027, '교회봉사부', '', '오병이어 1팀', 'apply', '', '', '', '', 19, false, false, false, false, null, null, false, false, false, false),
  (2027, '교회봉사부', '', '오병이어 2팀', 'apply', '', '', '', '', 20, false, false, false, false, null, null, false, false, false, false),
  (2027, '교회봉사부', '', '카페운영', 'apply', '', '', '', '', 21, false, false, false, false, null, null, false, false, false, false),
  (2027, '교회봉사부', '', '상례', 'apply', '', '', '', '', 22, false, false, false, false, null, null, false, false, false, false),
  (2027, '교회봉사부', '', '새하늘찬양대', 'apply', '', '', '', '', 23, false, false, false, false, null, null, false, false, false, false),
  (2027, '문화스포츠부', '', '운영', 'apply', '', '', '', '', 24, false, false, false, false, null, null, false, false, false, false),
  (2027, '문화스포츠부', '', '문화선교', 'apply', '', '', '', '', 25, false, false, false, false, null, null, false, false, false, false),
  (2027, '문화스포츠부', '', '문화행사', 'apply', '', '', '', '', 26, false, false, false, false, null, null, false, false, false, false),
  (2027, '문화스포츠부', '', '꿈샘문화교실', 'apply', '', '', '', '', 27, false, false, false, false, null, null, false, false, false, false),
  (2027, '문화스포츠부', '', '동호회', 'apply', '', '', '', '', 28, false, false, false, false, null, null, false, false, false, false),
  (2027, '문화스포츠부', '', '스포츠', 'apply', '', '', '', '', 29, false, false, false, false, null, null, false, false, false, false),
  (2027, '방송전산부', '', '방송실 운영', 'apply', '', '', '', '', 30, false, false, false, false, null, null, false, false, false, false),
  (2027, '방송전산부', '', '전산', 'apply', '', '', '', '', 31, false, false, false, false, null, null, false, false, false, false),
  (2027, '방송전산부', '', '미디어홍보', 'apply', '', '', '', '', 32, false, false, false, false, null, null, false, false, false, false),
  (2027, '방송전산부', '', '새물결', 'apply', '', '', '', '', 33, false, false, false, false, null, null, false, false, false, false),
  (2027, '새가족부', '', '운영', 'apply', '', '', '', '', 34, false, false, false, false, null, null, false, false, false, false),
  (2027, '새가족부', '', '새가족영접', 'apply', '', '', '', '', 35, false, false, false, false, null, null, false, false, false, false),
  (2027, '새가족부', '', '새가족정착', 'apply', '', '', '', '', 36, false, false, false, false, null, null, false, false, false, false),
  (2027, '새가족부', '', '이단대응', 'apply', '', '', '', '', 37, false, false, false, false, null, null, false, false, false, false),
  (2027, '선교부', '', '국내선교', 'apply', '', '', '', '', 38, false, false, false, false, null, null, false, false, false, false),
  (2027, '선교부', '', '세계선교', 'apply', '', '', '', '', 39, false, false, false, false, null, null, false, false, false, false),
  (2027, '선교부', '', '다문화선교', 'apply', '', '', '', '', 40, false, false, false, false, null, null, false, false, false, false),
  (2027, '예배부', '', '운영', 'apply', '', '', '', '', 41, false, false, false, false, null, null, false, false, false, false),
  (2027, '예배부', '', '영접(웰컴)', 'apply', '', '', '', '', 42, false, false, false, false, null, null, false, false, false, false),
  (2027, '예배부', '', '출입문영접', 'apply', '', '', '', '', 43, false, false, false, false, null, null, false, false, false, false),
  (2027, '예배부', '', '본당영접', 'apply', '', '', '', '', 44, false, false, false, false, null, null, false, false, false, false),
  (2027, '예배부', '', '세례예식', 'apply', '', '', '', '', 45, false, false, false, false, null, null, false, false, false, false),
  (2027, '예배부', '', '성찬예식', 'appoint', '', '', '', '', 46, false, false, false, false, null, null, false, false, false, false),
  (2027, '예배부', '', '회계', 'appoint', '', '', '', '', 47, false, false, false, false, null, null, false, false, false, false),
  (2027, '제자양육부', '', '단계별 제자양육', 'apply', '', '', '', '', 48, false, false, false, false, null, null, false, false, false, false),
  (2027, '제자양육부', '', '마더와이즈', 'apply', '', '', '', '', 49, false, false, false, false, null, null, false, false, false, false),
  (2027, '제자양육부', '', '5060하프타임', 'apply', '', '', '', '', 50, false, false, false, false, null, null, false, false, false, false),
  (2027, '제자양육부', '', '신앙운동', 'apply', '', '', '', '', 51, false, false, false, false, null, null, false, false, false, false),
  (2027, '제자양육부', '', '학사관리', 'apply', '', '', '', '', 52, false, false, false, false, null, null, false, false, false, false),
  (2027, '전도부', '', '운영', 'apply', '', '', '', '', 53, false, false, false, false, null, null, false, false, false, false),
  (2027, '전도부', '', '행복전도대 - 금요일', 'apply', '', '', '', '', 54, false, false, false, false, null, null, false, false, false, false),
  (2027, '전도부', '', '행복전도대 - 토요일', 'apply', '', '', '', '', 55, false, false, false, false, null, null, false, false, false, false),
  (2027, '전도부', '', '전도학교', 'apply', '', '', '', '', 56, false, false, false, false, null, null, false, false, false, false),
  (2027, '전도부', '', '중보기도', 'apply', '', '', '', '', 57, false, false, false, false, null, null, false, false, false, false),
  (2027, '전도부', '', '중보기도학교', 'apply', '', '', '', '', 58, false, false, false, false, null, null, false, false, false, false),
  (2027, '전도부', '', '기도실운영', 'apply', '', '', '', '', 59, false, false, false, false, null, null, false, false, false, false),
  (2027, '차량부', '', '주차안내', 'apply', '', '', '', '', 60, false, false, false, false, null, null, false, false, false, false),
  (2027, '찬양부', '찬양대', '할렐루야찬양대', 'apply', '1부', '', '', '', 61, false, false, false, false, null, null, false, false, false, false),
  (2027, '찬양부', '찬양대', '임마누엘찬양대', 'apply', '2부', '', '', '', 62, false, false, false, false, null, null, false, false, false, false),
  (2027, '찬양부', '찬양대', '시온찬양대', 'apply', '3부', '', '', '', 63, false, false, false, false, null, null, false, false, false, false),
  (2027, '찬양부', '찬양대', '실로암찬양대', 'apply', '청년', '', '', '', 64, false, false, false, false, null, null, false, false, false, false),
  (2027, '찬양부', '찬양대', '가브리엘찬양대', 'apply', '오후', '', '', '', 65, false, false, false, false, null, null, false, false, false, false),
  (2027, '찬양부', '찬양팀', '2부 찬양팀', 'apply', '', '', '', '', 66, false, false, false, false, null, null, false, false, false, false),
  (2027, '찬양부', '찬양팀', '3부 찬양팀', 'apply', '', '', '', '', 67, false, false, false, false, null, null, false, false, false, false),
  (2027, '찬양부', '찬양팀', '오후 찬양팀', 'apply', '', '', '', '', 68, false, false, false, false, null, null, false, false, false, false),
  (2027, '찬양부', '찬양팀', '수요오전 찬양팀', 'apply', '', '', '', '', 69, false, false, false, false, null, null, false, false, false, false),
  (2027, '찬양부', '찬양팀', '수요오후 찬양팀', 'apply', '', '', '', '', 70, false, false, false, false, null, null, false, false, false, false),
  (2027, '찬양부', '찬양팀', '금요성령집회 찬양팀', 'apply', '', '', '', '', 71, false, false, false, false, null, null, false, false, false, false),
  (2027, '찬양부', '오케스트라', '베데스다', 'apply', '2부', '', '', '', 72, false, false, false, false, null, null, false, false, false, false),
  (2027, '찬양부', '오케스트라', '비파와수금', 'apply', '3부', '', '', '', 73, false, false, false, false, null, null, false, false, false, false),
  (2027, '찬양부', '', '중보기도팀', 'apply', '', '', '', '', 74, false, false, false, false, null, null, false, false, false, false),
  (2027, '희망의복지재단(사회봉사센터)', '', '봉사센터운영', 'apply', '', '', '', '', 75, false, false, false, false, null, null, false, false, false, false),
  (2027, '희망의복지재단(사회봉사센터)', '', '희망푸드뱅크', 'apply', '', '', '', '', 76, false, false, false, false, null, null, false, false, false, false),
  (2027, '희망의복지재단(사회봉사센터)', '', '사랑의봉사팀', 'apply', '', '', '', '', 77, false, false, false, false, null, null, false, false, false, false),
  (2027, '희망의복지재단(사회봉사센터)', '', '도서관책마을', 'apply', '', '', '', '', 78, false, false, false, false, null, null, false, false, false, false),
  (2027, '희망의복지재단(사회봉사센터)', '', '그루터기사역', 'apply', '', '', '', '', 79, false, false, false, false, null, null, false, false, false, false),
  (2027, 'L-12(목양부)', '', '운영', 'apply', '', '', '', '', 80, false, false, false, false, null, null, false, false, false, false),
  (2027, 'L-12(목양부)', '', '목양지원', 'apply', '', '', '', '', 81, false, false, false, false, null, null, false, false, false, false),
  (2027, 'L-12(목양부)', '', '정착관리', 'apply', '', '', '', '', 82, false, false, false, false, null, null, false, false, false, false),
  (2027, 'L-12(목양부)', '', '소그룹 리더교육', 'apply', '', '', '', '', 83, false, false, false, false, null, null, false, false, false, false),
  (2027, 'L-12(목양부)', '', '회계', 'appoint', '', '', '', '', 84, false, false, false, false, null, null, false, false, false, false),
  (2027, 'L-12(목양부)', '', '리더', 'appoint', '', '', '', '', 85, false, false, false, false, null, null, false, false, false, false),
  (2027, '총무부', '', '대외협력', 'apply', '', '', '', '', 86, false, false, false, false, null, null, false, false, false, false),
  (2027, '총무부', '', '역사홍보', 'apply', '', '', '', '', 87, false, false, false, false, null, null, false, false, false, false),
  (2027, '총무부', '', '경축부', 'apply', '', '', '', '', 88, false, false, false, false, null, null, false, false, false, false),
  (2027, '총무부', '', '상담실', 'appoint', '', '', '', '', 89, false, false, false, false, null, null, false, false, false, false),
  (2027, '시설부', '', '안전관리', 'apply', '', '', '', '', 90, false, false, false, false, null, null, false, false, false, false),
  (2027, '시설부', '', '시설관리', 'apply', '', '', '', '', 91, false, false, false, false, null, null, false, false, false, false),
  (2027, '시설부', '', '자재관리', 'apply', '', '', '', '', 92, false, false, false, false, null, null, false, false, false, false),
  (2027, '시설부', '', '데코', 'apply', '', '', '', '', 93, false, false, false, false, null, null, false, false, false, false)
on conflict (year, committee, group_name, team) do update set
  kind        = excluded.kind,
  option_note = excluded.option_note,
  sort_order  = excluded.sort_order,
  -- 시간·하는 일·필요 인원은 JSON 에 값이 있을 때만 덮는다(관리자 입력 보존)
  schedule_note = coalesce(nullif(excluded.schedule_note, ''), ministry_catalog.schedule_note),
  desc_note     = coalesce(nullif(excluded.desc_note, ''),     ministry_catalog.desc_note),
  capacity_note = coalesce(nullif(excluded.capacity_note, ''), ministry_catalog.capacity_note),
  -- 「② 언제」 칸들 — 부서가 하나라도 적었으면 한 벌로 바꾸고,
  -- 아무것도 안 적었으면 DB 에 있던 값을 그대로 둔다(안 적음 != 없음)
  day_sun       = case when (excluded.day_sun or excluded.day_fri or excluded.day_sat or excluded.day_week or excluded.time_from is not null or excluded.time_to is not null or excluded.freq_weekly or excluded.freq_biweekly or excluded.freq_monthly or excluded.freq_adhoc) then excluded.day_sun else ministry_catalog.day_sun end,
  day_fri       = case when (excluded.day_sun or excluded.day_fri or excluded.day_sat or excluded.day_week or excluded.time_from is not null or excluded.time_to is not null or excluded.freq_weekly or excluded.freq_biweekly or excluded.freq_monthly or excluded.freq_adhoc) then excluded.day_fri else ministry_catalog.day_fri end,
  day_sat       = case when (excluded.day_sun or excluded.day_fri or excluded.day_sat or excluded.day_week or excluded.time_from is not null or excluded.time_to is not null or excluded.freq_weekly or excluded.freq_biweekly or excluded.freq_monthly or excluded.freq_adhoc) then excluded.day_sat else ministry_catalog.day_sat end,
  day_week      = case when (excluded.day_sun or excluded.day_fri or excluded.day_sat or excluded.day_week or excluded.time_from is not null or excluded.time_to is not null or excluded.freq_weekly or excluded.freq_biweekly or excluded.freq_monthly or excluded.freq_adhoc) then excluded.day_week else ministry_catalog.day_week end,
  time_from     = case when (excluded.day_sun or excluded.day_fri or excluded.day_sat or excluded.day_week or excluded.time_from is not null or excluded.time_to is not null or excluded.freq_weekly or excluded.freq_biweekly or excluded.freq_monthly or excluded.freq_adhoc) then excluded.time_from else ministry_catalog.time_from end,
  time_to       = case when (excluded.day_sun or excluded.day_fri or excluded.day_sat or excluded.day_week or excluded.time_from is not null or excluded.time_to is not null or excluded.freq_weekly or excluded.freq_biweekly or excluded.freq_monthly or excluded.freq_adhoc) then excluded.time_to else ministry_catalog.time_to end,
  freq_weekly   = case when (excluded.day_sun or excluded.day_fri or excluded.day_sat or excluded.day_week or excluded.time_from is not null or excluded.time_to is not null or excluded.freq_weekly or excluded.freq_biweekly or excluded.freq_monthly or excluded.freq_adhoc) then excluded.freq_weekly else ministry_catalog.freq_weekly end,
  freq_biweekly = case when (excluded.day_sun or excluded.day_fri or excluded.day_sat or excluded.day_week or excluded.time_from is not null or excluded.time_to is not null or excluded.freq_weekly or excluded.freq_biweekly or excluded.freq_monthly or excluded.freq_adhoc) then excluded.freq_biweekly else ministry_catalog.freq_biweekly end,
  freq_monthly  = case when (excluded.day_sun or excluded.day_fri or excluded.day_sat or excluded.day_week or excluded.time_from is not null or excluded.time_to is not null or excluded.freq_weekly or excluded.freq_biweekly or excluded.freq_monthly or excluded.freq_adhoc) then excluded.freq_monthly else ministry_catalog.freq_monthly end,
  freq_adhoc    = case when (excluded.day_sun or excluded.day_fri or excluded.day_sat or excluded.day_week or excluded.time_from is not null or excluded.time_to is not null or excluded.freq_weekly or excluded.freq_biweekly or excluded.freq_monthly or excluded.freq_adhoc) then excluded.freq_adhoc else ministry_catalog.freq_adhoc end;

-- 목록에서 빠진 팀 치우기 — 단, 이미 신청이 걸린 팀은 두고 사람이 본다
delete from public.ministry_catalog c
 where c.year = 2027
   and (c.committee, c.group_name, c.team) not in (('교육위원회', '', '장학'), ('교육위원회', '', '교회학교전도'), ('교육위원회', '', '사랑부'), ('교육위원회', '사랑부·어와나', '퍼글'), ('교육위원회', '사랑부·어와나', '커비'), ('교육위원회', '사랑부·어와나', '스팍스/티엔티'), ('교육위원회', '사랑부·어와나', '트랙/저니'), ('교육위원회', '미취학', '영아부'), ('교육위원회', '미취학', '유아부'), ('교육위원회', '미취학', '유치부'), ('교육위원회', '미취학', '새싹부'), ('교육위원회', '아동', '유년부 1부'), ('교육위원회', '아동', '유년부 2부'), ('교육위원회', '아동', '소년부 1부'), ('교육위원회', '아동', '소년부 2부'), ('교육위원회', '청소년', '중등부'), ('교육위원회', '청소년', '고등부'), ('교육위원회', '장년', '은빛시니어학교'), ('교육위원회', '', '행정운영'), ('교회봉사부', '', '오병이어 1팀'), ('교회봉사부', '', '오병이어 2팀'), ('교회봉사부', '', '카페운영'), ('교회봉사부', '', '상례'), ('교회봉사부', '', '새하늘찬양대'), ('문화스포츠부', '', '운영'), ('문화스포츠부', '', '문화선교'), ('문화스포츠부', '', '문화행사'), ('문화스포츠부', '', '꿈샘문화교실'), ('문화스포츠부', '', '동호회'), ('문화스포츠부', '', '스포츠'), ('방송전산부', '', '방송실 운영'), ('방송전산부', '', '전산'), ('방송전산부', '', '미디어홍보'), ('방송전산부', '', '새물결'), ('새가족부', '', '운영'), ('새가족부', '', '새가족영접'), ('새가족부', '', '새가족정착'), ('새가족부', '', '이단대응'), ('선교부', '', '국내선교'), ('선교부', '', '세계선교'), ('선교부', '', '다문화선교'), ('예배부', '', '운영'), ('예배부', '', '영접(웰컴)'), ('예배부', '', '출입문영접'), ('예배부', '', '본당영접'), ('예배부', '', '세례예식'), ('예배부', '', '성찬예식'), ('예배부', '', '회계'), ('제자양육부', '', '단계별 제자양육'), ('제자양육부', '', '마더와이즈'), ('제자양육부', '', '5060하프타임'), ('제자양육부', '', '신앙운동'), ('제자양육부', '', '학사관리'), ('전도부', '', '운영'), ('전도부', '', '행복전도대 - 금요일'), ('전도부', '', '행복전도대 - 토요일'), ('전도부', '', '전도학교'), ('전도부', '', '중보기도'), ('전도부', '', '중보기도학교'), ('전도부', '', '기도실운영'), ('차량부', '', '주차안내'), ('찬양부', '찬양대', '할렐루야찬양대'), ('찬양부', '찬양대', '임마누엘찬양대'), ('찬양부', '찬양대', '시온찬양대'), ('찬양부', '찬양대', '실로암찬양대'), ('찬양부', '찬양대', '가브리엘찬양대'), ('찬양부', '찬양팀', '2부 찬양팀'), ('찬양부', '찬양팀', '3부 찬양팀'), ('찬양부', '찬양팀', '오후 찬양팀'), ('찬양부', '찬양팀', '수요오전 찬양팀'), ('찬양부', '찬양팀', '수요오후 찬양팀'), ('찬양부', '찬양팀', '금요성령집회 찬양팀'), ('찬양부', '오케스트라', '베데스다'), ('찬양부', '오케스트라', '비파와수금'), ('찬양부', '', '중보기도팀'), ('희망의복지재단(사회봉사센터)', '', '봉사센터운영'), ('희망의복지재단(사회봉사센터)', '', '희망푸드뱅크'), ('희망의복지재단(사회봉사센터)', '', '사랑의봉사팀'), ('희망의복지재단(사회봉사센터)', '', '도서관책마을'), ('희망의복지재단(사회봉사센터)', '', '그루터기사역'), ('L-12(목양부)', '', '운영'), ('L-12(목양부)', '', '목양지원'), ('L-12(목양부)', '', '정착관리'), ('L-12(목양부)', '', '소그룹 리더교육'), ('L-12(목양부)', '', '회계'), ('L-12(목양부)', '', '리더'), ('총무부', '', '대외협력'), ('총무부', '', '역사홍보'), ('총무부', '', '경축부'), ('총무부', '', '상담실'), ('시설부', '', '안전관리'), ('시설부', '', '시설관리'), ('시설부', '', '자재관리'), ('시설부', '', '데코'))
   and not exists (
     select 1 from public.ministry_orders o
      where o.year = c.year
        and o.team_id = c.id
   );

commit;

-- 확인
--   select count(*) from ministry_catalog where year = 2027;            -- 94 이어야 한다
--   select committee, count(*) from ministry_catalog where year = 2027 group by 1 order by 1;
