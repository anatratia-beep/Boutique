// Devise de la boutique : choisie dans Paramètres → Société (Ariary par défaut).
// Tous les montants du logiciel sont exprimés dans cette devise ; certaines ont des centimes (€, $, Rs…), d'autres non (Ar, FCFA…).
import { get } from './db';
import { loc } from './i18n';

export interface CurrencyDef { code: string; symbol: string; decimals: number; before?: boolean; name: string }

export const CURRENCIES: CurrencyDef[] = [
  { code: 'MGA', symbol: 'Ar', decimals: 0, name: 'Ariary malgache' },
  { code: 'XOF', symbol: 'FCFA', decimals: 0, name: 'Franc CFA (Afrique de l’Ouest)' },
  { code: 'XAF', symbol: 'FCFA', decimals: 0, name: 'Franc CFA (Afrique centrale)' },
  { code: 'KMF', symbol: 'FC', decimals: 0, name: 'Franc comorien' },
  { code: 'GNF', symbol: 'FG', decimals: 0, name: 'Franc guinéen' },
  { code: 'CDF', symbol: 'FC', decimals: 0, name: 'Franc congolais' },
  { code: 'RWF', symbol: 'FRw', decimals: 0, name: 'Franc rwandais' },
  { code: 'BIF', symbol: 'FBu', decimals: 0, name: 'Franc burundais' },
  { code: 'DJF', symbol: 'Fdj', decimals: 0, name: 'Franc djiboutien' },
  { code: 'XPF', symbol: 'F', decimals: 0, name: 'Franc CFP (Pacifique)' },
  { code: 'MRU', symbol: 'UM', decimals: 2, name: 'Ouguiya mauritanien' },
  { code: 'EUR', symbol: '€', decimals: 2, name: 'Euro' },
  { code: 'USD', symbol: '$', decimals: 2, before: true, name: 'Dollar américain' },
  { code: 'CAD', symbol: '$', decimals: 2, name: 'Dollar canadien' },
  { code: 'CHF', symbol: 'CHF', decimals: 2, name: 'Franc suisse' },
  { code: 'GBP', symbol: '£', decimals: 2, before: true, name: 'Livre sterling' },
  { code: 'MUR', symbol: 'Rs', decimals: 2, before: true, name: 'Roupie mauricienne' },
  { code: 'SCR', symbol: 'SR', decimals: 2, before: true, name: 'Roupie seychelloise' },
  { code: 'MAD', symbol: 'DH', decimals: 2, name: 'Dirham marocain' },
  { code: 'DZD', symbol: 'DA', decimals: 2, name: 'Dinar algérien' },
  { code: 'TND', symbol: 'DT', decimals: 3, name: 'Dinar tunisien' },
  { code: 'HTG', symbol: 'G', decimals: 2, name: 'Gourde haïtienne' },
  { code: 'NGN', symbol: '₦', decimals: 2, before: true, name: 'Naira nigérian' },
  { code: 'GHS', symbol: 'GH₵', decimals: 2, before: true, name: 'Cedi ghanéen' },
  { code: 'KES', symbol: 'KSh', decimals: 2, before: true, name: 'Shilling kényan' },
  { code: 'TZS', symbol: 'TSh', decimals: 0, before: true, name: 'Shilling tanzanien' },
  { code: 'UGX', symbol: 'USh', decimals: 0, before: true, name: 'Shilling ougandais' },
  { code: 'ZAR', symbol: 'R', decimals: 2, before: true, name: 'Rand sud-africain' },
  { code: 'INR', symbol: '₹', decimals: 2, before: true, name: 'Roupie indienne' },
  { code: 'CNY', symbol: '¥', decimals: 2, before: true, name: 'Yuan chinois' },
];

const MGA = CURRENCIES[0];

/** Devise courante (lue à chaque appel : un changement dans les paramètres s'applique tout de suite). */
export function currency(): CurrencyDef {
  const c = get<any>('settings', 'company');
  const def = CURRENCIES.find((x) => x.code === c?.currency) ?? MGA;
  const symbol = (c?.currencySymbol || '').trim();
  return symbol ? { ...def, symbol } : def;
}

/** Symbole de la devise (« Ar », « € », « FCFA »…), pour les libellés : « Prix (Ar) ». */
export const curSym = () => currency().symbol;
/** Nombre de décimales de la devise (0 pour Ar/FCFA, 2 pour €/$…). */
export const moneyDecimals = () => currency().decimals;
/** Le clavier du téléphone : chiffres seuls, ou avec la virgule si la devise a des centimes. */
export const moneyInputMode = (): 'numeric' | 'decimal' => (moneyDecimals() ? 'decimal' : 'numeric');

/** Arrondi d'un montant à la précision de la devise (à l'unité pour Ar, au centime pour €). */
export function roundMoney(n: number): number {
  const f = 10 ** moneyDecimals();
  return Math.round((n + Number.EPSILON * Math.sign(n)) * f) / f;
}

/** Nombre formaté sans symbole : « 20 000 », « 19,99 ». */
export function fmtAmount(n: number): string {
  const d = moneyDecimals();
  return roundMoney(n).toLocaleString(loc(), { minimumFractionDigits: d, maximumFractionDigits: d });
}

/** Montant avec symbole : « 20 000 Ar », « 19,99 € », « $ 19,99 ». */
export function fmtMoney(n?: number | null): string {
  if (n == null || isNaN(n)) return '—';
  const c = currency();
  const v = fmtAmount(n);
  return c.before ? `${n < 0 ? '-' : ''}${c.symbol} ${v.replace('-', '')}` : `${v} ${c.symbol}`;
}

/**
 * Lit un montant saisi : « 20000 », « 20 000 », « 20.000 Ar », « 19,99 », « 1 234,50 € », « 1,234.50 ».
 * Sans centimes, tous les séparateurs sont des séparateurs de milliers (comme avant).
 */
export function parseMoney(s: string | number | null | undefined): number | undefined {
  if (s == null) return undefined;
  if (typeof s === 'number') return isNaN(s) ? undefined : roundMoney(s);
  const neg = s.trim().startsWith('-');
  const t = s.replace(/[^\d.,]/g, '');
  if (!/\d/.test(t)) return undefined;
  const d = moneyDecimals();
  let n: number;
  const m = d ? /^(.*?)[.,](\d+)$/.exec(t) : null;
  if (m && m[2].length <= d) n = Number((m[1].replace(/[^\d]/g, '') || '0') + '.' + m[2]);
  else n = Number(t.replace(/[^\d]/g, ''));
  return (neg ? -1 : 1) * roundMoney(n);
}
