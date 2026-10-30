// thinkspace-mcp (remote) — Cloudflare Worker。
// 1 つの Worker が OAuth 2.1 の認可サーバー (workers-oauth-provider) と MCP サーバー (/mcp) を兼ねる。
// - /.well-known/oauth-authorization-server, /.well-known/oauth-protected-resource: ライブラリが配る
// - /oauth/register (DCR + CIMD), /oauth/token: ライブラリ
// - /authorize: 自作の認可画面 (authorize.ts)
// - /mcp: send_to_inbox ツール (mcp.ts)。ctx.props に user_id が入る
// - /.well-known/openai-apps-challenge: OpenAI のドメイン検証
// - /: 説明ページへ redirect
// - /favicon.ico, /favicon.png, /icon.png: アプリアイコン (icon.ts)

import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { handleAuthorize } from "./authorize";
import { handleIcon } from "./icon";
import { AUTHORIZE_PATH, MCP_PATH, REGISTER_PATH, REQUIRED_SCOPES, SCOPES, TOKEN_PATH, docsUrlFor, type AuthProps, type Env } from "./env";
import { pickLang } from "./html";
import { handleMcp } from "./mcp";

const apiHandler = {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // ctx.props = completeAuthorization() で封入した AuthProps (ライブラリが復号して渡す)
    return handleMcp(request, env, ctx.props as AuthProps, ctx);
  },
};

const defaultHandler = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === AUTHORIZE_PATH) return handleAuthorize(request, env);

    if (url.pathname === "/.well-known/openai-apps-challenge") {
      if (!env.OPENAI_CHALLENGE_TOKEN) return new Response("Not Found", { status: 404 });
      return new Response(env.OPENAI_CHALLENGE_TOKEN, { headers: { "Content-Type": "text/plain" } });
    }

    if (url.pathname === "/" || url.pathname === "") {
      return Response.redirect(docsUrlFor(env, pickLang(request)), 302);
    }
    if (url.pathname === "/privacy") return Response.redirect(env.PRIVACY_URL, 302);
    if (url.pathname === "/healthz") return new Response("ok");
    const icon = handleIcon(url.pathname);
    if (icon) return icon;

    return new Response("Not Found", { status: 404 });
  },
};

// 公開 URL (issuer / resource) は env.PUBLIC_BASE_URL から。ドメインを変える時は wrangler.jsonc の vars だけ変える。
// OAuthProvider はオプションを固定で持つので、URL ごとに 1 つ作ってキャッシュする。
const providers = new Map<string, OAuthProvider<Env>>();

function providerFor(env: Env): OAuthProvider<Env> {
  const base = env.PUBLIC_BASE_URL.replace(/\/+$/, "");
  let provider = providers.get(base);
  if (!provider) {
    provider = new OAuthProvider<Env>({
      apiRoute: MCP_PATH,
      apiHandler,
      defaultHandler,
      authorizeEndpoint: AUTHORIZE_PATH,
      tokenEndpoint: TOKEN_PATH,
      clientRegistrationEndpoint: REGISTER_PATH,
      clientIdMetadataDocumentEnabled: true,
      scopesSupported: [...SCOPES],
      resourceMetadata: {
        resource: `${base}${MCP_PATH}`,
        authorization_servers: [base],
        // 何かするのに最低限必要なスコープ (クライアントは最初にこれを要求する)
        scopes_supported: REQUIRED_SCOPES,
        resource_name: "ThinkSpace Inbox",
      },
    });
    providers.set(base, provider);
  }
  return provider;
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return providerFor(env).fetch(request, env, ctx);
  },
};
