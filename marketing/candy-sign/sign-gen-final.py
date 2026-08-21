# -*- coding: utf-8 -*-
"""캔디 바구니 안내 — 확정판(A안 · 배달의민족 주아). A4 가로 한 장에 두 장.

앞선 시안(sign-gen.py / -font.py / -web.py)은 그대로 두고 여기서 따로 뽑는다.

■ 확정판에서 바뀐 것
  · 제목을 키우고 자간을 넓혔다 — 주아는 둥근 글꼴이라 붙여 두면 뭉쳐 보인다
  · 말씀과 출처 색을 금색 → 진한 남색으로. 크림 바탕에서 금색은 대비가 3.6:1이라
    1~2m만 떨어져도 묻힌다. 진한 남색은 12.8:1이라 확 산다.
    금색은 테두리에만 남긴다 — 한 덩어리 안에서 색이 갈리면 눈이 두 번 멈춘다.
  · 말씀 글자도 키우고 줄간격을 벌렸다

■ 글꼴 (이 PC에 설치된 것만)
    BM JUA        제목 — 배달의민족 주아
    Noto Serif KR 말씀 — 명조. 사탕 카드도 말씀 줄에 명조를 쓴다
    Freesentation 안내 줄

출력 (이 폴더)
  말씀캔디_안내_최종_A4가로2장.pdf   가운데를 자르면 297x105mm 두 장
  말씀캔디_안내_최종_미리보기.png
"""
import io, os

HERE = os.path.dirname(os.path.abspath(__file__))
M = os.path.join(HERE, '..')
MARK = io.open(os.path.join(M, 'logo-mark-data-uri.txt'), encoding='utf-8').read().strip()

NAVY = '#123059'
INK = '#16305c'      # 말씀 — 크림 바탕에서 대비 약 12:1
GOLD = '#a8801f'

STYLE = """
@page { size: A4 landscape; margin: 0; }
* { box-sizing: border-box; }
body { margin:0; font-family:'맑은 고딕','Malgun Gothic',sans-serif; color:#111; }

.sheet { width:297mm; height:210mm; }
.sign { width:297mm; height:105mm; padding:4mm; position:relative; }
.cut  { position:absolute; left:0; right:0; top:105mm; height:0;
        border-top:0.3mm dashed #c9d0dd; }

.inner {
  width:100%%; height:100%%; position:relative; overflow:hidden;
  border:0.9mm solid %(gold)s; border-radius:6mm;
  background:
    radial-gradient(120mm 60mm at 12%% 12%%, #fff8e6 0%%, rgba(255,248,230,0) 70%%),
    radial-gradient(120mm 60mm at 88%% 88%%, #fdf1e0 0%%, rgba(253,241,224,0) 70%%),
    #fffdf7;
  display:flex; align-items:center; justify-content:center; gap:9mm;
  padding:5mm 10mm;
}
.inner::after {
  content:""; position:absolute; inset:2.2mm; border:0.25mm solid rgba(168,128,31,.45);
  border-radius:4mm; pointer-events:none;
}

.deco { position:absolute; opacity:.10; line-height:1; pointer-events:none; }
.d1 { left:6mm;  top:6mm;    font-size:30pt; transform:rotate(-18deg); }
.d2 { right:7mm; top:9mm;    font-size:24pt; transform:rotate(14deg); }
.d3 { left:16mm; bottom:6mm; font-size:26pt; transform:rotate(9deg); }
.d4 { right:6mm; bottom:5mm; font-size:32pt; transform:rotate(-11deg); }

.mark { height:26mm; width:auto; flex:0 0 auto; position:relative; z-index:1; }
.txt  { text-align:center; position:relative; z-index:1; }

/* 제목 — 주아는 둥근 글꼴이라 붙여 두면 뭉친다. 자간을 벌린다 */
.big {
  font-family:'BM JUA','배달의민족 주아','Malgun Gothic',sans-serif;
  font-size:52pt; font-weight:400; color:%(navy)s;
  line-height:1.16; letter-spacing:2.2pt;
}
.big .em { font-size:.78em; vertical-align:2mm; letter-spacing:0; }

/* 말씀 — 멀리서도 읽히도록 진한 남색으로 */
.verse {
  font-family:'Noto Serif KR','HANBatang','Batang',serif;
  margin-top:4mm; font-size:18pt; font-weight:700; color:%(ink)s;
  line-height:1.72; letter-spacing:.6pt; word-break:keep-all;
}
.verse .ref {
  display:block; margin-top:1.5mm;
  font-size:13.5pt; font-weight:700; color:%(ink)s; letter-spacing:.4pt; opacity:.88;
}

/* 안내 — 1~2m에서 먼저 읽혀야 하는 줄 */
.take {
  font-family:'Freesentation 8 ExtraBold','프리젠테이션 8 ExtraBold','Malgun Gothic',sans-serif;
  margin-top:5mm; display:inline-block; padding:3.2mm 9mm; border-radius:99mm;
  background:%(navy)s; color:#fff;
  font-size:20pt; font-weight:400; line-height:1.45;
  letter-spacing:.4pt; word-break:keep-all;
  box-shadow:0 1mm 2.5mm rgba(18,48,89,.18);
}
.take .card { color:#ffe08a; }
""" % {'navy': NAVY, 'ink': INK, 'gold': GOLD}

SIGN = """
<div class="sign">
  <div class="inner">
    <span class="deco d1">🍬</span><span class="deco d2">🍭</span>
    <span class="deco d3">🍭</span><span class="deco d4">🍬</span>
    <img class="mark" src="%s">
    <div class="txt">
      <div class="big"><span class="em">🍬</span> 말씀 암송 캔디</div>
      <div class="verse">
        &ldquo;주의 말씀의 맛이 내게 어찌 그리 단지요<br>
        내 입에 꿀보다 더 다니이다&rdquo;
        <span class="ref">시편 119:103</span>
      </div>
      <div class="take">하나씩 가져가세요 &nbsp;·&nbsp; 안에 <span class="card">말씀 카드</span>가 들어 있어요</div>
    </div>
  </div>
</div>""" % MARK

html = ('<!doctype html><html lang="ko"><head><meta charset="utf-8">'
        '<title>말씀 암송 캔디 안내</title><style>' + STYLE + '</style></head><body>'
        '<div class="sheet">' + SIGN + '<div class="cut"></div>' + SIGN + '</div>'
        '</body></html>')

out = os.path.join(HERE, 'sign-a4-final.html')
io.open(out, 'w', encoding='utf-8', newline='').write(html)
print('wrote:', os.path.basename(out))
