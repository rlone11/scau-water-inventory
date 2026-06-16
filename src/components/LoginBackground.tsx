import { useEffect, useRef } from 'react';

interface Bubble {
  x: number;
  y: number;
  radius: number;
  speed: number;
  opacity: number;
  wanderAngle: number;
  wanderSpeed: number;
}

interface LoginBackgroundProps {
  inputFocused?: boolean;
  inputCenterX?: number | null;
  inputCenterY?: number | null;
}

export default function LoginBackground({
  inputFocused = false,
  inputCenterX = null,
  inputCenterY = null,
}: LoginBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bubblesRef = useRef<Bubble[]>([]);
  const rafRef = useRef<number>(0);
  const focusedRef = useRef(inputFocused);
  const targetRef = useRef({ x: 0, y: 0 });
  const lastFrameRef = useRef(0);
  const timeRef = useRef(0);
  focusedRef.current = inputFocused;

  useEffect(() => {
    if (inputCenterX != null && inputCenterY != null) {
      targetRef.current = { x: inputCenterX, y: inputCenterY };
    }
  }, [inputCenterX, inputCenterY]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const isMobile = window.matchMedia('(max-width: 768px)').matches;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = window.innerWidth;
    let height = window.innerHeight;
    let running = true;
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

    const bubbleCount = isMobile ? 8 : 18;
    const bubbles: Bubble[] = [];
    for (let i = 0; i < bubbleCount; i++) {
      bubbles.push({
        x: Math.random() * width,
        y: height + Math.random() * 60,
        radius: 4 + Math.random() * 14,
        speed: 0.4 + Math.random() * 1.1,
        opacity: 0.06 + Math.random() * 0.12,
        wanderAngle: Math.random() * Math.PI * 2,
        wanderSpeed: 0.008 + Math.random() * 0.015,
      });
    }
    bubblesRef.current = bubbles;

    const animate = (now: number) => {
      if (!running) return;
      const elapsed = now - lastFrameRef.current;
      if (elapsed < FRAME_INTERVAL) {
        rafRef.current = requestAnimationFrame(animate);
        return;
      }
      lastFrameRef.current = now - (elapsed % FRAME_INTERVAL);
      timeRef.current += 0.016;

      // Fade-trail clear
      ctx.fillStyle = 'rgba(3,105,161,0.12)';
      ctx.fillRect(0, 0, width, height);

      // Light beam (draw once per frame, cheap)
      if (!isMobile) {
        const beamOpacity = 0.03 + 0.02 * Math.sin(timeRef.current * 0.3);
        ctx.beginPath();
        ctx.moveTo(width, 0);
        ctx.lineTo(width * 0.4, 0);
        ctx.lineTo(0, height * 0.6);
        ctx.lineTo(width, height * 0.9);
        ctx.closePath();
        const beamGrad = ctx.createLinearGradient(width, 0, width * 0.2, height);
        beamGrad.addColorStop(0, `rgba(255,255,255,${beamOpacity * 2})`);
        beamGrad.addColorStop(0.5, `rgba(255,255,255,${beamOpacity})`);
        beamGrad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = beamGrad;
        ctx.fill();
      }

      for (const b of bubbles) {
        b.y -= b.speed;
        b.wanderAngle += b.wanderSpeed;
        b.x += Math.sin(b.wanderAngle + timeRef.current * 0.3) * 0.5;

        if (focusedRef.current) {
          const tx = targetRef.current.x;
          const ty = targetRef.current.y;
          const dx = tx - b.x;
          const dy = ty - b.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 300 && dist > 0.5) {
            const force = ((300 - dist) / 300) * 0.3;
            b.x += (dx / dist) * force;
            b.y += (dy / dist) * force;
          }
        }

        if (b.y < -b.radius * 3) { b.y = height + b.radius; b.x = Math.random() * width; }
        if (b.x < -b.radius * 2) b.x = width + b.radius;
        if (b.x > width + b.radius * 2) b.x = -b.radius;

        // Fast solid fill (no per-bubble gradient)
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${b.opacity})`;
        ctx.fill();

        // Stroke
        ctx.strokeStyle = `rgba(255,255,255,${b.opacity * 1.2})`;
        ctx.lineWidth = 0.5;
        ctx.stroke();

        // Highlight dot
        ctx.beginPath();
        ctx.arc(b.x - b.radius * 0.25, b.y - b.radius * 0.25, b.radius * 0.2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${b.opacity * 4})`;
        ctx.fill();
      }

      if (reducedMotion.matches) return;
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
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 1,
        pointerEvents: 'none',
      }}
    />
  );
}
