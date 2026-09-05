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

   사용법 (2026-09-04 더한 것):
     --theme gold|teal|plum   장식 **색**만 바꾼다(서체와 별개). 안 주면 gold(기존).
     --font  web|pc           **서체**를 바꾼다. web=웹폰트(기본, 어디서나 같음) ·
                              pc=이 PC 서체(본문 둥근미소 · 제목 프리젠테이션 8 · 머리꼬리 7).
     --size  a5|a4            a4 는 어르신 큰글씨판 — 한 쪽에 한 편, 판·글씨를 √2배로.
     --1vol                   104편을 한 권으로(기본은 52편씩 두 권).
     --2up                    (a5 전용) 인쇄용 — A4 가로 한 장에 소책자 두 쪽을 나란히.
     예)  python generate_blessing.py 김세웅 --theme teal --font pc --size a4
"""
import json, io, re, html, os, sys

os.chdir(os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.dirname(os.getcwd())

NAME = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith('-') else '홍길동'
# 꼬리말 가운데 — 아론의 축도 맺음 절(민 6:26). 표지는 24절로 연다.
#   ⚠️ 길면 좌우(God is love. · 쪽번호)와 부딪힌다 — 바꿀 때는 반드시 꼬리말 폭을
#      다시 재 볼 것(A5 가 더 좁으니 A5 로 잰다).
FOOT_MID = '여호와는 그 얼굴을 네게로 향하여 드사 평강 주시기를 원하노라'
AMEN = '예수님의 이름으로 축복하며 기도합니다. 아멘!'
ONE_VOL = '--1vol' in sys.argv
PER_VOL = 999 if ONE_VOL else 52   # --1vol: 104편 한 권 / 기본: 52편씩 두 권


def arg_val(flag, default):
    if flag in sys.argv:
        i = sys.argv.index(flag)
        if i + 1 < len(sys.argv) and not sys.argv[i + 1].startswith('--'):
            return sys.argv[i + 1]
    return default

TITLE_SUFFIX = arg_val('--title', '집사님')   # 표지·사용법에 붙는 호칭 (예: --title 안수집사님)

# ── 테마 — 색(과 서체)을 바꿔 「사용자마다 다른 느낌」을 낼 수 있게 한다 ──────────
#   ⚠️ 여기 없는 것(본문 글자색·테두리·회색 라벨)은 **테마와 무관하게 고정**이다.
#      가독성은 취향보다 먼저다 — 장식(❖·이름·표지·차례 소제목)만 테마를 탄다.
THEMES = {
    'gold': {'label': '금색·남색(기본)', 'accent': '#c8a24b', 'accent_ink': '#8a6a1e',
             'accent_light': '#e8c877', 'deep': '#12294f', 'cover_fill': False},
    'teal': {'label': '청록', 'accent': '#3f8f7b', 'accent_ink': '#2b6152',
             'accent_light': '#8fd6b8', 'deep': '#0f3d33'},
    'plum': {'label': '자두빛', 'accent': '#a24a63', 'accent_ink': '#7a3245',
             'accent_light': '#e3aebb', 'deep': '#3a1420'},
    # ⚠️ 흑백 — 표지 바탕을 **채우지 않는다**(cover_fill False). 짙은 남색을 흑백으로 찍으면
    #    A5 한 면이 통째로 검게 나와 잉크를 다 먹고, 복사기로는 글자가 뭉갠다.
    #    장식(❖·이름)도 회색으로 내려 흑백에서 서로 구분되게 한다.
    'bw': {'label': '흑백(복사·잉크 절약)', 'accent': '#767676', 'accent_ink': '#3c3c3c',
           'accent_light': '#3c3c3c', 'deep': '#1c2333', 'cover_fill': False},
}
THEME_NAME = arg_val('--theme', 'gold')
if THEME_NAME not in THEMES:
    raise SystemExit('!! --theme 은 %s 중 하나여야 합니다(받은 값: %s)' % (', '.join(THEMES), THEME_NAME))
THEME = THEMES[THEME_NAME]

# ── 서체 — 색과 **따로** 고른다(--font). 셋으로 나눠 쓴다: 본문 · 제목 · 머리꼬리 ───────
#   ⚠️ `pc` 는 **이 컴퓨터에 깔린 서체**를 이름으로 부른다 — 웹에서 받아오지 않는다.
#      그래서 이 HTML 은 그 서체가 깔린 PC 에서만 제대로 보인다(**PDF 로 저장하면
#      서체가 박히므로 그 PDF 는 어디서나 똑같이 보인다** — 인쇄물은 그렇게 넘긴다).
#   ⚠️ 이름은 **패밀리 이름**이라야 한다. 「학교안심 둥근미소 TTF R」·「프리젠테이션 8
#      ExtraBold」 같은 파일/한글 이름으로는 크롬이 못 알아듣고 조용히 다른 서체로
#      바꿔 버린다(2026-09-04 실측으로 확인). R/B 는 굵기(font-weight)로 고른다.
FONTS = {
    'web': {'label': '웹폰트(어디서나 같게 보임)',
            'body': '"Binggrae","Noto Sans KR","Malgun Gothic",sans-serif',
            'title': '"Paperlogy 6 SemiBold","Nanum Myeongjo",serif',
            'head': '"Noto Sans KR","Malgun Gothic",sans-serif',
            'foot': '"Noto Sans KR","Malgun Gothic",sans-serif',
            'body_weight': '400', 'title_weight': 'normal', 'head_weight': '700',
            'foot_weight': '600',
            # ⚠️ 본고딕은 폭이 넓다 — 여기서 11.5/10.5 로 키우면 A5 꼬리말 좌우가 붙는다(실측).
            'foot_pt': '10.5', 'foot_mid_pt': '8', 'web': True},
    'pc': {'label': '이 PC 서체(둥근미소 · 프리젠테이션)',
           'body': '"Hakgyoansim Dunggeunmiso TTF","Noto Sans KR",sans-serif',
           'title': '"Paperlogy 6 SemiBold","Nanum Myeongjo",serif',
           'head': '"Freesentation 7","Noto Sans KR",sans-serif',
           # 꼬리말 — 프리젠테이션 4 Regular. 머리글(7 Bold)과 같은 집안의 가벼운 굵기다.
           # ⚠️ 케리스 케듀체(KERIS KEDU)를 썼다가 뺐다(2026-09-04) — 굵기가 한 벌뿐인
           #    둥근 교육용 서체라 작은 꼬리말에서 획이 뭉쳐 겹쳐 보였다. 가짜 굵기가
           #    아니라 서체 본래 굵기였어서, 굵기를 낮추는 것으로는 해결되지 않았다.
           'foot': '"Freesentation 4","Noto Sans KR",sans-serif',
           # ⚠️ 프리젠테이션 7·8 · 케듀체는 굵기가 이름에 박힌 한 벌짜리다 — 여기에 bold 를 더
           #    걸면 브라우저가 억지로 굵게 그려(가짜 굵기) 획이 뭉갠다. normal 로 못박는다.
           'body_weight': '400', 'title_weight': 'normal', 'head_weight': 'normal',
           'foot_weight': 'normal',
           # 프리젠테이션은 좁아 한 단계 키워도 A5 에서 좌우 10mm 가 남는다(실측).
           'foot_pt': '11.5', 'foot_mid_pt': '9', 'web': False},
}
FONT_NAME = arg_val('--font', 'web')
if FONT_NAME not in FONTS:
    raise SystemExit('!! --font 는 %s 중 하나여야 합니다(받은 값: %s)' % (', '.join(FONTS), FONT_NAME))
FONT = FONTS[FONT_NAME]

# 제목 자간 — 제목(기도문 제목·부속 쪽 제목·표지)에 함께 걸린다.
#   ⚠️ 너무 벌리면 낱글자가 흩어져 되레 안 읽힌다. 0.03~0.06em 안에서 고를 것.
#   ⚠️ 표지 제목은 한 줄에 들어가야 한다 — 늘린 뒤 반드시 폭을 다시 잴 것.
TITLE_TRACK = '0.048em'

# ── 판형 — a5(기본, 소책자) · a4(어르신 큰글씨판, 한 쪽에 한 편) ─────────────────
SIZE_NAME = arg_val('--size', 'a5')
if SIZE_NAME not in ('a5', 'a4'):
    raise SystemExit('!! --size 는 a5 또는 a4 여야 합니다(받은 값: %s)' % SIZE_NAME)
TWOUP = '--2up' in sys.argv

# ── 여러 사람 몫을 한 번에 (--list 명단.txt) · PDF 로 굽기 (--pdf) ─────────────
#   ⚠️ 명단으로 돌릴 때는 **파일 이름에 성함을 넣는다** — 안 그러면 다음 사람이
#      앞사람 파일을 덮어써 버린다(한 사람 몫만 돌릴 때는 예전 이름 그대로 둔다).
OUT_DIR = arg_val('--out', '.')
LIST_FILE = arg_val('--list', '')
MAKE_PDF = '--pdf' in sys.argv

# 크롬을 찾는다 — PDF 로 구울 때만 쓴다. 못 찾으면 그때 알려 준다(HTML 은 정상적으로 나온다).
CHROME_CANDS = [
    r'C:\Program Files\Google\Chrome\Application\chrome.exe',
    r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
    os.path.join(os.environ.get('LOCALAPPDATA', ''), r'Google\Chrome\Application\chrome.exe'),
    r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
]


def find_chrome():
    for c in CHROME_CANDS:
        if c and os.path.exists(c):
            return c
    return None


def to_pdf(html_path, pdf_path):
    """브라우저를 조용히 돌려 PDF 로 굽는다. 서체는 PDF 안에 박히므로 어디서나 같게 보인다."""
    import subprocess
    chrome = find_chrome()
    if not chrome:
        print('   !! 크롬을 못 찾아 PDF 는 건너뜁니다 — HTML 을 열어 직접 인쇄하세요.')
        return False
    r = subprocess.run([chrome, '--headless', '--disable-gpu', '--no-pdf-header-footer',
                        '--print-to-pdf=' + os.path.abspath(pdf_path),
                        '--virtual-time-budget=30000',
                        'file:///' + os.path.abspath(html_path).replace(os.sep, '/')],
                       capture_output=True)
    return os.path.exists(pdf_path)

PRAY_PT = 14.0      # 온 책이 한 가지. 가장 긴 기도문이 정한 값이다(박스 40mm 남김)
PRAY_PER = 13       # 한 줄 목표 글자 수. ⚠️ 폭에 들어가는 최대(23자)가 아니라 **일부러 짧게** 잡았다 —
                    #    짧게 끊어야 소리 내어 읽기 좋고, 아래 남는 자리도 그만큼 줄어든다.
                    #    더 짧게(14자) 하려면 글씨를 12pt 로 내려야 한다(실측).
BOX_MIN = 35        # 아래 박스가 최소 이만큼은 남아야 한다(mm)
MARK = chr(1)       # 끊을 자리 표식. ⚠️ 빈 문자열이면 split 이 터진다

rows = sorted(json.load(io.open(os.path.join(ROOT, 'blessings.json'), encoding='utf-8')),
              key=lambda r: r['no'])

LOGO = ''
_lg = os.path.join(ROOT, 'marketing', 'logo-mark-data-uri.txt')
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
#   ⚠️ 온 책을 가장 긴 편에 맞추면 나머지 103쪽이 다 작아진다 — 어르신이 읽으실 책이라
#      그 손해가 크다. 넘치는 쪽만 내린다.
#   2026-09-04: 열 편이던 것이 **한 편으로 줄었다.** 아래 박스가 18mm 로 버티지 않고
#      필요하면 통째로 빠지게 되어, 아홉 편이 14pt 로 돌아왔다.
SMALL = {}          # 2026-09-04: 32번(승리의 축복)도 되돌렸다 — 14pt로 다시 재 보니
                    #    안 넘친다(13pt로 낮춰 지키던 것은 25mm짜리, 두 줄도 못 쓰는
                    #    박스 하나뿐이었다). 이제 **온 책이 예외 없이 14pt**다.


# 머리를 닫는 ❖ 장식 — 말씀카드·앱 액자와 같은 모양.
#   ⚠️ 글자(U+2756)로 쓰지 않는다. 글꼴에 없거나 이모지로 나오는 기기가 있다.
ORN = ('<i></i><svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><g fill="currentColor">'
       '<path d="M12 1.6 14.7 6.6 12 11.6 9.3 6.6Z"/><path d="M12 12.4 14.7 17.4 12 22.4 9.3 17.4Z"/>'
       '<path d="M1.6 12 6.6 9.3 11.6 12 6.6 14.7Z"/><path d="M12.4 12 17.4 9.3 22.4 12 17.4 14.7Z"/>'
       '</g></svg><i></i>')


def phead(title, sub=''):
    """부속 쪽(사용법·차례·색인) 머리 — 기도문 쪽 .b-head 와 같은 모양으로 짓는다."""
    s = '<span class="ph-s">%s</span>' % html.escape(sub) if sub else ''
    return ('<div class="phead"><h2 class="ph">%s%s</h2><div class="b-orn">%s</div></div>'
            % (html.escape(title), s, ORN))


def page(r, pno, name):
    body = ''.join('<div class="pl">%s</div>' % mark_name(l, name)
                   for l in pray_lines(r['prayer'], name, r['no']))
    return """
<section class="page bl">
  <div class="b-head">
    <div class="b-title">%s</div>
    <div class="b-ref">%s</div>
    <div class="b-orn">%s</div>
  </div>
  <div class="b-pray %s">%s<div class="b-amen">%s</div></div>
  <div class="b-box"><span class="b-box-t">축복노트</span></div>
  %s
</section>""" % (html.escape(r['title']), html.escape(r['ref']), ORN, SMALL.get(r['no'], ''),
                 body, html.escape(AMEN), foot(pno))


def cover(vol, name, first, last):
    logo = '<img class="c-logo" src="%s">' % LOGO if LOGO else ''
    return """
<section class="page c%s">
  <div class="c-in">
    %s
    <h1 class="c-t">가정 축복 기도문</h1>
    <div class="c-line"></div>
    <div class="c-name">%s %s</div>
    <div class="c-v">여호와는 네게 복을 주시고 너를 지키시기를 원하며<br><b>민수기 6장 24절</b></div>
  </div>
</section>
<section class="page blank"></section>""" % ('' if THEME.get('cover_fill', True) else ' bw',
                                             logo, html.escape(name), html.escape(TITLE_SUFFIX))


def intro(name, n):
    return """
<section class="page plain">
  %s
  <div class="pbody">
    <p>한 쪽에 <b>한 편</b>입니다. 가운데 <b>가정 축복 기도문</b>을 소리 내어
       그대로 기도하시면 됩니다.</p>
    <p>기도문에는 <b>%s %s의 이름이 이미 들어가 있습니다.</b> 가족이나 이웃을 위해
       기도하실 때는 그 자리에 그분의 이름을 넣어 읽으세요.</p>
    <p>아래 <b>축복노트</b>에는 그날 날짜와 받은 마음을 자유롭게 적어 보세요.
       한 해가 지나 다시 펼치면 그것이 응답의 기록이 됩니다.</p>
    <p>순서는 <b>성경 차례 그대로</b>입니다. 앞에서부터 차례로 하셔도 좋고,
       뒤쪽 <b>「주제로 찾기」</b>에서 오늘 필요한 것을 골라 펴셔도 좋습니다.</p>
  </div>
  %s
</section>""" % (phead('이 책을 쓰는 법'), html.escape(name), html.escape(TITLE_SUFFIX), foot(3))


def toc(items, base):
    """차례 — 한 쪽에 ~52편(2단). 104편(한 권)이면 4쪽, 52편이면 2쪽."""
    pairs = [(r, base + i) for i, r in enumerate(items)]

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
        right, _ = col(part[q:], cur)
        return """
<section class="page plain">
  %s
  <div class="toc"><div>%s</div><div>%s</div></div>
  %s
</section>""" % (phead('차례', '성경 순' + more), left, right, foot(pno))

    # 한 쪽에 ~26편(2단, 단마다 ~13편) — 원래 52편/2쪽 비율 그대로
    PER_SHEET = 26
    sheets = []
    for si in range(0, len(pairs), PER_SHEET):
        chunk = pairs[si:si + PER_SHEET]
        more = '' if si == 0 else ' · 이어서'
        sheets.append(sheet(chunk, 4 + si // PER_SHEET, more))
    return ''.join(sheets)


def index_by_group(items, base, last_pno):
    g = {}
    for i, r in enumerate(items):
        g.setdefault(r['group'], []).append(base + i)
    body = ''.join('<div class="ix"><span class="ix-g">%s</span><span class="ix-p">%s</span></div>'
                   % (html.escape(k), ', '.join(str(x) for x in v))
                   for k, v in sorted(g.items(), key=lambda kv: -len(kv[1])))
    return """
<section class="page plain">
  %s
  <div class="ix-note">오늘 필요한 기도를 주제로 골라 펴 보세요. 숫자는 쪽 번호입니다.</div>
  %s
  <div class="ix-end">여호와는 그 얼굴을 네게로 향하여 드사 평강 주시기를 원하노라<br><b>민수기 6장 26절</b></div>
  %s
</section>""" % (phead('주제로 찾기'), body, foot(last_pno))


# ⚠️ :root 변수로 테마를 준다 — CSS 문자열 자체는 테마마다 다시 안 쓴다.
#    (테마를 늘릴 때는 THEMES 사전에 한 줄만 더하면 된다.)
ROOT_VARS = (':root { --accent:%s; --accent-ink:%s; --accent-light:%s; --deep:%s;'
             ' --body-font:%s; --title-font:%s; --head-font:%s; --foot-font:%s;'
             ' --title-weight:%s; --head-weight:%s; --foot-weight:%s;'
             ' --foot-pt:%spt; --foot-mid-pt:%spt; --title-track:%s; }'
             % (THEME['accent'], THEME['accent_ink'], THEME['accent_light'], THEME['deep'],
                FONT['body'], FONT['title'], FONT['head'], FONT['foot'],
                FONT['title_weight'], FONT['head_weight'], FONT['foot_weight'],
                FONT['foot_pt'], FONT['foot_mid_pt'], TITLE_TRACK))

CSS = """
@page { size:148mm 210mm; margin:0; }
* { box-sizing:border-box; }
""" + ROOT_VARS + """
body { margin:0; font-family:var(--body-font); color:#1c2333; letter-spacing:0.02em;
       -webkit-print-color-adjust:exact; print-color-adjust:exact; }
/* ⚠️ 아래 여백은 **꼬리말 높이를 따라간다.** 꼬리말은 absolute 라 자리를 차지하지
   않으므로, 여백이 모자라면 위 상자와 선이 겹친다(2026-09-04 실측 2.05mm 겹침). */
.page { width:148mm; height:210mm; padding:12mm 13mm 14mm 20mm; background:#fff;
        position:relative; overflow:hidden; page-break-after:always;
        display:flex; flex-direction:column; }
.page:nth-child(even) { padding-left:13mm; padding-right:20mm; }
.page:last-child { page-break-after:auto; }
/* ── 본문 한 쪽 — 축복 기도문 하나뿐이다 ────────────────────── */
/* 머리 — 제목·출처를 가운데로 모으고 ❖ 장식 줄로 닫는다.
   ⚠️ 그전에는 제목만 가운데이고 출처가 왼쪽에 붙어 한쪽으로 기울어 보였다(날짜 칸을
      없앤 뒤로는 더 그랬다). 굵은 가로줄 대신 얇은 금색 줄이라 쪽이 가벼워진다. */
.b-head { flex:none; text-align:center; }
.b-title { font-family:var(--title-font); font-size:19pt; font-weight:var(--title-weight);
           line-height:1.25; letter-spacing:var(--title-track); }
.b-ref { font-family:var(--head-font); font-weight:var(--head-weight); font-size:10.5pt;
         color:#6b7383; letter-spacing:.03em; margin-top:1.4mm; }
.b-orn { display:flex; align-items:center; justify-content:center; gap:2.6mm; margin-top:2.6mm; }
.b-orn i { flex:0 1 20mm; height:.3mm; background:var(--accent); opacity:.8; }
.b-orn svg { flex:none; width:3.4mm; height:3.4mm; color:var(--accent); }
/* ⚠️ 2026-09-04: 머리와 기도문 사이에 빈 칸(.b-gap)을 두어 「짧은 편은 기도문을 아래로
   내려 균형을 잡는다」고 했다가 **되돌렸다.** 실제로 뽑아 보니 제목 아래가 휑하게
   비어 「위가 비었다」는 인상이 더 컸다(성도님 제보). 지금은 **늘 위로 붙인다** —
   제목 · 기도문이 바로 이어지고, 남는 자리는 아래 상자가 상한(70mm)까지 받는다.
   상한을 넘는 몫은 상자 **아래**의 여백으로 남는다(그건 평범한 아래 여백으로 읽힌다). */
/* 기도문 — 이 책의 전부다. 온 책이 한 크기(16pt)로 통일된다.
   ⚠️ 줄 간격을 em 으로 준다 — 맨 숫자로 주면 이름(.nm)이 커질 때 그 줄만 벌어진다.
      em 은 여기서 px 로 계산돼 자식이 그 길이를 그대로 물려받는다. */
.b-pray { font-size:14pt; line-height:1.95em; text-align:center; word-break:keep-all;
          padding:4mm 2mm 4mm; }
.pl { }
/* 넘치는 몇 쪽만 한 단계 작게. ⚠️ 온 책을 가장 긴 편에 맞추면 나머지 100쪽이 다 작아진다 —
   어르신이 읽으실 책이라 그 손해가 크다. */
.b-pray.p13 { font-size:13pt; }
.b-pray.p12 { font-size:12pt; }
.b-amen { margin-top:3mm; font-weight:700; }
/* 이름 — 크게·굵게·색. 흑백으로 찍어도 진하게 남는 금갈색이다. */
.nm { font-size:1.16em; font-weight:600; color:var(--accent-ink); }
/* 아래 박스 — 남는 자리를 그대로 차지한다. 편마다 높이가 다른 것이 정상이다. */
/* ⚠️ min-height 를 0 으로 둔다 — 18mm 로 버티면 긴 편에서 **쪽이 넘친다**.
   대신 남는 자리가 너무 얕으면 아래 스크립트가 상자를 통째로 걷어낸다
   (쓸 수 없는 손가락 두 마디짜리 상자는 없느니만 못하다). */
/* ⚠️ 상한을 둔다(70mm) — 안 그러면 짧은 편(4줄)이 상자를 페이지 절반 가까이
   차지해 「미완성처럼 보인다」는 지적이 있었다. 상한을 넘는 몫은 .b-gap 이 받는다. */
/* ⚠️ margin-top:auto — 상자를 **아래에 붙인다.** 상한(70mm)에 걸려 남는 몫이 상자
   *아래*에 남으면 「상자와 아래 선이 멀다」는 인상이 된다(성도님 제보). auto 여백이
   그 몫을 상자 *위*로 옮겨, 상자 아랫변은 어느 쪽에서나 꼬리말에서 같은 거리에 놓인다.
   (flex 는 늘이기를 먼저 끝내고, 그래도 남은 자리를 auto 여백에 준다 — 표준 순서다.) */
.b-box { flex:1 1 0; max-height:70mm; min-height:0; margin-top:auto;
         border:1px solid #2b3444; border-radius:2.5mm; padding:2.5mm 3mm; position:relative; }
.b-box-t { font-family:var(--head-font); font-weight:var(--head-weight);
           position:absolute; right:3.5mm; top:2mm; font-size:9pt; color:#6b7383; }
/* ── 꼬리말 ───────────────────────────────────────────────── */
.b-foot { font-family:var(--foot-font); font-weight:var(--foot-weight);
          position:absolute; left:20mm; right:13mm; bottom:5mm; display:flex; align-items:baseline;
          justify-content:space-between; border-top:1px solid #2b3444; padding-top:1.3mm; }
.page:nth-child(even) .b-foot { left:13mm; right:20mm; }
/* ⚠️ 굵기를 칸마다 박아 두지 않는다 — 한 벌짜리 서체(케듀체·프리젠테이션)에 굵기를 더
   요구하면 브라우저가 **가짜 굵기**를 씌워 획이 번지고 겹쳐 보인다(2026-09-04 제보).
   서체 세트가 정한 값(--foot-weight)을 그대로 물려받게 둔다. */
.b-foot > span:first-child { font-size:var(--foot-pt); font-weight:var(--foot-weight); }
.b-vis { font-size:var(--foot-mid-pt); color:#3a4353; font-weight:var(--foot-weight); }
.b-pno { font-size:var(--foot-pt); font-weight:var(--foot-weight); }
/* ── 표지 ─────────────────────────────────────────────────── */
.c { background:var(--deep); color:#fff; align-items:center; justify-content:center; text-align:center; }
/* 흑백판 표지 — **첫 장은 컬러 프린터로 찍는다.** 그래서 색은 그대로 두고
   바탕 채움만 뺀다(짙은 남색 한 면을 통째로 찍으면 잉크를 다 먹는다).
   ⚠️ 본문 테마(bw)의 회색 토큰을 그대로 쓰면 표지까지 흑백이 되므로, 여기서만
      금색을 되살린다. 흰 바탕이라 밝은 금색(--accent-light)은 안 보인다 —
      표지에서는 진한 금갈색을 쓴다. */
.c.bw { background:#fff; color:#1c2333; }
.c.bw .c-line { background:#c8a24b; }
.c.bw .c-name, .c.bw .c-v b { color:#8a6a1e; }
.c.bw .c-vol, .c.bw .c-v { opacity:1; color:#4a5364; }
.c-in { padding:0 6mm; }
.c-logo { width:20mm; margin-bottom:4mm; }
.c-church { font-size:10pt; letter-spacing:2px; opacity:.85; }
.c-t { font-family:var(--title-font); font-size:32pt; font-weight:var(--title-weight);
       line-height:1.3; margin:4mm 0 0; letter-spacing:var(--title-track); }
.c-line { width:22mm; height:1.2mm; background:var(--accent); margin:5mm auto; }
.c-vol { font-size:10.5pt; opacity:.9; }
.c-name { margin-top:9mm; font-family:var(--title-font); font-size:17pt; font-weight:var(--title-weight); color:var(--accent-light); }
.c-v { margin-top:12mm; font-size:9.5pt; line-height:1.8; opacity:.85; }
.c-v b { color:var(--accent-light); }
/* ── 부속 ─────────────────────────────────────────────────── */
/* 부속 쪽 머리 — 기도문 쪽(.b-head)과 같은 언어로: 가운데 정렬 + 명조 + ❖ 장식 줄.
   ⚠️ 전에는 왼쪽 정렬·진한 밑줄(.ph)이라 기도문 100쪽과 전혀 다른 책처럼 보였다
      (표지 바로 다음이 이 4쪽이라 책의 첫인상을 여기서 만든다). 본문(차례·색인 목록)은
      여전히 왼쪽 정렬이라 읽는 흐름은 그대로다 — 바뀌는 것은 머리뿐이다. */
.phead { flex:none; text-align:center; margin-bottom:5mm; }
.ph { font-family:var(--title-font); font-size:19pt; font-weight:var(--title-weight);
      line-height:1.25; letter-spacing:var(--title-track); }
.ph-s { display:block; font-family:var(--head-font); font-weight:var(--head-weight);
        font-size:10.5pt; color:#6b7383; letter-spacing:.03em; margin-top:1.4mm; }
.pbody p { font-size:13pt; line-height:1.85; margin:0 0 4mm; word-break:keep-all; }
.toc { display:flex; gap:6mm; flex:1; }
.toc > div { flex:1; }
.tb { font-family:var(--head-font); font-size:10.5pt; font-weight:var(--head-weight);
      color:var(--accent); margin:2.5mm 0 1mm; }
.tc { display:flex; font-size:11pt; line-height:1.75; }
.tr { flex:1; word-break:keep-all; }
.tp { color:#6b7383; padding-left:2mm; }
.ix { display:flex; font-size:10pt; line-height:1.7; padding:1.8mm 0; border-bottom:.5px dotted #c9cfd9; }
.ix-g { width:34mm; font-weight:700; flex:none; }
.ix-p { flex:1; color:#3a4353; }
.ix-note { font-size:9.5pt; color:#4a5364; margin-bottom:3mm; }
.ix-end { margin-top:auto; text-align:center; font-size:10pt; line-height:1.8; color:#3a4353; }
.ix-end b { color:var(--deep); }
"""

# ── A4 큰글씨판 — CSS 안의 모든 mm·pt 값을 한 배율로 함께 키운다 ─────────────────
#   ⚠️ **따로 값을 새로 정하지 않는다.** A5 판은 이미 브라우저 실측으로 다듬어져
#      있다(14pt 최대·13자 목표·70mm 상한·12mm 문턱 전부 실측값이다). A4 는 그 비례를
#      그대로 키운 것뿐이다 — A4 와 A5 는 가로세로 비가 같아(ISO 216, √2 배) 한
#      배율로도 어긋나지 않는다. mm·pt 뒤에 오는 숫자를 정규식으로 찾아 곱한다
#      (opacity·em·letter-spacing 처럼 단위 없는 값은 손대지 않는다 — em 은 이미
#      font-size 를 따라가므로 저절로 커진다).
A4_SCALE = 2 ** 0.5   # A(n)→A(n-1): 가로·세로 모두 √2 배(148×210mm → 209×297mm)


def scale_lengths(css_text, factor):
    if factor == 1.0:
        return css_text

    def rep(m):
        return ('%g' % (float(m.group(1)) * factor)) + m.group(2)
    # ⚠️ `\d*\.?\d+` — `.3mm`처럼 앞자리 0 없이 쓴 값도 잡는다(`.b-orn i`의 height 가 그렇다).
    #    `\d+(\.\d+)?`만 쓰면 이런 값을 통째로 건너뛰어 그 줄만 A5 크기로 남는다.
    return re.sub(r'(-?\d*\.?\d+)(mm|pt)', rep, css_text)


if SIZE_NAME == 'a4':
    CSS = scale_lengths(CSS, A4_SCALE)
    PRAY_PT *= A4_SCALE   # 화면표시·box_mm() 어림값이 실제 렌더와 어긋나지 않게


# 자리가 얕으면 「축복노트」를 없앤다.
#   ⚠️ 파이썬으로 미리 셈하지 않는다 — 줄이 접히는지는 글꼴·글자폭이 정하는 것이라
#      브라우저만 정확히 안다(SMALL 목록을 손으로 재야 했던 것과 같은 이유).
#      인쇄 전에 브라우저가 배치를 마치면 그때 재서 걷어낸다.
#   2026-09-04: 22mm → 12mm. 걷어내기 전 실측으로 보니 두 무리로 뚜렷이 갈렸다 —
#      5.6~6.1mm(6쪽, 상자 안 여백(5mm)을 빼면 「축복노트」 라벨 하나도 못 들어간다)와
#      14.6~15.6mm(7쪽, 라벨 + 짧은 한 줄은 된다) 사이에 틈이 있다. 그 틈 가운데를
#      문턱으로 잡아 7쪽을 살렸다 — 없애는 쪽은 13개에서 6개로 줄었다.
BOX_MIN_MM = 12    # 이보다 얕으면 라벨도 못 들어간다(6mm대는 실측으로 확인)
if SIZE_NAME == 'a4':
    BOX_MIN_MM *= A4_SCALE     # 판이 커진 만큼 「쓸 수 있다」는 기준도 함께 커진다
TRIM_JS = """
<script>
window.addEventListener("load", function () {
  var min = %g * 96 / 25.4;
  document.querySelectorAll(".b-box").forEach(function (b) {
    if (b.offsetHeight < min) b.remove();
  });
});
</script>""" % BOX_MIN_MM


# 기본(gold·a5)과 파일 이름이 같아야 지금까지 쓰던 안내 문서·기존 파일명이 안 깨진다.
SUFFIX = (('' if THEME_NAME == 'gold' else '_' + THEME_NAME)
          + ('' if FONT_NAME == 'web' else '_' + FONT_NAME)
          + ('' if SIZE_NAME == 'a5' else '_A4'))

FONT_LINK = ('<link href="https://fonts.googleapis.com/css2?family=Nanum+Myeongjo:wght@400;700;800'
             '&family=Noto+Serif+KR:wght@400;600;700;900'
             '&family=Noto+Sans+KR:wght@300;400;500;700;800&display=swap" rel="stylesheet">'
             if FONT['web'] else '')

# PC 서체 세트일 때 — 서체가 안 깔린 컴퓨터에서 열면 **화면에만** 띠를 띄워 알려 준다.
#   ⚠️ 조용히 다른 서체로 대체되는 것이 가장 나쁘다(모르고 그대로 인쇄한다).
#   ⚠️ @media print 로 인쇄에서는 빼므로 종이에는 절대 안 나온다.
FONT_CHECK = '' if FONT['web'] else """
<style>#fontwarn{display:none;position:fixed;left:0;right:0;top:0;z-index:99;background:#b3261e;
color:#fff;font:14px/1.5 sans-serif;padding:8px 12px;text-align:center}
@media print{#fontwarn{display:none !important}}</style>
<div id="fontwarn"></div>
<script>
window.addEventListener("load", function () {
  var need = [%s];
  var miss = need.filter(function (f) { return !document.fonts.check("12px '" + f + "'"); });
  if (miss.length) {
    var w = document.getElementById("fontwarn");
    w.textContent = "⚠ 이 컴퓨터에 없는 서체: " + miss.join(", ") +
      " — 다른 서체로 대체되어 보입니다(인쇄 전에 확인하세요).";
    w.style.display = "block";
  }
});
</script>""" % ', '.join('"%s"' % f for f in ('Hakgyoansim Dunggeunmiso TTF',
                                                            'Freesentation 8', 'Freesentation 7', 'Freesentation 4'))


def html_doc(css, body_html):
    return ('<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">%s<style>%s</style></head>'
            '<body>%s%s%s</body></html>' % (FONT_LINK, css, body_html, TRIM_JS, FONT_CHECK))


def out_path(fname):
    """--out 으로 준 폴더에 넣는다(없으면 만든다)."""
    if OUT_DIR and OUT_DIR != '.':
        if not os.path.isdir(OUT_DIR):
            os.makedirs(OUT_DIR)
        return os.path.join(OUT_DIR, fname)
    return fname


def name_tag(name):
    """명단으로 돌릴 때만 성함을 파일 이름에 넣는다(한 사람 몫은 예전 이름 그대로)."""
    return ('_' + name) if LIST_FILE else ''


def build(vol, items, name):
    toc_pages = -(-len(items) // 26)  # 26편당 차례 1쪽(2단)
    base = 3 + toc_pages + 1          # 표지·여백·사용법 + 차례 쪽수 + 1
    pages = [cover(vol, name, items[0], items[-1]), intro(name, len(items)), toc(items, base)]
    for i, r in enumerate(items):
        pages.append(page(r, base + i, name))
    pages.append(index_by_group(items, base, base + len(items)))
    out = html_doc(CSS, ''.join(pages))
    vol_tag = '' if ONE_VOL else '_%d권' % vol
    f = out_path('축복기도문%s%s%s.html' % (vol_tag, name_tag(name), SUFFIX))
    io.open(f, 'w', encoding='utf-8', newline='').write(out)
    return f, out.count('class="page')


# ── 인쇄용 2단(--2up) — A4 가로 한 장에 A5 두 쪽을 나란히 ────────────────────────
#   ⚠️ 접어서 제본하는 순서(시그니처)가 아니다 — **읽는 순서 그대로** 두 쪽씩 나란히
#      놓을 뿐이다(집 프린터로 인쇄해 가위로 자르는 용도). 접지 제본용 순서가 필요하면
#      이 함수를 바꿔야 한다(그건 훨씬 큰 일이다 — 앞뒤 면 계산이 들어간다).
#   148×2=296mm 인데 A4 가로는 297mm — 1mm 뿐이라 손으로 계산하지 않고 그냥 가운데
#      맞춤(justify-content:center)으로 여유를 흡수한다.
CSS_2UP = """
@page { size:297mm 210mm; margin:0; }
body { margin:0; background:#ddd; }  /* 시트 사이 여백이 보이게 — 인쇄에는 안 나간다(각 시트가 흰 배경) */
.sheet { width:297mm; height:210mm; display:flex; align-items:center; justify-content:center;
         gap:0; page-break-after:always; position:relative; background:#ddd; }
.sheet:last-child { page-break-after:auto; }
/* ⚠️ 개별 .page 는 원래 자기가 마지막 쪽인 줄 알고 page-break-after 를 스스로 결정한다
   (.page, .page:last-child) — 여기서는 그 판단이 틀리므로(끊는 자리는 .sheet 가 정한다)
   더 구체적인 선택자 + !important 로 반드시 덮어쓴다. */
.sheet .page, .sheet .page:last-child { page-break-after:avoid !important; }
/* 자르는 자리 — 가운데를 옅은 점선으로. 인쇄돼도 잉크가 거의 안 든다. */
.sheet::after { content:""; position:absolute; left:50%; top:0; bottom:0; width:0;
                border-left:.3mm dashed #aaa; }
"""


def build_2up(vol, items, name):
    toc_pages = -(-len(items) // 26)
    base = 3 + toc_pages + 1
    pages = [cover(vol, name, items[0], items[-1]), intro(name, len(items)), toc(items, base)]
    for i, r in enumerate(items):
        pages.append(page(r, base + i, name))
    pages.append(index_by_group(items, base, base + len(items)))
    secs = re.findall(r'<section class="page[^"]*">.*?</section>', ''.join(pages), re.S)
    sheets = ['<div class="sheet">%s</div>' % ''.join(secs[i:i + 2]) for i in range(0, len(secs), 2)]
    out = html_doc(CSS + CSS_2UP, ''.join(sheets))
    vol_tag = '' if ONE_VOL else '_%d권' % vol
    f = out_path('축복기도문%s%s%s_2up.html' % (vol_tag, name_tag(name), SUFFIX))
    io.open(f, 'w', encoding='utf-8', newline='').write(out)
    return f, len(sheets)


if '--export' in sys.argv:
    export_lines(NAME)
    sys.exit(0)

# --sample N : 앞에서 N편만, 표지·차례 없이 한 파일로. 인쇄해 손에 쥐어 보는 용도.
if '--sample' in sys.argv:
    k = int(sys.argv[sys.argv.index('--sample') + 1])
    body = ''.join(page(r, 1 + i, NAME) for i, r in enumerate(rows[:k]))
    out = html_doc(CSS, body)
    sf = '축복기도문_견본%s.html' % SUFFIX
    io.open(sf, 'w', encoding='utf-8', newline='').write(out)
    print('%s — %d장 (%.0fpt · 한 줄 %d자)' % (sf, k, PRAY_PT, PRAY_PER))
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

if TWOUP and SIZE_NAME == 'a4':
    print('!! --2up 은 a5 전용입니다(A4 큰글씨판을 2단으로 찍으려면 A3 용지가 필요합니다) — 건너뜁니다.')
    TWOUP = False

vols = [rows[i:i + PER_VOL] for i in range(0, len(rows), PER_VOL)]


def make_one(name, quiet=False):
    """한 사람 몫 — 두 권을 만들고, --pdf 면 PDF 까지 굽는다."""
    made = []
    for n, items in enumerate(vols, 1):
        f, cnt = build(n, items, name)
        made.append(f)
        if not quiet:
            print('%s  —  %d편 · %d쪽' % (f, len(items), cnt))
        if TWOUP:
            f2, sheets = build_2up(n, items, name)
            made.append(f2)
            if not quiet:
                print('%s  —  %d장(A4 가로, 두 쪽씩)' % (f2, sheets))
    if MAKE_PDF:
        for f in made:
            pdf = f[:-5] + '.pdf'
            if to_pdf(f, pdf) and not quiet:
                print('   → %s' % pdf)
    return made


# ── 명단으로 여러 사람 몫을 한 번에 ──────────────────────────────────
#   ⚠️ 한 사람에 두 권 · PDF 까지 구우면 10초 안팎이 걸린다. 100명이면 20분쯤이다.
#      진행 상황을 한 줄씩 찍어 멈춘 것처럼 보이지 않게 한다.
if LIST_FILE:
    if not os.path.exists(LIST_FILE):
        raise SystemExit('!! 명단 파일이 없습니다: %s' % LIST_FILE)
    names = []
    for raw in io.open(LIST_FILE, encoding='utf-8-sig'):
        t = raw.strip()
        if t and not t.startswith('#'):
            names.append(t)
    if not names:
        raise SystemExit('!! 명단이 비어 있습니다: %s' % LIST_FILE)
    print('명단 %d분 — %s%s' % (len(names), OUT_DIR, ' · PDF 까지' if MAKE_PDF else ' · HTML 만'))
    print('')
    for i, nm in enumerate(names, 1):
        made = make_one(nm, quiet=True)
        # ⚠️ 조사가 사람마다 갈린다(ㄹ 받침!) — 한 분씩 찍어 눈으로 확인할 수 있게 한다
        print('  %3d/%d  %-8s  %s' % (i, len(names), nm,
                                      '로' if jong(nm) in (0, 8) else '으로'))
    print('')
    print('끝났습니다 — %s 폴더를 보세요.' % os.path.abspath(OUT_DIR))
    print('테마: %s · 서체: %s · 판형: %s%s'
          % (THEME_NAME, FONT_NAME, SIZE_NAME.upper(), ' · 2단' if TWOUP else ''))
    sys.exit(0)

make_one(NAME)

boxes = sorted((box_mm(r, NAME), r['no'], r['title']) for r in rows)
print('')
print('■ 기도문 %.0fpt 한 가지로 온 책 통일 · 아래 박스는 남는 만큼' % PRAY_PT)
print('   가장 좁은 박스  %2.0fmm   %d번 %s' % (boxes[0][0], boxes[0][1], boxes[0][2]))
print('   가장 넓은 박스  %2.0fmm   %d번 %s' % (boxes[-1][0], boxes[-1][1], boxes[-1][2]))
tight = [b for b in boxes if b[0] < BOX_MIN]
print('   박스가 %dmm 미만인 편   %s' % (BOX_MIN, [b[1] for b in tight] or '없음'))
print('')
print('테마: %s(%s) · 서체: %s(%s) · 판형: %s%s'
      % (THEME_NAME, THEME['label'], FONT_NAME, FONT['label'],
         SIZE_NAME.upper(), ' · 2단' if TWOUP else ''))
print('이름: %s' % NAME)
