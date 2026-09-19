# -*- coding: utf-8 -*-
"""
아이폰 위젯 대조 시험 — 서버가 위젯에 주는 것이 **앱 화면과 같은가**.
(2026-09-20 · 설계 docs/superpowers/specs/2026-09-20-ios-widgets-design.md)

위젯은 서버 액션 셋(getWeeklyVerse · getTodayMeditation · getTodayBlessing)이 계산한 것을 그리기만 한다.
그 규칙은 app.js 에도 있다(두 곳). 여기서는 **운영 사이트를 로그인 없이(읽기만)** 열고,
한국 시간대 · 고정 시계로 날짜를 하루씩 옮기며 **웹의 함수 그대로** 고른 결과와 서버의 date= 결과를
한 글자까지 견준다.

웹 쪽에서 쓰는 함수: getWeeklyVerseInfo · loadSermons · findSermonForVerse · sermonCycleStarted ·
sermonHasMeditationContent · buildWeeklyMeditations · kstDateParts · loadPrayers · prayToday · prayFill.
⚠️ 그 함수들을 잇는 몇 줄(아래 WEB_PICK)은 app.js maybeShowWeeklyMeditation 을 옮겨 적은 것이다 —
   그 함수를 고치면 여기도 함께 고친다.

사용법:  python tests/widget-parity.py [시작일 YYYY-MM-DD] [일수]
         기본: 오늘(한국) 7일 전부터 14일
준비물:  pip 의 playwright(설치된 크롬을 channel="chrome" 으로 쓴다)
"""
import datetime as dt
import json
import sys
import urllib.error
import urllib.request

from playwright.sync_api import sync_playwright

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

SITE = "https://gocheok.onlybible.kr/"
API = "https://xnomlgydifiqiybervtf.supabase.co/functions/v1/api"
KEY = "sb_publishable_oLtieT_jw7Gjb8etEsy0jw_thBaDjl-"
KST = dt.timezone(dt.timedelta(hours=9))
NAME = "우리 가족"

WEB_PICK = r"""
async (name) => {
  const strip = (s) => String(s || "").replace(/\*\*([^*]+)\*\*/g, "$1");
  const info = getWeeklyVerseInfo();
  const out = { weeklyNo: info && info.verse ? info.verse.no : null };
  // ── app.js maybeShowWeeklyMeditation 의 고르는 부분 그대로 ──
  const sermons = await loadSermons();
  const p = kstDateParts() || {};
  const todayDow = p.y ? new Date(p.y, (p.m || 1) - 1, p.d || 1).getDay() : (kstDayNumber() % 7);
  let verse = info.verse;
  let sermon = findSermonForVerse(verse.no, sermons);
  let usingPrev = false;
  if (!sermonCycleStarted(sermon, p) && info.prevVerse) {
    const pv = info.prevVerse;
    const ps = findSermonForVerse(pv.no, sermons);
    if (sermonHasMeditationContent(ps)) { verse = pv; sermon = ps; usingPrev = true; }
  }
  const items = buildWeeklyMeditations(verse, sermon);
  const dayIdx = (todayDow + 6) % 7;
  const it = items.length ? items[dayIdx % items.length] : null;
  out.med = it ? { heading: strip(it.heading), message: strip(it.message), question: strip(it.question),
                   usingPrev, sermonTitle: sermon ? (sermon.title || "") : "" } : null;
  // ── 기도문: 앱의 「오늘 한 편」 ──
  const list = await loadPrayers();
  const b = list[prayToday(list.length)];
  out.bless = b ? { no: b.no, title: b.title, ref: b.ref, prayer: prayFill(b.prayer, name) } : null;
  return out;
}
"""


def api(action, date):
    body = json.dumps({"action": action, "date": date}).encode("utf-8")
    req = urllib.request.Request(API, data=body, method="POST", headers={
        "Content-Type": "application/json", "apikey": KEY, "Authorization": "Bearer " + KEY})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:          # 모르는 액션(400) 등 — 멈추지 말고 FAIL 로 보이게
        try:
            return json.loads(e.read().decode("utf-8"))
        except Exception:
            return {"error": "HTTP %s" % e.code}


def main():
    today = dt.datetime.now(KST).date()
    start = dt.date.fromisoformat(sys.argv[1]) if len(sys.argv) > 1 else today - dt.timedelta(days=7)
    days = int(sys.argv[2]) if len(sys.argv) > 2 else 14
    fails = 0
    checks = 0
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel="chrome", headless=True)
        ctx = browser.new_context(timezone_id="Asia/Seoul", locale="ko-KR", service_workers="block")
        for k in range(days):
            day = start + dt.timedelta(days=k)
            ymd = day.isoformat()
            page = ctx.new_page()
            # 그날 한낮(한국) — 날짜 경계에서 흔들리지 않게
            page.clock.set_fixed_time(dt.datetime(day.year, day.month, day.day, 12, 0, tzinfo=KST))
            page.goto(SITE, wait_until="networkidle")
            page.wait_for_function("typeof getWeeklyVerseInfo === 'function' && verses.length > 0", timeout=20000)
            web = page.evaluate(WEB_PICK, NAME)
            page.close()

            wv, med, bl = api("getWeeklyVerse", ymd), api("getTodayMeditation", ymd), api("getTodayBlessing", ymd)
            row = []

            def same(label, a, b):
                nonlocal fails, checks
                checks += 1
                if a != b:
                    fails += 1
                    row.append("✗ %s\n      웹  : %r\n      서버: %r" % (label, a, b))

            same("이번주 말씀 번호", web["weeklyNo"], wv.get("no"))
            if web["med"] is None:
                same("묵상(웹에 없음 → 서버 ready:false)", False, med.get("ready"))
            else:
                for f in ("heading", "message", "question", "usingPrev", "sermonTitle"):
                    same("묵상 " + f, web["med"][f], med.get(f))
            if web["bless"] is None:
                same("기도문(웹에 없음)", None, bl.get("no"))
            else:
                for f in ("no", "title", "ref", "prayer"):
                    same("기도문 " + f, web["bless"][f], bl.get(f))
            dow = "월화수목금토일"[day.weekday()]
            head = "%s(%s) 말씀 %s · 묵상 %s%s · 기도문 %s" % (
                ymd, dow, wv.get("no"), med.get("dayLabel"), "(지난주)" if med.get("usingPrev") else "", bl.get("no"))
            print(("PASS  " if not row else "FAIL  ") + head)
            for r in row:
                print("    " + r)
        browser.close()
    print("\n%d/%d 일치" % (checks - fails, checks))
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
