// ============================================================
// 성경말씀 암송 앱 v2 — API 미들웨어 (Supabase Edge Function)
//   클라이언트(PWA)의 모든 데이터 요청을 이 함수가 대신 처리한다.
//   service_role 키로 접속하여 RLS(기본 차단)를 우회한다.
//   배포: supabase functions deploy api
//   시크릿: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, (선택) ADMIN_SECRET
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

// 복습(Leitner) 간격: box 1..5 → 다음 복습까지 일수
const REVIEW_DAYS = [7, 14, 30, 60, 120];

const norm = (s: unknown) => (s ?? "").toString().trim().replace(/\s+/g, " ");
const identityKey = (u: any) =>
  [u.type, u.gu, u.mok, u.bu, u.grade, u.name].map(norm).join("|");
const ymd = (d: Date) => d.toISOString().slice(0, 10);

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
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
      default:              return json({ error: `unknown action: ${body.action}` }, 400);
    }
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});

// ---------- login: 식별→upsert→진도·복습 반환(기기간 동기화) ----------
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
  return { user_id: user.id, user, progress, reviews: revs ?? [] };
}

// ---------- saveProgress: 단계 저장(3단계면 복습 1회차 예약) ----------
async function saveProgress(b: any) {
  const { error } = await db.from("progress").upsert({
    user_id: b.user_id, verse_no: b.verse_no, stage: b.stage,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,verse_no" });
  if (error) throw error;

  if (Number(b.stage) === 3) {
    const due = new Date(); due.setDate(due.getDate() + REVIEW_DAYS[0]);
    await db.from("reviews").upsert({
      user_id: b.user_id, verse_no: b.verse_no, box: 1, due_at: ymd(due),
    }, { onConflict: "user_id,verse_no", ignoreDuplicates: true });
  }
  return { ok: true };
}

// ---------- challenge: 도전/암송 기록(순위·통계 원천) ----------
async function challenge(b: any) {
  const { error } = await db.from("challenge_log").insert({
    user_id: b.user_id, verse_no: b.verse_no,
    mode: b.mode, score: b.score ?? null,
  });
  if (error) throw error;
  return { ok: true };
}

// ---------- advanceReview: 복습 성공→다음 상자·예정일 ----------
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

// ---------- ranking: 기간별 도전 순위(타이핑/음성 구분) ----------
async function ranking(b: any) {
  const period = b.period || "all"; // today | week | all
  let q = db.from("challenge_log")
    .select("user_id, mode, created_at, users(name,type,gu,mok,bu,grade)");
  if (period === "today") {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    q = q.gte("created_at", d.toISOString());
  } else if (period === "week") {
    const d = new Date(); d.setDate(d.getDate() - 6); d.setHours(0, 0, 0, 0);
    q = q.gte("created_at", d.toISOString());
  }
  const { data, error } = await q;
  if (error) throw error;

  const map = new Map<string, any>();
  for (const row of (data ?? []) as any[]) {
    const u = row.users ?? {};
    const e = map.get(row.user_id) ?? {
      user_id: row.user_id, name: u.name, type: u.type,
      gu: u.gu, mok: u.mok, bu: u.bu, grade: u.grade,
      total: 0, typing: 0, voice: 0,
    };
    e.total++;
    if (String(row.mode).includes("typing")) e.typing++;
    if (String(row.mode).includes("voice")) e.voice++;
    map.set(row.user_id, e);
  }
  const arr = [...map.values()].sort((a, b) => b.total - a.total);
  return { period, ranking: arr };
}
