# -*- coding: utf-8 -*-
"""
저녁 알림 토글 — 네이티브(iOS) 분기 회귀 시험 (2026-09-23, 0판).

⚠️ 이 시험이 있는 까닭 — 2026-09-16 에 setPushHour 에 네이티브 분기가 없어서
   아이폰 앱 쓰시는 분이 알림 시간을 바꿔도 서버에 **조용히 반영이 안 됐다**.
   실기기를 보기 전까지 아무도 몰랐다. setPushEvening 은 같은 모양의 함수라
   같은 사고가 그대로 재현될 수 있다. 그 자리를 지키는 것이 이 파일이다.

⚠️ isNativeApp() 은 window.Capacitor 를 **부를 때마다** 읽으므로 스텁이 먹는다.
⚠️ api 는 js/api.js 의 `const api = {...}` + `window.api = api` 라 같은 객체다 —
   window.api.updatePushEvening 을 덮으면 push.js 안의 api 도 함께 덮인다.

사용법:  python tests/push-evening-native.py
"""
import subprocess, sys, time
from playwright.sync_api import sync_playwright

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

ROOT = r"C:\Projects\bible-memorize-church-app-v2"
PORT = 8807
passed, failed = 0, 0


def chk(name, got, want):
    global passed, failed
    if got == want:
        print("  OK  %s = %r" % (name, got)); passed += 1
    else:
        print("  NG  %s = %r  (기대 %r)" % (name, got, want)); failed += 1


srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT)],
                       cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.5)
try:
    with sync_playwright() as p:
        br = p.chromium.launch()
        pg = br.new_page()
        pg.goto("http://localhost:%d/index.html" % PORT)
        pg.wait_for_function("typeof window.setPushEvening === 'function'", timeout=15000)

        print("■ 기본값은 켜짐이다")
        chk("getPushEvening()", pg.evaluate("getPushEvening()"), True)

        print("■ 끄면 localStorage 에 남고 다시 읽힌다")
        pg.evaluate("localStorage.setItem('pushEvening','0')")
        chk("getPushEvening()", pg.evaluate("getPushEvening()"), False)
        pg.evaluate("localStorage.removeItem('pushEvening')")
        chk("지운 뒤 기본값", pg.evaluate("getPushEvening()"), True)

        print("■ ⚠️ 네이티브 앱이면 updatePushEvening 을 부른다 (2026-09-16 사고 재발 방지)")
        got = pg.evaluate("""async () => {
          window.Capacitor = { isNativePlatform: () => true };
          window.loadUser = () => ({ user_id: 'u-test' });
          let called = null;
          window.api.updatePushEvening = (uid, on) => { called = [uid, on]; return { ok: true, on }; };
          const r = await setPushEvening(false);
          return { called, updated: r.updated, on: r.on,
                   stored: localStorage.getItem('pushEvening') };
        }""")
        chk("액션을 불렀나", got["called"], ["u-test", False])
        chk("updated", got["updated"], True)
        chk("on", got["on"], False)
        chk("localStorage", got["stored"], "0")

        print("■ 로그인 전이면 서버를 안 부르고 로컬만 남긴다")
        got = pg.evaluate("""async () => {
          window.Capacitor = { isNativePlatform: () => true };
          window.loadUser = () => null;
          let called = false;
          window.api.updatePushEvening = () => { called = true; return { ok: true }; };
          const r = await setPushEvening(true);
          return { called, updated: r.updated, stored: localStorage.getItem('pushEvening') };
        }""")
        chk("서버를 안 불렀나", got["called"], False)
        chk("updated", got["updated"], False)
        chk("localStorage", got["stored"], "1")

        br.close()
finally:
    srv.terminate()

print("\n통과 %d · 실패 %d" % (passed, failed))
sys.exit(0 if failed == 0 else 1)
