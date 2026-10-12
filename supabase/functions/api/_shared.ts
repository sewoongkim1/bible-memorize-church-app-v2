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
