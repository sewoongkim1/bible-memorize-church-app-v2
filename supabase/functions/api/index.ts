// ============================================================
// 성경말씀 암송 앱 v2 — API 미들웨어 (Supabase Edge Function)
//   클라이언트(PWA)/관리자 화면의 데이터 요청을 이 함수가 처리한다.
//   service_role 키로 접속하여 RLS(기본 차단)를 우회한다.
//   배포: supabase functions deploy api --no-verify-jwt
//   (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 자동 주입 / ADMIN_SECRET 은 시크릿 설정)
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC");
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE");
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@example.com";
if (VAPID_PUBLIC && VAPID_PRIVATE) {
  try { webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE); } catch (_) {}
}

// ---------- APNs (iOS 네이티브 푸시) ----------
// 외부 라이브러리 없이 Deno 내장 Web Crypto(ES256)로 JWT를 직접 서명한다.
// ⚠️ 이 앱은 App Store 배포 서명만 쓴다(TestFlight 포함) — sandbox가 아니라
//    항상 production APNs 엔드포인트를 쓴다.
const APNS_KEY_ID = Deno.env.get("APNS_KEY_ID");
const APNS_TEAM_ID = Deno.env.get("APNS_TEAM_ID");
const APNS_PRIVATE_KEY = Deno.env.get("APNS_PRIVATE_KEY"); // .p8 파일 전체 내용(PEM)
const APNS_BUNDLE_ID = "kr.onlybible.gocheok.memorize";
const APNS_READY = !!(APNS_KEY_ID && APNS_TEAM_ID && APNS_PRIVATE_KEY);

function base64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

let apnsKeyPromise: Promise<CryptoKey> | null = null;
function getApnsKey(): Promise<CryptoKey> {
  if (!apnsKeyPromise) {
    const pem = (APNS_PRIVATE_KEY || "")
      .replace(/-----BEGIN PRIVATE KEY-----/, "")
      .replace(/-----END PRIVATE KEY-----/, "")
      .replace(/\s+/g, "");
    const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
    apnsKeyPromise = crypto.subtle.importKey(
      "pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"],
    );
  }
  return apnsKeyPromise;
}

// APNs provider token — ⚠️ **기기마다 새로 만들면 안 된다.**
//   애플은 이 토큰을 20분에 한 번보다 자주 갱신하면 거절한다(403 TooManyProviderTokenUpdates).
//   예전에는 sendApns 가 기기마다 이 함수를 불러, 13대에 연달아 보내면 몇 초 안에 토큰
//   13개를 만들었다 — 그래서 아이폰 알림이 통째로 막혔다.
//   (2026-09-24 발견: 8일간 sent 가 36에 붙박이인데 failed 가 iOS 토큰 수와 정확히 같았다.
//    한 통짜리 시험 발송은 토큰을 하나만 만들어 통과했기 때문에 오래 안 보였다.)
//   토큰 유효기간은 최대 1시간이므로 45분만 쓴다.
//   ⚠️ Edge Function 은 요청마다 새 아이소레이트일 수 있다 — 그래도 **한 번의 발송 안에서**
//      13대가 같은 토큰을 쓰는 것이 핵심이고, 그 자리가 바로 막히던 곳이다.
let apnsJwtCache: { token: string; at: number } | null = null;
const APNS_JWT_TTL_MS = 45 * 60 * 1000;

async function apnsJwt(): Promise<string> {
  const now = Date.now();
  if (apnsJwtCache && now - apnsJwtCache.at < APNS_JWT_TTL_MS) return apnsJwtCache.token;
  const header = base64url(new TextEncoder().encode(JSON.stringify({ alg: "ES256", kid: APNS_KEY_ID })));
  const payload = base64url(new TextEncoder().encode(JSON.stringify({ iss: APNS_TEAM_ID, iat: Math.floor(now / 1000) })));
  const key = await getApnsKey();
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(`${header}.${payload}`),
  );
  const token = `${header}.${payload}.${base64url(new Uint8Array(sig))}`;
  apnsJwtCache = { token, at: now };
  return token;
}

// 반환: "ok"(발송 성공) | "gone"(토큰이 더 이상 유효하지 않음 — 표에서 지워야 함) | "error"(그 외)
//   out 을 주면 out.reason 에 **왜 실패했는지**를 담아 준다(예: "403 TooManyProviderTokenUpdates").
//   ⚠️ 기기 토큰이나 user_id 는 담지 않는다 — 이유 문자열만.
async function sendApns(
  deviceToken: string, title: string, body: string, out?: { reason?: string },
): Promise<"ok" | "gone" | "error"> {
  if (!APNS_READY) { if (out) out.reason = "apns-not-configured"; return "error"; }
  try {
    const jwt = await apnsJwt();
    const res = await fetch(`https://api.push.apple.com/3/device/${deviceToken}`, {
      method: "POST",
      headers: {
        "authorization": `bearer ${jwt}`,
        "apns-topic": APNS_BUNDLE_ID,
        "apns-push-type": "alert",
        "apns-priority": "10",
      },
      body: JSON.stringify({ aps: { alert: { title, body }, sound: "default" } }),
    });
    if (res.ok) return "ok";
    const j = await res.json().catch(() => ({} as any));
    if (out) out.reason = `${res.status} ${j.reason ?? "?"}`;
    // ⚠️ 토큰이 죽었다는 신호일 때만 "gone" 이다. 그 밖(403·400 등)은 표를 건드리지 않는다 —
    //    2026-09-24 에 13개가 전부 "error" 라 안 지워진 것이 원인을 좁히는 단서였다.
    if (res.status === 410 || j.reason === "BadDeviceToken" || j.reason === "Unregistered") return "gone";
    return "error";
  } catch (e: any) {
    if (out) out.reason = `throw ${(e && e.message ? e.message : String(e)).slice(0, 60)}`;
    return "error";
  }
}

// 진단용 — testPush(diag:true)가 원인을 그대로 보게 해 준다(JWT/인증 문제인지, 그냥 가짜
// 토큰이라 거절됐는지 구분할 수 있어야 한다).
async function sendApnsDiag(deviceToken: string, title: string, body: string):
  Promise<{ status: number; reason: string | null }> {
  const jwt = await apnsJwt();
  const res = await fetch(`https://api.push.apple.com/3/device/${deviceToken}`, {
    method: "POST",
    headers: {
      "authorization": `bearer ${jwt}`,
      "apns-topic": APNS_BUNDLE_ID,
      "apns-push-type": "alert",
      "apns-priority": "10",
    },
    body: JSON.stringify({ aps: { alert: { title, body }, sound: "default" } }),
  });
  const j = await res.json().catch(() => ({} as any));
  return { status: res.status, reason: j.reason ?? null };
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const REVIEW_DAYS = [3, 7, 14, 30, 60]; // 복습(Leitner) 간격(일)
// 시편 구절 번호 = 1000 + day_no. 앱(js/psalm.js 의 PSALM_NO_BASE)과 **같은 이름·같은 값**이라야
// 한쪽만 바뀔 때 눈에 띈다. 쓸 곳이 늘면 isPsalmNo() 를 같이 쓴다.
const PSALM_NO_BASE = 1000;
// ⚠ 쉴만한 물가(시편)는 **복습에 넣지 않는다**(성도님 결정 2026-09-13). 앱은
//   dueReviewNos() 에서 걸러 내지만 **서버가 안 걸러 예약을 계속 만들었다** —
//   화면엔 안 보이니 아무도 모른 채 reviews 에 41행(13명)이 쌓였고,
//   review_metrics.sql ③④(복습대상·밀린건수)가 그만큼 부풀어 나왔다(2026-09-23).
//   지우기만 하면 로그인 한 번에 되살아난다 — 아래 두 자리를 함께 막는다.
function isPsalmNo(no: any) { return Number(no) > PSALM_NO_BASE; }
// 같은 구절이라도 한글과 영어는 서로 다른 암송 — 진도를 따로 센다
const progLang = (v: unknown) => (String(v ?? "") === "en" ? "en" : "ko");
const KST = "+09:00";

const norm = (s: unknown) => (s ?? "").toString().trim().replace(/\s+/g, " ");
const identityKey = (u: any) =>
  [u.type, u.gu, u.mok, u.bu, u.grade, u.name].map(norm).join("|");
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const kstDay = (iso: string) =>
  new Date(new Date(iso).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// 관리자 문에 「총괄 본인」 확인 (2026-10-08 · 설계 docs/superpowers/specs/2026-10-08-admin-gate-super-check-design.md)
// 암호 하나로 열리던 것을 「암호 + 그 브라우저에 로그인된 사람이 교회 어드민 활성 총괄」로 좁힌다(임시 자물쇠).
const SUPER_OK = Symbol("superOk");   // 들머리가 붙인다 · JSON 으로 못 만든다 → 위조 불가
const ADMIN_PW_ONLY = new Set([        // 사람 없는 기계 호출(크론·MCP·설교) — 암호만으로 통과
  "sendPush", "weeklyVersePush", "weeklyReport", "monitor", "eveningPush",
  "findMember", "memberParticipation", "sermonJobGet", "sermonJobUpdate", "embedSermons", "importV1",
]);
// b.staff(로그인된 사람)가 교회 어드민 활성 총괄(super)과 같은 사람인가 — 같은 프로젝트 표라 직접 읽는다.
// ⚠️ admin_role_grants → admin_members FK 가 둘(member_id·granted_by)이라 임베드가 모호하다 → 두 질의.
// ⚠️ 목장 표기는 양방향(ministryStaffCandidates)·NFC 안 함(성경암송 가입과 같게).
async function staffIsSuper(b: any): Promise<boolean> {
  const st = b?.staff && typeof b.staff === "object" && !Array.isArray(b.staff) ? b.staff : null;
  if (!st || !norm(st.name)) return false;
  const g = await db.from("admin_role_grants").select("member_id").eq("role_id", "super");
  if (g.error || !g.data || !g.data.length) return false;
  const ids = (g.data as any[]).map((r) => r.member_id);
  const m = await db.from("admin_members").select("type,gu,mok,bu,grade,name").eq("status", "active").in("id", ids);
  if (m.error || !m.data) return false;
  const want = new Set(ministryStaffCandidates(st));
  for (const row of m.data as any[]) {
    if (ministryStaffCandidates(row).some((k) => want.has(k))) return true;
  }
  return false;
}

// 관리자 비밀 확인 → null이면 통과, 아니면 에러코드
function adminError(b: any): string | null {
  const secret = Deno.env.get("ADMIN_SECRET");
  if (!secret) return "no-password-set";
  if ((b.pw ?? "") !== secret) return "unauthorized";
  // 암호는 맞다. 기계 예외 액션이거나, 들머리가 확인한 총괄이면 통과. 아니면 틀린 암호와 **같은 답**(정보 안 흘림).
  if (ADMIN_PW_ONLY.has(b.action)) return null;
  return (b as any)[SUPER_OK] === true ? null : "unauthorized";
}

// 사역신청 담당자 확인 → null이면 통과 (2026-09-17)
// 사역 담당자는 관리자 메뉴 전체를 볼 필요가 없다. 그런데 관리자 비번을 드리면 화면에서 메뉴를
// 숨겨도 **그 비번 하나로 관리자 액션 50여 개**(알림 발송·성도 정보 변경·다른 앱 관리)를 다 부를 수
// 있다 — 그래서 **사역신청 관리 액션만** 받는 비번(MINISTRY_SECRET)을 따로 둔다.
// ⚠️ 비번만으로는 부족하다(성도님 요청): 그 비번으로 들어온 분이 **등록된 담당자**인지도 본다.
//    담당자는 app_config `ministryAdmins`(identity_key 배열) — pilsaAdmins 와 같은 까닭으로 코드에
//    이름을 두지 않는다(공개 저장소). 이름·소속은 비밀이 아니므로 **비번과 함께일 때만** 뜻이 있다.
// ⚠️ 로그인 화면에서 한 번 보는 것으로 끝내지 않고 **액션마다** 본다 — 화면을 건너뛰고 API 를
//    바로 부르면 그만이기 때문이다.
// ⚠️ 관리자 비번은 그대로 통과한다(관리자는 모든 자료를 본다). authCheck(허브)에는 쓰지 말 것.
// 담당자 역할 — 사역신청(2026-09-17) · 설교·찬양(2026-09-21). 역할마다 암호 하나 + 등록된 담당자 명단.
// 설교·찬양 담당자는 설교를 올리고 암송구절·찬양을 고친다 — 관리자 암호를 드리면 알림 발송·성도 정보까지 열린다.
const STAFF_ROLES: Record<string, { secret: string; list: string }> = {
  ministry: { secret: "MINISTRY_SECRET", list: "ministryAdmins" },
  content:  { secret: "CONTENT_STAFF_SECRET", list: "contentAdmins" },
};
// ⚠️ 제 칸만 역할로 친다 — STAFF_ROLES[role] 로 보면 「constructor」 같은 이름이 물려받은 칸으로 통과한다(2026-09-21 리뷰)
const staffRole = (role: unknown) =>
  typeof role === "string" && Object.hasOwn(STAFF_ROLES, role) ? STAFF_ROLES[role] : null;
async function staffRoleError(b: any, role: string): Promise<string | null> {
  if (!adminError(b)) return null;
  const r = staffRole(role);
  const s = r ? Deno.env.get(r.secret) : "";
  if (!s || (b.pw ?? "") !== s) return adminError(b);
  // ⚠️ 담당자가 아니어도 「unauthorized」 — 틀린 암호와 **같은 답**(2026-09-17 리뷰)
  return (await staffUserId(b, role)) ? null : "unauthorized";
}
const ministryAdminError = (b: any) => staffRoleError(b, "ministry");
const contentError = (b: any) => staffRoleError(b, "content");

// 비번과 함께 온 담당자(b.staff = {type,gu,mok,bu,grade,name})가 등록된 분이면 그분의 user id
// ⚠️ **키가 아니라 사람(user_id)으로** 맞댄다(2026-09-17 리뷰). 관리자가 이름·소속을 고치거나 계정을
//    합치면 users.identity_key 는 바뀌고 옛 키는 user_identity_aliases 로 간다 — 키끼리 비교하면
//    새 소속으로도(목록에 없음) 옛 소속으로도(users 에 없음) 막힌다. 앱 로그인(member_login)이
//    별칭을 따라가듯 여기서도 등록 키·적은 키를 둘 다 사람으로 풀어 비교한다.
// ⚠️ DB 오류는 삼키지 않는다 — 「담당자가 아닙니다」로 보이면 등록된 분이 까닭 없이 막힌 줄 안다.
async function staffUserId(b: any, role: string): Promise<string | null> {
  const st = b.staff && typeof b.staff === "object" && !Array.isArray(b.staff) ? b.staff : null;
  if (!st || !norm(st.name)) return null;
  const keys = await staffKeys(role);
  if (!keys.length) return null;
  const cands = ministryStaffCandidates(st);
  const who = await ministryKeysToUsers([...cands, ...keys]);
  const mine = new Set(cands.map((k) => who.get(k)).filter(Boolean));
  for (const k of keys) {
    const id = who.get(k);
    if (id && mine.has(id)) return id;
  }
  return null;
}

// 담당자가 적은 소속으로 만들 수 있는 identity_key 들 — 앱에 적힌 표기가 사람마다 달라서
//  · 목장: 「20」·「20목장」 둘 다(목장 이름 자체가 「…목장」인 분이 있어 적은 그대로도 본다)
//  · 학년: 「3」·「3학년」 둘 다(앱은 「예: 3학년」으로 받는다)
function ministryStaffCandidates(st: any): string[] {
  const type = norm(st.type) || "교구";
  const mok = norm(st.mok), grade = norm(st.grade);
  const moks = [mok, mok.replace(/목장$/, "")];
  const g0 = grade.replace(/학년$/, "");
  const grades = [grade, g0, /^\d+$/.test(g0) ? g0 + "학년" : g0];
  const out = new Set<string>();
  for (const m of moks) for (const g of grades) {
    out.add(identityKey({ type, gu: st.gu, mok: m, bu: st.bu, grade: g, name: st.name }));
  }
  return [...out];
}

// identity_key → user id (지금 키면 users, 옛 키면 user_identity_aliases)
async function ministryKeysToUsers(list: string[]): Promise<Map<string, string>> {
  const uniq = [...new Set(list.map((k) => norm(k)).filter(Boolean))];
  const out = new Map<string, string>();
  if (!uniq.length) return out;
  const { data: us, error: e1 } = await db.from("users").select("id,identity_key").in("identity_key", uniq);
  if (e1) throw e1;
  for (const u of (us ?? []) as any[]) out.set(u.identity_key, u.id);
  const rest = uniq.filter((k) => !out.has(k));
  if (rest.length) {
    const { data: al, error: e2 } = await db.from("user_identity_aliases").select("identity_key,user_id").in("identity_key", rest);
    if (e2) throw e2;
    for (const a of (al ?? []) as any[]) out.set(a.identity_key, a.user_id);
  }
  return out;
}

// ---------- 사역신청 담당자 명단 — 관리자만 (2026-09-17) ----------
// ⚠️ 등록·해제는 **관리자 암호로만** 받는다. 사역 암호로 담당자를 더할 수 있으면 그 암호 하나로
//    스스로를 담당자로 넣어 문을 연다(둘째 확인이 무의미해진다).
// ⚠️ 한 분씩 더하고 뺀다 — 목록을 통째로 받으면 옛 화면·동시 편집이 다른 분을 조용히 지운다
//    (supabase/ministry_admins.sql 도 통째로 바꾸는 방식이라 「기존 분을 함께 적으라」고 적어 둬야 했다).
// ⚠️ 더할 때는 **users 에 있는 identity_key 만** 받는다 — 화면은 이름 찾기(adminFindMembers) 결과에서
//    고르게 한다. 동명이인(같은 이름 여러 계정)을 소속·마지막 접속으로 갈라 고르게 하려는 것.
async function staffKeys(role: string): Promise<string[]> {
  const r = staffRole(role);
  if (!r) return [];
  const { data, error } = await db.from("app_config").select("value").eq("key", r.list).maybeSingle();
  if (error) throw error;
  return Array.isArray(data?.value) ? (data!.value as any[]).map((x) => norm(String(x))).filter(Boolean) : [];
}

async function ministryAdminsView(keys: string[]) {
  // 옛 키(소속이 바뀌거나 합쳐진 분)는 별칭을 따라가 **지금 계정**으로 보여 준다 — 로그인도 그렇게 통과한다.
  // user 가 null 이면 users 에도 별칭에도 없는 키(계정이 지워짐) — 들어올 수 없으니 화면이 알린다.
  const who = await ministryKeysToUsers(keys);
  const ids = [...new Set([...who.values()])];
  const byId = new Map<string, any>();
  if (ids.length) {
    const { data, error } = await db.from("users")
      .select("id,identity_key,type,gu,mok,bu,grade,name,last_seen_at").in("id", ids);
    if (error) throw error;
    for (const u of (data ?? []) as any[]) byId.set(u.id, u);
  }
  return keys.map((k) => {
    const u = byId.get(who.get(k) ?? "");
    if (!u) return { key: k, user: null };
    const { id: _id, identity_key, ...rest } = u;   // ⚠️ user_id 는 응답에 싣지 않는다
    return { key: k, current_key: identity_key, moved: identity_key !== k, user: rest };
  });
}

async function staffAdmins(b: any) {
  const err = adminError(b); if (err) return { ok: false, error: err };
  const role = staffRole(b.role) ? b.role : "";
  if (!role) return { ok: false, error: "invalid" };
  return { ok: true, admins: await ministryAdminsView(await staffKeys(role)) };
}

async function staffAdminsSave(b: any) {
  const err = adminError(b); if (err) return { ok: false, error: err };
  const role = staffRole(b.role) ? b.role : "";
  const op = String(b.op || "");
  const key = norm(b.key);
  if (!role || (op !== "add" && op !== "remove") || !key || key.length > 200) return { ok: false, error: "invalid" };
  const keys = await staffKeys(role);
  if (op === "add") {
    const { data: u, error } = await db.from("users").select("id").eq("identity_key", key).maybeSingle();
    if (error) throw error;
    if (!u) return { ok: false, error: "no-user" };
    if (keys.indexOf(key) < 0) keys.push(key);
  } else {
    const i = keys.indexOf(key);
    if (i >= 0) keys.splice(i, 1);
  }
  const { error } = await db.from("app_config").upsert(
    { key: staffRole(role)!.list, value: keys, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw error;
  // ⚠️ 메모리의 목록이 아니라 **다시 읽은 목록**을 돌려준다 — 두 저장이 겹쳐 한쪽이 덮였으면 화면이 사실을 보인다
  //    (막는 것은 화면이 한 번에 하나만 보내는 것이다. 관리자 둘이 같은 순간 누르는 일은 드물다.)
  return { ok: true, admins: await ministryAdminsView(await staffKeys(role)) };
}

// ---------- 설교 챗봇: Voyage 임베딩 (myfavorite lib/voyage.ts의 Deno 이식) ----------
const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
async function embedVoyage(
  texts: string[],
  inputType: "document" | "query",
): Promise<number[][]> {
  const key = Deno.env.get("VOYAGE_API_KEY");
  if (!key) throw new Error("VOYAGE_API_KEY 시크릿 미설정");
  const res = await fetch(VOYAGE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      input: texts,
      model: "voyage-3-large",
      input_type: inputType,
      output_dimension: 1024,
    }),
  });
  if (!res.ok) throw new Error(`voyage-${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  return (j.data ?? []).map((d: any) => d.embedding as number[]);
}

// 설교 1건 → 청크 배열. summary·각 point·각 daily_meditation을 개별 청크로 쪼개고,
// 검색·인용 시 맥락이 남도록 각 청크 앞에 `[제목 — 소제목]` 헤더를 붙인다.
function chunkSermon(s: any): { chunk_index: number; content: string }[] {
  const out: { chunk_index: number; content: string }[] = [];
  const title = (s.title ?? "").toString().trim();
  const push = (label: string, bodyRaw: unknown) => {
    const body = (bodyRaw ?? "").toString().trim();
    if (!body) return;
    out.push({ chunk_index: out.length, content: `[${title} — ${label}]\n${body}` });
  };
  push("요약", s.summary);
  for (const p of (s.points ?? [])) push(p.heading ?? "본문", p.body);
  for (const m of (s.daily_meditations ?? [])) push(m.heading ?? "묵상", m.message);
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json();
    // 병합 전에 접속한 기기도 같은 사용자로 조회/저장한다. 관리자 대상은 자동 변경하지 않는다.
    if (!String(body.action || "").startsWith("admin")) {
      for (const field of ["user_id", "me"]) {
        if (typeof body[field] === "string" && /^[0-9a-f-]{36}$/i.test(body[field])) {
          const { data, error } = await db.from("user_merges").select("target_user_id")
            .eq("source_user_id", body[field]).maybeSingle();
          if (error) throw error;
          if (data) body[field] = data.target_user_id;
        }
      }
    }
    // 관리자 암호가 맞고 예외 액션이 아니면, 이 staff 가 총괄인지 한 번 확인해 본문에 붙인다(adminError 가 본다).
    //   ⚠️ body.pw 가 빈 값일 때 ADMIN_SECRET 미설정과 겹치지 않게 `&& body.pw`.
    if ((body.pw ?? "") === (Deno.env.get("ADMIN_SECRET") ?? "") && body.pw && !ADMIN_PW_ONLY.has(body.action)) {
      try { (body as any)[SUPER_OK] = await staffIsSuper(body); } catch (_) { (body as any)[SUPER_OK] = false; }
    }
    switch (body.action) {
      case "authCheck": {   // 관리자 비번 검증(허브 로그인용)
        const e = adminError(body);
        return json(e ? { ok: false, error: e } : { ok: true }, e ? 403 : 200);
      }
      case "ministryAuth": {   // 사역신청 관리 화면 로그인 — 관리자 비번, 또는 사역 비번 + 등록된 담당자
        const e = await ministryAdminError(body);
        if (e) return json({ ok: false, error: e }, 403);
        return json({ ok: true, role: adminError(body) ? "ministry" : "admin" });
      }
      case "contentAuth": {    // 설교·찬양 관리 로그인 — 관리자 비번, 또는 설교·찬양 비번 + 등록된 담당자(2026-09-21)
        const e = await contentError(body);
        if (e) return json({ ok: false, error: e }, 403);
        return json({ ok: true, role: adminError(body) ? "content" : "admin" });
      }
      case "staffVerify": {    // 찬양 함수가 묻는다 — 이 비번·담당자가 설교·찬양 담당자로 통과하나
        if (body.role !== "content") return json({ ok: false, error: "invalid" }, 400);
        const e = await contentError(body);
        return json(e ? { ok: false, error: e } : { ok: true }, e ? 403 : 200);
      }
      case "login": {
        // 로그인 횟수 제한 — 접속 주소가 필요해 여기서 본다(login 은 body 만 받는다 · 꺼져 있으면 아무것도 안 한다)
        const limited = await loginLimitError(body, req, identityKey(body));
        if (limited) return json({ ok: false, error: limited });
        return json(await login(body));
      }
      case "lifeGate":      return json(await lifeGate(body));
      case "lifePinSet":    return json(await lifePinSet(body));
      case "lifePinCheck":  return json(await lifePinCheck(body));
      case "lifeResetRequest": return json(await lifeResetRequest(body));
      case "lifeContactSave":  return json(await lifeContactSave(body));
      case "saveProgress":  return json(await saveProgress(body));
      case "saveHeart":     return json(await saveHeart(body));
      case "getConfig":     return json(await getConfig(body));
      case "saveConfig":    return json(await saveConfig(body));
      case "challenge":     return json(await challenge(body));
      case "advanceReview": return json(await advanceReview(body));
      case "ranking":       return json(await ranking(body));
      case "guRanking":     return json(await guRanking(body));
      case "mydays":        return json(await mydays(body));
      case "verseCounts":   return json(await verseCounts(body));
      // ---- 관리자 통계 ----
      case "stats":         return json(await stats(body));
      case "participants":  return json(await participants(body));
      case "adminFindMembers": return json(await adminFindMembers(body));
      case "adminUpdateMember": return json(await adminUpdateMember(body));
      case "adminMemberHistory": return json(await adminMemberHistory(body));
      case "adminPreviewMemberMerge": return json(await adminPreviewMemberMerge(body));
      case "adminMergeMembers": return json(await adminMergeMembers(body));
      case "verses":        return json(await verseStats(body));
      case "blessingUsage": return json(await blessingUsage(body));
      // ---- 조회(MCP 학습용) ----
      case "findMember":          return json(await findMember(body));
      case "memberParticipation": return json(await memberParticipation(body));
      // ---- 말씀/설교 관리(CMS) ----
      case "getVerses":     return json(await getVerses(body));
      case "saveVerse":     return json(await saveVerse(body));
      case "seedVerses":    return json(await seedVerses(body));
      case "generateNiv":   return json(await generateNiv(body));
      case "embedSermons":  return json(await embedSermons(body));
      // ---- 설교 올리기 — 설교·찬양 담당자(2026-09-21) ----
      case "sermonStaffList": return json(await sermonStaffList(body));
      case "sermonJobCreate": return json(await sermonJobCreate(body));
      case "sermonJobs":      return json(await sermonJobs(body));
      case "sermonJobRetry":  return json(await sermonJobRetry(body));
      case "sermonStaffSave": return json(await sermonStaffSave(body));
      case "sermonDelete":    return json(await sermonDelete(body));
      case "staffVerseSave":  return json(await staffVerseSave(body));
      // ---- 말씀 연상 그림 — 설교·찬양 담당자(2026-09-21) ----
      case "verseImgList":     return json(await verseImgList(body));
      case "verseImgScenes":   return json(await verseImgScenes(body));
      case "verseImgGenerate": return json(await verseImgGenerate(body));
      case "verseImgAlt":      return json(await verseImgAlt(body));
      case "verseImgSave":     return json(await verseImgSave(body));
      case "verseImgHide":     return json(await verseImgHide(body));
      case "sermonJobGet":    return json(await sermonJobGet(body));      // 워크플로 — 관리자 암호만
      case "sermonJobUpdate": return json(await sermonJobUpdate(body));   // 워크플로 — 관리자 암호만
      case "sermonChat":    return json(await sermonChat(body));
      case "debugSermonSearch": return json(await debugSermonSearch(body));
      case "sermonSummary": return json(await sermonSummary(body));
      case "sermonChatLog": return json(await sermonChatLog(body));
      case "clearSummaryCache": return json(await clearSummaryCache(body));
      case "clearChatCache": return json(await clearChatCache(body));
      case "getBlessings":        return json(await getBlessings());
      case "blessingLog":         return json(await blessingLog(body));
      case "featureLog":          return json(await featureLog(body));
      case "getPassages":         return json(await getPassages());
      case "savePassage":         return json(await savePassage(body));
      case "deletePassage":       return json(await deletePassage(body));
      case "savePassageProgress": return json(await savePassageProgress(body));
      case "getPassageProgress":  return json(await getPassageProgress(body));
      case "passageHelp":         return json(await passageHelp(body));
      case "passageHelpAll":      return json(await passageHelpAll(body));
      case "cleanupDummy":  return json(await cleanupDummy());
      case "importV1":      return json(await importV1(body));
      // ---- Web Push ----
      case "savePush":      return json(await savePush(body));
      case "saveIosPushToken": return json(await saveIosPushToken(body));
      case "updateIosPushHour": return json(await updateIosPushHour(body));
      case "updatePushEvening": return json(await updatePushEvening(body));
      case "removePush":    return json(await removePush(body));
      case "removeIosPush": return json(await removeIosPush(body));
      case "removePushByUser": return json(await removePushByUser(body));
      case "testPush":      return json(await testPush(body));
      // 어드민 '자동 넣기'용 — 매일 아침 실제로 나가는 문구(오늘의 묵상 + 이번주 말씀)를 그대로 반환
      case "pushPreview": {
        const c = await dailyPushContent();
        return json(c ? { ok: true, title: c.title, body: c.body } : { ok: false, error: "no-content" });
      }
      case "pushStats":     return json(await pushStats(body));
      case "pushHistory":   return json(await pushHistory(body));
      case "pushSubscribers": return json(await pushSubscribers(body));
      case "sendPush":      return json(await sendPush(body));
      case "weeklyVersePush": return json(await weeklyVersePush(body));
      case "eveningPush":   return json(await eveningPush(body));
      case "getWeeklyVerse":     return json(await getWeeklyVerseForWidget(body));   // 위젯 — 앱과 같은 한국 날짜 기준
      case "getTodayMeditation": return json(await getTodayMeditation(body));        // 위젯 — 오늘의 묵상
      case "getTodayBlessing":   return json(await getTodayBlessing(body));          // 위젯 — 오늘의 축복 기도문
      case "getTodayPsalm":      return json(await getTodayPsalm(body));             // 위젯 — 쉴만한 물가 오늘 편(2026-10-07)
      case "getTodaySong":       return json(await getTodaySong(body));            // 오늘의 찬양 — 하루 한 곡
      case "logSongClick":       return json(await logSongClick(body));            // 오늘의 찬양 단추를 누른 횟수
      // ---- 장애 모니터링 ----
      case "monitor":       return json(await monitor(body));
      // ---- 주간 리포트 메일 ----
      case "weeklyReport":  return json(await weeklyReport(body));
      // ---- 말씀 이벤트 ----
      case "eventEnter":    return json(await eventEnter(body));
      case "eventStatus":   return json(await eventStatus(body));
      case "eventBoard":    return json(await eventBoard(body));
      case "eventEntrants": return json(await eventEntrants(body));
      // ---- 이벤트 플랫폼 (분기 회차 · 2026-09-10) ----
      //  ⚠️ 바로 위 event* 넷(eventEnter/Status/Board/Entrants)은 옛 「말씀 이벤트」
      //     (퀴즈형, app_config('event') + event_entries)다. 이름이 비슷하지만
      //     표도 흐름도 다르다 — 섞지 말 것.
      case "eventOpenList": return json(await eventOpenList(body));
      case "eventStamps":   return json(await eventStamps(body));
      case "eventSignup":   return json(await eventSignup(body));
      case "eventDrop":     return json(await eventDrop(body));
      case "eventRoster":   return json(await eventRoster(body));
      case "eventSetNote":  return json(await eventSetNote(body));
      case "eventExcuse":   return json(await eventExcuse(body));
      case "eventSave":     return json(await eventSave(body));
      case "eventImport":   return json(await eventImport(body));
      case "eventRosterPublic": return json(await eventRosterPublic(body));
      // ---- 성경필사 노트 신청 ----
      case "pilsaMine":      return json(await pilsaMine(body));
      case "pilsaApply":     return json(await pilsaApply(body));
      case "pilsaCancel":    return json(await pilsaCancel(body));
      case "pilsaList":      return json(await pilsaList(body));
      case "pilsaSetStatus": return json(await pilsaSetStatus(body));

      // ---- 사역신청 ----
      case "ministryCatalog":  return json(await ministryCatalog(body));
      case "ministryMine":     return json(await ministryMine(body));
      case "ministryTester":   return json(await ministryTester(body));   // 시험 참여자인가(2026-09-30)
      case "ministryHistoryMine":    return json(await ministryHistoryMine(body));      // 사역 이력 확인(2026-10-01)
      case "ministryHistoryRequest": return json(await ministryHistoryRequest(body));   // 사역 이력 정정 신청(2026-10-01)
      // ---- 교육신청(2026-10-05) ----
      case "eduList":   return json(await eduList(body));
      case "eduCourse": return json(await eduCourse(body));
      case "eduApply":  return json(await eduApply(body));
      case "eduCancel": return json(await eduCancel(body));
      case "eduMine":   return json(await eduMine(body));
      case "eduCert":   return json(await eduCert(body));     // 내 수료증 자료(3단계) — 내 줄·수료·안 취소일 때만
      case "eduVerify": return json(await eduVerify(body));   // 수료번호 진위 확인(로그인 없이 · 가린 이름만)
      case "internalEduNotify": return json(await internalEduNotify(req, body));   // 교육 확정 알림(4단계) — church-admin 전용(x-internal-key)
      case "internalEduRemind": return json(await internalEduRemind(req));         // 교육 개강 전날 알림(4단계) — pg_cron 전용(x-internal-key)
      // ---- 봉사 당번(2026-10-06 · 2단계 성도님 액션 · 3단계 알림) — 문(dutyOpen 또는 시험 참여자)은 읽기도 막는다(당번표에 이름이 나간다) ----
      case "dutyList":   return json(await dutyList(body));
      case "dutyBoard":  return json(await dutyBoard(body));
      case "dutyApply":  return json(await dutyApply(body));
      case "dutyCancel": return json(await dutyCancel(body));
      case "dutyMine":   return json(await dutyMine(body));
      case "dutyPast":   return json(await dutyPast(body));
      case "dutyAsk":    return json(await dutyAsk(body));
      case "internalDutyNotify": return json(await internalDutyNotify(req, body));   // 당번 알림(3단계) — church-admin 전용(x-internal-key)
      case "internalDutyRemind": return json(await internalDutyRemind(req, body));         // 당번 전날 알림(3단계) — pg_cron 전용(x-internal-key)
      case "ministryApply":    return json(await ministryApply(body));
      case "ministryCancel":   return json(await ministryCancel(body));
      case "ministryList":     return json(await ministryList(body));
      case "ministryPaperCheck": return json(await ministryPaper(body, false));
      case "ministryPaperSave":  return json(await ministryPaper(body, true));
      case "ministrySetStatus":return json(await ministrySetStatus(body));
      case "ministryDelete":   return json(await ministryDelete(body));
      case "ministryCatalogSave": return json(await ministryCatalogSave(body));
      case "ministryCatalogOrder": return json(await ministryCatalogOrder(body));
      case "ministryAdmins":     return json(await staffAdmins({ ...body, role: "ministry" }));      // 담당자 명단(관리자만)
      case "ministryAdminsSave": return json(await staffAdminsSave({ ...body, role: "ministry" }));  // 한 분씩 추가·빼기(관리자만)
      case "staffAdmins":        return json(await staffAdmins(body));       // 역할별 명단(관리자만 · role)
      case "staffAdminsSave":    return json(await staffAdminsSave(body));
      case "internalMinistryNotify": return json(await internalMinistryNotify(req, body));  // church-admin 전용(x-internal-key)

      // ---- 순위 응원 ----
      case "rankCheer":     return json(await rankCheer(body));
      case "rankCheerers":  return json(await rankCheerers(body));
      // ---- 응원·기도·공감 게시판 ----
      case "boardList":     return json(await boardList(body));
      case "boardReact":    return json(await boardReact(body));
      case "boardReactors": return json(await boardReactors(body));
      case "boardCheck":    return json(await boardCheck(body));
      case "boardUpload":   return json(await boardUpload(body));
      case "boardPost":     return json(await boardPost(body));
      case "boardReply":    return json(await boardReply(body));
      case "boardDeleteMine": return json(await boardDeleteMine(body));
      case "boardModerate": return json(await boardModerate(body));
      // ---- 게시판 신고(🚩 · 2026-10-01 · 구글 UGC) — 신고한 분은 어떤 응답에도 싣지 않는다 ----
      case "boardReport":        return json(await boardReport(body));          // 성도
      case "boardReports":       return json(await boardReports(body));         // 관리자 — 처리 전 신고(글·답글별로 묶음)
      case "boardReportResolve": return json(await boardReportResolve(body));   // 관리자 — 숨기기 · 처리 완료
      // 구글 출시 심사 전(2026-10-01) — 이용 규칙 동의 · 이분 글 가리기 · AI 답 알리기. ⚠️ user_id(가린 분·알린 분)는 어떤 응답에도 안 싣는다
      case "boardRulesAccept":   return json(await boardRulesAccept(body));     // 성도 — 게시판 이용 규칙 동의(한 번)
      case "boardBlock":         return json(await boardBlock(body));           // 성도 — 이 글을 쓴 분의 글을 내 화면에서 가리기
      case "boardBlocks":        return json(await boardBlocks(body));          // 성도 — 내가 가린 분(이름·줄 번호만)
      case "boardUnblock":       return json(await boardUnblock(body));         // 성도 — 다시 보기
      case "sermonAnswerReport": return json(await sermonAnswerReport(body));   // 성도 — 「내게 주시는 말씀」 답 알리기
      case "sermonAnswerReports":       return json(await sermonAnswerReports(body));        // 관리자 — 처리 전 알림(질문별)
      case "sermonAnswerReportResolve": return json(await sermonAnswerReportResolve(body));  // 관리자 — 처리 완료 · 답 지우기
      default:             return json({ error: `unknown action: ${body.action}` }, 400);
    }
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});

// ---------- cleanupDummy: 테스트 더미 사용자 삭제(cascade) ----------
async function cleanupDummy() {
  const { data, error } = await db.from("users")
    .delete().eq("identity_key", "교구|테스트|99|||테스트유저").select("id");
  if (error) throw error;
  return { ok: true, deleted: (data ?? []).length };
}

// ---------- importV1: v1 시트(dump) → Supabase 이관 (ADMIN_SECRET 보호) ----------
// body: { pw, rows:[{when,type,sosok,sebu,name,no,stage,mode}], challenge:[{when,type,sosok,sebu,name,no,mode}] }
function dumpUser(x: any) {
  const isGu = x.type === "교구";
  return {
    type: x.type,
    gu: isGu ? norm(x.sosok) || null : null,
    mok: isGu ? norm(x.sebu) || null : null,
    bu: isGu ? null : norm(x.sosok) || null,
    grade: isGu ? null : norm(x.sebu) || null,
    name: norm(x.name),
  };
}
async function importV1(b: any) {
  const err = adminError(b); if (err) return { ok: false, error: err };
  const rows = (b.rows ?? []).filter((r: any) => r.mode !== "test" && r.name);
  const chal = (b.challenge ?? []).filter((r: any) => r.name);

  // 1) 사용자 upsert (양 탭의 신원 합집합)
  const users = new Map<string, any>();
  for (const x of [...rows, ...chal]) {
    const u = dumpUser(x);
    const key = [u.type, u.gu, u.mok, u.bu, u.grade, u.name].map(norm).join("|");
    if (!users.has(key)) users.set(key, { ...u, identity_key: key });
  }
  const userRows = [...users.values()];
  if (userRows.length) {
    const { error } = await db.from("users").upsert(userRows, { onConflict: "identity_key" });
    if (error) throw error;
  }
  // identity_key → id
  const { data: allUsers, error: e2 } = await db.from("users").select("id, identity_key");
  if (e2) throw e2;
  const idOf = new Map<string, string>();
  (allUsers ?? []).forEach((u: any) => idOf.set(u.identity_key, u.id));
  const keyOf = (x: any) => {
    const u = dumpUser(x);
    return [u.type, u.gu, u.mok, u.bu, u.grade, u.name].map(norm).join("|");
  };

  // 존재하는 구절No만 이관(FK 오류 방지)
  const { data: vs } = await db.from("verses").select("no");
  const verseSet = new Set((vs ?? []).map((v: any) => Number(v.no)));

  // 2) 진도: (user, verse) 최고 단계
  const progMap = new Map<string, any>();
  for (const r of rows) {
    const uid = idOf.get(keyOf(r)); if (!uid) continue;
    const no = Number(r.no); const stage = parseInt(r.stage, 10);
    if (!no || isNaN(stage) || !verseSet.has(no)) continue;
    const k = uid + "|" + no;
    const cur = progMap.get(k);
    if (!cur || stage > cur.stage) progMap.set(k, { user_id: uid, verse_no: no, stage, lang: "ko" });
  }
  if (progMap.size) {
    const arr = [...progMap.values()];
    for (let i = 0; i < arr.length; i += 500) {
      const { error } = await db.from("progress").upsert(arr.slice(i, i + 500), { onConflict: "user_id,verse_no,lang" });
      if (error) throw error;
    }
  }

  // 3) 활동 로그: 기록 탭→learn-*, 도전기록 탭→typing/voice (일시 보존)
  const logs: any[] = [];
  for (const r of rows) {
    const uid = idOf.get(keyOf(r)); if (!uid) continue;
    const no = Number(r.no); if (!no || !verseSet.has(no)) continue;
    logs.push({ user_id: uid, verse_no: no, mode: r.mode === "voice" ? "learn-voice" : "learn-typing", created_at: r.when });
  }
  for (const r of chal) {
    const uid = idOf.get(keyOf(r)); if (!uid) continue;
    const no = Number(r.no); if (!no || !verseSet.has(no)) continue;
    logs.push({ user_id: uid, verse_no: no, mode: r.mode === "voice" ? "voice" : "typing", created_at: r.when });
  }
  let inserted = 0;
  for (let i = 0; i < logs.length; i += 500) {
    const chunk = logs.slice(i, i + 500);
    const { error } = await db.from("challenge_log").insert(chunk);
    if (error) throw error;
    inserted += chunk.length;
  }

  return { ok: true, users: userRows.length, progress: progMap.size, logs: inserted };
}

// ---------- savePush: 푸시 구독 저장 ----------
async function savePush(b: any) {
  const s = b.subscription || {};
  if (!s.endpoint) return { ok: false, error: "no-subscription" };
  const hour = [5, 6, 7, 8].includes(Number(b.hour)) ? Number(b.hour) : 7;
  const base = {
    user_id: b.user_id,
    endpoint: s.endpoint,
    p256dh: s.keys && s.keys.p256dh,
    auth: s.keys && s.keys.auth,
  };
  let { error } = await db.from("push_subscriptions").upsert({ ...base, hour }, { onConflict: "endpoint" });
  if (error && /hour/i.test(String(error.message || ""))) {
    // hour 컬럼 마이그레이션 전이면 시간 없이 저장(폴백)
    ({ error } = await db.from("push_subscriptions").upsert(base, { onConflict: "endpoint" }));
  }
  if (error) throw error;
  return { ok: true, hour };
}

// ---------- saveIosPushToken: iOS 네이티브 푸시 토큰 저장 ----------
async function saveIosPushToken(b: any) {
  const token = String(b.deviceToken || "").trim();
  if (!token) return { ok: false, error: "no-token" };
  if (!b.user_id) return { ok: false, error: "no-user" };
  const hour = [5, 6, 7, 8].includes(Number(b.hour)) ? Number(b.hour) : 7;
  const { error } = await db.from("ios_push_tokens")
    .upsert({ user_id: b.user_id, device_token: token, hour }, { onConflict: "device_token" });
  if (error) throw error;
  return { ok: true, hour };
}

// ---------- updateIosPushHour: 네이티브 앱에서 알림 시간만 바꿀 때 ----------
// 설정 화면의 "알림 시간" 선택은 원래 웹푸시(savePush)로만 서버에 반영됐다 —
// 네이티브 앱(iOS)은 기기 토큰이 이미 등록돼 있어도 이 액션을 몰라 조용히
// 무시되고 있었다(2026-09-16 실기기 확인 중 발견). device_token 없이 user_id로
// 그 사람의 모든 등록 기기(여러 번 설치했을 수 있음)를 한 번에 갱신한다.
async function updateIosPushHour(b: any) {
  if (!b.user_id) return { ok: false, error: "no-user" };
  const hour = [5, 6, 7, 8].includes(Number(b.hour)) ? Number(b.hour) : 7;
  const { data, error } = await db.from("ios_push_tokens")
    .update({ hour }).eq("user_id", b.user_id).select("id");
  if (error) throw error;
  return { ok: true, hour, updated: (data ?? []).length > 0 };
}

// ---------- updatePushEvening: 저녁 알림만 켜고 끄기 (2026-09-23, 0판) ----------
// ⚠️ 저녁 on/off 는 **사람 단위**다 — 시각(hour)이 기기 단위인 것과 다르다.
//    한 분이 웹과 아이폰을 함께 쓰시면 저녁은 둘 다 같이 꺼지는 것이 자연스럽다.
// ⚠️ 응답에 user_id 를 싣지 않는다(이 API 는 JWT 가 없다).
// ⚠️ evening 칸이 아직 없는 DB(함수가 먼저 올라간 순간)에서도 죽지 않아야 한다 —
//    savePush 의 hour 폴백과 같은 까닭이다. 그때는 ok:true, migrated:false 로 돌려준다.
async function updatePushEvening(b: any) {
  if (!b.user_id) return { ok: false, error: "no-user" };
  const on = b.on !== false;   // 기본은 켜짐 — 빠뜨린 호출이 사람을 조용히 끄면 안 된다
  let web = 0, ios = 0, migrated = true;
  const hit = async (table: string) => {
    const { data, error } = await db.from(table)
      .update({ evening: on }).eq("user_id", b.user_id).select("id");
    if (error) {
      if (/evening/i.test(String(error.message || ""))) { migrated = false; return 0; }
      throw error;
    }
    return (data ?? []).length;
  };
  web = await hit("push_subscriptions");
  ios = await hit("ios_push_tokens");
  return { ok: true, on, web, ios, migrated };
}

// DB verses에서 '이번 주(=오늘 기준 최신) 말씀'을 읽어 {ref,text} 반환.
// prev: 직전 주 말씀(같은 형태) — 매일 묵상이 월~일 주기라 일요일엔 이걸 써야 해서 함께 반환.
async function latestVerse(): Promise<{ no: number | null; ref: string; text: string; prev: { no: number | null; ref: string; text: string } | null } | null> {
  try {
    const COLS = "no,ref_short,ref_full,ref,text,date";
    let { data, error } = await db.from("verses")
      .select(COLS)
      .eq("is_active", true).eq("track", "weekly");   // 이번 주 말씀은 주간 트랙만
    // ⚠️ getVerses와 같은 폴백 — track 칸이 아직 없는 DB(새 함수가 먼저 올라간 순간)에서도
    //    살아남아야 한다. 없으면 여기가 조용히 null이 되어 아침 푸시·매일 묵상·주일 말씀
    //    푸시가 말씀 없이 나가거나 skip된다.
    if (error) {
      const r = await db.from("verses").select(COLS).eq("is_active", true);
      if (r.error) throw r.error;
      data = r.data;
    }
    const list = (data ?? [])
      .filter((v: any) => v.date)
      .map((v: any) => ({ v, t: Date.parse(v.date) }))
      .sort((a: any, b: any) => a.t - b.t);
    if (!list.length) return null;
    const now = Date.now();
    let curIdx = 0;
    list.forEach((x: any, i: number) => { if (x.t <= now) curIdx = i; });
    const toShape = (row: any) => ({
      no: row.v.no ?? null,
      ref: row.v.ref_short || row.v.ref_full || row.v.ref || "",
      text: row.v.text || "",
    });
    return { ...toShape(list[curIdx]), prev: curIdx > 0 ? toShape(list[curIdx - 1]) : null };
  } catch (_) { return null; }
}

// ---------- 위젯(아이폰) — 이번 주 구절 · 오늘의 묵상 · 오늘의 축복 기도문 (2026-09-20) ----------
// 위젯은 로그인 없이 이 셋을 받아 그리기만 한다 — 공개 정보만, user_id 없음.
// ⚠️ 여기 규칙은 **app.js 와 두 곳**이다. 한쪽을 고치면 다른 쪽도 함께 고친다.
//    이번 주 구절 = getWeeklyVerseInfo(+kstDayNumber) · 묵상 = maybeShowWeeklyMeditation
//    (+findSermonForVerse · sermonCycleStarted · sermonHasMeditationContent · buildWeeklyMeditations · halfText)
//    · 기도문 = loadPrayers · prayToday · prayJong · prayFill.
//    확인: python tests/widget-parity.py — 운영 사이트의 웹 함수와 날짜별로 한 글자까지 견준다.
// 선택 입력 date("YYYY-MM-DD") — 그날 기준으로 계산한다(시험용 · 공개 정보뿐이라 열어 둔다).
const WIDGET_YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
function widgetYmd(b: any): string {
  const d = String(b?.date || "");
  return WIDGET_YMD_RE.test(d) ? d : kstDay(new Date().toISOString());
}
function ymdDayNumber(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

type WidgetVerse = { no: number | null; ref: string; text: string };

// 이번 주 구절 — 앱 getWeeklyVerseInfo 와 같은 기준(한국 **날짜**).
//   ⚠️ 2026-09-23 정정 — 「latestVerse() 는 UTC 자정으로 골라 앱과 달랐다」는 **틀린 말이었다**.
//      verses.date 가 항상 KST 자정 순간이라 Date.parse 비교도 KST 자정에 넘어간다(2,232시간 대조·불일치 0건).
//      ⚠️ 그래도 latestVerse() 를 이 함수로 갈아끼우지 말 것 — 이 함수는 날짜 없는 구절을 「오늘 것」으로
//      보므로(아래 dayOf), 주일 아침 weeklyVersePush 가 아직 시작 안 한 구절을 전체 구독자에게 뿌린다.
//      읽을 것: docs/superpowers/specs/2026-09-23-evening-push-design.md 맨 앞 절.
//   ⚠️ 날짜가 없는 구절은 **그날(ymd)로 본다** — 앱의 kstDayNumber(null) 이 「오늘」을 돌려주기 때문이다
//      (날짜 없이 먼저 들어온 구절을 앱은 곧바로 이번 주 말씀으로 보인다 — 2026-09-20 에 38번이 그랬다). 앱과 같게.
async function weeklyVerseKst(ymd: string): Promise<{ cur: WidgetVerse; prev: WidgetVerse | null } | null> {
  const COLS = "no,ref_short,ref_full,ref,text,date";
  let { data, error } = await db.from("verses").select(COLS)
    .eq("is_active", true).eq("track", "weekly").order("no");   // getVerses 와 같은 순서(같은 날끼리의 차례)
  if (error) {                                                   // track 칸이 없는 DB — latestVerse 와 같은 폴백
    const r = await db.from("verses").select(COLS).eq("is_active", true).order("no");
    if (r.error) throw r.error;
    data = r.data;
  }
  const today = ymdDayNumber(ymd);
  const dayOf = (raw: unknown): number | null => {
    if (!raw) return today;
    const t = Date.parse(String(raw));
    return isNaN(t) ? null : ymdDayNumber(kstDay(new Date(t).toISOString()));
  };
  const dated = (data ?? [])
    .map((v: any) => ({ v, day: dayOf(v.date) }))
    .filter((x: any) => x.day !== null)
    .sort((a: any, b: any) => a.day - b.day);
  if (!dated.length) return null;
  const shape = (x: any): WidgetVerse => ({
    no: x.v.no ?? null,
    ref: x.v.ref_short || x.v.ref_full || x.v.ref || "",
    text: x.v.text || "",
  });
  let idx = -1;
  dated.forEach((x: any, i: number) => { if (x.day <= today) idx = i; });
  if (idx < 0) return { cur: shape(dated[0]), prev: null };      // 앱의 「곧 시작할 말씀」
  return { cur: shape(dated[idx]), prev: idx > 0 ? shape(dated[idx - 1]) : null };
}

async function getWeeklyVerseForWidget(b: any) {
  const wk = await weeklyVerseKst(widgetYmd(b));
  return wk ? { ...wk.cur, prev: wk.prev } : {};
}

// ---- 오늘의 묵상 ----
const MED_PREP_MSG = "이번 주 설교 묵상 자료를 준비하고 있어요.\n잠시 후 다시 확인해 주세요 🙏";
const MED_DEFAULT_Q = "오늘 이 말씀을 삶의 어느 자리에 적용할 수 있을까요?";
function medHasContent(s: any): boolean {
  return !!(s && ((s.daily_meditations && s.daily_meditations.length) ||
                  (s.points && s.points.length) || (s.questions && s.questions.length)));
}
function medCycleStarted(s: any, ymd: string): boolean {       // 앱 sermonCycleStarted
  if (!medHasContent(s)) return false;
  const d = String((s && s.svc_date) || "").slice(0, 10);
  if (!WIDGET_YMD_RE.test(d)) return true;
  return d < ymd;
}
function medHalfText(text: unknown): string {                  // 앱 halfText
  const t = String(text || "").trim();
  const parts = t.match(/[^.!?。]+[.!?。]*\s*/g);
  if (!parts || parts.length <= 1) return t;
  const target = t.length * 0.5;
  let out = "";
  for (const p of parts) { out += p; if (out.length >= target) break; }
  return out.trim();
}
const medPlain = (t: unknown) => String(t ?? "").replace(/\*\*([^*]+)\*\*/g, "$1");   // 앱 scEmphasis 의 굵게 표시를 벗긴 것
type MedItem = { heading: string; message: string; question: string; prep?: boolean };
function medItems(verse: WidgetVerse, s: any): MedItem[] {      // 앱 buildWeeklyMeditations
  const daily = (s && s.daily_meditations) || [];
  if (daily.length) {
    return daily
      .filter((d: any) => d && (d.message || d.question))
      .map((d: any) => ({ heading: d.heading || "", message: d.message || "", question: d.question || "" }));
  }
  const items: MedItem[] = [];
  const pts = (s && s.points) || [];
  const qs = (s && s.questions) || [];
  const n = Math.max(pts.length, qs.length);
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const q = qs.length ? qs[i % qs.length] : "";
    const full = p ? (p.body || "") : ((s && s.summary) || verse.text);
    const message = medHalfText(full);
    if (!message && !q) continue;
    items.push({ heading: p ? (p.heading || "") : "", message, question: q });
  }
  if (!items.length) {
    items.push(!s
      ? { heading: "", message: MED_PREP_MSG, question: "", prep: true }
      : { heading: "", message: verse.text, question: MED_DEFAULT_Q });
  }
  return items;
}

async function getTodayMeditation(b: any) {
  const ymd = widgetYmd(b);
  const [y, m, d] = ymd.split("-").map(Number);
  const dayIdx = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;   // 월 0 … 일 6
  const dayLabel = "월화수목금토일"[dayIdx];
  const prep = { ok: true, ready: false, date: ymd, dayLabel, heading: "", message: MED_PREP_MSG,
                 question: "", sermonTitle: "", usingPrev: false };
  const wk = await weeklyVerseKst(ymd);
  if (!wk) return prep;
  // 설교는 **두 구절 것만** 읽는다 — sermon 함수의 getSermons 는 142편·1.9MB 라 위젯마다 받기엔 무겁다.
  // 칸 이름은 gocheok-sermons 저장소 sermon 함수의 toApp 과 같다(svc_date→date, mem_verse_no→memVerseNo …).
  const nos = [wk.cur.no, wk.prev ? wk.prev.no : null].filter((n) => n != null);
  let rows: any[] = [];
  if (nos.length) {
    const { data, error } = await db.from("sermons")
      .select("title,svc_date,summary,points,questions,daily_meditations,mem_verse_no")
      .eq("hidden", false).in("mem_verse_no", nos).order("svc_date", { ascending: false });
    if (!error) rows = data ?? [];                     // 표가 없는 DB(개발)면 설교 없음 = 「준비하고 있어요」
  }
  const find = (no: number | null) => rows.find((s) => s.mem_verse_no === no && s.summary) || null;   // 앱 findSermonForVerse
  let verse = wk.cur;
  let sermon = find(wk.cur.no);
  let usingPrev = false;
  if (!medCycleStarted(sermon, ymd) && wk.prev) {
    const ps = find(wk.prev.no);
    if (medHasContent(ps)) { verse = wk.prev; sermon = ps; usingPrev = true; }
  }
  const items = medItems(verse, sermon);
  if (!items.length) return prep;
  const it = items[dayIdx % items.length];
  return {
    ok: true, ready: !it.prep, date: ymd, dayLabel,
    heading: medPlain(it.heading), message: medPlain(it.message), question: medPlain(it.question),
    sermonTitle: sermon ? (sermon.title || "") : "", usingPrev,
  };
}

// ---- 오늘의 축복 기도문 ----
// 위젯은 로그인 이름을 모른다 — {이름} 자리에 「우리 가족」(2026-09-20 친구 결정).
const BLESS_WIDGET_NAME = "우리 가족";
function blessJong(name: string): number {                   // 앱 prayJong
  const c = name.charCodeAt(name.length - 1);
  return (c >= 0xac00 && c <= 0xd7a3) ? (c - 0xac00) % 28 : 0;
}
function blessFill(t: unknown, name: string): string {       // 앱 prayFill — ⚠️ ㄹ 받침(8)이면 「로」
  const j = blessJong(name);
  return String(t || "")
    .replace(/\{이름\}/g, name)
    .replace(/\{이\}/g, j ? "이" : "가")
    .replace(/\{을\}/g, j ? "을" : "를")
    .replace(/\{은\}/g, j ? "은" : "는")
    .replace(/\{과\}/g, j ? "과" : "와")
    .replace(/\{으로\}/g, (j === 0 || j === 8) ? "로" : "으로");
}
async function getTodayBlessing(b: any) {
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

// ---- 쉴만한 물가 오늘 편 (위젯 · 2026-10-07 「돌려 보기」 위젯의 넷째 장) ----
//   앱의 쉴만한 물가 첫 화면이 여는 것과 같은 편 = 오늘까지 열린 것 가운데 마지막(getPsalmVerses 의 끝 줄).
//   ⚠️ **date 입력을 받지 않는다.** 잠금이 「안 열린 편을 내려보내지 않는 것」이라(docs/notes/psalm-still-waters.md),
//      날짜를 받으면 인증 없는 호출 한 줄로 앞날의 편을 미리 읽는다. 늘 서버의 오늘(한국)로만 센다.
//   ⚠️ 공개 게이트(app_config psalmPublic)가 꺼져 있거나 아직 시작 전이면 { ok:true, ready:false } —
//      위젯은 이 장을 건너뛴다(오류가 아니다). 표·칸이 없는 DB 도 같은 답.
async function getTodayPsalm(_b: any) {
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

// ---------- 오늘의 찬양 (2026-09-23) ----------
//   찬양 아카이브의 songs 표를 **읽기 전용**으로 걸러(v2_song_pool) 하루 한 곡을
//   daily_song 에 적는다. 고르는 규칙은 SQL 쪽에 있다 — supabase/daily_song.sql.
//   ⚠️ **date 입력을 열지 않는다.** 위젯 셋(getWeeklyVerse·getTodayMeditation·
//      getTodayBlessing)은 widgetYmd(b) 로 date 를 받지만 그건 **읽기 전용**이라
//      안전했다(index.ts:644 주석). 이건 **쓰는** 액션이라, 같은 입력을 베끼면 인증 없는
//      호출 한 줄로 365일치 행을 미리 박아 성도님이 볼 곡을 태울 수 있다.
//      시험은 개발 DB 에 SQL 로 행을 넣어 한다.
//   ⚠️ 표·뷰·함수가 없거나 후보가 0이면 **오류가 아니라** { ok:true, song:null } 이다.
//      개발 DB 에는 songs 표가 아예 없고(PGRST205), 이 값을 기다리는 곳이 매일 묵상
//      팝업이라 여기서 던지면 **묵상 창이 통째로 안 뜬다.**
async function getTodaySong(_b: any) {
  const day = kstDay(new Date().toISOString());
  try {
    const { data, error } = await db.rpc("v2_today_song", { p_day: day });
    if (error) return { ok: true, song: null };
    const row = (data ?? [])[0];
    if (!row) return { ok: true, song: null };
    return {
      ok: true,
      song: {
        id: row.id, song: row.song, choir: row.choir,
        svc_date: row.svc_date, duration: row.duration, thumbnail: row.thumbnail,
      },
    };
  } catch { return { ok: true, song: null }; }
}

// 단추를 누른 것만 센다(재생 자체는 찬양 앱의 logPlay 가 이미 센다).
//   ⚠️ 응답에 user_id 를 싣지 않는다. 실패해도 조용히 ok 로 돌려준다 — 이걸로
//      성도님 화면이 막히면 안 된다.
async function logSongClick(b: any) {
  const uid = String(b.user_id || "");
  const sid = String(b.song_id || "");
  if (!uid || !sid) return { ok: true };
  // ⚠️ 열람 기록 **통합 표**에 쌓는다(supabase/feature_log.sql · 다른 세션이 2026-09-23 에 만들었다).
  //    표를 따로 만들지 않는다 — 그 표가 바로 이런 중복을 없애려고 생긴 것이고,
  //    member_merge.sql 의 계정 합치기 목록에도 이미 들어가 있다.
  //    ⚠️ 그 세션이 통합 액션(logFeature)을 내놓으면 **이 액션을 지우고** 그걸 쓴다.
  //       그때까지는 FEATURES 배열(그쪽 코드)을 건드리지 않으려고 따로 둔다.
  try { await db.rpc("v2_feature_log", { uid, f: "song", n: 0 }); } catch { /* 조용히 */ }
  return { ok: true };
}

// 매일 아침 푸시 문구 — 오늘의 묵상(요일별) 뒤에 이번주 말씀을 붙인다.
//   제목: 🌿 오늘의 묵상 · <주제>
//   본문: <적용질문>  +  📖 <이번주 말씀> (<출처>)
// 묵상이 없으면(예전 설교) 기존처럼 말씀만 보낸다.
//
// 묵상 발행 주기는 '월~일'이다 — 설교(및 요일별 묵상)는 주일 오후에 등록되므로,
// 그 설교가 실제로 다루는 한 주는 다음날(월)부터 그다음 주일까지. 즉 주일(오늘) 아침엔
// 아직 이번주 설교가 없을뿐더러, 있더라도 "주일"은 그 설교가 다루는 주기의 첫날이 아니라
// 직전 설교(지난주 등록분) 주기의 마지막 날이다 — 그래서 주일엔 반드시 직전 주 말씀·설교를 쓴다.
async function dailyPushContent(): Promise<{ title: string; body: string } | null> {
  const v = await latestVerse();
  if (!v) return null;
  const kst = new Date(Date.now() + 9 * 3600 * 1000);
  const isSunday = kst.getUTCDay() === 0;
  const target = (isSunday && v.prev) ? v.prev : v;
  const verseLine = target.ref ? `${target.text} (${target.ref})` : target.text;
  let title = "오직 성경, 말씀이 답이다!";
  let body = verseLine;
  try {
    if (target.no != null) {
      const { data } = await db.from("sermons")
        .select("daily_meditations").eq("mem_verse_no", target.no).limit(5);
      const rows = (data ?? []).map((r: any) => (r.daily_meditations || []))
        .filter((arr: any[]) => Array.isArray(arr) && arr.length);
      const items = (rows[0] || []).filter((d: any) => d && (d.question || d.message));
      if (items.length) {
        // 월=0 … 일=6 (묵상 발행 주기가 월~일이므로 요일 인덱스도 월요일 기준)
        const dayIdx = (kst.getUTCDay() + 6) % 7;
        const it = items[dayIdx % items.length];
        title = `🌿 오늘의 묵상 · ${it.heading || "오늘의 묵상"}`;
        body = `${it.question || it.message}\n\n📖 ${verseLine}`;
      }
    }
  } catch (_) { /* 묵상 조회 실패 시 말씀만 */ }
  return { title, body };
}

// ---------- removePush: 구독 해제(본인 endpoint 삭제) ----------
async function removePush(b: any) {
  if (!b.endpoint) return { ok: false, error: "no-endpoint" };
  const { error } = await db.from("push_subscriptions").delete().eq("endpoint", b.endpoint);
  if (error) throw error;
  return { ok: true };
}

// ---------- removeIosPush: 아이폰 앱 「내 정보 지우기」 — 그 계정에 묶인 기기 토큰을 지운다(검토 반영 2026-10-07) ----------
//   화면은 「이 기기의 알림도 함께 꺼집니다」라고 말하는데 웹 구독만 지우고 아이폰 토큰은 남겼다 — 다음 분이 로그인해 앱이 다시 앞에 올 때까지
//   앞 계정의 알림(당번·교육은 그분의 날짜·자리다)이 그 아이폰에 떴다. 토큰은 앱 껍데기만 알아 화면이 기기를 가려 보낼 수 없다 → 그 계정의 토큰을 모두 지운다
//   (그분의 다른 아이폰은 앱을 다시 열 때 껍데기가 다시 등록한다). 응답에 토큰·계정 번호를 싣지 않는다.
async function removeIosPush(b: any) {
  const userId = eduUid(b.user_id);
  if (!userId) return { ok: false, error: "no-user" };
  const { error } = await db.from("ios_push_tokens").delete().eq("user_id", userId);
  if (error) throw error;
  return { ok: true };
}

// ---------- removePushByUser: 관리자용 — 특정 성도의 알림 구독을 전부 삭제(기기 무관).
//   재설치·재구독 흐름을 처음부터 다시 테스트하려는 목적. ----------
async function removePushByUser(b: any) {
  const err = adminError(b); if (err) return { ok: false, error: err };
  if (!b.user_id) return { ok: false, error: "no-user" };
  const { data, error } = await db.from("push_subscriptions").delete().eq("user_id", b.user_id).select("endpoint");
  if (error) throw error;
  return { ok: true, deleted: (data ?? []).length };
}

// ---------- testPush: 본인 기기(endpoint)에만 테스트 발송 ----------
async function testPush(b: any) {
  // iOS 네이티브 푸시 진단 경로 — 기기 토큰이 있으면 여기로
  if (b.iosDeviceToken) {
    if (!APNS_READY) return { ok: false, error: "apns-not-configured" };
    if (b.diag) {
      const d = await sendApnsDiag(b.iosDeviceToken, "성경암송 — 알림 테스트", "이 메시지가 보이면 APNs 연결 성공입니다 🙌");
      return { ok: d.status === 200, status: d.status, reason: d.reason };
    }
    const r = await sendApns(b.iosDeviceToken, "성경암송 — 알림 설정 완료 ✅", "알림이 정상 작동해요! 🙌");
    return { ok: r === "ok", result: r };
  }
  // 네이티브 앱 설정 화면의 "내 기기로 테스트 알림" — 기기 토큰은 웹에 안 보여서
  // user_id로 본인의 가장 최근 등록 기기를 찾아 보낸다(관리자 비번 없이, 본인 것만).
  if (b.user_id && !b.endpoint) {
    if (!APNS_READY) return { ok: false, error: "apns-not-configured" };
    const { data: row } = await db.from("ios_push_tokens")
      .select("device_token").eq("user_id", b.user_id)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!row) return { ok: false, error: "no-ios-token" };
    const r = await sendApns(row.device_token, "성경암송 — 알림 설정 완료 ✅", "알림이 정상 작동해요! 🙌");
    return { ok: r === "ok", result: r };
  }
  if (!b.endpoint) return { ok: false, error: "no-endpoint" };
  const { data: sub } = await db.from("push_subscriptions")
    .select("endpoint,p256dh,auth").eq("endpoint", b.endpoint).maybeSingle();
  if (!sub) return { ok: false, error: "not-subscribed" };
  const hour = [5, 6, 7, 8].includes(Number(b.hour)) ? Number(b.hour) : 7;
  // preview=true → 실제 매일 발송되는 문구(오늘의 묵상+말씀)를 이 기기에만 보내 확인
  let payloadObj: Record<string, string> = {
    title: "성경암송 — 알림 설정 완료 ✅",
    body: `알림이 정상 작동해요! 매일 오전 ${hour}시에 그 주 말씀을 보내드릴게요. 🙌`,
    url: "https://gocheok.onlybible.kr/",
  };
  if (b.preview) {
    const c = await dailyPushContent();
    if (c) payloadObj = { title: c.title, body: c.body, url: "https://gocheok.onlybible.kr/" };
  }
  const payload = JSON.stringify(payloadObj);
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
    return { ok: true, sent: 1 };
  } catch (e: any) {
    const code = e && (e.statusCode || e.status);
    if (code === 404 || code === 410) await db.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
    return { ok: false, error: "send-failed:" + code };
  }
}

// ---------- sendPush: 구독자 전체에 알림 발송 (ADMIN_SECRET / cron) ----------
// ---------- pushHistory: 발송 이력(최근 N건) — 관리자 ----------
async function pushHistory(b: any) {
  const err = adminError(b); if (err) return { ok: false, error: err };
  const lim = Math.min(200, Math.max(1, Number(b.limit) || 60));
  // body 컬럼이 있으면 함께, 없으면(구 스키마) 제목·수량만
  let { data, error } = await db.from("push_log")
    .select("sent_at,mode,title,body,sent,failed,total")
    .order("sent_at", { ascending: false }).limit(lim);
  if (error) {
    ({ data } = await db.from("push_log")
      .select("sent_at,mode,title,sent,failed,total")
      .order("sent_at", { ascending: false }).limit(lim));
  }
  return { ok: true, rows: data ?? [] };
}

// ---------- pushSubscribers: 구독자 명단(이름·소속·시간) — 관리자 ----------
async function pushSubscribers(b: any) {
  const err = adminError(b); if (err) return { ok: false, error: err };
  const { data: subs } = await db.from("push_subscriptions").select("hour,user_id,created_at");
  const rows = (subs ?? []) as any[];
  const ids = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
  const umap = new Map<string, any>();
  if (ids.length) {
    const { data: us } = await db.from("users").select("id,type,gu,mok,bu,grade,name").in("id", ids);
    for (const u of (us ?? []) as any[]) umap.set(u.id, u);
  }
  const list = rows.map((r) => {
    const u = umap.get(r.user_id) || {};
    const mokLabel = u.mok ? (/목장/.test(String(u.mok)) ? String(u.mok) : u.mok + "목장") : "";
    const sosok = u.type === "교구"
      ? [u.gu, mokLabel].filter(Boolean).join(" ")
      : [u.bu, u.grade].filter(Boolean).join(" ");
    return { name: u.name || "(미상)", type: u.type || "", sosok, hour: r.hour ?? null };
  }).sort((a, b) => (Number(a.hour) || 0) - (Number(b.hour) || 0));
  return { ok: true, total: list.length, list };
}

// ---------- pushStats: 발송 없이 구독자 수만(시간대별) — 관리자 ----------
async function pushStats(b: any) {
  const err = adminError(b); if (err) return { ok: false, error: err };
  const { data } = await db.from("push_subscriptions").select("hour");
  const rows = (data ?? []) as any[];
  const byHour: Record<string, number> = {};
  for (const r of rows) {
    const h = (r.hour === null || r.hour === undefined) ? "미지정" : String(r.hour);
    byHour[h] = (byHour[h] || 0) + 1;
  }
  return { ok: true, total: rows.length, byHour };
}

// ── 저녁 알림 옵션 — 순수 함수 (여기부터) ──
// ⚠️ 이 구간은 **타입 표기 없이** 쓴다. tests/send-push-opts.test.cjs 가 두 표식 사이만 잘라
//    node:vm 으로 돌린다(꾸러미 없이 — tools/preflight.py 가 배포 앞 그물에 건다).
//    타입 표기를 하나라도 더하면 그 검사가 깨지고, 검사가 먼저 알려 준다.
//    (그래서 이 주석에도 표기를 예로 적지 않는다 — 가드 정규식이 주석까지 본다.)
function buildOnlySet(only) {
  // ⚠️ **빈 배열은 「아무에게도」다.** `only && only.length` 로 쓰면 모두가 오늘 참여한 날
  //    전 구독자에게 저녁 알림이 나간다. 안 넘겼을 때(null)와 반드시 갈라야 한다.
  if (!Array.isArray(only)) return null;
  return new Set(only.map(function (u) { return String(u); }));
}
function keepUser(onlySet, uid) {
  return !onlySet || onlySet.has(String(uid));
}
function pickMessage(userBodies, uid, title, body) {
  // ⚠️ userBodies 에 없는 사람이 대부분이다 — 옵셔널로 읽어 TypeError 를 막는다.
  //    여기서 터지면 sendPush 가 통째로 빠져나가 아침 알림이 일부만 나가고 로그도 안 남는다.
  var m = (userBodies && typeof userBodies === "object") ? userBodies[String(uid)] : null;
  return {
    title: (m && m.title) || title || "성경말씀 암송",
    body: (m && m.body) || body || "오늘의 말씀을 암송해요! 🙌",
  };
}
// ── 저녁 알림 옵션 — 순수 함수 (여기까지) ──

// ── 저녁 알림 문구 — 순수 함수 (여기부터) ──
// ⚠️ 이 구간도 **타입 표기 없이** 쓴다. tests/evening-push.test.cjs 가 두 표식 사이만 잘라
//    돌린다(꾸러미 없이 — tools/preflight.py 가 배포 앞 그물에 건다).
//    주석에도 표기를 예로 적지 않는다 — 가드 정규식이 주석까지 본다.
//
// ⚠️ 문구 규칙 둘. 둘 다 이유가 있다.
//   ① **「만」을 쓰지 않는다.** 첫 화면이 일부러 피한 표현이다 — 3구절은 상한이 아니라 묶음이고,
//      다 하면 앱이 곧장 「3구절 더 하기」를 내민다. 「3구절만」은 그 결정을 되돌린다.
//   ② **부정 전제를 쓰지 않는다**(「오늘 아직 못 하셨죠」 따위). 저녁 8시에 보내는데
//      22시에 늘 하시는 분이 적지 않다 — 그분들께는 사실이 아닌 말이 된다.
function eveningMessage(dueCount, verseLine) {
  var n = Number(dueCount);
  if (!(n >= 1)) {
    // 밀린 복습이 없는 분 — 이번 주 말씀을 한 줄 드린다.
    return {
      title: "📖 오늘의 말씀",
      body: verseLine || "오늘도 말씀 한 구절 마음에 새겨 보세요 🙌",
    };
  }
  // 한 번에 하는 묶음이 3구절이라, 그보다 많이 밀렸어도 3으로 말한다 —
  // 적체 숫자(평균 13.7)를 보이면 벽처럼 느껴진다.
  var k = n < 3 ? n : 3;
  return {
    title: "🔁 복습이 기다려요",
    body: "외운 말씀 " + k + "구절 다시 만나 보실래요?",
  };
}
// ── 저녁 알림 문구 — 순수 함수 (여기까지) ──

async function sendPush(b: any) {
  const err = adminError(b); if (err) return { ok: false, error: err };
  let title = b.title, body = b.body;
  if (b.latest) {
    // 오늘의 묵상(요일별) + 이번주 말씀. 묵상이 없으면 말씀만.
    // 크론이 기본 제목(표어)을 함께 보내므로, latest일 땐 묵상 제목(🌿…)이 그것을 대체한다.
    const c = await dailyPushContent();
    if (c) { title = c.title; body = c.body; }
  }
  // 저녁 알림용 — only(이 사람들에게만) · userBodies(사람마다 다른 문구).
  // ⚠️ 기존 호출자(아침 크론 넷·주일 발송·관리자 수동·monitor diag)는 둘 다 안 넘긴다.
  //    그때는 onlySet 이 null 이라 아무도 안 걸러지고, 문구도 지금과 똑같다.
  const onlySet = buildOnlySet(b.only);
  const pushUrl = b.url || "https://gocheok.onlybible.kr/";

  // hour 지정 시 그 시간을 고른 구독자에게만(시간대별 cron), user_id 지정 시 그 성도 기기에만(개별 테스트 발송), 둘 다 없으면 전체(관리자 수동 발송)
  let subQ = db.from("push_subscriptions").select("id,endpoint,p256dh,auth,user_id");
  if (b.hour) subQ = subQ.eq("hour", Number(b.hour));
  if (b.user_id) subQ = subQ.eq("user_id", b.user_id);
  const { data: subsRaw } = await subQ;
  // ⚠️ 거르기는 JS 로 한다 — .in() 에 uuid 수백 개를 실으면 쿼리스트링 길이에 걸린다.
  //    구독자는 34명뿐이라 전부 읽어도 싸다.
  const subs = ((subsRaw ?? []) as any[]).filter((s) => keepUser(onlySet, s.user_id));
  let sent = 0, failed = 0;
  const errs: string[] = [];
  const vapidReady = !!(VAPID_PUBLIC && VAPID_PRIVATE);
  for (const s of (subs ?? []) as any[]) {
    let ok = false, lastCode: any = null, lastMsg = "";
    for (let attempt = 1; attempt <= 2; attempt++) {   // 일시적 오류 대비 1회 재시도
      try {
        // ⚠️ 함수 스코프 title/body 를 **덮지 않는다** — 덮으면 루프 뒤의 iOS 발송과
        //    push_log 가 마지막 구독자의 개인 문구로 오염된다.
        const m = pickMessage(b.userBodies, s.user_id, title, body);
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ title: m.title, body: m.body, url: pushUrl }),
        );
        ok = true; break;
      } catch (e: any) {
        lastCode = e && (e.statusCode || e.status);
        lastMsg = (e?.body || e?.message || String(e)).toString().slice(0, 200);
        if (lastCode === 404 || lastCode === 410) {      // 만료/삭제된 구독 → 정리 후 중단
          await db.from("push_subscriptions").delete().eq("id", s.id); break;
        }
        // 그 외(일시적 오류)는 재시도
      }
    }
    if (ok) sent++;
    else { failed++; if (errs.length < 3) errs.push(`[${lastCode || "ERR"}] ${lastMsg}`); }
  }
  // ---- iOS 네이티브 푸시(APNs) — 같은 hour/user_id 필터로 함께 보낸다 ----
  // ⚠️ **발송 루프는 둘이다.** 웹만 고치면 아이폰 쓰시는 분은 오늘 다 하셨어도 저녁 알림을
  //    받고, 그것도 남의 복습 개수로 받는다. 2026-09-23 리뷰가 잡은 자리다.
  const iosWhy: Record<string, number> = {};   // 거절 이유별 건수 — push_log.note 로 나간다
  let iosQ = db.from("ios_push_tokens").select("id,device_token,user_id");
  if (b.hour) iosQ = iosQ.eq("hour", Number(b.hour));
  if (b.user_id) iosQ = iosQ.eq("user_id", b.user_id);
  const { data: iosRaw } = await iosQ;
  const iosTokens = ((iosRaw ?? []) as any[]).filter((t) => keepUser(onlySet, t.user_id));
  for (const t of (iosTokens ?? []) as any[]) {
    const m = pickMessage(b.userBodies, t.user_id, title, body);
    const o: { reason?: string } = {};
    const r = await sendApns(t.device_token, m.title, m.body, o);
    if (r === "ok") sent++;
    else {
      failed++;
      if (r === "gone") await db.from("ios_push_tokens").delete().eq("id", t.id);
      // ⚠️ 이유를 세어 둔다(토큰은 담지 않는다). 아래 push_log.note 로 나간다 —
      //    이것이 없어서 아이폰 13분이 8일 동안 못 받는 걸 아무도 몰랐다.
      const why = o.reason || r;
      iosWhy[why] = (iosWhy[why] || 0) + 1;
      if (errs.length < 3) errs.push(`[ios:${r}] ${o.reason || ""}`.trim());
    }
  }
  // ⚠️ 거른 **뒤** 수다 — 안 그러면 「보내지도 않은 사람」이 total 에 들어가
  //    monitor 의 `total>0 && sent===0` 판정이 어긋난다.
  const total = subs.length + iosTokens.length;
  // 진단 모드: 실제 에러/설정 상태를 반환(관리자 호출 시에만 노출)
  if (b.diag) return { ok: true, sent, failed, total, vapidReady, vapidSubject: VAPID_SUBJECT, errors: errs };
  // 장애 모니터링용 발송 로그 기록(실패해도 발송 결과에는 영향 없음)
  try {
    const logBase: Record<string, unknown> = {
      mode: b.mode || (b.latest ? "daily" : "manual"),
      title: title || "성경말씀 암송",
      sent, failed, total, ok: sent > 0,
    };
    // 왜 실패했는지 — 이유별 건수를 한 줄로. ⚠️ 기기 토큰·user_id 는 안 넣는다.
    const whyList = Object.keys(iosWhy).map((k) => `ios ${iosWhy[k]}건: ${k}`);
    const note = whyList.length ? whyList.join(" · ").slice(0, 300) : null;
    // body·note 컬럼이 있으면 함께 기록. 없으면(구 스키마) 빼고 재시도 — 로그 때문에
    // 발송이 실패하면 본말이 뒤집힌다.
    let { error } = await db.from("push_log").insert({ ...logBase, body: body || null, note });
    if (error) ({ error } = await db.from("push_log").insert({ ...logBase, body: body || null }));
    if (error) await db.from("push_log").insert(logBase);
  } catch (_) { /* 로그 실패 무시 */ }
  return { ok: true, sent, failed, total };
}

// ---------- weeklyVersePush: 매주 주일 오전, 이번주 암송 말씀 안내를 전체 구독자에게 ----------
// (매일 묵상 알림과는 별개 — 개인이 고른 알림 시간과 무관하게 주일 아침에만, 모두에게 1회)
// 이번주 말씀이 아직 등록 전이면(암송말씀은 보통 토요일 오후 등록) 아무것도 보내지 않고 skip.
async function weeklyVersePush(b: any) {
  const err = adminError(b); if (err) return { ok: false, error: err };
  const v = await latestVerse();
  if (!v || v.no == null) return { ok: true, skipped: true, reason: "no-verse" };
  const verseLine = v.ref ? `${v.text} (${v.ref})` : v.text;
  const title = "📖 이번주 암송 말씀이 도착했어요!";
  const body = `${verseLine}\n\n오늘부터 한 주간 이 말씀을 암송해요 🙌`;
  return await sendPush({ ...b, title, body, mode: "weekly-verse", url: b.url || "https://gocheok.onlybible.kr/" });
}

// ---------- eveningPush: 저녁 20시 — 오늘 아직 안 하신 분께만 (2026-09-24, 2판) ----------
// 근거 — 구독자는 활동일 2.1배·최근 활동률 1.6배인데 활동자의 12%만 구독했고,
//        알림은 아침 한 번뿐인데 반복 정점은 저녁이다(docs/analysis/2026-09-23-usage-analysis.md).
//
// ⚠️ **latest 를 절대 안 넘긴다.** sendPush 의 if (b.latest) 가 dailyPushContent() 로 제목·본문을
//    덮어써, 저녁에 아침과 똑같은 묵상 알림이 한 번 더 나간다. 말씀 한 줄은 여기서 직접 만든다.
// ⚠️ **사람 단위로 먼저 정한다.** 구독 행(47) ≠ 사람(35) — 웹과 아이폰을 둘 다 켜신 분이
//    기기 단위로는 개인 문구를 두 번 받는다.
// ⚠️ **대상이 0명이어도 push_log 에 한 줄 남긴다**(sendPush 가 남긴다) — 「조용히 안 나간 것」과
//    「모두가 참여한 좋은 날」을 나중에 가를 수 있어야 한다.
async function eveningPush(b: any) {
  const err = adminError(b); if (err) return { ok: false, error: err };
  const today = kstDay(new Date().toISOString());   // ⚠️ ymd() 는 UTC 다. 반드시 kstDay.

  // 1) 저녁을 켠 구독자를 **사람 단위**로 모은다
  const [webRes, iosRes] = await Promise.all([
    db.from("push_subscriptions").select("user_id").eq("evening", true),
    db.from("ios_push_tokens").select("user_id").eq("evening", true),
  ]);
  const people = new Set<string>();
  for (const r of ((webRes.data ?? []) as any[])) if (r.user_id) people.add(String(r.user_id));
  for (const r of ((iosRes.data ?? []) as any[])) if (r.user_id) people.add(String(r.user_id));

  // 2) 오늘(KST) 활동한 사람을 뺀다 — 집계표 daily_activity 를 읽는다(순위·mydays 와 같은 원천).
  const { data: acted } = await db.from("daily_activity").select("user_id").eq("day", today);
  for (const r of ((acted ?? []) as any[])) people.delete(String(r.user_id));
  const only = Array.from(people);

  // 3) 밀린 복습 — **대상만**, **주간 구절만**.
  //    ⚠️ verses 조인을 PostgREST 로 못 하므로, 살아 있는 주간 구절 번호를 먼저 읽어 JS 로 거른다.
  //    ⚠️ 1000행 벽 — 주간 35구절 × 구독자 35명 = 최대 1,225행이라 이론상 넘는다.
  //       넘으면 뒤쪽 성도님이 조용히 「복습 0」 갈래로 떨어져 틀린 문구를 받는다. fetchAllRows 를 쓴다.
  const dueBy: Record<string, number> = {};
  if (only.length) {
    const { data: vs } = await db.from("verses").select("no")
      .eq("is_active", true).eq("track", "weekly");
    const weekly = new Set(((vs ?? []) as any[]).map((v) => Number(v.no)));
    const rows = await fetchAllRows(() => db.from("reviews")
      .select("user_id,verse_no").in("user_id", only).lte("due_at", today));
    for (const r of rows) {
      if (!weekly.has(Number(r.verse_no))) continue;
      const u = String(r.user_id);
      dueBy[u] = (dueBy[u] || 0) + 1;
    }
  }

  // 4) 사람마다 문구
  const v = await latestVerse();
  const verseLine = v ? (v.ref ? `${v.text} (${v.ref})` : v.text) : "";
  const userBodies: Record<string, { title: string; body: string }> = {};
  let review = 0, verse = 0;
  for (const u of only) {
    const n = dueBy[u] || 0;
    userBodies[u] = eveningMessage(n, verseLine);
    if (n >= 1) review++; else verse++;
  }

  // 4-b) dryRun — **아무에게도 안 보내고** 누구에게 무슨 갈래가 갈지만 돌려준다.
  //   ⚠️ 이것이 없으면 이 액션의 **첫 실행이 곧 성도님 수십 분께 실제 발송**이다.
  //      한 번도 안 돌려 본 코드로 그러면 안 된다. 크론을 걸기 전에(3판) 반드시 한 번
  //      dryRun 으로 대상 수와 갈래를 눈으로 보고, 그 숫자가 SQL 로 센 것과 맞는지 견준다.
  //   ⚠️ 그래도 user_id 는 안 돌려준다 — 수와 본보기 문구만. 발송도 로그도 남기지 않는다.
  if (b.dryRun) {
    return { ok: true, dryRun: true, targets: only.length, review, verse,
             sampleReview: eveningMessage(1, verseLine), sampleVerse: eveningMessage(0, verseLine) };
  }

  // 5) 보낸다 — 발송은 sendPush 가 한다(웹푸시·APNs 두 루프).
  //    ⚠️ latest 를 안 넘긴다. mode 로 push_log 에서 아침 행과 갈라진다.
  //    url 의 pe=1 은 저녁 클릭을 아침과 가르는 표식이다(app.js readPushMark).
  const r = await sendPush({
    pw: b.pw, only, userBodies,
    title: "📖 오늘의 말씀", body: verseLine || "오늘도 말씀 한 구절 마음에 새겨 보세요 🙌",
    mode: "evening", url: "https://gocheok.onlybible.kr/?from=push&pe=1",
  });

  // ⚠️ 응답에 user_id 를 싣지 않는다 — 수를 센 것만.
  return { ok: true, targets: only.length, review, verse,
           sent: (r as any).sent ?? 0, failed: (r as any).failed ?? 0, total: (r as any).total ?? 0 };
}

// ---------- monitor: 백엔드/발송/데이터 상태 종합 점검 (ADMIN_SECRET 보호) ----------
// GitHub Action(매일 7:05)과 관리자 대시보드가 호출. 문제 있으면 problems 배열로 반환.
async function monitor(b: any) {
  const err = adminError(b); if (err) return { ok: false, error: err };
  const problems: string[] = [];

  // KST 기준 오늘 0시(UTC 환산)
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 3600 * 1000);
  const y = kstNow.getUTCFullYear(), mo = kstNow.getUTCMonth(), d = kstNow.getUTCDate();
  const kstMidnightUtc = new Date(Date.UTC(y, mo, d) - 9 * 3600 * 1000);
  const kstHM = kstNow.getUTCHours() * 60 + kstNow.getUTCMinutes();

  // 1) 구독자 수 (DB 연결 확인 겸용)
  const { count: subCount, error: subErr } =
    await db.from("push_subscriptions").select("*", { count: "exact", head: true });
  if (subErr) throw subErr; // DB 오류 → 500 → Action이 '백엔드 이상'으로 감지
  const subscribers = subCount ?? 0;
  if (subscribers === 0) problems.push("구독자 0명 — 알림 받을 사람이 없습니다");

  // 2) 이번 주(최신, 오늘 이하) 말씀 신선도
  let latestVerseDate: string | null = null;
  let { data: vs, error: vsErr } = await db.from("verses").select("date")
    .eq("is_active", true).eq("track", "weekly");     // 시편 액자는 주차 개념이 없다
  // ⚠️ getVerses와 같은 폴백 — track 칸이 아직 없는 DB에서 이 조회가 조용히 비면
  // "표시할 이번 주 말씀이 없습니다"로 오인해 텔레그램 헛경보가 나간다.
  if (vsErr) {
    const r = await db.from("verses").select("date").eq("is_active", true);
    vs = r.data;
  }
  const ts = (vs ?? []).map((v: any) => v.date).filter(Boolean)
    .map((s: string) => Date.parse(s)).filter((t: number) => t <= now.getTime())
    .sort((a: number, b: number) => b - a);
  if (ts.length) {
    latestVerseDate = new Date(ts[0]).toISOString().slice(0, 10);
    const ageDays = Math.floor((now.getTime() - ts[0]) / 86400000);
    if (ageDays > 14) problems.push(`최신 말씀이 ${ageDays}일 지났습니다 — CMS 업데이트 필요?`);
  } else {
    problems.push("표시할 이번 주 말씀이 없습니다");
  }

  // 3) 오늘 정기 알림 발송 여부 (07:08 이후에만 미발송 판정)
  const { data: pl } = await db.from("push_log")
    .select("sent,failed,total,sent_at").eq("mode", "daily")
    .gte("sent_at", kstMidnightUtc.toISOString())
    .order("sent_at", { ascending: false }).limit(1);
  const todayPush = (pl && pl[0]) || null;
  if (kstHM >= 7 * 60 + 8) { // 오전 7시 8분 이후
    if (!todayPush) problems.push("오늘 아침 정기 알림이 발송되지 않았습니다");
    else if ((todayPush.total ?? 0) > 0 && (todayPush.sent ?? 0) === 0) problems.push(`오늘 알림 발송 0건 (실패 ${todayPush.failed ?? 0}건)`);
  }

  // 4) 주간 리포트 메일이 최근 정상 주기(8일 이내)로 실행됐는지 — pg_cron 실행 기록 직접 조회.
  //    (2026-07-31: 비번 교체 직후 재등록 첫 주기가 한 번 누락된 적 있어 추가한 체크)
  let weeklyReportLastRun: { status: string; startTime: string } | null = null;
  try {
    const { data: wr } = await db.rpc("cron_last_run", { p_jobname: "weekly-report-email" });
    const row = (wr ?? [])[0];
    if (row) {
      weeklyReportLastRun = { status: row.status, startTime: row.start_time };
      const ageDays = (now.getTime() - Date.parse(row.start_time)) / 86400000;
      if (ageDays > 8) problems.push(`주간 리포트 메일이 ${Math.floor(ageDays)}일째 실행되지 않았습니다`);
      else if (row.status !== "succeeded") problems.push(`주간 리포트 메일 최근 실행 상태: ${row.status}`);
    } else {
      problems.push("주간 리포트 메일 실행 기록을 찾을 수 없습니다");
    }
  } catch (_) { /* RPC 실패해도 나머지 점검엔 영향 없게 조용히 넘어감 */ }

  // 5) 집계표(daily_activity) 정합성 — 집계를 따로 두는 대가다.
  //    로그 행 수와 집계 합계가 어긋나면 화면이 조용히 틀린 숫자를 보여준다. 그게 제일 나쁘다.
  //    함께 로그 규모도 본다 — 집계표조차 버거워지는 지점을 미리 알기 위해서.
  let activity: any = null;
  try {
    const { data: dr, error: drErr } = await db.rpc("v2_activity_drift");
    if (drErr) throw drErr;
    const row = (dr ?? [])[0];
    if (row) {
      const logRows = Number(row.log_rows), aggSum = Number(row.agg_sum);
      activity = { logRows, aggRows: Number(row.agg_rows), aggSum };
      if (logRows !== aggSum) {
        problems.push(`집계표가 로그와 어긋났습니다 — 로그 ${logRows}행 vs 집계 합계 ${aggSum} (daily-activity.sql의 백필을 다시 실행하세요)`);
      }
      if (logRows > 500000) {
        problems.push(`challenge_log가 ${logRows}행입니다 — 집계 구조를 다시 살펴볼 때입니다`);
      }
    }
  } catch (_) { /* 집계표 미설치 → 점검 생략(순위는 폴백 경로로 돈다) */ }

  // 오늘의 찬양 — ⚠️ 「오늘 행이 없다」를 problems 에 넣지 않는다. 오늘 행은 **첫 사용자가
  //   만든다** — monitor 는 07:12 KST 에 도는데, 그때까지 아무도 앱을 안 연 날마다 헛경보가 난다.
  //   정말 조용히 틀어지는 것은 **후보 수가 급감하는 것**이다(찬양 담당자가 구분 이름을 바꾸면
  //   오류 없이 곡 수만 준다 — 2026-07 에 기타→특별찬양으로 실제로 바뀌었다).
  let songPool: number | null = null;
  let songToday = false;
  try {
    const { count, error: pErr } = await db.from("v2_song_pool").select("id", { count: "exact", head: true });
    if (!pErr) songPool = count ?? 0;
    const { data: ds } = await db.from("daily_song").select("day").eq("day", kstDay(new Date().toISOString())).maybeSingle();
    songToday = !!ds;
    if (songPool !== null && songPool < 100) {
      problems.push(`오늘의 찬양 후보가 ${songPool}곡뿐입니다 — songs 의 category 이름이 바뀌었을 수 있습니다(supabase/daily_song.sql 의 ② 질의로 확인)`);
    }
  } catch (_) { /* 표 미설치 → 점검 생략 */ }

  // 봉사 당번 알림 — ① 전날 알림(크론 duty-remind · 매일 19:00·19:20 KST): 크론은 net.http_post 를 넣기만 하면 succeeded 라, api 가 실제로 받아 돌았는지는
  //   internalDutyRemind 가 남기는 흔적(app_config dutyRemindRun)으로 본다. 키가 틀어지면(Vault 를 안 바꾼 키 교체 · 교육 크론을 걷으며 비밀을 지움)
  //   전날 알림이 며칠째 조용히 안 간다(검토 반영 2026-10-07). ⚠️ 흔적이 **한 번이라도 생긴 뒤부터만** 본다 — 크론을 안 건 곳·아직 한 번도 안 돈 곳에서는 헛경보가 없다
  //   (크론을 걷을 때는 그 흔적 줄도 지운다 — duty_remind_cron.sql 「해제」). ② 끄는 스위치(dutyNotifyOff)가 켜진 채면 아침마다 한 줄 — 꺼 둔 것을 잊으면
  //   전날 알림이 안 가는 것을 아무도 모른다(담당자 화면의 「꺼 두었어요」 창은 저장할 때만 뜬다). 판정은 순수 함수 dutyRemindProblems.
  let dutyRemind: any = null;
  try {
    const { data: dc } = await db.from("app_config").select("key,value").in("key", ["dutyRemindRun", "dutyNotifyOff"]);
    const v: any = (dc || []).find((x: any) => x.key === "dutyRemindRun")?.value;
    const off = dutyGateOf(dc).off;
    for (const p of dutyRemindProblems(v, now.getTime(), off)) problems.push(p);
    if (v && typeof v.at === "string" && !isNaN(Date.parse(v.at))) {
      dutyRemind = { at: v.at, day: String(v.day ?? ""), rows: Number(v.rows) || 0, sent: Number(v.sent) || 0, missed: Number(v.missed) || 0, runs: Number(v.runs) || 0 };
    }
    if (off) dutyRemind = { ...(dutyRemind || {}), off: true };
  } catch (_) { /* 점검 생략 */ }

  return {
    ok: problems.length === 0,
    serverTimeKST: kstNow.toISOString().replace("T", " ").slice(0, 16) + " KST",
    db: "up",
    subscribers,
    latestVerseDate,
    todayPush,
    weeklyReportLastRun,
    activity,
    songPool,
    songToday,
    dutyRemind,
    problems,
  };
}

// ---------- 시편 말씀 액자: 열린 편수 ----------
// 하루에 한 편씩 열린다. 「안 열린 구절은 응답에 싣지 않는다」가 잠금의 전부다 —
// 화면에서 가리는 것이 아니라 폰에 아예 없게 한다. 시계를 바꿔도 못 연다.
const PSALM_DEFAULT = { start: "2026-09-21", totalDays: 180 };

async function psalmConfig(): Promise<{ start: string; totalDays: number }> {
  try {
    const { data } = await db.from("app_config").select("value").eq("key", "psalm").maybeSingle();
    const v = (data && data.value) || {};
    return {
      start: typeof v.start === "string" ? v.start : PSALM_DEFAULT.start,
      totalDays: Number.isFinite(Number(v.totalDays)) ? Number(v.totalDays) : PSALM_DEFAULT.totalDays,
    };
  } catch { return PSALM_DEFAULT; }
}

function psalmOpenCount(cfg: { start: string; totalDays: number }): number {
  // KST 오늘(YYYY-MM-DD) — 기존 kstDay(iso) 와 계산이 같다(둘 다 +9시간 뒤 날짜만 자른다).
  const t = Date.parse(kstDay(new Date().toISOString()) + "T00:00:00Z");
  const s = Date.parse(cfg.start + "T00:00:00Z");
  if (!Number.isFinite(t) || !Number.isFinite(s)) return 0;
  const days = Math.floor((t - s) / 86400000) + 1;
  return Math.max(0, Math.min(cfg.totalDays, days));
}

// ---------- getVerses: 앱 표시용 말씀 목록 ----------
//   인자 없음 / track:"weekly"  → 주간 암송 35구절 (지금까지와 똑같다)
//   track:"psalm"               → 시편 말씀 액자 · 「오늘까지 열린 것만」
// ⚠️ 기본을 weekly 로 두는 것이 중요하다 — 폰에 남아 있는 옛 앱은 track 을 안 보내는데,
//    그때 180편이 딸려 가면 첫 화면 진행 막대가 「전체 215」로 깨진다.
async function getVerses(b: any = {}) {
  if (b && b.track === "psalm") return await getPsalmVerses();
  // 말씀 연상 그림(DB · 2026-09-21) — 말씀 조회와 동시에 시작해 기다리는 시간을 줄인다.
  //   ⚠️ 표가 아직 없는 DB 에서도 살아남아야 한다(아래 track 과 같은 까닭).
  //   그림 조회가 실패하면 그림 없이 돌려준다(말씀 목록은 성도님 앱의 본진이다).
  const imgP = vimgPublicMap().catch((e) => {
    console.error("verse images:", (e as Error)?.message ?? e);
    return new Map<number, { slot: string; url: string; alt: string }[]>();
  });
  const COLS = "no,date,ref_short,ref_full,ref,text,text_en,ref_en,hint,pastor,sermon_title,sermon_url";
  let { data, error } = await db.from("verses")
    .select(COLS).eq("is_active", true).eq("track", "weekly").order("no");
  // ⚠️ **track 칸이 아직 없는 DB 에서도 살아남아야 한다.**
  //    이 저장소는 세 세션이 각자 배포한다 — 누가 먼저 함수를 올리고 SQL 이 나중에
  //    돌아가는 순간이 실제로 생긴다. 그때 이 한 줄이 없으면 「말씀 목록」이
  //    통째로 죽는다(성도님 앱의 본진이다). 칸이 생기면 저절로 원래 길로 돌아간다.
  if (error) {
    const r = await db.from("verses").select(COLS).eq("is_active", true).order("no");
    if (r.error) throw r.error;
    data = r.data;
  }
  const imgMap = await imgP;
  const verses = (data ?? []).map((v: any) => ({
    no: v.no, date: v.date,
    refShort: v.ref_short || v.ref || "",
    refFull: v.ref_full || v.ref || "",
    text: v.text || "",
    textEn: v.text_en || "",
    refEn: v.ref_en || "",
    hintText: v.hint || "",
    sermonTitle: v.sermon_title || "",
    pastor: v.pastor || "",
    url: v.sermon_url || "",
    images: imgMap.get(v.no),          // 없으면 JSON 에서 빠진다 — 옛 앱은 이 칸을 모른 채 지나간다
  }));
  return { ok: true, verses };
}

async function getPsalmVerses() {
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

// ---------- saveVerse: 말씀/설교 추가·수정 (ADMIN_SECRET) ----------
async function saveVerse(b: any) {
  const err = adminError(b); if (err) return { ok: false, error: err };
  const v = b.verse || {};
  if (v.no == null || v.no === "") return { ok: false, error: "no-required" };
  const row = {
    no: Number(v.no),
    week: v.week != null && v.week !== "" ? Number(v.week) : Number(v.no),
    date: v.date || null,
    ref_short: v.refShort || null,
    ref_full: v.refFull || null,
    ref: v.refFull || v.refShort || "",
    text: v.text || "",
    text_en: v.textEn || null,
    ref_en: v.refEn || null,
    hint: v.hintText || null,
    pastor: v.pastor || null,
    sermon_title: v.sermonTitle || null,
    sermon_url: v.url || null,
    is_active: v.is_active !== false,
  };
  const { error } = await db.from("verses").upsert(row, { onConflict: "no" });
  if (error) throw error;
  return { ok: true };
}

// ---------- seedVerses: verses.json → DB 일괄 적재(초기 1회, ADMIN_SECRET) ----------
async function seedVerses(b: any) {
  const err = adminError(b); if (err) return { ok: false, error: err };
  const res = await fetch("https://gocheok.onlybible.kr/verses.json", { cache: "no-store" });
  const d = await res.json();
  const rows = (d.verses ?? []).map((v: any) => ({
    no: v.no, week: v.no, date: v.date || null,
    ref_short: v.refShort || null, ref_full: v.refFull || null, ref: v.refFull || v.refShort || "",
    text: v.text || "", hint: v.hintText || null, pastor: v.pastor || null,
    sermon_title: v.sermonTitle || null, sermon_url: v.url || null, is_active: true,
  }));
  if (rows.length) {
    const { error } = await db.from("verses").upsert(rows, { onConflict: "no" });
    if (error) throw error;
  }
  return { ok: true, count: rows.length };
}

// ---------- 긴 본문 암송("핵심 암송") ----------
// 가정 축복 기도문을 누가 얼마나 보시는지 — 한 편을 열 때 한 번 부른다.
// ⚠️ 한 사람이 하루에 한 편을 여러 번 봐도 **한 행**이다(cnt 만 는다).
//    열 때마다 한 행씩 쌓으면 금세 커진다 — daily_activity 에서 배운 것을 처음부터 쓴다.
// ⚠️ 실패해도 조용히 넘긴다. 기록 때문에 기도문이 안 열리면 본말이 뒤집힌다.
// ⚠️ 표(blessing_log.sql)를 아직 안 만든 판에서도 앱은 그대로 돌아야 한다.
async function blessingLog(b: any) {
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

// ---------- 열람 기록(featureLog) ----------
// 못 재던 기능들이 「몇 명에게 닿는지」를 남긴다 — blessing_log 를 일반화한 것이다.
// ⚠️ 허용 목록은 **여기 한 곳뿐이다.** DB 에 CHECK 를 걸지 않았다 — 걸면 목록이 세 곳이
//    되어 새 기능을 더할 때 앱은 보내는데 저장만 조용히 막힌다(challenge_log.mode 에서 겪었다).
// ⚠️ 이 목록은 **클라이언트가 보낸 값을 거르는 관문**이다 — 표에 들어갈 수 있는 값의
//    전체 목록이 아니다. 서버가 스스로 부르는 기록(다른 기능이 db.rpc("v2_feature_log", ...)
//    를 직접 호출하는 경우, 예: "오늘의 찬양"의 feature="song")은 여기를 지나지 않는다.
// ⚠️ 실패해도 조용히 넘긴다. 기록 때문에 시편 액자가 안 열리면 본말이 뒤집힌다.
// ⚠️ 표(feature_log.sql)를 아직 안 만든 판에서도 앱은 그대로 돌아야 한다.
// ⚠️ 응답에 user_id 를 싣지 않는다 — 이 API 에는 JWT 가 없다.
const FEATURES = new Set([
  "psalm",            // 시편 액자 한 편을 펼쳐 봄 (item = 구절 번호)
  "meditation",         // 첫 화면 「오늘의 묵상」 단추로 연 묵상 (item = 그 주 구절 번호)
  "meditation-widget",  // 아이폰 위젯(잠금화면)을 눌러 연 묵상 — 이것도 능동이지만 경로가 달라 따로 센다
  "meditation-auto",    // 하루 한 번 저절로 뜬 묵상 (위 둘의 분모)
  "album",            // 앨범 화면을 엶
  "album-play",       // 듣기를 시작함 — 화면만 열고 마는 분을 가른다
  "guide",            // 사용 설명서를 엶
  "push",             // 알림을 눌러 앱이 열림
  "ranking-scope",    // 순위 범위 칩 — item: 1=우리 교구 · 0=전체
  "event",            // 이벤트 화면을 엶 — ⚠️ 개시일부터 켠다. 나중에 켜면 그 구간이 영구히 빈다
  "edu",              // 🎓 교육 화면(목록)을 엶 — item = 0 고정 (2026-10-05)
  "duty",             // 🙋 봉사 당번 화면(목록)을 엶 — item = 0 고정 (2026-10-06)
]);

async function featureLog(b: any) {
  if (!b.user_id || !FEATURES.has(String(b.feature))) return { ok: true, skipped: true };
  try {
    const { error } = await db.rpc("v2_feature_log", {
      uid: b.user_id, f: String(b.feature), n: Number(b.item) || 0,
    });
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

// 가정 축복 기도문 104편 — 읽기 전용. 누구나 같은 자료라 개인 것이 섞이지 않는다.
// ⚠️ prayer 는 이름 토큰({이름}{이}…)이 든 채로 내보낸다. 채우는 것은 앱(prayFill)이다 —
//    서버가 채우면 사람마다 응답이 달라져 캐시가 통째로 무용지물이 된다.
// ⚠️ "group" 은 예약어라 따옴표가 필요하다.
async function getBlessings() {
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

async function getPassages() {
  const { data, error } = await db.from("passages")
    .select("id,title,ref,category,lines,sort_order")
    .eq("is_active", true).order("sort_order").order("id");
  if (error) throw error;
  const passages = (data ?? []).map((p: any) => ({
    id: p.id, title: p.title || "", ref: p.ref || "",
    category: p.category || "", lines: Array.isArray(p.lines) ? p.lines : [],
    sortOrder: p.sort_order ?? 0,
  }));
  return { ok: true, passages };
}

async function savePassage(b: any) {
  const err = adminError(b); if (err) return { ok: false, error: err };
  const p = b.passage || {};
  if (!p.title) return { ok: false, error: "title-required" };
  const lines = Array.isArray(p.lines)
    ? p.lines.map((s: any) => String(s || "").trim()).filter(Boolean) : [];
  if (!lines.length) return { ok: false, error: "lines-required" };
  const row: any = {
    title: p.title, ref: p.ref || null, category: p.category || null,
    lines, sort_order: p.sortOrder != null && p.sortOrder !== "" ? Number(p.sortOrder) : 0,
    is_active: p.is_active !== false,
  };
  if (p.id != null && p.id !== "") row.id = Number(p.id);
  const { data, error } = await db.from("passages").upsert(row, { onConflict: "id" }).select("id").maybeSingle();
  if (error) throw error;
  return { ok: true, id: data?.id };
}

async function deletePassage(b: any) {
  const err = adminError(b); if (err) return { ok: false, error: err };
  if (b.id == null || b.id === "") return { ok: false, error: "id-required" };
  const { error } = await db.from("passages").delete().eq("id", Number(b.id));
  if (error) throw error;
  return { ok: true };
}

// 여러 기기에서 진도가 같아지게 — 내 진행을 서버에서 읽어온다(로그인 사용자)
async function getPassageProgress(b: any) {
  if (!b.user_id) return { ok: false, error: "no-user" };
  const { data, error } = await db.from("passage_progress")
    .select("passage_id,done_seq,completed_at,updated_at").eq("user_id", b.user_id);
  if (error) throw error;
  const progress = (data ?? []).map((r: any) => ({
    passage_id: r.passage_id,
    done: Array.isArray(r.done_seq) ? r.done_seq : [],
    completed: !!r.completed_at,
    updated_at: r.updated_at,
  }));
  return { ok: true, progress };
}

async function savePassageProgress(b: any) {
  if (!b.user_id || b.passage_id == null) return { ok: false, error: "bad-args" };
  const doneSeq = Array.isArray(b.doneSeq)
    ? b.doneSeq.map((n: any) => Number(n)).filter((n: number) => Number.isFinite(n)) : [];
  const row = {
    user_id: b.user_id, passage_id: Number(b.passage_id),
    done_seq: doneSeq, completed_at: b.completed ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await db.from("passage_progress").upsert(row, { onConflict: "user_id,passage_id" });
  if (error) throw error;
  return { ok: true };
}

// ---------- passageHelp: '내 안에 거하는 말씀' 마디별 쉬운 풀이·기억법·영어(참고) ----------
// 마디당 1회만 AI 생성하고 app_config(`passageHelp:<id>`)에 캐시 → 이후엔 즉시 반환.
// 관리자가 마디 본문을 고치면 저장된 text와 달라져 캐시가 무효화되고 다시 생성한다.
async function passageHelp(b: any) {
  const pid = Number(b.passage_id), idx = Number(b.idx);
  if (!Number.isFinite(pid) || !Number.isFinite(idx) || idx < 0) return { ok: false, error: "bad-args" };
  const { data: p, error } = await db.from("passages")
    .select("id,title,ref,lines").eq("id", pid).maybeSingle();
  if (error) throw error;
  if (!p) return { ok: false, error: "no-passage" };
  // 앱(passageChunks)과 같은 규칙으로 마디를 만든다 — 빈 줄 제외, 트림
  const chunks = (Array.isArray(p.lines) ? p.lines : [])
    .map((s: any) => String(s || "").trim()).filter(Boolean);
  const text = chunks[idx];
  if (!text) return { ok: false, error: "no-chunk" };

  const CKEY = `passageHelp:${pid}`;
  let cache: any = {};
  try {
    const { data } = await db.from("app_config").select("value").eq("key", CKEY).maybeSingle();
    if (data?.value && typeof data.value === "object") cache = data.value;
  } catch { /* 테이블 미생성 등 — 캐시 없이 진행 */ }
  const hit = cache[String(idx)];
  if (hit && hit.text === text && hit.easy && hit.tip && hit.en) {
    return { ok: true, easy: hit.easy, tip: hit.tip, en: hit.en, cached: true };
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return { ok: false, error: "ANTHROPIC_API_KEY 시크릿 미설정" };
  const out = await genChunkHelp(apiKey, p, chunks, idx);
  if (!out) return { ok: false, error: "output-too-short" };

  cache[String(idx)] = { text, ...out };
  try {
    await db.from("app_config").upsert({
      key: CKEY, value: cache, updated_at: new Date().toISOString(),
    }, { onConflict: "key" });
  } catch { /* 캐시 저장 실패해도 결과는 반환 */ }
  return { ok: true, ...out };
}

// 마디 하나의 도우미(쉬운 풀이·기억법·영어)를 AI로 생성. 부실 출력이면 null.
async function genChunkHelp(apiKey: string, p: any, chunks: string[], idx: number) {
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["easy", "tip", "en"],
    properties: {
      easy: { type: "string" },
      tip: { type: "string" },
      en: { type: "string" },
    },
  };
  const system = [
    "당신은 한국 교회 성경 암송 앱의 도우미입니다. 개역개정 성경의 긴 본문을 여러 '마디'로 나눠",
    "외우는 화면에서, 지금 외우는 한 마디에 대해 다음 3가지를 JSON으로 만듭니다.",
    "- easy(쉬운 풀이): 이 마디의 뜻을 누구나 이해할 쉬운 한국어 1~2문장으로. 본문에 없는 해석을 보태지 않기.",
    "- tip(기억법): 이 마디를 외우는 실용적인 요령 1~2문장 — 문장 구조(대구·반복), 핵심 단어의 첫 글자,",
    "  장면 연상 등. 막연한 조언(여러 번 읽으세요 등)은 금지.",
    "- en(영어): 이 마디 범위만의 자연스러운 영어 번역(성경 영어 문체). 범위를 넘는 내용 금지.",
    "쉬운 풀이·기억법은 존댓말(~해요체)로 쓰고, 이모지는 넣지 않습니다.",
  ].join("\n");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: Deno.env.get("PASSAGE_HELP_MODEL") || "claude-sonnet-5",
      max_tokens: 700,
      system,
      output_config: { format: { type: "json_schema", schema } },
      messages: [{
        role: "user",
        content: `[본문 제목] ${p.title}${p.ref ? `\n[출처] ${p.ref}` : ""}\n[전체 본문]\n${chunks.join("\n")}\n\n[이번 마디 (${idx + 1}/${chunks.length})]\n${chunks[idx]}`,
      }],
    }),
  });
  if (!res.ok) return null;
  const d = await res.json();
  let out: any = {};
  try { out = JSON.parse((d.content ?? []).find((x: any) => x.type === "text")?.text ?? "{}"); } catch (_) {}
  const easy = (out.easy || "").toString().trim();
  const tip = (out.tip || "").toString().trim();
  const en = (out.en || "").toString().trim();
  if (easy.length < 5 || tip.length < 5 || en.length < 5) return null;
  return { easy, tip, en };
}

// ---------- passageHelpAll: '전체 이어서' 화면용 — 모든 마디의 도우미를 한 번에 ----------
// 캐시에 없는 마디만 병렬 생성해 채우고, 마디 순서대로 배열(items)로 돌려준다(실패 마디는 null).
async function passageHelpAll(b: any) {
  const pid = Number(b.passage_id);
  if (!Number.isFinite(pid)) return { ok: false, error: "bad-args" };
  const { data: p, error } = await db.from("passages")
    .select("id,title,ref,lines").eq("id", pid).maybeSingle();
  if (error) throw error;
  if (!p) return { ok: false, error: "no-passage" };
  const chunks = (Array.isArray(p.lines) ? p.lines : [])
    .map((s: any) => String(s || "").trim()).filter(Boolean);
  if (!chunks.length) return { ok: false, error: "no-chunk" };

  const CKEY = `passageHelp:${pid}`;
  let cache: any = {};
  try {
    const { data } = await db.from("app_config").select("value").eq("key", CKEY).maybeSingle();
    if (data?.value && typeof data.value === "object") cache = data.value;
  } catch {}
  const fresh = (i: number) => {
    const h = cache[String(i)];
    return h && h.text === chunks[i] && h.easy && h.tip && h.en;
  };
  const missing = chunks.map((_, i) => i).filter((i) => !fresh(i));
  if (missing.length) {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return { ok: false, error: "ANTHROPIC_API_KEY 시크릿 미설정" };
    const results = await Promise.all(
      missing.map((i) => genChunkHelp(apiKey, p, chunks, i).catch(() => null)));
    results.forEach((r, k) => { if (r) cache[String(missing[k])] = { text: chunks[missing[k]], ...r }; });
    try {
      await db.from("app_config").upsert({
        key: CKEY, value: cache, updated_at: new Date().toISOString(),
      }, { onConflict: "key" });
    } catch {}
  }
  const items = chunks.map((_, i) => {
    if (!fresh(i)) return null;
    const h = cache[String(i)];
    return { easy: h.easy, tip: h.tip, en: h.en };
  });
  return { ok: true, items };
}

// ---------- generateNiv: 한국어 구절 → NIV 영어 본문 AI 생성 (ADMIN_SECRET) ----------
// DB에 저장하지 않고 반환만 한다 — 어드민이 실제 NIV 성경과 대조·검수 후 saveVerse로 저장.
async function generateNiv(b: any) {
  const err = adminError(b); if (err) return { ok: false, error: err };
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return { ok: false, error: "ANTHROPIC_API_KEY 시크릿 미설정" };
  const ref = (b.refFull || b.refShort || "").toString().trim();
  const text = (b.text || "").toString().trim();
  if (!ref && !text) return { ok: false, error: "ref-or-text-required" };

  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["textEn", "refEn"],
    properties: {
      textEn: { type: "string" },
      refEn: { type: "string" },
    },
  };
  const system = [
    "You are a Bible reference assistant for a Korean church scripture-memorization app.",
    "You are given a Korean Bible quotation (개역개정) with its reference. IMPORTANT: this Korean",
    "text is often NOT the complete verse — it is a shortened phrase the pastor emphasized that week,",
    "with narrative attribution (이르되/가라사대/하시니라 = 'he said'/'they replied'/narrative framing)",
    "and surrounding clauses already trimmed out. Your job is to return the NIV (2011) wording for",
    "EXACTLY that same scope — not the full verse, not with narrative attribution added back in —",
    "unless the given Korean text already IS the complete verse (in which case return the complete verse).",
    "- textEn: the verbatim NIV wording matching the Korean text's scope, word for word from the real NIV",
    "  translation (never paraphrase or invent wording). No verse numbers inside the text.",
    "  Do NOT prepend narrative framing like \"Jesus said,\" \"They replied,\" \"he said,\" etc. unless the",
    "  Korean text itself contains the equivalent Korean framing.",
    "  Do NOT append trailing clauses/sentences that exist in the full verse but are absent from the",
    "  given Korean text.",
    "  If the reference is a range (e.g. spans verses 16-18) and the Korean text quotes all of that",
    "  range, include all of it.",
    "- refEn: use the standard ABBREVIATED English book name (matching how the Korean refShort is also",
    "  abbreviated, e.g. 골 3:23 not 골로새서 3장), like \"Gen 12:2\", \"Ps 119:105\", \"Josh 1:8\",",
    "  \"1 Pet 4:16\", \"1 Thess 5:16-18\", \"Col 3:23\", \"Matt 28:19\", \"Rev 2:7\". Do not spell out the",
    "  full book name (no \"Genesis\", \"Psalm\", \"Colossians\", etc.).",
  ].join("\n");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: Deno.env.get("NIV_MODEL") || "claude-opus-4-8",
      max_tokens: 1000,
      system,
      output_config: { format: { type: "json_schema", schema } },
      messages: [{ role: "user", content: `[출처] ${ref}\n[개역개정 본문] ${text}` }],
    }),
  });
  if (!res.ok) return { ok: false, error: `anthropic-${res.status}: ${(await res.text()).slice(0, 300)}` };
  const d = await res.json();
  let out: any = {};
  try { out = JSON.parse((d.content ?? []).find((x: any) => x.type === "text")?.text ?? "{}"); } catch (_) {}
  const textEn = (out.textEn || "").toString().trim();
  const refEn = (out.refEn || "").toString().trim();
  // 불량 출력 가드 — 스키마는 통과해도 내용이 부실하면 거른다 (4b-versehelp.mjs 패턴)
  if (textEn.length < 10 || !/^[1-3]?\s?[A-Za-z ]+\d+:\d+/.test(refEn)) {
    return { ok: false, error: "output-too-short" };
  }
  return { ok: true, textEn, refEn };
}

// ---------- embedSermons: 설교를 청킹·임베딩해 sermon_chunks에 적재 (관리자) ----------
// body: { pw, sermonId? }  — sermonId 있으면 단건, 없으면 hidden=false 전체 재색인.
async function embedSermons(b: any) {
  const err = adminError(b); if (err) return { ok: false, error: err };

  const cols = "id, title, svc_date, scripture, summary, points, daily_meditations";
  let q = db.from("sermons").select(cols).eq("hidden", false);
  if (b.sermonId) q = db.from("sermons").select(cols).eq("id", b.sermonId);
  const { data: sermons, error } = await q;
  if (error) throw error;
  if (!sermons?.length) return { ok: false, error: "no-sermons" };

  // 전체 재색인(sermonId 없음)이면, 숨겨지거나 삭제된 설교의 청크가 남아
  // 검색·인용되지 않도록 먼저 전체를 비운다(chunk_index>=0으로 모든 행 매칭).
  // 이후 현재 노출 설교로만 다시 채워 색인이 노출 아카이브를 정확히 반영한다.
  if (!b.sermonId) {
    const { error: purgeErr } = await db.from("sermon_chunks").delete().gte("chunk_index", 0);
    if (purgeErr) throw purgeErr;
  }

  // 재색인은 색인만 다시 만든다. 캐시(요약·답변)는 건드리지 않는다 —
  // 관리자가 clearChatCache / clearSummaryCache 버튼으로 각각 명시 요청할 때만 비운다.

  let totalChunks = 0;
  for (const s of sermons) {
    const chunks = chunkSermon(s);
    if (!chunks.length) continue;
    const vectors = await embedVoyage(chunks.map((c) => c.content), "document");
    const rows = chunks.map((c, i) => ({
      sermon_id: s.id,
      chunk_index: c.chunk_index,
      content: c.content,
      embedding: vectors[i],
      title: s.title,
      svc_date: s.svc_date,
      scripture: s.scripture,
      youtube_id: s.id, // sermons.id가 유튜브 영상 ID
    }));
    // 단건 재색인은 해당 설교의 기존 청크만 지운다(전체 재색인은 위에서 이미 비움).
    if (b.sermonId) {
      const { error: delErr } = await db.from("sermon_chunks").delete().eq("sermon_id", s.id);
      if (delErr) throw delErr;
    }
    const { error: insErr } = await db.from("sermon_chunks").insert(rows);
    if (insErr) throw insErr;
    totalChunks += rows.length;
  }
  return { ok: true, sermons: sermons.length, chunks: totalChunks };
}

// ---------- debugSermonSearch: 벡터 검색 원시 결과 점검용(임계값 필터 없이, 관리자) ----------
async function debugSermonSearch(b: any) {
  const err = adminError(b); if (err) return { ok: false, error: err };
  const message = (b.message ?? "").toString().trim();
  if (!message) return { ok: false, error: "message-required" };
  const [qvec] = await embedVoyage([message], "query");
  const { data: matches, error } = await db.rpc("match_sermon_chunks", {
    query_embedding: qvec, match_count: 8,
  });
  if (error) throw error;
  return {
    ok: true,
    qvecLen: qvec.length,
    matches: (matches ?? []).map((m: any) => ({
      similarity: m.similarity, title: m.title, sermon_id: m.sermon_id,
      content: (m.content || "").slice(0, 80),
    })),
  };
}

// ---------- sermonChat: 설교 아카이브 검색 + 근거 기반 답변 (관리자) ----------
// body: { pw, message }
// ⚠️ 하루 횟수(2026-10-08 보안 점검) — 문은 「users 에 있는 user_id」 하나인데 계정은 login 이 누구에게나 만들어 준다.
//    제한이 없으면 글자만 바꿔 가며 AI 를 끝없이 부를 수 있다(호출마다 임베딩 + 모델). 같은 질문은 캐시가 받아 수에 안 든다.
//    넘으면 오류가 아니라 **답으로** 말한다 — 앱은 오류를 모두 「잠시 후 다시 시도해 주세요」로 보여 까닭을 못 전한다.
const SERMON_CHAT_MAX_CHARS = 500;      // sermonQuestionKey 가 자르는 길이와 같다
const SERMON_CHAT_PER_DAY = 20;         // 한 분이 하루에(한국 날짜)
const SERMON_CHAT_ALL_PER_DAY = 300;    // 모두 합쳐 하루에 — 계정을 여럿 만들어 돌려도 여기서 멈춘다
async function sermonChat(b: any) {
  const message = (b.message ?? "").toString().trim().slice(0, SERMON_CHAT_MAX_CHARS);
  if (!message) return { ok: false, error: "message-required" };
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return { ok: false, error: "ANTHROPIC_API_KEY 시크릿 미설정" };

  // 접근 허용: 관리자이거나, 앱에 로그인한 실제 성도(user_id가 users에 존재)만.
  // 로그에 남길 이름·교구·목장은 클라이언트를 믿지 않고 users에서 직접 읽는다.
  const isAdmin = adminError(b) === null;
  let logName: string | null = null, logGu: string | null = null, logMok: string | null = null;
  if (isAdmin) {
    logName = "관리자";
  } else {
    const uid = (b.user_id ?? "").toString();
    if (!uid) return { ok: false, error: "unauthorized" };
    const { data: u } = await db.from("users").select("name, gu, mok").eq("id", uid).maybeSingle();
    if (!u) return { ok: false, error: "unauthorized" };
    logName = u.name ?? null; logGu = u.gu ?? null; logMok = u.mok ?? null;
  }

  // 사용 로그(누가·질문·시각). 실패해도 답변에는 영향 없게 조용히 넘어간다.
  try {
    await db.from("sermon_chat_log").insert({ name: logName, gu: logGu, mok: logMok, question: message.slice(0, 500) });
  } catch (_) { /* 로그 실패 무시 */ }

  // 캐시: 같은 질문(공백 정규화 후 동일)이면 저장된 답변을 그대로 반환(AI 재호출 없음).
  // ⚠️ 열쇠는 sermonQuestionKey 하나로 만든다 — AI 답 알리기(sermonAnswerReport)가 같은 열쇠로 캐시를 찾고,
  //    관리자 「답 지우기」가 같은 열쇠로 지운다(2026-10-01). 예전 식(message.replace(/\s+/g," ").slice(0,500))과 같은 값이다.
  const qkey = sermonQuestionKey(message);
  const { data: chatCached } = await db.from("sermon_ai_cache")
    .select("answer, sources").eq("kind", "chat").eq("cache_key", qkey).maybeSingle();
  if (chatCached) return { ok: true, answer: chatCached.answer, sources: chatCached.sources ?? [] };

  // 새 답을 만들기 전에 오늘 몇 번째인지 본다(위에서 남긴 이번 줄도 들어 있다). 세지 못하면 막지 않는다.
  if (!isAdmin) {
    try {
      const since = kstDayStartIso();
      let mine = db.from("sermon_chat_log").select("id", { count: "exact", head: true }).gte("created_at", since);
      mine = logName == null ? mine.is("name", null) : mine.eq("name", logName);
      mine = logGu == null ? mine.is("gu", null) : mine.eq("gu", logGu);
      mine = logMok == null ? mine.is("mok", null) : mine.eq("mok", logMok);
      const [m, all] = await Promise.all([mine,
        db.from("sermon_chat_log").select("id", { count: "exact", head: true }).gte("created_at", since)]);
      if (!m.error && (m.count ?? 0) > SERMON_CHAT_PER_DAY) {
        return { ok: true, limited: true, sources: [],
          answer: "오늘은 질문을 많이 하셨어요. 내일 다시 물어봐 주세요. (전에 하신 질문은 그대로 다시 보실 수 있어요)" };
      }
      if (!all.error && (all.count ?? 0) > SERMON_CHAT_ALL_PER_DAY) {
        return { ok: true, limited: true, sources: [],
          answer: "오늘은 질문이 많아 잠시 쉬어 가요. 내일 다시 물어봐 주세요." };
      }
    } catch (_) { /* 세기 실패가 질문을 막지 않는다 */ }
  }

  // 1) 질문 임베딩 → 벡터 검색
  const [qvec] = await embedVoyage([message], "query");
  const { data: matches, error } = await db.rpc("match_sermon_chunks", {
    query_embedding: qvec,
    match_count: 5,
  });
  if (error) throw error;

  // 2) 유사도 임계값 미만이면 창작 대신 솔직히 없다고 답한다.
  const hits = (matches ?? []).filter((m: any) => m.similarity >= 0.4);
  if (!hits.length) {
    return { ok: true, answer: "그 주제로 하신 설교를 찾지 못했습니다.", sources: [] };
  }

  // 3) 검색된 발췌를 컨텍스트로 Claude 호출(근거 기반, 창작 금지).
  const context = hits.map((m: any, i: number) =>
    `[발췌 ${i + 1}] ${m.title} (${m.svc_date ?? "날짜미상"} · ${m.scripture ?? ""})\n${m.content}`
  ).join("\n\n");
  const system = [
    "너는 고척교회 설교 아카이브 검색 도우미다. 차동혁 목사님의 설교를 교인이 찾을 수 있게 돕는다.",
    "아래 '설교 발췌'에 담긴 내용만 근거로 답하라. 발췌에 없는 내용을 지어내지 말고, 목사님이 하지 않은 새로운 주장을 창작하지 말라.",
    "너 자신이 목사인 것처럼 설교하지 말라 — 어디까지나 '목사님이 이렇게 말씀하셨습니다'라고 안내하는 도우미다.",
    "출처를 반드시 밝혀라: \"차동혁 목사님은 [날짜] '[제목]' 설교에서 이렇게 말씀하셨습니다\" 형태.",
    "발췌만으로 답하기 어려우면 솔직히 '해당 내용을 설교에서 충분히 찾지 못했습니다'라고 말하라.",
    "한국어로, 2~4문단 이내로 따뜻하고 담백하게 답하라.",
    "답변에서 핵심이 되는 중요한 문구는 **굵게**(양쪽에 별표 두 개, 예: **핵심 문구**) 표시하라. 남용하지 말고 문단마다 한두 군데만 강조하라.",
  ].join("\n");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: Deno.env.get("SERMON_CHAT_MODEL") || "claude-opus-4-8",
      max_tokens: 1200,
      system,
      messages: [{ role: "user", content: `질문: ${message}\n\n[설교 발췌]\n${context}` }],
    }),
  });
  if (!res.ok) return { ok: false, error: `anthropic-${res.status}: ${(await res.text()).slice(0, 300)}` };
  const d = await res.json();
  const answer = ((d.content ?? []).find((x: any) => x.type === "text")?.text ?? "").trim();

  // 4) 출처는 중복 설교를 합쳐 반환(같은 설교의 여러 청크가 잡힐 수 있음).
  const seen = new Set<string>();
  const uniq = hits.filter((m: any) => {
    if (seen.has(m.sermon_id)) return false;
    seen.add(m.sermon_id); return true;
  });
  // 출처 팝업에서 설교자·요약을 보여주기 위해 sermons에서 함께 가져온다.
  const ids = uniq.map((m: any) => m.sermon_id);
  const { data: meta } = await db.from("sermons").select("id, preacher, summary").in("id", ids);
  const metaOf = new Map((meta ?? []).map((s: any) => [s.id, s]));
  const sources = uniq.map((m: any) => ({
    title: m.title,
    svc_date: m.svc_date,
    scripture: m.scripture,
    youtube_id: m.youtube_id,
    preacher: metaOf.get(m.sermon_id)?.preacher ?? "",
    summary: metaOf.get(m.sermon_id)?.summary ?? "",
  }));

  // 생성한 답변을 질문 단위로 캐시(다음 동일 질문은 AI 재호출 없이 재사용).
  if (answer) {
    try { await db.from("sermon_ai_cache").upsert({ kind: "chat", cache_key: qkey, answer, sources }, { onConflict: "kind,cache_key" }); } catch (_) { /* 무시 */ }
  }

  return { ok: true, answer, sources };
}

// ---------- sermonSummary: 특정 설교의 6~7줄 요약 생성 (관리자) ----------
// body: { pw, sermonId }  — 저장된 summary가 짧아, 요점(points)까지 근거로
// 6~7줄 요약을 그때그때 만든다(내용에 없는 것은 창작 금지).
async function sermonSummary(b: any) {
  // 접근 허용: 관리자이거나, 앱에 로그인한 실제 성도(user_id가 users에 존재)만.
  if (adminError(b) !== null) {
    const uid = (b.user_id ?? "").toString();
    if (!uid) return { ok: false, error: "unauthorized" };
    const { data: u } = await db.from("users").select("id").eq("id", uid).maybeSingle();
    if (!u) return { ok: false, error: "unauthorized" };
  }
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return { ok: false, error: "ANTHROPIC_API_KEY 시크릿 미설정" };

  // 캐시: 같은 설교 요약은 이미 만든 게 있으면 AI 재호출 없이 그대로 반환한다.
  const sid = (b.sermonId ?? "").toString();
  const { data: cached } = await db.from("sermon_ai_cache")
    .select("answer").eq("kind", "summary").eq("cache_key", sid).maybeSingle();
  if (cached) return { ok: true, summary: cached.answer };

  const { data: s, error } = await db.from("sermons")
    .select("title, scripture, summary, points, easy_explain")
    .eq("id", b.sermonId).single();
  if (error || !s) return { ok: false, error: "not-found" };

  const parts = [s.summary];
  for (const p of (s.points ?? [])) parts.push(`${p.heading}: ${p.body}`);
  if (s.easy_explain) parts.push(s.easy_explain);
  const content = parts.filter(Boolean).join("\n\n");

  const system = [
    "너는 교회 설교 요약 도우미다. 아래 설교 내용을 교인이 읽기 좋게 6~7줄 분량으로 요약하라.",
    "설교 내용에 없는 것은 지어내지 말고, 핵심 메시지와 적용점이 드러나게 따뜻하고 담백한 한국어로 써라.",
    "핵심이 되는 중요한 문구는 **굵게**(양쪽에 별표 두 개) 표시하라. 남용하지 말 것.",
    "제목이나 머리말 없이 요약 본문만 출력하라.",
  ].join("\n");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({
      model: Deno.env.get("SERMON_CHAT_MODEL") || "claude-opus-4-8",
      max_tokens: 700,
      system,
      messages: [{ role: "user", content: `[설교 제목] ${s.title}\n[본문] ${s.scripture ?? ""}\n\n[설교 내용]\n${content}` }],
    }),
  });
  if (!res.ok) return { ok: false, error: `anthropic-${res.status}` };
  const d = await res.json();
  const summary = ((d.content ?? []).find((x: any) => x.type === "text")?.text ?? "").trim();
  const finalSummary = summary || (s.summary ?? "");
  // 생성한 요약을 캐시에 저장(다음부터 AI 재호출 없이 재사용).
  if (summary && sid) {
    try { await db.from("sermon_ai_cache").upsert({ kind: "summary", cache_key: sid, answer: finalSummary }, { onConflict: "kind,cache_key" }); } catch (_) { /* 무시 */ }
  }
  return { ok: true, summary: finalSummary };
}

// ---------- clearSummaryCache: 설교 요약 캐시 비우기 (관리자, 명시 요청 시에만) ----------
async function clearSummaryCache(b: any) {
  const err = adminError(b); if (err) return { ok: false, error: err };
  const { data, error } = await db.from("sermon_ai_cache").delete().eq("kind", "summary").select("cache_key");
  if (error) throw error;
  return { ok: true, cleared: (data ?? []).length };
}

// ---------- clearChatCache: 질문 답변 캐시 비우기 (관리자, 명시 요청 시에만) ----------
async function clearChatCache(b: any) {
  const err = adminError(b); if (err) return { ok: false, error: err };
  const { data, error } = await db.from("sermon_ai_cache").delete().eq("kind", "chat").select("cache_key");
  if (error) throw error;
  return { ok: true, cleared: (data ?? []).length };
}

// ---------- sermonChatLog: 설교말씀 도우미 사용 로그 조회 (관리자) ----------
// body: { pw }  → { ok, logs:[{name, gu, mok, question, created_at}] } 최근순
async function sermonChatLog(b: any) {
  const err = adminError(b); if (err) return { ok: false, error: err };
  const { data, error } = await db.from("sermon_chat_log")
    .select("name, gu, mok, question, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return { ok: true, logs: data ?? [] };
}

// ---------- 관리자 사용자 정보 변경 ----------
// ⚠️ 성도 정보 관리(찾기·변경·이력·합치기)는 교회 어드민(admin.onlybible.kr 「👤 성도 계정」)으로 옮겼다(2026-10-09).
//    이 다섯 액션은 **얼렸다** — 교회 어드민이 같은 DB·RPC 를 쓴다. 되살리지 말 것(앱 화면 admin-members 도 걷었다).
//    ⚠️ RPC(admin_update_member_profile·admin_preview_member_merge·admin_merge_members)와 member_merge.sql·member_profile.sql 은
//       교회 어드민이 부르므로 **그대로 둔다.** findMember·memberParticipation(MCP 전용)은 걷지 않는다.
const MOVED_MEMBER = { ok: false, error: "moved-to-church-admin" };
function adminPreviewMemberMerge(_b: any) { return MOVED_MEMBER; }
function adminMergeMembers(_b: any) { return MOVED_MEMBER; }
function adminFindMembers(_b: any) { return MOVED_MEMBER; }
function adminMemberHistory(_b: any) { return MOVED_MEMBER; }
function adminUpdateMember(_b: any) { return MOVED_MEMBER; }

// ---------- login ----------
// ---------- 로그인 횟수 제한 (2026-10-08 보안 점검) ----------
// login 은 이름·소속만 받아 user_id 를 돌려주고, 그 이름·소속은 순위·게시판에 그대로 보인다.
// 제한이 없으면 순위 명단을 통째로 넣어 모든 분의 user_id 를 한 번에 긁어 갈 수 있다.
// → **한 접속 주소에서 하루(한국 날짜)에 로그인할 수 있는 「서로 다른 계정」 수**를 묶는다.
// ⚠️ **부른 횟수가 아니라 서로 다른 계정 수다.** 앱은 열 때마다 login 으로 기록을 맞춘다(syncProgress) —
//    횟수로 세면 하루에 앱을 여섯 번 여신 분이 막힌다. 이미 센 계정은 몇 번을 불러도 지나간다.
// ⚠️ **꺼진 채로 나간다.** app_config `loginLimit` = { "perDay": 5, "allow": ["교회 와이파이 주소"] } 가 있어야 돈다.
//    perDay 가 없거나 0 이면 아무것도 세지 않는다. 켜기 전에 볼 것 둘(docs/notes/security-check.md 「로그인 횟수 제한」):
//    ① 교회 와이파이 — 주일에 수십 분이 한 주소로 들어온다. allow 에 넣지 않고 켜면 여섯 번째 분부터 막힌다.
//    ② 개인정보 안내 — 접속 주소를 (바꾼 값으로 · 이틀) 다루게 된다. 안내에 그 말이 들어간 뒤에 켠다.
// ⚠️ 세지 못하면(표가 없다 · 오류) **막지 않는다.** 로그인이 멈추는 것보다 제한이 하루 쉬는 쪽으로 틀린다.
// ⚠️ 접속 주소는 그대로 두지 않는다 — 날짜를 섞어 바꾼 값(HMAC)만 login_seen 에 적고 이틀 뒤 지운다.
//    날짜가 섞여 있어 어제와 오늘의 같은 주소를 이을 수 없다. 관리자 비번이 든 요청(시험 스크립트)은 세지 않는다.
const ADMIN_CONFIG_KEYS = new Set(["loginLimit", "lifePin"]);   // 관리자만 읽고 쓰는 설정(공개 목록 PUBLIC_CONFIG_KEYS 에 넣지 않는다 — 교회 주소가 든다)
const LOGIN_LIMIT_MSG = "이 인터넷에서 오늘 로그인한 분이 많아요. 잠시 뒤에 다시 하시거나, 와이파이를 끄고 다시 해 주세요.";
// 순수 — 설정값을 읽는다. 모양이 틀리면 꺼진 것으로 본다.
function loginLimitConf(v: any): { perDay: number; allow: string[] } {
  const n = Math.floor(Number(v && typeof v === "object" ? v.perDay : 0));
  const allow = v && typeof v === "object" && Array.isArray(v.allow)
    ? v.allow.map((x: any) => String(x || "").trim().toLowerCase()).filter(Boolean) : [];
  return { perDay: Number.isFinite(n) && n > 0 ? n : 0, allow };
}
// 순수 — 접속 주소. IPv6 은 기기가 뒤 절반을 수시로 바꾸므로 앞 /64 로 묶는다(안 그러면 한 기기가 주소를 바꿔 가며 지나간다).
function loginAddr(forwarded: string | null): { raw: string; addr: string } {
  const raw = String(forwarded || "").split(",")[0].trim().toLowerCase();
  if (!raw) return { raw: "", addr: "" };
  return { raw, addr: raw.includes(":") ? raw.split(":").slice(0, 4).join(":") + "::/64" : raw };
}
async function hmacHex(secret: string, msg: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg)));
  return Array.from(sig).map((x) => x.toString(16).padStart(2, "0")).join("");
}

// ── 교회 생활 확인 번호 — 순수/해시 (2026-10-08 · 설계 docs/superpowers/specs/2026-10-08-church-life-pin-design.md) ──
// ⚠️ 아래 세 순수 함수(lifePinValid·lifeFailsToday·lifeGateState)는 tests/life-pin.test.cjs 와 **글자까지 같게** 둔다.
const LIFE_DEVICE_DAYS = 180, LIFE_PIN_FAILS_PER_DAY = 5, LIFE_MAX_DEVICES = 10;
const lifePinValid = (pin: unknown): pin is string => typeof pin === "string" && /^[0-9]{4}$/.test(pin);
const lifeFailsToday = (fails: number, failDay: string | null, today: string) => failDay === today ? (Number(fails) || 0) : 0;
function lifeGateState(s: { switchOn: string | false; isTester?: boolean; locked?: boolean; hasPin?: boolean; deviceOk?: boolean }): string {
  if (!s.switchOn) return "off";
  if (s.switchOn === "test" && !s.isTester) return "off";
  if (s.locked) return "locked";
  if (!s.hasPin) return "new";
  return s.deviceOk ? "ok" : "ask";
}
// 번호·토큰 자체는 두지 않는다 — 비밀값(LIFE_PIN_SECRET)을 섞은 해시만. 비밀값이 없으면 막지 않는 쪽으로(lifeError).
async function lifePinHash(secret: string, userId: string, pin: string) { return await hmacHex(secret, "life-pin|" + userId + "|" + pin); }
async function lifeDeviceHash(secret: string, token: string) { return await hmacHex(secret, "life-dev|" + token); }
// 스위치 — app_config.lifePin = "on" | "test" | (없음/그밖=off). 관리자만 읽는다(ADMIN_CONFIG_KEYS).
const lifeSwitch = async (): Promise<string | false> => {
  try {
    const { data } = await db.from("app_config").select("value").eq("key", "lifePin").maybeSingle();
    const v = (data?.value ?? "").toString();
    return v === "on" || v === "test" ? v : false;
  } catch { return false; }
};

// 확인을 마친 기기 하나 만든다 — 임의 토큰(앱 localStorage) · 서버엔 해시만. 오래된/넘치는 기기는 치운다.
async function lifeIssueDevice(secret: string, userId: string): Promise<string> {
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32))).map((x) => x.toString(16).padStart(2, "0")).join("");
  await db.from("life_devices").insert({ user_id: userId, token_hash: await lifeDeviceHash(secret, token) });
  const cut = new Date(Date.now() - LIFE_DEVICE_DAYS * 86400000).toISOString();
  await db.from("life_devices").delete().eq("user_id", userId).lt("seen_at", cut);
  const { data } = await db.from("life_devices").select("id,created_at").eq("user_id", userId).order("created_at", { ascending: false });
  const extra = (data ?? []).slice(LIFE_MAX_DEVICES).map((r: any) => r.id);
  if (extra.length) await db.from("life_devices").delete().in("id", extra);
  return token;
}
async function lifePinRow(userId: string) {
  const { data } = await db.from("life_pins").select("pin_hash,fails,fail_day").eq("user_id", userId).maybeSingle();
  return data as { pin_hash: string; fails: number; fail_day: string | null } | null;
}
async function lifeDeviceOk(secret: string, userId: string, device: unknown): Promise<boolean> {
  const tok = typeof device === "string" && /^[0-9a-f]{64}$/.test(device) ? device : "";
  if (!tok) return false;
  const h = await lifeDeviceHash(secret, tok);
  const { data } = await db.from("life_devices").select("id").eq("user_id", userId).eq("token_hash", h).maybeSingle();
  if (data) { await db.from("life_devices").update({ seen_at: new Date().toISOString() }).eq("id", (data as any).id); return true; }
  return false;
}

// lifeGate — 교회 생활 입구가 묻는다: 정해야 하나(new) / 맞혀야 하나(ask) / 그냥(ok) / 잠김(locked) / 꺼짐(off)
async function lifeGate(b: any) {
  const uid = storeUid(b.user_id);
  const sw = await lifeSwitch();
  if (!uid) return { ok: true, state: sw ? "new" : "off" };     // 로그인 전이면 화면이 먼저 로그인시킨다
  const secret = Deno.env.get("LIFE_PIN_SECRET") ?? "";
  if (!secret) return { ok: true, state: "off" };               // 비밀값 없으면 자물쇠 끔(막지 않는다)
  const isTester = sw === "test" ? await ministryIsTester(uid) : true;
  const row = await lifePinRow(uid);
  const today = kstDay(new Date().toISOString());
  const locked = !!row && lifeFailsToday(row.fails, row.fail_day, today) >= LIFE_PIN_FAILS_PER_DAY;
  const deviceOk = !!row && await lifeDeviceOk(secret, uid, b.device);
  return { ok: true, state: lifeGateState({ switchOn: sw, isTester, locked, hasPin: !!row, deviceOk }) };
}

// lifePinSet — 번호가 **없을 때만** 정한다(두 번 넣어 확인하는 것은 앱이 한다). 성공 시 이 기기를 기억한다.
async function lifePinSet(b: any) {
  const uid = storeUid(b.user_id);
  if (!uid) return { ok: false, error: "로그인한 뒤에 정할 수 있어요" };
  if (!lifePinValid(b.pin)) return { ok: false, error: "숫자 4자리를 넣어 주세요" };
  const secret = Deno.env.get("LIFE_PIN_SECRET") ?? "";
  if (!secret) return { ok: false, error: "준비 중이에요. 잠시 뒤 다시 해 주세요" };
  if (await lifePinRow(uid)) return { ok: false, error: "already-set" };   // 이미 있으면 맞히기로(앱이 처리)
  const { error } = await db.from("life_pins").insert({ user_id: uid, pin_hash: await lifePinHash(secret, uid, b.pin) });
  if (error) { if (/duplicate key/i.test(String(error.message))) return { ok: false, error: "already-set" }; throw error; }
  const device = await lifeIssueDevice(secret, uid);
  await lifeMatchPerson(uid);   // 정한 직후 교적과 맞대 둔다(실패해도 조용히)
  return { ok: true, device };
}

// lifePinCheck — 맞으면 이 기기를 기억한다 · 틀리면 남은 횟수 · 다섯 번째에 그날 잠근다
async function lifePinCheck(b: any) {
  const uid = storeUid(b.user_id);
  if (!uid) return { ok: false, error: "로그인한 뒤에 할 수 있어요" };
  if (!lifePinValid(b.pin)) return { ok: false, error: "숫자 4자리를 넣어 주세요" };
  const secret = Deno.env.get("LIFE_PIN_SECRET") ?? "";
  if (!secret) return { ok: false, error: "준비 중이에요. 잠시 뒤 다시 해 주세요" };
  const row = await lifePinRow(uid);
  if (!row) return { ok: false, error: "no-pin" };            // 번호가 없다 → 앱이 정하기로
  const today = kstDay(new Date().toISOString());
  const failsToday = lifeFailsToday(row.fails, row.fail_day, today);
  if (failsToday >= LIFE_PIN_FAILS_PER_DAY) return { ok: false, error: "locked" };
  if ((await lifePinHash(secret, uid, b.pin)) === row.pin_hash) {
    await db.from("life_pins").update({ fails: 0, fail_day: null }).eq("user_id", uid);
    return { ok: true, device: await lifeIssueDevice(secret, uid) };
  }
  const left = LIFE_PIN_FAILS_PER_DAY - failsToday - 1;
  await db.from("life_pins").update({ fails: failsToday + 1, fail_day: today }).eq("user_id", uid);
  return { ok: false, error: left > 0 ? "wrong" : "locked", left: Math.max(0, left) };
}

// lifeResetRequest — 번호를 잊었거나 남이 먼저 정한 경우. 하루 한 번만(도배 방지). 처리는 교회 어드민(Plan 3).
async function lifeResetRequest(b: any) {
  const uid = storeUid(b.user_id);
  if (!uid) return { ok: false, error: "로그인한 뒤에 할 수 있어요" };
  const dup = await db.from("life_reset_requests").select("id").eq("user_id", uid).eq("status", "open")
    .gte("created_at", kstDayStartIso()).limit(1);
  if (!dup.error && dup.data && dup.data.length) return { ok: true, already: true };
  const { error } = await db.from("life_reset_requests").insert({ user_id: uid });
  if (error) throw error;
  return { ok: true };
}

// 교적 맞대기(2026-10-08 · Plan 4) — 아직 안 이어진 계정이면 교회 어드민에 맞대 보고, 한 분으로 좁혀지면 교인ID 를 적어 둔다.
//   who 는 앱이 보낸 값이 아니라 users 에서 읽는다. 실패해도 조용히(번호 정하기를 막지 않는다). 사람이 정한 줄(staff)은 안 건드린다.
async function lifeMatchPerson(uid: string) {
  try {
    const { data } = await db.from("life_pins").select("person_id,person_how").eq("user_id", uid).maybeSingle();
    if (!data || (data as any).person_id || (data as any).person_how === "staff") return;
    const { data: u } = await db.from("users").select("type,gu,mok,bu,grade,name").eq("id", uid).maybeSingle();
    if (!u) return;
    const j = await churchAdminInternal({ action: "internalPinMatch", user_id: uid, who: u });
    if (!j || j.ok !== true) return;
    const patch = j.matched === "one"
      ? { person_id: j.person_id, person_how: "auto", matched_at: new Date().toISOString() }
      : { person_how: "no", matched_at: new Date().toISOString() };
    await db.from("life_pins").update(patch).eq("user_id", uid);
  } catch (_) { /* 맞대기 실패가 번호 정하기를 막지 않는다 */ }
}

const LIFE_CONTACT_DAYS = 180;   // 교적과 안 맞은 분의 연락처 보관(친구 결정 §11-4 · 바꾸려면 여기 하나)

// 이 사용자에게 확인 번호 문이 켜져 있나 — 켜졌으면 사역신청이 번호 대신 교적 맞대기로 간다.
// ⚠️ lifeError 와 같은 「켜짐」 조건이되 기기 확인은 보지 않는다(ministryApply 는 이미 lifeError 를 지나왔다).
async function lifeActive(b: any): Promise<boolean> {
  try {
    if (!adminError(b)) return false;                 // 관리자 비번(담당자 암호 포함)은 옛 흐름
    const sw = await lifeSwitch();
    if (!sw) return false;
    const uid = storeUid(b.user_id);
    if (!uid) return false;
    if (sw === "test" && !(await ministryIsTester(uid))) return false;
    return !!(Deno.env.get("LIFE_PIN_SECRET") ?? "");
  } catch (_) { return false; }
}

// 교적과 이어졌나 — person_id 가 있고 사람/자동이 정한 줄(auto·staff)이면 이어진 것. no 는 「명부를 읽었는데 안 맞음」.
async function lifePersonLinked(uid: string): Promise<{ linked: boolean; how: string }> {
  try {
    const { data } = await db.from("life_pins").select("person_id,person_how").eq("user_id", uid).maybeSingle();
    const how = (data as any)?.person_how ?? "";
    const linked = !!(data as any)?.person_id && (how === "auto" || how === "staff");
    return { linked, how };
  } catch (_) { return { linked: false, how: "" }; }
}

async function lifeContactPhone(uid: string): Promise<string> {
  try {
    const { data } = await db.from("life_contacts").select("phone").eq("user_id", uid).maybeSingle();
    return norm((data as any)?.phone) || "";
  } catch (_) { return ""; }
}

// lifeContactSave — 교적과 안 맞은 분이 신청 저장 때 남기는 연락처. 기기 확인된 분만(또는 관리자). 180일 지난 줄은 치운다.
async function lifeContactSave(b: any) {
  const uid = storeUid(b.user_id);
  if (!uid) return { ok: false, error: "로그인한 뒤에 할 수 있어요" };
  const phone = pilsaPhone(b.phone);
  if (!PILSA_PHONE_RE.test(phone)) return { ok: false, error: "휴대폰 번호를 확인해 주세요 (010-1234-5678)" };
  const secret = Deno.env.get("LIFE_PIN_SECRET") ?? "";
  // 관리자 비번이 아니면 이 기기가 확인됐는지 본다(교회 생활 쓰기이므로)
  if (adminError(b) && !(secret && await lifeDeviceOk(secret, uid, b.device))) {
    return { ok: false, error: "pin-needed" };
  }
  const now = new Date().toISOString();
  const { error } = await db.from("life_contacts").upsert({ user_id: uid, phone, updated_at: now }, { onConflict: "user_id" });
  if (error) throw error;
  const cut = new Date(Date.now() - LIFE_CONTACT_DAYS * 86400000).toISOString();
  await db.from("life_contacts").delete().lt("updated_at", cut);
  return { ok: true };
}

// 「내 이름으로 하는 일」의 문 — 확인을 마친 기기만. 관리자 비번은 지나간다(adminError).
// ⚠️ 스위치 off 거나(또는 test 인데 시험 참여자 아님) 비밀값이 없으면 **막지 않는다**(null).
// ⚠️ 세다가 오류가 나도 막지 않는다 — 신청·기록이 멈추는 것보다 자물쇠가 쉬는 쪽.
async function lifeError(b: any): Promise<string | null> {
  try {
    if (!adminError(b)) return null;                       // 관리자 비번(담당자 암호 포함 — 담당자 화면·크론 영향 없음)
    const sw = await lifeSwitch();
    if (!sw) return null;
    const uid = storeUid(b.user_id);
    if (!uid) return null;                                 // user_id 없는 요청은 각 액션이 알아서 막는다
    if (sw === "test" && !(await ministryIsTester(uid))) return null;
    const secret = Deno.env.get("LIFE_PIN_SECRET") ?? "";
    if (!secret) return null;
    const row = await lifePinRow(uid);
    if (!row) return "pin-needed";                         // 번호를 아직 안 정함 → 앱이 정하기 창
    const today = kstDay(new Date().toISOString());
    if (lifeFailsToday(row.fails, row.fail_day, today) >= LIFE_PIN_FAILS_PER_DAY) return "pin-locked";
    return (await lifeDeviceOk(secret, uid, b.device)) ? null : "pin-needed";  // 이 기기가 확인 안 됨 → 맞히기 창
  } catch (_) { return null; }
}
async function loginLimitError(b: any, req: Request | undefined, identity: string): Promise<string | null> {
  try {
    if (!adminError(b)) return null;
    const { data, error } = await db.from("app_config").select("value").eq("key", "loginLimit").maybeSingle();
    if (error) return null;
    const conf = loginLimitConf(data?.value);
    if (!conf.perDay) return null;
    const { raw, addr } = loginAddr(req ? req.headers.get("x-forwarded-for") : null);
    if (!addr || conf.allow.includes(raw) || conf.allow.includes(addr)) return null;
    const day = kstDay(new Date().toISOString());
    const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const addrHash = (await hmacHex(secret, "login-addr|" + day + "|" + addr)).slice(0, 32);
    const identHash = (await hmacHex(secret, "login-ident|" + day + "|" + identity)).slice(0, 32);
    const seen = await db.from("login_seen").select("ident_hash").eq("addr_hash", addrHash).eq("day", day).limit(conf.perDay + 1);
    if (seen.error) return null;
    const list = ((seen.data ?? []) as any[]).map((r) => r.ident_hash);
    if (list.includes(identHash)) return null;
    if (list.length >= conf.perDay) return LOGIN_LIMIT_MSG;
    await db.from("login_seen").insert({ addr_hash: addrHash, day, ident_hash: identHash });
    if (Math.random() < 0.05) {
      const old = kstDay(new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString());
      await db.from("login_seen").delete().lt("day", old);
    }
    return null;
  } catch (_) { return null; }
}

async function login(b: any) {
  const key = identityKey(b);
  const { data: user, error } = await db.rpc("member_login", { p_profile: {
    type: b.type,
    gu: norm(b.gu) || null,
    mok: norm(b.mok) || null,
    bu: norm(b.bu) || null,
    grade: norm(b.grade) || null,
    name: norm(b.name),
    identity_key: key,
  } });
  if (error) throw error;

  // 보호자 확인(2026-10-01) — 어린 부서(needsGuardian)이고 앱이 「보호자가 함께 확인했어요」 체크를 보냈으면
  // 그 날짜를 **처음 한 번만** 남긴다. 서버 기록 행(users)으로 판단한다(별칭으로 들어와도 같은 사람).
  // ⚠️ 체크가 없다고 로그인을 막지 않는다 — 옛 판 앱·아이폰 네이티브 로그인 화면은 이 칸을 모른다.
  //    대신 웹이 다음에 열릴 때 한 번 묻는다(app.js enterAfterLogin). 칸이 없는 DB(SQL 전)면 조용히 건너뛴다.
  if (b.guardian_ok === true && user && needsGuardian(user) && !user.guardian_ok_at) {
    try {
      const { data: g, error: ge } = await db.from("users").update({ guardian_ok_at: new Date().toISOString() })
        .eq("id", user.id).is("guardian_ok_at", null).select("guardian_ok_at").maybeSingle();
      if (!ge && g) user.guardian_ok_at = (g as any).guardian_ok_at;
    } catch (_) { /* 기록 실패가 로그인을 막지 않는다 — 앱이 다음 로그인에 다시 보낸다 */ }
  }

  // select("*") — hearted 컬럼이 아직 없어도(마이그레이션 전) 에러 없이 undefined로 읽혀
  // 로그인이 깨지지 않는다. 배포 순서에 의존하지 않기 위함.
  const { data: prog } = await db.from("progress")
    .select("*").eq("user_id", user.id);

  // 복습 서버 단일화: 완료(3단계)했는데 복습 예약이 없는 구절에 자동 예약(box1, 3일 후)
  const { data: existRev } = await db.from("reviews").select("verse_no").eq("user_id", user.id);
  const revSet = new Set((existRev ?? []).map((r: any) => r.verse_no));
  const due = new Date(); due.setDate(due.getDate() + REVIEW_DAYS[0]);
  // 한글·영어 두 행이 모두 3단계일 수 있어, 구절 하나로 추린 뒤 예약한다
  const need = [...new Set((prog ?? [])
    .filter((p: any) => p.stage === 3 && !revSet.has(p.verse_no) && !isPsalmNo(p.verse_no))
    .map((p: any) => p.verse_no))];
  const toAdd = need.map((no) => ({ user_id: user.id, verse_no: no, box: 1, due_at: ymd(due) }));
  if (toAdd.length) {
    await db.from("reviews").upsert(toAdd, { onConflict: "user_id,verse_no", ignoreDuplicates: true });
  }

  const { data: revs } = await db.from("reviews")
    .select("verse_no,box,due_at,last_at").eq("user_id", user.id);

  // progress는 기존 형태({구절:단계} 숫자 맵) 유지 — 구버전 클라이언트 호환.
  // 영어(NIV) 진도는 progressEn으로 따로 내려보낸다(옛 앱은 이 값을 무시한다).
  // "마음에 둠"은 별도 배열로만 덧붙인다(비파괴).
  const progress: Record<number, number> = {};
  const progressEn: Record<number, number> = {};
  (prog ?? []).forEach((r: any) => {
    const box = r.lang === "en" ? progressEn : progress;
    box[r.verse_no] = r.stage;
  });
  // 마음에 둠은 구절 단위 — 어느 언어에서 체크했든 하나로 본다
  const hearted = [...new Set((prog ?? []).filter((r: any) => r.hearted).map((r: any) => r.verse_no))];
  // 서버가 확인한 병합에 한해서만 클라이언트가 옛 번호의 로컬 진도를 이전한다.
  let mergedFrom: string | null = null;
  let mergedPassageProgress: any[] = [];
  if (typeof b.previous_user_id === "string" && /^[0-9a-f-]{36}$/i.test(b.previous_user_id) && b.previous_user_id !== user.id) {
    const { data, error } = await db.from("user_merges").select("source_user_id")
      .eq("source_user_id", b.previous_user_id).eq("target_user_id", user.id).maybeSingle();
    if (error) throw error;
    if (data) mergedFrom = data.source_user_id;
  }
  if (mergedFrom) {
    const { data, error } = await db.from("passage_progress").select("passage_id,done_seq,completed_at,updated_at").eq("user_id", user.id);
    if (error) throw error;
    mergedPassageProgress = data ?? [];
  }
  return { ok: true, user_id: user.id, user, progress, progressEn, hearted, reviews: revs ?? [],
    merged_from: mergedFrom, merged_passage_progress: mergedPassageProgress };
}

// ---------- app_config: 관리자가 배포 없이 편집하는 설정(키-값) ----------
// 공개로 읽어도 되는 키만 화이트리스트로 허용(임의 키 노출 방지).
const PUBLIC_CONFIG_KEYS = new Set(["heartMessages", "dailyMessage", "introSlides", "milestoneMessages", "passagesPublic", "psalmPublic", "songPublic", "event", "ministry", "eduOpen", "dutyOpen"]);

async function getConfig(b: any) {
  const key = String(b.key || "");
  // 관리자 전용 설정은 비번이 맞을 때만 읽힌다(틀리면 「없는 키」와 같은 답 — 있다는 것도 안 알린다)
  if (ADMIN_CONFIG_KEYS.has(key) ? !!adminError(b) : !PUBLIC_CONFIG_KEYS.has(key)) return { ok: false, error: "허용되지 않은 키" };
  // 테이블 미생성(마이그레이션 전)이어도 앱이 안 깨지게 조용히 null 반환
  try {
    const { data, error } = await db.from("app_config").select("value").eq("key", key).maybeSingle();
    if (error) return { ok: true, value: null };
    return { ok: true, value: data?.value ?? null };
  } catch { return { ok: true, value: null }; }
}

async function saveConfig(b: any) {
  const err = adminError(b); if (err) return { ok: false, error: err };
  const key = String(b.key || "");
  if (!PUBLIC_CONFIG_KEYS.has(key) && !ADMIN_CONFIG_KEYS.has(key)) return { ok: false, error: "허용되지 않은 키" };
  const { error } = await db.from("app_config").upsert({
    key, value: b.value ?? null, updated_at: new Date().toISOString(),
  }, { onConflict: "key" });
  if (error) throw error;
  return { ok: true };
}

// ---------- saveHeart: "이 말씀을 내 마음에 두었나이다" 체크/해제 ----------
async function saveHeart(b: any) {
  const on = !!b.hearted;
  // 체크한 그 언어의 행에 남긴다 — 다른 언어 행에 3단계가 잘못 생기지 않게
  const { error } = await db.from("progress").upsert({
    user_id: b.user_id, verse_no: b.verse_no, lang: progLang(b.lang),
    stage: 3,                       // 3단계를 통과해야만 체크 가능
    hearted: on,
    hearted_at: on ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,verse_no,lang" });
  if (error) throw error;
  return { ok: true, hearted: on };
}

// ---------- saveProgress: 단계 저장 + 학습 통과 이벤트 기록(통계용) ----------
async function saveProgress(b: any) {
  const lang = progLang(b.lang);
  const { error } = await db.from("progress").upsert({
    user_id: b.user_id, verse_no: b.verse_no, stage: b.stage, lang,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,verse_no,lang" });
  if (error) throw error;

  // 학습 통과를 활동 이벤트로 남긴다(관리자 사용현황/참여자/구절별 통계 원천).
  // ⚠️ mode는 challenge_log_mode_check 제약이 허용하는 값만 써야 한다.
  //    (한때 learn-typing-stage3 처럼 단계를 붙였다가 제약 위반으로 기록이 전부 막혔음)
//    카드로 채운 암송은 'learn-typing-card'로 따로 남긴다 — 이름에 typing이 들어가야
//    순위·통계의 `%typing%` 집계가 지금까지와 똑같이 유지된다.
  const m = b.mode === "voice" ? "learn-voice"
    : b.mode === "card" ? "learn-typing-card" : "learn-typing";
  let { error: logError } = await db.from("challenge_log").insert({
    user_id: b.user_id, verse_no: b.verse_no, mode: m,
  });
  // 제약(migrate_modes_card.sql)이 아직 안 넓혀진 DB라면 새 값이 거부된다.
  // 그때는 기록을 잃지 말고 옛 값으로 되돌린다 — 예전에 이 자리에서 제약을 안 맞춰
  // 암송 기록이 통째로 막힌 적이 있다. 구분보다 기록이 먼저다.
  if (logError && m === "learn-typing-card") {
    const retry = await db.from("challenge_log").insert({
      user_id: b.user_id, verse_no: b.verse_no, mode: "learn-typing",
    });
    logError = retry.error;
  }
  if (logError) throw logError;

  if (Number(b.stage) === 3 && !isPsalmNo(b.verse_no)) {
    // 복습은 언어를 가리지 않는다 — 어느 쪽으로 마쳤든 그 구절 하나로 예약
    const due = new Date(); due.setDate(due.getDate() + REVIEW_DAYS[0]);
    await db.from("reviews").upsert({
      user_id: b.user_id, verse_no: b.verse_no, box: 1, due_at: ymd(due),
    }, { onConflict: "user_id,verse_no", ignoreDuplicates: true });
  }
  return { ok: true, ...await dailyActivityMilestone(b.user_id) };
}

// ---------- challenge: 도전/복습 완료 기록(순위 원천) ----------
async function challenge(b: any) {
  // 카드로 푼 도전은 'typing-card'로 따로 남긴다. 이름에 typing이 들어가야
  // 순위·통계의 %typing% 집계가 지금까지와 똑같이 유지된다.
  const m = b.mode === "card" ? "typing-card" : b.mode;
  let { error } = await db.from("challenge_log").insert({
    user_id: b.user_id, verse_no: b.verse_no,
    mode: m, score: b.score ?? null,
  });
  // 제약(migrate_modes_card.sql · migrate_modes_review_card.sql)이 아직 안 넓혀진 DB면
  // 새 값이 거부된다. 그때는 기록을 잃지 말고 옛 값으로 되돌린다 — 구분보다 기록이 먼저다.
  // ⚠️ 되돌릴 값은 **접두사를 보존**해야 한다. 전부 "typing"으로 통일하면 복습과
  //    긴 본문(app.js:454 logPassageActivity 가 learn-* 를 이 액션으로 보낸다)이
  //    「도전」으로 둔갑해 전환율이 조용히 부풀어 오른다 —
  //    challenge_funnel.sql 의 도전 판정이 `mode not like 'learn%' and mode not like 'review%'` 다.
  //    2026-09-02 이전에 겪은 그 사고를 다시 만드는 셈이 된다.
  if (error && typeof m === "string" && m.endsWith("-card")) {
    const base = m.startsWith("review-") ? "review-typing"
               : m.startsWith("learn-")  ? "learn-typing"
               : "typing";
    const retry = await db.from("challenge_log").insert({
      user_id: b.user_id, verse_no: b.verse_no,
      mode: base, score: b.score ?? null,
    });
    error = retry.error;
  }
  if (error) throw error;
  return { ok: true, ...await dailyActivityMilestone(b.user_id) };
}

// 일반 암송 완료(3단계)·말씀 도전·복습을 모두 합친 오늘의 완료 횟수.
// challenge_log가 세 활동(암송·도전·복습)의 공통 원천 — 오늘 총 활동 횟수를 센다.
async function dailyActivityMilestone(userId: string) {
  const today = kstDay(new Date().toISOString());
  const from = `${today}T00:00:00${KST}`;
  const to = `${today}T23:59:59.999${KST}`;
  // 오늘의 모든 활동(암송·도전·복습)을 센다 — 첫 화면 '오늘 N회' 띠(mydays)와 같은 기준.
  const { count, error } = await db.from("challenge_log").select("*", { count: "exact", head: true })
    .eq("user_id", userId).gte("created_at", from).lte("created_at", to);
  // 응원 집계가 일시적으로 실패해도 이미 저장된 활동 기록은 성공으로 응답한다.
  if (error) return { todayCount: null, milestone: null };
  const todayCount = count ?? 0;
  return {
    todayCount,
    milestone: todayCount > 0 && todayCount % 10 === 0 ? todayCount : null,
  };
}

// ---------- advanceReview ----------
async function advanceReview(b: any) {
  const { data: r } = await db.from("reviews")
    .select("box").eq("user_id", b.user_id).eq("verse_no", b.verse_no).maybeSingle();
  const box = Math.min((r?.box ?? 1) + 1, REVIEW_DAYS.length);
  const due = new Date(); due.setDate(due.getDate() + REVIEW_DAYS[box - 1]);
  await db.from("reviews").upsert({
    user_id: b.user_id, verse_no: b.verse_no, box,
    due_at: ymd(due), last_at: ymd(new Date()),
  }, { onConflict: "user_id,verse_no" });
  return { ok: true, box };
}

// PostgREST는 한 번에 최대 1000행만 반환한다. 집계는 전체 행을 세야 정확하므로
// 1000행씩 이어 받는다. 이걸 안 쓰면 로그가 1000행을 넘는 순간 조용히 잘린 값이 나온다.
// build()는 호출할 때마다 새 쿼리를 만들어야 한다(쿼리 빌더는 재사용 불가).
const PAGE_SIZE = 1000;
async function fetchAllRows(build: () => any): Promise<any[]> {
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

// 기간 필터 적용(challenge_log)
function rangeFilter(q: any, b: any) {
  if (b.from) q = q.gte("created_at", `${b.from}T00:00:00${KST}`);
  if (b.to)   q = q.lte("created_at", `${b.to}T23:59:59${KST}`);
  return q;
}
// 도전/복습(학습 제외) 로그만
const isChallengeMode = (m: string) => !String(m).startsWith("learn-");

// ---------- 순위 응원(👏) ----------
// 대상은 순위표에 이미 보이는 네 조각(구분·소속·세부·이름)으로만 지목한다. 이 API는 JWT가
// 없어 클라이언트가 보낸 user_id를 그대로 믿으므로, 남의 user_id를 응답에 실으면 누구나
// 그 사람 행세를 할 수 있다. 그래서 서버가 identity_key로 되짚는다.
function cheerTargetKey(b: any) {
  const gubun = norm(b.gubun);
  const isGu = gubun === "교구";
  return identityKey({
    type: gubun,
    gu: isGu ? b.sosok : "",
    mok: isGu ? b.sebu : "",
    bu: isGu ? "" : b.sosok,
    grade: isGu ? "" : b.sebu,
    name: b.name,
  });
}

// 오늘(KST) 내 활동(암송·도전·복습)이 하나라도 있어야 남을 응원할 수 있다.
// challenge_log가 세 활동의 공통 원천 — 순위표를 만드는 원천과 같다.
async function hasTodayActivity(userId: string) {
  const today = kstDay(new Date().toISOString());
  const { count, error } = await db.from("challenge_log")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", `${today}T00:00:00${KST}`)
    .lte("created_at", `${today}T23:59:59.999${KST}`);
  if (error) return false;
  return (count ?? 0) > 0;
}

// 대상의 users.id를 찾는다. 못 찾으면 null.
async function cheerTargetId(b: any): Promise<string | null> {
  const { data } = await db.from("users").select("id")
    .eq("identity_key", cheerTargetKey(b)).maybeSingle();
  return data?.id ?? null;
}

async function rankCheer(b: any) {
  const fromId = String(b.user_id || "");
  if (!fromId) return { ok: false, error: "로그인한 뒤에 응원할 수 있어요" };

  const targetId = await cheerTargetId(b);
  if (!targetId) return { ok: false, error: "응원할 성도를 찾지 못했어요" };
  if (targetId === fromId) return { ok: false, error: "자기 자신은 응원할 수 없어요" };

  const today = kstDay(new Date().toISOString());

  // 취소는 자격을 묻지 않는다 — 이미 준 것은 그때 자격이 있었다는 뜻이다.
  if (b.on === false) {
    const { error } = await db.from("rank_cheers").delete()
      .eq("target_user_id", targetId).eq("from_user_id", fromId).eq("cheer_date", today);
    if (error) throw error;
    return { ok: true, on: false };
  }

  // 클라이언트에서도 막지만 여기가 진짜 관문이다.
  if (!(await hasTodayActivity(fromId))) {
    return { ok: false, error: "오늘 말씀을 한 번이라도 암송하면 응원할 수 있어요" };
  }
  // 받는 쪽도 오늘 기록이 있어야 한다(주는 쪽과 대칭). 취소는 검사하지 않는다 —
  // 이미 준 것을 무를 길이 막히면 안 된다.
  if (!(await hasTodayActivity(targetId))) {
    return { ok: false, error: "오늘 말씀을 암송한 성도님께 응원할 수 있어요" };
  }
  const { error } = await db.from("rank_cheers").upsert({
    target_user_id: targetId, from_user_id: fromId, cheer_date: today,
    from_name: norm(b.who) || null,
  }, { onConflict: "target_user_id,from_user_id,cheer_date", ignoreDuplicates: true });
  if (error) throw error;
  return { ok: true, on: true };
}

// 나를 응원한 사람 이름(기간 안). **본인 것만** 돌려준다 — 남이 누구에게 응원받았는지는
// 숫자만 보이고 이름은 보이지 않는다. 대상을 아예 받지 않으므로 남의 명단을 물어볼 길이 없다.
async function rankCheerers(b: any) {
  const me = String(b.user_id || "");
  if (!me) return { ok: true, list: [] };
  let q = db.from("rank_cheers").select("from_name, cheer_date").eq("target_user_id", me);
  if (b.from) q = q.gte("cheer_date", b.from);
  if (b.to)   q = q.lte("cheer_date", b.to);
  const { data, error } = await q.order("cheer_date", { ascending: false });
  if (error) throw error;
  return { ok: true, list: (data ?? []).map((r: any) => r.from_name).filter(Boolean) };
}

// ---------- 지금 함께하고 있는 사람 ----------
// 집계표(daily_activity)에는 시각이 없어 여기서만 로그를 본다. 다만 '최근 10분'
// 창이라 몇 행뿐이다 — 전체를 훑는 것이 아니다.
// 신원 네 조각으로 돌려주는 이유: 순위 응답에는 user_id를 싣지 않기 때문(이 API는
// JWT가 없어 남의 user_id가 새면 그 사람 행세가 가능해진다).
const LIVE_MINUTES = 10;

async function liveNowKeys(): Promise<Set<string>> {
  const set = new Set<string>();
  try {
    const since = new Date(Date.now() - LIVE_MINUTES * 60_000).toISOString();
    const { data } = await db.from("challenge_log")
      .select("user_id, users(name,type,gu,mok,bu,grade)")
      .gte("created_at", since)
      .limit(1000);
    for (const r of (data ?? []) as any[]) {
      const u = r.users ?? {};
      set.add([u.type, u.gu || u.bu || "", u.mok || u.grade || "", u.name].join("|"));
    }
  } catch (_) { /* 실패해도 순위 자체는 보여준다 — 곁들이지 본체가 아니다 */ }
  return set;
}

// 조회 기간에 '오늘'이 들어 있을 때만 본다. 지난 주 순위를 보면서 '지금'을 말하면 뜬금없다.
function rangeHasToday(b: any): boolean {
  const today = kstDay(new Date().toISOString());
  return (!b.from || String(b.from) <= today) && (!b.to || String(b.to) >= today);
}

// ---------- ranking: 순위. includeLearn=true면 암송(학습) 기록도 포함 ----------
// 빠른 경로: daily_activity 집계 RPC (미설치·실패 시 아래 rankingSlow로 폴백).
// 로그를 통째로 끌어오지 않는다 — 2026-08-15 기준 로그 11,047행 vs (사용자,일자) 449행.
async function ranking(b: any) {
  const me = String(b.me || "");
  // 앱(me 있는 요청)만 조인다 — 순위 명단 수집에 마찰을 더한다(2026-10-09 친구):
  //   ① 오늘 한 번이라도 활동한 분만 순위를 본다.
  //   ② 전체기간 누적은 주지 않는다 — 기간을 반드시 좁혀야 한다(from·to 둘 다 있어야 함).
  // ⚠️ 관리자 도전현황(admin-stats)은 me 없이 from/to 로 불러 이 문을 지나간다 — 그대로 둔다.
  if (me) {
    if (!b.from || !b.to) return { ok: true, list: [], blocked: "range", canCheer: false, liveMinutes: LIVE_MINUTES };
    if (!(await hasTodayActivity(me))) return { ok: true, list: [], blocked: "activity", canCheer: false, liveMinutes: LIVE_MINUTES };
  }
  try {
    const { data, error } = await db.rpc("v2_ranking", {
      p_from: b.from || "", p_to: b.to || "",
      p_include_learn: !!b.includeLearn, p_me: me,
    });
    if (error) throw error;
    const list = ((data ?? []) as any[]).map((r) => ({
      rank: r.rank, name: r.name, gubun: r.gubun, sosok: r.sosok, sebu: r.sebu,
      count: r.cnt, typing: r.typing, voice: r.voice,
      activeToday: r.active_today, cheers: r.cheers, iCheered: r.i_cheered,
    }));
    const canCheer = me ? await hasTodayActivity(me) : false;
    if (rangeHasToday(b)) {
      const live = await liveNowKeys();
      for (const r of list as any[]) {
        (r as any).liveNow = live.has([r.gubun, r.sosok, r.sebu, r.name].join("|"));
      }
    }
    return { ok: true, list, canCheer, liveMinutes: LIVE_MINUTES };
  } catch (_) { /* RPC 미설치 → 폴백 */ }
  return await rankingSlow(b);
}

async function rankingSlow(b: any) {
  const includeLearn = !!b.includeLearn; // 앱 도전순위=true, 관리자 도전현황=false
  const data = await fetchAllRows(() => rangeFilter(
    db.from("challenge_log").select("user_id, mode, created_at, users(name,type,gu,mok,bu,grade)"), b));

  // 응원은 주는 쪽·받는 쪽 모두 '오늘 기록'이 있어야 한다. 받는 쪽 판정은 이미 읽어 온
  // 로그에서 바로 뽑는다(추가 조회 없음). 조회 기간에 오늘이 없으면 모두 false가 되는데,
  // 그때는 어차피 주는 것 자체가 잠긴다(클라이언트의 rangeHasToday).
  const todayKst = kstDay(new Date().toISOString());
  const tFrom = Date.parse(`${todayKst}T00:00:00${KST}`);
  const tTo = Date.parse(`${todayKst}T23:59:59.999${KST}`);
  // 이 경로는 로그를 이미 들고 있다 — '지금'도 추가 조회 없이 여기서 센다
  const liveSince = rangeHasToday(b) ? Date.now() - LIVE_MINUTES * 60_000 : Infinity;

  const map = new Map<string, any>();
  for (const row of data) {
    if (!includeLearn && !isChallengeMode(row.mode)) continue;
    const u = row.users ?? {};
    const e = map.get(row.user_id) ?? {
      uid: row.user_id,                  // 응원을 붙이는 데만 쓰고 응답에서는 뗀다
      name: u.name, gubun: u.type,
      sosok: u.gu || u.bu || "", sebu: u.mok || u.grade || "",
      count: 0, typing: 0, voice: 0, activeToday: false, liveNow: false,
    };
    e.count++;
    if (String(row.mode).includes("typing")) e.typing++;
    if (String(row.mode).includes("voice")) e.voice++;
    const t = Date.parse(row.created_at);
    if (t >= tFrom && t <= tTo) e.activeToday = true;
    if (t >= liveSince) e.liveNow = true;
    map.set(row.user_id, e);
  }

  // ---- 응원 집계 ----
  // 숫자는 조회 기간(cheer_date) 기준, 켬(iCheered)은 '오늘' 기준이다. 버튼이 하는 일이
  // "오늘 주기/취소"라 겉모습도 오늘을 따라야 눌렀을 때 예상대로 움직인다.
  const cheerCount = new Map<string, number>();
  const myToday = new Set<string>();
  let canCheer = false;
  try {
    const cheerRows = await fetchAllRows(() => {
      let q = db.from("rank_cheers").select("target_user_id");
      if (b.from) q = q.gte("cheer_date", b.from);
      if (b.to)   q = q.lte("cheer_date", b.to);
      return q;
    });
    for (const c of cheerRows) {
      cheerCount.set(c.target_user_id, (cheerCount.get(c.target_user_id) ?? 0) + 1);
    }
    const me = String(b.me || "");
    if (me) {
      const today = kstDay(new Date().toISOString());
      const { data: mine } = await db.from("rank_cheers")
        .select("target_user_id").eq("from_user_id", me).eq("cheer_date", today);
      for (const c of mine ?? []) myToday.add(c.target_user_id);
      canCheer = await hasTodayActivity(me);
    }
  } catch (_) {
    // 응원 집계가 실패해도 순위 자체는 보여준다 — 응원은 곁들이지 본체가 아니다.
  }

  const list = [...map.values()]
    .sort((a, b) => b.count - a.count)
    .map((x, i) => {
      const { uid, ...rest } = x;
      return {
        rank: i + 1, ...rest,
        cheers: cheerCount.get(uid) ?? 0,
        iCheered: myToday.has(uid),
      };
    });
  return { ok: true, list, canCheer, liveMinutes: LIVE_MINUTES };
}

// ---------- guRanking: 교구별 순위(암송·도전·복습 전부) ----------
// 참여율은 낼 수 없다 — 각 교구의 실제 성도 수(분모)가 DB에 없다.
// 그래서 총 횟수로 순위를 매기고, 참여 인원·1인당 평균을 함께 준다.
async function guRanking(b: any) {
  try {
    const { data, error } = await db.rpc("v2_gu_ranking", { p_from: b.from || "", p_to: b.to || "" });
    if (error) throw error;
    const list = ((data ?? []) as any[]).map((r) => ({
      rank: r.rank, gu: r.gu, count: r.cnt, people: r.people, avg: Number(r.avg),
    }));
    return { ok: true, list };
  } catch (_) { /* 폴백 */ }
  return await guRankingSlow(b);
}

async function guRankingSlow(b: any) {
  const data = await fetchAllRows(() => rangeFilter(
    db.from("challenge_log").select("user_id, users(type,gu)"), b));

  const map = new Map<string, { gu: string; count: number; users: Set<string> }>();
  for (const row of data) {
    const u = row.users ?? {};
    if (u.type !== "교구" || !u.gu) continue; // 교구 소속만(교회학교 제외)
    const e = map.get(u.gu) ?? { gu: u.gu, count: 0, users: new Set<string>() };
    e.count++;
    e.users.add(row.user_id);
    map.set(u.gu, e);
  }
  const list = [...map.values()]
    .map((e) => ({
      gu: e.gu,
      count: e.count,
      people: e.users.size,
      avg: Math.round((e.count / e.users.size) * 10) / 10,
    }))
    .sort((a, b) => b.count - a.count)
    .map((x, i) => ({ rank: i + 1, ...x }));
  return { ok: true, list };
}

// ---------- mydays: 본인 일자별 참여 횟수(암송·도전·복습 전부) ----------
async function mydays(b: any) {
  try {
    const { data, error } = await db.rpc("v2_mydays", {
      p_user: String(b.user_id || ""), p_from: b.from || "", p_to: b.to || "",
    });
    if (error) throw error;
    const days: Record<string, number> = {};
    for (const r of (data ?? []) as any[]) days[String(r.day)] = r.cnt;
    return { ok: true, days };
  } catch (_) { /* 폴백 */ }
  return await mydaysSlow(b);
}

async function mydaysSlow(b: any) {
  const data = await fetchAllRows(() => rangeFilter(
    db.from("challenge_log").select("created_at, mode").eq("user_id", b.user_id), b));
  const days: Record<string, number> = {};
  for (const row of data) {
    const k = kstDay(row.created_at);
    days[k] = (days[k] || 0) + 1;
  }
  return { ok: true, days };
}

// ---------- verseCounts: 본인 구절별 암송 횟수(암송·도전·복습 전부) ----------
async function verseCounts(b: any) {
  // verse_no가 null인 로그(핵심 암송 학습)는 구절별 집계에서 제외한다.
  const data = await fetchAllRows(() =>
    db.from("challenge_log").select("verse_no").eq("user_id", b.user_id).not("verse_no", "is", null));
  const counts: Record<number, number> = {};
  for (const row of data) {
    counts[row.verse_no] = (counts[row.verse_no] || 0) + 1;
  }
  return { ok: true, counts };
}

// ============================================================
// 관리자 통계 (learn-* = 학습 통과 활동 기준, v1 '진행기록' 탭에 대응)
// ============================================================

// ---------- stats: 기간별 사용현황 (구분·소속별) ----------
async function stats(b: any) {
  const err = adminError(b); if (err) return { ok: false, error: err };
  // 빠른 경로: DB 집계 RPC (미설치 시 아래 기존 방식으로 폴백)
  try {
    const { data, error } = await db.rpc("v2_stats", { p_from: b.from || "", p_to: b.to || "" });
    if (error) throw error;
    const list = ((data ?? []) as any[])
      .map((r) => ({ gubun: r.gubun, sosok: r.sosok, newCount: r.new_count, participants: r.participants, typing: r.typing, voice: r.voice, card: r.card ?? 0, total: r.total }))
      .sort((a, b) => (a.gubun === b.gubun ? String(a.sosok).localeCompare(b.sosok) : String(a.gubun).localeCompare(b.gubun)));
    return { ok: true, list };
  } catch (_) { /* RPC 미설치 → 폴백 */ }
  return await statsSlow(b);
}

async function statsSlow(b: any) {
  const data = await fetchAllRows(() => rangeFilter(
    db.from("challenge_log").select("user_id, mode, users(type,gu,bu)"), b));

  const g = new Map<string, any>();
  const seen = new Map<string, Set<string>>(); // group → set(user_id)
  for (const row of data) {
    const u = row.users ?? {};
    const gubun = u.type, sosok = u.gu || u.bu || "";
    const key = gubun + "|" + sosok;
    const e = g.get(key) ?? { gubun, sosok, newCount: 0, participants: 0, typing: 0, voice: 0, card: 0, total: 0 };
    e.total++;
    if (String(row.mode).includes("typing")) e.typing++;
    if (String(row.mode).endsWith("card")) e.card++;   // 카드는 타이핑 안에 든 수
    if (String(row.mode).includes("voice")) e.voice++;
    g.set(key, e);
    if (!seen.has(key)) seen.set(key, new Set());
    seen.get(key)!.add(row.user_id);
  }
  for (const [key, e] of g) e.participants = seen.get(key)!.size;

  // 신규 인원(기간 내 가입) — 구분·소속별
  let uq = db.from("users").select("type,gu,bu,created_at");
  if (b.from) uq = uq.gte("created_at", `${b.from}T00:00:00${KST}`);
  if (b.to)   uq = uq.lte("created_at", `${b.to}T23:59:59${KST}`);
  const { data: newUsers } = await uq;
  for (const u of (newUsers ?? []) as any[]) {
    const key = u.type + "|" + (u.gu || u.bu || "");
    const e = g.get(key) ?? { gubun: u.type, sosok: u.gu || u.bu || "", newCount: 0, participants: 0, typing: 0, voice: 0, card: 0, total: 0 };
    e.newCount++;
    g.set(key, e);
  }

  const list = [...g.values()].sort((a, b) =>
    a.gubun === b.gubun ? a.sosok.localeCompare(b.sosok) : a.gubun.localeCompare(b.gubun));
  return { ok: true, list };
}

// ---------- participants: 참여자별 현황 ----------
async function participants(b: any) {
  const err = adminError(b); if (err) return { ok: false, error: err };
  try {
    const { data, error } = await db.rpc("v2_participants", { p_from: b.from || "", p_to: b.to || "", p_gubun: b.gubun || "" });
    if (error) throw error;
    const list = ((data ?? []) as any[]).map((r) => ({ gubun: r.gubun, sosok: r.sosok, sebu: r.sebu, name: r.name, typing: r.typing, voice: r.voice, card: r.card ?? 0, total: r.total, days: r.days, isNew: r.is_new }));
    return { ok: true, list };
  } catch (_) { /* 폴백 */ }
  return await participantsSlow(b);
}

async function participantsSlow(b: any) {
  const data = await fetchAllRows(() => rangeFilter(
    db.from("challenge_log").select("user_id, mode, users(type,gu,mok,bu,grade,name)"), b));

  const map = new Map<string, any>();
  for (const row of data) {
    const u = row.users ?? {};
    const e = map.get(row.user_id) ?? {
      gubun: u.type, sosok: u.gu || u.bu || "", sebu: u.mok || u.grade || "",
      name: u.name, typing: 0, voice: 0, card: 0, total: 0,
    };
    e.total++;
    if (String(row.mode).includes("typing")) e.typing++;
    if (String(row.mode).endsWith("card")) e.card++;   // 카드는 타이핑 안에 든 수
    if (String(row.mode).includes("voice")) e.voice++;
    map.set(row.user_id, e);
  }
  let list = [...map.values()];
  if (b.gubun && b.gubun !== "전체") list = list.filter((x) => x.gubun === b.gubun);
  list.sort((a, b) => b.total - a.total);
  return { ok: true, list };
}

// ---------- 조회(MCP 학습용) ----------
// 이름으로 성도 등록 여부·소속 조회
async function findMember(b: any) {
  const err = adminError(b); if (err) return { ok: false, error: err };
  const name = norm(b.name);
  if (!name) return { ok: false, error: "name 필요" };
  // 한글 이름은 NFC/NFD 정규화 차이로 ilike가 어긋날 수 있어 전체를 받아 JS에서 정규화 비교
  const q = name.normalize("NFC");
  const data = await fetchAllRows(() => db.from("users").select("id, name, identity_key"));
  const members = data
    .filter((u: any) => String(u.name || "").normalize("NFC").includes(q))
    .map((u: any) => {
      const [type, gu, mok, bu, grade] = String(u.identity_key || "").split("|");
      return {
        id: u.id, name: u.name || "", gubun: type,
        sosok: type === "교구" ? `${gu || ""}교구 ${mok || ""}목장` : `${bu || ""} ${grade || ""}`.trim(),
      };
    });
  return { ok: true, count: members.length, members };
}

// 특정 성도의 최근 N일 참여(암송·도전 횟수, 참여일수)
async function memberParticipation(b: any) {
  const err = adminError(b); if (err) return { ok: false, error: err };
  if (!b.user_id) return { ok: false, error: "user_id 필요" };
  const days = Number(b.days || 7);
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { data, error } = await db.from("challenge_log")
    .select("mode, created_at").eq("user_id", b.user_id).gte("created_at", since);
  if (error) return { ok: false, error: error.message };
  const rows = (data ?? []) as any[];
  const learn = rows.filter((r) => String(r.mode).startsWith("learn-")).length;
  const activeDays = new Set(rows.map((r) => kstDay(r.created_at))).size;
  return { ok: true, days, total: rows.length, learn, challenge: rows.length - learn, activeDays };
}

// ---------- verses: 구절별 현황 ----------
async function verseStats(b: any) {
  const err = adminError(b); if (err) return { ok: false, error: err };
  try {
    const { data, error } = await db.rpc("v2_verse_stats", { p_from: b.from || "", p_to: b.to || "" });
    if (error) throw error;
    const list = ((data ?? []) as any[]).map((r) => ({ no: r.no, participants: r.participants, count: r.cnt }));
    return { ok: true, list };
  } catch (_) { /* 폴백 */ }
  return await verseStatsSlow(b);
}

async function verseStatsSlow(b: any) {
  // verse_no가 null인 로그(핵심 암송 학습)는 구절별 집계에서 제외한다.
  const data = await fetchAllRows(() => rangeFilter(
    db.from("challenge_log").select("verse_no, mode, user_id").not("verse_no", "is", null), b));

  const map = new Map<number, any>();
  const seen = new Map<number, Set<string>>();
  for (const row of data) {
    const e = map.get(row.verse_no) ?? { no: row.verse_no, participants: 0, count: 0 };
    e.count++;
    map.set(row.verse_no, e);
    if (!seen.has(row.verse_no)) seen.set(row.verse_no, new Set());
    seen.get(row.verse_no)!.add(row.user_id);
  }
  for (const [no, e] of map) e.participants = seen.get(no)!.size;
  const list = [...map.values()].sort((a, b) => a.no - b.no);
  return { ok: true, list };
}

// ---------- blessingUsage: 가정 축복 기도문 사용현황 ----------
//   blessing_log(user_id,day,no,cnt) 는 「한 사람이 하루에 한 편을 여러 번 봐도 한 행」이라
//   challenge_log 보다 훨씬 작다 — RPC 없이 fetchAllRows + JS 집계로 충분하다.
//   ⚠️ 표(blessing_log.sql)를 아직 안 돌린 판(예: 성도님께 열기 전 개발 DB)에서도
//      죽지 않고 빈 결과를 낸다 — 관리자가 "기록 없음"으로 보게, 오류로 보지 않게.
async function blessingUsage(b: any) {
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

// ---------- weeklyReport: 주간 리포트 자동 발송용 요약 + CSV ----------
const DAY_MS = 24 * 60 * 60 * 1000;

function kstDateOnly(d: Date) {
  const kst = new Date(d.getTime() + 9 * 3600 * 1000);
  return new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()));
}

function defaultWeeklyRange(now = new Date()) {
  // 집계 기준: 전주 금요일 ~ 이번주 목요일 (금요일 오전 발송 기준, 총 7일)
  const today = kstDateOnly(now);
  const dow = today.getUTCDay();                       // 0=일 ~ 6=토
  const daysBack = ((dow - 4 + 7) % 7) || 7;           // 직전 '목요일'까지 (오늘이 목요일이면 지난주 목요일)
  const to = new Date(today.getTime() - daysBack * DAY_MS);   // 이번주 목요일
  const from = new Date(to.getTime() - 6 * DAY_MS);           // 전주 금요일
  return { from: ymd(from), to: ymd(to) };
}

const num = (n: unknown) => Number(n ?? 0).toLocaleString("ko-KR");
const pct = (n: number, d: number) => d ? `${Math.round((n / d) * 100)}%` : "0%";

function csvCell(v: unknown) {
  const s = String(v ?? "");
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csvLine(row: unknown[]) {
  return row.map(csvCell).join(",");
}

function verseReportLabel(v: any) {
  return [v?.ref_short || v?.ref_full || v?.ref || (v?.no ? `No.${v.no}` : ""), v?.sermon_title]
    .filter(Boolean).join(" · ");
}

async function verseLabelMap() {
  const { data, error } = await db.from("verses")
    .select("no,ref_short,ref_full,ref,sermon_title");
  if (error) throw error;
  const map = new Map<number, string>();
  for (const v of (data ?? []) as any[]) map.set(Number(v.no), verseReportLabel(v));
  return map;
}

function buildWeeklyCsv(report: any) {
  const lines: string[] = [];
  const add = (row: unknown[] = []) => lines.push(csvLine(row));
  add(["성경암송 주간 리포트", `${report.from} ~ ${report.to}`]);
  add();
  add(["요약"]);
  add(["신규인원", "학습참여자", "학습횟수", "타이핑", "음성", "도전참여자", "도전횟수", "사용구절"]);
  add([
    report.summary.newUsers,
    report.summary.learners,
    report.summary.learnTotal,
    report.summary.learnTyping,
    report.summary.learnVoice,
    report.summary.challengeUsers,
    report.summary.challengeTotal,
    report.summary.verseCount,
  ]);
  add();
  add(["소속별 사용현황"]);
  add(["구분", "교구/교회학교", "신규인원", "참여인원", "타이핑횟수", "음성횟수", "총횟수"]);
  for (const r of report.usage) add([r.gubun, r.sosok, r.newCount, r.participants, r.typing, r.voice, r.total]);
  add();
  add(["참여자 전체"]);
  add(["순위", "구분", "교구/교회학교", "목장/학년", "성명", "신규여부", "참여일수", "타이핑횟수", "음성횟수", "총횟수"]);
  report.participants.forEach((r: any, i: number) =>
    add([i + 1, r.gubun, r.sosok, r.sebu, r.name, r.isNew ? "신규" : "", r.days ?? 0, r.typing, r.voice, r.total]));
  add();
  add(["구절별 현황"]);
  add(["말씀순번", "말씀", "참여자", "참여횟수"]);
  for (const r of report.verses) add([r.no, r.label, r.participants, r.count]);
  add();
  add(["도전 전체"]);
  add(["순위", "구분", "교구/교회학교", "목장/학년", "성명", "타이핑", "음성", "도전횟수"]);
  report.challenge.forEach((r: any, i: number) =>
    add([i + 1, r.gubun, r.sosok, r.sebu, r.name, r.typing, r.voice, r.count]));
  return "\uFEFF" + lines.join("\n");
}

function buildWeeklyText(report: any) {
  const s = report.summary;
  const topGroups = report.usage
    .slice().sort((a: any, b: any) => b.total - a.total).slice(0, 5)
    .map((r: any, i: number) => `${i + 1}. ${r.sosok || r.gubun}: ${num(r.total)}회/${num(r.participants)}명`);
  const topPeople = report.topParticipants.slice(0, 5)
    .map((r: any, i: number) => `${i + 1}. ${r.name}(${r.sosok || r.gubun}) ${num(r.total)}회`);
  const topVerses = report.verses.slice().sort((a: any, b: any) => b.count - a.count).slice(0, 5)
    .map((r: any, i: number) => `${i + 1}. ${r.label || `No.${r.no}`} ${num(r.count)}회`);

  return [
    `[성경암송 주간 리포트]`,
    `${report.from} ~ ${report.to}`,
    "",
    `신규 ${num(s.newUsers)}명 · 학습참여 ${num(s.learners)}명 · 학습 ${num(s.learnTotal)}회`,
    `타이핑 ${num(s.learnTyping)}회(${pct(s.learnTyping, s.learnTotal)}) · 음성 ${num(s.learnVoice)}회(${pct(s.learnVoice, s.learnTotal)})`,
    `도전참여 ${num(s.challengeUsers)}명 · 도전 ${num(s.challengeTotal)}회 · 사용구절 ${num(s.verseCount)}개`,
    "",
    "소속 TOP",
    ...(topGroups.length ? topGroups : ["기록 없음"]),
    "",
    "참여자 TOP",
    ...(topPeople.length ? topPeople : ["기록 없음"]),
    "",
    "구절 TOP",
    ...(topVerses.length ? topVerses : ["기록 없음"]),
  ].join("\n");
}

// 발송(토요일) 기준: 지난 토요일 ~ 어제(금요일) = 최근 완료된 7일(토~금)
const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"];
function reportWeekRange(now = new Date()) {
  // 집계 기준: 전주 금요일 ~ 이번주 목요일 (금요일 오전 발송 기준, 총 7일)
  const today = kstDateOnly(now);
  const dow = today.getUTCDay(); // 0=Sun..6=Sat
  const daysBack = ((dow - 4 + 7) % 7) || 7; // 직전 '목요일'까지 (오늘이 목요일이면 지난주 목요일)
  const to = new Date(today.getTime() - daysBack * DAY_MS); // 이번주 목요일
  const from = new Date(to.getTime() - 6 * DAY_MS);         // 전주 금요일
  return { from: ymd(from), to: ymd(to) };
}

function esc(s: unknown) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// 핵심 요약 HTML 이메일 (KPI + 말씀 + 일자별/주차별 그래프 + 참여자 TOP 10 + 관리자 링크)
function buildWeeklyHtml(
  report: any,
  verse: { ref: string; text: string } | null,
  daily: { date: string; count: number }[],
  weekly: { from: string; to: string; count: number; newCount: number }[],
) {
  const C_PART = "#3a6ea5", C_NEW = "#b5891f"; // 데이터시각화 검증 통과 팔레트(참여/신규)
  const s = report.summary;
  const top = report.participants; // 전체 참여자(인원이 적어 전부 표시)
  const th = "padding:7px 8px;border-bottom:2px solid #e3e8f2;font-size:12px;color:#5c6a80;text-align:center;font-weight:700";
  const headRow = `<tr style="background:#f5f7fb">
    <td style="${th};width:30px">#</td>
    <td style="${th};text-align:left">이름</td>
    <td style="${th};width:44px">신규</td>
    <td style="${th};width:52px">참여일</td>
    <td style="${th};width:56px">총횟수</td>
  </tr>`;
  const rows = top.length
    ? headRow + top.map((r: any, i: number) => `
        <tr>
          <td style="padding:8px 8px;border-bottom:1px solid #eef1f8;font-weight:700;color:#1a3a6b;text-align:center">${i + 1}</td>
          <td style="padding:8px 8px;border-bottom:1px solid #eef1f8">${esc(r.name)} <span style="color:#8a93a5;font-size:12px">${esc(r.sosok || r.gubun || "")}</span></td>
          <td style="padding:8px 8px;border-bottom:1px solid #eef1f8;text-align:center">${r.isNew ? '<span style="background:#e9f2ff;color:#1a3a6b;font-size:11px;font-weight:800;padding:1px 6px;border-radius:8px">신규</span>' : ''}</td>
          <td style="padding:8px 8px;border-bottom:1px solid #eef1f8;text-align:center">${num(r.days || 0)}일</td>
          <td style="padding:8px 8px;border-bottom:1px solid #eef1f8;text-align:right;font-weight:700">${num(r.total)}회</td>
        </tr>`).join("")
    : `<tr><td colspan="5" style="padding:14px;text-align:center;color:#8a93a5">이번 주 기록이 아직 없습니다.</td></tr>`;

  // 가로 막대그래프(이메일 안전: table 배경색 셀)
  const barRows = (items: { label: string; count: number }[], color: string) => {
    const max = Math.max(1, ...items.map((x) => x.count));
    return items.map((x) => {
      const w = Math.round((x.count / max) * 100);
      const bar = w > 0
        ? `<td width="${w}%" style="background:${color};height:15px;border-radius:8px;font-size:0;line-height:15px">&nbsp;</td><td style="font-size:0;line-height:15px"></td>`
        : `<td style="font-size:0;line-height:15px"></td>`;
      return `<tr>
        <td style="padding:3px 8px 3px 0;font-size:12px;color:#5c6a80;white-space:nowrap;width:84px">${esc(x.label)}</td>
        <td style="padding:3px 0">
          <table cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse"><tr>${bar}</tr></table>
        </td>
        <td style="padding:3px 0 3px 8px;font-size:13px;font-weight:700;color:#20304a;text-align:right;width:32px">${num(x.count)}</td>
      </tr>`;
    }).join("");
  };
  const heading = (t: string) => `<div style="font-size:13.5px;font-weight:800;color:#1a3a6b;margin:0 0 9px;padding-left:9px;border-left:3px solid ${C_NEW}">${t}</div>`;
  const chart = (title: string, rowsHtml: string) =>
    `${heading(title)}<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:22px">${rowsHtml}</table>`;

  const dLabel = (dstr: string) => {
    const d = new Date(dstr + "T00:00:00Z");
    return `${WEEKDAY_KO[d.getUTCDay()]} ${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
  };
  const md = (dstr: string) => { const d = new Date(dstr + "T00:00:00Z"); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`; };
  const dailyRows = barRows(daily.map((x) => ({ label: dLabel(x.date), count: x.count })), C_PART);
  // 주차별 누적 막대: 참여인원 = 신규(금색) + 기존(파랑)
  // 데이터 있는 주만 표시(앞쪽 빈 주 제외)
  const wkShow = weekly.filter((x) => x.count > 0);
  const wkList = wkShow.length ? wkShow : weekly.slice(-4);
  const weeklyTitle = `📈 주차별 참여 · 신규 참여자 (최근 ${wkList.length}주)`;
  const wkMax = Math.max(1, ...wkList.map((x) => x.count));
  const weeklyRows = wkList.map((x) => {
    const totalW = Math.round((x.count / wkMax) * 100);
    const newW = x.count > 0 ? Math.min(totalW, Math.round((x.newCount / x.count) * totalW)) : 0;
    const oldW = Math.max(0, totalW - newW);
    const cell = (w: number, color: string, radius: string) => w > 0 ? `<td width="${w}%" style="background:${color};height:14px;font-size:0;line-height:14px;border-radius:${radius}">&nbsp;</td>` : "";
    const gap = (newW > 0 && oldW > 0) ? `<td width="1" style="font-size:0;background:#fff">&nbsp;</td>` : "";
    const bars = `${cell(newW, C_NEW, oldW ? "7px 0 0 7px" : "7px")}${gap}${cell(oldW, C_PART, newW ? "0 7px 7px 0" : "7px")}${totalW < 100 ? '<td style="font-size:0"></td>' : ""}`;
    return `<tr>
      <td style="padding:5px 8px 5px 0;font-size:12px;color:#5c6a80;white-space:nowrap;width:74px">${esc(`${md(x.from)}~${md(x.to)}`)}</td>
      <td style="padding:4px 0"><table cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse"><tr>${bars}</tr></table></td>
      <td style="padding:4px 0 4px 8px;text-align:right;white-space:nowrap;width:76px;font-size:13px;font-weight:800"><span style="color:${C_PART}">${num(x.count)}</span> <span style="color:#b0b8c4">/</span> <span style="color:${C_NEW}">${num(x.newCount)}</span></td>
    </tr>`;
  }).join("");
  const weeklyLegend = `<div style="margin:0 0 9px;font-size:11.5px;color:#5c6a80">
    <span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${C_NEW};vertical-align:middle;margin-right:4px"></span>신규 참여자&nbsp;&nbsp;<span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${C_PART};vertical-align:middle;margin-right:4px"></span>기존 참여<span style="color:#9aa4b4">&nbsp;(막대 = 참여인원)</span></div>`;

  const verseBlock = verse
    ? `<div style="background:#fdf9ef;border:1px solid #e7d9ad;border-radius:10px;padding:14px 16px;margin:0 0 18px">
         <div style="font-size:12px;color:#9a7b28;font-weight:700;margin-bottom:5px">이번 주 말씀</div>
         <div style="color:#20304a;line-height:1.7">${esc(verse.text)}${verse.ref ? ` <b style="color:#1a3a6b">(${esc(verse.ref)})</b>` : ""}</div>
       </div>` : "";

  // admin 대시보드 카드 스타일(좌측 컬러 액센트 바 + 아이콘 + 큰 숫자)
  const kpi = (icon: string, label: string, val: string, acc: string, w = "25%") => `
    <td width="${w}" valign="top" style="padding:4px">
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;background:#fff;border:1px solid #e3e8f0;border-radius:12px;box-shadow:0 2px 8px rgba(26,58,107,.05)">
        <tr>
          <td width="5" style="background:${acc};border-radius:12px 0 0 12px;font-size:0;line-height:0">&nbsp;</td>
          <td style="padding:10px 11px">
            <div style="font-size:11px;color:#6a7688;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${icon} ${label}</div>
            <div style="font-size:21px;font-weight:800;color:#1a3a6b;text-align:right;margin-top:7px">${val}</div>
          </td>
        </tr>
      </table>
    </td>`;

  return `<div style="background:#eef1f6;padding:22px 12px;font-family:'Noto Sans KR',AppleSDGothicNeo,sans-serif">
    <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden">
      <div style="background:#1a3a6b;color:#ffffff;padding:20px 22px;border-bottom:3px solid ${C_NEW}">
        <div style="font-size:18px;font-weight:800;letter-spacing:.3px;color:#ffffff">📖 성경암송 주간 리포트</div>
        <div style="font-size:12px;color:#ffffff;opacity:.85;margin-top:4px">${report.from} ~ ${report.to} · 고척교회 제자양육부 신앙운동팀</div>
      </div>
      <div style="padding:20px">
        ${verseBlock}
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:22px"><tr>
          ${kpi("🌱", "신규 참여자", num(s.newUsers) + "명", C_NEW, "25%")}
          ${kpi("👥", "주간 참여자", num(s.learners) + "명", "#2b5fb0", "25%")}
          ${kpi("🏆", "누적 참여자", num(s.cumParticipants) + "명", "#7a5bb0", "25%")}
          ${kpi("📖", "주간 활동", num(s.learnTotal) + "회", "#2f6b4f", "25%")}
        </tr></table>
        ${chart("📅 일자별 참여 인원", dailyRows)}
        ${heading(weeklyTitle)}${weeklyLegend}
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:22px">${weeklyRows}</table>
        <div style="font-size:13px;font-weight:800;color:#1a3a6b;margin:0 0 6px">🙌 참여자 전체 (${num(report.participants.length)}명)</div>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #eef1f8;border-radius:8px;font-size:14px">
          ${rows}
        </table>
        <div style="text-align:center;margin:22px 0 4px">
          <a href="https://gocheok.onlybible.kr/admin.html" style="display:inline-block;background:#1a3a6b;color:#fff;text-decoration:none;font-weight:700;padding:11px 22px;border-radius:22px;font-size:14px">📊 관리자 페이지에서 자세히 보기</a>
        </div>
      </div>
      <div style="background:#f4f6fb;color:#8a93a5;font-size:11px;text-align:center;padding:12px">
        성경암송 앱에서 매주 자동 발송됩니다 · gocheok.onlybible.kr
      </div>
    </div>
  </div>`;
}

// Resend로 이메일 발송 (RESEND_API_KEY / REPORT_RECIPIENTS / REPORT_FROM 시크릿 필요)
async function sendEmailResend(subject: string, html: string, text: string, extra?: string) {
  const key = Deno.env.get("RESEND_API_KEY");
  const base = (Deno.env.get("REPORT_RECIPIENTS") || "").split(",").map((x) => x.trim()).filter(Boolean);
  const extras = String(extra || "").split(",").map((x) => x.trim()).filter(Boolean);
  const recipients = [...new Set([...base, ...extras])].filter((e) => /.+@.+\..+/.test(e));
  const from = Deno.env.get("REPORT_FROM") || "성경암송 리포트 <onboarding@resend.dev>";
  if (!key) return { ok: false, error: "no-resend-key" };
  if (!recipients.length) return { ok: false, error: "no-recipients" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: recipients, subject, html, text }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: `resend:${res.status}`, detail: j };
  return { ok: true, id: (j as any).id, recipients: recipients.length };
}

async function weeklyReport(b: any) {
  const err = adminError(b); if (err) return { ok: false, error: err };
  const range = b.from || b.to ? { from: b.from || "", to: b.to || "" } : reportWeekRange();
  const q = { ...b, from: range.from, to: range.to };

  const [usageRes, participantsRes, versesRes, challengeRes, labels, verse] = await Promise.all([
    stats(q),
    participants(q),
    verseStats(q),
    ranking({ from: range.from, to: range.to }),
    verseLabelMap(),
    latestVerse(),
  ]);

  if (!usageRes.ok) return usageRes;
  if (!participantsRes.ok) return participantsRes;
  if (!versesRes.ok) return versesRes;

  const usage = usageRes.list ?? [];
  const participantsList = participantsRes.list ?? [];
  const verses = (versesRes.list ?? []).map((r: any) => ({
    ...r,
    label: labels.get(Number(r.no)) || `No.${r.no}`,
  }));
  const challenge = challengeRes.list ?? [];

  const usageTotal = usage.reduce((a: any, r: any) => ({
    newUsers: a.newUsers + (r.newCount || 0),
    learners: a.learners + (r.participants || 0),
    learnTyping: a.learnTyping + (r.typing || 0),
    learnVoice: a.learnVoice + (r.voice || 0),
    learnTotal: a.learnTotal + (r.total || 0),
  }), { newUsers: 0, learners: 0, learnTyping: 0, learnVoice: 0, learnTotal: 0 });
  const challengeTotal = challenge.reduce((sum: number, r: any) => sum + (r.count || 0), 0);
  // 누적 참여자(전체 기간 동안 암송한 총 인원, 중복 제거)
  const cumRes: any = await stats({ pw: b.pw, [SUPER_OK]: true, from: "", to: "" });   // weeklyReport 는 믿는 기계 호출 → 내부 stats 에 총괄 표를 넘긴다
  const cumParticipants = cumRes.ok ? (cumRes.list || []).reduce((sm: number, x: any) => sm + (x.participants || 0), 0) : 0;

  const sortedParticipants = participantsList.slice().sort((a: any, b: any) => b.total - a.total);
  const sortedChallenge = challenge.slice().sort((a: any, b: any) => b.count - a.count);

  const report = {
    from: range.from,
    to: range.to,
    summary: {
      ...usageTotal,
      cumParticipants,
      challengeUsers: challenge.length,
      challengeTotal,
      verseCount: verses.length,
    },
    usage,
    participants: sortedParticipants,
    topParticipants: sortedParticipants.slice(0, 30),
    verses,
    challenge: sortedChallenge,
    topChallenge: sortedChallenge.slice(0, 30),
  };

  // 일자별/주차별 참여 인원 (최근 8주 활동을 1회 조회 후 버킷팅)
  const WEEKS = 8;
  const satMs = Date.parse(range.from + "T00:00:00Z");
  const weekStart0 = new Date(satMs - (WEEKS - 1) * 7 * DAY_MS);
  // 8주 추이 원본 조회 — 1000행 제한 회피 위해 전체 페이지네이션(모든 기록 포함)
  const acts: any[] = [];
  {
    const gte = `${ymd(weekStart0)}T00:00:00${KST}`;
    const lte = `${range.to}T23:59:59${KST}`;
    const PAGE = 1000;
    for (let off = 0; ; off += PAGE) {
      const { data, error } = await db.from("challenge_log")
        .select("user_id, created_at")
        .gte("created_at", gte).lte("created_at", lte)
        .order("created_at", { ascending: true })
        .range(off, off + PAGE - 1);
      if (error) break;
      acts.push(...(data ?? []));
      if (!data || data.length < PAGE) break;
    }
  }
  const weekBuckets = Array.from({ length: WEEKS }, (_, w) => {
    const ws = new Date(satMs - (WEEKS - 1 - w) * 7 * DAY_MS);
    return { from: ymd(ws), to: ymd(new Date(ws.getTime() + 6 * DAY_MS)), set: new Set<string>() };
  });
  const dayBuckets = Array.from({ length: 7 }, (_, d) => ({
    date: ymd(new Date(satMs + d * DAY_MS)), set: new Set<string>(),
  }));
  for (const r of (acts ?? []) as any[]) {
    const d = kstDay(r.created_at);
    for (const wk of weekBuckets) { if (d >= wk.from && d <= wk.to) { wk.set.add(r.user_id); break; } }
    const db2 = dayBuckets.find((x) => x.date === d);
    if (db2) db2.set.add(r.user_id);
  }
  const daily = dayBuckets.map((x) => ({ date: x.date, count: x.set.size }));
  // 주차별 신규 유입(첫 암송이 그 주에 속하는 인원) — stats RPC 재사용
  const weekNew = await Promise.all(weekBuckets.map(async (wk) => {
    const r: any = await stats({ pw: b.pw, [SUPER_OK]: true, from: wk.from, to: wk.to }); // 믿는 기계 호출 — 총괄 표를 넘긴다(pw+권한)
    return r.ok ? (r.list || []).reduce((sum: number, x: any) => sum + (x.newCount || 0), 0) : 0;
  }));
  const weekly = weekBuckets.map((x, i) => ({ from: x.from, to: x.to, count: x.set.size, newCount: weekNew[i] }));

  const html = buildWeeklyHtml(report, verse, daily, weekly);
  const text = buildWeeklyText(report);
  const subject = `📖 성경암송 주간 리포트 (${range.from} ~ ${range.to})`;

  // send=true → 실제 발송(cron·관리자). 아니면 미리보기 데이터 반환.
  if (b.send) {
    const sent = await sendEmailResend(subject, html, text, b.extra);
    return { ok: sent.ok, sent, range, subject };
  }
  return { ok: true, report, html, text, csv: buildWeeklyCsv(report), subject };
}

// ---------- 말씀 이벤트: 응모 기록(회차당 1인 1응모) ----------
// 진행 중 상태는 저장하지 않는다 — 중도 이탈 시 처음부터 다시 하는 설계.
async function eventEnter(b: any) {
  const eventId = String(b.event_id || "");
  const userId = String(b.user_id || "");
  if (!eventId || !userId) return { ok: false, error: "event_id/user_id 필요" };

  // 이미 응모했으면 최초 시각을 그대로 돌려준다(재도전해도 기록은 하나).
  const { data: exist } = await db.from("event_entries")
    .select("entered_at").eq("event_id", eventId).eq("user_id", userId).maybeSingle();
  if (exist) return { ok: true, entered_at: exist.entered_at };

  const enteredAt = new Date().toISOString();
  const { error } = await db.from("event_entries")
    .insert({ event_id: eventId, user_id: userId, entered_at: enteredAt });
  // 동시 요청으로 PK 충돌(23505)이면 이미 응모된 것이므로 성공으로 본다.
  if (error && (error as any).code !== "23505") throw error;
  return { ok: true, entered_at: enteredAt };
}

async function eventStatus(b: any) {
  const eventId = String(b.event_id || "");
  const userId = String(b.user_id || "");
  if (!eventId || !userId) return { ok: true, entered: false, entered_at: null };
  const { data } = await db.from("event_entries")
    .select("entered_at").eq("event_id", eventId).eq("user_id", userId).maybeSingle();
  return { ok: true, entered: !!data, entered_at: data?.entered_at ?? null };
}

// 성도 공개용 이벤트 현황 — 전체 인원 + 소속별 집계 + 참여자 명단(최신순).
// eventEntrants(관리자 전용)와 달리 비밀번호 없이 누구나 조회 가능하다.
async function eventBoard(b: any) {
  const eventId = String(b.event_id || "");
  if (!eventId) return { ok: false, error: "event_id 필요" };
  const { data, error } = await db.from("event_entries")
    .select("user_id, entered_at")
    .eq("event_id", eventId)
    .order("entered_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as any[];
  // event_entries.user_id는 users.id를 참조하는 FK가 없어(스키마상 text) PostgREST의
  // 암묵적 임베드(users(...))로는 조인이 안 된다 — users를 따로 조회해 메모리에서 매칭.
  const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
  const umap = new Map<string, any>();
  if (userIds.length) {
    const { data: users, error: uerr } = await db.from("users")
      .select("id,type,gu,mok,bu,grade,name").in("id", userIds);
    if (uerr) throw uerr;
    (users ?? []).forEach((u: any) => umap.set(u.id, u));
  }
  const groupMap = new Map<string, number>();
  const list = rows.map((r) => {
    const u = umap.get(r.user_id) ?? {};
    const sosok = u.gu || u.bu || "";
    if (sosok) groupMap.set(sosok, (groupMap.get(sosok) ?? 0) + 1);
    return {
      name: u.name ?? "",
      gubun: u.type ?? "",
      sosok,
      sebu: u.mok || u.grade || "",
      entered_at: r.entered_at,
    };
  });
  const groups = [...groupMap.entries()]
    .map(([sosok, count]) => ({ sosok, count }))
    .sort((a, b) => b.count - a.count)
    .map((x, i) => ({ rank: i + 1, ...x }));
  return { ok: true, total: list.length, groups, list };
}

async function eventEntrants(b: any) {
  const err = adminError(b); if (err) return { ok: false, error: err };
  const eventId = String(b.event_id || "");
  if (!eventId) return { ok: false, error: "event_id 필요" };
  const { data, error } = await db.from("event_entries")
    .select("user_id, entered_at")
    .eq("event_id", eventId)
    .order("entered_at", { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as any[];
  // eventBoard와 같은 이유 — event_entries.user_id는 users.id를 참조하는 FK가 없어서
  // (스키마상 text) PostgREST의 암묵적 임베드 users(...)가 통하지 않는다.
  // 그대로 두면 "Could not find a relationship between 'event_entries' and 'users'"가 난다.
  // users를 따로 조회해 메모리에서 맞춘다.
  const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
  const umap = new Map<string, any>();
  if (userIds.length) {
    const { data: users, error: uerr } = await db.from("users")
      .select("id,type,gu,mok,bu,grade,name").in("id", userIds);
    if (uerr) throw uerr;
    (users ?? []).forEach((u: any) => umap.set(u.id, u));
  }
  // user_id는 돌려주지 않는다 — 이 API는 JWT가 없어 남의 user_id가 새면 그 사람 행세가 된다.
  const list = rows.map((r) => {
    const u = umap.get(r.user_id) ?? {};
    return {
      gubun: u.type ?? "",
      sosok: u.gu || u.bu || "",
      sebu: u.mok || u.grade || "",
      name: u.name ?? "",
      entered_at: r.entered_at,
    };
  });
  return { ok: true, list };
}

// ============================================================
// 성경필사 노트 신청
//   한 성도가 여러 번 신청할 수 있어 신청 한 건이 한 행이다.
//   화면에는 늘 가장 최근 한 건만 보여 준다.
//   고치거나 취소하는 것은 '신청완료' 단계에서만 허용한다 —
//   그 뒤로는 이미 만들고 있으므로 담당자를 거쳐야 한다.
// ============================================================
const PILSA_STATUS = ["신청완료", "준비중", "준비완료", "배부완료"];
const PILSA_MAX = 5;                     // 한 분당 총 부수 상한
const PILSA_PHONE_RE = /^01[016-9]-?[0-9]{3,4}-?[0-9]{4}$/;

// 010-1234-5678 꼴로 통일 — 명단에서 전화 걸기 좋게
function pilsaPhone(v: unknown): string {
  const d = String(v ?? "").replace(/[^0-9]/g, "");
  if (d.length === 11) return d.slice(0, 3) + "-" + d.slice(3, 7) + "-" + d.slice(7);
  if (d.length === 10) return d.slice(0, 3) + "-" + d.slice(3, 6) + "-" + d.slice(6);
  return String(v ?? "").trim();
}

// 성도 본인에게 보여 주는 「내 신청」의 번호는 가운데를 가린다(2026-10-08 Plan 5 · tests/life-pin.test.cjs 와 글자까지 같게).
// ⚠️ 담당자 명단(pilsaList)·종이 명단에는 쓰지 않는다 — 노트·연락에 전체 번호가 필요하다.
function maskPhone(v: unknown): string {
  const d = String(v == null ? "" : v).replace(/[^0-9]/g, "");
  if (d.length === 11) return d.slice(0, 3) + "-****-" + d.slice(7);
  if (d.length === 10) return d.slice(0, 3) + "-***-" + d.slice(6);
  return "";
}

// 고른 부수 — 신청 상한(5부)은 이 값을 본다
function pilsaTotalOf(qtys: any): number {
  let n = 0;
  for (const k of Object.keys(qtys ?? {})) n += Number((qtys as any)[k]) || 0;
  return n;
}

// A5는 지면이 좁고 한영·영한은 두 언어를 같이 실어, 한 부가 두 권으로 나온다.
// 저장하는 total은 실제 만들어지는 권수 — 명단·금액이 이 값을 쓴다.
const PILSA_DUAL2 = ["한영(개역개정/NIV)", "영한(NIV/개역개정)"];
function pilsaMultOf(size: string, type2: string): number {
  return (size === "A5" || PILSA_DUAL2.indexOf(type2) >= 0) ? 2 : 1;
}

// 화면에 그대로 쓰는 형태로 정리(신청일은 KST 기준 YYYY.MM.DD)
function pilsaRow(r: any) {
  return {
    id: r.id,
    phone: r.phone ?? "",
    size: r.size, type1: r.type1, type2: r.type2,
    qtys: r.qtys ?? {}, total: r.total ?? 0,
    memo: r.memo ?? "",
    status: r.status,
    at: kstDay(r.created_at).replace(/-/g, "."),
    created_at: r.created_at,
  };
}

// 내 신청(가장 최근 한 건)
async function pilsaMine(b: any) {
  const le = await lifeError(b); if (le) return { ok: false, error: le };
  const userId = String(b.user_id || "");
  if (!userId) return { ok: true, order: null };
  const { data, error } = await db.from("pilsa_orders")
    .select("*").eq("user_id", userId)
    .order("created_at", { ascending: false }).limit(1);
  if (error) throw error;
  const r = (data ?? [])[0];
  return { ok: true, order: r ? { ...pilsaRow(r), phone: maskPhone(r.phone) } : null };
}

// 신청·수정 — 가장 최근 건이 '신청완료'면 그 건을 고치고, 아니면 새 건으로 넣는다.
async function pilsaApply(b: any) {
  const le = await lifeError(b); if (le) return { ok: false, error: le };
  const userId = String(b.user_id || "");
  if (!userId) return { ok: false, error: "user_id 필요" };
  const phone = pilsaPhone(b.phone);
  if (!PILSA_PHONE_RE.test(phone)) return { ok: false, error: "휴대폰 번호를 확인해 주세요" };
  const size = norm(b.size), type1 = norm(b.type1), type2 = norm(b.type2);
  if (!size || !type1 || !type2) return { ok: false, error: "노트 크기·필사 유형·번역본을 골라 주세요" };
  const qtys: Record<string, number> = {};
  for (const k of Object.keys(b.qtys ?? {})) {
    const n = Number((b.qtys as any)[k]) || 0;
    if (n > 0) qtys[k] = n;
  }
  const picks = pilsaTotalOf(qtys);
  if (!picks) return { ok: false, error: "성경을 1부 이상 골라 주세요" };
  if (picks > PILSA_MAX) return { ok: false, error: "한 분당 총 " + PILSA_MAX + "부까지 신청하실 수 있어요" };
  const total = picks * pilsaMultOf(size, type2);   // 실제 제작 권수

  const fields = {
    user_id: userId,
    name: norm(b.name) || null,
    who: norm(b.who) || null,
    phone, size, type1, type2, qtys, total,
    memo: norm(b.memo) || null,
  };

  const { data: prev } = await db.from("pilsa_orders")
    .select("id,status").eq("user_id", userId)
    .order("created_at", { ascending: false }).limit(1);
  const last = (prev ?? [])[0];

  if (last && last.status !== "배부완료") {
    // 준비가 시작된 뒤에는 성도가 바꿀 수 없다
    if (last.status !== "신청완료") return { ok: false, error: "준비가 시작되어 변경할 수 없습니다" };
    const { data, error } = await db.from("pilsa_orders")
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq("id", last.id).select("*").single();
    if (error) throw error;
    try { await pilsaNotifyAdmins(data, true); } catch (_) { /* 알림 실패가 신청을 막지 않는다 */ }
    return { ok: true, order: { ...pilsaRow(data), phone: maskPhone(data.phone) } };
  }

  const { data, error } = await db.from("pilsa_orders")
    .insert(fields).select("*").single();
  if (error) throw error;
  try { await pilsaNotifyAdmins(data, false); } catch (_) { /* 알림 실패가 신청을 막지 않는다 */ }
  return { ok: true, order: { ...pilsaRow(data), phone: maskPhone(data.phone) } };
}

// 취소 — '신청완료'인 내 신청만 지운다
async function pilsaCancel(b: any) {
  const le = await lifeError(b); if (le) return { ok: false, error: le };
  const userId = String(b.user_id || "");
  const id = Number(b.id) || 0;
  if (!userId || !id) return { ok: false, error: "user_id/id 필요" };
  const { data: row } = await db.from("pilsa_orders")
    .select("id,status").eq("id", id).eq("user_id", userId).maybeSingle();
  if (!row) return { ok: false, error: "신청을 찾을 수 없습니다" };
  if (row.status !== "신청완료") return { ok: false, error: "준비가 시작되어 취소할 수 없습니다" };
  const { error } = await db.from("pilsa_orders").delete().eq("id", id);
  if (error) throw error;
  return { ok: true };
}

// 관리자 명단 — 신청이 많지 않아 전부 내려주고 화면에서 추린다
async function pilsaList(b: any) {
  const err = adminError(b); if (err) return { ok: false, error: err };
  const { data, error } = await db.from("pilsa_orders")
    .select("*").order("created_at", { ascending: false }).limit(1000);
  if (error) throw error;
  const rows = (data ?? []) as any[];
  // 이름·소속은 신청 당시 스냅샷을 쓰되, 비어 있으면 users에서 채운다(옛 기록 대비)
  const need = [...new Set(rows.filter((r) => !r.name).map((r) => r.user_id))];
  const umap = new Map<string, any>();
  if (need.length) {
    const { data: users } = await db.from("users")
      .select("id,type,gu,mok,bu,grade,name").in("id", need);
    for (const u of (users ?? []) as any[]) umap.set(u.id, u);
  }
  const list = rows.map((r) => {
    const u = umap.get(r.user_id);
    let who = r.who ?? "";
    if (!who && u) {
      who = (u.type === "교구" ? [u.gu, u.mok ? u.mok + "목장" : ""] : [u.bu, u.grade])
        .filter(Boolean).join(" ");
    }
    return { ...pilsaRow(r), name: r.name || (u ? u.name : "") || "", who, notified_at: r.notified_at };
  });
  return { ok: true, list };
}

// 관리자 상태 변경 — '준비완료'로 바뀌면 앱 푸시를 한 번 보낸다
async function pilsaSetStatus(b: any) {
  const err = adminError(b); if (err) return { ok: false, error: err };
  const id = Number(b.id) || 0;
  const status = norm(b.status);
  if (!id || PILSA_STATUS.indexOf(status) < 0) return { ok: false, error: "id/status 확인" };
  const { data: row } = await db.from("pilsa_orders").select("*").eq("id", id).maybeSingle();
  if (!row) return { ok: false, error: "신청을 찾을 수 없습니다" };

  const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  let pushed = 0;
  let pushError: string | null = null;

  // 배부가 끝나면 휴대폰 번호를 지운다 — 개인정보 안내(/privacy/)가 약속한 그대로다.
  // 사람이 기억해서 지우는 약속은 언젠가 지켜지지 않으니, 상태를 바꾸는 그 자리에서 지운다.
  // 배부완료면 새로 신청하는 구조라 이 번호를 다시 쓸 일은 없다.
  const clearPhone = status === "배부완료" && !!norm(row.phone);
  if (clearPhone) patch.phone = "";

  // 준비완료 알림은 한 번만 — 상태를 오가며 눌러도 다시 보내지 않는다
  if (status === "준비완료" && !row.notified_at) {
    const res = await pilsaNotify(row);
    pushed = res.sent;
    pushError = res.error;
    if (res.sent > 0) patch.notified_at = new Date().toISOString();
  }
  const { error } = await db.from("pilsa_orders").update(patch).eq("id", id);
  if (error) throw error;
  return { ok: true, status, pushed, pushError, phoneCleared: clearPhone };
}

// 그 성도의 기기에만 발송. 알림을 켜 두지 않았으면 조용히 0건 —
// 그때는 담당자가 신청서의 휴대폰 번호로 연락한다.
async function pilsaNotify(row: any) {
  const { data: subs } = await db.from("push_subscriptions")
    .select("id,endpoint,p256dh,auth").eq("user_id", row.user_id);
  const list = (subs ?? []) as any[];
  if (!list.length) return { sent: 0, error: "not-subscribed" };
  const who = norm(row.name);
  const payload = JSON.stringify({
    title: "[고척교회 신앙운동팀]",
    body: "안녕하세요 " + (who ? who + " 성도님, " : "성도님, ") +
      "신청하신 성경필사 노트가 준비되었습니다. 주일에 4층 새가족실에서 찾아가세요. 평안한 한 주 되시고요. 샬롬!! 샬롬!!",
    url: "https://gocheok.onlybible.kr/",
  });
  return await pushToSubs(list, payload, "pilsa", "필사 노트 준비완료");
}

// 웹 푸시 한 벌 — 구독 목록에 밀어 넣고 센다. 만료된 구독(404·410)은 그 자리에서 지운다.
//   pushToSubs(필사·사역·신고 알림)와 eduPushDevices(교육·봉사 당번 알림)가 함께 쓴다 — push_log 는 부른 쪽이 남긴다.
//   codes = 실패한 응답 번호별 수(교육 알림 push_log.note 용 · 구독 주소·user_id 는 담지 않는다).
//   ok = 받아들여진 구독 줄(받은 그 객체 그대로) — 「누구의 기기가 받았나」를 세는 쪽(봉사 당번 dutyNoteTally)만 쓴다. 응답·기록에 싣지 말 것.
async function webPushList(list: any[], payload: string) {
  let sent = 0, failed = 0;
  let last: string | null = null;
  const codes: Record<string, number> = {};
  const ok: any[] = [];
  for (const s of list) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
      sent++; ok.push(s);
    } catch (e: any) {
      failed++;
      const code = e && (e.statusCode || e.status);
      last = "[" + (code || "ERR") + "] " + (e?.body || e?.message || String(e)).toString().slice(0, 120);
      codes[String(code || "ERR")] = (codes[String(code || "ERR")] || 0) + 1;
      if (code === 404 || code === 410) await db.from("push_subscriptions").delete().eq("id", s.id);
    }
  }
  return { sent, failed, last, codes, ok };
}

// 구독 목록에 밀어 넣고 결과를 돌려준다. 만료된 구독(404·410)은 그 자리에서 지운다.
async function pushToSubs(list: any[], payload: string, mode: string, title: string) {
  const { sent, failed, last } = await webPushList(list, payload);
  try {
    await db.from("push_log").insert({ mode, title, sent, failed, total: list.length, ok: sent > 0 });
  } catch (_) { /* 로그 실패는 발송 결과에 영향 없음 */ }
  return { sent, error: sent ? null : last };
}

// 신청이 들어오면 담당자에게 알린다.
// 받는 사람은 app_config의 `pilsaAdmins`(identity_key 배열)에 둔다 — 이 저장소는 공개라
// 이름이나 user_id를 코드에 박으면 그대로 드러나고, 담당자가 바뀔 때마다 배포를 다시 해야 한다.
// PUBLIC_CONFIG_KEYS에 넣지 않는다: 누가 받는지는 앱이 조회할 일이 없다.
// 게시판 신고 알림(`boardAdmins` · 2026-10-01)도 같은 길을 쓴다 — 키만 다르다.
async function pilsaAdminSubs() { return await configAdminSubs("pilsaAdmins"); }
async function configAdminSubs(configKey: string) {
  try {
    const { data } = await db.from("app_config").select("value").eq("key", configKey).maybeSingle();
    const keys = Array.isArray(data?.value)
      ? (data!.value as any[]).map((x) => norm(String(x))).filter(Boolean) : [];
    if (!keys.length) return [];
    const { data: users } = await db.from("users").select("id").in("identity_key", keys);
    const ids = ((users ?? []) as any[]).map((u) => u.id);
    if (!ids.length) return [];
    const { data: subs } = await db.from("push_subscriptions")
      .select("id,endpoint,p256dh,auth").in("user_id", ids);
    return (subs ?? []) as any[];
  } catch { return []; }
}

async function pilsaNotifyAdmins(row: any, edited: boolean) {
  const list = await pilsaAdminSubs();
  if (!list.length) return { sent: 0, error: "no-admin" };
  const who = [norm(row.name), norm(row.who)].filter(Boolean).join(" · ");
  const payload = JSON.stringify({
    title: edited ? "[필사 신청 변경]" : "[필사 신청]",
    body: (who || "성도") + "님이 " + (edited ? "신청을 고치셨습니다" : "신청하셨습니다") + " — " +
      [norm(row.size), norm(row.type1), norm(row.type2)].filter(Boolean).join(" ") +
      " " + (Number(row.total) || 0) + "권",
    url: "https://gocheok.onlybible.kr/admin.html",
  });
  return await pushToSubs(list, payload, "pilsa-apply", edited ? "필사 신청 변경" : "필사 신청");
}

// ============================================================
// 응원·기도·공감 공개 게시판 (누구나 글/답글, 관리자 숨김·삭제)
// ============================================================
async function boardList(b: any) {
  const isAdmin = !adminError(b); // 관리자면 숨김글도 조회
  // select("*") 로 마이그레이션 전/후(user_id 유무) 모두 안전하게 조회
  let pq = db.from("board_posts").select("*")
    .order("created_at", { ascending: false }).limit(300);
  if (!isAdmin) pq = pq.eq("hidden", false);
  let { data: posts, error } = await pq;
  if (error) throw error;
  if (!isAdmin) posts = (posts ?? []).filter((p: any) => !p.deleted); // 본인삭제 태그 제외(공개 관점)
  const ids = (posts ?? []).map((p: any) => p.id);
  let replies: any[] = [];
  if (ids.length) {
    let rq = db.from("board_replies").select("*")
      .in("post_id", ids).order("created_at", { ascending: true });
    if (!isAdmin) rq = rq.eq("hidden", false);
    const r = await rq; replies = (r.data ?? []).filter((x: any) => isAdmin || !x.deleted);
  }
  // 「이분 글 가리기」(2026-10-01) — 보는 분이 가린 분의 글·답글을 뺀다(관리자 화면은 그대로 다 본다).
  // ⚠️ 가린 분의 user_id 는 이 함수 안에서만 쓴다 — 아래 withRx 가 user_id 를 떼고 내보낸다.
  const viewer = isAdmin ? "" : storeUid(b.user_id);
  let blockedIds: string[] = [];
  let rulesOk: boolean | undefined;
  if (viewer) {
    try { blockedIds = await boardBlockedIds(viewer); } catch (_) { blockedIds = []; }   // 가리기 실패가 게시판을 막지 않는다
    try { rulesOk = await boardRulesOk(viewer); } catch (_) { rulesOk = undefined; }
    if (blockedIds.length) {
      const kept = boardDropBlocked(posts ?? [], replies, blockedIds);
      posts = kept.posts; replies = kept.replies;
    }
  }
  const byPost = new Map<number, any[]>();
  for (const r of replies) { if (!byPost.has(r.post_id)) byPost.set(r.post_id, []); byPost.get(r.post_id)!.push(r); }

  // 공감 이모지 — 글·답글의 것을 한 번에 긁어 집계한다
  const me = String(b.user_id || "");
  const rx = await boardReactionMap((posts ?? []).map((p: any) => p.id), replies.map((r: any) => r.id), me);
  // user_id는 응답에 싣지 않는다. 이 API는 JWT가 없어 남의 user_id가 새면 그 사람
  // 행세가 가능해진다(그 이름으로 글쓰기·진도 저장·순위 응원까지). 클라이언트가
  // 정말 필요한 것은 '내 글인가' 하나뿐이므로 그것만 참/거짓으로 내려준다.
  const withRx = (kind: string, row: any) => {
    const { user_id, images, ...rest } = row;
    // 저장된 것은 파일 이름뿐 — 볼 수 있는 주소는 여기서 만든다.
    const photos = (Array.isArray(images) ? images : [])
      .filter(isBoardImgName).map(boardImgUrl);
    return {
      ...rest,
      ...(photos.length ? { photos } : {}),
      isMine: !!me && !!user_id && user_id === me,
      // 「🙈 가리기」를 붙여도 되는 글인가(글쓴 분을 아는 글 · 관리자 글 아님) — 참/거짓만. 누구인지는 안 싣는다.
      blockable: !!user_id && !row.is_admin && !row.rich,
      reactions: rx.count.get(kind + ":" + row.id) || {},
      myReacts: rx.mine.get(kind + ":" + row.id) || [],
    };
  };

  return {
    ok: true, isAdmin,
    // 보는 분에게만 — 이용 규칙에 동의했나(처음 글쓰기 전에 앱이 묻는다) · 가린 분이 몇인가(「가린 분 관리」 단추)
    ...(viewer ? { rulesOk, blockedCount: blockedIds.length } : {}),
    posts: (posts ?? []).map((p: any) => ({
      ...withRx("post", p),
      replies: (byPost.get(p.id) || []).map((r: any) => withRx("reply", r)),
    })),
  };
}

// 글·답글 묶음의 공감을 한 번에 읽어 { 이모지: 수 }와 내가 누른 목록으로 정리
async function boardReactionMap(postIds: number[], replyIds: number[], me: string) {
  const count = new Map<string, Record<string, number>>();
  const mine = new Map<string, string[]>();
  const rows: any[] = [];
  if (postIds.length) {
    const { data } = await db.from("board_reactions")
      .select("target,target_id,user_id,emoji").eq("target", "post").in("target_id", postIds);
    rows.push(...(data ?? []));
  }
  if (replyIds.length) {
    const { data } = await db.from("board_reactions")
      .select("target,target_id,user_id,emoji").eq("target", "reply").in("target_id", replyIds);
    rows.push(...(data ?? []));
  }
  for (const r of rows) {
    const k = r.target + ":" + r.target_id;
    const c = count.get(k) || {};
    c[r.emoji] = (c[r.emoji] || 0) + 1;
    count.set(k, c);
    if (me && r.user_id === me) mine.set(k, [...(mine.get(k) || []), r.emoji]);
  }
  return { count, mine };
}

// ---------- boardReact: 공감 누르기/취소 ----------
const BOARD_EMOJI = ["👍", "🙏", "❤️", "😊", "🎉"];
async function boardReact(b: any) {
  const target = b.target === "reply" ? "reply" : "post";
  const targetId = Number(b.target_id) || 0;
  const userId = String(b.user_id || "");
  const emoji = String(b.emoji || "");
  if (!targetId || !userId) return { ok: false, error: "로그인한 뒤에 누를 수 있어요" };
  if (BOARD_EMOJI.indexOf(emoji) < 0) return { ok: false, error: "쓸 수 없는 이모지입니다" };

  if (b.on === false) {
    const { error } = await db.from("board_reactions").delete()
      .eq("target", target).eq("target_id", targetId).eq("user_id", userId).eq("emoji", emoji);
    if (error) throw error;
    return { ok: true, on: false };
  }
  const { error } = await db.from("board_reactions").upsert({
    target, target_id: targetId, user_id: userId, emoji, who: norm(b.who) || null,
  }, { onConflict: "target,target_id,user_id,emoji", ignoreDuplicates: true });
  if (error) throw error;
  return { ok: true, on: true };
}

// ---------- boardReactors: 그 이모지를 누른 사람 이름 ----------
async function boardReactors(b: any) {
  const target = b.target === "reply" ? "reply" : "post";
  const targetId = Number(b.target_id) || 0;
  const emoji = String(b.emoji || "");
  if (!targetId || !emoji) return { ok: true, list: [] };
  const { data, error } = await db.from("board_reactions")
    .select("who,created_at").eq("target", target).eq("target_id", targetId).eq("emoji", emoji)
    .order("created_at", { ascending: true }).limit(200);
  if (error) throw error;
  return { ok: true, list: (data ?? []).map((r: any) => r.who || "익명") };
}

// 첫 화면 배지용 — 최근 7일 내 공개 글/답글 개수만 가볍게 센다(본문 미포함)
// b.since(마지막으로 게시판을 본 시각)가 있으면 그 이후 것만 → '보면 사라지는' 배지
async function boardCheck(b: any) {
  let floor = Date.now() - 7 * 24 * 3600 * 1000;
  const seen = b && b.since ? Date.parse(b.since) : NaN;
  if (!isNaN(seen) && seen > floor) floor = seen;
  const since = new Date(floor).toISOString();
  // 「🙈 가리기」(2026-10-01) — 보는 분이 가린 분의 글·답글은 세지 않는다. 「새글 1」을 보고 열었는데
  //   아무것도 없으면 어르신은 고장인 줄 아신다. 가린 분이 없거나(대부분) user_id 를 안 보낸 옛 앱이면
  //   예전처럼 머릿수만 센다. ⚠️ 응답은 { ok, recent } 그대로 — 누구 글인지는 안 싣는다.
  const viewer = storeUid(b && b.user_id);
  if (viewer) {
    let blocked: string[] = [];
    try { blocked = await boardBlockedIds(viewer); } catch (_) { blocked = []; }
    if (blocked.length) {
      try { return { ok: true, recent: await boardRecentVisible(since, blocked) }; }
      catch (_) { /* 거르기가 실패해도 배지는 뜬다 — 아래 머릿수로 */ }
    }
  }
  const p = await db.from("board_posts").select("id", { count: "exact", head: true })
    .eq("hidden", false).not("deleted", "is", true).gte("created_at", since);
  const r = await db.from("board_replies").select("id", { count: "exact", head: true })
    .eq("hidden", false).not("deleted", "is", true).gte("created_at", since);
  return { ok: true, recent: (p.count || 0) + (r.count || 0) };
}
// 가린 분이 있는 분의 「새글 N」 — 그 뒤 올라온 글·답글의 번호와 글쓴 분만 읽어 boardList 와 같은 규칙으로 센다.
// (최근 7일 안이라 줄이 적다. 글쓴 분의 user_id 는 이 함수 안에서만 쓰고 숫자 하나만 돌려준다.)
async function boardRecentVisible(since: string, blocked: string[]): Promise<number> {
  const p = await db.from("board_posts").select("id,user_id")
    .eq("hidden", false).not("deleted", "is", true).gte("created_at", since).limit(1000);
  if (p.error) throw p.error;
  const r = await db.from("board_replies").select("id,post_id,user_id")
    .eq("hidden", false).not("deleted", "is", true).gte("created_at", since).limit(2000);
  if (r.error) throw r.error;
  const recent = (p.data ?? []) as any[];
  const replies = (r.data ?? []) as any[];
  const have = new Set(recent.map((x) => x.id));
  const need = [...new Set(replies.map((x) => x.post_id))].filter((id) => !have.has(id));
  let parents: any[] = [];
  if (need.length) {
    const q = await db.from("board_posts").select("id,user_id").in("id", need);
    if (q.error) throw q.error;
    parents = (q.data ?? []) as any[];
  }
  return boardCountVisible(recent, parents, replies, blocked);
}

// ---------- 게시판 사진 ----------
// 글 하나에 넉 장까지. 답글에는 넣지 않는다(화면이 복잡해진다).
// 브라우저가 Storage로 직접 올리지 않는다 — 이 API는 JWT가 없어서 공개 키로 바로 쓰게
// 두면 아무나 아무거나 올릴 수 있다. 지킬 문은 글쓰기가 이미 지나는 이 문 하나로 둔다.
const BOARD_IMG_MAX = 4;
const BOARD_IMG_BYTES = 1_500_000;   // 브라우저가 줄여 보낸 뒤 한 장 최대(넉넉하게)
const BOARD_MIME: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
};
// 저장되는 것은 파일 이름뿐. 주소는 내보낼 때 만든다(도메인이 바뀌어도 기록이 안 썩는다).
const boardImgUrl = (p: string) => db.storage.from("board").getPublicUrl(p).data.publicUrl;
const isBoardImgName = (p: unknown) =>
  typeof p === "string" && /^[0-9a-f-]{36}\.(jpg|png|webp)$/.test(p);

// ⚠️ 문(2026-10-08 보안 점검) — 전에는 아무 확인 없이 받았다: 공개 키만 있으면 누구나 공개 칸에 사진을 끝없이 올릴 수 있었고,
//    글에 안 붙인 사진도 주소로 열렸다. 이제 ① 로그인한 분(users 에 있는 user_id)만 ② 하루 BOARD_UPLOADS_PER_DAY 장까지
//    ③ 하루가 지나도 글에 안 붙은 사진은 치운다(boardSweepUploads).
// ⚠️ **이용 규칙은 여기서 보지 않는다** — 앱은 사진을 먼저 올리고 글을 보낼 때 규칙 창을 띄운다(boardWriteWithRules).
//    여기서 rules-needed 를 주면 규칙 창이 뜨기도 전에 「사진을 올리지 못했어요」로 끝난다. 규칙은 글쓰기 문이 본다.
// ⚠️ 오류는 **읽을 수 있는 글**로 준다 — 앱이 「사진을 올리지 못했어요: 」 뒤에 그대로 붙여 보여 준다.
const BOARD_UPLOADS_PER_DAY = 20;     // 글 다섯 개 분량
const BOARD_POSTS_PER_DAY = 20;
const BOARD_REPLIES_PER_DAY = 60;
// 한국 날짜의 오늘 0시(UTC ISO) — 「하루에 몇 번」을 세는 기준
const kstDayStartIso = () => {
  const k = new Date(Date.now() + 9 * 3600 * 1000);
  k.setUTCHours(0, 0, 0, 0);
  return new Date(k.getTime() - 9 * 3600 * 1000).toISOString();
};

// 하루 지난 주인 없는 사진 치우기 — 올릴 때마다 조금씩(열 장). 표가 없으면(SQL 전) 아무것도 안 한다.
// ⚠️ **지우기 전에 글을 다시 찾아본다.** 어느 글이든 그 이름을 갖고 있으면 지우지 않고 kept 로 적는다 —
//    찾아보지 못했으면(오류) 그 자리에서 멈춘다. 붙어 있는 사진을 지우는 것보다 안 지우는 쪽으로 틀린다.
async function boardSweepUploads() {
  const before = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data, error } = await db.from("board_uploads").select("path")
    .eq("kept", false).lt("created_at", before).order("created_at", { ascending: true }).limit(10);
  if (error || !data || !data.length) return;
  for (const r of data as any[]) {
    const path = r.path;
    if (!isBoardImgName(path)) continue;
    const used = await db.from("board_posts").select("id").contains("images", JSON.stringify([path])).limit(1);
    if (used.error) return;
    if (used.data && used.data.length) { await db.from("board_uploads").update({ kept: true }).eq("path", path); continue; }
    const rm = await db.storage.from("board").remove([path]);
    if (!rm.error) await db.from("board_uploads").delete().eq("path", path);
  }
}

async function boardUpload(b: any) {
  const mime = String(b.mime || "");
  const ext = BOARD_MIME[mime];
  if (!ext) return { ok: false, error: "사진은 JPG·PNG·WEBP만 올릴 수 있어요" };
  const upAdmin = !adminError(b);
  const upUid = storeUid(b.user_id);
  if (!upAdmin) {
    // user_id 없이 오는 것은 옛 판 앱이다(2026-10-08 전에는 안 보냈다) — 다시 열면 새 판이 된다
    if (!upUid) return { ok: false, error: "앱을 닫았다가 다시 연 뒤 올려 주세요" };
    const { data: u, error: ue } = await db.from("users").select("id").eq("id", upUid).maybeSingle();
    if (ue) throw ue;
    if (!u) return { ok: false, error: "로그인한 뒤에 올릴 수 있어요" };
    const c = await db.from("board_uploads").select("path", { count: "exact", head: true })
      .eq("uploader", upUid).gte("created_at", kstDayStartIso());
    if (c.error) { if (!storeSchemaMissing(c.error)) throw c.error; }
    else if ((c.count ?? 0) >= BOARD_UPLOADS_PER_DAY) return { ok: false, error: "오늘은 사진을 많이 올리셨어요. 내일 다시 올려 주세요" };
  }
  const raw = String(b.data || "");
  const base64 = raw.includes(",") ? raw.slice(raw.indexOf(",") + 1) : raw;
  let bytes: Uint8Array;
  try {
    const bin = atob(base64);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } catch { return { ok: false, error: "사진을 읽지 못했어요" }; }
  if (!bytes.length) return { ok: false, error: "사진이 비어 있어요" };
  if (bytes.length > BOARD_IMG_BYTES) return { ok: false, error: "사진이 너무 커요" };
  const path = crypto.randomUUID() + "." + ext;   // 주소를 짐작할 수 없게
  const { error } = await db.storage.from("board")
    .upload(path, bytes, { contentType: mime, upsert: false });
  if (error) return { ok: false, error: "사진을 올리지 못했어요" };
  // 올린 기록 — 하루 장수를 세고, 글에 안 붙은 사진을 치우는 데 쓴다. 기록 실패가 올리기를 막지 않는다.
  try {
    await db.from("board_uploads").insert({ path, uploader: upAdmin ? null : upUid });
    await boardSweepUploads();
  } catch (_) { /* 표가 아직 없거나 치우기 실패 — 사진은 이미 올라갔다 */ }
  return { ok: true, path };
}

// 글이 사라지면 사진도 지운다. 본인 삭제(가림)에서도 지운다 —
// 사진을 내린다는 것은 '안 보이게'가 아니라 '없앤다'는 뜻으로 알아듣는 게 맞다.
// (관리자가 되살리면 글만 돌아오고 사진은 돌아오지 않는다)
async function boardDropImages(ids: number[]) {
  if (!ids.length) return;
  try {
    const { data } = await db.from("board_posts").select("images").in("id", ids);
    const paths: string[] = [];
    for (const r of (data ?? []) as any[]) {
      for (const p of (Array.isArray(r.images) ? r.images : [])) {
        if (isBoardImgName(p)) paths.push(p);
      }
    }
    if (paths.length) await db.storage.from("board").remove(paths);
    await db.from("board_posts").update({ images: [] }).in("id", ids);
  } catch (_) { /* 사진 정리 실패가 글 삭제를 막지 않는다 */ }
}

// 게시판 이용 규칙 확인(2026-10-01) — 관리자 글이 아니면 「로그인한 분 · 규칙에 동의한 분」만 받는다.
// 구글 UGC 정책: "Requires users accept the app's terms of use and/or user policy before users can create or upload UGC".
// ⚠️ 앱(아이폰·안드로이드 껍데기도 같은 웹)은 `rules-needed` 를 받으면 규칙 창을 띄우고 동의 뒤 다시 보낸다.
//    옛 판 앱은 「등록 실패: rules-needed」를 한 번 보고, 판이 바뀌면(APP_BUILD 재확인) 새 흐름을 탄다.
// ⚠️ 이제 user_id 없는 글은 받지 않는다 — 가리기(board_blocks)도 글쓴 분을 알아야 된다.
async function boardWriteGate(b: any): Promise<string | null> {
  if (!adminError(b)) return null;                     // 관리자 공지·관리자 답글
  const uid = storeUid(b.user_id);
  if (!uid) return "no-user";
  return (await boardRulesOk(uid)) ? null : "rules-needed";
}

// 글쓴 분의 표시 이름 — ⚠️ app.js boardWho() 와 **같은 규칙**이어야 한다(옛 글의 「내 글」 판정이 이름 일치를 본다).
function boardWhoOf(u: any): string {
  if (!u || !u.name) return "";
  const affil = u.type === "교구"
    ? `${u.gu || ""}-${u.mok || ""}`
    : `${u.bu || ""}${u.grade ? " " + u.grade : ""}`;
  return `${affil} ${u.name}`.trim().replace(/^-\s*/, "");
}
// ⚠️ 이름은 앱이 보낸 값을 믿지 않고 users 에서 만든다(2026-10-08 보안 점검 — eventSignup 과 같다).
//    전에는 name 을 그대로 받아 다른 성도님 이름이나 「관리자」·「담임목사」라는 글자로 글을 쓸 수 있었다.
//    관리자 글(비번)만 보낸 이름을 쓴다. 하루 횟수도 여기서 본다 — 넘으면 **읽을 수 있는 글**로 거절한다
//    (앱이 「등록 실패: 」 뒤에 그대로 붙인다).
async function boardWriter(b: any, table: "board_posts" | "board_replies", max: number): Promise<{ name: string } | { error: string }> {
  const uid = storeUid(b.user_id);
  if (!uid) return { error: "no-user" };
  const { data: u, error } = await db.from("users").select("type,gu,mok,bu,grade,name").eq("id", uid).maybeSingle();
  if (error) throw error;
  const name = boardWhoOf(u).slice(0, 40);
  if (!name) return { error: "no-user" };
  const c = await db.from(table).select("id", { count: "exact", head: true }).eq("user_id", uid).gte("created_at", kstDayStartIso());
  if (!c.error && (c.count ?? 0) >= max) {
    return { error: table === "board_posts" ? "오늘은 글을 많이 올리셨어요. 내일 다시 올려 주세요" : "오늘은 답글을 많이 쓰셨어요. 내일 다시 써 주세요" };
  }
  return { name };
}

async function boardPost(b: any) {
  const content = String(b.content || "").trim();
  if (!content) return { ok: false, error: "empty" };
  if (content.length > 2000) return { ok: false, error: "too-long" };
  const gate = await boardWriteGate(b);
  if (gate) return { ok: false, error: gate };
  let name = (String(b.name || "").trim().slice(0, 40)) || "익명";
  if (adminError(b)) {
    const w: any = await boardWriter(b, "board_posts", BOARD_POSTS_PER_DAY);
    if (w.error) return { ok: false, error: w.error };
    name = w.name;
  }
  const row: any = { name, content };
  if (b.user_id) row.user_id = b.user_id;
  // 올려 둔 사진의 '이름'만 받는다. 주소를 통째로 받으면 남의 주소도 붙일 수 있다.
  const imgs = (Array.isArray(b.images) ? b.images : [])
    .filter(isBoardImgName).slice(0, BOARD_IMG_MAX);
  if (imgs.length) row.images = imgs;
  // HTML로 그려도 되는 글인지 — 관리자 비번이 맞을 때만 표시한다.
  //   이 API는 JWT가 없어 누구나 글을 쓸 수 있다. 아무 글이나 HTML로 그리면
  //   저장형 XSS가 된다(그 글을 연 모든 분의 브라우저에서 코드가 돈다).
  if (b.rich && !adminError(b)) row.rich = true;
  let { data, error } = await db.from("board_posts").insert(row).select("id").single();
  // rich 컬럼 마이그레이션(board_rich.sql) 전이면 표시 없이 올린다 — 글이 먼저다.
  if (error && /rich/i.test(String(error.message || ""))) {
    delete row.rich;
    ({ data, error } = await db.from("board_posts").insert(row).select("id").single());
  }
  // 컬럼 마이그레이션 전 폴백 — 글을 잃는 것보다 사진 없이라도 올라가는 게 낫다.
  if (error && /images/i.test(String(error.message || ""))) {
    delete row.images;
    ({ data, error } = await db.from("board_posts").insert(row).select("id").single());
  }
  if (error && /user_id/i.test(String(error.message || ""))) {
    ({ data, error } = await db.from("board_posts").insert({ name, content }).select("id").single());
  }
  if (error) throw error;
  return { ok: true, id: data.id };
}

async function boardReply(b: any) {
  if (!b.post_id) return { ok: false, error: "no-post" };
  const content = String(b.content || "").trim();
  if (!content) return { ok: false, error: "empty" };
  if (content.length > 2000) return { ok: false, error: "too-long" };
  const gate = await boardWriteGate(b);
  if (gate) return { ok: false, error: gate };
  const isAdmin = !adminError(b); // 관리자 답글이면 배지
  let name = "관리자";
  if (!isAdmin) {
    const w: any = await boardWriter(b, "board_replies", BOARD_REPLIES_PER_DAY);
    if (w.error) return { ok: false, error: w.error };
    name = w.name;
  }
  const row: any = { post_id: Number(b.post_id), name, content, is_admin: isAdmin };
  if (b.user_id) row.user_id = b.user_id;
  let { error } = await db.from("board_replies").insert(row);
  if (error && /user_id/i.test(String(error.message || ""))) {
    ({ error } = await db.from("board_replies").insert({ post_id: Number(b.post_id), name, content, is_admin: isAdmin }));
  }
  if (error) throw error;
  return { ok: true, is_admin: isAdmin };
}

// 본인 글/답글 삭제 — 물리삭제가 아니라 deleted 태그(관리자 확인·복구 가능). user_id 일치해야만.
async function boardDeleteMine(b: any) {
  const who = String(b.who || "").trim();
  if (!who && !b.user_id) return { ok: false, error: "no-owner" };
  const table = b.kind === "reply" ? "board_replies" : "board_posts";
  // 관리자 이름·소속 변경 후에도 본인 글은 같은 user_id로 삭제할 수 있다.
  // 이름 비교는 user_id가 없는 옛 글에만 사용한다.
  const remove = async (column: string) => {
    const base = () => db.from(table).update({ [column]: true }).eq("id", Number(b.id));
    if (b.user_id) {
      const result = await base().eq("user_id", b.user_id).select("id");
      if (result.error || result.data?.length || !who) return result;
    }
    return await base().is("user_id", null).eq("name", who).select("id");
  };
  let { data, error } = await remove("deleted");
  if (error && /deleted/i.test(String(error.message || ""))) { // deleted 컬럼 마이그레이션 전 폴백
    ({ data, error } = await remove("hidden"));
  }
  if (error) throw error;
  if (!(data && data.length)) return { ok: false, error: "not-owner" };
  // 사진을 내린다는 것은 '안 보이게'가 아니라 '없앤다'는 뜻으로 알아듣는 게 맞다.
  if (b.kind !== "reply") await boardDropImages(data.map((r: any) => r.id));
  return { ok: true };
}

async function boardModerate(b: any) {
  const err = adminError(b); if (err) return { ok: false, error: err };
  const table = b.kind === "reply" ? "board_replies" : "board_posts";
  const id = Number(b.id);
  if (!id) return { ok: false, error: "no-id" };
  // op: 'hide' | 'show' | 'delete'(물리삭제) | 'undelete'(본인삭제 태그 복구)
  if (b.op === "delete") {
    // 행을 지우기 '전에' 사진을 치운다 — 지운 뒤에는 어떤 파일이었는지 알 길이 없다.
    if (table === "board_posts") await boardDropImages([id]);
    const { error } = await db.from(table).delete().eq("id", id); if (error) throw error;
  } else if (b.op === "undelete") {
    const { error } = await db.from(table).update({ deleted: false }).eq("id", id); if (error) throw error;
  } else {
    const { error } = await db.from(table).update({ hidden: b.op === "hide" }).eq("id", id); if (error) throw error;
  }
  return { ok: true };
}

// ============================================================
// 게시판 신고(🚩) — 2026-10-01
//   구글 플레이 「사용자 제작 콘텐츠(UGC)」 정책: 앱 안에서 불쾌한 글을 신고하는 길 + 운영진의 처리.
//   표: supabase/board_reports.sql · 설명: docs/notes/board.md 「신고」 절
// ⚠️ reporter_id(신고한 분)는 **어떤 응답에도 싣지 않는다 — 관리자 목록에도.** 고르지도 않는다.
//    이 API 는 JWT 가 없어 user_id 가 새면 그 사람 행세가 되고, 누가 신고했는지가 새면 보복이 생긴다.
// ⚠️ 까닭 허용 목록은 세 곳(여기 · app.js · SQL CHECK)이다 — tests/board-report.test.cjs 가 셋을 맞대 본다.
// ⚠️ 보관 90일(BOARD_REPORT_KEEP_DAYS)은 개인정보 안내(privacy/ · 앱 안 두 곳)가 약속한 숫자다 — 같이 고칠 것.
// ============================================================
// ── 게시판 신고 — 순수 함수 (여기부터) ──
// ⚠️ 이 구간은 타입 표기 없이 쓴다 — tests/board-report.test.cjs 가 떼어 node:vm 으로 돌린다.
const BOARD_REPORT_REASONS = ["inappropriate", "spam", "privacy", "other"];
const BOARD_REPORT_LABELS = {
  inappropriate: "부적절한 내용", spam: "광고·도배", privacy: "개인정보 노출", other: "기타",
};
const BOARD_REPORT_NOTE_MAX = 200;      // SQL CHECK char_length(note) <= 200 와 같아야 한다
const BOARD_REPORT_KEEP_DAYS = 90;      // 처리 뒤 이만큼 지나면 지운다(SQL cron 과 같아야 한다)
const BOARD_REPORT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function boardReportPosInt(v) {
  const n = typeof v === "number" ? v : (typeof v === "string" && /^\d+$/.test(v.trim()) ? Number(v) : NaN);
  return Number.isSafeInteger(n) && n > 0 ? n : 0;
}

// 받은 값 확인 — 실패면 { error }, 통과면 { userId, reason, kind, id, note }
//   reply_id 가 있으면 답글 신고(post_id 는 서버가 그 답글에서 찾는다), 없으면 post_id 로 글 신고.
//   덧붙인 말은 공백을 한 칸으로 접고 200자(글자 단위 — 이모지가 반으로 쪼개지지 않게)에서 자른다.
function boardReportInput(b) {
  const src = b && typeof b === "object" ? b : {};
  const userId = String(src.user_id == null ? "" : src.user_id).trim().toLowerCase();
  if (!BOARD_REPORT_UUID.test(userId)) return { error: "no-user" };
  const reason = String(src.reason == null ? "" : src.reason);
  if (BOARD_REPORT_REASONS.indexOf(reason) < 0) return { error: "bad-reason" };
  const replyId = boardReportPosInt(src.reply_id);
  const postId = boardReportPosInt(src.post_id);
  if (!replyId && !postId) return { error: "bad-args" };
  const note = Array.from(String(src.note == null ? "" : src.note).replace(/\s+/g, " ").trim())
    .slice(0, BOARD_REPORT_NOTE_MAX).join("").trim();
  return { userId, reason, kind: replyId ? "reply" : "post", id: replyId || postId, note: note || null };
}

// 처리 전 신고 줄들을 글·답글 하나당 한 묶음으로 — 많이 신고된 것, 최근 것이 앞.
// ⚠️ 정해진 칸만 옮겨 담는다 — 들어온 줄에 reporter_id 가 섞여 있어도 밖으로 안 나간다.
function boardReportGroup(rows) {
  const byKey = new Map();
  for (const r of (Array.isArray(rows) ? rows : [])) {
    const kind = r.reply_id ? "reply" : "post";
    const id = Number(r.reply_id || r.post_id);
    const k = kind + ":" + id;
    let g = byKey.get(k);
    if (!g) {
      g = { kind, id, post_id: Number(r.post_id), count: 0, reasons: {}, notes: [],
            first_at: r.created_at, last_at: r.created_at };
      byKey.set(k, g);
    }
    g.count++;
    g.reasons[r.reason] = (g.reasons[r.reason] || 0) + 1;
    if (r.note) g.notes.push(String(r.note));
    if (r.created_at < g.first_at) g.first_at = r.created_at;
    if (r.created_at > g.last_at) g.last_at = r.created_at;
  }
  return Array.from(byKey.values()).sort((a, b) =>
    (b.count - a.count) || (a.last_at < b.last_at ? 1 : a.last_at > b.last_at ? -1 : 0));
}

// 관리자 목록에 보일 발췌 — 관리자 공지(rich)만 태그를 벗긴다(성도 글의 「<」는 글자 그대로다)
function boardReportExcerpt(s, n, rich) {
  let t = String(s == null ? "" : s);
  if (rich) t = t.replace(/<[^>]*>/g, " ");
  t = t.replace(/\s+/g, " ").trim();
  const a = Array.from(t);
  return a.length > n ? a.slice(0, n).join("") + "…" : t;
}
// ── 게시판 신고 — 순수 함수 (여기까지) ──

// 표(board_reports.sql)를 아직 안 만든 DB — 500 대신 not-ready 로 답한다
function boardReportsMissing(e: any) {
  const c = String(e?.code || ""), m = String(e?.message || "");
  return c === "42P01" || c === "PGRST205" || /does not exist|schema cache/i.test(m);
}

// 성도 — 남의 글·답글 신고. 같은 분이 같은 글을 또 누르면 「이미 신고함」으로 받는다(오류가 아니다).
async function boardReport(b: any) {
  const v: any = boardReportInput(b);
  if (v.error) return { ok: false, error: v.error };
  // 대상 확인 — 없거나 숨김·본인삭제면 not-found(화면에 안 보이는 글을 신고할 일은 없다).
  // select("*") — 옛 DB(deleted·user_id 칸 이전)에서도 안전하게. 응답에는 아무 칸도 안 싣는다.
  const table = v.kind === "reply" ? "board_replies" : "board_posts";
  const { data: row, error: e1 } = await db.from(table).select("*").eq("id", v.id).maybeSingle();
  if (e1) throw e1;
  if (!row || row.hidden || row.deleted) return { ok: false, error: "not-found" };
  if (row.user_id && String(row.user_id).toLowerCase() === v.userId) return { ok: false, error: "own" };
  const postId = v.kind === "reply" ? Number(row.post_id) : v.id;
  const replyId = v.kind === "reply" ? v.id : null;
  const { error } = await db.from("board_reports").insert({
    post_id: postId, reply_id: replyId, reporter_id: v.userId, reason: v.reason, note: v.note,
  });
  if (error) {
    const code = String((error as any).code || ""), msg = String(error.message || "") + " " + String((error as any).details || "");
    if (code === "23505" || /duplicate key/i.test(msg)) return { ok: true, already: true };   // 이미 신고함
    if (boardReportsMissing(error)) return { ok: false, error: "not-ready" };
    if (code === "23503") return { ok: false, error: /reporter/i.test(msg) ? "no-user" : "not-found" };
    throw error;
  }
  // 운영진 알림 — 실패해도 신고는 이미 받았다(삼킨다)
  try { await boardReportNotify(v.kind, postId, replyId); } catch (_) { /* 알림 실패가 신고를 막지 않는다 */ }
  return { ok: true };
}

// 신고가 들어오면 담당자(app_config `boardAdmins` — pilsaAdmins 와 같은 방식)에게 Web Push.
// ⚠️ 쏟아지지 않게: 그 글(답글)의 **첫 신고**일 때만, 그리고 **10분에 한 번**까지(push_log 로 본다).
//    로그인이 곧 계정 만들기라(비번 없음) 한 사람이 여러 계정으로 신고를 쏟을 수 있다.
// ⚠️ 알림 본문에 신고한 분도, 글 내용도 싣지 않는다 — 잠금 화면에 그대로 뜬다.
// ⚠️ monitor 는 push_log 의 daily 행만 본다 — 여기서 실패 행이 남아도 헛경보가 안 난다.
async function boardReportNotify(kind: string, postId: number, replyId: number | null) {
  let q = db.from("board_reports").select("id", { count: "exact", head: true })
    .eq("post_id", postId).is("resolved_at", null);
  q = replyId ? q.eq("reply_id", replyId) : q.is("reply_id", null);
  const { count } = await q;
  if ((count ?? 0) > 1) return { sent: 0, error: "not-first" };
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: recent } = await db.from("push_log").select("sent_at")
    .eq("mode", "board-report").gte("sent_at", since).limit(1);
  if ((recent ?? []).length) return { sent: 0, error: "throttled" };
  const list = await configAdminSubs("boardAdmins");
  if (!list.length) return { sent: 0, error: "no-admin" };
  const payload = JSON.stringify({
    title: "[게시판 신고]",
    body: (kind === "reply" ? "답글" : "글") + " 하나가 신고되었습니다 — 관리자 「게시판 관리」에서 확인해 주세요.",
    url: "https://gocheok.onlybible.kr/admin.html",
  });
  return await pushToSubs(list, payload, "board-report", "게시판 신고");
}

// 관리자 — 처리 전 신고를 글·답글별로 묶어서. 신고한 분은 싣지 않는다(몇 분인지만).
async function boardReports(b: any) {
  const err = adminError(b); if (err) return { ok: false, error: err };
  // 처리 뒤 90일이 지난 것을 먼저 지운다 — 개인정보 안내의 약속이다. cron(board_reports.sql ④)이
  // 매일 하지만, cron 이 없는 DB 에서도 지켜지게 여기서 한 번 더.
  const cutoff = new Date(Date.now() - BOARD_REPORT_KEEP_DAYS * 86400000).toISOString();
  const purge = await db.from("board_reports").delete().lt("resolved_at", cutoff);
  if (purge.error) {
    if (boardReportsMissing(purge.error)) return { ok: false, error: "not-ready" };
    throw purge.error;
  }
  const { data, error } = await db.from("board_reports")
    .select("id,post_id,reply_id,reason,note,created_at")      // ⚠️ reporter_id 는 고르지도 않는다
    .is("resolved_at", null).order("created_at", { ascending: false }).limit(1000);
  if (error) {
    if (boardReportsMissing(error)) return { ok: false, error: "not-ready" };
    throw error;
  }
  const groups: any[] = boardReportGroup(data ?? []);
  // 신고된 글·답글 — 발췌와 상태만. select("*") 는 옛 DB 를 위해서이고, 응답에는 고른 칸만 싣는다.
  const fetchRows = async (table: string, ids: number[]) => {
    const m = new Map<number, any>();
    if (!ids.length) return m;
    const { data: rows, error: e } = await db.from(table).select("*").in("id", ids);
    if (e) throw e;
    for (const r of (rows ?? []) as any[]) m.set(Number(r.id), r);
    return m;
  };
  const posts = await fetchRows("board_posts", groups.filter((g) => g.kind === "post").map((g) => g.id));
  const replies = await fetchRows("board_replies", groups.filter((g) => g.kind === "reply").map((g) => g.id));
  const items = groups.map((g) => {
    const row = g.kind === "reply" ? replies.get(g.id) : posts.get(g.id);
    const photos = (row && Array.isArray(row.images) ? row.images : []).filter(isBoardImgName).map(boardImgUrl);
    return {
      ...g,
      name: row ? (row.name || "익명") : "",
      excerpt: row ? boardReportExcerpt(row.content, 160, !!row.rich) : "",
      ...(photos.length ? { photos } : {}),
      hidden: !!(row && row.hidden),
      deleted: !!(row && row.deleted),
      gone: !row,                     // 글이 이미 없다(보통은 cascade 로 신고도 함께 지워진다)
    };
  });
  return { ok: true, labels: BOARD_REPORT_LABELS, keepDays: BOARD_REPORT_KEEP_DAYS, items };
}

// 관리자 — 한 글(답글)의 처리 전 신고를 닫는다. op: "hide"(그 글을 숨기고 닫음) | "resolve"(그대로 두고 닫음)
// 숨기기는 boardModerate 를 그대로 쓴다 — 숨김을 두 벌로 만들지 않는다(숨김해제도 기존 목록에서 한다).
async function boardReportResolve(b: any) {
  const err = adminError(b); if (err) return { ok: false, error: err };
  const kind = b.kind === "reply" ? "reply" : "post";
  const id = boardReportPosInt(b.id);
  const op = b.op === "hide" ? "hide" : b.op === "resolve" ? "resolve" : "";
  if (!id || !op) return { ok: false, error: "bad-args" };
  if (op === "hide") {
    const r: any = await boardModerate({ pw: b.pw, kind, id, op: "hide" });
    if (!r.ok) return r;
  }
  let q = db.from("board_reports").update({
    resolved_at: new Date().toISOString(), resolved_by: "admin", resolution: op === "hide" ? "hidden" : "kept",
  }).is("resolved_at", null);
  q = kind === "reply" ? q.eq("reply_id", id) : q.eq("post_id", id).is("reply_id", null);
  const { data, error } = await q.select("id");
  if (error) {
    if (boardReportsMissing(error)) return { ok: false, error: "not-ready" };
    throw error;
  }
  return { ok: true, resolved: (data ?? []).length, hidden: op === "hide" };
}

// ============================================================
// 구글 출시 심사 전 고칠 것(2026-10-01) — 자료/store/README.md 「구글 출시 심사 전 결정」
//   ① 보호자 확인 — 어린 부서 로그인은 「보호자(부모님)가 함께 확인했어요」를 한 번 체크하고 그 날짜를 남긴다
//      (users.guardian_ok_at · supabase/users_consents.sql). 대상 부서는 needsGuardian() 이 정한다 — app.js 와 두 곳.
//   ② 게시판 이용 규칙 — 처음 글·답글을 쓰기 전에 한 번 동의(users.board_rules_at). 관리자 글이 아니면 서버가 확인한다.
//   ③ 이분 글 가리기 — 내 화면에서만(board_blocks · supabase/board_blocks.sql). 가린 분의 user_id 는 어떤 응답에도 안 싣는다.
//   ④ 「내게 주시는 말씀」 AI 답 알리기(sermon_answer_reports · supabase/sermon_answer_reports.sql).
//   설명: docs/notes/board.md 「이용 규칙 · 가리기」 · docs/notes/store-review.md
// ⚠️ 허용 목록(부서 · AI 답 까닭)은 앱·서버(·SQL CHECK) 여러 곳이다 — tests/store-review.test.cjs 가 맞대 본다.
// ============================================================
// ── 스토어 심사 — 순수 함수 (여기부터) ──
// ⚠️ 이 구간은 타입 표기 없이 쓴다 — tests/store-review.test.cjs 가 떼어 node:vm 으로 돌린다.
const STORE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function storeUid(v) {
  const s = String(v == null ? "" : v).trim().toLowerCase();
  return STORE_UUID.test(s) ? s : "";
}

// ① 보호자 확인 — 만 14세 미만이 있을 수 있는 부서. ⚠️ app.js 의 같은 이름 목록과 **글자까지 같아야** 한다.
//   · 늘 묻는 부서: 영아·유아·유치·유년·초등(초6 = 만 11~12세) · 사랑부(나이로 가를 수 없는 부서라 묻는다 — 교회 담당자 확인 필요)
//   · 학년으로 가르는 부서: 중등부 1·2학년(중2 는 그해 생일 전까지 만 13세) — 학년에 숫자가 없으면 묻는다(보수 쪽)
//   · 묻지 않는 부서: 중등부 3학년(새 학년 3월에 이미 만 14세) · 고등부 · 청년부
//   · 학년 칸에 교사·선생님 같은 말이 있으면 어른이다(그 부서 선생님이 부서로 들어오신 경우)
//   ⚠️ 정규식 대신 includes 를 쓴다 — 이 파일이 껍데기를 거쳐 고쳐질 때 역슬래시가 풀린 적이 있다.
const GUARDIAN_BU = ["영아부", "유아부", "유치부", "유년부", "초등부", "사랑부"];
const GUARDIAN_GRADE_BU = { "중등부": [1, 2] };
const GUARDIAN_ADULT_WORDS = ["교사", "선생", "부장", "전도사", "강도사", "목사", "간사", "총무"];
function needsGuardian(p) {
  if (!p || typeof p !== "object" || String(p.type || "").trim() !== "교회학교") return false;
  const bu = String(p.bu == null ? "" : p.bu).trim();
  const grade = String(p.grade == null ? "" : p.grade).trim();
  if (GUARDIAN_ADULT_WORDS.some((w) => grade.includes(w))) return false;
  if (GUARDIAN_BU.indexOf(bu) >= 0) return true;
  const grades = Object.prototype.hasOwnProperty.call(GUARDIAN_GRADE_BU, bu) ? GUARDIAN_GRADE_BU[bu] : null;
  if (!grades) return false;
  const m = grade.match(/[0-9]+/);
  return !m || grades.indexOf(Number(m[0])) >= 0;
}

// ② 게시판 이용 규칙 — 이날 이후에 동의했어야 「동의함」. 규칙을 바꾸면 이 날짜를 올려 모두에게 다시 묻는다.
//   ⚠️ app.js BOARD_RULES_VER 와 같아야 한다(앱이 「이미 동의함」을 기억하는 열쇠).
const BOARD_RULES_SINCE = "2026-10-01";
function boardRulesAccepted(at) {
  if (!at) return false;
  const t = Date.parse(String(at));
  return Number.isFinite(t) && t >= Date.parse(BOARD_RULES_SINCE + "T00:00:00+09:00");
}

// ③ 가리기 — 가린 분이 쓴 글·답글을 뺀다(내 화면에서만). 그분 글에 달린 남의 답글도 글과 함께 빠진다.
//   blocked 는 user_id 배열(소문자). 옛 글(user_id 없음)은 가릴 수 없어 그대로 둔다.
function boardDropBlocked(posts, replies, blocked) {
  const set = new Set((Array.isArray(blocked) ? blocked : []).map((x) => String(x).toLowerCase()));
  const ps = Array.isArray(posts) ? posts : [];
  const rs = Array.isArray(replies) ? replies : [];
  if (!set.size) return { posts: ps, replies: rs };
  const keep = (r) => !(r && r.user_id && set.has(String(r.user_id).toLowerCase()));
  const kept = ps.filter(keep);
  const ids = new Set(kept.map((p) => p.id));
  return { posts: kept, replies: rs.filter((r) => keep(r) && ids.has(r.post_id)) };
}
// ③-2 첫 화면 「새글 N」(boardCheck)도 같은 규칙으로 센다 — 가린 분이 있을 때만 이 길로 온다.
//   recent  = 그 뒤 올라온 글({id, user_id}) — 센다
//   parents = 새 답글이 달린 **옛** 글({id, user_id}) — 세지 않고, 가린 분의 글인지만 본다(그 글의 답글은 함께 빠진다)
//   replies = 그 뒤 올라온 답글({id, post_id, user_id}) — 센다
//   boardList 와 갈라지면 「새글 1」을 보고 열었는데 아무것도 없다(가린 분이 글을 올린 날마다).
function boardCountVisible(recent, parents, replies, blocked) {
  const rs = Array.isArray(recent) ? recent : [];
  const kept = boardDropBlocked(rs.concat(Array.isArray(parents) ? parents : []), replies, blocked);
  const fresh = new Set(rs.map((p) => p.id));
  return kept.posts.filter((p) => fresh.has(p.id)).length + kept.replies.length;
}

// ④ AI 답 알리기 — 까닭 허용 목록은 세 곳(여기 · app.js · sermon_answer_reports.sql CHECK)
const SERMON_REPORT_REASONS = ["wrong", "offensive", "other"];
const SERMON_REPORT_LABELS = { wrong: "설교와 다르거나 틀려요", offensive: "불쾌하거나 부적절해요", other: "기타" };
const SERMON_REPORT_NOTE_MAX = 200;       // SQL CHECK char_length(note) <= 200
const SERMON_REPORT_ANSWER_MAX = 1200;    // SQL CHECK char_length(answer) between 1 and 1200
const SERMON_REPORT_KEEP_DAYS = 90;       // 처리 뒤 이만큼 지나면 지운다(SQL cron · 개인정보 안내와 같아야 한다)
// 질문 → 캐시 열쇠. ⚠️ sermonChat 의 캐시 열쇠와 **같은 함수**를 쓴다 — 다르면 알린 답을 캐시에서 못 찾고,
//   관리자 「답 지우기」가 엉뚱한 줄을 지운다.
function sermonQuestionKey(m) {
  return String(m == null ? "" : m).trim().replace(/\s+/g, " ").slice(0, 500);
}
function sermonReportInput(b) {
  const src = b && typeof b === "object" ? b : {};
  const userId = storeUid(src.user_id);
  if (!userId) return { error: "no-user" };
  const reason = String(src.reason == null ? "" : src.reason);
  if (SERMON_REPORT_REASONS.indexOf(reason) < 0) return { error: "bad-reason" };
  const question = sermonQuestionKey(src.question);
  if (!question) return { error: "bad-args" };
  const answer = Array.from(String(src.answer == null ? "" : src.answer).trim())
    .slice(0, SERMON_REPORT_ANSWER_MAX).join("").trim();
  const note = Array.from(String(src.note == null ? "" : src.note).replace(/\s+/g, " ").trim())
    .slice(0, SERMON_REPORT_NOTE_MAX).join("").trim();
  return { userId, reason, question, answer, note: note || null };
}
// 처리 전 알림을 질문 하나당 한 묶음으로 — 많이 알려진 것, 최근 것이 앞.
// ⚠️ 정해진 칸만 옮겨 담는다 — 들어온 줄에 reporter_id 가 섞여 있어도 밖으로 안 나간다.
function sermonReportGroup(rows) {
  const byQ = new Map();
  for (const r of (Array.isArray(rows) ? rows : [])) {
    const q = String(r.question || "");
    let g = byQ.get(q);
    if (!g) {
      g = { id: Number(r.id), question: q, answer: String(r.answer || ""), from_cache: !!r.from_cache,
            count: 0, reasons: {}, notes: [], first_at: r.created_at, last_at: r.created_at };
      byQ.set(q, g);
    }
    g.count++;
    g.reasons[r.reason] = (g.reasons[r.reason] || 0) + 1;
    if (r.note) g.notes.push(String(r.note));
    if (r.from_cache && !g.from_cache) { g.answer = String(r.answer || ""); g.from_cache = true; }   // 서버가 준 답을 앞세운다
    if (r.created_at < g.first_at) g.first_at = r.created_at;
    if (r.created_at > g.last_at) { g.last_at = r.created_at; g.id = Number(r.id); }
  }
  return Array.from(byQ.values()).sort((a, b) =>
    (b.count - a.count) || (a.last_at < b.last_at ? 1 : a.last_at > b.last_at ? -1 : 0));
}
// ── 스토어 심사 — 순수 함수 (여기까지) ──

// 칸·표가 아직 없는 DB(SQL 을 돌리기 전) — 500 대신 「아직 준비 안 됨」으로 넘긴다
function storeSchemaMissing(e: any) {
  const c = String(e?.code || ""), m = String(e?.message || "");
  return c === "42703" || c === "42P01" || c === "PGRST204" || c === "PGRST205" ||
    /does not exist|schema cache|Could not find/i.test(m);
}

// 게시판 이용 규칙에 동의했나. 칸이 아직 없으면(SQL 전) 막지 않는다 — 함수가 먼저 나가도 글쓰기가 멈추지 않게.
async function boardRulesOk(uid: string): Promise<boolean> {
  if (!uid) return false;
  const { data, error } = await db.from("users").select("board_rules_at").eq("id", uid).maybeSingle();
  if (error) { if (storeSchemaMissing(error)) return true; throw error; }
  return boardRulesAccepted(data && (data as any).board_rules_at);
}

// 성도 — 게시판 이용 규칙 동의. 같은 분이 다시 눌러도 날짜만 새로 적힌다.
async function boardRulesAccept(b: any) {
  const uid = storeUid(b.user_id);
  if (!uid) return { ok: false, error: "no-user" };
  const { data, error } = await db.from("users").update({ board_rules_at: new Date().toISOString() })
    .eq("id", uid).select("id");
  if (error) { if (storeSchemaMissing(error)) return { ok: true, recorded: false }; throw error; }
  if (!(data && data.length)) return { ok: false, error: "no-user" };
  return { ok: true, recorded: true, since: BOARD_RULES_SINCE };
}

// 내가 가린 분들의 user_id — boardList 안에서만 쓰고 밖으로 내보내지 않는다. 표가 없으면 빈 목록.
async function boardBlockedIds(uid: string): Promise<string[]> {
  if (!uid) return [];
  const { data, error } = await db.from("board_blocks").select("blocked_id").eq("blocker_id", uid).limit(1000);
  if (error) { if (storeSchemaMissing(error)) return []; throw error; }
  return ((data ?? []) as any[]).map((r) => String(r.blocked_id).toLowerCase());
}

// 성도 — 이 글(답글)을 쓴 분의 글을 내 화면에서 가린다. 화면은 글 번호만 보내고 글쓴 분은 서버가 찾는다.
async function boardBlock(b: any) {
  const uid = storeUid(b.user_id);
  if (!uid) return { ok: false, error: "no-user" };
  const kind = b.kind === "reply" ? "reply" : "post";
  const id = boardReportPosInt(b.id);
  if (!id) return { ok: false, error: "bad-args" };
  const table = kind === "reply" ? "board_replies" : "board_posts";
  // select("*") — 옛 DB(is_admin·rich·user_id 칸 이전)에서도 안전하게. 응답에는 아무 칸도 안 싣는다.
  const { data: row, error: e1 } = await db.from(table).select("*").eq("id", id).maybeSingle();
  if (e1) throw e1;
  if (!row) return { ok: false, error: "not-found" };
  if (row.is_admin || row.rich) return { ok: false, error: "admin" };   // 운영진 안내는 가리지 않는다
  const author = String(row.user_id || "").toLowerCase();
  if (!author) return { ok: false, error: "no-author" };                // 옛 글 — 글쓴 분을 알 수 없다
  if (author === uid) return { ok: false, error: "own" };
  const name = Array.from(norm(row.name)).slice(0, 60).join("") || null;
  const { error } = await db.from("board_blocks").insert({ blocker_id: uid, blocked_id: author, blocked_name: name });
  if (error) {
    const code = String((error as any).code || ""), msg = String(error.message || "") + " " + String((error as any).details || "");
    if (code === "23505" || /duplicate key/i.test(msg)) return { ok: true, already: true };
    if (storeSchemaMissing(error)) return { ok: false, error: "not-ready" };
    if (code === "23503") return { ok: false, error: /blocker/i.test(msg) ? "no-user" : "not-found" };
    throw error;
  }
  return { ok: true };
}

// 성도 — 내가 가린 분 목록. ⚠️ 이름(가릴 때의 표시 이름)과 이 표의 줄 번호만 — blocked_id 는 고르지도 않는다.
async function boardBlocks(b: any) {
  const uid = storeUid(b.user_id);
  if (!uid) return { ok: false, error: "no-user" };
  const { data, error } = await db.from("board_blocks").select("id,blocked_name,created_at")
    .eq("blocker_id", uid).order("created_at", { ascending: false }).limit(1000);
  if (error) { if (storeSchemaMissing(error)) return { ok: false, error: "not-ready" }; throw error; }
  return { ok: true, list: ((data ?? []) as any[]).map((r) => ({ id: Number(r.id), name: r.blocked_name || "이름 모름", created_at: r.created_at })) };
}

// 성도 — 다시 보기(가리기 풀기). 내 줄만 지울 수 있다.
async function boardUnblock(b: any) {
  const uid = storeUid(b.user_id);
  if (!uid) return { ok: false, error: "no-user" };
  const id = boardReportPosInt(b.block_id);
  if (!id) return { ok: false, error: "bad-args" };
  const { data, error } = await db.from("board_blocks").delete().eq("id", id).eq("blocker_id", uid).select("id");
  if (error) { if (storeSchemaMissing(error)) return { ok: false, error: "not-ready" }; throw error; }
  return { ok: true, removed: (data ?? []).length };
}

// 성도 — 「내게 주시는 말씀」 AI 답 알리기. 답은 서버 캐시에서 찾은 것을 먼저 쓴다(from_cache).
async function sermonAnswerReport(b: any) {
  const v: any = sermonReportInput(b);
  if (v.error) return { ok: false, error: v.error };
  let answer = v.answer, fromCache = false;
  try {
    const { data: c } = await db.from("sermon_ai_cache").select("answer")
      .eq("kind", "chat").eq("cache_key", v.question).maybeSingle();
    if (c && c.answer) {
      answer = Array.from(String(c.answer)).slice(0, SERMON_REPORT_ANSWER_MAX).join("");
      fromCache = true;
    }
  } catch (_) { /* 캐시를 못 읽어도 앱이 보낸 답으로 받는다 */ }
  if (!answer) return { ok: false, error: "bad-args" };
  const { error } = await db.from("sermon_answer_reports").insert({
    reporter_id: v.userId, question: v.question, answer, from_cache: fromCache, reason: v.reason, note: v.note,
  });
  if (error) {
    const code = String((error as any).code || ""), msg = String(error.message || "") + " " + String((error as any).details || "");
    if (code === "23505" || /duplicate key/i.test(msg)) return { ok: true, already: true };
    if (storeSchemaMissing(error)) return { ok: false, error: "not-ready" };
    if (code === "23503") return { ok: false, error: "no-user" };
    throw error;
  }
  try { await sermonAnswerReportNotify(); } catch (_) { /* 알림 실패가 알림 받기를 막지 않는다 */ }
  return { ok: true };
}

// 담당자(app_config boardAdmins — 게시판 신고와 같은 분들)에게 Web Push. 10분에 한 번까지 · 본문에 질문·답·알린 분을 안 싣는다.
async function sermonAnswerReportNotify() {
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: recent } = await db.from("push_log").select("sent_at")
    .eq("mode", "answer-report").gte("sent_at", since).limit(1);
  if ((recent ?? []).length) return { sent: 0, error: "throttled" };
  const list = await configAdminSubs("boardAdmins");
  if (!list.length) return { sent: 0, error: "no-admin" };
  const payload = JSON.stringify({
    title: "[AI 답 알림]",
    body: "「내게 주시는 말씀」 답 하나가 알려졌습니다 — 관리자 「게시판 관리」에서 확인해 주세요.",
    url: "https://gocheok.onlybible.kr/admin.html",
  });
  return await pushToSubs(list, payload, "answer-report", "AI 답 알림");
}

// 관리자 — 처리 전 AI 답 알림(질문별 묶음). 알린 분은 싣지 않는다(몇 분인지만).
async function sermonAnswerReports(b: any) {
  const err = adminError(b); if (err) return { ok: false, error: err };
  const cutoff = new Date(Date.now() - SERMON_REPORT_KEEP_DAYS * 86400000).toISOString();
  const purge = await db.from("sermon_answer_reports").delete().lt("resolved_at", cutoff);
  if (purge.error) { if (storeSchemaMissing(purge.error)) return { ok: false, error: "not-ready" }; throw purge.error; }
  const { data, error } = await db.from("sermon_answer_reports")
    .select("id,question,answer,from_cache,reason,note,created_at")      // ⚠️ reporter_id 는 고르지도 않는다
    .is("resolved_at", null).order("created_at", { ascending: false }).limit(1000);
  if (error) { if (storeSchemaMissing(error)) return { ok: false, error: "not-ready" }; throw error; }
  return { ok: true, labels: SERMON_REPORT_LABELS, keepDays: SERMON_REPORT_KEEP_DAYS, items: sermonReportGroup(data ?? []) };
}

// 관리자 — 그 질문의 처리 전 알림을 닫는다. op: "resolve"(답은 그대로) | "uncache"(캐시된 답을 지워 다음 질문 때 새로 만든다)
async function sermonAnswerReportResolve(b: any) {
  const err = adminError(b); if (err) return { ok: false, error: err };
  const id = boardReportPosInt(b.id);
  const op = b.op === "uncache" ? "uncache" : b.op === "resolve" ? "resolve" : "";
  if (!id || !op) return { ok: false, error: "bad-args" };
  const { data: row, error: e1 } = await db.from("sermon_answer_reports").select("question").eq("id", id).maybeSingle();
  if (e1) { if (storeSchemaMissing(e1)) return { ok: false, error: "not-ready" }; throw e1; }
  if (!row) return { ok: false, error: "not-found" };
  let uncached = 0;
  if (op === "uncache") {
    const { data: gone, error: e2 } = await db.from("sermon_ai_cache").delete()
      .eq("kind", "chat").eq("cache_key", row.question).select("cache_key");
    if (e2) throw e2;
    uncached = (gone ?? []).length;
  }
  const { data, error } = await db.from("sermon_answer_reports").update({
    resolved_at: new Date().toISOString(), resolution: op === "uncache" ? "uncached" : "kept",
  }).is("resolved_at", null).eq("question", row.question).select("id");
  if (error) throw error;
  return { ok: true, resolved: (data ?? []).length, uncached };
}

// ---------- 사역신청(2027) ----------
// 필사 노트 신청(pilsa*)과 같은 뼈대다. 다른 점 두 가지:
//   · 한 해에 한 사람 한 건 — unique(year, user_id)
//   · 고른 사역이 최대 3개 — 순위는 없다(2026-09-08 결정)
// ⚠️ 응답에 user_id 를 절대 싣지 않는다. 이 API 는 JWT 가 없어 남의 user_id 하나면
//    그 사람 행세가 된다(boardList 가 실제로 그랬다). 화면이 필요한 건 "내 것인가"뿐이다.
// ⚠️ 「미채택」은 2026-09-17 뺐다(성도님 결정) — 임명되지 않은 분은 「취소」+사유로 정리한다.
//    아래 로직의 미채택 분기는 옛 행이 있어도 깨지지 않게 남겨 둔다(운영에는 한 건도 없었다).
//    DB CHECK(ministry_cancel_status.sql)는 미채택을 여전히 받는다 — 더 좁히려면 개발→운영 마이그레이션.
const MINISTRY_STATUS = ["신청완료", "접수완료", "임명확정", "취소"];
// 담당자가 **접수완료**를 누르면 그 건은 잠긴다 — 성도가 고치거나 뺄 수 없고,
// 그 순간 팀 「자세히 보기」의 명단에 이름이 올라간다(2026-09-09 성도님 요구).
// ⚠️ 잠겨도 「3개가 안 찼으면 더 신청」은 열려 있다. 그래서 한 사람이 한 행이 아니라
//    **한 팀이 한 행**이다 — 행이 통째로 잠기면 더 담을 자리가 없어진다.
// ⚠️ 「취소」도 잠긴다 — 관리자가 부서장 요청을 받아 내린 결정이라 성도가 되돌리지 못한다.
const MINISTRY_LOCKED = ["접수완료", "임명확정", "미채택", "취소"];
const isLocked = (st: string) => MINISTRY_LOCKED.indexOf(st) >= 0;
// 결정 — 번호 확인(kept)·같은 이름·번호 묻기(dup-phone)는 이 줄들을 보지 않는다(교회 어드민은 결정 뒤에도 번호를 남긴다 · 2026-10)
const MINISTRY_DECIDED = ["임명확정", "미채택", "취소"];
// ⚠️ 「미채택」은 자리를 **비운다**. 잠기기는 해도(그 팀은 결과가 났다) 3개 상한에서는
//    빼야 한다 — 안 그러면 떨어진 분이 다른 팀에 신청조차 못 하는 막다른 길이 된다.
// ⚠️ 「미채택」과 「취소」는 자리를 **도로 내놓는다**. 안 그러면 떨어지거나 취소당한 분이
//    다른 사역에 신청조차 못 하는 막다른 길이 된다.
const countsToCap = (st: string) => st !== "미채택" && st !== "취소";
// 명단에 오르는 상태 — 미채택은 함께 섬기는 분이 아니다
const MINISTRY_ROSTER = ["접수완료", "임명확정"];

// 「화평 20목장」 → 「화평-20」, 「중등부 2학년」 → 「중등부-2」
// ⚠️ 정규식을 쓰지 않는다 — 이 파일이 껍데기를 거쳐 고쳐질 때 역슬래시가 풀린 적이 있다.
function ministryWhoShort(who: unknown): string {
  return norm(who).split(" ").map((x: string) => {
    const t = x.trim();
    return (t.endsWith("목장") || t.endsWith("학년")) ? t.slice(0, -2) : t;
  }).filter(Boolean).join("-");
}

// 명단 한 줄 — 「김세웅 안수집사 (화평-20)」
// ⚠️ 이름은 성도가 스스로 적은 값이라 반드시 막아서 내보낸다. 이 줄은 앱이 날 HTML로
//    그리는 자리다(관리자가 넣은 꾸밈을 살리려고). 막지 않으면 이름 한 칸이 화면을 먹는다.
function ministryEsc(v: unknown): string {
  return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function ministryMemberLine(r: any): string {
  const nm = ministryEsc(norm(r.name));
  if (!nm) return "";
  const pos = ministryEsc(norm(r.position));
  const wh = ministryEsc(ministryWhoShort(r.who));
  return nm + (pos ? " " + pos : "") + (wh ? " (" + wh + ")" : "");
}
const MINISTRY_MAX = 3;
// 휴대폰 뒷 4자리 — 이 앱은 비밀번호가 없어(교구·목장·이름 로그인) 고치기·취소를
// 이걸로 한 번 더 확인한다. 담당자가 교적과 맞대 보는 자료이기도 하다.
// ⚠️ 개인정보다. 뒷 4자리만 받고, 결정(임명확정·미채택)이 나면 지운다.
// 휴대폰 번호 — 필사 노트 신청과 **같은 규칙**을 쓴다(PILSA_PHONE_RE / pilsaPhone).
// ⚠️ 따로 만들지 않는다. 둘이 갈라지면 한쪽만 고치게 된다.

// 신청 기간·연도는 app_config('ministry')에 둔다 — 코드에 박으면 바뀔 때마다 배포해야 한다
async function ministryCfg() {
  const { data } = await db.from("app_config").select("value").eq("key", "ministry").maybeSingle();
  const v = (data?.value ?? {}) as any;
  const year = Number(v.year) || 2027;
  const open = norm(v.open), close = norm(v.close);
  const today = kstDay(new Date().toISOString());
  // 기간이 비어 있으면 닫힌 것으로 본다 — 실수로 상시 개방되지 않게
  const isOpen = !!(open && close && today >= open && today <= close);
  return { year, open, close, today, isOpen };
}

// 사역신청 시험 참여자(2026-09-30) — 교회 어드민 「🧪 시험 참여자」가 고치는 app_config `ministryTesters`(identity_key 배열)에
// 오른 계정은 기간 밖에도 첫 화면에 🤝 사역신청이 보이고 신청·취소가 된다.
// ⚠️ 키가 아니라 사람으로 맞댄다(소속이 바뀐 분 — 담당자 확인과 같은 규칙).
// ⚠️ PUBLIC_CONFIG_KEYS 에 넣지 않는다 — 이름이 든 명단이다. 앱에는 「이 계정인가」 하나만 답한다.
async function ministryIsTester(userId: string): Promise<boolean> {
  if (!userId) return false;
  return (await ministryTesterIds()).has(userId);
}
// 시험 참여자 계정(user id) 모두 — 명단을 한 번 읽어 사람으로 푼다. 여럿을 한꺼번에 견줄 때 이것을 한 번만 부른다
//   (교육 알림 eduNotifySend · 2026-10-06 — 분마다 ministryIsTester 를 부르면 명단을 그만큼 다시 읽는다). DB 오류는 던진다.
async function ministryTesterIds(): Promise<Set<string>> {
  const { data, error } = await db.from("app_config").select("value").eq("key", "ministryTesters").maybeSingle();
  if (error) throw error;
  const keys = Array.isArray(data?.value) ? (data!.value as any[]).map((x) => norm(String(x))).filter(Boolean) : [];
  if (!keys.length) return new Set();
  return new Set((await ministryKeysToUsers(keys)).values());
}
async function ministryTester(b: any) {
  return { ok: true, tester: await ministryIsTester(String(b.user_id || "")) };
}

// ---------- 사역 이력 확인 · 정정 신청(2026-10-01) ----------
// 설계: docs/superpowers/specs/2026-10-01-ministry-history-check-design.md §5.3
// 교인 찾기·표는 교회 어드민 한 곳(church-admin 내부 갈래 internalMyHistory·internalHistoryRequest) — 여기는 문 검사와 users 값만 맡는다.
// ⚠️ 화면이 보낸 이름·소속은 쓰지 않는다 — user_id 로 users 줄을 꺼낸다.
// ⚠️ b.preview 는 받지 않는다 — 서버가 확인할 수 없는 값이다(ministryApply 의 ⚠️⚠️). 미리보기 화면은 관리자 비번(pw)으로 통과한다.
// ⚠️ 새 담당자용 사역 액션이 아니다(얼림 대상 아님) — 성도님 화면용 둘이다.
const MH_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// 교회 어드민이 막은 까닭 — 그대로 화면에 넘긴다(그 밖의 실패는 upstream 으로 묶는다)
const MH_PASS_ERRORS = ["bad-kind", "too-long", "no-row", "need-detail", "bad-year", "need-team",
  "not-found", "already-found", "already-open", "not-yours", "too-many"];

async function ministryHistoryOpen(b: any, userId: string): Promise<boolean> {
  if ((await ministryCfg()).isOpen) return true;
  if (!adminError(b)) return true;
  return await ministryIsTester(userId);
}

async function ministryHistoryUser(b: any): Promise<{ userId: string; who: Record<string, string> } | { error: string }> {
  const userId = String(b.user_id || "").trim();
  if (!MH_UUID.test(userId)) return { error: "no-user" };
  if (!(await ministryHistoryOpen(b, userId))) return { error: "closed" };
  const { data, error } = await db.from("users").select("type,gu,mok,bu,grade,name").eq("id", userId).maybeSingle();
  if (error) throw error;
  if (!data) return { error: "no-user" };
  return { userId, who: { type: data.type, gu: data.gu ?? "", mok: data.mok ?? "", bu: data.bu ?? "", grade: data.grade ?? "", name: data.name } };
}

// 교회 어드민 함수의 내부 갈래 — 8초에서 끊는다(교회 어드민이 멈춰도 성도님 화면이 오래 돌지 않게)
async function churchAdminInternal(payload: Record<string, unknown>): Promise<any | null> {
  try {
    const res = await fetch(Deno.env.get("SUPABASE_URL") + "/functions/v1/church-admin", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-key": Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
    return await res.json().catch(() => null);
  } catch (e) {
    console.error("churchAdminInternal", e);
    return null;
  }
}

// 교회 어드민 history-check.ts 의 HISTORY_OUT_KEYS·REQUEST_OUT_KEYS 와 같은 칸 — 저쪽 응답이 늘어도 앱으로는 이 칸만 나간다
//   직분(position)은 싣지 않는다 — 교회 어드민이 보내지 않는다(2026-10-01 친구 요청 · 2026-10-02 여기서도 뺌)
//   committee_text — 빠진 사역 「부서」 칸(2026-10-02 두 칸 · 교회 어드민 SQL 009) · null 이면 옛 한 칸 신청(team_text 에 「부서·팀」 글)
const mhRowOut = (r: any) => ({ id: r?.id, year: r?.year, committee: r?.committee, team: r?.team, role_title: r?.role_title });
const mhReqOut = (q: any) => ({ id: q?.id, history_id: q?.history_id ?? null, kind: q?.kind, detail: q?.detail, year: q?.year ?? null,
  committee_text: q?.committee_text ?? null, team_text: q?.team_text, status: q?.status, answer: q?.answer, created_at: q?.created_at });

async function ministryHistoryMine(b: any) {
  const le = await lifeError(b); if (le) return { ok: false, error: le };
  const u = await ministryHistoryUser(b);
  if ("error" in u) return { ok: false, error: u.error };
  const j = await churchAdminInternal({ action: "internalMyHistory", who: u.who, user_id: u.userId });
  if (!j || j.ok !== true) {
    console.error("ministryHistoryMine", j);
    return { ok: false, error: "upstream" };
  }
  return { ok: true, who: u.who, found: !!j.found,
    rows: Array.isArray(j.rows) ? j.rows.map(mhRowOut) : [], requests: Array.isArray(j.requests) ? j.requests.map(mhReqOut) : [] };
}

async function ministryHistoryRequest(b: any) {
  const le = await lifeError(b); if (le) return { ok: false, error: le };
  const u = await ministryHistoryUser(b);
  if ("error" in u) return { ok: false, error: u.error };
  // committee_text(빠진 사역 「부서」 칸 · 2026-10-02)는 글자일 때만 넘긴다 — 없으면 교회 어드민 parseRequest 가 옛 한 칸으로 읽는다(옛 캐시 앱)
  const j = await churchAdminInternal({
    action: "internalHistoryRequest", who: u.who, user_id: u.userId,
    history_id: b.history_id ?? null, kind: b.kind, detail: b.detail, year: b.year,
    ...(typeof b.committee_text === "string" ? { committee_text: b.committee_text } : {}),
    team_text: b.team_text,
  });
  if (j && j.ok === true) return { ok: true };
  if (j && MH_PASS_ERRORS.includes(j.error)) return { ok: false, error: j.error };
  console.error("ministryHistoryRequest", j);
  return { ok: false, error: "upstream" };
}

// ---------- 교육신청(2026-10-05 · 설계 docs/superpowers/specs/2026-10-05-education-courses-design.md §8) ----------
// ⚠️ 정원·대기·취소 마감은 SQL 함수(supabase/edu.sql) 한 곳 — 여기서 상태를 직접 쓰지 않는다.
// ⚠️ 응답에 user_id·ident_key 를 싣지 않는다. 문(eduOpen 또는 시험 참여자)은 신청에서만 막는다 — 목록·자세히는 열린 강좌라 누구에게 보여도 된다.
const EDU_LIST_STATUS = ["open", "closed", "running"];
const EDU_KIND_LABEL: Record<string, string> = { regular: "정규 과정", lecture: "특강·세미나", training: "교사·사역자 교육" };
const EDU_ENROLL_LABEL: Record<string, string> = { applied: "신청", confirmed: "확정", waitlisted: "대기", cancelled: "취소", declined: "반려" };
const eduKst = () => kstDay(new Date().toISOString());
// 문은 서버에서 value === true 한 가지로 본다 — 앱 화면도 eduList 의 open 을 그대로 써야 한다(같은 문).
const eduUid = (v: unknown) => { const s = String(v ?? "").trim(); return MH_UUID.test(s) ? s : ""; };

async function eduGateOpen(userId: string): Promise<boolean> {
  const { data } = await db.from("app_config").select("value").eq("key", "eduOpen").maybeSingle();
  if (data?.value === true) return true;
  try { return userId ? await ministryIsTester(userId) : false; } catch (_) { return false; }   // 실패하면 닫힘
}

function eduPhase(c: any, today: string): string {
  if (c.status === "running") return "running";
  if (c.status === "closed") return "closed";
  // 목록에 안 나오는 강좌(내 강좌 카드로만 열린다 · eduCourse) — 「신청하기」가 뜨지 않게
  if (c.status === "done" || c.status === "archived") return "closed";
  if (c.status === "draft") return "upcoming";
  if (c.apply_from && today < c.apply_from) return "upcoming";
  if (c.apply_to && today > c.apply_to) return "closed";
  return "open";
}

async function eduSessionsOf(ids: string[]) {
  const by: Record<string, any[]> = {};
  if (!ids.length) return by;
  // ⚠️ 강좌 200개 x 회차면 1,000행을 넘을 수 있다 — PostgREST 는 조용히 자르므로 fetchAllRows 로 이어 받는다.
  // 날짜 순(그다음 번호) — 첫 날·마지막 날·취소 마감·다음 회차가 edu_cancel 의 min(on_date) 과 같은 기준이어야 한다.
  // id 는 내 출석 칸(myState)을 회차에 붙이는 데만 쓴다 — 응답에는 싣지 않는다
  const rows = await fetchAllRows(() => db.from("edu_sessions").select("id,course_id,no,on_date,start_time,end_time,topic,place")
    .in("course_id", ids).order("course_id").order("on_date").order("no").order("id"));
  for (const s of rows) (by[(s as any).course_id] ||= []).push(s);
  return by;
}

async function eduCountsOf(ids: string[]) {
  // ⚠️ 센 값은 SQL 함수 edu_course_counts 에서 받는다 — 줄을 가져와 여기서 세면 PostgREST 가 1,000행에서 조용히 자른다.
  const by: Record<string, { confirmed: number; waitlisted: number }> = {};
  for (const id of ids) by[id] = { confirmed: 0, waitlisted: 0 };
  if (!ids.length) return by;
  const { data, error } = await db.rpc("edu_course_counts", { p_ids: ids });
  if (error) throw error;
  for (const r of (data ?? []) as any[]) if (by[r.course_id]) by[r.course_id] = { confirmed: r.confirmed ?? 0, waitlisted: r.waitlisted ?? 0 };
  return by;
}

// 교육 기간 — 교육 기간이 있으면 그것, 없으면 회차에서(ss 는 날짜 차례 · eduSessionsOf) — 시작일만 있고 마지막 회차가 그보다 앞이면
//   끝을 비운다(뒤집힌 기간을 안 보이게). 목록·자세히(firstDate·lastDate)와 수료증(from·to)이 함께 쓴다 —
//   교회 어드민 edu-rules.ts certPeriod(수료증 인쇄)와 같은 규칙.
function eduPeriod(c: any, ss: any[]): { from: string | null; to: string | null } {
  const from = c.starts_on ?? ss[0]?.on_date ?? null;
  const lastS = ss[ss.length - 1]?.on_date ?? null;
  const to = c.ends_on ?? (lastS && (!from || lastS >= from) ? lastS : null);
  return { from, to };
}

function eduCourseOut(c: any, ss: any[], cnt: { confirmed: number; waitlisted: number }, today: string) {
  const { from: eduFirst, to: eduLast } = eduPeriod(c, ss);
  return {
    id: c.id, title: c.title, kind: c.kind, kindLabel: EDU_KIND_LABEL[c.kind] || c.kind, term: c.term || "",
    teacher: c.teacher_label || "", place: c.place || "", fee: c.fee_note || "", contact: c.contact_note || "", target: c.target || "",
    capacity: c.capacity ?? null, mode: c.mode, waitlist: !!c.waitlist, applyFrom: c.apply_from, applyTo: c.apply_to,
    startsOn: c.starts_on ?? null, endsOn: c.ends_on ?? null,   // 교육 기간(교회 어드민이 정한다 · 없으면 null)
    status: c.status, phase: eduPhase(c, today), sessionsCount: ss.length,
    firstDate: eduFirst, lastDate: eduLast,
    confirmed: cnt.confirmed, waitlisted: cnt.waitlisted,
  };
}

// 출석률(2단계 · 2026-10-05 친구 결정) — 지각 = 출석 · 공결은 분모에서 뺀다 · 아직 체크 안 한 회차는 분모에 넣지 않는다(denom 0 이면 pct null).
// ⚠️ 이 규칙은 두 곳에 산다 — 교회 어드민 supabase/functions/church-admin/edu-rules.ts(담당자 출석 현황·엑셀)와 이 앱 js/edu.js(성도님 화면).
//    아래 함수 몸통은 그 둘과 **한 글자도 같다** — tests/edu-front.test.cjs 가 js/edu.js 의 것과 글자로 맞대 본다. 고칠 때는 세 곳을 함께.
function eduAttendRate(c) {
  var n = function (v) { var x = Number(v); return Number.isFinite(x) && x > 0 ? Math.floor(x) : 0; };
  var o = c || {};
  var attended = n(o.present) + n(o.late);
  var denom = attended + n(o.absent);
  return { attended: attended, denom: denom, pct: denom > 0 ? Math.round(attended * 100 / denom) : null };
}

// 내 신청 줄들의 출석 — 신청 번호 → (회차 id → 상태). ⚠️ 부르는 쪽이 **그 사람 줄 id 만** 넘긴다(eduMineRows 가 user_id 로 고른 줄).
//   한 분이 강좌 여럿 × 회차면 1,000줄을 넘을 수 있어 쪽 넘기기. 체크한 담당자(marked_by)는 읽지 않는다.
async function eduAttendOf(enrollIds: number[]) {
  const by = new Map<number, Map<number, string>>();
  if (!enrollIds.length) return by;
  const rows = await fetchAllRows(() => db.from("edu_attendance").select("enrollment_id,session_id,state")
    .in("enrollment_id", enrollIds).order("enrollment_id").order("session_id"));
  for (const r of rows as any[]) {
    const m = by.get(Number(r.enrollment_id)) || new Map<number, string>();
    m.set(Number(r.session_id), String(r.state));
    by.set(Number(r.enrollment_id), m);
  }
  return by;
}

// 내 출석 요약 — {present, late, absent, excused, marked, pct} · marked = 체크한 칸 수(네 칸 합) · pct 는 eduAttendRate(분모 0 이면 null)
function eduAttendOut(m?: Map<number, string>) {
  const k: Record<string, number> = { present: 0, late: 0, absent: 0, excused: 0 };
  for (const st of m ? m.values() : []) if (st in k) k[st]++;
  return { present: k.present, late: k.late, absent: k.absent, excused: k.excused,
    marked: k.present + k.late + k.absent + k.excused, pct: eduAttendRate(k).pct };
}

// 수료(3단계 · 2026-10-05) — 수료번호 꼴 · 이름 가리기(진위 확인) · 수료증 문안({과정} 채우기).
// ⚠️ 아래 세 함수(maskName·eduCertNoValid·eduCertBody)는 **두 곳에 산다** — 교회 어드민 supabase/functions/church-admin/edu-rules.ts 와
//    한 글자도 같다(그쪽 수료증 인쇄·이쪽 진위 확인·내 수료증이 같은 규칙). tests/edu-front.test.cjs 가 이 복사본의 지문(sha256)을
//    교회 어드민 시험과 같은 값으로 잰다 — 고칠 때는 두 곳을 같은 글자로 고치고 두 시험의 지문을 함께 바꾼다.
//    번호 꼴은 SQL edu_cert_take(「고척-YYYY-NNNN」 · 9999 다음은 자리가 는다) · 칸 제약 edu_enrollments_cert_check 와 같다.
//    이름 가리기: 빈 이름은 빈 글 · **한 글자는 「*」**(검토 반영 2026-10-05 — 그대로 내보내면 진위 확인이 이름을 다 보여 준다) ·
//    두 글자는 뒤를 * · 세 글자 넘으면 처음과 끝만(홍길동 → 홍*동 · 남궁가나 → 남**나).
function maskName(name) {
  var s = Array.from(String(name == null ? "" : name).normalize("NFC").trim());
  if (s.length === 0) return "";
  if (s.length === 1) return "*";
  if (s.length === 2) return s[0] + "*";
  return s[0] + "*".repeat(s.length - 2) + s[s.length - 1];
}
function eduCertNoValid(s) {
  return typeof s === "string" && /^고척-[0-9]{4}-[0-9]{4,6}$/.test(s);
}
function eduCertBody(body, title) {
  return String(body == null ? "" : body).split("{과정}").join(String(title == null ? "" : title));
}

// ── 교육 알림 문구 — 순수 함수 (여기부터) ──
// ⚠️ 이 구간은 **타입 표기 없이** 쓴다 — tests/edu-front.test.cjs 가 두 표식 사이만 떼어 node:vm 으로 돌린다(꾸러미 없이 · preflight 가 건다).
//    (그래서 이 주석에도 표기를 예로 적지 않는다.) 문구는 계획 docs/superpowers/plans/2026-10-05-education-stage4.md A(친구 결정).
// 알림 글은 기기가 글자 그대로 보인다(HTML 이 아니다) — 이스케이프 대신 줄바꿈·제어·방향 바꿈 글자를 빈칸으로 바꾸고 길이를 자른다
//   (강좌 제목·장소는 담당자가 쓴 글). max 는 코드 포인트 수 · 넘치면 끝을 「…」로.
function eduPlain(s, max) {
  var t = String(s == null ? "" : s).normalize("NFC")
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/g, " ")
    .replace(/\s+/g, " ").trim();
  var a = Array.from(t);
  return a.length > max ? a.slice(0, max - 1).join("") + "…" : t;
}
// 10월 25일(일) — 날짜만 있는 값(한국 달력날)이라 UTC 자정으로 읽어 요일이 밀리지 않는다(js/edu.js eduMdw 와 같은 셈) · 틀린 값은 빈 글
function eduNoteDay(d) {
  if (!d || !/^\d{4}-\d{2}-\d{2}/.test(String(d))) return "";
  var t = new Date(String(d).slice(0, 10) + "T00:00:00Z");
  if (isNaN(t.getTime())) return "";
  return (t.getUTCMonth() + 1) + "월 " + t.getUTCDate() + "일(" + "일월화수목금토".charAt(t.getUTCDay()) + ")";
}
// "14:00:00" → "14:00" · 없거나 틀리면 빈 글
function eduNoteTime(t) {
  var m = /^(\d{2}):(\d{2})/.exec(String(t == null ? "" : t));
  return m ? m[1] + ":" + m[2] : "";
}
// 확정 알림의 회차 — ss(날짜 차례 · eduSessionsOf) 가운데 오늘(한국) 이후 첫 회차 {date, start, first}.
//   first = 강좌의 첫 회차인가(아니면 「다음 시간」 — 진행 중에 확정된 분) · 남은 회차가 없으면 null(글은 앞부분만).
function eduNextSession(ss, today) {
  var list = Array.isArray(ss) ? ss : [];
  for (var i = 0; i < list.length; i++) {
    var s = list[i] || {};
    if (s.on_date && String(s.on_date) >= String(today || "")) return { date: String(s.on_date), start: eduNoteTime(s.start_time), first: i === 0 };
  }
  return null;
}
// 확정 — 「{과정} 신청이 확정됐어요 — 첫 시간 10월 25일(일) 14:00」 · 대기에서 올라왔으면 앞에 「자리가 나서 」 · 회차가 없으면 앞부분만
function eduConfirmedText(title, next, promoted) {
  var head = (promoted ? "자리가 나서 " : "") + eduPlain(title, 40) + " 신청이 확정됐어요";
  var day = next ? eduNoteDay(next.date) : "";
  if (!day) return head;
  return head + " — " + (next.first ? "첫 시간 " : "다음 시간 ") + day + (next.start ? " " + next.start : "");
}
// 개강 전날 — 「내일 {과정} 첫 시간이에요 — 14:00 · 본당」 · 시각·장소 가운데 없는 것은 뺀다(둘 다 없으면 앞부분만)
function eduFirstDayText(title, start, place) {
  var tail = [eduNoteTime(start), eduPlain(place, 30)].filter(function (x) { return x; }).join(" · ");
  return "내일 " + eduPlain(title, 40) + " 첫 시간이에요" + (tail ? " — " + tail : "");
}
// edu_notify_claim 의 답 → 잡힌 신청 번호(Set) — 문구는 아니지만 꾸러미 없이 시험하려고 이 구간에 둔다(검토 반영 2026-10-06).
//   지금 SQL 은 bigint[] 하나(숫자 배열)를 준다 — 옛 SQL(표 · [{enrollment_id}])이 남은 DB 와 잠깐 엇갈려도(배포 차례) 잡힌 줄을
//   놓치지 않게 두 꼴을 다 읽는다(놓치면 「보냄」으로만 남고 알림은 안 간다). 배열이 아니거나 틀린 값은 버린다.
function eduClaimedIds(got) {
  var out = new Set();
  (Array.isArray(got) ? got : []).forEach(function (x) {
    var n = Number(x !== null && typeof x === "object" ? x.enrollment_id : x);
    if (Number.isSafeInteger(n) && n > 0) out.add(n);
  });
  return out;
}
// ── 교육 알림 문구 — 순수 함수 (여기까지) ──

async function eduMineRows(userId: string, courseId?: string) {
  if (!userId) return [];
  let q = db.from("edu_enrollments").select("id,course_id,status,waitlist_at,completed,cert_no,cert_revoked").eq("user_id", userId);
  if (courseId) q = q.eq("course_id", courseId);
  const { data, error } = await q
    .in("status", ["applied", "confirmed", "waitlisted", "declined"]).order("applied_at", { ascending: false }).limit(100);
  if (error) throw error;
  return (data ?? []) as any[];
}

async function eduWaitNo(courseId: string, waitAt: string | null, id: number): Promise<number> {
  if (!waitAt) {
    // edu_promote 는 waitlist_at nulls last, id 순 — 날짜 없는 줄은 날짜 있는 줄 모두 뒤, 같은 null 끼리는 id 순
    const q = () => db.from("edu_enrollments").select("id", { count: "exact", head: true }).eq("course_id", courseId).eq("status", "waitlisted");
    const [a, c2] = await Promise.all([q().not("waitlist_at", "is", null), q().is("waitlist_at", null).lt("id", id)]);
    if (a.error) throw a.error;
    if (c2.error) throw c2.error;
    return (a.count ?? 0) + (c2.count ?? 0) + 1;
  }
  const { count, error } = await db.from("edu_enrollments").select("id", { count: "exact", head: true })
    .eq("course_id", courseId).eq("status", "waitlisted").or(`waitlist_at.lt.${waitAt},and(waitlist_at.eq.${waitAt},id.lt.${id})`);
  if (error) throw error;
  return (count ?? 0) + 1;
}

// att — 미리 읽은 내 출석(eduAttendOf · eduCourse 가 회차별 myState 에도 쓰려고 넘긴다). 없으면 여기서 읽는다.
async function eduMineOut(rows: any[], today: string, att?: Map<number, Map<number, string>>) {
  const ids = [...new Set(rows.map((r) => r.course_id))];
  if (!ids.length) return [];
  const { data: cs, error } = await db.from("edu_courses").select("id,title,term,starts_on,contact_note").in("id", ids);
  if (error) throw error;
  const cmap = new Map((cs ?? []).map((c: any) => [c.id, c]));
  const sess = await eduSessionsOf(ids);
  const live = rows.filter((r) => cmap.has(r.course_id));
  const waits = await Promise.all(live.map((r) => r.status === "waitlisted" ? eduWaitNo(r.course_id, r.waitlist_at, r.id) : Promise.resolve(null)));
  const attBy = att ?? await eduAttendOf(live.map((r) => Number(r.id)));
  const out = live.map((r, i) => {
    const c: any = cmap.get(r.course_id);
    const ss = sess[r.course_id] || [];
    const first = ss[0]?.on_date ?? c.starts_on ?? null;   // edu_cancel 의 coalesce(첫 회차 날, starts_on) 과 같다
    const next = ss.find((s: any) => s.on_date >= today) || null;
    const cancelUntil = first ? new Date(Date.parse(first + "T00:00:00Z") - 86400000).toISOString().slice(0, 10) : null;
    // 살아 있는 수료(번호 있고 취소 아님) — edu_cancel 이 has-cert 로 막는 줄(검토 반영 2026-10-05)
    const activeCert = !!r.cert_no && r.cert_revoked !== true;
    // edu_cancel 규칙과 같다: 첫 날(첫 회차, 없으면 교육 시작일) 전날까지(둘 다 없으면 막지 않는다) · 살아 있는 수료 줄은 못 한다
    const canCancel = ["applied", "confirmed", "waitlisted"].includes(r.status) && (cancelUntil === null || today <= cancelUntil) && !activeCert;
    // 수료(3단계) — completed 는 수료이고 취소되지 않았을 때만 true · certNo 도 그때만(취소된 번호는 내 화면에 싣지 않는다)
    const done = r.completed === true && activeCert;
    return { id: r.id, courseId: r.course_id, title: c.title, term: c.term || "", contact: c.contact_note || "", status: r.status,
      statusLabel: EDU_ENROLL_LABEL[r.status] || r.status, waitNo: waits[i], cancelUntil, canCancel,
      nextSession: next ? { no: next.no, date: next.on_date, start: next.start_time?.slice(0, 5) ?? null } : null,
      attend: eduAttendOut(attBy.get(Number(r.id))),
      completed: done, certNo: done ? String(r.cert_no) : null };
  });
  return out;
}

async function eduList(b: any) {
  const userId = eduUid(b.user_id);   // 틀린 user_id 는 「로그인 안 함」으로 본다 — 목록은 그대로 준다
  const today = eduKst();
  const { data, error } = await db.from("edu_courses")
    .select("id,title,kind,term,teacher_label,place,fee_note,contact_note,target,capacity,mode,waitlist,apply_from,apply_to,starts_on,ends_on,status")
    .in("status", EDU_LIST_STATUS).order("apply_from", { ascending: true, nullsFirst: false }).limit(200);
  if (error) throw error;
  const rows = (data ?? []) as any[];
  const ids = rows.map((r) => r.id);
  const [sess, cnt] = await Promise.all([eduSessionsOf(ids), eduCountsOf(ids)]);
  const [mine, open] = await Promise.all([eduMineRows(userId).then((r) => eduMineOut(r, today)), eduGateOpen(userId)]);
  return { ok: true, open, courses: rows.map((c) => eduCourseOut(c, sess[c.id] || [], cnt[c.id], today)), mine };
}

async function eduCourse(b: any) {
  const id = String(b.id ?? "").trim();
  if (!MH_UUID.test(id)) return { ok: false, error: "bad-args" };
  const userId = eduUid(b.user_id);
  const today = eduKst();
  const { data: c, error } = await db.from("edu_courses").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!c) return { ok: false, error: "not-found" };
  // 목록 밖 강좌(끝남·준비 중·보관)는 그 강좌에 신청 줄이 있는 분께만 — 「내 강좌」 카드를 누르면 열리게(최종 검토 2026-10-05)
  if (!EDU_LIST_STATUS.includes(c.status)) {
    if (!userId) return { ok: false, error: "not-found" };
    const { data: had, error: eh } = await db.from("edu_enrollments").select("id").eq("course_id", id).eq("user_id", userId).limit(1);
    if (eh) throw eh;
    if (!(had ?? []).length) return { ok: false, error: "not-found" };
  }
  const [sess, cnt] = await Promise.all([eduSessionsOf([id]), eduCountsOf([id])]);
  const ss = sess[id] || [];
  const myRows = await eduMineRows(userId, id);
  const att = await eduAttendOf(myRows.map((r: any) => Number(r.id)));   // 내 줄만(남의 출석은 읽지도 않는다)
  const mine = (await eduMineOut(myRows, today, att))[0] || null;
  const myCells = mine ? att.get(Number(mine.id)) : undefined;
  return { ok: true, course: { ...eduCourseOut(c, ss, cnt[id], today), description: c.description || "", prereq: c.prereq_tracks || [],
    contact: c.contact_note || "",   // 문의 한 줄(담당자가 적은 그대로 · 목록 카드·내 강좌에도 같은 값이 간다)
    attendPct: c.attend_pct, checkLabel: c.check_label || null,
    sessions: ss.map((s: any) => ({ no: s.no, date: s.on_date, start: s.start_time?.slice(0, 5) ?? null, end: s.end_time?.slice(0, 5) ?? null, topic: s.topic || "", place: s.place || "",
      myState: myCells?.get(Number(s.id)) ?? null })) },
    mine };
}

async function eduApply(b: any) {
  const le = await lifeError(b); if (le) return { ok: false, error: le };
  const userId = eduUid(b.user_id);
  const id = String(b.id ?? "").trim();
  if (!userId) return { ok: false, error: "no-user" };
  if (!MH_UUID.test(id)) return { ok: false, error: "bad-args" };
  if (!(await eduGateOpen(userId))) return { ok: false, error: "not-open" };
  const { data: u, error } = await db.from("users").select("type,gu,mok,bu,grade,name").eq("id", userId).maybeSingle();
  if (error) throw error;
  if (!u) return { ok: false, error: "no-user" };
  const isGu = u.type === "교구";
  const ident = { name: norm(u.name), who_type: u.type, group_name: isGu ? norm(u.gu) : norm(u.bu), sub_name: isGu ? norm(u.mok) : norm(u.grade), ident_key: identityKey(u) };
  const { data: r, error: e2 } = await db.rpc("edu_apply", { p_course: id, p_user: userId, p_ident: ident, p_staff: false });
  if (e2) throw e2;
  if (!r) return { ok: false, error: "server" };
  if (!r.ok) return r;
  let waitNo: number | null = null;
  if (r.status === "waitlisted") {
    const { data: w, error: e3 } = await db.from("edu_enrollments").select("waitlist_at").eq("id", r.id).maybeSingle();
    if (e3) throw e3;
    waitNo = await eduWaitNo(id, w?.waitlist_at ?? null, r.id);
  }
  return { ok: true, status: r.status, waitNo, already: !!r.already };
}

async function eduCancel(b: any) {
  const le = await lifeError(b); if (le) return { ok: false, error: le };
  const userId = eduUid(b.user_id);
  const eid = Number(b.enrollment_id);
  if (!userId || !Number.isInteger(eid) || eid < 1) return { ok: false, error: "bad-args" };
  const { data: row, error } = await db.from("edu_enrollments").select("id").eq("id", eid).eq("user_id", userId).maybeSingle();
  if (error) throw error;
  if (!row) return { ok: false, error: "not-found" };              // 남의 줄은 없는 줄과 같다
  const { data: r, error: e2 } = await db.rpc("edu_cancel", { p_enrollment: eid, p_staff: false });
  if (e2) throw e2;
  if (!r) return { ok: false, error: "server" };
  // 대기 첫 분이 올라갔으면 그분께 「자리가 나서 … 확정됐어요」(4단계 · 같은 알림 길 · 한 번만) — 알림이 실패해도 취소는 이미 끝났다.
  //   취소한 성도님은 그분께 보내기를 **기다리지 않는다**(검토 반영 2026-10-06) — 응답 뒤에 돈다(eduAfterResponse).
  if (r.ok && r.promoted != null) eduAfterResponse(eduNotifyConfirmed([Number(r.promoted)], true), "eduCancel notify");
  return r.ok ? { ok: true, promoted: r.promoted != null } : r;
}

async function eduMine(b: any) {
  const le = await lifeError(b); if (le) return { ok: false, error: le };
  const userId = eduUid(b.user_id);
  if (!userId) return { ok: false, error: "no-user" };
  return { ok: true, mine: await eduMineOut(await eduMineRows(userId), eduKst()) };
}

// 내 수료증 자료(3단계) — {enrollment_id, user_id} · **내 줄**이고 수료·취소 안 됨일 때만(남의 줄은 없는 줄과 같다 · not-found).
//   이름은 신청 줄에 적힌 그대로(앱 이름을 나중에 바꿔도 증서는 그때 이름) · 기간은 eduPeriod(교육 기간, 없으면 첫·마지막 회차) ·
//   발급일 = 수료한 날(한국) · 명의·문안({과정} 채움)·직인(data URL)은 수료증 설정 한 줄(edu_cert_settings — 교회 어드민 인쇄와 같은 칸).
//   응답에 user_id·소속·신청 상태는 싣지 않는다. 거절: no-user · bad-args · not-found · no-cert(수료 아님·취소됨).
async function eduCert(b: any) {
  const le = await lifeError(b); if (le) return { ok: false, error: le };
  const userId = eduUid(b.user_id);
  const eid = Number(b.enrollment_id);
  if (!userId) return { ok: false, error: "no-user" };
  if (!Number.isInteger(eid) || eid < 1) return { ok: false, error: "bad-args" };
  const { data: e, error } = await db.from("edu_enrollments").select("id,course_id,name,completed,completed_at,cert_no,cert_revoked")
    .eq("id", eid).eq("user_id", userId).maybeSingle();
  if (error) throw error;
  if (!e) return { ok: false, error: "not-found" };
  if (e.completed !== true || e.cert_revoked === true || !e.cert_no || !e.completed_at) return { ok: false, error: "no-cert" };
  const [cr, sess, sr] = await Promise.all([
    db.from("edu_courses").select("id,title,term,starts_on,ends_on").eq("id", e.course_id).maybeSingle(),
    eduSessionsOf([e.course_id]),
    db.from("edu_cert_settings").select("issuer,body,seal").eq("id", 1).maybeSingle(),
  ]);
  if (cr.error) throw cr.error;
  if (sr.error) throw sr.error;
  const c: any = cr.data;
  if (!c) return { ok: false, error: "not-found" };
  const p = eduPeriod(c, sess[c.id] || []);
  const st: any = sr.data || {};
  return { ok: true, cert: { name: e.name, title: c.title, term: c.term || "", from: p.from, to: p.to, certNo: String(e.cert_no),
    issuedOn: kstDay(e.completed_at), issuer: st.issuer || "", body: eduCertBody(st.body || "", c.title), seal: st.seal || null } };
}

// 수료번호 진위 확인(3단계) — {no} · 로그인 없이(user_id 를 보지 않는다). 꼴을 먼저 보고(bad-no) **정확히 같은 번호 하나만** 찾는다(목록·검색 없음).
//   있으면 {ok, valid, revoked, title, term, completedOn, name: 가린 이름(홍*동)} · 없으면 {ok, valid:false}.
//   valid = 수료이고 취소 아님 · revoked = 취소된 번호(번호는 남긴다 — 「취소됨」으로 보인다). user_id·소속·신청 번호는 싣지 않는다.
async function eduVerify(b: any) {
  const no = String(b.no ?? "").slice(0, 40).normalize("NFC").trim();
  if (!eduCertNoValid(no)) return { ok: false, error: "bad-no" };
  const { data: e, error } = await db.from("edu_enrollments").select("course_id,name,completed,completed_at,cert_revoked")
    .eq("cert_no", no).maybeSingle();
  if (error) throw error;
  if (!e) return { ok: true, valid: false };
  const { data: c, error: ec } = await db.from("edu_courses").select("title,term").eq("id", e.course_id).maybeSingle();
  if (ec) throw ec;
  if (!c) return { ok: true, valid: false };
  const revoked = e.cert_revoked === true;
  return { ok: true, valid: !revoked && e.completed === true, revoked, title: c.title, term: c.term || "",
    completedOn: e.completed_at ? kstDay(e.completed_at) : null, name: maskName(e.name) };
}

// ---------- 교육 앱 알림(4단계 · 2026-10-05 · 계획 docs/superpowers/plans/2026-10-05-education-stage4.md A) ----------
// 보내는 길은 eduNotifySend 하나 — 확정(internalEduNotify · eduCancel 안의 대기 올림)·개강 전날(internalEduRemind) 모두 이리로 온다.
// ⚠️ 같은 신청에 같은 알림은 한 번 — SQL edu_notify_claim 이 **보내기 전에** 기록 줄(edu_notify_log)을 잡고(확정·앱 계정 확인도 그 한 문장),
//    잡힌 신청에만 보낸다. 받는 기기가 없어도 잡힌 줄은 남는다(「보냄」 · 재시도 폭주를 막는다) · 보내다 실패해도 다시 안 보낸다(많아야 한 번).
// ⚠️ 응답·push_log·알림 내용에 user_id 를 싣지 않는다. 알림 글은 글자 그대로(eduPlain — HTML 아님).
// ⚠️ 기기는 두 갈래 — 웹 푸시(push_subscriptions · 플레이 앱 포함)와 아이폰(ios_push_tokens · APNs). sendPush 와 같다(웹만 보내면 아이폰 앱 분은 못 받는다).
//    누르면 웹 푸시는 주소(?edu=강좌 id → js/edu.js eduTakeDeepLink)로 그 강좌 자세히가 열린다 · 아이폰 앱은 주소를 안 읽어 앱만 열린다(네이티브 몫).
// ⚠️ 문(검토 반영 2026-10-06 · 친구 결정): 교육이 열리기 전(app_config eduOpen 이 true 가 아니면)에는 🧪 시험 참여자에게만 보낸다 —
//    앱에서 🎓 가 시험 참여자에게만 보이는 것(app.js eduVisible)과 같은 규칙. 확정·개강 전날 모두 eduNotifySend 한 곳에서 거른다.
const EDU_NOTIFY_TITLE = "🎓 교육";
const EDU_NOTIFY_MAX = 2000;   // 한 번에 받는 신청 번호 수(정원 상한과 같다)
const EDU_CLAIM_CHUNK = 500;   // 잡고 보내는 한 덩이(신청 수) — 덩이마다 기기 읽기 → 잡기 → 보내기(검토 반영 2026-10-06)
const eduCourseUrl = (id: string) => "https://gocheok.onlybible.kr/?edu=" + encodeURIComponent(id);

// 응답을 기다리게 하지 않을 일(검토 반영 2026-10-06 · eduCancel 의 올라간 분 알림) — Edge Runtime 의 EdgeRuntime.waitUntil 이 있으면
//   응답을 보낸 뒤에도 끝까지 돌게 맡기고, 없으면 그냥 띄워 둔다. 오류는 로그에만 남긴다(응답은 이 일의 성패와 무관).
function eduAfterResponse(p: Promise<unknown>, label: string) {
  const job = p.catch((e) => console.error(label, e));
  try {
    const rt = (globalThis as any).EdgeRuntime;
    if (rt && typeof rt.waitUntil === "function") rt.waitUntil(job);
  } catch (e) { console.error(label, e); }
}

// 교육 문이 열렸나 — app_config eduOpen 이 true 하나일 때만(eduGateOpen 의 앞 절반과 같은 셈). 알림용이라 DB 오류는 던진다
//   (삼켜서 「닫힘」으로 보면 아무에게도 안 가는 것이 조용히 묻힌다 — 던지면 아무것도 안 잡혀 다시 부를 수 있다).
async function eduOpenNow(): Promise<boolean> {
  const { data, error } = await db.from("app_config").select("value").eq("key", "eduOpen").maybeSingle();
  if (error) throw error;
  return data?.value === true;
}

// 그분들의 기기 — user_id → {web, ios}. .in() 주소 길이를 넘지 않게 100분씩 묻고, 한 번에 1,000줄까지만 오는 PostgREST 한도에 안 잘리게
//   id 차례로 이어 받는다(fetchAllRows · 검토 반영 2026-10-06 — 한 분이 기기를 여럿 가질 수 있다). 기기 번호·주소는 보내는 데만 쓴다(응답·기록에 없음).
async function eduDevicesOf(userIds: string[]) {
  const by = new Map<string, { web: any[]; ios: any[] }>();
  const get = (u: string) => by.get(u) || by.set(u, { web: [], ios: [] }).get(u)!;
  for (let i = 0; i < userIds.length; i += 100) {
    const part = userIds.slice(i, i + 100);
    const [w, t] = await Promise.all([
      fetchAllRows(() => db.from("push_subscriptions").select("id,endpoint,p256dh,auth,user_id").in("user_id", part).order("id")),
      fetchAllRows(() => db.from("ios_push_tokens").select("id,device_token,user_id").in("user_id", part).order("id")),
    ]);
    for (const s of w) get(String(s.user_id)).web.push(s);
    for (const s of t) get(String(s.user_id)).ios.push(s);
  }
  return by;
}

// 한 글을 웹 푸시·아이폰에 보내고 push_log 에 한 줄 — **기기가 0이어도 남긴다**(「잡았는데 받을 기기가 없었다」를 갈라 보려고 · 개발 시험의 증거).
//   만료된 웹 구독(404·410)·죽은 아이폰 토큰(gone)은 그 자리에서 지운다(pushToSubs·sendPush 와 같다) · 실패 이유는 수만 note 에(기기 번호·user_id 없음).
//   ⚠️ monitor 는 push_log 의 daily 줄만 본다 — mode edu-* 줄이 0건이어도 헛경보가 나지 않는다.
//   돌려주는 것 {sent, failed, total} 은 **기기** 수다. okWeb·okIos = 받아들여진 기기 줄(받은 그 객체 — 두 표의 번호가 섞이지 않게 따로) —
//   받는 분마다 세는 쪽(봉사 당번)만 쓴다. 응답·기록에 싣지 말 것(고침 검토 반영 2026-10-07).
async function eduPushDevices(web: any[], ios: any[], title: string, body: string, url: string, mode: string) {
  const w = await webPushList(web, JSON.stringify({ title, body, url }));
  let sent = w.sent, failed = w.failed;
  const why: Record<string, number> = {};
  const okIos: any[] = [];
  for (const k of Object.keys(w.codes)) why["web " + k] = w.codes[k];
  for (const t of ios) {
    const o: { reason?: string } = {};
    const r = await sendApns(t.device_token, title, body, o);
    if (r === "ok") { sent++; okIos.push(t); continue; }
    failed++;
    if (r === "gone") await db.from("ios_push_tokens").delete().eq("id", t.id);
    const k = "ios " + (o.reason || r);
    why[k] = (why[k] || 0) + 1;
  }
  const total = web.length + ios.length;
  try {
    const note = Object.keys(why).map((k) => `${k} ${why[k]}건`).join(" · ").slice(0, 300) || null;
    const logBase = { mode, title, sent, failed, total, ok: sent > 0 };
    const { error } = await db.from("push_log").insert({ ...logBase, body, note });
    if (error) await db.from("push_log").insert(logBase);   // body·note 칸이 없는 옛 표
  } catch (_) { /* 로그 실패는 발송 결과에 영향 없음 */ }
  return { sent, failed, total, okWeb: w.ok, okIos };
}

// 신청 줄들(같은 kind)에 알림 — rows: [{id, course_id, user_id}](부른 쪽이 고른 후보) · textOf(강좌 id) = 그 강좌 알림 글.
//   ⓪ 문 — eduOpen 이 true 가 아니면 시험 참여자 줄만 남긴다(명단은 이 부름에 한 번 · 걸러진 줄은 **잡지 않는다** — 기록이 안 남아
//      문이 열린 뒤 다시 부르면 갈 수 있다).
//   그다음 500개씩 덩이마다 ① 그 덩이 분들의 기기를 먼저 읽고(잡은 뒤에 읽다 실패하면 영영 안 간다) ② edu_notify_claim 으로 잡고
//   (잡힌 번호는 bigint[] 하나로 온다 — 표로 받으면 1,000줄에서 잘린다) ③ 잡힌 신청의 기기에만 **강좌마다** 보내고 push_log 한 줄.
//   돌려주는 것 = 잡은(= 보낸) 신청 수. 한 강좌가 실패해도 다른 강좌는 보낸다(잡힌 줄은 남는다 — 많아야 한 번).
async function eduNotifySend(kind: "confirmed" | "first_day", rows: any[], textOf: (courseId: string) => string): Promise<number> {
  const seen = new Set<number>();
  let cand = rows.filter((r) => {
    const id = Number(r?.id);
    if (!r || !r.user_id || !Number.isSafeInteger(id) || id < 1 || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  if (!cand.length) return 0;
  if (!(await eduOpenNow())) {
    const testers = await ministryTesterIds();
    cand = cand.filter((r) => testers.has(String(r.user_id)));
    if (!cand.length) return 0;
  }
  let sent = 0;
  for (let i = 0; i < cand.length; i += EDU_CLAIM_CHUNK) {
    const part = cand.slice(i, i + EDU_CLAIM_CHUNK);
    const devs = await eduDevicesOf([...new Set(part.map((r) => String(r.user_id)))]);
    const { data: got, error } = await db.rpc("edu_notify_claim", { p_kind: kind, p_ids: part.map((r) => Number(r.id)) });
    if (error) throw error;
    const claimed = eduClaimedIds(got);
    const byCourse = new Map<string, any[]>();
    for (const r of part) {
      if (!claimed.has(Number(r.id))) continue;
      sent++;
      const k = String(r.course_id);
      (byCourse.get(k) || byCourse.set(k, []).get(k)!).push(r);
    }
    for (const [cid, list] of byCourse) {
      const web: any[] = [], ios: any[] = [];
      for (const r of list) {
        const d = devs.get(String(r.user_id));
        if (d) { web.push(...d.web); ios.push(...d.ios); }
      }
      try {
        await eduPushDevices(web, ios, EDU_NOTIFY_TITLE, textOf(cid), eduCourseUrl(cid), kind === "confirmed" ? "edu-confirmed" : "edu-first-day");
      } catch (e) { console.error("eduNotifySend", kind, e); }
    }
  }
  return sent;
}

// 확정 알림 — 신청 번호들(같은 promoted) → 잡아서 보낸 수. 글은 강좌 제목 + 오늘(한국) 이후 첫 회차(eduConfirmedText · 회차가 없으면 앞부분만).
//   교회 어드민(eduEnrollSet·eduEnrollAdd·eduCourseSave)이 internalEduNotify 로, 성경암송 eduCancel(대기 첫 분이 올라감)이 안에서 바로 부른다.
//   ⚠️ 성도님이 선착순에 신청하자마자 확정된 것은 부르지 않는다(화면이 바로 「확정됐어요」 — 친구 결정) — 그래서 eduApply 에는 없다.
async function eduNotifyConfirmed(ids: number[], promoted: boolean): Promise<number> {
  const rows: any[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db.from("edu_enrollments").select("id,course_id,user_id")
      .in("id", ids.slice(i, i + 200)).eq("status", "confirmed").not("user_id", "is", null);
    if (error) throw error;
    rows.push(...((data ?? []) as any[]));
  }
  if (!rows.length) return 0;
  const cids = [...new Set(rows.map((r) => String(r.course_id)))];
  const [cr, sess] = await Promise.all([db.from("edu_courses").select("id,title").in("id", cids), eduSessionsOf(cids)]);
  if (cr.error) throw cr.error;
  const title = new Map(((cr.data ?? []) as any[]).map((c) => [String(c.id), String(c.title ?? "")]));
  const today = eduKst();
  return await eduNotifySend("confirmed", rows,
    (cid) => eduConfirmedText(title.get(cid) ?? "", eduNextSession(sess[cid] || [], today), promoted));
}

// 교회 어드민 전용 — {kind:'confirmed', enrollment_ids:[신청 번호…], promoted?:boolean} · 같은 프로젝트 서비스 키(x-internal-key)일 때만
//   (internalMinistryNotify 와 같은 문 · sameSecret). 담당자 저장이 **끝난 뒤** 부른다(교회 어드민 edu-db.ts withNotify — 실패해도 저장은 그대로).
//   응답 {ok, sent: 이번에 알린 신청 수, skipped: 나머지(확정 아님·앱 계정 없음·이미 알림 · 교육이 열리기 전의 시험 참여자 아닌 분)} — user_id 는 싣지 않는다.
async function internalEduNotify(req: Request, b: any) {
  if (!sameSecret(req.headers.get("x-internal-key") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "")) {
    return { ok: false, error: "unauthorized" };
  }
  if (b.kind !== "confirmed") return { ok: false, error: "bad-kind" };
  const raw = b.enrollment_ids;
  if (!Array.isArray(raw) || raw.length > EDU_NOTIFY_MAX) return { ok: false, error: "bad-args" };
  const ids = [...new Set(raw.map((x: unknown) => Number(x)))] as number[];
  if (ids.some((n) => !Number.isSafeInteger(n) || n < 1)) return { ok: false, error: "bad-args" };
  const sent = ids.length ? await eduNotifyConfirmed(ids, b.promoted === true) : 0;
  return { ok: true, sent, skipped: ids.length - sent };
}

// 개강 전날 알림 — pg_cron(supabase/edu_remind_cron.sql · 매일 10:00 UTC = 19:00 KST)이 서비스 키(x-internal-key)로 부른다.
//   내일(한국)이 첫 날인 강좌 — 첫 날 = coalesce(첫 회차 날, 교육 시작일)(edu_cancel·eduMineOut 과 같은 셈) · 초안·보관·마침(draft·archived·done)은 뺀다.
//   그 강좌의 확정 + 앱 계정 신청 가운데 first_day 기록이 없는 분께(잡기는 edu_notify_claim · 하루에 두 번 불러도 한 번).
//   교육이 열리기 전(eduOpen 이 true 아님)에는 시험 참여자에게만 — 문은 eduNotifySend 한 곳(걸러진 분은 skipped 에 든다 · 잡지 않는다).
//   글: 「내일 {과정} 첫 시간이에요 — 14:00 · 본당」(첫 날이 회차에서 왔으면 그 회차의 시각·장소 — 회차 장소가 비면 강좌 장소).
//   후보는 「내일 회차가 있는 강좌」+「내일 시작하는 강좌」뿐이라 강좌가 쌓여도 가볍다. 응답 {ok, day, courses, sent, skipped} — user_id 없음.
async function internalEduRemind(req: Request) {
  if (!sameSecret(req.headers.get("x-internal-key") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "")) {
    return { ok: false, error: "unauthorized" };
  }
  const day = new Date(Date.parse(eduKst() + "T00:00:00Z") + 86400000).toISOString().slice(0, 10);   // 내일(한국)
  const [sr, sc] = await Promise.all([
    fetchAllRows(() => db.from("edu_sessions").select("course_id").eq("on_date", day).order("id")),
    fetchAllRows(() => db.from("edu_courses").select("id").eq("starts_on", day).order("id")),
  ]);
  const cand = [...new Set([...sr, ...sc].map((r: any) => String(r.course_id ?? r.id)))];
  const due = new Map<string, string>();   // 강좌 id → 알림 글
  for (let i = 0; i < cand.length; i += 100) {
    const part = cand.slice(i, i + 100);
    const [cr, sess] = await Promise.all([
      db.from("edu_courses").select("id,title,place,starts_on,status").in("id", part).not("status", "in", "(draft,archived,done)"),
      eduSessionsOf(part),
    ]);
    if (cr.error) throw cr.error;
    for (const c of (cr.data ?? []) as any[]) {
      const ss = sess[c.id] || [];
      if ((ss[0]?.on_date ?? c.starts_on ?? null) !== day) continue;   // 첫 날이 내일이 아니다(더 앞선 회차가 있다)
      const s0 = ss[0] ?? null;   // 첫 날이 회차에서 왔으면 그 회차 · 아니면(회차 없음) null
      due.set(String(c.id), eduFirstDayText(c.title, s0?.start_time ?? "", (s0?.place || c.place) ?? ""));
    }
  }
  if (!due.size) return { ok: true, day, courses: 0, sent: 0, skipped: 0 };
  const ids = [...due.keys()];
  const rows: any[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const part = ids.slice(i, i + 100);
    rows.push(...await fetchAllRows(() => db.from("edu_enrollments").select("id,course_id,user_id")
      .in("course_id", part).eq("status", "confirmed").not("user_id", "is", null).order("id")));
  }
  const sent = await eduNotifySend("first_day", rows, (cid) => due.get(cid) ?? "");
  return { ok: true, day, courses: due.size, sent, skipped: rows.length - sent };
}

// ---------- 봉사 당번(2026-10-06 · 설계 docs/superpowers/specs/2026-10-06-duty-roster-design.md §5·§7·§9) ----------
// ⚠️ 정원·겹침·잠금·쉼·끝 날짜는 SQL 함수(supabase/duty.sql) 한 곳 — 여기서 상태를 직접 쓰지 않는다.
// ⚠️ 응답에 user_id·ident_key 를 싣지 않는다 — 읽기는 SQL 이 만든 jsonb(duty_list_view·duty_board_view·duty_mine)를 그대로 돌려준다
//    (지난 봉사 duty_past 만은 아는 칸만 골라 옮긴다 — dutyPastOut).
//    (그 함수들이 이름 글자만 싣는다 · supabase/tests/duty_rules.dev.sql 이 낱말로 본다).
// ⚠️ **문은 읽기도 막는다**(교육과 다르다 — 당번표에는 선 분 이름이 나간다): dutyGate = users 에 그 줄이 **실제로 있고**(꼴만 보지 않는다)
//    app_config dutyOpen 이 true 이거나 🧪 시험 참여자. 못 지나면 읽기는 {ok:true, open:false}(당번·이름·수 없음), 쓰기는 not-open.
// ⚠️ 신원(이름·소속)은 화면이 보낸 값을 쓰지 않는다 — user_id 로 users 줄을 꺼내 만든다.
// ⚠️ 읽기 응답의 me = { why } — **부른 계정 자신**이 앱에서 지원하지 못하는 까닭(guardian 어린이·청소년 부서 · bad-name 당번표에 실을 수 없는 이름 · '' 지원할 수 있다).
//    화면이 그런 계정에 「지원하기」 단추를 두지 않게 하려는 것 — 막는 것은 여전히 dutyApply 다(같은 dutyMeWhy 한 곳).
// ── 봉사 당번 — 순수 함수 (여기부터) ──
// ⚠️ 이 구간은 타입 표기 없이 쓴다 — tests/duty-front.test.cjs 가 떼어 node:vm 으로 돌린다.
// 당번표에 실을 만한 이름인가 — 당번표의 이름은 앱을 쓰는 누구에게나 보인다. 1~20자 · 꺾쇠·따옴표·역슬래시·제어·방향 바꿈·줄 가름·보이지 않는 글자 없음 ·
//   숫자가 네 자리 넘게 이어지지 않음(전화번호를 이름 칸에 적은 계정). 아니면 bad-name(정보변경에서 이름을 고친 뒤 지원).
function dutyNameOk(name) {
  var s = String(name == null ? "" : name).trim();
  if (!s || s.length > 20) return false;
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i);
    if (c < 32 || (c >= 127 && c <= 159) || c === 0x061c || (c >= 0x200b && c <= 0x200f) || (c >= 0x2028 && c <= 0x202e) || (c >= 0x2066 && c <= 0x2069)) return false;
    // 보이지 않는 글자 — 부드러운 붙임표 · 한글 채움 글자 넷(초성·중성·호환·반각) · 점자 빈칸 · 낱말 이음표~보이지 않는 연산자 · BOM.
    //   이것만으로 된 이름(「공백 닉네임」)이 당번표 한 자리를 빈 이름으로 차지하지 않게(검토 반영 2026-10-06).
    if (c === 0x00ad || c === 0x115f || c === 0x1160 || c === 0x3164 || c === 0xffa0 || c === 0x2800 || (c >= 0x2060 && c <= 0x2064) || c === 0xfeff) return false;
    if (c === 60 || c === 62 || c === 34 || c === 39 || c === 96 || c === 92) return false;   // 꺾쇠 둘 · 큰따옴표 · 작은따옴표 · 백틱 · 역슬래시(글자 대신 번호로 — 이 파일은 역슬래시가 풀린 적이 있다)
  }
  // 보이는 글자·숫자가 하나는 있어야 한다 — 막는 목록에 없는 보이지 않는 글자만으로 된 이름이 빈 이름으로 한 자리를 차지하지 않게(재검증 2026-10-06).
  //   한글 음절·자모(채움 글자 빼고)·호환 자모 · 영문·숫자 · 라틴 확장 · 가나 · 한자
  var seen = false;
  for (var k = 0; k < s.length && !seen; k++) {
    var v = s.charCodeAt(k);
    seen = (v >= 0xac00 && v <= 0xd7a3) || (v >= 0x1100 && v <= 0x11ff && v !== 0x115f && v !== 0x1160) || (v >= 0x3131 && v <= 0x318e && v !== 0x3164) ||
      (v >= 48 && v <= 57) || (v >= 65 && v <= 90) || (v >= 97 && v <= 122) || (v >= 0x00c0 && v <= 0x024f) || (v >= 0x3040 && v <= 0x30ff) || (v >= 0x4e00 && v <= 0x9fff);
  }
  if (!seen) return false;
  var run = 0;
  for (var j = 0; j < s.length; j++) {
    var d = s.charCodeAt(j);
    run = d >= 48 && d <= 57 ? run + 1 : 0;
    if (run >= 4) return false;
  }
  return true;
}
// 겹침 거절(duty_apply 의 overlap.with)을 성도님 화면에 실을 만큼만 — 준비 중인 당번(draft)이면 이름을 싣지 않는다(아직 공개 전인 당번).
function dutyOverlapOut(w) {
  if (!w || typeof w !== "object" || w.draft === true) return null;
  return { board: String(w.board == null ? "" : w.board), service: String(w.service == null ? "" : w.service),
    task: String(w.task == null ? "" : w.task), start: String(w.start == null ? "" : w.start) };
}
// 「못 가게 됐어요」 까닭 — cant(사정이 생겼어요) · mistake(잘못 눌렀어요) · notme(제가 한 게 아니에요) · null/빈 글자 = 표시 거두기
function dutyWhyOf(v) {
  if (v === null || v === undefined || v === "") return { ok: true, why: null };
  var s = String(v);
  return s === "cant" || s === "mistake" || s === "notme" ? { ok: true, why: s } : { ok: false, why: null };
}
// SQL 의 거절 코드 → 성도님 화면에 줄 코드. 보관한 당번(archived)은 없는 당번과 같다(not-found — duty_board_view·준비 중 당번과 같은 답 ·
//   화면이 「찾을 수 없어요」로 말하고 다시 받는다). bad-ident 는 올 수 없는 값이다(신원은 서버가 만든다) — 오면 server.
function dutyErrOut(code) {
  var s = String(code == null ? "" : code);
  if (s === "archived") return "not-found";
  if (!s || s === "bad-ident") return "server";
  return s;
}
// ---- 알림 글(3단계 · 설계 §10) — 아래 dutyNotifySend 가 쓴다 ----
// 알림 글은 기기가 글자 그대로 보인다(HTML 이 아니다) — 담당자가 쓴 글(당번 이름·예배·일·장소)의 줄바꿈·제어·방향 바꿈·보이지 않는 글자를 빈칸으로 바꾸고
//   길이를 자른다(max = 코드 포인트 수 · 넘치면 끝을 「…」로). 글자 번호로 견준다(이 파일은 역슬래시가 풀린 적이 있다).
function dutyPlain(s, max) {
  var t = String(s == null ? "" : s).normalize("NFC"), out = "";
  for (var i = 0; i < t.length; i++) {
    var c = t.charCodeAt(i);
    var bad = c < 32 || (c >= 127 && c <= 159) || c === 0x00ad || c === 0x061c || (c >= 0x200b && c <= 0x200f) || (c >= 0x2028 && c <= 0x202e) ||
      (c >= 0x2060 && c <= 0x2069) || c === 0xfeff;
    out += bad ? " " : t.charAt(i);
  }
  out = out.split(" ").filter(function (x) { return x; }).join(" ");
  var a = Array.from(out);
  return a.length > max ? a.slice(0, max - 1).join("") + "…" : out;
}
// 10월 18일(일) — 날짜만 있는 값(한국 달력날)이라 UTC 자정으로 읽어 요일이 밀리지 않는다 · 틀린 값은 빈 글
function dutyNoteDay(d) {
  var s = String(d == null ? "" : d).slice(0, 10), p = s.split("-");
  if (p.length !== 3 || p[0].length !== 4 || p[1].length !== 2 || p[2].length !== 2) return "";
  var t = new Date(s + "T00:00:00Z");
  if (isNaN(t.getTime())) return "";
  return (t.getUTCMonth() + 1) + "월 " + t.getUTCDate() + "일(" + "일월화수목금토".charAt(t.getUTCDay()) + ")";
}
// 자리 이름 — 「2부 설거지」(일 이름이 없으면 예배만)
function dutyNoteSlot(r) {
  return [dutyPlain(r && r.service, 20), dutyPlain(r && r.task, 20)].filter(function (x) { return x; }).join(" ");
}
// 알림 종류 — 교회 어드민이 부탁하는 여섯(confirmed·added·moved·removed·off·reopen) + api 안에서만 쓰는 둘(remind 전날 · applied 잠긴 날 앱 지원)
var DUTY_NOTE_KINDS = ["confirmed", "added", "moved", "removed", "off", "reopen", "remind", "applied"];
var DUTY_NOTE_STAFF_KINDS = ["confirmed", "added", "moved", "removed", "off", "reopen"];
// 같은 알림을 한 번만 보내려고 줄을 잡는 종류(duty_notify_claim — SQL CHECK 와 같아야 한다). 나머지는 담당자의 저장 한 번에 한 번 부탁하므로 잡지 않는다.
var DUTY_NOTE_CLAIM = ["confirmed", "remind"];
// 이 줄(duty_notify_rows 의 한 줄)에 이 알림을 보낼 것인가 — 받는 분(uid)이 있고 · 지난 날이 아니고 · 종류마다:
//   confirmed: 살아 있는 줄 · 쉬지 않음 · **전날 저녁이 지나지 않은 날**(이미 저절로 잠긴 날을 담당자가 또 확정해도 「이제 취소할 수 없어요」를 보내지 않는다 — 전날 알림이 갔다) ·
//              **지금도 담당자가 확정해 둔 날**(재료는 부탁과 따로 읽는다 — 그사이 확정이 풀렸으면 「확정됐어요」를 보내지 않는다 · 옛 SQL 은 그 칸이 없어 그대로 지난다)
//   remind: 살아 있는 줄 · 쉬지 않음 · day 를 주면 **그 날짜의 줄만**(부른 쪽이 고른 「내일」 — 그사이 다른 날로 옮겨진 줄에 「내일」이라 하지 않고, 그 줄의 전날 알림 기록도 잡지 않는다)
//   applied: 살아 있는 줄 · 쉬지 않음 · 잠긴 날 / added·moved·reopen: 살아 있는 줄 · 쉬지 않음
//   removed: 담당자가 뺀 줄(본인 취소는 알리지 않는다) · **같은 자리에 같은 이름의 살아 있는 줄이 남았으면(dup) 보내지 않는다** — 겹친 줄을 정리한 것이라
//            그분은 남은 줄로 서 있다(「안 나오셔도 돼요」가 거짓이 된다) / off: 살아 있는 줄 · 쉬는 날·자리
//   담당자가 바꾼 것(added·moved·removed·off·reopen)은 **오늘 이미 끝난 자리(ended)**에는 보내지 않는다 — 예배 뒤 명단을 바로잡을 때 「안 나오셔도 돼요」·「넣어 드렸어요」가
//            일이 끝난 뒤에 갔다(다음 날 바로잡으면 past 라 원래 안 간다).
//   ⚠️ 옮김(moved)만은 **떠난 자리**로도 가른다 — 아직 안 끝난 자리(앞날 · 오늘 끝 시각 전)에 서 있던 줄을 오늘 이미 끝난 자리로 옮기면 그분의 남은 당번이
//            사라진다(「다음 주 대신 오늘 서 주셨다」를 적는 손길) → 알린다. movedFrom.live 는 SQL duty_move 가 옮기는 순간에 적는다(끝난 자리끼리·지난 날 줄의
//            바로잡기는 false 라 조용하다 · 옛 SQL 은 그 칸이 없어 그대로 거른다 — 고침 검토 반영 2026-10-07).
function dutyNoteKeep(kind, r, day) {
  if (!r || !r.uid || r.past === true) return false;
  var live = r.status === "active";
  var fix = kind === "added" || kind === "moved" || kind === "removed" || kind === "off" || kind === "reopen";
  var leftLive = kind === "moved" && !!r.movedFrom && r.movedFrom.live === true;
  if (fix && r.ended === true && !leftLive) return false;
  if (kind === "removed") return r.status === "removed" && r.reason === "staff" && r.dup !== true;
  if (kind === "off") return live && r.off === true;
  if (!live || r.off === true) return false;
  if (kind === "confirmed") return r.pastCutoff !== true && r.confirmed !== false;
  if (kind === "applied") return r.locked === true;
  if (kind === "remind") return !day || String(r.date) === String(day);
  return kind === "added" || kind === "moved" || kind === "reopen";
}
// 글 조각들을 room 자 안에 들어가는 만큼만 잇는다 — 다 못 실으면 끝에 「 외 N일」(남은 조각의 날짜가 앞에 실은 날짜·서로와 모두 다를 때) · 「 외 N건」.
//   items = [{ text, date }] · 첫 조각은 넘쳐도 싣는다(부르는 쪽이 dutyPlain 으로 자른다).
function dutyNoteFit(items, sep, room) {
  var list = (items || []).filter(function (x) { return x && x.text; });
  var len = function (s) { return Array.from(s).length; };
  var rest = function (from) {
    var seen = {}, fresh = true;
    list.slice(0, from).forEach(function (x) { seen[String(x.date)] = 1; });
    list.slice(from).forEach(function (x) { var k = String(x.date); if (seen[k]) fresh = false; seen[k] = 1; });
    return " 외 " + (list.length - from) + (fresh ? "일" : "건");
  };
  var out = "", n = 0;
  for (var i = 0; i < list.length; i++) {
    var next = out + (i ? sep : "") + list[i].text;
    if (i > 0 && len(next) + (i + 1 < list.length ? len(rest(i + 1)) : 0) > room) break;
    out = next; n = i + 1;
  }
  return n < list.length ? out + rest(n) : out;
}
// 한 분께 가는 한 통의 글 — rows = 그분의 줄들(같은 종류 · dutyNoteKeep 을 지난 것 · 날짜·시각 차례). 줄이 없으면 빈 글.
//   같은 날 같은 당번의 자리는 「2부 설거지 · 2부 배식」으로 묶고, 날짜·당번이 다르면 「 / 」로 잇는다. 전체는 180자 안.
//   ⚠️ 평소에는 문장 꼴(「… 당번은 쉬어요 — 안 나오셔도 돼요」). 그 문장이 180자를 넘으면 **뜻을 앞에 둔 꼴**로 바꾸고 목록을 「외 N일」로 줄인다(say) —
//      끝에서 자르기만 하면 여러 주를 한 번에 쉬게 하거나 다시 열 때 「쉬어요」·「다시 서요」가 잘려 날짜 목록만 갔다(쉰다는 말 뒤에 오면 뜻이 거꾸로 읽힌다 · 검토 반영 2026-10-07).
function dutyNoteText(kind, rows) {
  var list = (rows || []).filter(function (r) { return r; });
  if (!list.length) return "";
  var groups = [], by = {};
  list.forEach(function (r) {
    var k = String(r.date) + "|" + String(r.boardId == null ? r.board : r.boardId);
    if (!by[k]) { by[k] = { r: r, slots: [] }; groups.push(by[k]); }
    by[k].slots.push(r);
  });
  var withTime = kind === "remind" || kind === "moved" || kind === "reopen";
  var part = function (g, noDay) {
    var board = dutyPlain(g.r.board, 30);
    var slots = g.slots.map(function (r) { var n = dutySlotLabel(r, withTime); return n; }).filter(function (x) { return x; });
    // 그날이 통째로 쉬는 알림은 자리 이름을 늘어놓지 않는다(「10월 18일(일) 식당 봉사」)
    if (kind === "off" && g.slots.every(function (r) { return r.dayOff === true; })) slots = [];
    return [noDay ? "" : dutyNoteDay(g.r.date), board, slots.join(" · ")].filter(function (x) { return x; }).join(" ");
  };
  var MAX = 180, len = function (s) { return Array.from(s).length; };
  var items = function (noDay, extra) { return groups.map(function (g) { return { text: part(g, noDay) + (extra ? extra(g) : ""), date: g.r.date }; }); };
  var parts = groups.map(function (g) { return part(g, false); }).join(" / ");
  // natural = 문장 꼴 · 넘치면 head(뜻) + 들어가는 만큼의 목록(+ 「외 N일」)
  var say = function (natural, head) {
    if (len(natural) <= MAX) return dutyPlain(natural, MAX);
    return dutyPlain(head + dutyNoteFit(items(false), " / ", MAX - len(head)), MAX);
  };
  if (kind === "confirmed") {
    return say(parts + " 당번이 확정됐어요. 이제 앱에서는 취소할 수 없어요 — 못 오시면 담당자께 알려 주세요",
      "당번이 확정됐어요(이제 앱에서는 취소할 수 없어요 — 못 오시면 담당자께 알려 주세요) — ");
  }
  if (kind === "remind") {
    var sameDay = groups.every(function (g) { return g.r.date === groups[0].r.date; });
    var place = function (g) { var p = dutyPlain(g.r.place, 30); return p ? " · " + p : ""; };
    var head = "내일 " + (sameDay ? dutyNoteDay(groups[0].r.date) + " " : "") + "당번이에요 — ";
    return dutyPlain(head + dutyNoteFit(items(sameDay, place), " / ", MAX - len(head)), MAX);
  }
  if (kind === "applied") return say(parts + "에 지원하셨어요 — 확정된 날이라 앱에서 취소할 수 없어요", "확정된 날에 지원하셨어요(앱에서 취소할 수 없어요) — ");
  if (kind === "added") return say("담당자가 " + parts + " 당번에 넣어 드렸어요", "담당자가 당번에 넣어 드렸어요 — ");
  if (kind === "moved") {
    var from = list[0].movedFrom, was = from ? [dutyNoteDay(from.date), dutySlotLabel(from, true)].filter(function (x) { return x; }).join(" ") : "";
    return dutyPlain("담당자가 당번 자리를 옮겨 드렸어요 — " + (was ? was + " → " : "") + parts, MAX);
  }
  if (kind === "removed") return say("담당자가 " + parts + " 당번에서 빼 드렸어요 — 안 나오셔도 돼요", "담당자가 당번에서 빼 드렸어요(안 나오셔도 돼요) — ");
  if (kind === "off") return say(parts + " 당번은 쉬어요 — 안 나오셔도 돼요", "당번이 쉬어요(안 나오셔도 돼요) — ");
  if (kind === "reopen") return say(parts + " 당번을 다시 서요", "당번을 다시 서요 — ");
  return "";
}
// 한 분씩 글을 만들어 **같은 글끼리** 묶는다(push_log 한 줄 = 한 글) → [{ text, uids: [받는 분…] }] · 글이 안 만들어진 분은 빠진다. rows 는 받는 분(uid) 차례.
function dutyNoteGroups(kind, rows) {
  var byUser = {}, order = [];
  (rows || []).forEach(function (r) {
    if (!r || !r.uid) return;
    var k = String(r.uid);
    if (!byUser[k]) { byUser[k] = []; order.push(k); }
    byUser[k].push(r);
  });
  var out = [], at = {};
  order.forEach(function (uid) {
    var text = dutyNoteText(kind, byUser[uid]);
    if (!text) return;
    if (at[text] === undefined) { at[text] = out.length; out.push({ text: text, uids: [] }); }
    out[at[text]].uids.push(uid);
  });
  return out;
}
// 자리 한 칸의 이름 — 「2부 설거지」 · withTime 이면 「2부 설거지 11:30」
function dutySlotLabel(r, withTime) {
  var n = dutyNoteSlot(r), t = withTime && r && r.start ? String(r.start).slice(0, 5) : "";
  return [n, t].filter(function (x) { return x; }).join(" ");
}
// duty_notify_claim 의 답(bigint[] 하나) → 잡힌 지원 번호(Set). 배열이 아니거나 틀린 값은 버린다.
function dutyClaimedIds(got) {
  var out = new Set();
  (Array.isArray(got) ? got : []).forEach(function (x) {
    var n = Number(x);
    if (Number.isSafeInteger(n) && n > 0) out.add(n);
  });
  return out;
}
// 한 글 묶음의 셈 — 받는 분마다 「자기 기기 가운데 하나라도 받아들여졌나」로 가른다: sent(받아들여진 기기가 있는 분) · missed(받는 기기가 없다 · 자기 기기가 모두 실패).
//   묶음의 기기 성공 수만 보면, 같은 글을 받는 분 가운데 한 대만 받아들여져도 죽은 구독뿐인 분까지 「보냈어요」에 들었다(고침 검토 반영 2026-10-07).
//   devs = Map(받는 분 → {web, ios}) · okWeb·okIos = 받아들여진 기기 줄(보낸 그 객체 — 두 표의 번호를 섞지 않게 따로).
function dutyNoteTally(uids, devs, okWeb, okIos) {
  var w = new Set(okWeb || []), i = new Set(okIos || []), sent = 0, missed = 0;
  (uids || []).forEach(function (uid) {
    var d = devs && typeof devs.get === "function" ? devs.get(uid) : null;
    var got = !!d && ((d.web || []).some(function (x) { return w.has(x); }) || (d.ios || []).some(function (x) { return i.has(x); }));
    if (got) sent++; else missed++;
  });
  return { sent: sent, missed: missed };
}
// app_config 줄들 → 두 스위치. open = 문(dutyOpen) · off = 알림 끄기(dutyNotifyOff) — 값이 true 하나일 때만 켜진 것이다("true"·1 은 아니다).
function dutyGateOf(rows) {
  var on = function (k) { return (Array.isArray(rows) ? rows : []).some(function (x) { return !!x && x.key === k && x.value === true; }); };
  return { open: on("dutyOpen"), off: on("dutyNotifyOff") };
}
// PostgREST·Postgres 가 「그런 함수(그 인자 꼴)가 없다」고 답했나 — 새 api 가 옛 SQL 을 만났을 때만 물러서려고 본다(다른 오류는 그대로 오류다).
function dutyNoFn(err) {
  var c = err && typeof err === "object" && err.code != null ? String(err.code) : "";
  return c === "PGRST202" || c === "42883";
}
// 전날 알림이 돈 흔적(app_config dutyRemindRun) — 부를 때마다 고쳐 쓴다. 크론이 하루 두 번(19:00·19:20) 돌므로 **같은 day 의 앞선 흔적에 더한다**:
//   덮어쓰면 둘째 부름(이미 다 잡혀 0·0)이 첫 부름의 결과를 지워, 다음 날 읽는 사람이 잘 간 밤을 「0분」으로 읽는다(고침 검토 반영 2026-10-07).
//   {at: 마지막으로 돈 때(monitor 의 26시간은 이것을 본다), day, rows, sent, missed, runs: 그 day 에 돈 횟수[, off: 마지막 부름이 꺼 둔 채였다,
//    held: 그때 가지 못한 분 수 — 그 부름 전에 이미 받은 분(잡힌 줄)은 세지 않는다]}
function dutyRemindTrace(prev, now) {
  var num = function (v) { var n = Number(v); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0; };
  var same = !!prev && typeof prev === "object" && !!now.day && String(prev.day) === String(now.day);
  var out = { at: String(now.at), day: String(now.day), rows: num(now.rows), sent: num(now.sent) + (same ? num(prev.sent) : 0),
    missed: num(now.missed) + (same ? num(prev.missed) : 0), runs: (same ? Math.max(1, num(prev.runs)) : 0) + 1 };
  if (now.off === true) { out.off = true; if (now.held !== undefined && now.held !== null) out.held = num(now.held); }
  return out;
}
// monitor 가 보는 봉사 당번 알림 — v = 흔적(dutyRemindRun) · off = 끄는 스위치(dutyNotifyOff)가 켜져 있나 → 문제 글들([] = 조용).
//   ① 꺼 둔 채면 아침마다 한 줄 — 스위치는 급할 때 잠깐 쓰는 것이고, 전날 알림에는 「꺼 두었어요」를 말해 줄 화면이 없다(잊으면 며칠째 아무도 모른다).
//   ② 흔적이 **한 번이라도 생긴 뒤부터** 26시간을 본다(크론을 안 건 곳·아직 한 번도 안 돈 곳에서 헛경보가 없게 — at 이 날짜로 읽히지 않으면 없는 것으로 본다).
function dutyRemindProblems(v, nowMs, off) {
  var out = [];
  if (off === true) {
    var held = v && v.off === true ? Number(v.held) : NaN;
    out.push("봉사 당번 앱 알림이 꺼져 있습니다(app_config dutyNotifyOff) — 확정·전날 알림이 가지 않습니다" +
      (held > 0 ? "(마지막 전날 알림 때 " + Math.floor(held) + "분께 가지 않음)" : "") + ". 일부러 끈 것이 아니면 그 줄을 지우세요");
  }
  var at = v && typeof v.at === "string" ? Date.parse(v.at) : NaN;
  if (!isNaN(at)) {
    var ageH = (Number(nowMs) - at) / 3600000;
    if (ageH > 26) out.push("봉사 당번 전날 알림이 " + Math.floor(ageH) + "시간째 돌지 않았습니다 — 크론(duty-remind)과 Vault 키(edu_remind_service_key)를 확인하세요");
  }
  return out;
}
// 지난 봉사(SQL duty_past 의 jsonb) → 응답에 실을 꼴 — { total, year, rows: [{date, board, service, task, start, end, contact}] }.
//   수는 0 이상의 정수 · 줄은 **아는 일곱 칸의 글자만** 옮긴다(SQL 이 뒷날 칸을 더해도 이름·계정 번호가 응답으로 새지 않게 — 그대로 돌려주지 않는다) ·
//   날짜 꼴이 아닌 줄은 버린다 · 200줄까지. 못 읽은 값(옛 SQL — past 가 없다)은 0·빈 목록.
//   contact = 그 당번의 문의처 한 줄(당번표·내 당번에 이미 보이는 글 — 화면이 「다르게 적혀 있으면 담당자께」 아래에 보여 준다 · 옛 SQL 은 그 칸이 없어 빈 글).
//     한도 120 은 표의 한도(60자)를 흉내 낸 수가 아니라 넉넉한 안전 한도다(이모지는 UTF-16 두 칸 — 표를 지난 글이 여기서 잘리지 않게).
function dutyPastOut(r) {
  var o = r && typeof r === "object" ? r : {};
  var num = function (v) { var n = Math.floor(Number(v)); return isFinite(n) && n > 0 ? n : 0; };
  var str = function (v, max) { return typeof v === "string" ? v.slice(0, max) : ""; };
  var rows = [];
  var src = Array.isArray(o.rows) ? o.rows : [];
  for (var i = 0; i < src.length && rows.length < 200; i++) {
    var x = src[i];
    if (!x || typeof x.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(x.date)) continue;
    rows.push({ date: x.date, board: str(x.board, 40), service: str(x.service, 12), task: str(x.task, 20), start: str(x.start, 5), end: str(x.end, 5), contact: str(x.contact, 120) });
  }
  var total = Math.max(num(o.total), rows.length);
  return { total: total, year: Math.min(num(o.year), total), rows: rows };
}
// ── 봉사 당번 — 순수 함수 (여기까지) ──

// 문 — users 줄(없으면 null)과 문이 열렸는가. 문 = dutyOpen 이 true 하나이거나 시험 참여자(시험 참여자 명단을 못 읽으면 닫힘).
//   users·dutyOpen 을 못 읽은 것은 닫힘이 아니다 — 던진다(닫힘이라고 답하면 문이 열린 뒤에도 화면이 「아직 열지 않았어요」라고 말한다).
async function dutyGate(userId: string): Promise<{ user: any | null; open: boolean }> {
  if (!userId) return { user: null, open: false };
  const { data: u, error } = await db.from("users").select("id,identity_key,type,gu,mok,bu,grade,name").eq("id", userId).maybeSingle();
  if (error) throw error;
  if (!u) return { user: null, open: false };
  const { data, error: ce } = await db.from("app_config").select("value").eq("key", "dutyOpen").maybeSingle();
  if (ce) throw ce;
  if (data?.value === true) return { user: u, open: true };
  let tester = false;
  try { tester = await ministryIsTester(userId); } catch (_) { tester = false; }
  return { user: u, open: tester };
}
const dutyId = (v: unknown): number => { const n = typeof v === "number" ? v : Number(String(v ?? "").trim() || NaN); return Number.isSafeInteger(n) && n > 0 ? n : 0; };
// 이 계정이 앱에서 지원하지 못하는 까닭 — guardian(어린이·청소년 부서 — 이름과 있을 날짜·장소가 앱을 쓰는 누구에게나 보인다) ·
//   bad-name(당번표에 실을 수 없는 이름) · ''(지원할 수 있다). dutyApply 가 이것으로 막고, 읽기 응답의 me.why 로도 싣는다(화면이 단추를 두지 않게).
const dutyMeWhy = (u: any): string => (needsGuardian(u) ? "guardian" : !dutyNameOk(u?.name) ? "bad-name" : "");

// 당번 목록 + 내 당번 + 지난 봉사(past — 두 수와 가까운 세 줄) — 문이 닫혔으면 {ok:true, open:false}(아무것도 싣지 않는다)
async function dutyList(b: any) {
  const userId = eduUid(b.user_id);
  const g = await dutyGate(userId);
  if (!g.open) return { ok: true, open: false };
  const { data: r, error } = await db.rpc("duty_list_view", { p_user: userId });
  if (error) throw error;
  return { ok: true, open: true, today: r?.today ?? null, me: { why: dutyMeWhy(g.user) },
    boards: Array.isArray(r?.boards) ? r.boards : [], mine: Array.isArray(r?.mine) ? r.mine : [], past: dutyPastOut(r?.past) };
}

// 당번 하나의 날짜별 자리 — {id, user_id}. 받는 중·지원 멈춤 당번만(그 밖은 not-found).
//   past = 지난 봉사의 두 수(줄 없이 · SQL 이 줄 때만 싣는다 — 옛 SQL 이면 칸 자체가 없다: 0 으로 실으면 화면의 「지난 봉사 N번」 한 줄이 사라진다).
//     당번표만 다시 받는 길(화면이 다시 보일 때)에서 그 한 줄이 낡지 않게(독립 확인 반영 2026-10-07).
async function dutyBoard(b: any) {
  const userId = eduUid(b.user_id);
  const id = String(b.id ?? "").trim();
  if (!MH_UUID.test(id)) return { ok: false, error: "bad-args" };
  const g = await dutyGate(userId);
  if (!g.open) return { ok: true, open: false };
  const { data: r, error } = await db.rpc("duty_board_view", { p_board: id, p_user: userId });
  if (error) throw error;
  if (!r || r.ok !== true) return { ok: false, error: "not-found" };
  return { ok: true, open: true, today: r.today ?? null, me: { why: dutyMeWhy(g.user) }, board: r.board, days: Array.isArray(r.days) ? r.days : [],
    ...(r.past && typeof r.past === "object" ? { past: dutyPastOut(r.past) } : {}) };
}

// 내 당번 — 오늘 이후 · 살아 있는 줄 + 담당자가 뺀 줄(그날까지)
async function dutyMine(b: any) {
  const le = await lifeError(b); if (le) return { ok: false, error: le };
  const userId = eduUid(b.user_id);
  const g = await dutyGate(userId);
  if (!g.open) return { ok: true, open: false };
  const { data: r, error } = await db.rpc("duty_mine", { p_user: userId });
  if (error) throw error;
  return { ok: true, open: true, mine: Array.isArray(r) ? r : [] };
}

// 지난 봉사(2026-10-07) — 날짜가 지난 내 줄 가운데 당번표에 남아 있는 것(가까운 날부터 60줄 · 두 수) · {user_id}. 문이 닫혔으면 {ok:true, open:false}.
//   내 것만 준다(다른 분의 이름·수 없음) — 세는 기준은 SQL duty_past 한 곳.
async function dutyPast(b: any) {
  const le = await lifeError(b); if (le) return { ok: false, error: le };
  const userId = eduUid(b.user_id);
  const g = await dutyGate(userId);
  if (!g.open) return { ok: true, open: false };
  const { data: r, error } = await db.rpc("duty_past", { p_user: userId, p_limit: 60 });
  if (error) throw error;
  return { ok: true, open: true, today: typeof r?.today === "string" ? r.today : null, past: dutyPastOut(r) };
}

// 지원 — {slot_id, user_id, ack_locked?}. 잠긴 날(확정됐거나 전날 저녁이 지남)은 「취소할 수 없어요」를 알고 누른 것(ack_locked:true)일 때만 들어간다
//   (아니면 locked-day — 아무것도 안 쓴다 · 화면이 확인 창을 띄운 뒤 다시 보낸다).
//   거절: no-user · bad-args · not-open · guardian(어린이·청소년 부서 — 앱에서는 지원하지 않는다) · bad-name ·
//         not-found · closed · off · past · started · not-yet · after-until · removed-by-staff · locked-day · full · overlap{with} · too-many{max}
async function dutyApply(b: any) {
  const le = await lifeError(b); if (le) return { ok: false, error: le };
  const userId = eduUid(b.user_id);
  const slot = dutyId(b.slot_id);
  if (!userId) return { ok: false, error: "no-user" };
  if (!slot) return { ok: false, error: "bad-args" };
  const g = await dutyGate(userId);
  if (!g.user) return { ok: false, error: "no-user" };
  if (!g.open) return { ok: false, error: "not-open" };
  const u = g.user;
  const why = dutyMeWhy(u);   // guardian · bad-name — SQL 을 부르기 **전에** 막는다(tests/duty-front.test.cjs 가 차례를 글자로 본다)
  if (why) return { ok: false, error: why };
  const isGu = u.type === "교구";
  const ident = { name: norm(u.name), who_type: u.type, group_name: isGu ? norm(u.gu) : norm(u.bu), sub_name: isGu ? norm(u.mok) : norm(u.grade), ident_key: identityKey(u) };
  const { data: r, error } = await db.rpc("duty_apply", { p_slot: slot, p_user: userId, p_ident: ident, p_staff: false, p_force: false, p_ack_locked: b.ack_locked === true });
  if (error) throw error;
  if (!r) return { ok: false, error: "server" };
  if (r.ok !== true) {
    if (r.error === "overlap") return { ok: false, error: "overlap", with: dutyOverlapOut(r.with) };
    if (r.error === "too-many") return { ok: false, error: "too-many", max: Number(r.max) || 0 };
    return { ok: false, error: dutyErrOut(r.error) };
  }
  // 잠긴 날에 새로 들어간 지원은 그 계정의 기기로 곧바로 알린다(설계 §8 — 남의 이름·소속으로 들어와 넣은 지원은 본인이 앱에서 지울 수 없다 → 본인이 그날 안다).
  //   응답을 기다리게 하지 않는다(eduAfterResponse) · 이미 서 있던 줄(already)은 알리지 않는다 · 문·기기·글은 dutyNotifySend 가 본다.
  if (r.locked === true && r.already !== true && Number.isSafeInteger(Number(r.id)) && Number(r.id) > 0) {
    eduAfterResponse(dutyNotifySend("applied", [Number(r.id)]), "dutyApply notify");
  }
  return { ok: true, locked: r.locked === true, already: r.already === true };
}

// 취소 — {signup_id, user_id}. 내 줄인지는 SQL 이 본다(남의 줄은 없는 줄과 같다 · not-found).
//   거절: not-open · not-found · not-active · changed · past · locked(잠긴 날 — 담당자께) · staff-row(담당자가 넣은 줄 — 「못 가게 됐어요」로)
async function dutyCancel(b: any) {
  const le = await lifeError(b); if (le) return { ok: false, error: le };
  const userId = eduUid(b.user_id);
  const sid = dutyId(b.signup_id);
  if (!userId || !sid) return { ok: false, error: "bad-args" };
  const g = await dutyGate(userId);
  if (!g.open) return { ok: false, error: "not-open" };
  const { data: r, error } = await db.rpc("duty_cancel", { p_signup: sid, p_user: userId, p_staff: false });
  if (error) throw error;
  if (!r) return { ok: false, error: "server" };
  return r.ok === true ? { ok: true } : { ok: false, error: dutyErrOut(r.error) };
}

// 「못 가게 됐어요」 — {signup_id, user_id, why: cant|mistake|notme | null(거두기)}. 줄은 그대로 — 빼는 것은 담당자.
//   거절: not-open · bad-args · not-found · not-active · changed · past · not-locked(잠기지 않은 내 지원 줄 — 그냥 취소하면 된다)
async function dutyAsk(b: any) {
  const le = await lifeError(b); if (le) return { ok: false, error: le };
  const userId = eduUid(b.user_id);
  const sid = dutyId(b.signup_id);
  const w = dutyWhyOf(b.why);
  if (!userId || !sid || !w.ok) return { ok: false, error: "bad-args" };
  const g = await dutyGate(userId);
  if (!g.open) return { ok: false, error: "not-open" };
  const { data: r, error } = await db.rpc("duty_ask", { p_signup: sid, p_user: userId, p_why: w.why });
  if (error) throw error;
  if (!r) return { ok: false, error: "server" };
  return r.ok === true ? { ok: true, asked: r.asked === true } : { ok: false, error: dutyErrOut(r.error) };
}

// ---------- 봉사 당번 앱 알림(3단계 · 2026-10-06 · 설계 §10) ----------
// 보내는 길은 dutyNotifySend 하나 — 담당자의 저장(internalDutyNotify · 교회 어드민 duty-db.ts withNotify) · 전날 저녁(internalDutyRemind · pg_cron) ·
//   잠긴 날의 앱 지원(dutyApply)이 모두 이리로 온다. 글은 순수 함수 dutyNoteText(위 순수 구간 · tests/duty-front.test.cjs).
// ⚠️ 받는 분은 **성도님뿐**이다(그 지원 줄의 앱 계정 기기) — 담당자에게 가는 알림은 없다(「못 가게 됐어요」는 당번표의 표시다).
// ⚠️ 응답·push_log·알림 내용에 user_id 를 싣지 않는다. 알림 글은 글자 그대로(dutyPlain — HTML 아님).
// ⚠️ 문: dutyOpen 이 true 가 아니면 🧪 시험 참여자에게만 — 앱에서 🙋 가 시험 참여자에게만 보이는 것(app.js dutyVisible)과 같은 규칙. 걸러진 줄은 **잡지 않는다**
//    (기록이 안 남아 문이 열린 뒤 다시 부르면 갈 수 있다).
// ⚠️ 확정(confirmed)·전날(remind)은 같은 줄에 한 번 — SQL duty_notify_claim 이 **보내기 전에** 잡고 잡힌 줄에만 보낸다(받는 기기가 없어도 잡힌 줄은 남는다 ·
//    보내다 실패해도 다시 안 보낸다 — 많아야 한 번). 그 밖(넣음·옮김·뺌·쉼·다시 엶·잠긴 날 지원)은 저장 한 번에 한 번 부탁하므로 잡지 않는다.
// ⚠️ 돌려주는 수는 둘이다 — sent(**자기 기기 가운데 하나라도 받아들여진 분**) · missed(가지 않은 분: 받는 기기가 없다 · 자기 기기가 모두 실패). 받는 분마다 센다
//    (dutyNoteTally — 같은 글을 받는 다른 분의 기기가 받아들여졌다고 「보냈어요」에 들지 않는다). 담당자 화면이 「N분께 보냈어요」라고 말하는 수라,
//    글을 만든 분 수를 그대로 주면 알림을 켜지 않은 분(대부분이다)까지 보냈다고 말하게 된다(검토 반영 2026-10-07).
//    걸러진 줄(지난 날·끝난 자리·문이 닫힌 동안의 시험 참여자 아닌 분 …)은 어느 수에도 들지 않는다 — 알림 대상이 아니다.
// ⚠️ 끄는 스위치 — app_config dutyNotifyOff 가 true 면 아무것도 **잡지도 보내지도** 않는다({off:true}). 되돌릴 때 옛 묶음을 다시 올리지 않고 이 한 줄로 끈다
//    (PUBLIC_CONFIG_KEYS 에 넣지 않는다 — 앱이 읽을 일이 없다). 꺼 둔 동안에도 「보낼 알림이 있었나」(held — 거르기·문을 지나고, 확정·전날은 아직 잡히지 않은 분 수)는 읽어 돌려준다:
//    담당자 화면이 알림이 갈 일이 없던 저장(지난 날 바로잡기 · 준비 중 당번 · 앱 계정 없는 줄)에까지 「따로 알려 주세요」 창을 띄우지 않게.
//    ⚠️ **켠 뒤 저절로 다시 가는 것은 없다** — 잡힌 줄이 없을 뿐이다. 확정은 담당자의 「확정 풀기 → 다시 확정」, 전날 알림은 **그날 24시 전에** 같은 길로 한 번
//       (19시 뒤라 anytime 없이 — 자정을 넘기면 too-early 이고, anytime 을 실으면 모레 분들께 간다), 그 밖(넣음·옮김·뺌·쉼)은 다시 보낼 길이 없다
//       (담당자가 그때 본 「꺼 두었어요 — 따로 알려 주세요」 창이 전부다). 꺼 둔 채면 monitor 가 아침마다 말한다(dutyRemindProblems).
// ⚠️ 기기는 두 갈래 — 웹 푸시(플레이 앱 포함)와 아이폰(APNs). 교육 알림과 같은 길(eduDevicesOf·eduPushDevices)을 쓴다 · push_log mode 는 duty-<종류>
//    (monitor 는 daily 줄만 본다 — duty-* 가 0건이어도 헛경보가 나지 않는다).
const DUTY_NOTIFY_TITLE = "🙋 봉사 당번";
const DUTY_NOTIFY_MAX = 2000;    // 한 번에 받는 지원 번호 수
const DUTY_NOTIFY_CHUNK = 500;   // 읽고 잡는 한 덩이
const DUTY_NOTIFY_URL = "https://gocheok.onlybible.kr/?duty=1";   // 누르면 당번 화면(js/duty.js dutyTakeDeepLink) — 아이폰 앱은 주소를 안 읽어 앱만 열린다

// 봉사 당번 알림의 두 스위치 — open: 문(dutyOpen)이 열렸나 · off: 알림을 꺼 두었나(dutyNotifyOff). 알림용이라 DB 오류는 던진다
//   (삼켜서 「닫힘」으로 보면 아무에게도 안 가는 것이 조용히 묻힌다). 값 읽기는 순수 함수 dutyGateOf.
async function dutyNotifyGate(): Promise<{ open: boolean; off: boolean }> {
  const { data, error } = await db.from("app_config").select("key,value").in("key", ["dutyOpen", "dutyNotifyOff"]);
  if (error) throw error;
  return dutyGateOf(data);
}

// 알릴 줄 고르기(읽기만 — 잡지 않는다) — ① 재료(duty_notify_rows — 앱 계정이 있는 줄 · 받는 중·지원 멈춤 당번)를 읽어 종류에 맞는 줄만 남긴다
//   (dutyNoteKeep — 지난 날·끝난 자리·쉬는 날·전날 저녁이 지난 날의 확정 등 · day = 전날 알림이 고른 날짜) ② 문이 닫혔으면(open 아님) 시험 참여자 줄만.
async function dutyNotifyPick(kind: string, list: number[], day: string | undefined, open: boolean): Promise<any[]> {
  let rows: any[] = [];
  for (let i = 0; i < list.length; i += DUTY_NOTIFY_CHUNK) {
    const { data, error } = await db.rpc("duty_notify_rows", { p_ids: list.slice(i, i + DUTY_NOTIFY_CHUNK) });
    if (error) throw error;
    if (Array.isArray(data)) rows.push(...data);
  }
  rows = rows.filter((r) => dutyNoteKeep(kind, r, day));
  if (!rows.length || open) return rows;
  const testers = await ministryTesterIds();
  return rows.filter((r) => testers.has(String(r.uid)));
}

// 고른 줄 가운데 그 종류로 **아직 잡히지 않은** 줄만(읽기만 — 잡지 않는다). 꺼 둔 동안의 held 를 세는 데만 쓴다:
//   확정·전날은 같은 줄에 한 번이라, 이미 잡힌(=이미 받은) 줄은 꺼 두지 않았어도 다시 가지 않는다 — 그 줄까지 세면 19:00 에 잘 간 밤에 스위치를 끈 뒤의 19:20 부름이
//   monitor 의 「N분께 가지 않음」이 되고, 이미 확정 알림을 받은 날의 다시 확정에 「따로 알려 주세요」 창이 뜬다(회귀 확인 반영 2026-10-07).
//   잡지 않는 종류(넣음·옮김·뺌·쉼·다시 엶·잠긴 날 지원)는 그대로 돌려준다. 겹침 키는 잡기(duty_notify_claim)와 같다 — (signup_id, kind).
async function dutyNotifyUnclaimed(kind: string, rows: any[]): Promise<any[]> {
  if (!rows.length || DUTY_NOTE_CLAIM.indexOf(kind) < 0) return rows;
  const had = new Set<number>();
  for (let i = 0; i < rows.length; i += 200) {
    const { data, error } = await db.from("duty_notify_log").select("signup_id").eq("kind", kind).in("signup_id", rows.slice(i, i + 200).map((r) => Number(r.id)));
    if (error) throw error;
    for (const x of (Array.isArray(data) ? data : [])) had.add(Number(x.signup_id));
  }
  return rows.filter((r) => !had.has(Number(r.id)));
}

// 지원 번호들에 kind 알림 — 돌려주는 것 = { sent: 실제로 나간 분 수, missed: 가지 않은 분 수(받는 기기 없음·자기 기기가 모두 실패), off: 꺼 둠, held: 꺼 두지 않았으면 보냈을 분 수 }
//   (한 분께 한 통 · 그분의 줄들을 한 글로).
//   ⓪ 꺼 두었으면(dutyNotifyOff) 잡지도 보내지도 않는다 — 고르기만 해서 held 를 돌려준다(확정·전날은 이미 잡힌 줄을 뺀다 — dutyNotifyUnclaimed ·
//      읽다 실패하면 held 없이 — 화면은 모르는 것으로 본다)
//   ① 알릴 줄을 고른다(dutyNotifyPick — 거르기 → 문) ② 그분들의 기기를 먼저 읽고(잡은 뒤에 읽다 실패하면 영영 안 간다)
//   ③ 확정·전날은 duty_notify_claim 으로 잡는다(잡힌 줄만) — 전날 알림은 고른 날짜도 함께(p_date · 그사이 옮겨진 줄을 옛 날짜로 잡지 않는다 · 옛 SQL 이면 인자 둘로).
//      뒤 덩이에서 DB 오류가 나도 **그때까지 잡힌 줄은 보낸 뒤** 던진다(잡힌 채 안 가는 줄을 남기지 않는다 · 안 잡힌 줄은 다시 부르면 간다)
//   ④ 한 분씩 글을 만들어 같은 글끼리 묶어 보낸다(dutyNoteGroups — push_log 한 줄 · 기기가 0 이어도 한 줄 남는다) ⑤ 받는 분마다 센다(dutyNoteTally).
async function dutyNotifySend(kind: string, ids: number[], day?: string): Promise<{ sent: number; missed: number; off?: boolean; held?: number }> {
  const list = [...new Set(ids.filter((n) => Number.isSafeInteger(n) && n > 0))];
  if (!list.length || DUTY_NOTE_KINDS.indexOf(kind) < 0) return { sent: 0, missed: 0 };
  const gate = await dutyNotifyGate();
  if (gate.off) {
    let held: number | undefined;
    try { held = new Set((await dutyNotifyUnclaimed(kind, await dutyNotifyPick(kind, list, day, gate.open))).map((r) => String(r.uid))).size; }
    catch (e) { console.error("dutyNotifySend held", kind, e); }
    return { sent: 0, missed: 0, off: true, ...(held === undefined ? {} : { held }) };
  }
  let rows = await dutyNotifyPick(kind, list, day, gate.open);
  if (!rows.length) return { sent: 0, missed: 0 };
  const devs = await eduDevicesOf([...new Set(rows.map((r) => String(r.uid)))]);
  let claimErr: unknown = null;
  if (DUTY_NOTE_CLAIM.indexOf(kind) >= 0) {
    const got = new Set<number>();
    let dated = kind === "remind" && !!day;
    for (let i = 0; i < rows.length; i += DUTY_NOTIFY_CHUNK) {
      const p_ids = rows.slice(i, i + DUTY_NOTIFY_CHUNK).map((r) => Number(r.id));
      let { data, error } = await db.rpc("duty_notify_claim", dated ? { p_kind: kind, p_ids, p_date: day } : { p_kind: kind, p_ids });
      if (error && dated && dutyNoFn(error)) {   // 옛 SQL(날짜 인자가 없는 꼴) — 인자 둘로 물러선다(이 부름의 남은 덩이도)
        dated = false;
        ({ data, error } = await db.rpc("duty_notify_claim", { p_kind: kind, p_ids }));
      }
      if (error) { claimErr = error; break; }
      for (const n of dutyClaimedIds(data)) got.add(n);
    }
    rows = rows.filter((r) => got.has(Number(r.id)));
  }
  let sent = 0, missed = 0;
  for (const g of dutyNoteGroups(kind, rows)) {
    const web: any[] = [], ios: any[] = [];
    for (const uid of g.uids) {
      const d = devs.get(uid);
      if (d) { web.push(...d.web); ios.push(...d.ios); }
    }
    let res: { okWeb?: any[]; okIos?: any[] } | null = null;
    try { res = await eduPushDevices(web, ios, DUTY_NOTIFY_TITLE, g.text, DUTY_NOTIFY_URL, "duty-" + kind); }
    catch (e) { console.error("dutyNotifySend", kind, e); }
    const t = dutyNoteTally(g.uids, devs, res ? res.okWeb : null, res ? res.okIos : null);   // 보내다 던졌으면 모두 missed
    sent += t.sent; missed += t.missed;
  }
  if (claimErr) throw claimErr;
  return { sent, missed };
}

// 교회 어드민 전용 — {kind: confirmed|added|moved|removed|off|reopen, signup_ids: [지원 번호…]} · 같은 프로젝트 서비스 키(x-internal-key)일 때만
//   (internalEduNotify 와 같은 문 · sameSecret). 담당자의 저장이 **끝난 뒤** 부른다(교회 어드민 duty-db.ts withNotify — 실패해도 저장은 그대로).
//   응답 {ok, sent: 실제로 나간 분 수, missed: 가지 않은 분 수(받는 기기 없음·자기 기기가 모두 실패)[, off: 알림을 꺼 둠, held: 꺼 두지 않았으면 보냈을 분 수]} —
//   user_id 는 싣지 않는다.
//   문·한 번만·앱 계정·오늘 이후 자리 확인은 dutyNotifySend 가 한다.
async function internalDutyNotify(req: Request, b: any) {
  if (!sameSecret(req.headers.get("x-internal-key") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "")) {
    return { ok: false, error: "unauthorized" };
  }
  const kind = String(b.kind ?? "");
  if (DUTY_NOTE_STAFF_KINDS.indexOf(kind) < 0) return { ok: false, error: "bad-kind" };
  const raw = b.signup_ids;
  if (!Array.isArray(raw) || raw.length > DUTY_NOTIFY_MAX) return { ok: false, error: "bad-args" };
  const ids = [...new Set(raw.map((x: unknown) => Number(x)))] as number[];
  if (ids.some((n) => !Number.isSafeInteger(n) || n < 1)) return { ok: false, error: "bad-args" };
  const n = ids.length ? await dutyNotifySend(kind, ids) : { sent: 0, missed: 0 };
  return { ok: true, sent: n.sent, missed: n.missed, ...(n.off ? { off: true, ...(n.held === undefined ? {} : { held: n.held }) } : {}) };
}

// 전날 알림 — pg_cron(supabase/duty_remind_cron.sql · 매일 10:00·10:20 UTC = 19:00·19:20 KST)이 서비스 키(x-internal-key)로 부른다.
//   내일(한국) 당번인 분께 한 번(duty_remind_ids — 살아 있는 줄 · 앱 계정 · 쉬는 날·자리 아님 · 받는 중·지원 멈춤 당번 → 잡기는 duty_notify_claim).
//   한 분의 여러 자리는 한 통에. 응답 {ok, day, rows: 대상 줄 수, sent: 실제로 나간 분 수, missed: 가지 않은 분 수} — user_id 없음.
//   ⚠️ **한국 19시 전에는 돌지 않는다**(too-early) — 「내일」은 부른 순간의 한국 날짜 + 1 이라, 자정을 넘겨(놓친 것을 되살리려고) 부르면 모레 분들께 하루 일찍 가고
//      그분들의 제 시각 알림이 잡힌 채 사라진다(검토 반영 2026-10-07). anytime:true 는 **개발 시험만** 싣는다 — 크론도, 손으로 되살리는 부름도 싣지 않는다
//      (같은 저녁의 되살리기는 19시 뒤라 그대로 지나고, 자정을 넘겼으면 되살릴 수 없다 — 그것을 막는 문이다).
//   ⚠️ 돌 때마다 흔적을 남긴다(app_config dutyRemindRun — dutyRemindTrace: {at, day, rows, sent, missed, runs[, off, held]} · 받는 분 번호 없음 ·
//      같은 day 의 앞선 부름에 더한다). 크론은 net.http_post 를 넣기만 하면 succeeded 라 키가 틀려 여기까지 못 온 것은 이 흔적이 멈춘 것으로만 안다 —
//      monitor 가 26시간을 본다(dutyRemindProblems). 보낸 기록은 push_log(mode duty-remind).
async function internalDutyRemind(req: Request, b: any) {
  if (!sameSecret(req.headers.get("x-internal-key") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "")) {
    return { ok: false, error: "unauthorized" };
  }
  if (b?.anytime !== true && new Date(Date.now() + 9 * 3600 * 1000).getUTCHours() < 19) return { ok: false, error: "too-early" };
  const day = new Date(Date.parse(eduKst() + "T00:00:00Z") + 86400000).toISOString().slice(0, 10);   // 내일(한국)
  const { data, error } = await db.rpc("duty_remind_ids", { p_date: day });
  if (error) throw error;
  const ids = [...dutyClaimedIds(data)];
  const n: { sent: number; missed: number; off?: boolean; held?: number } = ids.length ? await dutyNotifySend("remind", ids, day) : { sent: 0, missed: 0 };
  try {
    const at = new Date().toISOString();
    const { data: was } = await db.from("app_config").select("value").eq("key", "dutyRemindRun").maybeSingle();
    const value = dutyRemindTrace(was?.value, { at, day, rows: ids.length, sent: n.sent, missed: n.missed, off: n.off === true, held: n.held });
    // supabase-js 는 던지지 않는다 — 돌려받은 오류를 본다(묻히면 26시간 뒤 「크론·Vault 키를 확인하세요」라는 엉뚱한 경보만 남는다)
    const { error: te } = await db.from("app_config").upsert({ key: "dutyRemindRun", value, updated_at: at });
    if (te) console.error("dutyRemindRun", te.message || te);
  } catch (e) { console.error("dutyRemindRun", e); }
  return { ok: true, day, rows: ids.length, sent: n.sent, missed: n.missed, ...(n.off ? { off: true } : {}) };
}

// 신청 한 건의 키는 (연도, user_id) 다. 이 앱은 로그인이 교구·목장·이름을
// identity_key 로 정규화해 users 를 upsert 하므로 **한 사람 = 한 user_id** 이고,
// 결국 「연도 + 성명 + 교구 + 목장」과 같은 뜻이 된다(2026-09-08 확인).
// ⚠️ 다만 이름·소속은 앱이 보낸 값을 믿지 않고 users 에서 가져온다 —
//    담당자가 교적과 맞대 볼 값이라 서버가 아는 것이 맞다.
async function ministryWho(userId: string) {
  const { data } = await db.from("users")
    .select("id,identity_key,type,gu,mok,bu,grade,name").eq("id", userId).maybeSingle();
  if (!data) return null;
  const who = data.type === "교구"
    ? [data.gu, data.mok ? data.mok + "목장" : ""].filter(Boolean).join(" ")
    : [data.bu, data.grade].filter(Boolean).join(" ");
  return { key: data.identity_key as string, name: (data.name as string) || "", who };
}

function ministryRow(r: any) {
  return {
    id: r.id,
    year: r.year,
    team_id: r.team_id,
    committee: r.committee ?? "",
    team: r.team ?? "",
    option: r.option ?? "",
    status: r.status,
    locked: isLocked(r.status),
    // ⚠️ note(담당자 메모·취소 사유)는 **여기 싣지 않는다.** 이 함수는 ministryMine 을 타고
    //    성도 화면까지 간다 — 「관리자만 본다」는 약속이 그 한 줄로 깨진다.
    //    관리자에게는 ministryList 가 따로 싣는다.
    position: r.position ?? "",
    at: kstDay(r.created_at).replace(/-/g, "."),
    created_at: r.created_at,
    decided_at: r.decided_at ?? null,
  };
}

// 성도 화면이 보는 「내 신청」 — 건 목록과 남은 자리를 함께 준다.
// ⚠️ 남은 자리는 서버가 센다. 화면이 세면 잠긴 건을 빠뜨리기 쉽다.
function ministryMineView(rows: any[]) {
  const items = rows.map(ministryRow);
  const pos = rows.map((r) => norm(r.position)).filter(Boolean)[0] || "";
  return {
    items,
    max: MINISTRY_MAX,
    // ⚠️ 미채택은 자리를 도로 내놓는다 — 세는 것과 보이는 것이 다르다
    used: items.filter((x) => countsToCap(x.status)).length,
    left: Math.max(0, MINISTRY_MAX - items.filter((x) => countsToCap(x.status)).length),
    openCount: items.filter((x) => !x.locked).length,
    position: pos,
    at: items.length ? items[0].at : "",
  };
}


// 사역팀 목록 — 임명직도 함께 내려준다(화면에서 잠근 채 보여 준다)
async function ministryCatalog(b: any) {
  const cfg = await ministryCfg();
  const year = Number(b.year) || cfg.year;
  const { data, error } = await db.from("ministry_catalog")
    .select("id,committee,group_name,team,kind,schedule_note,desc_note,capacity_note,"
      + "option_note,members_note,leader_note,sort_order,"
      + "day_sun,day_fri,day_sat,day_week,time_from,time_to," + MINISTRY_FREQ_COLS)
    .eq("year", year)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });   // ⚠️ 겹칠 때 차례가 흔들리지 않게 둘째 열쇠
  if (error) throw error;

  // 팀마다 「지금 섬기는 분」 — 담당자가 **접수완료**를 누른 건부터 보인다(성도님 요구 ①).
  // ⚠️ 신청완료(아직 접수 전)는 넣지 않는다. 확정 전 신청자를 남에게 보이는 일이 된다.
  // ⚠️ 관리자가 손으로 넣은 members_note 가 **먼저** 온다 — 앱을 거치지 않고 지금 섬기시는
  //    분들이라 첫해에는 그쪽이 명단의 전부다.
  const roster = new Map<number, string[]>();
  const { data: served } = await db.from("ministry_orders")
    .select("team_id,name,position,who,status,created_at")
    .eq("year", year).in("status", MINISTRY_ROSTER)
    .order("created_at", { ascending: true });
  for (const r of ((served ?? []) as any[])) {
    const line = ministryMemberLine(r);
    if (!line) continue;
    const k = Number(r.team_id);
    if (!roster.has(k)) roster.set(k, []);
    roster.get(k)!.push(line);
  }

  return {
    ok: true,
    year,
    period: { open: cfg.open, close: cfg.close, isOpen: cfg.isOpen },
    list: (data ?? []).map((r: any) => ({
      id: r.id, committee: r.committee, group: r.group_name, team: r.team,
      appoint: r.kind === "appoint",
      sched: ministryHtml(r.schedule_note, 160),
      desc: ministryHtml(r.desc_note, 400),
      capacity: ministryHtml(r.capacity_note, 80),
      // 사역 담당자(문의처) — 그냥 글자다. 화면에서 「섬기는 분」 위에 보인다(2026-09-18 성도님).
      leader: ministryHtml(r.leader_note, 200),
      // 「지금 섬기는 분」 — 관리자가 적어 둔 분들 + 담당자가 접수완료한 신청자
      members: [ministryHtml(r.members_note, 1200), (roster.get(Number(r.id)) ?? []).join("<br>")]
        .filter(Boolean).join("<br>"),
      // ⚠️ 관리자 편집기는 **이것만** 고친다. 위 members 를 되돌려 저장하면
      //    자동 명단이 members_note 에 굳어 중복되고, 미채택된 분 이름도 영영 남는다.
      membersNote: ministryHtml(r.members_note, 1200),
      opt: r.option_note,
      // 필터용 — ⚠️ 구간(6~9 …)으로 바꾸지 않고 **시각 그대로** 내보낸다.
      //    구간은 화면이 묶는다. 그래야 구간을 다시 그어도 서버·부서를 안 건드린다.
      //    비어 있음 = 「모름」이다: 요일 셋이 다 false 면 화면이 「정해진 날 없음」으로,
      //    시각이 비면 「때마다 다름」으로 다룬다(숨기지 않는다).
      // ⚠️ 금요일을 따로 둔다 — 금요성령집회·행복전도대(금)처럼 금요일 사역이 많은데
      //    「평일」로 뭉뚱그리면 금요일만 되는 분이 골라 찾을 수 없다.
      //    그래서 여기의 week 는 **금요일을 뺀 평일**이다.
      day: { sun: !!r.day_sun, fri: !!r.day_fri, sat: !!r.day_sat, week: !!r.day_week },
      // ⚠️ 주기는 **여럿일 수 있다**(매주 또는 격주인 팀이 있다). 한 칸 text 였던 것을
      //    네 칸으로 나눴다 — 요일과 같은 모양이라 화면도 같은 방식으로 다룬다.
      freq: ministryFreqOf(r),
      // ⚠️ 시각은 **주일 사역에만** 있다(성도님 결정 2026-09-10). DB 제약
      //    ministry_catalog_time_sun_chk 가 같은 규칙을 지킨다.
      from: r.time_from || "", to: r.time_to || "",
    })),
  };
}

// 내 신청 — 없으면 null
async function ministryMine(b: any) {
  const le = await lifeError(b); if (le) return { ok: false, error: le };
  const userId = String(b.user_id || "");
  const cfg = await ministryCfg();
  const period = { open: cfg.open, close: cfg.close, isOpen: cfg.isOpen };
  if (!userId) return { ok: true, mine: null, period };
  const { data, error } = await db.from("ministry_orders").select("*")
    .eq("year", cfg.year).eq("user_id", userId).order("created_at", { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as any[];
  return { ok: true, mine: rows.length ? ministryMineView(rows) : null, period };
}


// 신청·수정 — 같은 해 신청이 있으면 그 건을 고친다
async function ministryApply(b: any) {
  const le = await lifeError(b); if (le) return { ok: false, error: le };
  const userId = String(b.user_id || "");
  if (!userId) return { ok: false, error: "user_id 필요" };
  const cfg = await ministryCfg();
  // ⚠️ 기간 검사는 서버가 한다. 화면이 막는 것은 편의일 뿐이다.
  // ⚠️ 기간 밖에 통과하는 것은 둘뿐이다: 관리자 비번이 맞거나, 시험 참여자(교회 어드민 🧪 명단)이거나.
  // ⚠️ **b.preview 는 보지 않는다(2026-10-08 걷음).** 서버가 확인할 수 없는 값이라 이 깃발만 알면 누구나
  //    기간 밖에 신청을 넣을 수 있었다(2026-09-09 에 시험용으로 일부러 열어 둔 것 — 이제 시험은 명단으로 한다).
  //    앱은 아직 preview 를 함께 보내지만 여기서는 버린다. 되살리지 말 것.
  // ⚠️ 신청 기간(12-13) 전에 그때까지 들어온 시험 행을 지울 것 — 안 그러면 진짜 신청에 시험 자료가 섞인다.
  if (!cfg.isOpen && adminError(b) && !(await ministryIsTester(userId))) {
    return { ok: false, error: "신청 기간이 아닙니다 (" + cfg.open + " ~ " + cfg.close + ")" };
  }

  const raw = Array.isArray(b.choices) ? b.choices : [];
  const ids = [...new Set(raw
    .map((c: any) => Number(c && typeof c === "object" ? c.id : c) || 0)
    .filter((n: number) => n > 0))];

  // 이미 낸 것들 — 잠긴 건은 건드리지 않고 자리만 센다
  const { data: had } = await db.from("ministry_orders")
    .select("id,team_id,status,phone")
    .eq("year", cfg.year).eq("user_id", userId);
  const mine = (had ?? []) as any[];
  const locked = mine.filter((r) => isLocked(r.status));
  const openRows = mine.filter((r) => !isLocked(r.status));

  // 잠긴 팀이 다시 올라오면 조용히 뺀다 — 화면이 이미 체크해 보여 주기 때문이다
  const lockedTeam = new Set(locked.map((r) => Number(r.team_id)));
  const want = ids.filter((id: number) => !lockedTeam.has(id));

  if (!want.length) {
    return locked.length
      ? { ok: false, error: "새로 고르신 사역이 없습니다. 이미 접수된 사역은 뺄 수 없어요" }
      : { ok: false, error: "사역을 하나 이상 골라 주세요" };
  }
  // ⚠️ 3개 상한은 잠긴 것까지 더해서 센다(성도님 요구 ③의 반대편이다)
  // ⚠️ 자리를 세는 것은 잠긴 것 전부가 아니라 **미채택을 뺀** 것이다
  const held = locked.filter((r) => countsToCap(r.status)).length;
  if (held + want.length > MINISTRY_MAX) {
    return { ok: false, error: "이미 접수된 " + held + "개를 더하면 " +
      MINISTRY_MAX + "개를 넘습니다. 남은 자리는 " + (MINISTRY_MAX - held) + "개입니다" };
  }

  const { data: teams, error: e1 } = await db.from("ministry_catalog")
    .select("id,committee,team,kind").eq("year", cfg.year).in("id", want);
  if (e1) throw e1;
  const found = (teams ?? []) as any[];
  if (found.length !== want.length) {
    return { ok: false, error: "없는 사역이 섞여 있습니다. 새로고침 후 다시 골라 주세요" };
  }
  const appointed = found.find((t) => t.kind === "appoint");
  if (appointed) {
    return { ok: false, error: appointed.team + " 은(는) 지명으로 정해지는 자리라 신청할 수 없습니다" };
  }

  // 확인 번호 문이 이 분에게 켜졌으면(Plan 5) 번호를 받지 않는다 — 교적과 이어졌는지로 가른다.
  //   이어짐 → 번호 없이 저장(담당자는 교적에서 번호를 본다).
  //   안 이어짐(명부를 읽었는데 없음=no) → 연락처가 없으면 contact-needed 로 한 번 묻는다.
  //   못 읽음(null · person_how 빈칸) → 묻지 않고 저장한다(명부가 잠깐 안 읽혔을 뿐).
  // 스위치가 꺼진 평소에는 지금까지대로 번호를 그대로 받는다.
  let phone = "";
  if (await lifeActive(b)) {
    let link = await lifePersonLinked(userId);
    if (!link.linked) { await lifeMatchPerson(userId); link = await lifePersonLinked(userId); }
    if (!link.linked && link.how === "no") {
      phone = await lifeContactPhone(userId);
      if (!phone) {
        return { ok: false, confirm: "contact-needed",
          message: "담당자가 임명·연락을 위해 쓸 수 있게 연락처를 한 번만 남겨 주세요." };
      }
    }
  } else {
    phone = pilsaPhone(b.phone);
    if (!PILSA_PHONE_RE.test(phone)) {
      return { ok: false, error: "휴대폰 번호를 확인해 주세요 (010-1234-5678)" };
    }
  }
  // ⚠️ 이미 낸 건이 있으면 그때 넣은 4자리와 같아야 한다 — 비밀번호가 없는 앱의 최소 확인.
  //    결정(임명확정·미채택·취소)이 난 건은 보지 않는다 — 옛 관리 화면은 결정 때 번호를 지우고, 교회 어드민(2026-10~)은 남겼다가
  //    담당자 단추·결정 뒤 180일 작업이 지운다. 결정된 줄의 번호(종이 명단의 가족 번호 등)로 막지 않게(친구 결정 2026-10-02).
  //    (확인 번호 문이 켜진 분은 phone 이 빈칸일 수 있다 — 그럴 땐 이 검사를 건너뛴다.)
  const kept = mine.filter((r) => MINISTRY_DECIDED.indexOf(r.status) < 0).map((r) => norm(r.phone)).filter(Boolean)[0];
  if (phone && kept && kept !== phone) {
    return { ok: false, error: "휴대폰 번호가 처음 신청하실 때와 다릅니다" };
  }
  const position = norm(b.position);
  if (!MIN_POSITIONS.has(position)) {
    return { ok: false, error: "직분을 골라 주세요" };
  }

  const me = await ministryWho(userId);   // 없으면(옛 기기 등) 앱이 보낸 값으로 채운다
  const name = (me && me.name) || norm(b.name) || null;
  const who = (me && me.who) || norm(b.who) || null;
  const opts: Record<string, string> = (b.options ?? {}) as any;
  const byId = new Map(found.map((t) => [t.id, t]));
  const now = new Date().toISOString();

  // ⚠️ 지우고 다시 넣지 않는다. 넣기가 실패하면 성도가 낸 것이 통째로 사라진 채
  //    화면만 남는다(2026-09-09 감사). **그대로 둘 것 · 새로 넣을 것 · 뺄 것**로 가른다.
  const wantSet = new Set(want.map((n: number) => Number(n)));
  const haveTeam = new Set(openRows.map((r) => Number(r.team_id)));
  const toAdd = want.filter((id: number) => !haveTeam.has(Number(id)));
  const toDrop = openRows.filter((r) => !wantSet.has(Number(r.team_id)));
  const toKeep = openRows.filter((r) => wantSet.has(Number(r.team_id)));

  // **같은 이름·같은 휴대폰 번호**로 다른 계정이 낸 신청이 있으면 한 번 묻는다(2026-09-17).
  // 로그인은 교구·목장·이름이 다르면 새 계정을 만들어 주므로, 소속을 잘못 넣고 신청했다가 원래
  // 소속으로 다시 신청하면 같은 분의 같은 사역이 두 건 생긴다(실제로 그랬다 — 한 분 네 건).
  // ⚠️ 이름까지 같을 때만 묻는다(리뷰): 번호만 보면 아무나 번호를 넣어 「그 번호로 신청이 있나」를
  //    알아낼 수 있고, 번호를 함께 쓰는 가족에게도 괜히 묻는다. 가족·다른 사람은 담당자 화면이 따로 표시한다.
  // ⚠️ 막지 않고 묻는다. 상대 소속은 알려 주지 않는다.
  // ⚠️ 문구를 `error` 에 넣지 않는다 — 앱의 supaCall 은 error 가 있으면 던져 버려 「그래도 신청」을
  //    못 묻고 막다른 알림이 된다(리뷰에서 발견). `message` 로 보낸다.
  if (toAdd.length && !b.dupOk && name && phone) {
    const { data: same, error: e0 } = await db.from("ministry_orders")
      .select("id").eq("year", cfg.year).eq("phone", phone).eq("name", name).neq("user_id", userId)
      .not("status", "in", '("임명확정","미채택","취소")').limit(1);   // 결정된 줄은 보지 않는다(MINISTRY_DECIDED · 2026-10)
    if (e0) throw e0;
    if ((same ?? []).length) {
      return { ok: false, confirm: "dup-phone",
        message: "같은 이름과 휴대폰 번호로 들어온 사역신청이 이미 있습니다.\n" +
          "다른 교구·목장으로 로그인해 신청하셨을 수 있어요 — 그렇다면 그쪽 신청을 확인해 주세요.\n" +
          "그래도 지금 소속으로 신청할까요?" };
    }
  }

  if (toAdd.length) {
    const rows = toAdd.map((id: number) => {
      const t: any = byId.get(id);
      return {
        year: cfg.year, user_id: userId, name, who, position, phone,
        team_id: id, committee: t.committee, team: t.team,
        option: norm(opts[String(id)]) || "",
        status: "신청완료", updated_at: now,
      };
    });
    const { error: e2 } = await db.from("ministry_orders").insert(rows);
    if (e2) throw e2;                        // 넣기가 먼저다 — 실패해도 낸 것은 남는다
  }
  if (toKeep.length) {                       // 직분·4자리를 새로 낸 값으로 맞춘다
    const { error: e3 } = await db.from("ministry_orders")
      .update({ name, who, position, phone, updated_at: now })
      .in("id", toKeep.map((r) => r.id));
    if (e3) throw e3;
  }
  if (toDrop.length) {
    const { error: e4 } = await db.from("ministry_orders")
      .delete().in("id", toDrop.map((r) => r.id));
    if (e4) throw e4;
  }

  const { data: after } = await db.from("ministry_orders").select("*")
    .eq("year", cfg.year).eq("user_id", userId).order("created_at", { ascending: true });
  return { ok: true, mine: ministryMineView((after ?? []) as any[]), edited: openRows.length > 0 };
}

async function ministryCancel(b: any) {
  const le = await lifeError(b); if (le) return { ok: false, error: le };
  const userId = String(b.user_id || "");
  if (!userId) return { ok: false, error: "user_id 필요" };
  const cfg = await ministryCfg();
  // (위 ministryApply 와 같은 문 — b.preview 는 보지 않는다 · 2026-10-08)
  if (!cfg.isOpen && adminError(b) && !(await ministryIsTester(userId))) return { ok: false, error: "신청 기간이 지나 취소할 수 없습니다" };
  const { data } = await db.from("ministry_orders")
    .select("id,status,phone,team,team_id").eq("year", cfg.year).eq("user_id", userId);
  const mine = (data ?? []) as any[];
  if (!mine.length) return { ok: false, error: "신청을 찾을 수 없습니다" };

  const open = mine.filter((r) => !isLocked(r.status));
  if (!open.length) {
    return { ok: false, error: "담당자 접수가 끝나 취소할 수 없습니다" };
  }
  // 확인 번호 문이 켜진 분은 번호를 받지 않으니(Plan 5) 번호 검사를 건너뛴다 — 본인 확인은 확인 번호가 한다.
  const active = await lifeActive(b);
  const kept = mine.filter((r) => MINISTRY_DECIDED.indexOf(r.status) < 0).map((r) => norm(r.phone)).filter(Boolean)[0];
  if (!active && kept && kept !== pilsaPhone(b.phone)) {
    return { ok: false, error: "휴대폰 번호가 맞지 않습니다" };
  }
  // ⚠️ 잠긴 건은 남는다 — 「취소」는 아직 접수 안 된 것만 무르는 일이다
  const one = Number(b.team_id) || 0;
  const kill = one ? open.filter((r) => Number(r.team_id) === one) : open;
  if (!kill.length) return { ok: false, error: "취소할 신청이 없습니다" };
  const { error } = await db.from("ministry_orders").delete().in("id", kill.map((r) => r.id));
  if (error) throw error;

  const { data: after } = await db.from("ministry_orders").select("*")
    .eq("year", cfg.year).eq("user_id", userId).order("created_at", { ascending: true });
  const rows = (after ?? []) as any[];
  return { ok: true, mine: rows.length ? ministryMineView(rows) : null };
}


// 관리자 명단 — 신청은 많아야 수백 건이라 전부 내려주고 화면에서 추린다

// ── 종이(오프라인) 명단 올리기 ──────────────────────────────────────
// 12월 신청은 앱과 종이가 섞인다. 담당자가 종이로 받은 것을 엑셀에 옮겨 적고, 그 칸을 통째로
// 붙여넣어 한꺼번에 올린다(2026-09-18 성도님 결정).
// ⚠️ **종이는 이미 임명·취소가 정해진 명단이다**(성도님) — 그래서 「신청완료」가 아니라
//    담당자가 고른 상태(기본 임명확정)로 바로 들어간다.
// ⚠️ **알림은 가지 않는다.** 임명 알림은 한 건씩 누를 때만 나간다(ministrySetStatus).
//    수백 건을 올리며 푸시가 한꺼번에 나가면 되돌릴 수 없다.
// ⚠️ **두 걸음이다.** check 가 줄마다 살펴 보여 주고, save 가 넣는다. save 도 **처음부터 다시 살핀다** —
//    그 사이에 성도님이 앱으로 같은 사역을 냈을 수 있고, 화면이 보낸 판정을 믿어선 안 된다.
// ⚠️ 계정은 **로그인과 같은 길**(member_login RPC)로 찾거나 만든다. 그래야 그분이 나중에 앱에
//    로그인하면 「내 신청」에 그대로 보인다. 이름·목장을 한 글자라도 다르게 적으면 딴 사람이 된다.
const PAPER_MAX_ROWS = 300;
const PAPER_STATUS = new Set(["임명확정", "취소", "신청완료", "접수완료"]);
// 줄에 적은 상태 — 「임명」·「임명확정」 둘 다 받는다(엑셀에는 짧게 적으신다)
const PAPER_ALIAS: Record<string, string> = {
  "임명": "임명확정", "임명확정": "임명확정", "확정": "임명확정",
  "취소": "취소", "신청": "신청완료", "신청완료": "신청완료",
  "접수": "접수완료", "접수완료": "접수완료",
};
// 담당자 화면이 쓰는 짧은 이름 — 창과 목록이 「임명」인데 여기만 「임명확정」이면 따로 논다
const paperName = (st: string) =>
  st === "임명확정" ? "임명" : st === "신청완료" ? "신청" : st === "접수완료" ? "접수" : st;

// 종이에 적힌 날짜 한 칸 — 「2026-12-15」·「2026.12.15」·「2026. 12. 15.」 다 받는다.
// ⚠️ 한국 날짜로 읽는다(자정 +09:00) — UTC 로 읽으면 하루가 밀린다.
function paperDay(v: unknown): { v: string | null; err?: string } {
  const t = norm(v);
  if (!t) return { v: null };
  const m = /^(\d{4})[.\-\/\s]+(\d{1,2})[.\-\/\s]+(\d{1,2})\.?$/.exec(t);
  if (!m) return { v: null, err: "날짜는 2026-12-15 꼴로 적어 주세요" };
  const iso = m[1] + "-" + m[2].padStart(2, "0") + "-" + m[3].padStart(2, "0") + "T00:00:00+09:00";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { v: null, err: "날짜를 확인해 주세요 (" + t + ")" };
  return { v: d.toISOString() };
}

function ministryPaperKeys(gu: string, mok: string, name: string): string[] {
  const m = norm(mok);
  const out = new Set<string>();
  for (const one of [m, m.replace(/목장$/, "")]) {
    out.add(identityKey({ type: "교구", gu, mok: one, bu: "", grade: "", name }));
  }
  return [...out];
}

// 줄 하나의 겉모양을 살핀다 — 되돌려주는 말은 화면이 그대로 보여 준다
function ministryPaperOne(raw: any, i: number) {
  const gu = norm(raw && raw.gu), mok = norm(raw && raw.mok), name = norm(raw && raw.name);
  const position = norm(raw && raw.position);
  const phone = pilsaPhone(raw && raw.phone);
  const out: any = {
    i, gu, mok, name, position, phone,
    committee: norm(raw && raw.committee), team: norm(raw && raw.team),
    option: norm(raw && raw.option), ok: false, error: "", warn: "",
  };
  const at = paperDay(raw && raw.appliedAt), dec = paperDay(raw && raw.decidedAt);
  out.appliedAt = at.v; out.decidedAt = dec.v;
  // 줄에 적은 상태·사유가 있으면 그 줄만 그대로 따른다(2026-09-18 성도님 — 한 명단에 임명·취소가 섞인다)
  const stRaw = norm(raw && raw.status);
  out.rowStatus = stRaw ? (PAPER_ALIAS[stRaw] || "") : "";
  out.rowNote = norm(raw && raw.note);
  if (stRaw && !out.rowStatus) out.badStatus = stRaw;
  if (!gu || !mok) out.error = "교구·목장을 적어 주세요";
  else if (!name) out.error = "이름을 적어 주세요";
  else if (!MIN_POSITIONS.has(position)) out.error = "직분이 목록에 없습니다";
  else if (!PILSA_PHONE_RE.test(phone)) out.error = "휴대폰 번호를 확인해 주세요 (010-1234-5678)";
  else if (!out.team) out.error = "사역팀을 적어 주세요";
  else if (at.err) out.error = "신청일 — " + at.err;
  else if (dec.err) out.error = "임명일 — " + dec.err;
  else if (out.badStatus) out.error = "상태는 임명·취소·신청 중에 적어 주세요 (" + out.badStatus + ")";
  return out;
}

async function ministryPaper(b: any, save: boolean) {
  const err = await ministryAdminError(b); if (err) return { ok: false, error: err };
  const cfg = await ministryCfg();
  const year = cfg.year;
  // ⚠️ 상태는 **줄마다** 적는다(2026-09-18 성도님 — 한 명단에 임명과 취소가 섞인다).
  //    비어 있으면 임명이다(종이는 이미 정해진 명단이니까). 취소 사유도 그 줄에 적는다.
  const status = "임명확정";
  const raws = Array.isArray(b.rows) ? b.rows : [];
  if (!raws.length) return { ok: false, error: "올릴 줄이 없습니다" };
  if (raws.length > PAPER_MAX_ROWS) {
    return { ok: false, error: "한 번에 " + PAPER_MAX_ROWS + "줄까지 올릴 수 있습니다 (지금 " + raws.length + "줄)" };
  }

  // 사역팀 — 이름만 적어도 찾게 하되, 같은 이름이 둘이면 위원회를 물어본다
  const { data: cat, error: e1 } = await db.from("ministry_catalog")
    .select("id,committee,team,kind").eq("year", year);
  if (e1) throw e1;
  const flat = (s: string) => norm(s).replace(/\s+/g, "").toLowerCase();
  const byTeam = new Map<string, any[]>();
  const byFull = new Map<string, any>();
  for (const t of ((cat ?? []) as any[])) {
    const k = flat(t.team);
    if (!byTeam.has(k)) byTeam.set(k, []);
    byTeam.get(k)!.push(t);
    byFull.set(flat(t.committee) + "|" + k, t);
  }

  // 올해 신청 전부 — 3개 상한·같은 사역 중복·같은 이름/번호 확인에 쓴다
  const { data: allOrders, error: e2 } = await db.from("ministry_orders")
    .select("id,user_id,name,phone,team_id,status").eq("year", year).limit(5000);
  if (e2) throw e2;
  const orders = (allOrders ?? []) as any[];

  const rows = raws.map((r: any, i: number) => ministryPaperOne(r, i));

  // 줄마다 계정 찾기 — 있으면 잇고, 없으면 save 때 만든다
  const keyOf = new Map<number, string[]>();
  const allKeys: string[] = [];
  for (const r of rows) {
    if (r.error) continue;
    const ks = ministryPaperKeys(r.gu, r.mok, r.name);
    keyOf.set(r.i, ks);
    allKeys.push(...ks);
  }
  const found = allKeys.length
    ? await ministryKeysToUsers([...new Set(allKeys)]) : new Map<string, string>();

  // 이 뭉치 안에서 같은 사람이 여러 줄이면 그 수도 상한에 더한다
  const addedBy = new Map<string, number>();
  const heldOf = (uid: string) =>
    orders.filter((o) => o.user_id === uid && countsToCap(o.status)).length;

  for (const r of rows) {
    if (r.error) continue;
    const tk = flat(r.team);
    const cand = r.committee
      ? [byFull.get(flat(r.committee) + "|" + tk)].filter(Boolean)
      : (byTeam.get(tk) ?? []);
    if (!cand.length) { r.error = "사역 목록에 없는 이름입니다"; continue; }
    if (cand.length > 1) {
      r.error = "같은 이름의 사역이 " + cand.length + "개입니다 — 위원회도 적어 주세요 (" +
        cand.map((t: any) => t.committee).join(", ") + ")";
      continue;
    }
    const t = cand[0];
    const st = r.rowStatus || status;                 // 줄에 적었으면 그 줄만 그대로
    r.status = st;
    // 취소는 까닭 없이 못 한다 — 그 줄에 사유가 있어야 한다(한 건씩 바꿀 때와 같은 규칙)
    if (st === "취소" && !r.rowNote) {
      r.error = "취소 사유를 적어 주세요 (사유 칸)";
      continue;
    }
    if (t.kind === "appoint" && st !== "임명확정") {
      r.error = "지명으로 정해지는 자리입니다";
      continue;
    }
    r.team_id = t.id; r.committee = t.committee; r.team = t.team;

    const uid = (keyOf.get(r.i) ?? []).map((k) => found.get(k)).find(Boolean) || "";
    r.user_id = uid;
    r.isNew = !uid;

    if (uid) {
      // ⚠️ 앱으로 낸 것과 겹치면 **새로 넣지 않고 그 건의 상태만** 바꾼다(2026-09-18 성도님).
      //    종이는 결정 난 명단이라, 같은 사역이 두 건이 되는 것이 아니라 그 신청이 임명된 것이다.
      const had = orders.find((o) => o.user_id === uid && Number(o.team_id) === Number(t.id));
      if (had) {
        r.dupId = had.id;
        r.same = had.status === st;
        r.warn = r.same
          ? "이미 " + paperName(st) + " 상태입니다 — 그대로 둡니다"
          : "앱으로 낸 신청(" + paperName(had.status) + ")이 있습니다 — 그 건을 " +
            paperName(st) + "으로 바꿉니다";
        r.ok = true;
        continue;
      }
      if (countsToCap(st)) {
        const held = heldOf(uid) + (addedBy.get(uid) ?? 0);
        if (held + 1 > MINISTRY_MAX) {
          r.error = "이미 " + held + "건이라 " + MINISTRY_MAX + "개를 넘습니다"; continue;
        }
        addedBy.set(uid, (addedBy.get(uid) ?? 0) + 1);
      }
    }

    // 막지 않고 알리기만 하는 것들
    const warns: string[] = [];
    if (r.isNew) warns.push("앱에 없는 분 — 계정을 새로 만듭니다");
    if (orders.some((o) => o.name === r.name && o.phone === r.phone && o.user_id !== uid)) {
      warns.push("같은 이름·번호로 낸 다른 신청이 있습니다");
    }
    r.warn = warns.join(" · ");
    r.ok = true;
  }

  const good = rows.filter((r: any) => r.ok);
  if (!save) {
    return { ok: true, year, rows, okCount: good.length, badCount: rows.length - good.length };
  }

  // ── 넣기 ──────────────────────────────────────────────────────
  // ⚠️ 한 줄이 실패해도 나머지는 들어간다 — 담당자가 고친 줄만 다시 올리면 된다.
  // ⚠️ 결정이 난 상태(임명확정·취소)면 한 건씩 바꿀 때와 같이 **휴대폰 번호를 지우고**
  //    decided_at 을 찍는다. 규칙이 들어온 길에 따라 달라지면 안 된다.
  const now = new Date().toISOString();
  let added = 0;
  for (const r of good) {
    try {
      const st = r.status || status;
      const decided = st === "임명확정" || st === "취소";
      const why = r.rowNote || "";
      if (r.same) { r.saved = true; continue; }          // 이미 그 상태다 — 건드리지 않는다
      if (r.dupId) {                                      // 앱 신청이 있다 — 상태만 바꾼다
        // ⚠️ 신청일은 **앱에 남은 그대로 둔다** — 성도님이 실제로 낸 날이다. 임명일만 종이 것으로.
        const patch: Record<string, unknown> = { status: st, updated_at: now };
        if (decided) { patch.decided_at = r.decidedAt || now; patch.phone = null; }
        if (why) patch.note = why;
        const { error: e5 } = await db.from("ministry_orders").update(patch).eq("id", r.dupId);
        if (e5) throw e5;
        r.saved = true; r.changed = true; added++;
        continue;
      }
      let uid = r.user_id;
      if (!uid) {
        const mok = r.mok.replace(/목장$/, "");
        const profile = { type: "교구", gu: r.gu, mok, bu: null, grade: null, name: r.name };
        const { data: u, error: e3 } = await db.rpc("member_login", {
          p_profile: { ...profile, identity_key: identityKey({ type: "교구", gu: r.gu, mok, bu: "", grade: "", name: r.name }) } });
        if (e3) throw e3;
        uid = u.id;
      }
      // 종이에 적힌 날짜가 있으면 그것을 쓴다 — 없으면 지금(2026-09-18 성도님)
      const insert: Record<string, unknown> = {
        year, user_id: uid, name: r.name,
        who: r.gu + " " + r.mok.replace(/목장$/, "") + "목장",
        position: r.position, phone: decided ? null : r.phone,
        team_id: r.team_id, committee: r.committee, team: r.team, option: r.option || "",
        status: st, source: "paper", note: why || null,
        decided_at: decided ? (r.decidedAt || now) : null, updated_at: now,
      };
      if (r.appliedAt) insert.created_at = r.appliedAt;
      const { error: e4 } = await db.from("ministry_orders").insert(insert);
      if (e4) throw e4;
      r.saved = true; added++;
    } catch (ex) {
      r.ok = false; r.saved = false;
      r.error = "넣지 못했습니다: " + String((ex as any)?.message ?? ex).slice(0, 120);
    }
  }
  return { ok: true, year, rows, added,
           changed: good.filter((r: any) => r.changed).length,
           same: good.filter((r: any) => r.same).length,
           failed: good.filter((r: any) => !r.saved).length,
           badCount: rows.length - good.length };
}

async function ministryList(b: any) {
  const err = await ministryAdminError(b); if (err) return { ok: false, error: err };
  const cfg = await ministryCfg();
  const year = Number(b.year) || cfg.year;
  const { data, error } = await db.from("ministry_orders")
    .select("*").eq("year", year).order("created_at", { ascending: false }).limit(2000);
  if (error) throw error;
  const rows = (data ?? []) as any[];

  // 이름·소속은 신청 당시 스냅샷을 쓰되, 비어 있으면 users에서 채운다
  const need = [...new Set(rows.filter((r) => !r.name).map((r) => r.user_id))];
  const umap = new Map<string, any>();
  if (need.length) {
    const { data: users } = await db.from("users")
      .select("id,type,gu,mok,bu,grade,name").in("id", need);
    for (const u of (users ?? []) as any[]) umap.set(u.id, u);
  }
  // ⚠️ 알림을 켜 두지 않은 분은 푸시가 안 간다 — 담당자가 게시·연락으로 메워야 하므로
  //    화면이 그 사실을 알 수 있게 함께 내려준다(필사 신청에서 배운 것).
  const hasPush = new Set<string>();
  if (rows.length) {
    const { data: subs } = await db.from("push_subscriptions")
      .select("user_id").in("user_id", rows.map((r) => r.user_id));
    for (const s of ((subs ?? []) as any[])) hasPush.add(s.user_id);
  }

  const list = rows.map((r) => {
    const u = umap.get(r.user_id);
    let who = r.who ?? "";
    if (!who && u) {
      who = (u.type === "교구" ? [u.gu, u.mok ? u.mok + "목장" : ""] : [u.bu, u.grade])
        .filter(Boolean).join(" ");
    }
    return {
      ...ministryRow(r),
      name: r.name || (u ? u.name : "") || "",
      who,
      note: r.note ?? "",         // ⚠️ 관리자 전용 — 성도 응답에는 없다
      notified_at: r.notified_at,
      canPush: hasPush.has(r.user_id),
      phone: r.phone ?? "",       // 교적 대조·연락용 — 결정이 나면 서버가 지운다
      source: r.source ?? "app",  // app 앱 신청 · paper 담당자가 올린 종이 명단
    };
  });

  // 팀별 신청 수 — 담당자가 가장 먼저 궁금해하는 숫자
  // ⚠️ 한 행 = 한 팀 이 되었으므로 행을 그대로 센다(옛 choices 칸은 지워졌다)
  const counts: Record<string, number> = {};
  for (const r of rows) {
    const k = (r.committee ?? "") + " · " + (r.team ?? "");
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return { ok: true, year, list, counts };
}

// 관리자 상태 변경 — '임명확정'으로 바뀌면 앱 푸시를 한 번 보낸다
// 신청 한 건을 **아주 지운다**(2026-09-26 성도님) — 「완전히 잘못 들어온 것은 남기지 않는다」.
// ⚠️ 되돌릴 수 없다. 상태 「취소」와 다르다 — 취소는 자취가 남고(사유·decided_at) 성도님 화면에도
//    「부서 요청으로 취소되었어요」로 보인다. 지우면 성도님 화면에서도 그 줄이 통째로 사라지고,
//    3개 상한의 자리도 도로 비어 다시 신청할 수 있게 된다.
// ⚠️ 화면(mnDialog)이 한 번 더 묻지만, **서버도 자기 자리에서 막는다** — 담당자 암호가 없으면 안 된다.
async function ministryDelete(b: any) {
  const err = await ministryAdminError(b); if (err) return { ok: false, error: err };
  const id = Number(b.id) || 0;
  if (!id) return { ok: false, error: "id 확인" };
  const { data: row, error: e0 } = await db.from("ministry_orders")
    .select("id,year,name,who,committee,team,status").eq("id", id).maybeSingle();
  if (e0) throw e0;
  if (!row) return { ok: false, error: "신청을 찾을 수 없습니다 (이미 지워졌을 수 있어요)" };
  const { error } = await db.from("ministry_orders").delete().eq("id", id);
  if (error) throw error;
  // 무엇을 지웠는지 돌려준다 — 화면이 「○○님의 △△ 신청을 지웠습니다」로 알릴 수 있게.
  // ⚠️ user_id 는 싣지 않는다(공개 API 규칙).
  return { ok: true, deleted: { id: row.id, name: row.name ?? "", who: row.who ?? "",
                                committee: row.committee ?? "", team: row.team ?? "", status: row.status } };
}

async function ministrySetStatus(b: any) {
  const err = await ministryAdminError(b); if (err) return { ok: false, error: err };
  const id = Number(b.id) || 0;
  const status = norm(b.status);
  if (!id || MINISTRY_STATUS.indexOf(status) < 0) return { ok: false, error: "id/status 확인" };
  const { data: row } = await db.from("ministry_orders").select("*").eq("id", id).maybeSingle();
  if (!row) return { ok: false, error: "신청을 찾을 수 없습니다" };

  const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  // ⚠️ 결정이 나면 휴대폰 뒷 4자리를 지운다 — 고치기 확인도, 교적 대조도 끝난 자리다.
  //    사람이 기억해서 지우는 약속은 언젠가 지켜지지 않으니, 상태를 바꾸는 그 자리에서 지운다
  //    (필사 신청이 배부완료에서 번호를 지우는 것과 같은 규칙).
  if (status === "임명확정" || status === "미채택" || status === "취소") {
    patch.decided_at = new Date().toISOString();
    patch.phone = null;
  }
  // ⚠️ 취소는 **사유 없이 못 한다.** 부서장 요청을 오프라인으로 받아 처리하는 일이라,
  //    적어 두지 않으면 나중에 「왜 취소됐지」를 아무도 모른다(성도님 결정 2026-09-10).
  if (status === "취소" && !norm(b.note)) {
    return { ok: false, error: "취소 사유를 적어 주세요 (관리자만 봅니다)" };
  }
  // 임명확정에서 물러나면 그 행의 「알림 보냈음」도 지운다(이미 나간 알림을 무를 수는 없다)
  if (row.status === "임명확정" && status !== "임명확정") patch.notified_at = null;
  if (typeof b.note === "string") patch.note = norm(b.note);

  let pushed = 0;
  let pushError: string | null = null;
  let already = false;
  // ⚠️ 확정 알림은 **한 사람에게 한 해에 한 번**이다. 한 행이 한 팀이 되면서
  //    세 건을 확정하면 푸시가 세 번 갔다(2026-09-09 감사). 그 사람의 다른 건이
  //    이미 보냈는지를 본다 — 행 하나만 보면 못 막는다.
  if (status === "임명확정") {
    // ⚠️ **아직 살아 있는 확정**만 센다. 되돌린 확정의 흔적까지 세면 그 뒤 어떤 팀을
    //    확정해도 알림이 영영 안 간다 — 성도는 틀린 알림만 받고 담당자는 「이미 나갔다」로
    //    읽어 손을 뗀다(2026-09-09 감사).
    const { data: sentRows } = await db.from("ministry_orders")
      .select("id").eq("year", row.year).eq("user_id", row.user_id)
      .eq("status", "임명확정").not("notified_at", "is", null).limit(1);
    if ((sentRows ?? []).length) {
      already = true;                        // 이미 알렸다 — 「안 켜심」과 구분해 돌려준다
    } else {
      const res = await ministryNotify(row);
      pushed = res.sent;
      pushError = res.error;
      if (res.sent > 0) patch.notified_at = new Date().toISOString();
    }
  }
  const { error } = await db.from("ministry_orders").update(patch).eq("id", id);
  if (error) throw error;
  // 결정이 나면 4자리를 지운다 — 화면이 그 사실을 바로 반영하도록 알려 준다
  return { ok: true, status, pushed, pushError, already,
           phoneCleared: patch.phone === null };
}

// 사역 설명은 **꾸밈(HTML)을 허용한다** — 관리자만 넣기 때문이다(성도님 지시, 2026-09-08).
// ⚠️ 다만 아무 태그나 통과시키지는 않는다. 이 글은 성도님 **모두의 화면**에서 렌더되므로,
//    관리자 비번이 한 번 새면 그대로 저장형 XSS 가 된다. 그래서 꾸밈에 쓰는 태그와
//    style 속성만 남기고 나머지는 서버가 지운다(스크립트·이벤트 핸들러·링크·이미지 전부).
//    ⚠️ 저장할 때와 내려줄 때 **양쪽에서** 거른다 — 엑셀 시드로 들어온 값도 거쳐야 한다.
// 직분 — 고른 것만 받는다. 자유 입력이면 「집사님」·「집사 」가 섞여
// 교적 대조가 도로 사람 손일이 된다(그러라고 받는 값이 아니다).
// ⚠️ 사역신청·이벤트 플랫폼이 **함께 쓰는 목록**이다. 여기 값을 늘리면 사역신청의
//    직분 칩에도 그대로 생긴다(app.js:9081 에 같은 목록이 한 벌 더 있다 — 함께 고칠 것).
//    2026-09-10: 옛 썸머 명단에 「사모님」이 있었는데 이 목록에 사모가 없어 이관에서
//    직분을 잃을 뻔했다. 성도님 결정으로 더했다.
const MIN_POSITIONS = new Set(
  ["성도", "집사", "권사", "안수집사", "장로", "전도사", "목사", "사모", "학생"]);

const MIN_TAGS = new Set(["b", "strong", "i", "em", "u", "s", "br", "span", "small", "mark"]);
const MIN_STYLE_OK = /^(color|background-color|font-weight|font-size|text-decoration)$/;

function ministryStyleAttr(attrs: string): string {
  const m = /style\s*=\s*("([^"]*)"|'([^']*)')/i.exec(attrs || "");
  const raw = m ? (m[2] ?? m[3] ?? "") : "";
  const out: string[] = [];
  for (const part of raw.split(";")) {
    const i = part.indexOf(":");
    if (i < 0) continue;
    const k = part.slice(0, i).trim().toLowerCase();
    // ⚠️ 따옴표·백틱·역슬래시를 지운다 — 남기면 style="..." 을 닫고 속성을 새로 연다
    const v = part.slice(i + 1).trim().replace(/["'`\\]/g, "");
    if (!MIN_STYLE_OK.test(k)) continue;
    if (/[<>()]|url|expression|javascript/i.test(v)) continue;   // url(...)·javascript: 차단
    out.push(k + ":" + v.slice(0, 40));
  }
  return out.join(";").slice(0, 160);
}

// 잘린 자리에 열린 채 남은 태그를 닫아 준다 — 안 닫으면 뒤 내용까지 물든다
function ministryCloseTags(html: string): string {
  const stack: string[] = [];
  const re = /<(\/?)([a-z]+)[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const t = m[2];
    if (t === "br") continue;
    if (m[1]) { const i = stack.lastIndexOf(t); if (i >= 0) stack.splice(i, 1); }
    else stack.push(t);
  }
  let out = html;
  for (let i = stack.length - 1; i >= 0; i--) out += "</" + stack[i] + ">";
  return out;
}

// ⚠️ 자르기는 **태그 밖에서만** 한다. 예전엔 그냥 slice 라 <span style="co 처럼
//    속성 한가운데가 잘려, 뒤에 이어 붙는 명단이 통째로 속성값으로 삼켜졌다.
function ministryCut(html: string, max: number): string {
  if (html.length <= max) return html;
  let out = html.slice(0, max);
  const l = out.lastIndexOf("<");
  if (l >= 0 && out.indexOf(">", l) < 0) out = out.slice(0, l);   // 태그 조각은 버린다
  return ministryCloseTags(out);
}

// 자리표 — 입력에서 **먼저 지우므로** 관리자가 이 글자를 쳐 넣어도 섞이지 않는다
const MIN_L = "%%mLT%%";
const MIN_R = "%%mGT%%";

// ⚠️ **걸러 내지 않고 다시 지어 낸다.** 예전엔 허용 밖 태그를 지우는 식이었는데,
//    태그 정규식이 닫는 > 를 요구해서 `<img src=x onerror="…"` 처럼 > 를 뺀 문자열이
//    한 글자도 안 바뀌고 나갔다. 그리고 앱이 '<span…>' + 값 + '</span>' 로 감싸거나
//    명단을 <br> 로 이어 붙이면서 **빠진 > 를 대신 채워** 태그를 완성시켰다
//    (2026-09-09 감사에서 실제 실행으로 확인 — onerror 가 돌았다).
//    이제 허용 태그를 자리표로 옮긴 뒤 **남은 꺾쇠를 전부 글자로** 만든다.
function ministryHtml(raw: unknown, max = 400): string {
  let s = String(raw ?? "").split(MIN_L).join("").split(MIN_R).join("");
  s = s.replace(/<!--[\s\S]*?-->/g, "");

  // ① 허용 태그만 자리표로 옮긴다
  s = s.replace(/<\s*(\/?)\s*([a-zA-Z0-9]+)([^>]*)>/g, (_m, close, tag, attrs) => {
    const t = String(tag).toLowerCase();
    if (!MIN_TAGS.has(t)) return "";          // 허용 밖이면 태그만 지운다(글자는 남는다)
    if (close) return MIN_L + "/" + t + MIN_R;
    if (t === "br") return MIN_L + "br" + MIN_R;
    const st = ministryStyleAttr(String(attrs || ""));
    return MIN_L + t + (st ? ' style="' + st + '"' : "") + MIN_R;
  });

  // ② 남은 꺾쇠는 태그가 아니다 — 글자로 만든다. 여기가 막힌 구멍이다.
  // ⚠️ & 는 건드리지 않는다. 이 함수는 **저장할 때와 읽을 때 두 번** 걸리므로
  //    & 를 &amp; 로 바꾸면 읽을 때마다 겹쳐 쌓인다(&lt; → &amp;lt; → &amp;amp;lt;).
  //    태그를 만드는 것은 꺾쇠뿐이고, 실체 참조로 디코드된 글자는 마크업이 되지 않는다.
  s = s.replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // ③ 자리표를 진짜 꺾쇠로 되돌린다
  s = s.split(MIN_L).join("<").split(MIN_R).join(">");
  return ministryCut(s, max);
}

// 사역팀 세부 정보(시간·하는 일·필요 인원) 고치기 — **관리자만**
// ⚠️ 이 앱은 성도 로그인에 비밀번호가 없다(교구·목장·이름만 맞으면 들어온다).
//    그러니 목록을 고치는 길은 반드시 ADMIN_SECRET 뒤에 둔다 — 아무나 사역 설명을
//    바꿀 수 있으면 화면에 적힌 것을 아무도 믿지 못하게 된다(성도님 지적, 2026-09-08).
// ⚠️ 고칠 수 있는 것은 세 칸뿐이다. 팀 이름·위원회·임명직 여부는 여기서 못 바꾼다 —
//    그건 부서 확인을 거쳐 JSON(시드)으로 들어오는 값이다.
// 주기 네 칸 — 화면·양식·시드가 모두 이 이름을 쓴다(supabase/ministry_when_v2.sql).
// ⚠️ 옛 `freq` text 한 칸은 **DB 에서 지웠다.** 「같은 뜻이 두 곳」이면 조용히 갈라진다.
const MINISTRY_FREQ_KEYS = ["weekly", "biweekly", "monthly", "adhoc"] as const;
const MINISTRY_FREQ_COLS = MINISTRY_FREQ_KEYS.map((k) => "freq_" + k).join(",");
const ministryFreqOf = (r: any) => ({
  weekly: !!r.freq_weekly, biweekly: !!r.freq_biweekly,
  monthly: !!r.freq_monthly, adhoc: !!r.freq_adhoc,
});

// 'H:MM' 도 받아 'HH:MM' 로 맞춘다. 못 알아보면 까닭을 돌려준다 —
// ⚠️ 조용히 null 로 만들면 관리자는 넣었다고 믿는데 화면에서는 「때마다 다름」이 된다.
function ministryTimeIn(v: unknown, label: string): { v: string | null; err?: string } {
  const t = norm(v);
  if (!t) return { v: null };
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return { v: null, err: label + "은(는) 09:00 꼴로 넣어 주세요" };
  const h = Number(m[1]), mi = Number(m[2]);
  if (h > 23 || mi > 59) return { v: null, err: label + "이(가) 00:00~23:59 밖입니다" };
  return { v: String(h).padStart(2, "0") + ":" + String(mi).padStart(2, "0") };
}

async function ministryCatalogSave(b: any) {
  const err = await ministryAdminError(b); if (err) return { ok: false, error: err };
  const id = Number(b.id) || 0;
  if (!id) return { ok: false, error: "id 필요" };
  // ⚠️ **보내온 칸만** 고친다 — 옛 admin 화면을 물고 있는 브라우저가 저장 한 번에 다른 칸을
  //    비우는 일을 막고, 한 칸만 고치는 도구(담당 한 줄 채우기 같은)도 나머지를 안 지운다.
  const patch: Record<string, unknown> = {};
  for (const [key, max] of [["schedule_note", 160], ["desc_note", 400],
                            ["capacity_note", 80], ["members_note", 1200],
                            ["leader_note", 200]] as [string, number][]) {
    if (key in b) patch[key] = ministryHtml((b as any)[key], max);
  }
  // ── 「② 언제」 ────────────────────────────────────────────────
  // ⚠️ **보내온 칸만** 고친다. 늘 넣도록 짜면, 옛 admin 화면을 물고 있는 브라우저가
  //    저장 한 번에 이 칸들을 통째로 비운다(캐시가 남는 것을 막을 길이 없다).
  for (const c of ["day_sun", "day_fri", "day_sat", "day_week",
                   ...MINISTRY_FREQ_KEYS.map((k) => "freq_" + k)]) {
    if (c in b) patch[c] = !!b[c];
  }
  for (const [key, label] of [["time_from", "시작 시각"], ["time_to", "끝 시각"]]) {
    if (!(key in b)) continue;
    const r = ministryTimeIn(b[key], label);
    if (r.err) return { ok: false, error: r.err };
    patch[key] = r.v;
  }
  // ⚠️ **시각은 주일에만** 남긴다(성도님 결정 2026-09-10). 주일을 끄면서 시각을 그대로
  //    두면 DB 제약(ministry_catalog_time_sun_chk)에 걸려 **저장이 통째로 실패**한다 —
  //    관리자에게는 까닭 없는 오류로 보인다. 여기서 미리 비운다.
  // ⚠️ 「보내온 칸만」 규칙 때문에 day_sun 이 이번 요청에 없을 수 있다. 그때는
  //    **DB 에 있는 값**을 봐야 한다 — 안 그러면 시각만 고치는 저장이 매번 지워진다.
  let sunOn: boolean;
  if ("day_sun" in b) {
    sunOn = !!b.day_sun;
  } else {
    const { data: cur } = await db.from("ministry_catalog")
      .select("day_sun").eq("id", id).maybeSingle();
    sunOn = !!(cur && cur.day_sun);
  }
  if (!sunOn) { patch.time_from = null; patch.time_to = null; }
  // ⚠️ 말없이 자르면 관리자가 넣은 이름이 조용히 사라진다 — 잘린 칸을 돌려준다
  // ⚠️ **이번에 보낸 칸만** 견준다 — 안 보낸 칸을 재려다 undefined.length 로 500 이 났다(2026-09-18).
  const cut: string[] = [];
  for (const [key, label] of [["schedule_note", "시간"], ["desc_note", "하는 일"],
                              ["capacity_note", "필요 인원"], ["members_note", "지금 섬기는 분"],
                              ["leader_note", "담당(문의)"]] as [string, string][]) {
    if (!(key in patch)) continue;
    if (ministryHtml((b as any)[key], 99999).length > String(patch[key] ?? "").length) cut.push(label);
  }

  const { data, error } = await db.from("ministry_catalog")
    .update(patch).eq("id", id)
    .select("id,committee,team,schedule_note,desc_note,capacity_note,members_note,leader_note,"
      + "day_sun,day_fri,day_sat,day_week,time_from,time_to," + MINISTRY_FREQ_COLS).single();
  if (error) throw error;
  // 걸러진 뒤의 값을 돌려준다 — 화면이 「내가 친 것」이 아니라 「실제 저장된 것」을 보여야 한다
  return { ok: true, id: data.id, team: data.team,
           sched: data.schedule_note, desc: data.desc_note, capacity: data.capacity_note,
           membersNote: data.members_note, leader: data.leader_note ?? "", truncated: cut,
           // 저장된 값을 그대로 돌려준다 — 화면이 「내가 친 것」이 아니라 「실제」를 보게
           // (주일을 끄면 시각이 비어 돌아온다 — 화면이 그걸 보고 칸을 비운다)
           day: { sun: !!data.day_sun, fri: !!data.day_fri,
                  sat: !!data.day_sat, week: !!data.day_week },
           freq: ministryFreqOf(data),
           from: data.time_from || "", to: data.time_to || "" };
}

// 한 위원회 안에서 보이는 차례를 바꾼다.
// ⚠️ **그 줄들이 이미 갖고 있던 sort_order 값을 모아 다시 나눠 준다.** 0,1,2… 로 새로
//    매기면 그 위원회가 목록 맨 앞으로 통째로 올라가 버린다 — 자리는 그대로 두고
//    누가 어느 자리에 앉는지만 바꾸는 것이다.
// ⚠️ 팀 추가·삭제·이름은 여기서 하지 않는다(성도님 결정 2026-09-10 — 그쪽 원본은
//    부서 확인 엑셀이다). 여기서 만들면 엑셀과 DB 가 갈라지고, 다음 시드에 지워진다.
async function ministryCatalogOrder(b: any) {
  const err = await ministryAdminError(b); if (err) return { ok: false, error: err };
  const ids: number[] = Array.isArray(b.ids) ? b.ids.map(Number).filter((n: number) => n > 0) : [];
  if (!ids.length) return { ok: false, error: "순서를 바꿀 팀이 없습니다" };
  if (new Set(ids).size !== ids.length) return { ok: false, error: "같은 팀이 두 번 들어 있습니다" };

  const { data, error } = await db.from("ministry_catalog")
    .select("id,year,committee,sort_order").in("id", ids);
  if (error) throw error;
  const rows = (data ?? []) as any[];
  if (rows.length !== ids.length) return { ok: false, error: "없는 팀이 섞여 있습니다" };
  if (new Set(rows.map((r) => r.committee + "|" + r.year)).size !== 1) {
    return { ok: false, error: "한 위원회 안에서만 차례를 바꿀 수 있습니다" };
  }
  // ⚠️ 위원회 전체가 와야 한다 — 일부만 보내면 보내지 않은 줄의 자리를 빼앗는다
  const { count } = await db.from("ministry_catalog")
    .select("id", { count: "exact", head: true })
    .eq("year", rows[0].year).eq("committee", rows[0].committee);
  if ((count ?? 0) !== ids.length) {
    return { ok: false, error: "그 위원회의 팀이 " + count + "개인데 " + ids.length + "개만 왔습니다" };
  }

  const slots = rows.map((r) => Number(r.sort_order)).sort((a, b2) => a - b2);
  for (let i = 0; i < ids.length; i++) {
    const { error: e2 } = await db.from("ministry_catalog")
      .update({ sort_order: slots[i] }).eq("id", ids[i]);
    if (e2) throw e2;
  }
  return { ok: true, n: ids.length };
}

// 그 성도의 기기에만 발송. 알림을 켜 두지 않았으면 조용히 0건 —
// ⚠️ 그때는 게시로 알린다. 푸시가 게시를 대신하는 것이 아니라 함께 가는 것이다(2026-09-08 결정).
async function ministryNotify(row: any) {
  const { data: subs } = await db.from("push_subscriptions")
    .select("id,endpoint,p256dh,auth").eq("user_id", row.user_id);
  const list = (subs ?? []) as any[];
  if (!list.length) return { sent: 0, error: "not-subscribed" };
  const who = norm(row.name);
  const teams = norm(row.team);
  const payload = JSON.stringify({
    title: "[고척교회 사역신청]",
    body: (who ? who + " 성도님, " : "성도님, ") +
      row.year + "년도 사역 임명이 확정되었습니다" + (teams ? " (" + teams + ")" : "") +
      ". 자세한 내용은 게시판에서도 확인하실 수 있습니다. 샬롬!",
    url: "https://gocheok.onlybible.kr/",
  });
  return await pushToSubs(list, payload, "ministry", "사역 임명확정");
}

// ---------- 교회 어드민이 부르는 내부 전용(2026-09-28) ----------
// church-admin 함수가 사역신청을 「임명확정」으로 바꾼 뒤 부른다. 알림 코드(한 사람 한 해 한 번 · 발송 · push_log)를
// 두 벌로 만들지 않으려고 여기 둔다 — ministrySetStatus 의 알림 부분과 같은 규칙.
// ⚠️ 성도·담당자 화면이 부르는 길이 아니다: 같은 프로젝트의 서비스 키를 머리(x-internal-key)로 받은 때만 연다.
function sameSecret(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function internalMinistryNotify(req: Request, b: any) {
  if (!sameSecret(req.headers.get("x-internal-key") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "")) {
    return { ok: false, error: "unauthorized" };
  }
  const id = Number(b.id) || 0;
  const { data: row, error } = await db.from("ministry_orders")
    .select("id,year,user_id,name,team,status,notified_at").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!row) return { ok: false, error: "not-found" };
  if (row.status !== "임명확정") return { ok: false, error: "not-appointed" };
  // ⚠️ 아직 살아 있는 확정만 센다(되돌린 확정의 흔적까지 세면 그 뒤 어떤 팀을 확정해도 영영 안 간다)
  const { data: sentRows, error: e2 } = await db.from("ministry_orders")
    .select("id").eq("year", row.year).eq("user_id", row.user_id)
    .eq("status", "임명확정").not("notified_at", "is", null).limit(1);
  if (e2) throw e2;
  if ((sentRows ?? []).length) return { ok: true, pushed: 0, pushError: null, already: true };
  const res = await ministryNotify(row);
  if (res.sent > 0) {
    const { error: e3 } = await db.from("ministry_orders").update({ notified_at: new Date().toISOString() }).eq("id", id);
    if (e3) throw e3;
  }
  return { ok: true, pushed: res.sent, pushError: res.error, already: false };
}

// ============================================================
// 이벤트 플랫폼 (분기 회차) — 2026-09-10
//   설계: docs/superpowers/specs/2026-09-10-event-platform-design.html
//   계획: docs/superpowers/plans/2026-09-10-event-platform.md
//
//   ⚠️ 위쪽 eventEnter/eventStatus/eventBoard/eventEntrants 는 옛 「말씀 이벤트」
//      (퀴즈형, app_config('event') + event_entries)다. 이 블록과 무관하다.
//
//   참여는 앱 로그인으로만 받는다 — user_id 가 신원의 전부이고, 「회차당 한 번」은
//   event_signups 의 unique 제약이 지킨다(서버가 중복을 검사하지 않는다).
//   노출은 설정 키가 아니라 데이터가 결정한다 — 열린 회차가 없으면 목록이 비어 있다.
// ============================================================

const EVT_STATUS = ["draft", "open", "closed", "archived"];
const EVT_KINDS = ["signup", "quiz"];
// 회차 id — URL(?ev=)에 그대로 쓰이므로 좁게 묶는다. js/events.js 와 같은 모양.
const EVT_ID_RE = /^[a-z0-9][a-z0-9-]{1,40}$/;
const EVT_MEMO_MAX = 300;

// ⚠️ 직분 기본값을 사역신청 기록에서도 찾을 것인가 — 「자기 기록을 자기에게 보여주는
//    것」이라 켜 두었다(설계 질문 2). 안 된다고 결정되면 이 한 줄을 false 로.
//    전화번호는 어느 쪽이든 가져오지 않는다 — privacy/ 가 용도를 한정해 적어 두었다.
const EVT_POSITION_FROM_MINISTRY = true;

// KST 오늘(YYYY-MM-DD). ymd(new Date())는 UTC라 자정 무렵 하루가 어긋난다.
const evtToday = () =>
  new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

// 지금 등록을 받는가 — 상태와 날짜를 함께 본다(기간 판정을 서버가 한다)
function evtOpenNow(ev: any, today: string): boolean {
  return ev.status === "open" && today >= ev.opens_on && today <= ev.closes_on;
}

// 시험 회차(2026-10-03 · 설계 §8-2) — needs.testOnly 가 true 면 시험 참여자에게만.
function evtTestOnly(ev: any): boolean { return !!(ev && ev.needs && ev.needs.testOnly === true); }
// 「자동 대상」 회차(2026-10-03 · 설계 §9) — needs.auto 가 true 면 신청 없이, 필요한 주를 채우신 분이
//   곧 선물 대상이다. 신청을 받지 않고(evtOpenFor false · eventSignup/eventDrop 은 성도님 호출에 auto-event)
//   공개 명단도 비운다(eventRosterPublic). 이름은 담당자만 본다(교회 어드민).
// ⚠️ 이 깃발이 없는 회차는 **한 글자도 다르게 돌지 않는다.** 화면(js/events.js evtAuto)과 같은 판정이다.
function evtAuto(ev: any): boolean { return !!(ev && ev.needs && ev.needs.auto === true); }
// 시험 참여자인가 — 실패하면 false(닫는다). 일시 오류로 목록 전체가 죽으면 안 된다.
async function evtIsTester(userId: string): Promise<boolean> {
  if (!userId) return false;
  try { return await ministryIsTester(userId); } catch (_) { return false; }
}
// 신청이 지금 열려 있나(사람별) — 시험 회차는 시험 참여자에게만, status 와 무관하게(draft 도) 날짜 창으로.
function evtOpenFor(ev: any, today: string, isTester: boolean): boolean {
  // 자동 대상 회차는 누구에게도 신청을 열지 않는다(시험 회차여도) — 목록의 canSignup false ·
  //   verb 「조회」라 첫 화면 단추에 「등록」이 안 붙는다(app.js refreshEventOpen 은 고칠 것 없음).
  if (evtAuto(ev)) return false;
  if (evtTestOnly(ev)) return isTester && today >= ev.opens_on && today <= ev.closes_on;
  return evtOpenNow(ev, today);
}
// 목록에 보이나(사람별)
function evtListableFor(ev: any, today: string, isTester: boolean): boolean {
  if (evtTestOnly(ev)) return isTester && ["draft", "open", "closed"].includes(ev.status) && (!ev.list_until || today <= ev.list_until);
  return evtListable(ev, today);
}

// 지금 성도님께 **보여 줄** 회차인가.
// ⚠️ 「등록을 받는가」와 다른 물음이다. 마감된 뒤에도 명단은 계속 보이는 것이 기본이고
//    (옛 썸머 사이트가 마감되면 조회까지 죽어 막다른 화면이 되던 자리),
//    `list_until` 이 있으면 그날까지만 보인다. 비어 있으면 기한이 없다.
// ⚠️ 시험 회차(testOnly)는 여기서 늘 false(2026-10-03) — 누가 status 를 open 으로 바꿔도
//    일반 성도님께 새지 않게 하는 방어다. 시험 참여자 경로는 evtListableFor 를 따로 쓴다.
function evtListable(ev: any, today: string): boolean {
  if (evtTestOnly(ev)) return false;
  if (ev.status !== "open" && ev.status !== "closed") return false;
  const until = norm(ev.list_until);
  return !until || today <= until;
}

// 화면에 쓸 이름 — 짧은 이름이 있으면 그것을, 없으면 원래 이름을.
//   title       "2026 썸머 써 바이블 완서자 등록"  ← 관리자 목록·명단 제목(길어도 된다)
//   short_title "썸머 써 바이블"                 ← 첫 화면 단추(한 줄에 들어가야 한다)
const evtShown = (ev: any) => norm(ev.short_title) || norm(ev.title);

// 성도에게 돌려줄 참가 기록 한 줄 — 화이트리스트.
// ⚠️ 스프레드(...r)를 쓰지 않는다. user_id · ident_key · note · 신원 스냅샷이
//    구조적으로 빠진다(앱은 이미 자기가 누구인지 안다).
function evtRow(r: any) {
  return {
    id: r.id,
    eventId: r.event_id,
    position: r.position ?? "",
    phone: r.phone ?? "",
    memo: r.memo ?? "",
    answers: r.answers ?? {},
    at: r.created_at,
  };
}

// ---------- 자격(도장판) ----------
// ⚠️ mode 를 세지 않는다. 「그날 daily_activity 의 cnt 를 모드 구분 없이 더한 하루 합이
//    perDay 이상인가」로만 본다(2026-10-03 부터 · perDay 없으면 1 = 옛 「행이 있는가」와 같은 뜻) —
//    카드(learn-typing-card·typing-card)가 전체 반복의 65.2% 라, mode 를 열거하면
//    카드로만 하시는 분은 매일 하셔도 도장이 하나도 안 찍힌다.

// 날짜 더하기 — UTC 자정 기준으로만 더한다(시분초를 안 끌고 온다)
const evtDayAdd = (ymd: string, n: number) =>
  new Date(Date.parse(ymd + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);

// needs.eligibility 를 읽어 규칙으로. 모양이 틀리면 null — 「자격 회차가 아니다」다.
function evtRule(ev: any): any | null {
  const e = ((ev?.needs ?? {}) as any).eligibility;
  if (!e || typeof e !== "object") return null;
  const start = norm(e.start);
  const weeks = Number(e.weeks), perWeek = Number(e.perWeek), need = Number(e.need);
  const minNeed = Number(e.minNeed ?? 2);
  const perDay = Number(e.perDay ?? 1);   // 하루 문턱(2026-10-03) — 없으면 1(「하루 한 번이라도」, 기존과 같은 뜻)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return null;
  // ⚠️ 정수를 강제한다. 3.5 같은 값이 들어오면 evtCanReach 의 for 경계가 어긋난다.
  if (![weeks, perWeek, need, minNeed, perDay].every(Number.isInteger)) return null;
  if (!(weeks >= 1 && weeks <= 26)) return null;
  if (!(perWeek >= 1 && perWeek <= 7)) return null;
  if (!(need >= 1 && need <= weeks)) return null;
  if (!(minNeed >= 1 && minNeed <= need)) return null;
  if (!(perDay >= 1 && perDay <= 50)) return null;
  return { start, weeks, perWeek, need, minNeed, perDay };
}

// 지금 어느 국면인가 — 화면이 날짜를 다시 재지 않게 서버가 정한다(verb 와 같은 까닭).
// ⚠️ 측정과 신청은 겹친다(10/27~11/21). 그때는 "signup" 이다 —
//    화면이 달라지는 것은 「단추가 열리느냐」이기 때문이다.
function evtPhase(ev: any, rule: any, today: string): string {
  const measureStart = rule ? rule.start : norm(ev.opens_on);
  if (today < measureStart) return "before";
  if (today < norm(ev.opens_on)) return "measuring";
  if (today <= norm(ev.closes_on)) return "signup";
  return "over";
}

// 이분에게 필요한 주 수 — 이벤트 중 처음 오신 분은 남은 주로 분모를 줄인다.
// ⚠️ firstDay 는 **전 기간**에서 잰다. 이벤트 안에서만 보면 기존 회원이 일부러 늦게
//    시작해 문턱을 낮출 수 있다(먼저 시작한 분이 손해를 본다).
function evtNeedFor(rule: any, firstDay: string | null): number {
  if (!firstDay || firstDay < rule.start) return rule.need;   // 기존에 쓰시던 분
  const wk = Math.floor(
    (Date.parse(firstDay + "T00:00:00Z") - Date.parse(rule.start + "T00:00:00Z")) / 86400000 / 7);
  if (wk < 0 || wk >= rule.weeks) return rule.need;
  const remain = rule.weeks - wk;                              // 그 주부터 남은 주 수
  return Math.min(rule.need, Math.max(rule.minNeed, Math.floor(remain / 2)));
}

// 남은 주를 다 채워도 닿을 수 있나. 못 닿는 분께 「세 주가 되면 열려요」를 계속 띄우면
// 헛수고를 권하는 것이고, 마감 화면에서 처음 알면 그게 「떨어졌다」가 된다.
function evtCanReach(rule: any, weekDays: number[], need: number, today: string): boolean {
  let done = 0, left = 0;
  for (let i = 0; i < rule.weeks; i++) {
    if ((weekDays[i] ?? 0) >= rule.perWeek) done++;
    else if (today <= evtDayAdd(rule.start, i * 7 + 6)) left++;  // 아직 안 끝난 주
  }
  return done + left >= need;
}

// 한 사람의 도장 — 화면(eventStamps)과 판정(eventSignup)이 **같은 함수**를 쓴다.
// 두 벌을 두면 「화면은 열렸는데 서버가 막는다」가 된다.
async function evtStampsFor(userId: string, rule: any, today: string) {
  const { data, error } = await db.rpc("v2_event_weeks", {
    p_start: rule.start, p_weeks: rule.weeks,
    p_per_week: rule.perWeek, p_users: [userId], p_per_day: rule.perDay,
  });
  if (error) throw error;
  const row = ((data ?? []) as any[])[0] ?? null;
  const weekDays: number[] = row?.week_days ?? new Array(rule.weeks).fill(0);
  const firstDay: string | null = row?.first_day ? String(row.first_day).slice(0, 10) : null;
  const weeksDone = Number(row?.weeks_done ?? 0);
  const need = evtNeedFor(rule, firstDay);

  // 날짜별 횟수 — 도장판이 「이 계정으로 채운 날」을 날짜로 보여 준다.
  // v2_mydays 를 그대로 쓴다(앱의 다른 숫자와 같은 잣대를 지키려고).
  const end = evtDayAdd(rule.start, rule.weeks * 7 - 1);
  // ⚠️ 주별 칸(위 v2_event_weeks)과 날짜별 합·todayCount(아래 v2_mydays)는 **따로 두 번** 읽는다 —
  //    그 사이에 활동이 들어오면 todayCount 는 문턱을 넘었는데 weekDays 는 아직이라 첫 화면 알약이
  //    한 칸 적게 보일 수 있다(적게 세는 쪽 · 다음 그리기에 저절로 맞는다). 알고 둔 것이다(검토 2026-10-03).
  // ⚠️ 실패를 조용히 삼키지 않는다. {} 로 두면 「통신이 끊긴 날」과 「정말 안 한 날」이
  //    같아진다 — 이 기능이 지키려는 원칙(「모른다」와 「없다」를 뭉개지 않는다)을 어기는 자리다.
  // ⚠️ challenge_log 폴백(mydaysSlow)을 쓰지 않는다. 집계표를 우회하면 숫자가 조용히 갈린다.
  //    모르면 **모른다고 말한다** — days 가 null 이면 화면은 날짜를 아예 안 그린다.
  //    주차(weekDays·weeksDone)는 위 v2_event_weeks 가 throw 로 지키므로 영향이 없다.
  const { data: md, error: mderr } = await db.rpc("v2_mydays", {
    p_user: userId, p_from: rule.start, p_to: end,
  });
  let days: Record<string, number> | null = null;
  if (!mderr) {
    days = {};
    for (const r of (md ?? []) as any[]) days[String(r.day)] = Number(r.cnt);
  }

  return {
    days, weekDays, weeksDone, need,
    eligible: weeksDone >= need,
    allWeeks: weeksDone >= rule.weeks,
    canStillReach: evtCanReach(rule, weekDays, need, today),
    // 오늘 합 — days 가 null(통신 실패)이면 null(「모른다」와 「0」을 뭉개지 않는다 · 2026-10-03)
    todayCount: days ? (days[today] ?? 0) : null,
  };
}

// 직분 기본값 ① 이 사람의 가장 최근 이벤트 직분(created_at desc 로 받아 온 목록)
function evtPositionHint(mine: any[]): string {
  for (const r of mine) {
    const p = norm(r.position);
    if (p && MIN_POSITIONS.has(p)) return p;
  }
  return "";
}

// 직분 기본값 ② 사역신청 기록. 없거나 목록에 없는 값이면 빈 문자열 —
// ⚠️ 추측해서 채우지 않는다. 틀린 직분이 미리 찍혀 있으면 그대로 내시는 분이 생긴다.
async function evtPositionFromMinistry(userId: string): Promise<string> {
  if (!EVT_POSITION_FROM_MINISTRY) return "";
  try {
    const { data } = await db.from("ministry_orders")
      .select("position,created_at").eq("user_id", userId)
      .order("created_at", { ascending: false }).limit(1);
    const p = norm(((data ?? [])[0] ?? {}).position);
    return MIN_POSITIONS.has(p) ? p : "";
  } catch (_) {
    return "";   // 사역신청 표가 없는 DB 에서도 이벤트가 죽지 않는다
  }
}

// ---------- eventStamps: 이 회차에서 이분의 도장 ----------
// ⚠️ eventOpenList 에 얹지 않는다 — 그건 매 부팅에 불리고 일부러 user_id 를 안 보낸다.
//    응답 모양을 첫 화면 게이트·이벤트 카드·관리자 미리보기 셋이 함께 쓴다.
async function eventStamps(b: any) {
  const userId = String(b.user_id ?? "").trim();
  if (!userId) return { ok: false, error: "no-user" };
  const eventId = norm(b.event_id);
  if (!EVT_ID_RE.test(eventId)) return { ok: false, error: "bad-args" };

  const { data: ev, error } = await db.from("events")
    .select("*").eq("id", eventId).maybeSingle();
  if (error) throw error;
  if (!ev) return { ok: false, error: "not-found" };
  // 시험 회차(2026-10-03) — 시험 참여자가 아니면 「없는 회차」와 같은 답(있다는 것조차 안 새게).
  // 관리자 미리보기(바로 위 주석)는 예외로 둔다.
  if (evtTestOnly(ev) && adminError(b) !== null && !(await evtIsTester(userId))) {
    return { ok: false, error: "not-found" };
  }

  const today = evtToday();
  const rule = evtRule(ev);
  // rule 이 null 이면 「자격 회차가 아니다」 — 화면은 도장판을 아예 안 그린다.
  if (!rule) return { ok: true, rule: null, phase: evtPhase(ev, null, today) };

  const st = await evtStampsFor(userId, rule, today);
  return { ok: true, rule, phase: evtPhase(ev, rule, today), ...st };
}

// ---------- eventOpenList: 보여 줄 회차 + 내가 낸 것 + 직분 기본값 ----------
async function eventOpenList(b: any) {
  const userId = String(b.user_id ?? "").trim();
  const today = evtToday();
  // draft 는 관리자 비번이 맞을 때만 보인다 — b.preview 같은 깃발을 쓰지 않는다.
  // (사역신청이 열어 둔 `|| b.preview` 는 서버가 확인할 수 없는 값이라 복사하지 않는다.)
  // ⚠️ 시험 회차(testOnly)는 draft 인 채로 시험 참여자에게 보여야 해서(2026-10-03), draft 도
  //    항상 받아 온다 — 노출 여부는 아래 evtListableFor 가 사람별로 가른다. testOnly 가 아닌
  //    draft(진짜 autumn-2026)는 evtListableFor 안의 evtListable 이 그대로 막는다.
  const isAdmin = adminError(b) === null;
  const statuses = ["draft", "open", "closed"];

  const { data, error } = await db.from("events").select("*").in("status", statuses);
  if (error) throw error;
  const rows = (data ?? []) as any[];
  // 목록에 시험 회차가 섞여 있고 user_id 가 왔을 때만 테스터 판정을 묻는다 —
  // 매 부팅마다 불리는 액션이라 쿼리를 아낀다(실패하면 evtIsTester 가 false 로 닫는다).
  const isTester = (rows.some(evtTestOnly) && userId) ? await evtIsTester(userId) : false;

  let mine: any[] = [];
  let hint = "";
  if (userId) {
    const { data: ms, error: merr } = await db.from("event_signups")
      .select("*").eq("user_id", userId).order("created_at", { ascending: false });
    if (merr) throw merr;
    mine = (ms ?? []) as any[];
    hint = evtPositionHint(mine) || await evtPositionFromMinistry(userId);
  }
  const mineIds = new Set(mine.map((r) => r.event_id));

  const list = rows
    // ⚠️ 명단 공개 종료일이 지난 회차는 목록에서 아예 뺀다 — 관리자는 예외.
    //    (그래야 첫 화면 단추도 함께 사라진다. 게이트가 이 목록의 길이를 본다.)
    .filter((r) => isAdmin || evtListableFor(r, today, isTester))
    .map((r) => ({
      id: r.id,
      title: r.title,
      shortTitle: r.short_title ?? "",
      shown: evtShown(r),                 // 화면에 쓸 이름(짧은 이름 우선)
      subtitle: r.subtitle ?? "",
      season: r.season ?? "",
      kind: r.kind,
      opensOn: r.opens_on,
      closesOn: r.closes_on,
      listUntil: r.list_until ?? null,
      status: r.status,
      needs: r.needs ?? {},
      copy: r.copy ?? {},
      canSignup: evtOpenFor(r, today, isTester),
      // 단추에 「등록」이라 쓸지 「조회」라 쓸지 — 서버가 정해서 내려준다.
      // 화면마다 따로 판단하면 갈라진다.
      verb: evtOpenFor(r, today, isTester) ? "등록" : "조회",
      mine: mineIds.has(r.id),
      sortOrder: r.sort_order ?? 0,
      testOnly: evtTestOnly(r),   // 화면이 「[시험]」 표시에 쓴다(2026-10-03) — needs.testOnly 와 같은 값
    }));

  // 겹칠 때 무엇이 위로 오는지가 곧 「무엇을 먼저 하세요」다.
  //   ① 등록할 수 있고 아직 안 낸 것 ② 마감 가까운 순 ③ sort_order ④ id
  list.sort((x, y) => {
    const px = (x.canSignup && !x.mine) ? 0 : 1;
    const py = (y.canSignup && !y.mine) ? 0 : 1;
    if (px !== py) return px - py;
    if (x.closesOn !== y.closesOn) return x.closesOn < y.closesOn ? -1 : 1;
    if (x.sortOrder !== y.sortOrder) return x.sortOrder - y.sortOrder;
    return x.id < y.id ? -1 : 1;
  });

  // ⚠️ 「📋 이미 내신 것」에는 **이 목록에 있는 회차의 줄만** 내려보낸다(2026-09-30 · 교회 어드민 개시).
  //    담당자가 지난 회차(준비 중·보관·공개 종료일 지남)에 분을 더하고 계정을 이으면, 목록에 없는 회차라
  //    화면(js/events.js evtSentHtml)이 제목을 못 찾아 회차 ID(「lent-2022 접수」)를 그대로 띄웠고,
  //    「고를 회차가 하나면 바로 열기」(evtMine.length === 0)도 막혔다. 목록 밖 회차의 줄은 그 화면에 쓸 곳이 없다.
  //    직분 힌트(evtPositionHint)는 위에서 모든 줄로 이미 뽑았다 — 서버 안에서만 쓴다.
  const listed = new Set(list.map((x) => x.id));
  return { ok: true, events: list, mine: mine.filter((r) => listed.has(r.event_id)).map(evtRow), positionHint: hint };
}

// ---------- eventSignup: 등록 / 고치기(덮어쓰기) ----------
async function eventSignup(b: any) {
  const userId = String(b.user_id ?? "").trim();
  if (!userId) return { ok: false, error: "no-user" };
  const eventId = norm(b.event_id);
  if (!EVT_ID_RE.test(eventId)) return { ok: false, error: "bad-args" };

  const { data: ev, error: eerr } = await db.from("events")
    .select("*").eq("id", eventId).maybeSingle();
  if (eerr) throw eerr;
  if (!ev) return { ok: false, error: "not-found" };

  const isAdmin = adminError(b) === null;
  const today = evtToday();

  // 시험 회차(2026-10-03) — 시험 참여자가 아니면 「없는 회차」와 같은 답(있다는 것조차 안 새게).
  let isTester = false;
  if (evtTestOnly(ev)) {
    isTester = isAdmin || await evtIsTester(userId);
    if (!isTester) return { ok: false, error: "not-found" };
  }

  // 자동 대상 회차(설계 §9) — 성도님 신청은 받지 않는다(채우시면 그것으로 대상이다).
  // ⚠️ 바로 위 시험 회차 비테스터의 not-found 가 먼저다 — 여기서 먼저 답하면 「있는 회차」가 샌다.
  // ⚠️ 관리자 암호 갈래도 막는다(2026-10-04 · e5 검토) — 자동 대상 회차의 줄은 교회 어드민이 넣는다
  //    (인정 'import' · 명단 확정 'auto'). 세 앱 공용 관리자 암호로 여기를 부르면 그 줄을 source 'app' 으로
  //    덮어쓸 수 있었다. 이 v2 갈래를 쓰는 화면은 없다(교회 어드민은 서비스 키로 직접 쓴다).
  if (evtAuto(ev)) return { ok: false, error: "auto-event" };

  if (!evtOpenFor(ev, today, isTester) && !isAdmin) {
    // 「아직 안 열렸다」·「아직 안 시작했다」·「마감했다」를 뭉개지 않는다.
    // ⚠️ 옛 코드는 status 가 open 이면 아직 시작 전이어도 「마감했어요」라고 답했다.
    // ⚠️ testOnly+테스터는 status 가 draft 라도 날짜 창으로만 본다(evtOpenFor) —
    //    여기서는 status 분기를 건너뛰고 바로 날짜로 not-yet/closed-period 를 가른다.
    if (ev.status !== "open" && !evtTestOnly(ev)) return { ok: false, error: "not-open" };
    return { ok: false, error: today < norm(ev.opens_on) ? "not-yet" : "closed-period" };
  }

  // 이름·소속은 앱이 보낸 값을 믿지 않고 users 에서 가져온다.
  const { data: u, error: uerr } = await db.from("users")
    .select("type,gu,mok,bu,grade,name").eq("id", userId).maybeSingle();
  if (uerr) throw uerr;
  if (!u) return { ok: false, error: "no-user" };

  const needs = (ev.needs ?? {}) as any;
  const isGu = u.type === "교구";

  let position = "";
  if (needs.position) {
    position = norm(b.position);
    // 서버에서 allowlist 로 다시 거른다 — 자유 입력이면 표기가 섞여 교적 대조가
    // 도로 사람 손일이 된다(사역신청과 같은 이유·같은 목록).
    if (!MIN_POSITIONS.has(position)) return { ok: false, error: "bad-position" };
  }
  let phone = "";
  if (needs.phone) {
    phone = pilsaPhone(b.phone);
    if (!PILSA_PHONE_RE.test(phone)) return { ok: false, error: "bad-phone" };
  }
  const memo = needs.memo ? norm(b.memo).slice(0, EVT_MEMO_MAX) : "";
  // 자격 회차 — 서버가 다시 센다. **화면이 잠겨 있어도 이 액션은 열려 있다.**
  // ⚠️ b.answers 를 읽지 않는다. JWT 가 없어 누구나 weeks:[9,9,9,9,9,9] 를 보낼 수 있다.
  const rule = evtRule(ev);
  // ⚠️ needs.eligibility 는 있는데 모양이 틀려 rule 이 null 이면 막는다(2026-10-03) —
  //    안 막으면 바로 아래 else 가 클라이언트 b.answers 를 그대로 저장하는 길로 떨어진다.
  if (needs.eligibility && !rule) return { ok: false, error: "bad-rule" };
  let answers: any;
  if (rule) {
    const st = await evtStampsFor(userId, rule, today);
    if (!st.eligible && !isAdmin) return { ok: false, error: "not-eligible" };
    answers = {
      weeks: st.weekDays,
      weeksDone: st.weeksDone,
      need: st.need,
      rule: {
        start: rule.start, weeks: rule.weeks, perWeek: rule.perWeek, need: rule.need,
        minNeed: rule.minNeed, perDay: rule.perDay,   // 2026-10-03 — 나중에 문턱을 바꿔도 신청 당시 값을 알 수 있게
      },
      computed_at: new Date().toISOString(),
    };
  } else {
    answers = (b.answers && typeof b.answers === "object" && !Array.isArray(b.answers))
      ? b.answers : {};
  }

  const row = {
    event_id: eventId,
    user_id: userId,
    ident_key: identityKey(u),
    who_type: u.type,
    group_name: isGu ? norm(u.gu) : norm(u.bu),
    sub_name: isGu ? norm(u.mok) : norm(u.grade),
    name: norm(u.name),
    position,
    phone,
    memo,
    answers,
    source: "app",
    updated_at: new Date().toISOString(),
  };

  // 두 번째 제출은 실패가 아니라 덮어쓰기다 — 「이벤트당 한 번」은 unique 가 지킨다.
  // ⚠️ onConflict 는 event_signups_uniq(일반 unique)를 추론한다. 부분 인덱스로
  //    두면 여기서 "no unique or exclusion constraint matching" 오류가 난다.
  const { data, error } = await db.from("event_signups")
    .upsert(row, { onConflict: "event_id,user_id" }).select().maybeSingle();
  if (error) throw error;
  return { ok: true, signup: evtRow(data) };
}

// ---------- eventDrop: 취소 = 행 삭제 ----------
async function eventDrop(b: any) {
  const userId = String(b.user_id ?? "").trim();
  const id = Number(b.id);
  if (!userId || !Number.isFinite(id)) return { ok: false, error: "bad-args" };

  // ⚠️ 순번 id 만으로 지우지 않는다 — 짐작 가능하다. 소유자 조건을 함께 건다.
  const { data: row, error: rerr } = await db.from("event_signups")
    .select("id,event_id").eq("id", id).eq("user_id", userId).maybeSingle();
  if (rerr) throw rerr;
  if (!row) return { ok: false, error: "not-found" };

  const { data: ev } = await db.from("events")
    .select("status,opens_on,closes_on,needs").eq("id", row.event_id).maybeSingle();
  // 시험 회차(2026-10-03)는 테스터면 draft 라도 날짜 창으로 취소를 받는다(evtOpenFor).
  const isTester = (ev && evtTestOnly(ev)) ? await evtIsTester(userId) : false;
  // 자동 대상 회차(설계 §9) — 성도님 취소도 받지 않는다(신청이 없으니 취소도 없다 · 담당자가 인정해
  //   넣은 줄을 성도님 쪽에서 지우지 못하게).
  // ⚠️ 시험 회차의 비테스터는 여기를 건너뛰어 바로 아래 closed-period 를 그대로 받는다 — 회차가 없을 때와
  //    같은 답이다(먼저 auto-event 를 주면 「있는 회차」가 샌다).
  // ⚠️ 관리자 암호 갈래도 막는다(2026-10-04 · e5 검토) — 교회 어드민이 넣은 인정·확정 줄을 공용 관리자 암호로
  //    지우지 못하게. 줄을 빼는 것은 교회 어드민(인정 거두고 빼기)에서만 한다.
  if (ev && evtAuto(ev) && (adminError(b) === null || !evtTestOnly(ev) || isTester)) {
    return { ok: false, error: "auto-event" };
  }
  if (!(ev && evtOpenFor(ev, evtToday(), isTester)) && adminError(b) !== null) {
    return { ok: false, error: "closed-period" };
  }

  const { error } = await db.from("event_signups")
    .delete().eq("id", id).eq("user_id", userId);
  if (error) throw error;
  return { ok: true };
}

// ---------- eventRoster: 관리자 명단 (이름·소속·직분·전화번호가 실리는 유일한 자리) ----------
async function eventRoster(b: any) {
  const err = adminError(b);
  if (err) return { ok: false, error: err };

  // ⚠️ 관리자 화면의 편집 폼이 이 응답으로 칸을 채운다 — **고칠 수 있는 칸은 빠짐없이**
  //    돌려줘야 한다. 하나라도 빠지면 그 칸이 빈 채로 그려지고, 저장하는 순간
  //    원래 값이 지워진다(2026-09-10 subtitle·kind·sort_order 가 그럴 뻔했다).
  const { data: evs, error: e1 } = await db.from("events")
    .select("id,title,short_title,subtitle,season,kind,status,opens_on,closes_on,list_until,sort_order,needs")
    .order("closes_on", { ascending: false });
  if (e1) throw e1;

  // 회차 칩에 적을 건수는 **추리기 전 전체 기준**이어야 한다(필사·사역과 같은 규약).
  // ⚠️ 행을 받아서 세지 않는다 — PostgREST 는 한 번에 1,000행까지만 돌려주고
  //    `.limit(20000)` 으로도 그 위로 못 올린다. 표 전체가 1,000행을 넘는 순간 칩 숫자가
  //    **오류 없이 조용히** 줄어든다(2026-09-29 지난 회차 명단 이관으로 1,723행이 되자
  //    실제 244명인 회차가 0으로 보였다). 회차마다 개수만 묻는다(head — 행은 안 받는다).
  const counts: Record<string, number> = {};
  await Promise.all(((evs ?? []) as any[]).map(async (ev) => {
    const { count, error: e2 } = await db.from("event_signups")
      .select("id", { count: "exact", head: true }).eq("event_id", ev.id);
    if (e2) throw e2;
    counts[ev.id] = count ?? 0;
  }));

  const eventId = norm(b.event_id);
  let q = db.from("event_signups").select("*")
    .order("created_at", { ascending: false }).limit(2000);
  if (eventId) q = q.eq("event_id", eventId);
  const { data, error } = await q;
  if (error) throw error;

  // ── 자격 회차면 「지금 다시 센 값」을 함께 내려 준다 ───────────────────
  // ⚠️ 응모 시점 스냅샷(answers)으로 시상하지 않는다 — 일찍 신청한 분의 스냅샷은
  //    그때 값으로 굳어, 그 뒤 더 채워도 안 바뀐다(일찍 신청한 분이 벌을 받는다).
  // ⚠️ answers 원본은 내보내지 않는다. 파생값만.
  const rowsOut = (data ?? []).map((r: any) => ({
    id: r.id, eventId: r.event_id, name: r.name, whoType: r.who_type,
    group: r.group_name, sub: r.sub_name ?? "", position: r.position ?? "",
    phone: r.phone ?? "", memo: r.memo ?? "", note: r.note ?? "",
    source: r.source, at: r.created_at, hasUser: !!r.user_id,
    excused: !!((r.answers ?? {}) as any).excused,
    // 인정한 까닭 — 담당자만 보는 응답이라 실어도 된다. 화면이 「(인정)」 옆에 그대로 보여 준다.
    excuseReason: norm(((r.answers ?? {}) as any).excuseReason),
  })) as any[];

  let missing: any[] = [];
  let missingTotal = 0;
  const pickedEv = eventId ? (evs ?? []).find((e: any) => e.id === eventId) : null;
  const pickedRule = pickedEv ? evtRule(pickedEv) : null;
  if (pickedRule) {
    // ⚠️ **한 번만 부른다.** 예전에는 신청자마다 evtStampsFor 를 await 했는데,
    //    그 함수는 한 사람당 RPC 두 번(v2_event_weeks + v2_mydays)을 만든다 —
    //    신청자 200명이면 **순차 400왕복**이고, 그중 days 는 이 응답에 쓰지도 않는다.
    //    게다가 아래 「안 하신 분」 계산이 이미 전 교인을 한 번에 받아 온다.
    //    그 한 번의 결과로 둘 다 만든다(200명 기준 401왕복 → 2왕복).
    const { data: all, error: allErr } = await db.rpc("v2_event_weeks", {
      p_start: pickedRule.start, p_weeks: pickedRule.weeks,
      p_per_week: pickedRule.perWeek, p_users: null, p_per_day: pickedRule.perDay,
    });
    if (allErr) throw allErr;
    // ⚠️ 창 안에 활동이 없는 사람은 **행이 아예 없다**(0 행이 아니라 부재다).
    //    그래서 못 찾으면 0 주로 친다 — 안 그러면 기록 없는 분이 명단에서 조용히 사라진다.
    const byUser = new Map<string, any>();
    for (const w of ((all ?? []) as any[])) byUser.set(String(w.user_id), w);

    // ⚠️ 오류를 삼키지 않는다(같은 함수의 다른 조회처럼 throw) — 삼키면 rowUser 가 비어
    //    신청하신 분이 전부 「아직 안 하신 분」으로 잡히고 자격 칸도 조용히 빠진다(검토 2026-10-03).
    const { data: srows, error: srErr } = await db.from("event_signups")
      .select("id,user_id").eq("event_id", eventId).limit(2000);
    if (srErr) throw srErr;
    const rowUser = new Map<number, string>();
    for (const sr of ((srows ?? []) as any[])) {
      if (sr.user_id) rowUser.set(sr.id, String(sr.user_id));
    }

    const stampedAt = new Date().toISOString();
    for (const row of rowsOut) {
      const uid = rowUser.get(row.id);
      if (!uid) continue;                       // 이관된 옛 기록(user_id 없음)
      const w = byUser.get(uid) ?? null;
      const weeksDone = Number(w?.weeks_done ?? 0);
      const firstDay = w?.first_day ? String(w.first_day).slice(0, 10) : null;
      const need = evtNeedFor(pickedRule, firstDay);
      row.weeksDone = weeksDone;
      row.perfect = weeksDone >= pickedRule.weeks;
      row.eligible = weeksDone >= need || row.excused;
      row.computedAt = stampedAt;
    }

    // 자격은 되는데 아직 신청 안 하신 분 — 마감 전에 알려 드리려고.
    // ⚠️ 이름·소속만. user_id 를 싣지 않는다.
    // ⚠️ 시험 회차(testOnly)면 만들지 않는다(2026-10-03) — 그 회차는 시험 참여자에게만 보이는데,
    //    전 교인을 대상으로 세면 회차를 볼 수도 없는 분들이 「아직 안 하신 분」으로 잡힌다.
    const signedUp = new Set([...rowUser.values()]);
    const cand = evtTestOnly(pickedEv) ? [] : ((all ?? []) as any[]).filter((w) => {
      if (signedUp.has(String(w.user_id))) return false;
      const fd = w.first_day ? String(w.first_day).slice(0, 10) : null;
      return Number(w.weeks_done) >= evtNeedFor(pickedRule, fd);
    });
    // ⚠️ 300 에서 자른다(.in 의 주소 길이). **자른 사실을 화면이 알아야 한다** —
    //    모르면 담당자가 「이게 전부」로 읽는다. 그래서 총수를 함께 내려 준다.
    missingTotal = cand.length;
    if (cand.length) {
      const { data: us, error: usErr } = await db.from("users")
        .select("id,type,gu,mok,bu,grade,name")
        .in("id", cand.map((w) => String(w.user_id)).slice(0, 300));
      // ⚠️ 삼키지 않는다 — 삼키면 missingTotal 은 N 인데 missing 은 빈 목록이 된다(검토 2026-10-03).
      if (usErr) throw usErr;
      missing = ((us ?? []) as any[]).map((u: any) => ({
        name: norm(u.name),
        whoType: u.type,
        group: u.type === "교구" ? norm(u.gu) : norm(u.bu),
        sub: u.type === "교구" ? norm(u.mok) : norm(u.grade),
      }));
    }
  }

  return {
    ok: true,
    events: (evs ?? []).map((e: any) => ({
      id: e.id, title: e.title, shortTitle: e.short_title ?? "",
      subtitle: e.subtitle ?? "", season: e.season ?? "",
      kind: e.kind, status: e.status, opensOn: e.opens_on, closesOn: e.closes_on,
      listUntil: e.list_until ?? null,
      sortOrder: e.sort_order ?? 0, count: counts[e.id] ?? 0,
      // 지금 성도님께 보이는가 — 관리자가 「왜 안 보이지」를 화면에서 바로 알게.
      listedNow: evtListable(e, evtToday()),
      testOnly: evtTestOnly(e),   // 「시험 참여자만」을 담당자 화면이 알 수 있게(2026-10-03)
    })),
    rows: rowsOut,
    missing,
    missingTotal,
  };
}

// ---------- 교회 어드민으로 옮긴 쓰기 액션 (얼림) ----------
// ⚠️ 이벤트 명단을 고치는 곳은 교회 어드민(admin.onlybible.kr · 「성경필사(암송)」) **한 곳**이다.
//    eventImport 는 돌 때마다 그 회차의 source='import' 줄을 **전부 지우고** 다시 넣는다 —
//    살아 있으면 어드민에서 고친 것·더한 분·줄 id·이어 둔 계정이 한 번에 사라진다.
//    화면 단추만 닫으면 관리자 비밀번호로 API 를 직접 부르는 길이 남아 **서버에서** 막는다. **되살리지 말 것.**
//    자리: 비밀번호 확인 **바로 뒤** — 무엇도 읽거나 쓰기 전에. 비밀번호 없는 호출은 예전처럼 unauthorized 다
//    (tests/event-smoke.sh 5) 기대값 그대로 · 얼림은 5-1 이 비밀번호로 본다).
//    남긴 것: eventRoster(읽기) · eventExcuse(자격 인정 — 가을 말씀 동행용, 다음 단계에서 옮긴다) · 성도님 앱 액션 전부.
//    설계 docs/superpowers/specs/2026-09-29-church-admin-bible-events-design.md §4 · docs/notes/bible-events-admin.md
//    (함수 몸통은 옛 동작 기록으로 남겨 둔다 — 원문은 church-admin docs/port/event-roster-legacy.md)
const EVT_MOVED = new Set(["eventImport", "eventSave", "eventSetNote"]);

// ---------- eventSetNote: 담당자 메모 ----------
// ⚠️ note 는 성도님 응답(evtRow·eventRosterPublic)에 절대 실리지 않는다 — 담당자만 본다.
async function eventSetNote(b: any) {
  const err = adminError(b);
  if (err) return { ok: false, error: err };
  if (EVT_MOVED.has("eventSetNote")) return { ok: false, error: "moved-to-church-admin" };
  const id = Number(b.id);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "bad-args" };
  const note = norm(b.note).slice(0, 500);
  // ⚠️ PostgREST 는 **맞는 행이 없어도 오류를 안 낸다.** 그냥 update 만 하면
  //    없는 id 에도 {ok:true} 가 돌아가, 담당자는 저장된 줄 알지만 아무 일도 안 일어난다.
  //    자매 함수 eventExcuse 와 같은 잣대로 맞춘다 — 없으면 not-found.
  const { data: hit, error } = await db.from("event_signups")
    .update({ note, updated_at: new Date().toISOString() })
    .eq("id", id).select("id").maybeSingle();
  if (error) throw error;
  if (!hit) return { ok: false, error: "not-found" };
  return { ok: true };
}

// ---------- eventExcuse: 사정이 있으셨던 분을 인정 ----------
// 입원·장례·간병처럼 자동 규칙으로 못 잡는 자리. 사유를 반드시 남긴다.
// ⚠️ challenge_log·daily_activity 를 손대지 않는다 — 순위·통계·주간 리포트가 함께 오염된다.
//    event_signups 쪽에만 쓴다.
async function eventExcuse(b: any) {
  const err = adminError(b);
  if (err) return { ok: false, error: err };
  const id = Number(b.id);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "bad-args" };
  const excused = !!b.excused;
  const reason = norm(b.reason).slice(0, 200);
  if (excused && !reason) return { ok: false, error: "no-reason" };

  const { data: cur, error: e1 } = await db.from("event_signups")
    .select("answers").eq("id", id).maybeSingle();
  if (e1) throw e1;
  if (!cur) return { ok: false, error: "not-found" };

  const answers = { ...((cur.answers ?? {}) as any), excused, excuseReason: reason };
  const { error } = await db.from("event_signups")
    .update({ answers, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
  return { ok: true };
}

// ---------- eventSave: 관리자 회차 만들기 / 고치기 ----------
async function eventSave(b: any) {
  const err = adminError(b);
  if (err) return { ok: false, error: err };
  if (EVT_MOVED.has("eventSave")) return { ok: false, error: "moved-to-church-admin" };

  const e = (b.event ?? {}) as any;
  const id = norm(e.id);
  if (!EVT_ID_RE.test(id)) return { ok: false, error: "bad-event-id" };

  // ⚠️ **보낸 칸만 바꾼다.** 예전에는 받은 것으로 통째로 덮어썼는데, 그러면 화면에 없는
  //    칸(needs·copy·kind·sort_order)이 저장할 때마다 기본값으로 되돌아간다 —
  //    「무엇을 받는가」가 조용히 초기화되는 자리였다(2026-09-10 관리자 화면을 만들다 찾았다).
  //    클라이언트가 매번 전부 되돌려 보내게 하는 것은 약속에 기대는 것이라 서버에서 막는다.
  //    비우고 싶으면 빈 문자열을 **명시해서** 보내면 된다.
  const { data: cur } = await db.from("events").select("*").eq("id", id).maybeSingle();
  const has = (k: string) => Object.prototype.hasOwnProperty.call(e, k);

  const title = has("title") ? norm(e.title) : (cur ? cur.title : "");
  if (!title) return { ok: false, error: "no-title" };

  const dateOk = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
  const opens = has("opens_on") ? norm(e.opens_on) : (cur ? String(cur.opens_on) : "");
  const closes = has("closes_on") ? norm(e.closes_on) : (cur ? String(cur.closes_on) : "");
  if (!dateOk(opens) || !dateOk(closes)) return { ok: false, error: "bad-period" };
  if (closes < opens) return { ok: false, error: "period-reversed" };

  const statusIn = norm(e.status);
  const status = has("status") && EVT_STATUS.indexOf(statusIn) >= 0
    ? statusIn : (cur ? cur.status : "draft");
  const kindIn = norm(e.kind);
  const kind = has("kind") && EVT_KINDS.indexOf(kindIn) >= 0
    ? kindIn : (cur ? cur.kind : "signup");
  const objOf = (v: any) => (v && typeof v === "object" && !Array.isArray(v)) ? v : {};

  // 명단 공개 종료일 — 비우면 기한 없음(null). 값이 있으면 날짜 꼴이어야 하고,
  // 등록 마감일보다 앞설 수 없다(마감 전에 명단이 사라지면 앞뒤가 안 맞는다).
  let listUntil: string | null = cur ? (cur.list_until ?? null) : null;
  if (has("list_until")) {
    const v = norm(e.list_until);
    if (!v) listUntil = null;
    else if (!dateOk(v)) return { ok: false, error: "bad-list-until" };
    else if (v < closes) return { ok: false, error: "list-until-before-close" };
    else listUntil = v;
  }

  const row = {
    id,
    title,
    short_title: has("short_title") ? norm(e.short_title) : (cur ? cur.short_title : ""),
    list_until: listUntil,
    subtitle: has("subtitle") ? norm(e.subtitle) : (cur ? cur.subtitle : ""),
    season: has("season") ? norm(e.season) : (cur ? cur.season : ""),
    kind,
    opens_on: opens,
    closes_on: closes,
    status,
    needs: has("needs") ? objOf(e.needs) : (cur ? cur.needs : {}),
    copy: has("copy") ? objOf(e.copy) : (cur ? cur.copy : {}),
    sort_order: has("sort_order") ? (Number(e.sort_order) || 0) : (cur ? cur.sort_order : 0),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await db.from("events")
    .upsert(row, { onConflict: "id" }).select().maybeSingle();
  if (error) throw error;
  return { ok: true, event: data };
}

// ---------- eventRosterPublic: 성도님께 보이는 명단 ----------
//   회차 하나의 참여자를 소속으로 묶어 돌려준다. 화면 규격은 성도님이 직접 그려 주셨다:
//       화평
//        - 김세웅-20
//   ⚠️ **내보낼 칸을 손으로 못 박는다.** 지금 phone·memo·note 는 비어 있지만 **칸은
//      존재한다.** 나중에 값이 들어갔을 때 `select("*")` 를 펼치는 코드가 있으면 그날로
//      새어 나간다 — 게시판이 정확히 그렇게 user_id 를 흘렸다. 여기서 나가는 것은
//      **이름 · 구분 · 소속 · 세부 · 직분 다섯뿐**이고 id 도 user_id 도 싣지 않는다.
//   ⚠️ 마감된 회차도 보여 준다(status='closed'). 옛 사이트는 마감되면 조회까지 죽었다.
const EVT_GU_ORDER = ["믿음", "소망", "사랑", "섬김", "은혜", "화평", "기쁨", "새가족"];
const EVT_BU_ORDER = ["사랑부", "영아부", "유아부", "유치부", "유년부",
                      "초등부", "중등부", "고등부", "청년부"];

// 목장·구역은 글자다 — 「1」~「39」 사이에 **「남성」** 이 섞여 있다.
// 그냥 글자로 정렬하면 1, 12, 2, 3… 이 되고 「남성」이 숫자 사이에 낀다.
// 숫자는 숫자로, 숫자가 아닌 것은 뒤로 보낸다.
function evtSubRank(v: unknown): [number, number, string] {
  const s = norm(v);
  const n = /^\d+$/.test(s) ? parseInt(s, 10) : NaN;
  return Number.isFinite(n) ? [0, n, s] : [1, 0, s];
}

async function eventRosterPublic(b: any) {
  const eventId = norm(b.event_id);
  if (!EVT_ID_RE.test(eventId)) return { ok: false, error: "bad-args" };
  // 시험 회차 판정에만 쓴다(2026-10-03) — 응답 어디에도 싣지 않는다.
  const userId = String(b.user_id ?? "").trim();

  const { data: ev, error: eerr } = await db.from("events")
    .select("id,title,short_title,subtitle,season,status,opens_on,closes_on,list_until,needs")
    .eq("id", eventId).maybeSingle();
  if (eerr) throw eerr;
  const today = evtToday();
  const isTester = (ev && evtTestOnly(ev)) ? await evtIsTester(userId) : false;
  // draft·archived 는 성도님께 안 보이고, 명단 공개 종료일이 지나도 안 보인다.
  // (관리자는 eventRoster 로 본다 — 그쪽은 이 제한을 받지 않는다.)
  // ⚠️ 시험 회차는 시험 참여자에게만(evtListableFor) — status 와 무관하게.
  if (!ev || !evtListableFor(ev, today, isTester)) {
    return { ok: false, error: "not-found" };
  }

  const evOut = {
    id: ev.id, title: ev.title, shown: evtShown(ev),
    subtitle: ev.subtitle ?? "",
    season: ev.season ?? "", status: ev.status,
    opensOn: ev.opens_on, closesOn: ev.closes_on,
    listUntil: ev.list_until ?? null,
  };
  // 자동 대상 회차(설계 §9) — 공개 명단이 **없다.** 평소 빈 명단과 같은 모양(이름 0줄)으로 돌려준다.
  // ⚠️ event_signups 를 아예 읽지 않는다 — 담당자가 인정해 넣은 분의 이름·소속이 공개 키로 새지 않게.
  // ⚠️ 시험 회차 비테스터의 not-found 는 바로 위에서 먼저 돌려준다.
  if (evtAuto(ev)) return { ok: true, event: evOut, total: 0, groups: [] };

  const { data, error } = await db.from("event_signups")
    .select("who_type,group_name,sub_name,name,position")   // ← 다섯 칸만
    .eq("event_id", eventId).limit(5000);
  if (error) throw error;
  const rows = (data ?? []) as any[];

  const bag = new Map<string, any>();
  for (const r of rows) {
    const isGu = r.who_type === "교구";
    const g = norm(r.group_name);
    const k = (isGu ? "g:" : "s:") + g;
    if (!bag.has(k)) {
      const order = isGu ? EVT_GU_ORDER.indexOf(g) : EVT_BU_ORDER.indexOf(g);
      bag.set(k, {
        type: r.who_type, name: g,
        // 교구를 먼저, 교회학교를 뒤에. 목록에 없는 이름은 그 묶음 맨 뒤로.
        _o: (isGu ? 0 : 1000) + (order < 0 ? 900 : order),
        members: [] as any[],
      });
    }
    bag.get(k).members.push({
      name: norm(r.name), sub: norm(r.sub_name), position: norm(r.position),
    });
  }

  const groups = [...bag.values()].sort((a, b2) => a._o - b2._o).map((g) => {
    g.members.sort((m1: any, m2: any) => {
      const [t1, n1, s1] = evtSubRank(m1.sub);
      const [t2, n2, s2] = evtSubRank(m2.sub);
      if (t1 !== t2) return t1 - t2;
      if (n1 !== n2) return n1 - n2;
      if (s1 !== s2) return s1 < s2 ? -1 : 1;
      return m1.name < m2.name ? -1 : (m1.name > m2.name ? 1 : 0);
    });
    return { type: g.type, name: g.name, count: g.members.length, members: g.members };
  });

  return {
    ok: true,
    event: evOut,
    total: rows.length,
    groups,
  };
}

// ---------- eventImport: 옛 명단 이관 (관리자) ----------
//   ⚠️ 왜 액션인가 — 성도 명단(이름·교구·목장)을 **공개 저장소의 시드 SQL 파일**에
//      넣을 수 없다. 이 저장소는 public 이다. 그래서 시트 → 이 액션 → DB 로 곧장
//      보내고 디스크에도 git 에도 개인정보를 한 줄도 남기지 않는다.
//   ⚠️ 다시 돌려도 안전하다 — 그 회차의 source='import' 행을 먼저 지우고 넣는다.
//      (이관 행은 user_id 가 없어 unique 가 막아 주지 않으므로, 안 지우면 조용히
//       두 배가 된다.)
const EVT_IMPORT_MAX = 5000;

// 옛 시트의 직분 표기를 다듬는다 — '집사님' → '집사' · '안수집사님 (시무/은퇴)' → '안수집사'.
// ⚠️ allowlist(MIN_POSITIONS) 밖이어도 **버리지 않고 그대로 둔다.**
//    옛 썸머 폼에는 「사모님」이 있는데 사역신청 allowlist 에는 사모가 없다. 이관에서
//    그걸 지우면 그분의 직분이 사라진다 — 없는 값을 지어내는 것보다야 낫지만,
//    **있는 값을 버리는 것은 더 나쁘다.** 이관은 「그때 이렇게 냈다」를 남기는 일이다.
//    (앱으로 새로 내는 eventSignup 은 그대로 allowlist 를 강제한다. 그 둘은 다른 일이다.)
//    allowlist 를 넓히는 것은 사역신청과 공유하는 상수라 여기서 혼자 정할 일이 아니다.
function evtImportPosition(v: unknown): string {
  const s = norm(norm(v).replace(/\(.*?\)/g, "")).replace(/님$/, "");
  return s;
}

async function eventImport(b: any) {
  const err = adminError(b);
  if (err) return { ok: false, error: err };
  if (EVT_MOVED.has("eventImport")) return { ok: false, error: "moved-to-church-admin" };

  const eventId = norm(b.event_id);
  if (!EVT_ID_RE.test(eventId)) return { ok: false, error: "bad-event-id" };
  const { data: ev } = await db.from("events").select("id").eq("id", eventId).maybeSingle();
  if (!ev) return { ok: false, error: "not-found" };

  const rows = Array.isArray(b.rows) ? b.rows : null;
  if (!rows) return { ok: false, error: "bad-args" };
  if (rows.length > EVT_IMPORT_MAX) return { ok: false, error: "too-many" };

  // ① 신원으로 접는다 — 옛 시트에는 같은 사람이 여러 줄 있을 수 있다(중복 등록).
  //    가장 이른 것만 남긴다.
  const byKey = new Map<string, any>();
  let dropped = 0;
  for (const r of rows) {
    const whoType = norm(r.type) === "교회학교" ? "교회학교" : "교구";
    const isGu = whoType === "교구";
    const group = norm(r.group);
    const sub = norm(r.sub);
    const name = norm(r.name);
    if (!name || !group) { dropped++; continue; }
    const key = identityKey({
      type: whoType,
      gu: isGu ? group : "", mok: isGu ? sub : "",
      bu: isGu ? "" : group, grade: isGu ? "" : sub,
      name,
    });
    const at = norm(r.regDate);
    const prev = byKey.get(key);
    if (prev && String(prev._at || "") <= at) { dropped++; continue; }
    if (prev) dropped++;
    byKey.set(key, {
      event_id: eventId,
      ident_key: key,
      who_type: whoType,
      group_name: group,
      sub_name: sub,
      name,
      position: evtImportPosition(r.position),
      phone: "",
      memo: "",
      note: norm(r.note),
      source: "import",
      _at: at,
    });
  }

  // ② 앱을 쓰는 분이면 user_id 를 채운다 — 그러면 그분은 지난 회차 등록도 앱에서 본다.
  // ⚠️ `.in("identity_key", [키 수백 개])` 로 하지 않는다. 신원 키는 한글이라 URL 인코딩이
  //    길고, 164개만 넣어도 GET 주소가 한도를 넘어 조회가 통째로 실패한다. 그런데 그 실패는
  //    「이어붙은 사람 0명」으로만 보여 **조용히 지나간다**(2026-09-10 운영 이관에서 실제로
  //    겪었다 — 키는 한 글자도 안 틀렸는데 matched 가 0이었다).
  //    users 는 몇백 행이라 통째로 받아 메모리에서 맞추는 편이 짧고 확실하다.
  const idOf = new Map<string, string>();
  {
    const { data: us, error: uerr } = await db.from("users")
      .select("id,identity_key").limit(20000);
    if (uerr) throw uerr;                       // 삼키지 않는다
    (us ?? []).forEach((u: any) => {
      if (u.identity_key) idOf.set(u.identity_key, u.id);
    });
  }

  // ③ 이미 **앱으로** 낸 분과 부딪히지 않게 — 그 회차에 앱 등록이 있으면 이관 행에는
  //    user_id 를 비워 둔다(unique 충돌로 이관이 통째로 멈추는 것을 막는다).
  // ⚠️ `source='import'` 는 세지 않는다. 그 행들은 아래 ④에서 지워질 것이라 자리를
  //    비켜 줄 참인데, 세어 버리면 **재이관할 때마다 이어붙기가 줄어든다**
  //    (2026-09-10 개발에서 실제로 그랬다 — 두 번째 실행에서 matched 가 하나 사라졌다).
  const { data: existing, error: exerr } = await db.from("event_signups")
    .select("user_id").eq("event_id", eventId)
    .not("user_id", "is", null).neq("source", "import");
  if (exerr) throw exerr;                       // 여기도 삼키지 않는다
  const taken = new Set((existing ?? []).map((r: any) => r.user_id));

  let matched = 0;
  let noDate = 0;
  const out = [...byKey.values()].map((r) => {
    const uid = idOf.get(r.ident_key);
    const useUid = uid && !taken.has(uid) ? uid : null;
    if (useUid) { matched++; taken.add(useUid); }
    const at = r._at;
    delete r._at;
    const row: any = { ...r, user_id: useUid };
    // ⚠️ 옛 시트의 등록일시 형식을 모른다. 날짜로 안 읽히면 created_at 을 아예 빼서
    //    DB 기본값(now())이 들어가게 한다 — 형식 하나 때문에 이관이 통째로 멈추지 않게.
    const t = at ? Date.parse(at.replace(" ", "T")) : NaN;
    if (Number.isFinite(t)) row.created_at = new Date(t).toISOString();
    else if (at) noDate++;
    return row;
  });

  // ④ 다시 돌려도 안전하게 — 그 회차의 이관 행을 먼저 지운다(앱 등록은 건드리지 않는다)
  const { error: derr } = await db.from("event_signups")
    .delete().eq("event_id", eventId).eq("source", "import");
  if (derr) throw derr;

  // ⚠️ PostgREST 묶음 삽입은 **모든 행의 키가 같아야** 한다 — 한 행에만 created_at 이
  //    있으면 나머지는 NULL 이 되어 not-null 위반으로 이관이 통째로 멈춘다.
  //    그래서 「날짜를 읽은 것」과 「못 읽은 것」을 갈라 넣는다. 못 읽은 쪽은 키를
  //    아예 빼서 DB 기본값(now())이 들어가게 둔다 — 없는 날짜를 지어내지 않는다.
  let inserted = 0;
  const withDate = out.filter((r) => r.created_at !== undefined);
  const noDateRows = out.filter((r) => r.created_at === undefined)
    .map(({ created_at: _drop, ...rest }) => rest);
  for (const group of [withDate, noDateRows]) {
    for (let i = 0; i < group.length; i += 500) {
      const chunk = group.slice(i, i + 500);
      const { error: ierr } = await db.from("event_signups").insert(chunk);
      if (ierr) throw ierr;
      inserted += chunk.length;
    }
  }

  // allowlist 밖 직분이 몇이나 되는지 알려 준다 — 버리지는 않되 눈에는 보이게.
  const oddPositions = [...new Set(out.map((r: any) => r.position)
    .filter((p: string) => p && !MIN_POSITIONS.has(p)))];

  return { ok: true, received: rows.length, inserted, matched, dropped, noDate, oddPositions };
}

// ============================================================
// 설교 올리기 — 설교·찬양 담당자(2026-09-21)
//   설계: docs/superpowers/specs/2026-09-21-sermon-staff-upload-design.md 4·6장
//   화면(설교·찬양 관리 → ② 설교 내용 등록)이 sermon_jobs 에 한 줄 넣고 gocheok-sermons 의
//   sermon-job.yml 을 깨운다. 워크플로가 sermonJobGet 으로 자막을 받아 파이프라인을 돌리며
//   sermonJobUpdate 로 단계를 적는다. 유튜브에는 가지 않는다(GitHub 서버에서 자막이 막힌다).
// ============================================================
// ⚠️ 같은 목록이 화면(admin-stats.html SERMON_CATS)에도 있다 — 함께 고칠 것
const SERMON_CATS = ["주일설교", "금요성령집회", "새벽기도회", "송구영신예배", "특별집회", "청년예배"];
const JOB_STATUS = ["queued", "running", "done", "failed"];
const JOB_STEPS = ["dispatch", "prep", "notes", "tts", "link", "versehelp", "save", "embed", "publish", "verify"];
const JOB_COLS = "id,video_id,title,svc_date,category,preacher,status,step,error,run_url,attempt,created_by,created_at,updated_at";
const GH_SERMON_WORKFLOW =
  "https://api.github.com/repos/sewoongkim1/gocheok-sermons/actions/workflows/sermon-job.yml/dispatches";

const toJob = (r: any) => ({
  id: r.id, videoId: r.video_id, title: r.title, date: r.svc_date, category: r.category,
  preacher: r.preacher, status: r.status, step: r.step, error: r.error, runUrl: r.run_url, attempt: r.attempt,
  createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at,
});

// 영상 번호 — ⚠️ 같은 규칙이 세 곳: 여기 · admin-stats.html stVideoId · gocheok-sermons scripts/job-lib.mjs vidOf
function ytIdOf(u: unknown): string {
  const s = String(u ?? "").trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  const m = s.match(/(?:[?&]v=|youtu\.be\/|\/live\/|\/shorts\/|\/embed\/)([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/);
  return m ? m[1] : "";
}

// 「YYYY-MM-DD」이면서 달력에 있는 날 — 2026-02-30·2026-13-01 같은 것은 거른다(DB 가 500 으로 튕긴다)
function isYmd(d: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const t = new Date(d + "T00:00:00Z");
  return !isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d;
}

// 올린 분 「소속 이름」 — 보이기용(user_id 를 싣지 않는다)
function staffLabel(b: any): string {
  if (!adminError(b)) return "관리자";
  const st = b.staff || {};
  const mokNorm = norm(st.mok).normalize("NFC");
  const mok = mokNorm ? mokNorm.replace(/목장$/, "") + "목장" : "";
  return [st.gu, mok, st.bu, st.grade, st.name].map((x: unknown) => norm(x).normalize("NFC")).filter(Boolean).join(" ").slice(0, 60);
}

// 30분 넘게 소식이 없는 작업은 멈춘 것으로 본다 — 그래야 「한 번에 하나만」이 영원히 막지 않는다.
// 워크플로는 단계마다 updated_at 을 새로 적는다(가장 긴 단계도 몇 분).
async function sermonJobsSweep() {
  const cut = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { error } = await db.from("sermon_jobs")
    .update({ status: "failed", error: "30분 넘게 소식이 없어 멈춘 것으로 봤어요", updated_at: new Date().toISOString() })
    .in("status", ["queued", "running"]).lt("updated_at", cut);
  if (error) throw error;
}

async function sermonRecentJobs() {
  const { data, error } = await db.from("sermon_jobs").select(JOB_COLS)
    .order("updated_at", { ascending: false }).limit(5);
  if (error) throw error;
  return (data ?? []).map(toJob);
}

async function sermonJobFail(id: number, step: string, msg: string) {
  const { data, error } = await db.from("sermon_jobs")
    .update({ status: "failed", step, error: String(msg).slice(0, 300), updated_at: new Date().toISOString() })
    .eq("id", id).select(JOB_COLS).maybeSingle();
  if (error) throw error;
  return data ? toJob(data) : null;
}

// attempt — 다시 시도 번호. 워크플로가 모든 기록에 이 번호를 싣고, 서버는 지금 번호와 다르면 「stale」로 거절한다.
async function dispatchSermonJob(id: number, attempt: number): Promise<{ ok: boolean; error?: string }> {
  const token = Deno.env.get("GH_DISPATCH_TOKEN");
  if (!token) return { ok: false, error: "GH_DISPATCH_TOKEN 시크릿 미설정" };
  // 개발 DB 는 가지(feat/sermon-staff)에서 시험한다 — GH_DISPATCH_REF 로 고른다. 운영은 main.
  const ref = Deno.env.get("GH_DISPATCH_REF") || "main";
  const apiBase = `${Deno.env.get("SUPABASE_URL")}/functions/v1/api`;
  try {
    const r = await fetch(GH_SERMON_WORKFLOW, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "gocheok-sermon-admin", "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref, inputs: { job_id: String(id), api_base: apiBase, attempt: String(attempt) } }),
      signal: AbortSignal.timeout(10000),
    });
    if (r.status === 204) return { ok: true };
    return { ok: false, error: `GitHub ${r.status}: ${(await r.text()).slice(0, 200)}` };
  } catch (e) {
    return { ok: false, error: `GitHub 연결 실패: ${String((e as Error)?.message ?? e).slice(0, 150)}` };
  }
}

async function sermonStaffList(b: any) {
  const err = await contentError(b); if (err) return { ok: false, error: err };
  const { data, error } = await db.from("sermons")
    .select("id,title,svc_date,category,preacher,scripture,mem_verse_no,mem_ref,hidden,summary,points,key_verse,audio_script,audio")
    .order("svc_date", { ascending: false });
  if (error) throw error;
  const sermons = (data ?? []).map((r: any) => ({
    id: r.id, title: r.title, date: r.svc_date || "", category: r.category, preacher: r.preacher || "",
    scripture: r.scripture || "", memVerseNo: r.mem_verse_no ?? null, memRef: r.mem_ref || "", hidden: !!r.hidden,
    hasNote: !!(r.summary && (r.points || []).length && r.key_verse), hasScript: !!r.audio_script, audio: r.audio || "",
  }));
  return { ok: true, role: adminError(b) ? "content" : "admin", sermons, jobs: await sermonRecentJobs() };
}

async function sermonJobCreate(b: any) {
  const err = await contentError(b); if (err) return { ok: false, error: err };
  const j = b.job || {};
  const video_id = String(j.videoId || "");
  if (!/^[A-Za-z0-9_-]{11}$/.test(video_id)) return { ok: false, error: "bad-video" };
  const title = norm(j.title).normalize("NFC").slice(0, 200);
  if (!title) return { ok: false, error: "no-title" };
  const svc_date = String(j.date || "");
  if (!isYmd(svc_date)) return { ok: false, error: "bad-date" };
  const category = String(j.category || "").normalize("NFC");
  if (!SERMON_CATS.includes(category)) return { ok: false, error: "bad-category" };
  const preacher = norm(j.preacher).normalize("NFC").slice(0, 60);
  if (!preacher) return { ok: false, error: "no-preacher" };
  const transcript = String(j.transcript || "").normalize("NFC").replace(/\s+/g, " ").trim();
  if (transcript.length < 1000) return { ok: false, error: "short-transcript" };
  if (transcript.length > 200000) return { ok: false, error: "long-transcript" };
  // 이미 있으면 받지 않는다 — 두 번 돌리면 AI 비용만 든다
  const { data: ex, error: e1 } = await db.from("sermons").select("id").eq("id", video_id).maybeSingle();
  if (e1) throw e1;
  if (ex) return { ok: false, error: "exists" };
  await sermonJobsSweep();
  const { data: row, error: e2 } = await db.from("sermon_jobs")
    .insert({ video_id, title, svc_date, category, preacher, transcript, created_by: staffLabel(b) })
    .select(JOB_COLS).single();
  if (e2) {
    if ((e2 as any).code === "23505") return { ok: false, error: "busy" };   // sermon_jobs_one_active
    throw e2;
  }
  const d = await dispatchSermonJob(row.id, row.attempt);
  if (!d.ok) return { ok: false, error: "dispatch", detail: d.error, job: await sermonJobFail(row.id, "dispatch", d.error!) };
  return { ok: true, job: toJob(row) };
}

async function sermonJobs(b: any) {
  const err = await contentError(b); if (err) return { ok: false, error: err };
  await sermonJobsSweep();
  return { ok: true, jobs: await sermonRecentJobs() };
}

async function sermonJobRetry(b: any) {
  const err = await contentError(b); if (err) return { ok: false, error: err };
  const id = Number(b.id);
  if (!Number.isInteger(id)) return { ok: false, error: "invalid" };
  await sermonJobsSweep();
  // ⚠️ 「이미 있음」은 보지 않는다 — 첫 시도가 저장까지 갔다가 멈췄을 수 있다(설계 10장)
  // ⚠️ 다시 시도마다 번호(attempt)를 하나 올린다(2026-09-21 최종 리뷰). run_url 만 비우면, 늦게 도는
  //    옛 실행의 fail 잡이 빈 run_url 을 「내 줄」로 알고 멈춤·텔레그램을 적었고 새 실행은 stale 로 밀려났다.
  //    읽은 번호 그대로일 때만 올린다 — 두 분이 같은 순간 눌러도 한 번만 올라간다.
  const { data: cur, error: e0 } = await db.from("sermon_jobs").select("status,attempt").eq("id", id).maybeSingle();
  if (e0) throw e0;
  if (!cur || cur.status !== "failed") return { ok: false, error: "not-failed" };
  const attempt = Number(cur.attempt) + 1;
  const { data: row, error } = await db.from("sermon_jobs")
    .update({ status: "queued", step: null, error: null, run_url: null, attempt, updated_at: new Date().toISOString() })
    .eq("id", id).eq("status", "failed").eq("attempt", cur.attempt).select(JOB_COLS).maybeSingle();
  if (error) {
    if ((error as any).code === "23505") return { ok: false, error: "busy" };
    throw error;
  }
  if (!row) return { ok: false, error: "not-failed" };
  const d = await dispatchSermonJob(id, row.attempt);
  if (!d.ok) return { ok: false, error: "dispatch", detail: d.error, job: await sermonJobFail(id, "dispatch", d.error!) };
  return { ok: true, job: toJob(row) };
}

async function sermonStaffSave(b: any) {
  const err = await contentError(b); if (err) return { ok: false, error: err };
  const s = b.sermon || {};
  const id = String(s.id || "");
  const title = norm(s.title).normalize("NFC").slice(0, 200);
  if (!id || !title) return { ok: false, error: "invalid" };
  const { data: cur, error: e1 } = await db.from("sermons").select("category").eq("id", id).maybeSingle();
  if (e1) throw e1;
  if (!cur) return { ok: false, error: "not-found" };
  const category = String(s.category || "").normalize("NFC");
  // 목록 밖의 옛 구분은 그대로 두는 것만 허락한다(바꾸면 목록 안에서)
  if (!SERMON_CATS.includes(category) && category !== cur.category) return { ok: false, error: "bad-category" };
  const date = String(s.date || "");
  if (date && !isYmd(date)) return { ok: false, error: "bad-date" };
  // ⚠️ 다섯 칸만 바꾼다 — 옛 saveSermon 은 통째 upsert 라 빠진 칸이 null 이 됐다
  const { error } = await db.from("sermons").update({
    title, svc_date: date || null, category, preacher: norm(s.preacher).normalize("NFC").slice(0, 60) || null,
    hidden: !!s.hidden, updated_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) throw error;
  return { ok: true };
}

async function sermonDelete(b: any) {
  const err = adminError(b); if (err) return { ok: false, error: err };
  const id = String(b.id || "");
  if (!/^[A-Za-z0-9_-]{6,40}$/.test(id)) return { ok: false, error: "invalid" };
  // 챗봇이 지운 설교를 인용하지 않게 색인부터
  const { error: e1 } = await db.from("sermon_chunks").delete().eq("sermon_id", id);
  if (e1) throw e1;
  const { error: e2 } = await db.from("sermons").delete().eq("id", id);
  if (e2) throw e2;
  return { ok: true };
}

// ① 설교/말씀 등록의 담당자 저장 — 한글 칸만. ⚠️ text_en·ref_en 은 건드리지 않는다
//    (관리자 saveVerse 는 행을 통째로 upsert 해서, 빈 칸을 보내면 영어 본문이 지워진다).
async function staffVerseSave(b: any) {
  const err = await contentError(b); if (err) return { ok: false, error: err };
  const v = b.verse || {};
  const no = Number(v.no);
  if (!Number.isInteger(no) || no < 1 || no > 9999) return { ok: false, error: "no-required" };
  // ⚠️ 1001~ 은 쉴만한 물가(시편) 줄이다 — 주간 암송구절 번호(1~999)만 받는다(2026-09-21 최종 리뷰)
  if (no >= 1000) return { ok: false, error: "bad-no" };
  const refShort = norm(v.refShort).normalize("NFC").slice(0, 60);
  const text = String(v.text ?? "").normalize("NFC").trim().slice(0, 2000);
  if (!refShort || !text) return { ok: false, error: "required" };
  let url = String(v.url ?? "").trim();
  if (url) {
    const id = ytIdOf(url);
    if (!id) return { ok: false, error: "bad-url" };
    url = `https://www.youtube.com/watch?v=${id}`;   // 4-link 가 틀림없이 찾는 꼴로
  }
  const refFull = norm(v.refFull).normalize("NFC").slice(0, 120);
  const vdate = v.date == null || v.date === "" ? null : String(v.date);
  // 화면은 「YYYY-MM-DDT00:00:00+09:00」을 보낸다(getVerses 가 되읽는 ISO 시각도 마찬가지) —
  // 앞 10글자가 달력에 있는 날인지 따로 본다. Date.parse 만으로는 "2026-02-30"·"1" 도 통과해 버린다.
  if (vdate && (!isYmd(vdate.slice(0, 10)) || isNaN(Date.parse(vdate)))) return { ok: false, error: "bad-date" };
  const row: any = {
    date: vdate, ref_short: refShort, ref_full: refFull || null, ref: refFull || refShort, text,
    hint: norm(v.hintText).normalize("NFC").slice(0, 300) || null, pastor: norm(v.pastor).normalize("NFC").slice(0, 60) || null,
    sermon_title: norm(v.sermonTitle).normalize("NFC").slice(0, 200) || null, sermon_url: url || null,
    is_active: v.is_active !== false,
  };
  // 있는 줄을 track 과 함께 읽는다 — 주간 구절이 아닌 줄(시편 등)은 이 화면에서 덮어쓰지 않는다.
  // ⚠️ track 칸이 아직 없는 DB 에서도 살아남게(getVerses 와 같은 까닭) — 그 칸이 없다는 오류면 번호만 다시 읽는다.
  let r1: { data: any; error: any } = await db.from("verses").select("no,track").eq("no", no).maybeSingle();
  if (r1.error && (r1.error.code === "42703" || /track/i.test(String(r1.error.message ?? "")))) {
    r1 = await db.from("verses").select("no").eq("no", no).maybeSingle();
  }
  if (r1.error) throw r1.error;
  const ex = r1.data;
  if (ex && ex.track && ex.track !== "weekly") return { ok: false, error: "bad-no" };
  // 「+ 새 말씀 추가」로 저장한 것 — 그 번호가 이미 있으면 덮어쓰지 않는다(번호를 잘못 넣어 남의 주 구절이 바뀌지 않게)
  if (v.isNew === true && ex) return { ok: false, error: "exists" };
  const { error } = ex
    ? await db.from("verses").update(row).eq("no", no)
    : await db.from("verses").insert({ no, week: no, ...row });
  if (error) throw error;
  return { ok: true, url };
}

async function sermonJobGet(b: any) {
  const err = adminError(b); if (err) return { ok: false, error: err };
  const id = Number(b.id);
  if (!Number.isInteger(id)) return { ok: false, error: "invalid" };
  const { data, error } = await db.from("sermon_jobs").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? { ok: true, job: data } : { ok: false, error: "not-found" };
}

async function sermonJobUpdate(b: any) {
  const err = adminError(b); if (err) return { ok: false, error: err };
  const id = Number(b.id);
  if (!Number.isInteger(id)) return { ok: false, error: "invalid" };
  // ⚠️ 끝난 작업(완료·멈춤)과 다른 실행이 맡은 작업에는 적지 않는다 — 30분 스윕으로 멈춤 처리된 뒤에도
  //    옛 GitHub 실행이 살아 있으면, 다시 시도한 새 실행과 같은 줄에 번갈아 적었다(2026-09-21 리뷰).
  //    워크플로는 모든 호출에 자기 run_url 을 싣는다(job-api.mjs) — 「stale」을 받으면 스스로 멈춘다.
  // ⚠️ 다시 시도 번호(attempt)도 본다(2026-09-21 최종 리뷰) — 다시 시도는 run_url 을 비우므로, 번호가 없으면
  //    옛 실행이 빈 run_url 을 제 것으로 알고 새 시도의 줄에 적는다. 번호는 워크플로가 싣는다(job-api.mjs).
  const { data: cur, error: e0 } = await db.from("sermon_jobs").select("status,run_url,attempt").eq("id", id).maybeSingle();
  if (e0) throw e0;
  if (!cur) return { ok: false, error: "not-found" };
  if (b.attempt != null && Number(b.attempt) !== cur.attempt) return { ok: false, error: "stale" };
  const caller = b.run_url == null ? null : String(b.run_url).slice(0, 300);
  if (!["queued", "running"].includes(cur.status) || (cur.run_url && cur.run_url !== caller)) {
    return { ok: false, error: "stale" };
  }
  const patch: any = { updated_at: new Date().toISOString() };
  if (b.status != null) { if (!JOB_STATUS.includes(b.status)) return { ok: false, error: "bad-status" }; patch.status = b.status; }
  if (b.step != null) { if (!JOB_STEPS.includes(b.step)) return { ok: false, error: "bad-step" }; patch.step = b.step; }
  if (b.error !== undefined) patch.error = b.error == null ? null : String(b.error).slice(0, 300);
  if (caller != null) patch.run_url = caller;
  // 비교하며 쓰기(compare-and-set) — 위에서 읽은 그 run_url·번호 그대로일 때만 적는다.
  // 앞서 읽고 여기 쓰는 사이에 다른 실행이 먼저 적었거나 다시 시도가 번호를 올렸으면 0행이 되어 stale.
  let q = db.from("sermon_jobs").update(patch).eq("id", id).in("status", ["queued", "running"]).eq("attempt", cur.attempt);
  q = cur.run_url ? q.eq("run_url", cur.run_url) : q.is("run_url", null);
  const { data, error } = await q.select("id").maybeSingle();
  if (error) throw error;
  return data ? { ok: true } : { ok: false, error: "stale" };
}

// ============================================================
// 말씀 연상 그림 — 설교·찬양 담당자(2026-09-21)
//   설계: docs/superpowers/specs/2026-09-21-verse-image-staff-design.md
//   화면(③ 연상 그림) → 장면(Claude) → 그림(Gemini) → 브라우저가 줄인 것을 저장. 앱은 getVerses 의 images 로 받는다.
//   ⚠️ 쓰지 않은 그림은 어디에도 저장하지 않는다 — 생성 결과는 화면으로만 간다.
// ============================================================
const VIMG_BUCKET = "verse-img";
const VIMG_SLOTS = ["a", "b", "c"];
const VIMG_DAILY = 15;
// 모든 구절을 합쳐 하루 최대 — 새어 나간 암호 하나로 구절마다 15장씩 긁어도 여기서 막힌다(2026-09-21 최종 리뷰)
const VIMG_DAILY_ALL = 60;
const VIMG_MAX_BYTES = 500_000;
const vimgModel = () => Deno.env.get("VERSE_IMG_MODEL") || "gemini-3-pro-image";
const vimgSize = () => Deno.env.get("VERSE_IMG_SIZE") || "1K";
const sceneModel = () => Deno.env.get("SCENE_MODEL") || "claude-sonnet-5";
const vimgUrl = (p: string) => db.storage.from(VIMG_BUCKET).getPublicUrl(p).data.publicUrl;

// ⚠️ 화풍 문구 — img/verse/암송말씀_그림_만들기.md 2장을 **글자 그대로** 옮겼다. 한 글자도 바꾸지 말 것
//    (이미 들어간 116장과 「같은 책의 그림」으로 보여야 한다). 안내서를 고치면 여기도 함께.
const VIMG_STYLE_A = [
  "Soft watercolor painting with delicate ink linework, warm muted earth tones,",
  "cream paper background, generous white space, gentle and reverent mood.",
  "The illustration is painted directly onto the plain cream page with no border,",
  "no frame, no rectangle outline, no card, no drop shadow around the edges —",
  "the subject and background fade softly and irregularly into the bare cream",
  "paper at the edges, never a straight or hard edge, never a boxy or",
  "rounded-rectangle silhouette.",
  "This is a single subject resting in open space, not a page inside another",
  "book, not on a stand or easel — no easel, no book, no sketchbook, no spiral",
  "binding, no book spine, no page curl.",
  "This is a flat digital illustration viewed straight-on, not a photograph of a",
  "physical painting — no photographed paper sheet, no visible paper corners or",
  "torn edges, no tilted or angled page, no tabletop or surface visible beyond",
  "the illustration.",
  "No people, no human figures, no buildings, no text, no lettering,",
  "no letters or writing of any kind, no signature, no watermark, no monogram.",
].join("\n");
const VIMG_STYLE_BC = [
  "Soft gouache and colored pencil illustration, rich saturated warm tones,",
  "visible pencil grain and soft matte texture, slightly more solid and",
  "painterly than watercolor, cream paper background, generous white space,",
  "gentle and reverent mood. The illustration is painted directly onto the",
  "plain cream page with no border, no frame, no rectangle outline, no card,",
  "no drop shadow around the edges — the subject and background fade softly",
  "and irregularly into the bare cream paper at the edges, never a straight",
  "or hard edge, never a boxy or rounded-rectangle silhouette.",
  "This is a single subject resting in open space, not a page inside another",
  "book, not on a stand or easel — no easel, no book, no sketchbook, no spiral",
  "binding, no book spine, no page curl.",
  "This is a flat digital illustration viewed straight-on, not a photograph of a",
  "physical painting — no photographed paper sheet, no visible paper corners or",
  "torn edges, no tilted or angled page, no tabletop or surface visible beyond",
  "the illustration.",
  "No people, no human figures, no buildings, no text, no lettering,",
  "no letters or writing of any kind, no signature, no watermark, no monogram.",
].join("\n");
const VIMG_TAIL: Record<string, string> = {
  a: "", b: " Wide open scene with distant space around it.", c: " Close-up view of the subject filling the frame.",
};
const vimgPrompt = (sceneEn: string, slot: string) =>
  `${sceneEn}${VIMG_TAIL[slot]}\n\n${slot === "a" ? VIMG_STYLE_A : VIMG_STYLE_BC}`;

// 장면을 짓는 규칙 — 안내서 3장(한 가지 · 빛으로 맺기 · 뜻이 아니라 사물 · 사람은 흔적으로)
const VIMG_SCENE_RULES = [
  "당신은 교회 성경 암송 앱의 삽화가입니다. 구절을 읽고 떠오르는 **한 장면**을 짓습니다.",
  "- 한 가지 사물이나 풍경만 담습니다(여러 장면을 섞지 않기).",
  "- 뜻을 그리지 말고 사물을 그립니다(「말씀이 등불」 → 등불).",
  "- 빛으로 분위기를 맺습니다(새벽, 따스한 오후 빛, 달빛 등).",
  "- 사람은 그리지 않습니다. 사람이 나오는 구절은 그 일의 흔적으로 바꿉니다(「손에 든 다림줄」 → 줄에 매달려 멈춘 추와 발치의 주춧돌).",
  "- 글자·책 속 글씨·두루마리 위 글씨, 다른 종교의 상징, 건물은 넣지 않습니다.",
  "예) 시 119:105 → 밤 돌길 위, 몇 걸음 앞만 비추는 작은 등불 / 창 12:2 → 새벽 언덕 위 홀로 가지를 넓게 펼친 올리브나무",
].join("\n");

async function vimgClaude(system: string, content: unknown, schema: unknown, maxTokens = 400, timeoutMs = 60000): Promise<any | null> {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) { console.error("vimgClaude: ANTHROPIC_API_KEY 없음"); return null; }
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({
        // 생각을 켜면 답 길이가 늘 수 있어 자르지 않도록 넉넉히 잡는다
        model: sceneModel(), max_tokens: Math.max(maxTokens, 2000), system,
        output_config: { format: { type: "json_schema", schema } },
        messages: [{ role: "user", content }],
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) { console.error("vimgClaude", res.status, (await res.text()).slice(0, 200)); return null; }
    const d = await res.json();
    if (d.stop_reason && d.stop_reason !== "end_turn") console.error("vimgClaude stop", d.stop_reason);
    try {
      return JSON.parse((d.content ?? []).find((x: any) => x.type === "text")?.text ?? "null");
    } catch { console.error("vimgClaude parse"); return null; }
  } catch (e) { console.error("vimgClaude", (e as Error)?.name, (e as Error)?.message); return null; }
}

// 시편(no>=1000) · track 이 "weekly" 아닌 줄은 비싼 그림 생성 대상이 아니다 —
// staffVerseSave 의 bad-no 와 같은 규칙(2026-09-21 최종 리뷰). is_active 는 요구하지 않는다
// (다음 주 구절을 미리 등록해 두고 그림부터 만들 수 있어야 한다). vimgVerse 를 쓰는 모든 액션에 이대로 걸린다.
async function vimgVerse(no: number) {
  if (no >= 1000) return "bad-no" as const;
  const { data: v, error } = await db.from("verses").select("no,ref_short,ref,text,track").eq("no", no).maybeSingle();
  if (error) throw error;
  if (!v) return null;
  if ((v as any).track && (v as any).track !== "weekly") return "bad-no" as const;
  // 이어진 설교가 있으면 한 줄 요약도 장면의 실마리로(없어도 된다)
  const { data: s } = await db.from("sermons").select("summary")
    .eq("mem_verse_no", no).eq("hidden", false).order("svc_date", { ascending: false }).limit(1).maybeSingle();
  return { no: v.no, ref: v.ref_short || v.ref || "", text: v.text || "", summary: (s as any)?.summary || "" };
}

async function vimgUsedToday(no: number): Promise<number> {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count, error } = await db.from("verse_image_gens").select("id", { count: "exact", head: true })
    .eq("verse_no", no).gte("created_at", since);
  if (error) throw error;
  return count ?? 0;
}

// 구절을 가리지 않고 24시간 전체 — VIMG_DAILY(구절별)와 같은 표를 같은 자리에서 센다
async function vimgUsedAllToday(): Promise<number> {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count, error } = await db.from("verse_image_gens").select("id", { count: "exact", head: true })
    .gte("created_at", since);
  if (error) throw error;
  return count ?? 0;
}

// 파일 앞머리 — 확장자가 아니라 내용으로 본다
function vimgKind(bytes: Uint8Array): "webp" | "jpg" | null {
  const s = (a: number, b: number) => String.fromCharCode(...bytes.slice(a, b));
  if (bytes.length > 12 && s(0, 4) === "RIFF" && s(8, 12) === "WEBP") return "webp";
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  return null;
}
function vimgDecode(raw: unknown): Uint8Array | null {
  try {
    const s = String(raw ?? "");
    const b64 = s.includes(",") ? s.slice(s.indexOf(",") + 1) : s;
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch { return null; }
}

// getVerses 가 부른다 — 숨김 제외, 대표(a)가 있는 구절만, a→b→c
async function vimgPublicMap(): Promise<Map<number, { slot: string; url: string; alt: string }[]>> {
  const { data, error } = await db.from("verse_images").select("verse_no,slot,path,alt").eq("hidden", false);
  if (error) throw error;
  const by = new Map<number, any[]>();
  for (const r of (data ?? []) as any[]) {
    if (!by.has(r.verse_no)) by.set(r.verse_no, []);
    by.get(r.verse_no)!.push({ slot: r.slot, url: vimgUrl(r.path), alt: r.alt });
  }
  const out = new Map<number, { slot: string; url: string; alt: string }[]>();
  for (const [no, list] of by) {
    if (!list.some((x) => x.slot === "a")) continue;
    out.set(no, list.sort((x, y) => VIMG_SLOTS.indexOf(x.slot) - VIMG_SLOTS.indexOf(y.slot)));
  }
  return out;
}

async function verseImgList(b: any) {
  const err = await contentError(b); if (err) return { ok: false, error: err };
  const { data, error } = await db.from("verse_images")
    .select("verse_no,slot,path,alt,hidden,updated_at").order("verse_no", { ascending: false });
  if (error) throw error;
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: g, error: e2 } = await db.from("verse_image_gens").select("verse_no").gte("created_at", since);
  if (e2) throw e2;
  const used: Record<string, number> = {};
  for (const r of (g ?? []) as any[]) used[r.verse_no] = (used[r.verse_no] || 0) + 1;
  // 구절 아래 보일 설교 한 줄 요약 — 최신 예배일부터, 구절마다 요약이 있는 첫 설교(앱 findSermonForVerse 와 같은 규칙)
  // ⚠️ 이 조회가 실패해도 화면은 열려야 한다 — 요약은 거들 뿐, 그림 만들기의 본줄기가 아니다
  const { data: sm, error: e3 } = await db.from("sermons").select("mem_verse_no,summary")
    .not("mem_verse_no", "is", null).eq("hidden", false).order("svc_date", { ascending: false });
  const summaries: Record<string, string> = {};
  if (e3) {
    console.error("verseImgList summaries", e3.message);
  } else {
    for (const r of (sm ?? []) as any[]) {
      if (r.summary && !(r.mem_verse_no in summaries)) summaries[r.mem_verse_no] = r.summary;
    }
  }
  return {
    ok: true, daily: VIMG_DAILY, used, summaries,
    images: (data ?? []).map((r: any) => ({
      verseNo: r.verse_no, slot: r.slot, url: vimgUrl(r.path), alt: r.alt, hidden: !!r.hidden, updatedAt: r.updated_at,
    })),
  };
}

async function verseImgScenes(b: any) {
  const err = await contentError(b); if (err) return { ok: false, error: err };
  const no = Number(b.verseNo);
  if (!Number.isInteger(no) || no < 1) return { ok: false, error: "no-verse" };
  const v = await vimgVerse(no);
  if (v === "bad-no") return { ok: false, error: "bad-no" };
  if (!v) return { ok: false, error: "no-verse" };
  const out = await vimgClaude(VIMG_SCENE_RULES + "\n세 가지 장면을 서로 다른 사물로 짓고, 각각 우리말 한 문장(20~60자)으로 씁니다.",
    `[구절] ${v.ref}\n${v.text}${v.summary ? `\n[그 주 설교 한 줄] ${v.summary}` : ""}`,
    { type: "object", additionalProperties: false, required: ["scenes"],
      properties: { scenes: { type: "array", items: { type: "string" } } } }, 600);
  const scenes = (out?.scenes ?? []).map((x: unknown) => norm(x).normalize("NFC")).filter((x: string) => x.length >= 5 && x.length <= 120).slice(0, 3);
  if (scenes.length < 3) return { ok: false, error: "ai" };
  return { ok: true, scenes };
}

async function verseImgGenerate(b: any) {
  const t0 = Date.now();
  const err = await contentError(b); if (err) return { ok: false, error: err };
  const no = Number(b.verseNo), slot = String(b.slot || "");
  if (!Number.isInteger(no) || no < 1) return { ok: false, error: "no-verse" };
  if (!VIMG_SLOTS.includes(slot)) return { ok: false, error: "bad-slot" };
  const sceneKo = norm(b.sceneKo).normalize("NFC");
  if (sceneKo.length < 2 || sceneKo.length > 300) return { ok: false, error: "bad-scene" };
  const v = await vimgVerse(no);
  if (v === "bad-no") return { ok: false, error: "bad-no" };
  if (!v) return { ok: false, error: "no-verse" };
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) return { ok: false, error: "no-key" };
  const used = await vimgUsedToday(no);
  if (used >= VIMG_DAILY) return { ok: false, error: "limit" };
  const usedAll = await vimgUsedAllToday();
  if (usedAll >= VIMG_DAILY_ALL) return { ok: false, error: "daily-all" };
  // 우리말 장면 → 영어 한 줄. ⚠️ 한 줄·300자로 잘라 넣는다 — 화풍 문구를 흔들 수 없게
  const tr = await vimgClaude(VIMG_SCENE_RULES + "\nTranslate the given Korean scene into ONE English sentence for an illustration prompt. " +
    "Start with 'A single' or 'A quiet' when natural, end with the light (e.g. 'at dawn'). No people, no text. Output only that sentence.",
    `[구절] ${v.ref} ${v.text}\n[장면] ${sceneKo}`,
    { type: "object", additionalProperties: false, required: ["en"], properties: { en: { type: "string" } } }, 200, 20000);
  const sceneEn = String(tr?.en ?? "").replace(/[\r\n"`]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);
  if (sceneEn.length < 10) return { ok: false, error: "ai" };
  let res: Response;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${vimgModel()}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: vimgPrompt(sceneEn, slot) }] }],
        generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "4:3", imageSize: vimgSize() } },
      }),
      // 남은 시간을 나눠 함수 한도 150초 안에서 끊는다(번역에 쓴 시간을 뺀 나머지)
      signal: AbortSignal.timeout(Math.max(20000, Math.min(110000, 140000 - (Date.now() - t0)))),
    });
  } catch { return { ok: false, error: "gen" }; }
  if (!res.ok) {
    // 시간 초과로 신호가 끊기면 본문을 못 읽을 수 있다 — 그래도 gen 으로 답한다
    let t = "";
    try { t = (await res.text()).slice(0, 160); } catch { /* 시간 초과 */ }
    return { ok: false, error: "gen", detail: `Gemini ${res.status}: ${t}` };
  }
  // 본문을 읽는 도중 시간 초과가 나면 500 이 아니라 gen 으로 — no-image 로 잘못 읽히지 않게
  let d: any = null;
  try { d = await res.json(); } catch { return { ok: false, error: "gen" }; }
  const parts = d?.candidates?.[0]?.content?.parts ?? [];
  // 「생각」 조각은 건너뛰고, 그림이 있는 마지막 조각을 쓴다
  const imgParts = parts.filter((p: any) => p.inlineData?.data && p.thought !== true);
  const img = imgParts[imgParts.length - 1]?.inlineData;
  if (!img) return { ok: false, error: "no-image", detail: String(d?.candidates?.[0]?.finishReason ?? d?.promptFeedback?.blockReason ?? "") };
  // 여기까지 왔으면 이미 돈이 든 호출이 끝났다 — 기록만 실패해도 방금 받은 그림은 잃지 않는다(2026-09-21 리뷰)
  const { error: e2 } = await db.from("verse_image_gens").insert({ verse_no: no, slot, created_by: staffLabel(b) });
  if (e2) console.error("verseImgGenerate 기록 실패", e2.message);
  return { ok: true, image: img.data, mime: img.mimeType || "image/png", sceneEn, left: Math.min(VIMG_DAILY - used - 1, VIMG_DAILY_ALL - usedAll - 1) };
}

async function verseImgAlt(b: any) {
  const err = await contentError(b); if (err) return { ok: false, error: err };
  const no = Number(b.verseNo);
  if (!Number.isInteger(no) || no < 1) return { ok: false, error: "no-verse" };
  const v = await vimgVerse(no);
  if (v === "bad-no") return { ok: false, error: "bad-no" };
  if (!v) return { ok: false, error: "no-verse" };
  const mime = String(b.mime || "");
  const raw = String(b.image ?? ""); const data = raw.includes(",") ? raw.slice(raw.indexOf(",") + 1) : raw;
  if (data.length > 668_000) return { ok: false, error: "bad-file" };   // 디코드 전에 크기부터 거른다
  const bytes = vimgDecode(b.image);
  const kind = bytes ? vimgKind(bytes) : null;
  if (!bytes || !kind || (kind === "webp" ? mime !== "image/webp" : mime !== "image/jpeg") || bytes.length > VIMG_MAX_BYTES) return { ok: false, error: "bad-file" };
  const out = await vimgClaude(
    "그림을 보고, 무엇이 보이는지 우리말 한 구절(15~40자)로 적습니다. 화면 낭독기가 읽는 설명입니다. " +
    "「그림」「수채화」 같은 말과 마침표 없이, 보이는 사물·빛·자리만. 보이지 않는 뜻을 보태지 않습니다.",
    [{ type: "image", source: { type: "base64", media_type: mime, data } }, { type: "text", text: "이 그림의 설명 한 구절" }],
    { type: "object", additionalProperties: false, required: ["alt"], properties: { alt: { type: "string" } } }, 200);
  const alt = norm(out?.alt).normalize("NFC").replace(/[.。]$/, "").slice(0, 80);
  if (alt.length < 4) return { ok: false, error: "ai" };
  return { ok: true, alt };
}

async function verseImgSave(b: any) {
  const err = await contentError(b); if (err) return { ok: false, error: err };
  const no = Number(b.verseNo), slot = String(b.slot || "");
  if (!Number.isInteger(no) || no < 1) return { ok: false, error: "no-verse" };
  if (!VIMG_SLOTS.includes(slot)) return { ok: false, error: "bad-slot" };
  const v = await vimgVerse(no);
  if (v === "bad-no") return { ok: false, error: "bad-no" };
  if (!v) return { ok: false, error: "no-verse" };
  const alt = norm(b.alt).normalize("NFC");
  if (!alt || alt.length > 80) return { ok: false, error: "no-alt" };
  const rawImg = String(b.image ?? ""); const b64 = rawImg.includes(",") ? rawImg.slice(rawImg.indexOf(",") + 1) : rawImg;
  if (b64.length > 668_000) return { ok: false, error: "too-big" };   // 디코드 전에 크기부터 거른다
  const bytes = vimgDecode(b.image);
  const kind = bytes ? vimgKind(bytes) : null;
  const mime = String(b.mime || "");
  if (!bytes || !kind || (kind === "webp" ? mime !== "image/webp" : mime !== "image/jpeg")) return { ok: false, error: "bad-file" };
  if (bytes.length > VIMG_MAX_BYTES) return { ok: false, error: "too-big" };
  // 구절이 있는지는 위에서 vimgVerse 로 이미 확인했다
  // 바꿀 때마다 새 이름 — 캐시에 옛 그림이 남지 않게. 이름은 서버가 정한다
  const path = `${no}${slot === "a" ? "" : slot}-${Date.now()}.${kind}`;
  // 파일 이름이 저장마다 새것이라(Date.now()) 1년을 캐싱해도 안전하다
  const { error: e1 } = await db.storage.from(VIMG_BUCKET).upload(path, bytes, { contentType: mime, upsert: false, cacheControl: "31536000" });
  if (e1) return { ok: false, error: "save", detail: e1.message };
  let old: { path: string } | null = null;
  try {
    const { data: oldRow, error: e2 } = await db.from("verse_images").select("path").eq("verse_no", no).eq("slot", slot).maybeSingle();
    if (e2) throw e2;
    old = oldRow;
    const { error: e3 } = await db.from("verse_images").upsert({
      verse_no: no, slot, path, alt,
      scene_ko: norm(b.sceneKo).normalize("NFC").slice(0, 300) || null,
      scene_en: String(b.sceneEn ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, 300) || null,
      hidden: false, created_by: staffLabel(b), updated_at: new Date().toISOString(),
    }, { onConflict: "verse_no,slot" });
    if (e3) throw e3;
  } catch (e) {
    await db.storage.from(VIMG_BUCKET).remove([path]);   // 표에 못 남기면 방금 올린 파일이 떠돈다 — 치운다
    throw e;
  }
  // 저장이 끝난 뒤에만 옛 파일을 치운다 — 이 실패가 방금 저장한 새 파일을 지우면 안 되기 때문
  if (old?.path && old.path !== path) {
    const { error: re } = await db.storage.from(VIMG_BUCKET).remove([old.path]);
    if (re) console.error("verse image remove", re.message);   // 옛 파일 치우기 실패가 저장을 막지 않는다
  }
  return { ok: true, url: vimgUrl(path) };
}

async function verseImgHide(b: any) {
  const err = await contentError(b); if (err) return { ok: false, error: err };
  const no = Number(b.verseNo), slot = String(b.slot || "");
  if (!Number.isInteger(no) || no < 1) return { ok: false, error: "no-verse" };
  if (!VIMG_SLOTS.includes(slot)) return { ok: false, error: "bad-slot" };
  const { data, error } = await db.from("verse_images")
    .update({ hidden: !!b.hidden, updated_at: new Date().toISOString() })
    .eq("verse_no", no).eq("slot", slot).select("verse_no").maybeSingle();
  if (error) throw error;
  return data ? { ok: true } : { ok: false, error: "not-found" };
}
