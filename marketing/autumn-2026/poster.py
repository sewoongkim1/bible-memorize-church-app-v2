# -*- coding: utf-8 -*-
"""2026 가을 말씀암송 동행 — A3 포스터(게시판) / 16:9 슬라이드(예배 전 광고화면)"""
import io, os

# ⚠️ 5 로 바뀔 수 있다(10/14 까지) — 바꾸면 이 숫자 하나만 고치고 다시 뽑는다.
# 함께 고칠 곳(문구.md 머리와 같은 목록): marketing/autumn-2026/문구.md 다섯 절 모두 ·
#   supabase/event_autumn_2026_perday.sql(v_per_day) · supabase/event_autumn_2026_test.sql(시험 회차 perDay·intro · 10/17 까지) ·
#   supabase/event_stamp_2026.sql(기록만 · 돌리지 않는다). 저절로: event_streak_metrics.sql · 앱 화면.
PER_DAY = 3

HERE = os.path.dirname(os.path.abspath(__file__))
M = os.path.join(HERE, '..') + '/'
QR = io.open(os.path.join(M, 'qr-data-uri.txt'), encoding='utf-8').read().strip()
LOGO = io.open(os.path.join(M, 'logo-data-uri.txt'), encoding='utf-8').read().strip()

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
      letter-spacing: -.02em; word-break: keep-all; }
.h1 em { font-style: normal; color: #ffd875; }
.sub { font-size: %(f_sub)s; font-weight: 500; color: #cfdcf2; line-height: 1.5; word-break: keep-all; }
.prize { background: rgba(255,255,255,.10); border: %(bd)s solid #c9a24b; border-radius: %(r)s;
         padding: %(p_prize)s; }
.prize .lb { font-size: %(f_plb)s; font-weight: 700; color: #ffd875; letter-spacing: .02em; word-break: keep-all; }
.prize .bg { font-size: %(f_pbg)s; font-weight: 900; margin-top: .18em; word-break: keep-all; }
.prize .sm { font-size: %(f_psm)s; color: #cfdcf2; margin-top: .35em; }
.steps { display: flex; gap: %(g2)s; }
.st { flex: 1; background: rgba(255,255,255,.07); border-radius: %(r)s; padding: %(p_st)s; }
.st b { display: flex; align-items: center; justify-content: center; width: %(nsz)s; height: %(nsz)s;
        border-radius: 50%%; background: #c9a24b; color: #12294f; font-size: %(f_n)s; font-weight: 900; }
.st p { font-size: %(f_st)s; font-weight: 700; line-height: 1.45; margin-top: %(g1)s; word-break: keep-all; }
.qrbox { background: #fff; border-radius: %(r)s; padding: %(p_qr)s; text-align: center; }
.qrbox img { width: %(qr)s; height: %(qr)s; display: block; image-rendering: pixelated; }
.qrbox .u { font-size: %(f_url)s; font-weight: 800; color: #12294f; margin-top: .35em; letter-spacing: -.01em; }
.when { font-size: %(f_when)s; font-weight: 800; word-break: keep-all; }
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
  <h1 class="h1" style="margin-top:8mm">가을<br><em>말씀암송</em> 동행</h1>
  <p class="sub" style="margin-top:8mm">하루 %(per_day)s번 말씀을 암송하시면 한 칸.<br>
     한 주에 3일이면 그 주가 채워집니다. <b style="color:#fff">매일 하지 않아도 괜찮아요.</b></p>

  <div class="prize" style="margin-top:12mm">
    <div class="lb">여섯 주 가운데 세 주를 채우신 분</div>
    <div class="bg">🎁 신청하신 분 모두 선물</div>
    <div class="sm">신청 11월 3일(화) ~ 12월 5일(토)</div>
  </div>

  <div class="steps" style="margin-top:12mm">
    <div class="st"><b>1</b><p>QR을 찍고<br>교구·이름 입력</p></div>
    <div class="st"><b>2</b><p>하루 %(per_day)s번<br>말씀 암송</p></div>
    <div class="st"><b>3</b><p>첫 화면 🏅에서<br>도장 확인</p></div>
  </div>

  <div style="flex:1"></div>

  <div style="display:flex;align-items:center;gap:12mm">
    <div class="qrbox"><img src="%(qr)s"><div class="u">gocheok.onlybible.kr</div></div>
    <div>
      <div class="when">10월 18일(주일) <b>~</b> 11월 28일(토)</div>
      <div class="sub" style="margin-top:3mm;font-size:13pt">휴대폰 카메라로 QR을 비추면<br>바로 열립니다. 중간에 오셔도 함께해요.</div>
    </div>
  </div>
  <div class="foot" style="margin-top:10mm">문의 · 제자양육부 신앙운동팀</div>
</div></div>""" % dict(logo=LOGO, qr=QR, per_day=PER_DAY) + "</body></html>"


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
    <h1 class="h1" style="margin-top:22px">가을 <em>말씀암송</em> 동행</h1>
    <p class="sub" style="margin-top:22px">하루 %(per_day)s번 말씀을 암송하시면 한 칸.<br>한 주에 3일이면 그 주가 채워집니다.
       <b style="color:#fff">매일 하지 않아도 괜찮아요.</b></p>
    <div class="steps" style="margin-top:30px">
      <div class="st"><b>1</b><p>QR을 찍고<br>교구·이름 입력</p></div>
      <div class="st"><b>2</b><p>하루 %(per_day)s번<br>말씀 암송</p></div>
      <div class="st"><b>3</b><p>첫 화면 🏅에서<br>도장 확인</p></div>
    </div>
  </div>
  <div style="flex:.85;display:flex;flex-direction:column;gap:26px">
    <div class="prize">
      <div class="lb">여섯 주 가운데 세 주를 채우신 분</div>
      <div class="bg">🎁 신청하신 분 모두 선물</div>
      <div class="sm">신청 11월 3일(화) ~ 12월 5일(토)</div>
    </div>
    <div class="qrbox"><img src="%(qr)s" style="margin:0 auto"><div class="u">gocheok.onlybible.kr</div></div>
    <div class="when" style="text-align:center">10월 18일(주일) <b>~</b> 11월 28일(토)</div>
  </div>
</div></div>""" % dict(logo=LOGO, qr=QR, per_day=PER_DAY) + "</body></html>"


if __name__ == "__main__":
    from playwright.sync_api import sync_playwright
    OUT = os.path.dirname(os.path.abspath(__file__))
    pages = [('poster-a3', poster_a3(), dict(width='297mm', height='420mm'), (1123, 1587)),
             ('slide-16x9', slide_169(), dict(width='1920px', height='1080px'), (1920, 1080))]
    with sync_playwright() as pw:
        b = pw.chromium.launch(channel='chrome', headless=True)
        for name, html, pdf_size, (w, h) in pages:
            p = b.new_page(viewport={'width': w, 'height': h})
            p.set_content(html, wait_until='networkidle')
            p.wait_for_timeout(800)   # 글꼴
            p.pdf(path=os.path.join(OUT, name + '.pdf'), print_background=True, **pdf_size)
            p.screenshot(path=os.path.join(OUT, name + '.png'), full_page=False)
            p.close()
        b.close()
    print('ok')
