import WidgetKit
import SwiftUI

// 위젯 셋을 한 익스텐션에 담는다 — 새 번들 ID·서명이 필요 없다(2026-09-20).
@main
struct TodayVerseWidgetBundle: WidgetBundle {
    var body: some Widget {
        TodayVerseWidget()
        MeditationWidget()
        BlessingWidget()
    }
}
