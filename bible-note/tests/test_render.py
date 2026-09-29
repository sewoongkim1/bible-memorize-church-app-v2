# -*- coding: utf-8 -*-
import os
import re
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import render
from render import (
    all_font_urls, base_css, build_draft_html, build_final_html, esc,
    footer_texts, lines_per_page, num_col_css, num_digits, orig_width_mm,
    page_css, usable_body_mm, write_width_mm,
)


def _v(verse, lines=1, subtitle=None, body='본문', **extra):
    d = {'book': '유다서', 'chapter': 1, 'verse': verse,
         'subtitle': subtitle, 'body': body, 'lines': lines}
    d.update(extra)
    return d


def test_usable_body_mm_is_164():
    assert usable_body_mm() == 164


def test_lines_per_page_is_17():
    assert lines_per_page() == 17


def test_column_widths():
    assert orig_width_mm() == 135.5
    assert write_width_mm() == 135.5


def test_esc_handles_none_and_empty():
    assert esc(None) == ''
    assert esc('') == ''
    assert esc('A&B') == 'A&amp;B'


def test_draft_html_has_data_attributes_for_each_verse():
    # data-pt(조각 번호)가 더해졌다(Task 9) — 같은 절의 두 조각이 한 키로 겹치지 않게.
    html = build_draft_html([
        _v(1, subtitle='인사', body='예수 그리스도의'),
        _v(2, body='긍휼과 평강과'),
    ])
    assert 'data-ch="1" data-vs="1" data-pt="0" data-role="sub"' in html
    assert 'data-ch="1" data-vs="1" data-pt="0" data-role="body"' in html
    assert 'data-ch="1" data-vs="2" data-pt="0" data-role="body"' in html
    assert 'data-ch="1" data-vs="2" data-pt="0" data-role="sub"' not in html
    assert '예수 그리스도의' in html
    assert '인사' in html


def test_draft_html_part_attribute_keeps_two_pieces_of_one_verse_apart():
    html = build_draft_html([
        _v(9, chapter=5, body='그 사람이 곧 나아서', label='9', part=0),
        _v(9, chapter=5, body='이 날은 안식일이니', label='', part=1),
    ])
    assert 'data-ch="5" data-vs="9" data-pt="0" data-role="body"' in html
    assert 'data-ch="5" data-vs="9" data-pt="1" data-role="body"' in html


def test_draft_html_roles_head_chap_sub_body():
    html = build_draft_html([_v(1, book='시편', heading='제일권', chapter_start=True,
                                subtitle='소제목', body='복 있는 사람은', label='1', part=0)])
    for role in ('head', 'chap', 'sub', 'body'):
        assert 'data-ch="1" data-vs="1" data-pt="0" data-role="%s"' % role in html
    assert '>제일권</div>' in html
    assert '>1편</div>' in html


def test_draft_html_has_no_page_elements():
    assert 'class="page"' not in build_draft_html([_v(1)])


def test_draft_and_final_share_orig_col_rule():
    # 실측(1차)과 인쇄(2차)의 원문 열 폭·안쪽 여백이 같은 CSS 규칙 하나에서 나와야
    # 줄바꿈 지점이 같다. 2차에서 인라인 style 로 폭을 따로 주면 이 약속이 깨진다.
    draft = build_draft_html([_v(1)])
    final = build_final_html([[_v(1)]], '유다서')
    assert '.orig-col { width:135.5mm; padding-right:4mm; }' in base_css()
    assert base_css() in draft
    assert base_css() in final
    assert 'class="orig-col" style=' not in final


def _css_rules(html):
    """HTML 의 <style> 안 규칙들 → [(선택자 목록, 선언 목록)]. 공백 차이는 없앤다.
    @media 안 규칙도 한 겹으로 펼쳐 나온다(선택자에 { 가 없는 가장 안쪽 블록만 잡는다)."""
    css = ''.join(re.findall(r'<style>(.*?)</style>', html, re.S))
    rules = []
    for sel, body in re.findall(r'([^{}]+)\{([^{}]*)\}', css):
        sels = tuple(s.strip() for s in sel.split(','))
        decls = tuple(d.strip() for d in body.split(';') if d.strip())
        rules.append((sels, decls))
    return rules


def _orig_col_rules(html):
    return {r for r in _css_rules(html) if any('.orig-col' in s for s in r[0])}


# 2차에만 있어도 되는 원문 열 규칙의 속성 — 쪽 틀(flex 한 칸 · 넘침 자르기)뿐이다.
# 폭·여백·자간·글씨·줄 높이가 여기 들어오면 1차(실측)와 2차(인쇄)의 줄바꿈이 갈린다.
PAGE_ONLY_ORIG_COL_PROPS = {'flex', 'overflow'}


def _final_only_orig_col_rules(draft, final):
    return _orig_col_rules(final) - _orig_col_rules(draft)


def test_final_orig_col_rules_are_the_draft_rules():
    # 2026-09-22 최종 검토 r5 Minor 9(r2 Minor 6) — 예전 테스트는 규칙이 「있는지」만 보고
    # page_css 의 첫 .orig-col 하나만 봤다. 이제 .orig-col 을 선택자에 가진 규칙을 모두 뽑아
    # 1차 규칙이 2차에 그대로 있고, 2차에만 있는 원문 열 규칙은 쪽 틀뿐인 것을 본다.
    verses = [_v(1, subtitle='인사', heading='제일권', chapter_start=True, lines=4),
              _v(2, label='2-3', verse_end=3), _v(4, label='', part=1)]
    draft = build_draft_html(verses)
    final = build_final_html([verses], '유다서')
    assert _orig_col_rules(draft) <= _orig_col_rules(final)
    only = _final_only_orig_col_rules(draft, final)
    assert only == {(('.orig-col',), ('flex:0 0 auto', 'overflow:hidden'))}
    for _sels, decls in only:
        assert {d.split(':', 1)[0].strip() for d in decls} <= PAGE_ONLY_ORIG_COL_PROPS
    # 원문 열에는 인라인 style 이 하나도 없다(폭은 공용 규칙 하나가 정한다).
    for page in final.split('<div class="page">')[1:]:
        orig = page.split('<div class="orig-col"', 1)[1].split('<div class="write-col">', 1)[0]
        assert orig.startswith('>'), '원문 열 여는 태그에 속성이 붙었습니다'
        assert 'style=' not in orig


def test_orig_col_rule_check_catches_final_only_width(monkeypatch):
    # 위 검사가 실제로 잡는지 — 2차 전용 CSS 에 원문 열 폭 규칙을 몰래 더하면 걸려야 한다.
    real = render.page_css
    monkeypatch.setattr(render, 'page_css',
                        lambda *a, **k: real(*a, **k) + '.orig-col, .x { width:100mm; }')
    verses = [_v(1)]
    only = _final_only_orig_col_rules(build_draft_html(verses), build_final_html([verses], '유다서'))
    assert (('.orig-col', '.x'), ('width:100mm',)) in only


def test_page_css_orig_col_has_no_width_or_padding():
    # 인라인 style= 만 막는 위 테스트로는 PAGE_CSS 의 .orig-col 규칙 자체에
    # width·padding 이 섞여 들어가는 것을 못 잡는다 — 섞이면 2차(인쇄)의 원문 열
    # 폭이 1차(실측)와 달라져도 조용히 통과한다(2026-09-22 최종 검토 Minor).
    m = re.search(r'\.orig-col\s*\{([^}]*)\}', page_css())
    assert m, 'page_css() 에 .orig-col 규칙이 없습니다'
    rule = m.group(1)
    assert 'width' not in rule
    assert 'padding' not in rule


def test_final_html_has_one_page_div_per_page():
    html = build_final_html([[_v(1)], [_v(2)]], '유다서')
    assert html.count('class="page"') == 2


def test_final_html_write_col_has_matching_blank_line_count():
    html = build_final_html([[_v(1, lines=3)]], '유다서')
    assert html.count('class="ln"') == 3


def test_final_html_subtitle_line_does_not_add_blank_lines():
    # 소제목 1줄 + 본문 2줄 = lines 3 인데, 필사줄은 본문 몫(2개)만 있어야 한다
    # (소제목은 빈칸이 아니라 원문·필사 양쪽에 그대로 굵게 반복된다)
    html = build_final_html([[_v(1, lines=3, subtitle='인사')]], '유다서')
    assert html.count('class="ln"') == 2
    assert html.count('인사') == 2  # 원문 열 한 번 + 필사 열 한 번


def test_final_html_two_line_subtitle_keeps_rows_aligned():
    # 긴 소제목이 원문 열에서 2줄이면, 필사 열(더 넓다)에서 1줄로 끝나더라도
    # 높이를 2줄(19mm)로 못박아야 아래 필사줄이 원문 줄과 같은 높이에서 시작한다.
    html = build_final_html([[_v(19, lines=5, sub_lines=2,
                                 subtitle='세례 요한의 증언(막 1:7-8; 눅 3:15-17)')]], '요한복음')
    assert html.count('class="ln"') == 3
    assert '<div class="sub" style="height:19mm">' in html


def test_final_html_header_shows_verse_range():
    html = build_final_html([[_v(6), _v(7)]], '유다서')
    assert '유다서 1:6 ~ 1:7' in html


def test_final_html_header_single_verse_page_shows_once():
    # 절 하나뿐인 쪽은 「룻기 1:22 ~ 1:22」가 아니라 「룻기 1:22」 하나만 쓴다
    # (2026-09-22 최종 검토 Minor).
    html = build_final_html([[_v(22)]], '룻기')
    assert '룻기 1:22' in html
    assert '~ 1:22' not in html


def test_final_html_page_numbers_increment():
    html = build_final_html([[_v(1)], [_v(2)]], '유다서')
    assert '<span class="fr pg">1 / 2</span>' in html
    assert '<span class="fr pg">2 / 2</span>' in html


def test_final_html_prints_a4_landscape():
    html = build_final_html([[_v(1)]], '유다서')
    assert '@page { size: A4 landscape; margin: 0; }' in html


def test_final_html_has_font_warning_banner():
    # 파일만 옮겨져 fonts/ 가 없으면(담당자에게 보내기·USB·다른 폴더 --out) 서체가
    # 조용히 대체 서체로 바뀐다 — 화면에 경고가 뜨게 한다(2026-09-22 최종 검토 Important 2).
    html = build_final_html([[_v(1)]], '유다서')
    assert 'id="font-warn"' in html
    assert 'document.fonts.ready' in html
    # verify.py 가 따로 심는 document.fonts.ready 콜백과 document.title 을 두고
    # 다투면 안 되므로, 이 배너는 title 을 건드리지 않는다.
    assert 'document.title' not in html


def test_draft_html_has_no_font_warning_banner():
    # 1차(실측용)는 브라우저에서 곧바로 지워지는 임시 파일이라 경고가 필요 없다.
    assert 'id="font-warn"' not in build_draft_html([_v(1)])


def test_verse_number_and_text_are_separate():
    # 번호와 본문을 따로 둬야 본문이 다음 줄로 넘어갈 때 번호 칸만큼 비울 수 있다
    draft = build_draft_html([_v(1, body='예수 그리스도의')])
    final = build_final_html([[_v(1, body='예수 그리스도의')]], '유다서')
    for html in (draft, final):
        assert '<span class="num">1.</span><span class="txt">예수 그리스도의</span>' in html


def test_num_digits():
    assert num_digits([_v(1), _v(9)]) == 1
    assert num_digits([_v(1), _v(25)]) == 2
    assert num_digits([_v(99), _v(176)]) == 3


def test_num_col_css_follows_digits():
    assert '2ch' in num_col_css(2)
    assert '3ch' in num_col_css(3)
    assert num_col_css(2) != num_col_css(3)


def test_draft_and_final_share_num_col_rule():
    # 1차·2차의 번호 칸 폭이 다르면 줄바꿈이 달라진다 — 같은 절 목록이면 같은 규칙이어야 한다.
    # 2차는 쪽마다가 아니라 전체 절로 계산한다(둘째 쪽에만 두 자리 번호가 있어도 첫 쪽도 두 자리 폭).
    verses = [_v(9), _v(10)]
    rule = num_col_css(2)
    assert rule in build_draft_html(verses)
    assert rule in build_final_html([[verses[0]], [verses[1]]], '유다서')


def test_hanging_indent_css():
    assert '.orig-col p { display:flex; }' in base_css()
    assert '.orig-col .txt { flex:1 1 auto; min-width:0; }' in base_css()


def test_footer_has_top_rule():
    ft = page_css().split('.ft {')[1].split('}')[0]
    assert 'border-top:0.75pt solid #333' in ft


def test_footer_css_is_grid_with_three_columns():
    ft = page_css().split('.ft {')[1].split('}')[0]
    assert 'display:grid' in ft
    assert 'grid-template-columns:1fr auto 1fr' in ft


# ── ① 날짜 칸 ──────────────────────────────────────────────────────────

def test_date_field_markup_has_no_underscore_and_three_blanks():
    html = build_final_html([[_v(1)]], '유다서')
    m = re.search(r'<span class="date">.*?</span></div>', html)
    assert m, 'date span not found'
    date_html = m.group(0)
    assert '_' not in date_html
    assert ('<span class="date"><span class="blank by"></span>년'
            '<span class="blank bm"></span>월<span class="blank bd"></span>일</span>') in date_html


def test_date_blank_css_widths():
    css = page_css()
    assert '.hd .date .blank { display:inline-block; }' in css
    assert '.hd .date .by { width:20mm; }' in css
    assert '.hd .date .bm, .hd .date .bd { width:12mm; }' in css


# ── ② 바닥글 세 칸 ──────────────────────────────────────────────────────

def test_footer_texts_default():
    fl, fc, fr = footer_texts(1, 2)
    assert fl == 'God is Love'
    assert fc == '주의 말씀은 내 발에 등이요 내 길에 빛이니이다'
    assert fr == '1 / 2'


def test_footer_texts_even_page_uses_english_center():
    fl, fc, fr = footer_texts(2, 2)
    assert fc == 'Your word is a lamp to my feet and a light for my path.'
    assert fr == '2 / 2'


def test_footer_texts_even_falls_back_to_korean_when_center_even_blank(monkeypatch):
    monkeypatch.setattr(render, 'FOOTER_CENTER_EVEN', '')
    fl, fc, fr = render.footer_texts(2, 2)
    assert fc == render.FOOTER_CENTER


def test_footer_texts_replace_handles_literal_braces(monkeypatch):
    # str.format 이 아니라 str.replace 를 쓴다 — 사람이 넣은 글에 { 가 있어도 깨지지 않는다.
    monkeypatch.setattr(render, 'FOOTER_RIGHT', '{page}/{total} {안내}')
    fl, fc, fr = render.footer_texts(1, 3)
    assert fr == '1/3 {안내}'


def test_footer_markup_has_three_spans():
    html = build_final_html([[_v(1)]], '유다서')
    assert '<div class="ft"><span class="fl">God is Love</span>' in html
    assert '<span class="fc">주의 말씀은 내 발에 등이요 내 길에 빛이니이다</span>' in html
    assert '<span class="fr pg">1 / 1</span></div>' in html


def test_footer_texts_are_escaped_in_html(monkeypatch):
    monkeypatch.setattr(render, 'FOOTER_LEFT', 'A&B')
    monkeypatch.setattr(render, 'FOOTER_CENTER', '<x>')
    html = build_final_html([[_v(1)]], '유다서')
    assert 'A&amp;B' in html
    assert '&lt;x&gt;' in html
    assert '<x>' not in html


# ── ⑤ 머리글·바닥글 글씨 설정 ──────────────────────────────────────────

def test_header_and_footer_font_sizes_default():
    css = page_css()
    hd = css.split('.hd {')[1].split('}')[0]
    ft = css.split('.ft {')[1].split('}')[0]
    assert 'font-size:11pt' in hd
    assert 'font-size:9pt' in ft
    assert 'NSKH' not in css


def test_header_and_footer_font_sizes_configurable(monkeypatch):
    monkeypatch.setattr(render, 'HEADER_PT', 14)
    monkeypatch.setattr(render, 'FOOTER_PT', 10)
    css = page_css()
    hd = css.split('.hd {')[1].split('}')[0]
    ft = css.split('.ft {')[1].split('}')[0]
    assert 'font-size:14pt' in hd
    assert 'font-size:10pt' in ft


def test_header_font_url_adds_face_only_to_page_css(monkeypatch):
    monkeypatch.setattr(render, 'HEADER_FONT_URL',
                         {'fonts/GowunDodum-400.woff': 'https://example.com/x.woff'})
    css = page_css()
    assert "@font-face { font-family:'NSKH';" in css
    assert "'fonts/GowunDodum-400.woff'" in css
    assert "font-family:'NSKH','NSK',serif" in css
    # 1차(실측) HTML은 page_css() 를 아예 쓰지 않으므로 자동으로 NSKH 가 빠진다.
    draft = build_draft_html([_v(1)])
    assert 'NSKH' not in draft
    final = build_final_html([[_v(1)]], '유다서')
    assert 'NSKH' in final


def test_header_font_url_default_is_empty():
    assert render.HEADER_FONT_URL == {}


def test_all_font_urls_merges_header_font(monkeypatch):
    monkeypatch.setattr(render, 'HEADER_FONT_URL', {'fonts/X.woff': 'https://x'})
    urls = render.all_font_urls()
    assert 'fonts/X.woff' in urls
    for k in render.FONT_URL:
        assert k in urls


def test_all_font_urls_rejects_more_than_one_header_font(monkeypatch):
    monkeypatch.setattr(render, 'HEADER_FONT_URL', {'a.woff': 'x', 'b.woff': 'y'})
    with pytest.raises(ValueError):
        render.all_font_urls()


# ── ⑥ 원문 자간 설정 ────────────────────────────────────────────────────

def test_letter_spacing_default_is_zero():
    assert 'letter-spacing:0em' in base_css()


def test_letter_spacing_is_configurable(monkeypatch):
    monkeypatch.setattr(render, 'LETTER_SPACING_EM', -0.03)
    assert 'letter-spacing:-0.03em' in base_css()
    draft = build_draft_html([_v(1)])
    final = build_final_html([[_v(1)]], '유다서')
    assert 'letter-spacing:-0.03em' in draft
    assert 'letter-spacing:-0.03em' in final


# ── Task 9: 끊긴 조각 · 합쳐진 절 · 권 제목 · 장 표시 ─────────────────────

def _orig_and_write(html):
    """최종 HTML 첫 쪽의 원문 열 · 필사 열 안쪽."""
    orig = html.split('<div class="orig-col">', 1)[1].split('<div class="write-col">', 1)[0]
    write = html.split('<div class="write-col">', 1)[1].split('<div class="ft">', 1)[0]
    return orig, write


def test_continuation_piece_has_empty_number_cell():
    # 끊긴 조각은 번호 칸을 비운다 — 칸 폭은 그대로라 본문이 앞 절 글자와 줄을 맞춘다.
    piece = _v(9, body='이 날은 안식일이니', label='', part=1)
    for html in (build_draft_html([piece]), build_final_html([[piece]], '요한복음')):
        assert '<span class="num"></span><span class="txt">이 날은 안식일이니</span>' in html


def test_merged_verse_number_shows_range():
    piece = _v(1, body='내가 그리스도 안에서', label='1-2', verse_end=2)
    for html in (build_draft_html([piece]), build_final_html([[piece]], '로마서')):
        assert '<span class="num">1-2.</span><span class="txt">내가 그리스도 안에서</span>' in html


def test_num_digits_follows_longest_label():
    assert num_digits([_v(9, label='9'), _v(10, label='10-11', verse_end=11)]) == 5
    assert num_digits([_v(9, label='9'), _v(9, label='', part=1)]) == 1
    # label 이 없는 dict(예전 꼴)는 절 번호로 센다
    assert num_digits([_v(99), _v(176)]) == 3


def test_num_col_width_follows_merged_label_in_both_passes():
    verses = [_v(9, label='9'), _v(10, label='10-11', verse_end=11)]
    rule = num_col_css(5)
    assert rule in build_draft_html(verses)
    assert rule in build_final_html([[verses[0]], [verses[1]]], '예레미야')


def test_chapter_unit():
    assert render.chapter_unit('시편') == '편'
    assert render.chapter_unit('요한복음') == '장'
    assert render.chapter_unit('유다서') == '장'


def test_chapter_mark_on_first_piece_both_sides():
    html = build_final_html([[_v(1, lines=3, chapter_start=True), _v(2)]], '유다서')
    orig, write = _orig_and_write(html)
    assert orig.startswith('<div class="chap">1장</div>')
    assert write.startswith('<div class="chap" style="height:9.5mm">1장</div>')
    assert html.count('class="chap"') == 2
    # 장 표시 1줄은 필사줄이 아니다 — 첫 조각 3줄 중 본문 몫 2줄 + 둘째 조각 1줄
    assert html.count('class="ln"') == 3


def test_chapter_mark_psalm_uses_pyeon():
    html = build_final_html([[_v(1, book='시편', lines=2, chapter_start=True)]], '시편')
    assert '<div class="chap">1편</div>' in html
    assert '1장' not in html


def test_chapter_mark_height_pinned_to_measured_lines():
    html = build_final_html([[_v(1, lines=4, chapter_start=True, chap_lines=2)]], '유다서')
    assert '<div class="chap" style="height:19mm">1장</div>' in html
    assert html.count('class="ln"') == 2


def test_no_chapter_mark_without_chapter_start():
    html = build_final_html([[_v(1, lines=2)]], '유다서')
    assert 'class="chap"' not in html
    assert html.count('class="ln"') == 2


def test_second_chapter_first_page_shows_2jang():
    pages = [[_v(1, chapter=1, chapter_start=True, lines=2), _v(2, chapter=1)],
             [_v(1, chapter=2, chapter_start=True, lines=2), _v(2, chapter=2)]]
    html = build_final_html(pages, '룻기')
    first_page, second_page = html.split('<div class="page">')[1:3]
    assert '<div class="chap">1장</div>' in first_page
    assert '<div class="chap">2장</div>' in second_page
    assert '2장' not in first_page


def test_book_heading_both_sides_with_pinned_height():
    html = build_final_html([[_v(1, book='시편', lines=5, heading='제일권', head_lines=1,
                                 chapter_start=True, chap_lines=1)]], '시편')
    orig, write = _orig_and_write(html)
    assert '<div class="head">제일권</div>' in orig
    assert '<div class="head" style="height:9.5mm">제일권</div>' in write
    # 5줄 = 권 제목 1 + 장 표시 1 + 본문 3
    assert html.count('class="ln"') == 3


def test_heading_above_chapter_mark_above_subtitle_above_body():
    piece = _v(1, book='시편', lines=6, heading='제이권', chapter_start=True,
               subtitle='고라 자손의 마스길', sub_lines=1)
    orig, write = _orig_and_write(build_final_html([[piece]], '시편'))
    for side, body_mark in ((orig, '<p>'), (write, 'class="vs-write"')):
        pos = [side.index(s) for s in ('class="head"', 'class="chap"', 'class="sub"', body_mark)]
        assert pos == sorted(pos), side
    draft = build_draft_html([piece])
    pos = [draft.index('data-role="%s"' % r) for r in ('head', 'chap', 'sub', 'body')]
    assert pos == sorted(pos)
    # 본문 몫 필사줄 = 6 - 권 제목 1 - 장 표시 1 - 소제목 1
    assert build_final_html([[piece]], '시편').count('class="ln"') == 3


def test_continuation_piece_with_subtitle_keeps_subtitle_above_body():
    piece = _v(36, lines=3, part=1, label='', subtitle='그들이 예수를 믿지 아니하다',
               sub_lines=1, body='예수께서 이 말씀을 하시고')
    html = build_final_html([[piece]], '요한복음')
    orig, write = _orig_and_write(html)
    assert orig.index('class="sub"') < orig.index('<span class="num"></span>')
    assert html.count('class="ln"') == 2


def test_head_and_chap_css_shared_by_both_passes():
    css = base_css()
    assert ".orig-col .head, .write-col .head { text-align:center; font-family:'NSKB',serif;" in css
    # 권 제목·장 표시는 소제목과 같은 글씨 크기·줄 높이를 쓴다(같은 규칙에 함께 든다)
    m = re.search(r'([^{}]*)\{\s*font-size:12pt; line-height:9\.5mm;', css)
    assert m, 'font-size 규칙을 못 찾았습니다'
    selectors = m.group(1)
    for sel in ('.orig-col .head', '.write-col .head', '.orig-col .chap', '.write-col .chap',
                '.orig-col .sub', '.write-col .sub'):
        assert sel in selectors
    bold = re.search(r"([^{}]*)\{ font-family:'NSKB',serif; font-weight:400; \}", css)
    assert bold
    for sel in ('.orig-col .chap', '.write-col .chap', '.orig-col .sub', '.write-col .sub'):
        assert sel in bold.group(1)


def test_chap_css_is_left_aligned():
    assert '.orig-col .chap, .write-col .chap { text-align:left; }' in base_css()


def test_header_range_uses_verse_end_of_last_merged_piece():
    html = build_final_html([[_v(1, chapter=9, label='1-2', verse_end=2)]], '로마서')
    assert '로마서 9:1 ~ 9:2' in html


def test_header_range_ends_at_merged_verse_end_on_multi_piece_page():
    html = build_final_html([[_v(3, chapter=24, label='3', verse_end=None),
                              _v(4, chapter=24, label='4-5', verse_end=5)]], '에스겔')
    assert '에스겔 24:3 ~ 24:5' in html


def test_header_single_verse_page_rule_unchanged_for_two_pieces_of_one_verse():
    # 한 절의 두 조각뿐인 쪽 — 「요한복음 5:9」 하나만(한 절뿐인 쪽 규칙 그대로).
    html = build_final_html([[_v(9, chapter=5, label='9', part=0),
                              _v(9, chapter=5, label='', part=1)]], '요한복음')
    assert '요한복음 5:9' in html
    assert '~ 5:9' not in html


# ── Task 9: 바닥글 서체 · 내 PC 서체(로컬 파일) ───────────────────────────

def test_footer_font_url_default_is_empty():
    assert render.FOOTER_FONT_URL == {}
    assert 'NSKF' not in page_css()
    assert 'NSKF' not in build_final_html([[_v(1)]], '유다서')


def test_footer_font_url_adds_face_only_to_page_css(monkeypatch):
    monkeypatch.setattr(render, 'FOOTER_FONT_URL',
                         {'fonts/Footer-400.woff2': 'https://example.com/f.woff2'})
    css = page_css()
    assert ("@font-face { font-family:'NSKF'; src:url('fonts/Footer-400.woff2') format('woff2');"
            in css)
    ft = css.split('.ft {')[1].split('}')[0]
    assert "font-family:'NSKF','NSK',serif;" in ft
    assert 'NSKF' not in build_draft_html([_v(1)])
    assert 'NSKF' in build_final_html([[_v(1)]], '유다서')


def test_all_font_urls_includes_footer_font(monkeypatch):
    monkeypatch.setattr(render, 'FOOTER_FONT_URL', {'fonts/F.woff': 'https://f'})
    urls = render.all_font_urls()
    assert urls['fonts/F.woff'] == 'https://f'
    for k in render.FONT_URL:
        assert k in urls


def test_all_font_urls_rejects_more_than_one_footer_font(monkeypatch):
    monkeypatch.setattr(render, 'FOOTER_FONT_URL', {'a.woff': 'x', 'b.woff': 'y'})
    with pytest.raises(ValueError):
        render.all_font_urls()


def test_all_font_urls_same_file_for_header_and_footer_listed_once(monkeypatch):
    monkeypatch.setattr(render, 'HEADER_FONT_URL', {'fonts/BMJUA_ttf.ttf': ''})
    monkeypatch.setattr(render, 'FOOTER_FONT_URL', {'fonts/BMJUA_ttf.ttf': ''})
    urls = render.all_font_urls()
    assert list(urls).count('fonts/BMJUA_ttf.ttf') == 1
    assert len(urls) == len(render.FONT_URL) + 1


def test_all_font_urls_rejects_same_file_with_different_urls(monkeypatch):
    monkeypatch.setattr(render, 'HEADER_FONT_URL', {'fonts/X.woff': 'https://a'})
    monkeypatch.setattr(render, 'FOOTER_FONT_URL', {'fonts/X.woff': 'https://b'})
    with pytest.raises(ValueError):
        render.all_font_urls()


def test_header_and_footer_fonts_share_one_helper(monkeypatch):
    # 머리글·바닥글이 같은 도우미로 만든다 — 같은 파일을 주면 이름만 다르고 모양이 같다.
    monkeypatch.setattr(render, 'HEADER_FONT_URL', {'fonts/BMJUA_ttf.ttf': ''})
    monkeypatch.setattr(render, 'FOOTER_FONT_URL', {'fonts/BMJUA_ttf.ttf': ''})
    css = page_css()
    faces = re.findall(
        r"@font-face \{ font-family:'(NSK[HF])'; src:url\('([^']*)'\) format\('([^']*)'\);", css)
    assert sorted(faces) == [('NSKF', 'fonts/BMJUA_ttf.ttf', 'truetype'),
                             ('NSKH', 'fonts/BMJUA_ttf.ttf', 'truetype')]


def test_font_format_follows_extension():
    assert render.font_format('fonts/a.woff') == 'woff'
    assert render.font_format('fonts/a.woff2') == 'woff2'
    assert render.font_format('fonts/a.ttf') == 'truetype'
    assert render.font_format('fonts/A.TTF') == 'truetype'
    assert render.font_format('fonts/a.otf') == 'opentype'


def test_font_format_rejects_ttc():
    with pytest.raises(ValueError) as e:
        render.font_format('fonts/batang.ttc')
    assert '.ttc' in str(e.value)
    assert '브라우저' in str(e.value)


def test_font_format_rejects_unknown_extension():
    with pytest.raises(ValueError):
        render.font_format('fonts/a.fon')


def test_local_ttf_header_font_uses_truetype_hint(monkeypatch):
    # 가이드대로 「fonts/ 에 복사하고 {'fonts/파일.ttf': ''}」로 적은 경우 — Task 8 은 format('woff')
    # 를 박아 두어 .ttf 와 맞지 않았다.
    monkeypatch.setattr(render, 'HEADER_FONT_URL', {'fonts/BMJUA_ttf.ttf': ''})
    css = page_css()
    assert "src:url('fonts/BMJUA_ttf.ttf') format('truetype');" in css
    assert "src:url('fonts/BMJUA_ttf.ttf') format('woff')" not in css


def test_ttc_slot_font_is_rejected_everywhere(monkeypatch):
    monkeypatch.setattr(render, 'HEADER_FONT_URL', {'fonts/batang.ttc': ''})
    with pytest.raises(ValueError):
        page_css()
    with pytest.raises(ValueError):
        render.all_font_urls()


# ── 최종 검토 r5 Minor 3~7 ─────────────────────────────────────────────────

def test_font_setting_errors_are_one_kind(monkeypatch):
    # generate.main() 이 서체 설정 오류만 골라 `!! …` 한 줄로 보이도록 한 종류로 낸다(Minor 4).
    assert issubclass(render.FontSettingError, ValueError)
    with pytest.raises(render.FontSettingError):
        render.font_format('fonts/batang.ttc')
    with pytest.raises(render.FontSettingError):
        render.font_format('fonts/a.fon')
    monkeypatch.setattr(render, 'HEADER_FONT_URL', {'fonts/a.woff': 'x', 'fonts/b.woff': 'y'})
    with pytest.raises(render.FontSettingError):
        render.all_font_urls()
    monkeypatch.setattr(render, 'HEADER_FONT_URL', {'fonts/X.woff': 'https://a'})
    monkeypatch.setattr(render, 'FOOTER_FONT_URL', {'fonts/X.woff': 'https://b'})
    with pytest.raises(render.FontSettingError):
        render.all_font_urls()


@pytest.mark.parametrize('key', [
    'C:/Users/나/Fonts/x.ttf',    # 복사하지 않고 제 자리 그대로 적은 것
    'x.ttf',                     # fonts/ 를 빠뜨린 것
    'fonts\\x.ttf',              # 역슬래시 — CSS url() 에서 이스케이프로 읽힌다
    'fonts/sub/x.ttf',           # 옮길 때 fonts/<이름> 으로만 복사된다
    'fonts/',
])
@pytest.mark.parametrize('slot', ['HEADER_FONT_URL', 'FOOTER_FONT_URL'])
def test_local_font_key_must_be_fonts_file_name(monkeypatch, slot, key):
    # 주소가 '' 인 내 PC 서체가 fonts/ 밖이면 ensure_fonts 는 통과하는데 @font-face 는 그 키를,
    # 복사는 fonts/<이름> 을 써서 서체가 안 불린다(Minor 5) — 설정 단계에서 멈춘다.
    monkeypatch.setattr(render, slot, {key: ''})
    for call in (render.all_font_urls, page_css):
        with pytest.raises(render.FontSettingError) as e:
            call()
        msg = str(e.value)
        assert "내 PC 서체는 bible-note\\fonts\\ 에 복사한 뒤 'fonts/파일이름' 으로 적어 주세요" in msg
        assert key in msg


def test_local_font_key_in_fonts_is_accepted(monkeypatch):
    monkeypatch.setattr(render, 'FOOTER_FONT_URL', {'fonts/My Font.ttf': ''})
    assert 'fonts/My Font.ttf' in render.all_font_urls()
    assert "src:url('fonts/My Font.ttf') format('truetype');" in page_css()


def test_font_warning_banner_does_not_name_one_font():
    # 머리글·바닥글 서체도 이 띠를 띄운다 — 「Noto Serif KR」 로 적으면 원인을 잘못 가리킨다.
    assert 'Noto Serif KR' not in render.FONT_WARN_HTML
    assert '서체를 불러오지 못했습니다 — HTML 옆에 fonts 폴더가 있는지 확인하세요' in render.FONT_WARN_HTML


def test_page_css_follows_slot_list(monkeypatch):
    # 서체 자리 목록은 _slot_fonts() 한 벌이다(Minor 3) — page_css 가 손으로 다시 적지 않는다.
    monkeypatch.setattr(render, '_slot_fonts',
                        lambda: [('NSKX', {'fonts/X.woff': ''}, '머리글', 'hd'),
                                 ('NSKF', {}, '바닥글', 'ft')])
    css = page_css()
    assert "@font-face { font-family:'NSKX'; src:url('fonts/X.woff') format('woff');" in css
    assert "font-family:'NSKX','NSK',serif;" in css.split('.hd {')[1].split('}')[0]
    assert 'NSKH' not in css and 'NSKF' not in css


def test_every_slot_gets_face_and_rule(monkeypatch):
    # 목록의 자리마다 얼굴(@font-face)과 그 자리 칸(.<key>)의 font-family 가 함께 실린다 —
    # 자리를 하나 더할 때 CSS 에 자리를 안 만들면 여기서 걸린다.
    real = render._slot_fonts()
    filled = [(f, {'fonts/T%d.woff' % i: ''}, w, k) for i, (f, _u, w, k) in enumerate(real)]
    monkeypatch.setattr(render, '_slot_fonts', lambda: filled)
    css = page_css()
    for family, _urls, _what, key in filled:
        assert "@font-face { font-family:'%s';" % family in css
        block = css.split('.%s {' % key)[1].split('}')[0]
        assert "font-family:'%s','NSK',serif;" % family in block


def _no_footer_text(monkeypatch):
    for name in ('FOOTER_LEFT', 'FOOTER_CENTER', 'FOOTER_CENTER_EVEN', 'FOOTER_RIGHT'):
        monkeypatch.setattr(render, name, '')


def test_footer_font_not_loaded_when_footer_has_no_text(monkeypatch):
    # 바닥글 글이 모두 비면 NSKF 가 쓰이지 않아 unloaded 로 남고, 서체가 멀쩡해도 붉은 띠가
    # 뜨고 verify 가 FONT_NOT_LOADED:NSKF 로 떨어졌다(Minor 6) — 글이 없는 자리 서체는 안 싣는다.
    monkeypatch.setattr(render, 'FOOTER_FONT_URL', {'fonts/My.ttf': ''})
    _no_footer_text(monkeypatch)
    html = build_final_html([[_v(1)], [_v(2)]], '유다서')
    assert 'NSKF' not in html
    assert '<div class="ft"><span class="fl"></span>' in html  # 칸은 그대로 있다


def test_footer_font_kept_when_any_footer_text(monkeypatch):
    monkeypatch.setattr(render, 'FOOTER_FONT_URL', {'fonts/My.ttf': ''})
    _no_footer_text(monkeypatch)
    monkeypatch.setattr(render, 'FOOTER_RIGHT', '{page}')
    html = build_final_html([[_v(1)]], '유다서')
    assert "@font-face { font-family:'NSKF';" in html
    assert "font-family:'NSKF','NSK',serif;" in html


def test_footer_font_follows_texts_actually_printed(monkeypatch):
    # 짝수 쪽 글만 있으면 한 쪽짜리(시편 1편)에는 바닥글 글이 한 글자도 찍히지 않는다.
    monkeypatch.setattr(render, 'FOOTER_FONT_URL', {'fonts/My.ttf': ''})
    _no_footer_text(monkeypatch)
    monkeypatch.setattr(render, 'FOOTER_CENTER_EVEN', 'Your word')
    assert 'NSKF' not in build_final_html([[_v(1)]], '시편')
    assert 'NSKF' in build_final_html([[_v(1)], [_v(2)]], '시편')


def test_header_font_always_loaded_even_without_footer_text(monkeypatch):
    # 머리글은 늘 글(책·절 범위)이 있다 — 바닥글이 비어도 머리글 서체는 싣는다.
    monkeypatch.setattr(render, 'HEADER_FONT_URL', {'fonts/H.woff': ''})
    _no_footer_text(monkeypatch)
    assert "font-family:'NSKH','NSK',serif;" in build_final_html([[_v(1)]], '유다서')


def test_bad_body_lines_message_names_the_piece():
    # 끊긴 절의 두 조각이 같은 「5:9」로 보이지 않게 조각 번호를 적는다(Minor 7).
    piece = _v(9, chapter=5, lines=1, part=1, label='', subtitle='소제목', sub_lines=1)
    with pytest.raises(ValueError) as e:
        build_final_html([[piece]], '요한복음')
    assert '5:9(조각 1)' in str(e.value)
