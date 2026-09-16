# -*- coding: utf-8 -*-
"""App Store(iOS) 스크린샷을 찍는다 — tools/capture-guide-shots.py와 같은 씨앗·화면을 쓰되,
6.7인치(1290x2796) 캔버스 크기에 정확히 맞춰야 해서 Playwright로 따로 찍는다
(이 PC의 chrome.exe --headless CLI는 뷰포트가 526px로 고정되는 문제가 있어
스토어가 요구하는 정확한 폭을 낼 수 없다 — Playwright는 이 제약이 없다).

■ 지켜야 할 두 가지 (capture-guide-shots.py와 동일)
  1) 운영 DB를 건드리지 않는다 — fetch를 가로채 전부 로컬 응답으로 답한다.
  2) 실제 성도 이름을 넣지 않는다 — 공개되는 화면이므로 '홍길동/사랑 1목장'.
"""
import io, os, json, subprocess, sys, time

from playwright.sync_api import sync_playwright

ROOT = r"C:\Projects\bible-memorize-church-app-v2"
OUT = os.environ.get("SHOT_OUT") or os.path.join(ROOT, "store", "screenshots-ios")
PORT = 8743
# 6.7인치(iPhone 14/15/16 Pro Max급) — App Store Connect 필수 세트 중 하나.
W, H = 1290, 2796

STEPS = [
    ("home",      "renderSummary()"),
    ("stage3",    "renderTestScreen(verses.find(v=>v.no===6), 3)"),
    ("list",      "renderVerseList()"),
    ("album",     "renderAlbum()"),
    ("challenge", "renderChallenge(verses.find(v=>v.no===3))"),
    ("manual",    "renderManual(null,-1)"),
    ("settings",  "renderSettings()"),
    ("intro",     "renderIntro(function(){})"),
]

verses = json.load(io.open(os.path.join(ROOT, "verses.json"), encoding="utf-8"))
if isinstance(verses, dict):
    verses = verses.get("verses", verses)

# capture-guide-shots.py의 SEED와 동일한 안전장치(가짜 신원 + fetch 가로채기 + 자동 팝업 차단).
SEED = """
<script>
(function(){
  var U = {type:"교구", gu:"사랑", mok:"1", bu:"", grade:"", name:"홍길동"};
  var id = "g|사랑|1|홍길동";
  try {
    localStorage.setItem("memorize-user", JSON.stringify(U));
    localStorage.setItem("memorize-intro-seen", "1");
    var P={}; [1,2,3,4].forEach(function(n){P[n]={stage:3,passed:true};});
    P[5]={stage:2,passed:false};
    localStorage.setItem("memorize-progress::"+id, JSON.stringify(P));
    localStorage.setItem("memorize-hearted::"+id, JSON.stringify({1:1,2:1,3:1}));
    localStorage.setItem("album-checked", JSON.stringify({date:"",nos:[]}));
    localStorage.setItem("sc-promo-seen-v1", "1");
    localStorage.setItem("promo-newfeat", JSON.stringify({dismissed:true, firstSeen:1}));
  } catch(e){}

  var VERSES = __VERSES__;
  var realFetch = window.fetch.bind(window);
  window.fetch = function(url, opt){
    var u = String(url || (url && url.url) || "");
    if (u.indexOf("/functions/v1/") < 0) return realFetch(url, opt);
    var body = {};
    try { body = JSON.parse((opt && opt.body) || "{}"); } catch(e){}
    var canned = {
      getVerses: {ok:true, verses:VERSES},
      login:     {ok:true, progress:{}, progressEn:{}, hearted:{}, reviews:[], challenge:{}},
      getConfig: {ok:true, value:null},
      stats:     {ok:true},
      mydays:    {ok:true, days:[]},
      challenge: {ok:true, count:3},
      ranking:   {ok:true, list:[]},
      getSermons:{ok:true, sermons:[]}
    };
    var d = canned[body.action] || {ok:true};
    return Promise.resolve(new Response(JSON.stringify(d),
      {status:200, headers:{"Content-Type":"application/json"}}));
  };

  document.addEventListener("DOMContentLoaded", function(){
    ["maybeShowWeeklyMeditation","maybeShowSermonChatPromo","showDailyMessage",
     "previewDailyMessage","showPushNudge"].forEach(function(n){
      try { if (typeof window[n] === "function") window[n] = function(){}; } catch(e){}
    });
  });
  window.addEventListener("DOMContentLoaded", function(){
    try {
      var real = window.maybeShowWeeklyMeditation;
      window.maybeShowWeeklyMeditation = function(force){ if (force) return real.apply(null, arguments); };
    } catch(e){}
  });

  var step = new URLSearchParams(location.search).get("go") || "";
  if (!step) return;
  var tries = 0;
  var timer = setInterval(function(){
    tries++;
    if (typeof verses !== "undefined" && verses && verses.length) {
      clearInterval(timer);
      try { eval(decodeURIComponent(step)); } catch(e){ document.title = "ERR " + e.message; }
      setTimeout(function(){
        try { if (typeof todayCountCache !== "undefined") {
          todayCountCache = 6; todayCountDay = todayYmd(); applyTodayStrip();
        } } catch(e){}
        try {
          document.querySelectorAll(".cheer-overlay,.promo-card,.sc-promo,#daily-message")
            .forEach(function(el){ el.remove(); });
        } catch(e){}
        try { var m = document.getElementById("dev-env-mark"); if (m) m.remove(); } catch(e){}
        try { window.scrollTo(0, 0); } catch(e){}
        document.title = "READY";
      }, 1200);
    } else if (tries > 200) { clearInterval(timer); document.title = "TIMEOUT"; }
  }, 50);
})();
</script>
"""


def main():
    os.makedirs(OUT, exist_ok=True)
    src = io.open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
    seed = SEED.replace("__VERSES__", json.dumps(verses, ensure_ascii=False))
    cap = src.replace('<script src="js/config.js', seed + '  <script src="js/config.js', 1)
    capname = "_cap_ios.html"
    io.open(os.path.join(ROOT, capname), "w", encoding="utf-8", newline="").write(cap)

    srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--bind", "127.0.0.1"],
                           cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.5)
    results = []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": W, "height": H}, device_scale_factor=1, is_mobile=True)
            for name, js in STEPS:
                url = "http://127.0.0.1:%d/%s?go=%s" % (PORT, capname, js.replace(" ", "%20").replace("&", "%26"))
                page.goto(url, wait_until="networkidle")
                try:
                    page.wait_for_function("document.title === 'READY' || document.title.indexOf('ERR') === 0", timeout=10000)
                except Exception:
                    pass
                # 스플래시(#splash)는 SPLASH_MIN_MS=2000 + .45s 페이드로 독립적으로 사라진다 —
                # "READY" 제목과 무관한 별도 타이머라, 그게 다 끝날 때까지 더 기다린다.
                page.wait_for_timeout(3500)
                try:
                    page.evaluate("var s=document.getElementById('splash'); if(s) s.remove();")
                except Exception:
                    pass
                png = os.path.join(OUT, name + ".png")
                page.screenshot(path=png)
                ok = os.path.exists(png) and os.path.getsize(png) > 3000
                results.append("%-10s %s  %s" % (name, "OK " if ok else "실패",
                                                  "%d KB" % (os.path.getsize(png)//1024) if ok else page.title()))
            browser.close()
    finally:
        srv.terminate()
        try: os.remove(os.path.join(ROOT, capname))
        except Exception: pass
    print("\n".join(results))
    print("\n저장 위치:", OUT)


if __name__ == "__main__":
    main()
