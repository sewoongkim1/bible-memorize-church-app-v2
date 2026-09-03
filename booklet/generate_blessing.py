# -*- coding: utf-8 -*-
"""가정 축복 기도문 핸드북 — A5 세로. **한 편 = 펼침 두 쪽.**

   사용법:  python generate_blessing.py [이름]
            예)  python generate_blessing.py 김세웅

   설계는 docs/superpowers/specs/2026-09-03-blessing-handbook-design.md 참고.

   ⚠️ 왜 한 쪽이 아니라 두 쪽인가 — 실측 때문이다.
      「기도문 12pt + 말씀 따라쓰기(인쇄 줄 + 쓰는 줄)」를 A5 **한 쪽**에 넣으면
      104편 중 61편만 들어간다(말씀을 10pt 로 줄이고 묵상노트를 빼도 83편).
      말씀을 자를 수도, 기도문을 줄일 수도 없으니 쪽을 하나 더 쓰는 것이 답이다.
      샘플이 한 쪽에 다 담긴 것은 그 샘플이 **A4** 이기 때문이다(면적이 두 배).

   한 편의 펼침:
      왼쪽(짝수쪽)  제목 · 요절/날짜 · 축복 기도문 · 묵상노트
      오른쪽(홀수쪽) 말씀 따라 쓰기 — 한 줄 인쇄하고 그 아래 한 줄 비운다

   - 본문 배열은 **성경 순** 그대로. 주제는 뒤쪽 색인으로만.
   - 이름은 **인쇄한다**. 조사는 ㄹ 받침까지 맞춘다(김윤월로 · 김세웅으로).
   - 기도문은 **줄이지 않는다**(12pt 고정). 자리가 모자라면 **말씀만** 줄인다.
   - 글씨는 **12pt 이상**이 기본이다. 말씀만, 그것도 아주 긴 편에서만 10pt 까지 내려간다.

   ⚠️ 1mm = 96/25.4 = 3.7795px 고정이다. 넘치는지는 짐작이 아니라 측정으로 확인한다.
"""
import json, io, re, html, os, sys

os.chdir(os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.dirname(os.getcwd())

NAME = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith('-') else '홍길동'
FOOT_MID = '오직 말씀, 성경이 답이다!'
AMEN = '예수님의 이름으로 축복하며 기도합니다. 아멘!'
PER_VOL = 52

rows = sorted(json.load(io.open(os.path.join(ROOT, 'blessings.json'), encoding='utf-8')),
              key=lambda r: r['no'])

LOGO = ''
_lg = os.path.join(ROOT, 'marketing', 'logo-data-uri.txt')
if os.path.exists(_lg):
    LOGO = io.open(_lg, encoding='utf-8').read().strip()


# ── 이름과 조사 ───────────────────────────────────────────────
# 받침이 없거나 ㄹ 이면 「로」다. 오연화로 · 김윤월로(ㄹ) · 김세웅으로(ㅇ).
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


# ── 기도문을 읽기 좋게 줄로 나눈다 ─────────────────────────────
#   ⚠️ 앱에서는 마디로 끊지 않았다(폰마다 폭이 달라 줄이 들쭉날쭉해서다).
#      **종이는 폭이 고정이라 그 문제가 없다** — 여기서는 마디로 끊는 것이 옳다.
#   ⚠️ 「~게 하시고」의 「게」에서는 끊지 않는다(한 덩이가 쪼개진다).
#   ⚠️ 「~과/와」 뒤에 「같이·함께·같은·더불어」가 오면 끊지 않는다.
PRAY_PER = 26          # 한 줄 목표 글자 수(12pt · 상자 안쪽 폭 기준)


def pray_lines(t, name):
    out = []
    for sent in re.split(r'(?<=[.!?])\s+', fill(t, name).strip()):
        if not sent:
            continue
        s = re.sub(r'([,]|[시하으어아]고|[시하으]며|[하시]사|[오사]니|하여|시어)\s+', r'\1', sent)
        s = re.sub(r'([가-힣][과와])\s+(?!같이|함께|같은|더불어)', r'\1', s)
        atoms = [a for a in s.split('') if a]
        cur = ''
        for a in atoms:
            j = (cur + ' ' + a) if cur else a
            if cur and len(j) > PRAY_PER:
                out.append(cur)
                cur = a
            else:
                cur = j
        if cur:
            out.append(cur)
    # 너무 짧은 토막은 이웃에 붙인다 — 한 낱말만 덩그러니 남으면 읽는 리듬이 끊긴다
    for k in range(len(out) - 2, -1, -1):
        if len(out[k]) < 8:
            out[k + 1] = out[k] + ' ' + out[k + 1]
            del out[k]
    if len(out) > 1 and len(out[-1]) < 8:
        out[-2] += ' ' + out.pop()
    out.append(AMEN)
    return out


def mark_name(line, name):
    """이름을 크게·굵게·색으로. ⚠️ escape 를 먼저 하고 태그를 넣는다."""
    return html.escape(line).replace(html.escape(name), '<b class="nm">%s</b>' % html.escape(name))


# ── 말씀을 따라쓰기 줄로 나눈다 ────────────────────────────────
#   한 줄 인쇄하고 그 **아래 한 줄을 비운다**. 어절(띄어쓰기)에서만 끊는다.
def copy_lines(verse, per):
    out, cur = [], ''
    for w in verse.split():
        j = (cur + ' ' + w) if cur else w
        if cur and len(j) > per:
            out.append(cur)
            cur = w
        else:
            cur = j
    if cur:
        out.append(cur)
    return out


# ── 말씀 크기 — 오른쪽 쪽이 넘치면 이것만 줄인다 ─────────────────
#   ⚠️ 기도문은 건드리지 않는다. 12pt 를 지키고, 아주 긴 편만 11 → 10pt.
V_STEPS = [                     # (클래스, pt, 한 줄 글자 수, 인쇄 줄 mm, 쓰는 줄 mm)
    ('',       12, 25, 6.5, 8.5),
    ('v-s',    11, 27, 6.0, 8.0),
    ('v-xs',   10, 30, 5.5, 7.5),
    ('v-xxs',  10, 30, 5.0, 6.0),   # 아주 긴 한두 편만 — 쓰는 줄이 좁아진다
]
COPY_AVAIL = 168 - 12  # 오른쪽 쪽에서 쓸 수 있는 높이(작은 제목 자리를 뺀다)


def copy_plan(r):
    for cls, pt, per, th, wh in V_STEPS:
        n = len(copy_lines(r['verse'], per))
        if n * (th + wh) <= COPY_AVAIL:
            return cls, pt, per, n
    cls, pt, per, th, wh = V_STEPS[-1]
    return cls, pt, per, len(copy_lines(r['verse'], per))


# ── 한 편 = 펼침 두 쪽 ────────────────────────────────────────
def foot(pno):
    return ('<div class="b-foot"><span>God is love.</span><span class="b-vis">%s</span>'
            '<span class="b-pno">%d</span></div>' % (html.escape(FOOT_MID), pno))


def page_left(r, pno, name):
    body = ''.join('<div class="pl">%s</div>' % mark_name(l, name)
                   for l in pray_lines(r['prayer'], name)[:-1])
    return """
<section class="page bl">
  <div class="b-title">%s</div>
  <div class="b-meta"><span>%s</span><span>2026 년 &nbsp; 월 &nbsp; 일</span></div>
  <div class="b-note-x">※ 축복 기도문에 자신의 삶과 가족, 친구들을 위해 이름을 넣어 기도합니다.</div>
  <div class="b-pray">%s<div class="b-amen">%s</div></div>
  <div class="b-memo"><span class="b-memo-t">묵상노트</span></div>
  %s
</section>""" % (html.escape(r['title']), html.escape(r['ref']), body, html.escape(AMEN), foot(pno))


def page_right(r, pno):
    cls, _pt, per, _n = copy_plan(r)
    rows_html = ''.join('<div class="cp"><div class="cp-t">%s</div><div class="cp-w"></div></div>'
                        % html.escape(l) for l in copy_lines(r['verse'], per))
    return """
<section class="page bl">
  <div class="b-copyhead"><span>말씀 따라 쓰기</span><span class="b-copyref">%s</span></div>
  <div class="b-copy %s">%s</div>
  %s
</section>""" % (html.escape(r['ref']), cls, rows_html, foot(pno))


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
    <p>한 편이 <b>펼침 두 쪽</b>입니다. <b>왼쪽</b>에서 축복 기도문을 소리 내어 기도하고,
       <b>오른쪽</b>에 그 말씀을 손으로 따라 쓰시면 됩니다.</p>
    <p>기도문에는 <b>%s 님의 이름이 이미 들어가 있습니다.</b> 가족이나 이웃을 위해
       기도하실 때는 그 자리에 그분의 이름을 넣어 읽으세요.</p>
    <p>따라 쓰기는 <b>한 줄 읽고 그 아래 줄에 옮겨 적는</b> 방식입니다.
       하루 한 편이면 충분합니다. 다 못 쓰셔도 괜찮습니다.</p>
    <p>날짜 칸에 <b>그날 날짜</b>를 적어 두시면 언제 이 말씀으로 기도했는지 남습니다.
       <b>묵상노트</b>에는 그날 받은 마음을 자유롭게 적어 보세요.</p>
    <p>순서는 <b>성경 차례 그대로</b>입니다. 앞에서부터 차례로 하셔도 좋고,
       뒤쪽 <b>「주제로 찾기」</b>에서 오늘 필요한 것을 골라 펴셔도 좋습니다.</p>
    <p>이 책은 <b>%d편</b>입니다. 하루 한 편이면 %d주가 채워집니다.</p>
  </div>
  %s
</section>""" % (html.escape(name), n, -(-n // 7), foot(3))


def toc(items, base):
    """차례는 두 쪽. 쪽 번호는 왼쪽(기도문) 쪽을 가리킨다."""
    pairs = [(r, base + i * 2) for i, r in enumerate(items)]
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
        right, _ = col(part[q:], cur)      # 단이 바뀔 때 같은 책 이름을 다시 쓰지 않는다
        return """
<section class="page plain">
  <h2 class="ph">차례 <span class="ph-s">성경 순%s</span></h2>
  <div class="toc"><div>%s</div><div>%s</div></div>
  %s
</section>""" % (more, left, right, foot(pno))

    return sheet(pairs[:half], 4, '') + sheet(pairs[half:], 5, ' · 이어서')


def index_by_group(items, base, last_pno):
    g = {}
    for i, r in enumerate(items):
        g.setdefault(r['group'], []).append(base + i * 2)
    body = ''.join('<div class="ix"><span class="ix-g">%s</span><span class="ix-p">%s</span></div>'
                   % (html.escape(k), ', '.join(str(x) for x in v))
                   for k, v in sorted(g.items(), key=lambda kv: -len(kv[1])))
    return """
<section class="page plain">
  <h2 class="ph">주제로 찾기</h2>
  <div class="ix-note">오늘 필요한 기도를 주제로 골라 펴 보세요. 숫자는 쪽 번호입니다.</div>
  %s
  <div class="ix-end">여호와는 그 얼굴을 네게로 향하여 드사 평강 주시기를 원하노라<br><b>민수기 6장 26절</b></div>
  %s
</section>""" % (body, foot(last_pno))


CSS = """
@page { size:148mm 210mm; margin:0; }
* { box-sizing:border-box; }
body { margin:0; font-family:"Noto Sans KR","Malgun Gothic",sans-serif; color:#1c2333;
       -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.page { width:148mm; height:210mm; padding:13mm 13mm 11mm; background:#fff;
        position:relative; overflow:hidden; page-break-after:always;
        display:flex; flex-direction:column; }
.page:last-child { page-break-after:auto; }
/* ── 왼쪽: 제목 · 기도문 · 묵상노트 ─────────────────────────── */
.b-title { font-family:"Nanum Myeongjo",serif; font-size:16pt; font-weight:800; text-align:center; }
.b-meta { display:flex; justify-content:space-between; font-size:10pt; color:#3a4353;
          margin:3mm 0 2.5mm; padding-bottom:1.2mm; border-bottom:.8px solid #2b3444; }
.b-note-x { font-size:8.5pt; color:#4a5364; text-align:center; margin:0 0 2.5mm; }
/* 기도문 — 이 책의 주인공이라 **줄이지 않는다**. 12pt 고정.
   ⚠️ 줄 간격을 em 으로 준다 — 맨 숫자로 주면 이름(.nm)이 커질 때 그 줄만 벌어진다.
      em 은 여기서 px 로 계산돼 자식이 그 길이를 그대로 물려받는다. */
.b-pray { border:.8px solid #2b3444; padding:4mm 4.5mm; text-align:center;
          font-size:12pt; line-height:1.75em; word-break:keep-all; }
.pl { }
.b-amen { margin-top:2mm; font-weight:700; }
/* 이름 — 크게·굵게·색. 흑백으로 찍어도 진하게 남는 금갈색이다. */
.nm { font-size:1.15em; font-weight:800; color:#8a6a1e; }
.b-memo { flex:1; min-height:16mm; border:.8px solid #2b3444; border-top:none;
          padding:2mm 3mm; position:relative; }
.b-memo-t { position:absolute; right:3mm; top:1.6mm; font-size:8.5pt; color:#6b7383; }
/* ── 오른쪽: 말씀 따라 쓰기 ────────────────────────────────── */
.b-copyhead { display:flex; justify-content:space-between; align-items:baseline;
              font-family:"Nanum Myeongjo",serif; font-size:12pt; font-weight:800;
              padding-bottom:1.5mm; border-bottom:.8px solid #2b3444; margin-bottom:3mm; }
.b-copyref { font-family:"Noto Sans KR",sans-serif; font-size:9.5pt; font-weight:500; color:#3a4353; }
/* 한 벌 = 인쇄 줄 + 쓰는 줄. ⚠️ 두 줄의 높이를 더한 값이 곧 한 벌 높이(15mm)다 —
   하나만 고치면 아래 계산(COPY_ROW)과 어긋나 넘친다. */
.cp { }
.cp-t { font-family:"Nanum Myeongjo",serif; font-size:12pt; line-height:6.5mm;
        letter-spacing:.35mm; word-spacing:.6mm; color:#1c2333; white-space:nowrap; }
.cp-w { height:8.5mm; border-bottom:.6px solid #b9c0cc; }
/* ⚠️ 글씨를 줄일 때는 **줄 높이도 함께** 줄인다. 한 벌 높이(인쇄+쓰는)가 곧 위 계산이라
   하나만 고치면 쪽이 넘친다. */
.b-copy.v-s   .cp-t { font-size:11pt; line-height:6mm; }
.b-copy.v-s   .cp-w { height:8mm; }
.b-copy.v-xs  .cp-t { font-size:10pt; line-height:5.5mm; }
.b-copy.v-xs  .cp-w { height:7.5mm; }
.b-copy.v-xxs .cp-t { font-size:10pt; line-height:5mm; }
.b-copy.v-xxs .cp-w { height:6mm; }
/* ── 꼬리말 ───────────────────────────────────────────────── */
.b-foot { position:absolute; left:13mm; right:13mm; bottom:6mm; display:flex; align-items:baseline;
          justify-content:space-between; border-top:.8px solid #2b3444; padding-top:1.5mm; }
.b-foot > span:first-child { font-size:10pt; font-weight:600; }
.b-vis { font-size:9pt; color:#3a4353; font-weight:600; }
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
.pbody p { font-size:10.5pt; line-height:1.85; margin:0 0 3.5mm; word-break:keep-all; }
.toc { display:flex; gap:6mm; flex:1; }
.toc > div { flex:1; }
.tb { font-size:8.6pt; font-weight:800; color:#c8a24b; margin:2.5mm 0 1mm; }
.tc { display:flex; font-size:9pt; line-height:1.75; }
.tr { flex:1; word-break:keep-all; }
.tp { color:#6b7383; padding-left:2mm; }
.ix { display:flex; font-size:9.5pt; line-height:1.7; padding:1.6mm 0; border-bottom:.5px dotted #c9cfd9; }
.ix-g { width:32mm; font-weight:700; flex:none; }
.ix-p { flex:1; color:#3a4353; }
.ix-note { font-size:9pt; color:#4a5364; margin-bottom:3mm; }
.ix-end { margin-top:auto; text-align:center; font-size:9.5pt; line-height:1.8; color:#3a4353; }
.ix-end b { color:#12294f; }
"""


def build(vol, items, name):
    base = 6                      # 1 표지 · 2 여백 · 3 사용법 · 4~5 차례 · 6~ 본문(한 편 두 쪽)
    pages = [cover(vol, name, items[0], items[-1]), intro(name, len(items)), toc(items, base)]
    for i, r in enumerate(items):
        pages.append(page_left(r, base + i * 2, name))
        pages.append(page_right(r, base + i * 2 + 1))
    pages.append(index_by_group(items, base, base + len(items) * 2))
    out = ('<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">'
           '<link href="https://fonts.googleapis.com/css2?family=Nanum+Myeongjo:wght@400;700;800'
           '&family=Noto+Sans+KR:wght@300;400;500;700;800&display=swap" rel="stylesheet">'
           '<style>%s</style></head><body>%s</body></html>' % (CSS, ''.join(pages)))
    f = '축복기도문_%d권.html' % vol
    io.open(f, 'w', encoding='utf-8', newline='').write(out)
    return f, out.count('class="page')


vols = [rows[i:i + PER_VOL] for i in range(0, len(rows), PER_VOL)]
small = []
for n, items in enumerate(vols, 1):
    f, cnt = build(n, items, NAME)
    print('%s  —  %d편 · %d쪽' % (f, len(items), cnt))
    for i, r in enumerate(items):
        cls, pt, per, lines = copy_plan(r)
        if cls:
            small.append((n, 6 + i * 2 + 1, r, pt, lines))

print('\n■ 따라쓰기 줄이 많아 말씀 글씨를 줄인 쪽  %d편 / 104' % len(small))
for vol, pno, r, pt, lines in small:
    print('   %d권 %3d쪽  %-18s %-14s %3d자 · %2d줄 → %dpt'
          % (vol, pno, r['title'], short(r['ref']), len(r['verse']), lines, pt))
if not small:
    print('   없음 — 모두 12pt')
print('\n기도문은 104편 모두 12pt 그대로. 이름: %s' % NAME)
