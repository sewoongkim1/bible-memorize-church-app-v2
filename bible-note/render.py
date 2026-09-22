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
⚠️ 그리는 단위는 parse.py 의 「조각」이다(2026-09-22 Task 9). 조각 하나의 위쪽 순서는
   **권 제목(가운데) → 장 표시(왼쪽) → 소제목(왼쪽) → 본문** 이고(piece_blocks 한 곳이 정한다 —
   1차·2차가 같은 순서를 쓴다), 필사 열의 권 제목·장 표시·소제목은 원문 쪽 **실측 줄 수에 높이를
   못박는다**(head_lines · chap_lines · sub_lines). 필사줄은 본문 몫(lines − 셋)만 긋는다.
"""
import html as _html
import os

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
# 내 PC 서체: 파일을 fonts/ 에 복사하고 주소는 비운다 — {'fonts/BMJUA_ttf.ttf': ''}
#   (.ttf · .otf · .woff · .woff2 가 된다. .ttc 는 브라우저가 못 읽는다.)
HEADER_FONT_URL = {}
# 바닥글 글씨 크기.
FOOTER_PT = 9
# 바닥글 서체 파일 — 머리글 서체(HEADER_FONT_URL)와 규칙이 똑같다(비우면 원문 서체, 한 벌만,
# 내 PC 서체는 주소 ''). 머리글과 같은 파일을 넣어도 한 번만 받고 한 번만 복사한다.
FOOTER_FONT_URL = {}

# 바닥글 — 왼쪽 · 가운데 · 오른쪽. 비우려면 ''.
# 오른쪽의 {page} · {total} 은 그 쪽 번호 · 전체 쪽 수로 바뀐다(footer_texts 가 str.replace 로 바꾼다).
# 가운데는 홀수 쪽 FOOTER_CENTER, 짝수 쪽 FOOTER_CENTER_EVEN(비우면 홀수와 같다).
FOOTER_LEFT = 'God is Love'
FOOTER_CENTER = '주의 말씀은 내 발에 등이요 내 길에 빛이니이다'
FOOTER_CENTER_EVEN = 'Your word is a lamp to my feet and a light for my path.'
FOOTER_RIGHT = '{page} / {total}'


# @font-face 의 format() 힌트 — 파일 확장자로 고른다. Task 8 은 format('woff') 를 박아 두어
# 가이드가 안내하는 내 PC 서체(.ttf)와 맞지 않았다(2026-09-22 Task 9).
FONT_FORMATS = {'.woff': 'woff', '.woff2': 'woff2', '.ttf': 'truetype', '.otf': 'opentype'}


class FontSettingError(ValueError):
    """위 서체 설정(HEADER_FONT_URL · FOOTER_FONT_URL)이 잘못됐다 — 성도님이 설정을 고치면 풀린다.

    generate.main() 이 이 종류만 골라 트레이스백 대신 `!! …` 한 줄로 보인다
    (2026-09-22 최종 검토 r5 Minor 4). ValueError 를 이어받아 예전처럼 잡을 수도 있다.
    """


def font_format(path):
    """서체 파일 경로 → @font-face 의 format() 이름. 모르는 확장자·.ttc 는 FontSettingError."""
    ext = os.path.splitext(path)[1].lower()
    if ext == '.ttc':
        raise FontSettingError('%s: .ttc(여러 서체를 묶은 파일)는 브라우저가 읽지 못합니다 — '
                               '.ttf · .otf · .woff · .woff2 파일을 써 주세요' % path)
    if ext not in FONT_FORMATS:
        raise FontSettingError('%s: 서체 파일은 .ttf · .otf · .woff · .woff2 만 쓸 수 있습니다' % path)
    return FONT_FORMATS[ext]


def _is_fonts_file_name(path):
    """'fonts/파일이름' 꼴인가 — fonts/ 바로 아래 파일 하나, 가름은 / 만."""
    name = path[len('fonts/'):]
    return path.startswith('fonts/') and bool(name) and '/' not in name and '\\' not in name


def _slot_fonts():
    """따로 정하는 서체 자리 — (글꼴 이름, 설정 사전, 이름, 칸).

    ⚠️ 서체 자리 목록은 여기 한 벌이다. all_font_urls()(받기·복사·저장 자리 검사)와
       page_css()(@font-face · 칸의 font-family)가 모두 이 목록을 돈다(2026-09-22 최종 검토 r5
       Minor 3 — page_css 가 자리를 손으로 다시 적어 두 벌이었다). 칸은 규칙이 붙는 선택자
       `.hd` · `.ft` 의 이름이고, page_css() 의 `%(<칸>_font_rule)s` 자리에 들어간다.
    호출할 때마다 지금 값을 읽는다(테스트가 monkeypatch 로 바꾼 값도).
    """
    return [('NSKH', HEADER_FONT_URL, '머리글', 'hd'), ('NSKF', FOOTER_FONT_URL, '바닥글', 'ft')]


def _slot_font(family, urls, what):
    """서체 자리 하나(머리글·바닥글) → (@font-face 한 줄, font-family 규칙 조각).

    ⚠️ 머리글·바닥글이 이 도우미 하나를 같이 쓴다 — 두 벌로 두면 한쪽만 고치게 된다.
    비었으면 ('', '') — 원문 서체를 그대로 쓴다. 파일은 한 벌만. format() 은 확장자로 고른다.
    ⚠️ 주소가 '' 인 내 PC 서체는 'fonts/파일이름' 이어야 한다 — @font-face 는 키를 그대로 url() 에
       쓰고, 다른 폴더로 옮길 때는 fonts/<이름> 으로만 복사하므로, 제 자리 경로(C:/…)나 하위
       폴더를 적으면 받기 검사는 통과해 놓고 서체가 안 불린다(2026-09-22 최종 검토 r5 Minor 5).
    """
    if not urls:
        return '', ''
    if len(urls) > 1:
        raise FontSettingError('%s 서체는 한 벌만 지정할 수 있습니다: %r' % (what, urls))
    path = next(iter(urls))
    if not urls[path] and not _is_fonts_file_name(path):
        raise FontSettingError("%s 서체 — 내 PC 서체는 bible-note\\fonts\\ 에 복사한 뒤 "
                               "'fonts/파일이름' 으로 적어 주세요: %s" % (what, path))
    face = ("@font-face { font-family:'%s'; src:url('%s') format('%s');"
            " font-weight:400; font-display:block; }\n" % (family, path, font_format(path)))
    return face, " font-family:'%s','NSK',serif;" % family


def all_font_urls():
    """FONT_URL(원문 서체) · HEADER_FONT_URL(머리글) · FOOTER_FONT_URL(바닥글)을 합친 것.

    generate.ensure_fonts() · generate._copy_fonts_beside() · generate.ensure_out_path_safe()
    의 서체 자리 검사가 이 함수 하나를 돈다 — 한 곳만 FONT_URL 을 보면 머리글·바닥글 서체가
    받아지지 않거나 옮긴 자리에 빠진다. 사전이라 머리글·바닥글에 같은 파일을 넣어도 한 번만
    나온다(두 번 받거나 두 번 복사하지 않는다). 같은 파일에 주소가 둘이면 ValueError.
    주소가 '' 인 것은 내 PC 서체(fonts/ 에 이미 넣어 둔 파일)다 — 받지 않는다.
    """
    merged = dict(FONT_URL)
    for family, urls, what, _key in _slot_fonts():
        _slot_font(family, urls, what)  # 한 벌인지 · 브라우저가 읽는 확장자인지 · 자리 먼저 본다
        for path, url in urls.items():
            if path in merged and merged[path] != url:
                raise FontSettingError('서체 파일 %s 에 주소가 둘입니다(%r · %r) — 같은 파일이면 '
                                       '주소도 같게 적어 주세요' % (path, merged[path], url))
            merged[path] = url
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


def footer_has_text(total):
    """전체 total 쪽 가운데 바닥글에 글이 한 글자라도 찍히는 쪽이 있는가.

    설정 넷(FOOTER_LEFT · FOOTER_CENTER · FOOTER_CENTER_EVEN · FOOTER_RIGHT)이 모두 비면 당연히
    없고, 짝수 쪽 글만 있는데 한 쪽짜리(시편 1편)여도 없다 — 실제로 찍히는 글(footer_texts)로 본다.
    """
    return any(t.strip() for n in range(1, total + 1) for t in footer_texts(n, total))


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
.orig-col p, .orig-col .head, .orig-col .chap, .orig-col .sub,
.write-col .head, .write-col .chap, .write-col .sub {
  font-size:%(fpt)spt; line-height:%(line)smm; margin:0; word-break:keep-all;
  letter-spacing:%(ls)sem;
}
.orig-col .head, .write-col .head { text-align:center; font-family:'NSKB',serif; font-weight:400; }
.orig-col .chap, .write-col .chap { text-align:left; }
.orig-col .chap, .write-col .chap, .orig-col .sub, .write-col .sub { font-family:'NSKB',serif; font-weight:400; }
.orig-col p { display:flex; }
.orig-col .num { flex:0 0 auto; font-family:'NSKB',serif; font-weight:400; }
.orig-col .txt { flex:1 1 auto; min-width:0; }
""" % {'ow': orig_width_mm(), 'pad': COL_PAD_MM, 'fpt': FONT_PT, 'line': LINE_MM,
       'ls': _mm(LETTER_SPACING_EM)}


def _label(v):
    """번호 칸에 찍을 글자(마침표 빼고) — parse 가 준 label. 없는 dict(예전 꼴)는 절 번호.
    ⚠️ 끊긴 조각의 label 은 '' 라 `or` 로 절 번호에 떨어뜨리면 안 된다."""
    return v['label'] if 'label' in v else str(v['verse'])


def _num_text(v):
    """번호 칸 안의 글 — 「1.」 · 「1-2.」, 끊긴 조각은 빈 칸(칸 폭은 그대로)."""
    label = _label(v)
    return label + '.' if label else ''


def num_digits(verses):
    """가장 긴 번호 칸 글자 수(label) — 번호 칸 폭을 정한다
    (시편 119편은 세 자리, 합쳐진 절 「10-11」은 다섯)."""
    return max(len(_label(v)) for v in verses)


def num_col_css(digits):
    """번호 칸 폭 규칙 — 숫자 자릿수 + 마침표 + 틈.

    ⚠️ 1차(실측)와 2차(인쇄)가 반드시 같은 값을 써야 한다. 다르면 줄바꿈이 달라져
       필사줄 수가 어긋난다. `ch` 는 번호 서체(NSKB)의 숫자 폭이다.
    """
    return '.orig-col .num { width:calc(%dch + 0.6ch + 1.5mm); }' % digits


def chapter_unit(book):
    """장 표시·기본 파일 이름의 단위 글자 — 시편은 「편」, 그 밖은 「장」.
    ⚠️ 여기 한 곳에서만 정한다(generate 의 파일 이름도 이 함수를 쓴다)."""
    return '편' if book == '시편' else '장'


def chapter_mark(v):
    """장 표시 글 — 「1장」 · 「1편」."""
    return '%d%s' % (v['chapter'], chapter_unit(v['book']))


def piece_blocks(v):
    """조각 본문 위에 얹는 칸들을 위에서부터 — [(역할, 글)].

    ⚠️ 순서는 권 제목(가운데) → 장 표시(왼쪽) → 소제목(왼쪽). 인쇄 성경처럼 「제일권」이 「1편」
       위에 온다. 1차(실측)·2차(인쇄)가 이 함수 하나를 같이 쓴다.
    """
    blocks = []
    if v.get('heading'):
        blocks.append(('head', v['heading']))
    if v.get('chapter_start'):
        blocks.append(('chap', chapter_mark(v)))
    if v.get('subtitle'):
        blocks.append(('sub', v['subtitle']))
    return blocks


def _block_lines(v, role):
    """칸 하나의 실측 줄 수(generate 가 채운 head_lines · chap_lines · sub_lines). 없으면 1."""
    return v.get('%s_lines' % role, 1)


def build_draft_html(verses):
    """1차 그리기 — 페이지를 나누지 않고 원문 열만 그린다.

    각 조각의 칸(권 제목·장 표시·소제목)과 본문에 data-ch/data-vs/data-pt/data-role 을 붙여,
    브라우저에서 실제로 몇 줄로 찍혔는지 그 속성으로 찾아 잴 수 있게 한다. data-pt(조각 번호)가
    있어야 끊긴 절의 두 조각이 한 키로 겹치지 않는다. 역할은 head · chap · sub · body.
    """
    parts = []
    for v in verses:
        key = 'data-ch="%d" data-vs="%d" data-pt="%d"' % (v['chapter'], v['verse'], v.get('part', 0))
        for role, text in piece_blocks(v):
            parts.append('<div class="%s" %s data-role="%s">%s</div>' % (role, key, role, esc(text)))
        parts.append(
            '<p %s data-role="body">'
            '<span class="num">%s</span><span class="txt">%s</span></p>'
            % (key, esc(_num_text(v)), esc(v['body'])))
    return (
        '<!doctype html><html lang="ko"><head><meta charset="utf-8">'
        '<style>%s%s</style></head>'
        '<body><div class="orig-col">%s</div></body></html>'
        % (base_css(), num_col_css(num_digits(verses)), ''.join(parts))
    )


def page_css(empty_slots=()):
    """페이지(.page)·머리글(.hd)·필사 열(.write-col)·바닥글(.ft) 규칙 — 2차(인쇄) 전용.

    1차(실측) HTML은 이 CSS를 아예 쓰지 않는다(build_draft_html 참고) — 그래서
    HEADER_FONT_URL · FOOTER_FONT_URL 로 넣는 머리글·바닥글 서체(@font-face)도 여기 있으면
    자동으로 2차에만 실린다. 1차에 실리면 머리글·바닥글이 없어 쓰이지 않는 서체가
    document.fonts에서 unloaded로 남아 실측이 서체 실패로 오인해 멈춘다(FONTFAIL).

    empty_slots 는 글이 한 글자도 찍히지 않는 자리의 칸 이름(예 ('ft',))이다 — 그 자리 서체는
    싣지 않는다. 같은 함정이 2차에서 「바닥글 글을 모두 비운 경우」로 다시 생겨, 서체가 멀쩡해도
    붉은 띠가 뜨고 verify 가 FONT_NOT_LOADED:NSKF 로 떨어졌다(2026-09-22 최종 검토 r5 Minor 6).
    서체 설정은 그래도 검사한다(_slot_font 를 먼저 부른다).
    """
    faces = []
    fields = {}
    for family, urls, what, key in _slot_fonts():
        face, rule = _slot_font(family, urls, what)
        if key in empty_slots:
            face, rule = '', ''
        faces.append(face)
        fields['%s_font_rule' % key] = rule
    fields.update({'slot_font_faces': ''.join(faces), 'w': PAGE_W_MM, 'h': PAGE_H_MM,
                   'm': MARGIN_MM, 'hh': HEADER_MM, 'hpt': HEADER_PT, 'rh': usable_body_mm(),
                   'fh': FOOTER_MM, 'fpt': FOOTER_PT, 'line': LINE_MM,
                   'ww': write_width_mm(), 'pad': COL_PAD_MM})
    return ("""
%(slot_font_faces)s@page { size: A4 landscape; margin: 0; }
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
      column-gap:6mm; font-size:%(fpt)spt;%(ft_font_rule)s color:#555; border-top:0.75pt solid #333; }
.ft span { white-space:nowrap; overflow:hidden; }
.ft .fl { text-align:left; }
.ft .fc { text-align:center; }
.ft .fr { text-align:right; }
""" % fields)


def _page_html(page_verses, book, page_no, total):
    first, last = page_verses[0], page_verses[-1]
    # 끝 조각이 합쳐진 절이면 끝 절까지(「로마서 9:1 ~ 9:2」).
    last_verse = last.get('verse_end') or last['verse']
    if (first['chapter'], first['verse']) == (last['chapter'], last_verse):
        # 절 하나뿐인 쪽 — 「룻기 1:22 ~ 1:22」가 아니라 「룻기 1:22」 하나만 쓴다
        # (2026-09-22 최종 검토 Minor — 장 바뀜 규칙이 생겨 장 끝에서 더 자주 나온다).
        rng = '%s %d:%d' % (book, first['chapter'], first['verse'])
    else:
        rng = '%s %d:%d ~ %d:%d' % (book, first['chapter'], first['verse'],
                                     last['chapter'], last_verse)
    orig_parts = []
    write_parts = []
    for v in page_verses:
        fixed_lines = 0
        for role, text in piece_blocks(v):
            n = _block_lines(v, role)
            fixed_lines += n
            orig_parts.append('<div class="%s">%s</div>' % (role, esc(text)))
            # 필사 열은 폭이 원문 열과 다를 수 있어(ORIG_PCT) 같은 글이 다른 줄 수로 끝날 수
            # 있다 — 높이를 원문 쪽 실측 줄 수에 못박아야 아래 필사줄이 원문 줄과 같은 높이에서
            # 시작한다(권 제목·장 표시·소제목 모두).
            write_parts.append('<div class="%s" style="height:%smm">%s</div>'
                               % (role, _mm(n * LINE_MM), esc(text)))
        orig_parts.append(
            '<p><span class="num">%s</span><span class="txt">%s</span></p>'
            % (esc(_num_text(v)), esc(v['body'])))
        body_lines = v['lines'] - fixed_lines
        if body_lines < 1:
            # 조각 번호까지 적는다 — 끊긴 절의 두 조각이 같은 「5:9」로 보이지 않게(generate 의
            # 「%d:%d(조각 %d)」와 같은 꼴 · 2026-09-22 최종 검토 r5 Minor 7).
            raise ValueError('%d:%d(조각 %d)의 본문 줄 수가 잘못됐습니다(전체 %r줄 − 위 칸 %d줄)'
                             % (v['chapter'], v['verse'], v.get('part', 0), v['lines'],
                                fixed_lines))
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
# ⚠️ 문구에 서체 이름을 적지 않는다 — 머리글·바닥글 서체(내 PC 서체 포함)가 안 불려도 이 띠가
#    뜬다. 예전 「서체(Noto Serif KR)를 불러오지 못했습니다」는 원인을 잘못 가리켰다(최종 검토 r5 Minor 5).
FONT_WARN_HTML = """
<div id="font-warn" style="display:none;position:fixed;top:0;left:0;right:0;z-index:9999;
  background:#c0392b;color:#fff;font-family:sans-serif;font-size:12pt;font-weight:bold;
  text-align:center;padding:4mm;">
  ⚠ 서체를 불러오지 못했습니다 — HTML 옆에 fonts 폴더가 있는지 확인하세요.
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
    바닥글에 찍히는 글이 한 쪽도 없으면 바닥글 서체는 싣지 않는다(page_css 참고 —
    머리글은 책·절 범위가 늘 찍힌다).
    """
    all_verses = [v for pg in pages for v in pg]
    num_css = num_col_css(num_digits(all_verses))
    total = len(pages)
    empty_slots = () if footer_has_text(total) else ('ft',)
    page_divs = [_page_html(pg, book, i + 1, total) for i, pg in enumerate(pages)]
    return (
        '<!doctype html><html lang="ko"><head><meta charset="utf-8">'
        '<title>%s 필사노트</title>'
        '<style>%s%s%s</style></head><body>%s%s</body></html>'
        % (esc(book), base_css(), num_css, page_css(empty_slots), FONT_WARN_HTML,
           ''.join(page_divs))
    )
