// Notifications système (comme les autres applications), licence 1 appareil sans création d'utilisateurs,
// mot de passe de départ adm1234 (l'ancien « anosy » jamais changé est remplacé).
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.grantPermissions(['notifications'], { origin: 'http://localhost:5173' });
await ctx.addInitScript(() => {
  try { localStorage.setItem('boutique.oneDevice', '1'); } catch {}
  // Notification système enregistrée pour le test (au lieu de s'afficher).
  window.__sys = []; const N = function (t, o) { window.__sys.push({ t, body: o?.body }); this.close = () => {}; }; N.permission = 'granted'; N.requestPermission = async () => 'granted'; window.Notification = N;
});
const p = await ctx.newPage();
let fail = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fail++; };
p.on('pageerror', (e) => { console.log('ERR', e.message); fail++; });
await p.goto('http://localhost:5173/'); await p.waitForTimeout(800);
await p.getByLabel("Nom d'utilisateur").fill('super-adm'); await p.locator('input[type=password]').fill('adm1234'); await p.keyboard.press('Enter'); await p.waitForTimeout(800);
ok(!(await p.getByLabel("Nom d'utilisateur").isVisible().catch(() => false)), 'connexion avec le mot de passe de départ adm1234');
await p.getByRole('button', { name: 'Plus tard' }).click().catch(() => {}); await p.waitForTimeout(400);
// Une charge fixe échue → notification à l'écran ET notification système
await p.evaluate(async () => { const t = window.__tsena; const d = new Date(); await t.save('recurring', { id: 'r1', label: 'Loyer test', kind: 'expense', amount: 50000, freq: 'monthly', day: d.getDate(), startMonth: d.toISOString().slice(0, 7), active: true, categoryId: 'loyer', account: 'cash' }); });
await p.waitForTimeout(1500);
const sys = await p.evaluate(() => window.__sys);
ok(sys.some((n) => /Loyer test/.test(n.t)), `notification système envoyée (${sys.map((n) => n.t).join(' | ')})`);
const n1 = sys.length;
await p.evaluate(() => { location.hash = '#/stock'; }); await p.waitForTimeout(800); await p.evaluate(() => { location.hash = '#/'; }); await p.waitForTimeout(800);
ok((await p.evaluate(() => window.__sys.length)) === n1, 'pas renvoyée une deuxième fois');
// Une action importante (modification) : pas de notification
await p.evaluate(async () => { await window.__tsena.save('audit', { id: 'a1', at: new Date().toISOString(), action: 'Mot de passe', details: 'test', userName: 'Super-admin', level: 'high', review: 'todo' }); });
await p.waitForTimeout(1000);
ok(!(await p.locator('body').innerText()).includes('à vérifier') && !(await p.evaluate(() => window.__sys.some((n) => /vérifier/.test(n.t)))), 'modifications : pas de notification');
// Licence 1 appareil : pas de création d'utilisateur
await p.evaluate(() => { location.hash = '#/utilisateurs'; }); await p.waitForTimeout(800);
ok(!(await p.getByRole('button', { name: 'Ajouter un utilisateur' }).isVisible().catch(() => false)), 'licence 1 appareil : pas de bouton « Ajouter un utilisateur »');
ok(await p.getByText('comprend un seul compte').isVisible(), 'explication affichée');
// Installation existante : super-adm encore avec l'ancien mot de passe de départ « anosy » → remplacé par adm1234
const H = await p.evaluate(async () => { const enc = new TextEncoder(); const salt = crypto.getRandomValues(new Uint8Array(16)); const key = await crypto.subtle.importKey('raw', enc.encode('anosy'), 'PBKDF2', false, ['deriveBits']); const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 120000, hash: 'SHA-256' }, key, 256); const hx = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join(''); return `pbkdf2$120000$${hx(salt.buffer)}$${hx(bits)}`; });
await p.evaluate(async (h) => { await window.__tsena.save('users', { id: window.__tsena.all('users').find((u) => u.username === 'super-adm').id, passwordHash: h, mustChangePassword: true }); }, H);
await p.reload(); await p.waitForTimeout(1500);
const good = await p.evaluate(async () => { const st = window.__tsena.all('users').find((u) => u.username === 'super-adm').passwordHash; const [, , salt, hash] = st.split('$'); const enc = new TextEncoder(); const s2 = new Uint8Array(salt.match(/../g).map((x) => parseInt(x, 16))); const key = await crypto.subtle.importKey('raw', enc.encode('adm1234'), 'PBKDF2', false, ['deriveBits']); const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: s2, iterations: 120000, hash: 'SHA-256' }, key, 256); return [...new Uint8Array(bits)].map((x) => x.toString(16).padStart(2, '0')).join('') === hash; });
ok(good, 'ancien « anosy » jamais changé : remplacé par adm1234');
console.log(fail ? `${fail} ÉCHEC(S)` : 'TOUT EST BON'); await b.close(); process.exit(fail ? 1 : 0);
