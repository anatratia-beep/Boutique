// Moyens de paiement de la boutique : liste libre (Paramètres → Paiements).
// Par défaut : Espèces, MVola, Orange Money, Airtel Money (Madagascar). Chaque moyen a son compte en trésorerie (même identifiant).
// Un moyen n'est jamais supprimé (l'historique garde son nom) : on le désactive.
import { get, save } from './db';

export type PayKind = 'cash' | 'mobile' | 'card' | 'bank' | 'other';
export interface PayMethodDef { id: string; label: string; kind: PayKind; active: boolean }

export const KIND_LABELS: Record<PayKind, string> = { cash: 'Espèces', mobile: 'Mobile money', card: 'Carte bancaire', bank: 'Virement / banque', other: 'Autre' };

export const DEFAULT_METHODS: PayMethodDef[] = [
  { id: 'cash', label: 'Espèces', kind: 'cash', active: true },
  { id: 'mvola', label: 'MVola', kind: 'mobile', active: true },
  { id: 'orange', label: 'Orange Money', kind: 'mobile', active: true },
  { id: 'airtel', label: 'Airtel Money', kind: 'mobile', active: true },
];

/** Noms proposés à l'ajout (selon les pays). */
export const SUGGESTED = ['Wave', 'Orange Money', 'MTN MoMo', 'Moov Money', 'M-Pesa', 'Airtel Money', 'MVola', 'Free Money', 'Mixx by Yas', 'Carte bancaire', 'Virement', 'Chèque', 'PayPal', 'Juice (MCB)', 'my.t money'];

/** Tous les moyens, actifs ou non, dans l'ordre choisi. « Espèces » existe toujours. */
export function payMethods(): PayMethodDef[] {
  const rec = get<{ list?: PayMethodDef[] }>('settings', 'payMethods');
  const list = rec?.list?.length ? rec.list : DEFAULT_METHODS;
  return list.some((m) => m.id === 'cash') ? list : [DEFAULT_METHODS[0], ...list];
}
export const activeMethods = () => payMethods().filter((m) => m.active || m.id === 'cash');
export const methodIds = () => activeMethods().map((m) => m.id);
/** Moyens autres que les espèces (mobile money, carte, virement…). */
export const nonCashIds = () => activeMethods().filter((m) => m.id !== 'cash').map((m) => m.id);
/** Nom d'un moyen (même désactivé, pour l'historique). */
export const methodLabel = (id: string) => payMethods().find((m) => m.id === id)?.label ?? (DEFAULT_METHODS.find((m) => m.id === id)?.label ?? id);
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
export const nonCashTitle = () => (activeMethods().filter((m) => m.id !== 'cash').every((m) => m.kind === 'mobile') ? 'Mobile money' : 'Hors espèces');
/** Identifiants des moyens hors espèces, y compris désactivés (pour les totaux de l'historique). */
export const allNonCashIds = () => payMethods().filter((m) => m.id !== 'cash').map((m) => m.id);
