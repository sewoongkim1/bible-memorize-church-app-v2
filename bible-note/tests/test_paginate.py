# -*- coding: utf-8 -*-
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from paginate import paginate


def test_paginate_fits_on_one_page():
    verses = [{'verse': i, 'lines': 2} for i in range(1, 6)]  # 5개 * 2줄 = 10줄
    pages = paginate(verses, lines_per_page=17)
    assert len(pages) == 1
    assert len(pages[0]) == 5


def test_paginate_splits_across_pages():
    verses = [{'verse': i, 'lines': 5} for i in range(1, 5)]  # 4개 * 5줄 = 20줄
    pages = paginate(verses, lines_per_page=17)
    # 5+5+5=15 는 17줄 안에 들어가지만, 네 번째(20)는 못 들어간다
    assert len(pages) == 2
    assert [v['verse'] for v in pages[0]] == [1, 2, 3]
    assert [v['verse'] for v in pages[1]] == [4]


def test_paginate_never_splits_a_single_verse():
    verses = [{'verse': 1, 'lines': 10}, {'verse': 2, 'lines': 10}]
    pages = paginate(verses, lines_per_page=17)
    assert len(pages) == 2
    assert pages[0] == [verses[0]]
    assert pages[1] == [verses[1]]


def test_paginate_oversized_verse_raises():
    # 17줄보다 긴 절은 한 쪽에 안 들어가고, 절을 쪽 중간에서 자를 수도 없다.
    # 혼자 한 쪽을 차지하게 두면 17줄이 넘는 쪽이 조용히 인쇄되므로 멈춘다.
    with pytest.raises(ValueError) as e:
        paginate([{'verse': 1, 'lines': 30}], lines_per_page=17)
    assert '30줄' in str(e.value)


def test_paginate_oversized_verse_after_others_raises():
    verses = [{'verse': 1, 'lines': 3}, {'verse': 2, 'lines': 18}]
    with pytest.raises(ValueError):
        paginate(verses, lines_per_page=17)


def test_paginate_rejects_zero_lines():
    # 실측이 실패해 0줄이 오면 절들이 한 쪽에 몰려 들어간다 — 받는 자리에서 멈춘다
    with pytest.raises(ValueError):
        paginate([{'verse': 1, 'lines': 0}], lines_per_page=17)


def test_paginate_rejects_non_positive_lines_per_page():
    with pytest.raises(ValueError):
        paginate([{'verse': 1, 'lines': 1}], lines_per_page=0)


def test_paginate_empty_list_returns_empty():
    assert paginate([], lines_per_page=17) == []


def test_paginate_exact_fit_does_not_overflow_to_new_page():
    verses = [{'verse': 1, 'lines': 9}, {'verse': 2, 'lines': 8}]  # 정확히 17줄
    pages = paginate(verses, lines_per_page=17)
    assert len(pages) == 1
    assert len(pages[0]) == 2


def test_paginate_starts_new_page_on_chapter_change():
    # 룻기·빌립보서 등 여러 장짜리 책을 --chapter 없이 통째로 돌릴 때, 한 쪽 안에서
    # 장 표시 없이 절 번호만 이어지면 안 된다(설계 §7 · 2026-09-22 최종 검토 Important 1).
    verses = [
        {'verse': 1, 'chapter': 1, 'lines': 2},
        {'verse': 2, 'chapter': 1, 'lines': 2},
        {'verse': 1, 'chapter': 2, 'lines': 2},  # 남은 줄(17-4=13)이 넉넉해도 장이 바뀌면 새 쪽
    ]
    pages = paginate(verses, lines_per_page=17)
    assert len(pages) == 2
    assert [v['verse'] for v in pages[0]] == [1, 2]
    assert [(v['chapter'], v['verse']) for v in pages[1]] == [(2, 1)]


def test_paginate_ignores_chapter_when_key_absent():
    # 'chapter' 키가 없는 절(단위 테스트용 더미)은 지금까지처럼 줄 수만 본다.
    verses = [{'verse': i, 'lines': 2} for i in range(1, 6)]
    pages = paginate(verses, lines_per_page=17)
    assert len(pages) == 1
    assert len(pages[0]) == 5


def test_paginate_oversized_verse_message_includes_chapter():
    # 여러 장을 한꺼번에 돌릴 수 있게 된 뒤로는 절 번호만으로 몇 장인지 알 수 없다
    # (2026-09-22 최종 검토 Minor).
    with pytest.raises(ValueError) as e:
        paginate([{'verse': 3, 'chapter': 2, 'lines': 30}], lines_per_page=17)
    assert '2:3' in str(e.value)


def test_paginate_zero_lines_message_includes_chapter():
    with pytest.raises(ValueError) as e:
        paginate([{'verse': 5, 'chapter': 1, 'lines': 0}], lines_per_page=17)
    assert '1:5' in str(e.value)


def test_paginate_message_without_chapter_key_omits_colon():
    # 'chapter' 키가 없는 더미 절은 옛날처럼 절 번호만 보인다.
    with pytest.raises(ValueError) as e:
        paginate([{'verse': 5, 'lines': 0}], lines_per_page=17)
    msg = str(e.value)
    assert '5절' in msg
    assert '5:5' not in msg


def test_paginate_messages_include_piece_number():
    # 끊긴 절의 두 조각이 같은 「5:9절」로 보이지 않게 조각 번호를 적는다 — render · generate 의
    # 「5:9(조각 1)」과 같은 꼴(2026-09-22 Minor 검토 0 Minor 2).
    with pytest.raises(ValueError) as e:
        paginate([{'verse': 9, 'chapter': 5, 'part': 1, 'lines': 0}], lines_per_page=17)
    assert '5:9(조각 1)의 줄 수가 잘못됐습니다' in str(e.value)
    with pytest.raises(ValueError) as e:
        paginate([{'verse': 9, 'chapter': 5, 'part': 2, 'lines': 30}], lines_per_page=17)
    assert '5:9(조각 2)이 30줄이라 한 쪽(17줄)에 들어가지 않습니다' in str(e.value)


def test_paginate_messages_first_piece_keep_verse_form():
    # 첫 조각(part 0)과 part 가 없는 절은 예전 문구 그대로 — 「5:9절…」, 조각 번호 없음.
    for v in ({'verse': 9, 'chapter': 5, 'part': 0, 'lines': 0}, {'verse': 9, 'chapter': 5, 'lines': 0}):
        with pytest.raises(ValueError) as e:
            paginate([v], lines_per_page=17)
        assert str(e.value) == '5:9절의 줄 수가 잘못됐습니다: 0'
    with pytest.raises(ValueError) as e:
        paginate([{'verse': 9, 'chapter': 5, 'part': 0, 'lines': 30}], lines_per_page=17)
    assert str(e.value) == ('5:9절이 30줄이라 한 쪽(17줄)에 들어가지 않습니다 — '
                            '절을 쪽 중간에서 자를 수 없습니다')
