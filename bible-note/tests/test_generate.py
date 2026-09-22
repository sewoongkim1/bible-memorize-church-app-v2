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
