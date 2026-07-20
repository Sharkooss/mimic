import { useEffect, useState } from 'react';
import type { Artwork } from '@mimic/shared';
import { CamouflageStage } from '../paint/CamouflageStage.js';
import { BoardPaintStage } from '../paint/BoardPaintStage.js';
import { loadCharacterBase } from '../paint/character.js';
import { useCharacterStore } from '../store/characterStore.js';

/** Œuvre d'exemple pour tester le plateau hors partie. */
const SAMPLE: Artwork = {
  id: 'atelier-sample',
  title: 'Œuvre de test',
  author: 'Atelier',
  year: null,
  width: 1600,
  height: 1000,
  difficulty: 2,
  recommendedMaxPlayers: 8,
  maxZoom: 8,
  imageUrl: '',
};

/** Page de test isolée : flux placer → peindre sur le tableau (hors partie). */
export function PaintPage(): JSX.Element {
  const [tab, setTab] = useState<'place' | 'paint'>('place');

  // Charge la silhouette pour pouvoir la placer/peindre dès l'ouverture.
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
        <p className="text-sm text-stone-500">
          Test du flux : place ton personnage sur le tableau, puis peins-le en contexte pour le
          fondre dans l’œuvre.
        </p>
      </div>
      <div className="flex w-72 gap-1 rounded-lg bg-stone-100 p-1 text-sm font-medium">
        <button
          onClick={() => setTab('place')}
          className={`flex-1 rounded-md px-3 py-1.5 ${tab === 'place' ? 'bg-white shadow-sm' : 'text-stone-500'}`}
        >
          🎯 Placer
        </button>
        <button
          onClick={() => setTab('paint')}
          className={`flex-1 rounded-md px-3 py-1.5 ${tab === 'paint' ? 'bg-white shadow-sm' : 'text-stone-500'}`}
        >
          🖌 Peindre
        </button>
      </div>
      {tab === 'place' ? (
        <CamouflageStage artwork={SAMPLE} />
      ) : (
        <BoardPaintStage artwork={SAMPLE} />
      )}
    </div>
  );
}
