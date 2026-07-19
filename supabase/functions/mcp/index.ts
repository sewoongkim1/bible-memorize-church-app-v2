// ============================================================
// 성경암송 조회 MCP 서버 (Supabase Edge Function · 항상 켜짐)
//   MCP(Streamable HTTP, JSON-RPC 2.0)를 구현해 클라우드에서 도구를 노출한다.
//   내 PC 없이도 누구나 URL + 발급키로 접속해 쓸 수 있다.
//
//   Claude/클라이언트 ──(MCP over HTTP + X-API-Key)──▶ 이 함수
//                                                       └─▶ 같은 프로젝트 api 함수 ─▶ DB
//
//   배포: supabase functions deploy mcp --no-verify-jwt
//   시크릿(프로젝트 공용): ADMIN_SECRET(기존), MCP_HTTP_KEY(클라이언트 인증용 발급키)
// ============================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ADMIN_SECRET = Deno.env.get("ADMIN_SECRET") ?? "";
const MCP_HTTP_KEY = Deno.env.get("MCP_HTTP_KEY") ?? ""; // 이 서버 호출에 필요한 발급 키

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-api-key, content-type, mcp-session-id, mcp-protocol-version, accept",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Expose-Headers": "mcp-session-id",
};

const SERVER_INFO = { name: "성경암송 조회", version: "1.0.0" };

// ── 도구 정의(스키마) ────────────────────────────────────────
const TOOLS = [
  {
    name: "find_member",
    description:
      '이름으로 성경암송 앱에 등록된 성도를 찾는다. "김세웅은 성도로 등록되어 있나요?" 같은 질문에 사용. ' +
      "부분 일치이며 동명이인이 있으면 여러 명이 나온다. 반환된 id 는 참여 조회에 쓴다.",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string", description: "찾을 성도 이름 (예: 김세웅)" } },
      required: ["name"],
    },
  },
  {
    name: "member_participation",
    description:
      '특정 성도의 최근 참여 현황을 집계한다. "김세웅 성도는 지난주 얼마나 참여했나요?" 같은 질문에 사용. ' +
      "먼저 find_member 로 user_id 를 얻은 뒤 호출한다.",
    inputSchema: {
      type: "object",
      properties: {
        user_id: { type: "string", description: "성도 고유 id (find_member 결과의 id)" },
        days: { type: "number", description: "최근 며칠 기준 (기본 7일)" },
      },
      required: ["user_id"],
    },
  },
];

// ── 실제 조회: 같은 프로젝트의 api 함수 호출(단일 출처 로직 재사용) ──
async function callApi(action: string, extra: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/api`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, pw: ADMIN_SECRET, ...extra }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "api 오류");
  return data;
}

async function runTool(name: string, args: Record<string, any>) {
  if (name === "find_member") {
    const d = await callApi("findMember", { name: args.name });
    return { count: d.count, members: d.members };
  }
  if (name === "member_participation") {
    const d = await callApi("memberParticipation", {
      user_id: args.user_id,
      days: args.days ?? 7,
    });
    return { days: d.days, total: d.total, learn: d.learn, challenge: d.challenge, activeDays: d.activeDays };
  }
  throw new Error(`알 수 없는 도구: ${name}`);
}

// ── JSON-RPC 응답 헬퍼 ───────────────────────────────────────
const rpcResult = (id: unknown, result: unknown) => ({ jsonrpc: "2.0", id, result });
const rpcError = (id: unknown, code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });

function json(body: unknown, extraHeaders: Record<string, string> = {}, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors, ...extraHeaders },
  });
}

// ── 인증: X-API-Key 헤더 또는 Authorization: Bearer <키> ──────
function authOk(req: Request): boolean {
  if (!MCP_HTTP_KEY) return false;
  const x = req.headers.get("x-api-key");
  if (x && x === MCP_HTTP_KEY) return true;
  const auth = req.headers.get("authorization") || "";
  if (auth.startsWith("Bearer ") && auth.slice(7) === MCP_HTTP_KEY) return true;
  return false;
}

// ── 단일 JSON-RPC 메시지 처리 ────────────────────────────────
async function handleRpc(msg: any): Promise<any | null> {
  const { id, method, params } = msg ?? {};
  // 알림(notification: id 없음) → 응답 없음
  if (method === "notifications/initialized" || method === "notifications/cancelled") return null;

  if (method === "initialize") {
    const clientVer = params?.protocolVersion || "2025-03-26";
    return rpcResult(id, {
      protocolVersion: clientVer,
      capabilities: { tools: { listChanged: false } },
      serverInfo: SERVER_INFO,
    });
  }
  if (method === "ping") return rpcResult(id, {});
  if (method === "tools/list") return rpcResult(id, { tools: TOOLS });
  if (method === "tools/call") {
    const toolName = params?.name;
    const args = params?.arguments ?? {};
    try {
      const out = await runTool(toolName, args);
      return rpcResult(id, { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] });
    } catch (e) {
      // 도구 실행 오류는 result.isError 로 전달(프로토콜 규약)
      return rpcResult(id, { content: [{ type: "text", text: `오류: ${(e as Error).message}` }], isError: true });
    }
  }
  return rpcError(id, -32601, `지원하지 않는 메서드: ${method}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  if (!authOk(req)) {
    return json(rpcError(null, -32001, "유효하지 않은 API 키 (X-API-Key)"), {}, 401);
  }

  // GET: 서버→클라이언트 SSE 스트림. 이 서버는 스트림 불필요 → 405.
  if (req.method === "GET") {
    return json(rpcError(null, -32000, "이 서버는 SSE 스트림을 제공하지 않습니다."), {}, 405);
  }
  // DELETE: 세션 종료 → 그냥 OK.
  if (req.method === "DELETE") return new Response("ok", { headers: cors });

  if (req.method !== "POST") {
    return json(rpcError(null, -32000, "POST 만 지원"), {}, 405);
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return json(rpcError(null, -32700, "JSON 파싱 오류"), {}, 400);
  }

  // 배치(배열) 또는 단일 메시지 모두 처리
  const sessionHeader = { "Mcp-Session-Id": crypto.randomUUID() };
  if (Array.isArray(payload)) {
    const results = (await Promise.all(payload.map(handleRpc))).filter((r) => r !== null);
    if (results.length === 0) return new Response(null, { status: 202, headers: cors });
    return json(results, sessionHeader);
  } else {
    const result = await handleRpc(payload);
    if (result === null) return new Response(null, { status: 202, headers: cors });
    return json(result, sessionHeader);
  }
});
