# -*- coding: utf-8 -*-
"""가정 축복 기도문 핸드북 — A5 세로, 한 편 한 쪽.

   사용법:  python generate_blessing.py [이름]
            예)  python generate_blessing.py 김세웅

   설계는 docs/superpowers/specs/2026-09-03-blessing-handbook-design.md 참고. 요약:
   - 본문 배열은 **성경 순** 그대로(창세기 1편 → 시편 104편). 주제는 뒤쪽 색인으로만.
   - 104편을 **52편씩 두 권**으로. 한 권이 얇아야 가정 예배에서 꺼내 쓴다.
   - 이름은 **인쇄한다**(빈칸이 아니라). 한 사람용이므로 조사까지 맞춰 박는다.
   - 묵상노트는 쪽마다 남는 만큼 준다(같은 크기로 맞추지 않는다).
     ⚠️ 자리가 모자라면 **말씀 글씨만** 줄인다 — 기도문은 이 책의 주인공이라 건드리지 않는다.
       줄인 쪽은 실행할 때 목록으로 알려 준다.

   ⚠️ 1mm = 96/25.4 = 3.7795px 고정이다. 창 너비에 맞춰 늘어나지 않는다.
      넘치는지는 화면 짐작이 아니라 **측정**으로 확인한다(tools 로 쪽 높이를 잰다).
"""
import json, io, re, html, os, sys

os.chdir(os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.dirname(os.getcwd())

NAME = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith('-') else '홍길동'
VISION = '2026년 비전: 예수동행, 말씀동행 (눅24:32)'
AMEN = '예수님의 이름으로 축복하며 기도합니다. 아멘!'
PER_VOL = 52

rows = sorted(json.load(io.open(os.path.join(ROOT, 'blessings.json'), encoding='utf-8')),
              key=lambda r: r['no'])

LOGO = ''
_lg = os.path.join(ROOT, 'marketing', 'logo-data-uri.txt')
if os.path.exists(_lg):
    LOGO = io.open(_lg, encoding='utf-8').read().strip()


# ── 이름과 조사 ───────────────────────────────────────────────
# 받침이 없거나 ㄹ 이면 「로」다.
#   오연화로(받침 없음) · 김윤월로(ㄹ) · 김세웅으로(ㅇ). 128명 중 일곱 분이 걸린다.
def jong(name):
    c = ord(name[-1])
    return (c - 0xAC00) % 28 if 0xAC00 <= c <= 0xD7A3 else 0


def fill(t, name):
    j = jong(name)
    return (t.replace('{이름}', name)
             .replace('{이}', '이' if j else '가')
             .replace('{을}', '을' if j else '를')
             .replace('{은}', '은' if j else '는')
             .replace('{과}', '과' if j else '와')
             .replace('{으로}', '로' if j in (0, 8) else '으로'))


BOOK = {'창세기': '창', '출애굽기': '출', '레위기': '레', '민수기': '민', '신명기': '신',
        '여호수아': '수', '사사기': '삿', '룻기': '룻', '사무엘상': '삼상', '사무엘하': '삼하',
        '열왕기상': '왕상', '열왕기하': '왕하', '역대상': '대상', '역대하': '대하',
        '에스라': '스', '느헤미야': '느', '에스더': '에', '욥기': '욥', '시편': '시'}


def short(ref):
    m = re.match(r'^([가-힣]+)\s*(.*)$', ref)
    return (BOOK.get(m.group(1), m.group(1)) + ' ' + m.group(2)) if m else ref


def bookof(ref):
    return re.match(r'^([가-힣]+)', ref).group(1)


# ── 말씀 글씨 크기 — 자리가 모자라면 이것만 줄인다 ───────────────
#   본문 폭 122mm · 밑줄 간격 8mm · 기도문 상자는 10pt 고정 · 묵상노트 20mm 는 지킨다
#   ⚠️ 글씨를 먼저 줄이고, 8.5pt 까지 가서도 모자라면 **줄 간격**을 좁힌다.
#      순서가 중요하다 — 줄 간격을 먼저 좁히면 밑줄 모양이 쪽마다 달라 보인다.
#      8.5pt 아래로는 내려가지 않는다(어르신이 읽으실 책이다).
STEPS = [('', 10.5, 8), ('v-s', 10, 8), ('v-xs', 9.5, 8), ('v-xxs', 9, 8), ('v-xxxs', 8.5, 8),
         ('v-xxxs t7', 8.5, 7), ('v-xxxs t65', 8.5, 6.5)]
MEMO_MIN = 20


def plan(r, name):
    """(클래스, 쓴 pt, 줄 간격 mm, 남는 묵상노트 mm)."""
    v = len(r['verse'])
    p = len(fill(r['prayer'], name)) + len(AMEN) + 1
    pray_mm = -(-p // 31) * 6 + 10

    def used_with(pt, lh):
        per = int(122 / (pt * 0.3528))
        return 14 + (-(-v // per)) * lh + 6 + pray_mm

    for cls, pt, lh in STEPS:
        if 168 - used_with(pt, lh) >= MEMO_MIN:
            return cls, pt, lh, 168 - used_with(pt, lh)
    cls, pt, lh = STEPS[-1]
    return cls, pt, lh, 168 - used_with(pt, lh)


# ── 한 편 = 한 쪽 ─────────────────────────────────────────────
def page(r, pno, name):
    cls, _pt, _lh, _memo = plan(r, name)
    return """
<section class="page bl">
  <div class="b-title">%s</div>
  <div class="b-meta"><span>%s</span><span>2026 년 &nbsp; 월 &nbsp; 일</span></div>
  <div class="b-verse %s">%s</div>
  <div class="b-note-x">※ 축복 기도문에 자신의 삶과 가족, 친구들을 위해 이름을 넣어 기도합니다.</div>
  <div class="b-pray">%s<div class="b-amen">%s</div></div>
  <div class="b-memo"><span class="b-memo-t">묵상노트</span></div>
  <div class="b-foot"><span>God is love.</span><span class="b-vis">%s</span><span class="b-pno">%d</span></div>
</section>""" % (html.escape(r['title']), html.escape(r['ref']), cls,
                 html.escape(r['verse']), html.escape(fill(r['prayer'], name)),
                 html.escape(AMEN), html.escape(VISION), pno)


def cover(vol, name, first, last):
    logo = '<img class="c-logo" src="%s">' % LOGO if LOGO else ''
    return """
<section class="page c">
  <div class="c-in">
    %s
    <div class="c-church">고척교회</div>
    <h1 class="c-t">가정 축복<br>기도문</h1>
    <div class="c-line"></div>
    <div class="c-vol">%d권 &nbsp;·&nbsp; %s ~ %s</div>
    <div class="c-name">%s 님</div>
    <div class="c-v">여호와는 네게 복을 주시고 너를 지키시기를 원하며<br><b>민수기 6장 24절</b></div>
  </div>
</section>
<section class="page blank"></section>""" % (logo, vol, html.escape(short(first['ref'])),
                                             html.escape(short(last['ref'])), html.escape(name))


def intro(name, n):
    return """
<section class="page plain">
  <h2 class="ph">이 책을 쓰는 법</h2>
  <div class="pbody">
    <p>한 쪽에 <b>한 편</b>입니다. 위에서부터 <b>말씀</b>을 소리 내어 읽고,
       아래 상자의 <b>축복 기도문</b>을 그대로 기도하시면 됩니다.</p>
    <p>기도문에는 <b>%s 님의 이름이 이미 들어가 있습니다.</b> 가족이나 이웃을 위해
       기도하실 때는 그 자리에 그분의 이름을 넣어 읽으세요.</p>
    <p>날짜 칸에 <b>그날 날짜</b>를 적어 두시면 언제 이 말씀으로 기도했는지 남습니다.
       한 편을 여러 번 기도하셔도 좋습니다.</p>
    <p><b>묵상노트</b>에는 그날 받은 마음을 자유롭게 적어 보세요. 한 해가 지나 다시 펼치면
       그것이 응답의 기록이 됩니다.</p>
    <p>순서는 <b>성경 차례 그대로</b>입니다. 앞에서부터 차례로 하셔도 좋고,
       뒤쪽 <b>「주제로 찾기」</b>에서 오늘 필요한 것을 골라 펴셔도 좋습니다.</p>
    <p>이 책은 <b>%d편</b>입니다. 하루 한 편이면 %d주가 채워집니다.</p>
  </div>
  <div class="b-foot"><span>God is love.</span><span class="b-vis">%s</span><span class="b-pno">3</span></div>
</section>""" % (html.escape(name), n, -(-n // 7), html.escape(VISION))


def toc(items, base):
    """차례는 **두 쪽**이다.
       ⚠️ 한 쪽에 52편을 두 단으로 밀어 넣었더니 넘쳤다(2권은 36mm). 글씨를 줄여
          맞출 수도 있었지만, 차례는 찾아보는 곳이라 작아지면 쓸모가 준다.
          쪽을 하나 더 쓰는 편이 싸다 — 뒤에 있던 빈 쪽을 여기로 옮긴 셈이라 총 쪽수는 그대로다."""
    pairs = [(r, base + i) for i, r in enumerate(items)]
    half = -(-len(pairs) // 2)

    def col(part, cur_in):
        out, cur = [], cur_in
        for r, pno in part:
            bk = bookof(r['ref'])
            if bk != cur:
                out.append('<div class="tb">%s</div>' % html.escape(bk))
                cur = bk
            out.append('<div class="tc"><span class="tr">%s</span><span class="tp">%d</span></div>'
                       % (html.escape(r['title']), pno))
        return ''.join(out), cur

    def sheet(part, pno, more):
        q = -(-len(part) // 2)
        left, cur = col(part[:q], None)
        right, _ = col(part[q:], cur)          # 단이 바뀔 때 같은 책 이름을 다시 쓰지 않는다
        return """
<section class="page plain">
  <h2 class="ph">차례 <span class="ph-s">성경 순%s</span></h2>
  <div class="toc"><div>%s</div><div>%s</div></div>
  <div class="b-foot"><span>God is love.</span><span class="b-vis">%s</span><span class="b-pno">%d</span></div>
</section>""" % (more, left, right, html.escape(VISION), pno)

    return sheet(pairs[:half], 4, '') + sheet(pairs[half:], 5, ' · 이어서')


def index_by_group(items, base, last_pno):
    g = {}
    for i, r in enumerate(items):
        g.setdefault(r['group'], []).append(base + i)
    body = ''.join('<div class="ix"><span class="ix-g">%s</span><span class="ix-p">%s</span></div>'
                   % (html.escape(k), ', '.join(str(x) for x in v))
                   for k, v in sorted(g.items(), key=lambda kv: -len(kv[1])))
    return """
<section class="page plain">
  <h2 class="ph">주제로 찾기</h2>
  <div class="ix-note">오늘 필요한 기도를 주제로 골라 펴 보세요. 숫자는 쪽 번호입니다.</div>
  %s
  <div class="ix-end">여호와는 그 얼굴을 네게로 향하여 드사 평강 주시기를 원하노라<br><b>민수기 6장 26절</b></div>
  <div class="b-foot"><span>God is love.</span><span class="b-vis">%s</span><span class="b-pno">%d</span></div>
</section>""" % (body, html.escape(VISION), last_pno)


CSS = """
@page { size:148mm 210mm; margin:0; }
* { box-sizing:border-box; }
body { margin:0; font-family:"Noto Sans KR","Malgun Gothic",sans-serif; color:#1c2333;
       -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.page { width:148mm; height:210mm; padding:13mm 13mm 11mm; background:#fff;
        position:relative; overflow:hidden; page-break-after:always;
        display:flex; flex-direction:column; }
.page:last-child { page-break-after:auto; }
/* ── 본문 한 쪽 ───────────────────────────────────────────── */
.b-title { font-family:"Nanum Myeongjo",serif; font-size:15pt; font-weight:800; text-align:center;
           letter-spacing:-.2px; }
.b-meta { display:flex; justify-content:space-between; font-size:9pt; color:#3a4353;
          margin:3mm 0 2.5mm; padding-bottom:1.2mm; border-bottom:.8px solid #2b3444; }
/* 말씀 — 밑줄 위에 인쇄한다. 읽으며 표시하는 자리이지 필사가 아니다.
   ⚠️ 자리가 모자라면 이 크기만 줄인다(v-s → v-xxxs). 기도문은 이 책의 주인공이라 건드리지 않는다.
   ⚠️ 줄 간격(8mm)과 배경 줄무늬 간격이 **같아야** 글자가 줄 위에 앉는다. 하나만 고치지 말 것. */
.b-verse { font-family:"Nanum Myeongjo",serif; font-size:10.5pt; line-height:8mm; text-align:justify;
           word-break:keep-all;
           background-image:repeating-linear-gradient(to bottom,
                            transparent 0, transparent calc(8mm - .6px),
                            #d7dbe3 calc(8mm - .6px), #d7dbe3 8mm); }
.b-verse.v-s    { font-size:10pt; }
.b-verse.v-xs   { font-size:9.5pt; }
.b-verse.v-xxs  { font-size:9pt; }
.b-verse.v-xxxs { font-size:8.5pt; }
/* ⚠️ 줄 간격을 좁힐 때는 line-height 와 배경 줄무늬 간격을 **함께** 바꾼다.
   하나만 고치면 글자가 줄에서 떠 버린다. */
.b-verse.t7 { line-height:7mm;
  background-image:repeating-linear-gradient(to bottom, transparent 0, transparent calc(7mm - .6px),
                   #d7dbe3 calc(7mm - .6px), #d7dbe3 7mm); }
.b-verse.t65 { line-height:6.5mm;
  background-image:repeating-linear-gradient(to bottom, transparent 0, transparent calc(6.5mm - .6px),
                   #d7dbe3 calc(6.5mm - .6px), #d7dbe3 6.5mm); }
.b-note-x { font-size:8pt; color:#4a5364; text-align:center; margin:3.5mm 0 2mm; }
.b-pray { border:.8px solid #2b3444; padding:3.5mm 4mm; text-align:center;
          font-size:10pt; line-height:1.62; word-break:keep-all; }
.b-amen { margin-top:1.5mm; font-weight:700; }
.b-memo { flex:1; min-height:14mm; border:.8px solid #2b3444; border-top:none;
          padding:2mm 3mm; position:relative; }
.b-memo-t { position:absolute; right:3mm; top:1.6mm; font-size:8pt; color:#6b7383; }
.b-foot { position:absolute; left:13mm; right:13mm; bottom:6mm; display:flex; align-items:baseline;
          justify-content:space-between; border-top:.8px solid #2b3444; padding-top:1.5mm; }
.b-foot > span:first-child { font-size:10pt; font-weight:600; }
.b-vis { font-size:8pt; color:#3a4353; }
.b-pno { font-size:10pt; font-weight:700; }
/* ── 표지 ─────────────────────────────────────────────────── */
.c { background:#12294f; color:#fff; align-items:center; justify-content:center; text-align:center; }
.c-in { padding:0 6mm; }
.c-logo { width:20mm; margin-bottom:4mm; }
.c-church { font-size:10pt; letter-spacing:2px; opacity:.85; }
.c-t { font-family:"Nanum Myeongjo",serif; font-size:30pt; font-weight:800; line-height:1.3; margin:4mm 0 0; }
.c-line { width:22mm; height:1.2mm; background:#c8a24b; margin:5mm auto; }
.c-vol { font-size:10.5pt; opacity:.9; }
.c-name { margin-top:9mm; font-family:"Nanum Myeongjo",serif; font-size:16pt; font-weight:700; color:#e8c877; }
.c-v { margin-top:12mm; font-size:9pt; line-height:1.8; opacity:.85; }
.c-v b { color:#e8c877; }
/* ── 부속 ─────────────────────────────────────────────────── */
.ph { font-family:"Nanum Myeongjo",serif; font-size:16pt; font-weight:800; margin:0 0 5mm;
      padding-bottom:2mm; border-bottom:1.2px solid #2b3444; }
.ph-s { font-size:9pt; font-weight:400; color:#6b7383; margin-left:2mm; }
.pbody p { font-size:9.6pt; line-height:1.8; margin:0 0 3.5mm; word-break:keep-all; }
.toc { display:flex; gap:6mm; flex:1; }
.toc > div { flex:1; }
.tb { font-size:8.4pt; font-weight:800; color:#c8a24b; margin:2.5mm 0 1mm; }
.tc { display:flex; font-size:8.6pt; line-height:1.75; }
.tr { flex:1; word-break:keep-all; }
.tp { color:#6b7383; padding-left:2mm; }
.ix { display:flex; font-size:9.2pt; line-height:1.7; padding:1.6mm 0; border-bottom:.5px dotted #c9cfd9; }
.ix-g { width:32mm; font-weight:700; flex:none; }
.ix-p { flex:1; color:#3a4353; }
.ix-note { font-size:8.6pt; color:#4a5364; margin-bottom:3mm; }
.ix-end { margin-top:auto; text-align:center; font-size:9pt; line-height:1.8; color:#3a4353; }
.ix-end b { color:#12294f; }
"""


def build(vol, items, name):
    base = 6                      # 1 표지 · 2 여백 · 3 사용법 · 4 차례 · 5 여백 · 6~ 본문
    pages = [cover(vol, name, items[0], items[-1]), intro(name, len(items)), toc(items, base)]
    for i, r in enumerate(items):
        pages.append(page(r, base + i, name))
    pages.append(index_by_group(items, base, base + len(items)))
    out = ('<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">'
           '<link href="https://fonts.googleapis.com/css2?family=Nanum+Myeongjo:wght@400;700;800'
           '&family=Noto+Sans+KR:wght@300;400;500;700;800&display=swap" rel="stylesheet">'
           '<style>%s</style></head><body>%s</body></html>' % (CSS, ''.join(pages)))
    f = '축복기도문_%d권.html' % vol
    io.open(f, 'w', encoding='utf-8', newline='').write(out)
    return f, out.count('class="page')


vols = [rows[i:i + PER_VOL] for i in range(0, len(rows), PER_VOL)]
shrunk, tight = [], []
for n, items in enumerate(vols, 1):
    f, cnt = build(n, items, NAME)
    print('%s  —  %d편 · %d쪽' % (f, len(items), cnt))
    for i, r in enumerate(items):
        cls, pt, lh, memo = plan(r, NAME)
        if cls:
            shrunk.append((n, 6 + i, r, pt, lh, memo))
        if memo < MEMO_MIN:
            tight.append((n, 6 + i, r, pt, lh, memo))

print('\n■ 말씀이 길어 글씨를 줄인 쪽  %d편 / 104' % len(shrunk))
for vol, pno, r, pt, lh, memo in shrunk:
    print('   %d권 %3d쪽  %-18s %-14s 말씀 %3d자 → %.1fpt / 줄 %.1fmm  (묵상노트 %dmm)'
          % (vol, pno, r['title'], short(r['ref']), len(r['verse']), pt, lh, memo))
if tight:
    print('\n■ 그래도 묵상노트가 %dmm 를 못 채우는 쪽  %d편' % (MEMO_MIN, len(tight)))
    for vol, pno, r, pt, lh, memo in tight:
        print('   %d권 %3d쪽  %-18s 묵상노트 %dmm' % (vol, pno, r['title'], memo))
else:
    print('\n■ 모든 쪽이 묵상노트 %dmm 이상을 지킨다.' % MEMO_MIN)
print('\n이름: %s' % NAME)
