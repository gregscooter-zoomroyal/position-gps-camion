(() => {
  const AUTH_KEY = "atelier-auth-v1";
  const DATA_KEY = "atelier-sites-v2";
  const DATA_KEY_OLD = "atelier-sites-v1";
  const APP_VERSION = "8";
  const SHARED_KEYS = ["cursor"];
  const SERVER_LOCK = new Set(["site-pavage-go"]);
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const state = {
    sites: loadSites(),
    current: null,
    selected: null,
    pageId: null,
    device: "desktop",
    tpl: "generic"
  };
  const undoStack = [];

  function loadSites() {
    try {
      const fresh = JSON.parse(localStorage.getItem(DATA_KEY));
      if (Array.isArray(fresh) && fresh.length) return fresh;
    } catch { /* ignore */ }
    try {
      const old = JSON.parse(localStorage.getItem(DATA_KEY_OLD)) || [];
      return old.filter(s => s && s.id && !SERVER_LOCK.has(s.id));
    } catch { return []; }
  }
  function saveSites() {
    localStorage.setItem(DATA_KEY, JSON.stringify(state.sites));
    const pill = $("#save-pill");
    if (pill) pill.textContent = "Enregistré";
  }

  function snapshot() {
    if (!state.current) return;
    undoStack.push(JSON.stringify({
      site: state.current,
      pageId: state.pageId,
      selected: state.selected
    }));
    if (undoStack.length > 40) undoStack.shift();
  }

  function undoLast() {
    const prev = undoStack.pop();
    if (!prev) return;
    const data = JSON.parse(prev);
    const i = state.sites.findIndex(s => s.id === data.site.id);
    if (i >= 0) state.sites[i] = data.site;
    state.current = data.site;
    state.pageId = data.pageId;
    state.selected = data.selected;
    saveSites();
    renderEditor();
  }

  function currentPage() {
    const site = state.current;
    if (!site || !Array.isArray(site.pages) || !site.pages.length) {
      return { id: "home", name: "Accueil", sections: [] };
    }
    let p = site.pages.find(x => x.id === state.pageId);
    if (!p) {
      p = site.pages[0];
      state.pageId = p.id;
    }
    return p;
  }

  function pageOf(site, pageId) {
    if (!site || !site.pages || !site.pages.length) return { id: "home", name: "Accueil", sections: [] };
    return site.pages.find(p => p.id === pageId) || site.pages[0];
  }

  function ensureSite(site) {
    if (!site.seo) site.seo = { title: site.name || "", description: "" };
    if (!site.theme) site.theme = baseTheme();
    if (!Array.isArray(site.pages) || !site.pages.length) {
      site.pages = [{ id: "home", name: "Accueil", sections: [] }];
    }
    site.pages.forEach(p => { if (!p.id) p.id = uid("page"); });
    return site;
  }

  function mergeSites(local, shared, { forceLock = false } = {}) {
    const map = new Map();
    (local || []).forEach(s => { if (s && s.id) map.set(s.id, s); });
    (shared || []).forEach(s => {
      if (!s || !s.id) return;
      const prev = map.get(s.id);
      const serverNewer = SERVER_LOCK.has(s.id) && Number(s.revision || 0) > Number((prev && prev.revision) || 0);
      if (!prev || forceLock || serverNewer) {
        map.set(s.id, { ...s, published: prev ? !!prev.published : !!s.published });
      }
    });
    return [...map.values()];
  }

  async function fetchSharedSites() {
    const res = await fetch("data/sites.json?v=" + APP_VERSION, { cache: "reload" });
    if (!res.ok) throw new Error("sites.json " + res.status);
    const shared = await res.json();
    if (!Array.isArray(shared)) throw new Error("sites.json invalide");
    return shared;
  }

  async function loadSharedSites() {
    try {
      const shared = await fetchSharedSites();
      if (shared.length) {
        state.sites = mergeSites(state.sites, shared).map(ensureSite);
        saveSites();
      }
    } catch { /* fichier absent */ }
  }

  async function reloadLockedFromServer() {
    const shared = await fetchSharedSites();
    state.sites = mergeSites(state.sites, shared, { forceLock: true });
    saveSites();
    if (state.current && SERVER_LOCK.has(state.current.id)) {
      state.current = state.sites.find(s => s.id === state.current.id) || state.current;
    }
  }

  async function sha(text) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
  }

  function loggedIn() {
    return sessionStorage.getItem("atelier-ok") === "1";
  }

  function grantAccess() {
    sessionStorage.setItem("atelier-ok", "1");
  }

  function agentAccessRequested() {
    const q = new URLSearchParams(location.search);
    return SHARED_KEYS.includes((q.get("acces") || q.get("access") || "").toLowerCase());
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

  function parseVideoBg(url) {
    if (!url) return "";
    const raw = String(url).trim();
    let m = raw.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
    if (m) {
      const id = m[1];
      return `<iframe class="bg-frame" src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&controls=0&loop=1&playlist=${id}&playsinline=1&rel=0" allow="autoplay; encrypted-media" title=""></iframe>`;
    }
    m = raw.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    if (m) return `<iframe class="bg-frame" src="https://player.vimeo.com/video/${m[1]}?background=1&autoplay=1&loop=1&muted=1" allow="autoplay" title=""></iframe>`;
    return `<video class="bg-video" autoplay muted loop playsinline preload="auto" src="${esc(raw)}"></video>`;
  }

  function heroCopy(sec, d, f, editable) {
    const btn = f("cta", d.cta);
    const href = (d.href || "").trim();
    const inner = href && !editable
      ? `<a class="s-btn" href="${esc(href)}">${btn}</a>`
      : `<span class="s-btn">${btn}</span>`;
    return `<div class="copy">
      <div class="kicker">${f("kicker", d.kicker)}</div>
      ${f("title", d.title, "h2")}
      ${f("subtitle", d.subtitle, "p")}
      ${inner}
    </div>`;
  }

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function field(sec, path, text, tag = "span") {
    return `<${tag} class="editable" contenteditable="true" data-sec="${sec.id}" data-path="${path}">${esc(text)}</${tag}>`;
  }

  function viewBase(site, preview) {
    return preview ? `#/preview/${site.id}` : `#/p/${site.slug}`;
  }

  function navMarkup(sec, d, f, editable, site, preview) {
    const logo = d.logo
      ? `<img src="${esc(d.logo)}" alt="">`
      : "";
    const brand = `<div class="brand-wrap">${logo}${f("brand", d.brand, "span")}</div>`;
    if (editable) {
      return `<div class="s-nav">${brand}<div class="links">${f("links", d.links, "span")}</div></div>`;
    }
    const base = viewBase(site, preview);
    const viewing = state.viewPageId || (site.pages[0] && site.pages[0].id);
    const links = String(d.links || "").split(",").map(raw => {
      const name = raw.trim();
      if (!name) return "";
      const page = (site.pages || []).find(p => p.name.toLowerCase() === name.toLowerCase());
      if (page) {
        const href = page.id === viewing ? base : `${base}/${page.id}`;
        return `<a href="${href}">${esc(name)}</a>`;
      }
      return `<span>${esc(name)}</span>`;
    }).join("");
    return `<div class="s-nav">${brand}<div class="links">${links}</div></div>`;
  }

  function renderSection(sec, editable, site, preview) {
    const d = sec.data || {};
    const f = (path, text, tag) => editable ? field(sec, path, text, tag) : `<${tag || "span"}>${esc(text)}</${tag || "span"}>`;
    if (sec.type === "nav") return navMarkup(sec, d, f, editable, site, preview);
    if (sec.type === "hero") {
      const bg = d.video
        ? `<div class="hero-media">${parseVideoBg(d.video)}</div>`
        : "";
      const img = d.video ? "" : (d.image ? `style="background-image:url('${esc(d.image)}')"` : "");
      return `<div class="s-hero ${d.video ? "has-video" : ""} ${!d.video && !d.image ? "on-canvas" : ""}" ${img}>
        ${bg}
        <div class="shade"></div>
        ${heroCopy(sec, d, f, editable)}
      </div>`;
    }
    if (sec.type === "video-bg") {
      return `<div class="s-hero s-video-bg has-video">
        <div class="hero-media">${parseVideoBg(d.video)}</div>
        <div class="shade"></div>
        ${heroCopy(sec, d, f, editable)}
      </div>`;
    }
    if (sec.type === "stats") {
      const cells = (d.items || []).map((it, i) =>
        `<div class="stat"><b>${f("items." + i + ".value", it.value)}</b><span>${f("items." + i + ".label", it.label)}</span></div>`
      ).join("");
      return `<div class="s-stats">${cells}</div>`;
    }
    if (sec.type === "carousel") {
      const cards = (d.cards || []).map((c, i) => `
        <article class="car-card">
          <div class="car-img"><img src="${esc(c.image)}" alt=""></div>
          <div class="car-body">
            <div class="kicker">${f("cards." + i + ".kicker", c.kicker)}</div>
            <h4>${f("cards." + i + ".title", c.title, "span")}</h4>
            <p>${f("cards." + i + ".text", c.text)}</p>
          </div>
        </article>`).join("");
      return `<div class="s-carousel pad">
        ${f("title", d.title, "h3")}
        <div class="car-row">
          <button type="button" class="car-btn" data-car="-1">←</button>
          <div class="car-track">${cards}</div>
          <button type="button" class="car-btn" data-car="1">→</button>
        </div>
      </div>`;
    }
    if (sec.type === "media") {
      const cards = (d.items || []).map((it, i) => `
        <figure class="media-card" ${it.video ? `data-open-video="${esc(it.video)}"` : ""}>
          <img src="${esc(it.image)}" alt="">
          ${it.video ? `<span class="media-play">▶</span>` : ""}
          <figcaption>
            <div class="kicker">${f("items." + i + ".kicker", it.kicker)}</div>
            <h4>${f("items." + i + ".title", it.title, "span")}</h4>
          </figcaption>
        </figure>`).join("");
      return `<div class="s-media pad">${f("title", d.title, "h3")}<div class="media-grid">${cards}</div></div>`;
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
      const href = (d.href || "").trim();
      const btn = f("button", d.button);
      const wrap = href && !editable ? `<a class="s-btn" href="${esc(href)}">${btn}</a>` : `<div class="s-btn" style="margin-top:16px">${btn}</div>`;
      return `<div class="s-cta">${f("title", d.title, "h3")}${wrap}</div>`;
    }
    if (sec.type === "contact") {
      const tel = String(d.phone || "").replace(/[^\d+]/g, "");
      const phone = !editable && tel
        ? `<a href="tel:${esc(tel)}">${esc(d.phone)}</a>`
        : f("phone", d.phone);
      return `<div class="s-contact pad">${f("title", d.title, "h3")}
        <div class="rows">
          <div>${f("address", d.address)}</div>
          <div>${phone}</div>
          <div>${f("email", d.email)}</div>
        </div></div>`;
    }
    if (sec.type === "footer") {
      return `<div class="s-footer">${f("brand", d.brand)}<span>${f("note", d.note)}</span></div>`;
    }
    if (sec.type === "quotes") {
      const items = (d.items || []).map((it, i) =>
        `<blockquote class="quote"><p>${f("items." + i + ".text", it.text)}</p><span>${f("items." + i + ".name", it.name)}</span></blockquote>`
      ).join("");
      return `<div class="s-quotes pad">${f("title", d.title, "h3")}${items}</div>`;
    }
    if (sec.type === "faq") {
      const items = (d.items || []).map((it, i) =>
        `<details class="faq-item"><summary>${f("items." + i + ".q", it.q)}</summary><p>${f("items." + i + ".a", it.a)}</p></details>`
      ).join("");
      return `<div class="s-faq pad">${f("title", d.title, "h3")}${items}</div>`;
    }
    if (sec.type === "hours") {
      const rows = (d.items || []).map((it, i) =>
        `<div class="hour-row"><span>${f("items." + i + ".day", it.day)}</span><span>${f("items." + i + ".time", it.time)}</span></div>`
      ).join("");
      return `<div class="s-hours pad">${f("title", d.title, "h3")}${rows}</div>`;
    }
    if (sec.type === "form") {
      return `<div class="s-form pad">${f("title", d.title, "h3")}
        <form data-site-form="${esc(d.mailto || "")}">
          <input name="nom" placeholder="Nom" required>
          <input name="tel" placeholder="Téléphone" required>
          <textarea name="msg" rows="4" placeholder="Votre projet" required></textarea>
          <button class="btn btn-teal" type="submit">${esc(d.button || "Envoyer")}</button>
        </form></div>`;
    }
    if (sec.type === "map") {
      const q = encodeURIComponent(d.query || "");
      return `<div class="s-map pad">${f("title", d.title, "h3")}
        ${editable ? `<p style="font-size:13px;opacity:.7">${f("query", d.query)}</p>` : ""}
        <iframe loading="lazy" src="https://maps.google.com/maps?q=${q}&output=embed" title="Carte"></iframe>
      </div>`;
    }
    if (sec.type === "logos") {
      const items = (d.items || []).map((it, i) => it.image
        ? `<img src="${esc(it.image)}" alt="${esc(it.label || "")}" height="40">`
        : `<span class="logo-pill">${f("items." + i + ".label", it.label)}</span>`
      ).join("");
      return `<div class="s-logos pad">${f("title", d.title, "h3")}<div class="logo-row">${items}</div></div>`;
    }
    return "";
  }

  function hexColor(v, fallback) {
    let s = String(v || "").trim();
    if (/^[0-9a-fA-F]{6}$/.test(s)) s = "#" + s;
    if (/^#[0-9a-fA-F]{3}$/.test(s)) s = "#" + [...s.slice(1)].map(c => c + c).join("");
    if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
    return fallback;
  }

  function applyTheme(root, theme) {
    const primary = hexColor(theme.primary, "#0f766e");
    const accent = hexColor(theme.accent, "#e8a317");
    const bg = hexColor(theme.bg, "#ffffff");
    const text = hexColor(theme.text, "#111827");
    const img = theme.bgImage ? `url("${theme.bgImage}")` : "none";
    const paint = (el) => {
      if (!el) return;
      el.style.setProperty("--site-primary", primary);
      el.style.setProperty("--site-accent", accent);
      el.style.setProperty("--site-bg", bg);
      el.style.setProperty("--site-text", text);
      el.style.setProperty("--site-bg-image", img);
      el.style.color = text;
      el.style.fontFamily = (theme.font || "DM Sans") + ", DM Sans, sans-serif";
      el.classList.toggle("has-asphalt", !!theme.bgImage);
      if (theme.bgImage) {
        el.style.background = "";
        el.style.backgroundImage = "";
      } else {
        el.style.background = bg;
        el.style.backgroundImage = "none";
      }
    };
    paint(root);
    if (root.id === "canvas") paint($("#canvas-wrap"));
  }

  function renderSite(site, { editable = false, pageId = null, preview = false } = {}) {
    const page = pageOf(site, pageId || state.pageId);
    return (page.sections || []).map(sec => {
      const align = sec.align || "left";
      const shape = sec.imageShape || "rounded";
      const wrap = `<div class="sec align-${align} img-${shape} ${state.selected === sec.id ? "sec-selected" : ""}" data-id="${sec.id}">${renderSection(sec, editable, site, preview)}</div>`;
      return wrap;
    }).join("");
  }

  function show(id) {
    $$(".screen, .screen-app").forEach(el => el.classList.toggle("on", el.id === id));
  }

  function route() {
    const hash = (location.hash || "#/").replace(/^#/, "");
    const parts = hash.split("/").filter(Boolean);
    if (agentAccessRequested()) grantAccess();
    if (parts[0] === "p" && parts[1]) {
      const site = state.sites.find(s => s.slug === parts[1]);
      show("screen-pub");
      const root = $("#pub-root");
      if (!site) { root.innerHTML = "<p style='padding:40px'>Site introuvable.</p>"; return; }
      if (!site.published && !loggedIn()) { root.innerHTML = "<p style='padding:40px'>Site introuvable ou non publié.</p>"; return; }
      ensureSite(site);
      state.viewPageId = parts[2] || site.pages[0].id;
      document.title = (site.seo && site.seo.title) || site.name;
      applyTheme(root, site.theme);
      root.innerHTML = renderSite(site, { editable: false, pageId: state.viewPageId, preview: false });
      return;
    }
    if (parts[0] === "preview" && parts[1]) {
      if (!loggedIn()) { show("screen-gate"); renderGate(); return; }
      const site = state.sites.find(s => s.id === parts[1] || s.slug === parts[1]);
      show("screen-pub");
      const root = $("#pub-root");
      if (!site) { root.innerHTML = "<p style='padding:40px'>Site introuvable.</p>"; return; }
      ensureSite(site);
      state.viewPageId = parts[2] || site.pages[0].id;
      applyTheme(root, site.theme);
      root.innerHTML = renderSite(site, { editable: false, pageId: state.viewPageId, preview: true });
      return;
    }
    if (!loggedIn()) { show("screen-gate"); renderGate(); return; }
    if (parts[0] === "edit" && parts[1]) {
      state.current = state.sites.find(s => s.id === parts[1]);
      if (!state.current) { location.hash = "#/"; return; }
      ensureSite(state.current);
      if (!state.pageId || !state.current.pages.find(p => p.id === state.pageId)) {
        state.pageId = state.current.pages[0].id;
      }
      show("screen-editor");
      renderEditor();
      return;
    }
    show("screen-dash");
    renderDash();
  }

  function renderGate() {
    $("#gate-title").textContent = "Atelier privé";
    $("#gate-copy").textContent = "Toi et Cursor avez accès. Mot de passe partagé : cursor";
    $("#gate-btn").textContent = "Entrer";
  }

  function renderDash() {
    const grid = $("#site-grid");
    const ver = $("#app-ver");
    if (ver) ver.textContent = "v" + APP_VERSION;
    const cards = state.sites.map(s => {
      const n = (s.pages && s.pages[0] && s.pages[0].sections) ? s.pages[0].sections.length : 0;
      const locked = SERVER_LOCK.has(s.id);
      return `
      <article class="card">
        <img src="${esc(s.cover)}" alt="">
        ${locked ? `<div class="card-flag">v${APP_VERSION} · ${n} blocs · clique Éditer</div>` : ""}
        <div class="card-body">
          <h3>${esc(s.name)}</h3>
          <p>${esc(s.client || "Client")} · ${s.published ? "publié" : "brouillon privé"} · ${(s.pages || []).length} page(s)</p>
        </div>
        <div class="card-actions">
          <a class="btn btn-teal" href="#/edit/${s.id}">Éditer</a>
          <a class="btn btn-ghost" href="#/preview/${s.id}">Aperçu</a>
          <button class="btn btn-ghost" data-dup="${s.id}">Dupliquer</button>
          ${s.published ? `<a class="btn btn-ghost" href="#/p/${s.slug}" target="_blank">Voir</a>` : ""}
          <button class="btn btn-danger" data-del="${s.id}">Supprimer</button>
        </div>
      </article>`;
    }).join("");
    grid.innerHTML = `<button class="new-card" id="btn-new" type="button">+ Nouveau site client</button>` + cards;
    const tools = $("#dash-tools");
    if (tools) tools.style.display = "flex";
  }

  function currentSection() {
    if (!state.current || !state.selected) return null;
    return currentPage().sections.find(s => s.id === state.selected);
  }

  function renderEditor() {
    const site = ensureSite(state.current);
    $("#ed-name").textContent = site.name + (SERVER_LOCK.has(site.id) ? " · v" + APP_VERSION : "");
    const pagesBox = $("#page-list");
    if (pagesBox) {
      pagesBox.innerHTML = site.pages.map(p =>
        `<button class="page-item ${p.id === currentPage().id ? "on" : ""}" type="button" data-page="${p.id}">${esc(p.name)}</button>`
      ).join("");
    }
    $("#sec-list").innerHTML = currentPage().sections.map(s => {
      const label = (SECTION_CATALOG.find(x => x.type === s.type) || {}).label || s.type;
      return `<div class="sec-item ${state.selected === s.id ? "on" : ""}" data-sel="${s.id}">
        <span>${label}</span>
        <span>
          <button type="button" data-dup-sec="${s.id}" title="Dupliquer">⧉</button>
          <button type="button" data-up="${s.id}">↑</button>
          <button type="button" data-down="${s.id}">↓</button>
        </span>
      </div>`;
    }).join("");
    const canvas = $("#canvas");
    applyTheme(canvas, site.theme);
    canvas.innerHTML = renderSite(site, { editable: true, pageId: currentPage().id });
    $("#canvas-wrap").classList.toggle("mobile", state.device === "mobile");
    renderInspect();
  }

  function setPath(obj, path, value) {
    const parts = path.split(".");
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
    cur[parts[parts.length - 1]] = value;
  }

  function colorRow(key, label, value, fallback) {
    const hex = hexColor(value, fallback);
    return `<label>${label}</label>
      <div class="color-row">
        <input data-theme="${key}" type="color" value="${hex}">
        <input data-theme="${key}" class="hex-in" value="${hex}" maxlength="7" spellcheck="false">
      </div>`;
  }

  function chipRow(label, attr, current, options) {
    return `<label>${label}</label>
      <div class="chip-row">${options.map(([val, name]) =>
        `<button type="button" class="chip ${current === val ? "on" : ""}" ${attr}="${val}">${name}</button>`
      ).join("")}</div>`;
  }

  function renderInspect() {
    const box = $("#inspect-body");
    const site = state.current;
    const sec = currentSection();
    const t = site.theme || {};
    let html = `
      <h4>Site</h4>
      <label>Nom du site</label><input data-site="name" value="${esc(site.name)}">
      <label>Client</label><input data-site="client" value="${esc(site.client || "")}">
      <label>Titre SEO</label><input data-seo="title" value="${esc((site.seo && site.seo.title) || site.name)}">
      <label>Description SEO</label><textarea data-seo="description">${esc((site.seo && site.seo.description) || "")}</textarea>
      <label>Police</label>
      <select data-theme="font">${(typeof SITE_FONTS !== "undefined" ? SITE_FONTS : ["DM Sans"]).map(f =>
        `<option${(t.font || "DM Sans") === f ? " selected" : ""}>${f}</option>`).join("")}</select>
      ${colorRow("primary", "Couleur principale", t.primary, "#0f766e")}
      ${colorRow("accent", "Couleur d'accent (boutons)", t.accent, "#e8a317")}
      ${colorRow("bg", "Couleur de fond", t.bg, "#737375")}
      ${colorRow("text", "Couleur du texte", t.text, "#111827")}
      <label class="check-lab"><input id="theme-texture" type="checkbox" ${t.bgImage ? "checked" : ""}> Toile asphalte derrière</label>
      ${chipRow("Aligner toute la page", "data-page-align", "", [
        ["left", "Gauche"], ["center", "Centre"], ["right", "Droite"]
      ])}
    `;
    if (!sec) {
      box.innerHTML = html + `<p style="color:var(--muted);font-size:13px;margin-top:16px">Clique un bloc sur la page pour le modifier.</p>`;
      return;
    }
    html += `<h4>Bloc</h4>`;
    html += chipRow("Alignement", "data-align", sec.align || "left", [
      ["left", "Gauche"], ["center", "Centre"], ["right", "Droite"]
    ]);
    html += chipRow("Forme des images", "data-shape", sec.imageShape || "rounded", [
      ["original", "Original"], ["rounded", "Arrondi"], ["circle", "Cercle"], ["square", "Carré"]
    ]);
    const d = sec.data;
    const labels = {
      video: "URL vidéo de fond (YouTube, Vimeo ou MP4)",
      image: "Image de couverture",
      url: "URL vidéo",
      kicker: "Petite ligne au-dessus",
      title: "Titre",
      subtitle: "Texte",
      cta: "Bouton",
      text: "Texte",
      brand: "Nom",
      links: "Liens (séparés par des virgules)",
      address: "Adresse",
      phone: "Téléphone",
      email: "Courriel / note",
      note: "Note",
      button: "Bouton",
      href: "Lien du bouton (tel: ou https://)",
      logo: "URL du logo",
      mailto: "Courriel de réception du formulaire",
      query: "Adresse pour la carte"
    };
    Object.keys(d).forEach(k => {
      if (k === "items" || k === "cards" || k === "stats") {
        (d[k] || []).forEach((it, i) => {
          Object.keys(it).forEach(ik => {
            const ikLabels = { q: "Question", a: "Réponse", day: "Jour", time: "Heures", name: "Nom", label: "Nom", image: "Image", video: "Vidéo", text: "Texte", title: "Titre", value: "Valeur", kicker: "Ligne" };
            const lab = `${k === "cards" ? "Carte" : k === "stats" ? "Chiffre" : "Item"} ${i + 1} — ${ikLabels[ik] || ik}`;
            const val = it[ik];
            const area = String(val).length > 50 || ik === "text" || ik === "video";
            html += `<label>${esc(lab)}</label>`;
            html += area
              ? `<textarea data-d="${k}.${i}.${ik}">${esc(val)}</textarea>`
              : `<input data-d="${k}.${i}.${ik}" value="${esc(val)}">`;
          });
        });
      } else if (k === "images") {
        html += `<label>Images (une URL par ligne)</label><textarea data-d="images">${esc(d.images.join("\n"))}</textarea>`;
      } else {
        const area = String(d[k]).length > 60 || k === "text" || k === "url" || k === "video";
        html += `<label>${labels[k] || k}</label>`;
        html += area
          ? `<textarea data-d="${k}">${esc(d[k])}</textarea>`
          : `<input data-d="${k}" value="${esc(d[k])}">`;
      }
    });
    html += `<button class="btn btn-ghost btn-wide" type="button" id="dup-sec">Dupliquer ce bloc</button>`;
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
      seo: { title: name, description: "" },
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
      const pass = $("#gate-pass").value.trim();
      const err = $("#gate-err");
      err.textContent = "";
      if (SHARED_KEYS.includes(pass.toLowerCase())) {
        grantAccess();
        location.hash = "#/";
        route();
        return;
      }
      if (pass.length < 4) { err.textContent = "Au moins 4 caractères."; return; }
      const hash = await sha(pass);
      const stored = localStorage.getItem(AUTH_KEY);
      if (!stored) {
        localStorage.setItem(AUTH_KEY, hash);
        grantAccess();
        location.hash = "#/";
        route();
        return;
      }
      if (hash !== stored) { err.textContent = "Mot de passe incorrect. Essaie « cursor »."; return; }
      grantAccess();
      location.hash = "#/";
      route();
    });

    document.addEventListener("click", (e) => {
      if (e.target.id === "btn-reload-server") {
        e.target.disabled = true;
        e.target.textContent = "Chargement…";
        reloadLockedFromServer().then(() => {
          alert("Pavage G.O. a été rechargé depuis le serveur. Ouvre Éditer.");
          location.hash = "#/";
          route();
        }).catch(() => {
          alert("Impossible de recharger. Réessaie dans un instant.");
        }).finally(() => {
          e.target.disabled = false;
          e.target.textContent = "Recharger Pavage G.O. depuis le serveur";
        });
        return;
      }
      if (e.target.id === "btn-new" || e.target.closest("#btn-new")) openCreate();
      if (e.target.id === "modal-new") e.target.classList.remove("on");
      const tpl = e.target.closest("[data-tpl]");
      if (tpl) {
        state.tpl = tpl.dataset.tpl;
        $$(".tpl").forEach(t => t.classList.toggle("on", t === tpl));
      }
      if (e.target.id === "create-site") createSite();
      const dupSite = e.target.closest("[data-dup]");
      if (dupSite) {
        const src = state.sites.find(s => s.id === dupSite.dataset.dup);
        if (src) {
          const copy = JSON.parse(JSON.stringify(src));
          copy.id = uid("site");
          copy.slug = (src.slug || "site") + "-copie";
          copy.name = src.name + " (copie)";
          copy.published = false;
          delete copy.revision;
          state.sites.unshift(copy);
          saveSites();
          renderDash();
        }
      }
      const del = e.target.closest("[data-del]");
      if (del && confirm("Supprimer ce site ?")) {
        state.sites = state.sites.filter(s => s.id !== del.dataset.del);
        saveSites();
        renderDash();
      }
      const pageBtn = e.target.closest("[data-page]");
      if (pageBtn && state.current) {
        state.pageId = pageBtn.dataset.page;
        state.selected = null;
        renderEditor();
      }
      if (e.target.id === "add-page-btn" && state.current) {
        snapshot();
        const name = prompt("Nom de la page", "Nouvelle page") || "Nouvelle page";
        const page = {
          id: uid("page"),
          name,
          sections: [
            blankSection("nav", state.current.name),
            blankSection("hero", state.current.name),
            blankSection("footer", state.current.name)
          ]
        };
        state.current.pages.push(page);
        state.pageId = page.id;
        persistSite();
        renderEditor();
      }
      const sel = e.target.closest("[data-sel]");
      if (sel && state.current) {
        state.selected = sel.dataset.sel;
        renderEditor();
      }
      const sec = e.target.closest(".sec");
      if (sec && $("#screen-editor").classList.contains("on") && !e.target.closest(".editable") && !e.target.closest("button") && !e.target.closest("a") && !e.target.closest("summary")) {
        state.selected = sec.dataset.id;
        renderEditor();
      }
      if (e.target.dataset.up || e.target.dataset.down) {
        snapshot();
        const id = e.target.dataset.up || e.target.dataset.down;
        const arr = currentPage().sections;
        const i = arr.findIndex(s => s.id === id);
        const j = e.target.dataset.up ? i - 1 : i + 1;
        if (j >= 0 && j < arr.length) {
          [arr[i], arr[j]] = [arr[j], arr[i]];
          persistSite();
          renderEditor();
        }
      }
      const dupSecBtn = e.target.closest("[data-dup-sec]");
      if (dupSecBtn && state.current) {
        snapshot();
        const arr = currentPage().sections;
        const i = arr.findIndex(s => s.id === dupSecBtn.dataset.dupSec);
        if (i >= 0) {
          const clone = JSON.parse(JSON.stringify(arr[i]));
          clone.id = uid("sec");
          arr.splice(i + 1, 0, clone);
          persistSite();
          renderEditor();
        }
      }
      if ((e.target.id === "del-sec" || e.target.id === "dup-sec") && state.selected) {
        snapshot();
        const arr = currentPage().sections;
        if (e.target.id === "dup-sec") {
          const i = arr.findIndex(s => s.id === state.selected);
          if (i >= 0) {
            const clone = JSON.parse(JSON.stringify(arr[i]));
            clone.id = uid("sec");
            arr.splice(i + 1, 0, clone);
          }
        } else {
          currentPage().sections = arr.filter(s => s.id !== state.selected);
          state.selected = null;
        }
        persistSite();
        renderEditor();
      }
      if (e.target.id === "add-sec-btn") $("#modal-sec").classList.add("on");
      if (e.target.id === "modal-sec") e.target.classList.remove("on");
      const addt = e.target.closest("[data-add-type]");
      if (addt) {
        snapshot();
        const arr = currentPage().sections;
        const at = Math.max(0, arr.length - 1);
        arr.splice(at, 0, blankSection(addt.dataset.addType, state.current.name));
        persistSite();
        $("#modal-sec").classList.remove("on");
        renderEditor();
      }
      if (e.target.id === "btn-desktop") { state.device = "desktop"; renderEditor(); }
      if (e.target.id === "btn-mobile") { state.device = "mobile"; renderEditor(); }
      const alignBtn = e.target.closest("[data-align]");
      if (alignBtn && currentSection()) {
        snapshot();
        currentSection().align = alignBtn.dataset.align;
        persistSite();
        renderEditor();
      }
      const pageAlign = e.target.closest("[data-page-align]");
      if (pageAlign && state.current) {
        snapshot();
        currentPage().sections.forEach(s => { s.align = pageAlign.dataset.pageAlign; });
        persistSite();
        renderEditor();
      }
      const shapeBtn = e.target.closest("[data-shape]");
      if (shapeBtn && currentSection()) {
        snapshot();
        currentSection().imageShape = shapeBtn.dataset.shape;
        persistSite();
        renderEditor();
      }
      if (e.target.id === "btn-undo") undoLast();
      if (e.target.id === "btn-preview" && state.current) {
        location.hash = "#/preview/" + state.current.id + "/" + currentPage().id;
      }
      if (e.target.dataset.car) {
        const track = e.target.parentElement.querySelector(".car-track");
        if (track) track.scrollBy({ left: Number(e.target.dataset.car) * 280, behavior: "smooth" });
      }
      const openV = e.target.closest("[data-open-video]");
      if (openV && !e.target.closest(".editable")) {
        const box = $("#site-lightbox");
        if (box) {
          $("#site-lightbox-stage").innerHTML = parseVideo(openV.dataset.openVideo);
          box.classList.add("on");
        }
      }
      if (e.target.id === "site-lightbox" || e.target.closest("[data-close-light]")) {
        const box = $("#site-lightbox");
        if (box) { box.classList.remove("on"); $("#site-lightbox-stage").innerHTML = ""; }
      }
      if (e.target.id === "btn-publish") {
        snapshot();
        state.current.published = !state.current.published;
        persistSite();
        alert(state.current.published
          ? "Publié. Lien public : " + location.origin + location.pathname + "#/p/" + state.current.slug
          : "Remis en brouillon. Plus visible publiquement.");
        renderEditor();
      }
      if (e.target.id === "btn-logout") {
        sessionStorage.removeItem("atelier-ok");
        location.hash = "#/";
        route();
      }
      if (e.target.id === "btn-export") {
        const blob = new Blob([JSON.stringify(state.sites, null, 2)], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "sites.json";
        a.click();
      }
      if (e.target.id === "btn-copy") {
        navigator.clipboard.writeText(JSON.stringify(state.sites, null, 2)).then(
          () => alert("Sites copiés. Colle-les dans le chat Cursor si tu veux que j'y travaille."),
          () => alert("Copie impossible — utilise Exporter.")
        );
      }
    });
    $("#btn-import")?.addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        const list = Array.isArray(data) ? data : (data.sites || []);
        state.sites = mergeSites(state.sites, list);
        saveSites();
        renderDash();
      } catch {
        alert("Fichier JSON invalide.");
      }
      e.target.value = "";
    });

    document.addEventListener("focusin", (e) => {
      if (e.target.matches("[data-d],[data-site],[data-theme],[data-seo],.editable")) snapshot();
    });

    document.addEventListener("input", (e) => {
      if (!state.current) return;
      if (e.target.dataset.site) {
        state.current[e.target.dataset.site] = e.target.value;
        persistSite();
        $("#ed-name").textContent = state.current.name;
      }
      if (e.target.dataset.seo) {
        if (!state.current.seo) state.current.seo = { title: "", description: "" };
        state.current.seo[e.target.dataset.seo] = e.target.value;
        persistSite();
      }
      if (e.target.dataset.theme) {
        const key = e.target.dataset.theme;
        let val = e.target.value;
        if (key === "font") {
          state.current.theme.font = val;
        } else {
          if (val && val[0] !== "#") val = "#" + val;
          if (e.target.type !== "color" && val.length < 7) {
            state.current.theme[key] = val;
            persistSite();
            return;
          }
          const hex = hexColor(val, hexColor(state.current.theme[key], "#888888"));
          state.current.theme[key] = hex;
          $$("[data-theme=\"" + key + "\"]").forEach(el => {
            if (el !== e.target) el.value = hex;
          });
        }
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
        canvas.innerHTML = renderSite(state.current, { editable: true, pageId: currentPage().id });
      }
    });
    document.addEventListener("change", (e) => {
      if (!state.current) return;
      if (e.target.id === "theme-texture") {
        snapshot();
        if (e.target.checked) {
          state.current.theme.bgImage = state.current.theme.texture || "assets/asphalte.jpg";
        } else {
          if (state.current.theme.bgImage) state.current.theme.texture = state.current.theme.bgImage;
          state.current.theme.bgImage = "";
        }
        persistSite();
        applyTheme($("#canvas"), state.current.theme);
        return;
      }
      if (!e.target.dataset.theme) return;
      const key = e.target.dataset.theme;
      if (key === "font") {
        state.current.theme.font = e.target.value;
      } else {
        const hex = hexColor(e.target.value, hexColor(state.current.theme[key], "#888888"));
        state.current.theme[key] = hex;
        $$("[data-theme=\"" + key + "\"]").forEach(el => { el.value = hex; });
      }
      persistSite();
      applyTheme($("#canvas"), state.current.theme);
    });

    document.addEventListener("submit", (e) => {
      const form = e.target.closest("[data-site-form]");
      if (!form) return;
      e.preventDefault();
      const nom = form.nom.value.trim();
      const tel = form.tel.value.trim();
      const msg = form.msg.value.trim();
      const to = form.dataset.siteForm;
      if (to) {
        location.href = `mailto:${to}?subject=${encodeURIComponent("Demande — " + nom)}&body=${encodeURIComponent(tel + "\n\n" + msg)}`;
        return;
      }
      alert("Message prêt. Ajoute un courriel dans le bloc Formulaire pour l'envoyer, ou appelle le 450 378-2117.");
    });

    document.addEventListener("focusout", (e) => {
      const ed = e.target.closest(".editable");
      if (!ed || !state.current) return;
      const sec = currentPage().sections.find(s => s.id === ed.dataset.sec)
        || state.current.pages.flatMap(p => p.sections).find(s => s.id === ed.dataset.sec);
      if (!sec) return;
      setPath(sec.data, ed.dataset.path, ed.textContent.trim());
      persistSite();
    });

    document.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        if (e.target.closest("input,textarea,[contenteditable]")) return;
        e.preventDefault();
        undoLast();
      }
    });

    window.addEventListener("hashchange", route);
  }

  const groups = [];
  SECTION_CATALOG.forEach(s => {
    const g = s.group || "Autres";
    let block = groups.find(x => x.name === g);
    if (!block) { block = { name: g, items: [] }; groups.push(block); }
    block.items.push(s);
  });
  $("#sec-types").innerHTML = groups.map(g =>
    `<div class="sec-group">${g.name}</div>` +
    g.items.map(s => `<button class="btn btn-ghost btn-wide" style="margin-top:6px" type="button" data-add-type="${s.type}">${s.label}</button>`).join("")
  ).join("");

  bind();
  loadSharedSites().then(route);
})();
