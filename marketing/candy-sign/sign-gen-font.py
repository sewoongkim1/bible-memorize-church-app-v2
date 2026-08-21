# -*- coding: utf-8 -*-
"""캔디 바구니 안내 — 글꼴 두 안을 한 장에 앉혀 눈으로 고르시게.

sign-gen.py(맑은 고딕 판)는 그대로 두고 여기서 따로 뽑는다.

■ 이 PC에 설치된 것만 쓴다
  웹폰트 링크를 걸면 인터넷이 없는 자리에서 다른 글꼴로 바뀌어 인쇄된다.
  파일 안의 이름을 직접 읽어 확인한 것만 적었다.
    BM JUA                     배달의민족 주아 — 둥근 손글씨풍
    Freesentation 9 Black      프리젠테이션 9 Black — 굵고 단정한 고딕
    Freesentation 8 ExtraBold  프리젠테이션 8 ExtraBold
    Noto Serif KR              말씀 줄에 쓰는 명조

■ 왜 글꼴을 나누나
  제목·말씀·안내가 하는 일이 다르다. 제목은 눈길을 끌고, 말씀은 격을 지키고,
  안내는 멀리서 읽혀야 한다. 하나로 통일하면 셋 중 하나는 반드시 손해를 본다.
    제목  BM JUA 또는 Freesentation 9 Black  ← 이 둘을 견주시라고 두 안을 만들었다
    말씀  Noto Serif KR (명조)  — 사탕 카드도 말씀 줄에 명조를 쓴다
    안내  Freesentation 8 ExtraBold — 1~2m에서 먼저 읽혀야 하는 줄

출력 (이 폴더)
  말씀캔디_안내_글꼴안_A4가로.pdf   위=주아 / 아래=프리젠테이션
  말씀캔디_안내_글꼴안_미리보기.png
"""
import io, os

HERE = os.path.dirname(os.path.abspath(__file__))
M = os.path.join(HERE, '..')
MARK = io.open(os.path.join(M, 'logo-mark-data-uri.txt'), encoding='utf-8').read().strip()

NAVY = '#123059'
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
  display:flex; align-items:center; justify-content:center; gap:10mm;
  padding:6mm 12mm;
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

.mark { height:27mm; width:auto; flex:0 0 auto; position:relative; z-index:1; }
.txt  { text-align:center; position:relative; z-index:1; }

/* 제목 — 두 안이 여기서 갈린다 */
.big { color:%(navy)s; line-height:1.14; }
.big .em { font-size:.8em; vertical-align:2mm; }
.a .big { font-family:'BM JUA','배달의민족 주아','Malgun Gothic',sans-serif;
          font-size:46pt; font-weight:400; letter-spacing:0; }
.b .big { font-family:'Freesentation 9 Black','프리젠테이션 9 Black','Malgun Gothic',sans-serif;
          font-size:41pt; font-weight:400; letter-spacing:-1.2pt; }

/* 말씀 — 명조. 사탕 카드도 말씀 줄에 명조를 쓴다 */
.verse {
  font-family:'Noto Serif KR','HANBatang','Batang',serif;
  margin-top:3mm; font-size:14pt; font-weight:600; color:%(gold)s;
  line-height:1.6; word-break:keep-all;
}
.verse .ref { font-size:11pt; font-weight:600; opacity:.8; }

/* 안내 — 1~2m에서 먼저 읽혀야 하는 줄 */
.take {
  font-family:'Freesentation 8 ExtraBold','프리젠테이션 8 ExtraBold','Malgun Gothic',sans-serif;
  margin-top:4.5mm; display:inline-block; padding:3mm 9mm; border-radius:99mm;
  background:%(navy)s; color:#fff;
  font-size:18pt; font-weight:400; line-height:1.45; word-break:keep-all;
  box-shadow:0 1mm 2.5mm rgba(18,48,89,.18);
}
.take .card { color:#ffe08a; }

/* 어느 안인지 종이에 적어 둔다 — 고르신 뒤 이 표시만 빼고 다시 뽑는다 */
.tagv { position:absolute; left:6mm; bottom:2mm; font-size:7pt; color:#9aa6bb; letter-spacing:.3pt; }
""" % {'navy': NAVY, 'gold': GOLD}


def sign(kind, tag):
    return """
<div class="sign %s">
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
  <div class="tagv">%s</div>
</div>""" % (kind, MARK, tag)


html = ('<!doctype html><html lang="ko"><head><meta charset="utf-8">'
        '<title>말씀 암송 캔디 안내 · 글꼴 두 안</title><style>' + STYLE + '</style></head><body>'
        '<div class="sheet">'
        + sign('a', 'A안 · 제목 배달의민족 주아')
        + '<div class="cut"></div>'
        + sign('b', 'B안 · 제목 프리젠테이션 9 Black')
        + '</div></body></html>')

out = os.path.join(HERE, 'sign-a4-font.html')
io.open(out, 'w', encoding='utf-8', newline='').write(html)
print('wrote:', os.path.basename(out))
