// Bearer-token gate in front of the local Ollama. Everything that uses the model goes through it:
// the Vercel app (via Tailscale Funnel), the Telegram worker and the background brain (locally).
// Only the endpoints the app uses pass; everything else (pull, delete, create, …) is refused.
//
// The model runs one generation at a time, so requests wait in a fair line (gate-queue.mjs):
// chat before scheduled jobs before background work, and two people take turns. A streaming
// request that has to wait gets {"queued":N} lines (N = place in line, 0 = starting now) before
// the model's own output, so the chat can say "you're #2 in line".
//
// It also tells the background brain (worker/brain.ts) what's going on, through small files:
//   $BRAIN_DIR/signals/gate.json             {inflight, last}  someone is using the model right now
//   $BRAIN_DIR/signals/changed-<user>.json   {at}              POST /brain/touch?user=…: data changed
//
//   OLLAMA_AUTH_TOKEN=<secret> node ollama-gate.mjs          (listens on 127.0.0.1:11500)
//   sudo tailscale funnel --bg --https=8443 http://127.0.0.1:11500
import http from "node:http";
import fs from "node:fs";
import { join } from "node:path";
import { timingSafeEqual } from "node:crypto";
import { FairQueue } from "./gate-queue.mjs";

const TOKEN = process.env.OLLAMA_AUTH_TOKEN ?? "";
const UPSTREAM = new URL(process.env.OLLAMA_UPSTREAM ?? "http://127.0.0.1:11434");
const PORT = Number(process.env.GATE_PORT ?? 11500);
const ALLOWED = new Set(["POST /api/chat", "POST /api/generate", "GET /api/ps"]);
const MAX_BODY = 256 * 1024;
const SIGNALS = join(process.env.BRAIN_DIR ?? "/var/lib/liveimproved/brain", "signals");
const queue = new FairQueue({ concurrency: Number(process.env.GATE_CONCURRENCY ?? 1) });

function signal(file, value) {
  try {
    fs.mkdirSync(SIGNALS, { recursive: true });
    fs.writeFileSync(join(SIGNALS, `${file}.tmp`), JSON.stringify(value));
    fs.renameSync(join(SIGNALS, `${file}.tmp`), join(SIGNALS, file));
  } catch {
    // The brain isn't installed: the gate works without it.
  }
}

let inflight = 0;
const activity = (delta) => {
  inflight = Math.max(0, inflight + delta);
  signal("gate.json", { inflight, last: Date.now() });
};

if (TOKEN.length < 32) {
  console.error("OLLAMA_AUTH_TOKEN must be at least 32 characters");
  process.exit(1);
}
const expected = Buffer.from(`Bearer ${TOKEN}`);

function authorized(header) {
  const got = Buffer.from(header ?? "");
  return got.length === expected.length && timingSafeEqual(got, expected);
}

function reject(res, status) {
  if (res.headersSent) return res.end(`${JSON.stringify({ error: http.STATUS_CODES[status] })}\n`);
  res.writeHead(status, { "Content-Type": "text/plain" }).end(http.STATUS_CODES[status]);
}

const safeId = (s) => String(s ?? "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);

/** Send the (already read) request to Ollama and stream its answer back. */
function forward(req, res, path, body, done) {
  const upstream = http.request(
    { host: UPSTREAM.hostname, port: UPSTREAM.port, method: req.method, path, headers: { "content-type": req.headers["content-type"] ?? "application/json", "content-length": body.length } },
    (up) => {
      if (!res.headersSent) res.writeHead(up.statusCode ?? 502, { "content-type": up.headers["content-type"] ?? "application/json" });
      else if ((up.statusCode ?? 200) >= 400) {
        // Headers went out with the queue lines: report the failure in-band.
        let text = "";
        up.on("data", (c) => (text += c));
        up.on("end", () => {
          res.end(`${JSON.stringify({ error: `Ollama ${up.statusCode}: ${text.slice(0, 300)}` })}\n`);
          done();
        });
        return;
      }
      up.pipe(res);
      up.on("end", done);
      up.on("error", done);
    },
  );
  upstream.on("error", () => {
    reject(res, 502);
    done();
  });
  // Caller went away mid-generation: stop Ollama working on it.
  res.on("close", () => {
    if (!res.writableFinished) upstream.destroy();
    done();
  });
  upstream.end(body);
}

http
  .createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://gate");
    const path = url.pathname;
    if (!authorized(req.headers.authorization)) return reject(res, 401);
    if (req.method === "POST" && path === "/brain/touch") {
      const user = safeId(url.searchParams.get("user"));
      signal(user ? `changed-${user}.json` : "changed.json", { at: Date.now() });
      req.resume();
      return res.writeHead(204).end();
    }
    if (req.method === "GET" && path === "/queue") return res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ waiting: queue.length, running: queue.running }));
    if (!ALLOWED.has(`${req.method} ${path}`)) return reject(res, 404);
    if (Number(req.headers["content-length"] ?? 0) > MAX_BODY) return reject(res, 413);
    if (req.method === "GET") return forward(req, res, path, Buffer.alloc(0), () => undefined);

    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(res, 413);
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on("end", () => {
      if (size > MAX_BODY) return;
      const body = Buffer.concat(chunks);
      let parsed = {};
      try {
        parsed = JSON.parse(body.toString("utf8"));
      } catch {
        return reject(res, 400);
      }
      // "Load the model" pings (no prompt) don't need a turn.
      if (!parsed.messages && !parsed.prompt) return forward(req, res, path, body, () => undefined);

      const priority = ["interactive", "normal", "background"].includes(req.headers["x-li-priority"]) ? req.headers["x-li-priority"] : "interactive";
      const user = safeId(req.headers["x-li-user"]) || "anon";
      const streaming = parsed.stream !== false;
      const counted = priority !== "background"; // the brain's own work isn't "someone is waiting"
      if (counted) activity(+1);
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        if (counted) activity(-1);
      };
      let waited = false;
      const cancel = queue.enqueue({
        user,
        priority,
        onPosition: (n) => {
          if (!streaming || res.writableEnded) return;
          if (!res.headersSent) res.writeHead(200, { "content-type": "application/x-ndjson" });
          waited = true;
          res.write(`${JSON.stringify({ queued: n })}\n`);
        },
        start: (done) => {
          if (res.destroyed || res.writableEnded) return done();
          if (waited) res.write(`${JSON.stringify({ queued: 0 })}\n`);
          forward(req, res, path, body, () => {
            release();
            done();
          });
        },
      });
      res.on("close", () => {
        cancel();
        release();
      });
    });
  })
  .listen(PORT, "127.0.0.1", () => console.log(`ollama-gate on 127.0.0.1:${PORT} → ${UPSTREAM.origin}`));
