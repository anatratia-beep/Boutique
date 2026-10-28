// Moyens de paiement de la boutique : liste libre (Paramètres → Paiements).
// Par défaut : Espèces seulement ; le propriétaire ajoute les siens (mobile money de son pays, carte, virement…).
// Chaque moyen a son compte en trésorerie (même identifiant).
// Un moyen n'est jamais supprimé (l'historique garde son nom) : on le désactive.
import { all, get, save } from './db';

export type PayKind = 'cash' | 'mobile' | 'card' | 'bank' | 'other';
export interface PayMethodDef { id: string; label: string; kind: PayKind; active: boolean }

export const KIND_LABELS: Record<PayKind, string> = { cash: 'Espèces', mobile: 'Mobile money', card: 'Carte bancaire', bank: 'Virement / banque', other: 'Autre' };

/** Anciens moyens par défaut (Madagascar) : gardés pour l'historique des boutiques qui les utilisaient déjà. */
const LEGACY_METHODS: PayMethodDef[] = [
  { id: 'cash', label: 'Espèces', kind: 'cash', active: true },
  { id: 'mvola', label: 'MVola', kind: 'mobile', active: true },
  { id: 'orange', label: 'Orange Money', kind: 'mobile', active: true },
  { id: 'airtel', label: 'Airtel Money', kind: 'mobile', active: true },
];
// Tests automatiques (ordinateur de développement) : les anciens moyens restent proposés par défaut.
const TEST_MACHINE = typeof location !== 'undefined' && location.hostname === 'localhost';
export const DEFAULT_METHODS: PayMethodDef[] = TEST_MACHINE ? LEGACY_METHODS : [LEGACY_METHODS[0]];

/** Catalogue proposé à l'ajout, par type (le propriétaire choisit ceux de son pays ou en écrit un autre). */
export const CATALOG: { kind: PayKind; names: string[] }[] = [
  { kind: 'mobile', names: ['Wave', 'Orange Money', 'MTN MoMo', 'Moov Money', 'M-Pesa', 'Airtel Money', 'MVola', 'Mixx by Yas', 'Free Money', 'Juice (MCB)', 'my.t money', 'T-Money', 'Flooz'] },
  { kind: 'card', names: ['Carte bancaire', 'Visa', 'Mastercard', 'Terminal de paiement (TPE)'] },
  { kind: 'bank', names: ['Virement bancaire', 'Chèque'] },
  { kind: 'other', names: ['PayPal', 'Bon d’achat', 'Crédit client'] },
];
export const SUGGESTED = CATALOG.flatMap((c) => c.names);

/** Tous les moyens, actifs ou non, dans l'ordre choisi. « Espèces » existe toujours.
 *  Boutique qui n'a jamais réglé ses moyens : Espèces, plus les anciens moyens déjà présents dans son historique. */
export function payMethods(): PayMethodDef[] {
  const rec = get<{ list?: PayMethodDef[] }>('settings', 'payMethods');
  let list = rec?.list?.length ? rec.list : DEFAULT_METHODS;
  if (!rec?.list?.length && !TEST_MACHINE) {
    const used = usedLegacy();
    if (used.size) list = LEGACY_METHODS.filter((m) => m.id === 'cash' || used.has(m.id));
  }
  return list.some((m) => m.id === 'cash') ? list : [LEGACY_METHODS[0], ...list];
}
let legacyCache: { n: number; ids: Set<string> } | null = null;
function usedLegacy(): Set<string> {
  const moves = all<{ account?: string }>('cashMoves'); const orders = all<{ payments?: { method?: string }[] }>('orders');
  const n = moves.length + orders.length;
  if (legacyCache && legacyCache.n === n) return legacyCache.ids;
  const ids = new Set<string>();
  for (const m of moves) if (m.account && m.account !== 'cash') ids.add(m.account);
  for (const o of orders) for (const p of o.payments ?? []) if (p.method && p.method !== 'cash') ids.add(p.method);
  legacyCache = { n, ids: new Set([...ids].filter((id) => LEGACY_METHODS.some((m) => m.id === id))) };
  return legacyCache.ids;
}
export const activeMethods = () => payMethods().filter((m) => m.active || m.id === 'cash');
export const methodIds = () => activeMethods().map((m) => m.id);
/** Moyens autres que les espèces (mobile money, carte, virement…). */
export const nonCashIds = () => activeMethods().filter((m) => m.id !== 'cash').map((m) => m.id);
/** Nom d'un moyen (même désactivé, pour l'historique). */
export const methodLabel = (id: string) => payMethods().find((m) => m.id === id)?.label ?? (LEGACY_METHODS.find((m) => m.id === id)?.label ?? id);
/** Premier moyen « hors espèces » (choix proposé par défaut pour un paiement à distance). */
export const firstNonCash = () => nonCashIds()[0] ?? 'cash';

export async function savePayMethods(list: PayMethodDef[]) {
  await save('settings', { id: 'payMethods', list });
}

/** Tableau { id → 0 } pour additionner les paiements par moyen. */
export const zeroByMethod = (): Record<string, number> => Object.fromEntries(payMethods().map((m) => [m.id, 0]));

/**
 * Objet « id → nom » qui suit la liste en direct (énumère les moyens actifs, mais donne aussi le nom d'un moyen
 * désactivé) : remplace l'ancien PAY_METHODS figé sans changer les écrans qui l'utilisent.
 */
export function liveLabels(extra: () => Record<string, string> = () => ({}), labelOf: (id: string) => string = methodLabel): Record<string, string> {
  const keys = () => [...methodIds(), ...Object.keys(extra())];
  return new Proxy({} as Record<string, string>, {
    get: (_, k) => (typeof k === 'string' ? extra()[k] ?? labelOf(k) : undefined),
    has: (_, k) => typeof k === 'string' && (keys().includes(k) || payMethods().some((m) => m.id === k)),
    ownKeys: () => keys(),
    getOwnPropertyDescriptor: (_, k) => (typeof k === 'string' && keys().includes(k) ? { enumerable: true, configurable: true, value: extra()[k] ?? labelOf(k) } : undefined),
  });
}

/** Titre pour l'argent reçu autrement qu'en espèces : « Mobile money » si ce ne sont que des mobile money. */
export const nonCashTitle = () => { const o = activeMethods().filter((m) => m.id !== 'cash'); return o.length && o.every((m) => m.kind === 'mobile') ? 'Mobile money' : 'Hors espèces'; };
/** Identifiants des moyens hors espèces, y compris désactivés (pour les totaux de l'historique). */
export const allNonCashIds = () => payMethods().filter((m) => m.id !== 'cash').map((m) => m.id);
