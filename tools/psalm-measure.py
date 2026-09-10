# -*- coding: utf-8 -*-
"""
시편 말씀 액자 — 액자 안 말씀이 실제로 몇 줄인지 잰다.

tools/capture-guide-shots.py 와 같은 방식이다: index.html 을 복사해 씨앗 스크립트를
끼운 임시 파일을 만들고, 로컬 서버로 띄워 ?go= 로 부른다. 다 재면 임시 파일을 지운다.

⚠️ 헤드리스 뷰포트는 526px 고정이라 .ps-wrap 을 CSS 로 못 박고 잰다.
⚠️ 측정 코드는 씨앗 안에 둔다 — ?go= 로는 `psalmMeasure()` 한 마디만 보낸다.
   (URL 이 두 번 해독돼 + < # % 백틱이 조용히 깨지는 것을 원천 회피)
⚠️ `app.js` 에는 `?go=` 실행 자리가 없다 — 씨앗이 직접 `renderPsalmHome()` 을 불러
   시편 화면으로 들어간다. `?psalm=1` 로 들어가는 길은 `getPsalmPreview()` 가
   `history.replaceState` 로 쿼리 전체를 지우므로(`?go=` 도 함께) 쓰지 않는다.

먼저: (이 도구가 알아서 python -m http.server 를 띄운다)
사용법:
  python tools/psalm-measure.py [--stage 3] [--width 390]        개발 DB 구절로 잰다
  python tools/psalm-measure.py --fake [--stage 3] [--width 390]  가짜 구절로 도구 자체를 검증
"""
import argparse
import html
import json
import os
import re
import subprocess
import sys
import tempfile
import time

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")  # SystemExit 메시지도 한글이라 stderr도 맞춰 둔다

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT = os.path.join(ROOT, "psalm", "측정결과.txt")
PORT = 8731
TMP = "_psalm_measure.html"

# --fake 표본 — 실제 시편 구절이 아니라 줄 수를 재기 위한 중립 문장이다.
# 폭(글자수+낱말수)은 tools/psalm-fit.py 의 잣대와 같다. 상한 76(MAX_W)까지는
# 다섯 줄에 들어가도록 설계돼 있으므로 27·46·62·69는 "들어가는 쪽"의 분포를
# 흉내 낸 것이다. 마지막 한 편은 그 상한을 넘겨 "넘침"을 이 도구가 실제로
# 잡아내는지 보려는 표본이다 — ⚠️ 처음엔 91을 썼는데 실측 결과가 정확히
# 5.0줄(반올림 경계)로 나와 넘침 판정을 놓쳤다(psalmFitFont 가 폭 76 근처부터
# 최소 글씨 20px에 클램프돼 더 안 줄어들 뿐, 그 자체가 5줄을 보장하진 않는다).
# 여유 있게 120으로 올려 확실히 넘치게 했다(390px·3단계 실측 7줄).
FAKE_WIDTHS = [27, 46, 62, 69, 120]
FAKE_FILLER = [
    "이것은", "줄수를", "재기", "위한", "가짜", "문장", "입니다", "자리를",
    "채우는", "용도로", "임의로", "길게", "늘려서", "적어", "봅니다", "계속",
    "이어서", "씁니다", "폭을", "맞추기", "위해", "낱말을", "더", "넣습니다",
]


def fake_text(width):
    """FAKE_FILLER 를 이어 붙여 psalmWidthEm(글자수+낱말수)이 정확히 width 가 되게 만든다."""
    words, total, i = [], 0, 0
    while True:
        remaining = width - total
        if remaining <= 0:
            break
        w = FAKE_FILLER[i % len(FAKE_FILLER)]
        i += 1
        add = len(w) + 1  # +1 = 낱말 하나가 늘어나는 몫
        if add <= remaining:
            words.append(w)
            total += add
            continue
        # 낱말을 통째로 더하기엔 남은 폭이 모자라다 — 마지막 조각으로 정확히 맞춘다.
        if remaining >= 2:
            words.append("가" * (remaining - 1))
            total += remaining
        elif words:
            # remaining == 1: 새 낱말은 최소 +2(글자 1 + 낱말수 1)라 넘친다 —
            # 이미 있는 마지막 낱말을 한 글자 늘려 낱말수는 그대로 두고 폭만 1 채운다.
            words[-1] += "가"
            total += 1
        break
    return " ".join(words)


def fake_verses():
    out = []
    for day, w in enumerate(FAKE_WIDTHS, start=1):
        out.append({
            "no": 1900 + day,
            "dayNo": day,
            "refFull": "가짜 %d편 (폭 %d)" % (day, w),
            "text": fake_text(w),
        })
    return out


SEED = """
<script>
function psalmMeasure() {
  var W = __WIDTH__, STAGE = __STAGE__;
  var st = document.createElement("style");
  st.textContent = ".ps-wrap{max-width:" + W + "px !important;width:" + W + "px !important}";
  document.head.appendChild(st);
  var out = [];
  psalmVerses.forEach(function (v) {
    renderPsalmStage(v, STAGE);
    var b = document.querySelector(".ps-fr-body");
    if (!b) { out.push({ no: v.no, err: "no body" }); return; }
    var cs = getComputedStyle(b);
    var fs = parseFloat(cs.fontSize);
    var lh = parseFloat(cs.lineHeight) || fs * 1.62;
    out.push({
      no: v.no, ref: v.refFull,
      fs: Math.round(fs), lh: Math.round(lh), h: b.offsetHeight,
      lines: Math.round(b.offsetHeight / lh),
      over: b.scrollWidth > b.clientWidth
    });
  });
  document.title = "RESULT" + JSON.stringify(out);
}
window.addEventListener("DOMContentLoaded", function () {
  var go = new URLSearchParams(location.search).get("go") || "";
  if (!go) return;
  var FAKE = __FAKE__;
  if (FAKE.length) {
    // --fake: 개발 DB·네트워크를 아예 안 거친다. psalm.js 의 전역을 씨앗에서 직접 채운다
    // (같은 문서 안의 <script> 들은 let/const 전역도 이름으로 그대로 주고받는다 —
    //  capture-guide-shots.py 가 전역 `verses` 를 그대로 쓰는 것과 같은 원리).
    psalmVerses = FAKE;
    psalmOpen = FAKE.length;
    psalmTotal = FAKE.length;
    psalmLoaded = true;
  }
  var n = 0;
  var t = setInterval(function () {
    n++;
    if (typeof psalmVerses !== "undefined" && psalmLoaded) {
      clearInterval(t);
      if (!psalmVerses.length) {
        // DB는 응답했지만 오늘 열린 구절이 0편 — 실패가 아니라 "아직 안 열림"이다.
        document.title = "ERR 열린 시편 구절이 없습니다 — 개발 DB에 시드를 넣고 시작일을 당겼는지 보세요";
        return;
      }
      try { eval(go); } catch (e) { document.title = "ERR " + e.message; }
    } else if (!FAKE.length && typeof renderPsalmHome === "function" && n === 2) {
      // ?psalm=1 을 쓰지 않는다 — getPsalmPreview() 가 history.replaceState 로
      // 쿼리 전체(?go= 포함)를 지운다. 화면 함수를 씨앗에서 직접 부르면 그 문제가 없다.
      renderPsalmHome();
    } else if (n > 180) {
      clearInterval(t);
      document.title = "ERR psalmVerses 가 준비되지 않았습니다(18초 안에 안 채워짐 — 네트워크나 dev DB 연결을 보세요)";
    }
  }, 100);
});
</script>
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--stage", type=int, default=3, choices=[0, 1, 2, 3])
    ap.add_argument("--width", type=int, default=390)
    ap.add_argument("--fake", action="store_true", help="개발 DB 대신 가짜 구절 5편으로 도구 자체를 검증한다")
    a = ap.parse_args()

    if not os.path.exists(CHROME):
        raise SystemExit("크롬을 못 찾았습니다: " + CHROME)

    html_src = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
    if "</body>" not in html_src:
        raise SystemExit("index.html 에 </body> 가 없습니다.")

    fake_json = json.dumps(fake_verses(), ensure_ascii=False) if a.fake else "[]"
    seed = (SEED.replace("__WIDTH__", str(a.width))
                .replace("__STAGE__", str(a.stage))
                .replace("__FAKE__", fake_json))
    tmp_path = os.path.join(ROOT, TMP)
    open(tmp_path, "w", encoding="utf-8").write(html_src.replace("</body>", seed + "</body>"))

    srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--bind", "127.0.0.1"],
                            cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.5)
    try:
        url = "http://127.0.0.1:%d/%s?go=psalmMeasure()" % (PORT, TMP)
        with tempfile.TemporaryDirectory() as prof:
            r = subprocess.run(
                [CHROME, "--headless", "--disable-gpu", "--hide-scrollbars",
                 "--user-data-dir=" + prof, "--virtual-time-budget=25000",
                 "--dump-dom", url],
                capture_output=True, text=True, encoding="utf-8", timeout=180)
        dom = r.stdout or ""
    finally:
        srv.terminate()
        try:
            os.remove(tmp_path)
        except OSError:
            pass

    m = re.search(r"<title>(RESULT|ERR )(.*?)</title>", dom, re.S)
    if not m:
        raise SystemExit(
            "측정 실패 — 결과 제목을 못 찾았습니다. 개발 DB에 시편 구절이 있는지,\n"
            "시작일이 오늘 이전으로 당겨져 있는지 보세요(또는 --fake 로 도구 자체를 먼저 검증하세요)."
        )
    if m.group(1) == "ERR ":
        raise SystemExit("측정 실패 — " + html.unescape(m.group(2)).strip())
    data = json.loads(html.unescape(m.group(2)))

    bad = [d for d in data if d.get("lines", 0) > 5 or d.get("over")]
    mode = "가짜 구절" if a.fake else "개발 DB"
    lines = ["시편 말씀 액자 — 액자 실측 (%s · 폭 %dpx · %d단계)" % (mode, a.width, a.stage), "-" * 62]
    for d in data:
        mark = "   ← 넘침" if d in bad else ""
        lines.append("no %-5s %-20s %2d줄  글씨 %2dpx  높이 %3dpx%s"
                      % (d.get("no"), d.get("ref", ""), d.get("lines", 0),
                         d.get("fs", 0), d.get("h", 0), mark))
    lines += ["-" * 62, "구절 %d편 · 다섯 줄 넘김 %d편" % (len(data), len(bad))]
    txt = "\n".join(lines)
    print(txt)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    open(OUT, "w", encoding="utf-8", newline="\n").write(txt + "\n")
    print("\n저장: " + os.path.normpath(OUT))
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
