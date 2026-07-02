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

// 관리자 비밀 확인 → null이면 통과, 아니면 에러코드
function adminError(b: any): string | null {
  const secret = Deno.env.get("ADMIN_SECRET");
  if (!secret) return "no-password-set";
  if ((b.pw ?? "") !== secret) return "unauthorized";
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json();
    switch (body.action) {
      case "login":         return json(await login(body));
      case "saveProgress":  return json(await saveProgress(body));
      case "challenge":     return json(await challenge(body));
      case "advanceReview": return json(await advanceReview(body));
      case "ranking":       return json(await ranking(body));
      case "mydays":        return json(await mydays(body));
      // ---- 관리자 통계 ----
      case "stats":         return json(await stats(body));
      case "participants":  return json(await participants(body));
      case "verses":        return json(await verseStats(body));
      case "cleanupDummy":  return json(await cleanupDummy());
      case "importV1":      return json(await importV1(body));
      // ---- Web Push ----
      case "savePush":      return json(await savePush(body));
      case "removePush":    return json(await removePush(body));
      case "testPush":      return json(await testPush(body));
      case "sendPush":      return json(await sendPush(body));
      default:              return json({ error: `unknown action: ${body.action}` }, 400);
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
    if (!cur || stage > cur.stage) progMap.set(k, { user_id: uid, verse_no: no, stage });
  }
  if (progMap.size) {
    const arr = [...progMap.values()];
    for (let i = 0; i < arr.length; i += 500) {
      const { error } = await db.from("progress").upsert(arr.slice(i, i + 500), { onConflict: "user_id,verse_no" });
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
  const { error } = await db.from("push_subscriptions").upsert({
    user_id: b.user_id,
    endpoint: s.endpoint,
    p256dh: s.keys && s.keys.p256dh,
    auth: s.keys && s.keys.auth,
  }, { onConflict: "endpoint" });
  if (error) throw error;
  return { ok: true };
}

// verses.json에서 '이번 주(=오늘 기준 최신) 말씀'을 읽어 {ref,text} 반환
async function latestVerse(): Promise<{ ref: string; text: string } | null> {
  try {
    const res = await fetch("https://sewoongkim1.github.io/bible-memorize-church-app-v2/verses.json", { cache: "no-store" });
    const d = await res.json();
    const list = (d.verses ?? [])
      .filter((v: any) => v.date)
      .map((v: any) => ({ v, t: Date.parse(v.date) }))
      .sort((a: any, b: any) => a.t - b.t);
    if (!list.length) return null;
    const now = Date.now();
    let cur = list[0];
    for (const x of list) { if (x.t <= now) cur = x; else break; }
    return { ref: cur.v.refShort || cur.v.refFull || "", text: cur.v.text || "" };
  } catch (_) { return null; }
}

// ---------- removePush: 구독 해제(본인 endpoint 삭제) ----------
async function removePush(b: any) {
  if (!b.endpoint) return { ok: false, error: "no-endpoint" };
  const { error } = await db.from("push_subscriptions").delete().eq("endpoint", b.endpoint);
  if (error) throw error;
  return { ok: true };
}

// ---------- testPush: 본인 기기(endpoint)에만 테스트 발송 ----------
async function testPush(b: any) {
  if (!b.endpoint) return { ok: false, error: "no-endpoint" };
  const { data: sub } = await db.from("push_subscriptions")
    .select("endpoint,p256dh,auth").eq("endpoint", b.endpoint).maybeSingle();
  if (!sub) return { ok: false, error: "not-subscribed" };
  const payload = JSON.stringify({
    title: "성경암송 — 알림 설정 완료 ✅",
    body: "알림이 정상 작동해요! 매일 오전 7시에 그 주 말씀을 보내드릴게요. 🙌",
    url: "https://bit.ly/withbible",
  });
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
async function sendPush(b: any) {
  const err = adminError(b); if (err) return { ok: false, error: err };
  let title = b.title, body = b.body;
  if (b.latest) {
    const v = await latestVerse();
    if (v) { if (!title) title = v.ref; body = v.text; } // 제목 주면 유지, 본문은 이번 주 말씀
  }
  const { data: subs } = await db.from("push_subscriptions").select("id,endpoint,p256dh,auth");
  const payload = JSON.stringify({
    title: title || "성경말씀 암송",
    body: body || "오늘의 말씀을 암송해요! 🙌",
    url: b.url || "https://bit.ly/withbible",
  });
  let sent = 0, failed = 0;
  for (const s of (subs ?? []) as any[]) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
      );
      sent++;
    } catch (e: any) {
      failed++;
      const code = e && (e.statusCode || e.status);
      if (code === 404 || code === 410) await db.from("push_subscriptions").delete().eq("id", s.id);
    }
  }
  return { ok: true, sent, failed, total: (subs ?? []).length };
}

// ---------- login ----------
async function login(b: any) {
  const key = identityKey(b);
  const { data: user, error } = await db.from("users").upsert({
    type: b.type,
    gu: norm(b.gu) || null,
    mok: norm(b.mok) || null,
    bu: norm(b.bu) || null,
    grade: norm(b.grade) || null,
    name: norm(b.name),
    identity_key: key,
    last_seen_at: new Date().toISOString(),
  }, { onConflict: "identity_key" }).select().single();
  if (error) throw error;

  const { data: prog } = await db.from("progress")
    .select("verse_no,stage").eq("user_id", user.id);
  const { data: revs } = await db.from("reviews")
    .select("verse_no,box,due_at,last_at").eq("user_id", user.id);

  const progress: Record<number, number> = {};
  (prog ?? []).forEach((r: any) => { progress[r.verse_no] = r.stage; });
  return { ok: true, user_id: user.id, user, progress, reviews: revs ?? [] };
}

// ---------- saveProgress: 단계 저장 + 학습 통과 이벤트 기록(통계용) ----------
async function saveProgress(b: any) {
  const { error } = await db.from("progress").upsert({
    user_id: b.user_id, verse_no: b.verse_no, stage: b.stage,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,verse_no" });
  if (error) throw error;

  // 학습 통과를 활동 이벤트로 남긴다(관리자 사용현황/참여자/구절별 통계 원천)
  const m = b.mode === "voice" ? "learn-voice" : "learn-typing";
  await db.from("challenge_log").insert({
    user_id: b.user_id, verse_no: b.verse_no, mode: m,
  });

  if (Number(b.stage) === 3) {
    const due = new Date(); due.setDate(due.getDate() + REVIEW_DAYS[0]);
    await db.from("reviews").upsert({
      user_id: b.user_id, verse_no: b.verse_no, box: 1, due_at: ymd(due),
    }, { onConflict: "user_id,verse_no", ignoreDuplicates: true });
  }
  return { ok: true };
}

// ---------- challenge: 도전/복습 완료 기록(순위 원천) ----------
async function challenge(b: any) {
  const { error } = await db.from("challenge_log").insert({
    user_id: b.user_id, verse_no: b.verse_no,
    mode: b.mode, score: b.score ?? null,
  });
  if (error) throw error;
  return { ok: true };
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

// 기간 필터 적용(challenge_log)
function rangeFilter(q: any, b: any) {
  if (b.from) q = q.gte("created_at", `${b.from}T00:00:00${KST}`);
  if (b.to)   q = q.lte("created_at", `${b.to}T23:59:59${KST}`);
  return q;
}
// 도전/복습(학습 제외) 로그만
const isChallengeMode = (m: string) => !String(m).startsWith("learn-");

// ---------- ranking: 도전/복습 순위(학습 제외) ----------
async function ranking(b: any) {
  let q = db.from("challenge_log")
    .select("user_id, mode, created_at, users(name,type,gu,mok,bu,grade)");
  q = rangeFilter(q, b);
  const { data, error } = await q;
  if (error) throw error;

  const map = new Map<string, any>();
  for (const row of (data ?? []) as any[]) {
    if (!isChallengeMode(row.mode)) continue;
    const u = row.users ?? {};
    const e = map.get(row.user_id) ?? {
      name: u.name, gubun: u.type,
      sosok: u.gu || u.bu || "", sebu: u.mok || u.grade || "",
      count: 0, typing: 0, voice: 0,
    };
    e.count++;
    if (String(row.mode).includes("typing")) e.typing++;
    if (String(row.mode).includes("voice")) e.voice++;
    map.set(row.user_id, e);
  }
  const list = [...map.values()]
    .sort((a, b) => b.count - a.count)
    .map((x, i) => ({ rank: i + 1, ...x }));
  return { ok: true, list };
}

// ---------- mydays: 본인 도전/복습 일자별 횟수(학습 제외) ----------
async function mydays(b: any) {
  let q = db.from("challenge_log").select("created_at, mode").eq("user_id", b.user_id);
  q = rangeFilter(q, b);
  const { data, error } = await q;
  if (error) throw error;
  const days: Record<string, number> = {};
  for (const row of (data ?? []) as any[]) {
    if (!isChallengeMode(row.mode)) continue;
    const k = kstDay(row.created_at);
    days[k] = (days[k] || 0) + 1;
  }
  return { ok: true, days };
}

// ============================================================
// 관리자 통계 (learn-* = 학습 통과 활동 기준, v1 '진행기록' 탭에 대응)
// ============================================================

// ---------- stats: 기간별 사용현황 (구분·소속별) ----------
async function stats(b: any) {
  const err = adminError(b); if (err) return { ok: false, error: err };

  let q = db.from("challenge_log")
    .select("user_id, mode, users(type,gu,bu)");
  q = rangeFilter(q, b);
  const { data, error } = await q;
  if (error) throw error;

  const g = new Map<string, any>();
  const seen = new Map<string, Set<string>>(); // group → set(user_id)
  for (const row of (data ?? []) as any[]) {
    if (!String(row.mode).startsWith("learn-")) continue;
    const u = row.users ?? {};
    const gubun = u.type, sosok = u.gu || u.bu || "";
    const key = gubun + "|" + sosok;
    const e = g.get(key) ?? { gubun, sosok, newCount: 0, participants: 0, typing: 0, voice: 0, total: 0 };
    e.total++;
    if (row.mode === "learn-typing") e.typing++;
    if (row.mode === "learn-voice") e.voice++;
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
    const e = g.get(key) ?? { gubun: u.type, sosok: u.gu || u.bu || "", newCount: 0, participants: 0, typing: 0, voice: 0, total: 0 };
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

  let q = db.from("challenge_log")
    .select("user_id, mode, users(type,gu,mok,bu,grade,name)");
  q = rangeFilter(q, b);
  const { data, error } = await q;
  if (error) throw error;

  const map = new Map<string, any>();
  for (const row of (data ?? []) as any[]) {
    if (!String(row.mode).startsWith("learn-")) continue;
    const u = row.users ?? {};
    const e = map.get(row.user_id) ?? {
      gubun: u.type, sosok: u.gu || u.bu || "", sebu: u.mok || u.grade || "",
      name: u.name, typing: 0, voice: 0, total: 0,
    };
    e.total++;
    if (row.mode === "learn-typing") e.typing++;
    if (row.mode === "learn-voice") e.voice++;
    map.set(row.user_id, e);
  }
  let list = [...map.values()];
  if (b.gubun && b.gubun !== "전체") list = list.filter((x) => x.gubun === b.gubun);
  list.sort((a, b) => b.total - a.total);
  return { ok: true, list };
}

// ---------- verses: 구절별 현황 ----------
async function verseStats(b: any) {
  const err = adminError(b); if (err) return { ok: false, error: err };

  let q = db.from("challenge_log").select("verse_no, mode, user_id");
  q = rangeFilter(q, b);
  const { data, error } = await q;
  if (error) throw error;

  const map = new Map<number, any>();
  const seen = new Map<number, Set<string>>();
  for (const row of (data ?? []) as any[]) {
    if (!String(row.mode).startsWith("learn-")) continue;
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
