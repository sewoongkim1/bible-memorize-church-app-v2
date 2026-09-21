import WidgetKit
import SwiftUI

// 위젯 셋(이번주 말씀 · 오늘의 묵상 · 오늘의 축복 기도문)이 함께 쓰는 것.
// ⚠️ 위젯은 **로그인 없이 보이는 공개 정보만** 다룬다 — user_id·개인정보는 절대 담지 않는다.
//    무엇을 보일지는 서버가 앱과 같은 규칙으로 계산해 준다(supabase/functions/api/index.ts 의
//    「위젯(아이폰)」 절 · 대조 시험 tests/widget-parity.py).
let widgetApiURL = URL(string: "https://xnomlgydifiqiybervtf.supabase.co/functions/v1/api")!
let widgetAnonKey = "sb_publishable_oLtieT_jw7Gjb8etEsy0jw_thBaDjl-"

// 위젯을 눌렀을 때 앱을 여는 주소의 앞머리.
// ⚠️ 앱 Info.plist 의 CFBundleURLSchemes · AppDelegate 의 openFromWidget 과 **같아야** 한다.
let widgetScheme = "gocheokmemorize"

func callWidgetApi(_ action: String, completion: @escaping ([String: Any]?) -> Void) {
    var request = URLRequest(url: widgetApiURL)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("Bearer \(widgetAnonKey)", forHTTPHeaderField: "Authorization")
    request.setValue(widgetAnonKey, forHTTPHeaderField: "apikey")
    request.httpBody = try? JSONSerialization.data(withJSONObject: ["action": action])
    request.timeoutInterval = 15

    URLSession.shared.dataTask(with: request) { data, response, _ in
        guard let http = response as? HTTPURLResponse, http.statusCode == 200,
              let data = data,
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            completion(nil)
            return
        }
        completion(json)
    }.resume()
}

// 다음 자정(한국시간)에 다시 받도록 — 서버 계산과 같은 기준(KST)을 쓴다
func nextKSTMidnight() -> Date {
    var cal = Calendar(identifier: .gregorian)
    cal.timeZone = TimeZone(identifier: "Asia/Seoul")!
    let startOfToday = cal.startOfDay(for: Date())
    return cal.date(byAdding: .day, value: 1, to: startOfToday) ?? Date().addingTimeInterval(86400)
}

// 마지막으로 성공한 응답을 위젯별로 적어 둔다 — 통신이 안 될 때 빈 위젯 대신 이것을 보인다.
// 위젯 익스텐션 **자신의** UserDefaults 라 App Group 을 만들 필요가 없다(공개 정보뿐이라 나눠 쓸 이유도 없다).
private func lastGoodKey(_ kind: String) -> String { "widget-last-" + kind }

func saveLastGood(_ kind: String, _ json: [String: Any]) {
    if let data = try? JSONSerialization.data(withJSONObject: json) {
        UserDefaults.standard.set(data, forKey: lastGoodKey(kind))
    }
}

func loadLastGood(_ kind: String) -> [String: Any]? {
    guard let data = UserDefaults.standard.data(forKey: lastGoodKey(kind)) else { return nil }
    return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
}

// 받아 오기 → 쓸 만하면 적어 두고 그것을, 아니면 적어 둔 마지막 것을 돌려준다.
// fresh 는 「이번에 새로 받았나」 — 실패면 자정까지 기다리지 않고 30분 뒤 다시 시도한다(refreshDate).
func fetchWithFallback(kind: String,
                       action: String,
                       isValid: @escaping ([String: Any]) -> Bool,
                       completion: @escaping (_ json: [String: Any]?, _ fresh: Bool) -> Void) {
    callWidgetApi(action) { json in
        if let json = json, isValid(json) {
            saveLastGood(kind, json)
            completion(json, true)
        } else {
            completion(loadLastGood(kind), false)
        }
    }
}

func refreshDate(fresh: Bool, next: Date) -> Date {
    fresh ? next : Date().addingTimeInterval(30 * 60)
}

// 홈 화면 위젯 머리글 — 교회 마크 + 이름(2026-09-21 친구 요청 · 아침 알림에 뜨는 것과 같은 그림).
// 그림은 WidgetAssets.xcassets/ChurchMark(루트 icon-512.png 의 여백을 잘라 낸 것).
// ⚠️ 마크는 글 **옆에만** 둔다. 글 뒤에 옅게 깔면(워터마크) 본문 대비가 무너진다 —
//    기도문 액자에서 잎가지 위 금색 글씨가 1.86:1 까지 떨어졌던 자리다(docs/notes/prayer-book.md).
// ⚠️ 잠금 화면(accessory)에는 쓰지 않는다 — 시스템이 한 가지 색으로 칠해 파랑·주황이 뭉개진다.
struct WidgetHeader: View {
    let title: String
    var large: Bool = false

    var body: some View {
        HStack(spacing: large ? 6 : 4) {
            Image("ChurchMark")
                .resizable()
                .scaledToFit()
                // 13pt 로 먼저 그려 봤더니 마크가 점처럼 보였다 — 글씨보다 한 치수 크게 둔다.
                // (그림은 24pt 기준 3배까지 있어 22pt 로 써도 흐려지지 않는다)
                .frame(height: large ? 22 : 16)
                .accessibilityHidden(true)
            Text(title)
                .font(large ? .subheadline : .caption2)
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
    }
}

// containerBackground(_:for:)는 iOS 17+ 전용 — 이 위젯의 배포 타겟은 16.0(설계 결정)이라
// 16에서도 도는 대체 배경을 함께 둔다. 잠금 화면(accessory)은 바탕을 깔지 않는다(시스템이 그린다).
extension View {
    @ViewBuilder
    func widgetBackground(clear: Bool = false) -> some View {
        if #available(iOS 17.0, *) {
            if clear {
                containerBackground(for: .widget) { Color.clear }
            } else {
                containerBackground(.background, for: .widget)
            }
        } else {
            if clear { self } else { background() }
        }
    }
}
