# -*- coding: utf-8 -*-
"""가정 축복 기도문 「크게 보기」 액자에 쓸 수채화 잎가지를 앱용으로 줄인다.

원본은 말씀카드(C:\\Projects\\말씀카드_B7\\소재)의 leafT1~6.png — 한 장이 400~800KB 다.
그대로 쓰면 첫 글꼴 765KB 사건과 같은 길이라, 여기서 **투명 여백을 잘라 내고**
높이 600px WebP 로 줄인다(한 장 15~30KB). 액자 하나가 잎가지 한 장만 쓰므로
「크게 보기」를 한 번 열 때 받는 것은 그 한 장뿐이다.

    python tools/frame-art.py

⚠️ 원본 폴더가 없으면 아무것도 하지 않는다(다른 사람 컴퓨터에서 돌려도 안전하게).
"""
import io
import os
import sys

try:
    from PIL import Image
except ImportError:
    raise SystemExit("!! Pillow 가 없다:  pip install pillow")

SRC = r"C:\Projects\말씀카드_B7\소재"
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(HERE, "img", "frame")
H = 600          # 내보낼 높이 — 폰에서 그려지는 크기(약 300px)의 두 배
Q = 72           # WebP 품질. 수채화라 경계가 부드러워 낮아도 티가 안 난다
AQ = 70          # 알파 품질. 기본값 100(무손실)이면 파일이 **두 배**다 —
                 # 70 으로 내려도 화면(옅기 0.5·크림 위) 차이는 최대 5/255,
                 # 평균 0.3/255 다(2026-09-04 실측). 234KB → 132KB.


def main():
    if not os.path.isdir(SRC):
        raise SystemExit("!! 원본 폴더가 없다: %s" % SRC)
    if not os.path.isdir(OUT):
        os.makedirs(OUT)
    total = 0
    for i in range(1, 7):
        src = os.path.join(SRC, "leafT%d.png" % i)
        if not os.path.exists(src):
            print("   [건너뜀] %s" % src)
            continue
        im = Image.open(src).convert("RGBA")
        box = im.getbbox()                     # 투명 여백을 잘라 낸다 — 자리 잡기가 정확해진다
        if box:
            im = im.crop(box)
        w = max(1, int(round(im.width * H / float(im.height))))
        im = im.resize((w, H), Image.LANCZOS)
        dst = os.path.join(OUT, "leaf%d.webp" % i)
        im.save(dst, "WEBP", quality=Q, alpha_quality=AQ, method=6)
        kb = os.path.getsize(dst) / 1024.0
        total += kb
        print("   leaf%d.webp   %dx%d   %.0fKB" % (i, im.width, H, kb))
    print("   합계 %.0fKB" % total)


if __name__ == "__main__":
    if sys.platform == "win32":
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    main()
