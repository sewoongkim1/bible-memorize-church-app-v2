# -*- coding: utf-8 -*-
"""말씀암송 이벤트 포스터 — 이미지(PNG)용 A4 세로.
   사용자가 PPT에서 잡은 문구·순서를 그대로 두고 조판만 다듬는다."""
import io

M = 'c:/Projects/bible-memorize-church-app-v2/marketing/'
QR = io.open(M + 'qr-data-uri.txt', encoding='utf-8').read().strip()
LOGO = io.open(M + 'logo-data-uri.txt', encoding='utf-8').read().strip()

HTML = """<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;800;900&display=swap" rel="stylesheet">
<style>
* { box-sizing: border-box; margin: 0; }
body { font-family: "Noto Sans KR", sans-serif; }
.p { width: 1240px; height: 1754px; position: relative; background: #fff; overflow: hidden;
     background-image: linear-gradient(#eceff6 1px, transparent 1px),
                       linear-gradient(90deg, #eceff6 1px, transparent 1px);
     background-size: 47px 47px; }
.in { position: relative; height: 100%; padding: 74px 92px 62px; display: flex; flex-direction: column; }
.rule { border-top: 7px solid #10204a; border-bottom: 2px solid #10204a; height: 13px; flex: none; }
.rule.b { }
.fx { flex: 1; min-height: 0; }

.title { font-size: 76px; font-weight: 900; color: #10204a; letter-spacing: -.03em;
         text-align: center; margin-top: 54px; line-height: 1.1; }
.divider { display: flex; align-items: center; justify-content: center; gap: 22px; margin-top: 30px; }
.divider i { display: block; width: 150px; height: 2px; background: #c9a24b; }
.divider b { width: 15px; height: 15px; background: #c9a24b; transform: rotate(45deg); }

/* 두 박자로 — 첫 줄은 '우리 것', 둘째 줄이 찌른다 */
.sub  { text-align: center; font-size: 32px; font-weight: 700; color: #2b3d63; margin-top: 30px;
        letter-spacing: .06em; }
.sub2 { text-align: center; font-size: 43px; font-weight: 800; color: #10204a; margin-top: 8px;
        letter-spacing: -.01em; }
.sub3 { text-align: center; font-size: 30px; font-weight: 700; color: #8a6a1e; margin-top: 16px; }
.sub3 b { color: #c0392b; font-weight: 800; }

.quiz { border: 3px solid #c9a24b; background: #fdfaf0; border-radius: 16px;
        padding: 42px 40px 34px; margin-top: 0; text-align: center; }
.quiz .v { font-size: 48px; font-weight: 800; color: #10204a; line-height: 1.85; letter-spacing: -.02em; }
.quiz .v u { display: inline-block; min-width: 132px; border-bottom: 5px solid #c0392b;
             text-decoration: none; }
.quiz .r { font-size: 28px; font-weight: 800; color: #6b3fa0; margin-top: 18px; }

.when { display: flex; align-items: center; justify-content: center; gap: 26px;
        border: 2px solid #dfe4ee; background: #fff; border-radius: 14px;
        padding: 22px 30px; margin-top: 30px; }
.when b  { font-size: 26px; font-weight: 800; color: #c0392b; letter-spacing: .38em; text-indent: .38em; }
.when span { font-size: 41px; font-weight: 800; color: #10204a; }

/* 3단계 — 색을 흩뜨리지 않고 금색 번호 + 같은 바탕으로 통일 */
.how { display: flex; gap: 18px; margin-top: 34px; }
.how div { flex: 1; background: #f4f7fc; border: 2px solid #e1e7f2; border-radius: 14px;
           padding: 24px 14px 22px; text-align: center; }
.how b { display: inline-flex; align-items: center; justify-content: center;
         width: 42px; height: 42px; border-radius: 50%; background: #c9a24b; color: #fff;
         font-size: 22px; font-weight: 900; }
.how span { display: block; font-size: 25px; font-weight: 700; color: #10204a; margin-top: 12px;
            line-height: 1.45; word-break: keep-all; }

.gift { text-align: center; font-size: 37px; font-weight: 800; color: #c0392b; margin-top: 0;
        letter-spacing: -.01em; }

.foot { display: flex; flex-direction: column; align-items: center; margin-top: 0; }
.foot img.qr { width: 248px; height: 248px; image-rendering: pixelated;
               border: 2px solid #e1e7f2; border-radius: 14px; padding: 10px; background: #fff; }
.foot b { display: block; font-size: 30px; font-weight: 800; color: #10204a; margin-top: 18px; }
/* 교회 마크는 맨 아래 중앙 — 기존 교회 포스터와 같은 자리 */
.logo { display: flex; align-items: center; justify-content: center; gap: 12px; }
.logo img { width: 54px; height: 54px; object-fit: cover; object-position: top; }
.logo em { font-style: normal; font-size: 30px; font-weight: 800; color: #10204a;
           letter-spacing: -.02em; }
</style></head><body>
<div class="p"><div class="in">
  <div class="rule"></div>

  <div class="title">말씀암송이 답이다!</div>
  <div class="divider"><i></i><b></b><i></i></div>

  <div class="sub">매주 함께 암송한 말씀</div>
  <div class="sub2">그 말씀이 지금 내 발 앞을 비추고 있나요?</div>
  <div class="sub3">하루 한 구절이면 됩니다 — <b>한 발짝이 두 발짝, 열 발짝이 됩니다</b></div>

  <div class="fx"></div>
  <div class="quiz">
    <div class="v">주의 말씀은 내 발에 <u></u>이요<br>내 길에 <u></u>이니이다</div>
    <div class="r">시편 119편 105절</div>
  </div>

  <div class="when"><b>참 여 기 간</b><span>8월 16일 — 9월 30일</span></div>

  <div class="how">
    <div><b>1</b><span>QR 스캔 후<br>교구·이름 입력</span></div>
    <div><b>2</b><span>「말씀암송이 답이다!」<br>이벤트 참여하기</span></div>
    <div><b>3</b><span>말씀을 암송하며<br>빈칸 채우기</span></div>
  </div>

  <div class="fx"></div>
  <div class="gift">참여하신 성도님께는 소정의 선물을 드립니다</div>

  <div class="fx"></div>
  <div class="foot">
    <img class="qr" src="__QR__">
    <b>휴대폰 카메라로 QR을 비춰 주세요</b>
  </div>

  <div class="fx"></div>
  <div class="logo"><img src="__LOGO__"><em>고척교회</em></div>

  <div class="fx"></div>
  <div class="rule b"></div>
</div></div>
</body></html>"""

HTML = HTML.replace('__QR__', QR).replace('__LOGO__', LOGO)
io.open('poster-img.html', 'w', encoding='utf-8').write(HTML)
print('ok')
