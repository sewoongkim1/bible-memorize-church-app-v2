# -*- coding: utf-8 -*-
"""기독교 고전과 함께하는 전교인 필사 — A5 소책자 (2026-09-09)

펼치면 **왼쪽이 늘 고전, 오른쪽이 늘 따라 쓰기**. 이 한 줄에서 나머지가 모두 나온다.
오른쪽은 왼쪽의 거울이다 — 위 발췌문 → 「단락 따라 쓰기」, 아래 성경 상자 → 「말씀 따라 쓰기」.

  p1        앞표지
  p2 | p3   목차 (펼침면)
  p4 | p5   루터 선집 ① | 따라 쓰기      ← 짝수쪽 = 고전, 홀수쪽 = 노트
   …        20편 40쪽
  p44       뒷표지                      → 44쪽 = A4 11장 중철

쓰는 법
  python generate_classics.py                 HTML 만
  python generate_classics.py --pdf           A5 순서판 PDF 까지
  python generate_classics.py --pdf --booklet A4 중철 배치판까지 (인쇄해 접는 판)
  python generate_classics.py --fit           들어가는 가장 큰 글씨를 재서 알려 준다
  python generate_classics.py --sample 2      앞 2편만 (모양 볼 때)
  python generate_classics.py --no-bold       제목도 본문 서체로 (인쇄소가 Type3 를 싫어할 때)
  python generate_classics.py --lines         노트 쪽에 줄이 몇 개씩 잡히는지 (간격을 바꾼 뒤)

⚠️ 원고는 `classics.json` 이다. 글을 고칠 때 이 파일을 건드리지 말 것.
⚠️ 서체는 `fonts/NotoSerifKR-*.woff` — Noto Serif KR(본명조 계열), 한국 출판물의 표준 명조.
   없으면 처음 한 번 받아 온다. PDF 로 구우면 서체가 박히므로 인쇄소에 넘겨도 같게 나온다.

설계 배경은 `docs/superpowers/specs/2026-09-09-classics-booklet-design.md`.
"""
import io, os, re, sys, json, html, subprocess

os.chdir(os.path.dirname(os.path.abspath(__file__)))


def arg_val(flag, default=None):
    return sys.argv[sys.argv.index(flag) + 1] if flag in sys.argv else default


MAKE_PDF = '--pdf' in sys.argv
MAKE_BOOKLET = '--booklet' in sys.argv
FIT_MODE = '--fit' in sys.argv
# 제목까지 본문 서체(Regular)로 그린다 — PDF 안 서체가 한 벌로 정리된다.
#   지금 서체(Noto Serif KR)는 두 벌 다 Type0(CID)로 정상 임베딩되므로 굳이 쓸 일은 없다.
#   ⚠️ 서체를 바꿀 때 이 길을 남겨 둘 것 — 전에 쓰던 빙그레체Ⅱ 는 이름 레코드(name id1·id4)가
#      비어 있어 크롬이 **Type3 폰트**로 박았고, 그걸 경고로 잡는 인쇄소가 있다.
NO_BOLD = '--no-bold' in sys.argv
LINES_MODE = '--lines' in sys.argv
SAMPLE = int(arg_val('--sample', 0) or 0)

BOOK_VER = 'V1.0'
# 판 번호. **판을 올릴 때 이 한 줄만 고친다** — 결과물 이름에 그대로 들어간다.
#   나오는 이름: `기독교고전_전교인필사_A5_9.5(V1.0).pdf` · `..._9.5(V1.0)_중철A4.pdf`
# ⚠️ 이름에 **줄 간격과 판이 들어간다** — 간격을 바꿔 여러 벌을 뽑아도 서로 덮어쓰지 않고,
#    인쇄본을 받아 들었을 때 어느 값으로 뽑은 것인지 파일 이름만 봐도 안다.
#    (2026-09-11에 성도님이 손으로 그렇게 바꾸신 것을 규칙으로 굳혔다.)
# ⚠️ 이름은 `LINE_MM` 이 정해진 **뒤에** 만든다 — 아래 「돌리기」 첫 줄에 있다.

# ── 크기 ────────────────────────────────────────────────────────────────
# ⚠️ 발췌문 크기는 **실측으로 정한 값**이다(--fit). 20편이 176~262자로 고르기 때문에
#    온 책이 한 크기다 — 편마다 다르면 책이 들쭉날쭉해 보인다(축복기도문에서 얻은 교훈).
#    원고를 고쳤으면 `--fit` 을 다시 돌려 이 값을 갱신할 것.
BODY_PT = float(arg_val('--pt', 0) or 0)          # 0 이면 아래 FITTED 를 쓴다
FITTED_PT = 14.0        # 2026-09-09 실측 — 14.5pt 에서는 4·22·24쪽이 넘쳤다

# ── 노트 쪽의 줄 ────────────────────────────────────────────────────────
# **줄 간격 하나만 고르면 나머지는 따라온다.** 예전에는 셋을 따로 적어 두어 하나만
# 고치면 조용히 어긋났다(2026-09-11에 `LINE_MM` 이 아예 죽어 있는 것도 그때 나왔다).
LINE_MM = float(arg_val('--line', 9.5))
# 줄 간격(mm). 2026-09-11에 8.0 → **9.5** 로 넓혔다 — **성도님들이 「칸 간격이 좁다」고** 하셨다.
#   「좁다」는 말은 곧 실제 손글씨가 8mm 보다 크다는 뜻이다. 9·9.5·10mm 세 벌을 뽑아
#   견준 뒤 성도님이 9.5 를 고르셨다(한 쪽 15줄).
#   `--line 10` 처럼 바꿔 가며 다시 견줄 수 있다.
# ⚠️ **이 값은 CSS 에도 들어간다**(`.ln { flex:0 0 ...mm }`). 한때 이 상수를 정의만 해 두고
#    CSS 에는 `8mm` 를 손으로 박아 놓아, **값을 고쳐도 아무 일도 안 일어났다.**

HAND_PER_LINE = max(8, int(round(136.0 / LINE_MM)))
# 손글씨 한 줄에 들어가는 글자 수. **줄 간격을 따라간다** — 줄이 넓어지면 글씨도 커진다.
#   136 은 실측 기준점에서 온 값이다(8mm 에서 17자 → 8 × 17 = 136). 9mm 면 15자, 10mm 면 14자.
# ⚠️ **여기에 여유를 더하지 말 것.** 말씀 칸이 가져간 만큼 단락 칸이 줄어든다 —
#    한쪽의 여유가 곧 다른 쪽의 부족이다. 한때 `+1` 을 두었더니 말씀은 20편 모두 남고
#    단락만 14편이 모자랐다(2026-09-09).

LINES_AVAIL_MM = 147.0
# 노트 쪽에서 줄이 쓸 수 있는 높이(mm) — 머리·라벨·상자 여백을 뺀 나머지.
# ⚠️ 어림값이다. **`--lines` 로 반드시 확인한다**(브라우저가 실제로 그린 줄을 센다).
#    실측 네 점과 맞춘 값이다 — 8mm→18줄 · 9mm→16 · 9.5mm→15 · 10mm→14.
#    처음에 150 으로 두었더니 10mm 에서 한 줄을 낙관해 단락 바닥이 5줄로 새었다.

PAR_FLOOR = 6
# 단락 칸이 어느 편에서나 가져야 할 최소 줄. **말씀 칸 상한이 곧 이 바닥을 만든다.**
# ⚠️ 이 바닥이 없으면 성경본문이 긴 편(7번 회심으로의 초대 ② · 175자)에서 말씀 칸이
#    쪽을 거의 다 먹어 **단락이 3줄까지 떨어진다** — 그건 못 쓰는 칸이다.
# ⚠️ 대가: 성경본문이 가장 긴 한두 편은 말씀 칸이 조금 모자라다(나머지는 온전히 담긴다).

NOTE_MIN = 3
NOTE_MAX = max(NOTE_MIN, int(LINES_AVAIL_MM // LINE_MM) - PAR_FLOOR)

# 말씀 칸 줄 수는 **왼쪽 쪽에 성경본문이 찍힌 줄 수**와 같게 준다(2026-09-11 성도님 지시).
#   그전에는 「손글씨 몇 자니까 몇 줄」로 잡았는데, 그러면 **많이 찍힌 쪽이 적게 받았다** —
#   24쪽은 발췌 9줄·성경 7줄이 찍혔는데 칸은 단락 6줄·말씀 9줄이었다.
# ⚠️ **글자 수로 어림하지 않는다.** `word-break:keep-all` 때문에 줄 끝이 남아,
#    자수로 나누면 편마다 1~2줄씩 틀린다. 그래서 **한 번 그려서 브라우저에 물어본다.**
SCR_LINES = None        # 잰 값이 들어온다. 못 쟀으면 None — 아래 자수 어림으로 되돌아간다.

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
    """브라우저를 조용히 돌려 PDF 로 굽는다. 서체는 PDF 안에 박힌다."""
    chrome = find_chrome()
    if not chrome:
        print('   !! 크롬을 못 찾아 PDF 는 건너뜁니다 — HTML 을 열어 직접 인쇄하세요.')
        return False
    if os.path.exists(pdf_path):
        os.remove(pdf_path)
    subprocess.run([chrome, '--headless', '--disable-gpu', '--no-pdf-header-footer',
                    '--print-to-pdf=' + os.path.abspath(pdf_path),
                    '--virtual-time-budget=30000',
                    'file:///' + os.path.abspath(html_path).replace(os.sep, '/')],
                   capture_output=True)
    return os.path.exists(pdf_path)


def esc(t):
    return html.escape(t or '')


CIRCLED = '①②③④⑤⑥⑦⑧⑨'


def circ(mark):
    """'①' → 원을 CSS 로 그린 <span>. 서체에 원문자가 없어도 똑같이 나온다."""
    i = CIRCLED.find(mark)
    return '<span class="cn">%d</span>' % (i + 1) if i >= 0 else esc(mark)


def title_html(it):
    """「루터 선집 ①」 — 책 이름 + 원 안의 번호."""
    return '%s %s' % (esc(it['book']), circ(it['mark']))


# ── 서체 ────────────────────────────────────────────────────────────────
# Noto Serif KR — 한국 출판물의 표준 명조(본명조 계열). SIL OFL 이라 재배포도 자유롭다.
# ⚠️ 그래도 **저장소에 넣지 않는다** — 두 벌이 4.8MB 라 저장소가 무거워진다.
#    없으면 여기서 받아 온다(처음 한 번만 인터넷이 필요하다).
# ⚠️ 서체를 바꾸면 **`--fit` 을 반드시 다시 돌릴 것** — 서체마다 글자 폭이 달라
#    같은 pt 라도 줄 수가 바뀐다. 빙그레체(둥근 고딕) → 명조로 바꿨을 때 실제로 그랬다.
_FS = 'https://cdn.jsdelivr.net/npm/@fontsource/noto-serif-kr@5.3.0/files/'
FONT_URL = {
    'fonts/NotoSerifKR-400.woff': _FS + 'noto-serif-kr-korean-400-normal.woff',
    'fonts/NotoSerifKR-700.woff': _FS + 'noto-serif-kr-korean-700-normal.woff',
}


def ensure_fonts():
    import urllib.request
    os.makedirs('fonts', exist_ok=True)
    for path, url in FONT_URL.items():
        if os.path.exists(path) and os.path.getsize(path) > 100000:
            continue
        print('  서체를 받습니다 — %s' % os.path.basename(path))
        try:
            urllib.request.urlretrieve(url, path)
        except Exception as e:
            raise SystemExit(
                '!! 서체를 받지 못했습니다(%s)\n'
                '   인터넷이 되는 곳에서 한 번만 돌리면 fonts/ 에 저장됩니다.\n'
                '   직접 받으려면: %s' % (e, url))


ensure_fonts()

# 교회 마크 — 앞표지·뒷표지에 넣는다. 없으면 교회 이름 글자로 대신한다.
LOGO = ''
_lg = os.path.join('..', 'marketing', 'logo-data-uri.txt')
if os.path.exists(_lg):
    LOGO = io.open(_lg, encoding='utf-8').read().strip()

# ── 자료 ────────────────────────────────────────────────────────────────
D = json.load(io.open('classics.json', encoding='utf-8'))
ITEMS = D['items']
if SAMPLE:
    ITEMS = ITEMS[:SAMPLE]

CSS_HEAD = ''
if NO_BOLD:
    CSS_HEAD = ":root{--tf:'BookKR',serif}"

CSS = r'''
/* 본문 서체 — Noto Serif KR(본명조 계열). 한국 출판물의 표준 명조이고 SIL OFL 이다.
   ⚠️ @font-face 의 font-family 는 **실제 이름**이라야 한다 — var() 를 쓰면 서체가
      등록되지 않아 제목이 조용히 대체 서체로 바뀐다(2026-09-09에 그랬다). */
@font-face { font-family:'BookKR'; src:url('fonts/NotoSerifKR-400.woff') format('woff');
             font-weight:400; font-display:block; }
@font-face { font-family:'BookKRB'; src:url('fonts/NotoSerifKR-700.woff') format('woff');
             font-weight:400; font-display:block; }

:root {
  --navy:#1a3a6b; --navy-d:#132a4d; --gold:#a8873c;
  --ink:#1b1f27; --sub:#5a6474; --line:#c9cfd9; --cream:#fffdf8;
  --tf:'BookKRB','BookKR',serif;   /* 제목 — --no-bold 면 본문 서체로 바뀐다 */
  --line-strong:#8b93a1;           /* 노트 쪽의 머리 줄·끝 줄 — 쓰는 자리를 가둔다 */
}
* { box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
html,body { margin:0; padding:0; background:#7c8595; }
body { font-family:'BookKR','Noto Serif KR',serif; color:var(--ink); }

@page { size:148mm 210mm; margin:0; }

.page { width:148mm; height:210mm; background:#fff; overflow:hidden;
        position:relative; display:flex; flex-direction:column;
        margin:0 auto 6mm; page-break-after:always; }
@media print { .page { margin:0; box-shadow:none; } }
@media screen { .page { box-shadow:0 2px 10px rgba(0,0,0,.35); } }

/* 안쪽(제본 골) 여백을 바깥보다 3mm 넓게 — 중철은 골에 글이 먹힌다.
   짝수쪽은 펼침면 왼쪽이라 골이 오른쪽에, 홀수쪽은 그 반대. */
.pL { padding:13mm 16mm 12mm 13mm; }
.pR { padding:13mm 13mm 12mm 16mm; }

/* ── 머리 ───────────────────────────────────────────── */
.hd { font-size:9.5pt; color:var(--sub); letter-spacing:.02em;
      padding-bottom:2mm; border-bottom:.6px solid var(--line); margin-bottom:5mm; }
.hd b { font-family:var(--tf); color:var(--navy); font-weight:400; }

/* ── 고전 쪽 ─────────────────────────────────────────── */
.t-wrap { text-align:center; margin-bottom:5mm; }
.t-main { font-family:var(--tf); font-weight:400; font-size:19pt; color:var(--navy);
          letter-spacing:.02em; line-height:1.3; }
.t-sub  { font-size:11.5pt; color:var(--sub); margin-top:1.6mm; line-height:1.45;
          word-break:keep-all; }
.t-au   { font-size:10.5pt; color:var(--gold); margin-top:2.4mm; letter-spacing:.03em; }
.t-rule { width:26mm; height:1px; background:var(--line); margin:3.4mm auto 0; }

/* ⚠️ text-align:justify 를 쓰지 않는다 — 한글에 word-break:keep-all 을 걸면 낱말이
   안 쪼개져, 양끝을 맞추느라 낱말 사이가 크게 벌어진다("죄를  죽인다는  것은  죄를").
   왼끝 맞춤이 오른쪽 들쭉날쭉을 남기지만 그편이 훨씬 잘 읽힌다. */
.body p { margin:0 0 3.2mm; line-height:1.78; word-break:keep-all; }
.body p:last-child { margin-bottom:0; }

/* 성경본문 — 아래에 붙인다. 발췌문이 짧아도 상자는 늘 같은 자리에 온다. */
.scr { margin-top:auto; background:var(--cream); border-left:2.6mm solid var(--navy);
       border-radius:0 2mm 2mm 0; padding:4.6mm 5mm 4.2mm; }
.scr-t { line-height:1.72; word-break:keep-all; }
.scr-r { margin-top:2.6mm; text-align:right; font-family:var(--tf); font-weight:400;
         color:var(--navy); letter-spacing:.02em; }

/* ── 노트 쪽 ─────────────────────────────────────────── */
.lab { display:inline-block; font-family:var(--tf); font-weight:400; font-size:10pt;
       color:var(--navy); background:#eef2f8; border-radius:1.6mm;
       padding:1.1mm 3mm; margin-bottom:2.6mm; letter-spacing:.02em; }
.lab.m { margin-top:6mm; }
/* 줄 — 단락 칸과 말씀 칸이 **똑같은 간격**(LINE_MM). 일반 노트의 간격이다.
   ⚠️ `.ln` 에 flex:0 0 <간격> 을 반드시 준다. 그냥 height 만 주면 말씀 칸(.grow, flex:1)
      안에서 **flex 가 줄들을 눌러** 따라쓰기 8mm / 묵상 6.2mm 로 간격이 달라진다
      (2026-09-09에 그랬다 — 화면에서는 티가 잘 안 나고 뽑아 봐야 보인다).
   ⚠️ 되풀이 그라데이션(repeating-linear-gradient)으로 그리지 말 것 — 크롬이 PDF 로
      구울 때 래스터로 바꿔 버려 간격도 굵기도 뭉개진다(같은 날 시도했다가 되돌렸다).
   묵상 칸은 남는 만큼 줄을 넉넉히 두고 넘치는 것은 잘라 낸다 — 잘린 줄은 아래 테두리가
   칸 밖이라 아예 안 그려지므로, 칸 높이가 얼마든 **딱 맞는 수만큼** 남는다. */
.lines { display:flex; flex-direction:column; }
.ln { flex:0 0 __LINE__mm; border-bottom:.7px solid #d7dce4; }
.lines.grow { flex:1; min-height:0; overflow:hidden; }

/* 말씀 따라 쓰기 칸 — 왼쪽 쪽의 성경본문 상자(.scr)와 같은 모양으로 맞춘다.
   펼쳐 놓으면 왼쪽 상자와 오른쪽 상자가 나란히 서서 「이걸 여기다 옮겨 적는다」가 보인다. */
.wbox { margin-top:auto; background:var(--cream); border-left:2.6mm solid var(--navy);
        border-radius:0 2mm 2mm 0; padding:4mm 4.4mm 1.4mm; }
.wb-hd { display:flex; align-items:baseline; }
.wb-hd .lab { margin-bottom:2.4mm; }
.wb-r { margin-left:auto; font-family:var(--tf); font-size:9.5pt; color:var(--navy);
        letter-spacing:.02em; }
.wbox .ln { border-bottom-color:#cdd3dd; }

/* 노트 쪽 머리 — **날짜를 「단락 따라 쓰기」 줄 오른쪽에 붙인다**(2026-09-11 성도님 제안).
   머리 줄을 따로 두지 않으니 **쓰는 줄이 하나 늘고**, 아래 말씀 상자의
   「말씀 따라 쓰기 … 히브리서 4:15-16」과 같은 모양이 된다.
   ⚠️ 진한 줄은 그대로 둔다 — 쓰는 자리를 위에서 가두는 것이 이 줄의 일이다.
   ⚠️ 끝 줄은 말씀 칸의 마지막 `.ln` 이다(단락 칸의 마지막 줄이 아니다) — 단락 칸은
      넘치는 줄을 잘라 내므로 `:last-child` 가 화면에 보이는 마지막 줄이 아닐 수 있다. */
.pr-hd { display:flex; align-items:baseline; padding-bottom:2mm; margin-bottom:3mm;
         border-bottom:1.1px solid var(--line-strong); }
.pr-hd .lab { margin-bottom:0; }
.pr-d { margin-left:auto; font-size:9.5pt; color:var(--sub); letter-spacing:.02em; }
.pr-d b { font-family:var(--tf); color:var(--navy); font-weight:400; }
.wbox .lines .ln:last-child { border-bottom:1.1px solid var(--line-strong); }

/* ── 꼬리말 ─────────────────────────────────────────── */
.ft { position:absolute; left:13mm; right:13mm; bottom:5.5mm;
      display:flex; justify-content:space-between; align-items:baseline;
      font-size:8.5pt; color:#8b93a1; letter-spacing:.02em; }
.ft .pno { font-family:var(--tf); font-weight:400; font-size:9.5pt; color:var(--navy); }

/* ── 표지 ───────────────────────────────────────────── */
/* 아래 여백을 위보다 넉넉히 줘 제목이 한가운데가 아니라 조금 위(약 44%)에 앉게 한다 —
   책 표지는 정가운데보다 살짝 위가 안정돼 보인다. */
.cover { background:#fff; color:var(--navy); align-items:center; justify-content:center;
         text-align:center; padding:22mm 15mm 46mm; }
.cv-logo { width:34mm; margin-bottom:8mm; }
.cv-rule { width:16mm; height:1px; background:var(--line); margin:7mm auto; }
.cv-t { font-family:var(--tf); font-weight:400; font-size:27pt; line-height:1.42;
        letter-spacing:.02em; }
.cv-t em { font-style:normal; color:var(--gold); }
.cv-p { margin-top:9mm; font-size:12.5pt; color:var(--sub); letter-spacing:.06em; }
/* ⚠️ 맺음말을 margin-top:auto 로 내리면 그 auto 마진이 남는 공간을 통째로 먹어
   제목이 위로 쏠린다 — 제목은 가운데에 두고 맺음말만 아래에 못박는다. */
.cv-v { position:absolute; left:15mm; right:15mm; bottom:18mm;
        font-size:9.5pt; line-height:1.85; color:var(--sub); word-break:keep-all; }

.back { justify-content:center; text-align:center; padding:24mm 17mm; }
.bk-t { font-family:var(--tf); font-weight:400; font-size:13pt; color:var(--navy);
        margin-bottom:5mm; }
/* ⚠️ 여기 어느 줄에도 margin-top:auto 를 두지 말 것 — justify-content:center 와 만나면
   auto 마진이 남는 공간을 통째로 먹어 글이 위로 쏠리고 아래가 텅 빈다(2026-09-09에 그랬다). */
.bk-n { font-size:10.5pt; line-height:1.9; color:#3f4855; word-break:keep-all; }
/* 뒷표지의 두 칸 설명 — 오른쪽 쪽의 두 칸이 무엇을 받는지 이름 그대로 적는다.
   ⚠️ 「단락은 닿는 데까지」라고 밝혀 둔다 — 단락 칸은 발췌문 전체를 담지 못하므로,
      적다가 줄이 떨어지면 성도님이 「내가 잘못 쓰고 있나」 하고 멈추신다. */
.bk-how { margin-top:6mm; text-align:left; display:inline-block; }
.bk-how > div { display:flex; align-items:baseline; font-size:10pt; line-height:1.95;
                color:#3f4855; }
.bk-how b { font-family:var(--tf); font-weight:400; color:var(--navy);
            width:30mm; flex:none; }
.bk-rule { width:20mm; height:1px; background:var(--line); margin:8mm auto; }
.bk-s { font-size:9.5pt; line-height:1.8; color:var(--sub); word-break:keep-all; }
/* 뒷장 아래는 교회 마크만 — 글자를 넣지 않는다(2026-09-09 요청).
   ⚠️ 마크 파일이 없으면 교회 이름 글자로 대신한다(없다고 멈추지 않는다). */
.bk-f { margin-top:12mm; font-size:10pt; color:var(--sub); letter-spacing:.08em; }
/* 판 표기 — 쪽 맨 아래에 **아주 옅게**. 성도님이 읽을 글이 아니라, 인쇄본을 받아 들었을 때
   어느 판인지 가리는 표식이다(파일 이름과 같은 값).
   ⚠️ `position:absolute` 로 못박는다 — 흐름에 두면 가운데 정렬된 본문 덩어리를 아래로 밀어
      뒷표지 전체의 균형이 틀어진다. */
.bk-v { position:absolute; left:0; right:0; bottom:7mm; text-align:center;
        font-size:7pt; letter-spacing:.12em; color:#c2c8d2; }
.bk-mark { width:24mm; }

/* ── 목차 ───────────────────────────────────────────── */
.ix-h { text-align:center; margin-bottom:6mm; }
.ix-h .t { font-family:var(--tf); font-weight:400; font-size:17pt; color:var(--navy);
           letter-spacing:.06em; }
.ix-h .r { width:22mm; height:1px; background:var(--line); margin:3mm auto 0; }
.bk { margin-bottom:4.4mm; }
.bk-hd { display:flex; align-items:baseline; gap:2mm;
         border-bottom:.7px solid var(--line); padding-bottom:1.4mm; margin-bottom:1.8mm; }
.bk-hd .nm { font-family:var(--tf); font-weight:400; font-size:12.5pt; color:var(--navy); }
.bk-hd .au { font-size:9.5pt; color:var(--sub); }
.bk-hd .st { margin-left:auto; font-size:9.5pt; color:var(--gold); white-space:nowrap; }
.ep { display:flex; align-items:baseline; font-size:10.5pt; line-height:1.62;
      color:#2b3240; padding:.5mm 0; }
.ep { padding-left:5mm; }        /* 묶음 머리보다 한 칸 들여쓴다 */
.ep .nm { word-break:keep-all; }
.ep .dot { flex:1; border-bottom:1px dotted #cdd3dd; margin:0 1.6mm 1mm; min-width:4mm; }
.ep .dt { font-size:9.5pt; color:var(--sub); white-space:nowrap; }
.ep .pg { width:7mm; text-align:right; font-family:var(--tf); font-weight:400;
          color:var(--navy); white-space:nowrap; }
.ix-h.blank { visibility:hidden; }
.ix-note { margin-top:auto; font-size:9.5pt; line-height:1.75; color:var(--sub);
           background:#f5f7fa; border-radius:2mm; padding:3.4mm 4mm; word-break:keep-all; }
.ix-note b { font-family:var(--tf); font-weight:400; color:var(--navy); }

/* 원 안의 숫자 — 서체마다 ①(U+2460)이 있기도 없기도 해서 직접 그린다.
   ⚠️ Noto Serif KR 한글 서브셋에는 ①~⑨ 가 아예 없고, 전에 쓰던 빙그레체는 ❖ 처럼
      cmap 에만 있고 윤곽이 빈 글리프가 있었다. 그릴 수 있는 것을 서체에 맡기지 않는다. */
.cn { display:inline-block; box-sizing:border-box; width:1.5em; height:1.5em;
      line-height:1.42em; border:.09em solid currentColor; border-radius:50%;
      font-size:.62em; text-align:center; vertical-align:.22em;
      font-family:'BookKR',serif; letter-spacing:0; }
'''

# ── 쪽 만들기 ───────────────────────────────────────────────────────────


def foot(page_no, left_text, right_text):
    """꼬리말 — 쪽번호는 늘 바깥쪽(짝수쪽은 왼쪽, 홀수쪽은 오른쪽)에."""
    if page_no % 2 == 0:
        return ('<div class="ft"><span class="pno">%d</span><span>%s</span></div>'
                % (page_no, esc(right_text)))
    return ('<div class="ft"><span>%s</span><span class="pno">%d</span></div>'
            % (esc(left_text), page_no))


def page_classic(it, pno, body_pt):
    """짝수쪽 — 고전 발췌문 + 성경본문."""
    scr_pt = round(body_pt - 1.5, 2)
    ps = ''.join('<p>%s</p>' % esc(p) for p in it['excerpt'])
    sub = '<div class="t-sub">%s</div>' % esc(it['sub']) if it['sub'] else ''
    return '''<div class="page pL">
 <div class="hd"><b>%(day)d일</b> · %(date)s</div>
 <div class="t-wrap">
  <div class="t-main">%(title)s</div>%(sub)s
  <div class="t-au">%(author)s</div><div class="t-rule"></div>
 </div>
 <div class="body" style="font-size:%(bp)spt">%(ps)s</div>
 <div class="scr" style="font-size:%(sp)spt">
  <div class="scr-t">%(scr)s</div><div class="scr-r">%(ref)s</div>
 </div>
 %(ft)s
</div>''' % dict(day=it['day'], date=esc(it['date']), title=title_html(it), sub=sub,
                 author=esc(it['author']), bp=body_pt, sp=scr_pt, ps=ps,
                 scr=esc(it['scripture']), ref=esc(it['ref']),
                 ft=foot(pno, '', '기독교 고전 필사'))


def page_note(it, pno):
    """홀수쪽 — **왼쪽 쪽을 그대로 비춘다**(2026-09-09).

    왼쪽 위 고전 발췌문 → 오른쪽 위 「단락 따라 쓰기」
    왼쪽 아래 성경본문 상자 → 오른쪽 아래 「말씀 따라 쓰기」(같은 모양의 상자)

    ⚠️ 말씀 칸의 줄 수를 고정하지 않는다. 성경본문이 32자~175자로 5배 차이라
       고정하면 짧은 날은 줄이 남고 긴 날은 모자란다.
    ⚠️ 발췌문(176~262자)까지 다 옮겨 적을 줄을 주면 한 쪽에 27줄이 필요해 들어가지 않는다.
       그래서 **말씀 칸은 필요한 만큼, 단락 칸은 남는 만큼** 가져간다 — 왼쪽 쪽에서
       성경 상자가 아래에 붙고 발췌문이 위를 채우는 것과 같은 구조다.
    """
    if SCR_LINES:
        rows = SCR_LINES[ITEMS.index(it)]
    else:                                   # 못 쟀을 때의 되돌아갈 자리
        rows = -(-len(it['scripture']) // HAND_PER_LINE)
    rows = max(NOTE_MIN, min(NOTE_MAX, rows))
    ln = '<div class="ln"></div>'
    return '''<div class="page pR">
 <div class="pr-hd"><span class="lab">단락 따라 쓰기</span>
  <span class="pr-d"><b>%(day)d일</b> · %(date)s</span></div>
 <div class="lines grow">%(par)s</div>
 <div class="wbox">
  <div class="wb-hd"><span class="lab">말씀 따라 쓰기</span><span class="wb-r">%(ref)s</span></div>
  <div class="lines">%(scr)s</div>
 </div>
 %(ft)s
</div>''' % dict(day=it['day'], date=esc(it['date']), ref=esc(it['ref']),
                 par=ln * 20,        # 넉넉히 두면 칸에 맞는 수만 남는다
                 scr=ln * rows, ft=foot(pno, D['church'], ''))


def page_cover():
    """앞표지 — 흰 바탕에 교회 마크(2026-09-09).

    ⚠️ 마크 그림에 「고척교회」 글자가 이미 들어 있어 교회 이름을 따로 쓰지 않는다.
    """
    t = D['title']
    head, tail = t.split('함께하는')          # 뒷말(전교인 필사)을 금색으로
    logo = ('<img class="cv-logo" src="%s" alt="고척교회">' % LOGO) if LOGO else            ('<div class="cv-p">%s</div>' % esc(D['church']))
    return '''<div class="page cover">
 %s
 <div class="cv-rule"></div>
 <div class="cv-t">%s함께하는<br><em>%s</em></div>
 <div class="cv-p">%s</div>
 <div class="cv-v">새벽마다 기독교 고전 한 대목과 말씀 한 절을<br>
  손으로 옮겨 적으며 마음에 새깁니다.</div>
</div>''' % (logo, esc(head), esc(tail.strip()), esc(D['period']))


def page_back(pno):
    """뒷표지.

    ⚠️ 성도님께 하는 말이 먼저고, ※(담당자가 어떻게 만드는지)는 그 아래 작게 둔다 —
       손에 쥔 분이 알아야 할 것은 「어떻게 쓰나」이지 「어떻게 만들었나」가 아니다.
    ⚠️ 표지·뒷표지에는 쪽번호를 넣지 않는다.
    """
    books = len({i['book'] for i in ITEMS})
    # 아래에는 교회 마크만 — 글자를 넣지 않는다(2026-09-09 요청).
    mark = ('<img class="bk-mark" src="%s" alt="고척교회">' % LOGO) if LOGO else esc(D['church'])
    return '''<div class="page back">
 <div class="bk-t">이렇게 쓰입니다</div>
 <div class="bk-n">왼쪽 쪽에서 그날의 고전 한 대목과 말씀을 읽고,<br>
  오른쪽 쪽에 손으로 옮겨 적습니다.</div>
 <div class="bk-how">
  <div><b>단락 따라 쓰기</b>고전에서 마음에 닿는 데까지</div>
  <div><b>말씀 따라 쓰기</b>그날의 성경 말씀을 온전히</div>
 </div>
 <div class="bk-rule"></div>
 <div class="bk-s">기독교 고전 %d권에서 %d대목을 골라 엮었습니다.<br>
  새벽기도 설교도 그날의 성경본문으로 이어집니다.</div>
 <div class="bk-f">%s</div>
 <div class="bk-v">%s</div>
</div>''' % (books, len(ITEMS), mark, esc(BOOK_VER + ' · 줄 %.1fmm' % LINE_MM))


def index_pages(items, start_pno):
    """목차 두 쪽 — 고전 9권으로 묶는다.

    ⚠️ 원본 27행 표를 그대로 옮기면 한 줄이 40자가 넘어 글씨가 9pt 아래로 내려간다.
       저자·담당자를 묶음 머리에 한 번만 쓰면 아래 줄이 짧아져 글씨를 키울 수 있다.
    """
    by_no = {i['no']: i for i in items}
    books, seen = [], set()
    for it in items:
        if it['book'] not in seen:
            seen.add(it['book'])
            books.append({'book': it['book'], 'author': it['author'],
                          'staff': it['staff'], 'eps': []})
        books[-1]['eps'].append(it)

    def block(b):
        # 편 이름은 **「참된 목자 1」 꼴**로 쓴다(2026-09-09 요청).
        #   한때 성경본문 출처(로마서 6:23)를 넣었으나, 차례에서 찾는 것은 「몇 번째 편인가」다.
        #   ⚠️ 소제목(천로역정·고백록 등)이 있으면 그것이 이긴다 — 그 편에서만 알 수 있는
        #      정보이고, 「천로역정 1」보다 「내가 진리의 길을 걷는다」가 훨씬 잘 가린다.
        eps = ''.join(
            '<div class="ep"><span class="nm">%s</span>'
            '<span class="dot"></span><span class="dt">%s</span>'
            '<span class="pg">%d</span></div>'
            % (esc(e['sub'] or '%s %d' % (e['book'], CIRCLED.find(e['mark']) + 1)),
               esc(e['date']), e['page'])
            for e in b['eps'])
        return ('<div class="bk"><div class="bk-hd"><span class="nm">%s</span>'
                '<span class="au">%s</span><span class="st">%s</span></div>%s</div>'
                % (esc(b['book']), esc(b['author']), esc(b['staff']), eps))

    # 줄 수(묶음머리 + 편)가 반씩 되게 가른다
    weights = [1 + len(b['eps']) for b in books]
    half, run, cut = sum(weights) / 2.0, 0, len(books)
    for i, w in enumerate(weights):
        run += w
        if run >= half:
            cut = i + 1
            break

    head = '<div class="ix-h"><div class="t">차 례</div><div class="r"></div></div>'
    # ⚠️ 펼침면 오른쪽에 「차 례」를 또 쓰지 않는다 — 한 화면에 같은 제목이 두 번 보인다.
    #    대신 같은 것을 visibility:hidden 으로 두어 **두 쪽의 목록이 같은 높이에서 시작**하게 한다
    #    (빈 상자를 손으로 어림하면 제목 크기를 바꿀 때마다 어긋난다).
    head_blank = head.replace('class="ix-h"', 'class="ix-h blank"')
    # 차례 아래 상자 — **고전 출처 표기만** 둔다(2026-09-11 성도님 최종 결정).
    #   고전이 없는 이레(월삭·특별새벽기도회) 안내는 함께 두었다가 빼기로 하셨다.
    #   그 값(`skipped`·`skipped_staff`)은 `classics.json` 에 그대로 있으니 되살리기 쉽다.
    # ⚠️ 글은 코드에 박지 않는다 — `classics.json` 의 `source_note` 를 읽는다.
    note = '<div class="ix-note">%s</div>' % esc(D.get('source_note', ''))
    p1 = '<div class="page pL">%s%s%s</div>' % (
        head, ''.join(block(b) for b in books[:cut]), foot(start_pno, '', '차례'))
    p2 = '<div class="page pR">%s%s%s</div>' % (
        head_blank, ''.join(block(b) for b in books[cut:]) + note,
        foot(start_pno + 1, D['church'], ''))
    return p1 + p2


def build(body_pt, measure=False):
    """44쪽을 짓는다. p1 표지 · p2|p3 차례 · p4~ 본문 · 마지막 뒷표지."""
    for k, it in enumerate(ITEMS):
        it['page'] = 4 + 2 * k              # 그 편의 고전 쪽 번호(차례가 가리키는 곳)

    out = [page_cover()]
    out.append(index_pages(ITEMS, 2))
    pno = 4
    for it in ITEMS:
        out.append(page_classic(it, pno, body_pt))
        out.append(page_note(it, pno + 1))
        pno += 2
    out.append(page_back(pno))              # 짝수쪽 = 펼침면 왼쪽. 44쪽이 되도록 아래에서 맞춘다

    total = len(ITEMS) * 2 + 4
    # ⚠️ 중철은 쪽수가 4의 배수라야 한다 — 모자라면 빈 쪽으로 채운다.
    while total % 4:
        out.insert(-1, '<div class="page pR">%s</div>' % foot(total, D['church'], ''))
        total += 1

    probe = ''
    if measure:
        # ⚠️ 서체가 준비되기 전에 재면 대체 서체 기준이라 값이 틀린다 — fonts.ready 를 기다린다.
        probe = '''<script>
document.fonts.ready.then(function(){
  var bad=[];
  document.querySelectorAll('.page').forEach(function(p,i){
    if(p.scrollHeight-p.clientHeight>1) bad.push(i+1);
  });
  document.title='FIT|'+bad.join(',');
});
</script>'''

    return ('<!doctype html><html lang="ko"><meta charset="utf-8">'
            '<title>%s</title><style>%s%s</style><body>%s%s</body></html>'
            % (esc(D['title']), CSS.replace('__LINE__', '%g' % LINE_MM),
               CSS_HEAD, ''.join(out), probe))


# ── 넘치는지 재기 ───────────────────────────────────────────────────────
def measure(body_pt):
    """크롬을 돌려 넘치는 쪽을 센다. 없으면 빈 목록."""
    chrome = find_chrome()
    if not chrome:
        return None
    tmp = '_fit.html'
    io.open(tmp, 'w', encoding='utf-8').write(build(body_pt, measure=True))
    r = subprocess.run([chrome, '--headless', '--disable-gpu', '--dump-dom',
                        '--virtual-time-budget=20000',
                        'file:///' + os.path.abspath(tmp).replace(os.sep, '/')],
                       capture_output=True)
    dom = r.stdout.decode('utf-8', 'replace')
    os.remove(tmp)
    m = re.search(r'<title>FIT\|([^<]*)</title>', dom)
    if not m:
        return None
    s = m.group(1).strip()
    return [int(x) for x in s.split(',') if x]


def fit():
    """들어가는 가장 큰 글씨를 찾는다 — 0.5pt 씩 내려가며."""
    print('  넘침을 재며 가장 큰 글씨를 찾습니다 (한 번에 3초쯤)\n')
    for pt in [x / 2.0 for x in range(36, 21, -1)]:       # 18.0 → 11.0
        bad = measure(pt)
        if bad is None:
            print('  !! 크롬으로 잴 수 없습니다.')
            return None
        if bad:
            print('   %4.1fpt  넘침 %d쪽 %s' % (pt, len(bad), bad[:8]))
        else:
            print('   %4.1fpt  넘침 없음  ← 이 값을 쓰세요' % pt)
            return pt
    return None


def measure_scr_lines(body_pt):
    """왼쪽 고전 쪽에서 **성경본문이 몇 줄로 찍히는지** 브라우저에 물어본다.

    ⚠️ Range 의 `getClientRects()` 는 줄 상자마다 하나씩 준다 — 폭이 0 인 것이 섞이므로 거른다.
    ⚠️ 서체가 오기 전에 재면 대체 서체 기준이라 값이 틀린다(`document.fonts.ready`).
    """
    chrome = find_chrome()
    if not chrome:
        return None
    probe = """<script>
document.fonts.ready.then(function(){
  var out=[];
  document.querySelectorAll('.scr-t').forEach(function(el){
    var r=document.createRange(); r.selectNodeContents(el);
    var n=0;
    Array.prototype.forEach.call(r.getClientRects(), function(c){ if(c.width>1) n++; });
    out.push(n);
  });
  document.title='SCR|'+out.join(',');
});
</script>"""
    tmp = '_scr.html'
    io.open(tmp, 'w', encoding='utf-8').write(
        build(body_pt).replace('</body>', probe + '</body>'))
    r = subprocess.run([chrome, '--headless', '--disable-gpu', '--dump-dom',
                        '--virtual-time-budget=20000',
                        'file:///' + os.path.abspath(tmp).replace(os.sep, '/')],
                       capture_output=True)
    os.remove(tmp)
    m = re.search(r'<title>SCR\|([^<]*)</title>', r.stdout.decode('utf-8', 'replace'))
    if not m:
        return None
    got = [int(x) for x in m.group(1).split(',') if x]
    return got if len(got) == len(ITEMS) else None


def count_lines():
    """노트 쪽에 줄이 실제로 몇 개씩 그려졌는지 **브라우저에 물어본다.**

    ⚠️ 손으로 계산하지 않는다 — 라벨 높이·여백이 조금만 달라져도 어긋난다.
       단락 칸은 넘치는 줄을 잘라 내므로 `overflow` 밖으로 나간 줄은 빼고 센다.
    """
    chrome = find_chrome()
    if not chrome:
        print('   !! 크롬을 못 찾아 잴 수 없습니다.')
        return
    probe = """<script>
document.fonts.ready.then(function(){
  var out=[];
  // ⚠️ 차례 쪽도 .pR 이다 — 말씀 상자를 가진 쪽만 노트 쪽이다(안 그러면 한 칸씩 밀린다)
  document.querySelectorAll('.page.pR').forEach(function(p){
    if(!p.querySelector('.wbox')) return;
    var par=0, scr=0;
    p.querySelectorAll('.lines.grow .ln').forEach(function(l){
      // 아래 테두리가 칸 안에 있어야 실제로 그려진 줄이다
      if(l.getBoundingClientRect().bottom <= l.parentNode.getBoundingClientRect().bottom+0.5) par++;
    });
    scr = p.querySelectorAll('.wbox .ln').length;
    out.push(par+'/'+scr);
  });
  document.title='LINES|'+out.join(',');
});
</script>"""
    tmp = '_lines.html'
    io.open(tmp, 'w', encoding='utf-8').write(
        build(BODY_PT or FITTED_PT).replace('</body>', probe + '</body>'))
    r = subprocess.run([chrome, '--headless', '--disable-gpu', '--dump-dom',
                        '--virtual-time-budget=20000',
                        'file:///' + os.path.abspath(tmp).replace(os.sep, '/')],
                       capture_output=True)
    os.remove(tmp)
    m = re.search(r'<title>LINES\|([^<]*)</title>', r.stdout.decode('utf-8', 'replace'))
    if not m:
        print('   !! 잴 수 없습니다.')
        return
    pairs = [x.split('/') for x in m.group(1).split(',') if x]
    print('  줄 간격 %gmm · 한 줄에 약 %d자 · 말씀 칸 %d~%d줄\n'
          % (LINE_MM, HAND_PER_LINE, NOTE_MIN, NOTE_MAX))
    print('  %-3s %-22s %6s %6s %6s   %s' % ('#', '편', '단락', '말씀', '합', '단락에 담기는 양'))
    print('  ' + '-' * 76)
    worst = 99
    for it, (par, scr) in zip(ITEMS, pairs):
        par, scr = int(par), int(scr)
        worst = min(worst, par)
        ex = sum(len(x) for x in it['excerpt'])
        print('  %-3d %-22s %6d %6d %6d   %d자 중 약 %d자'
              % (it['no'], it['title'][:22], par, scr, par + scr, ex, par * HAND_PER_LINE))
    print('  ' + '-' * 76)
    print('  단락 칸 최소 %d줄' % worst)
    if worst < 5:
        print('  !! 단락 칸이 너무 얕습니다 — NOTE_MAX 를 낮추세요(말씀 칸 상한이 곧 단락의 바닥).')


# ── 중철 배치 ───────────────────────────────────────────────────────────
def impose(src_pdf, dst_pdf):
    """A5 순서판 → A4 가로 중철 배치판.

    11장을 포개 반 접으므로 한 장의 앞면은 (마지막쪽 | 첫쪽), 뒷면은 (둘째쪽 | 끝에서둘째쪽).
    ⚠️ 이 순서를 틀리면 접었을 때 쪽이 뒤죽박죽이 된다 — 반드시 한 부 뽑아 접어 볼 것.
    """
    try:
        from pypdf import PdfReader, PdfWriter, PageObject, Transformation
    except ImportError:
        print('   !! pypdf 가 없어 중철 배치는 건너뜁니다 —  pip install pypdf')
        return False

    rd = PdfReader(src_pdf)
    n = len(rd.pages)
    if n % 4:
        print('   !! %d쪽은 4의 배수가 아니라 중철로 접을 수 없습니다.' % n)
        return False

    W5, H5 = 148 * 72 / 25.4, 210 * 72 / 25.4      # A5 세로
    W4, H4 = 297 * 72 / 25.4, 210 * 72 / 25.4      # A4 가로
    gap = (W4 - 2 * W5) / 2                        # 2×148=296 ≠ 297 — 1mm 를 좌우로 나눈다

    wr = PdfWriter()
    for i in range(n // 4):
        for left, right in ((n - 2 * i, 1 + 2 * i), (2 + 2 * i, n - 1 - 2 * i)):
            sheet = PageObject.create_blank_page(width=W4, height=H4)
            for pg, x in ((left, gap), (right, gap + W5)):
                sheet.merge_transformed_page(rd.pages[pg - 1],
                                             Transformation().translate(tx=x, ty=0))
            wr.add_page(sheet)
    with open(dst_pdf, 'wb') as f:
        wr.write(f)
    return True


# ── 돌리기 ──────────────────────────────────────────────────────────────
if LINES_MODE:
    count_lines()
    sys.exit(0)

if FIT_MODE:
    got = fit()
    if got and abs(got - FITTED_PT) > 1e-6:
        print('\n  → generate_classics.py 의 FITTED_PT 를 %.1f 로 고치세요.' % got)
    sys.exit(0)

PT = BODY_PT or FITTED_PT

# ⚠️ **두 번 그린다.** 첫 판으로 「성경본문이 몇 줄로 찍히는지」를 재고, 그 줄 수를
#    말씀 칸에 주어 다시 그린다. 왼쪽 쪽은 말씀 칸과 무관하므로 첫 판의 값이 그대로 맞다.
SCR_LINES = measure_scr_lines(PT)
if SCR_LINES is None:
    print('   !! 성경본문 줄 수를 재지 못해 자수 어림으로 갑니다(칸이 한두 줄 어긋날 수 있습니다).')

OUT_NAME = arg_val('--out', '기독교고전_전교인필사_A5_%.1f(%s)' % (LINE_MM, BOOK_VER))
html_path = OUT_NAME + '.html'
io.open(html_path, 'w', encoding='utf-8').write(build(PT))
pages = len(ITEMS) * 2 + 4
pages += (-pages) % 4
print('  %s  (%d쪽 · 본문 %.1fpt · 줄 %gmm(한 줄 %d자) · 말씀 칸 최대 %d줄 · A4 %d장 중철)'
      % (html_path, pages, PT, LINE_MM, HAND_PER_LINE, NOTE_MAX, pages // 4))

if MAKE_PDF or MAKE_BOOKLET:
    pdf_path = OUT_NAME + '.pdf'
    if to_pdf(html_path, pdf_path):
        print('  %s  ← A5 순서판 (인쇄소·화면 검토용)' % pdf_path)
        if MAKE_BOOKLET:
            bk = OUT_NAME + '_중철A4.pdf'
            if impose(pdf_path, bk):
                print('  %s  ← A4 가로 %d면 (양면 인쇄 → 반 접기 → 가운데 스테이플)'
                      % (bk, pages // 2))
