# syntax=docker/dockerfile:1

# ---- Base : Node 22 + pnpm via corepack --------------------------------------
FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
# openssl : requis par les moteurs Prisma (détection OpenSSL 3 sur Alpine/musl).
RUN corepack enable && apk add --no-cache openssl
WORKDIR /app

# ---- Build : installe tout, build shared + client + server -------------------
FROM base AS build

# Manifests d'abord (cache des dépendances).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/client/package.json apps/client/
RUN pnpm install --frozen-lockfile

# Sources (node_modules exclu via .dockerignore).
COPY . .

RUN pnpm --filter @mimic/shared build \
 && pnpm --filter @mimic/server db:generate \
 && pnpm --filter @mimic/client build \
 && pnpm --filter @mimic/server build

# ---- Runtime -----------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production
ENV CLIENT_DIST_PATH=/app/apps/client/dist
WORKDIR /app

# On récupère l'app buildée (dist + node_modules avec le client Prisma généré).
COPY --from=build /app ./

COPY docker-entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

ENTRYPOINT ["entrypoint.sh"]
