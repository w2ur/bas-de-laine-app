---
name: "Bas de Laine"
tagline_fr: "Parce que les chaussettes en laine, c'est vintage."
tagline_en: "Envelope budgeting for a household, minus the actual envelopes."
---

# Bas de Laine

Application de gestion de budget familial basée sur un système d'enveloppes. Bas de Laine permet de répartir les revenus du foyer dans des enveloppes virtuelles et de suivre les dépenses récurrentes.

Pour faire tourner votre propre instance (vos données, vos comptes Neon et Vercel) : voir [SELF-HOSTING.md](SELF-HOSTING.md). Self-hosting guide in English and French.

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

## Licence

[GNU AGPL-3.0](LICENSE).

---

Made with care by [William](https://william.revah.paris)
