# -*- coding: utf-8 -*-
"""사탕 봉지에 넣는 명함 크기 초대 카드 (앞면 초대 / 뒷면 안내).

■ 배경색을 쓰지 않는다 — 색도화지에 컬러 프린터로 직접 인쇄하기 때문.
  컬러 프린터는 흰색을 인쇄하지 못한다(흰색 = 잉크 없음 = 종이색이 그대로 비침).
  그래서:
    - 진한 색 종이는 쓸 수 없다. 검은 글씨도 QR도 묻힌다.
    - QR 뒤에 흰 사각을 깔 수도 없다. 그것도 인쇄가 안 된다.
  → 연한 파스텔 계열 종이 + 진한 네이비 잉크만으로 성립하도록 짰다.

■ 왜 이 구성인가
  - 투명 봉투 안에서 사탕이 카드 아래쪽을 가린다. QR을 앞면에 두면 스캔이 아예 안 되므로
    앞면은 가려도 읽히는 문구만, QR은 뒷면에 크게 둔다(사탕을 꺼내려면 봉투를 열게 된다).
  - 시편 119:103(꿀보다 달다)은 사탕과 맞물리는 유일한 구절이고,
    앱 태그라인인 119:105(내 발에 등이요)와 같은 시편 안에서 이어진다.

출력
  candy-card.html          → 인쇄용(배경 없음). chrome --print-to-pdf 로 PDF
  candy-card-preview.html  → 종이색 6종 위 미리보기(화면 확인용, 인쇄용 아님)
크기: 명함 90x50mm + 재단·재단여백 2mm = 94x54mm, 2쪽(앞/뒤)
"""
import io, os

HERE = os.path.dirname(os.path.abspath(__file__))
M = os.path.join(HERE, '..')
LOGO = io.open(os.path.join(M, 'logo-data-uri.txt'), encoding='utf-8').read().strip()
QR = io.open(os.path.join(M, 'qr-data-uri.txt'), encoding='utf-8').read().strip()

# 잉크는 두 가지만 — 진한 네이비(본문)와 골드(액센트).
STYLE = """
* {{ box-sizing: border-box; margin: 0; padding: 0; }}
body {{ font-family:"Noto Sans KR","Malgun Gothic",sans-serif; color:#12294f;
        -webkit-print-color-adjust:exact; print-color-adjust:exact; }}

/* 94x54mm = 명함 90x50 + 재단여백 2mm. 배경은 칠하지 않는다(종이색이 그대로 배경). */
.card {{ width:94mm; height:54mm; padding:2mm; overflow:hidden; position:relative;
         background:transparent; }}
.inner {{ width:90mm; height:50mm; padding:4.6mm 5.6mm; position:relative; overflow:hidden;
          display:flex; flex-direction:column;
          border:.35mm solid #9aa8c0; border-radius:1.6mm; }}  /* 손으로 자를 때의 재단선 겸용 */

/* ── 앞면 : 초대 ── */
.ref {{ font-size:6.6pt; font-weight:800; color:#a8862f; letter-spacing:.10em; }}
.verse {{ font-family:"Nanum Myeongjo","Batang","바탕",serif; font-size:10.4pt; font-weight:700;
          line-height:1.55; color:#12294f; margin-top:2.2mm; word-break:keep-all; letter-spacing:-.01em; }}
.rule {{ width:11mm; height:.6mm; background:#c8a24b; margin:3.2mm 0 2.8mm; border-radius:.3mm; }}
.invite {{ font-size:9.6pt; font-weight:700; line-height:1.5; color:#1c2333; word-break:keep-all; }}
.invite b {{ color:#a8862f; }}
.brand {{ position:absolute; right:5.6mm; bottom:4mm; display:flex; align-items:center; gap:1.3mm; }}
.brand img {{ width:4.2mm; height:4.2mm; object-fit:cover; object-position:top; }}
.brand span {{ font-size:6.8pt; font-weight:800; color:#4a5a7a; }}

/* ── 뒷면 : 안내 ── */
.b-title {{ font-family:"Nanum Myeongjo","Batang","바탕",serif; font-size:11.4pt; font-weight:800;
            color:#12294f; letter-spacing:-.01em; }}
.b-main {{ display:flex; gap:3.8mm; align-items:center; margin-top:2.4mm; }}
/* QR은 종이색 위에 검게 찍힌다(흰 바탕을 깔 수 없다) — 연한 종이에서만 안전하다.
   테두리를 둘러 조용지대(quiet zone)를 눈에 보이게 확보한다. */
.b-qr {{ width:22mm; height:22mm; flex:0 0 auto; image-rendering:pixelated;
         border:.35mm solid #9aa8c0; border-radius:.8mm; padding:.6mm; }}
.steps {{ flex:1; min-width:0; }}
.step {{ display:flex; gap:1.6mm; align-items:baseline; font-size:8.2pt; line-height:1.5;
         color:#1c2333; word-break:keep-all; }}
.step i {{ font-style:normal; font-weight:800; color:#a8862f; flex:0 0 auto; }}
/* 배지도 면을 칠하지 않고 테두리로 — 색도화지 위에서 면을 칠하면 종이색과 싸운다 */
.gift {{ margin-top:2.2mm; font-size:7.8pt; font-weight:800; color:#12294f;
         border:.35mm solid #c8a24b; border-radius:1mm; padding:1.1mm 2.2mm; display:inline-block;
         word-break:keep-all; }}
.b-foot {{ margin-top:auto; display:flex; justify-content:space-between; align-items:flex-end; gap:2mm; }}
.b-foot .url {{ font-size:7.4pt; font-weight:800; color:#12294f; }}
.b-foot .help {{ font-size:6.6pt; color:#4a5a7a; line-height:1.45; text-align:right; word-break:keep-all; }}
"""

FRONT = """<div class="card front"><div class="inner">
  <div class="ref">시편 119:103</div>
  <div class="verse">주의 말씀의 맛이 내게 어찌 그리 단지요<br>내 입에 꿀보다 더 다니이다</div>
  <div class="rule"></div>
  <div class="invite">이 사탕이 녹는 동안,<br><b>말씀 한 구절</b> 어떠세요?</div>
  <div class="brand"><img src="{logo}"><span>고척교회</span></div>
</div></div>""".format(logo=LOGO)

BACK = """<div class="card back"><div class="inner">
  <div class="b-title">말씀암송이 답이다!</div>
  <div class="b-main">
    <img class="b-qr" src="{qr}">
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
</div></div>""".format(qr=QR)

FONTLINK = ('<link href="https://fonts.googleapis.com/css2?'
            'family=Nanum+Myeongjo:wght@400;700;800&'
            'family=Noto+Sans+KR:wght@400;500;700;800&display=swap" rel="stylesheet">')

# ── 1) 인쇄용 : 배경 없음, 2쪽 ──────────────────────────────────
PRINT_HTML = ("""<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">""" + FONTLINK + """
<style>
@page {{ size: 94mm 54mm; margin: 0; }}
""" + STYLE + """
.card {{ page-break-after:always; }}
.card:last-child {{ page-break-after:auto; }}
</style></head><body>
""" + FRONT + BACK + """
</body></html>""").format()

io.open(os.path.join(HERE, 'candy-card.html'), 'w', encoding='utf-8').write(PRINT_HTML)

# ── 2) 미리보기 : 여러 색도화지 위에 얹어 본다 ──────────────────
# 연한 것부터 진한 순. 진해질수록 QR·글씨 대비가 나빠지는 걸 눈으로 고르시라고.
PAPERS = [
    ("아이보리",   "#f7f1e3"),
    ("연노랑",     "#faeec2"),
    ("연분홍",     "#f9dfe4"),
    ("하늘",       "#d9e8f5"),
    ("연두",       "#dcecd2"),
    ("살구",       "#f8ddc6"),
    ("연보라",     "#e3ddef"),
    ("중간 하늘",  "#a9c8e4"),
]
cells = "".join(
    '<div class="pv"><div class="pv-name">{n} <code>{c}</code></div>'
    '<div class="pv-paper" style="background:{c}">{f}{b}</div></div>'.format(n=n, c=c, f=FRONT, b=BACK)
    for n, c in PAPERS
)
PREVIEW_HTML = ("""<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">""" + FONTLINK + """
<style>
""" + STYLE + """
body {{ background:#e9e4d8; padding:6mm; }}
.grid {{ display:flex; flex-wrap:wrap; gap:6mm; }}
.pv-name {{ font-size:8pt; font-weight:800; color:#333; margin-bottom:1.5mm; }}
.pv-name code {{ font-weight:600; color:#777; }}
.pv-paper {{ padding:3mm; border-radius:2mm; box-shadow:0 1mm 3mm rgba(0,0,0,.12); }}
</style></head><body>
<div class="grid">""" + cells + """</div>
</body></html>""").format()

io.open(os.path.join(HERE, 'candy-card-preview.html'), 'w', encoding='utf-8').write(PREVIEW_HTML)
print('wrote candy-card.html (인쇄용) / candy-card-preview.html (종이색 미리보기)')
