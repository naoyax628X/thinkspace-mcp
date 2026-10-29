// Supabase への薄いクライアント (fetch 直叩き)。
// - 認可画面のパスワード経路: Auth のトークン端点を anon key で叩く (パスワードは転送するだけで保存もログもしない)
// - それ以外: service role で PostgREST / RPC。RLS を通らないので user_id は必ずトークン由来の値を明示する

import type { Env } from "./env";

const INBOX_BODY_MAX = 30_000; // inbox_items.body の CHECK (char_length <= 30000) に合わせる

export class SupabaseError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: string,
  ) {
    super(message);
  }
}

function serviceHeaders(env: Env, extra: Record<string, string> = {}): Record<string, string> {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function readError(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return "";
  }
}

/** メール + パスワードで Supabase Auth にサインインし、user_id を返す。失敗は null (理由は区別しない) */
export async function passwordSignIn(env: Env, email: string, password: string): Promise<string | null> {
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { access_token?: string; user?: { id?: string } };
  const userId = json.user?.id ?? null;
  // 本人確認にしか使わないので、作られた Supabase セッションはその場で閉じる (端末一覧に残さない)
  if (json.access_token) {
    await fetch(`${env.SUPABASE_URL}/auth/v1/logout?scope=local`, {
      method: "POST",
      headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${json.access_token}` },
    }).catch(() => undefined);
  }
  return userId;
}

/** アプリが発行した 6 桁コードを消費して user_id を返す。無効 / 期限切れ / 使用済みは null */
export async function consumePairingCode(env: Env, code: string): Promise<string | null> {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/consume_inbox_pairing_code`, {
    method: "POST",
    headers: serviceHeaders(env),
    body: JSON.stringify({ p_code: code }),
  });
  if (!res.ok) {
    // RPC 未反映 (404) も含めて「コードが使えない」扱い。ログだけ残す
    console.warn("consume_inbox_pairing_code failed", res.status, await readError(res));
    return null;
  }
  const value = (await res.json()) as string | null;
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** 接続の記録。テーブル未反映 (404) の間は null を返して先へ進む */
export async function insertConnection(env: Env, userId: string, clientName: string): Promise<string | null> {
  const id = crypto.randomUUID();
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/inbox_connections`, {
    method: "POST",
    headers: serviceHeaders(env, { Prefer: "return=minimal" }),
    body: JSON.stringify({ id, user_id: userId, client_name: clientName.slice(0, 80) }),
  });
  if (!res.ok) {
    console.warn("insert inbox_connections failed", res.status, await readError(res));
    return null;
  }
  return id;
}

export type ConnectionState = "active" | "revoked" | "unknown";

/** 接続の状態。行が無い (削除済み) は revoked、Supabase に届かない / エラーは unknown (呼び出し側で fail-closed にする) */
export async function connectionState(env: Env, connectionId: string): Promise<ConnectionState> {
  const url = new URL(`${env.SUPABASE_URL}/rest/v1/inbox_connections`);
  url.searchParams.set("id", `eq.${connectionId}`);
  url.searchParams.set("select", "revoked_at");
  try {
    const res = await fetch(url, { headers: serviceHeaders(env) });
    if (!res.ok) {
      console.warn("inbox_connections lookup failed", res.status, await readError(res));
      return "unknown";
    }
    const rows = (await res.json()) as Array<{ revoked_at: string | null }>;
    if (rows.length === 0) return "revoked";
    return rows[0].revoked_at != null ? "revoked" : "active";
  } catch (e) {
    console.warn("inbox_connections lookup threw", String(e));
    return "unknown";
  }
}

/** last_used_at を更新 (失敗は無視) */
export async function touchConnection(env: Env, connectionId: string): Promise<void> {
  const url = new URL(`${env.SUPABASE_URL}/rest/v1/inbox_connections`);
  url.searchParams.set("id", `eq.${connectionId}`);
  await fetch(url, {
    method: "PATCH",
    headers: serviceHeaders(env, { Prefer: "return=minimal" }),
    body: JSON.stringify({ last_used_at: new Date().toISOString() }),
  }).catch(() => undefined);
}

export interface InboxInsert {
  userId: string;
  title: string;
  text: string;
  source: string;
}

/** inbox_items に 1 行。本文は 30,000 字で切って is_truncated を立てる */
export async function insertInboxItem(env: Env, item: InboxInsert): Promise<{ truncated: boolean }> {
  const chars = Array.from(item.text);
  const truncated = chars.length > INBOX_BODY_MAX;
  const body = truncated ? chars.slice(0, INBOX_BODY_MAX).join("") : item.text;
  const now = new Date().toISOString();
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/inbox_items`, {
    method: "POST",
    headers: serviceHeaders(env, { Prefer: "return=minimal" }),
    body: JSON.stringify({
      id: crypto.randomUUID(),
      user_id: item.userId,
      source: item.source,
      title_candidate: item.title,
      body,
      is_truncated: truncated,
      status: "unread",
      created_at: now,
      updated_at: now,
    }),
  });
  if (!res.ok) {
    throw new SupabaseError("insert inbox_items failed", res.status, await readError(res));
  }
  return { truncated };
}
