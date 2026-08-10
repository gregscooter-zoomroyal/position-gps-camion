/**
 * Position · GPS Camion — helpers Navigation Pro (client-side)
 * Attache l'API sur window.NavPro. Sans build, sans auth.
 */
(function (global) {
  'use strict';

  // ── Clés de stockage ──────────────────────────────────────────────
  var KEYS = {
    vehicleProfile: 'positionGps_vehicleProfile_v1',
    routeOptions: 'positionGps_routeOptions_v1',
    favorites: 'positionGps_favorites_v1',
    tripHistory: 'positionGps_tripHistory_v1',
    hazards: 'positionGps_hazards_v1'
  };

  /** Charge du JSON depuis localStorage (ou fallback). */
  function loadJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (raw == null || raw === '') return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  /** Sauvegarde une valeur en JSON dans localStorage. */
  function saveJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }

  function uid(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  // ── Profils véhicule ──────────────────────────────────────────────
  /** Dimensions typiques PL (mètres / tonnes). */
  var VEHICLE_PRESETS = {
    drybox: {
      id: 'drybox',
      name: 'Drybox',
      height: 4.15,
      width: 2.6,
      length: 21.64,
      weight: 36.287,
      axle_load: 9.07,
      axle_count: 5
    },
    plateau: {
      id: 'plateau',
      name: 'Plateau',
      height: 4.0,
      width: 2.55,
      length: 16.5,
      weight: 32.0,
      axle_load: 8.5,
      axle_count: 5
    },
    fourgon: {
      id: 'fourgon',
      name: 'Fourgon',
      height: 3.5,
      width: 2.4,
      length: 12.0,
      weight: 18.0,
      axle_load: 7.5,
      axle_count: 3
    },
    custom: {
      id: 'custom',
      name: 'Personnalisé',
      height: 4.0,
      width: 2.55,
      length: 16.5,
      weight: 26.0,
      axle_load: 8.0,
      axle_count: 4
    }
  };

  function normalizeProfile(input) {
    var base = VEHICLE_PRESETS.custom;
    var src = input || {};
    var presetId = src.id && VEHICLE_PRESETS[src.id] ? src.id : (src.preset && VEHICLE_PRESETS[src.preset] ? src.preset : 'custom');
    var preset = VEHICLE_PRESETS[presetId] || base;
    return {
      id: presetId,
      name: src.name != null ? String(src.name) : preset.name,
      height: numOr(src.height, preset.height),
      width: numOr(src.width, preset.width),
      length: numOr(src.length, preset.length),
      weight: numOr(src.weight, preset.weight),
      axle_load: numOr(src.axle_load, preset.axle_load),
      axle_count: Math.max(1, Math.round(numOr(src.axle_count, preset.axle_count)))
    };
  }

  function numOr(v, d) {
    var n = Number(v);
    return isFinite(n) ? n : d;
  }

  function getVehiclePresets() {
    return JSON.parse(JSON.stringify(VEHICLE_PRESETS));
  }

  function getActiveVehicleProfile() {
    var stored = loadJSON(KEYS.vehicleProfile, null);
    if (!stored) return normalizeProfile(VEHICLE_PRESETS.drybox);
    return normalizeProfile(stored);
  }

  function setActiveVehicleProfile(profileOrId) {
    var profile;
    if (typeof profileOrId === 'string' && VEHICLE_PRESETS[profileOrId]) {
      profile = normalizeProfile(VEHICLE_PRESETS[profileOrId]);
    } else {
      profile = normalizeProfile(profileOrId);
    }
    saveJSON(KEYS.vehicleProfile, profile);
    return profile;
  }

  // ── Options d'itinéraire ──────────────────────────────────────────
  var DEFAULT_ROUTE_OPTIONS = {
    avoidTolls: false,
    avoidFerries: false,
    avoidBorders: true,
    useTraffic: true
  };

  function getRouteOptions() {
    var stored = loadJSON(KEYS.routeOptions, {});
    return {
      avoidTolls: !!(stored && stored.avoidTolls),
      avoidFerries: !!(stored && stored.avoidFerries),
      avoidBorders: stored && 'avoidBorders' in stored ? !!stored.avoidBorders : true,
      useTraffic: stored && typeof stored.useTraffic === 'boolean' ? stored.useTraffic : DEFAULT_ROUTE_OPTIONS.useTraffic
    };
  }

  function setRouteOptions(partial) {
    var current = getRouteOptions();
    var next = {
      avoidTolls: partial && 'avoidTolls' in partial ? !!partial.avoidTolls : current.avoidTolls,
      avoidFerries: partial && 'avoidFerries' in partial ? !!partial.avoidFerries : current.avoidFerries,
      avoidBorders: partial && 'avoidBorders' in partial ? !!partial.avoidBorders : current.avoidBorders,
      useTraffic: partial && 'useTraffic' in partial ? !!partial.useTraffic : current.useTraffic
    };
    saveJSON(KEYS.routeOptions, next);
    return next;
  }

  // ── Favoris ───────────────────────────────────────────────────────
  var FAVORITE_KINDS = { favorite: 1, home: 1, depot: 1, recent: 1 };
  var MAX_RECENTS = 10;

  function listFavorites() {
    var list = loadJSON(KEYS.favorites, []);
    return Array.isArray(list) ? list.slice() : [];
  }

  function saveFavorites(list) {
    saveJSON(KEYS.favorites, list);
    return list;
  }

  function addFavorite(item) {
    if (!item || !isFinite(Number(item.lat)) || !isFinite(Number(item.lon))) {
      throw new Error('Favori invalide : lat/lon requis');
    }
    var kind = FAVORITE_KINDS[item.kind] ? item.kind : 'favorite';
    var list = listFavorites();
    var entry = {
      id: item.id || uid('fav'),
      name: item.name != null ? String(item.name) : 'Sans nom',
      lat: Number(item.lat),
      lon: Number(item.lon),
      kind: kind
    };
    // Un seul home / depot
    if (kind === 'home' || kind === 'depot') {
      list = list.filter(function (f) { return f.kind !== kind; });
    }
    list.push(entry);
    return saveFavorites(list), entry;
  }

  function removeFavorite(id) {
    var list = listFavorites().filter(function (f) { return f.id !== id; });
    saveFavorites(list);
    return list;
  }

  /** Ajoute un récent (max 10), dédoublonne par proximité ~50 m. */
  function addRecent(item) {
    var lat = Number(item && item.lat);
    var lon = Number(item && item.lon);
    if (!isFinite(lat) || !isFinite(lon)) {
      throw new Error('Récent invalide : lat/lon requis');
    }
    var list = listFavorites();
    var others = list.filter(function (f) {
      if (f.kind !== 'recent') return true;
      return haversineM(lat, lon, f.lat, f.lon) > 50;
    });
    var entry = {
      id: uid('recent'),
      name: item.name != null ? String(item.name) : 'Récent',
      lat: lat,
      lon: lon,
      kind: 'recent'
    };
    others.push(entry);
    var nonRecent = others.filter(function (f) { return f.kind !== 'recent'; });
    var recents = others.filter(function (f) { return f.kind === 'recent'; });
    if (recents.length > MAX_RECENTS) {
      recents = recents.slice(recents.length - MAX_RECENTS);
    }
    saveFavorites(nonRecent.concat(recents));
    return entry;
  }

  // ── Historique de trajets ─────────────────────────────────────────
  var MAX_TRIPS = 30;

  function listTripHistory() {
    var list = loadJSON(KEYS.tripHistory, []);
    return Array.isArray(list) ? list.slice() : [];
  }

  function saveTrip(trip) {
    if (!trip) throw new Error('Trajet requis');
    var entry = {
      id: trip.id || uid('trip'),
      date: trip.date || new Date().toISOString(),
      origin: trip.origin != null ? trip.origin : null,
      destination: trip.destination != null ? trip.destination : null,
      distanceKm: numOr(trip.distanceKm, 0),
      durationSec: numOr(trip.durationSec, 0)
    };
    if (Array.isArray(trip.points)) entry.points = trip.points;
    var list = listTripHistory();
    list.unshift(entry);
    if (list.length > MAX_TRIPS) list = list.slice(0, MAX_TRIPS);
    saveJSON(KEYS.tripHistory, list);
    return entry;
  }

  function clearTripHistory() {
    saveJSON(KEYS.tripHistory, []);
    return [];
  }

  // ── Alertes danger ────────────────────────────────────────────────
  var HAZARD_TYPES = { police: 1, danger: 1, accident: 1, fermeture: 1 };

  function listHazards() {
    var list = loadJSON(KEYS.hazards, []);
    return Array.isArray(list) ? list.slice() : [];
  }

  function addHazard(item) {
    if (!item || !isFinite(Number(item.lat)) || !isFinite(Number(item.lon))) {
      throw new Error('Alerte invalide : lat/lon requis');
    }
    var type = HAZARD_TYPES[item.type] ? item.type : 'danger';
    var entry = {
      id: item.id || uid('hazard'),
      type: type,
      lat: Number(item.lat),
      lon: Number(item.lon),
      note: item.note != null ? String(item.note) : '',
      createdAt: item.createdAt || new Date().toISOString()
    };
    var list = listHazards();
    list.unshift(entry);
    saveJSON(KEYS.hazards, list);
    return entry;
  }

  function removeHazard(id) {
    var list = listHazards().filter(function (h) { return h.id !== id; });
    saveJSON(KEYS.hazards, list);
    return list;
  }

  /** Alertes dans un rayon (mètres) autour de lat/lon. */
  function nearbyHazards(lat, lon, radiusM) {
    var r = isFinite(Number(radiusM)) ? Number(radiusM) : 500;
    var la = Number(lat);
    var lo = Number(lon);
    if (!isFinite(la) || !isFinite(lo)) return [];
    return listHazards().filter(function (h) {
      return haversineM(la, lo, h.lat, h.lon) <= r;
    });
  }

  // ── Trafic (estimation NA) ────────────────────────────────────────
  /**
   * Facteur de trafic 1.0–1.7 selon heure de pointe NA (lun–ven).
   * Matin 7–9, soir 16–19 ; week-end plus calme.
   */
  function estimateTrafficFactor(date) {
    var d = date instanceof Date ? date : new Date(date || Date.now());
    if (isNaN(d.getTime())) d = new Date();
    var day = d.getDay(); // 0=dim … 6=sam
    var h = d.getHours() + d.getMinutes() / 60;
    var weekend = day === 0 || day === 6;
    var factor = 1.0;

    if (weekend) {
      if (h >= 11 && h < 18) factor = 1.15;
      else if (h >= 18 && h < 21) factor = 1.1;
      else factor = 1.0;
    } else {
      // Pointe matin
      if (h >= 6.5 && h < 7) factor = 1.25;
      else if (h >= 7 && h < 8) factor = 1.55;
      else if (h >= 8 && h < 9) factor = 1.7;
      else if (h >= 9 && h < 10) factor = 1.35;
      // Journée
      else if (h >= 10 && h < 15) factor = 1.15;
      else if (h >= 15 && h < 16) factor = 1.3;
      // Pointe soir
      else if (h >= 16 && h < 17) factor = 1.55;
      else if (h >= 17 && h < 18.5) factor = 1.7;
      else if (h >= 18.5 && h < 19.5) factor = 1.45;
      else if (h >= 19.5 && h < 21) factor = 1.2;
      else factor = 1.05;
    }

    return Math.min(1.7, Math.max(1.0, Math.round(factor * 100) / 100));
  }

  function applyTrafficEta(baseSeconds, factor) {
    var base = Math.max(0, Number(baseSeconds) || 0);
    var f = Number(factor);
    if (!isFinite(f) || f < 1) f = 1;
    if (f > 1.7) f = 1.7;
    return Math.round(base * f);
  }

  // ── Partage ───────────────────────────────────────────────────────
  async function shareText(title, text, url) {
    var payload = {
      title: title != null ? String(title) : '',
      text: text != null ? String(text) : ''
    };
    if (url) payload.url = String(url);

    if (global.navigator && typeof navigator.share === 'function') {
      try {
        await navigator.share(payload);
        return { ok: true, method: 'share' };
      } catch (e) {
        if (e && e.name === 'AbortError') return { ok: false, method: 'share', aborted: true };
      }
    }
    var clip = [payload.title, payload.text, payload.url].filter(Boolean).join('\n');
    var copied = await copyText(clip);
    return { ok: copied, method: 'clipboard' };
  }

  async function copyText(text) {
    var str = text != null ? String(text) : '';
    try {
      if (global.navigator && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(str);
        return true;
      }
    } catch (e) { /* repli */ }
    try {
      var ta = document.createElement('textarea');
      ta.value = str;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return !!ok;
    } catch (e2) {
      return false;
    }
  }

  // ── Distance point → polyligne ────────────────────────────────────
  var R_EARTH = 6371000;

  function toRad(deg) {
    return deg * Math.PI / 180;
  }

  function haversineM(lat1, lon1, lat2, lon2) {
    var φ1 = toRad(lat1);
    var φ2 = toRad(lat2);
    var Δφ = toRad(lat2 - lat1);
    var Δλ = toRad(lon2 - lon1);
    var a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    return 2 * R_EARTH * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /** Projection approx. en mètres locaux autour d'une lat de référence. */
  function projectXY(lat, lon, lat0, lon0) {
    var x = toRad(lon - lon0) * Math.cos(toRad(lat0)) * R_EARTH;
    var y = toRad(lat - lat0) * R_EARTH;
    return { x: x, y: y };
  }

  function distPointSeg(px, py, ax, ay, bx, by) {
    var dx = bx - ax;
    var dy = by - ay;
    var len2 = dx * dx + dy * dy;
    if (len2 === 0) {
      var ex = px - ax;
      var ey = py - ay;
      return Math.sqrt(ex * ex + ey * ey);
    }
    var t = ((px - ax) * dx + (py - ay) * dy) / len2;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    var qx = ax + t * dx;
    var qy = ay + t * dy;
    var rx = px - qx;
    var ry = py - qy;
    return Math.sqrt(rx * rx + ry * ry);
  }

  /**
   * Distance minimale (m) d'un point à une polyligne [[lat,lon], …].
   * Projection locale haversine / équirectangulaire.
   */
  function minDistanceToPolyline(lat, lon, latlngs) {
    var la = Number(lat);
    var lo = Number(lon);
    if (!isFinite(la) || !isFinite(lo) || !Array.isArray(latlngs) || latlngs.length === 0) {
      return Infinity;
    }
    if (latlngs.length === 1) {
      var only = latlngs[0];
      return haversineM(la, lo, Number(only[0]), Number(only[1]));
    }
    var p = projectXY(la, lo, la, lo);
    var min = Infinity;
    for (var i = 0; i < latlngs.length - 1; i++) {
      var a = latlngs[i];
      var b = latlngs[i + 1];
      var A = projectXY(Number(a[0]), Number(a[1]), la, lo);
      var B = projectXY(Number(b[0]), Number(b[1]), la, lo);
      var d = distPointSeg(p.x, p.y, A.x, A.y, B.x, B.y);
      if (d < min) min = d;
    }
    return min;
  }

  // ── Hors-ligne ────────────────────────────────────────────────────
  function registerServiceWorker(path) {
    var swPath = path || './sw.js';
    if (!global.navigator || !('serviceWorker' in navigator)) {
      return Promise.resolve({ ok: false, reason: 'unsupported' });
    }
    return navigator.serviceWorker.register(swPath).then(function (reg) {
      return { ok: true, scope: reg.scope, registration: reg };
    }).catch(function (err) {
      return { ok: false, error: String(err && err.message || err) };
    });
  }

  // ── Notifications ─────────────────────────────────────────────────
  async function ensureNotificationPermission() {
    if (!global.Notification) return 'unsupported';
    if (Notification.permission === 'granted') return 'granted';
    if (Notification.permission === 'denied') return 'denied';
    try {
      return await Notification.requestPermission();
    } catch (e) {
      return Notification.permission || 'denied';
    }
  }

  function notify(title, body) {
    if (!global.Notification) return null;
    if (Notification.permission !== 'granted') return null;
    try {
      return new Notification(String(title || 'Position'), {
        body: body != null ? String(body) : '',
        icon: undefined
      });
    } catch (e) {
      return null;
    }
  }

  // ── POI Overpass ──────────────────────────────────────────────────
  /**
   * Construit une requête Overpass pour une bbox [south,west,north,east]
   * : stations-service, parking PL, aires, ponts-bascules.
   */
  function buildPoiOverpassQuery(bbox) {
    var b = normalizeBbox(bbox);
    if (!b) throw new Error('bbox invalide : [south,west,north,east]');
    var bb = b.south + ',' + b.west + ',' + b.north + ',' + b.east;
    return [
      '[out:json][timeout:25];',
      '(',
      '  node["amenity"="fuel"](' + bb + ');',
      '  way["amenity"="fuel"](' + bb + ');',
      '  node["amenity"="parking"]["hgv"="yes"](' + bb + ');',
      '  way["amenity"="parking"]["hgv"="yes"](' + bb + ');',
      '  node["amenity"="parking"]["parking"="truck"](' + bb + ');',
      '  way["amenity"="parking"]["parking"="truck"](' + bb + ');',
      '  node["highway"="rest_area"](' + bb + ');',
      '  way["highway"="rest_area"](' + bb + ');',
      '  node["highway"="services"](' + bb + ');',
      '  way["highway"="services"](' + bb + ');',
      '  node["amenity"="weighbridge"](' + bb + ');',
      '  way["amenity"="weighbridge"](' + bb + ');',
      '  node["man_made"="weighbridge"](' + bb + ');',
      '  way["man_made"="weighbridge"](' + bb + ');',
      ');',
      'out center tags;'
    ].join('\n');
  }

  function normalizeBbox(bbox) {
    if (!bbox) return null;
    var south, west, north, east;
    if (Array.isArray(bbox) && bbox.length >= 4) {
      south = Number(bbox[0]);
      west = Number(bbox[1]);
      north = Number(bbox[2]);
      east = Number(bbox[3]);
    } else if (typeof bbox === 'object') {
      south = Number(bbox.south != null ? bbox.south : bbox.s);
      west = Number(bbox.west != null ? bbox.west : bbox.w);
      north = Number(bbox.north != null ? bbox.north : bbox.n);
      east = Number(bbox.east != null ? bbox.east : bbox.e);
    } else {
      return null;
    }
    if (![south, west, north, east].every(isFinite)) return null;
    return { south: south, west: west, north: north, east: east };
  }

  function elementCoords(el) {
    if (!el) return null;
    if (isFinite(el.lat) && isFinite(el.lon)) return { lat: el.lat, lon: el.lon };
    if (el.center && isFinite(el.center.lat) && isFinite(el.center.lon)) {
      return { lat: el.center.lat, lon: el.center.lon };
    }
    return null;
  }

  function categorizePoiElement(el) {
    var tags = (el && el.tags) || {};
    if (tags.amenity === 'fuel') return 'fuel';
    if (tags.amenity === 'weighbridge' || tags.man_made === 'weighbridge') return 'weigh';
    if (tags.highway === 'rest_area' || tags.highway === 'services') return 'rest';
    if (tags.amenity === 'parking' && (tags.hgv === 'yes' || tags.parking === 'truck' || tags.hgv === 'designated')) {
      return 'parking';
    }
    if (tags.amenity === 'parking') return 'parking';
    return null;
  }

  /** Parse une réponse Overpass → { fuel, parking, rest, weigh }. */
  function parsePoiOverpassResponse(data) {
    var out = { fuel: [], parking: [], rest: [], weigh: [] };
    var elements = (data && data.elements) || [];
    for (var i = 0; i < elements.length; i++) {
      var el = elements[i];
      var cat = categorizePoiElement(el);
      if (!cat || !out[cat]) continue;
      var coords = elementCoords(el);
      if (!coords) continue;
      var tags = el.tags || {};
      out[cat].push({
        id: el.type + '/' + el.id,
        osmType: el.type,
        osmId: el.id,
        lat: coords.lat,
        lon: coords.lon,
        name: tags.name || tags.operator || tags.brand || '',
        tags: tags,
        category: cat
      });
    }
    return out;
  }

  // ── Export public ─────────────────────────────────────────────────
  var NavPro = {
    KEYS: KEYS,
    loadJSON: loadJSON,
    saveJSON: saveJSON,

    VEHICLE_PRESETS: VEHICLE_PRESETS,
    getVehiclePresets: getVehiclePresets,
    getActiveVehicleProfile: getActiveVehicleProfile,
    setActiveVehicleProfile: setActiveVehicleProfile,

    getRouteOptions: getRouteOptions,
    setRouteOptions: setRouteOptions,

    listFavorites: listFavorites,
    addFavorite: addFavorite,
    removeFavorite: removeFavorite,
    addRecent: addRecent,

    listTripHistory: listTripHistory,
    saveTrip: saveTrip,
    clearTripHistory: clearTripHistory,

    listHazards: listHazards,
    addHazard: addHazard,
    removeHazard: removeHazard,
    nearbyHazards: nearbyHazards,

    estimateTrafficFactor: estimateTrafficFactor,
    applyTrafficEta: applyTrafficEta,

    shareText: shareText,
    copyText: copyText,

    haversineM: haversineM,
    minDistanceToPolyline: minDistanceToPolyline,

    registerServiceWorker: registerServiceWorker,

    ensureNotificationPermission: ensureNotificationPermission,
    notify: notify,

    buildPoiOverpassQuery: buildPoiOverpassQuery,
    parsePoiOverpassResponse: parsePoiOverpassResponse,
    categorizePoiElement: categorizePoiElement
  };

  // Alias pratique pour nearby
  NavPro.nearby = nearbyHazards;

  global.NavPro = NavPro;
})(typeof window !== 'undefined' ? window : this);
