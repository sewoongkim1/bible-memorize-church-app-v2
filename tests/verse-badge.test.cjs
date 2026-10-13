// 이번주 말씀 위젯 머리말 「🐑 3일째」(2026-10-13) — 서버 순수 함수 · SQL 꼴 · 위젯 두 폰의 배선(꾸러미 없음 · preflight 가 건다)
//
//   node --test tests/verse-badge.test.cjs
//
// 무엇을 지키나(docs/superpowers/specs/2026-10-13-verse-widget-badge-design.md)
//   ① 머리말 셈 — 첫날 「새 말씀」 · N일째 · 날짜 없음/시작 전은 이모지만 · 목록 밖 이모지는 안 보임 · 둘 다 없으면 ""
//   ② 이모지 목록 — 40개 · 겹침 없음 · 피부색 수식·ZWJ 없음(안드로이드 7.0 에서 □ 가 된다)
//   ③ SQL — 칸은 if not exists · 41줄 · 모두 목록 안 · 빈 줄만 채움
//   ④ index.ts 배선 — emoji 칸을 읽는다 · badge/badgeDate · AI 채움은 date 입력 없을 때만
//   ⑤ 위젯 — 아이폰 두 벌이 같다 · badgeDate 를 오늘과 견준다 · 안드로이드 두 레이아웃에 widget_badge
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = (...f) => fs.readFileSync(path.join(root, ...f), 'utf8').replace(/\r\n/g, '\n');
const slice = (src, a, b, what) => {
  const s = src.indexOf(a), e = src.indexOf(b, s + a.length);
  assert.ok(s >= 0 && e > s, what + ' — 표식을 못 찾았다(이 검사가 낡았다)');
  return src.slice(s, e);
};

const VE = read('supabase', 'functions', 'api', 'verse-emoji.ts');
const pure = slice(VE, '// ── 위젯 머리말 — 순수 함수 (여기부터) ──', '// ── 위젯 머리말 — 순수 함수 (여기까지) ──', 'verse-emoji.ts');
assert.ok(!/\)\s*:\s*\w|\(\s*\w+\s*:\s*\w/.test(pure),
  'verse-emoji.ts 순수 구간에 타입 표기가 들어왔다 — node:vm 이 못 돌린다. 표기를 빼거나 구간 밖으로 옮겨라');
const P = vm.runInContext(pure + '\n;({ VERSE_EMOJIS, verseEmojiOf, verseBadge })', vm.createContext({}));
const strip = (s) => s.replace(/️/g, '');

test('① verseBadge — 첫날 새 말씀 · N일째 · 날짜 없음/시작 전은 이모지만 · 목록 밖은 안 보임', () => {
  assert.equal(P.verseBadge('🐑', 100, 100), '🐑 새 말씀');
  assert.equal(P.verseBadge('🐑', 100, 102), '🐑 3일째');
  assert.equal(P.verseBadge('🐑', 100, 109), '🐑 10일째');      // 한 말씀이 7일을 넘겨도 그대로
  assert.equal(P.verseBadge(null, 100, 102), '3일째');
  assert.equal(P.verseBadge('', 100, 100), '새 말씀');
  assert.equal(P.verseBadge('🐑', null, 102), '🐑');            // 날짜 없는 구절
  assert.equal(P.verseBadge('🐑', 105, 102), '🐑');             // 곧 시작할 말씀
  assert.equal(P.verseBadge('💀', 100, 100), '새 말씀');         // 목록 밖
  assert.equal(P.verseBadge(null, null, 102), '');
});

test('① verseEmojiOf — 이체 선택자 없이 와도 목록의 꼴로 · 앞뒤 공백 · 목록 밖은 ""', () => {
  assert.equal(P.verseEmojiOf('🕊️'), '🕊️');
  assert.equal(P.verseEmojiOf('🕊'), '🕊️');                    // U+FE0F 없이
  assert.equal(P.verseEmojiOf(' 🐑 '), '🐑');
  assert.equal(P.verseEmojiOf('💀'), '');
  assert.equal(P.verseEmojiOf(null), '');
  assert.equal(P.verseEmojiOf(undefined), '');
});

test('② 목록 — 40개 · 겹침 없음 · 피부색 수식·ZWJ 없음', () => {
  const L = Array.from(P.VERSE_EMOJIS);
  assert.equal(L.length, 40);
  assert.equal(new Set(L.map(strip)).size, 40, '겹치는 이모지가 있다');
  for (const e of L) {
    assert.ok(!/[\u{1F3FB}-\u{1F3FF}]/u.test(e), e + ' — 피부색 수식');
    assert.ok(!e.includes('‍'), e + ' — ZWJ 조합');
  }
});

test('③ SQL — 칸은 if not exists · 41줄 · 모두 목록 안 · 빈 줄만 채움', () => {
  const sql = read('supabase', 'verse_emoji.sql');
  assert.ok(sql.includes('alter table public.verses add column if not exists emoji text;'));
  assert.ok(sql.includes('where v.no = x.no and v.emoji is null;'), '사람이 고친 것을 덮지 않게 — emoji is null 인 줄만');
  const rows = [...sql.matchAll(/\((\d+), '([^']+)'\)/g)].map((m) => [Number(m[1]), m[2]]);
  assert.equal(rows.length, 41);
  assert.deepEqual(rows.map((r) => r[0]), Array.from({ length: 41 }, (_, i) => i + 1));
  const list = new Set(Array.from(P.VERSE_EMOJIS));
  for (const [no, e] of rows) assert.ok(list.has(e), no + '번 ' + e + ' — 목록에 없는 꼴(이체 선택자까지 같아야 한다)');
});

test('④ index.ts — emoji 칸을 읽는다 · badge/badgeDate · AI 채움은 date 입력 없을 때만', () => {
  const INDEX = read('supabase', 'functions', 'api', 'index.ts');
  assert.ok(/^import \{ widgetVerseBadge, queueVerseEmojiFill \} from "\.\/verse-emoji\.ts";/m.test(INDEX), 'import 줄');
  const kst = slice(INDEX, 'async function weeklyVerseKst(', '\n}\n', 'weeklyVerseKst');
  assert.ok(kst.includes('const COLS = "no,ref_short,ref_full,ref,text,date,emoji";'), 'emoji 칸을 읽는다');
  assert.ok(kst.includes('startDay: x.v.date ? x.day : null'), '날짜 없는 구절은 며칠째를 쓰지 않는다');
  const fn = slice(INDEX, 'async function getWeeklyVerseForWidget(', '\n}\n', 'getWeeklyVerseForWidget');
  assert.ok(fn.includes('widgetVerseBadge(wk.meta.emoji, wk.meta.startDay, ymdDayNumber(ymd))'));
  assert.ok(fn.includes('out.badgeDate = ymd'));
  assert.ok(/if \(!\(b && b\.date\) && wk\.cur\.no != null && !wk\.meta\.emoji\) queueVerseEmojiFill\(/.test(fn),
    'AI 채움은 date 입력 없는 요청 · 이모지가 빈 구절에서만');
  assert.ok(!/\.\.\.wk\b(?!\.)/.test(fn), 'wk 를 통째로 펼치면 meta 가 응답에 실린다');
});

test('⑤ 안드로이드 — 두 레이아웃에 widget_badge(처음엔 gone) · VerseWidget 이 오늘 견준 값을 넣는다', () => {
  const RES = ['android-app', 'app', 'src', 'main', 'res', 'layout'];
  for (const f of ['widget_verse_medium.xml', 'widget_verse_large.xml']) {
    const x = read(...RES, f);
    const badge = slice(x, 'android:id="@+id/widget_badge"', '/>', f);
    assert.ok(badge.includes('android:visibility="gone"'), f + ' — 처음엔 숨김');
    assert.ok(badge.includes('android:maxLines="1"'), f + ' — 한 줄');
    assert.ok(!/<View\b/.test(x), f + ' — RemoteViews 에 <View> 금지');
  }
  const vw = read('android-app', 'app', 'src', 'main', 'java', 'kr', 'onlybible', 'gocheok', 'memorize', 'widget', 'VerseWidget.java');
  assert.ok(vw.includes('setTextOrHide(v, R.id.widget_badge, WidgetLogic.verseBadge(json, System.currentTimeMillis()));'));
});

test('⑤ 아이폰 — 위젯 코드 두 벌이 같다 · badgeDate 를 장의 날짜(한국)와 견준다 · 자정에 장을 하나 더 깐다', () => {
  for (const f of ['TodayVerseWidget.swift', 'WidgetShared.swift', 'TodayVerseWidgetBundle.swift', 'MeditationWidget.swift', 'BlessingWidget.swift']) {
    assert.equal(read('ios-app', 'native', 'TodayVerseWidget', f), read('ios-app', 'ios', 'App', 'TodayVerseWidget', f),
      f + ' — native/ 와 ios/App/ 이 다르다(두 벌을 같이 고친다)');
  }
  const sh = read('ios-app', 'native', 'TodayVerseWidget', 'WidgetShared.swift');
  assert.ok(sh.includes('func kstYmd(_ date: Date) -> String'));
  assert.ok(sh.includes('var trailing: String? = nil'), 'WidgetHeader 의 새 칸은 기본값 nil — 다른 위젯 호출이 그대로 컴파일된다');
  const tv = read('ios-app', 'native', 'TodayVerseWidget', 'TodayVerseWidget.swift');
  assert.ok(tv.includes('entry.badgeDate == kstYmd(entry.date)'), '오늘 셈한 머리말만');
  assert.ok(tv.includes('Timeline(entries: [now, after], policy: .after(when))'), '자정에 머리말 없는 장');
  assert.ok((tv.match(/trailing: badgeText/g) || []).length === 2, '중간·크게 두 곳');
  assert.ok(!/accessory[A-Za-z]*:[\s\S]{0,400}trailing/.test(tv), '잠금 화면에는 넣지 않는다');
});
