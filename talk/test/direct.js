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
  await page.waitForFunction(() => document.body.innerText.includes('Le bassin de'));
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
  await pageA.goto(base, { waitUntil: 'domcontentloaded' });
  await pageA.waitForSelector('[data-action=basculer]');
  await pageA.screenshot({ path: `${media}/talk-seuil.png` });
  await pageA.setViewport({ width: 390, height: 800 });
  if (await debordement(pageA)) throw new Error('Le seuil déborde en largeur.');
  await pageA.setViewport({ width: 1280, height: 800 });

  await inscrire(pageA, `greg${sceau}`, 'Gregory');
  await saisir(pageA, '#nom-cale', 'Les pins du soir');
  await saisir(pageA, '#resume-cale', 'Un bord pour se parler.');
  await pageA.click('[data-action=ouvrir-cale]');
  await pageA.waitForSelector('#code-amarre');
  const amarre = await pageA.$eval('#code-amarre', (n) => n.textContent.trim());

  await saisir(pageA, '#corps', 'Le quai est ouvert ce soir.');
  await pageA.click('[data-action=poser]');
  await pageA.waitForFunction(() => document.body.innerText.includes('Le quai est ouvert ce soir.'));
  await pageA.screenshot({ path: `${media}/talk-cale.png` });
  await pageA.setViewport({ width: 390, height: 800 });
  if (await debordement(pageA)) throw new Error('La cale déborde en largeur.');
  await pageA.setViewport({ width: 1280, height: 800 });

  await pageB.goto(base, { waitUntil: 'domcontentloaded' });
  await inscrire(pageB, `cami${sceau}`, 'Camille');
  await saisir(pageB, '#amarre', amarre);
  await pageB.click('[data-action=rejoindre]');
  await pageB.waitForFunction(() => document.body.innerText.includes('Le quai est ouvert ce soir.'));

  await pageA.waitForFunction(() => (document.getElementById('compte-quai')?.textContent || '').includes('2 à quai'));

  await saisir(pageB, '#corps', 'Je suis à quai.');
  await pageB.click('[data-action=poser]');
  await pageA.waitForFunction(() => [...document.querySelectorAll('.corps')].some((n) => n.textContent.includes('Je suis à quai.')));
  await pageA.evaluate(() => {
    const ligne = [...document.querySelectorAll('.ligne-journal')].find((n) => n.textContent.includes('Je suis à quai.'));
    ligne.querySelector('[data-action=rayer]').click();
  });
  await pageA.waitForFunction(() => [...document.querySelectorAll('[data-action=rayer]')].some((b) => b.textContent.includes('Confirmer')));
  await pageA.evaluate(() => {
    const ligne = [...document.querySelectorAll('.ligne-journal')].find((n) => n.textContent.includes('Je suis à quai.'));
    ligne.querySelector('[data-action=rayer]').click();
  });
  await pageB.waitForFunction(() => ![...document.querySelectorAll('.corps')].some((n) => n.textContent.includes('Je suis à quai.')));

  await pageA.click('[data-action=allumer]');
  await pageA.waitForFunction(() => document.querySelector('#flux') || document.querySelector('[data-action=sans-lentille]'), { timeout: 10000 });
  if (await pageA.$('[data-action=sans-lentille]')) await pageA.click('[data-action=sans-lentille]');
  await pageA.waitForSelector('#flux');

  await pageB.waitForSelector('[data-action=asseoir]', { timeout: 10000 });
  await pageB.click('[data-action=asseoir]');
  await pageB.waitForFunction(() => {
    const video = document.querySelector('#flux');
    return Boolean(video && video.videoWidth > 0);
  }, { timeout: 20000 });

  await saisir(pageB, '#corps-houle', 'On vous voit.');
  await pageB.click('[data-action=poser-houle]');
  await pageA.waitForFunction(() => [...document.querySelectorAll('.corps')].some((n) => n.textContent.includes('On vous voit.')));
  await pageA.setViewport({ width: 1280, height: 1100 });
  await pageA.screenshot({ path: `${media}/talk-eclat.png` });

  await pageA.click('#compte-quai');
  await pageA.waitForSelector('[data-action=retirer]');
  await pageA.evaluate(() => {
    const ligne = [...document.querySelectorAll('[data-membre]')].find((n) => n.textContent.includes('Camille'));
    ligne.querySelector('[data-action=retirer]').click();
  });
  await pageA.evaluate(() => {
    const ligne = [...document.querySelectorAll('[data-membre]')].find((n) => n.textContent.includes('Camille'));
    ligne.querySelector('[data-action=retirer]').click();
  });
  await pageB.waitForFunction(() => document.body.innerText.includes('Vous avez été retiré de la cale.'));
  console.log('parcours direct ok');
} finally {
  await browser.close();
  await app.close();
}
