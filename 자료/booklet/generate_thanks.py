# -*- coding: utf-8 -*-
"""2026 추수감사 특별새벽기도회 「감사의 새벽, 은혜를 셉니다」 — 설교 요약 소책자(A5) HTML·PDF.

    python generate_thanks.py           HTML + PDF (+ 넘침 검사)
    python generate_thanks.py --html    HTML 만

쪽 구성(날마다 쪽이 고정이라 차례 번호가 안 틀어진다):
    1 표지 · 2 차례 · 3~8 1~6일차(한 날 한 쪽) · 9 뒷장

원고는 `thanks2026.json` 한 파일이다. **날을 더할 때는 그 날의 "thanks"(감사 둘)만 채우고 다시 돌린다** —
"thanks" 가 빈 날은 「설교 뒤에 채웁니다」 쪽으로 나온다. 날마다 "lead"(머리말 한 줄)는 있어도 없어도 된다.
설교자는 표지에 한 번 — 어느 날 다른 분이 하시면 그 날에 "preacher" 를 적으면 그 쪽에만 나온다.

⚠️ **A5 · 13pt 로는 감사 하나에 본문 6~7줄(150~170자)이 한계다**(2026-10-28 · 처음 원고 230자씩은
   1·2일차가 55~63mm 넘쳤다). 예화는 감사마다 하나만.
표지 사진 `thanks2026-cover.jpg` 는 `thanks_cover.py` 가 1일차 썸네일에서 글자를 지워 만든다(커밋 안 함).

⚠️ 컬러 프린터로 뽑는다 — 쪽 바탕색을 깔지 않는다(친구 2026-10-28). 색은 글자·가는 선·사진에만.
⚠️ 넘친 글자는 경고 없이 잘린다 — 돌릴 때마다 크롬으로 재서 쪽마다 「남은 칸」을 찍는다. 음수면 넘친 것이다.
⚠️ 서체(Noto Serif KR 조각)에 ①·○·「」 가 없다 — 원고에 쓰면 다른 서체로 조용히 바뀐다.
   ‘ ’ “ ” · – … 는 있다.
⚠️ `text-align:justify` 를 쓰지 않는다 — `keep-all` 과 만나면 낱말 사이가 크게 벌어진다.
"""
import html, io, json, os, re, subprocess, sys

os.chdir(os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding='utf-8')

SRC = 'thanks2026.json'
OUT = '감사의새벽_2026추수감사_A5'
COVER = 'thanks2026-cover.jpg'
CI = 'ci-h.png'
BODY_PT = 13          # 본문 글씨(친구 「13 정도」)
PAGE_OF_DAY1 = 3      # 1일차 쪽 — 표지·차례 다음

CHROME_CANDS = [
    r'C:\Program Files\Google\Chrome\Application\chrome.exe',
    r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
    os.path.join(os.environ.get('LOCALAPPDATA', ''), r'Google\Chrome\Application\chrome.exe'),
    r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
]


def find_chrome():
    for c in CHROME_CANDS:
        if c and os.path.exists(c):
            return c
    return None


def esc(t):
    return html.escape(t or '')


CSS = """
@font-face { font-family:'BookKR'; src:url('fonts/NotoSerifKR-400.woff') format('woff'); font-weight:400; }
@font-face { font-family:'BookKR'; src:url('fonts/NotoSerifKR-700.woff') format('woff'); font-weight:700; }
:root { --ink:#2b2522; --soft:#6f6258; --rust:#a0401f; --gold:#b07d24; --verse:#5b4430; --line:#dccbae; }
@page { size:148mm 210mm; margin:0; }
* { box-sizing:border-box; margin:0; padding:0; }
html, body { background:#fff; }
body { font-family:'BookKR', serif; color:var(--ink);
       -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.page { width:148mm; height:210mm; position:relative; overflow:hidden; break-after:page; }
.page:last-child { break-after:auto; }
.box { position:absolute; left:14mm; right:14mm; top:13mm; bottom:15mm; overflow:hidden; }
.pno { position:absolute; left:0; right:0; bottom:7mm; text-align:center;
       font-size:9pt; color:var(--soft); letter-spacing:.06em; }
.kp { word-break:keep-all; overflow-wrap:break-word; }

/* 표지 */
.cover .box { left:16mm; right:16mm; top:25mm; bottom:15mm; text-align:center; }
.cv-ev { font-size:11pt; font-weight:700; color:var(--rust); letter-spacing:.14em; }
.cv-t { font-size:29pt; font-weight:700; line-height:1.32; margin-top:4.5mm; }
.cv-rule { width:16mm; height:.5mm; background:var(--gold); margin:6mm auto 0; }
.cv-sub { font-size:11.5pt; color:var(--soft); margin-top:4mm; letter-spacing:.04em; }
.cv-photo { display:block; width:100%; height:auto; margin-top:11mm; border-radius:2.5mm; }
.cv-date { font-size:11pt; margin-top:9mm; letter-spacing:.05em; }
.cv-who { font-size:10.5pt; color:var(--soft); margin-top:2.2mm; }
.cv-ci { position:absolute; left:50%; bottom:0; transform:translateX(-50%); height:10mm; }

/* 차례 */
.eyebrow { font-size:9.5pt; color:var(--gold); letter-spacing:.12em; font-weight:700; }
.toc h1 { font-size:22pt; font-weight:700; margin-top:2mm; }
.toc .box { left:16mm; right:16mm; top:15mm; bottom:17mm; }
.toc .intro { font-size:11.5pt; line-height:1.68; color:var(--soft); margin-top:4mm; }
.toc ol { list-style:none; margin-top:7mm; border-top:.3mm solid var(--line); }
.toc li { display:flex; align-items:center; gap:4mm; padding:3.3mm 0; border-bottom:.3mm solid var(--line); }
.toc .d { flex:none; width:17mm; }
.toc .d b { display:block; font-size:11.5pt; font-weight:700; color:var(--rust); }
.toc .d span { display:block; font-size:8.8pt; color:var(--soft); margin-top:.7mm; }
.toc .m { flex:1; min-width:0; }
.toc .m b { display:block; font-size:12pt; font-weight:700; line-height:1.42; }
.toc .m span { display:block; font-size:9.3pt; color:var(--soft); margin-top:.7mm; }
.toc .p { flex:none; width:7mm; text-align:right; font-size:11pt; color:var(--soft); }

/* 날마다 한 쪽 */
.dh { display:flex; align-items:baseline; justify-content:space-between; gap:3mm;
      padding-bottom:2.2mm; border-bottom:.3mm solid var(--line); }
.dh .dn { font-size:11pt; font-weight:700; color:var(--rust); letter-spacing:.04em; }
.dh .dd { font-size:10pt; color:var(--soft); margin-left:1.6mm; }
.dh .dp { font-size:10pt; color:var(--soft); white-space:nowrap; }
.dt { font-size:17pt; font-weight:700; line-height:1.4; margin-top:4mm; }
.who { font-size:9.5pt; color:var(--soft); margin-top:1.2mm; }
.lead { font-size:11.5pt; line-height:1.55; color:var(--soft); margin-top:2mm; }
.th { margin-top:5mm; }
.th-k { font-size:9.5pt; font-weight:700; color:var(--gold); letter-spacing:.12em; }
.th h3 { font-size:13.5pt; font-weight:700; color:var(--rust); line-height:1.42; margin-top:.8mm; }
.vs { margin-top:2.2mm; padding:.3mm 0 .3mm 3mm; border-left:.7mm solid var(--gold);
      font-size:11pt; line-height:1.5; color:var(--verse); }
.vs .ref { font-size:9.3pt; color:var(--gold); white-space:nowrap; margin-left:1.2mm; }
.tx { font-size:{BODY}pt; line-height:1.58; margin-top:2.2mm; }
.wait { margin-top:24mm; text-align:center; font-size:11.5pt; line-height:1.8; color:var(--soft); }
.wait .ln { width:12mm; height:.4mm; background:var(--line); margin:0 auto 5mm; }

/* 뒷장 */
.last .box { text-align:center; }
.ls-v { margin-top:44mm; font-size:15.5pt; font-weight:700; line-height:1.95; }
.ls-v2 { margin-top:4.5mm; font-size:12pt; line-height:1.75; color:var(--soft); }
.ls-ref { margin-top:4mm; font-size:10pt; color:var(--gold); letter-spacing:.06em; }
.ls-foot { position:absolute; left:0; right:0; bottom:0; }
.ls-foot .e { font-size:9.5pt; color:var(--soft); letter-spacing:.06em; }
.ls-foot .t { font-size:12pt; font-weight:700; margin-top:1.2mm; }
.ls-foot img { display:block; height:9mm; margin:6mm auto 0; }
"""

# 크롬이 그린 뒤 쪽마다 남은 칸(mm)을 제목에 적는다 — `--dump-dom` 으로 읽는다
FIT_JS = """<script>
document.fonts.ready.then(function () {
  var r = [];
  document.querySelectorAll('.page').forEach(function (p, i) {
    var b = p.querySelector('.box'), n = b && b.querySelector('.in');
    if (!n) return;
    r.push((i + 1) + ':' + ((b.clientHeight - n.offsetHeight) * 25.4 / 96).toFixed(1));
  });
  document.title = 'FIT|' + r.join(',');
});
</script>"""


def cover(b):
    photo = ('<img class="cv-photo" src="%s" alt="">' % COVER) if os.path.exists(COVER) else ''
    ci = ('<img class="cv-ci" src="%s" alt="고척교회">' % CI) if os.path.exists(CI) else ''
    t = esc(b['title']).replace(', ', ',<br>')
    who = ('<div class="cv-who">설교 %s</div>' % esc(b['preacher'])) if b.get('preacher') else ''
    return ('<div class="page cover"><div class="box"><div class="in">'
            '<div class="cv-ev">%s</div><div class="cv-t">%s</div><div class="cv-rule"></div>'
            '<div class="cv-sub">%s</div>%s<div class="cv-date">%s</div>%s'
            '</div>%s</div></div>') % (esc(b['event']), t, esc(b['subtitle']), photo,
                                       esc(b['dates']), who, ci)


def toc(b):
    rows = []
    for d in b['days']:
        rows.append('<li><div class="d"><b>%d일차</b><span>%s</span></div>'
                    '<div class="m"><b class="kp">%s</b><span>%s</span></div>'
                    '<div class="p">%d</div></li>'
                    % (d['day'], esc(d['short']), esc(d['title']), esc(d['passage']),
                       PAGE_OF_DAY1 + d['day'] - 1))
    return ('<div class="page toc"><div class="box"><div class="in">'
            '<div class="eyebrow">%s</div><h1>차례</h1><p class="intro kp">%s</p>'
            '<ol>%s</ol></div></div><div class="pno">2</div></div>'
            % (esc(b['title']), esc(b['intro']), ''.join(rows)))


def day(d, preacher=''):
    head = ('<div class="dh"><div><span class="dn">%d일차</span><span class="dd">%s</span></div>'
            '<span class="dp">%s</span></div><h2 class="dt kp">%s</h2>'
            % (d['day'], esc(d['date']), esc(d['passage']), esc(d['title'])))
    if d.get('preacher') and d['preacher'] != preacher:   # 표지와 다른 분일 때만
        head += '<div class="who">설교 %s</div>' % esc(d['preacher'])
    th = d.get('thanks') or []
    if not th:
        body = '<div class="wait"><div class="ln"></div>말씀 요약은<br>이날 설교 뒤에 채웁니다.</div>'
    else:
        body = ('<p class="lead kp">%s</p>' % esc(d['lead'])) if d.get('lead') else ''
        for k, t in zip(('첫째 감사', '둘째 감사'), th):
            body += ('<section class="th"><div class="th-k">%s</div><h3 class="kp">%s</h3>'
                     '<p class="vs kp">%s<span class="ref">(%s)</span></p><p class="tx kp">%s</p></section>'
                     % (k, esc(t['head']), esc(t['verse']), esc(t['ref']), esc(t['body'])))
    return ('<div class="page day"><div class="box"><div class="in">%s%s</div></div>'
            '<div class="pno">%d</div></div>' % (head, body, PAGE_OF_DAY1 + d['day'] - 1))


def last(b):
    c = b['closing']
    ci = ('<img src="%s" alt="고척교회">' % CI) if os.path.exists(CI) else '<div class="t">고척교회</div>'
    return ('<div class="page last"><div class="box"><div class="in">'
            '<div class="ls-v">%s</div><div class="ls-v2">%s</div><div class="ls-ref">%s</div></div>'
            '<div class="ls-foot"><div class="e">%s</div><div class="t">%s</div>%s</div></div></div>'
            % ('<br>'.join(map(esc, c['lines'])), '<br>'.join(map(esc, c['after'])), esc(c['ref']),
               esc(b['event']), esc(b['title']), ci))


def build(b, measure=False):
    pages = [cover(b), toc(b)] + [day(d, b.get('preacher', '')) for d in b['days']] + [last(b)]
    return ('<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>%s</title>'
            '<style>%s</style></head><body>%s%s</body></html>'
            % (esc(b['title']), CSS.replace('{BODY}', '%g' % BODY_PT), ''.join(pages), FIT_JS if measure else ''))


def chrome_url(p):
    return 'file:///' + os.path.abspath(p).replace(os.sep, '/')


def measure(b):
    """쪽마다 남은 칸(mm). 크롬이 없으면 None."""
    chrome = find_chrome()
    if not chrome:
        return None
    tmp = '_fit_thanks.html'
    io.open(tmp, 'w', encoding='utf-8').write(build(b, measure=True))
    r = subprocess.run([chrome, '--headless', '--disable-gpu', '--dump-dom',
                        '--virtual-time-budget=20000', chrome_url(tmp)], capture_output=True)
    os.remove(tmp)
    m = re.search(r'<title>FIT\|([^<]*)</title>', r.stdout.decode('utf-8', 'replace'))
    if not m:
        return None
    return [(int(a), float(c)) for a, c in (x.split(':') for x in m.group(1).split(',') if x)]


def to_pdf(html_path, pdf_path):
    chrome = find_chrome()
    if not chrome:
        print('   !! 크롬을 못 찾아 PDF 는 건너뜁니다 — HTML 을 열어 직접 인쇄하세요.')
        return False
    if os.path.exists(pdf_path):
        os.remove(pdf_path)
    subprocess.run([chrome, '--headless', '--disable-gpu', '--no-pdf-header-footer',
                    '--print-to-pdf=' + os.path.abspath(pdf_path),
                    '--virtual-time-budget=30000', chrome_url(html_path)], capture_output=True)
    return os.path.exists(pdf_path)


def main():
    if not os.path.exists('fonts/NotoSerifKR-400.woff'):
        raise SystemExit('!! 서체가 없습니다 — `python generate_classics.py` 를 한 번 돌리면 받아 옵니다.')
    if not os.path.exists(COVER):
        print('   !! 표지 사진이 없습니다 — `python thanks_cover.py` 로 만드세요(지금은 사진 없이 나갑니다).')
    b = json.load(io.open(SRC, encoding='utf-8'))
    io.open(OUT + '.html', 'w', encoding='utf-8').write(build(b))
    print('  HTML  %s.html' % OUT)

    fit = measure(b)
    if fit is None:
        print('   !! 크롬으로 넘침을 잴 수 없습니다 — PDF 를 눈으로 확인하세요.')
    else:
        over = [p for p, mm in fit if mm < 0]
        print('  남은 칸(mm)  ' + '  '.join('%d쪽 %.1f' % (p, mm) for p, mm in fit))
        if over:
            print('   !! 넘친 쪽: %s — 원고를 줄이세요(넘친 글자는 잘려 나갑니다).' % over)
    if '--html' not in sys.argv:
        if to_pdf(OUT + '.html', OUT + '.pdf'):
            print('  PDF   %s.pdf' % OUT)


if __name__ == '__main__':
    main()
