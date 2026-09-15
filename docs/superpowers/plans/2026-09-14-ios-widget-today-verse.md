# iOS 오늘의 구절 위젯 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로그인 없이도 홈 화면에서 "이번주 말씀"이 보이는 WidgetKit 위젯을 추가한다. 이것이 iOS 2단계(진짜 네이티브 기능 3가지)의 첫 번째다 — 나머지 둘(네이티브 푸시·네이티브 로그인)은 서로 독립된 하위 시스템이라 각자 별도 계획으로 다룬다.

**Architecture:** 서버는 이미 있는 `latestVerse()`(푸시 알림이 쓰던 "이번주 말씀 고르기" 로직)를 새 액션 `getWeeklyVerse`로 노출만 한다. iOS 쪽은 위젯 전용 Swift 소스를 먼저 저장소에 커밋해 두고, Codemagic(클라우드, Mac 없이) 안에서 `xcodeproj` Ruby 젬으로 Xcode 프로젝트에 위젯 익스텐션 타겟을 한 번 주입한 뒤, 그 결과(`ios-app/ios/`)를 저장소에 커밋해 고정한다. 그 뒤로는 `npx cap add ios`(매번 새로 만들기) 대신 `npx cap sync ios`(있는 프로젝트에 반영)만 쓴다 — Phase 1 계획이 이미 예고한 전환이다.

**Tech Stack:** WidgetKit + SwiftUI(iOS 16+), Deno(Supabase Edge Function, 기존 `supabase/functions/api/index.ts`), Ruby `xcodeproj` gem(Codemagic 안에서만 실행)

## Global Constraints

- Bundle ID(위젯): `kr.onlybible.gocheok.memorize.todayverse` — 앱 Bundle ID `kr.onlybible.gocheok.memorize`(고정값, `store/README.md` 규칙과 동일) 밑의 하위 식별자
- 서버 코드(`supabase/functions/api/index.ts`)는 **개발 프로젝트(`ktpwthwqzgcqcrmsafdo`) 먼저 배포·확인 → 운영(`xnomlgydifiqiybervtf`)** 순서 (CLAUDE.md 백엔드 체크리스트)
- 이 위젯은 **로그인 없이 보이는 공개 정보만** 다룬다 — `user_id`나 개인정보는 절대 포함하지 않는다(CLAUDE.md 보안 규칙과 동일한 이유: 공개 anon key로 누구나 호출 가능)
- `ios-app/` 밖의 파일은 건드리지 않는다(단, `supabase/functions/api/index.ts`와 이 계획 완료 기록을 남길 `CLAUDE.md` 한 줄은 예외)
- **Xcode·Ruby가 필요한 단계는 이 Windows 머신에서 실행할 수 없다** — Codemagic 빌드 로그로만 검증한다. Phase 1의 서명·빌드번호 이슈처럼 **한 번에 안 될 수 있고, 로그를 보고 몇 차례 고칠 수 있다** — 이건 실패가 아니라 이 작업의 정상적인 진행 방식이다(Mac 없이 하는 대가).
- Node/TypeScript/curl로 검증 가능한 단계(Task 1)는 이 머신에서 직접 실행해 확인한다.

---

### Task 1: 서버 액션 `getWeeklyVerse` 추가

**Files:**
- Modify: `supabase/functions/api/index.ts` (switch 문 한 줄 추가, 새 함수 없음)

**Interfaces:**
- Consumes: 기존 `latestVerse()` 함수(`supabase/functions/api/index.ts:350`) — 이미 `{ no, ref, text, prev: {no,ref,text}|null } | null`을 반환한다. 수정하지 않는다.
- Produces: 액션 `getWeeklyVerse` — 위젯(Task 2)이 이 이름과 응답 모양을 그대로 쓴다.

- [ ] **Step 1: switch 문에 새 case 추가**

`supabase/functions/api/index.ts`의 기존 `case "weeklyVersePush":` 바로 다음 줄에 추가:

```typescript
      case "weeklyVersePush": return json(await weeklyVersePush(body));
      case "getWeeklyVerse":  return json(await latestVerse() ?? {});
```

⚠️ `latestVerse()`가 `null`을 반환할 수 있으므로(구절이 하나도 없을 때) `?? {}`로 감싼다 — 위젯 쪽(Task 2)은 `text`가 빈 문자열이면 "아직 준비 중" 문구를 보여주도록 짠다.

- [ ] **Step 2: TypeScript 문법 확인**

Run: `cd C:/Projects/bible-memorize-church-app-v2 && npx tsc --noEmit --target es2022 --module esnext --moduleResolution bundler supabase/functions/api/index.ts 2>&1 | head -30`
Expected: 기존에도 있던 Deno 관련 타입 오류(예: `Deno` 전역 인식 못함)는 있을 수 있으나, **이번에 추가한 줄 근처에서 새 오류가 없어야 한다.** (이 파일은 원래 Deno 런타임 전용이라 로컬 tsc가 완벽히 깨끗하진 않다 — Task 2의 `preflight.py`/`node --check` 대상이 아니므로 여기서는 새 오류 유무만 본다.)

- [ ] **Step 3: 개발 프로젝트에 배포**

```bash
cd C:/Projects/bible-memorize-church-app-v2
supabase functions deploy api --no-verify-jwt --project-ref ktpwthwqzgcqcrmsafdo
```

- [ ] **Step 4: 개발 프로젝트에서 curl로 확인**

Run:
```bash
curl -s -X POST "https://ktpwthwqzgcqcrmsafdo.supabase.co/functions/v1/api" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sb_publishable_eJKP6u95IU9_DBXTvnvYBA_-yGCf-0Y" \
  -H "apikey: sb_publishable_eJKP6u95IU9_DBXTvnvYBA_-yGCf-0Y" \
  -d '{"action":"getWeeklyVerse"}'
```
Expected: `{"no":..., "ref":"...", "text":"...", "prev":...}` 형태의 JSON. 에러(`{"error":...}`)가 아니어야 한다. (개발 DB는 비어 있을 수 있어 `{}`가 올 수도 있다 — 그 자체는 정상, 다음 단계에서 운영으로 확인한다.)

- [ ] **Step 5: 운영 프로젝트에 배포 + 확인**

```bash
supabase functions deploy api --no-verify-jwt --project-ref xnomlgydifiqiybervtf
curl -s -X POST "https://xnomlgydifiqiybervtf.supabase.co/functions/v1/api" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sb_publishable_oLtieT_jw7Gjb8etEsy0jw_thBaDjl-" \
  -H "apikey: sb_publishable_oLtieT_jw7Gjb8etEsy0jw_thBaDjl-" \
  -d '{"action":"getWeeklyVerse"}'
```
Expected: 실제 이번 주 구절이 담긴 JSON — 지금 웹 첫 화면의 "이번주 말씀" 배지와 같은 구절이어야 한다.

- [ ] **Step 6: 커밋**

```bash
git add supabase/functions/api/index.ts
git commit -m "feat(ios-widget): getWeeklyVerse 액션 추가 — 기존 latestVerse() 노출

위젯이 로그인 없이 이번주 말씀을 받아올 수 있도록, 푸시 알림이 쓰던
latestVerse()를 새 액션으로 그대로 노출한다. 새 로직 없음.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
git push origin main
```

---

### Task 2: 위젯 Swift 소스 작성 (아직 프로젝트에 연결 안 함)

**Files:**
- Create: `ios-app/native/TodayVerseWidget/TodayVerseWidgetBundle.swift`
- Create: `ios-app/native/TodayVerseWidget/TodayVerseWidget.swift`
- Create: `ios-app/native/TodayVerseWidget/Info.plist`

**Interfaces:**
- Consumes: Task 1의 액션 `getWeeklyVerse` (`https://xnomlgydifiqiybervtf.supabase.co/functions/v1/api`, `apikey`/`Authorization` 헤더에 운영 anon key)
- Produces: `TodayVerseWidgetBundle`(위젯 익스텐션의 `@main` 진입점) — Task 3의 Ruby 스크립트가 이 파일들을 Xcode 타겟에 등록한다.

이 코드는 아직 어떤 Xcode 프로젝트에도 속해 있지 않다 — Task 3에서 통째로 타겟에 편입된다. 지금은 소스만 저장소에 커밋해 둔다(Mac이 없어 지금 컴파일 확인은 불가능 — Task 3~4 이후 Codemagic 로그로 처음 컴파일 확인).

- [ ] **Step 1: `ios-app/native/TodayVerseWidget/TodayVerseWidgetBundle.swift` 작성**

```swift
import WidgetKit
import SwiftUI

@main
struct TodayVerseWidgetBundle: WidgetBundle {
    var body: some Widget {
        TodayVerseWidget()
    }
}
```

- [ ] **Step 2: `ios-app/native/TodayVerseWidget/TodayVerseWidget.swift` 작성**

```swift
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
        .containerBackground(.background, for: .widget)
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
```

- [ ] **Step 3: `ios-app/native/TodayVerseWidget/Info.plist` 작성**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDisplayName</key>
    <string>이번주 말씀</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>NSExtension</key>
    <dict>
        <key>NSExtensionPointIdentifier</key>
        <string>com.apple.widgetkit-extension</string>
    </dict>
</dict>
</plist>
```

- [ ] **Step 4: 문법만 확인(Swift 컴파일은 이 머신에서 불가)**

Run: `python -c "import xml.dom.minidom; xml.dom.minidom.parse('ios-app/native/TodayVerseWidget/Info.plist'); print('OK')"`
Expected: `OK` (plist가 유효한 XML인지만 확인 — 실제 Swift 컴파일 확인은 Task 3~4 이후 Codemagic 로그에서)

- [ ] **Step 5: 커밋**

```bash
git add ios-app/native/TodayVerseWidget/
git commit -m "feat(ios-widget): 위젯 Swift 소스 작성 (아직 Xcode 타겟엔 미편입)

TimelineProvider가 getWeeklyVerse 액션을 하루 한 번(자정 KST) 불러와
홈 화면 위젯에 이번주 말씀을 보여준다. Task 3에서 실제 Xcode 프로젝트
타겟으로 편입한다.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
git push origin main
```

---

### Task 3: Codemagic 부트스트랩 — 위젯 타겟을 Xcode 프로젝트에 주입 (실험적, 여러 차례 시도 예상)

**Files:**
- Modify: `codemagic.yaml` (새 워크플로 `ios-widget-bootstrap` 추가 — 기존 `ios-testflight` 워크플로는 건드리지 않는다)

**Interfaces:**
- Consumes: Task 2의 `ios-app/native/TodayVerseWidget/*` 파일들
- Produces: 빌드 아티팩트로 나오는 `ios-app-ios-bootstrapped.zip` (전체 `ios/` 폴더) — Task 4가 이걸 저장소에 커밋한다.

⚠️ 이 워크플로는 **한 번만 실행하고 끝**이다 — 결과를 커밋한 뒤(Task 4)엔 이 워크플로도, `xcodeproj` 스크립트도 다시 쓸 일이 없다(그 뒤론 위젯 파일도 평범한 git 편집으로 다룬다). `ios-testflight` 워크플로와 분리해 둔 것도 이 실험적 단계가 기존에 이미 성공한 파이프라인을 건드리지 않게 하기 위함이다.

- [ ] **Step 1: `codemagic.yaml`에 부트스트랩 워크플로 추가**

기존 `workflows:` 아래, `ios-testflight:` 워크플로와 같은 들여쓰기 레벨로 추가:

```yaml
  ios-widget-bootstrap:
    name: (1회용) 위젯 타겟 주입 + ios/ 아티팩트 뽑기
    max_build_duration: 30
    environment:
      vars:
        BUNDLE_ID: "kr.onlybible.gocheok.memorize"
        WIDGET_BUNDLE_ID: "kr.onlybible.gocheok.memorize.todayverse"
      node: 20.11.1
      xcode: latest
      cocoapods: default
    scripts:
      - name: npm install (ios-app)
        script: |
          cd ios-app
          npm install
      - name: 네이티브 iOS 프로젝트 생성
        script: |
          cd ios-app
          npx cap add ios
          npx cap sync ios
      - name: 위젯 소스 복사
        script: |
          mkdir -p ios-app/ios/App/TodayVerseWidget
          cp ios-app/native/TodayVerseWidget/*.swift ios-app/ios/App/TodayVerseWidget/
          cp ios-app/native/TodayVerseWidget/Info.plist ios-app/ios/App/TodayVerseWidget/Info.plist
      - name: xcodeproj 젬으로 위젯 익스텐션 타겟 추가
        script: |
          gem install xcodeproj --no-document
          cd ios-app/ios/App
          ruby -e '
            require "xcodeproj"
            project_path = "App.xcodeproj"
            project = Xcodeproj::Project.open(project_path)
            app_target = project.targets.find { |t| t.name == "App" }
            raise "App 타겟을 못 찾음" unless app_target

            widget_target = project.new_target(
              :app_extension, "TodayVerseWidget", :ios, "16.0"
            )
            widget_target.build_configurations.each do |config|
              config.build_settings["PRODUCT_BUNDLE_IDENTIFIER"] = ENV["WIDGET_BUNDLE_ID"]
              config.build_settings["INFOPLIST_FILE"] = "TodayVerseWidget/Info.plist"
              config.build_settings["SWIFT_VERSION"] = "5.0"
              config.build_settings["CODE_SIGN_STYLE"] = "Automatic"
              config.build_settings["TARGETED_DEVICE_FAMILY"] = "1"
              config.build_settings["SKIP_INSTALL"] = "YES"
            end

            group = project.main_group.new_group("TodayVerseWidget")
            swift_files = Dir.glob("TodayVerseWidget/*.swift")
            file_refs = swift_files.map { |f| group.new_reference(f) }
            widget_target.add_file_references(file_refs)

            app_target.add_dependency(widget_target)
            embed_phase = app_target.copy_files_build_phases.find { |p| p.name == "Embed Foundation Extensions" } ||
              app_target.new_copy_files_build_phase("Embed Foundation Extensions")
            embed_phase.dst_subfolder_spec = "13" # PlugIns
            embed_phase.add_file_reference(widget_target.product_reference, true)

            project.save
            puts "위젯 타겟 추가 완료: #{widget_target.name} (#{ENV["WIDGET_BUNDLE_ID"]})"
          '
      - name: ios/ 폴더를 아티팩트로 압축
        script: |
          cd ios-app
          zip -r ../ios-app-ios-bootstrapped.zip ios
    artifacts:
      - ios-app-ios-bootstrapped.zip
```

- [ ] **Step 2: YAML 문법 검증**

Run: `python -c "import yaml; yaml.safe_load(open('codemagic.yaml', encoding='utf-8')); print('OK')"`
Expected: `OK`

- [ ] **Step 3: 커밋**

```bash
git add codemagic.yaml
git commit -m "feat(ios-widget): 위젯 타겟 주입용 1회용 Codemagic 워크플로 추가

xcodeproj 젬으로 WidgetKit 익스텐션 타겟을 자동 생성해 ios/ 를 아티팩트로
뽑는다. 결과를 Task 4에서 저장소에 커밋해 고정한다 — 이후엔 이 워크플로도
다시 쓸 일이 없다.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
git push origin main
```

- [ ] **Step 4 (사람이 직접): Codemagic에서 `ios-widget-bootstrap` 워크플로 수동 실행**

Codemagic 앱 페이지 → Start new build → 브랜치 `main` → 워크플로 `ios-widget-bootstrap` → Start build

- [ ] **Step 5 (사람이 직접): 로그 확인 + 결과 보고**

"xcodeproj 젬으로 위젯 익스텐션 타겟 추가" 단계가 초록불로 끝나고 `위젯 타겟 추가 완료: TodayVerseWidget (...)` 로그가 보이면 성공. **빨간불이면 그 단계의 마지막 오류 메시지를 그대로 알려주세요** — Ruby 스크립트를 그 오류에 맞게 고쳐서 다시 시도합니다(Phase 1의 서명 문제처럼 한 번에 안 될 수 있습니다).

---

### Task 4: 부트스트랩 결과를 저장소에 고정

**Files:**
- Create: `ios-app/ios/` 전체(Task 3의 아티팩트에서)
- Modify: `ios-app/.gitignore`
- Modify: `codemagic.yaml` (`ios-testflight` 워크플로의 "네이티브 iOS 프로젝트 생성" 단계)

**Interfaces:**
- Consumes: Task 3 Step 4의 빌드 아티팩트 `ios-app-ios-bootstrapped.zip`

- [ ] **Step 1 (사람이 직접): 아티팩트 다운로드**

Codemagic 빌드 결과 페이지 → Artifacts → `ios-app-ios-bootstrapped.zip` 다운로드 → 로컬 아무 폴더에 저장 후 **그 경로를 알려주세요.** (예: `C:\Users\sewki\Downloads\ios-app-ios-bootstrapped.zip`)

- [ ] **Step 2: 압축 풀어서 저장소에 반영** (경로를 받은 뒤 진행)

```bash
cd C:/Projects/bible-memorize-church-app-v2
unzip -o "<받은 경로>" -d /tmp/ios-bootstrap
rm -rf ios-app/ios
cp -r /tmp/ios-bootstrap/ios ios-app/ios
```

- [ ] **Step 3: `ios-app/.gitignore`에서 `ios/` 제외 규칙 제거**

`ios-app/.gitignore`를 다음으로 교체(지금은 `node_modules/`와 `ios/` 두 줄):

```
node_modules/
```

- [ ] **Step 4: `codemagic.yaml`의 `ios-testflight` 워크플로 수정 — `cap add` 대신 `cap sync`**

`- name: 네이티브 iOS 프로젝트 생성 (매 빌드마다 새로)` 단계를 찾아 교체:

```yaml
      - name: 네이티브 iOS 프로젝트 동기화 (기존 ios/ 유지, 위젯 타겟 보존)
        script: |
          cd ios-app
          npm install
          npx cap sync ios
```

(바로 위의 `npm install (ios-app)` 단계와 합쳐졌으므로, 원래 있던 `npm install (ios-app)` 단계는 지운다.)

- [ ] **Step 5: 커밋**

```bash
git add ios-app/ios ios-app/.gitignore codemagic.yaml
git commit -m "feat(ios-widget): 부트스트랩 결과(위젯 타겟 포함 ios/) 저장소에 고정

이제부터 cap add ios(매번 새로 만들기) 대신 cap sync ios(있는 프로젝트에
반영)를 쓴다. 위젯 타겟과 Info.plist가 빌드마다 사라지지 않는다.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
git push origin main
```

- [ ] **Step 6 (사람이 직접): `ios-testflight` 빌드 재실행**

Codemagic → `ios-testflight` 워크플로 다시 실행. **위젯 타겟까지 함께 빌드·서명되는지** 로그를 확인합니다. 여기서도 서명 문제가 새로 날 수 있습니다(위젯도 자기 Bundle ID로 별도 서명이 필요 — Task 5에서 다룸). 로그 결과를 알려주세요.

---

### Task 5 (사람이 직접): Apple Developer + Codemagic에 위젯용 서명 추가

**Files:** 없음(콘솔 작업)

- [ ] **Step 1: Apple Developer 콘솔에 위젯 App ID 등록**

developer.apple.com → Certificates, Identifiers & Profiles → Identifiers → "+" → App IDs → 위젯 Bundle ID `kr.onlybible.gocheok.memorize.todayverse` 등록

- [ ] **Step 2: App Store Connect에서 위젯을 앱에 연결**

보통 App ID 등록만으로 충분합니다 — Codemagic의 자동 서명(`fetch-signing-files --create`)이 이 Bundle ID로도 자동으로 프로파일을 만들어 줍니다(Task 4 Step 6에서 실패하면 이 단계를 다시 확인).

- [ ] **Step 3: `ios-testflight` 빌드 재확인**

Task 4 Step 6에서 서명 문제가 있었다면 여기서 다시 실행해 초록불 확인. 결과를 알려주세요.

---

### Task 6 (사람이 직접): 실기기에서 위젯 확인

- [ ] **Step 1**: 아이폰 TestFlight 앱에서 최신 빌드 설치(이미 내부 테스터로 등록돼 있음 — 1단계에서 함)
- [ ] **Step 2**: 홈 화면 빈 곳 길게 눌러 "위젯 추가" → "고척교회 성경암송" 찾기 → "이번주 말씀" 위젯 추가
- [ ] **Step 3**: 실제 이번 주 구절이 보이는지, 며칠 뒤 자정이 지나면 다음 주 구절로 바뀌는지 확인
- [ ] **Step 4**: `CLAUDE.md`에 진행 기록 (아래 문구 참고, 실제 결과로 채워서)

```
- [ ] **iOS 2단계 — 위젯 완료, 푸시·로그인 남음.** "이번주 말씀" 홈 화면 위젯이
      TestFlight에서 확인됨. 다음은 네이티브 푸시(APNs)·네이티브 로그인 —
      설계는 `docs/superpowers/specs/2026-09-13-ios-app-design.md`.
```

```bash
git add CLAUDE.md
git commit -m "docs: iOS 위젯(오늘의 구절) 완료 기록

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
git push origin main
```

---

## 이 계획이 끝나면

아이폰 홈 화면에 "이번주 말씀" 위젯이 뜬다. 로그인 없이도 성도님이 암송 구절을 매일 볼 수 있다. `ios-app/ios/`가 이제 저장소에 고정돼 있으니, 다음 계획(네이티브 푸시, 네이티브 로그인)은 **더 이상 이런 부트스트랩 없이** 이 프로젝트에 파일만 추가하면 된다 — 오늘 한 번 겪은 어려움이 다음 두 계획에서는 반복되지 않는다.
