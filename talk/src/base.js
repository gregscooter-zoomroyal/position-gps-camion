import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { erreur } from './erreurs.js';

const ici = path.dirname(fileURLToPath(import.meta.url));
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const DUREE_SESSION = 30 * 24 * 3600 * 1000;

export function cheminParDefaut() {
  return process.env.TALK_DB || path.join(ici, '..', 'data', 'talk.sqlite');
}

function saler(mot) {
  const sel = randomBytes(16);
  const hash = scryptSync(mot, sel, 32);
  return { sel: sel.toString('hex'), hash: hash.toString('hex') };
}

function verifierMot(mot, selHex, hashHex) {
  const calc = scryptSync(mot, Buffer.from(selHex, 'hex'), 32);
  const attendu = Buffer.from(hashHex, 'hex');
  if (calc.length !== attendu.length) return false;
  return timingSafeEqual(calc, attendu);
}

function exigerChaine(v, min, max, phrase) {
  if (typeof v !== 'string') throw erreur(400, phrase);
  const t = v.trim();
  if (t.length < min || t.length > max) throw erreur(400, phrase);
  return t;
}

function identifiantPropre(v) {
  const phrase = 'L’identifiant doit faire 3 à 20 caractères : lettres minuscules, chiffres, tirets.';
  if (typeof v !== 'string') throw erreur(400, phrase);
  const t = v.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,18}[a-z0-9]$/.test(t)) throw erreur(400, phrase);
  return t;
}

function nomVisible(v) {
  const t = exigerChaine(v, 2, 40, 'Le nom visible doit faire entre 2 et 40 caractères.');
  if (/[\u0000-\u001f]/.test(t)) throw erreur(400, 'Le nom visible contient un caractère interdit.');
  return t;
}

function motDePasse(v) {
  if (typeof v !== 'string' || v.length < 8 || v.length > 80) {
    throw erreur(400, 'Le mot de passe doit contenir entre 8 et 80 caractères.');
  }
  return v;
}

function corpsPropre(v) {
  if (typeof v !== 'string') throw erreur(400, 'Le message est vide.');
  const t = v.trim();
  if (!t) throw erreur(400, 'Le message est vide.');
  if (t.length > 1000) throw erreur(400, 'Le message dépasse 1000 caractères.');
  if (t.includes('\0')) throw erreur(400, 'Le message contient un caractère interdit.');
  return t;
}

function utilisateurPublic(row) {
  return { id: row.id, identifiant: row.identifiant, nom: row.nom };
}

function lignePublique(row) {
  return {
    id: row.id,
    courantId: row.courantId,
    auteurId: row.auteurId,
    auteurNom: row.auteurNom,
    corps: row.corps,
    creeLe: row.creeLe,
  };
}

function houlePublique(row) {
  return {
    id: row.id,
    eclatId: row.eclatId,
    auteurId: row.auteurId,
    auteurNom: row.auteurNom,
    corps: row.corps,
    creeLe: row.creeLe,
  };
}

export function creerBase(dbPath = cheminParDefaut()) {
  if (dbPath !== ':memory:') mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON');
  if (dbPath !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      identifiant TEXT NOT NULL UNIQUE,
      nom TEXT NOT NULL,
      hash TEXT NOT NULL,
      sel TEXT NOT NULL,
      cree_le INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      jeton TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      cree_le INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cales (
      id TEXT PRIMARY KEY,
      nom TEXT NOT NULL,
      resume TEXT NOT NULL DEFAULT '',
      amarre TEXT NOT NULL UNIQUE,
      cree_le INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS membres (
      cale_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('lampiste', 'veilleur', 'passant')),
      joint_le INTEGER NOT NULL,
      PRIMARY KEY (cale_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS courants (
      id TEXT PRIMARY KEY,
      cale_id TEXT NOT NULL,
      nom TEXT NOT NULL,
      cree_le INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS lignes (
      id TEXT PRIMARY KEY,
      courant_id TEXT NOT NULL,
      auteur_id TEXT NOT NULL,
      corps TEXT NOT NULL,
      cree_le INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS eclats (
      id TEXT PRIMARY KEY,
      cale_id TEXT NOT NULL,
      auteur_id TEXT NOT NULL,
      allume_le INTEGER NOT NULL,
      eteint_le INTEGER
    );
    CREATE TABLE IF NOT EXISTS houle (
      id TEXT PRIMARY KEY,
      eclat_id TEXT NOT NULL,
      auteur_id TEXT NOT NULL,
      corps TEXT NOT NULL,
      cree_le INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_lignes_courant ON lignes(courant_id, cree_le);
    CREATE INDEX IF NOT EXISTS idx_houle_eclat ON houle(eclat_id, cree_le);
    CREATE INDEX IF NOT EXISTS idx_membres_user ON membres(user_id);
    CREATE INDEX IF NOT EXISTS idx_eclats_cale ON eclats(cale_id, eteint_le);
    CREATE TABLE IF NOT EXISTS amis (
      user_id TEXT NOT NULL,
      ami_id TEXT NOT NULL,
      cree_le INTEGER NOT NULL,
      PRIMARY KEY (user_id, ami_id)
    );
    CREATE TABLE IF NOT EXISTS prives (
      id TEXT PRIMARY KEY,
      de_id TEXT NOT NULL,
      vers_id TEXT NOT NULL,
      corps TEXT NOT NULL,
      cree_le INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_prives_pair ON prives(de_id, vers_id, cree_le);
  `);

  const bidon = saler('talk-bidon-mot-de-passe');

  function transaction(fn) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      db.exec('COMMIT');
      return result;
    } catch (e) {
      try { db.exec('ROLLBACK'); } catch { /* déjà annulé */ }
      throw e;
    }
  }

  function amarreLibre() {
    for (let essai = 0; essai < 8; essai += 1) {
      const octets = randomBytes(6);
      let code = '';
      for (let i = 0; i < 6; i += 1) code += ALPHA[octets[i] % ALPHA.length];
      const pris = db.prepare('SELECT 1 FROM cales WHERE amarre = ?').get(code);
      if (!pris) return code;
    }
    throw erreur(500, 'Impossible de créer un code d’invitation.');
  }

  function membre(caleId, userId) {
    return db.prepare('SELECT cale_id, user_id, role, joint_le FROM membres WHERE cale_id = ? AND user_id = ?').get(caleId, userId);
  }

  function membresDe(caleId) {
    const rows = db.prepare(`
      SELECT u.id, u.nom, u.identifiant, m.role
      FROM membres m JOIN users u ON u.id = m.user_id
      WHERE m.cale_id = ?
    `).all(caleId);
    const ordre = { lampiste: 0, veilleur: 1, passant: 2 };
    rows.sort((a, b) => ordre[a.role] - ordre[b.role] || a.nom.localeCompare(b.nom, 'fr'));
    return rows.map((m) => ({ id: m.id, nom: m.nom, identifiant: m.identifiant, role: m.role }));
  }

  function eclatActif(caleId) {
    return db.prepare('SELECT * FROM eclats WHERE cale_id = ? AND eteint_le IS NULL').get(caleId) || null;
  }

  function eclatParId(id) {
    return db.prepare('SELECT * FROM eclats WHERE id = ?').get(id) || null;
  }

  function formeEclat(eclat) {
    if (!eclat || eclat.eteint_le) return null;
    const auteur = db.prepare('SELECT nom FROM users WHERE id = ?').get(eclat.auteur_id);
    return {
      id: eclat.id,
      caleId: eclat.cale_id,
      auteurId: eclat.auteur_id,
      auteurNom: auteur?.nom || 'Inconnu',
      allumeLe: eclat.allume_le,
    };
  }

  function lireCourant(id) {
    return db.prepare('SELECT * FROM courants WHERE id = ?').get(id) || null;
  }

  function lireLigne(id) {
    return db.prepare(`
      SELECT l.id, l.courant_id AS courantId, l.auteur_id AS auteurId, l.corps, l.cree_le AS creeLe,
             u.nom AS auteurNom, c.cale_id AS caleId
      FROM lignes l
      JOIN users u ON u.id = l.auteur_id
      JOIN courants c ON c.id = l.courant_id
      WHERE l.id = ?
    `).get(id) || null;
  }

  function lireHoule(id) {
    return db.prepare(`
      SELECT h.id, h.eclat_id AS eclatId, h.auteur_id AS auteurId, h.corps, h.cree_le AS creeLe,
             u.nom AS auteurNom, e.cale_id AS caleId
      FROM houle h
      JOIN users u ON u.id = h.auteur_id
      JOIN eclats e ON e.id = h.eclat_id
      WHERE h.id = ?
    `).get(id) || null;
  }

  function exigerMembre(caleId, userId) {
    const m = membre(caleId, userId);
    if (!m) throw erreur(403, 'Vous n’êtes pas dans ce groupe.');
    return m;
  }

  return {
    fermer() {
      db.close();
    },

    inscrire({ identifiant, nom, mot }) {
      const idf = identifiantPropre(identifiant);
      const nomOk = nomVisible(nom);
      const secret = motDePasse(mot);
      if (db.prepare('SELECT 1 FROM users WHERE identifiant = ?').get(idf)) {
        throw erreur(409, 'Cet identifiant est déjà pris.');
      }
      const { sel, hash } = saler(secret);
      const id = randomUUID();
      db.prepare('INSERT INTO users (id, identifiant, nom, hash, sel, cree_le) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, idf, nomOk, hash, sel, Date.now());
      return { id, identifiant: idf, nom: nomOk };
    },

    authentifier(identifiant, mot) {
      if (typeof identifiant !== 'string' || typeof mot !== 'string') {
        throw erreur(401, 'Identifiant ou mot de passe incorrect.');
      }
      const idf = identifiant.trim().toLowerCase();
      const u = db.prepare('SELECT * FROM users WHERE identifiant = ?').get(idf);
      const bon = u ? verifierMot(mot, u.sel, u.hash) : false;
      if (!u) verifierMot(typeof mot === 'string' ? mot : '', bidon.sel, bidon.hash);
      if (!u || !bon) throw erreur(401, 'Identifiant ou mot de passe incorrect.');
      return utilisateurPublic(u);
    },

    creerSession(userId) {
      const jeton = randomBytes(32).toString('hex');
      db.prepare('INSERT INTO sessions (jeton, user_id, cree_le) VALUES (?, ?, ?)').run(jeton, userId, Date.now());
      return jeton;
    },

    cloturerSession(jeton) {
      if (jeton) db.prepare('DELETE FROM sessions WHERE jeton = ?').run(jeton);
    },

    utilisateurParJeton(jeton) {
      if (!jeton) return null;
      const row = db.prepare(`
        SELECT u.id, u.identifiant, u.nom, s.cree_le AS session_le
        FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.jeton = ?
      `).get(jeton);
      if (!row) return null;
      if (Date.now() - row.session_le > DUREE_SESSION) {
        db.prepare('DELETE FROM sessions WHERE jeton = ?').run(jeton);
        return null;
      }
      return utilisateurPublic(row);
    },

    bassin(userId) {
      return db.prepare(`
        SELECT c.id, c.nom, c.resume, m.role,
          (SELECT COUNT(*) FROM membres mm WHERE mm.cale_id = c.id) AS nombre,
          (SELECT COUNT(*) FROM eclats e WHERE e.cale_id = c.id AND e.eteint_le IS NULL) AS allume
        FROM membres m JOIN cales c ON c.id = m.cale_id
        WHERE m.user_id = ?
        ORDER BY m.joint_le DESC
      `).all(userId).map((r) => ({
        id: r.id,
        nom: r.nom,
        resume: r.resume,
        role: r.role,
        membres: r.nombre,
        eclat: r.allume > 0,
      }));
    },

    creerCale({ nom, resume, userId }) {
      const nomOk = exigerChaine(nom, 2, 48, 'Le nom du groupe doit faire entre 2 et 48 caractères.');
      let resumeOk = '';
      if (resume != null && resume !== '') {
        resumeOk = exigerChaine(resume, 0, 160, 'Le résumé dépasse 160 caractères.');
      }
      const id = transaction(() => {
        const caleId = randomUUID();
        const maintenant = Date.now();
        db.prepare('INSERT INTO cales (id, nom, resume, amarre, cree_le) VALUES (?, ?, ?, ?, ?)')
          .run(caleId, nomOk, resumeOk, amarreLibre(), maintenant);
        db.prepare('INSERT INTO membres (cale_id, user_id, role, joint_le) VALUES (?, ?, ?, ?)')
          .run(caleId, userId, 'lampiste', maintenant);
        db.prepare('INSERT INTO courants (id, cale_id, nom, cree_le) VALUES (?, ?, ?, ?)')
          .run(randomUUID(), caleId, 'Conversation', maintenant);
        return caleId;
      });
      return this.lireCale(id, userId);
    },

    rejoindre(code, userId) {
      if (typeof code !== 'string') throw erreur(400, 'Le code d’invitation manque.');
      const amarre = code.trim().toUpperCase().replace(/\s+/g, '');
      if (!/^[A-Z2-9]{6}$/.test(amarre)) throw erreur(400, 'Un code d’invitation compte 6 caractères.');
      const cale = db.prepare('SELECT id FROM cales WHERE amarre = ?').get(amarre);
      if (!cale) throw erreur(404, 'Aucun groupe pour ce code.');
      const deja = membre(cale.id, userId);
      if (!deja) {
        db.prepare('INSERT INTO membres (cale_id, user_id, role, joint_le) VALUES (?, ?, ?, ?)')
          .run(cale.id, userId, 'passant', Date.now());
      }
      return this.lireCale(cale.id, userId);
    },

    lireCale(caleId, userId) {
      const cale = db.prepare('SELECT * FROM cales WHERE id = ?').get(caleId);
      if (!cale) throw erreur(404, 'Groupe introuvable.');
      const moi = exigerMembre(caleId, userId);
      const courants = db.prepare('SELECT id, nom FROM courants WHERE cale_id = ? ORDER BY cree_le ASC').all(caleId);
      return {
        id: cale.id,
        nom: cale.nom,
        resume: cale.resume,
        amarre: cale.amarre,
        role: moi.role,
        membres: membresDe(caleId),
        courants: courants.map((c) => ({ id: c.id, nom: c.nom })),
        eclat: formeEclat(eclatActif(caleId)),
      };
    },

    ajouterCourant(caleId, userId, nom) {
      const m = exigerMembre(caleId, userId);
      if (m.role === 'passant') throw erreur(403, 'Un membre ne crée pas de conversation.');
      const nomOk = exigerChaine(nom, 2, 32, 'Le nom de la conversation doit faire entre 2 et 32 caractères.');
      const noms = db.prepare('SELECT nom FROM courants WHERE cale_id = ?').all(caleId);
      if (noms.some((n) => n.nom.toLocaleLowerCase('fr') === nomOk.toLocaleLowerCase('fr'))) {
        throw erreur(409, 'Cette conversation existe déjà.');
      }
      const id = randomUUID();
      db.prepare('INSERT INTO courants (id, cale_id, nom, cree_le) VALUES (?, ?, ?, ?)').run(id, caleId, nomOk, Date.now());
      return { id, nom: nomOk };
    },

    changerRole(caleId, acteurId, cibleId, role) {
      if (role !== 'veilleur' && role !== 'passant') throw erreur(400, 'Rôle inconnu.');
      const acteur = exigerMembre(caleId, acteurId);
      const cible = membre(caleId, cibleId);
      if (!cible) throw erreur(404, 'Membre introuvable.');
      if (acteur.role !== 'lampiste') throw erreur(403, 'Seul le propriétaire nomme les modérateurs.');
      if (cible.role === 'lampiste') throw erreur(403, 'Le propriétaire garde son rôle.');
      db.prepare('UPDATE membres SET role = ? WHERE cale_id = ? AND user_id = ?').run(role, caleId, cibleId);
      return membresDe(caleId);
    },

    preparerRetrait(caleId, acteurId, cibleId) {
      const acteur = exigerMembre(caleId, acteurId);
      const cible = membre(caleId, cibleId);
      if (!cible) throw erreur(404, 'Membre introuvable.');
      if (cible.role === 'lampiste') throw erreur(403, 'Le propriétaire ne peut pas être retiré.');
      if (acteurId === cibleId) throw erreur(403, 'Vous ne pouvez pas vous retirer ainsi.');
      if (acteur.role === 'passant') throw erreur(403, 'Vous ne pouvez pas retirer un membre.');
      if (acteur.role === 'veilleur' && cible.role !== 'passant') {
        throw erreur(403, 'Un modérateur ne retire qu’un membre.');
      }
      const eclat = eclatActif(caleId);
      return { eclatId: eclat && eclat.auteur_id === cibleId ? eclat.id : null };
    },

    supprimerMembre(caleId, userId) {
      db.prepare('DELETE FROM membres WHERE cale_id = ? AND user_id = ?').run(caleId, userId);
    },

    membre,
    membresDe,

    listerLignes(courantId, userId) {
      const courant = lireCourant(courantId);
      if (!courant) throw erreur(404, 'Conversation introuvable.');
      exigerMembre(courant.cale_id, userId);
      return db.prepare(`
        SELECT * FROM (
          SELECT l.id, l.courant_id AS courantId, l.auteur_id AS auteurId, l.corps, l.cree_le AS creeLe,
                 u.nom AS auteurNom
          FROM lignes l JOIN users u ON u.id = l.auteur_id
          WHERE l.courant_id = ?
          ORDER BY l.cree_le DESC
          LIMIT 200
        ) ORDER BY creeLe ASC
      `).all(courantId).map(lignePublique);
    },

    poserLigne(courantId, userId, corps) {
      const courant = lireCourant(courantId);
      if (!courant) throw erreur(404, 'Conversation introuvable.');
      exigerMembre(courant.cale_id, userId);
      const texte = corpsPropre(corps);
      const id = randomUUID();
      db.prepare('INSERT INTO lignes (id, courant_id, auteur_id, corps, cree_le) VALUES (?, ?, ?, ?, ?)')
        .run(id, courantId, userId, texte, Date.now());
      const ligne = lireLigne(id);
      return { publique: lignePublique(ligne), caleId: ligne.caleId };
    },

    rayerLigne(ligneId, userId) {
      const ligne = lireLigne(ligneId);
      if (!ligne) throw erreur(404, 'Message introuvable.');
      const m = exigerMembre(ligne.caleId, userId);
      const peut = ligne.auteurId === userId || m.role === 'lampiste' || m.role === 'veilleur';
      if (!peut) throw erreur(403, 'Vous ne pouvez pas supprimer ce message.');
      db.prepare('DELETE FROM lignes WHERE id = ?').run(ligneId);
      return ligne;
    },

    creerEclat(caleId, userId) {
      exigerMembre(caleId, userId);
      return transaction(() => {
        if (eclatActif(caleId)) throw erreur(409, 'Un direct est déjà lancé dans ce groupe.');
        const id = randomUUID();
        db.prepare('INSERT INTO eclats (id, cale_id, auteur_id, allume_le) VALUES (?, ?, ?, ?)')
          .run(id, caleId, userId, Date.now());
        return id;
      });
    },

    eteindre(id) {
      const row = db.prepare('SELECT * FROM eclats WHERE id = ? AND eteint_le IS NULL').get(id);
      if (!row) return null;
      db.prepare('UPDATE eclats SET eteint_le = ? WHERE id = ?').run(Date.now(), id);
      return row;
    },

    eclatActif,
    eclatParId,
    formeEclat,

    peutEteindre(eclat, userId) {
      if (!eclat || eclat.eteint_le) throw erreur(404, 'Aucun direct à arrêter.');
      const m = exigerMembre(eclat.cale_id, userId);
      if (eclat.auteur_id === userId) return m;
      if (m.role === 'passant') {
        throw erreur(403, 'Seul le modérateur, le propriétaire ou la personne qui tient le direct peut l’arrêter.');
      }
      return m;
    },

    listerHoule(eclatId, userId) {
      const eclat = eclatParId(eclatId);
      if (!eclat) throw erreur(404, 'Direct introuvable.');
      exigerMembre(eclat.cale_id, userId);
      return db.prepare(`
        SELECT * FROM (
          SELECT h.id, h.eclat_id AS eclatId, h.auteur_id AS auteurId, h.corps, h.cree_le AS creeLe,
                 u.nom AS auteurNom
          FROM houle h JOIN users u ON u.id = h.auteur_id
          WHERE h.eclat_id = ?
          ORDER BY h.cree_le DESC
          LIMIT 80
        ) ORDER BY creeLe ASC
      `).all(eclatId).map(houlePublique);
    },

    poserHoule(eclatId, userId, corps) {
      const eclat = eclatParId(eclatId);
      if (!eclat) throw erreur(404, 'Direct introuvable.');
      if (eclat.eteint_le) throw erreur(410, 'Ce direct est terminé.');
      exigerMembre(eclat.cale_id, userId);
      const texte = corpsPropre(corps);
      const id = randomUUID();
      db.prepare('INSERT INTO houle (id, eclat_id, auteur_id, corps, cree_le) VALUES (?, ?, ?, ?, ?)')
        .run(id, eclatId, userId, texte, Date.now());
      const ligne = lireHoule(id);
      return { publique: houlePublique(ligne), caleId: ligne.caleId };
    },

    rayerHoule(houleId, userId) {
      const ligne = lireHoule(houleId);
      if (!ligne) throw erreur(404, 'Message introuvable.');
      const m = exigerMembre(ligne.caleId, userId);
      const peut = ligne.auteurId === userId || m.role === 'lampiste' || m.role === 'veilleur';
      if (!peut) throw erreur(403, 'Vous ne pouvez pas supprimer ce message.');
      db.prepare('DELETE FROM houle WHERE id = ?').run(houleId);
      return ligne;
    },

    eclatsTenusPar(userId) {
      return db.prepare('SELECT id, cale_id FROM eclats WHERE auteur_id = ? AND eteint_le IS NULL').all(userId);
    },

    ajouterAmi(userId, identifiant) {
      const idOk = identifiantPropre(identifiant);
      const autre = db.prepare('SELECT id, identifiant, nom FROM users WHERE identifiant = ?').get(idOk);
      if (!autre) throw erreur(404, 'Aucune personne avec cet identifiant.');
      if (autre.id === userId) throw erreur(400, 'Vous ne pouvez pas vous ajouter.');
      transaction(() => {
        const deja = db.prepare('SELECT 1 FROM amis WHERE user_id = ? AND ami_id = ?').get(userId, autre.id);
        if (deja) return;
        const maintenant = Date.now();
        db.prepare('INSERT INTO amis (user_id, ami_id, cree_le) VALUES (?, ?, ?)').run(userId, autre.id, maintenant);
        db.prepare('INSERT INTO amis (user_id, ami_id, cree_le) VALUES (?, ?, ?)').run(autre.id, userId, maintenant);
      });
      return { id: autre.id, identifiant: autre.identifiant, nom: autre.nom };
    },

    listerAmis(userId) {
      const rows = db.prepare(`
        SELECT u.id, u.identifiant, u.nom
        FROM amis a JOIN users u ON u.id = a.ami_id
        WHERE a.user_id = ?
      `).all(userId);
      rows.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
      return rows;
    },

    sontAmis(userId, amiId) {
      return Boolean(db.prepare('SELECT 1 FROM amis WHERE user_id = ? AND ami_id = ?').get(userId, amiId));
    },

    listerPrives(userId, amiId) {
      if (!this.sontAmis(userId, amiId)) throw erreur(403, 'Cette personne n’est pas dans vos amis.');
      return db.prepare(`
        SELECT p.id, p.de_id AS deId, p.vers_id AS versId, p.corps, p.cree_le AS creeLe, u.nom AS auteurNom
        FROM prives p JOIN users u ON u.id = p.de_id
        WHERE (p.de_id = ? AND p.vers_id = ?) OR (p.de_id = ? AND p.vers_id = ?)
        ORDER BY p.cree_le ASC
      `).all(userId, amiId, amiId, userId);
    },

    poserPrive(userId, amiId, corps) {
      if (!this.sontAmis(userId, amiId)) throw erreur(403, 'Cette personne n’est pas dans vos amis.');
      const texte = corpsPropre(corps);
      const id = randomUUID();
      const creeLe = Date.now();
      db.prepare('INSERT INTO prives (id, de_id, vers_id, corps, cree_le) VALUES (?, ?, ?, ?, ?)').run(id, userId, amiId, texte, creeLe);
      const auteur = db.prepare('SELECT nom FROM users WHERE id = ?').get(userId);
      return { id, deId: userId, versId: amiId, corps: texte, creeLe, auteurNom: auteur.nom };
    },
  };
}
