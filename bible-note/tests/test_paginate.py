# -*- coding: utf-8 -*-
import os
import sys

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


def test_paginate_oversized_verse_gets_its_own_page():
    # 17줄보다 큰 절은 있을 수 없다고 가정하지만, 방어적으로 혼자 페이지를 차지한다
    verses = [{'verse': 1, 'lines': 30}]
    pages = paginate(verses, lines_per_page=17)
    assert len(pages) == 1
    assert len(pages[0]) == 1


def test_paginate_empty_list_returns_empty():
    assert paginate([], lines_per_page=17) == []


def test_paginate_exact_fit_does_not_overflow_to_new_page():
    verses = [{'verse': 1, 'lines': 9}, {'verse': 2, 'lines': 8}]  # 정확히 17줄
    pages = paginate(verses, lines_per_page=17)
    assert len(pages) == 1
    assert len(pages[0]) == 2
