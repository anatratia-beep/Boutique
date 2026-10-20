// Licence d'utilisation : le logiciel ne s'ouvre qu'avec une clé signée par le vendeur.
// Deux offres :
//  - « Hors ligne » (clé v1) : liée à UN appareil (son code appareil), aucune connexion nécessaire.
//  - « Multi-appareils » (clé v2) : liée à une BOUTIQUE, avec un nombre d'appareils et de comptes. Chaque appareil
//    est activé une fois en ligne auprès du cloud central (qui compte les places), puis toutes les données de la
//    boutique se synchronisent entre ses appareils.
// La clé est vérifiée avec la clé publique du vendeur : impossible de fabriquer une clé sans sa clé secrète.
import { cloudSession, connectCloud, disconnectCloud } from './sync';

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

/** Cloud central du vendeur (licences multi-appareils). La clé « publishable » peut être publique. */
export const CLOUD_URL = 'https://ypoqpfkwciazohygigpg.supabase.co';
export const CLOUD_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlwb3FwZmt3Y2lhem9oeWdpZ3BnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0ODExMDAsImV4cCI6MjEwODA1NzEwMH0.vifNAhWHDelDEI7-UxFHrD9gEz9EZcJ5r0uVF1rEIu0';

/** Réglage manuel du cloud (formulaire « Relier au cloud ») : désactivé, le cloud vient de la licence. */
export const CLOUD_ENABLED = false;

const K_DEVICE = 'boutique.deviceCode';
const K_LICENSE = 'boutique.license';
const K_SEEN = 'boutique.licenseSeen';
const K_ACT = 'boutique.activation';
const K_REVOKED = 'boutique.revoked';
const PREFIX = 'BTQ-';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export type LicenseInfo = {
  version: 1 | 2; id: string; client: string; expires: string; issued: string;
  device: string;                       // v1 : appareil autorisé
  shop: string; seats: number; users: number; // v2 : boutique, appareils, comptes (0 = illimité)
};
export type LicenseState =
  | { ok: true; info: LicenseInfo; daysLeft: number | null }
  | { ok: false; reason: 'none' | 'invalid' | 'device' | 'expired' | 'clock' | 'activation' | 'revoked'; info?: LicenseInfo; message: string };

const ls = {
  get(k: string) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* */ } },
  del(k: string) { try { localStorage.removeItem(k); } catch { /* */ } },
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
const idbDel = (k: string) => idb('readwrite', (s) => { s.delete(k); });

async function remember(k: string, v: string) { ls.set(k, v); await idbSet(k, v); }
async function forget(k: string) { ls.del(k); await idbDel(k); }
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
const cleanKey = (k: string) => k.replace(/\s+/g, '');

async function decode(key: string): Promise<LicenseInfo | null> {
  const k = cleanKey(key);
  if (!k.startsWith(PREFIX)) return null;
  const [body, sig] = k.slice(PREFIX.length).split('.');
  if (!body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, await publicKey(), b64uToBytes(sig), new TextEncoder().encode(body));
    if (!ok) return null;
    const p = JSON.parse(new TextDecoder().decode(b64uToBytes(body)));
    const v2 = p.v === 2;
    return {
      version: v2 ? 2 : 1, id: String(p.id || ''), client: String(p.c || ''), expires: String(p.e || ''), issued: String(p.i || ''),
      device: v2 ? '' : normalizeCode(String(p.d || '')),
      shop: v2 ? String(p.s || '') : '', seats: v2 ? Math.max(1, Number(p.n) || 1) : 1, users: v2 ? Math.max(0, Number(p.u) || 0) : 0,
    };
  } catch { return null; }
}

/** Dernière licence valide vue sur cet appareil (limites de comptes, affichage). */
let current: LicenseInfo | null = null;
export const currentLicense = () => current;

async function validity(info: LicenseInfo): Promise<LicenseState> {
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

/** Vérifie une clé hors ligne pour CET appareil (sans l'enregistrer ni l'activer). */
export async function checkKey(key: string): Promise<LicenseState> {
  const info = await decode(key);
  if (!info) return { ok: false, reason: 'invalid', message: 'Cette clé de licence n’est pas valide. Vérifiez qu’elle a été copiée en entier.' };
  if (info.version === 1 && info.device !== normalizeCode(await deviceCode())) return { ok: false, reason: 'device', info, message: 'Cette clé a été créée pour un autre appareil. Envoyez votre code appareil au vendeur pour recevoir votre propre clé.' };
  return validity(info);
}

/** État de la licence enregistrée sur cet appareil. */
export async function licenseState(): Promise<LicenseState> {
  const key = await recall(K_LICENSE);
  if (!key) return { ok: false, reason: 'none', message: '' };
  const s = await checkKey(key);
  if (s.ok && s.info.version === 2) {
    const act = JSON.parse((await recall(K_ACT)) || 'null');
    if (!act || act.shop !== s.info.shop || act.device !== normalizeCode(await deviceCode())) {
      return { ok: false, reason: 'activation', info: s.info, message: 'Cet appareil doit être activé : collez la clé de licence avec une connexion Internet.' };
    }
    if (await recall(K_REVOKED)) return { ok: false, reason: 'revoked', info: s.info, message: 'Cet appareil a été retiré de la licence de la boutique. Contactez le vendeur pour le réactiver.' };
  }
  if (s.ok) { current = s.info; await remember(K_SEEN, String(Math.max(Date.now(), Number(ls.get(K_SEEN) || 0)))); }
  return s;
}

function guessDeviceName() {
  const ua = navigator.userAgent;
  if (/Electron/.test(ua)) return 'Ordinateur (application)';
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? 'Téléphone Android' : 'Tablette Android';
  if (/iPhone|iPad/.test(ua)) return 'iPhone / iPad';
  if (/Windows/.test(ua)) return 'Ordinateur Windows';
  if (/Mac/.test(ua)) return 'Mac';
  return 'Appareil';
}

async function callCloud(body: object, token?: string) {
  if (!CLOUD_URL || !CLOUD_ANON_KEY) throw new Error('Le cloud des licences n’est pas encore configuré. Contactez le vendeur.');
  let res: Response;
  try {
    res = await fetch(`${CLOUD_URL}/functions/v1/licence`, {
      method: 'POST',
      headers: { apikey: CLOUD_ANON_KEY, Authorization: `Bearer ${token || CLOUD_ANON_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch { throw new Error('Pas de connexion Internet. L’activation de cette licence a besoin d’Internet (une seule fois par appareil).'); }
  const j = await res.json().catch(() => ({}));
  return { status: res.status, body: j as any };
}

/** Enregistre une clé : hors ligne pour une licence 1 appareil, en ligne (cloud) pour une licence multi-appareils. */
export async function activate(key: string): Promise<LicenseState> {
  const s = await checkKey(key);
  if (!s.ok) return s;
  if (s.info.version === 2) {
    const code = normalizeCode(await deviceCode());
    let r;
    try { r = await callCloud({ action: 'activate', key: cleanKey(key), device: code, name: guessDeviceName() }); }
    catch (e: any) { return { ok: false, reason: 'activation', info: s.info, message: e.message }; }
    if (!r.body?.ok) return { ok: false, reason: r.body?.code === 'device_revoked' ? 'revoked' : 'activation', info: s.info, message: r.body?.message || `Activation refusée (erreur ${r.status}).` };
    // Même boutique qu'avant (renouvellement) : on garde la session cloud ; autre boutique : on repart de zéro côté synchro.
    const prev = JSON.parse((await recall(K_ACT)) || 'null');
    if (prev && prev.shop !== s.info.shop) await disconnectCloud();
    try { await connectCloud(CLOUD_URL, CLOUD_ANON_KEY, r.body.email, r.body.password); }
    catch (e: any) { return { ok: false, reason: 'activation', info: s.info, message: 'Activation enregistrée, mais la connexion au cloud a échoué : ' + (e?.message || e) }; }
    const latest = r.body.key && (await decode(r.body.key))?.shop === s.info.shop ? r.body.key : cleanKey(key);
    await remember(K_LICENSE, latest);
    await remember(K_ACT, JSON.stringify({ shop: s.info.shop, device: code, at: new Date().toISOString() }));
    await forget(K_REVOKED);
  } else {
    await remember(K_LICENSE, cleanKey(key));
  }
  await remember(K_SEEN, String(Date.now()));
  return licenseState();
}

/**
 * Vérification auprès du cloud (licence multi-appareils, quand Internet est là) : appareil retiré, licence
 * renouvelée ou agrandie depuis un autre appareil. Renvoie 'revoked' si l'appareil doit être bloqué.
 */
export async function licenseHeartbeat(): Promise<'ok' | 'revoked' | 'skip'> {
  const info = current;
  if (!info || info.version !== 2 || !navigator.onLine) return 'skip';
  const cfg = await cloudSession().catch(() => null);
  if (!cfg?.accessToken) return 'skip';
  const r = await callCloud({ action: 'status' }, cfg.accessToken).catch(() => null);
  if (!r?.body?.ok) return 'skip';
  if (r.body.revoked) { await remember(K_REVOKED, '1'); return 'revoked'; }
  if (r.body.key && cleanKey(r.body.key) !== cleanKey((await recall(K_LICENSE)) || '')) {
    const next = await decode(r.body.key);
    if (next && next.version === 2 && next.shop === info.shop) { await remember(K_LICENSE, cleanKey(r.body.key)); current = next; }
  }
  return 'ok';
}

/** Nombre de comptes actifs autorisés (0 = illimité). */
export const userLimit = () => (current?.version === 2 ? current.users : 0);

export const frDate = (iso: string) => (iso ? new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
