# -*- coding: utf-8 -*-
"""2027 사역신청 진행 공유 · A4 1장 — 「2027 사역신청서 기획(안)」(9/8)의 다음 판.

■ 무엇인가
  9월 8일 기획(안)을 드린 뒤 무엇이 만들어졌고, 무엇이 남았는지를 실제 앱 화면(담당자
  미리보기로 찍은 캡처 6장)과 함께 한 장으로 공유한다(2026-09-17, 성도님 요청).
  받는 분은 기획(안)과 같다 — 목사님·부서장님.

■ 화면 캡처
  ministry/화면/0.jpg ~ 5.jpg (1080×2316, 폰 캡처). 위아래 상태 표시줄은 잘라 내고
  보여 줄 자리만 CROPS 로 자른다. ⚠️ ⑥ 신청 확인 화면은 **소속·이름 줄 아래(직분부터)** 자른다
  — 찍은 분의 실제 이름이 찍혀 있다. 캡처를 다시 찍으면 CROPS 의 y 를 다시 볼 것.

■ 사실만 적는다
  「만들어진 것」은 git 기록(9/8~9/12 feat·fix)과 서버 코드에서 확인한 것만 적었다:
  최대 3개(MIN_MAX) · 상태 신청완료→접수완료→임명확정/미채택(MINISTRY_STATUS) ·
  임명확정 때 알림은 **알림을 켠 분께만**(pushToSubs). 바뀌면 여기도 고친다.
  · 단계의 날짜는 적지 않고, 신청은 「12월 중순」으로만 적는다(성도님 지시 2026-09-17 —
    운영 app_config 는 12-13~27 이지만 확정 전이다).
  · 테스트 URL(?preview=ministry)로 낸 신청은 **운영 DB 에 실제로 저장되고 취소도 된다**
    (index.ts ministryApply 경고 — 신청 기간 전에 시험 행을 지운다). 그래서 문서에 그 말을 함께 적는다.

■ 지면 — 실측으로 확인한다
  캡처 폭·자르는 높이(CROP_H)는 상수. 1장을 넘으면 CROP_H 를 줄이고 다시 돌린다.
  PDF 쪽수는 pymupdf 로 재서 찍는다.

출력: ministry/2027_사역신청_진행공유_A4.html · .pdf
"""
import base64, io, os, subprocess
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..')
OUT_DIR = os.path.join(ROOT, 'ministry')
SHOT_DIR = os.path.join(OUT_DIR, '화면')
MARK = io.open(os.path.join(ROOT, 'marketing', 'logo-mark-data-uri.txt'), encoding='utf-8').read().strip()
STEM = '2027_사역신청_진행공유_A4'

CROP_H = 1290      # 원본(1080 폭)에서 자르는 높이 — 1400 이면 셋째 줄이 2쪽으로 넘친다
SHOT_PX = 540      # 문서에 넣을 폭(px) — 46mm 폭에 300dpi 쯤
BRASS = (200, 168, 75)

# (파일, 자르기 시작 y, 제목, 설명, 강조 상자(원본 좌표) 또는 None)
# ⚠️ 흐림 상자(BLURS) — 사람 이름이 찍힌 자리. 저장소가 공개이고 문서가 돌려 읽히므로
#    ⑤의 「섬기는 분」 간사님 두 분 이름·교구목장을 글자만 흐린다(성도님 요청 2026-09-17).
#    캡처를 다시 찍으면 이 좌표도 다시 볼 것 — 어긋나면 이름이 그대로 나간다.
CROPS = [
    (0, 425, '첫 화면', '「함께」 묶음에 사역신청 — 신청 기간에만 보입니다', (112, 1335, 968, 1513)),
    (1, 270, '조건으로 빠르게 찾기', '이름 · 언제 · 얼마나 자주 · 몇 시쯤', None),
    (2, 490, '부서별로 펼쳐 보기', '고른 팀 수가 부서 이름 옆에 붙습니다', None),
    (3, 260, '팀 고르기', '팀마다 한 줄 안내와 「자세히 보기」', None),
    (4, 505, '자세히 보기 · 방송실 운영', '언제 · 하는 일 · 섬기는 분', None),
    (5, 690, '신청 확인 → 제출', '직분 · 휴대폰을 확인하고 제출합니다', None),
]


BLURS = {
    4: [(122, 1392, 562, 1466), (122, 1507, 562, 1581)],   # 「섬기는 분」 이름 칸 둘
}


def shot_uri(n, y, ring):
    im = Image.open(os.path.join(SHOT_DIR, '%d.jpg' % n)).convert('RGB')
    for box in BLURS.get(n, []):
        # 한 번 흐리면 굵은 글자는 윤곽이 남는다 — 세 번 겹쳐 읽을 수 없게
        region = im.crop(box)
        for _ in range(3):
            region = region.filter(ImageFilter.GaussianBlur(18))
        im.paste(region, box[:2])
    if ring:
        d = ImageDraw.Draw(im)
        d.rounded_rectangle(ring, radius=46, outline=BRASS, width=12)
    im = im.crop((0, y, 1080, y + CROP_H))
    im = im.resize((SHOT_PX, round(CROP_H * SHOT_PX / 1080)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, 'JPEG', quality=84, optimize=True)
    return 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode('ascii')


TEST_URL = 'https://gocheok.onlybible.kr/?preview=ministry'


def qr_uri(text):
    import qrcode
    im = qrcode.make(text, box_size=10, border=1)
    buf = io.BytesIO()
    im.save(buf, 'PNG')
    return 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode('ascii')


NUMS = '①②③④⑤⑥'

shots = ''.join(
    '<figure class="shot"><div class="frame"><img src="%s" alt=""></div>'
    '<figcaption><b>%s %s</b><span>%s</span></figcaption></figure>'
    % (shot_uri(n, y, ring), NUMS[i], title, desc)
    for i, (n, y, title, desc, ring) in enumerate(CROPS))

STYLE = """
@page { size:A4; margin:12mm; }
* { box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
html, body { margin:0; }
body { font-family:'Noto Sans KR','맑은 고딕',sans-serif; color:#111; background:#fff; font-size:8.6pt; line-height:1.6; }
:root { --navy:#17325c; --navy-deep:#0c1f3d; --navy-tint:#eef1f6; --brass:#8a6a2f; --brass-tint:#f4eeda;
        --line:#ccc; --soft:#444; --alt:#f3f3f3; }
h1, h2 { margin:0; color:var(--navy-deep); }

.route { display:flex; justify-content:space-between; align-items:center; gap:6mm;
         padding-bottom:3mm; margin-bottom:3.4mm; border-bottom:0.55mm solid var(--navy); }
.route .eyebrow { font-size:7.4pt; letter-spacing:.12em; color:var(--brass); font-weight:800; margin-bottom:1.4mm; }
.route h1 { font-family:'Noto Serif KR',serif; font-size:19pt; font-weight:900; line-height:1.25; }
.route .sub { font-size:8.2pt; color:var(--soft); margin-top:0.8mm; }
.route .mark { height:12mm; width:auto; flex:none; }

.lede { font-size:8.8pt; line-height:1.62; margin:0 0 3.4mm; word-break:keep-all; }
.lede b { color:var(--navy-deep); }

.cols { display:grid; grid-template-columns:1fr 96mm; gap:6mm; align-items:start; }

h2.sec { font-size:9.4pt; font-weight:800; margin:0 0 2.2mm; padding-bottom:1.2mm; border-bottom:0.25mm solid var(--line); }
.block { margin-bottom:3.4mm; }

/* 진행 단계 — 세로 띠. 끝난 것 ✓, 지금 ●, 앞으로 ○ */
.steps { list-style:none; margin:0; padding:0; }
.steps li { display:grid; grid-template-columns:5mm 1fr; column-gap:2mm; position:relative; padding-bottom:1.3mm; }
.steps li:not(:last-child)::before { content:''; position:absolute; left:2.35mm; top:5mm; bottom:0;
                                     border-left:0.3mm solid #c9ced8; }
.steps .dot { width:5mm; height:5mm; border-radius:50%; display:flex; align-items:center; justify-content:center;
              font-size:7pt; font-weight:800; border:0.35mm solid #b9c0cc; color:#8a93a3; background:#fff; }
.steps .done .dot { background:var(--navy); border-color:var(--navy); color:#fff; }
.steps .now .dot { background:var(--brass); border-color:var(--brass); color:#fff; }
.steps .when { display:inline-block; font-size:7pt; color:var(--soft); font-weight:700; line-height:1.3;
               border:0.25mm solid #c9ced8; border-radius:1mm; padding:0 1.2mm; margin-right:1.4mm;
               vertical-align:0.3mm; background:#fff; }
.steps .now .when { color:var(--brass); border-color:var(--brass); }
.steps .what { font-size:8.8pt; font-weight:800; color:var(--navy-deep); line-height:1.35; padding-top:0.5mm; }
.steps .now .what { color:var(--brass); }
.steps .how { font-size:7.6pt; color:var(--soft); line-height:1.45; word-break:keep-all; }

/* 만들어진 것 */
.built { display:flex; flex-direction:column; gap:1.4mm; }
.built div { background:var(--alt); border-radius:1.6mm; padding:1.5mm 2.6mm; font-size:7.8pt; line-height:1.5; word-break:keep-all; }
.built div b { display:block; font-size:8.3pt; color:var(--navy-deep); margin-bottom:0.4mm; }

/* 앞으로 해야 할 일 */
.todo { list-style:none; counter-reset:t; margin:0; padding:0; display:flex; flex-direction:column; gap:1.4mm; }
.todo li { counter-increment:t; position:relative; padding:1.5mm 2.6mm 1.5mm 8.6mm; background:var(--brass-tint);
           border-radius:1.6mm; font-size:7.8pt; line-height:1.5; word-break:keep-all; }
.todo li::before { content:counter(t); position:absolute; left:2.5mm; top:1.8mm; width:4.2mm; height:4.2mm; border-radius:50%;
                   background:var(--brass); color:#fff; font-size:7pt; font-weight:800;
                   display:flex; align-items:center; justify-content:center; line-height:1; }
.todo li b { display:block; font-size:8.3pt; color:var(--navy-deep); margin-bottom:0.3mm; }

/* 테스트 URL — 종이로 보시는 분은 QR 로 */
.try { display:flex; gap:3mm; align-items:center; border:0.3mm solid var(--navy); border-radius:1.8mm;
       padding:2mm 2.6mm; background:var(--navy-tint); }
.try .t { flex:1; min-width:0; }
.try .who { font-size:7.2pt; font-weight:800; color:var(--navy); letter-spacing:.05em; }
.try .url { font-size:8.4pt; font-weight:800; color:var(--navy-deep); line-height:1.35; margin:0.4mm 0 0.8mm; }
.try .how { font-size:7.3pt; line-height:1.5; color:var(--soft); word-break:keep-all; }
.try .how b { color:var(--navy-deep); }
.try .qr { width:19mm; height:19mm; flex:none; image-rendering:pixelated; background:#fff; }

/* 화면 */
.screens .lede2 { font-size:7.8pt; color:var(--soft); line-height:1.5; margin:-0.6mm 0 2.4mm; word-break:keep-all; }
.grid { display:grid; grid-template-columns:1fr 1fr; column-gap:4mm; row-gap:2.2mm; }
.shot { margin:0; }
.shot .frame { border:0.3mm solid #cfd5df; border-radius:2.6mm; overflow:hidden; background:#fdf8f0; line-height:0; }
.shot img { width:100%; height:auto; display:block; }
.shot figcaption { margin-top:1.1mm; line-height:1.35; }
.shot figcaption b { display:block; font-size:8pt; color:var(--navy-deep); }
.shot figcaption span { display:block; font-size:7pt; color:var(--soft); word-break:keep-all; }

footer { position:fixed; left:0; right:0; bottom:0; display:grid; grid-template-columns:1fr auto 1fr;
         align-items:baseline; gap:3mm; padding-top:2mm; border-top:0.25mm solid var(--line); background:#fff; }
footer .slogan { grid-column:2; text-align:center; font-family:'Noto Serif KR',serif; font-size:9pt; font-weight:700; color:var(--navy); }
footer .church { grid-column:3; text-align:right; font-size:8pt; font-weight:700; color:var(--brass); }
"""

BODY = """
<div class="route">
  <div>
    <div class="eyebrow">방송전산부 전산팀 · 2026년 9월 17일</div>
    <h1>2027 사역신청 진행 공유</h1>
    <div class="sub">9월 8일 「2027 사역신청서 기획(안)」 다음 판</div>
  </div>
  <img class="mark" src="%(mark)s" alt="고척교회">
</div>

<p class="lede">기획(안)에서 말씀드린 온라인 사역신청을 <b>성경말씀 암송 앱 안에 만들었습니다.</b>
성도님 화면과 담당자 기본 화면이 운영 서버에 올라가 있고, 아래 <b>테스트 URL</b>로 직접 눌러 보실 수 있습니다.
지금은 담당 목사님·팀장님과 <b>임명까지의 세부 절차</b>를 기획하고 있습니다.</p>

<div class="cols">
  <div>
    <div class="block">
      <h2 class="sec">진행 단계</h2>
      <ol class="steps">
        <li class="done"><span class="dot">✓</span><div>
          <div class="what">기획(안) 공유</div></div></li>
        <li class="done"><span class="dot">✓</span><div>
          <div class="what">앱 화면 만들기</div>
          <div class="how">성도 화면 · 담당자 기본 화면 — 운영 서버에 올렸습니다</div></div></li>
        <li class="now"><span class="dot">●</span><div><div class="what"><span class="when">지금</span>사역신청 세부 절차 기획</div>
          <div class="how">담당 목사님 · 팀장님</div></div></li>
        <li><span class="dot"></span><div><div class="what"><span class="when">10월</span>부서 자료 받기</div>
          <div class="how">사역팀마다 「사역팀 소개서」 한 장</div></div></li>
        <li><span class="dot"></span><div>
          <div class="what">관리자 기능 만들기</div>
          <div class="how">정해진 절차에 맞춰 접수 · 임명 기능을 완성합니다</div></div></li>
        <li><span class="dot"></span><div><div class="what"><span class="when">12월 중순</span>성도님 신청</div>
          <div class="how">신청 기간에만 첫 화면에 사역신청 단추가 보입니다</div></div></li>
        <li><span class="dot"></span><div><div class="what"><span class="when">신청 뒤</span>접수 · 임명</div>
          <div class="how">임명이 확정되면 앱 알림을 켜 두신 분께 알림이 갑니다</div></div></li>
      </ol>
    </div>

    <div class="block">
      <h2 class="sec">만들어진 것</h2>
      <div class="built">
        <div><b>성도 화면</b>부서를 펼쳐 팀을 고르고(최대 3개) 직분·휴대폰을 확인해 제출합니다.
        낸 뒤에는 진행 상황을 앱에서 봅니다.</div>
        <div><b>담당자 화면 (기본)</b>신청을 상태별로 보고(신청완료 → 접수완료 → 임명확정 · 미채택)
        팀 설명을 고칩니다.</div>
        <div><b>부서 자료 양식(종이)</b>「부서 소개서」 · 팀당 한 장 「사역팀 소개서」와 작성 예시.
        적어 주신 내용이 ⑤의 설명이 됩니다.</div>
      </div>
    </div>

    <div class="block">
      <h2 class="sec">앞으로 해야 할 일</h2>
      <ol class="todo">
        <li><b>임명까지 사역신청 세부 절차 기획</b>신청 → 접수 → 임명 확정까지 누가 언제 무엇을 할지
        정합니다. 관리자 기능의 기준이 됩니다.</li>
        <li><b>부서 자료 배부 및 취합</b>10월에 두 소개서를 부서에 나눠 드리고 모읍니다.</li>
      </ol>
    </div>

    <div class="try">
      <div class="t">
        <div class="who">테스트 URL</div>
        <div class="url">%(url_html)s</div>
        <div class="how">앱에 로그인한 뒤 이 주소로 열면 첫 화면 「함께」 묶음에 <b>사역신청</b> 단추가 보입니다.
        시험으로 낸 신청도 저장되고 취소해 볼 수 있습니다 — 시험 신청은 실제 신청 전에 정리합니다.</div>
      </div>
      <img class="qr" src="%(qr)s" alt="">
    </div>
  </div>

  <div class="screens">
    <h2 class="sec">성도님이 보시는 화면 (실제 앱)</h2>
    <p class="lede2">담당자 미리보기로 찍었습니다. 방송실 운영 설명은 작성 예시로 넣은 값이고,
    다른 팀 설명은 부서 자료를 받기 전이라 예시입니다. 휴대폰 번호는 가짜입니다.</p>
    <div class="grid">%(shots)s</div>
  </div>
</div>

<footer><span class="slogan">오직 성경, 말씀이 답이다!</span><span class="church">고척교회</span></footer>
""" % {'mark': MARK, 'shots': shots, 'url_html': TEST_URL.replace('kr/', 'kr/<wbr>'), 'qr': qr_uri(TEST_URL)}

html = ('<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>2027 사역신청 진행 공유</title>'
        '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
        '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@700;900'
        '&family=Noto+Sans+KR:wght@400;500;700;800&display=block">'
        '<style>' + STYLE + '</style></head><body>' + BODY + '</body></html>')

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
if chrome:
    subprocess.run([chrome, '--headless', '--disable-gpu', '--no-pdf-header-footer',
                    '--print-to-pdf=' + os.path.abspath(out_pdf), '--virtual-time-budget=12000',
                    'file:///' + os.path.abspath(out_html).replace(os.sep, '/')], capture_output=True)
    if os.path.exists(out_pdf):
        print('wrote:', os.path.relpath(out_pdf, ROOT))
        try:
            import pymupdf
            print('  페이지 수:', pymupdf.open(out_pdf).page_count, '(목표 1장)')
        except ImportError:
            pass
else:
    print('!! 크롬을 못 찾아 PDF는 건너뜁니다 — HTML을 열어 직접 인쇄하세요.')

# ── 묶음 한 파일 — 진행 공유 · 처음 기획(안) · 사역팀 소개서 · 작성 예시 (성도님 요청 2026-09-17) ──
# ⚠️ 뒤의 셋은 이 파일이 만들지 않는다(기획서는 손으로 만든 HTML, 소개서 둘은
#    ministry-dept-intro-form-gen.py). 그쪽을 다시 뽑았으면 이 파일도 다시 돌려야 묶음에 반영된다.
BUNDLE = [
    (STEM + '.pdf', '1. 2027 사역신청 진행 공유'),
    ('2027_사역신청_기획서_A4.pdf', '2. 2027 사역신청서 기획(안)'),
    ('2027_사역팀소개서_A4.pdf', '3. 2027 사역팀 소개서 (양식)'),
    ('2027_사역팀소개서_A4_예시_방송실운영.pdf', '4. 2027 사역팀 소개서 (작성 예시 · 방송실 운영)'),
]
try:
    import pymupdf
    out = pymupdf.open()
    toc = []
    for name, title in BUNDLE:
        src = pymupdf.open(os.path.join(OUT_DIR, name))
        toc.append([1, title, out.page_count + 1])   # 책갈피 — PDF 보기 옆 목록에서 바로 간다
        out.insert_pdf(src)
    out.set_toc(toc)
    out_bundle = os.path.join(OUT_DIR, '2027_사역신청_진행공유_묶음.pdf')
    out.save(out_bundle, garbage=3, deflate=True)
    print('wrote:', os.path.relpath(out_bundle, ROOT), '— %d쪽 (목표 %d쪽)' % (out.page_count, len(BUNDLE)))
except ImportError:
    print('!! pymupdf 가 없어 묶음은 건너뜁니다.')
