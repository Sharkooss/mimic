import type { ButtonHTMLAttributes, ReactNode } from 'react';

/**
 * Composants UI du design system Mimic (#34) — direction « galerie ».
 * Logo, wordmark, carte, bouton, barre d'XP, tuile de stat, bande d'œuvres.
 */

/** Marque : un personnage caché dans un cadre de tableau. */
export function Logo({ size = 28 }: { size?: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <defs>
        <linearGradient id="mimic-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6a62f0" />
          <stop offset="1" stopColor="#4038c4" />
        </linearGradient>
      </defs>
      <rect x="1.5" y="1.5" width="29" height="29" rx="8.5" fill="url(#mimic-g)" />
      <rect
        x="5.5"
        y="5.5"
        width="21"
        height="21"
        rx="5.5"
        fill="none"
        stroke="#c2982f"
        strokeOpacity="0.55"
      />
      {/* silhouette du personnage */}
      <path
        d="M16 9.2c-2.9 0-5 2.1-5 5v3.4c0 1.7.9 3 2.2 3.7v1.9c0 .5.4.9.9.9s.9-.4.9-.9v-1.4h1.8v1.4c0 .5.4.9.9.9s.9-.4.9-.9v-1.9c1.3-.7 2.2-2 2.2-3.7v-3.4c0-2.9-2.1-5-5-5z"
        fill="#fffdfa"
      />
    </svg>
  );
}

export function Wordmark({ className = '' }: { className?: string }): JSX.Element {
  return (
    <span className={`flex items-center gap-2.5 ${className}`}>
      <span className="shadow-pop rounded-[9px]">
        <Logo />
      </span>
      <span className="font-display text-[22px] font-semibold tracking-tight text-ink">
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

type BtnVariant = 'primary' | 'ghost' | 'outline' | 'gold';

export function Button({
  variant = 'primary',
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant }): JSX.Element {
  const styles: Record<BtnVariant, string> = {
    primary: 'bg-accent text-white hover:bg-accent-dark shadow-soft disabled:opacity-50',
    gold: 'bg-gold text-white hover:brightness-105 shadow-soft disabled:opacity-50',
    ghost: 'text-muted hover:text-ink hover:bg-line/60',
    outline: 'border border-line hover:border-muted/40 text-ink bg-surface',
  };
  return (
    <button
      {...props}
      className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition active:scale-[0.98] ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Badge({
  children,
  tone = 'accent',
}: {
  children: ReactNode;
  tone?: 'accent' | 'gold' | 'muted';
}): JSX.Element {
  const tones = {
    accent: 'bg-accent-soft text-accent',
    gold: 'bg-gold-soft text-gold',
    muted: 'bg-line text-muted',
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

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
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-muted">
        <span className="font-semibold text-accent">Niveau {level}</span>
        <span className="font-mono">
          {inLevel} / {span} XP
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-line">
        <div
          className="h-full rounded-full bg-gradient-to-r from-accent to-accent-dark transition-all duration-700"
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
    <div className="rounded-xl border border-line bg-canvas/60 px-4 py-3">
      <div className="font-display text-2xl font-semibold text-ink">{value}</div>
      <div className="text-xs text-muted">{label}</div>
      {hint && <div className="mt-0.5 text-[11px] text-muted/70">{hint}</div>}
    </div>
  );
}

export interface GalleryItem {
  imageUrl: string;
  title: string;
  author: string;
}

/**
 * Bande d'œuvres encadrées, défilement continu (accroche visuelle du hero).
 * `reverse` inverse le sens, `size` change l'échelle des vignettes, `caption`
 * affiche/masque l'auteur. Réutilisable en plusieurs rangées pour un « mur d'art ».
 */
export function GalleryStrip({
  items,
  reverse = false,
  size = 'sm',
  caption = true,
  durationSec = 40,
}: {
  items: GalleryItem[];
  reverse?: boolean;
  size?: 'sm' | 'lg';
  caption?: boolean;
  durationSec?: number;
}): JSX.Element {
  const loop = items.length ? [...items, ...items] : [];
  const dims =
    size === 'lg'
      ? { fig: 'w-52 sm:w-64', img: 'h-36 sm:h-44' }
      : { fig: 'w-40 sm:w-52', img: 'h-28 sm:h-36' };
  return (
    <div className="relative overflow-hidden">
      <div
        className="flex w-max gap-4 animate-marquee"
        style={{
          animationDuration: `${durationSec}s`,
          animationDirection: reverse ? 'reverse' : 'normal',
        }}
      >
        {loop.map((a, i) => (
          <figure
            key={i}
            className={`group ${dims.fig} shrink-0`}
            title={`${a.title} — ${a.author}`}
          >
            <div className="overflow-hidden rounded-lg bg-night-800 p-1.5 shadow-frame ring-1 ring-white/10 transition duration-500 group-hover:ring-gold/40">
              <img
                src={a.imageUrl}
                alt={a.title}
                loading="lazy"
                className={`${dims.img} w-full rounded object-cover transition duration-500 group-hover:scale-[1.05]`}
              />
            </div>
            {caption && (
              <figcaption className="mt-1.5 truncate px-1 text-[11px] text-white/50">
                {a.author}
              </figcaption>
            )}
          </figure>
        ))}
      </div>
      {/* fondus latéraux */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-night to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-night to-transparent" />
    </div>
  );
}
