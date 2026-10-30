# -*- coding: utf-8 -*-
"""
추수감사 특새 소책자 광고 — A4 가로 한 장(2026-10-30 친구). 배경 사진마다 한 판씩.

글자는 소책자 원고 thanks2026.json 을 그대로 쓴다(표지와 같은 말 · 같은 글꼴 · 같은 색):
  위   event — 「2026 추수감사 특별새벽기도회」
  가운데 title — 「감사의 새벽, 은혜를 셉니다」(두 줄로 나눔: 쉼표 뒤)
       subtitle — 「데살로니가전서 설교 요약 + 성경 필사」
  아래 「설교 」+ preacher(친구 「아래는 "설교 차동혁 위임목사"」)
  오른쪽 위 교회 마크 ci-h.png(친구)
  오른쪽 끝(맨 아래) team — 「제자양육부 신앙운동팀」(친구 · 소책자 뒷장 판 표기와 같은 자리)

판(VARIANTS) — 사진의 빈 자리에 맞춰 글 칸·빛 자리만 다르다:
  a  Pngtree 추수감사 배경(4368×2448 · 1.78:1) — **오른쪽을 잘라** 왼쪽 바구니를 다 살리고, 글은 오른쪽 빛망울 위.
  b  Background 3.png(1024×768 · 4:3 · 10/30 친구) — 가운데 해 · 양쪽 아래 호박의 대칭 구도라 글은 가운데.
     위아래를 조금 자르고, 작은 그림이라(A4 에 88dpi) 부드럽게 키워 넣는다 — 인쇄하면 조금 흐릴 수 있다.
글자 뒤에는 크림색 빛(radial-gradient)을 옅게 깐다(빛망울이 얼룩져 글자가 묻히지 않게 · 네모 판 없이).
⚠️ 사진·만든 PDF·PNG 는 저장소에 올리지 않는다(사진은 받은 것 · 산출물은 친구 폴더에만).

  python generate_thanks_ad.py        → 모든 판
  python generate_thanks_ad.py b      → b 판만
  산출물: ../2026추수감사절/감사의새벽_광고_A4가로[_N].pdf · .png(300dpi)
"""
import html, io, json, os, subprocess, sys

from generate_thanks import find_chrome, chrome_url

HERE = os.path.dirname(os.path.abspath(__file__))
PAGE_W, PAGE_H = 297, 210          # mm — A4 가로
PNG_DPI = 300
MIN_BG_W = 2400                    # 이보다 작은 사진은 300dpi 폭으로 부드럽게 키운다(프린터의 거친 확대 대신)

# anchor: 'left' = 오른쪽을 자른다(왼쪽을 살림) · 'center' = 양쪽(또는 위아래)을 똑같이
# box: 글 칸의 왼쪽·오른쪽 끝(mm) · glow: 빛의 왼쪽·위·너비·높이(mm)
# halos: 교회 마크·팀 이름이 무늬 위에 앉을 때 그 뒤에 까는 작은 빛(왼쪽·위·너비·높이 mm) — b 는 둘 다 단풍 위다
VARIANTS = {
    'a': dict(bg='—Pngtree—happy thanksgiving background_15997619.jpg', out='감사의새벽_광고_A4가로',
              anchor='left', box=(112, 12), glow=(100, 8, 200, 140)),
    'b': dict(bg='Background 3.png', out='감사의새벽_광고_A4가로_2',
              anchor='center', box=(40, 40), glow=(38.5, 6, 220, 145),
              halos=[(222, -2, 86, 40), (208, 182, 100, 32)]),
}


def esc(t):
    return html.escape(t or '')


def crop_bg(src, dst, anchor):
    """A4 가로 비율로 자른다. 사진이 A4 보다 넓으면 옆을(anchor 쪽을 살려), 높으면 위아래를 똑같이."""
    from PIL import Image
    im = Image.open(src).convert('RGB')
    w = round(im.height * PAGE_W / PAGE_H)
    if w > im.width:
        h = round(im.width * PAGE_H / PAGE_W)
        top = (im.height - h) // 2
        im = im.crop((0, top, im.width, top + h))
    else:
        left = 0 if anchor == 'left' else (im.width - w) // 2
        im = im.crop((left, 0, left + w, im.height))
    src_size = im.size
    if im.width < MIN_BG_W:
        tw = round(PAGE_W / 25.4 * PNG_DPI)
        im = im.resize((tw, round(tw * im.height / im.width)), Image.LANCZOS)
    im.save(dst, quality=92)
    return src_size


def font_url(name):
    return chrome_url(os.path.join(HERE, 'fonts', name))


def build(b, v, bg_file, ci_file):
    title = b['title']
    t1, _, t2 = title.partition(', ')
    title_html = (esc(t1) + ',<br>' + esc(t2)) if t2 else esc(title)
    ci = ('<img class="ci" src="%s" alt="고척교회">' % chrome_url(ci_file)) if os.path.exists(ci_file) else ''
    gx, gy, gw, gh = v['glow']
    halos = ''.join('<div class="halo" style="left:%smm;top:%smm;width:%smm;height:%smm"></div>' % h
                    for h in v.get('halos', []))
    return """<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><title>%(title)s</title>
<style>
@font-face { font-family:'AdKR'; src:url('%(f400)s') format('woff'); font-weight:400; }
@font-face { font-family:'AdKR'; src:url('%(f700)s') format('woff'); font-weight:700; }
@page { size:%(pw)smm %(ph)smm; margin:0; }
* { margin:0; padding:0; box-sizing:border-box; }
html, body { width:%(pw)smm; height:%(ph)smm; }
body { font-family:'AdKR', serif; color:#2b2522; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.page { position:relative; width:%(pw)smm; height:%(ph)smm; overflow:hidden;
        background:url('%(bg)s') center / cover no-repeat; }
/* 글자 뒤 크림색 빛 — 빛망울이 얼룩져 글자가 묻히지 않게(네모 판 없이 가장자리는 사진으로 번진다) */
.glow { position:absolute; left:%(gx)smm; top:%(gy)smm; width:%(gw)smm; height:%(gh)smm;
        background:radial-gradient(ellipse 50%% 50%% at 50%% 50%%,
          rgba(255,250,240,.86) 0%%, rgba(255,248,236,.70) 45%%, rgba(255,246,232,.32) 72%%, rgba(255,246,232,0) 100%%); }
.halo { position:absolute; background:radial-gradient(ellipse 50%% 50%% at 50%% 50%%,
          rgba(255,250,240,.88) 0%%, rgba(255,248,236,.62) 50%%, rgba(255,246,232,0) 100%%); }
.ci { position:absolute; right:11mm; top:10mm; height:15mm; }
.box { position:absolute; left:%(bl)smm; right:%(br)smm; top:33mm; text-align:center; word-break:keep-all; }
.ev { font-size:19pt; font-weight:700; color:#a0401f; letter-spacing:.14em; }
.t { font-size:50pt; font-weight:700; line-height:1.28; margin-top:6mm; }
.rule { width:26mm; height:.8mm; background:#b07d24; margin:8mm auto 0; }
.sub { font-size:21pt; font-weight:700; color:#5b4430; margin-top:7mm; }
.who { font-size:17pt; font-weight:700; color:#2b2522; margin-top:11mm; letter-spacing:.04em; }
.who span { color:#a0401f; margin-right:.5em; }
/* 맨 아래 오른쪽 — 사진 위라 옅은 흰 번짐으로 무늬에서 떼어 낸다 */
.team { position:absolute; right:12mm; bottom:9mm; font-size:14pt; font-weight:700; color:#3a2e26;
        letter-spacing:.06em; text-shadow:0 0 2mm rgba(255,250,240,.95), 0 0 1mm rgba(255,250,240,.95); }
</style></head><body><div class="page">
<div class="glow"></div>
%(halos)s
%(ci)s
<div class="team">%(team)s</div>
<div class="box">
  <div class="ev">%(ev)s</div>
  <div class="t">%(th)s</div>
  <div class="rule"></div>
  <div class="sub">%(sub)s</div>
  <div class="who"><span>설교</span>%(who)s</div>
</div>
</div></body></html>""" % dict(
        title=esc(title), f400=font_url('NotoSerifKR-400.woff'), f700=font_url('NotoSerifKR-700.woff'),
        pw=PAGE_W, ph=PAGE_H, bg=chrome_url(bg_file), ci=ci, halos=halos, gx=gx, gy=gy, gw=gw, gh=gh,
        bl=v['box'][0], br=v['box'][1], ev=esc(b['event']), th=title_html,
        sub=esc(b['subtitle']), who=esc(b['preacher']), team=esc(b['team']))


def to_pdf(html_path, pdf_path):
    chrome = find_chrome()
    if not chrome:
        print('   !! 크롬을 못 찾아 PDF 는 건너뜁니다 — HTML 을 열어 직접 인쇄하세요.')
        return False
    tmp = pdf_path + '.new.pdf'              # 뷰어가 옛 PDF 를 잡고 있으면 크롬은 조용히 실패한다 — 새 이름으로 뽑아 갈아 끼운다
    if os.path.exists(tmp):
        os.remove(tmp)
    subprocess.run([chrome, '--headless', '--disable-gpu', '--no-pdf-header-footer',
                    '--print-to-pdf=' + os.path.abspath(tmp),
                    '--virtual-time-budget=30000', chrome_url(html_path)], capture_output=True)
    if not os.path.exists(tmp):
        return False
    try:
        os.replace(tmp, pdf_path)
    except PermissionError:
        print('   !! %s 가 열려 있어 바꾸지 못했습니다 — 닫고 다시 돌리세요(새 판은 %s).' % (pdf_path, tmp))
        return False
    return True


def to_png(pdf_path, png_path):
    try:
        import pymupdf
    except ImportError:
        print('   (PyMuPDF 가 없어 PNG 는 건너뜁니다)')
        return False
    doc = pymupdf.open(pdf_path)
    doc[0].get_pixmap(dpi=PNG_DPI).save(png_path)
    n = doc.page_count
    doc.close()
    if n != 1:
        print('   !! 쪽수가 %d — 한 장이어야 합니다.' % n)
    return True


def make(b, out_dir, key):
    v = VARIANTS[key]
    src = os.path.join(out_dir, v['bg'])
    if not os.path.exists(src):
        print('[%s] 배경 사진이 없습니다: %s' % (key, src))
        return
    bg = os.path.join(out_dir, '_ad_bg_%s.jpg' % key)
    page = os.path.join(out_dir, '_ad_thanks_%s.html' % key)
    size = crop_bg(src, bg, v['anchor'])
    io.open(page, 'w', encoding='utf-8').write(build(b, v, bg, os.path.join(HERE, 'ci-h.png')))
    pdf = os.path.join(out_dir, v['out'] + '.pdf')
    png = os.path.join(out_dir, v['out'] + '.png')
    ok = to_pdf(page, pdf)
    if ok:
        to_png(pdf, png)
    for f in (bg, page):
        os.remove(f)
    dpi = round(size[0] / (PAGE_W / 25.4))
    print('[%s] 배경 %d×%d (A4 에 %d dpi%s)' % (key, size[0], size[1], dpi, ' — 키워 넣음 · 인쇄하면 조금 흐릴 수 있음' if dpi < 200 else ''))
    print(('     PDF  ' + pdf) if ok else '     PDF 실패')
    if ok and os.path.exists(png):
        print('     PNG  ' + png)


def main():
    os.chdir(HERE)
    b = json.load(io.open('thanks2026.json', encoding='utf-8'))
    out_dir = os.path.normpath(os.path.join(HERE, b.get('out_dir', '../2026추수감사절')))
    keys = sys.argv[1:] or list(VARIANTS)
    for k in keys:
        if k not in VARIANTS:
            sys.exit('모르는 판: %s (있는 판: %s)' % (k, ', '.join(VARIANTS)))
        make(b, out_dir, k)


if __name__ == '__main__':
    main()
