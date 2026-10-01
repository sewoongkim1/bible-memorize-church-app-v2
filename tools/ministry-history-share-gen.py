# -*- coding: utf-8 -*-
"""사역 이력 — 홈페이지 사역신청 명단에서 교적관리 프로그램까지 · 공유 문서(A4 다섯 쪽)

■ 무엇인가
  해마다 홈페이지에 올린 사역신청(임명) 명단(2022~2026)을 한 표로 모으고, 줄마다 교적(교인명부)의
  교인ID 를 이어, 교적관리 프로그램(가칭 · 교회 어드민 admin.onlybible.kr)에 넣고, 사람별·부서별·
  연도별로 보며, 이의제기로 고쳐 늘 최신으로 쓰는 흐름을 정리했다(친구 요청 2026-10-01).
  ⑤ 이의제기는 **본인이 성경말씀 암송 앱에서 이전 사역기록 정정을 신청하고 처리 현황을 바로 확인**하는 방식(친구 2026-10-01).
  ⚠️ 아직 없는 기능이라 「계획」으로 적는다. 앱 계정은 교인ID 와 이어져 있지 않고(사역 이력 설계 §12),
     앱 로그인은 본인 확인이 아니다(이름·소속만) — 그래서 담당자 확인 뒤 반영 · 계정-교적 연결이 먼저라고 문서에 적는다.
  받는 분은 앞선 「2027 사역신청 진행 공유」와 같다 — 목사님·부서장님(개발 용어를 쓰지 않는다).

■ 사실만 적는다 — 출처
  · 해마다 줄·부서·팀·신규/유지 수: church-admin/Data/2022-2026_사역임명_통합.xlsx 를 세어 확인(2026-10-01).
    ⚠️ 그 파일의 「비고」 칸에는 사람 이름이 들어 있다 — 이 문서에는 수와 사유 분류만 쓴다.
  · 교적 연결 결과(4,042 / 51)와 맞춤 규칙: docs/superpowers/specs/2026-10-01-church-admin-ministry-history-design.md §4·§4.7
    (2026-09-29 교인명부 기준 시험 실행).
  · 「사역 이력」 메뉴·자세히 창 탭은 **만드는 중**(설계·계획만 있다) — 문서에 「만드는 중」으로 적는다.
  · 날짜는 앞선 공유 문서처럼 신청을 「12월 중순」으로만 적는다(성도님 지시 2026-09-17).
  사실이 바뀌면 YEARS·RESULT·STATUS 를 고치고 다시 돌린다.

■ 지면 — 실측
  다섯 쪽(쪽마다 break-before). 한 절이 넘치면 쪽수가 늘어난다 — pymupdf 로 쪽수·서체(Type0)를 재서 찍는다.

출력: ministry/2026_사역이력_공유_A4.html · .pdf
"""
import io, os, subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..')
OUT_DIR = os.path.join(ROOT, 'ministry')
MARK = io.open(os.path.join(ROOT, 'marketing', 'logo-mark-data-uri.txt'), encoding='utf-8').read().strip()
STEM = '2026_사역이력_공유_A4'
PAGES = 5

# (연도, 원본 최종본, 줄, 부서, 팀, 신규, 유지) — 통합 엑셀을 세어 확인(2026-10-01)
YEARS = [
    (2022, '3차', 601, 16, 79, 390, 196),
    (2023, '3차', 665, 17, 72, 319, 346),
    (2024, '6차', 896, 17, 84, 461, 434),
    (2025, '4차', 916, 17, 94, 343, 573),
    (2026, '5차', 1015, 19, 92, 303, 711),
]
TOTAL = sum(y[2] for y in YEARS)
RESULT = {'linked': 4042, 'open': 51}
assert RESULT['linked'] + RESULT['open'] == TOTAL, (TOTAL, RESULT)
PCT = RESULT['linked'] * 100.0 / TOTAL

fmt = lambda n: '{:,}'.format(n)


def year_rows():
    out = []
    for y, ver, n, d, t, new, keep in YEARS:
        pk = keep * 100.0 / (new + keep)
        out.append(
            '<tr><td class="c">%d</td><td class="c">%s</td><td class="n">%s</td><td class="n">%d</td><td class="n">%d</td>'
            '<td class="n">%s</td><td class="n">%s</td><td><span class="bar"><i style="width:%.0f%%"></i></span>'
            '<span class="pct">%.0f%%</span></td></tr>' % (y, ver, fmt(n), d, t, fmt(new), fmt(keep), pk, pk))
    return ''.join(out)


# (항목, 상태 키, 비고)
STATUS = [
    ('2022~2026 명단 모으기', 'done', '홈페이지 게시 최종본 다섯 해 → 한 표 %s건' % fmt(TOTAL)),
    ('교적 연결 규칙 · 검증', 'done', '%s건 연결 · %d건 확인 필요(9월 29일 교인명부 기준)' % (fmt(RESULT['linked']), RESULT['open'])),
    ('교적관리 프로그램 · 교인명부', 'live', '9월 29일 운영 시작 · 찾기 · 현황 · 가족'),
    ('사역신청 관리 메뉴', 'live', '신청 현황 · 사역팀 정보 · 종이 명단 · 임명현황 · 시험 참여자'),
    ('사역신청 화면의 교적 표시', 'live', '맞음 · 확인 필요 · 없음 표시 · 이름을 누르면 교적 창'),
    ('「📜 사역 이력」 메뉴', 'wip', '올리기 · 사람별 · 부서별 · 연도별 보기 · 고치기 — 설계 · 계획 완료'),
    ('교적 「자세히」 창의 🤝 사역 탭', 'wip', '한 분이 해마다 섬긴 사역 · 성경필사 탭과 함께 — 설계 완료'),
    ('2027 앱 사역신청', 'test', '12월 중순 시작 · 지금 시험 참여자가 미리 시험 중(🧪 표시)'),
    ('이력으로 넘기기', 'next', '2027 임명이 끝나면 앱 신청이 같은 사역 이력에 이어진다'),
    ('앱 「내 사역 기록」 · 정정 신청', 'plan', '본인이 정정 신청 · 처리 현황 바로 확인 — 앱 계정과 교적 잇기가 먼저'),
]
STATE = {'done': ('완료', 'done'), 'live': ('운영 중', 'live'), 'wip': ('만드는 중', 'wip'),
         'test': ('준비 · 시험 중', 'test'), 'next': ('2027 임명 전', 'next'), 'plan': ('계획', 'next')}


def status_rows():
    return ''.join('<tr><td><b>%s</b></td><td class="c"><span class="st %s">%s</span></td><td>%s</td></tr>'
                   % (what, STATE[k][1], STATE[k][0], note) for what, k, note in STATUS)


STYLE = """
@page { size:A4; margin:14mm 15mm 14mm; }
* { box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
html, body { margin:0; }
body { font-family:'Malgun Gothic','맑은 고딕',sans-serif; color:#151515; background:#fff; font-size:10.5pt; line-height:1.62; }
:root { --navy:#17325c; --navy-deep:#0c1f3d; --navy-tint:#eef1f6; --brass:#8a6a2f; --brass-tint:#f6f0de;
        --green:#2f6b45; --green-tint:#e8f3ec; --line:#cfd3da; --soft:#4a4a4a; --alt:#f4f5f7; }
h1, h2, h3 { margin:0; color:var(--navy-deep); }
p { margin:0 0 2.4mm; word-break:keep-all; }
b { color:var(--navy-deep); }
.page { break-before:page; }
.page:first-of-type { break-before:auto; }

.route { display:flex; justify-content:space-between; align-items:center; gap:6mm;
         padding-bottom:3.2mm; margin-bottom:4mm; border-bottom:0.6mm solid var(--navy); }
.route .eyebrow { font-size:8.8pt; letter-spacing:.1em; color:var(--brass); font-weight:800; margin-bottom:1.4mm; }
.route h1 { font-family:'Malgun Gothic','맑은 고딕',sans-serif; font-size:23.1pt; font-weight:900; line-height:1.25; }
.route .sub { font-size:9.9pt; color:var(--soft); margin-top:1mm; }
.route .mark { height:13mm; width:auto; flex:none; }
.lede { font-size:11.2pt; line-height:1.72; margin-bottom:5mm; }

h2.sec { font-size:13.8pt; font-weight:800; margin:0 0 3mm; padding-bottom:1.6mm; border-bottom:0.3mm solid var(--line);
         display:flex; align-items:baseline; gap:2.4mm; }
h2.sec .no { display:inline-flex; align-items:center; justify-content:center; width:7mm; height:7mm; border-radius:50%;
             background:var(--navy); color:#fff; font-size:11pt; flex:none; transform:translateY(-0.4mm); }
h2.sec .tag { margin-left:auto; font-size:8.8pt; font-weight:700; }
h3 { font-size:11.2pt; font-weight:800; margin:4mm 0 1.8mm; }
.block { margin-bottom:5mm; }
.note { font-size:9.5pt; color:var(--soft); line-height:1.55; word-break:keep-all; }

/* 한눈에 — 다섯 단계 흐름 */
.flow { display:grid; grid-template-columns:repeat(5, minmax(0,1fr)); gap:2.4mm; margin:0 0 2.6mm; }
.flow .fs { position:relative; background:var(--navy-tint); border-radius:2mm; padding:2.6mm 2.4mm 2.8mm; min-height:30mm; }
.flow .fs:not(:last-child)::after { content:'›'; position:absolute; right:-2.35mm; top:50%; transform:translate(50%,-55%);
                                     font-size:16.5pt; font-weight:900; color:var(--brass); z-index:2; }
.flow .n { font-size:8.8pt; font-weight:800; color:var(--brass); letter-spacing:.06em; }
.flow .t { font-size:10.4pt; white-space:nowrap; letter-spacing:-0.02em; font-weight:800; color:var(--navy-deep); line-height:1.3; margin:0.6mm 0 1mm; }
.flow .d { font-size:9pt; color:var(--soft); line-height:1.45; word-break:keep-all; }
.flow .fs.loop { background:var(--brass-tint); }
.loopline { font-size:9.2pt; color:var(--brass); font-weight:700; text-align:right; margin:0 0 5mm; }

.nums { display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); gap:2.6mm; margin-bottom:5mm; }
.nums div { border:0.3mm solid var(--line); border-radius:2mm; padding:2.4mm 3mm; }
.nums b { display:block; font-size:17.6pt; font-weight:900; line-height:1.2; }
.nums span { font-size:9.2pt; color:var(--soft); }
.nums .ok b { color:var(--green); }
.nums .chk b { color:var(--brass); }

.why { list-style:none; margin:0; padding:0; display:grid; gap:2mm; }
.why li { background:var(--alt); border-radius:1.8mm; padding:2.4mm 3.2mm; font-size:10.2pt; line-height:1.6; word-break:keep-all; }
.why li b { display:block; font-size:10.8pt; margin-bottom:0.4mm; }

/* 표 */
table { width:100%; border-collapse:collapse; font-size:9.9pt; }
th, td { border-bottom:0.25mm solid var(--line); padding:1.2mm 2mm; vertical-align:middle; word-break:keep-all; }
th { background:var(--navy); color:#fff; font-weight:700; font-size:9.5pt; text-align:left; }
td.c, th.c { text-align:center; } td.n, th.n { text-align:right; font-variant-numeric:tabular-nums; }
tr.sum td { font-weight:800; border-top:0.4mm solid var(--navy); background:var(--navy-tint); }
.bar { display:inline-block; width:22mm; height:2.6mm; background:#e3e6ec; border-radius:1mm; vertical-align:middle; overflow:hidden; }
.bar i { display:block; height:100%; background:var(--brass); }
.pct { display:inline-block; width:9mm; text-align:right; font-weight:700; color:var(--brass); font-size:9.5pt; }

/* 같은 분을 찾는 차례 */
.ladder { list-style:none; counter-reset:l; margin:0; padding:0; display:grid; gap:1.4mm; }
.ladder li { counter-increment:l; position:relative; padding:1.8mm 3mm 1.8mm 10mm; background:var(--navy-tint);
             border-radius:1.6mm; font-size:10pt; line-height:1.5; word-break:keep-all; }
.ladder li::before { content:counter(l); position:absolute; left:2.6mm; top:1.9mm; width:5mm; height:5mm; border-radius:50%;
                     background:var(--navy); color:#fff; font-size:8.8pt; font-weight:800;
                     display:flex; align-items:center; justify-content:center; line-height:1; }
.ladder li span { color:var(--soft); font-size:9.4pt; }
.side { display:grid; grid-template-columns:minmax(0,1.15fr) minmax(0,1fr); gap:4mm; align-items:start; }
.side .box + .box { margin-top:2.6mm; }
.two { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:4mm; }
.box { border:0.3mm solid var(--line); border-radius:2mm; padding:2.2mm 3.2mm; font-size:9.9pt; line-height:1.58; word-break:keep-all; }
.box h4 { margin:0 0 1.2mm; font-size:10.5pt; color:var(--navy-deep); }
.box ul { margin:0; padding-left:4.4mm; }
.box li { margin-bottom:0.6mm; }
.result { display:grid; grid-template-columns:auto 1fr; gap:3mm 4mm; align-items:center; background:var(--green-tint);
          border-radius:2mm; padding:3mm 3.6mm; margin-top:3mm; }
.result .big { font-size:22pt; font-weight:900; color:var(--green); line-height:1.1; }
.result .big small { font-size:11pt; font-weight:800; }
.result p { margin:0; font-size:9.9pt; }

/* 보기 카드 */
.views { display:grid; gap:2mm; }
.view { display:grid; grid-template-columns:30mm 1fr; gap:3.6mm; border:0.3mm solid var(--line); border-radius:2mm; padding:2.2mm 3.4mm; }
.view .k { font-size:12.1pt; font-weight:900; color:var(--navy-deep); line-height:1.3; }
.view .k small { display:block; font-size:9pt; font-weight:700; color:var(--soft); margin-top:1mm; }
.view .v { font-size:10pt; line-height:1.58; word-break:keep-all; }
.view .v ul { margin:0; padding-left:4.4mm; }
.view .v li { margin-bottom:0.5mm; }
.st { display:inline-block; font-size:8.5pt; font-weight:800; border-radius:1mm; padding:0.2mm 1.6mm; white-space:nowrap; line-height:1.6; }
.st.done { background:var(--navy); color:#fff; }
.st.live { background:var(--green); color:#fff; }
.st.wip { background:var(--brass); color:#fff; }
.st.test { background:#fff; color:var(--green); border:0.3mm solid var(--green); }
.st.next { background:#fff; color:var(--soft); border:0.3mm solid #b9c0cc; }

/* 이의제기 단계 */
.steps { list-style:none; margin:0; padding:0; display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); gap:2.4mm; }
.steps li { background:var(--brass-tint); border-radius:2mm; padding:2.6mm 2.8mm; font-size:9.7pt; line-height:1.52; word-break:keep-all; }
.steps li b { display:block; font-size:11pt; margin-bottom:0.8mm; }
.steps li b em { font-style:normal; color:var(--brass); margin-right:1mm; }
.rules { list-style:none; margin:3mm 0 0; padding:0; display:grid; gap:1.6mm; }
.rules li { position:relative; padding:1.8mm 3.4mm; font-size:10pt; line-height:1.55; word-break:keep-all;
            border-left:0.9mm solid var(--navy); background:var(--alt); border-radius:0 1.6mm 1.6mm 0; }
.cycle { display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); gap:2.4mm; margin-top:1mm; }
.cycle div { position:relative; background:var(--navy-tint); border-radius:2mm; padding:2.4mm 2.6mm; font-size:9.5pt; line-height:1.5; word-break:keep-all; }
.cycle div:not(:last-child)::after { content:'›'; position:absolute; right:-2.35mm; top:50%; transform:translate(50%,-55%);
                                      font-size:15.4pt; font-weight:900; color:var(--brass); }
.cycle b { display:block; font-size:10.5pt; margin-bottom:0.5mm; }

.ask { list-style:none; counter-reset:a; margin:0; padding:0; display:grid; gap:1.6mm; }
.ask li { counter-increment:a; position:relative; padding:1.6mm 3mm 1.6mm 10mm; background:var(--brass-tint); border-radius:1.6mm;
          font-size:10pt; line-height:1.55; word-break:keep-all; }
.ask li::before { content:counter(a); position:absolute; left:2.6mm; top:2.2mm; width:5mm; height:5mm; border-radius:50%;
                  background:var(--brass); color:#fff; font-size:8.8pt; font-weight:800;
                  display:flex; align-items:center; justify-content:center; line-height:1; }
.ask li b { display:block; font-size:10.5pt; }

.endline { margin-top:6mm; padding-top:2.4mm; border-top:0.3mm solid var(--line); display:flex; justify-content:space-between;
           align-items:baseline; }
.endline .slogan { font-family:'Malgun Gothic','맑은 고딕',sans-serif; font-size:11pt; font-weight:700; color:var(--navy); }
.endline .church { font-size:9.5pt; font-weight:700; color:var(--brass); }
"""

BODY = """
<section class="page">
<div class="route">
  <div>
    <div class="eyebrow">방송전산부 전산팀 · 2026년 10월 1일</div>
    <h1>사역 이력, 교적과 이어 한 곳에서</h1>
    <div class="sub">홈페이지 사역신청 명단에서 시작해 교적관리 프로그램에서 늘 최신으로 쓰기까지</div>
  </div>
  <img class="mark" src="%(mark)s" alt="고척교회">
</div>

<p class="lede">해마다 교회 홈페이지에 올려 온 <b>사역신청(임명) 명단</b>을 한 표로 모으고, 한 줄 한 줄을
<b>교적(교인명부)의 교인과 이었습니다.</b> 이 기록을 <b>교적관리 프로그램(가칭)</b>에 넣어
<b>사람별 · 부서별 · 연도별</b>로 보고, 틀린 곳은 <b>본인이 앱에서 정정을 신청하고 처리 현황을 바로 확인</b>하는 방식으로 바로잡아 늘 최신 정보로 쓰려 합니다.
2027년부터는 앱으로 받은 사역신청이 임명 뒤 같은 기록에 이어서 쌓입니다.</p>

<div class="block">
  <h2 class="sec">한눈에 보기</h2>
  <div class="flow">
    <div class="fs"><div class="n">①</div><div class="t">명단 모으기</div>
      <div class="d">홈페이지에 올린 최종본 다섯 해(2022~2026)를 한 표로</div></div>
    <div class="fs"><div class="n">②</div><div class="t">교적 연결</div>
      <div class="d">줄마다 교인명부의 같은 분을 찾아 교인ID를 붙임</div></div>
    <div class="fs"><div class="n">③</div><div class="t">프로그램에 넣기</div>
      <div class="d">교적관리 프로그램 「사역 이력」에 올림</div></div>
    <div class="fs"><div class="n">④</div><div class="t">보기</div>
      <div class="d">사람별 · 부서별 · 연도별로 확인</div></div>
    <div class="fs loop"><div class="n">⑤</div><div class="t">이의제기 · 수정</div>
      <div class="d">본인이 앱에서 정정 신청 · 처리 현황을 바로 확인</div></div>
  </div>
  <div class="loopline">⑤에서 고친 내용이 바로 ④에 보입니다 — 그래서 늘 최신입니다</div>

  <div class="nums">
    <div><b>%(total)s건</b><span>다섯 해 사역 임명 기록</span></div>
    <div class="ok"><b>%(linked)s건</b><span>교적과 연결 (%(pct).1f%%)</span></div>
    <div class="chk"><b>%(open)d건</b><span>담당자 확인이 필요한 줄</span></div>
    <div><b>72~94팀</b><span>해마다 섬긴 팀 수</span></div>
  </div>
</div>

<div class="block">
  <h2 class="sec">왜 하나요</h2>
  <ul class="why">
    <li><b>명단이 해마다 다른 파일에 흩어져 있었습니다</b>
      「이분이 몇 년째 어디서 섬기셨나」를 보려면 엑셀 다섯 개를 하나씩 열어야 했습니다.</li>
    <li><b>이름만으로는 같은 이름의 다른 분을 가릴 수 없었습니다</b>
      명단에는 이름 · 목장만 있습니다. 교인ID로 이어야 한 분의 여러 해 기록이 한 줄로 모입니다.</li>
    <li><b>고친 내용이 다음에 이어지지 않았습니다</b>
      파일에서 고친 것은 그 파일에만 남았습니다. 한 곳에서 고치고, 모두가 같은 최신 기록을 봐야 합니다.</li>
  </ul>
</div>
</section>

<section class="page">
<div class="block">
  <h2 class="sec"><span class="no">1</span>명단 모으기<span class="tag"><span class="st done">완료</span></span></h2>
  <p>홈페이지에 올린 해마다의 <b>최종본</b>(차수가 가장 늦은 판)을 모았습니다. 해마다 파일 모양이 달라
  (제목 줄 · 칸 차례 · 메모 칸) 칸 이름으로 맞춰 읽고, 연도 · 부서 · 팀 · 이름 · 직분 · 목장 · 신규/유지를 한 표로 만들었습니다.</p>
  <table>
    <thead><tr><th class="c">연도</th><th class="c">최종본</th><th class="n">기록</th><th class="n">부서</th><th class="n">팀</th>
      <th class="n">신규</th><th class="n">유지</th><th>유지 비율</th></tr></thead>
    <tbody>%(years)s
      <tr class="sum"><td class="c">합계</td><td></td><td class="n">%(total)s</td><td colspan="5"></td></tr>
    </tbody>
  </table>
  <p class="note" style="margin-top:1.6mm">신규 · 유지가 비어 있는 줄이 세 줄 있습니다(원본 그대로). 「유지」 비율이 해마다 오르는 것처럼,
  모아 두면 해마다의 흐름이 한눈에 보입니다.</p>
</div>

<div class="block">
  <h2 class="sec"><span class="no">2</span>교적 연결(교인ID 붙이기)<span class="tag"><span class="st done">완료</span></span></h2>
  <p>줄마다 교인명부에서 <b>같은 분</b>을 찾아 교인ID를 붙였습니다. 아래 차례로 보고, <b>한 분으로 좁혀지는 첫 단계</b>에서 정합니다.
  끝까지 한 분으로 못 좁히면 억지로 붙이지 않고 비워 둡니다.</p>
  <div class="side">
  <ol class="ladder">
    <li>같은 교구 · 같은 목장에 같은 이름이 한 분 <span>— 가장 확실한 근거</span></li>
    <li>같은 교구에 같은 이름이 한 분 <span>— 그사이 목장이 바뀐 분</span></li>
    <li>교인명부 전체에 그 이름이 한 분뿐</li>
    <li>여럿이면 직분이나 가족(같은 해 같은 목장에서 함께 섬긴 가족)으로 가림</li>
    <li>그래도 비면 이웃한 해에 같은 팀을 「유지」한 기록 · 이름 한 글자 오타로 이음</li>
  </ol>
  <div>
    <div class="box"><h4>다른 분으로 보고 먼저 빼는 경우</h4><ul>
      <li>직분과 성별이 맞지 않음(권사는 여성 · 장로 · 안수집사는 남성)</li>
      <li>그해보다 늦게 교회에 등록하신 분</li>
      <li>어른 줄인데 그해 어린이 · 학생이었던 분</li>
      <li>청년 줄인데 그해 45세 이상 · 또래 표기와 출생 연도가 다름</li></ul></div>
    <div class="box"><h4>확인이 필요한 %(open)d건은</h4><ul>
      <li>교인명부에 같은 이름이 없는 분(떠나신 분 · 교인이 아닌 봉사자 등)</li>
      <li>같은 이름이 여럿인데 가릴 근거가 없는 경우</li>
      <li>줄마다 <b>비고</b>에 사유가 적힙니다 — 담당자가 확인합니다</li></ul></div>
  </div>
  </div>
  <div class="result">
    <div class="big">%(linked)s<small> / %(total)s건</small></div>
    <p><b>교적과 연결(%(pct).1f%%)</b> — 9월 29일 교인명부 기준. 규칙은 따로 다시 짠 계산과 맞대 보고,
    틀린 것으로 확인된 꼴(직분과 성별이 다른 분, 직분 없는 젊은 청년에게 붙은 집사 줄 등)은 규칙으로 막았습니다.</p>
  </div>
</div>
</section>

<section class="page">
<div class="block">
  <h2 class="sec"><span class="no">3</span>교적관리 프로그램에 넣기<span class="tag"><span class="st wip">만드는 중</span></span></h2>
  <p><b>교적관리 프로그램(가칭 · admin.onlybible.kr)</b>은 교회 담당자만 쓰는 관리 화면입니다. 카카오로 로그인하고
  총괄 관리자가 승인한 분이, 맡은 메뉴만 봅니다. 지금 <b>교인명부 · 사역신청 · 성경필사(암송)</b> 메뉴가 운영 중이고,
  여기에 <b>「📜 사역 이력」</b> 메뉴를 더합니다.</p>
  <div class="two">
    <div class="box"><h4>엑셀 올리기 — 살펴본 뒤 넣기</h4><ul>
      <li>파일을 올리면 먼저 <b>살펴보기</b>: 새 줄 · 이미 있는 줄 · 연결 결과를 수로 보여 줍니다</li>
      <li>확인하고 <b>넣기</b>를 누르면 그때 들어가고, 교적 연결을 다시 계산합니다</li></ul></div>
    <div class="box"><h4>몇 번 올려도 안전하게</h4><ul>
      <li>같은 파일을 다시 올려도 이미 있는 줄은 건너뜁니다</li>
      <li>2021년 이전 명단이 나오면 언제든 더할 수 있습니다</li>
      <li>뺀 줄은 지우지 않고 「빼 둠」으로 남겨, 다시 올려도 되살아나지 않습니다</li></ul></div>
  </div>
</div>

<div class="block">
  <h2 class="sec"><span class="no">4</span>보기 — 사람별 · 부서별 · 연도별</h2>
  <div class="views">
    <div class="view"><div class="k">사람별<small><span class="st wip">만드는 중</span></small></div><div class="v"><ul>
      <li>교인명부에서 한 분을 열면 「자세히」 창에 <b>🤝 사역</b> 탭이 생깁니다 — 그분이 <b>해마다 섬긴 사역</b>(연도 · 부서 · 팀)과 올해 신청</li>
      <li>같은 창에 <b>✍️ 성경필사</b> 참여 기록도 함께 봅니다</li>
      <li>신청 현황 · 임명현황에서 이름을 누르면 그분 교적 창이 열립니다 <span class="st live">운영 중</span></li></ul></div></div>
    <div class="view"><div class="k">부서별<small><span class="st wip">만드는 중</span></small></div><div class="v"><ul>
      <li>「사역 이력」에서 부서 · 팀으로 거르면 팀마다 해마다 섬긴 분과 신규 · 유지가 보입니다</li>
      <li>올해(2027) 신청은 「신청 현황」 사역별 보기 · 「임명현황」 부서별 보기에서 봅니다 <span class="st live">운영 중</span></li></ul></div></div>
    <div class="view"><div class="k">연도별<small><span class="st wip">만드는 중</span></small></div><div class="v"><ul>
      <li>해를 골라 그해 명단 전체를 봅니다. 해마다 요약(기록 수 · 연결 · 확인 필요)이 위에 붙습니다</li>
      <li>「못 맞춘 줄만」 · 「근거가 약한 줄만」으로 걸러 확인할 줄을 모아 봅니다</li>
      <li>엑셀로 내려받을 수 있습니다(교인ID 칸은 교인명부 담당자에게만 채워집니다)</li></ul></div></div>
  </div>
  <p class="note" style="margin-top:2.4mm">✓ 연결됨 · △ 확인(근거가 약함 — 교구만 같거나 다른 해 기록으로 이은 줄) · — 못 맞춤(사유 표시) 세 가지로 표시합니다.</p>
</div>

<div class="block">
  <h2 class="sec">개인정보와 권한</h2>
  <div class="two">
    <div class="box"><h4>누가 무엇을 보나</h4><ul>
      <li>교적관리 프로그램은 카카오 로그인 뒤 <b>승인된 담당자만</b>, 맡은 메뉴만 봅니다</li>
      <li>교인ID와 교적 상세는 <b>교인명부 담당자 · 총괄</b>만 봅니다</li>
      <li>사역신청 담당자는 연결 표시(✓ · △ · —)와 후보의 이름 · 소속 · 직분까지만 봅니다</li></ul></div>
    <div class="box"><h4>어떻게 지키나</h4><ul>
      <li>모든 고침은 「바꾼 기록」에 남습니다</li>
      <li>원본 명단 · 교인명부 파일은 인터넷에 공개되는 곳에 두지 않습니다</li>
      <li>개인정보 안내에 「사역 이력」 항목을 더합니다</li></ul></div>
  </div>
</div>

</section>

<section class="page">
<div class="block">
  <h2 class="sec"><span class="no">5</span>이의제기와 수정 — 늘 최신으로<span class="tag"><span class="st next">계획</span></span></h2>
  <p>자동 연결이 아무리 정확해도 사람이 아는 사실을 다 알 수는 없습니다. 자기 기록은 본인이 가장 잘 압니다.
  그래서 <b>성경말씀 암송 앱 등에서 본인이 이전 사역기록의 정정을 신청하고, 처리 현황을 바로 확인</b>하게 합니다.
  반영된 내용은 그 자리에서 앱의 내 기록과 교적관리 프로그램의 사람별 · 부서별 · 연도별 보기에 함께 보입니다.</p>
  <ol class="steps">
    <li><b><em>1</em>내 기록 보기</b>앱의 「내 사역 기록」에서 해마다 섬긴 사역(연도 · 부서 · 팀)을 봅니다</li>
    <li><b><em>2</em>정정 신청</b>줄마다 「정정 신청」 — 빠진 사역 더하기 · 내 것이 아닌 줄 · 팀 · 직분 · 목장이 틀림 + 한 줄 설명</li>
    <li><b><em>3</em>담당자 확인 · 반영</b>신청이 교적관리 프로그램에 모이고, 담당자가 확인해 고치거나 사유를 적습니다. 바꾼 내용은 「바꾼 기록」에 남습니다</li>
    <li><b><em>4</em>현황 바로 확인</b>앱에서 「신청 → 확인 중 → 반영 완료 / 반영 안 함(사유)」을 바로 봅니다. 반영되면 내 기록에 곧바로 보입니다</li>
  </ol>
  <ul class="rules">
    <li><b>사람이 확인한 것이 먼저입니다.</b> 담당자가 「이분」 · 「이분 아님」으로 정한 줄은 자동 연결이 다시 덮지 않습니다.</li>
    <li><b>새 교인명부가 오면 다시 맞춥니다.</b> 12월 무렵 교인명부를 새로 받으면 「다시 맞추기」로 자동 연결한 줄만 새 명부로 다시 봅니다(새로 등록하신 분 등).</li>
    <li><b>본인 신청도 담당자가 확인한 뒤 반영합니다.</b> 앱 로그인은 이름 · 소속만으로 들어오는 방식이라 본인 확인 수단이 아닙니다 — 신청만으로 기록이 바뀌지 않습니다. 부서장 · 교구가 대신 알려 주시면 담당자가 직접 고칩니다.</li>
    <li><b>앱 계정과 교적을 먼저 잇습니다.</b> 지금 앱 계정은 교인ID와 이어져 있지 않습니다. 앱에 「내 사역 기록」을 보여 드리려면 이 연결이 먼저이고, 「사역 이력」 메뉴 다음 차례로 만듭니다.</li>
  </ul>
</div>

<div class="block">
  <h2 class="sec">2027년부터 — 앱 신청이 같은 기록으로</h2>
  <p><b>2027년 사역신청부터</b> <b>성경말씀 암송 앱</b>으로도 받습니다. 임명까지 끝나면 그해 임명 기록을 「사역 이력」으로 넘겨,
  홈페이지 명단을 따로 모으지 않아도 같은 기록에 이어서 쌓입니다.</p>
  <div class="cycle">
    <div><b>앱으로 신청</b>12월 중순 · 성도님이 부서별로 찾아 세 사역까지</div>
    <div><b>접수 · 임명</b>담당자가 「신청 현황」에서 처리 · 알림을 켠 분께는 임명 알림</div>
    <div><b>이력으로 넘기기</b>임명이 끝나면 그해 임명 기록을 「사역 이력」으로</div>
    <div><b>보기 · 정정 신청</b>앱에서 다른 해 기록과 함께 보고, 틀린 곳은 본인이 정정 신청</div>
  </div>
  <p class="note" style="margin-top:2.4mm">지금은 시험 참여자로 정한 몇 분이 신청 기간 전에 앱 신청을 미리 시험하고 있습니다.
  그 신청은 「신청 현황」에 <b>🧪 시험</b>으로 표시되며 신청 기간 전에 지웁니다.</p>
</div>

</section>

<section class="page">
<div class="block">
  <h2 class="sec">진행 상황</h2>
  <table>
    <thead><tr><th style="width:36%%">항목</th><th class="c" style="width:17%%">상태</th><th>내용</th></tr></thead>
    <tbody>%(status)s</tbody>
  </table>
</div>

<div class="block">
  <h2 class="sec">확인 · 결정 부탁드립니다</h2>
  <ol class="ask">
    <li><b>「기쁨-1」 표기</b>2025년 이전 명단의 「기쁨-1」은 목장을 모를 때 적은 자리 표시로 보고 「교구 · 목장 모름」으로 읽었습니다
      (연결된 분들이 지금 여러 교구에 흩어져 계십니다). 맞는지 확인 부탁드립니다.</li>
    <li><b>확인 필요 %(open)d건</b>부서 · 교구의 도움을 받아 한 분씩 확인하려 합니다.</li>
    <li><b>정정 신청을 처리할 분</b>앱으로 들어온 정정 신청을 누가 확인하고 반영할지(사역신청 담당자 · 부서별 담당) 정해 주세요.</li>
    <li><b>직책(팀장 · 부팀장)</b>지금 명단에는 없습니다. 앞으로 함께 적을지 정해 주세요.</li>
    <li><b>2021년 이전 명단</b>남아 있는 파일이 있으면 같은 방법으로 더할 수 있습니다.</li>
  </ol>
</div>

<div class="endline"><span class="slogan">오직 성경, 말씀이 답이다!</span><span class="church">고척교회</span></div>
</section>
"""

ctx = {'mark': MARK, 'total': fmt(TOTAL), 'linked': fmt(RESULT['linked']), 'open': RESULT['open'], 'pct': PCT,
       'years': year_rows(), 'status': status_rows()}
html = ('<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>사역 이력, 교적과 이어 한 곳에서</title>'
        # ⚠️ 구글 웹 글꼴을 쓰지 않는다 — 크롬이 Type3 로 박는다(이름 레코드가 빈 조각 글꼴). 이 PC 에 설치된 글꼴을 쓴다.

        '<style>' + STYLE + '</style></head><body>' + (BODY % ctx) + '</body></html>')

out_html = os.path.join(OUT_DIR, STEM + '.html')
io.open(out_html, 'w', encoding='utf-8', newline='').write(html)
print('wrote:', os.path.relpath(out_html, ROOT), '(%d KB)' % (len(html.encode('utf-8')) // 1024))

CHROME_CANDS = [
    r'C:\Program Files\Google\Chrome\Application\chrome.exe',
    r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
    os.path.join(os.environ.get('LOCALAPPDATA', ''), r'Google\Chrome\Application\chrome.exe'),
]
chrome = next((c for c in CHROME_CANDS if c and os.path.exists(c)), None)
out_pdf = os.path.join(OUT_DIR, STEM + '.pdf')
if not chrome:
    raise SystemExit('!! 크롬을 못 찾아 PDF는 건너뜁니다 — HTML을 열어 직접 인쇄하세요.')
subprocess.run([chrome, '--headless', '--disable-gpu', '--no-pdf-header-footer',
                '--print-to-pdf=' + os.path.abspath(out_pdf), '--virtual-time-budget=15000',
                'file:///' + os.path.abspath(out_html).replace(os.sep, '/')], capture_output=True)
print('wrote:', os.path.relpath(out_pdf, ROOT))

# ── 재기: 쪽수 · 서체 종류(Type0 이어야 한다 · Type3 면 인쇄소 경고) · 쪽마다 첫 제목 ──
import pymupdf
doc = pymupdf.open(out_pdf)
print('  쪽수: %d (목표 %d)' % (doc.page_count, PAGES))
fonts = sorted({(f[3], f[2]) for p in doc for f in p.get_fonts()})
print('  서체:', fonts)
for i, p in enumerate(doc):
    lines = [l for l in p.get_text().splitlines() if l.strip()]
    print('  %d쪽: %s … %s' % (i + 1, lines[0][:30] if lines else '(빈 쪽)', lines[-1][:30] if lines else ''))
