# -*- coding: utf-8 -*-
"""2027 사역신청서 · A4 2장 — 지금처럼 나눠 드리고 손으로 걷는 종이 신청서.

⚠️ 대상 연도가 2026 → 2027로 바뀌었다(2026-09-07, 성도님 지시). 이 파일이
  만드는 신청서는 2027년 사역을 위한 것이다 — 원본 두 문서(「2026 사역신청서」·
  「2026년도 교회부서 조직」)의 실제 제목은 그대로 인용하되(그 문서를 가리킬
  때만), 우리 산출물은 전부 2027로 부른다.

■ 왜 이 파일이 필요한가
  사역신청 디지털화(docs/superpowers/specs/2026-09-06-ministry-application-design.md)는
  ①데이터 확정 → ②백엔드 → ③성도 화면 순서로 가는데, 앱이 열리기 전까지는 **올해도
  종이로** 받는다(2026-09-07, 성도님 확정: "현재와 같이 교인들에게 나누어 주고,
  제출하는 방식으로 A4 2장"). 그래서 이 신청서는 앱의 대체물이 아니라 **당장 쓸
  실물**이고, 두 원본(신청서·조직표)의 이름 불일치를 정리한 최신 목록을 반영한다.

■ 데이터 출처 — 손으로 옮겨 적지 않는다
  ministry/ministry_catalog_2027_draft.json 을 그대로 읽는다. 부서 확인 양식
  (tools/ministry-form-gen.py)이 최종본으로 갱신되면 이 파일도 다시 돌리기만 하면
  된다 — 팀 이름을 두 군데서 따로 관리하면 반드시 어긋난다.
  ⚠️ **초안 상태다.** 담당자 확인 전이라 일부 팀명은 바뀔 수 있다(부록 표의
  conflict_note 참고). 확정되면 다시 뽑을 것 — 지금 뽑은 파일을 그대로 인쇄해
  나눠주지 말 것.

■ 지면 배정 — 실측으로 확인한다("판이 넘치는지는 반드시 측정으로 확인"과 같은 원칙)
  전체 사역팀(신청·임명직 모두)을 3단 체크리스트로 흘려 넣는다. 임명직은 같은
  자리에 두되 칸을 비활성으로 채운다(2026-09-07 — 별도 상자로 빼는 것보다
  부서 전체 구조가 한 목록에서 보이는 편이 낫다). 컬럼 수·글자 크기는 상수로
  빼 두었다 — 페이지 수가 2장을 벗어나면 FONT_PT 나 COLS 를 조정하고 다시 돌린다.
  PDF 페이지 수는 pymupdf(fitz)로 실측해 콘솔에 찍는다(스크린샷 대신 숫자로 확인).

출력 (ministry/ 폴더)
  2027_사역신청서_A4.html   원본
  2027_사역신청서_A4.pdf    인쇄용(크롬 --print-to-pdf, 없으면 건너뜀)
"""
import io, os, json, subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..')
OUT_DIR = os.path.join(ROOT, 'ministry')
CATALOG = os.path.join(OUT_DIR, 'ministry_catalog_2027_draft.json')

# ⚠️ 부서 확인이 끝나면 확정본(ministry_catalog_2027.json)이 생긴다 —
#    있으면 그것을, 없으면 초안을 읽는다(tools/ministry-merge-replies.py 가 만든다).
_FINAL = os.path.join(OUT_DIR, 'ministry_catalog_2027.json')
CATALOG = _FINAL if os.path.exists(_FINAL) else CATALOG
MARK = io.open(os.path.join(ROOT, 'marketing', 'logo-mark-data-uri.txt'), encoding='utf-8').read().strip()

# 사용설명서_A4.pdf 와 같은 톤(marketing/manual/manual-gen.py) — 이 교회 인쇄물의
# 실제 정체성이다. 새로 지어내지 않는다.
NAVY = '#123059'
GOLD = '#765700'

# ── 지면 상수(실측 뒤 조정하는 자리) ────────────────────────────────
COLS = 3
FONT_PT = 9.5
GROUP_FONT_PT = 8.4

with io.open(CATALOG, encoding='utf-8') as f:
    ROWS = json.load(f)

# 원본 파일 순서가 이미 위원회별로 묶여 있다 — 그 순서를 그대로 신뢰한다.
COMMITTEES = []
seen = set()
for r in ROWS:
    c = r['committee']
    if c not in seen:
        seen.add(c)
        COMMITTEES.append(c)

PRINCIPLES = [
    '등록식 후 <b>3개월 이상 성실히 출석</b>한 성도만 신청할 수 있습니다.',
    '한 분이 신청할 수 있는 사역은 <b>최대 3개</b>입니다(자치회장도 계수에 포함합니다).',
    '부장·팀장·회계·찬양대지휘자·자치회장은 <b>다른 부서의 같은 성격 사역을 겸직</b>할 수 없습니다.',
    '<b>교사와 찬양대원은 겸직</b>할 수 없습니다(새하늘찬양대는 예외입니다).',
    '신청 후 <b>임명을 받아야</b> 사역을 시작합니다 — 확정되면 <b>앱 알림</b>으로 알려 드리고 게시판에도 올립니다.',
    '사역 신청은 <b>해마다 다시</b> 받습니다.',
]


def esc(s):
    return (s or '').replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def combined_note(r):
    """사역 시간(schedule_note) · 하위 선택 안내(option_note)를 한 줄로 합친다."""
    parts = [p for p in (r.get('schedule_note'), r.get('option_note')) if p]
    return ' · '.join(parts)


def team_row(name, note='', sub=False, disabled=False):
    """disabled=True 면 임명직 — 칸을 채워 비활성으로 보이게 하고 이름 옆에 '지명'을 단다.
    체크는 하지 않지만 목록에서는 빼지 않는다(전체 사역 구조가 한눈에 보이도록)."""
    cls = 'team-row sub-row' if sub else 'team-row'
    if disabled:
        cls += ' disabled'
        note = (note + ' · 지명') if note else '지명'
    note_html = ' <span class="note-inline">(%s)</span>' % esc(note) if note else ''
    return ('<div class="%s"><span class="box"></span>'
            '<span class="nm">%s%s</span></div>' % (cls, esc(name), note_html))


def render_committee(committee):
    """이 위원회의 모든 자리를 3단 목록에 넣는다 — 신청(apply)은 체크 가능한 칸으로,
    임명직(appoint)은 같은 자리에 두되 칸을 비활성으로 채워 넣는다(2026-09-07,
    "임명직도 넣고 체크박스 비활성화" 반영 — 전체 구조가 한 목록에서 보이는 편이
    별도 상자로 빼는 것보다 부서 전체 그림을 이해하기 쉽다)."""
    rows = [r for r in ROWS if r['committee'] == committee]
    if not rows:
        return ''
    body = []
    i = 0
    while i < len(rows):
        r = rows[i]
        grp = r['group']
        if grp:
            # 같은 group 을 공유하는 연속 행을 한 묶음으로 — 안내 문구(option_note)는 한 번만
            j = i
            members = []
            while j < len(rows) and rows[j]['group'] == grp:
                members.append(rows[j])
                j += 1
            opt = members[0]['option_note']
            label = '%s%s' % (esc(grp), (' · %s' % esc(opt)) if opt else '')
            body.append('<div class="grp-label">%s</div>' % label)
            for m in members:
                sched = m.get('schedule_note')
                body.append(team_row(m['team'], note=sched, sub=True, disabled=(m['kind'] == 'appoint')))
            i = j
        else:
            body.append(team_row(r['team'], note=combined_note(r), disabled=(r['kind'] == 'appoint')))
            i += 1
    return ('<div class="committee"><div class="name">%s</div>%s</div>'
            % (esc(committee), ''.join(body)))


STYLE = """
@page { size: A4; margin: 13mm 12mm 12mm; }
* { box-sizing:border-box; }
body { margin:0; font-family:'맑은 고딕','Malgun Gothic',sans-serif; color:#111; font-size:%(fpt)spt; }

.doc-head { display:flex; align-items:center; gap:4mm; border-bottom:1mm solid %(navy)s;
            padding-bottom:2.6mm; margin-bottom:3mm; }
.doc-head img { height:14mm; width:auto; flex:0 0 auto; }
.doc-head h1 { font-size:19pt; font-weight:800; color:%(navy)s; margin:0; line-height:1.2; }
.doc-head .sub { font-size:9pt; color:#333; margin-top:1mm; line-height:1.55; word-break:keep-all; }

.principles { border:0.4mm solid %(gold)s; border-radius:2mm; padding:2.4mm 4mm; margin-bottom:2.8mm; }
.principles .t { font-size:9.6pt; font-weight:800; color:%(gold)s; margin-bottom:1.2mm; }
.principles ol { margin:0; padding-left:4.5mm; }
.principles li { font-size:8.5pt; line-height:1.5; margin-bottom:0.4mm; word-break:keep-all; }
.principles b { color:%(navy)s; }

.info-line { display:flex; border:0.35mm solid #999; border-radius:1.5mm; margin-bottom:2.6mm; }
.info-line .cell { flex:1; border-right:0.35mm solid #999; padding:1.8mm 2.4mm;
                    display:flex; align-items:baseline; gap:1.6mm; }
.info-line .cell:last-child { border-right:none; }
.info-line .cell b { color:%(navy)s; font-size:8.3pt; white-space:nowrap; }
.info-line .cell .blank { flex:1; border-bottom:0.3mm solid #999; height:4mm; }

.apply-caption { font-size:8.6pt; color:#333; margin-bottom:2.4mm; background:#f3efe4;
                  border-left:1mm solid %(gold)s; padding:1.6mm 3mm; word-break:keep-all; }
.apply-caption b { color:%(navy)s; }

.cols { column-count:%(cols)s; column-gap:5mm; }
.committee { break-inside:avoid; -webkit-column-break-inside:avoid; margin-bottom:2.8mm; }
.committee .name { background:%(navy)s; color:#fff; font-size:9.6pt; font-weight:700;
                    padding:1.1mm 2.2mm; border-radius:1mm; margin-bottom:1.3mm; }
.team-row { display:flex; align-items:baseline; gap:1.5mm; line-height:1.7; }
.team-row .box { flex:0 0 auto; width:3.8mm; height:3.8mm; border:0.32mm solid #555; margin-top:0.3mm; }
.sub-row { padding-left:3.8mm; }
.grp-label { font-size:%(gfpt)spt; color:#555; font-style:italic; margin:1.1mm 0 0.4mm 0.4mm; }
.note-inline { font-size:8pt; color:#777; }

/* 임명직 — 같은 자리에 두되 칸을 채워 "누를 수 없음"으로 보이게 한다 */
.team-row.disabled .box { background:#ccc; border-color:#999; }
.team-row.disabled .nm { color:#888; }
.team-row.disabled .note-inline { color:#999; }

.submit-line { margin-top:3.6mm; border-top:0.35mm solid #999; padding-top:2.8mm; break-inside:avoid; }
.submit-line .row { display:flex; gap:5mm; margin-bottom:2.4mm; font-size:8.8pt; }
.submit-line .row .cell { flex:1; display:flex; align-items:baseline; gap:1.6mm; }
.submit-line .row b { color:%(navy)s; white-space:nowrap; }
.submit-line .row .blank { flex:1; border-bottom:0.3mm solid #999; height:4mm; }
.submit-line .pledge { font-size:9pt; text-align:center; color:#222; word-break:keep-all; }
.submit-line .pledge b { color:%(navy)s; }
""" % {'navy': NAVY, 'gold': GOLD, 'cols': COLS, 'fpt': FONT_PT, 'gfpt': GROUP_FONT_PT}

head = ('<div class="doc-head"><img src="%s"><div>'
        '<h1>2027년도 사역신청서</h1>'
        '<div class="sub">고척교회 성도님, 아래 원칙을 읽으시고 원하시는 사역을 표시해 주세요. '
        '한 해 동안 함께 섬길 자리를 정하는 소중한 신청입니다.</div>'
        '</div></div>' % MARK)

principles = ('<div class="principles"><div class="t">사역 임명 원칙</div><ol>'
              + ''.join('<li>%s</li>' % p for p in PRINCIPLES) + '</ol></div>')

info_line = ('<div class="info-line">'
             '<div class="cell"><b>이름</b><span class="blank"></span></div>'
             '<div class="cell"><b>교구·목장</b><span class="blank"></span></div>'
             '<div class="cell"><b>직분</b><span class="blank"></span></div>'
             '<div class="cell"><b>전화번호</b><span class="blank"></span></div>'
             '</div>')

caption = ('<div class="apply-caption">아래 목록에서 <b>최대 3개</b>까지 고르실 수 있습니다. '
           '고르신 사역의 <b>앞 네모 칸에 ✔ 표시</b>해 주세요(순서는 상관없습니다). 하나만 신청하셔도 됩니다. '
           '<b>회색 칸(지명)</b>은 신청이 아니라 임명으로 정해지는 자리이니 표시하지 않으셔도 됩니다.</div>')

cols_html = '<div class="cols">' + ''.join(render_committee(c) for c in COMMITTEES) + '</div>'

submit = ("""
<div class="submit-line">
  <div class="pledge">위 내용으로 <b>2027년도 사역</b>을 신청합니다.</div>
  <div class="row" style="margin-top:2.4mm">
    <div class="cell"><b>제출처</b><span class="blank"></span></div>
    <div class="cell"><b>제출 기한</b><span class="blank"></span></div>
  </div>
  <div class="row">
    <div class="cell"><b>신청일</b><span class="blank"></span></div>
    <div class="cell"><b>서명</b><span class="blank"></span></div>
  </div>
</div>""")

html = ('<!doctype html><html lang="ko"><head><meta charset="utf-8">'
        '<title>2027 사역신청서</title><style>' + STYLE + '</style></head><body>'
        + head + principles + info_line + caption + cols_html
        + submit + '</body></html>')

out_html = os.path.join(OUT_DIR, '2027_사역신청서_A4.html')
io.open(out_html, 'w', encoding='utf-8', newline='').write(html)
print('wrote:', os.path.relpath(out_html, ROOT))

# ── PDF ──────────────────────────────────────────────────────────
CHROME_CANDS = [
    r'C:\Program Files\Google\Chrome\Application\chrome.exe',
    r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
    os.path.join(os.environ.get('LOCALAPPDATA', ''), r'Google\Chrome\Application\chrome.exe'),
]


def find_chrome():
    for c in CHROME_CANDS:
        if c and os.path.exists(c):
            return c
    return None


chrome = find_chrome()
out_pdf = os.path.join(OUT_DIR, '2027_사역신청서_A4.pdf')
if chrome:
    subprocess.run([chrome, '--headless', '--disable-gpu', '--no-pdf-header-footer',
                     '--print-to-pdf=' + os.path.abspath(out_pdf),
                     '--virtual-time-budget=8000',
                     'file:///' + os.path.abspath(out_html).replace(os.sep, '/')],
                    capture_output=True)
    if os.path.exists(out_pdf):
        print('wrote:', os.path.relpath(out_pdf, ROOT))
        try:
            import fitz
            doc = fitz.open(out_pdf)
            print('페이지 수:', doc.page_count, '(목표 2장)')
        except ImportError:
            pass
else:
    print('!! 크롬을 못 찾아 PDF는 건너뜁니다 — HTML을 열어 직접 인쇄하세요.')
