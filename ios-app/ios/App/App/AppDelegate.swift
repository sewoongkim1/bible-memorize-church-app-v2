import UIKit
import Capacitor
import UserNotifications
import WebKit

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?
    private let statusBarBackground = UIView()
    private let brandNavy = UIColor(red: 0.05, green: 0.11, blue: 0.24, alpha: 1)

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        installStatusBarBackground()
        configureNativeAppCss()
        configureWebViewScrolling()
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
