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
const TOOLS: { id: Tool; label: string; icon: string; hint: string }[] = [
  { id: 'brush', label: 'Pinceau', icon: '🖌', hint: 'Peindre la silhouette' },
  { id: 'bucket', label: 'Pot', icon: '🪣', hint: 'Remplir une zone' },
  { id: 'pipette', label: 'Pipette', icon: '💧', hint: 'Capturer une couleur du tableau' },
];

/** Barre d'outils de peinture (design « galerie »), pilotée par useCharacterPainting. */
export function PaintToolbar({
  paint,
  artworkColors = [],
}: {
  paint: CharacterPainting;
  artworkColors?: string[];
}): JSX.Element {
  return (
    <div className="flex-1 space-y-5">
      {/* Outils + couleur active */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-1.5">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              onClick={() => paint.setTool(t.id)}
              title={t.hint}
              className={`flex flex-col items-center gap-0.5 rounded-xl border px-3 py-2 text-xs font-medium transition ${
                paint.tool === t.id
                  ? 'border-accent bg-accent text-white shadow-soft'
                  : 'border-line bg-surface hover:border-muted/40'
              }`}
            >
              <span className="text-base leading-none" aria-hidden>
                {t.icon}
              </span>
              {t.label}
            </button>
          ))}
        </div>
        <label className="flex cursor-pointer flex-col items-center gap-1">
          <span
            className="h-11 w-11 rounded-xl border border-line shadow-soft"
            style={{ background: paint.color }}
          />
          <input
            type="color"
            value={paint.color}
            onChange={(e) => paint.setColor(e.target.value)}
            className="sr-only"
          />
          <span className="text-[10px] text-muted">Couleur</span>
        </label>
      </div>

      {/* Couleurs du tableau (camouflage) */}
      {artworkColors.length > 0 && (
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gold">
            🎨 Couleurs du tableau
          </div>
          <div className="flex flex-wrap gap-1.5">
            {artworkColors.map((c, i) => (
              <button
                key={i}
                onClick={() => paint.setColor(c)}
                aria-label={c}
                className={`h-7 w-7 rounded-md border transition hover:scale-110 ${
                  paint.color.toLowerCase() === c.toLowerCase()
                    ? 'ring-2 ring-gold ring-offset-1'
                    : 'border-line'
                }`}
                style={{ background: c }}
              />
            ))}
          </div>
          <p className="mt-1 text-[11px] text-muted">
            Capturées de l’œuvre — idéales pour te fondre dedans.
          </p>
        </div>
      )}

      {/* Palette de base */}
      <div>
        <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
          Palette
        </div>
        <div className="grid grid-cols-8 gap-1.5">
          {PALETTE.map((c) => (
            <button
              key={c}
              onClick={() => paint.setColor(c)}
              aria-label={c}
              className={`h-7 w-7 rounded-md border transition hover:scale-110 ${
                paint.color.toLowerCase() === c.toLowerCase()
                  ? 'ring-2 ring-accent ring-offset-1'
                  : 'border-line'
              }`}
              style={{ background: c }}
            />
          ))}
        </div>
      </div>

      {/* Taille du pinceau (points proportionnels) */}
      <div>
        <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
          Taille du pinceau
        </div>
        <div className="flex items-center gap-1.5">
          {BRUSH_SIZES.map((b) => (
            <button
              key={b}
              onClick={() => paint.setBrush(b)}
              title={`${b} px`}
              className={`grid h-9 w-9 place-items-center rounded-xl border transition ${
                paint.brush === b
                  ? 'border-accent bg-accent-soft'
                  : 'border-line hover:border-muted/40'
              }`}
            >
              <span
                className="rounded-full bg-ink"
                style={{ width: `${4 + b * 2}px`, height: `${4 + b * 2}px` }}
              />
            </button>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2 border-t border-line pt-3">
        <button
          onClick={paint.undo}
          disabled={!paint.canUndo}
          className="rounded-lg border border-line px-3 py-1.5 text-sm transition hover:border-muted/40 disabled:opacity-40"
        >
          ↩ Annuler
        </button>
        <button
          onClick={paint.redo}
          disabled={!paint.canRedo}
          className="rounded-lg border border-line px-3 py-1.5 text-sm transition hover:border-muted/40 disabled:opacity-40"
        >
          ↪ Rétablir
        </button>
        <button
          onClick={paint.clear}
          className="rounded-lg border border-line px-3 py-1.5 text-sm text-red-600 transition hover:bg-red-50"
        >
          Réinitialiser
        </button>
      </div>
    </div>
  );
}
