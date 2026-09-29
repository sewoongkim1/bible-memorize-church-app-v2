import UIKit
import Capacitor
import UserNotifications
import WebKit
import SwiftUI

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate {

    var window: UIWindow?
    private let statusBarBackground = UIView()
    private let brandNavy = UIColor(red: 0.05, green: 0.11, blue: 0.24, alpha: 1)
    private let hasLoggedInKey = "hasLoggedInBefore"
    // ⚠️ 위젯(WidgetShared.swift 의 widgetScheme)·Info.plist(CFBundleURLSchemes)와 **같은 값**이어야 한다.
    private let widgetURLScheme = "gocheokmemorize"
    // 등록 시점엔 아직 로그인(user_id)이 없을 수 있어 저장에 실패할 수 있다 — 토큰을
    // 기억해 뒀다가 앱이 다시 활성화될 때마다(로그인 뒤 재실행 포함) 다시 시도한다.
    private var cachedDeviceTokenHex: String?
    // 가로로 조금이라도(픽셀 단위) 밀리면 즉시 0으로 되돌리는 관찰자 — bounces를 꺼서
    // 세로 튕김을 없앤 부작용으로, 미세한 가로 밀림이 저절로 안 돌아오고 그 자리에
    // 고정돼 버리는 문제(성도님 제보 2026-09-16)를 막는다.
    private var horizontalScrollLock: NSKeyValueObservation?

    // 암송 화면 상단 요절 배너(.test-ref-sticky) — 웹의 position:fixed 가 WKWebView에서
    // 키보드가 뜬 채로는 다시 그리기를 못해(2026-09-18, 실기기 영상으로 확인) 화면 CSS만으로는
    // 못 고쳤다. window 위에 진짜 네이티브 뷰를 따로 얹어 웹의 스크롤·키보드와 완전히
    // 무관하게 항상 제자리에 보이게 한다. 텍스트는 웹의 .test-ref-sticky를 그대로 옮겨 온다
    // (문구를 두 군데서 관리하지 않기 위해 폴링으로 읽어 온다 — 이 코드베이스에 아직
    // WKScriptMessageHandler 다리가 없어, 새로 놓는 것보다 가벼운 폴링이 더 안전하다).
    private let verseRefContainer = UIView()
    private let verseRefLabel = UILabel()
    private var verseRefTimer: Timer?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // ⚠️ WKWebView는 실시간으로 불러오는 gocheok.onlybible.kr의 app.js·style.css를
        // 자체 디스크 캐시에 남겨 둔다 — 사파리는 즉시 새 판을 받는데, 앱은 완전종료했다
        // 다시 켜도 옛 CSS·JS를 계속 보여줬다(서버는 이미 새 판을 내보내는 게 확인됐는데도,
        // 성도님 실기기로 여러 번 재확인, 2026-09-18). 로그인 정보(localStorage)·쿠키는
        // 안 건드리고 리소스 캐시만 비워, 앱을 켤 때마다 서버에서 새로 받게 한다.
        WKWebsiteDataStore.default().removeData(
            ofTypes: [WKWebsiteDataTypeDiskCache, WKWebsiteDataTypeMemoryCache],
            modifiedSince: Date(timeIntervalSince1970: 0)
        ) {}

        // 이걸 안 하면 앱이 화면에 떠 있는(포그라운드) 동안 온 푸시는 iOS가 "보여줄까?"를
        // 물어볼 데가 없어 조용히 무시해 버린다(애플 서버는 정상 전달했다고 답하는데도
        // 화면엔 아무것도 안 뜨는 문제 — 실기기 테스트로 확인됨, 2026-09-16).
        UNUserNotificationCenter.current().delegate = self
        installStatusBarBackground()
        installVerseRefOverlay()
        configureNativeAppCss()
        installAppInfoMarker()
        configureWebViewScrolling()
        startVerseRefPolling()
        DispatchQueue.main.async {
            self.presentNativeLoginIfNeeded()
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
            self.configureNativeAppCss()
            self.installAppInfoMarker()
            self.configureWebViewScrolling()
            self.retryCachedPushTokenIfAny()
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
            self.configureNativeAppCss()
            self.installAppInfoMarker()
            self.configureWebViewScrolling()
            self.retryCachedPushTokenIfAny()
        }
        // 이미 로그인된(재실행) 사용자만 여기서 바로 알림 권한을 묻는다 — 최초 사용자는
        // 아직 정보를 입력하기도 전이라 물어보면 맥락 없이 뜬금없다. 최초 사용자는
        // completeNativeLogin()에서 로그인을 마친 직후에 대신 묻는다.
        if UserDefaults.standard.bool(forKey: hasLoggedInKey) {
            requestPushPermissionAndRegister()
        }
        return true
    }

    private func requestPushPermissionAndRegister() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
            guard granted else { return }
            DispatchQueue.main.async {
                UIApplication.shared.registerForRemoteNotifications()
            }
        }
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
        // 로그인을 마친 직후에야 알림 권한을 묻는다 — "정보도 안 넣었는데 왜 물어보지"
        // 하는 혼란을 없애고, 이 시점부터는 곧 user_id가 생기므로 토큰 저장도 잘 이어진다.
        requestPushPermissionAndRegister()
        // 방금 심은 로그인 정보로 웹이 서버 동기화를 마칠 시간을 준 뒤, 이미 받아 둔
        // 기기 토큰이 있으면 그제서야 user_id가 생겼을 테니 다시 저장을 시도한다.
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { self.retryCachedPushTokenIfAny() }
        DispatchQueue.main.asyncAfter(deadline: .now() + 5) { self.retryCachedPushTokenIfAny() }
    }

    private func dismissNativeLogin() {
        window?.rootViewController?.presentedViewController?.dismiss(animated: true) {
            self.installStatusBarBackground()
            self.configureNativeAppCss()
            self.installAppInfoMarker()
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

    // 요절 배너 컨테이너를 window에 한 번만 만들어 얹는다(statusBarBackground와 같은 자리 —
    // window에 직접 붙여야 웹뷰의 스크롤·키보드 리사이즈가 이 뷰의 위치에 전혀 영향을
    // 못 준다). 스타일은 style.css의 .test-ref-sticky를 그대로 옮긴 값이다.
    private func installVerseRefOverlay() {
        guard let window = window, verseRefContainer.superview == nil else { return }

        verseRefContainer.backgroundColor = .white
        verseRefContainer.layer.borderColor = UIColor(red: 0.784, green: 0.659, blue: 0.294, alpha: 1).cgColor // --gold
        verseRefContainer.layer.borderWidth = 1.5
        verseRefContainer.layer.cornerRadius = 12
        verseRefContainer.layer.maskedCorners = [.layerMinXMaxYCorner, .layerMaxXMaxYCorner] // 아래쪽만 둥글게
        verseRefContainer.layer.shadowColor = UIColor.black.cgColor
        verseRefContainer.layer.shadowOpacity = 0.15
        verseRefContainer.layer.shadowOffset = CGSize(width: 0, height: 4)
        verseRefContainer.layer.shadowRadius = 8
        verseRefContainer.isUserInteractionEnabled = false
        verseRefContainer.isHidden = true
        verseRefContainer.translatesAutoresizingMaskIntoConstraints = false

        verseRefLabel.font = UIFont(name: "NanumMyeongjo-ExtraBold", size: 17) ?? UIFont.boldSystemFont(ofSize: 17)
        verseRefLabel.textColor = UIColor(red: 0.051, green: 0.106, blue: 0.243, alpha: 1) // --navy-dark
        verseRefLabel.textAlignment = .center
        verseRefLabel.numberOfLines = 1
        verseRefLabel.adjustsFontSizeToFitWidth = true
        verseRefLabel.minimumScaleFactor = 0.7
        verseRefLabel.translatesAutoresizingMaskIntoConstraints = false

        verseRefContainer.addSubview(verseRefLabel)
        window.addSubview(verseRefContainer)

        // ⚠️ leading/trailing을 >=/<=(최소 여백)로 두면 컨테이너가 글자 길이에 맞춰
        // 좁게 줄어들어, 웹의 .test-ref-sticky(가로로 넓게 퍼짐)와 다르게 보인다
        // (성도님 스크린샷으로 확인, 2026-09-18 — 앱은 좁은 상자, 웹은 옆으로 넓음).
        // 등호(=)로 바꿔 안전 영역 양옆 20pt를 뺀 만큼 실제로 채우게 한다.
        NSLayoutConstraint.activate([
            verseRefContainer.topAnchor.constraint(equalTo: window.safeAreaLayoutGuide.topAnchor),
            verseRefContainer.leadingAnchor.constraint(equalTo: window.leadingAnchor, constant: 20),
            verseRefContainer.trailingAnchor.constraint(equalTo: window.trailingAnchor, constant: -20),

            verseRefLabel.topAnchor.constraint(equalTo: verseRefContainer.topAnchor, constant: 10),
            verseRefLabel.bottomAnchor.constraint(equalTo: verseRefContainer.bottomAnchor, constant: -10),
            verseRefLabel.leadingAnchor.constraint(equalTo: verseRefContainer.leadingAnchor, constant: 16),
            verseRefLabel.trailingAnchor.constraint(equalTo: verseRefContainer.trailingAnchor, constant: -16),
        ])
    }

    // 0.4초마다 웹의 .test-ref-sticky 글자를 읽어 온다 — 있으면(암송 화면이면) 네이티브
    // 배너를 보여주고, 없으면(다른 화면) 숨긴다. 이 값을 웹의 것과 별도로 계산하지 않고
    // 그대로 옮겨 오므로, 구절 문구를 두 군데서 관리할 필요가 없다.
    private func startVerseRefPolling() {
        verseRefTimer?.invalidate()
        verseRefTimer = Timer.scheduledTimer(withTimeInterval: 0.4, repeats: true) { [weak self] _ in
            self?.pollVerseRef()
        }
    }

    private func pollVerseRef() {
        guard let bridgeVC = window?.rootViewController as? CAPBridgeViewController,
              let webView = bridgeVC.webView else { return }
        webView.evaluateJavaScript(
            "(function(){var e=document.querySelector('.test-ref-sticky');return e?e.textContent:'';})()"
        ) { [weak self] result, _ in
            guard let self = self else { return }
            let text = (result as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            if text.isEmpty {
                self.verseRefContainer.isHidden = true
            } else {
                if self.verseRefLabel.text != text { self.verseRefLabel.text = text }
                self.verseRefContainer.isHidden = false
                self.window?.bringSubviewToFront(self.verseRefContainer)
            }
        }
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

    // 앱 판 표식 — 웹(app.js)은 늘 최신인데 이 껍데기는 성도님마다 판이 다르다. 웹이 「몇 판
    // 껍데기 안에서 도는가」를 알아야 옛 판에만 「App Store에서 업데이트해 주세요」를 띄울 수 있어,
    // window.GOCHEOK_APP = {platform, version, build} 를 심는다(받는 쪽: js/push.js 의 nativeAppInfo).
    // 값은 Info.plist 에서 읽는다 — MARKETING_VERSION 과 Codemagic 이 올린 빌드 번호가 그대로 오므로
    // 손으로 맞출 곳이 없다. ⚠️ 이 표식이 없는 앱 = 이 코드가 들어가기 전 판(1.1.0 이하).
    private var appInfoScriptInstalled = false

    private func installAppInfoMarker() {
        guard let bridgeVC = window?.rootViewController as? CAPBridgeViewController,
              let webView = bridgeVC.webView else { return }
        let info = Bundle.main.infoDictionary ?? [:]
        // JS 문자열에 그대로 끼워 넣으므로 숫자와 점만 남긴다
        let digitsOnly: (Any?) -> String = { value in
            String(((value as? String) ?? "").filter { $0.isASCII && ($0.isNumber || $0 == ".") })
        }
        let version = digitsOnly(info["CFBundleShortVersionString"])
        let build = digitsOnly(info["CFBundleVersion"])
        let js = "window.GOCHEOK_APP={platform:'ios',version:'\(version)',build:'\(build)'};"
            + "try{window.dispatchEvent(new Event('gocheok-app'))}catch(e){}"
        if !appInfoScriptInstalled {
            appInfoScriptInstalled = true
            // 앞으로 열리는 모든 문서(위젯으로 연 주소·첫 로그인 뒤 다시 여는 것 포함)에 문서 시작 때 심는다
            webView.configuration.userContentController.addUserScript(
                WKUserScript(source: js, injectionTime: .atDocumentStart, forMainFrameOnly: true)
            )
        }
        // 앱을 켤 때 이미 열리기 시작한 첫 문서는 위 스크립트를 놓쳤을 수 있다 — 지금 문서에도 바로 심는다
        webView.evaluateJavaScript(js)
    }

    private func configureWebViewScrolling() {
        guard let rootView = window?.rootViewController?.view else { return }
        disableBounce(in: rootView)
    }

    private func disableBounce(in view: UIView) {
        if let webView = view as? WKWebView {
            webView.scrollView.bounces = false
            webView.scrollView.alwaysBounceVertical = false
            webView.scrollView.alwaysBounceHorizontal = false
            lockHorizontalScrolling(for: webView)
        }
        for subview in view.subviews {
            disableBounce(in: subview)
        }
    }

    // KVO로 감시만 한다(delegate를 가로채지 않는다) — Capacitor가 이 webView.scrollView에
    // 이미 자기 자신의 delegate를 쓰고 있을 수 있어, 그걸 대체하지 않고도 안전하게
    // contentOffset.x만 되돌릴 수 있는 방법이다. 한 웹뷰당 한 번만 등록한다.
    private func lockHorizontalScrolling(for webView: WKWebView) {
        guard horizontalScrollLock == nil else { return }
        horizontalScrollLock = webView.scrollView.observe(\.contentOffset, options: [.new]) { scrollView, change in
            guard let offset = change.newValue, offset.x != 0 else { return }
            scrollView.contentOffset.x = 0
        }
    }

    // 기기 토큰을 받으면 기억해 두고 저장을 시도한다. 이 시점엔 아직 로그인(user_id)이
    // 안 끝났을 수 있어 한 번에 안 될 수 있다 — applicationDidBecomeActive에서 캐시된
    // 토큰으로 계속 재시도하므로, 여기서 실패해도 다음 번 포그라운드 때 자연스레 이어진다.
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let tokenHex = deviceToken.map { String(format: "%02x", $0) }.joined()
        cachedDeviceTokenHex = tokenHex
        attemptSavePushToken(deviceToken: tokenHex)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        // 조용히 무시 — 시뮬레이터·권한 거부 등에서 정상적으로 발생할 수 있다.
    }

    // 앱이 포그라운드(화면에 떠 있는 상태)일 때 푸시가 오면 iOS가 이 메서드로 "보여줘도
    // 되는지" 물어본다 — 배너·소리·배지를 명시적으로 허락해야 뜬다(기본값은 무시).
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                 willPresent notification: UNNotification,
                                 withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound, .badge])
    }

    private func retryCachedPushTokenIfAny() {
        if let token = cachedDeviceTokenHex { attemptSavePushToken(deviceToken: token) }
    }

    // 웹뷰의 localStorage(memorize-user)에서 user_id를 읽어 서버에 기기 토큰을 저장한다.
    // 로그인 전이면(아직 user_id 없음) 이번엔 조용히 건너뛴다 — applicationDidBecomeActive가
    // 앱을 열 때마다 같은 캐시된 토큰으로 다시 불러 준다.
    private func attemptSavePushToken(deviceToken: String) {
        guard let bridgeVC = window?.rootViewController as? CAPBridgeViewController,
              let webView = bridgeVC.webView else { return }
        webView.evaluateJavaScript("localStorage.getItem('memorize-user')") { result, _ in
            guard let json = result as? String, !json.isEmpty,
                  let data = json.data(using: .utf8),
                  let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let userId = obj["user_id"] as? String else { return }
            self.saveTokenToServer(userId: userId, deviceToken: deviceToken)
        }
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
        installVerseRefOverlay()
        configureNativeAppCss()
        installAppInfoMarker()
        configureWebViewScrolling()
        startVerseRefPolling()
        // 등록 시점엔 로그인 전이라 저장이 안 됐을 수 있다 — 앱을 열 때마다 재시도해서,
        // 로그인이 끝난 뒤 처음 여는 순간 반드시 한 번은 서버에 저장되게 한다.
        retryCachedPushTokenIfAny()
    }

    func applicationWillTerminate(_ application: UIApplication) {
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        if url.scheme == widgetURLScheme {
            openFromWidget(url)
            return true
        }
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    // 위젯을 누르면 gocheokmemorize://verse?no=31 · ://meditation · ://prayer 로 앱이 열린다.
    // 웹 주소로 바꿔 웹뷰에 실어 준다 — /?v=31(구절 암송) · /?w=meditation · /?w=prayer
    // (받는 쪽은 app.js 의 routeAfterLoad · getDeepLinkVerseNo · getWidgetTarget).
    // ⚠️ 스킴 이름은 위젯 쪽 WidgetShared.swift 의 widgetScheme, Info.plist 의 CFBundleURLSchemes 와 같아야 한다.
    private func openFromWidget(_ url: URL) {
        // 첫 로그인 전이면 네이티브 로그인 화면이 먼저다 — 그 위로 다른 화면을 열지 않는다.
        guard UserDefaults.standard.bool(forKey: hasLoggedInKey) else { return }

        let base = "https://gocheok.onlybible.kr/"
        let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        var target: String?
        switch url.host ?? "" {
        case "verse":
            if let no = items.first(where: { $0.name == "no" })?.value.flatMap({ Int($0) }) {
                target = base + "?v=\(no)"
            }
        case "meditation":
            target = base + "?w=meditation"
        case "prayer":
            target = base + "?w=prayer"
        default:
            target = nil            // ://home 등 — 앱만 열고 보던 화면 그대로 둔다
        }

        guard let target = target, let dest = URL(string: target),
              let bridgeVC = window?.rootViewController as? CAPBridgeViewController,
              let webView = bridgeVC.webView else { return }
        webView.load(URLRequest(url: dest))
        // 새 문서로 넘어가면 documentElement 에 심어 둔 --app-safe-top 이 사라진다 —
        // 앱을 켤 때와 같은 간격으로 다시 넣는다(configureNativeAppCss 는 여러 번 불러도 안전하다).
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) { self.configureNativeAppCss() }
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) { self.configureNativeAppCss() }
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}
