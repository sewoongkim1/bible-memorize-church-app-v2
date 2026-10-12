// ============================================================
// 가정 축복 기도문 — api 의 한 영역
//   2026-10-12 index.ts 에서 떼어 냈다(파일 나누기 2단계 · 동작 같음 · docs/notes/backend-api.md 「파일 나누기」).
//   액션은 index.ts 의 switch 가 부른다 — getBlessings · blessingLog · getTodayBlessing(위젯) · blessingUsage(관리자).
//   ⚠️ 손대기 전에 docs/notes/prayer-book.md — 조사 **ㄹ 받침** 함정(「으로」→「로」) · 고르는 규칙은 app.js(prayToday·prayFill)와 두 곳.
//   ⚠️ getTodayBlessing 은 아이폰·안드로이드 위젯이 읽는다 — python tests/widget-parity.py 가 운영 사이트의 웹 함수와 날짜별로 견준다.
// ============================================================
import { db, adminError, widgetYmd, ymdDayNumber, fetchAllRows } from "./_shared.ts";

// ── 축복 기도문 — 순수 함수 (여기부터) ──
//   tests/api-split.test.cjs 가 이 구간만 잘라 node:vm 에서 돌린다 — 타입 표기·import 를 넣지 말 것.
// 위젯은 로그인 이름을 모른다 — {이름} 자리에 「우리 가족」(2026-09-20 친구 결정).
const BLESS_WIDGET_NAME = "우리 가족";
function blessJong(name) {                   // 앱 prayJong
  const c = name.charCodeAt(name.length - 1);
  return (c >= 0xac00 && c <= 0xd7a3) ? (c - 0xac00) % 28 : 0;
}
function blessFill(t, name) {       // 앱 prayFill — ⚠️ ㄹ 받침(8)이면 「로」
  const j = blessJong(name);
  return String(t || "")
    .replace(/\{이름\}/g, name)
    .replace(/\{이\}/g, j ? "이" : "가")
    .replace(/\{을\}/g, j ? "을" : "를")
    .replace(/\{은\}/g, j ? "은" : "는")
    .replace(/\{과\}/g, j ? "과" : "와")
    .replace(/\{으로\}/g, (j === 0 || j === 8) ? "로" : "으로");
}
// ── 축복 기도문 — 순수 함수 (여기까지) ──

// 가정 축복 기도문 104편 — 읽기 전용. 누구나 같은 자료라 개인 것이 섞이지 않는다.
// ⚠️ prayer 는 이름 토큰({이름}{이}…)이 든 채로 내보낸다. 채우는 것은 앱(prayFill)이다 —
//    서버가 채우면 사람마다 응답이 달라져 캐시가 통째로 무용지물이 된다.
// ⚠️ "group" 은 예약어라 따옴표가 필요하다.
export async function getBlessings() {
  const { data, error } = await db.from("blessings")
    .select('no,title,seq,"group",ref,verse,prayer')
    .eq("is_active", true).order("sort_order").order("no");
  if (error) throw error;
  const blessings = (data ?? []).map((b: any) => ({
    no: b.no, title: b.title || "", seq: b.seq ?? null, group: b.group || "",
    ref: b.ref || "", verse: b.verse || "", prayer: b.prayer || "",
  }));
  return { ok: true, blessings };
}

// ---- 오늘의 축복 기도문(위젯) ----
export async function getTodayBlessing(b: any) {
  const ymd = widgetYmd(b);
  const { blessings } = await getBlessings();                // 앱 loadPrayers 와 같은 목록·차례
  const n = blessings.length;
  if (!n) return { ok: true, date: ymd, no: null, title: "", ref: "", prayer: "" };
  // 앱 prayToday 는 new Date("YYYY-MM-DDT00:00:00") 을 **폰의 지역 시간**으로 읽는다 —
  // 한국 시간 폰에서는 (그날 UTC 날수 − 1) 이 된다. 성도님 폰은 한국 시간이므로 그 값에 맞춘다.
  const i = (((ymdDayNumber(ymd) - 1) % n) + n) % n;
  const x = blessings[i];
  // tpl — 이름 토큰을 채우지 않은 원문(2026-09-26). 앱의 매일 묵상 「🙏 기도」 팝업이 로그인 이름으로
  //   prayFill 한다. 위젯은 이 칸을 읽지 않는다(prayer 가 그대로 「우리 가족」).
  return { ok: true, date: ymd, no: x.no, title: x.title, ref: x.ref, prayer: blessFill(x.prayer, BLESS_WIDGET_NAME), tpl: x.prayer };
}

// 가정 축복 기도문을 누가 얼마나 보시는지 — 한 편을 열 때 한 번 부른다.
// ⚠️ 한 사람이 하루에 한 편을 여러 번 봐도 **한 행**이다(cnt 만 는다).
//    열 때마다 한 행씩 쌓으면 금세 커진다 — daily_activity 에서 배운 것을 처음부터 쓴다.
// ⚠️ 실패해도 조용히 넘긴다. 기록 때문에 기도문이 안 열리면 본말이 뒤집힌다.
// ⚠️ 표(blessing_log.sql)를 아직 안 만든 판에서도 앱은 그대로 돌아야 한다.
export async function blessingLog(b: any) {
  const no = Number(b.no);
  if (!b.user_id || !Number.isFinite(no) || no < 1 || no > 999) return { ok: true, skipped: true };
  try {
    const { error } = await db.rpc("v2_blessing_log", { uid: b.user_id, n: no });
    if (error) {
      const m = String(error.message || "");
      const why = /does not exist|schema cache|function/i.test(m) ? "no-table"
                : /foreign key|violates/i.test(m) ? "no-user" : "db";
      return { ok: true, skipped: why };
    }
  } catch (_e) {
    return { ok: true, skipped: "error" };
  }
  return { ok: true };
}

// ---------- blessingUsage: 가정 축복 기도문 사용현황 ----------
//   blessing_log(user_id,day,no,cnt) 는 「한 사람이 하루에 한 편을 여러 번 봐도 한 행」이라
//   challenge_log 보다 훨씬 작다 — RPC 없이 fetchAllRows + JS 집계로 충분하다.
//   ⚠️ 표(blessing_log.sql)를 아직 안 돌린 판(예: 성도님께 열기 전 개발 DB)에서도
//      죽지 않고 빈 결과를 낸다 — 관리자가 "기록 없음"으로 보게, 오류로 보지 않게.
export async function blessingUsage(b: any) {
  const err = adminError(b); if (err) return { ok: false, error: err };
  const EMPTY = { ok: true, summary: { people: 0, total: 0, days: 0 }, byPrayer: [], byUser: [] };
  let rows: any[];
  try {
    rows = await fetchAllRows(() => {
      let q = db.from("blessing_log").select("user_id, day, no, cnt, users(type,gu,mok,bu,grade,name)");
      if (b.from) q = q.gte("day", b.from);
      if (b.to)   q = q.lte("day", b.to);
      return q;
    });
  } catch (e) {
    if (/does not exist|schema cache/i.test(String((e as any)?.message || ""))) return EMPTY;
    throw e;
  }
  if (!rows.length) return EMPTY;

  const { data: bl } = await db.from("blessings").select('no,title,"group"');
  const bMap = new Map<number, any>();
  (bl ?? []).forEach((r: any) => bMap.set(r.no, r));

  const people = new Set<string>(), days = new Set<string>();
  let total = 0;
  const byPrayerMap = new Map<number, { no: number; title: string; group: string; people: Set<string>; count: number }>();
  const byUserMap = new Map<string, { gubun: string; sosok: string; sebu: string; name: string; days: Set<string>; prayers: Set<number>; count: number; last: string }>();

  for (const row of rows) {
    people.add(row.user_id); days.add(row.day); total += row.cnt;

    const meta = bMap.get(row.no) ?? {};
    const pe = byPrayerMap.get(row.no) ?? { no: row.no, title: meta.title || "", group: meta.group || "", people: new Set<string>(), count: 0 };
    pe.people.add(row.user_id); pe.count += row.cnt;
    byPrayerMap.set(row.no, pe);

    const u = row.users ?? {};
    const ue = byUserMap.get(row.user_id) ?? {
      gubun: u.type || "", sosok: u.gu || u.bu || "", sebu: u.mok || u.grade || "",
      name: u.name || "", days: new Set<string>(), prayers: new Set<number>(), count: 0, last: row.day,
    };
    ue.days.add(row.day); ue.prayers.add(row.no); ue.count += row.cnt;
    if (row.day > ue.last) ue.last = row.day;
    byUserMap.set(row.user_id, ue);
  }

  const byPrayer = [...byPrayerMap.values()]
    .map((p) => ({ no: p.no, title: p.title, group: p.group, people: p.people.size, count: p.count }))
    .sort((a, c) => c.people - a.people || c.count - a.count);
  const byUser = [...byUserMap.values()]
    .map((u) => ({ gubun: u.gubun, sosok: u.sosok, sebu: u.sebu, name: u.name, days: u.days.size, prayers: u.prayers.size, count: u.count, last: u.last }))
    .sort((a, c) => c.count - a.count);

  return { ok: true, summary: { people: people.size, total, days: days.size }, byPrayer, byUser };
}
