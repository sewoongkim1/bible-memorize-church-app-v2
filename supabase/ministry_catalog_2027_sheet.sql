-- 2027 사역 목록 — 「사역소개(앱)」 시트 반영 (106팀) — tools/ministry-sheet-sql.py 가 만든다. 손으로 고치지 말 것.
-- 자료: 자료/사역신청/2027년사역신청(20271025).xlsx (친구 2026-10-25 「반영해 주세요」)
-- 실행 순서: 개발(ktpwthwqzgcqcrmsafdo) → 운영(xnomlgydifiqiybervtf). 반복해 돌려도 안전하다(신청은 건드리지 않는다).
-- ⚠️ 이 파일은 신청(ministry_orders)을 지우지 않는다 — 테스트 신청을 비우는 일은 이 파일 밖에서 따로 했다(2026-10-25 · 운영 7건).
-- 하는 일: ① 이름이 바뀌는 줄은 이름만 바꾼다(id·담당 한 줄·필요 인원·섬기는 분을 지킨다) ② 시트 106팀을 upsert(시간·하는 일·요일은 시트가 이긴다 — 단 담당자가 쓴 5팀의 하는 일·시간은 지킨다)
--          ③ 시트에 없는 팀은 신청이 없는 것만 지운다 ④ 「예시」 표시가 붙은 담당 한 줄(홍길동)을 비운다.
-- 되돌리는 법: 없음(옛 값은 운영 백업 JSON 이 PC 에 있다 — 저장소 밖).

begin;
set local lock_timeout = '5s';

-- ① 이름만 바뀌는 줄
update public.ministry_catalog set group_name = '어와나', team = '퍼플' where year = 2027 and committee = '교육위원회' and group_name = '사랑부·어와나' and team = '퍼글';
update public.ministry_catalog set group_name = '어와나', team = '커비' where year = 2027 and committee = '교육위원회' and group_name = '사랑부·어와나' and team = '커비';
update public.ministry_catalog set group_name = '어와나', team = '스팍스/티엔티' where year = 2027 and committee = '교육위원회' and group_name = '사랑부·어와나' and team = '스팍스/티엔티';
update public.ministry_catalog set group_name = '어와나', team = '트랙/저니' where year = 2027 and committee = '교육위원회' and group_name = '사랑부·어와나' and team = '트랙/저니';
update public.ministry_catalog set group_name = '', team = '방송실운영' where year = 2027 and committee = '방송전산부' and group_name = '' and team = '방송실 운영';
update public.ministry_catalog set group_name = '신앙운동', team = '신앙운동팀' where year = 2027 and committee = '제자양육부' and group_name = '' and team = '신앙운동';

-- ② 시트 반영
insert into public.ministry_catalog
  (year, committee, group_name, team, kind, schedule_note, desc_note, capacity_note, option_note, sort_order,
   day_sun, day_fri, day_sat, day_week, time_from, time_to, freq_weekly, freq_biweekly, freq_monthly, freq_adhoc)
values
  (2027, '감사위원회', '', '감사위원회', 'appoint', '', '교회 재정 및 회계의 전반적 감사', '', '', 0, false, false, false, false, null, null, false, false, false, false),
  (2027, '교육위원회', '사역팀', '운영', 'appoint', '', '교사훈련 및 행정지원', '', '', 1, false, false, false, false, null, null, false, false, false, false),
  (2027, '교육위원회', '사역팀', '장학', 'apply', '(주일) 오후 12:40', '장학헌금 계수 및 운영', '', '', 2, true, false, false, false, null, null, false, false, false, false),
  (2027, '교육위원회', '사역팀', '교회학교 전도', 'apply', '(수) 오후 12시-2:00', '교회학교 전도 및 훈련', '', '', 3, false, false, false, false, null, null, false, false, false, false),
  (2027, '교육위원회', '사역팀', '사랑부', 'apply', '(주일) 오전 11:00', '발달장애인을 위한 교사 제반활동', '', '', 4, true, false, false, false, null, null, false, false, false, false),
  (2027, '교육위원회', '어와나', '퍼플', 'apply', '(주일) 오후 2:00', '말씀훈련을 위한 어와나 교사 제반활동, 만 2~3세', '', '어와나 4개 중 하나만 신청', 5, true, false, false, false, null, null, false, false, false, false),
  (2027, '교육위원회', '어와나', '커비', 'apply', '(주일) 오후 2:00', '말씀훈련을 위한 어와나 교사 제반활동, 만 3~5세, 유치부', '', '어와나 4개 중 하나만 신청', 6, true, false, false, false, null, null, false, false, false, false),
  (2027, '교육위원회', '어와나', '스팍스/티엔티', 'apply', '(주일) 오후 2:00', '유치 후반~초등학교', '', '어와나 4개 중 하나만 신청', 7, true, false, false, false, null, null, false, false, false, false),
  (2027, '교육위원회', '어와나', '트랙/저니', 'apply', '(주일) 오후 2:00', '중등부/고등부', '', '어와나 4개 중 하나만 신청', 8, true, false, false, false, null, null, false, false, false, false),
  (2027, '교육위원회', '미취학', '영아부', 'apply', '(주일) 오전 11:00', '0-3세 교사 제반활동', '', '', 9, true, false, false, false, null, null, false, false, false, false),
  (2027, '교육위원회', '미취학', '유아부', 'apply', '(주일) 오전 11:00', '4-5세 교사 제반활동', '', '', 10, true, false, false, false, null, null, false, false, false, false),
  (2027, '교육위원회', '미취학', '유치부', 'apply', '(주일) 오전 11:00', '6-7세 교사 제반활동', '', '', 11, true, false, false, false, null, null, false, false, false, false),
  (2027, '교육위원회', '미취학', '새싹부', 'apply', '(주일) 오전 09:00', '0-7세 교사 제반활동', '', '', 12, true, false, false, false, null, null, false, false, false, false),
  (2027, '교육위원회', '아동', '유년부 1부', 'apply', '(주일) 오전 9:00', '1-3학년 교사 제반활동', '', '', 13, true, false, false, false, null, null, false, false, false, false),
  (2027, '교육위원회', '아동', '유년부 2부', 'apply', '(주일) 오전 11:00', '1-3학년 교사 제반활동', '', '', 14, true, false, false, false, null, null, false, false, false, false),
  (2027, '교육위원회', '아동', '소년부 1부', 'apply', '(주일) 오전 9:00', '4-6학년 교사 제반활동', '', '', 15, true, false, false, false, null, null, false, false, false, false),
  (2027, '교육위원회', '아동', '소년부 2부', 'apply', '(주일) 오전 11:00', '4-6학년 교사 제반활동', '', '', 16, true, false, false, false, null, null, false, false, false, false),
  (2027, '교육위원회', '청소년', '중등부', 'apply', '(주일) 오전 11:00', '중 1-3학년 교사 제반활동', '', '', 17, true, false, false, false, null, null, false, false, false, false),
  (2027, '교육위원회', '청소년', '고등부', 'apply', '(주일) 오전 10:40', '고 1-3학년 교사 제반활동', '', '', 18, true, false, false, false, null, null, false, false, false, false),
  (2027, '교육위원회', '청년', '청년공동체', 'apply', '(주일) 오후 1:00', '청년공동체 사역', '', '', 19, true, false, false, false, null, null, false, false, false, false),
  (2027, '교육위원회', '장년', '은빛시니어학교', 'apply', '3월~6월, 9월~11월 (목) 오전 10:00-오후 1:30', '65세 이상 교사 제반활동', '', '', 20, false, false, false, false, null, null, false, false, false, false),
  (2027, '교회봉사부', '', '오병이어 1팀', 'apply', '수시로', '주일과 평일, 특별행사시 교회식당 식사준비 및 봉사', '', '', 21, false, false, false, false, null, null, false, false, false, false),
  (2027, '교회봉사부', '', '오병이어 2팀', 'apply', '수시로', '설거지, 식당청소', '', '', 22, false, false, false, false, null, null, false, false, false, false),
  (2027, '교회봉사부', '', '카페운영', 'apply', '필요시', '카페운영에 관한 제반활동', '', '', 23, false, false, false, false, null, null, false, false, false, false),
  (2027, '교회봉사부', '', '상례', 'apply', '장례시', '교회장 시 발인예식 운구 및 하관 등 제반활동', '', '', 24, false, false, false, false, null, null, false, false, false, false),
  (2027, '교회봉사부', '', '새하늘찬양대', 'apply', '장례시', '교회장 시 발인예식 찬양대 사역 및 장지 동행', '', '', 25, false, false, false, false, null, null, false, false, false, false),
  (2027, '문화스포츠부', '', '운영', 'apply', '필요시', '문화스포츠부 운영 및 제반 활동', '', '', 26, false, false, false, false, null, null, false, false, false, false),
  (2027, '문화스포츠부', '', '문화선교', 'apply', '년 1~2회', '드라마(연극, 뮤지컬 등), 워십 공연', '', '', 27, false, false, false, false, null, null, false, false, false, false),
  (2027, '문화스포츠부', '', '문화행사', 'apply', '필요시', '각종 공연 및 전시회 진행', '', '', 28, false, false, false, false, null, null, false, false, false, false),
  (2027, '문화스포츠부', '', '꿈샘문화교실', 'apply', '년 4회', '문화강좌 진행 지원활동', '', '', 29, false, false, false, false, null, null, false, false, false, false),
  (2027, '문화스포츠부', '', '동호회', 'apply', '필요시', '교회 내 동호회 지원활동', '', '', 30, false, false, false, false, null, null, false, false, false, false),
  (2027, '문화스포츠부', '', '스포츠', 'apply', '필요시', '스포츠 행사 및 비전센터 운영에 관한 제반 활동', '', '', 31, false, false, false, false, null, null, false, false, false, false),
  (2027, '방송전산부', '', '방송실운영', 'apply', '예배시', '예배 및 행사 방송 담당', '', '', 32, false, false, false, false, null, null, false, false, false, false),
  (2027, '방송전산부', '', '전산', 'apply', '필요시', '교회전산 및 홈페이지 관리', '', '', 33, false, false, false, false, null, null, false, false, false, false),
  (2027, '방송전산부', '', '미디어홍보', 'apply', '필요시', '교회 대내외 영상 및 포스터 홍보', '', '', 34, false, false, false, false, null, null, false, false, false, false),
  (2027, '방송전산부', '', '새물결', 'apply', '필요시', '교회의 바른 신앙을 위한 캠페인 기획', '', '', 35, false, false, false, false, null, null, false, false, false, false),
  (2027, '새가족부', '', '운영', 'apply', '주일', '새가족·양육에 관한 전반 운영 및 지원', '', '', 36, true, false, false, false, null, null, false, false, false, false),
  (2027, '새가족부', '', '새가족영접', 'apply', '주일', '등록 새가족의 영접 및 본당안내', '', '', 37, true, false, false, false, null, null, false, false, false, false),
  (2027, '새가족부', '', '새가족정착', 'apply', '주일', '등록 새가족의 정착을 돕는 섬김이 사역', '', '', 38, true, false, false, false, null, null, false, false, false, false),
  (2027, '새가족부', '', '이단대응', 'apply', '수시로', '교회내 이단활동 경계 및 교육', '', '', 39, false, false, false, false, null, null, false, false, false, false),
  (2027, '선교부', '', '국내선교', 'apply', '필요시', '국내교회, 기관 후원 및 행정지원', '', '', 40, false, false, false, false, null, null, false, false, false, false),
  (2027, '선교부', '', '세계선교', 'apply', '필요시', '선교사지원, 선교헌금 계수 및 관리, 선교행사 준비', '', '', 41, false, false, false, false, null, null, false, false, false, false),
  (2027, '선교부', '', '다문화선교', 'apply', '필요시', '국내 거주 외국인 대상 선교 활동', '', '', 42, false, false, false, false, null, null, false, false, false, false),
  (2027, '시설부', '', '안전관리', 'apply', '수시로', '교인들의 예배보장 및 안전관리, 의료지원', '', '', 43, false, false, false, false, null, null, false, false, false, false),
  (2027, '시설부', '', '시설관리', 'apply', '수시로', '교회시설 관리', '', '', 44, false, false, false, false, null, null, false, false, false, false),
  (2027, '시설부', '', '자재관리', 'apply', '수시로', '교회자재 관리', '', '', 45, false, false, false, false, null, null, false, false, false, false),
  (2027, '시설부', '', '가든팀', 'apply', '필요시', '강단 꽃꽂이 및 교회 내 장식 등 제반활동', '', '', 46, false, false, false, false, null, null, false, false, false, false),
  (2027, '예배부', '', '운영', 'apply', '주일', '예배 전반적인 행정지원', '', '', 47, true, false, false, false, null, null, false, false, false, false),
  (2027, '예배부', '', '영접(웰컴)', 'apply', '주일', '미등록 새가족의 예배 도움 및 등록 안내', '', '', 48, true, false, false, false, null, null, false, false, false, false),
  (2027, '예배부', '', '출입문영접', 'apply', '주일', '주일2-3부, 오후찬양예배 현관 안내', '', '', 49, true, false, false, false, null, null, false, false, false, false),
  (2027, '예배부', '', '본당영접', 'apply', '주일', '주일2-3부, 오후찬양예배 본당 안내', '', '', 50, true, false, false, false, null, null, false, false, false, false),
  (2027, '예배부', '', '성찬예식', 'appoint', '', '성찬식 준비', '', '', 51, false, false, false, false, null, null, false, false, false, false),
  (2027, '예배부', '', '세례예식', 'apply', '년 2~3회', '유아세례 및 세례자 교육 도우미', '', '', 52, false, false, false, false, null, null, false, false, false, false),
  (2027, '재정부', '', '회계', 'appoint', '', '재정 관리', '', '', 53, false, false, false, false, null, null, false, false, false, false),
  (2027, '재정부', '', '계수', 'appoint', '', '헌금 계수', '', '', 54, false, false, false, false, null, null, false, false, false, false),
  (2027, '재정부', '', '재무', 'appoint', '', '효율적인 재정집행관리', '', '', 55, false, false, false, false, null, null, false, false, false, false),
  (2027, '재정부', '', '전도기금운영', 'appoint', '', '전도기금 재정집행관리', '', '', 56, false, false, false, false, null, null, false, false, false, false),
  (2027, '전도부', '', '운영', 'apply', '수시로', '전도부 전반운영 및 지원', '', '', 57, false, false, false, false, null, null, false, false, false, false),
  (2027, '전도부', '', '행복전도대', 'apply', '(금) 오후 1시 20분, (토) 오전 11시', '주중 전도 활동', '', '', 58, false, false, false, false, null, null, false, false, false, false),
  (2027, '전도부', '', '전도학교', 'apply', '년 1회(하반기)', '전도학교 운영 및 제반 활동', '', '', 59, false, false, false, false, null, null, false, false, false, false),
  (2027, '전도부', '', '중보기도', 'apply', '수시로 (중보기도학교 수료자만)', '교회를 위한 전반적인 기도, 목회자와 환우기도지원', '', '', 60, false, false, false, false, null, null, false, false, false, false),
  (2027, '전도부', '', '중보기도학교', 'apply', '년 1회(하반기)', '중보 기도자 양성을 위한 준비', '', '', 61, false, false, false, false, null, null, false, false, false, false),
  (2027, '전도부', '', '기도실 운영', 'apply', '(평일) 오전 9시-오후 5시 중 원하는 시간 2시간', '주중 기도실 운영', '', '', 62, false, false, false, false, null, null, false, false, false, false),
  (2027, '제자양육부', '단계별 제자양육', '부르심반(1단계)', 'apply', '주일 오전 10:10, 오후 12:10', '기초 양육프로그램 지원', '', '', 63, true, false, false, false, null, null, false, false, false, false),
  (2027, '제자양육부', '단계별 제자양육', '동행반(2단계)', 'apply', '주일 오전, 오후(27년 시작)', '심화 양육프로그램 지원', '', '', 64, true, false, false, false, null, null, false, false, false, false),
  (2027, '제자양육부', '단계별 제자양육', '사명반(3단계)', 'apply', '주일 오전, 오후(28년 시작)', '사역 프로그램 소개, 연결 지원', '', '', 65, true, false, false, false, null, null, false, false, false, false),
  (2027, '제자양육부', '단계별 제자양육', '5060하프타임', 'apply', '봄/가을 각각 4주간(목) 오후 7:30-9시', '스태프로 참여하는 사역(행사도우미)', '', '', 66, false, false, false, false, null, null, false, false, false, false),
  (2027, '제자양육부', '단계별 제자양육', '마더와이즈', 'apply', '봄/가을 각각 8주간(토) 오전 10-12시', '조장 및 스태프(프로그램 기 이수자)', '', '', 67, false, false, false, false, null, null, false, false, false, false),
  (2027, '제자양육부', '신앙운동', '신앙운동팀', 'apply', '수시로', '성경통독, 연중 신앙운동 및 기획 및 진행', '', '', 68, false, false, false, false, null, null, false, false, false, false),
  (2027, '제자양육부', '학사관리(운영)', '학사관리팀', 'apply', '수시로', '제자양육부 사역 행정, 기획 및 진행 / 제자양육 학사 통합 관리', '', '', 69, false, false, false, false, null, null, false, false, false, false),
  (2027, '찬양부', '', '운영', 'appoint', '', '찬양대 운영 관련 제반 활동', '', '', 70, false, false, false, false, null, null, false, false, false, false),
  (2027, '찬양부', '', '할렐루야 찬양대', 'apply', '(주일) 오전 7:00', '주일 1부 예배 찬양대 사역', '', '', 71, true, false, false, false, null, null, false, false, false, false),
  (2027, '찬양부', '', '임마누엘 찬양대', 'apply', '(주일) 오전 9:00', '주일 2부 예배 찬양대 사역', '', '', 72, true, false, false, false, null, null, false, false, false, false),
  (2027, '찬양부', '', '시온 찬양대', 'apply', '(주일) 오전 11:00', '주일 3부 예배 찬양대 사역', '', '', 73, true, false, false, false, null, null, false, false, false, false),
  (2027, '찬양부', '', '실로암 찬양대', 'apply', '(주일) 오후 1:00', '청년 예배 찬양대 사역', '', '', 74, true, false, false, false, null, null, false, false, false, false),
  (2027, '찬양부', '', '가브리엘 찬양대', 'apply', '(주일) 오후 3:00', '주일 찬양예배 찬양대 사역', '', '', 75, true, false, false, false, null, null, false, false, false, false),
  (2027, '찬양부', '', '베데스다', 'apply', '(주일) 오전 9:00', '주일 2부 예배 관현악기로 예배 섬김', '', '', 76, true, false, false, false, null, null, false, false, false, false),
  (2027, '찬양부', '', '비파와 수금', 'apply', '(주일) 오전 11:00', '주일 3부 예배 관현악기로 예배 섬김', '', '', 77, true, false, false, false, null, null, false, false, false, false),
  (2027, '찬양부', '', '주일예배찬양', 'apply', '주일 각 예배 시', '주일 2부, 3부 예배, 오후찬양 예배 찬양팀 사역', '', '', 78, true, false, false, false, null, null, false, false, false, false),
  (2027, '찬양부', '', '수요기도회찬양', 'apply', '(수) 오전 10:00, 오후 7:30', '수요 오전, 오후 기도회 찬양팀 사역', '', '', 79, false, false, false, false, null, null, false, false, false, false),
  (2027, '찬양부', '', '금요성령집회찬양', 'apply', '(금) 오후 8:30', '금요성령집회 찬양팀 사역', '', '', 80, false, false, false, false, null, null, false, false, false, false),
  (2027, '찬양부', '', '중보기도팀', 'apply', '각 예배 시', '예배찬양사역을 위한 중보기도', '', '', 81, false, false, false, false, null, null, false, false, false, false),
  (2027, '총무부', '', '대외협력', 'apply', '수시로', '대외관계담당 및 외부강사, 방문객 영접안내', '', '', 82, false, false, false, false, null, null, false, false, false, false),
  (2027, '총무부', '', '상담실', 'appoint', '', '상담실운영', '', '', 83, false, false, false, false, null, null, false, false, false, false),
  (2027, '총무부', '', '역사홍보', 'apply', '년 4회', '우물가 취재 및 편집, 교회문서 제작 및 발송사역', '', '', 84, false, false, false, false, null, null, false, false, false, false),
  (2027, '총무부', '', '경축팀', 'apply', '필요시', '교회내 결혼식 봉사', '', '', 85, false, false, false, false, null, null, false, false, false, false),
  (2027, '총무부', '', '그레이스팀', 'apply', '수시로', '', '', '', 86, false, false, false, false, null, null, false, false, false, false),
  (2027, '희망의복지재단', '복지재단', '희망주야간보호센터', 'appoint', '', '고척동 일대 노인성 질환자를 위한 자원 봉사', '', '', 87, false, false, false, false, null, null, false, false, false, false),
  (2027, '희망의복지재단', '복지재단', '고척어린이집', 'appoint', '', '고척어린이집 지원봉사', '', '', 88, false, false, false, false, null, null, false, false, false, false),
  (2027, '희망의복지재단', '복지재단', '고척 재미난 지역아동센터', 'appoint', '', '고척 재미난 지역아동센터 제반활동', '', '', 89, false, false, false, false, null, null, false, false, false, false),
  (2027, '희망의복지재단', '사회봉사센터', '봉사센터운영', 'apply', '수시로', '행정, 후원, 천사운동 및 봉사센터 지원', '', '', 90, false, false, false, false, null, null, false, false, false, false),
  (2027, '희망의복지재단', '사회봉사센터', '희망푸드뱅크', 'apply', '오후 3시~4시 30분,오후 1시 40분~3시 10분', '반찬 포장(화요일, 목요일 택일)<br>음식 수거 및 운반 봉사(화요일, 목요일)', '', '', 91, false, false, false, false, null, null, false, false, false, false),
  (2027, '희망의복지재단', '사회봉사센터', '사랑의봉사팀', 'apply', '매주 화요일 4시~5시', '독거노인, 장애인 반찬 전달 및 결연후원관리', '', '', 92, false, false, false, false, null, null, false, false, false, false),
  (2027, '희망의복지재단', '사회봉사센터', '도서관 책마을', 'apply', '주 1회 3시간', '교회 도서관 대출 및 운영', '', '', 93, false, false, false, false, null, null, false, false, false, false),
  (2027, '희망의복지재단', '사회봉사센터', '그루터기사역', 'apply', '4월~12월 격주 토요일 오전 10시~오후 2시', '초등학생 토요체험학교 프로그램 기획 및 운영', '', '', 94, false, false, false, false, null, null, false, false, false, false),
  (2027, 'L-12부', '', '운영', 'apply', '수시로', '목장 소그룹 운영 및 지원', '', '', 95, false, false, false, false, null, null, false, false, false, false),
  (2027, 'L-12부', '', '목양지원(교구)', 'apply', '헌금봉투-월 오전, 주보-금 오후', '결석자 명단 파악 및 우편 발송, 헌금봉투 및 주보', '', '', 96, false, false, false, false, null, null, false, false, false, false),
  (2027, 'L-12부', '', '정착관리', 'apply', '수시로', '등록한 새가족의 정착현황 파악 교구 지원', '', '', 97, false, false, false, false, null, null, false, false, false, false),
  (2027, 'L-12부', '', '목장리더', 'appoint', '', '교구 소그룹 리더 사역', '', '', 98, false, false, false, false, null, null, false, false, false, false),
  (2027, 'L-12부', '', '소그룹 리더교육', 'apply', '상/하반기 각각 10주간', '소그룹 지원', '', '', 99, false, false, false, false, null, null, false, false, false, false),
  (2027, 'M-12부', '', '운영', 'appoint', '', '연간 프로그램 기획 및 진행, 로스팀 운영', '', '', 100, false, false, false, false, null, null, false, false, false, false),
  (2027, 'M-12부', '', '행정', 'appoint', '', '멤버관리 및 새가족 배정', '', '', 101, false, false, false, false, null, null, false, false, false, false),
  (2027, 'M-12부', '', '양육', 'appoint', '', '신입멤버 및 훈련자 관리, 양육지원', '', '', 102, false, false, false, false, null, null, false, false, false, false),
  (2027, 'M-12부', '', '지원', 'appoint', '', 'M-12 선교헌금 관리 및 협력 선교사 지원', '', '', 103, false, false, false, false, null, null, false, false, false, false),
  (2027, 'M-12부', '', '리더', 'appoint', '', '남성 소그룹 리더 사역', '', '', 104, false, false, false, false, null, null, false, false, false, false),
  (2027, 'M-12부', '', '주차안내', 'apply', '주일 및 필요시', '주일예배 및 특별행사 시 주차봉사사역', '', '', 105, true, false, false, false, null, null, false, false, false, false)
on conflict (year, committee, group_name, team) do update set
  kind = excluded.kind, option_note = excluded.option_note, sort_order = excluded.sort_order,
  -- 담당자가 화면에서 쓴 5팀은 하는 일·시간을 지킨다(시트가 더 짧다)
  schedule_note = case when (ministry_catalog.committee, ministry_catalog.group_name, ministry_catalog.team) in (('방송전산부', '', '방송실운영'), ('새가족부', '', '운영'), ('새가족부', '', '새가족영접'), ('새가족부', '', '새가족정착'), ('새가족부', '', '이단대응')) then ministry_catalog.schedule_note else excluded.schedule_note end,
  desc_note     = case when (ministry_catalog.committee, ministry_catalog.group_name, ministry_catalog.team) in (('방송전산부', '', '방송실운영'), ('새가족부', '', '운영'), ('새가족부', '', '새가족영접'), ('새가족부', '', '새가족정착'), ('새가족부', '', '이단대응')) then ministry_catalog.desc_note else excluded.desc_note end,
  -- 요일·시각·횟수는 시트가 정한다(시트에는 주일만 있다 — 전에 있던 예시 값은 여기서 지워진다)
  day_sun = excluded.day_sun, day_fri = false, day_sat = false, day_week = false, time_from = null, time_to = null,
  freq_weekly = false, freq_biweekly = false, freq_monthly = false, freq_adhoc = false;

-- ③ 시트에 없는 팀 — 신청이 걸린 팀은 둔다
delete from public.ministry_catalog c
 where c.year = 2027
   and (c.committee, c.group_name, c.team) not in (('감사위원회', '', '감사위원회'), ('교육위원회', '사역팀', '운영'), ('교육위원회', '사역팀', '장학'), ('교육위원회', '사역팀', '교회학교 전도'), ('교육위원회', '사역팀', '사랑부'), ('교육위원회', '어와나', '퍼플'), ('교육위원회', '어와나', '커비'), ('교육위원회', '어와나', '스팍스/티엔티'), ('교육위원회', '어와나', '트랙/저니'), ('교육위원회', '미취학', '영아부'), ('교육위원회', '미취학', '유아부'), ('교육위원회', '미취학', '유치부'), ('교육위원회', '미취학', '새싹부'), ('교육위원회', '아동', '유년부 1부'), ('교육위원회', '아동', '유년부 2부'), ('교육위원회', '아동', '소년부 1부'), ('교육위원회', '아동', '소년부 2부'), ('교육위원회', '청소년', '중등부'), ('교육위원회', '청소년', '고등부'), ('교육위원회', '청년', '청년공동체'), ('교육위원회', '장년', '은빛시니어학교'), ('교회봉사부', '', '오병이어 1팀'), ('교회봉사부', '', '오병이어 2팀'), ('교회봉사부', '', '카페운영'), ('교회봉사부', '', '상례'), ('교회봉사부', '', '새하늘찬양대'), ('문화스포츠부', '', '운영'), ('문화스포츠부', '', '문화선교'), ('문화스포츠부', '', '문화행사'), ('문화스포츠부', '', '꿈샘문화교실'), ('문화스포츠부', '', '동호회'), ('문화스포츠부', '', '스포츠'), ('방송전산부', '', '방송실운영'), ('방송전산부', '', '전산'), ('방송전산부', '', '미디어홍보'), ('방송전산부', '', '새물결'), ('새가족부', '', '운영'), ('새가족부', '', '새가족영접'), ('새가족부', '', '새가족정착'), ('새가족부', '', '이단대응'), ('선교부', '', '국내선교'), ('선교부', '', '세계선교'), ('선교부', '', '다문화선교'), ('시설부', '', '안전관리'), ('시설부', '', '시설관리'), ('시설부', '', '자재관리'), ('시설부', '', '가든팀'), ('예배부', '', '운영'), ('예배부', '', '영접(웰컴)'), ('예배부', '', '출입문영접'), ('예배부', '', '본당영접'), ('예배부', '', '성찬예식'), ('예배부', '', '세례예식'), ('재정부', '', '회계'), ('재정부', '', '계수'), ('재정부', '', '재무'), ('재정부', '', '전도기금운영'), ('전도부', '', '운영'), ('전도부', '', '행복전도대'), ('전도부', '', '전도학교'), ('전도부', '', '중보기도'), ('전도부', '', '중보기도학교'), ('전도부', '', '기도실 운영'), ('제자양육부', '단계별 제자양육', '부르심반(1단계)'), ('제자양육부', '단계별 제자양육', '동행반(2단계)'), ('제자양육부', '단계별 제자양육', '사명반(3단계)'), ('제자양육부', '단계별 제자양육', '5060하프타임'), ('제자양육부', '단계별 제자양육', '마더와이즈'), ('제자양육부', '신앙운동', '신앙운동팀'), ('제자양육부', '학사관리(운영)', '학사관리팀'), ('찬양부', '', '운영'), ('찬양부', '', '할렐루야 찬양대'), ('찬양부', '', '임마누엘 찬양대'), ('찬양부', '', '시온 찬양대'), ('찬양부', '', '실로암 찬양대'), ('찬양부', '', '가브리엘 찬양대'), ('찬양부', '', '베데스다'), ('찬양부', '', '비파와 수금'), ('찬양부', '', '주일예배찬양'), ('찬양부', '', '수요기도회찬양'), ('찬양부', '', '금요성령집회찬양'), ('찬양부', '', '중보기도팀'), ('총무부', '', '대외협력'), ('총무부', '', '상담실'), ('총무부', '', '역사홍보'), ('총무부', '', '경축팀'), ('총무부', '', '그레이스팀'), ('희망의복지재단', '복지재단', '희망주야간보호센터'), ('희망의복지재단', '복지재단', '고척어린이집'), ('희망의복지재단', '복지재단', '고척 재미난 지역아동센터'), ('희망의복지재단', '사회봉사센터', '봉사센터운영'), ('희망의복지재단', '사회봉사센터', '희망푸드뱅크'), ('희망의복지재단', '사회봉사센터', '사랑의봉사팀'), ('희망의복지재단', '사회봉사센터', '도서관 책마을'), ('희망의복지재단', '사회봉사센터', '그루터기사역'), ('L-12부', '', '운영'), ('L-12부', '', '목양지원(교구)'), ('L-12부', '', '정착관리'), ('L-12부', '', '목장리더'), ('L-12부', '', '소그룹 리더교육'), ('M-12부', '', '운영'), ('M-12부', '', '행정'), ('M-12부', '', '양육'), ('M-12부', '', '지원'), ('M-12부', '', '리더'), ('M-12부', '', '주차안내'))
   and not exists (select 1 from public.ministry_orders o where o.year = c.year and o.team_id = c.id);

-- ④ 예시 담당 한 줄(「홍길동 …  · 예시」) 비우기 — 실제로 쓴 담당 한 줄은 그대로
update public.ministry_catalog set leader_note = '' where year = 2027 and leader_note like '%예시%';

commit;

-- 확인
--   select count(*) from ministry_catalog where year = 2027;   -- 106 이어야 한다(신청이 걸린 옛 팀이 남아 있으면 그만큼 더)
--   select kind, count(*) from ministry_catalog where year = 2027 group by 1;   -- appoint 18
--   select count(*) from ministry_catalog where year = 2027 and day_sun;   -- 36
