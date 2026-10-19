# Relier TSENA au cloud (Supabase) — guide pas à pas

Le cloud sert à **partager les données entre tous les appareils** (téléphones, ordinateurs) et à les **mettre à l'abri**.
Sans cloud, TSENA fonctionne quand même, mais chaque appareil garde ses données pour lui seul.

Durée : environ 10 minutes. Coût : gratuit (offre « Free » de Supabase).

---

## 1. Créer le compte et le projet

1. Allez sur **https://supabase.com** → **Start your project**.
2. Connectez-vous avec votre compte **GitHub** ou votre **Gmail**.
3. Cliquez **New project** :
   - **Name** : `tsena`
   - **Database Password** : cliquez **Generate a password**, puis **notez-le en lieu sûr** (il ne sert pas tous les jours, mais il ne faut pas le perdre).
   - **Region** : choisissez la plus proche, par exemple **Europe (Frankfurt)** ou **Africa (Cape Town)** si elle est proposée.
4. Cliquez **Create new project** et attendez 1 à 2 minutes.

## 2. Installer la table de TSENA

1. Dans le menu de gauche : **SQL Editor** → **New query**.
2. Ouvrez le fichier [`supabase/schema.sql`](../supabase/schema.sql) du dépôt GitHub, copiez **tout** son contenu.
3. Collez-le dans l'éditeur, puis cliquez **Run**.
4. Le message **Success. No rows returned** doit apparaître.

## 3. Créer le compte cloud de la société

C'est un compte unique que **chaque appareil** utilisera pour se relier (les vendeurs et livreurs gardent leurs propres identifiants dans TSENA).

1. Menu de gauche : **Authentication** → **Users** → **Add user** → **Create new user**.
2. **Email** : par exemple `cloud@votresociete.mg` (il n'a pas besoin d'exister vraiment si vous cochez l'option ci-dessous).
3. **Password** : un mot de passe solide, **notez-le**.
4. Cochez **Auto Confirm User**.
5. Cliquez **Create user**.

## 4. Récupérer les deux clés

1. Menu de gauche : **Project Settings** (roue dentée) → **API** (ou **Data API**).
2. Copiez :
   - **Project URL** — ressemble à `https://abcdefgh.supabase.co`
   - **anon public** key (ou **publishable key**) — une longue suite de caractères.

> ⚠️ Ne copiez **jamais** la clé `service_role` / `secret` dans TSENA.

## 5. Relier chaque appareil

Dans TSENA :

- **Premier appareil (le vôtre)** : connectez-vous → **Paramètres** → **Cloud et synchronisation**, puis remplissez les 4 champs (Project URL, clé anon, e-mail et mot de passe du compte cloud) → **Relier au cloud**.
- **Autres appareils** : sur l'écran de connexion, touchez **Relier au cloud**, remplissez les mêmes 4 champs. Les comptes et les données arrivent ; chacun se connecte ensuite avec **son propre** identifiant.

L'indicateur en haut de l'écran montre l'état :

| Indicateur | Signification |
|---|---|
| 🟢 Synchronisé | Tout est à jour |
| 🟠 Synchro… | Échange en cours |
| 🔴 Hors ligne · 5 | Pas d'Internet : 5 modifications attendent, elles partiront toutes seules |
| ⚪ Local | Appareil non relié au cloud |

## Bon à savoir

- Le projet gratuit Supabase se met **en pause après 7 jours sans aucune activité**. Avec une boutique ouverte tous les jours, cela n'arrive pas. S'il est en pause : connectez-vous sur supabase.com et cliquez **Restore project**.
- Une copie complète des données est faite **chaque jour automatiquement** dans le cloud (table `backups`).
