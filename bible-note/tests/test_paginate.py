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
