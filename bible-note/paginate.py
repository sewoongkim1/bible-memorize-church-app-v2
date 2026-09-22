# -*- coding: utf-8 -*-
"""절 목록을 페이지에 순서대로 채운다.

⚠️ 절 중간에서 페이지를 자르지 않는다 — 한 절(소제목 포함)의 'lines' 가 통째로
   한 페이지에 들어간다. 소제목은 parse.py 단계에서 이미 그 절 dict 안에 붙어
   있으므로(별도 원소가 아니다) 여기서 따로 다룰 것이 없다.
⚠️ 한 쪽보다 긴 절은 들어갈 자리가 없으므로 멈춘다(ValueError). 혼자 한 쪽을
   차지하게 두면 17줄이 넘는 쪽이 조용히 인쇄된다. 원문에서 가장 긴 보통 절은
   열왕기하 6:32(194자 ≈ 9줄)이라 실제로는 일어나지 않는다.
⚠️ 줄 수가 정수 1 이상이 아니면 멈춘다 — 0 이면 실측이 실패한 것이고, 그대로 두면
   절들이 한 쪽에 몰려 들어간다.
"""


def paginate(verses, lines_per_page):
    if not isinstance(lines_per_page, int) or lines_per_page < 1:
        raise ValueError('페이지당 줄 수가 잘못됐습니다: %r' % (lines_per_page,))
    pages = []
    current = []
    remaining = lines_per_page
    for v in verses:
        need = v['lines']
        if not isinstance(need, int) or need < 1:
            raise ValueError('%s절의 줄 수가 잘못됐습니다: %r' % (v.get('verse'), need))
        if need > lines_per_page:
            raise ValueError('%s절이 %d줄이라 한 쪽(%d줄)에 들어가지 않습니다 — 절을 쪽 중간에서 자를 수 없습니다'
                             % (v.get('verse'), need, lines_per_page))
        if current and need > remaining:
            pages.append(current)
            current = []
            remaining = lines_per_page
        current.append(v)
        remaining -= need
    if current:
        pages.append(current)
    return pages
