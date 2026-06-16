import { useEffect, useRef } from 'react';

interface Ripple {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  opacity: number;
  id: number;
}

const RIPPLE_MAX_RADIUS = 120;

export default function CursorEffects() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ripplesRef = useRef<Ripple[]>([]);
  const rafRef = useRef<number>(0);
  const rippleIdRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reducedMotion.matches) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = window.innerWidth;
    let height = window.innerHeight;
    let running = true;

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const onClick = (e: MouseEvent) => {
      ripplesRef.current.push({
        x: e.clientX,
        y: e.clientY,
        radius: 4,
        maxRadius: RIPPLE_MAX_RADIUS,
        opacity: 0.5,
        id: rippleIdRef.current++,
      });
      if (ripplesRef.current.length > 6) {
        ripplesRef.current.shift();
      }
    };
    window.addEventListener('click', onClick);

    const animate = () => {
      if (!running) return;
      ctx.clearRect(0, 0, width, height);

      for (let i = ripplesRef.current.length - 1; i >= 0; i--) {
        const r = ripplesRef.current[i];
        const progress = r.radius / r.maxRadius;
        r.radius += 3.5;
        r.opacity = 0.5 * (1 - progress);

        if (r.radius >= r.maxRadius) {
          ripplesRef.current.splice(i, 1);
          continue;
        }

        // Outer ring
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(125,211,252,${r.opacity})`;
        ctx.lineWidth = 3 * (1 - progress);
        ctx.stroke();

        // Inner faint ring
        const behindRadius = r.radius * 0.7;
        if (behindRadius > 4) {
          ctx.beginPath();
          ctx.arc(r.x, r.y, behindRadius, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(14,165,233,${r.opacity * 0.4})`;
          ctx.lineWidth = 1.5 * (1 - progress);
          ctx.stroke();
        }
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
      window.removeEventListener('click', onClick);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10,
        pointerEvents: 'none',
      }}
    />
  );
}
