import type { CharacterPainting, Tool } from './useCharacterPainting.js';

const PALETTE = [
  '#1c1917',
  '#78716c',
  '#ffffff',
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#3b82f6',
  '#6366f1',
  '#a855f7',
  '#ec4899',
  '#7c2d12',
  '#166534',
  '#1e3a8a',
  '#fde68a',
];
const BRUSH_SIZES = [1, 2, 3, 5, 8] as const;
const TOOLS: { id: Tool; label: string; icon: string }[] = [
  { id: 'brush', label: 'Pinceau', icon: '🖌' },
  { id: 'bucket', label: 'Pot', icon: '🪣' },
  { id: 'pipette', label: 'Pipette', icon: '💧' },
];

/** Barre d'outils de peinture, pilotée par le hook useCharacterPainting. */
export function PaintToolbar({ paint }: { paint: CharacterPainting }): JSX.Element {
  return (
    <div className="flex-1 space-y-4">
      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
          Outil
        </div>
        <div className="flex gap-1.5">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              onClick={() => paint.setTool(t.id)}
              className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition ${
                paint.tool === t.id
                  ? 'border-accent bg-accent text-white'
                  : 'border-stone-200 hover:border-stone-300'
              }`}
            >
              <span aria-hidden>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
          Couleur
        </div>
        <div className="grid grid-cols-8 gap-1.5">
          {PALETTE.map((c) => (
            <button
              key={c}
              onClick={() => paint.setColor(c)}
              aria-label={c}
              className={`h-7 w-7 rounded-md border transition ${
                paint.color.toLowerCase() === c.toLowerCase()
                  ? 'ring-2 ring-accent ring-offset-1'
                  : 'border-stone-200'
              }`}
              style={{ background: c }}
            />
          ))}
        </div>
        <label className="mt-2 flex items-center gap-2 text-sm text-stone-600">
          <input
            type="color"
            value={paint.color}
            onChange={(e) => paint.setColor(e.target.value)}
            className="h-7 w-9 cursor-pointer rounded border border-stone-200 bg-transparent"
          />
          Personnalisée
        </label>
      </div>

      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
          Taille du pinceau
        </div>
        <div className="flex gap-1.5">
          {BRUSH_SIZES.map((b) => (
            <button
              key={b}
              onClick={() => paint.setBrush(b)}
              className={`h-9 w-9 rounded-md border text-sm font-medium transition ${
                paint.brush === b
                  ? 'border-accent bg-accent text-white'
                  : 'border-stone-200 hover:border-stone-300'
              }`}
            >
              {b}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <button
          onClick={paint.undo}
          disabled={!paint.canUndo}
          className="rounded-lg border border-stone-200 px-3 py-1.5 text-sm disabled:opacity-40"
        >
          ↩ Annuler
        </button>
        <button
          onClick={paint.redo}
          disabled={!paint.canRedo}
          className="rounded-lg border border-stone-200 px-3 py-1.5 text-sm disabled:opacity-40"
        >
          ↪ Rétablir
        </button>
        <button
          onClick={paint.clear}
          className="rounded-lg border border-stone-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
        >
          Réinitialiser
        </button>
      </div>
    </div>
  );
}
