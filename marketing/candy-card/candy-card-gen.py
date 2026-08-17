# -*- coding: utf-8 -*-
"""사탕 봉지에 넣는 명함 크기 초대 카드 (앞면 초대 / 뒷면 안내).

왜 이 구성인가:
  - 투명 봉투 안에서 사탕이 카드 아래쪽을 가린다. 그래서 QR을 앞면에 두지 않는다 —
    가려지면 스캔 자체가 안 된다. 앞면은 사탕에 일부 가려도 읽히는 문구만 얹고,
    QR은 뒷면에 크게 둔다(사탕을 꺼내려면 어차피 봉투를 열게 된다).
  - 앞면은 딥 네이비 — 투명 비닐 너머로 눈에 띄고 사탕 색과 대비된다.
    뒷면은 크림 바탕 — QR은 밝은 바탕이어야 인식이 잘 되고 글도 읽기 쉽다.
  - 시편 119:103(꿀보다 달다)은 사탕과 맞물리는 유일한 구절이고,
    앱 태그라인인 119:105(내 발에 등이요)와 같은 시편 안에서 이어진다.

출력: candy-card.html  →  chrome --headless --print-to-pdf 로 PDF 생성
크기: 명함 90x50mm + 재단 여백(bleed) 2mm = 94x54mm, 2쪽(앞/뒤)
"""
import io, os

M = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
LOGO = io.open(os.path.join(M, 'logo-data-uri.txt'), encoding='utf-8').read().strip()
QR = io.open(os.path.join(M, 'qr-data-uri.txt'), encoding='utf-8').read().strip()

HTML = """<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Nanum+Myeongjo:wght@400;700;800&family=Noto+Sans+KR:wght@400;500;700;800&display=swap" rel="stylesheet">
<style>
@page {{ size: 94mm 54mm; margin: 0; }}
* {{ box-sizing: border-box; margin: 0; padding: 0; }}
body {{ font-family:"Noto Sans KR","Malgun Gothic",sans-serif; color:#1c2333;
        -webkit-print-color-adjust:exact; print-color-adjust:exact; }}

/* 94x54mm = 명함 90x50 + 재단여백 2mm. 실제 내용은 안쪽 90x50 안에만 둔다. */
.card {{ width:94mm; height:54mm; padding:2mm; overflow:hidden;
         page-break-after:always; position:relative; }}
.card:last-child {{ page-break-after:auto; }}
.inner {{ width:90mm; height:50mm; padding:5mm 6mm; position:relative; overflow:hidden;
          display:flex; flex-direction:column; }}

/* ── 앞면 : 초대 ── */
.front {{ background:#12294f; }}
.front .inner {{ background:linear-gradient(150deg,#16305c 0%,#12294f 55%,#0d1f3f 100%); color:#fff; }}
.ref {{ font-size:6.6pt; font-weight:800; color:#d9bf7d; letter-spacing:.10em; }}
.verse {{ font-family:"Nanum Myeongjo","Batang","바탕",serif; font-size:10.2pt; font-weight:700; line-height:1.55;
          color:#f4ead2; margin-top:2.2mm; word-break:keep-all; letter-spacing:-.01em; }}
.rule {{ width:11mm; height:.7mm; background:#c8a24b; margin:3.2mm 0 2.8mm; border-radius:.4mm; }}
.invite {{ font-size:9.6pt; font-weight:700; line-height:1.5; color:#ffffff; word-break:keep-all; }}
.invite b {{ color:#f0d99a; }}
.front .brand {{ position:absolute; right:6mm; bottom:4.4mm; display:flex; align-items:center; gap:1.3mm; }}
.front .brand img {{ width:4.2mm; height:4.2mm; object-fit:cover; object-position:top; border-radius:.6mm; }}
.front .brand span {{ font-size:6.8pt; font-weight:800; color:#c9d5ea; }}

/* ── 뒷면 : 안내 ── */
.back {{ background:#fffdf8; }}
.back .inner {{ background:#fffdf8; border:.5mm solid #e6d8b0; border-radius:1.6mm; }}
.b-title {{ font-family:"Nanum Myeongjo","Batang","바탕",serif; font-size:11.4pt; font-weight:800; color:#12294f;
            letter-spacing:-.01em; }}
.b-main {{ display:flex; gap:4mm; align-items:center; margin-top:2.6mm; }}
.b-qr {{ width:22mm; height:22mm; flex:0 0 auto; image-rendering:pixelated;
         border:.4mm solid #e6d8b0; border-radius:1mm; background:#fff; padding:.5mm; }}
.steps {{ flex:1; min-width:0; }}
.step {{ display:flex; gap:1.6mm; align-items:baseline; font-size:8.2pt; line-height:1.5;
         color:#26324a; word-break:keep-all; }}
.step i {{ font-style:normal; font-weight:800; color:#c8a24b; flex:0 0 auto; }}
.gift {{ margin-top:2.4mm; font-size:7.8pt; font-weight:800; color:#12294f;
         background:#f2e4bf; border-radius:1mm; padding:1.2mm 2.4mm; display:inline-block;
         word-break:keep-all; }}
.b-foot {{ margin-top:auto; display:flex; justify-content:space-between; align-items:flex-end; gap:2mm; }}
.b-foot .url {{ font-size:7.4pt; font-weight:800; color:#1a3a6b; }}
.b-foot .help {{ font-size:6.6pt; color:#6b7280; line-height:1.45; text-align:right; word-break:keep-all; }}
</style></head><body>

<div class="card front"><div class="inner">
  <div class="ref">시편 119:103</div>
  <div class="verse">주의 말씀의 맛이 내게 어찌 그리 단지요<br>내 입에 꿀보다 더 다니이다</div>
  <div class="rule"></div>
  <div class="invite">이 사탕이 녹는 동안,<br><b>말씀 한 구절</b> 어떠세요?</div>
  <div class="brand"><img src="{logo}"><span>고척교회</span></div>
</div></div>

<div class="card back"><div class="inner">
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
</div></div>

</body></html>""".format(qr=QR, logo=LOGO)

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'candy-card.html')
io.open(out, 'w', encoding='utf-8').write(HTML)
print('wrote', out)
