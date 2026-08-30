# -*- coding: utf-8 -*-
"""고척교회 성경말씀 필사 소책자 — A5 세로, 가정용 프린터 인쇄판.
   generate.py(인쇄소용)와의 차이:
   1) 표지는 색지에 인쇄한다 — 배경 채움을 없애고(흰/무배경) 글자만 컬러로,
      색지 자체가 배경색 역할을 하게 한다.
   2) 필사면 배경을 크림색(#fffdf8)에서 흰색으로 — 잉크 절약.
   3) 나머지 강조요소(제목·포인트 번호·박스 등)는 그대로 컬러 유지 — 컬러 인쇄도 겸하므로.
   4) 필사면에 NIV 영어 본문을 작게 참고용으로 추가(별도 쓰기 연습 없이 텍스트만).
   구절당 2쪽 구조·QR 등 나머지는 generate.py와 동일.

   2026-08-30 대개편(샘플 booklet/generate_sample.py에서 검증된 항목을 그대로 옮김):
   - QR 3개(설교 듣기·3분요약 듣기·앱에서 암송하기)
   - 필사면에 "마음에 새기는 묵상" 칸(타이틀만 회색 태그, 줄칸은 흰 배경, 8mm 실선 3줄)
   - 따라쓰기 줄도 8mm 실선으로 통일, trace 바로 아래부터 간격 일정
   - 묵상 칸을 wlines 뒤의 평범한 flex 자식으로 둬 겹침을 원천 차단(절대위치 손계산 금지 —
     블록 실높이를 손으로 어림하면 반드시 어긋난다, 브라우저 레이아웃 엔진에 맡길 것)
   - 설교면: 내용이 짧아 pts(flex:1) 아래가 비면 본문 글자를 살짝 키움(filled<750, sermon.big).
     pts에는 min-height:0+overflow:hidden 안전장치 — 그래도 모자라면 qs가 아니라 pts가 눌림
   - 쉬운 풀이·기억법 글자를 앞장 본문(.pt-b) 크기로, 색은 검정
   - easyExplain·memoryTip은 emph_quotes()로 따옴표 인용구를 굵게(이 두 필드엔 AI가 **표시를
     안 붙여 emph()가 무의미했음 — 대신 인용부호로 감싼 핵심 어구를 굵게 잡는다)
   - 암송확인 체크박스 3→5개
   - 꼬리말 "고척교회 제자양육부"→"고척교회"
"""
import json, io, re, html, base64, os
import qrcode

os.chdir(os.path.dirname(os.path.abspath(__file__)))

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


def emph_quotes(t):
    """easyExplain·memoryTip처럼 **마크업이 없는 필드에서 중요한 부분을 굵게 — 따옴표로
       감싼 인용 구절(핵심 어구·암송 덩어리)을 굵게 잡는다. ** 마크업이 나중에 추가되면
       emph()가 그대로 처리한다."""
    t = t or ''
    parts = re.split(r"('[^']{2,40}')", t)
    return ''.join(
        '<strong>%s</strong>' % html.escape(p) if i % 2 == 1 else emph(p)
        for i, p in enumerate(parts))


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
    budget = 560 // max(1, len(pts))
    sm = trim(s.get('summary'), 150)
    pt_bodies = [trim(p.get('body', ''), budget) for p in pts]
    q_bodies = [trim(q, 100) for q in qs]
    pt_html = ''.join(
        '<div class="pt"><div class="pt-h"><span class="pt-n">%d</span>%s</div>'
        '<div class="pt-b">%s</div></div>'
        % (i + 1, html.escape(p.get('heading', '')), emph(b))
        for i, (p, b) in enumerate(zip(pts, pt_bodies)))
    q_html = ''.join('<div class="q">%s</div>' % html.escape(b) for b in q_bodies)
    meta = ' · '.join(x for x in [s.get('category', ''),
                                  (s.get('date') or '')[:10].replace('-', '.'),
                                  s.get('preacher', '')] if x)
    # 내용이 짧아 pts(flex:1) 아래에 빈 공간이 남는 페이지는 본문 글자를 살짝 키워 채운다.
    filled = len(sm) + sum(len(b) for b in pt_bodies) + sum(len(b) for b in q_bodies)
    cls = 'sermon big' if filled < 750 else 'sermon'
    return """
<section class="page %s">
  <div class="pg-head"><span class="pno">%02d</span><span class="pmeta">%s</span></div>
  <h2 class="stitle">%s</h2>
  <div class="sscript">%s</div>
  <div class="ssum">%s</div>
  <div class="pts">%s</div>
  <div class="qs"><div class="qs-t">돌아보기</div>%s</div>
  <div class="foot"><span>고척교회</span><span class="fno">%d</span></div>
</section>""" % (cls, v['no'], html.escape(meta), html.escape(s.get('title', '')),
                 html.escape(s.get('scripture', '')), emph(sm),
                 pt_html, q_html, pno)


def write_page(v, pno):
    s = by_no.get(v['no']) or {}
    text = v['text']
    text_en = v.get('textEn') or ''
    ref_en = v.get('refEn') or ''
    q_yt = qr_uri(yt_short(v.get('url')), 'qr/yt_%02d.png' % v['no'])
    q_app = qr_uri('https://gocheok.onlybible.kr/?v=%d' % v['no'], 'qr/app_%02d.png' % v['no'])
    audio = s.get('audio') or ''
    q_mp3 = qr_uri('https://sermon.onlybible.kr/' + audio, 'qr/mp3_%02d.png' % v['no']) if audio else ''
    n_lines = max(3, min(6, (len(text) // 22) + 2))
    rows = ''.join('<div class="wline"></div>' for _ in range(n_lines))
    niv_html = ('<div class="niv"><span class="niv-tag">NIV · %s</span>%s</div>'
                % (html.escape(ref_en), html.escape(text_en))) if text_en else ''
    qr3 = (
        '<div class="qrc"><img src="%s"><span>설교 듣기</span></div>'
        '<div class="qrc"><img src="%s"><span>3분요약 듣기</span></div>'
        % (q_yt, q_mp3)
    ) if q_mp3 else '<div class="qrc"><img src="%s"><span>설교 듣기</span></div>' % q_yt
    return """
<section class="page write">
  <div class="w-top">
    <div class="w-ref">%s</div>
    <div class="w-verse">%s</div>
  </div>
  <div class="w-explain"><b>쉬운 풀이</b> %s</div>
  %s
  <div class="w-label">따라 쓰기 <span>— 연한 글씨 위에 한 번, 아래 줄에 옮겨 적어 보세요</span></div>
  <div class="trace">%s</div>
  <div class="wlines">%s</div>
  <div class="bottomblock">
    <div class="note-wrap">
      <div class="note-t">마음에 새기는 묵상</div>
      <div class="note-box">
        <div class="note-rows"><div class="nline"></div><div class="nline"></div><div class="nline"></div></div>
      </div>
    </div>
    <div class="w-tip"><b>기억법</b> %s</div>
    <div class="qr2">
      %s
      <div class="qrc"><img src="%s"><span>앱에서 암송하기</span></div>
      <div class="chk">암송 확인<br>☐&nbsp;☐&nbsp;☐&nbsp;☐&nbsp;☐</div>
    </div>
  </div>
  <div class="foot"><span></span><span class="fno">%d</span></div>
</section>""" % (html.escape(v['refFull']), html.escape(text),
                 emph_quotes(trim(s.get('easyExplain'), 150)), niv_html,
                 html.escape(text), rows,
                 emph_quotes(trim(s.get('memoryTip'), 105)), qr3, q_app, pno)


# ── 앞·뒤 부속 ────────────────────────────────────────────────
def cover():
    return """
<section class="page cover">
  <div class="cv-in">
    <img class="cv-logo" src="%s">
    <h1 class="cv-t">오직 성경,<br>말씀이 답이다!</h1>
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
       <b>NIV 영어 본문</b>도 참고로 함께 실었습니다. 하루 한 구절이면 충분합니다.</p>
    <p><b>마음에 새기는 묵상</b> 칸에는 그날 나눈 은혜나 적용을 자유롭게 적어 보세요.
       목장 나눔이나 개인 QT 메모로 쓰시면 됩니다.</p>
    <p>필사면 아래에 <b>QR 세 개</b>가 있습니다. <b>설교 듣기</b>·<b>3분요약 듣기</b>·<b>암송 앱</b>
       으로 바로 연결됩니다. 휴대폰 카메라로 비추기만 하면 열립니다.</p>
    <p><b>암송 확인 ☐☐☐☐☐</b>은 다섯 번 외워 보시라는 뜻입니다. 목장 모임에서 확인 표시로 쓰셔도 좋습니다.</p>
  </div>
  <div class="foot"><span>고척교회</span><span class="fno">3</span></div>
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
  <div class="foot"><span>고척교회</span><span class="fno">4</span></div>
</section>
<section class="page blank"></section>""" % (col(idx[:half]), col(idx[half:]))


def closing(last):
    return """
<section class="page plain">
  <h2 class="ph">암송 점검표</h2>
  <div class="pbody"><p>외운 구절에 표시해 보세요. 한 해가 지나면 이 표가 기록이 됩니다.</p></div>
  <div class="grid">%s</div>
  <div class="foot"><span>고척교회</span><span class="fno">%d</span></div>
</section>
<section class="page blank"></section>
<section class="page cover end">
  <div class="cv-in">
    <svg class="lamp" viewBox="0 0 200 190" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="100" cy="130" rx="46" ry="16" fill="url(#glow)"/>
      <path d="M100 4 C99 40 101 60 100 78" stroke="#1c2333" stroke-width="3" stroke-linecap="round"/>
      <path d="M58 100 C58 78 76 64 100 64 C124 64 142 78 142 100" stroke="#1c2333" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M55 100 L145 100" stroke="#1c2333" stroke-width="4" stroke-linecap="round"/>
      <circle cx="100" cy="104" r="9" fill="#f6c945" stroke="#1c2333" stroke-width="2.5"/>
      <path d="M74 118 L66 130 M87 122 L82 136 M100 124 L100 138 M113 122 L118 136 M126 118 L134 130"
            stroke="#c8a24b" stroke-width="3" stroke-linecap="round"/>
      <defs><radialGradient id="glow" cx="50%%" cy="50%%" r="50%%">
        <stop offset="0%%" stop-color="#f6c945" stop-opacity=".55"/>
        <stop offset="100%%" stop-color="#f6c945" stop-opacity="0"/>
      </radialGradient></defs>
    </svg>
    <div class="cv-hw">
      <div class="hw1">주의 말씀은</div>
      <div class="hw2">내 발에 등이요</div>
      <div class="hw3">내 길에 빛이니이다</div>
    </div>
    <div class="cv-line"></div>
    <div class="cv-ref">시편 119편 105절</div>
  </div>
</section>""" % (''.join('<div class="gc"><b>%02d</b><span>%s</span><i></i></div>'
                        % (v['no'], html.escape(v['refShort'])) for v in vs), last)


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
.pts { margin-top:4.5mm; flex:1; min-height:0; overflow:hidden; }
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
/* 내용이 짧아 pts(flex:1) 아래에 빈 공간이 남는 페이지는 본문 글자를 살짝 키워 채운다.
   증가폭을 작게 두고 pts에 min-height:0+overflow:hidden 안전장치를 둬, 그래도 모자라면
   qs(질문, 꼬리말 바로 위)가 아니라 pts(점, 위쪽) 쪽이 눌리게 한다. */
.sermon.big .stitle { font-size:15pt; }
.sermon.big .ssum { font-size:9.2pt; line-height:1.7; padding:3.2mm 3.8mm; }
.sermon.big .pt { margin-bottom:4mm; }
.sermon.big .pt-h { font-size:9.8pt; }
.sermon.big .pt-b { font-size:8.8pt; line-height:1.68; }
.sermon.big .qs-t { font-size:8.4pt; }
.sermon.big .q { font-size:8.1pt; line-height:1.55; margin-bottom:1mm; }
.foot { position:absolute; left:13mm; right:13mm; bottom:6mm; display:flex; justify-content:space-between;
        font-size:7pt; color:#98a1b2; border-top:.5px solid #dde1e8; padding-top:2mm; }
.fno { font-weight:700; }
/* 필사 면 — 프린터 인쇄용: 배경 흰색(잉크 절약) */
.write { background:#fff; }
.w-top { text-align:center; border-bottom:1.2px solid #c8a24b; padding-bottom:4mm; }
.w-ref { font-size:9.2pt; font-weight:800; color:#8a6a1e; }
.w-verse { font-family:"Nanum Myeongjo",serif; font-size:13pt; font-weight:700; line-height:1.75;
           margin-top:2.5mm; word-break:keep-all; }
.w-explain { font-size:8.8pt; line-height:1.68; color:#000; margin:3.5mm 0 2mm; word-break:keep-all; }
.w-explain b { color:#000; }
.niv { font-size:6.8pt; line-height:1.55; color:#4a5364; background:#f2f5fb; border-radius:1mm;
       padding:1.8mm 2.6mm; margin-bottom:3mm; word-break:break-word; }
.niv-tag { color:#1a3a6b; font-weight:800; margin-right:1.4mm; }
.w-label { font-size:8pt; font-weight:800; color:#1a3a6b; margin-bottom:2.5mm; }
.w-label span { font-weight:400; color:#98a1b2; font-size:7.2pt; }
.trace { font-family:"Nanum Myeongjo",serif; font-size:11.5pt; line-height:1.9; color:#c9cfd9;
         word-break:keep-all; border-bottom:.6px solid #e3e7ee; padding-bottom:2mm; margin-bottom:0; }
/* 한 줄 높이를 두 구획(따라쓰기·묵상)에서 똑같이 A5 실측 8mm·실선으로 맞춘다 — 일반 노트 줄 간격.
   wlines는 flex:1로 남는 자리만큼 자라되 overflow:hidden이라, 자랄 자리가 8mm 한 줄에 못 미치면
   그 줄은 안 그려진다 — "마음에 새기는 묵상"과 겹치는 대신 생략되는 것.
   ⚠️ 묵상 블록은 반드시 wlines 뒤의 평범한 flex 자식으로 둘 것 — position:absolute로 고정
   거리에 앉히면 블록 실제 높이를 손으로 어림해야 하는데 그 값이 실측과 어긋나기 쉽고, 어긋나면
   QR·줄이 겹치는 사고로 바로 이어진다(2026-08-30 샘플 제작 중 실제로 겪음). wlines가 flex:1로
   남는 공간을 정확히 흡수하는 한, 평범한 순서만으로 "페이지마다 같은 자리"가 자동 보장된다. */
.wlines { flex:1; min-height:0; display:flex; flex-direction:column; overflow:hidden; }
.wline { height:8mm; flex:none; border-bottom:.6px solid #dfe3ea; }
.bottomblock { flex:none; }
.note-wrap { }
.note-t { display:block; font-size:7.6pt; font-weight:800; color:#8a6a1e;
          background:#eef0f3; padding:1.4mm 2.4mm; border-radius:1.5mm; margin-bottom:2.5mm; }
.note-box { }
.note-rows { display:flex; flex-direction:column; }
.nline { height:8mm; flex:none; border-bottom:.6px solid #dfe3ea; }
.w-tip { font-size:8.8pt; line-height:1.68; color:#000; background:#f6f1e3;
         border-radius:1.5mm; padding:2.2mm 3mm; margin-top:2.5mm; word-break:keep-all; }
.w-tip b { color:#000; }
.qr2 { display:flex; align-items:center; gap:3.5mm; margin-top:3.5mm; }
.qrc { text-align:center; flex:none; }
.qrc img { width:12mm; height:12mm; display:block; image-rendering:pixelated; }
.qrc span { display:block; font-size:6pt; font-weight:700; color:#5a6273; margin-top:.8mm; white-space:nowrap; }
.chk { margin-left:auto; font-size:7.2pt; font-weight:700; color:#8a95a8; letter-spacing:.02em;
       text-align:right; line-height:1.5; }
/* 표지 — 프린터 인쇄용: 색지에 인쇄하므로 배경 채움 없이(흰/무배경) 글자만 컬러로 */
.cover { background:#fff; color:#1a3a6b;
         align-items:center; justify-content:center; text-align:center; }
.cv-logo { width:26mm; height:26mm; object-fit:cover; object-position:top; margin:0 auto 6mm; }
.cv-sub { font-size:9pt; font-weight:700; color:#8a6a1e; letter-spacing:.04em; }
.cv-t { font-family:"Nanum Myeongjo",serif; font-size:34pt; font-weight:800; line-height:1.25;
        margin-top:9mm; letter-spacing:-.01em; color:#1a3a6b; }
.cv-line { width:26mm; height:.6mm; background:#c9a24b; margin:9mm auto; }
.cv-d { font-size:11pt; font-weight:700; color:#1a3a6b; letter-spacing:.06em; }
.cv-v { font-size:9.5pt; line-height:1.9; color:#5a6273; margin-top:12mm; }
.cv-v b { display:block; color:#8a6a1e; margin-top:2mm; }
.end .cv-t { display:none; }
/* 뒤표지 — 램프 일러스트 + 손글씨 구절 */
.lamp { width:34mm; height:auto; margin:0 auto 4mm; }
.cv-hw { font-family:"Gaegu","Nanum Myeongjo",serif; }
.cv-hw div { font-size:19pt; font-weight:700; line-height:1.55; }
.hw1 { color:#2e7d32; }
.hw2 { color:#1a5fb4; }
.hw3 { color:#8a6a1e; }
.cv-ref { font-family:"Gaegu","Nanum Myeongjo",serif; font-size:11pt; font-weight:700; color:#5a6273;
          margin-top:2mm; }
.end .cv-line { margin-top:6mm; }
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
       '&family=Noto+Sans+KR:wght@300;400;500;700;800&family=Gaegu:wght@400;700&display=swap" rel="stylesheet">'
       '<style>%s</style></head><body>%s</body></html>' % (CSS, ''.join(pages)))
io.open('booklet_print.html', 'w', encoding='utf-8').write(out)
print('페이지 수:', out.count('class="page'), '| 구절', len(vs))
