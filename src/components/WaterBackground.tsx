import { useEffect, useRef } from 'react';
import { useMousePosition } from '../hooks/useMousePosition';

type Density = 'off' | 'min' | 'medium' | 'max';

interface Particle {
  x: number;
  y: number;
  vy: number;
  radius: number;
  colorR: number;
  colorG: number;
  colorB: number;
  opacity: number;
  wanderAngle: number;
}

const COLORS_RGB: [number, number, number][] = [
  [14, 165, 233],
  [56, 189, 248],
  [125, 211, 252],
  [2, 132, 199],
  [186, 230, 253],
  [3, 105, 161],
];

const DENSITY_MAP: Record<Density, number> = { off: 0, min: 25, medium: 55, max: 80 };

function getDensity(raw: Density, isMobile: boolean): number {
  if (raw === 'off') return 0;
  const levels: Density[] = ['min', 'medium', 'max'];
  const idx = levels.indexOf(raw);
  const mobileIdx = isMobile ? Math.max(0, idx - 1) : idx;
  return DENSITY_MAP[levels[mobileIdx]];
}

export default function WaterBackground({
  density = 'medium',
  baseOpacity = 0.07,
}: {
  density?: Density;
  baseOpacity?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouse = useMousePosition();
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef<number>(0);
  const mouseRef = useRef(mouse);
  const lastFrameRef = useRef(0);
  // Mutable per-frame counters (no React state in loop)
  const timeRef = useRef(0);
  mouseRef.current = mouse;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    const count = getDensity(density, isMobile);

    if (count === 0 || reducedMotion.matches) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = window.innerWidth;
    let height = window.innerHeight;
    let running = true;
    // Mobile: target 30fps; desktop: 60fps
    const FRAME_INTERVAL = isMobile ? 33 : 16;

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
    let resizeTimeout: ReturnType<typeof setTimeout>;
    const debouncedResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(resize, 150);
    };
    window.addEventListener('resize', debouncedResize);

    // Init particles
    const particles: Particle[] = [];
    for (let i = 0; i < count; i++) {
      const [r, g, b] = COLORS_RGB[i % COLORS_RGB.length];
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vy: -(0.3 + Math.random() * 0.5),
        radius: 3 + Math.random() * 9,
        colorR: r,
        colorG: g,
        colorB: b,
        opacity: baseOpacity * (0.7 + Math.random() * 0.6),
        wanderAngle: Math.random() * Math.PI * 2,
      });
    }
    particlesRef.current = particles;

    const animate = (now: number) => {
      if (!running) return;

      // Frame throttle
      const elapsed = now - lastFrameRef.current;
      if (elapsed < FRAME_INTERVAL) {
        rafRef.current = requestAnimationFrame(animate);
        return;
      }
      lastFrameRef.current = now - (elapsed % FRAME_INTERVAL);
      timeRef.current += 0.016;

      // Fade-trail clear (cheaper + prettier than clearRect)
      ctx.fillStyle = 'rgba(240,247,251,0.15)';
      ctx.fillRect(0, 0, width, height);

      const { x: mx, y: my, isActive } = mouseRef.current;
      const REPEL_RADIUS = 150;

      for (const p of particles) {
        // Mouse repulsion
        if (isActive) {
          const dx = p.x - mx;
          const dy = p.y - my;
          const dist = Math.hypot(dx, dy);
          if (dist < REPEL_RADIUS && dist > 0.5) {
            const force = ((REPEL_RADIUS - dist) / REPEL_RADIUS) * 2;
            p.x += (dx / dist) * force;
            p.y += (dy / dist) * force;
          }
        }

        // Float upward
        p.y += p.vy;
        p.wanderAngle += 0.015;
        p.x += Math.sin(p.wanderAngle + timeRef.current * 0.5) * 0.4;

        // Wrap
        if (p.y < -p.radius * 2) { p.y = height + p.radius; p.x = Math.random() * width; }
        if (p.y > height + p.radius * 2) { p.y = -p.radius; p.x = Math.random() * width; }
        if (p.x < -p.radius * 2) p.x = width + p.radius;
        if (p.x > width + p.radius * 2) p.x = -p.radius;

        // Skip off-screen
        if (p.x < -20 || p.x > width + 20 || p.y < -20 || p.y > height + 20) continue;

        // Fast fill: solid color + alpha (no radial gradient per particle!)
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.colorR},${p.colorG},${p.colorB},${p.opacity})`;
        ctx.fill();

        // Tiny highlight dot
        ctx.beginPath();
        ctx.arc(p.x - p.radius * 0.25, p.y - p.radius * 0.25, p.radius * 0.2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${p.opacity * 2.5})`;
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    lastFrameRef.current = performance.now();
    rafRef.current = requestAnimationFrame(animate);

    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', debouncedResize);
      clearTimeout(resizeTimeout);
    };
  }, [density, baseOpacity]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
      }}
    />
  );
}
