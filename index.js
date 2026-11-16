#!/usr/bin/env node
const base = (process.env.TRANSMITLY_BASE_URL || "https://transmitly.io").replace(/\/$/, "");
const key = process.env.TRANSMITLY_API_KEY;

function usage() {
  console.error(`usage:
  transmitly emails send --from <address> --to <address[,address]> --subject <text> [--html <html>] [--text <text>] [--cc ...] [--bcc ...] [--schedule <RFC3339>] [--topic <topic>]
  transmitly emails get <id>
  transmitly messages list [--status <status>] [--stream <stream>] [--limit <n>]
  transmitly domains list
  transmitly webhooks list
  transmitly test-mode simulate --from <address> --to <address[,address]> --subject <text> [--html <html>] [--stream marketing|transactional]`);
  process.exit(2);
}

function args(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const k = a.slice(2);
      const v = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
      out[k] = v;
    } else out._.push(a);
  }
  return out;
}

async function api(method, path, body) {
  if (!key) throw new Error("TRANSMITLY_API_KEY is required");
  const res = await fetch(base + path, {
    method,
    headers: { authorization: `Bearer ${key}`, accept: "application/json", ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
  return data;
}

const [group, action, ...rest] = process.argv.slice(2);
if (!group || group === "--help" || group === "help") usage();
const opts = args(rest);

if (group === "emails" && action === "send") {
  const body = {
    from: opts.from, to: String(opts.to || "").split(",").map((v) => v.trim()).filter(Boolean),
    subject: opts.subject, html: opts.html || "", text: opts.text || "",
  };
  if (opts.cc) body.cc = String(opts.cc).split(",").map((v) => v.trim()).filter(Boolean);
  if (opts.bcc) body.bcc = String(opts.bcc).split(",").map((v) => v.trim()).filter(Boolean);
  if (opts.schedule) body.scheduled_at = opts.schedule;
  if (opts.topic) body.topic = opts.topic;
  console.log(JSON.stringify(await api("POST", "/v1/emails", body), null, 2));
} else if (group === "emails" && action === "get" && opts._[0]) {
  console.log(JSON.stringify(await api("GET", `/v1/emails/${encodeURIComponent(opts._[0])}`), null, 2));
} else if (group === "messages" && action === "list") {
  const q = new URLSearchParams();
  if (opts.status) q.set("status", opts.status);
  if (opts.stream) q.set("stream", opts.stream);
  q.set("limit", opts.limit || "20");
  console.log(JSON.stringify(await api("GET", `/v1/messages?${q}`), null, 2));
} else if (group === "domains" && action === "list") {
  console.log(JSON.stringify(await api("GET", "/v1/domains"), null, 2));
} else if (group === "webhooks" && action === "list") {
  console.log(JSON.stringify(await api("GET", "/v1/webhooks"), null, 2));
} else if (group === "test-mode" && action === "simulate") {
  const body = { from: opts.from, to: String(opts.to || "").split(",").map((v) => v.trim()).filter(Boolean), subject: opts.subject, html: opts.html || "", text: opts.text || "", stream: opts.stream || "transactional" };
  console.log(JSON.stringify(await api("POST", "/v1/test-mode/simulate", body), null, 2));
} else usage();
