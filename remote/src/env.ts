import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider";

/** wrangler.jsonc の vars + secrets + bindings */
export interface Env {
  OAUTH_KV: KVNamespace;
  OAUTH_PROVIDER: OAuthHelpers;
  /** Rate Limiting bindings (wrangler.jsonc の ratelimits)。認可画面のコード入力 / パスワード照合の試行制限 */
  RL_CODE?: RateLimit;
  RL_PASSWORD?: RateLimit;
  /** send_to_inbox の回数制限 (user_id ごと 60 回 / 分) */
  RL_SEND?: RateLimit;
  PUBLIC_BASE_URL: string;
  /** 説明ページ (ja)。en は DOCS_URL_EN、無ければ DOCS_URL */
  DOCS_URL: string;
  DOCS_URL_EN?: string;
  PRIVACY_URL: string;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  /** OpenAI のドメイン検証 (/.well-known/openai-apps-challenge)。未設定なら 404 */
  OPENAI_CHALLENGE_TOKEN?: string;
}

/** completeAuthorization() で封入し、/mcp の ctx.props として戻ってくるもの */
export interface AuthProps {
  /** Supabase auth.users.id */
  user_id: string;
  /** inbox_connections.id。失効の確認に使う。テーブル反映前の接続は undefined */
  connection_id?: string;
  /** 表示用のクライアント名 ("Claude" / "ChatGPT" / "Claude Code" ...) */
  client_name: string;
}

/** 認可サーバーが発行できるスコープ一式。resource 側の baseline は inbox:write */
export const SCOPES = ["inbox:write", "offline_access"] as const;
export const REQUIRED_SCOPES = ["inbox:write"];

export const MCP_PATH = "/mcp";
export const AUTHORIZE_PATH = "/authorize";
export const TOKEN_PATH = "/oauth/token";
export const REGISTER_PATH = "/oauth/register";

/** 言語ごとの説明ページ URL */
export function docsUrlFor(env: Env, lang: "ja" | "en"): string {
  return lang === "en" && env.DOCS_URL_EN ? env.DOCS_URL_EN : env.DOCS_URL;
}
