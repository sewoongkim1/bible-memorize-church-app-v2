# -*- coding: utf-8 -*-
"""HTML 생성 — 1차(실측용 초안)와 2차(인쇄용 최종본).

⚠️ 페이지 기하(여백·헤더·푸터·줄 높이·열 폭)는 이 파일의 상수에서만 나온다.
   `generate.py`의 페이지 배분도 lines_per_page() 를 그대로 쓴다 — 두 곳에서 따로
   계산하면 나중에 한쪽만 고쳐 어긋난다.
⚠️ 원문 열의 폭·안쪽 여백은 BASE_CSS 의 `.orig-col` 규칙 하나가 정한다. 1차·2차가
   이 규칙을 같이 쓰므로 실측한 줄바꿈이 인쇄본에서도 그대로 나온다. 2차에서 폭을
   인라인 style 로 따로 주지 말 것.
⚠️ 최종 HTML은 `fonts/`를 상대 경로로 부른다(BASE_CSS의 @font-face). 파일만 옮기면
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
ORIG_PCT = 38      # 원문 열이 가용폭에서 차지하는 비율(퍼센트)
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


BASE_CSS = """
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
}
.orig-col .sub, .write-col .sub { font-family:'NSKB',serif; font-weight:400; }
.orig-col .num { font-family:'NSKB',serif; font-weight:400; margin-right:1.5mm; }
""" % {'ow': orig_width_mm(), 'pad': COL_PAD_MM, 'fpt': FONT_PT, 'line': LINE_MM}


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
            '<span class="num">%d.</span>%s</p>'
            % (v['chapter'], v['verse'], v['verse'], esc(v['body'])))
    return (
        '<!doctype html><html lang="ko"><head><meta charset="utf-8">'
        '<style>%s</style></head>'
        '<body><div class="orig-col">%s</div></body></html>'
        % (BASE_CSS, ''.join(parts))
    )


PAGE_CSS = """
@page { size: A4 landscape; margin: 0; }
.page { width:%(w)smm; height:%(h)smm; padding:%(m)smm; background:#fff; }
@media print {
  .page { page-break-after:always; }
  .page:last-of-type { page-break-after:auto; }
}
.hd { height:%(hh)smm; display:flex; justify-content:space-between; align-items:flex-end;
      padding-bottom:1.5mm; border-bottom:0.75pt solid #333; font-size:11pt; }
.hd .date { color:#555; letter-spacing:.05em; }
.row { height:%(rh)smm; display:flex; }
.orig-col { flex:0 0 auto; overflow:hidden; }
.write-col { flex:0 0 auto; width:%(ww)smm; padding-left:%(pad)smm;
             border-left:0.75pt solid #ccc; overflow:hidden; }
.write-col .ln { height:%(line)smm; border-bottom:0.5pt solid #999; }
.ft { height:%(fh)smm; display:flex; align-items:center; justify-content:center;
      font-size:9pt; color:#555; }
""" % {'w': PAGE_W_MM, 'h': PAGE_H_MM, 'm': MARGIN_MM, 'hh': HEADER_MM,
       'rh': usable_body_mm(), 'fh': FOOTER_MM, 'line': LINE_MM,
       'ww': write_width_mm(), 'pad': COL_PAD_MM}


def _page_html(page_verses, book, page_no):
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
            '<p><span class="num">%d.</span>%s</p>' % (v['verse'], esc(v['body'])))
        body_lines = v['lines'] - sub_lines
        write_parts.append(
            '<div class="vs-write">%s</div>' % ('<div class="ln"></div>' * body_lines))
    return (
        '<div class="page">'
        '<div class="hd"><span class="rng">%s</span>'
        '<span class="date">____년 __월 __일</span></div>'
        '<div class="row">'
        '<div class="orig-col">%s</div>'
        '<div class="write-col">%s</div>'
        '</div>'
        '<div class="ft"><span class="pg">%d</span></div>'
        '</div>'
        % (esc(rng), ''.join(orig_parts), ''.join(write_parts), page_no)
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
    """2차 그리기 — 페이지별로 원문 열 + 필사줄 열을 나란히 그린다."""
    page_divs = [_page_html(pg, book, i + 1) for i, pg in enumerate(pages)]
    return (
        '<!doctype html><html lang="ko"><head><meta charset="utf-8">'
        '<title>%s 필사노트</title>'
        '<style>%s%s</style></head><body>%s%s</body></html>'
        % (esc(book), BASE_CSS, PAGE_CSS, FONT_WARN_HTML, ''.join(page_divs))
    )
