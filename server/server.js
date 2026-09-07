#!/usr/bin/env node
/**
 * Rent Split — tiny self-hosted server.
 *
 * Zero dependencies: Node 18+ and nothing else. It does three things.
 *   1. Serves the built frontend from ../frontend/dist (or PUBLIC_DIR)
 *   2. Keeps the household's data in ONE json file, with backups
 *   3. Puts a shared password in front of it
 *
 * Configure with environment variables (see .env.example):
 *   PORT                  default 8080
 *   RENT_SPLIT_PASSWORD   the shared password. If unset, the site is OPEN.
 *   RENT_SPLIT_SECRET     random string used to sign session cookies
 *   DATA_DIR              where to keep data (default ../data)
 *   PUBLIC_DIR            built frontend assets (default ../frontend/dist)
 *   SECURE_COOKIE         "1" when served over https (recommended)
 *
 * Signing out someone specific: sessions are signed with a key that mixes
 * in RENT_SPLIT_PASSWORD itself, so changing the password immediately
 * invalidates every existing browser session, everyone's included — that
 * is the way to cut someone off (an ex-housemate, a link sent to the wrong
 * person). Just restarting the server with the SAME password does not sign
 * anyone out.
 */
"use strict";

const http = require("http");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const PORT = parseInt(process.env.PORT || "8080", 10);
const PASSWORD = process.env.RENT_SPLIT_PASSWORD || "";
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, "..", "data"));
const PUBLIC_DIR = path.resolve(
  process.env.PUBLIC_DIR || path.join(__dirname, "..", "frontend", "dist"),
);
const SECURE_COOKIE = process.env.SECURE_COOKIE === "1";
const DATA_FILE = path.join(DATA_DIR, "rent-split.json");
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const MAX_BODY = 8 * 1024 * 1024;          // 8 MB is far more than this ever needs
const SESSION_DAYS = 90;
const MAX_BACKUPS = 200;

// A secret is required to sign sessions. Generate and persist one if the
// operator didn't supply it, so a restart doesn't sign everyone out.
const SECRET = (() => {
  if (process.env.RENT_SPLIT_SECRET) return process.env.RENT_SPLIT_SECRET;
  const f = path.join(DATA_DIR, ".secret");
  try { return fs.readFileSync(f, "utf8").trim(); } catch (e) {}
  const v = crypto.randomBytes(32).toString("hex");
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(f, v, { mode: 0o600 }); } catch (e) {}
  return v;
})();

// The signing key mixes in the current password, not just SECRET. That is
// what makes "change the password" also mean "log everyone out" — the
// obvious way a household would expect to revoke someone's access (an old
// housemate, a leaked link) without needing to touch anything else.
const SIGNING_KEY = crypto.createHash("sha256").update(`${SECRET}${PASSWORD}`).digest();

// ---------------------------------------------------------------- helpers
const json = (res, code, obj) => {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
};

function timingSafeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) {
    // Still burn a comparison so length isn't leaked by timing.
    crypto.timingSafeEqual(ab, ab);
    return false;
  }
  return crypto.timingSafeEqual(ab, bb);
}

const sign = v => crypto.createHmac("sha256", SIGNING_KEY).update(v).digest("base64url");

function makeToken() {
  const exp = Date.now() + SESSION_DAYS * 86400000;
  const payload = `v1.${exp}`;
  return `${payload}.${sign(payload)}`;
}
function validToken(tok) {
  if (!tok) return false;
  const parts = String(tok).split(".");
  if (parts.length !== 3) return false;
  const payload = `${parts[0]}.${parts[1]}`;
  if (!timingSafeEqual(sign(payload), parts[2])) return false;
  const exp = parseInt(parts[1], 10);
  return Number.isFinite(exp) && Date.now() < exp;
}
function cookies(req) {
  const out = {};
  (req.headers.cookie || "").split(";").forEach(p => {
    const i = p.indexOf("=");
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
const authed = req => !PASSWORD || validToken(cookies(req).rs_session);

function readBody(req) {
  return new Promise((resolve, reject) => {
    let n = 0;
    const chunks = [];
    req.on("data", c => {
      n += c.length;
      if (n > MAX_BODY) { reject(new Error("too large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

// ---------------------------------------------------------------- storage
// One file, written atomically, with every previous version kept.
let writeChain = Promise.resolve();

async function readData() {
  try {
    const raw = await fsp.readFile(DATA_FILE, "utf8");
    const o = JSON.parse(raw);
    if (o && typeof o === "object" && o.rev) return o;
    return { rev: 1, savedAt: new Date().toISOString(), payload: o };
  } catch (e) {
    if (e.code === "ENOENT") return { rev: 0, savedAt: null, payload: null };
    // A corrupt file must not look like "no data" — that would invite
    // overwriting it with an empty state. Fail loudly instead.
    const err = new Error("The data file could not be read: " + e.message);
    err.fatal = true;
    throw err;
  }
}

async function writeData(payload, expectedRev, force) {
  // Serialise writes so two requests can't interleave read-modify-write.
  const run = async () => {
    await fsp.mkdir(BACKUP_DIR, { recursive: true });
    const cur = await readData();
    if (!force && cur.rev !== 0 && Number(expectedRev) !== cur.rev) {
      const e = new Error("conflict");
      e.conflict = true;
      e.current = cur;
      throw e;
    }
    const next = { rev: cur.rev + 1, savedAt: new Date().toISOString(), payload };
    const text = JSON.stringify(next);
    const tmp = DATA_FILE + ".tmp";
    await fsp.writeFile(tmp, text, "utf8");
    await fsp.rename(tmp, DATA_FILE);                       // atomic on the same fs
    if (cur.payload) {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      await fsp.writeFile(path.join(BACKUP_DIR, `rent-split-${stamp}-rev${cur.rev}.json`),
        JSON.stringify(cur), "utf8").catch(() => {});
      pruneBackups().catch(() => {});
    }
    return next;
  };
  writeChain = writeChain.then(run, run);
  return writeChain;
}

async function pruneBackups() {
  const files = (await fsp.readdir(BACKUP_DIR)).filter(f => f.endsWith(".json")).sort();
  const extra = files.length - MAX_BACKUPS;
  for (let i = 0; i < extra; i++) await fsp.unlink(path.join(BACKUP_DIR, files[i])).catch(() => {});
}

// ---------------------------------------------------------------- static
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".ico": "image/x-icon", ".webmanifest": "application/manifest+json",
  ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8",
};

async function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath.split("?")[0]);
  if (rel === "/" || rel === "") rel = "/index.html";
  // Resolve, then confirm the result is still inside PUBLIC_DIR.
  const full = path.resolve(PUBLIC_DIR, "." + rel);
  if (full !== PUBLIC_DIR && !full.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  let stat;
  try { stat = await fsp.stat(full); } catch (e) { stat = null; }
  if (!stat || !stat.isFile()) {
    // Single-page app: unknown paths fall back to index.html
    const idx = path.join(PUBLIC_DIR, "index.html");
    try { await fsp.stat(idx); } catch (e) { res.writeHead(404).end("Not found"); return; }
    return sendFile(res, idx, req);
  }
  return sendFile(res, full, req, stat);
}

async function sendFile(res, full, req, stat) {
  stat = stat || await fsp.stat(full);
  const etag = `W/"${stat.size}-${Number(stat.mtimeMs).toString(36)}"`;
  if (req.headers["if-none-match"] === etag) { res.writeHead(304).end(); return; }
  const type = MIME[path.extname(full).toLowerCase()] || "application/octet-stream";
  const isHashedAsset = full.includes(`${path.sep}assets${path.sep}`);
  res.writeHead(200, {
    "Content-Type": type,
    "Content-Length": stat.size,
    "ETag": etag,
    "Cache-Control": isHashedAsset
      ? "public, max-age=31536000, immutable"
      : "no-cache",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin",
  });
  fs.createReadStream(full).pipe(res);
}

// ---------------------------------------------------------------- login throttle
const attempts = new Map();   // ip -> {n, until}
function throttled(ip) {
  const a = attempts.get(ip);
  return !!(a && a.until > Date.now());
}
function noteFailure(ip) {
  const a = attempts.get(ip) || { n: 0, until: 0 };
  a.n += 1;
  if (a.n >= 5) { a.until = Date.now() + 60000; a.n = 0; }   // 1 minute cool-off
  attempts.set(ip, a);
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, a] of attempts) if (a.until < now && a.n === 0) attempts.delete(ip);
}, 300000).unref();

// ---------------------------------------------------------------- routes
const server = http.createServer(async (req, res) => {
  const url = req.url || "/";
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "?";

  try {
    if (url === "/api/health") {
      return json(res, 200, {
        app: "rent-split", version: 1,
        authRequired: !!PASSWORD, authed: authed(req),
      });
    }

    if (url === "/api/login" && req.method === "POST") {
      if (!PASSWORD) return json(res, 200, { ok: true });
      if (throttled(ip)) return json(res, 429, { error: "Too many attempts. Wait a minute." });
      let body = {};
      try { body = JSON.parse(await readBody(req) || "{}"); } catch (e) {}
      if (!timingSafeEqual(body.password || "", PASSWORD)) {
        noteFailure(ip);
        return json(res, 401, { error: "Wrong password" });
      }
      attempts.delete(ip);
      const parts = [
        `rs_session=${makeToken()}`, "Path=/", "HttpOnly", "SameSite=Lax",
        `Max-Age=${SESSION_DAYS * 86400}`,
      ];
      if (SECURE_COOKIE) parts.push("Secure");
      res.setHeader("Set-Cookie", parts.join("; "));
      return json(res, 200, { ok: true });
    }

    if (url === "/api/logout" && req.method === "POST") {
      res.setHeader("Set-Cookie", "rs_session=; Path=/; HttpOnly; Max-Age=0");
      return json(res, 200, { ok: true });
    }

    if (url.startsWith("/api/")) {
      if (!authed(req)) return json(res, 401, { error: "Not signed in" });

      if (url === "/api/rev") {
        const cur = await readData();
        return json(res, 200, { rev: cur.rev, savedAt: cur.savedAt });
      }

      if (url === "/api/data" && req.method === "GET") {
        const cur = await readData();
        return json(res, 200, cur);
      }

      if (url === "/api/data" && req.method === "PUT") {
        let body;
        try { body = JSON.parse(await readBody(req) || "{}"); }
        catch (e) { return json(res, 400, { error: "Bad JSON" }); }
        if (!body || typeof body.payload !== "object" || body.payload === null) {
          return json(res, 400, { error: "Missing payload" });
        }
        // Refuse anything that isn't recognisably this app's data, so a
        // stray request can't blank the household's records.
        if (body.payload.app !== "rent-split" || typeof body.payload.schema !== "number") {
          return json(res, 400, { error: "Not a rent-split payload" });
        }
        try {
          const next = await writeData(body.payload, body.rev, !!body.force);
          return json(res, 200, { rev: next.rev, savedAt: next.savedAt });
        } catch (e) {
          if (e.conflict) return json(res, 409, { error: "conflict", rev: e.current.rev });
          throw e;
        }
      }

      return json(res, 404, { error: "No such endpoint" });
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      return json(res, 405, { error: "Method not allowed" });
    }
    return await serveStatic(req, res, url);
  } catch (err) {
    console.error("[rent-split]", err && err.stack ? err.stack : err);
    if (!res.headersSent) json(res, 500, { error: "Server error" });
    else res.end();
  }
});

server.listen(PORT, () => {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  console.log(`Rent Split listening on http://localhost:${PORT}`);
  console.log(`  data:     ${DATA_FILE}`);
  console.log(`  password: ${PASSWORD ? "set" : "NOT SET — the site is open to anyone who finds it"}`);
  if (PASSWORD && !SECURE_COOKIE) {
    console.log("  note:     set SECURE_COOKIE=1 once you are serving over https");
  }
});
