// Moyens de paiement d'une vraie boutique (hors localhost) : Espèces seulement au départ, ajout depuis le catalogue,
import { mkdirSync } from 'node:fs'; mkdirSync('/tmp/claude-0/t', { recursive: true });
// accueil qui suit les moyens choisis, stock restant sur l'accueil.
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
let fail = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fail++; };
p.on('pageerror', (e) => { console.log('ERR', e.message); fail++; });
const U = 'http://127.0.0.1:5173/'; // hors « localhost » : réglages par défaut d'un vrai client
await p.goto(U); await p.waitForTimeout(1500); await p.screenshot({ path: '/tmp/claude-0/t/start.png' }); const skip = p.getByRole('button', { name: 'Continuer dans le navigateur' }); if (await skip.isVisible().catch(() => false)) { await skip.click(); await p.waitForTimeout(800); }
await p.getByLabel("Nom d'utilisateur").fill('super-adm'); await p.locator('input[type=password]').fill('adm1234'); await p.keyboard.press('Enter'); await p.waitForTimeout(800);
// premier mot de passe
const pw = p.locator('input[type=password]'); if (await pw.count() > 1) { for (let i = 0; i < await pw.count(); i++) await pw.nth(i).fill('Boutique2026!x'); const txt = p.locator('input:not([type=password])'); for (let i = 0; i < await txt.count(); i++) { if (await txt.nth(i).isVisible() && !(await txt.nth(i).inputValue())) await txt.nth(i).fill('Tana'); } await p.locator('button[type=submit]').first().click(); await p.waitForTimeout(1500); }
const later = p.getByRole('button', { name: 'Plus tard' }); if (await later.isVisible().catch(() => false)) await later.click();
await p.goto(U + '#/parametres/paiements'); await p.waitForTimeout(800);
const rows = await p.locator('table tbody tr').count();
ok(rows === 1, `nouvelle boutique : seulement Espèces (${rows} ligne)`);
await p.getByRole('button', { name: '+ Wave' }).click(); await p.getByRole('button', { name: '+ Carte bancaire' }).click();
await p.getByLabel('Autre moyen (nom libre)').fill('Mon Cash'); await p.getByRole('button', { name: 'Ajouter', exact: true }).click();
await p.getByRole('button', { name: 'Enregistrer' }).click(); await p.waitForTimeout(800);
ok(await p.locator('table tbody tr').count() === 4, 'Wave, Carte bancaire et Mon Cash ajoutés');
await p.goto(U + '#/'); await p.waitForTimeout(1200);
const home = await p.locator('main').innerText();
ok(/Wave/.test(home) && /Carte bancaire/.test(home) && /Mon Cash/.test(home) && !/MVola|Airtel/.test(home), 'accueil : moyens choisis seulement');
ok(/Stock restant/.test(home), 'accueil : stock restant');
ok(/Situation des ventes/.test(home), 'accueil : « Situation des ventes » (sans pages)');
await p.screenshot({ path: '/tmp/claude-0/t/home.png', fullPage: false });
await p.goto(U + '#/parametres/paiements'); await p.waitForTimeout(600);
await p.screenshot({ path: '/tmp/claude-0/t/pay.png', fullPage: true });
console.log(fail ? fail + ' ÉCHEC(S)' : 'TOUT EST BON'); await b.close(); process.exit(fail ? 1 : 0);
