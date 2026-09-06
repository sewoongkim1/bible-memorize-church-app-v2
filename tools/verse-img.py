# -*- coding: utf-8 -*-
"""말씀 연상 그림 원본(PNG)을 앱에 넣을 크기로 줄인다.

    python tools/verse-img.py <원본 폴더>            → img/verse/ 에 넣는다
    python tools/verse-img.py <원본 폴더> --dry      → 무엇이 될지만 보여 준다

만드는 법은 `img/verse/암송말씀_그림_만들기.md` 를 보세요.

⚠️ 원본 PNG 는 장당 8MB 다 — **저장소에 넣지 않는다.** 긴 변 1080px WebP(품질 78)
   로 줄이면 장당 60~120KB 가 된다. 앱은 그림을 **탭했을 때만** 받으므로 이 크기가
   곧 「그림이 뜨는 데 걸리는 시간」이다.

⚠️ 이름은 원본을 그대로 따라간다 — `12.png` → `12.webp`, `12b.png` → `12b.webp`.
   `<번호>` · `<번호>b` · `<번호>c` 셋만 쓴다(대표 · 짝 넓은 장면 · 짝 클로즈업).
"""
import io
import os
import re
import sys

try:
    from PIL import Image
except ImportError:
    raise SystemExit('!! Pillow 가 없습니다:  pip install pillow')

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(HERE, 'img', 'verse')
LONG = 1080     # 긴 변 (실측으로 정한 값 — 더 키워도 화면에서 차이가 안 보인다)
Q = 78          # WebP 품질
NAME = re.compile(r'^(\d+)([bc]?)$')      # 12 · 12b · 12c 만 받는다


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    src = sys.argv[1]
    dry = '--dry' in sys.argv
    if not os.path.isdir(src):
        raise SystemExit('!! 폴더가 없습니다: %s' % src)
    if not os.path.isdir(OUT):
        os.makedirs(OUT)

    files = sorted(f for f in os.listdir(src)
                   if f.lower().endswith(('.png', '.jpg', '.jpeg', '.webp')))
    if not files:
        raise SystemExit('!! 그림 파일이 없습니다: %s' % src)

    done = skip = 0
    total_kb = 0.0
    for f in files:
        stem = os.path.splitext(f)[0]
        m = NAME.match(stem)
        if not m:
            print('   [건너뜀] %-16s 이름이 <번호>·<번호>b·<번호>c 가 아닙니다' % f)
            skip += 1
            continue
        im = Image.open(os.path.join(src, f)).convert('RGB')
        w, h = im.size
        if max(w, h) > LONG:
            if w >= h:
                nw, nh = LONG, max(1, int(round(h * LONG / float(w))))
            else:
                nh, nw = LONG, max(1, int(round(w * LONG / float(h))))
            im = im.resize((nw, nh), Image.LANCZOS)
        dst = os.path.join(OUT, stem + '.webp')
        if dry:
            print('   %-16s → %s   %dx%d' % (f, os.path.basename(dst), im.width, im.height))
            done += 1
            continue
        im.save(dst, 'WEBP', quality=Q, method=6)
        kb = os.path.getsize(dst) / 1024.0
        total_kb += kb
        print('   %-16s → %-12s %4dx%-4d %5.0fKB' % (f, os.path.basename(dst), im.width, im.height, kb))
        done += 1

    print('')
    print('   %d장 %s%s' % (done, '(미리보기)' if dry else '넣었습니다',
                            '' if not total_kb else ' · 합계 %.0fKB' % total_kb))
    if skip:
        print('   %d장은 이름 때문에 건너뛰었습니다.' % skip)
    if not dry and done:
        print('')
        print('   다음에 할 것:')
        print('     1) 한 장씩 열어 **사람 눈으로** 보기 — 글자·사람·액자화·그림도구')
        print('     2) app.js 의 VERSE_IMG 에 한 줄 더하기(그 값이 alt 텍스트입니다)')
        print('     3) img/verse/prompts.md 에 쓴 심상 문장 남기기')
        print('     4) python tools/bump.py → 커밋 → 푸시')


if __name__ == '__main__':
    if sys.platform == 'win32':
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    main()
