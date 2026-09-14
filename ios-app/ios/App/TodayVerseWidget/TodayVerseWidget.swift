import WidgetKit
import SwiftUI

// 고척교회 성경암송 — 오늘의 구절(이번주 말씀) 위젯
// 로그인 없이 보이는 공개 정보만 다룬다. user_id·개인정보는 절대 포함하지 않는다.

struct VerseEntry: TimelineEntry {
    let date: Date
    let reference: String
    let text: String
}

private let weeklyVerseURL = URL(string: "https://xnomlgydifiqiybervtf.supabase.co/functions/v1/api")!
private let anonKey = "sb_publishable_oLtieT_jw7Gjb8etEsy0jw_thBaDjl-"

func fetchWeeklyVerse(completion: @escaping (VerseEntry) -> Void) {
    var request = URLRequest(url: weeklyVerseURL)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("Bearer \(anonKey)", forHTTPHeaderField: "Authorization")
    request.setValue(anonKey, forHTTPHeaderField: "apikey")
    request.httpBody = try? JSONSerialization.data(withJSONObject: ["action": "getWeeklyVerse"])
    request.timeoutInterval = 15

    URLSession.shared.dataTask(with: request) { data, _, _ in
        let fallback = VerseEntry(date: Date(), reference: "", text: "말씀을 불러오지 못했습니다")
        guard let data = data,
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let text = json["text"] as? String, !text.isEmpty else {
            completion(fallback)
            return
        }
        let ref = json["ref"] as? String ?? ""
        completion(VerseEntry(date: Date(), reference: ref, text: text))
    }.resume()
}

// 다음 자정(한국시간)에 다시 받도록 — 서버 계산과 같은 기준(KST)을 쓴다
func nextKSTMidnight() -> Date {
    var cal = Calendar(identifier: .gregorian)
    cal.timeZone = TimeZone(identifier: "Asia/Seoul")!
    let startOfToday = cal.startOfDay(for: Date())
    return cal.date(byAdding: .day, value: 1, to: startOfToday) ?? Date().addingTimeInterval(86400)
}

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> VerseEntry {
        VerseEntry(date: Date(), reference: "요한복음 3:16",
                   text: "하나님이 세상을 이처럼 사랑하사 독생자를 주셨으니")
    }

    func getSnapshot(in context: Context, completion: @escaping (VerseEntry) -> Void) {
        if context.isPreview {
            completion(placeholder(in: context))
            return
        }
        fetchWeeklyVerse(completion: completion)
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<VerseEntry>) -> Void) {
        fetchWeeklyVerse { entry in
            let timeline = Timeline(entries: [entry], policy: .after(nextKSTMidnight()))
            completion(timeline)
        }
    }
}

struct TodayVerseWidgetView: View {
    var entry: Provider.Entry

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("이번주 말씀")
                .font(.caption2)
                .foregroundStyle(.secondary)
            Text(entry.text)
                .font(.system(.footnote, design: .serif))
                .lineLimit(4)
                .minimumScaleFactor(0.85)
            Spacer(minLength: 0)
            if !entry.reference.isEmpty {
                Text(entry.reference)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)
            }
        }
        .padding()
        .widgetBackground()
    }
}

// containerBackground(_:for:)는 iOS 17+ 전용 — 이 위젯의 배포 타겟은 16.0(설계 결정)
// 이라 16에서도 도는 대체 배경을 함께 둔다.
private extension View {
    @ViewBuilder
    func widgetBackground() -> some View {
        if #available(iOS 17.0, *) {
            containerBackground(.background, for: .widget)
        } else {
            background()
        }
    }
}

struct TodayVerseWidget: Widget {
    let kind: String = "TodayVerseWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            TodayVerseWidgetView(entry: entry)
        }
        .configurationDisplayName("이번주 말씀")
        .description("고척교회 성경암송 — 이번주 암송 구절을 홈 화면에서 바로 봅니다.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
