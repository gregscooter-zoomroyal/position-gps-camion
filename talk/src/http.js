import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { erreur } from './erreurs.js';

const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

function envoyer(res, code, data) {
  const corps = JSON.stringify(data);
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(corps);
}

function poserJeton(res, jeton) {
  res.setHeader('Set-Cookie', `talk_session=${jeton}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`);
}

function effacerJeton(res) {
  res.setHeader('Set-Cookie', 'talk_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
}

function lireCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

async function lireJson(req) {
  const chunks = [];
  let taille = 0;
  for await (const chunk of req) {
    taille += chunk.length;
    if (taille > 65536) throw erreur(413, 'Envoi trop lourd.');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw erreur(400, 'Le message n’est pas du JSON.');
  }
}

function sessionDe(req, base) {
  return base.utilisateurParJeton(lireCookies(req.headers.cookie || '').talk_session || '');
}

function exiger(req, base) {
  const utilisateur = sessionDe(req, base);
  if (!utilisateur) throw erreur(401, 'Il faut se connecter.');
  return utilisateur;
}

function servirFichier(res, pathname) {
  let relatif = pathname === '/' ? 'index.html' : pathname.slice(1);
  try { relatif = decodeURIComponent(relatif); } catch { relatif = ''; }
  if (relatif.includes('\0')) {
    res.writeHead(400); res.end(); return;
  }
  const cible = path.resolve(publicDir, relatif);
  const dansPublic = cible === publicDir || cible.startsWith(publicDir + path.sep);
  if (!dansPublic) {
    res.writeHead(403); res.end(); return;
  }
  let fichier = cible;
  let existe = false;
  try { existe = existsSync(fichier) && statSync(fichier).isFile(); } catch { existe = false; }
  if (!existe) {
    if (path.extname(pathname)) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Introuvable');
      return;
    }
    fichier = path.join(publicDir, 'index.html');
  }
  const ext = path.extname(fichier);
  res.writeHead(200, {
    'content-type': TYPES[ext] || 'application/octet-stream',
    'cache-control': 'no-cache',
    'x-content-type-options': 'nosniff',
  });
  createReadStream(fichier).pipe(res);
}

async function api(req, res, contexte, pathname) {
  const { base, temps } = contexte;
  const m = pathname.split('/').filter(Boolean);

  if (m[1] === 'sante' && m.length === 2) {
    if (req.method !== 'GET') throw erreur(405, 'Méthode refusée.');
    envoyer(res, 200, { ok: true, nom: 'Talk' });
    return;
  }

  if (m[1] === 'inscription' && m.length === 2) {
    if (req.method !== 'POST') throw erreur(405, 'Méthode refusée.');
    const body = await lireJson(req);
    const utilisateur = base.inscrire({ identifiant: body.identifiant, nom: body.nom, mot: body.motDePasse });
    poserJeton(res, base.creerSession(utilisateur.id));
    envoyer(res, 201, utilisateur);
    return;
  }

  if (m[1] === 'connexion' && m.length === 2) {
    if (req.method !== 'POST') throw erreur(405, 'Méthode refusée.');
    const body = await lireJson(req);
    const utilisateur = base.authentifier(body.identifiant, body.motDePasse);
    poserJeton(res, base.creerSession(utilisateur.id));
    envoyer(res, 200, utilisateur);
    return;
  }

  if (m[1] === 'sortie' && m.length === 2) {
    if (req.method !== 'POST') throw erreur(405, 'Méthode refusée.');
    const utilisateur = sessionDe(req, base);
    if (utilisateur) {
      for (const eclat of base.eclatsTenusPar(utilisateur.id)) temps.finirEclat(eclat.id);
      base.cloturerSession(lireCookies(req.headers.cookie || '').talk_session || '');
    }
    effacerJeton(res);
    envoyer(res, 200, { ok: true });
    return;
  }

  if (m[1] === 'moi' && m.length === 2) {
    if (req.method !== 'GET') throw erreur(405, 'Méthode refusée.');
    const utilisateur = exiger(req, base);
    envoyer(res, 200, utilisateur);
    return;
  }

  if (m[1] === 'bassin' && m.length === 2) {
    if (req.method !== 'GET') throw erreur(405, 'Méthode refusée.');
    const utilisateur = exiger(req, base);
    envoyer(res, 200, base.bassin(utilisateur.id));
    return;
  }

  if (m[1] === 'cales' && m.length === 2 && req.method === 'POST') {
    const utilisateur = exiger(req, base);
    const body = await lireJson(req);
    const cale = base.creerCale({ nom: body.nom, resume: body.resume, userId: utilisateur.id });
    envoyer(res, 201, cale);
    return;
  }

  if (m[1] === 'amarres' && m.length === 2 && req.method === 'POST') {
    const utilisateur = exiger(req, base);
    const body = await lireJson(req);
    const cale = base.rejoindre(body.amarre, utilisateur.id);
    temps.rafraichirRoles(cale.id, cale.membres);
    envoyer(res, 200, cale);
    return;
  }

  if (m[1] === 'cales' && m.length === 3 && req.method === 'GET') {
    const utilisateur = exiger(req, base);
    envoyer(res, 200, base.lireCale(m[2], utilisateur.id));
    return;
  }

  if (m[1] === 'cales' && m[3] === 'courants' && m.length === 4 && req.method === 'POST') {
    const utilisateur = exiger(req, base);
    const body = await lireJson(req);
    const courant = base.ajouterCourant(m[2], utilisateur.id, body.nom);
    temps.diffuserCale(m[2], { type: 'courant', caleId: m[2], courant });
    envoyer(res, 201, courant);
    return;
  }

  if (m[1] === 'cales' && m[3] === 'membres' && m.length === 5 && req.method === 'POST') {
    const utilisateur = exiger(req, base);
    const body = await lireJson(req);
    const membres = base.changerRole(m[2], utilisateur.id, m[4], body.role);
    temps.rafraichirRoles(m[2], membres);
    envoyer(res, 200, membres);
    return;
  }

  if (m[1] === 'cales' && m[3] === 'membres' && m.length === 5 && req.method === 'DELETE') {
    const utilisateur = exiger(req, base);
    const prep = base.preparerRetrait(m[2], utilisateur.id, m[4]);
    base.supprimerMembre(m[2], m[4]);
    temps.expulser(m[4], m[2]);
    if (prep.eclatId) temps.finirEclat(prep.eclatId);
    const membres = base.membresDe(m[2]);
    temps.rafraichirRoles(m[2], membres);
    envoyer(res, 200, { ok: true });
    return;
  }

  if (m[1] === 'cales' && m[3] === 'eclat' && m.length === 4 && req.method === 'POST') {
    const utilisateur = exiger(req, base);
    const id = base.creerEclat(m[2], utilisateur.id);
    if (!temps.lierDiffuseur(id, utilisateur.id, m[2])) {
      base.eteindre(id);
      throw erreur(409, 'Ouvrez le groupe avant de lancer un direct.');
    }
    const eclat = base.formeEclat(base.eclatParId(id));
    temps.annoncerEclat(eclat);
    envoyer(res, 201, eclat);
    return;
  }

  if (m[1] === 'courants' && m[3] === 'lignes' && m.length === 4 && req.method === 'GET') {
    const utilisateur = exiger(req, base);
    envoyer(res, 200, base.listerLignes(m[2], utilisateur.id));
    return;
  }

  if (m[1] === 'courants' && m[3] === 'lignes' && m.length === 4 && req.method === 'POST') {
    const utilisateur = exiger(req, base);
    const body = await lireJson(req);
    const resultat = base.poserLigne(m[2], utilisateur.id, body.corps);
    temps.diffuserCale(resultat.caleId, { type: 'ligne', ligne: resultat.publique });
    envoyer(res, 201, resultat.publique);
    return;
  }

  if (m[1] === 'lignes' && m.length === 3 && req.method === 'DELETE') {
    const utilisateur = exiger(req, base);
    const ligne = base.rayerLigne(m[2], utilisateur.id);
    temps.diffuserCale(ligne.caleId, { type: 'ligne-rayee', ligneId: ligne.id, courantId: ligne.courantId });
    envoyer(res, 200, { ok: true });
    return;
  }

  if (m[1] === 'eclats' && m[3] === 'eteindre' && m.length === 4 && req.method === 'POST') {
    const utilisateur = exiger(req, base);
    const eclat = base.eclatParId(m[2]);
    base.peutEteindre(eclat, utilisateur.id);
    temps.finirEclat(m[2]);
    envoyer(res, 200, { ok: true });
    return;
  }

  if (m[1] === 'eclats' && m[3] === 'houle' && m.length === 4 && req.method === 'GET') {
    const utilisateur = exiger(req, base);
    envoyer(res, 200, base.listerHoule(m[2], utilisateur.id));
    return;
  }

  if (m[1] === 'eclats' && m[3] === 'houle' && m.length === 4 && req.method === 'POST') {
    const utilisateur = exiger(req, base);
    const body = await lireJson(req);
    const resultat = base.poserHoule(m[2], utilisateur.id, body.corps);
    temps.diffuserCale(resultat.caleId, { type: 'houle', ligne: resultat.publique });
    envoyer(res, 201, resultat.publique);
    return;
  }

  if (m[1] === 'houle' && m.length === 3 && req.method === 'DELETE') {
    const utilisateur = exiger(req, base);
    const ligne = base.rayerHoule(m[2], utilisateur.id);
    temps.diffuserCale(ligne.caleId, { type: 'houle-rayee', ligneId: ligne.id, eclatId: ligne.eclatId });
    envoyer(res, 200, { ok: true });
    return;
  }

  if (m[1] === 'amis' && m.length === 2 && req.method === 'GET') {
    const utilisateur = exiger(req, base);
    envoyer(res, 200, base.listerAmis(utilisateur.id));
    return;
  }

  if (m[1] === 'amis' && m.length === 2 && req.method === 'POST') {
    const utilisateur = exiger(req, base);
    const body = await lireJson(req);
    const ami = base.ajouterAmi(utilisateur.id, body.identifiant);
    envoyer(res, 201, ami);
    return;
  }

  if (m[1] === 'amis' && m[3] === 'messages' && m.length === 4 && req.method === 'GET') {
    const utilisateur = exiger(req, base);
    envoyer(res, 200, base.listerPrives(utilisateur.id, m[2]));
    return;
  }

  if (m[1] === 'amis' && m[3] === 'messages' && m.length === 4 && req.method === 'POST') {
    const utilisateur = exiger(req, base);
    const body = await lireJson(req);
    const message = base.poserPrive(utilisateur.id, m[2], body.corps);
    temps.diffuserUtilisateur(message.deId, { type: 'prive', message });
    temps.diffuserUtilisateur(message.versId, { type: 'prive', message });
    envoyer(res, 201, message);
    return;
  }

  throw erreur(404, 'Adresse inconnue.');
}

export function creerHttp(contexte) {
  return createServer((req, res) => {
    const travail = (async () => {
      const url = new URL(req.url, 'http://talk.local');
      if (url.pathname.startsWith('/api/')) {
        await api(req, res, contexte, url.pathname);
        return;
      }
      if (url.pathname === '/temps-reel') {
        envoyer(res, 426, { erreur: 'Cette adresse attend un lien temps réel.' });
        return;
      }
      servirFichier(res, url.pathname);
    })();
    travail.catch((err) => {
      if (res.headersSent) return;
      const status = err.status || 500;
      if (status >= 500) console.error(err);
      envoyer(res, status, { erreur: status >= 500 ? 'Incident inattendu.' : err.message });
    });
  });
}
