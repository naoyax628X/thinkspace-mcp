// /mcp: OAuth で守られた MCP エンドポイント (Streamable HTTP、stateless)。
// ツールは send_to_inbox 1 本。カード化はアプリ側の仕事なので、ここは受信箱に 1 行入れるだけ。

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import type { AuthProps, Env } from "./env";
import { connectionState, insertInboxItem, touchConnection, type ConnectionState } from "./supabase";

const REVOKE_CACHE_SECONDS = 60;
/** 受け付ける本文の上限。30,000 字で切る前に巨大な入力を展開しないための天井 */
const TEXT_INPUT_MAX = 200_000;

/** iOS 側の source allowlist (InboxManager) に合わせる。未知の値はアプリ側で claude-code に丸められるので、ここで mcp に寄せる */
const SOURCE_ALLOWLIST = new Set(["claude-code", "shortcut", "clipboard", "mcp", "share"]);

function buildServer(env: Env, props: AuthProps): McpServer {
  const server = new McpServer({ name: "thinkspace", version: "0.2.0" });

  server.registerTool(
    "send_to_inbox",
    {
      title: "Send to ThinkSpace Inbox",
      description: [
        "Send a note to the user's ThinkSpace inbox (the ThinkSpace app on their iPhone, iPad, or Mac).",
        "Use when the user asks to send something to their inbox/ThinkSpace",
        "(e.g. 「受信箱に送って」, \"send this to ThinkSpace\").",
        "Set `text` to the VERBATIM full text of one chat message (usually one assistant response),",
        "unmodified — no summarizing, no rewriting, no trimming. Never invent content.",
        "`title` is a label draft of 20 characters or less; the user will rewrite it by hand,",
        "so treat it as a rough handle, not a finished title.",
        "For multiple notes, call this tool once per note.",
      ].join(" "),
      inputSchema: {
        text: z.string().min(1).max(TEXT_INPUT_MAX).describe("Note body: the verbatim full text of one chat message, unmodified."),
        title: z.string().max(40).optional().describe("Label draft, ideally ≤20 characters."),
        source: z.string().max(32).optional().describe("Origin identifier. Defaults to mcp."),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ text, title, source }) => {
      const src = source && SOURCE_ALLOWLIST.has(source) ? source : "mcp";
      const label = (title ?? "").trim().slice(0, 40);
      const { truncated } = await insertInboxItem(env, {
        userId: props.user_id,
        title: label,
        text,
        source: src,
      });
      const note = truncated ? " (the note was longer than 30,000 characters and was cut at that point)" : "";
      return {
        content: [
          {
            type: "text",
            text: `Saved to the ThinkSpace inbox${label ? `: ${label}` : ""}.${note} Open the inbox in the ThinkSpace app to turn it into cards.`,
          },
        ],
      };
    },
  );

  return server;
}

/**
 * user_id ごとに 60 回 / 分 (Rate Limiting binding、KV には書かない)。binding が無い環境では通す。
 * JSON-RPC のバッチ (配列) で tools/call が複数来た時は件数ぶん消費する。
 * 1 回しか消費しないと、100 件バッチで 60 件/分 の上限が実質 6,000 件/分 になる
 */
async function overRateLimit(env: Env, userId: string, count: number): Promise<boolean> {
  if (!env.RL_SEND) return false;
  for (let i = 0; i < count; i++) {
    const { success } = await env.RL_SEND.limit({ key: `user:${userId}` });
    if (!success) return true;
  }
  return false;
}

/** リクエスト本文の JSON-RPC メソッド名 (単発 / バッチ)。本文そのものは扱わない */
async function rpcMethods(request: Request): Promise<string[]> {
  try {
    const body = (await request.clone().json()) as unknown;
    const msgs = Array.isArray(body) ? body : [body];
    return msgs.map((m) => (typeof m === "object" && m !== null && typeof (m as { method?: unknown }).method === "string" ? (m as { method: string }).method : "?"));
  } catch {
    return [];
  }
}

/**
 * 接続の状態 (60 秒キャッシュ)。fail-closed:
 * - connection_id が無いトークン (テーブル反映前の発行) は失効扱い → 再認可させる
 * - 行が無い (削除済み) も失効扱い
 * - Supabase に届かない時はキャッシュせず unknown → 503 (トークンを有効化しない)
 */
async function state(env: Env, props: AuthProps): Promise<ConnectionState> {
  if (!props.connection_id) return "revoked";
  const key = `rev:${props.connection_id}`;
  const cached = await env.OAUTH_KV.get(key);
  if (cached === "1") return "revoked";
  if (cached === "0") return "active";
  const value = await connectionState(env, props.connection_id);
  if (value !== "unknown") await env.OAUTH_KV.put(key, value === "revoked" ? "1" : "0", { expirationTtl: REVOKE_CACHE_SECONDS });
  return value;
}

function jsonRpcError(status: number, message: string): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message }, id: null }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** OAuthProvider の apiHandler。ctx.props に completeAuthorization() で封入した AuthProps が入る */
export async function handleMcp(request: Request, env: Env, props: AuthProps, ctx: ExecutionContext): Promise<Response> {
  if (!props?.user_id) return jsonRpcError(401, "Unauthorized");

  // stateless なのでサーバー起点の SSE ストリーム (GET) もセッション終了 (DELETE) も無い。
  // 405 を返せばクライアントは再接続を繰り返さない (200 で即閉じると数秒ごとに再接続され、KV 書き込みが積み上がる)
  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: { Allow: "POST" } });
  }

  const connection = await state(env, props);
  if (connection === "unknown") {
    const res = jsonRpcError(503, "ThinkSpace is temporarily unavailable. Try again in a minute.");
    res.headers.set("Retry-After", "60");
    return res;
  }
  if (connection === "revoked") {
    // 失効済み: 401 でクライアントに再認可を促す
    return new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "Connection revoked" }, id: null }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "WWW-Authenticate": `Bearer error="invalid_token", error_description="Connection revoked", resource_metadata="${env.PUBLIC_BASE_URL}/.well-known/oauth-protected-resource"`,
      },
    });
  }
  const methods = await rpcMethods(request);
  const toolCallCount = methods.filter((m) => m === "tools/call").length;
  const toolCall = toolCallCount > 0;
  if (toolCall && (await overRateLimit(env, props.user_id, toolCallCount))) return jsonRpcError(429, "Too many requests. Try again in a minute.");

  const server = buildServer(env, props);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
    enableJsonResponse: true,
  });
  await server.connect(transport);
  const response = await transport.handleRequest(request);
  if (response.status >= 400) {
    // 診断用: メソッド名とプロトコル版だけ (本文・ユーザー情報は出さない)
    console.warn("mcp non-2xx", response.status, methods.join(","), request.headers.get("mcp-protocol-version") ?? "-", request.headers.get("user-agent")?.slice(0, 40) ?? "-");
  }
  if (toolCall && props.connection_id) ctx.waitUntil(touchConnection(env, props.connection_id));
  ctx.waitUntil(transport.close().catch(() => undefined));
  return response;
}
