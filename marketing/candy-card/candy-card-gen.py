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
/* 폰트는 이 PC에 설치된 것만 쓴다(웹폰트 링크 없음 — 오프라인·인쇄에서도 그대로 나온다).
   2026-08-18 글자 폭 실측으로 확인:
     Noto Serif KR 321.7 / Batang 340.0 / Noto Sans KR 304.4  → 모두 적용됨
     BM JUA·generic serif 는 304.4 = 고딕으로 떨어짐(미설치) → 쓰지 않는다
   명조는 Batang보다 Noto Serif KR이 곱고 현대적이라 이쪽으로 간다. */
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family:"Noto Sans KR","Malgun Gothic",sans-serif; color:#12294f;
       -webkit-print-color-adjust:exact; print-color-adjust:exact; }

.card { width:94mm; height:54mm; padding:2mm; overflow:hidden; position:relative;
        background:transparent; }
.holder { width:90mm; height:50mm; padding:2mm; }          /* 2mm = 재단 여유 */
.inner { width:86mm; height:46mm; padding:3.0mm 4.4mm; position:relative; overflow:hidden;
         display:flex; flex-direction:column; }
.front .inner { border:.35mm solid #9aa8c0; border-radius:2.4mm; }

/* ── 앞면 ──
   어르신이 받으실 카드다. 글자를 키우는 대신 문구를 줄였다 — 90x50mm에서
   둘 다 가질 수는 없다. 구절 12pt / 초대문 11pt. */
.head { display:flex; align-items:center; justify-content:space-between; gap:3mm; }
.ref { font-size:7.4pt; font-weight:800; color:#a8862f; letter-spacing:.08em; }
.verse { font-family:"Noto Serif KR","Batang",serif; font-size:12pt; font-weight:600;
         line-height:1.75; color:#12294f; margin-top:1.6mm; word-break:keep-all; letter-spacing:-.02em; }
/* 구절이 세 줄인 카드는 남는 여백이 1.9mm뿐이라 줄간격을 덜 준다 */
.tight .verse { line-height:1.42; margin-top:1.4mm; }
/* flex 세로 배치에서 눌리지 않도록 — 안 그러면 선이 사라진다 */
.rule { flex:0 0 auto; width:11mm; height:.6mm; background:#c8a24b; margin:2.6mm 0 2.2mm;
        border-radius:.3mm; }
.tight .rule { margin:2.0mm 0 1.8mm; }
.invite { font-size:11pt; font-weight:700; line-height:1.70; color:#1c2333; word-break:keep-all;
          letter-spacing:-.02em; }
.tight .invite { line-height:1.5; }
.invite b { color:#a8862f; }
/* 우측 상단 — 아래를 비워 줄간격에 쓰고, 초대 문구와 부딪히지 않는다 */
.brand { flex:0 0 auto; display:flex; align-items:center; gap:1.3mm; }
.brand img { width:4.4mm; height:4.4mm; object-fit:cover; object-position:top; }
.brand span { font-size:7.4pt; font-weight:800; color:#4a5a7a; }

/* ── 뒷면 (모든 판 공통) ──
   단계 설명을 짧게 줄이고 글자를 10.5pt까지 키웠다.
   「1층 로비에서 도와드립니다」는 어르신께 가장 중요한 줄이라 눈에 띄게 둔다. */
.b-title { font-family:"Noto Serif KR","Batang",serif; font-size:11.5pt; font-weight:700;
           color:#12294f; letter-spacing:-.02em; }
.b-main { display:flex; gap:3.4mm; align-items:center; margin-top:1.4mm; }
/* QR은 종이색 위에 검게 찍힌다(흰 바탕을 깔 수 없다) — 연한 종이에서만 안전하다. */
.b-qr { width:20mm; height:20mm; flex:0 0 auto; image-rendering:pixelated;
        border:.35mm solid #9aa8c0; border-radius:.8mm; padding:.5mm; }
.steps { flex:1; min-width:0; }
.step { display:flex; gap:1.8mm; align-items:baseline; font-size:10.5pt; line-height:1.7;
        font-weight:500; color:#1c2333; word-break:keep-all; letter-spacing:-.02em; }
.step i { font-style:normal; font-weight:800; color:#a8862f; flex:0 0 auto; }
/* 면을 칠하지 않고 테두리로 — 색도화지 위에서 면을 칠하면 종이색과 싸운다 */
.help { margin-top:auto; font-size:9.5pt; font-weight:800; color:#12294f;
        border:.35mm solid #c8a24b; border-radius:1mm; padding:0.9mm 2.4mm;
        text-align:center; word-break:keep-all; letter-spacing:-.02em; }
.b-foot { margin-top:0.8mm; display:flex; justify-content:space-between; align-items:baseline; gap:2mm; }
.b-foot .url { font-size:9pt; font-weight:800; color:#12294f; }
.b-foot .who { font-size:8pt; font-weight:600; color:#4a5a7a; white-space:nowrap; }
"""

# ── 카드 앞면들 ────────────────────────────────────────────────
# 대부분 앱의 32구절에서 골랐다 — 카드가 실제 암송할 내용의 맛보기가 된다.
# 카드 한 줄이 21자쯤이라 34자 이하만 두 줄에 편안히 들어간다.
#
# ※ 앱 verses.json의 표기 오류는 카드에서 바로잡아 넣는다
#     눅 4:8   섬가라   → 섬기라
#     수 1:8   말게하며 → 말게 하며
#     행 16:31 네집이   → 네 집이
#   (앱 데이터도 함께 고쳐야 한다)
VARIANTS = [
    {   # 앱 1번 구절이자 앱 태그라인
        'key': '119-105', 'name': '등불', 'ref': '시편 119:105',
        'verse': '주의 말씀은 내 발에 등이요<br>내 길에 빛이니이다',
        'invite': '오늘 하루,<br><b>말씀 한 구절</b>로 밝혀 보세요',
    },
    {   # 「네 입에서 떠나지 말게 하며」 — 사탕이 입에 있는 동안과 그대로 겹친다.
        # 앱 본문은 44자라 두 줄에 안 들어가므로 앞 절반만 쓴다(개역개정 그대로).
        'key': '수1-8', 'name': '입에서', 'ref': '여호수아 1:8',
        # 12pt에서 한 줄이 18자쯤이라 세 줄로 나눈다
        'verse': '이 율법책을 네 입에서<br>떠나지 말게 하며<br>주야로 그것을 묵상하여',
        'invite': '사탕이 입에 있는 동안,<br><b>말씀 한 구절</b> 입에 담아 보세요',
    },
    {
        'key': '살전5-16', 'name': '기뻐하라', 'ref': '데살로니가전서 5:16-18',
        'verse': '항상 기뻐하라 쉬지 말고 기도하라<br>범사에 감사하라',
        'invite': '오늘 하루를 여는<br><b>말씀 한 구절</b>',
    },
    {
        'key': '눅1-28', 'name': '평안', 'ref': '누가복음 1:28',
        'verse': '은혜를 받은 자여 평안할지어다<br>주께서 너와 함께하시도다',
        'invite': '오늘 받은 이 인사를<br><b>말씀 한 구절</b>과 함께',
    },
    {
        'key': '창12-2', 'name': '복', 'ref': '창세기 12:2',
        'verse': '내가 네 이름을 창대하게 하리니<br>너는 복이 될지라',
        'invite': '복이 되는 하루,<br><b>말씀 한 구절</b>로 시작해요',
    },
    {
        'key': '행16-31', 'name': '네 집이', 'ref': '사도행전 16:31',
        'verse': '주 예수를 믿으라 그리하면<br>너와 네 집이 구원을 받으리라',
        'invite': '우리 집에 심는<br><b>말씀 한 구절</b>',
    },
    {
        'key': '눅4-8', 'name': '섬기라', 'ref': '누가복음 4:8',
        'verse': '주 너의 하나님께 경배하고<br>다만 그를 섬기라',
        'invite': '오늘 첫 마음을 담아<br><b>말씀 한 구절</b>',
    },
    {
        'key': '막11-3', 'name': '쓰시겠다', 'ref': '마가복음 11:3',
        'verse': '주가 쓰시겠다 하라 그리하면<br>즉시 이리로 보내리라',
        'invite': '오늘 나를 쓰시도록,<br><b>말씀 한 구절</b>',
    },
    {   # 앱 32구절 밖이지만 사탕과 가장 잘 맞물려 남겨 둔다
        'key': '119-103', 'name': '꿀', 'ref': '시편 119:103',
        'verse': '주의 말씀의 맛이 내게<br>어찌 그리 단지요<br>내 입에 꿀보다 더 다니이다',
        'invite': '이 사탕이 녹는 동안,<br><b>말씀 한 구절</b> 어떠세요?',
    },
]

FRONT_TPL = """<div class="inner">
  <div class="head">
    <div class="ref">{ref}</div>
    <div class="brand"><img src="%s"><span>고척교회</span></div>
  </div>
  <div class="verse">{verse}</div>
  <div class="rule"></div>
  <div class="invite">{invite}</div>
</div>""" % LOGO

BACK_IN = """<div class="inner">
  <div class="b-title">말씀암송이 답이다!</div>
  <div class="b-main">
    <img class="b-qr" src="%s">
    <div class="steps">
      <div class="step"><i>①</i><span>QR을 스캔</span></div>
      <div class="step"><i>②</i><span>교구·이름 입력</span></div>
      <div class="step"><i>③</i><span>빈칸 채우기</span></div>
    </div>
  </div>
  <div class="help">1층 로비에서 도와드립니다 · 선물 ~ 9월 30일</div>
  <div class="b-foot">
    <div class="url">gocheok.onlybible.kr</div>
    <div class="who">고척교회 제자양육부</div>
  </div>
</div>""" % QR

for v in VARIANTS:
    v['front_in'] = FRONT_TPL.format(ref=v['ref'], verse=v['verse'], invite=v['invite'])
    # 구절이 세 줄이면 여백이 빠듯하다 — 줄간격을 덜 주는 tight 판으로
    if v['verse'].count('<br>') >= 2:
        v['front_in'] = v['front_in'].replace('<div class="inner">', '<div class="inner tight">', 1)

# 웹폰트 링크 없음 — 이 PC에 설치된 Noto Serif KR / Noto Sans KR 만 쓴다.
# (외부 폰트 요청이 있으면 헤드리스 렌더가 멈추기도 하고, 오프라인 인쇄에서 결과가 달라진다)
HEAD = '<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><style>'


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

# 앞면만 나란히 — 종류가 많아 뒷면(공통)은 뺀다
write('candy-card-preview.html',
      HEAD + STYLE + """
body { background:#e9e4d8; padding:6mm; }
.grid { display:flex; flex-wrap:wrap; gap:5mm; }
.lbl { font-size:8pt; font-weight:800; color:#333; margin-bottom:1.5mm; }
.lbl code { font-weight:600; color:#777; }
.pane { padding:2.5mm; border-radius:2mm; box-shadow:0 1mm 3mm rgba(0,0,0,.12); }
</style></head><body><div class="grid">""" +
      "".join('<div><div class="lbl">%s <code>%s</code></div>'
              '<div class="pane" style="background:#f7f1e3">'
              '<div class="card front"><div class="holder">%s</div></div></div></div>'
              % (v['ref'], v['key'], v['front_in']) for v in VARIANTS) +
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


# ── 4) 보고용 통합 PDF ─────────────────────────────────────────
# 인쇄용이 아니라 '보여드리는' 문서다. 개요 → 카드 9종 앞뒤(실제 크기) → 인쇄 안내.
REPORT_CSS = """
@page { size: A4 portrait; margin: 0; }
.pg { width:210mm; height:297mm; padding:16mm 12mm 14mm; position:relative;
      page-break-after:always; display:flex; flex-direction:column; }
.pg:last-child { page-break-after:auto; }
.pg-h { font-family:"Noto Serif KR",serif; font-size:15pt; font-weight:700; color:#12294f;
        border-bottom:.5mm solid #c8a24b; padding-bottom:2.5mm; margin-bottom:6mm; }
.pg-n { position:absolute; right:12mm; bottom:7mm; font-size:8pt; color:#8a95a8; }
.lead { font-size:10.5pt; line-height:1.75; color:#26324a; word-break:keep-all; }
.lead b { color:#12294f; }
.kv { display:flex; gap:3mm; font-size:10.5pt; line-height:1.9; color:#26324a; }
.kv .k { flex:0 0 26mm; font-weight:800; color:#12294f; }
.note { margin-top:5mm; padding:4mm 5mm; border:.35mm solid #c8a24b; border-radius:1.5mm;
        font-size:9.5pt; line-height:1.7; color:#26324a; word-break:keep-all; }
.note b { color:#12294f; }
.row { display:flex; gap:6mm; align-items:flex-start; margin-bottom:5mm; }
.row-lbl { font-size:9pt; font-weight:800; color:#12294f; margin-bottom:1.5mm; }
.row-lbl em { font-style:normal; font-weight:500; color:#8a7a4e; }
.chip { display:flex; gap:6mm; }
.pp { display:flex; flex-wrap:wrap; gap:3mm; margin-top:3mm; }
.pp div { font-size:8.5pt; font-weight:700; color:#26324a; padding:2mm 3mm;
          border-radius:1.2mm; border:.3mm solid #cbb277; }
"""

def side(v, back=False):
    inner = BACK_IN if back else v['front_in']
    cls = 'back' if back else 'front'
    return '<div class="card %s"><div class="holder">%s</div></div>' % (cls, inner)

pages = []
# 1쪽 — 개요
pages.append('<div class="pg"><div class="pg-h">「말씀암송이 답이다!」 사탕 카드</div>'
  '<div class="lead">투명 봉투에 <b>사탕과 함께</b> 넣어 나눠드리는 명함 크기 초대 카드입니다. '
  '앞면은 말씀으로 마음을 열고, 뒷면 QR로 앱에 바로 들어오도록 했습니다.</div>'
  '<div style="height:6mm"></div>'
  '<div class="kv"><div class="k">크기</div><div>명함 90 x 50mm (양면)</div></div>'
  '<div class="kv"><div class="k">종류</div><div>9종 — 앱 암송구절 8 + 시편 119:103</div></div>'
  '<div class="kv"><div class="k">QR 연결</div><div>gocheok.onlybible.kr</div></div>'
  '<div class="kv"><div class="k">참여 기간</div><div>2026년 9월 30일까지</div></div>'
  '<div class="kv"><div class="k">인쇄</div><div>색도화지 + 컬러 프린터, A4 한 장에 10장</div></div>'
  '<div class="note"><b>사탕과 말씀을 엮은 이유.</b><br>'
  '시편 119:103 「내 입에 꿀보다 더 다니이다」와 여호수아 1:8 「네 입에서 떠나지 말게 하며」는 '
  '사탕을 입에 넣는 순간 뜻이 몸으로 이해됩니다. 설명 없이도 전해지는 초대가 됩니다.<br><br>'
  '<b>QR을 뒷면에 둔 이유.</b><br>'
  '봉투 안에서 사탕이 카드 아래쪽을 가립니다. 앞면에 QR이 있으면 스캔이 아예 안 됩니다. '
  '사탕을 꺼내려면 어차피 봉투를 열게 되므로 QR은 뒷면에 크게 두었습니다.<br><br>'
  '<b>어르신을 위해.</b><br>'
  '구절 12pt, 안내 10.5pt로 키우고 뒷면 문구를 줄였습니다. '
  '「1층 로비에서 도와드립니다」를 가장 눈에 띄게 두었습니다.</div>'
  '<div class="pg-n">1 / 5</div></div>')

# 2~4쪽 — 카드 9종
for pi in range(3):
    grp = VARIANTS[pi*3:pi*3+3]
    rows = "".join(
        '<div><div class="row-lbl">%s &nbsp;<em>%s</em></div>'
        '<div class="chip">%s%s</div></div>'
        % (v['ref'], v['invite'].replace('<br>', ' ').replace('<b>', '').replace('</b>', ''),
           side(v), side(v, True))
        for v in grp)
    pages.append('<div class="pg"><div class="pg-h">카드 %d종 (%d/9 ~ %d/9)</div>%s'
                 '<div class="pg-n">%d / 5</div></div>'
                 % (len(grp), pi*3+1, pi*3+len(grp), rows, pi+2))

# 5쪽 — 인쇄 안내
pp = "".join('<div style="background:%s">%s</div>' % (c, n) for n, c in PAPERS)
pages.append('<div class="pg"><div class="pg-h">인쇄 안내</div>'
  '<div class="kv"><div class="k">파일</div><div>사탕카드_A4_&lt;구절&gt;.pdf — 9개, 각 2쪽(앞장·뒷장)</div></div>'
  '<div class="kv"><div class="k">배치</div><div>A4 한 장에 10장 (2열 x 5행), 카드 사이 4mm 여유</div></div>'
  '<div class="kv"><div class="k">양면</div><div>긴 쪽·짧은 쪽 어느 방향으로 넘겨도 앞뒤가 맞음</div></div>'
  '<div class="kv"><div class="k">배율</div><div><b>실제 크기(100%%)</b> — 「용지에 맞춤」으로 두면 줄어듭니다</div></div>'
  '<div class="kv"><div class="k">재단</div><div>앞장 가장자리의 눈금 두 개를 자로 이어 자릅니다</div></div>'
  '<div class="note"><b>종이는 연한 색만 쓰실 수 있습니다.</b><br>'
  '컬러 프린터는 흰색을 인쇄하지 못합니다(흰색 = 잉크 없음 = 종이색이 그대로 비침). '
  '그래서 진한 종이에서는 글씨도 QR도 묻히고, QR 뒤에 흰 사각을 깔 수도 없습니다. '
  '아래 색까지가 안전합니다.'
  '<div class="pp">%s</div></div>'
  '<div class="note"><b>대량 인쇄 전에 한 장만 시험해 주세요.</b><br>'
  '한 장을 양면으로 뽑아 잘라 보시고, 휴대폰으로 QR을 찍어 확인하시면 '
  '배율·밀림·스캔을 한 번에 점검할 수 있습니다.</div>'
  '<div class="pg-n">5 / 5</div></div>' % pp)

write('candy-card-report.html',
      HEAD + STYLE + REPORT_CSS + '</style></head><body>' + "".join(pages) + '</body></html>')
print('  + candy-card-report.html (보고용)')

print('wrote: ' + ', '.join('candy-card-a4-%s.html' % v['key'] for v in VARIANTS)
      + ' + 낱장 2종 + 미리보기 2종')
