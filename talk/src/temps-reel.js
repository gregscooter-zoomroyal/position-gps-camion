import { WebSocketServer, WebSocket } from 'ws';

const GRACE_MS = 12000;

function lireJeton(req) {
  const brut = req.headers.cookie || '';
  for (const part of brut.split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    if (part.slice(0, i).trim() === 'talk_session') return decodeURIComponent(part.slice(i + 1).trim());
  }
  return '';
}

export function brancherTempsReel(server, contexte) {
  const { base } = contexte;
  const wss = new WebSocketServer({ noServer: true });
  const clients = new Map();
  const diffuseur = new Map();
  const places = new Map();
  const graces = new Map();
  let arrete = false;

  function envoyer(ws, message) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try { ws.send(JSON.stringify(message)); } catch { /* lien déjà fermé */ }
  }

  function diffuserMembres(caleId, message) {
    const ids = new Set(base.membresDe(caleId).map((m) => m.id));
    for (const [ws, info] of clients) {
      if (ids.has(info.user.id)) envoyer(ws, message);
    }
  }

  function presents(caleId) {
    const vus = new Map();
    for (const info of clients.values()) {
      if (info.caleId === caleId) {
        vus.set(info.user.id, { id: info.user.id, nom: info.user.nom, role: info.role });
      }
    }
    return [...vus.values()].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  }

  function diffuserPresence(caleId) {
    if (!caleId) return;
    const message = { type: 'quai', caleId, presents: presents(caleId) };
    for (const [ws, info] of clients) {
      if (info.caleId === caleId) envoyer(ws, message);
    }
  }

  function diffuserCale(caleId, message) {
    for (const [ws, info] of clients) {
      if (info.caleId === caleId) envoyer(ws, message);
    }
  }

  function annoncerEclat(eclat) {
    if (!eclat) return;
    diffuserMembres(eclat.caleId, { type: 'eclat', caleId: eclat.caleId, eclat });
  }

  function finirEclat(eclatId) {
    const timer = graces.get(eclatId);
    if (timer) clearTimeout(timer);
    graces.delete(eclatId);
    const row = base.eteindre(eclatId);
    const connu = row || base.eclatParId(eclatId);
    diffuseur.delete(eclatId);
    places.delete(eclatId);
    for (const info of clients.values()) {
      if (info.eclatAssis === eclatId) info.eclatAssis = null;
    }
    if (connu?.cale_id) diffuserMembres(connu.cale_id, { type: 'eclat', caleId: connu.cale_id, eclat: null });
    return row;
  }

  function programmerFin(eclatId, ws) {
    const ancien = graces.get(eclatId);
    if (ancien) clearTimeout(ancien);
    const timer = setTimeout(() => {
      graces.delete(eclatId);
      if (diffuseur.get(eclatId) === ws) finirEclat(eclatId);
    }, GRACE_MS);
    timer.unref();
    graces.set(eclatId, timer);
  }

  function lierDiffuseur(eclatId, userId, caleId) {
    let choisi = null;
    for (const [ws, info] of clients) {
      if (info.user.id === userId && info.caleId === caleId && ws.readyState === WebSocket.OPEN) choisi = ws;
    }
    if (!choisi) return false;
    diffuseur.set(eclatId, choisi);
    return true;
  }

  function nombreAssis(eclatId) {
    return places.get(eclatId)?.size || 0;
  }

  function diffuserAssis(eclatId, caleId) {
    diffuserCale(caleId, { type: 'assis', eclatId, nombre: nombreAssis(eclatId) });
  }

  function retirerPlace(info) {
    const eclatId = info.eclatAssis;
    if (!eclatId) return;
    info.eclatAssis = null;
    const map = places.get(eclatId);
    if (map) map.delete(info.user.id);
    const eclat = base.eclatParId(eclatId);
    const diff = diffuseur.get(eclatId);
    if (diff) envoyer(diff, { type: 'spectateur-parti', eclatId, spectateurId: info.user.id });
    if (eclat && !eclat.eteint_le) diffuserAssis(eclatId, eclat.cale_id);
  }

  function expulser(userId, caleId) {
    for (const [ws, info] of clients) {
      if (info.user.id !== userId) continue;
      retirerPlace(info);
      if (info.caleId === caleId) info.caleId = null;
      envoyer(ws, { type: 'retire', caleId });
    }
    diffuserPresence(caleId);
  }

  function rafraichirRoles(caleId, membres) {
    const parId = new Map(membres.map((m) => [m.id, m.role]));
    for (const info of clients.values()) {
      if (info.caleId === caleId && parId.has(info.user.id)) info.role = parId.get(info.user.id);
    }
    diffuserPresence(caleId);
    diffuserCale(caleId, { type: 'membres', caleId, membres });
  }

  function chargeValide(charge) {
    if (!charge || typeof charge !== 'object') return false;
    if (charge.kind === 'offre' || charge.kind === 'reponse') {
      return typeof charge.sdp === 'string' && charge.sdp.length > 0 && charge.sdp.length < 20000;
    }
    if (charge.kind === 'glace') return charge.candidate && typeof charge.candidate === 'object';
    return false;
  }

  function relayer(info, msg) {
    if (!info.caleId || typeof msg.eclatId !== 'string' || typeof msg.pour !== 'string') return;
    if (!chargeValide(msg.charge)) return;
    const eclat = base.eclatActif(info.caleId);
    if (!eclat || eclat.id !== msg.eclatId) return;
    if (info.user.id === eclat.auteur_id) {
      const place = places.get(eclat.id)?.get(msg.pour);
      if (!place) return;
      envoyer(place, { type: 'signal', eclatId: eclat.id, de: info.user.id, charge: msg.charge });
      return;
    }
    if (info.eclatAssis === eclat.id && msg.pour === eclat.auteur_id) {
      envoyer(diffuseur.get(eclat.id), { type: 'signal', eclatId: eclat.id, de: info.user.id, charge: msg.charge });
    }
  }

  function accueillir(ws, utilisateur) {
    const info = { user: utilisateur, caleId: null, role: null, eclatAssis: null };
    clients.set(ws, info);

    ws.on('message', (data, isBinary) => {
      if (isBinary || arrete) return;
      const texte = data.toString();
      if (texte.length > 32000) return;
      let msg;
      try { msg = JSON.parse(texte); } catch { return; }
      if (!msg || typeof msg !== 'object') return;
      try {
        traiter(msg);
      } catch {
        envoyer(ws, { type: 'erreur', message: 'Message ignoré.' });
      }
    });

    function traiter(msg) {

      if (msg.type === 'entrer' && typeof msg.caleId === 'string') {
        const m = base.membre(msg.caleId, info.user.id);
        if (!m) {
          envoyer(ws, { type: 'erreur', message: 'Cale inaccessible.' });
          return;
        }
        const avant = info.caleId;
        info.caleId = msg.caleId;
        info.role = m.role;
        if (avant && avant !== msg.caleId) diffuserPresence(avant);
        diffuserPresence(msg.caleId);
        const eclat = base.formeEclat(base.eclatActif(msg.caleId));
        envoyer(ws, { type: 'eclat', caleId: msg.caleId, eclat });
        if (eclat) envoyer(ws, { type: 'assis', eclatId: eclat.id, nombre: nombreAssis(eclat.id) });
        return;
      }

      if (msg.type === 'sortir-cale') {
        const avant = info.caleId;
        retirerPlace(info);
        info.caleId = null;
        if (avant) diffuserPresence(avant);
        return;
      }

      if (msg.type === 'tenir' && typeof msg.eclatId === 'string') {
        const eclat = base.eclatParId(msg.eclatId);
        if (!eclat || eclat.eteint_le || eclat.auteur_id !== info.user.id) return;
        diffuseur.set(eclat.id, ws);
        const timer = graces.get(eclat.id);
        if (timer) {
          clearTimeout(timer);
          graces.delete(eclat.id);
        }
        return;
      }

      if (msg.type === 'asseoir' && typeof msg.eclatId === 'string') {
        const eclat = base.eclatParId(msg.eclatId);
        if (!eclat || eclat.eteint_le) return;
        if (!base.membre(eclat.cale_id, info.user.id)) return;
        if (eclat.auteur_id === info.user.id) return;
        let map = places.get(eclat.id);
        if (!map) {
          map = new Map();
          places.set(eclat.id, map);
        }
        map.set(info.user.id, ws);
        info.eclatAssis = eclat.id;
        info.caleId = eclat.cale_id;
        envoyer(diffuseur.get(eclat.id), {
          type: 'spectateur',
          eclatId: eclat.id,
          spectateurId: info.user.id,
          spectateurNom: info.user.nom,
        });
        diffuserAssis(eclat.id, eclat.cale_id);
        return;
      }

      if (msg.type === 'quitter-eclat') {
        retirerPlace(info);
        return;
      }

      if (msg.type === 'signal') relayer(info, msg);
    }

    ws.on('close', () => {
      clients.delete(ws);
      if (arrete) return;
      retirerPlace(info);
      for (const [eclatId, sock] of diffuseur) {
        if (sock === ws) programmerFin(eclatId, ws);
      }
      if (info.caleId) diffuserPresence(info.caleId);
    });
  }

  server.on('upgrade', (req, socket, head) => {
    let pathname = '';
    try { pathname = new URL(req.url, 'http://talk.local').pathname; } catch { pathname = ''; }
    if (pathname !== '/temps-reel') {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const utilisateur = base.utilisateurParJeton(lireJeton(req));
      if (!utilisateur) {
        ws.close(4401, 'session');
        return;
      }
      accueillir(ws, utilisateur);
    });
  });

  function arreter() {
    arrete = true;
    for (const timer of graces.values()) clearTimeout(timer);
    graces.clear();
    for (const ws of wss.clients) {
      try { ws.terminate(); } catch { /* déjà parti */ }
    }
    wss.close();
  }

  return {
    diffuserCale,
    diffuserMembres,
    annoncerEclat,
    lierDiffuseur,
    finirEclat,
    expulser,
    rafraichirRoles,
    arreter,
  };
}
