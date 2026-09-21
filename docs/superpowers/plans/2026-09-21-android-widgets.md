# 안드로이드 위젯 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 지금 플레이스토어 앱(TWA)과 같은 안드로이드 프로젝트를 소스째 만들고, 아이폰과 같은 위젯 셋
(이번주 말씀 · 오늘의 묵상 · 오늘의 축복 기도문)을 더해 친구 폰에서 시험판으로 확인한다. 업로드는 9/27 이후.

**Architecture:** `@bubblewrap/core` 를 Node 스크립트로 한 번 불러 `android-app/` 에 TWA Gradle 프로젝트를 만든다
(대화형 질문이 없도록 명령줄 도구 대신). 위젯은 `kr.onlybible.gocheok.memorize.widget` 패키지에 Java 로 짓는다 —
안드로이드에 기대지 않는 규칙(`WidgetLogic`)은 JVM 단위 시험으로 먼저 굳히고, 받아 오기·그리기·예약은
`BaseWidgetProvider` 하나가 맡고 위젯 셋은 그것을 잇는다. 서버·웹은 고치지 않는다.

**Tech Stack:** @bubblewrap/core 1.25.0 · Android Gradle Plugin 8.9.1 · Gradle 8.11.1 · compileSdk/targetSdk 36 ·
Java(소스 1.8) · AppWidgetProvider + RemoteViews · AlarmManager(RTC) · SharedPreferences · JUnit 4 + org.json(JVM 시험) ·
JDK 17(Temurin) · Android SDK 명령줄 도구 · adb.

**설계:** `docs/superpowers/specs/2026-09-21-android-widgets-design.md` — 이 계획의 모든 작업은 그 문서를 따른다.

## Global Constraints

- ⚠️ **9/27 프로덕션 승인 전에는 Play Console 에 아무것도 올리지 않는다.** Task 8 만 업로드하며, 그 전에는 시작하지 않는다.
- ⚠️ **서명 키(`*.keystore`)·비밀번호·`signing-key-info.txt`·`keystore.properties` 는 절대 커밋하지 않는다.** 저장소는 공개이고
  사이트 배포(`deploy.yml` `path: "."`)가 저장소 전체를 올린다. 비밀번호는 화면(대화)에도 찍지 않는다.
- ⚠️ 위젯을 더한 뒤에는 **`bubblewrap update` · `generate.cjs` 를 다시 돌리지 않는다**(고친 파일을 덮어쓴다).
- 정식 패키지 `kr.onlybible.gocheok.memorize` · 시험판 `kr.onlybible.gocheok.memorize.dev`(`applicationIdSuffix ".dev"`).
  Java namespace 는 둘 다 `kr.onlybible.gocheok.memorize`, 위젯 코드는 `kr.onlybible.gocheok.memorize.widget`.
- 사이트 `https://gocheok.onlybible.kr` · API `https://xnomlgydifiqiybervtf.supabase.co/functions/v1/api` ·
  공개 키 `sb_publishable_oLtieT_jw7Gjb8etEsy0jw_thBaDjl-`(앱 코드에 이미 있는 공개 값). 위젯은 **읽기 전용 공개 액션**만 부르므로
  시험판도 운영을 본다(개발 DB 는 비어 있다).
- 서버 액션: `getWeeklyVerse` → `{no, ref, text, prev}`(ok 칸 없음) · `getTodayMeditation` → `{ok, ready, date, dayLabel, heading,
  message, question, sermonTitle, usingPrev}` · `getTodayBlessing` → `{ok, date, no, title, ref, prayer}`. 셋 다 선택 입력 `date`.
- 위젯 규칙(아이폰과 같다): 4×2 보다 작게 못 줄인다 · 교회 마크는 이름 옆에만(워터마크 금지) · 묵상은 본문만(본문이 비면 질문) ·
  새로 고침 = 다음 KST 자정(묵상은 자정과 +6시간 중 이른 때) · 실패 = 마지막 성공분을 보이고 +30분 뒤 재시도 ·
  실패 문구 「말씀을 불러오지 못했습니다」「묵상을 불러오지 못했습니다」「기도문을 불러오지 못했습니다」.
- 정확한 시각 알람(`setExact*`, `SCHEDULE_EXACT_ALARM`)은 쓰지 않는다. 위젯은 `user_id`·개인정보를 보내지도 담지도 않는다.
- 도구 자리(저장소 밖): JDK `C:\Users\sewki\.android-tools\jdk-17` · SDK `C:\Users\sewki\.android-tools\sdk` ·
  옛 앱 기록 `C:\Users\sewki\.android-tools\old-app\`. Git Bash 에서는 매번 아래를 먼저 적는다:
  ```bash
  export JAVA_HOME="/c/Users/sewki/.android-tools/jdk-17"
  export ANDROID_HOME="/c/Users/sewki/.android-tools/sdk"
  export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
  ```
- 시험용 날짜(가장 긴 글이 뜨는 날, 운영 서버로 확인함): `2026-04-20` 말씀 16번 삼상 26:24 **69자** ·
  `2026-09-13` 묵상 **117자** · `2026-10-10` 기도문 40번 「순종의 축복」 **245자**.
- 커밋은 내 경로만: `git add -- <새 파일>` 뒤 `git commit -F - -- <경로들>`. 메시지는 한글, 끝에
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`. 푸시는 `git push -q origin main`.
  `android-app/` 은 웹 파일이 아니라 `python tools/bump.py` 는 돌리지 않는다.

---

## 파일 지도

| 파일 | 맡는 일 |
|---|---|
| `android-app/tools/package.json` · `generate.cjs` | Bubblewrap core 로 뼈대를 한 번 만든다(Task 2) |
| `android-app/tools/manifest-parity.py` | 옛 APK 와 새 APK 의 설정(패키지·이름·색·권한·매니페스트)을 대조 |
| `android-app/.gitignore` | 빌드 결과·로컬 설정·키를 git 에서 뺀다 |
| (Bubblewrap 이 만든 것) `build.gradle` · `settings.gradle` · `gradlew*` · `app/…` · `twa-manifest.json` | TWA 앱 자체 |
| `app/build.gradle`(수정) | 시험·JVM 시험 의존성, `buildConfig`, 시험판/정식판 두 벌(`dev`/`prod`), `WIDGET_DATE` |
| `app/src/main/AndroidManifest.xml`(수정) | 위젯 받이(receiver) 셋 등록 |
| `widget/WidgetLogic.java` | 안드로이드에 기대지 않는 규칙 — 시각 계산·유효성·주소·요청 본문·모양 고르기 |
| `widget/WidgetApi.java` | 서버 POST 한 번 → `JSONObject` 또는 `null` |
| `widget/WidgetStore.java` | 위젯별 마지막 성공 응답 저장·읽기(SharedPreferences) |
| `widget/BaseWidgetProvider.java` | 받아 오기 → 그리기 → 다음 새로 고침 예약 · 누르면 앱 열기 |
| `widget/VerseWidget.java` · `MeditationWidget.java` · `BlessingWidget.java` | 위젯별 액션·모양 |
| `res/layout/widget_verse_medium.xml` · `widget_verse_large.xml` · `widget_meditation.xml` · `widget_blessing.xml` | 모양 |
| `res/xml/widget_verse_info.xml` · `widget_meditation_info.xml` · `widget_blessing_info.xml` | 크기·새로 고침 주기·미리보기 |
| `res/values/widget_strings.xml` · `widget_colors.xml` · `res/values-night/widget_colors.xml` · `res/drawable/widget_bg.xml` · `res/drawable-nodpi/church_mark.png` | 글·색·바탕·마크 |
| `app/src/test/java/…/widget/WidgetLogicTest.java` · `WidgetApiLiveTest.java` | JVM 시험 |

(`app/…` 는 `android-app/app/…`, `widget/…` 는 `android-app/app/src/main/java/kr/onlybible/gocheok/memorize/widget/…`)

---

### Task 1: 이 PC 에 빌드 도구 설치 + 지금 앱의 설정 읽기

저장소에는 아무것도 안 남는다(커밋 없음). 끝나면 `java 17` · `sdkmanager` · `adb` · `aapt2` 가 돌고, 지금 플레이스토어
앱(PWABuilder APK)의 설정이 `old-app/` 에 적혀 있다.

**Files:** (저장소 밖) `C:\Users\sewki\.android-tools\{jdk-17, sdk, old-app}`

**Interfaces:**
- Produces: 위 도구 경로(Global Constraints) · `old-app/badging.txt` · `old-app/manifest.txt` · `old-app/resources.txt`
  (Task 2 가 twa-manifest 값을 맞출 때 읽는다)

- [ ] **Step 1: JDK 17 받기(PowerShell)**

```powershell
$T = "$env:USERPROFILE\.android-tools"
New-Item -ItemType Directory -Force $T | Out-Null
Invoke-WebRequest "https://api.adoptium.net/v3/binary/latest/17/ga/windows/x64/jdk/hotspot/normal/eclipse" -OutFile "$T\jdk17.zip"
Expand-Archive "$T\jdk17.zip" -DestinationPath "$T\jdk-tmp" -Force
Move-Item (Get-ChildItem "$T\jdk-tmp" -Directory | Select-Object -First 1).FullName "$T\jdk-17"
Remove-Item "$T\jdk17.zip"; Remove-Item "$T\jdk-tmp" -Recurse
& "$T\jdk-17\bin\java.exe" -version
```
Expected: `openjdk version "17.0.…"`. 기존 Java 8(PATH)은 건드리지 않는다.

- [ ] **Step 2: 안드로이드 명령줄 도구 받기**

```powershell
$T = "$env:USERPROFILE\.android-tools"
Invoke-WebRequest "https://dl.google.com/android/repository/commandlinetools-win-13114758_latest.zip" -OutFile "$T\cmdline.zip"
Expand-Archive "$T\cmdline.zip" -DestinationPath "$T\cmdline-tmp" -Force
New-Item -ItemType Directory -Force "$T\sdk\cmdline-tools" | Out-Null
Move-Item "$T\cmdline-tmp\cmdline-tools" "$T\sdk\cmdline-tools\latest"
Remove-Item "$T\cmdline.zip"; Remove-Item "$T\cmdline-tmp" -Recurse
Test-Path "$T\sdk\cmdline-tools\latest\bin\sdkmanager.bat"
```
Expected: `True`. 주소가 404 면 https://developer.android.com/studio#command-line-tools-only 의 「Windows」 줄에서
지금 파일 이름(`commandlinetools-win-<번호>_latest.zip`)을 읽어 그 번호로 바꾼다.

- [ ] **Step 3: 라이선스 동의 + 필요한 꾸러미 설치**

```powershell
$T = "$env:USERPROFILE\.android-tools"
$env:JAVA_HOME = "$T\jdk-17"
$sm = "$T\sdk\cmdline-tools\latest\bin\sdkmanager.bat"
1..30 | ForEach-Object { "y" } | & $sm --sdk_root="$T\sdk" --licenses
& $sm --sdk_root="$T\sdk" "platform-tools" "build-tools;35.0.0" "platforms;android-36"
& "$T\sdk\platform-tools\adb.exe" version
& "$T\sdk\build-tools\35.0.0\aapt2.exe" version
```
Expected: `All SDK package licenses accepted` · `Android Debug Bridge version …` · `Android Asset Packaging Tool (aapt) 2.…`.

- [ ] **Step 4: 지금 앱(PWABuilder APK)의 설정을 적어 둔다**

```powershell
$T = "$env:USERPROFILE\.android-tools"
$apk = "C:\Projects\bible-memorize-church-app-v2\성경암송 - Google Play package - New\성경암송.apk"
$a = "$T\sdk\build-tools\35.0.0\aapt2.exe"
New-Item -ItemType Directory -Force "$T\old-app" | Out-Null
& $a dump badging $apk | Out-File -Encoding utf8 "$T\old-app\badging.txt"
& $a dump xmltree --file AndroidManifest.xml $apk | Out-File -Encoding utf8 "$T\old-app\manifest.txt"
& $a dump resources $apk | Out-File -Encoding utf8 "$T\old-app\resources.txt"
Select-String -Path "$T\old-app\badging.txt" -Pattern "^package:|sdkVersion|targetSdkVersion|application-label|uses-permission"
```
Expected: `package: name='kr.onlybible.gocheok.memorize' versionCode='…' versionName='…'` 와 sdk·라벨·권한 줄.
**versionCode·versionName·sdkVersion(minSdk)·application-label** 을 기록해 둔다(Task 2 와 Task 8 에서 쓴다).
⚠️ 이 폴더의 `signing-key-info.txt` 는 **열어 보지 않는다**(비밀번호가 있다 — Task 8 에서 값을 찍지 않고 옮긴다).

---

### Task 2: Bubblewrap 으로 뼈대 만들기 + 옛 앱과 같은지 대조 + 커밋

**Files:**
- Create: `android-app/tools/package.json`, `android-app/tools/generate.cjs`, `android-app/tools/manifest-parity.py`, `android-app/.gitignore`
- Create(생성기가 만든다): `android-app/{build.gradle, settings.gradle, gradle.properties, gradlew, gradlew.bat, gradle/, app/, twa-manifest.json, …}`
- Create(git 무시): `android-app/local.properties`

**Interfaces:**
- Consumes: Task 1 도구 · `old-app/*.txt`
- Produces: Gradle 프로젝트 `android-app/`(모듈 `app`) · 클래스 `kr.onlybible.gocheok.memorize.LauncherActivity`
  (Bubblewrap 생성, `com.google.androidbrowserhelper.trusted.LauncherActivity` 를 잇고 `getLaunchingUrl()` 이 인텐트 주소를 쓴다) ·
  `app/build.gradle` 의 `resValue "string", "appName"` · `"launcherName"`(Task 4 가 시험판에서 덮어쓴다)

- [ ] **Step 1: 생성기 꾸러미와 스크립트를 쓴다**

`android-app/tools/package.json`:
```json
{
  "name": "gocheok-android-generate",
  "private": true,
  "description": "안드로이드 앱 뼈대를 Bubblewrap core 로 한 번 만든다(2026-09-21). 다시 돌리지 말 것 — generate.cjs 머리말 참고.",
  "dependencies": {
    "@bubblewrap/core": "1.25.0"
  }
}
```

`android-app/tools/generate.cjs`:
> ⚠️ **실행하며 고침(2026-09-21):** 옛 APK 를 읽어 보니 앱 이름이 「성경말씀 암송」이 아니라 **「성경암송」**이었고,
> 색 여덟 칸(상태 표시줄·아래 막대·구분선, 밝을 때·어두울 때)이 모두 `#1A3A6B`, `orientation 'default'`, `minSdkVersion 23` 이었다.
> 실제로 쓴 값은 저장소의 `android-app/tools/generate.cjs` 다(아래는 처음 초안). 대조 결과 판 이름만 달랐다.
```js
// 안드로이드 앱 뼈대를 Bubblewrap 으로 **한 번** 만든다(2026-09-21).
// 명령줄 도구(bubblewrap init)는 대화형 질문을 던져서, 같은 일을 하는 core 를 직접 부른다.
//
// ⚠️ 위젯을 더한 뒤에는 다시 돌리지 말 것 — AndroidManifest.xml·app/build.gradle 등
//    우리가 고친 파일을 통째로 덮어쓴다(설계 docs/superpowers/specs/2026-09-21-android-widgets-design.md).
//
// 값은 지금 플레이스토어 앱(PWABuilder 로 만든 것)과 같게 둔다 — 같지 않으면 업데이트한 순간
// 앱 이름·색·알림 같은 것이 조용히 바뀐다. 대조는 manifest-parity.py 가 한다.
const path = require('path');
const Color = require('color');
const { TwaManifest, TwaGenerator, ConsoleLog } = require('@bubblewrap/core');

(async () => {
  const target = path.resolve(__dirname, '..');
  const m = await TwaManifest.fromWebManifest('https://gocheok.onlybible.kr/manifest.json');
  m.packageId = 'kr.onlybible.gocheok.memorize';
  m.host = 'gocheok.onlybible.kr';
  m.name = '성경말씀 암송';          // 앱 이름(스토어 등록 이름과 같다)
  m.launcherName = '성경암송';        // 홈 화면 아이콘 밑 이름
  m.startUrl = '/';
  m.themeColor = new Color('#1A3A6B');
  m.backgroundColor = new Color('#1A3A6B');
  m.enableNotifications = true;       // 알림 위임 — 끄면 아침 알림이 앱 이름으로 안 뜬다
  m.fallbackType = 'customtabs';
  m.splashScreenFadeOutDuration = 300;
  m.enableSiteSettingsShortcut = true;
  await m.saveToFile(path.join(target, 'twa-manifest.json'));
  await new TwaGenerator().createTwaProject(target, m, new ConsoleLog('generate'));
  console.log('뼈대를 만들었다:', target);
})().catch((e) => { console.error(e); process.exit(1); });
```

`android-app/.gitignore`:
```gitignore
# Gradle·빌드 결과
.gradle/
build/
app/build/
*.apk
*.aab
*.idsig
# 이 PC 에만 있는 설정 — SDK 경로(local.properties), 서명 경로·비밀번호(keystore.properties)
local.properties
keystore.properties
# 서명 키 — 절대 커밋 금지(저장소 공개 · 사이트가 저장소 전체를 배포한다)
*.keystore
*.jks
# 생성기 꾸러미
tools/node_modules/
tools/package-lock.json
# 편집기
.idea/
*.iml
```

- [ ] **Step 2: 생성기를 설치하고 돌린다**

```bash
cd /c/Projects/bible-memorize-church-app-v2/android-app/tools && npm install --no-audit --no-fund && node generate.cjs
```
Expected: 마지막 줄 `뼈대를 만들었다: …android-app`. `ls ../app/src/main/java/kr/onlybible/gocheok/memorize/` 에
`LauncherActivity.java` 가 있어야 한다. `require('color')` 가 실패하면(`Cannot find module 'color'`) `npm install color@3` 를 더해 다시 돌린다
(`@bubblewrap/core` 가 쓰는 판).

- [ ] **Step 3: SDK 경로를 적고 정식판(서명 없음)을 빌드한다**

```bash
cd /c/Projects/bible-memorize-church-app-v2/android-app
printf 'sdk.dir=C:/Users/sewki/.android-tools/sdk\n' > local.properties
export JAVA_HOME="/c/Users/sewki/.android-tools/jdk-17"; export ANDROID_HOME="/c/Users/sewki/.android-tools/sdk"
./gradlew --no-daemon assembleRelease
ls app/build/outputs/apk/release/
```
Expected: `BUILD SUCCESSFUL` · `app-release-unsigned.apk`. `jcenter()` 때문에 의존성을 못 받으면(`Could not resolve … jcenter`)
`build.gradle` 두 곳의 `jcenter()` 를 `mavenCentral()` 로 바꾸고 다시 빌드한다.

- [ ] **Step 4: 대조 스크립트를 쓴다**

`android-app/tools/manifest-parity.py`:
```python
"""옛 플레이스토어 앱(PWABuilder APK)과 새로 만든 앱의 설정이 같은지 본다.

쓰는 법:  python android-app/tools/manifest-parity.py <옛.apk> <새.apk>

왜: 업데이트는 성도님 폰의 앱을 **그대로 바꿔 끼운다.** 이름·색·알림 위임·권한·주소가 하나라도 어긋나면
    오류 없이 조용히 달라진다(예: 알림 위임이 꺼지면 아침 알림이 앱 이름으로 안 뜬다).
    다른 줄이 나오면 하나씩 읽고, 판 번호·SDK·위젯 받이처럼 **일부러 바꾼 것**만 남아야 한다.
"""
import difflib, glob, os, re, subprocess, sys

# Bubblewrap 이 만드는 값들 — 라이브러리 문자열 수백 개는 대조할 뜻이 없어 이것만 본다.
KEEP = {"appName", "launcherName", "launchUrl", "hostName", "colorPrimary", "colorPrimaryDark",
        "navigationColor", "navigationColorDark", "navigationDividerColor", "navigationDividerColorDark",
        "backgroundColor", "providerAuthority", "enableNotification", "splashScreenFadeOutDuration",
        "fallbackType", "enableSiteSettingsShortcut", "orientation", "webManifestUrl", "assetStatements"}


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
    keep = ("package:", "sdkVersion", "targetSdkVersion", "application-label", "uses-permission",
            "launchable-activity")
    return sorted(l.strip() for l in run("dump", "badging", apk).splitlines() if l.startswith(keep))


def manifest(apk):
    out = run("dump", "xmltree", "--file", "AndroidManifest.xml", apk)
    out = re.sub(r"@0x7f[0-9a-f]{6}", "@res", out)      # 리소스 번호는 빌드마다 다르다
    out = re.sub(r"\s*\(Raw: [^)]*\)", "", out)
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
```

- [ ] **Step 5: 대조를 돌려 읽는다**

```bash
cd /c/Projects/bible-memorize-church-app-v2
export ANDROID_HOME="/c/Users/sewki/.android-tools/sdk"
PYTHONIOENCODING=utf-8 python android-app/tools/manifest-parity.py \
  "성경암송 - Google Play package - New/성경암송.apk" android-app/app/build/outputs/apk/release/app-release-unsigned.apk
```
Expected: `resources: 같다`. 다른 줄은 **허용 목록**에 있는 것만이어야 한다 —
`versionCode`·`versionName`(Task 8 에서 맞춘다) · `sdkVersion`·`targetSdkVersion`·`compileSdk`(새 템플릿이 36) ·
템플릿 판이 달라 생긴 줄(메타 퀘스트 권한, `<queries>` 등).
**`package`·`application-label`·`POST_NOTIFICATIONS`·`DelegationService`·`launchUrl`·`hostName`·색이 다르면 허용이 아니다.**
그때는 `generate.cjs` 에서 그 칸을 옛 값으로 고친다(대응: `appName`→`m.name` · `launcherName`→`m.launcherName` ·
`launchUrl`→`m.startUrl` · `colorPrimary`→`m.themeColor` · `colorPrimaryDark`→`m.themeColorDark` · `navigationColor`→`m.navigationColor` ·
`navigationColorDark`→`m.navigationColorDark` · `navigationDividerColor(Dark)`→`m.navigationDividerColor(Dark)` ·
`backgroundColor`→`m.backgroundColor` · `enableNotification`→`m.enableNotifications` · `fallbackType`→`m.fallbackType` ·
`splashScreenFadeOutDuration`→`m.splashScreenFadeOutDuration` · `enableSiteSettingsShortcut`→`m.enableSiteSettingsShortcut` ·
`orientation`→`m.orientation` · `sdkVersion`(min)→`m.minSdkVersion`; 색 값 `#ffRRGGBB` 는 `new Color('#RRGGBB')`),
`android-app/` 에서 생성기가 만든 것만 지우고(`tools/` 는 남긴다) Step 2~5 를 다시 돈다.

- [ ] **Step 6: 키·로컬 설정이 git 에 안 잡히는지 보고 커밋**

```bash
cd /c/Projects/bible-memorize-church-app-v2
git status --porcelain --untracked-files=all android-app | grep -E "keystore|local.properties|\.apk|\.aab|/build/|node_modules" && echo "!! 들어가면 안 되는 것이 보인다 — 멈춘다" || echo "OK: 키·빌드 결과 없음"
git add -- android-app
git diff --cached --stat -- android-app | tail -3
git commit -q -F - -- android-app <<'EOF'
feat(안드로이드): Bubblewrap 으로 지금 TWA 앱을 소스째 만든다 — 위젯을 넣을 자리

지금 플레이스토어 앱은 PWABuilder 결과물(aab)만 있고 소스가 없어 위젯을 넣을 수 없었다.
@bubblewrap/core 1.25.0 을 스크립트로 불러(android-app/tools/generate.cjs — 대화형 질문 없이)
같은 패키지·이름·색·알림 위임으로 android-app/ 에 Gradle 프로젝트를 만들었다.
manifest-parity.py 로 옛 APK 와 대조해 판 번호·SDK·템플릿 판 차이 말고는 같음을 확인했다.

⚠️ 위젯을 더한 뒤에는 생성기·bubblewrap update 를 다시 돌리지 않는다(고친 파일을 덮어쓴다).
서명 키·비밀번호는 저장소에 없다(android-app/.gitignore).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
git push -q origin main
```
Expected: `OK: 키·빌드 결과 없음` · 커밋·푸시 성공. `!!` 가 뜨면 커밋하지 말고 `.gitignore` 를 고친다.

---

### Task 3: 위젯 규칙(`WidgetLogic`)을 JVM 단위 시험으로 먼저 굳힌다

**Files:**
- Modify: `android-app/app/build.gradle`(`dependencies` 블록)
- Create: `android-app/app/src/main/java/kr/onlybible/gocheok/memorize/widget/WidgetLogic.java`
- Test: `android-app/app/src/test/java/kr/onlybible/gocheok/memorize/widget/WidgetLogicTest.java`

**Interfaces:**
- Produces(`public final class WidgetLogic`, 모두 `static`):
  `String SITE` · `String MEDITATION_URL` · `String PRAYER_URL` ·
  `long nextKstMidnight(long nowMillis)` · `long meditationNext(long nowMillis)` · `long refreshAt(boolean fresh, long nextMillis, long nowMillis)` ·
  `String str(JSONObject j, String key)` · `boolean verseValid(JSONObject j)` · `boolean meditationValid(JSONObject j)` · `boolean blessingValid(JSONObject j)` ·
  `String meditationBody(JSONObject j)` · `String meditationTitle(String dayLabel)` · `boolean useLargeLayout(int widthDp, int heightDp)` ·
  `String verseUrl(JSONObject j)` · `String requestBody(String action, String date)`
  (모든 `JSONObject` 인자는 `null` 이어도 된다)

- [ ] **Step 1: JVM 시험 의존성을 더한다**

`android-app/app/build.gradle` 의 `dependencies {` 블록 안, `implementation fileTree(...)` 줄 바로 밑에 더한다:
```groovy
    // 위젯 규칙(WidgetLogic) JVM 시험 — org.json 을 진짜로 쓰려면 라이브러리가 따로 필요하다
    // (안드로이드 android.jar 의 org.json 은 JVM 에서 "Stub!" 을 던진다).
    testImplementation 'junit:junit:4.13.2'
    testImplementation 'org.json:json:20240303'
```

- [ ] **Step 2: 실패하는 시험을 쓴다**

`android-app/app/src/test/java/kr/onlybible/gocheok/memorize/widget/WidgetLogicTest.java`:
```java
package kr.onlybible.gocheok.memorize.widget;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.time.Instant;

import org.json.JSONObject;
import org.junit.Test;

// 아이폰 WidgetShared.swift · 각 위젯의 isValid 와 같은 규칙인지 본다.
public class WidgetLogicTest {
    private static long t(String iso) { return Instant.parse(iso).toEpochMilli(); }
    private static JSONObject j(String s) throws Exception { return new JSONObject(s); }

    @Test public void nextKstMidnight_justBeforeMidnight() {
        // KST 09-21 23:59:59 = UTC 14:59:59 → 다음 자정(KST 09-22 00:00) = UTC 09-21 15:00
        assertEquals(t("2026-09-21T15:00:00Z"), WidgetLogic.nextKstMidnight(t("2026-09-21T14:59:59Z")));
    }

    @Test public void nextKstMidnight_atMidnightGoesToTheNextOne() {
        assertEquals(t("2026-09-22T15:00:00Z"), WidgetLogic.nextKstMidnight(t("2026-09-21T15:00:00Z")));
    }

    @Test public void nextKstMidnight_morningKst() {
        // KST 09-21 09:00 = UTC 00:00 → 그날 밤 자정
        assertEquals(t("2026-09-21T15:00:00Z"), WidgetLogic.nextKstMidnight(t("2026-09-21T00:00:00Z")));
    }

    @Test public void meditationNext_morningUsesSixHours() {
        long now = t("2026-09-21T01:00:00Z"); // KST 10:00
        assertEquals(now + 6 * 3600_000L, WidgetLogic.meditationNext(now));
    }

    @Test public void meditationNext_eveningUsesMidnight() {
        long now = t("2026-09-21T11:00:00Z"); // KST 20:00 → 자정이 6시간 뒤(02:00)보다 이르다
        assertEquals(t("2026-09-21T15:00:00Z"), WidgetLogic.meditationNext(now));
    }

    @Test public void refreshAt_freshUsesNext_failureRetriesIn30Minutes() {
        long now = 1_000_000L, next = 90_000_000L;
        assertEquals(next, WidgetLogic.refreshAt(true, next, now));
        assertEquals(now + 30 * 60_000L, WidgetLogic.refreshAt(false, next, now));
    }

    @Test public void str_nullMissingAndNonStringAreEmpty() throws Exception {
        assertEquals("", WidgetLogic.str(null, "text"));
        assertEquals("", WidgetLogic.str(j("{}"), "text"));
        assertEquals("", WidgetLogic.str(j("{\"text\":null}"), "text"));
        assertEquals("", WidgetLogic.str(j("{\"text\":38}"), "text"));
        assertEquals("롬 14:8", WidgetLogic.str(j("{\"ref\":\"롬 14:8\"}"), "ref"));
    }

    @Test public void verseValid_needsText() throws Exception {
        // getWeeklyVerse 에는 ok 칸이 없다 — 본문만 본다(아이폰 verseIsValid 와 같다)
        assertTrue(WidgetLogic.verseValid(j("{\"no\":38,\"ref\":\"롬 14:8\",\"text\":\"우리가 살아도\"}")));
        assertFalse(WidgetLogic.verseValid(j("{\"no\":38,\"text\":\"\"}")));
        assertFalse(WidgetLogic.verseValid(j("{\"text\":null}")));
        assertFalse(WidgetLogic.verseValid(null));
    }

    @Test public void meditationValid_needsOkAndMessageOrQuestion() throws Exception {
        assertTrue(WidgetLogic.meditationValid(j("{\"ok\":true,\"message\":\"본문\",\"question\":\"\"}")));
        assertTrue(WidgetLogic.meditationValid(j("{\"ok\":true,\"message\":\"\",\"question\":\"질문\"}")));
        assertFalse(WidgetLogic.meditationValid(j("{\"ok\":true,\"message\":\"\",\"question\":\"\"}")));
        assertFalse(WidgetLogic.meditationValid(j("{\"ok\":false,\"message\":\"본문\"}")));
        assertFalse(WidgetLogic.meditationValid(null));
    }

    @Test public void blessingValid_needsOkAndPrayer() throws Exception {
        assertTrue(WidgetLogic.blessingValid(j("{\"ok\":true,\"prayer\":\"하나님\"}")));
        assertFalse(WidgetLogic.blessingValid(j("{\"ok\":true,\"prayer\":\"\"}")));
        assertFalse(WidgetLogic.blessingValid(j("{\"ok\":false,\"prayer\":\"하나님\"}")));
        assertFalse(WidgetLogic.blessingValid(null));
    }

    @Test public void meditationBody_prefersMessage_fallsBackToQuestion() throws Exception {
        // 적용 질문은 위젯에 싣지 않는다 — 본문이 비고 질문만 오는 날에만 질문을 본문 자리에(2026-09-21)
        assertEquals("본문", WidgetLogic.meditationBody(j("{\"message\":\"본문\",\"question\":\"질문\"}")));
        assertEquals("질문", WidgetLogic.meditationBody(j("{\"message\":\"\",\"question\":\"질문\"}")));
        assertEquals("", WidgetLogic.meditationBody(null));
    }

    @Test public void meditationTitle_withAndWithoutDay() {
        assertEquals("오늘의 묵상 · 월요일", WidgetLogic.meditationTitle("월"));
        assertEquals("오늘의 묵상", WidgetLogic.meditationTitle(""));
        assertEquals("오늘의 묵상", WidgetLogic.meditationTitle(null));
    }

    @Test public void useLargeLayout_byHeightToWidth() {
        assertFalse(WidgetLogic.useLargeLayout(330, 180));   // 4×2
        assertTrue(WidgetLogic.useLargeLayout(330, 350));    // 4×4
        assertTrue(WidgetLogic.useLargeLayout(330, 264));    // 경계: 높이 ≥ 너비 × 0.8
        assertFalse(WidgetLogic.useLargeLayout(330, 263));
        assertFalse(WidgetLogic.useLargeLayout(0, 400));     // 크기를 아직 모를 때는 중간
        assertFalse(WidgetLogic.useLargeLayout(330, 0));
    }

    @Test public void verseUrl_withAndWithoutNumber() throws Exception {
        assertEquals("https://gocheok.onlybible.kr/?v=38", WidgetLogic.verseUrl(j("{\"no\":38}")));
        assertEquals("https://gocheok.onlybible.kr/", WidgetLogic.verseUrl(j("{\"no\":null}")));
        assertEquals("https://gocheok.onlybible.kr/", WidgetLogic.verseUrl(null));
        assertEquals("https://gocheok.onlybible.kr/?w=meditation", WidgetLogic.MEDITATION_URL);
        assertEquals("https://gocheok.onlybible.kr/?w=prayer", WidgetLogic.PRAYER_URL);
    }

    @Test public void requestBody_carriesActionAndOnlyANonEmptyDate() throws Exception {
        JSONObject plain = new JSONObject(WidgetLogic.requestBody("getWeeklyVerse", ""));
        assertEquals("getWeeklyVerse", plain.getString("action"));
        assertFalse(plain.has("date"));
        assertFalse(new JSONObject(WidgetLogic.requestBody("getWeeklyVerse", null)).has("date"));
        JSONObject dated = new JSONObject(WidgetLogic.requestBody("getTodayMeditation", "2026-09-13"));
        assertEquals("2026-09-13", dated.getString("date"));
        assertFalse(dated.has("user_id"));   // ⚠️ 위젯은 신원을 보내지 않는다
    }
}
```

- [ ] **Step 3: 시험이 실패하는지 본다**

```bash
cd /c/Projects/bible-memorize-church-app-v2/android-app
export JAVA_HOME="/c/Users/sewki/.android-tools/jdk-17"; export ANDROID_HOME="/c/Users/sewki/.android-tools/sdk"
./gradlew --no-daemon testDebugUnitTest --tests "*WidgetLogicTest"
```
Expected: FAIL — `cannot find symbol … WidgetLogic`(컴파일 오류).

- [ ] **Step 4: `WidgetLogic` 을 쓴다**

`android-app/app/src/main/java/kr/onlybible/gocheok/memorize/widget/WidgetLogic.java`:
```java
package kr.onlybible.gocheok.memorize.widget;

import org.json.JSONException;
import org.json.JSONObject;

/**
 * 위젯 규칙 중 안드로이드에 기대지 않는 것 — JVM 시험(WidgetLogicTest)으로 굳힌다.
 * 아이폰 WidgetShared.swift(nextKSTMidnight · refreshDate)와 각 위젯의 isValid 와 **같은 규칙**이다.
 * 한쪽을 고치면 다른 쪽도 함께 고칠 것.
 *
 * ⚠️ java.time 을 쓰지 않는다 — 안드로이드 8.0 미만 폰에는 없다. 한국 시간은 +9시간으로 셈한다(서머타임 없음).
 *    Math.floorDiv 도 쓰지 않는다(안드로이드 7.0 미만에 없다) — 시각은 늘 양수라 그냥 나눗셈이면 된다.
 */
public final class WidgetLogic {
    private WidgetLogic() {}

    public static final String SITE = "https://gocheok.onlybible.kr";
    public static final String MEDITATION_URL = SITE + "/?w=meditation";
    public static final String PRAYER_URL = SITE + "/?w=prayer";

    private static final long MINUTE = 60_000L;
    private static final long HOUR = 60 * MINUTE;
    private static final long DAY = 24 * HOUR;
    private static final long KST_OFFSET = 9 * HOUR;

    /** 다음 한국 자정(밀리초). 딱 자정이면 그다음 자정. 서버가 한국 날짜로 고르므로 같은 기준을 쓴다. */
    public static long nextKstMidnight(long nowMillis) {
        long kst = nowMillis + KST_OFFSET;
        return (kst / DAY + 1) * DAY - KST_OFFSET;
    }

    /** 묵상 — 다음 자정과 6시간 뒤 중 이른 때(주일 오후에 올라오는 설교가 늦어도 반나절 안에 따라오게). */
    public static long meditationNext(long nowMillis) {
        return Math.min(nextKstMidnight(nowMillis), nowMillis + 6 * HOUR);
    }

    /** 새로 받았으면 next, 실패했으면 자정까지 기다리지 않고 30분 뒤(아이폰 refreshDate 와 같다). */
    public static long refreshAt(boolean fresh, long nextMillis, long nowMillis) {
        return fresh ? nextMillis : nowMillis + 30 * MINUTE;
    }

    /** 문자열 칸만 꺼낸다. 없거나 null 이거나 문자열이 아니면 "". (org.json 은 null 을 "null" 로 돌려주는 판이 있다) */
    public static String str(JSONObject j, String key) {
        if (j == null) return "";
        Object v = j.opt(key);
        return (v instanceof String) ? (String) v : "";
    }

    /** getWeeklyVerse 에는 ok 칸이 없다 — 본문이 있으면 쓸 만하다. */
    public static boolean verseValid(JSONObject j) {
        return !str(j, "text").isEmpty();
    }

    /** 「준비하고 있어요」(ready:false)도 지금의 진짜 상태이므로 쓸 만한 응답으로 본다. */
    public static boolean meditationValid(JSONObject j) {
        return j != null && j.optBoolean("ok")
                && (!str(j, "message").isEmpty() || !str(j, "question").isEmpty());
    }

    public static boolean blessingValid(JSONObject j) {
        return j != null && j.optBoolean("ok") && !str(j, "prayer").isEmpty();
    }

    /** 적용 질문은 위젯에 싣지 않는다(2026-09-21) — 본문이 비고 질문만 오는 날에만 질문을 본문 자리에. */
    public static String meditationBody(JSONObject j) {
        String message = str(j, "message");
        return message.isEmpty() ? str(j, "question") : message;
    }

    public static String meditationTitle(String dayLabel) {
        return (dayLabel == null || dayLabel.isEmpty()) ? "오늘의 묵상" : "오늘의 묵상 · " + dayLabel + "요일";
    }

    /**
     * 큰 글씨 모양을 쓸 만큼 세로로 늘렸나. 런처마다 칸 크기가 달라 절대 높이 대신 너비와의 비로 본다
     * (4×2 는 대개 0.5~0.7, 4×4 는 1 안팎). 크기를 아직 모르면(0) 가로로 긴 모양.
     */
    public static boolean useLargeLayout(int widthDp, int heightDp) {
        if (widthDp <= 0 || heightDp <= 0) return false;
        return heightDp >= widthDp * 0.8;
    }

    /** 구절 번호를 알면 그 구절 암송 화면(/?v=번호), 모르면 첫 화면. 웹 routeAfterLoad 가 받는다. */
    public static String verseUrl(JSONObject j) {
        if (j != null) {
            Object no = j.opt("no");
            if (no instanceof Number) return SITE + "/?v=" + ((Number) no).intValue();
        }
        return SITE + "/";
    }

    /** 서버에 보내는 본문 — 액션 이름과 (시험판에서만) 날짜. ⚠️ user_id·개인정보는 절대 넣지 않는다. */
    public static String requestBody(String action, String date) {
        JSONObject body = new JSONObject();
        try {
            body.put("action", action);
            if (date != null && !date.isEmpty()) body.put("date", date);
        } catch (JSONException e) {
            throw new IllegalStateException(e);
        }
        return body.toString();
    }
}
```

- [ ] **Step 5: 시험이 통과하는지 본다**

```bash
cd /c/Projects/bible-memorize-church-app-v2/android-app
export JAVA_HOME="/c/Users/sewki/.android-tools/jdk-17"; export ANDROID_HOME="/c/Users/sewki/.android-tools/sdk"
./gradlew --no-daemon testDebugUnitTest --tests "*WidgetLogicTest"
```
Expected: `BUILD SUCCESSFUL` · 15개 시험 통과(`app/build/reports/tests/testDebugUnitTest/index.html`).

- [ ] **Step 6: 커밋**

```bash
cd /c/Projects/bible-memorize-church-app-v2
git add -- android-app/app/src/main/java/kr/onlybible/gocheok/memorize/widget/WidgetLogic.java android-app/app/src/test/java/kr/onlybible/gocheok/memorize/widget/WidgetLogicTest.java
git commit -q -F - -- android-app/app/build.gradle android-app/app/src/main/java/kr/onlybible/gocheok/memorize/widget/WidgetLogic.java android-app/app/src/test/java/kr/onlybible/gocheok/memorize/widget/WidgetLogicTest.java <<'EOF'
feat(안드로이드 위젯): 위젯 규칙(WidgetLogic)을 JVM 시험으로 먼저 굳힌다

아이폰 위젯과 같은 규칙 — 다음 KST 자정 · 묵상은 자정과 +6시간 중 이른 때 · 실패하면 30분 뒤 ·
유효성(말씀은 본문, 묵상은 ok+본문|질문, 기도문은 ok+기도문) · 묵상은 본문만 · 누르면 갈 주소 ·
요청 본문(액션과 시험판 날짜만, user_id 없음) · 세로로 늘렸는지(높이 ≥ 너비×0.8). 시험 15개.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
git push -q origin main
```

---

### Task 4: 시험판·정식판 두 벌 + 서버 부르기·저장

**Files:**
- Modify: `android-app/app/build.gradle`(`android {` 블록)
- Create: `widget/WidgetApi.java`, `widget/WidgetStore.java`
- Test: `android-app/app/src/test/java/kr/onlybible/gocheok/memorize/widget/WidgetApiLiveTest.java`

**Interfaces:**
- Consumes: `WidgetLogic.requestBody` · `WidgetLogic.verseValid` · `meditationValid` · `blessingValid`
- Produces: `BuildConfig.WIDGET_DATE`(String, 정식판은 늘 "") ·
  `public final class WidgetApi { static JSONObject call(String action) }`(실패면 `null`, 메인 스레드에서 부르지 말 것) ·
  `public final class WidgetStore { static void save(Context, String kind, JSONObject); static JSONObject load(Context, String kind) }`(없으면 `null`) ·
  변형 이름 `devDebug`(시험판) · `prodRelease`(정식판)

- [ ] **Step 1: 두 벌을 만든다**

`android-app/app/build.gradle` 의 `android {` 바로 다음 줄(= `compileSdkVersion 36` 위)에 더한다:
```groovy
    // BuildConfig 를 만든다(AGP 8 은 기본으로 끈다) — 위젯이 WIDGET_DATE 를 읽는다.
    buildFeatures {
        buildConfig true
    }

    // 두 벌(설계 ③): 시험판은 이름·패키지가 달라 플레이스토어 앱 옆에 따로 깔린다 → 테스터 시계를 안 건드린다.
    //   ./gradlew assembleDevDebug                         시험판(오늘 날짜)
    //   ./gradlew assembleDevDebug -PwidgetDate=2026-04-20  시험판(그날로 보기 — 가장 긴 글 확인용)
    //   ./gradlew bundleProdRelease                         정식판(9/27 이후, Task 8)
    flavorDimensions "channel"
    productFlavors {
        prod {
            dimension "channel"
            buildConfigField "String", "WIDGET_DATE", '""'
        }
        dev {
            dimension "channel"
            applicationIdSuffix ".dev"
            resValue "string", "appName", "성경암송 시험"
            resValue "string", "launcherName", "성경암송 시험"
            buildConfigField "String", "WIDGET_DATE", "\"${project.findProperty('widgetDate') ?: ''}\""
        }
    }
```
`grep -n 'resValue "string", "appName"\|resValue "string", "launcherName"' android-app/app/build.gradle` 로 `defaultConfig` 의
이름이 같은지 먼저 본다(다르면 위 두 줄의 이름을 거기에 맞춘다).

- [ ] **Step 2: 두 벌이 모두 빌드되고 이름이 갈리는지 본다**

```bash
cd /c/Projects/bible-memorize-church-app-v2/android-app
export JAVA_HOME="/c/Users/sewki/.android-tools/jdk-17"; export ANDROID_HOME="/c/Users/sewki/.android-tools/sdk"
./gradlew --no-daemon assembleDevDebug assembleProdRelease
A=$(ls $ANDROID_HOME/build-tools/*/aapt2* | tail -1)
"$A" dump badging app/build/outputs/apk/dev/debug/app-dev-debug.apk | grep -E "^package:|application-label:"
"$A" dump badging app/build/outputs/apk/prod/release/app-prod-release-unsigned.apk | grep -E "^package:|application-label:"
```
Expected: 시험판 `name='kr.onlybible.gocheok.memorize.dev'` · `application-label:'성경암송 시험'`,
정식판 `name='kr.onlybible.gocheok.memorize'` · 원래 라벨. 그리고 Task 2 Step 5 대조를 정식판 APK
(`app-prod-release-unsigned.apk`)로 다시 돌려 **새로 생긴 다른 줄이 없는지** 본다.

- [ ] **Step 3: 운영 서버에 실제로 묻는 시험을 쓴다(실패해야 한다)**

`android-app/app/src/test/java/kr/onlybible/gocheok/memorize/widget/WidgetApiLiveTest.java`:
```java
package kr.onlybible.gocheok.memorize.widget;

import static org.junit.Assert.assertTrue;

import org.json.JSONObject;
import org.junit.Test;

// 운영 서버의 공개 읽기 액션 셋을 진짜로 불러 본다(인터넷이 필요하다). 읽기만 하고 아무것도 쓰지 않는다.
public class WidgetApiLiveTest {
    @Test public void weeklyVerse() {
        JSONObject j = WidgetApi.call("getWeeklyVerse");
        assertTrue("이번주 말씀을 못 받았다: " + j, WidgetLogic.verseValid(j));
    }

    @Test public void todayMeditation() {
        JSONObject j = WidgetApi.call("getTodayMeditation");
        assertTrue("오늘의 묵상을 못 받았다: " + j, WidgetLogic.meditationValid(j));
    }

    @Test public void todayBlessing() {
        JSONObject j = WidgetApi.call("getTodayBlessing");
        assertTrue("오늘의 기도문을 못 받았다: " + j, WidgetLogic.blessingValid(j));
    }
}
```
Run(`android-app/` 에서, Global Constraints 의 `export` 세 줄 뒤): `./gradlew --no-daemon testDevDebugUnitTest --tests "*WidgetApiLiveTest"`
→ Expected: FAIL(`cannot find symbol … WidgetApi`).

- [ ] **Step 4: `WidgetApi` · `WidgetStore` 를 쓴다**

`widget/WidgetApi.java`:
```java
package kr.onlybible.gocheok.memorize.widget;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

import org.json.JSONObject;

import kr.onlybible.gocheok.memorize.BuildConfig;

/**
 * 서버의 공개 읽기 액션을 한 번 부른다. 성공(200 + JSON)이면 그 JSON, 아니면 null.
 * 아이폰 WidgetShared.swift 의 callWidgetApi 와 같은 주소·머리말이다.
 * ⚠️ 네트워크라 메인 스레드에서 부르지 말 것(BaseWidgetProvider 가 따로 스레드를 연다).
 * ⚠️ 공개 키는 앱 코드에 이미 있는 공개 값이다. 여기에 관리자 비번·서비스 키를 넣지 말 것 — 저장소가 공개다.
 */
public final class WidgetApi {
    private WidgetApi() {}

    private static final String API_URL = "https://xnomlgydifiqiybervtf.supabase.co/functions/v1/api";
    private static final String ANON_KEY = "sb_publishable_oLtieT_jw7Gjb8etEsy0jw_thBaDjl-";
    private static final int TIMEOUT_MS = 8000;

    public static JSONObject call(String action) {
        HttpURLConnection con = null;
        try {
            con = (HttpURLConnection) new URL(API_URL).openConnection();
            con.setRequestMethod("POST");
            con.setConnectTimeout(TIMEOUT_MS);
            con.setReadTimeout(TIMEOUT_MS);
            con.setDoOutput(true);
            con.setRequestProperty("Content-Type", "application/json");
            con.setRequestProperty("apikey", ANON_KEY);
            con.setRequestProperty("Authorization", "Bearer " + ANON_KEY);
            byte[] body = WidgetLogic.requestBody(action, BuildConfig.WIDGET_DATE).getBytes(StandardCharsets.UTF_8);
            try (OutputStream os = con.getOutputStream()) {
                os.write(body);
            }
            if (con.getResponseCode() != 200) return null;
            try (InputStream is = con.getInputStream()) {
                return new JSONObject(readAll(is));
            }
        } catch (Exception e) {
            return null;   // 통신 실패 — 부르는 쪽이 적어 둔 마지막 것을 쓴다
        } finally {
            if (con != null) con.disconnect();
        }
    }

    private static String readAll(InputStream is) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        while ((n = is.read(buf)) != -1) out.write(buf, 0, n);
        return new String(out.toByteArray(), StandardCharsets.UTF_8);
    }
}
```

`widget/WidgetStore.java`:
```java
package kr.onlybible.gocheok.memorize.widget;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONException;
import org.json.JSONObject;

/**
 * 위젯별 마지막 성공 응답 — 통신이 안 될 때 빈 위젯 대신 이것을 보인다(아이폰 saveLastGood/loadLastGood).
 * 공개 정보뿐이라 암호화하지 않는다.
 */
public final class WidgetStore {
    private WidgetStore() {}

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences("widget-last-good", Context.MODE_PRIVATE);
    }

    public static void save(Context c, String kind, JSONObject json) {
        prefs(c).edit().putString(kind, json.toString()).apply();
    }

    public static JSONObject load(Context c, String kind) {
        String s = prefs(c).getString(kind, null);
        if (s == null) return null;
        try {
            return new JSONObject(s);
        } catch (JSONException e) {
            return null;
        }
    }
}
```

- [ ] **Step 5: 시험 둘 다 통과하는지 본다**

```bash
cd /c/Projects/bible-memorize-church-app-v2/android-app
export JAVA_HOME="/c/Users/sewki/.android-tools/jdk-17"; export ANDROID_HOME="/c/Users/sewki/.android-tools/sdk"
./gradlew --no-daemon testDevDebugUnitTest
./gradlew --no-daemon testDevDebugUnitTest -PwidgetDate=2026-09-13 --tests "*WidgetApiLiveTest"
```
Expected: 둘 다 `BUILD SUCCESSFUL`(WidgetLogicTest 15 + WidgetApiLiveTest 3). 두 번째는 날짜를 실어 보내도 받는지 보는 것이다.

- [ ] **Step 6: 커밋**

```bash
cd /c/Projects/bible-memorize-church-app-v2
W=android-app/app/src/main/java/kr/onlybible/gocheok/memorize/widget
T=android-app/app/src/test/java/kr/onlybible/gocheok/memorize/widget
git add -- $W/WidgetApi.java $W/WidgetStore.java $T/WidgetApiLiveTest.java
git commit -q -F - -- android-app/app/build.gradle $W/WidgetApi.java $W/WidgetStore.java $T/WidgetApiLiveTest.java <<'EOF'
feat(안드로이드 위젯): 시험판·정식판 두 벌 + 서버 부르기·마지막 성공분 저장

- 시험판(dev): 패키지 …memorize.dev · 이름 「성경암송 시험」 — 플레이스토어 앱 옆에 따로 깔려
  테스터 시계를 안 건드린다. -PwidgetDate=YYYY-MM-DD 로 그날 내용을 띄울 수 있다(가장 긴 글 확인용).
- 정식판(prod): 지금 앱과 같다. WIDGET_DATE 는 늘 비어 있다.
- WidgetApi: 공개 읽기 액션 POST(아이폰 callWidgetApi 와 같은 주소·머리말) · WidgetStore: 위젯별 마지막 성공분.
- WidgetApiLiveTest: 운영 서버 액션 셋을 읽기만 해서 확인.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
git push -q origin main
```

---

### Task 5: 「이번주 말씀」 위젯 + 친구 폰에 시험판 설치

**Files:**
- Create: `widget/BaseWidgetProvider.java`, `widget/VerseWidget.java`
- Create: `app/src/main/res/layout/widget_verse_medium.xml`, `widget_verse_large.xml`, `app/src/main/res/xml/widget_verse_info.xml`,
  `app/src/main/res/values/widget_strings.xml`, `values/widget_colors.xml`, `values-night/widget_colors.xml`,
  `drawable/widget_bg.xml`, `drawable-nodpi/church_mark.png`
- Modify: `app/src/main/AndroidManifest.xml`(`</application>` 바로 위)

**Interfaces:**
- Consumes: `WidgetLogic.*` · `WidgetApi.call` · `WidgetStore.save/load` · `kr.onlybible.gocheok.memorize.LauncherActivity`
- Produces: `public abstract class BaseWidgetProvider extends AppWidgetProvider` —
  추상 `String kind()` · `String action()` · `int requestCode()` · `boolean isValid(JSONObject)` · `RemoteViews render(Context, JSONObject, boolean large)`,
  재정의 가능 `long nextRefresh(long now)`(기본 다음 KST 자정), 도우미 `PendingIntent openApp(Context, String url)` ·
  `static void setTextOrHide(RemoteViews, int viewId, String text)`.
  모든 위젯 레이아웃이 쓰는 id: `widget_root` · `widget_title` · `widget_body` · (있으면) `widget_heading` · `widget_ref`.
  색 `@color/widget_bg` · `widget_text` · `widget_secondary`, 그림 `@drawable/church_mark` · `@drawable/widget_bg`.

- [ ] **Step 1: 교회 마크 그림을 만든다(아이폰과 같은 그림)**

```bash
cd /c/Projects/bible-memorize-church-app-v2
mkdir -p android-app/app/src/main/res/drawable-nodpi
python - <<'EOF'
from PIL import Image
im = Image.open("icon-512.png").convert("RGBA")
box = im.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()   # 여백을 잘라 낸다
im = im.crop(box)
h = 96                                                                   # 22dp × 4(xxxhdpi) = 88px 보다 넉넉히
im.resize((round(im.width * h / im.height), h), Image.LANCZOS).save(
    "android-app/app/src/main/res/drawable-nodpi/church_mark.png", optimize=True)
print(Image.open("android-app/app/src/main/res/drawable-nodpi/church_mark.png").size)
EOF
```
Expected: `(78, 96)` 안팎.

- [ ] **Step 2: 글·색·바탕을 쓴다**

`app/src/main/res/values/widget_strings.xml`:
```xml
<?xml version="1.0" encoding="utf-8"?>
<!-- 위젯 글 — 아이폰 위젯(ios-app/ios/App/TodayVerseWidget)과 같은 문구. -->
<resources>
    <string name="widget_verse_name">이번주 말씀</string>
    <string name="widget_verse_desc">이번주 암송 구절을 봅니다. 누르면 바로 암송 화면으로 갑니다.</string>
    <string name="widget_verse_fail">말씀을 불러오지 못했습니다</string>
    <string name="widget_verse_sample">하나님이 세상을 이처럼 사랑하사 독생자를 주셨으니</string>
    <string name="widget_verse_sample_ref">요한복음 3:16</string>

    <string name="widget_meditation_name">오늘의 묵상</string>
    <string name="widget_meditation_desc">이번주 설교의 오늘 요일 묵상을 봅니다. 누르면 적용 질문까지 함께 봅니다.</string>
    <string name="widget_meditation_fail">묵상을 불러오지 못했습니다</string>
    <string name="widget_meditation_sample_heading">공장이 아닌 아버지</string>
    <string name="widget_meditation_sample">하나님은 나를 단숨에 찍어내는 공장이 아니라 시간을 들여 기르시는 아버지이십니다.</string>

    <string name="widget_blessing_name">오늘의 축복 기도문</string>
    <string name="widget_blessing_desc">가정 축복 기도문 오늘 한 편을 봅니다. 「우리 가족」으로 읽습니다.</string>
    <string name="widget_blessing_fail">기도문을 불러오지 못했습니다</string>
    <string name="widget_blessing_sample_title">아론의 축복</string>
    <string name="widget_blessing_sample_ref">민수기 6:24-26</string>
    <string name="widget_blessing_sample">하나님, 우리 가족에게 복을 주시고 우리 가족을 지키시며, 여호와의 얼굴을 우리 가족에게 비추사 은혜를 베풀어 주옵소서.</string>
</resources>
```

`app/src/main/res/values/widget_colors.xml`:
```xml
<?xml version="1.0" encoding="utf-8"?>
<!-- 위젯 색(밝을 때) — 아이폰 위젯의 시스템 바탕·글씨·보조 글씨와 같은 값. 어두울 때는 values-night. -->
<resources>
    <color name="widget_bg">#FFFFFF</color>
    <color name="widget_text">#141414</color>
    <color name="widget_secondary">#78787F</color>
</resources>
```

`app/src/main/res/values-night/widget_colors.xml`:
```xml
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="widget_bg">#1C1C1E</color>
    <color name="widget_text">#F5F5F7</color>
    <color name="widget_secondary">#98989D</color>
</resources>
```

`app/src/main/res/drawable/widget_bg.xml`:
```xml
<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <solid android:color="@color/widget_bg" />
    <corners android:radius="16dp" />
</shape>
```

- [ ] **Step 3: 모양(가로로 긴 것 · 큰 것)과 위젯 정보를 쓴다**

`app/src/main/res/layout/widget_verse_medium.xml`:
```xml
<?xml version="1.0" encoding="utf-8"?>
<!-- 이번주 말씀 — 가로로 긴 것(4×2). 머리글(마크+이름) / 본문 / 구절 이름.
     ⚠️ 마크는 이름 옆에만 — 글 뒤에 옅게 깔면(워터마크) 대비가 무너진다(기도문 액자 1.86:1).
     본문은 칸에 맞춰 글씨가 줄어든다(autoSize, 안드로이드 8.0+). 그 아래 판은 textSize 13sp 로 그린다. -->
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@+id/widget_root"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:background="@drawable/widget_bg"
    android:orientation="vertical"
    android:padding="16dp">

    <LinearLayout
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:gravity="center_vertical"
        android:orientation="horizontal">
        <ImageView
            android:layout_width="wrap_content"
            android:layout_height="16dp"
            android:adjustViewBounds="true"
            android:importantForAccessibility="no"
            android:src="@drawable/church_mark" />
        <TextView
            android:id="@+id/widget_title"
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:layout_marginStart="4dp"
            android:maxLines="1"
            android:text="@string/widget_verse_name"
            android:textColor="@color/widget_secondary"
            android:textSize="11sp" />
    </LinearLayout>

    <TextView
        android:id="@+id/widget_body"
        android:layout_width="match_parent"
        android:layout_height="0dp"
        android:layout_marginTop="6dp"
        android:layout_weight="1"
        android:autoSizeMaxTextSize="15sp"
        android:autoSizeMinTextSize="10sp"
        android:autoSizeStepGranularity="1sp"
        android:autoSizeTextType="uniform"
        android:fontFamily="serif"
        android:gravity="top|start"
        android:text="@string/widget_verse_sample"
        android:textColor="@color/widget_text"
        android:textSize="13sp" />

    <TextView
        android:id="@+id/widget_ref"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:layout_marginTop="4dp"
        android:maxLines="1"
        android:text="@string/widget_verse_sample_ref"
        android:textColor="@color/widget_secondary"
        android:textSize="11sp"
        android:textStyle="bold" />
</LinearLayout>
```

`app/src/main/res/layout/widget_verse_large.xml`:
```xml
<?xml version="1.0" encoding="utf-8"?>
<!-- 이번주 말씀 — 세로로 늘렸을 때. 같은 말씀을 **글씨만 크게**(아이폰 큰 네모와 같다) —
     멀리서도, 돋보기 없이도 읽히게. 긴 구절(69자)은 autoSize 가 줄인다. -->
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@+id/widget_root"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:background="@drawable/widget_bg"
    android:orientation="vertical"
    android:padding="20dp">

    <LinearLayout
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:gravity="center_vertical"
        android:orientation="horizontal">
        <ImageView
            android:layout_width="wrap_content"
            android:layout_height="22dp"
            android:adjustViewBounds="true"
            android:importantForAccessibility="no"
            android:src="@drawable/church_mark" />
        <TextView
            android:id="@+id/widget_title"
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:layout_marginStart="6dp"
            android:maxLines="1"
            android:text="@string/widget_verse_name"
            android:textColor="@color/widget_secondary"
            android:textSize="15sp" />
    </LinearLayout>

    <TextView
        android:id="@+id/widget_body"
        android:layout_width="match_parent"
        android:layout_height="0dp"
        android:layout_marginTop="10dp"
        android:layout_weight="1"
        android:autoSizeMaxTextSize="30sp"
        android:autoSizeMinTextSize="16sp"
        android:autoSizeStepGranularity="1sp"
        android:autoSizeTextType="uniform"
        android:fontFamily="serif"
        android:gravity="center_vertical|start"
        android:lineSpacingExtra="4dp"
        android:text="@string/widget_verse_sample"
        android:textColor="@color/widget_text"
        android:textSize="22sp" />

    <TextView
        android:id="@+id/widget_ref"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:layout_marginTop="10dp"
        android:maxLines="1"
        android:text="@string/widget_verse_sample_ref"
        android:textColor="@color/widget_secondary"
        android:textSize="15sp"
        android:textStyle="bold" />
</LinearLayout>
```

`app/src/main/res/xml/widget_verse_info.xml`:
```xml
<?xml version="1.0" encoding="utf-8"?>
<!-- 4×2(250×110dp)로 놓이고 그보다 작게는 못 줄인다 — 정사각형에서는 69자 구절이 잘린다(아이폰에서 뺀 이유).
     updatePeriodMillis(3시간)는 안전망이다. 자정 새로 고침은 BaseWidgetProvider 가 따로 예약한다. -->
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:description="@string/widget_verse_desc"
    android:initialLayout="@layout/widget_verse_medium"
    android:minHeight="110dp"
    android:minResizeHeight="110dp"
    android:minResizeWidth="250dp"
    android:minWidth="250dp"
    android:previewLayout="@layout/widget_verse_medium"
    android:resizeMode="horizontal|vertical"
    android:targetCellHeight="2"
    android:targetCellWidth="4"
    android:updatePeriodMillis="10800000"
    android:widgetCategory="home_screen" />
```

- [ ] **Step 4: 뼈대(`BaseWidgetProvider`)와 이번주 말씀(`VerseWidget`)을 쓴다**

`widget/BaseWidgetProvider.java`:
```java
package kr.onlybible.gocheok.memorize.widget;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONObject;

import kr.onlybible.gocheok.memorize.LauncherActivity;

/**
 * 위젯 셋이 함께 쓰는 뼈대 — 받아 오기 → 그리기 → 다음 새로 고침 예약, 그리고 누르면 앱 열기.
 * 아이폰 WidgetShared.swift 의 fetchWithFallback · refreshDate 와 같은 규칙이다.
 * ⚠️ 위젯은 로그인 없이 보이는 공개 정보만 다룬다 — user_id·개인정보는 보내지도 담지도 않는다.
 */
public abstract class BaseWidgetProvider extends AppWidgetProvider {

    /** 마지막 성공 응답을 적어 둘 이름(위젯마다 다르게). */
    protected abstract String kind();

    /** 부를 서버 액션. */
    protected abstract String action();

    /** PendingIntent 요청 번호 — 위젯마다 달라야 서로 덮어쓰지 않는다. */
    protected abstract int requestCode();

    protected abstract boolean isValid(JSONObject json);

    /** json 은 null 일 수 있다(한 번도 받지 못했을 때). large 는 세로로 늘렸는지. */
    protected abstract RemoteViews render(Context context, JSONObject json, boolean large);

    /** 새로 받았을 때 다음 새로 고침 시각. 기본은 다음 한국 자정. */
    protected long nextRefresh(long now) {
        return WidgetLogic.nextKstMidnight(now);
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        final PendingResult result = goAsync();
        final Context app = context.getApplicationContext();
        new Thread(() -> {
            try {
                refresh(app);
            } finally {
                result.finish();
            }
        }).start();
    }

    private void refresh(Context app) {
        JSONObject fetched = WidgetApi.call(action());
        boolean fresh = isValid(fetched);
        JSONObject json;
        if (fresh) {
            WidgetStore.save(app, kind(), fetched);
            json = fetched;
        } else {
            json = WidgetStore.load(app, kind());   // 통신이 안 되면 마지막 성공분(없으면 null → 실패 문구)
        }
        AppWidgetManager manager = AppWidgetManager.getInstance(app);
        for (int id : ids(app)) {
            manager.updateAppWidget(id, render(app, json, isLarge(manager, id)));
        }
        long now = System.currentTimeMillis();
        schedule(app, WidgetLogic.refreshAt(fresh, nextRefresh(now), now));
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int appWidgetId, Bundle newOptions) {
        // 크기를 바꿨을 때 — 새로 받지 않고 적어 둔 것으로 모양만 다시 그린다.
        manager.updateAppWidget(appWidgetId,
                render(context, WidgetStore.load(context, kind()), isLarge(manager, appWidgetId)));
    }

    @Override
    public void onDisabled(Context context) {
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am != null) am.cancel(refreshIntent(context));
    }

    private int[] ids(Context c) {
        return AppWidgetManager.getInstance(c).getAppWidgetIds(new ComponentName(c, getClass()));
    }

    private static boolean isLarge(AppWidgetManager manager, int id) {
        Bundle o = manager.getAppWidgetOptions(id);
        // 폰을 세워 들었을 때의 실제 크기 = 너비 MIN_WIDTH · 높이 MAX_HEIGHT
        return WidgetLogic.useLargeLayout(o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH),
                o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT));
    }

    // ⚠️ 정확한 시각 알람(setExact*)은 쓰지 않는다 — 안드로이드 12+ 에서 SCHEDULE_EXACT_ALARM 권한이 필요하다.
    //    RTC(깨우지 않음): 폰이 잠들어 있으면 다음에 깰 때 새로 고친다. 화면을 켜야 위젯이 보이니 충분하다.
    private void schedule(Context c, long at) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am != null) am.set(AlarmManager.RTC, at, refreshIntent(c));
    }

    private PendingIntent refreshIntent(Context c) {
        Intent i = new Intent(c, getClass()).setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE);
        i.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids(c));
        return PendingIntent.getBroadcast(c, requestCode(), i, PendingIntent.FLAG_UPDATE_CURRENT | immutable());
    }

    /**
     * 누르면 우리 앱(TWA)을 그 주소로 연다. 자기 패키지의 LauncherActivity 를 콕 집어 부르므로
     * 시험판 위젯은 시험판을, 정식판 위젯은 정식판을 연다. LauncherActivity.getLaunchingUrl() 이 인텐트 주소를 쓴다.
     */
    protected PendingIntent openApp(Context c, String url) {
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        i.setClass(c, LauncherActivity.class);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(c, requestCode(), i, PendingIntent.FLAG_UPDATE_CURRENT | immutable());
    }

    protected static void setTextOrHide(RemoteViews v, int viewId, String text) {
        if (text == null || text.isEmpty()) {
            v.setViewVisibility(viewId, View.GONE);
        } else {
            v.setViewVisibility(viewId, View.VISIBLE);
            v.setTextViewText(viewId, text);
        }
    }

    private static int immutable() {
        return Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0;
    }
}
```

`widget/VerseWidget.java`:
```java
package kr.onlybible.gocheok.memorize.widget;

import android.content.Context;
import android.widget.RemoteViews;

import org.json.JSONObject;

import kr.onlybible.gocheok.memorize.R;

/**
 * 이번주 말씀 — 가로로 긴 것(4×2), 세로로 늘리면 같은 말씀을 글씨만 크게.
 * 누르면 그 구절 암송 화면(/?v=번호 — 로그인 없이도 열린다).
 */
public class VerseWidget extends BaseWidgetProvider {
    @Override protected String kind() { return "verse"; }
    @Override protected String action() { return "getWeeklyVerse"; }
    @Override protected int requestCode() { return 1; }
    @Override protected boolean isValid(JSONObject json) { return WidgetLogic.verseValid(json); }

    @Override
    protected RemoteViews render(Context c, JSONObject json, boolean large) {
        RemoteViews v = new RemoteViews(c.getPackageName(),
                large ? R.layout.widget_verse_large : R.layout.widget_verse_medium);
        if (WidgetLogic.verseValid(json)) {
            v.setTextViewText(R.id.widget_body, WidgetLogic.str(json, "text"));
            setTextOrHide(v, R.id.widget_ref, WidgetLogic.str(json, "ref"));
        } else {
            v.setTextViewText(R.id.widget_body, c.getString(R.string.widget_verse_fail));
            setTextOrHide(v, R.id.widget_ref, "");
        }
        v.setOnClickPendingIntent(R.id.widget_root, openApp(c, WidgetLogic.verseUrl(json)));
        return v;
    }
}
```

- [ ] **Step 5: 매니페스트에 받이를 등록한다**

`app/src/main/AndroidManifest.xml` 의 `</application>` 바로 위에 더한다:
```xml
        <!-- 위젯(2026-09-21) — 설계 docs/superpowers/specs/2026-09-21-android-widgets-design.md -->
        <receiver
            android:name="kr.onlybible.gocheok.memorize.widget.VerseWidget"
            android:exported="false"
            android:label="@string/widget_verse_name">
            <intent-filter>
                <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
            </intent-filter>
            <meta-data
                android:name="android.appwidget.provider"
                android:resource="@xml/widget_verse_info" />
        </receiver>
```

- [ ] **Step 6: 빌드하고, 친구 폰을 연결해 설치한다**

```bash
cd /c/Projects/bible-memorize-church-app-v2/android-app
export JAVA_HOME="/c/Users/sewki/.android-tools/jdk-17"; export ANDROID_HOME="/c/Users/sewki/.android-tools/sdk"
export PATH="$ANDROID_HOME/platform-tools:$PATH"
./gradlew --no-daemon testDevDebugUnitTest assembleDevDebug
adb devices
```
Expected: `BUILD SUCCESSFUL`. `adb devices` 가 비어 있으면 **친구에게 폰을 USB 로 꽂아 달라고 하고**, 폰에 뜬
「USB 디버깅을 허용하시겠습니까?」에서 「이 컴퓨터에서 항상 허용」+「허용」을 부탁한다. `<일련번호>	device` 가 보일 때까지 기다린다
(`unauthorized` 면 아직 허용 전).
```bash
adb install -r app/build/outputs/apk/dev/debug/app-dev-debug.apk
```
Expected: `Success`. 친구에게 부탁: 홈 화면 빈 곳 길게 누르기 → 위젯 → 「성경암송 시험」 → 「이번주 말씀」 → 놓기.

- [ ] **Step 7: 폰 화면을 찍어 확인한다**

```bash
S="/c/Users/sewki/AppData/Local/Temp/claude/c--Projects-bible-memorize-church-app-v2/d9b735f6-ad79-4e4f-8e37-9c4b300b6a5b/scratchpad"
adb exec-out screencap -p > "$S/and-verse-medium.png"
```
Read 로 그림을 본다. 확인: 마크+「이번주 말씀」 / 이번주 본문(오늘은 롬 14:8) / 구절 이름, 잘림 없음.
친구에게 부탁: 위젯을 길게 눌러 **세로로 4×4 까지 늘리기** → 다시 찍어(`and-verse-large.png`) 큰 글씨 모양인지 본다.
친구에게 부탁: 위젯 누르기 → 찍어서(`and-verse-tap.png`) **그 구절 암송 화면**이 열렸는지 본다(시험판은 위에 주소창이 보이는 것이 정상).
어긋나면 고치고 Step 6 부터 다시.

- [ ] **Step 8: 커밋**

```bash
cd /c/Projects/bible-memorize-church-app-v2
A=android-app/app/src/main; W=$A/java/kr/onlybible/gocheok/memorize/widget
NEW="$W/BaseWidgetProvider.java $W/VerseWidget.java $A/res/layout/widget_verse_medium.xml $A/res/layout/widget_verse_large.xml $A/res/xml/widget_verse_info.xml $A/res/values/widget_strings.xml $A/res/values/widget_colors.xml $A/res/values-night/widget_colors.xml $A/res/drawable/widget_bg.xml $A/res/drawable-nodpi/church_mark.png"
git add -- $NEW
git commit -q -F - -- $NEW $A/AndroidManifest.xml <<'EOF'
feat(안드로이드 위젯): 이번주 말씀 — 가로로 긴 것, 늘리면 글씨만 크게, 누르면 그 구절 암송

아이폰 「이번주 말씀」과 같은 모양·규칙. 4×2 보다 작게는 못 줄인다(69자 구절이 잘린다).
교회 마크는 이름 옆에만. 세로로 늘리면(높이 ≥ 너비×0.8) 큰 글씨 모양.
BaseWidgetProvider 가 받아 오기 → 마지막 성공분 대비 → 다음 KST 자정(실패면 30분 뒤) 예약을 맡는다.
누르면 자기 패키지의 LauncherActivity 를 /?v=번호 로 연다. 친구 폰(시험판)에서 확인.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
git push -q origin main
```

---

### Task 6: 「오늘의 묵상」·「오늘의 축복 기도문」 위젯

**Files:**
- Create: `widget/MeditationWidget.java`, `widget/BlessingWidget.java`, `res/layout/widget_meditation.xml`, `res/layout/widget_blessing.xml`,
  `res/xml/widget_meditation_info.xml`, `res/xml/widget_blessing_info.xml`
- Modify: `app/src/main/AndroidManifest.xml`(Task 5 받이 밑)

**Interfaces:**
- Consumes: `BaseWidgetProvider`(Task 5) · `WidgetLogic.meditationValid/meditationBody/meditationTitle/meditationNext/blessingValid/str/MEDITATION_URL/PRAYER_URL` ·
  `R.string.widget_meditation_* / widget_blessing_*`(Task 5 Step 2) · 색·그림(Task 5)
- Produces: 받이 `…widget.MeditationWidget`(요청 번호 2) · `…widget.BlessingWidget`(요청 번호 3)

- [ ] **Step 1: 모양 둘과 위젯 정보 둘을 쓴다**

`app/src/main/res/layout/widget_meditation.xml`:
```xml
<?xml version="1.0" encoding="utf-8"?>
<!-- 오늘의 묵상 — 머리글(마크+「오늘의 묵상 · 월요일」) / 제목 / 본문.
     ⚠️ 적용 질문은 싣지 않는다(2026-09-21) — 본문이 74~117자인데 질문이 한 줄을 먹으면 본문이 잘렸다.
     한 모양으로 4×2 와 늘린 크기를 다 받는다 — 본문은 칸에 맞춰 글씨가 줄고 늘어난다. -->
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@+id/widget_root"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:background="@drawable/widget_bg"
    android:orientation="vertical"
    android:padding="16dp">

    <LinearLayout
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:gravity="center_vertical"
        android:orientation="horizontal">
        <ImageView
            android:layout_width="wrap_content"
            android:layout_height="16dp"
            android:adjustViewBounds="true"
            android:importantForAccessibility="no"
            android:src="@drawable/church_mark" />
        <TextView
            android:id="@+id/widget_title"
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:layout_marginStart="4dp"
            android:maxLines="1"
            android:text="@string/widget_meditation_name"
            android:textColor="@color/widget_secondary"
            android:textSize="11sp" />
    </LinearLayout>

    <TextView
        android:id="@+id/widget_heading"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:layout_marginTop="6dp"
        android:ellipsize="end"
        android:fontFamily="serif"
        android:maxLines="1"
        android:text="@string/widget_meditation_sample_heading"
        android:textColor="@color/widget_text"
        android:textSize="14sp"
        android:textStyle="bold" />

    <TextView
        android:id="@+id/widget_body"
        android:layout_width="match_parent"
        android:layout_height="0dp"
        android:layout_marginTop="4dp"
        android:layout_weight="1"
        android:autoSizeMaxTextSize="17sp"
        android:autoSizeMinTextSize="10sp"
        android:autoSizeStepGranularity="1sp"
        android:autoSizeTextType="uniform"
        android:fontFamily="serif"
        android:gravity="top|start"
        android:text="@string/widget_meditation_sample"
        android:textColor="@color/widget_text"
        android:textSize="13sp" />
</LinearLayout>
```

`app/src/main/res/layout/widget_blessing.xml`:
```xml
<?xml version="1.0" encoding="utf-8"?>
<!-- 오늘의 축복 기도문 — 머리글(마크+이름) / 제목·출처 / 기도문(「우리 가족」 — 서버가 채운다).
     가장 긴 편이 245자라(40번 「순종의 축복」) 4×2 에서는 글씨가 많이 줄 수 있다 — 늘리면 커진다. -->
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@+id/widget_root"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:background="@drawable/widget_bg"
    android:orientation="vertical"
    android:padding="16dp">

    <LinearLayout
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:gravity="center_vertical"
        android:orientation="horizontal">
        <ImageView
            android:layout_width="wrap_content"
            android:layout_height="16dp"
            android:adjustViewBounds="true"
            android:importantForAccessibility="no"
            android:src="@drawable/church_mark" />
        <TextView
            android:id="@+id/widget_title"
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:layout_marginStart="4dp"
            android:maxLines="1"
            android:text="@string/widget_blessing_name"
            android:textColor="@color/widget_secondary"
            android:textSize="11sp" />
    </LinearLayout>

    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:layout_marginTop="5dp"
        android:baselineAligned="true"
        android:orientation="horizontal">
        <TextView
            android:id="@+id/widget_heading"
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:ellipsize="end"
            android:fontFamily="serif"
            android:maxLines="1"
            android:text="@string/widget_blessing_sample_title"
            android:textColor="@color/widget_text"
            android:textSize="14sp"
            android:textStyle="bold" />
        <TextView
            android:id="@+id/widget_ref"
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:layout_marginStart="6dp"
            android:ellipsize="end"
            android:maxLines="1"
            android:text="@string/widget_blessing_sample_ref"
            android:textColor="@color/widget_secondary"
            android:textSize="11sp" />
    </LinearLayout>

    <TextView
        android:id="@+id/widget_body"
        android:layout_width="match_parent"
        android:layout_height="0dp"
        android:layout_marginTop="4dp"
        android:layout_weight="1"
        android:autoSizeMaxTextSize="17sp"
        android:autoSizeMinTextSize="9sp"
        android:autoSizeStepGranularity="1sp"
        android:autoSizeTextType="uniform"
        android:fontFamily="serif"
        android:gravity="top|start"
        android:text="@string/widget_blessing_sample"
        android:textColor="@color/widget_text"
        android:textSize="13sp" />
</LinearLayout>
```

`app/src/main/res/xml/widget_meditation_info.xml`:
```xml
<?xml version="1.0" encoding="utf-8"?>
<!-- 4×2 로 놓이고 그보다 작게는 못 줄인다(두세 줄로는 뜻이 안 전해진다 — 아이폰도 작게가 없다). -->
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:description="@string/widget_meditation_desc"
    android:initialLayout="@layout/widget_meditation"
    android:minHeight="110dp"
    android:minResizeHeight="110dp"
    android:minResizeWidth="250dp"
    android:minWidth="250dp"
    android:previewLayout="@layout/widget_meditation"
    android:resizeMode="horizontal|vertical"
    android:targetCellHeight="2"
    android:targetCellWidth="4"
    android:updatePeriodMillis="10800000"
    android:widgetCategory="home_screen" />
```

`app/src/main/res/xml/widget_blessing_info.xml`:
```xml
<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:description="@string/widget_blessing_desc"
    android:initialLayout="@layout/widget_blessing"
    android:minHeight="110dp"
    android:minResizeHeight="110dp"
    android:minResizeWidth="250dp"
    android:minWidth="250dp"
    android:previewLayout="@layout/widget_blessing"
    android:resizeMode="horizontal|vertical"
    android:targetCellHeight="2"
    android:targetCellWidth="4"
    android:updatePeriodMillis="10800000"
    android:widgetCategory="home_screen" />
```

- [ ] **Step 2: 위젯 둘을 쓴다**

`widget/MeditationWidget.java`:
```java
package kr.onlybible.gocheok.memorize.widget;

import android.content.Context;
import android.widget.RemoteViews;

import org.json.JSONObject;

import kr.onlybible.gocheok.memorize.R;

/**
 * 오늘의 묵상 — 이번 주 설교의 오늘 요일 묵상. 무엇을 보일지는 서버가 앱과 같은 규칙으로 고른다
 * (getTodayMeditation · tests/widget-parity.py). 누르면 앱의 매일 묵상 창(/?w=meditation).
 */
public class MeditationWidget extends BaseWidgetProvider {
    @Override protected String kind() { return "meditation"; }
    @Override protected String action() { return "getTodayMeditation"; }
    @Override protected int requestCode() { return 2; }
    @Override protected boolean isValid(JSONObject json) { return WidgetLogic.meditationValid(json); }

    /** 주일 오후에 올라오는 설교가 늦어도 반나절 안에 따라오게 — 다음 자정과 6시간 뒤 중 이른 때. */
    @Override protected long nextRefresh(long now) { return WidgetLogic.meditationNext(now); }

    @Override
    protected RemoteViews render(Context c, JSONObject json, boolean large) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_meditation);
        v.setTextViewText(R.id.widget_title, WidgetLogic.meditationTitle(WidgetLogic.str(json, "dayLabel")));
        if (WidgetLogic.meditationValid(json)) {
            setTextOrHide(v, R.id.widget_heading, WidgetLogic.str(json, "heading"));
            v.setTextViewText(R.id.widget_body, WidgetLogic.meditationBody(json));
        } else {
            setTextOrHide(v, R.id.widget_heading, "");
            v.setTextViewText(R.id.widget_body, c.getString(R.string.widget_meditation_fail));
        }
        v.setOnClickPendingIntent(R.id.widget_root, openApp(c, WidgetLogic.MEDITATION_URL));
        return v;
    }
}
```

`widget/BlessingWidget.java`:
```java
package kr.onlybible.gocheok.memorize.widget;

import android.content.Context;
import android.widget.RemoteViews;

import org.json.JSONObject;

import kr.onlybible.gocheok.memorize.R;

/**
 * 오늘의 축복 기도문 — 앱의 「오늘 한 편」과 같은 편(getTodayBlessing).
 * ⚠️ 위젯은 로그인 이름을 모른다 — 이름 자리는 서버가 「우리 가족」으로 채운다.
 * 누르면 기도문 화면(/?w=prayer) — 앱은 로그인한 이름으로 같은 편을 보인다.
 */
public class BlessingWidget extends BaseWidgetProvider {
    @Override protected String kind() { return "blessing"; }
    @Override protected String action() { return "getTodayBlessing"; }
    @Override protected int requestCode() { return 3; }
    @Override protected boolean isValid(JSONObject json) { return WidgetLogic.blessingValid(json); }

    @Override
    protected RemoteViews render(Context c, JSONObject json, boolean large) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_blessing);
        if (WidgetLogic.blessingValid(json)) {
            setTextOrHide(v, R.id.widget_heading, WidgetLogic.str(json, "title"));
            setTextOrHide(v, R.id.widget_ref, WidgetLogic.str(json, "ref"));
            v.setTextViewText(R.id.widget_body, WidgetLogic.str(json, "prayer"));
        } else {
            setTextOrHide(v, R.id.widget_heading, "");
            setTextOrHide(v, R.id.widget_ref, "");
            v.setTextViewText(R.id.widget_body, c.getString(R.string.widget_blessing_fail));
        }
        v.setOnClickPendingIntent(R.id.widget_root, openApp(c, WidgetLogic.PRAYER_URL));
        return v;
    }
}
```

- [ ] **Step 3: 매니페스트에 받이 둘을 더한다**

Task 5 의 `VerseWidget` `</receiver>` 바로 밑에:
```xml
        <receiver
            android:name="kr.onlybible.gocheok.memorize.widget.MeditationWidget"
            android:exported="false"
            android:label="@string/widget_meditation_name">
            <intent-filter>
                <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
            </intent-filter>
            <meta-data
                android:name="android.appwidget.provider"
                android:resource="@xml/widget_meditation_info" />
        </receiver>
        <receiver
            android:name="kr.onlybible.gocheok.memorize.widget.BlessingWidget"
            android:exported="false"
            android:label="@string/widget_blessing_name">
            <intent-filter>
                <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
            </intent-filter>
            <meta-data
                android:name="android.appwidget.provider"
                android:resource="@xml/widget_blessing_info" />
        </receiver>
```

- [ ] **Step 4: 빌드·설치·확인**

```bash
cd /c/Projects/bible-memorize-church-app-v2/android-app
export JAVA_HOME="/c/Users/sewki/.android-tools/jdk-17"; export ANDROID_HOME="/c/Users/sewki/.android-tools/sdk"
export PATH="$ANDROID_HOME/platform-tools:$PATH"
./gradlew --no-daemon testDevDebugUnitTest assembleDevDebug && adb install -r app/build/outputs/apk/dev/debug/app-dev-debug.apk
```
Expected: `Success`. 친구에게 부탁: 「오늘의 묵상」·「오늘의 축복 기도문」을 놓기. 찍어서(`and-med.png` · `and-bless.png`) 본다:
묵상 = 「오늘의 묵상 · 월요일」+ 제목 + 본문, **질문 없음**(오늘 9/21 은 「아무것도 아닌 나를…」 95자) ·
기도문 = 제목·출처 + 기도문(「우리 가족」). 누르면 각각 매일 묵상 창 · 기도문 화면(로그인 안 돼 있으면 로그인 화면 — 정상).
운영 서버가 오늘 주는 값은 `curl` 로 대조한다:
```bash
curl -s -X POST https://xnomlgydifiqiybervtf.supabase.co/functions/v1/api -H "Content-Type: application/json" \
  -H "apikey: sb_publishable_oLtieT_jw7Gjb8etEsy0jw_thBaDjl-" -H "Authorization: Bearer sb_publishable_oLtieT_jw7Gjb8etEsy0jw_thBaDjl-" \
  -d '{"action":"getTodayMeditation"}' | PYTHONIOENCODING=utf-8 python -c "import sys,json;d=json.load(sys.stdin);print(d['dayLabel'],d['heading'],d['message'][:30])"
```

- [ ] **Step 5: 커밋**

```bash
cd /c/Projects/bible-memorize-church-app-v2
A=android-app/app/src/main; W=$A/java/kr/onlybible/gocheok/memorize/widget
NEW="$W/MeditationWidget.java $W/BlessingWidget.java $A/res/layout/widget_meditation.xml $A/res/layout/widget_blessing.xml $A/res/xml/widget_meditation_info.xml $A/res/xml/widget_blessing_info.xml"
git add -- $NEW
git commit -q -F - -- $NEW $A/AndroidManifest.xml <<'EOF'
feat(안드로이드 위젯): 오늘의 묵상 · 오늘의 축복 기도문

아이폰과 같은 내용·규칙. 묵상은 본문만(적용 질문은 앱에서) · 새로 고침은 자정과 +6시간 중 이른 때.
기도문은 서버가 「우리 가족」으로 채운 오늘 한 편. 둘 다 4×2 보다 작게는 못 줄이고,
본문은 칸에 맞춰 글씨가 줄고 늘어난다. 누르면 /?w=meditation · /?w=prayer.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
git push -q origin main
```

---

### Task 7: 실기기 확인표 전부 + 기록

설계 ④ 확인표를 친구 폰에서 하나씩 지운다. 결과는 설계 문서에 적는다. 고칠 것이 나오면 그 위젯의 Task 로 돌아가 고치고
다시 설치한다. ⚠️ **「켜진 앱에서 누르면 주소가 바뀌는가」가 실패하면 여기서 멈추고 친구에게 알린다** — 설계에서 열어 둔 것이라
방법(예: LauncherActivity 에서 기존 화면을 닫고 다시 여는 것)을 새로 정해야 한다.

**Files:**
- Modify: `docs/superpowers/specs/2026-09-21-android-widgets-design.md`(끝에 「시험 결과」 절) · `CLAUDE.md`(안드로이드 위젯 줄)

- [ ] **Step 1: 가장 긴 글 셋을 띄워 본다(날짜를 정한 시험판)**

날짜 셋(`2026-04-20` 말씀 **69자** 삼상 26:24 · `2026-09-13` 묵상 **117자** · `2026-10-10` 기도문 **245자** 「순종의 축복」)을
**하나씩** 차례로 한다. 날짜 하나마다:
```bash
cd /c/Projects/bible-memorize-church-app-v2/android-app
export JAVA_HOME="/c/Users/sewki/.android-tools/jdk-17"; export ANDROID_HOME="/c/Users/sewki/.android-tools/sdk"
export PATH="$ANDROID_HOME/platform-tools:$PATH"
D=2026-04-20   # 두 번째는 2026-09-13, 세 번째는 2026-10-10
./gradlew -q --no-daemon assembleDevDebug -PwidgetDate=$D && adb install -r app/build/outputs/apk/dev/debug/app-dev-debug.apk
```
→ 친구에게 부탁(대화로): 위젯 셋을 **지웠다가 다시 놓기**(`onUpdate` 가 그 날짜로 새로 받는다 — 크기만 바꾸면
`onAppWidgetOptionsChanged` 가 적어 둔 옛것으로 그린다). 친구가 「놓았다」고 하면:
```bash
S="/c/Users/sewki/AppData/Local/Temp/claude/c--Projects-bible-memorize-church-app-v2/d9b735f6-ad79-4e4f-8e37-9c4b300b6a5b/scratchpad"
adb exec-out screencap -p > "$S/and-long-$D.png"
```
Read 로 보고, 그날의 가장 긴 글이 4×2 에서 **끝까지** 보이는지 확인한다. 잘리면 그 레이아웃의 `autoSizeMinTextSize` 를
1sp 낮추고 다시(최저 9sp). 9sp 에서도 잘리면 친구에게 「이 위젯은 4×3 이상을 권한다」로 할지 묻는다.
셋이 끝나면 날짜 없이 다시 설치하고 위젯을 다시 놓는다:
`./gradlew -q --no-daemon assembleDevDebug && adb install -r app/build/outputs/apk/dev/debug/app-dev-debug.apk`

- [ ] **Step 2: 켜진 앱 / 꺼진 앱에서 누르기**

1. 꺼진 상태: 최근 앱에서 「성경암송 시험」을 쓸어 없앤다 → 이번주 말씀 위젯 누르기 → 찍기 → 그 구절 암송 화면인가.
2. 켜진 상태: 앱을 열어 첫 화면에 둔 채 홈 버튼 → 이번주 말씀 위젯 누르기 → 찍기 → **첫 화면이 아니라 그 구절 암송 화면**인가.
3. 켜진 상태에서 묵상 위젯 → 매일 묵상 창, 기도문 위젯 → 기도문 화면인가.
Expected: 셋 다 그 화면. 2·3 이 첫 화면에 머물면 멈추고 친구에게 알린다(이 Task 머리말).

- [ ] **Step 3: 어두운 모드 · 큰 글씨 · 비행기 모드**

```bash
export ANDROID_HOME="/c/Users/sewki/.android-tools/sdk"; export PATH="$ANDROID_HOME/platform-tools:$PATH"
S="/c/Users/sewki/AppData/Local/Temp/claude/c--Projects-bible-memorize-church-app-v2/d9b735f6-ad79-4e4f-8e37-9c4b300b6a5b/scratchpad"
adb shell cmd uimode night yes;  adb exec-out screencap -p > "$S/and-dark.png"
adb shell cmd uimode night no
adb shell settings put system font_scale 1.3; adb exec-out screencap -p > "$S/and-font13.png"
adb shell settings put system font_scale 1.0
```
어두운 모드: 바탕 `#1C1C1E` · 글씨가 읽히는가 · 마크가 보이는가. 큰 글씨(1.3): 잘림 없는가(autoSize 가 줄인다).
비행기 모드: 친구에게 비행기 모드를 켜 달라고 한 뒤, 이번주 말씀 위젯을 **하나 더** 놓는다 → 새 위젯에 **마지막 내용**이 보이는가
(「불러오지 못했습니다」가 아니라). 끝나면 비행기 모드를 끈다.
⚠️ `font_scale` 은 반드시 1.0 으로 되돌린다 — 친구 폰 설정이다.

- [ ] **Step 4: 다음 날 아침 확인(2026-09-22)**

친구에게 부탁: 9/22 아침에 위젯을 본다 → 묵상이 「화요일」·새 본문(「비교하고 나면 우쭐하거나…」)으로 바뀌었는가.
찍어서 본다. 안 바뀌었으면 `adb shell dumpsys alarm | grep -A3 memorize.dev` 로 예약이 있는지 본다.

- [ ] **Step 5: 결과를 적고 커밋**

`docs/superpowers/specs/2026-09-21-android-widgets-design.md` 끝에 더한다(확인한 대로 채운다 — 폰 기종·안드로이드 판·
통과/고친 것·「켜진 앱에서 누르기」 결과):
```markdown
## 시험 결과 (2026-09-2x · 친구 폰 <기종> · 안드로이드 <판> · 시험판)
| 확인 | 결과 |
|---|---|
| 위젯 목록에 셋 · 4×2 · 더 작게 안 줄어듦 | |
| 세로로 늘리면 이번주 말씀 큰 글씨 | |
| 가장 긴 글(69 · 117 · 245자) 잘림 없음 | |
| 꺼진 앱 / 켜진 앱에서 누르기 | |
| 어두운 모드 · 글씨 1.3배 | |
| 비행기 모드 → 마지막 내용 | |
| 다음 날 아침 새 내용 | |
```
`CLAUDE.md` 안드로이드 위젯 줄의 「로컬 제작·실기기(USB) 시험 중」을 「시험판 확인 끝(날짜) — 남은 것: 9/27 승인 뒤 Task 8」로 바꾼다.
```bash
cd /c/Projects/bible-memorize-church-app-v2
git commit -q -F - -- docs/superpowers/specs/2026-09-21-android-widgets-design.md CLAUDE.md <<'EOF'
docs(안드로이드 위젯): 시험판 실기기 확인 결과

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
git push -q origin main
```
그리고 친구에게: 시험이 끝났으니 「성경암송 시험」은 **지워도 된다**(안드로이드 11 이하에서는 링크를 누를 때 두 앱 중 고르라는 창이
뜰 수 있다). 개발자 옵션의 USB 디버깅도 꺼도 된다 — Task 8 에서 다시 켠다.

---

### Task 8: (⚠️ 2026-09-27 프로덕션 승인 **뒤에만**) 정식판 서명·판 번호·업로드

**시작 조건:** 친구가 「프로덕션 승인이 났다」고 알려 준 뒤. 그 전에는 이 Task 의 어떤 단계도 하지 않는다.

**Files:**
- Modify: `android-app/app/build.gradle`(서명 설정 · versionCode/versionName) · `CLAUDE.md`
- Create(git 무시): `android-app/keystore.properties`

**Interfaces:**
- Consumes: Task 1 의 `old-app/badging.txt`(versionCode) · Play Console 의 지금 판 번호 · 업로드 키

- [ ] **Step 1: 업로드 키가 어느 것인지 맞춘다**

친구에게 부탁: Play Console → Google Play로 보호됨 → Play 스토어 보호 → 앱 서명키 보호 → 「Play 앱 서명 관리」 →
**업로드 키 인증서 SHA-256** 을 알려 달라고 한다(비밀이 아니다). 이 PC 의 두 키 지문은 PWABuilder 가 함께 준
`assetlinks.json` 에 있다(비밀번호 없이 본다):
```bash
cd /c/Projects/bible-memorize-church-app-v2
for D in "성경암송 - Google Play package" "성경암송 - Google Play package - New"; do
  PYTHONIOENCODING=utf-8 python -c "import json,sys; print(sys.argv[1], json.load(open(sys.argv[1]+'/assetlinks.json',encoding='utf-8'))[0]['target']['sha256_cert_fingerprints'])" "$D"
done
```
Expected: 옛것 `08:D5:69:8D:…` · 「New」 `3A:17:3C:B2:…`. 친구가 알려 준 값과 같은 쪽의 폴더를 Step 2 에 쓴다
(아래는 「New」일 때). 운영 assetlinks 에는 `BE:91…`(구글 앱 서명 키) · `3A:17…` 이 있다(설계 ④).
업로드 키 재설정을 먼저 하기로 하면 그 새 키로 한다(CLAUDE.md 다음 작업 「업로드 키 재설정」).

- [ ] **Step 2: 서명 속성 파일을 만든다(비밀번호를 화면에 찍지 않고)**

`signing-key-info.txt` 의 **항목 이름만** 먼저 본다(값은 가린다):
```bash
cd "/c/Projects/bible-memorize-church-app-v2/성경암송 - Google Play package - New"
sed -E 's/:.*/: ***/' signing-key-info.txt
```
그 이름에 맞춰, 값을 찍지 않고 `android-app/keystore.properties` 를 만든다(아래는 이름이 `Key store password` · `Key alias` ·
`Key password` 일 때 — Step 의 출력에 맞게 바꾼다):
```bash
cd /c/Projects/bible-memorize-church-app-v2
PYTHONIOENCODING=utf-8 python - <<'EOF'
import re
src = "성경암송 - Google Play package - New/signing-key-info.txt"
t = open(src, encoding="utf-8").read()
def pick(label):
    m = re.search(r"^\s*" + re.escape(label) + r"\s*:\s*(.+?)\s*$", t, re.M | re.I)
    if not m: raise SystemExit("못 찾았다: " + label)
    return m.group(1)
props = {
    "storeFile": "C:/Projects/bible-memorize-church-app-v2/성경암송 - Google Play package - New/signing.keystore",
    "storePassword": pick("Key store password"),
    "keyAlias": pick("Key alias"),
    "keyPassword": pick("Key password"),
}
with open("android-app/keystore.properties", "w", encoding="utf-8") as f:
    for k, v in props.items():
        f.write(f"{k}={v}\n")
print("keystore.properties 를 만들었다(값은 찍지 않는다)")
EOF
git check-ignore -q android-app/keystore.properties && echo "OK: git 무시 대상"
```
Expected: `OK: git 무시 대상`. 안 뜨면 **멈추고** `android-app/.gitignore` 부터 고친다.

- [ ] **Step 3: 빌드에 서명과 판 번호를 넣는다**

`android-app/app/build.gradle` 맨 위 `plugins { … }` 블록 바로 밑에:
```groovy
// 정식판 서명 — 값은 git 밖의 keystore.properties 에만 있다(저장소 공개). 한글 경로라 UTF-8 로 읽는다.
def keystoreProps = new Properties()
def keystorePropsFile = rootProject.file("keystore.properties")
if (keystorePropsFile.exists()) {
    keystorePropsFile.withReader("UTF-8") { keystoreProps.load(it) }
}
```
`android {` 블록 안(`buildTypes` 위)에:
```groovy
    signingConfigs {
        release {
            if (keystorePropsFile.exists()) {
                storeFile file(keystoreProps['storeFile'])
                storePassword keystoreProps['storePassword']
                keyAlias keystoreProps['keyAlias']
                keyPassword keystoreProps['keyPassword']
            }
        }
    }
```
`buildTypes { release { minifyEnabled true } }` 의 `release` 안에 `signingConfig signingConfigs.release` 를 더한다.
`defaultConfig` 의 `versionCode` 를 **Play Console 에 올라가 있는 가장 높은 판 + 1** 로, `versionName` 을 그다음 판 이름으로 바꾼다
(Task 1 `badging.txt` 의 값은 PWABuilder 로 처음 뽑은 판이다 — Play Console 이 더 높으면 그쪽을 따른다).

- [ ] **Step 4: 정식판 aab 를 뽑고 서명을 확인한다**

```bash
cd /c/Projects/bible-memorize-church-app-v2/android-app
export JAVA_HOME="/c/Users/sewki/.android-tools/jdk-17"; export ANDROID_HOME="/c/Users/sewki/.android-tools/sdk"
./gradlew --no-daemon testProdReleaseUnitTest bundleProdRelease
"$JAVA_HOME/bin/keytool" -printcert -jarfile app/build/outputs/bundle/prodRelease/app-prod-release.aab | grep -m1 SHA256
```
Expected: `BUILD SUCCESSFUL` · SHA256 이 Step 1 에서 정한 **업로드 키** 지문과 같다. 그리고 Task 2 대조를 정식판
APK(`./gradlew assembleProdRelease` → `app-prod-release.apk`)로 한 번 더 돌린다.

- [ ] **Step 5: 비공개 테스트 → 프로덕션**

친구에게 부탁(Play Console): 비공개 테스트 트랙에 `app-prod-release.aab` 업로드 → 출시 노트 「홈 화면 위젯 셋(이번주 말씀 ·
오늘의 묵상 · 오늘의 축복 기도문)」 → 검토. 설치된 플레이스토어 앱을 업데이트해 **주소창 없이** 열리는지, 로그인·아침 알림이
그대로인지, 위젯 셋이 보이는지 본다. 괜찮으면 프로덕션으로 승격. 데이터 보안 양식은 **바꾸지 않는다**(위젯은 공개 정보만 받는다).

- [ ] **Step 6: 판 번호 커밋 · 기록**

```bash
cd /c/Projects/bible-memorize-church-app-v2
git status --porcelain android-app | grep -E "keystore" && echo "!! 멈춘다" || echo "OK"
git commit -q -F - -- android-app/app/build.gradle CLAUDE.md <<'EOF'
chore(안드로이드): 정식판 서명 설정(값은 git 밖) · 판 번호 올림 — 위젯 판 업로드

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
git push -q origin main
```
CLAUDE.md 안드로이드 위젯 줄을 「프로덕션 업로드(날짜) · 심사 결과 대기」로 바꾸고 체크한다.
