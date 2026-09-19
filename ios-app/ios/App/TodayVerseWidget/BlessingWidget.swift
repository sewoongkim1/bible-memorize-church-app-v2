import WidgetKit
import SwiftUI

// 고척교회 성경암송 — 오늘의 축복 기도문 위젯(홈 화면 중간·크게, 2026-09-20)
//   앱의 「오늘 한 편」과 **같은 편**을 보여 준다(api 함수 getTodayBlessing).
//   ⚠️ 위젯은 로그인 이름을 모른다 — 기도문의 이름 자리는 서버가 「우리 가족」으로 채워 준다.
//      눌러서 앱으로 들어가면 지금처럼 로그인한 이름으로 같은 편이 보인다.
//   누르면 기도문 화면이 열린다(gocheokmemorize://prayer → /?w=prayer).

struct BlessingEntry: TimelineEntry {
    let date: Date
    let title: String
    let reference: String
    let prayer: String
}

private let blessingWidgetKind = "BlessingWidget"

private func blessingIsValid(_ json: [String: Any]) -> Bool {
    guard (json["ok"] as? Bool) == true else { return false }
    return ((json["prayer"] as? String) ?? "").isEmpty == false
}

private func blessingEntry(from json: [String: Any]?) -> BlessingEntry {
    guard let json = json, let prayer = json["prayer"] as? String, !prayer.isEmpty else {
        return BlessingEntry(date: Date(), title: "", reference: "",
                             prayer: "기도문을 불러오지 못했습니다")
    }
    return BlessingEntry(date: Date(),
                         title: json["title"] as? String ?? "",
                         reference: json["ref"] as? String ?? "",
                         prayer: prayer)
}

struct BlessingProvider: TimelineProvider {
    func placeholder(in context: Context) -> BlessingEntry {
        BlessingEntry(date: Date(), title: "아론의 축복", reference: "민수기 6:24-26",
                      prayer: "하나님, 우리 가족에게 복을 주시고 우리 가족을 지키시며, 여호와의 얼굴을 우리 가족에게 비추사 은혜를 베풀어 주옵소서.")
    }

    func getSnapshot(in context: Context, completion: @escaping (BlessingEntry) -> Void) {
        if context.isPreview {
            completion(placeholder(in: context))
            return
        }
        fetchWithFallback(kind: blessingWidgetKind, action: "getTodayBlessing", isValid: blessingIsValid) { json, _ in
            completion(blessingEntry(from: json))
        }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<BlessingEntry>) -> Void) {
        fetchWithFallback(kind: blessingWidgetKind, action: "getTodayBlessing", isValid: blessingIsValid) { json, fresh in
            completion(Timeline(entries: [blessingEntry(from: json)],
                                policy: .after(refreshDate(fresh: fresh, next: nextKSTMidnight()))))
        }
    }
}

struct BlessingWidgetView: View {
    @Environment(\.widgetFamily) private var family
    var entry: BlessingEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text("오늘의 축복 기도문")
                .font(.caption2)
                .foregroundStyle(.secondary)
            if !entry.title.isEmpty {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(entry.title)
                        .font(.system(.subheadline, design: .serif).weight(.semibold))
                        .lineLimit(1)
                    if !entry.reference.isEmpty {
                        Text(entry.reference)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }
            }
            Text(entry.prayer)
                .font(.system(.footnote, design: .serif))
                .lineLimit(family == .systemLarge ? 14 : 4)
                .minimumScaleFactor(0.85)
            Spacer(minLength: 0)
        }
        .padding()
        .widgetURL(URL(string: "\(widgetScheme)://prayer"))
        .widgetBackground()
    }
}

struct BlessingWidget: Widget {
    let kind: String = blessingWidgetKind

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: BlessingProvider()) { entry in
            BlessingWidgetView(entry: entry)
        }
        .configurationDisplayName("오늘의 축복 기도문")
        .description("가정 축복 기도문 오늘 한 편을 봅니다. 「우리 가족」으로 읽습니다.")
        .supportedFamilies([.systemMedium, .systemLarge])
    }
}
