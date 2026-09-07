"use strict";

/**
 * Per-person accounts, kept beside the household JSON rather than inside it.
 * Password hashes never go to the browser.
 *
 * @typedef {"admin" | "tenant"} AccountRole
 *
 * @typedef {object} Account
 * @property {string} id
 * @property {string} username
 * @property {string | null} personId
 * @property {string} passwordHash
 * @property {string} salt
 * @property {AccountRole} role
 * @property {boolean} enabled
 * @property {number} tokenVersion
 * @property {string | null} passwordSetAt
 *
 * @typedef {object} PublicAccount
 * @property {string} id
 * @property {string} username
 * @property {string | null} personId
 * @property {AccountRole} role
 * @property {boolean} enabled
 * @property {string | null} passwordSetAt
 *
 * @typedef {object} AccountsFile
 * @property {1} v
 * @property {Account[]} accounts
 */

const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const SCRYPT_OPTS = { N: 16384, r: 8, p: 1 };
const KEYLEN = 32;
const USERNAME_RE = /^[a-z0-9_]{2,32}$/;

/**
 * @param {unknown} a
 * @param {unknown} b
 */
function timingSafeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) {
    crypto.timingSafeEqual(ab, ab);
    return false;
  }
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * @param {string} raw
 */
function normaliseUsername(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase();
}

/**
 * @param {string} username
 */
function assertUsername(username) {
  if (!USERNAME_RE.test(username)) {
    const err = new Error("Username must be 2–32 letters, numbers or underscores.");
    err.code = "bad_username";
    throw err;
  }
}

/**
 * @param {string} password
 * @param {string} [saltHex]
 */
function hashPassword(password, saltHex) {
  const salt = saltHex || crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), salt, KEYLEN, SCRYPT_OPTS).toString("hex");
  return { salt, hash };
}

/**
 * @param {string} password
 * @param {Account} account
 */
function passwordMatches(password, account) {
  const { hash } = hashPassword(password, account.salt);
  return timingSafeEqual(hash, account.passwordHash);
}

/**
 * @param {Account} account
 * @returns {PublicAccount}
 */
function publicOf(account) {
  return {
    id: account.id,
    username: account.username,
    personId: account.personId,
    role: account.role,
    enabled: account.enabled,
    passwordSetAt: account.passwordSetAt,
  };
}

/**
 * @param {unknown} raw
 * @returns {Account | null}
 */
function parseAccount(raw) {
  if (!raw || typeof raw !== "object") return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  if (typeof o.id !== "string" || typeof o.username !== "string") return null;
  if (typeof o.passwordHash !== "string" || typeof o.salt !== "string") return null;
  const role = o.role === "admin" || o.role === "tenant" ? o.role : null;
  if (!role) return null;
  return {
    id: o.id,
    username: normaliseUsername(o.username),
    personId: typeof o.personId === "string" && o.personId ? o.personId : null,
    passwordHash: o.passwordHash,
    salt: o.salt,
    role,
    enabled: o.enabled !== false,
    tokenVersion: Number.isFinite(Number(o.tokenVersion)) ? Number(o.tokenVersion) : 1,
    passwordSetAt: typeof o.passwordSetAt === "string" ? o.passwordSetAt : null,
  };
}

/**
 * @param {string} dataDir
 * @param {{ seedUser: string, seedPassword: string }} seed
 */
function createAccountStore(dataDir, seed) {
  const file = path.join(dataDir, "accounts.json");
  /** @type {AccountsFile} */
  let cached = { v: 1, accounts: [] };
  let loaded = false;
  let writeChain = Promise.resolve();

  async function readFile() {
    try {
      const raw = await fsp.readFile(file, "utf8");
      const o = JSON.parse(raw);
      const accounts = Array.isArray(o?.accounts)
        ? o.accounts.map(parseAccount).filter(Boolean)
        : [];
      cached = { v: 1, accounts: /** @type {Account[]} */ (accounts) };
    } catch (e) {
      if (e && e.code === "ENOENT") cached = { v: 1, accounts: [] };
      else throw e;
    }
    loaded = true;
    return cached;
  }

  async function writeFile(next) {
    const run = async () => {
      await fsp.mkdir(dataDir, { recursive: true });
      const text = JSON.stringify(next, null, 2);
      const tmp = file + ".tmp";
      await fsp.writeFile(tmp, text, { encoding: "utf8", mode: 0o600 });
      await fsp.rename(tmp, file);
      try {
        fs.chmodSync(file, 0o600);
      } catch {
        /* ignore */
      }
      cached = next;
      loaded = true;
    };
    writeChain = writeChain.then(run, run);
    await writeChain;
    return cached;
  }

  async function ensureLoaded() {
    if (!loaded) await readFile();
    return cached;
  }

  /**
   * @param {(file: AccountsFile) => AccountsFile} fn
   */
  async function mutate(fn) {
    await ensureLoaded();
    const next = fn({ v: 1, accounts: cached.accounts.map((a) => ({ ...a })) });
    return writeFile(next);
  }

  async function ensureSeeded() {
    await ensureLoaded();
    if (cached.accounts.length) return cached;
    const username = normaliseUsername(seed.seedUser);
    assertUsername(username);
    if (!seed.seedPassword || String(seed.seedPassword).length < 4) {
      const err = new Error("Seed admin password is too short.");
      err.code = "bad_password";
      throw err;
    }
    const { salt, hash } = hashPassword(seed.seedPassword);
    const admin = {
      id: "acct_" + crypto.randomBytes(8).toString("hex"),
      username,
      personId: null,
      passwordHash: hash,
      salt,
      role: /** @type {AccountRole} */ ("admin"),
      enabled: true,
      tokenVersion: 1,
      passwordSetAt: new Date().toISOString(),
    };
    return writeFile({ v: 1, accounts: [admin] });
  }

  function list() {
    return cached.accounts.slice();
  }

  /**
   * @param {string} id
   */
  function getById(id) {
    return cached.accounts.find((a) => a.id === id) || null;
  }

  /**
   * @param {string} username
   */
  function getByUsername(username) {
    const u = normaliseUsername(username);
    return cached.accounts.find((a) => a.username === u) || null;
  }

  /**
   * @param {string} username
   * @param {string} password
   */
  async function authenticate(username, password) {
    await ensureLoaded();
    const account = getByUsername(username);
    if (!account || !account.enabled) return null;
    if (!passwordMatches(password, account)) return null;
    return account;
  }

  /**
   * @param {{ username: string, password: string, personId?: string | null, role: AccountRole }} body
   */
  async function create(body) {
    const username = normaliseUsername(body.username);
    assertUsername(username);
    if (!body.password || String(body.password).length < 4) {
      const err = new Error("Password must be at least 4 characters.");
      err.code = "bad_password";
      throw err;
    }
    if (body.role !== "admin" && body.role !== "tenant") {
      const err = new Error("Role must be admin or tenant.");
      err.code = "bad_role";
      throw err;
    }
    if (body.role === "tenant" && !body.personId) {
      const err = new Error("A tenant login has to be linked to a person.");
      err.code = "need_person";
      throw err;
    }
    await mutate((file) => {
      if (file.accounts.some((a) => a.username === username)) {
        const err = new Error("That username is already taken.");
        err.code = "username_taken";
        throw err;
      }
      const { salt, hash } = hashPassword(body.password);
      /** @type {Account} */
      const account = {
        id: "acct_" + crypto.randomBytes(8).toString("hex"),
        username,
        personId: body.personId || null,
        passwordHash: hash,
        salt,
        role: body.role,
        enabled: true,
        tokenVersion: 1,
        passwordSetAt: new Date().toISOString(),
      };
      if (body.role === "admin") {
        const unlinked = file.accounts.find((a) => a.role === "admin" && a.enabled && !a.personId);
        if (unlinked) {
          const err = new Error(
            "Link the current admin to a person before handing admin to someone else.",
          );
          err.code = "need_person";
          throw err;
        }
      }
      const accounts =
        body.role === "admin"
          ? file.accounts.map((a) => ({ ...a, role: /** @type {AccountRole} */ ("tenant") }))
          : file.accounts.slice();
      accounts.push(account);
      return { v: 1, accounts };
    });
    const created = getByUsername(username);
    if (!created) throw new Error("Failed to create account.");
    return created;
  }

  /**
   * @param {string} id
   * @param {{ password?: string, personId?: string | null, role?: AccountRole, enabled?: boolean, username?: string }} patch
   */
  async function update(id, patch) {
    await mutate((file) => {
      const idx = file.accounts.findIndex((a) => a.id === id);
      if (idx < 0) {
        const err = new Error("No such account.");
        err.code = "missing";
        throw err;
      }
      const cur = file.accounts[idx];
      /** @type {Account} */
      const next = { ...cur };
      if (patch.username !== undefined) {
        const username = normaliseUsername(patch.username);
        assertUsername(username);
        if (file.accounts.some((a) => a.id !== id && a.username === username)) {
          const err = new Error("That username is already taken.");
          err.code = "username_taken";
          throw err;
        }
        next.username = username;
      }
      if (patch.personId !== undefined) {
        next.personId = patch.personId || null;
      }
      if (patch.password) {
        if (String(patch.password).length < 4) {
          const err = new Error("Password must be at least 4 characters.");
          err.code = "bad_password";
          throw err;
        }
        const { salt, hash } = hashPassword(patch.password);
        next.salt = salt;
        next.passwordHash = hash;
        next.passwordSetAt = new Date().toISOString();
        next.tokenVersion = (next.tokenVersion || 1) + 1;
      }
      if (typeof patch.enabled === "boolean") {
        if (patch.enabled === false && cur.role === "admin") {
          const others = file.accounts.filter(
            (a) => a.id !== id && a.enabled && a.role === "admin",
          );
          if (!others.length) {
            const err = new Error("Cannot disable the only admin.");
            err.code = "last_admin";
            throw err;
          }
        }
        next.enabled = patch.enabled;
        if (patch.enabled === false) next.tokenVersion = (next.tokenVersion || 1) + 1;
      }
      if (patch.role === "admin" || patch.role === "tenant") {
        if (patch.role === "tenant" && cur.role === "admin") {
          const others = file.accounts.filter(
            (a) => a.id !== id && a.enabled && a.role === "admin",
          );
          if (!others.length && patch.role === "tenant") {
            const err = new Error("Promote someone else to admin first.");
            err.code = "last_admin";
            throw err;
          }
        }
        next.role = patch.role;
      }
      if (next.role === "tenant" && !next.personId) {
        const err = new Error("A tenant login has to be linked to a person.");
        err.code = "need_person";
        throw err;
      }
      const accounts = file.accounts.slice();
      accounts[idx] = next;
      if (next.role === "admin" && next.enabled) {
        for (let i = 0; i < accounts.length; i++) {
          const a = accounts[i];
          if (a && a.id !== id && a.role === "admin") {
            if (!a.personId) {
              const err = new Error(
                "Link the current admin to a person before handing admin to someone else.",
              );
              err.code = "need_person";
              throw err;
            }
            accounts[i] = { ...a, role: "tenant" };
          }
        }
      }
      return { v: 1, accounts };
    });
    const updated = getById(id);
    if (!updated) throw new Error("No such account.");
    return updated;
  }

  /**
   * @param {string} id
   */
  async function remove(id) {
    await mutate((file) => {
      const cur = file.accounts.find((a) => a.id === id);
      if (!cur) {
        const err = new Error("No such account.");
        err.code = "missing";
        throw err;
      }
      if (cur.role === "admin" && cur.enabled) {
        const others = file.accounts.filter((a) => a.id !== id && a.enabled && a.role === "admin");
        if (!others.length) {
          const err = new Error("Cannot remove the only admin.");
          err.code = "last_admin";
          throw err;
        }
      }
      return { v: 1, accounts: file.accounts.filter((a) => a.id !== id) };
    });
  }

  /**
   * @param {string} personId
   */
  async function disableForPerson(personId) {
    if (!personId) return;
    await mutate((file) => ({
      v: 1,
      accounts: file.accounts.map((a) => {
        if (a.personId !== personId || !a.enabled) return a;
        if (a.role === "admin") return a;
        return { ...a, enabled: false, tokenVersion: (a.tokenVersion || 1) + 1 };
      }),
    }));
  }

  return {
    file,
    ensureSeeded,
    ensureLoaded,
    list,
    getById,
    getByUsername,
    authenticate,
    create,
    update,
    remove,
    disableForPerson,
    publicOf,
  };
}

module.exports = {
  createAccountStore,
  normaliseUsername,
  publicOf,
  USERNAME_RE,
};
