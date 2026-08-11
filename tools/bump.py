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

TAGGED = ["app.js", "style.css", "js/config.js", "js/api.js", "js/push.js"]


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

    new_tags = {}
    for path in TAGGED:
        pat = re.compile(re.escape(path) + r"\?v=([A-Za-z0-9]+)")
        m = pat.search(html)
        if not m:
            print("!! index.html에서 %s 태그를 찾지 못했습니다" % path)
            return 1
        tag = next_tag(m.group(1), today)
        new_tags[path] = tag
        html = pat.sub(path + "?v=" + tag, html)

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

    print("판 번호  %s" % ver)
    for path in TAGGED:
        print("  %-14s %s" % (path, new_tags[path]))
    print("APP_BUILD %s" % new_tags["app.js"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
