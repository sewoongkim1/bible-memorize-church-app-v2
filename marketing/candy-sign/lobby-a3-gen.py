# -*- coding: utf-8 -*-
"""1층 로비 '설치 도와드리는 자리'에 세우는 안내 — A3 세로(297 x 420mm).

■ 이 표가 하는 일은 하나다
  지나가시는 분이 3~5m 밖에서 보고 '아, 저기 가면 되는구나' 하고 발을 돌리게
  하는 것. 그래서 한 문장만 둔다 — 「휴대폰에 앱을 깔아 드립니다」.

■ 왜 다른 것을 넣지 않나
  절차(①②③)·걸리는 시간·QR은 다가오신 뒤에 필요한 것들인데, 그때는 옆에
  봉사자가 있다. 사람이 말로 하는 것을 종이에 또 적으면 큰 글자가 작아진다.
  이 표에서 가장 값진 것은 '멀리서 읽히는 크기'다.

■ 판짜기
  사탕 안내판·박스 띠지와 같은 옷(크림·금색 두 겹 테두리·주아 제목).
  로비에 세 물건이 같이 놓인다.
  글자 크기는 100pt에서 폭을 재어 A3 안쪽 폭에 맞춘 최대값(아래 주석).

출력 (이 폴더)
  로비안내_A3세로.pdf
  로비안내_A3_미리보기.png
"""
import io, os

HERE = os.path.dirname(os.path.abspath(__file__))
M = os.path.join(HERE, '..')
MARK = io.open(os.path.join(M, 'logo-mark-data-uri.txt'), encoding='utf-8').read().strip()

NAVY = '#123059'
INK = '#16305c'
GOLD = '#a8801f'

STYLE = """
@page { size: A3 portrait; margin: 0; }
* { box-sizing: border-box; }
body { margin:0; font-family:'맑은 고딕','Malgun Gothic',sans-serif; color:#111; }

.page { width:297mm; height:420mm; padding:10mm; }
.inner {
  width:100%%; height:100%%; position:relative; overflow:hidden;
  border:1.4mm solid %(gold)s; border-radius:9mm;
  background:
    radial-gradient(170mm 130mm at 10%% 8%%,  #fff8e6 0%%, rgba(255,248,230,0) 70%%),
    radial-gradient(170mm 130mm at 90%% 92%%, #fdf1e0 0%%, rgba(253,241,224,0) 70%%),
    #fffdf7;
  display:flex; flex-direction:column; align-items:center; justify-content:center;
  gap:14mm; padding:20mm 16mm; text-align:center;
}
.inner::after {
  content:""; position:absolute; inset:3.5mm; border:0.3mm solid rgba(168,128,31,.45);
  border-radius:6mm; pointer-events:none;
}

.deco { position:absolute; opacity:.085; line-height:1; pointer-events:none; }
.d1 { left:12mm;  top:14mm;    font-size:60pt; transform:rotate(-16deg); }
.d2 { right:13mm; top:22mm;    font-size:48pt; transform:rotate(13deg); }
.d3 { left:16mm;  bottom:18mm; font-size:50pt; transform:rotate(10deg); }
.d4 { right:12mm; bottom:14mm; font-size:62pt; transform:rotate(-12deg); }

.mark { height:44mm; width:auto; position:relative; z-index:1; }

/* 3~5m 밖에서 읽히는 유일한 문장.
   100pt에서 재니 두 줄 다 222.8mm. A3 안쪽 쓸 수 있는 폭이 242.2mm이니
   108pt까지 들어가지만, 좌우 숨 쉴 자리를 남겨 100pt로 둔다. */
.head {
  font-family:'BM JUA','배달의민족 주아','Malgun Gothic',sans-serif;
  font-size:100pt; font-weight:400; color:%(navy)s;
  line-height:1.3; letter-spacing:1.5pt; word-break:keep-all; z-index:1;
}
.app {
  font-size:30pt; font-weight:800; color:%(ink)s; letter-spacing:.8pt; z-index:1;
}
""" % {'navy': NAVY, 'ink': INK, 'gold': GOLD}

BODY = """
<div class="page"><div class="inner">
  <span class="deco d1">📱</span><span class="deco d2">🍬</span>
  <span class="deco d3">📖</span><span class="deco d4">🍭</span>

  <img class="mark" src="%s">
  <div class="head">휴대폰에 앱을<br>깔아 드립니다</div>
  <div class="app">📖 성경말씀 암송 앱</div>
</div></div>""" % MARK

html = ('<!doctype html><html lang="ko"><head><meta charset="utf-8">'
        '<title>1층 로비 안내 · A3</title><style>' + STYLE + '</style></head><body>'
        + BODY + '</body></html>')

out = os.path.join(HERE, 'lobby-a3.html')
io.open(out, 'w', encoding='utf-8', newline='').write(html)
print('wrote:', os.path.basename(out))
