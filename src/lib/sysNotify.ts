// Notifications « système » (comme celles des autres applications) : chaque nouvelle notification du logiciel
// s'affiche aussi dans la barre de notifications du téléphone ou de l'ordinateur.
// - Application Android : extension Capacitor « LocalNotifications ».
// - Windows / Mac (application) et navigateur : API Notification standard.
// Une notification déjà montrée ne revient pas (sauf si son contenu change, ex. un nouveau montant).
import { getMeta, setMeta } from './db';

export interface SysNotif { id: string; title: string; text?: string; href?: string }

const cap = () => (window as any).Capacitor;
const native = () => !!cap()?.isNativePlatform?.() && !!cap()?.Plugins?.LocalNotifications;
const LN = () => cap().Plugins.LocalNotifications;
const KEY = 'sysNotifShown';
const MAX_KEPT = 300;

/** Le téléphone / l'ordinateur sait-il afficher des notifications ? */
export const sysNotifSupported = () => native() || typeof Notification !== 'undefined';

/** Autorisation déjà donnée ? */
export async function sysNotifAllowed(): Promise<boolean> {
  try {
    if (native()) return (await LN().checkPermissions()).display === 'granted';
    return typeof Notification !== 'undefined' && Notification.permission === 'granted';
  } catch { return false; }
}

/** Demande l'autorisation (à appeler après un geste de l'utilisateur pour les navigateurs). */
export async function askSysNotif(): Promise<boolean> {
  try {
    if (native()) return (await LN().requestPermissions()).display === 'granted';
    if (typeof Notification === 'undefined') return false;
    if (Notification.permission === 'default') await Notification.requestPermission();
    return Notification.permission === 'granted';
  } catch { return false; }
}

let listening = false;
function listenClicks() {
  if (listening || !native()) return;
  listening = true;
  try { LN().addListener('localNotificationActionPerformed', (e: any) => { const h = e?.notification?.extra?.href; if (h) location.hash = h.replace(/^#/, ''); }); } catch { /* */ }
}

const num = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h) % 2147483000 + 1; };

/** Montre les notifications pas encore montrées (au plus 5 d'un coup). */
export async function pushSysNotifs(list: SysNotif[]) {
  if (!list.length || !(await sysNotifAllowed())) return;
  const shown = getMeta<string[]>(KEY, []);
  const fresh = list.filter((n) => !shown.includes(sig(n)));
  if (!fresh.length) return;
  const batch = fresh.slice(0, 5);
  try {
    if (native()) {
      listenClicks();
      await LN().schedule({ notifications: batch.map((n) => ({ id: num(n.id), title: n.title, body: n.text || '', extra: { href: n.href || '' } })) });
    } else {
      for (const n of batch) {
        const w = new Notification(n.title, { body: n.text || '', tag: n.id, icon: './icons/icon-192.png' });
        w.onclick = () => { try { window.focus(); } catch { /* */ } if (n.href) location.hash = n.href.replace(/^#/, ''); w.close(); };
      }
    }
  } catch { return; }
  await setMeta(KEY, [...shown, ...fresh.map(sig)].slice(-MAX_KEPT));
}
const sig = (n: SysNotif) => `${n.id}|${n.title}`;
