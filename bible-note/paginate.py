# -*- coding: utf-8 -*-
"""절 목록을 페이지에 순서대로 채운다.

⚠️ 절 중간에서 페이지를 자르지 않는다 — 한 절(소제목 포함)의 'lines' 가 통째로
   한 페이지에 들어간다. 소제목은 parse.py 단계에서 이미 그 절 dict 안에 붙어
   있으므로(별도 원소가 아니다) 여기서 따로 다룰 것이 없다.
"""


def paginate(verses, lines_per_page):
    if not verses:
        return []
    pages = []
    current = []
    remaining = lines_per_page
    for v in verses:
        need = v['lines']
        if current and need > remaining:
            pages.append(current)
            current = []
            remaining = lines_per_page
        current.append(v)
        remaining -= need
    if current:
        pages.append(current)
    return pages
