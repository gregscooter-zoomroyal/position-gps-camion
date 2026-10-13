const etat = {
  moi: null,
  seuil: 'entrer',
  ecran: 'seuil',
  cale: null,
  courantId: null,
  lignes: [],
  houle: [],
  presents: [],
  mode: 'journal',
  quaiOuvert: false,
  tient: false,
  assis: false,
  eclatId: null,
  fluxLocal: null,
  dessin: null,
  liens: new Map(),
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
  ws: null,
  generationRoute: 0,
};

let generationLien = 0;
let essaisLien = 0;

const ROLES = { lampiste: 'Lampiste', veilleur: 'Veilleur', passant: 'Passant' };

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

function marque(grande) {
  const wrap = el(grande ? 'h1' : 'span', { class: grande ? 'marque grande' : 'marque' });
  wrap.append(document.getElementById('modele-lanterne').content.cloneNode(true));
  wrap.append(el('span', { class: 'marque-nom' }, 'Talk'));
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

function phraseQuai() {
  const n = etat.presents.length;
  if (n === 0) return 'Le quai';
  if (n === 1) return '1 à quai';
  return `${n} à quai`;
}

function phraseAssis(n) {
  if (!n) return 'Personne n’est assis';
  if (n === 1) return '1 personne assise';
  return `${n} personnes assises`;
}

function teinte(nom) {
  let h = 0;
  for (const ch of nom) h = (h + ch.charCodeAt(0) * 3) % 5;
  return `teinte-${h}`;
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
    if (etat.quaiOuvert) peindreQuai();
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
  if (msg.type === 'courant' && msg.caleId === etat.cale?.id) {
    if (!etat.cale.courants.some((c) => c.id === msg.courant.id)) etat.cale.courants.push(msg.courant);
    peindreCourants();
    return;
  }
  if (msg.type === 'membres' && msg.caleId === etat.cale?.id) {
    etat.cale.membres = msg.membres;
    const moi = msg.membres.find((m) => m.id === etat.moi.id);
    if (moi) etat.cale.role = moi.role;
    peindreCourants();
    peindreActions();
    if (etat.quaiOuvert) peindreQuai();
    return;
  }
  if (msg.type === 'eclat') {
    if (etat.ecran === 'bassin') peindrePuce(msg.caleId, Boolean(msg.eclat));
    if (etat.cale?.id !== msg.caleId) return;
    const avait = Boolean(etat.cale.eclat);
    etat.cale.eclat = msg.eclat;
    if (!msg.eclat) {
      if (!avait) return;
      couperFlux();
      etat.mode = 'journal';
      etat.nombreAssis = 0;
      annoncer('L’éclat s’est éteint.');
      peindreScene();
      peindreActions();
      return;
    }
    etat.eclatId = msg.eclat.id;
    if (msg.eclat.auteurId === etat.moi.id && etat.fluxLocal) etat.tient = true;
    peindreActions();
    if (etat.mode === 'journal') peindreBande();
    else peindreLegende();
    return;
  }
  if (msg.type === 'assis' && msg.eclatId === etat.cale?.eclat?.id) {
    etat.nombreAssis = msg.nombre || 0;
    peindreCompte();
    return;
  }
  if (msg.type === 'spectateur' && etat.tient && msg.eclatId === etat.eclatId) {
    offrir(msg.spectateurId).catch(() => annoncer('Le lien vers une personne assise a lâché.', { erreur: true }));
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
    etat.avis = 'Vous avez été retiré de la cale.';
    couperFlux();
    etat.cale = null;
    aller('/bassin', { replace: true });
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
    etat.ecran = 'seuil';
    monterSeuil();
    return;
  }
  const match = path.match(/^\/cale\/([0-9a-f-]{36})$/i);
  if (match) {
    if (etat.cale?.id === match[1] && document.getElementById('scene')) return;
    if (etat.cale && etat.cale.id !== match[1]) await quitterCale();
    if (gen !== etat.generationRoute) return;
    try {
      await monterCaleDepuis(match[1]);
    } catch (e) {
      if (gen !== etat.generationRoute) return;
      etat.avis = e.message;
      etat.cale = null;
      history.replaceState({}, '', '/bassin');
      await monterBassin();
    }
    return;
  }
  if (path === '/') history.replaceState({}, '', '/bassin');
  if (etat.cale) await quitterCale();
  if (gen !== etat.generationRoute) return;
  await monterBassin();
}

async function quitterCale() {
  const eclatId = etat.tient ? etat.eclatId : null;
  const assis = etat.assis;
  etat.tient = false;
  etat.assis = false;
  if (eclatId) {
    try { await api(`/api/eclats/${eclatId}/eteindre`, { method: 'POST' }); } catch { /* déjà éteint */ }
  }
  if (assis) envoyer({ type: 'quitter-eclat' });
  envoyer({ type: 'sortir-cale' });
  couperFlux();
  etat.cale = null;
  etat.mode = 'journal';
  etat.quaiOuvert = false;
}

function monterSeuil() {
  document.title = 'Talk';
  etat.ecran = 'seuil';
  const creer = etat.seuil === 'creer';
  const racine = document.getElementById('ecran');
  racine.replaceChildren(el('div', { class: 'seuil' }, [
    el('section', { class: 'nuit' }, [
      el('div', {}, [
        el('p', { class: 'surtitre' }, 'Version 0.1'),
        marque(true),
        el('p', { class: 'promesse' }, 'On se retrouve là où la lumière tient.'),
      ]),
      el('dl', { class: 'lexique' }, [
        ['Cale', 'Le bord où un groupe se tient.'],
        ['Courant', 'Une conversation qui s’écrit, ligne après ligne.'],
        ['Éclat', 'Une personne montre, les autres s’assoient.'],
        ['Houle', 'Les mots dits pendant l’éclat, et pour cet éclat seulement.'],
      ].map(([terme, sens]) => el('div', {}, [el('dt', {}, terme), el('dd', {}, sens)]))),
    ]),
    el('section', { class: 'panneau' }, [
      el('form', { class: 'carte-forme', onsubmit: envoyerSeuil }, [
        el('h2', {}, creer ? 'Créer un compte' : 'Entrer'),
        el('p', { id: 'annonce', class: 'annonce', role: 'status' }),
        creer ? el('label', { class: 'champ' }, [
          el('span', { class: 'etiquette' }, 'Nom visible'),
          el('input', { id: 'nom', name: 'nom', autocomplete: 'nickname', maxlength: '40', required: true }),
        ]) : null,
        el('label', { class: 'champ' }, [
          el('span', { class: 'etiquette' }, 'Identifiant'),
          el('input', { id: 'identifiant', name: 'identifiant', autocomplete: creer ? 'username' : 'username', maxlength: '20', required: true }),
        ]),
        el('label', { class: 'champ' }, [
          el('span', { class: 'etiquette' }, 'Mot de passe'),
          el('input', { id: 'mot-de-passe', name: 'mot-de-passe', type: 'password', autocomplete: creer ? 'new-password' : 'current-password', required: true }),
        ]),
        el('div', { class: 'actions-forme' }, [
          el('button', { type: 'submit', class: 'plein', 'data-action': 'valider-seuil' }, creer ? 'Créer le compte' : 'Entrer'),
          el('button', { type: 'button', class: 'texte', 'data-action': 'basculer', onclick: basculer }, creer ? 'Déjà un compte ? Entrer' : 'Pas encore de compte ? S’inscrire'),
        ]),
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
    await aller('/bassin', { replace: true });
  } catch (err) {
    annoncer(err.message, { erreur: true });
  }
}

async function monterBassin() {
  document.title = 'Talk';
  etat.ecran = 'bassin';
  const cales = await api('/api/bassin');
  const avis = etat.avis;
  etat.avis = '';
  const racine = document.getElementById('ecran');
  racine.replaceChildren(
    el('header', { class: 'entete' }, [
      marque(false),
      el('h1', {}, `Le bassin de ${etat.moi.nom}`),
      el('div', { class: 'entete-actions' }, [
        el('button', { type: 'button', class: 'texte', 'data-action': 'sortir', onclick: sortir }, 'Sortir'),
      ]),
    ]),
    el('main', { class: 'bassin' }, [
      el('div', { class: 'contenu' }, [
        el('p', { id: 'annonce', class: 'annonce', role: 'status' }),
        el('div', { class: 'bandes' }, [
          el('form', { class: 'bande-papier', onsubmit: rejoindreCale }, [
            el('h2', {}, 'J’ai une amarre'),
            el('label', { class: 'champ' }, [
              el('span', { class: 'etiquette' }, 'Code d’amarre'),
              el('input', { id: 'amarre', name: 'amarre', maxlength: '12', autocomplete: 'off', required: true }),
            ]),
            el('button', { type: 'submit', class: 'plein', 'data-action': 'rejoindre' }, 'Rejoindre'),
          ]),
          el('form', { class: 'bande-papier', onsubmit: ouvrirCale }, [
            el('h2', {}, 'Ouvrir une cale'),
            el('label', { class: 'champ' }, [
              el('span', { class: 'etiquette' }, 'Nom de la cale'),
              el('input', { id: 'nom-cale', name: 'nom', maxlength: '48', required: true, placeholder: 'Les pins du soir' }),
            ]),
            el('label', { class: 'champ' }, [
              el('span', { class: 'etiquette' }, 'En quelques mots'),
              el('input', { id: 'resume-cale', name: 'resume', maxlength: '160' }),
            ]),
            el('button', { type: 'submit', class: 'plein', 'data-action': 'ouvrir-cale' }, 'Ouvrir'),
          ]),
        ]),
        cales.length ? el('div', { class: 'grille' }, cales.map(carteCale)) : el('p', { class: 'vide' }, 'Aucune cale. Ouvrez-en une, ou entrez un code d’amarre.'),
      ]),
    ]),
  );
  if (avis) annoncer(avis, { erreur: true });
}

function carteCale(cale) {
  return el('a', {
    class: 'carte-cale',
    href: `/cale/${cale.id}`,
    onclick: (e) => { e.preventDefault(); aller(`/cale/${cale.id}`); },
  }, [
    el('span', { class: `tranche ${teinte(cale.nom)}` }),
    el('span', { class: 'carte-corps' }, [
      el('span', { class: 'carte-nom' }, cale.nom),
      el('span', { class: 'resume' }, cale.resume || 'Sans description'),
      el('span', { class: 'carte-meta' }, [
        el('span', {}, cale.membres > 1 ? `${cale.membres} amarrés` : '1 amarré'),
        el('span', { class: 'role-etiquette' }, ROLES[cale.role] || cale.role),
        el('span', { class: 'puce-eclat', 'data-cale': cale.id, hidden: !cale.eclat }, cale.eclat ? 'Éclat allumé' : ''),
      ]),
    ]),
  ]);
}

function peindrePuce(caleId, allume) {
  const puce = document.querySelector(`.puce-eclat[data-cale="${caleId}"]`);
  if (!puce) return;
  puce.hidden = !allume;
  puce.textContent = allume ? 'Éclat allumé' : '';
}

async function rejoindreCale(e) {
  e.preventDefault();
  try {
    const cale = await api('/api/amarres', { method: 'POST', body: { amarre: document.getElementById('amarre').value } });
    await aller(`/cale/${cale.id}`);
  } catch (err) {
    annoncer(err.message, { erreur: true });
  }
}

async function ouvrirCale(e) {
  e.preventDefault();
  try {
    const cale = await api('/api/cales', {
      method: 'POST',
      body: { nom: document.getElementById('nom-cale').value, resume: document.getElementById('resume-cale').value },
    });
    await aller(`/cale/${cale.id}`);
  } catch (err) {
    annoncer(err.message, { erreur: true });
  }
}

async function sortir() {
  const eclatId = etat.tient ? etat.eclatId : null;
  if (eclatId) {
    try { await api(`/api/eclats/${eclatId}/eteindre`, { method: 'POST' }); } catch { /* déjà éteint */ }
  }
  couperFlux();
  etat.cale = null;
  try { await api('/api/sortie', { method: 'POST' }); } catch { /* session déjà close */ }
  etat.moi = null;
  generationLien += 1;
  try { etat.ws?.close(); } catch { /* déjà fermé */ }
  etat.ws = null;
  history.replaceState({}, '', '/');
  monterSeuil();
}

async function monterCaleDepuis(id) {
  const cale = await api(`/api/cales/${id}`);
  etat.cale = cale;
  etat.ecran = 'cale';
  etat.courantId = cale.courants[0]?.id || null;
  etat.lignes = [];
  etat.houle = [];
  etat.quaiOuvert = false;
  etat.assis = false;
  etat.nombreAssis = 0;
  etat.confirmation = null;
  etat.confirmationHoule = null;
  etat.confirmationRetrait = null;
  etat.confirmerExtinction = false;
  etat.imageRecue = false;
  if (etat.fluxLocal && cale.eclat && cale.eclat.auteurId === etat.moi.id) {
    etat.tient = true;
    etat.eclatId = cale.eclat.id;
    etat.mode = 'horizon';
  } else if (!etat.fluxLocal) {
    etat.tient = false;
    etat.mode = 'journal';
  }
  monterCale();
  if (etat.courantId && etat.mode === 'journal') await chargerCourant(etat.courantId);
  if (etat.mode === 'horizon' && cale.eclat) {
    try { etat.houle = await api(`/api/eclats/${cale.eclat.id}/houle`); } catch { etat.houle = []; }
    peindreHoule();
    attacherLocal();
  }
  envoyer({ type: 'entrer', caleId: id });
  if (etat.tient && etat.eclatId) envoyer({ type: 'tenir', eclatId: etat.eclatId });
}

function monterCale() {
  document.title = `${etat.cale.nom} · Talk`;
  const racine = document.getElementById('ecran');
  racine.replaceChildren(
    el('header', { class: 'mat' }, [
      el('a', { href: '/bassin', onclick: (e) => { e.preventDefault(); aller('/bassin'); } }, 'Bassin'),
      el('div', { class: 'mat-titre' }, [
        el('h1', {}, etat.cale.nom),
        etat.cale.resume ? el('p', { class: 'resume-cale' }, etat.cale.resume) : null,
        el('p', { class: 'ligne-amarre' }, [
          'Amarre ',
          el('strong', { class: 'amarre', id: 'code-amarre' }, etat.cale.amarre),
          ' ',
          el('button', { type: 'button', class: 'texte', onclick: copierAmarre }, 'Copier'),
        ]),
        el('p', { id: 'etat-lien', class: 'etat-lien', hidden: true }),
      ]),
      el('div', { id: 'actions-mat', class: 'mat-actions' }),
    ]),
    el('main', { id: 'scene', class: 'scene' }),
    el('section', { id: 'quai', class: 'quai', hidden: true }),
  );
  peindreActions();
  peindreScene();
  peindreLien();
  peindreQuai();
}

function peindreLien() {
  const zone = document.getElementById('etat-lien');
  if (!zone) return;
  const coupe = etat.lien === 'coupe';
  zone.hidden = !coupe;
  zone.textContent = coupe ? 'Lien coupé — Talk renoue…' : '';
}

function peindreCompte() {
  const bouton = document.getElementById('compte-quai');
  if (bouton) bouton.textContent = phraseQuai();
  const assis = document.getElementById('compte-assis');
  if (assis) assis.textContent = phraseAssis(etat.nombreAssis);
}

function peindreActions() {
  const zone = document.getElementById('actions-mat');
  if (!zone || !etat.cale) return;
  const boutons = [
    el('button', { type: 'button', class: 'texte', id: 'compte-quai', onclick: ouvrirQuai }, phraseQuai()),
  ];
  const eclat = etat.cale.eclat;
  if (!eclat) {
    boutons.push(el('button', { type: 'button', class: 'plein', 'data-action': 'allumer', onclick: () => allumer(false) }, 'Allumer l’éclat'));
    if (etat.lentilleRefusee) {
      boutons.push(el('button', { type: 'button', class: 'texte', 'data-action': 'sans-lentille', onclick: () => allumer(true) }, 'Sans lentille'));
    }
  } else if (eclat.auteurId === etat.moi.id && !etat.tient) {
    boutons.push(el('button', { type: 'button', class: 'plein', 'data-action': 'reprendre', onclick: () => reprendre(false) }, 'Reprendre l’éclat'));
    if (etat.lentilleRefusee) {
      boutons.push(el('button', { type: 'button', class: 'texte', 'data-action': 'reprendre-sans', onclick: () => reprendre(true) }, 'Reprendre sans lentille'));
    }
    boutons.push(boutonEteindre());
  } else if (eclat.auteurId === etat.moi.id || etat.cale.role !== 'passant') {
    boutons.push(boutonEteindre());
  }
  boutons.push(el('button', { type: 'button', class: 'texte', 'data-action': 'sortir', onclick: sortir }, 'Sortir'));
  zone.replaceChildren(...boutons);
}

function boutonEteindre() {
  return el('button', {
    type: 'button',
    class: 'plein',
    'data-action': 'eteindre',
    onclick: demanderEteindre,
  }, etat.confirmerExtinction ? 'Confirmer l’extinction' : 'Éteindre');
}

function peindreScene() {
  const scene = document.getElementById('scene');
  if (!scene) return;
  if (etat.mode === 'horizon') {
    const video = el('video', { id: 'flux' });
    video.autoplay = true;
    video.playsInline = true;
    video.muted = Boolean(etat.tient);
    scene.replaceChildren(
      el('section', { class: 'horizon' }, [
        video,
        el('div', { class: 'horizon-legende', id: 'legende' }),
      ]),
      el('div', { class: 'colonne' }, [
        el('p', { id: 'annonce', class: `annonce${etat.annonceErreur ? ' erreur' : ''}`, role: 'status' }, etat.annonce),
        el('h2', {}, 'Houle'),
        el('div', { id: 'houle', class: 'journal' }),
        formeMessage('corps-houle', 'Dire dans la houle', 'poser-houle', poserHoule),
      ]),
    );
    peindreLegende();
    peindreHoule();
    if (etat.tient) attacherLocal();
    return;
  }
  scene.replaceChildren(el('div', { class: 'colonne' }, [
    el('nav', { id: 'nav-courants', class: 'courants', 'aria-label': 'Courants' }),
    el('div', { id: 'bande' }),
    el('p', { id: 'annonce', class: `annonce${etat.annonceErreur ? ' erreur' : ''}`, role: 'status' }, etat.annonce),
    el('div', { id: 'journal', class: 'journal' }),
    formeMessage('corps', 'Écrire dans ce courant', 'poser', poserLigne),
  ]));
  peindreCourants();
  peindreBande();
  peindreLignes();
}

function formeMessage(id, etiquette, action, onSubmit) {
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
    el('button', { type: 'submit', class: 'plein', 'data-action': action }, id === 'corps' ? 'Poser la ligne' : 'Lancer'),
  ]);
}

function peindreCourants() {
  const nav = document.getElementById('nav-courants');
  if (!nav || !etat.cale) return;
  const boutons = etat.cale.courants.map((courant) => el('button', {
    type: 'button',
    class: 'courant',
    'aria-current': courant.id === etat.courantId ? 'true' : 'false',
    onclick: () => chargerCourant(courant.id),
  }, courant.nom));
  if (etat.cale.role !== 'passant') {
    boutons.push(el('form', { class: 'forme-courant', onsubmit: ajouterCourant }, [
      el('input', { id: 'nom-courant', maxlength: '32', placeholder: 'Nouveau courant', 'aria-label': 'Nom du courant' }),
      el('button', { type: 'submit', class: 'texte' }, 'Ajouter'),
    ]));
  }
  nav.replaceChildren(...boutons);
}

function peindreBande() {
  const bande = document.getElementById('bande');
  if (!bande || !etat.cale) return;
  bande.replaceChildren();
  const eclat = etat.cale.eclat;
  if (!eclat) return;
  if (eclat.auteurId === etat.moi.id && etat.tient) {
    bande.append(el('div', { class: 'bande' }, [
      el('p', {}, `Vous tenez l’éclat. ${phraseAssis(etat.nombreAssis)}`),
      el('button', { type: 'button', class: 'plein', onclick: ouvrirHorizon }, 'Revenir à l’image'),
    ]));
    return;
  }
  if (eclat.auteurId === etat.moi.id) {
    bande.append(el('div', { class: 'bande' }, [
      el('p', {}, 'L’éclat est encore à votre nom.'),
      el('button', { type: 'button', class: 'plein', 'data-action': 'reprendre', onclick: () => reprendre(false) }, 'Reprendre l’éclat'),
    ]));
    return;
  }
  bande.append(el('div', { class: 'bande' }, [
    el('p', {}, `${eclat.auteurNom} tient l’éclat. ${phraseAssis(etat.nombreAssis)}`),
    el('button', { type: 'button', class: 'plein', 'data-action': 'asseoir', onclick: asseoir }, 'S’asseoir'),
  ]));
}

function peindreLegende() {
  const legende = document.getElementById('legende');
  if (!legende || !etat.cale?.eclat) return;
  const eclat = etat.cale.eclat;
  const morceaux = [];
  if (etat.tient) {
    morceaux.push(el('p', {}, [
      'Vous tenez l’éclat. ',
      el('span', { id: 'compte-assis' }, phraseAssis(etat.nombreAssis)),
    ]));
    if (etat.fluxLocal?.getAudioTracks().length) {
      morceaux.push(el('button', { type: 'button', class: 'texte', onclick: couvrirSon }, etat.sonCouvert ? 'Rendre le son' : 'Couvrir le son'));
    }
  } else {
    const etatImage = etat.imageRecue ? 'Image reçue' : 'On relie l’image…';
    morceaux.push(el('p', {}, `${eclat.auteurNom} tient l’éclat — ${etatImage}. `));
    if (etat.sonBloque) morceaux.push(el('button', { type: 'button', class: 'texte', onclick: activerSon }, 'Activer le son'));
  }
  morceaux.push(el('button', { type: 'button', class: 'texte', 'data-action': 'journal', onclick: retourJournal }, 'Retourner aux courants'));
  legende.replaceChildren(...morceaux);
}

function peindreLignes() {
  const journal = document.getElementById('journal');
  if (!journal) return;
  if (!etat.lignes.length) {
    journal.replaceChildren(el('p', { class: 'vide' }, 'Aucune ligne dans ce courant.'));
    return;
  }
  journal.replaceChildren(...etat.lignes.map((ligne) => ligneJournal(ligne, {
    confirmer: etat.confirmation === ligne.id,
    action: () => demanderRayer(ligne),
  })));
}

function peindreHoule() {
  const zone = document.getElementById('houle');
  if (!zone) return;
  if (!etat.houle.length) {
    zone.replaceChildren(el('p', { class: 'vide' }, 'La houle est encore calme.'));
    return;
  }
  zone.replaceChildren(...etat.houle.map((ligne) => ligneJournal(ligne, {
    confirmer: etat.confirmationHoule === ligne.id,
    action: () => demanderRayerHoule(ligne),
  })));
}

function ligneJournal(ligne, { confirmer, action }) {
  const peut = ligne.auteurId === etat.moi.id || etat.cale.role === 'lampiste' || etat.cale.role === 'veilleur';
  return el('article', { class: 'ligne-journal' }, [
    el('time', { class: 'heure', datetime: new Date(ligne.creeLe).toISOString() }, heure(ligne.creeLe)),
    el('div', {}, [
      el('div', { class: 'auteur' }, ligne.auteurNom),
      el('p', { class: 'corps' }, ligne.corps),
      peut ? el('button', { type: 'button', class: 'texte', 'data-action': 'rayer', onclick: action }, confirmer ? 'Confirmer' : 'Rayer') : null,
    ]),
  ]);
}

async function chargerCourant(id) {
  etat.courantId = id;
  etat.confirmation = null;
  etat.lignes = await api(`/api/courants/${id}/lignes`);
  peindreCourants();
  peindreLignes();
  window.scrollTo(0, document.body.scrollHeight);
}

async function ajouterCourant(e) {
  e.preventDefault();
  const champ = document.getElementById('nom-courant');
  try {
    const courant = await api(`/api/cales/${etat.cale.id}/courants`, { method: 'POST', body: { nom: champ.value } });
    if (!etat.cale.courants.some((c) => c.id === courant.id)) etat.cale.courants.push(courant);
    await chargerCourant(courant.id);
  } catch (err) {
    annoncer(err.message, { erreur: true });
  }
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
  const suivre = presDuBas();
  etat.houle.push(ligne);
  etat.houle.sort((a, b) => a.creeLe - b.creeLe);
  if (document.getElementById('houle')) {
    peindreHoule();
    if (suivre) window.scrollTo(0, document.body.scrollHeight);
  }
}

function retirerLigne(id) {
  etat.lignes = etat.lignes.filter((l) => l.id !== id);
  if (etat.confirmation === id) etat.confirmation = null;
  if (document.getElementById('journal')) peindreLignes();
}

function retirerHoule(id) {
  etat.houle = etat.houle.filter((l) => l.id !== id);
  if (etat.confirmationHoule === id) etat.confirmationHoule = null;
  if (document.getElementById('houle')) peindreHoule();
}

async function poserLigne(e) {
  e.preventDefault();
  const champ = document.getElementById('corps');
  const corps = champ.value;
  if (!corps.trim()) return;
  champ.disabled = true;
  try {
    const ligne = await api(`/api/courants/${etat.courantId}/lignes`, { method: 'POST', body: { corps } });
    champ.value = '';
    ajouterLigne(ligne);
    window.scrollTo(0, document.body.scrollHeight);
  } catch (err) {
    annoncer(err.message, { erreur: true });
  } finally {
    champ.disabled = false;
    champ.focus();
  }
}

async function poserHoule(e) {
  e.preventDefault();
  const champ = document.getElementById('corps-houle');
  const eclatId = etat.cale?.eclat?.id;
  if (!eclatId || !champ) return;
  const corps = champ.value;
  if (!corps.trim()) return;
  champ.disabled = true;
  try {
    const ligne = await api(`/api/eclats/${eclatId}/houle`, { method: 'POST', body: { corps } });
    champ.value = '';
    ajouterHoule(ligne);
    window.scrollTo(0, document.body.scrollHeight);
  } catch (err) {
    annoncer(err.message, { erreur: true });
  } finally {
    champ.disabled = false;
    champ.focus();
  }
}

async function demanderRayer(ligne) {
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

async function demanderRayerHoule(ligne) {
  if (etat.confirmationHoule !== ligne.id) {
    etat.confirmationHoule = ligne.id;
    peindreHoule();
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

function ouvrirQuai() {
  etat.quaiOuvert = !etat.quaiOuvert;
  peindreQuai();
}

function peindreQuai() {
  const quai = document.getElementById('quai');
  if (!quai || !etat.cale) return;
  if (!etat.quaiOuvert) {
    quai.hidden = true;
    quai.replaceChildren();
    return;
  }
  quai.hidden = false;
  const presents = new Set(etat.presents.map((p) => p.id));
  quai.replaceChildren(
    el('div', { class: 'quai-entete' }, [
      el('h2', {}, 'Le quai'),
      el('button', { type: 'button', class: 'texte', 'data-action': 'fermer-quai', onclick: ouvrirQuai }, 'Fermer'),
    ]),
    el('ul', {}, etat.cale.membres.map((membre) => el('li', { class: 'membre', 'data-membre': membre.id }, [
      el('span', { class: presents.has(membre.id) ? 'diamant quai-la' : 'diamant', title: presents.has(membre.id) ? 'À quai' : 'Au large' }),
      el('div', {}, [
        el('strong', {}, membre.nom),
        el('span', { class: 'identifiant' }, membre.identifiant),
        el('span', { class: 'role-etiquette' }, ROLES[membre.role] || membre.role),
      ]),
      el('div', { class: 'membre-actions' }, actionsMembre(membre)),
    ]))),
  );
  document.querySelector('[data-action=fermer-quai]')?.focus();
}

function actionsMembre(membre) {
  const actions = [];
  if (etat.cale.role === 'lampiste' && membre.role !== 'lampiste') {
    actions.push(el('select', {
      'aria-label': `Rôle de ${membre.nom}`,
      onchange: (e) => changerRole(membre.id, e.target.value),
    }, [
      el('option', { value: 'passant', selected: membre.role === 'passant' }, 'Passant'),
      el('option', { value: 'veilleur', selected: membre.role === 'veilleur' }, 'Veilleur'),
    ]));
  }
  if (peutRetirer(membre)) {
    const confirmer = etat.confirmationRetrait === membre.id;
    actions.push(el('button', {
      type: 'button',
      class: 'texte',
      'data-action': 'retirer',
      onclick: () => retirerMembre(membre.id),
    }, confirmer ? 'Confirmer' : 'Retirer'));
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
    peindreQuai();
    peindreCourants();
  } catch (err) {
    annoncer(err.message, { erreur: true });
    peindreQuai();
  }
}

async function retirerMembre(userId) {
  if (etat.confirmationRetrait !== userId) {
    etat.confirmationRetrait = userId;
    peindreQuai();
    return;
  }
  etat.confirmationRetrait = null;
  try {
    await api(`/api/cales/${etat.cale.id}/membres/${userId}`, { method: 'DELETE' });
    etat.cale.membres = etat.cale.membres.filter((m) => m.id !== userId);
    peindreQuai();
  } catch (err) {
    annoncer(err.message, { erreur: true });
    peindreQuai();
  }
}

async function copierAmarre() {
  try {
    await navigator.clipboard.writeText(etat.cale.amarre);
    annoncer('Amarre copiée.');
  } catch {
    annoncer(`Amarre : ${etat.cale.amarre}`);
  }
}

async function demanderEteindre() {
  if (!etat.confirmerExtinction) {
    etat.confirmerExtinction = true;
    peindreActions();
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
  peindreActions();
}

function ouvrirHorizon() {
  etat.mode = 'horizon';
  peindreScene();
}

function retourJournal() {
  if (etat.assis && !etat.tient) {
    etat.assis = false;
    envoyer({ type: 'quitter-eclat' });
    for (const id of [...etat.liens.keys()]) fermerLien(id);
  }
  etat.mode = 'journal';
  peindreActions();
  peindreScene();
}

async function obtenirFlux(sansLentille) {
  if (sansLentille) return eclatDessine(etat.moi.nom);
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: true,
  });
  return { stream, stop() {} };
}

function refusLentille(e) {
  return ['NotAllowedError', 'NotFoundError', 'NotReadableError', 'OverconstrainedError', 'SecurityError'].includes(e?.name);
}

async function allumer(sansLentille) {
  if (etat.envoi) return;
  etat.envoi = true;
  annoncer('');
  try {
    const media = await obtenirFlux(sansLentille);
    etat.fluxLocal = media.stream;
    etat.dessin = media;
    etat.tient = true;
    const eclat = await api(`/api/cales/${etat.cale.id}/eclat`, { method: 'POST' });
    etat.cale.eclat = eclat;
    etat.eclatId = eclat.id;
    etat.mode = 'horizon';
    etat.houle = [];
    etat.lentilleRefusee = false;
    etat.imageRecue = true;
    envoyer({ type: 'tenir', eclatId: eclat.id });
    peindreActions();
    peindreScene();
  } catch (e) {
    couperFlux();
    if (refusLentille(e)) {
      etat.lentilleRefusee = true;
      annoncer('La lentille ne s’ouvre pas. Vous pouvez allumer un éclat dessiné.', { erreur: true });
    } else annoncer(e.message || 'Impossible d’allumer.', { erreur: true });
    peindreActions();
    if (etat.mode === 'journal') peindreBande();
  } finally {
    etat.envoi = false;
  }
}

async function reprendre(sansLentille) {
  if (etat.envoi || !etat.cale?.eclat) return;
  etat.envoi = true;
  try {
    const media = await obtenirFlux(sansLentille);
    etat.fluxLocal = media.stream;
    etat.dessin = media;
    etat.tient = true;
    etat.eclatId = etat.cale.eclat.id;
    etat.mode = 'horizon';
    etat.lentilleRefusee = false;
    try { etat.houle = await api(`/api/eclats/${etat.eclatId}/houle`); } catch { etat.houle = []; }
    envoyer({ type: 'tenir', eclatId: etat.eclatId });
    peindreActions();
    peindreScene();
  } catch (e) {
    couperFlux();
    if (refusLentille(e)) {
      etat.lentilleRefusee = true;
      annoncer('La lentille ne s’ouvre pas.', { erreur: true });
    } else annoncer(e.message || 'Impossible de reprendre.', { erreur: true });
    peindreActions();
  } finally {
    etat.envoi = false;
  }
}

async function asseoir() {
  const eclat = etat.cale?.eclat;
  if (!eclat || eclat.auteurId === etat.moi.id) return;
  etat.assis = true;
  etat.eclatId = eclat.id;
  etat.mode = 'horizon';
  etat.imageRecue = false;
  try { etat.houle = await api(`/api/eclats/${eclat.id}/houle`); } catch { etat.houle = []; }
  peindreScene();
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

function eclatDessine(nom) {
  const toile = document.createElement('canvas');
  toile.width = 1280;
  toile.height = 720;
  const ctx = toile.getContext('2d');
  let frame = 0;
  let raf = 0;
  const tick = () => {
    frame += 1;
    ctx.fillStyle = '#132e2b';
    ctx.fillRect(0, 0, 1280, 720);
    ctx.strokeStyle = 'rgba(244, 239, 230, 0.28)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i += 1) {
      ctx.beginPath();
      ctx.arc(980, 430, 70 + i * 46 + (frame % 40), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = '#c4622d';
    ctx.beginPath();
    ctx.arc(980, 430, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f4efe6';
    ctx.font = '64px Georgia, serif';
    ctx.fillText(nom, 72, 330);
    ctx.font = '28px sans-serif';
    ctx.fillStyle = '#e7dcc8';
    ctx.fillText('Éclat sans lentille', 72, 390);
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
    annoncer('Le navigateur garde le son couvert.', { erreur: true });
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
    annoncer('Le son est couvert par le navigateur. Touchez « Activer le son ».', { erreur: true });
  }
  etat.imageRecue = true;
  peindreLegende();
}

function creerLien(pairId) {
  const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
  const lien = { pc, attente: [] };
  pc.onicecandidate = (ev) => {
    if (!ev.candidate) return;
    envoyer({
      type: 'signal',
      eclatId: etat.eclatId,
      pour: pairId,
      charge: { kind: 'glace', candidate: ev.candidate.toJSON() },
    });
  };
  if (!etat.tient) {
    pc.ontrack = (ev) => {
      lireDistant(ev.streams[0] || new MediaStream([ev.track]));
    };
  }
  return lien;
}

function fermerLien(id) {
  const lien = etat.liens.get(id);
  if (!lien) return;
  try { lien.pc.close(); } catch { /* déjà clos */ }
  etat.liens.delete(id);
}

async function viderGlace(lien) {
  while (lien.attente.length) {
    const candidat = lien.attente.shift();
    try { await lien.pc.addIceCandidate(candidat); } catch { /* candidat tardif */ }
  }
}

async function appliquer(lien, charge, pairId) {
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
    envoyer({
      type: 'signal',
      eclatId: etat.eclatId,
      pour: pairId,
      charge: { kind: 'reponse', sdp: lien.pc.localDescription.sdp },
    });
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
  const lien = creerLien(spectateurId);
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
    await appliquer(lien, charge, de);
    return;
  }
  if (!etat.assis) return;
  let lien = etat.liens.get(de);
  if (!lien && charge.kind === 'offre') {
    lien = creerLien(de);
    etat.liens.set(de, lien);
  }
  if (!lien) return;
  await appliquer(lien, charge, de);
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && etat.quaiOuvert) {
    etat.quaiOuvert = false;
    peindreQuai();
  }
});
window.addEventListener('popstate', () => { router(); });

async function demarrer() {
  const res = await fetch('/api/moi', { credentials: 'same-origin' });
  if (res.status === 401) etat.moi = null;
  else if (res.ok) etat.moi = await res.json();
  else throw new Error('Session illisible.');
  if (etat.moi) brancher();
  await router();
}

demarrer().catch((e) => {
  const ecran = document.getElementById('ecran');
  ecran.textContent = e.message || 'Talk n’a pas pu s’ouvrir.';
});
