# Boutique (copie vide de TSENA)

Logiciel de gestion commerciale : achats (Chine), stock, ventes en ligne et en boutique, livraisons, trésorerie et rapports — utilisable en ligne et hors ligne, sur téléphone et ordinateur (application web installable).

- **Application en ligne : https://anatratia-beep.github.io/Boutique/**
- Cahier des charges : [docs/CAHIER_DES_CHARGES.md](docs/CAHIER_DES_CHARGES.md)
- Relier au cloud : [docs/GUIDE_CLOUD.md](docs/GUIDE_CLOUD.md)

## Avancement

| Étape | Contenu | État |
|---|---|---|
| 0 | Cahier des charges | ✅ validé |
| 1 | Application installable, connexion, rôles, utilisateurs, thème, logo, hors ligne, synchronisation, sauvegardes | ✅ |
| 2 | Catégories, articles, variantes, stock, inventaire, modèles Excel et import | ✅ |
| 3 | Fournisseurs, commandes Chine, paiements, réception avec facture transit, coût de revient | ✅ |
| 4 | Clients, commandes, préparation, livraisons, livreurs, zones, retours, échanges | ✅ |
| 5 | Vente sur place (comptoir), paiements, impression des tickets 58 mm, bons de livraison, feuilles de route | ✅ terminé |
| 6 | Trésorerie, dépenses, comptes livreurs, clôture, récapitulatif | ✅ terminé |
| 7 | Tableaux de bord, rapports, bénéfice / perte | ✅ terminé |
| 8 | Sauvegardes avancées, réinitialisation par e-mail, outils | ✅ terminé |
| 9 | Rôle Responsable (assigne les livreurs), versements des vendeurs au responsable, récap jours × pages avec boost et bénéfice par page | ✅ terminé |
| 10 | Corrections (stock remis exactement), recherche exacte, inventaire complet, journal avec niveaux et vérification, points de restauration, alerte compte boost | ✅ terminé |

## Licence (version vendue)

- Le logiciel ne s'ouvre qu'avec une **clé de licence** créée par le vendeur pour l'appareil du client (`src/lib/license.ts`).
- Le client envoie son **code appareil** (affiché à l'écran d'activation) ; le vendeur crée la clé dans son espace « Licences Boutique ».
- Licence à vie ou avec date de fin ; vérification entièrement hors ligne ; 1 clé = 1 appareil.
- La **clé secrète du vendeur** n'est jamais dans ce dépôt. Sans elle, impossible de créer de nouvelles clés : la garder en lieu sûr.
- Synchronisation cloud désactivée (`CLOUD_ENABLED = false`).

## Première connexion

Identifiant `super-adm`, mot de passe d'origine fourni séparément — il doit être changé dès la première connexion.

## Technique

- React 19 + TypeScript, construit avec esbuild (`npm run build` → `dist/`), aucune autre dépendance.
- Données locales dans IndexedDB (`src/lib/db.ts`), file d'envoi et synchronisation « dernière modification gagnante » avec Supabase (`src/lib/sync.ts`, `supabase/schema.sql`).
- Service worker maison (`src/sw.js`) pour le fonctionnement hors ligne.
- Hébergement : GitHub Pages (`.github/workflows/deploy.yml`), Netlify (`netlify.toml`) ou Vercel (`vercel.json`).
