# -*- coding: utf-8 -*-
"""App Store 스크린샷(2026-10-15 · 디자인 A안 · 친구가 아이폰 실기기로 찍은 여덟 장) → 올릴 사진.
   원본: 자료/store/screenshots-ios3/ (1125×2436 · RGBA · 실명 · 소속이 보인다 → .gitignore 로 막아 두었다 — 저장소에 올리지 말 것)
   결과: 자료/store/screenshots-ios3-upload/01~08 (1242×2688 · RGB · 이름 자리 흐림)
   ⚠️ App Store 가 받는 크기는 1242×2688(또는 1284×2778)뿐 — 1290×2796 · 1320×2868 은 거부됐다(README 「App Store 스크린샷」).
   ⚠️ 알파(투명 칸)가 있으면 App Store 가 받지 않는다 → RGB 로.
   ⚠️ 흐림은 원본 크기에서 먼저 건다(키운 뒤에 걸면 자리가 어긋난다) · 상자는 원본 픽셀."""
import os
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "screenshots-ios3")
OUT = os.path.join(HERE, "screenshots-ios3-upload")
SIZE = (1242, 2688)

# (원본 파일, 올릴 이름, 흐릴 상자들) — 차례는 App Store 에 올릴 순서(앞의 세 장이 검색 결과에 보인다)
SHOTS = [
    ("20261015_084349412_iOS.png", "01-home.png",        [(70, 415, 600, 505)]),     # 첫 화면 — 맨 위 「화평-20 ○○○ 성도님」
    ("20261015_084549935_iOS.png", "02-memorize.png",    []),                          # 암송 3단계 · 카드로 채우기
    ("20261015_084519703_iOS.png", "03-verse-list.png",  [(280, 2205, 840, 2265)]),   # 말씀 목록 — 「첫 화면으로」 둘째 줄
    ("20261015_084619358_iOS.png", "04-album.png",       [(380, 2205, 745, 2265)]),   # 나의 말씀 앨범 — 같은 자리
    ("20261015_084446713_iOS.png", "05-meditation.png",  []),                          # 오늘의 묵상
    ("20261015_084424014_iOS.png", "06-sermon-chat.png", []),                          # 내게 주시는 말씀
    ("20261015_084752040_iOS.png", "07-manual.png",      [(380, 2205, 745, 2265)]),   # 사용 설명서 — 「첫 화면으로」 둘째 줄
    ("20261015_084709782_iOS.png", "08-settings.png",    []),                          # 설정(글씨 크기 · 말씀 글꼴)
]


def main():
    os.makedirs(OUT, exist_ok=True)
    for src, name, boxes in SHOTS:
        im = Image.open(os.path.join(SRC, src)).convert("RGB")
        for box in boxes:
            part = im.crop(box)
            # 두 번 — 크게 흐린 뒤 한 번 더(글자 모양이 남지 않게)
            part = part.filter(ImageFilter.GaussianBlur(16)).filter(ImageFilter.GaussianBlur(10))
            im.paste(part, box[:2])
        im = im.resize(SIZE, Image.LANCZOS)
        im.save(os.path.join(OUT, name), optimize=True)
        print(name, im.size, im.mode)


if __name__ == "__main__":
    main()
