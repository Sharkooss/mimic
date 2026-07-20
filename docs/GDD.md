# Mimic — Game Design Document

_Version 0.1 — document vivant, référence pour tout le développement._

## 1. Pitch

Mimic est un jeu de cache-cache **artistique** multijoueur en ligne, jouable dans
le navigateur. Chaque joueur peint son personnage pour le fondre dans une œuvre
d'art célèbre, puis se cache dedans. À tour de rôle, un joueur devient chercheur
et tente de débusquer les autres avant la fin du temps.

**Différenciateur** : le camouflage est **créé par le joueur**, pas prédéfini. Le
jeu récompense autant l'observation et la stratégie de placement que la
précision. Objectif de design : **rester amusant même pour ceux qui ne savent pas
dessiner**.

## 2. Piliers de design

1. **Accessible** — la victoire dépend du bon emplacement, de l'observation et de
   la gestion des actions, pas seulement du talent artistique.
2. **Profondeur** — camouflage multi-critères, choix de placement, gestion du
   temps créent un plafond de compétence élevé.
3. **Instantané** — un lien, un code, on joue. Aucune installation.
4. **Lisible** — interface minimaliste (type Figma), le tableau est la vedette.

## 3. Boucle de jeu

```
Lobby → [ Tableau aléatoire → 1 chercheur désigné → Camouflage (40s)
          → Recherche (90s) → Résultats ] × N manches → Classement final
```

- Le **tableau change à chaque manche**.
- **Chaque joueur devient chercheur au moins une fois** (N ≥ nombre de joueurs).
- Le meilleur score cumulé gagne.

### Phases

| Phase      | Durée (défaut) | Description                                                        |
| ---------- | -------------- | ------------------------------------------------------------------ |
| Lobby      | —              | Attente des joueurs, code de salon, choix du mode par l'hôte.      |
| Camouflage | 40 s           | Les cachés placent et peignent leur personnage, puis verrouillent. |
| Recherche  | 90 s           | Le chercheur explore le tableau (zoom/pan) et clique.              |
| Résultats  | 12 s           | Révélation des positions, attribution des points.                  |

Le chercheur **attend dans un lobby** pendant la phase de camouflage (preview du
tableau seul, sans les cachés) et n'arrive sur le tableau qu'à la phase de
recherche.

## 4. Le personnage

- Résolution **fixe `64×64` px** (challenge de camouflage réel).
- **Silhouette non modifiable** (PNG fourni) — seules les couleurs changent.
  L'objectif devient « faire disparaître une forme ».
- **Rotation** par pas de 90° autorisée. Pas de changement de posture (v1).
- Pas de transparence peignable (l'alpha définit la silhouette, pas un outil).

### Outils de camouflage

- **Pinceau** — peinture pixel par pixel, taille réglable.
- **Pot (bucket)** — remplit une zone / partie du corps.
- **Pipette** — prélève une couleur du tableau (illimitée).
- Coups de pinceau **illimités** en mode casual.
- _Mode compétitif (futur)_ : contraintes possibles (taille min. de pinceau,
  budget d'actions) pour équilibrer le haut niveau.

## 5. La recherche

- Le chercheur peut **zoomer** (borné par `maxZoom` du tableau), **se déplacer**,
  **cliquer**.
- Clic sur un caché (dans le rayon de sa hitbox) = trouvaille.
- **Clic raté → cooldown 3 s** (anti-spam).
- Temps limité (90 s par défaut).

## 6. Score de camouflage (mécanique signature)

Au **verrouillage**, le serveur calcule un score `0-100 %` en comparant les
pixels du personnage à la zone du tableau qu'il recouvre. **Multi-critères** :

| Critère      | Idée                                                        |
| ------------ | ----------------------------------------------------------- |
| `colorMatch` | Distance couleur moyenne (idéalement LAB / ΔE).             |
| `edgeMatch`  | Cohérence des contours — le perso ne doit pas « trancher ». |
| `contrast`   | Le perso ne doit pas ressortir en contraste local.          |

```
Couleurs : 98%   Contours : 84%   Contraste : 92%   →   Score : 91%
```

Deux personnages aux mêmes couleurs peuvent obtenir des scores différents. Ce
score autorise un **mode solo/entraînement** (sans chercheur humain).

## 7. Barème de points

| Rôle      | Points                                                         |
| --------- | -------------------------------------------------------------- |
| Chercheur | +100 par joueur trouvé ; +20 s'il trouve tout le monde.        |
| Caché     | +5 / 10 s de survie ; +50 si jamais trouvé ; bonus camouflage. |
| Bonus XP  | Camouflage > 95 % → +40 XP.                                    |

## 8. Modes de jeu

- **Classique** — 1 chercheur, le reste caché.
- **Tout le monde cherche** — chacun cherche les autres ; dernier trouvé gagne.
- **Coop** — 2 chercheurs, plus de cachés.
- **Blitz** — 20 s cachette / 30 s recherche, très nerveux.
- **Ranked** (futur) — ELO, rotation de tableaux, statistiques.
- **Créatif** (futur) — importer son propre tableau, parties privées.

## 9. Tableaux

Chaque œuvre est **préparée** (pas un simple JPG) avec métadonnées :

```
Nom · Auteur · Année · Dimensions · Joueurs max conseillés · Difficulté · Zoom max
```

Difficulté indicative :

| Niveau | Exemples                        |
| ------ | ------------------------------- |
| ★☆☆☆   | Monet, Van Gogh (très texturés) |
| ★★☆☆   | Paysages                        |
| ★★★☆   | Portraits, aplats de couleur    |
| ★★★★   | Mondrian (il faut être parfait) |

Objectif de contenu : **~50 tableaux** au lancement de l'Alpha. Œuvres du domaine
public en priorité.

## 10. Comptes & progression

- Compte simple : pseudo, email, mot de passe, avatar, niveau, XP.
- **Statistiques** de profil (partageables) : parties jouées/gagnées, fois
  chercheur, joueurs trouvés, temps caché, meilleur camouflage, camouflage moyen,
  temps moyen avant d'être trouvé, clics ratés, taux de précision, XP, niveau.
- Progression par niveaux (XP via parties + performances).
- Cosmétiques **uniquement esthétiques** (jamais de pay-to-win) : futurs skins,
  palettes, effets, emotes, animations de victoire.

## 11. Ambiance

- **Visuel** : minimaliste, fond clair, UI propre, le tableau mis en valeur.
- **Son** : pinceau/pipette/pot pendant la cachette ; musique calme en recherche ;
  effet satisfaisant quand un caché est trouvé.
- **Événements de recherche** (futur, pour casser la monotonie) : tremblement,
  changement de luminosité, réduction du zoom max, loupe, indice après 1 min.

## 12. Anti-patterns (à ne PAS faire)

- ❌ Laisser peindre **sur le tableau** (permettrait de cacher ses erreurs / créer
  des pièges / altérer l'œuvre). La peinture est **limitée au personnage**.
- ❌ Faire dépendre la victoire uniquement de la précision artistique.
- ❌ Tout cosmétique influençant le gameplay.
