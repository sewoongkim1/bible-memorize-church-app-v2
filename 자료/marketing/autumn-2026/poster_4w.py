# -*- coding: utf-8 -*-
"""2026 가을 말씀암송 동행 — 「8주 중 4주」 새 포스터(2026-11-06 친구 「포스터는 멋지게 다시 만들어 주세요」)
   A3(297×420mm) — 옅은 보라 색지에 인쇄 · 배경 없음(투명) · 글씨 어두운 남색  →  poster-a3-4w.pdf / .png
   16:9 슬라이드(예배 전 광고 화면) — 어두운 남색 판                            →  slide-16x9-4w.pdf / .png
   카톡 미리보기 카드(index.html og:image · 1200×630) — 날짜에 기대는 띠 · QR 없음  →  og-autumn-4w.png
     ⚠️ 뽑은 뒤 저장소 뿌리에 복사한다(cp og-autumn-4w.png ../../../) — 사이트는 뿌리의 그림만 내보낸다.
     「11월 12일까지」는 넣지 않는다 — 카톡이 주소마다 카드를 오래 캐시해 그날이 지나도 그대로 뜬다.
   옛 판(poster.py · 8주 중 5주)은 그대로 둔다(다른 작업이 남아 있다). 규칙이 바뀌면 아래 상수만 고치고 다시 뽑는다:
     python poster_4w.py   (playwright · 크롬 · 글꼴은 Google Fonts)
   ⚠️ 이벤트 문구 규칙(문구.md 머리): 「선물 대상」·「신청」·「자격」·「달성」·「당첨」·「상」·「순위」 쓰지 않기 · 선물은 「소정의 선물」만."""
import io, os

PER_DAY = 3          # 하루 몇 번이면 그날 한 칸
DAYS_PER_WEEK = 3    # 한 주에 며칠이면 그 주 채움
WEEKS, NEED = 8, 4   # 여덟 주 가운데 네 주(2026-11-06 5 → 4)
LAST_START = "11월 12일(목)"   # 다섯째 주(11/8~14)에 사흘 — 이날까지 시작하면 남은 네 주를 모두 채울 수 있다
END = "12월 5일(토)"
FILLED = (1, 3, 4, 7)          # 그림 속 물든 잎(어느 네 주든 괜찮다는 뜻 — 띄엄띄엄)

HERE = os.path.dirname(os.path.abspath(__file__))
M = os.path.join(HERE, '..') + '/'
LOGO = io.open(os.path.join(M, 'logo-data-uri.txt'), encoding='utf-8').read().strip()
QR_WEB = io.open(os.path.join(M, 'qr-web.txt'), encoding='utf-8').read().strip()
QR_IOS = io.open(os.path.join(M, 'qr-ios.txt'), encoding='utf-8').read().strip()
QR_PLAY = io.open(os.path.join(M, 'qr-play.txt'), encoding='utf-8').read().strip()

KO_NUM = {1: "한", 2: "두", 3: "세", 4: "네", 5: "다섯", 6: "여섯", 7: "일곱", 8: "여덟"}

# 단풍잎(옛 판과 같은 꼴) — 남색에서 금색 · 붉은색으로 물든다
MAPLE = "M50 4 L56 20 L62 30 L70 26 L90 32 L74 44 L66 50 L76 58 L82 74 L64 70 L56 78 L53 86 L47 86 L44 78 L36 70 L18 74 L24 58 L34 50 L26 44 L10 32 L30 26 L38 30 L44 20 Z"
STOPS = [
    [("0", "#23508f"), (".5", "#cfa44e"), ("1", "#b23321")],
    [("0", "#2b5490"), (".42", "#cf9a44"), ("1", "#a82c1b")],
    [("0", "#3f5e92"), (".32", "#c76a2e"), ("1", "#9a2214")],
    [("0", "#2a4f86"), (".55", "#d3aa52"), ("1", "#b7452a")],
]


def leaf_svg(gid, size, stops=None, outline=None, rot=0, op=1):
    """잎 하나 — stops 면 물든 잎, outline 이면 테두리만(아직 비어 있는 주)."""
    if stops:
        gs = "".join('<stop offset="%s" stop-color="%s"/>' % s for s in stops)
        body = ('<defs><linearGradient id="%s" x1="0" y1="0" x2=".2" y2="1">%s</linearGradient></defs>'
                '<rect x="48.5" y="80" width="3" height="24" rx="1.3" fill="#8a4a1a"/>'
                '<path fill="url(#%s)" d="%s"/>') % (gid, gs, gid, MAPLE)
    else:
        body = ('<rect x="48.6" y="80" width="2.8" height="22" rx="1.3" fill="none" stroke="%s" stroke-width="2.2"/>'
                '<path fill="none" stroke="%s" stroke-width="3" stroke-dasharray="7 5" stroke-linejoin="round" d="%s"/>') % (outline, outline, MAPLE)
    return '<svg width="%s" viewBox="0 0 100 106" style="transform:rotate(%sdeg);opacity:%s">%s</svg>' % (size, rot, op, body)


def week_row(size, outline, label_color, sub_color):
    """여덟 주 — 물든 잎 넷(띄엄띄엄) · 빈 잎 넷 · 아래 주 이름."""
    cells = []
    for i in range(1, WEEKS + 1):
        on = i in FILLED
        svg = leaf_svg("wk%d" % i, size, STOPS[(i - 1) % 4] if on else None, None if on else outline, rot=(-8 if i % 2 else 7))
        cells.append('<div class="wk%s">%s<div class="wl" style="color:%s">%d주</div></div>' % (" on" if on else "", svg, label_color if on else sub_color, i))
    return '<div class="weeks">%s</div>' % "".join(cells)


def branch(cls, items):
    """오른쪽 위 단풍 가지(장식) — (top, right, size, rot, stops, op)."""
    out = []
    for k, (t, r, s, rot, st, op) in enumerate(items):
        out.append('<div class="%s" style="top:%s;right:%s">%s</div>' % (cls, t, r, leaf_svg("%s%d" % (cls, k), s, STOPS[st], rot=rot, op=op)))
    return "".join(out)


CSS = """
@page { size: %(size)s; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: "Noto Sans KR", sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.p { width: %(w)s; height: %(h)s; position: relative; overflow: hidden; background: %(bg)s; color: %(ink)s; }
.dec { position: absolute; }
.serif { font-family: "Nanum Myeongjo", serif; }
.weeks { display: flex; justify-content: space-between; align-items: flex-end; }
.wk { display: flex; flex-direction: column; align-items: center; }
.wk .wl { font-weight: 800; letter-spacing: .02em; }
"""

HEAD = """<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Nanum+Myeongjo:wght@400;700;800&family=Noto+Sans+KR:wght@400;500;700;800;900&display=swap" rel="stylesheet">
<style>%s</style></head><body>"""

INK, GOLD, SUB, SOFT = "#12294f", "#a8740c", "#3a4a66", "#5a6273"


def poster_a3():
    css = CSS % dict(size="297mm 420mm", w="297mm", h="420mm", bg="transparent", ink=INK) + """
.wk { width: 27mm; } .wk .wl { font-size: 12pt; margin-top: 1.5mm; }
.rule { flex: 1; text-align: center; padding: 0 3mm; }
.rule + .rule { border-left: 1.4px solid rgba(26,58,107,.22); }
.rule .big { font-size: 25pt; font-weight: 800; color: %(ink)s; word-break: keep-all; }
.rule .sm { font-size: 13pt; color: %(sub)s; margin-top: 2.2mm; line-height: 1.5; word-break: keep-all; }
.step { flex: 1; display: flex; align-items: center; gap: 4mm; }
.step b { flex: none; width: 12mm; height: 12mm; border-radius: 50%%; background: %(gold)s; color: #fff;
          display: flex; align-items: center; justify-content: center; font-size: 17pt; font-weight: 900; }
.step p { font-size: 14.5pt; font-weight: 700; line-height: 1.4; word-break: keep-all; color: %(ink)s; }
.qr { flex: 1; background: #fff; border: 1px solid rgba(26,58,107,.18); border-radius: 5mm; padding: 5mm 4mm 4mm; text-align: center; }
.qr img { width: 30mm; height: 30mm; display: block; margin: 0 auto; image-rendering: pixelated; }
.qr div { font-size: 12pt; font-weight: 700; color: %(ink)s; margin-top: 2.5mm; }
""" % dict(ink=INK, sub=SUB, gold=GOLD)
    deco = branch("dec", [("38mm", "14mm", "26mm", 24, 0, 1), ("36mm", "50mm", "14mm", -16, 2, .92),
                          ("64mm", "36mm", "19mm", 38, 1, .9), ("82mm", "12mm", "14mm", -30, 2, .85),
                          ("96mm", "46mm", "11mm", 16, 3, .8)])
    filled_ko, rest_ko = KO_NUM[NEED], KO_NUM[WEEKS - NEED]
    body = """
<div class="p">%(deco)s
 <div style="position:relative;height:100%%;padding:18mm 20mm 16mm;display:flex;flex-direction:column">
  <div style="display:flex;justify-content:flex-end;align-items:center;gap:3mm">
    <span style="font-size:12.5pt;font-weight:700;color:#7a5a1a">오직 성경, 말씀이 답이다!</span><img src="%(logo)s" style="width:12mm;height:12mm;object-fit:cover;object-position:top">
  </div>

  <div style="margin-top:9mm;font-size:15pt;font-weight:800;color:%(gold)s;letter-spacing:.04em">2026 고척교회 · 성경암송 앱과 함께</div>
  <h1 class="serif" style="margin-top:3mm;font-size:72pt;font-weight:800;line-height:1.1;letter-spacing:-.02em;word-break:keep-all">가을 <span style="color:%(gold)s">말씀암송</span> 동행</h1>
  <p class="serif" style="margin-top:6mm;font-size:21pt;font-weight:700;line-height:1.65;color:%(ink)s;word-break:keep-all">올해 받은 말씀을 기억하고, 말씀 앞에 머무는 시간.<br>이번 주 말씀을 한 주 내내 마음에 품는 시간.</p>

  <div style="margin-top:9mm;text-align:center">
    <div class="serif" style="font-size:40pt;font-weight:800;letter-spacing:-.01em">%(weeks_ko)s 주 가운데 <span style="color:%(gold)s">%(need_ko)s 주</span></div>
    <div style="margin-top:2.5mm;font-size:14.5pt;color:%(sub)s;word-break:keep-all">어느 %(need_ko)s 주든 괜찮아요 — <b style="color:%(ink)s">%(rest_ko)s 주는 쉬어도</b> 돼요</div>
    <div style="margin:7mm 2mm 0">%(row)s</div>
  </div>

  <div style="display:flex;margin-top:9mm;padding:6mm 0;border-top:1.4px solid rgba(26,58,107,.22);border-bottom:1.4px solid rgba(26,58,107,.22)">
    <div class="rule"><div class="big">하루 %(per_day)d번</div><div class="sm">말씀을 암송하시면<br><b style="color:%(ink)s">그날 한 칸</b></div></div>
    <div class="rule"><div class="big">한 주에 %(dpw)d일</div><div class="sm">채우시면<br><b style="color:%(ink)s">그 주 한 잎</b></div></div>
    <div class="rule"><div class="big">%(weeks)d주 중 %(need)d주</div><div class="sm">채우시면<br><b style="color:%(ink)s">소정의 선물</b></div></div>
  </div>

  <div style="margin-top:8mm;border-radius:6mm;padding:6.5mm 8mm;background:%(gold)s;text-align:center">
    <div style="font-size:27pt;font-weight:900;color:#fff;word-break:keep-all">🍂 지금 시작해도 늦지 않았어요!</div>
    <div style="margin-top:2mm;font-size:15.5pt;font-weight:600;color:#fff7e2;word-break:keep-all"><b style="color:#fff">%(last)s</b>까지 시작하시면 %(need_ko)s 주를 채우실 수 있어요</div>
  </div>

  <div style="display:flex;gap:7mm;margin-top:9mm">
    <div class="step"><b>1</b><p>QR을 찍고<br>교구·목장·이름 넣기</p></div>
    <div class="step"><b>2</b><p>하루 %(per_day)d번<br>이번 주 말씀 암송</p></div>
    <div class="step"><b>3</b><p>첫 화면 🏅에서<br>내 잎 확인</p></div>
  </div>

  <div style="flex:1"></div>

  <div style="display:flex;align-items:baseline;justify-content:space-between;gap:4mm">
    <div style="font-size:15pt;font-weight:700;word-break:keep-all">꾸준히 함께하신 성도님께 <span style="color:%(gold)s">소정의 선물</span>을 드려요</div>
    <div style="font-size:13pt;font-weight:600;color:%(sub)s;white-space:nowrap">%(end)s까지</div>
  </div>
  <div style="display:flex;gap:7mm;margin-top:4.5mm">
    <div class="qr"><img src="%(qr_play)s"><div>안드로이드 앱</div></div>
    <div class="qr"><img src="%(qr_ios)s"><div>아이폰 앱</div></div>
    <div class="qr"><img src="%(qr_web)s"><div>웹에서 바로</div></div>
  </div>
  <div class="serif" style="margin-top:6mm;text-align:center;font-size:15.5pt;font-weight:700;line-height:1.5;word-break:keep-all">주의 말씀은 내 발에 등이요 내 길에 빛이니이다 <span style="font-size:12.5pt">(시편 119편 105절)</span></div>
  <div style="margin-top:2.5mm;text-align:right;font-size:11pt;color:%(soft)s">제자양육부 신앙운동팀</div>
 </div>
</div>""" % dict(deco=deco, logo=LOGO, gold=GOLD, ink=INK, sub=SUB, soft=SOFT, per_day=PER_DAY, dpw=DAYS_PER_WEEK,
                weeks=WEEKS, need=NEED, weeks_ko=KO_NUM[WEEKS], need_ko=filled_ko, rest_ko=rest_ko, last=LAST_START, end=END,
                row=week_row("22mm", "rgba(26,58,107,.42)", INK, "#7a8396"), qr_play=QR_PLAY, qr_ios=QR_IOS, qr_web=QR_WEB)
    return (HEAD % css) + body + "</body></html>"


def slide_169():
    css = CSS % dict(size="1920px 1080px", w="1920px", h="1080px",
                     bg="radial-gradient(130% 80% at 15% -10%, rgba(201,162,75,.26), transparent 55%), linear-gradient(165deg, #12294f 0%, #1a3a6b 48%, #0f2545 100%)", ink="#fff") + """
.wk { width: 104px; } .wk .wl { font-size: 24px; margin-top: 8px; }
.rule { flex: 1; text-align: center; padding: 0 10px; }
.rule + .rule { border-left: 2px solid rgba(255,255,255,.22); }
.rule .big { font-size: 40px; font-weight: 900; color: #fff; }
.rule .sm { font-size: 21px; color: #cfdcf2; margin-top: 8px; line-height: 1.45; }
.qr { flex: 1; background: #fff; border-radius: 18px; padding: 16px 12px 12px; text-align: center; }
.qr img { width: 150px; height: 150px; display: block; margin: 0 auto; image-rendering: pixelated; }
.qr div { font-size: 20px; font-weight: 800; color: #12294f; margin-top: 8px; }
"""
    deco = branch("dec", [("40px", "70px", "92px", 18, 0, .95), ("150px", "40px", "58px", -22, 2, .9), ("24px", "230px", "50px", 36, 1, .85)])
    body = """
<div class="p">%(deco)s
 <div style="position:relative;height:100%%;padding:56px 80px 48px;display:flex;flex-direction:column">
  <div style="display:flex;align-items:center;gap:14px">
    <img src="%(logo)s" style="width:56px;height:56px;object-fit:cover;object-position:top">
    <span style="font-size:24px;font-weight:700;color:#e7d6a8">오직 성경, 말씀이 답이다!</span>
    <span style="font-size:24px;font-weight:800;color:#ffd875;margin-left:18px">2026 고척교회 · 성경암송 앱과 함께</span>
  </div>
  <div style="display:flex;gap:70px;margin-top:26px;flex:1">
    <div style="flex:1.12;display:flex;flex-direction:column;justify-content:center">
      <h1 class="serif" style="font-size:104px;font-weight:800;line-height:1.05;letter-spacing:-.02em">가을 <span style="color:#ffd875">말씀암송</span> 동행</h1>
      <p class="serif" style="margin-top:18px;font-size:31px;font-weight:700;line-height:1.5;color:#fff">올해 받은 말씀을 기억하고, 말씀 앞에 머무는 시간.<br>이번 주 말씀을 한 주 내내 마음에 품는 시간.</p>
      <div style="margin-top:44px">
        <div class="serif" style="font-size:66px;font-weight:800">%(weeks_ko)s 주 가운데 <span style="color:#ffd875">%(need_ko)s 주</span></div>
        <div style="margin-top:8px;font-size:27px;color:#cfdcf2">어느 %(need_ko)s 주든 괜찮아요 — <b style="color:#fff">%(rest_ko)s 주는 쉬어도</b> 돼요</div>
        <div style="margin-top:28px;max-width:900px">%(row)s</div>
      </div>
    </div>
    <div style="flex:.88;display:flex;flex-direction:column;justify-content:center;gap:26px">
      <div style="display:flex;padding:22px 0;border-top:2px solid rgba(255,255,255,.22);border-bottom:2px solid rgba(255,255,255,.22)">
        <div class="rule"><div class="big">하루 %(per_day)d번</div><div class="sm">암송하시면<br><b style="color:#fff">그날 한 칸</b></div></div>
        <div class="rule"><div class="big">한 주에 %(dpw)d일</div><div class="sm">채우시면<br><b style="color:#fff">그 주 한 잎</b></div></div>
        <div class="rule"><div class="big">%(weeks)d주 중 %(need)d주</div><div class="sm">채우시면<br><b style="color:#fff">소정의 선물</b></div></div>
      </div>
      <div style="border-radius:20px;padding:22px 26px;background:rgba(255,216,117,.12);border:3px solid #c9a24b;text-align:center">
        <div style="font-size:42px;font-weight:900">🍂 지금 시작해도 늦지 않았어요!</div>
        <div style="margin-top:6px;font-size:25px;font-weight:600;color:#e9eef9"><b style="color:#ffd875">%(last)s</b>까지 시작하시면 %(need_ko)s 주를 채우실 수 있어요</div>
      </div>
      <div style="display:flex;gap:18px">
        <div class="qr"><img src="%(qr_play)s"><div>안드로이드 앱</div></div>
        <div class="qr"><img src="%(qr_ios)s"><div>아이폰 앱</div></div>
        <div class="qr"><img src="%(qr_web)s"><div>웹에서 바로</div></div>
      </div>
    </div>
  </div>
  <div style="display:flex;align-items:center;margin-top:14px">
    <div style="flex:1;font-size:24px;font-weight:800;color:#ffd875">%(end)s까지</div>
    <div class="serif" style="font-size:27px;font-weight:700">주의 말씀은 내 발에 등이요 내 길에 빛이니이다 <span style="font-size:21px">(시편 119편 105절)</span></div>
    <div style="flex:1;text-align:right;font-size:19px;color:#9fb4d6">제자양육부 신앙운동팀</div>
  </div>
 </div>
</div>""" % dict(deco=deco, logo=LOGO, per_day=PER_DAY, dpw=DAYS_PER_WEEK, weeks=WEEKS, need=NEED, weeks_ko=KO_NUM[WEEKS],
                need_ko=KO_NUM[NEED], rest_ko=KO_NUM[WEEKS - NEED], last=LAST_START, end=END,
                row=week_row("88px", "rgba(255,255,255,.55)", "#ffd875", "#9fb4d6"), qr_play=QR_PLAY, qr_ios=QR_IOS, qr_web=QR_WEB)
    return (HEAD % css) + body + "</body></html>"


def og_card():
    """카톡 · 문자 미리보기(1200×630) — 남색 판 · 큰 제목 · 여덟 잎 · 규칙 띠. 카톡이 위아래를 조금 자르니 가장자리는 비운다."""
    css = CSS % dict(size="1200px 630px", w="1200px", h="630px",
                     bg="radial-gradient(120% 90% at 12% -12%, rgba(201,162,75,.30), transparent 55%), linear-gradient(160deg, #12294f 0%, #1a3a6b 50%, #0f2545 100%)", ink="#fff") + """
.wk { width: 70px; } .wk .wl { font-size: 17px; margin-top: 4px; }
.rule { text-align: center; padding: 14px 0; }
.rule + .rule { border-top: 2px solid rgba(255,255,255,.2); }
.rule .big { font-size: 34px; font-weight: 900; color: #fff; line-height: 1.15; }
.rule .sm { font-size: 18px; color: #cfdcf2; margin-top: 4px; }
"""
    deco = branch("dec", [("26px", "40px", "64px", 18, 0, .95), ("104px", "22px", "40px", -22, 2, .9), ("16px", "150px", "36px", 36, 1, .85)])
    body = """
<div class="p">%(deco)s
 <div style="position:relative;height:100%%;padding:40px 56px 36px;display:flex;flex-direction:column">
  <div style="display:flex;align-items:center;gap:10px">
    <img src="%(logo)s" style="width:40px;height:40px;object-fit:cover;object-position:top">
    <span style="font-size:19px;font-weight:700;color:#e7d6a8">오직 성경, 말씀이 답이다!</span>
    <span style="font-size:19px;font-weight:800;color:#ffd875;margin-left:12px">2026 고척교회 · 성경암송 앱과 함께</span>
  </div>
  <div style="display:flex;gap:44px;margin-top:14px;flex:1;align-items:center">
    <div style="flex:1">
      <h1 class="serif" style="font-size:74px;font-weight:800;line-height:1.08;letter-spacing:-.02em;white-space:nowrap">가을 <span style="color:#ffd875">말씀암송</span> 동행</h1>
      <div class="serif" style="margin-top:22px;font-size:50px;font-weight:800;white-space:nowrap">%(weeks_ko)s 주 가운데 <span style="color:#ffd875">%(need_ko)s 주</span></div>
      <div style="margin-top:6px;font-size:22px;color:#cfdcf2;white-space:nowrap">어느 %(need_ko)s 주든 괜찮아요 — <b style="color:#fff">%(rest_ko)s 주는 쉬어도</b> 돼요</div>
      <div style="margin-top:18px;width:640px">%(row)s</div>
    </div>
    <div style="width:300px;border-radius:22px;padding:6px 22px;background:rgba(255,255,255,.07);border:2px solid rgba(201,162,75,.75)">
      <div class="rule"><div class="big">하루 %(per_day)d번</div><div class="sm">암송하시면 <b style="color:#fff">그날 한 칸</b></div></div>
      <div class="rule"><div class="big">한 주에 %(dpw)d일</div><div class="sm">채우시면 <b style="color:#fff">그 주 한 잎</b></div></div>
      <div class="rule"><div class="big">%(weeks)d주 중 %(need)d주</div><div class="sm">채우시면 <b style="color:#ffd875">소정의 선물</b></div></div>
    </div>
  </div>
  <div style="display:flex;align-items:center;margin-top:10px">
    <div style="font-size:21px;font-weight:800;color:#ffd875;white-space:nowrap">%(end)s까지 · 앱에서 바로 시작해요</div>
    <div class="serif" style="flex:1;text-align:right;font-size:19px;font-weight:700;color:#e9eef9;white-space:nowrap">주의 말씀은 내 발에 등이요 내 길에 빛이니이다 <span style="font-size:15px">(시편 119편 105절)</span></div>
  </div>
 </div>
</div>""" % dict(deco=deco, logo=LOGO, per_day=PER_DAY, dpw=DAYS_PER_WEEK, weeks=WEEKS, need=NEED, weeks_ko=KO_NUM[WEEKS],
                need_ko=KO_NUM[NEED], rest_ko=KO_NUM[WEEKS - NEED], end=END,
                row=week_row("58px", "rgba(255,255,255,.55)", "#ffd875", "#9fb4d6"))
    return (HEAD % css) + body + "</body></html>"


if __name__ == "__main__":
    from playwright.sync_api import sync_playwright
    OUT = HERE
    pages = [("poster-a3-4w", poster_a3(), dict(width="297mm", height="420mm"), (1123, 1587), True),
             ("slide-16x9-4w", slide_169(), dict(width="1920px", height="1080px"), (1920, 1080), False),
             ("og-autumn-4w", og_card(), None, (1200, 630), False)]   # 미리보기 그림은 PDF 없이
    with sync_playwright() as pw:
        b = pw.chromium.launch(channel="chrome", headless=True)
        for name, html, pdf_size, (w, h), transparent in pages:
            p = b.new_page(viewport={"width": w, "height": h}, device_scale_factor=2 if transparent else 1)
            p.set_content(html, wait_until="networkidle")
            p.wait_for_timeout(1200)   # 글꼴
            if pdf_size:
                p.pdf(path=os.path.join(OUT, name + ".pdf"), print_background=not transparent, **pdf_size)
            p.screenshot(path=os.path.join(OUT, name + ".png"), full_page=False, omit_background=transparent)
            p.close()
        b.close()
    print("ok")
