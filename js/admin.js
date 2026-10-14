// Admin page: sign in, then manage stories, cartoons, photos and the About section.
const root = $("#admin");
let signedIn = false;

/* ---------- images ---------- */
// Resize big phone photos before upload (keeps pages fast and under the 10 MB limit).
async function resizeImage(file, max = 1800) {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  if (scale === 1 && file.size < 1.5e6) return file;
  const c = Object.assign(document.createElement("canvas"), { width: Math.round(bmp.width * scale), height: Math.round(bmp.height * scale) });
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob(res, "image/jpeg", 0.86));
}
async function uploadImage(file, folder) {
  const blob = await resizeImage(file);
  const ext = blob.type === "image/jpeg" ? "jpg" : (file.name.split(".").pop() || "png").toLowerCase();
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await sb.storage.from("media").upload(path, blob, { contentType: blob.type, cacheControl: "31536000" });
  if (error) throw error;
  return { path, url: sb.storage.from("media").getPublicUrl(path).data.publicUrl };
}
function pickFiles(multiple) {
  return new Promise((resolve) => {
    const input = Object.assign(document.createElement("input"), { type: "file", accept: "image/*", multiple });
    input.onchange = () => resolve([...input.files]);
    input.click();
  });
}

/* ---------- auth ---------- */
async function refreshAuth() {
  const { data } = await sb.auth.getSession();
  signedIn = !!data.session;
  $("#logoutBtn").hidden = !signedIn;
}
$("#logoutBtn").onclick = async () => { await sb.auth.signOut(); toast("Signed out"); };
sb.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_IN" || event === "SIGNED_OUT") refreshAuth().then(route);
});

function loginView() {
  root.innerHTML = `
    <form class="panel login" id="loginForm">
      <span class="eyebrow">Admin</span>
      <h1>Welcome back</h1>
      <p class="muted">Sign in to add stories, cartoons and photos.</p>
      <label class="field">Email<input type="email" id="email" autocomplete="username" required /></label>
      <label class="field">Password<input type="password" id="pw" autocomplete="current-password" required /></label>
      <p class="error" id="loginError"></p>
      <button class="btn btn-gradient" style="width:100%" id="loginBtn">Sign in ${icon.arrow}</button>
    </form>`;
  $("#loginForm").onsubmit = async (e) => {
    e.preventDefault();
    $("#loginBtn").disabled = true;
    const { error } = await sb.auth.signInWithPassword({ email: $("#email").value.trim(), password: $("#pw").value });
    $("#loginBtn").disabled = false;
    if (error) $("#loginError").textContent = "Sign in failed: " + error.message;
  };
}

/* ---------- layout ---------- */
function shell(active, title, actions, body) {
  const tab = (k, label) => `<a href="#/${k}" class="${active === k ? "on" : ""}">${label}</a>`;
  root.innerHTML = `
    <div class="admin-head">
      <div><span class="eyebrow">Admin</span><h1>${title}</h1></div>
      <div>${actions || ""}</div>
    </div>
    <nav class="tabs admin-tabs">${tab("stories", "📖 Stories")}${tab("cartoons", "🎨 Cartoons")}${tab("photos", "📸 Photos")}${tab("about", "👤 About")}</nav>
    ${body}`;
}

/* ---------- stories ---------- */
async function storiesView() {
  const stories = await getStories(true);
  shell("stories", `Stories <em>(${stories.length})</em>`, `<a class="btn btn-gradient" href="#/new">${icon.plus} New story</a>`, `
    <div class="search" style="margin-bottom:18px">${icon.search}<input id="q" type="search" placeholder="Find a story…" /></div>
    <div class="panel"><div class="rows" id="rows"></div></div>`);
  const draw = (q = "") => {
    const term = q.trim().toLowerCase();
    const list = [...stories].reverse().filter((s) => !term || s.title.toLowerCase().includes(term) || s.text.toLowerCase().includes(term));
    $("#rows").innerHTML = list.map((s) => `
      <div class="row-item">
        <span class="num">${pad(s.id)}</span>
        <span class="ttl">${esc(s.title)}</span>
        <span class="row-actions">
          <a class="icon-action" href="index.html#/story/${s.id}" target="_blank" rel="noopener" title="View">${icon.arrow}</a>
          <a class="icon-action" href="#/edit/${s.id}" title="Edit">${icon.edit}</a>
          <button class="icon-action danger" data-del="${s.id}" title="Delete">${icon.trash}</button>
        </span>
      </div>`).join("") || `<p class="muted">No stories match.</p>`;
  };
  draw();
  $("#q").oninput = (e) => draw(e.target.value);
  $("#rows").onclick = async (e) => {
    const b = e.target.closest("[data-del]");
    if (!b) return;
    const s = stories.find((x) => x.id == b.dataset.del);
    if (!confirm(`Delete story ${s.id}?\n\n${s.title}\n\nThis cannot be undone.`)) return;
    const { error } = await sb.from("stories").delete().eq("id", s.id);
    if (error) return alert(error.message);
    toast("Story deleted");
    storiesView();
  };
}

async function editorView(id) {
  let story = { title: "", body: "" };
  if (id) {
    const { data, error } = await sb.from("stories").select("*").eq("id", id).maybeSingle();
    if (error || !data) return (root.innerHTML = `<p class="error">${esc(error?.message || "Story not found")}</p>`);
    story = data;
  }
  shell("stories", id ? `Edit story <em>${pad(id)}</em>` : "Write a <em>new story</em>", `<a class="btn btn-ghost" href="#/stories">${icon.back} Back</a>`, `
    <input id="title" class="editor-title" value="${esc(story.title)}" placeholder="Story title (in Telugu)" />
    <div class="editor-shell"><div id="editor"></div></div>
    <p class="error" id="saveError"></p>
    <div class="form-actions">
      <a class="btn btn-ghost" href="#/stories">Cancel</a>
      <button class="btn btn-gradient" id="save">${id ? "Save changes" : "Publish story"}</button>
    </div>`);

  const quill = new Quill("#editor", {
    theme: "snow",
    placeholder: "ఇక్కడ కథ రాయండి… (write or paste the story here)",
    modules: {
      toolbar: {
        container: [
          [{ header: [2, 3, false] }],
          ["bold", "italic", "underline"],
          [{ color: [] }, { background: [] }],
          [{ list: "ordered" }, { list: "bullet" }, "blockquote"],
          [{ align: [] }],
          ["link", "image"],
          ["clean"],
        ],
        handlers: {
          // Upload pictures to storage instead of embedding huge base64 data in the story.
          image: async () => {
            const [file] = await pickFiles(false);
            if (!file) return;
            toast("Uploading image…");
            try {
              const { url } = await uploadImage(file, "stories");
              const range = quill.getSelection(true);
              quill.insertEmbed(range.index, "image", url, "user");
              quill.setSelection(range.index + 1);
            } catch (err) { alert("Image upload failed: " + err.message); }
          },
        },
      },
    },
  });
  if (story.body) quill.clipboard.dangerouslyPasteHTML(safeHtml(story.body));

  $("#save").onclick = async (e) => {
    const title = $("#title").value.trim();
    // root.innerHTML rather than getSemanticHTML(): Quill 2.0.3's version turns every space into &nbsp;.
    const body = quill.root.innerHTML;
    if (!title || !quill.getText().trim()) return ($("#saveError").textContent = "Please add a title and the story.");
    e.target.disabled = true;
    const res = id
      ? await sb.from("stories").update({ title, body, updated_at: new Date().toISOString() }).eq("id", id).select("id").single()
      : await sb.from("stories").insert({ title, body }).select("id").single();
    e.target.disabled = false;
    if (res.error) return ($("#saveError").textContent = res.error.message);
    toast(id ? "Story saved" : "Story published 🎉");
    location.hash = "#/stories";
  };
}

/* ---------- cartoons & photos ---------- */
async function imagesView(kind) {
  const isCartoon = kind === "cartoon";
  const list = await getImages(kind, true);
  shell(isCartoon ? "cartoons" : "photos", isCartoon ? `Cartoons <em>(${list.length})</em>` : `Photos <em>(${list.length})</em>`, "", `
    <div class="upload-zone" id="zone">
      <span class="big">${isCartoon ? "🎨" : "📸"}</span>
      <b>Click to upload ${isCartoon ? "cartoons" : "photos"}</b>
      <span>or drag &amp; drop images here — you can pick several at once</span>
    </div>
    <div class="img-grid">${list.map((p) => `
      <div class="img-card">
        <img src="${esc(p.url)}" alt="" loading="lazy" />
        <div class="img-body">
          <input data-cap="${p.id}" value="${esc(p.caption || "")}" placeholder="Add a caption…" />
          <button class="icon-action danger" data-del="${p.id}" title="Delete">${icon.trash}</button>
        </div>
      </div>`).join("") || `<p class="muted">Nothing uploaded yet.</p>`}
    </div>`);

  const upload = async (files) => {
    files = files.filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;
    try {
      for (let i = 0; i < files.length; i++) {
        toast(`Uploading ${i + 1} of ${files.length}…`);
        const { url, path } = await uploadImage(files[i], isCartoon ? "cartoons" : "gallery");
        const { error } = await sb.from("photos").insert({ url, path, kind });
        if (error) throw error;
      }
      toast("Uploaded — add captions below");
      imagesView(kind);
    } catch (err) { alert("Upload failed: " + err.message); }
  };
  const zone = $("#zone");
  zone.onclick = async () => upload(await pickFiles(true));
  zone.ondragover = (e) => { e.preventDefault(); zone.classList.add("drag"); };
  zone.ondragleave = () => zone.classList.remove("drag");
  zone.ondrop = (e) => { e.preventDefault(); zone.classList.remove("drag"); upload([...e.dataTransfer.files]); };

  root.querySelectorAll("[data-cap]").forEach((inp) => {
    inp.onchange = async () => {
      const { error } = await sb.from("photos").update({ caption: inp.value.trim() || null }).eq("id", inp.dataset.cap);
      toast(error ? error.message : "Caption saved");
    };
  });
  root.querySelectorAll("[data-del]").forEach((b) => {
    b.onclick = async () => {
      if (!confirm("Delete this image?")) return;
      const p = list.find((x) => x.id == b.dataset.del);
      await sb.storage.from("media").remove([p.path]);
      const { error } = await sb.from("photos").delete().eq("id", p.id);
      if (error) return alert(error.message);
      toast("Deleted");
      imagesView(kind);
    };
  });
}

/* ---------- about ---------- */
async function aboutView() {
  const a = await getAbout(true);
  let photo = a.photo;
  const bioText = (a.bio || "").split(/<\/p>/i).map(plainText).filter(Boolean).join("\n\n");
  shell("about", "About <em>section</em>", "", `
    <form class="panel about-form" id="aboutForm">
      <div class="about-pic">
        <img id="pic" src="${esc(photo || "assets/hero-village.svg")}" alt="" />
        <button type="button" class="btn btn-ghost btn-sm" id="picBtn">Change photo</button>
        <button type="button" class="btn btn-danger btn-sm" id="picRemove" ${photo ? "" : "hidden"}>Remove photo</button>
        <p class="muted" style="font-size:.85rem;margin:0">This photo also appears in the big picture at the top of the home page.</p>
      </div>
      <div>
        <label class="field">Name<input id="name" value="${esc(a.name)}" required /></label>
        <label class="field">Tagline<input id="tagline" value="${esc(a.tagline)}" /></label>
        <label class="field">Bio <span class="muted" style="font-weight:400">(leave a blank line between paragraphs)</span><textarea id="bio" rows="10">${esc(bioText)}</textarea></label>
        <p class="error" id="aboutError"></p>
        <div class="form-actions"><button class="btn btn-gradient" id="aboutSave">Save</button></div>
      </div>
    </form>`);
  $("#picBtn").onclick = async () => {
    const [f] = await pickFiles(false);
    if (!f) return;
    $("#aboutSave").disabled = true;
    toast("Uploading photo…");
    try {
      photo = (await uploadImage(f, "profile")).url;
      $("#pic").src = photo;
      $("#picRemove").hidden = false;
      toast("Photo ready — press Save");
    } catch (err) { $("#aboutError").textContent = err.message; }
    $("#aboutSave").disabled = false;
  };
  $("#picRemove").onclick = () => { photo = null; $("#pic").src = "assets/hero-village.svg"; $("#picRemove").hidden = true; };
  $("#aboutForm").onsubmit = async (e) => {
    e.preventDefault();
    const bio = $("#bio").value.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).map((p) => `<p>${esc(p)}</p>`).join("");
    const value = { name: $("#name").value.trim(), tagline: $("#tagline").value.trim(), bio, photo };
    const { error } = await sb.from("settings").upsert({ key: "about", value, updated_at: new Date().toISOString() });
    if (error) return ($("#aboutError").textContent = error.message);
    toast("About section saved");
  };
}

/* ---------- router ---------- */
async function route() {
  if (!signedIn) return loginView();
  const [, page, id] = (location.hash || "#/stories").slice(1).split("/");
  scrollTo(0, 0);
  try {
    if (page === "new") await editorView(null);
    else if (page === "edit" && id) await editorView(Number(id));
    else if (page === "cartoons") await imagesView("cartoon");
    else if (page === "photos") await imagesView("photo");
    else if (page === "about") await aboutView();
    else await storiesView();
  } catch (err) {
    console.error(err);
    root.innerHTML = `<div class="panel"><p class="error">Something went wrong: ${esc(err.message || err)}</p></div>`;
  }
}
addEventListener("hashchange", route);
refreshAuth().then(route);
