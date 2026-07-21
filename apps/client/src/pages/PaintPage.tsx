import { useEffect } from 'react';
import type { Artwork } from '@mimic/shared';
import { CamouflageBoard } from '../paint/CamouflageBoard.js';
import { loadCharacterBase } from '../paint/character.js';
import { useCharacterStore } from '../store/characterStore.js';

/** Œuvre d'exemple (vraie image #17) pour tester le plateau hors partie. */
const SAMPLE: Artwork = {
  id: 'the-gulf-stream',
  title: 'The Gulf Stream',
  author: 'Winslow Homer',
  year: '1899',
  width: 1280,
  height: 790,
  difficulty: 3,
  recommendedMaxPlayers: 8,
  maxZoom: 8,
  imageUrl: '/artworks/the-gulf-stream.jpg',
};

/** Atelier : plateau unifié placer + peindre sur le tableau (hors partie). */
export function PaintPage(): JSX.Element {
  useEffect(() => {
    const st = useCharacterStore.getState();
    if (st.pixels && st.mask) return;
    let alive = true;
    loadCharacterBase()
      .then(({ mask, pixels }) => {
        if (alive && !useCharacterStore.getState().pixels) {
          useCharacterStore.getState().setBase(mask, pixels);
        }
      })
      .catch((e) => console.error(e));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Atelier</h1>
        <p className="text-sm text-muted">
          Déplace (✋) et peins ton personnage sur le tableau. Pipette 💧 / Espace pour capturer les
          couleurs de l’œuvre.
        </p>
      </div>
      <CamouflageBoard artwork={SAMPLE} />
    </div>
  );
}
