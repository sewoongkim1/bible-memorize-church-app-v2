"""옛 플레이스토어 앱(PWABuilder APK)과 새로 만든 앱의 설정이 같은지 본다.

쓰는 법:  python android-app/tools/manifest-parity.py <옛.apk> <새.apk>

왜: 업데이트는 성도님 폰의 앱을 **그대로 바꿔 끼운다.** 이름·색·알림 위임·권한·주소가 하나라도 어긋나면
    오류 없이 조용히 달라진다(예: 알림 위임이 꺼지면 아침 알림이 앱 이름으로 안 뜬다).
    다른 줄이 나오면 하나씩 읽고, 판 번호·SDK·위젯 받이처럼 **일부러 바꾼 것**만 남아야 한다.
    (2026-09-21 처음 돌렸을 때 이미 한 번 건졌다 — 앱 이름이 계획과 달리 「성경암송」이었다.)
"""
import difflib, glob, os, re, subprocess, sys

# Bubblewrap 이 만드는 값들 — 라이브러리 문자열 수백 개는 대조할 뜻이 없어 이것만 본다.
KEEP = {"appName", "launcherName", "launchUrl", "hostName", "colorPrimary", "colorPrimaryDark",
        "navigationColor", "navigationColorDark", "navigationDividerColor", "navigationDividerColorDark",
        "backgroundColor", "providerAuthority", "enableNotification", "splashScreenFadeOutDuration",
        "fallbackType", "enableSiteSettingsShortcut", "orientation", "webManifestUrl", "fullScopeUrl",
        "assetStatements"}


def aapt2():
    home = os.environ.get("ANDROID_HOME") or os.path.expanduser("~/.android-tools/sdk")
    found = sorted(glob.glob(os.path.join(home, "build-tools", "*", "aapt2*")))
    if not found:
        sys.exit("aapt2 를 못 찾았다 — ANDROID_HOME 을 확인할 것")
    return found[-1]


def run(*args):
    return subprocess.run([aapt2(), *args], capture_output=True, text=True,
                          encoding="utf-8", errors="replace").stdout


def badging(apk):
    # application-label-xx(언어별 같은 이름 80여 줄)는 빼고 기본 라벨만 본다
    keep = ("package:", "minSdkVersion", "targetSdkVersion", "application-label:", "uses-permission",
            "launchable-activity")
    return sorted(l.strip() for l in run("dump", "badging", apk).splitlines() if l.startswith(keep))


def manifest(apk):
    out = run("dump", "xmltree", "--file", "AndroidManifest.xml", apk)
    out = re.sub(r"@0x7f[0-9a-f]{6}", "@res", out)      # 리소스 번호는 빌드마다 다르다
    out = re.sub(r"\s*\(Raw: [^)]*\)", "", out)
    out = re.sub(r" \(line=\d+\)", "", out)              # 받이 하나만 더해도 뒤의 줄 번호가 다 밀린다
    return [l.rstrip() for l in out.splitlines() if l.strip()]


def resources(apk):
    rows, cur = [], None
    for line in run("dump", "resources", apk).splitlines():
        m = re.match(r"\s*resource 0x[0-9a-f]+ (string|color|bool|integer)/(\S+)", line)
        if m:
            cur = m.group(1) + "/" + m.group(2) if m.group(2) in KEEP or m.group(2).startswith("shortcut_") else None
            continue
        if cur and line.strip().startswith("("):
            rows.append(cur + " = " + line.split(")", 1)[1].strip())
            cur = None
    return sorted(rows)


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    old, new = sys.argv[1], sys.argv[2]
    for title, fn in (("badging", badging), ("resources", resources), ("manifest", manifest)):
        diff = [d for d in difflib.unified_diff(fn(old), fn(new), "옛 앱", "새 앱", lineterm="", n=0)
                if not d.startswith(("+++", "---", "@@"))]
        print("==== %s: %s" % (title, "같다" if not diff else "%d줄 다르다" % len(diff)))
        for d in diff:
            print(d)


if __name__ == "__main__":
    main()
