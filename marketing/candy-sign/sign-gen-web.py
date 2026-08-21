# -*- coding: utf-8 -*-
"""캔디 바구니 안내 — 웹폰트(구글 폰트) 두 안. 앞선 두 판은 그대로 두고 따로 뽑는다.

■ 웹폰트를 써도 되는 이유
  PDF로 뽑는 순간 쓰인 글자의 모양이 파일 안에 박힌다. 그래서 인쇄할 때는
  인터넷이 필요 없고, 다른 PC에 그 글꼴이 없어도 그대로 나온다.
  인터넷이 필요한 건 '이 스크립트를 돌려 PDF를 만드는 순간'뿐이다.
  (HTML을 그대로 인쇄하면 그때는 인터넷이 있어야 한다 — 그래서 PDF로 준다.)

■ 고른 글꼴 (모두 구글 폰트, 상업적 이용 무료)
    Black Han Sans  제목 — 아주 굵어 멀리서도 잡힌다
    Do Hyeon        제목/안내 — 둥글면서 굵어 딱딱하지 않다
    Gowun Batang    말씀 — 획이 고와 성구에 어울린다(명조)
    Noto Sans KR    보조

■ 두 안의 차이는 제목뿐이다
    C안  Black Han Sans — 힘 있고 눈에 확 든다
    D안  Do Hyeon       — 둥글고 다정하다

출력 (이 폴더)
  말씀캔디_안내_웹폰트안_A4가로.pdf
  말씀캔디_안내_웹폰트안_미리보기.png
"""
import io, os

HERE = os.path.dirname(os.path.abspath(__file__))
M = os.path.join(HERE, '..')
MARK = io.open(os.path.join(M, 'logo-mark-data-uri.txt'), encoding='utf-8').read().strip()

NAVY = '#123059'
GOLD = '#a8801f'

FONTS = ('https://fonts.googleapis.com/css2'
         '?family=Black+Han+Sans'
         '&family=Do+Hyeon'
         '&family=Gowun+Batang:wght@400;700'
         '&family=Noto+Sans+KR:wght@700;900'
         '&display=block')      # swap이 아니라 block — 글꼴이 오기 전에 찍히면 안 된다

STYLE = """
@page { size: A4 landscape; margin: 0; }
* { box-sizing: border-box; }
body { margin:0; font-family:'Noto Sans KR','Malgun Gothic',sans-serif; color:#111; }

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

.big { color:%(navy)s; line-height:1.15; }
.big .em { font-size:.78em; vertical-align:2mm; }
.c .big { font-family:'Black Han Sans',sans-serif; font-size:40pt; letter-spacing:-.5pt; }
.d .big { font-family:'Do Hyeon',sans-serif;       font-size:43pt; letter-spacing:-.5pt; }

/* 말씀 — 고운바탕. 획이 고와 성구에 어울린다 */
.verse {
  font-family:'Gowun Batang',serif; font-weight:700;
  margin-top:3.5mm; font-size:14.5pt; color:%(gold)s;
  line-height:1.6; word-break:keep-all;
}
.verse .ref { font-weight:400; font-size:11.5pt; opacity:.85; }

/* 안내 — 멀리서 먼저 읽혀야 하는 줄 */
.take {
  font-family:'Do Hyeon',sans-serif;
  margin-top:4.5mm; display:inline-block; padding:3.2mm 9mm; border-radius:99mm;
  background:%(navy)s; color:#fff;
  font-size:19pt; line-height:1.45; word-break:keep-all; letter-spacing:-.2pt;
  box-shadow:0 1mm 2.5mm rgba(18,48,89,.18);
}
.take .card { color:#ffe08a; }

.tagv { position:absolute; left:7mm; bottom:1mm; font-size:7pt; color:#9aa6bb;
        font-family:'Noto Sans KR',sans-serif; }
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
        '<title>말씀 암송 캔디 안내 · 웹폰트 두 안</title>'
        '<link rel="stylesheet" href="' + FONTS + '">'
        '<style>' + STYLE + '</style></head><body>'
        '<div class="sheet">'
        + sign('c', 'C안 · 제목 Black Han Sans')
        + '<div class="cut"></div>'
        + sign('d', 'D안 · 제목 Do Hyeon(도현)')
        + '</div></body></html>')

out = os.path.join(HERE, 'sign-a4-web.html')
io.open(out, 'w', encoding='utf-8', newline='').write(html)
print('wrote:', os.path.basename(out))
