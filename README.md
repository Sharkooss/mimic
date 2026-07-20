# 🎨 Mimic

**Le jeu de cache-cache artistique multijoueur, directement dans le navigateur.**

Peignez votre personnage pour le fondre dans une œuvre d'art, cachez-vous… puis
débusquez les autres. Un lien, un code de salon, et vos amis jouent immédiatement.

> Vision : _« Le meilleur jeu de cache-cache artistique sur navigateur. »_

---

## Comment ça se joue

1. **Lobby** — un hôte crée une partie, partage un code (ex. `ABC123`).
2. **Camouflage** (~40 s) — chaque joueur place son personnage `64×64` sur le
   tableau et le peint (pinceau, pot de remplissage, pipette) pour disparaître.
3. **Recherche** (~90 s) — un joueur devient chercheur : il zoome, se déplace et
   clique pour trouver les cachés. Un clic raté = 3 s de cooldown.
4. **Résultats** — points pour le chercheur (trouvailles) et les cachés (survie,
   qualité du camouflage). Nouveau tableau, nouveau chercheur, jusqu'à ce que
   chacun ait cherché au moins une fois.

Détails complets dans le [Game Design Document](docs/GDD.md).

## Stack technique

| Couche      | Techno                                                |
| ----------- | ----------------------------------------------------- |
| Client      | React + TypeScript + Vite + Tailwind + Canvas         |
| Serveur     | Node 22 + Fastify + Socket.IO                         |
| Base        | PostgreSQL + Prisma                                   |
| Temps réel  | WebSocket (Socket.IO), contrats typés partagés        |
| Déploiement | Docker (image unique) + Traefik (HTTPS Let's Encrypt) |

Monorepo pnpm : `apps/client`, `apps/server`, `packages/shared` (types &
contrats d'événements communs). Voir [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Développement local

Prérequis : **Node 22+**, **pnpm 10+**, **Docker** (pour Postgres).

```bash
pnpm install

# 1. Base de données locale
docker compose -f compose.dev.yaml up -d
cp apps/server/.env.example apps/server/.env

# 2. Prisma (client + schéma)
pnpm db:generate
pnpm db:migrate            # crée/applique les migrations

# 3. Lancer client + serveur (build shared puis dev en parallèle)
pnpm dev
```

- Client : http://localhost:5173
- API/WS : http://localhost:3000 (proxifié par Vite)

## Déploiement (VPS Docker + Traefik)

Le serveur sert l'API, le WebSocket **et** le client statique buildé : **une
seule image**, un seul conteneur public.

```bash
cd /srv/docker/apps/mimic
cp .env.example .env
nano .env                  # APP_DOMAIN, secrets, mot de passe Postgres
docker compose up -d --build
docker compose logs -f
```

- **Port interne** : `3000` (routé par Traefik, jamais exposé directement).
- **Réseau** : le service `app` est sur `web` (externe, Traefik) + `default` (Postgres).
- **Variables obligatoires** : `APP_DOMAIN`, `APP_SECRET`, `POSTGRES_*` (voir `.env.example`).
- **Volumes** : `db_data` (données PostgreSQL persistantes).
- **Migrations** : appliquées automatiquement au démarrage (`prisma migrate deploy`).
- **DNS** : pointer `mimic.louis-nectoux.fr` (A/AAAA) vers le VPS.

Healthcheck : `GET /api/health`.

## Scripts utiles

| Commande          | Effet                                       |
| ----------------- | ------------------------------------------- |
| `pnpm dev`        | Client + serveur en watch                   |
| `pnpm build`      | Build de tous les packages                  |
| `pnpm typecheck`  | Vérification TypeScript (tous les packages) |
| `pnpm format`     | Prettier (écriture)                         |
| `pnpm db:migrate` | Migrations Prisma                           |
| `pnpm db:studio`  | Prisma Studio                               |

## Roadmap

Le projet avance par phases (Conception → MVP → Alpha → 1.0).
Voir [docs/ROADMAP.md](docs/ROADMAP.md) et les
[issues GitHub](https://github.com/Sharkooss/mimic/issues).
