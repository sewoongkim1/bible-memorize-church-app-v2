# -*- coding: utf-8 -*-
"""
화면 전수 점검 — localhost(= 개발 DB)에서 주요 화면 39개를 **진짜 단추로** 열어 가며 잰다.
(2026-09-20 처음 만듦. 그날 이 도구로 쉴만한 물가 완료 화면·홈 화면 웹앱 여백 문제를 잡았다.)

재는 것(화면마다):
  · JS 오류(pageerror)·콘솔 오류·요청 실패·HTTP 4xx/5xx·대화상자(alert)
  · 화면 글에 undefined/NaN/null · 「불러오지 못」 같은 오류 문구 · 거의 빈 화면
  · 가로 넘침(문서가 옆으로 밀림)과 그 범인 · 깨진 그림
  · 아이폰 안전 영역 — 상태바(위)·홈 막대(아래)에 글·단추가 깔리는지.
    크롬 153 의 CDP `Emulation.setSafeAreaInsetsOverride` 로 **진짜 env() 값**을 넣는다(CSS 를 고쳐 쓰지 않는다).

조건(RUNS): 폭 320/390/430 · 글씨 크게/아주 크게 · 어두운 모드 · 아이폰 앱(app) · 홈 화면 웹앱(pwa)
  · app  = window.Capacitor 표식 + --app-safe-top:0 (AppDelegate 가 하는 일)을 흉내 낸다.
  · pwa  = apple-mobile-web-app-status-bar-style=black-translucent — 앱처럼 상태바 밑부터 그린다.

⚠️ 믿어도 되는 것과 아닌 것
  · fixed 요소는 **물리 화면 끝** 기준이다 — 앱의 🏠 단추(bottom:14px+env)가 실기기 스크린샷에서
    화면 끝 48pt(실측 49pt)에 있어 맞는 것을 확인했다.
  · ⚠️ app 모드의 「화면보다 짧은 페이지는 앱이 상태바 여백을 안 준다」 가정은 **반만 맞았다** —
    쉴만한 물가 첫 화면(딱 한 화면 높이)은 실기기에서 실제로 깔렸지만, 🔒 관리 페이지(짧음 ·
    로고 배너 있음)는 도구가 「깔림」이라 했는데 실기기는 멀쩡했다(2026-09-20 친구 확인).
    **app 모드에서 (fits) 로 나온 위쪽 경고는 실기기로 한 번 보고 믿을 것.**
  · 앱이 스스로 스크롤해 둔 화면(도전의 「단추 줄 건너뛰기」 등)은 흐름 속 요소를 안 본다(정상 동작).
  · 퀴즈 조작 줄처럼 투명도(opacity)가 **부모**에 걸린 것은 숨어 있어도 잡힌다.

준비물: pip 의 playwright(설치된 크롬을 channel="chrome" 으로 쓴다 — 따로 브라우저를 받지 않는다)
⚠️ 개발 DB 에 시험 회원 「화면점검」(믿음-99)이 생긴다. 운영은 건드리지 않는다(localhost → 개발).

사용법:
  python tools/screen-sweep.py                          전부(8조건 × 39화면, 8분 남짓)
  python tools/screen-sweep.py --runs app-390,pwa-390   조건만 골라서
  python tools/screen-sweep.py --steps 24-psalm-home,28-psalm-done
  python tools/screen-sweep.py --site <다른 폴더> --out tmp/sweep-old   고치기 전 판을 따로 잰다
  python tools/screen-sweep.py --seed --compare tmp/sweep-old/results.json
        배치 지문(요소 위치)을 앞 결과와 대조 — 「앱·사파리에서는 1px 도 안 움직였다」를 보일 때.
        --seed 는 Math.random 을 고정한다(카드 순서·도전 구절이 매번 바뀌어 지문이 달라지므로).
결과: <out>/results.json · 사진(web-390, web-320-xl, web-390-lg-dark) · 끝에 요약이 찍힌다.
"""
import argparse, json, os, subprocess, sys, time
from playwright.sync_api import sync_playwright

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

_ap = argparse.ArgumentParser(description="화면 전수 점검(개발 DB)")
_ap.add_argument("--site", default=os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")),
                 help="띄울 폴더(기본: 이 저장소)")
_ap.add_argument("--out", default=None, help="결과 폴더(기본: tmp/screen-sweep)")
_ap.add_argument("--port", type=int, default=8765)
_ap.add_argument("--runs", default="", help="쉼표로 조건 이름")
_ap.add_argument("--steps", default="", help="쉼표로 화면 이름")
_ap.add_argument("--seed", action="store_true", help="Math.random 고정")
_ap.add_argument("--compare", default="", help="앞 results.json — 배치 지문 대조")
ARGS = _ap.parse_args()
ROOT = ARGS.site
OUT = ARGS.out or os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tmp", "screen-sweep")
PORT = ARGS.port
ONLY_RUNS = set(ARGS.runs.split(",")) if ARGS.runs else None
ONLY_STEPS = set(ARGS.steps.split(",")) if ARGS.steps else None
BASE = f"http://localhost:{PORT}/"

USER = {"type": "교구", "gu": "믿음", "mok": "99", "name": "화면점검", "cid": "sweep-cid-1"}
BLESS = "memorize-blessing-seen::g|믿음|99|화면점검"

RUNS = [
    # name, w, h, safe(top,bottom), mode, fontscale, dark, dpr, shots
    dict(name="web-390", w=390, h=844, safe=None, mode="web", fs=None, dark=False, dpr=2, shots=True),
    dict(name="app-390", w=390, h=844, safe=(47, 34), mode="app", fs=None, dark=False, dpr=1, shots=False),
    dict(name="pwa-390", w=390, h=844, safe=(47, 34), mode="pwa", fs=None, dark=False, dpr=1, shots=False),
    dict(name="app-se", w=375, h=667, safe=(20, 0), mode="app", fs=None, dark=False, dpr=1, shots=False),
    dict(name="app-390-xl", w=390, h=844, safe=(47, 34), mode="app", fs="xl", dark=False, dpr=1, shots=False),
    dict(name="web-320-xl", w=320, h=568, safe=None, mode="web", fs="xl", dark=False, dpr=2, shots=True),
    dict(name="web-390-lg-dark", w=390, h=844, safe=None, mode="web", fs="lg", dark=True, dpr=2, shots=True),
    dict(name="web-430", w=430, h=932, safe=None, mode="web", fs=None, dark=False, dpr=1, shots=False),
]

HOME = ("try{ if(document.querySelector('.pr-full')) prayFullClose(); }catch(e){}"
        "try{ stopSpeaking(); }catch(e){}"
        "document.querySelectorAll('.modal-backdrop,.sd-modal,.daily-msg-overlay').forEach(function(m){m.remove()});"
        "try{ _psalmPreview=true; _passagesPreview=true; _songPreview=true; localStorage.setItem('event-open','1'); }catch(e){}"
        "renderSummary(); window.scrollTo(0,0);")


def clk(sel):
    return ("var el=document.querySelector(%s); if(!el) throw new Error('NOBTN '+%s); el.click();"
            % (json.dumps(sel), json.dumps(sel)))


# (이름, [동작 JS…]) — 각 단계는 첫 화면에서 새로 시작한다(HOME). "NOHOME" 이면 바로 앞 화면에 이어 간다.
STEPS = [
    ("01-summary", []),
    ("02-more", [clk("#more-toggle")]),
    ("03-weekly-test", [clk("#weekly-start")]),
    ("04-test-stage1", ["renderTestScreen(verses[0],1)"]),
    ("05-test-stage3", ["renderTestScreen(verses[0],3)"]),
    ("06-test-stage3-card", ["localStorage.setItem('input-card-mode','1'); renderTestScreen(verses[0],3); localStorage.setItem('input-card-mode','0');"]),
    ("07-verse-list", [clk("#go-list")]),
    ("08-challenge", [clk("#go-challenge")]),
    ("09-board", [clk("#open-board")]),
    ("10-prayer", [clk("#open-prayer")]),
    ("11-prayer-full", [clk("#open-prayer"), clk("#pr-big")]),
    ("12-prayer-full-rot", ["NOHOME", clk(".pr-f-rot")]),
    ("13-prayer-group", ["try{prayFullClose()}catch(e){}; try{ if(prayRot){ prayRot=false; } }catch(e){}", clk("#open-prayer"), clk(".pr-acc-item .pr-item"), clk("#pr-tolist")]),
    ("14-pilsa", [clk("#open-pilsa")]),
    ("15-meditation", [clk("#open-meditation")]),
    ("16-sermon-chat", [clk("#open-sermon-chat")]),
    ("17-album", [clk("#open-album")]),
    ("18-ranking", [clk("#open-ranking")]),
    ("19-my-record", [clk("#open-ranking"), clk("[data-m='mine']")]),
    ("20-manual", [clk("#open-help-summary")]),
    ("21-settings", [clk("#open-settings")]),
    ("22-privacy-info", [clk("#open-settings"), clk("#privacy-info")]),
    ("23-manage-menu", [clk("#open-settings"), clk("#open-manage")]),
    ("24-psalm-home", [clk("#open-psalm")]),
    ("25-psalm-stage0", [clk("#open-psalm"), clk(".ps-hn-btn.go")]),
    ("26-psalm-blank1", ["NOHOME", "renderPsalmBlank(psalmToday(),1)"]),
    ("27-psalm-blank3", ["NOHOME", "renderPsalmBlank(psalmToday(),3)"]),
    ("28-psalm-done", ["NOHOME", "renderPsalmDone(psalmToday(),false)"]),
    ("29-events", ["var b=document.querySelector('#open-event-list'); if(b) b.click(); else renderEventList(null);"]),
    ("30-ministry", ["var b=document.querySelector('#open-ministry'); if(b) b.click(); else renderMinistry();"]),
    ("31-passages", [clk("#open-passages")]),
    ("32-entry", ["renderEntryScreen()"]),
    ("33-intro", ["renderIntro(function(){})"]),
    ("34-login-help", ["renderLoginHelp(renderEntryScreen)"]),
    ("35-install-guide", ["renderInstallGuide()"]),
    ("36-blessing", ["renderBlessing(function(){})"]),
    ("37-review-typing", ["renderReview([verses[0]],0)"]),
    ("38-review-card", ["localStorage.setItem('input-card-mode','1'); renderReview([verses[0]],0); localStorage.setItem('input-card-mode','0');"]),
    # 오늘의 찬양(앱 안 화면) — 진입점이 단추뿐이라 renderSongScreen을 직접 불러야 DB 없이도 찍힌다.
    ("39-song", ["NOHOME", "renderSongScreen({id:'y4I3e18fkI4',song:'변함없는 은혜',choir:'임마누엘찬양대',svc_date:'2026-03-22',duration:'3:40',thumbnail:''})"]),
    ("P1-privacy-page", ["GOTO privacy/"]),
    ("P2-quiz-page", ["GOTO quiz/"]),
    ("P3-guide-page", ["GOTO guide/"]),
]

CHECK_JS = r"""
(p) => {
  const T = p.T, B = p.B, mode = p.mode, H = innerHeight, W = innerWidth;
  const de = document.documentElement;
  const root = document.getElementById('app') || document.body;
  const txt = (root.innerText || '');
  const o = {};
  o.scrollY = Math.round(scrollY);
  // 위치 지문 — 고치기 전후로 앱·사파리 배치가 1px 도 안 움직였는지 대조한다
  o.fp = Array.from(document.querySelectorAll('#app *, .test-ref-sticky, .bar button')).filter(e => {
      const r = e.getBoundingClientRect(); return r.width > 1 && r.height > 1 && getComputedStyle(e).visibility !== 'hidden';
    }).slice(0, 60).map(e => { const r = e.getBoundingClientRect(); return Math.round(r.top) + ',' + Math.round(r.left) + ',' + Math.round(r.height); }).join('|');
  o.appSafeTop = getComputedStyle(de).getPropertyValue('--app-safe-top').trim();
  o.textLen = txt.trim().length;
  o.weird = Array.from(new Set(txt.match(/\bundefined\b|\bNaN\b|\[object Object\]|\bnull\b|\bInvalid Date\b/g) || [])).slice(0, 5);
  o.errText = (txt.match(/[^\n]*(불러오지 못|오류가 |실패했|문제가 생)[^\n]*/g) || []).slice(0, 3).map(s => s.trim().slice(0, 80));
  const desc = (el, y) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    else if (typeof el.className === 'string' && el.className.trim()) s += '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.');
    const t = (el.innerText || el.getAttribute('aria-label') || el.getAttribute('alt') || '').trim().replace(/\s+/g, ' ').slice(0, 24);
    return s + (t ? ' 「' + t + '」' : '') + (y !== undefined ? ' @' + Math.round(y) : '');
  };
  const visible = el => {
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  };
  // 가로 넘침 — 문서 자체가 옆으로 밀리는가(성도님이 보는 증상)
  o.hScroll = de.scrollWidth > W + 1 ? de.scrollWidth : 0;
  if (o.hScroll) {
    const offs = [];
    document.querySelectorAll('body *').forEach(el => {
      if (offs.length >= 5 || !visible(el)) return;
      const r = el.getBoundingClientRect();
      if (r.right <= W + 1) return;
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const ox = getComputedStyle(a).overflowX;
        if (ox !== 'visible') return;
      }
      offs.push(desc(el) + ' right=' + Math.round(r.right));
    });
    o.hOffenders = offs;
  }
  o.brokenImgs = Array.from(document.images).filter(i => i.complete && i.naturalWidth === 0 && i.getBoundingClientRect().width > 0)
                   .map(i => (i.getAttribute('src') || '').split('?')[0]).slice(0, 5);
  if (T || B) {
    const scrollable = de.scrollHeight > H + 1;
    o.scrollable = scrollable;
    const fixedLike = el => {
      for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
        const pos = getComputedStyle(e).position;
        if (pos === 'fixed') return 'fixed';
        if (pos === 'sticky') return 'sticky';
      }
      return '';
    };
    const isInter = el => /^(BUTTON|A|INPUT|SELECT|TEXTAREA)$/.test(el.tagName) || el.getAttribute('role') === 'button';
    const cands = Array.from(document.querySelectorAll('body *')).filter(el => {
      if (el.closest('#dev-env-mark')) return false;
      const hasText = Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim());
      const media = /^(IMG|SVG|CANVAS|VIDEO)$/i.test(el.tagName);
      return (isInter(el) || hasText || media) && visible(el);
    });
    const top = [], bot = [];
    const clipRect = el => {
      const r0 = el.getBoundingClientRect();
      let t = r0.top, b = r0.bottom;
      for (let a = el.parentElement; a && a !== document.body && a !== de; a = a.parentElement) {
        const cs = getComputedStyle(a);
        if (cs.overflow !== 'visible' || cs.overflowY !== 'visible') {
          const ar = a.getBoundingClientRect();
          t = Math.max(t, ar.top); b = Math.min(b, ar.bottom);
        }
      }
      return { top: t, bottom: b };
    };
    cands.forEach(el => {
      const r = clipRect(el);
      if (r.bottom - r.top < 1) return;
      if (r.bottom <= 0 || r.top >= H) return;
      const fx = fixedLike(el);
      let sTop = r.top, sBot = r.bottom;
      // 앱: 화면보다 긴 페이지만 UIKit 이 위 여백(T)을 준다 — fixed/sticky 는 물리 화면 기준
      if (mode === 'app' && !fx && scrollable) { sTop += T; sBot += T; }
      // 앱이 스스로 내려 둔 화면(도전의 단추 줄 건너뛰기 등)은 흐름 속 요소가 위로 밀려난 게 정상이다
      if (!fx && scrollY > 0) return;
      if (sTop < T - 0.5 && sBot > 0.5) top.push(desc(el, sTop) + (fx ? ' [' + fx + ']' : ''));
      if (B && isInter(el) && sBot > H - B + 0.5 && sTop < H) {
        // 앱에서 긴 페이지는 아래 여백(B)도 받아 끌어올릴 수 있다 · fixed 는 못 끌어올린다
        if (fx === 'fixed' || !scrollable || (mode === 'pwa' && (de.scrollHeight - (r.bottom + scrollY)) < B))
          bot.push(desc(el, sBot) + (fx ? ' [' + fx + ']' : ''));
      }
    });
    // 스크롤한 뒤 붙박이(sticky) 머리가 상태바 밑으로 들어가는가
    const sticky = [];
    if (scrollable) {
      window.scrollTo(0, Math.min(400, de.scrollHeight - H));
      cands.forEach(el => {
        if (fixedLike(el) !== 'sticky') return;
        const r = clipRect(el);
        if (r.bottom > 0.5 && r.top < T - 0.5 && r.top > -r.height) sticky.push(desc(el, r.top));
      });
      window.scrollTo(0, 0);
    }
    o.safeTop = top.slice(0, 6); o.safeTopN = top.length;
    o.safeBot = bot.slice(0, 6); o.safeBotN = bot.length;
    o.stickyTop = sticky.slice(0, 4);
  }
  return o;
}
"""


SEED_JS = ("(function(){var x=12345;Math.random=function(){x=(x*1103515245+12345)%2147483648;return x/2147483648;};})();"
           if ARGS.seed else "")


def init_script(run):
    ls = {
        "memorize-user": json.dumps(USER, ensure_ascii=False),
        "privacy-consent": "1",
        "memorize-intro-seen": "1",
        BLESS: "1",
        "promo-newfeat": json.dumps({"dismissed": True}),
        "sc-promo-seen-v1": "1",
        "theme": "dark" if run["dark"] else "light",
    }
    js = "try{var s=%s; for(var k in s){ if(localStorage.getItem(k)===null || k==='theme') localStorage.setItem(k,s[k]); }" % json.dumps(ls, ensure_ascii=False)
    js += ("localStorage.setItem('fontscale',%s);" % json.dumps(run["fs"])) if run["fs"] else "localStorage.removeItem('fontscale');"
    js += "}catch(e){}"
    js += SEED_JS
    if run["mode"] == "app":
        # 앱 껍데기가 하는 일 두 가지를 흉내 낸다 — Capacitor 표식, --app-safe-top:0
        js += "window.Capacitor={isNativePlatform:function(){return true}};"
        js += ("(function f(){ if(document.documentElement) document.documentElement.style.setProperty('--app-safe-top','0px');"
               " else setTimeout(f,0); })();"
               "document.addEventListener('DOMContentLoaded',function(){document.documentElement.style.setProperty('--app-safe-top','0px')});")
    return js


def main():
    os.makedirs(OUT, exist_ok=True)
    srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--bind", "127.0.0.1"], cwd=ROOT,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.2)
    results = []
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(channel="chrome", headless=True)
            for run in RUNS:
                if ONLY_RUNS and run["name"] not in ONLY_RUNS:
                    continue
                t0 = time.time()
                ctx = browser.new_context(viewport={"width": run["w"], "height": run["h"]},
                                          device_scale_factor=run["dpr"], is_mobile=True, has_touch=True,
                                          locale="ko-KR", service_workers="block")
                ctx.add_init_script(init_script(run))
                page = ctx.new_page()
                if run["safe"]:
                    cdp = ctx.new_cdp_session(page)
                    cdp.send("Emulation.setSafeAreaInsetsOverride",
                             {"insets": {"top": run["safe"][0], "bottom": run["safe"][1]}})
                cur = []
                page.on("pageerror", lambda e: cur.append(("pageerror", str(e)[:200])))
                page.on("console", lambda m: cur.append(("console", m.text[:200])) if m.type == "error" else None)
                page.on("requestfailed", lambda r: cur.append(("reqfail", r.url[:120] + " " + str(r.failure)[:60])))
                page.on("response", lambda r: cur.append(("http" + str(r.status), r.url[:140])) if r.status >= 400 else None)
                page.on("dialog", lambda d: (cur.append(("dialog", d.message[:120])), d.dismiss()))
                page.goto(BASE, wait_until="networkidle")
                page.wait_for_timeout(1500)
                boot = list(cur)
                shotdir = os.path.join(OUT, run["name"])
                if run["shots"]:
                    os.makedirs(shotdir, exist_ok=True)
                for name, acts in STEPS:
                    if ONLY_STEPS and name not in ONLY_STEPS:
                        continue
                    cur.clear()
                    rec = {"run": run["name"], "step": name}
                    try:
                        acts = list(acts)
                        if acts and acts[0].startswith("GOTO "):
                            page.goto(BASE + acts[0][5:], wait_until="networkidle")
                        else:
                            if page.url.rstrip("/") != BASE.rstrip("/"):
                                page.goto(BASE, wait_until="networkidle")
                                page.wait_for_timeout(1200)
                            if acts and acts[0] == "NOHOME":
                                acts = acts[1:]
                            else:
                                page.evaluate("() => {" + HOME + "}")
                                page.wait_for_timeout(350)
                            for a in acts:
                                page.evaluate("async () => {" + a + "}")
                                try:
                                    page.wait_for_load_state("networkidle", timeout=4000)
                                except Exception:
                                    pass
                                page.wait_for_timeout(600)
                        page.wait_for_timeout(400)
                        T, B = run["safe"] if run["safe"] else (0, 0)
                        rec.update(page.evaluate(CHECK_JS, {"T": T, "B": B, "mode": run["mode"]}))
                        if run["shots"]:
                            page.screenshot(path=os.path.join(shotdir, name + ".png"))
                    except Exception as e:
                        msg = str(e)
                        rec["fail"] = ("단추 없음: " + msg.split("NOBTN ")[1].split("\n")[0]) if "NOBTN" in msg else msg[:240]
                    rec["events"] = list(cur)
                    results.append(rec)
                    flag = any(rec.get(k) for k in ("weird", "errText", "hScroll", "brokenImgs", "safeTop", "safeBot", "stickyTop", "fail", "events"))
                    print(("!! " if flag else "   ") + run["name"] + " " + name, flush=True)
                results.append({"run": run["name"], "step": "00-boot", "events": boot})
                print("== %s done in %.0fs" % (run["name"], time.time() - t0), flush=True)
                ctx.close()
            browser.close()
    finally:
        srv.terminate()
        with open(os.path.join(OUT, "results.json"), "w", encoding="utf-8") as f:
            json.dump(results, f, ensure_ascii=False, indent=1)
    report(results)
    if ARGS.compare:
        compare(results, ARGS.compare)


def report(R):
    def show(title, rows):
        print("\n### " + title + " (%d)" % len(rows))
        for r in rows:
            print("  - " + r)
    
    fails, events, weird, errtext, hs, imgs, stop, sbot, sticky, blank = ([] for _ in range(10))
    noise = set()
    for r in R:
        tag = "%s %s" % (r["run"], r["step"])
        if r.get("fail"):
            fails.append(tag + " → " + r["fail"])
        for kind, msg in r.get("events", []):
            # 개발 DB 에는 말씀 아카이브(sermon) 함수가 없다(js/config.js SUPA_PROD 주석) — 운영과 무관한 소음
            if "ktpwthwqzgcqcrmsafdo.supabase.co/functions/v1/sermon" in msg or (kind == "console" and msg == "Failed to load resource: net::ERR_FAILED" and r["step"] == "00-boot"):
                noise.add(kind)
                continue
            events.append("%s [%s] %s" % (tag, kind, msg))
        if r.get("weird"):
            weird.append(tag + " → " + ", ".join(r["weird"]))
        if r.get("errText"):
            errtext.append(tag + " → " + " / ".join(r["errText"]))
        if r.get("hScroll"):
            hs.append(tag + " → scrollWidth %s · %s" % (r["hScroll"], "; ".join(r.get("hOffenders", []))))
        if r.get("brokenImgs"):
            imgs.append(tag + " → " + ", ".join(r["brokenImgs"]))
        if r.get("safeTop"):
            stop.append(tag + (" (scroll)" if r.get("scrollable") else " (fits)") + " → " + "; ".join(r["safeTop"][:4]) + (" …+%d" % (r["safeTopN"] - 4) if r["safeTopN"] > 4 else ""))
        if r.get("safeBot"):
            sbot.append(tag + " → " + "; ".join(r["safeBot"][:4]))
        if r.get("stickyTop"):
            sticky.append(tag + " → " + "; ".join(r["stickyTop"]))
        if r["step"] != "00-boot" and not r.get("fail") and r.get("textLen", 999) < 30 and not r["step"].startswith("P"):
            blank.append(tag + " → text %s" % r.get("textLen"))
    
    show("단계 실패(단추 없음·예외)", fails)
    show("JS 오류·콘솔 오류·요청 실패·HTTP 4xx/5xx·대화상자", events)
    show("화면 글에 undefined/NaN/null", weird)
    show("화면에 오류 문구", errtext)
    show("가로 넘침(문서가 옆으로 밀림)", hs)
    show("깨진 그림", imgs)
    show("상태바에 가림(위)", stop)
    show("홈 막대에 걸림(아래, 누르는 것)", sbot)
    show("스크롤 뒤 붙박이 머리가 상태바 밑", sticky)
    show("거의 빈 화면", blank)
    if noise:
        print("\n(알려진 개발 전용 소음은 뺐다: 개발 DB 에 sermon 함수가 없어 첫 로딩 때 CORS 오류 — 운영 무관)")


def compare(R, prev_path):
    prev = {(r["run"], r["step"]): r for r in json.load(open(prev_path, encoding="utf-8"))}
    diff = []
    for r in R:
        k = (r["run"], r["step"])
        if r["step"] == "00-boot" or k not in prev:
            continue
        if prev[k].get("fp") != r.get("fp"):
            diff.append("%s %s" % k)
    print("\n### 배치 지문이 달라진 화면 (%d)" % len(diff))
    for d in diff:
        print("  - " + d)


if __name__ == "__main__":
    main()
