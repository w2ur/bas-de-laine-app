# Bas de Laine, your own copy — beginner's guide

- [English](#english)
- [Français](#français)

---

## English

This guide puts your own copy of Bas de Laine online, for your household, **for free**, without installing anything on your computer. You do not need to know how to program. You will create three free accounts, click through their websites, and copy a few values from one site to another. You will type exactly one command, and this guide shows you how.

At the end you will have:
- your own web address (for example `https://bas-de-laine-yourname.vercel.app`) where you and the people you choose sign in with a code sent by e-mail;
- your own database, which only your copy uses;
- an app you can install on your phone's home screen.

The app itself is in French.

> **What this costs**
>
> | Service | What it does here | Price |
> |---|---|---|
> | GitHub | keeps your copy of the code | free account |
> | Neon | stores your data and sends the sign-in codes | free plan |
> | Vercel | runs the app and gives it its web address | free "Hobby" plan, **for personal, non-commercial use only** |
> | A domain name of your own (optional) | a nicer address than `….vercel.app` | paid to a domain registrar, usually yearly; skip it and you pay nothing |
>
> When this guide was written, none of these free plans asked for a payment card. The providers set their own prices and limits and can change them: check their pricing pages before you start (https://github.com/pricing, https://neon.com/pricing, https://vercel.com/pricing). Connecting a domain name of your own is not covered by this guide. A household budget is very small for these services. On Neon's free plan, the database goes to sleep when nobody uses it, so the first page after a quiet spell can take a few seconds to load. That is normal.

### Contents

1. [Before you start](#before-you-start)
2. [Step 1: Create a GitHub account](#step-1-create-a-github-account)
3. [Step 2: Make your copy of the code](#step-2-make-your-copy-of-the-code)
4. [Step 3: Create a Neon account and project](#step-3-create-a-neon-account-and-project)
5. [Step 4: Copy the two database addresses](#step-4-copy-the-two-database-addresses)
6. [Step 5: Turn on sign-in (Neon Auth)](#step-5-turn-on-sign-in-neon-auth)
7. [Step 6: Make your secret key (the one command)](#step-6-make-your-secret-key-the-one-command)
8. [Step 7: Create a Vercel account](#step-7-create-a-vercel-account)
9. [Step 8: Put the app online](#step-8-put-the-app-online)
10. [Step 9: Tell Neon your web address](#step-9-tell-neon-your-web-address)
11. [Step 10: Sign in for the first time](#step-10-sign-in-for-the-first-time)
12. [Step 11: Safety settings](#step-11-safety-settings)
13. [Everyday tasks: add someone, back up, update](#everyday-tasks-add-someone-back-up-update)
14. [When something goes wrong](#when-something-goes-wrong)

### Before you start

**Words you will meet:**
- **Repository** (or "repo"): a folder of code stored on GitHub.
- **Fork**: your own copy of someone else's repository, on your GitHub account.
- **Deploy**: put the code online so it runs as a website.
- **Environment variable**: a named setting (a name and a value) that you give the app without changing its code. You will enter five of them in Vercel.
- **Terminal**: a window where you type commands instead of clicking. You need it once, in Step 6.

**Open a private notes file** on your computer (a text document only you can see). You will collect five values in it:

```
DATABASE_URL =
DIRECT_URL =
NEON_AUTH_BASE_URL =
NEON_AUTH_COOKIE_SECRET =
ALLOWED_EMAILS =
```

Three of them are passwords in disguise (the two database addresses contain your database password, and the secret key is one). **Never post this note anywhere and never put it on GitHub.** Keep it until you have finished and signed in once, then delete it. You can copy the database addresses again from Neon later; if you lose the secret key, make a new one (Step 6), replace it in Vercel and redeploy.

**Use one browser for the whole guide**, on a computer rather than a phone.

### Step 1: Create a GitHub account

GitHub keeps your copy of the code. Vercel will read it from there.

1. Go to https://github.com and click **Sign up**.
2. Enter your e-mail, a password and a username, then follow the checks (a puzzle, then a code sent to your e-mail).
3. If GitHub asks you to pick a plan, choose the **Free** one.

**Check:** you are on a GitHub page with your username or avatar in the top-right corner.

### Step 2: Make your copy of the code

1. While signed in to GitHub, go to https://github.com/w2ur/bas-de-laine-app
2. Near the top right of the page, click **Fork**.
3. On the next page, leave the owner as your username and the name as `bas-de-laine-app`. Keep the box **Copy the `main` branch only** ticked (GitHub may word it "Copy the DEFAULT branch only"; ticked or not, it makes no difference here). Click **Create fork**.

**Check:** the page title now reads `<your-username>/bas-de-laine-app`, with a small line underneath saying "forked from w2ur/bas-de-laine-app".

Your fork is public, like the original, and that is fine: it contains only code. Your data and your settings never go into it.

### Step 3: Create a Neon account and project

Neon stores your data and provides the sign-in service, which e-mails the codes.

1. Go to https://neon.tech and click **Sign up**. The simplest choice is **Continue with GitHub**, which uses the account from Step 1; accept when GitHub asks you to authorize Neon.
2. Neon asks you to create a first **project**. If it does not, look for a **New project** button.
   - **Name:** for example `bas-de-laine`.
   - **PostgreSQL version:** leave the default.
   - **Region:** pick the one closest to where you live (for example a European region if you live in Europe).
   - Click **Create project**.

**Check:** you are on your project's dashboard, with the project name at the top.

### Step 4: Copy the two database addresses

The app needs two addresses for the same database. They look almost identical; the difference matters.

1. On the project dashboard, click the **Connect** button. A window titled something like "Connect to your database" opens.
2. Find the **Connection pooling** switch (it may be labelled "Pooled connection").
3. **Switch it ON.** Copy the connection string shown, using the copy icon next to it. Make sure the whole string is copied, password included: if the password shows as `****`, click the "show password" (eye) icon first. Paste it in your note after `DATABASE_URL =`.
   - It starts with `postgresql://` and its middle part contains **`-pooler`**.
4. **Switch it OFF.** Copy the new string and paste it after `DIRECT_URL =`.
   - Same string, **without** `-pooler`.
5. Close the window.

**Check:** your note has two lines starting with `postgresql://`. Only `DATABASE_URL` contains `-pooler`. Both end with something like `?sslmode=require` (sometimes followed by `&channel_binding=require`). Keep that ending.

### Step 5: Turn on sign-in (Neon Auth)

1. In your Neon project, in the left-hand menu, click **Auth**. (Neon Auth is still marked beta, so its pages may look a little different from what is described here.)
2. If you see a button to enable it (such as **Enable Neon Auth**), click it.
3. Find the sign-in methods. The wording can vary, so look for the list of ways to sign in:
   - turn **Email OTP** (sign-in with a one-time code sent by e-mail) **on**;
   - turn **email and password** sign-in **off**;
   - leave every social login (Google, GitHub…) **off**.
4. If you see an **Allow localhost** setting, turn it **off**. It is for programmers testing on their own computer.
5. Find the **Auth URL**. It is shown on the Auth page and starts with `https://` and ends with `.auth.neon.tech`. Copy it into your note after `NEON_AUTH_BASE_URL =`.
6. Leave this browser tab open. You will come back in Step 9 to add your web address. **Until you do, nobody can sign in.**

**Check:** Email OTP is on, password sign-in is off, and your note has a `NEON_AUTH_BASE_URL` ending in `.auth.neon.tech`.

### Step 6: Make your secret key (the one command)

The app needs a long random password, of at least 32 characters, to protect sign-in sessions. Nobody should guess it, so do not make one up: let your computer generate it.

**On a Mac:**

1. Press **Cmd + Space**, type `Terminal`, and press **Enter**. A window with a blinking cursor opens.
2. Copy this line, paste it into the window (**Cmd + V**) and press **Enter**:

   ```bash
   openssl rand -base64 32
   ```

**On Windows:**

1. Click the **Start** button, type `PowerShell`, and click **Windows PowerShell**. A blue or black window with a blinking cursor opens.
2. Copy this line, paste it into the window (**Ctrl + V**, or a right-click) and press **Enter**:

   ```powershell
   $b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)
   ```

**Check:** the window prints one line of 44 random letters, digits and symbols, ending with `=`, for example `q3Vx…Zk8=` (yours will be different). Select it, copy it, and paste it into your note after `NEON_AUTH_COOKIE_SECRET =`. You can close the window.

Never reuse a value printed in a guide, this one included: the app refuses the example value, and a public key protects nothing.

Now fill in the last line of your note. After `ALLOWED_EMAILS =`, write the e-mail addresses of the people who may use the app, separated by commas **with no spaces anywhere**, for example `alice@example.com,bob@example.com`. Capital letters do not matter. **Put yours in.** Everyone on this list sees and edits the same budget, so only list the people who share it.

### Step 7: Create a Vercel account

1. Go to https://vercel.com and click **Sign Up**.
2. When asked, choose the **Hobby** plan (personal use) and enter your name.
3. Choose **Continue with GitHub**, and accept when GitHub asks to authorize Vercel.

**Check:** you are on the Vercel dashboard (often titled "Overview"), signed in.

### Step 8: Put the app online

1. On the Vercel dashboard, click **Add New…** and then **Project**.
2. Under **Import Git Repository**, find `bas-de-laine-app` and click **Import**. If it is not listed, click the option to adjust GitHub permissions (such as **Configure GitHub App** or **Adjust GitHub App Permissions**), give Vercel access to that repository, and come back.
3. On the configuration page:
   - **Project Name:** keep it or change it (for example `bas-de-laine-yourname`). It becomes part of your web address.
   - **Framework Preset:** it should already say **Next.js**. Leave the build settings alone.
   - Open the **Environment Variables** section and add your five values one by one. Type the name exactly as written in the **Key** field, paste the value into the **Value** field, then click **Add**:

     | Key | Value |
     |---|---|
     | `DATABASE_URL` | the string with `-pooler` |
     | `DIRECT_URL` | the string without `-pooler` |
     | `NEON_AUTH_BASE_URL` | the `….auth.neon.tech` address |
     | `NEON_AUTH_COOKIE_SECRET` | the 44-character line from Step 6 |
     | `ALLOWED_EMAILS` | your comma-separated addresses |

     Paste the values **without quotes and without spaces** at the start or end.
4. Click **Deploy** and wait. The first build usually takes a few minutes. Vercel shows a log while it works.

**Check:** Vercel says something like "Congratulations" and shows a picture of your app. Click **Continue to Dashboard**. Under **Domains**, the project page shows your address, ending in `.vercel.app`; if several are listed, take the shortest, normally `<project-name>.vercel.app`. **This is your web address: copy it into your note.** Use this address and no other one. Vercel also shows longer addresses for each individual deployment, and those will not let you sign in.

Signing in will not work yet: it needs Step 9. That is expected. If the build fails instead, see [When something goes wrong](#when-something-goes-wrong).

Also check the Node.js version. In your Vercel project, open **Settings**, then the build section (called **Build and Deployment**, or **General** on older layouts), and find **Node.js Version**. It should say **24.x**. If it says something else, choose 24.x and save, then go to **Deployments**, open the **⋯** menu next to the most recent one, and click **Redeploy**.

### Step 9: Tell Neon your web address

This is the step people forget. **Without it, nobody can sign in.** Neon Auth only answers sign-in requests from addresses on its list, and the list starts empty.

1. Go back to Neon, to your project's **Auth** page.
2. Open **Configuration**, then the **Domains** section (the list of trusted domains).
3. Type your web address from Step 8, **with `https://` and without anything after `.app`, not even a `/`**, for example `https://bas-de-laine-yourname.vercel.app`, then click **Add domain**.

**Check:** your address appears in the list. The real test is Step 10.

### Step 10: Sign in for the first time

1. Open your web address. You land on the sign-in page, titled **Connexion**.
2. Type your e-mail (one from `ALLOWED_EMAILS`) and click **Recevoir un code** ("get a code").
3. Within a minute or two, you receive an e-mail with a 6-digit code. It comes from Neon, not from the app. Look in your spam folder if needed.
4. Type the code and click **Se connecter** ("sign in").

**Check:** you arrive in the app, on the **Enveloppes** page, empty. This first sign-in has just created your household. Everyone else on your list who signs in later joins this same household.

**On your phone:** open the same address in the browser and use **Add to Home Screen** (in Safari's share menu on iPhone, or the ⋮ menu in Chrome on Android) to install the app.

### Step 11: Safety settings

**Previews.** If one day you change the code on another branch, Vercel builds a "preview" copy with the same settings, and therefore the same database. To prevent that:

1. In Vercel, open your project's **Settings**, then **Build and Deployment** (on some layouts it is under **Git**; the search box at the top of Settings finds it too).
2. Find **Ignored Build Step**. If a ready-made choice such as **Only build production** exists, select it. Otherwise choose the custom-command option and paste:

   ```bash
   if [ "$VERCEL_ENV" = "production" ]; then exit 1; else exit 0; fi
   ```

3. Click **Save**.

**Check:** after you reload the page, **Ignored Build Step** still shows your choice.

**Never add a variable named `DEMO_MODE`** to this project. It switches sign-in off and opens your budget to anyone who has the address. (It exists only for public demos.)

### Everyday tasks: add someone, back up, update

**Add or remove someone.**

1. In Vercel, open **Settings**, then **Environment Variables**, and edit `ALLOWED_EMAILS`: add or remove an address, keep the commas, and save.
2. Changes only apply to a new deployment. Go to **Deployments**, open the **⋯** menu next to the most recent one, and click **Redeploy**.

Removing an address removes that person's access after the redeploy. An empty list would let the people who already signed in keep their access, but nobody new could get in.

**Back up your data.** In the app, open **Configuration** from the menu, find the card **Sauvegarde et restauration**, and click **Exporter**. A file named after the day downloads, for example `bas-de-laine-backup-2026-10-25.json`. Keep it somewhere safe and private: it contains your whole budget (but no passwords or accounts). Do it regularly, and always before an update. **Importer** on the same card puts a backup file back. It **replaces** all the current data, after asking you to confirm. On Vercel, a very large file may be too big to import (Vercel limits the size of what can be sent to it), but a household's backup is usually far below that.

**Update to a new version.**

1. Back up first (above).
2. Open your fork on GitHub (`https://github.com/<your-username>/bas-de-laine-app`).
3. If GitHub says your branch is "behind" the original, click **Sync fork**, then **Update branch**.
4. Vercel notices the change and deploys the new version by itself. Any database change the new version needs is applied during that deployment.

**Check:** in Vercel, **Deployments** shows a new deployment marked **Ready**. On your phone, close and reopen the app to load the new version.

### When something goes wrong

**Where to read error messages.** Build errors: in Vercel, **Deployments**, click the deployment marked **Error**, and read the build log; the useful line is usually near the end, in red. Errors while the app runs: in Vercel, open your project's **Logs** tab.

**The build fails with `Cannot resolve environment variable: DIRECT_URL`.**
The `DIRECT_URL` variable is missing or misspelled in Vercel. The build reads it from its very first step. Check the spelling in **Settings → Environment Variables** (capital letters, underscore, no spaces), fix it, and **Redeploy**.

**The build fails with `P1000`, `P1001`, `Authentication failed` or `Can't reach database server`.**
`DIRECT_URL` (or `DATABASE_URL`) is wrong. Usually a piece of the string was not copied, the password was still hidden as `****`, or there are quotes around it. Copy it again from Neon's **Connect** window (Step 4) and **Redeploy**.

**The build fails with `NEON_AUTH_COOKIE_SECRET must be set to at least 32 characters` or `…is still the example value`.**
Your secret key is missing, too short, or copied from an example. Make a new one (Step 6), replace the value in Vercel, and **Redeploy**.

**After "Recevoir un code", the page says "Connexion impossible pour le moment" and no e-mail arrives.**
Almost always, the web address you opened is not on Neon's trusted-domain list (Step 9). Neon refuses the request with the error `INVALID_ORIGIN`, and the app can only show this general message. Check two things:
- the address in your browser is exactly the one listed in Neon, including `https://`;
- you are not on one of Vercel's longer deployment addresses.

Fix the list, then try again. If the list already looks right, wait a few minutes and try again: the message also appears when Neon is briefly unavailable.

**The e-mail with the code never arrives.**
Look in your spam folder and wait a couple of minutes. "Trop de tentatives, réessayez dans un instant" means too many requests: wait before asking again.

**"Code incorrect ou expiré".**
The code was mistyped or is too old. Click **Renvoyer le code** and use the newest e-mail.

**The code works, but then the page says "Une erreur est survenue".**
Your address is not allowed by the app. Usually one of these:
- `ALLOWED_EMAILS` is empty, which means **nobody new can ever sign in**;
- your address is not on the list, or is misspelled;
- the list was changed but the app was not redeployed.

In Vercel's **Logs**, this shows as `Email non autorisé`. Fix `ALLOWED_EMAILS`, **Redeploy**, then sign in again.

**The page says "Une erreur est survenue" for everyone, and the logs mention the database.**
Check `DATABASE_URL`: it must be the string with `-pooler`, copied whole, without quotes. Fix it and **Redeploy**.

**Nothing changed after I edited a setting in Vercel.**
Vercel settings only apply to a new deployment: **Deployments → ⋯ → Redeploy**.

---

## Français

Ce guide met en ligne votre propre copie de Bas de Laine, pour votre foyer, **gratuitement**, sans rien installer sur votre ordinateur. Pas besoin de savoir programmer. Vous allez créer trois comptes gratuits, cliquer sur leurs sites et copier quelques valeurs d'un site à l'autre. Vous taperez une seule commande, et ce guide vous montre comment.

À la fin, vous aurez :
- votre propre adresse web (par exemple `https://bas-de-laine-votrenom.vercel.app`), où vous et les personnes que vous choisissez vous connectez avec un code reçu par e-mail ;
- votre propre base de données, que seule votre copie utilise ;
- une application installable sur l'écran d'accueil de votre téléphone.

> **Ce que ça coûte**
>
> | Service | Son rôle ici | Prix |
> |---|---|---|
> | GitHub | garde votre copie du code | compte gratuit |
> | Neon | stocke vos données et envoie les codes de connexion | offre gratuite |
> | Vercel | fait tourner l'application et lui donne son adresse web | offre gratuite « Hobby », **réservée à un usage personnel, non commercial** |
> | Un nom de domaine à vous (facultatif) | une adresse plus jolie que `….vercel.app` | payé à un registraire, en général chaque année ; sans lui, vous ne payez rien |
>
> Au moment où ce guide a été écrit, aucune de ces offres gratuites ne demandait de carte bancaire. Les prestataires fixent eux-mêmes leurs prix et leurs limites et peuvent les changer : consultez leurs pages de tarifs avant de commencer (https://github.com/pricing, https://neon.com/pricing, https://vercel.com/pricing). Brancher un nom de domaine à vous n'est pas couvert par ce guide. Un budget familial est minuscule pour ces services. Sur l'offre gratuite de Neon, la base s'endort quand personne ne l'utilise : la première page après un moment calme peut mettre quelques secondes à s'afficher. C'est normal.

### Sommaire

1. [Avant de commencer](#avant-de-commencer)
2. [Étape 1 : créer un compte GitHub](#étape-1--créer-un-compte-github)
3. [Étape 2 : faire votre copie du code](#étape-2--faire-votre-copie-du-code)
4. [Étape 3 : créer un compte et un projet Neon](#étape-3--créer-un-compte-et-un-projet-neon)
5. [Étape 4 : copier les deux adresses de la base](#étape-4--copier-les-deux-adresses-de-la-base)
6. [Étape 5 : activer la connexion (Neon Auth)](#étape-5--activer-la-connexion-neon-auth)
7. [Étape 6 : fabriquer votre clé secrète (la seule commande)](#étape-6--fabriquer-votre-clé-secrète-la-seule-commande)
8. [Étape 7 : créer un compte Vercel](#étape-7--créer-un-compte-vercel)
9. [Étape 8 : mettre l'application en ligne](#étape-8--mettre-lapplication-en-ligne)
10. [Étape 9 : donner votre adresse web à Neon](#étape-9--donner-votre-adresse-web-à-neon)
11. [Étape 10 : première connexion](#étape-10--première-connexion)
12. [Étape 11 : réglages de sécurité](#étape-11--réglages-de-sécurité)
13. [Au quotidien : ajouter quelqu'un, sauvegarder, mettre à jour](#au-quotidien--ajouter-quelquun-sauvegarder-mettre-à-jour)
14. [Quand quelque chose ne marche pas](#quand-quelque-chose-ne-marche-pas)

### Avant de commencer

**Les mots que vous allez croiser :**
- **Dépôt** (« repository », « repo ») : un dossier de code stocké sur GitHub.
- **Fork** : votre propre copie du dépôt de quelqu'un d'autre, sur votre compte GitHub.
- **Déployer** : mettre le code en ligne pour qu'il tourne comme un site web.
- **Variable d'environnement** : un réglage nommé (un nom et une valeur) que vous donnez à l'application sans toucher à son code. Vous en saisirez cinq dans Vercel.
- **Terminal** : une fenêtre où l'on tape des commandes au lieu de cliquer. Vous en aurez besoin une fois, à l'étape 6.

Les sites de GitHub, Neon et Vercel sont en anglais : ce guide donne les noms des boutons tels qu'ils s'affichent, en anglais.

**Ouvrez une note privée** sur votre ordinateur (un document texte que vous seul voyez). Vous y rassemblerez cinq valeurs :

```
DATABASE_URL =
DIRECT_URL =
NEON_AUTH_BASE_URL =
NEON_AUTH_COOKIE_SECRET =
ALLOWED_EMAILS =
```

Trois d'entre elles sont des mots de passe déguisés (les deux adresses de la base contiennent le mot de passe de votre base, et la clé secrète en est un). **Ne publiez jamais cette note et ne la mettez jamais sur GitHub.** Gardez-la jusqu'à ce que vous ayez terminé et réussi une première connexion, puis supprimez-la. Vous pourrez recopier les adresses de la base depuis Neon plus tard ; si vous perdez la clé secrète, fabriquez-en une nouvelle (étape 6), remplacez-la dans Vercel et redéployez.

**Utilisez un seul navigateur pour tout le guide**, sur un ordinateur plutôt qu'un téléphone.

### Étape 1 : créer un compte GitHub

GitHub garde votre copie du code. Vercel ira la lire là-bas.

1. Allez sur https://github.com et cliquez sur **Sign up**.
2. Saisissez votre e-mail, un mot de passe et un nom d'utilisateur, puis suivez les vérifications (une énigme, puis un code envoyé par e-mail).
3. Si GitHub vous demande de choisir une offre, prenez **Free**.

**Vérification :** vous êtes sur une page GitHub, avec votre nom d'utilisateur ou votre avatar en haut à droite.

### Étape 2 : faire votre copie du code

1. Connecté à GitHub, allez sur https://github.com/w2ur/bas-de-laine-app
2. En haut à droite de la page, cliquez sur **Fork**.
3. Sur la page suivante, laissez votre nom d'utilisateur comme propriétaire (Owner) et `bas-de-laine-app` comme nom. Laissez cochée la case **Copy the `main` branch only** (GitHub peut l'intituler « Copy the DEFAULT branch only » ; cochée ou non, cela ne change rien ici). Cliquez sur **Create fork**.

**Vérification :** le titre de la page est maintenant `<votre-nom-d-utilisateur>/bas-de-laine-app`, avec en dessous une petite ligne « forked from w2ur/bas-de-laine-app ».

Votre fork est public, comme l'original, et c'est sans danger : il ne contient que du code. Vos données et vos réglages n'y vont jamais.

### Étape 3 : créer un compte et un projet Neon

Neon stocke vos données et fournit le service de connexion, qui envoie les codes par e-mail.

1. Allez sur https://neon.tech et cliquez sur **Sign up**. Le plus simple est **Continue with GitHub**, qui utilise le compte de l'étape 1 ; acceptez quand GitHub demande d'autoriser Neon.
2. Neon vous propose de créer un premier **projet**. Sinon, cherchez un bouton **New project**.
   - **Nom :** par exemple `bas-de-laine`.
   - **Version de PostgreSQL :** laissez celle proposée.
   - **Région :** choisissez la plus proche de chez vous (par exemple une région européenne si vous habitez en Europe).
   - Cliquez sur **Create project**.

**Vérification :** vous êtes sur le tableau de bord du projet, avec son nom en haut.

### Étape 4 : copier les deux adresses de la base

L'application a besoin de deux adresses pour la même base. Elles se ressemblent beaucoup ; la différence compte.

1. Sur le tableau de bord du projet, cliquez sur le bouton **Connect**. Une fenêtre intitulée à peu près « Connect to your database » s'ouvre.
2. Repérez l'interrupteur **Connection pooling** (il peut s'appeler « Pooled connection »).
3. **Activez-le.** Copiez la chaîne de connexion affichée avec l'icône de copie à côté. Vérifiez qu'elle est copiée en entier, mot de passe compris : si le mot de passe apparaît en `****`, cliquez d'abord sur l'icône « afficher » (l'œil). Collez-la dans votre note après `DATABASE_URL =`.
   - Elle commence par `postgresql://` et contient **`-pooler`** au milieu.
4. **Désactivez-le.** Copiez la nouvelle chaîne et collez-la après `DIRECT_URL =`.
   - Même chaîne, **sans** `-pooler`.
5. Fermez la fenêtre.

**Vérification :** votre note contient deux lignes qui commencent par `postgresql://`. Seule `DATABASE_URL` contient `-pooler`. Les deux finissent par quelque chose comme `?sslmode=require` (parfois suivi de `&channel_binding=require`). Gardez cette fin.

### Étape 5 : activer la connexion (Neon Auth)

1. Dans votre projet Neon, dans le menu de gauche, cliquez sur **Auth**. (Neon Auth est encore marqué « beta » : ses pages peuvent différer un peu de ce qui est décrit ici.)
2. Si un bouton propose de l'activer (par exemple **Enable Neon Auth**), cliquez dessus.
3. Repérez les méthodes de connexion. L'intitulé peut varier : cherchez la liste des façons de se connecter.
   - **Activez Email OTP** (connexion par code à usage unique envoyé par e-mail) ;
   - **désactivez** la connexion par **e-mail et mot de passe** ;
   - laissez **désactivées** toutes les connexions via un réseau social (Google, GitHub…).
4. Si vous voyez un réglage **Allow localhost**, **désactivez-le**. Il sert aux programmeurs qui testent sur leur propre ordinateur.
5. Repérez l'**Auth URL**. Elle est affichée sur la page Auth, commence par `https://` et finit par `.auth.neon.tech`. Copiez-la dans votre note après `NEON_AUTH_BASE_URL =`.
6. Laissez cet onglet ouvert : vous y reviendrez à l'étape 9 pour ajouter votre adresse web. **Tant que ce n'est pas fait, personne ne peut se connecter.**

**Vérification :** Email OTP est activé, la connexion par mot de passe est désactivée, et votre note contient une `NEON_AUTH_BASE_URL` qui finit par `.auth.neon.tech`.

### Étape 6 : fabriquer votre clé secrète (la seule commande)

L'application a besoin d'un long mot de passe aléatoire, d'au moins 32 caractères, pour protéger les sessions de connexion. Personne ne doit pouvoir le deviner : ne l'inventez pas, laissez votre ordinateur le tirer au sort.

**Sur Mac :**

1. Appuyez sur **Cmd + Espace**, tapez `Terminal` et appuyez sur **Entrée**. Une fenêtre avec un curseur qui clignote s'ouvre.
2. Copiez cette ligne, collez-la dans la fenêtre (**Cmd + V**) et appuyez sur **Entrée** :

   ```bash
   openssl rand -base64 32
   ```

**Sur Windows :**

1. Cliquez sur le bouton **Démarrer**, tapez `PowerShell` et cliquez sur **Windows PowerShell**. Une fenêtre bleue ou noire avec un curseur qui clignote s'ouvre.
2. Copiez cette ligne, collez-la dans la fenêtre (**Ctrl + V**, ou clic droit) et appuyez sur **Entrée** :

   ```powershell
   $b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)
   ```

**Vérification :** la fenêtre affiche une ligne de 44 lettres, chiffres et symboles au hasard, terminée par `=`, par exemple `q3Vx…Zk8=` (la vôtre sera différente). Sélectionnez-la, copiez-la et collez-la dans votre note après `NEON_AUTH_COOKIE_SECRET =`. Vous pouvez fermer la fenêtre.

Ne réutilisez jamais une valeur imprimée dans un guide, celui-ci compris : l'application refuse la valeur d'exemple, et une clé publique ne protège rien.

Remplissez maintenant la dernière ligne de votre note. Après `ALLOWED_EMAILS =`, écrivez les adresses e-mail des personnes qui pourront utiliser l'application, séparées par des virgules **sans aucun espace**, par exemple `alice@example.com,bob@example.com`. Les majuscules ne comptent pas. **Mettez la vôtre.** Tout le monde sur cette liste voit et modifie le même budget : ne listez que les personnes qui le partagent.

### Étape 7 : créer un compte Vercel

1. Allez sur https://vercel.com et cliquez sur **Sign Up**.
2. Quand on vous le demande, choisissez l'offre **Hobby** (usage personnel) et saisissez votre nom.
3. Choisissez **Continue with GitHub**, et acceptez quand GitHub demande d'autoriser Vercel.

**Vérification :** vous êtes sur le tableau de bord de Vercel (souvent intitulé « Overview »), connecté.

### Étape 8 : mettre l'application en ligne

1. Sur le tableau de bord de Vercel, cliquez sur **Add New…** puis sur **Project**.
2. Sous **Import Git Repository**, trouvez `bas-de-laine-app` et cliquez sur **Import**. S'il n'apparaît pas, cliquez sur l'option qui règle les autorisations GitHub (par exemple **Configure GitHub App** ou **Adjust GitHub App Permissions**), donnez à Vercel l'accès à ce dépôt, puis revenez.
3. Sur la page de configuration :
   - **Project Name :** gardez-le ou changez-le (par exemple `bas-de-laine-votrenom`). Il fera partie de votre adresse web.
   - **Framework Preset :** il doit déjà indiquer **Next.js**. Ne touchez pas aux réglages de build.
   - Ouvrez la section **Environment Variables** et ajoutez vos cinq valeurs une par une. Tapez le nom exactement comme écrit dans le champ **Key**, collez la valeur dans le champ **Value**, puis cliquez sur **Add** :

     | Key | Value |
     |---|---|
     | `DATABASE_URL` | la chaîne avec `-pooler` |
     | `DIRECT_URL` | la chaîne sans `-pooler` |
     | `NEON_AUTH_BASE_URL` | l'adresse en `….auth.neon.tech` |
     | `NEON_AUTH_COOKIE_SECRET` | la ligne de 44 caractères de l'étape 6 |
     | `ALLOWED_EMAILS` | vos adresses séparées par des virgules |

     Collez les valeurs **sans guillemets et sans espace** au début ni à la fin.
4. Cliquez sur **Deploy** et patientez. Le premier build prend en général quelques minutes. Vercel affiche un journal pendant ce temps.

**Vérification :** Vercel affiche quelque chose comme « Congratulations » et une image de votre application. Cliquez sur **Continue to Dashboard**. Sous **Domains**, la page du projet indique votre adresse, qui finit par `.vercel.app` ; s'il y en a plusieurs, prenez la plus courte, normalement `<nom-du-projet>.vercel.app`. **C'est votre adresse web : copiez-la dans votre note.** Utilisez cette adresse et aucune autre. Vercel montre aussi des adresses plus longues pour chaque déploiement, et celles-là ne permettent pas de se connecter.

La connexion ne fonctionne pas encore : il lui faut l'étape 9. C'est normal. Si le build échoue, voir [Quand quelque chose ne marche pas](#quand-quelque-chose-ne-marche-pas).

Vérifiez aussi la version de Node.js. Dans votre projet Vercel, ouvrez **Settings**, puis la rubrique de build (appelée **Build and Deployment**, ou **General** dans les anciennes présentations), et repérez **Node.js Version**. Elle doit indiquer **24.x**. Si ce n'est pas le cas, choisissez 24.x et enregistrez, puis allez dans **Deployments**, ouvrez le menu **⋯** à côté du déploiement le plus récent et cliquez sur **Redeploy**.

### Étape 9 : donner votre adresse web à Neon

C'est l'étape qu'on oublie. **Sans elle, personne ne peut se connecter.** Neon Auth ne répond qu'aux demandes de connexion venant des adresses de sa liste, et cette liste est vide au départ.

1. Retournez dans Neon, sur la page **Auth** de votre projet.
2. Ouvrez **Configuration**, puis la section **Domains** (la liste des domaines de confiance).
3. Tapez votre adresse web de l'étape 8, **avec `https://` et sans rien après `.app`, pas même un `/`**, par exemple `https://bas-de-laine-votrenom.vercel.app`, puis cliquez sur **Add domain**.

**Vérification :** votre adresse apparaît dans la liste. Le vrai test, c'est l'étape 10.

### Étape 10 : première connexion

1. Ouvrez votre adresse web. Vous arrivez sur la page de connexion, intitulée **Connexion**.
2. Tapez votre e-mail (un de ceux de `ALLOWED_EMAILS`) et cliquez sur **Recevoir un code**.
3. En une minute ou deux, vous recevez un e-mail avec un code à 6 chiffres. Il vient de Neon, pas de l'application. Regardez dans les indésirables si besoin.
4. Tapez le code et cliquez sur **Se connecter**.

**Vérification :** vous arrivez dans l'application, sur la page **Enveloppes**, vide. Cette première connexion vient de créer votre foyer. Toutes les autres personnes de votre liste qui se connecteront ensuite rejoindront ce même foyer.

**Sur votre téléphone :** ouvrez la même adresse dans le navigateur et utilisez **Sur l'écran d'accueil** (menu de partage de Safari sur iPhone, ou menu ⋮ de Chrome sur Android) pour installer l'application.

### Étape 11 : réglages de sécurité

**Les previews.** Si un jour vous modifiez le code sur une autre branche, Vercel construit une copie de « preview » avec les mêmes réglages, donc la même base. Pour l'empêcher :

1. Dans Vercel, ouvrez **Settings** de votre projet, puis **Build and Deployment** (selon la présentation, c'est sous **Git** ; la recherche en haut de Settings le trouve aussi).
2. Repérez **Ignored Build Step**. S'il existe un choix tout prêt comme **Only build production**, sélectionnez-le. Sinon, choisissez l'option de commande personnalisée et collez :

   ```bash
   if [ "$VERCEL_ENV" = "production" ]; then exit 1; else exit 0; fi
   ```

3. Cliquez sur **Save**.

**Vérification :** après rechargement de la page, **Ignored Build Step** affiche toujours votre choix.

**N'ajoutez jamais de variable nommée `DEMO_MODE`** à ce projet. Elle désactive la connexion et ouvre votre budget à quiconque a l'adresse. (Elle n'existe que pour les démos publiques.)

### Au quotidien : ajouter quelqu'un, sauvegarder, mettre à jour

**Ajouter ou retirer quelqu'un.**

1. Dans Vercel, ouvrez **Settings**, puis **Environment Variables**, et modifiez `ALLOWED_EMAILS` : ajoutez ou retirez une adresse, gardez les virgules, et enregistrez.
2. Les changements ne s'appliquent qu'à un nouveau déploiement. Allez dans **Deployments**, ouvrez le menu **⋯** à côté du déploiement le plus récent et cliquez sur **Redeploy**.

Retirer une adresse retire l'accès à cette personne après le redéploiement. Avec une liste vide, les personnes déjà connectées garderaient leur accès, mais personne de nouveau ne pourrait entrer.

**Sauvegarder vos données.** Dans l'application, ouvrez **Configuration** depuis le menu, repérez la carte **Sauvegarde et restauration** et cliquez sur **Exporter**. Un fichier au nom du jour se télécharge, par exemple `bas-de-laine-backup-2026-10-25.json`. Rangez-le dans un endroit sûr et privé : il contient tout votre budget (mais aucun mot de passe ni compte). Faites-le régulièrement, et toujours avant une mise à jour. **Importer**, sur la même carte, remet un fichier de sauvegarde en place. Il **remplace** toutes les données actuelles, après vous avoir demandé de confirmer. Sur Vercel, un très gros fichier peut être trop lourd pour l'import (Vercel limite la taille de ce qu'on peut lui envoyer), mais la sauvegarde d'un foyer reste en général bien en dessous.

**Passer à une nouvelle version.**

1. Sauvegardez d'abord (ci-dessus).
2. Ouvrez votre fork sur GitHub (`https://github.com/<votre-nom-d-utilisateur>/bas-de-laine-app`).
3. Si GitHub indique que votre branche est « behind » (en retard sur l'original), cliquez sur **Sync fork**, puis sur **Update branch**.
4. Vercel voit le changement et déploie la nouvelle version tout seul. Les changements de base dont la nouvelle version a besoin s'appliquent pendant ce déploiement.

**Vérification :** dans Vercel, **Deployments** montre un nouveau déploiement marqué **Ready**. Sur votre téléphone, fermez puis rouvrez l'application pour charger la nouvelle version.

### Quand quelque chose ne marche pas

**Où lire les messages d'erreur.** Erreurs de build : dans Vercel, **Deployments**, cliquez sur le déploiement marqué **Error** et lisez le journal de build ; la ligne utile est en général vers la fin, en rouge. Erreurs pendant que l'application tourne : dans Vercel, ouvrez l'onglet **Logs** de votre projet.

**Le build échoue avec `Cannot resolve environment variable: DIRECT_URL`.**
La variable `DIRECT_URL` manque ou est mal orthographiée dans Vercel. Le build la lit dès sa toute première étape. Vérifiez l'orthographe dans **Settings → Environment Variables** (majuscules, tiret bas, pas d'espace), corrigez, puis **Redeploy**.

**Le build échoue avec `P1000`, `P1001`, `Authentication failed` ou `Can't reach database server`.**
`DIRECT_URL` (ou `DATABASE_URL`) est fausse. Le plus souvent, un morceau de la chaîne n'a pas été copié, le mot de passe était encore masqué en `****`, ou il y a des guillemets autour. Recopiez-la depuis la fenêtre **Connect** de Neon (étape 4), puis **Redeploy**.

**Le build échoue avec `NEON_AUTH_COOKIE_SECRET must be set to at least 32 characters` ou `…is still the example value`.**
Votre clé secrète manque, est trop courte ou a été copiée d'un exemple. Fabriquez-en une nouvelle (étape 6), remplacez la valeur dans Vercel, puis **Redeploy**.

**Après « Recevoir un code », la page affiche « Connexion impossible pour le moment » et aucun e-mail n'arrive.**
Presque toujours, l'adresse web que vous avez ouverte n'est pas dans la liste des domaines de confiance de Neon (étape 9). Neon refuse la demande avec l'erreur `INVALID_ORIGIN`, et l'application ne peut afficher que ce message général. Vérifiez deux choses :
- l'adresse dans votre navigateur est exactement celle de la liste de Neon, `https://` compris ;
- vous n'êtes pas sur une des adresses de déploiement plus longues de Vercel.

Corrigez la liste, puis réessayez. Si la liste semble déjà bonne, attendez quelques minutes et réessayez : le message apparaît aussi quand Neon est brièvement indisponible.

**L'e-mail avec le code n'arrive jamais.**
Regardez dans les indésirables et patientez quelques minutes. « Trop de tentatives, réessayez dans un instant » signifie trop de demandes : attendez avant de redemander.

**« Code incorrect ou expiré ».**
Le code a été mal tapé ou est trop ancien. Cliquez sur **Renvoyer le code** et utilisez l'e-mail le plus récent.

**Le code fonctionne, mais la page affiche ensuite « Une erreur est survenue ».**
L'application n'autorise pas votre adresse. En général, une de ces causes :
- `ALLOWED_EMAILS` est vide, ce qui veut dire que **personne de nouveau ne peut jamais se connecter** ;
- votre adresse n'est pas dans la liste, ou elle y est mal écrite ;
- la liste a été modifiée mais l'application n'a pas été redéployée.

Dans les **Logs** de Vercel, cela apparaît comme `Email non autorisé`. Corrigez `ALLOWED_EMAILS`, faites **Redeploy**, puis reconnectez-vous.

**La page affiche « Une erreur est survenue » pour tout le monde, et les journaux parlent de la base.**
Vérifiez `DATABASE_URL` : ce doit être la chaîne avec `-pooler`, copiée en entier, sans guillemets. Corrigez, puis **Redeploy**.

**Rien n'a changé après la modification d'un réglage dans Vercel.**
Les réglages de Vercel ne s'appliquent qu'à un nouveau déploiement : **Deployments → ⋯ → Redeploy**.
