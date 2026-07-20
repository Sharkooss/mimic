import { useState } from 'react';
import type { Artwork } from '@mimic/shared';
import { PaintEditor } from '../paint/PaintEditor.js';
import { CamouflageStage } from '../paint/CamouflageStage.js';

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

/** Page de test isolée : éditeur de peinture + plateau de placement (hors partie). */
export function PaintPage(): JSX.Element {
  const [tab, setTab] = useState<'paint' | 'place'>('paint');
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Atelier</h1>
        <p className="text-sm text-stone-500">
          Test des outils : peins ton personnage, puis place-le sur le tableau (zoom, pan,
          rotation).
        </p>
      </div>
      <div className="flex w-64 gap-1 rounded-lg bg-stone-100 p-1 text-sm font-medium">
        <button
          onClick={() => setTab('paint')}
          className={`flex-1 rounded-md px-3 py-1.5 ${tab === 'paint' ? 'bg-white shadow-sm' : 'text-stone-500'}`}
        >
          🖌 Peindre
        </button>
        <button
          onClick={() => setTab('place')}
          className={`flex-1 rounded-md px-3 py-1.5 ${tab === 'place' ? 'bg-white shadow-sm' : 'text-stone-500'}`}
        >
          🎯 Placer
        </button>
      </div>
      {tab === 'paint' ? <PaintEditor /> : <CamouflageStage artwork={SAMPLE} />}
    </div>
  );
}
