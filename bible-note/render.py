# -*- coding: utf-8 -*-
"""HTML 생성 — 1차(실측용 초안)와 2차(인쇄용 최종본).

⚠️ 페이지 기하(여백·헤더·푸터·줄 높이·열 폭)는 이 파일의 상수에서만 나온다.
   `generate.py`의 페이지 배분도 lines_per_page() 를 그대로 쓴다 — 두 곳에서 따로
   계산하면 나중에 한쪽만 고쳐 어긋난다.
⚠️ 원문 열의 폭·안쪽 여백은 base_css() 의 `.orig-col` 규칙 하나가 정한다. 1차·2차가
   이 규칙을 같이 쓰므로 실측한 줄바꿈이 인쇄본에서도 그대로 나온다. 2차에서 폭을
   인라인 style 로 따로 주지 말 것.
⚠️ 최종 HTML은 `fonts/`를 상대 경로로 부른다(base_css()의 @font-face). 파일만 옮기면
   (담당자에게 보내기·USB·다른 폴더로 --out) 서체가 조용히 대체 서체로 바뀌어 줄이
   어긋나고, 원문 열은 overflow:hidden이라 넘친 글자가 인쇄에서 잘린다. 그런데도 화면엔
   경고가 없었다(2026-09-22 최종 검토 Important 2) — `build_final_html`이 넣는
   `FONT_WARN_HTML`이 서체 로드 실패를 감지해 화면·인쇄 모두에 붉은 띠를 띄운다.
   `document.title`은 건드리지 않는다 — verify.py가 검증용으로 따로 심는
   `document.fonts.ready` 콜백과 같은 값을 놓고 다툴 수 있어서다.
"""
import html as _html

PAGE_W_MM = 297
PAGE_H_MM = 210
MARGIN_MM = 13
HEADER_MM = 12
FOOTER_MM = 8
LINE_MM = 9.5
ORIG_PCT = 50      # 원문 열이 가용폭에서 차지하는 비율(퍼센트) — 2026-09-22 성도님 결정 50:50(처음엔 38:62)
COL_PAD_MM = 4     # 세로선 쪽 안쪽 여백 — 원문 열 오른쪽, 필사 열 왼쪽
FONT_PT = 12

FONT_URL = {
    'fonts/NotoSerifKR-400.woff':
        'https://cdn.jsdelivr.net/npm/@fontsource/noto-serif-kr@5.3.0/'
        'files/noto-serif-kr-korean-400-normal.woff',
    'fonts/NotoSerifKR-700.woff':
        'https://cdn.jsdelivr.net/npm/@fontsource/noto-serif-kr@5.3.0/'
        'files/noto-serif-kr-korean-700-normal.woff',
}

# ── 사람이 고치는 설정(2026-09-22 성도님 요청) ──────────────────────────

# 원문 글자 사이 간격(자간), em 단위. 0 이 서체 기본값. 한글은 보통 -0.03 ~ 0.05 사이에서 고른다.
LETTER_SPACING_EM = 0

# 머리글(책·절 범위 · 날짜) — 원문과 따로 정한다.
HEADER_PT = 11
# 머리글 서체 파일. 비우면({}) 원문 서체를 그대로 쓴다. 넣으면 처음 한 번 받아 fonts/ 에 둔다.
# 예: {'fonts/GowunDodum-400.woff':
#      'https://cdn.jsdelivr.net/npm/@fontsource/gowun-dodum/files/gowun-dodum-korean-400-normal.woff'}
HEADER_FONT_URL = {}
# 바닥글 글씨 크기.
FOOTER_PT = 9

# 바닥글 — 왼쪽 · 가운데 · 오른쪽. 비우려면 ''.
# 오른쪽의 {page} · {total} 은 그 쪽 번호 · 전체 쪽 수로 바뀐다(footer_texts 가 str.replace 로 바꾼다).
# 가운데는 홀수 쪽 FOOTER_CENTER, 짝수 쪽 FOOTER_CENTER_EVEN(비우면 홀수와 같다).
FOOTER_LEFT = 'God is Love'
FOOTER_CENTER = '주의 말씀은 내 발에 등이요 내 길에 빛이니이다'
FOOTER_CENTER_EVEN = 'Your word is a lamp to my feet and a light for my path.'
FOOTER_RIGHT = '{page} / {total}'


def all_font_urls():
    """FONT_URL(원문 서체)과 HEADER_FONT_URL(머리글 서체)을 합친 것.

    generate.ensure_fonts() · generate._copy_fonts_beside() · generate.ensure_out_path_safe()
    의 서체 자리 검사가 이 함수 하나를 돈다 — 한 곳만 FONT_URL 을 보면 머리글 서체가 받아지지
    않거나 옮긴 자리에 빠진다.
    """
    if len(HEADER_FONT_URL) > 1:
        raise ValueError('머리글 서체는 한 벌만 지정할 수 있습니다: %r' % (HEADER_FONT_URL,))
    merged = dict(FONT_URL)
    merged.update(HEADER_FONT_URL)
    return merged


def footer_texts(page_no, total):
    """(왼쪽, 가운데, 오른쪽) 바닥글 글을 돌려준다.

    {page}·{total} 은 str.replace 로 바꾼다(str.format 은 쓰지 않는다 — 사람이 넣은 글에
    {가 있으면 깨진다). 가운데는 짝수 쪽에서 FOOTER_CENTER_EVEN을 쓰되, 비어 있으면 홀수와
    같은 FOOTER_CENTER를 쓴다.
    """
    center = FOOTER_CENTER if page_no % 2 == 1 else (FOOTER_CENTER_EVEN or FOOTER_CENTER)
    right = FOOTER_RIGHT.replace('{page}', str(page_no)).replace('{total}', str(total))
    return FOOTER_LEFT, center, right


def esc(text):
    return _html.escape(text or '')


def _mm(x):
    """19.0 -> '19', 9.5 -> '9.5' — CSS 에 쓸 mm 값."""
    return ('%.2f' % x).rstrip('0').rstrip('.')


def usable_body_mm():
    """페이지에서 여백·헤더·푸터를 뺀, 원문/필사가 쓸 수 있는 세로 길이."""
    return PAGE_H_MM - 2 * MARGIN_MM - HEADER_MM - FOOTER_MM


def lines_per_page():
    """9.5mm 줄 하나가 몇 개나 들어가는지."""
    return int(usable_body_mm() // LINE_MM)


def _avail_width_mm():
    return PAGE_W_MM - 2 * MARGIN_MM


def orig_width_mm():
    return round(_avail_width_mm() * ORIG_PCT / 100.0, 2)


def write_width_mm():
    return round(_avail_width_mm() - orig_width_mm(), 2)


def base_css():
    """1차(실측)·2차(인쇄)가 함께 쓰는 규칙 — 원문 열 폭·글자 크기·자간이 여기 하나에서 나온다.

    ⚠️ LETTER_SPACING_EM(원문 자간)은 반드시 여기(1차·2차 공용)에 넣어야 한다. 한쪽에만
       넣으면 실측과 인쇄의 줄바꿈이 달라져 필사줄 수가 어긋난다.
    함수로 둔 것은 LETTER_SPACING_EM 등을 monkeypatch로 바꿔 가며 시험할 수 있게 하려는
    것이다(모듈을 다시 불러오지 않고도 호출마다 지금 값을 반영한다).
    """
    return """
@font-face { font-family:'NSK'; src:url('fonts/NotoSerifKR-400.woff') format('woff');
             font-weight:400; font-display:block; }
@font-face { font-family:'NSKB'; src:url('fonts/NotoSerifKR-700.woff') format('woff');
             font-weight:400; font-display:block; }
* { box-sizing:border-box; }
html, body { margin:0; }
body { font-family:'NSK',serif; color:#111; }
.orig-col { width:%(ow)smm; padding-right:%(pad)smm; }
.orig-col p, .orig-col .sub, .write-col .sub {
  font-size:%(fpt)spt; line-height:%(line)smm; margin:0; word-break:keep-all;
  letter-spacing:%(ls)sem;
}
.orig-col .sub, .write-col .sub { font-family:'NSKB',serif; font-weight:400; }
.orig-col p { display:flex; }
.orig-col .num { flex:0 0 auto; font-family:'NSKB',serif; font-weight:400; }
.orig-col .txt { flex:1 1 auto; min-width:0; }
""" % {'ow': orig_width_mm(), 'pad': COL_PAD_MM, 'fpt': FONT_PT, 'line': LINE_MM,
       'ls': _mm(LETTER_SPACING_EM)}


def num_digits(verses):
    """가장 큰 절 번호의 자릿수 — 번호 칸 폭을 정한다(시편 119편은 세 자리)."""
    return max(len(str(v['verse'])) for v in verses)


def num_col_css(digits):
    """번호 칸 폭 규칙 — 숫자 자릿수 + 마침표 + 틈.

    ⚠️ 1차(실측)와 2차(인쇄)가 반드시 같은 값을 써야 한다. 다르면 줄바꿈이 달라져
       필사줄 수가 어긋난다. `ch` 는 번호 서체(NSKB)의 숫자 폭이다.
    """
    return '.orig-col .num { width:calc(%dch + 0.6ch + 1.5mm); }' % digits


def build_draft_html(verses):
    """1차 그리기 — 페이지를 나누지 않고 원문 열만 그린다.

    각 절(과 소제목)에 data-ch/data-vs/data-role 을 붙여, 브라우저에서
    실제로 몇 줄로 찍혔는지 그 속성으로 찾아 잴 수 있게 한다.
    """
    parts = []
    for v in verses:
        if v['subtitle']:
            parts.append(
                '<div class="sub" data-ch="%d" data-vs="%d" data-role="sub">%s</div>'
                % (v['chapter'], v['verse'], esc(v['subtitle'])))
        parts.append(
            '<p data-ch="%d" data-vs="%d" data-role="body">'
            '<span class="num">%d.</span><span class="txt">%s</span></p>'
            % (v['chapter'], v['verse'], v['verse'], esc(v['body'])))
    return (
        '<!doctype html><html lang="ko"><head><meta charset="utf-8">'
        '<style>%s%s</style></head>'
        '<body><div class="orig-col">%s</div></body></html>'
        % (base_css(), num_col_css(num_digits(verses)), ''.join(parts))
    )


def page_css():
    """페이지(.page)·머리글(.hd)·필사 열(.write-col)·바닥글(.ft) 규칙 — 2차(인쇄) 전용.

    1차(실측) HTML은 이 CSS를 아예 쓰지 않는다(build_draft_html 참고) — 그래서
    HEADER_FONT_URL로 넣는 머리글 전용 서체(@font-face)도 여기 있으면 자동으로 2차에만
    실린다. 1차에 실리면 머리글이 없어 쓰이지 않는 서체가 document.fonts에서 unloaded로
    남아 실측이 서체 실패로 오인해 멈춘다(FONTFAIL).
    """
    header_font_face = ''
    hd_font_rule = ''
    if HEADER_FONT_URL:
        header_path = next(iter(HEADER_FONT_URL))
        header_font_face = (
            "@font-face { font-family:'NSKH'; src:url('%s') format('woff');"
            " font-weight:400; font-display:block; }\n" % header_path)
        hd_font_rule = " font-family:'NSKH','NSK',serif;"
    return ("""
%(header_font_face)s@page { size: A4 landscape; margin: 0; }
.page { width:%(w)smm; height:%(h)smm; padding:%(m)smm; background:#fff; }
@media print {
  .page { page-break-after:always; }
  .page:last-of-type { page-break-after:auto; }
}
.hd { height:%(hh)smm; display:flex; justify-content:space-between; align-items:flex-end;
      padding-bottom:1.5mm; border-bottom:0.75pt solid #333; font-size:%(hpt)spt;%(hd_font_rule)s
      overflow:hidden; }
.hd .date { color:#555; letter-spacing:.05em; }
.hd .date .blank { display:inline-block; }
.hd .date .by { width:20mm; }
.hd .date .bm, .hd .date .bd { width:12mm; }
.row { height:%(rh)smm; display:flex; }
.orig-col { flex:0 0 auto; overflow:hidden; }
.write-col { flex:0 0 auto; width:%(ww)smm; padding-left:%(pad)smm;
             border-left:0.75pt solid #ccc; overflow:hidden; }
.write-col .ln { height:%(line)smm; border-bottom:0.5pt solid #999; }
.ft { height:%(fh)smm; display:grid; grid-template-columns:1fr auto 1fr; align-items:center;
      column-gap:6mm; font-size:%(fpt)spt; color:#555; border-top:0.75pt solid #333; }
.ft span { white-space:nowrap; overflow:hidden; }
.ft .fl { text-align:left; }
.ft .fc { text-align:center; }
.ft .fr { text-align:right; }
""" % {'header_font_face': header_font_face, 'w': PAGE_W_MM, 'h': PAGE_H_MM, 'm': MARGIN_MM,
       'hh': HEADER_MM, 'hpt': HEADER_PT, 'hd_font_rule': hd_font_rule,
       'rh': usable_body_mm(), 'fh': FOOTER_MM, 'fpt': FOOTER_PT, 'line': LINE_MM,
       'ww': write_width_mm(), 'pad': COL_PAD_MM})


def _page_html(page_verses, book, page_no, total):
    first, last = page_verses[0], page_verses[-1]
    if (first['chapter'], first['verse']) == (last['chapter'], last['verse']):
        # 절 하나뿐인 쪽 — 「룻기 1:22 ~ 1:22」가 아니라 「룻기 1:22」 하나만 쓴다
        # (2026-09-22 최종 검토 Minor — 장 바뀜 규칙이 생겨 장 끝에서 더 자주 나온다).
        rng = '%s %d:%d' % (book, first['chapter'], first['verse'])
    else:
        rng = '%s %d:%d ~ %d:%d' % (book, first['chapter'], first['verse'],
                                     last['chapter'], last['verse'])
    orig_parts = []
    write_parts = []
    for v in page_verses:
        sub_lines = v.get('sub_lines', 1 if v['subtitle'] else 0)
        if v['subtitle']:
            orig_parts.append('<div class="sub">%s</div>' % esc(v['subtitle']))
            # 필사 열은 더 넓어 같은 소제목이 더 적은 줄로 끝날 수 있다 — 높이를 원문 쪽
            # 실측 줄 수에 못박아야 아래 필사줄이 원문 줄과 같은 높이에서 시작한다.
            write_parts.append('<div class="sub" style="height:%smm">%s</div>'
                               % (_mm(sub_lines * LINE_MM), esc(v['subtitle'])))
        orig_parts.append(
            '<p><span class="num">%d.</span><span class="txt">%s</span></p>'
            % (v['verse'], esc(v['body'])))
        body_lines = v['lines'] - sub_lines
        write_parts.append(
            '<div class="vs-write">%s</div>' % ('<div class="ln"></div>' * body_lines))
    fl, fc, fr = footer_texts(page_no, total)
    return (
        '<div class="page">'
        '<div class="hd"><span class="rng">%s</span>'
        '<span class="date"><span class="blank by"></span>년'
        '<span class="blank bm"></span>월<span class="blank bd"></span>일</span></div>'
        '<div class="row">'
        '<div class="orig-col">%s</div>'
        '<div class="write-col">%s</div>'
        '</div>'
        '<div class="ft"><span class="fl">%s</span><span class="fc">%s</span>'
        '<span class="fr pg">%s</span></div>'
        '</div>'
        % (esc(rng), ''.join(orig_parts), ''.join(write_parts), esc(fl), esc(fc), esc(fr))
    )


# 최종 HTML이 fonts/ 없이 열리면(파일만 옮겨졌을 때) 화면·인쇄 모두에 띄우는 경고.
# position:fixed라 인쇄 시에도 매 쪽 반복해서 찍힌다(Chrome 기준). document.title은
# 건드리지 않는다 — verify.py가 검증용으로 따로 심는 document.fonts.ready 콜백과
# 값을 놓고 다투면(레이스) verify 결과 파싱이 깨진다.
FONT_WARN_HTML = """
<div id="font-warn" style="display:none;position:fixed;top:0;left:0;right:0;z-index:9999;
  background:#c0392b;color:#fff;font-family:sans-serif;font-size:12pt;font-weight:bold;
  text-align:center;padding:4mm;">
  ⚠ 서체(Noto Serif KR)를 불러오지 못했습니다 — 이 파일은 fonts 폴더와 반드시 함께 두어야 합니다.
  지금 화면은 줄 수가 원본과 다를 수 있습니다.
</div>
<script>
document.fonts.ready.then(function(){
  var bad = false;
  document.fonts.forEach(function(f){ if (f.status !== 'loaded') bad = true; });
  if (bad) {
    var w = document.getElementById('font-warn');
    if (w) w.style.display = 'block';
  }
});
</script>
"""


def build_final_html(pages, book):
    """2차 그리기 — 페이지별로 원문 열 + 필사줄 열을 나란히 그린다.

    번호 칸 폭은 쪽마다가 아니라 펼친 전체 절로 계산한다(둘째 쪽에만 두 자리
    번호가 있어도 첫 쪽도 두 자리 폭이어야 1차와 같은 규칙을 쓴다).
    """
    all_verses = [v for pg in pages for v in pg]
    num_css = num_col_css(num_digits(all_verses))
    total = len(pages)
    page_divs = [_page_html(pg, book, i + 1, total) for i, pg in enumerate(pages)]
    return (
        '<!doctype html><html lang="ko"><head><meta charset="utf-8">'
        '<title>%s 필사노트</title>'
        '<style>%s%s%s</style></head><body>%s%s</body></html>'
        % (esc(book), base_css(), num_css, page_css(), FONT_WARN_HTML, ''.join(page_divs))
    )
