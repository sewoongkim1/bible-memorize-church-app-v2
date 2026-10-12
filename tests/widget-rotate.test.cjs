// 🧩 「말씀 · 묵상 · 기도 돌려 보기」 위젯(아이폰 1.1.1 · 안드로이드 versionCode 5 · 2026-10-13) — 두 폰과 설명서가 같은 말을 하는가(꾸러미 없음 · preflight 가 건다)
//
//   node --test tests/widget-rotate.test.cjs
//
// 왜: 위젯 이름은 세 곳(아이폰 configurationDisplayName · 안드로이드 widget_rotate_name · 설명서 문장)에 따로 적혀 있다.
//   한 곳만 바꾸면 설명서가 시키는 이름이 목록에 없다. 그리고 설명서는 앱 판을 모른다 — 안드로이드는 스위치(ANDROID_ROTATE_GUIDE)를
//   **플레이스토어에 나간 날** 켜야 참인 말이 된다. 읽을 것: docs/notes/android-app.md 「돌려 보기 위젯」
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const R = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8').replace(/\r\n/g, '\n');
const APP = R('app.js');
const SWIFT = R('ios-app/ios/App/TodayVerseWidget/TodayVerseWidgetBundle.swift');
const STRINGS = R('android-app/app/src/main/res/values/widget_strings.xml');
const MANIFEST = R('android-app/app/src/main/AndroidManifest.xml');
const LOGIC = R('android-app/app/src/main/java/kr/onlybible/gocheok/memorize/widget/WidgetLogic.java');

const xmlString = (name) => {
  const m = new RegExp(`<string name="${name}">([^<]*)</string>`).exec(STRINGS);
  assert.ok(m, `widget_strings.xml 에 ${name} 이 없다`);
  return m[1];
};

test('이름·설명 — 아이폰과 안드로이드가 같은 글 · 설명서가 그 이름을 부른다', () => {
  const ios = /\.configurationDisplayName\("([^"]+)"\)\s*\n\s*\.description\("([^"]+)"\)\s*\n\s*\.supportedFamilies\(\[\.systemMedium, \.systemLarge\]\)/.exec(SWIFT);
  assert.ok(ios, '아이폰 RotateWidget 의 이름·설명 줄을 못 찾았다 — 이 검사가 낡았다');
  assert.equal(xmlString('widget_rotate_name'), ios[1]);
  assert.equal(xmlString('widget_rotate_desc'), ios[2]);
  // 설명서는 두 폰 모두 「「이름」」으로 부른다
  assert.equal(APP.split(`<b>「${ios[1]}」</b>`).length - 1, 2, '설명서 위젯 장 두 개(아이폰·안드로이드)가 같은 이름을 부른다');
});

test('안드로이드 — 매니페스트에 위젯이 걸려 있고 · 장 넷의 머리글이 아이폰과 같다', () => {
  assert.ok(/android:name="kr\.onlybible\.gocheok\.memorize\.widget\.RotateWidget"[\s\S]{0,200}android:label="@string\/widget_rotate_name"[\s\S]{0,300}@xml\/widget_rotate_info/.test(MANIFEST), 'RotateWidget receiver');
  for (const h of ['"이번주 말씀"', '"축복 기도문"', '"쉴만한 물가"']) {
    assert.ok(SWIFT.includes(`header: ${h}`), `아이폰 머리글 ${h}`);
    assert.ok(LOGIC.includes(h), `안드로이드 머리글 ${h}`);
  }
  // 30분 — 친구 결정(2026-10-07) · 두 폰 같은 값
  assert.ok(/rotateSeconds: TimeInterval = 30 \* 60/.test(SWIFT));
  assert.ok(/ROTATE_MS = 30 \* MINUTE;/.test(LOGIC));
  // 쉴만한 물가 장은 누르면 /?w=psalm — 웹이 받는 주소
  assert.ok(LOGIC.includes('PSALM_URL = SITE + "/?w=psalm"'));
  assert.ok(/["']psalm["']/.test(APP.slice(APP.indexOf('function getWidgetTarget'), APP.indexOf('function getWidgetTarget') + 1500)), '웹 getWidgetTarget 이 psalm 을 받는다');
});

test('설명서 스위치 — 플레이스토어에 나가기 전에는 안드로이드 장이 돌려 보기를 말하지 않는다', () => {
  const m = /^const ANDROID_ROTATE_GUIDE = (true|false);/m.exec(APP);
  assert.ok(m, '스위치 줄(tools/status.py 가 _GUIDE 꼴을 읽는다)');
  assert.ok(APP.includes('function androidRotateGuideOn() { return _widgetPreview || ANDROID_ROTATE_GUIDE; }'));
  // 안드로이드 장에서 「돌려 보기」를 말하는 곳은 모두 androidRotateGuideOn() 갈래 안에 있다
  const s = APP.indexOf('when: () => widgetGuideOn("android"),');
  const page = APP.slice(s, APP.indexOf('\n  },\n', s));
  assert.ok(s > 0 && page.length > 100, '안드로이드 위젯 장을 못 찾았다');
  for (const line of page.split('\n').filter((l) => l.includes('돌려 보기') && !/^\s*\/\//.test(l))) {
    const i = page.indexOf(line);
    const before = page.slice(Math.max(0, i - 400), i + line.length);
    assert.ok(/androidRotateGuideOn\(\)/.test(before), '「돌려 보기」 문장이 스위치 갈래 밖에 있다: ' + line.trim().slice(0, 60));
  }
});
