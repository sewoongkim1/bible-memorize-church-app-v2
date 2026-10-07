import WidgetKit
import SwiftUI

// 위젯 넷을 한 익스텐션에 담는다 — 새 번들 ID·서명이 필요 없다(2026-09-20 · 넷째는 2026-10-07).
@main
struct TodayVerseWidgetBundle: WidgetBundle {
    var body: some Widget {
        TodayVerseWidget()
        MeditationWidget()
        BlessingWidget()
        RotateWidget()
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 돌려 보기 위젯(홈 화면 중간·크게 · 2026-10-07 친구 요청)
//   이번주 말씀 → 오늘의 묵상 → 오늘의 축복 기도문 → 쉴만한 물가가 **30분마다 저절로** 바뀐다.
//   오른쪽 위에는 오늘 날짜와 시각(「10.07(수) 17:08」)이 뜬다.
//   위의 세 위젯은 겹쳐 두어도 손으로 밀어야 넘어간다(위젯 스택) — 「사람이 넘겨야만 바뀐다」가 불편이었다.
//   WidgetKit 은 위젯 안의 스크롤·계속 도는 애니메이션을 허락하지 않으므로, 타임라인에 장을 미리 깔아 두고
//   시스템이 그 시각에 바꿔 끼우게 한다(iOS 17 부터는 장이 바뀔 때 밀려 들어오는 전환이 보인다).
//   누르면 그때 보이던 장의 화면으로 간다(verse · meditation · prayer · psalm → AppDelegate.openFromWidget).
// ⚠️ 이 코드를 **새 파일로 빼지 말 것** — 위젯 타겟의 파일 목록은 project.pbxproj 에 손으로 등록돼 있다.
//    파일을 더하면 그 파일만 빠진 채 빌드되어 「RotateWidget 을 찾을 수 없다」로 깨진다.
// ⚠️ 기존 세 위젯의 kind(TodayVerseWidget·MeditationWidget·BlessingWidget)는 건드리지 않는다 —
//    성도님이 이미 놓아 둔 위젯이 그 이름으로 이어진다.
// ⚠️ 로그인 없이 보이는 공개 정보만 다룬다(다른 위젯과 같다). 쉴만한 물가는 서버가 「오늘까지 열린 편」만 준다
//    (api getTodayPsalm — 날짜 입력을 받지 않는다). 게이트가 꺼져 있으면 그 장은 빠지고 세 장으로 돈다.
// ⚠️ 글 뒤에 그림을 깔지 않는다(WidgetShared.swift WidgetHeader 의 설명 — 본문 대비가 무너진다).
// ⚠️ 시각은 **분마다 한 장씩** 타임라인에 깔아서 보인다(Text 의 저절로 가는 꼴은 초까지 나오는 타이머뿐이라
//    「17:08」 꼴을 만들 수 없다). 그래서 장 수가 많다(최대 6시간 = 360장) — 간격을 더 줄이거나 기간을 늘리지 말 것.
//    시스템이 바꿔 끼우는 것이 몇 초 늦을 수 있다(시계 위젯이 아니다).

struct RotateSlide {
    let kind: String       // verse · meditation · blessing · psalm
    let header: String
    let title: String
    let body: String
    let footer: String
    let link: String
}

struct RotateEntry: TimelineEntry {
    let date: Date
    let slide: RotateSlide
    let index: Int         // 몇째 장인가(점 표시)
    let count: Int
}

private let rotateWidgetKind = "RotateWidget"
// 한 장이 떠 있는 시간. 너무 짧으면 읽다가 바뀐다(친구 결정 2026-10-07: 30분).
private let rotateSeconds: TimeInterval = 30 * 60

// 「10.07(수) 17:08」 — 폰의 시간대로(홈 화면의 시계와 같은 시각이어야 한다) · 요일은 한국말
private let rotateClock: DateFormatter = {
    let f = DateFormatter()
    f.locale = Locale(identifier: "ko_KR")
    f.dateFormat = "MM.dd(E) HH:mm"
    return f
}()

private func rotateText(_ json: [String: Any]?, _ key: String) -> String {
    ((json?[key] as? String) ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
}

// 받은 자료 → 장 목록. 쓸 수 없는 것은 그 장만 뺀다(하나가 비어도 나머지는 돈다).
private func rotateSlides(verse: [String: Any]?, meditation: [String: Any]?,
                          blessing: [String: Any]?, psalm: [String: Any]?) -> [RotateSlide] {
    var out: [RotateSlide] = []

    let verseText = rotateText(verse, "text")
    if !verseText.isEmpty {
        let no = verse?["no"] as? Int
        let link = no.map { "\(widgetScheme)://verse?no=\($0)" } ?? "\(widgetScheme)://home"
        out.append(RotateSlide(kind: "verse", header: "이번주 말씀", title: "",
                               body: verseText, footer: rotateText(verse, "ref"), link: link))
    }

    // 묵상 — 본문이 비고 질문만 오는 날에는 질문을 본문 자리에(MeditationWidget 과 같다)
    let message = rotateText(meditation, "message")
    let question = rotateText(meditation, "question")
    let meditationBody = message.isEmpty ? question : message
    if !meditationBody.isEmpty {
        let day = rotateText(meditation, "dayLabel")
        out.append(RotateSlide(kind: "meditation",
                               header: day.isEmpty ? "오늘의 묵상" : "오늘의 묵상 · \(day)요일",
                               title: rotateText(meditation, "heading"),
                               body: meditationBody, footer: "", link: "\(widgetScheme)://meditation"))
    }

    let prayer = rotateText(blessing, "prayer")
    if !prayer.isEmpty {
        out.append(RotateSlide(kind: "blessing", header: "축복 기도문",
                               title: rotateText(blessing, "title"),
                               body: prayer, footer: rotateText(blessing, "ref"), link: "\(widgetScheme)://prayer"))
    }

    // 쉴만한 물가 — ready 가 아니면(게이트 꺼짐·시작 전) 이 장은 없다
    let psalmText = rotateText(psalm, "text")
    if (psalm?["ready"] as? Bool) == true, !psalmText.isEmpty {
        out.append(RotateSlide(kind: "psalm", header: "쉴만한 물가", title: "",
                               body: psalmText, footer: rotateText(psalm, "ref"), link: "\(widgetScheme)://psalm"))
    }
    return out
}

// 네 가지를 함께 받는다. 하나라도 이번에 새로 못 받았으면 fresh 가 아니다(30분 뒤 다시 받는다).
// 받은 것은 종류마다 따로 적어 두므로(fetchWithFallback) 통신이 안 될 때도 마지막 것으로 돈다.
private func rotateFetch(completion: @escaping (_ slides: [RotateSlide], _ fresh: Bool) -> Void) {
    let group = DispatchGroup()
    let lock = NSLock()
    var got: [String: [String: Any]] = [:]
    var allFresh = true

    func ask(_ key: String, _ action: String, _ isValid: @escaping ([String: Any]) -> Bool) {
        group.enter()
        fetchWithFallback(kind: rotateWidgetKind + "-" + key, action: action, isValid: isValid) { json, fresh in
            lock.lock()
            if let json = json { got[key] = json }
            if !fresh { allFresh = false }
            lock.unlock()
            group.leave()
        }
    }

    ask("verse", "getWeeklyVerse") { json in
        !rotateText(json, "text").isEmpty
    }
    ask("meditation", "getTodayMeditation") { json in
        (json["ok"] as? Bool) == true
            && (!rotateText(json, "message").isEmpty || !rotateText(json, "question").isEmpty)
    }
    ask("blessing", "getTodayBlessing") { json in
        (json["ok"] as? Bool) == true && !rotateText(json, "prayer").isEmpty
    }
    // 「아직 열리지 않음」(ready:false)도 지금의 진짜 상태다 — 쓸 만한 응답으로 본다(그 장만 빠진다)
    ask("psalm", "getTodayPsalm") { json in
        (json["ok"] as? Bool) == true
    }

    group.notify(queue: .main) {
        let slides = rotateSlides(verse: got["verse"], meditation: got["meditation"],
                                  blessing: got["blessing"], psalm: got["psalm"])
        completion(slides, allFresh)
    }
}

private let rotateSample = RotateSlide(kind: "verse", header: "이번주 말씀", title: "",
                                       body: "하나님이 세상을 이처럼 사랑하사 독생자를 주셨으니",
                                       footer: "요한복음 3:16", link: "gocheokmemorize://home")
private let rotateEmpty = RotateSlide(kind: "verse", header: "말씀 · 묵상 · 기도", title: "",
                                      body: "말씀을 불러오지 못했습니다", footer: "", link: "gocheokmemorize://home")

struct RotateProvider: TimelineProvider {
    func placeholder(in context: Context) -> RotateEntry {
        RotateEntry(date: Date(), slide: rotateSample, index: 0, count: 4)
    }

    func getSnapshot(in context: Context, completion: @escaping (RotateEntry) -> Void) {
        if context.isPreview {
            completion(placeholder(in: context))
            return
        }
        rotateFetch { slides, _ in
            let first = slides.first ?? rotateEmpty
            completion(RotateEntry(date: Date(), slide: first, index: 0, count: max(slides.count, 1)))
        }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<RotateEntry>) -> Void) {
        rotateFetch { slides, fresh in
            let now = Date()
            let list = slides.isEmpty ? [rotateEmpty] : slides
            // 다음 자정(한국)과 6시간 뒤 중 이른 때까지를 미리 깐다 — 묵상은 주일 오후에 올라오는 설교를
            // 반나절 안에 따라가야 한다(MeditationWidget 과 같은 까닭). 아무것도 못 받았으면 30분 뒤 다시.
            let end = slides.isEmpty ? now.addingTimeInterval(30 * 60)
                                     : min(nextKSTMidnight(), now.addingTimeInterval(6 * 3600))
            // 분마다 한 장(오른쪽 위 시각이 따라가게). 어느 장을 보일지는 「그 시각을 30분으로 나눈 몫」으로
            // 정한다 — 다시 받아도 같은 시각에는 같은 장이라, 갱신할 때마다 첫 장으로 되돌아가지 않는다.
            func entry(at when: Date) -> RotateEntry {
                let slot = Int(when.timeIntervalSince1970 / rotateSeconds)
                let i = slot % list.count
                return RotateEntry(date: when, slide: list[i], index: i, count: list.count)
            }
            var entries: [RotateEntry] = [entry(at: now)]
            var t = (now.timeIntervalSince1970 / 60).rounded(.down) * 60 + 60
            while t < end.timeIntervalSince1970 && entries.count < 400 {
                entries.append(entry(at: Date(timeIntervalSince1970: t)))
                t += 60
            }
            completion(Timeline(entries: entries, policy: .after(refreshDate(fresh: fresh, next: end))))
        }
    }
}

// 장마다 다른 색 한 줄 — 무엇이 떠 있는지 글을 읽기 전에 알아보게. 시스템 색이라 어두운 모드도 따라간다.
private func rotateTint(_ kind: String) -> Color {
    switch kind {
    case "meditation": return .green
    case "blessing": return .orange
    case "psalm": return .teal
    default: return .blue
    }
}

private struct RotateDots: View {
    let index: Int
    let count: Int
    let tint: Color

    var body: some View {
        HStack(spacing: 4) {
            ForEach(0..<max(count, 1), id: \.self) { i in
                Circle()
                    .fill(i == index ? tint : Color.secondary.opacity(0.3))
                    .frame(width: 5, height: 5)
            }
        }
        .accessibilityHidden(true)
    }
}

struct RotateWidgetView: View {
    @Environment(\.widgetFamily) private var family
    var entry: RotateEntry

    var body: some View {
        let large = family == .systemLarge
        let slide = entry.slide
        let tint = rotateTint(slide.kind)

        VStack(alignment: .leading, spacing: large ? 10 : 5) {
            // 머리줄 — 왼쪽 교회 마크와 이름, 오른쪽 위 오늘 날짜·시각(친구 요청 2026-10-07 「10.07(수) 17:08」)
            HStack(spacing: 6) {
                WidgetHeader(title: slide.header, large: large)
                Spacer(minLength: 4)
                Text(rotateClock.string(from: entry.date))
                    .font((large ? Font.footnote : Font.caption2).monospacedDigit())
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .fixedSize()
            }
            // 장이 바뀌면 이 묶음을 다른 뷰로 보게 해(.id) 밀려 들어오는 전환이 걸린다(iOS 17+ · 16 은 그냥 바뀐다).
            // 시각만 바뀌는 분에는 같은 뷰라 움직이지 않는다.
            HStack(alignment: .top, spacing: large ? 12 : 10) {
                RoundedRectangle(cornerRadius: 2)
                    .fill(tint)
                    .frame(width: 4)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: large ? 8 : 4) {
                    if !slide.title.isEmpty {
                        Text(slide.title)
                            .font(.system(large ? .headline : .subheadline, design: .serif).weight(.semibold))
                            .lineLimit(1)
                    }
                    // 가장 긴 글은 기도문(247자) — 중간에서는 앞부분, 크게에서는 줄여서라도 다 보이게
                    Text(slide.body)
                        .font(.system(large ? .title3 : .footnote, design: .serif))
                        .lineSpacing(large ? 4 : 1)
                        .lineLimit(large ? 11 : (slide.title.isEmpty ? 5 : 4))
                        .minimumScaleFactor(0.7)
                    Spacer(minLength: 0)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .id(entry.index)
            .transition(.push(from: .trailing))
            // 바닥줄 — 왼쪽 출처, 오른쪽 몇째 장인지 점
            HStack(spacing: 6) {
                Text(slide.footer)
                    .font(large ? .subheadline.weight(.semibold) : .caption2.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                Spacer(minLength: 4)
                RotateDots(index: entry.index, count: entry.count, tint: tint)
            }
        }
        .padding(large ? 18 : 14)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .widgetURL(URL(string: slide.link))
        .widgetBackground()
    }
}

struct RotateWidget: Widget {
    let kind: String = rotateWidgetKind

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: RotateProvider()) { entry in
            RotateWidgetView(entry: entry)
        }
        .configurationDisplayName("말씀 · 묵상 · 기도 돌려 보기")
        .description("이번주 말씀 · 오늘의 묵상 · 축복 기도문 · 쉴만한 물가가 30분마다 저절로 바뀝니다. 누르면 보이던 것의 화면으로 갑니다.")
        .supportedFamilies([.systemMedium, .systemLarge])
    }
}
