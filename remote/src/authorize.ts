// /authorize: OAuth の認可画面 (ThinkSpace 自身のページ)。
// GET: parseAuthRequest → describe → beginConsent → ログイン + 同意を 1 画面で
// POST: 本人確認 (メール + パスワード / アプリの 6 桁コード) → approveConsent → completeAuthorization → リダイレクト
// 本人確認に失敗した時は handle を消費せずに画面を出し直す (handle は成功時に 1 回だけ使う)。
// 本人確認の前に「このブラウザで始まった生きている認可トランザクションか」を確認し、
// 認可の外から Supabase にパスワード / コードを投げられないようにする (照合オラクル対策)。

import { AuthorizationError, CimdFetchError, type AuthRequest, type ClientInfo } from "@cloudflare/workers-oauth-provider";
import type { AuthProps, Env } from "./env";
import { SCOPES, docsUrlFor } from "./env";
import { authorizePage, pickLang, simplePage, type ErrorKey, type Lang } from "./html";
import { consumePairingCode, insertConnection, passwordSignIn } from "./supabase";

/** 認可画面に出す事実 (クライアント名、提供元ドメイン、戻り先ホスト、ループバックか) */
interface ConsentFacts {
  clientName: string;
  clientDomain?: string;
  redirectHost: string;
  redirectIsLoopback: boolean;
}

const LOOPBACK = /^(localhost|127(\.\d{1,3}){3}|\[::1\]|::1)$/i;

/** workers-oauth-provider の consent トランザクション cookie (既定 prefix "__Host-oauth-" + "consent") */
const CONSENT_COOKIE_BASE = "__Host-oauth-consent";

async function describe(env: Env, authRequest: AuthRequest): Promise<ConsentFacts> {
  const client: ClientInfo | null = await env.OAUTH_PROVIDER.lookupClient(authRequest.clientId);
  let redirectHost = "";
  try {
    redirectHost = new URL(authRequest.redirectUri).hostname;
  } catch {
    redirectHost = "";
  }
  // CIMD クライアントの client_id はメタデータ文書の URL。そのドメインは検証済みの提供元と言える
  let clientDomain: string | undefined;
  if (/^https:\/\//i.test(authRequest.clientId)) {
    try {
      clientDomain = new URL(authRequest.clientId).hostname;
    } catch {
      clientDomain = undefined;
    }
  }
  return {
    clientName: displayClientName(client?.clientName, redirectHost),
    clientDomain,
    redirectHost,
    redirectIsLoopback: LOOPBACK.test(redirectHost),
  };
}

/** 表示用のクライアント名。戻り先ホストで既知のものは固定名に寄せる (DCR の名前は自己申告なので) */
function displayClientName(registered: string | undefined, redirectHost: string): string {
  const host = redirectHost.toLowerCase();
  if (host === "claude.ai" || host.endsWith(".claude.ai")) return "Claude";
  if (host === "chatgpt.com" || host.endsWith(".chatgpt.com") || host.endsWith(".openai.com")) return "ChatGPT";
  const name = registered?.trim();
  return name && name.length > 0 ? name.slice(0, 80) : "This app";
}

/** 認可画面 (ログインフォームを含む) に常に付けるヘッダー: iframe 埋め込み禁止、外部リンクへ referrer を渡さない */
function hardenHeaders(headers: Headers): Headers {
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Content-Security-Policy", "frame-ancestors 'none'");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("X-Content-Type-Options", "nosniff");
  return headers;
}

function render(env: Env, lang: Lang, details: ConsentFacts, handle: string, headers: Headers, error?: ErrorKey): Response {
  const html = authorizePage({
    lang,
    clientName: details.clientName,
    clientDomain: details.clientDomain,
    redirectHost: details.redirectHost,
    redirectIsLoopback: details.redirectIsLoopback,
    handle,
    error,
    privacyUrl: env.PRIVACY_URL,
    docsUrl: docsUrlFor(env, lang),
  });
  return new Response(html, { status: error ? 400 : 200, headers: hardenHeaders(headers) });
}

function expiredPage(lang: Lang): Response {
  return simplePage(
    lang,
    lang === "ja" ? "この画面の有効期限が切れました。接続元のアプリからやり直してください。" : "This page has expired. Start again from the app you are connecting.",
  );
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("Cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    if (part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return undefined;
}

/**
 * handle が「このブラウザで beginConsent した、まだ生きているトランザクション」を指すか。
 * ライブラリの openTransaction と同じ照合 (cookie 名 = base-hash16、値 = hash、KV に transaction:hash) を
 * 消費せずに行う。approveConsent の前に本人確認 (Supabase 呼び出し) をするので、その前段の門
 */
async function hasLiveTransaction(env: Env, request: Request, handle: string): Promise<boolean> {
  if (!handle) return false;
  const hash = await sha256Hex(handle);
  const bound = readCookie(request, `${CONSENT_COOKIE_BASE}-${hash.slice(0, 16)}`);
  if (!bound || bound !== hash) return false;
  return (await env.OAUTH_KV.get(`transaction:${hash}`)) != null;
}

function clientIp(request: Request): string {
  return request.headers.get("CF-Connecting-IP") ?? "unknown";
}

/** Rate Limiting binding (アトミック)。binding が無い環境 (古い設定) では通す */
async function allowed(limiter: RateLimit | undefined, key: string): Promise<boolean> {
  if (!limiter) return true;
  const { success } = await limiter.limit({ key });
  return success;
}

export async function handleAuthorize(request: Request, env: Env): Promise<Response> {
  const oauth = env.OAUTH_PROVIDER;
  const lang = pickLang(request);

  try {
    if (request.method === "GET") {
      const authRequest = await oauth.parseAuthRequest(request);
      const details = await describe(env, authRequest);
      const consent = await oauth.beginConsent(authRequest);
      return render(env, lang, details, consent.handle, consent.headers);
    }

    if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

    const form = await request.formData();
    const handle = String(form.get("handle") ?? "");
    if (!handle) return simplePage(lang, "Bad request");

    // 認可トランザクションの外からの POST は、Supabase に触る前にここで止める
    if (!(await hasLiveTransaction(env, request, handle))) return expiredPage(lang);

    if (form.get("decision") !== "approve") {
      const denied = await oauth.denyConsent(request, handle);
      return new Response(null, { status: 302, headers: denied.headers });
    }

    // まず本人確認。失敗しても handle は生きているので同じ画面を出し直す
    const method = String(form.get("method") ?? "");
    const ip = clientIp(request);
    let userId: string | null = null;
    let error: ErrorKey | undefined;

    if (method === "password") {
      const email = String(form.get("email") ?? "").trim().toLowerCase();
      const password = String(form.get("password") ?? "");
      // 送信元 IP と、メールアドレスごとの両方で制限 (総当たりと、1 アカウント狙いの両方を止める)
      const ok = email && password && (await allowed(env.RL_PASSWORD, `ip:${ip}`)) && (await allowed(env.RL_PASSWORD, `email:${email}`));
      if (ok) userId = await passwordSignIn(env, email, password);
      if (!userId) error = "errPassword";
    } else if (method === "code") {
      const code = String(form.get("code") ?? "").replace(/\D/g, "");
      if (code.length === 6 && (await allowed(env.RL_CODE, `ip:${ip}`))) {
        userId = await consumePairingCode(env, code);
      }
      if (!userId) error = "errCode";
    } else {
      error = "errGeneric";
    }

    if (!userId || error) {
      // 画面の再描画には元の認可リクエストの情報が要る。handle からは引けないので、
      // 認可リクエストを URL から取り直す (フォームは同じ URL に POST されている)
      const authRequest = await oauth.parseAuthRequest(request);
      const details = await describe(env, authRequest);
      return render(env, lang, details, handle, new Headers(), error ?? "errGeneric");
    }

    // 同意の確定 (handle はここで消費される) → 接続の記録 → 認可の完了
    const approved = await oauth.approveConsent(request, handle, {
      scope: approvedScopes(),
    });
    const details = await describe(env, approved.request);
    const clientName = details.clientName;
    const connectionId = await insertConnection(env, userId, clientName);
    const props: AuthProps = { user_id: userId, client_name: clientName, ...(connectionId ? { connection_id: connectionId } : {}) };

    const { redirectTo } = await oauth.completeAuthorization({
      request: approved.request,
      userId,
      metadata: { clientName, connectionId },
      scope: approvedScopes(),
      props,
    });
    approved.headers.set("Location", redirectTo);
    return new Response(null, { status: 302, headers: approved.headers });
  } catch (error) {
    if (error instanceof AuthorizationError && error.redirectUri) {
      // クライアントと redirect URI が検証済みの失敗だけ、クライアントへ error を返す
      const to = new URL(error.redirectUri);
      to.searchParams.set("error", error.code);
      to.searchParams.set("error_description", error.description);
      if (error.state) to.searchParams.set("state", error.state);
      if (error.issuer) to.searchParams.set("iss", error.issuer);
      return Response.redirect(to.toString(), 302);
    }
    if (error instanceof AuthorizationError) {
      // 画面の期限切れ / 別ブラウザ / 未対応スコープ
      return expiredPage(lang);
    }
    if (error instanceof CimdFetchError) {
      return simplePage(lang, lang === "ja" ? "接続元のアプリを確認できませんでした。" : "This app could not be verified.");
    }
    throw error;
  }
}

/** 発行するスコープ。クライアントの要求に関係なく受信箱への書き込み (+ リフレッシュ) に固定する */
function approvedScopes(): string[] {
  return [...SCOPES];
}
