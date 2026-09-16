import SwiftUI

// app.js의 GU_LIST(46번째 줄)와 반드시 함께 고친다.
private let nativeLoginGuList = ["믿음", "소망", "사랑", "섬김", "은혜", "화평", "기쁨", "새가족"]
// app.js의 BU_LIST(47번째 줄)와 반드시 함께 고친다.
private let nativeLoginBuList = ["사랑부", "영아부", "유아부", "유치부", "유년부", "초등부", "중등부", "고등부", "청년부"]

// app.js의 MOK_RE(1163번째 줄, /^(\d+|남성)$/)와 정확히 같은 규칙 — 표기가 흔들리면
// identity_key가 갈려 같은 사람이 다른 사람으로 인식된다.
private func isValidMok(_ s: String) -> Bool {
    guard let regex = try? NSRegularExpression(pattern: "^(\\d+|남성)$") else { return false }
    let range = NSRange(s.startIndex..<s.endIndex, in: s)
    return regex.firstMatch(in: s, range: range) != nil
}

// index.html의 .privacy-box 문구(90번째 줄 부근)를 그대로 옮긴 것 — 문구를 바꿀 때 두 곳을 함께 고친다.
private let nativeLoginPrivacyNotice = "성경말씀 암송 앱은 개인 암송 진도 저장과 교회 내 참여 통계를 위해 이름, 소속, 암송 진행 기록, 복습 및 도전 참여 기록을 저장합니다. 수집된 정보는 암송 프로그램 운영 목적으로만 사용되며, 운영 종료 또는 삭제 요청 시 정리됩니다."

struct NativeLoginPayload {
    let type: String // "교구" | "교회학교"
    let gu: String?
    let mok: String?
    let bu: String?
    let grade: String?
    let name: String

    // app.js의 saveUser()가 localStorage에 저장하는 것과 같은 모양의 JSON을 만든다.
    func toDictionary() -> [String: Any] {
        var d: [String: Any] = ["type": type, "name": name]
        if type == "교구" {
            d["gu"] = gu ?? ""
            d["mok"] = mok ?? ""
        } else {
            d["bu"] = bu ?? ""
            d["grade"] = grade ?? ""
        }
        return d
    }
}

struct NativeLoginView: View {
    let onComplete: (NativeLoginPayload) -> Void

    @State private var type = "교구"
    @State private var gu = ""
    @State private var mok = ""
    @State private var bu = ""
    @State private var grade = ""
    @State private var name = ""
    @State private var consented = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationView {
            Form {
                Section {
                    Picker("구분", selection: $type) {
                        Text("교구").tag("교구")
                        Text("교회학교").tag("교회학교")
                    }
                    .pickerStyle(.segmented)
                }

                if type == "교구" {
                    Section("교구") {
                        Picker("교구", selection: $gu) {
                            Text("선택 안 함").tag("")
                            ForEach(nativeLoginGuList, id: \.self) { g in Text(g).tag(g) }
                        }
                    }
                    Section("목장") {
                        TextField("숫자 또는 남성 (예: 3, 남성, 없으면 99)", text: $mok)
                    }
                } else {
                    Section("부서") {
                        Picker("부서", selection: $bu) {
                            Text("선택 안 함").tag("")
                            ForEach(nativeLoginBuList, id: \.self) { b in Text(b).tag(b) }
                        }
                    }
                    Section("학년") {
                        TextField("예: 3학년", text: $grade)
                    }
                }

                Section("성명") {
                    TextField("이름", text: $name)
                }

                Section("개인정보 수집·이용 안내") {
                    Text(nativeLoginPrivacyNotice)
                        .font(.footnote)
                        .foregroundColor(.secondary)
                    Button("자세히 보기") {
                        if let url = URL(string: "https://gocheok.onlybible.kr/privacy/") {
                            UIApplication.shared.open(url)
                        }
                    }
                    Toggle("위 개인정보 수집·이용 안내를 확인하고 동의합니다.", isOn: $consented)
                }

                if let errorMessage = errorMessage {
                    Text(errorMessage).foregroundColor(.red)
                }

                Section {
                    Button("시작하기") { submit() }
                }
            }
            .navigationTitle("성경말씀 암송하기")
        }
    }

    private func submit() {
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty else { errorMessage = "이름을 입력해 주세요."; return }
        guard consented else { errorMessage = "개인정보 수집·이용 안내에 동의해 주세요."; return }

        if type == "교구" {
            guard !gu.isEmpty else { errorMessage = "교구를 선택해 주세요."; return }
            let trimmedMok = mok.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmedMok.isEmpty else { errorMessage = "목장을 입력해 주세요."; return }
            guard isValidMok(trimmedMok) else {
                errorMessage = "목장은 숫자 또는 '남성'만 입력할 수 있어요. (예: 3목장 → 3, 남성목장 → 남성, 없으면 → 99)"
                return
            }
            errorMessage = nil
            onComplete(NativeLoginPayload(type: type, gu: gu, mok: trimmedMok, bu: nil, grade: nil, name: trimmedName))
        } else {
            guard !bu.isEmpty else { errorMessage = "부서를 선택해 주세요."; return }
            let trimmedGrade = grade.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmedGrade.isEmpty else { errorMessage = "학년을 입력해 주세요."; return }
            errorMessage = nil
            onComplete(NativeLoginPayload(type: type, gu: nil, mok: nil, bu: bu, grade: trimmedGrade, name: trimmedName))
        }
    }
}
