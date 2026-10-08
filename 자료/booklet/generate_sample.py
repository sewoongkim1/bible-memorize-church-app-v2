# -*- coding: utf-8 -*-
"""필사 노트 샘플 — 최신 두 구절(34·35)로 컬러/흑백 인쇄용을 한 번에 미리 본다.
   페이지 구성·QR·필사줄 로직은 generate_print.py(가정용 프린터판)와 동일하게 두고,
   색상 팔레트만 __TOKEN__으로 바꿔치기해 컬러판/흑백판 두 CSS를 만든다.
   흑백판은 프린터 드라이버의 자동 회색변환에 기대지 않는다 — 금색(#c8a24b)처럼
   밝은 색은 자동변환 시 아주 옅은 회색이 되어 복사기에서 거의 안 보이므로,
   흑백판은 처음부터 또렷이 읽히는 진회색/검정으로 다시 지정한다.
"""
import json, io, re, html, base64, os
import qrcode

os.chdir(os.path.dirname(os.path.abspath(__file__)))

ss = json.load(io.open('sermons.json', encoding='utf-8'))
ss = ss.get('sermons', ss) if isinstance(ss, dict) else ss
vs_all = json.load(io.open('verses.json', encoding='utf-8'))
vs_all = vs_all.get('verses', vs_all) if isinstance(vs_all, dict) else vs_all
by_no = {s['memVerseNo']: s for s in ss if s.get('memVerseNo')}

TARGET_NOS = [34, 35]   # 최신 두 구절 — 원본 소책자(1~32) 이후 새로 채워진 구절
vs = sorted([v for v in vs_all if v['no'] in TARGET_NOS], key=lambda v: v['no'])

os.makedirs('qr', exist_ok=True)


def qr_uri(data, path):
    if not os.path.exists(path):
        q = qrcode.QRCode(box_size=10, border=2,
                          error_correction=qrcode.constants.ERROR_CORRECT_M)
        q.add_data(data); q.make(fit=True)
        q.make_image(fill_color="black", back_color="white").save(path)
    b = base64.b64encode(io.open(path, 'rb').read()).decode()
    return 'data:image/png;base64,' + b


def yt_short(url):
    m = re.search(r'[?&]v=([A-Za-z0-9_-]{11})', url or '')
    return 'https://youtu.be/' + m.group(1) if m else (url or '')


def emph(t):
    t = html.escape(t or '')
    return re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', t)


def emph_quotes(t):
    """easyExplain·memoryTip처럼 **마크업이 없는 필드에서 중요한 부분을 굵게(사용자 요청,
       2026-08-30) — 이 두 필드는 AI 생성 시 **강조가 안 붙어(35구절 전수 확인, 0건) emph()가
       할 일이 없다. 대신 따옴표로 감싼 인용 구절(핵심 어구·암송 덩어리)을 굵게 잡는다.
       ** 마크업이 나중에 추가되더라도 emph()를 함께 태워 그대로 지원한다."""
    t = t or ''
    parts = re.split(r"('[^']{2,40}')", t)
    return ''.join(
        '<strong>%s</strong>' % html.escape(p) if i % 2 == 1 else emph(p)
        for i, p in enumerate(parts))


def trim(t, n):
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
    # 내용이 짧아 pts(flex:1) 아래에 빈 공간이 남을 사면(600~1010자가 최대 예산인데 그에 한참
    # 못 미치면) 본문 글자를 한 단계 키워 페이지를 채운다 — 예산에 가까운(내용이 많은) 설교는
    # 건드리지 않아 넘침을 피한다.
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
    q_yt = qr_uri(yt_short(v.get('url')), 'qr/samp_yt_%02d.png' % v['no'])
    q_app = qr_uri('https://gocheok.onlybible.kr/?v=%d' % v['no'], 'qr/samp_app_%02d.png' % v['no'])
    audio = s.get('audio') or ''
    q_mp3 = qr_uri('https://sermon.onlybible.kr/' + audio, 'qr/samp_mp3_%02d.png' % v['no']) if audio else ''
    n_lines = max(3, min(6, (len(text) // 22) + 2))
    rows = ''.join('<div class="wline"></div>' for _ in range(n_lines))
    niv_html = ('<div class="niv"><span class="niv-tag">NIV · %s</span>%s</div>'
                % (html.escape(ref_en), html.escape(text_en))) if text_en else ''
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
      <div class="qrc"><img src="%s"><span>설교 듣기</span></div>
      <div class="qrc"><img src="%s"><span>3분요약 듣기</span></div>
      <div class="qrc"><img src="%s"><span>앱에서 암송하기</span></div>
      <div class="chk">암송 확인<br>☐&nbsp;☐&nbsp;☐&nbsp;☐&nbsp;☐</div>
    </div>
  </div>
  <div class="foot"><span></span><span class="fno">%d</span></div>
</section>""" % (html.escape(v['refFull']), html.escape(text),
                 emph_quotes(trim(s.get('easyExplain'), 150)), niv_html,
                 html.escape(text), rows,
                 emph_quotes(trim(s.get('memoryTip'), 105)), q_yt, q_mp3, q_app, pno)


# ── 색 팔레트: 컬러판 그대로 vs 흑백판(대비 확보용으로 새로 지정, 자동변환에 기대지 않음) ──
PALETTES = {
    'color': dict(navy='#1a3a6b', gold='#c8a24b', gold_dark='#8a6a1e',
                  box_bg='#f2f5fb', tip_bg='#f6f1e3', label='컬러 인쇄용'),
    'bw': dict(navy='#1a1a1a', gold='#6b6b6b', gold_dark='#4a4a4a',
               box_bg='#f0f0f0', tip_bg='#eaeaea', label='흑백 인쇄용'),
}

CSS_TMPL = """
@page { size: 148mm 210mm; margin: 0; }
* { box-sizing: border-box; }
body { margin:0; font-family:"Noto Sans KR","Malgun Gothic",sans-serif; color:#1c2333;
       -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.page { width:148mm; height:210mm; padding:13mm 13mm 17mm; background:#fff;
        display:flex; flex-direction:column; position:relative; page-break-after:always; overflow:hidden; }
.pg-head { display:flex; align-items:baseline; gap:2mm; border-bottom:1.2px solid __NAVY__; padding-bottom:3mm; }
.pno { font-family:"Nanum Myeongjo",serif; font-size:19pt; font-weight:800; color:__NAVY__; line-height:1; }
.pmeta { font-size:7.4pt; color:#6a7688; }
.stitle { font-family:"Nanum Myeongjo",serif; font-size:14.5pt; font-weight:800; margin:5mm 0 1.5mm; line-height:1.3; }
.sscript { font-size:8.4pt; color:__NAVY__; font-weight:700; margin-bottom:3.5mm; }
.ssum { font-size:8.8pt; line-height:1.65; background:__BOX_BG__; border-left:2.2mm solid __GOLD__;
        padding:3mm 3.5mm; border-radius:1mm; word-break:keep-all; }
.pts { margin-top:4.5mm; flex:1; min-height:0; overflow:hidden; }
.pt { margin-bottom:3.6mm; }
.pt-h { display:flex; align-items:center; gap:2mm; font-size:9.4pt; font-weight:800; color:__NAVY__; margin-bottom:1.2mm; }
.pt-n { display:inline-flex; align-items:center; justify-content:center; width:4.4mm; height:4.4mm;
        border-radius:50%; background:__NAVY__; color:#fff; font-size:6.8pt; flex:none; }
.pt-b { font-size:8.4pt; line-height:1.6; color:#333c4d; padding-left:6.4mm; word-break:keep-all; }
.qs { border-top:1px dashed #b9c0cc; padding-top:3mm; }
.qs-t { font-size:8.2pt; font-weight:800; color:__GOLD_DARK__; margin-bottom:1.5mm; }
.q { font-size:7.8pt; line-height:1.5; color:#4a5364; margin-bottom:.8mm; word-break:keep-all;
     padding-left:3mm; text-indent:-3mm; }
.q::before { content:"· "; }
/* 내용이 짧아 pts(flex:1) 아래에 빈 공간이 남는 페이지는 본문 글자를 살짝 키워 채운다
   (sermon_page()의 filled<750 판정). 처음엔 더 크게 키웠다가 35번 구절에서 질문 마지막
   줄이 꼬리말과 겹치는 걸 발견 — pts가 flex:1이라도 min-height:auto(기본값)라 qs까지
   커지면 합계가 180mm를 넘어도 그냥 넘쳐버린다. 그래서 ①증가폭을 크게 줄이고
   ②pts에 min-height:0을 줘서, 그래도 모자라면 점(pt) 쪽이 먼저 눌리게 안전장치를 둔다. */
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
.write { background:#fff; }
.w-top { text-align:center; border-bottom:1.2px solid __GOLD__; padding-bottom:4mm; }
.w-ref { font-size:9.2pt; font-weight:800; color:__GOLD_DARK__; }
.w-verse { font-family:"Nanum Myeongjo",serif; font-size:13pt; font-weight:700; line-height:1.75;
           margin-top:2.5mm; word-break:keep-all; }
.w-explain { font-size:8.8pt; line-height:1.68; color:#000; margin:3.5mm 0 2mm; word-break:keep-all; }
.w-explain b { color:#000; }
.niv { font-size:6.8pt; line-height:1.55; color:#4a5364; background:__BOX_BG__; border-radius:1mm;
       padding:1.8mm 2.6mm; margin-bottom:3mm; word-break:break-word; }
.niv-tag { color:__NAVY__; font-weight:800; margin-right:1.4mm; }
.w-label { font-size:8pt; font-weight:800; color:__NAVY__; margin-bottom:2.5mm; }
.w-label span { font-weight:400; color:#98a1b2; font-size:7.2pt; }
.trace { font-family:"Nanum Myeongjo",serif; font-size:11.5pt; line-height:1.9; color:#c9cfd9;
         word-break:keep-all; border-bottom:.6px solid #e3e7ee; padding-bottom:2mm; margin-bottom:0; }
/* 한 줄 높이를 두 구획에서 똑같이 A5 실측 8mm·실선으로 맞춘다 — 일반 노트 줄 간격.
   따라쓰기가 트레이스 글씨 바로 아래부터 같은 간격으로 이어지도록 trace의 margin-bottom도 뺐다
   (전엔 trace 자체 테두리→margin 3.5mm→첫 줄이라 첫 간격만 유독 넓어 보였다).
   wlines는 flex:1로 남는 자리만큼 자라되 overflow:hidden이라, 자랄 자리가 8mm 한 줄에
   못 미치면 그 줄은 안 그려진다 — "마음에 새기는 묵상"과 겹치는 대신 생략되는 것.
   ⚠️ bottomblock을 position:absolute로 고정 거리에 앉혔더니 블록 실제 높이를 손으로 어림한
   값(70.5mm)이 실측과 안 맞아 QR과 wlines 마지막 줄이 겹치는 사고가 났다. → 절대위치를
   버리고 bottomblock을 wlines 뒤에 오는 평범한 flex 자식으로 되돌렸다 — wlines가 flex:1로
   남는 공간을 정확히 흡수하므로(180mm 고정 열) bottomblock은 항상 페이지 바닥에서 같은
   거리에 오고(구절마다 wlines 위 콘텐츠 높이가 달라도 자동 보정), 절대 겹치지 않는다
   (브라우저 레이아웃 엔진이 계산하므로 mm 손계산이 필요 없다 — 더 안전하다). */
.wlines { flex:1; min-height:0; display:flex; flex-direction:column; overflow:hidden; }
.wline { height:8mm; flex:none; border-bottom:.6px solid #dfe3ea; }
.bottomblock { flex:none; }
/* 타이틀만 회색, 줄칸은 배경 없이 흰 바탕(사용자 요청, 2026-08-30). 타이틀의 회색을
   글자만큼만 좁게 감싸던 것(inline-block)을 칸 폭 끝까지 채우도록 block으로 바꿈. */
.note-wrap { }
.note-t { display:block; font-size:7.6pt; font-weight:800; color:__GOLD_DARK__;
          background:#eef0f3; padding:1.4mm 2.4mm; border-radius:1.5mm; margin-bottom:2.5mm; }
.note-box { }
.note-rows { display:flex; flex-direction:column; }
.nline { height:8mm; flex:none; border-bottom:.6px solid #dfe3ea; }
/* 앞장(설교면) 본문(.pt-b)과 같은 크기로 맞춤(사용자 요청, 2026-08-30). 전엔 bottomblock을
   position:absolute로 고정 거리에 앉히느라 이 칸도 height:15mm로 못 박아 뒀었는데, bottomblock을
   평범한 flex 자식으로 되돌린 뒤로는(네 번째 수정) 그 제약이 필요 없어져 자연 높이로 둔다 —
   글자를 키워도 넘칠 걱정 없이 wlines가 알아서 자리를 양보한다. */
.w-tip { font-size:8.8pt; line-height:1.68; color:#000; background:__TIP_BG__;
         border-radius:1.5mm; padding:2.2mm 3mm; margin-top:2.5mm; word-break:keep-all; }
.w-tip b { color:#000; }
.qr2 { display:flex; align-items:center; gap:3.5mm; margin-top:3.5mm; }
.qrc { text-align:center; flex:none; }
.qrc img { width:12mm; height:12mm; display:block; image-rendering:pixelated; }
.qrc span { display:block; font-size:6pt; font-weight:700; color:#5a6273; margin-top:.8mm; white-space:nowrap; }
.chk { margin-left:auto; font-size:7.2pt; font-weight:700; color:#8a95a8; letter-spacing:.02em;
       text-align:right; line-height:1.5; }
.tag { position:fixed; top:4mm; right:6mm; font-size:7pt; color:#c2c8d2; }
"""

pages = []
p = 6
for v in vs:
    pages.append(sermon_page(v, p))
    pages.append(write_page(v, p + 1))
    p += 2
body = ''.join(pages)

for mode, pal in PALETTES.items():
    css = CSS_TMPL
    for token, key in [('__NAVY__', 'navy'), ('__GOLD__', 'gold'),
                        ('__GOLD_DARK__', 'gold_dark'), ('__BOX_BG__', 'box_bg'),
                        ('__TIP_BG__', 'tip_bg')]:
        css = css.replace(token, pal[key])
    out = ('<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">'
           '<link href="https://fonts.googleapis.com/css2?family=Nanum+Myeongjo:wght@400;700;800'
           '&family=Noto+Sans+KR:wght@300;400;500;700;800&display=swap" rel="stylesheet">'
           '<style>%s</style></head><body>%s</body></html>' % (css, body))
    fname = 'sample_%s.html' % mode
    io.open(fname, 'w', encoding='utf-8').write(out)
    print('생성:', fname, '| 팔레트', pal['label'], '| 구절', [v['no'] for v in vs])
