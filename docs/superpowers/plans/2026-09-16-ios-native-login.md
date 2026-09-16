# 네이티브 로그인 화면(SwiftUI) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 아이폰 앱을 처음 여는 성도님이 SwiftUI 네이티브 화면에서 로그인(구분·소속·이름)하면, 그 정보를 웹뷰의 localStorage에 심어 웹(`app.js`)이 평소처럼 서버 로그인·진도 동기화를 이어받게 한다. iOS 2단계(네이티브 기능 3종: 위젯·푸시·로그인) 중 마지막.

**Architecture:** 네이티브는 서버를 직접 호출하지 않는다. `app.js`가 앱을 켤 때마다(`routeAfterLoad → enterAfterLogin → syncProgress`, `app.js:538`) 이미 서버 `login` 액션을 스스로 불러 `user_id`·진도·복습을 받아오므로, 네이티브는 **로컬(localStorage)에 로그인 정보만 심어 두면** 충분하다. `AppDelegate`가 최초 실행 때만(UserDefaults 플래그) 기존 웹뷰(Capacitor `CAPBridgeViewController`) 위에 SwiftUI 로그인 화면을 모달로 띄우고, 제출되면 `webView.evaluateJavaScript`로 `memorize-user`·`privacy-consent`를 심은 뒤 `?firstLogin=1`로 재진입시킨다. `app.js`는 이 파라미터를 보고 딱 한 번 "축복 인사" 환영 카드를 보여준다.

**Tech Stack:** SwiftUI(`ios-app/ios/App/App/NativeLoginView.swift`, 새 파일) + UIKit(`AppDelegate.swift`, 기존 파일 수정) + `app.js`(기존 파일 수정, 2줄). **서버(Edge Function·DB) 변경 없음** — 이전 두 계획(위젯·푸시)과 다른 점.

## Global Constraints

- iOS 앱 프로젝트: `ios-app/ios/App/`(Capacitor, git에 그대로 커밋돼 있다). Bundle ID `kr.onlybible.gocheok.memorize`(고정)
- **서버 호출이 전혀 없다** — 이 계획은 `app.js` 한 곳 + iOS 네이티브 파일들만 건드린다. Supabase 배포 단계가 없다.
- `app.js`의 `GU_LIST`(46번째 줄)·`BU_LIST`(47번째 줄)·`MOK_RE`(1163번째 줄, `/^(\d+|남성)$/`)를 Swift에 **그대로** 옮긴다 — 둘 중 하나가 바뀌면 반드시 함께 고친다(각 파일에 상대 파일을 가리키는 주석을 남긴다).
- `index.html`의 `.privacy-box` 문구(90번째 줄 부근)를 Swift에 **그대로** 옮긴다 — 다시 쓰지 않는다(문구가 갈리는 것 자체가 CLAUDE.md에 적힌 반려·오안내 위험이다).
- **이 앱엔 로그아웃 기능이 없다**(`clearUser()`가 정의는 있으나 호출하는 곳이 없음, 확인됨) — 네이티브 로그인 화면은 "최초 1회"만 신경 쓰면 된다.
- 새 `UserDefaults` 키 `hasLoggedInBefore` — 한 번 서면(로그아웃이 없으므로) 앱을 지우고 다시 설치하기 전까지 계속 유지된다.
- **Xcode·Codemagic이 필요한 단계(Task 2 이후)는 이 Windows 머신에서 실행할 수 없다** — Codemagic 빌드 로그로만 검증한다. 위젯·푸시 때처럼 여러 차례 iteration이 정상일 수 있다.
- Task 1(`app.js`)은 이 머신에서 직접 실행·검증한다(Node 문법 확인 + localhost 수동 확인).
- `app.js`를 고치면 **반드시** `python tools/bump.py`로 캐시태그를 올리고, 배포 후 `APP_BUILD`로 확인한다(CLAUDE.md 배포 체크리스트) — 손으로 태그를 고치지 않는다.
- pbxproj를 손으로 편집한 뒤에는 항상 중괄호 균형을 Python으로 확인한다: `python -c "s=open('ios-app/ios/App/App.xcodeproj/project.pbxproj',encoding='utf-8').read(); print('open:',s.count('{'),'close:',s.count('}'))"` → 두 숫자가 같아야 한다.

---

### Task 1: `app.js` — 네이티브 첫 로그인 축복 인사 카드 연동 (`?firstLogin=1`)

**Files:**
- Modify: `app.js:189-192` (`routeAfterLoad`의 기본 진입 분기, `maybeShowIntro(...)` 콜백)

**Interfaces:**
- Produces: URL 쿼리 파라미터 `?firstLogin=1` 처리 — Task 3(AppDelegate)이 최초 로그인 완료 후 웹뷰를 이 파라미터로 연다.

- [ ] **Step 1: 기본 진입 분기 수정**

`app.js`에서 다음 블록을 찾는다(`routeAfterLoad` 함수 맨 끝, 190번째 줄 부근):

```javascript
  maybeShowIntro(() => {
    if (loadUser()) enterAfterLogin();
    else renderEntryScreen();
  });
}
```

다음으로 교체:

```javascript
  maybeShowIntro(() => {
    // 네이티브(iOS) 로그인 화면이 최초 로그인 뒤 이 파라미터로 웹뷰를 연다 —
    // 이번 한 번만 "축복 인사" 환영 카드를 보여준다(웹 로그인 폼 제출과 같은 경험).
    // 다른 딥링크 파라미터(?v=, ?preview=)처럼 읽은 뒤 URL을 정리해 새로고침 시 재진입을 막는다.
    let firstLogin = false;
    try {
      firstLogin = new URLSearchParams(location.search).get("firstLogin") === "1";
      if (firstLogin) history.replaceState(null, "", location.pathname);
    } catch (e) {}
    if (loadUser()) enterAfterLogin({ fresh: firstLogin });
    else renderEntryScreen();
  });
}
```

- [ ] **Step 2: Node 문법 확인**

Run: `node --check app.js`
Expected: 아무 출력 없음(문법 오류 없음).

- [ ] **Step 3: preflight 확인**

Run: `python tools/preflight.py`
Expected: 통과(캐시태그·문법 이상 없음 — 이번 수정은 태그를 건드리지 않으므로 그대로 통과해야 한다).

- [ ] **Step 4: localhost 수동 확인**

```bash
python -m http.server 8080
```

브라우저로 `http://localhost:8080/` 접속(자동으로 개발 DB를 본다 — 화면 오른쪽 위 "개발 DB" 띠 확인) 후 개발자 도구 콘솔에서:

```javascript
localStorage.clear();
localStorage.setItem('memorize-user', JSON.stringify({type: "교구", gu: "믿음", mok: "3", name: "테스트유저"}));
localStorage.setItem('privacy-consent', '1');
location.href = 'http://localhost:8080/?firstLogin=1';
```

Expected: (처음 보는 브라우저 프로필이면) 인트로 슬라이드 → 넘기면 **"축복 인사" 카드**(민수기 6:24-26, "테스트유저 성도님, 환영합니다")가 뜬다 → "아멘, 시작하기"를 누르면 요약 화면으로 간다(개발 DB에 새 회원이 만들어졌을 것 — 실제 성도님 데이터가 아니므로 문제없다).

이어서 새로고침(`location.reload()` 또는 주소창에서 다시 엔터, `?firstLogin=1` 없이):
Expected: 축복 인사 카드가 **다시 뜨지 않고** 곧바로 요약 화면으로 간다(정상 재실행 경로).

- [ ] **Step 5: 캐시태그 올리기**

```bash
python tools/bump.py
```

- [ ] **Step 6: 커밋 + 푸시**

`git status`로 `bump.py`가 실제로 건드린 파일을 확인한다(보통 `index.html`의 `?v=` 태그·스플래시 버전과 `app.js`의 `APP_BUILD`뿐이다 — `style.css`·`js/*.js` 자체는 바뀌지 않는다, 참조하는 쪽인 index.html만 바뀐다). **그 목록에 있는 파일만** 스테이징한다(다른 세션의 미완성 변경을 함께 올리지 않기 위함):

```bash
git status
git add app.js index.html
git commit -m "$(cat <<'EOF'
feat(ios-login): 네이티브 첫 로그인 시 축복 인사 카드 연동(?firstLogin=1)

네이티브 로그인 화면(다음 작업)이 최초 로그인 뒤 이 파라미터로 웹뷰를
열면, 웹 로그인 폼 제출과 같은 첫 환영 경험(민수기 6:24-26 카드)을 보게
한다. 다른 딥링크 파라미터처럼 읽은 뒤 URL을 정리한다.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
git push origin main
```

- [ ] **Step 7: 배포 확인**

```bash
V=$(grep -o 'app.js?v=[0-9a-z]*' index.html | head -1 | cut -d= -f2)
curl -s "https://gocheok.onlybible.kr/app.js?v=$V" | grep -o 'APP_BUILD = "[0-9a-z]*"'
```

Expected: `index.html`에 적힌 태그와 라이브 `app.js`의 `APP_BUILD`가 일치. Actions 배포가 아직 안 끝났으면 1~2분 뒤 재시도.

---

### Task 2: SwiftUI 네이티브 로그인 화면 + AppDelegate 연동

**Files:**
- Create: `ios-app/ios/App/App/NativeLoginView.swift`
- Modify: `ios-app/ios/App/App.xcodeproj/project.pbxproj` (App 타겟 Sources에 새 파일 등록)
- Modify: `ios-app/ios/App/App/AppDelegate.swift` (전체 교체 — 기존 로직 보존 + 로그인 화면 표시 추가)

**Interfaces:**
- Consumes: Task 1의 `?firstLogin=1` 처리(`app.js`)
- Produces: `UserDefaults` 키 `hasLoggedInBefore`(Bool)

⚠️ **이 파일들은 Swift/Xcode 코드라 이 Windows 머신에서 컴파일 확인이 불가능하다** — Task 3(Codemagic 빌드)에서만 검증된다.

- [ ] **Step 1: `NativeLoginView.swift` 작성**

```swift
import SwiftUI

// app.js의 GU_LIST(46번째 줄)와 반드시 함께 고친다.
private let nativeLoginGuList = ["믿음", "소망", "사랑", "섬김", "은혜", "화평", "기쁨", "새가족"]
// app.js의 BU_LIST(47번째 줄)와 반드시 함께 고친다.
private let nativeLoginBuList = ["사랑부", "영아부", "유아부", "유치부", "유년부", "초등부", "중등부", "고등부", "청년부"]

// app.js의 MOK_RE(1163번째 줄, /^(\d+|남성)$/)와 정확히 같은 규칙 — 표기가 흔들리면
// identity_key가 갈려 같은 사람이 다른 사람으로 인식된다.
private func isValidMok(_ s: String) -> Bool {
    guard let regex = try? NSRegularExpression(pattern: "^(\\d+|남성)$") else { return false }
    let range = NSRange(s.startIndex..<s.endIndex, in: s)
    return regex.firstMatch(in: s, range: range) != nil
}

// index.html의 .privacy-box 문구(90번째 줄 부근)를 그대로 옮긴 것 — 문구를 바꿀 때 두 곳을 함께 고친다.
private let nativeLoginPrivacyNotice = "성경말씀 암송 앱은 개인 암송 진도 저장과 교회 내 참여 통계를 위해 이름, 소속, 암송 진행 기록, 복습 및 도전 참여 기록을 저장합니다. 수집된 정보는 암송 프로그램 운영 목적으로만 사용되며, 운영 종료 또는 삭제 요청 시 정리됩니다."

struct NativeLoginPayload {
    let type: String // "교구" | "교회학교"
    let gu: String?
    let mok: String?
    let bu: String?
    let grade: String?
    let name: String

    // app.js의 saveUser()가 localStorage에 저장하는 것과 같은 모양의 JSON을 만든다.
    func toDictionary() -> [String: Any] {
        var d: [String: Any] = ["type": type, "name": name]
        if type == "교구" {
            d["gu"] = gu ?? ""
            d["mok"] = mok ?? ""
        } else {
            d["bu"] = bu ?? ""
            d["grade"] = grade ?? ""
        }
        return d
    }
}

struct NativeLoginView: View {
    let onComplete: (NativeLoginPayload) -> Void

    @State private var type = "교구"
    @State private var gu = ""
    @State private var mok = ""
    @State private var bu = ""
    @State private var grade = ""
    @State private var name = ""
    @State private var consented = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationView {
            Form {
                Section {
                    Picker("구분", selection: $type) {
                        Text("교구").tag("교구")
                        Text("교회학교").tag("교회학교")
                    }
                    .pickerStyle(.segmented)
                }

                if type == "교구" {
                    Section("교구") {
                        Picker("교구", selection: $gu) {
                            Text("선택 안 함").tag("")
                            ForEach(nativeLoginGuList, id: \.self) { g in Text(g).tag(g) }
                        }
                    }
                    Section("목장") {
                        TextField("숫자 또는 남성 (예: 3, 남성, 없으면 99)", text: $mok)
                    }
                } else {
                    Section("부서") {
                        Picker("부서", selection: $bu) {
                            Text("선택 안 함").tag("")
                            ForEach(nativeLoginBuList, id: \.self) { b in Text(b).tag(b) }
                        }
                    }
                    Section("학년") {
                        TextField("예: 3학년", text: $grade)
                    }
                }

                Section("성명") {
                    TextField("이름", text: $name)
                }

                Section("개인정보 수집·이용 안내") {
                    Text(nativeLoginPrivacyNotice)
                        .font(.footnote)
                        .foregroundColor(.secondary)
                    Button("자세히 보기") {
                        if let url = URL(string: "https://gocheok.onlybible.kr/privacy/") {
                            UIApplication.shared.open(url)
                        }
                    }
                    Toggle("위 개인정보 수집·이용 안내를 확인하고 동의합니다.", isOn: $consented)
                }

                if let errorMessage = errorMessage {
                    Text(errorMessage).foregroundColor(.red)
                }

                Section {
                    Button("시작하기") { submit() }
                }
            }
            .navigationTitle("성경말씀 암송하기")
        }
    }

    private func submit() {
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty else { errorMessage = "이름을 입력해 주세요."; return }
        guard consented else { errorMessage = "개인정보 수집·이용 안내에 동의해 주세요."; return }

        if type == "교구" {
            guard !gu.isEmpty else { errorMessage = "교구를 선택해 주세요."; return }
            let trimmedMok = mok.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmedMok.isEmpty else { errorMessage = "목장을 입력해 주세요."; return }
            guard isValidMok(trimmedMok) else {
                errorMessage = "목장은 숫자 또는 '남성'만 입력할 수 있어요. (예: 3목장 → 3, 남성목장 → 남성, 없으면 → 99)"
                return
            }
            errorMessage = nil
            onComplete(NativeLoginPayload(type: type, gu: gu, mok: trimmedMok, bu: nil, grade: nil, name: trimmedName))
        } else {
            guard !bu.isEmpty else { errorMessage = "부서를 선택해 주세요."; return }
            let trimmedGrade = grade.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmedGrade.isEmpty else { errorMessage = "학년을 입력해 주세요."; return }
            errorMessage = nil
            onComplete(NativeLoginPayload(type: type, gu: nil, mok: nil, bu: bu, grade: trimmedGrade, name: trimmedName))
        }
    }
}
```

- [ ] **Step 2: pbxproj에 새 파일 등록 — PBXBuildFile 섹션**

`ios-app/ios/App/App.xcodeproj/project.pbxproj`에서 `/* End PBXBuildFile section */` 줄 바로 **앞**에 한 줄 추가:

```
		ACD533CDC9BCE7F6B817635E /* NativeLoginView.swift in Sources */ = {isa = PBXBuildFile; fileRef = 4ED697B54E31C0C9B4322268 /* NativeLoginView.swift */; };
```

- [ ] **Step 3: pbxproj에 새 파일 등록 — PBXFileReference 섹션**

`/* End PBXFileReference section */` 줄 바로 **앞**에 한 줄 추가:

```
		4ED697B54E31C0C9B4322268 /* NativeLoginView.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = NativeLoginView.swift; sourceTree = "<group>"; };
```

- [ ] **Step 4: pbxproj에 새 파일 등록 — PBXGroup 섹션**

"App" 그룹(`504EC3061FED79650016851F`) 안의 다음 줄:

```
				504EC3071FED79650016851F /* AppDelegate.swift */,
```

바로 다음 줄에 추가:

```
				4ED697B54E31C0C9B4322268 /* NativeLoginView.swift */,
```

- [ ] **Step 5: pbxproj에 새 파일 등록 — PBXSourcesBuildPhase 섹션**

App 타겟의 Sources 빌드 단계(`504EC3001FED79650016851F`) 안의 다음 줄:

```
				504EC3081FED79650016851F /* AppDelegate.swift in Sources */,
```

바로 다음 줄에 추가:

```
				ACD533CDC9BCE7F6B817635E /* NativeLoginView.swift in Sources */,
```

- [ ] **Step 6: pbxproj 검증**

Run: `python -c "s=open('ios-app/ios/App/App.xcodeproj/project.pbxproj',encoding='utf-8').read(); print('open:',s.count('{'),'close:',s.count('}'))"`
Expected: 두 숫자가 같음.

Run: `grep -c "NativeLoginView.swift" ios-app/ios/App/App.xcodeproj/project.pbxproj`
Expected: `6` (Step 2~5에서 넣은 4줄 중 BuildFile·FileReference 줄은 각각 두 번씩 이름이 나오고, Group·Sources 줄은 한 번씩 — 2+2+1+1=6).

- [ ] **Step 7: `AppDelegate.swift` 전체 교체**

전체 파일을 다음으로 교체(기존 상태바·CSS·바운스·푸시 등록 로직은 전부 그대로 두고, `import SwiftUI` + 로그인 관련 프로퍼티·메서드 4개만 더한다):

```swift
import UIKit
import Capacitor
import UserNotifications
import WebKit
import SwiftUI

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?
    private let statusBarBackground = UIView()
    private let brandNavy = UIColor(red: 0.05, green: 0.11, blue: 0.24, alpha: 1)
    private let hasLoggedInKey = "hasLoggedInBefore"

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        installStatusBarBackground()
        configureNativeAppCss()
        configureWebViewScrolling()
        DispatchQueue.main.async {
            self.presentNativeLoginIfNeeded()
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
            self.configureNativeAppCss()
            self.configureWebViewScrolling()
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
            self.configureNativeAppCss()
            self.configureWebViewScrolling()
        }
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
            guard granted else { return }
            DispatchQueue.main.async {
                UIApplication.shared.registerForRemoteNotifications()
            }
        }
        return true
    }

    // 이 기기에서 네이티브 로그인 화면으로 한 번이라도 로그인을 완료했으면(hasLoggedInKey)
    // 다시 안 보여준다 — 그다음부터는 웹뷰가 들고 있는 localStorage(memorize-user)로
    // app.js가 앱을 켤 때마다 스스로 서버와 동기화한다(syncProgress, app.js:538).
    // 이 앱엔 로그아웃 기능이 없어 이 플래그가 다시 내려갈 일이 없다.
    private func presentNativeLoginIfNeeded() {
        guard !UserDefaults.standard.bool(forKey: hasLoggedInKey) else { return }
        guard let root = window?.rootViewController, root.presentedViewController == nil else { return }
        let loginView = NativeLoginView { [weak self] payload in
            self?.completeNativeLogin(payload)
        }
        let hosting = UIHostingController(rootView: loginView)
        hosting.modalPresentationStyle = .fullScreen
        root.present(hosting, animated: false)
    }

    // 로그인 화면에서 "시작하기"를 누르면: 서버를 직접 부르지 않고, 웹뷰가 이미 쓰는
    // localStorage 키(memorize-user·privacy-consent)만 심어 둔 뒤 웹뷰를 새로 연다.
    // app.js가 스스로 서버 로그인·진도 동기화를 처리한다(설계 문서:
    // docs/superpowers/specs/2026-09-16-ios-native-login-design.md).
    // ⚠️ 한글이 포함된 JSON을 JS 문자열에 그대로 끼워 넣으면 인용부호 문제가 생길 수
    //    있어 base64로 감싸 JS 쪽에서 TextDecoder로 풀어낸다(UTF-8 손실 없음).
    private func completeNativeLogin(_ payload: NativeLoginPayload) {
        UserDefaults.standard.set(true, forKey: hasLoggedInKey)

        guard let jsonData = try? JSONSerialization.data(withJSONObject: payload.toDictionary()),
              let bridgeVC = window?.rootViewController as? CAPBridgeViewController,
              let webView = bridgeVC.webView else {
            dismissNativeLogin()
            return
        }

        let base64 = jsonData.base64EncodedString()
        let js = """
        (function () {
          var bytes = Uint8Array.from(atob('\(base64)'), function (c) { return c.charCodeAt(0); });
          var json = new TextDecoder().decode(bytes);
          localStorage.setItem('memorize-user', json);
          localStorage.setItem('privacy-consent', '1');
          location.href = 'https://gocheok.onlybible.kr/?firstLogin=1';
        })();
        """
        webView.evaluateJavaScript(js) { _, _ in
            DispatchQueue.main.async { self.dismissNativeLogin() }
        }
    }

    private func dismissNativeLogin() {
        window?.rootViewController?.presentedViewController?.dismiss(animated: true) {
            self.installStatusBarBackground()
            self.configureNativeAppCss()
            self.configureWebViewScrolling()
        }
    }

    private func installStatusBarBackground() {
        guard let window = window else { return }
        window.backgroundColor = brandNavy
        window.rootViewController?.view.backgroundColor = brandNavy
        if statusBarBackground.superview == nil {
            statusBarBackground.backgroundColor = brandNavy
            statusBarBackground.isUserInteractionEnabled = false
            statusBarBackground.translatesAutoresizingMaskIntoConstraints = false
            window.addSubview(statusBarBackground)
            NSLayoutConstraint.activate([
                statusBarBackground.topAnchor.constraint(equalTo: window.topAnchor),
                statusBarBackground.leadingAnchor.constraint(equalTo: window.leadingAnchor),
                statusBarBackground.trailingAnchor.constraint(equalTo: window.trailingAnchor),
                statusBarBackground.bottomAnchor.constraint(equalTo: window.safeAreaLayoutGuide.topAnchor),
            ])
        }
        window.bringSubviewToFront(statusBarBackground)
    }

    private func configureNativeAppCss() {
        guard let rootView = window?.rootViewController?.view else { return }
        applyNativeAppCss(in: rootView)
    }

    private func applyNativeAppCss(in view: UIView) {
        if let webView = view as? WKWebView {
            webView.evaluateJavaScript("document.documentElement.style.setProperty('--app-safe-top', '0px')")
        }
        for subview in view.subviews {
            applyNativeAppCss(in: subview)
        }
    }

    private func configureWebViewScrolling() {
        guard let rootView = window?.rootViewController?.view else { return }
        disableBounce(in: rootView)
    }

    private func disableBounce(in view: UIView) {
        if let webView = view as? WKWebView {
            webView.scrollView.bounces = false
            webView.scrollView.alwaysBounceVertical = false
        }
        for subview in view.subviews {
            disableBounce(in: subview)
        }
    }

    // 기기 토큰을 받으면, 웹뷰의 로그인 정보(localStorage의 memorize-user)를 읽어
    // user_id 와 함께 서버에 저장한다. 로그인 전이면(아직 memorize-user 없음) 조용히 건너뛴다
    // — 다음에 웹뷰가 다시 뜰 때(앱 재실행 등) 로그인 후 자연스럽게 재시도된다.
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let tokenHex = deviceToken.map { String(format: "%02x", $0) }.joined()
        guard let bridgeVC = window?.rootViewController as? CAPBridgeViewController,
              let webView = bridgeVC.webView else { return }
        webView.evaluateJavaScript("localStorage.getItem('memorize-user')") { result, _ in
            guard let json = result as? String, !json.isEmpty,
                  let data = json.data(using: .utf8),
                  let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let userId = obj["user_id"] as? String else { return }
            self.saveTokenToServer(userId: userId, deviceToken: tokenHex)
        }
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        // 조용히 무시 — 시뮬레이터·권한 거부 등에서 정상적으로 발생할 수 있다.
    }

    private func saveTokenToServer(userId: String, deviceToken: String) {
        let url = URL(string: "https://xnomlgydifiqiybervtf.supabase.co/functions/v1/api")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let anonKey = "sb_publishable_oLtieT_jw7Gjb8etEsy0jw_thBaDjl-"
        request.setValue("Bearer \(anonKey)", forHTTPHeaderField: "Authorization")
        request.setValue(anonKey, forHTTPHeaderField: "apikey")
        request.httpBody = try? JSONSerialization.data(withJSONObject: [
            "action": "saveIosPushToken",
            "user_id": userId,
            "deviceToken": deviceToken,
        ])
        URLSession.shared.dataTask(with: request).resume()
    }

    func applicationWillResignActive(_ application: UIApplication) {
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        installStatusBarBackground()
        configureNativeAppCss()
        configureWebViewScrolling()
    }

    func applicationWillTerminate(_ application: UIApplication) {
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}
```

⚠️ 교체 전 파일에 있던 메서드 이름 10개(`installStatusBarBackground`·`configureNativeAppCss`·`applyNativeAppCss`·`configureWebViewScrolling`·`disableBounce`·`didRegisterForRemoteNotificationsWithDeviceToken`·`didFailToRegisterForRemoteNotificationsWithError`·`saveTokenToServer`·생명주기 스텁 6개)이 교체 후에도 **모두** 있는지 확인한다 — 실수로 지우지 않았는지가 핵심이다.

- [ ] **Step 8: 커밋**

```bash
git add ios-app/ios/App/App/NativeLoginView.swift ios-app/ios/App/App/AppDelegate.swift ios-app/ios/App/App.xcodeproj/project.pbxproj
git commit -m "$(cat <<'EOF'
feat(ios-login): 네이티브 로그인 화면(SwiftUI) + 최초 실행 시 표시

서버를 직접 부르지 않고 localStorage(memorize-user·privacy-consent)만
심은 뒤 웹뷰를 ?firstLogin=1로 재진입시킨다 — 이후는 app.js의 기존
syncProgress()가 서버 등록·진도 동기화를 그대로 처리한다.
UserDefaults(hasLoggedInBefore)로 최초 1회만 표시한다.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
git push origin main
```

---

### Task 3 (사람이 직접): Codemagic `ios-testflight` 빌드 재실행

- [ ] **Step 1**: Codemagic → `ios-testflight` 워크플로 실행
- [ ] **Step 2**: 빌드 로그 확인 — SwiftUI(`import SwiftUI`, `UIHostingController`)는 이 프로젝트에서 처음 쓰는 것이라 새 오류가 날 수 있다. 로그를 컨트롤러에게 전달하면 이어서 고친다(위젯·푸시 때처럼 반복이 정상).
- [ ] **Step 3**: 빌드 성공 → TestFlight에 새 빌드 업로드 확인

---

### Task 4 (사람이 직접 + 컨트롤러가 함께 확인): 실기기 확인 + 기록

- [ ] **Step 1**: 아이폰에서 TestFlight 앱을 **완전히 삭제**(껍데기 상태로 되돌리기 위함 — `hasLoggedInBefore`도 이 기기에서 지워진다) 후 최신 빌드 재설치
- [ ] **Step 2**: 앱 실행 → 네이티브 로그인 화면이 뜨는지 확인(구분·교구/부서 목록·목장/학년·이름·개인정보 동의)
- [ ] **Step 3**: 정보를 입력하고 "시작하기" → (인트로 슬라이드가 있으면 지나서) "축복 인사" 환영 카드(민수기 6:24-26)가 뜨는지 → 확인 누르면 요약 화면으로 가는지 확인
- [ ] **Step 4**: 앱을 완전히 종료하고 다시 실행 → 네이티브 로그인 화면이 **다시 뜨지 않고** 곧바로 요약 화면으로 가는지 확인
- [ ] **Step 5 (컨트롤러가 함께 확인)**: Supabase 대시보드(운영 프로젝트 `xnomlgydifiqiybervtf`) → Table Editor → `users` 표에서 방금 입력한 이름으로 새 회원 행이 생겼는지 확인 — 서버 `login` RPC가 정상적으로 동작했다는 뜻
- [ ] **Step 6**: `CLAUDE.md`의 "다음 작업"에 iOS 2단계 완료 기록 추가

`CLAUDE.md`의 "다음 작업 (이어서 할 것)" 목록에 새 항목 추가(다른 항목들과 같은 위치, 맨 위):

```markdown
- [x] **iOS 2단계(네이티브 기능 3종) 완료 — 위젯·네이티브 푸시·네이티브 로그인 화면.**
      실기기 확인까지 마쳤다(위젯 홈 화면·푸시 알림 수신·최초 로그인 화면 모두 정상).
      설계는 `docs/superpowers/specs/2026-09-13-ios-app-design.md`(총괄)·
      `2026-09-16-ios-native-login-design.md`(로그인). **다음은 3단계(심사 제출)**:
      앱스토어 설명·스크린샷에 네이티브 기능(위젯·푸시·로그인)을 분명히 드러낼 것.
```

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: iOS 2단계(네이티브 기능 3종) 완료 기록

위젯·네이티브 푸시·네이티브 로그인 화면 모두 실기기 확인 완료.
다음은 3단계(App Store 심사 제출).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
git push origin main
```

---

## 이 계획이 끝나면

아이폰 앱을 처음 여는 성도님이 SwiftUI 네이티브 화면에서 로그인하고, 그 즉시 웹의 "축복 인사" 환영 경험까지 그대로 이어받는다. iOS 2단계(네이티브 기능 3종)가 전부 끝나 **3단계(App Store 정식 심사 제출)** 로 넘어갈 수 있다.

**의도적으로 미룬 것**: 로그인 화면의 시각적 꾸밈(로고·카드 레이아웃 등, 지금은 표준 SwiftUI Form)은 기능 확인이 먼저다 — 실기기로 써 보고 어색하면 그때 다듬는다. "정보 변경"(로그인 뒤 소속·이름 수정)은 계속 웹이 담당하며, 네이티브는 손대지 않는다.
