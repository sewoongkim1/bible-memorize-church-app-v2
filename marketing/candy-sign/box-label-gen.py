# -*- coding: utf-8 -*-
"""사용설명서 박스에 붙이는 띠지 — 긴쪽 260x40mm 2장 · 짧은쪽 200x40mm 2장.

■ 제목만 적지 않는 이유
  로비 탁자 위 박스다. 「성경말씀 암송 앱 사용 설명서」만 있으면 '무엇이 든 상자'
  까지만 알려 준다. 집어 가도 되는지를 모르면 손이 안 나간다.
  그래서 오른쪽에 「한 장씩 가져가세요」를 남색 띠로 붙인다.

■ 사탕 안내판과 한 벌로 보이게
  같은 크림 바탕 · 금색 두 겹 테두리 · 주아 제목. 로비에 두 물건이 같이 놓이는데
  서로 다른 옷을 입으면 각각 다른 데서 온 것처럼 보인다.

■ 판짜기
  높이가 40mm뿐이라 세로로 쌓을 수 있는 것이 없다. 한 줄로 간다.
    왼쪽  제목 — 이 띠에서 유일하게 큰 글자
    오른쪽 「한 장씩 가져가세요」 남색 띠 — 멀리서 이것부터 읽힌다
  교회 마크는 넣지 않는다 — 40mm 높이에서 마크가 차지하는 23mm를 제목에 준다.
  박스가 놓이는 자리에 이미 사탕 안내판이 있어 어디 것인지는 그쪽이 말해 준다.
  글자 크기는 100pt에서 폭을 재어 남는 자리에 맞춰 정했다(아래 주석).

출력 (이 폴더)
  박스띠지_A4가로.pdf        긴쪽 2 + 짧은쪽 2 — 잘라서 네 면에
  박스띠지_미리보기.png
"""
import io, os

HERE = os.path.dirname(os.path.abspath(__file__))
M = os.path.join(HERE, '..')
MARK = io.open(os.path.join(M, 'logo-mark-data-uri.txt'), encoding='utf-8').read().strip()

NAVY = '#123059'
INK = '#16305c'
GOLD = '#a8801f'

STYLE = """
@page { size: A4 landscape; margin: 0; }
* { box-sizing: border-box; }
body { margin:0; font-family:'맑은 고딕','Malgun Gothic',sans-serif; color:#111; }

.sheet { width:297mm; height:210mm; padding:12mm 14mm; }
.row { margin-bottom:9mm; position:relative; }

/* 띠지 한 장 */
.band {
  height:40mm; position:relative; overflow:hidden;
  border:0.8mm solid %(gold)s; border-radius:4mm;
  background:
    radial-gradient(90mm 40mm at 10%% 20%%, #fff8e6 0%%, rgba(255,248,230,0) 70%%),
    radial-gradient(90mm 40mm at 90%% 85%%, #fdf1e0 0%%, rgba(253,241,224,0) 70%%),
    #fffdf7;
  display:flex; align-items:center; gap:4mm; padding:0 5mm 0 10mm;
}
.band::after {
  content:""; position:absolute; inset:1.6mm; border:0.22mm solid rgba(168,128,31,.45);
  border-radius:2.6mm; pointer-events:none;
}
.long  { width:260mm; }
.short { width:200mm; }

.deco { position:absolute; opacity:.09; line-height:1; pointer-events:none; }
.dA { right:52mm; top:2mm;    font-size:17pt; transform:rotate(13deg); }
.dB { left:20mm;  bottom:1mm; font-size:15pt; transform:rotate(-14deg); }

.ttl {
  font-family:'BM JUA','배달의민족 주아','Malgun Gothic',sans-serif;
  color:%(ink)s; line-height:1.1; letter-spacing:1.6pt;
  flex:1; position:relative; z-index:1; white-space:nowrap;
}
/* 100pt에서 글자 폭을 재어(긴쪽 530.8mm · 짧은쪽 374.4mm) 남는 자리에 맞춘 최대 크기.
   남는 자리 = 띠 안쪽 - 좌우 여백 - 틈 - 「한 장씩 가져가세요」 띠(42.3mm)
   더 키우면 그 띠를 밀어낸다 */
.long  .ttl { font-size:37pt; }
.short .ttl { font-size:36pt; }

.take {
  font-family:'Freesentation 8 ExtraBold','프리젠테이션 8 ExtraBold','Malgun Gothic',sans-serif;
  flex:0 0 auto; position:relative; z-index:1;
  padding:2.4mm 6mm; border-radius:99mm; background:%(navy)s; color:#fff;
  font-size:13pt; font-weight:400; letter-spacing:.3pt; white-space:nowrap;
}

/* 자르는 자리 — 아주 흐리게. 잘라내면 남지 않아야 한다 */
.cutline { position:absolute; left:-6mm; right:-6mm; bottom:-4.5mm; height:0;
           border-top:0.3mm dashed #c9d0dd; }
.tag { position:absolute; right:0; bottom:-4mm; font-size:7pt; color:#9aa6bb; }
""" % {'navy': NAVY, 'ink': INK, 'gold': GOLD}


def band(kind, title, take, tag):
    return """
  <div class="row">
    <div class="band %s">
      <span class="deco dA">🍬</span><span class="deco dB">🍭</span>
      <div class="ttl">%s</div>
      <div class="take">%s</div>
    </div>
    <div class="cutline"></div><div class="tag">%s</div>
  </div>""" % (kind, title, take, tag)


body = (band('long',  '📖 성경말씀 암송 앱 사용 설명서', '한 장씩 가져가세요', '긴쪽 260 × 40mm')
        + band('long',  '📖 성경말씀 암송 앱 사용 설명서', '한 장씩 가져가세요', '긴쪽 260 × 40mm')
        + band('short', '📖 암송 앱 사용 설명서', '한 장씩 가져가세요', '짧은쪽 200 × 40mm')
        + band('short', '📖 암송 앱 사용 설명서', '한 장씩 가져가세요', '짧은쪽 200 × 40mm'))

html = ('<!doctype html><html lang="ko"><head><meta charset="utf-8">'
        '<title>사용설명서 박스 띠지</title><style>' + STYLE + '</style></head><body>'
        '<div class="sheet">' + body + '</div></body></html>')

out = os.path.join(HERE, 'box-label-a4.html')
io.open(out, 'w', encoding='utf-8', newline='').write(html)
print('wrote:', os.path.basename(out))
