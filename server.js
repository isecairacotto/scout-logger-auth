// server.js — deployable Node server (Express 5-safe)
// - Serves /public/index.html (frontend)
// - Auth API at /api/login
// - Events sync API at /api/events (POST/GET)
// - Works locally (http://localhost:3000) and on hosts (Render/Railway/etc.)

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = process.env.JWT_SECRET || "dev-only-secret";
console.log("[DEBUG] JWT_SECRET loaded:", process.env.JWT_SECRET ? "env var set" : "FELL BACK TO DEFAULT");

// ---- Instance identifier for debugging multi-instance/restarts ----
const INSTANCE_ID = `${process.pid}-${Math.random().toString(36).slice(2,7)}`;
console.log('[BOOT] Instance', INSTANCE_ID);

// --------- Middleware ----------
app.use(express.json());
app.use(cors());

// ---- Never cache API responses (prevents stale SW/browser caching) ----
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

// --------- Static frontend (/public) ----------
app.use(express.static(path.join(__dirname, "public")));

// --------- Users (plaintext shown is what users type to log in) ----------
const RAW_USERS = [
  { username: "faffanis",      password: "faffanis",      role: "scout", fullName: "Fesar Affanis" },
  { username: "malvarez",      password: "malvarez",      role: "scout", fullName: "Manny Alvarez" },
  { username: "mberumen",      password: "mberumen",      role: "scout", fullName: "Manuel Berumen" },
  { username: "fbreton",       password: "fbreton",       role: "scout", fullName: "Fausto Breton" },
  { username: "scabral",       password: "scabral",       role: "scout", fullName: "Sammy Cabral" },
  { username: "jcabrera",      password: "jcabrera",      role: "scout", fullName: "Jose Cabrera" },
  { username: "jcalderon",     password: "jcalderon",     role: "scout", fullName: "Juan Carlos Calderon" },
  { username: "pciriaco",      password: "pciriaco",      role: "scout", fullName: "Pedro Ciriaco" },
  { username: "tclaus",        password: "tclaus",        role: "scout", fullName: "Todd Claus" },
  { username: "jcruz",         password: "jcruz",         role: "scout", fullName: "Jonathan Cruz" },
  { username: "rcubillan",     password: "rcubillan",     role: "scout", fullName: "Ricardo Cubillan" },
  { username: "jdavis",        password: "jdavis",        role: "scout", fullName: "Javaughn Davis" },
  { username: "jfitzpatrick",  password: "jfitzpatrick",  role: "scout", fullName: "John Fitzpatrick" },
  { username: "egomez",        password: "egomez",        role: "scout", fullName: "Ernesto Gomez" },
  { username: "mgroopman",     password: "mgroopman",     role: "scout", fullName: "Michael Groopman" },
  { username: "jhernandez",    password: "jhernandez",    role: "scout", fullName: "Javier Hernandez" },
  { username: "jkaregeannes",  password: "jkaregeannes",  role: "scout", fullName: "Jason Karegeannes" },
  { username: "jkim",          password: "jkim",          role: "scout", fullName: "John Kim" },
  { username: "mlaureano",     password: "mlaureano",     role: "scout", fullName: "Matias Laureano" },
  { username: "llin",          password: "llin",          role: "scout", fullName: "Louie Lin" },
  { username: "wlobo",         password: "wlobo",         role: "scout", fullName: "Wilder Lobo" },
  { username: "kmatsumoto",    password: "kmatsumoto",    role: "scout", fullName: "Kento Matsumoto" },
  { username: "emedina",       password: "emedina",       role: "scout", fullName: "Esau Medina" },
  { username: "amejia",        password: "amejia",        role: "scout", fullName: "Alberto Mejia" },
  { username: "rmendoza",      password: "rmendoza",      role: "scout", fullName: "Rafael Mendoza" },
  { username: "rmora",         password: "rmora",         role: "scout", fullName: "Ramon Mora" },
  { username: "cmorillo",      password: "cmorillo",      role: "scout", fullName: "Cesar Morillo" },
  { username: "rmotooka",      password: "rmotooka",      role: "scout", fullName: "Rafael Motooka" },
  { username: "enanita",       password: "enanita",       role: "scout", fullName: "Emmanuel Nanita" },
  { username: "dneuman",       password: "dneuman",       role: "scout", fullName: "Dennis Neuman" },
  { username: "cocando",       password: "cocando",       role: "scout", fullName: "Carlos Ocando" },
  { username: "rpino",         password: "rpino",         role: "scout", fullName: "Rolando Pino" },
  { username: "eramirez",      password: "eramirez",      role: "scout", fullName: "Edward Ramirez" },
  { username: "arequena",      password: "arequena",      role: "scout", fullName: "Alex Requena" },
  { username: "hrincones",     password: "hrincones",     role: "scout", fullName: "Hector Rincones" },
  { username: "mrodriguez",    password: "mrodriguez",    role: "scout", fullName: "Martin Rodriguez" },
  { username: "eromero",       password: "eromero",       role: "scout", fullName: "Eddie Romero" },
  { username: "rsaggiadi",     password: "rsaggiadi",     role: "scout", fullName: "Rene Saggiadi" },
  { username: "lsambo",        password: "lsambo",        role: "scout", fullName: "Luigi Sambo" },
  { username: "gschilz",       password: "gschilz",       role: "scout", fullName: "Greg Schilz" },
  { username: "czamora",       password: "czamora",       role: "scout", fullName: "Cesar Zamora" },
  // admins
  { username: "mcuellar",      password: "mcuellar",      role: "admin", fullName: "Marcus Cuellar" },
  { username: "jfitzpatrick",  password: "jfitzpatrick",  role: "admin", fullName: "John Fitzpatrick" },
  { username: "cschneider",    password: "cschneider",    role: "admin", fullName: "Coby Schneider" },
  { username: "isecairacotto", password: "isecairacotto", role: "admin", fullName: "Isabella Secaira-Cotto" }
];

// De-dupe by username; prefer admin if duplicate (covers jfitzpatrick)
const seen = new Map();
for (const u of RAW_USERS) {
  const key = (u.username || "").trim().toLowerCase();
  const prev = seen.get(key);
  if (!prev) seen.set(key, u);
  else seen.set(key, (prev.role === "admin" || u.role === "admin") ? { ...prev, ...u, role: "admin" } : u);
}

// Hash passwords at startup
const USERS = Array.from(seen.values()).map(u => ({
  username: u.username.trim().toLowerCase(),
  fullName: u.fullName,
  role: u.role,
  password: bcrypt.hashSync(u.password, 10),
}));

// --------- Events persistence (simple JSON file) ----------
const DATA_FILE = path.join(__dirname, "events.json");

function loadEvents() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, "utf8")); }
  catch { return []; }
}
function saveEvents(list) {
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2)); } catch {}
}
let EVENTS = loadEvents(); // [{ id, user, name, date, location, scout, count, rows, dsp, blast, trackman, createdAt }]

// --------- API routes ----------
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Debug helper
app.get("/api/__debug/has/:u", (req, res) => {
  const name = (req.params.u || "").trim();
  const exists = !!USERS.find(x => x.username === name);
  res.json({ user: name, exists, count: USERS.length });
});

// ---- Debug: whoami + instance ----
app.get('/api/whoami', auth, (req, res) => {
  res.json({ instance: INSTANCE_ID, user: req.user });
});

// ---- Debug: events count + instance ----
app.get('/api/events_count', auth, (_req, res) => {
  res.json({ instance: INSTANCE_ID, count: EVENTS.length });
});

// Login
app.post("/api/login", (req, res) => {
  let { username, password } = req.body || {};
  username = (username || "").trim().toLowerCase();
  password = (password || "").trim();

  const user = USERS.find(u => u.username === username);
  if (!user) return res.status(401).json({ message: "Invalid credentials" });

  const ok = bcrypt.compareSync(password, user.password);
  if (!ok) return res.status(401).json({ message: "Invalid credentials" });

  const token = jwt.sign({ username: user.username, role: user.role }, SECRET_KEY, { expiresIn: "12h" });
  res.json({ token, fullName: user.fullName, role: user.role });
});

function auth(req, res, next) { /* you already have this for events */ next(); }

app.get("/api/users", auth, (req, res) => {
  if (req.user?.role !== "admin") return res.status(403).json({ message: "Forbidden" });
  // return sorted by last name
  const byLast = [...USERS].sort((a,b) => {
    const la = (a.fullName||'').trim().split(/\s+/).slice(-1)[0].toLowerCase();
    const lb = (b.fullName||'').trim().split(/\s+/).slice(-1)[0].toLowerCase();
    return la.localeCompare(lb);
  });
  res.json(byLast.map(u => ({ username: u.username, fullName: u.fullName, role: u.role })));
});

// ---- Auth middleware for events API ----
function auth(req, res, next) {
  const hdr = req.headers.authorization || "";
  const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : null;
  if (!token) return res.status(401).json({ message: "Missing token" });
  try {
    req.user = jwt.verify(token, SECRET_KEY); // { username, role }
    next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
}

// ---- Events API ----

// POST /api/events  (scout uploads one event; stored server-side)
app.post("/api/events", auth, (req, res) => {
  const u = req.user?.username;
  if (!u) return res.status(403).json({ message: "Forbidden" });
  console.log("[SERVER] Received /api/events from", u, "body keys:", Object.keys(req.body));


  const {
    name = "Untitled",
    date,
    location = "",
    scout = "",
    rows = [],
    dsp = false,
    blast = [],
    trackman = [],
    players = [],
  } = req.body || {};

  if (!date || !Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ message: "Missing date or rows" });
  }

  const evt = {
    id: Date.now(),
    user: u,
    name,
    date,
    location,
    scout: scout || u,
    count: rows.length,
    rows,
    dsp: !!dsp,
    blast: Array.isArray(blast) ? blast : [],
    trackman: Array.isArray(trackman) ? trackman : [],
    players: Array.isArray(players) ? players : [],
    createdAt: new Date().toISOString(),
  };

  console.log("DEBUG received EVENT FROM", u,
              "named:", name,
              "rows:", rows.length);

EVENTS.push(evt);
saveEvents(EVENTS);
console.log("[SERVER] Saved event:", evt.name, "for", evt.user);
console.log("[SERVER] TOTAL_EVENTS_AFTER_SAVE =", EVENTS.length, "on", INSTANCE_ID);
res.json({ ok: true, id: evt.id });
});

const FULLNAME_TO_USERNAME = new Map(
  USERS.map(u => [(u.fullName || '').trim().toLowerCase(), u.username])
);

// ---- GET /api/events (admin can fetch any; scouts only themselves)
app.get("/api/events", auth, (req, res) => {
  const me = req.user; // { username, role }
  let { user } = req.query;

  // Normalize requested user:
  // - accept username (any case) OR full name
  // - fall back to requester if none
  const raw = (user || me.username || "").trim();
  const lcRaw = raw.toLowerCase();
  const normalized = FULLNAME_TO_USERNAME.get(lcRaw) || lcRaw; // final username (lowercased)

  console.log("[SERVER] GET /api/events by", me?.username, "role", me?.role, "query raw=", raw, "-> normalized=", normalized);

  // Authz: non-admin can only ask for themselves (after normalization)
  if (me.role !== "admin" && normalized !== me.username) {
    return res.status(403).json({ message: "Forbidden" });
  }

  // Tolerant matching for legacy data:
  // - e.user stored as username (normal case)
  // - e.user accidentally stored as full name (legacy)
  // - e.scout holds display full name; map that too
  const list = EVENTS.filter(e => {
    const eu = (e.user || "").trim().toLowerCase();
    const es = (e.scout || "").trim().toLowerCase();

    // exact username match
    if (eu === normalized) return true;

    // legacy: e.user saved as full name -> map to username
    const euAsUsername = FULLNAME_TO_USERNAME.get(eu);
    if (euAsUsername && euAsUsername === normalized) return true;

    // very legacy/tolerant: match by scout full name label
    const esAsUsername = FULLNAME_TO_USERNAME.get(es);
    if (esAsUsername && esAsUsername === normalized) return true;

    return false;
  }).sort((a, b) => b.id - a.id);
  
  console.log("[SERVER] RETURNING", list.length, "events for", normalized, "on", INSTANCE_ID);
  res.json({ user: normalized, events: list });
});

// --------- SPA fallback (after static + API) ----------
app.use((req, res, next) => {
  if (req.method !== "GET") return next();
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// --------- Error handler ----------
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: "Server error" });
});

// --------- Start ----------
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
