# -*- coding: utf-8 -*-
"""성경말씀 암송 앱 · 사용 설명서 A4 한 장(앞뒤) — 어르신용 인쇄물.

■ 왜 종이가 필요한가
  주일 1층 로비에서 봉사자가 설치를 도와드린 뒤, 집에 가서 혼자 하실 때 볼 것이
  있어야 한다. 앱 안 설명서는 앱을 열 줄 알아야 볼 수 있으니 첫 관문에선 못 쓴다.

■ 어르신용 판짜기
  - 본문 12pt 이상, 제목 17pt 이상. 한 줄 22~26자에서 끊는다.
  - 번호(①②③)를 크게 달아 "어디까지 했는지" 손가락으로 짚을 수 있게.
  - 배경색을 넓게 깔지 않는다 — 잉크가 번지면 글씨가 묻힌다. 테두리와 굵기로만 나눈다.
  - QR은 25mm. 그보다 작으면 어르신 손떨림에 초점이 안 맞는다.

■ 앞면 = 시작하기(설치·알림·로그인), 뒷면 = 쓰는 법(암송·듣기·앨범·순위)
  앞면만 보고도 시작은 할 수 있어야 한다. 뒤집는 것을 잊으셔도 막히지 않게.

출력 (이 폴더)
  사용설명서_A4.pdf        앞뒤 2쪽 — 이걸 인쇄해 나눠 드린다
  manual-a4.html           위 PDF의 원본
"""
import io, os

HERE = os.path.dirname(os.path.abspath(__file__))
M = os.path.join(HERE, '..')
QR = io.open(os.path.join(M, 'qr-data-uri.txt'), encoding='utf-8').read().strip()
# 마크만 — 로고의 '고척교회' 글자는 14~20mm에서 뭉개진다(잉크가 번지는 종이면 더).
# logo-mark-data-uri.txt 는 logo-data-uri.txt 에서 글자를 잘라낸 것(marketing/ 공용).
MARK = io.open(os.path.join(M, 'logo-mark-data-uri.txt'), encoding='utf-8').read().strip()

NAVY = '#123059'
GOLD = '#a8801f'

STYLE = """
@page { size: A4 portrait; margin: 0; }
* { box-sizing: border-box; }
body { margin:0; font-family:'맑은 고딕','Malgun Gothic',sans-serif; color:#111; }
.page { width:210mm; height:297mm; padding:11mm 14mm; page-break-after:always;
        display:flex; flex-direction:column; }
.page:last-child { page-break-after:auto; }

.head { display:flex; align-items:center; gap:5mm; border-bottom:1.1mm solid %(navy)s;
        padding-bottom:3mm; margin-bottom:4mm; }
.head .t { flex:1; }
/* 교회 마크만 — 글자는 빼고 상징만 둔다 */
.h-logo { height:19mm; width:auto; flex:0 0 auto; }
.h-logo-s { height:13mm; }
.h-sup { font-size:11pt; font-weight:700; color:%(gold)s; letter-spacing:.4pt; }
.h-title { font-size:27pt; font-weight:800; color:%(navy)s; line-height:1.2; letter-spacing:-.3pt; }
.h-side { text-align:center; flex:0 0 auto; }
.h-qr { width:25mm; height:25mm; display:block; image-rendering:pixelated; }
.h-url { font-size:8.5pt; font-weight:700; color:%(navy)s; margin-top:1mm; }

.lead { font-size:12.5pt; line-height:1.65; color:#222; margin-bottom:4mm; word-break:keep-all; }
.lead b { color:%(navy)s; }

.blocks { display:flex; flex-direction:column; gap:3mm; }
.blk { border:0.5mm solid #b9c2d2; border-radius:3mm; padding:3.2mm 4.5mm; }
.blk-h { display:flex; align-items:center; gap:3mm; margin-bottom:2mm; }
.blk-n { font-size:18pt; font-weight:800; color:%(navy)s; line-height:1; }
.blk-t { font-size:16pt; font-weight:800; color:%(navy)s; line-height:1.2; }
.blk-s { font-size:11.5pt; font-weight:700; color:%(gold)s; margin-left:auto; white-space:nowrap; }
.blk ol { margin:0; padding-left:6mm; }
.blk li { font-size:12.5pt; line-height:1.62; margin-bottom:0.8mm; word-break:keep-all; }
.blk li b { color:%(navy)s; }
.blk p { font-size:12.5pt; line-height:1.62; margin:0; word-break:keep-all; }

.two { display:flex; gap:4mm; }
.two > .blk { flex:1; }

.note { border:0.5mm dashed %(gold)s; border-radius:3mm; padding:3.2mm 4.5mm; }
.note-t { font-size:12.5pt; font-weight:800; color:%(gold)s; margin-bottom:1.5mm; }
.note p { font-size:12pt; line-height:1.7; margin:0; word-break:keep-all; }

.foot { border-top:0.4mm solid #b9c2d2; padding-top:3mm; margin-top:auto;
        font-size:11.5pt; line-height:1.7; color:#333; text-align:center; word-break:keep-all; }
.foot b { color:%(navy)s; }
""" % {'navy': NAVY, 'gold': GOLD}


def head(sup, title, qr=True):
    side = ('<div class="h-side"><img class="h-qr" src="%s">'
            '<div class="h-url">gocheok.onlybible.kr</div></div>' % QR) if qr else ''
    top = '<div class="h-sup">%s</div>' % sup if sup else ''
    logo = '<img class="h-logo%s" src="%s">' % ('' if qr else ' h-logo-s', MARK)
    return ('<div class="head">%s<div class="t">%s'
            '<div class="h-title">%s</div></div>%s</div>' % (logo, top, title, side))


def blk(n, title, side, body):
    s = '<div class="blk-s">%s</div>' % side if side else ''
    return ('<div class="blk"><div class="blk-h"><div class="blk-n">%s</div>'
            '<div class="blk-t">%s</div>%s</div>%s</div>' % (n, title, s, body))


def ol(items):
    return '<ol>' + ''.join('<li>%s</li>' % t for t in items) + '</ol>'


# ── 앞면: 시작하기 ─────────────────────────────────────────────
FRONT = head('', '성경말씀 암송 어플 설명서') + """
<div class="lead">
  휴대폰으로 <b>말씀을 외우는 앱</b>입니다. 비밀번호는 없고 <b>이름만</b> 넣으면 됩니다.<br>
  아래 <b>①②③</b>을 차례로 한 번만 해 두시면, 다음부터는 바탕화면 그림만 누르시면 됩니다.
</div>
<div class="blocks">
""" + blk('①', '앱 열기', '30초', ol([
    '위쪽 <b>네모 그림(QR)</b>에 휴대폰 카메라를 비추세요.',
    '화면에 뜨는 <b>주소를 누르면</b> 앱이 열립니다.',
    '카메라가 안 되면 인터넷 주소창에 <b>gocheok.onlybible.kr</b> 을 치셔도 됩니다.',
])) + blk('②', '바탕화면에 앱 만들기', '1분', """
  <p style="margin-bottom:2mm"><b>카카오톡 안에서 열면 되지 않습니다.</b>
     먼저 「사파리로 열기」 또는 「다른 브라우저로 열기」를 누르세요.</p>""" + ol([
    '앱 첫 화면 위쪽 <b>📲</b> 를 누르세요.',
    '<b>안드로이드</b> — 「설치」 창이 바로 뜹니다. 누르면 끝입니다.',
    '<b>아이폰</b> — 화면 <b>맨 아래 가운데</b> 공유 단추(네모에 ↑)를 누르고, '
    '목록을 아래로 넘겨 <b>「홈 화면에 추가」</b> → <b>「추가」</b>.',
    '바탕화면에 <b>📖 그림</b>이 생기면 성공입니다.',
])) + blk('③', '이름 넣고 · 알림 켜기', '40초', ol([
    '<b>교구</b>인지 <b>교회학교</b>인지 고르세요.',
    '교구는 <b>교구 · 목장 · 이름</b>, 교회학교는 <b>부서 · 학년 · 이름</b>. '
    '한 번 넣으면 다음부터 그대로 이어집니다.',
    '첫 화면 위쪽 <b>🔔</b> 를 누르고, 휴대폰이 물어보면 <b>「허용」</b>. '
    '아침마다 오늘의 말씀을 알려 드립니다.',
])) + """
  <div class="note">
    <div class="note-t">잘 안 되시면</div>
    <p>주일 <b>1층 로비</b>에 도와 드리고 있습니다. <b>(오전 8시 ~ 오후 1시)</b><br>
       휴대폰을 들고 오세요. 설치부터 알림 설정까지 <b>3분이면</b> 끝납니다.</p>
  </div>
</div>
<div class="foot">뒷면에 <b>말씀 외우는 방법</b>이 있습니다 &nbsp;▶</div>"""

# ── 뒷면: 쓰는 법 ─────────────────────────────────────────────
BACK = head('성경말씀 암송', '말씀 외우는 방법', qr=False) + """
<div class="lead">
  빈칸을 채우며 <b>세 번에 나누어</b> 외웁니다. 틀려도 괜찮습니다 — 다시 넣으면 됩니다.
</div>
<div class="blocks">
""" + blk('✍️', '암송하기: 빈칸 채우며 외우기', '', ol([
    '<b>1단계</b> — 빈칸이 조금 (넷 중 하나쯤)',
    '<b>2단계</b> — 빈칸이 많이 (셋 중 둘쯤)',
    '<b>3단계</b> — 전부 빈칸',
    '맞으면 <b>초록색</b>, 틀리면 잠깐 <b>빨간색</b>이 됩니다.',
    '막히면 <b>💡 힌트</b> 를 누르세요. 한 글자씩 보여 줍니다.',
])) + """
<div class="two">
""" + blk('🔊', '귀로 듣기', '', ol([
    '구절 옆 <b>🔊</b> — 그 말씀 하나',
    '<b>▶️ 전체 듣기</b> — 처음부터 끝까지',
    '듣는 동안 <b>화면이 안 꺼집니다</b>',
])) + blk('🎤', '소리 내어', '', ol([
    '<b>🎤 암송 시작</b> 을 누르고',
    '소리 내어 외운 뒤 <b>■ 종료</b>',
    '얼마나 맞았는지 알려 줍니다',
])) + """
</div>
""" + blk('👑', '외운 말씀 모으기', '나의 말씀 앨범', ol([
    '3단계까지 마치면 <b>👑 마음에 두었나이다</b> 를 누를 수 있습니다.',
    '첫 화면 <b>📖 나의 말씀 앨범</b> 에 모입니다.',
    '앨범에서는 말씀을 <b>가리고 스스로 맞혀</b> 볼 수 있습니다.',
])) + blk('🏆', '함께 하기', '순위 · 게시판', ol([
    '<b>🏆 순위</b> — 다른 분 줄의 <b>👏</b> 를 누르면 응원이 전해집니다.',
    '<b>💬 응원·기도·공감</b> — 기도 제목을 남기시면 함께 기도합니다.',
])) + """
  <div class="note">
    <div class="note-t">글씨가 작아 보이시면</div>
    <p>첫 화면 오른쪽 위 <b>⚙️</b> → <b>글씨 크기</b> 에서 <b>「아주 큼」</b> 을 고르세요.
       읽어 주는 <b>속도</b>도 느리게 할 수 있습니다.</p>
  </div>
</div>
<div class="foot">
  앱 안에서도 <b>❓</b> 를 누르면 같은 설명서를 보실 수 있습니다<br>
  <b>고척교회 제자양육부 신앙운동팀</b> &nbsp;·&nbsp; gocheok.onlybible.kr
</div>"""

html = ('<!doctype html><html lang="ko"><head><meta charset="utf-8">'
        '<title>성경말씀 암송 어플 설명서</title><style>' + STYLE + '</style></head><body>'
        '<div class="page">' + FRONT + '</div>'
        '<div class="page">' + BACK + '</div>'
        '</body></html>')

out = os.path.join(HERE, 'manual-a4.html')
io.open(out, 'w', encoding='utf-8', newline='').write(html)
print('wrote:', os.path.basename(out))
print('다음: 크롬 --headless --print-to-pdf 로 사용설명서_A4.pdf 를 뽑는다')
