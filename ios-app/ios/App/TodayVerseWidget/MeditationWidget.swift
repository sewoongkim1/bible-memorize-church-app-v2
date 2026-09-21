import WidgetKit
import SwiftUI

// 고척교회 성경암송 — 오늘의 묵상 위젯(홈 화면 중간·크게, 2026-09-20)
//   이번 주 설교의 **오늘 요일** 묵상. 무엇을 보일지는 서버가 앱과 같은 규칙으로 고른다
//   (api 함수 getTodayMeditation · 대조 시험 tests/widget-parity.py).
//   누르면 앱의 매일 묵상 창이 열린다(gocheokmemorize://meditation → /?w=meditation).

struct MeditationEntry: TimelineEntry {
    let date: Date
    let dayLabel: String
    let heading: String
    let message: String
    let question: String
}

private let meditationWidgetKind = "MeditationWidget"

// 「준비하고 있어요」(ready:false)도 지금의 진짜 상태이므로 쓸 만한 응답으로 본다.
private func meditationIsValid(_ json: [String: Any]) -> Bool {
    guard (json["ok"] as? Bool) == true else { return false }
    let message = (json["message"] as? String) ?? ""
    let question = (json["question"] as? String) ?? ""
    return !message.isEmpty || !question.isEmpty
}

private func meditationEntry(from json: [String: Any]?) -> MeditationEntry {
    guard let json = json else {
        return MeditationEntry(date: Date(), dayLabel: "", heading: "",
                               message: "묵상을 불러오지 못했습니다", question: "")
    }
    return MeditationEntry(date: Date(),
                           dayLabel: json["dayLabel"] as? String ?? "",
                           heading: json["heading"] as? String ?? "",
                           message: json["message"] as? String ?? "",
                           question: json["question"] as? String ?? "")
}

struct MeditationProvider: TimelineProvider {
    func placeholder(in context: Context) -> MeditationEntry {
        MeditationEntry(date: Date(), dayLabel: "월", heading: "공장이 아닌 아버지",
                        message: "하나님은 나를 단숨에 찍어내는 공장이 아니라 시간을 들여 기르시는 아버지이십니다.",
                        question: "오늘 나는 하나님께 어떤 속도의 변화를 기대하고 있나요?")
    }

    func getSnapshot(in context: Context, completion: @escaping (MeditationEntry) -> Void) {
        if context.isPreview {
            completion(placeholder(in: context))
            return
        }
        fetchWithFallback(kind: meditationWidgetKind, action: "getTodayMeditation", isValid: meditationIsValid) { json, _ in
            completion(meditationEntry(from: json))
        }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<MeditationEntry>) -> Void) {
        fetchWithFallback(kind: meditationWidgetKind, action: "getTodayMeditation", isValid: meditationIsValid) { json, fresh in
            // 주일 오후에 올라오는 설교가 늦어도 반나절 안에 따라오게 — 다음 자정과 6시간 뒤 중 이른 때.
            let next = min(nextKSTMidnight(), Date().addingTimeInterval(6 * 3600))
            completion(Timeline(entries: [meditationEntry(from: json)],
                                policy: .after(refreshDate(fresh: fresh, next: next))))
        }
    }
}

struct MeditationWidgetView: View {
    @Environment(\.widgetFamily) private var family
    var entry: MeditationEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            WidgetHeader(title: entry.dayLabel.isEmpty ? "오늘의 묵상" : "오늘의 묵상 · \(entry.dayLabel)요일")
            if !entry.heading.isEmpty {
                Text(entry.heading)
                    .font(.system(.subheadline, design: .serif).weight(.semibold))
                    .lineLimit(1)
            }
            // ⚠️ 적용 질문은 위젯에 싣지 않는다(2026-09-21 친구 요청) — 본문이 74~117자인데
            //    질문이 한 줄을 차지하면 가로로 긴 위젯에 본문이 3줄(약 75자)밖에 안 남아 거의 매일
            //    뒤가 잘렸다. 질문은 눌러서 여는 앱의 묵상 창에 그대로 있다.
            //    본문이 비고 질문만 있는 날(daily_meditations 가 그렇게 올 수 있다)에만 질문을 본문 자리에 쓴다.
            Text(entry.message.isEmpty ? entry.question : entry.message)
                .font(.system(family == .systemLarge ? .body : .footnote, design: .serif))
                .lineLimit(family == .systemLarge ? 14 : 6)
                .minimumScaleFactor(0.75)
            Spacer(minLength: 0)
        }
        .padding()
        .widgetURL(URL(string: "\(widgetScheme)://meditation"))
        .widgetBackground()
    }
}

struct MeditationWidget: Widget {
    let kind: String = meditationWidgetKind

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: MeditationProvider()) { entry in
            MeditationWidgetView(entry: entry)
        }
        .configurationDisplayName("오늘의 묵상")
        .description("이번주 설교의 오늘 요일 묵상을 봅니다. 누르면 적용 질문까지 함께 봅니다.")
        .supportedFamilies([.systemMedium, .systemLarge])
    }
}
