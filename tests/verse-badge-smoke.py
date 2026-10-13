"""이번주 말씀 위젯 머리말 「🐑 3일째」 스모크(2026-10-13) — 공개 키로 getWeeklyVerse 를 불러 badge 를 견준다(읽기만).

사용법:  python tests/verse-badge-smoke.py          개발(ktpwthwqzgcqcrmsafdo)
         python tests/verse-badge-smoke.py --prod   운영
보는 것:  ① date 없이 — badgeDate 가 오늘(한국) · 며칠째가 getVerses 의 시작일로 셈한 것과 같다
          ② date = 그 구절 시작일 — 「새 말씀」으로 끝난다
          ③ 이모지가 있나(없으면 「AI 채움 대기」로 알리고, 15초 뒤 한 번 더 부른다)
⚠️ verses.date 는 UTC 로 적혀 있다(2026-10-10T15:00:00+00:00 = 한국 10-11) — 앞 10글자를 그대로 읽지 말고 한국 시간으로 바꾼다.
"""
import datetime as D
import json
import sys
import time
import urllib.request

PROD = "--prod" in sys.argv
URL = ("https://xnomlgydifiqiybervtf" if PROD else "https://ktpwthwqzgcqcrmsafdo") + ".supabase.co/functions/v1/api"
KEY = "sb_publishable_oLtieT_jw7Gjb8etEsy0jw_thBaDjl-" if PROD else "sb_publishable_eJKP6u95IU9_DBXTvnvYBA_-yGCf-0Y"
KST = D.timezone(D.timedelta(hours=9))


def call(body):
    req = urllib.request.Request(URL, data=json.dumps(body).encode("utf-8"), method="POST",
                                 headers={"apikey": KEY, "Authorization": "Bearer " + KEY,
                                          "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    today = D.datetime.now(KST).date()
    verses = {int(v["no"]): v for v in call({"action": "getVerses"}).get("verses", [])}
    w = call({"action": "getWeeklyVerse"})
    no = w.get("no")
    raw = (verses.get(int(no)) or {}).get("date") if no is not None else None
    start = D.datetime.fromisoformat(raw).astimezone(KST).date() if raw else None
    print(f"[{'운영' if PROD else '개발'}] 이번 구절 {no} · 시작 {start} · badge {w.get('badge')!r} · badgeDate {w.get('badgeDate')!r}")
    bad = []
    if w.get("badgeDate") != today.isoformat():
        bad.append(f"① badgeDate {w.get('badgeDate')} ≠ 오늘 {today}")
    if start and start <= today:
        n = (today - start).days + 1
        want = "새 말씀" if n == 1 else f"{n}일째"
        if not str(w.get("badge", "")).endswith(want):
            bad.append(f"① badge 끝이 {want!r} 가 아니다")
        first = call({"action": "getWeeklyVerse", "date": start.isoformat()})
        if first.get("no") == no and not str(first.get("badge", "")).endswith("새 말씀"):
            bad.append(f"② 시작일({start}) badge {first.get('badge')!r} — 「새 말씀」이 아니다")
    if " " not in str(w.get("badge", "")):
        print("③ 이모지 없음 — AI 채움 대기 · 15초 뒤 다시")
        time.sleep(15)
        again = call({"action": "getWeeklyVerse"})
        print(f"③ 다시: badge {again.get('badge')!r}")
    print("통과" if not bad else "실패:\n  " + "\n  ".join(bad))
    sys.exit(1 if bad else 0)


main()
