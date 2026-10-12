// ============================================================
// 쉴만한 물가(시편·잠언·전도서 액자) — api 의 한 영역
//   2026-10-12 index.ts 에서 떼어 냈다(동작 같음 · docs/notes/backend-api.md 「파일 나누기」).
//   액션은 index.ts 의 switch 가 부른다 — getVerses(track:"psalm") → getPsalmVerses · getTodayPsalm(위젯).
//   ⚠️ 손대기 전에 docs/notes/psalm-still-waters.md — 번호(no) 재배정 금지 · 잠금은 「안 열린 것을 안 내려보내는 것」 · 게이트.
//   ⚠️ 복습에서 시편을 빼는 PSALM_NO_BASE·isPsalmNo 는 index.ts 에 있다(로그인·진도 저장이 쓴다).
// ============================================================
import { db, kstDay } from "./_shared.ts";

// ── 쉴만한 물가 — 순수 함수 (여기부터) ──
//   tests/psalm-rules.test.cjs 가 이 구간만 잘라 node:vm 에서 돌린다 — 타입 표기·import 를 넣지 말 것.
// ---------- 시편 말씀 액자: 열린 편수 ----------
// 하루에 한 편씩 열린다. 「안 열린 구절은 응답에 싣지 않는다」가 잠금의 전부다 —
// 화면에서 가리는 것이 아니라 폰에 아예 없게 한다. 시계를 바꿔도 못 연다.
const PSALM_DEFAULT = { start: "2026-09-21", totalDays: 180 };

// app_config `psalm` 의 값 → { start, totalDays } — 칸이 없거나 꼴이 틀리면 그 칸만 기본값
function psalmCfgOf(v) {
  return {
    start: typeof v.start === "string" ? v.start : PSALM_DEFAULT.start,
    totalDays: Number.isFinite(Number(v.totalDays)) ? Number(v.totalDays) : PSALM_DEFAULT.totalDays,
  };
}

// today = 한국 날짜(YYYY-MM-DD) → 그날까지 열린 편수(0 ~ totalDays). 시작일이 1편째.
function psalmOpenOn(cfg, today) {
  const t = Date.parse(today + "T00:00:00Z");
  const s = Date.parse(cfg.start + "T00:00:00Z");
  if (!Number.isFinite(t) || !Number.isFinite(s)) return 0;
  const days = Math.floor((t - s) / 86400000) + 1;
  return Math.max(0, Math.min(cfg.totalDays, days));
}
// ── 쉴만한 물가 — 순수 함수 (여기까지) ──

async function psalmConfig(): Promise<{ start: string; totalDays: number }> {
  try {
    const { data } = await db.from("app_config").select("value").eq("key", "psalm").maybeSingle();
    const v = (data && data.value) || {};
    return psalmCfgOf(v);
  } catch { return PSALM_DEFAULT; }
}

function psalmOpenCount(cfg: { start: string; totalDays: number }): number {
  // KST 오늘(YYYY-MM-DD) — 기존 kstDay(iso) 와 계산이 같다(둘 다 +9시간 뒤 날짜만 자른다).
  return psalmOpenOn(cfg, kstDay(new Date().toISOString()));
}

// ---------- getVerses(track:"psalm"): 시편 말씀 액자 · 「오늘까지 열린 것만」 ----------
export async function getPsalmVerses() {
  const cfg = await psalmConfig();
  const open = psalmOpenCount(cfg);
  const base = { ok: true, openCount: open, totalDays: cfg.totalDays, startDate: cfg.start };
  if (open <= 0) return { ...base, verses: [] };
  const { data, error } = await db.from("verses")
    .select("no,day_no,frame_art,ref_short,ref_full,ref,text")
    .eq("is_active", true).eq("track", "psalm")
    .lte("day_no", open).order("day_no");
  // 칸이 아직 없는 DB 면 조용히 빈 목록 — 화면은 「시작 전」으로 떨어진다.
  // 여기서 던지면 시편 코너 하나 때문에 앱 전체가 오류로 보인다.
  if (error) return { ...base, verses: [] };
  const verses = (data ?? []).map((v: any) => ({
    no: v.no,
    dayNo: v.day_no,
    frameArt: v.frame_art || 1,
    refShort: v.ref_short || v.ref || "",
    refFull: v.ref_full || v.ref || "",
    text: v.text || "",
  }));
  // ⚠️ open은 "오늘이 시작일로부터 며칠째인가"(날짜 계산)일 뿐, 실제로 시드된
  //    편수와는 다를 수 있다(예: 180일치를 다 못 채우고 10편만 있는 지금).
  //    openCount를 그대로 내보내면 11일차에 "11일차"라 적어 놓고 10일차 말씀을
  //    또 보여주고, 다 읽은 분은 매일 같은 구절을 다른 날짜 이름으로 받는다.
  //    실제 행 수로 눌러 그 날짜에 머무는 편이 "11일차인데 10일차 말씀"보다 정직하다.
  const openReal = Math.min(open, verses.length);
  return { ...base, openCount: openReal, verses };
}

// ---- 쉴만한 물가 오늘 편 (위젯 · 2026-10-07 「돌려 보기」 위젯의 넷째 장) ----
//   앱의 쉴만한 물가 첫 화면이 여는 것과 같은 편 = 오늘까지 열린 것 가운데 마지막(getPsalmVerses 의 끝 줄).
//   ⚠️ **date 입력을 받지 않는다.** 잠금이 「안 열린 편을 내려보내지 않는 것」이라(docs/notes/psalm-still-waters.md),
//      날짜를 받으면 인증 없는 호출 한 줄로 앞날의 편을 미리 읽는다. 늘 서버의 오늘(한국)로만 센다.
//   ⚠️ 공개 게이트(app_config psalmPublic)가 꺼져 있거나 아직 시작 전이면 { ok:true, ready:false } —
//      위젯은 이 장을 건너뛴다(오류가 아니다). 표·칸이 없는 DB 도 같은 답.
export async function getTodayPsalm(_b: any) {
  const date = kstDay(new Date().toISOString());
  const off = { ok: true, ready: false, date };
  try {
    const { data: g } = await db.from("app_config").select("value").eq("key", "psalmPublic").maybeSingle();
    if (!(g && g.value)) return off;
    const open = psalmOpenCount(await psalmConfig());
    if (open <= 0) return off;
    const { data, error } = await db.from("verses")
      .select("no,day_no,ref_full,ref,text")
      .eq("is_active", true).eq("track", "psalm")
      .lte("day_no", open).order("day_no", { ascending: false }).limit(1);
    const v = (data ?? [])[0];
    if (error || !v || !v.text) return off;
    return { ok: true, ready: true, date, dayNo: v.day_no, no: v.no, ref: v.ref_full || v.ref || "", text: v.text };
  } catch { return off; }
}
