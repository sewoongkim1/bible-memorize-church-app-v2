# -*- coding: utf-8 -*-
"""가정 축복 기도문 「크게 보기」 액자에 쓸 수채화 잎가지를 앱용으로 줄인다.

원본은 말씀카드(C:\\Projects\\말씀카드_B7\\소재)의 leafT1~6.png — 한 장이 400~800KB 다.
그대로 쓰면 첫 글꼴 765KB 사건과 같은 길이라, 여기서 **투명 여백을 잘라 내고**
높이 600px WebP 로 줄인다(한 장 15~30KB). 액자 하나가 잎가지 한 장만 쓰므로
「크게 보기」를 한 번 열 때 받는 것은 그 한 장뿐이다.

    python tools/frame-art.py

⚠️ 원본 폴더가 없으면 아무것도 하지 않는다(다른 사람 컴퓨터에서 돌려도 안전하게).

── leaf7~12 (2026-09-10, 시편 말씀 액자) ──────────────────────────
액자를 6종에서 12종으로 늘리며 **꽃 셋·열매 셋**을 AI 로 새로 그렸다.
말씀카드 원본과 달리 이것들은 **배경이 투명이 아니라 옅은 회색·크림 사각형**이라
그대로 넣으면 액자 위에 네모가 뜬다. 그래서 `--from` 경로가 주어지면
**종이색을 알파로 빼는 단계(color-to-alpha)** 를 한 번 더 거친다.

    python tools/frame-art.py --from <새 PNG 폴더>    # 7.png..12.png → leaf7..12.webp

⚠️ 종이색은 **네 귀퉁이의 중앙값**으로 잡는다. 한 점만 보면 그 점에 잎이 걸렸을 때
   통째로 어긋난다.
⚠️ 알파를 씌운 뒤 **색을 되돌린다**(unpremultiply). 안 하면 반투명한 가장자리가
   종이색과 섞여 **뿌옇게 뜬 테두리**가 남는다 — 크림 바탕에 얹으면 그게 그대로 보인다.
⚠️ 새 원본 PNG(장당 3~6MB)는 **저장소에 넣지 않는다.** 결과 webp 만 커밋한다
   (말씀 연상 그림과 같은 규칙). 프롬프트는 img/frame/prompts.md 에 남긴다.
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


# ── 종이색 빼기(color-to-alpha) ───────────────────────────────────────
# ⚠️ 처음엔 「네 귀퉁이 색과의 거리」로 잡았다가 실패했다 — 새 그림들의 배경이
#    균일한 종이색이 아니라 **옅은 그라데이션**이라, 90%가 반투명으로 남았다.
#    (실측 2026-09-10: leaf9~12 의 알파 16~199 구간이 각각 88~91%)
#    그래서 **밝기와 채도** 두 가지로 잡는다 — 종이는 밝고 무채색, 물감은
#    어둡거나 색이 있다. 둘 중 큰 값을 알파로 쓴다.
# ⚠️ **불감대(dead zone)가 없으면 종이가 통째로 반투명이 된다.**
#    종이는 한 색이 아니다 — 실측(2026-09-10, 원본 10.png)에서 배경 밝기가
#    238~249 로 11 단계 흔들렸고, 그 흔들림이 그대로 알파 67 짜리 안개가 됐다.
#    그래서 「종이보다 LUM_DEAD 이상 어두울 때부터」 세기 시작한다.
LUM_DEAD = 16    # 종이 밝기의 흔들림 폭(실측 11)보다 넉넉히
LUM_T = 38       # 그 위로 이만큼 더 어두우면 완전히 불투명
SAT_DEAD = 10    # 종이의 미세한 색기울음(실측 2~5)보다 넉넉히
SAT_T = 20       # 그 위로 이만큼 색이 있으면 불투명 — 밝은 밀이삭·연분홍 꽃잎용
NOISE_A = 12     # 이보다 옅은 알파는 0 으로 — 잡티가 남으면 잘라내기가 안 먹고
                 # 파일도 두세 배가 된다(실측: 잘라내기 실패 시 63~80KB vs 정상 13~33KB).


def paper_lum(im):
    """종이 밝기 = 밝은 쪽 2% 지점. 최댓값을 쓰면 튄 점 하나에 끌려간다."""
    g = im.convert("L")
    hist = g.histogram()
    n = sum(hist)
    acc = 0
    for v in range(255, -1, -1):
        acc += hist[v]
        if acc >= n * 0.02:
            return v
    return 255


def paper_sat(im, lp):
    """⚠️ **종이가 늘 무채색인 것은 아니다.** leaf9(은방울꽃)의 배경은 따뜻한 크림이라
    채도가 배경 전체에서 높게 나왔고, 고정 기준(SAT_DEAD)으로는 그림 전체가
    반투명으로 남았다(2026-09-10: 403x600·123KB — 잘라내기 실패). 그래서
    **종이 밝기에 해당하는 화소들의 채도**를 그림마다 재서 기준으로 쓴다."""
    px = im.load()
    w, h = im.size
    step = max(1, min(w, h) // 120)          # 전수 조사는 필요 없다
    sats = []
    for y in range(0, h, step):
        for x in range(0, w, step):
            r, g, b = px[x, y]
            if (r * 299 + g * 587 + b * 114) // 1000 >= lp - LUM_DEAD:
                sats.append(max(r, g, b) - min(r, g, b))
    if not sats:
        return 0
    sats.sort()
    return sats[int(len(sats) * 0.9)]        # 종이 채도의 위쪽 10% 지점


def color_to_alpha(im):
    """종이를 투명으로 빼고 **색을 되돌린다**(unpremultiply).
    되돌리지 않으면 반투명한 가장자리가 종이색과 섞여 뿌연 테두리가 남는다 —
    크림 바탕에 얹으면 그게 그대로 보인다."""
    im = im.convert("RGB")
    lp = paper_lum(im)
    sd = max(SAT_DEAD, paper_sat(im, lp) + 6)   # 종이가 크림빛이면 기준이 함께 올라간다
    src = im.load()
    out = Image.new("RGBA", im.size)
    dst = out.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b = src[x, y]
            lum = (r * 299 + g * 587 + b * 114) // 1000
            a1 = (lp - lum - LUM_DEAD) / float(LUM_T)                  # 종이보다 어두운 만큼
            a2 = (max(r, g, b) - min(r, g, b) - sd) / float(SAT_T)   # 색이 있는 만큼
            a = int(round(255.0 * max(0.0, min(1.0, max(a1, a2)))))
            if a <= NOISE_A:
                dst[x, y] = (0, 0, 0, 0)
                continue
            # 종이(밝은 무채색) 위에 얹힌 것으로 보고 원래 색을 되돌린다
            f = 255.0 / a
            dst[x, y] = (
                max(0, min(255, int(round(lp + (r - lp) * f)))),
                max(0, min(255, int(round(lp + (g - lp) * f)))),
                max(0, min(255, int(round(lp + (b - lp) * f)))),
                a,
            )
    return out


def shrink(im, dst_path, label):
    """투명 여백을 잘라 내고 높이 H 로 줄여 WebP 로 쓴다."""
    box = im.getbbox()
    if box:
        im = im.crop(box)
    w = max(1, int(round(im.width * H / float(im.height))))
    im = im.resize((w, H), Image.LANCZOS)
    im.save(dst_path, "WEBP", quality=Q, alpha_quality=AQ, method=6)
    kb = os.path.getsize(dst_path) / 1024.0
    print("   %s   %dx%d   %.0fKB" % (label, im.width, H, kb))
    return kb


def from_new(src_dir):
    """새로 그린 PNG(배경이 흰색·회색) → leaf7..12.webp"""
    if not os.path.isdir(src_dir):
        raise SystemExit("!! 폴더가 없다: %s" % src_dir)
    if not os.path.isdir(OUT):
        os.makedirs(OUT)
    total = 0
    for i in range(7, 13):
        src = os.path.join(src_dir, "%d.png" % i)
        if not os.path.exists(src):
            print("   [건너뜀] %s" % src)
            continue
        im = color_to_alpha(Image.open(src))
        total += shrink(im, os.path.join(OUT, "leaf%d.webp" % i), "leaf%d.webp" % i)
    print("   합계 %.0fKB" % total)


def main():
    if "--from" in sys.argv:
        return from_new(sys.argv[sys.argv.index("--from") + 1])
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
