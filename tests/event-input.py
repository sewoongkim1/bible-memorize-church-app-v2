# -*- coding: utf-8 -*-
"""
빈칸 정답 판정 회귀 시험 — 이벤트 화면과 도전 화면(복습 등 네 곳이 함께 쓴다).
아이폰에서 「정답을 쳐도 지워진다」 제보(2026-09-20 성도님)로 만들었다.

아이폰 사파리/WKWebView 에서 한글을 칠 때 실제로 일어나는 두 가지를 흉내 낸다:
  ① 마지막 글자를 조합하는 **중간 상태**(정답과 글자 수가 같다. 예 정답 「생명」 → 「생며」)에서
     input 이벤트가 isComposing=false 로 온다. 암송·도전 화면은 「정답보다 **길 때만**」 지우므로
     안전한데, 이벤트 화면은 「같거나 길면」 지워서 조합 중인 글자를 날려 버렸다.
  ② 자판에 따라 값이 **NFD(자모 분리형)** 로 온다. 눈에는 같아 보이지만 === 비교가 어긋난다.
     암송 화면은 NFC 로 맞춘 뒤 견주는데(setupAutoCheck 의 norm) 이벤트 화면엔 그게 없었다.

판정 함수(setupEventInput·setupChallengeTyping)만 떼어 부른다 — 이벤트 회차 설정(app_config 'event')이나
로그인 없이도 돌아간다.
사용법:  python tests/event-input.py      (localhost 를 띄워 개발 DB 로 연다)
"""
import subprocess, sys, time, unicodedata
from playwright.sync_api import sync_playwright

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

ROOT = r"C:\Projects\bible-memorize-church-app-v2"
PORT = 8801
ANSWER = "생명"

SETUP = """
(answer) => {
  // 이벤트 화면이 만드는 것과 같은 모양의 칸 하나
  document.getElementById('app').innerHTML =
    '<input class="word-input" id="ev-input" data-answer="' + answer + '" autocomplete="off">' +
    '<div id="ev-hint"></div>';
  window.__moved = null;
  // 정답을 맞히면 다음 문제/응모로 넘어간다 — 시험에서는 넘어갔다는 표시만 남긴다
  window.renderEventStep = () => { window.__moved = 'next'; };
  window.finishEvent = () => { window.__moved = 'finish'; };
  setupEventInput([{}, {}], 0, answer);
}
"""

TYPE = """
([value, isComposing]) => {
  const el = document.getElementById('ev-input');
  el.value = value;
  el.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: isComposing }));
  el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
}
"""

READ = """
() => {
  const el = document.getElementById('ev-input');
  return { value: el.value, wrong: el.classList.contains('wrong'),
           correct: el.classList.contains('correct'), moved: window.__moved };
}
"""


def main():
    srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--bind", "127.0.0.1"], cwd=ROOT,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.2)
    fails = []
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(channel="chrome", headless=True)
            ctx = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True,
                                      has_touch=True, locale="ko-KR", service_workers="block")
            page = ctx.new_page()
            page.goto("http://localhost:%d/" % PORT, wait_until="networkidle")
            page.wait_for_function("typeof setupEventInput === 'function'", timeout=20000)

            def case(name, steps, want):
                page.evaluate(SETUP, ANSWER)
                for value, composing, wait in steps:
                    page.evaluate(TYPE, [value, composing])
                    page.wait_for_timeout(wait)
                got = page.evaluate(READ)
                ok = all(got[k] == v for k, v in want.items())
                print(("PASS  " if ok else "FAIL  ") + name)
                if not ok:
                    print("      바란 것 %s\n      실제   %s" % (want, got))
                    fails.append(name)

            # ① 마지막 글자를 조합하는 중간 상태(정답과 글자 수가 같다) — 지우면 안 된다
            case("조합 중 「생며」는 지우지 않는다", [("생며", False, 1500)],
                 {"value": "생며", "wrong": False, "correct": False, "moved": None})
            # ② 이어서 정답을 완성하면 통과
            case("「생며」 뒤 「생명」이면 정답", [("생며", False, 400), (ANSWER, False, 700)],
                 {"value": ANSWER, "correct": True, "moved": "next"})
            # ③ 아이폰 자판이 분해형(NFD)으로 줘도 정답
            case("분해형(NFD)으로 와도 정답", [(unicodedata.normalize("NFD", ANSWER), False, 700)],
                 {"correct": True, "moved": "next"})
            # ④ 진짜 오답(정답보다 길다)은 지운다 — 이 동작은 그대로여야 한다
            case("정답보다 길면 지운다", [("생명책", False, 1500)],
                 {"value": "", "correct": False, "moved": None})
            # ⑤ 낱자모만 남은 값은 조합 중으로 보되, 오래 멈춰 있으면 지운다
            case("자음만 「ㅅㅅㅅ」은 1.2초 뒤 지운다", [("ㅅㅅㅅ", False, 2000)],
                 {"value": "", "correct": False, "moved": None})
            # ── 도전 화면(setupChallengeTyping) — 같은 규칙이어야 한다 ──
            SETUP_CH = """
            (mode) => {
              document.getElementById('app').innerHTML =
                '<div id="ch-remain"></div>' +
                '<input class="word-input" data-answer="생명">' +
                '<input class="word-input" data-answer="말씀">' +
                '<div id="card-tray"></div>';
              window.__done = null;
              try { localStorage.setItem('input-card-mode', mode === 'card' ? '1' : '0'); } catch (e) {}
              setupChallengeTyping({ no: 1, text: '생명 말씀' }, (m) => { window.__done = m; });
            }
            """
            TYPE_CH = """
            ([i, value]) => {
              const el = document.querySelectorAll('.word-input')[i];
              el.value = value;
              el.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: false }));
              el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
            }
            """
            READ_CH = """
            () => Array.from(document.querySelectorAll('.word-input')).map(el => ({
              value: el.value, correct: el.classList.contains('correct')
            })).concat([{ done: window.__done }])
            """

            def case_ch(name, steps, want, mode="typing"):
                page.evaluate(SETUP_CH, mode)
                for i, value, wait in steps:
                    page.evaluate(TYPE_CH, [i, value])
                    page.wait_for_timeout(wait)
                got = page.evaluate(READ_CH)
                ok = all(got[k][f] == v for (k, f, v) in want)
                print(("PASS  " if ok else "FAIL  ") + "[도전] " + name)
                if not ok:
                    print("      실제 %s" % got)
                    fails.append(name)

            nfd = unicodedata.normalize("NFD", "생명")
            case_ch("보통 입력으로 정답", [(0, "생명", 700)], [(0, "correct", True)])
            case_ch("분해형(NFD)으로 와도 정답", [(0, nfd, 700)], [(0, "correct", True)])
            case_ch("조합 중 「생며」는 지우지 않는다", [(0, "생며", 1500)], [(0, "value", "생며"), (0, "correct", False)])
            case_ch("둘 다 맞히면 완료", [(0, "생명", 500), (1, "말씀", 700)], [(2, "done", "typing")])
            case_ch("정답보다 길면 지운다", [(0, "생명책", 1500)], [(0, "value", "")])

            # 카드 모드 — 카드로 채워도 같은 길로 완료된다(예전에 여기서만 통째로 멈춘 적이 있다)
            page.evaluate(SETUP_CH, "card")
            page.wait_for_timeout(300)
            cards = page.locator("#card-tray .wcard").count()
            page.evaluate("""() => {
              const tray = document.getElementById('card-tray');
              Array.from(document.querySelectorAll('.word-input')).map(i => i.dataset.answer).forEach(a => {
                const btn = Array.from(tray.querySelectorAll('.wcard')).find(b => b.textContent === a && !b.disabled);
                if (btn) btn.click();
              });
            }""")
            page.wait_for_timeout(700)
            got = page.evaluate(READ_CH)
            ok = cards == 2 and got[2]["done"] == "typing"
            print(("PASS  " if ok else "FAIL  ") + "[도전] 카드 모드로도 완료(카드 %d장)" % cards)
            if not ok:
                fails.append("카드 모드")

            browser.close()
    finally:
        srv.terminate()
    print("\n%s" % ("모두 통과" if not fails else "실패 %d: %s" % (len(fails), ", ".join(fails))))
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
