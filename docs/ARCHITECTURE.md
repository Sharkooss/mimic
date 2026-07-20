# Architecture technique — Mimic

## Vue d'ensemble

Monorepo **pnpm** à trois packages, avec des **types et contrats d'événements
partagés** entre client et serveur — essentiel pour un jeu temps réel.

```
mimic/
├── apps/
│   ├── client/          React + Vite + Tailwind (canvas de peinture, UI)
│   └── server/          Fastify + Socket.IO + Prisma
├── packages/
│   └── shared/          Types, constantes de gameplay, contrats Socket.IO, schémas zod
├── Dockerfile           Image unique multi-stage (build → runtime)
├── compose.yaml         Prod : app + Postgres + labels Traefik
└── compose.dev.yaml     Postgres local pour le dev
```

### Pourquoi une seule image en production

Le serveur Fastify sert **à la fois** l'API HTTP, le WebSocket **et** le client
statique buildé (`@fastify/static` + fallback SPA). Un seul conteneur public →
un seul routeur Traefik, pas de CORS cross-domain, déploiement trivial.

En développement, le client tourne sur le dev-server Vite (`:5173`) qui
**proxifie** `/api` et `/socket.io` vers Fastify (`:3000`).

## Flux temps réel

```
Client (socket.io-client)  ⇄  Serveur (socket.io)  ⇄  RoomManager (mémoire)
        │  contrats typés ClientToServerEvents / ServerToClientEvents (@mimic/shared)
        └── payloads validés côté serveur avec zod
```

- **Source de vérité** : le serveur. Le client est « bête » et rend l'état reçu
  via `room:snapshot`.
- **État chaud** (salons, manches) en **mémoire serveur** (`apps/server/src/game/rooms.ts`).
- **Persistance** (comptes, stats, historique) en **PostgreSQL via Prisma**.
- Les **positions/pixels** transitent par WebSocket ; le scoring de camouflage
  est calculé **côté serveur** (anti-triche).

## Contrats partagés (`@mimic/shared`)

| Fichier        | Rôle                                                          |
| -------------- | ------------------------------------------------------------- |
| `constants.ts` | Valeurs de gameplay (taille perso, durées, barème, lobby…).   |
| `types.ts`     | Types domaine (Room, Player, Artwork, GamePhase…).            |
| `events.ts`    | Interfaces d'événements Socket.IO + schémas zod des payloads. |

Ces fichiers sont l'unique source de vérité : ne jamais dupliquer une constante
de gameplay dans le client ou le serveur.

## Base de données

Modèles Prisma principaux : `User`, `PlayerStats`, `Artwork`, `Match`,
`MatchParticipant`, `MatchRound`. Voir `apps/server/prisma/schema.prisma`.

- Les migrations sont appliquées au démarrage du conteneur (`prisma migrate
deploy` dans `docker-entrypoint.sh`).
- Le client Prisma est généré au build (`prisma generate`).

## Scalabilité (au-delà du MVP)

- L'état des salons est en mémoire d'un seul process. Pour scaler horizontalement,
  introduire l'**adaptateur Redis de Socket.IO** + un store de salons partagé.
- Le calcul de camouflage (comparaison de pixels) peut être déporté dans un
  worker si nécessaire.

## Sécurité (points d'attention)

- Tous les payloads entrants sont **validés (zod)** côté serveur.
- Le scoring et la logique de manche sont **autoritatifs côté serveur**.
- Secrets via variables d'environnement, jamais committés.
- Le client ne reçoit **pas** la position des cachés pendant la recherche (à
  implémenter : ne diffuser que ce que le rôle a le droit de voir).
