# -*- coding: utf-8 -*-
"""가정 축복 기도문 핸드북 — A5 세로. **한 편 = 한 쪽.**

   사용법:  python generate_blessing.py [이름]
            예)  python generate_blessing.py 김세웅

   설계는 docs/superpowers/specs/2026-09-03-blessing-handbook-design.md 참고.

   한 쪽에 담는 것은 **축복 기도문 하나뿐**이다. 성경 본문도, 따라쓰기도 넣지 않는다.
      제목 · 요절/날짜 · 축복 기도문 · **남는 자리를 채우는 박스** · 꼬리말

   ⚠️ 「말씀 따라 쓰기」를 넣어 본 적이 있다(2026-09-03). 기도문 12pt 에 인쇄 줄 +
      쓰는 줄까지 얹으니 A5 한 쪽에 104편 중 36편만 들어가 한 편을 펼침 두 쪽으로
      벌렸다가, 성경을 빼기로 하면서 되돌렸다. 다시 넣자는 말이 나오면 이 값을 볼 것.

   ⚠️ 글씨 크기는 **온 책이 한 가지**다(PRAY_PT). 쪽마다 다르면 책이 들쭉날쭉해진다.
      그 값은 **가장 긴 기도문**이 정한다. ⚠️ 손계산으로는 16pt 가 나왔지만 브라우저로
      재 보니 7쪽이 넘쳤다 — 한 마디가 목표 글자 수를 넘으면 브라우저가 한 번 더 접는데
      그것을 안 셌기 때문이다. **실측으로 14pt 가 최대**다(15pt 는 3쪽 넘침).
      크기를 바꾸려면 반드시 브라우저로 다시 재 볼 것.

   - 본문 배열은 **성경 순** 그대로. 주제는 뒤쪽 색인으로만.
   - 이름은 **인쇄한다**. 조사는 ㄹ 받침까지 맞춘다(김윤월로 · 김세웅으로).
   - 아래 박스는 **남는 만큼** 차지한다(flex:1). 편마다 높이가 다른 것이 정상이다.

   ⚠️ 1mm = 96/25.4 = 3.7795px 고정이다. 넘치는지는 짐작이 아니라 측정으로 확인한다.
"""
import json, io, re, html, os, sys

os.chdir(os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.dirname(os.getcwd())

NAME = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith('-') else '홍길동'
FOOT_MID = '오직 성경, 말씀이 답이다!'
AMEN = '예수님의 이름으로 축복하며 기도합니다. 아멘!'
PER_VOL = 52

PRAY_PT = 14.0      # 온 책이 한 가지. 가장 긴 기도문이 정한 값이다(박스 40mm 남김)
PRAY_PER = 13       # 한 줄 목표 글자 수. ⚠️ 폭에 들어가는 최대(23자)가 아니라 **일부러 짧게** 잡았다 —
                    #    짧게 끊어야 소리 내어 읽기 좋고, 아래 남는 자리도 그만큼 줄어든다.
                    #    더 짧게(14자) 하려면 글씨를 12pt 로 내려야 한다(실측).
BOX_MIN = 35        # 아래 박스가 최소 이만큼은 남아야 한다(mm)
MARK = chr(1)       # 끊을 자리 표식. ⚠️ 빈 문자열이면 split 이 터진다

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
# ── 수동 줄나눔 ───────────────────────────────────────────────
#   줄나눔.txt 가 있으면 **그 파일이 이깁니다**. 자동으로 나눈 것을 그대로 뽑아 두고
#   손으로 고쳐 쓰라는 뜻이다(--export).
#   ⚠️ 파일에는 {이름} 을 그대로 둔다. 인쇄할 때 성함으로 바뀐다 —
#      성함을 박아 두면 다른 분 책을 만들 때 그 줄나눔을 못 쓴다.
LINES_FILE = '줄나눔.txt'


def load_manual():
    if not os.path.exists(LINES_FILE):
        return {}
    out, cur = {}, None
    for raw in io.open(LINES_FILE, encoding='utf-8'):
        line = raw.rstrip()
        if not line or line.startswith('#'):
            continue
        if line.startswith('==='):
            cur = int(line.split()[1])
            out[cur] = []
        elif cur is not None:
            out[cur].append(line.strip())
    return {k: v for k, v in out.items() if v}


MANUAL = load_manual()


def export_lines(name):
    """자동으로 나눈 줄을 파일로 뽑는다. 이 파일을 고치면 그대로 인쇄된다."""
    buf = ['# 축복 기도문 줄 나눔 — 이 파일을 고치면 그대로 인쇄됩니다.',
           '#',
           '# · 여기 한 줄이 인쇄되는 한 줄입니다. 나누려면 엔터, 붙이려면 한 줄로 합치세요.',
           '# · {이름} 은 인쇄할 때 성함으로 바뀝니다. 지우지 마세요.',
           '# · 「=== 3 이삭의 축복」 줄은 건드리지 마세요(어느 편인지 표시).',
           '# · 맺음말(예수님의 이름으로 축복하며 기도합니다. 아멘!)은 자동으로 붙으니',
           '#   여기에 쓰지 않습니다.',
           '# · 글자를 지우거나 더하면 인쇄할 때 「원문과 다르다」고 알려 줍니다.',
           '# · 이 파일을 지우면 다시 자동으로 나눕니다.',
           '']
    for r in rows:
        buf.append('=== %d %s (%s)' % (r['no'], r['title'], r['ref']))
        for l in auto_lines(r['prayer']):
            buf.append(l)
        buf.append('')
    io.open(LINES_FILE, 'w', encoding='utf-8', newline='').write(chr(10).join(buf))
    print('%s — %d편을 뽑았습니다. 메모장으로 열어 고치신 뒤 다시 돌리세요.' % (LINES_FILE, len(rows)))


def auto_lines(t):
    """토큰({이름})을 그대로 둔 채 자동으로 나눈다 — 파일로 뽑을 때 쓴다."""
    return pray_lines(t, '{이름}', raw=True)


def pray_lines(t, name, no=None, raw=False):
    if no is not None and no in MANUAL:
        return [fill(l, name) for l in MANUAL[no]]      # ⚠️ 수동 파일이 이긴다
    out = []
    src = t.strip() if raw else fill(t, name).strip()
    for sent in re.split(r'(?<=[.!?])\s+', src):
        if not sent:
            continue
        s = re.sub(r'([,]|[가-힣](?:고|며|니|사|어|아|여))\s+', r'\1' + MARK, sent)
        s = re.sub(r'([가-힣][과와])\s+(?!같이|함께|같은|더불어)', r'\1' + MARK, s)
        cur = ''
        for a in [x.strip() for x in s.split(MARK) if x.strip()]:
            # ⚠️ 「하나님,」은 늘 혼자 한 줄이다 — 부르는 말이라 여기서 한 번 쉬어야 기도가 된다.
            #    길이에 맡기면 편마다 붙었다 떨어졌다 해서 책이 들쭉날쭉해 보인다.
            if not out and not cur and a in ('하나님,', '하나님'):
                out.append(a)
                continue
            j = (cur + ' ' + a) if cur else a
            if cur and len(j) > PRAY_PER:
                out.append(cur)
                cur = a
            else:
                cur = j
        if cur:
            out.append(cur)
    # 너무 짧은 토막은 이웃에 붙인다 — 한 낱말만 덩그러니 남으면 읽는 리듬이 끊긴다.
    # ⚠️ 무조건 다음 줄에 붙였더니 「주옵소서.」가 **다음 문장 첫머리와 한 줄**이 됐다.
    #    문장이 끝나는 토막은 앞 줄에 붙인다 — 마침표를 넘어가면 안 된다.
    k = len(out) - 1
    while k > 0:
        if len(out[k]) < 7:
            if out[k][-1] in '.!?' or k == len(out) - 1:
                out[k - 1] += ' ' + out.pop(k)          # 문장 끝 토막 → 앞 줄로
            elif k + 1 < len(out):
                out[k + 1] = out[k] + ' ' + out[k + 1]  # 그 밖 → 다음 줄로
                del out[k]
        k -= 1
    return out


def mark_name(line, name):
    """이름을 크게·굵게·색으로. ⚠️ escape 를 먼저 하고 태그를 넣는다."""
    return html.escape(line).replace(html.escape(name), '<b class="nm">%s</b>' % html.escape(name))


def box_mm(r, name):
    """이 편에서 아래 박스에 남는 높이(mm) — 좁아진 편을 미리 잡아내려고 잰다."""
    # ⚠️ 목표 글자 수를 넘는 마디는 브라우저가 한 번 더 접는다 — 그것까지 센다
    n = sum(max(1, -(-len(l) // PRAY_PER)) for l in pray_lines(r['prayer'], name, r['no'])) + 1
    return 168 - 19 - n * (PRAY_PT * 0.3528 * 1.75) - 13


# ── 한 편 = 한 쪽 ────────────────────────────────────────────
def foot(pno):
    return ('<div class="b-foot"><span>God is love.</span><span class="b-vis">%s</span>'
            '<span class="b-pno">%d</span></div>' % (html.escape(FOOT_MID), pno))


# 이 편만 한 단계 작게 — **브라우저 실측으로 얻은 목록**이다.
#   ⚠️ 기도문이나 줄 나누는 규칙을 고치면 이 목록이 틀어진다. 반드시 다시 재고 고칠 것.
#   ⚠️ 온 책을 가장 긴 편에 맞추면 나머지 94쪽이 다 작아진다 — 어르신이 읽으실 책이라
#      그 손해가 크다. 넘치는 열 쪽만 내린다(19번만 12pt, 나머지는 13pt).
SMALL = {3: 'p13', 5: 'p13', 19: 'p12', 27: 'p13', 32: 'p13', 36: 'p13',
         39: 'p13', 40: 'p13', 42: 'p13', 44: 'p13'}


def page(r, pno, name):
    body = ''.join('<div class="pl">%s</div>' % mark_name(l, name)
                   for l in pray_lines(r['prayer'], name, r['no']))
    return """
<section class="page bl">
  <div class="b-title">%s</div>
  <div class="b-meta"><span>%s</span><span>2026 년 &nbsp; 월 &nbsp; 일</span></div>
  <div class="b-pray %s">%s<div class="b-amen">%s</div></div>
  <div class="b-box"><span class="b-box-t">묵상노트</span></div>
  %s
</section>""" % (html.escape(r['title']), html.escape(r['ref']), SMALL.get(r['no'], ''),
                 body, html.escape(AMEN), foot(pno))


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
    <p>한 쪽에 <b>한 편</b>입니다. 가운데 <b>축복 기도문</b>을 소리 내어
       그대로 기도하시면 됩니다.</p>
    <p>기도문에는 <b>%s 님의 이름이 이미 들어가 있습니다.</b> 가족이나 이웃을 위해
       기도하실 때는 그 자리에 그분의 이름을 넣어 읽으세요.</p>
    <p>날짜 칸에 <b>그날 날짜</b>를 적어 두시면 언제 이 기도를 드렸는지 남습니다.
       한 편을 여러 번 기도하셔도 좋습니다.</p>
    <p>아래 <b>묵상노트</b>에는 그날 받은 마음을 자유롭게 적어 보세요.
       한 해가 지나 다시 펼치면 그것이 응답의 기록이 됩니다.</p>
    <p>순서는 <b>성경 차례 그대로</b>입니다. 앞에서부터 차례로 하셔도 좋고,
       뒤쪽 <b>「주제로 찾기」</b>에서 오늘 필요한 것을 골라 펴셔도 좋습니다.</p>
    <p>이 책은 <b>%d편</b>입니다. 하루 한 편이면 %d주가 채워집니다.</p>
  </div>
  %s
</section>""" % (html.escape(name), n, -(-n // 7), foot(3))


def toc(items, base):
    """차례는 두 쪽. ⚠️ 한 쪽에 52편을 밀어 넣으면 넘친다(2권 36mm) — 글씨를 줄여
       맞출 수도 있었지만 차례는 찾아보는 곳이라 작아지면 쓸모가 준다."""
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
/* ── 본문 한 쪽 — 축복 기도문 하나뿐이다 ────────────────────── */
.b-title { font-family:"Nanum Myeongjo",serif; font-size:19pt; font-weight:800; text-align:center; }
.b-meta { display:flex; justify-content:space-between; font-size:11pt; color:#3a4353;
          margin:3.5mm 0 0; padding-bottom:1.5mm; border-bottom:1px solid #2b3444; }
/* 기도문 — 이 책의 전부다. 온 책이 한 크기(16pt)로 통일된다.
   ⚠️ 줄 간격을 em 으로 준다 — 맨 숫자로 주면 이름(.nm)이 커질 때 그 줄만 벌어진다.
      em 은 여기서 px 로 계산돼 자식이 그 길이를 그대로 물려받는다. */
.b-pray { font-size:14pt; line-height:1.95em; text-align:center; word-break:keep-all;
          padding:7mm 2mm 6mm; }
.pl { }
/* 넘치는 몇 쪽만 한 단계 작게. ⚠️ 온 책을 가장 긴 편에 맞추면 나머지 100쪽이 다 작아진다 —
   어르신이 읽으실 책이라 그 손해가 크다. */
.b-pray.p13 { font-size:13pt; }
.b-pray.p12 { font-size:12pt; }
.b-amen { margin-top:4mm; font-weight:700; }
/* 이름 — 크게·굵게·색. 흑백으로 찍어도 진하게 남는 금갈색이다. */
.nm { font-size:1.12em; font-weight:800; color:#8a6a1e; }
/* 아래 박스 — 남는 자리를 그대로 차지한다. 편마다 높이가 다른 것이 정상이다. */
.b-box { flex:1; min-height:18mm; border:1px solid #2b3444; padding:2.5mm 3mm; position:relative; }
.b-box-t { position:absolute; right:3.5mm; top:2mm; font-size:9pt; color:#6b7383; }
/* ── 꼬리말 ───────────────────────────────────────────────── */
.b-foot { position:absolute; left:13mm; right:13mm; bottom:6mm; display:flex; align-items:baseline;
          justify-content:space-between; border-top:1px solid #2b3444; padding-top:1.5mm; }
.b-foot > span:first-child { font-size:10.5pt; font-weight:600; }
.b-vis { font-size:9.5pt; color:#3a4353; font-weight:600; }
.b-pno { font-size:10.5pt; font-weight:700; }
/* ── 표지 ─────────────────────────────────────────────────── */
.c { background:#12294f; color:#fff; align-items:center; justify-content:center; text-align:center; }
.c-in { padding:0 6mm; }
.c-logo { width:20mm; margin-bottom:4mm; }
.c-church { font-size:10pt; letter-spacing:2px; opacity:.85; }
.c-t { font-family:"Nanum Myeongjo",serif; font-size:32pt; font-weight:800; line-height:1.3; margin:4mm 0 0; }
.c-line { width:22mm; height:1.2mm; background:#c8a24b; margin:5mm auto; }
.c-vol { font-size:10.5pt; opacity:.9; }
.c-name { margin-top:9mm; font-family:"Nanum Myeongjo",serif; font-size:17pt; font-weight:700; color:#e8c877; }
.c-v { margin-top:12mm; font-size:9.5pt; line-height:1.8; opacity:.85; }
.c-v b { color:#e8c877; }
/* ── 부속 ─────────────────────────────────────────────────── */
.ph { font-family:"Nanum Myeongjo",serif; font-size:17pt; font-weight:800; margin:0 0 5mm;
      padding-bottom:2mm; border-bottom:1.2px solid #2b3444; }
.ph-s { font-size:9.5pt; font-weight:400; color:#6b7383; margin-left:2mm; }
.pbody p { font-size:11pt; line-height:1.85; margin:0 0 4mm; word-break:keep-all; }
.toc { display:flex; gap:6mm; flex:1; }
.toc > div { flex:1; }
.tb { font-size:9pt; font-weight:800; color:#c8a24b; margin:2.5mm 0 1mm; }
.tc { display:flex; font-size:9.5pt; line-height:1.75; }
.tr { flex:1; word-break:keep-all; }
.tp { color:#6b7383; padding-left:2mm; }
.ix { display:flex; font-size:10pt; line-height:1.7; padding:1.8mm 0; border-bottom:.5px dotted #c9cfd9; }
.ix-g { width:34mm; font-weight:700; flex:none; }
.ix-p { flex:1; color:#3a4353; }
.ix-note { font-size:9.5pt; color:#4a5364; margin-bottom:3mm; }
.ix-end { margin-top:auto; text-align:center; font-size:10pt; line-height:1.8; color:#3a4353; }
.ix-end b { color:#12294f; }
"""


def build(vol, items, name):
    base = 6                      # 1 표지 · 2 여백 · 3 사용법 · 4~5 차례 · 6~ 본문
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


if '--export' in sys.argv:
    export_lines(NAME)
    sys.exit(0)

# --sample N : 앞에서 N편만, 표지·차례 없이 한 파일로. 인쇄해 손에 쥐어 보는 용도.
if '--sample' in sys.argv:
    k = int(sys.argv[sys.argv.index('--sample') + 1])
    body = ''.join(page(r, 1 + i, NAME) for i, r in enumerate(rows[:k]))
    out = ('<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">'
           '<link href="https://fonts.googleapis.com/css2?family=Nanum+Myeongjo:wght@400;700;800'
           '&family=Noto+Sans+KR:wght@300;400;500;700;800&display=swap" rel="stylesheet">'
           '<style>%s</style></head><body>%s</body></html>' % (CSS, body))
    io.open('축복기도문_견본.html', 'w', encoding='utf-8', newline='').write(out)
    print('축복기도문_견본.html — %d장 (%.0fpt · 한 줄 %d자)' % (k, PRAY_PT, PRAY_PER))
    for r in rows[:k]:
        print('   %d번 %-16s 기도문 %2d줄 · 아래 박스 %2.0fmm'
              % (r['no'], r['title'], len(pray_lines(r['prayer'], NAME, r['no'])) + 1, box_mm(r, NAME)))
    sys.exit(0)

# ⚠️ 손으로 고치다 글자를 지우거나 더할 수 있다. 붙여 되돌려 원문과 대조한다 —
#    조용히 인쇄되면 성도님이 틀린 기도문을 읽으시게 된다.
if MANUAL:
    bad = []
    for r in rows:
        if r['no'] not in MANUAL:
            continue
        got = ''.join(MANUAL[r['no']]).replace(' ', '')
        want = r['prayer'].replace(' ', '')
        if got != want:
            bad.append(r)
    print('줄나눔.txt 를 씁니다 — %d편이 손으로 고친 것입니다.' % len(MANUAL))
    if bad:
        print('')
        print('!! 원문과 다른 편이 있습니다 — 글자가 지워졌거나 더해졌습니다:')
        for r in bad:
            print('   %d번 %s' % (r['no'], r['title']))
        print('   그 편은 파일 내용 그대로 인쇄됩니다. 확인해 주세요.')
    print('')

vols = [rows[i:i + PER_VOL] for i in range(0, len(rows), PER_VOL)]
for n, items in enumerate(vols, 1):
    f, cnt = build(n, items, NAME)
    print('%s  —  %d편 · %d쪽' % (f, len(items), cnt))

boxes = sorted((box_mm(r, NAME), r['no'], r['title']) for r in rows)
print('')
print('■ 기도문 %.0fpt 한 가지로 온 책 통일 · 아래 박스는 남는 만큼' % PRAY_PT)
print('   가장 좁은 박스  %2.0fmm   %d번 %s' % (boxes[0][0], boxes[0][1], boxes[0][2]))
print('   가장 넓은 박스  %2.0fmm   %d번 %s' % (boxes[-1][0], boxes[-1][1], boxes[-1][2]))
tight = [b for b in boxes if b[0] < BOX_MIN]
print('   박스가 %dmm 미만인 편   %s' % (BOX_MIN, [b[1] for b in tight] or '없음'))
print('')
print('이름: %s' % NAME)
