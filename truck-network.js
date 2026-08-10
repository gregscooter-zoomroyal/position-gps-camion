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

  /** Québec : segments officiels dans une bbox. */
  async function fetchQuebecTruckNetwork(bbox, maxFeatures) {
    var b = bbox;
    var params = new URLSearchParams({
      service: 'WFS',
      version: '1.1.0',
      request: 'GetFeature',
      typeName: 'ms:aq_camion',
      outputFormat: 'geojson',
      srsName: 'EPSG:4326',
      maxFeatures: String(maxFeatures || 1500),
      bbox: bboxString(b)
    });
    var data = await fetchJson(QC_WFS + '?' + params.toString());
    var features = (data && data.features) || [];
    return features.map(function (f) {
      var p = f.properties || {};
      var code = String(p.codeclasse != null ? p.codeclasse : '');
      var meta = QC_CLASS[code] || { id: 'unknown', label: p.descclasse || 'Inconnu', role: 'unknown' };
      return {
        source: 'CA-QC',
        code: code,
        role: meta.role,
        label: meta.label,
        name: p.gaodoreclg || p.norte || p.gaodospeci || '',
        city: p.gamunnom || p.drmunnom || '',
        geometry: f.geometry,
        properties: p
      };
    });
  }

  /** USA : National Network (routes PL fédérales) dans une bbox. */
  async function fetchUSNationalNetwork(bbox, maxFeatures) {
    var b = bbox;
    var params = new URLSearchParams({
      where: '1=1',
      outFields: 'SIGN1,SIGNT1,SIGNN1,LNAME,NN,FCLASS,STFIPS',
      f: 'geojson',
      resultRecordCount: String(maxFeatures || 2000),
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
    // Rough Quebec envelope
    return bbox.west < -57 && bbox.east > -80 && bbox.south < 63 && bbox.north > 44.5 &&
      bbox.west > -80 && bbox.east < -56;
  }

  function likelyInUSA(bbox) {
    return bbox.south < 49.5 && bbox.north > 24 && bbox.west < -66 && bbox.east > -125;
  }

  function likelyInMexico(bbox) {
    return bbox.south < 33 && bbox.north > 14 && bbox.west < -86 && bbox.east > -118;
  }

  /**
   * Charge les couches pertinentes pour une bbox (itinéraire / vue carte).
   * Retourne { allowed, forbidden, caution, all, sourcesUsed }
   */
  async function fetchNetworksForBbox(bbox) {
    var tasks = [];
    var labels = [];
    if (likelyInQuebec(bbox)) {
      tasks.push(fetchQuebecTruckNetwork(bbox));
      labels.push('CA-QC');
    }
    if (likelyInUSA(bbox)) {
      tasks.push(fetchUSNationalNetwork(bbox));
      labels.push('US');
    }
    var settled = await Promise.allSettled(tasks);
    var all = [];
    var sourcesUsed = [];
    settled.forEach(function (r, i) {
      if (r.status === 'fulfilled') {
        all = all.concat(r.value);
        sourcesUsed.push(labels[i]);
      }
    });
    return {
      all: all,
      allowed: all.filter(function (x) { return x.role === 'allowed'; }),
      forbidden: all.filter(function (x) { return x.role === 'forbidden'; }),
      caution: all.filter(function (x) { return x.role === 'caution'; }),
      sourcesUsed: sourcesUsed
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

  /**
   * Construit des polygones d'exclusion Valhalla à partir des segments interdits.
   * Priorise interdit total (6). Cap circonférence totale < 90 km (limite Valhalla ~100 km).
   * Si routeCoords est fourni, ne garde que les no-truck proches du tracé.
   * onlyTotalBan: si true, ignore « interdit sauf livraison » (évite de murer Montréal).
   */
  function buildExcludePolygons(forbiddenFeatures, maxPolys, routeCoords, onlyTotalBan) {
    var limit = maxPolys || 40;
    var maxCirc = 90000;
    var ranked = (forbiddenFeatures || []).slice().filter(function (f) {
      if (onlyTotalBan) return f.code === '6';
      return f.role === 'forbidden';
    }).sort(function (a, b) {
      var wa = a.code === '6' ? 3 : 1;
      var wb = b.code === '6' ? 3 : 1;
      return wb - wa;
    });

    var samples = null;
    if (routeCoords && routeCoords.length) {
      samples = [];
      for (var i = 0; i < routeCoords.length; i += Math.max(1, Math.floor(routeCoords.length / 80))) {
        samples.push(routeCoords[i]);
      }
      samples.push(routeCoords[routeCoords.length - 1]);
    }

    var polys = [];
    var seen = {};
    var totalCirc = 0;
    for (var i = 0; i < ranked.length && polys.length < limit; i++) {
      var f = ranked[i];
      var g = f.geometry;
      if (!g) continue;
      var coords = g.type === 'MultiLineString' ? g.coordinates : g.type === 'LineString' ? [g.coordinates] : null;
      if (!coords) continue;
      var mid = midOfLine(coords);
      if (!mid) continue;

      if (samples) {
        var near = false;
        for (var s = 0; s < samples.length; s++) {
          if (haversineM(samples[s][0], samples[s][1], mid.lat, mid.lon) < 90) {
            near = true;
            break;
          }
        }
        if (!near) continue;
      }

      var key = mid.lat.toFixed(4) + ',' + mid.lon.toFixed(4);
      if (seen[key]) continue;
      seen[key] = 1;
      var half = f.code === '6' ? 0.0009 : 0.0007;
      var poly = squarePolygon(mid.lon, mid.lat, half);
      var circ = estimateRingCircumferenceM(poly);
      if (totalCirc + circ > maxCirc) break;
      totalCirc += circ;
      polys.push(poly);
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
        if (countryCode === 'US' && /\b(NY |VT |NH |ME |PA |US |I-|Interstate|State Route)/.test(names)) hit = true;
        if (countryCode === 'MX' && /\b(México|Mexico|MEX-)\b/i.test(names)) hit = true;
      });
    });
    return hit;
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
    fetchNetworksForBbox: fetchNetworksForBbox,
    buildExcludePolygons: buildExcludePolygons,
    styleForRole: styleForRole,
    likelyInQuebec: likelyInQuebec,
    likelyInUSA: likelyInUSA,
    likelyInMexico: likelyInMexico,
    guessCountry: guessCountry,
    tripCrossesIntoCountry: tripCrossesIntoCountry,
    pointCountriesSame: pointCountriesSame
  };
})(typeof window !== 'undefined' ? window : this);
