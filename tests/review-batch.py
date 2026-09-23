# -*- coding: utf-8 -*-
"""
복습 큐 회귀 시험 — 「가장 오래 밀린 것부터 3구절씩」 (2026-09-23).

예전에는 dueReviewNos 에 정렬이 아예 없어 Object.keys 의 정수 키 순회(사실상 구절
번호순)에 기대고 있었고, startReview 가 verses.filter 로 그 순서마저 덮었다.
그래서 번호가 큰 구절은 30일을 밀려도 차례가 안 왔다(2026-09-23 실측 456건).

사용법:  python tests/review-batch.py
"""
import subprocess, sys, time
from playwright.sync_api import sync_playwright

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

ROOT = r"C:\Projects\bible-memorize-church-app-v2"
PORT = 8803

# 구절 다섯 개. 밀린 정도를 일부러 번호와 **반대로** 준다 —
# no=5 가 가장 오래 밀렸고 no=1 이 가장 덜 밀렸다.
SEED = """
() => {
  window.verses = [1,2,3,4,5].map(n => ({ no: n, ref: 'ref'+n, refShort: 'ref'+n, text: '말씀 ' + n, week: 1 }));
  const r = {};
  //           no:   기한(next)  — 작을수록 오래 밀린 것
  r[1] = { level: 0, next: '2026-09-20' };
  r[2] = { level: 0, next: '2026-09-18' };
  r[3] = { level: 0, next: '2026-09-16' };
  r[4] = { level: 0, next: '2026-09-14' };
  r[5] = { level: 0, next: '2026-09-12' };
  localStorage.setItem('memorize-review', JSON.stringify(r));
  return dueReviewNos();
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
        # 개발 DB(Supabase)로 나가는 요청을 끊는다 — review-card.py 에서 배운 방식.
        # app.js 파일 맨 끝의 loadVerses() 가 이 상자 안에서 들쭉날쭉하게(몇백ms~십수초)
        # 실패/성공하며 window.verses 를 덮어써 시험이 흔들렸다. abort() 로 항상 같은
        # (빠른) 길로 만들고, DOM 으로 부트스트랩 완료를 기다린 뒤 SEED 를 심는다.
        page.route("https://ktpwthwqzgcqcrmsafdo.supabase.co/**", lambda route: route.abort())
        page.goto(f"http://localhost:{PORT}/", wait_until="load")
        page.wait_for_selector(".intro-screen, .entry-screen, .summary-screen, .error", timeout=10000)

        def check(name, cond, extra=""):
            print(("PASS  " if cond else "FAIL  ") + name + ("" if cond else "  실제 " + str(extra)))
            if not cond:
                fails.append(name)

        nos = page.evaluate(SEED)
        check("세 구절만 돌려준다", len(nos) == 3, nos)
        check("가장 오래 밀린 것부터 (5,4,3)", nos == [5, 4, 3], nos)

        # 큐 순서가 verses 배열 순으로 덮이지 않는지
        queue = page.evaluate("""
        () => {
          const dueNos = dueReviewNos();
          const q = dueNos.map((no) => verses.find((v) => v.no === no)).filter(Boolean);
          return q.map(v => v.no);
        }
        """)
        check("큐가 그 순서를 보존한다", queue == [5, 4, 3], queue)

        # 기한이 같으면 구절 번호순
        same = page.evaluate("""
        () => {
          const r = {};
          r[7] = { level: 0, next: '2026-09-15' };
          r[3] = { level: 0, next: '2026-09-15' };
          r[9] = { level: 0, next: '2026-09-15' };
          window.verses = [3,7,9].map(n => ({ no: n, ref: 'r'+n, refShort: 'r'+n, text: '말씀', week: 1 }));
          localStorage.setItem('memorize-review', JSON.stringify(r));
          return dueReviewNos();
        }
        """)
        check("기한이 같으면 구절 번호순 (3,7,9)", same == [3, 7, 9], same)

        # 아직 기한이 안 된 것은 안 나온다
        future = page.evaluate("""
        () => {
          const r = {};
          r[1] = { level: 0, next: '2099-01-01' };
          r[2] = { level: 0, next: '2026-09-10' };
          window.verses = [1,2].map(n => ({ no: n, ref: 'r'+n, refShort: 'r'+n, text: '말씀', week: 1 }));
          localStorage.setItem('memorize-review', JSON.stringify(r));
          return dueReviewNos();
        }
        """)
        check("기한이 안 된 것은 빠진다", future == [2], future)

        browser.close()
finally:
    srv.terminate()

print()
print("모두 통과" if not fails else "실패 %d건: %s" % (len(fails), ", ".join(fails)))
sys.exit(1 if fails else 0)
