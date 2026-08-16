(() => {
  const AUTH_KEY = "atelier-auth-v1";
  const DATA_KEY = "atelier-sites-v2";
  const DATA_KEY_OLD = "atelier-sites-v1";
  const APP_VERSION = "22";
  const SHARED_KEYS = ["cursor"];
  const SERVER_LOCK = new Set(["site-pavage-go"]);
  const PAVAGE_LOGO = "assets/logo-pavage-go.png?v=22";
  const PAVAGE_ASPHALT = "assets/asphalte-bande.jpg?v=22";
  const DOCK_TYPES = new Set(["services", "about", "contact", "carousel", "media", "video", "gallery", "faq", "quotes", "hours", "form", "map", "logos"]);
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
  const blobUrls = new Map();
  let uploadTarget = null;

  function openMediaDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open("atelier-media-v1", 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains("files")) req.result.createObjectStore("files");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function isPicFile(file) {
    const t = String((file && file.type) || "").toLowerCase();
    const n = String((file && file.name) || "").toLowerCase();
    return t.startsWith("image/") || /\.(jpe?g|png|gif|webp|avif|heic|bmp)$/.test(n);
  }

  function idbKey(ref) {
    return String(ref || "").replace(/^idb:(img:|vid:)?/, "");
  }

  async function mediaPut(file) {
    const id = uid("file");
    const buf = await file.arrayBuffer();
    const pic = isPicFile(file);
    const mime = file.type || (pic ? "image/jpeg" : "video/mp4");
    const db = await openMediaDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction("files", "readwrite");
      tx.objectStore("files").put({ type: mime, name: file.name || "", buf }, id);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    return (pic ? "idb:img:" : "idb:vid:") + id;
  }

  async function mediaUrl(ref) {
    const raw = String(ref || "");
    if (!raw.startsWith("idb:")) return raw;
    if (blobUrls.has(raw)) return blobUrls.get(raw);
    const db = await openMediaDb();
    const rec = await new Promise((resolve, reject) => {
      const tx = db.transaction("files", "readonly");
      const q = tx.objectStore("files").get(idbKey(raw));
      q.onsuccess = () => resolve(q.result);
      q.onerror = () => reject(q.error);
    });
    if (!rec) return "";
    const fallback = String(raw).startsWith("idb:img:") ? "image/jpeg" : "video/mp4";
    const url = URL.createObjectURL(new Blob([rec.buf], { type: rec.type || fallback }));
    blobUrls.set(raw, url);
    return url;
  }

  function loopAttrs() {
    return 'autoplay muted loop playsinline webkit-playsinline preload="auto" disablepictureinpicture controlslist="nodownload nofullscreen noremoteplayback"';
  }

  function armVideo(el) {
    if (!el || el.tagName !== "VIDEO") return;
    const play = () => {
      el.muted = true;
      el.defaultMuted = true;
      el.volume = 0;
      el.loop = true;
      el.autoplay = true;
      el.playsInline = true;
      el.controls = false;
      const p = el.play();
      if (p && p.catch) p.catch(() => {});
    };
    if (el.dataset.armed === "1") {
      play();
      return;
    }
    el.dataset.armed = "1";
    el.setAttribute("muted", "");
    el.setAttribute("autoplay", "");
    el.setAttribute("loop", "");
    el.setAttribute("playsinline", "");
    el.setAttribute("webkit-playsinline", "");
    el.removeAttribute("controls");
    el.addEventListener("loadeddata", play);
    el.addEventListener("canplay", play);
    el.addEventListener("ended", () => { el.currentTime = 0; play(); });
    play();
  }

  function kickVideos(root) {
    (root || document).querySelectorAll("video").forEach(armVideo);
  }

  async function hydrateMedia(root) {
    if (!root) return;
    const els = [...root.querySelectorAll("[data-media-src]")];
    for (const el of els) {
      const src = await mediaUrl(el.dataset.mediaSrc);
      if (src) el.src = src;
      if (el.tagName === "VIDEO") armVideo(el);
    }
    const hosts = [...root.querySelectorAll("[data-logo-host]")];
    for (const host of hosts) {
      const ref = host.dataset.logoHost;
      const src = await mediaUrl(ref);
      if (src) host.style.setProperty("--hero-logo", "url(\"" + src + "\")");
    }
    kickVideos(root);
  }

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
    if (site.id === "site-pavage-go") {
      if (!site.theme) site.theme = baseTheme();
      site.theme.bgImage = PAVAGE_ASPHALT;
      (site.pages || []).forEach(p => {
        (p.sections || []).forEach(s => {
          if (!s.data) return;
          if ((s.type === "nav" || s.type === "hero") && (!s.data.logo || (String(s.data.logo).includes("logo-pavage-go") && !String(s.data.logo).startsWith("idb:")))) {
            s.data.logo = PAVAGE_LOGO;
          }
        });
      });
    }
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

  function isFileVideo(url) {
    const u = String(url || "");
    if (!u) return false;
    if (u.startsWith("idb:img:")) return false;
    if (/\.(jpe?g|png|gif|webp|avif|heic|bmp)($|\?)/i.test(u)) return false;
    return u.startsWith("idb:") || u.startsWith("blob:") || /\.(mp4|webm|mov|m4v)($|\?)/i.test(u) || /youtube|youtu\.be|vimeo/.test(u);
  }

  function dropLabel(photoOnly) {
    if (photoOnly) {
      return `<div class="media-drop-label">Clique ici ou glisse une photo<br><small>JPG, PNG ou WebP — même geste que pour les MP4</small></div>`;
    }
    return `<div class="media-drop-label">Clique ici ou glisse une photo ou un MP4<br><small>Fichier sur ton ordinateur</small></div>`;
  }

  function parseVideo(url) {
    if (!url) return `<div class="video-empty">Clique ici<br><small>Choisis le MP4 sur ton ordinateur</small></div>`;
    const raw = String(url).trim();
    let m = raw.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
    if (m) {
      const id = m[1];
      return `<iframe src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&controls=0&loop=1&playlist=${id}&playsinline=1&rel=0" allow="autoplay; encrypted-media" title=""></iframe>`;
    }
    m = raw.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    if (m) return `<iframe src="https://player.vimeo.com/video/${m[1]}?background=1&autoplay=1&loop=1&muted=1" allow="autoplay" title=""></iframe>`;
    if (raw.startsWith("idb:")) return `<video ${loopAttrs()} data-media-src="${esc(raw)}"></video>`;
    return `<video ${loopAttrs()} src="${esc(raw)}"></video>`;
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
    if (raw.startsWith("idb:")) return `<video class="bg-video" ${loopAttrs()} data-media-src="${esc(raw)}"></video>`;
    return `<video class="bg-video" ${loopAttrs()} src="${esc(raw)}"></video>`;
  }

  function isLocalRef(url) {
    return String(url || "").startsWith("idb:");
  }

  function imgTag(src, className) {
    if (!src) return "";
    const cls = className ? ` class="${className}"` : "";
    if (isLocalRef(src)) return `<img${cls} alt="" data-media-src="${esc(src)}">`;
    return `<img${cls} alt="" src="${esc(src)}">`;
  }

  function heroLogoSrc(d, site) {
    if (d && d.logo) return d.logo;
    if (d && d.image && isLocalRef(d.image)) return d.image;
    const nav = ((site && site.pages) || []).flatMap(p => p.sections || []).find(s => s.type === "nav");
    if (nav && nav.data && nav.data.logo) return nav.data.logo;
    if (site && site.id === "site-pavage-go") return PAVAGE_LOGO;
    return "";
  }

  function heroCopy(sec, d, f, editable, markHtml = "") {
    const btn = f("cta", d.cta);
    const href = (d.href || "").trim();
    const inner = href && !editable
      ? `<a class="s-btn" href="${esc(href)}">${btn}</a>`
      : `<span class="s-btn">${btn}</span>`;
    return `<div class="copy">
      ${markHtml}
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
    const src = d.logo || (site && site.id === "site-pavage-go" ? PAVAGE_LOGO : "");
    const logo = imgTag(src, "");
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
      const hasVid = !!d.video;
      const hasPhoto = !!d.image;
      const bg = hasVid
        ? `<div class="hero-media">${parseVideoBg(d.video)}</div>`
        : (hasPhoto ? `<div class="hero-media">${imgTag(d.image, "hero-photo")}</div>` : "");
      const markSrc = heroLogoSrc(d, site);
      const mark = imgTag(markSrc, "hero-mark");
      const onCanvas = !hasVid && !hasPhoto;
      const pickHero = editable ? ` data-upload-hero="${sec.id}"` : "";
      const addBtn = editable
        ? `<button class="video-replace" type="button" data-upload-hero="${sec.id}">Photo ou MP4</button>`
        : "";
      return `<div class="s-hero ${hasVid ? "has-video" : ""} ${hasPhoto ? "has-photo" : ""} ${onCanvas ? "on-canvas" : ""} ${markSrc ? "has-mark" : ""}"${pickHero}>
        ${bg}
        ${mark}
        ${addBtn}
        ${heroCopy(sec, d, f, editable)}
      </div>`;
    }
    if (sec.type === "video-bg") {
      const markSrc = heroLogoSrc(d, site);
      const mark = imgTag(markSrc, "hero-mark");
      return `<div class="s-hero s-video-bg has-video">
        <div class="hero-media">${parseVideoBg(d.video)}</div>
        <div class="shade"></div>
        ${heroCopy(sec, d, f, editable, mark)}
      </div>`;
    }
    if (sec.type === "stats") {
      const cells = (d.items || []).map((it, i) =>
        `<div class="stat"><b>${f("items." + i + ".value", it.value)}</b><span>${f("items." + i + ".label", it.label)}</span></div>`
      ).join("");
      return `<div class="s-stats">${cells}</div>`;
    }
    if (sec.type === "carousel") {
      const cards = (d.cards || []).map((c, i) => {
        const drop = editable ? ` data-upload-car="${sec.id}:${i}"` : "";
        const pic = c.image
          ? imgTag(c.image, "")
          : (editable ? dropLabel(true) : "");
        return `
        <article class="car-card">
          <div class="car-img ${editable ? "media-drop" : ""}"${drop}>${pic}</div>
          <div class="car-body">
            <div class="kicker">${f("cards." + i + ".kicker", c.kicker)}</div>
            <h4>${f("cards." + i + ".title", c.title, "span")}</h4>
            <p>${f("cards." + i + ".text", c.text)}</p>
          </div>
        </article>`;
      }).join("");
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
      const cards = (d.items || []).map((it, i) => {
        const uploadAttr = editable ? ` data-upload="${sec.id}:${i}"` : "";
        const empty = !it.video && !it.image;
        if (editable && empty) {
          return `<figure class="media-card media-drop"${uploadAttr}>
            ${dropLabel()}
            <figcaption>
              <div class="kicker">${f("items." + i + ".kicker", it.kicker)}</div>
              <h4>${f("items." + i + ".title", it.title, "span")}</h4>
            </figcaption>
          </figure>`;
        }
        const fileVid = !!it.video && isFileVideo(it.video);
        const thumb = it.video
          ? (fileVid
            ? `<video ${loopAttrs()} ${isLocalRef(it.video) ? `data-media-src="${esc(it.video)}"` : `src="${esc(it.video)}"`}></video>`
            : parseVideo(it.video))
          : imgTag(it.image, "");
        const replace = editable
          ? `<button class="video-replace" type="button" data-upload="${sec.id}:${i}">Remplacer</button>`
          : "";
        return `<figure class="media-card media-loop"${uploadAttr}>
          ${thumb}
          ${replace}
          <figcaption>
            <div class="kicker">${f("items." + i + ".kicker", it.kicker)}</div>
            <h4>${f("items." + i + ".title", it.title, "span")}</h4>
          </figcaption>
        </figure>`;
      }).join("");
      return `<div class="s-media pad">${f("title", d.title, "h3")}<div class="media-grid">${cards}</div></div>`;
    }
    if (sec.type === "services") {
      const items = (d.items || []).map((it, i) => `
        <div class="svc">${f("items." + i + ".title", it.title, "h4")}${f("items." + i + ".text", it.text, "p")}</div>`).join("");
      return `<div class="s-services pad">${f("title", d.title, "h3")}<div class="svc-grid">${items}</div></div>`;
    }
    if (sec.type === "about") {
      const pic = d.image
        ? imgTag(d.image, "")
        : (editable ? dropLabel(true) : "");
      const drop = editable ? ` data-upload-about="${sec.id}"` : "";
      return `<div class="s-about pad"><div class="about-grid">
        <div>${f("title", d.title, "h3")}${f("text", d.text, "p")}</div>
        <div class="about-photo ${editable ? "media-drop" : ""}"${drop}>${pic}</div>
      </div></div>`;
    }
    if (sec.type === "video") {
      let box;
      const hasImg = !!d.image && !d.url;
      if (!editable) {
        box = `<div class="video-box">${hasImg ? imgTag(d.image, "hero-photo") : parseVideo(d.url)}</div>`;
      } else if (!d.url && !d.image) {
        box = `<div class="video-box video-drop" data-upload-url="${sec.id}">${dropLabel()}</div>`;
      } else {
        const inner = hasImg ? imgTag(d.image, "hero-photo") : parseVideo(d.url);
        box = `<div class="video-box video-has">${inner}<button class="video-replace" type="button" data-upload-url="${sec.id}">Remplacer</button></div>`;
      }
      return `<div class="s-video pad">${f("title", d.title, "h3")}${box}</div>`;
    }
    if (sec.type === "gallery") {
      const imgs = (d.images || []).map((src, i) => {
        const tag = imgTag(src, "");
        if (!editable) return tag;
        return `<div class="gal-item" data-upload-gal="${sec.id}:${i}">${tag}</div>`;
      }).join("");
      const add = editable
        ? `<div class="gal-add media-drop" data-upload-gal="${sec.id}">${dropLabel(true)}</div>`
        : "";
      return `<div class="s-gallery pad">${f("title", d.title, "h3")}<div class="gal">${imgs}${add}</div></div>`;
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
        ? imgTag(it.image, "")
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
    const pavage = (state.current && state.current.id === "site-pavage-go") || (theme && String(theme.bgImage || "").includes("asphalte"));
    const asphalt = pavage || !!(theme && theme.bgImage);
    const paint = (el) => {
      if (!el) return;
      el.style.setProperty("--site-primary", primary);
      el.style.setProperty("--site-accent", accent);
      el.style.setProperty("--site-bg", bg);
      el.style.setProperty("--site-text", text);
      el.style.fontFamily = (theme.font || "DM Sans") + ", DM Sans, sans-serif";
      el.classList.toggle("has-asphalt", asphalt);
      if (asphalt) {
        const url = 'url("' + PAVAGE_ASPHALT + '")';
        el.style.color = "#f3f3f1";
        el.style.removeProperty("background");
        el.style.setProperty("background-color", "#3a3a3a", "important");
        el.style.setProperty("background-image", url, "important");
        el.style.setProperty("background-repeat", "repeat", "important");
        el.style.setProperty("background-size", "420px 420px", "important");
        el.style.setProperty("background-position", "0 0", "important");
      } else {
        el.style.color = text;
        el.style.background = bg;
        el.style.backgroundImage = "none";
      }
    };
    paint(root);
    if (root.id === "canvas") {
      paint($("#canvas-wrap"));
      const ws = document.querySelector("#screen-editor .workspace");
      if (ws) ws.classList.toggle("has-asphalt", asphalt);
    }
  }

  function renderSite(site, { editable = false, pageId = null, preview = false } = {}) {
    const page = pageOf(site, pageId || state.pageId);
    return (page.sections || []).map(sec => {
      const align = sec.align || "left";
      const shape = sec.imageShape || "rounded";
      const dock = DOCK_TYPES.has(sec.type) ? " dockable" : "";
      const wrap = `<div class="sec align-${align} img-${shape}${dock} ${state.selected === sec.id ? "sec-selected" : ""}" data-id="${sec.id}" data-type="${esc(sec.type)}">${renderSection(sec, editable, site, preview)}</div>`;
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
      hydrateMedia(root);
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
      hydrateMedia(root);
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
    canvas.classList.add("editing");
    canvas.innerHTML = renderSite(site, { editable: true, pageId: currentPage().id });
    hydrateMedia(canvas);
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
    html += `<p style="color:var(--muted);font-size:12px;margin:0 0 12px">Glisse le rectangle sur la page. Les lignes roses indiquent Gauche, Centre, Droite.</p>`;
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
      logo: "Logo (derrière le titre)",
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
            if (ik === "video" || ik === "image") {
              html += `<button class="btn btn-ghost btn-wide" type="button" data-pick="${k}.${i}.${ik}">Choisir un fichier sur cet ordinateur</button>`;
            }
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
        if (k === "video" || k === "url" || k === "image" || k === "logo") {
          html += `<button class="btn btn-ghost btn-wide" type="button" data-pick="${k}">Choisir un fichier sur cet ordinateur</button>`;
        }
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

  function applyPathFile(sec, path, ref, pic) {
    const itemMedia = String(path).match(/^items\.(\d+)\.(image|video)$/);
    if (itemMedia) {
      const it = sec.data.items && sec.data.items[Number(itemMedia[1])];
      if (!it) return;
      if (pic) {
        it.image = ref;
        it.video = "";
      } else {
        it.video = ref;
        it.image = "";
      }
      return;
    }
    const cardImg = String(path).match(/^cards\.(\d+)\.image$/);
    if (cardImg) {
      if (!pic) {
        alert("Choisis une photo (JPG, PNG ou WebP) pour cette carte.");
        return;
      }
      if (sec.data.cards && sec.data.cards[Number(cardImg[1])]) {
        sec.data.cards[Number(cardImg[1])].image = ref;
      }
      return;
    }
    if (pic && path === "logo") {
      sec.data.logo = ref;
      if (sec.type === "hero") sec.data.image = sec.data.image || "";
      if (sec.type === "nav") {
        const hero = currentPage().sections.find(s => s.type === "hero");
        if (hero && hero.data) hero.data.logo = ref;
      }
      return;
    }
    if (sec.type === "hero" && (path === "image" || path === "video")) {
      if (pic) {
        sec.data.image = ref;
        sec.data.video = "";
      } else {
        sec.data.video = ref;
        sec.data.image = "";
      }
      return;
    }
    if (sec.type === "video" && (path === "url" || path === "image")) {
      if (pic) {
        sec.data.image = ref;
        sec.data.url = "";
      } else {
        sec.data.url = ref;
        sec.data.image = "";
      }
      return;
    }
    setPath(sec.data, path, ref);
  }

  function startPick(target) {
    uploadTarget = target;
    const input = $("#file-media");
    if (!input) return;
    const logoOnly = target.path && /(^|\.)logo$/.test(String(target.path));
    const photoOnly = !!(target.about || target.carousel || target.gallery) ||
      /^cards\.\d+\.image$/.test(String(target.path || ""));
    input.accept = (logoOnly || photoOnly)
      ? "image/*"
      : "image/*,video/mp4,video/webm,video/quicktime,.jpg,.jpeg,.png,.webp,.gif,.heic";
    input.value = "";
    input.click();
  }

  async function takeFile(file) {
    if (!file || !uploadTarget || !state.current) return;
    if (file.size > 80 * 1024 * 1024) {
      alert("Fichier trop lourd (max 80 Mo). Compresse-le, ou mets la vidéo sur YouTube et colle le lien.");
      return;
    }
    const ref = await mediaPut(file);
    const pic = isPicFile(file);
    const nice = file.name.replace(/\.[^.]+$/, "") || (pic ? "Photo" : "Vidéo");
    snapshot();
    if (uploadTarget.media) {
      const [secId, idx] = uploadTarget.media;
      const block = currentPage().sections.find(s => s.id === secId);
      if (block && block.data.items && block.data.items[idx] != null) {
        const it = block.data.items[idx];
        if (pic) {
          it.image = ref;
          it.video = "";
        } else {
          it.video = ref;
          it.image = "";
        }
        it.kicker = pic ? "Photo" : "Chantier";
        it.title = nice;
      }
    } else if (uploadTarget.url) {
      const block = currentPage().sections.find(s => s.id === uploadTarget.url);
      if (block) {
        if (pic) {
          block.data.image = ref;
          block.data.url = "";
        } else {
          block.data.url = ref;
          block.data.image = "";
        }
      }
    } else if (uploadTarget.hero) {
      const block = currentPage().sections.find(s => s.id === uploadTarget.hero);
      if (block) {
        if (pic) {
          block.data.image = ref;
          block.data.video = "";
        } else {
          block.data.video = ref;
          block.data.image = "";
        }
      }
    } else if (uploadTarget.about) {
      if (!pic) {
        alert("Glisse une photo (JPG, PNG ou WebP) dans ce carré. Les MP4 vont dans Média, Vidéo ou le bandeau.");
        return;
      }
      const block = currentPage().sections.find(s => s.id === uploadTarget.about);
      if (block) block.data.image = ref;
    } else if (uploadTarget.carousel) {
      if (!pic) {
        alert("Glisse une photo (JPG, PNG ou WebP) dans cette carte. Les MP4 vont dans Média, Vidéo ou le bandeau.");
        return;
      }
      const [secId, idx] = uploadTarget.carousel;
      const block = currentPage().sections.find(s => s.id === secId);
      if (block && block.data.cards && block.data.cards[idx] != null) {
        block.data.cards[idx].image = ref;
      }
    } else if (uploadTarget.gallery) {
      if (!pic) {
        alert("Glisse une photo (JPG, PNG ou WebP) dans la galerie. Les MP4 vont dans Média, Vidéo ou le bandeau.");
        return;
      }
      const spec = String(uploadTarget.gallery);
      const parts = spec.split(":");
      const block = currentPage().sections.find(s => s.id === parts[0]);
      if (block) {
        if (!Array.isArray(block.data.images)) block.data.images = [];
        const idx = parts.length > 1 ? Number(parts[1]) : -1;
        if (idx >= 0 && block.data.images[idx] != null) block.data.images[idx] = ref;
        else block.data.images.push(ref);
      }
    } else if (uploadTarget.path && currentSection()) {
      applyPathFile(currentSection(), uploadTarget.path, ref, pic);
    }
    persistSite();
    renderEditor();
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

  const canvasDrag = { active: false, moved: false };

  function bindCanvasDrag() {
    const SNAP = 14;
    let job = null;

    const showGuides = (on) => {
      const g = $("#align-guides");
      if (g) g.classList.toggle("on", !!on);
    };
    const setGuide = (name, on) => {
      const el = $("#guide-" + name);
      if (el) el.classList.toggle("on", !!on);
    };
    const hideDrop = () => {
      const d = $("#drop-line");
      if (d) d.classList.remove("on");
    };

    document.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      if (!$("#screen-editor") || !$("#screen-editor").classList.contains("on")) return;
      if (e.target.closest("a,button,input,textarea,select,summary,.editable,[contenteditable],[data-upload],[data-upload-url],[data-upload-about],[data-upload-car],[data-upload-gal],video,iframe,.car-btn,.car-track")) return;
      const sec = e.target.closest("#canvas .sec");
      if (!sec || !sec.dataset.id) return;
      const r = sec.getBoundingClientRect();
      job = {
        id: sec.dataset.id,
        el: sec,
        startX: e.clientX,
        startY: e.clientY,
        origX: r.left,
        origY: r.top,
        origW: r.width,
        origH: r.height,
        align: (sec.className.match(/align-(left|center|right)/) || [,"left"])[1],
        insertAt: null,
        insertIds: null,
        dy: 0
      };
      canvasDrag.moved = false;
      canvasDrag.active = false;
    });

    document.addEventListener("pointermove", (e) => {
      if (!job) return;
      const dx0 = e.clientX - job.startX;
      const dy0 = e.clientY - job.startY;
      if (!canvasDrag.active) {
        if (Math.hypot(dx0, dy0) < 8) return;
        canvasDrag.active = true;
        canvasDrag.moved = true;
        snapshot();
        state.selected = job.id;
        job.el.classList.add("sec-selected", "sec-dragging");
        const c = $("#canvas");
        if (c) c.classList.add("is-dragging");
        showGuides(true);
        try { job.el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      }
      e.preventDefault();
      const c = $("#canvas");
      const wrap = $("#canvas-wrap");
      if (!c || !wrap) return;
      const cr = c.getBoundingClientRect();
      const wr = wrap.getBoundingClientRect();
      let useDx = dx0;
      let useDy = dy0;
      const left = job.origX + useDx;
      const w = job.origW;
      const cx = left + w / 2;
      const right = left + w;
      const targets = [
        { name: "left", x: cr.left, edge: "left" },
        { name: "center", x: cr.left + cr.width / 2, edge: "center" },
        { name: "right", x: cr.right, edge: "right" }
      ];
      ["left", "center", "right"].forEach(n => setGuide(n, false));
      let best = null;
      let bestDist = SNAP + 1;
      for (const t of targets) {
        const val = t.edge === "left" ? left : t.edge === "right" ? right : cx;
        const dist = Math.abs(val - t.x);
        if (dist < bestDist) {
          bestDist = dist;
          best = t;
        }
      }
      if (best && bestDist <= SNAP) {
        const val = best.edge === "left" ? left : best.edge === "right" ? right : cx;
        useDx += (best.x - val);
        job.align = best.name;
        setGuide(best.name, true);
      } else {
        const rel = (cx - cr.left) / Math.max(cr.width, 1);
        job.align = rel < 0.38 ? "left" : rel > 0.62 ? "right" : "center";
        setGuide(job.align, true);
      }
      job.el.style.transform = "translate(" + useDx + "px," + useDy + "px)";
      job.dy = useDy;

      const others = $$("#canvas .sec").filter(s => s !== job.el);
      const midY = job.origY + useDy + job.origH / 2;
      const ids = others.map(s => s.dataset.id);
      let insertAt = ids.length;
      let lineY = others.length ? (others[others.length - 1].getBoundingClientRect().bottom - wr.top) : 8;
      for (let i = 0; i < others.length; i++) {
        const or = others[i].getBoundingClientRect();
        if (midY < or.top + or.height / 2) {
          insertAt = i;
          lineY = or.top - wr.top;
          break;
        }
      }
      job.insertIds = ids;
      job.insertAt = insertAt;
      const dl = $("#drop-line");
      if (dl) {
        dl.style.top = Math.max(0, lineY) + "px";
        dl.classList.add("on");
      }
    }, { passive: false });

    const endDrag = () => {
      if (!job) return;
      const j = job;
      job = null;
      showGuides(false);
      ["left", "center", "right"].forEach(n => setGuide(n, false));
      hideDrop();
      const c = $("#canvas");
      if (c) c.classList.remove("is-dragging");
      j.el.classList.remove("sec-dragging");
      j.el.style.transform = "";
      if (!canvasDrag.active) return;
      canvasDrag.active = false;
      if (!state.current) {
        canvasDrag.moved = false;
        return;
      }
      const page = currentPage();
      const sec = page.sections.find(s => s.id === j.id);
      if (sec) sec.align = j.align;
      if (Math.abs(j.dy) > 22 && j.insertIds) {
        const map = new Map(page.sections.map(s => [s.id, s]));
        const next = j.insertIds.slice();
        next.splice(Math.min(j.insertAt, next.length), 0, j.id);
        page.sections = next.map(id => map.get(id)).filter(Boolean);
      }
      persistSite();
      renderEditor();
      setTimeout(() => { canvasDrag.moved = false; }, 0);
    };
    document.addEventListener("pointerup", endDrag);
    document.addEventListener("pointercancel", endDrag);
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
      const upCard = e.target.closest("[data-upload]");
      if (upCard && $("#screen-editor") && $("#screen-editor").classList.contains("on") && !canvasDrag.moved && !e.target.closest(".editable")) {
        const parts = upCard.dataset.upload.split(":");
        startPick({ media: [parts[0], Number(parts[1])] });
        return;
      }
      const upUrl = e.target.closest("[data-upload-url]");
      if (upUrl && !canvasDrag.moved) {
        startPick({ url: upUrl.dataset.uploadUrl });
        return;
      }
      const upHero = e.target.closest("[data-upload-hero]");
      if (upHero && !canvasDrag.moved && !e.target.closest(".editable") && !e.target.closest(".copy")) {
        startPick({ hero: upHero.dataset.uploadHero });
        return;
      }
      const upAbout = e.target.closest("[data-upload-about]");
      if (upAbout && !canvasDrag.moved && !e.target.closest(".editable")) {
        startPick({ about: upAbout.dataset.uploadAbout });
        return;
      }
      const upCar = e.target.closest("[data-upload-car]");
      if (upCar && !canvasDrag.moved && !e.target.closest(".editable")) {
        const parts = upCar.dataset.uploadCar.split(":");
        startPick({ carousel: [parts[0], Number(parts[1])] });
        return;
      }
      const upGal = e.target.closest("[data-upload-gal]");
      if (upGal && !canvasDrag.moved) {
        startPick({ gallery: upGal.dataset.uploadGal });
        return;
      }
      const pick = e.target.closest("[data-pick]");
      if (pick) {
        startPick({ path: pick.dataset.pick });
        return;
      }
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
      if (sec && canvasDrag.moved) return;
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
          hydrateMedia($("#site-lightbox-stage"));
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
    $("#file-media")?.addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = "";
      if (!file) return;
      try { await takeFile(file); }
      catch { alert("Impossible d'importer ce fichier."); }
    });
    document.addEventListener("dragover", (e) => {
      if (!$("#screen-editor") || !$("#screen-editor").classList.contains("on")) return;
      const zone = e.target.closest("[data-upload],[data-upload-url],[data-upload-hero],[data-upload-about],[data-upload-car],[data-upload-gal]");
      if (zone) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        zone.classList.add("drop-hover");
      }
    });
    document.addEventListener("dragleave", (e) => {
      const zone = e.target.closest("[data-upload],[data-upload-url],[data-upload-hero],[data-upload-about],[data-upload-car],[data-upload-gal]");
      if (zone && !zone.contains(e.relatedTarget)) zone.classList.remove("drop-hover");
    });
    document.addEventListener("drop", async (e) => {
      if (!$("#screen-editor") || !$("#screen-editor").classList.contains("on")) return;
      const card = e.target.closest("[data-upload]");
      const urlBox = e.target.closest("[data-upload-url]");
      const hero = e.target.closest("[data-upload-hero]");
      const about = e.target.closest("[data-upload-about]");
      const car = e.target.closest("[data-upload-car]");
      const gal = e.target.closest("[data-upload-gal]");
      if (!card && !urlBox && !hero && !about && !car && !gal) return;
      e.preventDefault();
      const file = e.dataTransfer.files && e.dataTransfer.files[0];
      if (!file) return;
      if (card) {
        const parts = card.dataset.upload.split(":");
        uploadTarget = { media: [parts[0], Number(parts[1])] };
      } else if (urlBox) {
        uploadTarget = { url: urlBox.dataset.uploadUrl };
      } else if (hero) {
        uploadTarget = { hero: hero.dataset.uploadHero };
      } else if (about) {
        uploadTarget = { about: about.dataset.uploadAbout };
      } else if (car) {
        const parts = car.dataset.uploadCar.split(":");
        uploadTarget = { carousel: [parts[0], Number(parts[1])] };
      } else {
        uploadTarget = { gallery: gal.dataset.uploadGal };
      }
      try { await takeFile(file); }
      catch { alert("Impossible d'importer ce fichier."); }
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
        hydrateMedia(canvas);
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
    document.addEventListener("click", () => kickVideos(), true);
    document.addEventListener("touchstart", () => kickVideos(), { capture: true, passive: true });
    document.addEventListener("visibilitychange", () => { if (!document.hidden) kickVideos(); });
    setInterval(() => {
      document.querySelectorAll("video").forEach(v => {
        if (v.paused) armVideo(v);
      });
    }, 800);
    bindCanvasDrag();
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
