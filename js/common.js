// Shared by the public site (main.js) and the admin page (admin.js).
if (!window.SUPABASE_URL || window.SUPABASE_URL.includes("YOUR-PROJECT")) {
  document.body.insertAdjacentHTML("afterbegin", '<p style="padding:120px 20px;text-align:center">Add your Supabase URL and anon key in js/config.js</p>');
  throw new Error("Supabase is not configured in js/config.js");
}
const sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const plainText = (html) => new DOMParser().parseFromString(html || "", "text/html").body.textContent.replace(/\s+/g, " ").trim();
const pad = (n) => String(n).padStart(2, "0");
const fmtDate = (d) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

// Stored HTML only comes from the admin, but strip anything executable anyway.
function safeHtml(html) {
  const doc = new DOMParser().parseFromString(html || "", "text/html");
  doc.querySelectorAll("script,style,iframe,object,embed,form").forEach((n) => n.remove());
  doc.querySelectorAll("*").forEach((el) => {
    for (const a of [...el.attributes]) {
      if (a.name.startsWith("on") || /^\s*javascript:/i.test(a.value)) el.removeAttribute(a.name);
    }
  });
  return doc.body.innerHTML;
}

let toastTimer;
function toast(msg) {
  const t = $("#toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2400);
}

// Theme toggle (same behaviour on both pages)
const themeBtn = $("#themeBtn");
if (themeBtn) themeBtn.onclick = () => {
  const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  try { localStorage.setItem("theme", next); } catch {}
};
const yearEl = $("#year");
if (yearEl) yearEl.textContent = new Date().getFullYear();

/* ---------- topics, inferred from words in each story ---------- */
const TOPICS = [
  { key: "farm", label: "Farming & village", emoji: "🌾", color: "#4f8a2b", words: ["రైతు", "వ్యవసాయ", "పొలం", "పొలా", "పంట", "పశువు", "కూలీ", "పల్లె", "గ్రామ"] },
  { key: "cinema", label: "Cinema & theatre", emoji: "🎬", color: "#c2532a", words: ["సినిమా", "షూటింగ", "నటు", "హీరో", "సీరియల్", "నాటక", "దర్శకు", "వేషం"] },
  { key: "family", label: "Family", emoji: "🏡", color: "#d07a12", words: ["అమ్మ", "నాన్న", "కూతురు", "కొడుకు", "భార్య", "అబ్బాయి", "కుటుంబ", "పిల్లల", "మనవ"] },
  { key: "society", label: "Society", emoji: "🏛️", color: "#3a6fb0", words: ["పాలకు", "ప్రభుత్వ", "ఎన్నిక", "రాజకీయ", "సమాజ", "చట్ట", "పథకా", "పధకా", "ఓట్ల"] },
  { key: "memories", label: "Memories", emoji: "📜", color: "#7d4e9e", words: ["చిన్నప్పుడు", "చిన్నతనం", "అప్పట్లో", "ఆ రోజుల్లో", "విలేఖరి", "ఈనాడు", "గుర్తు"] },
];
const LIFE = { key: "life", label: "Life", emoji: "🌳", color: "#2f8a86" };
const topicOf = (key) => TOPICS.find((t) => t.key === key) || LIFE;

function processStory(s) {
  const text = plainText(s.body);
  const scores = TOPICS.map((t) => ({ t, n: t.words.reduce((sum, w) => sum + (text.split(w).length - 1), 0) }))
    .filter((x) => x.n > 0).sort((a, b) => b.n - a.n);
  const tags = scores.filter((x) => x.n >= 3).map((x) => x.t.key);
  const top = scores[0]?.t.key || "life";
  return { ...s, text, topic: top, tags: tags.length ? tags : [top], mins: Math.max(1, Math.round(text.split(/\s+/).length / 130)), date: fmtDate(s.created_at) };
}

/* ---------- data ---------- */
const cache = {};
async function getStories(force) {
  if (cache.stories && !force) return cache.stories;
  // Oldest first by published date; id breaks ties (the imported stories share one date).
  const { data, error } = await sb.from("stories").select("*").order("created_at", { ascending: true }).order("id", { ascending: true });
  if (error) throw error;
  return (cache.stories = data.map(processStory));
}
async function getAbout(force) {
  if (cache.about && !force) return cache.about;
  const { data } = await sb.from("settings").select("value").eq("key", "about").maybeSingle();
  return (cache.about = { name: "Maharshi Ramana", tagline: "", bio: "", photo: null, ...(data?.value || {}) });
}
async function getImages(kind, force) {
  const k = "img_" + kind;
  if (cache[k] && !force) return cache[k];
  const { data, error } = await sb.from("photos").select("*").eq("kind", kind).order("created_at", { ascending: false });
  return (cache[k] = error ? [] : data);
}

/* ---------- icons ---------- */
const I = (d, cls = "ico") => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const icon = {
  arrow: I('<path d="M5 12h14M13 6l6 6-6 6"/>', "ico arrow"),
  back: I('<path d="M19 12H5M11 18l-6-6 6-6"/>'),
  search: I('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  clock: I('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  book: I('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>'),
  link: I('<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>'),
  copy: I('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'),
  share: I('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>'),
  calendar: I('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'),
  edit: I('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
  trash: I('<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>'),
  plus: I('<path d="M12 5v14M5 12h14"/>'),
  wa: I('<path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm4.5 12.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.4a.5.5 0 0 0 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .1-1.3c0-.1-.2-.2-.5-.3z"/>', "ico ico-fill"),
  fb: I('<path d="M14 8h3V4h-3a4 4 0 0 0-4 4v2H8v4h2v8h4v-8h3l1-4h-4V8a.9.9 0 0 1 1-1z"/>', "ico ico-fill"),
  x: I('<path d="M17.8 3h3.1l-6.8 7.7L22 21h-6.2l-4.9-6.4L5.3 21H2.2l7.3-8.3L2 3h6.4l4.4 5.8zm-1.1 16.2h1.7L7.4 4.7H5.6z"/>', "ico ico-fill"),
  tg: I('<path d="M21.9 4.3 18.7 19c-.2 1-.9 1.3-1.8.8l-4.8-3.6-2.3 2.2c-.3.3-.5.5-1 .5l.3-4.9 8.9-8c.4-.3-.1-.5-.6-.2l-11 6.9-4.7-1.5c-1-.3-1-1 .2-1.5L20.6 3c.9-.3 1.6.2 1.3 1.3z"/>', "ico ico-fill"),
};
