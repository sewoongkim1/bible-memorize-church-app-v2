# -*- coding: utf-8 -*-
"""사역관리 시험 사용 안내 — 시험 참여자(성도님) + 사역 담당자 한 권(A4) · 2026-10-02 친구 요청

■ 무엇인가
  12월 중순 정식 사역신청에 앞서 「🧪 시험 참여자」로 연 분들과 사역 담당자가 보고 따라 할 안내서.
  A 부 = 성경말씀 암송 앱(첫 화면 「사역현황」 → 🤝 사역신청 · 🗂️ 사역 이력 확인 · 정정 신청)
  B 부 = 고척교회 관리(admin.onlybible.kr · 카카오 로그인 → 🤝 사역신청 메뉴 여섯 · 🧪 시험 참여자는 2026-10-02 부터 ⚙️ 시스템(총괄만))
  친구가 「둘 다 한 권에」를 골랐다(2026-10-02).

■ 화면 그림
  개발 DB 의 가짜 인물로 찍었다 — 성도님 「사랑 3목장 김시험」 · 담당자 「사랑 1목장 시험담당」.
  ⚠️ 저장소가 공개라 실명이 찍히면 안 된다. 개발 DB 사역팀 설명의 「홍길동 집사 · 예시」는 개발용 견본 글이다.
  ⚠️ 개발 DB 사역팀 정보에는 실명·번호가 든 줄(장학)이 있어 「찬양대」로 걸러 찍었다 — 다시 찍을 때도 그 줄이 나오지 않게.
  찍는 법: tools/ministry-tester-guide-shots.py(개발 DB 준비 · 찍기 · 지우기). 찍은 원본 폴더를 인자로 주면
  잘라서 JPG 로 자료/ministry/2027_사역관리_시험가이드_화면/ 에 넣는다. 인자가 없으면 그 폴더의 JPG 를 그대로 쓴다.

■ 사실만 적는다 — 출처(2026-10-02 origin/main · 앱 판 20261002d · 교회 어드민 main)
  · 문 = ministryVisible(): 관리자 미리보기 · 플레이스토어 앱은 숨김(MINISTRY_HIDE_ON_PLAY) · 시험 참여자 · 신청 기간
  · 신청 규칙·단계 글 = app.js minPolicyModalHtml · MIN_STATE · minConfirmHtml(번호 180일)
  · 사역 이력 확인 = app.js MH_* · mhBodyHtml · mhAsk (직분은 정정하지 않는다 · 알림 없음)
  · 담당자 메뉴 = church-admin js/menus/registry.js · status-ui.js(임명 알림·취소 사유·삭제) · requests-logic.js
  · 날짜는 앞선 공유 문서처럼 신청을 「12월 중순」으로만 적는다(성도님 지시 2026-09-17).
  사실이 바뀌면 글을 고치고 다시 돌린다.

■ 지면 — 실측
  쪽마다 break-before. 한 쪽이 넘치면 쪽수가 늘어난다 — pymupdf 로 쪽수·서체(Type0)를 재고, 쪽 번호를 찍는다.

출력: 자료/ministry/2027_사역관리_시험가이드_A4.html · .pdf
"""
import io, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..'))
OUT_DIR = os.path.join(ROOT, '자료', 'ministry')
IMG_DIR_NAME = '2027_사역관리_시험가이드_화면'
IMG_DIR = os.path.join(OUT_DIR, IMG_DIR_NAME)
MARK = io.open(os.path.join(ROOT, '자료', 'marketing', 'logo-mark-data-uri.txt'), encoding='utf-8').read().strip()
STEM = '2027_사역관리_시험가이드_A4'
PAGES = 11

# 그림 — (이름, 원본 파일, 자르기(2배 픽셀: 위, 아래 · None 이면 통째))
SHOTS = [
    ('a01', 'a1_home', None),
    ('a02', 'a2_pick', None),
    ('a03', 'a3_policy', None),
    ('a04', 'a4_picked', None),
    ('a05', 'a5_detail', None),
    ('a06', 'a6_confirm', None),
    ('a07', 'a7_done', None),
    ('a08', 'a8_history', None),
    ('a09', 'a9_fix', None),
    ('a10', 'a11_missing', None),
    ('a11', 'a12_requests', (600, None)),
    ('a12', 'a13_answered', (780, None)),
    ('b01', 'b1_login', (150, None)),
    ('b02', 'b2_register', (150, None)),
    ('b03', 'b3_pending', (150, None)),
    ('b04', 'b4b_nav', (0, 1000)),
    ('b05', 'b5_testers', (0, 1290)),
    ('b06', 'b6_status', (0, 1470)),
    ('b07', 'b6_status_drop', (520, 1480)),
    ('b08', 'b7_requests_all', (0, 1150)),
    ('b09', 'b8_other', None),
    ('b10', 'b8_missing_line', None),
    ('b11', 'b9_history', (0, 1260)),
    ('b12', 'b10_catalog', (0, 1360)),
    ('b13', 'b11_appointed', (0, 610)),
]


def prepare_images(src):
    from PIL import Image
    os.makedirs(IMG_DIR, exist_ok=True)
    for key, name, crop in SHOTS:
        im = Image.open(os.path.join(src, name + '.png')).convert('RGB')
        if crop:
            top, bottom = crop
            im = im.crop((0, top, im.width, bottom if bottom else im.height))
        w = 620
        im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
        im.save(os.path.join(IMG_DIR, key + '.jpg'), quality=86, optimize=True, progressive=True)
    print('images:', len(SHOTS), '->', os.path.relpath(IMG_DIR, ROOT))


def img(key):
    return IMG_DIR_NAME + '/' + key + '.jpg'


def fig(key, no, cap, cls=''):
    return ('<figure class="shot %s"><div class="frame"><img src="%s" alt=""></div>'
            '<figcaption><span class="fn">%s</span>%s</figcaption></figure>') % (cls, img(key), no, cap)


def figs(*items, cols=3, cls=''):
    return '<div class="figs c%d %s">%s</div>' % (cols, cls, ''.join(items))


STYLE = """
@page { size:A4; margin:13mm 14mm 15mm; }
* { box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
html, body { margin:0; }
body { font-family:'Malgun Gothic','맑은 고딕',sans-serif; color:#151515; background:#fff; font-size:10.3pt; line-height:1.6; }
:root { --navy:#17325c; --navy-deep:#0c1f3d; --navy-tint:#eef1f6; --brass:#8a6a2f; --brass-tint:#f6f0de;
        --green:#2f6b45; --green-tint:#e8f3ec; --red:#a43a2f; --red-tint:#fbeceb; --line:#cfd3da; --soft:#4a4a4a; --alt:#f4f5f7; }
h1, h2, h3 { margin:0; color:var(--navy-deep); }
p { margin:0 0 2mm; word-break:keep-all; }
b { color:var(--navy-deep); }
.page { break-before:page; }
.page:first-of-type { break-before:auto; }

/* 표지 머리 */
.route { display:flex; justify-content:space-between; align-items:center; gap:6mm;
         padding-bottom:3.2mm; margin-bottom:4mm; border-bottom:0.6mm solid var(--navy); }
.route .eyebrow { font-size:8.8pt; letter-spacing:.1em; color:var(--brass); font-weight:800; margin-bottom:1.4mm; }
.route h1 { font-size:24pt; font-weight:900; line-height:1.25; }
.route .sub { font-size:9.9pt; color:var(--soft); margin-top:1mm; }
.route .mark { height:14mm; width:auto; flex:none; }
.lede { font-size:11pt; line-height:1.68; margin-bottom:2.4mm; }
.box.decide { font-size:10pt; line-height:1.6; margin-bottom:3.6mm; border-left:1.2mm solid var(--navy); background:var(--navy-tint); }

/* 쪽 머리 — 어느 부인지 */
.part { display:flex; align-items:center; gap:2.4mm; font-size:8.8pt; font-weight:800; letter-spacing:.06em; color:var(--brass);
        border-bottom:0.3mm solid var(--line); padding-bottom:1.4mm; margin-bottom:3.4mm; }
.part .chip { color:#fff; background:var(--navy); border-radius:1mm; padding:0.2mm 1.8mm; letter-spacing:0; }
.part.b .chip { background:var(--green); }
.part .where { margin-left:auto; color:var(--soft); font-weight:700; letter-spacing:0; }

h2.sec { font-size:14.6pt; font-weight:900; margin:0 0 2.6mm; display:flex; align-items:baseline; gap:2.4mm; }
h2.sec .no { font-size:11pt; color:#fff; background:var(--navy); border-radius:1.4mm; padding:0.3mm 2mm; flex:none; transform:translateY(-0.6mm); }
.part.b + h2.sec .no, h2.sec.b .no { background:var(--green); }
h3 { font-size:11.4pt; font-weight:800; margin:3.6mm 0 1.8mm; }
.block { margin-bottom:4.4mm; }
.note { font-size:9.4pt; color:var(--soft); line-height:1.55; word-break:keep-all; }

/* 단계 */
ol.steps { list-style:none; counter-reset:s; margin:0 0 3mm; padding:0; display:grid; gap:1.5mm; }
ol.steps > li { counter-increment:s; position:relative; padding:1.6mm 3mm 1.6mm 10.6mm; background:var(--navy-tint);
                border-radius:1.6mm; font-size:10.1pt; line-height:1.55; word-break:keep-all; }
ol.steps > li::before { content:counter(s); position:absolute; left:2.8mm; top:1.85mm; width:5.2mm; height:5.2mm; border-radius:50%;
                        background:var(--navy); color:#fff; font-size:8.8pt; font-weight:800;
                        display:flex; align-items:center; justify-content:center; line-height:1; }
.b-steps ol.steps > li { background:var(--green-tint); }
.b-steps ol.steps > li::before { background:var(--green); }
ol.steps .fr { color:var(--brass); font-weight:800; }
ul.dots { margin:0 0 2.4mm; padding-left:4.6mm; font-size:10pt; line-height:1.6; }
ul.dots li { margin-bottom:0.8mm; word-break:keep-all; }

/* 알림 상자 */
.box { border:0.3mm solid var(--line); border-radius:2mm; padding:2.4mm 3.4mm; font-size:9.8pt; line-height:1.58; word-break:keep-all; margin-bottom:3.4mm; }
.box h4 { margin:0 0 1.2mm; font-size:10.6pt; color:var(--navy-deep); }
.box ul { margin:0; padding-left:4.4mm; }
.box li { margin-bottom:0.7mm; }
.box.warn { background:var(--brass-tint); border-color:#e2d3ae; }
.box.tip { background:var(--alt); border-color:#e1e4ea; }
.box.red { background:var(--red-tint); border-color:#efc9c4; }

/* 두 갈래 */
.two { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:3.6mm; margin-bottom:4.4mm; }
.who { border-radius:2.4mm; padding:3mm 3.6mm; border:0.4mm solid var(--navy); }
.who.b { border-color:var(--green); }
.who .k { display:inline-block; font-size:8.8pt; font-weight:800; color:#fff; background:var(--navy); border-radius:1mm; padding:0.2mm 1.8mm; margin-bottom:1.2mm; }
.who.b .k { background:var(--green); }
.who h3 { margin:0 0 1mm; font-size:12.6pt; }
.who .url { font-size:9.6pt; color:var(--brass); font-weight:800; margin-bottom:1.2mm; }
.who p { font-size:9.7pt; margin:0 0 1mm; line-height:1.55; }
.who .pg { font-size:9pt; color:var(--soft); }

ol.must { margin:0; padding:0; list-style:none; counter-reset:m; display:grid; gap:1.2mm; }
ol.must li { counter-increment:m; position:relative; padding:1.3mm 3mm 1.3mm 10mm; border:0.3mm solid var(--line); border-radius:1.6mm;
             font-size:9.7pt; line-height:1.5; word-break:keep-all; }
ol.must li::before { content:counter(m); position:absolute; left:2.8mm; top:1.5mm; width:5mm; height:5mm; border-radius:50%;
                     background:var(--brass); color:#fff; font-size:8.6pt; font-weight:800; display:flex; align-items:center; justify-content:center; }

/* 화면 그림 */
.figs { display:grid; gap:4mm; margin:1mm 0 3mm; align-items:start; }
.figs.c3 { grid-template-columns:repeat(3, minmax(0,1fr)); }
.figs.c2 { grid-template-columns:repeat(2, minmax(0,1fr)); padding:0 14mm; }
.figs.c2.nr { padding:0 26mm; gap:6mm; }
.figs.c4 { grid-template-columns:repeat(4, minmax(0,1fr)); gap:3mm; }
figure.shot { margin:0; break-inside:avoid; }
figure.shot .frame { border:0.35mm solid #c9ced8; border-radius:2.6mm; overflow:hidden; background:#fff;
                     box-shadow:0 0.6mm 1.6mm rgba(12,31,61,.12); }
figure.shot img { display:block; width:100%; height:auto; }
figure.shot figcaption { font-size:8.9pt; line-height:1.45; color:var(--soft); margin-top:1.5mm; word-break:keep-all; }
figure.shot .fn { display:inline-block; min-width:4.6mm; font-weight:900; color:var(--navy); margin-right:0.8mm; }
.part.b ~ .figs .fn, .bfig .fn { color:var(--green); }

/* 표 */
table { width:100%; border-collapse:collapse; font-size:9.6pt; margin-bottom:3mm; }
th, td { border-bottom:0.25mm solid var(--line); padding:1.3mm 2mm; vertical-align:top; word-break:keep-all; line-height:1.5; }
th { background:var(--navy); color:#fff; font-weight:700; font-size:9.3pt; text-align:left; }
table.g th { background:var(--green); }
td.k { font-weight:800; color:var(--navy-deep); white-space:nowrap; }
.st { display:inline-block; font-size:8.6pt; font-weight:800; border-radius:1mm; padding:0 1.6mm; white-space:nowrap; }
.st.s1 { background:#e9edf5; color:var(--navy); }
.st.s2 { background:#fdf1d8; color:#7a5a12; }
.st.s3 { background:var(--green-tint); color:var(--green); }
.st.s4 { background:#eceff3; color:#5c6470; }

/* 확인 목록 */
.check { list-style:none; margin:0; padding:0; display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:1.2mm 4mm; }
.check li { position:relative; padding-left:6mm; font-size:9.7pt; line-height:1.5; word-break:keep-all; }
.check li::before { content:''; position:absolute; left:0; top:0.9mm; width:3.6mm; height:3.6mm; border:0.35mm solid var(--navy); border-radius:0.8mm; }
.check.g li::before { border-color:var(--green); }

.feedback { display:grid; grid-template-columns:auto 1fr; gap:3mm; align-items:start; background:var(--navy-tint); border-radius:2mm; padding:3mm 3.6mm; }
.feedback .ic { font-size:18pt; line-height:1; }
.feedback p { margin:0 0 1mm; font-size:9.9pt; }
.endline { margin-top:4mm; padding-top:2mm; border-top:0.3mm solid var(--line); display:flex; justify-content:space-between; align-items:baseline; }
.endline .slogan { font-size:11pt; font-weight:700; color:var(--navy); }
.endline .church { font-size:9.5pt; font-weight:700; color:var(--brass); }
code, .mono { font-family:Consolas,'Malgun Gothic',monospace; font-size:9.4pt; }
"""

PART_A = '<div class="part"><span class="chip">A</span>성도님(시험 참여자) · 성경말씀 암송 앱<span class="where">gocheok.onlybible.kr</span></div>'
PART_B = '<div class="part b"><span class="chip">B</span>사역 담당자 · 고척교회 관리<span class="where">admin.onlybible.kr</span></div>'

BODY = """
<section class="page">
  <div class="route">
    <div>
      <div class="eyebrow">2027 사역신청 · 사역 이력 — 시험 안내</div>
      <h1>사역관리 시험 사용 안내</h1>
      <div class="sub">시험에 참여해 주시는 성도님과 사역 담당자님께 · 2026년 10월 2일 판</div>
    </div>
    <img class="mark" src="%(mark)s" alt="고척교회">
  </div>

  <p class="lede">12월 중순 사역신청을 앞두고, 성경말씀 암송 앱에서도 사역을 신청하고 지난 사역 기록을 확인할 수 있도록
  준비하고 있습니다. 정식으로 열기 전에 몇 분께 먼저 소개해 드리고, 미리 써 보실 수 있게 했습니다.</p>
  <div class="box tip decide"><b>🙏 편하게 둘러봐 주세요</b> — 이 안내서를 보시며 마음 가는 대로 눌러 보시고,
  쓰시면서 느끼신 점이 있으면 들려주세요. 12월에 모든 성도님께 언제, 어떻게 열지는
  미리 써 보신 분들과 담당하시는 분들의 이야기를 들으며 함께 정해 가려고 합니다.</div>

  <div class="two">
    <div class="who">
      <span class="k">A · 성도님(시험 참여자)</span>
      <h3>성경말씀 암송 앱</h3>
      <div class="url">gocheok.onlybible.kr</div>
      <p>첫 화면 「사역현황」에서 <b>🤝 2027년 사역신청</b>과 <b>🗂️ 사역 이력 확인</b>을 써 봅니다.
      사역을 골라 신청하고, 지난 사역 기록을 보고 틀린 곳은 정정 신청합니다.</p>
      <div class="pg">→ 2~6쪽</div>
    </div>
    <div class="who b">
      <span class="k">B · 사역 담당자</span>
      <h3>고척교회 관리</h3>
      <div class="url">admin.onlybible.kr</div>
      <p>카카오로 로그인해 <b>🤝 사역신청</b> 메뉴 여섯 가지를 써 봅니다.
      들어온 신청을 접수·임명하고, 사역 이력을 살피고, 정정 신청을 처리합니다.</p>
      <div class="pg">→ 7~11쪽</div>
    </div>
  </div>

  <h3>써 보시기 전에 알아 두시면 좋은 것</h3>
  <ol class="must">
    <li><b>🧪 시험 참여자 명단에 오른 분만</b> 첫 화면에 「사역현황」이 보입니다. 명단은 총괄 관리자가 정합니다(교회 관리 「⚙️ 시스템 → 🧪 시험 참여자」).
      명단에 오른 뒤에는 <b>앱을 한 번 닫았다가 다시 열어</b> 주세요.</li>
    <li><b>📱 안드로이드 플레이스토어에서 받은 앱에서는 당분간 보이지 않습니다.</b> 안드로이드 휴대폰은
      <b>크롬</b>에서 <span class="mono">gocheok.onlybible.kr</span> 로 들어가 시험해 주세요. 아이폰 앱과 휴대폰·컴퓨터 브라우저에서는 보입니다.</li>
    <li><b>🧹 시험으로 낸 사역 신청은 정식 신청 기간 전에 모두 지웁니다.</b> 담당자 화면에는 「🧪 시험」으로 표시됩니다.
      실제 신청은 <b>12월 중순 신청 기간에 다시</b> 해 주세요.</li>
    <li><b>📮 사역 이력의 정정 신청은 실제로 담당자에게 갑니다.</b> 보이는 기록은 2022~2026년 교회 홈페이지에 올린 사역 임명 명단에서 옮긴 진짜 기록입니다.
      시험 삼아 내 보실 때는 한 줄 설명 맨 앞에 <b>「시험」</b>이라고 적어 주세요.</li>
    <li><b>🔔 담당자가 시험 신청을 「임명」으로 바꾸면</b> 앱 알림을 켜 두신 분께 실제 임명 알림이 한 번 갑니다. 되돌려도 이미 나간 알림은 취소되지 않습니다.</li>
    <li>이 안내서의 화면은 <b>시험용 가짜 인물</b>(사랑 3목장 김시험 · 담당자 「시험담당」)로 찍었습니다.
      사역 설명 칸의 「예시」 글과 숫자는 실제 화면과 다를 수 있습니다.</li>
  </ol>

  <div class="feedback" style="margin-top:3mm">
    <div class="ic">💬</div>
    <div>
      <p><b>느끼신 점은 편하게 들려주세요</b> — 안내해 드린 담당자에게 카카오톡으로</p>
      <p class="note">짧은 한마디도 큰 도움이 됩니다. 어떤 휴대폰(아이폰 · 갤럭시 · 컴퓨터)에서, 어디서(앱 · 크롬 · 사파리) 무엇을 누르다가
      그랬는지 함께 알려 주시고 <b>그 화면을 캡처</b>해 주시면 찾기가 한결 쉽습니다.</p>
    </div>
  </div>
</section>

<section class="page">
  %(part_a)s
  <h2 class="sec"><span class="no">A-1</span>첫 화면 「사역현황」에서 시작</h2>
  <ol class="steps">
    <li>성경말씀 암송 앱에 평소처럼 로그인합니다(교구 · 목장 · 이름).</li>
    <li>첫 화면을 조금 내리면 <b>「사역현황」</b> 묶음에 두 단추가 있습니다 — <b>🤝 2027년 사역신청</b> · <b>🗂️ 사역 이력 확인</b>. <span class="fr">①</span></li>
    <li><b>🤝 2027년 사역신청</b>을 누르면 「사역 신청서」가 열립니다. 맨 위에 내 소속과 이름이 보이고, 그 아래에 부서가 차례로 있습니다. <span class="fr">②</span></li>
    <li>오른쪽 위 <b>📌 신청안내</b>를 누르면 신청 규칙 여섯 가지를 볼 수 있습니다. <span class="fr">③</span></li>
  </ol>
  <div class="box warn">
    <h4>「사역현황」이 안 보이면</h4>
    <ul>
      <li>안내해 드린 담당자에게 <b>🧪 시험 참여자 명단</b>에 올라 있는지 여쭤 보세요 — 앱에 로그인할 때의 교구·목장·이름 그대로 올라 있어야 합니다.</li>
      <li>앱을 완전히 닫았다가 다시 열어 보세요.</li>
      <li>안드로이드 <b>플레이스토어 앱</b>이면 <b>크롬</b>에서 gocheok.onlybible.kr 로 들어가 주세요.</li>
    </ul>
  </div>
  %(figs_a1)s
  <p class="note">신청 규칙(③) — 최대 3개(자치회장도 개수에 포함) · 부장·팀장·회계·찬양대 지휘자·자치회장은 다른 부서에서 같은 사역을 겸할 수 없음 ·
  교사는 다른 교육부서 교사로, 찬양대원은 다른 찬양대로 이중 사역할 수 없음(새하늘찬양대는 예외) · 임명을 받아야 사역 시작 · 해마다 새로 신청.</p>
</section>

<section class="page">
  %(part_a)s
  <h2 class="sec"><span class="no">A-2</span>사역 고르기 · 제출하기</h2>
  <ol class="steps">
    <li><b>부서 이름</b>을 누르면 그 부서의 사역팀이 펼쳐집니다. 팀 카드를 누르면 <b>✓</b> 표시가 되고, 부서 이름 옆에 「1개 선택」이 붙습니다. <span class="fr">④</span></li>
    <li>팀 카드의 <b>「보기 ›」</b>를 누르면 언제 · 하는 일 · 담당(문의) · 섬기는 분을 볼 수 있습니다. 이 창에서 바로 빼기도 됩니다. <span class="fr">⑤</span></li>
    <li>원하는 요일·시간이 있으면 위의 <b>「조건으로 빠르게 찾기」</b>를 펼쳐 이름 · 요일 · 시간으로 좁혀 보세요.</li>
    <li>다 고르셨으면(오른쪽 위 「선택 N / 3」) 아래 <b>「신청하기」</b> → 「신청 사역 확인」에서 <b>직분</b>을 고르고 <b>휴대폰 번호</b>를 넣은 뒤 <b>「제출하기」</b>. <span class="fr">⑥</span></li>
  </ol>
  %(figs_a2)s
  <div class="box tip">
    직분과 휴대폰 번호는 <b>본인 확인 · 교인명부 대조와 임명 뒤 연락</b>에 씁니다. 번호는 임명·취소가 정해진 뒤 지울 수 있고, <b>늦어도 180일</b>이 지나면 저절로 지웁니다.
    같은 이름·번호로 다른 소속에서 낸 신청이 있으면 「그래도 신청할까요?」를 한 번 묻습니다.
  </div>
</section>

<section class="page">
  %(part_a)s
  <h2 class="sec"><span class="no">A-3</span>사역 신청현황 — 단계와 고치기</h2>
  <p>제출하면 「사역 신청현황」이 보입니다. 사역마다 <b>신청 → 접수 → 임명</b> 세 단계로 나아가고, 맨 위 단계 줄은 그중 가장 덜 나아간 것을 보여 줍니다.
  다시 들어오시면 이 화면부터 열립니다. <span class="fr" style="color:var(--brass);font-weight:800">⑦</span></p>
  <table>
    <thead><tr><th style="width:16%%">상태</th><th style="width:38%%">뜻</th><th>성도님이 하실 수 있는 것</th></tr></thead>
    <tbody>
      <tr><td><span class="st s1">신청</span></td><td>냈어요. 담당자가 아직 접수하기 전</td><td><b>「추가/수정」</b>으로 더하거나 빼기 · <b>「신청 취소」</b></td></tr>
      <tr><td><span class="st s2">접수</span></td><td>담당자가 접수했어요</td><td>고치거나 뺄 수 없어요 — 누르면 그렇게 알려 줍니다</td></tr>
      <tr><td><span class="st s3">임명</span></td><td>임명이 확정됐어요</td><td>첫 모임 안내를 기다려 주세요 · 앱 알림을 켜 두셨으면 알림이 한 번 갑니다</td></tr>
      <tr><td><span class="st s4">취소</span></td><td>부서 요청으로 취소됐어요(까닭은 해당 부서에 여쭤 주세요)</td><td>그 자리는 다시 비어, 다른 사역을 신청하실 수 있어요</td></tr>
    </tbody>
  </table>
  <div class="side-one">%(figs_a3)s</div>
  <ul class="dots">
    <li>아래 단추 셋 — <b>추가/수정</b>(신청서로 돌아가 더 고르거나 빼기) · <b>신청 취소</b>(아직 「신청」인 것만 지웁니다) · <b>나가기</b>.</li>
    <li>신청은 한 번에 다 내지 않아도 됩니다. 한 사역에 임명된 뒤 다른 사역을 더 신청할 수도 있습니다(합쳐서 3개까지).</li>
    <li>줄마다 신청일(임명되면 임명일도)이 보이고, 「보기 ›」를 누르면 그 사역의 설명을 볼 수 있습니다.</li>
  </ul>
</section>

<section class="page">
  %(part_a)s
  <h2 class="sec"><span class="no">A-4</span>사역 이력 확인 · 정정 신청</h2>
  <p>2022~2026년 교회 홈페이지에 올린 사역 임명 명단을 교인명부와 이어, 한 분씩 모았습니다.
  첫 화면 <b>🗂️ 사역 이력 확인</b>을 누르면 내 기록이 <b>해마다 부서 · 팀 · 직책</b>으로 보입니다. <span class="fr" style="color:var(--brass);font-weight:800">⑧</span></p>
  <ol class="steps">
    <li>기록 줄이 틀렸으면 그 줄의 <b>[정정]</b> → <b>「내 것이 아니에요」</b> 또는 <b>「그 밖에」</b>를 고르고 한 줄 설명을 적어 <b>「신청」</b>. 「그 밖에」는 설명을 꼭 적어 주세요. <span class="fr">⑨</span></li>
    <li>빠진 해가 있으면 <b>「＋ 빠진 사역 추가하기」</b> → 연도 · 부서 · 팀(둘 중 하나는 꼭) · 한 줄 설명 → <b>「신청」</b>. <span class="fr">⑩</span></li>
    <li>「맞는 기록을 찾지 못했어요」가 나오면 <b>「내 기록 찾아 주세요」</b>를 누르세요. 그사이 목장이 바뀌었거나 같은 이름이 계시면 그럴 수 있습니다 — 담당자가 찾아 드립니다.</li>
  </ol>
  %(figs_a4)s
  <div class="box warn">
    <ul>
      <li><b>직분은 정정 대상이 아닙니다</b> — 교인명부의 직분을 따릅니다. 화면에도 직분은 보이지 않습니다.</li>
      <li>건강 · 가정 형편 같은 <b>사적인 사정은 적지 말아 주세요.</b> 같은 이름·소속으로 들어오는 사람에게도 보일 수 있습니다.</li>
      <li>신청한 줄은 「신청함」으로 바뀌고, 처리될 때까지 같은 줄에 또 낼 수 없습니다.</li>
    </ul>
  </div>
</section>

<section class="page">
  %(part_a)s
  <h2 class="sec"><span class="no">A-5</span>처리 현황 보기</h2>
  <p>낸 신청은 화면 아래 <b>「📋 내 정정 신청」</b>에 모입니다. 담당자가 처리하면 단계가 바뀌고, 담당자가 적은 답은 <b>💬</b>로 보입니다.</p>
  <table>
    <thead><tr><th style="width:18%%">단계</th><th>뜻</th></tr></thead>
    <tbody>
      <tr><td><span class="st s1">신청</span></td><td>냈어요. 담당자가 아직 보기 전입니다.</td></tr>
      <tr><td><span class="st s2">확인 중</span></td><td>담당자가 부서 · 교인명부를 확인하고 있어요.</td></tr>
      <tr><td><span class="st s3">반영</span></td><td>바로잡았어요. 빠진 사역이면 그 해 기록에 한 줄로 들어갑니다(⑫의 2023년).</td></tr>
      <tr><td><span class="st s4">반영 안 함</span></td><td>고치지 않기로 했어요. 그 까닭이 💬 답으로 적혀 있습니다.</td></tr>
    </tbody>
  </table>
  <p class="note"><b>처리돼도 알림은 가지 않습니다.</b> 며칠 뒤 「🗂️ 사역 이력 확인」을 다시 열어 확인해 주세요.</p>
  %(figs_a5)s
  <h3>이런 것들을 눌러 보세요 — 성도님</h3>
  <ul class="check">
    <li>첫 화면에 「사역현황」 두 단추가 보이나요?</li>
    <li>부서를 펼치고 「보기 ›」로 설명을 읽어 보셨나요?</li>
    <li>「조건으로 빠르게 찾기」로 요일·시간을 걸러 보셨나요?</li>
    <li>사역 1~3개를 골라 제출해 보셨나요(직분 · 번호)?</li>
    <li>「추가/수정」으로 하나 더하거나 빼 보셨나요?</li>
    <li>「신청 취소」를 눌러 보셨나요?</li>
    <li>사역 이력 — 내 기록이 맞나요? 틀린 줄에 [정정]</li>
    <li>빠진 해가 있으면 「＋ 빠진 사역 추가하기」</li>
    <li>며칠 뒤 다시 열어 처리 현황 · 답을 보셨나요?</li>
    <li>글씨 크기 · 화면 넘침 · 누르기 어려운 단추는 없었나요?</li>
  </ul>
</section>

<section class="page">
  %(part_b)s
  <h2 class="sec b"><span class="no">B-1</span>고척교회 관리에 들어가기</h2>
  <div class="b-steps"><ol class="steps">
    <li>휴대폰이나 컴퓨터의 브라우저(크롬 · 사파리 등)에서 <b class="mono">admin.onlybible.kr</b> 을 엽니다. 카카오톡에서 주소를 누르면 기본 브라우저로 넘어갑니다.</li>
    <li><b>「카카오로 시작하기」</b>를 눌러 카카오로 로그인합니다. <span class="fr">①</span></li>
    <li>처음이면 「처음 오셨어요」가 나옵니다. <b>성경암송 앱에 로그인할 때와 같이</b> 교구 · 목장 · 이름을 적고 <b>「승인 요청하기」</b>. <span class="fr">②</span></li>
    <li>「승인을 기다리고 있어요」가 보이면 <b>총괄 관리자에게 알려 주세요.</b> 승인과 함께 역할 <b>「사역신청 담당」</b>을 받으면, <b>「승인됐는지 다시 보기」</b>를 눌러 들어갑니다. <span class="fr">③</span></li>
  </ol></div>
  %(figs_b1)s
  <div class="box tip">
    한 번 로그인하면 그 브라우저에서는 다시 묻지 않습니다. 여러 사람이 쓰는 컴퓨터에서는 다 쓰신 뒤 오른쪽 위 <b>「로그아웃」</b>을 눌러 주세요.
    다른 카카오 계정으로 들어가려면 로그인 화면의 <b>「다른 카카오 계정으로」</b>를 누릅니다.
  </div>
</section>

<section class="page">
  %(part_b)s
  <h2 class="sec b"><span class="no">B-2</span>메뉴 한눈에</h2>
  <p>들어가면 처음 화면에 메뉴 카드가 보이고, 어느 화면에서든 왼쪽 위 <b>☰</b>를 누르면 메뉴가 열립니다. <span class="fr" style="color:var(--green);font-weight:800">④</span>
  역할이 「사역신청 담당」이면 아래 여섯 가지가 보입니다.</p>
  <table class="g">
    <thead><tr><th style="width:26%%">메뉴</th><th>하는 일</th></tr></thead>
    <tbody>
      <tr><td class="k">📋 신청 현황</td><td>앱으로 들어온 신청을 보고 접수 · 임명 · 취소 · 삭제 (→ B-3)</td></tr>
      <tr><td class="k">🗂️ 사역팀 정보</td><td>팀 설명 · 언제 · 담당 · 지금 섬기는 분 · 차례 — 성도님 「보기 ›」 창에 그대로 보입니다 (→ B-5)</td></tr>
      <tr><td class="k">📋 종이 명단 올리기</td><td>종이로 받은 신청을 엑셀 · 붙여넣기로 한꺼번에 넣기 — 알림은 가지 않습니다</td></tr>
      <tr><td class="k">🎉 임명현황</td><td>임명된 분을 부서 · 교구 · 사람별로 보기 · 내려받기</td></tr>
      <tr><td class="k">📜 사역 이력</td><td>지난 해 사역 임명 명단 올리기 · 교인명부와 잇기 · 못 맞춘 줄 고치기 (→ B-5)</td></tr>
      <tr><td class="k">📮 정정 신청</td><td>앱 「사역 이력 확인」에서 온 정정 신청 처리 (→ B-4)</td></tr>
    </tbody>
  </table>
  <h3>🧪 시험 참여자는 ⚙️ 시스템에서</h3>
  <p>미리 써 보실 분(시험 참여자) 명단은 <b>⚙️ 시스템</b> 묶음에 있어 <b>총괄 관리자만</b> 보고 고칩니다.
  함께 써 보셨으면 하는 분이 계시면 총괄 관리자에게 말씀해 주세요. 그분들이 낸 신청은 「📋 신청 현황」에서 <b>🧪 시험</b> 표시로 알아볼 수 있습니다.</p>
  <p class="note">총괄 관리자는 「🧪 시험 참여자」에서 이름으로 찾아 <b>「더하기」 · 「빼기」</b>를 합니다(앱에 한 번이라도 로그인한 분만 찾힙니다 · 성도님 앱에는 다음에 앱을 열 때 반영). <span class="fr" style="color:var(--green);font-weight:800">⑤</span></p>
  %(figs_b2)s
</section>

<section class="page">
  %(part_b)s
  <h2 class="sec b"><span class="no">B-3</span>📋 신청 현황 — 접수 · 임명 · 취소</h2>
  <div class="b-steps"><ol class="steps">
    <li>위 <b>상태 막대</b>(전체 · 신청 · 접수 · 임명 · 취소)를 누르면 그 상태만 봅니다. <b>보기</b>는 건별 · 사람별 · 사역별. <span class="fr">⑥</span></li>
    <li>찾기 칸에 이름 · 소속 · 사역팀을 치면 걸러집니다. <b>「시험」</b>을 치면 🧪 시험 신청만 남습니다.</li>
    <li>카드 오른쪽 위 <b>상태 단추(신청 ▾)</b>를 눌러 접수 · 임명 · 취소로 바꿉니다. <span class="fr">⑦</span></li>
  </ol></div>
  %(figs_b3)s
  <table class="g">
    <thead><tr><th style="width:18%%">바꿀 때</th><th>알아 둘 것</th></tr></thead>
    <tbody>
      <tr><td class="k">임명</td><td>한 번 더 묻습니다. 앱 알림을 켠 분께는 <b>임명 알림이 한 번</b> 나가고(되돌려도 못 무릅니다), 안 켠 분은 게시판·연락으로 알려 주세요.</td></tr>
      <tr><td class="k">취소</td><td><b>사유를 적어야</b> 취소됩니다. 성도님께는 사유 없이 「부서 요청으로 취소되었어요」로 보입니다. 자리는 도로 비어 다른 사역을 신청할 수 있습니다.</td></tr>
      <tr><td class="k">🗑 삭제</td><td>완전히 잘못 들어온 신청을 <b>아주 지웁니다</b> — 두 번 묻고, 되돌릴 수 없습니다. 기록을 남기려면 「취소」를 쓰세요.</td></tr>
    </tbody>
  </table>
  <p class="note">카드의 「교적 ✓」 표시는 이름 · 소속이 교인명부와 맞는지 알려 줍니다. 전화번호를 누르면 전화가 걸립니다.
  결정(임명 · 취소)된 신청의 번호는 「📵 결정된 신청 번호 지우기」로 지우고, 늦어도 180일이면 저절로 지워집니다.</p>
</section>

<section class="page">
  %(part_b)s
  <h2 class="sec b"><span class="no">B-4</span>📮 정정 신청 처리</h2>
  <div class="b-steps"><ol class="steps">
    <li>목록 위 <b>「끝나지 않은 것 ▾」</b>를 눌러 보기를 바꿉니다(끝나지 않은 것 · 끝난 것 · 전부). <span class="fr">⑧</span></li>
    <li>신청을 누르면 처리 창이 열립니다. 상태를 고르고(<b>확인 중 · 반영 · 반영 안 함</b>) 답을 적은 뒤 <b>「저장」</b>. <span class="fr">⑨</span></li>
    <li>기록 줄 자체를 고칠 때는 <b>「📜 그 줄 열기(새 탭)」</b> → 「📜 사역 이력」에서 그 줄을 고칩니다.</li>
    <li><b>빠진 사역</b>을 「반영」하면 창의 <b>「사역 이력에 넣을 내용」</b>(연도 · 부서 · 팀 · 직책)대로 그 해 사역 이력에 한 줄이 더해집니다. <span class="fr">⑩</span></li>
  </ol></div>
  %(figs_b4)s
  <div class="box warn">
    <ul>
      <li><b>「반영 안 함」은 답(사유)을 꼭</b> 적어야 저장됩니다. 끝난 신청은 [확인 중]을 눌러 다시 열 수 있습니다.</li>
      <li><b>「내 것이 아니에요」를 반영</b>할 때는 본인에게 확인(전화 · 대면)했다는 체크가 필요합니다.</li>
      <li>빠진 사역 줄의 직분은 교인명부의 직분으로 들어갑니다. 「반영」에서 다른 상태로 바꾸면 그 줄은 다시 빠집니다.</li>
      <li>처리해도 성도님께 <b>알림은 가지 않습니다.</b> 답은 같은 이름 · 소속으로 들어오는 사람에게도 보이니 다른 분 이름 · 사적인 사정은 적지 마세요.</li>
      <li>「삭제」는 신청을 완전히 지웁니다(되돌릴 수 없음).</li>
    </ul>
  </div>
</section>

<section class="page">
  %(part_b)s
  <h2 class="sec b"><span class="no">B-5</span>📜 사역 이력 · 🗂️ 사역팀 정보 · 🎉 임명현황</h2>
  <ul class="dots">
    <li><b>📜 사역 이력</b> — 해마다의 임명 명단(엑셀)을 올리면 줄마다 교인명부와 이어 둡니다. 해 · 「못 맞춘 줄만」 · 「근거 약한 줄만」으로 거르고,
      줄의 <b>⋯</b> 단추로 「이분」 · 「이분 아님」을 정합니다. 엑셀에 빠진 분은 「＋ 한 줄 더하기」. <span class="fr" style="color:var(--green);font-weight:800">⑪</span></li>
    <li><b>🗂️ 사역팀 정보</b> — 팀을 누르면 설명이 열리고 「✏️ 고치기」로 언제 · 하는 일 · 담당 · 필요 인원 · 섬기는 분을 적습니다.
      팀을 더하거나 이름을 바꾸는 것은 여기서 하지 않습니다(부서 확인 엑셀에서). <span class="fr" style="color:var(--green);font-weight:800">⑫</span></li>
    <li><b>🎉 임명현황</b> — 임명된 분만 부서별 · 교구별 · 사람별로 보고, 「내려받기」로 엑셀(CSV)을 받습니다. <span class="fr" style="color:var(--green);font-weight:800">⑬</span></li>
    <li><b>📋 종이 명단 올리기</b> — 「엑셀 양식 내려받기」로 받은 양식에 적어 올리거나 붙여넣고, 「살펴보기」로 확인한 뒤 넣습니다. 같은 명단을 두 번 올려도 겹치지 않고, 알림은 가지 않습니다.</li>
  </ul>
  %(figs_b5)s
  <h3>이런 것들을 눌러 보세요 — 담당자님</h3>
  <ul class="check g">
    <li>카카오 로그인 → 승인 요청 → 메뉴가 보이나요?</li>
    <li>📋 종이 명단 — 엑셀 양식을 내려받아 보셨나요?</li>
    <li>신청 현황 — 상태 막대 · 보기 · 찾기 「시험」</li>
    <li>상태 바꾸기 — 접수 → 임명(알림 안내 창) · 취소(사유)</li>
    <li>📮 정정 신청 — 확인 중 · 반영 · 반영 안 함(답)</li>
    <li>빠진 사역 「반영」 뒤 성도님 앱에 그 해 줄이 생기나요?</li>
    <li>🗂️ 사역팀 정보 고치기 → 성도님 「보기 ›」 창에 보이나요?</li>
    <li>휴대폰과 컴퓨터 둘 다에서 써 보셨나요?</li>
  </ul>
  <div class="endline"><span class="slogan">오직 성경, 말씀이 답이다!</span><span class="church">고척교회</span></div>
</section>
"""


def build_html():
    ctx = {
        'mark': MARK, 'part_a': PART_A, 'part_b': PART_B,
        'figs_a1': figs(fig('a01', '①', '첫 화면 「사역현황」의 두 단추'),
                        fig('a02', '②', '사역 신청서 — 부서를 눌러 펼칩니다'),
                        fig('a03', '③', '📌 신청안내 — 신청 규칙 여섯 가지')),
        'figs_a2': figs(fig('a04', '④', '팀 카드를 누르면 ✓ — 다시 누르면 빠집니다'),
                        fig('a05', '⑤', '「보기 ›」 — 언제 · 하는 일 · 담당 · 섬기는 분'),
                        fig('a06', '⑥', '신청 사역 확인 — 직분 · 휴대폰 → 제출하기')),
        'figs_a3': figs(fig('a07', '⑦', '사역 신청현황 — 신청 · 접수 · 임명'), cols=2),
        'figs_a4': figs(fig('a08', '⑧', '해마다의 기록 — 줄마다 [정정]'),
                        fig('a09', '⑨', '[정정] — 무엇이 틀렸는지 고르고 한 줄'),
                        fig('a10', '⑩', '＋ 빠진 사역 추가하기 — 연도 · 부서 · 팀')),
        'figs_a5': figs(fig('a11', '⑪', '방금 낸 신청 — 2024 줄은 「신청함」'),
                        fig('a12', '⑫', '담당자 처리 뒤 — 2023 줄이 생기고 💬 답'), cols=2, cls='nr'),
        'figs_b1': figs(fig('b01', '①', '카카오로 시작하기', 'bfig'),
                        fig('b02', '②', '처음이면 — 앱 로그인과 같이 적기', 'bfig'),
                        fig('b03', '③', '승인 기다리기 — 총괄 관리자에게 알리기', 'bfig')),
        'figs_b2': figs(fig('b04', '④', '☰ 메뉴 — 사역신청 메뉴 여섯', 'bfig'),
                        fig('b05', '⑤', '⚙️ 시스템 → 🧪 시험 참여자(총괄 관리자만)', 'bfig'), cols=2, cls='nr'),
        'figs_b3': figs(fig('b06', '⑥', '「김시험」으로 찾은 카드 — 🧪 시험 · 교적 ✓', 'bfig'),
                        fig('b07', '⑦', '상태 단추 — 신청 · 접수 · 임명 · 취소 · 삭제', 'bfig'), cols=2),
        'figs_b4': figs(fig('b08', '⑧', '정정 신청 목록 — 보기 「전부」', 'bfig'),
                        fig('b09', '⑨', '처리 창 — 상태 · 답 · 그 줄 열기', 'bfig'),
                        fig('b10', '⑩', '빠진 사역 「반영」 — 사역 이력에 넣을 내용', 'bfig')),
        'figs_b5': figs(fig('b11', '⑪', '📜 사역 이력 — 「김시험」으로 찾기', 'bfig'),
                        fig('b12', '⑫', '🗂️ 사역팀 정보 — 「찬양대」로 찾기', 'bfig'),
                        fig('b13', '⑬', '🎉 임명현황 — 부서별 · 교구별 · 사람별', 'bfig')),
    }
    return ('<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>사역관리 시험 사용 안내</title>'
            # ⚠️ 구글 웹 글꼴을 쓰지 않는다 — 크롬이 Type3 로 박는다. 이 PC 에 설치된 글꼴(맑은 고딕)을 쓴다.
            '<style>' + STYLE + '</style></head><body>' + (BODY % ctx) + '</body></html>')


def main():
    if len(sys.argv) > 1:
        prepare_images(sys.argv[1])
    missing = [k for k, _, _ in SHOTS if not os.path.exists(os.path.join(IMG_DIR, k + '.jpg'))]
    if missing:
        raise SystemExit('!! 그림이 없다: %s — 찍은 원본 폴더를 인자로 주세요' % ', '.join(missing))
    html = build_html()
    out_html = os.path.join(OUT_DIR, STEM + '.html')
    io.open(out_html, 'w', encoding='utf-8', newline='').write(html)
    print('wrote:', os.path.relpath(out_html, ROOT), '(%d KB)' % (len(html.encode('utf-8')) // 1024))

    chrome = next((c for c in [r'C:\Program Files\Google\Chrome\Application\chrome.exe',
                               r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
                               os.path.join(os.environ.get('LOCALAPPDATA', ''), r'Google\Chrome\Application\chrome.exe')]
                   if c and os.path.exists(c)), None)
    if not chrome:
        raise SystemExit('!! 크롬을 못 찾아 PDF는 건너뜁니다 — HTML을 열어 직접 인쇄하세요.')
    raw_pdf = os.path.join(OUT_DIR, STEM + '.raw.pdf')
    out_pdf = os.path.join(OUT_DIR, STEM + '.pdf')
    # ⚠️ 이 PC 의 다른 세션 크롬과 섞이지 않게 내 프로필 폴더를 따로 준다(끌 때도 그것만 — 메모 stop-only-own-processes)
    prof = os.path.join(os.environ.get('TEMP', OUT_DIR), 'tester-guide-chrome')
    subprocess.run([chrome, '--headless', '--disable-gpu', '--no-pdf-header-footer', '--user-data-dir=' + prof,
                    '--print-to-pdf=' + os.path.abspath(raw_pdf), '--virtual-time-budget=15000',
                    'file:///' + os.path.abspath(out_html).replace(os.sep, '/')], capture_output=True)

    # ── 쪽 번호 · 재기: 쪽수 · 서체 종류(Type0 이어야 한다) · 쪽마다 첫·끝 줄 ──
    import pymupdf
    doc = pymupdf.open(raw_pdf)
    n = doc.page_count
    for i, p in enumerate(doc):
        if i == 0:
            continue
        r = p.rect
        p.insert_text((r.width / 2 - 8, r.height - 7.5 * 72 / 25.4), '%d / %d' % (i + 1, n),
                      fontsize=8, fontname='helv', color=(0.45, 0.45, 0.45))
    doc.save(out_pdf, garbage=3, deflate=True)
    doc.close()
    os.remove(raw_pdf)
    print('wrote:', os.path.relpath(out_pdf, ROOT), '(%d KB)' % (os.path.getsize(out_pdf) // 1024))
    doc = pymupdf.open(out_pdf)
    print('  쪽수: %d (목표 %d)' % (doc.page_count, PAGES))
    fonts = sorted({(f[3], f[2]) for p in doc for f in p.get_fonts()})
    print('  서체:', fonts)
    for i, p in enumerate(doc):
        lines = [l for l in p.get_text().splitlines() if l.strip()]
        print('  %d쪽: %s … %s' % (i + 1, lines[0][:34] if lines else '(빈 쪽)', lines[-1][:34] if lines else ''))


if __name__ == '__main__':
    main()
