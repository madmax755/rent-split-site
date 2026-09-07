
  "use strict";

  // ============================================================
  //  TWEAKS (appearance) — unchanged from v1
  // ============================================================
  const TWEAKS_DEFAULTS = /*EDITMODE-BEGIN*/{
    "theme": "auto",
    "accent": "#007aff",
    "density": "comfy"
  }/*EDITMODE-END*/;
  // Browser storage throws outright on opaque origins — a data: URL, a
  // sandboxed frame, Safari with site data blocked. Everything goes
  // through here so a storage failure degrades to "nothing saved"
  // rather than taking the whole app down.
  const LS = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
    available() { try { localStorage.setItem("__t", "1"); localStorage.removeItem("__t"); return true; } catch (e) { return false; } },
  };

  let tweaks = { ...TWEAKS_DEFAULTS };
  try { tweaks = { ...TWEAKS_DEFAULTS, ...(JSON.parse(LS.get("rs-tweaks") || "{}")) }; } catch (e) {}

  const ACCENTS = [
    { name: "Blue",   v: "#007aff", dark: "#0a84ff" },
    { name: "Purple", v: "#af52de", dark: "#bf5af2" },
    { name: "Pink",   v: "#ff2d55", dark: "#ff375f" },
    { name: "Orange", v: "#ff9500", dark: "#ff9f0a" },
    { name: "Green",  v: "#34c759", dark: "#30d158" },
    { name: "Teal",   v: "#30b0c7", dark: "#40c8e0" },
  ];

  function hexToRgba(hex, a) {
    const m = hex.replace("#", ""); const n = parseInt(m, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  function applyTheme() {
    const root = document.documentElement;
    let t = tweaks.theme;
    if (t === "auto") t = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    root.setAttribute("data-theme", t);
    const isDark = t === "dark";
    const entry = ACCENTS.find(a => a.v === tweaks.accent || a.dark === tweaks.accent) || ACCENTS[0];
    const accentVal = isDark ? entry.dark : entry.v;
    root.style.setProperty("--accent", accentVal);
    root.style.setProperty("--accent-soft", hexToRgba(accentVal, isDark ? 0.18 : 0.10));
    root.style.fontSize = tweaks.density === "compact" ? "14px" : "";
    document.getElementById("theme-icon").innerHTML = isDark
      ? '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>'
      : '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>';
    const mt = document.querySelector('meta[name="theme-color"]');
    if (mt) mt.setAttribute("content", isDark ? "#000000" : "#f2f2f7");
    document.querySelectorAll("[data-theme-set]").forEach(b => b.classList.toggle("active", b.dataset.themeSet === tweaks.theme));
    document.querySelectorAll("[data-density-set]").forEach(b => b.classList.toggle("active", b.dataset.densitySet === tweaks.density));
    document.querySelectorAll(".tw-swatch").forEach(s => s.classList.toggle("active", s.dataset.accent === entry.v));
  }
  function saveTweaks() {
    LS.set("rs-tweaks", JSON.stringify(tweaks));
    try { window.parent.postMessage({ type: '__edit_mode_set_keys', edits: tweaks }, '*'); } catch (e) {}
  }

  // ============================================================
  //  DEFAULTS
  // ============================================================
  const MAX_PEOPLE = 8;
  const PERSON_COLORS = ["#ff9f0a", "#30b0c7", "#bf5af2", "#34c759", "#ff375f", "#5e5ce6", "#ff6482", "#66d4cf"];

  // Dimensions carried over unchanged from the original sheet.
  const DEFAULT_ROOMS = [
    { id: "bed1",    name: "Master Bedroom", w: 3.89, l: 3.00, weight: 1.0, communal: false },
    { id: "bed2",    name: "2nd Bedroom",    w: 3.89, l: 2.41, weight: 1.0, communal: false },
    { id: "bed3",    name: "3rd Bedroom",    w: 3.89, l: 1.96, weight: 1.0, communal: false },
    { id: "bath1",   name: "Bathroom 1",       w: 2.00, l: 1.50, weight: 0.5, communal: true  },
    { id: "bath2",   name: "Bathroom 2",       w: 1.50, l: 1.20, weight: 0.5, communal: true  },
    { id: "kitchen", name: "Kitchen",          w: 4.26, l: 2.69, weight: 1.0, communal: true  },
    { id: "lounge",  name: "Lounge",           w: 4.78, l: 4.26, weight: 1.0, communal: true  },
  ];
  // v1 room ids map onto these; "reception" was renamed to "lounge".
  const V1_ROOM_RENAMES = { reception: "lounge" };
  const V1_ROOM_NAMES = {
    bed1: "Master Bedroom", bed2: "2nd Bedroom", bed3: "3rd Bedroom", lounge: "Lounge",
  };

  // Person index in v1 -> bedroom, preserving the original assignment
  // (largest room shared by the couple at slots 3 and 4).
  // A person is now just a name. Where they sleep and when they are here
  // is recorded on their stints, and nowhere else.
  const DEFAULT_PEOPLE = [
    { id: "p1", name: "Ach",   isPayer: true,  archived: false },
    { id: "p2", name: "Joe",   isPayer: false, archived: false },
    { id: "p3", name: "Alice", isPayer: false, archived: false },
    { id: "p4", name: "Max",   isPayer: false, archived: false },
  ];
  // Which bedroom each default person starts in, used only to seed the
  // very first month. After that, stints carry forward.
  const DEFAULT_ROOM_OF = { p1: "bed2", p2: "bed3", p3: "bed1", p4: "bed1" };

  const DEFAULT_BILLS = [
    { id: "energy",     name: "Energy (gas & electric)", est: 195, payers: null },
    { id: "water",      name: "Water",                   est: 36,  payers: null },
    { id: "wifi",       name: "Wi-Fi",                   est: 35,  payers: null },
    { id: "insurance",  name: "Renters insurance",       est: 15,  payers: null },
    { id: "counciltax", name: "Council tax",             est: 200, payers: null },
  ];

  const DEFAULT_RENT = 3500, DEFAULT_CATCHALL = 14.30, DEFAULT_CATCHALL_WEIGHT = 0.5;


  // ============================================================
  //  STATE
  // ============================================================
  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  const state = {
    v: 2,
    currency: "£",
    rent: DEFAULT_RENT,
    catchall: DEFAULT_CATCHALL,
    catchallWeight: DEFAULT_CATCHALL_WEIGHT,
    rooms: DEFAULT_ROOMS.map(r => ({ ...r })),
    people: DEFAULT_PEOPLE.map(p => ({ ...p })),
    bills: DEFAULT_BILLS.map(b => ({ ...b })),
    months: {},
    ledger: [],
    presets: [],
    activePresetName: null,
    currentMonth: todayKey(),
    activeTab: "month",
    sectionsOpen: { mbills: true, mstmt: true, mnote: false, stintlist: true, balnow: true, balhist: false,
                    hpeople: true, hbills: true, people: true, property: false, bills: false, data: false, howbody: true },
    openStatements: {},
  };

  const SNAPSHOT_FIELDS = ["currency", "rent", "catchall", "catchallWeight", "rooms", "people", "bills", "months", "ledger"];
  const deep = o => JSON.parse(JSON.stringify(o));
  function snapshotCurrent() {
    const s = {}; SNAPSHOT_FIELDS.forEach(k => s[k] = deep(state[k])); return s;
  }
  function applySnapshot(snap) {
    SNAPSHOT_FIELDS.forEach(k => { if (snap[k] !== undefined) state[k] = deep(snap[k]); });
  }

  let uidCounter = 0;
  function uid(prefix) {
    uidCounter += 1;
    return `${prefix}${Date.now().toString(36)}${uidCounter.toString(36)}`;
  }

  // ============================================================
  //  STORAGE ADAPTERS
  //  One interface, three backings. Everything above this line is
  //  storage-agnostic, so adding a real backend later is contained.
  // ============================================================
  // ---- the storage contract ----------------------------------------
  // These three constants are the whole promise the app makes to your
  // data. STORAGE_KEY must NEVER change again: it is how a future build
  // of this page — reskinned, restructured, self-hosted, whatever —
  // finds data written by this one. Versioning lives INSIDE the payload
  // as `schema`, never in the key, so editing the HTML can't orphan it.
  //
  // Saved shape:
  //   { app: "rent-split", schema: <n>, savedAt: <iso>, data: { … } }
  //
  // To change the shape later: bump SCHEMA, add a MIGRATIONS[oldNumber]
  // function that upgrades a payload by exactly one step, and old saves
  // keep loading. Never rename or repurpose an existing field in place.
  const APP_ID = "rent-split";
  const SCHEMA = 4;
  const STORAGE_KEY = "rent-split";
  const BACKUP_KEY = "rent-split.previous";
  const LEGACY_KEYS = ["rent-split-v2"];
  const V1_KEYS = ["rent-split-apple-v1", "rent-split-thomas-more-v5"];

  // MIGRATIONS[n] takes a schema-n payload and returns a schema-(n+1) one.
  // They run in sequence, so a schema-1 save walks all the way up.
  const MIGRATIONS = {
    3: function (d) {
      // Schema 4 collapses the model to one kind of person and one place
      // for dates. Stints are now the only record of who is in the house;
      // move-in/move-out, the resident/visitor split, the per-person away
      // rule and the usage/fixed classification are all gone. Everything
      // is prorated across stint days, identically for everybody.
      (d.people || []).forEach(p => {
        delete p.role; delete p.awayBasis; delete p.fixedBasis;
        delete p.moveIn; delete p.moveOut; delete p.roomId;
      });
      (d.bills || []).forEach(b => { delete b.kind; });
      Object.values(d.months || {}).forEach(M => {
        // An "away" stint meant liable-but-absent, and was already charged
        // in full, so it simply becomes an ordinary stint.
        (M.stints || []).forEach(st => { delete st.here; });
        (M.oneOffs || []).forEach(x => { delete x.kind; });
      });
      return d;
    },
    2: function (d) {
      // v2 stored the away rule per person as fixedBasis; schema 3 renamed
      // it to awayBasis and made "pays everything" the household rule.
      const map = { prorated: "all", full: "all", exempt: "visitor" };
      (d.people || []).forEach(p => {
        if (p.awayBasis === undefined) p.awayBasis = map[p.fixedBasis] || "all";
        delete p.fixedBasis;
      });
      const names = { bed1: "Master Bedroom", bed2: "2nd Bedroom", bed3: "3rd Bedroom" };
      (d.rooms || []).forEach(r => { if (names[r.id]) r.name = names[r.id]; });
      return d;
    },
  };

  //  interface Adapter {
  //    name: string,
  //    shared: boolean,          // do other people see these writes?
  //    load(): Promise<object|null>,
  //    save(data): Promise<void>,
  //    describe(): string
  //  }

  function LocalAdapter() {
    return {
      name: "local",
      shared: false,
      async load() {
        for (const k of [STORAGE_KEY, ...LEGACY_KEYS]) {
          try {
            const raw = LS.get(k);
            if (raw) return JSON.parse(raw);
          } catch (e) {}
        }
        return null;
      },
      async save(data) {
        // Keep the previous good payload around: a bad deploy or a botched
        // import can then be undone instead of being the end of the record.
        const prev = LS.get(STORAGE_KEY);
        if (prev) LS.set(BACKUP_KEY, prev);
        if (!LS.set(STORAGE_KEY, JSON.stringify(data))) throw new Error("Browser storage is full or blocked.");
      },
      describe() {
        return LS.available()
          ? "Saved in this browser only. Nobody else can see it, and clearing site data will erase it — take an export now and then."
          : "This browser is refusing to store anything (private mode, blocked site data, or opened in a way that has no storage). Nothing you type here will survive a reload — use Export to keep it.";
      },
    };
  }

  // Shared storage when the page is running as a published Artifact.
  // State lives in a JSON island in the document; saving republishes the
  // page with a new island, and every open view picks it up.
  function ArtifactAdapter(api) {
    let template = null;
    async function getTemplate() {
      if (template) return template;
      const res = await fetch(location.href, { cache: "no-store" });
      template = await res.text();
      return template;
    }
    return {
      name: "artifact",
      shared: true,
      async load() {
        const el = document.getElementById("seed-data");
        if (!el || !el.textContent.trim()) return null;
        try { return JSON.parse(el.textContent); } catch (e) { return null; }
      },
      async save(data) {
        const src = await getTemplate();
        const json = JSON.stringify(data).replace(/<\//g, "<\\/");
        const open = '<script id="seed-data" type="application/json">';
        const i = src.indexOf(open);
        // Refuse to republish anything that isn't recognisably this app —
        // a mangled publish would break the page for everybody with the link.
        if (i < 0 || src.indexOf('id="tabs"') < 0 || src.indexOf("computeMonth") < 0) {
          throw new Error("The page source doesn't look right, so nothing was published. Export a backup instead.");
        }
        const j = src.indexOf("</" + "script>", i);
        const next = src.slice(0, i + open.length) + json + src.slice(j);
        template = next;
        await api.publish(next);
      },
      describe() {
        return "Shared. Everyone with the link sees what you save here, and their page updates to match. Saves are last-one-wins, so keep data entry to one person.";
      },
    };
  }

  // Talks to the little Node server in this repo (see server.js). The
  // server owns the data; this browser keeps a localStorage copy as a
  // read-only fallback for when the network is down.
  function HttpAdapter(base) {
    let rev = null;
    const url = path => base.replace(/\/$/, "") + path;
    async function req(path, opts) {
      const r = await fetch(url(path), Object.assign({ credentials: "same-origin" }, opts || {}));
      if (r.status === 401) { const e = new Error("Not signed in"); e.needAuth = true; throw e; }
      return r;
    }
    return {
      name: "server",
      shared: true,
      autoPush: true,
      async load() {
        const r = await req("/api/data");
        if (!r.ok) throw new Error("Server returned " + r.status);
        const j = await r.json();
        rev = j.rev;
        return j.payload;
      },
      async save(data, force) {
        const r = await req("/api/data", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rev, payload: data, force: !!force }),
        });
        if (r.status === 409) {
          const e = new Error("Someone else saved first");
          e.conflict = true;
          throw e;
        }
        if (!r.ok) throw new Error("Server returned " + r.status);
        const j = await r.json();
        rev = j.rev;
      },
      async currentRev() {
        try { const r = await req("/api/rev"); if (!r.ok) return null; return (await r.json()).rev; }
        catch (e) { return null; }
      },
      knownRev() { return rev; },
      async login(password) {
        const r = await fetch(url("/api/login"), {
          method: "POST", credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password }),
        });
        return r.ok;
      },
      async logout() {
        try { await fetch(url("/api/logout"), { method: "POST", credentials: "same-origin" }); } catch (e) {}
      },
      describe() {
        return "Stored on your own server. Everyone who opens the site sees the same data, and changes are saved automatically. A copy is kept in this browser in case the server is unreachable.";
      },
    };
  }

  // Stub. Implement these three methods against any backend — Supabase,
  // Firebase, a plain JSON endpoint — and the rest of the app is unchanged.
  // Nothing above the adapter boundary knows where the data lives.
  //
  //   function SupabaseAdapter(url, anonKey, householdId) {
  //     const h = { apikey: anonKey, Authorization: `Bearer ${anonKey}`, "Content-Type": "application/json" };
  //     return {
  //       name: "supabase", shared: true,
  //       async load() {
  //         const r = await fetch(`${url}/rest/v1/households?id=eq.${householdId}&select=data`, { headers: h });
  //         const rows = await r.json();
  //         return rows[0] ? rows[0].data : null;
  //       },
  //       async save(data) {
  //         await fetch(`${url}/rest/v1/households?id=eq.${householdId}`, {
  //           method: "PATCH", headers: h, body: JSON.stringify({ data })
  //         });
  //       },
  //       describe() { return "Shared through Supabase."; },
  //     };
  //   }

  const Store = {
    adapter: LocalAdapter(),
    dirty: false,
    lastError: "",
    needAuth: false,
    async init() {
      // A server, if there is one, wins: it is the shared source of truth.
      if (location.protocol === "http:" || location.protocol === "https:") {
        try {
          const r = await fetch("/api/health", { credentials: "same-origin" });
          if (r.ok) {
            const h = await r.json();
            if (h && h.app === "rent-split") {
              this.adapter = HttpAdapter("");
              this.needAuth = !h.authed && !!h.authRequired;
              return;
            }
          }
        } catch (e) { /* no server here — carry on */ }
      }
      try {
        if (window.claude && typeof window.claude.use === "function") {
          const api = await window.claude.use("artifact");
          if (api && typeof api.publish === "function") this.adapter = ArtifactAdapter(api);
        }
      } catch (e) { /* not running as an artifact — local it is */ }
    },
    async load() {
      let data = null;
      try { data = await this.adapter.load(); } catch (e) {}
      if (!data && this.adapter.name !== "local") {
        try { data = await LocalAdapter().load(); } catch (e) {}
      }
      return data;
    },
    readOnly: false,
    pushTimer: null,
    pushing: false,
    // Writes to this browser's own copy only — no dirty flag, no server
    // push. Used for the initial load/normalise pass, where the data on
    // screen already matches what was just read and there is nothing new
    // to tell anyone else about.
    saveLocal() {
      if (this.readOnly) return;
      // save() is async, so swallow the rejection too — a browser with no
      // usable storage must not take the app down with it.
      try { LocalAdapter().save(serialize()).catch(() => this.warnNoStorage()); }
      catch (e) { this.warnNoStorage(); }
    },
    save() {
      if (this.readOnly) return;   // we could not read what is there; do not clobber it
      // Local writes are synchronous and cheap; shared writes are explicit.
      this.saveLocal();
      if (this.adapter.shared) {
        this.dirty = true;
        paintSyncDot();
        // A real server saves by itself; the artifact needs a deliberate publish.
        if (this.adapter.autoPush) {
          clearTimeout(this.pushTimer);
          this.pushTimer = setTimeout(() => this.push().catch(() => {}), 1200);
        }
      }
    },
    warned: false,
    warnNoStorage() {
      if (this.warned) return;
      this.warned = true;
      setTimeout(() => toast("This browser won't save anything — export a backup before you close the tab."), 900);
    },
    async push(force) {
      if (this.pushing) return;
      this.pushing = true;
      try {
        await this.adapter.save(serialize(), force);
        this.dirty = false;
        this.lastError = "";
      } catch (e) {
        if (e && e.needAuth) {
          this.needAuth = true;
          this.lastError = "Signed out.";
          showLogin();
        } else if (e && e.conflict) {
          this.lastError = "Someone else saved first.";
          const keepMine = confirm(
            "Somebody else saved changes while you were editing.\n\n" +
            "OK  — keep my version and overwrite theirs\n" +
            "Cancel — throw mine away and load theirs");
          if (keepMine) { this.pushing = false; return this.push(true); }
          const fresh = await this.adapter.load();
          if (fresh) { hydrate(fresh); render(); }
          this.dirty = false;
        } else {
          this.lastError = (e && e.message) ? e.message : "Could not reach the server.";
        }
        throw e;
      } finally {
        this.pushing = false;
        paintSyncDot();
        const box = document.getElementById("storage-status");
        if (box) renderData();
      }
    },
    // Notice when somebody else saves, and pick it up.
    startPolling() {
      if (!this.adapter.shared || !this.adapter.currentRev) return;
      setInterval(async () => {
        if (this.dirty || this.pushing || this.needAuth) return;
        const server = await this.adapter.currentRev();
        if (server == null || server === this.adapter.knownRev()) return;
        try {
          const fresh = await this.adapter.load();
          if (fresh && hydrate(fresh) === true) { render(); toast("Updated — somebody else made a change."); }
        } catch (e) {}
      }, 12000);
    },
  };

  // The payload, without the envelope.
  function serializeData() {
    const out = {};
    SNAPSHOT_FIELDS.forEach(k => out[k] = state[k]);
    out.presets = state.presets;
    out.activePresetName = state.activePresetName;
    out.currentMonth = state.currentMonth;
    out.sectionsOpen = state.sectionsOpen;
    return out;
  }
  function serialize() {
    return { app: APP_ID, schema: SCHEMA, savedAt: new Date().toISOString(), data: serializeData() };
  }

  // Accepts anything this app has ever written — a current envelope, a bare
  // pre-envelope object, or a payload from the original app — and returns it
  // upgraded to the current schema.
  let loadNote = "";
  // Set true by hydrate() whenever the loaded data was upgraded from an
  // older schema (or came from the original app). Boot uses this to decide
  // whether the upgraded shape is worth writing straight back — as opposed
  // to a plain, unchanged load, which should never trigger its own save.
  let lastHydrateChanged = false;
  function unwrap(o) {
    if (!o || typeof o !== "object") return null;
    let schema, data;
    if (o.app === APP_ID && typeof o.schema === "number") {
      schema = o.schema; data = o.data || {};
    } else if (o.months || (o.v === 2 && o.people)) {
      schema = 2; data = o;                       // pre-envelope save
    } else if (o.people || o.rooms) {
      return { v1: o };                           // the original app
    } else {
      return null;
    }
    if (schema > SCHEMA) return { tooNew: true, schema };
    const fromSchema = schema;
    while (schema < SCHEMA) {
      const step = MIGRATIONS[schema];
      if (step) { try { data = step(data) || data; } catch (e) {} }
      schema += 1;
    }
    return { data, schema, migrated: schema !== fromSchema };
  }

  function hydrate(o) {
    const r = unwrap(o);
    lastHydrateChanged = false;
    if (!r) return false;
    if (r.tooNew) {
      // Written by a newer build than this one. Refuse rather than guess,
      // and leave what is on disk alone.
      loadNote = `This data was saved by a newer version of the app (format ${r.schema}; this build reads ${SCHEMA}). Nothing was loaded and nothing has been overwritten — update the page, or restore from an export.`;
      return "tooNew";
    }
    if (r.v1) { migrateFromV1(r.v1); lastHydrateChanged = true; return true; }
    const d = r.data;
    SNAPSHOT_FIELDS.forEach(k => { if (d[k] !== undefined) state[k] = deep(d[k]); });
    if (Array.isArray(d.presets)) state.presets = d.presets;
    if (d.activePresetName) state.activePresetName = d.activePresetName;
    if (typeof d.currentMonth === "string") state.currentMonth = d.currentMonth;
    if (d.sectionsOpen) state.sectionsOpen = { ...state.sectionsOpen, ...d.sectionsOpen };
    normalise();
    lastHydrateChanged = !!r.migrated;
    return true;
  }

  function paintSyncDot() {
    const d = document.getElementById("sync-dot");
    if (!d) return;
    const shared = Store.adapter.shared;
    const bad = !!Store.lastError;
    d.className = "sync-dot" + (bad ? " dirty" : shared ? (Store.dirty ? " dirty" : " live") : "");
    d.title = bad ? Store.lastError
      : shared ? (Store.dirty ? "Saving…" : "Saved on the server")
      : "Saved in this browser";
  }

  // ============================================================
  //  MIGRATION FROM v1
  // ============================================================
  function readV1() {
    for (const k of V1_KEYS) {
      try {
        const raw = LS.get(k);
        if (raw) { const o = JSON.parse(raw); if (o && (o.people || o.rooms)) return o; }
      } catch (e) {}
    }
    return null;
  }

  // Turns a v1 payload into v2 state. Rooms keep their dimensions, the
  // three bedrooms and the reception room are renamed, gas and electric
  // are folded into a single energy line, and renters insurance is added.
  function migrateFromV1(o) {
    const notes = [];

    if (typeof o.rent === "number") state.rent = o.rent;
    if (typeof o.catchall === "number") state.catchall = o.catchall;
    if (typeof o.catchallWeight === "number") state.catchallWeight = o.catchallWeight;
    if (o.currency) state.currency = o.currency;

    // --- rooms ---
    if (Array.isArray(o.rooms) && o.rooms.length) {
      state.rooms = o.rooms.map(r => {
        const id = V1_ROOM_RENAMES[r.id] || r.id;
        return {
          id,
          name: V1_ROOM_NAMES[id] || r.name || id,
          w: +r.w || 0, l: +r.l || 0,
          weight: typeof r.weight === "number" ? r.weight : 1,
          communal: !!r.communal,
        };
      });
      notes.push(`${state.rooms.length} rooms`);
    }

    // --- people (index order preserved, so room assignment survives) ---
    const names = Array.isArray(o.people) ? o.people : [];
    const assignedRoom = idx => {
      const room = (o.rooms || []).find(r => !r.communal && Array.isArray(r.assigned) && r.assigned[idx]);
      if (!room) return (state.rooms.find(r => !r.communal) || {}).id || "bed1";
      return V1_ROOM_RENAMES[room.id] || room.id;
    };
    const migrated = [];
    names.forEach((nm, i) => {
      if (!nm || !nm.trim()) return;
      migrated.push({ id: `p${i + 1}`, name: nm.trim(), isPayer: false, archived: false, _room: assignedRoom(i) });
    });
    if (migrated.length) {
      state.people = migrated;
      // Whoever fronts the money — matched by name, else the first person.
      const payer = migrated.find(p => /^(ach|arch|achyut)/i.test(p.name)) || migrated[0];
      payer.isPayer = true;

      notes.push(`${migrated.length} people`);
    }

    // --- bills: gas + electric collapse into one energy line ---
    // Remember where v1 had each person, so the first month can be seeded.
    const seedRooms = {};
    state.people.forEach(p => { if (p._room) { seedRooms[p.id] = p._room; delete p._room; } });
    state._seedRooms = seedRooms;

    if (Array.isArray(o.bills) && o.bills.length) {
      const headcount = Math.max(1, Math.min(state.people.length, 5));
      const monthlyOf = b => {
        if (!b) return 0;
        if (b.mode === "flat") return +b.flat || 0;
        const arr = Array.isArray(b.headcount) ? b.headcount : [];
        return +arr[headcount - 1] || +b.flat || 0;
      };
      const find = id => o.bills.find(b => b.id === id);
      const gas = find("gas"), electric = find("electric");
      const bills = [];
      if (gas || electric) {
        bills.push({
          id: "energy", name: "Energy (gas & electric)",
          est: Math.round((monthlyOf(gas) + monthlyOf(electric)) * 100) / 100, payers: null,
        });
        notes.push("gas + electric merged into Energy");
      }
      o.bills.forEach(b => {
        if (b.id === "gas" || b.id === "electric") return;
        bills.push({ id: b.id, name: b.name || b.id, est: monthlyOf(b), payers: null });
      });
      bills.push({ id: "insurance", name: "Renters insurance", est: 15, payers: null });
      notes.push("renters insurance added");
      if (typeof o.councilTax === "number") {
        bills.push({ id: "counciltax", name: "Council tax", est: o.councilTax, payers: null });
      }
      state.bills = bills;
    }

    // --- saved properties come across as-is where they can ---
    if (Array.isArray(o.presets)) {
      state.presets = o.presets.map(p => ({ name: p.name || "Untitled", snapshot: null, legacy: p.snapshot || null }));
    }

    // --- seed months across whatever period v1 was modelling ---
    let from = typeof o.windowFrom === "string" ? o.windowFrom.slice(0, 7) : "";
    let to = typeof o.windowTo === "string" ? o.windowTo.slice(0, 7) : "";
    const here = todayKey();
    if (!/^\d{4}-\d{2}$/.test(from)) from = here;
    if (!/^\d{4}-\d{2}$/.test(to)) to = here;
    if (from > here) from = here;
    if (to < here) to = here;
    let k = from, guard = 0;
    while (k <= to && guard++ < 60) { ensureMonth(k); k = addMonths(k, 1); }
    state.currentMonth = here;
    ensureMonth(here);

    normalise();
    return notes;
  }

  // ============================================================
  //  MONTH HELPERS
  // ============================================================
  const MONTH_NAMES = ["January","February","March","April","May","June",
                       "July","August","September","October","November","December"];
  function parseKey(key) {
    const [y, m] = String(key).split("-").map(Number);
    return { y, m };
  }
  function daysInMonth(key) { const { y, m } = parseKey(key); return new Date(y, m, 0).getDate(); }
  function monthLabel(key, short) {
    const { y, m } = parseKey(key);
    if (!y || !m) return "—";
    const nm = MONTH_NAMES[m - 1] || "";
    return short ? `${nm.slice(0, 3)} ${String(y).slice(2)}` : `${nm} ${y}`;
  }
  function addMonths(key, n) {
    const { y, m } = parseKey(key);
    const d = new Date(y, m - 1 + n, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  function dayDate(key, day) {
    const { y, m } = parseKey(key);
    return new Date(y, m - 1, day);
  }
  function isoOf(key, day) {
    const { y, m } = parseKey(key);
    return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  function sortedMonthKeys() { return Object.keys(state.months).sort(); }

  // The bedroom a person most recently occupied, used only as the default
  // when adding a brand-new stint.
  function lastRoomOf(personId) {
    const keys = sortedMonthKeys().reverse();
    for (const k of keys) {
      const st = (state.months[k].stints || []).filter(x => x.personId === personId).pop();
      if (st) return st.roomId;
    }
    if (state._seedRooms && state._seedRooms[personId]) return state._seedRooms[personId];
    if (DEFAULT_ROOM_OF[personId]) return DEFAULT_ROOM_OF[personId];
    const bedrooms = state.rooms.filter(r => !r.communal);
    return (bedrooms[0] || state.rooms[0] || {}).id;
  }

  function blankMonth(key) {
    const lines = {};
    state.bills.forEach(b => lines[b.id] = { est: b.est ?? 0, act: null });
    return { key, rent: null, lines, oneOffs: [], stints: [], collected: false, charged: null, chargedAt: "", note: "" };
  }

  // A new month inherits the previous month's arrangement, clipped to its
  // length. That is almost always right — the same people in the same rooms
  // — and anything that changed is edited on the Who's here tab. If there
  // is no previous month, everyone gets a full-month stint.
  function seedStints(key, fromScratch) {
    const M = state.months[key];
    if (!M) return;
    const D = daysInMonth(key);
    // Nearest earlier month that has any stints — so jumping ahead a few
    // months still inherits the arrangement rather than resetting it.
    const earlier = fromScratch ? [] : sortedMonthKeys().filter(k => k < key && (state.months[k].stints || []).length);
    const prevKey = earlier.length ? earlier[earlier.length - 1] : null;
    const prev = prevKey ? state.months[prevKey] : null;
    if (prev && (prev.stints || []).length) {
      const prevD = daysInMonth(prevKey);
      M.stints = prev.stints
        .filter(st => state.people.some(p => p.id === st.personId && !p.archived))
        // A stint that ran to the end of last month is treated as ongoing.
        .map(st => ({
          id: uid("st"), personId: st.personId, roomId: st.roomId,
          from: Math.min(D, st.from),
          to: st.to >= prevD ? D : Math.min(D, st.to),
        }));
      if (M.stints.length) return;
    }
    M.stints = state.people.filter(p => !p.archived).map(p => ({
      id: uid("st"), personId: p.id, roomId: lastRoomOf(p.id), from: 1, to: D,
    }));
  }

  function ensureMonth(key) {
    if (!state.months[key]) {
      state.months[key] = blankMonth(key);
      // Carry the previous month's realised figures forward as estimates.
      const prev = state.months[addMonths(key, -1)];
      if (prev) {
        state.bills.forEach(b => {
          const pl = prev.lines[b.id];
          if (pl && typeof pl.act === "number") state.months[key].lines[b.id].est = pl.act;
        });
      }
      seedStints(key);
    }
    return state.months[key];
  }

  // Keeps the shape sane after a load, an import or a schema drift.
  function normalise() {
    if (!Array.isArray(state.rooms) || !state.rooms.length) state.rooms = DEFAULT_ROOMS.map(r => ({ ...r }));
    state.rooms.forEach(r => {
      r.w = +r.w || 0; r.l = +r.l || 0;
      if (typeof r.weight !== "number") r.weight = 1;
      r.communal = !!r.communal;
      if (!r.id) r.id = uid("rm");
    });
    const roomIds = state.rooms.map(r => r.id);
    const firstPrivate = (state.rooms.find(r => !r.communal) || state.rooms[0] || {}).id;

    if (!Array.isArray(state.people)) state.people = [];
    state.people = state.people.slice(0, MAX_PEOPLE);
    state.people.forEach((p, i) => {
      if (!p.id) p.id = `p${i + 1}`;
      if (typeof p.name !== "string") p.name = `Person ${i + 1}`;
      p.isPayer = !!p.isPayer;
      p.archived = !!p.archived;
      // Anything left over from the older model is no longer consulted.
      delete p.role; delete p.awayBasis; delete p.fixedBasis;
      delete p.moveIn; delete p.moveOut; delete p.roomId;
    });
    const live = state.people.filter(p => !p.archived);
    if (live.length && !live.some(p => p.isPayer)) live[0].isPayer = true;

    if (!Array.isArray(state.bills)) state.bills = DEFAULT_BILLS.map(b => ({ ...b }));
    state.bills.forEach(b => {
      if (!b.id) b.id = uid("bl");
      if (typeof b.name !== "string") b.name = b.id;
      delete b.kind;
      if (typeof b.est !== "number") b.est = 0;
      if (b.payers && !Array.isArray(b.payers)) b.payers = null;
    });

    if (!state.months || typeof state.months !== "object") state.months = {};
    Object.keys(state.months).forEach(k => {
      const M = state.months[k];
      if (!M || typeof M !== "object") { delete state.months[k]; return; }
      M.key = k;
      if (!M.lines || typeof M.lines !== "object") M.lines = {};
      const lineDefs = (M.config && Array.isArray(M.config.bills)) ? M.config.bills : state.bills;
      lineDefs.forEach(b => {
        if (!M.lines[b.id]) M.lines[b.id] = { est: b.est ?? 0, act: null };
        const L = M.lines[b.id];
        L.est = typeof L.est === "number" ? L.est : 0;
        L.act = typeof L.act === "number" ? L.act : null;
      });
      if (!Array.isArray(M.oneOffs)) M.oneOffs = [];
      M.oneOffs.forEach(x => {
        if (!x.id) x.id = uid("oo");
        if (typeof x.est !== "number") x.est = 0;
        if (typeof x.act !== "number") x.act = null;
        delete x.kind;
      });
      if (!Array.isArray(M.stints)) M.stints = [];
      const D = daysInMonth(k);
      // A locked month is judged against the setup it was locked with, not
      // today's. Otherwise deleting a room or a person would quietly rewrite
      // stints inside a month that has already been charged.
      const cfg = M.config && Array.isArray(M.config.rooms) ? M.config : null;
      const validRooms = cfg ? cfg.rooms.map(r => r.id) : roomIds;
      const validPeople = cfg && Array.isArray(cfg.people) ? cfg.people.map(x => x.id) : state.people.map(x => x.id);
      const fallbackRoom = cfg
        ? ((cfg.rooms.find(r => !r.communal) || cfg.rooms[0] || {}).id)
        : firstPrivate;
      M.stints = M.stints.filter(s => validPeople.includes(s.personId));
      M.stints.forEach(s => {
        if (!s.id) s.id = uid("st");
        s.from = Math.min(D, Math.max(1, Math.round(+s.from || 1)));
        s.to = Math.min(D, Math.max(s.from, Math.round(+s.to || D)));
        if (!validRooms.includes(s.roomId)) s.roomId = fallbackRoom;
        delete s.here;
      });
      M.collected = !!M.collected;
      if (M.charged && typeof M.charged !== "object") M.charged = null;
      if (M.config && typeof M.config !== "object") M.config = null;
      if (M.config && !Array.isArray(M.config.rooms)) M.config = null;
      if (typeof M.note !== "string") M.note = "";
    });
    if (!state.months[state.currentMonth]) ensureMonth(state.currentMonth);

    if (!Array.isArray(state.ledger)) state.ledger = [];
    state.ledger.forEach(e => { if (!e.id) e.id = uid("lg"); });
  }

  // ============================================================
  //  FORMATTING
  // ============================================================
  function fmtNum(n, d = 2) {
    if (!isFinite(n)) return "—";
    return n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function money(pence) {
    if (!isFinite(pence)) return "—";
    return state.currency + (pence / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function money0(pence) {
    if (!isFinite(pence)) return "—";
    return state.currency + Math.round(pence / 100).toLocaleString();
  }
  function signedMoney(pence) { return (pence > 0 ? "+" : pence < 0 ? "−" : "") + money(Math.abs(pence)); }
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function escapeAttr(s) { return String(s).replace(/"/g, "&quot;"); }
  function initials(name) {
    const parts = String(name).trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  function personById(id) { return state.people.find(p => p.id === id) || null; }
  function personName(id) { const p = personById(id); return p ? p.name : "(removed)"; }
  function personColor(id) {
    const i = state.people.findIndex(p => p.id === id);
    return PERSON_COLORS[(i < 0 ? 0 : i) % PERSON_COLORS.length];
  }
  function payer() { return state.people.find(p => p.isPayer) || state.people[0] || { name: "the payer", id: "" }; }
  function plural(n, one, many) { return `${n} ${n === 1 ? one : (many || one + "s")}`; }

  // ============================================================
  //  THE ENGINE
  //
  //  Everything is computed day by day. For each day of the month we
  //  know who is liable (committed to the house, whether or not they
  //  are in it), who is present (physically there that night), and
  //  which bedroom each liable person holds. Rent follows liability;
  //  bills follow presence. Every case — a visitor for ten days, a
  //  mid-month move-out, two people doubling up in one room — is just
  //  a different set of days.
  // ============================================================

  function buildDayModel(key) {
    const D = daysInMonth(key);
    const M = state.months[key];
    const days = [];
    for (let d = 1; d <= D; d++) {
      const liable = [], rooms = {};
      (M.stints || []).forEach(s => {
        if (d < s.from || d > s.to) return;
        if (!liable.includes(s.personId)) liable.push(s.personId);
        if (!rooms[s.roomId]) rooms[s.roomId] = [];
        if (!rooms[s.roomId].includes(s.personId)) rooms[s.roomId].push(s.personId);
      });
      days.push({ d, liable, present: liable, rooms });
    }
    return days;
  }

  // House rule: a bedroom must have somebody in it on every single day.
  // Returns one entry per bedroom that has gaps, with the days listed.
  function bedroomGaps(key) {
    return withMonthConfig(state.months[key], () => bedroomGapsInner(key));
  }
  function bedroomGapsInner(key) {
    const days = buildDayModel(key);
    const out = [];
    state.rooms.filter(r => !r.communal).forEach(room => {
      const empty = [];
      days.forEach(day => { if (!(day.rooms[room.id] || []).length) empty.push(day.d); });
      if (empty.length) out.push({ roomId: room.id, name: room.name, days: empty });
    });
    return out;
  }
  // [1,2,3,7,8] -> "1–3, 7–8"
  function rangeText(nums) {
    const parts = []; let a = null, b = null;
    nums.forEach(d => {
      if (a === null) { a = b = d; return; }
      if (d === b + 1) { b = d; return; }
      parts.push(a === b ? `${a}` : `${a}–${b}`); a = b = d;
    });
    if (a !== null) parts.push(a === b ? `${a}` : `${a}–${b}`);
    return parts.join(", ");
  }

  function weightedAreas() {
    const rooms = state.rooms.map(r => ({ ...r, wa: (+r.w || 0) * (+r.l || 0) * (typeof r.weight === "number" ? r.weight : 1) }));
    const ca = (+state.catchall || 0) * (typeof state.catchallWeight === "number" ? state.catchallWeight : 1);
    return { rooms, ca, total: rooms.reduce((s, r) => s + r.wa, 0) + ca };
  }

  // Largest-remainder apportionment. Shares always add back to the
  // total exactly — no stray pennies, no drift over a year.
  function distribute(weights, totalPence) {
    const out = {};
    Object.keys(weights).forEach(id => out[id] = 0);
    const ids = Object.keys(weights).filter(id => weights[id] > 0);
    const sum = ids.reduce((s, i) => s + weights[i], 0);
    if (sum <= 0 || !ids.length || !totalPence) return out;
    const exact = {}, frac = {};
    let assigned = 0;
    ids.forEach(id => {
      exact[id] = totalPence * weights[id] / sum;
      const fl = Math.floor(exact[id]);
      out[id] = fl; frac[id] = exact[id] - fl; assigned += fl;
    });
    let rem = Math.round(totalPence - assigned);
    const order = ids.slice().sort((a, b) => (frac[b] - frac[a]) || (a < b ? -1 : 1));
    let i = 0;
    while (rem > 0) { out[order[i % order.length]] += 1; rem--; i++; }
    while (rem < 0) { out[order[i % order.length]] -= 1; rem++; i++; }
    return out;
  }

  // --- rent -------------------------------------------------------
  function computeRent(key, rentPence) {
    const days = buildDayModel(key);
    const D = days.length;
    const { rooms, ca, total } = weightedAreas();
    const rawBed = {}, rawShare = {}, warn = [];
    const seen = {};
    days.forEach(day => day.liable.forEach(id => seen[id] = true));
    const anyLiable = Object.keys(seen);

    if (total <= 0) return { bedroom: {}, shared: {}, raw: {}, warn: ["No floor area has been entered, so rent cannot be allocated."] };
    if (!anyLiable.length) return { bedroom: {}, shared: {}, raw: {}, warn: ["Nobody is down as being here this month — add a stint on the Who's here tab."] };

    const orphanRooms = new Set(), orphanDays = [];
    days.forEach(day => {
      const liable = day.liable.length ? day.liable : (orphanDays.push(day.d), anyLiable);
      rooms.forEach(room => {
        if (room.wa <= 0) return;
        const daily = rentPence * (room.wa / total) / D;
        let occ;
        if (room.communal) occ = liable;
        else {
          occ = (day.rooms[room.id] || []).filter(id => liable.includes(id));
          if (!occ.length) { occ = liable; orphanRooms.add(room.name); }
        }
        const each = daily / occ.length;
        occ.forEach(id => {
          if (room.communal) rawShare[id] = (rawShare[id] || 0) + each;
          else rawBed[id] = (rawBed[id] || 0) + each;
        });
      });
      if (ca > 0) {
        const each = (rentPence * (ca / total) / D) / liable.length;
        liable.forEach(id => rawShare[id] = (rawShare[id] || 0) + each);
      }
    });

    // Empty bedrooms are reported separately and more precisely by
    // bedroomGaps(); here we only flag days with nobody in the house at all.
    if (orphanDays.length) {
      warn.push(`Nobody is down as being here on ${plural(orphanDays.length, "day")} (${rangeText(orphanDays)}). Those days were charged to everyone who was here at some point in the month.`);
    }

    const raw = {};
    [...new Set([...Object.keys(rawBed), ...Object.keys(rawShare)])].forEach(id => {
      raw[id] = (rawBed[id] || 0) + (rawShare[id] || 0);
    });
    const totalShare = distribute(raw, rentPence);
    // Split each person's rounded rent back into bedroom and shared,
    // keeping the two parts adding up to their rent exactly.
    const bedroom = {}, shared = {};
    Object.keys(totalShare).forEach(id => {
      const b = rawBed[id] || 0, s = rawShare[id] || 0;
      const denom = b + s;
      bedroom[id] = denom > 0 ? Math.round(totalShare[id] * b / denom) : 0;
      shared[id] = totalShare[id] - bedroom[id];
    });
    return { bedroom, shared, raw: totalShare, warn };
  }

  // --- day counts -------------------------------------------------
  function dayCounts(key) {
    const days = buildDayModel(key);
    const liableDays = {};
    state.people.forEach(p => { liableDays[p.id] = 0; });
    days.forEach(day => day.liable.forEach(id => { if (id in liableDays) liableDays[id] += 1; }));
    return { nights: liableDays, liableDays, days };
  }

  // --- bills ------------------------------------------------------
  // A bill's split is decided by two things and nothing else: whether
  // the bill is usage-driven or fixed, and — for fixed bills — each
  // person's own setting.
  // One rule, everybody the same: your share of a bill is your share of the
  // month's days. No classes of person, no per-person exceptions.
  function billUnits(key, payers, counts) {
    const { liableDays } = counts;
    const units = {}, how = {};
    state.people.forEach(p => {
      if (payers && payers.length && !payers.includes(p.id)) { units[p.id] = 0; how[p.id] = "not a payer"; return; }
      units[p.id] = liableDays[p.id] || 0; how[p.id] = "days";
    });
    let sum = Object.values(units).reduce((s, v) => s + v, 0);
    let fallback = false;
    if (sum <= 0) {
      // Nobody who may pay this bill was here. Rather than lose the money,
      // split it equally — but only ever among the people who are actually
      // on the bill. Charging someone explicitly excluded from it would be
      // worse than leaving it unallocated.
      fallback = true;
      const eligible = (payers && payers.length)
        ? state.people.filter(p => payers.includes(p.id))
        : state.people.filter(p => !p.archived);
      eligible.forEach(p => { units[p.id] = 1; how[p.id] = "split equally (nobody was here)"; });
      sum = eligible.length;
    }
    return { units, how, sum, fallback };
  }

  function amountOf(line, mode) {
    if (!line) return 0;
    if (mode === "est") return +line.est || 0;
    return typeof line.act === "number" ? line.act : (+line.est || 0);
  }
  function monthHasActuals(M) {
    if (!M) return false;
    const anyLine = Object.values(M.lines || {}).some(l => typeof l.act === "number");
    const anyOne = (M.oneOffs || []).some(l => typeof l.act === "number");
    return anyLine || anyOne;
  }
  function monthAllActual(M) {
    if (!M) return false;
    const lines = state.bills.map(b => M.lines[b.id]).concat(M.oneOffs || []);
    return lines.length > 0 && lines.every(l => l && typeof l.act === "number");
  }
  function monthStatus(key) {
    const M = state.months[key];
    if (!M) return "projected";
    if (monthAllActual(M)) return "reconciled";
    if (M.collected) return "collecting";
    return "projected";
  }

  // --- the whole month -------------------------------------------
  // Fields that must be frozen when a month is locked, so that a later rent
  // review, a re-measured room or a dropped bill cannot reach back and
  // rewrite what people were actually charged.
  const CONFIG_FIELDS = ["rent", "rooms", "catchall", "catchallWeight", "bills", "people"];
  function captureConfig() {
    const c = {}; CONFIG_FIELDS.forEach(k => c[k] = deep(state[k])); return c;
  }
  // Runs fn with the month's frozen config in place of the live one.
  // Single-threaded, and restored in a finally, so nothing can observe it.
  function withMonthConfig(M, fn) {
    if (!M || !M.config) return fn();
    const saved = {};
    CONFIG_FIELDS.forEach(k => { saved[k] = state[k]; if (M.config[k] !== undefined) state[k] = M.config[k]; });
    try { return fn(); } finally { CONFIG_FIELDS.forEach(k => state[k] = saved[k]); }
  }

  function computeMonth(key, mode) {
    const M = ensureMonth(key);
    return withMonthConfig(M, () => computeMonthInner(key, mode, M));
  }
  function computeMonthInner(key, mode, M) {
    const counts = dayCounts(key);
    const rentAmount = typeof M.rent === "number" ? M.rent : state.rent;
    const rentPence = Math.round(rentAmount * 100);
    const r = computeRent(key, rentPence);

    const totals = {}, rentTotals = {}, billTotals = {};
    state.people.forEach(p => { totals[p.id] = 0; rentTotals[p.id] = 0; billTotals[p.id] = 0; });
    Object.keys(r.raw).forEach(id => {
      if (!(id in totals)) { totals[id] = 0; rentTotals[id] = 0; billTotals[id] = 0; }
      totals[id] += r.raw[id]; rentTotals[id] += r.raw[id];
    });

    const lines = [];
    const allLines = state.bills
      .map(b => ({ def: b, line: M.lines[b.id] || { est: b.est ?? 0, act: null }, oneOff: false }))
      .concat((M.oneOffs || []).map(x => ({ def: x, line: x, oneOff: true })));

    allLines.forEach(({ def, line, oneOff }) => {
      const amt = Math.round(amountOf(line, mode) * 100);
      const u = billUnits(key, def.payers, counts);
      const shares = distribute(u.units, amt);
      Object.keys(shares).forEach(id => {
        if (!(id in totals)) { totals[id] = 0; rentTotals[id] = 0; billTotals[id] = 0; }
        totals[id] += shares[id]; billTotals[id] += shares[id];
      });
      lines.push({
        id: def.id, name: def.name, oneOff,
        amount: amt, shares, units: u.units, how: u.how, unitSum: u.sum, fallback: u.fallback,
        isActual: typeof line.act === "number",
        est: Math.round((+line.est || 0) * 100),
        act: typeof line.act === "number" ? Math.round(line.act * 100) : null,
      });
    });

    const billsTotalPence = lines.reduce((s, l) => s + l.amount, 0);
    return {
      key, mode, counts, rentPence, rentAmount,
      bedroom: r.bedroom, shared: r.shared, rentShare: r.raw, warn: r.warn,
      lines, totals, rentTotals, billTotals,
      grand: rentPence + billsTotalPence,
      billsTotalPence,
    };
  }

  // What each person was actually asked to hand over for a month.
  function chargedFor(key) {
    const M = state.months[key];
    if (M && M.charged && typeof M.charged === "object") return M.charged;
    return computeMonth(key, "est").totals;
  }

  // ============================================================
  //  BALANCES — every difference between charged and realised
  // ============================================================
  function computeBalances() {
    const bal = {}, items = [];
    const known = new Set(state.people.map(p => p.id));
    // The person who fronts the money cannot owe themselves. Their own
    // variance is simply their own cost moving, not a debt.
    const payerId = (state.people.find(p => p.isPayer) || {}).id;

    sortedMonthKeys().forEach(k => {
      const M = state.months[k];
      if (!M.collected || !monthHasActuals(M)) return;
      const charged = chargedFor(k);
      const eff = computeMonth(k, "eff").totals;
      const ids = new Set([...Object.keys(charged), ...Object.keys(eff)]);
      ids.forEach(id => {
        if (id === payerId) return;
        const v = Math.round((eff[id] || 0) - (charged[id] || 0));
        if (!v) return;
        bal[id] = (bal[id] || 0) + v;
        items.push({ type: "trueup", monthKey: k, personId: id, amount: v, date: M.chargedAt || "" });
        known.add(id);
      });
    });

    (state.ledger || []).forEach(e => {
      if (e.personId === payerId) return;
      const amt = Math.round(+e.amount || 0);
      bal[e.personId] = (bal[e.personId] || 0) - amt;
      items.push({ type: e.type || "settle", monthKey: e.monthKey || "", personId: e.personId, amount: -amt, date: e.date || "", note: e.note || "", id: e.id });
      known.add(e.personId);
    });

    items.sort((a, b) => (b.monthKey || "").localeCompare(a.monthKey || "") || (b.date || "").localeCompare(a.date || ""));
    return { bal, items, known: [...known] };
  }

  // ============================================================
  //  INVARIANT CHECK — shown on the How this works tab
  // ============================================================
  function runChecks() {
    const results = [];
    sortedMonthKeys().forEach(k => {
      const c = computeMonth(k, "eff");
      const rentSum = Object.values(c.rentShare).reduce((s, v) => s + v, 0);
      const problems = [];
      if (rentSum !== c.rentPence) problems.push(`rent shares add to ${money(rentSum)}, not ${money(c.rentPence)}`);
      c.lines.forEach(l => {
        const s = Object.values(l.shares).reduce((a, v) => a + v, 0);
        if (s !== l.amount) problems.push(`${l.name} shares add to ${money(s)}, not ${money(l.amount)}`);
      });
      Object.keys(c.rentShare).forEach(id => {
        if ((c.bedroom[id] || 0) + (c.shared[id] || 0) !== c.rentShare[id]) {
          problems.push(`${personName(id)}'s bedroom and shared parts don't add to their rent`);
        }
      });
      results.push({ key: k, ok: problems.length === 0, problems, warn: c.warn });
    });
    return results;
  }

  // ============================================================
  //  SHARED UI BITS
  // ============================================================
  let toastTimer = null;
  function toast(msg) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
  }
  function avatarHtml(p, size) {
    const s = size || 30;
    return `<div class="avatar" style="background:${personColor(p.id)}; width:${s}px; height:${s}px; font-size:${Math.round(s * 0.4)}px;">${escapeHtml(initials(p.name))}</div>`;
  }
  function kpi(label, val, sub) {
    return `<div class="kpi"><div class="kpi-label">${escapeHtml(label)}</div><div class="kpi-val">${val}</div>${sub ? `<div class="kpi-sub">${sub}</div>` : ""}</div>`;
  }
  function currentMonth() { return ensureMonth(state.currentMonth); }

  function saveAndRender(what) {
    Store.save();
    render(what);
  }

  // ============================================================
  //  RENDER: month
  // ============================================================
  function renderMonth() {
    const key = state.currentMonth;
    const M = ensureMonth(key);
    const D = daysInMonth(key);
    const c = computeMonth(key, "eff");
    const est = computeMonth(key, "est");
    const status = monthStatus(key);

    document.getElementById("m-title").textContent = monthLabel(key);
    document.getElementById("s-title").textContent = monthLabel(key);
    document.getElementById("m-jump").value = key;
    const statusEl = document.getElementById("m-status");
    statusEl.className = "status-pill " + status;
    statusEl.textContent = { projected: "Projected", collecting: "Awaiting real bills", reconciled: "Reconciled" }[status];

    const totalNights = Object.values(c.counts.liableDays).reduce((s, v) => s + v, 0);
    const liableIds = state.people.filter(p => (c.counts.liableDays[p.id] || 0) > 0);
    const sub = `${D} days · ${plural(liableIds.length, "person", "people")} · ${totalNights} person-days`;
    document.getElementById("m-sub").textContent = sub;
    document.getElementById("s-sub").textContent = sub;

    // KPIs
    document.getElementById("m-kpis").innerHTML = [
      kpi("Total this month", money0(c.grand), `${money(c.rentPence)} rent + ${money(c.billsTotalPence)} bills`),
      kpi("Per person", liableIds.length ? money0(c.grand / liableIds.length) : "—", "average, before any split"),
      kpi("Bills", money0(c.billsTotalPence), monthAllActual(M) ? "all realised" : (monthHasActuals(M) ? "partly realised" : "still estimated")),
      kpi("Cost per person-day", totalNights ? money(c.grand / totalNights) : "—", `${totalNights} person-days in total`),
    ].join("");

    // Warnings
    const warns = [...c.warn];
    if (!liableIds.length) warns.push("Nobody is down as living here this month.");
    bedroomGaps(key).forEach(g => {
      warns.push(`<b>${escapeHtml(g.name)}</b> has nobody in it on ${g.days.length === D ? "any day" : "day " + rangeText(g.days)} — every bedroom should be occupied every day. Its rent is being spread across everyone instead.`);
    });
    c.lines.filter(l => l.fallback).forEach(l => {
      const eligible = Object.keys(l.units).filter(id => l.units[id] > 0).map(personName);
      warns.push(`Nobody who pays <b>${escapeHtml(l.name)}</b> was here this month, so the whole ${money(l.amount)} went to ${escapeHtml(eligible.join(" and ") || "no-one")} anyway — check that's still right.`);
    });
    document.getElementById("m-warn").innerHTML = warns.map(w =>
      `<div class="badge warn" style="display:inline-block;">${w}</div>`).join(" ");

    // ---- bill rows ----
    const rows = [];
    const rowFor = (def, line, oneOff) => {
      const estP = Math.round((+line.est || 0) * 100);
      const actP = typeof line.act === "number" ? Math.round(line.act * 100) : null;
      const delta = actP === null ? null : actP - estP;
      const dCls = delta === null ? "none" : delta > 0 ? "up" : delta < 0 ? "down" : "none";
      const dTxt = delta === null ? "not in yet" : delta === 0 ? "spot on" : signedMoney(delta);
      return `
        <div class="bg-row${oneOff ? " oneoff" : ""}" data-line="${escapeAttr(def.id)}" data-oneoff="${oneOff ? 1 : 0}">
          <div class="bg-name">
            ${oneOff
              ? `<input type="text" data-oneoff-name="${escapeAttr(def.id)}" value="${escapeAttr(def.name)}" style="font-weight:600; font-size:14.5px; max-width:190px;" />`
              : escapeHtml(def.name)}
            ${oneOff ? `<button class="btn-icon" data-del-oneoff="${escapeAttr(def.id)}" title="Remove"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 6l12 12M6 18L18 6"/></svg></button>` : ""}
          </div>
          <div class="bg-num">
            <div class="minilabel">Estimate</div>
            <div class="field compact"><span class="prefix cur-symbol">${state.currency}</span><input type="number" step="0.01"${oneOff ? "" : ' min="0"'} class="num-input" data-est="${escapeAttr(def.id)}" data-oneoff="${oneOff ? 1 : 0}" value="${+line.est || 0}" /></div>
          </div>
          <div class="bg-num">
            <div class="minilabel">Realised</div>
            <div class="field compact"><span class="prefix cur-symbol">${state.currency}</span><input type="number" step="0.01"${oneOff ? "" : ' min="0"'} class="num-input" data-act="${escapeAttr(def.id)}" data-oneoff="${oneOff ? 1 : 0}" value="${typeof line.act === "number" ? line.act : ""}" placeholder="—" /></div>
          </div>
          <div class="bg-delta ${dCls}">${dTxt}</div>
        </div>`;
    };
    // Rent sits at the top of the same table so the month reads as one bill.
    rows.push(`
      <div class="bg-row" style="background: var(--card-2); box-shadow: inset 0 0 0 1px var(--hairline);">
        <div class="bg-name">Rent</div>
        <div class="bg-num">
          <div class="minilabel">Agreed</div>
          <div class="field compact"><span class="prefix cur-symbol">${state.currency}</span><input type="number" step="10" min="0" class="num-input" id="m-rent-inline" value="${typeof M.rent === "number" ? M.rent : state.rent}" /></div>
        </div>
        <div class="bg-num"><div class="minilabel">&nbsp;</div><div style="font-size:12.5px; color:var(--muted); padding-top:8px; text-align:right;">${fmtNum(weightedAreas().total, 1)} m² weighted</div></div>
        <div class="bg-delta none">fixed</div>
      </div>`);
    state.bills.forEach(b => rows.push(rowFor(b, M.lines[b.id], false)));
    (M.oneOffs || []).forEach(x => rows.push(rowFor(x, x, true)));
    document.getElementById("m-bill-rows").innerHTML = rows.join("");

    const pending = state.bills.length + (M.oneOffs || []).length - c.lines.filter(l => l.isActual).length;
    document.getElementById("mbills-summary").textContent =
      `${money0(c.grand)} · ${pending ? `${pending} still estimated` : "all realised"}`;

    // ---- statements ----
    renderStatements(key, c, est);

    // ---- lock button ----
    const lockBtn = document.getElementById("m-lock");
    const help = document.getElementById("m-lock-help");
    if (!M.collected) {
      lockBtn.textContent = "Lock these as the amounts collected";
      help.innerHTML = "Locking records what everyone was actually asked for. Once the real bills land, the difference between the two is trued up automatically on the Balances tab. Until you lock, the figures just move with the estimates.";
    } else {
      lockBtn.textContent = "Unlock the collected amounts";
      help.innerHTML = `Locked${M.chargedAt ? ` on ${escapeHtml(M.chargedAt)}` : ""}. Everyone was asked for the amounts shown in each person's breakdown under <b>Asked for at the time</b>. Any difference against the realised bills is sitting on the Balances tab.`;
    }

    document.getElementById("m-note").value = M.note || "";
    document.querySelectorAll(".cur-symbol").forEach(el => el.textContent = state.currency);
    bindMonthInputs();
  }

  function renderStatements(key, c, est) {
    const M = state.months[key];
    const host = document.getElementById("m-statements");
    const ids = state.people.filter(p => (c.counts.liableDays[p.id] || 0) > 0 || (c.totals[p.id] || 0) !== 0).map(p => p.id);
    if (!ids.length) { host.innerHTML = `<div class="empty">Nobody is living here this month. Add a stint on the <b>Who's here</b> tab.</div>`; return; }

    const charged = M.collected ? chargedFor(key) : null;
    const D = daysInMonth(key);
    const roomName = id => (state.rooms.find(r => r.id === id) || {}).name || "—";
    const sharedNames = state.rooms.filter(r => r.communal).map(r => r.name);

    host.innerHTML = ids.map(id => {
      const p = personById(id);
      const open = !!state.openStatements[id];
      const liable = c.counts.liableDays[id] || 0;
      const nights = liable;
      const total = c.totals[id] || 0;

      // which bedrooms, and were they shared?
      const days = c.counts.days;
      const roomsUsed = {};
      let sharedDays = 0;
      days.forEach(day => {
        Object.keys(day.rooms).forEach(rid => {
          if (!day.rooms[rid].includes(id)) return;
          roomsUsed[rid] = (roomsUsed[rid] || 0) + 1;
          if (day.rooms[rid].length > 1) sharedDays += 1;
        });
      });
      const roomTxt = Object.keys(roomsUsed).map(rid => `${roomName(rid)}${roomsUsed[rid] < liable ? ` (${roomsUsed[rid]}d)` : ""}`).join(", ") || "no room";

      let lines = "";
      lines += `<div class="lineitem"><span class="li-name">Bedroom</span><span class="li-how">${escapeHtml(roomTxt)}${sharedDays ? ` · shared on ${plural(sharedDays, "day")}` : ""} · here ${liable}/${D} days</span><span class="li-amt">${money(c.bedroom[id] || 0)}</span></div>`;
      lines += `<div class="lineitem"><span class="li-name">Shared space</span><span class="li-how">${escapeHtml(sharedNames.join(", "))}${state.catchall > 0 ? ", hallway" : ""} · split with everyone here each day</span><span class="li-amt">${money(c.shared[id] || 0)}</span></div>`;
      c.lines.forEach(l => {
        const u = l.units[id] || 0;
        const how = u === 0
          ? (l.how[id] === "not a payer" ? "not a payer on this bill" : "not here this month")
          : `${money(l.amount)} × ${u} of ${l.unitSum} person-days`;
        lines += `<div class="lineitem sub"><span class="li-name">${escapeHtml(l.name)}${l.isActual ? "" : " <span style='color:var(--muted-2); font-weight:500;'>(est)</span>"}</span><span class="li-how">${how}</span><span class="li-amt">${money(l.shares[id] || 0)}</span></div>`;
      });
      lines += `<div class="lineitem tot"><span class="li-name">Total for ${escapeHtml(monthLabel(key))}</span><span class="li-how"></span><span class="li-amt">${money(total)}</span></div>`;

      if (charged) {
        const was = charged[id] || 0;
        const diff = total - was;
        lines += `<div class="lineitem"><span class="li-name">Asked for at the time</span><span class="li-how">collected on the estimates</span><span class="li-amt">${money(was)}</span></div>`;
        if (monthHasActuals(M)) {
          lines += `<div class="lineitem ${diff > 0 ? "debit" : diff < 0 ? "credit" : ""}"><span class="li-name">${diff > 0 ? "Underpaid — owes" : diff < 0 ? "Overpaid — refund due" : "Settled exactly"}</span><span class="li-how">difference between the real bills and what was collected · carried to Balances</span><span class="li-amt">${signedMoney(diff)}</span></div>`;
        }
      }

      const perNight = nights ? total / nights : 0;
      return `
        <div class="stmt-card${open ? " open" : ""}" data-stmt="${escapeAttr(id)}">
          <div class="stmt-head">
            ${avatarHtml(p, 34)}
            <div class="grow" style="min-width:0;">
              <div class="stmt-name">${escapeHtml(p.name)}${p.isPayer ? ` <span class="badge ok" style="margin-left:4px;">pays the bills</span>` : ""}</div>
              <div class="stmt-sub">here ${liable} of ${D} days${perNight ? ` · ${money(perNight)} per day` : ""}</div>
            </div>
            <div class="stmt-amt"><b>${money(total)}</b><span>${monthAllActual(M) ? "realised" : "estimated"}</span></div>
            <svg class="chev" style="transform: rotate(${open ? 90 : 0}deg); width:18px; height:18px; color: var(--muted-2);" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
          </div>
          <div class="stmt-body">${lines}</div>
        </div>`;
    }).join("");

    const sum = ids.reduce((s, id) => s + (c.totals[id] || 0), 0);
    document.getElementById("mstmt-summary").textContent =
      `${money0(sum)} across ${plural(ids.length, "person", "people")}`;

    host.querySelectorAll(".stmt-head").forEach(h => {
      h.addEventListener("click", () => {
        const id = h.parentElement.dataset.stmt;
        state.openStatements[id] = !state.openStatements[id];
        renderMonth();
      });
    });
  }

  function bindMonthInputs() {
    const M = currentMonth();
    const host = document.getElementById("m-bill-rows");
    const lineOf = (id, isOneOff) => isOneOff ? (M.oneOffs || []).find(x => x.id === id) : M.lines[id];

    host.querySelectorAll("input[data-est]").forEach(inp => {
      inp.addEventListener("input", e => {
        const L = lineOf(e.target.dataset.est, e.target.dataset.oneoff === "1");
        if (L) { L.est = parseFloat(e.target.value) || 0; Store.save(); renderQuiet(); }
      });
    });
    host.querySelectorAll("input[data-act]").forEach(inp => {
      inp.addEventListener("input", e => {
        const L = lineOf(e.target.dataset.act, e.target.dataset.oneoff === "1");
        if (!L) return;
        const v = e.target.value.trim();
        L.act = v === "" ? null : (parseFloat(v) || 0);
        Store.save(); renderQuiet();
      });
    });
    host.querySelectorAll("input[data-oneoff-name]").forEach(inp => {
      inp.addEventListener("input", e => {
        const x = (M.oneOffs || []).find(o => o.id === e.target.dataset.oneoffName);
        if (x) { x.name = e.target.value; Store.save(); renderQuiet(); }
      });
    });
    host.querySelectorAll("[data-del-oneoff]").forEach(b => {
      b.addEventListener("click", e => {
        const id = e.currentTarget.dataset.delOneoff;
        M.oneOffs = (M.oneOffs || []).filter(x => x.id !== id);
        saveAndRender();
      });
    });
    const ri = document.getElementById("m-rent-inline");
    if (ri) ri.addEventListener("input", e => {
      M.rent = parseFloat(e.target.value) || 0;
      Store.save(); renderQuiet();
    });
  }

  // Re-render the numbers without stealing focus from the field being typed in.
  let quietTimer = null;
  function renderQuiet() {
    clearTimeout(quietTimer);
    quietTimer = setTimeout(() => {
      const active = document.activeElement;
      const mark = active && active.dataset
        ? (active.dataset.est ? "est:" + active.dataset.est : active.dataset.act ? "act:" + active.dataset.act : active.id ? "#" + active.id : "")
        : "";
      const pos = active && active.selectionStart != null ? active.selectionStart : null;
      render();
      if (mark) {
        let el = null;
        if (mark.startsWith("est:")) el = document.querySelector(`input[data-est="${CSS.escape(mark.slice(4))}"]`);
        else if (mark.startsWith("act:")) el = document.querySelector(`input[data-act="${CSS.escape(mark.slice(4))}"]`);
        else if (mark.startsWith("#")) el = document.getElementById(mark.slice(1));
        if (el) { el.focus(); try { if (pos != null) el.setSelectionRange(pos, pos); } catch (e) {} }
      }
    }, 260);
  }

  // ============================================================
  //  RENDER: who's here (timeline + stints)
  // ============================================================
  function renderStints() {
    const key = state.currentMonth;
    const M = ensureMonth(key);
    const D = daysInMonth(key);
    const days = buildDayModel(key);
    const cols = `grid-template-columns: repeat(${D}, minmax(0, 1fr));`;

    // --- ruler ---
    let ruler = `<div class="tl-ruler" style="${cols}">`;
    for (let d = 1; d <= D; d++) {
      const dow = dayDate(key, d).getDay();
      const wk = dow === 0 || dow === 6;
      ruler += `<div class="tl-tick${wk ? " wk" : ""}">${d % 2 === 1 || D <= 20 ? d : "&nbsp;"}</div>`;
    }
    ruler += `</div>`;

    // --- one row per person with any presence this month ---
    const involved = state.people.filter(p => (M.stints || []).some(s => s.personId === p.id));
    let rows = "";
    involved.forEach(p => {
      let cells = "";
      for (let d = 1; d <= D; d++) {
        const day = days[d - 1];
        const isHere = day.liable.includes(p.id);
        let sharing = false;
        Object.keys(day.rooms).forEach(rid => {
          if (day.rooms[rid].includes(p.id) && day.rooms[rid].length > 1) sharing = true;
        });
        cells += `<div class="tl-cell ${isHere ? "here" : ""}${sharing ? " share" : ""}"></div>`;
      }
      rows += `
        <div class="tl-row" style="--seg:${personColor(p.id)}; --seg-soft:${personColor(p.id)};">
          <div class="tl-who">${avatarHtml(p, 22)}<span class="nm">${escapeHtml(p.name)}</span></div>
          <div class="tl-track" style="${cols}">${cells}</div>
        </div>`;
    });

    // --- headcount strip ---
    let hc = `<div class="tl-hc" style="${cols}">`;
    for (let d = 1; d <= D; d++) hc += `<div class="tl-hcell">${days[d - 1].liable.length}</div>`;
    hc += `</div>`;

    // Every bedroom must have somebody in it on every day. Show it plainly.
    const gaps = bedroomGaps(key);
    let cover = "";
    state.rooms.filter(r => !r.communal).forEach(room => {
      let cells = "";
      for (let d = 1; d <= D; d++) {
        const occ = (days[d - 1].rooms[room.id] || []).length;
        cells += `<div class="tl-cell${occ ? " here" : " empty"}" title="${escapeAttr(room.name)} — day ${d}: ${occ ? plural(occ, "person", "people") : "EMPTY"}"></div>`;
      }
      const g = gaps.find(x => x.roomId === room.id);
      cover += `
        <div class="tl-row" style="--seg:${g ? "var(--red)" : "var(--green)"};">
          <div class="tl-who"><span class="nm" style="color:${g ? "var(--red)" : "var(--muted)"};">${escapeHtml(room.name)}</span></div>
          <div class="tl-track" style="${cols}">${cells}</div>
        </div>`;
    });
    if (cover) cover = `<div style="margin-top:14px; padding-top:12px; border-top:0.5px solid var(--hairline);">
      <div style="font-size:11.5px; color:var(--muted); font-weight:700; text-transform:uppercase; letter-spacing:.04em; margin-bottom:7px;">Bedroom cover</div>${cover}</div>`;

    document.getElementById("tl-grid").innerHTML = involved.length
      ? ruler + rows + hc + `<div style="font-size:11.5px; color:var(--muted); padding-left:116px; margin-top:5px;">people in the house each day</div>` + cover
      : `<div class="empty">Nobody is down for ${escapeHtml(monthLabel(key))} yet. Use <b>Add a stint</b> below, or reset from the roster on the This month tab.</div>`;

    // --- editable stint list ---
    const roomOpts = state.rooms.map(r =>
      `<option value="${escapeAttr(r.id)}"${r.communal ? " disabled" : ""}>${escapeHtml(r.name)}${r.communal ? " (shared)" : ""}</option>`).join("");
    const peopleOpts = state.people.map(p => `<option value="${escapeAttr(p.id)}">${escapeHtml(p.name)}</option>`).join("");

    const list = document.getElementById("stint-list");
    if (!(M.stints || []).length) {
      list.innerHTML = `<div class="empty">No stints yet.</div>`;
    } else {
      list.innerHTML = M.stints.map(s => {
        const p = personById(s.personId);
        return `
          <div class="stint-row" data-stint="${escapeAttr(s.id)}">
            <span class="swatch" style="background:${p ? personColor(p.id) : "var(--muted)"}"></span>
            <select data-st-person="${escapeAttr(s.id)}" style="width:auto; min-width:104px;">${peopleOpts}</select>
            <div class="field compact" style="width:auto;"><span class="prefix">day</span><input type="number" class="num-input daynum" min="1" max="${D}" data-st-from="${escapeAttr(s.id)}" value="${s.from}" /></div>
            <span style="color:var(--muted-2);">→</span>
            <div class="field compact" style="width:auto;"><input type="number" class="num-input daynum" min="1" max="${D}" data-st-to="${escapeAttr(s.id)}" value="${s.to}" /></div>
            <select data-st-room="${escapeAttr(s.id)}" style="width:auto; min-width:120px;">${roomOpts}</select>
            <span style="font-size:12px; color:var(--muted); font-variant-numeric:tabular-nums;">${plural(s.to - s.from + 1, "day")}</span>
            <div class="spacer"></div>
            <button class="btn-icon" data-st-split="${escapeAttr(s.id)}" title="Split this stint in two">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 3v18"/><path d="M5 8h4M15 8h4"/></svg>
            </button>
            <button class="btn-icon" data-st-del="${escapeAttr(s.id)}" title="Remove">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 6l12 12M6 18L18 6"/></svg>
            </button>
          </div>`;
      }).join("");
      M.stints.forEach(s => {
        const sel = list.querySelector(`[data-st-person="${CSS.escape(s.id)}"]`);
        if (sel) sel.value = s.personId;
        const rs = list.querySelector(`[data-st-room="${CSS.escape(s.id)}"]`);
        if (rs) rs.value = s.roomId;
      });
    }

    const totalDays = days.reduce((s, d) => s + d.liable.length, 0);
    const gapCount = gaps.reduce((s, g) => s + g.days.length, 0);
    document.getElementById("stint-summary").textContent =
      `${plural((M.stints || []).length, "stint")} · ${totalDays} person-days` + (gapCount ? ` · ${gapCount} empty bedroom-days` : "");
    const sw = document.getElementById("stint-warn");
    if (sw) sw.innerHTML = gaps.map(g =>
      `<div class="badge warn" style="display:inline-block;"><b>${escapeHtml(g.name)}</b> empty on ${g.days.length === D ? "every day" : "day " + rangeText(g.days)}</div>`).join(" ");

    bindStintInputs();
  }

  function bindStintInputs() {
    const M = currentMonth();
    const D = daysInMonth(state.currentMonth);
    const list = document.getElementById("stint-list");
    const find = id => (M.stints || []).find(s => s.id === id);
    const clampAll = () => { M.stints.forEach(s => { s.from = Math.min(D, Math.max(1, s.from)); s.to = Math.min(D, Math.max(s.from, s.to)); }); };

    list.querySelectorAll("[data-st-person]").forEach(el => el.addEventListener("change", e => {
      const s = find(e.target.dataset.stPerson); if (!s) return;
      s.personId = e.target.value;
      const p = personById(s.personId);
      saveAndRender();
    }));
    list.querySelectorAll("[data-st-room]").forEach(el => el.addEventListener("change", e => {
      const s = find(e.target.dataset.stRoom); if (!s) return;
      s.roomId = e.target.value; saveAndRender();
    }));
    list.querySelectorAll("[data-st-from]").forEach(el => el.addEventListener("change", e => {
      const s = find(e.target.dataset.stFrom); if (!s) return;
      s.from = Math.round(parseFloat(e.target.value) || 1); clampAll(); saveAndRender();
    }));
    list.querySelectorAll("[data-st-to]").forEach(el => el.addEventListener("change", e => {
      const s = find(e.target.dataset.stTo); if (!s) return;
      s.to = Math.round(parseFloat(e.target.value) || D); clampAll(); saveAndRender();
    }));
    list.querySelectorAll("[data-st-del]").forEach(el => el.addEventListener("click", e => {
      M.stints = M.stints.filter(s => s.id !== e.currentTarget.dataset.stDel); saveAndRender();
    }));
    list.querySelectorAll("[data-st-split]").forEach(el => el.addEventListener("click", e => {
      const s = find(e.currentTarget.dataset.stSplit); if (!s) return;
      if (s.to - s.from < 1) { toast("A one-day stint can't be split."); return; }
      const mid = Math.floor((s.from + s.to) / 2);
      const copy = { ...s, id: uid("st"), from: mid + 1, to: s.to };
      s.to = mid;
      M.stints.splice(M.stints.indexOf(s) + 1, 0, copy);
      saveAndRender();
      toast("Split in two — adjust the dates, or delete the half they weren't here for.");
    }));
  }

  // ============================================================
  //  RENDER: balances
  // ============================================================
  function renderBalances() {
    const { bal, items } = computeBalances();
    const pay = payer();
    const ids = Object.keys(bal).filter(id => Math.abs(bal[id]) >= 1);
    const owedToPayer = ids.filter(id => bal[id] > 0).reduce((s, id) => s + bal[id], 0);
    const owedByPayer = ids.filter(id => bal[id] < 0).reduce((s, id) => s - bal[id], 0);
    const reconciledMonths = sortedMonthKeys().filter(k => state.months[k].collected && monthHasActuals(state.months[k]));

    document.getElementById("b-kpis").innerHTML = [
      kpi(`Owed to ${pay.name}`, money0(owedToPayer), "under-payments not yet settled"),
      kpi(`${pay.name} owes out`, money0(owedByPayer), "refunds for over-payments"),
      kpi("Months trued up", String(reconciledMonths.length), reconciledMonths.length ? `${monthLabel(reconciledMonths[0], true)} – ${monthLabel(reconciledMonths[reconciledMonths.length - 1], true)}` : "none yet"),
    ].join("");

    const host = document.getElementById("bal-list");
    const everyone = [...new Set([...state.people.map(p => p.id), ...Object.keys(bal)])]
      .filter(id => id !== pay.id);

    if (!everyone.length) {
      host.innerHTML = `<div class="empty">Nobody to settle with yet.</div>`;
    } else {
      host.innerHTML = everyone.map(id => {
        const p = personById(id);
        const v = Math.round(bal[id] || 0);
        const gone = !p;
        const label = v > 0 ? `owes ${pay.name}` : v < 0 ? `${pay.name} owes them` : "square";
        const cls = v > 0 ? "owes" : v < 0 ? "owed" : "clear";
        const mine = items.filter(x => x.personId === id && x.type === "trueup");
        const why = mine.length
          ? mine.slice(0, 3).map(x => `${monthLabel(x.monthKey, true)} ${signedMoney(x.amount)}`).join(" · ") + (mine.length > 3 ? " · …" : "")
          : "no differences yet";
        return `
          <div class="bal-row">
            ${p ? avatarHtml(p, 32) : `<div class="avatar" style="background:var(--muted-2); width:32px; height:32px; font-size:13px;">?</div>`}
            <div class="grow" style="min-width:0;">
              <div style="font-weight:600; font-size:15px;">${escapeHtml(p ? p.name : "Someone who has left")}${gone ? ` <span class="badge muted">moved out</span>` : ""}</div>
              <div class="bal-note">${escapeHtml(why)}</div>
            </div>
            <div>
              <div class="bal-amt ${cls}">${v === 0 ? money(0) : money(Math.abs(v))}</div>
              <div class="bal-note" style="text-align:right;">${escapeHtml(label)}</div>
            </div>
            ${v !== 0 ? `<button class="btn-ghost btn btn-sm" data-settle="${escapeAttr(id)}" title="Settle in full or record a partial payment">Settle…</button>` : ""}
          </div>`;
      }).join("");
    }

    document.getElementById("bal-summary").textContent =
      owedToPayer || owedByPayer ? `${money0(owedToPayer)} in · ${money0(owedByPayer)} out` : "all square";
    document.getElementById("bal-help").innerHTML =
      `<b>${escapeHtml(pay.name)}</b> pays the landlord and every provider, so every balance is between that person and one other — there is never a chain of who-pays-whom. A balance appears when a month has been locked and its real bills have come in: the difference between what someone was asked for and what their share actually turned out to be. <b>Settle…</b> asks how much changed hands — leave the suggested amount to clear the balance in full, or type a smaller figure to record a <b>partial payment</b>; what is left over stays outstanding. Every payment, full or partial, is listed below and can be undone.`;

    // ledger
    const lhost = document.getElementById("ledger-list");
    if (!items.length) {
      lhost.innerHTML = `<div class="empty">Nothing to show yet. Lock a month and enter its realised bills.</div>`;
    } else {
      lhost.innerHTML = items.slice(0, 200).map(x => {
        const p = personById(x.personId);
        const isTrue = x.type === "trueup";
        return `
          <div class="list-row" style="background: var(--card-2); border-radius: var(--radius); padding: 10px 13px; margin-bottom: 7px;">
            <span class="swatch" style="width:9px; height:9px; border-radius:999px; background:${p ? personColor(p.id) : "var(--muted-2)"};"></span>
            <div class="grow" style="min-width:0;">
              <div style="font-size:14px; font-weight:600;">${escapeHtml(p ? p.name : "(removed)")} <span style="font-weight:500; color:var(--muted);">— ${isTrue ? `${escapeHtml(monthLabel(x.monthKey))} true-up` : escapeHtml(x.note || "settled up")}</span></div>
              <div class="bal-note">${isTrue ? (x.amount > 0 ? "real bills came in higher than collected" : "real bills came in lower than collected") : `recorded${x.date ? " on " + escapeHtml(x.date) : ""}`}</div>
            </div>
            <div style="font-variant-numeric:tabular-nums; font-weight:700; color:${x.amount > 0 ? "var(--red)" : "var(--green)"};">${signedMoney(x.amount)}</div>
            ${x.id ? `<button class="btn-icon" data-del-ledger="${escapeAttr(x.id)}" title="Undo this record"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 6l12 12M6 18L18 6"/></svg></button>` : ""}
          </div>`;
      }).join("");
    }
    document.getElementById("ledger-summary").textContent = plural(items.length, "entry", "entries");

    host.querySelectorAll("[data-settle]").forEach(b => b.addEventListener("click", e => {
      const id = e.currentTarget.dataset.settle;
      const v = Math.round(bal[id] || 0);          // pence, signed: >0 they owe the payer, <0 payer owes them
      if (!v) return;
      const who = personById(id);
      const nm = who ? who.name : "them";
      const owedNow = Math.abs(v);
      const direction = v > 0 ? `${nm} pays ${payer().name}` : `${payer().name} refunds ${nm}`;
      const raw = prompt(
        `${direction} — how much changed hands?\n\n${money(owedNow)} is currently outstanding. Leave this as it is to settle in full, or enter a smaller amount to record a partial payment.`,
        (owedNow / 100).toFixed(2)
      );
      if (raw === null) return;                      // cancelled
      const entered = Math.round(parseFloat(raw) * 100);
      if (!isFinite(entered) || entered <= 0) { toast("Enter an amount greater than zero."); return; }
      const signedAmt = Math.sign(v) * entered;        // same convention as computeBalances(): bal -= ledger amount
      const partial = entered < owedNow;
      const over = entered > owedNow;
      const label = v > 0
        ? `${nm} paid ${payer().name} ${money(entered)}`
        : `${payer().name} refunded ${nm} ${money(entered)}`;
      let msg = `Record: ${label}.`;
      if (partial) msg += ` ${money(owedNow - entered)} will still be ${v > 0 ? "owed" : "due back"} afterwards.`;
      if (over) msg += ` That is more than was outstanding — the balance will flip, and ${v > 0 ? `${payer().name} will owe ${nm}` : `${nm} will owe ${payer().name}`} ${money(entered - owedNow)}.`;
      if (!confirm(msg)) return;
      state.ledger.push({
        id: uid("lg"), personId: id, monthKey: "", type: "settle", amount: signedAmt,
        date: new Date().toISOString().slice(0, 10),
        note: label + (partial ? ` — partial, ${money(owedNow - entered)} left` : over ? " — more than was owed" : ""),
      });
      saveAndRender();
      toast(partial ? "Partial payment recorded." : over ? "Recorded — balance flipped." : "Settled in full.");
    }));
    lhost.querySelectorAll("[data-del-ledger]").forEach(b => b.addEventListener("click", e => {
      const id = e.currentTarget.dataset.delLedger;
      if (!confirm("Undo this record? The balance will go back to what it was.")) return;
      state.ledger = state.ledger.filter(x => x.id !== id);
      saveAndRender();
    }));
  }

  // ============================================================
  //  RENDER: history
  // ============================================================
  function renderHistory() {
    const keys = sortedMonthKeys();
    const host = document.getElementById("h-people-table");

    if (!keys.length) { host.innerHTML = ""; document.getElementById("h-kpis").innerHTML = ""; return; }

    const cache = {};
    keys.forEach(k => cache[k] = computeMonth(k, "eff"));

    const ids = [...new Set(keys.flatMap(k => Object.keys(cache[k].totals).filter(id => cache[k].totals[id] > 0)))];

    let head = `<thead><tr><th>Month</th>${ids.map(id => `<th>${escapeHtml(personName(id))}</th>`).join("")}<th>Total</th></tr></thead>`;
    let body = "<tbody>";
    keys.forEach(k => {
      const c = cache[k];
      const done = monthAllActual(state.months[k]);
      const tot = ids.reduce((s, id) => s + (c.totals[id] || 0), 0);
      body += `<tr data-goto="${escapeAttr(k)}" style="cursor:pointer;${done ? "" : " opacity:.62;"}">
        <td>${escapeHtml(monthLabel(k))}${done ? "" : ` <span style="font-size:10.5px; color:var(--muted);">est</span>`}</td>
        ${ids.map(id => `<td>${c.totals[id] ? money(c.totals[id]) : "—"}</td>`).join("")}
        <td class="strong">${money(tot)}</td>
      </tr>`;
    });
    // per-person totals across everything
    body += `<tr style="border-top: 1.5px solid var(--hairline-2);">
      <td class="strong">All months</td>
      ${ids.map(id => `<td class="strong">${money(keys.reduce((s, k) => s + (cache[k].totals[id] || 0), 0))}</td>`).join("")}
      <td class="strong">${money(keys.reduce((s, k) => s + ids.reduce((a, id) => a + (cache[k].totals[id] || 0), 0), 0))}</td>
    </tr></tbody>`;
    host.innerHTML = head + body;
    host.querySelectorAll("[data-goto]").forEach(tr => tr.addEventListener("click", () => {
      state.currentMonth = tr.dataset.goto;
      showTab("month");
      saveAndRender();
    }));

    const grand = keys.reduce((s, k) => s + cache[k].grand, 0);
    const realised = keys.filter(k => monthAllActual(state.months[k]));
    document.getElementById("h-kpis").innerHTML = [
      kpi("Months on record", String(keys.length), `${monthLabel(keys[0], true)} – ${monthLabel(keys[keys.length - 1], true)}`),
      kpi("Total housed cost", money0(grand), "rent and bills, all months"),
      kpi("Average month", money0(grand / keys.length), `${realised.length} fully realised`),
    ].join("");
    document.getElementById("hpeople-summary").textContent = plural(keys.length, "month");

    // --- bill trends ---
    const trendHost = document.getElementById("h-trends");
    const defs = state.bills.slice();
    trendHost.innerHTML = defs.map(b => {
      const vals = keys.map(k => {
        const L = state.months[k].lines[b.id] || {};
        return { v: typeof L.act === "number" ? L.act : (+L.est || 0), actual: typeof L.act === "number" };
      });
      const max = Math.max(...vals.map(v => v.v), 1);
      const realisedVals = vals.filter(v => v.actual).map(v => v.v);
      const avg = realisedVals.length ? realisedVals.reduce((s, v) => s + v, 0) / realisedVals.length : 0;
      const bars = vals.map((v, i) => `<div class="trend-bar ${v.actual ? (v.v >= max ? "hi" : "") : "est"}" style="height:${Math.max(2, (v.v / max) * 100)}%" title="${escapeAttr(monthLabel(keys[i]))} — ${escapeAttr(state.currency + v.v.toFixed(2))}${v.actual ? "" : " (estimate)"}"></div>`).join("");
      return `
        <div style="background: var(--card-2); border-radius: var(--radius); padding: 12px 14px; margin-bottom: 10px;">
          <div class="row-h">
            <div style="font-weight:600; font-size:14px;">${escapeHtml(b.name)}</div>
            <div class="spacer"></div>
            <div style="font-size:12.5px; color: var(--muted); font-variant-numeric: tabular-nums;">${realisedVals.length ? `avg ${state.currency}${avg.toFixed(2)} realised` : "no realised figures yet"}</div>
          </div>
          <div class="trend">${bars}</div>
          <div style="display:flex; justify-content:space-between; font-size:10.5px; color:var(--muted-2); margin-top:4px;">
            <span>${escapeHtml(monthLabel(keys[0], true))}</span><span>${escapeHtml(monthLabel(keys[keys.length - 1], true))}</span>
          </div>
        </div>`;
    }).join("") || `<div class="empty">No bills configured.</div>`;
  }

  // ============================================================
  //  RENDER: setup — people
  // ============================================================
  function renderPeople() {
    const host = document.getElementById("people-list");
    const ordered = state.people.slice().sort((a, c) => (a.archived ? 1 : 0) - (c.archived ? 1 : 0));

    host.innerHTML = ordered.map(p => {
      const months = sortedMonthKeys().filter(k => (state.months[k].stints || []).some(st => st.personId === p.id));
      const where = months.length
        ? `in ${plural(months.length, "month")} · ${escapeHtml(monthLabel(months[0], true))}–${escapeHtml(monthLabel(months[months.length - 1], true))}`
        : "no stints yet";
      return `
      <div class="list-row" data-person="${escapeAttr(p.id)}"${p.archived ? ' style="opacity:.6;"' : ""}>
        ${avatarHtml(p, 32)}
        <div class="grow" style="min-width:0;">
          <input type="text" data-p-name="${escapeAttr(p.id)}" value="${escapeAttr(p.name)}" style="font-size:15px; font-weight:600;" />
          <div style="color: var(--muted); font-size: 12px; margin-top: 2px;">${where}</div>
        </div>
        ${p.archived
          ? `<span class="badge muted">Archived</span><span class="badge ok" style="cursor:pointer;" data-p-restore="${escapeAttr(p.id)}">Bring back</span>`
          : `<span class="badge ${p.isPayer ? "ok" : "muted"}" style="cursor:pointer;" data-p-payer="${escapeAttr(p.id)}" title="Pays the landlord and the providers; everyone settles with them">${p.isPayer ? "✓ Pays the bills" : "Make payer"}</span>`}
        ${state.people.length > 1 ? `<button class="btn-icon" data-p-del="${escapeAttr(p.id)}" title="Remove"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 6l12 12M6 18L18 6"/></svg></button>` : ""}
      </div>`;
    }).join("");

    host.querySelectorAll("[data-p-name]").forEach(el => el.addEventListener("input", e => {
      const p = personById(e.target.dataset.pName); if (p) { p.name = e.target.value; Store.save(); renderQuiet(); }
    }));
    host.querySelectorAll("[data-p-payer]").forEach(el => el.addEventListener("click", e => {
      const id = e.currentTarget.dataset.pPayer;
      state.people.forEach(p => p.isPayer = p.id === id);
      saveAndRender();
    }));
    host.querySelectorAll("[data-p-restore]").forEach(el => el.addEventListener("click", e => {
      const p = personById(e.currentTarget.dataset.pRestore); if (!p) return;
      p.archived = false; saveAndRender();
      toast(`${p.name} is back — give them a stint on Who's here.`);
    }));
    host.querySelectorAll("[data-p-del]").forEach(el => el.addEventListener("click", e => {
      const p = personById(e.currentTarget.dataset.pDel); if (!p) return;
      const locked = sortedMonthKeys().filter(k =>
        state.months[k].collected && (state.months[k].stints || []).some(st => st.personId === p.id));
      if (locked.length) {
        if (!confirm(`${p.name} appears in ${plural(locked.length, "month")} already locked (${locked.map(k => monthLabel(k, true)).join(", ")}).\n\nThose months stay exactly as they were charged. ${p.name} will be archived — off the roster and out of future months, but still on Balances until settled.\n\nArchive them?`)) return;
        p.archived = true; p.isPayer = false;
        Object.values(state.months).forEach(M => {
          if (M.collected) return;
          M.stints = (M.stints || []).filter(st => st.personId !== p.id);
        });
      } else {
        if (!confirm(`Remove ${p.name}? They are in no locked month, so this deletes them outright.`)) return;
        state.people = state.people.filter(x => x.id !== p.id);
        Object.values(state.months).forEach(M => { M.stints = (M.stints || []).filter(st => st.personId !== p.id); });
      }
      const rest = state.people.filter(x => !x.archived);
      if (!rest.some(x => x.isPayer) && rest[0]) rest[0].isPayer = true;
      normalise(); saveAndRender();
    }));

    const live = state.people.filter(p => !p.archived);
    const arch = state.people.length - live.length;
    document.getElementById("people-summary").textContent =
      plural(live.length, "person", "people") + (arch ? ` · ${arch} archived` : "");
  }

  // ============================================================
  //  RENDER: setup — rooms
  // ============================================================
  function renderRooms() {
    const host = document.getElementById("rooms");
    host.innerHTML = state.rooms.map((room, i) => {
      const area = (+room.w || 0) * (+room.l || 0);
      const weighted = area * (typeof room.weight === "number" ? room.weight : 1);
      const holders = state.people.filter(p => p.roomId === room.id).map(p => p.name);
      return `
        <div class="room-card">
          <div class="room-top">
            <input type="text" data-r-name="${escapeAttr(room.id)}" value="${escapeAttr(room.name)}" style="font-size:15px; font-weight:600; flex:1; min-width:100px;" />
            <span class="badge ${room.communal ? "ok" : "muted"}" style="cursor:pointer;" data-r-communal="${escapeAttr(room.id)}">${room.communal ? "◍ Shared" : "◌ Private"}</span>
            <div class="room-area">${fmtNum(area)} m² · weighted ${fmtNum(weighted)} m²</div>
            ${state.rooms.length > 1 ? `<button class="btn-icon" data-r-del="${escapeAttr(room.id)}" title="Remove"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 6l12 12M6 18L18 6"/></svg></button>` : ""}
          </div>
          <div class="dim-grid">
            <div><div class="dim-label">Width</div><div class="field compact"><input type="number" data-r-field="w" data-r-id="${escapeAttr(room.id)}" value="${room.w}" step="0.01" min="0" class="num-input" /><span class="suffix">m</span></div></div>
            <div><div class="dim-label">Length</div><div class="field compact"><input type="number" data-r-field="l" data-r-id="${escapeAttr(room.id)}" value="${room.l}" step="0.01" min="0" class="num-input" /><span class="suffix">m</span></div></div>
            <div><div class="dim-label">Weight</div><div class="field compact"><input type="number" data-r-field="weight" data-r-id="${escapeAttr(room.id)}" value="${room.weight}" step="0.05" min="0" class="num-input" /><span class="suffix">×</span></div></div>
          </div>
          <div style="color: var(--muted); font-size: 12.5px;">
            ${room.communal ? "Split among everyone liable on each day." : (holders.length ? `Held by ${escapeHtml(holders.join(" and "))}.` : `<span style="color: var(--orange);">Nobody holds this room — its rent gets spread across everyone.</span>`)}
          </div>
        </div>`;
    }).join("");

    host.querySelectorAll("[data-r-field]").forEach(el => el.addEventListener("input", e => {
      const r = state.rooms.find(x => x.id === e.target.dataset.rId); if (!r) return;
      r[e.target.dataset.rField] = parseFloat(e.target.value) || 0;
      Store.save(); renderQuiet();
    }));
    host.querySelectorAll("[data-r-name]").forEach(el => el.addEventListener("input", e => {
      const r = state.rooms.find(x => x.id === e.target.dataset.rName); if (r) { r.name = e.target.value; Store.save(); renderQuiet(); }
    }));
    host.querySelectorAll("[data-r-communal]").forEach(el => el.addEventListener("click", e => {
      const r = state.rooms.find(x => x.id === e.currentTarget.dataset.rCommunal); if (!r) return;
      r.communal = !r.communal;
      if (r.communal) {
        const fallback = (state.rooms.find(x => !x.communal) || {}).id;
        state.people.forEach(p => { if (p.roomId === r.id && fallback) p.roomId = fallback; });
      }
      saveAndRender();
    }));
    host.querySelectorAll("[data-r-del]").forEach(el => el.addEventListener("click", e => {
      const r = state.rooms.find(x => x.id === e.currentTarget.dataset.rDel); if (!r) return;
      const lockedR = sortedMonthKeys().filter(k => state.months[k].collected).length;
      if (!confirm(`Remove ${r.name}? Rent is redistributed across the remaining rooms from now on.` +
        (lockedR ? ` The ${plural(lockedR, "locked month")} keep the layout they were charged on.` : ""))) return;
      state.rooms = state.rooms.filter(x => x.id !== r.id);
      normalise();
      saveAndRender();
    }));

    const { total } = weightedAreas();
    const totalArea = state.rooms.reduce((s, r) => s + (+r.w || 0) * (+r.l || 0), 0) + (+state.catchall || 0);
    document.getElementById("t-total").textContent = fmtNum(totalArea);
    document.getElementById("t-weighted").textContent = fmtNum(total);
    document.getElementById("t-rate").textContent = total > 0 ? money(Math.round(state.rent * 100) / total) : "—";
    document.getElementById("property-summary").textContent = `${state.rooms.length} rooms · ${fmtNum(totalArea, 0)} m² · ${state.currency}${state.rent.toLocaleString()}/mo`;
  }

  // ============================================================
  //  RENDER: setup — bills
  // ============================================================
  function renderBills() {
    const host = document.getElementById("bills");
    host.innerHTML = state.bills.map(b => {
      const restricted = Array.isArray(b.payers) && b.payers.length > 0;
      return `
        <div class="bill-card">
          <div class="bill-top">
            <input type="text" data-b-name="${escapeAttr(b.id)}" value="${escapeAttr(b.name)}" style="font-size:15px; font-weight:600; flex:1; min-width:110px;" />
            <div class="field compact" style="width: 132px;">
              <span class="prefix cur-symbol">${state.currency}</span>
              <input type="number" data-b-est="${escapeAttr(b.id)}" value="${b.est}" step="0.01" min="0" class="num-input" />
              <span class="suffix">/ mo</span>
            </div>
            ${state.bills.length > 1 ? `<button class="btn-icon" data-b-del="${escapeAttr(b.id)}" title="Remove"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 6l12 12M6 18L18 6"/></svg></button>` : ""}
          </div>
          <div class="helper" style="margin-top:0;">The <b>usual amount</b> is only the starting figure for months you haven't filled in yet. Change it whenever the price goes up — a renewal, an inflation rise, a new tariff — and months already on record keep the figures they were given.</div>
          <div class="dim-label" style="margin-top: 8px; margin-bottom: 6px;">Who pays into it${restricted ? "" : " — everyone"}</div>
          <div class="chips" data-b-payers="${escapeAttr(b.id)}">
            ${state.people.filter(p => !p.archived).map(p => {
              const on = !restricted || b.payers.includes(p.id);
              return `<label class="chip ${on ? "active" : ""}"><input type="checkbox" ${on ? "checked" : ""} data-b-payer="${escapeAttr(b.id)}" data-p="${escapeAttr(p.id)}" /><span>${escapeHtml(p.name)}</span></label>`;
            }).join("")}
          </div>
        </div>`;
    }).join("");

    host.querySelectorAll("[data-b-name]").forEach(el => el.addEventListener("input", e => {
      const b = state.bills.find(x => x.id === e.target.dataset.bName); if (b) { b.name = e.target.value; Store.save(); renderQuiet(); }
    }));
    host.querySelectorAll("[data-b-est]").forEach(el => el.addEventListener("input", e => {
      const b = state.bills.find(x => x.id === e.target.dataset.bEst); if (!b) return;
      b.est = parseFloat(e.target.value) || 0;
      Store.save(); renderQuiet();
    }));
    host.querySelectorAll("[data-b-payer]").forEach(el => el.addEventListener("change", e => {
      const b = state.bills.find(x => x.id === e.target.dataset.bPayer); if (!b) return;
      const all = state.people.map(p => p.id);
      let cur = Array.isArray(b.payers) && b.payers.length ? b.payers.slice() : all.slice();
      const pid = e.target.dataset.p;
      cur = e.target.checked ? [...new Set([...cur, pid])] : cur.filter(x => x !== pid);
      b.payers = cur.length === all.length ? null : cur;
      saveAndRender();
    }));
    host.querySelectorAll("[data-b-del]").forEach(el => el.addEventListener("click", e => {
      const b = state.bills.find(x => x.id === e.currentTarget.dataset.bDel); if (!b) return;
      const locked = sortedMonthKeys().filter(k => state.months[k].collected);
      const msg = locked.length
        ? `Remove ${b.name}? It stops appearing in new and unlocked months. The ${plural(locked.length, "month")} you have already locked keep it exactly as it was charged.`
        : `Remove ${b.name}? Its figures come out of every month on record.`;
      if (!confirm(msg)) return;
      state.bills = state.bills.filter(x => x.id !== b.id);
      Object.values(state.months).forEach(M => { if (!M.collected) delete M.lines[b.id]; });
      saveAndRender();
    }));

    const monthly = state.bills.reduce((s, b) => s + (+b.est || 0), 0);
    document.getElementById("bills-summary").textContent = `${state.bills.length} bills · ~${state.currency}${Math.round(monthly).toLocaleString()}/mo`;
  }

  // ============================================================
  //  RENDER: presets (properties sheet)
  // ============================================================
  function renderPresets() {
    const host = document.getElementById("presets");
    if (!state.presets.length) {
      host.innerHTML = `<div class="empty">No saved properties yet.</div>`;
    } else {
      host.innerHTML = state.presets.map((preset, i) => {
        const s = preset.snapshot || {};
        const meta = [
          `${(s.people || []).length} people`,
          `${(s.rooms || []).length} rooms`,
          `${Object.keys(s.months || {}).length} months`,
          typeof s.rent === "number" ? `${s.currency || state.currency}${s.rent.toLocaleString()}/mo` : "",
        ].filter(Boolean).join(" · ");
        return `
          <div class="list-row" style="background: var(--card-2); border-radius: var(--radius); padding: 12px 14px;">
            <div class="grow" style="min-width:0;">
              <input type="text" data-pr-name="${i}" value="${escapeAttr(preset.name)}" style="font-weight:600; font-size:15px;" />
              <div style="color: var(--muted); font-size: 12px; margin-top: 2px;">${escapeHtml(preset.legacy && !preset.snapshot ? "from the old version — load to convert" : meta)}</div>
            </div>
            <button class="btn-ghost btn btn-sm" data-pr-load="${i}">Load</button>
            <button class="btn-icon" data-pr-update="${i}" title="Overwrite with what's on screen"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/></svg></button>
            <button class="btn-icon" data-pr-del="${i}" title="Remove"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 6l12 12M6 18L18 6"/></svg></button>
          </div>`;
      }).join("");
    }
    host.querySelectorAll("[data-pr-name]").forEach(el => el.addEventListener("input", e => {
      state.presets[+e.target.dataset.prName].name = e.target.value; Store.save();
    }));
    host.querySelectorAll("[data-pr-load]").forEach(el => el.addEventListener("click", e => {
      const p = state.presets[+e.currentTarget.dataset.prLoad]; if (!p) return;
      if (!confirm(`Load "${p.name}"? Everything currently on screen is replaced.`)) return;
      if (p.snapshot) applySnapshot(p.snapshot);
      else if (p.legacy) { migrateFromV1(p.legacy); }
      state.activePresetName = p.name;
      normalise();
      closeSheet();
      saveAndRender();
    }));
    host.querySelectorAll("[data-pr-update]").forEach(el => el.addEventListener("click", e => {
      const p = state.presets[+e.currentTarget.dataset.prUpdate]; if (!p) return;
      if (!confirm(`Overwrite "${p.name}" with the current setup?`)) return;
      p.snapshot = snapshotCurrent(); p.legacy = null;
      Store.save(); renderPresets(); toast("Property updated.");
    }));
    host.querySelectorAll("[data-pr-del]").forEach(el => el.addEventListener("click", e => {
      const i = +e.currentTarget.dataset.prDel;
      if (!confirm(`Remove "${state.presets[i].name}"?`)) return;
      state.presets.splice(i, 1); Store.save(); renderPresets();
    }));
    document.getElementById("prop-pill-label").textContent = state.activePresetName || "Property";
  }

  // ============================================================
  //  RENDER: how this works
  //  Written out of live state so the explanation can never drift
  //  from what the app is actually doing.
  // ============================================================
  function renderHow() {
    const key = state.currentMonth;
    const M = ensureMonth(key);
    const D = daysInMonth(key);
    const c = computeMonth(key, "eff");
    const { rooms, ca, total } = weightedAreas();
    const pay = payer();
    const cur = state.currency;

    const sections = [
      ["what", "What this is"],
      ["days", "What it rests on"],
      ["rent", "How rent is worked out"],
      ["away", "Being away, and sharing a room"],
      ["flow", "The decisions, as a flowchart"],
      ["bills", "How each bill splits"],
      ["trueup", "Estimates, real bills and true-ups"],
      ["balances", "Who owes whom"],
      ["example", "A worked example"],
      ["decisions", "The decisions behind this"],
      ["faq", "Questions people ask"],
      ["check", "Check the maths"],
    ];
    document.getElementById("how-toc").innerHTML =
      sections.map(([id, label]) => `<a href="#how-${id}">${escapeHtml(label)}</a>`).join("");

    // --- room table with the real numbers ---
    const roomRows = rooms.map(r => {
      const area = (+r.w || 0) * (+r.l || 0);
      const holders = state.people.filter(p => p.roomId === r.id).map(p => p.name);
      return `<tr>
        <td style="text-align:left;">${escapeHtml(r.name)}</td>
        <td>${fmtNum(r.w)} × ${fmtNum(r.l)}</td>
        <td>${fmtNum(area)} m²</td>
        <td>${fmtNum(r.weight, 2)}×</td>
        <td>${fmtNum(r.wa)} m²</td>
        <td>${((r.wa / total) * 100).toFixed(1)}%</td>
        <td style="text-align:left;">${r.communal ? "everyone liable" : (holders.length ? escapeHtml(holders.join(", ")) : "—")}</td>
      </tr>`;
    }).join("");
    const caRow = ca > 0 ? `<tr>
      <td style="text-align:left;">Hallway / stairs</td><td>—</td><td>${fmtNum(+state.catchall || 0)} m²</td>
      <td>${fmtNum(state.catchallWeight, 2)}×</td><td>${fmtNum(ca)} m²</td><td>${((ca / total) * 100).toFixed(1)}%</td>
      <td style="text-align:left;">everyone liable</td></tr>` : "";

    // --- bill rules table ---
    const billRows = state.bills.map(b => `<tr>
      <td style="text-align:left;">${escapeHtml(b.name)}</td>
      <td style="text-align:left;">${state.currency}${(+b.est || 0).toLocaleString()}</td>
      <td style="text-align:left;">Split across the days each person was here</td>
    </tr>`).join("");

    const totDays = Object.values(c.counts.liableDays).reduce((a, v) => a + v, 0);
    const peopleRows = state.people.filter(p => !p.archived).map(p => {
      const d = c.counts.liableDays[p.id] || 0;
      const rooms = [...new Set(c.counts.days.flatMap(day =>
        Object.keys(day.rooms).filter(rid => day.rooms[rid].includes(p.id))))]
        .map(rid => (state.rooms.find(r => r.id === rid) || {}).name).filter(Boolean);
      return `<tr>
      <td style="text-align:left;">${escapeHtml(p.name)}${p.isPayer ? " (pays everything)" : ""}</td>
      <td style="text-align:left;">${escapeHtml(rooms.join(", ") || "—")}</td>
      <td>${d} / ${D}</td>
      <td>${totDays ? ((d / totDays) * 100).toFixed(1) + "%" : "—"}</td>
    </tr>`; }).join("");

    // --- a real worked example from this month ---
    const charged = state.people.filter(p => (c.totals[p.id] || 0) > 0);
    const exId = (charged.find(p => !p.isPayer) || charged[0] || {}).id;
    let example = `<p>No-one is charged anything this month yet, so there is nothing to work through. Add a stint on <b>Who's here</b> and this section fills itself in.</p>`;
    if (exId) {
      const p = personById(exId);
      const nights = c.counts.nights[exId] || 0;
      const liable = c.counts.liableDays[exId] || 0;
      const rows = [];
      rows.push(["Bedroom", money(c.bedroom[exId] || 0)]);
      rows.push(["Shared space", money(c.shared[exId] || 0)]);
      c.lines.forEach(l => {
        const u = l.units[exId] || 0;
        rows.push([`${l.name} — ${money(l.amount)} × ${u}/${l.unitSum}`, money(l.shares[exId] || 0)]);
      });
      example = `
        <p>Take <b>${escapeHtml(p.name)}</b> in ${escapeHtml(monthLabel(key))}. The month has ${D} days. They were liable for ${liable} of them and slept here on ${nights} nights.</p>
        <div class="worked">
          <table>
            ${rows.map(r => `<tr><td>${escapeHtml(r[0])}</td><td>${r[1]}</td></tr>`).join("")}
            <tr class="tot"><td>${p.isPayer ? "Their share of the month" : `They owe ${escapeHtml(pay.name)}`}</td><td>${money(c.totals[exId] || 0)}</td></tr>
          </table>
        </div>
        <p>Add up that last column for everyone and you get ${money(Object.values(c.totals).reduce((s, v) => s + v, 0))} — exactly the ${money(c.rentPence)} of rent plus ${money(c.billsTotalPence)} of bills the household owes. Not a penny more or less.</p>`;
    }

    const html = `
      <h2 id="how-what">What this is</h2>
      <p>A house is rented as one thing but lived in by several people, in different rooms, for different amounts of time. This app turns that into a number per person per month. It works in <b>calendar months</b>, one at a time, using the bills that <em>actually</em> arrived rather than what anyone guessed at the start.</p>
      <p>Two people can disagree about what is fair. They cannot really disagree about what the rules are, once the rules are written down. That is what this page is for.</p>

      <h2 id="how-days">The one thing everything rests on</h2>
      <p>Everything rests on two different questions, asked separately about every single day of the month:</p>
      <ul>
        <li><b>Which days were you in the house?</b> This decides your share of every bill.</li>
        <li><b>Which bedroom were you in?</b> This decides your share of the rent.</li>
      </ul>
      <p>Both come from the same place — your <b>stints</b> on the <b>Who's here</b> tab. A stint is a block of days in one bedroom. There is nowhere else that dates are recorded, so there is nothing that can fall out of step.</p>
      <div class="callout">
        <p><b>Everyone is treated identically.</b> There are no tenants and no visitors, no per-person settings, no exemptions. Somebody staying five days is simply a person with a five-day stint, and they pay five days' worth of everything — rent, energy, council tax, all of it.</p>
        <p style="margin-bottom:0;"><b>A stint means "paying", not "physically present".</b> If you are away for a fortnight but still keeping your room and still on the bills, your stint runs through it — that is the normal case, and it is how three people who live here all year are recorded. Shorten a stint only when someone genuinely stops paying for those days.</p>
      </div>
      <div class="callout warn">
        <p style="margin-bottom:0;"><b>Every bedroom needs somebody in it, every day.</b> The landlord charges for a bedroom whether or not anybody is in it. If one is left empty, its rent has nowhere to go: it gets spread across everyone and a warning appears on <b>This month</b> and <b>Who's here</b>, with the exact days listed. The <em>Bedroom cover</em> strip under the timeline shows this at a glance.</p>
      </div>

      <h2 id="how-rent">How rent is worked out</h2>
      <p>Rent is split by <b>weighted floor area</b>, not by headcount. A bigger room costs more, which is why the person in the ${escapeHtml((state.rooms.find(r => !r.communal) || {}).name || "largest room")} pays more than the person in the smallest one.</p>
      <p>Each room's floor area is multiplied by a <b>weight</b>. Bathrooms are set to ${fmtNum((state.rooms.find(r => /bath/i.test(r.name)) || {}).weight || 0.5, 2)}× because a square metre of bathroom isn't worth a square metre of bedroom, and the hallway is at ${fmtNum(state.catchallWeight, 2)}× for the same reason. That gives every room a share of the total:</p>
      <div class="htable-wrap" style="margin-bottom: 14px;">
        <table class="htable">
          <thead><tr><th>Room</th><th>Size</th><th>Area</th><th>Weight</th><th>Weighted</th><th>Share</th><th>Held by</th></tr></thead>
          <tbody>${roomRows}${caRow}
            <tr style="border-top:1.5px solid var(--hairline-2);"><td class="strong" style="text-align:left;">Total</td><td></td>
            <td class="strong">${fmtNum(state.rooms.reduce((s, r) => s + r.w * r.l, 0) + (+state.catchall || 0))} m²</td><td></td>
            <td class="strong">${fmtNum(total)} m²</td><td class="strong">100%</td><td></td></tr>
          </tbody>
        </table>
      </div>
      <p>The month's rent of <b>${money(c.rentPence)}</b> is divided across those shares, then divided again by the ${D} days in the month. That gives every room a <b>daily cost</b>. Then, for each day:</p>
      <ul>
        <li>A <b>private</b> room's daily cost is split equally between whoever is liable for it that day — normally one person.</li>
        <li>A <b>shared</b> room's daily cost, and the hallway's, is split equally between everyone liable that day.</li>
      </ul>
      <p>Add up all thirty-or-so days and you have each person's rent. Because every room is charged out in full every single day, the rent always adds back to exactly ${money(c.rentPence)}.</p>

      <h2 id="how-away">Being away, and sharing a room</h2>
      <p>Your rent changes when <b>somebody else is in your bedroom</b> — that is the main thing the day-by-day model buys you.</p>
      <p>If a second person is in a bedroom on a given day, that day's cost for that room is split <b>equally between the two of them</b>. A visitor staying 10 nights of a 30-day month in someone's room therefore picks up 10 × ½ = 5 days' worth — about <b>16.7%</b> of that room for the month — and the person whose room it is pays the other 83.3%. Nobody pays for the room twice, and the room never goes unpaid.</p>
      <div class="callout good">
        <p>This is why a visitor makes the month <em>cheaper</em> for everyone else rather than more expensive: they take on a slice of a bedroom, a slice of the shared space for the days they are liable, and a slice of the usage bills for the nights they are here.</p>
      </div>


      <h2 id="how-flow">The decisions, as a flowchart</h2>
      <p>Three diagrams cover the whole app. Rent and bills are decided separately, and a month moves through a fixed lifecycle.</p>

      <h3>1 · How rent is decided — for one room, on one day</h3>
      <div class="flow">
        <svg viewBox="0 0 900 470" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Flowchart of how rent is decided for one room on one day">
          <defs><marker id="fa" markerWidth="9" markerHeight="9" refX="7" refY="3.2" orient="auto"><path d="M0 0 L7 3.2 L0 6.4 z" fill="var(--muted-2)"/></marker></defs>
          <rect class="n-box" x="230" y="12" width="320" height="40" rx="10"/>
          <text class="t" x="390" y="37" text-anchor="middle">One room, on one day of the month</text>
          <path class="ln" d="M390 52 L390 78" marker-end="url(#fa)"/>
          <rect class="n-box" x="150" y="80" width="480" height="52" rx="10"/>
          <text class="t" x="390" y="101" text-anchor="middle">Daily cost of this room =</text>
          <text class="t-sm" x="390" y="119" text-anchor="middle">rent × (its weighted area ÷ total weighted area) ÷ days in month</text>
          <path class="ln" d="M390 132 L390 158" marker-end="url(#fa)"/>
          <rect class="n-dec" x="230" y="160" width="320" height="42" rx="10"/>
          <text class="t" x="390" y="186" text-anchor="middle">Is it shared space?</text>
          <path class="ln" d="M550 181 L648 181" marker-end="url(#fa)"/>
          <text class="t-edge" x="596" y="173" text-anchor="middle">YES</text>
          <rect class="n-end" x="650" y="158" width="238" height="46" rx="10"/>
          <text class="t" x="769" y="176" text-anchor="middle">Split equally between</text>
          <text class="t" x="769" y="192" text-anchor="middle">everyone in the house that day</text>
          <path class="ln" d="M390 202 L390 232" marker-end="url(#fa)"/>
          <text class="t-edge" x="404" y="220">NO — it is a bedroom</text>
          <rect class="n-dec" x="200" y="234" width="380" height="42" rx="10"/>
          <text class="t" x="390" y="260" text-anchor="middle">How many people are in it today?</text>
          <path class="ln" d="M580 255 L648 255" marker-end="url(#fa)"/>
          <text class="t-edge" x="614" y="247" text-anchor="middle">ONE</text>
          <rect class="n-end" x="650" y="232" width="238" height="46" rx="10"/>
          <text class="t" x="769" y="250" text-anchor="middle">They pay the room's</text>
          <text class="t" x="769" y="266" text-anchor="middle">whole daily cost</text>
          <path class="ln" d="M390 276 L390 306" marker-end="url(#fa)"/>
          <text class="t-edge" x="404" y="294">TWO OR MORE</text>
          <rect class="n-end" x="200" y="308" width="380" height="46" rx="10"/>
          <text class="t" x="390" y="326" text-anchor="middle">Split equally between them, for that day only</text>
          <text class="t-sm" x="390" y="343" text-anchor="middle">this is what a visitor or a partner staying over changes</text>
          <path class="ln" d="M200 255 L152 255 L152 385 L198 385" marker-end="url(#fa)"/>
          <text class="t-edge" x="126" y="320" text-anchor="middle">NOBODY</text>
          <rect class="n-warn" x="200" y="362" width="380" height="46" rx="10"/>
          <text class="t" x="390" y="380" text-anchor="middle">Spread across everyone, and a warning shows</text>
          <text class="t-sm" x="390" y="397" text-anchor="middle">this shouldn't happen — every bedroom should be occupied every day</text>
        </svg>
      </div>
      <p class="flow-cap">Run this for every room and every day, add it up, and you have each person's rent. The only thing that changes anyone's rent is who is in which bedroom, on which days.</p>

      <h3>2 · How a bill is decided — for one bill, for one person</h3>
      <div class="flow">
        <svg viewBox="0 0 900 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Flowchart of how one bill is divided">
          <rect class="n-box" x="250" y="12" width="280" height="40" rx="10"/>
          <text class="t" x="390" y="37" text-anchor="middle">One bill, one person</text>
          <path class="ln" d="M390 52 L390 80" marker-end="url(#fa)"/>
          <rect class="n-dec" x="190" y="82" width="400" height="42" rx="10"/>
          <text class="t" x="390" y="108" text-anchor="middle">How many days were they in the house?</text>
          <path class="ln" d="M590 103 L648 103" marker-end="url(#fa)"/>
          <text class="t-edge" x="619" y="95" text-anchor="middle">NONE</text>
          <rect class="n-end" x="650" y="80" width="238" height="46" rx="10"/>
          <text class="t" x="769" y="98" text-anchor="middle">They pay nothing</text>
          <text class="t-sm" x="769" y="114" text-anchor="middle">no stint that month</text>
          <path class="ln" d="M390 124 L390 152" marker-end="url(#fa)"/>
          <text class="t-edge" x="404" y="142">SOME</text>
          <rect class="n-end" x="150" y="154" width="480" height="58" rx="10"/>
          <text class="t" x="390" y="177" text-anchor="middle">their days ÷ everyone's days, times the bill</text>
          <text class="t-sm" x="390" y="196" text-anchor="middle">the same arithmetic for energy, water, Wi-Fi, insurance and council tax</text>
        </svg>
      </div>
      <p class="flow-cap">That is the entire rule. There is no second kind of bill and no second kind of person — the only input is how many days each person was here.</p>

      <h3>3 · What happens to a month</h3>
      <div class="flow">
        <svg viewBox="0 0 900 330" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Flowchart of the monthly estimate, lock, realise and true-up cycle">
          <rect class="n-box" x="20" y="20" width="200" height="52" rx="10"/>
          <text class="t" x="120" y="41" text-anchor="middle">Estimates entered</text>
          <text class="t-sm" x="120" y="58" text-anchor="middle">what the direct debit takes</text>
          <path class="ln" d="M220 46 L268 46" marker-end="url(#fa)"/>
          <rect class="n-box" x="270" y="20" width="200" height="52" rx="10"/>
          <text class="t" x="370" y="41" text-anchor="middle">Locked</text>
          <text class="t-sm" x="370" y="58" text-anchor="middle">records what each was asked for</text>
          <path class="ln" d="M470 46 L518 46" marker-end="url(#fa)"/>
          <rect class="n-box" x="520" y="20" width="200" height="52" rx="10"/>
          <text class="t" x="620" y="41" text-anchor="middle">Real bills arrive</text>
          <text class="t-sm" x="620" y="58" text-anchor="middle">typed into Realised</text>
          <path class="ln" d="M620 72 L620 100" marker-end="url(#fa)"/>
          <rect class="n-box" x="470" y="102" width="300" height="46" rx="10"/>
          <text class="t" x="620" y="120" text-anchor="middle">Every split recomputed on the real figures</text>
          <text class="t-sm" x="620" y="137" text-anchor="middle">difference per person = realised share − what was collected</text>
          <path class="ln" d="M470 125 L390 125 L390 168" marker-end="url(#fa)"/>
          <rect class="n-dec" x="230" y="170" width="320" height="42" rx="10"/>
          <text class="t" x="390" y="196" text-anchor="middle">Are they still on the roster?</text>
          <path class="ln" d="M550 191 L618 191" marker-end="url(#fa)"/>
          <text class="t-edge" x="584" y="183" text-anchor="middle">NO</text>
          <rect class="n-end" x="620" y="168" width="260" height="46" rx="10"/>
          <text class="t" x="750" y="186" text-anchor="middle">Refunds due list</text>
          <text class="t-sm" x="750" y="202" text-anchor="middle">they keep their balance after leaving</text>
          <path class="ln" d="M390 212 L390 240" marker-end="url(#fa)"/>
          <text class="t-edge" x="404" y="230">YES</text>
          <rect class="n-end" x="230" y="242" width="320" height="46" rx="10"/>
          <text class="t" x="390" y="260" text-anchor="middle">Running balance with the payer</text>
          <text class="t-sm" x="390" y="277" text-anchor="middle">owed in, or owed out as a refund</text>
          <path class="ln" d="M230 265 L120 265 L120 200" marker-end="url(#fa)"/>
          <rect class="n-box" x="20" y="154" width="200" height="46" rx="10"/>
          <text class="t" x="120" y="172" text-anchor="middle">Settle</text>
          <text class="t-sm" x="120" y="189" text-anchor="middle">records it, back to zero</text>
        </svg>
      </div>
      <p class="flow-cap">A month's own figure always describes that month alone. Differences never quietly move next month's number — they sit on the Balances tab until somebody settles them, in full or in part.</p>

      <h2 id="how-bills">How each bill splits</h2>
      <p>Every bill is one of two kinds, and that is the only thing you have to decide about it:</p>
      <div class="htable-wrap" style="margin-bottom: 14px;">
        <table class="htable">
          <thead><tr><th>Bill</th><th>Usual amount</th><th>How it splits</th></tr></thead>
          <tbody>${billRows}</tbody>
        </table>
      </div>
      <p>Every bill splits the same way: <b>your days divided by everyone's days</b>. Energy is worked out exactly like council tax. The current bills are:</p>
      <div class="htable-wrap" style="margin-bottom: 14px;">
        <table class="htable">
          <thead><tr><th>Person</th><th>Bedroom</th><th>Days here</th><th>Share of every bill</th></tr></thead>
          <tbody>${peopleRows}</tbody>
        </table>
      </div>
      <p>And this month's days work out as:</p>

      <h2 id="how-trueup">Estimates, real bills and true-ups</h2>
      <p>Bills are paid by direct debit at an estimated amount, and the real figure only shows up later. So every line in a month has two boxes: an <b>estimate</b> and a <b>realised</b> figure.</p>
      <ol>
        <li>At the start of the month you enter the estimates — usually just what the direct debit takes. Each new month starts with last month's realised figures already filled in, so most of the time there's nothing to type.</li>
        <li>Everyone pays against that. Press <b>Lock these as the amounts collected</b> and the app records exactly what each person was asked for.</li>
        <li>When the real bills arrive you type them into the <b>realised</b> column. Every split is instantly recomputed on the real numbers.</li>
        <li>The difference between what someone was asked for and what their share really was becomes a <b>true-up</b>, and it lands on their balance.</li>
      </ol>
      <div class="callout good">
        <p style="margin-bottom:0;"><b>Prices go up.</b> Nothing about a bill is fixed in stone — the <b>usual amount</b> on the Household tab is only the figure a fresh month starts from, and every month's estimate and realised figure are editable at any time. When the energy tariff or the council tax rises, change the usual amount and future months follow; months already recorded keep the numbers they were actually charged.</p>
      </div>
      <div class="callout warn">
        <p>Nothing is silently changed. A month's own figure always reflects that month alone; the difference sits visibly on the Balances tab until it is settled. If a realised figure was typed in wrong and you correct it, the true-up simply recomputes — there is no double-counting, because the true-up is derived from the numbers rather than stored as an event.</p>
      </div>

      <h2 id="how-balances">Who owes whom</h2>
      <p><b>${escapeHtml(pay.name)}</b> pays the landlord and every provider, and everyone settles with ${escapeHtml(pay.name)}. That means there is never a chain of debts to untangle — every balance is between one person and ${escapeHtml(pay.name)}, and it is either owed in or owed out.</p>
      <p>A negative balance means an over-payment: the person paid more than their share turned out to be, and is owed a refund. This keeps working for people who have <b>moved out</b> — they stay on the Balances tab with whatever they are owed until it is paid, even though they no longer appear in any month.</p>
      <p>Pressing <b>Settle…</b> asks how much actually changed hands. Accept the suggested figure to clear the balance in full, or type a smaller amount to record a <b>partial payment</b> — the remainder stays outstanding, ready to settle again later. Every payment, full or partial, is listed under <em>Every adjustment</em> exactly as recorded, and any of them can be undone (which puts the balance back to what it was before).</p>

      <h2 id="how-example">A worked example</h2>
      ${example}

      <h2 id="how-decisions">The decisions behind this</h2>
      <p>Some of these are judgement calls rather than facts. They are written down so that everyone is arguing about the same thing:</p>
      <ul>
        <li><b>Rent is by weighted area, not per head.</b> Rooms are not the same size and it would be strange to pretend otherwise.</li>
        <li><b>Bathrooms and hallways are weighted below 1×.</b> They are shared and you don't live in them; counting them at full area would overstate them.</li>
        <li><b>Rent follows liability, not presence.</b> Explained above — the room is yours whether or not you are in it.</li>
        <li><b>Shared space also follows liability.</b> Your things are still in the kitchen and the lounge, and the space is still reserved for you.</li>
        <li><b>Bills split by days, not by usage.</b> Metering who used which kilowatt is impossible and arguing about it is worse. Days in the house is the one number nobody disputes.</li>
        <li><b>One kind of person.</b> A housemate and a friend staying a fortnight are the same thing to the maths — a name with some days. Categories only ever created arguments about which category someone was in.</li>
        <li><b>Dates live in exactly one place.</b> Stints. Anything else would need keeping in step, and eventually wouldn't be.</li>
        <li><b>A stint means paying, not present.</b> Being away doesn't reduce your share; ending your stint does.</li>
        <li><b>Every bedroom must be occupied every day.</b> The rent is charged for it either way, so an empty room is money with nowhere to go.</li>
        <li><b>A shared bedroom splits equally, day by day.</b> Not by total person-days, which would over-charge a short visit.</li>
        <li><b>Everything reconciles to the penny.</b> Shares are rounded so they add back to the exact bill, rather than leaving stray pennies with nobody.</li>
        <li><b>Real bills beat estimates.</b> A month is only finished when the realised figures are in.</li>
      </ul>

      <h2 id="how-faq">Questions people ask</h2>
      <h3>I was away for three weeks. Why is my share the same?</h3>
      <p>Because your stint still covers those days, which is correct if you kept your room and stayed on the bills. The room was yours, the broadband ran, the council tax was identical. If you genuinely stopped paying for that period, shorten the stint — but then somebody else has to be in that bedroom for those days.</p>
      <h3>So when does my share actually go down?</h3>
      <p>When your stint is shorter, or when somebody else is in your bedroom for some of it. Those are the only two levers, and both live on the Who's here tab.</p>
      <h3>Someone stayed in my room for a week. Why did my rent go down?</h3>
      <p>They took on half of that room's cost for each day they were in it. That comes off your share, not anyone else's.</p>
      <h3>Why is my energy share not exactly a quarter?</h3>
      <p>Because somebody was here for a different number of days than you. With four people here the whole month it is exactly a quarter; add a five-day guest and everybody's share moves a little.</p>
      <h3>The bill went up this year. Do I have to rebuild anything?</h3>
      <p>No. Change the usual amount on the Household tab and future months start from it. Every month's figures stay editable, and past months keep what they were actually charged.</p>
      <h3>The number changed after I'd already paid. Why?</h3>
      <p>The real bill came in different from the direct-debit estimate. The month's figure was recomputed on the real number, and the difference is on your balance — either you owe a little more or you are due a refund.</p>
      <h3>I've moved out and I'm owed money. Will it get lost?</h3>
      <p>No. Balances survive leaving. You stay on the Balances tab until you are paid.</p>
      <h3>Can I see how a number was reached?</h3>
      <p>Yes — tap your name on the <b>This month</b> tab. Every line shows the amount, the basis it was split on, and how many nights or liable-days you were counted for.</p>
      <h3>Somebody is moving out. What do I do?</h3>
      <p>End their stint on the day they go, and extend or add someone else's stint so their bedroom still has an occupant. Nothing else — there is no move-out date to set. Next month copies this one, so they simply won't appear.</p>
      <h3>Do I have to set this up every month?</h3>
      <p>No. A new month starts as a copy of the previous one, with full-month stints extended to fit. In a month where nothing changed there is nothing at all to do except type the bills in.</p>

      <h2 id="how-check">Check the maths</h2>
      <p>This runs every stored month and verifies that the split adds back to the bill exactly — that the rent shares total the rent, that each bill's shares total that bill, and that nothing has fallen down a rounding crack.</p>
      <button class="btn" id="run-checks">Run the check</button>
      <div id="check-out" style="margin-top: 14px;"></div>
    `;
    document.getElementById("how-body").innerHTML = html;

    document.getElementById("run-checks").addEventListener("click", () => {
      const res = runChecks();
      const bad = res.filter(r => !r.ok);
      const warns = res.filter(r => r.warn && r.warn.length);
      const out = document.getElementById("check-out");
      out.innerHTML = `
        <div class="callout ${bad.length ? "warn" : "good"}">
          <p><b>${bad.length
            ? `${plural(bad.length, "month")} did not balance.`
            : res.length === 0 ? "There are no months to check yet."
            : res.length === 1 ? "The one month on record balances exactly."
            : `All ${res.length} months balance exactly.`}</b></p>
          ${bad.map(r => `<p>${escapeHtml(monthLabel(r.key))}: ${r.problems.map(escapeHtml).join("; ")}</p>`).join("")}
        </div>
        ${warns.length ? `<div class="callout warn"><p><b>Things worth a look:</b></p>${warns.map(r => `<p>${escapeHtml(monthLabel(r.key))}: ${r.warn.join(" ")}</p>`).join("")}</div>` : ""}`;
    });
  }

  // ============================================================
  //  RENDER: data / storage panel
  // ============================================================
  function renderData() {
    const a = Store.adapter;
    const box = document.getElementById("storage-status");
    box.className = "callout " + (a.shared ? "good" : "");
    box.innerHTML = `
      <p><b>${a.shared ? "Shared storage" : "This browser only"}</b> — ${escapeHtml(a.describe())}</p>
      ${Store.lastError ? `<p style="color: var(--red); margin-bottom: 0;"><b>${escapeHtml(Store.lastError)}</b></p>` : ""}
      ${a.shared ? `<div class="rowwrap" style="margin-top:10px;">
        <button class="btn" id="d-push">${a.autoPush ? (Store.dirty ? "Saving…" : "Save now") : (Store.dirty ? "Save &amp; share changes" : "Everything is shared")}</button>
        ${Store.dirty ? `<span style="font-size:12.5px; color:var(--orange); font-weight:600;">unsaved changes</span>` : ""}
        ${a.logout ? `<div class="spacer"></div><button class="btn-ghost btn btn-sm" id="d-logout">Sign out</button>` : ""}
      </div>` : ""}`;
    const lo = document.getElementById("d-logout");
    if (lo) lo.addEventListener("click", async () => {
      if (!confirm("Sign out of this browser?")) return;
      await Store.adapter.logout();
      location.reload();
    });
    const push = document.getElementById("d-push");
    if (push) push.addEventListener("click", async () => {
      push.disabled = true; push.textContent = "Saving…";
      try { await Store.push(); toast("Saved and shared."); }
      catch (e) { toast("Couldn't share: " + (e && e.message ? e.message : "unknown error")); }
      push.disabled = false;
      renderData();
    });
    document.getElementById("data-summary").textContent =
      `${plural(sortedMonthKeys().length, "month")} · ${a.shared ? "shared" : "local"}`;
  }

  // ============================================================
  //  RENDER: settings
  // ============================================================
  function renderSettings() {
    const key = state.currentMonth;
    const c = computeMonth(key, "eff");
    const D = daysInMonth(key);
    const gaps = bedroomGaps(key);
    const host = document.getElementById("set-away");
    const live = state.people.filter(p => !p.archived);
    const totalDays = Object.values(c.counts.liableDays).reduce((a, v) => a + v, 0);

    const rows = live.map(p => {
      const d = c.counts.liableDays[p.id] || 0;
      const pct = totalDays ? (d / totalDays) * 100 : 0;
      return `
        <div class="list-row" style="background: var(--card-2); border-radius: var(--radius); padding: 10px 13px; margin-bottom: 7px;">
          ${avatarHtml(p, 26)}
          <div class="grow" style="min-width:0;">
            <div style="font-weight:600; font-size:14px;">${escapeHtml(p.name)}</div>
            <div class="bal-note">${d} of ${D} days · ${pct.toFixed(1)}% of every bill</div>
          </div>
          <div style="font-variant-numeric:tabular-nums; font-weight:700;">${money(c.totals[p.id] || 0)}</div>
        </div>`;
    }).join("");

    host.innerHTML = `
      <div class="dim-label" style="margin-bottom:7px;">${escapeHtml(monthLabel(key))} — how the split falls out</div>
      ${rows || `<div class="empty">Nobody has a stint this month.</div>`}
      <div class="helper">Change any of this on the <b>Who's here</b> tab — it is the only place these dates exist.</div>`;

    document.getElementById("setaway-summary").textContent =
      gaps.length ? `${plural(gaps.length, "bedroom")} left empty` : "one rule, everyone the same";
    document.getElementById("setmoney-summary").textContent =
      `${state.currency}${(state.rent || 0).toLocaleString()}/mo`;

    const { total, ca } = weightedAreas();
    const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    setTxt("ex-hall-area", fmtNum(+state.catchall || 0));
    setTxt("ex-hall-weight", fmtNum(state.catchallWeight, 2));
    setTxt("ex-hall-weighted", fmtNum(ca));
    setTxt("ex-hall-pct", total > 0 ? ((ca / total) * 100).toFixed(1) + "%" : "—");
    document.getElementById("setspace-summary").textContent = `${fmtNum(+state.catchall || 0, 1)} m² at ${fmtNum(state.catchallWeight, 2)}×`;
    document.getElementById("setlook-summary").textContent = `${tweaks.theme} · ${tweaks.density}`;
    setTxt("sc-key", STORAGE_KEY);
    setTxt("sc-schema", String(SCHEMA));
  }

  // ============================================================
  //  TABS
  // ============================================================
  function showTab(name) {
    state.activeTab = name;
    document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === name));
    document.querySelectorAll(".screen").forEach(s => s.classList.toggle("active", s.dataset.screen === name));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function paintTabAlerts() {
    const M = currentMonth();
    const needsBills = M.collected && !monthAllActual(M);
    const { bal } = computeBalances();
    const anyBalance = Object.values(bal).some(v => Math.abs(v) >= 1);
    const noStints = !(M.stints || []).length;
    document.querySelector('[data-tab="month"]').classList.toggle("has-alert", needsBills);
    document.querySelector('[data-tab="stints"]').classList.toggle("has-alert", noStints);
    document.querySelector('[data-tab="balances"]').classList.toggle("has-alert", anyBalance);
  }

  // ============================================================
  //  SECTIONS (accordions)
  // ============================================================
  function bindSections() {
    document.querySelectorAll(".section").forEach(s => {
      const key = s.dataset.section;
      s.classList.toggle("open", !!state.sectionsOpen[key]);
      if (!s.dataset.wired) {
        s.dataset.wired = "1";
        const head = s.querySelector(".section-head");
        if (head) head.addEventListener("click", () => {
          s.classList.toggle("open");
          state.sectionsOpen[key] = s.classList.contains("open");
          Store.save();
        });
      }
    });
  }

  // ============================================================
  //  MASTER RENDER
  // ============================================================
  function render() {
    document.querySelectorAll(".cur-symbol").forEach(el => el.textContent = state.currency);
    renderMonth();
    renderStints();
    renderBalances();
    renderHistory();
    renderPeople();
    renderRooms();
    renderBills();
    renderSettings();
    renderHow();
    renderData();
    renderPresets();
    paintTabAlerts();
    paintSyncDot();
    bindSections();
  }

  // ============================================================
  //  PLAIN-TEXT SUMMARY
  // ============================================================
  function monthSummaryText(key) {
    const M = ensureMonth(key);
    const c = computeMonth(key, "eff");
    const pay = payer();
    const lines = [];
    lines.push(`${monthLabel(key)} — rent & bills`);
    lines.push("");
    lines.push(`Rent ${money(c.rentPence)}`);
    c.lines.forEach(l => lines.push(`${l.name} ${money(l.amount)}${l.isActual ? "" : " (estimate)"}`));
    lines.push(`Total ${money(c.grand)}`);
    lines.push("");
    state.people.forEach(p => {
      const t = c.totals[p.id] || 0;
      if (!t) return;
      const n = c.counts.liableDays[p.id] || 0;
      lines.push(`${p.name}: ${money(t)}  (${n} of ${daysInMonth(key)} days here)`);
    });
    const { bal } = computeBalances();
    const owing = state.people.filter(p => !p.isPayer && Math.abs(bal[p.id] || 0) >= 1);
    if (owing.length) {
      lines.push("");
      lines.push("Running balances:");
      owing.forEach(p => {
        const v = bal[p.id];
        lines.push(v > 0 ? `${p.name} owes ${pay.name} ${money(v)}` : `${pay.name} owes ${p.name} ${money(-v)}`);
      });
    }
    lines.push("");
    lines.push(`Everything is paid by ${pay.name}. Rent splits by weighted room area; every bill splits across the days each person was here. Same rule for everybody.`);
    return lines.join("\n");
  }

  async function copyText(txt) {
    try { await navigator.clipboard.writeText(txt); toast("Copied."); return; } catch (e) {}
    const ta = document.createElement("textarea");
    ta.value = txt; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); toast("Copied."); } catch (e) { toast("Couldn't copy — select the text manually."); }
    document.body.removeChild(ta);
  }

  // ============================================================
  //  EXPORT / IMPORT
  // ============================================================
  async function exportBackup() {
    const data = JSON.stringify(serialize(), null, 2);
    const filename = `rent-split-${new Date().toISOString().slice(0, 10)}.json`;
    try {
      if (window.claude && typeof window.claude.use === "function") {
        const dl = await window.claude.use("downloads");
        if (dl) { await dl.save({ filename, data }); toast("Backup saved."); return; }
      }
    } catch (e) {}
    try {
      const blob = new Blob([data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast("Backup downloaded.");
    } catch (e) {
      copyText(data); toast("Download blocked — the backup is on your clipboard instead.");
    }
  }

  function importBackup(text) {
    let o;
    try { o = JSON.parse(text); } catch (e) { toast("That isn't valid data."); return; }
    if (o && (o.app === APP_ID || o.v === 2 || o.months)) {
      if (!confirm("Replace everything currently on screen with this backup?")) return;
      const r = hydrate(o);
      if (r === "tooNew") { alert(loadNote); return; }
      saveAndRender();
      toast("Restored.");
      return;
    }
    if (o && (o.people || o.rooms)) {
      if (!confirm("This looks like data from the old version. Convert it and replace what's on screen?")) return;
      const notes = migrateFromV1(o);
      saveAndRender();
      toast("Converted: " + (notes.join(", ") || "done"));
      return;
    }
    toast("Couldn't recognise that data.");
  }

  // ============================================================
  //  TOP-LEVEL HANDLERS
  // ============================================================
  function goMonth(delta) {
    state.currentMonth = addMonths(state.currentMonth, delta);
    ensureMonth(state.currentMonth);
    saveAndRender();
  }
  document.getElementById("m-prev").addEventListener("click", () => goMonth(-1));
  document.getElementById("m-next").addEventListener("click", () => goMonth(1));
  document.getElementById("s-prev").addEventListener("click", () => goMonth(-1));
  document.getElementById("s-next").addEventListener("click", () => goMonth(1));
  document.getElementById("m-jump").addEventListener("change", e => {
    if (!/^\d{4}-\d{2}$/.test(e.target.value)) return;
    state.currentMonth = e.target.value;
    ensureMonth(state.currentMonth);
    saveAndRender();
  });

  document.getElementById("m-add-oneoff").addEventListener("click", () => {
    const M = currentMonth();
    M.oneOffs = M.oneOffs || [];
    M.oneOffs.push({ id: uid("oo"), name: "One-off charge", est: 0, act: null, payers: null });
    saveAndRender();
  });

  document.getElementById("m-copy-prev").addEventListener("click", () => {
    const M = currentMonth();
    const prev = state.months[addMonths(state.currentMonth, -1)];
    if (!prev) { toast("There's no previous month on record."); return; }
    let n = 0;
    state.bills.forEach(b => {
      const pl = prev.lines[b.id];
      if (pl && typeof pl.act === "number") { M.lines[b.id].est = pl.act; n++; }
      else if (pl) { M.lines[b.id].est = +pl.est || 0; n++; }
    });
    saveAndRender();
    toast(`${plural(n, "estimate")} pulled from ${monthLabel(addMonths(state.currentMonth, -1))}.`);
  });

  document.getElementById("m-lock").addEventListener("click", () => {
    const M = currentMonth();
    if (!M.collected) {
      // Freeze the setup as well as the amounts. From here the month is a
      // record of what happened, not a view of the current configuration.
      M.config = captureConfig();
      M.charged = computeMonthInner(state.currentMonth, "est", M).totals;
      M.collected = true;
      M.chargedAt = new Date().toISOString().slice(0, 10);
      toast("Locked — this month's rent, rooms, bills and people are now frozen.");
    } else {
      if (!confirm("Unlock? This month goes back to following the current rent, rooms and bills, and its true-ups come off the balances until you lock it again.")) return;
      M.collected = false; M.charged = null; M.chargedAt = ""; M.config = null;
    }
    saveAndRender();
  });

  document.getElementById("m-copy-text").addEventListener("click", () => copyText(monthSummaryText(state.currentMonth)));
  document.getElementById("m-print").addEventListener("click", () => {
    // Open every statement so the printout is complete.
    state.people.forEach(p => state.openStatements[p.id] = true);
    render();
    setTimeout(() => window.print(), 120);
  });

  document.getElementById("m-note").addEventListener("input", e => {
    currentMonth().note = e.target.value; Store.save();
  });
  document.getElementById("m-reseed").addEventListener("click", () => {
    if (!confirm("Rebuild this month's stints from the roster? Any visitor stays and away periods you've entered for this month are lost.")) return;
    seedStints(state.currentMonth);
    saveAndRender();
    toast("Rebuilt from the roster.");
  });
  document.getElementById("m-delete").addEventListener("click", () => {
    const k = state.currentMonth;
    if (!confirm(`Delete ${monthLabel(k)} entirely? Its bills, stints and true-ups all go.`)) return;
    delete state.months[k];
    ensureMonth(k);
    saveAndRender();
  });

  document.getElementById("add-stint").addEventListener("click", () => {
    const M = currentMonth();
    const D = daysInMonth(state.currentMonth);
    const p = state.people.find(x => !x.archived);
    if (!p) { toast("Add someone on the Setup tab first."); return; }
    M.stints.push({ id: uid("st"), personId: p.id, roomId: lastRoomOf(p.id), from: 1, to: D });
    saveAndRender();
  });

  document.getElementById("add-guest").addEventListener("click", () => {
    if (state.people.filter(p => !p.archived).length >= MAX_PEOPLE) { toast(`That's the limit of ${MAX_PEOPLE} people.`); return; }
    const name = prompt("Who is it?", "Someone new");
    if (name === null) return;
    const D = daysInMonth(state.currentMonth);
    const room = (state.rooms.find(r => !r.communal) || {}).id;
    const p = { id: uid("p"), name: (name.trim() || "Someone new"), isPayer: false, archived: false };
    state.people.push(p);
    const mid = Math.max(1, Math.round(D / 3));
    currentMonth().stints.push({ id: uid("st"), personId: p.id, roomId: room, from: mid, to: Math.min(D, mid + 6), here: true });
    saveAndRender();
    showTab("stints");
    toast("Added — set their dates and which bedroom they're in.");
  });

  document.getElementById("add-person").addEventListener("click", () => {
    if (state.people.filter(p => !p.archived).length >= MAX_PEOPLE) { toast(`That's the limit of ${MAX_PEOPLE} people.`); return; }
    const room = (state.rooms.find(r => !r.communal) || {}).id;
    state.people.push({ id: uid("p"), name: `Person ${state.people.length + 1}`, isPayer: false, archived: false });
    saveAndRender();
  });

  document.getElementById("add-room").addEventListener("click", () => {
    state.rooms.push({ id: uid("rm"), name: "New room", w: 3, l: 3, weight: 1, communal: false });
    saveAndRender();
  });

  document.getElementById("add-bill").addEventListener("click", () => {
    state.bills.push({ id: uid("bl"), name: "New bill", kind: "fixed", est: 0, payers: null });
    Object.values(state.months).forEach(M => { M.lines[state.bills[state.bills.length - 1].id] = { est: 0, act: null }; });
    saveAndRender();
  });

  document.getElementById("rent").addEventListener("input", e => { state.rent = parseFloat(e.target.value) || 0; Store.save(); renderQuiet(); });
  document.getElementById("catchall").addEventListener("input", e => { state.catchall = parseFloat(e.target.value) || 0; Store.save(); renderQuiet(); });
  document.getElementById("catchall-weight").addEventListener("input", e => {
    let v = parseFloat(e.target.value); if (!isFinite(v) || v < 0) v = 0;
    state.catchallWeight = v; Store.save(); renderQuiet();
  });
  document.getElementById("currency").addEventListener("change", e => { state.currency = e.target.value; saveAndRender(); });

  document.getElementById("d-export").addEventListener("click", exportBackup);
  document.getElementById("d-import-toggle").addEventListener("click", () => {
    const b = document.getElementById("d-import-box");
    b.style.display = b.style.display === "none" ? "block" : "none";
  });
  document.getElementById("d-import-cancel").addEventListener("click", () => {
    document.getElementById("d-import-box").style.display = "none";
  });
  document.getElementById("d-import-go").addEventListener("click", () => {
    importBackup(document.getElementById("d-import-text").value.trim());
    document.getElementById("d-import-box").style.display = "none";
  });
  document.getElementById("d-migrate").addEventListener("click", () => {
    const o = readV1();
    if (!o) {
      toast("No data from the old version found in this browser.");
      document.getElementById("d-import-box").style.display = "block";
      document.getElementById("d-import-text").placeholder =
        "Open the old Rent Split, press ⌥⌘I → Console, run:  copy(localStorage.getItem('rent-split-apple-v1'))  then paste here.";
      return;
    }
    if (!confirm("Bring the old version's people, rooms, rent and bills across? This replaces what's on screen.")) return;
    const notes = migrateFromV1(o);
    saveAndRender();
    toast("Brought across: " + (notes.join(", ") || "done"));
  });

  document.getElementById("reset").addEventListener("click", () => {
    if (!confirm("Reset everything — people, rooms, bills, every month and every balance — back to defaults? Saved properties are kept.")) return;
    state.currency = "£";
    state.rent = DEFAULT_RENT;
    state.catchall = DEFAULT_CATCHALL;
    state.catchallWeight = DEFAULT_CATCHALL_WEIGHT;
    state.rooms = DEFAULT_ROOMS.map(r => ({ ...r }));
    state.people = DEFAULT_PEOPLE.map(p => ({ ...p }));
    state.bills = DEFAULT_BILLS.map(b => ({ ...b }));
    state.months = {};
    state.ledger = [];
    state.activePresetName = null;
    state.currentMonth = todayKey();
    ensureMonth(state.currentMonth);
    normalise();
    initFields();
    saveAndRender();
  });

  // --- properties sheet ---
  function openSheet() { document.getElementById("prop-sheet").classList.add("open"); renderPresets(); }
  function closeSheet() { document.getElementById("prop-sheet").classList.remove("open"); }
  document.getElementById("prop-pill").addEventListener("click", openSheet);
  document.getElementById("prop-sheet-close").addEventListener("click", closeSheet);
  document.getElementById("prop-sheet").addEventListener("click", e => { if (e.target.id === "prop-sheet") closeSheet(); });
  document.getElementById("save-current").addEventListener("click", () => {
    const name = prompt("Name for this property?", `Property ${state.presets.length + 1}`);
    if (!name || !name.trim()) return;
    const t = name.trim();
    const i = state.presets.findIndex(p => p.name === t);
    if (i >= 0) {
      if (!confirm(`"${t}" already exists. Overwrite it?`)) return;
      state.presets[i] = { name: t, snapshot: snapshotCurrent() };
    } else {
      state.presets.push({ name: t, snapshot: snapshotCurrent() });
    }
    state.activePresetName = t;
    Store.save(); renderPresets();
    toast("Saved.");
  });

  // --- appearance ---
  document.getElementById("theme-toggle").addEventListener("click", () => {
    tweaks.theme = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    saveTweaks(); applyTheme();
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { if (tweaks.theme === "auto") applyTheme(); });
  function renderSwatches() {
    ["tw-swatches", "set-swatches"].forEach(id => {
      const host = document.getElementById(id);
      if (!host) return;
      host.innerHTML = "";
      ACCENTS.forEach(a => {
        const b = document.createElement("button");
        b.className = "tw-swatch"; b.dataset.accent = a.v; b.style.background = a.v; b.title = a.name;
        b.addEventListener("click", () => { tweaks.accent = a.v; saveTweaks(); applyTheme(); });
        host.appendChild(b);
      });
    });
  }
  document.querySelectorAll("[data-theme-set]").forEach(b =>
    b.addEventListener("click", () => { tweaks.theme = b.dataset.themeSet; saveTweaks(); applyTheme(); }));
  document.querySelectorAll("[data-density-set]").forEach(b =>
    b.addEventListener("click", () => { tweaks.density = b.dataset.densitySet; saveTweaks(); applyTheme(); }));
  document.getElementById("tweaks-toggle").addEventListener("click", () =>
    document.getElementById("tweaks-panel").classList.toggle("open"));
  document.getElementById("tweaks-close").addEventListener("click", () => {
    document.getElementById("tweaks-panel").classList.remove("open");
    try { window.parent.postMessage({ type: '__edit_mode_dismissed' }, '*'); } catch (e) {}
  });
  window.addEventListener("message", e => {
    if (!e.data) return;
    if (e.data.type === "__activate_edit_mode") {
      document.getElementById("tweaks-toggle").style.display = "inline-flex";
      document.getElementById("tweaks-panel").classList.add("open");
    } else if (e.data.type === "__deactivate_edit_mode") {
      document.getElementById("tweaks-toggle").style.display = "none";
      document.getElementById("tweaks-panel").classList.remove("open");
    }
  });
  setTimeout(() => { try { window.parent.postMessage({ type: '__edit_mode_available' }, '*'); } catch (e) {} }, 200);

  // --- tabs ---
  document.getElementById("tabs").addEventListener("click", e => {
    const t = e.target.closest(".tab");
    if (t) showTab(t.dataset.tab);
  });

  // ============================================================
  //  INIT
  // ============================================================
  function initFields() {
    document.getElementById("rent").value = state.rent;
    document.getElementById("catchall").value = state.catchall;
    document.getElementById("catchall-weight").value = state.catchallWeight;
    document.getElementById("currency").value = state.currency;
  }

  function showLogin() {
    document.body.classList.add("no-auth");
    const sheet = document.getElementById("login-sheet");
    sheet.classList.add("open");
    setTimeout(() => { const f = document.getElementById("login-pass"); if (f) f.focus(); }, 80);
  }
  function hideLogin() {
    document.body.classList.remove("no-auth");
    document.getElementById("login-sheet").classList.remove("open");
  }

  document.getElementById("login-form").addEventListener("submit", async e => {
    e.preventDefault();
    const btn = document.getElementById("login-go");
    const err = document.getElementById("login-error");
    const pass = document.getElementById("login-pass").value;
    err.style.display = "none";
    btn.disabled = true; btn.textContent = "Checking…";
    let good = false;
    try { good = await Store.adapter.login(pass); } catch (ex) {}
    btn.disabled = false; btn.textContent = "Sign in";
    if (!good) {
      err.textContent = "That password didn't work.";
      err.style.display = "block";
      return;
    }
    document.getElementById("login-pass").value = "";
    Store.needAuth = false;
    hideLogin();
    const data = await Store.load();
    if (data) hydrate(data);
    ensureMonth(state.currentMonth);
    initFields();
    render();
    Store.saveLocal();   // keep the local fallback copy fresh, without pushing anything back
    Store.startPolling();
    toast("Signed in.");
  });

  async function boot() {
    renderSwatches();
    applyTheme();

    await Store.init();
    if (Store.needAuth) {
      // Show the app shell behind the prompt so it doesn't look broken.
      normalise(); ensureMonth(state.currentMonth); initFields();
      showTab(state.activeTab || "month"); render();
      showLogin();
      return;
    }
    const saved = await Store.load();

    // Did loading actually change anything, beyond just putting the same
    // data back into `state`? Only a real change is worth writing back —
    // otherwise every plain page load would re-save unchanged data, and
    // against a shared server that means an unnecessary revision bump and
    // backup file every single time anyone opens the app.
    let changed = false;
    const res = saved ? hydrate(saved) : false;
    if (res === "tooNew") {
      Store.readOnly = true;
      setTimeout(() => toast("Saved by a newer version — nothing loaded, nothing overwritten."), 700);
    } else if (res) {
      changed = lastHydrateChanged;   // true only if hydrate() upgraded an old schema
    } else {
      changed = true;                 // first run, or nothing recognisable was saved yet
      const legacy = readV1();
      if (legacy) {
        const notes = migrateFromV1(legacy);
        setTimeout(() => toast("Brought your data over from the old version: " + (notes.join(", ") || "done")), 700);
      } else {
        normalise();
        ensureMonth(state.currentMonth);
      }
    }

    ensureMonth(state.currentMonth);
    initFields();
    showTab(state.activeTab || "month");
    render();
    if (!Store.readOnly) { if (changed) Store.save(); else Store.saveLocal(); }
    Store.startPolling();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
