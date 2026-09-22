# -*- coding: utf-8 -*-
"""최종 HTML을 헤드리스 크롬으로 열어 다섯 가지를 확인한다.

① 원문 열·필사 열의 내용이 칸(164mm) 밖으로 넘치지 않았는가 — scrollHeight 로 잰다.
   ⚠️ getBoundingClientRect().bottom 으로 재면 안 된다 — 열은 flex 로 늘 칸 높이와 같고
      넘친 내용은 overflow:hidden 에 잘려, 넘쳐도 「통과」로 나온다.
② 원문 문단(<p>)마다 실제 줄 수 = 옆 필사줄(.vs-write 안 .ln) 개수인가
   (줄 수는 높이 ÷ 줄 높이 — generate.py 와 같은 방법)
③ 그 문단과 필사줄 묶음이 같은 높이에서 시작하는가(원문 한 줄 = 필사줄 한 줄)
④ 인쇄하면 쪽 수가 .page 개수와 같고, 쪽마다 A4 가로(297×210mm)인가
⑤ 머리글(.hd)이 제 칸(HEADER_MM)을 넘치지 않았는가 · 바닥글(.ft)의 세 칸(왼쪽·가운데·오른쪽)이
   글이 길어 가로로 잘리지 않았는가(scrollWidth) · 글씨가 커져 세로로 칸 아래로 빠져나가지
   않았는가(span bottom vs .ft bottom) — 2026-09-22 성도님 요청으로 HEADER_PT·FOOTER_PT·
   바닥글 글을 사람이 정하게 되어, 잘못 정하면 조용히 잘리거나 밀려날 수 있다.
   ⚠️ 머리글은 `.hd`의 scrollHeight로 재면 안 된다 — align-items:flex-end라 넘친 내용이
      위쪽으로 자라는데, scrollHeight는 스크롤 원점(위쪽) 기준 아래쪽 넘침만 잡는다(실측
      확인: HEADER_PT를 60까지 올려도 scrollHeight==clientHeight로 그대로였다). 그래서
      자식 span의 getBoundingClientRect().height를 칸 높이(clientHeight)와 직접 견준다.
"""
import io
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from generate import find_chrome, _beside, _chrome

A4_LANDSCAPE_PT = (841.89, 595.28)

LAYOUT_PROBE = """<script>
document.fonts.ready.then(function(){
  var out = [];
  document.fonts.forEach(function(f){ if (f.status !== 'loaded') out.push('FONT_NOT_LOADED:' + f.family); });
  function lines(el){
    return Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight));
  }
  document.querySelectorAll('.page').forEach(function(pg, i){
    var no = i + 1;
    var orig = pg.querySelector('.orig-col');
    var write = pg.querySelector('.write-col');
    if (orig.scrollHeight > orig.clientHeight + 1) out.push(no + ':ORIG_OVERFLOW');
    if (write.scrollHeight > write.clientHeight + 1) out.push(no + ':WRITE_OVERFLOW');
    var hd = pg.querySelector('.hd');
    if (hd) {
      // .hd 는 align-items:flex-end 라 넘친 내용이 위쪽으로 자란다 — scrollHeight 는
      // 아래쪽 넘침만 잡아서(스크롤 원점 기준) 이 방향은 못 본다(2026-09-22 실측 확인).
      // 그래서 자식(span)의 실제 렌더 높이를 칸 높이와 직접 견준다.
      var hdMax = 0;
      hd.querySelectorAll(':scope > span').forEach(function(sp){
        hdMax = Math.max(hdMax, sp.getBoundingClientRect().height);
      });
      if (hdMax > hd.clientHeight + 1) out.push(no + ':HEADER_OVERFLOW');
    }
    var ft = pg.querySelector('.ft');
    if (ft) {
      // 가로(scrollWidth)뿐 아니라 세로도 본다 — .ft는 grid+align-items:center라
      // FOOTER_PT를 올리면 칸(8mm)보다 글줄이 커져 아래로 빠져나가는데(잘리지 않고
      // 밀려난다) 가로만 보면 조용히 통과한다(2026-09-22 최종 검토 Important 1 —
      // 실측 FOOTER_PT=18에서 세 칸 모두 .ft 아래로 2.9px 빠져나감을 확인).
      var ftBottom = ft.getBoundingClientRect().bottom;
      ft.querySelectorAll(':scope > span').forEach(function(sp){
        var overflowW = sp.scrollWidth > sp.clientWidth + 1;
        var overflowH = sp.getBoundingClientRect().bottom > ftBottom + 1;
        if (overflowW || overflowH) {
          out.push(no + ':FOOTER_OVERFLOW:' + sp.className.split(' ')[0]);
        }
      });
    }
    var ps = orig.querySelectorAll('p');
    var groups = write.querySelectorAll('.vs-write');
    if (ps.length !== groups.length) {
      out.push(no + ':GROUP_COUNT_MISMATCH:' + ps.length + '!=' + groups.length);
      return;
    }
    var o0 = orig.getBoundingClientRect().top;
    var w0 = write.getBoundingClientRect().top;
    ps.forEach(function(p, k){
      var n = lines(p);
      var lns = groups[k].querySelectorAll('.ln').length;
      if (n !== lns) out.push(no + ':LINE_MISMATCH:' + k + ':' + n + '!=' + lns);
      var dy = (p.getBoundingClientRect().top - o0) - (groups[k].getBoundingClientRect().top - w0);
      if (Math.abs(dy) > 0.5) out.push(no + ':ALIGN_MISMATCH:' + k + ':' + dy.toFixed(1) + 'px');
    });
  });
  document.title = 'CHECK|' + out.join(';');
});
</script>"""


# 헤드리스 크롬 호출(_chrome)·임시 파일 자리(_beside)는 generate.py 것을 그대로 쓴다
# (2026-09-22 최종 검토 Minor — 두 곳에 따로 있으면 timeout 등을 한쪽만 고치기 쉽다).


def check_layout(html_path, chrome):
    with io.open(html_path, encoding='utf-8') as f:
        html = f.read()
    tmp = _beside(html_path, '_verify.html')
    with io.open(tmp, 'w', encoding='utf-8') as f:
        f.write(html.replace('</body>', LAYOUT_PROBE + '</body>'))
    try:
        r = _chrome(chrome, ['--dump-dom', '--virtual-time-budget=20000'], tmp)
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)
    m = re.search(r'<title>CHECK\|([^<]*)</title>', r.stdout.decode('utf-8', 'replace'))
    if not m:
        stderr = r.stderr.decode('utf-8', 'replace').strip()[:500]
        msg = 'LAYOUT_CHECK_FAILED: 크롬 결과를 읽지 못했습니다'
        if stderr:
            msg += ' — ' + stderr
        return [msg]
    return [item for item in m.group(1).split(';') if item]


def check_print(html_path, chrome):
    try:
        import pymupdf
    except ImportError:
        try:
            import fitz as pymupdf
        except ImportError:
            return ['PRINT_CHECK_UNAVAILABLE: pymupdf 가 없어 인쇄 쪽 수·크기를 확인하지 못했습니다'
                    '(pip install pymupdf)']
    with io.open(html_path, encoding='utf-8') as f:
        expected = f.read().count('class="page"')
    pdf = _beside(html_path, '_verify_print.pdf')
    if os.path.exists(pdf):
        os.remove(pdf)
    try:
        _chrome(chrome, ['--no-pdf-header-footer', '--print-to-pdf=' + pdf,
                         '--virtual-time-budget=20000'], html_path)
        if not os.path.exists(pdf):
            return ['PRINT_FAILED: 크롬이 PDF 를 만들지 못했습니다']
        problems = []
        doc = pymupdf.open(pdf)
        try:
            if doc.page_count != expected:
                problems.append('PRINT_PAGES:%d!=%d' % (doc.page_count, expected))
            for i in range(doc.page_count):
                w, h = doc[i].rect.width, doc[i].rect.height
                if abs(w - A4_LANDSCAPE_PT[0]) > 2 or abs(h - A4_LANDSCAPE_PT[1]) > 2:
                    problems.append('PRINT_SIZE:%d:%.0fx%.0fpt' % (i + 1, w, h))
        finally:
            doc.close()
        return problems
    finally:
        if os.path.exists(pdf):
            os.remove(pdf)


def verify(html_path):
    chrome = find_chrome()
    if not chrome:
        return ['크롬을 찾을 수 없어 검증할 수 없습니다']
    return check_layout(html_path, chrome) + check_print(html_path, chrome)


def main():
    if len(sys.argv) < 2:
        raise SystemExit('사용법: python verify.py <html파일>')
    problems = verify(sys.argv[1])
    if problems:
        print('문제 발견:')
        for p in problems:
            print('  -', p)
        sys.exit(1)
    print('모두 통과했습니다.')


if __name__ == '__main__':
    main()
