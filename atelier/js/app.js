(() => {
  const AUTH_KEY = "atelier-auth-v1";
  const DATA_KEY = "atelier-sites-v1";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const state = {
    sites: loadSites(),
    current: null,
    selected: null,
    device: "desktop",
    tpl: "generic"
  };

  function loadSites() {
    try { return JSON.parse(localStorage.getItem(DATA_KEY)) || []; }
    catch { return []; }
  }
  function saveSites() {
    localStorage.setItem(DATA_KEY, JSON.stringify(state.sites));
  }

  async function sha(text) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
  }

  function loggedIn() {
    return sessionStorage.getItem("atelier-ok") === "1";
  }

  function parseVideo(url) {
    if (!url) return "";
    const raw = String(url).trim();
    let m = raw.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
    if (m) return `<iframe src="https://www.youtube-nocookie.com/embed/${m[1]}" allowfullscreen allow="encrypted-media"></iframe>`;
    m = raw.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    if (m) return `<iframe src="https://player.vimeo.com/video/${m[1]}" allowfullscreen></iframe>`;
    return `<video controls playsinline src="${esc(raw)}"></video>`;
  }

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function field(sec, path, text, tag = "span") {
    return `<${tag} class="editable" contenteditable="true" data-sec="${sec.id}" data-path="${path}">${esc(text)}</${tag}>`;
  }

  function renderSection(sec, editable) {
    const d = sec.data || {};
    const f = (path, text, tag) => editable ? field(sec, path, text, tag) : `<${tag || "span"}>${esc(text)}</${tag || "span"}>`;
    if (sec.type === "nav") {
      const links = String(d.links || "").split(",").map(x => `<span>${esc(x.trim())}</span>`).join("");
      return `<div class="s-nav">${f("brand", d.brand, "span")}<div class="links">${editable ? f("links", d.links, "span") : links}</div></div>`;
    }
    if (sec.type === "hero") {
      return `<div class="s-hero" style="background-image:url('${esc(d.image || "")}')">
        <div class="shade"></div>
        <div class="copy">
          <div class="kicker">${f("kicker", d.kicker)}</div>
          ${f("title", d.title, "h2")}
          ${f("subtitle", d.subtitle, "p")}
          <span class="s-btn">${f("cta", d.cta)}</span>
        </div>
      </div>`;
    }
    if (sec.type === "services") {
      const items = (d.items || []).map((it, i) => `
        <div class="svc">${f("items." + i + ".title", it.title, "h4")}${f("items." + i + ".text", it.text, "p")}</div>`).join("");
      return `<div class="s-services pad">${f("title", d.title, "h3")}<div class="svc-grid">${items}</div></div>`;
    }
    if (sec.type === "about") {
      return `<div class="s-about pad"><div class="about-grid">
        <div>${f("title", d.title, "h3")}${f("text", d.text, "p")}</div>
        <img src="${esc(d.image)}" alt="">
      </div></div>`;
    }
    if (sec.type === "video") {
      return `<div class="s-video pad">${f("title", d.title, "h3")}<div class="video-box">${parseVideo(d.url)}</div></div>`;
    }
    if (sec.type === "gallery") {
      const imgs = (d.images || []).map(src => `<img src="${esc(src)}" alt="">`).join("");
      return `<div class="s-gallery pad">${f("title", d.title, "h3")}<div class="gal">${imgs}</div></div>`;
    }
    if (sec.type === "cta") {
      return `<div class="s-cta">${f("title", d.title, "h3")}<div class="s-btn" style="margin-top:16px">${f("button", d.button)}</div></div>`;
    }
    if (sec.type === "contact") {
      return `<div class="s-contact pad">${f("title", d.title, "h3")}
        <div class="rows">
          <div>${f("address", d.address)}</div>
          <div>${f("phone", d.phone)}</div>
          <div>${f("email", d.email)}</div>
        </div></div>`;
    }
    if (sec.type === "footer") {
      return `<div class="s-footer">${f("brand", d.brand)}<span>${f("note", d.note)}</span></div>`;
    }
    return "";
  }

  function applyTheme(root, theme) {
    root.style.setProperty("--site-primary", theme.primary);
    root.style.setProperty("--site-accent", theme.accent);
    root.style.color = theme.text;
    root.style.background = theme.bg;
    root.style.fontFamily = theme.font + ", DM Sans, sans-serif";
  }

  function renderSite(site, { editable = false } = {}) {
    const page = site.pages[0];
    return page.sections.map(sec => {
      const wrap = `<div class="sec ${state.selected === sec.id ? "sec-selected" : ""}" data-id="${sec.id}">${renderSection(sec, editable)}</div>`;
      return wrap;
    }).join("");
  }

  function show(id) {
    $$(".screen, .screen-app").forEach(el => el.classList.toggle("on", el.id === id));
  }

  function route() {
    const hash = (location.hash || "#/").replace(/^#/, "");
    const parts = hash.split("/").filter(Boolean);
    if (parts[0] === "p" && parts[1]) {
      const site = state.sites.find(s => s.slug === parts[1] && s.published);
      show("screen-pub");
      const root = $("#pub-root");
      if (!site) { root.innerHTML = "<p style='padding:40px'>Site introuvable ou non publié.</p>"; return; }
      applyTheme(root, site.theme);
      root.innerHTML = renderSite(site, { editable: false });
      return;
    }
    if (!loggedIn()) { show("screen-gate"); renderGate(); return; }
    if (parts[0] === "edit" && parts[1]) {
      state.current = state.sites.find(s => s.id === parts[1]);
      if (!state.current) { location.hash = "#/"; return; }
      show("screen-editor");
      renderEditor();
      return;
    }
    show("screen-dash");
    renderDash();
  }

  function renderGate() {
    const has = !!localStorage.getItem(AUTH_KEY);
    $("#gate-title").textContent = has ? "Atelier privé" : "Créer ton atelier";
    $("#gate-copy").textContent = has
      ? "Connecte-toi pour créer et modifier les sites de tes clients."
      : "Choisis un mot de passe. Toi seul pourras ouvrir l'atelier.";
    $("#gate-btn").textContent = has ? "Entrer" : "Créer l'atelier";
  }

  function renderDash() {
    const grid = $("#site-grid");
    const cards = state.sites.map(s => `
      <article class="card">
        <img src="${esc(s.cover)}" alt="">
        <div class="card-body">
          <h3>${esc(s.name)}</h3>
          <p>${esc(s.client || "Client")} · ${s.published ? "publié" : "brouillon"}</p>
        </div>
        <div class="card-actions">
          <a class="btn btn-teal" href="#/edit/${s.id}">Éditer</a>
          ${s.published ? `<a class="btn btn-ghost" href="#/p/${s.slug}" target="_blank">Voir</a>` : ""}
          <button class="btn btn-danger" data-del="${s.id}">Supprimer</button>
        </div>
      </article>`).join("");
    grid.innerHTML = `<button class="new-card" id="btn-new" type="button">+ Nouveau site client</button>` + cards;
  }

  function currentSection() {
    if (!state.current || !state.selected) return null;
    return state.current.pages[0].sections.find(s => s.id === state.selected);
  }

  function renderEditor() {
    const site = state.current;
    $("#ed-name").textContent = site.name;
    $("#sec-list").innerHTML = site.pages[0].sections.map(s => {
      const label = (SECTION_CATALOG.find(x => x.type === s.type) || {}).label || s.type;
      return `<div class="sec-item ${state.selected === s.id ? "on" : ""}" data-sel="${s.id}">
        <span>${label}</span>
        <span>
          <button type="button" data-up="${s.id}">↑</button>
          <button type="button" data-down="${s.id}">↓</button>
        </span>
      </div>`;
    }).join("");
    const canvas = $("#canvas");
    applyTheme(canvas, site.theme);
    canvas.innerHTML = renderSite(site, { editable: true });
    $("#canvas-wrap").classList.toggle("mobile", state.device === "mobile");
    renderInspect();
  }

  function setPath(obj, path, value) {
    const parts = path.split(".");
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
    cur[parts[parts.length - 1]] = value;
  }

  function renderInspect() {
    const box = $("#inspect-body");
    const site = state.current;
    const sec = currentSection();
    let html = `
      <h4>Site</h4>
      <label>Nom du site</label><input data-site="name" value="${esc(site.name)}">
      <label>Client</label><input data-site="client" value="${esc(site.client || "")}">
      <label>Couleur principale</label><input data-theme="primary" type="color" value="${site.theme.primary}">
      <label>Couleur d'accent</label><input data-theme="accent" type="color" value="${site.theme.accent}">
    `;
    if (!sec) {
      box.innerHTML = html + `<p style="color:var(--muted);font-size:13px;margin-top:16px">Clique un bloc sur la page pour le modifier.</p>`;
      return;
    }
    html += `<h4>Bloc</h4>`;
    const d = sec.data;
    Object.keys(d).forEach(k => {
      if (k === "items") {
        d.items.forEach((it, i) => {
          html += `<label>Service ${i + 1} — titre</label><input data-d="items.${i}.title" value="${esc(it.title)}">`;
          html += `<label>Service ${i + 1} — texte</label><textarea data-d="items.${i}.text">${esc(it.text)}</textarea>`;
        });
      } else if (k === "images") {
        html += `<label>Images (une URL par ligne)</label><textarea data-d="images">${esc(d.images.join("\n"))}</textarea>`;
      } else {
        const area = String(d[k]).length > 60 || k === "text" || k === "url";
        html += `<label>${k}</label>`;
        html += area
          ? `<textarea data-d="${k}">${esc(d[k])}</textarea>`
          : `<input data-d="${k}" value="${esc(d[k])}">`;
      }
    });
    html += `<button class="btn btn-danger btn-wide" type="button" id="del-sec">Retirer ce bloc</button>`;
    box.innerHTML = html;
  }

  function persistSite() {
    const i = state.sites.findIndex(s => s.id === state.current.id);
    if (i >= 0) state.sites[i] = state.current;
    saveSites();
  }

  function openCreate() {
    state.tpl = "generic";
    $("#tpl-grid").innerHTML = TEMPLATES.map(t => `
      <button class="tpl ${t.id === state.tpl ? "on" : ""}" type="button" data-tpl="${t.id}">
        <img src="${esc(t.cover)}" alt="">
        <div><strong>${esc(t.name)}</strong><div style="color:var(--muted);font-size:12px">${esc(t.blurb)}</div></div>
      </button>`).join("");
    $("#new-name").value = "";
    $("#new-client").value = "";
    $("#modal-new").classList.add("on");
  }

  function createSite() {
    const name = $("#new-name").value.trim() || "Nouveau site";
    const client = $("#new-client").value.trim() || name;
    const tpl = TEMPLATES.find(t => t.id === state.tpl) || TEMPLATES[TEMPLATES.length - 1];
    const built = tpl.build(name);
    const site = {
      id: uid("site"),
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + Math.floor(Math.random() * 99),
      name, client,
      cover: tpl.cover,
      published: false,
      theme: built.theme,
      pages: built.pages
    };
    state.sites.unshift(site);
    saveSites();
    $("#modal-new").classList.remove("on");
    location.hash = "#/edit/" + site.id;
  }

  function bind() {
    $("#gate-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const pass = $("#gate-pass").value;
      const err = $("#gate-err");
      err.textContent = "";
      if (pass.length < 4) { err.textContent = "Au moins 4 caractères."; return; }
      const hash = await sha(pass);
      const stored = localStorage.getItem(AUTH_KEY);
      if (!stored) {
        localStorage.setItem(AUTH_KEY, hash);
        sessionStorage.setItem("atelier-ok", "1");
        location.hash = "#/";
        route();
        return;
      }
      if (hash !== stored) { err.textContent = "Mot de passe incorrect."; return; }
      sessionStorage.setItem("atelier-ok", "1");
      location.hash = "#/";
      route();
    });

    document.addEventListener("click", (e) => {
      if (e.target.id === "btn-new" || e.target.closest("#btn-new")) openCreate();
      if (e.target.id === "modal-new") e.target.classList.remove("on");
      const tpl = e.target.closest("[data-tpl]");
      if (tpl) {
        state.tpl = tpl.dataset.tpl;
        $$(".tpl").forEach(t => t.classList.toggle("on", t === tpl));
      }
      if (e.target.id === "create-site") createSite();
      const del = e.target.closest("[data-del]");
      if (del && confirm("Supprimer ce site ?")) {
        state.sites = state.sites.filter(s => s.id !== del.dataset.del);
        saveSites();
        renderDash();
      }
      const sel = e.target.closest("[data-sel]");
      if (sel && state.current) {
        state.selected = sel.dataset.sel;
        renderEditor();
      }
      const sec = e.target.closest(".sec");
      if (sec && $("#screen-editor").classList.contains("on") && !e.target.closest(".editable")) {
        state.selected = sec.dataset.id;
        renderEditor();
      }
      if (e.target.dataset.up || e.target.dataset.down) {
        const id = e.target.dataset.up || e.target.dataset.down;
        const arr = state.current.pages[0].sections;
        const i = arr.findIndex(s => s.id === id);
        const j = e.target.dataset.up ? i - 1 : i + 1;
        if (j >= 0 && j < arr.length) {
          [arr[i], arr[j]] = [arr[j], arr[i]];
          persistSite();
          renderEditor();
        }
      }
      if (e.target.id === "del-sec" && state.selected) {
        state.current.pages[0].sections = state.current.pages[0].sections.filter(s => s.id !== state.selected);
        state.selected = null;
        persistSite();
        renderEditor();
      }
      if (e.target.id === "add-sec-btn") $("#modal-sec").classList.add("on");
      if (e.target.id === "modal-sec") e.target.classList.remove("on");
      const addt = e.target.closest("[data-add-type]");
      if (addt) {
        state.current.pages[0].sections.splice(-1, 0, blankSection(addt.dataset.addType, state.current.name));
        persistSite();
        $("#modal-sec").classList.remove("on");
        renderEditor();
      }
      if (e.target.id === "btn-desktop") { state.device = "desktop"; renderEditor(); }
      if (e.target.id === "btn-mobile") { state.device = "mobile"; renderEditor(); }
      if (e.target.id === "btn-publish") {
        state.current.published = true;
        persistSite();
        alert("Publié. Lien public : " + location.origin + location.pathname + "#/p/" + state.current.slug);
      }
      if (e.target.id === "btn-logout") {
        sessionStorage.removeItem("atelier-ok");
        location.hash = "#/";
        route();
      }
    });

    document.addEventListener("input", (e) => {
      if (!state.current) return;
      if (e.target.dataset.site) {
        state.current[e.target.dataset.site] = e.target.value;
        persistSite();
        $("#ed-name").textContent = state.current.name;
      }
      if (e.target.dataset.theme) {
        state.current.theme[e.target.dataset.theme] = e.target.value;
        persistSite();
        applyTheme($("#canvas"), state.current.theme);
      }
      if (e.target.dataset.d) {
        const sec = currentSection();
        if (!sec) return;
        if (e.target.dataset.d === "images") sec.data.images = e.target.value.split("\n").map(x => x.trim()).filter(Boolean);
        else setPath(sec.data, e.target.dataset.d, e.target.value);
        persistSite();
        const canvas = $("#canvas");
        applyTheme(canvas, state.current.theme);
        canvas.innerHTML = renderSite(state.current, { editable: true });
      }
    });

    document.addEventListener("focusout", (e) => {
      const ed = e.target.closest(".editable");
      if (!ed || !state.current) return;
      const sec = state.current.pages[0].sections.find(s => s.id === ed.dataset.sec);
      if (!sec) return;
      setPath(sec.data, ed.dataset.path, ed.textContent.trim());
      persistSite();
    });

    window.addEventListener("hashchange", route);
  }

  $("#sec-types").innerHTML = SECTION_CATALOG.map(s =>
    `<button class="btn btn-ghost btn-wide" style="margin-top:6px" type="button" data-add-type="${s.type}">${s.label}</button>`
  ).join("");

  bind();
  route();
})();
