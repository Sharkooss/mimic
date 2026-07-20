#!/bin/sh
set -e

# Applique les migrations de base de données avant de démarrer.
# (No-op tant qu'aucune migration n'est committée.)
echo "→ Prisma migrate deploy…"
pnpm --filter @mimic/server exec prisma migrate deploy \
  || echo "⚠  migrate deploy ignoré (aucune migration ?) — poursuite du démarrage."

echo "→ Démarrage du serveur Mimic…"
exec node apps/server/dist/index.js
