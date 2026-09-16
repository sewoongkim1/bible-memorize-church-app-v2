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
