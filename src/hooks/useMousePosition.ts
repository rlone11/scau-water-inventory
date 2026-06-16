import { useEffect, useRef, useState } from 'react';

export interface MousePosition {
  x: number;
  y: number;
  normalizedX: number;
  normalizedY: number;
  isActive: boolean;
}

const INACTIVITY_TIMEOUT = 2000;
const THROTTLE_MS = 16; // ~60fps max

export function useMousePosition(): MousePosition {
  const [pos, setPos] = useState<MousePosition>({
    x: 0, y: 0, normalizedX: 0, normalizedY: 0, isActive: false,
  });

  const rafRef = useRef<number>(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rawRef = useRef({ x: 0, y: 0, active: false });
  // Track last emitted values to skip no-change updates
  const lastEmittedRef = useRef({ x: 0, y: 0, nX: 0, nY: 0, active: false });
  const lastEventTimeRef = useRef(0);

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reducedMotion.matches) return;

    const resetTimer = () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      rawRef.current.active = true;
      timeoutRef.current = setTimeout(() => {
        rawRef.current.active = false;
      }, INACTIVITY_TIMEOUT);
    };

    const handleMove = (clientX: number, clientY: number) => {
      const now = performance.now();
      if (now - lastEventTimeRef.current < THROTTLE_MS) return;
      lastEventTimeRef.current = now;
      rawRef.current.x = clientX;
      rawRef.current.y = clientY;
      resetTimer();
    };

    const onMouseMove = (e: MouseEvent) => handleMove(e.clientX, e.clientY);
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) handleMove(e.touches[0].clientX, e.touches[0].clientY);
    };
    const onTouchEnd = () => {
      rawRef.current.active = false;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };

    const loop = () => {
      const { x, y, active } = rawRef.current;
      const nX = Math.round(((x / window.innerWidth) * 2 - 1) * 100) / 100;
      const nY = Math.round(((y / window.innerHeight) * 2 - 1) * 100) / 100;
      const prev = lastEmittedRef.current;

      // Skip setState if nothing changed (saves React renders!)
      if (prev.x !== x || prev.y !== y || prev.active !== active) {
        lastEmittedRef.current = { x, y, nX, nY, active };
        setPos({ x, y, normalizedX: nX, normalizedY: nY, isActive: active });
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    window.addEventListener('mousemove', onMouseMove, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', onTouchEnd, { passive: true });

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
      cancelAnimationFrame(rafRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return pos;
}
