import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { creerApplication } from '../src/app.js';

const media = '/cursor/stores/self/media';
mkdirSync(media, { recursive: true });

const app = creerApplication({ dbPath: ':memory:' });
await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${app.server.address().port}`;

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
  ],
});

async function saisir(page, sel, valeur) {
  await page.waitForSelector(sel);
  await page.$eval(sel, (el, v) => { el.value = v; }, valeur);
}

async function debordement(page) {
  return page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
}

async function inscrire(page, identifiant, nom) {
  await page.waitForSelector('[data-action=basculer]');
  await page.click('[data-action=basculer]');
  await page.waitForSelector('#nom');
  await saisir(page, '#nom', nom);
  await saisir(page, '#identifiant', identifiant);
  await saisir(page, '#mot-de-passe', 'phare-du-soir');
  await page.click('[data-action=valider-seuil]');
  await page.waitForFunction(() => document.body.innerText.includes('Mes groupes'));
}

const contexteA = await browser.createBrowserContext();
const contexteB = await browser.createBrowserContext();
const pageA = await contexteA.newPage();
const pageB = await contexteB.newPage();
for (const page of [pageA, pageB]) {
  page.on('pageerror', (err) => console.error('page', err));
  await page.setViewport({ width: 1280, height: 800 });
}

try {
  const sceau = Date.now().toString(36).slice(-6);
  const identifiantB = `cami${sceau}`;
  await pageA.goto(base, { waitUntil: 'domcontentloaded' });
  await pageA.waitForSelector('img.logo');
  await pageA.waitForFunction(() => document.body.innerText.includes('Connexion'));
  await pageA.setViewport({ width: 390, height: 800 });
  if (await debordement(pageA)) throw new Error('La connexion déborde en largeur.');
  await pageA.setViewport({ width: 1280, height: 800 });

  await inscrire(pageA, `greg${sceau}`, 'Gregory');
  await saisir(pageA, '#nom-cale', 'Les pins du soir');
  await saisir(pageA, '#resume-cale', 'On se parle ici.');
  await pageA.click('[data-action=ouvrir-cale]');
  await pageA.waitForSelector('#code-amarre');
  const code = await pageA.$eval('#code-amarre', (n) => n.textContent.trim());

  await pageA.click('[data-action=accueil]');
  await pageA.waitForFunction(() => document.body.innerText.includes('Choisissez un groupe'));
  await pageA.waitForSelector('[data-groupe]');
  await pageA.evaluate(() => { window.scrollTo(0, 0); document.activeElement?.blur?.(); });
  await pageA.screenshot({ path: `${media}/talk-accueil.png` });
  await pageA.setViewport({ width: 390, height: 800 });
  if (await debordement(pageA)) throw new Error('L’accueil déborde en largeur.');
  await pageA.setViewport({ width: 1280, height: 800 });

  await pageA.click('[data-groupe]');
  await pageA.waitForSelector('#code-amarre');
  await saisir(pageA, '#corps', 'Le groupe est ouvert.');
  await pageA.click('[data-action=poser]');
  await pageA.waitForFunction(() => [...document.querySelectorAll('.corps')].some((n) => n.textContent.includes('Le groupe est ouvert.')));

  await pageB.goto(base, { waitUntil: 'domcontentloaded' });
  await inscrire(pageB, identifiantB, 'Camille');
  await saisir(pageB, '#amarre', code);
  await pageB.click('[data-action=rejoindre]');
  await pageB.waitForFunction(() => document.body.innerText.includes('Le groupe est ouvert.'));

  await pageA.waitForFunction(() => (document.getElementById('compte-en-ligne')?.textContent || '').includes('2 en ligne'));
  await pageA.click('[data-action=rejoindre-voix]');
  await pageB.click('[data-action=rejoindre-voix]');
  await pageA.waitForSelector('[data-action=quitter-voix]', { timeout: 10000 });
  await pageB.waitForSelector('[data-action=quitter-voix]', { timeout: 10000 });
  await pageA.waitForFunction(() => document.querySelectorAll('.tuile.dans-appel').length >= 2, { timeout: 10000 });
  await pageA.evaluate(() => { window.scrollTo(0, 0); document.activeElement?.blur?.(); });
  await pageA.screenshot({ path: `${media}/talk-groupe.png` });
  await pageA.setViewport({ width: 390, height: 900 });
  if (await debordement(pageA)) throw new Error('Le groupe déborde en largeur.');
  await pageA.setViewport({ width: 1280, height: 800 });

  await saisir(pageB, '#corps', 'Je suis là.');
  await pageB.click('[data-action=poser]');
  await pageA.waitForFunction(() => [...document.querySelectorAll('.corps')].some((n) => n.textContent.includes('Je suis là.')));
  await pageA.evaluate(() => {
    const ligne = [...document.querySelectorAll('.ligne-journal')].find((n) => n.textContent.includes('Je suis là.'));
    ligne.querySelector('[data-action=supprimer]').click();
  });
  await pageA.waitForFunction(() => [...document.querySelectorAll('[data-action=supprimer]')].some((b) => b.textContent.includes('Confirmer')));
  await pageA.evaluate(() => {
    const ligne = [...document.querySelectorAll('.ligne-journal')].find((n) => n.textContent.includes('Je suis là.'));
    ligne.querySelector('[data-action=supprimer]').click();
  });
  await pageB.waitForFunction(() => ![...document.querySelectorAll('.corps')].some((n) => n.textContent.includes('Je suis là.')));

  await pageA.click('[data-action=allumer]');
  await pageA.waitForFunction(() => document.querySelector('#flux') || document.querySelector('[data-action=sans-lentille]'), { timeout: 10000 });
  if (await pageA.$('[data-action=sans-lentille]')) await pageA.click('[data-action=sans-lentille]');
  await pageA.waitForSelector('#flux');
  await pageB.waitForSelector('[data-action=regarder]', { timeout: 10000 });
  await pageB.click('[data-action=regarder]');
  await pageB.waitForFunction(() => {
    const video = document.querySelector('#flux');
    return Boolean(video && video.videoWidth > 0);
  }, { timeout: 20000 });
  await saisir(pageB, '#corps-direct', 'On vous voit.');
  await pageB.click('[data-action=poser-direct]');
  await pageA.waitForFunction(() => [...document.querySelectorAll('.corps')].some((n) => n.textContent.includes('On vous voit.')));

  await pageA.click('[data-action=membres]');
  await pageA.waitForSelector('[data-action=retirer]');
  await pageA.evaluate(() => {
    const ligne = [...document.querySelectorAll('[data-membre]')].find((n) => n.textContent.includes('Camille'));
    ligne.querySelector('[data-action=retirer]').click();
  });
  await pageA.evaluate(() => {
    const ligne = [...document.querySelectorAll('[data-membre]')].find((n) => n.textContent.includes('Camille'));
    ligne.querySelector('[data-action=retirer]').click();
  });
  await pageB.waitForFunction(() => document.body.innerText.includes('Vous avez été retiré du groupe.'));

  await pageA.click('[data-action=amis]');
  await pageA.waitForSelector('#identifiant-ami');
  await saisir(pageA, '#identifiant-ami', identifiantB);
  await pageA.click('[data-action=ajouter-ami]');
  await pageA.waitForFunction((id) => document.body.innerText.includes(id) && document.body.innerText.includes('Camille'), {}, identifiantB);
  await pageA.evaluate(() => { window.scrollTo(0, 0); document.activeElement?.blur?.(); });
  await pageA.screenshot({ path: `${media}/talk-amis.png` });

  await pageA.click('[data-action=ecrire]');
  await pageA.waitForSelector('#corps-prive');
  await saisir(pageA, '#corps-prive', 'Bonjour Camille.');
  await pageA.click('[data-action=envoyer-prive]');
  await pageA.waitForFunction(() => [...document.querySelectorAll('.corps')].some((n) => n.textContent.includes('Bonjour Camille.')));
  await pageA.evaluate(() => { window.scrollTo(0, 0); document.activeElement?.blur?.(); });
  await pageA.screenshot({ path: `${media}/talk-messages.png` });

  await pageB.click('[data-action=messages]');
  await pageB.waitForSelector('[data-ami]');
  await pageB.click('[data-ami]');
  await pageB.waitForFunction(() => document.body.innerText.includes('Bonjour Camille.'));

  console.log('parcours direct ok');
} finally {
  await browser.close();
  await app.close();
}
