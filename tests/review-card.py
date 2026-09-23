# -*- coding: utf-8 -*-
"""
복습 화면 카드 모드 회귀 시험 (2026-09-23).

복습은 암송·도전과 달리 **타자와 음성이 같은 onDone 을 공유**한다(app.js 의
setupChallengeTyping 과 setupVoice 에 같은 콜백을 넘긴다). 그래서 도전 코드를
그대로 베껴 cardUsed 를 먼저 보면 🎤 로 마친 기록이 review-typing-card 로 남는다.
이 시험이 그 실수를 막는다.

사용법:  python tests/review-card.py
"""
import subprocess, sys, time
from playwright.sync_api import sync_playwright

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

ROOT = r"C:\Projects\bible-memorize-church-app-v2"
PORT = 8802

VERSE = {"no": 1, "ref": "요 1:1", "refShort": "요 1:1", "text": "태초에 말씀이 계시니라", "week": 1}

# 복습 화면을 그리기 전에 바깥 세계를 막는다 — 서버로 나가는 길과 다음 화면으로 넘어가는 길.
SETUP = """
(verse) => {
  window.__posted = null;
  window.postChallenge = (v, m) => { window.__posted = m; };
  window.advanceReview = () => {};
  window.reviewNext = () => {};
  window.fillVerseHelp = () => {};
  window.fillSermonSummaryBtn = () => {};
  window.setupHeartCheck = () => {};
  window.initStickyRef = () => {};
  window.scrollPastBtnRow = () => {};
  renderReview([verse], 0);
}
"""

# 빈칸을 카드로 전부 채운다(카드 모드일 때만 쟁반이 있다)
FILL_BY_CARD = """
() => {
  const tray = document.getElementById('card-tray');
  Array.from(document.querySelectorAll('.word-input')).map(i => i.dataset.answer).forEach(a => {
    const btn = Array.from(tray.querySelectorAll('.wcard')).find(b => b.textContent === a && !b.disabled);
    if (btn) btn.click();
  });
}
"""

# 빈칸을 자판으로 전부 채운다
FILL_BY_TYPING = """
() => {
  document.querySelectorAll('.word-input').forEach((el) => {
    el.value = el.dataset.answer;
    el.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: false }));
    el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
  });
}
"""

fails = []
srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT)], cwd=ROOT,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    time.sleep(1.2)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        # 개발 DB(Supabase, ktpwthwqzgcqcrmsafdo)로 나가는 요청을 끊는다. 이 상자 안
        # 네트워크 상태가 매번 달라(어떤 때는 몇백ms 안에 실패해 verses.json 폴백으로
        # 넘어가고, 어떤 때는 DNS가 몇 초씩 걸려 멈춰 있었다) window.verses 가 언제
        # 채워질지 예측할 수 없었다 — route.abort() 로 즉시 끊어 항상 같은(빠른) 길로
        # 만든다. 우리 시험은 서버 데이터가 필요 없다(SETUP 이 window.verses 를 직접 심는다).
        page.route("https://ktpwthwqzgcqcrmsafdo.supabase.co/**", lambda route: route.abort())

        def check(name, cond, extra=""):
            print(("PASS  " if cond else "FAIL  ") + name + ("" if cond else "  " + str(extra)))
            if not cond:
                fails.append(name)

        def open_review(card):
            page.goto(f"http://localhost:{PORT}/", wait_until="load")
            # ⚠️ app.js 는 파일 맨 끝에서 곧바로 loadVerses() 를 부르고, 그 안의 네트워크
            # 요청(개발 DB·verses.json 폴백)이 끝나면 routeAfterLoad() 가 #app 을
            # 인트로/진입 화면으로 다시 그린다. 이게 우리 SETUP(renderReview 직접 호출)보다
            # 늦게 끝나면 괜찮지만, 개발 DB(ktpwthwqzgcqcrmsafdo)로 나가는 요청이 이 상자
            # 안에서는 몇백 ms~15초까지 들쭉날쭉하게 실패해(RED 단계에서 실제로 15초 타임아웃까지
            # 났다) window.verses 가 채워지는 시점을 예측할 수 없었다. 게다가 app.js 의
            # `verses` 는 최상위 `let` 이라 window.verses 로 안 보인다(classic script 의
            # let/const 는 전역 렉시컬 바인딩일 뿐 window 프로퍼티가 아니다) — 그래서 값이 아니라
            # **DOM**(routeAfterLoad 가 그리는 화면 중 하나)으로 "부트스트랩이 끝났다"를 본다.
            # 개발 DB 요청을 route.abort() 로 즉시 끊어(아래) 이 화면이 항상 빠르게(로컬
            # verses.json 폴백, 실측 50ms 안팎) 뜨게 만든 뒤, 그다음에 SETUP 을 불러야
            # 우리 쪽이 마지막에 그려 항상 이긴다.
            page.wait_for_selector(".intro-screen, .entry-screen, .summary-screen, .error", timeout=10000)
            page.evaluate("(on) => localStorage.setItem('input-card-mode', on ? '1' : '0')", card)
            page.evaluate("() => localStorage.setItem('card-start', '0')")
            page.evaluate(SETUP, VERSE)
            page.wait_for_timeout(300)

        # ① 카드 모드면 쟁반에 낱말 카드가 생긴다
        open_review(True)
        cards = page.locator("#card-tray .wcard").count()
        check("카드 모드면 쟁반이 생긴다(낱말 %d장)" % cards, cards == 3, cards)

        # ② 자판 모드면 쟁반이 비어 있다
        open_review(False)
        cards0 = page.locator("#card-tray .wcard").count()
        check("자판 모드면 쟁반이 비어 있다", cards0 == 0, cards0)

        # ③ 토글 단추가 있고 누르면 바뀐다
        open_review(False)
        has_toggle = page.locator("#rv-mode-toggle").count() == 1
        check("토글 단추 #rv-mode-toggle 이 있다", has_toggle)
        if has_toggle:
            page.locator("#rv-mode-toggle").click()
            page.wait_for_timeout(300)
            after = page.locator("#card-tray .wcard").count()
            check("토글을 누르면 카드로 바뀐다(낱말 %d장)" % after, after == 3, after)

        # ④ 카드로 마치면 review-typing-card 로 남는다
        open_review(True)
        page.evaluate(FILL_BY_CARD)
        page.wait_for_timeout(700)
        posted = page.evaluate("() => window.__posted")
        check("카드로 마치면 review-typing-card", posted == "review-typing-card", posted)

        # ⑤ 자판으로 마치면 review-typing 으로 남는다
        open_review(False)
        page.evaluate(FILL_BY_TYPING)
        page.wait_for_timeout(900)
        posted = page.evaluate("() => window.__posted")
        check("자판으로 마치면 review-typing", posted == "review-typing", posted)

        # ⑥ ★ 카드 모드를 켜 두고 음성으로 마치면 review-voice 여야 한다.
        #    복습은 타자·음성이 같은 onDone 을 공유하므로, 도전 코드를 그대로 베껴
        #    카드 여부를 먼저 보면 여기서 review-typing-card 가 나온다.
        #    판정 자체는 reviewLogMode() 로 뽑혀 있어 화면 없이 바로 부를 수 있다.
        open_review(True)
        m = page.evaluate("() => reviewLogMode('voice')")
        check("카드를 켜 두고 음성으로 마치면 review-voice", m == "review-voice", m)
        m = page.evaluate("() => reviewLogMode('typing')")
        check("카드를 켜 두고 자판이면 review-typing-card", m == "review-typing-card", m)
        m = page.evaluate("() => reviewLogMode()")
        check("인자가 없으면 review-voice(옛 방어)", m == "review-voice", m)
        open_review(False)
        m = page.evaluate("() => reviewLogMode('voice')")
        check("자판 모드에서 음성이면 review-voice", m == "review-voice", m)

        # ⑦ startReview 가 카드 상태를 설정값으로 되돌린다
        #    (리셋이 없으면 도전에서 켠 카드가 복습까지 따라온다 — 원래 증상)
        page.goto(f"http://localhost:{PORT}/", wait_until="load")
        page.wait_for_selector(".intro-screen, .entry-screen, .summary-screen, .error", timeout=10000)
        reset_ok = page.evaluate("""
        () => {
          localStorage.setItem('input-card-mode', '1');
          localStorage.setItem('card-start', '0');
          startReview();
          return isCardMode();
        }
        """)
        check("startReview 가 카드 상태를 설정값으로 되돌린다", reset_ok is False, reset_ok)

        browser.close()
finally:
    srv.terminate()

print()
print("모두 통과" if not fails else "실패 %d건: %s" % (len(fails), ", ".join(fails)))
sys.exit(1 if fails else 0)
