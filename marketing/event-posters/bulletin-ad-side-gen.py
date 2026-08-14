# -*- coding: utf-8 -*-
"""교회 주보 '오른쪽 세로 칼럼' 삽입용 「말씀암송이 답이다!」 광고 — 좁고 컴팩트하게(본문 4줄 분량)."""
import io

M = 'c:/Projects/bible-memorize-church-app-v2/marketing/'
LOGO = io.open(M + 'logo-data-uri.txt', encoding='utf-8').read().strip()
QR = io.open(M + 'qr-data-uri.txt', encoding='utf-8').read().strip()

HTML = """<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Nanum+Myeongjo:wght@700;800&family=Noto+Sans+KR:wght@400;500;700;800&display=swap" rel="stylesheet">
<style>
@page {{ size: 55mm 78mm; margin: 0; }}
* {{ box-sizing: border-box; }}
body {{ margin:0; width:55mm; height:78mm; font-family:"Noto Sans KR","Malgun Gothic",sans-serif; color:#1c2333; }}
.ad {{ width:55mm; height:78mm; border:1.2px solid #1a3a6b; border-radius:1.6mm; overflow:hidden;
       display:flex; flex-direction:column; background:linear-gradient(165deg,#12294f,#1a3a6b 55%,#0f2545);
       color:#fff; padding:3.4mm 3mm; -webkit-print-color-adjust:exact; print-color-adjust:exact; }}
.kicker {{ font-size:6.4pt; font-weight:700; color:#e7d6a8; letter-spacing:.04em; }}
.title {{ font-family:"Nanum Myeongjo",serif; font-size:12.5pt; font-weight:800; line-height:1.25;
          margin:1mm 0 2mm; }}
.period {{ font-size:7pt; font-weight:700; color:#12294f; background:#e7d6a8; border-radius:.8mm;
           padding:1mm 1.6mm; display:inline-block; margin-bottom:2.2mm; }}
.qrbox {{ background:#fff; border-radius:1.4mm; padding:2.2mm; display:flex; flex-direction:column;
          align-items:center; margin:0 0 2.2mm; }}
.qrbox img {{ width:24mm; height:24mm; image-rendering:pixelated; }}
.qrbox span {{ font-size:6.2pt; font-weight:700; color:#4a5364; margin-top:1mm; text-align:center; }}
.foot {{ font-size:6.6pt; font-weight:800; color:#fff; background:#c8a24b; border-radius:.8mm;
         padding:1.4mm 1.6mm; text-align:center; line-height:1.35; word-break:keep-all; margin-top:auto; }}
.brand {{ display:flex; align-items:center; justify-content:center; gap:1mm; margin-top:1.6mm; }}
.brand img {{ width:4mm; height:4mm; object-fit:cover; object-position:top; }}
.brand span {{ font-size:6.4pt; font-weight:800; color:#cfdcf2; }}
</style></head><body>
<div class="ad">
  <div class="kicker">성경말씀 암송 이벤트</div>
  <div class="title">말씀암송이<br>답이다!</div>
  <div class="period">8.16 — 9.30</div>
  <div class="qrbox">
    <img src="{qr}">
    <span>QR 스캔하고<br>참여하기</span>
  </div>
  <div class="foot">설치·사용법은<br>1층 로비에서 안내</div>
  <div class="brand"><img src="{logo}"><span>고척교회</span></div>
</div>
</body></html>""".format(qr=QR, logo=LOGO)

io.open('bulletin-ad-side.html', 'w', encoding='utf-8').write(HTML)
print('ok')
