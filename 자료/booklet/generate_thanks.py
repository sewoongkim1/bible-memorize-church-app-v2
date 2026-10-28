# -*- coding: utf-8 -*-
"""2026 추수감사 특별새벽기도회 「감사의 새벽, 은혜를 셉니다」 — 설교 요약 소책자(A5) HTML·PDF.

    python generate_thanks.py           HTML + PDF (+ 넘침 검사)
    python generate_thanks.py --html    HTML 만

쪽 구성(날마다 쪽이 고정이라 차례 번호가 안 틀어진다):
    1 표지 · 2 차례 · 3~8 1~6일차(한 날 한 쪽) · 9~23 데살로니가전서 필사(15쪽) · 24 뒷장 = 24쪽(중철 A4 6장)
필사는 친구가 만든 A4 필사 노트 PDF("pilsa".file · 저장소 밖 자료라 커밋 안 함)를 크롬이 구운 책 사이에
A5 로 줄여 끼운다(PyMuPDF · 벡터 그대로). 완성본은 "out_dir"(자료/2026추수감사절/)에 나온다.

원고는 `thanks2026.json` 한 파일이다. **날을 더할 때는 그 날의 "thanks"(감사 둘)만 채우고 다시 돌린다** —
"thanks" 가 빈 날은 「설교 뒤에 채웁니다」 쪽으로 나온다. 날마다 "lead"(머리말 한 줄)는 있어도 없어도 된다.
설교자는 표지에 한 번 — 어느 날 다른 분이 하시면 그 날에 "preacher" 를 적으면 그 쪽에만 나온다.

⚠️ **A5 · 13pt 로는 감사 하나에 본문 6~7줄(150~170자)이 한계다**(2026-10-28 · 처음 원고 230자씩은
   1·2일차가 55~63mm 넘쳤다). 예화는 감사마다 하나만.

차례의 **설교 영상 QR** 은 유튜브 주소가 아니라 우리 사이트의 짧은 주소(`go/thanks1/`~`go/thanks6/`)를 담는다.
돌릴 때마다 그 주소의 넘김 쪽(저장소 뿌리 `go/thanksN/index.html`)도 원고에서 다시 만든다 —
**영상이 올라오면 그 날의 "video"(영상 ID)·"start"(설교 시작 초)만 적고 다시 돌려 커밋·푸시**하면,
이미 뽑아 둔 책의 QR 이 그 영상으로 넘어간다. "video" 가 빈 날은 「아직 연결 전 · 채널 열기」 쪽이다.
⚠️ QR 에는 끝 「/」 까지 넣는다(`go/README.md`).

⚠️ 컬러 프린터로 뽑는다 — 쪽 바탕색을 깔지 않는다(친구 2026-10-28). 색은 글자·가는 선·그림에만.
⚠️ **표지 그림은 단색 면만 쓴 벡터(SVG)다** — 저해상도 프린터에서도 또렷하게(친구 2026-10-28).
   처음엔 썸네일 사진(글자를 지운 것)을 썼는데 흐린 사진이라 프린터에 따라 뭉개진다. 그라데이션·가는 선을 더하지 말 것.
⚠️ 넘친 글자는 경고 없이 잘린다 — 돌릴 때마다 크롬으로 재서 쪽마다 「남은 칸」을 찍는다. 음수면 넘친 것이다.
⚠️ 서체(Noto Serif KR 조각)에 ①·○·「」 가 없다 — 원고에 쓰면 다른 서체로 조용히 바뀐다.
   ‘ ’ “ ” · – … 는 있다.
⚠️ `text-align:justify` 를 쓰지 않는다 — `keep-all` 과 만나면 낱말 사이가 크게 벌어진다.
"""
import html, io, json, os, re, subprocess, sys
from urllib.parse import urlparse

os.chdir(os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding='utf-8')

SRC = 'thanks2026.json'
OUT = '감사의새벽_2026추수감사_A5'
CI = 'ci-h.png'
ROOT = os.path.abspath(os.path.join('..', '..'))   # 자료/booklet → 저장소 뿌리(넘김 쪽을 쓰는 곳)

# 표지 그림 — 십자가·덮인 성경·가을 잎(썸네일과 같은 소재). 단색 면만.
COVER_ART = """<svg class="cv-art" viewBox="0 0 300 150" xmlns="http://www.w3.org/2000/svg">
<defs>
<path id="mp" d="M0,-48 L8,-30 L20,-37 L17,-18 L38,-25 L31,-9 L45,-3 L24,6 L28,19 L6,12 L2,20 L2,40 L-2,40 L-2,20 L-6,12 L-28,19 L-24,6 L-45,-3 L-31,-9 L-38,-25 L-17,-18 L-20,-37 L-8,-30 Z"/>
<path id="al" d="M0,-30 C15,-16 15,14 0,30 C-15,14 -15,-16 0,-30 Z"/>
</defs>
<rect x="144.5" y="14" width="11" height="90" rx="1.2" fill="#6b3f24"/>
<rect x="121" y="36" width="58" height="10.5" rx="1.2" fill="#6b3f24"/>
<polygon points="70,99 230,99 235,105 65,105" fill="#3c4352"/>
<rect x="66" y="105" width="168" height="11" fill="#efe5cf"/>
<rect x="66" y="109" width="168" height="1.2" fill="#d9ccb0"/>
<rect x="62" y="116" width="176" height="7" rx="1.5" fill="#3c4352"/>
<path d="M178,110 L184,110 L184,131 L181,128 L178,131 Z" fill="#a0401f"/>
<use href="#mp" transform="translate(64,121) rotate(-28) scale(.5)" fill="#b4441f"/>
<use href="#al" transform="translate(38,127) rotate(-72) scale(.62)" fill="#d6a12e"/>
<use href="#mp" transform="translate(100,131) rotate(12) scale(.36)" fill="#d97b29"/>
<use href="#mp" transform="translate(238,119) rotate(26) scale(.55)" fill="#8e2c1d"/>
<use href="#al" transform="translate(266,128) rotate(70) scale(.6)" fill="#d97b29"/>
<use href="#mp" transform="translate(203,132) rotate(-14) scale(.34)" fill="#d6a12e"/>
<use href="#al" transform="translate(92,46) rotate(32) scale(.42)" fill="#d6a12e"/>
<use href="#mp" transform="translate(214,28) rotate(-22) scale(.3)" fill="#b4441f"/>
</svg>"""
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
:root { --ink:#2b2522; --soft:#6f6258; --rust:#a0401f; --gold:#b07d24; --verse:#5b4430; --line:#dccbae;
        --app:#12294f; }
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
.cv-art { display:block; width:100%; height:auto; margin-top:9mm; }
.cv-date { font-size:11pt; margin-top:9mm; letter-spacing:.05em; }
.cv-who { font-size:10.5pt; color:var(--soft); margin-top:2.2mm; }
.cv-ci { position:absolute; left:50%; bottom:0; transform:translateX(-50%); height:10mm; }

/* 차례 */
.toc h1 { font-size:21pt; font-weight:700; }
.toc .box { left:16mm; right:16mm; top:15mm; bottom:17mm; }
.toc .intro { font-size:11.5pt; line-height:1.68; color:var(--soft); margin-top:4mm; }
.toc .hint { font-size:9.5pt; color:var(--gold); margin-top:2.6mm; }
.toc ol { list-style:none; margin-top:4.5mm; border-top:.3mm solid var(--line); }
.toc li { display:flex; align-items:center; gap:3mm; padding:1.7mm 0; border-bottom:.3mm solid var(--line); }
.toc .d { flex:none; width:17mm; }
.toc .d b { display:block; font-size:11.5pt; font-weight:700; color:var(--rust); }
.toc .d span { display:block; font-size:8.8pt; color:var(--soft); margin-top:.7mm; }
.toc .m { flex:1; min-width:0; }
.toc .m b { display:block; font-size:11.5pt; font-weight:700; line-height:1.42; }
.toc .m span { display:block; font-size:9.3pt; color:var(--soft); margin-top:.7mm; }
.toc .p { flex:none; width:6mm; text-align:right; font-size:11pt; color:var(--soft); }
.toc .q { flex:none; width:16mm; height:16mm; }
.toc .q svg { display:block; width:100%; height:100%; }
.toc li.ps { padding:2.6mm 0; }
.toc li.ps .q { height:auto; }

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
.ls-v { margin-top:16mm; font-size:15.5pt; font-weight:700; line-height:1.95; }
/* 암송 앱 설치 광고 — 바탕 없이 남색 테두리만(앱 색). 문구는 현관 포스터(2026-10-15)와 같다 */
.ad { margin-top:14mm; display:flex; align-items:center; gap:5mm; text-align:left;
      border:.35mm solid var(--app); border-radius:3mm; padding:5mm 5mm 5mm 6mm; }
.ad-t { flex:1; min-width:0; }
.ad-k { font-size:9pt; font-weight:700; color:var(--app); letter-spacing:.08em; }
.ad-h { font-size:14.5pt; font-weight:700; line-height:1.38; color:var(--app); margin-top:1.4mm; }
.ad-s { font-size:10pt; line-height:1.55; color:var(--ink); margin-top:2mm; }
.ad ol { list-style:none; counter-reset:st; margin-top:2.4mm; }
.ad li { counter-increment:st; font-size:9.5pt; line-height:1.6; color:var(--soft); }
.ad li::before { content:counter(st) ". "; font-weight:700; color:var(--app); }
.ad-q { flex:none; width:26mm; text-align:center; }
.ad-q svg { display:block; width:26mm; height:26mm; }
.ad-q .c { font-size:8.5pt; color:var(--app); margin-top:1.2mm; }
.ad-q .k { font-size:7.8pt; color:var(--soft); margin-top:.6mm; }
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
    photo = COVER_ART
    ci = ('<img class="cv-ci" src="%s" alt="고척교회">' % CI) if os.path.exists(CI) else ''
    t = esc(b['title']).replace(', ', ',<br>')
    who = ('<div class="cv-who">설교 %s</div>' % esc(b['preacher'])) if b.get('preacher') else ''
    return ('<div class="page cover"><div class="box"><div class="in">'
            '<div class="cv-ev">%s</div><div class="cv-t">%s</div><div class="cv-rule"></div>'
            '<div class="cv-sub">%s</div>%s<div class="cv-date">%s</div>%s'
            '</div>%s</div></div>') % (esc(b['event']), t, esc(b['subtitle']), photo,
                                       esc(b['dates']), who, ci)


def qr_svg(url):
    """QR 을 벡터(SVG)로 — 칸이 면이라 저해상도 프린터에서도 또렷하다. 바깥 여백은 1칸 + 쪽의 흰 바탕."""
    import qrcode
    q = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, border=1)
    q.add_data(url)
    q.make(fit=True)
    m = q.get_matrix()
    n, d = len(m), []
    for y, row in enumerate(m):
        x = 0
        while x < n:
            if not row[x]:
                x += 1
                continue
            s = x
            while x < n and row[x]:
                x += 1
            d.append('M%d %dh%dv1h-%dz' % (s, y, x - s, x - s))
    return ('<svg viewBox="0 0 %d %d" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg">'
            '<path d="%s" fill="#000"/></svg>' % (n, n, ''.join(d)))


def link_url(b, d):
    """QR 이 담는 주소 — 끝 「/」 까지(없으면 GitHub Pages 가 한 번 더 돌린다)."""
    return '%s%d/' % (b['link_base'], d['day'])


def toc(b):
    rows = []
    for d in b['days']:
        rows.append('<li><div class="d"><b>%d일차</b><span>%s</span></div>'
                    '<div class="m"><b class="kp">%s</b><span>%s</span></div>'
                    '<div class="p">%d</div><div class="q">%s</div></li>'
                    % (d['day'], esc(d['short']), esc(d['title']), esc(d['passage']),
                       PAGE_OF_DAY1 + d['day'] - 1, qr_svg(link_url(b, d))))
    ps = b.get('pilsa')
    if ps and os.path.exists(ps['file']):
        rows.append('<li class="ps"><div class="d"><b>필사</b><span>%s</span></div>'
                    '<div class="m"><b class="kp">%s</b><span>%s</span></div>'
                    '<div class="p">%d</div><div class="q"></div></li>'
                    % (esc(ps['span']), esc(ps['title']), esc(ps['sub']), pilsa_first_page(b)))
    return ('<div class="page toc"><div class="box"><div class="in">'
            '<h1>차례</h1><p class="intro kp">%s</p>'
            '<p class="hint kp">오른쪽 QR을 휴대폰 카메라로 비추면 그날 설교 영상이 열립니다.</p>'
            '<ol>%s</ol></div></div><div class="pno">2</div></div>'
            % (esc(b['intro']), ''.join(rows)))


def pilsa_first_page(b):
    return PAGE_OF_DAY1 + len(b['days'])


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
            '<div class="ls-v">%s</div><div class="ls-v2">%s</div><div class="ls-ref">%s</div>%s</div>'
            '<div class="ls-foot"><div class="e">%s</div><div class="t">%s</div>%s</div></div></div>'
            % ('<br>'.join(map(esc, c['lines'])), '<br>'.join(map(esc, c['after'])), esc(c['ref']),
               app_ad(b), esc(b['event']), esc(b['title']), ci))


def app_ad(b):
    """뒷장의 성경말씀 암송 앱 설치 광고 — QR 은 설치 안내 쪽(/install/ · 휴대폰 종류에 맞는 단추)."""
    a = b.get('app_ad')
    if not a:
        return ''
    return ('<div class="ad"><div class="ad-t"><div class="ad-k">%s</div><div class="ad-h kp">%s</div>'
            '<div class="ad-s kp">%s</div><ol>%s</ol></div>'
            '<div class="ad-q">%s<div class="c">%s</div><div class="k">%s</div></div></div>'
            % (esc(a['kicker']), '<br>'.join(map(esc, a['head'])), esc(a['sub']),
               ''.join('<li class="kp">%s</li>' % esc(s) for s in a['steps']),
               qr_svg(a['url']), esc(a['cap']), '<br>'.join(map(esc, a['kinds']))))


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


LINK_PAGE = """<!doctype html>
<!-- 만든 곳: 자료/booklet/generate_thanks.py ← thanks2026.json — 손으로 고치지 말 것 -->
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>%(n)d일차 설교 영상 · %(book)s</title>%(refresh)s
<style>
:root { --bg:#fff; --ink:#2b2522; --soft:#6f6258; --rust:#a0401f; --btn:#a0401f; }
@media (prefers-color-scheme: dark) { :root { --bg:#1f1b19; --ink:#f3ece6; --soft:#c3b6aa; --rust:#e3936d; --btn:#b34f27; } }
body { margin:0; padding:48px 20px; background:var(--bg); color:var(--ink); text-align:center; word-break:keep-all;
       font-family:-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif; }
.k { font-size:14px; font-weight:700; color:var(--rust); letter-spacing:.04em; }
h1 { font-size:22px; line-height:1.45; margin:10px 0 6px; }
.p { font-size:14px; color:var(--soft); }
.m { font-size:16px; line-height:1.65; margin:28px 0; }
a.b { display:inline-block; padding:14px 24px; border-radius:12px; background:var(--btn); color:#fff;
      font-size:17px; font-weight:700; text-decoration:none; }
</style>
</head>
<body>
<div class="k">%(event)s · %(n)d일차</div>
<h1>%(title)s</h1>
<div class="p">%(date)s · %(passage)s</div>
<p class="m">%(msg)s</p>
<a class="b" href="%(href)s">%(btn)s</a>%(script)s
</body>
</html>
"""


def video_url(d):
    if not d.get('video'):
        return ''
    return 'https://www.youtube.com/watch?v=%s%s' % (d['video'], ('&t=%ds' % d['start']) if d.get('start') else '')


def link_page(b, d):
    url = video_url(d)
    v = dict(n=d['day'], book=esc(b['title']), event=esc(b['event']), title=esc(d['title']),
             date=esc(d['date']), passage=esc(d['passage']))
    if url:
        v.update(refresh='\n<meta http-equiv="refresh" content="0; url=%s">' % esc(url),
                 msg='설교 영상으로 넘어갑니다…', href=esc(url), btn='영상 바로 보기',
                 script='\n<script>location.replace(%s);</script>' % json.dumps(url))
    else:   # 영상이 아직 없는 날 — 거짓 없이 「아직」 이라 하고 채널로
        v.update(refresh='', msg='아직 이날 설교 영상이 연결되지 않았습니다.<br>고척교회 유튜브에서 보실 수 있습니다.',
                 href=esc(b['channel']), btn='고척교회 유튜브 열기', script='')
    return LINK_PAGE % v


def write_links(b):
    """QR 이 가리키는 넘김 쪽을 저장소 뿌리에 쓴다. 바뀐 쪽 수를 돌려준다."""
    changed = []
    for d in b['days']:
        rel = urlparse(link_url(b, d)).path.strip('/')
        p = os.path.join(ROOT, *rel.split('/'), 'index.html')
        new = link_page(b, d)
        old = io.open(p, encoding='utf-8').read() if os.path.exists(p) else None
        if new != old:
            os.makedirs(os.path.dirname(p), exist_ok=True)
            io.open(p, 'w', encoding='utf-8', newline='\n').write(new)
            changed.append('%s/  →  %s' % (rel, video_url(d) or '(영상 전 · 채널 안내)'))
    return changed


def assemble(b, main_pdf, out_pdf):
    """크롬이 구운 책(표지~6일차 · 뒷장) 사이에 필사 노트(A4)를 A5 로 줄여 끼운다 — 벡터 그대로."""
    import pymupdf
    src = pymupdf.open(main_pdf)
    ps = b.get('pilsa')
    if not ps or not os.path.exists(ps['file']):
        if ps:
            print('   !! 필사 PDF 가 없습니다 — %s  (필사 없이 냅니다)' % ps['file'])
        src.save(out_pdf)
        return src.page_count, 0
    note = pymupdf.open(ps['file'])
    out = pymupdf.open()
    cut = PAGE_OF_DAY1 - 1 + len(b['days'])          # 6일차까지
    out.insert_pdf(src, from_page=0, to_page=cut - 1)
    w, h = src[0].rect.width, src[0].rect.height
    for i in range(note.page_count):
        pg = out.new_page(width=w, height=h)
        pg.show_pdf_page(pg.rect, note, i)            # A4 → A5 (같은 비율이라 꼭 맞는다)
    out.insert_pdf(src, from_page=cut, to_page=src.page_count - 1)
    out.save(out_pdf, garbage=3, deflate=True)
    return out.page_count, note.page_count


def main():
    if not os.path.exists('fonts/NotoSerifKR-400.woff'):
        raise SystemExit('!! 서체가 없습니다 — `python generate_classics.py` 를 한 번 돌리면 받아 옵니다.')
    b = json.load(io.open(SRC, encoding='utf-8'))
    io.open(OUT + '.html', 'w', encoding='utf-8').write(build(b))
    print('  HTML  %s.html' % OUT)
    ch = write_links(b)
    print('  QR 넘김 쪽  %d개 바뀜%s' % (len(ch), ''.join('\n     ' + c for c in ch)))
    if ch:
        print('   → 커밋·푸시해야 QR 이 새 곳으로 넘어간다(go/ 는 사이트로 나간다).')

    fit = measure(b)
    if fit is None:
        print('   !! 크롬으로 넘침을 잴 수 없습니다 — PDF 를 눈으로 확인하세요.')
    else:
        over = [p for p, mm in fit if mm < 0]
        print('  남은 칸(mm)  ' + '  '.join('%d쪽 %.1f' % (p, mm) for p, mm in fit))
        if over:
            print('   !! 넘친 쪽: %s — 원고를 줄이세요(넘친 글자는 잘려 나갑니다).' % over)
    if '--html' not in sys.argv:
        tmp = '_thanks_main.pdf'
        if to_pdf(OUT + '.html', tmp):
            final = os.path.join(b.get('out_dir') or '.', OUT + '.pdf')
            n, k = assemble(b, tmp, final)
            os.remove(tmp)
            print('  PDF   %s  (%d쪽 · 필사 %d쪽%s)' % (os.path.normpath(final), n, k,
                                                  '' if n % 4 == 0 else ' · ⚠ 4의 배수 아님 — 중철로 접으면 빈 쪽'))


if __name__ == '__main__':
    main()
