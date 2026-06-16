import { useMotionValue, motion, type Variants, type Transition } from 'framer-motion';
import { useRef, type ReactNode, type CSSProperties } from 'react';

interface TiltCardProps {
  children: ReactNode;
  maxTilt?: number;
  glareColor?: string;
  perspective?: number;
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
  variants?: Variants;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initial?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  animate?: any;
  transition?: Transition;
}

export default function TiltCard({
  children,
  maxTilt = 8,
  glareColor = 'rgba(255,255,255,0.1)',
  perspective = 800,
  className,
  style,
  onClick,
  variants,
  initial,
  animate,
  transition,
}: TiltCardProps) {
  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);
  const glareOpacity = useMotionValue(0);
  const glareX = useMotionValue(50);
  const glareY = useMotionValue(50);
  const ref = useRef<HTMLDivElement>(null);

  // Respect hover capability
  const canHover = typeof window !== 'undefined'
    ? window.matchMedia('(hover: hover)').matches
    : true;

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!canHover) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    rotateX.set((y * 2 - 1) * -maxTilt);
    rotateY.set((x * 2 - 1) * maxTilt);
    glareOpacity.set(1);
    glareX.set(x * 100);
    glareY.set(y * 100);
  };

  const handleMouseLeave = () => {
    rotateX.set(0);
    rotateY.set(0);
    glareOpacity.set(0);
  };

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      variants={variants}
      initial={initial}
      animate={animate}
      transition={
        canHover
          ? undefined
          : { type: 'spring', stiffness: 200, damping: 15 }
      }
      style={{
        perspective,
        transformStyle: 'preserve-3d',
        ...style,
      }}
      className={className}
      onClick={onClick}
    >
      <motion.div
        style={{
          rotateX: canHover ? rotateX : 0,
          rotateY: canHover ? rotateY : 0,
          transformStyle: 'preserve-3d',
          position: 'relative',
          width: '100%',
          height: '100%',
          transition: 'rotateX 0.3s ease, rotateY 0.3s ease',
        }}
      >
        {children}

        {/* Glare overlay */}
        <motion.div
          style={{
            position: 'absolute',
            inset: 0,
            opacity: glareOpacity,
            background: `radial-gradient(circle at ${glareX.get()}% ${glareY.get()}%, ${glareColor} 0%, transparent 60%)`,
            pointerEvents: 'none',
            borderRadius: 'inherit',
            zIndex: 1,
          }}
        />
      </motion.div>
    </motion.div>
  );
}
