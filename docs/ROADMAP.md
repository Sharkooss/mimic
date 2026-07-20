# Roadmap — Mimic

Développement par phases, comme un studio. Chaque phase = un **milestone**
GitHub ; chaque ligne ci-dessous = une **issue**.

> Suivi en temps réel : [issues](https://github.com/Sharkooss/mimic/issues) ·
> [milestones](https://github.com/Sharkooss/mimic/milestones)

---

## Phase 1 — Conception & Setup ✅ (socle posé)

Objectif : un squelette qui compile, tourne en local et se déploie.

- [x] Environnement monorepo (client / server / shared), tooling (pnpm, TS, Prettier)
- [x] Dockerfile multi-stage + Compose + labels Traefik + déploiement VPS
- [x] GDD, architecture, roadmap
- [ ] Pipeline CI (typecheck + build + format) via GitHub Actions

## Phase 2 — MVP jouable

Objectif : une partie complète jouable entre amis (une manche de bout en bout).

- [ ] Authentification (register / login, hash mot de passe, JWT) + modèle `User`
- [ ] Lobby complet : création/join par code, liste des joueurs, réassignation d'hôte
- [ ] Machine à états de manche (phases, timers, rotation du chercheur)
- [ ] Canvas de peinture : pinceau + taille réglable
- [ ] Outil pot de remplissage (bucket)
- [ ] Outil pipette (prélèvement de couleur sur le tableau)
- [ ] Placement & rotation du personnage (zoom/pan en phase camouflage)
- [ ] Verrouillage de position + envoi des pixels au serveur
- [ ] Vue chercheur : zoom/pan borné, clic, cooldown 3 s sur clic raté
- [ ] Moteur de scoring de camouflage (colorMatch / edge / contrast)
- [ ] Attribution des points & écran de résultats de manche
- [ ] Synchronisation d'état & snapshots (visibilité par rôle)

## Phase 3 — Alpha

Objectif : contenu, comptes, progression, rejouabilité.

- [ ] ~50 tableaux + pipeline de préparation des œuvres (métadonnées, domaine public)
- [ ] Persistance des parties (`Match` / `MatchRound` / `MatchParticipant`)
- [ ] Profil joueur + statistiques détaillées
- [ ] Système d'XP & de niveaux
- [ ] Historique des parties
- [ ] Écran de classement final soigné

## Phase 4 — Version 1.0

Objectif : compétition, rétention, cosmétiques.

- [ ] Matchmaking public
- [ ] Classement (leaderboard) & mode Ranked (ELO)
- [ ] Cosmétiques (skins, palettes, emotes) — boutique **esthétique uniquement**
- [ ] Défis quotidiens
- [ ] Saisons
- [ ] Modes additionnels : Blitz, Coop, « Tout le monde cherche », Créatif
- [ ] Événements de recherche (tremblement, luminosité, loupe, indice)
- [ ] Design sonore & musiques

## Transverse (au fil de l'eau)

- [ ] Scalabilité : adaptateur Redis pour Socket.IO
- [ ] Tests (unitaires + e2e) & couverture
- [ ] Observabilité (logs structurés, métriques, healthcheck avancé)
