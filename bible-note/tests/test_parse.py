# -*- coding: utf-8 -*-
import os
import re
import sys
from collections import Counter

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import parse as parse_mod
from parse import parse_book, book_name_from_filename, load_book_file

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
BIBLE = os.path.join(ROOT, 'bible')
JUDE = os.path.join(BIBLE, '2-26유다서.txt')
JOHN = os.path.join(BIBLE, '2-04요한복음.txt')
PSALMS = os.path.join(BIBLE, '1-19시편.txt')
ROMANS = os.path.join(BIBLE, '2-06로마서.txt')


def _bible_files():
    if not os.path.isdir(BIBLE):
        return []
    return sorted(os.path.join(BIBLE, fn) for fn in os.listdir(BIBLE) if fn.endswith('.txt'))


# bible/ 은 .gitignore 로 저장소에서 뺀 폴더다(개역개정 저작권). 원문이 없는 PC 에서는
# 실제 파일을 읽는 테스트만 건너뛴다 — 가짜 문자열로 하는 나머지 테스트는 어디서든 돈다.
needs_bible = pytest.mark.skipif(
    not all(os.path.exists(p) for p in (JUDE, JOHN, PSALMS, ROMANS)),
    reason='bible/ 원문이 없는 PC(저장소에서 뺀 폴더)')
needs_all_bible = pytest.mark.skipif(
    len(_bible_files()) != 66,
    reason='bible/ 에 66권이 다 있는 PC 에서만')


def test_parse_simple_verse():
    # 절 dict 가 「조각」이 되었다(2026-09-22 Task 9) — 기존 키는 그대로, 새 키 다섯이 붙는다.
    text = "유1:1 예수 그리스도의 종이요 야고보의 형제인 유다는"
    verses = parse_book(text, '유다서')
    assert len(verses) == 1
    assert verses[0] == {
        'book': '유다서', 'chapter': 1, 'verse': 1,
        'subtitle': None, 'body': '예수 그리스도의 종이요 야고보의 형제인 유다는',
        'part': 0, 'verse_end': None, 'heading': None, 'label': '1',
        'chapter_start': True,
    }


def test_parse_verse_with_subtitle():
    text = "유1:1 <인사> 예수 그리스도의 종이요"
    verses = parse_book(text, '유다서')
    assert verses[0]['subtitle'] == '인사'
    assert verses[0]['body'] == '예수 그리스도의 종이요'


def test_parse_subtitle_with_nested_reference():
    # 소제목 안에 다른 책의 장:절 인용이 통째로 들어있는 경우(요한복음 1:19 실제 원문 그대로)
    text = "요1:19 <세례 요한의 증언(마 3:1-12; 막 1:7-8; 눅 3:15-17)> 유대인들이 예루살렘에서"
    verses = parse_book(text, '요한복음')
    assert verses[0]['subtitle'] == '세례 요한의 증언(마 3:1-12; 막 1:7-8; 눅 3:15-17)'
    assert verses[0]['body'] == '유대인들이 예루살렘에서'


def test_parse_filters_by_chapter():
    text = "요1:1 태초에\n요2:1 사흘째 되던 날"
    verses = parse_book(text, '요한복음', chapter=1)
    assert len(verses) == 1
    assert verses[0]['chapter'] == 1


def test_parse_keeps_all_chapters_when_chapter_is_none():
    text = "요1:1 태초에\n요2:1 사흘째 되던 날"
    verses = parse_book(text, '요한복음')
    assert len(verses) == 2


def test_parse_skips_blank_lines():
    text = "유1:1 예수 그리스도의\n\n유1:2 긍휼과 평강과"
    verses = parse_book(text, '유다서')
    assert len(verses) == 2
    assert [v['verse'] for v in verses] == [1, 2]


def test_book_name_from_filename():
    assert book_name_from_filename('bible/2-26유다서.txt') == '유다서'
    assert book_name_from_filename('2-04요한복음.txt') == '요한복음'
    assert book_name_from_filename('1-01창세기.txt') == '창세기'


def test_book_name_from_filename_rejects_bad_name():
    with pytest.raises(ValueError):
        book_name_from_filename('유다서.txt')


def test_parse_reads_continuation_line_in_requested_chapter():
    # 요한복음 5:9 는 원문에서 두 줄로 나뉘어 있다 — 뒷줄에 절 번호가 없다.
    # Task 1 에서는 멈췄다. 이제는(2026-09-22 성도님 결정 「방법 2」) 같은 절의 둘째 조각으로 읽는다
    # — 번호 칸은 비우고(label ''), 본문은 빠짐없이.
    text = "요5:9 그 사람이 곧 나아서 자리를 들고 걸어가니라\n요5:이 날은 안식일이니"
    pieces = parse_book(text, '요한복음', chapter=5)
    assert len(pieces) == 2
    first, second = pieces
    assert (first['verse'], first['part'], first['label']) == (9, 0, '9')
    assert (second['chapter'], second['verse'], second['part']) == (5, 9, 1)
    assert second['label'] == ''
    assert second['subtitle'] is None
    assert second['body'] == '이 날은 안식일이니'
    assert second['verse_end'] is None
    assert second['chapter_start'] is False


def test_parse_reads_continuation_line_without_chapter_filter():
    text = "요5:9 그 사람이 곧 나아서\n요5:이 날은 안식일이니"
    pieces = parse_book(text, '요한복음')
    assert [(p['verse'], p['part'], p['label']) for p in pieces] == [(9, 0, '9'), (9, 1, '')]
    assert pieces[1]['body'] == '이 날은 안식일이니'


def test_parse_continuation_with_subtitle_after_first_word():
    # ⚠️ 끊긴 줄의 소제목은 「첫 낱말 뒤」에 끼어 있다(원문은 `요12:1` 같은 첫 낱말 뒤에 <소제목>을
    # 둔다 — 끊긴 줄은 `요12:예수께서` 가 한 낱말). 뜻은 「소제목 → 예수께서 이 말씀을 하시고」다.
    text = ("요12:36 너희에게 아직 빛이 있을 동안에 빛을 믿으라\n"
            "요12:예수께서 <그들이 예수를 믿지 아니하다> 이 말씀을 하시고 그들을 떠나가서 숨으시니라")
    pieces = parse_book(text, '요한복음', chapter=12)
    second = pieces[1]
    assert (second['verse'], second['part'], second['label']) == (36, 1, '')
    assert second['subtitle'] == '그들이 예수를 믿지 아니하다'
    assert second['body'] == '예수께서 이 말씀을 하시고 그들을 떠나가서 숨으시니라'


def test_parse_continuation_subtitle_right_after_colon():
    # 2026-09-22 최종 검토 r5 Minor 2 — 끊긴 줄의 첫 낱말이 비고 콜론 바로 뒤에 소제목이 오면
    # `(\S*)` 가 `<소제목>` 을 첫 낱말로 삼아 꺾쇠째 본문에 찍었다. 첫 낱말은 `<` 를 먹지 않는다.
    text = "요5:9 그 사람이 곧 나아서\n요5:<소제목> 이 날은 안식일이니"
    second = parse_book(text, '요한복음')[1]
    assert (second['verse'], second['part'], second['label']) == (9, 1, '')
    assert second['subtitle'] == '소제목'
    assert second['body'] == '이 날은 안식일이니'


def test_parse_continuation_subtitle_with_spaces_right_after_colon():
    text = "요5:9 그 사람이 곧 나아서\n요5:<세례 요한의 증언> 이 날은"
    second = parse_book(text, '요한복음')[1]
    assert second['subtitle'] == '세례 요한의 증언'
    assert second['body'] == '이 날은'


@pytest.mark.parametrize('text, lineno', [
    ("요5:8 <소제목 가나다", 1),                       # 보통 절 — 닫히지 않은 소제목
    ("요5:8 가나 > 다", 1),                            # 보통 절 — 본문에 떨어진 꺾쇠
    ("요5:8 <가<나> 다", 1),                           # 소제목 안에 또 여는 꺾쇠
    ("롬9:1-2 <약속의 자녀 내가", 1),                  # 합쳐진 절 — 닫히지 않은 소제목
    ("요5:9 가\n요5:나<다", 2),                        # 끊긴 줄 — 첫 낱말에 붙은 꺾쇠
    ("요5:9 가\n요5:<소제목 이 날은", 2),              # 끊긴 줄 — 닫히지 않은 소제목
    ("요5:9 가\n요5:나 >다", 2),                       # 끊긴 줄 — 본문에 떨어진 꺾쇠
])
def test_parse_stops_when_angle_bracket_left_in_text(text, lineno):
    # 어떤 꼴이든 본문·소제목에 < 또는 > 가 남으면 틀린 채 인쇄하지 않고 멈춘다(몇 번째 줄인지).
    with pytest.raises(ValueError) as e:
        parse_book(text, '요한복음' if text.startswith('요') else '로마서')
    assert '%d번째 줄' % lineno in str(e.value)
    assert '소제목 꺾쇠(< >)가 짝이 맞지 않습니다' in str(e.value)


def test_parse_errors_are_source_text_errors():
    # generate.main() 이 트레이스백 대신 `!! …` 한 줄로 보이도록 원문 문제는 한 종류로 낸다.
    import parse
    assert issubclass(parse.SourceTextError, ValueError)
    with pytest.raises(parse.SourceTextError):
        parse_book("요1:1 태초에\n머리말 한 줄", '요한복음')
    with pytest.raises(parse.SourceTextError):
        parse_book("요5:8 <소제목 가나다", '요한복음')


def test_load_book_file_undecodable_is_source_text_error(tmp_path):
    import parse
    p = tmp_path / 'bad.txt'
    p.write_bytes(b'\xff\xff\xff')
    with pytest.raises(parse.SourceTextError):
        load_book_file(str(p))


def test_parse_continuation_parts_count_up():
    text = "요5:9 가\n요5:나\n요5:다"
    pieces = parse_book(text, '요한복음')
    assert [(p['verse'], p['part']) for p in pieces] == [(9, 0), (9, 1), (9, 2)]
    assert [p['body'] for p in pieces] == ['가', '나', '다']


def test_parse_continuation_of_merged_verse_keeps_verse_end():
    # 합쳐진 절이 끊겨도 뒷조각은 같은 절(들)이다 — 머리글 절 범위가 끝 절을 알아야 한다.
    text = "롬9:1-2 가\n롬9:나"
    pieces = parse_book(text, '로마서')
    assert [(p['verse'], p['verse_end'], p['part'], p['label']) for p in pieces] == \
        [(1, 2, 0, '1-2'), (1, 2, 1, '')]


def test_parse_raises_on_line_without_chapter_number():
    with pytest.raises(ValueError) as e:
        parse_book("요1:1 태초에\n머리말 한 줄", '요한복음', chapter=1)
    assert '2번째 줄' in str(e.value)
    # 장 번호조차 없으면 「절 번호가 없는 줄」이 아니라 「장·절 번호가 없는 줄」이어야
    # 한다(2026-09-22 최종 검토 Minor — 이어지는 줄과 구분).
    assert '장·절 번호가 없는 줄' in str(e.value)


def test_parse_raises_on_line_without_chapter_number_in_any_chapter_filter():
    # 어느 장인지조차 모르는 줄은 --chapter 로 걸러 낼 수도 없다 — 여전히 멈춘다.
    with pytest.raises(ValueError) as e:
        parse_book("요1:1 태초에\n머리말 한 줄\n요2:1 사흘째", '요한복음', chapter=2)
    assert '2번째 줄' in str(e.value)


# 본문만 있는 줄 안에 다른 곳의 「장:절」이 들어 있으면, 그 앞까지를 약자로 읽어 다른 장·절로
# 조용히 끼워 넣었다(가이드 대조 2차 A9 — 유다서 사본 4번째 줄에 넣으니 5쪽 · 25절 → 6쪽 · 26절).
# 약자 자리는 글자만(숫자·공백·밑줄·괄호·따옴표·꺾쇠·콜론·기호는 안 된다) — 그런 줄은 「장·절 번호가 없는 줄」로 멈춘다.
@pytest.mark.parametrize('line', [
    '(요 3:16 참고) 그들에게 화가 있을진저',       # 괄호 · 공백으로 시작
    '그들에게 (요3:16) 화가 있을진저',              # 앞에 낱말 · 괄호
    '그 날에 3:16 을 보라',                         # 공백 뒤 장:절
    '<소제목> 요3:16 그들에게',                      # 꺾쇠로 시작
    '참고:요3:16 그들에게',                          # 콜론 뒤 장:절
    'Jude 1:3 Dear friends',                        # 약자와 장 번호 사이에 공백
    '(요 3:16-17 참고) 그들에게',                    # 합쳐진 절 꼴
    '(시 1:제일권)',                                 # 권 제목 꼴
    '(요 3:참고) 그들에게',                          # 끊긴 줄 꼴
    # 괄호 ( ) 밖의 괄호·따옴표·기호로 시작해도 멈춘다(Minor 2차 검토 — 약자는 글자만).
    '「요3:16」 참고 그들에게',                       # 낫표
    '『요3:16』 참고 그들에게',                       # 겹낫표
    '[요3:16] 참고 그들에게',                         # 대괄호
    '“요3:16” 그들에게',                              # 둥근 따옴표
    '"요3:16" 그들에게',                              # 곧은 따옴표
    '※요3:16 그들에게',                              # 참고표
    '·요3:16 그들에게',                               # 가운뎃점
    '-요3:16 그들에게',                               # 붙임표
    '요_3:16 그들에게',                               # 밑줄
])
def test_parse_stops_on_reference_inside_body_only_line(line):
    text = '유1:1 예수 그리스도의 종이요\n' + line + '\n유1:2 긍휼과 평강과'
    with pytest.raises(ValueError) as e:
        parse_book(text, '유다서')
    assert '2번째 줄' in str(e.value)
    assert '장·절 번호가 없는 줄' in str(e.value)


def test_parse_stops_on_reference_inside_body_only_line_even_with_chapter_filter():
    # 예전엔 3장으로 읽혀 --chapter 1 에서 조용히 걸러졌다 — 줄이 통째로 빠진 채 인쇄된다.
    text = '유1:1 예수 그리스도의 종이요\n(요 3:16 참고) 그들에게 화가 있을진저\n유1:2 긍휼과'
    with pytest.raises(ValueError) as e:
        parse_book(text, '유다서', chapter=1)
    assert '2번째 줄' in str(e.value)


@pytest.mark.parametrize('line, book, expect', [
    ('Jude1:3 Dear friends', '유다서', (1, 3, 0, '3', 'Dear friends')),
    ('요일1:1 태초부터 있는 생명의 말씀', '요한일서', (1, 1, 0, '1', '태초부터 있는 생명의 말씀')),
    ('요이1:1 장로인 나는', '요한이서', (1, 1, 0, '1', '장로인 나는')),
    ('요삼1:1 장로인 나는', '요한삼서', (1, 1, 0, '1', '장로인 나는')),
    ('대상1:1 아담, 셋, 에노스', '역대상', (1, 1, 0, '1', '아담, 셋, 에노스')),
    ('왕하6:32 그 때에 엘리사가', '열왕기하', (6, 32, 0, '32', '그 때에 엘리사가')),
    ('Rom9:1-2 I speak the truth', '로마서', (9, 1, 0, '1-2', 'I speak the truth')),
])
def test_parse_reads_normal_abbreviations(line, book, expect):
    # 약자 자리를 좁혀도 개역개정 약자(한 글자 · 두 글자 · 요일/요이/요삼)와 영문 약자는 그대로다.
    p = parse_book(line, book)[0]
    assert (p['chapter'], p['verse'], p['part'], p['label'], p['body']) == expect


def test_parse_reads_heading_and_continuation_with_long_abbreviation():
    text = '요일1:제일권\n요일1:1 가\n요일1:나'
    pieces = parse_book(text, '요한일서')
    assert [(p['verse'], p['part'], p['heading'], p['body']) for p in pieces] == \
        [(1, 0, '제일권', '가'), (1, 1, None, '나')]


def test_parse_raises_on_continuation_line_without_verse_before_it():
    # 이제는 끊긴 줄을 앞 절에 잇는다. 그런데 이을 앞 절(같은 장)이 없으면 어느 절인지 모른다 —
    # 여전히 멈추고, 「장·절」이 아니라 「절 번호가 없는 줄」이라고 알린다(장 번호는 있다).
    text = "요5:이 날은 안식일이니\n요5:10 유대인들이"
    with pytest.raises(ValueError) as e:
        parse_book(text, '요한복음', chapter=5)
    assert '1번째 줄' in str(e.value)
    assert '절 번호가 없는 줄' in str(e.value)
    assert '장·절' not in str(e.value)


def test_parse_raises_on_continuation_line_after_other_chapter():
    # 앞 조각이 다른 장이면 이을 수 없다(장 첫 줄이 절 번호 없이 시작한 것).
    text = "요4:54 이것은 두 번째 표적이니라\n요5:이 날은 안식일이니"
    with pytest.raises(ValueError) as e:
        parse_book(text, '요한복음')
    assert '2번째 줄' in str(e.value)
    assert '절 번호가 없는 줄' in str(e.value)


def test_parse_raises_on_empty_continuation_line():
    # 장 번호만 있고 아무것도 없는 줄 — 조각으로 만들면 빈 칸이 인쇄된다.
    with pytest.raises(ValueError) as e:
        parse_book("요5:9 가\n요5:", '요한복음')
    assert '2번째 줄' in str(e.value)


def test_parse_reads_merged_verse_line_in_requested_chapter():
    # 로마서 9:1-2 는 원문에서 두 절이 한 줄로 합쳐져 있다. Task 1 에서는 멈췄다(1절로 읽으면
    # 「-2 <약속의 자녀 약속의 말씀> 내가…」가 본문으로 찍힌다). 이제는 합쳐진 절로 읽는다 —
    # 번호 칸에 「1-2.」, 소제목은 소제목으로.
    text = "롬8:39 높음이나 깊음이나\n롬9:1-2 <약속의 자녀 약속의 말씀> 내가 그리스도 안에서 참말을 하고"
    pieces = parse_book(text, '로마서', chapter=9)
    assert len(pieces) == 1
    p = pieces[0]
    assert (p['chapter'], p['verse'], p['verse_end'], p['label']) == (9, 1, 2, '1-2')
    assert p['part'] == 0
    assert p['subtitle'] == '약속의 자녀 약속의 말씀'
    assert p['body'] == '내가 그리스도 안에서 참말을 하고'
    assert p['chapter_start'] is True


def test_parse_reads_merged_verse_line_without_chapter_filter():
    text = "신6:17 너희의 하나님 여호와의 명령과\n신6:18-19 여호와께서 보시기에 정직하고"
    pieces = parse_book(text, '신명기')
    assert [(p['verse'], p['verse_end'], p['label']) for p in pieces] == \
        [(17, None, '17'), (18, 19, '18-19')]
    assert pieces[1]['body'] == '여호와께서 보시기에 정직하고'


# ── 권 제목(시편 제일권~제오권) ──────────────────────────────────────────

def test_parse_book_heading_attaches_to_next_verse():
    text = "시1:제일권\n시1:1 복 있는 사람은"
    pieces = parse_book(text, '시편')
    assert len(pieces) == 1
    assert pieces[0]['heading'] == '제일권'
    assert pieces[0]['verse'] == 1
    assert pieces[0]['body'] == '복 있는 사람은'


def test_parse_book_heading_skips_blank_line_before_verse():
    pieces = parse_book("시1:제일권\n\n시1:1 복 있는 사람은", '시편')
    assert pieces[0]['heading'] == '제일권'


def test_parse_book_heading_attaches_to_merged_verse():
    pieces = parse_book("시92:제삼권\n시92:1-3 <안식일의 찬송 시> 지존자여", '시편')
    assert pieces[0]['heading'] == '제삼권'
    assert pieces[0]['label'] == '1-3'


def test_parse_book_heading_followed_by_other_chapter_raises():
    with pytest.raises(ValueError) as e:
        parse_book("시1:제일권\n시2:1 어찌하여", '시편')
    assert '1번째 줄' in str(e.value)
    assert '제일권' in str(e.value)


def test_parse_book_heading_followed_by_continuation_raises():
    with pytest.raises(ValueError):
        parse_book("시1:제일권\n시1:복 있는 사람은", '시편')


def test_parse_book_heading_followed_by_heading_raises():
    with pytest.raises(ValueError):
        parse_book("시1:제일권\n시1:제이권\n시1:1 복", '시편')


def test_parse_book_heading_at_end_of_file_raises():
    with pytest.raises(ValueError) as e:
        parse_book("시41:13 이스라엘의 하나님 여호와를 찬송할지로다\n시42:제이권", '시편')
    assert '2번째 줄' in str(e.value)


def test_parse_book_heading_in_other_chapter_is_dropped():
    text = "시1:1 복\n시42:제이권\n시42:1 사슴이"
    assert [p['heading'] for p in parse_book(text, '시편', chapter=1)] == [None]
    assert [p['heading'] for p in parse_book(text, '시편', chapter=42)] == ['제이권']


# ── 장 표시 자리(chapter_start) ─────────────────────────────────────────

def test_parse_marks_first_piece_of_each_chapter():
    text = "요1:1 가\n요1:2 나\n요1:이어짐\n요2:1 다\n요2:2 라"
    pieces = parse_book(text, '요한복음')
    assert [p['chapter_start'] for p in pieces] == [True, False, False, True, False]


def test_parse_marks_first_piece_of_requested_chapter():
    text = "요1:1 가\n요2:1 다\n요2:2 라"
    pieces = parse_book(text, '요한복음', chapter=2)
    assert [p['chapter_start'] for p in pieces] == [True, False]


def test_parse_ignores_merged_verse_line_in_other_chapter():
    text = "롬8:39 높음이나 깊음이나\n롬9:1-2 내가 그리스도 안에서 참말을 하고"
    verses = parse_book(text, '로마서', chapter=8)
    assert [v['verse'] for v in verses] == [39]


def test_parse_ignores_continuation_line_in_other_chapter():
    text = "요1:1 태초에 말씀이 계시니라\n요5:이 날은 안식일이니"
    verses = parse_book(text, '요한복음', chapter=1)
    assert [v['verse'] for v in verses] == [1]


# ── ③ UTF-8 (BOM 포함) → CP949 순으로 읽는다 ──────────────────────────

def test_load_book_file_decodes_utf8(tmp_path):
    p = tmp_path / 'utf8.txt'
    p.write_text('유1:1 예수 그리스도의 종이요', encoding='utf-8')
    text = load_book_file(str(p))
    assert '유1:1' in text
    assert '예수 그리스도의 종이요' in text


def test_load_book_file_decodes_utf8_with_bom(tmp_path):
    p = tmp_path / 'utf8bom.txt'
    p.write_bytes('유1:1 예수 그리스도의 종이요'.encode('utf-8-sig'))
    text = load_book_file(str(p))
    assert '유1:1' in text
    assert '예수 그리스도의 종이요' in text
    assert '﻿' not in text  # BOM 자체가 글 속에 남으면 안 된다


def test_load_book_file_decodes_cp949_bytes(tmp_path):
    p = tmp_path / 'cp949.txt'
    p.write_bytes('유1:1 예수 그리스도의 종이요'.encode('cp949'))
    text = load_book_file(str(p))
    assert '유1:1' in text
    assert '예수 그리스도의 종이요' in text


def test_load_book_file_utf8_bom_and_cp949_read_same_text(tmp_path):
    content = '유1:1 <인사> 예수 그리스도의 종이요'
    p_utf8 = tmp_path / 'a.txt'
    p_bom = tmp_path / 'b.txt'
    p_cp949 = tmp_path / 'c.txt'
    p_utf8.write_text(content, encoding='utf-8')
    p_bom.write_bytes(content.encode('utf-8-sig'))
    p_cp949.write_bytes(content.encode('cp949'))
    texts = {load_book_file(str(p)) for p in (p_utf8, p_bom, p_cp949)}
    assert len(texts) == 1


def test_load_book_file_raises_on_undecodable_bytes(tmp_path):
    p = tmp_path / 'bad.txt'
    p.write_bytes(b'\xff\xff\xff')  # UTF-8 도 CP949 도 아니다
    with pytest.raises(ValueError) as e:
        load_book_file(str(p))
    assert 'UTF-8' in str(e.value)
    assert 'CP949' in str(e.value)


@needs_bible
def test_load_book_file_decodes_cp949():
    text = load_book_file(JUDE)
    assert '유1:1' in text
    assert '예수 그리스도의 종이요' in text


@needs_bible
def test_parse_actual_jude_file_has_25_verses():
    verses = parse_book(load_book_file(JUDE), '유다서')
    assert [v['verse'] for v in verses] == list(range(1, 26))


@needs_bible
def test_parse_actual_john_chapter1_has_51_verses():
    verses = parse_book(load_book_file(JOHN), '요한복음', chapter=1)
    assert [v['verse'] for v in verses] == list(range(1, 52))
    assert all(v['chapter'] == 1 for v in verses)
    v19 = verses[18]
    assert v19['subtitle'] == '세례 요한의 증언(마 3:1-12; 막 1:7-8; 눅 3:15-17)'
    assert v19['body'].startswith('유대인들이 예루살렘에서')


@needs_bible
def test_parse_actual_john_whole_book_reads_continuation_lines():
    # 요한복음에는 절 번호 없이 이어지는 줄이 셋(5:9·12:36·18:38 뒷부분) 있다.
    # Task 1 에서는 첫 줄에서 멈췄다. 이제는 앞 절의 둘째 조각으로 읽는다(2026-09-22 「방법 2」).
    pieces = parse_book(load_book_file(JOHN), '요한복음')
    seconds = [(p['chapter'], p['verse']) for p in pieces if p['part'] == 1]
    assert seconds == [(5, 9), (12, 36), (18, 38)]
    assert all(p['label'] == '' for p in pieces if p['part'] == 1)
    assert max(p['part'] for p in pieces) == 1
    # 절 번호는 장마다 1부터 빠짐없이(조각 0 만 센다) — 21장 25절로 끝난다.
    assert [p['chapter'] for p in pieces if p['chapter_start']] == list(range(1, 22))
    last = pieces[-1]
    assert (last['chapter'], last['verse']) == (21, 25)


@needs_bible
def test_parse_actual_john_5_verse_9_has_two_pieces():
    pieces = parse_book(load_book_file(JOHN), '요한복음', chapter=5)
    v9 = [p for p in pieces if p['verse'] == 9]
    assert [p['part'] for p in v9] == [0, 1]
    assert v9[0]['label'] == '9'
    assert v9[1]['label'] == ''
    assert v9[1]['body'].startswith('이 날은 안식일이니')


@needs_bible
def test_parse_actual_john_12_continuation_has_subtitle():
    pieces = parse_book(load_book_file(JOHN), '요한복음', chapter=12)
    v36 = [p for p in pieces if p['verse'] == 36]
    assert v36[1]['subtitle'] == '그들이 예수를 믿지 아니하다'
    assert v36[1]['body'].startswith('예수께서 이 말씀을 하시고')


@needs_bible
def test_parse_actual_psalms_five_book_headings():
    pieces = parse_book(load_book_file(PSALMS), '시편')
    heads = [(p['chapter'], p['verse'], p['part'], p['heading']) for p in pieces if p['heading']]
    assert heads == [(1, 1, 0, '제일권'), (42, 1, 0, '제이권'), (73, 1, 0, '제삼권'),
                     (90, 1, 0, '제사권'), (107, 1, 0, '제오권')]


@needs_bible
def test_parse_actual_psalm_1_has_six_pieces():
    pieces = parse_book(load_book_file(PSALMS), '시편', chapter=1)
    assert [p['verse'] for p in pieces] == [1, 2, 3, 4, 5, 6]
    assert pieces[0]['heading'] == '제일권'
    assert pieces[0]['chapter_start'] is True
    assert all(p['heading'] is None for p in pieces[1:])


@needs_bible
def test_parse_actual_romans_9_first_piece_is_merged():
    pieces = parse_book(load_book_file(ROMANS), '로마서', chapter=9)
    first = pieces[0]
    assert (first['verse'], first['verse_end'], first['label']) == (1, 2, '1-2')
    assert first['subtitle'] == '약속의 자녀 약속의 말씀'
    assert pieces[1]['verse'] == 3


@needs_all_bible
def test_parse_all_66_books_whole_book_does_not_stop():
    # 원문 66권을 훑은 결과(컨트롤러, 2026-09-22): 권 제목 5 · 끊긴 줄 45 · 합쳐진 절 11,
    # 어느 꼴에도 안 맞는 줄 0 — 이제 어느 책도 통째로(chapter=None) 멈추지 않는다.
    counts = Counter()
    for path in _bible_files():
        name = book_name_from_filename(path)
        pieces = parse_book(load_book_file(path), name)
        assert pieces, name
        counts['head'] += sum(1 for p in pieces if p['heading'])
        counts['cont'] += sum(1 for p in pieces if p['part'] > 0)
        counts['cont_sub'] += sum(1 for p in pieces if p['part'] > 0 and p['subtitle'])
        counts['merged'] += sum(1 for p in pieces if p['verse_end'] is not None and p['part'] == 0)
    assert counts == {'head': 5, 'cont': 45, 'cont_sub': 15, 'merged': 11}


# 절 표시(`약자N:` · `약자N:M` · `약자N:M-K`)만 떼는 식 — 본문 보존 검사에 쓴다.
# 약자 자리는 parse.ABBR 과 같게 둔다(예전 `\D+` 는 본문 속 장:절까지 약자로 먹었다).
MARK_RE = re.compile(r'^' + parse_mod.ABBR + r'\d+:(?:\d+-\d+|\d+)?')


def _chars(s):
    return Counter(ch for ch in s if not ch.isspace())


@needs_all_bible
def test_parse_preserves_every_character_of_every_book():
    # 본문 보존: 각 권에서 원문의 모든 글자(절 표시·<> 빼고)가 조각의 본문·소제목·권 제목에
    # 빠짐없이(더도 덜도 없이) 들어간다. 끊긴 줄을 다시 조용히 버리거나 둘로 찍으면 여기서 걸린다.
    for path in _bible_files():
        name = book_name_from_filename(path)
        text = load_book_file(path)
        src = Counter()
        for line in text.splitlines():
            line = line.strip()
            if not line:
                continue
            rest = MARK_RE.sub('', line, count=1)
            src.update(_chars(rest.replace('<', '').replace('>', '')))
        got = Counter()
        for p in parse_book(text, name):
            got.update(_chars((p['heading'] or '') + (p['subtitle'] or '') + p['body']))
            assert '<' not in p['body'] and '>' not in p['body'], (name, p['chapter'], p['verse'])
        assert got == src, name
