# -*- coding: utf-8 -*-
"""
단계 완료 창의 「다음」 회귀 시험 (2026-09-24).

이번 주 말씀은 목록(verses, no 오름차순)의 **맨 마지막**이다. 「다음」을 번호순 +1 로 찾으면
언제나 없어서, 첫 구절을 막 마친 분이 주 단추로 「↺ 처음 말씀으로」(9개월 전 구절)를 봤다.
설계 docs/superpowers/specs/2026-09-23-first-day-next-verse-design.md ⑥.

사용법:  python tests/stage-done.py
"""
import subprocess, sys, time
from playwright.sync_api import sync_playwright

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

ROOT = r"C:\Projects\bible-memorize-church-app-v2"
PORT = 8803

# 완료 창을 띄운다 — done: 3단계를 마친 구절 번호들, cur: 방금 마친 구절, stage, first
OPEN = """
({ done, cur, stage, first }) => {
  document.querySelectorAll('.cheer-overlay').forEach((e) => e.remove());
  verses = [1, 2, 3, 4, 5].map((n) => ({ no: n, ref: 'r' + n, refShort: 'r' + n, text: '말씀 ' + n, week: n }));
  const p = {};
  done.forEach((n) => { p[n] = { stage: 3 }; });
  localStorage.setItem(progressKey('ko'), JSON.stringify(p));
  window.__started = null;
  window.startTest = (v) => { window.__started = v.no; };
  window.renderTestScreen = (v, s) => { window.__started = 'stage' + s; };
  showStageDoneModal(verses.find((v) => v.no === cur), stage, first);
  return document.getElementById('sd-main').textContent.trim();
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
        # 개발 DB 요청을 즉시 끊는다 — 이유는 tests/review-card.py 의 같은 줄 주석
        page.route("https://ktpwthwqzgcqcrmsafdo.supabase.co/**", lambda route: route.abort())
        page.goto(f"http://localhost:{PORT}/", wait_until="load")
        page.wait_for_selector(".intro-screen, .entry-screen, .summary-screen, .error", timeout=10000)
        page.wait_for_timeout(300)

        def check(name, cond, extra=""):
            print(("PASS  " if cond else "FAIL  ") + name + ("" if cond else "  " + str(extra)))
            if not cond:
                fails.append(name)

        def open_modal(done, cur, stage=3, first=False):
            return page.evaluate(OPEN, {"done": done, "cur": cur, "stage": stage, "first": first})

        def press_main():
            page.locator("#sd-main").click()
            page.wait_for_timeout(100)
            return page.evaluate("() => window.__started")

        # ① 이번 주 구절(맨 마지막 5)을 처음으로 마치면 「처음 말씀으로」가 아니다
        label = open_modal(done=[5], cur=5, first=True)
        check("① 맨 마지막 구절을 마치면 「↺ 처음 말씀으로」가 아니다", "처음 말씀" not in label, label)

        # ② 다음은 안 외운 것 중 no 가 가장 큰 것 — 4 를 외워 두면 3 으로 간다
        open_modal(done=[5, 4], cur=5)
        went = press_main()
        check("② 다음 = 안 외운 것 중 가장 최근(4를 건너 3)", went == 3, went)

        # ③ 첫 구절이면 「이어서 한 구절 더 ▶」
        label = open_modal(done=[5], cur=5, first=True)
        check("③ 첫 구절이면 「이어서 한 구절 더 ▶」", label == "이어서 한 구절 더 ▶", label)

        # ④ 첫 구절이 아니면 「다음 말씀 ▶」
        label = open_modal(done=[5, 2], cur=5, first=False)
        check("④ 첫 구절이 아니면 「다음 말씀 ▶」", label == "다음 말씀 ▶", label)

        # ⑤ 전부 외웠으면 「↺ 처음 말씀으로」 — 누르면 1번
        label = open_modal(done=[1, 2, 3, 4, 5], cur=5)
        check("⑤ 전부 외웠으면 「↺ 처음 말씀으로」", label == "↺ 처음 말씀으로", label)
        went = press_main()
        check("⑤ 그때 누르면 1번으로", went == 1, went)

        # ⑥ 1·2단계 완료 창은 그대로 「N+1단계로 계속하기」
        label = open_modal(done=[], cur=5, stage=1)
        check("⑥ 1단계면 「2단계로 계속하기」", label == "2단계로 계속하기", label)
        went = press_main()
        check("⑥ 누르면 같은 구절 2단계", went == "stage2", went)

        # ⑦ 중간 구절을 마쳐도 더 최근의 안 외운 것으로 간다(번호순 +1 이 아니다)
        open_modal(done=[2], cur=2)
        went = press_main()
        check("⑦ 2를 마치면 3이 아니라 가장 최근인 5로", went == 5, went)

        # ⑧ ★ 다 외우신 분은 번호순 다음으로 — 1번을 마치고 「처음 말씀으로」(= 같은 1번)에 갇히면 안 된다
        #    (2026-09-25 제보: 38구절을 다 외우신 분이 1번에서 계속 「↺ 처음 말씀으로」)
        label = open_modal(done=[1, 2, 3, 4, 5], cur=1)
        check("⑧ 다 외우고 1번을 마치면 「다음 말씀 ▶」", label == "다음 말씀 ▶", label)
        went = press_main()
        check("⑧ 그때 누르면 2번으로", went == 2, went)
        open_modal(done=[1, 2, 3, 4, 5], cur=3)
        went = press_main()
        check("⑧ 다 외우고 3번을 마치면 4번으로", went == 4, went)

        browser.close()
finally:
    srv.terminate()

print()
print("모두 통과" if not fails else f"실패 {len(fails)}건: {fails}")
sys.exit(1 if fails else 0)
