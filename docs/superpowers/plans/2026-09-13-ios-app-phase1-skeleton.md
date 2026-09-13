# iOS 앱 1단계(골격 + 클라우드 빌드 + TestFlight 첫 업로드) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `gocheok.onlybible.kr`을 그대로 불러오는 최소 iOS 앱(Capacitor 웹뷰 껍데기)을 만들어, Mac 없이 클라우드(Codemagic)에서 빌드·서명해 TestFlight에 올린다. 네이티브 기능(위젯·푸시·네이티브 로그인)은 이 계획에 없다 — 다음 계획에서 다룬다.

**Architecture:** `ios-app/` 폴더에 Capacitor 설정만 커밋한다. 네이티브 Xcode 프로젝트(`ios/`)는 저장소에 커밋하지 않고, Codemagic 빌드마다 `npx cap add ios`로 새로 만든다(로컬에 Mac이 없어 직접 만들 수 없고, 아직 커스텀 네이티브 코드가 없어 매번 새로 만들어도 잃을 것이 없다). 2단계(위젯 추가)부터는 `ios/`를 커밋하는 방식으로 바꾼다.

**Tech Stack:** Capacitor 6, Node.js(npm), Codemagic(macOS 클라우드 빌드), Xcode(Codemagic 안에서만 실행)

## Global Constraints

- Bundle ID(앱 식별자)는 안드로이드 패키지 ID와 맞춘다: `kr.onlybible.gocheok.memorize` (한 번 정하면 못 바꾼다 — `store/README.md` 규칙과 동일)
- `capacitor.config.json`의 `server.url`은 항상 `https://gocheok.onlybible.kr` (운영 사이트를 그대로 불러온다 — 로컬 웹 파일을 번들에 넣지 않는다)
- 이 저장소의 기존 웹 배포(`index.html`·`app.js`·GitHub Pages)는 이 계획에서 손대지 않는다
- `ios-app/` 밖의 파일은 건드리지 않는다(단, 이 계획 완료 보고를 남길 `CLAUDE.md` 한 줄은 예외)
- Node.js·npm 명령은 이 Windows 머신에서 실행 가능하고 실행해서 검증한다. Xcode가 필요한 명령(`npx cap add ios`, 실제 빌드)은 이 머신에서 **실행할 수 없다** — Codemagic 쪽 스크립트에만 적어 두고, 그 실행 결과는 Codemagic 로그로 확인한다.

---

### Task 1: Capacitor 프로젝트 뼈대 만들기

**Files:**
- Create: `ios-app/package.json`
- Create: `ios-app/capacitor.config.json`
- Create: `ios-app/.gitignore`

**Interfaces:**
- Produces: `ios-app/capacitor.config.json`의 `appId`(`kr.onlybible.gocheok.memorize`), `appName`(`고척교회 성경암송`), `server.url`(`https://gocheok.onlybible.kr`) — Task 2(Codemagic 스크립트)가 이 파일을 읽어 빌드한다.

- [ ] **Step 1: `ios-app/package.json` 작성**

```json
{
  "name": "gocheok-memorize-ios",
  "version": "1.0.0",
  "private": true,
  "description": "고척교회 성경암송 iOS 앱 — gocheok.onlybible.kr을 불러오는 Capacitor 웹뷰 껍데기",
  "scripts": {
    "sync": "cap sync ios"
  },
  "dependencies": {
    "@capacitor/core": "^6.2.0",
    "@capacitor/ios": "^6.2.0"
  },
  "devDependencies": {
    "@capacitor/cli": "^6.2.0"
  }
}
```

- [ ] **Step 2: `ios-app/capacitor.config.json` 작성**

```json
{
  "appId": "kr.onlybible.gocheok.memorize",
  "appName": "고척교회 성경암송",
  "webDir": "www",
  "server": {
    "url": "https://gocheok.onlybible.kr",
    "cleartext": false
  },
  "ios": {
    "contentInset": "automatic"
  }
}
```

⚠️ `webDir: "www"`는 Capacitor 설정 파일 형식상 필수 값이지만, `server.url`이 있으면 실제로는 그 폴더를 쓰지 않고 원격 주소를 불러온다. 그래도 `npx cap add ios`가 그 폴더 존재를 기대하므로 Step 3에서 빈 폴더를 만들어 둔다.

- [ ] **Step 3: 빈 `www` 폴더 자리표시자 생성**

```bash
mkdir -p ios-app/www
echo "이 폴더는 비어 있어도 됩니다 — capacitor.config.json의 server.url이 실제 사이트를 불러옵니다." > ios-app/www/README.md
```

- [ ] **Step 4: `ios-app/.gitignore` 작성**

```
node_modules/
ios/
```

⚠️ `ios/`(네이티브 Xcode 프로젝트)는 이 단계에서 커밋하지 않는다 — Codemagic이 빌드마다 새로 만든다(Architecture 참고). `node_modules/`도 당연히 뺀다.

- [ ] **Step 5: JSON 문법 검증**

Run: `node -e "JSON.parse(require('fs').readFileSync('ios-app/capacitor.config.json','utf8')); JSON.parse(require('fs').readFileSync('ios-app/package.json','utf8')); console.log('OK')"`
Expected: `OK` 출력 (문법 오류 없음)

- [ ] **Step 6: npm install로 Capacitor CLI가 받아지는지 확인**

Run: `cd ios-app && npm install`
Expected: 오류 없이 끝나고 `ios-app/node_modules/@capacitor/cli`가 생긴다. (Xcode가 필요한 단계가 아니라 Windows에서도 된다.)

- [ ] **Step 7: 커밋**

```bash
git add ios-app/package.json ios-app/package-lock.json ios-app/capacitor.config.json ios-app/.gitignore ios-app/www/README.md
git commit -m "feat(ios): Capacitor 프로젝트 뼈대 — gocheok.onlybible.kr을 불러오는 웹뷰 껍데기

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Codemagic 빌드 파이프라인 작성

**Files:**
- Create: `codemagic.yaml` (저장소 루트 — Codemagic이 이 경로를 기본으로 찾는다)

**Interfaces:**
- Consumes: Task 1의 `ios-app/capacitor.config.json`(`appId`), `ios-app/package.json`
- Produces: TestFlight에 올라가는 `.ipa` 빌드. 이후 계획(네이티브 기능 추가)에서 이 파일에 빌드 단계를 더 넣게 된다.

- [ ] **Step 1: `codemagic.yaml` 작성**

```yaml
workflows:
  ios-testflight:
    name: iOS TestFlight 업로드
    max_build_duration: 60
    integrations:
      app_store_connect: gocheok_memorize_asc  # Codemagic 콘솔에서 이 이름으로 API 키를 등록해 둔다(Task 3)
    environment:
      groups:
        - ios_signing  # Codemagic 콘솔에서 이 그룹에 인증서 자동 관리 변수가 들어간다
      vars:
        BUNDLE_ID: "kr.onlybible.gocheok.memorize"
      node: 20.11.1
      xcode: latest
      cocoapods: default
    scripts:
      - name: npm install (ios-app)
        script: |
          cd ios-app
          npm install
      - name: 네이티브 iOS 프로젝트 생성 (매 빌드마다 새로)
        script: |
          cd ios-app
          npx cap add ios
          npx cap sync ios
      - name: 코드 서명 설정 가져오기
        script: |
          xcode-project use-profiles
      - name: Xcode 빌드
        script: |
          cd ios-app/ios/App
          xcode-project build-ipa \
            --workspace App.xcworkspace \
            --scheme App
    artifacts:
      - ios-app/ios/App/build/ios/ipa/*.ipa
    publishing:
      app_store_connect:
        auth: integration
        submit_to_testflight: true
```

⚠️ `integrations.app_store_connect`와 `environment.groups`(`ios_signing`)는 Codemagic **웹 콘솔에서** 설정하는 이름이다 — 이 파일은 그 이름을 참조만 한다. Task 3(사람이 하는 일)에서 실제로 만든다.

- [ ] **Step 2: YAML 문법 검증**

Run: `python -c "import yaml; yaml.safe_load(open('codemagic.yaml', encoding='utf-8')); print('OK')"`
Expected: `OK` 출력 (문법 오류 없음). `ModuleNotFoundError: No module named 'yaml'`가 뜨면 먼저 `pip install pyyaml`을 실행한다.

- [ ] **Step 3: 커밋**

```bash
git add codemagic.yaml
git commit -m "feat(ios): Codemagic 빌드 파이프라인 — TestFlight 자동 업로드

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3 (사람이 직접 — 코드로 할 수 없음): Apple·Codemagic 계정 준비

이 작업은 성도님의 결제 정보·이메일·전화 인증이 필요해 대신 해 드릴 수 없습니다. 순서대로 하시면 됩니다.

- [ ] **Step 1: Apple Developer Program 가입**
  1. https://developer.apple.com/programs/enroll/ 접속, 개인(Individual) 명의로 가입
  2. 연 $99 결제
  3. 가입 승인은 보통 몇 시간~하루 걸립니다(신원 확인이 필요하면 더 걸릴 수 있습니다)

- [ ] **Step 2: App Store Connect에 앱 등록**
  1. 승인 후 https://appstoreconnect.apple.com → "나의 앱" → "+" → "신규 앱"
  2. Bundle ID: `kr.onlybible.gocheok.memorize` (Apple Developer 콘솔의 "Identifiers"에서 먼저 이 값으로 등록해야 App Store Connect에서 선택할 수 있습니다)
  3. 이름: "고척교회 성경암송" (한글 심사 가이드는 `store/README.md` 참고)

- [ ] **Step 3: App Store Connect API 키 발급**
  1. App Store Connect → "사용자 및 액세스" → "통합" → "App Store Connect API" → "+"
  2. 이름은 아무거나(예: `codemagic`), 액세스 권한은 "App Manager"
  3. `.p8` 키 파일을 **한 번만** 내려받을 수 있으니 안전한 곳(비공개 폴더 등)에 저장 — 이 저장소에는 절대 커밋하지 않습니다
  4. Key ID, Issuer ID도 함께 적어 둡니다(Codemagic에 입력할 값)

- [ ] **Step 4: Codemagic 계정 생성 + 저장소 연결**
  1. https://codemagic.io 에서 GitHub 계정으로 가입
  2. `sewoongkim1/bible-memorize-church-app-v2` 저장소 연결 허용
  3. Codemagic이 저장소 루트의 `codemagic.yaml`(Task 2에서 만든 것)을 자동으로 인식합니다

- [ ] **Step 5: Codemagic에 App Store Connect 연동 등록**
  1. Codemagic → Teams → Integrations → App Store Connect
  2. Step 3에서 받은 API 키(.p8)·Key ID·Issuer ID 입력
  3. 연동 이름을 `gocheok_memorize_asc`로 저장 — `codemagic.yaml`의 `integrations.app_store_connect` 값과 **정확히 같아야** 합니다

- [ ] **Step 6: Codemagic에 코드 서명 자동 관리 켜기**
  1. Codemagic → 앱 설정 → Code signing → iOS
  2. "Automatic" 선택, Step 5의 연동을 선택하면 인증서·프로비저닝을 Codemagic이 자동으로 만들고 관리합니다
  3. 이 설정이 `environment.groups: ios_signing`에 해당하는 변수 그룹을 만듭니다 — 그룹 이름이 `codemagic.yaml`과 다르면 그룹 이름만 콘솔에서 `ios_signing`으로 바꿔 줍니다

이 Task가 끝나야 Task 4를 실행할 수 있습니다.

---

### Task 4: 첫 빌드 실행·검증

**Files:** 없음(Codemagic 콘솔에서 실행, 결과만 확인)

**Interfaces:**
- Consumes: Task 1·2의 파일, Task 3에서 완료한 Codemagic·Apple 설정

- [ ] **Step 1: Codemagic에서 `ios-testflight` 워크플로 수동 실행**

Codemagic 앱 페이지 → Start new build → 브랜치 `main` → 워크플로 `ios-testflight` 선택 → Start build

- [ ] **Step 2: 빌드 로그 확인**

각 스크립트 단계(`npm install` → `cap add ios` → `xcode-project build-ipa`)가 초록색(성공)인지 확인합니다. 실패하면 로그의 마지막 오류 메시지를 그대로 저에게 알려주세요 — 대부분 Task 3의 서명 설정 문제입니다.

- [ ] **Step 3: TestFlight 확인**

App Store Connect → TestFlight 탭에 새 빌드가 "처리 중"으로 뜨는지 확인(보통 몇 분~30분 소요)

- [ ] **Step 4: 실기기에서 설치·확인**

성도님 아이폰에 TestFlight 앱(App Store에서 무료로 받음) 설치 → 내부 테스터로 초대받은 메일의 링크로 앱 설치 → 열었을 때 `gocheok.onlybible.kr`이 그대로 뜨는지, 로그인이 되는지 확인

- [ ] **Step 5: `CLAUDE.md`에 진행 상황 기록**

`CLAUDE.md`의 "다음 작업" 섹션에서 iOS 관련 줄을 다음으로 갱신합니다(수동 편집, 아래 문구를 참고해 실제 날짜·결과로 채웁니다):

```
- [ ] **iOS 앱 — 1단계(골격) 완료.** TestFlight에서 gocheok.onlybible.kr이 웹뷰로 뜨는 것까지 확인.
      다음은 네이티브 기능 3종(위젯·APNs 푸시·네이티브 로그인) — 설계는
      `docs/superpowers/specs/2026-09-13-ios-app-design.md`, 이 단계 계획은
      `docs/superpowers/plans/2026-09-13-ios-app-phase1-skeleton.md`.
```

Run: (해당 없음 — 문서 편집)

- [ ] **Step 6: 커밋**

```bash
git add CLAUDE.md
git commit -m "docs: iOS 1단계(골격+TestFlight) 완료 기록

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
git push origin main
```

---

## 이 계획이 끝나면

TestFlight에 "웹뷰만 있는" iOS 앱이 올라가 있습니다(위젯·네이티브 푸시·네이티브 로그인 없음). 다음 계획(`2026-09-13-ios-app-design.md`의 2단계)에서 이 골격 위에 네이티브 기능 3가지를 하나씩 더합니다 — 그때는 `ios-app/ios/`를 커밋하는 방식으로 바꿔 WidgetKit 익스텐션 같은 커스텀 타겟을 유지합니다.
