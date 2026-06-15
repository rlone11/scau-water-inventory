import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  rotation: number;
}

interface CelebrationProps {
  show: boolean;
  onComplete?: () => void;
}

export default function Celebration({ show, onComplete }: CelebrationProps) {
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    if (show) {
      const items: Particle[] = Array.from({ length: 24 }, (_, i) => ({
        id: i,
        x: (Math.random() - 0.5) * 360,
        y: (Math.random() - 0.5) * 400 - 120,
        size: 8 + Math.random() * 18,
        rotation: Math.random() * 360,
      }));
      setParticles(items);

      const timer = setTimeout(() => {
        setParticles([]);
        onComplete?.();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [show, onComplete]);

  return (
    <AnimatePresence>
      {show && particles.length > 0 && (
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

          {/* Water drop particles */}
          {particles.map((p) => (
            <motion.div
              key={p.id}
              initial={{
                x: 0,
                y: 0,
                scale: 0,
                opacity: 1,
                rotate: 0,
              }}
              animate={{
                x: p.x,
                y: p.y,
                scale: [0, 1, 0],
                opacity: [0, 0.8, 0],
                rotate: p.rotation,
              }}
              transition={{
                duration: 1.5 + Math.random() * 0.8,
                ease: 'easeOut',
                delay: 0.2 + Math.random() * 0.3,
              }}
              style={{
                position: 'absolute',
                width: p.size,
                height: p.size * 1.3,
                borderRadius: '50% 50% 50% 50% / 60% 60% 40% 40%',
                background: [
                  '#0EA5E9',
                  '#38BDF8',
                  '#7DD3FC',
                  '#0284C7',
                  '#BAE6FD',
                ][p.id % 5],
                zIndex: 1,
              }}
            />
          ))}
        </div>
      )}
    </AnimatePresence>
  );
}
