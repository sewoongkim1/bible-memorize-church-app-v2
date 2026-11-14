# -*- coding: utf-8 -*-
"""성경 필사노트(가로형) — 아래쪽 필사형(받아쓰기 꼴). 원문 한 줄 아래에 빈 필사줄 한 줄.

사용법:
    cd bible-note
    PYTHONIOENCODING=utf-8 python dictation.py 잠언              # → 잠언_받아쓰기.html
    PYTHONIOENCODING=utf-8 python dictation.py 잠언 --chapter 1  # → 잠언_1장_받아쓰기.html
    (화면에서 고르려면 python ui.py — 설정은 notebook.py 가 이 파일 맨 위 값을 바꿔 넣는다)

generate.py(오른쪽 필사형 — 왼쪽 원문 / 오른쪽 필사줄)와 다른 점:
  - 절을 이어 쓴다(절 번호는 위첨자 「1)」). 문단은 장이 바뀌거나 소제목이 나올 때 새로 연다.
  - 원문 줄마다 바로 아래에 같은 폭의 빈 줄을 둔다 — 보고 그대로 받아쓴다.

⚠️ 줄바꿈은 눈대중이 아니라 헤드리스 크롬 실측이다(generate.py 와 같은 이유). 1차로 문단을
   통째로 그려 「어느 글자에서 줄이 바뀌는지」를 물어보고, 2차는 그 줄을 한 줄씩 못박아
   (white-space:nowrap) 그린다. 1차·2차의 글자 크기·자간·폭·서체는 text_css() 한 곳에서 나온다.
⚠️ 1차에는 본문 서체 하나만 싣는다 — 쓰이지 않는 서체는 unloaded 로 남아 실측이 서체 실패로 멈춘다.
⚠️ 만든 HTML 에는 성경 본문이 그대로 들어 있다 — 커밋 금지(generate.ensure_out_path_safe 가 막는다).
"""
import argparse
import io
import os
import pathlib
import re
import shutil
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from parse import parse_book, load_book_file, SourceTextError
import render as R
from render import esc, _mm, chapter_mark, chapter_unit, font_format, FontSettingError
import generate as G

# ── 사람이 고치는 설정(화면 ui.py 에서는 notebook.py 가 바꿔 넣는다) ─────────
FONT_PT = 16          # 원문 글자 크기
LETTER_SPACING_EM = 0  # 원문 글자 간격(자간)
TEXT_MM = 9.5         # 원문 한 줄 높이
WRITE_MM = 10.5       # 그 아래 필사줄 높이(밑줄 포함)
HEAD_MM = 9           # 「1 장」 · 소제목 한 줄 높이
HEAD_PT = 13          # 「1 장」 · 소제목 글자 크기
HEADER_MM = 14        # 머리글(책·절 범위 · 날짜) 높이
HEADER_PT = 19
DATE_PT = 13
SHOW_DATE = True      # 머리글 날짜 칸
DATE_PREFIX = '202'   # 날짜 칸 앞에 미리 찍는 글자(비우려면 '')
PARA_MARK = '○'  # 문단 첫머리 ○ (비우려면 '')
JUSTIFY = True        # 줄마다 오른쪽 끝을 맞춘다(문단 마지막 줄은 그대로)
KEEP_WORDS = False    # True 면 낱말 가운데서 줄을 바꾸지 않는다(한글 · 영어는 늘 낱말 단위)
CHAP_SUB_INLINE = True  # 장이 시작하는 자리의 소제목을 「1 장」 오른쪽 같은 줄에
VERSE_BREAK = False   # True 면 절마다 줄을 바꾼다(False = 이어 쓴다)
TEXT_COLOR = '#111'   # 원문 글자 색(회색으로 하면 내 글씨가 돋보인다)
BIND_TOP_MM = 0       # 제본 여백 — 위쪽에 더
BIND_LEFT_MM = 0      # 제본 여백 — 왼쪽에 더
BODY_FONT = 'fonts/NotoSerifKR-400.woff'
BOLD_FONT = 'fonts/NotoSerifKR-700.woff'   # 머리글 날짜 · 장 표시 · 소제목
HEADER_FONT = ''      # 머리글(책·절 범위) — 비우면 본문 서체
FOOTER_FONT = ''      # 바닥글 — 비우면 본문 서체
# 바닥글을 소제목과 같은 글씨로(크기 HEAD_PT · 굵은 서체 · 검정) — 오른쪽 필사형(render.FOOTER_LIKE_SUBTITLE)을 따른다.
# False 면 render.FOOTER_PT · 본문 서체 · 회색. FOOTER_FONT 를 넣으면 서체는 그것이 이긴다.
FOOTER_LIKE_SUB = getattr(R, 'FOOTER_LIKE_SUBTITLE', False)


def body_mm():
    return R.PAGE_H_MM - 2 * R.MARGIN_MM - HEADER_MM - R.FOOTER_MM - BIND_TOP_MM


def width_mm():
    return R.PAGE_W_MM - 2 * R.MARGIN_MM - BIND_LEFT_MM


def _face(family, path):
    return ("@font-face { font-family:'%s'; src:url('%s') format('%s'); font-weight:400;"
            " font-display:block; }\n" % (family, path, font_format(path)))


def fonts_used():
    """이 꼴이 부르는 서체 파일들(겹치지 않게)."""
    out = []
    for p in (BODY_FONT, BOLD_FONT, HEADER_FONT, FOOTER_FONT):
        if p and p not in out:
            out.append(p)
    return out


def text_css(lang='ko', bold=True):
    """1차(실측)·2차(인쇄)가 함께 쓰는 규칙 — 줄바꿈을 정하는 것은 모두 여기(본문 줄 · 머리 칸).

    ⚠️ 머리 칸(.hx — 권 제목 · 장 표시 · 소제목)도 1차에서 잰다. 시편 표제처럼 한 줄에 안 들어가는 소제목이
       있다(시 18편 「여호와의 종 다윗의 시, … 아뢰어 이르되」) — 늘 한 줄로 치면 인쇄에서 오른쪽이 잘렸다
       (2026-11-14 시편 전체에서 세 쪽 · 자체 확인이 잡음).
    bold=False 면 굵은 서체(NSKB)를 싣지 않는다 — 쓰는 칸이 하나도 없으면 unloaded 로 남아 서체 실패로 멈춘다.
    """
    faces = _face('NSK', BODY_FONT) + (_face('NSKB', BOLD_FONT) if bold else '')
    return faces + """
* { box-sizing:border-box; }
html, body { margin:0; }
body { font-family:'NSK',serif; color:#111; }
.tx { width:%(w)smm; margin:0; font-size:%(pt)spt; line-height:%(lh)smm; color:%(color)s;
      letter-spacing:%(ls)sem; word-break:%(wb)s; text-align:left; hyphens:none; }
.tx sup { font-size:.58em; line-height:0; vertical-align:baseline; position:relative; top:-.62em;
          letter-spacing:0; }
.tx .nb { white-space:nowrap; }
.hx { width:%(w)smm; margin:0; font-size:%(hpt)spt; line-height:%(hmm)smm; font-family:'NSKB',serif;
      color:#111; word-break:keep-all; overflow:hidden; }
.hx.head { text-align:center; }
.hx .cs { margin-left:8mm; }
""" % {'w': _mm(width_mm()), 'pt': _mm(FONT_PT), 'lh': _mm(TEXT_MM), 'ls': _mm(LETTER_SPACING_EM),
       'color': TEXT_COLOR, 'wb': 'keep-all' if (KEEP_WORDS and lang != 'en') else 'normal',
       'hpt': _mm(HEAD_PT), 'hmm': _mm(HEAD_MM)}


def head_blocks(p):
    """문단 위 머리 칸들 — [(역할, html)]. 장이 시작하는 자리의 소제목은 CHAP_SUB_INLINE 이면 「1 장」 옆에 붙인다.
    1차(실측)·2차(인쇄)가 이 함수 하나를 같이 쓴다(칸 수 · 차례 · 글이 같아야 잰 줄 수가 맞는다)."""
    heads = list(p['heads'])
    d = dict(heads)
    inline = CHAP_SUB_INLINE and 'chap' in d and 'sub' in d
    out = []
    for role, text in heads:
        if inline and role == 'sub':
            continue
        if inline and role == 'chap':
            out.append(('chap', '%s<span class="cs">%s</span>' % (esc(text), esc(d['sub']))))
        else:
            out.append((role, esc(text)))
    return out


def _lang(pieces):
    return 'en' if pieces and pieces[0].get('lang') == 'en' else 'ko'


# ── 문단 · 토큰 ───────────────────────────────────────────────────────
def _chap_text(v):
    t = chapter_mark(v)
    return t if v.get('lang') == 'en' else t.replace('장', ' 장').replace('편', ' 편')


def build_paragraphs(pieces):
    """조각들 → 문단 목록. 문단 = {'heads': [(역할, 글)], 'tokens': [...]}.

    토큰 = {'html': 그릴 글(글자 하나, 절 첫 글자는 위첨자 번호와 한 덩이), 'space': 빈칸인가,
            'ch','vs','ve': 그 글자가 속한 장 · 절 · (합쳐진 절의) 끝 절}.
    장이 바뀌거나 권 제목 · 소제목이 있으면 새 문단(VERSE_BREAK 면 절마다). ○ 는 앞의 것에만.
    """
    paras = []
    for v in pieces:
        heads = []
        if v.get('heading'):
            heads.append(('head', v['heading']))
        if v.get('chapter_start'):
            heads.append(('chap', _chap_text(v)))
        if v.get('subtitle'):
            heads.append(('sub', v['subtitle']))
        real_start = bool(heads) or not paras
        if real_start or VERSE_BREAK:
            paras.append({'heads': heads, 'tokens': []})
        toks = paras[-1]['tokens']
        # 공백 여럿 · 탭은 한 칸으로 — 1차(white-space:normal)는 접어서 재고, 끝 맞춤 칸(pre)은 다 그려 줄이 넘쳤다(검토 dc-1).
        body = re.sub(r'\s+', ' ', v['body']).strip()
        if not body:
            continue
        label = v['label'] if 'label' in v else str(v['verse'])
        lead = ''
        if not toks and PARA_MARK and real_start:
            lead += esc(PARA_MARK)
        if label:   # 한글은 「1)」, 영어는 인쇄된 NIV 처럼 「1」
            lead += ('<sup>%s</sup>' if v.get('lang') == 'en' else '<sup>%s)</sup>') % esc(label)
        info = {'ch': v['chapter'], 'vs': v['verse'], 've': v.get('verse_end') or v['verse']}
        if toks:
            toks.append(dict(info, html=' ', space=True))
        for i, c in enumerate(body):
            if i == 0 and lead:
                toks.append(dict(info, html='<span class="nb">%s%s</span>' % (lead, esc(c)), space=False))
            else:
                toks.append(dict(info, html=esc(c), space=c == ' '))
    out, carry = [], []
    for p in paras:           # 본문이 빈 문단의 머리 칸은 다음 문단으로 넘긴다
        if p['tokens']:
            p['heads'] = carry + p['heads']
            carry = []
            out.append(p)
        else:
            carry += p['heads']
    return out


def build_draft_html(paras, lang='ko'):
    parts = []
    has_heads = False
    for pi, p in enumerate(paras):
        for hi, (role, html) in enumerate(head_blocks(p)):
            has_heads = True
            parts.append('<div class="hx %s" data-p="%d" data-h="%d">%s</div>' % (role, pi, hi, html))
        spans = ''.join('<span class="t">%s</span>' % t['html'] for t in p['tokens'])
        parts.append('<p class="tx" data-p="%d">%s</p>' % (pi, spans))
    return ('<!doctype html><html lang="%s"><head><meta charset="utf-8"><style>%s</style></head>'
            '<body>%s</body></html>' % (lang, text_css(lang, bold=has_heads), ''.join(parts)))


# 문단마다 「줄이 새로 시작되는 토큰 번호」를, 머리 칸마다 줄 수를 돌려받는다 —
# `BREAKS|문단:줄 수:0,48,97;…|문단.칸:줄 수;…`
PROBE = """<script>
document.fonts.ready.then(function(){
  var bad = false;
  document.fonts.forEach(function(f){ if (f.status !== 'loaded') bad = true; });
  if (bad) { document.title = 'BREAKS|FONTFAIL'; return; }
  var out = [];
  document.querySelectorAll('p.tx').forEach(function(p){
    var lh = parseFloat(getComputedStyle(p).lineHeight), top0 = p.getBoundingClientRect().top;
    var starts = [], last = -1, ts = p.querySelectorAll(':scope > span.t');
    for (var i = 0; i < ts.length; i++) {
      var r = ts[i].getBoundingClientRect();
      var ln = Math.floor((r.top + r.height / 2 - top0) / lh);
      if (ln !== last) { starts.push(i); last = ln; }
    }
    var total = Math.round(p.getBoundingClientRect().height / lh);
    out.push(p.dataset.p + ':' + total + ':' + starts.join(','));
  });
  var heads = [];
  document.querySelectorAll('.hx[data-h]').forEach(function(h){
    var lh = parseFloat(getComputedStyle(h).lineHeight);
    heads.push(h.dataset.p + '.' + h.dataset.h + ':' + Math.round(h.getBoundingClientRect().height / lh));
  });
  document.title = 'BREAKS|' + out.join(';') + '|' + heads.join(';');
});
</script>"""


def measure_breaks(paras, chrome, lang='ko'):
    """본문 줄바꿈만 — {문단 번호: [줄이 시작되는 토큰 번호]}.
    ⚠️ 옛 모양 그대로 둔다 — dictation_enko.py(다른 세션 · 영한 받아쓰기)가 이 이름 · 이 모양으로 부른다.
    머리 칸 줄 수까지 받으려면 measure()."""
    return measure(paras, chrome, lang)[0]


def measure(paras, chrome, lang='ko'):
    """1차 실측 한 번 — (본문 줄바꿈 {문단: [토큰 번호]}, 머리 칸 줄 수 {(문단, 칸): 줄 수})."""
    draft = G._temp_in(os.getcwd(), '_dict_draft_', '.html')
    try:
        with io.open(draft, 'w', encoding='utf-8') as f:
            f.write(build_draft_html(paras, lang).replace('</body>', PROBE + '</body>'))
        r = G._chrome(chrome, ['--dump-dom', '--virtual-time-budget=30000'], draft)
    finally:
        G._remove_temp(draft)
    m = re.search(r'<title>BREAKS\|([^<]*)</title>', r.stdout.decode('utf-8', 'replace'))
    if not m:
        raise SystemExit('!! 줄바꿈을 재지 못했습니다 — 다시 돌려 보세요')
    if m.group(1) == 'FONTFAIL':
        raise SystemExit('!! 서체가 불리지 않아 줄 수를 잴 수 없습니다 — fonts/ 를 확인하세요')
    body_part, _sep, head_part = m.group(1).partition('|')
    result = {}
    for item in body_part.split(';'):
        pi, total, starts = item.split(':')
        starts = [int(x) for x in starts.split(',')]
        if len(starts) != int(total):
            # 줄 수(높이 ÷ 줄 높이)와 글자 위치로 센 줄 수가 다르면 틀린 채 찍느니 멈춘다.
            raise SystemExit('!! 문단 %s 의 줄 수가 맞지 않습니다(높이 %s줄 · 글자 위치 %d줄)'
                             % (pi, total, len(starts)))
        result[int(pi)] = starts
    if len(result) != len(paras):
        raise SystemExit('!! 문단 %d개 가운데 %d개만 쟀습니다' % (len(paras), len(result)))
    heads = {}
    for item in filter(None, head_part.split(';')):
        key, n = item.split(':')
        pi, hi = key.split('.')
        heads[(int(pi), int(hi))] = int(n)
    want = sum(len(head_blocks(p)) for p in paras)
    if len(heads) != want or any(n < 1 for n in heads.values()):
        raise SystemExit('!! 머리 칸(장 표시 · 소제목) %d개 가운데 %d개만 쟀습니다' % (want, len(heads)))
    return result, heads


# ── 쪽 나누기 ─────────────────────────────────────────────────────────
def _line_html(toks, justify, lang):
    if not justify or len(toks) < 2:
        return ''.join(t['html'] for t in toks)
    if lang == 'en':
        # 영어는 낱말 사이만 벌린다 — 낱말을 한 칸씩.
        words, cur = [], ''
        for t in toks:
            if t['space']:
                if cur:
                    words.append(cur)
                cur = ''
            else:
                cur += t['html']
        if cur:
            words.append(cur)
        if len(words) < 2:
            return ''.join(t['html'] for t in toks)
        cells = words
    else:
        cells = [t['html'] for t in toks]   # 한글은 글자 사이를 고르게
    return '<div class="jl">%s</div>' % ''.join('<span>%s</span>' % c for c in cells)


def build_items(paras, breaks, lang='ko', heads=None):
    """그릴 줄들을 차례대로 — 머리 칸 {'kind': head|chap|sub} 또는 본문 줄 {'kind': 'line'}.
    머리 칸 높이는 1차에서 잰 줄 수(heads — measure() 의 둘째 값) × HEAD_MM(긴 시편 표제는 두 줄 이상).
    heads 가 없으면(옛 부름 — dictation_enko.py) 한 줄로 친다 — 넘치면 check_final 이 HIGH 로 멈춘다."""
    items = []
    for pi, p in enumerate(paras):
        for hi, (role, html) in enumerate(head_blocks(p)):
            n = heads[(pi, hi)] if heads is not None else 1
            items.append({'kind': role, 'html': html, 'mm': HEAD_MM * n})
        starts = breaks[pi] + [len(p['tokens'])]
        for a, b in zip(starts, starts[1:]):
            is_last = b == len(p['tokens'])
            toks = p['tokens'][a:b]
            while toks and toks[-1]['space']:
                toks = toks[:-1]
            while toks and toks[0]['space']:
                toks = toks[1:]
            # 이어진 빈칸은 하나만 — 두 칸 띄어쓰기(누가복음 20:42)를 1차는 한 칸 폭으로 재는데 끝 맞춤 칸은 둘 다 폭을
            # 차지해 줄이 넘쳤다(검토 dc-1). 토큰을 따로 짜는 dictation_enko 도 여기를 지난다.
            toks = [t for i, t in enumerate(toks) if not (t['space'] and i and toks[i - 1]['space'])]
            if not toks:
                continue
            items.append({'kind': 'line', 'html': _line_html(toks, JUSTIFY and not is_last, lang),
                          'first': toks[0], 'last': toks[-1], 'mm': TEXT_MM + WRITE_MM})
    return items


def paginate_items(items, cap_mm):
    """머리 칸(장 표시 · 소제목)은 바로 다음 본문 줄과 같은 쪽에 둔다."""
    blocks, cur = [], []
    for it in items:
        cur.append(it)
        if it['kind'] == 'line':
            blocks.append(cur)
            cur = []
    if cur:
        raise SystemExit('!! 본문 없이 끝나는 소제목이 있습니다')
    pages, page, used = [], [], 0.0
    for blk in blocks:
        need = sum(it['mm'] for it in blk)
        if need > cap_mm:
            raise SystemExit('!! 한 쪽에 한 줄도 들어가지 않습니다 — 줄 높이나 여백을 줄여 주세요')
        if page and used + need > cap_mm + 1e-6:
            pages.append(page)
            page, used = [], 0.0
        page.extend(blk)
        used += need
    if page:
        pages.append(page)
    return pages


# ── 2차(인쇄) ─────────────────────────────────────────────────────────
def footer_has_text(total=None):
    """바닥글에 한 글자라도 찍히는 쪽이 있나 — total 이 없으면(옛 부름) 홀 · 짝 두 쪽으로 본다."""
    return R.footer_has_text(total if total else 2)


def page_css(total=None):
    """2차(인쇄) 쪽 규칙. total(전체 쪽 수)을 주면 바닥글에 글이 하나도 안 찍힐 때 바닥글 서체를 싣지 않는다 —
    안 쓰는 서체는 unloaded 로 남아 자체 확인이 FONT 로 멈췄다(검토 dc-2 · render 의 empty_slots 와 같은 규칙).
    ⚠️ 인자 없는 옛 부름(dictation_enko.py 의 D.page_css())도 그대로 된다."""
    faces = ''   # 굵은 서체(NSKB)는 text_css 가 싣는다(1차 · 2차 같이)
    hd_rule = ft_rule = ''
    if HEADER_FONT and HEADER_FONT != BODY_FONT:
        faces += _face('NSKH', HEADER_FONT)
        hd_rule = " font-family:'NSKH','NSK',serif;"
    has_text = footer_has_text(total)
    if FOOTER_FONT and FOOTER_FONT != BODY_FONT:
        if has_text:
            faces += _face('NSKF', FOOTER_FONT)
            ft_rule = " font-family:'NSKF','NSK',serif;"
    elif FOOTER_LIKE_SUB:
        ft_rule = " font-family:'NSKB',serif;"
    ft_pt, ft_color = (HEAD_PT, '#111') if FOOTER_LIKE_SUB else (R.FOOTER_PT, '#555')
    return faces + """
@page { size: A4 landscape; margin: 0; }
.page { width:%(w)smm; height:%(h)smm; padding:%(m)smm; padding-top:%(mt)smm; padding-left:%(ml)smm;
        background:#fff; overflow:hidden; }
@media print {
  .page { page-break-after:always; }
  .page:last-of-type { page-break-after:auto; }
}
.hd { height:%(hh)smm; display:flex; justify-content:space-between; align-items:flex-end;
      padding-bottom:1.5mm; border-bottom:1.5pt solid #111; overflow:hidden; white-space:nowrap; }
.hd .rng { font-size:%(hpt)spt; line-height:1;%(hd_rule)s }
.hd .date { font-size:%(dpt)spt; line-height:1; font-family:'NSKB',serif; }
.hd .date .blank { display:inline-block; width:10mm; }
.hd .date .by { width:8mm; }
.bd { height:%(bh)smm; overflow:hidden; }
.bd .tx { height:%(th)smm; white-space:nowrap; }
.bd .jl { display:flex; justify-content:space-between; }
.bd .jl > span { flex:0 0 auto; white-space:pre; }
.bd .wl { height:%(wh)smm; border-bottom:0.5pt solid #888; }
.ft { height:%(fh)smm; display:grid; grid-template-columns:1fr auto 1fr; align-items:center;
      column-gap:6mm; font-size:%(fpt)spt; color:%(fcolor)s; border-top:1.5pt solid #111;%(ft_rule)s }
.ft span { white-space:nowrap; overflow:hidden; }
.ft .fl { text-align:left; } .ft .fc { text-align:center; } .ft .fr { text-align:right; }
""" % {'w': R.PAGE_W_MM, 'h': R.PAGE_H_MM, 'm': R.MARGIN_MM, 'mt': _mm(R.MARGIN_MM + BIND_TOP_MM),
       'ml': _mm(R.MARGIN_MM + BIND_LEFT_MM), 'hh': _mm(HEADER_MM), 'hpt': _mm(HEADER_PT),
       'dpt': _mm(DATE_PT), 'bh': _mm(body_mm()),
       'th': _mm(TEXT_MM), 'wh': _mm(WRITE_MM), 'fh': _mm(R.FOOTER_MM), 'fpt': _mm(ft_pt),
       'fcolor': ft_color, 'hd_rule': hd_rule, 'ft_rule': ft_rule}


def _page_html(page, book, page_no, total, lang):
    lines = [it for it in page if it['kind'] == 'line']
    a, b = lines[0]['first'], lines[-1]['last']
    if (a['ch'], a['vs']) == (b['ch'], b['ve']):
        rng = '%s %d:%d' % (book, a['ch'], a['vs'])
    else:
        rng = '%s %d:%d %s %d:%d' % (book, a['ch'], a['vs'], '–' if lang == 'en' else '~',
                                     b['ch'], b['ve'])
    parts = []
    for it in page:
        if it['kind'] == 'line':
            parts.append('<div class="tx">%s</div><div class="wl"></div>' % it['html'])
        else:
            parts.append('<div class="hx %s" style="height:%smm">%s</div>' % (it['kind'], _mm(it['mm']), it['html']))
    date = ''
    if SHOW_DATE:
        date = ('<span class="date">%s<span class="blank by"></span>년<span class="blank"></span>월'
                '<span class="blank"></span>일</span>' % esc(DATE_PREFIX))
    fl, fc, fr = R.footer_texts(page_no, total)
    return ('<div class="page"><div class="hd"><span class="rng">%s</span>%s</div>'
            '<div class="bd">%s</div>'
            '<div class="ft"><span class="fl">%s</span><span class="fc">%s</span>'
            '<span class="fr pg">%s</span></div></div>'
            % (esc(rng), date, ''.join(parts), esc(fl), esc(fc), esc(fr)))


def build_final_html(pages, book, lang='ko'):
    total = len(pages)
    # 굵은 서체를 쓰는 칸 — 머리 칸 · 날짜 칸 · 글이 있는 소제목 같은 바닥글. 하나도 없으면 싣지 않는다(서체 실패로 오인).
    bold = SHOW_DATE or (FOOTER_LIKE_SUB and not FOOTER_FONT and footer_has_text(total)) or any(
        it['kind'] != 'line' for pg in pages for it in pg)
    return ('<!doctype html><html lang="%s"><head><meta charset="utf-8">'
            '<title>%s 필사노트(아래쪽 필사형)</title><style>%s%s</style></head><body>%s%s</body></html>'
            % (lang, esc(book), text_css(lang, bold), page_css(total), R.FONT_WARN_HTML,
               ''.join(_page_html(pg, book, i + 1, total, lang) for i, pg in enumerate(pages))))


# 인쇄본 확인 — 줄이 폭을 넘지 않는지 · 쪽 안이 넘치지 않는지 · 머리글 · 바닥글이 잘리지 않는지.
# ⚠️ 머리글은 align-items:flex-end 라 넘친 글이 위로 자란다 — scrollHeight 로는 못 잡아 칸 높이와 직접 견준다(verify 와 같은 방법).
#    바닥글은 grid 1fr auto 1fr 이라 가운데 글이 길면 양옆 칸(쪽 번호)이 잘린 채 「통과」했다(검토 dc-3) — 칸마다 가로 잘림만 본다.
CHECK_PROBE = """<script>
document.fonts.ready.then(function(){
  var bad = [];
  document.fonts.forEach(function(f){ if (f.status !== 'loaded') bad.push('FONT'); });
  document.querySelectorAll('.bd').forEach(function(b, i){
    if (b.scrollHeight > b.clientHeight + 1) bad.push('TALL' + (i + 1));
    b.querySelectorAll('.tx,.hx').forEach(function(l){
      if (l.scrollWidth > l.clientWidth + 1) bad.push('WIDE' + (i + 1));
      if (l.scrollHeight > l.clientHeight + 1) bad.push('HIGH' + (i + 1));
    });
  });
  document.querySelectorAll('.page').forEach(function(pg, i){
    var hd = pg.querySelector('.hd');
    if (hd) {
      var over = hd.scrollWidth > hd.clientWidth + 1;
      hd.querySelectorAll(':scope > span').forEach(function(sp){
        if (sp.getBoundingClientRect().height > hd.clientHeight + 1) over = true;
      });
      if (over) bad.push('HEAD' + (i + 1));
    }
    // 바닥글은 가로 잘림만 본다 — .ft 는 넘친 것을 자르지 않고 그 아래는 쪽 여백이라, 세로로 칸보다 큰 글(16pt 이상)을
    // FOOT 으로 막으면 잘린 데 없는 인쇄본이 멈췄다(검토 dc-n1).
    pg.querySelectorAll('.ft > span').forEach(function(sp){
      if (sp.scrollWidth > sp.clientWidth + 1) bad.push('FOOT' + (i + 1));
    });
  });
  document.title = 'CHECK|' + document.querySelectorAll('.page').length + '|' + bad.join(',');
});
</script>"""


def check_final(out_path, chrome, pages):
    with io.open(out_path, encoding='utf-8') as f:
        html = f.read()
    tmp = G._temp_beside(out_path, '_dict_check_', '.html')
    try:
        with io.open(tmp, 'w', encoding='utf-8') as f:
            f.write(html.replace('</body>', CHECK_PROBE + '</body>'))
        r = G._chrome(chrome, ['--dump-dom', '--virtual-time-budget=30000'], tmp)
    finally:
        G._remove_temp(tmp)
    m = re.search(r'<title>CHECK\|(\d+)\|([^<]*)</title>', r.stdout.decode('utf-8', 'replace'))
    if not m:
        raise SystemExit('!! 인쇄본을 확인하지 못했습니다 — 다시 돌려 보세요')
    if int(m.group(1)) != pages or m.group(2):
        raise SystemExit('!! 인쇄본이 어긋났습니다(쪽 %s · %s) — 인쇄하지 마세요'
                         % (m.group(1), m.group(2)[:200]))


def copy_fonts_beside(out_path):
    """HTML 이 bible-note/ 밖(다른 폴더)이면 그 옆 fonts/ 에 쓰는 서체를 함께 둔다."""
    out_dir = os.path.dirname(os.path.abspath(out_path))
    if os.path.normcase(os.path.realpath(out_dir)) == os.path.normcase(os.path.realpath(os.getcwd())):
        return
    dst = os.path.join(out_dir, 'fonts')
    os.makedirs(dst, exist_ok=True)
    for p in fonts_used():
        shutil.copy2(p, os.path.join(dst, os.path.basename(p)))


def build(pieces, title, out_path, chrome, max_pages=None):
    """조각들 → out_path 에 인쇄본. (쪽 수, 원문 줄 수)를 돌려준다. cwd 는 bible-note/ 여야 한다."""
    for p in fonts_used():
        if not os.path.exists(p):
            raise SystemExit('!! 서체 파일이 없습니다 — %s' % p)
    lang = _lang(pieces)
    paras = build_paragraphs(pieces)
    breaks, heads = measure(paras, chrome, lang)
    items = build_items(paras, breaks, lang, heads)
    pages = paginate_items(items, body_mm())
    if max_pages:
        pages = pages[:max_pages]
    copy_fonts_beside(out_path)
    # 확인을 통과한 뒤에만 진짜 이름으로 — 걸린 인쇄본이 전에 잘 만든 같은 이름 파일을 덮었다(검토 dc-4).
    # 임시 이름은 「_」 로 시작해 bible-note 안이면 .gitignore 에 걸린다(실패해도 finally 에서 지운다).
    work = G._temp_beside(out_path, '_dict_out_', '.html')
    try:
        with io.open(work, 'w', encoding='utf-8') as f:
            f.write(build_final_html(pages, title, lang))
        check_final(work, chrome, len(pages))
        os.replace(work, out_path)
    finally:
        G._remove_temp(work)
    return len(pages), sum(1 for it in items if it['kind'] == 'line')


def _chrome_uri(chrome, flags, target_path):
    """generate._chrome 과 같되 주소를 퍼센트 인코딩한다 — 'file:///' + 경로면 폴더 이름의 「#」 뒤가 주소 조각이 되고
    「%41」 이 다른 글자로 풀려 실측이 늘 실패했다(검토 dc-5). 명령줄(generate)에서만 끼운다 — 화면(notebook.py)은
    제 _chrome_runner(같은 인코딩 · 멈추기 · 자식까지 끄기)를 끼운다."""
    try:
        return subprocess.run([chrome, '--headless', '--disable-gpu'] + flags +
                              [pathlib.Path(os.path.abspath(target_path)).as_uri()],
                              capture_output=True, timeout=G.CHROME_TIMEOUT_SEC)
    except subprocess.TimeoutExpired:
        raise SystemExit('!! 크롬이 %d초 안에 끝나지 않았습니다(멈췄을 수 있습니다) — %s'
                         % (G.CHROME_TIMEOUT_SEC, target_path))


def generate(book_name, chapter=None, out_path=None):
    if out_path:
        out_path = os.path.abspath(out_path)
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    if not out_path:
        suffix = '_%d%s' % (chapter, chapter_unit(book_name)) if chapter else ''
        out_path = '%s%s_받아쓰기.html' % (book_name, suffix)
    G.ensure_out_path_safe(out_path)
    G.ensure_fonts()
    chrome = G.find_chrome()
    if not chrome:
        raise SystemExit('!! 크롬을 못 찾았습니다 — 헤드리스 실측에 필요합니다.')
    G._chrome = _chrome_uri      # 이 명령줄 프로세스에서만(다른 생성기는 저마다 따로 돈다)
    pieces = parse_book(load_book_file(G.find_book_file(book_name)), book_name, chapter=chapter)
    if not pieces:
        raise SystemExit('!! "%s"에서 절을 찾지 못했습니다' % book_name)
    n_pages, n_lines = build(pieces, book_name, out_path, chrome)
    print('완료: %s (%d쪽 · %d절 · 원문 %d줄)' % (out_path, n_pages, G.verse_count(pieces), n_lines))
    return out_path


def main():
    ap = argparse.ArgumentParser(description='성경 필사노트(가로형 · 아래쪽 필사형) 생성')
    ap.add_argument('book', help='책 이름(예: 잠언)')
    ap.add_argument('--chapter', type=int, default=None, help='특정 장만(예: 1)')
    ap.add_argument('--out', default=None, help='출력 파일명')
    args = ap.parse_args()
    try:
        generate(args.book, chapter=args.chapter, out_path=args.out)
    except (FontSettingError, SourceTextError) as e:
        raise SystemExit('!! %s' % e)


if __name__ == '__main__':
    main()
