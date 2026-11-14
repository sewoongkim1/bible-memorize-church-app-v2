# -*- coding: utf-8 -*-
"""만들기 화면(ui.py) · 설정 한 곳(notebook.py) · 아래쪽 필사형(dictation.py)의 크롬 없이 되는 부분.

크롬 실측 · 인쇄본 확인은 손으로 돌린 화면 시험(2026-11-14 · Playwright)과 시편 전체 세 꼴로 확인했다
(docs/notes/bible-note.md 「만들기 화면」). 「검토 xx-n」 은 2026-11-14 독립 검토(29건 확정)의 번호다.
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


def test_translations_survive_bad_info_and_odd_language(tmp_path):
    """틀린 번역본.json 하나 · 모르는 「언어」 때문에 목록 전체가 멈추지 않는다(검토 sv-4 · js-2 · nb-5)."""
    root = str(tmp_path)
    _touch(os.path.join(root, 'A'), '20-Proverbs (잠언).txt')
    with io.open(os.path.join(root, 'A', '번역본.json'), 'w', encoding='cp949') as f:
        f.write('{"이름": "깨짐",}')                           # 끝 쉼표 · ANSI 저장
    _touch(os.path.join(root, 'B'), '20-Proverbs (잠언).txt')
    with io.open(os.path.join(root, 'B', '번역본.json'), 'w', encoding='utf-8') as f:
        json.dump({'언어': 'EN'}, f)                           # 대문자도 받는다
    _touch(os.path.join(root, 'C'), '1-20잠언.txt')
    with io.open(os.path.join(root, 'C', '번역본.json'), 'w', encoding='utf-8') as f:
        json.dump({'언어': 'en'}, f)                           # 한글 꼴 파일에는 en 이 안 먹는다
    _touch(os.path.join(root, 'D'), '20-Proverbs (잠언).txt')
    with io.open(os.path.join(root, 'D', '번역본.json'), 'w', encoding='utf-8') as f:
        json.dump({'언어': 'klingon'}, f)
    warnings = []
    trs = {t['id']: t for t in NB.translations({'bible_dir': root}, warnings)}
    assert set(trs) == {'A', 'B', 'C', 'D'}
    assert trs['A']['name'] == 'A' and trs['A']['lang'] == 'en'
    assert trs['B']['lang'] == 'en' and trs['C']['lang'] == 'ko' and trs['D']['lang'] == 'en'
    text = '\n'.join(warnings)
    assert 'A' in text and '번역본.json' in text and 'klingon' in text and '「C」' in text


def test_chapter_count_and_find_book(tmp_path):
    root = str(tmp_path)
    _touch(os.path.join(root, '개역'), '1-20잠언.txt', '잠1:1 <솔로몬의 잠언> 가\n잠1:2 나\n잠31:31 다\n')
    env = {'bible_dir': root}
    assert NB.chapter_count(env, '개역', '1-20잠언.txt') == 31
    with pytest.raises(NB.UserError):
        NB.find_book(env, '개역', '1-99없는책.txt')
    with pytest.raises(NB.UserError):
        NB.find_book(env, '없는번역', '1-20잠언.txt')


# ── 이 PC 환경 · 저장 ─────────────────────────────────────────────────
def test_env_file_broken_warns_in_screen_and_stops_build(tmp_path, monkeypatch):
    bad = tmp_path / '_환경.json'
    bad.write_text('{"out_dir": ', encoding='utf-8')
    monkeypatch.setattr(NB, 'ENV_PATH', str(bad))
    warnings = []
    env = NB.get_env(warnings)                  # 화면 — 기본값으로 열고 알린다
    assert env['out_dir'].endswith('인쇄용') and warnings
    with pytest.raises(NB.UserError):           # 만들기 — 멈춘다
        NB.get_env()


def test_save_json_is_atomic(tmp_path):
    p = tmp_path / 'x.json'
    NB.save_json(str(p), {'a': 1})
    assert json.loads(p.read_text(encoding='utf-8')) == {'a': 1}
    assert not (tmp_path / '_x.json.tmp').exists()


def test_save_json_concurrent_writers(tmp_path):
    """화면의 /api/last 와 만들기의 save_last 가 같은 파일을 함께 써도 서로를 깨뜨리지 않는다(검토 nb-n1 · sv-n3)."""
    import threading
    p = str(tmp_path / '_마지막설정.json')
    errors = []

    def writer(n):
        for i in range(40):
            try:
                NB.save_json(p, {'who': n, 'i': i})
            except Exception as e:      # noqa: BLE001 — 무엇이든 실패면 실패
                errors.append(e)
    ts = [threading.Thread(target=writer, args=(n,)) for n in range(3)]
    for t in ts:
        t.start()
    for t in ts:
        t.join()
    assert not errors
    assert json.loads(open(p, encoding='utf-8').read())['i'] == 39
    assert [f for f in os.listdir(str(tmp_path)) if f != '_마지막설정.json'] == []   # 임시 파일이 안 남는다


def test_swap_pair_keeps_old_pair_when_html_fails(tmp_path):
    """HTML 을 바꾸지 못하면 PDF 도 옛것으로 되돌린다 — 「새 PDF + 옛 HTML」 짝이 남았다(검토 nb-n2)."""
    out_html = tmp_path / '잠언.html'
    out_html.mkdir()                                  # 디렉터리라 바꿔 끼우기가 실패한다
    pdf = tmp_path / '잠언.pdf'
    pdf.write_bytes(b'OLD')
    work_html = tmp_path / '_만드는중_잠언.html'
    work_html.write_text('new', encoding='utf-8')
    work_pdf = tmp_path / '_만드는중_잠언.pdf'
    work_pdf.write_bytes(b'NEW')
    with pytest.raises(NB.UserError):
        NB._swap_pair(str(work_html), str(out_html), str(work_pdf), str(pdf))
    assert pdf.read_bytes() == b'OLD'
    assert not [f for f in os.listdir(str(tmp_path)) if '옛것' in f]
    ok_html = tmp_path / '전도서.html'
    ok_html.write_text('old', encoding='utf-8')
    w2 = tmp_path / '_만드는중_전도서.html'
    w2.write_text('new', encoding='utf-8')
    NB._swap_pair(str(w2), str(ok_html), None, None)  # PDF 없이 — HTML 만
    assert ok_html.read_text(encoding='utf-8') == 'new'


def test_save_env_accepts_only_chrome_or_edge(tmp_path, monkeypatch):
    monkeypatch.setattr(NB, 'ENV_PATH', str(tmp_path / '_환경.json'))
    other = tmp_path / 'cmd.exe'
    other.write_bytes(b'')
    with pytest.raises(NB.UserError):           # 아무 프로그램이나 「크롬」으로 저장하지 못한다(검토 sv-1)
        NB.save_env({'chrome': str(other)})
    chrome = tmp_path / 'chrome.exe'
    chrome.write_bytes(b'')
    assert NB.save_env({'chrome': str(chrome)})['chrome'] == str(chrome)


# ── 설정 ──────────────────────────────────────────────────────────────
def test_normalize_defaults_and_rejects():
    s = NB.normalize({})
    assert s['layout'] in ('right', 'below') and s['body_font'].startswith('fonts/')
    for bad in ({'font_pt': 99}, {'text_color': 'red'}, {'body_font': 'C:/Windows/Fonts/a.ttf'},
                {'layout': 'up'}, {'range_mode': 'all'}, {'letter_spacing_em': 'x'},
                {'layout': 'below', 'font_pt': 24, 'text_mm': 7},      # 줄 높이가 글자보다 작다
                {'range_mode': 'chapter', 'ch_from': ''}):
        with pytest.raises(NB.UserError):
            NB.normalize(bad)
    assert NB.normalize({'ch_from': '3', 'range_mode': 'chapter'})['ch_from'] == 3


def test_normalize_ignores_hidden_fields():
    """지금 쓰지 않는 칸(화면에서 숨기거나 막은 칸)의 틀린 값은 기본값으로 — 막지 않는다(검토 js-4)."""
    s = NB.normalize({'range_mode': 'book', 'ch_from': '', 'ch_to': 999,
                      'layout': 'below', 'line_mm': '', 'orig_pct': 5,
                      'footer_like_sub': True, 'footer_pt': '', 'show_date': False, 'date_pt': 'x'})
    d = NB.defaults()
    assert (s['ch_from'], s['ch_to'], s['line_mm'], s['orig_pct'], s['footer_pt'], s['date_pt']) == \
        (d['ch_from'], d['ch_to'], d['line_mm'], d['orig_pct'], d['footer_pt'], d['date_pt'])
    with pytest.raises(NB.UserError):           # 보이는 칸이면 그대로 막는다
        NB.normalize({'layout': 'right', 'line_mm': ''})
    with pytest.raises(NB.UserError):
        NB.normalize({'footer_like_sub': False, 'footer_pt': ''})


def test_letter_spacing_rounded_like_print():
    """인쇄는 소수 둘째 자리(_mm) — 저장 · 견본 · 인쇄가 같은 값이게(검토 nb-6)."""
    assert NB.normalize({'letter_spacing_em': 0.026})['letter_spacing_em'] == 0.03
    assert NB.normalize({'letter_spacing_em': -0.02})['letter_spacing_em'] == -0.02


def test_out_file_name():
    tr, ps, pr = {'name': 'NIV'}, {'name': '시편'}, {'name': '잠언'}
    base = NB.normalize({'layout': 'right'})
    assert NB.out_file_name(dict(base, range_mode='chapter', ch_from=23), tr, ps) == '시편_NIV_23편_오른쪽.html'
    assert NB.out_file_name(dict(base, range_mode='chapters', ch_from=10, ch_to=3, layout='below'), tr, pr) \
        == '잠언_NIV_3-10장_아래쪽.html'
    assert NB.out_file_name(dict(base, out_name='내/노트:1'), tr, pr) == '내_노트_1.html'
    assert NB.out_file_name(dict(base, out_name='노트.html'), tr, pr) == '노트.html'


def test_auto_name_is_cleaned_too():
    """번역본.json 「이름」이 자동 이름에 들어간다 — 그것도 정리한다(검토 nb-3)."""
    base = NB.normalize({'layout': 'below', 'range_mode': 'chapter', 'ch_from': 3})
    assert NB.out_file_name(base, {'name': 'NIV/2011'}, {'name': '잠언'}) == '잠언_NIV_2011_3장_아래쪽.html'
    assert NB.out_file_name(base, {'name': '새번역?'}, {'name': '잠언'}) == '잠언_새번역__3장_아래쪽.html'
    assert NB.safe_file_name('CON') == 'CON_' and NB.safe_file_name('노트. ') == '노트'
    assert NB.safe_file_name('...') == '필사노트'


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


@pytest.fixture
def restore_render(monkeypatch):
    for name in PATCHED:              # 끝나면 되돌린다(다른 시험이 render 를 쓴다)
        if hasattr(R, name):
            monkeypatch.setattr(R, name, getattr(R, name))


def test_patch_right_fonts_color_bind(restore_render):
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


@pytest.mark.parametrize('body,bold', [
    ('fonts/NotoSerifKR-700.woff', 'fonts/NanumGothic-700.woff'),   # 본문에 「본명조 굵게」
    ('fonts/NotoSerifKR-700.woff', 'fonts/NotoSerifKR-400.woff'),   # 맞바꿈
])
def test_patch_right_font_swap_each_slot_once(restore_render, body, bold):
    """두 자리를 한 번에 — 차례로 바꾸면 본문 자리까지 바뀌었다(검토 nb-1)."""
    NB._patch_right(NB.normalize({'layout': 'right', 'font_pt': 12, 'body_font': body, 'bold_font': bold}))
    css = R.base_css()
    import re
    faces = dict(re.findall(r"font-family:'(NSKB?)'; src:url\('([^']+)'\)", css))
    assert faces == {'NSK': body, 'NSKB': bold}


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


def test_double_space_is_one_cell(monkeypatch):
    """두 칸 띄어쓰기(누가복음 20:42)를 끝 맞춤 칸에서 한 칸으로 — 1차는 한 칸 폭으로 잰다(검토 dc-1)."""
    monkeypatch.setattr(D, 'JUSTIFY', True)
    paras = D.build_paragraphs([_piece(20, 42, '가나  다라\t마', chapter_start=True)])
    assert [t['html'] for t in paras[0]['tokens'] if t['space']] == [' ', ' ']   # 공백 여럿 · 탭 → 한 칸씩
    # 남이 짠 토큰(dictation_enko)에 두 칸이 그대로 있어도 build_items 가 한 칸으로 만든다
    toks = [dict(t) for t in paras[0]['tokens']]
    toks.insert(2, dict(toks[2]))           # 가 나 ␣ ␣ 다 라 ␣ 마
    p = {'heads': [], 'tokens': toks}
    first = D.build_items([p], {0: [0, 7]}, 'ko')[0]    # 첫 줄 = 마지막 줄이 아니라 끝 맞춤
    assert first['html'].startswith('<div class="jl">')
    assert first['html'].count('<span> </span>') == 1


def test_build_items_old_call_still_works(monkeypatch):
    """dictation_enko.py(다른 세션)가 쓰는 옛 모양 — build_items(paras, breaks, lang) · 머리 칸 한 줄."""
    monkeypatch.setattr(D, 'CHAP_SUB_INLINE', True)
    paras = D.build_paragraphs([_piece(1, 1, '가나다', chapter_start=True, subtitle='솔로몬의 잠언')])
    old = D.build_items(paras, {0: [0]}, 'ko')
    assert [it['kind'] for it in old] == ['chap', 'line'] and old[0]['mm'] == D.HEAD_MM
    new = D.build_items(paras, {0: [0]}, 'ko', {(0, 0): 2})  # 잰 줄 수가 둘이면 두 줄 높이
    assert new[0]['mm'] == D.HEAD_MM * 2


def test_footer_check_is_horizontal_only():
    """바닥글은 가로 잘림만 — 16pt 이상 바닥글 글씨가 칸보다 커도 잘리지 않으니 막지 않는다(검토 dc-n1)."""
    probe = D.CHECK_PROBE
    assert "bad.push('FOOT'" in probe and 'scrollWidth > sp.clientWidth' in probe
    assert 'bottom > fb' not in probe


def test_footer_font_not_loaded_when_footer_empty(monkeypatch):
    """바닥글 글이 하나도 없으면 바닥글 서체를 싣지 않는다 — 안 쓰는 서체는 FONT 로 멈췄다(검토 dc-2)."""
    monkeypatch.setattr(D, 'FOOTER_FONT', 'fonts/NanumGothic-400.woff')
    for k in ('FOOTER_LEFT', 'FOOTER_CENTER', 'FOOTER_CENTER_EVEN', 'FOOTER_RIGHT'):
        monkeypatch.setattr(R, k, '')
    assert 'NSKF' not in D.page_css(3) and 'NSKF' not in D.page_css()
    monkeypatch.setattr(R, 'FOOTER_LEFT', 'God is Love')
    assert "font-family:'NSKF'" in D.page_css(3) and "font-family:'NSKF'" in D.page_css()


# ── 화면 서버 ─────────────────────────────────────────────────────────
def test_safe_parts_blocks_escapes():
    """파일 시스템에 닿기 전에 거른다 — 역슬래시 · 드라이브 · UNC · '..'(검토 sv-2 · sv-5)."""
    import ui
    assert ui.safe_parts('fonts/a.woff') == ['fonts', 'a.woff']
    for bad in ('fonts/..\\ui\\index.html', '\\\\attacker\\s\\x.pdf', '//h/s/x.pdf', 'C:/x.pdf', 'c:x.pdf',
                '../x.html', 'a//b.html', './a.html', ''):
        assert ui.safe_parts(bad) is None, bad


def test_cookie_value_survives_odd_cookies():
    """127.0.0.1 의 다른 도구가 남긴 이상한 쿠키 하나 때문에 비밀값을 못 찾지 않는다(검토 sv-n1)."""
    import ui
    for header in ('abc; nbui_8770=T', 'nbui_8770=T; abc', 'x={"a":1}; nbui_8770=T', 'a=b c; nbui_8770=T',
                   'path=/x; nbui_8770=T', 'lang=한; nbui_8770=T', 'nbui_8771=U; nbui_8770=T'):
        assert ui.cookie_value(header, 'nbui_8770') == 'T', header
    assert ui.cookie_value('', 'nbui_8770') == '' and ui.cookie_value(None, 'nbui_8770') == ''


def test_resolve_inside_and_job_url(tmp_path):
    import ui
    out = tmp_path / '인쇄용'
    (out / '_미리보기').mkdir(parents=True)
    f = out / '_미리보기' / '미리보기.html'
    f.write_text('x', encoding='utf-8')
    assert ui.resolve_inside(str(out), ['_미리보기', '미리보기.html']) == os.path.realpath(str(f))
    url = ui.job_url('abc123', str(out), str(f))
    assert url.startswith('/files/job/abc123/') and url.endswith('.html') and '%' in url
    assert ui.job_url('abc123', str(out), str(tmp_path / '밖.html')) is None
