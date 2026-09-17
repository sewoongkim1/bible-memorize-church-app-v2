# -*- coding: utf-8 -*-
"""2027 소개서 양식 · A4 세로 — 부서가 손으로 적어 내는 공통 빈 양식 두 가지.

  · 부서 소개서   부서당 1장 — 작성자 · 부서 소개 · 사역팀 4칸(팀이 더 있으면 더 뽑는다)
  · 사역팀 소개서 팀당 1장   — 한 팀을 한 장에 넉넉히(칸마다 적는 법을 바로 밑에 단다)

■ 왜 이 파일이 필요한가
  2027 사역신청을 앱으로 받으려면 부서마다 사역팀의 이름·요일·주기·시각·하는 일을
  받아야 한다. 부서별 엑셀(tools/ministry-form-gen.py)은 가로 24칸이라 종이에 뽑아
  손으로 적기 어렵다 — 그래서 **모든 부서에 같은 종이**를 나눠 드리고
  부서가 팀 이름부터 적게 한다(2026-09-17, 성도님 결정: 빈 공통 양식 · 세로 PDF ·
  부서용과 함께 팀당 1장짜리도).

■ 칸 규칙 — 앱의 「② 언제」와 같은 뜻이어야 한다(docs/notes/ministry-2027.md)
  · 적는 것(밑줄): 작성자 이름·교구·목장·전화번호 / 부서명·부서 소개 / 팀 이름·필요 인원·
    주일 시각·시간(문장)·하는 일
  · 고르는 것은 **보기를 모두 종이에 찍는다**(성도님: "라디오버튼 체크박스로 모든 정보가
    표시되어야") — ○ 하나만(직분·구분) / □ 여럿(요일·주기)
  ⚠️ 요일 넷은 **주일 · 금요일 · 토요일 · 평일(월~목)** — 금요일은 평일이 아니다.
  ⚠️ 주기는 팀이 모이는 주기가 아니라 **한 분이 서는 주기**, 여러 개 고를 수 있다.
  ⚠️ 시각은 **주일 사역에만** 받는다(DB 제약 ministry_catalog_time_sun_chk).
  보기 이름을 바꾸려면 앱·서버·DB 도 함께 봐야 한다 — 여기만 고치면 받은 종이를
  옮겨 적을 자리가 없다. 두 양식은 이 파일의 같은 목록(DAYS·FREQS·POSITIONS)을 쓴다.

■ 지면 — 실측으로 확인한다
  괘선은 낱개 요소 + flex:0 0 <높이>로 긋는다(repeating-linear-gradient 는 PDF 에서
  래스터로 뭉개진다 · 메모 print-layout-traps). ○□ 도 글리프가 아니라 테두리로 그린다.
  팀 칸 수(TEAMS)·줄 높이(LINE_MM·ROOMY_LINE_MM)는 상수 — 1장을 넘으면 줄이고 다시 돌린다.
  PDF 쪽수는 pymupdf 로 재서 콘솔에 찍는다.

출력 (ministry/ 폴더) — 각각 .html(원본) + .pdf(인쇄용, 크롬 없으면 건너뜀)
  2027_부서소개서_A4
  2027_사역팀소개서_A4
"""
import io, os, subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..')
OUT_DIR = os.path.join(ROOT, 'ministry')
MARK = io.open(os.path.join(ROOT, 'marketing', 'logo-mark-data-uri.txt'), encoding='utf-8').read().strip()

# 사역신청서(ministry-apply-form-gen.py)와 같은 톤
NAVY = '#123059'
GOLD = '#765700'
PEN = '#1d4ea3'   # 작성 예시의 손글씨 색

# ── 지면 상수(실측 뒤 조정하는 자리) ────────────────────────────────
TEAMS = 4             # 부서 소개서 한 장에 들어가는 팀 칸
LINE_MM = 8           # 손글씨 한 줄 높이(부서 소개서)
ROOMY_LINE_MM = 9.5   # 사역팀 소개서 — 한 장을 한 팀이 쓰니 넉넉히(아래 여백은 작성 방법 자리로 비워 둔다)
FONT_PT = 9.2
BIGO_LINES = 5        # 사역팀 소개서 비고 줄 — 칸은 쪽 끝까지 늘고, 줄은 그 안에 고르게 벌어진다

# 앱 MIN_POSITIONS 에서 「학생」만 뺐다 — 부서를 대표해 적는 분이라.
POSITIONS = ['성도', '집사', '권사', '안수집사', '장로', '전도사', '목사', '사모']
DAYS = ['주일', '금요일', '토요일', '평일(월~목)']
FREQS = ['매주', '격주(교대형식)', '매달', '그때그때']
KINDS = ['성도 신청', '임명직']


def esc(s):
    return (s or '').replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def opts(labels, kind, on=()):
    """kind='rd' 동그라미(하나만) · 'ck' 네모(여럿) · on=표시해 둘 보기(작성 예시)"""
    return '<span class="opts">' + ''.join(
        '<span class="o"><i class="%s%s"></i>%s</span>' % (kind, ' on' if s in on else '', s)
        for s in labels) + '</span>'


def ln(cls='', text=''):
    """밑줄 한 칸 — text 가 있으면 손글씨로 채운다(작성 예시)."""
    return '<span class="ln %s">%s</span>' % (cls, '<span class="v">%s</span>' % esc(text) if text else '')


def lines(n, label='', texts=()):
    """밑줄 n줄 — 첫 줄에만 이름표를 단다. texts[i] 가 있으면 i번째 줄을 채운다."""
    texts = list(texts) + [''] * n
    return ''.join('<div class="row"><span class="lb">%s</span>%s</div>'
                   % (label if i == 0 else '', ln('grow', texts[i])) for i in range(n))


def sec(num, tag, inner, cls=''):
    return ('<div class="sec %s"><div class="tag"><span class="num">%s</span>%s</div>'
            '<div class="body">%s</div></div>' % (cls, num, tag, inner))


def doc_head(title, sub, right=''):
    return ('<div class="doc-head"><img src="%s"><div class="ttl"><h1>%s</h1>'
            '<div class="sub">%s</div></div>%s</div>' % (MARK, title, sub, right))


def team_block(n):
    return ("""
<div class="team">
  <div class="no">%(n)d</div>
  <div class="tb">
    <div class="row"><span class="lb">팀 이름</span>%(ln)s
      <span class="lb2">구분</span>%(kind)s
      <span class="lb2">필요 인원</span>%(cap)s<span class="unit">명</span></div>
    <div class="row"><span class="lb">요일</span>%(days)s
      <span class="sep"></span><span class="lb2">주기</span>%(freqs)s</div>
    <div class="row"><span class="lb">주일 시각</span>%(hm)s
      <span class="sep"></span><span class="lb2">시간(문장)</span>%(ln)s</div>
    <div class="row"><span class="lb">하는 일</span>%(ln)s</div>
    <div class="row"><span class="lb"></span>%(ln)s</div>
  </div>
</div>""" % {'n': n, 'ln': ln('grow'), 'kind': opts(KINDS, 'rd'),
             'cap': ln('w-cap'), 'days': opts(DAYS, 'ck'), 'freqs': opts(FREQS, 'ck'),
             'hm': hhmm()})


def hhmm(t_from='', t_to=''):
    """__:__ ~ __:__ — 'HH:MM' 을 주면 칸마다 나눠 채운다."""
    a = (t_from.split(':') + [''])[:2] if t_from else ['', '']
    b = (t_to.split(':') + [''])[:2] if t_to else ['', '']
    return ('%s<span class="unit">:</span>%s<span class="unit tilde">~</span>%s<span class="unit">:</span>%s'
            % (ln('w-t', a[0]), ln('w-t', a[1]), ln('w-t', b[0]), ln('w-t', b[1])))


STYLE = """
@page { size: A4; margin: 10mm 12mm 8mm; }
* { box-sizing:border-box; }
html, body { margin:0; }
body { font-family:'맑은 고딕','Malgun Gothic',sans-serif; color:#111; font-size:%(fpt)spt; }

.doc-head { display:flex; align-items:center; gap:3.5mm; border-bottom:0.9mm solid %(navy)s;
            padding-bottom:2.2mm; margin-bottom:2.6mm; }
.doc-head img { height:12mm; width:auto; flex:0 0 auto; }
.doc-head .ttl { flex:1; }
.doc-head h1 { font-size:18pt; font-weight:800; color:%(navy)s; margin:0; line-height:1.15; }
.doc-head .sub { font-size:8.6pt; color:#333; margin-top:0.8mm; line-height:1.45; word-break:keep-all; }
.doc-head .page { flex:0 0 auto; align-self:flex-end; display:flex; align-items:flex-end; gap:1.2mm;
                  font-size:9pt; color:#333; }
.doc-head .page .ln { flex:0 0 8mm; }

.sec { display:flex; border:0.35mm solid #8d8d8d; border-radius:1.5mm; margin-bottom:2.4mm; overflow:hidden; }
.sec .tag { flex:0 0 13mm; background:%(navy)s; color:#fff; font-weight:700; font-size:9pt;
            display:flex; flex-direction:column; align-items:center; justify-content:center;
            line-height:1.3; text-align:center; }
.sec .tag .num { font-size:8pt; color:#d9c89a; }
.sec .body { flex:1; padding:0.6mm 3mm 1.6mm; }

.row { display:flex; align-items:flex-end; gap:1.6mm; flex:0 0 %(line)smm; height:%(line)smm;
       white-space:nowrap; }
.lb  { flex:0 0 15mm; font-weight:700; color:%(navy)s; padding-bottom:0.9mm; }
.lb2 { flex:0 0 auto; font-weight:700; color:%(navy)s; padding-bottom:0.9mm; margin-left:1.4mm; }
.unit { flex:0 0 auto; padding-bottom:0.9mm; color:#333; }
.unit.tilde { margin:0 0.8mm; }
.ln  { display:flex; align-items:flex-end; border-bottom:0.3mm solid #8a8a8a; height:5mm; }
.ln.grow { flex:1 1 auto; min-width:10mm; }
.ln.w-cap { flex:0 0 11mm; }
.ln.w-t { flex:0 0 7.5mm; }
.ln.w-name { flex:0 0 34mm; }
.ln.w-gu { flex:0 0 22mm; }
.ln.w-mok { flex:0 0 18mm; }
.sep { flex:0 0 0; align-self:stretch; border-left:0.3mm dotted #b5b5b5; margin:1.4mm 1.2mm 0.8mm; }

.opts { display:flex; align-items:center; gap:2.1mm; padding-bottom:0.9mm; }
.o { display:flex; align-items:center; gap:0.9mm; }
.o i { display:block; flex:0 0 auto; width:3.4mm; height:3.4mm; border:0.3mm solid #444; position:relative; }
.o i.rd { border-radius:50%%; }
.o i.ck { border-radius:0.5mm; }

.note { font-size:7.6pt; color:#666; padding-bottom:1mm; }
.row .note { flex:0 1 auto; margin-left:2mm; padding-bottom:1.1mm; }

.teams-head { display:flex; align-items:center; gap:2.4mm; margin:0.4mm 0 1.4mm; }
.teams-head .t { background:%(navy)s; color:#fff; font-weight:700; font-size:9pt;
                 padding:0.9mm 2.6mm; border-radius:1mm; flex:0 0 auto; }
.hint { font-size:7.8pt; color:#333; line-height:1.5; background:#f3efe4; border-left:0.9mm solid %(gold)s;
        padding:1mm 2.4mm; margin-bottom:1.8mm; word-break:keep-all; }
.hint b { color:%(navy)s; }
.hint .ex { display:inline-flex; align-items:center; gap:0.8mm; vertical-align:-0.6mm; }
.hint .ex i { display:inline-block; width:3mm; height:3mm; border:0.3mm solid #444; }
.hint .ex i.rd { border-radius:50%%; }
.hint .ex i.ck { border-radius:0.5mm; }

.team { display:flex; border:0.35mm solid #8d8d8d; border-radius:1.5mm; margin-bottom:2mm;
        break-inside:avoid; overflow:hidden; }
.team .no { flex:0 0 8mm; background:#e9edf3; color:%(navy)s; font-weight:800; font-size:11pt;
            display:flex; align-items:center; justify-content:center; border-right:0.3mm solid #c5ccd6; }
.team .tb { flex:1; padding:0 3mm 1.4mm; }

/* 사역팀 소개서 — 한 장을 한 팀이 쓴다: 줄을 넓히고, 칸마다 적는 법을 바로 밑에 */
.roomy .row { flex-basis:%(roomy)smm; height:%(roomy)smm; }
.roomy .lb { flex-basis:18.5mm; }
.roomy .sec { margin-bottom:2.6mm; }
.roomy .how { font-size:7.8pt; color:#555; line-height:1.4; margin:0.6mm 0 0.4mm 20.1mm;
              white-space:normal; word-break:keep-all; }
.roomy .how b { color:%(navy)s; font-weight:700; }
/* 작성 예시 — 손으로 적은 것처럼(파란 펜). 표시는 글리프가 아니라 테두리로 그린다(빈 글리프 함정). */
.ln .v { font-family:'Nanum Pen Script','맑은 고딕',cursive; color:%(pen)s; font-size:15.5pt; line-height:1;
         padding:0 1.4mm 0.1mm; white-space:nowrap; }
.ln.w-t .v { padding:0; margin:0 auto; }
.o i.on.rd::after { content:''; position:absolute; left:0.5mm; top:0.5mm; right:0.5mm; bottom:0.5mm;
                    border-radius:50%%; background:%(pen)s; }
.o i.on.ck::after { content:''; position:absolute; left:0.95mm; top:-1mm; width:1.35mm; height:3mm;
                    border:solid %(pen)s; border-width:0 0.6mm 0.6mm 0; transform:rotate(40deg); }
.doc-head .sample { flex:0 0 auto; align-self:center; border:0.45mm solid %(pen)s; color:%(pen)s;
                    font-weight:800; font-size:10pt; padding:1mm 2.6mm; border-radius:1.2mm; }

/* 마지막 칸(비고)이 남은 높이를 채운다 — 줄을 더해 맞추면 크롬 판에 따라 2장으로 넘친다.
   쪽 높이(297 - 위 10 - 아래 8 = 279mm)보다 2mm 작게 잡아 여유를 둔다. */
body.roomy { height:%(page_h)smm; display:flex; flex-direction:column; }
.roomy .sec.fill { flex:1 1 auto; margin-bottom:0; }
.roomy .sec.fill .body { display:flex; flex-direction:column; justify-content:space-between; }
""" % {'navy': NAVY, 'gold': GOLD, 'fpt': FONT_PT, 'line': LINE_MM, 'roomy': ROOMY_LINE_MM,
       'page_h': 277, 'pen': PEN}

# ── 두 양식이 함께 쓰는 ① 작성자 ─────────────────────────────────────
WRITER = sec('①', '작성자', """
  <div class="row"><span class="lb">이름</span>%(name)s
    <span class="lb2">교구</span>%(gu)s<span class="lb2">목장</span>%(mok)s
    <span class="lb2">전화번호</span>%(phone)s</div>
  <div class="row"><span class="lb">직분</span>%(pos)s</div>
  <div class="note">전화번호는 적어 주신 내용을 여쭐 때만 쓰고, 앱에는 올리지 않습니다.</div>
""" % {'name': ln('w-name'), 'gu': ln('w-gu'), 'mok': ln('w-mok'), 'phone': ln('grow'),
       'pos': opts(POSITIONS, 'rd')})


def dept_page():
    head = doc_head('2027 부서 소개서',
                    '적어 주신 내용은 2027 사역신청 때 성도님이 사역을 고르시는 안내로 그대로 쓰입니다.',
                    '<div class="page">쪽 %s / %s</div>' % (ln(), ln()))
    dept = sec('②', '부서', lines(1, '부서명') + lines(3, '부서 소개'))
    hint = ('<div class="hint">'
            '<span class="ex"><i class="rd"></i></span> 는 <b>하나만</b>, '
            '<span class="ex"><i class="ck"></i></span> 는 <b>해당하는 것 모두</b> · '
            '<b>평일은 월~목</b>(금요일은 따로) · '
            '<b>주기</b>는 팀이 아니라 <b>한 분이 서는 주기</b> · '
            '<b>주일 시각</b>은 주일 사역만 24시간 꼴(예 13:30), 다른 날은 「시간(문장)」에 · '
            '임명직은 팀 이름만 · 모르는 칸은 비워 두시고, <b>팀이 더 있으면 이 장을 더 뽑아</b> 쪽을 적어 주세요.'
            '</div>')
    teams = ('<div class="teams-head"><span class="t">③ 사역팀</span></div>' + hint
             + ''.join(team_block(i + 1) for i in range(TEAMS)))
    return '2027 부서 소개서', '', head + WRITER + dept + teams


def team_page(ex=None):
    """ex 를 주면 그 값으로 채운 「작성 예시」가 된다(EXAMPLES 참고)."""
    ex = ex or {}
    how = lambda s: '<div class="how">%s</div>' % s
    head = doc_head('2027 사역팀 소개서',
                    '<b>팀마다 한 장</b>씩 적어 주세요. 적어 주신 내용은 2027 사역신청 때 '
                    '성도님이 사역을 고르시는 안내로 그대로 쓰입니다.',
                    '<div class="sample">작성 예시</div>' if ex else '')
    team = sec('②', '팀', (
        lines(1, '부서명', [ex.get('committee', '')])
        + lines(1, '팀 이름', [ex.get('team', '')])
        + '<div class="row"><span class="lb">구분</span>%s'
          '<span class="note">임명직이면 ③부터는 비워 두셔도 됩니다</span></div>'
          % opts(KINDS, 'rd', [ex['kind']] if ex.get('kind') else [])))
    when = sec('③', '언제', (
        '<div class="row"><span class="lb">요일</span>%s</div>' % opts(DAYS, 'ck', ex.get('days', []))
        + how('해당하는 요일에 <b>모두</b> 표시해 주세요. <b>금요일은 평일에 넣지 않습니다</b> — 평일은 월~목입니다.')
        + '<div class="row"><span class="lb">주기</span>%s</div>' % opts(FREQS, 'ck', ex.get('freqs', []))
        + how('팀이 모이는 주기가 아니라 <b>한 분이 실제로 서는 주기</b>입니다. 여럿 고르셔도 됩니다 '
              '(예: 팀은 매주 모여도 넷이 돌아가며 서면 「매달」).')
        + '<div class="row"><span class="lb">주일 시각</span>%s</div>' % hhmm(ex.get('from', ''), ex.get('to', ''))
        + how('<b>주일 사역만</b> 24시간 꼴로 적어 주세요(예: 09:30 ~ 11:00).')
        + lines(2, '시간(문장)', ex.get('sched', []))
        + how('성도님 화면에 그대로 보이는 한 줄입니다(예: 매주 화 오전 10시, 예배 30분 전 모임). '
              '주일이 아닌 사역의 시간은 여기에 적어 주세요.')))
    about = sec('④', '안내', (
        lines(5, '하는 일', ex.get('desc', []))
        + how('이름만 보고는 알 수 없는 것을 적어 주세요(예: 오병이어 1팀과 2팀이 무엇이 다른지).')
        + '<div class="row"><span class="lb">필요 인원</span>%s<span class="unit">명</span>'
          '<span class="note">참고로만 보여 드리고, 신청을 막지 않습니다</span></div>'
          % ln('w-cap', ex.get('capacity', ''))))
    etc = sec('⑤', '비고', lines(BIGO_LINES, '전하실 말', ex.get('note', [])), 'fill')
    return '2027 사역팀 소개서', 'roomy', head + WRITER + team + when + about + etc


# ── HTML → PDF ───────────────────────────────────────────────────────
CHROME_CANDS = [
    r'C:\Program Files\Google\Chrome\Application\chrome.exe',
    r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
    os.path.join(os.environ.get('LOCALAPPDATA', ''), r'Google\Chrome\Application\chrome.exe'),
]
chrome = next((c for c in CHROME_CANDS if c and os.path.exists(c)), None)


HAND_FONT = ('<link rel="stylesheet" '
             'href="https://fonts.googleapis.com/css2?family=Nanum+Pen+Script&display=block">')


def build(stem, page, head_extra=''):
    title, body_cls, body = page()
    html = ('<!doctype html><html lang="ko"><head><meta charset="utf-8">'
            '<title>%s</title>%s<style>%s</style></head><body class="%s">%s</body></html>'
            % (title, head_extra, STYLE, body_cls, body))
    out_html = os.path.join(OUT_DIR, stem + '.html')
    io.open(out_html, 'w', encoding='utf-8', newline='').write(html)
    print('wrote:', os.path.relpath(out_html, ROOT))
    if not chrome:
        print('!! 크롬을 못 찾아 PDF는 건너뜁니다 — HTML을 열어 직접 인쇄하세요.')
        return
    out_pdf = os.path.join(OUT_DIR, stem + '.pdf')
    subprocess.run([chrome, '--headless', '--disable-gpu', '--no-pdf-header-footer',
                    '--print-to-pdf=' + os.path.abspath(out_pdf),
                    '--virtual-time-budget=8000',
                    'file:///' + os.path.abspath(out_html).replace(os.sep, '/')],
                   capture_output=True)
    if os.path.exists(out_pdf):
        print('wrote:', os.path.relpath(out_pdf, ROOT))
        try:
            import pymupdf
            print('  페이지 수:', pymupdf.open(out_pdf).page_count, '(목표 1장)')
        except ImportError:
            pass


# ── 작성 예시 ────────────────────────────────────────────────────────
# 운영 DB ministry_catalog(2027) 값을 2026-09-17에 옮겨 적었다 — 관리자 화면(사역팀 정보)에서
# 담당자가 넣은 실제 값이다(방송전산부에서 「· 예시」 꼬리표가 없는 팀은 이 하나).
# ⚠️ 작성자·필요 인원·비고는 자료에 없어 비워 둔다 — 지어내지 않는다.
EXAMPLES = {
    '방송실운영': {
        'committee': '방송전산부', 'team': '방송실 운영', 'kind': '성도 신청',
        'days': ['주일', '금요일'], 'freqs': ['매주', '격주(교대형식)', '매달'],
        'from': '06:30', 'to': '16:30',
        'sched': ['주일 1,2,3,오후 예배, 금요 성령집회'],
        'desc': ['카메라 조정, 자막 송출, 영상 전환(스위처), 음향 운영'],
    },
}

build('2027_부서소개서_A4', dept_page)
build('2027_사역팀소개서_A4', team_page)
for key, ex in EXAMPLES.items():
    build('2027_사역팀소개서_A4_예시_' + key, lambda ex=ex: team_page(ex), HAND_FONT)
