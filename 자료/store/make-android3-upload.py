# -*- coding: utf-8 -*-
"""Google Play 스크린샷(2026-10-15 · 디자인 A안 · 친구가 안드로이드 실기기로 찍어 카톡으로 옮긴 열 장) → 올릴 사진.
   원본: 자료/store/screenshots-android3/ (1080×2316 · 실명 · 소속 · 상태바 알림이 보인다 → .gitignore — 저장소에 올리지 말 것)
   결과: 자료/store/screenshots-android3-upload/01~09 (1080×2066 · 이름 자리 흐림 · 위 상태바 · 아래 단추 줄 잘라 냄)
   ⚠️ 플레이는 긴 변이 짧은 변의 2배를 넘으면 안 받는다 — 원본 2316/1080 = 2.14 → 상태바(0~95)와 아래 단추 줄(2162~)을 잘라 1.91.
      (상태바에 유튜브 재생 알림 「[고척교회]…」 같은 남의 앱 표시도 함께 빠진다)
   ⚠️ 한 기기에 8장까지 — 01~08 을 올리고 09(설교 요약)는 바꿔 끼울 여분.
   ⚠️ 흐림은 자르기 전 원본 좌표에서 건다(상자는 원본 픽셀). 원본 3번과 7번은 같은 화면(내게 주시는 말씀)이라 하나만 쓴다."""
import os
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "screenshots-android3")
OUT = os.path.join(HERE, "screenshots-android3-upload")
CROP = (0, 96, 1080, 2162)      # 위 상태바 · 아래 단추 줄 잘라 냄 → 1080×2066
FAB = (330, 2028, 750, 2088)    # 「첫 화면으로」 둘째 줄 「화평-20 ○○○ 성도님」
P = "KakaoTalk_20261015_225114344"

# (원본, 올릴 이름, 흐릴 상자들) — 차례는 플레이에 올릴 순서
SHOTS = [
    (P + "_09.jpg", "01-home.png",          [(60, 385, 650, 470)]),       # 첫 화면 — 맨 위 이름
    (P + "_08.jpg", "02-memorize.png",      []),                            # 암송 3단계 · 카드
    (P + "_07.jpg", "03-verse-list.png",    [(160, 2028, 850, 2088)]),     # 말씀 목록 — 이름 · 총 횟수
    (P + ".jpg",    "04-my-calendar.png",   [FAB]),                         # 나의 말씀 암송 참여(달력)
    (P + "_05.jpg", "05-meditation.png",    []),                            # 오늘의 묵상
    (P + "_02.jpg", "06-sermon-chat.png",   []),                            # 내게 주시는 말씀(원본 3 · 7 같은 화면 — 3 을 쓴다)
    (P + "_03.jpg", "07-manual.png",        [FAB]),                         # 사용 설명서
    (P + "_04.jpg", "08-settings.png",      []),                            # 설정(글씨 크기 · 말씀 글꼴)
    (P + "_01.jpg", "09-sermon-summary.png", []),                           # 설교 요약(여분 — 설교자 이름은 공개 정보라 그대로)
]


def main():
    os.makedirs(OUT, exist_ok=True)
    for src, name, boxes in SHOTS:
        im = Image.open(os.path.join(SRC, src)).convert("RGB")
        for box in boxes:
            part = im.crop(box).filter(ImageFilter.GaussianBlur(16)).filter(ImageFilter.GaussianBlur(10))
            im.paste(part, box[:2])
        im = im.crop(CROP)
        im.save(os.path.join(OUT, name), optimize=True)
        print(name, im.size, round(im.size[1] / im.size[0], 3))


if __name__ == "__main__":
    main()
