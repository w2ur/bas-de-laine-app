# Self-hosting image: the Next.js standalone server, plus the Prisma CLI so the
# container applies pending migrations (`prisma migrate deploy`) before it serves.
# Runtime configuration comes from the environment; compose.yaml shows the set.

FROM node:24-slim AS base
# Prisma's schema engine (used by `migrate deploy`) needs OpenSSL to detect the platform.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV NEXT_TELEMETRY_DISABLED=1

# ── Dependencies ── `npm ci` runs postinstall, i.e. `prisma generate`.
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
# prisma.config.ts resolves DIRECT_URL when it loads; nothing connects during install.
ENV DIRECT_URL=postgresql://build:build@localhost:5432/build
RUN npm ci --no-audit --no-fund

# ── Build ── placeholders only: next build evaluates the auth module but nothing
# connects, and this stage's environment never reaches the runtime image. The cookie
# secret is a throwaway generated for this one command.
FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV BUILD_STANDALONE=1 \
    DATABASE_URL=postgresql://build:build@localhost:5432/build \
    DIRECT_URL=postgresql://build:build@localhost:5432/build \
    NEON_AUTH_BASE_URL=https://placeholder.auth.neon.tech
RUN NEON_AUTH_COOKIE_SECRET="$(head -c 32 /dev/urandom | base64)" npm run build

# ── Migration tooling ── the Prisma CLI at the lockfile's exact version, installed
# apart from the app: the standalone server ships only its traced runtime files.
FROM base AS migrate
WORKDIR /migrate
COPY package-lock.json /tmp/package-lock.json
RUN set -eu; \
  v() { node -p "require('/tmp/package-lock.json').packages['node_modules/$1'].version"; }; \
  echo '{"private":true}' > package.json; \
  npm install --no-audit --no-fund "prisma@$(v prisma)" "dotenv@$(v dotenv)"; \
  rm /tmp/package-lock.json
COPY prisma.config.ts ./
COPY prisma/schema.prisma ./prisma/schema.prisma
COPY prisma/migrations ./prisma/migrations

# ── Runtime ──
FROM base AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=migrate --chown=node:node /migrate /migrate
WORKDIR /app
# Standalone leaves public/ and .next/static to the deployer; without them the
# service worker, the manifest, the icons and every client chunk would be missing.
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
CMD ["sh", "-c", "cd /migrate && ./node_modules/.bin/prisma migrate deploy && cd /app && exec node server.js"]
