# -*- coding: utf-8 -*-
"""조각 목록을 페이지에 순서대로 채운다.

⚠️ 단위는 parse.py 의 「조각」이다(2026-09-22 Task 9) — 보통은 절 하나가 조각 하나이고, 끊긴
   절은 두 조각, 합쳐진 절(「1-2」)은 한 조각이다. 조각 중간에서 페이지를 자르지 않는다 —
   조각 하나의 'lines' 가 통째로 한 페이지에 들어간다. 'lines' 에는 본문 줄에 더해 그 조각 위에
   얹는 권 제목 · 장 표시 · 소제목 줄이 이미 들어 있다(generate.apply_line_counts — 칸마다
   따로 원소가 아니다). 그래서 여기서 따로 다룰 것이 없다. 끊긴 절의 두 조각은 서로 다른 쪽에
   찍힐 수 있다(한 조각이 한 문단이다).
⚠️ 한 쪽보다 긴 조각은 들어갈 자리가 없으므로 멈춘다(ValueError). 혼자 한 쪽을
   차지하게 두면 17줄이 넘는 쪽이 조용히 인쇄된다. 지금 설정(12pt · 줄 9.5mm · 원문 열 50%)으로
   66권 31,133 조각을 모두 실측했다(2026-09-22, measure_draft + apply_line_counts): 가장 긴 조각은
   합쳐진 절 예레미야 32:3-5(287자 · 9줄)이고, 권 제목 · 장 표시 · 소제목까지 더한 줄 수도 9줄이
   가장 크다(위 칸이 붙은 조각은 7줄까지 · 소제목은 시편 18 · 54 · 60편 표제의 3줄까지). 가장 긴
   보통 절 열왕기하 6:32 · 사무엘하 14:32(194자)는 6줄이다. 그래서 지금은 어느 책도 여기서 멈추지 않는다.
   ⚠️ 글자 크기 · 줄 높이 · 열 폭 · 자간(render.py 맨 위 설정)을 바꾸면 이 숫자는 달라진다 — 다시 잴 것
   (넘는 조각이 생기면 여기서 멈추니 조용히 틀리지는 않는다).
⚠️ 줄 수가 정수 1 이상이 아니면 멈춘다 — 0 이면 실측이 실패한 것이고, 그대로 두면
   절들이 한 쪽에 몰려 들어간다.
⚠️ 장이 바뀌면 새 페이지에서 시작한다(설계 §7). 절 dict에 'chapter'가 있으면 이전
   절과 비교해 장이 바뀐 시점에 남은 줄이 있어도 새 페이지로 넘긴다 — 안 그러면
   한 쪽 안에서 「30.」 다음에 장 표시 없이 「1.」이 이어져 찍힌다(2026-09-22 최종
   검토 Important 1). 'chapter' 키가 없는 절(테스트용 더미 등)은 지금처럼 줄 수만 본다.
⚠️ 오류 메시지는 「(장):(절)」로 적는다 — 여러 장을 한꺼번에 돌릴 수 있게 된 뒤로는
   절 번호만으로 몇 장인지 알 수 없다('chapter' 키가 없으면 절 번호만 적는다. 2026-09-22
   최종 검토 Minor). 끊긴 절의 뒷조각은 「5:9(조각 1)」로 적는다(_verse_label).
"""


def _verse_label(v):
    """오류 메시지에 적을 이름 — 「5:9절」, 끊긴 절의 뒷조각이면 「5:9(조각 1)」.

    뒷조각에 조각 번호를 적는 꼴은 render · generate 의 「%d:%d(조각 %d)」와 같다(2026-09-22
    Minor 검토 0 Minor 2 — 예전엔 두 조각이 같은 「5:9절」로 보였다).
    """
    chapter = v.get('chapter')
    verse = v.get('verse')
    name = '%s' % (verse,) if chapter is None else '%s:%s' % (chapter, verse)
    part = v.get('part') or 0
    if part > 0:
        return '%s(조각 %d)' % (name, part)
    return name + '절'


def paginate(verses, lines_per_page):
    if not isinstance(lines_per_page, int) or lines_per_page < 1:
        raise ValueError('페이지당 줄 수가 잘못됐습니다: %r' % (lines_per_page,))
    pages = []
    current = []
    remaining = lines_per_page
    for v in verses:
        need = v['lines']
        if not isinstance(need, int) or need < 1:
            raise ValueError('%s의 줄 수가 잘못됐습니다: %r' % (_verse_label(v), need))
        if need > lines_per_page:
            raise ValueError('%s이 %d줄이라 한 쪽(%d줄)에 들어가지 않습니다 — 절을 쪽 중간에서 자를 수 없습니다'
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
