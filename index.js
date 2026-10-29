#!/usr/bin/env node
// thinkspace-mcp — bridge MCP server.
// Sends notes to the ThinkSpace app inbox via the thinkspace://import URL scheme (macOS).
// No auth, no network: the app on this Mac receives locally; its own sync delivers to other devices.

import { execFile } from "node:child_process";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// URL scheme payloads degrade beyond a few KB; longer bodies go via the clipboard channel
// that the app supports (source=clipboard → app reads the pasteboard on receipt).
const MAX_URL_LENGTH = 8000;

function openUrl(url) {
  // -g: deliver without bringing ThinkSpace to the foreground (don't steal focus mid-session)
  return new Promise((resolve, reject) => {
    execFile("open", ["-g", url], (err) => (err ? reject(err) : resolve()));
  });
}

function pbcopy(text) {
  return new Promise((resolve, reject) => {
    const child = execFile("pbcopy", (err) => (err ? reject(err) : resolve()));
    child.stdin.end(text);
  });
}

const server = new McpServer({ name: "thinkspace", version: "0.1.0" });

server.tool(
  "send_to_inbox",
  [
    "Send a note to the ThinkSpace app inbox on this Mac.",
    "Use when the user asks to send something to their inbox/ThinkSpace",
    "(e.g. 「受信箱に送って」, \"send this to ThinkSpace\").",
    "Set `text` to the VERBATIM full text of one chat message (usually one assistant response),",
    "unmodified — no summarizing, no rewriting, no trimming. Never invent content.",
    "Long bodies are fine (the clipboard channel handles them automatically).",
    "`title` is a label draft of 20 characters or less; the user will rewrite it by hand,",
    "so treat it as a rough handle, not a finished title.",
    "For multiple notes, call this tool once per note (the app batches notifications).",
  ].join(" "),
  {
    text: z.string().min(1).describe("Note body: the verbatim full text of one chat message, unmodified."),
    title: z.string().max(40).optional().describe("Label draft, ideally ≤20 characters."),
    source: z.string().optional().describe("Origin identifier. Defaults to claude-code."),
  },
  async ({ text, title, source }) => {
    if (process.platform !== "darwin") {
      return {
        isError: true,
        content: [{ type: "text", text: "thinkspace-mcp only works on macOS (it bridges to the local ThinkSpace app)." }],
      };
    }

    // Build the query with encodeURIComponent (spaces -> %20), not URLSearchParams:
    // URLSearchParams is form-encoding (spaces -> "+") and the app's URL parser used to
    // keep those "+" literally, so bodies arrived full of plus signs.
    const buildQuery = (fields) =>
      Object.entries(fields)
        .filter(([, v]) => v !== undefined && v !== null && v !== "")
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join("&");

    let url = `thinkspace://import?${buildQuery({ title, source: source || "claude-code", text })}`;
    let channel = "url";

    if (url.length > MAX_URL_LENGTH) {
      // Long body: put it on the pasteboard, send metadata only.
      await pbcopy(text);
      url = `thinkspace://import?${buildQuery({ title, source: "clipboard" })}`;
      channel = "clipboard";
    }

    try {
      await openUrl(url);
    } catch {
      return {
        isError: true,
        content: [{ type: "text", text: "Could not open thinkspace:// — is the ThinkSpace app installed on this Mac?" }],
      };
    }

    return {
      content: [{
        type: "text",
        text: `Sent to ThinkSpace inbox (${channel} channel${title ? `, title: ${title}` : ""}).`,
      }],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
