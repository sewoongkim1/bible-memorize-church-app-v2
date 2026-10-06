# -*- coding: utf-8 -*-
"""배포 전 캐시 태그·판 번호를 한 번에 올린다.

    python tools/bump.py

  하는 일
    · index.html의 app.js/style.css/js/*.js `?v=` 태그를 오늘 날짜+다음 글자로
    · 스플래시 `.splash-ver` +0.001 (소수점 세 자리 유지)
    · app.js의 APP_BUILD를 새 app.js 태그와 같게

  태그를 하나라도 빠뜨리면 브라우저에 옛 파일이 남는다. 손으로 고치지 말고
  이 스크립트를 쓴다. APP_BUILD가 어긋나면 앱이 스스로 다시 받아 오지만,
  그건 마지막 안전장치이지 정상 경로가 아니다.
"""
import io
import os
import re
import sys
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INDEX = os.path.join(ROOT, "index.html")
APP = os.path.join(ROOT, "app.js")

# ⚠️ index.html 에 js/*.js?v= 를 더하면 여기에도 더한다 — tools/preflight.py [2-1] 이 둘을 맞대 본다.
TAGGED = ["app.js", "style.css", "js/config.js", "js/api.js", "js/push.js", "js/psalm.js",
          "js/events.js", "js/edu.js", "js/duty.js"]


def next_tag(cur, today):
    """20260811t → 20260811u, 날짜가 바뀌었으면 오늘+a"""
    m = re.match(r"^(\d{8})([a-z]*)$", cur or "")
    if not m or m.group(1) != today:
        return today + "a"
    letters = m.group(2) or "a"
    # a→b … z→aa (하루 26번을 넘겨도 이어진다)
    chars = list(letters)
    i = len(chars) - 1
    while i >= 0:
        if chars[i] != "z":
            chars[i] = chr(ord(chars[i]) + 1)
            return today + "".join(chars)
        chars[i] = "a"
        i -= 1
    return today + "a" + "".join(chars)


def main():
    today = date.today().strftime("%Y%m%d")
    html = io.open(INDEX, encoding="utf-8").read()

    # 태그는 **하나만** 셈한다 — 오늘 태그 가운데 가장 앞선 것의 다음 값을 모든 경로에 쓴다(2026-10-06).
    #   경로마다 제 태그에서 따로 셈하면, 가지를 합치다 한 줄만 옛 태그로 남았을 때 bump 를 다시 돌려도 계속 갈려
    #   preflight [2] 가 배포를 막는다(같은 날에는 손으로 맞추기 전까지 안 풀린다). 평소(모두 같은 태그)에는 전과 똑같이 돈다.
    pats, cur = {}, []
    for path in TAGGED:
        pats[path] = re.compile(re.escape(path) + r"\?v=([A-Za-z0-9]+)")
        m = pats[path].search(html)
        if not m:
            print("!! index.html에서 %s 태그를 찾지 못했습니다" % path)
            return 1
        cur.append(m.group(1))
    todays = [t for t in cur if re.match(r"^%s[a-z]*$" % today, t)]
    tag = next_tag(max(todays, key=lambda t: (len(t), t)) if todays else "", today)
    new_tags = {}
    for path in TAGGED:
        new_tags[path] = tag
        html = pats[path].sub(path + "?v=" + tag, html)

    # 스플래시 판 번호 +0.001 (소수점 세 자리 유지)
    m = re.search(r'class="splash-ver">v(\d+)\.(\d+)<', html)
    if not m:
        print("!! .splash-ver를 찾지 못했습니다")
        return 1
    major, minor = int(m.group(1)), m.group(2)
    ver = "v%d.%03d" % (major, int(minor) + 1) if len(minor) == 3 else None
    if ver is None:
        print("!! 판 번호가 소수점 세 자리가 아닙니다: %s" % m.group(0))
        return 1
    html = re.sub(r'class="splash-ver">v[\d.]+<', 'class="splash-ver">%s<' % ver, html)
    io.open(INDEX, "w", encoding="utf-8").write(html)

    # app.js의 빌드 번호를 새 태그와 맞춘다
    app = io.open(APP, encoding="utf-8").read()
    if 'const APP_BUILD = "' not in app:
        print("!! app.js에 APP_BUILD가 없습니다")
        return 1
    app = re.sub(r'const APP_BUILD = "[^"]*";',
                 'const APP_BUILD = "%s";' % new_tags["app.js"], app, count=1)
    io.open(APP, "w", encoding="utf-8").write(app)

    # admin.html이 부르는 admin-stats.html 태그도 함께(빠뜨리면 관리자 화면이 옛것)
    admin = os.path.join(ROOT, "admin.html")
    if os.path.exists(admin):
        a = io.open(admin, encoding="utf-8").read()
        m = re.search(r"admin-stats\.html\?v=([A-Za-z0-9]+)", a)
        if m:
            tag = next_tag(m.group(1), today)
            a = re.sub(r"admin-stats\.html\?v=[A-Za-z0-9]+", "admin-stats.html?v=" + tag, a)
            io.open(admin, "w", encoding="utf-8").write(a)
            new_tags["admin-stats.html"] = tag

    print("판 번호  %s" % ver)
    for path in sorted(new_tags):
        print("  %-18s %s" % (path, new_tags[path]))
    print("APP_BUILD %s" % new_tags["app.js"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
