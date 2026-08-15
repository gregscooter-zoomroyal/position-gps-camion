(() => {
  const STORAGE_KEY = "zoom-royal-studio-v1";
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const state = {
    filter: "all",
    mediaFilter: "all",
    custom: loadCustom()
  };

  function loadCustom() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { vehicles: [], media: [] };
    } catch {
      return { vehicles: [], media: [] };
    }
  }

  function saveCustom() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.custom));
  }

  function vehicles() {
    return [...(window.ZOOM_ROYAL.vehicles || []), ...state.custom.vehicles];
  }

  function mediaItems() {
    return [...(window.ZOOM_ROYAL.media || []), ...state.custom.media];
  }

  function parseVideo(url) {
    if (!url) return null;
    const raw = String(url).trim();
    let m = raw.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
    if (m) return { kind: "youtube", id: m[1], src: `https://www.youtube-nocookie.com/embed/${m[1]}?autoplay=1&rel=0` };
    if (/^[\w-]{11}$/.test(raw)) return { kind: "youtube", id: raw, src: `https://www.youtube-nocookie.com/embed/${raw}?autoplay=1&rel=0` };
    m = raw.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    if (m) return { kind: "vimeo", id: m[1], src: `https://player.vimeo.com/video/${m[1]}?autoplay=1` };
    if (/\.(mp4|webm|ogg)(\?|$)/i.test(raw) || raw.includes("videos.pexels.com") || raw.includes("coverr.co")) {
      return { kind: "file", src: raw };
    }
    return { kind: "file", src: raw };
  }

  function videoEmbed(url, { autoplay = false, muted = false } = {}) {
    const v = parseVideo(url);
    if (!v) return "";
    if (v.kind === "file") {
      return `<video controls playsinline ${autoplay ? "autoplay" : ""} ${muted ? "muted loop" : ""} src="${esc(v.src)}"></video>`;
    }
    const src = autoplay ? v.src : v.src.replace("autoplay=1", "autoplay=0");
    return `<iframe src="${src}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
  }

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function route() {
    const hash = (location.hash || "#/").replace(/^#/, "");
    const parts = hash.split("/").filter(Boolean);
    const view = parts[0] || "accueil";
    const id = parts[1];
    $$(".nav-links a").forEach(a => {
      a.classList.toggle("active", a.getAttribute("href") === `#/${view}` || (view === "accueil" && a.dataset.view === "accueil"));
    });
    $$(".view").forEach(v => v.classList.remove("on"));
    if (view === "vehicule" && id) {
      $("#view-vehicules").classList.add("on");
      openVehicle(id, false);
      return;
    }
    closeVehicle(false);
    const map = {
      accueil: "#view-accueil",
      vehicules: "#view-vehicules",
      encheres: "#view-encheres",
      media: "#view-media",
      consigner: "#view-consigner",
      encherir: "#view-encherir",
      studio: "#view-studio"
    };
    const el = $(map[view] || "#view-accueil");
    el.classList.add("on");
    window.scrollTo(0, 0);
    if (view === "accueil" || !parts[0]) renderHome();
    if (view === "vehicules") renderCatalog();
    if (view === "encheres") renderEvents("#events-page");
    if (view === "media") renderMedia();
    if (view === "studio") renderStudio();
  }

  function lotCard(v) {
    const img = (v.images && v.images[0]) || "";
    const hasVid = !!v.video;
    return `
      <article class="lot-card" data-id="${esc(v.id)}">
        <div class="lot-media">
          <img src="${esc(img)}" alt="${esc(v.year + " " + v.make + " " + v.model)}">
          <div class="lot-badges">
            <span class="chip">Lot ${esc(v.lot)}</span>
            ${v.noReserve ? '<span class="chip chip-red">No Reserve</span>' : '<span class="chip chip-gold">Reserve</span>'}
          </div>
          ${hasVid ? '<span class="lot-play" aria-hidden="true">▶</span>' : ""}
        </div>
        <div class="lot-body">
          <div class="lot-lot">${esc(v.year)}</div>
          <h3>${esc(v.make)} ${esc(v.model)}</h3>
          <div class="lot-sub">${esc(v.subtitle || "")}</div>
          ${v.estimate ? `<div class="lot-est">${esc(v.estimate)}</div>` : ""}
        </div>
      </article>`;
  }

  function renderHome() {
    const feat = vehicles().filter(v => v.featured);
    $("#featured-track").innerHTML = (feat.length ? feat : vehicles().slice(0, 6)).map(lotCard).join("");
    renderEvents("#events-home");
    renderMediaStrip();
    bindCards("#featured-track");
  }

  function renderCatalog() {
    const all = vehicles();
    const makes = [...new Set(all.map(v => v.make))].sort();
    $("#vehicle-filters").innerHTML = `
      <button data-filter="all" class="${state.filter === "all" ? "on" : ""}">Tous</button>
      <button data-filter="no-reserve" class="${state.filter === "no-reserve" ? "on" : ""}">No Reserve</button>
      ${makes.map(m => `<button data-filter="${esc(m)}" class="${state.filter === m ? "on" : ""}">${esc(m)}</button>`).join("")}
    `;
    const list = all.filter(v => {
      if (state.filter === "all") return true;
      if (state.filter === "no-reserve") return v.noReserve;
      return v.make === state.filter;
    });
    $("#vehicle-grid").innerHTML = list.map(lotCard).join("") || `<p class="form-note">Aucun lot pour ce filtre.</p>`;
    bindCards("#vehicle-grid");
  }

  function renderEvents(sel) {
    const root = $(sel);
    if (!root) return;
    root.innerHTML = ZOOM_ROYAL.events.map(e => `
      <article class="event-card" data-go="#/vehicules">
        <img src="${esc(e.image)}" alt="${esc(e.city)}">
        <div class="kicker">${esc(e.status)}</div>
        <h3>${esc(e.city)}</h3>
        <p>${esc(e.dates)} · ${esc(e.venue)}</p>
        <p class="lot-sub">${esc(e.blurb)}</p>
      </article>
    `).join("");
  }

  function mediaCard(m) {
    const play = m.type === "video" || m.video;
    return `
      <figure class="media-card" data-media="${esc(m.id)}">
        <img src="${esc(m.image)}" alt="${esc(m.title)}">
        ${play ? '<span class="lot-play">▶</span>' : ""}
        <figcaption>
          <div class="kicker">${esc(m.kicker || m.type)}${m.duration ? " · " + esc(m.duration) : ""}</div>
          <h3>${esc(m.title)}</h3>
        </figcaption>
      </figure>`;
  }

  function renderMedia() {
    const items = mediaItems().filter(m => state.mediaFilter === "all" || m.type === state.mediaFilter);
    $("#media-grid").innerHTML = items.map(mediaCard).join("");
    $$("#media-filters button").forEach(b => b.classList.toggle("on", b.dataset.media === state.mediaFilter));
  }

  function renderMediaStrip() {
    const items = mediaItems().slice(0, 6);
    $("#media-home").innerHTML = items.map(mediaCard).join("");
  }

  function bindCards(sel) {
    $$(sel + " .lot-card").forEach(card => {
      card.addEventListener("click", () => {
        location.hash = `#/vehicule/${card.dataset.id}`;
      });
    });
  }

  function findVehicle(id) {
    return vehicles().find(v => v.id === id);
  }

  function findMedia(id) {
    return mediaItems().find(m => m.id === id);
  }

  function openVehicle(id) {
    const v = findVehicle(id);
    if (!v) return;
    const overlay = $("#vehicle-overlay");
    const main = v.images[0];
    overlay.innerHTML = `
      <div class="sheet">
        <div class="sheet-head">
          <div class="kicker">Lot ${esc(v.lot)} · ${esc(v.auction || "")}</div>
          <button class="close-x" type="button" data-close>✕</button>
        </div>
        <div class="detail">
          <div>
            <div class="detail-gallery">
              <img id="hero-shot" src="${esc(main)}" alt="">
              <div class="thumbs">
                ${(v.images || []).map((src, i) => `<img class="${i === 0 ? "on" : ""}" src="${esc(src)}" alt="">`).join("")}
              </div>
            </div>
            ${v.video ? `<div class="video-box" style="margin:0 12px 24px">${videoEmbed(v.video, { autoplay: false })}</div>` : ""}
          </div>
          <div class="detail-copy">
            ${v.noReserve ? '<span class="chip chip-red">No Reserve</span>' : '<span class="chip chip-gold">Reserve</span>'}
            <div class="kicker" style="margin-top:14px">${esc(v.year)}</div>
            <h2>${esc(v.make)} ${esc(v.model)}</h2>
            <p class="lot-sub">${esc(v.subtitle || "")}</p>
            ${v.estimate ? `<p class="lot-est">Estimation ${esc(v.estimate)}</p>` : ""}
            <p>${esc(v.description || "")}</p>
            <table class="specs">
              ${Object.entries(v.specs || {}).map(([k, val]) => `<tr><th>${esc(k)}</th><td>${esc(val)}</td></tr>`).join("")}
            </table>
            <div class="hero-actions">
              <a class="btn btn-red" href="#/encherir">S'inscrire pour enchérir</a>
              ${v.video ? `<button class="btn btn-ghost" type="button" data-play="${esc(v.video)}" data-title="${esc(v.year + " " + v.make + " " + v.model)}">Lire la vidéo</button>` : ""}
            </div>
          </div>
        </div>
      </div>`;
    overlay.classList.add("open");
    document.body.style.overflow = "hidden";
    $$(".thumbs img", overlay).forEach(img => {
      img.addEventListener("click", () => {
        $("#hero-shot", overlay).src = img.src;
        $$(".thumbs img", overlay).forEach(t => t.classList.toggle("on", t === img));
      });
    });
  }

  function closeVehicle(updateHash = true) {
    const overlay = $("#vehicle-overlay");
    overlay.classList.remove("open");
    overlay.innerHTML = "";
    document.body.style.overflow = "";
    if (updateHash && location.hash.startsWith("#/vehicule")) location.hash = "#/vehicules";
  }

  function openLightbox(url, title) {
    const box = $("#lightbox");
    $("#lightbox-title").textContent = title || "";
    $("#lightbox-stage").innerHTML = videoEmbed(url, { autoplay: true });
    box.classList.add("open");
    document.body.style.overflow = "hidden";
  }

  function closeLightbox() {
    $("#lightbox").classList.remove("open");
    $("#lightbox-stage").innerHTML = "";
    document.body.style.overflow = "";
  }

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 2400);
  }

  function renderStudio() {
    const rows = [
      ...state.custom.vehicles.map(v => ({ kind: "Véhicule", title: `${v.year} ${v.make} ${v.model}`, id: v.id, bucket: "vehicles" })),
      ...state.custom.media.map(m => ({ kind: "Média", title: m.title, id: m.id, bucket: "media" }))
    ];
    $("#studio-list").innerHTML = rows.length
      ? rows.map(r => `
        <div class="studio-item">
          <div><div class="kicker">${esc(r.kind)}</div><strong>${esc(r.title)}</strong></div>
          <button type="button" data-del="${esc(r.bucket)}" data-id="${esc(r.id)}">Retirer</button>
        </div>`).join("")
      : `<p class="form-note">Rien d'ajouté pour l'instant. Colle une URL YouTube, Vimeo ou un fichier MP4 ci-dessus.</p>`;
  }

  function uid(prefix) {
    return prefix + "-" + Math.random().toString(36).slice(2, 8);
  }

  function bind() {
    window.addEventListener("hashchange", route);
    window.addEventListener("scroll", () => {
      $(".nav").classList.toggle("solid", window.scrollY > 20);
    });

    $("#nav-toggle").addEventListener("click", () => {
      $(".nav-links").classList.toggle("open");
    });
    $$(".nav-links a").forEach(a => a.addEventListener("click", () => $(".nav-links").classList.remove("open")));

    $("#hero-play").addEventListener("click", () => {
      openLightbox(ZOOM_ROYAL.heroVideo, "Zoom Royal — bande-annonce");
    });

    $("#featured-prev").addEventListener("click", () => {
      $("#featured-track").scrollBy({ left: -400, behavior: "smooth" });
    });
    $("#featured-next").addEventListener("click", () => {
      $("#featured-track").scrollBy({ left: 400, behavior: "smooth" });
    });

    document.addEventListener("click", (e) => {
      const go = e.target.closest("[data-go]");
      if (go) location.hash = go.dataset.go;

      if (e.target.closest("[data-close]") || e.target.id === "vehicle-overlay") {
        if (e.target.id === "vehicle-overlay" || e.target.closest("[data-close]")) closeVehicle();
      }
      if (e.target.id === "lightbox" || e.target.closest("[data-close-light]")) closeLightbox();

      const play = e.target.closest("[data-play]");
      if (play) openLightbox(play.dataset.play, play.dataset.title);

      const media = e.target.closest("[data-media]");
      if (media) {
        const m = findMedia(media.dataset.media);
        if (m && (m.video || m.type === "video")) openLightbox(m.video, m.title);
        else if (m) toast(m.body || m.title);
      }

      const filt = e.target.closest("#vehicle-filters button");
      if (filt) {
        state.filter = filt.dataset.filter;
        renderCatalog();
      }
      const mf = e.target.closest("#media-filters button");
      if (mf) {
        state.mediaFilter = mf.dataset.media;
        renderMedia();
      }

      const del = e.target.closest("[data-del]");
      if (del) {
        const bucket = del.dataset.del;
        state.custom[bucket] = state.custom[bucket].filter(x => x.id !== del.dataset.id);
        saveCustom();
        renderStudio();
        toast("Élément retiré");
      }
    });

    $("#consign-form").addEventListener("submit", (e) => {
      e.preventDefault();
      toast("Demande de consignation envoyée — on te recontacte.");
      e.target.reset();
    });
    $("#bid-form").addEventListener("submit", (e) => {
      e.preventDefault();
      toast("Inscription enchérisseur enregistrée.");
      e.target.reset();
    });

    $("#studio-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const kind = fd.get("kind");
      const video = String(fd.get("video") || "").trim();
      const image = String(fd.get("image") || "").trim() || "https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=1600&q=80";
      if (kind === "vehicle") {
        const item = {
          id: uid("lot"),
          lot: fd.get("lot") || String(1000 + Math.floor(Math.random() * 9000)),
          year: Number(fd.get("year")) || new Date().getFullYear(),
          make: fd.get("make") || "Custom",
          model: fd.get("model") || "Lot",
          subtitle: fd.get("subtitle") || "",
          noReserve: fd.get("noReserve") === "on",
          featured: fd.get("featured") === "on",
          auction: "montreal-2026",
          estimate: fd.get("estimate") || "",
          images: [image],
          video,
          specs: {},
          description: fd.get("description") || ""
        };
        state.custom.vehicles.unshift(item);
      } else {
        state.custom.media.unshift({
          id: uid("media"),
          type: "video",
          title: fd.get("title") || "Nouvelle vidéo",
          kicker: "Studio",
          video,
          image,
          body: fd.get("description") || ""
        });
      }
      saveCustom();
      e.target.reset();
      renderStudio();
      toast("Intégré au site — visible tout de suite");
    });

    $("#studio-export").addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(state.custom, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "zoom-royal-contenu.json";
      a.click();
    });
    $("#studio-import").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const data = JSON.parse(await file.text());
      state.custom = {
        vehicles: data.vehicles || [],
        media: data.media || []
      };
      saveCustom();
      renderStudio();
      toast("Contenu importé");
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeLightbox();
        closeVehicle();
      }
    });
  }

  function bootHero() {
    const a = ZOOM_ROYAL.featuredAuction;
    $("#hero-kicker").textContent = a.kicker;
    $("#hero-title").innerHTML = `${esc(a.city)} <em>${esc(a.year)}</em>`;
    $("#hero-dates").textContent = a.dates;
    $("#hero-venue").textContent = a.venue;
    const video = $("#hero-video");
    const poster = $("#hero-poster");
    if (poster) poster.src = ZOOM_ROYAL.heroPoster;
    video.poster = ZOOM_ROYAL.heroPoster;
    video.src = ZOOM_ROYAL.heroVideo;
    video.addEventListener("error", () => { video.style.display = "none"; });
    const ticker = $("#ticker-track");
    const bits = vehicles().slice(0, 8).map(v => `<span>Lot ${esc(v.lot)} · <b>${esc(v.year)} ${esc(v.make)} ${esc(v.model)}</b></span>`);
    ticker.innerHTML = bits.concat(bits).join("");
    $("#stats").innerHTML = ZOOM_ROYAL.stats.map(s => `<div class="stat"><b>${esc(s.value)}</b><span>${esc(s.label)}</span></div>`).join("");
  }

  bootHero();
  bind();
  route();
})();
