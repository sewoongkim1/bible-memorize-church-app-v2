// ============================================================
// api 의 영역 파일들이 함께 쓰는 것 — 여기 한 곳에만 둔다(같은 것을 두 파일에 두지 않는다).
//   2026-10-12 파일 나누기 1단계에서 생겼다(docs/notes/backend-api.md 「파일 나누기」).
//   ⚠️ 영역 파일이 index.ts 의 도우미를 쓰고 싶으면 **index.ts 에서 이리로 옮기고** index.ts 는 여기서 들여온다.
//      index.ts 를 영역 파일에서 import 하지 말 것(index.ts 는 들머리 — 서로 부르는 고리가 생긴다).
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// service_role 키 클라이언트 — RLS(기본 차단)를 우회한다. 한 함수 안에서 하나만 만든다.
export const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

// ISO 시각 → 한국 날짜(YYYY-MM-DD)
export const kstDay = (iso: string) =>
  new Date(new Date(iso).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);

// ---------- 관리자 문(2026-10-12 파일 나누기 2단계에서 index.ts 에서 옮김) ----------
// 관리자 문에 「총괄 본인」 확인 (2026-10-08 · 설계 docs/superpowers/specs/2026-10-08-admin-gate-super-check-design.md)
//   SUPER_OK·INTERNAL_OK 는 **들머리(index.ts 의 Deno.serve)** 가 본문에 붙인다 — 붙이는 자리·INTERNAL_ADMIN_OK·staffIsSuper 는 index.ts 에 있다.
export const SUPER_OK = Symbol("superOk");   // 들머리가 붙인다 · JSON 으로 못 만든다 → 위조 불가
// 교회 어드민이 내부 키(service_role)로 부르는 관리 액션 — 들머리가 붙인다 · 위조 불가(2026-10-09 성경암송 관리 이전).
//   adminError 가 맨 앞에서 본다(암호 없이 통과). church-admin 의 역할(canCall)이 진짜 게이트다.
export const INTERNAL_OK = Symbol("internalOk");
export const ADMIN_PW_ONLY = new Set([        // 사람 없는 기계 호출(크론·MCP·설교) — 암호만으로 통과
  "sendPush", "weeklyVersePush", "weeklyReport", "monitor", "eveningPush",
  "findMember", "memberParticipation", "sermonJobGet", "sermonJobUpdate", "embedSermons", "importV1",
]);

// 관리자 비밀 확인 → null이면 통과, 아니면 에러코드
export function adminError(b: any): string | null {
  if ((b as any)[INTERNAL_OK] === true) return null;   // 내부 키(service_role)로 온 화이트리스트 관리 액션 — church-admin 역할이 게이트
  const secret = Deno.env.get("ADMIN_SECRET");
  if (!secret) return "no-password-set";
  if ((b.pw ?? "") !== secret) return "unauthorized";
  // 암호는 맞다. 기계 예외 액션이거나, 들머리가 확인한 총괄이면 통과. 아니면 틀린 암호와 **같은 답**(정보 안 흘림).
  if (ADMIN_PW_ONLY.has(b.action)) return null;
  return (b as any)[SUPER_OK] === true ? null : "unauthorized";
}

// ---------- 위젯 날짜(2026-10-12 index.ts 에서 옮김 · 이번 주 구절·묵상·축복 기도문 위젯이 쓴다) ----------
// 선택 입력 date("YYYY-MM-DD") — 그날 기준으로 계산한다(시험용 · 공개 정보뿐이라 열어 둔다).
export const WIDGET_YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
export function widgetYmd(b: any): string {
  const d = String(b?.date || "");
  return WIDGET_YMD_RE.test(d) ? d : kstDay(new Date().toISOString());
}
export function ymdDayNumber(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

// ---------- 1000행씩 이어 받기(2026-10-12 index.ts 에서 옮김) ----------
// PostgREST는 한 번에 최대 1000행만 반환한다. 집계는 전체 행을 세야 정확하므로
// 1000행씩 이어 받는다. 이걸 안 쓰면 로그가 1000행을 넘는 순간 조용히 잘린 값이 나온다.
// build()는 호출할 때마다 새 쿼리를 만들어야 한다(쿼리 빌더는 재사용 불가).
const PAGE_SIZE = 1000;
export async function fetchAllRows(build: () => any): Promise<any[]> {
  const out: any[] = [];
  for (let off = 0; ; off += PAGE_SIZE) {
    const { data, error } = await build().range(off, off + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = (data ?? []) as any[];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return out;
}
