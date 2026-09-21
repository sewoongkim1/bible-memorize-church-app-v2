import WidgetKit
import SwiftUI

// 고척교회 성경암송 — 이번주 말씀 위젯
//   홈 화면: 가로로 긴 것 · 큰 네모(글씨 크게)  ·  잠금 화면(2026-09-20 더함): 네모·시계 위 한 줄
//   누르면 그 구절 암송 화면으로 바로 간다(gocheokmemorize://verse?no=번호 → AppDelegate → /?v=번호).
// 로그인 없이 보이는 공개 정보만 다룬다. user_id·개인정보는 절대 포함하지 않는다.

struct VerseEntry: TimelineEntry {
    let date: Date
    let no: Int?
    let reference: String
    let text: String
}

// ⚠️ 이 이름(kind)은 바꾸지 않는다 — 성도님이 이미 홈 화면에 놓은 위젯이 이 이름으로 이어진다.
private let verseWidgetKind = "TodayVerseWidget"

private func verseIsValid(_ json: [String: Any]) -> Bool {
    ((json["text"] as? String) ?? "").isEmpty == false
}

private func verseEntry(from json: [String: Any]?) -> VerseEntry {
    guard let json = json, let text = json["text"] as? String, !text.isEmpty else {
        return VerseEntry(date: Date(), no: nil, reference: "", text: "말씀을 불러오지 못했습니다")
    }
    return VerseEntry(date: Date(),
                      no: json["no"] as? Int,
                      reference: json["ref"] as? String ?? "",
                      text: text)
}

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> VerseEntry {
        VerseEntry(date: Date(), no: nil, reference: "요한복음 3:16",
                   text: "하나님이 세상을 이처럼 사랑하사 독생자를 주셨으니")
    }

    func getSnapshot(in context: Context, completion: @escaping (VerseEntry) -> Void) {
        if context.isPreview {
            completion(placeholder(in: context))
            return
        }
        fetchWithFallback(kind: verseWidgetKind, action: "getWeeklyVerse", isValid: verseIsValid) { json, _ in
            completion(verseEntry(from: json))
        }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<VerseEntry>) -> Void) {
        fetchWithFallback(kind: verseWidgetKind, action: "getWeeklyVerse", isValid: verseIsValid) { json, fresh in
            let entry = verseEntry(from: json)
            let when = refreshDate(fresh: fresh, next: nextKSTMidnight())
            completion(Timeline(entries: [entry], policy: .after(when)))
        }
    }
}

struct TodayVerseWidgetView: View {
    @Environment(\.widgetFamily) private var family
    var entry: Provider.Entry

    // 구절 번호를 알면 그 구절 암송 화면으로, 모르면 앱만 연다.
    private var link: URL? {
        guard let no = entry.no else { return URL(string: "\(widgetScheme)://home") }
        return URL(string: "\(widgetScheme)://verse?no=\(no)")
    }

    var body: some View {
        content.widgetURL(link)
    }

    @ViewBuilder
    private var content: some View {
        switch family {
        case .accessoryInline:
            // 잠금 화면 시계 위 한 줄 — 넘치는 것은 시스템이 알아서 자른다
            Text(entry.reference.isEmpty ? entry.text : "\(entry.reference) · \(entry.text)")
                .widgetBackground(clear: true)
        case .accessoryRectangular:
            // 잠금 화면 네모 — 구절 이름 한 줄 + 본문 두 줄(친구 결정 2026-09-20: 첫 글자 가림 없이 본문 그대로)
            VStack(alignment: .leading, spacing: 1) {
                if !entry.reference.isEmpty {
                    Text(entry.reference)
                        .font(.caption2.weight(.semibold))
                        .widgetAccentable()
                }
                Text(entry.text)
                    .font(.caption)
                    .lineLimit(2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .widgetBackground(clear: true)
        case .systemLarge:
            // 홈 화면 큰 네모(4×4) — 같은 말씀을 **글씨만 크게**(2026-09-21 친구 결정).
            // 멀리서도, 돋보기 없이도 읽히게 하려는 크기라 중간 것과 내용은 같다.
            // 구절 길이가 20~69자로 벌어져서, 긴 구절은 minimumScaleFactor 가 알아서 줄인다
            // (글씨 크기 설정을 「아주 큼」으로 쓰시는 분도 이 덕에 잘리지 않는다).
            VStack(alignment: .leading, spacing: 10) {
                WidgetHeader(title: "이번주 말씀", large: true)
                Spacer(minLength: 0)
                Text(entry.text)
                    .font(.system(.title, design: .serif))
                    .lineSpacing(4)
                    .lineLimit(9)
                    .minimumScaleFactor(0.6)
                Spacer(minLength: 0)
                if !entry.reference.isEmpty {
                    Text(entry.reference)
                        .font(.headline)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(20)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
            .widgetBackground()
        default:
            // 홈 화면 가로로 긴 것(systemMedium). 큰 네모는 위 가지.
            // ⚠️ 작은 네모(systemSmall)를 일부러 뺐다(2026-09-21 친구 요청). 본문이 가장 긴 구절은
            //    69자라(삼상 26:24) 정사각형 폭으로는 어떻게 줄여도 뒤가 잘린다 — 「다 안 보이는 말씀」은
            //    안 보여 주느니만 못하다. 잘릴 일이 없으니 줄 수를 넉넉히 두고 축소도 덜 쓴다.
            VStack(alignment: .leading, spacing: 6) {
                WidgetHeader(title: "이번주 말씀")
                Text(entry.text)
                    .font(.system(.footnote, design: .serif))
                    .lineLimit(5)
                    .minimumScaleFactor(0.75)
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
}

struct TodayVerseWidget: Widget {
    let kind: String = verseWidgetKind

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            TodayVerseWidgetView(entry: entry)
        }
        .configurationDisplayName("이번주 말씀")
        .description("이번주 암송 구절을 홈 화면·잠금 화면에서 봅니다. 누르면 바로 암송 화면으로 갑니다.")
        // ⚠️ .systemSmall 을 다시 넣지 말 것 — 본문이 잘린다(위 default 가지의 설명).
        //    이미 작은 네모로 놓아 둔 분은 지우고 다시 넣으셔야 한다(크기는 나중에 못 바꾼다).
        .supportedFamilies([.systemMedium, .systemLarge, .accessoryRectangular, .accessoryInline])
    }
}
