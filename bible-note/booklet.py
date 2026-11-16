# -*- coding: utf-8 -*-
"""소책자 PDF — A4 세로 필사노트를 「가운데 접어 철하는 책(중철)」 차례로, 종이 한 면에 두 쪽씩 놓는다(2026-11-16 친구).

    종이 A4 → A5 크기 책(쪽을 0.707 배로 줄인다) · 종이 A3 → A4 크기 책(크기 그대로).
    PDF 한 쪽 = 종이 한 면. 양면 인쇄(짧은 쪽으로 넘기기)로 찍어 나온 차례대로 겹쳐 가운데를 접고 철한다.
    4의 배수가 되게 끝에 빈 쪽을 채운다 — 8쪽이면 종이 2장: 1장 앞면 (8, 1) · 뒷면 (2, 7) · 2장 앞면 (6, 3) · 뒷면 (4, 5).

⚠️ 쪽을 다시 그리지 않는다 — 자체 확인을 통과한 인쇄본 HTML 의 .page 를 그대로 옮겨 놓고(CSS transform) 크롬으로 PDF 를 만든다.
   그래서 줄 수 · 줄바꿈은 인쇄본과 같다(같은 서체 파일 · 같은 CSS). 소책자 HTML 은 인쇄본 옆에 만든다 — 옆의 fonts/ 를 같이 쓴다.
⚠️ 세로(A4 세로)만 — 가로 쪽 둘을 겹치면 위로 넘기는 책이 되어 이 차례가 맞지 않는다(notebook.normalize 가 끈다).
⚠️ 제본 여백(왼쪽에 더)은 소책자에서 「안쪽(접는 쪽)」이다 — 왼쪽 면(짝수 쪽)은 안쪽이 오른쪽이라, 쪽을 그 여백만큼 왼쪽으로 옮겨
   오른쪽에 여백이 가게 한다(.page 의 왼쪽 안쪽 여백 = 바깥 여백 + 제본 여백 — render · dictation 둘 다 padding-left 로 준다).
"""
import io
import math
import os
import re

import generate as G

PAGE_W_MM, PAGE_H_MM = 210.0, 297.0                 # 옮겨 놓는 쪽 — A4 세로
PAPERS = {'A4': (297.0, 210.0), 'A3': (420.0, 297.0)}   # 종이를 가로로 눕힌 크기(mm) — 한 면에 세로 쪽 둘
PDF_PT = {'A4': (841.89, 595.28), 'A3': (1190.55, 841.89)}
PAGE_OPEN = '<div class="page">'


def _num(v, digits):
    return ('%.*f' % (digits, v)).rstrip('0').rstrip('.')


def scale(paper):
    """종이 한 면의 반쪽에 A4 세로 한 쪽이 들어가는 배율 — A4 종이 0.70707 · A3 종이 1."""
    sw, sh = PAPERS[paper]
    return min(sw / 2.0 / PAGE_W_MM, sh / PAGE_H_MM)


def sides(n):
    """n 쪽 → 종이 면 차례 [(왼쪽 쪽, 오른쪽 쪽)] — 4의 배수로 채운 빈 쪽은 None. 왼쪽 면은 늘 짝수 쪽 · 오른쪽 면은 홀수 쪽."""
    total = max(4, int(math.ceil(n / 4.0)) * 4)
    out = []
    for s in range(total // 4):
        for a, b in ((total - 2 * s, 1 + 2 * s), (2 + 2 * s, total - 1 - 2 * s)):
            out.append(tuple(x if x <= n else None for x in (a, b)))
    return out


def split_pages(html):
    """인쇄본 HTML → (첫 쪽 앞까지, [쪽 HTML], </body> 부터). 쪽은 <body> 바로 아래 <div class="page"> 들이 차례로 붙어 있다
    (render · dictation 의 build_final_html). 본문 글은 esc 를 거쳐 이 글자 줄이 본문 안에 나올 수 없다."""
    i = html.find(PAGE_OPEN)
    j = html.rfind('</body>')
    if i < 0 or j < i:
        raise SystemExit('!! 인쇄본에서 쪽을 찾지 못해 소책자를 만들 수 없습니다')
    return html[:i], [PAGE_OPEN + p for p in html[i:j].split(PAGE_OPEN)[1:]], html[j:]


def booklet_html(html, paper='A4', inner_mm=0):
    """인쇄본 HTML → (소책자 HTML, 쪽 수, 면 수). inner_mm = 제본 여백(왼쪽에 더) — 왼쪽 면(짝수 쪽)은 그만큼 왼쪽으로 옮긴다."""
    if paper not in PAPERS:
        raise SystemExit('!! 소책자 종이는 A4 · A3 만 됩니다: %s' % paper)
    head, pages, tail = split_pages(html)
    if '</head>' not in head:
        raise SystemExit('!! 인쇄본의 머리(head)를 찾지 못해 소책자를 만들 수 없습니다')
    sw, sh = PAPERS[paper]
    k = _num(scale(paper), 5)
    css = ['@page { size: %s landscape; margin: 0; }' % paper,       # 인쇄본의 @page(A4 세로)를 뒤에서 덮는다
           '.sheet { width:%smm; height:%smm; display:flex; overflow:hidden; background:#fff;'
           ' break-after:page; page-break-after:always; }' % (_num(sw, 2), _num(sh, 2)),
           '.sheet:last-child { break-after:auto; page-break-after:auto; }',
           '.slot { flex:none; width:%smm; height:%smm; overflow:hidden; }' % (_num(sw / 2.0, 2), _num(sh, 2)),
           '.slot > .page { transform-origin:0 0; transform:scale(%s); margin:0;'
           ' break-after:auto !important; page-break-after:auto !important; }' % k]
    if inner_mm:
        css.append('.slot.even > .page { transform:scale(%s) translateX(-%smm); }' % (k, _num(inner_mm, 2)))
    body = []
    for left, right in sides(len(pages)):
        slots = ''.join('<div class="slot %s">%s</div>' % (cls, pages[no - 1] if no else '')
                        for cls, no in (('even', left), ('odd', right)))
        body.append('<div class="sheet">%s</div>' % slots)
    out = (head.replace('</head>', '<style>\n%s\n</style></head>' % '\n'.join(css), 1)
           + ''.join(body) + tail)
    return out, len(pages), len(body)


def pdf_sides(path):
    """크롬이 만든 PDF 의 (쪽 수, [(가로, 세로) pt]) — 크롬은 쪽 사전을 압축하지 않고 쓴다(2026-11-16 실측 · 객체 묶음 없음)."""
    with open(path, 'rb') as f:
        data = f.read()
    n = len(re.findall(rb'/Type\s*/Page(?![s\w])', data))
    boxes = [(float(a), float(b)) for a, b in
             re.findall(rb'/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]', data)]
    return n, boxes


def check_pdf(path, paper, want_sides):
    """면 수 · 종이 크기가 맞나 — 틀리면 멈춘다(SystemExit). 쪽을 하나도 읽지 못하면(크롬이 쓰는 꼴이 바뀜) False — 부른 쪽이 알린다."""
    n, boxes = pdf_sides(path)
    if not n and not boxes:
        return False
    w, h = PDF_PT[paper]
    bad = [b for b in boxes if abs(b[0] - w) > 2 or abs(b[1] - h) > 2]
    if n != want_sides or len(boxes) != want_sides or bad:
        raise SystemExit('!! 소책자 PDF 가 어긋났습니다(면 %d · 바라는 것 %d · 크기 %s) — 인쇄하지 마세요'
                         % (n, want_sides, sorted(set(bad))[:2] or '맞음'))
    return True


def make(html_path, pdf_path, chrome, paper='A4', inner_mm=0):
    """인쇄본 HTML(자체 확인을 통과한 것) → 소책자 PDF. (쪽 수, 면 수, 확인했나)를 돌려준다.
    크롬 부름은 generate._chrome 이다 — 화면(notebook)이 멈추기 · 시간 넘김을 아는 것으로 바꿔 끼운다."""
    with io.open(html_path, encoding='utf-8') as f:
        out, n_pages, n_sides = booklet_html(f.read(), paper, inner_mm)
    tmp = G._temp_beside(html_path, '_booklet_', '.html')     # 「_」 로 시작 — bible-note 안이면 .gitignore 에 걸린다
    try:
        with io.open(tmp, 'w', encoding='utf-8') as f:
            f.write(out)
        if os.path.exists(pdf_path):
            os.remove(pdf_path)
        r = G._chrome(chrome, ['--no-pdf-header-footer', '--print-to-pdf=' + pdf_path,
                               '--virtual-time-budget=30000'], tmp)
    finally:
        G._remove_temp(tmp)
    if not os.path.exists(pdf_path) or os.path.getsize(pdf_path) == 0:
        raise SystemExit('!! 소책자 PDF 를 만들지 못했습니다 — 다시 눌러 보세요(%s)'
                         % r.stderr.decode('utf-8', 'replace').strip()[:200])
    return n_pages, n_sides, check_pdf(pdf_path, paper, n_sides)
