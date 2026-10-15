const etat = {
  moi: null,
  seuil: 'entrer',
  ecran: 'seuil',
  groupes: [],
  cale: null,
  courantId: null,
  lignes: [],
  houle: [],
  presents: [],
  personnesVoix: [],
  enVoix: false,
  tient: false,
  assis: false,
  eclatId: null,
  fluxLocal: null,
  fluxVoix: null,
  dessin: null,
  liens: new Map(),
  liensVoix: new Map(),
  nombreAssis: 0,
  annonce: '',
  annonceErreur: false,
  avis: '',
  confirmation: null,
  confirmationHoule: null,
  confirmationRetrait: null,
  confirmerExtinction: false,
  lentilleRefusee: false,
  sonCouvert: false,
  sonBloque: false,
  imageRecue: false,
  lien: 'ferme',
  envoi: false,
  envoiVoix: false,
  membresOuverts: false,
  amis: [],
  amiId: null,
  prives: [],
  ws: null,
  generationRoute: 0,
};

let generationLien = 0;
let essaisLien = 0;

const ROLES = { lampiste: 'Propriétaire', veilleur: 'Modérateur', passant: 'Membre' };

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [cle, valeur] of Object.entries(attrs)) {
    if (valeur == null || valeur === false) continue;
    if (cle === 'class') node.className = valeur;
    else if (cle.startsWith('on') && typeof valeur === 'function') node.addEventListener(cle.slice(2).toLowerCase(), valeur);
    else if (typeof valeur === 'boolean') node[cle] = valeur;
    else if (cle === 'value') node.value = valeur;
    else node.setAttribute(cle, valeur);
  }
  const liste = Array.isArray(children) ? children : [children];
  for (const enfant of liste) {
    if (enfant == null || enfant === false) continue;
    node.append(enfant instanceof Node ? enfant : document.createTextNode(String(enfant)));
  }
  return node;
}

function logo(alt) {
  return el('img', { class: 'logo', src: '/logo.png?v=3', alt: alt || '' });
}

function marque(grande) {
  const wrap = el(grande ? 'h1' : 'span', { class: grande ? 'marque grande' : 'marque' });
  wrap.append(logo('Talk'));
  return wrap;
}

function annoncer(texte, { erreur = false } = {}) {
  etat.annonce = texte || '';
  etat.annonceErreur = Boolean(erreur && texte);
  const zone = document.getElementById('annonce');
  if (!zone) return;
  zone.textContent = etat.annonce;
  zone.classList.toggle('erreur', etat.annonceErreur);
}

function heure(ms) {
  return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(ms);
}

function phraseEnLigne() {
  const n = etat.presents.length;
  if (n === 0) return 'En ligne';
  if (n === 1) return '1 en ligne';
  return `${n} en ligne`;
}

function phraseRegardent(n) {
  if (!n) return 'Personne ne regarde';
  if (n === 1) return '1 personne regarde';
  return `${n} personnes regardent`;
}

function initiale(nom) {
  const lettre = (nom || '?').trim().charAt(0);
  return lettre.toLocaleUpperCase('fr');
}

function presDuBas() {
  return window.innerHeight + window.scrollY >= document.body.scrollHeight - 140;
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    method: opts.method || 'GET',
    credentials: 'same-origin',
    headers: opts.body ? { 'content-type': 'application/json' } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const texte = await res.text();
  let data = null;
  if (texte) {
    try { data = JSON.parse(texte); } catch { data = null; }
  }
  if (!res.ok) {
    const err = new Error(data?.erreur || 'La requête a échoué.');
    err.status = res.status;
    throw err;
  }
  return data;
}

function envoyer(obj) {
  if (etat.ws && etat.ws.readyState === WebSocket.OPEN) etat.ws.send(JSON.stringify(obj));
}

function brancher() {
  if (!etat.moi) return;
  if (etat.ws && (etat.ws.readyState === WebSocket.CONNECTING || etat.ws.readyState === WebSocket.OPEN)) return;
  const gen = ++generationLien;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/temps-reel`);
  etat.ws = ws;
  ws.onopen = () => {
    if (gen !== generationLien) return;
    essaisLien = 0;
    etat.lien = 'ouvert';
    peindreLien();
    if (etat.cale) envoyer({ type: 'entrer', caleId: etat.cale.id });
    if (etat.tient && etat.eclatId) envoyer({ type: 'tenir', eclatId: etat.eclatId });
    if (etat.assis && etat.eclatId) envoyer({ type: 'asseoir', eclatId: etat.eclatId });
    if (etat.enVoix) {
      for (const id of [...etat.liensVoix.keys()]) fermerLienVoix(id);
      envoyer({ type: 'voix-rejoindre' });
    }
  };
  ws.onmessage = (ev) => {
    if (gen !== generationLien) return;
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    recevoir(msg);
  };
  ws.onerror = () => {};
  ws.onclose = () => {
    if (gen !== generationLien) return;
    etat.lien = 'coupe';
    peindreLien();
    if (!etat.moi) return;
    essaisLien += 1;
    const delai = Math.min(5000, 600 * essaisLien);
    setTimeout(() => {
      if (gen === generationLien) brancher();
    }, delai);
  };
}

function recevoir(msg) {
  if (msg.type === 'quai' && msg.caleId === etat.cale?.id) {
    etat.presents = msg.presents || [];
    peindreCompte();
    peindreTuiles();
    if (etat.membresOuverts) peindreMembres();
    return;
  }
  if (msg.type === 'voix' && msg.caleId === etat.cale?.id) {
    etat.personnesVoix = msg.personnes || [];
    peindreTuiles();
    return;
  }
  if (msg.type === 'voix-deja' && msg.caleId === etat.cale?.id && etat.enVoix) {
    for (const personne of msg.personnes || []) {
      offrirVoix(personne.id).catch(() => annoncer('La voix ne se relie pas.', { erreur: true }));
    }
    return;
  }
  if (msg.type === 'voix-arrivee' && msg.caleId === etat.cale?.id) {
    fermerLienVoix(msg.id);
    return;
  }
  if (msg.type === 'voix-parti') {
    fermerLienVoix(msg.id);
    return;
  }
  if (msg.type === 'voix-signal' && etat.enVoix) {
    recevoirSignalVoix(msg.de, msg.charge).catch(() => {});
    return;
  }
  if (msg.type === 'ligne') {
    ajouterLigne(msg.ligne);
    return;
  }
  if (msg.type === 'ligne-rayee') {
    retirerLigne(msg.ligneId);
    return;
  }
  if (msg.type === 'houle') {
    ajouterHoule(msg.ligne);
    return;
  }
  if (msg.type === 'houle-rayee') {
    retirerHoule(msg.ligneId);
    return;
  }
  if (msg.type === 'prive') {
    ajouterPrive(msg.message);
    return;
  }
  if (msg.type === 'courant' && msg.caleId === etat.cale?.id) {
    if (!etat.cale.courants.some((c) => c.id === msg.courant.id)) etat.cale.courants.push(msg.courant);
    peindreChoixConversation();
    return;
  }
  if (msg.type === 'membres' && msg.caleId === etat.cale?.id) {
    etat.cale.membres = msg.membres;
    const moi = msg.membres.find((m) => m.id === etat.moi.id);
    if (moi) etat.cale.role = moi.role;
    peindreActionsGroupe();
    peindreChoixConversation();
    if (etat.membresOuverts) peindreMembres();
    return;
  }
  if (msg.type === 'eclat') {
    const groupe = etat.groupes.find((g) => g.id === msg.caleId);
    if (groupe) {
      groupe.eclat = Boolean(msg.eclat);
      peindreListeGroupes();
    }
    if (etat.cale?.id !== msg.caleId) return;
    const avait = Boolean(etat.cale.eclat);
    etat.cale.eclat = msg.eclat;
    if (!msg.eclat) {
      if (!avait) return;
      couperFlux();
      etat.nombreAssis = 0;
      etat.houle = [];
      annoncer('Le direct est terminé.');
      peindreActionsGroupe();
      peindreDirect();
      return;
    }
    etat.eclatId = msg.eclat.id;
    if (msg.eclat.auteurId === etat.moi.id && etat.fluxLocal) etat.tient = true;
    peindreActionsGroupe();
    peindreDirect();
    return;
  }
  if (msg.type === 'assis' && msg.eclatId === etat.cale?.eclat?.id) {
    etat.nombreAssis = msg.nombre || 0;
    const compte = document.getElementById('compte-regardent');
    if (compte) compte.textContent = phraseRegardent(etat.nombreAssis);
    return;
  }
  if (msg.type === 'spectateur' && etat.tient && msg.eclatId === etat.eclatId) {
    offrir(msg.spectateurId).catch(() => annoncer('Le lien vers une personne a lâché.', { erreur: true }));
    return;
  }
  if (msg.type === 'spectateur-parti') {
    fermerLien(msg.spectateurId);
    return;
  }
  if (msg.type === 'signal' && (etat.tient || etat.assis)) {
    recevoirSignal(msg.de, msg.charge).catch(() => {});
    return;
  }
  if (msg.type === 'retire' && etat.cale?.id === msg.caleId) {
    etat.avis = 'Vous avez été retiré du groupe.';
    couperFlux();
    couperVoix();
    etat.cale = null;
    aller('/', { replace: true });
    return;
  }
  if (msg.type === 'erreur' && msg.message) annoncer(msg.message, { erreur: true });
}

function aller(path, { replace = false } = {}) {
  if (replace) history.replaceState({}, '', path);
  else history.pushState({}, '', path);
  return router();
}

async function router() {
  const gen = ++etat.generationRoute;
  const path = location.pathname;
  if (!etat.moi) {
    if (path !== '/') history.replaceState({}, '', '/');
    monterSeuil();
    return;
  }
  assurerCoquille();
  try {
    etat.groupes = await api('/api/bassin');
  } catch (e) {
    annoncer(e.message, { erreur: true });
  }
  if (gen !== etat.generationRoute) return;
  peindreListeGroupes();
  const groupe = path.match(/^\/groupe\/([0-9a-f-]{36})$/i);
  const messages = path.match(/^\/messages(?:\/([0-9a-f-]{36}))?$/i);
  if (groupe) {
    try {
      await ouvrirGroupe(groupe[1]);
    } catch (e) {
      if (gen !== etat.generationRoute) return;
      etat.avis = e.message;
      await quitterGroupe();
      history.replaceState({}, '', '/');
      peindreAccueil();
    }
    return;
  }
  await quitterGroupe();
  if (gen !== etat.generationRoute) return;
  if (path === '/amis') {
    await peindreAmis();
    return;
  }
  if (messages) {
    await peindreMessages(messages[1] || null);
    return;
  }
  if (path !== '/') history.replaceState({}, '', '/');
  peindreAccueil();
}

async function quitterGroupe() {
  if (!etat.cale && !etat.tient && !etat.enVoix) return;
  const eclatId = etat.tient ? etat.eclatId : null;
  const assis = etat.assis;
  const enVoix = etat.enVoix;
  etat.tient = false;
  etat.assis = false;
  if (eclatId) {
    try { await api(`/api/eclats/${eclatId}/eteindre`, { method: 'POST' }); } catch { /* déjà arrêté */ }
  }
  if (assis) envoyer({ type: 'quitter-eclat' });
  if (enVoix) envoyer({ type: 'voix-quitter' });
  if (etat.cale) envoyer({ type: 'sortir-cale' });
  couperFlux();
  couperVoix();
  etat.cale = null;
  etat.presents = [];
  etat.personnesVoix = [];
  etat.lignes = [];
  etat.houle = [];
  etat.membresOuverts = false;
  etat.nombreAssis = 0;
  etat.confirmerExtinction = false;
}

function monterSeuil() {
  document.title = 'Talk';
  etat.ecran = 'seuil';
  const creer = etat.seuil === 'creer';
  document.getElementById('ecran').replaceChildren(el('div', { class: 'entree' }, [
    el('form', { class: 'carte-forme', onsubmit: envoyerSeuil }, [
      marque(true),
      el('h2', {}, creer ? 'Créer un compte' : 'Connexion'),
      el('p', { id: 'annonce', class: 'annonce', role: 'status' }),
      creer ? el('label', { class: 'champ' }, [
        el('span', { class: 'etiquette' }, 'Nom'),
        el('input', { id: 'nom', name: 'nom', autocomplete: 'nickname', maxlength: '40', required: true }),
      ]) : null,
      el('label', { class: 'champ' }, [
        el('span', { class: 'etiquette' }, 'Identifiant'),
        el('input', { id: 'identifiant', name: 'identifiant', autocomplete: 'username', maxlength: '20', required: true }),
      ]),
      el('label', { class: 'champ' }, [
        el('span', { class: 'etiquette' }, 'Mot de passe'),
        el('input', { id: 'mot-de-passe', name: 'mot-de-passe', type: 'password', autocomplete: creer ? 'new-password' : 'current-password', required: true }),
      ]),
      el('div', { class: 'actions-forme' }, [
        el('button', { type: 'submit', class: 'plein', 'data-action': 'valider-seuil' }, creer ? 'Créer le compte' : 'Entrer'),
        el('button', { type: 'button', class: 'texte', 'data-action': 'basculer', onclick: basculer }, creer ? 'J’ai déjà un compte' : 'Créer un compte'),
      ]),
    ]),
  ]));
  annoncer(etat.annonce, { erreur: etat.annonceErreur });
  document.getElementById(creer ? 'nom' : 'identifiant')?.focus();
}

function basculer() {
  etat.seuil = etat.seuil === 'creer' ? 'entrer' : 'creer';
  annoncer('');
  monterSeuil();
}

async function envoyerSeuil(e) {
  e.preventDefault();
  const identifiant = document.getElementById('identifiant').value;
  const motDePasse = document.getElementById('mot-de-passe').value;
  const nom = document.getElementById('nom')?.value;
  try {
    const creer = etat.seuil === 'creer';
    etat.moi = await api(creer ? '/api/inscription' : '/api/connexion', {
      method: 'POST',
      body: creer ? { identifiant, nom, motDePasse } : { identifiant, motDePasse },
    });
    annoncer('');
    brancher();
    await aller('/', { replace: true });
  } catch (err) {
    annoncer(err.message, { erreur: true });
  }
}

function assurerCoquille() {
  if (document.getElementById('rail')) return;
  document.getElementById('ecran').replaceChildren(el('div', { class: 'coquille' }, [
    el('aside', { id: 'rail', class: 'rail' }, [
      el('button', { type: 'button', class: 'marque', 'data-action': 'accueil', onclick: () => aller('/') }, [
        logo('Talk'),
      ]),
      el('h2', {}, 'Mes groupes'),
      el('div', { id: 'liste-groupes', class: 'liste-groupes' }),
      el('form', { class: 'rail-forme', onsubmit: creerGroupe }, [
        el('label', { class: 'champ' }, [
          el('span', { class: 'etiquette' }, 'Nouveau groupe'),
          el('input', { id: 'nom-cale', name: 'nom', maxlength: '48', required: true, placeholder: 'Nom du groupe' }),
        ]),
        el('label', { class: 'champ' }, [
          el('span', { class: 'etiquette' }, 'En quelques mots'),
          el('input', { id: 'resume-cale', name: 'resume', maxlength: '160' }),
        ]),
        el('button', { type: 'submit', class: 'plein', 'data-action': 'ouvrir-cale' }, 'Ouvrir'),
      ]),
      el('form', { class: 'rail-forme', onsubmit: rejoindreGroupe }, [
        el('label', { class: 'champ' }, [
          el('span', { class: 'etiquette' }, 'Code d’invitation'),
          el('input', { id: 'amarre', name: 'amarre', maxlength: '12', autocomplete: 'off', required: true }),
        ]),
        el('button', { type: 'submit', class: 'plein', 'data-action': 'rejoindre' }, 'Rejoindre'),
      ]),
      el('div', { class: 'onglets' }, [
        el('button', { type: 'button', class: 'onglet', 'data-action': 'messages', onclick: () => aller('/messages') }, 'Messages privés'),
        el('button', { type: 'button', class: 'onglet', 'data-action': 'amis', onclick: () => aller('/amis') }, 'Amis'),
      ]),
      el('button', { type: 'button', class: 'texte', 'data-action': 'sortir', onclick: sortir }, 'Sortir'),
      el('p', { class: 'qui' }, etat.moi.identifiant),
    ]),
    el('main', { id: 'principal', class: 'principal' }),
  ]));
}

function peindreListeGroupes() {
  const liste = document.getElementById('liste-groupes');
  if (!liste) return;
  if (!etat.groupes.length) {
    liste.replaceChildren(el('p', { class: 'vide' }, 'Aucun groupe.'));
    return;
  }
  liste.replaceChildren(...etat.groupes.map((groupe) => el('button', {
    type: 'button',
    class: 'bouton-groupe',
    'data-groupe': groupe.id,
    'aria-current': etat.cale?.id === groupe.id ? 'true' : 'false',
    onclick: () => aller(`/groupe/${groupe.id}`),
  }, [
    el('span', { class: 'nom-groupe' }, groupe.nom),
    groupe.eclat ? el('span', { class: 'sous-groupe' }, 'Direct') : null,
  ])));
}

function peindreOnglets() {
  const messages = document.querySelector('[data-action=messages]');
  const amis = document.querySelector('[data-action=amis]');
  if (messages) messages.setAttribute('aria-current', etat.ecran === 'messages' ? 'true' : 'false');
  if (amis) amis.setAttribute('aria-current', etat.ecran === 'amis' ? 'true' : 'false');
}

function peindreAccueil() {
  document.title = 'Talk';
  etat.ecran = 'accueil';
  const avis = etat.avis;
  etat.avis = '';
  document.getElementById('principal').replaceChildren(el('div', { class: 'page' }, [
    el('h1', {}, 'Choisissez un groupe'),
    el('p', {}, 'Retrouvez les groupes que vous avez ouverts ou rejoints. Les messages privés et les amis sont dans la colonne de gauche.'),
    el('p', { id: 'annonce', class: `annonce${avis ? ' erreur' : ''}`, role: 'status' }, avis),
  ]));
  peindreOnglets();
  peindreListeGroupes();
}

async function creerGroupe(e) {
  e.preventDefault();
  try {
    const cale = await api('/api/cales', {
      method: 'POST',
      body: { nom: document.getElementById('nom-cale').value, resume: document.getElementById('resume-cale').value },
    });
    document.getElementById('nom-cale').value = '';
    document.getElementById('resume-cale').value = '';
    await aller(`/groupe/${cale.id}`);
  } catch (err) {
    annoncer(err.message, { erreur: true });
  }
}

async function rejoindreGroupe(e) {
  e.preventDefault();
  try {
    const cale = await api('/api/amarres', { method: 'POST', body: { amarre: document.getElementById('amarre').value } });
    document.getElementById('amarre').value = '';
    await aller(`/groupe/${cale.id}`);
  } catch (err) {
    annoncer(err.message, { erreur: true });
  }
}

async function sortir() {
  await quitterGroupe();
  try { await api('/api/sortie', { method: 'POST' }); } catch { /* session déjà close */ }
  etat.moi = null;
  etat.groupes = [];
  etat.amis = [];
  generationLien += 1;
  try { etat.ws?.close(); } catch { /* déjà fermé */ }
  etat.ws = null;
  history.replaceState({}, '', '/');
  monterSeuil();
}

async function ouvrirGroupe(id) {
  if (etat.cale?.id === id && document.getElementById('tuiles')) {
    etat.ecran = 'groupe';
    peindreOnglets();
    peindreListeGroupes();
    return;
  }
  if (etat.cale && etat.cale.id !== id) await quitterGroupe();
  const cale = await api(`/api/cales/${id}`);
  etat.cale = cale;
  etat.ecran = 'groupe';
  etat.courantId = cale.courants[0]?.id || null;
  etat.lignes = [];
  etat.houle = [];
  etat.presents = [];
  etat.personnesVoix = [];
  etat.membresOuverts = false;
  etat.assis = false;
  etat.nombreAssis = 0;
  etat.confirmation = null;
  etat.confirmationHoule = null;
  etat.confirmationRetrait = null;
  etat.confirmerExtinction = false;
  etat.imageRecue = false;
  if (!(etat.fluxLocal && cale.eclat && cale.eclat.auteurId === etat.moi.id)) {
    etat.tient = false;
  } else {
    etat.tient = true;
    etat.eclatId = cale.eclat.id;
  }
  document.title = `${cale.nom} · Talk`;
  peindreGroupe();
  if (etat.courantId) {
    etat.lignes = await api(`/api/courants/${etat.courantId}/lignes`);
    peindreLignes();
  }
  if (cale.eclat) {
    try { etat.houle = await api(`/api/eclats/${cale.eclat.id}/houle`); } catch { etat.houle = []; }
    peindreDiscussion();
  }
  envoyer({ type: 'entrer', caleId: id });
  if (etat.tient && etat.eclatId) envoyer({ type: 'tenir', eclatId: etat.eclatId });
  peindreListeGroupes();
  peindreOnglets();
}

function peindreGroupe() {
  const cale = etat.cale;
  document.getElementById('principal').replaceChildren(el('div', { class: 'groupe' }, [
    el('header', { class: 'groupe-entete' }, [
      el('div', {}, [
        el('h1', {}, cale.nom),
        cale.resume ? el('p', { class: 'resume' }, cale.resume) : null,
        el('p', { class: 'meta' }, [
          'Code d’invitation ',
          el('strong', { class: 'code', id: 'code-amarre' }, cale.amarre),
          ' ',
          el('button', { type: 'button', class: 'texte', onclick: copierCode }, 'Copier'),
        ]),
        el('p', { id: 'compte-en-ligne', class: 'meta' }, phraseEnLigne()),
        el('p', { id: 'etat-lien', class: 'etat-lien', hidden: true }),
      ]),
      el('div', { id: 'actions-groupe', class: 'actions' }),
    ]),
    el('section', { class: 'appel', 'aria-label': 'Appel' }, [
      el('h2', {}, 'Appel'),
      el('div', { id: 'tuiles', class: 'tuiles' }),
      el('div', { id: 'actions-voix', class: 'actions' }),
    ]),
    el('section', { id: 'zone-direct' }),
    el('section', { class: 'conversation' }, [
      el('h2', {}, 'Conversation'),
      el('div', { id: 'choix-conversation', class: 'choix-conversation' }),
      el('p', { id: 'annonce', class: `annonce${etat.annonceErreur ? ' erreur' : ''}`, role: 'status' }, etat.annonce),
      el('div', { id: 'journal', class: 'journal' }),
      formeMessage('corps', 'Message', 'poser', poserLigne, 'Envoyer'),
    ]),
    el('section', { id: 'membres', class: 'feuille', hidden: true }),
  ]));
  peindreActionsGroupe();
  peindreTuiles();
  peindreVoixActions();
  peindreDirect();
  peindreChoixConversation();
  peindreLignes();
  peindreMembres();
  peindreLien();
}

function peindreLien() {
  const zone = document.getElementById('etat-lien');
  if (!zone) return;
  const coupe = etat.lien === 'coupe';
  zone.hidden = !coupe;
  zone.textContent = coupe ? 'Connexion coupée. Talk réessaie…' : '';
}

function peindreCompte() {
  const compte = document.getElementById('compte-en-ligne');
  if (compte) compte.textContent = phraseEnLigne();
}

function peindreActionsGroupe() {
  const zone = document.getElementById('actions-groupe');
  if (!zone || !etat.cale) return;
  const boutons = [
    el('button', { type: 'button', class: 'texte', 'data-action': 'membres', onclick: ouvrirMembres }, 'Membres'),
  ];
  const eclat = etat.cale.eclat;
  if (!eclat) {
    boutons.push(el('button', { type: 'button', class: 'plein', 'data-action': 'allumer', onclick: () => lancerDirect(false) }, 'Lancer le direct'));
    if (etat.lentilleRefusee) {
      boutons.push(el('button', { type: 'button', class: 'texte', 'data-action': 'sans-lentille', onclick: () => lancerDirect(true) }, 'Sans caméra'));
    }
  } else if (eclat.auteurId === etat.moi.id && !etat.tient) {
    boutons.push(el('button', { type: 'button', class: 'plein', 'data-action': 'reprendre', onclick: () => reprendre(false) }, 'Reprendre le direct'));
    if (etat.lentilleRefusee) {
      boutons.push(el('button', { type: 'button', class: 'texte', 'data-action': 'reprendre-sans', onclick: () => reprendre(true) }, 'Sans caméra'));
    }
    boutons.push(boutonArreter());
  } else if (eclat.auteurId === etat.moi.id || etat.cale.role !== 'passant') {
    boutons.push(boutonArreter());
  }
  zone.replaceChildren(...boutons);
}

function boutonArreter() {
  return el('button', {
    type: 'button',
    class: 'plein',
    'data-action': 'eteindre',
    onclick: demanderArreter,
  }, etat.confirmerExtinction ? 'Confirmer' : 'Arrêter le direct');
}

function peindreTuiles() {
  const zone = document.getElementById('tuiles');
  if (!zone) return;
  if (!etat.presents.length) {
    zone.replaceChildren(el('p', { class: 'vide' }, 'Personne en ligne.'));
    return;
  }
  const enAppel = new Set(etat.personnesVoix.map((p) => p.id));
  zone.replaceChildren(...etat.presents.map((personne) => {
    const dedans = enAppel.has(personne.id);
    return el('div', { class: dedans ? 'tuile dans-appel' : 'tuile', 'data-personne': personne.id }, [
      el('div', { class: 'rond' }, initiale(personne.nom)),
      el('strong', {}, personne.nom),
      el('span', {}, dedans ? 'Dans l’appel' : 'En ligne'),
    ]);
  }));
}

function peindreVoixActions() {
  const zone = document.getElementById('actions-voix');
  if (!zone) return;
  if (etat.enVoix) {
    zone.replaceChildren(el('button', {
      type: 'button',
      class: 'plein',
      'data-action': 'quitter-voix',
      onclick: quitterVoixUtilisateur,
    }, 'Quitter la voix'));
    return;
  }
  zone.replaceChildren(el('button', {
    type: 'button',
    class: 'plein',
    'data-action': 'rejoindre-voix',
    onclick: rejoindreVoixUtilisateur,
  }, 'Rejoindre la voix'));
}

function peindreDirect() {
  const zone = document.getElementById('zone-direct');
  if (!zone || !etat.cale) return;
  const eclat = etat.cale.eclat;
  if (!eclat) {
    zone.replaceChildren();
    return;
  }
  const morceaux = [el('h2', {}, 'Direct')];
  if (etat.tient || etat.assis) {
    const video = el('video', { id: 'flux' });
    video.autoplay = true;
    video.playsInline = true;
    video.muted = Boolean(etat.tient);
    morceaux.push(video, el('div', { id: 'legende', class: 'legende' }));
  } else if (eclat.auteurId !== etat.moi.id) {
    morceaux.push(
      el('p', {}, `${eclat.auteurNom} a lancé un direct.`),
      el('button', { type: 'button', class: 'plein', 'data-action': 'regarder', onclick: regarder }, 'Regarder'),
    );
  } else {
    morceaux.push(el('p', {}, 'Votre direct est lancé.'));
  }
  morceaux.push(
    el('h3', {}, 'Discussion du direct'),
    el('div', { id: 'discussion', class: 'journal' }),
    formeMessage('corps-direct', 'Message', 'poser-direct', poserHoule, 'Envoyer'),
  );
  zone.replaceChildren(el('div', { class: 'direct' }, morceaux));
  peindreLegende();
  peindreDiscussion();
  if (etat.tient) attacherLocal();
}

function peindreLegende() {
  const legende = document.getElementById('legende');
  if (!legende || !etat.cale?.eclat) return;
  const eclat = etat.cale.eclat;
  const morceaux = [];
  if (etat.tient) {
    morceaux.push(el('p', {}, [
      'Vous êtes en direct. ',
      el('span', { id: 'compte-regardent' }, phraseRegardent(etat.nombreAssis)),
    ]));
    if (etat.fluxLocal?.getAudioTracks().length) {
      morceaux.push(el('button', { type: 'button', class: 'texte', onclick: couvrirSon }, etat.sonCouvert ? 'Rendre le micro' : 'Couper le micro'));
    }
  } else if (etat.assis) {
    const etatImage = etat.imageRecue ? 'Image reçue' : 'Connexion en cours…';
    morceaux.push(el('p', {}, `${eclat.auteurNom} est en direct. ${etatImage}`));
    if (etat.sonBloque) morceaux.push(el('button', { type: 'button', class: 'texte', onclick: activerSon }, 'Activer le son'));
  }
  legende.replaceChildren(...morceaux);
}

function formeMessage(id, etiquette, action, onSubmit, libelle) {
  return el('form', { class: 'composeur', onsubmit: onSubmit }, [
    el('label', { class: 'champ' }, [
      el('span', { class: 'etiquette' }, etiquette),
      el('textarea', {
        id,
        maxlength: '1000',
        required: true,
        onkeydown: (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            e.currentTarget.form.requestSubmit();
          }
        },
      }),
    ]),
    el('button', { type: 'submit', class: 'plein', 'data-action': action }, libelle),
  ]);
}

function peindreChoixConversation() {
  const zone = document.getElementById('choix-conversation');
  if (!zone || !etat.cale) return;
  if (etat.cale.courants.length < 2) {
    zone.replaceChildren();
    return;
  }
  zone.replaceChildren(...etat.cale.courants.map((courant) => el('button', {
    type: 'button',
    class: 'choix',
    'aria-current': courant.id === etat.courantId ? 'true' : 'false',
    onclick: () => chargerConversation(courant.id),
  }, courant.nom)));
}

function peindreLignes() {
  const journal = document.getElementById('journal');
  if (!journal) return;
  if (!etat.lignes.length) {
    journal.replaceChildren(el('p', { class: 'vide' }, 'Aucun message.'));
    return;
  }
  journal.replaceChildren(...etat.lignes.map((ligne) => ligneJournal(ligne, {
    confirmer: etat.confirmation === ligne.id,
    action: () => demanderSupprimer(ligne),
  })));
}

function peindreDiscussion() {
  const zone = document.getElementById('discussion');
  if (!zone) return;
  if (!etat.houle.length) {
    zone.replaceChildren(el('p', { class: 'vide' }, 'Aucun message.'));
    return;
  }
  zone.replaceChildren(...etat.houle.map((ligne) => ligneJournal(ligne, {
    confirmer: etat.confirmationHoule === ligne.id,
    action: () => demanderSupprimerHoule(ligne),
  })));
}

function ligneJournal(ligne, { confirmer, action }) {
  const peut = ligne.auteurId === etat.moi.id || etat.cale?.role === 'lampiste' || etat.cale?.role === 'veilleur';
  return el('article', { class: 'ligne-journal' }, [
    el('time', { class: 'heure', datetime: new Date(ligne.creeLe).toISOString() }, heure(ligne.creeLe)),
    el('div', {}, [
      el('div', { class: 'auteur' }, ligne.auteurNom),
      el('p', { class: 'corps' }, ligne.corps),
      peut ? el('button', { type: 'button', class: 'texte', 'data-action': 'supprimer', onclick: action }, confirmer ? 'Confirmer' : 'Supprimer') : null,
    ]),
  ]);
}

async function chargerConversation(id) {
  etat.courantId = id;
  etat.confirmation = null;
  etat.lignes = await api(`/api/courants/${id}/lignes`);
  peindreChoixConversation();
  peindreLignes();
}

function ajouterLigne(ligne) {
  if (!ligne || etat.lignes.some((l) => l.id === ligne.id)) return;
  if (ligne.courantId !== etat.courantId) return;
  const suivre = presDuBas();
  etat.lignes.push(ligne);
  etat.lignes.sort((a, b) => a.creeLe - b.creeLe);
  if (document.getElementById('journal')) {
    peindreLignes();
    if (suivre) window.scrollTo(0, document.body.scrollHeight);
  }
}

function ajouterHoule(ligne) {
  if (!ligne || etat.houle.some((l) => l.id === ligne.id)) return;
  if (ligne.eclatId !== etat.cale?.eclat?.id && ligne.eclatId !== etat.eclatId) return;
  etat.houle.push(ligne);
  etat.houle.sort((a, b) => a.creeLe - b.creeLe);
  if (document.getElementById('discussion')) peindreDiscussion();
}

function retirerLigne(id) {
  etat.lignes = etat.lignes.filter((l) => l.id !== id);
  if (etat.confirmation === id) etat.confirmation = null;
  if (document.getElementById('journal')) peindreLignes();
}

function retirerHoule(id) {
  etat.houle = etat.houle.filter((l) => l.id !== id);
  if (etat.confirmationHoule === id) etat.confirmationHoule = null;
  if (document.getElementById('discussion')) peindreDiscussion();
}

async function poserLigne(e) {
  e.preventDefault();
  const champ = document.getElementById('corps');
  const corps = champ.value;
  if (!corps.trim() || !etat.courantId) return;
  champ.disabled = true;
  try {
    const ligne = await api(`/api/courants/${etat.courantId}/lignes`, { method: 'POST', body: { corps } });
    champ.value = '';
    ajouterLigne(ligne);
  } catch (err) {
    annoncer(err.message, { erreur: true });
  } finally {
    champ.disabled = false;
    champ.focus();
  }
}

async function poserHoule(e) {
  e.preventDefault();
  const champ = document.getElementById('corps-direct');
  const eclatId = etat.cale?.eclat?.id;
  if (!eclatId || !champ) return;
  const corps = champ.value;
  if (!corps.trim()) return;
  champ.disabled = true;
  try {
    const ligne = await api(`/api/eclats/${eclatId}/houle`, { method: 'POST', body: { corps } });
    champ.value = '';
    ajouterHoule(ligne);
  } catch (err) {
    annoncer(err.message, { erreur: true });
  } finally {
    champ.disabled = false;
    champ.focus();
  }
}

async function demanderSupprimer(ligne) {
  if (etat.confirmation !== ligne.id) {
    etat.confirmation = ligne.id;
    peindreLignes();
    return;
  }
  etat.confirmation = null;
  try {
    await api(`/api/lignes/${ligne.id}`, { method: 'DELETE' });
    retirerLigne(ligne.id);
  } catch (err) {
    annoncer(err.message, { erreur: true });
  }
}

async function demanderSupprimerHoule(ligne) {
  if (etat.confirmationHoule !== ligne.id) {
    etat.confirmationHoule = ligne.id;
    peindreDiscussion();
    return;
  }
  etat.confirmationHoule = null;
  try {
    await api(`/api/houle/${ligne.id}`, { method: 'DELETE' });
    retirerHoule(ligne.id);
  } catch (err) {
    annoncer(err.message, { erreur: true });
  }
}

function ouvrirMembres() {
  etat.membresOuverts = !etat.membresOuverts;
  peindreMembres();
}

function peindreMembres() {
  const zone = document.getElementById('membres');
  if (!zone || !etat.cale) return;
  if (!etat.membresOuverts) {
    zone.hidden = true;
    zone.replaceChildren();
    return;
  }
  const presents = new Set(etat.presents.map((p) => p.id));
  zone.hidden = false;
  zone.replaceChildren(
    el('div', { class: 'feuille-entete' }, [
      el('h2', {}, 'Membres'),
      el('button', { type: 'button', class: 'texte', 'data-action': 'fermer-membres', onclick: ouvrirMembres }, 'Fermer'),
    ]),
    el('ul', {}, etat.cale.membres.map((membre) => el('li', { class: 'membre', 'data-membre': membre.id }, [
      el('span', { class: presents.has(membre.id) ? 'diamant la' : 'diamant', title: presents.has(membre.id) ? 'En ligne' : 'Absent' }),
      el('div', {}, [
        el('strong', {}, membre.nom),
        el('span', { class: 'identifiant' }, membre.identifiant),
        el('span', { class: 'role-etiquette' }, ROLES[membre.role] || 'Membre'),
      ]),
      el('div', { class: 'membre-actions' }, actionsMembre(membre)),
    ]))),
  );
}

function actionsMembre(membre) {
  const actions = [];
  if (etat.cale.role === 'lampiste' && membre.role !== 'lampiste') {
    actions.push(el('select', {
      'aria-label': `Rôle de ${membre.nom}`,
      onchange: (e) => changerRole(membre.id, e.target.value),
    }, [
      el('option', { value: 'passant', selected: membre.role === 'passant' }, 'Membre'),
      el('option', { value: 'veilleur', selected: membre.role === 'veilleur' }, 'Modérateur'),
    ]));
  }
  if (peutRetirer(membre)) {
    actions.push(el('button', {
      type: 'button',
      class: 'texte',
      'data-action': 'retirer',
      onclick: () => retirerMembre(membre.id),
    }, etat.confirmationRetrait === membre.id ? 'Confirmer' : 'Retirer'));
  }
  return actions;
}

function peutRetirer(membre) {
  if (membre.id === etat.moi.id || membre.role === 'lampiste') return false;
  if (etat.cale.role === 'lampiste') return true;
  return etat.cale.role === 'veilleur' && membre.role === 'passant';
}

async function changerRole(userId, role) {
  try {
    const membres = await api(`/api/cales/${etat.cale.id}/membres/${userId}`, { method: 'POST', body: { role } });
    etat.cale.membres = membres;
    const moi = membres.find((m) => m.id === etat.moi.id);
    if (moi) etat.cale.role = moi.role;
    peindreMembres();
    peindreChoixConversation();
    peindreActionsGroupe();
  } catch (err) {
    annoncer(err.message, { erreur: true });
    peindreMembres();
  }
}

async function retirerMembre(userId) {
  if (etat.confirmationRetrait !== userId) {
    etat.confirmationRetrait = userId;
    peindreMembres();
    return;
  }
  etat.confirmationRetrait = null;
  try {
    await api(`/api/cales/${etat.cale.id}/membres/${userId}`, { method: 'DELETE' });
    etat.cale.membres = etat.cale.membres.filter((m) => m.id !== userId);
    peindreMembres();
  } catch (err) {
    annoncer(err.message, { erreur: true });
    peindreMembres();
  }
}

async function copierCode() {
  try {
    await navigator.clipboard.writeText(etat.cale.amarre);
    annoncer('Code copié.');
  } catch {
    annoncer(`Code d’invitation : ${etat.cale.amarre}`);
  }
}

async function demanderArreter() {
  if (!etat.confirmerExtinction) {
    etat.confirmerExtinction = true;
    peindreActionsGroupe();
    return;
  }
  etat.confirmerExtinction = false;
  const id = etat.cale?.eclat?.id;
  if (!id) return;
  try {
    await api(`/api/eclats/${id}/eteindre`, { method: 'POST' });
  } catch (err) {
    annoncer(err.message, { erreur: true });
  }
  peindreActionsGroupe();
}

async function rejoindreVoixUtilisateur() {
  if (etat.enVoix || etat.envoiVoix) return;
  etat.envoiVoix = true;
  annoncer('');
  try {
    etat.fluxVoix = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    etat.enVoix = true;
    envoyer({ type: 'voix-rejoindre' });
    peindreVoixActions();
    peindreTuiles();
  } catch {
    etat.fluxVoix?.getTracks().forEach((piste) => piste.stop());
    etat.fluxVoix = null;
    etat.enVoix = false;
    annoncer('Le micro ne s’ouvre pas.', { erreur: true });
    peindreVoixActions();
  } finally {
    etat.envoiVoix = false;
  }
}

function quitterVoixUtilisateur() {
  if (etat.enVoix) envoyer({ type: 'voix-quitter' });
  couperVoix();
  peindreVoixActions();
  peindreTuiles();
}

async function obtenirFlux(sansCamera) {
  if (sansCamera) return directDessine(etat.moi.nom);
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: true,
  });
  return { stream, stop() {} };
}

function refusCamera(e) {
  return ['NotAllowedError', 'NotFoundError', 'NotReadableError', 'OverconstrainedError', 'SecurityError'].includes(e?.name);
}

async function lancerDirect(sansCamera) {
  if (etat.envoi) return;
  etat.envoi = true;
  annoncer('');
  try {
    const media = await obtenirFlux(sansCamera);
    etat.fluxLocal = media.stream;
    etat.dessin = media;
    etat.tient = true;
    const eclat = await api(`/api/cales/${etat.cale.id}/eclat`, { method: 'POST' });
    etat.cale.eclat = eclat;
    etat.eclatId = eclat.id;
    etat.houle = [];
    etat.lentilleRefusee = false;
    etat.imageRecue = true;
    envoyer({ type: 'tenir', eclatId: eclat.id });
    peindreActionsGroupe();
    peindreDirect();
    peindreListeGroupes();
  } catch (e) {
    couperFlux();
    if (refusCamera(e)) {
      etat.lentilleRefusee = true;
      annoncer('La caméra ne s’ouvre pas. Vous pouvez lancer un direct sans caméra.', { erreur: true });
    } else annoncer(e.message || 'Impossible de lancer le direct.', { erreur: true });
    peindreActionsGroupe();
  } finally {
    etat.envoi = false;
  }
}

async function reprendre(sansCamera) {
  if (etat.envoi || !etat.cale?.eclat) return;
  etat.envoi = true;
  try {
    const media = await obtenirFlux(sansCamera);
    etat.fluxLocal = media.stream;
    etat.dessin = media;
    etat.tient = true;
    etat.eclatId = etat.cale.eclat.id;
    etat.lentilleRefusee = false;
    try { etat.houle = await api(`/api/eclats/${etat.eclatId}/houle`); } catch { etat.houle = []; }
    envoyer({ type: 'tenir', eclatId: etat.eclatId });
    peindreActionsGroupe();
    peindreDirect();
  } catch (e) {
    couperFlux();
    if (refusCamera(e)) {
      etat.lentilleRefusee = true;
      annoncer('La caméra ne s’ouvre pas.', { erreur: true });
    } else annoncer(e.message || 'Impossible de reprendre le direct.', { erreur: true });
    peindreActionsGroupe();
  } finally {
    etat.envoi = false;
  }
}

async function regarder() {
  const eclat = etat.cale?.eclat;
  if (!eclat || eclat.auteurId === etat.moi.id) return;
  etat.assis = true;
  etat.eclatId = eclat.id;
  etat.imageRecue = false;
  try { etat.houle = await api(`/api/eclats/${eclat.id}/houle`); } catch { etat.houle = []; }
  peindreDirect();
  envoyer({ type: 'asseoir', eclatId: eclat.id });
}

function couperFlux() {
  etat.tient = false;
  etat.assis = false;
  etat.sonCouvert = false;
  etat.sonBloque = false;
  etat.imageRecue = false;
  for (const lien of etat.liens.values()) {
    try { lien.pc.close(); } catch { /* déjà clos */ }
  }
  etat.liens.clear();
  try { etat.dessin?.stop?.(); } catch { /* animation déjà arrêtée */ }
  etat.dessin = null;
  etat.fluxLocal?.getTracks().forEach((piste) => piste.stop());
  etat.fluxLocal = null;
}

function couperVoix() {
  etat.enVoix = false;
  for (const lien of etat.liensVoix.values()) {
    try { lien.pc.close(); } catch { /* déjà clos */ }
    lien.audio?.remove();
  }
  etat.liensVoix.clear();
  etat.fluxVoix?.getTracks().forEach((piste) => piste.stop());
  etat.fluxVoix = null;
}

function directDessine(nom) {
  const toile = document.createElement('canvas');
  toile.width = 1280;
  toile.height = 720;
  const ctx = toile.getContext('2d');
  let raf = 0;
  const tick = () => {
    ctx.fillStyle = '#132e2b';
    ctx.fillRect(0, 0, 1280, 720);
    ctx.fillStyle = '#f4efe6';
    ctx.beginPath();
    ctx.arc(220, 300, 70, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c4622d';
    ctx.beginPath();
    ctx.moveTo(250, 280);
    ctx.lineTo(360, 240);
    ctx.lineTo(360, 340);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#f4efe6';
    ctx.font = '64px Georgia, serif';
    ctx.fillText(nom, 420, 300);
    ctx.font = '28px sans-serif';
    ctx.fillStyle = '#e7dcc8';
    ctx.fillText('Direct sans caméra', 420, 360);
    raf = requestAnimationFrame(tick);
  };
  tick();
  const stream = toile.captureStream(12);
  return {
    stream,
    stop() {
      cancelAnimationFrame(raf);
      stream.getTracks().forEach((piste) => piste.stop());
    },
  };
}

function couvrirSon() {
  const pistes = etat.fluxLocal?.getAudioTracks() || [];
  if (!pistes.length) return;
  const actif = pistes.some((p) => p.enabled);
  for (const piste of pistes) piste.enabled = !actif;
  etat.sonCouvert = actif;
  peindreLegende();
}

async function activerSon() {
  const video = document.getElementById('flux');
  if (!video) return;
  video.muted = false;
  try {
    await video.play();
    etat.sonBloque = false;
    annoncer('');
  } catch {
    video.muted = true;
    annoncer('Le navigateur garde le son coupé.', { erreur: true });
  }
  peindreLegende();
}

function attacherLocal() {
  const video = document.getElementById('flux');
  if (!video || !etat.fluxLocal) return;
  video.srcObject = etat.fluxLocal;
  video.muted = true;
  video.play().catch(() => {});
}

async function lireDistant(stream) {
  const video = document.getElementById('flux');
  if (!video) return;
  video.srcObject = stream;
  video.muted = false;
  try {
    await video.play();
  } catch {
    video.muted = true;
    try { await video.play(); } catch { /* image muette impossible */ }
    etat.sonBloque = true;
    annoncer('Le son est coupé par le navigateur. Touchez « Activer le son ».', { erreur: true });
  }
  etat.imageRecue = true;
  peindreLegende();
}

function creerConnexion(pairId, vocal) {
  const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
  const lien = { pc, attente: [] };
  pc.onicecandidate = (ev) => {
    if (!ev.candidate) return;
    const charge = { kind: 'glace', candidate: ev.candidate.toJSON() };
    if (vocal) envoyer({ type: 'voix-signal', pour: pairId, charge });
    else envoyer({ type: 'signal', eclatId: etat.eclatId, pour: pairId, charge });
  };
  return lien;
}

function fermerLien(id) {
  const lien = etat.liens.get(id);
  if (!lien) return;
  try { lien.pc.close(); } catch { /* déjà clos */ }
  etat.liens.delete(id);
}

function fermerLienVoix(id) {
  const lien = etat.liensVoix.get(id);
  if (!lien) return;
  try { lien.pc.close(); } catch { /* déjà clos */ }
  lien.audio?.remove();
  etat.liensVoix.delete(id);
}

async function viderGlace(lien) {
  while (lien.attente.length) {
    const candidat = lien.attente.shift();
    try { await lien.pc.addIceCandidate(candidat); } catch { /* candidat tardif */ }
  }
}

async function appliquer(lien, charge, pairId, vocal) {
  if (charge.kind === 'glace') {
    if (!lien.pc.remoteDescription) {
      lien.attente.push(charge.candidate);
      return;
    }
    try { await lien.pc.addIceCandidate(charge.candidate); } catch { /* déjà appliqué */ }
    return;
  }
  if (charge.kind === 'offre') {
    await lien.pc.setRemoteDescription({ type: 'offer', sdp: charge.sdp });
    await viderGlace(lien);
    const reponse = await lien.pc.createAnswer();
    await lien.pc.setLocalDescription(reponse);
    const chargeReponse = { kind: 'reponse', sdp: lien.pc.localDescription.sdp };
    if (vocal) envoyer({ type: 'voix-signal', pour: pairId, charge: chargeReponse });
    else envoyer({ type: 'signal', eclatId: etat.eclatId, pour: pairId, charge: chargeReponse });
    return;
  }
  if (charge.kind === 'reponse') {
    await lien.pc.setRemoteDescription({ type: 'answer', sdp: charge.sdp });
    await viderGlace(lien);
  }
}

async function offrir(spectateurId) {
  fermerLien(spectateurId);
  if (!etat.fluxLocal) return;
  const lien = creerConnexion(spectateurId, false);
  if (!etat.tient) {
    lien.pc.ontrack = (ev) => {
      lireDistant(ev.streams[0] || new MediaStream([ev.track]));
    };
  }
  for (const piste of etat.fluxLocal.getTracks()) lien.pc.addTrack(piste, etat.fluxLocal);
  etat.liens.set(spectateurId, lien);
  const offre = await lien.pc.createOffer();
  await lien.pc.setLocalDescription(offre);
  envoyer({
    type: 'signal',
    eclatId: etat.eclatId,
    pour: spectateurId,
    charge: { kind: 'offre', sdp: lien.pc.localDescription.sdp },
  });
}

async function recevoirSignal(de, charge) {
  if (!charge || typeof charge !== 'object') return;
  if (etat.tient) {
    const lien = etat.liens.get(de);
    if (!lien) return;
    await appliquer(lien, charge, de, false);
    return;
  }
  if (!etat.assis) return;
  let lien = etat.liens.get(de);
  if (!lien && charge.kind === 'offre') {
    lien = creerConnexion(de, false);
    lien.pc.ontrack = (ev) => {
      lireDistant(ev.streams[0] || new MediaStream([ev.track]));
    };
    etat.liens.set(de, lien);
  }
  if (!lien) return;
  await appliquer(lien, charge, de, false);
}

async function offrirVoix(pairId) {
  fermerLienVoix(pairId);
  if (!etat.fluxVoix) return;
  const lien = preparerLienVoix(pairId);
  const offre = await lien.pc.createOffer();
  await lien.pc.setLocalDescription(offre);
  envoyer({
    type: 'voix-signal',
    pour: pairId,
    charge: { kind: 'offre', sdp: lien.pc.localDescription.sdp },
  });
}

function preparerLienVoix(pairId) {
  const lien = creerConnexion(pairId, true);
  const audio = document.createElement('audio');
  audio.autoplay = true;
  document.getElementById('sons')?.append(audio);
  lien.audio = audio;
  lien.pc.ontrack = (ev) => {
    audio.srcObject = ev.streams[0] || new MediaStream([ev.track]);
    audio.play().catch(() => {});
  };
  for (const piste of etat.fluxVoix.getTracks()) lien.pc.addTrack(piste, etat.fluxVoix);
  etat.liensVoix.set(pairId, lien);
  return lien;
}

async function recevoirSignalVoix(de, charge) {
  if (!charge || typeof charge !== 'object' || !etat.enVoix) return;
  let lien = etat.liensVoix.get(de);
  if (!lien && charge.kind === 'offre') lien = preparerLienVoix(de);
  if (!lien) return;
  await appliquer(lien, charge, de, true);
}

async function peindreAmis() {
  document.title = 'Amis · Talk';
  etat.ecran = 'amis';
  etat.amis = await api('/api/amis');
  const avis = etat.avis;
  etat.avis = '';
  document.getElementById('principal').replaceChildren(el('div', { class: 'page' }, [
    el('h1', {}, 'Amis'),
    el('p', { id: 'annonce', class: `annonce${avis ? ' erreur' : ''}`, role: 'status' }, avis),
    el('form', { class: 'composeur', onsubmit: ajouterAmi }, [
      el('label', { class: 'champ' }, [
        el('span', { class: 'etiquette' }, 'Identifiant'),
        el('input', { id: 'identifiant-ami', name: 'identifiant', maxlength: '20', required: true, autocomplete: 'off' }),
      ]),
      el('button', { type: 'submit', class: 'plein', 'data-action': 'ajouter-ami' }, 'Ajouter'),
    ]),
    etat.amis.length
      ? el('ul', { class: 'liste-amis' }, etat.amis.map((ami) => el('li', { class: 'ami' }, [
        el('div', {}, [
          el('strong', {}, ami.nom),
          el('span', { class: 'identifiant' }, ami.identifiant),
        ]),
        el('button', { type: 'button', class: 'texte', 'data-action': 'ecrire', onclick: () => aller(`/messages/${ami.id}`) }, 'Écrire'),
      ])))
      : el('p', { class: 'vide' }, 'Aucun ami pour le moment.'),
  ]));
  peindreOnglets();
  peindreListeGroupes();
}

async function ajouterAmi(e) {
  e.preventDefault();
  const champ = document.getElementById('identifiant-ami');
  try {
    await api('/api/amis', { method: 'POST', body: { identifiant: champ.value } });
    champ.value = '';
    await peindreAmis();
    annoncer('Ami ajouté.');
  } catch (err) {
    annoncer(err.message, { erreur: true });
  }
}

async function peindreMessages(amiId) {
  document.title = 'Messages privés · Talk';
  etat.ecran = 'messages';
  etat.amiId = amiId;
  etat.amis = await api('/api/amis');
  const ami = etat.amis.find((a) => a.id === amiId) || null;
  if (ami) {
    try { etat.prives = await api(`/api/amis/${ami.id}/messages`); } catch { etat.prives = []; }
  } else etat.prives = [];
  document.getElementById('principal').replaceChildren(el('div', { class: 'page' }, [
    el('h1', {}, 'Messages privés'),
    el('p', { id: 'annonce', class: 'annonce', role: 'status' }),
    etat.amis.length
      ? el('div', { class: 'choix-ami' }, etat.amis.map((a) => el('button', {
        type: 'button',
        class: 'choix',
        'data-ami': a.id,
        'aria-current': a.id === amiId ? 'true' : 'false',
        onclick: () => aller(`/messages/${a.id}`),
      }, a.nom)))
      : el('p', { class: 'vide' }, 'Ajoutez un ami pour écrire.'),
    ami ? el('section', { class: 'fil' }, [
      el('h2', {}, ami.nom),
      el('p', { class: 'identifiant' }, ami.identifiant),
      el('div', { id: 'fil-prive', class: 'journal' }),
      formeMessage('corps-prive', 'Message', 'envoyer-prive', envoyerPrive, 'Envoyer'),
    ]) : el('p', {}, 'Choisissez un ami.'),
  ]));
  peindreFilPrive();
  peindreOnglets();
  peindreListeGroupes();
}

function peindreFilPrive() {
  const zone = document.getElementById('fil-prive');
  if (!zone) return;
  if (!etat.prives.length) {
    zone.replaceChildren(el('p', { class: 'vide' }, 'Aucun message.'));
    return;
  }
  zone.replaceChildren(...etat.prives.map((message) => el('article', { class: 'ligne-journal' }, [
    el('time', { class: 'heure', datetime: new Date(message.creeLe).toISOString() }, heure(message.creeLe)),
    el('div', {}, [
      el('div', { class: 'auteur' }, message.auteurNom),
      el('p', { class: 'corps' }, message.corps),
    ]),
  ])));
}

function ajouterPrive(message) {
  if (!message) return;
  const autre = message.deId === etat.moi.id ? message.versId : message.deId;
  if (etat.ecran !== 'messages' || etat.amiId !== autre) return;
  if (etat.prives.some((m) => m.id === message.id)) return;
  etat.prives.push(message);
  etat.prives.sort((a, b) => a.creeLe - b.creeLe);
  peindreFilPrive();
}

async function envoyerPrive(e) {
  e.preventDefault();
  const champ = document.getElementById('corps-prive');
  if (!champ || !etat.amiId) return;
  const corps = champ.value;
  if (!corps.trim()) return;
  champ.disabled = true;
  try {
    const message = await api(`/api/amis/${etat.amiId}/messages`, { method: 'POST', body: { corps } });
    champ.value = '';
    ajouterPrive(message);
  } catch (err) {
    annoncer(err.message, { erreur: true });
  } finally {
    champ.disabled = false;
    champ.focus();
  }
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && etat.membresOuverts) {
    etat.membresOuverts = false;
    peindreMembres();
  }
});
window.addEventListener('popstate', () => { router(); });

async function demarrer() {
  const res = await fetch('/api/moi', { credentials: 'same-origin' });
  if (res.status === 401) etat.moi = null;
  else if (res.ok) etat.moi = await res.json();
  else throw new Error('La session ne se lit pas.');
  if (etat.moi) brancher();
  await router();
}

demarrer().catch((e) => {
  const ecran = document.getElementById('ecran');
  ecran.textContent = e.message || 'Talk n’a pas pu s’ouvrir.';
});
