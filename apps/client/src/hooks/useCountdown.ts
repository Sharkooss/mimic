import { useEffect, useState } from 'react';

/** Secondes restantes jusqu'à `endsAt` (ms epoch), ou null si non minuté. */
export function useCountdown(endsAt: number | null): number | null {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (endsAt == null) {
      setRemaining(null);
      return;
    }
    const tick = () => setRemaining(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [endsAt]);

  return remaining;
}
