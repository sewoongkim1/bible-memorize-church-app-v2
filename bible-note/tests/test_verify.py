# -*- coding: utf-8 -*-
"""verify.py — 크롬 없이 도는 부분(임시 파일 · 결과 풀이)만 시험한다.

⚠️ 2026-09-22 최종 검토 r5 Minor 1 — 임시 파일 이름이 고정(_verify.html · _verify_print.pdf)이라
   같은 폴더에서 두 verify 를 함께 돌리면 서로의 파일을 읽고 지워, 망친 HTML 이 「모두 통과」로
   나왔다(세 번 중 세 번 재현). 이제 실행마다 다른 이름을 쓰고 미리 지우지 않는다.
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import verify


class _Run:
    def __init__(self, stdout=b'', stderr=b''):
        self.stdout = stdout
        self.stderr = stderr


def _html(tmp_path, pages=1):
    p = tmp_path / 'a.html'
    p.write_text('<html><body>%s</body></html>' % ('<div class="page"></div>' * pages),
                 encoding='utf-8')
    return str(p)


def _pdf_flag(flags):
    return [f for f in flags if f.startswith('--print-to-pdf=')][0].split('=', 1)[1]


def test_check_layout_uses_unique_temp_and_removes_it(monkeypatch, tmp_path):
    html = _html(tmp_path)
    seen = []

    def fake_chrome(chrome, flags, target):
        assert os.path.exists(target)
        with open(target, encoding='utf-8') as f:
            assert 'CHECK|' in f.read()  # 검사 스크립트를 심은 사본이다
        seen.append(target)
        return _Run(b'<html><head><title>CHECK|</title></head></html>')

    monkeypatch.setattr(verify, '_chrome', fake_chrome)
    assert verify.check_layout(html, 'chrome') == []
    assert verify.check_layout(html, 'chrome') == []
    assert seen[0] != seen[1]
    for p in seen:
        assert os.path.dirname(p) == str(tmp_path)  # fonts/ 가 풀리도록 HTML 옆
        assert os.path.basename(p).startswith('_verify_') and p.endswith('.html')
    assert os.listdir(str(tmp_path)) == ['a.html']


def test_check_layout_removes_temp_when_chrome_fails(monkeypatch, tmp_path):
    html = _html(tmp_path)

    def fake_chrome(chrome, flags, target):
        raise SystemExit('!! 크롬이 멈췄다')

    monkeypatch.setattr(verify, '_chrome', fake_chrome)
    with pytest.raises(SystemExit):
        verify.check_layout(html, 'chrome')
    assert os.listdir(str(tmp_path)) == ['a.html']


def test_check_print_uses_unique_pdf_and_removes_it(monkeypatch, tmp_path):
    pymupdf = pytest.importorskip('pymupdf')
    html = _html(tmp_path, pages=2)
    seen = []

    def fake_chrome(chrome, flags, target):
        pdf = _pdf_flag(flags)
        seen.append(pdf)
        doc = pymupdf.open()
        for _ in range(2):
            doc.new_page(width=841.89, height=595.28)
        doc.save(pdf)
        doc.close()
        return _Run()

    monkeypatch.setattr(verify, '_chrome', fake_chrome)
    assert verify.check_print(html, 'chrome') == []
    assert verify.check_print(html, 'chrome') == []
    assert seen[0] != seen[1]
    for p in seen:
        assert os.path.dirname(p) == str(tmp_path)
        assert os.path.basename(p).startswith('_verify_print_') and p.endswith('.pdf')
    assert os.listdir(str(tmp_path)) == ['a.html']


def test_check_print_still_counts_pages(monkeypatch, tmp_path):
    pymupdf = pytest.importorskip('pymupdf')
    html = _html(tmp_path, pages=2)

    def fake_chrome(chrome, flags, target):
        doc = pymupdf.open()
        doc.new_page(width=841.89, height=595.28)
        doc.save(_pdf_flag(flags))
        doc.close()
        return _Run()

    monkeypatch.setattr(verify, '_chrome', fake_chrome)
    assert verify.check_print(html, 'chrome') == ['PRINT_PAGES:1!=2']


def test_check_print_does_not_delete_another_runs_pdf(monkeypatch, tmp_path):
    # 예전에는 시작할 때 _verify_print.pdf 를 지워, 다른 실행이 만드는 중인 PDF 를 지웠다.
    pytest.importorskip('pymupdf')
    html = _html(tmp_path)
    other = tmp_path / '_verify_print.pdf'
    other.write_bytes(b'%PDF other run')
    monkeypatch.setattr(verify, '_chrome', lambda chrome, flags, target: _Run())
    verify.check_print(html, 'chrome')
    assert other.read_bytes() == b'%PDF other run'


def test_print_failed_includes_chrome_stderr(monkeypatch, tmp_path):
    # r5 Minor 9(r2 Minor 5) — 크롬이 PDF 를 못 만들면 LAYOUT_CHECK_FAILED 처럼 stderr 를 붙인다.
    pytest.importorskip('pymupdf')
    html = _html(tmp_path)
    monkeypatch.setattr(verify, '_chrome',
                        lambda chrome, flags, target: _Run(stderr=b'  printing failed: boom \n'))
    problems = verify.check_print(html, 'chrome')
    assert problems == ['PRINT_FAILED: 크롬이 PDF 를 만들지 못했습니다 — printing failed: boom']
    assert os.listdir(str(tmp_path)) == ['a.html']


def test_print_failed_without_stderr_keeps_short_message(monkeypatch, tmp_path):
    pytest.importorskip('pymupdf')
    html = _html(tmp_path)
    monkeypatch.setattr(verify, '_chrome', lambda chrome, flags, target: _Run())
    assert verify.check_print(html, 'chrome') == ['PRINT_FAILED: 크롬이 PDF 를 만들지 못했습니다']


def test_layout_check_failed_includes_chrome_stderr(monkeypatch, tmp_path):
    html = _html(tmp_path)
    monkeypatch.setattr(verify, '_chrome',
                        lambda chrome, flags, target: _Run(b'<html></html>', b'crashed'))
    assert verify.check_layout(html, 'chrome') == [
        'LAYOUT_CHECK_FAILED: 크롬 결과를 읽지 못했습니다 — crashed']
