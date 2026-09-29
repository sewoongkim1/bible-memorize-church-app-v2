# -*- coding: utf-8 -*-
import os
import sys
import tempfile

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import generate
from generate import ensure_out_path_safe, find_book_file, _git_repo_root
from render import all_font_urls

# generate.py 는 bible-note/ 안에 있고, _git_repo_root() 는 늘 이 스크립트 기준으로
# 저장소 루트를 찾는다(호출한 쪽 cwd 와 무관) — 테스트도 같은 방법으로 기대값을 만든다.
ROOT = os.path.normcase(os.path.realpath(
    os.path.join(os.path.dirname(__file__), '..', '..')))


# ── ensure_out_path_safe ──────────────────────────────────────────────
# 만든 HTML 에는 개역개정 본문이 그대로 들어 있고, 이 저장소는 push 하면 사이트
# 전체가 그대로 배포된다(2026-09-22 최종 검토 Important 1). 크롬 없이 도는 순수
# 로직이라 pytest 로 그대로 시험할 수 있다.

def test_git_repo_root_finds_project_root():
    assert _git_repo_root() == ROOT


def test_ensure_out_path_safe_allows_default_bible_note_path():
    # bible-note/ 바로 아래는 .gitignore 로 무시된다.
    ensure_out_path_safe(os.path.join(ROOT, 'bible-note', '유다서.html'))


def test_ensure_out_path_safe_allows_nested_out_dir():
    # --out out/유다서.html 처럼 중첩된 폴더도 넓어진 패턴(bible-note/**/*.html)으로
    # 무시된다. fonts/ 도 마찬가지(bible-note/**/fonts/).
    ensure_out_path_safe(os.path.join(ROOT, 'bible-note', 'out', '유다서.html'))
    ensure_out_path_safe(os.path.join(ROOT, 'bible-note', 'out', 'fonts', 'a.woff'))


def test_ensure_out_path_safe_blocks_other_repo_folder_not_ignored():
    # marketing/ 은 .gitignore 로 안 막힌다 — 저장소 안이므로 쓰기 전에 멈춰야 한다.
    with pytest.raises(SystemExit):
        ensure_out_path_safe(os.path.join(ROOT, 'marketing', '유다서.html'))


def test_ensure_out_path_safe_allows_outside_repo_regardless_of_ignore():
    with tempfile.TemporaryDirectory() as d:
        ensure_out_path_safe(os.path.join(d, '유다서.html'))


def test_ensure_out_path_safe_allows_when_no_repo(monkeypatch):
    # git 이 없거나 이 폴더가 저장소가 아니면(예: bible-note/ 만 복사해 쓰는 경우)
    # 검사 없이 허용한다 — 저장소 안이라면 막혔을 자리를 넣어 확인한다.
    monkeypatch.setattr(generate, '_git_repo_root', lambda: None)
    ensure_out_path_safe(os.path.join(ROOT, 'marketing', '유다서.html'))


# ── ④ 저장 경로 안전 — 서체 자리까지 본다(2026-09-22 최종 검토 r2 Minor) ──────
# 만든 HTML이 bible-note/ 밖으로 나가면 fonts/ 도 옆에 함께 두는데(generate._copy_fonts_beside),
# 그 자리가 저장소 안인데 무시되지 않으면 HTML 자체는 무시돼도 서체가 새 나갈 수 있다.

def test_ensure_out_path_safe_checks_font_dir_when_outside_bible_note(monkeypatch):
    checked = []

    def fake_ignored(root, abs_path):
        checked.append(abs_path)
        return True  # 실제로 멈추지는 않게 하고, 어떤 자리를 봤는지만 기록한다

    monkeypatch.setattr(generate, '_is_git_ignored', fake_ignored)
    ensure_out_path_safe(os.path.join(ROOT, 'marketing', '유다서.html'))
    assert any('fonts' in os.path.normcase(p).replace('\\', '/') for p in checked)


def test_ensure_out_path_safe_skips_font_check_inside_bible_note(monkeypatch):
    checked = []

    def fake_ignored(root, abs_path):
        checked.append(abs_path)
        return True

    monkeypatch.setattr(generate, '_is_git_ignored', fake_ignored)
    ensure_out_path_safe(os.path.join(ROOT, 'bible-note', '유다서.html'))
    assert not any('fonts' in os.path.normcase(p).replace('\\', '/') for p in checked)


def test_ensure_out_path_safe_blocks_unignored_font_dir_next_to_html():
    # 검토에서 실제로 걸렸던 자리를 그대로 재현한다 — 저장소 루트의 「_유다서.html」
    # 자체는 .gitignore의 /_*.html 로 무시되지만, 그 옆 fonts/ 는 안 막혀 있었다.
    with pytest.raises(SystemExit):
        ensure_out_path_safe(os.path.join(ROOT, '_유다서.html'))


def test_ensure_out_path_safe_checks_every_font_in_all_font_urls(monkeypatch):
    monkeypatch.setattr(
        'render.HEADER_FONT_URL', {'fonts/GowunDodum-400.woff': 'https://example.com/x.woff'})
    checked = []

    def fake_ignored(root, abs_path):
        checked.append(abs_path)
        return True

    monkeypatch.setattr(generate, '_is_git_ignored', fake_ignored)
    ensure_out_path_safe(os.path.join(ROOT, 'marketing', '유다서.html'))
    names = {os.path.basename(p) for p in checked}
    for font_path in all_font_urls():
        assert os.path.basename(font_path) in names


# ── _git_repo_root — 로캘이 아니라 UTF-8 로 subprocess 출력을 푼다 ─────────
# (2026-09-22 최종 검토 r2 — cp949 로캘에서 저장소 경로에 한글이 섞이면 죽었다)

def test_git_repo_root_decodes_subprocess_output_as_utf8(monkeypatch):
    calls = {}

    def fake_run(cmd, **kwargs):
        calls.update(kwargs)

        class R:
            returncode = 0
            stdout = ROOT + '\n'
        return R()

    monkeypatch.setattr(generate.subprocess, 'run', fake_run)
    result = _git_repo_root()
    assert calls.get('encoding') == 'utf-8'
    assert calls.get('errors') == 'replace'
    assert result == ROOT


# ── find_book_file ─────────────────────────────────────────────────────
# 예전엔 endswith 로 찾아 부분 이름이 조용히 걸렸다(2026-09-22 최종 검토 Minor).

def test_find_book_file_matches_exact_name(tmp_path):
    (tmp_path / '2-26유다서.txt').write_bytes('내용'.encode('cp949'))
    found = find_book_file('유다서', bible_dir=str(tmp_path))
    assert found.endswith('2-26유다서.txt')


def test_find_book_file_rejects_partial_suffix_match(tmp_path):
    # "서" 가 "전도서" 뒤에 부분적으로 걸리면 안 된다.
    (tmp_path / '66-19전도서.txt').write_bytes('내용'.encode('cp949'))
    with pytest.raises(SystemExit):
        find_book_file('서', bible_dir=str(tmp_path))


def test_find_book_file_suggests_similar_names_when_not_found(tmp_path):
    # "애가" 로 찾아도 "예레미야애가"가 조용히 걸리면 안 되지만(머리글이 틀려진다),
    # 못 찾았을 때 후보로는 보여 준다.
    (tmp_path / '25-01예레미야애가.txt').write_bytes('내용'.encode('cp949'))
    with pytest.raises(SystemExit) as e:
        find_book_file('애가', bible_dir=str(tmp_path))
    assert '예레미야애가' in str(e.value)


def test_find_book_file_raises_without_suggestion_when_nothing_close(tmp_path):
    (tmp_path / '1-01창세기.txt').write_bytes('내용'.encode('cp949'))
    with pytest.raises(SystemExit) as e:
        find_book_file('유다서', bible_dir=str(tmp_path))
    assert '창세기' not in str(e.value)


# ── Task 9: 실측 결과 풀이 · 줄 수 채우기 · 기본 파일 이름 ─────────────────

class _FakeRun:
    def __init__(self, title):
        self.stdout = ('<html><head><title>%s</title></head><body></body></html>' % title).encode('utf-8')
        self.stderr = b''


def test_measure_probe_reports_part():
    assert 'el.dataset.pt' in generate.MEASURE_PROBE


def test_measure_lines_key_includes_part(monkeypatch, tmp_path):
    # 끊긴 절의 두 조각(5:9 조각 0 · 조각 1)이 한 키로 겹치지 않는다.
    html = tmp_path / '_draft.html'
    html.write_text('<html><body></body></html>', encoding='utf-8')
    monkeypatch.setattr(generate, '_chrome', lambda chrome, flags, target: _FakeRun(
        'LINES|5,9,0,body,2;5,9,1,body,1;5,1,0,chap,1;5,1,0,head,1'))
    result = generate.measure_lines(str(html), 'chrome')
    assert result == {(5, 9, 0, 'body'): 2, (5, 9, 1, 'body'): 1,
                      (5, 1, 0, 'chap'): 1, (5, 1, 0, 'head'): 1}


def _piece(verse, part=0, **extra):
    d = {'book': '시편', 'chapter': 1, 'verse': verse, 'part': part, 'subtitle': None,
         'heading': None, 'chapter_start': False, 'body': '본문', 'label': str(verse),
         'verse_end': None}
    d.update(extra)
    return d


def test_apply_line_counts_sums_head_chap_sub_body():
    pieces = [_piece(1, heading='제일권', chapter_start=True, subtitle='소제목')]
    generate.apply_line_counts(pieces, {
        (1, 1, 0, 'head'): 1, (1, 1, 0, 'chap'): 1, (1, 1, 0, 'sub'): 2, (1, 1, 0, 'body'): 3})
    p = pieces[0]
    assert (p['head_lines'], p['chap_lines'], p['sub_lines']) == (1, 1, 2)
    assert p['lines'] == 7


def test_apply_line_counts_keeps_parts_apart():
    pieces = [_piece(9), _piece(9, part=1, label='')]
    generate.apply_line_counts(pieces, {(1, 9, 0, 'body'): 2, (1, 9, 1, 'body'): 1})
    assert [p['lines'] for p in pieces] == [2, 1]
    assert all((p['head_lines'], p['chap_lines'], p['sub_lines']) == (0, 0, 0) for p in pieces)


def test_apply_line_counts_stops_when_body_not_measured():
    with pytest.raises(SystemExit):
        generate.apply_line_counts([_piece(9, part=1)], {(1, 9, 0, 'body'): 2})


def test_apply_line_counts_stops_when_chapter_mark_not_measured():
    # 장 표시가 붙는 조각인데 그 줄 수를 못 쟀으면 0 으로 두지 않고 멈춘다(필사줄이 밀린다).
    with pytest.raises(SystemExit):
        generate.apply_line_counts([_piece(1, chapter_start=True)], {(1, 1, 0, 'body'): 2})


def test_apply_line_counts_stops_on_duplicate_piece_keys():
    # 같은 (장, 절, 조각) 이 둘이면 실측 결과가 한 키에 덮여 한쪽 줄 수가 틀린다.
    with pytest.raises(SystemExit):
        generate.apply_line_counts([_piece(9), _piece(9)], {(1, 9, 0, 'body'): 2})


def test_default_out_name_uses_chapter_unit():
    assert generate.default_out_name('시편', 1) == '시편_1편.html'
    assert generate.default_out_name('요한복음', 1) == '요한복음_1장.html'
    assert generate.default_out_name('유다서', None) == '유다서.html'


def test_verse_count_counts_verses_not_pieces():
    pieces = [_piece(1), _piece(1, part=1, label=''), _piece(2, verse_end=3, label='2-3')]
    assert generate.verse_count(pieces) == 3


# ── Task 9: 바닥글 서체 · 내 PC 서체(주소 '') ─────────────────────────────

def _no_base_fonts(monkeypatch):
    # 원문 서체(FONT_URL)는 이 시험과 상관없다 — 빈 임시 폴더에서 받으려 들지 않게 비운다.
    monkeypatch.setattr('render.FONT_URL', {})


def test_ensure_fonts_local_font_small_file_is_not_downloaded(monkeypatch, tmp_path):
    # 내 PC 서체(주소 '')는 크기와 무관하게 그대로 쓴다 — Task 8 은 100KB 보다 작으면 「덜
    # 받았다」로 보고 주소 ''로 다시 받으려다 오류가 났다.
    _no_base_fonts(monkeypatch)
    monkeypatch.chdir(tmp_path)
    (tmp_path / 'fonts').mkdir()
    (tmp_path / 'fonts' / 'My.ttf').write_bytes(b'x' * 10)
    monkeypatch.setattr('render.HEADER_FONT_URL', {'fonts/My.ttf': ''})
    calls = []
    monkeypatch.setattr(generate.urllib.request, 'urlretrieve', lambda *a: calls.append(a))
    generate.ensure_fonts()
    assert calls == []


def test_ensure_fonts_local_font_missing_stops_in_korean(monkeypatch, tmp_path):
    _no_base_fonts(monkeypatch)
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr('render.FOOTER_FONT_URL', {'fonts/My.ttf': ''})
    calls = []
    monkeypatch.setattr(generate.urllib.request, 'urlretrieve', lambda *a: calls.append(a))
    with pytest.raises(SystemExit) as e:
        generate.ensure_fonts()
    assert 'fonts/My.ttf' in str(e.value)
    assert '넣어 주세요' in str(e.value)
    assert calls == []


def test_ensure_fonts_still_redownloads_small_url_font(monkeypatch, tmp_path):
    # 주소가 있는 서체는 지금처럼 — 덜 받은(작은) 파일은 다시 받는다.
    _no_base_fonts(monkeypatch)
    monkeypatch.chdir(tmp_path)
    (tmp_path / 'fonts').mkdir()
    (tmp_path / 'fonts' / 'X.woff').write_bytes(b'x' * 10)
    monkeypatch.setattr('render.HEADER_FONT_URL', {'fonts/X.woff': 'https://example.com/x.woff'})
    calls = []
    monkeypatch.setattr(generate.urllib.request, 'urlretrieve', lambda *a: calls.append(a))
    generate.ensure_fonts()
    assert calls == [('https://example.com/x.woff', 'fonts/X.woff')]


def test_ensure_fonts_same_file_for_header_and_footer_downloads_once(monkeypatch, tmp_path):
    _no_base_fonts(monkeypatch)
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr('render.HEADER_FONT_URL', {'fonts/X.woff': 'https://example.com/x.woff'})
    monkeypatch.setattr('render.FOOTER_FONT_URL', {'fonts/X.woff': 'https://example.com/x.woff'})
    calls = []
    monkeypatch.setattr(generate.urllib.request, 'urlretrieve', lambda *a: calls.append(a))
    generate.ensure_fonts()
    assert len(calls) == 1


def test_copy_fonts_beside_same_file_for_header_and_footer_copies_once(monkeypatch, tmp_path):
    _no_base_fonts(monkeypatch)
    here = tmp_path / 'here'
    (here / 'fonts').mkdir(parents=True)
    (here / 'fonts' / 'My.ttf').write_bytes(b'x' * 10)
    monkeypatch.chdir(here)
    monkeypatch.setattr('render.HEADER_FONT_URL', {'fonts/My.ttf': ''})
    monkeypatch.setattr('render.FOOTER_FONT_URL', {'fonts/My.ttf': ''})
    copied = []
    monkeypatch.setattr(generate.shutil, 'copy2', lambda src, dst: copied.append((src, dst)))
    generate._copy_fonts_beside(str(tmp_path / 'elsewhere' / '시편_1편.html'))
    assert len(copied) == 1
    assert copied[0][0] == 'fonts/My.ttf'


# ── 최종 검토 r5 Minor 1 — 임시 파일 이름을 실행마다 다르게 ──────────────────
# 고정 이름(_draft.html · _measure.html)이면 같은 폴더에서 두 실행이 서로의 파일을 읽고 지운다.

def test_temp_beside_names_differ_each_call(tmp_path):
    html = str(tmp_path / 'a.html')
    p1 = generate._temp_beside(html, '_verify_', '.html')
    p2 = generate._temp_beside(html, '_verify_', '.html')
    try:
        assert p1 != p2
        for p in (p1, p2):
            # fonts/ 상대 경로가 풀리도록 HTML 과 같은 폴더 · `_` 로 시작(.gitignore bible-note/**/_*)
            assert os.path.dirname(p) == str(tmp_path)
            assert os.path.basename(p).startswith('_verify_')
            assert p.endswith('.html')
            assert os.path.exists(p)  # mkstemp 가 자리를 잡아 둔다(다른 실행이 같은 이름을 못 쓴다)
    finally:
        for p in (p1, p2):
            os.remove(p)


def test_temp_name_must_start_with_underscore(tmp_path):
    with pytest.raises(ValueError):
        generate._temp_in(str(tmp_path), 'verify_', '.html')


@pytest.mark.parametrize('prefix, suffix', [('_draft_', '.html'), ('_measure_', '.html'),
                                            ('_verify_', '.html'), ('_verify_print_', '.pdf')])
def test_temp_names_in_bible_note_are_git_ignored(prefix, suffix):
    # 본문이 든 임시 파일이 지워지기 전에 커밋에 걸리면 안 된다.
    p = generate._temp_in(os.path.join(ROOT, 'bible-note'), prefix, suffix)
    try:
        assert generate._is_git_ignored(ROOT, p), p
    finally:
        os.remove(p)


def test_measure_lines_uses_unique_temp_and_removes_it(monkeypatch, tmp_path):
    draft = tmp_path / '_draft_x.html'
    draft.write_text('<html><body></body></html>', encoding='utf-8')
    seen = []

    def fake_chrome(chrome, flags, target):
        assert os.path.exists(target)
        seen.append(target)
        return _FakeRun('LINES|1,1,0,body,2')

    monkeypatch.setattr(generate, '_chrome', fake_chrome)
    for _ in range(2):
        assert generate.measure_lines(str(draft), 'chrome') == {(1, 1, 0, 'body'): 2}
    assert seen[0] != seen[1]
    assert all(os.path.basename(p).startswith('_measure_') for p in seen)
    assert sorted(os.listdir(str(tmp_path))) == ['_draft_x.html']


def test_measure_lines_removes_temp_when_chrome_fails(monkeypatch, tmp_path):
    draft = tmp_path / '_draft_x.html'
    draft.write_text('<html><body></body></html>', encoding='utf-8')

    def fake_chrome(chrome, flags, target):
        raise SystemExit('!! 크롬이 멈췄다')

    monkeypatch.setattr(generate, '_chrome', fake_chrome)
    with pytest.raises(SystemExit):
        generate.measure_lines(str(draft), 'chrome')
    assert sorted(os.listdir(str(tmp_path))) == ['_draft_x.html']


def test_measure_draft_uses_unique_draft_and_removes_it(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    # 다른 실행이 쓰던 옛 고정 이름 파일 — 건드리지 않아야 한다.
    (tmp_path / '_draft.html').write_text('다른 실행', encoding='utf-8')
    seen = []

    def fake_measure(path, chrome):
        with open(path, encoding='utf-8') as f:
            assert 'data-role="body"' in f.read()
        seen.append(os.path.abspath(path))
        return {(1, 1, 0, 'body'): 1}

    monkeypatch.setattr(generate, 'measure_lines', fake_measure)
    for _ in range(2):
        assert generate.measure_draft([_piece(1)], 'chrome') == {(1, 1, 0, 'body'): 1}
    assert seen[0] != seen[1]
    assert all(os.path.dirname(p) == str(tmp_path) for p in seen)
    assert all(os.path.basename(p).startswith('_draft_') for p in seen)
    assert sorted(os.listdir(str(tmp_path))) == ['_draft.html']
    assert (tmp_path / '_draft.html').read_text(encoding='utf-8') == '다른 실행'


def test_measure_draft_removes_draft_when_measuring_fails(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)

    def fake_measure(path, chrome):
        raise SystemExit('!! 크롬이 멈췄다')

    monkeypatch.setattr(generate, 'measure_lines', fake_measure)
    with pytest.raises(SystemExit):
        generate.measure_draft([_piece(1)], 'chrome')
    assert os.listdir(str(tmp_path)) == []


# ── 최종 검토 r5 Minor 4 — 서체 설정 · 원문 줄 문제는 `!! …` 한 줄로 ────────────

def test_main_shows_font_setting_error_as_one_line(monkeypatch):
    monkeypatch.chdir(os.getcwd())  # generate() 가 chdir 해도 끝나면 돌려 둔다
    monkeypatch.setattr(sys, 'argv', ['generate.py', '유다서'])
    monkeypatch.setattr('render.HEADER_FONT_URL', {'fonts/batang.ttc': ''})
    with pytest.raises(SystemExit) as e:
        generate.main()
    msg = str(e.value)
    assert msg.startswith('!! ')
    assert '.ttc(여러 서체를 묶은 파일)는 브라우저가 읽지 못합니다' in msg


def test_main_shows_source_text_error_as_one_line_keeping_message(monkeypatch):
    import parse
    text = '시편 12번째 줄: 장·절 번호가 없는 줄이라 어느 절인지 알 수 없습니다 — 머리말'

    def fake_generate(*a, **k):
        raise parse.SourceTextError(text)

    monkeypatch.setattr(sys, 'argv', ['generate.py', '시편'])
    monkeypatch.setattr(generate, 'generate', fake_generate)
    with pytest.raises(SystemExit) as e:
        generate.main()
    assert str(e.value) == '!! ' + text  # 가이드가 인용하는 본문은 그대로


def test_main_leaves_other_value_errors_alone(monkeypatch):
    # 서체 설정·원문 줄 밖의 ValueError(예: 한 쪽보다 긴 절)는 지금처럼 그대로 올라간다.
    def fake_generate(*a, **k):
        raise ValueError('다른 문제')

    monkeypatch.setattr(sys, 'argv', ['generate.py', '유다서'])
    monkeypatch.setattr(generate, 'generate', fake_generate)
    with pytest.raises(ValueError) as e:
        generate.main()
    assert str(e.value) == '다른 문제'


# ── 최종 검토 r5 Minor 9(r2 Minor 3) — git 이 PATH 에 없을 때 ────────────────

def test_git_repo_root_reports_missing_git(monkeypatch):
    def fake_run(cmd, **kwargs):
        raise FileNotFoundError('git')

    monkeypatch.setattr(generate.subprocess, 'run', fake_run)
    assert generate._git_repo_root() is generate.NO_GIT


@pytest.mark.parametrize('git_is_file', [False, True])
def test_ensure_out_path_safe_stops_inside_repo_when_git_missing(monkeypatch, tmp_path, git_is_file):
    # git 이 없으면 무시되는 자리인지 알 수 없다 — .git 이 보이는 폴더(저장소 안)면 멈춘다.
    # .git 은 폴더일 수도(보통), 파일일 수도(worktree · submodule) 있다.
    repo = tmp_path / 'repo'
    repo.mkdir()
    if git_is_file:
        (repo / '.git').write_text('gitdir: elsewhere', encoding='utf-8')
    else:
        (repo / '.git').mkdir()
    monkeypatch.setattr(generate, '_git_repo_root', lambda: generate.NO_GIT)
    with pytest.raises(SystemExit) as e:
        ensure_out_path_safe(str(repo / 'bible-note' / 'out' / '유다서.html'))
    msg = str(e.value)
    assert msg.startswith('!! ')
    assert 'git 이 없어 커밋에서 빠지는 자리인지 확인할 수 없습니다' in msg
    assert '저장소 밖(바탕화면 등)에 저장하세요' in msg


def test_ensure_out_path_safe_allows_outside_repo_when_git_missing(monkeypatch, tmp_path):
    monkeypatch.setattr(generate, '_git_repo_root', lambda: generate.NO_GIT)
    ensure_out_path_safe(str(tmp_path / 'desk' / '유다서.html'))


def test_ensure_out_path_safe_stops_in_this_repo_when_git_missing(monkeypatch):
    # 기본 자리(bible-note/)도 저장소 안이다 — git 없이는 무시 규칙을 확인할 수 없어 멈춘다.
    monkeypatch.setattr(generate, '_git_repo_root', lambda: generate.NO_GIT)
    with pytest.raises(SystemExit):
        ensure_out_path_safe(os.path.join(ROOT, 'bible-note', '유다서.html'))


def test_ensure_out_path_safe_checks_footer_font(monkeypatch):
    monkeypatch.setattr('render.FOOTER_FONT_URL', {'fonts/Footer-400.woff': 'https://example.com/f.woff'})
    checked = []

    def fake_ignored(root, abs_path):
        checked.append(abs_path)
        return True

    monkeypatch.setattr(generate, '_is_git_ignored', fake_ignored)
    ensure_out_path_safe(os.path.join(ROOT, 'marketing', '유다서.html'))
    assert 'Footer-400.woff' in {os.path.basename(p) for p in checked}
