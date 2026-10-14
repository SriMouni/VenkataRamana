// One-command Supabase setup:
//   creates the project (or uses an existing one), creates the table + security rules,
//   loads the stories, creates your admin login, turns off public sign-ups,
//   and writes public/config.js.
// Usage: fill in .env (see .env.example), then:  npm run setup
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { ROOT, loadStories, insertSql } from "./seed-lib.mjs";

const ENV_FILE = path.join(ROOT, ".env");
const API = "https://api.supabase.com/v1";

// ---------- .env ----------
function readEnv() {
  if (!fs.existsSync(ENV_FILE)) throw new Error("No .env file. Copy .env.example to .env and fill it in.");
  const env = {};
  for (const line of fs.readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}
function saveEnv(key, value) {
  let text = fs.readFileSync(ENV_FILE, "utf8");
  const re = new RegExp(`^${key}=.*$`, "m");
  text = re.test(text) ? text.replace(re, `${key}=${value}`) : text.replace(/\s*$/, `\n${key}=${value}\n`);
  fs.writeFileSync(ENV_FILE, text);
}

const env = readEnv();
for (const k of ["SUPABASE_ACCESS_TOKEN", "ADMIN_EMAIL", "ADMIN_PASSWORD"]) {
  if (!env[k]) throw new Error(`${k} is missing in .env`);
}
if (env.ADMIN_PASSWORD.length < 6) throw new Error("ADMIN_PASSWORD must be at least 6 characters");

// ---------- Management API ----------
async function api(method, url, body) {
  const res = await fetch(API + url, {
    method,
    headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`);
  return data;
}
const sql = (ref, query) => api("POST", `/projects/${ref}/database/query`, { query });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- 1. project ----------
let ref = env.SUPABASE_PROJECT_REF;
if (!ref) {
  const orgs = await api("GET", "/organizations");
  if (!orgs.length) throw new Error("Your Supabase account has no organization. Create one at supabase.com/dashboard first.");
  const dbPass = crypto.randomBytes(18).toString("base64url");
  console.log(`Creating project "ramana-stories" in ${env.SUPABASE_REGION || "ap-south-1"} (org: ${orgs[0].name})…`);
  const project = await api("POST", "/projects", {
    name: "ramana-stories",
    organization_id: orgs[0].id,
    db_pass: dbPass,
    region: env.SUPABASE_REGION || "ap-south-1", // Mumbai
  });
  ref = project.id || project.ref;
  saveEnv("SUPABASE_PROJECT_REF", ref);
  saveEnv("SUPABASE_DB_PASSWORD", dbPass);
  console.log(`Project created: ${ref} (saved to .env)`);
} else {
  console.log(`Using existing project ${ref}`);
}

process.stdout.write("Waiting for the database to be ready");
for (let i = 0; ; i++) {
  const p = await api("GET", `/projects/${ref}`);
  if (p.status === "ACTIVE_HEALTHY") break;
  if (i > 90) throw new Error(`Project still ${p.status} after 15 minutes; run npm run setup again later.`);
  process.stdout.write(".");
  await sleep(10_000);
}
// The query endpoint can lag a little behind ACTIVE_HEALTHY.
for (let i = 0; ; i++) {
  try { await sql(ref, "select 1"); break; } catch (e) { if (i > 30) throw e; await sleep(5_000); }
}
console.log(" ready.");

// ---------- 2. table + security ----------
await sql(ref, fs.readFileSync(path.join(ROOT, "supabase", "schema.sql"), "utf8"));
console.log("Table and security rules created.");

// ---------- 3. stories ----------
const [{ n }] = await sql(ref, "select count(*)::int as n from public.stories");
if (n === 0) {
  // Small batches: the query endpoint rejects one huge request.
  const stories = loadStories();
  for (let i = 0; i < stories.length; i += 5) {
    await sql(ref, insertSql(stories.slice(i, i + 5)));
    process.stdout.write(`\rLoading stories… ${Math.min(i + 5, stories.length)}/${stories.length}`);
  }
  console.log();
  const [{ m }] = await sql(ref, "select count(*)::int as m from public.stories");
  console.log(`Loaded ${m} stories.`);
} else {
  console.log(`Table already has ${n} stories; not loading again.`);
}

// ---------- 4. keys ----------
const keys = await api("GET", `/projects/${ref}/api-keys`);
const anon = keys.find((k) => k.name === "anon")?.api_key;
const service = keys.find((k) => k.name === "service_role")?.api_key;
if (!anon || !service) throw new Error("Could not read the project's API keys.");
const url = `https://${ref}.supabase.co`;

// ---------- 5. admin login ----------
const userRes = await fetch(`${url}/auth/v1/admin/users`, {
  method: "POST",
  headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" },
  body: JSON.stringify({ email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD, email_confirm: true }),
});
if (userRes.ok) console.log(`Admin login created: ${env.ADMIN_EMAIL}`);
else {
  const t = await userRes.text();
  if (/already|exists|registered/i.test(t)) console.log(`Admin login ${env.ADMIN_EMAIL} already exists.`);
  else throw new Error(`Creating admin user failed: ${userRes.status} ${t}`);
}

// ---------- 6. no public sign-ups ----------
await api("PATCH", `/projects/${ref}/config/auth`, { disable_signup: true });
console.log("Public sign-ups turned off.");

// ---------- 7. website config ----------
fs.writeFileSync(
  path.join(ROOT, "js", "config.js"),
  `// Generated by npm run setup. The anon key is meant to be public; Row Level Security protects writes.
window.SUPABASE_URL = "${url}";
window.SUPABASE_ANON_KEY = "${anon}";
`
);
console.log("Wrote js/config.js");
console.log(`\nAll done. Run  npm start  and open http://localhost:3000`);
