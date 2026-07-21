# Mimic — Guide de style (design system)

Direction artistique « atelier » : fond clair, typographie nette, un accent indigo,
micro-animations discrètes. Objectif : lisible, calme, met en valeur les œuvres.

## Wordmark

`Mimic` avec pastille caméléon 🦎 (accent). Composant `Wordmark` (`components/ui.tsx`).

## Tokens (Tailwind — `tailwind.config.js`)

| Token     | Valeur    | Usage                                                 |
| --------- | --------- | ----------------------------------------------------- |
| `canvas`  | `#faf9f7` | fond de page                                          |
| `surface` | `#ffffff` | cartes                                                |
| `ink`     | `#1c1917` | texte principal                                       |
| `muted`   | `#78716c` | texte secondaire                                      |
| `line`    | `#e7e5e4` | bordures / séparateurs                                |
| `accent`  | `#6366f1` | actions, focus (`.soft` `#eef2ff`, `.dark` `#4f46e5`) |
| `gold`    | `#eab308` | podium / mise en avant                                |

- **Typo** : Inter (`font-sans`).
- **Rayons** : `rounded-xl` (contrôles), `rounded-xl2` (cartes).
- **Ombres** : `shadow-soft` (cartes), `shadow-pop` (accent, toasts).
- **Animations** : `animate-fade-in`, `animate-slide-up` (entrées d'écran),
  `animate-pop` (toasts, apparitions), transitions de phase.

## Composants réutilisables (`components/ui.tsx`)

- `Wordmark` — logo textuel.
- `Card` — conteneur (surface + bordure + ombre douce).
- `Button` — variantes `primary` / `outline` / `ghost`.
- `XpBar` — barre de progression de niveau.
- `StatTile` — tuile de statistique (valeur + label).

## Iconographie

Émojis cohérents par domaine : outils de peinture (🖌 🪣 💧), rôles (🔍 caché/anneau),
progression (🏆 🥇 🎉). À terme, remplaçables par un set d'icônes SVG.

## Écrans soignés

- Classement final : podium (🥈🥇🥉) + points + mise en avant du vainqueur (#22).
- Résultats de manche : révélation des positions sur l'œuvre (#15).
- Feedback XP : toast `animate-pop` en fin de partie (#20).

## À venir

Direction sonore alignée (#30), set d'icônes SVG, thème sombre optionnel.
