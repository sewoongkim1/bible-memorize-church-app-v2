# -*- coding: utf-8 -*-
"""1층 로비 '설치 도와드리는 자리'에 세우는 안내 — A3 세로(297 x 420mm).

■ 이 표가 하는 일은 하나다
  지나가시는 분이 3~5m 밖에서 보고 '아, 저기 가면 되는구나' 하고 발을 돌리게
  하는 것. 그래서 한 문장만 둔다 —
      성경말씀 암송 앱을 / 휴대폰에 / 설치해 드립니다

■ 왜 세 줄로 끊나
  100pt에서 폭을 재면
      '성경말씀 암송 앱을'      306.9mm → 최대 78.9pt
      '휴대폰에 설치해 드립니다' 415.7mm → 최대 58.3pt
  두 줄로 두면 긴 줄에 묶여 58pt까지밖에 못 키운다. 세 줄로 끊으면 가장 긴 줄이
  '성경말씀 암송 앱을'이라 74pt로 갈 수 있다. 멀리서 읽히는 크기가 이 표의 전부다.

■ 빈자리를 폰 그림으로 채운다
  글을 더 적어 채우면 큰 글자가 작아진다. '설치해 드립니다'를 눈으로 보여 주는
  그림이면 글을 늘리지 않고도 화면이 찬다. 폰 안에 앱 아이콘을 그려 두면
  '바탕화면에 이런 게 생긴다'까지 말없이 전해진다.

■ 판짜기
  사탕 안내판·박스 띠지와 같은 옷(크림·금색 두 겹 테두리·주아 제목).
  교회 마크는 넣지 않는다 — 로비에 사탕 안내판이 같이 놓여 그쪽이 말해 준다.

출력 (이 폴더)
  로비안내_A3세로.pdf
  로비안내_A3_미리보기.png
"""
import io, os

HERE = os.path.dirname(os.path.abspath(__file__))
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
  gap:16mm; padding:18mm 16mm; text-align:center;
}
.inner::after {
  content:""; position:absolute; inset:3.5mm; border:0.3mm solid rgba(168,128,31,.45);
  border-radius:6mm; pointer-events:none;
}

.deco { position:absolute; opacity:.085; line-height:1; pointer-events:none; }
.d1 { left:12mm;  top:14mm;    font-size:60pt; transform:rotate(-16deg); }
.d2 { right:13mm; top:20mm;    font-size:48pt; transform:rotate(13deg); }
.d3 { left:15mm;  bottom:16mm; font-size:50pt; transform:rotate(10deg); }
.d4 { right:12mm; bottom:12mm; font-size:62pt; transform:rotate(-12deg); }

/* 3~5m 밖에서 읽히는 유일한 문장. 세 줄로 끊어 74pt까지 키웠다(위 주석 참고) */
.head {
  font-family:'BM JUA','배달의민족 주아','Malgun Gothic',sans-serif;
  font-size:74pt; font-weight:400; color:%(navy)s;
  line-height:1.28; letter-spacing:1.5pt; word-break:keep-all; z-index:1;
}
.head .go { color:%(gold)s; }

/* 폰 그림 — 글을 늘리지 않고 빈자리를 채운다.
   바탕화면에 앱 아이콘이 생기는 그 모습을 그대로 보여 준다 */
.phone {
  position:relative; z-index:1;
  width:74mm; height:132mm; border-radius:11mm;
  border:2.4mm solid %(navy)s; background:#fff;
  display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4mm;
  box-shadow:0 3mm 9mm rgba(18,48,89,.16);
}
.phone::before {          /* 위쪽 스피커 */
  content:""; position:absolute; top:4mm; left:50%%; transform:translateX(-50%%);
  width:16mm; height:1.6mm; border-radius:99mm; background:#dfe4ee;
}
.phone::after {           /* 아래쪽 홈 바 */
  content:""; position:absolute; bottom:4mm; left:50%%; transform:translateX(-50%%);
  width:24mm; height:1.4mm; border-radius:99mm; background:#dfe4ee;
}
.icon {
  width:34mm; height:34mm; border-radius:8mm;
  background:linear-gradient(160deg, #1c4785 0%%, #123059 100%%);
  display:flex; align-items:center; justify-content:center;
  font-size:34pt; box-shadow:0 1.5mm 3mm rgba(18,48,89,.28);
}
.iconlbl { font-size:13pt; font-weight:800; color:%(ink)s; letter-spacing:.4pt; }
""" % {'navy': NAVY, 'ink': INK, 'gold': GOLD}

BODY = """
<div class="page"><div class="inner">
  <span class="deco d1">📱</span><span class="deco d2">🍬</span>
  <span class="deco d3">📖</span><span class="deco d4">🍭</span>

  <div class="head">성경말씀 암송 앱을<br>휴대폰에<br><span class="go">설치해 드립니다</span></div>

  <div class="phone">
    <div class="icon">📖</div>
    <div class="iconlbl">성경암송</div>
  </div>
</div></div>"""

html = ('<!doctype html><html lang="ko"><head><meta charset="utf-8">'
        '<title>1층 로비 안내 · A3</title><style>' + STYLE + '</style></head><body>'
        + BODY + '</body></html>')

out = os.path.join(HERE, 'lobby-a3.html')
io.open(out, 'w', encoding='utf-8', newline='').write(html)
print('wrote:', os.path.basename(out))
