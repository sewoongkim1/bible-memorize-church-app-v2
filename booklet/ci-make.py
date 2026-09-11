# -*- coding: utf-8 -*-
"""교회 CI(JPG) → 흰 바탕을 걷어낸 PNG → data URI.

    python ci-make.py               가로조합1.jpg 로 만든다(기본)
    python ci-make.py 가로조합2.jpg   다른 조합으로

만드는 것 — `ci-h.png` 와 `ci-h-data-uri.txt`.
`generate_classics.py` 는 **`ci-h-data-uri.txt` 만** 읽는다(없으면 세로 마크로 되돌아간다).

⚠️ **JPG 는 투명이 없어 흰 네모가 딸려 온다.** 색지에 인쇄하면 그 네모가 그대로 보인다 —
   앞표지를 색지에 뽑는 것이 이 책의 전제라(만들기 문서 2-2), 반드시 걷어내야 한다.
   글자 안쪽의 흰 부분도 함께 뚫리는데, 거기는 종이색이 비쳐야 맞는 자리라 오히려 옳다.
⚠️ **JPG 압축 때문에 흰 바탕이 딱 255 가 아니다**(244~255 언저리). 문턱을 255 로 잡으면
   테두리에 흰 실오라기가 남는다 — 238 로 넉넉히 잡고, 색이 도는 화소는 건드리지 않는다
   (밝기만 보면 로고의 옅은 하늘색까지 지워진다).

원본 JPG 는 성도님이 `booklet/` 에 넣어 주신 것이다(가로조합 5종 · 상하 5종 · 세로 2종 + .ai).
"""
import io, os, sys, base64

os.chdir(os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding='utf-8')

try:
    from PIL import Image
except ImportError:
    raise SystemExit('!! Pillow 가 없습니다 —  pip install pillow')

SRC = sys.argv[1] if len(sys.argv) > 1 else '가로조합1.jpg'
PNG, URI = 'ci-h.png', 'ci-h-data-uri.txt'
TH = 238          # 이보다 밝고 색이 없으면 바탕으로 본다
CHROMA = 12       # R·G·B 차이가 이보다 크면 색이 있는 것 — 지우지 않는다

if not os.path.exists(SRC):
    raise SystemExit('!! %s 가 없습니다. booklet/ 의 CI 파일 이름을 확인하세요.' % SRC)

im = Image.open(SRC).convert('RGBA')
w, h = im.size
px = im.load()
n = 0
for y in range(h):
    for x in range(w):
        r, g, b, _ = px[x, y]
        if r >= TH and g >= TH and b >= TH and max(r, g, b) - min(r, g, b) < CHROMA:
            px[x, y] = (r, g, b, 0)
            n += 1

im = im.crop(im.getbbox())          # 투명 여백을 잘라 낸다 — 화면에서 크기 잡기 쉽게
im.save(PNG, optimize=True)
b64 = base64.b64encode(io.open(PNG, 'rb').read()).decode()
io.open(URI, 'w', encoding='utf-8').write('data:image/png;base64,' + b64)

print('  %s → %s' % (SRC, PNG))
print('  원본 %d×%d · 투명으로 바꾼 화소 %d개(%.0f%%)' % (w, h, n, 100.0 * n / (w * h)))
print('  잘라 낸 뒤 %d×%d (가로세로비 %.2f) · PNG %.1fKB'
      % (im.size[0], im.size[1], im.size[0] / im.size[1], os.path.getsize(PNG) / 1024))
print('\n  ⚠️ 가로세로비가 바뀌면 generate_classics.py 의 `.cv-logo { width }` 를 다시 볼 것.')
