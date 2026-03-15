import { useState, useEffect, useRef } from 'react';

interface AnimatedNumberProps {
  value: number;
  duration?: number;
}

export function AnimatedNumber({ value, duration = 300 }: AnimatedNumberProps) {
  const [display, setDisplay] = useState(value);
  const prev = useRef(value);
  const raf = useRef<number>(0);

  useEffect(() => {
    const from = prev.current;
    const to = value;
    prev.current = value;

    if (from === to) return;

    const start = performance.now();
    const delta = to - from;

    const tick = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(elapsed / duration, 1);
      // easeOut cubic
      const ease = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + delta * ease));
      if (t < 1) {
        raf.current = requestAnimationFrame(tick);
      }
    };

    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value, duration]);

  return <>{display}</>;
}
