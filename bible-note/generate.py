# -*- coding: utf-8 -*-
"""성경 필사노트(가로형) 생성기.

사용법:
    cd bible-note
    PYTHONIOENCODING=utf-8 python generate.py 유다서
    PYTHONIOENCODING=utf-8 python generate.py 요한복음 --chapter 1

⚠️ 두 번 그린다(기독교 고전 소책자와 같은 이유) — 1차로 원문만 그려 브라우저에
   실제 줄 수를 물어본 뒤, 그 줄 수만큼 필사줄을 넣어 2차로 다시 그린다.
   손으로 "이 절은 몇 자니까 몇 줄"이라고 계산하지 않는다.
"""
import argparse
import io
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from parse import parse_book, load_book_file, book_name_from_filename, SourceTextError
from paginate import paginate
from render import (build_draft_html, build_final_html, lines_per_page, all_font_urls,
                    chapter_unit, piece_blocks, FontSettingError)

CHROME_CANDS = [
    r'C:\Program Files\Google\Chrome\Application\chrome.exe',
    r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
    os.path.join(os.environ.get('LOCALAPPDATA', ''), r'Google\Chrome\Application\chrome.exe'),
    r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
]

CHROME_TIMEOUT_SEC = 120

# ⚠️ 줄 수 = 높이 ÷ 줄 높이. Range.getClientRects() 로 상자를 세면 절 번호 <span> 때문에
#    첫 줄을 두세 번 센다(상자·그 안 글자·본문 조각이 따로 잡힌다).
# ⚠️ 서체가 안 불렸으면 대체 서체 기준 줄 수라 인쇄본과 어긋난다 — 재지 않고 멈춘다.
# ⚠️ 키는 (장, 절, 조각, 역할) — 끊긴 절의 두 조각이 한 키로 겹치지 않게 조각 번호(data-pt)를 싣는다.
MEASURE_PROBE = """<script>
document.fonts.ready.then(function(){
  var bad = [];
  document.fonts.forEach(function(f){ if (f.status !== 'loaded') bad.push(f.family); });
  if (bad.length) { document.title = 'LINES|FONTFAIL'; return; }
  var out = [];
  document.querySelectorAll('[data-role]').forEach(function(el){
    var lh = parseFloat(getComputedStyle(el).lineHeight);
    var n = Math.round(el.getBoundingClientRect().height / lh);
    out.push(el.dataset.ch + ',' + el.dataset.vs + ',' + el.dataset.pt + ',' + el.dataset.role + ',' + n);
  });
  document.title = 'LINES|' + out.join(';');
});
</script>"""


def find_chrome():
    for c in CHROME_CANDS:
        if c and os.path.exists(c):
            return c
    return None


def _temp_in(folder, prefix, suffix):
    """folder 안에 실행마다 다른 이름의 빈 임시 파일을 만들어 그 경로를 돌려준다.

    ⚠️ 이름을 고정하지 않는다(2026-09-22 최종 검토 r5 Minor 1) — `_verify.html` ·
       `_verify_print.pdf` · `_draft.html` · `_measure.html` 처럼 고정이면 같은 폴더에서 두
       실행이 서로의 파일을 읽고 지워, 망친 HTML 이 verify 「모두 통과」로 나왔다(재현함).
       mkstemp 가 이름을 고르고 자리를 잡아 두므로 다른 실행이 같은 이름을 쓰지 못한다.
    ⚠️ 이름은 `_` 로 시작해야 한다 — bible-note/ 아래라면 .gitignore 의 `bible-note/**/_*` 에
       걸려, 지우기 전에 커밋에 딸려 가지 않는다(본문이 들어 있다).
    쓰는 쪽이 끝나면(실패해도) finally 에서 _remove_temp 로 지운다. 여기서 연 fd 는 바로 닫는다.
    """
    if not prefix.startswith('_'):
        raise ValueError('임시 파일 이름은 _ 로 시작해야 합니다: %r' % prefix)
    fd, path = tempfile.mkstemp(dir=folder, prefix=prefix, suffix=suffix)
    os.close(fd)
    return path


def _temp_beside(html_path, prefix, suffix):
    """임시 파일은 대상 HTML 옆에 둔다 — 그래야 fonts/ 상대 경로가 그대로 풀린다.
    generate(줄 수 재기)·verify(레이아웃·인쇄) 가 같이 쓴다."""
    return _temp_in(os.path.dirname(os.path.abspath(html_path)), prefix, suffix)


def _remove_temp(path):
    if os.path.exists(path):
        os.remove(path)


def _chrome(chrome, flags, target_path):
    """헤드리스 크롬 호출 한 곳 — generate·verify 가 같이 쓴다.
    ⚠️ timeout 이 없으면 크롬이 멈췄을 때 끝없이 기다린다. 실패해도 원인이 안 보이던 것도
       바로 위(호출한 쪽)에서 stderr 를 실어 알린다(2026-09-22 최종 검토 Minor)."""
    try:
        return subprocess.run(
            [chrome, '--headless', '--disable-gpu'] + flags +
            ['file:///' + os.path.abspath(target_path).replace(os.sep, '/')],
            capture_output=True, timeout=CHROME_TIMEOUT_SEC)
    except subprocess.TimeoutExpired:
        raise SystemExit('!! 크롬이 %d초 안에 끝나지 않았습니다(멈췄을 수 있습니다) — %s'
                          % (CHROME_TIMEOUT_SEC, target_path))


# _git_repo_root() 가 「git 이 PATH 에 없다」를 알릴 때 돌려주는 표 — None(저장소가 아니다)과 다르다.
NO_GIT = object()


def _git_repo_root():
    """이 스크립트(generate.py)가 들어있는 저장소의 루트를 돌려준다.
    이 폴더가 저장소가 아니면(예: bible-note/ 만 복사해 따로 쓰는 경우) None — 그 경우
    ensure_out_path_safe 는 검사 없이 허용한다. git 이 PATH 에 없으면(OSError) NO_GIT —
    저장소인지조차 git 에 물을 수 없으므로 ensure_out_path_safe 가 .git 을 직접 찾는다.

    ⚠️ encoding='utf-8'을 못박는다 — 로캘(이 PC는 cp949)로 풀면 저장소 경로에 한글이
       섞였을 때 UnicodeDecodeError 로 생성기가 그대로 죽는다(2026-09-22 최종 검토 r2
       Minor, 이 PC에서 재현). errors='replace'는 그래도 못 푸는 글자가 있을 때 죽는
       대신 대체 문자로 넘긴다 — 저장소 루트 경로는 정상적으로는 항상 유효한 UTF-8이다.
    """
    here = os.path.dirname(os.path.abspath(__file__))
    try:
        r = subprocess.run(['git', 'rev-parse', '--show-toplevel'],
                            cwd=here, capture_output=True, encoding='utf-8', errors='replace')
    except OSError:
        return NO_GIT  # git 이 없다
    if r.returncode != 0:
        return None  # 저장소가 아니다
    return os.path.normcase(os.path.realpath(r.stdout.strip()))


def _enclosing_repo(path):
    """path 가 들어 있는 폴더에서 위로 올라가며 .git(폴더 · worktree 의 파일)이 있는 폴더를 찾는다.
    없으면 None. git 없이 「저장소 안인가」만 판단할 때 쓴다."""
    d = os.path.dirname(os.path.realpath(os.path.abspath(path)))
    while True:
        if os.path.exists(os.path.join(d, '.git')):
            return d
        parent = os.path.dirname(d)
        if parent == d:
            return None
        d = parent


def _is_git_ignored(repo_root, abs_path):
    r = subprocess.run(['git', 'check-ignore', '-q', abs_path],
                        cwd=repo_root, capture_output=True)
    return r.returncode == 0


def ensure_out_path_safe(out_path):
    """만든 HTML 에는 개역개정 본문이 그대로 들어 있다. 이 저장소는 push 가 곧 배포라
    커밋에 걸리지 않는 자리에만 쓸 수 있게, 쓰기 전에 미리 막는다.

    - 저장소 밖(바탕화면·USB 등)이면 그대로 허용한다.
    - 저장소 안인데 git 이 무시하지 않는 자리(예: marketing/, .gitignore 패턴 밖의 다른
      폴더)면 SystemExit 로 멈춘다 — bible-note/ 아래나 저장소 밖을 쓰라고 알려 준다.
    - 이 폴더가 저장소가 아니면 검사 없이 허용한다.
    - git 이 PATH 에 없으면 무시되는 자리인지 물을 수 없다 — 출력 폴더에서 위로 올라가며 .git 이
      보이면(저장소 안) 멈추고, 안 보이면 허용한다(2026-09-22 최종 검토 r5 Minor 9 · r2 Minor 3 —
      예전엔 git 이 없으면 어디든 허용했다). 기본 자리(bible-note/)도 저장소 안이라 멈춘다.
      서체는 HTML 과 같은 폴더의 fonts/ 에 두므로 HTML 자리 하나만 보면 된다.
    (2026-09-22 최종 검토 Important 1 — `--out`으로 다른 폴더에 낼 때 이 확인이 없었다.)

    ⚠️ HTML 이 bible-note/ 밖이면 `_copy_fonts_beside`가 그 옆에 `fonts/`도 함께 둔다.
       HTML 자체는 무시돼도(예: 루트의 `_유다서.html`은 `/_*.html`로 무시된다) 그 옆
       `fonts/…woff`는 저장소 안인데 안 막혀 있을 수 있다(2026-09-22 최종 검토 r2 —
       실제로 이 PC에서 확인된 자리). 그래서 HTML 이 bible-note/ 밖일 때는
       `render.all_font_urls()`의 서체마다 `<출력 폴더>/fonts/<서체 파일명>`도 같이 본다.
       bible-note/ 안에 쓸 때는 `bible-note/**/fonts/`가 이미 통째로 막혀 있어 보지 않는다.
    """
    root = _git_repo_root()
    if root is NO_GIT:
        repo = _enclosing_repo(out_path)
        if repo is not None:
            raise SystemExit(
                '!! git 이 없어 커밋에서 빠지는 자리인지 확인할 수 없습니다 — '
                '저장소 밖(바탕화면 등)에 저장하세요\n'
                '   저장할 자리: %s (저장소 %s 안)\n'
                '   이 HTML 에는 개역개정 본문이 그대로 들어 있습니다 — --out 으로 저장소 밖을 주세요.'
                % (os.path.abspath(out_path), repo))
        return
    if root is None:
        return
    out_abs = os.path.realpath(os.path.abspath(out_path))
    checks = [(out_path, out_abs)]
    out_dir = os.path.dirname(out_abs) or os.getcwd()
    bible_note_dir = os.path.dirname(os.path.abspath(__file__))
    if os.path.normcase(os.path.realpath(out_dir)) != os.path.normcase(os.path.realpath(bible_note_dir)):
        for font_path in all_font_urls():
            font_label = os.path.join(out_dir, 'fonts', os.path.basename(font_path))
            checks.append((font_label, os.path.realpath(font_label)))
    for label, abs_path in checks:
        norm_path = os.path.normcase(abs_path)
        if norm_path != root and not norm_path.startswith(root + os.sep):
            continue  # 저장소 밖 — 허용
        if _is_git_ignored(root, abs_path):
            continue
        raise SystemExit(
            '!! "%s" 는 저장소 안인데 커밋에서 무시되지 않는 자리입니다.\n'
            '   이 HTML(또는 함께 둘 서체)에는 개역개정 본문이 그대로 들어 있고, 이 저장소는\n'
            '   push 하면 사이트 전체가 그대로 배포됩니다.\n'
            '   bible-note/ 아래(예: bible-note/out/파일명.html)나 저장소 밖(바탕화면·USB 등)에\n'
            '   --out 을 주세요.' % label)


def ensure_fonts():
    """필요한 서체(원문 + 머리글·바닥글 서체가 있으면 그것도)를 받아 둔다 —
    없으면 여기서만 한 번 인터넷이 필요하다.

    ⚠️ 주소가 '' 인 것은 내 PC 서체다(가이드: 「fonts/ 에 복사하고 {'fonts/파일.ttf': ''}」).
       받지 않는다 — 파일이 있으면 크기와 무관하게 그대로 쓰고, 없으면 넣어 달라고 멈춘다.
       Task 8 은 100KB 보다 작은 파일을 「덜 받았다」로 보고 주소 ''로 다시 받으려다 오류가 났다.
    """
    os.makedirs('fonts', exist_ok=True)
    for path, url in all_font_urls().items():
        if not url:
            if os.path.exists(path):
                continue
            raise SystemExit(
                '!! 서체 파일이 없습니다 — %s\n'
                '   내 PC 서체를 쓰려면 그 파일을 bible-note 폴더의 %s 에 넣어 주세요'
                '(주소를 비워 두었으므로 받아 오지 않습니다).' % (path, path))
        if os.path.exists(path) and os.path.getsize(path) > 100000:
            continue
        print('  서체를 받습니다 — %s' % os.path.basename(path))
        try:
            urllib.request.urlretrieve(url, path)
        except Exception as e:
            raise SystemExit(
                '!! 서체를 받지 못했습니다(%s)\n'
                '   인터넷이 되는 곳에서 한 번만 돌리면 fonts/ 에 저장됩니다.\n'
                '   직접 받으려면: %s' % (e, url))


def _copy_fonts_beside(out_path):
    """최종 HTML은 상대 경로 'fonts/...'로 서체를 부른다(render.base_css()·render.page_css()).
    --out이 fonts/가 있는 이 폴더(bible-note/, generate()가 이미 os.chdir 해 둔 cwd)가 아닌
    다른 폴더를 가리키면, 그 폴더에 fonts/를 함께 두어야 옮긴 자리에서도 서체가 그대로
    불린다 — 안 그러면 조용히 대체 서체로 바뀐다(2026-09-22 최종 검토 Important 2).
    HTML 자체에도 서체 로드 실패 경고 배너가 있어(render.FONT_WARN_HTML), 이 복사를
    깜빡하거나 나중에 파일만 다시 옮기더라도 화면에서 바로 드러난다.
    """
    out_dir = os.path.dirname(os.path.abspath(out_path)) or os.getcwd()
    # normcase+realpath 로 비교한다 — 안 그러면 윈도에서 bible-note 와 대소문자만
    # 다른 경로를 '다른 폴더'로 보고 서체를 자기 자신 위에 복사하려다 실측을 다 마친
    # 뒤에 PermissionError 로 죽는다(2026-09-22 최종 검토 Minor).
    if os.path.normcase(os.path.realpath(out_dir)) == os.path.normcase(os.path.realpath(os.getcwd())):
        return
    dst_fonts = os.path.join(out_dir, 'fonts')
    os.makedirs(dst_fonts, exist_ok=True)
    for path in all_font_urls():
        shutil.copy2(path, os.path.join(dst_fonts, os.path.basename(path)))
    print('  서체 폴더를 함께 두었습니다 — %s' % dst_fonts)


def find_book_file(book_name, bible_dir=None):
    """bible/ 폴더에서 이 책과 이름이 정확히 같은 파일을 찾는다.

    예전엔 endswith 로 찾아 부분 이름이 조용히 걸렸다(「서」→ 전도서, 「애가」→
    예레미야애가인데 인쇄본 머리글은 「애가」로 찍힘 — 2026-09-22 최종 검토 Minor).
    파일명에서 뽑은 책 이름(parse.book_name_from_filename)이 딱 같은 것만 찾고,
    없으면 비슷한 이름 후보를 보여 주고 멈춘다.
    """
    if bible_dir is None:
        bible_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'bible')
    candidates = []
    for fn in sorted(os.listdir(bible_dir)):
        if not fn.endswith('.txt'):
            continue
        try:
            name = book_name_from_filename(fn)
        except ValueError:
            continue
        if name == book_name:
            return os.path.join(bible_dir, fn)
        if book_name in name or name in book_name:
            candidates.append(name)
    msg = '!! bible/ 에서 "%s"를 못 찾았습니다' % book_name
    if candidates:
        msg += ' — 혹시 %s?' % ', '.join(sorted(set(candidates)))
    raise SystemExit(msg)


def measure_lines(html_path, chrome):
    """브라우저에 '이 조각(과 그 위 권 제목·장 표시·소제목)이 몇 줄로 찍혔는지' 물어본다.
    결과 키는 (장, 절, 조각, 역할) — 역할은 head · chap · sub · body.
    실측용 사본은 실행마다 다른 이름(_measure_…html)으로 HTML 옆에 두고, 끝나면 지운다."""
    with io.open(html_path, encoding='utf-8') as f:
        html = f.read()
    tmp = _temp_beside(html_path, '_measure_', '.html')
    try:
        with io.open(tmp, 'w', encoding='utf-8') as f:
            f.write(html.replace('</body>', MEASURE_PROBE + '</body>'))
        r = _chrome(chrome, ['--dump-dom', '--virtual-time-budget=20000'], tmp)
    finally:
        _remove_temp(tmp)
    dom = r.stdout.decode('utf-8', 'replace')
    m = re.search(r'<title>LINES\|([^<]*)</title>', dom)
    if not m:
        stderr = r.stderr.decode('utf-8', 'replace').strip()[:500]
        if stderr:
            print('  (크롬 stderr) %s' % stderr)
        return None
    if m.group(1) == 'FONTFAIL':
        raise SystemExit('!! 서체가 불리지 않아 줄 수를 잴 수 없습니다 — fonts/ 를 확인하세요')
    result = {}
    for item in m.group(1).split(';'):
        if not item:
            continue
        ch, vs, pt, role, n = item.split(',')
        result[(int(ch), int(vs), int(pt), role)] = int(n)
    return result


def measure_draft(verses, chrome):
    """1차(실측용) HTML 을 지금 폴더(bible-note/ — fonts/ 가 있는 곳)에 실행마다 다른 이름
    (_draft_…html)으로 써서 줄 수를 잰다. 끝나면(실패해도) 지운다 — 고정 이름(_draft.html)이면
    같은 폴더에서 함께 돌린 다른 생성이 이 실측을 가져갈 수 있었다(최종 검토 r5 Minor 1)."""
    draft_path = _temp_in(os.getcwd(), '_draft_', '.html')
    try:
        with io.open(draft_path, 'w', encoding='utf-8') as f:
            f.write(build_draft_html(verses))
        return measure_lines(draft_path, chrome)
    finally:
        _remove_temp(draft_path)


def apply_line_counts(pieces, lines_map):
    """실측 결과를 조각마다 채운다 — head_lines · chap_lines · sub_lines 와
    lines = 권 제목 + 장 표시 + 소제목 + 본문.

    어느 칸이 있는지는 render.piece_blocks 한 곳이 정한다(1차에 그린 칸 = 여기서 채우는 칸).
    그 칸이 있는데 줄 수를 못 쟀으면(0 도) 멈춘다 — 0 으로 두면 필사 열의 그 칸 높이가 사라져
    아래 필사줄이 원문 줄과 어긋난다. 같은 (장, 절, 조각) 이 둘이면 실측 결과가 한 키에 덮이므로
    역시 멈춘다.
    """
    keys = [(v['chapter'], v['verse'], v.get('part', 0)) for v in pieces]
    if len(set(keys)) != len(keys):
        dup = sorted(k for k in set(keys) if keys.count(k) > 1)[0]
        raise SystemExit('!! %d:%d(조각 %d)이 두 번 나옵니다 — 원문을 확인하세요' % dup)
    for v, key in zip(pieces, keys):
        body_n = lines_map.get(key + ('body',))
        if not body_n:
            raise SystemExit('!! %d:%d(조각 %d) 본문 줄 수를 못 쟀습니다' % key)
        counts = {'head': 0, 'chap': 0, 'sub': 0}
        for role, _text in piece_blocks(v):
            n = lines_map.get(key + (role,))
            if not n:
                raise SystemExit('!! %d:%d(조각 %d) %s 줄 수를 못 쟀습니다' % (key + (role,)))
            counts[role] = n
        for role, n in counts.items():
            v['%s_lines' % role] = n
        v['lines'] = body_n + sum(counts.values())


def default_out_name(book_name, chapter):
    """기본 출력 파일 이름 — 「유다서.html」 · 「요한복음_1장.html」 · 「시편_1편.html」.
    단위 글자는 render.chapter_unit 한 곳에서 정한다(장 표시와 같은 글자)."""
    suffix = '_%d%s' % (chapter, chapter_unit(book_name)) if chapter else ''
    return '%s%s.html' % (book_name, suffix)


def verse_count(pieces):
    """조각이 아니라 절 수 — 끊긴 조각은 세지 않고, 합쳐진 절(2-3)은 둘로 센다."""
    return sum((v.get('verse_end') or v['verse']) - v['verse'] + 1
               for v in pieces if v.get('part', 0) == 0)


def generate(book_name, chapter=None, out_path=None):
    if out_path:
        # chdir 전에 미리 절대경로로 풀어 둔다 — 안 그러면 상대 --out 이 부른 사람의
        # 폴더가 아니라 bible-note/ 기준으로 풀린다(2026-09-22 최종 검토 Important 1 원인).
        out_path = os.path.abspath(out_path)
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    if not out_path:
        out_path = default_out_name(book_name, chapter)
    # 막힐 자리면 서체를 받고 크롬으로 다 잰 뒤가 아니라 처음에 멈춘다
    # (2026-09-22 최종 검토 r2 Minor — 예전엔 이 확인이 맨 끝에 있었다).
    ensure_out_path_safe(out_path)
    ensure_fonts()
    chrome = find_chrome()
    if not chrome:
        raise SystemExit('!! 크롬을 못 찾았습니다 — 헤드리스 실측에 필요합니다.')

    text = load_book_file(find_book_file(book_name))
    verses = parse_book(text, book_name, chapter=chapter)
    if not verses:
        raise SystemExit('!! "%s"(%s)에서 절을 찾지 못했습니다'
                         % (book_name, '%d%s' % (chapter, chapter_unit(book_name))
                            if chapter else '전체'))

    lines_map = measure_draft(verses, chrome)
    if lines_map is None:
        raise SystemExit('!! 줄 수를 재지 못했습니다')

    apply_line_counts(verses, lines_map)

    pages = paginate(verses, lines_per_page())
    _copy_fonts_beside(out_path)
    with io.open(out_path, 'w', encoding='utf-8') as f:
        f.write(build_final_html(pages, book_name))

    print('완료: %s (%d쪽 · %d절)' % (out_path, len(pages), verse_count(verses)))
    return out_path


def main():
    ap = argparse.ArgumentParser(description='성경 필사노트(가로형) 생성')
    ap.add_argument('book', help='책 이름(예: 유다서, 요한복음)')
    ap.add_argument('--chapter', type=int, default=None, help='특정 장만(예: 1)')
    ap.add_argument('--out', default=None, help='출력 파일명')
    args = ap.parse_args()
    try:
        generate(args.book, chapter=args.chapter, out_path=args.out)
    except (FontSettingError, SourceTextError) as e:
        # 서체 설정·원문 줄 문제는 성도님이 고칠 수 있는 것이다 — 파이썬 트레이스백 대신 다른 멈춤과
        # 같은 `!! …` 한 줄로 보인다. 메시지 본문은 그대로(가이드가 인용한다). 그 밖의 오류는
        # 지금처럼 그대로 올라간다(2026-09-22 최종 검토 r5 Minor 4).
        raise SystemExit('!! %s' % e)


if __name__ == '__main__':
    main()
