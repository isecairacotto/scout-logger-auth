// server.js — deployable Node server (Express 5-safe)
// - Serves /public/index.html (frontend)
// - Auth API at /api/login
// - Works locally (http://localhost:3000) and on hosts (Render/Railway/etc.)

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = process.env.JWT_SECRET || "dev-only-secret";

// ----- Middleware -----
app.use(express.json());
// If frontend is served from this same server, CORS isn't strictly needed,
// but leaving it enabled is fine. Lock it down later if you split FE/BE.
app.use(cors());

// ----- Serve the frontend (public/index.html) -----
app.use(express.static(path.join(__dirname, "public")));

// ----- Users (plaintext shown is what users type to log in) -----
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
  const key = (u.username || "").trim();
  const prev = seen.get(key);
  if (!prev) seen.set(key, u);
  else seen.set(key, (prev.role === "admin" || u.role === "admin") ? { ...prev, ...u, role: "admin" } : u);
}

// Hash passwords at startup
const USERS = Array.from(seen.values()).map(u => ({
  username: u.username.trim(),
  fullName: u.fullName,
  role: u.role,
  password: bcrypt.hashSync(u.password, 10),
}));

// ----- API routes -----
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Debug helper
app.get("/api/__debug/has/:u", (req, res) => {
  const name = (req.params.u || "").trim();
  const exists = !!USERS.find(x => x.username === name);
  res.json({ user: name, exists, count: USERS.length });
});

// Login
app.post("/api/login", (req, res) => {
  let { username, password } = req.body || {};
  username = (username || "").trim();
  password = (password || "").trim();

  const user = USERS.find(u => u.username === username);
  if (!user) return res.status(401).json({ message: "Invalid credentials" });

  const ok = bcrypt.compareSync(password, user.password);
  if (!ok) return res.status(401).json({ message: "Invalid credentials" });

  const token = jwt.sign({ username: user.username, role: user.role }, SECRET_KEY, { expiresIn: "12h" });
  res.json({ token, fullName: user.fullName, role: user.role });
});

// ----- SPA fallback (Express 5 safe, no path-to-regexp) -----
// Put AFTER static + API routes. Serves index.html for any non-API GET.
app.use((req, res, next) => {
  if (req.method !== "GET") return next();
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Optional: basic error handler
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: "Server error" });
});

// ----- Start server -----
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
