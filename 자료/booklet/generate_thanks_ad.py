# -*- coding: utf-8 -*-
"""
추수감사 특새 소책자 광고 — A4 가로 한 장(2026-10-30 친구).

글자는 소책자 원고 thanks2026.json 을 그대로 쓴다(표지와 같은 말 · 같은 글꼴 · 같은 색):
  위   event — 「2026 추수감사 특별새벽기도회」
  가운데 title — 「감사의 새벽, 은혜를 셉니다」(두 줄로 나눔: 쉼표 뒤)
       subtitle — 「데살로니가전서 설교 요약 + 성경 필사」
  아래 「설교 」+ preacher(친구 「아래는 "설교 차동혁 위임목사"」)
  오른쪽 위 교회 마크 ci-h.png(친구)
  오른쪽 끝(맨 아래) team — 「제자양육부 신앙운동팀」(친구 · 소책자 뒷장 판 표기와 같은 자리)

배경은 친구가 준 사진(Pngtree 추수감사 배경 · 4368×2448 · 1.78:1). A4 가로(1.414:1)에 맞추려고
**오른쪽을 잘라** 왼쪽의 바구니를 다 살린다. 글자는 오른쪽 빛망울 위 — 그 자리는 밝고 얼룩져서
글자 뒤에만 크림색 빛(radial-gradient)을 옅게 깐다(네모 판 없이).
⚠️ 사진·만든 PDF·PNG 는 저장소에 올리지 않는다(사진은 Pngtree 것 · 산출물은 친구 폴더에만).

  python generate_thanks_ad.py            → ../2026추수감사절/감사의새벽_광고_A4가로.pdf · .png
"""
import html, io, json, os, subprocess, sys

from generate_thanks import find_chrome, chrome_url

HERE = os.path.dirname(os.path.abspath(__file__))
BG_NAME = '—Pngtree—happy thanksgiving background_15997619.jpg'
OUT_STEM = '감사의새벽_광고_A4가로'
PAGE_W, PAGE_H = 297, 210          # mm — A4 가로
PNG_DPI = 300


def esc(t):
    return html.escape(t or '')


def crop_bg(src, dst):
    """A4 가로 비율로 — 높이는 그대로, 오른쪽을 잘라 바구니(왼쪽 끝)를 살린다."""
    from PIL import Image
    im = Image.open(src).convert('RGB')
    w = round(im.height * PAGE_W / PAGE_H)
    if w > im.width:                       # 사진이 A4 보다 홀쭉하면 위아래를 똑같이 자른다
        h = round(im.width * PAGE_H / PAGE_W)
        top = (im.height - h) // 2
        im = im.crop((0, top, im.width, top + h))
    else:
        im = im.crop((0, 0, w, im.height))
    im.save(dst, quality=92)
    return im.size


def font_url(name):
    return chrome_url(os.path.join(HERE, 'fonts', name))


def build(b, bg_file, ci_file):
    title = b['title']
    t1, _, t2 = title.partition(', ')
    title_html = (esc(t1) + ',<br>' + esc(t2)) if t2 else esc(title)
    ci = ('<img class="ci" src="%s" alt="고척교회">' % chrome_url(ci_file)) if os.path.exists(ci_file) else ''
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
.glow { position:absolute; left:100mm; top:8mm; width:200mm; height:140mm;
        background:radial-gradient(ellipse 50%% 50%% at 50%% 50%%,
          rgba(255,250,240,.86) 0%%, rgba(255,248,236,.70) 45%%, rgba(255,246,232,.32) 72%%, rgba(255,246,232,0) 100%%); }
.ci { position:absolute; right:11mm; top:10mm; height:15mm; }
.box { position:absolute; left:112mm; right:12mm; top:33mm; text-align:center; word-break:keep-all; }
.ev { font-size:19pt; font-weight:700; color:#a0401f; letter-spacing:.14em; }
.t { font-size:50pt; font-weight:700; line-height:1.28; margin-top:6mm; }
.rule { width:26mm; height:.8mm; background:#b07d24; margin:8mm auto 0; }
.sub { font-size:21pt; font-weight:700; color:#5b4430; margin-top:7mm; }
.who { font-size:17pt; font-weight:700; color:#2b2522; margin-top:11mm; letter-spacing:.04em; }
.who span { color:#a0401f; margin-right:.5em; }
/* 맨 아래 오른쪽 — 나무 탁자 위라 밝다. 옅은 흰 번짐으로 결 무늬에서 떼어 낸다 */
.team { position:absolute; right:12mm; bottom:9mm; font-size:14pt; font-weight:700; color:#3a2e26;
        letter-spacing:.06em; text-shadow:0 0 2mm rgba(255,250,240,.95), 0 0 1mm rgba(255,250,240,.95); }
</style></head><body><div class="page">
<div class="glow"></div>
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
        pw=PAGE_W, ph=PAGE_H, bg=chrome_url(bg_file), ci=ci, ev=esc(b['event']), th=title_html,
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


def main():
    os.chdir(HERE)
    b = json.load(io.open('thanks2026.json', encoding='utf-8'))
    out_dir = os.path.normpath(os.path.join(HERE, b.get('out_dir', '../2026추수감사절')))
    src = os.path.join(out_dir, BG_NAME)
    if not os.path.exists(src):
        sys.exit('배경 사진이 없습니다: ' + src)
    bg = os.path.join(out_dir, '_ad_bg.jpg')
    page = os.path.join(out_dir, '_ad_thanks.html')
    size = crop_bg(src, bg)
    io.open(page, 'w', encoding='utf-8').write(build(b, bg, os.path.join(HERE, 'ci-h.png')))
    pdf = os.path.join(out_dir, OUT_STEM + '.pdf')
    png = os.path.join(out_dir, OUT_STEM + '.png')
    ok = to_pdf(page, pdf)
    if ok:
        to_png(pdf, png)
    for f in (bg, page):
        os.remove(f)
    print('배경 %d×%d (%d dpi 상당)' % (size[0], size[1], round(size[0] / (PAGE_W / 25.4))))
    print(('PDF  ' + pdf) if ok else 'PDF 실패')
    if ok and os.path.exists(png):
        print('PNG  ' + png)


if __name__ == '__main__':
    main()
