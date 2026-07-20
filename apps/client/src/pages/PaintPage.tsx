import { PaintEditor } from '../paint/PaintEditor.js';

/** Page de test isolée de l'éditeur de peinture (hors partie). */
export function PaintPage(): JSX.Element {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Atelier</h1>
        <p className="text-sm text-stone-500">
          Test de l'éditeur de peinture. Peins la silhouette, ajuste le pinceau, annule/rétablis.
        </p>
      </div>
      <PaintEditor />
    </div>
  );
}
