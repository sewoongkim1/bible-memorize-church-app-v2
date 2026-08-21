# -*- coding: utf-8 -*-
"""말씀암송 이벤트 A4 포스터 — 4개 안.
교회 기존 '2026 썸머! 써 바이블' 양식(흰 바탕 모눈 · 상하 이중선 · 남색 제목 ·
금색 구분 · 크림 박스 · 빨강 강조 · 하단 로고)을 공통 뼈대로 쓴다."""
import io

M = 'c:/Projects/bible-memorize-church-app-v2/marketing/'
QR = io.open(M + 'qr-data-uri.txt', encoding='utf-8').read().strip()
LOGO = io.open(M + 'logo-data-uri.txt', encoding='utf-8').read().strip()

CSS = """
@page { size: 210mm 297mm; margin: 0; }
* { box-sizing: border-box; margin: 0; }
body { font-family: "Noto Sans KR", sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.p { width: 210mm; height: 297mm; position: relative; background: #fff; overflow: hidden;
     background-image: linear-gradient(#e9edf5 .2mm, transparent .2mm),
                       linear-gradient(90deg, #e9edf5 .2mm, transparent .2mm);
     background-size: 8mm 8mm; }
.in { position: relative; height: 100%; padding: 13mm 16mm; display: flex; flex-direction: column; }
.rule { border-top: 1.3mm solid #10204a; border-bottom: .35mm solid #10204a; height: 2.2mm; flex: none; }
.rule.b { margin-top: auto; }
.kick { text-align: center; font-size: 12pt; font-weight: 800; color: #c0392b;
        letter-spacing: .3em; text-indent: .3em; margin-top: 9mm; }
.title { font-size: 37pt; font-weight: 900; color: #10204a; letter-spacing: -.025em;
         text-align: center; margin-top: 5mm; line-height: 1.12; }
.title.sm { font-size: 30pt; }
.divider { display: flex; align-items: center; justify-content: center; gap: 4mm; margin-top: 6mm; }
.divider i { display: block; width: 24mm; height: .4mm; background: #c9a24b; }
.divider b { width: 2.6mm; height: 2.6mm; background: #c9a24b; transform: rotate(45deg); }
.sub { text-align: center; font-size: 14pt; font-weight: 700; color: #2b3550; margin-top: 5mm;
       line-height: 1.6; word-break: keep-all; }
/* 빈칸 말씀 */
.qz { border: .5mm solid #c9a24b; background: #fdfaf0; border-radius: 2mm;
      padding: 8mm 7mm; margin-top: 8mm; text-align: center; }
.qz .v { font-size: 19pt; font-weight: 700; color: #10204a; line-height: 1.9; word-break: keep-all; }
.qz .v u { display: inline-block; min-width: 22mm; border-bottom: .7mm solid #c0392b;
           text-decoration: none; }
.qz .r { font-size: 11.5pt; font-weight: 800; color: #6b3fa0; margin-top: 4mm; }
.qz.mini { padding: 5mm 5mm; margin-top: 5mm; }
.qz.mini .v { font-size: 13.5pt; line-height: 1.75; }
.qz.mini .v u { min-width: 15mm; }
.qz.mini .r { font-size: 9.5pt; margin-top: 2mm; }
.box { border: .5mm solid #c9a24b; background: #fdfaf0; border-radius: 2mm;
       padding: 5mm 8mm; margin-top: 7mm; text-align: center; }
.box .lb { font-size: 12pt; font-weight: 800; color: #c0392b; letter-spacing: .5em; text-indent: .5em; }
.box .dt { font-size: 24pt; font-weight: 800; color: #10204a; margin-top: 2mm; }
.how { display: flex; gap: 4mm; margin-top: 7mm; }
.how div { flex: 1; text-align: center; border: .3mm solid #d8dfec; border-radius: 2mm;
           background: #fff; padding: 4mm 2mm; }
.how b { display: block; font-size: 11pt; font-weight: 900; color: #c9a24b; }
.how span { display: block; font-size: 10.5pt; font-weight: 700; color: #10204a; margin-top: 1.5mm;
            line-height: 1.4; word-break: keep-all; }
.gift { text-align: center; font-size: 14pt; font-weight: 800; color: #c0392b; margin-top: 7mm; }
.gift small { display: block; font-size: 10pt; font-weight: 500; color: #6b7488; margin-top: 1.5mm; }
.qrrow { display: flex; align-items: center; justify-content: center; gap: 6mm; margin-top: 7mm; }
.qrrow img { width: 29mm; height: 29mm; image-rendering: pixelated; flex: none; }
.qrrow .t b { display: block; font-size: 12.5pt; font-weight: 800; color: #10204a; line-height: 1.4; }
.qrrow .t span { display: block; font-size: 9.5pt; color: #6b7488; margin-top: 1.5mm; line-height: 1.5; }
.qrrow .t u { display: block; font-size: 10.5pt; font-weight: 800; color: #1a3a6b; margin-top: 1.5mm;
              text-decoration: none; }
.when { text-align: center; font-size: 13pt; font-weight: 800; color: #10204a; margin-top: 6mm; }
.logo { display: flex; align-items: center; justify-content: center; gap: 3mm; margin: 7mm 0 5mm; }
.logo .mk { width: 12mm; height: 12mm; object-fit: cover; object-position: top; }
.logo .nm { font-size: 16pt; font-weight: 800; color: #10204a; letter-spacing: -.02em; }
"""

HEAD = ('<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">'
        '<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;800;900&display=swap" rel="stylesheet">'
        '<style>' + CSS + '</style></head><body>')

LOGOROW = '<div class="logo"><img class="mk" src="__LOGO__"><span class="nm">고척교회</span></div>'
QRIMG = '<img src="__QR__">'
GIFT = ('<div class="gift">참여하신 성도님께는 기념품을 드립니다'
        '<small>시상 10월 11일(주일) · 교구 및 교회학교별 배부</small></div>')


def wrap(body):
    return HEAD + '<div class="p"><div class="in"><div class="rule"></div>' + body + \
           LOGOROW + '<div class="rule b"></div></div></div></body></html>'


# ── A안: 한 구절 빈칸 퀴즈 (정답 확인 = QR) ─────────────────────────
A = wrap("""
  <div class="kick">성도 참여 이벤트</div>
  <div class="title">이 빈칸,<br>채우실 수 있나요?</div>
  <div class="divider"><i></i><b></b><i></i></div>

  <div class="qz">
    <div class="v">주의 말씀은 내 발에 <u></u>이요<br>내 길에 <u></u>이니이다</div>
    <div class="r">시편 119편 105절</div>
  </div>

  <div class="sub" style="margin-top:7mm">떠올리셨다면 이미 절반은 하신 겁니다.<br>
     <b style="color:#c0392b">정답은 QR로 바로 확인하세요.</b></div>

  <div class="qrrow">""" + QRIMG + """
    <div class="t"><b>휴대폰 카메라로<br>QR을 비춰 주세요</b>
      <span>설치 없이 바로 열립니다.</span><u>gocheok.onlybible.kr</u></div>
  </div>

  <div class="box">
    <div class="lb">참 여 기 간</div>
    <div class="dt">8월 16일 — 9월 30일</div>
  </div>
""" + GIFT)

# ── B안: 세 구절 맛보기 (몇 개나 아세요?) ───────────────────────────
B = wrap("""
  <div class="kick">성도 참여 이벤트</div>
  <div class="title sm">몇 개나<br>맞히실 수 있나요?</div>
  <div class="divider"><i></i><b></b><i></i></div>

  <div class="qz mini">
    <div class="v">주의 말씀은 내 발에 <u></u>이요 내 길에 <u></u>이니이다</div>
    <div class="r">시편 119편 105절</div>
  </div>
  <div class="qz mini">
    <div class="v">주 예수를 믿으라 그리하면 너와 네 집이 <u></u>을 받으리라</div>
    <div class="r">사도행전 16장 31절</div>
  </div>
  <div class="qz mini">
    <div class="v">가이사의 것은 가이사에게 하나님의 것은 <u></u>께 바치라</div>
    <div class="r">마가복음 12장 17절</div>
  </div>

  <div class="sub" style="margin-top:7mm">이런 말씀이 <b style="color:#c0392b">모두 열두 구절</b> 기다리고 있습니다.<br>
     빈칸을 하나씩 채우면 응모 완료.</div>

  <div class="qrrow">""" + QRIMG + """
    <div class="t"><b>정답 확인하고<br>바로 참여하기</b>
      <span>설치 없이 바로 열립니다.</span><u>gocheok.onlybible.kr</u></div>
  </div>

  <div class="when">참여 기간 &nbsp;8월 16일(주일) ~ 9월 30일(수)</div>
""" + GIFT)

# ── C안: 정보형 (기존 교회 포스터 양식에 가장 가까움) ────────────────
C = wrap("""
  <div class="title" style="margin-top:11mm">말씀암송이 답이다!</div>
  <div class="divider"><i></i><b></b><i></i></div>
  <div class="sub" style="font-size:17pt;letter-spacing:.05em;margin-top:5mm">성경말씀 암송 참여 이벤트</div>
  <div class="sub" style="font-size:11pt;color:#6b3fa0;font-weight:700;margin-top:4mm">
     시편 119:105 · 여호수아 1:8 · 사도행전 16:31 · 마가복음 12:17 외 여덟 구절</div>

  <div class="box">
    <div class="lb">참 여 기 간</div>
    <div class="dt">8월 16일 — 9월 30일</div>
  </div>

  <div class="qz" style="margin-top:8mm">
    <div class="v">주의 말씀은 내 발에 <u></u>이요<br>내 길에 <u></u>이니이다</div>
    <div class="r">시편 119편 105절</div>
  </div>

  <div class="how">
    <div><b>1</b><span>QR을 찍고<br>이름 입력</span></div>
    <div><b>2</b><span>「말씀 이벤트<br>참여하기」 누르기</span></div>
    <div><b>3</b><span>빈칸을 하나씩<br>채우면 완료</span></div>
  </div>
""" + GIFT + """
  <div class="qrrow">""" + QRIMG + """
    <div class="t"><b>휴대폰 카메라로 QR을 비춰 주세요</b>
      <span>설치 없이 바로 열립니다.</span><u>gocheok.onlybible.kr</u></div>
  </div>
""")

# ── D안: 큰 QR 중심 (멀리서도 찍게 — 로비·엘리베이터용) ──────────────
D = wrap("""
  <div class="kick">성도 참여 이벤트</div>
  <div class="title">주의 말씀은<br>내 발에 <u style="border-bottom:1mm solid #c0392b;text-decoration:none;
       display:inline-block;min-width:32mm"></u>이요</div>
  <div class="sub" style="font-size:15pt;margin-top:6mm">시편 119편 105절 · 빈칸에 들어갈 말은?</div>

  <div style="display:flex;justify-content:center;margin-top:10mm">
    <div style="background:#fff;border:.5mm solid #d8dfec;border-radius:3mm;padding:6mm;text-align:center">
      <img src="__QR__" style="width:58mm;height:58mm;image-rendering:pixelated;display:block">
      <div style="font-size:12pt;font-weight:800;color:#10204a;margin-top:3mm">gocheok.onlybible.kr</div>
    </div>
  </div>

  <div class="sub" style="margin-top:8mm"><b style="color:#c0392b">QR을 찍으면 정답을 확인할 수 있습니다.</b><br>
     열두 구절의 빈칸을 채우면 응모 완료 — 10분이면 충분합니다.</div>

  <div class="box">
    <div class="lb">참 여 기 간</div>
    <div class="dt">8월 16일 — 9월 30일</div>
  </div>
""" + GIFT)

for name, html in [('a', A), ('b', B), ('c', C), ('d', D)]:
    io.open('pv-%s.html' % name, 'w', encoding='utf-8').write(
        html.replace('__QR__', QR).replace('__LOGO__', LOGO))
print('ok')
