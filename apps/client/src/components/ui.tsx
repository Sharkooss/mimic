import type { ButtonHTMLAttributes, ReactNode } from 'react';

/**
 * Composants UI réutilisables du design system Mimic (#34).
 * Wordmark, carte, bouton (variantes), barre d'XP, tuile de stat.
 */

/** Wordmark : logo textuel « Mimic » avec pastille caméléon. */
export function Wordmark({ className = '' }: { className?: string }): JSX.Element {
  return (
    <span className={`flex items-center gap-2 font-semibold tracking-tight ${className}`}>
      <span className="grid h-6 w-6 place-items-center rounded-lg bg-accent text-[13px] text-white shadow-pop">
        🦎
      </span>
      <span className="text-lg">
        Mi<span className="text-accent">mic</span>
      </span>
    </span>
  );
}

export function Card({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <div className={`rounded-xl2 border border-line bg-surface shadow-soft ${className}`}>
      {children}
    </div>
  );
}

type BtnVariant = 'primary' | 'ghost' | 'outline';

export function Button({
  variant = 'primary',
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant }): JSX.Element {
  const styles: Record<BtnVariant, string> = {
    primary: 'bg-accent text-white hover:bg-accent-dark shadow-soft disabled:opacity-50',
    ghost: 'text-muted hover:text-ink hover:bg-line/60',
    outline: 'border border-line hover:border-muted/40 text-ink',
  };
  return (
    <button
      {...props}
      className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

/** Barre d'XP avec niveau. */
export function XpBar({
  level,
  inLevel,
  span,
}: {
  level: number;
  inLevel: number;
  span: number;
}): JSX.Element {
  const pct = span > 0 ? Math.min(100, Math.round((inLevel / span) * 100)) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-muted">
        <span className="font-semibold text-accent">Niveau {level}</span>
        <span>
          {inLevel} / {span} XP
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-line">
        <div
          className="h-full rounded-full bg-accent transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}): JSX.Element {
  return (
    <div className="rounded-xl border border-line bg-canvas px-4 py-3">
      <div className="font-mono text-xl font-semibold">{value}</div>
      <div className="text-xs text-muted">{label}</div>
      {hint && <div className="mt-0.5 text-[11px] text-muted/70">{hint}</div>}
    </div>
  );
}
