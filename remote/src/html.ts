// 認可画面の HTML。フレームワーク無しのテンプレート。クライアント由来の文字列は必ず escape する。

// アプリアイコン (AppIcon 1024 を 112px に縮小した PNG、data URI 埋め込み)
const APP_ICON = "data:image/png;base64,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";

export const escape = (value: string) => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export type Lang = "ja" | "en";

export function pickLang(request: Request): Lang {
  const al = request.headers.get("Accept-Language") ?? "";
  return /^ja|,ja|;ja/i.test(al) || al.toLowerCase().startsWith("ja") ? "ja" : "en";
}

const T = {
  ja: {
    title: "ThinkSpace に接続",
    heading: (client: string) => `${client} を ThinkSpace の受信箱に接続しますか?`,
    what: "接続すると、このアプリから ThinkSpace の受信箱にメモを送れるようになります。受信箱のメモを読むことはできません。",
    verifiedBy: (domain: string) => `提供元: ${domain}`,
    unverified: "このアプリは自己申告で登録されています (名前は検証されていません)。",
    redirect: (host: string) => `接続後の戻り先: ${host}`,
    loopbackWarn: "戻り先はこの端末上のアプリです。自分でいま接続を始めた場合だけ続けてください。",
    passwordTab: "メールアドレスでログイン",
    email: "メールアドレス",
    password: "パスワード",
    passwordNote: "Apple でサインインしている方は、下の「アプリのコード」をお使いください。",
    codeTab: "アプリのコードで接続",
    codeHelp: "ThinkSpace アプリの受信箱 → 右上の接続アイコン → 「接続コードを発行」で表示される 6 桁を入力してください (10 分間有効)。",
    code: "6 桁のコード",
    allow: "接続する",
    deny: "キャンセル",
    errPassword: "メールアドレスまたはパスワードが正しくありません。",
    errCode: "コードが正しくないか、期限切れです。アプリでもう一度発行してください。",
    errExpired: "この画面の有効期限が切れました。接続元のアプリからやり直してください。",
    errGeneric: "接続できませんでした。時間をおいてもう一度お試しください。",
    privacy: "プライバシーポリシー",
    docs: "使い方",
  },
  en: {
    title: "Connect to ThinkSpace",
    heading: (client: string) => `Connect ${client} to your ThinkSpace inbox?`,
    what: "This lets the app send notes to your ThinkSpace inbox. It cannot read your inbox.",
    verifiedBy: (domain: string) => `Published by ${domain}`,
    unverified: "This app registered itself; its name is not verified.",
    redirect: (host: string) => `After connecting you will return to: ${host}`,
    loopbackWarn: "This sends access to an app on this computer. Continue only if you just started connecting from it.",
    passwordTab: "Sign in with email",
    email: "Email",
    password: "Password",
    passwordNote: "If you use Sign in with Apple, use the app code below instead.",
    codeTab: "Connect with an app code",
    codeHelp: "In the ThinkSpace app: Inbox → link icon (top right) → “Get a connection code”. Enter the 6-digit code (valid for 10 minutes).",
    code: "6-digit code",
    allow: "Connect",
    deny: "Cancel",
    errPassword: "The email or password is incorrect.",
    errCode: "That code is invalid or has expired. Get a new one in the app.",
    errExpired: "This page has expired. Start again from the app you are connecting.",
    errGeneric: "Could not connect. Please try again in a moment.",
    privacy: "Privacy policy",
    docs: "How it works",
  },
} as const;

export type ErrorKey = "errPassword" | "errCode" | "errExpired" | "errGeneric";

export interface PageInput {
  lang: Lang;
  clientName: string;
  clientDomain?: string;
  redirectHost: string;
  redirectIsLoopback: boolean;
  handle: string;
  error?: ErrorKey;
  privacyUrl: string;
  docsUrl: string;
}

export function authorizePage(p: PageInput): string {
  const t = T[p.lang];
  const client = escape(p.clientName || "This app");
  const origin = p.clientDomain ? escape(t.verifiedBy(p.clientDomain)) : t.unverified;
  const err = p.error ? `<p class="error" role="alert">${t[p.error]}</p>` : "";
  return `<!doctype html>
<html lang="${p.lang}">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${t.title}</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", "Hiragino Sans", sans-serif; background: #f6f2ec; color: #222; }
  @media (prefers-color-scheme: dark) { body { background: #1f1e1c; color: #eee; } .card { background: #2a2927 !important; } input { background: #1f1e1c; color: #eee; border-color: #555 !important; } }
  main { max-width: 440px; margin: 0 auto; padding: 32px 20px 48px; }
  .logo { width: 56px; height: 56px; border-radius: 13px; background: #f3e6d6; display: block; margin: 0 auto 12px; }
  h1 { font-size: 20px; text-align: center; margin: 0 0 8px; }
  .meta { font-size: 13px; opacity: .75; text-align: center; margin: 0 0 4px; }
  .card { background: #fff; border-radius: 14px; padding: 18px; margin-top: 18px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
  .card h2 { font-size: 15px; margin: 0 0 10px; }
  label { display: block; font-size: 13px; margin: 10px 0 4px; }
  input { width: 100%; box-sizing: border-box; font-size: 16px; padding: 10px 12px; border: 1px solid #ccc; border-radius: 8px; }
  input.code { font-size: 28px; letter-spacing: .3em; text-align: center; }
  button { width: 100%; margin-top: 14px; padding: 13px; font-size: 16px; font-weight: 600; color: #fff; background: #3383c9; border: 0; border-radius: 10px; }
  button.secondary { background: transparent; color: inherit; font-weight: 400; opacity: .7; margin-top: 6px; }
  .note { font-size: 12px; opacity: .7; margin: 8px 0 0; }
  .error { color: #c0392b; font-size: 14px; text-align: center; margin: 12px 0 0; }
  .warn { font-size: 13px; color: #b35c00; text-align: center; margin: 8px 0 0; }
  footer { font-size: 12px; opacity: .6; text-align: center; margin-top: 24px; }
  footer a { color: inherit; }
</style>
<main>
  <img class="logo" src="${APP_ICON}" alt="" aria-hidden="true" width="56" height="56">
  <h1>${t.heading(client)}</h1>
  <p class="meta">${origin}</p>
  <p class="meta">${escape(t.redirect(p.redirectHost))}</p>
  ${p.redirectIsLoopback ? `<p class="warn">${t.loopbackWarn}</p>` : ""}
  <p class="meta" style="margin-top:10px">${t.what}</p>
  ${err}

  <form method="post" class="card" autocomplete="on">
    <h2>${t.passwordTab}</h2>
    <input type="hidden" name="handle" value="${escape(p.handle)}">
    <input type="hidden" name="method" value="password">
    <label for="email">${t.email}</label>
    <input id="email" name="email" type="email" autocomplete="username" required>
    <label for="password">${t.password}</label>
    <input id="password" name="password" type="password" autocomplete="current-password" required>
    <button type="submit" name="decision" value="approve">${t.allow}</button>
    <p class="note">${t.passwordNote}</p>
  </form>

  <form method="post" class="card">
    <h2>${t.codeTab}</h2>
    <input type="hidden" name="handle" value="${escape(p.handle)}">
    <input type="hidden" name="method" value="code">
    <p class="note" style="margin:0 0 6px">${t.codeHelp}</p>
    <label for="code">${t.code}</label>
    <input id="code" name="code" class="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" required>
    <button type="submit" name="decision" value="approve">${t.allow}</button>
  </form>

  <form method="post">
    <input type="hidden" name="handle" value="${escape(p.handle)}">
    <button type="submit" name="decision" value="deny" class="secondary">${t.deny}</button>
  </form>

  <footer><a href="${escape(p.docsUrl)}">${t.docs}</a> · <a href="${escape(p.privacyUrl)}">${t.privacy}</a></footer>
</main>
</html>`;
}

export function simplePage(lang: Lang, message: string, status = 400): Response {
  const t = T[lang];
  const body = `<!doctype html><html lang="${lang}"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${t.title}</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,"Hiragino Sans",sans-serif;padding:40px 20px;text-align:center;color:#222;background:#f6f2ec}</style>
<p>${escape(message)}</p></html>`;
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Frame-Options": "DENY",
      "Content-Security-Policy": "frame-ancestors 'none'",
      "Referrer-Policy": "no-referrer",
    },
  });
}
