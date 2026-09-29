// Bearer-token gate in front of the local Ollama, published with Tailscale Funnel so the
// Vercel deployment can reach the model. Only the three endpoints the app uses pass through;
// everything else (pull, delete, create, …) is refused. Responses are streamed unbuffered.
//
//   OLLAMA_AUTH_TOKEN=<secret> node ollama-gate.mjs          (listens on 127.0.0.1:11500)
//   sudo tailscale funnel --bg --https=8443 http://127.0.0.1:11500
import http from "node:http";
import { timingSafeEqual } from "node:crypto";

const TOKEN = process.env.OLLAMA_AUTH_TOKEN ?? "";
const UPSTREAM = new URL(process.env.OLLAMA_UPSTREAM ?? "http://127.0.0.1:11434");
const PORT = Number(process.env.GATE_PORT ?? 11500);
const ALLOWED = new Set(["POST /api/chat", "POST /api/generate", "GET /api/ps"]);
const MAX_BODY = 256 * 1024;

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
  res.writeHead(status, { "Content-Type": "text/plain" }).end(http.STATUS_CODES[status]);
}

http
  .createServer((req, res) => {
    const path = (req.url ?? "").split("?")[0];
    if (!authorized(req.headers.authorization)) return reject(res, 401);
    if (!ALLOWED.has(`${req.method} ${path}`)) return reject(res, 404);
    if (Number(req.headers["content-length"] ?? 0) > MAX_BODY) return reject(res, 413);

    const upstream = http.request(
      {
        host: UPSTREAM.hostname,
        port: UPSTREAM.port,
        method: req.method,
        path,
        headers: { "content-type": req.headers["content-type"] ?? "application/json" },
      },
      (up) => {
        res.writeHead(up.statusCode ?? 502, {
          "content-type": up.headers["content-type"] ?? "application/json",
        });
        up.pipe(res);
      },
    );
    upstream.on("error", () => (res.headersSent ? res.destroy() : reject(res, 502)));
    // Caller went away mid-generation: stop Ollama working on it.
    res.on("close", () => {
      if (!res.writableFinished) upstream.destroy();
    });

    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        upstream.destroy();
        reject(res, 413);
        req.destroy();
      }
    });
    req.pipe(upstream);
  })
  .listen(PORT, "127.0.0.1", () => console.log(`ollama-gate on 127.0.0.1:${PORT} → ${UPSTREAM.origin}`));
