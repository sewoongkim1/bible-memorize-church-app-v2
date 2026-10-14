# -*- coding: utf-8 -*-
"""앱 설치 안내 — A4 가로 광고(교회 현관 · 2026-10-15 친구 요청).
   노란 색지 또는 엷은 보라 색지에 인쇄한다 → 배경색 없이(종이색이 그대로) · 글씨 · 선 · QR 은 모두 짙은 남색 하나.
   (흰색은 인쇄되지 않고 금색 · 보라는 그 종이 위에서 사라진다 — 가을 포스터 LIGHT 테마와 같은 방침)
   QR 은 https://gocheok.onlybible.kr/install/ (install/index.html — 안드로이드 · 아이폰 · 설치 없이 바로 쓰기).
   만들기: python 자료/marketing/install-poster/poster.py  →  install-a4.pdf(인쇄용) · 미리보기 PNG 셋(투명 · 노랑 · 보라)."""
import io, os
import qrcode
from PIL import Image
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
M = os.path.join(HERE, "..")
URL = "https://gocheok.onlybible.kr/install/"
INK = "#12294f"          # 짙은 남색 — 노랑 · 엷은 보라 어느 종이에서나 또렷하다
SOFT = "#2f3d57"         # 둘째 글씨(회색을 쓰면 색지 위에서 흐려진다 — 남색 쪽으로 어둡게)
LOGO = io.open(os.path.join(M, "logo-mark-data-uri.txt"), encoding="utf-8").read().strip()


def qr_svg(size_mm):
    """QR 을 벡터(SVG)로 — 남색 칸 · 바탕 없음(종이색). 조용한 테두리 4칸 포함."""
    q = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, border=4)
    q.add_data(URL); q.make(fit=True)
    m = q.get_matrix()
    n = len(m)
    d = "".join("M%d %dh1v1h-1z" % (x, y) for y, row in enumerate(m) for x, v in enumerate(row) if v)
    return ('<svg width="%smm" height="%smm" viewBox="0 0 %d %d" shape-rendering="crispEdges" aria-label="QR">'
            '<path fill="%s" d="%s"/></svg>') % (size_mm, size_mm, n, n, INK, d)


STEPS = [
    ("휴대폰 카메라로", "오른쪽 QR을 비추세요"),
    ("내 휴대폰에 맞는 단추를", "누르세요 · 안드로이드 · 아이폰"),
    ("소속과 이름을 넣으면", "바로 시작해요"),
]

HTML = """<!doctype html><html lang="ko"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Nanum+Myeongjo:wght@800&display=swap" rel="stylesheet">
<!-- 본문 고딕은 이 PC 에 깔린 Noto Sans KR(C:/Windows/Fonts/NotoSansKR-VF.ttf) — 구글 웹폰트판은 PDF 에 Type3 로 박혀
     인쇄소 프리플라이트가 경고한다(메모리 print-layout-traps). 깔린 글꼴은 Type0 으로 들어간다. -->
<style>
@page { size: 297mm 210mm; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 297mm; height: 210mm; background: transparent; }
body { font-family: "Noto Sans KR", sans-serif; color: %(ink)s; -webkit-print-color-adjust: exact; print-color-adjust: exact; word-break: keep-all; }
.page { position: relative; width: 297mm; height: 210mm; padding: 16mm 18mm 14mm; display: flex; gap: 12mm; }
.left { flex: 1 1 auto; display: flex; flex-direction: column; }
.kicker { display: flex; align-items: center; gap: 3mm; font-size: 15pt; font-weight: 700; letter-spacing: .5pt; }
.kicker img { width: 11mm; height: 11mm; }
h1 { margin-top: 8mm; font-family: "Nanum Myeongjo", serif; font-weight: 800; font-size: 47pt; line-height: 1.22; letter-spacing: -.5pt; }
.sub { margin-top: 5mm; font-size: 19pt; font-weight: 700; color: %(soft)s; }
.steps { margin-top: 11mm; display: flex; flex-direction: column; gap: 6mm; }
.step { display: flex; align-items: center; gap: 4.5mm; }
.no { flex: 0 0 15mm; width: 15mm; height: 15mm; border-radius: 50%%; border: 1.2mm solid %(ink)s;
      display: flex; align-items: center; justify-content: center; font-size: 23pt; font-weight: 900; line-height: 1; }
.st { font-size: 21pt; font-weight: 700; line-height: 1.35; }
.st span { font-weight: 500; }
.foot { position: absolute; left: 18mm; right: 18mm; bottom: 12mm; display: flex; justify-content: space-between; align-items: flex-end;
        padding-top: 4mm; border-top: .5mm solid %(ink)s; }
.verse { font-family: "Nanum Myeongjo", serif; font-weight: 800; font-size: 13.5pt; }
.verse small { font-family: "Noto Sans KR", sans-serif; font-weight: 500; font-size: 10.5pt; margin-left: 2mm; }
.team { text-align: right; font-size: 10.5pt; font-weight: 500; color: %(soft)s; line-height: 1.55; }
.right { flex: 0 0 104mm; display: flex; flex-direction: column; align-items: center; padding-top: 2mm; }
.qrbox { border: 1.2mm solid %(ink)s; border-radius: 7mm; padding: 4mm; }
.qrbox svg { display: block; }
.cap { margin-top: 6mm; font-size: 22pt; font-weight: 900; text-align: center; }
.url { margin-top: 2mm; font-size: 14pt; font-weight: 700; color: %(soft)s; text-align: center; letter-spacing: .2pt; }
.kinds { margin-top: 5mm; display: flex; gap: 2.5mm; }
.kinds span { border: .5mm solid %(ink)s; border-radius: 99px; padding: 1.4mm 4.5mm; font-size: 13.5pt; font-weight: 700; }
</style></head><body><div class="page">
  <div class="left">
    <div class="kicker"><img src="%(logo)s" alt="">고척교회 성경말씀 암송</div>
    <h1>성경말씀 암송,<br>이제 휴대폰 앱으로</h1>
    <div class="sub">이번 주 말씀을 보고 · 듣고 · 빈칸을 채우며 외워요</div>
    <div class="steps">%(steps)s</div>
  </div>
  <div class="right">
    <div class="qrbox">%(qr)s</div>
    <div class="cap">카메라로 비추세요</div>
    <div class="url">gocheok.onlybible.kr/install</div>
    <div class="kinds"><span>안드로이드</span><span>아이폰</span><span>설치 없이</span></div>
  </div>
  <div class="foot">
    <div class="verse">주의 말씀은 내 발에 등이요 내 길에 빛이니이다<small>시편 119편 105절</small></div>
    <div class="team">고척교회 제자양육부 신앙운동팀<br>문의 교회 사무실 02-2686-5871~3</div>
  </div>
</div></body></html>"""


def build():
    steps = "".join('<div class="step"><div class="no">%d</div><div class="st">%s<br><span>%s</span></div></div>' % (i + 1, a, b)
                    for i, (a, b) in enumerate(STEPS))
    return HTML % dict(ink=INK, soft=SOFT, logo=LOGO, steps=steps, qr=qr_svg(88))


def main():
    html = build()
    pdf = os.path.join(HERE, "install-a4.pdf")
    png = os.path.join(HERE, "install-a4.png")
    with sync_playwright() as pw:
        b = pw.chromium.launch(channel="chrome", headless=True)
        p = b.new_page(viewport={"width": 1123, "height": 794}, device_scale_factor=3)   # 297×210mm @96dpi
        p.set_content(html, wait_until="networkidle")
        p.evaluate("document.fonts.ready")
        p.wait_for_timeout(600)
        over = p.evaluate("""() => { const pg = document.querySelector('.page').getBoundingClientRect();
          return [...document.querySelectorAll('.page *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.right > pg.right + 1 || r.bottom > pg.bottom + 1); })
            .map(e => e.className || e.tagName).slice(0, 5); }""")
        fonts = p.evaluate("() => [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family + ' ' + f.weight).filter((v, i, a) => a.indexOf(v) === i)")
        clash = p.evaluate("""() => { const f = document.querySelector('.foot').getBoundingClientRect(); const l = document.querySelector('.steps').getBoundingClientRect();
          const r = document.querySelector('.kinds').getBoundingClientRect(); return { stepsBottom: Math.round(l.bottom), kindsBottom: Math.round(r.bottom), footTop: Math.round(f.top) }; }""")
        p.pdf(path=pdf, width="297mm", height="210mm", print_background=True, prefer_css_page_size=True)
        p.screenshot(path=png, full_page=False, omit_background=True)
        b.close()
    print("넘침:", over or "없음", "| 글꼴:", fonts, "| 아래 여유:", clash)
    # 종이색 미리보기 — 노란 색지 · 엷은 보라 색지 위에 얹어 본다
    art = Image.open(png).convert("RGBA")
    for name, color in (("yellow", (255, 241, 150)), ("purple", (226, 214, 240))):
        bg = Image.new("RGBA", art.size, color + (255,))
        bg.alpha_composite(art)
        bg.convert("RGB").save(os.path.join(HERE, "preview-%s.png" % name))
    print(pdf)


if __name__ == "__main__":
    main()
