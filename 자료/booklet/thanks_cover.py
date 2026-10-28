# -*- coding: utf-8 -*-
"""「감사의 새벽, 은혜를 셉니다」 표지 사진 — 유튜브 썸네일에서 글자를 지워 `thanks2026-cover.jpg` 로.

    python thanks_cover.py                 1일차 영상 썸네일을 받아 만든다
    python thanks_cover.py 썸네일.jpg       가진 그림으로(1280×720 썸네일 그대로)

썸네일(십자가·성경·가을 낙엽)에는 행사명·제목·본문 글자와 아래 자막 띠가 박혀 있다(영상 첫 화면도 같다).
배경이 흐린 사진이라 **글자 상자를 통째로 둘레 색으로 메운다**(정규화 합성곱 — 큰 번짐부터 작은 번짐으로).
⚠️ 글자 픽셀만 지우면 글자 둘레의 검은 테·그림자가 유령처럼 남는다(첫 시도).
⚠️ 「다」 획이 십자가 가로대 왼쪽 끝에 겹친다 — 가로대는 세로 기둥(x≈1040)을 축으로 **오른쪽 끝을 비춰** 붙인다.
⚠️ 메울 재료에서 십자가·솔방울(어두운 것)을 뺀다 — 안 빼면 둘레가 거뭇하게 번진다.
아래 자막 띠(y≈603~)와 오른쪽 아래 반짝이는 잘라 낸다 → 1280×572.
좌표는 2026 추수감사 썸네일에 맞춘 값이다 — 다른 그림이면 상자를 다시 잡을 것.
"""
import os, sys, urllib.request

os.chdir(os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding='utf-8')

try:
    import cv2, numpy as np
except ImportError:
    raise SystemExit('!! opencv 가 없습니다 —  pip install opencv-python numpy')

VIDEO = 'OE9vy3t_QI8'          # 1일차
OUT = 'thanks2026-cover.jpg'
BOXES = [(108, 138, 532, 193),  # 2026 추수감사 특별새벽기도회
         (93, 186, 1003, 291),  # 감사의 새벽, 은혜를 셉니다
         (188, 289, 887, 361),  # 제목 : …
         (226, 355, 854, 421)]  # 본문 : …
CROSS_X = 1040                  # 세로 기둥 한가운데


def load():
    if len(sys.argv) > 1:
        return cv2.imread(sys.argv[1])
    url = 'https://i.ytimg.com/vi/%s/maxresdefault.jpg' % VIDEO
    data = urllib.request.urlopen(url, timeout=30).read()
    return cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)


def main():
    src = load()
    if src is None or src.shape[:2] != (720, 1280):
        raise SystemExit('!! 1280×720 썸네일이 아닙니다 — 좌표가 맞지 않습니다.')
    im = src.astype(np.float32)
    H, W = im.shape[:2]
    hole = np.zeros((H, W), np.float32)
    for x0, y0, x1, y1 in BOXES:
        hole[y0:y1, x0:x1] = 1
    v = cv2.cvtColor(src, cv2.COLOR_BGR2HSV)[..., 2]
    dark = (v < 95).astype(np.uint8)
    dark[:, :900] = 0
    dark[480:, :] = 0
    dark = cv2.dilate(dark, np.ones((9, 9), np.uint8)).astype(np.float32)
    w = (1 - hole) * (1 - dark)

    def fill(sig):
        num = cv2.GaussianBlur(im * w[..., None], (0, 0), sig)
        den = cv2.GaussianBlur(w, (0, 0), sig)
        return num / np.maximum(den, 1e-5)[..., None], den

    res, _ = fill(70)
    for s in (35, 18, 9):
        f, d = fill(s)
        a = np.clip((d - 0.12) / 0.45, 0, 1)[..., None]
        res = a * f + (1 - a) * res
    res += np.random.default_rng(7).normal(0, 1.6, res.shape).astype(np.float32)  # 사진 결
    soft = cv2.GaussianBlur(cv2.dilate(hole, np.ones((17, 17), np.uint8)), (0, 0), 5)
    soft = np.maximum(soft, hole)[..., None]          # 상자 가장자리의 턱을 없앤다
    out = im * (1 - soft) + res * soft

    y0, y1, xa, xb = 252, 303, 934, 1028              # 가로대 왼쪽 끝
    patch = im[y0:y1, 2 * CROSS_X - xb:2 * CROSS_X - xa][:, ::-1]
    al = np.ones((y1 - y0, xb - xa), np.float32)
    for i in range(9):
        k = (i + 1) / 10
        al[i, :] *= k; al[-1 - i, :] *= k; al[:, i] *= k
    for i in range(3):                                 # 오른쪽 끝은 기둥 가장자리에 숨긴다
        al[:, -1 - i] *= (i + 1) / 4
    out[y0:y1, xa:xb] = al[..., None] * patch + (1 - al[..., None]) * out[y0:y1, xa:xb]

    out = np.clip(out, 0, 255).astype(np.uint8)[24:596, :]
    cv2.imwrite(OUT, out, [cv2.IMWRITE_JPEG_QUALITY, 95])
    print('  %s  %d×%d' % (OUT, out.shape[1], out.shape[0]))


if __name__ == '__main__':
    main()
