// server.js — PostgreSQL version
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const path = require("path");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = process.env.JWT_SECRET || "dev-only-secret";
const DATABASE_URL = process.env.DATABASE_URL;

console.log("[DEBUG] JWT_SECRET loaded:", process.env.JWT_SECRET ? "env var set" : "FELL BACK TO DEFAULT");
console.log("[DEBUG] DATABASE_URL loaded:", DATABASE_URL ? "✅ Connected" : "❌ Missing");

// Instance identifier
const INSTANCE_ID = `${process.pid}-${Math.random().toString(36).slice(2,7)}`;
console.log('[BOOT] Instance', INSTANCE_ID);

// PostgreSQL connection pool
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL && !DATABASE_URL.includes('localhost') ? { rejectUnauthorized: false } : false
});

// Test database connection and create table if needed
(async () => {
  try {
    const client = await pool.connect();
    console.log('[DB] ✅ Connected to PostgreSQL');
    
    // Create events table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS events (
        id BIGSERIAL PRIMARY KEY,
        user_username VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        date VARCHAR(50) NOT NULL,
        location VARCHAR(255),
        scout VARCHAR(255),
        count INTEGER NOT NULL,
        rows JSONB NOT NULL,
        dsp BOOLEAN DEFAULT FALSE,
        blast JSONB DEFAULT '[]',
        trackman JSONB DEFAULT '[]',
        players JSONB DEFAULT '[]',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    
    // Create index for faster queries
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_events_user ON events(user_username);
    `);
    
    console.log('[DB] ✅ Events table ready');
    client.release();
  } catch (err) {
    console.error('[DB] ❌ Connection error:', err);
    process.exit(1);
  }
})();

// Middleware
app.use(express.json());
app.use(cors());

// Never cache API responses
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// Static frontend
app.use(express.static(path.join(__dirname, "public")));

// --------- Users (plaintext shown is what users type to log in) ----------
const RAW_USERS = [
  { username: "faffanis",      password: "faffanis",      role: "scout", fullName: "Fesar Affanis" },
  { username: "malvarez",      password: "malvarez",      role: "scout", fullName: "Manny Alvarez" },
  { username: "mberumen",      password: "mberumen",      role: "scout", fullName: "Manuel Berumen" },
  { username: "fbreton",       password: "fbreton",       role: "scout", fullName: "Fausto Breton" },
  { username: "jcabrera",      password: "jcabrera",      role: "scout", fullName: "Jose Cabrera" },
  { username: "jcalderon",     password: "jcalderon",     role: "scout", fullName: "Juan Carlos Calderon" },
  { username: "rcastro",       password: "rcastro",       role: "scout", fullName: "Richard Castro" },
  { username: "tclaus",        password: "tclaus",        role: "scout", fullName: "Todd Claus" },
  { username: "jcruz",         password: "jcruz",         role: "scout", fullName: "Jonathan Cruz" },
  { username: "jfitzpatrick",  password: "jfitzpatrick",  role: "scout", fullName: "John Fitzpatrick" },
  { username: "egomez",        password: "egomez",        role: "scout", fullName: "Ernesto Gomez" },
  { username: "mgroopman",     password: "mgroopman",     role: "scout", fullName: "Michael Groopman" },
  { username: "mheil",         password: "mheil",         role: "scout", fullName: "Mark Heil" },
  { username: "rjacobo",       password: "rjacobo",       role: "scout", fullName: "Ricardo Jacobo" },
  { username: "jkaregeannes",  password: "jkaregeannes",  role: "scout", fullName: "Jason Karegeannes" },
  { username: "jkim",          password: "jkim",          role: "scout", fullName: "John Kim" },
  { username: "mlaureano",     password: "mlaureano",     role: "scout", fullName: "Matias Laureano" },
  { username: "ilechuga",      password: "ilechuga",      role: "scout", fullName: "Isaac Lechuga" },
  { username: "llin",          password: "llin",          role: "scout", fullName: "Louie Lin" },
  { username: "wlobo",         password: "wlobo",         role: "scout", fullName: "Wilder Lobo" },
  { username: "kmatsumoto",    password: "kmatsumoto",    role: "scout", fullName: "Kento Matsumoto" },
  { username: "emedina",       password: "emedina",       role: "scout", fullName: "Esau Medina" },
  { username: "amejia",        password: "amejia",        role: "scout", fullName: "Alberto Mejia" },
  { username: "rmendoza",      password: "rmendoza",      role: "scout", fullName: "Rafael Mendoza" },
  { username: "rmora",         password: "rmora",         role: "scout", fullName: "Ramon Mora" },
  { username: "cmorillo",      password: "cmorillo",      role: "scout", fullName: "Cesar Morillo" },
  { username: "rmotooka",      password: "rmotooka",      role: "scout", fullName: "Rafael Motooka" },
  { username: "dneuman",       password: "dneuman",       role: "scout", fullName: "Dennis Neuman" },
  { username: "cocando",       password: "cocando",       role: "scout", fullName: "Carlos Ocando" },
  { username: "rpino",         password: "rpino",         role: "scout", fullName: "Rolando Pino" },
  { username: "eramirez",      password: "eramirez",      role: "scout", fullName: "Edward Ramirez" },
  { username: "arequena",      password: "arequena",      role: "scout", fullName: "Alex Requena" },
  { username: "hrincones",     password: "hrincones",     role: "scout", fullName: "Hector Rincones" },
  { username: "eromero",       password: "eromero",       role: "scout", fullName: "Eddie Romero" },
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

// --------- API routes ----------
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Debug helper
app.get("/api/__debug/has/:u", (req, res) => {
  const name = (req.params.u || "").trim();
  const exists = !!USERS.find(x => x.username === name);
  res.json({ user: name, exists, count: USERS.length });
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

// ---- Debug: whoami + instance ----
app.get('/api/whoami', auth, (req, res) => {
  res.json({ instance: INSTANCE_ID, user: req.user });
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

// ---- Events API ----

const FULLNAME_TO_USERNAME = new Map(
  USERS.map(u => [(u.fullName || '').trim().toLowerCase(), u.username])
);

// POST /api/events (scout uploads one event; stored in database)
app.post("/api/events", auth, async (req, res) => {
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

  console.log("DEBUG received EVENT FROM", u, "named:", name, "rows:", rows.length);

  try {
    const result = await pool.query(
      `INSERT INTO events (user_username, name, date, location, scout, count, rows, dsp, blast, trackman, players)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [
        u,
        name,
        date,
        location,
        scout || u,
        rows.length,
        JSON.stringify(rows),
        dsp,
        JSON.stringify(Array.isArray(blast) ? blast : []),
        JSON.stringify(Array.isArray(trackman) ? trackman : []),
        JSON.stringify(Array.isArray(players) ? players : [])
      ]
    );
    
    const eventId = result.rows[0].id;
    console.log("[SERVER] Saved event:", name, "for", u, "with ID", eventId);
    console.log("[SERVER] Event saved to PostgreSQL on", INSTANCE_ID);
    
    res.json({ ok: true, id: eventId });
  } catch (err) {
    console.error("[SERVER] Database insert error:", err);
    res.status(500).json({ message: "Database error" });
  }
});

// GET /api/events (admin can fetch any; scouts only themselves)
app.get("/api/events", auth, async (req, res) => {
  const me = req.user; // { username, role }
  let { user } = req.query;

  // Normalize requested user
  const raw = (user || me.username || "").trim();
  const lcRaw = raw.toLowerCase();
  const normalized = FULLNAME_TO_USERNAME.get(lcRaw) || lcRaw;

  console.log("[SERVER] GET /api/events by", me?.username, "role", me?.role, "query raw=", raw, "-> normalized=", normalized);

  // Authz: non-admin can only ask for themselves
  if (me.role !== "admin" && normalized !== me.username) {
    return res.status(403).json({ message: "Forbidden" });
  }

  try {
    const result = await pool.query(
      `SELECT id, user_username as user, name, date, location, scout, count, rows, dsp, blast, trackman, players, created_at
       FROM events
       WHERE user_username = $1
       ORDER BY id DESC`,
      [normalized]
    );
    
    // Parse JSON fields back to objects/arrays
    const events = result.rows.map(row => ({
      id: parseInt(row.id),
      user: row.user,
      name: row.name,
      date: row.date,
      location: row.location,
      scout: row.scout,
      count: row.count,
      rows: row.rows, // Already parsed by PostgreSQL
      dsp: row.dsp,
      blast: row.blast,
      trackman: row.trackman,
      players: row.players,
      createdAt: row.created_at
    }));
    
    console.log("[SERVER] RETURNING", events.length, "events for", normalized, "on", INSTANCE_ID);
    res.json({ user: normalized, events });
  } catch (err) {
    console.error("[SERVER] Database query error:", err);
    res.status(500).json({ message: "Database error" });
  }
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
