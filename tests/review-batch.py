# -*- coding: utf-8 -*-
"""
복습 큐 회귀 시험 — 「가장 오래 밀린 것부터 3구절씩」 (2026-09-23, 리뷰 지적 수정 포함).

예전에는 dueReviewNos 에 정렬이 아예 없어 Object.keys 의 정수 키 순회(사실상 구절
번호순)에 기대고 있었고, startReview 가 verses.filter 로 그 순서마저 덮었다.
그래서 번호가 큰 구절은 30일을 밀려도 차례가 안 왔다(2026-09-23 실측 456건).

⚠️ app.js 의 `verses` 는 최상위 `let` 이라 `window.verses = ...` 로는 안 보인다
   (window 프로퍼티와 전역 렉시컬 바인딩은 별개다 — 실측으로 확인함). 이 파일의
   모든 SEED 는 `verses = [...]` (전역 할당)로 심는다.

⚠️ REVIEW_BATCH=3 을 전제하는 갈래는 둘이다 — 「세 구절만 돌려준다」와 「동률 다섯 중 셋」.
   startReview 실사 갈래는 큐의 **첫 구절**만 보므로 상수와 무관하다.

⚠️ startReview 실사 갈래가 깨지면 먼저 두 가지를 보라 — `.test-ref-sticky` 클래스 이름이
   바뀌었는지, 스텁으로 덮는 함수들이 `function` 선언에서 화살표 상수로 바뀌었는지
   (`let`/`const` 로 선언되면 window 프로퍼티가 아니라 스텁이 조용히 무시된다).

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
  verses = [1,2,3,4,5].map(n => ({ no: n, ref: 'ref'+n, refShort: 'ref'+n, text: '말씀 ' + n, week: 1 }));
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

        # ⚠️ 2026-09-23 리뷰 지적 ① — 예전 「큐가 그 순서를 보존한다」 갈래는
        #    dueNos.map((no) => verses.find(...)) 를 이 시험 쪽에서 다시 흉내 내 쟀을
        #    뿐, startReview 를 한 번도 부르지 않았다. 그래서 app.js 의 큐 만드는 줄을
        #    옛 verses.filter((v) => dueNos.includes(v.no)) 로 되돌려도 이 갈래는 그대로
        #    통과했다(돌연변이 검증으로 확인 — 보고서 참고). 이제 실제로 startReview()
        #    를 불러 **화면에 그려진 첫 구절**을 본다.
        order = page.evaluate("""
        async () => {
          // renderReview 가 부르는 화면 부수 함수들을 막는다(review-card.py 와 같은 방식) —
          // 네트워크·다음 화면 전환 없이 첫 구절이 무엇으로 그려지는지만 본다.
          window.fillVerseHelp = () => {};
          window.fillSermonSummaryBtn = () => {};
          window.setupHeartCheck = () => {};
          window.initStickyRef = () => {};
          window.scrollPastBtnRow = () => {};
          window.postChallenge = () => {};
          window.advanceReview = () => {};
          window.reviewNext = () => {};

          verses = [1,2,3,4,5].map(n => ({ no: n, ref: 'ref'+n, refShort: 'ref'+n, text: '말씀 ' + n, week: 1 }));
          const r = {};
          r[1] = { level: 0, next: '2026-09-20' };
          r[2] = { level: 0, next: '2026-09-18' };
          r[3] = { level: 0, next: '2026-09-16' };
          r[4] = { level: 0, next: '2026-09-14' };
          r[5] = { level: 0, next: '2026-09-12' };  // 가장 오래 밀림
          localStorage.setItem('memorize-review', JSON.stringify(r));

          // await 가 반환 프라미스를 기다리므로, 돌아왔을 때 렌더는 끝나 있다.
          await startReview();
          const ref = document.querySelector('.test-ref-sticky');
          return ref ? ref.textContent : null;
        }
        """)
        check("startReview 가 실제로 그린 첫 구절이 가장 오래 밀린 것(no=5 → ref5)", order == "ref5", order)

        # 동률 다섯 중 번호 작은 셋만 남는다(= 자르기가 일어난다).
        # ⚠️ **이 갈래는 tie-break(비교 함수의 `a - b`)를 재지 못한다 — 원리상 못 잰다.**
        #    `Object.keys` 가 정수 키를 삽입 순서와 무관하게 오름차순으로 주고
        #    `Array.prototype.sort` 가 안정 정렬이라, `a - b` 를 `0` 으로 바꿔도 순서가 그대로다.
        #    즉 `a - b` 는 `dueReviewNos` 를 통해서는 관측할 수 없는 **방어용**이다.
        #    (재려면 비교 함수 자체를 꺼내 섞인 입력으로 불러야 하는데, 그만한 값어치가 없다.)
        # ⚠️ **「자르기가 정렬 뒤」를 지키는 것은 이 갈래가 아니라 위의 「가장 오래 밀린 것부터」다** —
        #    거기서 slice 를 sort 앞으로 옮기면 [3,2,1] 이 나와 FAIL 한다. 여기서는 전부 동률이라
        #    앞으로 옮겨도 [3,7,9] 그대로 통과한다.
        # ⚠️ 기대값 [3, 7, 9] 는 REVIEW_BATCH=3 을 전제한다 — 상수를 바꾸면 같이 바뀐다.
        same = page.evaluate("""
        () => {
          const r = {};
          r[15] = { level: 0, next: '2026-09-15' };
          r[3]  = { level: 0, next: '2026-09-15' };
          r[12] = { level: 0, next: '2026-09-15' };
          r[9]  = { level: 0, next: '2026-09-15' };
          r[7]  = { level: 0, next: '2026-09-15' };
          verses = [3,7,9,12,15].map(n => ({ no: n, ref: 'r'+n, refShort: 'r'+n, text: '말씀', week: 1 }));
          localStorage.setItem('memorize-review', JSON.stringify(r));
          return dueReviewNos();
        }
        """)
        check("동률 다섯 중 번호 작은 셋만 남는다 (3,7,9 · 12·15 는 잘림)", same == [3, 7, 9], same)

        # 아직 기한이 안 된 것은 안 나온다
        future = page.evaluate("""
        () => {
          const r = {};
          r[1] = { level: 0, next: '2099-01-01' };
          r[2] = { level: 0, next: '2026-09-10' };
          verses = [1,2].map(n => ({ no: n, ref: 'r'+n, refShort: 'r'+n, text: '말씀', week: 1 }));
          localStorage.setItem('memorize-review', JSON.stringify(r));
          return dueReviewNos();
        }
        """)
        check("기한이 안 된 것은 빠진다", future == [2], future)

        # ⚠️ 2026-09-23 리뷰 지적 ④ — 서버 due_at 이 null 이면 next 가 빈 문자열이 된다
        #    (mergeServerReviews). "" <= 오늘 이 참이라 「기한 지남」 판정 자체는 예전부터
        #    맞았지만, 이제는 정렬 첫째 열쇠라 빈 값이 사전식 비교에서 어떤 날짜 문자열보다
        #    작아(빈 문자열 < "2026-09-10") **항상 맨 앞**을 차지해 묶음 3자리 중 하나를
        #    계속 잡아먹는다 — 「언제인지 모른다」가 「가장 오래 밀렸다」로 둔갑하는 것.
        #    고친 뒤에는 빈 값을 오늘로 보아 실제로 오래 밀린 구절(2026-09-10·09-11)이
        #    앞에 서고, 빈 값(오늘 취급)은 그 뒤에 선다.
        empty_next = page.evaluate("""
        () => {
          const r = {};
          r[1] = { level: 0, next: '' };            // 서버 due_at null → 기한 모름
          r[2] = { level: 0, next: '2026-09-10' };  // 실제로 오래 밀림
          r[3] = { level: 0, next: '2026-09-11' };
          verses = [1,2,3].map(n => ({ no: n, ref: 'r'+n, refShort: 'r'+n, text: '말씀', week: 1 }));
          localStorage.setItem('memorize-review', JSON.stringify(r));
          return dueReviewNos();
        }
        """)
        check("next 가 빈 값이면 오늘로 보아 실제로 밀린 것 뒤에 선다 (2,3,1)", empty_next == [2, 3, 1], empty_next)

        browser.close()
finally:
    srv.terminate()

print()
print("모두 통과" if not fails else "실패 %d건: %s" % (len(fails), ", ".join(fails)))
sys.exit(1 if fails else 0)
