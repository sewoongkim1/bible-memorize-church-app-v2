// 안드로이드 앱 뼈대를 Bubblewrap 으로 **한 번** 만든다(2026-09-21).
// 명령줄 도구(bubblewrap init)는 대화형 질문을 던져서, 같은 일을 하는 core 를 직접 부른다.
//
// ⚠️ 위젯을 더한 뒤에는 다시 돌리지 말 것 — AndroidManifest.xml·app/build.gradle 등
//    우리가 고친 파일을 통째로 덮어쓴다(설계 docs/superpowers/specs/2026-09-21-android-widgets-design.md).
//
// 값은 지금 플레이스토어 앱(PWABuilder 로 만든 것)과 같게 둔다 — 같지 않으면 업데이트한 순간
// 앱 이름·색·알림 같은 것이 조용히 바뀐다. 아래 값은 그 APK 를 aapt2 로 읽어 옮긴 것이고,
// 대조는 manifest-parity.py 가 한다.
//   (계획에는 이름을 「성경말씀 암송」으로 적었는데 실제 앱은 「성경암송」이었다 — 스토어 등록 이름과 다르다.)
const path = require('path');
const Color = require('color');
const { TwaManifest, TwaGenerator, ConsoleLog } = require('@bubblewrap/core');

(async () => {
  const target = path.resolve(__dirname, '..');
  const m = await TwaManifest.fromWebManifest('https://gocheok.onlybible.kr/manifest.json');
  const navy = new Color('#1A3A6B');   // 옛 앱은 상태 표시줄·아래 막대·구분선(밝을 때·어두울 때) 모두 이 색
  m.packageId = 'kr.onlybible.gocheok.memorize';
  m.host = 'gocheok.onlybible.kr';
  m.name = '성경암송';                // 앱 이름(appName)
  m.launcherName = '성경암송';        // 홈 화면 아이콘 밑 이름
  m.startUrl = '/';
  m.themeColor = navy;
  m.themeColorDark = navy;
  m.navigationColor = navy;
  m.navigationColorDark = navy;
  m.navigationDividerColor = navy;
  m.navigationDividerColorDark = navy;
  m.backgroundColor = navy;
  m.enableNotifications = true;       // 알림 위임 — 끄면 아침 알림이 앱 이름으로 안 뜬다
  m.fallbackType = 'customtabs';
  m.splashScreenFadeOutDuration = 300;
  m.enableSiteSettingsShortcut = true;
  m.orientation = 'default';
  m.minSdkVersion = 23;               // 옛 앱과 같다(안드로이드 6.0)
  await m.saveToFile(path.join(target, 'twa-manifest.json'));
  await new TwaGenerator().createTwaProject(target, m, new ConsoleLog('generate'));
  console.log('뼈대를 만들었다:', target);
})().catch((e) => { console.error(e); process.exit(1); });
