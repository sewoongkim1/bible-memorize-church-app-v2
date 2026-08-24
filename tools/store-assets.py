# -*- coding: utf-8 -*-
"""플레이스토어 등록 준비물을 만든다 — 아이콘·그래픽 이미지·스크린샷.

■ 왜 아이콘을 새로 만드나
  지금 icon-512.png 는 ① 배경이 투명하고 ② 여백이 없다. 둘 다 스토어에서 막힌다.
    · 플레이스토어 앱 아이콘은 투명(알파)을 허용하지 않는다
    · 안드로이드는 아이콘에 마스크(원형·둥근네모 등 기기마다 다름)를 씌우는데,
      지금처럼 교회 마크가 캔버스 끝까지 차 있으면 십자 팔 끝이 잘린다.
      maskable 규격은 '가운데 지름 80% 원 안'에 중요한 것이 다 들어와야 한다.
  그래서 두 벌을 만든다.
    icon-maskable-512/192.png  마크를 62%로 줄여 안전영역 안에. manifest가 쓴다
    store/icon-512-play.png    스토어 등록용. 불투명, 마크 76%

■ 그래픽 이미지(feature graphic)
  1024x500. 스토어 목록 맨 위에 걸리는 띠. 글자를 많이 넣으면 작은 화면에서
  뭉개지므로 앱 이름과 한 줄만 둔다.

■ 스크린샷
  guide/shots/*.png 를 그대로 쓰지 않는다 — 526px은 스토어에서 너무 작다.
  캡처를 2배(--force-device-scale-factor=2)로 다시 떠서 1052x1880 으로 만든다.
  (이 PC 헤드리스 크롬은 뷰포트가 526px로 고정이라 배율로 키우는 수밖에 없다.)

사용법:  python tools/store-assets.py
"""
import io, os, subprocess, sys
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "store")
CREAM = (253, 248, 240, 255)     # 앱의 크림빛 — 마크의 파랑·주황이 가장 잘 산다
NAVY = (26, 58, 107, 255)


def mark():
    return Image.open(os.path.join(ROOT, "icon-512.png")).convert("RGBA")


def icon(size, ratio, bg, path):
    """마크를 canvas의 ratio 비율로 가운데 놓고 불투명 배경 위에 얹는다."""
    im = Image.new("RGBA", (size, size), bg)
    m = mark()
    w = int(size * ratio)
    m = m.resize((w, w), Image.LANCZOS)
    im.alpha_composite(m, ((size - w) // 2, (size - w) // 2))
    im.convert("RGB").save(path, "PNG", optimize=True)   # RGB = 알파 제거
    return path


def safe_zone_check(path):
    """maskable 안전영역(지름 80% 원) 밖으로 내용이 나갔는지 본다."""
    im = Image.open(path).convert("RGB")
    s = im.size[0]
    bg = im.getpixel((2, 2))
    r = s * 0.4                                   # 지름 80% → 반지름 40%
    cx = cy = s / 2.0
    outside = 0
    px = im.load()
    for y in range(0, s, 2):
        for x in range(0, s, 2):
            if (x - cx) ** 2 + (y - cy) ** 2 <= r * r:
                continue
            c = px[x, y]
            if abs(c[0]-bg[0]) + abs(c[1]-bg[1]) + abs(c[2]-bg[2]) > 30:
                outside += 1
    return outside


def feature_graphic(path):
    """1024x500 띠. 왼쪽에 마크, 오른쪽에 이름 한 줄 — 작게 줄어도 읽히게."""
    W, H = 1024, 500
    im = Image.new("RGB", (W, H), (255, 253, 247))
    d = ImageDraw.Draw(im)
    for y in range(H):                            # 아주 옅은 세로 그러데이션
        t = y / H
        d.line([(0, y), (W, y)], fill=(
            int(255 - 6 * t), int(253 - 10 * t), int(247 - 20 * t)))
    d.rectangle([0, 0, W - 1, H - 1], outline=(168, 128, 31), width=5)
    m = mark().resize((250, 250), Image.LANCZOS)
    im.paste(m, (78, (H - 250) // 2), m)
    # 글자는 Pillow 기본 폰트가 한글을 못 그려 HTML로 따로 합성한다(아래 compose_feature).
    im.save(path, "PNG", optimize=True)
    return path


def chrome():
    return r"C:\Program Files\Google\Chrome\Application\chrome.exe"


def compose_feature(path):
    """그래픽 이미지 — 한글이 들어가므로 크롬으로 렌더한다(Pillow 기본 폰트는 한글 불가)."""
    html = """<!doctype html><meta charset="utf-8"><style>
    html,body{margin:0}
    .g{width:1024px;height:500px;position:relative;overflow:hidden;
       background:radial-gradient(600px 400px at 12%% 15%%,#fff8e6 0%%,rgba(255,248,230,0) 70%%),
                  radial-gradient(600px 400px at 88%% 90%%,#fdf1e0 0%%,rgba(253,241,224,0) 70%%),
                  #fffdf7;
       border:6px solid #a8801f;box-sizing:border-box;
       display:flex;align-items:center;gap:44px;padding:0 74px;
       font-family:'BM JUA','Malgun Gothic',sans-serif}
    .m{width:230px;height:230px;flex:0 0 auto}
    .t{color:#123059}
    .n{font-size:76px;line-height:1.15;letter-spacing:2px}
    .s{font-family:'Freesentation 7 Bold','Malgun Gothic',sans-serif;
       font-size:29px;color:#16305c;margin-top:16px;letter-spacing:.5px}
    </style>
    <div class="g">
      <img class="m" src="%s">
      <div class="t"><div class="n">성경말씀 암송</div>
      <div class="s">고척교회 · 말씀을 마음에 새기는 앱</div></div>
    </div>""" % ("icon-512.png")
    tmp = os.path.join(ROOT, "_fg.html")
    io.open(tmp, "w", encoding="utf-8", newline="").write(html)
    subprocess.run([chrome(), "--headless", "--disable-gpu", "--hide-scrollbars",
                    "--screenshot=" + path, "--window-size=1024,500",
                    "file:///" + tmp.replace("\\", "/")], capture_output=True)
    os.remove(tmp)
    return path


def main():
    os.makedirs(OUT, exist_ok=True)
    made = []

    # ── 아이콘 ──────────────────────────────────────────────
    p = icon(512, 0.62, CREAM, os.path.join(ROOT, "icon-maskable-512.png"))
    made.append(("icon-maskable-512.png", "안전영역 밖 픽셀 %d개" % safe_zone_check(p)))
    p = icon(192, 0.62, CREAM, os.path.join(ROOT, "icon-maskable-192.png"))
    made.append(("icon-maskable-192.png", "안전영역 밖 픽셀 %d개" % safe_zone_check(p)))
    icon(512, 0.76, CREAM, os.path.join(OUT, "icon-512-play.png"))
    made.append(("store/icon-512-play.png", "불투명 · 스토어 등록용"))
    # iOS는 apple-touch-icon의 투명한 곳을 검정으로 채운다 — 반드시 불투명으로 준다.
    # 그전엔 투명한 favicon.png를 쓰고 있어 아이폰 홈 아이콘이 검은 바탕으로 나왔다.
    icon(180, 0.76, CREAM, os.path.join(ROOT, "apple-touch-icon.png"))
    made.append(("apple-touch-icon.png", "불투명 · iOS 홈 화면"))

    # ── 그래픽 이미지 ───────────────────────────────────────
    compose_feature(os.path.join(OUT, "feature-1024x500.png"))
    made.append(("store/feature-1024x500.png", "1024x500"))

    for n, note in made:
        f = os.path.join(ROOT, n.replace("/", os.sep))
        sz = Image.open(f).size if os.path.exists(f) else ("?", "?")
        print("  %-32s %sx%s  %s" % (n, sz[0], sz[1], note))


main()
