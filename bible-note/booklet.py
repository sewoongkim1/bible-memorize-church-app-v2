# -*- coding: utf-8 -*-
"""소책자 PDF — A4 세로 필사노트를 책으로 묶기 좋게 종이에 다시 놓는다(2026-11-16 친구 · 세로형만).

    꼴(kind) 넷 — 표 KINDS:
      'A4'      중철(가운데 접어 스테이플) · A4 종이 한 면에 두 쪽 → A5 크기 책(0.707 배)
      'A3'      중철 · A3 종이 한 면에 두 쪽 → A4 크기 책(그대로)
      'wire-A5' 와이어(구멍 뚫어 묶기) · A4 종이 한 면에 두 쪽 → 다 찍어 가운데를 잘라 겹치면 A5 크기 책(0.707 배)
      'wire-A4' 와이어 · A4 종이 한 면에 한 쪽 → A4 크기 책(그대로)
    PDF 한 쪽 = 종이 한 면 — 모두 양면 인쇄. 두 쪽 꼴(가로로 눕힌 종이)은 「짧은 쪽으로 넘기기」, 한 쪽 꼴(세로)은 「긴 쪽으로 넘기기」.

    차례(impose):
      중철   sides(n) — 종이 s 앞면 (끝-2s, 1+2s) · 뒷면 (2+2s, 끝-1-2s) · 4의 배수로 빈 쪽. 겹쳐 접으면 1쪽부터.
      자르기 cut_stack(n) — 낱장 L = 쪽÷2 · 종이 S = 낱장÷2. 종이 i 앞면 (2i+1, 2(S+i)+1) · 뒷면 (2(S+i)+2, 2i+2).
             짧은 쪽으로 넘기면 앞면 왼쪽 반의 뒤가 뒷면 오른쪽 반이다. 다 찍은 묶음을 가운데서 잘라 왼쪽 묶음(1쪽이 맨 위)을
             오른쪽 묶음 위에 얹으면 1쪽부터 차례(cut & stack).
      한 쪽씩 읽는 차례 · 양면이라 짝수로 채운다.

⚠️ 쪽을 다시 그리지 않는다 — 자체 확인을 통과한 인쇄본 HTML 의 .page 를 그대로 옮겨 놓고(CSS transform) 크롬으로 PDF 를 만든다.
   그래서 줄 수 · 줄바꿈은 인쇄본과 같다(같은 서체 파일 · 같은 CSS). 소책자 HTML 은 인쇄본 옆에 만든다 — 옆의 fonts/ 를 같이 쓴다.
⚠️ 세로(A4 세로)만 — 가로 쪽 둘을 겹치면 위로 넘기는 책이 되어 이 차례가 맞지 않는다(notebook.normalize 가 끈다).
⚠️ 제본 여백(왼쪽에 더)은 책의 「안쪽」(접는 쪽 · 와이어 쪽)이다 — 홀수 쪽은 안쪽이 왼쪽 · 짝수 쪽은 오른쪽이라, 짝수 쪽을 그 여백만큼
   왼쪽으로 옮겨 오른쪽에 여백이 가게 한다(.page 의 왼쪽 안쪽 여백 = 바깥 여백 + 제본 여백 — render · dictation 둘 다 padding-left).
   자리(왼쪽 반 · 오른쪽 반)가 아니라 쪽 번호로 가른다 — 자르기 꼴은 앞면 두 반이 모두 홀수 쪽이다.
"""
import io
import math
import os
import re

import generate as G

PAGE_W_MM, PAGE_H_MM = 210.0, 297.0                 # 옮겨 놓는 쪽 — A4 세로
KINDS = {
    'A4': {'sheet': (297.0, 210.0), 'per': 2, 'order': 'saddle', 'page': 'A4 landscape', 'pt': (841.89, 595.28)},
    'A3': {'sheet': (420.0, 297.0), 'per': 2, 'order': 'saddle', 'page': 'A3 landscape', 'pt': (1190.55, 841.89)},
    'wire-A5': {'sheet': (297.0, 210.0), 'per': 2, 'order': 'cut', 'page': 'A4 landscape', 'pt': (841.89, 595.28)},
    'wire-A4': {'sheet': (210.0, 297.0), 'per': 1, 'order': 'single', 'page': 'A4 portrait', 'pt': (595.28, 841.89)},
}
PAPERS = {k: v['sheet'] for k, v in KINDS.items() if v['order'] == 'saddle'}   # 중철 종이 — notebook 의 booklet_paper
WIRE_SIZES = ('A5', 'A4')                                                      # 와이어 책 크기 — notebook 의 wire_size
PDF_PT = {k: v['pt'] for k, v in KINDS.items()}
PAGE_OPEN = '<div class="page">'


def _num(v, digits):
    return ('%.*f' % (digits, v)).rstrip('0').rstrip('.')


def _spec(kind):
    if kind not in tuple(KINDS):
        raise SystemExit('!! 소책자 꼴을 모릅니다: %s' % (kind,))
    return KINDS[kind]


def scale(kind):
    """종이 한 면의 한 칸에 A4 세로 한 쪽이 들어가는 배율 — 두 쪽 꼴 A4 종이 0.70707 · A3 종이 1 · 한 쪽 꼴 1."""
    sp = _spec(kind)
    sw, sh = sp['sheet']
    return min(sw / sp['per'] / PAGE_W_MM, sh / PAGE_H_MM)


def sides(n):
    """중철 — n 쪽 → 종이 면 차례 [(왼쪽 쪽, 오른쪽 쪽)] · 4의 배수로 채운 빈 쪽은 None. 왼쪽 면은 늘 짝수 쪽."""
    total = max(4, int(math.ceil(n / 4.0)) * 4)
    out = []
    for s in range(total // 4):
        for a, b in ((total - 2 * s, 1 + 2 * s), (2 + 2 * s, total - 1 - 2 * s)):
            out.append(tuple(x if x <= n else None for x in (a, b)))
    return out


def cut_stack(n):
    """와이어 A5 — 다 찍어 가운데를 잘라 겹치는 차례(머리 주석). [(왼쪽 쪽, 오른쪽 쪽)] · 없는 쪽은 None."""
    leaves = max(1, int(math.ceil(n / 2.0)))
    sheets = int(math.ceil(leaves / 2.0))
    out = []
    for i in range(sheets):
        for a, b in ((2 * i + 1, 2 * (sheets + i) + 1), (2 * (sheets + i) + 2, 2 * i + 2)):
            out.append(tuple(x if x <= n else None for x in (a, b)))
    return out


def impose(n, kind):
    """꼴에 따른 종이 면 차례 — 면마다 쪽 번호 튜플(두 쪽 꼴은 둘 · 한 쪽 꼴은 하나)."""
    order = _spec(kind)['order']
    if order == 'saddle':
        return sides(n)
    if order == 'cut':
        return cut_stack(n)
    return [(p,) for p in range(1, n + 1)] + ([(None,)] if n % 2 else [])


def split_pages(html):
    """인쇄본 HTML → (첫 쪽 앞까지, [쪽 HTML], </body> 부터). 쪽은 <body> 바로 아래 <div class="page"> 들이 차례로 붙어 있다
    (render · dictation 의 build_final_html). 본문 글은 esc 를 거쳐 이 글자 줄이 본문 안에 나올 수 없다."""
    i = html.find(PAGE_OPEN)
    j = html.rfind('</body>')
    if i < 0 or j < i:
        raise SystemExit('!! 인쇄본에서 쪽을 찾지 못해 소책자를 만들 수 없습니다')
    return html[:i], [PAGE_OPEN + p for p in html[i:j].split(PAGE_OPEN)[1:]], html[j:]


def booklet_html(html, kind='A4', inner_mm=0):
    """인쇄본 HTML → (소책자 HTML, 쪽 수, 면 수). inner_mm = 제본 여백(왼쪽에 더) — 짝수 쪽은 그만큼 왼쪽으로 옮긴다."""
    sp = _spec(kind)
    head, pages, tail = split_pages(html)
    if '</head>' not in head:
        raise SystemExit('!! 인쇄본의 머리(head)를 찾지 못해 소책자를 만들 수 없습니다')
    sw, sh = sp['sheet']
    k = _num(scale(kind), 5)
    css = ['@page { size: %s; margin: 0; }' % sp['page'],          # 인쇄본의 @page(A4 세로)를 뒤에서 덮는다
           '.sheet { position:relative; width:%smm; height:%smm; display:flex; overflow:hidden; background:#fff;'
           ' break-after:page; page-break-after:always; }' % (_num(sw, 2), _num(sh, 2)),
           '.sheet:last-child { break-after:auto; page-break-after:auto; }',
           '.slot { flex:none; width:%smm; height:%smm; overflow:hidden; }' % (_num(sw / sp['per'], 2), _num(sh, 2)),
           '.slot > .page { transform-origin:0 0; transform:scale(%s); margin:0;'
           ' break-after:auto !important; page-break-after:auto !important; }' % k]
    if inner_mm:
        css.append('.slot.even > .page { transform:scale(%s) translateX(-%smm); }' % (k, _num(inner_mm, 2)))
    if sp['order'] == 'cut':     # 가운데 자를 자리 — 위아래 끝에서 3mm 안쪽에 짧은 금(두 쪽 사이 빈 띠라 글에 안 닿는다)
        # z-index:1 — 쪽(.page)은 흰 바탕에 transform 이라 저마다 따로 쌓여, 앞에 그린 위 금(::before)이 오른쪽 쪽 밑에 깔려 안 찍혔다
        # (2026-11-16 검토 · 아래 금 ::after 만 보였다). 금은 두 쪽 사이 빈 띠(바깥 여백 13mm × 0.707)라 글을 덮지 않는다.
        css.append('.sheet::before, .sheet::after { content:""; position:absolute; z-index:1; left:50%; width:0; height:5mm;'
                   ' border-left:0.4pt solid #999; }')
        css.append('.sheet::before { top:3mm; } .sheet::after { bottom:3mm; }')
    body = []
    for nos in impose(len(pages), kind):
        slots = ''.join('<div class="slot %s">%s</div>' % ('blank' if not no else ('even' if no % 2 == 0 else 'odd'),
                                                            pages[no - 1] if no else '')
                        for no in nos)
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


def check_pdf(path, kind, want_sides):
    """면 수 · 종이 크기가 맞나 — 틀리면 멈춘다(SystemExit). 쪽을 하나도 읽지 못하면(크롬이 쓰는 꼴이 바뀜) False — 부른 쪽이 알린다."""
    n, boxes = pdf_sides(path)
    if not n and not boxes:
        return False
    w, h = PDF_PT[kind]
    bad = [b for b in boxes if abs(b[0] - w) > 2 or abs(b[1] - h) > 2]
    if n != want_sides or len(boxes) != want_sides or bad:
        raise SystemExit('!! 소책자 PDF 가 어긋났습니다(면 %d · 바라는 것 %d · 크기 %s) — 인쇄하지 마세요'
                         % (n, want_sides, sorted(set(bad))[:2] or '맞음'))
    return True


def make(html_path, pdf_path, chrome, kind='A4', inner_mm=0):
    """인쇄본 HTML(자체 확인을 통과한 것) → 소책자 PDF. (쪽 수, 면 수, 확인했나)를 돌려준다.
    크롬 부름은 generate._chrome 이다 — 화면(notebook)이 멈추기 · 시간 넘김을 아는 것으로 바꿔 끼운다."""
    with io.open(html_path, encoding='utf-8') as f:
        out, n_pages, n_sides = booklet_html(f.read(), kind, inner_mm)
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
    return n_pages, n_sides, check_pdf(pdf_path, kind, n_sides)
