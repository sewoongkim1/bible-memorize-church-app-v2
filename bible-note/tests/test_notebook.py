# -*- coding: utf-8 -*-
"""만들기 화면(ui.py) · 설정 한 곳(notebook.py) · 아래쪽 필사형(dictation.py)의 크롬 없이 되는 부분.

크롬 실측 · 인쇄본 확인은 손으로 돌린 화면 시험(2026-11-14 · 24 항목)과 시편 전체 세 꼴로 확인했다
(docs/notes/bible-note.md 「만들기 화면」).
"""
import io
import json
import os
import sys

import pytest

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)

import dictation as D  # noqa: E402
import notebook as NB  # noqa: E402
import render as R  # noqa: E402


def _touch(folder, name, text='1:1 x\n'):
    os.makedirs(folder, exist_ok=True)
    with io.open(os.path.join(folder, name), 'w', encoding='utf-8') as f:
        f.write(text)


# ── 번역본 폴더 규칙 ──────────────────────────────────────────────────
def test_scan_books_reads_both_file_name_forms(tmp_path):
    d = str(tmp_path)
    _touch(d, '1-20잠언.txt')
    _touch(d, '2-01마태복음.txt')
    _touch(d, '20-Proverbs (잠언).txt')
    _touch(d, '09-1 Samuel (사무엘상).txt')   # ⚠️ 한글 꼴(숫자-숫자 이름)에도 걸리는 이름
    _touch(d, 'readme.txt')
    books = {b['file']: b for b in NB.scan_books(d)}
    assert set(books) == {'1-20잠언.txt', '2-01마태복음.txt', '20-Proverbs (잠언).txt', '09-1 Samuel (사무엘상).txt'}
    assert books['09-1 Samuel (사무엘상).txt']['fmt'] == 'en'
    assert books['09-1 Samuel (사무엘상).txt']['title'] == '1 Samuel'
    assert books['09-1 Samuel (사무엘상).txt']['name'] == '사무엘상'
    assert books['1-20잠언.txt']['fmt'] == 'ko' and books['1-20잠언.txt']['testament'] == 'old'
    assert books['2-01마태복음.txt']['testament'] == 'new'


def test_translations_folders_info_and_hidden(tmp_path):
    root = str(tmp_path)
    _touch(os.path.join(root, 'NIV'), '20-Proverbs (잠언).txt')
    _touch(os.path.join(root, '개역'), '1-20잠언.txt')
    _touch(os.path.join(root, '_보관'), '1-20잠언.txt')
    _touch(os.path.join(root, '새번역'), '20-Proverbs (잠언).txt')
    with io.open(os.path.join(root, '새번역', '번역본.json'), 'w', encoding='utf-8') as f:
        json.dump({'이름': '새번역 2판', '언어': 'ko'}, f, ensure_ascii=False)
    _touch(root, '1-01창세기.txt')                  # bible/ 바로 아래 파일은 번역본이 아니다
    trs = {t['id']: t for t in NB.translations({'bible_dir': root})}
    assert set(trs) == {'NIV', '개역', '새번역'}
    assert trs['NIV']['lang'] == 'en' and trs['개역']['lang'] == 'ko'
    assert trs['새번역']['name'] == '새번역 2판' and trs['새번역']['lang'] == 'ko'


def test_chapter_count_and_find_book(tmp_path):
    root = str(tmp_path)
    _touch(os.path.join(root, '개역'), '1-20잠언.txt', '잠1:1 <솔로몬의 잠언> 가\n잠1:2 나\n잠31:31 다\n')
    env = {'bible_dir': root}
    assert NB.chapter_count(env, '개역', '1-20잠언.txt') == 31
    with pytest.raises(NB.UserError):
        NB.find_book(env, '개역', '1-99없는책.txt')
    with pytest.raises(NB.UserError):
        NB.find_book(env, '없는번역', '1-20잠언.txt')


# ── 설정 ──────────────────────────────────────────────────────────────
def test_normalize_defaults_and_rejects():
    s = NB.normalize({})
    assert s['layout'] in ('right', 'below') and s['body_font'].startswith('fonts/')
    for bad in ({'font_pt': 99}, {'text_color': 'red'}, {'body_font': 'C:/Windows/Fonts/a.ttf'},
                {'layout': 'up'}, {'range_mode': 'all'}, {'letter_spacing_em': 'x'},
                {'layout': 'below', 'font_pt': 24, 'text_mm': 7}):      # 줄 높이가 글자보다 작다
        with pytest.raises(NB.UserError):
            NB.normalize(bad)
    assert NB.normalize({'ch_from': '3'})['ch_from'] == 3


def test_out_file_name():
    tr, ps, pr = {'name': 'NIV'}, {'name': '시편'}, {'name': '잠언'}
    base = NB.normalize({'layout': 'right'})
    assert NB.out_file_name(dict(base, range_mode='chapter', ch_from=23), tr, ps) == '시편_NIV_23편_오른쪽.html'
    assert NB.out_file_name(dict(base, range_mode='chapters', ch_from=10, ch_to=3, layout='below'), tr, pr) \
        == '잠언_NIV_3-10장_아래쪽.html'
    assert NB.out_file_name(dict(base, out_name='내/노트:1'), tr, pr) == '내_노트_1.html'


def test_preset_keeps_look_only(tmp_path, monkeypatch):
    monkeypatch.setattr(NB, 'PRESET_PATH', str(tmp_path / '설정묶음.json'))
    data = NB.save_preset('큰 글씨', {'font_pt': 18, 'book': '1-20잠언.txt', 'out_name': 'x'})
    assert data['큰 글씨']['font_pt'] == 18
    assert 'book' not in data['큰 글씨'] and 'out_name' not in data['큰 글씨']
    assert NB.delete_preset('큰 글씨') == {}
    with pytest.raises(NB.UserError):
        NB.save_preset('', {})


# ── 오른쪽 필사형에 값 바꿔 넣기(render 는 고치지 않는다) ─────────────
PATCHED = ('FONT_PT', 'LETTER_SPACING_EM', 'LINE_MM', 'ORIG_PCT', 'HEADER_PT', 'DATE_PT', 'CHAP_SUB_INLINE',
           'base_css', '_page_html', 'usable_body_mm', '_avail_width_mm', 'page_css')


def test_patch_right_fonts_color_bind(monkeypatch):
    for name in PATCHED:              # 끝나면 되돌린다(다른 시험이 render 를 쓴다)
        if hasattr(R, name):
            monkeypatch.setattr(R, name, getattr(R, name))
    before = R.usable_body_mm()
    s = NB.normalize({'layout': 'right', 'font_pt': 12, 'body_font': 'fonts/NanumMyeongjo-400.woff',
                      'text_color': '#808080', 'bind_top_mm': 10, 'bind_left_mm': 5})
    NB._patch_right(s)
    css = R.base_css()
    assert "url('fonts/NanumMyeongjo-400.woff') format('woff')" in css
    assert "NotoSerifKR-400" not in css
    assert '.orig-col { color:#808080; }' in css
    assert R.usable_body_mm() == before - 10
    assert 'padding-top:23mm; padding-left:18mm;' in R.page_css()


# ── 아래쪽 필사형 ─────────────────────────────────────────────────────
def _piece(ch, vs, body, **kw):
    p = {'book': '잠언', 'chapter': ch, 'verse': vs, 'subtitle': None, 'body': body, 'part': 0, 'verse_end': None,
         'heading': None, 'label': str(vs), 'chapter_start': False}
    p.update(kw)
    return p


def test_head_blocks_inline_and_separate(monkeypatch):
    p = {'heads': [('head', '제일권'), ('chap', '1 편'), ('sub', '다윗의 시')], 'tokens': []}
    monkeypatch.setattr(D, 'CHAP_SUB_INLINE', True)
    assert D.head_blocks(p) == [('head', '제일권'), ('chap', '1 편<span class="cs">다윗의 시</span>')]
    monkeypatch.setattr(D, 'CHAP_SUB_INLINE', False)
    assert [r for r, _h in D.head_blocks(p)] == ['head', 'chap', 'sub']


def test_paragraphs_marks_and_labels(monkeypatch):
    monkeypatch.setattr(D, 'VERSE_BREAK', True)
    monkeypatch.setattr(D, 'PARA_MARK', '\u25cb')
    paras = D.build_paragraphs([_piece(1, 1, '가나', chapter_start=True), _piece(1, 2, '다라')])
    assert len(paras) == 2                                   # 절마다 줄을 바꾼다
    assert '\u25cb' in paras[0]['tokens'][0]['html']         # ○ 는 진짜 문단 첫머리에만
    assert '\u25cb' not in paras[1]['tokens'][0]['html']
    assert '<sup>2)</sup>' in paras[1]['tokens'][0]['html']
    en = D.build_paragraphs([_piece(1, 1, 'In', chapter_start=True, lang='en', book='Proverbs')])
    assert '<sup>1</sup>' in en[0]['tokens'][0]['html']      # 영어는 「1)」이 아니라 「1」


def test_build_items_old_call_still_works(monkeypatch):
    """dictation_enko.py(다른 세션)가 쓰는 옛 모양 — build_items(paras, breaks, lang) · 머리 칸 한 줄."""
    monkeypatch.setattr(D, 'CHAP_SUB_INLINE', True)
    paras = D.build_paragraphs([_piece(1, 1, '가나다', chapter_start=True, subtitle='솔로몬의 잠언')])
    old = D.build_items(paras, {0: [0]}, 'ko')
    assert [it['kind'] for it in old] == ['chap', 'line'] and old[0]['mm'] == D.HEAD_MM
    new = D.build_items(paras, {0: [0]}, 'ko', {(0, 0): 2})  # 잰 줄 수가 둘이면 두 줄 높이
    assert new[0]['mm'] == D.HEAD_MM * 2


# ── 화면 서버 ─────────────────────────────────────────────────────────
def test_file_url_only_inside_out_dir(tmp_path, monkeypatch):
    import ui
    out = tmp_path / '인쇄용'
    out.mkdir()
    monkeypatch.setattr(NB, 'get_env', lambda: {'out_dir': str(out), 'bible_dir': '', 'chrome': '', 'saved': True})
    url = ui.file_url(str(out / '_미리보기' / '미리보기.html'))
    assert url.startswith('/files/out/') and url.endswith('.html') and '%' in url
    assert ui.file_url(str(tmp_path / '밖.html')) is None
