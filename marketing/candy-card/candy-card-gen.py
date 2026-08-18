# -*- coding: utf-8 -*-
"""사탕 봉지에 넣는 명함 크기 초대 카드 — 두 종류(앞면만 다르고 뒷면 안내는 같다).

  119-103 「꿀」 : 주의 말씀의 맛이 ... 꿀보다 더 다니이다  → 사탕과 맞물린다
  119-105 「등불」: 주의 말씀은 내 발에 등이요 ...          → 앱 태그라인과 같다
  두 구절은 같은 시편 안에서 이어진다.

■ 배경색을 쓰지 않는다 — 색도화지에 컬러 프린터로 직접 인쇄하기 때문.
  컬러 프린터는 흰색을 인쇄하지 못한다(흰색 = 잉크 없음 = 종이색이 그대로 비침).
  그래서 QR 뒤에 흰 사각을 깔 수 없고, 진한 종이에서는 QR도 글씨도 묻힌다.
  → 연한 파스텔 계열 종이 + 진한 네이비 잉크만으로 성립하도록 짰다.

■ 양면이 어긋나도 티가 안 나게
  프린터 양면 인쇄는 1~2mm씩 밀리는 것이 정상이다. 앞뒤 모두에 테두리를 두면
  한 번 자를 때 한쪽은 반드시 삐뚤어 보인다. 그래서
    - 테두리는 앞면에만, 재단선에서 2mm 안쪽으로 물려 둔다(디자인이지 재단선이 아니다)
    - A4 판에서 카드 사이에 4mm 여유를 준다
    - 재단 표시는 앞장 가장자리의 짧은 눈금뿐 — 카드 위를 지나는 선이 없다

■ QR을 앞면에 두지 않는 이유
  투명 봉투 안에서 사탕이 카드 아래쪽을 가린다. 앞면에 QR이 있으면 스캔이 아예 안 된다.
  사탕을 꺼내려면 어차피 봉투를 열게 되므로 QR은 뒷면에 크게 둔다.

출력 (모두 이 폴더)
  사탕카드_A4_119-103.pdf / _119-105.pdf   A4 10장 앉힘(2쪽: 앞장·뒷장) ← 색도화지 자체 인쇄용
  사탕카드_낱장_119-103.pdf / _119-105.pdf 낱장 2쪽(94x54mm) ← 인쇄소 맡길 때
  사탕카드_미리보기.png                     두 판 나란히
  사탕카드_종이색_미리보기.png              종이색 8종 위
"""
import io, os

HERE = os.path.dirname(os.path.abspath(__file__))
M = os.path.join(HERE, '..')
LOGO = io.open(os.path.join(M, 'logo-data-uri.txt'), encoding='utf-8').read().strip()
QR = io.open(os.path.join(M, 'qr-data-uri.txt'), encoding='utf-8').read().strip()

# 잉크는 두 가지만 — 진한 네이비(본문)와 골드(액센트).
STYLE = """
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family:"Noto Sans KR","Malgun Gothic",sans-serif; color:#12294f;
       -webkit-print-color-adjust:exact; print-color-adjust:exact; }

.card { width:94mm; height:54mm; padding:2mm; overflow:hidden; position:relative;
        background:transparent; }
.holder { width:90mm; height:50mm; padding:2mm; }          /* 2mm = 재단 여유 */
.inner { width:86mm; height:46mm; padding:3.6mm 4.4mm; position:relative; overflow:hidden;
         display:flex; flex-direction:column; }
.front .inner { border:.35mm solid #9aa8c0; border-radius:2.4mm; }

/* ── 앞면 ── */
.ref { font-size:6.6pt; font-weight:800; color:#a8862f; letter-spacing:.10em; }
.verse { font-family:"Nanum Myeongjo","Batang","바탕",serif; font-size:10.4pt; font-weight:700;
         line-height:1.55; color:#12294f; margin-top:2.2mm; word-break:keep-all; letter-spacing:-.01em; }
.rule { width:11mm; height:.6mm; background:#c8a24b; margin:3.2mm 0 2.8mm; border-radius:.3mm; }
.invite { font-size:9.6pt; font-weight:700; line-height:1.5; color:#1c2333; word-break:keep-all; }
.invite b { color:#a8862f; }
.brand { position:absolute; right:4.4mm; bottom:3.4mm; display:flex; align-items:center; gap:1.3mm; }
.brand img { width:4.2mm; height:4.2mm; object-fit:cover; object-position:top; }
.brand span { font-size:6.8pt; font-weight:800; color:#4a5a7a; }

/* ── 뒷면 (두 판 공통) ── */
.b-title { font-family:"Nanum Myeongjo","Batang","바탕",serif; font-size:11.4pt; font-weight:800;
           color:#12294f; letter-spacing:-.01em; }
.b-main { display:flex; gap:3.8mm; align-items:center; margin-top:2.4mm; }
/* QR은 종이색 위에 검게 찍힌다(흰 바탕을 깔 수 없다) — 연한 종이에서만 안전하다. */
.b-qr { width:22mm; height:22mm; flex:0 0 auto; image-rendering:pixelated;
        border:.35mm solid #9aa8c0; border-radius:.8mm; padding:.6mm; }
.steps { flex:1; min-width:0; }
.step { display:flex; gap:1.6mm; align-items:baseline; font-size:8.2pt; line-height:1.5;
        color:#1c2333; word-break:keep-all; }
.step i { font-style:normal; font-weight:800; color:#a8862f; flex:0 0 auto; }
/* 배지도 면을 칠하지 않고 테두리로 — 색도화지 위에서 면을 칠하면 종이색과 싸운다 */
.gift { margin-top:2.2mm; font-size:7.8pt; font-weight:800; color:#12294f;
        border:.35mm solid #c8a24b; border-radius:1mm; padding:1.1mm 2.2mm; display:inline-block;
        word-break:keep-all; }
.b-foot { margin-top:auto; display:flex; justify-content:space-between; align-items:flex-end; gap:2mm; }
.b-foot .url { font-size:7.4pt; font-weight:800; color:#12294f; }
.b-foot .help { font-size:6.6pt; color:#4a5a7a; line-height:1.45; text-align:right; word-break:keep-all; }
"""

# ── 두 판의 앞면 ────────────────────────────────────────────────
VARIANTS = [
    {
        'key': '119-103', 'name': '꿀',
        'ref': '시편 119:103',
        'verse': '주의 말씀의 맛이 내게 어찌 그리 단지요<br>내 입에 꿀보다 더 다니이다',
        # 사탕을 입에 넣는 순간 문구가 몸으로 이해된다
        'invite': '이 사탕이 녹는 동안,<br><b>말씀 한 구절</b> 어떠세요?',
    },
    {
        'key': '119-105', 'name': '등불',
        'ref': '시편 119:105',
        'verse': '주의 말씀은 내 발에 등이요<br>내 길에 빛이니이다',
        # 앱 태그라인과 같은 구절 — 빛의 이미지에 맞춰 초대문도 바꾼다
        'invite': '오늘 하루,<br><b>말씀 한 구절</b>로 밝혀 보세요',
    },
]

FRONT_TPL = """<div class="inner">
  <div class="ref">{ref}</div>
  <div class="verse">{verse}</div>
  <div class="rule"></div>
  <div class="invite">{invite}</div>
  <div class="brand"><img src="%s"><span>고척교회</span></div>
</div>""" % LOGO

BACK_IN = """<div class="inner">
  <div class="b-title">말씀암송이 답이다!</div>
  <div class="b-main">
    <img class="b-qr" src="%s">
    <div class="steps">
      <div class="step"><i>①</i><span>QR을 스캔하세요</span></div>
      <div class="step"><i>②</i><span>교구·목장·이름 입력</span></div>
      <div class="step"><i>③</i><span>이번 주 말씀 빈칸 채우기</span></div>
      <div class="gift">참여하신 분께 선물 · ~ 9월 30일</div>
    </div>
  </div>
  <div class="b-foot">
    <div class="url">gocheok.onlybible.kr</div>
    <div class="help">설치·사용법은 1층 로비에서<br>고척교회 제자양육부</div>
  </div>
</div>""" % QR

for v in VARIANTS:
    v['front_in'] = FRONT_TPL.format(ref=v['ref'], verse=v['verse'], invite=v['invite'])

FONTLINK = ('<link href="https://fonts.googleapis.com/css2?'
            'family=Nanum+Myeongjo:wght@400;700;800&'
            'family=Noto+Sans+KR:wght@400;500;700;800&display=swap" rel="stylesheet">')
HEAD = '<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">' + FONTLINK + '<style>'


def write(name, html):
    io.open(os.path.join(HERE, name), 'w', encoding='utf-8').write(html)


# ── 1) 낱장(94x54mm 2쪽) ────────────────────────────────────────
for v in VARIANTS:
    write('candy-card-%s.html' % v['key'],
          HEAD + '@page { size: 94mm 54mm; margin: 0; }' + STYLE +
          '.card { page-break-after:always; } .card:last-child { page-break-after:auto; }'
          '</style></head><body>'
          '<div class="card front"><div class="holder">' + v['front_in'] + '</div></div>'
          '<div class="card back"><div class="holder">' + BACK_IN + '</div></div>'
          '</body></html>')

# ── 2) A4 10장 앉힘 ────────────────────────────────────────────
# 카드 90x50 + 사이 4mm. 가로 184 → 좌우 13mm / 세로 266 → 상하 15.5mm.
# 여백이 상하좌우 대칭이라 '긴 쪽 넘기기'든 '짧은 쪽 넘기기'든 앞뒤가 맞는다
# (10장이 모두 같은 카드라 좌우 반전도 따질 필요가 없다).
GAP, MT, ML = 4.0, 15.5, 13.0
_t = []
for x in (ML, ML + 90 + GAP / 2, ML + 90 + GAP + 90):            # 세로 재단선 3개
    _t.append('<div class="tk v" style="left:%.2fmm;top:0"></div>' % x)
    _t.append('<div class="tk v" style="left:%.2fmm;bottom:0"></div>' % x)
for j in range(6):                                                # 가로 재단선 6개
    y = MT if j == 0 else (MT + 5 * 50 + 4 * GAP if j == 5 else MT + j * (50 + GAP) - GAP / 2)
    _t.append('<div class="tk h" style="top:%.2fmm;left:0"></div>' % y)
    _t.append('<div class="tk h" style="top:%.2fmm;right:0"></div>' % y)
TICKS = "".join(_t)

A4_CSS = """
.sheet { width:210mm; height:297mm; padding:15.5mm 13mm; display:flex; flex-wrap:wrap;
         align-content:flex-start; gap:4mm; page-break-after:always; position:relative; }
.sheet:last-child { page-break-after:auto; }
.cell { width:90mm; height:50mm; }
/* 재단 눈금 — 앞장에만. 시트 가장자리에 짧게 찍어 카드 위를 지나지 않는다. */
.tk { position:absolute; background:#b6bfd0; }
.tk.v { width:.25mm; height:7mm; }
.tk.h { height:.25mm; width:7mm; }
"""
for v in VARIANTS:
    write('candy-card-a4-%s.html' % v['key'],
          HEAD + '@page { size: A4 portrait; margin: 0; }' + STYLE + A4_CSS +
          '</style></head><body>'
          '<div class="sheet">' + TICKS +
          ('<div class="cell front"><div class="holder">' + v['front_in'] + '</div></div>') * 10 +
          '</div>'
          '<div class="sheet">' +
          ('<div class="cell back"><div class="holder">' + BACK_IN + '</div></div>') * 10 +
          '</div></body></html>')

# ── 3) 미리보기 ────────────────────────────────────────────────
def card_pair(v):
    return ('<div class="card front"><div class="holder">' + v['front_in'] + '</div></div>'
            '<div class="card back"><div class="holder">' + BACK_IN + '</div></div>')

write('candy-card-preview.html',
      HEAD + STYLE + """
body { background:#e9e4d8; padding:6mm; }
.grid { display:flex; flex-wrap:wrap; gap:6mm; }
.lbl { font-size:8pt; font-weight:800; color:#333; margin-bottom:1.5mm; }
.lbl code { font-weight:600; color:#777; }
.pane { padding:3mm; border-radius:2mm; box-shadow:0 1mm 3mm rgba(0,0,0,.12); }
</style></head><body><div class="grid">""" +
      "".join('<div><div class="lbl">%s판 <code>%s</code></div>'
              '<div class="pane" style="background:#f7f1e3">%s</div></div>'
              % (v['name'], v['ref'], card_pair(v)) for v in VARIANTS) +
      "</div></body></html>")

# 연한 것부터 진한 순 — 진해질수록 QR·글씨 대비가 나빠지는 걸 눈으로 고르시라고.
PAPERS = [("아이보리", "#f7f1e3"), ("연노랑", "#faeec2"), ("연분홍", "#f9dfe4"), ("하늘", "#d9e8f5"),
          ("연두", "#dcecd2"), ("살구", "#f8ddc6"), ("연보라", "#e3ddef"), ("중간 하늘", "#a9c8e4")]
write('candy-card-papers.html',
      HEAD + STYLE + """
body { background:#e9e4d8; padding:6mm; }
.grid { display:flex; flex-wrap:wrap; gap:6mm; }
.lbl { font-size:8pt; font-weight:800; color:#333; margin-bottom:1.5mm; }
.lbl code { font-weight:600; color:#777; }
.pane { padding:3mm; border-radius:2mm; box-shadow:0 1mm 3mm rgba(0,0,0,.12); }
</style></head><body><div class="grid">""" +
      "".join('<div><div class="lbl">%s <code>%s</code></div>'
              '<div class="pane" style="background:%s">%s</div></div>'
              % (n, c, c, card_pair(VARIANTS[0])) for n, c in PAPERS) +
      "</div></body></html>")

print('wrote: ' + ', '.join('candy-card-a4-%s.html' % v['key'] for v in VARIANTS)
      + ' + 낱장 2종 + 미리보기 2종')
