import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface CelebrationProps {
  show: boolean;
  onComplete?: () => void;
}

interface DropParticle {
  x: number;
  y: number;
  angle: number;
  speed: number;
  size: number;
  color: string;
  rotation: number;
  rotSpeed: number;
  gravity: number;
}

interface RippleRing {
  radius: number;
  maxRadius: number;
  strokeWidth: number;
  opacity: number;
  delay: number;
  started: boolean;
}

interface Sparkle {
  x: number;
  y: number;
  size: number;
  color: string;
  speedY: number;
  speedX: number;
  flickerPhase: number;
}

const WATER_COLORS = ['#0EA5E9', '#38BDF8', '#7DD3FC', '#0284C7', '#BAE6FD', '#0369A1'];
const SPARKLE_COLORS = ['#FFD700', '#FFA500', '#FFF8DC', '#FFE4B5', '#FFEC8B'];
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)); // ~137.5°

export default function ParticleCelebration({ show, onComplete }: CelebrationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const startRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runningRef = useRef(false);

  useEffect(() => {
    if (!show) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cx = width / 2;
    const cy = height / 2;

    runningRef.current = true;
    startRef.current = performance.now();

    // Init Layer 1: spiral explosion drops (50)
    const drops: DropParticle[] = [];
    for (let i = 0; i < 50; i++) {
      const angle = i * GOLDEN_ANGLE;
      drops.push({
        x: cx,
        y: cy,
        angle,
        speed: 1.2 + Math.random() * 3.5,
        size: 4 + Math.random() * 14,
        color: WATER_COLORS[i % WATER_COLORS.length],
        rotation: Math.random() * 360,
        rotSpeed: (Math.random() - 0.5) * 6,
        gravity: 0.3 + Math.random() * 0.4,
      });
    }

    // Init Layer 2: ripple rings (15)
    const ripples: RippleRing[] = [];
    for (let i = 0; i < 15; i++) {
      ripples.push({
        radius: 0,
        maxRadius: 60 + Math.random() * 100,
        strokeWidth: 3,
        opacity: 0.5,
        delay: 200 + Math.floor(i / 5) * 250 + Math.random() * 150,
        started: false,
      });
    }

    // Init Layer 3: gold sparkles (15)
    const sparkles: Sparkle[] = [];
    for (let i = 0; i < 15; i++) {
      sparkles.push({
        x: cx + (Math.random() - 0.5) * 30,
        y: cy + (Math.random() - 0.5) * 30,
        size: 2 + Math.random() * 4,
        color: SPARKLE_COLORS[i % SPARKLE_COLORS.length],
        speedY: -(0.6 + Math.random() * 1.8),
        speedX: (Math.random() - 0.5) * 1.2,
        flickerPhase: Math.random() * Math.PI * 2,
      });
    }

    timerRef.current = setTimeout(() => {
      runningRef.current = false;
      cancelAnimationFrame(rafRef.current);
      onComplete?.();
    }, 2500);

    const animate = (now: number) => {
      if (!runningRef.current) return;
      const elapsed = now - startRef.current;
      const progress = Math.min(elapsed / 1500, 1);

      ctx.clearRect(0, 0, width, height);

      // Draw ripple rings (Layer 2 - behind drops)
      for (const r of ripples) {
        if (elapsed < r.delay) continue;
        if (!r.started) {
          r.started = true;
          r.radius = 0;
        }
        const ringElapsed = elapsed - r.delay;
        const ringProgress = Math.min(ringElapsed / 1200, 1);
        r.radius = r.maxRadius * ringProgress;
        r.opacity = 0.5 * (1 - ringProgress);
        r.strokeWidth = 3 * (1 - ringProgress) + 0.5;

        ctx.beginPath();
        ctx.arc(cx, cy, r.radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(125,211,252,${r.opacity})`;
        ctx.lineWidth = r.strokeWidth;
        ctx.stroke();
      }

      // Draw spiral explosion drops (Layer 1)
      for (const d of drops) {
        const dist = d.speed * progress * 180;
        const fall = d.gravity * progress * progress * 200;
        d.x = cx + Math.cos(d.angle) * dist;
        d.y = cy + Math.sin(d.angle) * dist + fall;
        d.rotation += d.rotSpeed;

        const dropOpacity = progress < 0.6 ? 1 : 1 - (progress - 0.6) / 0.4;

        ctx.save();
        ctx.translate(d.x, d.y);
        ctx.rotate((d.rotation * Math.PI) / 180);

        // Water drop shape
        const hw = d.size * 0.5;
        const hh = d.size * 0.7;
        ctx.beginPath();
        ctx.ellipse(0, 0, hw, hh, 0, 0, Math.PI * 2);

        const grad = ctx.createRadialGradient(-hw * 0.2, -hh * 0.3, hw * 0.05, 0, 0, hw);
        grad.addColorStop(0, `rgba(255,255,255,${dropOpacity * 0.6})`);
        grad.addColorStop(0.5, d.color.replace('#', '') + `${Math.round(dropOpacity * 255).toString(16).padStart(2, '0')}`.replace(/^.{1}/, (m) => {
          const n = parseInt(m, 16);
          const v = Math.round(dropOpacity * 200);
          return v.toString(16).padStart(2, '0');
        }));
        // Simpler: just use rgba
        ctx.fillStyle = d.color + Math.round(dropOpacity * 200).toString(16).padStart(2, '0');
        ctx.fill();

        // Highlight
        ctx.beginPath();
        ctx.arc(-hw * 0.25, -hh * 0.3, hw * 0.2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${dropOpacity * 0.5})`;
        ctx.fill();

        ctx.restore();
      }

      // Draw gold sparkles (Layer 3)
      for (const s of sparkles) {
        s.y += s.speedY;
        s.x += s.speedX + Math.sin(elapsed * 0.01 + s.flickerPhase) * 0.3;
        s.speedY *= 0.998; // slight deceleration

        const flicker = 0.3 + 0.7 * Math.abs(Math.sin(elapsed * 0.015 + s.flickerPhase));
        const sparkleOpacity = progress < 0.5 ? flicker : flicker * (1 - (progress - 0.5) / 0.5);

        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fillStyle = s.color + Math.round(sparkleOpacity * 255).toString(16).padStart(2, '0');
        ctx.fill();

        // Glow
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size * 2.5, 0, Math.PI * 2);
        const glowGrad = ctx.createRadialGradient(s.x, s.y, s.size * 0.3, s.x, s.y, s.size * 2.5);
        glowGrad.addColorStop(0, `rgba(255,215,0,${sparkleOpacity * 0.5})`);
        glowGrad.addColorStop(1, 'rgba(255,215,0,0)');
        ctx.fillStyle = glowGrad;
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      runningRef.current = false;
      cancelAnimationFrame(rafRef.current);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [show, onComplete]);

  return (
    <AnimatePresence>
      {show && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <canvas
            ref={canvasRef}
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 0,
            }}
          />

          {/* Success checkmark */}
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: [0, 1.2, 1], opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            style={{
              width: 80,
              height: 80,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #0EA5E9, #0369A1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 36,
              color: '#fff',
              boxShadow: '0 8px 40px rgba(14, 165, 233, 0.4)',
              position: 'relative',
              zIndex: 2,
            }}
          >
            ✓
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
