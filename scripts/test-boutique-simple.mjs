// Boutique simple : sans « Pages et variantes », un article se crée directement ; nom de la société fixé par la
// licence (non modifiable) ; zones d'exemple de Tana retirées (une zone déjà utilisée est seulement désactivée).
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addInitScript(() => { try { localStorage.setItem('boutique.lockName', '1'); } catch {} });
const p = await ctx.newPage();
let fail = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fail++; };
p.on('pageerror', (e) => { console.log('ERR', e.message); fail++; });
await p.goto('http://localhost:5173/'); await p.waitForTimeout(600);
await p.getByLabel("Nom d'utilisateur").fill('super-adm'); await p.locator('input[type=password]').fill('adm1234'); await p.keyboard.press('Enter');
await p.getByRole('button', { name: 'Plus tard' }).click(); await p.waitForTimeout(400);

// Zones d'exemple présentes (comme chez un client installé avec une ancienne version), une utilisée par une commande.
await p.evaluate(async () => {
  const t = window.__tsena; localStorage.setItem('boutique.cleanZones', '1');
  await t.save('settings', { id: 'company', name: 'Autre nom', modules: { pages: false } });
  await t.save('orders', { id: 'o1', number: 'C-1', kind: 'order', channel: 'phone', phone: '0340000000', status: 'delivered', zoneId: 'zone-proche', lines: [], payments: [], discount: 0, deliveryFee: 4000, createdAt: new Date().toISOString() });
});
await p.reload(); await p.waitForTimeout(1200);
const st = await p.evaluate(() => ({ name: window.__tsena.get('settings', 'company').name, zones: window.__tsena.all('zones').map((z) => z.id + ':' + (z.active !== false)) }));
ok(st.name === 'Tests', `nom de la société = client de la licence (${st.name})`);
ok(!st.zones.includes('zone-centre:true') && !st.zones.some((z) => z.startsWith('zone-centre')), `zone d’exemple non utilisée supprimée (${st.zones.join(', ')})`);
ok(st.zones.includes('zone-proche:false'), 'zone d’exemple déjà utilisée : seulement désactivée');
ok(st.zones.includes('zone-retrait:true'), 'retrait en boutique gardé');

// Paramètres → Société : nom en lecture seule
await p.evaluate(() => { location.hash = '#/parametres/societe'; }); await p.waitForTimeout(700);
const f = p.getByLabel('Nom de la société');
ok(await f.inputValue() === 'Tests' && (await f.getAttribute('readonly')) !== null, 'champ « Nom de la société » non modifiable');
ok(await p.getByText('Fixé par votre licence').isVisible(), 'explication affichée');

// Menu sans « Pages et variantes », fonction présente dans Paramètres → Fonctions
const nav = await p.locator('nav').first().innerText();
ok(!nav.includes('Pages et variantes'), 'menu : plus de « Pages et variantes »');
await p.evaluate(() => { location.hash = '#/parametres/fonctions'; }); await p.waitForTimeout(700);
ok(await p.getByText('Pages et variantes').first().isVisible(), 'Fonctions : « Pages et variantes » activable');

// Créer un article : formulaire simple directement
await p.evaluate(() => { location.hash = '#/articles'; }); await p.waitForTimeout(700);
await p.getByRole('button', { name: 'Créer un article' }).first().click(); await p.waitForTimeout(500);
const choose = p.getByText('Article (avec couleurs, tailles…)');
if (await choose.isVisible().catch(() => false)) { await choose.click(); await p.waitForTimeout(500); }
ok(await p.getByLabel('Code de l’article').isVisible() && !(await p.getByText('Choisir la page').isVisible().catch(() => false)), 'formulaire simple (code, nom, prix) sans choix de page');
ok(!(await p.getByText('Article sans variantes (ancien mode)').isVisible().catch(() => false)), 'plus de lien « ancien mode »');

// Utilisateurs : pas de « Pages attribuées »
await p.keyboard.press('Escape');
await p.evaluate(() => { location.hash = '#/utilisateurs'; }); await p.waitForTimeout(700);
await p.getByRole('button', { name: 'Ajouter un utilisateur' }).first().click(); await p.waitForTimeout(500);
ok(!(await p.getByText('Pages attribuées (catégories)').isVisible().catch(() => false)), 'utilisateur : pas de pages à attribuer');

// Réactivée : tout revient
await p.evaluate(async () => { await window.__tsena.save('settings', { id: 'company', modules: { pages: true } }); location.hash = '#/'; }); await p.waitForTimeout(700);
ok((await p.locator('nav').first().innerText()).includes('Pages et variantes'), 'fonction réactivée : menu revenu');
console.log(fail ? `${fail} ÉCHEC(S)` : 'TOUT EST BON'); await b.close(); process.exit(fail ? 1 : 0);
