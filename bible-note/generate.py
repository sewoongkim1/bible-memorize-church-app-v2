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
import subprocess
import sys
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from parse import parse_book, load_book_file
from paginate import paginate
from render import build_draft_html, build_final_html, lines_per_page, FONT_URL

CHROME_CANDS = [
    r'C:\Program Files\Google\Chrome\Application\chrome.exe',
    r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
    os.path.join(os.environ.get('LOCALAPPDATA', ''), r'Google\Chrome\Application\chrome.exe'),
    r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
]

# ⚠️ 줄 수 = 높이 ÷ 줄 높이. Range.getClientRects() 로 상자를 세면 절 번호 <span> 때문에
#    첫 줄을 두세 번 센다(상자·그 안 글자·본문 조각이 따로 잡힌다).
# ⚠️ 서체가 안 불렸으면 대체 서체 기준 줄 수라 인쇄본과 어긋난다 — 재지 않고 멈춘다.
MEASURE_PROBE = """<script>
document.fonts.ready.then(function(){
  var bad = [];
  document.fonts.forEach(function(f){ if (f.status !== 'loaded') bad.push(f.family); });
  if (bad.length) { document.title = 'LINES|FONTFAIL'; return; }
  var out = [];
  document.querySelectorAll('[data-role]').forEach(function(el){
    var lh = parseFloat(getComputedStyle(el).lineHeight);
    var n = Math.round(el.getBoundingClientRect().height / lh);
    out.push(el.dataset.ch + ',' + el.dataset.vs + ',' + el.dataset.role + ',' + n);
  });
  document.title = 'LINES|' + out.join(';');
});
</script>"""


def find_chrome():
    for c in CHROME_CANDS:
        if c and os.path.exists(c):
            return c
    return None


def ensure_fonts():
    """Noto Serif KR 을 받아 둔다 — 없으면 여기서만 한 번 인터넷이 필요하다."""
    os.makedirs('fonts', exist_ok=True)
    for path, url in FONT_URL.items():
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


def find_book_file(book_name):
    """bible/ 폴더에서 이 책 이름으로 끝나는 파일을 찾는다."""
    bible_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'bible')
    target = book_name + '.txt'
    for fn in sorted(os.listdir(bible_dir)):
        if fn.endswith(target):
            return os.path.join(bible_dir, fn)
    raise SystemExit('!! bible/ 에서 "%s"를 못 찾았습니다' % book_name)


def measure_lines(html_path, chrome):
    """브라우저에 '이 절(과 소제목)이 몇 줄로 찍혔는지' 물어본다."""
    with io.open(html_path, encoding='utf-8') as f:
        html = f.read()
    tmp = os.path.join(os.path.dirname(os.path.abspath(html_path)), '_measure.html')
    with io.open(tmp, 'w', encoding='utf-8') as f:
        f.write(html.replace('</body>', MEASURE_PROBE + '</body>'))
    r = subprocess.run(
        [chrome, '--headless', '--disable-gpu', '--dump-dom',
         '--virtual-time-budget=20000',
         'file:///' + tmp.replace(os.sep, '/')],
        capture_output=True)
    os.remove(tmp)
    dom = r.stdout.decode('utf-8', 'replace')
    m = re.search(r'<title>LINES\|([^<]*)</title>', dom)
    if not m:
        return None
    if m.group(1) == 'FONTFAIL':
        raise SystemExit('!! 서체가 불리지 않아 줄 수를 잴 수 없습니다 — fonts/ 를 확인하세요')
    result = {}
    for item in m.group(1).split(';'):
        if not item:
            continue
        ch, vs, role, n = item.split(',')
        result[(int(ch), int(vs), role)] = int(n)
    return result


def generate(book_name, chapter=None, out_path=None):
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    ensure_fonts()
    chrome = find_chrome()
    if not chrome:
        raise SystemExit('!! 크롬을 못 찾았습니다 — 헤드리스 실측에 필요합니다.')

    text = load_book_file(find_book_file(book_name))
    verses = parse_book(text, book_name, chapter=chapter)
    if not verses:
        raise SystemExit('!! "%s"(%s장)에서 절을 찾지 못했습니다'
                         % (book_name, chapter or '전체'))

    draft_path = '_draft.html'
    with io.open(draft_path, 'w', encoding='utf-8') as f:
        f.write(build_draft_html(verses))
    lines_map = measure_lines(draft_path, chrome)
    os.remove(draft_path)
    if lines_map is None:
        raise SystemExit('!! 줄 수를 재지 못했습니다')

    for v in verses:
        body_n = lines_map.get((v['chapter'], v['verse'], 'body'))
        if not body_n:
            raise SystemExit('!! %d:%d 본문 줄 수를 못 쟀습니다' % (v['chapter'], v['verse']))
        sub_n = lines_map.get((v['chapter'], v['verse'], 'sub'), 0) if v['subtitle'] else 0
        v['sub_lines'] = sub_n
        v['lines'] = body_n + sub_n

    pages = paginate(verses, lines_per_page())
    if not out_path:
        suffix = '_%d장' % chapter if chapter else ''
        out_path = '%s%s.html' % (book_name, suffix)
    with io.open(out_path, 'w', encoding='utf-8') as f:
        f.write(build_final_html(pages, book_name))

    print('완료: %s (%d쪽 · %d절)' % (out_path, len(pages), len(verses)))
    return out_path


def main():
    ap = argparse.ArgumentParser(description='성경 필사노트(가로형) 생성')
    ap.add_argument('book', help='책 이름(예: 유다서, 요한복음)')
    ap.add_argument('--chapter', type=int, default=None, help='특정 장만(예: 1)')
    ap.add_argument('--out', default=None, help='출력 파일명')
    args = ap.parse_args()
    generate(args.book, chapter=args.chapter, out_path=args.out)


if __name__ == '__main__':
    main()
