#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const VERSION = "1.1.0";
const base = (process.env.TRANSMITLY_BASE_URL || "https://transmitly.io").replace(/\/$/, "");
const key = process.env.TRANSMITLY_API_KEY;

const MIME = {
  ".csv": "text/csv",
  ".gif": "image/gif",
  ".htm": "text/html",
  ".html": "text/html",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".json": "application/json",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".txt": "text/plain",
  ".webp": "image/webp",
  ".zip": "application/zip",
};

function usage() {
  console.log(`Transmitly CLI ${VERSION}

Usage:
  transmitly <command> [options]

Send:
  transmitly emails send --from <address> --to <address[,address]>
      --subject <text> [--html <html> | --html-file <path>]
      [--text <text> | --text-file <path>] [--cc <address>] [--bcc <address>]
      [--reply-to <address>] [--stream marketing|transactional]
      [--topic <topic>] [--schedule <RFC3339>] [--test]
      [--attach <path>]... [--idempotency-key <key>]

Inspect:
  transmitly emails get <id>
  transmitly messages list [--status <status>] [--stream <stream>] [--limit <n>]
  transmitly messages get <id>
  transmitly domains list
  transmitly domains create <domain>
  transmitly domains verify <id>
  transmitly suppressions list
  transmitly suppressions add <email> [--reason <reason>] [--note <note>]
  transmitly webhooks list
  transmitly events list [--limit <n>]
  transmitly usage
  transmitly health
  transmitly test-mode simulate --from <address> --to <address>
      --subject <text> [--html <html>] [--stream marketing|transactional]

Environment:
  TRANSMITLY_API_KEY   API key with the send or admin scope (required except health)
  TRANSMITLY_BASE_URL  API origin, default https://transmitly.io

Examples:
  TRANSMITLY_API_KEY=txk_… transmitly emails send \\
    --from "Notify <notify@acme.com>" --to ada@example.net \\
    --subject "Welcome" --html "<p>Your workspace is ready.</p>"

  TRANSMITLY_API_KEY=txk_… transmitly messages list --status bounced

Run "transmitly <command> --help" for a reminder of the options.`);
}

function parseArgs(argv) {
  const out = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      out._.push(arg);
      continue;
    }
    const name = arg.slice(2);
    const next = argv[i + 1];
    const value = next !== undefined && !next.startsWith("--") ? argv[++i] : "true";
    if (name === "attach") {
      out.flags.attach = [...(out.flags.attach ?? []), value];
    } else if (name === "cc" || name === "bcc") {
      out.flags[name] = [...(out.flags[name] ?? []), value];
    } else {
      out.flags[name] = value;
    }
  }
  return out;
}

function list(value) {
  if (value === undefined || value === true) return undefined;
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function readFile(file, label) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    throw new Error(`Could not read ${label}: ${file}`);
  }
}

async function api(method, endpoint, { body, query, auth = true, headers = {} } = {}) {
  if (auth && !key) throw new Error("TRANSMITLY_API_KEY is required");
  const url = new URL(base + endpoint);
  if (query) {
    for (const [name, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(name, String(value));
    }
  }
  const res = await fetch(url, {
    method,
    headers: {
      accept: "application/json",
      ...(auth ? { authorization: `Bearer ${key}` } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Unexpected response from ${endpoint}`);
    }
  }
  if (!res.ok) {
    throw new Error(data?.error?.message || `HTTP ${res.status}`);
  }
  return data;
}

function print(data) {
  console.log(JSON.stringify(data, null, 2));
}

function attachments(files = []) {
  return files.map((file) => {
    const resolved = path.resolve(file);
    let contents;
    try {
      contents = fs.readFileSync(resolved);
    } catch {
      throw new Error(`Could not read attachment: ${file}`);
    }
    return {
      filename: path.basename(resolved),
      content: contents.toString("base64"),
      content_type: MIME[path.extname(resolved).toLowerCase()] || "application/octet-stream",
    };
  });
}

async function sendEmail(flags) {
  const html = flags["html-file"] ? readFile(flags["html-file"], "HTML file") : flags.html;
  const text = flags["text-file"] ? readFile(flags["text-file"], "text file") : flags.text;
  const to = list(flags.to);
  if (!flags.from) throw new Error("--from is required");
  if (!to || to.length === 0) throw new Error("--to is required");
  if (!flags.subject) throw new Error("--subject is required");
  if (!html && !text) throw new Error("--html, --html-file, --text or --text-file is required");

  const body = {
    from: flags.from,
    to,
    subject: flags.subject,
  };
  if (html) body.html = html;
  if (text) body.text = text;
  if (flags["reply-to"]) body.reply_to = flags["reply-to"];
  if (flags.stream) body.stream = flags.stream;
  if (flags.topic) body.topic = flags.topic;
  if (flags.schedule) body.scheduled_at = flags.schedule;
  if (flags.test === "true") body.test_mode = true;
  if (flags.cc) body.cc = list(flags.cc);
  if (flags.bcc) body.bcc = list(flags.bcc);
  if (flags.attach) body.attachments = attachments(flags.attach);

  const result = await api("POST", "/v1/emails", {
    body,
    headers: { "Idempotency-Key": flags["idempotency-key"] || crypto.randomUUID() },
  });
  return result;
}

async function main() {
  const [group, action, ...rest] = process.argv.slice(2);
  if (!group || group === "help" || group === "-h" || group === "--help") {
    usage();
    return;
  }
  if (group === "version" || group === "--version" || group === "-v") {
    console.log(VERSION);
    return;
  }

  const { _, flags } = parseArgs(rest);
  if (flags.help === "true" || flags.h === "true") {
    usage();
    return;
  }

  if (group === "send" || (group === "emails" && action === "send")) {
    print(await sendEmail(flags));
    return;
  }
  if (group === "emails" && action === "get") {
    if (!_[0]) throw new Error("message id is required");
    print(await api("GET", `/v1/emails/${encodeURIComponent(_[0])}`));
    return;
  }
  if (group === "messages" && action === "list") {
    print(await api("GET", "/v1/messages", {
      query: { status: flags.status, stream: flags.stream, q: flags.q, limit: flags.limit || "20" },
    }));
    return;
  }
  if (group === "messages" && action === "get") {
    if (!_[0]) throw new Error("message id is required");
    print(await api("GET", `/v1/messages/${encodeURIComponent(_[0])}`));
    return;
  }
  if (group === "domains" && action === "list") {
    print(await api("GET", "/v1/domains"));
    return;
  }
  if (group === "domains" && action === "create") {
    if (!_[0]) throw new Error("domain is required");
    print(await api("POST", "/v1/domains", { body: { domain: _[0] } }));
    return;
  }
  if (group === "domains" && action === "verify") {
    if (!_[0]) throw new Error("domain id is required");
    print(await api("POST", `/v1/domains/${encodeURIComponent(_[0])}/verify`, { body: {} }));
    return;
  }
  if (group === "suppressions" && action === "list") {
    print(await api("GET", "/v1/suppressions", { query: { limit: flags.limit || "50" } }));
    return;
  }
  if (group === "suppressions" && action === "add") {
    if (!_[0]) throw new Error("email address is required");
    print(await api("POST", "/v1/suppressions", {
      body: { email: _[0], reason: flags.reason, note: flags.note },
    }));
    return;
  }
  if (group === "webhooks" && action === "list") {
    print(await api("GET", "/v1/webhooks"));
    return;
  }
  if (group === "events" && action === "list") {
    print(await api("GET", "/v1/events", { query: { limit: flags.limit || "50" } }));
    return;
  }
  if (group === "usage") {
    print(await api("GET", "/v1/usage"));
    return;
  }
  if (group === "health") {
    print(await api("GET", "/v1/health", { auth: false }));
    return;
  }
  if (group === "test-mode" && action === "simulate") {
    const to = list(flags.to);
    if (!flags.from || !to || !flags.subject) throw new Error("--from, --to and --subject are required");
    print(await api("POST", "/v1/test-mode/simulate", {
      body: {
        from: flags.from,
        to,
        subject: flags.subject,
        html: flags.html || "",
        text: flags.text || "",
        stream: flags.stream || "transactional",
      },
    }));
    return;
  }

  usage();
  process.exitCode = 2;
}

main().catch((error) => {
  console.error(`error: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
