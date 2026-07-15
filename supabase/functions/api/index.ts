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
      case "authCheck": {   // 관리자 비번 검증(허브 로그인용)
        const e = adminError(body);
        return json(e ? { ok: false, error: e } : { ok: true }, e ? 403 : 200);
      }
      case "login":         return json(await login(body));
      case "saveProgress":  return json(await saveProgress(body));
      case "saveHeart":     return json(await saveHeart(body));
      case "challenge":     return json(await challenge(body));
      case "advanceReview": return json(await advanceReview(body));
      case "ranking":       return json(await ranking(body));
      case "guRanking":     return json(await guRanking(body));
      case "mydays":        return json(await mydays(body));
      case "verseCounts":   return json(await verseCounts(body));
      // ---- 관리자 통계 ----
      case "stats":         return json(await stats(body));
      case "participants":  return json(await participants(body));
      case "verses":        return json(await verseStats(body));
      // ---- 조회(MCP 학습용) ----
      case "findMember":          return json(await findMember(body));
      case "memberParticipation": return json(await memberParticipation(body));
      // ---- 말씀/설교 관리(CMS) ----
      case "getVerses":     return json(await getVerses());
      case "saveVerse":     return json(await saveVerse(body));
      case "seedVerses":    return json(await seedVerses(body));
      case "cleanupDummy":  return json(await cleanupDummy());
      case "importV1":      return json(await importV1(body));
      // ---- Web Push ----
      case "savePush":      return json(await savePush(body));
      case "removePush":    return json(await removePush(body));
      case "testPush":      return json(await testPush(body));
      case "sendPush":      return json(await sendPush(body));
      // ---- 장애 모니터링 ----
      case "monitor":       return json(await monitor(body));
      // ---- 주간 리포트 메일 ----
      case "weeklyReport":  return json(await weeklyReport(body));
      // ---- 질문·제안 게시판 ----
      case "boardList":     return json(await boardList(body));
      case "boardPost":     return json(await boardPost(body));
      case "boardReply":    return json(await boardReply(body));
      case "boardDeleteMine": return json(await boardDeleteMine(body));
      case "boardModerate": return json(await boardModerate(body));
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

// DB verses에서 '이번 주(=오늘 기준 최신) 말씀'을 읽어 {ref,text} 반환
async function latestVerse(): Promise<{ ref: string; text: string } | null> {
  try {
    const { data } = await db.from("verses")
      .select("ref_short,ref_full,ref,text,date").eq("is_active", true);
    const list = (data ?? [])
      .filter((v: any) => v.date)
      .map((v: any) => ({ v, t: Date.parse(v.date) }))
      .sort((a: any, b: any) => a.t - b.t);
    if (!list.length) return null;
    const now = Date.now();
    let cur = list[0];
    for (const x of list) { if (x.t <= now) cur = x; else break; }
    return { ref: cur.v.ref_short || cur.v.ref_full || cur.v.ref || "", text: cur.v.text || "" };
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
  const hour = [5, 6, 7, 8].includes(Number(b.hour)) ? Number(b.hour) : 7;
  const payload = JSON.stringify({
    title: "성경암송 — 알림 설정 완료 ✅",
    body: `알림이 정상 작동해요! 매일 오전 ${hour}시에 그 주 말씀을 보내드릴게요. 🙌`,
    url: "https://gocheok.onlybible.kr/",
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
    if (v) { // 제목 기본값은 표어(서버 소스=UTF-8), 본문 = 이번 주 말씀 + 요절
      if (!title) title = "오직 성경, 말씀이 답이다!";
      body = v.ref ? `${v.text} (${v.ref})` : v.text;
    }
  }
  // hour 지정 시 그 시간을 고른 구독자에게만(시간대별 cron), 없으면 전체(관리자 수동 발송)
  let subQ = db.from("push_subscriptions").select("id,endpoint,p256dh,auth");
  if (b.hour) subQ = subQ.eq("hour", Number(b.hour));
  const { data: subs } = await subQ;
  const payload = JSON.stringify({
    title: title || "성경말씀 암송",
    body: body || "오늘의 말씀을 암송해요! 🙌",
    url: b.url || "https://gocheok.onlybible.kr/",
  });
  let sent = 0, failed = 0;
  const errs: string[] = [];
  const vapidReady = !!(VAPID_PUBLIC && VAPID_PRIVATE);
  for (const s of (subs ?? []) as any[]) {
    let ok = false, lastCode: any = null, lastMsg = "";
    for (let attempt = 1; attempt <= 2; attempt++) {   // 일시적 오류 대비 1회 재시도
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
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
  const total = (subs ?? []).length;
  // 진단 모드: 실제 에러/설정 상태를 반환(관리자 호출 시에만 노출)
  if (b.diag) return { ok: true, sent, failed, total, vapidReady, vapidSubject: VAPID_SUBJECT, errors: errs };
  // 장애 모니터링용 발송 로그 기록(실패해도 발송 결과에는 영향 없음)
  try {
    await db.from("push_log").insert({
      mode: b.mode || (b.latest ? "daily" : "manual"),
      title: title || "성경말씀 암송",
      sent, failed, total, ok: sent > 0,
    });
  } catch (_) { /* 로그 실패 무시 */ }
  return { ok: true, sent, failed, total };
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
  const { data: vs } = await db.from("verses").select("date").eq("is_active", true);
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

  return {
    ok: problems.length === 0,
    serverTimeKST: kstNow.toISOString().replace("T", " ").slice(0, 16) + " KST",
    db: "up",
    subscribers,
    latestVerseDate,
    todayPush,
    problems,
  };
}

// ---------- getVerses: 앱 표시용 말씀 목록(verses.json과 동일 형태) ----------
async function getVerses() {
  const { data, error } = await db.from("verses")
    .select("no,date,ref_short,ref_full,ref,text,hint,pastor,sermon_title,sermon_url")
    .eq("is_active", true).order("no");
  if (error) throw error;
  const verses = (data ?? []).map((v: any) => ({
    no: v.no, date: v.date,
    refShort: v.ref_short || v.ref || "",
    refFull: v.ref_full || v.ref || "",
    text: v.text || "",
    hintText: v.hint || "",
    sermonTitle: v.sermon_title || "",
    pastor: v.pastor || "",
    url: v.sermon_url || "",
  }));
  return { ok: true, verses };
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

  // select("*") — hearted 컬럼이 아직 없어도(마이그레이션 전) 에러 없이 undefined로 읽혀
  // 로그인이 깨지지 않는다. 배포 순서에 의존하지 않기 위함.
  const { data: prog } = await db.from("progress")
    .select("*").eq("user_id", user.id);

  // 복습 서버 단일화: 완료(3단계)했는데 복습 예약이 없는 구절에 자동 예약(box1, 3일 후)
  const { data: existRev } = await db.from("reviews").select("verse_no").eq("user_id", user.id);
  const revSet = new Set((existRev ?? []).map((r: any) => r.verse_no));
  const due = new Date(); due.setDate(due.getDate() + REVIEW_DAYS[0]);
  const toAdd = (prog ?? [])
    .filter((p: any) => p.stage === 3 && !revSet.has(p.verse_no))
    .map((p: any) => ({ user_id: user.id, verse_no: p.verse_no, box: 1, due_at: ymd(due) }));
  if (toAdd.length) {
    await db.from("reviews").upsert(toAdd, { onConflict: "user_id,verse_no", ignoreDuplicates: true });
  }

  const { data: revs } = await db.from("reviews")
    .select("verse_no,box,due_at,last_at").eq("user_id", user.id);

  // progress는 기존 형태({구절:단계} 숫자 맵) 유지 — 구버전 클라이언트 호환.
  // "마음에 둠"은 별도 배열로만 덧붙인다(비파괴).
  const progress: Record<number, number> = {};
  (prog ?? []).forEach((r: any) => { progress[r.verse_no] = r.stage; });
  const hearted = (prog ?? []).filter((r: any) => r.hearted).map((r: any) => r.verse_no);
  return { ok: true, user_id: user.id, user, progress, hearted, reviews: revs ?? [] };
}

// ---------- saveHeart: "이 말씀을 내 마음에 두었나이다" 체크/해제 ----------
async function saveHeart(b: any) {
  const on = !!b.hearted;
  const { error } = await db.from("progress").upsert({
    user_id: b.user_id, verse_no: b.verse_no,
    stage: 3,                       // 3단계를 통과해야만 체크 가능
    hearted: on,
    hearted_at: on ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,verse_no" });
  if (error) throw error;
  return { ok: true, hearted: on };
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

// ---------- ranking: 순위. includeLearn=true면 암송(학습) 기록도 포함 ----------
async function ranking(b: any) {
  const includeLearn = !!b.includeLearn; // 앱 도전순위=true, 관리자 도전현황=false
  let q = db.from("challenge_log")
    .select("user_id, mode, created_at, users(name,type,gu,mok,bu,grade)");
  q = rangeFilter(q, b);
  const { data, error } = await q;
  if (error) throw error;

  const map = new Map<string, any>();
  for (const row of (data ?? []) as any[]) {
    if (!includeLearn && !isChallengeMode(row.mode)) continue;
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

// ---------- guRanking: 교구별 순위(암송·도전·복습 전부) ----------
// 참여율은 낼 수 없다 — 각 교구의 실제 성도 수(분모)가 DB에 없다.
// 그래서 총 횟수로 순위를 매기고, 참여 인원·1인당 평균을 함께 준다.
async function guRanking(b: any) {
  let q = db.from("challenge_log").select("user_id, users(type,gu)");
  q = rangeFilter(q, b);
  const { data, error } = await q;
  if (error) throw error;

  const map = new Map<string, { gu: string; count: number; users: Set<string> }>();
  for (const row of (data ?? []) as any[]) {
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
  let q = db.from("challenge_log").select("created_at, mode").eq("user_id", b.user_id);
  q = rangeFilter(q, b);
  const { data, error } = await q;
  if (error) throw error;
  const days: Record<string, number> = {};
  for (const row of (data ?? []) as any[]) {
    const k = kstDay(row.created_at);
    days[k] = (days[k] || 0) + 1;
  }
  return { ok: true, days };
}

// ---------- verseCounts: 본인 구절별 암송 횟수(암송·도전·복습 전부) ----------
async function verseCounts(b: any) {
  const { data, error } = await db.from("challenge_log")
    .select("verse_no").eq("user_id", b.user_id);
  if (error) throw error;
  const counts: Record<number, number> = {};
  for (const row of (data ?? []) as any[]) {
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
      .map((r) => ({ gubun: r.gubun, sosok: r.sosok, newCount: r.new_count, participants: r.participants, typing: r.typing, voice: r.voice, total: r.total }))
      .sort((a, b) => (a.gubun === b.gubun ? String(a.sosok).localeCompare(b.sosok) : String(a.gubun).localeCompare(b.gubun)));
    return { ok: true, list };
  } catch (_) { /* RPC 미설치 → 폴백 */ }
  return await statsSlow(b);
}

async function statsSlow(b: any) {
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
  try {
    const { data, error } = await db.rpc("v2_participants", { p_from: b.from || "", p_to: b.to || "", p_gubun: b.gubun || "" });
    if (error) throw error;
    const list = ((data ?? []) as any[]).map((r) => ({ gubun: r.gubun, sosok: r.sosok, sebu: r.sebu, name: r.name, typing: r.typing, voice: r.voice, total: r.total, days: r.days, isNew: r.is_new }));
    return { ok: true, list };
  } catch (_) { /* 폴백 */ }
  return await participantsSlow(b);
}

async function participantsSlow(b: any) {
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

// ---------- 조회(MCP 학습용) ----------
// 이름으로 성도 등록 여부·소속 조회
async function findMember(b: any) {
  const err = adminError(b); if (err) return { ok: false, error: err };
  const name = norm(b.name);
  if (!name) return { ok: false, error: "name 필요" };
  // 한글 이름은 NFC/NFD 정규화 차이로 ilike가 어긋날 수 있어 전체를 받아 JS에서 정규화 비교
  const q = name.normalize("NFC");
  const { data, error } = await db.from("users").select("id, name, identity_key");
  if (error) return { ok: false, error: error.message };
  const members = (data ?? [])
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
        <div style="font-size:13px;font-weight:800;color:#1a3a6b;margin:0 0 6px">🙌 참여자 전체 (${report.participants.length}명)</div>
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
  const cumRes: any = await stats({ pw: b.pw, from: "", to: "" });
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
    const r: any = await stats({ pw: b.pw, from: wk.from, to: wk.to }); // pw 넘겨야 권한 통과
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

// ============================================================
// 질문·제안 공개 게시판 (누구나 글/답글, 관리자 숨김·삭제)
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
  const byPost = new Map<number, any[]>();
  for (const r of replies) { if (!byPost.has(r.post_id)) byPost.set(r.post_id, []); byPost.get(r.post_id)!.push(r); }
  return { ok: true, isAdmin, posts: (posts ?? []).map((p: any) => ({ ...p, replies: byPost.get(p.id) || [] })) };
}

async function boardPost(b: any) {
  const content = String(b.content || "").trim();
  if (!content) return { ok: false, error: "empty" };
  if (content.length > 2000) return { ok: false, error: "too-long" };
  const name = (String(b.name || "").trim().slice(0, 40)) || "익명";
  const row: any = { name, content };
  if (b.user_id) row.user_id = b.user_id;
  let { data, error } = await db.from("board_posts").insert(row).select("id").single();
  if (error && /user_id/i.test(String(error.message || ""))) { // user_id 컬럼 마이그레이션 전 폴백
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
  const isAdmin = !adminError(b); // 관리자 답글이면 배지
  const name = isAdmin ? "관리자" : ((String(b.name || "").trim().slice(0, 40)) || "익명");
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
  // 소유 확인: 소속+이름(name=boardWho) 우선 → 옛 글(user_id 없음)도 매칭. 없으면 user_id.
  const ownerCol = who ? "name" : "user_id";
  const ownerVal = who || b.user_id;
  let { data, error } = await db.from(table).update({ deleted: true })
    .eq("id", Number(b.id)).eq(ownerCol, ownerVal).select("id");
  if (error && /deleted/i.test(String(error.message || ""))) { // deleted 컬럼 마이그레이션 전 폴백
    ({ data, error } = await db.from(table).update({ hidden: true })
      .eq("id", Number(b.id)).eq(ownerCol, ownerVal).select("id"));
  }
  if (error) throw error;
  if (!(data && data.length)) return { ok: false, error: "not-owner" };
  return { ok: true };
}

async function boardModerate(b: any) {
  const err = adminError(b); if (err) return { ok: false, error: err };
  const table = b.kind === "reply" ? "board_replies" : "board_posts";
  const id = Number(b.id);
  if (!id) return { ok: false, error: "no-id" };
  // op: 'hide' | 'show' | 'delete'(물리삭제) | 'undelete'(본인삭제 태그 복구)
  if (b.op === "delete") {
    const { error } = await db.from(table).delete().eq("id", id); if (error) throw error;
  } else if (b.op === "undelete") {
    const { error } = await db.from(table).update({ deleted: false }).eq("id", id); if (error) throw error;
  } else {
    const { error } = await db.from(table).update({ hidden: b.op === "hide" }).eq("id", id); if (error) throw error;
  }
  return { ok: true };
}
