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
    html = build_draft_html([
        _v(1, subtitle='인사', body='예수 그리스도의'),
        _v(2, body='긍휼과 평강과'),
    ])
    assert 'data-ch="1" data-vs="1" data-role="sub"' in html
    assert 'data-ch="1" data-vs="1" data-role="body"' in html
    assert 'data-ch="1" data-vs="2" data-role="body"' in html
    assert 'data-ch="1" data-vs="2" data-role="sub"' not in html
    assert '예수 그리스도의' in html
    assert '인사' in html


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
