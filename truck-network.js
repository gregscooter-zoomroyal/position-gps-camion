/**
 * Réseaux camion officiels CA / US / MX
 * Sources :
 * - Québec MTQ « Réseau de camionnage » (WFS aq_camion)
 * - USA USDOT/BTS National Network (ArcGIS FeatureServer)
 * - Mexique : INEGI RNC / API ruteo (lien + fallback OSM)
 * - OSM tags hgv=* en complément
 */
(function (global) {
  'use strict';

  var QC_WFS = 'https://ws.mapserver.transports.gouv.qc.ca/swtq';
  var US_NN =
    'https://services.arcgis.com/xOi1kZaI0eWDREZv/ArcGIS/rest/services/NTAD_National_Network/FeatureServer/0/query';

  /** Classes MTQ (codeclasse). */
  var QC_CLASS = {
    '0': { id: 'na', label: 'Non applicable', role: 'ignore' },
    '1': { id: 'transit', label: 'Transit (permis)', role: 'allowed' },
    '2': { id: 'restreint', label: 'Restreint', role: 'caution' },
    '3': { id: 'interdit_livraison', label: 'Interdit (sauf livraison locale)', role: 'forbidden' },
    '4': { id: 'non_classe', label: 'Non classifié', role: 'unknown' },
    '6': { id: 'interdit_total', label: 'Interdit en tout temps', role: 'forbidden' },
    '9': { id: 'partiel', label: 'Partiellement interdit', role: 'caution' }
  };

  var SOURCES = [
    {
      country: 'CA-QC',
      name: 'Réseau de camionnage du Québec (MTQ)',
      map: 'https://geoegl.msp.gouv.qc.ca/igo2/apercu-qc/?context=mtq&zoom=8&center=-73.2485,46.34845&visiblelayers=bgr_mtq_annotation,pes_v_limtn_charg,aq_camion,carte_gouv_qc&invisiblelayers=*&sidenav=1&tool=mapLegend',
      data: 'https://www.donneesquebec.ca/recherche/dataset/reseau-camionnage',
      note: 'Interdit / transit / restreint — signalisation prioritaire'
    },
    {
      country: 'CA-QC',
      name: 'Québec 511 — Camionnage',
      map: 'https://quebec511.gouv.qc.ca/fr/Carte/Default.aspx',
      data: null,
      note: 'Accès interdit, limitations de poids, lits d’arrêt'
    },
    {
      country: 'US',
      name: 'USDOT National Network (NTAD)',
      map: 'https://data-usdot.opendata.arcgis.com/datasets/usdot::national-network',
      data: US_NN,
      note: 'Réseau national autorisé aux combinaisons conventionnelles (23 CFR 658)'
    },
    {
      country: 'CA/US/MX',
      name: 'Quartiers industriels (OpenStreetMap)',
      map: 'https://www.openstreetmap.org/',
      data: 'https://wiki.openstreetmap.org/wiki/Tag:landuse%3Dindustrial',
      note: 'Zones industrielles = camion permis (affichées en vert)'
    },
    {
      country: 'MX',
      name: 'INEGI Red Nacional de Caminos + API de Ruteo',
      map: 'https://www.inegi.org.mx/app/mapa/espacioydatos/',
      data: 'https://www.inegi.org.mx/servicios/Ruteo/Default.html',
      note: 'Réseau officiel MX ; API ruteo avec type de véhicule (clé requise)'
    }
  ];

  function bboxString(b) {
    // lon,lat,lon,lat for MapServer WFS 1.1
    return [b.west, b.south, b.east, b.north].join(',');
  }

  function expandBbox(b, padDeg) {
    var p = padDeg == null ? 0.05 : padDeg;
    return {
      south: b.south - p,
      west: b.west - p,
      north: b.north + p,
      east: b.east + p
    };
  }

  function bboxFromPoints(points, padDeg) {
    var south = 90, north = -90, west = 180, east = -180;
    (points || []).forEach(function (pt) {
      if (!pt || !isFinite(pt[0]) || !isFinite(pt[1])) return;
      south = Math.min(south, pt[0]);
      north = Math.max(north, pt[0]);
      west = Math.min(west, pt[1]);
      east = Math.max(east, pt[1]);
    });
    if (south > north) return null;
    return expandBbox({ south: south, west: west, north: north, east: east }, padDeg);
  }

  function midOfLine(coords) {
    if (!coords || !coords.length) return null;
    var flat = [];
    if (typeof coords[0][0] === 'number') flat = coords;
    else {
      coords.forEach(function (part) {
        if (Array.isArray(part)) flat = flat.concat(part);
      });
    }
    if (!flat.length) return null;
    var mid = flat[Math.floor(flat.length / 2)];
    return { lon: mid[0], lat: mid[1] };
  }

  function squarePolygon(lon, lat, halfDeg) {
    var h = halfDeg || 0.0009; // ~100 m
    return [
      [lon - h, lat - h],
      [lon + h, lat - h],
      [lon + h, lat + h],
      [lon - h, lat + h],
      [lon - h, lat - h]
    ];
  }

  async function fetchJson(url) {
    var res = await fetch(url, { headers: { Accept: 'application/json, application/geo+json' } });
    if (!res.ok) throw new Error('réseau camion HTTP ' + res.status);
    return res.json();
  }

  /** Québec : segments officiels dans une bbox (payload allégé). */
  async function fetchQuebecTruckNetwork(bbox, maxFeatures, opts) {
    var options = opts || {};
    var b = bbox;
    // Pour les rouges : plus de features + moins de champs (filtre client, MapServer ignore CQL)
    var limit = maxFeatures || (options.forbiddenOnly ? 1000 : 700);
    var props = options.forbiddenOnly
      ? 'geometry,codeclasse,descclasse,gaodoreclg,gamunnom,norte'
      : 'geometry,codeclasse,descclasse,gaodoreclg,gamunnom,norte';
    var params = new URLSearchParams({
      service: 'WFS',
      version: '1.1.0',
      request: 'GetFeature',
      typeName: 'ms:aq_camion',
      outputFormat: 'geojson',
      srsName: 'EPSG:4326',
      maxFeatures: String(limit),
      bbox: bboxString(b),
      propertyName: props
    });
    var data = await fetchJson(QC_WFS + '?' + params.toString());
    var features = (data && data.features) || [];
    var mapped = features.map(function (f) {
      var p = f.properties || {};
      var code = String(p.codeclasse != null ? p.codeclasse : '');
      var meta = QC_CLASS[code] || { id: 'unknown', label: p.descclasse || 'Inconnu', role: 'unknown' };
      return {
        source: 'CA-QC',
        code: code,
        role: meta.role,
        label: meta.label,
        name: p.gaodoreclg || p.norte || '',
        city: p.gamunnom || '',
        geometry: f.geometry,
        properties: p
      };
    });
    if (options.forbiddenOnly) {
      return mapped.filter(function (x) { return x.role === 'forbidden'; });
    }
    return mapped;
  }

  /** USA : National Network (routes PL fédérales) dans une bbox. */
  async function fetchUSNationalNetwork(bbox, maxFeatures) {
    var b = bbox;
    var params = new URLSearchParams({
      where: '1=1',
      outFields: 'SIGN1,LNAME,NN,FCLASS',
      f: 'geojson',
      resultRecordCount: String(maxFeatures || 400),
      geometry: [b.west, b.south, b.east, b.north].join(','),
      geometryType: 'esriGeometryEnvelope',
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects'
    });
    var data = await fetchJson(US_NN + '?' + params.toString());
    return ((data && data.features) || []).map(function (f) {
      var p = f.properties || {};
      return {
        source: 'US',
        code: 'NN',
        role: 'allowed',
        label: 'National Network',
        name: p.SIGN1 || p.LNAME || '',
        city: '',
        geometry: f.geometry,
        properties: p
      };
    });
  }

  function likelyInQuebec(bbox) {
    return bbox.west < -57 && bbox.east > -80 && bbox.south < 63 && bbox.north > 44.5 &&
      bbox.west > -80 && bbox.east < -56;
  }

  function likelyInUSA(bbox) {
    return bbox.south < 49.5 && bbox.north > 24 && bbox.west < -66 && bbox.east > -125;
  }

  function likelyInMexico(bbox) {
    return bbox.south < 33 && bbox.north > 14 && bbox.west < -86 && bbox.east > -118;
  }

  /** Centre clairement au Québec (évite double fetch US inutile). */
  function centeredInQuebec(bbox) {
    var lat = (bbox.south + bbox.north) / 2;
    var lon = (bbox.west + bbox.east) / 2;
    return lat >= 45.0 && lon <= -71.0 && lon >= -79.5;
  }

  var OVERPASS_URLS = [
    'https://overpass-api.de/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter'
  ];

  function pointInLonLatRing(lat, lon, ring) {
    var inside = false;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var xi = ring[i][0];
      var yi = ring[i][1];
      var xj = ring[j][0];
      var yj = ring[j][1];
      var intersect = ((yi > lat) !== (yj > lat)) &&
        (lon < (xj - xi) * (lat - yi) / ((yj - yi) || 1e-12) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function pointInIndustrialPolygons(lat, lon, polygons) {
    if (!polygons || !polygons.length || !isFinite(lat) || !isFinite(lon)) return false;
    for (var i = 0; i < polygons.length; i++) {
      var rings = polygons[i];
      if (!rings || !rings.length) continue;
      if (pointInLonLatRing(lat, lon, rings[0])) return true;
    }
    return false;
  }

  async function overpassJson(query) {
    var lastErr = null;
    for (var i = 0; i < OVERPASS_URLS.length; i++) {
      try {
        var res = await fetch(OVERPASS_URLS[i], {
          method: 'POST',
          body: 'data=' + encodeURIComponent(query)
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return await res.json();
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error('Overpass indisponible');
  }

  /**
   * Zones industrielles OSM (CA / US / MX) : routes à l'intérieur = camion permis (vert).
   */
  async function fetchIndustrialTruckNetwork(bbox, maxFeatures) {
    var bb = [bbox.south, bbox.west, bbox.north, bbox.east].join(',');
    var query =
      '[out:json][timeout:22];' +
      '(' +
      '  way["landuse"="industrial"](' + bb + ');' +
      '  relation["landuse"="industrial"](' + bb + ');' +
      '  way["landuse"="warehouse"](' + bb + ');' +
      '  way["industrial"~"^(park|warehouse|factory|yes)$"](' + bb + ');' +
      ')->.ind;' +
      '(' +
      '  way["highway"](area.ind);' +
      '  way["highway"]["abutters"="industrial"](' + bb + ');' +
      '  way["highway"]["zone:traffic"="industrial"](' + bb + ');' +
      '  way["landuse"="industrial"](' + bb + ');' +
      ');' +
      'out geom;';
    var data = await overpassJson(query);
    var elements = (data && data.elements) || [];
    var limit = maxFeatures || 500;
    var segments = [];
    var polygons = [];
    var seen = {};

    elements.forEach(function (el) {
      if (!el || el.type !== 'way' || !el.geometry || el.geometry.length < 2) return;
      var tags = el.tags || {};
      var coords = el.geometry.map(function (g) { return [g.lon, g.lat]; });
      var isArea = tags.landuse === 'industrial' || tags.landuse === 'warehouse' || !!tags.industrial;
      var closed = coords.length >= 4 &&
        coords[0][0] === coords[coords.length - 1][0] &&
        coords[0][1] === coords[coords.length - 1][1];

      if (isArea && closed) {
        polygons.push([coords]);
        var keyPoly = 'poly-' + el.id;
        if (!seen[keyPoly] && segments.length < limit) {
          seen[keyPoly] = 1;
          segments.push({
            source: 'INDUSTRIAL',
            code: 'IND',
            role: 'allowed',
            label: 'Zone industrielle (camion permis)',
            name: tags.name || 'Quartier industriel',
            city: '',
            geometry: { type: 'LineString', coordinates: coords },
            properties: tags
          });
        }
      }

      if (tags.highway) {
        var key = 'hw-' + el.id;
        if (seen[key] || segments.length >= limit) return;
        seen[key] = 1;
        segments.push({
          source: 'INDUSTRIAL',
          code: 'IND',
          role: 'allowed',
          label: 'Zone industrielle (camion permis)',
          name: tags.name || tags.ref || 'Accès industriel',
          city: '',
          geometry: { type: 'LineString', coordinates: coords },
          properties: tags
        });
      }
    });

    return { segments: segments, polygons: polygons };
  }

  /** Recasse en vert les no-truck officiels situés dans un quartier industriel. */
  function promoteIndustrialAccess(segments, polygons) {
    if (!polygons || !polygons.length) return segments || [];
    return (segments || []).map(function (seg) {
      if (!seg || seg.role !== 'forbidden') return seg;
      var g = seg.geometry;
      if (!g) return seg;
      var parts = g.type === 'MultiLineString' ? g.coordinates
        : g.type === 'LineString' ? [g.coordinates] : null;
      if (!parts) return seg;
      var mid = midOfLine(parts);
      if (!mid || !pointInIndustrialPolygons(mid.lat, mid.lon, polygons)) return seg;
      return Object.assign({}, seg, {
        role: 'allowed',
        label: 'Zone industrielle (camion permis)',
        code: 'IND',
        source: (seg.source || '') + '+INDUSTRIAL'
      });
    });
  }

  /**
   * Charge les couches pertinentes pour une bbox.
   * options.forbiddenOnly → priorise les no-truck rouges (plus rapide).
   * options.skipUS → ne charge pas le National Network US.
   * options.skipIndustrial → saute Overpass industriel.
   */
  async function fetchNetworksForBbox(bbox, options) {
    var opts = options || {};
    var tasks = [];
    var labels = [];
    if (likelyInQuebec(bbox)) {
      tasks.push(fetchQuebecTruckNetwork(bbox, opts.maxFeatures || 700, { forbiddenOnly: !!opts.forbiddenOnly }));
      labels.push('CA-QC');
    }
    if (likelyInUSA(bbox) && !opts.skipUS && !centeredInQuebec(bbox) && !opts.forbiddenOnly) {
      tasks.push(fetchUSNationalNetwork(bbox, 300));
      labels.push('US');
    }
    // Zones industrielles CA/US/MX (vert = permis camion)
    if (!opts.forbiddenOnly && !opts.skipIndustrial) {
      tasks.push(fetchIndustrialTruckNetwork(bbox, opts.industrialMax || 500));
      labels.push('INDUSTRIAL');
    }

    var settled = await Promise.allSettled(tasks);
    var all = [];
    var sourcesUsed = [];
    var industrialPolygons = [];

    settled.forEach(function (r, i) {
      if (r.status !== 'fulfilled') return;
      var label = labels[i];
      if (label === 'INDUSTRIAL') {
        var pack = r.value || { segments: [], polygons: [] };
        industrialPolygons = pack.polygons || [];
        all = all.concat(pack.segments || []);
        if ((pack.segments || []).length) sourcesUsed.push('INDUSTRIAL');
      } else {
        all = all.concat(r.value || []);
        sourcesUsed.push(label);
      }
    });

    all = promoteIndustrialAccess(all, industrialPolygons);

    return {
      all: all,
      allowed: all.filter(function (x) { return x.role === 'allowed'; }),
      forbidden: all.filter(function (x) { return x.role === 'forbidden'; }),
      caution: all.filter(function (x) { return x.role === 'caution'; }),
      sourcesUsed: sourcesUsed,
      industrialPolygons: industrialPolygons
    };
  }

  function haversineM(lat1, lon1, lat2, lon2) {
    var R = 6371000;
    var toRad = function (d) { return d * Math.PI / 180; };
    var dLat = toRad(lat2 - lat1);
    var dLon = toRad(lon2 - lon1);
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function estimateRingCircumferenceM(ring) {
    var sum = 0;
    for (var i = 0; i < ring.length - 1; i++) {
      sum += haversineM(ring[i][1], ring[i][0], ring[i + 1][1], ring[i + 1][0]);
    }
    return sum;
  }

  function featureLineParts(geometry) {
    if (!geometry) return [];
    if (geometry.type === 'LineString') return [geometry.coordinates];
    if (geometry.type === 'MultiLineString') return geometry.coordinates;
    return [];
  }

  function densifyLatLonLine(lonLatParts, stepM) {
    var step = stepM || 30;
    var out = [];
    (lonLatParts || []).forEach(function (part) {
      if (!part || part.length < 2) return;
      for (var i = 0; i < part.length - 1; i++) {
        var a = part[i];
        var b = part[i + 1];
        var lat1 = a[1];
        var lon1 = a[0];
        var lat2 = b[1];
        var lon2 = b[0];
        out.push({ lat: lat1, lon: lon1 });
        var d = haversineM(lat1, lon1, lat2, lon2);
        var n = Math.max(1, Math.floor(d / step));
        for (var k = 1; k < n; k++) {
          var t = k / n;
          out.push({
            lat: lat1 + (lat2 - lat1) * t,
            lon: lon1 + (lon2 - lon1) * t
          });
        }
      }
      var last = part[part.length - 1];
      out.push({ lat: last[1], lon: last[0] });
    });
    return out;
  }

  function nearAny(lat, lon, points, maxM) {
    if (!points || !points.length) return false;
    for (var i = 0; i < points.length; i++) {
      var p = points[i];
      var plat = Array.isArray(p) ? p[0] : p.lat;
      var plon = Array.isArray(p) ? p[1] : p.lon;
      if (haversineM(lat, lon, plat, plon) <= maxM) return true;
    }
    return false;
  }

  /**
   * Segments no-truck que l'itinéraire SUIT (pas seulement croise).
   * Ignore une zone souple autour du départ / arrivée (sortie / entrée obligatoire).
   */
  function findFollowedForbidden(forbiddenFeatures, routeCoords, opts) {
    var options = opts || {};
    var softM = options.softM == null ? 200 : options.softM;
    var minHits = options.minHits || 3;
    var matchM = options.matchM || 20;
    var ignoreNear = options.ignoreNearPoints || [];
    var industrialPolygons = options.industrialPolygons || [];
    var samples = [];
    var route = routeCoords || [];
    var step = Math.max(1, Math.floor(route.length / 120));
    for (var i = 0; i < route.length; i += step) samples.push(route[i]);
    if (route.length) samples.push(route[route.length - 1]);

    var followed = [];
    (forbiddenFeatures || []).forEach(function (f) {
      if (!f || f.role !== 'forbidden') return;
      var parts = featureLineParts(f.geometry);
      if (!parts.length) return;
      var mid = midOfLine(parts);
      // Quartier industriel = accès camion permis → ne pas traiter comme no-truck
      if (mid && pointInIndustrialPolygons(mid.lat, mid.lon, industrialPolygons)) return;
      var dens = densifyLatLonLine(parts, 25);
      var hits = 0;
      var nearPts = [];
      for (var s = 0; s < samples.length; s++) {
        var pt = samples[s];
        if (nearAny(pt[0], pt[1], ignoreNear, softM)) continue;
        if (pointInIndustrialPolygons(pt[0], pt[1], industrialPolygons)) continue;
        for (var d = 0; d < dens.length; d++) {
          if (haversineM(pt[0], pt[1], dens[d].lat, dens[d].lon) <= matchM) {
            hits += 1;
            nearPts.push(dens[d]);
            break;
          }
        }
      }
      if (hits >= minHits) {
        followed.push({
          feature: f,
          hits: hits,
          name: f.name || f.label || '',
          nearPts: nearPts
        });
      }
    });
    followed.sort(function (a, b) { return b.hits - a.hits; });
    return followed;
  }

  /**
   * Construit des polygones d'exclusion Valhalla à partir des segments interdits.
   * Priorise interdit total (6). Cap circonférence totale < 90 km (limite Valhalla ~100 km).
   *
   * options:
   * - routeCoords: ne cible que le voisinage du tracé
   * - onlyTotalBan: ignore « interdit sauf livraison »
   * - ignoreNearPoints: [[lat,lon],…] zone souple départ/arrivée
   * - softM: rayon zone souple (défaut 200 m)
   * - densify: place plusieurs carrés le long du segment suivi (défaut true si routeCoords)
   * - existing: polygones déjà accumulés (itérations)
   */
  function buildExcludePolygons(forbiddenFeatures, maxPolys, routeCoords, onlyTotalBan, options) {
    var opts = options || {};
    if (typeof onlyTotalBan === 'object' && onlyTotalBan && !options) {
      opts = onlyTotalBan;
      onlyTotalBan = !!opts.onlyTotalBan;
    }
    var limit = maxPolys || 45;
    var maxCirc = opts.maxCirc || 88000;
    var softM = opts.softM == null ? 200 : opts.softM;
    var ignoreNear = opts.ignoreNearPoints || [];
    var densify = opts.densify != null ? !!opts.densify : !!(routeCoords && routeCoords.length);
    var halfDefault = opts.halfDeg || 0.0012;
    var industrialPolygons = opts.industrialPolygons || [];

    var polys = (opts.existing || []).slice();
    var seen = {};
    var totalCirc = 0;
    polys.forEach(function (poly) {
      if (!poly || !poly.length) return;
      var lat = (poly[0][1] + poly[2][1]) / 2;
      var lon = (poly[0][0] + poly[2][0]) / 2;
      seen[lat.toFixed(4) + ',' + lon.toFixed(4)] = 1;
      totalCirc += estimateRingCircumferenceM(poly);
    });

    var samples = null;
    if (routeCoords && routeCoords.length) {
      samples = [];
      for (var i = 0; i < routeCoords.length; i += Math.max(1, Math.floor(routeCoords.length / 100))) {
        samples.push(routeCoords[i]);
      }
      samples.push(routeCoords[routeCoords.length - 1]);
    }

    function tryAdd(lat, lon, half) {
      if (nearAny(lat, lon, ignoreNear, softM)) return false;
      var key = lat.toFixed(4) + ',' + lon.toFixed(4);
      if (seen[key]) return false;
      if (samples) {
        var nearRoute = false;
        for (var s = 0; s < samples.length; s++) {
          if (haversineM(samples[s][0], samples[s][1], lat, lon) < 55) {
            nearRoute = true;
            break;
          }
        }
        if (!nearRoute) return false;
      }
      var poly = squarePolygon(lon, lat, half);
      var circ = estimateRingCircumferenceM(poly);
      if (totalCirc + circ > maxCirc || polys.length >= limit) return false;
      seen[key] = 1;
      totalCirc += circ;
      polys.push(poly);
      return true;
    }

    // Mode ciblé : segments réellement suivis par le tracé
    if (densify && routeCoords && routeCoords.length) {
      var followed = findFollowedForbidden(forbiddenFeatures, routeCoords, {
        softM: softM,
        ignoreNearPoints: ignoreNear,
        minHits: opts.minHits || 3,
        matchM: opts.matchM || 20,
        industrialPolygons: industrialPolygons
      });
      for (var fi = 0; fi < followed.length && polys.length < limit; fi++) {
        var seg = followed[fi];
        var last = null;
        var half = (seg.feature && seg.feature.code === '6') ? halfDefault * 1.1 : halfDefault;
        for (var pi = 0; pi < seg.nearPts.length; pi++) {
          var p = seg.nearPts[pi];
          if (last && haversineM(p.lat, p.lon, last.lat, last.lon) < 55) continue;
          if (tryAdd(p.lat, p.lon, half)) last = p;
          if (polys.length >= limit) break;
        }
      }
      return polys;
    }

    // Mode legacy : un carré au milieu de chaque segment interdit proche
    var ranked = (forbiddenFeatures || []).slice().filter(function (f) {
      if (onlyTotalBan) return f.code === '6';
      return f.role === 'forbidden';
    }).sort(function (a, b) {
      var wa = a.code === '6' ? 3 : 1;
      var wb = b.code === '6' ? 3 : 1;
      return wb - wa;
    });

    for (var i = 0; i < ranked.length && polys.length < limit; i++) {
      var f = ranked[i];
      var parts = featureLineParts(f.geometry);
      if (!parts.length) continue;
      var mid = midOfLine(parts);
      if (!mid) continue;
      tryAdd(mid.lat, mid.lon, f.code === '6' ? 0.0009 : 0.0007);
    }
    return polys;
  }

  /** Estimation grossière du pays d'un point (CA / US / MX / other). */
  function guessCountry(lat, lon) {
    if (!isFinite(lat) || !isFinite(lon)) return 'other';
    // Mexique
    if (lat < 32.6 && lat > 14.5 && lon < -86.5 && lon > -117.5) return 'MX';
    // Alaska
    if (lat > 51 && lon < -130) return 'US';
    // Frontière CA/US approximative (sud du Canada)
    if (lat >= 41 && lat <= 49.5 && lon <= -67 && lon >= -125) {
      // Sous ~45.0 entre Ontario/Québec/Maritimes → souvent US (NY/VT/NH/ME)
      if (lat < 45.0 && lon > -76.5 && lon < -66.8) return 'US';
      if (lat < 44.5 && lon <= -76.5 && lon > -83) return 'US';
      // Contiguous US below 49th except already handled
      if (lat < 49.0 && lon < -95) {
        // prairie border ~49
        if (lat < 48.95) return 'US';
      }
      if (lat < 49.0 && lon >= -95 && lon <= -66) {
        // east of prairies: Canada if north of ~45 east of Detroit-ish, with exceptions
        if (lon > -82 && lat >= 41.7 && lat < 43.5) return 'US'; // lower MI/NY etc rough
        if (lat >= 45.0) return 'CA';
        if (lat >= 42.9 && lon < -78.5 && lon > -83.5) return 'CA'; // tip of Ontario
        if (lat < 45.0) return 'US';
      }
      return lat >= 45.0 ? 'CA' : 'US';
    }
    if (lat > 49 && lon < -52 && lon > -141) return 'CA';
    if (lat > 24 && lat < 49.5 && lon < -66 && lon > -125) return 'US';
    return 'other';
  }

  function tripCrossesIntoCountry(trip, countryCode) {
    var hit = false;
    (trip.legs || []).forEach(function (leg) {
      (leg.maneuvers || []).forEach(function (m) {
        var names = ((m.street_names || []).join(' '));
        if (countryCode === 'US' && /\b(NY |VT |NH |ME |PA |US |I-|Interstate|State Route|New York|Vermont|New Hampshire|Maine)\b/i.test(names)) hit = true;
        if (countryCode === 'MX' && /\b(México|Mexico|MEX-)\b/i.test(names)) hit = true;
        if (countryCode === 'CA' && /\b(QC |ON |Autoroute|Trans-Canada|Highway 401|A-15|A-20)\b/i.test(names)) hit = true;
      });
    });
    return hit;
  }

  /** Échantillonne un tracé [lat,lon]… pour détecter une sortie du pays d'origine. */
  function routeLeavesCountry(routeCoords, homeCountry) {
    if (!routeCoords || !routeCoords.length || !homeCountry || homeCountry === 'other') return false;
    var foreign = 0;
    var step = Math.max(1, Math.floor(routeCoords.length / 50));
    for (var i = 0; i < routeCoords.length; i += step) {
      var c = guessCountry(routeCoords[i][0], routeCoords[i][1]);
      if (c !== 'other' && c !== homeCountry) foreign += 1;
    }
    return foreign >= 3;
  }

  function pointCountriesSame(a, b) {
    if (!a || !b) return false;
    var ca = guessCountry(a[0], a[1]);
    var cb = guessCountry(b[0], b[1]);
    return ca !== 'other' && ca === cb;
  }

  function styleForRole(role) {
    if (role === 'allowed') return { color: '#4ADE80', weight: 4, opacity: 0.75 };
    if (role === 'forbidden') return { color: '#FF3B3B', weight: 5, opacity: 0.9 };
    if (role === 'caution') return { color: '#FFB238', weight: 4, opacity: 0.8 };
    return { color: '#6B7A87', weight: 2, opacity: 0.45 };
  }

  global.TruckNetwork = {
    QC_CLASS: QC_CLASS,
    SOURCES: SOURCES,
    bboxFromPoints: bboxFromPoints,
    expandBbox: expandBbox,
    fetchQuebecTruckNetwork: fetchQuebecTruckNetwork,
    fetchUSNationalNetwork: fetchUSNationalNetwork,
    fetchIndustrialTruckNetwork: fetchIndustrialTruckNetwork,
    fetchNetworksForBbox: fetchNetworksForBbox,
    buildExcludePolygons: buildExcludePolygons,
    findFollowedForbidden: findFollowedForbidden,
    pointInIndustrialPolygons: pointInIndustrialPolygons,
    styleForRole: styleForRole,
    likelyInQuebec: likelyInQuebec,
    likelyInUSA: likelyInUSA,
    likelyInMexico: likelyInMexico,
    centeredInQuebec: centeredInQuebec,
    guessCountry: guessCountry,
    tripCrossesIntoCountry: tripCrossesIntoCountry,
    routeLeavesCountry: routeLeavesCountry,
    pointCountriesSame: pointCountriesSame
  };
})(typeof window !== 'undefined' ? window : this);
