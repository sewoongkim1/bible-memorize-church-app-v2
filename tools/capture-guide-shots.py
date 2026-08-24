# -*- coding: utf-8 -*-
"""따라 하기 페이지에 쓸 '진짜 앱 화면'을 단계별로 찍는다.

■ 지켜야 할 두 가지
  1) 운영 DB를 건드리지 않는다 — fetch를 가로채 전부 로컬 응답으로 답한다.
     그냥 띄우면 login 액션이 실제 users 테이블에 가짜 사람을 만든다.
  2) 실제 성도 이름을 넣지 않는다 — 공개되는 화면이므로 '홍길동/사랑 1목장'.

■ 방법
  index.html 에 씨앗 스크립트를 끼운 _cap.html 을 만들고, 로컬 서버로 띄운 뒤
  ?step=N 에 따라 원하는 화면 함수를 부른 상태를 스크린샷으로 담는다.
"""
import io, os, json, subprocess, time, socket, sys

# 스토어 스크린샷도 같은 씨앗·같은 화면을 써야 한다 — 두 벌로 갈라 두면 한쪽이 낡는다.
#   SHOT_OUT    나갈 폴더 (기본 guide/shots)
#   SHOT_SCALE  배율. 이 PC 헤드리스 크롬은 뷰포트가 526px 고정이라
#               스토어용 큰 그림은 배율로만 키울 수 있다(2 → 1052x1880)
#   SHOT_NOCROP 1이면 아래 여백을 자르지 않는다(스토어는 크기가 고르게 맞아야 한다)

ROOT = r"C:\Projects\bible-memorize-church-app-v2"
OUT = os.environ.get("SHOT_OUT") or os.path.join(ROOT, "guide", "shots")
SCALE = float(os.environ.get("SHOT_SCALE") or 1)
NOCROP = os.environ.get("SHOT_NOCROP") == "1"
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PORT = 8742
W, H = 526, 940   # 이 PC 헤드리스 크롬은 뷰포트가 526px로 고정된다

STEPS = [
    ("intro",     "renderIntro(function(){})"),
    ("install",   "renderSummary(); renderInstallGuide()"),
    ("home",      "renderSummary()"),
    ("list",      "renderVerseList()"),
    ("stage1",    "renderTestScreen(verses.find(v=>v.no===6), 1)"),
    ("stage3",    "renderTestScreen(verses.find(v=>v.no===6), 3)"),
    ("album",     "renderAlbum()"),
    ("challenge", "renderChallenge(verses.find(v=>v.no===3))"),
    ("settings",  "renderSettings()"),
    ("manual",    "renderManual(null,-1)"),
]

verses = json.load(io.open(os.path.join(ROOT, "verses.json"), encoding="utf-8"))
if isinstance(verses, dict):
    verses = verses.get("verses", verses)

SEED = """
<script>
(function(){
  // 가짜 신원 — 이 화면은 공개된다. 실제 성도 이름은 절대 넣지 않는다.
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
    // 홍보 팝업 둘 다 끈다 — 설명 화면을 덮으면 안 된다
    localStorage.setItem("sc-promo-seen-v1", "1");
    localStorage.setItem("promo-newfeat", JSON.stringify({dismissed:true, firstSeen:1}));
  } catch(e){}

  // 통신을 전부 가로챈다 — 운영 DB에 가짜 사용자가 생기면 안 된다.
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

  // 자동 팝업(오늘의 묵상·새 기능 홍보·공지)을 끈다.
  // app.js가 파싱된 뒤 부팅(비동기 fetch)이 끝나기 전에 갈아끼워야 한다.
  document.addEventListener("DOMContentLoaded", function(){
    ["maybeShowWeeklyMeditation","maybeShowSermonChatPromo","showDailyMessage",
     "previewDailyMessage","showPushNudge"].forEach(function(n){
      try { if (typeof window[n] === "function") window[n] = function(){}; } catch(e){}
    });
  });

  // 화면이 준비되면 원하는 함수를 부른다
  var step = new URLSearchParams(location.search).get("go") || "";
  if (!step) return;
  var tries = 0;
  var timer = setInterval(function(){
    tries++;
    if (typeof verses !== "undefined" && verses && verses.length) {
      clearInterval(timer);
      try { eval(decodeURIComponent(step)); } catch(e){ document.title = "ERR " + e.message; }
      setTimeout(function(){
        // '불러오는 중…'이 그대로 찍히지 않게 실제 값으로 채운다
        try { if (typeof todayCountCache !== "undefined") {
          todayCountCache = 6; todayCountDay = todayYmd(); applyTodayStrip();
        } } catch(e){}
        // 그래도 뜬 덮개가 있으면 걷어낸다
        try {
          document.querySelectorAll(".cheer-wrap,.dmsg-wrap,.promo-card,.modal-wrap,.sc-promo")
            .forEach(function(el){ el.remove(); });
        } catch(e){}
        // 암송 화면은 스스로 아래로 스크롤한다 — 찍을 땐 맨 위가 보여야 한다
        try { window.scrollTo(0, 0); } catch(e){}
        document.title = "READY";
      }, 1200);
    } else if (tries > 200) { clearInterval(timer); document.title = "TIMEOUT"; }
  }, 50);
})();
</script>
"""


def free(port):
    s = socket.socket()
    try:
        s.bind(("127.0.0.1", port)); return True
    except Exception:
        return False
    finally:
        s.close()


def main():
    os.makedirs(OUT, exist_ok=True)
    src = io.open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
    seed = SEED.replace("__VERSES__", json.dumps(verses, ensure_ascii=False))
    cap = src.replace('<script src="js/config.js', seed + '  <script src="js/config.js', 1)
    capname = "_cap.html"
    io.open(os.path.join(ROOT, capname), "w", encoding="utf-8", newline="").write(cap)

    srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--bind", "127.0.0.1"],
                           cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.5)
    done = []
    try:
        for name, js in STEPS:
            png = os.path.join(OUT, name + ".png")
            url = "http://127.0.0.1:%d/%s?go=%s" % (PORT, capname, js.replace(" ", "%20").replace("&", "%26"))
            cmd = [CHROME, "--headless", "--disable-gpu", "--hide-scrollbars",
                   "--virtual-time-budget=9000",
                   "--screenshot=" + png, "--window-size=%d,%d" % (W, H), url]
            if SCALE != 1:
                cmd.insert(4, "--force-device-scale-factor=%g" % SCALE)
            subprocess.run(cmd, capture_output=True)
            # 아래쪽 빈 여백을 잘라낸다(화면마다 길이가 달라 그대로 두면 들쭉날쭉하다)
            if os.path.exists(png) and not NOCROP:
                try:
                    from PIL import Image
                    im = Image.open(png).convert("RGB")
                    w, h = im.size
                    px = im.load()
                    bg = px[3, h - 3]
                    last = 0
                    for y in range(h - 1, -1, -1):
                        row = [px[x, y] for x in range(0, w, 7)]
                        if any(abs(c[0]-bg[0])+abs(c[1]-bg[1])+abs(c[2]-bg[2]) > 24 for c in row):
                            last = y; break
                    im.crop((0, 0, w, min(h, last + 18))).save(png)
                except Exception:
                    pass
            ok = os.path.exists(png) and os.path.getsize(png) > 3000
            done.append("%-10s %s  %s" % (name, "OK " if ok else "실패",
                                          "%d KB" % (os.path.getsize(png)//1024) if ok else ""))
    finally:
        srv.terminate()
        try: os.remove(os.path.join(ROOT, capname))
        except Exception: pass
    io.open(os.path.join(ROOT, "guide", "_cap.txt"), "w", encoding="utf-8").write("\n".join(done))


main()
