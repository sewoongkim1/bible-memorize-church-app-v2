# -*- coding: utf-8 -*-
"""암송 화면을 '움직이는 그림'으로 만든다 (게시판·안내용 애니메이션 WebP).

    python tools/demo-anim.py                       # 기본값(살전 5:16-18 · 2단계)
    python tools/demo-anim.py 8 2 out/card.webp     # 구절번호 단계 저장경로

카드를 하나씩 눌러 빈칸이 채워지는 과정을 프레임으로 뽑아 이어 붙인다.
실제 앱 화면을 그대로 쓰므로, 화면이 바뀌면 다시 뽑아야 한다.

■ 왜 동영상이 아니라 WebP인가
  게시판은 이미지만 받는다(통이 image/jpeg·png·webp만 허용).
  애니메이션 WebP는 그 안에 들어가면서 폰에서 동영상처럼 재생된다.
  게시판에 올릴 때는 브라우저를 거치지 말고 boardUpload 액션으로 바로 올린다 —
  앱의 사진 고르기는 캔버스로 다시 그려서(EXIF 제거) 움직임이 사라진다.

■ 두 번 막혔던 곳 — 반드시 지킬 것
  ① 캡처 JS에 «+» 와 «<» 를 쓰지 않는다.
     capture-guide-shots.py는 `?go=`를 URLSearchParams로 한 번,
     decodeURIComponent로 또 한 번 해독한다. 그래서 «+»가 공백으로 풀려
     `i++` 가 `i  ` 가 되고, 문법 오류로 준비 신호가 안 와 캡처가 그대로 멈춘다.
     → for 문 대신 forEach·some 으로 돈다.
  ② 카드 순서를 Math.random 으로 고정한다.
     카드 쟁반은 Math.random 으로 섞이므로, 프레임마다 자리가 바뀌어
     이어 붙이면 카드가 튀어 어지럽다.
  ③ 카드를 '진짜로 클릭'하지 않는다.
     클릭하면 완료 처리(saveProgress·완료 창)가 돌면서 크롬이 멈춘다.
     값·클래스만 칠해 '채워진 모습'을 만든다.

■ 안전
  capture-guide-shots.py가 통신을 전부 가로채므로 운영 DB에 아무것도 남지 않는다.
  화면에 쓰는 이름도 실제 성도가 아닌 '홍길동'이다.
"""
import io, os, subprocess, sys, glob, shutil, tempfile
from PIL import Image, ImageChops

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CAP = os.path.join(ROOT, "tools", "capture-guide-shots.py")

VERSE = int(sys.argv[1]) if len(sys.argv) > 1 else 21      # 살전 5:16-18 (낱말 7개)
STAGE = int(sys.argv[2]) if len(sys.argv) > 2 else 2       # 2단계 = 빈칸 65%
OUT = sys.argv[3] if len(sys.argv) > 3 else os.path.join(ROOT, "marketing", "demo", "card-mode.webp")
MAX_FRAMES = 14

# «+» 와 «<» 가 없어야 한다(위 ① 참고). forEach·some 으로만 돈다.
FILL = ("(function(n){var inputs=[].slice.call(document.querySelectorAll('.word-input'));"
        "var btns=[].slice.call(document.querySelectorAll('.wcard'));"
        "inputs.slice(0,n).forEach(function(inp){var a=inp.dataset.answer;"
        "inp.value=a;inp.classList.add('correct');inp.disabled=true;"
        "btns.some(function(b){if(!b.disabled&&b.textContent===a){b.disabled=true;"
        "b.classList.add('used');return true;}return false;});});})(%d)")
BASE = ("Math.random=function(){return 0.5}; setCardMode(true); "
        "renderTestScreen(verses.find(function(v){return v.no===%d}), %d); ")


def main():
    work = tempfile.mkdtemp(prefix="demoanim-")
    try:
        src = io.open(CAP, encoding="utf-8").read()
        head = src.index("STEPS = [")
        old = src[head:src.index("]\n", head) + 2]
        base = BASE % (VERSE, STAGE)
        steps = "".join('    ("f%02d", "%s%s"),\n' % (n, base, FILL % n)
                        for n in range(0, MAX_FRAMES))
        cap = os.path.join(work, "cap.py")
        io.open(cap, "w", encoding="utf-8", newline="").write(
            src.replace(old, "STEPS = [\n" + steps + "]\n"))

        env = dict(os.environ, SHOT_OUT=work)
        subprocess.run([sys.executable, cap], env=env, capture_output=True)

        frames, prev = [], None
        for f in sorted(glob.glob(os.path.join(work, "f*.png"))):
            im = Image.open(f).convert("RGB")
            if prev is not None and not ImageChops.difference(im, prev).getbbox():
                break                      # 더 채울 빈칸이 없다 — 여기서 끝
            frames.append(im); prev = im
        if len(frames) < 2:
            print("프레임을 못 뽑았습니다. 위 ①(+·< 금지)을 다시 보세요."); return

        # 처음은 조금 길게(무슨 화면인지 보게), 끝은 더 길게(완성된 말씀을 읽게)
        dur = [1400] + [750] * (len(frames) - 2) + [2400]
        os.makedirs(os.path.dirname(OUT), exist_ok=True)
        frames[0].save(OUT, "WEBP", save_all=True, append_images=frames[1:],
                       duration=dur, loop=0, quality=78, method=6)
        print("만들었습니다: %s" % OUT)
        print("  %d장 · %.1f초 · %.0f KB · %s"
              % (len(frames), sum(dur) / 1000, os.path.getsize(OUT) / 1024, frames[0].size))
    finally:
        shutil.rmtree(work, ignore_errors=True)
        for junk in ("_cap.html",):
            p = os.path.join(ROOT, junk)
            if os.path.exists(p):
                os.remove(p)


main()
