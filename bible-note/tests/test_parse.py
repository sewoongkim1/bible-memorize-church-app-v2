# -*- coding: utf-8 -*-
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from parse import parse_book, book_name_from_filename, load_book_file

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
JUDE = os.path.join(ROOT, 'bible', '2-26유다서.txt')
JOHN = os.path.join(ROOT, 'bible', '2-04요한복음.txt')

# bible/ 은 .gitignore 로 저장소에서 뺀 폴더다(개역개정 저작권). 원문이 없는 PC 에서는
# 실제 파일을 읽는 테스트만 건너뛴다 — 가짜 문자열로 하는 나머지 테스트는 어디서든 돈다.
needs_bible = pytest.mark.skipif(
    not (os.path.exists(JUDE) and os.path.exists(JOHN)),
    reason='bible/ 원문이 없는 PC(저장소에서 뺀 폴더)')


def test_parse_simple_verse():
    text = "유1:1 예수 그리스도의 종이요 야고보의 형제인 유다는"
    verses = parse_book(text, '유다서')
    assert len(verses) == 1
    assert verses[0] == {
        'book': '유다서', 'chapter': 1, 'verse': 1,
        'subtitle': None, 'body': '예수 그리스도의 종이요 야고보의 형제인 유다는',
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


def test_parse_raises_on_continuation_line_in_requested_chapter():
    # 요한복음 5:9 는 원문에서 두 줄로 나뉘어 있다 — 뒷줄에 절 번호가 없다.
    # 조용히 건너뛰면 「이 날은 안식일이니」가 빠진 채 인쇄되므로 멈춰야 한다.
    text = "요5:9 그 사람이 곧 나아서 자리를 들고 걸어가니라\n요5:이 날은 안식일이니"
    with pytest.raises(ValueError) as e:
        parse_book(text, '요한복음', chapter=5)
    assert '2번째 줄' in str(e.value)


def test_parse_raises_on_continuation_line_without_chapter_filter():
    text = "요5:9 그 사람이 곧 나아서\n요5:이 날은 안식일이니"
    with pytest.raises(ValueError) as e:
        parse_book(text, '요한복음')
    assert '2번째 줄' in str(e.value)


def test_parse_raises_on_line_without_chapter_number():
    with pytest.raises(ValueError) as e:
        parse_book("요1:1 태초에\n머리말 한 줄", '요한복음', chapter=1)
    assert '2번째 줄' in str(e.value)
    # 장 번호조차 없으면 「절 번호가 없는 줄」이 아니라 「장·절 번호가 없는 줄」이어야
    # 한다(2026-09-22 최종 검토 Minor — 이어지는 줄과 구분).
    assert '장·절 번호가 없는 줄' in str(e.value)


def test_parse_raises_on_continuation_line_message_says_verse_only():
    # 장 번호는 있고(요5:) 절 번호만 없는 이어지는 줄은 「장·절」이 아니라
    # 「절 번호가 없는 줄」이어야 한다.
    text = "요5:9 그 사람이 곧 나아서 자리를 들고 걸어가니라\n요5:이 날은 안식일이니"
    with pytest.raises(ValueError) as e:
        parse_book(text, '요한복음', chapter=5)
    assert '절 번호가 없는 줄' in str(e.value)
    assert '장·절' not in str(e.value)


def test_parse_raises_on_merged_verse_line_in_requested_chapter():
    # 로마서 9:1-2 는 원문에서 두 절이 한 줄로 합쳐져 있다. 1절로 읽으면
    # 「-2 <약속의 자녀 약속의 말씀> 내가…」가 본문으로 찍히고 2절 번호가 사라진다.
    text = "롬8:39 높음이나 깊음이나\n롬9:1-2 <약속의 자녀 약속의 말씀> 내가 그리스도 안에서 참말을 하고"
    with pytest.raises(ValueError) as e:
        parse_book(text, '로마서', chapter=9)
    assert '2번째 줄' in str(e.value)
    assert '합쳐' in str(e.value)


def test_parse_ignores_merged_verse_line_in_other_chapter():
    text = "롬8:39 높음이나 깊음이나\n롬9:1-2 내가 그리스도 안에서 참말을 하고"
    verses = parse_book(text, '로마서', chapter=8)
    assert [v['verse'] for v in verses] == [39]


def test_parse_ignores_continuation_line_in_other_chapter():
    text = "요1:1 태초에 말씀이 계시니라\n요5:이 날은 안식일이니"
    verses = parse_book(text, '요한복음', chapter=1)
    assert [v['verse'] for v in verses] == [1]


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
def test_parse_actual_john_whole_book_stops_at_continuation_line():
    # 요한복음에는 절 번호 없이 이어지는 줄이 셋(5:9·12:36·18:38 뒷부분) 있다 — 첫 줄에서 멈춘다
    with pytest.raises(ValueError) as e:
        parse_book(load_book_file(JOHN), '요한복음')
    assert '이 날은 안식일이니' in str(e.value)
