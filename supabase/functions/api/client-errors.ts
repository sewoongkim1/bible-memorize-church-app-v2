// ============================================================
// 화면 오류 모으기(clientError) — api 의 한 영역 (2026-10-12 · 문 닫힌 채)
//   앱(app.js 「화면 오류 모으기」)이 성도님 기기에서 난 JS 오류를 보낸다 → 표 client_errors(supabase/client_errors.sql).
//   액션은 index.ts 의 switch 가 부른다(case "clientError").
//   ⚠️ 손대기 전에 docs/notes/client-errors.md — 모으지 않는 것(user_id·이름·소속·전체 스택·주소의 ? 뒤·UA 원문) · 문 · 방침.
//   ⚠️ 문: app_config errorLogOn 이 true 하나일 때만 받는다. 못 읽으면 받지 않는다(이 응답은 화면에 안 보이니 「모름」도 그냥 안 받음).
//   ⚠️ 응답은 늘 { ok: true[, skipped] } — 앱은 결과를 안 본다. 어떤 값도 되돌려 싣지 않는다.
// ============================================================
import { db } from "./_shared.ts";

// ── 화면 오류 — 순수 함수 (여기부터) ──
//   tests/client-errors.test.cjs 가 이 구간만 잘라 node:vm 에서 돌린다 — 타입 표기·import 를 넣지 말 것.
const CERR_SHELLS = ["web", "play", "ios"];
const CERR_OS = ["android", "ios", "windows", "mac", "other"];
const CERR_FAM = ["samsung", "kakaotalk", "naver", "edge", "firefox", "chrome", "safari", "other"];

// 오류 글 → 첫 줄 200자 · 개인 값으로 보일 만한 것을 지운다(앱도 같은 규칙으로 한 번 거른 뒤 보낸다 — 여기는 두 번째 그물).
//   주소는 ? · # 뒤를 뗀다(딥링크 ?v= · ?edu= 에 개인 값이 섞일 수 있다) · 계정 번호(uuid) · 전자우편 · 네 자리 넘는 숫자(전화·확인 번호).
function cerrScrub(v) {
  var s = typeof v === "string" ? v : v == null ? "" : String(v);
  s = s.split(/\r?\n/)[0] || "";
  s = s.replace(/[\u0000-\u001f\u007f]/g, " ");
  s = s.replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s'"<>()]+/gi, function (u) { return u.split(/[?#]/)[0]; });
  s = s.replace(/[?#][^\s'"<>()]*=[^\s'"<>()]*/g, "");
  s = s.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<id>");
  s = s.replace(/[^\s@'"<>()]+@[^\s@'"<>()]+\.[a-z]{2,}/gi, "<email>");
  s = s.replace(/\d[\d\s-]{3,}\d/g, "<n>");
  s = s.replace(/\s+/g, " ").trim();
  return s.slice(0, 200);
}

// 받은 몸 → 넣을 여섯 칸(아는 칸만 옮긴다 — 몸에 user_id·이름 등 다른 칸이 와도 버린다). 오류 글이 비면 null.
function cerrClean(b) {
  var o = b && typeof b === "object" ? b : {};
  var str = function (x) { return typeof x === "string" ? x : ""; };
  var msg = cerrScrub(o.msg);
  if (!msg) return null;
  var build = str(o.build);
  if (!/^[0-9a-z]{1,16}$/.test(build)) build = "";
  var shell = CERR_SHELLS.indexOf(str(o.shell)) >= 0 ? str(o.shell) : "other";
  var screen = str(o.screen);
  if (!/^[A-Za-z]{1,40}$/.test(screen)) screen = "";
  var src = str(o.src);
  if (src !== "other" && !/^[A-Za-z0-9_.\/-]{1,60}:\d{1,7}(:\d{1,7})?$/.test(src)) src = "";
  var br = str(o.browser).split("-");
  var browser = (CERR_OS.indexOf(br[0]) >= 0 ? br[0] : "other") + "-" + (br.length === 2 && CERR_FAM.indexOf(br[1]) >= 0 ? br[1] : "other");
  return { build: build, shell: shell, screen: screen, msg: msg, src: src, browser: browser };
}
// ── 화면 오류 — 순수 함수 (여기까지) ──

export async function clientError(b: any) {
  try {
    const { data, error } = await db.from("app_config").select("value").eq("key", "errorLogOn").maybeSingle();
    if (error) return { ok: true, skipped: "config" };
    if (data?.value !== true) return { ok: true, skipped: "closed" };
    const c = cerrClean(b);
    if (!c) return { ok: true, skipped: "bad" };
    const { data: r, error: e } = await db.rpc("v2_client_error", {
      p_build: c.build, p_shell: c.shell, p_screen: c.screen, p_msg: c.msg, p_src: c.src, p_browser: c.browser,
    });
    if (e) {
      const m = String(e.message || "");
      return { ok: true, skipped: /does not exist|schema cache|function/i.test(m) ? "no-table" : "db" };
    }
    return r === "cap" ? { ok: true, skipped: "cap" } : { ok: true };
  } catch (_e) {
    return { ok: true, skipped: "error" };
  }
}
