---
name: "Bas de Laine"
tagline_fr: "Parce que les chaussettes en laine, c'est vintage."
tagline_en: "Envelope budgeting for a household, minus the actual envelopes."
---

# Bas de Laine

Application de gestion de budget familial basée sur un système d'enveloppes. Bas de Laine permet de répartir les revenus du foyer dans des enveloppes virtuelles et de suivre les dépenses récurrentes.

**Démo :** [demo.budget.revah.paris](https://demo.budget.revah.paris), un foyer inventé, sans connexion, remis à zéro chaque nuit.

**Votre propre instance** (vos données, vos comptes). Guides en français et en anglais / self-hosting guides in French and English :

- [SELF-HOSTING-BEGINNER.md](SELF-HOSTING-BEGINNER.md) : pas à pas, sans connaître le terminal ni GitHub, parcours gratuit GitHub + Vercel + Neon / step by step for beginners, free path.
- [SELF-HOSTING.md](SELF-HOSTING.md) : guide avancé, indépendant de l'hébergeur (Docker, systemd, PaaS, sauvegardes, démo) / advanced, provider-neutral.

## Tech Stack

- **Framework** : Next.js 16 (App Router) avec React 19 et TypeScript
- **Base de données** : PostgreSQL via [Neon](https://neon.tech) avec Prisma ORM
- **Authentification** : Neon Auth (code à usage unique par e-mail, page de connexion sur mesure en français)
- **Validation** : Zod 4
- **UI** : Tailwind CSS 4, shadcn/ui (Radix), Lucide icons
- **PWA** : Serwist (service worker, installation sur l'écran d'accueil, mode hors ligne)
- **Tests** : Vitest
- **Déploiement** : Vercel

## Fonctionnalités

- **Enveloppes budgétaires** : créer des enveloppes avec un budget mensuel, y ajouter ou retirer de l'argent, suivre le solde cumulatif, choisir un remplissage hebdomadaire ou mensuel
- **Rituel du lundi** : un bouton « Remplir la semaine » propose les remplissages de la semaine (et du mois pour les enveloppes mensuelles), montants modifiables, une confirmation
- **Charges fixes** : gérer les prélèvements récurrents (loyer, énergie, abonnements)
- **Tableau de bord** : vue d'ensemble des revenus, charges et enveloppes
- **Historique** : transactions récentes groupées par date ; une suppression s'annule pendant quelques secondes (« Annuler »)
- **Trésorerie** : réserve de liquidités ajustable manuellement
- **Quick Spend** : bouton flottant accessible partout ; le montant d'abord, puis l'enveloppe (la dernière utilisée sur l'appareil est présélectionnée)
- **PWA** : installable, fonctionne hors ligne

## Développement local

### Prérequis

- Node.js 24 (voir `.nvmrc` ; Vercel plafonne à 24)
- Une base de données PostgreSQL (ou un projet [Neon](https://neon.tech))

### Installation

```bash
cp .env.example .env     # puis remplir les valeurs (avant npm install)
npm install
npx prisma migrate dev  # appliquer les migrations
npx prisma db seed       # optionnel — données de démonstration, jamais en production
npm run dev
```

> Le fichier `.env` doit exister **avant** `npm install` : le `postinstall` lance
> `prisma generate`, qui lit `DIRECT_URL`.

L'application est accessible sur [http://localhost:3000](http://localhost:3000).

> Ne lancez jamais le seed sur une base de production : le premier utilisateur réel hériterait des données de démonstration.
>
> Le seed est **optionnel** : un foyer vide est créé automatiquement à la première
> connexion autorisée. Le seed sert uniquement à pré-remplir des données de
> démonstration (un foyer fictif, des enveloppes et des charges récurrentes).

### Variables d'environnement

Voir `.env.example` pour la liste complète :

| Variable | Description |
|---|---|
| `DATABASE_URL` | URL de connexion poolée (PgBouncer) |
| `DIRECT_URL` | URL de connexion directe (migrations) |
| `NEON_AUTH_BASE_URL` | Endpoint Neon Auth |
| `NEON_AUTH_COOKIE_SECRET` | Secret de signature des cookies de session, 32 caractères minimum (`openssl rand -base64 32`). L'application refuse de démarrer avec la valeur d'exemple de `.env.example` |
| `ALLOWED_EMAILS` | Emails autorisés, séparés par des virgules — vide = nouveaux comptes refusés |
| `POSTGRES_PASSWORD` | Docker uniquement : mot de passe du Postgres de `compose.yaml` (lettres et chiffres) |
| `DEMO_MODE` | `1` = démo publique **sans connexion** (voir plus bas). Jamais sur une vraie instance |

### Scripts utiles

```bash
npm run build           # Build de production
npm run lint            # ESLint
npm run test            # Tests unitaires (Vitest)
npm run db:studio       # Interface Prisma Studio
npm run db:migrate      # Appliquer les migrations
npm run db:seed         # Seeder la base
```

## Déploiement

Conçu pour être déployé sur **Vercel** (Node 24), un déploiement par foyer. La base de données est hébergée sur **Neon** (PostgreSQL serverless).

### Avec Docker

`compose.yaml` lance l'application et son propre PostgreSQL 17. Les migrations s'appliquent à chaque démarrage. La connexion passe toujours par Neon Auth, donc un projet Neon (gratuit) reste nécessaire pour la connexion seulement.

```bash
cp .env.example .env     # POSTGRES_PASSWORD, NEON_AUTH_BASE_URL, NEON_AUTH_COOKIE_SECRET, ALLOWED_EMAILS
docker compose up -d --build
```

L'application écoute sur le port 3000 ; placez-la derrière un reverse proxy HTTPS (exemples Caddy et nginx dans [SELF-HOSTING.md](SELF-HOSTING.md)).

### Mode démo

`DEMO_MODE=1` **désactive la connexion** : n'importe qui ayant l'adresse voit et modifie un foyer fictif unique. À réserver à une démo publique, sur une base qui lui est dédiée et n'a **jamais** contenu de vraies données. L'application refuse de servir si `ALLOWED_EMAILS` est rempli, si la base contient un autre foyer ou un autre utilisateur que ceux de la démo ; les variables Neon Auth ne sont pas nécessaires.

`DEMO_MODE=1 DATABASE_URL=… npm run demo:reset` vide la base de démo et la remplit de trois mois de données fictives, après les mêmes vérifications. Planifiez-le chaque nuit (cron, tâche planifiée) : la démo officielle est remise à zéro ainsi. Codes de sortie : 0 fait, 1 refus (la base n'est pas une base de démo), 2 impossible de s'exécuter. Détails, dont un exemple de planification, dans [SELF-HOSTING.md](SELF-HOSTING.md).

## Licence

[GNU AGPL-3.0](LICENSE).

---

Made with care by [William](https://william.revah.paris)
