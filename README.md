# thinkspace-mcp

An MCP server that sends notes from your AI conversations to the
[ThinkSpace](https://thinkspace-app.com/) inbox — so what you reach with AI doesn't
scroll away in a chat log, and ends up as cards you arrange with your own hands.

ThinkSpace's philosophy: AI helps gather and diverge; **you** build the map, because only
what you build yourself stays in your head. Accordingly, this server never creates cards
directly — it only delivers material to the inbox. Turning material into cards is yours.

- **Remote server** (recommended): `https://mcp.thinkspace-app.com/mcp` — works from
  claude.ai, ChatGPT, Claude Code, and any MCP client that supports OAuth. Notes arrive on
  every device where you're signed in to ThinkSpace.
- **Local server** (legacy): a stdio bridge for Claude Code on the same Mac as the app.

## Remote server

### Connect

| Client | How |
|---|---|
| claude.ai (web / desktop / mobile) | Settings → Connectors → Add custom connector → URL `https://mcp.thinkspace-app.com/mcp` |
| ChatGPT | Settings → Connectors (developer mode) → Create → MCP server URL `https://mcp.thinkspace-app.com/mcp`, auth OAuth |
| Claude Code | `claude mcp add --transport http thinkspace https://mcp.thinkspace-app.com/mcp` then `/mcp` to sign in |

The client opens ThinkSpace's connection page. Sign in with your ThinkSpace email and
password, or — if you use Sign in with Apple — with a 6-digit code from the app:
**Inbox → link icon (top right) → “Get a connection code”** (valid for 10 minutes).

You can see and revoke connections in the same screen in the app. A revoked connection
gets a 401 on its next call and the client asks you to connect again.

### Use

> 「いまの結論、受信箱に送って」
> "Send this to my ThinkSpace inbox."

The client calls `send_to_inbox` with the full text of the message and a rough label.
Open the inbox in ThinkSpace (iPhone / iPad / Mac) and decide what becomes a card.

### Tool

#### `send_to_inbox`

| input | description |
|---|---|
| `text` (required) | Note body — the verbatim full text of one chat message |
| `title` (optional) | Label draft, ideally ≤20 characters (you'll rewrite it by hand) |
| `source` (optional) | Origin identifier, defaults to `mcp` |

Annotations: `readOnlyHint: false`, `destructiveHint: false`, `idempotentHint: false`.
The server only writes to the inbox; it cannot read your inbox or canvases.

Limits: 60 notes per minute per user; bodies over 30,000 characters are cut at that point
and flagged as truncated.

### How it works

- One Cloudflare Worker serves both the OAuth 2.1 authorization server and the MCP
  endpoint (Streamable HTTP, stateless). Discovery via RFC 9728 / RFC 8414, dynamic client
  registration (RFC 7591) and client ID metadata documents, PKCE S256, refresh-token
  rotation.
- The authorization page is ThinkSpace's own. Passwords are verified against ThinkSpace's
  auth service and never stored or logged. App codes are one-time and expire in 10 minutes.
- Each connection is recorded and can be revoked from the app. Tokens carry only the user
  id and connection id.
- Notes are written to the ThinkSpace backend (Supabase) as inbox items and delivered to
  the app by its normal sync.

Docs for end users: https://support.thinkspace.nextbuild.jp/en/ai-inbox/
Privacy policy: https://thinkspace-public.s3.ap-northeast-1.amazonaws.com/privacy-policy-en-v2.html

### Develop

```bash
cd remote
npm install
cp .dev.vars.example .dev.vars   # SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
npx wrangler dev                 # http://localhost:8787/mcp
./node_modules/.bin/tsc --noEmit
npx wrangler deploy
```

Secrets in production are set with `wrangler secret put` (see `remote/wrangler.jsonc`).
The service role key lives only in Worker secrets and `.dev.vars` (gitignored).

## Local server (legacy, macOS only)

A stdio server that hands notes to the ThinkSpace app on the same Mac via the
`thinkspace://` URL scheme; the app's own sync then delivers them to your iPad / iPhone.
No account or token is needed, but it only works with Claude Code on that Mac.

```bash
claude mcp add thinkspace -- npx -y thinkspace-mcp
# or from a local checkout
git clone https://github.com/naoyax628X/thinkspace-mcp.git
cd thinkspace-mcp && npm install
claude mcp add thinkspace -- node /path/to/thinkspace-mcp/index.js
```

The npm package is [`thinkspace-mcp`](https://www.npmjs.com/package/thinkspace-mcp), published
by the same author as this repository; it contains only `index.js` (the local bridge).

Requires Node.js 18+ and the ThinkSpace Mac app. The tool is the same `send_to_inbox`;
`source` defaults to `claude-code`, and bodies beyond URL-scheme limits are delivered via
the clipboard channel (`source` becomes `clipboard`). Note that the clipboard channel
**overwrites whatever is on your clipboard** at that moment.

## License

MIT
