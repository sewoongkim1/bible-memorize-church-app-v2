# -*- coding: utf-8 -*-
"""캔디 바구니에 세우는 안내 — A4 가로의 반(297 x 105mm).

■ 무엇을 말해야 하나
  1) 가져가도 된다   — 안 적으면 눈치를 보신다
  2) 왜 사탕인가     — 시편 119:103 「내 입에 꿀보다 더 다니이다」.
                       사탕 카드 앞면이 쓰는 그 말씀이라 앞뒤가 맞는다
  3) 안에 카드가 있다 — 이걸 안 적으면 사탕만 드시고 카드를 버리신다.
                       카드에 QR이 있으니 여기가 실제로 앱으로 이어지는 길목이다

■ 판짜기
  바구니 옆에 세워 1~2m에서 보는 글이다. 제목은 크게, 바탕은 비워 둔다.
  - 바탕은 아주 연한 크림빛 그러데이션 — 진하게 깔면 잉크가 번져 종이가 운다.
  - 사탕 아이콘은 옅게(0.10) 흩뿌린 무늬. 글자를 가리지 않는 자리에만 둔다.
  - 맨 아래 '가져가세요' 한 줄만 남색으로 채워 눌러 준다. 멀리서 이 줄이 먼저 읽힌다.
  - 금색 테두리는 안쪽으로 3mm 물려 둔다 — 재단이 조금 밀려도 잘리지 않는다.

출력 (이 폴더)
  말씀캔디_안내_A4가로2장.pdf   A4 가로 한 장에 두 개 — 가운데를 자르면 두 장
  말씀캔디_안내_미리보기.png
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

/* 한 장 = A4 가로의 반 */
.sign { width:297mm; height:105mm; padding:4mm; position:relative; }
.cut  { position:absolute; left:0; right:0; top:105mm; height:0;
        border-top:0.3mm dashed #c9d0dd; }

/* 바탕 — 연한 크림빛. 잉크를 적게 쓰고도 '빈 종이'로 보이지 않게 */
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
/* 금색 얇은 안쪽 선 — 한 겹 더 있으면 '만든 것'처럼 보인다 */
.inner::after {
  content:""; position:absolute; inset:2.2mm; border:0.25mm solid rgba(168,128,31,.45);
  border-radius:4mm; pointer-events:none;
}

/* 사탕 무늬 — 글자를 가리지 않는 자리에만, 아주 옅게 */
.deco { position:absolute; opacity:.10; line-height:1; pointer-events:none; }
.d1 { left:6mm;  top:6mm;    font-size:30pt; transform:rotate(-18deg); }
.d2 { right:7mm; top:9mm;    font-size:24pt; transform:rotate(14deg); }
.d3 { left:16mm; bottom:6mm; font-size:26pt; transform:rotate(9deg); }
.d4 { right:6mm; bottom:5mm; font-size:32pt; transform:rotate(-11deg); }

.mark { height:27mm; width:auto; flex:0 0 auto; position:relative; z-index:1; }
.txt  { text-align:center; position:relative; z-index:1; }

.big  { font-size:42pt; font-weight:800; color:%(navy)s; line-height:1.12; letter-spacing:-1pt; }
.big .em { font-size:34pt; vertical-align:2mm; }

.verse {
  margin-top:3mm; font-size:14.5pt; font-weight:700; color:%(gold)s;
  line-height:1.55; word-break:keep-all;
}
.verse .ref { font-size:11.5pt; font-weight:700; opacity:.8; }

/* 맨 아래 한 줄만 채운다 — 멀리서 이 줄이 먼저 읽힌다 */
.take {
  margin-top:4.5mm; display:inline-block; padding:3mm 9mm; border-radius:99mm;
  background:%(navy)s; color:#fff;
  font-size:18pt; font-weight:800; line-height:1.4; word-break:keep-all;
  box-shadow:0 1mm 2.5mm rgba(18,48,89,.18);
}
.take .card { color:#ffe08a; }
""" % {'navy': NAVY, 'gold': GOLD}

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

out = os.path.join(HERE, 'sign-a4.html')
io.open(out, 'w', encoding='utf-8', newline='').write(html)
print('wrote:', os.path.basename(out))
