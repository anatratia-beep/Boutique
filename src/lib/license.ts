// Licence d'utilisation : le logiciel ne s'ouvre que sur un appareil activé avec une clé fournie par le vendeur.
// - Chaque appareil a un « code appareil » (créé au premier lancement).
// - Le vendeur crée une clé signée pour CE code appareil, à vie ou jusqu'à une date.
// - La clé est vérifiée ici, hors ligne, avec la clé publique du vendeur : impossible de fabriquer une clé
//   sans la clé secrète du vendeur, et une clé ne marche que sur l'appareil pour lequel elle a été créée.

/** Clé publique du vendeur (ECDSA P-256). La clé secrète correspondante n'est JAMAIS dans ce dépôt. */
const VENDOR_PUBLIC_KEY: JsonWebKey = {
  kty: 'EC', crv: 'P-256',
  x: 'PYwNnulG0wqkae1IlrUJ6cZnLW_Wu56vvMTFw92FYvI',
  y: 'x-o48IX8DWNori5sSQ9XCMBTMlgGZjwkPCqiNbrWkXY',
};

/** Coordonnées affichées sur l'écran d'activation (laisser vide pour ne rien afficher). */
export const VENDOR_CONTACT = '+261 38 32 585 16';
/** Numéro WhatsApp du vendeur (format international, chiffres seulement). */
export const VENDOR_WHATSAPP = '261383258516';

/** Synchronisation cloud désactivée dans cette version vendue (chaque licence = 1 appareil). */
export const CLOUD_ENABLED = false;

const K_DEVICE = 'boutique.deviceCode';
const K_LICENSE = 'boutique.license';
const K_SEEN = 'boutique.licenseSeen';
const PREFIX = 'BTQ-';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export type LicenseInfo = { id: string; client: string; device: string; expires: string; issued: string };
export type LicenseState =
  | { ok: true; info: LicenseInfo; daysLeft: number | null }
  | { ok: false; reason: 'none' | 'invalid' | 'device' | 'expired' | 'clock'; info?: LicenseInfo; message: string };

const ls = {
  get(k: string) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* */ } },
};

// Copie de secours dans IndexedDB (séparée de la base du logiciel), pour survivre si l'une des deux est vidée.
function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest | void): Promise<T | null> {
  return new Promise((resolve) => {
    try {
      const r = indexedDB.open('boutique-licence', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onerror = () => resolve(null);
      r.onsuccess = () => {
        try {
          const tx = r.result.transaction('kv', mode);
          const q = fn(tx.objectStore('kv'));
          tx.oncomplete = () => { resolve(q ? (q.result as T) : null); r.result.close(); };
          tx.onerror = () => { resolve(null); r.result.close(); };
        } catch { resolve(null); }
      };
    } catch { resolve(null); }
  });
}
const idbGet = (k: string) => idb<string>('readonly', (s) => s.get(k));
const idbSet = (k: string, v: string) => idb('readwrite', (s) => { s.put(v, k); });

async function remember(k: string, v: string) { ls.set(k, v); await idbSet(k, v); }
async function recall(k: string) {
  const a = ls.get(k); if (a) { void idbSet(k, a); return a; }
  const b = await idbGet(k); if (b) ls.set(k, b);
  return b;
}

export const normalizeCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
export const formatCode = (s: string) => { const n = normalizeCode(s); return n.length === 10 ? `${n.slice(0, 5)}-${n.slice(5)}` : n; };

export async function deviceCode(): Promise<string> {
  let c = await recall(K_DEVICE);
  if (!c || normalizeCode(c).length !== 10) {
    const r = crypto.getRandomValues(new Uint8Array(10));
    c = [...r].map((x) => ALPHABET[x % ALPHABET.length]).join('');
    await remember(K_DEVICE, c);
  }
  return formatCode(c);
}

const b64uToBytes = (s: string) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(b, (ch) => ch.charCodeAt(0));
};

let pubKey: Promise<CryptoKey> | null = null;
const publicKey = () => (pubKey ??= crypto.subtle.importKey('jwk', VENDOR_PUBLIC_KEY, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']));

/** Date du jour (locale) au format AAAA-MM-JJ. */
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);

async function decode(key: string): Promise<LicenseInfo | null> {
  const k = key.replace(/\s+/g, '');
  if (!k.startsWith(PREFIX)) return null;
  const [body, sig] = k.slice(PREFIX.length).split('.');
  if (!body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, await publicKey(), b64uToBytes(sig), new TextEncoder().encode(body));
    if (!ok) return null;
    const p = JSON.parse(new TextDecoder().decode(b64uToBytes(body)));
    return { id: String(p.id || ''), client: String(p.c || ''), device: normalizeCode(String(p.d || '')), expires: String(p.e || ''), issued: String(p.i || '') };
  } catch { return null; }
}

/** Vérifie une clé pour CET appareil (sans l'enregistrer). */
export async function checkKey(key: string): Promise<LicenseState> {
  const info = await decode(key);
  if (!info) return { ok: false, reason: 'invalid', message: 'Cette clé de licence n’est pas valide. Vérifiez qu’elle a été copiée en entier.' };
  const mine = normalizeCode(await deviceCode());
  if (info.device !== mine) return { ok: false, reason: 'device', info, message: 'Cette clé a été créée pour un autre appareil. Envoyez votre code appareil au vendeur pour recevoir votre propre clé.' };
  // Protection contre le recul de la date du téléphone pour prolonger une licence.
  const seen = Number(ls.get(K_SEEN) || (await idbGet(K_SEEN)) || 0);
  if (seen && Date.now() < seen - 2 * 86400000) return { ok: false, reason: 'clock', info, message: 'La date de cet appareil semble incorrecte. Remettez la bonne date et la bonne heure, puis réessayez.' };
  if (info.expires) {
    const left = daysBetween(today(), info.expires);
    if (left < 0) return { ok: false, reason: 'expired', info, message: `Votre licence a expiré le ${frDate(info.expires)}. Contactez le vendeur pour la renouveler : vos données sont conservées.` };
    return { ok: true, info, daysLeft: left };
  }
  return { ok: true, info, daysLeft: null };
}

/** État de la licence enregistrée sur cet appareil. */
export async function licenseState(): Promise<LicenseState> {
  const key = await recall(K_LICENSE);
  if (!key) return { ok: false, reason: 'none', message: '' };
  const s = await checkKey(key);
  if (s.ok) { const now = String(Math.max(Date.now(), Number(ls.get(K_SEEN) || 0))); await remember(K_SEEN, now); }
  return s;
}

/** Enregistre une clé si elle est valide pour cet appareil. */
export async function activate(key: string): Promise<LicenseState> {
  const s = await checkKey(key);
  if (s.ok) { await remember(K_LICENSE, key.replace(/\s+/g, '')); await remember(K_SEEN, String(Date.now())); }
  return s;
}

export const frDate = (iso: string) => (iso ? new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
