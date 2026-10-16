// ============================================================
// 📚 네비게이토 성경암송(2026-10-13) — api 의 한 영역
//   액션은 index.ts 의 switch 가 부른다 — getVerses(track:"navi") → getNaviVerses.
//   ⚠️ 손대기 전에 docs/notes/navigators.md — 번호대(2001~) · 번호 재배정 금지 · 문(naviPublic)은 앱에 · 「모름」과 「없음」.
//   ⚠️ 복습에서 빼는 isNonWeeklyNo 는 index.ts 에 있다(로그인·진도 저장이 쓴다 — 물가와 같은 판정).
// ============================================================
import { db } from "./_shared.ts";

// ── 네비게이토 — 순수 함수 (여기부터) ──
//   tests/navi.test.cjs 가 이 구간만 잘라 node:vm 에서 돌린다 — 타입 표기·import 를 넣지 말 것.
// DB 한 줄 → 앱이 쓰는 구절(주간·물가와 같은 칸 이름 refShort·refFull·text) + 묶음 코드(chapter)·주제(topic).
//   묶음 이름(「A. 새로운 삶」)은 앱(js/navi.js NV_CHAPTERS)이 코드로 찾는다 — 표에는 코드만 둔다.
//   영어(NIV)는 주간과 같은 이름 textEn·refEn(2026-10-16) — 비어 있으면 앱이 그 구절을 늘 한글로 본다(app.js hasEn).
//   💡 풀이 · 🧠 기억법은 helpEasy·helpTip(supabase/navi_help.sql — 주간은 설교 자료에서 읽어 이 칸이 없다).
function naviVerseOf(v) {
  return {
    no: v.no,
    chapter: v.chapter || "",
    topic: v.topic || "",
    refShort: v.ref_short || v.ref || "",
    refFull: v.ref_full || v.ref || "",
    text: v.text || "",
    textEn: v.text_en || "",
    refEn: v.ref_en || "",
    helpEasy: v.help_easy || "",
    helpTip: v.help_tip || "",
  };
}
// ── 네비게이토 — 순수 함수 (여기까지) ──

// ---------- getVerses(track:"navi"): 켜진 카드 전부(번호순) ----------
//   날짜 잠금이 없다(묶음은 처음부터 모두 열림 — 설계 §1). 문은 앱의 naviVisible(naviPublic · 🧪 시험 참여자)이다 —
//   구절은 공개된 성경 본문이라 서버가 막을 것이 없다(이름·개인정보가 없다).
//   ⚠️ `navi: true` 를 꼭 싣는다 — 이 갈래가 없는 옛 함수는 track:"navi" 를 모르고 **주간 구절**을 돌려준다.
//      앱은 이 표식이 없으면 「지금 불러올 수 없어요」(모름)로 보고 주간 말씀을 네비게이토로 그리지 않는다.
//   ⚠️ 칸(chapter·topic · help_easy·help_tip)이 아직 없는 DB(함수가 SQL 보다 먼저 올라간 순간)·읽기 오류는 빈 목록이 아니라 ok:false —
//      「없음」(준비 중)과 「모름」(잠시 뒤 다시)을 앱이 가른다(스킬 gated-feature ③).
export async function getNaviVerses() {
  const { data, error } = await db.from("verses")
    .select("no,chapter,topic,ref_short,ref_full,ref,text,text_en,ref_en,help_easy,help_tip")
    .eq("is_active", true).eq("track", "navi").order("no");
  if (error) {
    console.error("navi verses:", error.message);
    return { ok: false, error: "navi-unavailable" };
  }
  return { ok: true, navi: true, verses: (data ?? []).map(naviVerseOf) };
}
