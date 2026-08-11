# -*- coding: utf-8 -*-
"""고척교회 성경말씀 필사 소책자 — A5 세로.
   구절당 2쪽: 왼쪽(짝수쪽) 설교 요약 / 오른쪽(홀수쪽) 필사.
   설교는 QR 2개로 연결 — 유튜브 설교영상 · 암송 앱 딥링크(?v=구절번호).
"""
import json, io, re, html, base64, os
import qrcode

SC = 'c:/Projects/bible-memorize-church-app-v2/marketing/'
LOGO = io.open(SC + 'logo-data-uri.txt', encoding='utf-8').read().strip()

ss = json.load(io.open('sermons.json', encoding='utf-8'))
ss = ss.get('sermons', ss) if isinstance(ss, dict) else ss
vs = json.load(io.open('verses.json', encoding='utf-8'))
vs = vs.get('verses', vs) if isinstance(vs, dict) else vs
vs = sorted(vs, key=lambda v: v['no'])
by_no = {s['memVerseNo']: s for s in ss if s.get('memVerseNo')}

os.makedirs('qr', exist_ok=True)


def qr_uri(data, path):
    """QR을 만들어 data URI로. box_size를 키워 인쇄에서 또렷하게."""
    if not os.path.exists(path):
        q = qrcode.QRCode(box_size=10, border=2,
                          error_correction=qrcode.constants.ERROR_CORRECT_M)
        q.add_data(data); q.make(fit=True)
        q.make_image(fill_color="black", back_color="white").save(path)
    b = base64.b64encode(io.open(path, 'rb').read()).decode()
    return 'data:image/png;base64,' + b


def yt_short(url):
    """긴 재생목록 URL → youtu.be/<id> (QR 모듈 수를 줄여 작게 인쇄해도 읽힌다)"""
    m = re.search(r'[?&]v=([A-Za-z0-9_-]{11})', url or '')
    return 'https://youtu.be/' + m.group(1) if m else (url or '')


def emph(t):
    t = html.escape(t or '')
    return re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', t)


def trim(t, n):
    """문장 끝(。.!?)에서 자른다 — 말끝이 '…'로 잘리면 읽는 맛이 떨어진다."""
    t = re.sub(r'\s+', ' ', (t or '').strip())
    if len(t) <= n:
        return t
    cut = t[:n]
    m = max(cut.rfind('. '), cut.rfind('다.'), cut.rfind('요.'), cut.rfind('! '), cut.rfind('? '))
    if m > n * 0.5:
        end = cut.rfind('.', 0, m + 2)
        return cut[:end + 1] if end > 0 else cut.rstrip() + '…'
    return cut.rstrip() + '…'


def sermon_page(v, pno):
    s = by_no.get(v['no']) or {}
    pts = (s.get('points') or [])[:3]
    qs = (s.get('questions') or [])[:3]
    # 세 항목 합계가 지면을 넘지 않도록 항목당 예산을 나눈다
    budget = 560 // max(1, len(pts))
    pt_html = ''.join(
        '<div class="pt"><div class="pt-h"><span class="pt-n">%d</span>%s</div>'
        '<div class="pt-b">%s</div></div>'
        % (i + 1, html.escape(p.get('heading', '')), emph(trim(p.get('body', ''), budget)))
        for i, p in enumerate(pts))
    q_html = ''.join('<div class="q">%s</div>' % html.escape(trim(q, 100)) for q in qs)
    meta = ' · '.join(x for x in [s.get('category', ''),
                                  (s.get('date') or '')[:10].replace('-', '.'),
                                  s.get('preacher', '')] if x)
    return """
<section class="page sermon">
  <div class="pg-head"><span class="pno">%02d</span><span class="pmeta">%s</span></div>
  <h2 class="stitle">%s</h2>
  <div class="sscript">%s</div>
  <div class="ssum">%s</div>
  <div class="pts">%s</div>
  <div class="qs"><div class="qs-t">돌아보기</div>%s</div>
  <div class="foot"><span>고척교회 제자양육부</span><span class="fno">%d</span></div>
</section>""" % (v['no'], html.escape(meta), html.escape(s.get('title', '')),
                 html.escape(s.get('scripture', '')), emph(trim(s.get('summary'), 150)),
                 pt_html, q_html, pno)


def write_page(v, pno):
    s = by_no.get(v['no']) or {}
    text = v['text']
    q_yt = qr_uri(yt_short(v.get('url')), 'qr/yt_%02d.png' % v['no'])
    q_app = qr_uri('https://gocheok.onlybible.kr/?v=%d' % v['no'], 'qr/app_%02d.png' % v['no'])
    return """
<section class="page write">
  <div class="w-top">
    <div class="w-ref">%s</div>
    <div class="w-verse">%s</div>
  </div>
  <div class="w-explain"><b>쉬운 풀이</b> %s</div>
  <div class="w-label">따라 쓰기 <span>— 연한 글씨 위에 한 번, 아래 줄에 옮겨 적어 보세요</span></div>
  <div class="trace">%s</div>
  <div class="wlines"></div>
  <div class="w-tip"><b>기억법</b> %s</div>
  <div class="qr2">
    <div class="qrc"><img src="%s"><span>설교 듣기</span></div>
    <div class="qrc"><img src="%s"><span>앱에서 암송하기</span></div>
    <div class="chk">암송 확인 &nbsp;☐&nbsp; ☐&nbsp; ☐</div>
  </div>
  <div class="foot"><span></span><span class="fno">%d</span></div>
</section>""" % (html.escape(v['refFull']), html.escape(text),
                 html.escape(trim(s.get('easyExplain'), 150)), html.escape(text),
                 html.escape(trim(s.get('memoryTip'), 105)), q_yt, q_app, pno)


# ── 앞·뒤 부속 ────────────────────────────────────────────────
def cover():
    return """
<section class="page cover">
  <div class="cv-in">
    <img class="cv-logo" src="%s">
    <div class="cv-sub">고척교회 제자양육부 신앙운동팀</div>
    <h1 class="cv-t">말씀을<br>손으로 새기다</h1>
    <div class="cv-line"></div>
    <div class="cv-d">성경말씀 암송 필사 노트</div>
    <div class="cv-v">주의 말씀은 내 발에 등이요<br>내 길에 빛이니이다<br><b>시편 119편 105절</b></div>
  </div>
</section>
<section class="page blank"></section>""" % LOGO


def intro():
    return """
<section class="page plain">
  <h2 class="ph">이 노트를 쓰는 법</h2>
  <div class="pbody">
    <p>왼쪽은 그 구절이 나온 <b>설교 요약</b>입니다. 말씀이 어떤 자리에서 주어졌는지
       먼저 읽어 보세요. 뜻을 알고 외우면 훨씬 오래 남습니다.</p>
    <p>오른쪽은 <b>필사</b>입니다. 연한 글씨 위에 한 번 덧쓰고, 아래 빈 줄에 보고 옮겨 적으시면 됩니다.
       하루 한 구절이면 충분합니다.</p>
    <p>필사면 아래에 <b>QR 두 개</b>가 있습니다.
       왼쪽은 <b>설교 영상</b>, 오른쪽은 <b>암송 앱</b>으로 바로 연결됩니다.
       휴대폰 카메라로 비추기만 하면 열립니다.</p>
    <p><b>암송 확인 ☐☐☐</b>은 세 번 외워 보시라는 뜻입니다. 목장 모임에서 확인 표시로 쓰셔도 좋습니다.</p>
  </div>
  <div class="foot"><span>고척교회 제자양육부</span><span class="fno">3</span></div>
</section>"""


def toc(verses):
    half = (len(verses) + 1) // 2
    def col(items):
        return ''.join(
            '<div class="tc"><span class="tn">%02d</span><span class="tr">%s</span>'
            '<span class="tp">%d</span></div>' % (v['no'], html.escape(v['refShort']), 6 + i * 2)
            for i, v in items)
    idx = list(enumerate(verses))
    return """
<section class="page plain">
  <h2 class="ph">차례</h2>
  <div class="toc"><div>%s</div><div>%s</div></div>
  <div class="foot"><span>고척교회 제자양육부</span><span class="fno">4</span></div>
</section>
<section class="page blank"></section>""" % (col(idx[:half]), col(idx[half:]))


def closing(last):
    return """
<section class="page plain">
  <h2 class="ph">암송 점검표</h2>
  <div class="pbody"><p>외운 구절에 표시해 보세요. 한 해가 지나면 이 표가 기록이 됩니다.</p></div>
  <div class="grid">%s</div>
  <div class="foot"><span>고척교회 제자양육부</span><span class="fno">%d</span></div>
</section>
<section class="page blank"></section>
<section class="page cover end">
  <div class="cv-in">
    <img class="cv-logo" src="%s">
    <div class="cv-sub">고척교회 제자양육부 신앙운동팀</div>
    <div class="cv-d" style="margin-top:14mm">오직 성경, 말씀이 답이다!</div>
    <div class="cv-v" style="margin-top:8mm">gocheok.onlybible.kr</div>
  </div>
</section>""" % (''.join('<div class="gc"><b>%02d</b><span>%s</span><i></i></div>'
                        % (v['no'], html.escape(v['refShort'])) for v in vs), last, LOGO)


CSS = """
@page { size: 148mm 210mm; margin: 0; }
* { box-sizing: border-box; }
body { margin:0; font-family:"Noto Sans KR","Malgun Gothic",sans-serif; color:#1c2333;
       -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.page { width:148mm; height:210mm; padding:13mm 13mm 17mm; background:#fff;
        display:flex; flex-direction:column; position:relative; page-break-after:always; overflow:hidden; }
.blank { background:#fff; }
/* 설교 요약 면 */
.pg-head { display:flex; align-items:baseline; gap:2mm; border-bottom:1.2px solid #1a3a6b; padding-bottom:3mm; }
.pno { font-family:"Nanum Myeongjo",serif; font-size:19pt; font-weight:800; color:#1a3a6b; line-height:1; }
.pmeta { font-size:7.4pt; color:#6a7688; }
.stitle { font-family:"Nanum Myeongjo",serif; font-size:14.5pt; font-weight:800; margin:5mm 0 1.5mm; line-height:1.3; }
.sscript { font-size:8.4pt; color:#1a3a6b; font-weight:700; margin-bottom:3.5mm; }
.ssum { font-size:8.8pt; line-height:1.65; background:#f2f5fb; border-left:2.2mm solid #c8a24b;
        padding:3mm 3.5mm; border-radius:1mm; word-break:keep-all; }
.pts { margin-top:4.5mm; flex:1; }
.pt { margin-bottom:3.6mm; }
.pt-h { display:flex; align-items:center; gap:2mm; font-size:9.4pt; font-weight:800; color:#1a3a6b; margin-bottom:1.2mm; }
.pt-n { display:inline-flex; align-items:center; justify-content:center; width:4.4mm; height:4.4mm;
        border-radius:50%; background:#1a3a6b; color:#fff; font-size:6.8pt; flex:none; }
.pt-b { font-size:8.4pt; line-height:1.6; color:#333c4d; padding-left:6.4mm; word-break:keep-all; }
.qs { border-top:1px dashed #b9c0cc; padding-top:3mm; }
.qs-t { font-size:8.2pt; font-weight:800; color:#8a6a1e; margin-bottom:1.5mm; }
.q { font-size:7.8pt; line-height:1.5; color:#4a5364; margin-bottom:.8mm; word-break:keep-all;
     padding-left:3mm; text-indent:-3mm; }
.q::before { content:"· "; }
.foot { position:absolute; left:13mm; right:13mm; bottom:6mm; display:flex; justify-content:space-between;
        font-size:7pt; color:#98a1b2; border-top:.5px solid #dde1e8; padding-top:2mm; }
.fno { font-weight:700; }
/* 필사 면 */
.write { background:#fffdf8; }
.w-top { text-align:center; border-bottom:1.2px solid #c8a24b; padding-bottom:4mm; }
.w-ref { font-size:9.2pt; font-weight:800; color:#8a6a1e; }
.w-verse { font-family:"Nanum Myeongjo",serif; font-size:13pt; font-weight:700; line-height:1.75;
           margin-top:2.5mm; word-break:keep-all; }
.w-explain { font-size:7.8pt; line-height:1.6; color:#5a6273; margin:3.5mm 0 4mm; word-break:keep-all; }
.w-explain b { color:#1a3a6b; }
.w-label { font-size:8pt; font-weight:800; color:#1a3a6b; margin-bottom:2.5mm; }
.w-label span { font-weight:400; color:#98a1b2; font-size:7.2pt; }
.trace { font-family:"Nanum Myeongjo",serif; font-size:11.5pt; line-height:1.9; color:#c9cfd9;
         word-break:keep-all; border-bottom:.6px solid #e3e7ee; padding-bottom:2mm; margin-bottom:3.5mm; }
.wlines { flex:1; min-height:0;
          background-image:repeating-linear-gradient(to bottom,
            transparent 0, transparent 7.4mm, #dfe3ea 7.4mm, #dfe3ea 7.55mm); }
.w-tip { font-size:7.4pt; line-height:1.5; color:#5a6273; background:#f6f1e3;
         border-radius:1.5mm; padding:2.2mm 3mm; margin-top:2.5mm; word-break:keep-all; }
.w-tip b { color:#8a6a1e; }
.qr2 { display:flex; align-items:center; gap:5mm; margin-top:3.5mm; }
.qrc { text-align:center; }
.qrc img { width:14mm; height:14mm; display:block; image-rendering:pixelated; }
.qrc span { display:block; font-size:6.4pt; font-weight:700; color:#5a6273; margin-top:.8mm; }
.chk { margin-left:auto; font-size:7.6pt; font-weight:700; color:#8a95a8; letter-spacing:.02em; }
/* 표지 */
.cover { background:linear-gradient(165deg,#12294f,#1a3a6b 45%,#0f2545); color:#fff;
         align-items:center; justify-content:center; text-align:center; }
.cv-logo { width:26mm; height:26mm; object-fit:cover; object-position:top; margin:0 auto 6mm; }
.cv-sub { font-size:9pt; font-weight:700; color:#e7d6a8; letter-spacing:.04em; }
.cv-t { font-family:"Nanum Myeongjo",serif; font-size:34pt; font-weight:800; line-height:1.25;
        margin-top:9mm; letter-spacing:-.01em; }
.cv-line { width:26mm; height:.6mm; background:#c9a24b; margin:9mm auto; }
.cv-d { font-size:11pt; font-weight:700; color:#cfdcf2; letter-spacing:.06em; }
.cv-v { font-size:9.5pt; line-height:1.9; color:#aebfda; margin-top:12mm; }
.cv-v b { display:block; color:#e7d6a8; margin-top:2mm; }
.end .cv-t { display:none; }
/* 안내·차례·점검표 */
.plain { }
.ph { font-family:"Nanum Myeongjo",serif; font-size:17pt; font-weight:800; color:#1a3a6b;
      border-bottom:1.2px solid #1a3a6b; padding-bottom:3mm; }
.pbody { margin-top:6mm; }
.pbody p { font-size:9pt; line-height:1.85; color:#333c4d; margin:0 0 4mm; word-break:keep-all; }
.toc { display:flex; gap:7mm; margin-top:6mm; }
.toc > div { flex:1; }
.tc { display:flex; align-items:baseline; gap:2mm; font-size:8.6pt; padding:1.6mm 0;
      border-bottom:.5px dotted #d5dae4; }
.tn { font-weight:800; color:#c8a24b; width:6mm; flex:none; }
.tr { flex:1; color:#333c4d; }
.tp { color:#98a1b2; font-size:7.6pt; }
.grid { display:flex; flex-wrap:wrap; gap:2.5mm; margin-top:5mm; }
.gc { width:calc(33.33% - 1.7mm); display:flex; align-items:center; gap:1.5mm; font-size:7.6pt;
      border:.5px solid #e3e7ee; border-radius:1.5mm; padding:2.2mm 2.5mm; }
.gc b { color:#c8a24b; }
.gc span { flex:1; color:#333c4d; }
.gc i { width:4mm; height:4mm; border:.5px solid #b9c0cc; border-radius:.8mm; }
"""

pages = [cover(), intro(), toc(vs)]     # 1,2 표지/뒷장 · 3 사용법 · 4 차례 · 5 여백
p = 6                                    # 본문은 짝수쪽(왼쪽)에서 시작해야 펼침면이 맞는다
for v in vs:
    pages.append(sermon_page(v, p))
    pages.append(write_page(v, p + 1))
    p += 2
pages.append(closing(p))

out = ('<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">'
       '<link href="https://fonts.googleapis.com/css2?family=Nanum+Myeongjo:wght@400;700;800'
       '&family=Noto+Sans+KR:wght@300;400;500;700;800&display=swap" rel="stylesheet">'
       '<style>%s</style></head><body>%s</body></html>' % (CSS, ''.join(pages)))
io.open('booklet.html', 'w', encoding='utf-8').write(out)
print('페이지 수:', out.count('class="page'), '| 구절', len(vs))
