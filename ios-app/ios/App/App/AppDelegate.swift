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
    // 등록 시점엔 아직 로그인(user_id)이 없을 수 있어 저장에 실패할 수 있다 — 토큰을
    // 기억해 뒀다가 앱이 다시 활성화될 때마다(로그인 뒤 재실행 포함) 다시 시도한다.
    private var cachedDeviceTokenHex: String?

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
            self.retryCachedPushTokenIfAny()
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
            self.configureNativeAppCss()
            self.configureWebViewScrolling()
            self.retryCachedPushTokenIfAny()
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
        // 방금 심은 로그인 정보로 웹이 서버 동기화를 마칠 시간을 준 뒤, 이미 받아 둔
        // 기기 토큰이 있으면 그제서야 user_id가 생겼을 테니 다시 저장을 시도한다.
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { self.retryCachedPushTokenIfAny() }
        DispatchQueue.main.asyncAfter(deadline: .now() + 5) { self.retryCachedPushTokenIfAny() }
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
        configureNativeAppCss()
        configureWebViewScrolling()
        // 등록 시점엔 로그인 전이라 저장이 안 됐을 수 있다 — 앱을 열 때마다 재시도해서,
        // 로그인이 끝난 뒤 처음 여는 순간 반드시 한 번은 서버에 저장되게 한다.
        retryCachedPushTokenIfAny()
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
