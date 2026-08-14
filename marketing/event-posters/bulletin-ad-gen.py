# -*- coding: utf-8 -*-
"""교회 주보 삽입용 「말씀암송이 답이다!」 이벤트 광고 — 가로 배너형.
   이벤트 포스터(이벤트포스터_A3.pdf)와 같은 QR·문구를 재사용한다.
"""
import io

M = 'c:/Projects/bible-memorize-church-app-v2/marketing/'
LOGO = io.open(M + 'logo-data-uri.txt', encoding='utf-8').read().strip()
QR = io.open(M + 'qr-data-uri.txt', encoding='utf-8').read().strip()

HTML = """<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Nanum+Myeongjo:wght@700;800&family=Noto+Sans+KR:wght@400;500;700;800&display=swap" rel="stylesheet">
<style>
@page {{ size: 180mm 62mm; margin: 0; }}
* {{ box-sizing: border-box; }}
body {{ margin:0; width:180mm; height:62mm; font-family:"Noto Sans KR","Malgun Gothic",sans-serif;
        color:#1c2333; background:#fffdf8; -webkit-print-color-adjust:exact; print-color-adjust:exact; }}
.ad {{ width:180mm; height:62mm; display:flex; align-items:stretch;
       border:1.4px solid #1a3a6b; border-radius:2mm; overflow:hidden; }}
.left {{ flex:1; padding:6mm 7mm; display:flex; flex-direction:column; justify-content:center;
         background:linear-gradient(155deg,#12294f,#1a3a6b 55%,#0f2545); color:#fff; position:relative; }}
.kicker {{ font-size:8pt; font-weight:700; color:#e7d6a8; letter-spacing:.06em; }}
.title {{ font-family:"Nanum Myeongjo",serif; font-size:19pt; font-weight:800; margin:1.5mm 0 3mm;
          letter-spacing:-.01em; }}
.period {{ display:inline-block; font-size:9pt; font-weight:700; color:#12294f; background:#e7d6a8;
           border-radius:1mm; padding:1.3mm 3mm; margin-bottom:3.5mm; }}
.body {{ font-size:9pt; line-height:1.6; color:#dbe3f2; word-break:keep-all; max-width:98mm; }}
.body b {{ color:#fff; }}
.foot {{ font-size:8.6pt; font-weight:800; color:#fff; background:#c8a24b; border-radius:1mm;
         padding:1.8mm 3mm; margin-top:4mm; display:inline-block; word-break:keep-all; }}
.right {{ width:56mm; background:#fff; display:flex; flex-direction:column; align-items:center;
          justify-content:center; padding:4mm; gap:2mm; }}
.right img.qr {{ width:32mm; height:32mm; image-rendering:pixelated; }}
.right .cap {{ font-size:7.6pt; font-weight:700; color:#5a6273; text-align:center; }}
.right .brand {{ display:flex; align-items:center; gap:1.5mm; margin-top:1.5mm; }}
.right .brand img {{ width:5mm; height:5mm; object-fit:cover; object-position:top; }}
.right .brand span {{ font-size:7.6pt; font-weight:800; color:#1a3a6b; }}
</style></head><body>
<div class="ad">
  <div class="left">
    <div class="kicker">성경말씀 암송 이벤트</div>
    <div class="title">말씀암송이 답이다!</div>
    <div class="period">참여기간&nbsp; 8월 16일 — 9월 30일</div>
    <div class="body">QR 스캔 후 교구·이름을 입력하고 암송 말씀 <b>빈칸을 채우면</b> 누구나 참여할 수 있습니다.
      참여하신 성도님께는 <b>소정의 선물</b>을 드립니다.</div>
    <div class="foot">설치 및 사용법은 1층 로비에서 도와드립니다</div>
  </div>
  <div class="right">
    <img class="qr" src="{qr}">
    <div class="cap">휴대폰 카메라로<br>QR을 비춰 주세요</div>
    <div class="brand"><img src="{logo}"><span>고척교회</span></div>
  </div>
</div>
</body></html>""".format(qr=QR, logo=LOGO)

io.open('bulletin-ad.html', 'w', encoding='utf-8').write(HTML)
print('ok')
