// Mises à jour automatiques de l'application Android (l'application Windows / Mac fait la même chose de son côté, voir electron/main.cjs).
// Au démarrage, si une nouvelle version a été téléchargée la fois précédente, l'application passe dessus.
// Ensuite, quand Internet est là, elle regarde s'il existe une version plus récente, la télécharge en arrière-plan,
// vérifie sa signature (clé des mises à jour du vendeur) et la garde pour le prochain démarrage.
// Si une nouvelle installation complète est nécessaire (rare), un message invite à télécharger l'application.

export const DOWNLOAD_REPO = 'anatratia-beep/Boutique-telechargements';
export const DOWNLOAD_PAGE = `https://github.com/${DOWNLOAD_REPO}/releases/latest`;
const MANIFEST = `https://github.com/${DOWNLOAD_REPO}/releases/latest/download/update.json`;
/** Version de la « coquille » Android que ce code sait faire tourner (voir scripts/make-update.mjs). */
const SHELL = 1;
/** Clé publique des mises à jour (la clé privée est le secret UPDATE_SIGNING_KEY de GitHub). */
const PUBLIC_KEY: JsonWebKey = { kty: 'EC', crv: 'P-256', x: 'lmfSNd42OLN8_kq-SW_huUbF57qiFnndcaSQOQ73dl0', y: 'cm4Le4Fw448fqkWmYD6Rsz_KQxxM4K2t06eSOecVwxk' };
const PENDING = 'boutique.update.pending';
const SHELL_NOTICE = 'boutique.update.shell';

const cap = () => (window as any).Capacitor;
export const isAndroidApp = () => !!cap()?.isNativePlatform?.() && cap()?.getPlatform?.() === 'android';
const plugins = () => cap().Plugins;
const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string | null) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* */ } };

/** a est-elle plus récente que b ? (« 1.0.12 » > « 1.0.9 ») */
export function newer(a: string, b: string) {
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0; }
  return false;
}
const b64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

/** Au démarrage : passe sur la version téléchargée la fois précédente. Vrai si l'application va se recharger. */
export async function applyPendingUpdate(): Promise<boolean> {
  if (!isAndroidApp()) return false;
  try {
    const p = JSON.parse(read(PENDING) || 'null') as { version: string; path: string } | null;
    if (!p) { void cleanOld(); return false; }
    write(PENDING, null);
    if (!newer(p.version, __APP_VERSION__)) return false;
    await plugins().Filesystem.stat({ path: `web/${p.version}/index.html`, directory: 'DATA' }); // fichiers bien présents
    await plugins().WebView.setServerBasePath({ path: p.path });
    await plugins().WebView.persistServerBasePath();
    return true;
  } catch { return false; }
}

/** Efface les anciennes versions téléchargées (garde celle qui tourne). */
async function cleanOld() {
  try {
    const fs = plugins().Filesystem;
    const { files } = await fs.readdir({ path: 'web', directory: 'DATA' });
    for (const f of files as ({ name: string } | string)[]) {
      const name = typeof f === 'string' ? f : f.name;
      if (name !== __APP_VERSION__) await fs.rmdir({ path: `web/${name}`, directory: 'DATA', recursive: true });
    }
  } catch { /* dossier absent : rien à faire */ }
}

async function get(url: string, responseType: 'json' | 'text') {
  const r = await plugins().CapacitorHttp.get({ url, responseType, headers: { 'Cache-Control': 'no-cache' } });
  if (r.status < 200 || r.status >= 300) throw new Error(`HTTP ${r.status}`);
  return r.data;
}

export type UpdateResult = 'none' | 'ready' | 'shell' | 'error';
let running: Promise<UpdateResult> | null = null;

/** Cherche une nouvelle version et la prépare pour le prochain démarrage. */
export function checkForUpdate(): Promise<UpdateResult> {
  if (!isAndroidApp()) return Promise.resolve('none');
  return (running ??= (async (): Promise<UpdateResult> => {
    try {
      let m = await get(`${MANIFEST}?t=${Date.now()}`, 'json');
      if (typeof m === 'string') m = JSON.parse(m);
      if (!m?.version || !newer(m.version, __APP_VERSION__)) return 'none';
      if ((m.shell || 1) > SHELL) { write(SHELL_NOTICE, m.version); return 'shell'; }
      const pending = JSON.parse(read(PENDING) || 'null');
      if (pending?.version === m.version) return 'ready';
      const text: string = await get(m.url, 'text');
      const key = await crypto.subtle.importKey('jwk', PUBLIC_KEY, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
      const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, b64url(m.sig), new TextEncoder().encode(text));
      if (!ok) return 'error';
      const b = JSON.parse(text) as { version: string; files: Record<string, string> };
      if (b.version !== m.version || !b.files['index.html']) return 'error';
      const fs = plugins().Filesystem, dir = `web/${b.version}`;
      try { await fs.rmdir({ path: dir, directory: 'DATA', recursive: true }); } catch { /* */ }
      for (const [p, data] of Object.entries(b.files)) {
        if (p.startsWith('/') || p.split('/').includes('..')) return 'error';
        await fs.writeFile({ path: `${dir}/${p}`, data, directory: 'DATA', recursive: true });
      }
      const { uri } = await fs.getUri({ path: dir, directory: 'DATA' });
      write(PENDING, JSON.stringify({ version: b.version, path: decodeURIComponent(String(uri).replace(/^file:\/\//, '')) }));
      return 'ready';
    } catch { return 'error'; } finally { running = null; }
  })());
}

/** Vérification automatique : peu après le démarrage, puis toutes les 6 heures et au retour d'Internet. */
export function startAutoUpdate(onShell?: (version: string) => void) {
  if (!isAndroidApp()) return;
  const run = async () => { if ((await checkForUpdate()) === 'shell') { const v = read(SHELL_NOTICE); if (v) onShell?.(v); } };
  setTimeout(run, 20_000);
  setInterval(run, 6 * 3600_000);
  window.addEventListener('online', () => void run());
}
