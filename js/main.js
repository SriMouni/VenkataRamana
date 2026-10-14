// Public website: home page (stories, cartoons, about, gallery) and story pages.
const app = $("#app");
const state = { q: "", topic: "all", sort: "new", shown: 12 };
const PAGE = 12;
let pendingScroll = null;

/* ---------- header, nav, scrolling ---------- */
const navToggle = $("#navToggle");
navToggle.onclick = () => {
  const open = $("#site-nav").classList.toggle("open");
  navToggle.setAttribute("aria-expanded", open);
};
document.addEventListener("click", (e) => {
  const a = e.target.closest("[data-scroll]");
  if (!a) return;
  e.preventDefault();
  $("#site-nav").classList.remove("open");
  navToggle.setAttribute("aria-expanded", "false");
  const id = a.dataset.scroll;
  const onHome = !location.hash || location.hash === "#/" || location.hash === "#";
  if (onHome && document.getElementById(id)) document.getElementById(id).scrollIntoView({ behavior: "smooth" });
  else { pendingScroll = id; location.hash = "#/"; }
});
addEventListener("scroll", () => {
  const bar = $("#progress");
  if (!location.hash.startsWith("#/story/")) return (bar.style.width = "0");
  const h = document.documentElement.scrollHeight - innerHeight;
  bar.style.width = h > 0 ? `${(scrollY / h) * 100}%` : "0";
}, { passive: true });

/* ---------- scroll reveal & count-up ---------- */
const io = new IntersectionObserver((entries) => {
  for (const en of entries) {
    if (!en.isIntersecting) continue;
    en.target.classList.add("visible");
    en.target.querySelectorAll("[data-count]").forEach(countUp);
    io.unobserve(en.target);
  }
}, { threshold: 0.12 });
const observe = () => $$(".reveal:not(.visible), .reveal-stagger:not(.visible)").forEach((el) => io.observe(el));

function countUp(el) {
  const target = Number(el.dataset.count);
  const start = performance.now();
  const step = (now) => {
    const p = Math.min(1, (now - start) / 1400);
    el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ---------- lightbox (cartoons & photos) ---------- */
let lbList = [], lbIndex = 0;
function openLightbox(list, i) {
  lbList = list; lbIndex = i;
  const p = list[i];
  $("#lbImg").src = p.url;
  $("#lbImg").alt = p.caption || "";
  $("#lbCap").textContent = p.caption || "";
  if (!$("#lightbox").open) $("#lightbox").showModal();
}
$(".lb-close").onclick = () => $("#lightbox").close();
$(".lb-prev").onclick = () => openLightbox(lbList, (lbIndex - 1 + lbList.length) % lbList.length);
$(".lb-next").onclick = () => openLightbox(lbList, (lbIndex + 1) % lbList.length);
$("#lightbox").addEventListener("click", (e) => { if (e.target.id === "lightbox") $("#lightbox").close(); });
document.addEventListener("keydown", (e) => {
  if (!$("#lightbox").open) return;
  if (e.key === "ArrowLeft") $(".lb-prev").click();
  if (e.key === "ArrowRight") $(".lb-next").click();
});

/* ---------- sharing ---------- */
const siteUrl = () => `${location.origin}${location.pathname}`;
const storyUrl = (id) => `${siteUrl()}#/story/${id}`;
async function copyText(text, msg) {
  try { await navigator.clipboard.writeText(text); toast(msg); }
  catch { prompt("Copy this:", text); }
}
function waLink(text) { return `https://wa.me/?text=${encodeURIComponent(text)}`; }

/* ---------- shared bits ---------- */
const blobs = `<div class="blobs" aria-hidden="true"><span class="blob b1"></span><span class="blob b2"></span><span class="blob b3"></span><span class="blob b4"></span></div>`;

function storyCard(s, q = "") {
  const t = topicOf(s.topic);
  let excerpt = s.text.slice(0, 220);
  if (q) {
    const at = s.text.toLowerCase().indexOf(q.toLowerCase());
    if (at > 110) excerpt = "…" + s.text.slice(at - 70, at + 160);
  }
  const hl = (txt) => {
    const safe = esc(txt);
    if (!q) return safe;
    const re = new RegExp(esc(q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    return safe.replace(re, (m) => `<mark>${m}</mark>`);
  };
  return `
    <a class="card" href="#/story/${s.id}" style="--t:${t.color}">
      <span class="card-num">${pad(s.id)}</span>
      <span class="card-topic"><span class="t-dot">${t.emoji}</span>${t.label}</span>
      <h3>${hl(s.title)}</h3>
      <p>${hl(excerpt)}…</p>
      <div class="card-foot"><span>${icon.calendar} ${s.date}</span><span>${icon.clock} ${s.mins} min</span><span class="go">Read ${icon.arrow}</span></div>
    </a>`;
}

function portraitHtml(about, cls = "portrait") {
  return `<div class="${cls}">${about.photo
    ? `<img src="${esc(about.photo)}" alt="${esc(about.name)}" />`
    : `<img src="assets/hero-village.svg" alt="Village fields at sunrise" />`}</div>`;
}

/* =========================================================
   Home
   ========================================================= */
function filtered(stories) {
  const term = state.q.trim().toLowerCase();
  let list = stories.filter((s) => (state.topic === "all" || s.tags.includes(state.topic)) &&
    (!term || s.title.toLowerCase().includes(term) || s.text.toLowerCase().includes(term)));
  return state.sort === "new" ? [...list].reverse() : list;
}

function renderList(stories) {
  const list = filtered(stories);
  const shown = list.slice(0, state.shown);
  const grid = $("#storyGrid");
  grid.innerHTML = shown.length ? shown.map((s) => storyCard(s, state.q.trim())).join("")
    : `<div class="empty"><strong>No stories found</strong>Try another word or topic.</div>`;
  grid.classList.add("visible");
  $("#moreWrap").innerHTML = list.length > shown.length
    ? `<button class="btn btn-ghost" id="moreBtn">Show more stories <span class="muted">(${list.length - shown.length})</span></button>` : "";
  const more = $("#moreBtn");
  if (more) more.onclick = () => { state.shown += PAGE; renderList(stories); };
  $$("#topicTabs button").forEach((b) => b.classList.toggle("on", b.dataset.topic === state.topic));
  $$("#sortTabs button").forEach((b) => b.classList.toggle("on", b.dataset.sort === state.sort));
}

function imagesSection(list, kind) {
  if (!list.length) {
    return kind === "cartoon"
      ? `<div class="coming reveal"><div class="coming-art">🎨</div><div><h3>Cartoons coming soon</h3><p>Ramana garu is drawing new cartoons — they will appear here.</p></div></div>`
      : `<div class="coming reveal"><div class="coming-art">📸</div><div><h3>Photos coming soon</h3><p>Pictures from film sets, stage plays and travels.</p></div></div>`;
  }
  return `<div class="masonry reveal-stagger">${list.map((p, i) => `
    <figure class="tile ${kind}" data-kind="${kind}" data-i="${i}">
      <img src="${esc(p.url)}" alt="${esc(p.caption || "")}" loading="lazy" />
      ${p.caption ? `<figcaption>${esc(p.caption)}</figcaption>` : ""}
    </figure>`).join("")}</div>`;
}

async function homePage() {
  document.title = "Maharshi Ramana | Telugu Stories & Cartoons";
  app.innerHTML = `<section class="hero">${blobs}<div class="container" style="position:relative;z-index:1"><div class="skel" style="height:420px"></div></div></section>`;

  const [stories, about, cartoons, photos] = await Promise.all([getStories(), getAbout(), getImages("cartoon"), getImages("photo")]);
  const totalMins = stories.reduce((m, s) => m + s.mins, 0);
  const counts = Object.fromEntries(TOPICS.map((t) => [t.key, stories.filter((s) => s.tags.includes(t.key)).length]));
  const f = stories[Math.floor(Date.now() / 864e5) % stories.length];
  const ft = topicOf(f.topic);
  const shareSiteMsg = `మహర్షి రమణ గారి తెలుగు కథలు చదవండి 📖\n${siteUrl()}`;

  app.innerHTML = `
    <section class="hero">
      <div class="hero-glow" aria-hidden="true"></div>
      ${blobs}
      <div class="container hero-grid">
        <div class="hero-copy reveal">
          <span class="pill"><span class="pill-dot"></span>Telugu short stories &amp; cartoons</span>
          <h1>Stories from real life, <em>told in Telugu.</em></h1>
          <p class="lead">Short stories by actor and writer Maharshi Ramana — about farmers and film sets, family and village life, and the people he meets along the way.</p>
          <div class="hero-actions">
            <a href="#/" data-scroll="stories" class="btn btn-gradient">Start reading ${icon.arrow}</a>
            <a href="${waLink(shareSiteMsg)}" target="_blank" rel="noopener" class="btn btn-whatsapp">${icon.wa} Share on WhatsApp</a>
          </div>
          <div class="stat-row">
            <div class="stat" style="--c:#c2532a"><b data-count="${stories.length}">0</b><span>Stories</span></div>
            <div class="stat" style="--c:#7d4e9e"><b data-count="${totalMins}">0</b><span>Minutes of reading</span></div>
            ${cartoons.length ? `<div class="stat" style="--c:#2f8a86"><b data-count="${cartoons.length}">0</b><span>Cartoons</span></div>` : ""}
          </div>
        </div>
        <div class="hero-visual collage reveal">
          <figure class="polaroid">
            <span class="tape t1"></span><span class="tape t2"></span>
            ${about.photo ? `<img src="${esc(about.photo)}" alt="${esc(about.name)}" />` : `<img src="assets/hero-village.svg" alt="Village fields at sunrise" />`}
            <figcaption>${about.photo ? esc(about.name) : "మా ఊరు, మా కథలు"}</figcaption>
          </figure>
          <a class="mini-story" href="#/story/${f.id}" style="--t:${ft.color}">
            <span class="card-topic"><span class="t-dot">${ft.emoji}</span>Today's story</span>
            <strong>${esc(f.title)}</strong>
            <span class="mini-text">${esc(f.text.slice(0, 120))}…</span>
            <span class="mini-go">Read now ${icon.arrow}</span>
          </a>
          <div class="sticky-note">🎨 New!<br /><b>Cartoons</b><br />by Ramana garu</div>
          <span class="sparkle s1">✦</span><span class="sparkle s2">✦</span>
        </div>
      </div>
      <div class="container">
        <div class="topic-strip reveal-stagger">
          ${TOPICS.filter((t) => counts[t.key]).map((t) => `
            <button data-topic-jump="${t.key}" style="--t:${t.color}"><span class="t-dot">${t.emoji}</span>${t.label} <span class="count">${counts[t.key]}</span></button>`).join("")}
        </div>
      </div>
    </section>

    <div class="ticker" aria-hidden="true"><div class="ticker-track">
      ${[0, 1].map(() => `<span>${stories.slice(0, 14).map((s) => esc(s.title)).join("</span><span>")}</span>`).join("")}
    </div></div>

    <section class="section bg-peach" style="padding:70px 0">
      <div class="container">
        <a class="feature reveal" href="#/story/${f.id}">
          <span class="feature-num">${pad(f.id)}</span>
          <div>
            <span class="eyebrow">${ft.emoji} Story of the day</span>
            <h3>${esc(f.title)}</h3>
            <p>${esc(f.text.slice(0, 320))}…</p>
          </div>
          <span class="btn btn-light">Read today's story ${icon.arrow}</span>
        </a>
      </div>
    </section>

    <section class="section" id="stories">
      <div class="container">
        <div class="section-head reveal">
          <span class="eyebrow">The collection</span>
          <h2>Every story, <em>a slice of life</em></h2>
          <p class="lead">Search in Telugu, pick a topic, or simply start from the first story.</p>
        </div>
        <div class="toolbar reveal">
          <div class="search">${icon.search}<input id="q" type="search" placeholder="Search stories — type any Telugu word…" value="${esc(state.q)}" /></div>
          <div class="filter-row">
            <div class="tabs" id="topicTabs">
              <button data-topic="all">All<span class="n">${stories.length}</span></button>
              ${TOPICS.filter((t) => counts[t.key]).map((t) => `<button data-topic="${t.key}">${t.emoji} ${t.label}<span class="n">${counts[t.key]}</span></button>`).join("")}
            </div>
            <div class="tabs" id="sortTabs"><button data-sort="new">Newest first</button><button data-sort="old">Oldest first</button></div>
          </div>
        </div>
        <div class="grid reveal-stagger" id="storyGrid"></div>
        <div class="more" id="moreWrap"></div>
      </div>
    </section>

    <section class="section bg-lilac" id="cartoons">
      <div class="container">
        <div class="section-head reveal">
          <span class="eyebrow">New · Cartoons</span>
          <h2>Drawn by <em>Ramana garu</em></h2>
          <p class="lead">Fresh cartoons with the same humour and heart as his stories.</p>
        </div>
        ${imagesSection(cartoons, "cartoon")}
      </div>
    </section>

    <section class="section bg-mint" id="about">
      <div class="container about-grid">
        <div class="reveal">${portraitHtml(about, "about-photo")}</div>
        <div class="reveal">
          <span class="eyebrow">About</span>
          <h2>${esc(about.name)}</h2>
          <div class="about-bio">${safeHtml(about.bio)}</div>
          <div class="bento">
            <div class="bento-item"><span class="b-icon">🎭</span><div><strong>Actor</strong><span>Telugu films and TV serials</span></div></div>
            <div class="bento-item"><span class="b-icon">✍️</span><div><strong>Writer</strong><span>${stories.length}+ short stories</span></div></div>
            <div class="bento-item"><span class="b-icon">🎨</span><div><strong>Cartoonist</strong><span>Drawing new cartoons</span></div></div>
            <div class="bento-item"><span class="b-icon">📰</span><div><strong>Journalist</strong><span>Former Eenadu reporter</span></div></div>
          </div>
        </div>
      </div>
    </section>

    <section class="section" id="gallery">
      <div class="container">
        <div class="section-head reveal">
          <span class="eyebrow">Gallery</span>
          <h2>On set &amp; <em>behind the scenes</em></h2>
        </div>
        ${imagesSection(photos, "photo")}
      </div>
    </section>

    <section class="section bg-sun" style="padding:80px 0">
      <div class="container">
        <div class="share-band reveal">
          <div>
            <span class="eyebrow">Spread the stories</span>
            <h2>Enjoyed reading? <em>Pass it on.</em></h2>
            <p>Every story has its own link — share one on WhatsApp, or send the whole collection to family and friends.</p>
          </div>
          <div class="share-actions">
            <a class="btn btn-whatsapp" href="${waLink(shareSiteMsg)}" target="_blank" rel="noopener">${icon.wa} WhatsApp</a>
            <button class="btn btn-light" id="copySite">${icon.link} Copy link</button>
          </div>
        </div>
      </div>
    </section>`;

  // Controls
  let t;
  $("#q").oninput = (e) => { clearTimeout(t); t = setTimeout(() => { state.q = e.target.value; state.shown = PAGE; renderList(stories); }, 180); };
  $("#topicTabs").onclick = (e) => { const b = e.target.closest("button"); if (b) { state.topic = b.dataset.topic; state.shown = PAGE; renderList(stories); } };
  $("#sortTabs").onclick = (e) => { const b = e.target.closest("button"); if (b) { state.sort = b.dataset.sort; renderList(stories); } };
  $("#copySite").onclick = () => copyText(siteUrl(), "Link copied");
  app.onclick = (e) => {
    const jump = e.target.closest("[data-topic-jump]");
    if (jump) {
      state.topic = jump.dataset.topicJump; state.shown = PAGE; renderList(stories);
      return $("#stories").scrollIntoView({ behavior: "smooth" });
    }
    const tile = e.target.closest(".tile");
    if (tile) openLightbox(tile.dataset.kind === "cartoon" ? cartoons : photos, Number(tile.dataset.i));
  };

  renderList(stories);
  observe();
  if (pendingScroll) {
    const id = pendingScroll; pendingScroll = null;
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }));
  }
}

/* =========================================================
   Story page
   ========================================================= */
function setReadSize(delta) {
  const cur = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--read")) || 1.2;
  const next = Math.min(1.7, Math.max(1, +(cur + delta).toFixed(2)));
  document.documentElement.style.setProperty("--read", `${next}rem`);
  try { localStorage.setItem("readSize", next); } catch {}
}
try { const r = localStorage.getItem("readSize"); if (r) document.documentElement.style.setProperty("--read", `${r}rem`); } catch {}

async function storyPage(id) {
  app.innerHTML = `<section class="story-hero">${blobs}<div class="narrow" style="position:relative"><div class="skel" style="height:50vh"></div></div></section>`;
  const stories = await getStories();
  const i = stories.findIndex((s) => s.id === id);
  if (i < 0) {
    app.innerHTML = `<section class="story-hero"><div class="narrow"><h1>Story not found</h1><a class="btn" href="#/">Back to all stories</a></div></section>`;
    return;
  }
  const s = stories[i], prev = stories[i - 1], next = stories[i + 1];
  const t = topicOf(s.topic);
  const url = storyUrl(s.id);
  const waMsg = `*${s.title}*\n\n${s.text.slice(0, 260)}…\n\nపూర్తి కథ చదవండి 👉 ${url}`;
  const fb = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
  const related = stories.filter((x) => x.id !== s.id && x.topic === s.topic).sort(() => Math.random() - 0.5).slice(0, 3);
  document.title = `${s.title} — Maharshi Ramana`;

  app.innerHTML = `
    <article>
      <header class="story-hero">
        <div class="hero-glow" aria-hidden="true"></div>
        ${blobs}
        <div class="narrow" style="position:relative;z-index:1">
          <nav class="crumbs"><a href="#/" data-scroll="stories">${icon.back} All stories</a><span>/</span><span>Story ${pad(s.id)}</span></nav>
          <div><span class="card-topic" style="--t:${t.color}"><span class="t-dot">${t.emoji}</span>${t.label}</span></div>
          <h1>${esc(s.title)}</h1>
          <div class="story-meta">
            <span class="meta-chip">${icon.book} Story ${pad(s.id)} of ${stories.length}</span>
            <span class="meta-chip">${icon.calendar} ${s.date}</span>
            <span class="meta-chip">${icon.clock} ${s.mins} min read</span>
            <span class="meta-chip">✍️ మహర్షి రమణ</span>
          </div>
        </div>
      </header>

      <div class="narrow">
        <div class="reader-bar">
          <span class="label">Text size</span>
          <div class="reader-tools">
            <button class="round" id="aMinus" aria-label="Smaller text">A−</button>
            <button class="round" id="aPlus" aria-label="Bigger text">A+</button>
            <a class="round wa" href="${waLink(waMsg)}" target="_blank" rel="noopener" title="Share on WhatsApp">${icon.wa}</a>
            <button class="round" data-copy="link" title="Copy link">${icon.link}</button>
          </div>
        </div>

        <div class="story-body">${safeHtml(s.body)}</div>

        <section class="story-share">
          <h3>Liked this story? <em>Share it.</em></h3>
          <p>కథ నచ్చితే మీ వాళ్ళతో పంచుకోండి 🙏</p>
          <div class="share-grid">
            <a class="sbtn s-wa" href="${waLink(waMsg)}" target="_blank" rel="noopener">${icon.wa}<span>WhatsApp</span></a>
            <a class="sbtn s-fb" href="${fb}" target="_blank" rel="noopener">${icon.fb}<span>Facebook</span></a>
            <button class="sbtn s-glass" data-copy="link">${icon.link}<span>Copy link</span></button>
            <button class="sbtn s-glass" data-copy="full">${icon.copy}<span>Copy full story</span></button>
            ${navigator.share ? `<button class="sbtn s-light" data-native>${icon.share}<span>More…</span></button>` : ""}
          </div>
        </section>

        <nav class="pager">
          ${prev ? `<a href="#/story/${prev.id}"><small>← Previous</small><span class="t">${esc(prev.title)}</span></a>` : "<span></span>"}
          ${next ? `<a class="next" href="#/story/${next.id}"><small>Next →</small><span class="t">${esc(next.title)}</span></a>` : ""}
        </nav>
      </div>
    </article>

    ${related.length ? `
      <section class="section bg-lilac" style="margin-top:70px">
        <div class="container">
          <div class="section-head reveal"><span class="eyebrow">${t.emoji} Keep reading</span><h2>More <em>${t.label.toLowerCase()}</em> stories</h2></div>
          <div class="grid reveal-stagger">${related.map((r) => storyCard(r)).join("")}</div>
        </div>
      </section>` : ""}`;

  $("#aMinus").onclick = () => setReadSize(-0.08);
  $("#aPlus").onclick = () => setReadSize(0.08);
  $$("[data-copy]").forEach((b) => (b.onclick = () => b.dataset.copy === "full"
    ? copyText(`${s.title}\n\n${s.text}\n\n— మహర్షి రమణ\n${url}`, "Full story copied — paste it anywhere")
    : copyText(url, "Link copied")));
  $$("[data-native]").forEach((b) => (b.onclick = () => navigator.share({ title: s.title, text: `${s.title} — మహర్షి రమణ`, url }).catch(() => {})));
  observe();
}

/* =========================================================
   Router
   ========================================================= */
async function route() {
  const [, page, id] = (location.hash || "#/").slice(1).split("/");
  if (!pendingScroll) scrollTo(0, 0);
  try {
    if (page === "story" && id) await storyPage(Number(id));
    else await homePage();
  } catch (err) {
    console.error(err);
    app.innerHTML = `<section class="story-hero"><div class="narrow"><h2>Something went wrong</h2><p class="muted">${esc(err.message || err)}</p><button class="btn" onclick="location.reload()">Try again</button></div></section>`;
  }
}
addEventListener("hashchange", route);
route();
