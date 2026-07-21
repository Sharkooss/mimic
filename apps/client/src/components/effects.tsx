import { useEffect, useRef, useState, type CSSProperties } from 'react';

/**
 * Effets visuels réutilisables (juice #34). Purement décoratifs : `pointer-events`
 * neutralisés, montés au-dessus du contenu, auto-nettoyés.
 */

/** Compte animé de `from` à `value` (ex. score de camouflage qui grimpe). */
export function CountUp({
  value,
  from = 0,
  duration = 900,
  suffix = '',
  className,
}: {
  value: number;
  from?: number;
  duration?: number;
  suffix?: string;
  className?: string;
}): JSX.Element {
  const [n, setN] = useState(from);
  const raf = useRef<number>();

  useEffect(() => {
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // easeOutCubic pour finir en douceur.
      const eased = 1 - Math.pow(1 - t, 3);
      setN(Math.round(from + (value - from) * eased));
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [value, from, duration]);

  return (
    <span className={className}>
      {n}
      {suffix}
    </span>
  );
}

/** Éclat de particules à un point (impact d'un clic réussi). Se supprime seul. */
export function Burst({
  x,
  y,
  color = '#22c55e',
  count = 12,
}: {
  x: number;
  y: number;
  color?: string;
  count?: number;
}): JSX.Element {
  const parts = useRef(
    Array.from({ length: count }, (_, i) => {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const d = 26 + Math.random() * 26;
      return { dx: Math.cos(a) * d, dy: Math.sin(a) * d, s: 3 + Math.random() * 3 };
    }),
  ).current;

  return (
    <div className="pointer-events-none absolute z-30" style={{ left: x, top: y }}>
      {parts.map((p, i) => (
        <span
          key={i}
          className="absolute block rounded-full"
          style={
            {
              width: p.s,
              height: p.s,
              background: color,
              '--dx': `${p.dx}px`,
              '--dy': `${p.dy}px`,
              animation: 'burst 0.6s cubic-bezier(0.22,1,0.36,1) forwards',
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

/** Onde circulaire à un point (feedback de clic). */
export function Ripple({
  x,
  y,
  color = 'rgba(34,197,94,0.7)',
  size = 90,
}: {
  x: number;
  y: number;
  color?: string;
  size?: number;
}): JSX.Element {
  return (
    <span
      className="animate-ripple pointer-events-none absolute z-20 rounded-full"
      style={{
        left: x,
        top: y,
        width: size,
        height: size,
        border: `3px solid ${color}`,
      }}
    />
  );
}

/** Pluie de confettis plein écran (victoire). Se dissipe après ~2,5 s. */
export function Confetti({ pieces = 90 }: { pieces?: number }): JSX.Element | null {
  const [on, setOn] = useState(true);
  const bits = useRef(
    Array.from({ length: pieces }, () => ({
      left: Math.random() * 100,
      delay: Math.random() * 0.8,
      dur: 1.8 + Math.random() * 1.2,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)]!,
      w: 6 + Math.random() * 6,
      h: 9 + Math.random() * 8,
    })),
  ).current;

  useEffect(() => {
    const t = setTimeout(() => setOn(false), 2800);
    return () => clearTimeout(t);
  }, []);
  if (!on) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {bits.map((b, i) => (
        <span
          key={i}
          className="animate-confetti absolute top-0 block rounded-[2px]"
          style={{
            left: `${b.left}%`,
            width: b.w,
            height: b.h,
            background: b.color,
            animationDelay: `${b.delay}s`,
            animationDuration: `${b.dur}s`,
          }}
        />
      ))}
    </div>
  );
}

const CONFETTI_COLORS = [
  '#5b53e0',
  '#c2982f',
  '#22c55e',
  '#ef4444',
  '#f97316',
  '#ec4899',
  '#3b82f6',
];
