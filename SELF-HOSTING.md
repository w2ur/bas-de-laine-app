# Self-hosting Bas de Laine

- [English](#english)
- [Français](#français)

---

## English

This guide explains how to run your own copy of Bas de Laine, with your own data, on your own Neon and Vercel accounts. Nobody hosts data for you: the database, the sign-in service and the deployment all belong to you.

### Contents

1. [How it works](#how-it-works)
2. [Prerequisites](#prerequisites)
3. [Get the code](#get-the-code)
4. [Create the Neon project and database](#create-the-neon-project-and-database)
5. [Configure Neon Auth](#configure-neon-auth)
6. [Environment variables](#environment-variables)
7. [Deploy on Vercel](#deploy-on-vercel)
8. [Disable preview deployments](#disable-preview-deployments)
9. [First sign-in and the household](#first-sign-in-and-the-household)
10. [Check that sign-in works](#check-that-sign-in-works)
11. [Backups](#backups)
12. [Updating](#updating)
13. [Local development](#local-development)

### How it works

- **One deployment = one household.** The first allowed sign-in creates an empty household; every later allowed member joins that same household and sees the same envelopes and money. A second household needs its own deployment and its own database.
- **Sign-in is by e-mail code only** (Neon Auth email OTP). There is no password and no social login.
- **Who may sign in** is decided by the `ALLOWED_EMAILS` variable, not by Neon Auth.
- **Database migrations** run automatically on every Vercel *production* build (the `vercel-build` script runs `prisma migrate deploy` only when `VERCEL_ENV=production`).

### Prerequisites

1. **Node.js 24.** The repository pins it in `.nvmrc`. Vercel supports Node up to 24, so do not use a newer major version locally either.
2. **A Neon account** (https://neon.tech). It provides the PostgreSQL database and Neon Auth.
3. **A Vercel account** (https://vercel.com). The free Hobby plan is for **non-commercial use only**; a budget for your own household fits, anything commercial needs a paid plan.
4. **Git**, and a GitHub (or GitLab/Bitbucket) account so Vercel can deploy from your repository.
5. Optional, for backups: the PostgreSQL client tools (`pg_dump`, `pg_restore`), in a version at least as recent as your Neon database's PostgreSQL version.

### Get the code

1. Create your own repository from the public one, either by forking https://github.com/w2ur/bas-de-laine-app on GitHub, or by cloning it and pushing it to a new repository you own:

   ```bash
   git clone https://github.com/w2ur/bas-de-laine-app.git bas-de-laine
   cd bas-de-laine
   git remote rename origin upstream
   git remote add origin <your-own-repository-url>
   git push -u origin main
   ```

2. The code is licensed under the GNU AGPL-3.0 (`LICENSE`). If you modify it and let other people use your instance over a network, the license requires you to offer them the source of your modified version.

### Create the Neon project and database

1. In the Neon console, create a new project for production. Pick a region close to your Vercel functions.
2. Open the project's connection details and copy two connection strings for the same database:
   - the **pooled** connection string (its host name contains `-pooler`): this becomes `DATABASE_URL`. The app uses it at runtime.
   - the **direct** connection string (same host without `-pooler`): this becomes `DIRECT_URL`. The Prisma CLI uses it (`prisma.config.ts` reads `DIRECT_URL`) for `prisma generate`, `prisma migrate deploy` and `prisma migrate dev`. Migrations must not go through the pooler.
3. Keep `?sslmode=require` at the end of both strings.

### Configure Neon Auth

The app talks to Neon Auth through `NEON_AUTH_BASE_URL` and only ever calls the e-mail code flow (`emailOtp.sendVerificationOtp`, then `signIn.emailOtp`).

1. In the Neon console, open your project's **Auth** page and enable Neon Auth.
2. Enable **Email OTP** (e-mail one-time code) sign-in.
3. **Disable** e-mail + password sign-in, and do **not** configure any OAuth provider. The app has no UI for them, and it refuses any account whose e-mail is not verified, but leaving them off removes that surface entirely.
4. **Do not allow localhost** on the production project. Localhost is for a development project only (see [Local development](#local-development)).
5. **Add your production origin to the trusted domains**, for example `https://budget.example.com` (or the `*.vercel.app` URL Vercel gives you, if you use no custom domain). Add every origin people will sign in from.

   > **An empty trusted-domain list locks everyone out.** Once localhost is off, if no trusted domain is listed, every sign-in request from your site is rejected with `INVALID_ORIGIN` and nobody can sign in. You do not know your Vercel URL until the first deployment: come back to this step right after [Deploy on Vercel](#deploy-on-vercel).

6. Copy the **Auth URL** shown on the Auth page (it looks like `https://<something>.auth.neon.tech`). This becomes `NEON_AUTH_BASE_URL`.

### Environment variables

The full list is in `.env.example`. There are five variables, all required.

| Variable | What it is | Where to get it |
|---|---|---|
| `DATABASE_URL` | Pooled PostgreSQL connection string, used by the app at runtime | Neon console, pooled connection string (host contains `-pooler`) |
| `DIRECT_URL` | Direct PostgreSQL connection string, used by the Prisma CLI (generate, migrations) | Neon console, direct connection string |
| `NEON_AUTH_BASE_URL` | Your Neon Auth endpoint | Neon console, Auth page, Auth URL |
| `NEON_AUTH_COOKIE_SECRET` | Secret that signs the session cookies, at least 32 characters | Generate it yourself (below) |
| `ALLOWED_EMAILS` | Comma-separated list of the e-mail addresses allowed to sign in | Your household's addresses |

**Generating the cookie secret.**

1. Run:

   ```bash
   openssl rand -base64 32
   ```

2. Paste the output as the value of `NEON_AUTH_COOKIE_SECRET`. Use a different secret for production and for development.

The app **refuses to start** when this secret is missing, shorter than 32 characters, or still the example value from `.env.example` (any value starting with `change-me`). The check is `assertUsableCookieSecret` in `src/lib/auth/cookie-secret.ts`; it runs when the auth module loads, so a bad secret also fails the build.

**`ALLOWED_EMAILS` rules** (`src/lib/auth/access.ts`, `src/lib/auth/server.ts`):

- Addresses are trimmed and compared in lower case, so `Alice@Example.com` and `alice@example.com` are the same.
- **Non-empty list:** only listed addresses get in, including people who already have an account. Removing an address from the list removes that person's access.
- **Empty list:** no new account is ever created (fail-closed). People who already signed in once keep working, so the household is not locked out if the variable is cleared by mistake.
- **Every listed address joins the one household.** Only list people who share this budget.

### Deploy on Vercel

1. In Vercel, import your repository as a new project. The framework is detected as Next.js. Vercel runs the `vercel-build` script from `package.json`, which runs `prisma migrate deploy` on production builds and then `next build`.
2. Set the **Node.js version to 24** in the project settings (`package.json` only says `>=20`).
3. Before the first deployment, add the five environment variables above in the project settings. Scope them to the **Production** environment only (see [Disable preview deployments](#disable-preview-deployments)). They are needed at build time: Prisma reads `DIRECT_URL` to apply migrations, and the build loads the auth module, which checks the cookie secret.
4. Deploy. The production build applies every migration in `prisma/migrations/` to your empty Neon database. **Never run `prisma db seed` against production**: the seed writes a fictional demo household, and the first real member would join it and inherit its demo data.
5. Optional: attach a custom domain (for example `budget.example.com`) in Vercel.
6. Go back to [Configure Neon Auth](#configure-neon-auth), step 5, and add the final production origin (custom domain and/or `*.vercel.app` URL) to the trusted domains.
7. Leave the server time zone alone. Vercel functions run in UTC, which is what the app expects: its date logic requires the server time zone to be UTC or east of UTC. Never set a `TZ` variable west of UTC.

### Disable preview deployments

Preview deployments (built from branches and pull requests) would use **the same environment variables, and therefore the same production database**, as production. The `vercel-build` script already skips migrations outside production, but a preview's code still reads and writes your real data.

1. In the Vercel project settings, under Git, set an **Ignored Build Step** that only builds production, for example:

   ```bash
   if [ "$VERCEL_ENV" = "production" ]; then exit 1; else exit 0; fi
   ```

   (Exit code 1 means "build", 0 means "skip".)

2. As a second safety, keep all five environment variables scoped to **Production** only. A preview build then has no cookie secret and fails instead of connecting to your database.

### First sign-in and the household

1. Make sure `ALLOWED_EMAILS` contains at least your own address and that the deployment has been rebuilt since you set it.
2. Open your production URL. You are redirected to `/auth/sign-in`.
3. Enter your e-mail, receive the code, type it in.
4. On this first allowed sign-in, the app creates an empty household and your user, linked to it (`getHousehold()` in `src/lib/auth/server.ts`: it uses the existing household if there is one, otherwise it creates one).
5. Every other address in `ALLOWED_EMAILS` that signs in later joins that same household.
6. A refused address gets an error page ("Email non autorisé"); an unverified address is refused before the allowlist is even checked.

The user interface is in French.

### Check that sign-in works

Do this after the first deployment and **after every change to the Neon Auth settings**. Checking that options are switched *off* is not enough; check that the real sign-in path still *works*.

1. Open the production URL (for example `https://budget.example.com`) in a private browser window.
2. Request a code with an address from `ALLOWED_EMAILS`. You must receive the e-mail, and the code must sign you in.
3. If the request fails with `INVALID_ORIGIN` (visible in the browser's network tab), the production origin is missing from Neon Auth's trusted domains: add it (see [Configure Neon Auth](#configure-neon-auth), step 5).

Optional command-line probe of the origin check (the code request goes through the app's `/api/auth` proxy):

```bash
# With your origin: the request must NOT be rejected as INVALID_ORIGIN
# (an invalid address like "x" should be rejected as an invalid e-mail instead).
curl -s -X POST https://budget.example.com/api/auth/email-otp/send-verification-otp \
  -H 'Content-Type: application/json' -H 'Origin: https://budget.example.com' \
  -d '{"email":"x","type":"sign-in"}'

# Control, with a foreign origin: this one MUST be rejected as INVALID_ORIGIN.
curl -s -X POST https://budget.example.com/api/auth/email-otp/send-verification-otp \
  -H 'Content-Type: application/json' -H 'Origin: https://evil.example' \
  -d '{"email":"x","type":"sign-in"}'
```

### Backups

There are two kinds of backup. Do both, and test a restore at least once.

**A. Full database dump (recommended, for disaster recovery).**

1. Dump with the **direct** connection string (not the pooled one):

   ```bash
   pg_dump -Fc "$DIRECT_URL" -f bas-de-laine-$(date +%F).dump
   ```

2. Store the file somewhere outside Neon and outside Vercel. It contains all your financial data: treat it as private.
3. To restore into the same Neon project (for example after a bad manual change):

   ```bash
   pg_restore --clean --if-exists --no-owner --no-acl -d "$DIRECT_URL" bas-de-laine-YYYY-MM-DD.dump
   ```

   `--clean` drops the existing objects before recreating them: everything written since the dump is lost.

4. Restoring a dump into a **different** Neon project with a **new** Neon Auth instance does not carry the sign-in accounts over cleanly: the `users` table links each member to a Neon Auth id and keeps the e-mail unique, so a member who signs in with a new Neon Auth account but an e-mail already present in `users` cannot be provisioned. To move to a new project, use the JSON export below instead.

**B. JSON export from the app.**

1. In the app, open **Configuration**, card **Sauvegarde et restauration**, and click **Exporter**. You get `bas-de-laine-backup-YYYY-MM-DD.json` with the household's income, the envelopes and their transactions, the recurring charges and the treasury. It does not contain user accounts.
2. **Importer** reads such a file back. Importing **replaces** all of the current household's data (envelopes, transactions, recurring charges, treasury) with the file's content, after a confirmation.
3. Size limit: the app accepts files up to 10 MB (a browser-side check, and the Server Action body limit in `next.config.ts`), but **Vercel caps a function request body at 4.5 MB**, so on Vercel an import larger than about 4.5 MB fails. For a household that large, use the database dump.
4. To move to a new deployment: export from the old one, sign in once on the new one (this creates the empty household), then import.

### Updating

1. Back up first (database dump, above).
2. Fetch the new release from the public repository and merge it into your copy:

   ```bash
   git remote add upstream https://github.com/w2ur/bas-de-laine-app.git   # once
   git fetch upstream
   git merge upstream/main
   ```

3. Run the checks locally, especially if you changed anything:

   ```bash
   npm install
   npm test
   npm run lint
   npm run build
   ```

4. Push to your repository's `main` branch. Vercel builds production, and the `vercel-build` script applies any new migration with `prisma migrate deploy` before building.
5. If you deploy some other way, apply migrations yourself, with `DIRECT_URL` set:

   ```bash
   npm run db:migrate:deploy
   ```

6. The app is a PWA with a service worker: an installed copy picks up the new version after it reloads.

### Local development

Use a **separate Neon project for development**, never the production database. In that development project's Neon Auth, enable Email OTP and **allow localhost**.

1. Install Node 24 (for example `nvm use`, which reads `.nvmrc`).
2. Create `.env` **before** `npm install`: the `postinstall` script runs `prisma generate`, and the Prisma config reads `DIRECT_URL`.

   ```bash
   cp .env.example .env
   ```

3. Fill in `.env` with the development project's values and a newly generated cookie secret (`openssl rand -base64 32`). Never commit `.env`.
4. Install and create the schema:

   ```bash
   npm install
   npx prisma migrate dev
   ```

5. Optional, development database only: load fictional demo data with `npx prisma db seed`. Without it, an empty household is created at the first allowed sign-in.
6. Start the app:

   ```bash
   npm run dev
   ```

   It runs on http://localhost:3000. The service worker is disabled in development.

7. Useful scripts: `npm test` (Vitest), `npm run lint` (type-checks the seed, then runs ESLint), `npm run build`, `npm run db:studio` (Prisma Studio). Schema changes always ship a migration created with `npx prisma migrate dev`; never use `prisma db push`.

---

## Français

Ce guide explique comment faire tourner votre propre copie de Bas de Laine, avec vos propres données, sur vos propres comptes Neon et Vercel. Personne n'héberge vos données à votre place : la base de données, le service de connexion et le déploiement vous appartiennent.

### Sommaire

1. [Fonctionnement](#fonctionnement)
2. [Prérequis](#prérequis)
3. [Récupérer le code](#récupérer-le-code)
4. [Créer le projet et la base Neon](#créer-le-projet-et-la-base-neon)
5. [Configurer Neon Auth](#configurer-neon-auth)
6. [Variables d'environnement](#variables-denvironnement)
7. [Déployer sur Vercel](#déployer-sur-vercel)
8. [Désactiver les déploiements de preview](#désactiver-les-déploiements-de-preview)
9. [Première connexion et foyer](#première-connexion-et-foyer)
10. [Vérifier que la connexion fonctionne](#vérifier-que-la-connexion-fonctionne)
11. [Sauvegardes](#sauvegardes)
12. [Mises à jour](#mises-à-jour)
13. [Développement local](#développement-local)

### Fonctionnement

- **Un déploiement = un foyer.** La première connexion autorisée crée un foyer vide ; chaque membre autorisé qui se connecte ensuite rejoint ce même foyer et voit les mêmes enveloppes et le même argent. Un deuxième foyer a besoin de son propre déploiement et de sa propre base.
- **La connexion se fait uniquement par code envoyé par e-mail** (Neon Auth, email OTP). Pas de mot de passe, pas de connexion via un réseau social.
- **Qui peut se connecter** est décidé par la variable `ALLOWED_EMAILS`, pas par Neon Auth.
- **Les migrations de base** s'appliquent automatiquement à chaque build Vercel de *production* (le script `vercel-build` lance `prisma migrate deploy` uniquement quand `VERCEL_ENV=production`).

### Prérequis

1. **Node.js 24.** Le dépôt le fixe dans `.nvmrc`. Vercel accepte Node jusqu'à la version 24 : n'utilisez pas non plus de version majeure plus récente en local.
2. **Un compte Neon** (https://neon.tech). Il fournit la base PostgreSQL et Neon Auth.
3. **Un compte Vercel** (https://vercel.com). L'offre gratuite Hobby est réservée à un **usage non commercial** ; le budget de votre propre foyer convient, tout usage commercial demande une offre payante.
4. **Git**, et un compte GitHub (ou GitLab/Bitbucket) pour que Vercel déploie depuis votre dépôt.
5. Facultatif, pour les sauvegardes : les outils clients PostgreSQL (`pg_dump`, `pg_restore`), dans une version au moins aussi récente que celle de PostgreSQL sur votre base Neon.

### Récupérer le code

1. Créez votre propre dépôt à partir du dépôt public, soit en forkant https://github.com/w2ur/bas-de-laine-app sur GitHub, soit en le clonant puis en le poussant vers un nouveau dépôt à vous :

   ```bash
   git clone https://github.com/w2ur/bas-de-laine-app.git bas-de-laine
   cd bas-de-laine
   git remote rename origin upstream
   git remote add origin <url-de-votre-dépôt>
   git push -u origin main
   ```

2. Le code est sous licence GNU AGPL-3.0 (`LICENSE`). Si vous le modifiez et laissez d'autres personnes utiliser votre instance via un réseau, la licence vous oblige à leur proposer le code source de votre version modifiée.

### Créer le projet et la base Neon

1. Dans la console Neon, créez un nouveau projet pour la production. Choisissez une région proche de vos fonctions Vercel.
2. Ouvrez les informations de connexion du projet et copiez deux chaînes de connexion vers la même base :
   - la chaîne **poolée** (son nom d'hôte contient `-pooler`) : elle devient `DATABASE_URL`. L'application l'utilise à l'exécution.
   - la chaîne **directe** (même hôte sans `-pooler`) : elle devient `DIRECT_URL`. La CLI Prisma l'utilise (`prisma.config.ts` lit `DIRECT_URL`) pour `prisma generate`, `prisma migrate deploy` et `prisma migrate dev`. Les migrations ne doivent pas passer par le pooler.
3. Gardez `?sslmode=require` à la fin des deux chaînes.

### Configurer Neon Auth

L'application parle à Neon Auth via `NEON_AUTH_BASE_URL` et n'appelle que le parcours par code e-mail (`emailOtp.sendVerificationOtp`, puis `signIn.emailOtp`).

1. Dans la console Neon, ouvrez la page **Auth** du projet et activez Neon Auth.
2. Activez la connexion **Email OTP** (code à usage unique par e-mail).
3. **Désactivez** la connexion e-mail + mot de passe, et ne configurez **aucun** fournisseur OAuth. L'application n'a pas d'interface pour eux et refuse tout compte dont l'e-mail n'est pas vérifié, mais les laisser désactivés supprime entièrement cette surface.
4. **N'autorisez pas localhost** sur le projet de production. Localhost sert uniquement à un projet de développement (voir [Développement local](#développement-local)).
5. **Ajoutez votre origine de production aux domaines de confiance** (trusted domains), par exemple `https://budget.example.com` (ou l'URL `*.vercel.app` fournie par Vercel si vous n'utilisez pas de domaine personnalisé). Ajoutez chaque origine depuis laquelle on se connectera.

   > **Une liste de domaines de confiance vide bloque tout le monde.** Une fois localhost désactivé, si aucun domaine de confiance n'est listé, chaque demande de connexion venant de votre site est refusée avec `INVALID_ORIGIN` et personne ne peut se connecter. Vous ne connaissez votre URL Vercel qu'après le premier déploiement : revenez à cette étape juste après [Déployer sur Vercel](#déployer-sur-vercel).

6. Copiez l'**Auth URL** affichée sur la page Auth (de la forme `https://<quelque-chose>.auth.neon.tech`). Elle devient `NEON_AUTH_BASE_URL`.

### Variables d'environnement

La liste complète est dans `.env.example`. Il y a cinq variables, toutes obligatoires.

| Variable | Ce que c'est | Où l'obtenir |
|---|---|---|
| `DATABASE_URL` | Chaîne de connexion PostgreSQL poolée, utilisée par l'application à l'exécution | Console Neon, chaîne poolée (l'hôte contient `-pooler`) |
| `DIRECT_URL` | Chaîne de connexion PostgreSQL directe, utilisée par la CLI Prisma (generate, migrations) | Console Neon, chaîne directe |
| `NEON_AUTH_BASE_URL` | Votre point d'accès Neon Auth | Console Neon, page Auth, Auth URL |
| `NEON_AUTH_COOKIE_SECRET` | Secret qui signe les cookies de session, 32 caractères minimum | À générer vous-même (ci-dessous) |
| `ALLOWED_EMAILS` | Liste, séparée par des virgules, des adresses e-mail autorisées à se connecter | Les adresses de votre foyer |

**Générer le secret des cookies.**

1. Lancez :

   ```bash
   openssl rand -base64 32
   ```

2. Collez le résultat comme valeur de `NEON_AUTH_COOKIE_SECRET`. Utilisez un secret différent en production et en développement.

L'application **refuse de démarrer** quand ce secret est absent, fait moins de 32 caractères ou vaut encore la valeur d'exemple de `.env.example` (toute valeur commençant par `change-me`). La vérification est `assertUsableCookieSecret` dans `src/lib/auth/cookie-secret.ts` ; elle s'exécute au chargement du module d'authentification, donc un mauvais secret fait aussi échouer le build.

**Règles de `ALLOWED_EMAILS`** (`src/lib/auth/access.ts`, `src/lib/auth/server.ts`) :

- Les adresses sont débarrassées de leurs espaces et comparées en minuscules : `Alice@Example.com` et `alice@example.com` sont la même adresse.
- **Liste non vide :** seules les adresses listées entrent, y compris les personnes qui ont déjà un compte. Retirer une adresse de la liste retire l'accès à cette personne.
- **Liste vide :** aucun nouveau compte n'est jamais créé (fermé par défaut). Les personnes qui se sont déjà connectées une fois continuent d'accéder, pour que le foyer ne soit pas bloqué si la variable est vidée par erreur.
- **Chaque adresse listée rejoint l'unique foyer.** Ne listez que les personnes qui partagent ce budget.

### Déployer sur Vercel

1. Dans Vercel, importez votre dépôt comme nouveau projet. Le framework est détecté comme Next.js. Vercel lance le script `vercel-build` de `package.json`, qui exécute `prisma migrate deploy` sur les builds de production, puis `next build`.
2. Réglez la **version de Node.js sur 24** dans les paramètres du projet (`package.json` indique seulement `>=20`).
3. Avant le premier déploiement, ajoutez les cinq variables d'environnement ci-dessus dans les paramètres du projet. Limitez-les à l'environnement **Production** (voir [Désactiver les déploiements de preview](#désactiver-les-déploiements-de-preview)). Elles sont nécessaires au build : Prisma lit `DIRECT_URL` pour appliquer les migrations, et le build charge le module d'authentification, qui vérifie le secret des cookies.
4. Déployez. Le build de production applique toutes les migrations de `prisma/migrations/` à votre base Neon vide. **Ne lancez jamais `prisma db seed` sur la production** : le seed écrit un foyer de démonstration fictif, et le premier vrai membre le rejoindrait et hériterait de ses données de démonstration.
5. Facultatif : rattachez un domaine personnalisé (par exemple `budget.example.com`) dans Vercel.
6. Revenez à [Configurer Neon Auth](#configurer-neon-auth), étape 5, et ajoutez l'origine de production définitive (domaine personnalisé et/ou URL `*.vercel.app`) aux domaines de confiance.
7. Ne touchez pas au fuseau horaire du serveur. Les fonctions Vercel tournent en UTC, ce que l'application attend : sa logique de dates exige un fuseau serveur en UTC ou à l'est d'UTC. Ne définissez jamais de variable `TZ` à l'ouest d'UTC.

### Désactiver les déploiements de preview

Les déploiements de preview (construits depuis les branches et les pull requests) utiliseraient **les mêmes variables d'environnement, donc la même base de production**, que la production. Le script `vercel-build` saute déjà les migrations hors production, mais le code d'une preview lit et écrit quand même vos vraies données.

1. Dans les paramètres du projet Vercel, rubrique Git, définissez une **Ignored Build Step** qui ne construit que la production, par exemple :

   ```bash
   if [ "$VERCEL_ENV" = "production" ]; then exit 1; else exit 0; fi
   ```

   (Le code de sortie 1 signifie « construire », 0 signifie « ignorer ».)

2. Seconde sécurité : gardez les cinq variables d'environnement limitées à **Production**. Un build de preview n'a alors pas de secret de cookies et échoue au lieu de se connecter à votre base.

### Première connexion et foyer

1. Vérifiez que `ALLOWED_EMAILS` contient au moins votre propre adresse et que le déploiement a été reconstruit depuis que vous l'avez définie.
2. Ouvrez votre URL de production. Vous êtes redirigé vers `/auth/sign-in`.
3. Saisissez votre e-mail, recevez le code, tapez-le.
4. Lors de cette première connexion autorisée, l'application crée un foyer vide et votre utilisateur, rattaché à ce foyer (`getHousehold()` dans `src/lib/auth/server.ts` : il reprend le foyer existant s'il y en a un, sinon il en crée un).
5. Chaque autre adresse de `ALLOWED_EMAILS` qui se connecte ensuite rejoint ce même foyer.
6. Une adresse refusée obtient une page d'erreur (« Email non autorisé ») ; une adresse non vérifiée est refusée avant même la consultation de la liste.

L'interface est en français.

### Vérifier que la connexion fonctionne

Faites-le après le premier déploiement et **après chaque modification des réglages Neon Auth**. Vérifier que des options sont *désactivées* ne suffit pas ; vérifiez que le vrai parcours de connexion *fonctionne* encore.

1. Ouvrez l'URL de production (par exemple `https://budget.example.com`) dans une fenêtre de navigation privée.
2. Demandez un code avec une adresse de `ALLOWED_EMAILS`. Vous devez recevoir l'e-mail, et le code doit vous connecter.
3. Si la demande échoue avec `INVALID_ORIGIN` (visible dans l'onglet réseau du navigateur), l'origine de production manque dans les domaines de confiance de Neon Auth : ajoutez-la (voir [Configurer Neon Auth](#configurer-neon-auth), étape 5).

Sonde facultative, en ligne de commande, de la vérification d'origine (la demande de code passe par le proxy `/api/auth` de l'application) :

```bash
# Avec votre origine : la demande ne doit PAS être refusée en INVALID_ORIGIN
# (une adresse invalide comme "x" doit plutôt être refusée comme e-mail invalide).
curl -s -X POST https://budget.example.com/api/auth/email-otp/send-verification-otp \
  -H 'Content-Type: application/json' -H 'Origin: https://budget.example.com' \
  -d '{"email":"x","type":"sign-in"}'

# Témoin, avec une origine étrangère : celle-ci DOIT être refusée en INVALID_ORIGIN.
curl -s -X POST https://budget.example.com/api/auth/email-otp/send-verification-otp \
  -H 'Content-Type: application/json' -H 'Origin: https://evil.example' \
  -d '{"email":"x","type":"sign-in"}'
```

### Sauvegardes

Il existe deux types de sauvegarde. Faites les deux, et testez une restauration au moins une fois.

**A. Dump complet de la base (recommandé, pour la reprise après sinistre).**

1. Faites le dump avec la chaîne de connexion **directe** (pas la poolée) :

   ```bash
   pg_dump -Fc "$DIRECT_URL" -f bas-de-laine-$(date +%F).dump
   ```

2. Rangez le fichier hors de Neon et hors de Vercel. Il contient toutes vos données financières : traitez-le comme privé.
3. Pour restaurer dans le même projet Neon (par exemple après une mauvaise manipulation) :

   ```bash
   pg_restore --clean --if-exists --no-owner --no-acl -d "$DIRECT_URL" bas-de-laine-AAAA-MM-JJ.dump
   ```

   `--clean` supprime les objets existants avant de les recréer : tout ce qui a été écrit depuis le dump est perdu.

4. Restaurer un dump dans un **autre** projet Neon avec une **nouvelle** instance Neon Auth ne reprend pas proprement les comptes de connexion : la table `users` relie chaque membre à un identifiant Neon Auth et impose l'unicité de l'e-mail, donc un membre qui se connecte avec un nouveau compte Neon Auth mais un e-mail déjà présent dans `users` ne peut pas être créé. Pour changer de projet, utilisez plutôt l'export JSON ci-dessous.

**B. Export JSON depuis l'application.**

1. Dans l'application, ouvrez **Configuration**, carte **Sauvegarde et restauration**, et cliquez sur **Exporter**. Vous obtenez `bas-de-laine-backup-AAAA-MM-JJ.json` avec le revenu du foyer, les enveloppes et leurs transactions, les charges fixes et la trésorerie. Il ne contient pas les comptes utilisateurs.
2. **Importer** relit un tel fichier. L'import **remplace** toutes les données du foyer actuel (enveloppes, transactions, charges fixes, trésorerie) par le contenu du fichier, après confirmation.
3. Limite de taille : l'application accepte des fichiers jusqu'à 10 Mo (contrôle côté navigateur, et limite du corps des Server Actions dans `next.config.ts`), mais **Vercel plafonne le corps d'une requête de fonction à 4,5 Mo** : sur Vercel, un import de plus de 4,5 Mo environ échoue. Pour un foyer de cette taille, utilisez le dump de la base.
4. Pour passer à un nouveau déploiement : exportez depuis l'ancien, connectez-vous une fois sur le nouveau (ce qui crée le foyer vide), puis importez.

### Mises à jour

1. Sauvegardez d'abord (dump de la base, ci-dessus).
2. Récupérez la nouvelle version depuis le dépôt public et fusionnez-la dans votre copie :

   ```bash
   git remote add upstream https://github.com/w2ur/bas-de-laine-app.git   # une seule fois
   git fetch upstream
   git merge upstream/main
   ```

3. Lancez les vérifications en local, surtout si vous avez modifié quelque chose :

   ```bash
   npm install
   npm test
   npm run lint
   npm run build
   ```

4. Poussez sur la branche `main` de votre dépôt. Vercel construit la production, et le script `vercel-build` applique les nouvelles migrations avec `prisma migrate deploy` avant le build.
5. Si vous déployez autrement, appliquez les migrations vous-même, avec `DIRECT_URL` défini :

   ```bash
   npm run db:migrate:deploy
   ```

6. L'application est une PWA avec un service worker : une copie installée récupère la nouvelle version après rechargement.

### Développement local

Utilisez un **projet Neon séparé pour le développement**, jamais la base de production. Dans le Neon Auth de ce projet de développement, activez Email OTP et **autorisez localhost**.

1. Installez Node 24 (par exemple `nvm use`, qui lit `.nvmrc`).
2. Créez `.env` **avant** `npm install` : le script `postinstall` lance `prisma generate`, et la configuration Prisma lit `DIRECT_URL`.

   ```bash
   cp .env.example .env
   ```

3. Remplissez `.env` avec les valeurs du projet de développement et un secret de cookies nouvellement généré (`openssl rand -base64 32`). Ne commitez jamais `.env`.
4. Installez et créez le schéma :

   ```bash
   npm install
   npx prisma migrate dev
   ```

5. Facultatif, base de développement uniquement : chargez des données de démonstration fictives avec `npx prisma db seed`. Sans cela, un foyer vide est créé à la première connexion autorisée.
6. Démarrez l'application :

   ```bash
   npm run dev
   ```

   Elle tourne sur http://localhost:3000. Le service worker est désactivé en développement.

7. Scripts utiles : `npm test` (Vitest), `npm run lint` (vérifie les types du seed, puis lance ESLint), `npm run build`, `npm run db:studio` (Prisma Studio). Toute modification du schéma est livrée avec une migration créée par `npx prisma migrate dev` ; n'utilisez jamais `prisma db push`.
