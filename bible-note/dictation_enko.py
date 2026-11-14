# -*- coding: utf-8 -*-
"""영한 받아쓰기(아래쪽 필사형) — 한 절을 영어(NIV)로, 이어서 같은 절을 한글(개역개정)로(2026-11-14 친구).

    python dictation_enko.py 잠언                       # → 인쇄용/잠언_영한_필사본.html
    python dictation_enko.py 잠언 --chapter 1 --out 인쇄용/잠언_1장_영한.html

받아쓰기 꼴(dictation.py)의 부품 — 실측(measure) · 줄 짜기(build_items) · 쪽 나누기 · 인쇄 규칙 ·
인쇄본 확인 — 을 그대로 빌려 쓰고, **문단 짜기만** 여기서 한다. dictation.py 는 손대지 않는다
(다른 세션이 고치는 중인 파일 · 설정값(글자 크기 · 줄 높이 · 머리글 · 바닥글)은 그쪽 머리를 따른다).

- 절마다 문단 둘: 영어(위첨자 「1」) → 한글(위첨자 「1)」). 절은 늘 새 줄에서 시작한다(이어 쓰지 않는다 · ○ 없음).
- 장 표시 · 소제목은 한글 쪽 것(「1 장」 · 「솔로몬의 잠언」)을 그 절의 영어 문단 위에 — 장 첫머리 소제목은 같은 줄(CHAP_SUB_INLINE).
- 한글이 한 절을 두 줄로 나눈 곳(잠 10:1 · 24:23 — 끊긴 절)은 한 문단으로 잇는다. 한글의 합쳐진 절(롬 9:1-2)은
  영어 9:1 · 9:2 를 한 문단으로(번호는 각각).
- 영어에 없는 절은 한글만 찍고 ⚠ 로 알린다(번역마다 절 나눔이 다를 수 있다). 한글에 없는 영어 절도 ⚠.
"""
import argparse
import io
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import dictation as D
import generate as G
from parse import parse_book, parse_book_en, load_book_file, niv_names_from_filename, SourceTextError
from render import esc, FontSettingError

TITLE_SUFFIX = '영한 필사노트(아래쪽 필사형)'


def _tokens(body, lead, info):
    """dictation.build_paragraphs 와 같은 토큰 — 글자 하나씩 · 첫 글자는 위첨자 번호와 한 덩이."""
    toks = []
    for i, c in enumerate(body):
        if i == 0 and lead:
            toks.append(dict(info, html='<span class="nb">%s%s</span>' % (lead, esc(c)), space=False))
        else:
            toks.append(dict(info, html=esc(c), space=c == ' '))
    return toks


def verse_units(ko_pieces):
    """한글 조각 → 절 묶음 [{'ch','vs','ve','label','heads','body'}] — 끊긴 절(part 1…)은 앞 절에 잇는다."""
    units = []
    for v in ko_pieces:
        heads = []
        if v.get('heading'):
            heads.append(('head', v['heading']))
        if v.get('chapter_start'):
            heads.append(('chap', D._chap_text(v)))
        if v.get('subtitle'):
            heads.append(('sub', v['subtitle']))
        if v.get('part', 0) and units and (units[-1]['ch'], units[-1]['vs']) == (v['chapter'], v['verse']):
            u = units[-1]
            u['heads'] += heads
            u['body'] = (u['body'] + ' ' + v['body'].strip()).strip()
            continue
        units.append({'ch': v['chapter'], 'vs': v['verse'], 've': v.get('verse_end') or v['verse'],
                      'label': v.get('label') or str(v['verse']), 'heads': heads, 'body': v['body'].strip()})
    return units


def build_paragraphs(ko_pieces, en_pieces):
    """절마다 [영어 문단, 한글 문단] — 문단 = {'heads', 'tokens', 'lang'}. (문단들, 영어에 없는 절, 한글에 없는 영어 절)."""
    en = {(p['chapter'], p['verse']): p['body'].strip() for p in en_pieces}
    used, missing, paras = set(), [], []
    for ui, u in enumerate(verse_units(ko_pieces)):
        info = {'ch': u['ch'], 'vs': u['vs'], 've': u['ve']}
        en_toks = []
        for vs in range(u['vs'], u['ve'] + 1):
            body = en.get((u['ch'], vs))
            if not body:
                missing.append('%d:%d' % (u['ch'], vs))
                continue
            used.add((u['ch'], vs))
            if en_toks:
                en_toks.append(dict(info, html=' ', space=True))
            en_toks += _tokens(body, '<sup>%d</sup>' % vs, info)
        heads = u['heads']
        if en_toks:
            paras.append({'heads': heads, 'tokens': en_toks, 'lang': 'en', 'unit': ui})
            heads = []
        paras.append({'heads': heads, 'tokens': _tokens(u['body'], '<sup>%s)</sup>' % esc(u['label']), info),
                      'lang': 'ko', 'unit': ui})
    extra = ['%d:%d' % k for k in sorted(set(en) - used)]
    return paras, missing, extra


def paginate_units(units, cap_mm):
    """절 묶음(영어 줄들 + 한글 줄들 + 그 위 머리 칸)을 한 쪽에 함께 — 영어는 앞 쪽, 한글은 다음 쪽으로 갈라지지 않게.
    한 쪽보다 긴 묶음만 받아쓰기 꼴처럼 줄 단위로 나눈다(머리 칸은 바로 다음 줄과 함께 · dictation.paginate_items)."""
    pages, page, used = [], [], 0.0
    for its in units:
        need = sum(it['mm'] for it in its)
        if need > cap_mm + 1e-6:
            if page:
                pages.append(page)
            split = D.paginate_items(its, cap_mm)
            pages += split[:-1]
            page, used = split[-1], sum(it['mm'] for it in split[-1])
            continue
        if page and used + need > cap_mm + 1e-6:
            pages.append(page)
            page, used = [], 0.0
        page += its
        used += need
    if page:
        pages.append(page)
    return pages


def build_final_html(pages, book):
    total = len(pages)
    return ('<!doctype html><html lang="ko"><head><meta charset="utf-8">'
            '<title>%s %s</title><style>%s%s</style></head><body>%s%s</body></html>'
            % (esc(book), TITLE_SUFFIX, D.text_css('ko'), D.page_css(), D.R.FONT_WARN_HTML,
               ''.join(D._page_html(pg, book, i + 1, total, 'ko') for i, pg in enumerate(pages))))


def build(ko_pieces, en_pieces, book, out_path, chrome):
    for p in D.fonts_used():
        if not os.path.exists(p):
            raise SystemExit('!! 서체 파일이 없습니다 — %s' % p)
    paras, missing, extra = build_paragraphs(ko_pieces, en_pieces)
    # 본문 줄바꿈 + 머리 칸(장 표시 · 소제목) 줄 수를 한 번에 잰다 — 시편 표제처럼 두 줄인 소제목도 그 높이로(dictation.measure · abd9c9b)
    breaks, heads = D.measure(paras, chrome, 'ko')
    units = []
    for pi, p in enumerate(paras):   # 문단마다 그 언어로 줄을 짠다(영어는 낱말 사이 · 한글은 글자 사이를 벌린다)
        if not pi or p['unit'] != paras[pi - 1]['unit']:
            units.append([])
        hd = {(0, hi): n for (pj, hi), n in heads.items() if pj == pi}   # 한 문단씩 부르므로 문단 번호를 0 으로
        units[-1] += D.build_items([p], {0: breaks[pi]}, p['lang'], hd)
    items = [it for u in units for it in u]
    pages = paginate_units(units, D.body_mm())
    D.copy_fonts_beside(out_path)
    with io.open(out_path, 'w', encoding='utf-8') as f:
        f.write(build_final_html(pages, book))
    D.check_final(out_path, chrome, len(pages))
    return len(pages), sum(1 for it in items if it['kind'] == 'line'), missing, extra


def generate(book_name, chapter=None, out_path=None):
    if out_path:
        out_path = os.path.abspath(out_path)
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    if not out_path:
        suffix = '_%d%s' % (chapter, D.chapter_unit(book_name)) if chapter else ''
        out_path = os.path.join('인쇄용', '%s%s_영한_필사본.html' % (book_name, suffix))
    G.ensure_out_path_safe(out_path)
    G.ensure_fonts()
    chrome = G.find_chrome()
    if not chrome:
        raise SystemExit('!! 크롬을 못 찾았습니다 — 헤드리스 실측에 필요합니다.')
    ko = parse_book(load_book_file(G.find_book_file(book_name)), book_name, chapter=chapter)
    path, en_title = G.find_niv_file(book_name)
    en = parse_book_en(load_book_file(path), en_title, chapter=chapter)
    if not ko:
        raise SystemExit('!! "%s"에서 절을 찾지 못했습니다' % book_name)
    n_pages, n_lines, missing, extra = build(ko, en, book_name, out_path, chrome)
    if missing:
        print('⚠ 영어 원문에 없는 절 %d개(한글만 찍음): %s' % (len(missing), ', '.join(missing[:20])))
    if extra:
        print('⚠ 한글 원문에 없는 영어 절 %d개(찍지 않음): %s' % (len(extra), ', '.join(extra[:20])))
    print('완료: %s (%d쪽 · %d절 · 원문 %d줄)' % (out_path, n_pages, G.verse_count(ko), n_lines))
    return out_path


def main():
    ap = argparse.ArgumentParser(description='성경 필사노트(아래쪽 필사형 · 영한) 생성')
    ap.add_argument('book', help='책 이름(예: 잠언)')
    ap.add_argument('--chapter', type=int, default=None, help='특정 장만(예: 1)')
    ap.add_argument('--out', default=None, help='출력 파일명(기본 인쇄용/<책>_영한_필사본.html)')
    args = ap.parse_args()
    try:
        generate(args.book, chapter=args.chapter, out_path=args.out)
    except (FontSettingError, SourceTextError) as e:
        raise SystemExit('!! %s' % e)


if __name__ == '__main__':
    main()
