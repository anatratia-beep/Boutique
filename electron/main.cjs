// Application Windows / Mac : ouvre le logiciel Boutique dans sa propre fenêtre, sans Internet.
// Les fichiers sont servis par un protocole interne « app:// » (origine fixe = données conservées entre les mises à jour).
// Mises à jour automatiques : quand Internet est là, l'application télécharge la nouvelle version du logiciel,
// vérifie sa signature (clé des mises à jour du vendeur) et l'utilise au prochain démarrage.
const { app, BrowserWindow, protocol, net, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { pathToFileURL } = require('url');

const DOWNLOAD_REPO = 'anatratia-beep/Boutique-telechargements';
const MANIFEST = `https://github.com/${DOWNLOAD_REPO}/releases/latest/download/update.json`;
const SHELL = 1; // version de la « coquille » : voir scripts/make-update.mjs
const PUBLIC_KEY = { kty: 'EC', crv: 'P-256', x: 'lmfSNd42OLN8_kq-SW_huUbF57qiFnndcaSQOQ73dl0', y: 'cm4Le4Fw448fqkWmYD6Rsz_KQxxM4K2t06eSOecVwxk' };

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

if (!app.requestSingleInstanceLock()) app.quit();

let win;
let active = { root: path.join(__dirname, 'web'), version: app.getVersion() };

const newer = (a, b) => {
  const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0; }
  return false;
};
const updatesDir = () => path.join(app.getPath('userData'), 'mises-a-jour');

/** Version à utiliser : la plus récente entre celle installée et celle téléchargée. */
function chooseActive() {
  try {
    const cur = JSON.parse(fs.readFileSync(path.join(updatesDir(), 'actuelle.json'), 'utf8'));
    const dir = path.join(updatesDir(), cur.version);
    if (newer(cur.version, app.getVersion()) && fs.existsSync(path.join(dir, 'index.html'))) active = { root: dir, version: cur.version };
  } catch { /* aucune mise à jour téléchargée */ }
}

let checking = false;
async function checkUpdate() {
  if (checking) return;
  checking = true;
  try {
    const m = await (await net.fetch(`${MANIFEST}?t=${Date.now()}`, { cache: 'no-store' })).json();
    if (!m || !m.version || !newer(m.version, active.version) || (m.shell || 1) > SHELL) return;
    const base = updatesDir(), target = path.join(base, m.version);
    if (fs.existsSync(path.join(target, 'index.html'))) return; // déjà prête pour le prochain démarrage
    const res = await net.fetch(m.url);
    if (!res.ok) return;
    const body = Buffer.from(await res.arrayBuffer());
    const key = crypto.createPublicKey({ key: PUBLIC_KEY, format: 'jwk' });
    if (!crypto.verify('sha256', body, { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(m.sig, 'base64url'))) return;
    const b = JSON.parse(body.toString('utf8'));
    if (b.version !== m.version || !b.files || !b.files['index.html']) return;
    const tmp = `${target}.tmp`;
    fs.rmSync(tmp, { recursive: true, force: true });
    for (const [p, data] of Object.entries(b.files)) {
      const f = path.normalize(path.join(tmp, p));
      if (!f.startsWith(tmp + path.sep)) return;
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, Buffer.from(data, 'base64'));
    }
    fs.rmSync(target, { recursive: true, force: true });
    fs.renameSync(tmp, target);
    fs.writeFileSync(path.join(base, 'actuelle.json'), JSON.stringify({ version: m.version }));
    // Anciennes versions téléchargées : on garde seulement celle qui tourne et la nouvelle.
    for (const d of fs.readdirSync(base)) {
      if (d !== 'actuelle.json' && d !== m.version && d !== active.version) fs.rmSync(path.join(base, d), { recursive: true, force: true });
    }
  } catch { /* pas d'Internet ou fichier invalide : on réessaiera plus tard */ } finally { checking = false; }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 380, minHeight: 560,
    title: 'Boutique', backgroundColor: '#EFEBF8', autoHideMenuBar: true,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false },
  });
  if (process.platform !== 'darwin') Menu.setApplicationMenu(null);
  // Les liens externes (WhatsApp, sites) s'ouvrent dans le navigateur, jamais dans l'application.
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:|^mailto:|^tel:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('app://')) { e.preventDefault(); shell.openExternal(url); } });
  win.loadURL('app://boutique/index.html');
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(() => {
  chooseActive();
  protocol.handle('app', (req) => {
    let p = decodeURIComponent(new URL(req.url).pathname);
    if (p === '/' || p === '') p = '/index.html';
    const root = active.root;
    const file = path.normalize(path.join(root, p));
    if (!file.startsWith(root)) return new Response('Interdit', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
  createWindow();
  setTimeout(checkUpdate, 20_000);
  setInterval(checkUpdate, 6 * 3600_000);
});
app.on('window-all-closed', () => app.quit());
