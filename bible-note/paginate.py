# -*- coding: utf-8 -*-
"""조각 목록을 페이지에 순서대로 채운다.

⚠️ 단위는 parse.py 의 「조각」이다(2026-09-22 Task 9) — 보통은 절 하나가 조각 하나이고, 끊긴
   절은 두 조각, 합쳐진 절(「1-2」)은 한 조각이다. 조각 중간에서 페이지를 자르지 않는다 —
   조각 하나의 'lines' 가 통째로 한 페이지에 들어간다. 'lines' 에는 본문 줄에 더해 그 조각 위에
   얹는 권 제목 · 장 표시 · 소제목 줄이 이미 들어 있다(generate.apply_line_counts — 칸마다
   따로 원소가 아니다). 그래서 여기서 따로 다룰 것이 없다. 끊긴 절의 두 조각은 서로 다른 쪽에
   찍힐 수 있다(한 조각이 한 문단이다).
⚠️ 한 쪽보다 긴 조각은 들어갈 자리가 없으므로 멈춘다(ValueError). 혼자 한 쪽을
   차지하게 두면 17줄이 넘는 쪽이 조용히 인쇄된다. 원문에서 가장 긴 보통 절은
   열왕기하 6:32(194자 ≈ 9줄)이고, 그 위에 권 제목 · 장 표시 · 두 줄 소제목이 모두 붙어도
   13줄 안팎이라 17줄 밑일 것으로 본다 — 다만 이것은 추정이고 66권 전체의 조각 줄 수를
   실측한 것은 아니다(넘는 조각이 있으면 여기서 멈추니 조용히 틀리지는 않는다).
⚠️ 줄 수가 정수 1 이상이 아니면 멈춘다 — 0 이면 실측이 실패한 것이고, 그대로 두면
   절들이 한 쪽에 몰려 들어간다.
⚠️ 장이 바뀌면 새 페이지에서 시작한다(설계 §7). 절 dict에 'chapter'가 있으면 이전
   절과 비교해 장이 바뀐 시점에 남은 줄이 있어도 새 페이지로 넘긴다 — 안 그러면
   한 쪽 안에서 「30.」 다음에 장 표시 없이 「1.」이 이어져 찍힌다(2026-09-22 최종
   검토 Important 1). 'chapter' 키가 없는 절(테스트용 더미 등)은 지금처럼 줄 수만 본다.
⚠️ 오류 메시지는 「(장):(절)」로 적는다 — 여러 장을 한꺼번에 돌릴 수 있게 된 뒤로는
   절 번호만으로 몇 장인지 알 수 없다('chapter' 키가 없으면 절 번호만 적는다. 2026-09-22
   최종 검토 Minor).
"""


def _verse_label(v):
    chapter = v.get('chapter')
    verse = v.get('verse')
    if chapter is None:
        return '%s' % (verse,)
    return '%s:%s' % (chapter, verse)


def paginate(verses, lines_per_page):
    if not isinstance(lines_per_page, int) or lines_per_page < 1:
        raise ValueError('페이지당 줄 수가 잘못됐습니다: %r' % (lines_per_page,))
    pages = []
    current = []
    remaining = lines_per_page
    for v in verses:
        need = v['lines']
        if not isinstance(need, int) or need < 1:
            raise ValueError('%s절의 줄 수가 잘못됐습니다: %r' % (_verse_label(v), need))
        if need > lines_per_page:
            raise ValueError('%s절이 %d줄이라 한 쪽(%d줄)에 들어가지 않습니다 — 절을 쪽 중간에서 자를 수 없습니다'
                             % (_verse_label(v), need, lines_per_page))
        chapter_changed = current and v.get('chapter') != current[-1].get('chapter')
        if current and (need > remaining or chapter_changed):
            pages.append(current)
            current = []
            remaining = lines_per_page
        current.append(v)
        remaining -= need
    if current:
        pages.append(current)
    return pages
