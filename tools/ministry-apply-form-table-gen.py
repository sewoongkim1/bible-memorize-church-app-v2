# -*- coding: utf-8 -*-
"""2026 사역신청서 · 표 형식 시안 — 다른 교회 양식(이삭교회 2022 사역지원서)을
성도님이 보여주며 "이런 형식으로" 요청해 만든 대안 디자인.

⚠️ **기존 것을 대체하지 않는다.** `tools/ministry-apply-form-gen.py`
(→ `2026_사역신청서_A4.pdf`, 3단 체크리스트·A4 2장)는 그대로 둔다 — 이 파일은
같은 데이터를 다른 표 형식으로 보여주는 **별도 시안**이다(성도님 지시:
"기존건 그대로 두고"). 어느 쪽으로 최종 인쇄할지는 아직 정하지 않았다.

■ 원본 형식에서 가져온 것
  금색·크림색 톤, 굵은 표제, 이중 테두리 개인정보 상자, ">> ~해 주십시오" 안내
  문구, 「구분 | 시간 | 사역신청(체크박스)」 3단 표를 부서마다 번호를 매겨 나열.
  우리 쪽 실제 규칙(최대 3개·우선순위, 사역 임명 원칙 6조, 교구·목장 식별)은
  원본에 없어도 그대로 유지했다 — 형식만 빌리고 내용까지 원본을 따르지 않는다.

■ 시간(스케줄) 데이터 — 대부분 예시다
  ministry_catalog_2026_draft.json 의 schedule_note 는 찬양부 일부(찬양대·
  오케스트라)만 실제로 확인됐고 나머지는 비어 있다(부서 확인 대기 중,
  design doc 09-2장). 성도님 요청("샘플이니 시간은 예상해서 넣어주세요")에
  따라 비어 있는 자리는 SCHEDULE_EXAMPLES 로 그럴듯한 예시를 채운다 —
  **실제 확인된 시간이 아니다.** 페이지 맨 위에 눈에 띄게 경고를 둔다.

■ 표 구성 — 데이터를 그대로 옮기지 않고 (구분·시간·kind) 로 다시 묶는다
  같은 중분류(구분)·같은 시간대·같은 kind(신청/임명)를 공유하는 연속 항목은
  체크박스를 한 행에 나란히 담는다(원본의 "미취학부 | 오전 10:40 | 영아부
  유아부 유치부" 한 행과 같은 방식). 시간이 팀마다 다르면(예: 찬양대) 행을
  나눈다(원본의 찬양대 표가 팀마다 다른 시간을 각자 한 행에 담는 것과 같다).
  같은 구분이 연속된 행은 rowspan 으로 합쳐 구분 칸을 반복하지 않는다.

사용법: python tools/ministry-apply-form-table-gen.py
출력:   ministry/2026_사역신청서_표형식.html
        ministry/2026_사역신청서_표형식.pdf (크롬 있으면)
"""
import io, os, json, subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..')
OUT_DIR = os.path.join(ROOT, 'ministry')
CATALOG = os.path.join(OUT_DIR, 'ministry_catalog_2026_draft.json')

with io.open(CATALOG, encoding='utf-8') as f:
    ROWS = json.load(f)

COMMITTEES = []
seen = set()
for r in ROWS:
    if r['committee'] not in seen:
        seen.add(r['committee'])
        COMMITTEES.append(r['committee'])

# ── 예시 시간 — 부서 확인 전 자리 채우기용(실제 아님) ──────────────────
# key: (committee, group) 우선, 없으면 committee 만으로 기본값.
SCHEDULE_EXAMPLES = {
    ("교육위원회", ""): "비정기 (부서 협의)",
    ("교육위원회", "사랑부·어와나"): "주일 오후 1:30",
    ("교육위원회", "미취학"): "주일 오전 10:40",
    ("교육위원회", "아동"): "주일 오전 10:40",
    ("교육위원회", "청소년"): "주일 오전 11:00",
    ("교육위원회", "장년"): "주중 화요일 오전 10:00",
    ("교회봉사부", ""): "주일 예배 전후",
    ("문화스포츠부", ""): "월 1회 (요일 협의)",
    ("방송전산부", ""): "주일 예배 시간",
    ("새가족부", ""): "주일 오전",
    ("선교부", ""): "월 1회 정기모임",
    ("예배부", ""): "주일 예배 30분 전",
    ("제자양육부", ""): "주중 저녁 (요일 협의)",
    ("전도부", ""): "요일 협의",
    ("차량부", ""): "주일 예배 시간",
    ("찬양부", "찬양팀"): "토요일 오후 리허설",
    ("찬양부", ""): "예배 전 기도",
    ("희망의복지재단(사회봉사센터)", ""): "주중 (요일 협의)",
    ("L-12(목양부)", ""): "월 1회",
    ("총무부", ""): "비정기",
    ("시설부", ""): "주중 비정기",
}


def example_schedule(r):
    if r['kind'] == 'appoint':
        return ''  # 지명 자리는 성도가 시간을 맞출 필요가 없다
    if r['schedule_note']:
        return r['schedule_note']  # 실제로 확인된 값은 그대로 — 예시로 덮지 않는다
    return SCHEDULE_EXAMPLES.get((r['committee'], r['group']),
                                  SCHEDULE_EXAMPLES.get((r['committee'], ''), '요일 협의'))


PRINCIPLES = [
    '등록식 후 <b>3개월 이상 성실히 출석</b>한 성도만 신청할 수 있습니다.',
    '한 분이 신청할 수 있는 사역은 <b>최대 3개</b>입니다(자치회장도 계수에 포함합니다).',
    '부장·팀장·회계·찬양대지휘자·자치회장은 <b>다른 부서의 같은 성격 사역을 겸직</b>할 수 없습니다.',
    '<b>교사와 찬양대원은 겸직</b>할 수 없습니다(새하늘찬양대는 예외입니다).',
    '신청 후 <b>임명을 받아야</b> 사역을 시작합니다 — 확정 여부는 게시판에서 확인해 주세요.',
    '사역 신청은 <b>해마다 다시</b> 받습니다.',
]

NAVY = '#123059'    # 우리 원래 신청서와 같은 남색 — 원칙 박스·제출란은 이 색으로 통일
GOLD = '#a9761f'    # 참고 양식 톤에 맞춘 진한 금색(인쇄 시 잘 보이도록 낮춘 채도)
GOLD_FILL = '#e7cf9c'
CREAM = '#f6efdc'
CREAM_LINE = '#e3d4ab'


def esc(s):
    return (s or '').replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def build_buckets(committee):
    """같은 (구분, 신청/임명)이면 시간이 팀마다 달라도 한 행에 모은다(2026-09-07,
    "찬양대를 모아서" — 처음엔 시간이 다르면 행을 나눴는데, 한 부서 한 행이
    지면을 훨씬 아낀다). 시간이 팀마다 다르면 행의 「시간」 칸은 비우고 각
    체크박스 옆에 그 팀만의 시간을 작게 적는다(찬양대·오케스트라가 이 경우)."""
    rows = [r for r in ROWS if r['committee'] == committee]
    buckets = []
    i = 0
    while i < len(rows):
        r = rows[i]
        key = (r['group'], r['kind'])
        j = i
        members = []
        while j < len(rows) and (rows[j]['group'], rows[j]['kind']) == key:
            members.append(rows[j])
            j += 1
        scheds = set(example_schedule(m) for m in members)
        uniform_sched = scheds.pop() if len(scheds) == 1 else ''
        buckets.append({'group': r['group'], 'schedule': uniform_sched, 'kind': r['kind'],
                         'members': members, 'option': members[0]['option_note']})
        i = j
    return buckets


def checkbox_cell(bucket):
    items = []
    show_inline_time = not bucket['schedule']  # 행 전체가 공유하는 시간이 없으면 팀별로 적는다
    for m in bucket['members']:
        disabled = bucket['kind'] == 'appoint'
        cls = 'chk-item disabled' if disabled else 'chk-item'
        tag = ' <span class="tag">지명</span>' if disabled else ''
        sched = example_schedule(m)
        time_tag = (' <span class="mini-time">(%s)</span>' % esc(sched)
                    ) if (show_inline_time and sched) else ''
        items.append('<span class="%s"><span class="box"></span>%s%s%s</span>'
                      % (cls, esc(m['team']), time_tag, tag))
    opt = ('<div class="opt-note">%s</div>' % esc(bucket['option'])) if bucket['option'] else ''
    return '<div class="chk-wrap">' + ''.join(items) + '</div>' + opt


def render_committee_table(idx, committee):
    buckets = build_buckets(committee)
    if not buckets:
        return ''
    # 구분(그룹) 이 연속으로 같은 버킷은 rowspan 으로 합친다
    spans = []  # (start_index, length)
    i = 0
    while i < len(buckets):
        g = buckets[i]['group']
        j = i
        while j < len(buckets) and buckets[j]['group'] == g:
            j += 1
        spans.append((i, j - i))
        i = j
    span_at = {}
    for start, length in spans:
        span_at[start] = length

    trs = []
    for k, b in enumerate(buckets):
        group_cell = ''
        if k in span_at:
            label = esc(b['group']) if b['group'] else '&mdash;'
            rs = ' rowspan="%d"' % span_at[k] if span_at[k] > 1 else ''
            group_cell = '<td class="c-group"%s>%s</td>' % (rs, label)
        row_cls = ' class="appoint-row"' if b['kind'] == 'appoint' else ''
        trs.append('<tr%s>%s<td class="c-time">%s</td><td class="c-chk">%s</td></tr>'
                    % (row_cls, group_cell, esc(b['schedule']), checkbox_cell(b)))

    return ('<div class="dept">'
            '<div class="dept-h">%d) %s</div>'
            '<table><thead><tr><th class="w-group">구분</th><th class="w-time">시간</th>'
            '<th>사역 신청</th></tr></thead><tbody>%s</tbody></table>'
            '</div>' % (idx, esc(committee), ''.join(trs)))


STYLE = """
@page { size: A4; margin: 9mm 10mm 9mm; }
* { box-sizing:border-box; }
body { margin:0; font-family:'맑은 고딕','Malgun Gothic',sans-serif; color:#2b2416;
       font-size:9pt; background:%(cream)s; }

.warn { background:#fde9e9; border:0.4mm solid #d98c8c; color:#7a2323; border-radius:1.6mm;
        padding:1.4mm 3mm; font-size:8.2pt; font-weight:700; margin-bottom:2mm; word-break:keep-all; }

.doc-head { text-align:center; padding:1.6mm 0 2mm; border-bottom:1mm solid %(gold)s; margin-bottom:2.2mm; }
.doc-head h1 { margin:0; font-size:20pt; font-weight:800; color:%(gold)s; letter-spacing:.5pt; }
.doc-head .sub { font-size:8.4pt; color:#6b5a35; margin-top:1mm; }

.principles { border:0.4mm solid %(navy)s; border-radius:1.6mm; padding:1.8mm 3.6mm; margin-bottom:2mm; background:#fff; }
.principles .t { font-size:9pt; font-weight:800; color:%(navy)s; margin-bottom:0.8mm; }
.principles ol { margin:0; padding-left:4.5mm; }
.principles li { font-size:8pt; line-height:1.4; margin-bottom:0.2mm; word-break:keep-all; }
.principles b { color:%(gold)s; }

.info-box { border:0.6mm double %(gold)s; border-radius:1.6mm; background:#fff; margin-bottom:2mm; overflow:hidden; }
.info-row { display:flex; border-bottom:0.35mm solid %(cream_line)s; }
.info-row:last-child { border-bottom:none; }
.info-cell { flex:1; display:flex; align-items:baseline; gap:1.6mm; padding:1.4mm 3mm; border-right:0.35mm solid %(cream_line)s; }
.info-cell:last-child { border-right:none; }
.info-cell b { color:%(gold)s; font-size:8.3pt; white-space:nowrap; }
.info-cell .blank { flex:1; border-bottom:0.3mm solid #b3a171; height:3.6mm; }

.instr { font-size:8.6pt; font-weight:700; color:%(navy)s; margin-bottom:2mm; }
.instr .chk { color:%(gold)s; }

.dept { break-inside:avoid; margin-bottom:1.8mm; }
.dept-h { background:%(navy)s; color:#fff; font-size:9.4pt; font-weight:800; padding:0.9mm 2.4mm;
          border-radius:1.2mm 1.2mm 0 0; }
table { width:100%%; border-collapse:collapse; background:#fff; }
thead th { background:%(gold_fill)s; color:#5a3f10; font-size:8pt; font-weight:800;
           padding:0.9mm 2mm; border:0.3mm solid %(cream_line)s; text-align:center; }
.w-group { width:22mm; } .w-time { width:24mm; }
tbody td { border:0.3mm solid %(cream_line)s; padding:1.1mm 2.2mm; vertical-align:middle; font-size:8.3pt; }
.c-group { text-align:center; font-weight:800; color:%(gold)s; background:#fbf6ea; font-size:8pt; }
.c-time { text-align:center; color:#555; white-space:nowrap; }
tr.appoint-row .c-time { color:#999; }

.chk-wrap { display:flex; flex-wrap:wrap; gap:1.4mm 4.5mm; }
.chk-item { display:flex; align-items:baseline; gap:1.2mm; white-space:nowrap; }
.chk-item .box { display:inline-block; width:3.2mm; height:3.2mm; border:0.32mm solid #555; margin-top:0.2mm; }
.chk-item.disabled .box { background:#ccc; border-color:#999; }
.chk-item.disabled { color:#888; }
.chk-item .tag { font-size:6.8pt; color:#999; }
.chk-item .mini-time { font-size:7pt; color:#8a6a2f; }
.opt-note { font-size:7.2pt; color:#8a6a2f; font-style:italic; margin-top:0.6mm; }

.submit-line { margin-top:2mm; border-top:0.4mm solid %(gold)s; padding-top:2mm; break-inside:avoid; }
.submit-line .row { display:flex; gap:5mm; margin-bottom:1.8mm; font-size:8.6pt; }
.submit-line .row .cell { flex:1; display:flex; align-items:baseline; gap:1.6mm; }
.submit-line .row b { color:%(navy)s; white-space:nowrap; }
.submit-line .row .blank { flex:1; border-bottom:0.3mm solid #999; height:3.6mm; }
.submit-line .pledge { font-size:8.8pt; text-align:center; color:#222; word-break:keep-all; }
.submit-line .pledge b { color:%(navy)s; }
""" % {'navy': NAVY, 'gold': GOLD, 'gold_fill': GOLD_FILL, 'cream': CREAM, 'cream_line': CREAM_LINE}

warn = ('<div class="warn">⚠️ 이 문서는 표 형식 시안입니다. 「시간」 칸은 대부분 아직 부서 '
        '확인 전 예시이며(찬양대·오케스트라만 실제 확인됨), 실제 사역 시간이 아닙니다.</div>')

head = ('<div class="doc-head"><h1>2026년도 사역신청서</h1>'
        '<div class="sub">고척교회 성도님, 아래 원칙을 읽으시고 원하시는 사역을 표시해 주세요.</div></div>')

principles = ('<div class="principles"><div class="t">사역 임명 원칙</div><ol>'
              + ''.join('<li>%s</li>' % p for p in PRINCIPLES) + '</ol></div>')

info_box = ('<div class="info-box">'
            '<div class="info-row">'
            '<div class="info-cell"><b>성명</b><span class="blank"></span></div>'
            '<div class="info-cell"><b>교구·목장</b><span class="blank"></span></div>'
            '<div class="info-cell"><b>직분</b><span class="blank"></span></div>'
            '</div><div class="info-row">'
            '<div class="info-cell"><b>성별</b><span class="blank">&nbsp;남&nbsp;&nbsp;·&nbsp;&nbsp;여&nbsp;(해당란에 ○)</span></div>'
            '<div class="info-cell" style="flex:2"><b>연락처(휴대폰)</b><span class="blank"></span></div>'
            '</div></div>')

instr = ('<div class="instr">&gt;&gt; 아래 목록에서 원하시는 사역의 신청란에 '
         '<span class="chk">✔</span> 표시해 주세요. <b>최대 3개</b>까지, 앞 네모 칸에 순서대로 '
         '<b>1 · 2 · 3</b>을 적어 주시면 됩니다. <b>회색 칸(지명)</b>은 신청이 아니라 임명 자리입니다.</div>')

tables = ''.join(render_committee_table(i, c) for i, c in enumerate(COMMITTEES, start=1))

submit = ("""
<div class="submit-line">
  <div class="pledge">위 내용으로 <b>2026년도 사역</b>을 신청합니다.</div>
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
        '<title>2026 사역신청서(표형식 시안)</title><style>' + STYLE + '</style></head><body>'
        + warn + head + principles + info_box + instr + tables + submit + '</body></html>')

out_html = os.path.join(OUT_DIR, '2026_사역신청서_표형식.html')
io.open(out_html, 'w', encoding='utf-8', newline='').write(html)
print('wrote:', os.path.relpath(out_html, ROOT))

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
out_pdf = os.path.join(OUT_DIR, '2026_사역신청서_표형식.pdf')
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
            print('페이지 수:', doc.page_count)
        except ImportError:
            pass
else:
    print('!! 크롬을 못 찾아 PDF는 건너뜁니다 - HTML을 열어 직접 인쇄하세요.')
