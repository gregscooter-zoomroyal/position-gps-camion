import assert from 'node:assert/strict';
import test from 'node:test';
import { WebSocket } from 'ws';
import { creerApplication } from '../src/app.js';

function client(baseUrl) {
  let cookie = '';
  return {
    cookie: () => cookie,
    async appel(path, opts = {}) {
      const headers = {};
      if (opts.body) headers['content-type'] = 'application/json';
      if (cookie) headers.cookie = cookie;
      const res = await fetch(baseUrl + path, {
        method: opts.method || 'GET',
        headers,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });
      const lignes = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
      for (const ligne of lignes) {
        const pair = ligne.split(';')[0];
        if (!pair.startsWith('talk_session=')) continue;
        cookie = pair.endsWith('talk_session=') ? '' : pair;
      }
      const texte = await res.text();
      return { status: res.status, json: texte ? JSON.parse(texte) : null };
    },
  };
}

function ouvrirLien(port, cookie) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/temps-reel`, { headers: { cookie } });
    const file = [];
    const attentes = [];
    ws.on('message', (buf) => {
      const msg = JSON.parse(buf.toString());
      const i = attentes.findIndex((a) => a.test(msg));
      if (i >= 0) attentes.splice(i, 1)[0].fait(msg);
      else file.push(msg);
    });
    function oublier() { file.length = 0; }
    function attendre(type, pred = () => true) {
      const testMsg = (m) => m.type === type && pred(m);
      const idx = file.findIndex(testMsg);
      if (idx >= 0) return Promise.resolve(file.splice(idx, 1)[0]);
      return new Promise((ok, ko) => {
        const timer = setTimeout(() => ko(new Error(`délai dépassé pour ${type}`)), 5000);
        attentes.push({
          test: testMsg,
          fait(msg) {
            clearTimeout(timer);
            ok(msg);
          },
        });
      });
    }
    ws.on('open', () => resolve({ ws, attendre, oublier }));
    ws.on('error', reject);
  });
}

test('parcours Talk', async (t) => {
  const app = creerApplication({ dbPath: ':memory:' });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const port = app.server.address().port;
  const url = `http://127.0.0.1:${port}`;
  t.after(async () => { await app.close(); });

  const sante = await fetch(`${url}/api/sante`);
  assert.equal((await sante.json()).nom, 'Talk');

  const sceau = Date.now().toString(36).slice(-6);
  const a = client(url);
  const b = client(url);
  const c = client(url);
  const mot = 'phare-du-soir';

  const mauvais = await a.appel('/api/connexion', { method: 'POST', body: { identifiant: 'personne', motDePasse: mot } });
  assert.equal(mauvais.status, 401);

  const court = await a.appel('/api/inscription', { method: 'POST', body: { identifiant: 'ab', nom: 'Gregory', motDePasse: 'court' } });
  assert.equal(court.status, 400);

  const inscritA = await a.appel('/api/inscription', {
    method: 'POST',
    body: { identifiant: `greg${sceau}`, nom: 'Gregory', motDePasse: mot },
  });
  assert.equal(inscritA.status, 201);
  assert.equal(inscritA.json.nom, 'Gregory');

  const doublon = await b.appel('/api/inscription', {
    method: 'POST',
    body: { identifiant: `greg${sceau}`, nom: 'Autre', motDePasse: mot },
  });
  assert.equal(doublon.status, 409);

  const inscritB = await b.appel('/api/inscription', {
    method: 'POST',
    body: { identifiant: `cami${sceau}`, nom: 'Camille', motDePasse: mot },
  });
  assert.equal(inscritB.status, 201);
  const inscritC = await c.appel('/api/inscription', {
    method: 'POST',
    body: { identifiant: `noe${sceau}`, nom: 'Noé', motDePasse: mot },
  });
  assert.equal(inscritC.status, 201);

  const moi = await a.appel('/api/moi');
  assert.equal(moi.json.nom, 'Gregory');

  const cale = await a.appel('/api/cales', {
    method: 'POST',
    body: { nom: 'Les pins du soir', resume: 'Un bord pour se parler.' },
  });
  assert.equal(cale.status, 201);
  assert.equal(cale.json.role, 'lampiste');
  assert.equal(cale.json.courants[0].nom, 'Conversation');
  assert.equal(cale.json.amarre.length, 6);

  const refus = await c.appel(`/api/cales/${cale.json.id}`);
  assert.equal(refus.status, 403);

  const rejoint = await b.appel('/api/amarres', { method: 'POST', body: { amarre: cale.json.amarre } });
  assert.equal(rejoint.status, 200);
  assert.equal(rejoint.json.role, 'passant');
  await c.appel('/api/amarres', { method: 'POST', body: { amarre: cale.json.amarre.toLowerCase() } });

  const courantId = cale.json.courants[0].id;
  const lienA = await ouvrirLien(port, a.cookie());
  const lienB = await ouvrirLien(port, b.cookie());
  const lienC = await ouvrirLien(port, c.cookie());
  const quaiPlein = lienA.attendre('quai', (m) => m.presents.length >= 3);
  lienA.ws.send(JSON.stringify({ type: 'entrer', caleId: cale.json.id }));
  lienB.ws.send(JSON.stringify({ type: 'entrer', caleId: cale.json.id }));
  lienC.ws.send(JSON.stringify({ type: 'entrer', caleId: cale.json.id }));
  const quai = await quaiPlein;
  assert.equal(quai.presents.length, 3);

  const ecoute = lienB.attendre('ligne');
  const ligne = await a.appel(`/api/courants/${courantId}/lignes`, { method: 'POST', body: { corps: 'Le quai est ouvert.' } });
  assert.equal(ligne.status, 201);
  assert.equal((await ecoute).ligne.corps, 'Le quai est ouvert.');

  const interdit = await b.appel(`/api/lignes/${ligne.json.id}`, { method: 'DELETE' });
  assert.equal(interdit.status, 403);

  const veille = await a.appel(`/api/cales/${cale.json.id}/membres/${inscritB.json.id}`, { method: 'POST', body: { role: 'veilleur' } });
  assert.equal(veille.status, 200);
  const rayee = lienA.attendre('ligne-rayee');
  const suppression = await b.appel(`/api/lignes/${ligne.json.id}`, { method: 'DELETE' });
  assert.equal(suppression.status, 200);
  assert.equal((await rayee).ligneId, ligne.json.id);

  await a.appel(`/api/cales/${cale.json.id}/membres/${inscritB.json.id}`, { method: 'POST', body: { role: 'passant' } });
  const trop = await b.appel(`/api/cales/${cale.json.id}/membres/${inscritC.json.id}`, { method: 'DELETE' });
  assert.equal(trop.status, 403);

  const depart = lienC.attendre('retire');
  const retrait = await a.appel(`/api/cales/${cale.json.id}/membres/${inscritC.json.id}`, { method: 'DELETE' });
  assert.equal(retrait.status, 200);
  assert.equal((await depart).caleId, cale.json.id);
  const apres = await c.appel(`/api/courants/${courantId}/lignes`, { method: 'POST', body: { corps: 'Je ne suis plus là.' } });
  assert.equal(apres.status, 403);

  const sansLien = await c.appel(`/api/cales/${cale.json.id}/eclat`, { method: 'POST' });
  assert.equal(sansLien.status, 403);

  const allume = lienB.attendre('eclat', (m) => m.eclat && m.eclat.auteurNom === 'Gregory');
  const eclat = await a.appel(`/api/cales/${cale.json.id}/eclat`, { method: 'POST' });
  assert.equal(eclat.status, 201);
  assert.equal((await allume).eclat.id, eclat.json.id);
  const second = await b.appel(`/api/cales/${cale.json.id}/eclat`, { method: 'POST' });
  assert.equal(second.status, 409);

  const houleEcoute = lienA.attendre('houle');
  const parole = await b.appel(`/api/eclats/${eclat.json.id}/houle`, { method: 'POST', body: { corps: 'On vous voit.' } });
  assert.equal(parole.status, 201);
  assert.equal((await houleEcoute).ligne.corps, 'On vous voit.');
  const houleRayee = lienB.attendre('houle-rayee');
  assert.equal((await a.appel(`/api/houle/${parole.json.id}`, { method: 'DELETE' })).status, 200);
  assert.equal((await houleRayee).ligneId, parole.json.id);

  lienB.oublier();
  const eteint = lienB.attendre('eclat', (m) => m.eclat === null);
  assert.equal((await a.appel(`/api/eclats/${eclat.json.id}/eteindre`, { method: 'POST' })).status, 200);
  assert.equal((await eteint).eclat, null);
  const tard = await b.appel(`/api/eclats/${eclat.json.id}/houle`, { method: 'POST', body: { corps: 'Trop tard.' } });
  assert.equal(tard.status, 410);

  const bassin = await a.appel('/api/bassin');
  assert.equal(bassin.json[0].nom, 'Les pins du soir');
  assert.equal(bassin.json[0].eclat, false);

  lienA.oublier();
  const voixPleine = lienA.attendre('voix', (m) => m.personnes && m.personnes.length === 2);
  lienA.ws.send(JSON.stringify({ type: 'voix-rejoindre' }));
  lienB.ws.send(JSON.stringify({ type: 'voix-rejoindre' }));
  const voix = await voixPleine;
  assert.equal(voix.personnes.length, 2);

  const soi = await a.appel('/api/amis', { method: 'POST', body: { identifiant: inscritA.json.identifiant } });
  assert.equal(soi.status, 400);
  const inconnu = await a.appel('/api/amis', { method: 'POST', body: { identifiant: 'personne-absente' } });
  assert.equal(inconnu.status, 404);
  const ajout = await a.appel('/api/amis', { method: 'POST', body: { identifiant: inscritB.json.identifiant } });
  assert.equal(ajout.status, 201);
  assert.equal(ajout.json.nom, 'Camille');
  const liste = await b.appel('/api/amis');
  assert.equal(liste.json.some((ami) => ami.identifiant === inscritA.json.identifiant), true);
  const ecoutePrive = lienB.attendre('prive');
  const prive = await a.appel(`/api/amis/${inscritB.json.id}/messages`, { method: 'POST', body: { corps: 'Un mot pour toi.' } });
  assert.equal(prive.status, 201);
  assert.equal((await ecoutePrive).message.corps, 'Un mot pour toi.');
  const lu = await b.appel(`/api/amis/${inscritA.json.id}/messages`);
  assert.equal(lu.json[0].corps, 'Un mot pour toi.');
  const etranger = await c.appel(`/api/amis/${inscritA.json.id}/messages`, { method: 'POST', body: { corps: 'Non.' } });
  assert.equal(etranger.status, 403);

  lienA.ws.close();
  lienB.ws.close();
  lienC.ws.close();
});
