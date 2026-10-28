// Fonctions activables : le logiciel reste simple (vente, stock, achats, caisse) et chaque boutique
// active seulement ce dont elle a besoin (Paramètres → Fonctions). Le choix est partagé par tous les appareils.
import { get, save, useTable } from './db';
import type { Company } from './settings';

export type ModuleKey = 'pages' | 'orders' | 'deliveries' | 'prospects' | 'boosts' | 'handovers' | 'eveningRecap' | 'weeklyPayout';

export interface ModuleDef { key: ModuleKey; label: string; description: string; default: boolean; needs?: ModuleKey }

export const MODULES: ModuleDef[] = [
  { key: 'pages', label: 'Pages et variantes', description: 'Plusieurs pages (ex. pages Facebook) ou rayons, chacun avec ses variantes (modèle, couleur, pointure…) et ses vendeurs. Sans cette fonction, les articles sont ajoutés directement, dans une seule boutique.', default: false },
  { key: 'orders', label: 'Commandes clients', description: 'Commandes reçues par téléphone, WhatsApp ou réseaux sociaux, préparées puis remises au client.', default: true },
  { key: 'deliveries', label: 'Livraisons et livreurs', description: 'Zones et frais de livraison, livreurs, colis en livraison et argent rapporté par les livreurs.', default: true, needs: 'orders' },
  { key: 'prospects', label: 'Clients à suivre', description: 'Clients intéressés à relancer avant qu’ils commandent.', default: false, needs: 'orders' },
  { key: 'boosts', label: 'Publicités (boosts)', description: 'Suivi des dépenses de publicité sur les réseaux sociaux et des messages reçus.', default: false },
  { key: 'handovers', label: 'Versements des vendeurs', description: 'Chaque soir, chaque vendeur remet l’argent de ses ventes au responsable.', default: false },
  { key: 'eveningRecap', label: 'Récapitulatif du soir', description: 'Rappel chaque soir d’envoyer le récapitulatif de la journée par WhatsApp.', default: false },
  { key: 'weeklyPayout', label: 'Versement de la semaine au patron', description: 'Chaque fin de semaine, l’argent est remis au patron et la semaine est clôturée.', default: false },
];

const company = () => get<Company>('settings', 'company');
// Tests automatiques (ordinateur de développement) : toutes les fonctions actives par défaut.
const TEST_MACHINE = typeof location !== 'undefined' && location.hostname === 'localhost';

/** Fonction activée ? (réglage de la boutique, sinon valeur par défaut ; une fonction dépendante suit la principale). */
export function moduleOn(k: ModuleKey): boolean {
  const def = MODULES.find((m) => m.key === k)!;
  const v = company()?.modules?.[k];
  const on = v ?? (def.default || TEST_MACHINE);
  return on && (!def.needs || moduleOn(def.needs));
}

/** Même chose, en se mettant à jour quand les paramètres changent. */
export function useModule(k: ModuleKey): boolean {
  useTable('settings');
  return moduleOn(k);
}

export async function setModule(k: ModuleKey, on: boolean) {
  const cur = company()?.modules ?? {};
  await save('settings', { id: 'company', modules: { ...cur, [k]: on } });
}
