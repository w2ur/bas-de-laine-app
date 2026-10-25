# Self-hosting Bas de Laine — advanced guide

- [English](#english)
- [Français](#français)

Never used a terminal or GitHub? Follow [SELF-HOSTING-BEGINNER.md](SELF-HOSTING-BEGINNER.md) instead: it covers the free path (GitHub, Vercel, Neon) click by click.
Jamais utilisé de terminal ni GitHub ? Suivez plutôt [SELF-HOSTING-BEGINNER.md](SELF-HOSTING-BEGINNER.md) : il décrit le parcours gratuit (GitHub, Vercel, Neon) clic par clic.

---

## English

This guide is for people who already run servers: it assumes you are at ease with a shell, PostgreSQL, a reverse proxy and environment variables. It is provider-neutral. Your data lives in the PostgreSQL database you choose; only sign-in goes through Neon.

### Contents

1. [Architecture](#architecture)
2. [Requirements](#requirements)
3. [Environment variables](#environment-variables)
4. [The Neon project for sign-in](#the-neon-project-for-sign-in)
5. [Shape A: Docker Compose behind Caddy or nginx](#shape-a-docker-compose-behind-caddy-or-nginx)
6. [Shape B: Node under systemd](#shape-b-node-under-systemd)
7. [Shape C: a PaaS such as Vercel](#shape-c-a-paas-such-as-vercel)
8. [First sign-in and the household](#first-sign-in-and-the-household)
9. [Check that sign-in works](#check-that-sign-in-works)
10. [Updates and migrations](#updates-and-migrations)
11. [Backups](#backups)
12. [Running a demo instance](#running-a-demo-instance)
13. [Local development](#local-development)

### Architecture

```
browser ──HTTPS──▶ reverse proxy ──▶ Next.js server (Node 24) ──▶ your PostgreSQL
                                          │
                                          └── /api/auth/* ──▶ Neon Auth (hosted by Neon; sends the code e-mails)
```

- **One Next.js 16 server.** Pages, Server Actions (every write) and the `/api/auth/*` route all run in one Node process. It keeps no state of its own: everything is in PostgreSQL, apart from the session, which Neon Auth holds. The app is also a PWA, with its service worker in `public/sw.js`.
- **Any PostgreSQL.** The app reaches the database through Prisma 7 and `@prisma/adapter-pg` (node-postgres). Nothing in it is specific to Neon. `DATABASE_URL` is the runtime connection; `DIRECT_URL` is for the Prisma CLI (generate, migrations).
- **Neon Auth handles sign-in, and only sign-in.** Users sign in with a code sent by e-mail (email OTP). There is no password and no social login. The app's `/api/auth/*` route forwards to your Neon Auth endpoint (`NEON_AUTH_BASE_URL`), **Neon sends the code e-mail**, and every page and Server Action reads the session back from Neon Auth (`getHousehold()` in `src/lib/auth/server.ts`).
- **A free Neon project is therefore required, even when your data lives elsewhere.** Neon Auth is a hosted service attached to a Neon project. The code has no other sign-in backend and sends no e-mail itself. The sign-in accounts live in Neon Auth; your database only stores a `users` row linked to each account. The Neon project's own database can stay empty. Replacing Neon Auth would mean changing the code.
- **Who may sign in is decided by the app**, through `ALLOWED_EMAILS`, not by Neon Auth.
- **One deployment = one household.** The first allowed sign-in creates an empty household, and every later allowed member joins that same household. A second household needs its own deployment and its own database.
- If Neon Auth cannot be reached, a signed-in page shows an error instead of signing you out.

### Requirements

1. **Node.js 24.** `.nvmrc` pins it. `package.json` only says `>=20`, but 24 is what the code is built and tested on, and Vercel supports nothing newer.
2. **PostgreSQL.** Any maintained version: the migrations use nothing version-specific. `compose.yaml` ships PostgreSQL 17, and Neon works too. The role in `DIRECT_URL` must be allowed to create tables and types, because migrations create them.
3. **A free Neon project with Neon Auth**, for sign-in only ([below](#the-neon-project-for-sign-in)).
4. **HTTPS in front of the app, always.** The session cookies are `Secure` and carry the `__Secure-` prefix, so a browser refuses them over plain HTTP. Signing in at `http://<server-ip>:3000` cannot work. (Chrome makes an exception for `http://localhost`; Safari does not.)
5. **A reverse proxy that:**
   - passes the original `Host` header through, because Next.js refuses a Server Action whose `Origin` does not match the host;
   - accepts request bodies up to 10 MB, the size of the largest backup import.
6. **Server time zone: UTC or east of UTC.** The date logic depends on it. Never set `TZ` to a zone west of UTC. Containers and most servers default to UTC.
7. **No mail server.** Neon sends the sign-in codes.

### Environment variables

`.env.example` lists them all. Next.js reads `.env` from the app directory at build and at start. `prisma.config.ts` loads it for the Prisma CLI.

| Variable | Needed | What it is |
|---|---|---|
| `DATABASE_URL` | Always | Runtime connection string. On Neon, use the **pooled** string (its host contains `-pooler`). On your own PostgreSQL, use the same value as `DIRECT_URL`. Under Docker Compose it is overwritten (see shape A). |
| `DIRECT_URL` | Always, **from `npm ci` on** | Direct (unpooled) connection string, used by the Prisma CLI. `npm ci` runs `prisma generate` as a postinstall step, and that step loads `prisma.config.ts`, which fails without this variable: `PrismaConfigEnvError: Cannot resolve environment variable: DIRECT_URL`. Nothing connects at install time; `prisma migrate deploy` is the first command that does. |
| `NEON_AUTH_BASE_URL` | Except with `DEMO_MODE=1` | Your Neon Auth endpoint, `https://<something>.auth.neon.tech` (Neon console, Auth page). |
| `NEON_AUTH_COOKIE_SECRET` | Except with `DEMO_MODE=1` | Signs the session cookies. Generate it with `openssl rand -base64 32`. It must be at least 32 characters long and must not start with `change-me`, the example value. Otherwise both the build and the server refuse to start (`assertUsableCookieSecret`, `src/lib/auth/cookie-secret.ts`). Use a different secret for each deployment. |
| `ALLOWED_EMAILS` | For anyone to sign up | Comma-separated addresses, trimmed and compared in lower case. **Non-empty:** only listed addresses get in, existing accounts included, so removing an address removes that person's access. **Empty:** no new account is ever created (fail-closed), while people who already signed in keep working. **Every listed address joins the one household.** The value is read when the server starts: restart or redeploy after changing it. |
| `DEMO_MODE` | Demo instances only | Only the exact value `1` turns it on. It **turns sign-in off.** Never set it on a real deployment ([Running a demo instance](#running-a-demo-instance)). |
| `POSTGRES_PASSWORD` | Docker Compose only | Password of the bundled PostgreSQL. Compose also splices it into both connection strings, so use letters and digits only (`openssl rand -hex 24`). |

Variables you may also set: `PORT` (default 3000). `TZ` must stay UTC or east of UTC.

### The Neon project for sign-in

1. Create a project in the Neon console (https://console.neon.tech). The free plan is enough. If your data stays in your own PostgreSQL, ignore this project's database.
2. Open the project's **Auth** page and enable Neon Auth.
3. Enable **Email OTP** sign-in. **Disable** e-mail + password and configure **no** OAuth provider. The app has no UI for them and refuses any unverified e-mail anyway, but leaving them off removes that surface.
4. **Do not allow localhost** on a production project. Keep localhost for a development project.
5. **Add your site's origin to the trusted domains** (Auth → Configuration → Domains → **Add domain**), with the scheme and no trailing slash, for example `https://budget.example.com`. Add every origin people will sign in from.

   > **This step is load-bearing. An empty trusted-domain list locks everyone out.** With localhost off and no trusted domain, Neon Auth rejects every code request from your site with `INVALID_ORIGIN`. The sign-in page then shows "Connexion impossible pour le moment" and nobody can sign in. You may only know the final URL after the first deployment: come back to this step then, and add the origin again whenever it changes.

6. Copy the **Auth URL** shown on the Auth page. This is `NEON_AUTH_BASE_URL`.

### Shape A: Docker Compose behind Caddy or nginx

`compose.yaml` runs the app and its own PostgreSQL 17 (volume `db-data`). The image is the Next.js standalone server: the Dockerfile builds with `BUILD_STANDALONE=1`, the only thing that turns on `output: "standalone"`. On every start, the container runs `prisma migrate deploy` and then the server, so migrations need no separate step.

1. Get the code:

   ```bash
   git clone https://github.com/w2ur/bas-de-laine-app.git bas-de-laine
   cd bas-de-laine
   cp .env.example .env
   ```

2. Edit `.env`:
   - `POSTGRES_PASSWORD`: output of `openssl rand -hex 24`;
   - `NEON_AUTH_BASE_URL` and `NEON_AUTH_COOKIE_SECRET` ([table above](#environment-variables));
   - `ALLOWED_EMAILS`: your household's addresses;
   - leave `DEMO_MODE` empty. `DATABASE_URL` and `DIRECT_URL` can stay as they are: compose replaces both with the address of its `db` service.
3. Start:

   ```bash
   docker compose up -d --build
   docker compose logs -f app
   ```

   The log shows Prisma's `All migrations have been successfully applied.` on the first start (`No pending migrations to apply.` afterwards), then Next.js reporting that it is ready.
4. Check from the server itself:

   ```bash
   curl -sI http://localhost:3000/auth/sign-in | head -n 1   # HTTP/1.1 200 OK
   ```

5. Keep the app off the public interface. `compose.yaml` publishes `3000:3000` on every interface, and Docker's published ports bypass host firewalls such as ufw. If the reverse proxy runs on the same host, change that line in your copy to `"127.0.0.1:3000:3000"`.
6. Put HTTPS in front. **Caddy** obtains the certificate and forwards `Host` by itself, with no body-size limit by default (`/etc/caddy/Caddyfile`):

   ```caddy
   budget.example.com {
       reverse_proxy 127.0.0.1:3000
   }
   ```

   **nginx** needs `Host` forwarded and its 1 MB default body limit raised; certificates here come from certbot:

   ```nginx
   server {
       listen 80;
       server_name budget.example.com;
       return 301 https://$host$request_uri;
   }

   server {
       listen 443 ssl;
       server_name budget.example.com;

       ssl_certificate     /etc/letsencrypt/live/budget.example.com/fullchain.pem;
       ssl_certificate_key /etc/letsencrypt/live/budget.example.com/privkey.pem;

       # Backup imports go up to 10 MB.
       client_max_body_size 11m;

       location / {
           proxy_pass http://127.0.0.1:3000;
           proxy_set_header Host $host;
           proxy_set_header X-Forwarded-Host $host;
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       }
   }
   ```

7. Add `https://budget.example.com` to Neon Auth's trusted domains ([step 5 above](#the-neon-project-for-sign-in)), then [check that sign-in works](#check-that-sign-in-works).

### Shape B: Node under systemd

The app runs straight from a clone, with `next start`, against any PostgreSQL you point it at.

1. Install Node.js 24, git and a reverse proxy. Create a system user, for example `basdelaine`, and a directory it owns, for example `/opt/bas-de-laine`.
2. As that user, get the code and write `.env` **before** installing (the postinstall step needs `DIRECT_URL`):

   ```bash
   git clone https://github.com/w2ur/bas-de-laine-app.git /opt/bas-de-laine
   cd /opt/bas-de-laine
   cp .env.example .env    # then fill in every value, see the table above
   chmod 600 .env
   ```

3. Install, migrate, build:

   ```bash
   npm ci && npx prisma migrate deploy && npm run build
   ```

   Do not run `npm ci` with `NODE_ENV=production`: that skips the devDependencies, and both the Prisma CLI and the build need them.
4. Try it by hand: `npm start -- -H 127.0.0.1 -p 3000`, then `curl -sI http://127.0.0.1:3000/auth/sign-in | head -n 1` must print `HTTP/1.1 200 OK`. Stop it with Ctrl+C.
5. Install the unit, `/etc/systemd/system/bas-de-laine.service`. Use the path that `command -v npm` prints:

   ```ini
   [Unit]
   Description=Bas de Laine
   After=network-online.target
   Wants=network-online.target

   [Service]
   Type=simple
   User=basdelaine
   WorkingDirectory=/opt/bas-de-laine
   # next start reads .env from the working directory.
   Environment=NODE_ENV=production
   Environment=TZ=UTC
   ExecStart=/usr/bin/npm start -- -H 127.0.0.1 -p 3000
   Restart=on-failure
   RestartSec=5

   [Install]
   WantedBy=multi-user.target
   ```

   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now bas-de-laine
   journalctl -u bas-de-laine -f
   ```

6. Put the same Caddy or nginx configuration as in [shape A](#shape-a-docker-compose-behind-caddy-or-nginx), step 6, in front. Then add the origin to Neon Auth's trusted domains.

### Shape C: a PaaS such as Vercel

**Vercel** is what the project itself runs on.

1. Import your copy of the repository as a new Vercel project. The framework is detected as Next.js. Vercel runs the `vercel-build` script from `package.json`: on production builds (`VERCEL_ENV=production`) it runs `prisma migrate deploy` first, then `next build`.
2. Set the project's **Node.js version to 24**.
3. Before the first deployment, add `DATABASE_URL`, `DIRECT_URL`, `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET` and `ALLOWED_EMAILS`. Scope them to **Production** only. They are needed at build time: the install step needs `DIRECT_URL`, migrations connect through it, and the build loads the auth module, which checks the cookie secret.
4. Deploy. **Never run `prisma db seed` against a real database.** The seed writes a fictional household, and the first real member would join it.
5. Add the production origin to Neon Auth's trusted domains. Use the custom domain and/or the `*.vercel.app` production domain, whichever people will open.
6. **Turn preview deployments off.** A preview would share the production variables, and therefore the production database. `vercel-build` already skips migrations outside production, but a preview's code still reads and writes real data. In Settings → Build and Deployment (Git on some layouts), set an Ignored Build Step that builds production only:

   ```bash
   if [ "$VERCEL_ENV" = "production" ]; then exit 1; else exit 0; fi
   ```

   Exit 1 means "build", 0 means "skip". Keeping the variables scoped to Production is the second safety: a preview then has no cookie secret, and its build fails.
7. Leave the time zone alone. Vercel functions run in UTC.

On Vercel's free Hobby plan, the terms only allow non-commercial use.

**Any other PaaS that runs a Node server** works too, provided it gives you Node 24, environment variables at build time, a run step that applies migrations before the new version serves, and HTTPS on your domain. You need:
- build command `npm ci && npm run build`;
- release or pre-deploy command `npx prisma migrate deploy`;
- start command `npm start` (Next.js reads `PORT`).

### First sign-in and the household

1. Make sure `ALLOWED_EMAILS` contains at least your own address, and that the server has restarted (or been redeployed) since you set it.
2. Open your URL. You are redirected to `/auth/sign-in`.
3. Enter your e-mail, click **Recevoir un code**, then type the code and click **Se connecter**.
4. This first allowed sign-in creates an empty household and your user. Every other listed address that signs in later joins the same household.
5. An address that is not allowed reaches Neon Auth, receives a code and signs in there, but the app then refuses it. The page shows "Une erreur est survenue" and the server log says `Email non autorisé`. An unverified address is refused before the list is even checked.

The user interface is in French.

### Check that sign-in works

Do this after the first deployment and **after every change to the Neon Auth settings**. Checking that options are switched off is not enough; check that the real sign-in path still works.

1. Open your URL in a private browser window and sign in with an address from `ALLOWED_EMAILS`. The code e-mail must arrive, and the code must sign you in.
2. "Connexion impossible pour le moment" right after **Recevoir un code** usually means `INVALID_ORIGIN`. You can see it in the browser's network tab, on the response of `send-verification-otp`. The origin you opened is missing from Neon Auth's trusted domains.

A command-line probe of the origin check:

```bash
# Your origin: must NOT come back as INVALID_ORIGIN
# (the invalid address "x" should be rejected as an invalid e-mail instead).
curl -s -X POST https://budget.example.com/api/auth/email-otp/send-verification-otp \
  -H 'Content-Type: application/json' -H 'Origin: https://budget.example.com' \
  -d '{"email":"x","type":"sign-in"}'

# Control, foreign origin: MUST come back as INVALID_ORIGIN.
curl -s -X POST https://budget.example.com/api/auth/email-otp/send-verification-otp \
  -H 'Content-Type: application/json' -H 'Origin: https://evil.example' \
  -d '{"email":"x","type":"sign-in"}'
```

### Updates and migrations

Every release that changes the schema ships a migration in `prisma/migrations/`. `prisma migrate deploy` applies only the pending ones, and running it again when nothing is pending does nothing. Apply them on every update, before the new code serves.

1. Back up first ([Backups](#backups)).
2. Fetch the release:

   ```bash
   git remote add upstream https://github.com/w2ur/bas-de-laine-app.git   # once, if your origin is your own copy
   git fetch upstream
   git merge upstream/main
   ```

3. Apply it:
   - **Shape A:** `docker compose up -d --build`. The new container migrates on start.
   - **Shape B:**

     ```bash
     npm ci && npx prisma migrate deploy && npm run build && sudo systemctl restart bas-de-laine
     ```

   - **Vercel:** push to your production branch. `vercel-build` migrates before it builds.
   - **Another PaaS:** its release step runs `npx prisma migrate deploy`.
4. Installed copies of the PWA pick up the new version after a reload.

Never use `prisma db push` against a real database, and never edit a migration that has already been applied.

### Backups

There are two kinds of backup. Do both, and test a restore at least once.

**A. Database dump (disaster recovery).** Use the **direct** connection string, and a `pg_dump` at least as recent as the server's PostgreSQL:

```bash
pg_dump -Fc "$DIRECT_URL" -f bas-de-laine-$(date +%F).dump
```

Restore into the same database:

```bash
pg_restore --clean --if-exists --no-owner --no-acl -d "$DIRECT_URL" bas-de-laine-YYYY-MM-DD.dump
```

`--clean` drops the existing objects before recreating them, so everything written since the dump is lost. Stop the app while you restore.

With Docker Compose, the client tools are inside the `db` container:

```bash
docker compose exec -T db pg_dump -U bas_de_laine -Fc bas_de_laine > bas-de-laine-$(date +%F).dump

docker compose stop app
docker compose exec -T db pg_restore -U bas_de_laine -d bas_de_laine --clean --if-exists --no-owner < bas-de-laine-YYYY-MM-DD.dump
docker compose start app
```

Store dumps away from the server: they hold all your financial data. A dump does **not** move cleanly to a deployment that uses a **different** Neon Auth project. The `users` table links each member to a Neon Auth id and keeps e-mails unique, so a member who signs in with a new Neon Auth account but an e-mail already in `users` cannot be provisioned. To move to a new sign-in project, use the JSON export below.

**B. JSON export from the app.** In **Configuration**, card **Sauvegarde et restauration**, **Exporter** downloads `bas-de-laine-backup-YYYY-MM-DD.json`. It holds the household's income, the envelopes and their transactions, the recurring charges and the treasury, but no user accounts. **Importer** replaces all of the current household's data with the file, after a confirmation. To move to a new deployment: export from the old one, sign in once on the new one (which creates the empty household), then import.

**Import size.** Off Vercel, the app accepts files up to **10 MB**: the browser checks first, then the Server Action body limit in `next.config.ts` applies. Your reverse proxy must allow that much (nginx: `client_max_body_size`). **On Vercel, Vercel's own cap on a function's request body applies**, which is lower (4.5 MB according to Vercel's documentation at the time of writing). A larger import fails there; restore with a database dump instead.

### Running a demo instance

`DEMO_MODE=1` serves one fictional household to **anyone who has the URL, with no sign-in**. It exists for public demos. Run it on its own deployment, against a database that has **never** held real data.

What changes:
- every visitor shares the fixed demo household, created on first use;
- the `/auth` pages redirect to `/`;
- sign-out and backup import are disabled;
- a banner announces fictional data;
- `NEON_AUTH_BASE_URL` and `NEON_AUTH_COOKIE_SECRET` are not needed, at build or at runtime.

**The server refuses to serve, and never just warns**, in three cases:
1. `ALLOWED_EMAILS` is not empty;
2. the database holds a household other than the demo household;
3. the database holds a user other than the demo user.

The checks run when the server starts and again on requests. A refused instance answers every request with an error (500, or 503 "Démo mal configurée"), and its log names the cause on a line starting `DEMO_MODE=1 refused:`. The usual cause of 2 is a database that ran `npx prisma db seed`, whose household is not the demo's. Use the reset below instead.

**Filling and resetting the data.** `npm run demo:reset` empties every app table and writes about three months of fictional activity ending today, after the same three checks, all in one transaction:

```bash
DEMO_MODE=1 DATABASE_URL='<the demo database>' npm run demo:reset
```

It needs a full `npm ci` (it runs with `tsx`, a devDependency). On success it prints `demo-reset: done, …`. Exit codes: `0` done, `1` refused (one of the three checks), `2` could not run (no `DEMO_MODE=1`, no `DATABASE_URL`, or a database error, including a lock it could not take because a visitor's write held it). Treat both 1 and 2 as failures: a reset that did not run must never look like one that did.

**Scheduling it is up to you.** Nothing in the app resets the demo by itself. Run the command nightly from any machine that has a clone with dependencies installed. One way is a crontab line:

```cron
17 3 * * * cd /opt/bas-de-laine && DEMO_MODE=1 DATABASE_URL='<the demo database>' /usr/bin/npm run demo:reset >> /var/log/bas-de-laine-demo-reset.log 2>&1
```

A systemd timer or a scheduled CI job in your own repository works the same way. Keep the database URL in that scheduler's secret store, and make sure a non-zero exit alerts you.

### Local development

Use a **separate Neon project for development**, never the production one. In its Neon Auth, enable Email OTP and **allow localhost**.

1. Install Node 24 (for example `nvm use`, which reads `.nvmrc`).
2. Create `.env` **before** `npm install`: `cp .env.example .env`, then fill it with the development values and a new cookie secret. Never commit `.env`.
3. Install and create the schema:

   ```bash
   npm install
   npx prisma migrate dev
   ```

4. Optional, development database only: `npx prisma db seed` loads a fictional household. Without it, an empty household is created at the first allowed sign-in.
5. `npm run dev` serves http://localhost:3000. The service worker is off in development.
6. Useful scripts: `npm test`, `npm run lint` (type-checks the seed, then ESLint), `npm run build`, `npm run db:studio`. A schema change always ships a migration made with `npx prisma migrate dev`; never use `prisma db push`.

The code is licensed under the GNU AGPL-3.0 (`LICENSE`). If you modify it and let other people use your instance over a network, you must offer them the source of your modified version.

---

## Français

Ce guide s'adresse à qui fait déjà tourner des serveurs : il suppose que le terminal, PostgreSQL, un reverse proxy et les variables d'environnement vous sont familiers. Il ne dépend d'aucun hébergeur. Vos données vivent dans la base PostgreSQL de votre choix ; seule la connexion passe par Neon.

### Sommaire

1. [Architecture](#architecture-1)
2. [Prérequis](#prérequis)
3. [Variables d'environnement](#variables-denvironnement)
4. [Le projet Neon pour la connexion](#le-projet-neon-pour-la-connexion)
5. [Forme A : Docker Compose derrière Caddy ou nginx](#forme-a--docker-compose-derrière-caddy-ou-nginx)
6. [Forme B : Node sous systemd](#forme-b--node-sous-systemd)
7. [Forme C : une PaaS comme Vercel](#forme-c--une-paas-comme-vercel)
8. [Première connexion et foyer](#première-connexion-et-foyer)
9. [Vérifier que la connexion fonctionne](#vérifier-que-la-connexion-fonctionne)
10. [Mises à jour et migrations](#mises-à-jour-et-migrations)
11. [Sauvegardes](#sauvegardes)
12. [Faire tourner une démo](#faire-tourner-une-démo)
13. [Développement local](#développement-local)

### Architecture

```
navigateur ──HTTPS──▶ reverse proxy ──▶ serveur Next.js (Node 24) ──▶ votre PostgreSQL
                                             │
                                             └── /api/auth/* ──▶ Neon Auth (hébergé par Neon ; envoie les e-mails de code)
```

- **Un seul serveur Next.js 16.** Les pages, les Server Actions (toutes les écritures) et la route `/api/auth/*` tournent dans un seul processus Node. Il ne garde aucun état : tout est dans PostgreSQL, sauf la session, que Neon Auth conserve. L'application est aussi une PWA, avec son service worker dans `public/sw.js`.
- **N'importe quel PostgreSQL.** L'application accède à la base via Prisma 7 et `@prisma/adapter-pg` (node-postgres). Rien n'y est propre à Neon. `DATABASE_URL` sert à l'exécution ; `DIRECT_URL` sert à la CLI Prisma (generate, migrations).
- **Neon Auth s'occupe de la connexion, et seulement de la connexion.** On se connecte avec un code reçu par e-mail (email OTP), sans mot de passe ni connexion via un réseau social. La route `/api/auth/*` de l'application transmet à votre point d'accès Neon Auth (`NEON_AUTH_BASE_URL`), **c'est Neon qui envoie l'e-mail avec le code**, et chaque page et chaque Server Action relit la session auprès de Neon Auth (`getHousehold()` dans `src/lib/auth/server.ts`).
- **Un projet Neon gratuit est donc obligatoire, même si vos données sont ailleurs.** Neon Auth est un service hébergé, rattaché à un projet Neon. Le code n'a pas d'autre système de connexion et n'envoie lui-même aucun e-mail. Les comptes de connexion vivent dans Neon Auth ; votre base ne garde qu'une ligne `users` reliée à chaque compte. La base du projet Neon peut rester vide. Remplacer Neon Auth demanderait de modifier le code.
- **Qui peut se connecter est décidé par l'application**, via `ALLOWED_EMAILS`, pas par Neon Auth.
- **Un déploiement = un foyer.** La première connexion autorisée crée un foyer vide, et chaque membre autorisé qui se connecte ensuite rejoint ce même foyer. Un deuxième foyer a besoin de son propre déploiement et de sa propre base.
- Si Neon Auth est injoignable, une page connectée affiche une erreur au lieu de vous déconnecter.

### Prérequis

1. **Node.js 24.** `.nvmrc` le fixe. `package.json` indique seulement `>=20`, mais c'est sur la 24 que le code est construit et testé, et Vercel n'accepte rien de plus récent.
2. **PostgreSQL.** N'importe quelle version maintenue : les migrations n'utilisent rien de propre à une version. `compose.yaml` fournit PostgreSQL 17, et Neon convient aussi. Le rôle de `DIRECT_URL` doit pouvoir créer des tables et des types, puisque les migrations en créent.
3. **Un projet Neon gratuit avec Neon Auth**, pour la connexion seulement ([plus bas](#le-projet-neon-pour-la-connexion)).
4. **HTTPS devant l'application, toujours.** Les cookies de session sont `Secure` et portent le préfixe `__Secure-` : un navigateur les refuse en HTTP simple. Se connecter sur `http://<ip-du-serveur>:3000` ne peut pas fonctionner. (Chrome fait une exception pour `http://localhost` ; Safari, non.)
5. **Un reverse proxy qui :**
   - transmet l'en-tête `Host` d'origine, parce que Next.js refuse une Server Action dont l'`Origin` ne correspond pas à l'hôte ;
   - accepte des corps de requête jusqu'à 10 Mo, la taille du plus gros import de sauvegarde.
6. **Fuseau horaire du serveur : UTC ou à l'est d'UTC.** La logique de dates en dépend. Ne définissez jamais `TZ` sur un fuseau à l'ouest d'UTC. Les conteneurs et la plupart des serveurs sont en UTC par défaut.
7. **Pas de serveur mail.** C'est Neon qui envoie les codes de connexion.

### Variables d'environnement

`.env.example` les liste toutes. Next.js lit `.env` dans le dossier de l'application, au build comme au démarrage. `prisma.config.ts` le charge pour la CLI Prisma.

| Variable | Nécessaire | Ce que c'est |
|---|---|---|
| `DATABASE_URL` | Toujours | Chaîne de connexion à l'exécution. Sur Neon, prenez la chaîne **poolée** (l'hôte contient `-pooler`). Sur votre propre PostgreSQL, la même valeur que `DIRECT_URL`. Sous Docker Compose, elle est remplacée (voir la forme A). |
| `DIRECT_URL` | Toujours, **dès `npm ci`** | Chaîne de connexion directe (sans pooler), utilisée par la CLI Prisma. `npm ci` lance `prisma generate` en postinstall, et cette étape charge `prisma.config.ts`, qui échoue sans cette variable : `PrismaConfigEnvError: Cannot resolve environment variable: DIRECT_URL`. Rien ne se connecte à l'installation ; `prisma migrate deploy` est la première commande qui le fait. |
| `NEON_AUTH_BASE_URL` | Sauf avec `DEMO_MODE=1` | Votre point d'accès Neon Auth, `https://<quelque-chose>.auth.neon.tech` (console Neon, page Auth). |
| `NEON_AUTH_COOKIE_SECRET` | Sauf avec `DEMO_MODE=1` | Signe les cookies de session. Générez-le avec `openssl rand -base64 32`. Il doit faire au moins 32 caractères et ne pas commencer par `change-me`, la valeur d'exemple. Sinon, le build comme le serveur refusent de démarrer (`assertUsableCookieSecret`, `src/lib/auth/cookie-secret.ts`). Utilisez un secret différent par déploiement. |
| `ALLOWED_EMAILS` | Pour que quiconque puisse s'inscrire | Adresses séparées par des virgules, débarrassées de leurs espaces et comparées en minuscules. **Non vide :** seules les adresses listées entrent, comptes existants compris : retirer une adresse retire l'accès à cette personne. **Vide :** aucun nouveau compte n'est jamais créé (fermé par défaut), mais les personnes déjà connectées une fois continuent d'accéder. **Chaque adresse listée rejoint l'unique foyer.** La valeur est lue au démarrage du serveur : redémarrez ou redéployez après l'avoir modifiée. |
| `DEMO_MODE` | Démos uniquement | Seule la valeur exacte `1` l'active. Elle **désactive la connexion.** Jamais sur un vrai déploiement ([Faire tourner une démo](#faire-tourner-une-démo)). |
| `POSTGRES_PASSWORD` | Docker Compose uniquement | Mot de passe du PostgreSQL fourni. Compose l'insère aussi dans les deux chaînes de connexion : lettres et chiffres uniquement (`openssl rand -hex 24`). |

Variables que vous pouvez aussi définir : `PORT` (3000 par défaut). `TZ` doit rester en UTC ou à l'est d'UTC.

### Le projet Neon pour la connexion

1. Créez un projet dans la console Neon (https://console.neon.tech). L'offre gratuite suffit. Si vos données restent dans votre propre PostgreSQL, ignorez la base de ce projet.
2. Ouvrez la page **Auth** du projet et activez Neon Auth.
3. Activez la connexion **Email OTP**. **Désactivez** e-mail + mot de passe et ne configurez **aucun** fournisseur OAuth. L'application n'a pas d'interface pour eux et refuse de toute façon un e-mail non vérifié, mais les laisser désactivés supprime cette surface.
4. **N'autorisez pas localhost** sur un projet de production. Gardez localhost pour un projet de développement.
5. **Ajoutez l'origine de votre site aux domaines de confiance** (Auth → Configuration → Domains → **Add domain**), avec le schéma et sans barre finale, par exemple `https://budget.example.com`. Ajoutez chaque origine depuis laquelle on se connectera.

   > **Cette étape est indispensable. Une liste de domaines de confiance vide bloque tout le monde.** Sans localhost et sans domaine de confiance, Neon Auth refuse chaque demande de code venant de votre site avec `INVALID_ORIGIN`. La page de connexion affiche alors « Connexion impossible pour le moment » et personne ne peut se connecter. Vous ne connaîtrez peut-être l'URL définitive qu'après le premier déploiement : revenez alors à cette étape, et ajoutez l'origine de nouveau chaque fois qu'elle change.

6. Copiez l'**Auth URL** affichée sur la page Auth. C'est `NEON_AUTH_BASE_URL`.

### Forme A : Docker Compose derrière Caddy ou nginx

`compose.yaml` lance l'application et son propre PostgreSQL 17 (volume `db-data`). L'image est le serveur standalone de Next.js : le Dockerfile construit avec `BUILD_STANDALONE=1`, seul interrupteur de `output: "standalone"`. À chaque démarrage, le conteneur lance `prisma migrate deploy`, puis le serveur : les migrations ne demandent aucune étape à part.

1. Récupérez le code :

   ```bash
   git clone https://github.com/w2ur/bas-de-laine-app.git bas-de-laine
   cd bas-de-laine
   cp .env.example .env
   ```

2. Modifiez `.env` :
   - `POSTGRES_PASSWORD` : le résultat de `openssl rand -hex 24` ;
   - `NEON_AUTH_BASE_URL` et `NEON_AUTH_COOKIE_SECRET` ([tableau ci-dessus](#variables-denvironnement)) ;
   - `ALLOWED_EMAILS` : les adresses de votre foyer ;
   - laissez `DEMO_MODE` vide. `DATABASE_URL` et `DIRECT_URL` peuvent rester telles quelles : compose les remplace toutes les deux par l'adresse de son service `db`.
3. Démarrez :

   ```bash
   docker compose up -d --build
   docker compose logs -f app
   ```

   Le journal affiche le `All migrations have been successfully applied.` de Prisma au premier démarrage (`No pending migrations to apply.` ensuite), puis Next.js qui annonce être prêt.
4. Vérifiez depuis le serveur lui-même :

   ```bash
   curl -sI http://localhost:3000/auth/sign-in | head -n 1   # HTTP/1.1 200 OK
   ```

5. Gardez l'application hors de l'interface publique. `compose.yaml` publie `3000:3000` sur toutes les interfaces, et les ports publiés par Docker contournent les pare-feu de l'hôte comme ufw. Si le reverse proxy tourne sur la même machine, changez cette ligne dans votre copie en `"127.0.0.1:3000:3000"`.
6. Placez HTTPS devant. **Caddy** obtient le certificat et transmet `Host` tout seul, sans limite de taille de corps par défaut (`/etc/caddy/Caddyfile`) :

   ```caddy
   budget.example.com {
       reverse_proxy 127.0.0.1:3000
   }
   ```

   **nginx** a besoin qu'on lui fasse transmettre `Host` et qu'on relève sa limite de corps, 1 Mo par défaut ; les certificats viennent ici de certbot :

   ```nginx
   server {
       listen 80;
       server_name budget.example.com;
       return 301 https://$host$request_uri;
   }

   server {
       listen 443 ssl;
       server_name budget.example.com;

       ssl_certificate     /etc/letsencrypt/live/budget.example.com/fullchain.pem;
       ssl_certificate_key /etc/letsencrypt/live/budget.example.com/privkey.pem;

       # Les imports de sauvegarde vont jusqu'à 10 Mo.
       client_max_body_size 11m;

       location / {
           proxy_pass http://127.0.0.1:3000;
           proxy_set_header Host $host;
           proxy_set_header X-Forwarded-Host $host;
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       }
   }
   ```

7. Ajoutez `https://budget.example.com` aux domaines de confiance de Neon Auth ([étape 5 plus haut](#le-projet-neon-pour-la-connexion)), puis [vérifiez que la connexion fonctionne](#vérifier-que-la-connexion-fonctionne).

### Forme B : Node sous systemd

L'application tourne directement depuis un clone, avec `next start`, sur le PostgreSQL de votre choix.

1. Installez Node.js 24, git et un reverse proxy. Créez un utilisateur système, par exemple `basdelaine`, et un dossier qui lui appartient, par exemple `/opt/bas-de-laine`.
2. Sous cet utilisateur, récupérez le code et écrivez `.env` **avant** l'installation (l'étape postinstall a besoin de `DIRECT_URL`) :

   ```bash
   git clone https://github.com/w2ur/bas-de-laine-app.git /opt/bas-de-laine
   cd /opt/bas-de-laine
   cp .env.example .env    # puis remplissez chaque valeur, voir le tableau plus haut
   chmod 600 .env
   ```

3. Installez, migrez, construisez :

   ```bash
   npm ci && npx prisma migrate deploy && npm run build
   ```

   Ne lancez pas `npm ci` avec `NODE_ENV=production` : cela saute les devDependencies, dont la CLI Prisma et le build ont besoin.
4. Essayez à la main : `npm start -- -H 127.0.0.1 -p 3000`, puis `curl -sI http://127.0.0.1:3000/auth/sign-in | head -n 1` doit afficher `HTTP/1.1 200 OK`. Arrêtez avec Ctrl+C.
5. Installez l'unité, `/etc/systemd/system/bas-de-laine.service`. Mettez le chemin qu'affiche `command -v npm` :

   ```ini
   [Unit]
   Description=Bas de Laine
   After=network-online.target
   Wants=network-online.target

   [Service]
   Type=simple
   User=basdelaine
   WorkingDirectory=/opt/bas-de-laine
   # next start lit .env dans le dossier de travail.
   Environment=NODE_ENV=production
   Environment=TZ=UTC
   ExecStart=/usr/bin/npm start -- -H 127.0.0.1 -p 3000
   Restart=on-failure
   RestartSec=5

   [Install]
   WantedBy=multi-user.target
   ```

   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now bas-de-laine
   journalctl -u bas-de-laine -f
   ```

6. Placez devant la même configuration Caddy ou nginx qu'à la [forme A](#forme-a--docker-compose-derrière-caddy-ou-nginx), étape 6. Ajoutez ensuite l'origine aux domaines de confiance de Neon Auth.

### Forme C : une PaaS comme Vercel

**Vercel** est la plateforme sur laquelle tourne le projet lui-même.

1. Importez votre copie du dépôt comme nouveau projet Vercel. Le framework est détecté comme Next.js. Vercel lance le script `vercel-build` de `package.json` : sur les builds de production (`VERCEL_ENV=production`), il exécute d'abord `prisma migrate deploy`, puis `next build`.
2. Réglez la **version de Node.js du projet sur 24**.
3. Avant le premier déploiement, ajoutez `DATABASE_URL`, `DIRECT_URL`, `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET` et `ALLOWED_EMAILS`. Limitez-les à **Production**. Elles servent au build : l'installation a besoin de `DIRECT_URL`, les migrations se connectent par elle, et le build charge le module d'authentification, qui vérifie le secret des cookies.
4. Déployez. **Ne lancez jamais `prisma db seed` sur une vraie base.** Le seed écrit un foyer fictif, et le premier vrai membre le rejoindrait.
5. Ajoutez l'origine de production aux domaines de confiance de Neon Auth : le domaine personnalisé et/ou le domaine de production `*.vercel.app`, celui qu'on ouvrira.
6. **Désactivez les déploiements de preview.** Une preview partagerait les variables de production, donc la base de production. `vercel-build` saute déjà les migrations hors production, mais le code d'une preview lit et écrit quand même les vraies données. Dans Settings → Build and Deployment (Git selon la présentation), définissez une Ignored Build Step qui ne construit que la production :

   ```bash
   if [ "$VERCEL_ENV" = "production" ]; then exit 1; else exit 0; fi
   ```

   Le code de sortie 1 signifie « construire », 0 « ignorer ». Garder les variables limitées à Production est la seconde sécurité : une preview n'a alors pas de secret de cookies, et son build échoue.
7. Ne touchez pas au fuseau horaire. Les fonctions Vercel tournent en UTC.

Sur l'offre gratuite Hobby de Vercel, les conditions n'autorisent qu'un usage non commercial.

**Toute autre PaaS qui fait tourner un serveur Node** convient aussi, si elle fournit Node 24, les variables d'environnement au moment du build, une étape qui applique les migrations avant que la nouvelle version ne serve, et HTTPS sur votre domaine. Il vous faut :
- la commande de build `npm ci && npm run build` ;
- la commande de release ou de pré-déploiement `npx prisma migrate deploy` ;
- la commande de démarrage `npm start` (Next.js lit `PORT`).

### Première connexion et foyer

1. Vérifiez que `ALLOWED_EMAILS` contient au moins votre propre adresse, et que le serveur a redémarré (ou été redéployé) depuis que vous l'avez définie.
2. Ouvrez votre URL. Vous êtes redirigé vers `/auth/sign-in`.
3. Saisissez votre e-mail, cliquez sur **Recevoir un code**, puis tapez le code et cliquez sur **Se connecter**.
4. Cette première connexion autorisée crée un foyer vide et votre utilisateur. Chaque autre adresse listée qui se connecte ensuite rejoint le même foyer.
5. Une adresse non autorisée passe par Neon Auth, reçoit un code et s'y connecte, puis l'application la refuse. La page affiche « Une erreur est survenue » et le journal du serveur indique `Email non autorisé`. Une adresse non vérifiée est refusée avant même la consultation de la liste.

L'interface est en français.

### Vérifier que la connexion fonctionne

Faites-le après le premier déploiement et **après chaque modification des réglages Neon Auth**. Vérifier que des options sont désactivées ne suffit pas ; vérifiez que le vrai parcours de connexion fonctionne encore.

1. Ouvrez votre URL dans une fenêtre de navigation privée et connectez-vous avec une adresse de `ALLOWED_EMAILS`. L'e-mail du code doit arriver, et le code doit vous connecter.
2. « Connexion impossible pour le moment » juste après **Recevoir un code** signifie le plus souvent `INVALID_ORIGIN`. Vous le voyez dans l'onglet réseau du navigateur, sur la réponse de `send-verification-otp`. L'origine que vous avez ouverte manque dans les domaines de confiance de Neon Auth.

Sonde en ligne de commande de la vérification d'origine :

```bash
# Votre origine : ne doit PAS revenir en INVALID_ORIGIN
# (l'adresse invalide "x" doit plutôt être refusée comme e-mail invalide).
curl -s -X POST https://budget.example.com/api/auth/email-otp/send-verification-otp \
  -H 'Content-Type: application/json' -H 'Origin: https://budget.example.com' \
  -d '{"email":"x","type":"sign-in"}'

# Témoin, origine étrangère : DOIT revenir en INVALID_ORIGIN.
curl -s -X POST https://budget.example.com/api/auth/email-otp/send-verification-otp \
  -H 'Content-Type: application/json' -H 'Origin: https://evil.example' \
  -d '{"email":"x","type":"sign-in"}'
```

### Mises à jour et migrations

Chaque version qui modifie le schéma livre une migration dans `prisma/migrations/`. `prisma migrate deploy` n'applique que celles en attente, et le relancer quand rien n'attend ne fait rien. Appliquez-les à chaque mise à jour, avant que le nouveau code ne serve.

1. Sauvegardez d'abord ([Sauvegardes](#sauvegardes)).
2. Récupérez la version :

   ```bash
   git remote add upstream https://github.com/w2ur/bas-de-laine-app.git   # une seule fois, si origin est votre propre copie
   git fetch upstream
   git merge upstream/main
   ```

3. Appliquez-la :
   - **Forme A :** `docker compose up -d --build`. Le nouveau conteneur migre au démarrage.
   - **Forme B :**

     ```bash
     npm ci && npx prisma migrate deploy && npm run build && sudo systemctl restart bas-de-laine
     ```

   - **Vercel :** poussez sur votre branche de production. `vercel-build` migre avant de construire.
   - **Autre PaaS :** son étape de release lance `npx prisma migrate deploy`.
4. Les copies installées de la PWA récupèrent la nouvelle version après un rechargement.

N'utilisez jamais `prisma db push` sur une vraie base, et ne modifiez jamais une migration déjà appliquée.

### Sauvegardes

Il existe deux types de sauvegarde. Faites les deux, et testez une restauration au moins une fois.

**A. Dump de la base (reprise après sinistre).** Utilisez la chaîne de connexion **directe**, et un `pg_dump` au moins aussi récent que le PostgreSQL du serveur :

```bash
pg_dump -Fc "$DIRECT_URL" -f bas-de-laine-$(date +%F).dump
```

Restaurer dans la même base :

```bash
pg_restore --clean --if-exists --no-owner --no-acl -d "$DIRECT_URL" bas-de-laine-AAAA-MM-JJ.dump
```

`--clean` supprime les objets existants avant de les recréer : tout ce qui a été écrit depuis le dump est perdu. Arrêtez l'application pendant la restauration.

Avec Docker Compose, les outils clients sont dans le conteneur `db` :

```bash
docker compose exec -T db pg_dump -U bas_de_laine -Fc bas_de_laine > bas-de-laine-$(date +%F).dump

docker compose stop app
docker compose exec -T db pg_restore -U bas_de_laine -d bas_de_laine --clean --if-exists --no-owner < bas-de-laine-AAAA-MM-JJ.dump
docker compose start app
```

Rangez les dumps loin du serveur : ils contiennent toutes vos données financières. Un dump ne passe **pas** proprement vers un déploiement qui utilise un **autre** projet Neon Auth. La table `users` relie chaque membre à un identifiant Neon Auth et impose l'unicité des e-mails : un membre qui se connecte avec un nouveau compte Neon Auth mais un e-mail déjà présent dans `users` ne peut pas être créé. Pour changer de projet de connexion, utilisez l'export JSON ci-dessous.

**B. Export JSON depuis l'application.** Dans **Configuration**, carte **Sauvegarde et restauration**, **Exporter** télécharge `bas-de-laine-backup-AAAA-MM-JJ.json`. Il contient le revenu du foyer, les enveloppes et leurs transactions, les charges fixes et la trésorerie, mais aucun compte utilisateur. **Importer** remplace toutes les données du foyer actuel par celles du fichier, après confirmation. Pour passer à un nouveau déploiement : exportez depuis l'ancien, connectez-vous une fois sur le nouveau (ce qui crée le foyer vide), puis importez.

**Taille des imports.** Hors Vercel, l'application accepte des fichiers jusqu'à **10 Mo** : le navigateur vérifie d'abord, puis la limite du corps des Server Actions dans `next.config.ts` s'applique. Votre reverse proxy doit accepter autant (nginx : `client_max_body_size`). **Sur Vercel, c'est le plafond de Vercel lui-même sur le corps d'une requête de fonction qui s'applique**, plus bas (4,5 Mo selon la documentation de Vercel au moment où ces lignes sont écrites). Un import plus gros y échoue ; restaurez alors avec un dump de la base.

### Faire tourner une démo

`DEMO_MODE=1` sert un foyer fictif unique **à quiconque a l'adresse, sans connexion**. Le mode existe pour les démos publiques. Faites-le tourner sur un déploiement à part, avec une base qui n'a **jamais** contenu de vraies données.

Ce qui change :
- tous les visiteurs partagent le foyer de démo fixe, créé à la première utilisation ;
- les pages `/auth` redirigent vers `/` ;
- la déconnexion et l'import de sauvegarde sont désactivés ;
- un bandeau annonce des données fictives ;
- `NEON_AUTH_BASE_URL` et `NEON_AUTH_COOKIE_SECRET` ne sont pas nécessaires, ni au build ni à l'exécution.

**Le serveur refuse de servir, et ne se contente jamais d'un avertissement**, dans trois cas :
1. `ALLOWED_EMAILS` n'est pas vide ;
2. la base contient un autre foyer que celui de la démo ;
3. la base contient un autre utilisateur que celui de la démo.

Les vérifications ont lieu au démarrage du serveur, puis de nouveau sur les requêtes. Une instance refusée répond à chaque requête par une erreur (500, ou 503 « Démo mal configurée »), et son journal donne la cause sur une ligne qui commence par `DEMO_MODE=1 refused:`. La cause habituelle du cas 2 est une base sur laquelle `npx prisma db seed` a tourné : son foyer n'est pas celui de la démo. Utilisez plutôt la remise à zéro ci-dessous.

**Remplir et remettre à zéro les données.** `npm run demo:reset` vide toutes les tables de l'application et écrit environ trois mois d'activité fictive jusqu'à aujourd'hui, après les trois mêmes vérifications, le tout dans une seule transaction :

```bash
DEMO_MODE=1 DATABASE_URL='<la base de démo>' npm run demo:reset
```

Il demande un `npm ci` complet (il tourne avec `tsx`, une devDependency). En cas de succès, il affiche `demo-reset: done, …`. Codes de sortie : `0` fait, `1` refus (une des trois vérifications), `2` impossible de s'exécuter (pas de `DEMO_MODE=1`, pas de `DATABASE_URL`, ou une erreur de base, y compris un verrou qu'il n'a pas pu prendre parce qu'une écriture d'un visiteur le tenait). Traitez 1 comme 2 en échec : une remise à zéro qui n'a pas tourné ne doit jamais passer pour réussie.

**C'est à vous de la planifier.** Rien dans l'application ne remet la démo à zéro toute seule. Lancez la commande chaque nuit depuis n'importe quelle machine qui a un clone avec ses dépendances installées. Par exemple, une ligne de crontab :

```cron
17 3 * * * cd /opt/bas-de-laine && DEMO_MODE=1 DATABASE_URL='<la base de démo>' /usr/bin/npm run demo:reset >> /var/log/bas-de-laine-demo-reset.log 2>&1
```

Un timer systemd ou une tâche CI planifiée dans votre propre dépôt fonctionne de la même façon. Gardez l'URL de la base dans le coffre à secrets de ce planificateur, et faites en sorte qu'un code de sortie non nul vous alerte.

### Développement local

Utilisez un **projet Neon séparé pour le développement**, jamais celui de production. Dans son Neon Auth, activez Email OTP et **autorisez localhost**.

1. Installez Node 24 (par exemple `nvm use`, qui lit `.nvmrc`).
2. Créez `.env` **avant** `npm install` : `cp .env.example .env`, puis remplissez-le avec les valeurs de développement et un nouveau secret de cookies. Ne commitez jamais `.env`.
3. Installez et créez le schéma :

   ```bash
   npm install
   npx prisma migrate dev
   ```

4. Facultatif, base de développement uniquement : `npx prisma db seed` charge un foyer fictif. Sans cela, un foyer vide est créé à la première connexion autorisée.
5. `npm run dev` sert http://localhost:3000. Le service worker est désactivé en développement.
6. Scripts utiles : `npm test`, `npm run lint` (vérifie les types du seed, puis ESLint), `npm run build`, `npm run db:studio`. Une modification du schéma est toujours livrée avec une migration créée par `npx prisma migrate dev` ; n'utilisez jamais `prisma db push`.

Le code est sous licence GNU AGPL-3.0 (`LICENSE`). Si vous le modifiez et laissez d'autres personnes utiliser votre instance via un réseau, vous devez leur proposer le code source de votre version modifiée.
