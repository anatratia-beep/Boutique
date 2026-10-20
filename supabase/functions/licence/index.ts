// Fonction « licence » : active un appareil sur la licence d'une boutique et vérifie régulièrement son droit d'accès.
//  POST { action: "activate", key, device, name }  → identifiants cloud de l'appareil (ou refus : places pleines…)
//  POST { action: "status" } + Authorization: Bearer <jeton de l'appareil> → état de la licence, dernière clé
// La clé est vérifiée avec la clé PUBLIQUE du vendeur : impossible de fabriquer une licence sans sa clé secrète.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const VENDOR_PUBLIC_KEY = { kty: 'EC', crv: 'P-256', x: 'PYwNnulG0wqkae1IlrUJ6cZnLW_Wu56vvMTFw92FYvI', y: 'x-o48IX8DWNori5sSQ9XCMBTMlgGZjwkPCqiNbrWkXY' };
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const fail = (code: string, message: string, status = 400) => json({ ok: false, code, message }, status);

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

const b64uToBytes = (s: string) => { const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)); return Uint8Array.from(b, (c) => c.charCodeAt(0)); };
const norm = (s: string) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const today = () => new Date().toISOString().slice(0, 10);
let pub: Promise<CryptoKey> | null = null;

type Lic = { id: string; client: string; shop: string; seats: number; users: number; expires: string; issued: string };
async function decode(key: string): Promise<Lic | null> {
  const k = String(key || '').replace(/\s+/g, '');
  if (!k.startsWith('BTQ-')) return null;
  const [body, sig] = k.slice(4).split('.');
  if (!body || !sig) return null;
  try {
    pub ??= crypto.subtle.importKey('jwk', VENDOR_PUBLIC_KEY, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    if (!(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, await pub, b64uToBytes(sig), new TextEncoder().encode(body)))) return null;
    const p = JSON.parse(new TextDecoder().decode(b64uToBytes(body)));
    if (p.v !== 2 || !p.s) return null;
    return { id: String(p.id || ''), client: String(p.c || ''), shop: String(p.s), seats: Math.max(1, Number(p.n) || 1), users: Math.max(0, Number(p.u) || 0), expires: String(p.e || ''), issued: String(p.i || '') };
  } catch { return null; }
}
const randomPassword = () => Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, '0')).join('');
const deviceEmail = (shop: string, code: string) => `${code.toLowerCase()}.${shop.toLowerCase().replace(/[^a-z0-9]/g, '')}@appareils.boutique-logiciel.mg`;

async function licenceInfo(shop: string) {
  const { data: l } = await admin.from('licences').select('shop, client, seats, users, expires, key, revoked').eq('shop', shop).maybeSingle();
  if (!l) return null;
  const { count } = await admin.from('devices').select('code', { count: 'exact', head: true }).eq('shop', shop).eq('revoked', false);
  return { ...l, used: count ?? 0 };
}

async function activate(body: any) {
  const lic = await decode(body.key);
  if (!lic) return fail('invalid', 'Cette clé de licence n’est pas valide. Vérifiez qu’elle a été copiée en entier.');
  if (lic.expires && lic.expires < today()) return fail('expired', 'Cette licence a expiré. Contactez le vendeur pour la renouveler.', 403);
  const code = norm(body.device);
  if (code.length !== 10) return fail('device', 'Code appareil invalide.');

  // Licence : créée à la première activation, mise à jour quand une clé plus récente arrive (renouvellement, offre plus grande).
  const { data: cur } = await admin.from('licences').select('*').eq('shop', lic.shop).maybeSingle();
  if (cur?.revoked) return fail('revoked', 'Cette licence a été suspendue. Contactez le vendeur.', 403);
  if (!cur) {
    const { error } = await admin.from('licences').insert({ shop: lic.shop, client: lic.client, seats: lic.seats, users: lic.users, expires: lic.expires || null, key: body.key.replace(/\s+/g, ''), issued: lic.issued });
    if (error) return fail('server', 'Erreur du serveur : ' + error.message, 500);
  } else if (lic.issued >= cur.issued && body.key.replace(/\s+/g, '') !== cur.key) {
    await admin.from('licences').update({ client: lic.client, seats: lic.seats, users: lic.users, expires: lic.expires || null, key: body.key.replace(/\s+/g, ''), issued: lic.issued, updated_at: new Date().toISOString() }).eq('shop', lic.shop);
  }

  const name = String(body.name || '').slice(0, 60);
  const password = randomPassword();
  const { data: dev } = await admin.from('devices').select('*').eq('shop', lic.shop).eq('code', code).maybeSingle();
  if (dev?.revoked) return fail('device_revoked', 'Cet appareil a été retiré de la licence. Contactez le vendeur pour le réactiver.', 403);
  if (dev) {
    // Appareil déjà activé (réinstallation, données effacées…) : nouveau mot de passe, même place.
    const { error } = await admin.auth.admin.updateUserById(dev.user_id, { password });
    if (error) return fail('server', 'Erreur du serveur : ' + error.message, 500);
    await admin.from('devices').update({ name: name || dev.name, last_seen: new Date().toISOString() }).eq('shop', lic.shop).eq('code', code);
  } else {
    const info = await licenceInfo(lic.shop);
    if (info && info.used >= info.seats) {
      return fail('full', `Toutes les places de cette licence sont utilisées (${info.used} appareil${info.used > 1 ? 's' : ''} sur ${info.seats}). Retirez un appareil ou demandez une offre plus grande au vendeur.`, 403);
    }
    const email = deviceEmail(lic.shop, code);
    let userId: string | undefined;
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { shop: lic.shop, device: code } });
    if (created.error) {
      // Compte déjà créé lors d'un essai interrompu : on le retrouve.
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const found = list?.users.find((u) => u.email === email);
      if (!found) return fail('server', 'Erreur du serveur : ' + created.error.message, 500);
      await admin.auth.admin.updateUserById(found.id, { password, app_metadata: { shop: lic.shop, device: code } });
      userId = found.id;
    } else userId = created.data.user!.id;
    const { error } = await admin.from('devices').insert({ shop: lic.shop, code, name, user_id: userId });
    if (error) return fail('server', 'Erreur du serveur : ' + error.message, 500);
  }
  const info = await licenceInfo(lic.shop);
  return json({ ok: true, email: deviceEmail(lic.shop, code), password, shop: lic.shop, key: info?.key, seats: info?.seats, users: info?.users, expires: info?.expires, used: info?.used });
}

async function status(req: Request) {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return fail('auth', 'Session de l’appareil manquante.', 401);
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return fail('auth', 'Session de l’appareil expirée.', 401);
  const shop = data.user.app_metadata?.shop, code = data.user.app_metadata?.device;
  if (!shop || !code) return fail('auth', 'Appareil inconnu.', 401);
  const { data: dev } = await admin.from('devices').select('revoked').eq('shop', shop).eq('code', code).maybeSingle();
  const info = await licenceInfo(shop);
  if (!dev || !info) return fail('unknown', 'Licence introuvable.', 404);
  await admin.from('devices').update({ last_seen: new Date().toISOString() }).eq('shop', shop).eq('code', code);
  return json({ ok: true, revoked: dev.revoked || info.revoked, key: info.key, seats: info.seats, users: info.users, expires: info.expires, used: info.used });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return fail('method', 'Méthode non autorisée', 405);
  try {
    const body = await req.json().catch(() => ({}));
    if (body.action === 'activate') return await activate(body);
    if (body.action === 'status') return await status(req);
    return fail('action', 'Action inconnue');
  } catch (e) {
    return fail('server', 'Erreur du serveur : ' + (e instanceof Error ? e.message : String(e)), 500);
  }
});
