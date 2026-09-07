#!/usr/bin/env node
/**
 * Rent Split — tiny self-hosted server.
 *
 * Zero dependencies: Node 18+ and nothing else. It does four things.
 *   1. Serves the built frontend from ../frontend/dist (or PUBLIC_DIR)
 *   2. Keeps the household's data in ONE json file, with backups
 *   3. Keeps per-person logins in a sidecar accounts.json (hashes stay here)
 *   4. Enforces admin vs tenant access on the API
 *
 * Configure with environment variables (see .env.example):
 *   PORT                       default 8080
 *   RENT_SPLIT_ADMIN_USER      seeded if accounts.json is empty (default asoni)
 *   RENT_SPLIT_ADMIN_PASSWORD  seeded if accounts.json is empty
 *   RENT_SPLIT_SECRET          random string used to sign session cookies
 *   DATA_DIR                   where to keep data (default ../data)
 *   PUBLIC_DIR                 built frontend assets (default ../frontend/dist)
 *   SECURE_COOKIE              "1" when served over https (recommended)
 *
 * Revoking one person: disable or reset their login. That bumps tokenVersion
 * so only their cookies die. Changing RENT_SPLIT_SECRET signs everyone out.
 */
"use strict";

const http = require("http");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { createAccountStore } = require("./accounts");

const PORT = parseInt(process.env.PORT || "8080", 10);
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, "..", "data"));
const PUBLIC_DIR = path.resolve(
  process.env.PUBLIC_DIR || path.join(__dirname, "..", "frontend", "dist"),
);
const SECURE_COOKIE = process.env.SECURE_COOKIE === "1";
const DATA_FILE = path.join(DATA_DIR, "rent-split.json");
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const MAX_BODY = 8 * 1024 * 1024;
const SESSION_DAYS = 90;
const MAX_BACKUPS = 200;
const SEED_ADMIN_USER = process.env.RENT_SPLIT_ADMIN_USER || "asoni";
const SEED_ADMIN_PASSWORD = process.env.RENT_SPLIT_ADMIN_PASSWORD || "iamgay";

const SECRET = (() => {
  if (process.env.RENT_SPLIT_SECRET) return process.env.RENT_SPLIT_SECRET;
  const f = path.join(DATA_DIR, ".secret");
  try {
    return fs.readFileSync(f, "utf8").trim();
  } catch (e) {}
  const v = crypto.randomBytes(32).toString("hex");
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(f, v, { mode: 0o600 });
  } catch (e) {}
  return v;
})();

const SIGNING_KEY = crypto.createHash("sha256").update(SECRET).digest();
const accounts = createAccountStore(DATA_DIR, {
  seedUser: SEED_ADMIN_USER,
  seedPassword: SEED_ADMIN_PASSWORD,
});

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
    crypto.timingSafeEqual(ab, ab);
    return false;
  }
  return crypto.timingSafeEqual(ab, bb);
}

const sign = (v) => crypto.createHmac("sha256", SIGNING_KEY).update(v).digest("base64url");

function makeToken(account) {
  const exp = Date.now() + SESSION_DAYS * 86400000;
  const payload = `v2.${account.id}.${account.tokenVersion}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

function cookies(req) {
  const out = {};
  (req.headers.cookie || "").split(";").forEach((p) => {
    const i = p.indexOf("=");
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

function parseToken(tok) {
  if (!tok) return null;
  const parts = String(tok).split(".");
  if (parts.length !== 5) return null;
  if (parts[0] !== "v2") return null;
  const payload = `${parts[0]}.${parts[1]}.${parts[2]}.${parts[3]}`;
  if (!timingSafeEqual(sign(payload), parts[4])) return null;
  const exp = parseInt(parts[3], 10);
  if (!Number.isFinite(exp) || Date.now() >= exp) return null;
  return { accountId: parts[1], tokenVersion: parseInt(parts[2], 10) };
}

function sessionFrom(req) {
  const parsed = parseToken(cookies(req).rs_session);
  if (!parsed) return null;
  const account = accounts.getById(parsed.accountId);
  if (!account || !account.enabled) return null;
  if (account.tokenVersion !== parsed.tokenVersion) return null;
  return account;
}

function sessionCookie(token) {
  const parts = [
    `rs_session=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_DAYS * 86400}`,
  ];
  if (SECURE_COOKIE) parts.push("Secure");
  return parts.join("; ");
}

function personName(data, personId) {
  const people = Array.isArray(data?.people) ? data.people : [];
  const p = people.find((x) => x && x.id === personId);
  return p && typeof p.name === "string" ? p.name : null;
}

function sessionInfo(account, data) {
  return {
    accountId: account.id,
    username: account.username,
    role: account.role,
    personId: account.personId,
    personName: account.personId ? personName(data, account.personId) : null,
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let n = 0;
    const chunks = [];
    req.on("data", (c) => {
      n += c.length;
      if (n > MAX_BODY) {
        reject(new Error("too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function accountErrorStatus(err) {
  switch (err && err.code) {
    case "bad_username":
    case "bad_password":
    case "bad_role":
    case "need_person":
    case "username_taken":
    case "last_admin":
      return 400;
    case "missing":
      return 404;
    default:
      return 500;
  }
}

let writeChain = Promise.resolve();

async function readData() {
  try {
    const raw = await fsp.readFile(DATA_FILE, "utf8");
    const o = JSON.parse(raw);
    if (o && typeof o === "object" && o.rev) return o;
    return { rev: 1, savedAt: new Date().toISOString(), payload: o };
  } catch (e) {
    if (e.code === "ENOENT") return { rev: 0, savedAt: null, payload: null };
    const err = new Error("The data file could not be read: " + e.message);
    err.fatal = true;
    throw err;
  }
}

async function writeData(payload, expectedRev, force) {
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
    await fsp.rename(tmp, DATA_FILE);
    if (cur.payload) {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      await fsp
        .writeFile(
          path.join(BACKUP_DIR, `rent-split-${stamp}-rev${cur.rev}.json`),
          JSON.stringify(cur),
          "utf8",
        )
        .catch(() => {});
      pruneBackups().catch(() => {});
    }
    return next;
  };
  writeChain = writeChain.then(run, run);
  return writeChain;
}

async function mutateHousehold(fn, expectedRev, force) {
  const cur = await readData();
  if (!force && cur.rev !== 0 && expectedRev != null && Number(expectedRev) !== cur.rev) {
    const e = new Error("conflict");
    e.conflict = true;
    e.current = cur;
    throw e;
  }
  const payload =
    cur.payload && typeof cur.payload === "object" ? JSON.parse(JSON.stringify(cur.payload)) : null;
  if (!payload || payload.app !== "rent-split" || typeof payload.data !== "object") {
    const err = new Error("No household data to change.");
    err.code = "no_data";
    throw err;
  }
  fn(payload);
  payload.savedAt = new Date().toISOString();
  return writeData(payload, cur.rev, true);
}

async function pruneBackups() {
  const files = (await fsp.readdir(BACKUP_DIR)).filter((f) => f.endsWith(".json")).sort();
  const extra = files.length - MAX_BACKUPS;
  for (let i = 0; i < extra; i++) await fsp.unlink(path.join(BACKUP_DIR, files[i])).catch(() => {});
}

function householdData(doc) {
  const payload = doc && doc.payload;
  if (!payload || typeof payload !== "object") return {};
  return payload.data && typeof payload.data === "object" ? payload.data : {};
}

function tenantDocument(doc, personId) {
  const payload = doc.payload;
  if (
    !payload ||
    typeof payload !== "object" ||
    !payload.data ||
    typeof payload.data !== "object"
  ) {
    return doc;
  }
  const data = payload.data;
  const ledger = Array.isArray(data.ledger)
    ? data.ledger.filter((e) => e && e.personId === personId)
    : [];
  return {
    ...doc,
    payload: {
      ...payload,
      data: {
        ...data,
        ledger,
        presets: [],
      },
    },
  };
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

async function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath.split("?")[0]);
  if (rel === "/" || rel === "") rel = "/index.html";
  const full = path.resolve(PUBLIC_DIR, "." + rel);
  if (full !== PUBLIC_DIR && !full.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  let stat;
  try {
    stat = await fsp.stat(full);
  } catch (e) {
    stat = null;
  }
  if (!stat || !stat.isFile()) {
    const idx = path.join(PUBLIC_DIR, "index.html");
    try {
      await fsp.stat(idx);
    } catch (e) {
      res.writeHead(404).end("Not found");
      return;
    }
    return sendFile(res, idx, req);
  }
  return sendFile(res, full, req, stat);
}

async function sendFile(res, full, req, stat) {
  stat = stat || (await fsp.stat(full));
  const etag = `W/"${stat.size}-${Number(stat.mtimeMs).toString(36)}"`;
  if (req.headers["if-none-match"] === etag) {
    res.writeHead(304).end();
    return;
  }
  const type = MIME[path.extname(full).toLowerCase()] || "application/octet-stream";
  const isHashedAsset = full.includes(`${path.sep}assets${path.sep}`);
  res.writeHead(200, {
    "Content-Type": type,
    "Content-Length": stat.size,
    ETag: etag,
    "Cache-Control": isHashedAsset ? "public, max-age=31536000, immutable" : "no-cache",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin",
  });
  fs.createReadStream(full).pipe(res);
}

const attempts = new Map();
function throttled(ip) {
  const a = attempts.get(ip);
  return !!(a && a.until > Date.now());
}
function noteFailure(ip) {
  const a = attempts.get(ip) || { n: 0, until: 0 };
  a.n += 1;
  if (a.n >= 5) {
    a.until = Date.now() + 60000;
    a.n = 0;
  }
  attempts.set(ip, a);
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, a] of attempts) if (a.until < now && a.n === 0) attempts.delete(ip);
}, 300000).unref();

function pathOf(url) {
  return String(url || "/").split("?")[0];
}

const server = http.createServer(async (req, res) => {
  const url = pathOf(req.url);
  const ip =
    (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "?";

  try {
    if (url === "/api/health") {
      await accounts.ensureLoaded();
      const account = sessionFrom(req);
      const data = account ? householdData(await readData()) : {};
      return json(res, 200, {
        app: "rent-split",
        version: 2,
        authRequired: true,
        authed: !!account,
        session: account ? sessionInfo(account, data) : null,
      });
    }

    if (url === "/api/login" && req.method === "POST") {
      if (throttled(ip)) return json(res, 429, { error: "Too many attempts. Wait a minute." });
      let body = {};
      try {
        body = JSON.parse((await readBody(req)) || "{}");
      } catch (e) {}
      const account = await accounts.authenticate(body.username || "", body.password || "");
      if (!account) {
        noteFailure(ip);
        return json(res, 401, { error: "Wrong username or password" });
      }
      attempts.delete(ip);
      const data = householdData(await readData());
      res.setHeader("Set-Cookie", sessionCookie(makeToken(account)));
      return json(res, 200, { ok: true, session: sessionInfo(account, data) });
    }

    if (url === "/api/logout" && req.method === "POST") {
      res.setHeader("Set-Cookie", "rs_session=; Path=/; HttpOnly; Max-Age=0");
      return json(res, 200, { ok: true });
    }

    if (url.startsWith("/api/")) {
      await accounts.ensureLoaded();
      const account = sessionFrom(req);
      if (!account) return json(res, 401, { error: "Not signed in" });
      const isAdmin = account.role === "admin";

      if (url === "/api/me") {
        const data = householdData(await readData());
        return json(res, 200, sessionInfo(account, data));
      }

      if (url === "/api/rev") {
        const cur = await readData();
        return json(res, 200, { rev: cur.rev, savedAt: cur.savedAt });
      }

      if (url === "/api/data" && req.method === "GET") {
        if (!isAdmin) return json(res, 403, { error: "Admin only" });
        const cur = await readData();
        return json(res, 200, cur);
      }

      if (url === "/api/data" && req.method === "PUT") {
        if (!isAdmin) return json(res, 403, { error: "Admin only" });
        let body;
        try {
          body = JSON.parse((await readBody(req)) || "{}");
        } catch (e) {
          return json(res, 400, { error: "Bad JSON" });
        }
        if (!body || typeof body.payload !== "object" || body.payload === null) {
          return json(res, 400, { error: "Missing payload" });
        }
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

      if (url === "/api/mine" && req.method === "GET") {
        if (isAdmin) {
          const cur = await readData();
          return json(res, 200, cur);
        }
        if (!account.personId) {
          return json(res, 403, { error: "This login is not linked to a person yet." });
        }
        const cur = await readData();
        return json(res, 200, tenantDocument(cur, account.personId));
      }

      if (url === "/api/settle" && req.method === "POST") {
        let body;
        try {
          body = JSON.parse((await readBody(req)) || "{}");
        } catch (e) {
          return json(res, 400, { error: "Bad JSON" });
        }
        const personId = String(body.personId || "");
        const amount = Math.round(Number(body.amount));
        if (!personId || !Number.isFinite(amount) || amount === 0) {
          return json(res, 400, { error: "Need a person and a non-zero amount." });
        }
        if (!isAdmin && personId !== account.personId) {
          return json(res, 403, { error: "You can only record your own settlement." });
        }
        const entry = {
          id: typeof body.id === "string" && body.id ? body.id : "lg" + Date.now().toString(36),
          personId,
          monthKey: typeof body.monthKey === "string" ? body.monthKey : "",
          type: "settle",
          amount,
          date:
            typeof body.date === "string" && body.date
              ? body.date
              : new Date().toISOString().slice(0, 10),
          note: typeof body.note === "string" ? body.note : "",
        };
        try {
          const next = await mutateHousehold(
            (payload) => {
              if (!Array.isArray(payload.data.ledger)) payload.data.ledger = [];
              payload.data.ledger.push(entry);
            },
            body.rev,
            !!body.force,
          );
          return json(res, 200, { rev: next.rev, savedAt: next.savedAt, entry });
        } catch (e) {
          if (e.conflict) return json(res, 409, { error: "conflict", rev: e.current.rev });
          if (e.code === "no_data") return json(res, 400, { error: e.message });
          throw e;
        }
      }

      if (url.startsWith("/api/ledger/") && req.method === "DELETE") {
        const id = decodeURIComponent(url.slice("/api/ledger/".length));
        if (!id) return json(res, 400, { error: "Missing id" });
        try {
          const next = await mutateHousehold(
            (payload) => {
              const ledger = Array.isArray(payload.data.ledger) ? payload.data.ledger : [];
              const entry = ledger.find((e) => e && e.id === id);
              if (!entry) {
                const err = new Error("No such record.");
                err.code = "missing";
                throw err;
              }
              if (!isAdmin) {
                if (entry.personId !== account.personId || entry.type !== "settle") {
                  const err = new Error("You can only undo your own settlements.");
                  err.code = "forbidden";
                  throw err;
                }
              }
              payload.data.ledger = ledger.filter((e) => e && e.id !== id);
            },
            null,
            true,
          );
          return json(res, 200, { rev: next.rev, savedAt: next.savedAt });
        } catch (e) {
          if (e.code === "missing") return json(res, 404, { error: e.message });
          if (e.code === "forbidden") return json(res, 403, { error: e.message });
          if (e.code === "no_data") return json(res, 400, { error: e.message });
          throw e;
        }
      }

      if (url === "/api/accounts" && req.method === "GET") {
        if (!isAdmin) return json(res, 403, { error: "Admin only" });
        return json(res, 200, { accounts: accounts.list().map(accounts.publicOf) });
      }

      if (url === "/api/accounts" && req.method === "POST") {
        if (!isAdmin) return json(res, 403, { error: "Admin only" });
        let body;
        try {
          body = JSON.parse((await readBody(req)) || "{}");
        } catch (e) {
          return json(res, 400, { error: "Bad JSON" });
        }
        try {
          const created = await accounts.create({
            username: body.username,
            password: body.password,
            personId: body.personId || null,
            role: body.role === "admin" ? "admin" : "tenant",
          });
          return json(res, 200, accounts.publicOf(created));
        } catch (e) {
          return json(res, accountErrorStatus(e), { error: e.message });
        }
      }

      if (url.startsWith("/api/accounts/") && (req.method === "PATCH" || req.method === "DELETE")) {
        if (!isAdmin) return json(res, 403, { error: "Admin only" });
        const id = decodeURIComponent(url.slice("/api/accounts/".length));
        if (!id) return json(res, 400, { error: "Missing id" });
        try {
          if (req.method === "DELETE") {
            await accounts.remove(id);
            return json(res, 200, { ok: true });
          }
          let body;
          try {
            body = JSON.parse((await readBody(req)) || "{}");
          } catch (e) {
            return json(res, 400, { error: "Bad JSON" });
          }
          const updated = await accounts.update(id, body);
          return json(res, 200, accounts.publicOf(updated));
        } catch (e) {
          return json(res, accountErrorStatus(e), { error: e.message });
        }
      }

      if (url === "/api/accounts/disable-person" && req.method === "POST") {
        if (!isAdmin) return json(res, 403, { error: "Admin only" });
        let body;
        try {
          body = JSON.parse((await readBody(req)) || "{}");
        } catch (e) {
          return json(res, 400, { error: "Bad JSON" });
        }
        await accounts.disableForPerson(String(body.personId || ""));
        return json(res, 200, { ok: true, accounts: accounts.list().map(accounts.publicOf) });
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

server.listen(PORT, async () => {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  await accounts.ensureSeeded();
  const admin = accounts.list().find((a) => a.role === "admin" && a.enabled);
  console.log(`Rent Split listening on http://localhost:${PORT}`);
  console.log(`  data:     ${DATA_FILE}`);
  console.log(`  accounts: ${accounts.file}`);
  console.log(`  admin:    ${admin ? admin.username : "(none)"}`);
  if (!SECURE_COOKIE) {
    console.log("  note:     set SECURE_COOKIE=1 once you are serving over https");
  }
});
