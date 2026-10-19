// Hachage des mots de passe et réponses secrètes (PBKDF2-SHA256) : jamais stockés en clair.

const ITER = 120_000;
const enc = new TextEncoder();
const toHex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const fromHex = (h: string) => new Uint8Array(h.match(/../g)!.map((x) => parseInt(x, 16)));

export async function hashSecret(secret: string, saltHex?: string): Promise<string> {
  const salt = saltHex ? fromHex(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' }, key, 256);
  return `pbkdf2$${ITER}$${toHex(salt.buffer as ArrayBuffer)}$${toHex(bits)}`;
}

export async function verifySecret(secret: string, stored: string | undefined): Promise<boolean> {
  if (!stored) return false;
  const [, , salt, hash] = stored.split('$');
  const again = await hashSecret(secret, salt);
  return again.split('$')[3] === hash;
}

/** Réponse secrète : insensible aux majuscules, accents et espaces superflus. */
export function normalizeAnswer(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// ---- Chiffrement des fichiers de sauvegarde (AES-GCM, clé dérivée d'un mot de passe) ----
async function aesKey(password: string, salt: Uint8Array) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function encryptText(text: string, password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(password, salt), enc.encode(text));
  return { salt: toHex(salt.buffer), iv: toHex(iv.buffer), data: btoaBytes(new Uint8Array(data)) };
}
export async function decryptText(box: { salt: string; iv: string; data: string }, password: string) {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromHex(box.iv) }, await aesKey(password, fromHex(box.salt)), atobBytes(box.data));
  return new TextDecoder().decode(plain);
}
function btoaBytes(b: Uint8Array) {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}
function atobBytes(s: string) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
