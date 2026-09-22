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
    # 소제목 안에 다른 책의 장:절 인용이 통째로 들어있는 경우(요한복음 1:19 실제 원문 형태)
    text = "요1:19 <세례 요한의 증언(막 1:7-8; 눅 3:15-17)> 유대인들이 예루살렘에서"
    verses = parse_book(text, '요한복음')
    assert verses[0]['subtitle'] == '세례 요한의 증언(막 1:7-8; 눅 3:15-17)'
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


@needs_bible
def test_load_book_file_decodes_cp949():
    text = load_book_file(JUDE)
    assert '유1:1' in text
    assert '예수 그리스도의 종이요' in text


@needs_bible
def test_parse_actual_jude_file_has_25_verses():
    verses = parse_book(load_book_file(JUDE), '유다서')
    assert len(verses) == 25
    assert verses[0]['verse'] == 1
    assert verses[-1]['verse'] == 25


@needs_bible
def test_parse_actual_john_chapter1_has_51_verses():
    verses = parse_book(load_book_file(JOHN), '요한복음', chapter=1)
    assert len(verses) == 51
    assert all(v['chapter'] == 1 for v in verses)
