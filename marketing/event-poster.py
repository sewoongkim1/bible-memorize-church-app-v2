# -*- coding: utf-8 -*-
"""이벤트 오프라인 포스터 — A3 세로(게시판) / 16:9 가로(예배 전 광고화면)"""
import io, os

M = 'c:/Projects/bible-memorize-church-app-v2/marketing/'
QR = io.open(M + 'qr-data-uri.txt', encoding='utf-8').read().strip()
LOGO = io.open(M + 'logo-data-uri.txt', encoding='utf-8').read().strip()

HEAD = """<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Nanum+Myeongjo:wght@700;800&family=Noto+Sans+KR:wght@400;500;700;800;900&display=swap" rel="stylesheet">
<style>
@page { size: %(size)s; margin: 0; }
* { box-sizing: border-box; margin: 0; }
body { font-family: "Noto Sans KR", sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.p { width: %(w)s; height: %(h)s; position: relative; overflow: hidden;
     background: linear-gradient(165deg, #12294f 0%%, #1a3a6b 45%%, #0f2545 100%%); color: #fff; }
/* 은은한 빛줄기 — 인쇄해도 뭉개지지 않을 만큼만 */
.p::before { content: ""; position: absolute; inset: 0;
  background: radial-gradient(120%% 60%% at 50%% -10%%, rgba(201,162,75,.30), transparent 60%%); }
.in { position: relative; height: 100%%; display: flex; flex-direction: column; }
.brand { display: flex; align-items: center; gap: %(g1)s; }
/* 로고는 마크만 — 아래 '고척교회' 글자는 남색 바탕에 묻혀 안 보인다(원본 위 79%%가 마크) */
.brand img { width: %(logo)s; height: %(logo)s; object-fit: cover; object-position: top; }
.brand span { font-size: %(f_brand)s; font-weight: 700; letter-spacing: .02em; color: #e7d6a8; }
.kicker { display: inline-block; align-self: flex-start; background: #c9a24b; color: #12294f;
  font-weight: 900; font-size: %(f_kick)s; padding: %(p_kick)s; border-radius: 999px; letter-spacing: .01em; }
.h1 { font-family: "Nanum Myeongjo", serif; font-weight: 800; font-size: %(f_h1)s; line-height: 1.14;
      letter-spacing: -.02em; }
.h1 em { font-style: normal; color: #ffd875; }
.sub { font-size: %(f_sub)s; font-weight: 500; color: #cfdcf2; line-height: 1.5; }
.prize { background: rgba(255,255,255,.10); border: %(bd)s solid #c9a24b; border-radius: %(r)s;
         padding: %(p_prize)s; }
.prize .lb { font-size: %(f_plb)s; font-weight: 700; color: #ffd875; letter-spacing: .02em; }
.prize .bg { font-size: %(f_pbg)s; font-weight: 900; margin-top: .18em; }
.prize .sm { font-size: %(f_psm)s; color: #cfdcf2; margin-top: .35em; }
.steps { display: flex; gap: %(g2)s; }
.st { flex: 1; background: rgba(255,255,255,.07); border-radius: %(r)s; padding: %(p_st)s; }
.st b { display: flex; align-items: center; justify-content: center; width: %(nsz)s; height: %(nsz)s;
        border-radius: 50%%; background: #c9a24b; color: #12294f; font-size: %(f_n)s; font-weight: 900; }
.st p { font-size: %(f_st)s; font-weight: 700; line-height: 1.45; margin-top: %(g1)s; word-break: keep-all; }
.qrbox { background: #fff; border-radius: %(r)s; padding: %(p_qr)s; text-align: center; }
.qrbox img { width: %(qr)s; height: %(qr)s; display: block; image-rendering: pixelated; }
.qrbox .u { font-size: %(f_url)s; font-weight: 800; color: #12294f; margin-top: .35em; letter-spacing: -.01em; }
.when { font-size: %(f_when)s; font-weight: 800; }
.when b { color: #ffd875; }
.foot { font-size: %(f_foot)s; color: #9fb4d6; }
</style></head><body>"""


def poster_a3():
    v = dict(size='297mm 420mm', w='297mm', h='420mm', logo='26mm', g1='4mm', g2='6mm',
             f_brand='11pt', f_kick='14pt', p_kick='5mm 12mm', f_h1='72pt', f_sub='17pt',
             bd='1.2mm', r='6mm', p_prize='9mm 10mm', f_plb='13pt', f_pbg='30pt', f_psm='12pt',
             p_st='7mm 5mm', nsz='11mm', f_n='16pt', f_st='13pt',
             p_qr='7mm', qr='46mm', f_url='12pt', f_when='16pt', f_foot='11pt')
    return (HEAD % v) + """
<div class="p"><div class="in" style="padding:22mm 20mm 18mm">
  <div class="brand"><img src="%(logo)s"><span>고척교회 제자양육부 신앙운동팀</span></div>

  <div style="margin-top:16mm"><span class="kicker">성도 참여 이벤트</span></div>
  <h1 class="h1" style="margin-top:8mm">말씀 한 구절,<br><em>빈칸 하나</em>씩<br>채워 보세요</h1>
  <p class="sub" style="margin-top:8mm">주간 말씀에 빈칸이 하나씩 있습니다.<br>
     떠오르는 대로 채우면 끝. <b style="color:#fff">10분이면 충분합니다.</b></p>

  <div class="prize" style="margin-top:12mm">
    <div class="lb">완료하신 분 전원</div>
    <div class="bg">☕ 그라티아 아메리카노</div>
    <div class="sm">시상 10월 11일(주일) · 교구/부서별 배부</div>
  </div>

  <div class="steps" style="margin-top:12mm">
    <div class="st"><b>1</b><p>QR을 찍고<br>이름 입력</p></div>
    <div class="st"><b>2</b><p>「말씀 이벤트<br>참여하기」 누르기</p></div>
    <div class="st"><b>3</b><p>빈칸을 하나씩<br>채우면 완료</p></div>
  </div>

  <div style="flex:1"></div>

  <div style="display:flex;align-items:center;gap:12mm">
    <div class="qrbox"><img src="%(qr)s"><div class="u">gocheok.onlybible.kr</div></div>
    <div>
      <div class="when">8월 16일(주일) <b>~</b> 9월 30일(수)</div>
      <div class="sub" style="margin-top:3mm;font-size:13pt">휴대폰 카메라로 QR을 비추면<br>바로 열립니다. 설치 없이 됩니다.</div>
    </div>
  </div>
  <div class="foot" style="margin-top:10mm">문의 · 제자양육부 신앙운동팀</div>
</div></div>""" % dict(logo=LOGO, qr=QR) + "</body></html>"


def slide_169():
    v = dict(size='1920px 1080px', w='1920px', h='1080px', logo='84px', g1='12px', g2='18px',
             f_brand='22px', f_kick='24px', p_kick='12px 30px', f_h1='96px', f_sub='30px',
             bd='3px', r='20px', p_prize='26px 32px', f_plb='24px', f_pbg='52px', f_psm='21px',
             p_st='22px 18px', nsz='40px', f_n='24px', f_st='23px',
             p_qr='20px', qr='190px', f_url='20px', f_when='34px', f_foot='19px')
    return (HEAD % v) + """
<div class="p"><div class="in" style="padding:64px 76px;flex-direction:row;gap:64px;align-items:center">
  <div style="flex:1.25;display:flex;flex-direction:column">
    <div class="brand"><img src="%(logo)s"><span>고척교회 제자양육부 신앙운동팀</span></div>
    <div style="margin-top:30px"><span class="kicker">성도 참여 이벤트</span></div>
    <h1 class="h1" style="margin-top:22px">말씀 한 구절,<br><em>빈칸 하나</em>씩 채워 보세요</h1>
    <p class="sub" style="margin-top:22px">주간 말씀에 빈칸이 하나씩 있습니다. 떠오르는 대로 채우면 끝.
       <b style="color:#fff">10분이면 충분합니다.</b></p>
    <div class="steps" style="margin-top:30px">
      <div class="st"><b>1</b><p>QR 찍고 이름 입력</p></div>
      <div class="st"><b>2</b><p>「말씀 이벤트<br>참여하기」 누르기</p></div>
      <div class="st"><b>3</b><p>빈칸을 하나씩<br>채우면 완료</p></div>
    </div>
  </div>
  <div style="flex:.85;display:flex;flex-direction:column;gap:26px">
    <div class="prize">
      <div class="lb">완료하신 분 전원</div>
      <div class="bg">☕ 그라티아 아메리카노</div>
      <div class="sm">시상 10월 11일(주일) · 교구/부서별 배부</div>
    </div>
    <div class="qrbox"><img src="%(qr)s" style="margin:0 auto"><div class="u">gocheok.onlybible.kr</div></div>
    <div class="when" style="text-align:center">8월 16일(주일) <b>~</b> 9월 30일(수)</div>
  </div>
</div></div>""" % dict(logo=LOGO, qr=QR) + "</body></html>"


io.open('poster-a3.html', 'w', encoding='utf-8').write(poster_a3())
io.open('poster-slide.html', 'w', encoding='utf-8').write(slide_169())
print('ok')
