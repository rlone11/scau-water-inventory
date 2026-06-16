import { motion, useMotionValue } from 'framer-motion';
import { type ReactNode, type CSSProperties } from 'react';

interface MagneticButtonProps {
  children: ReactNode;
  strength?: number;
  className?: string;
  style?: CSSProperties;
}

export default function MagneticButton({
  children,
  strength = 3,
  className,
  style,
}: MagneticButtonProps) {
  const translateX = useMotionValue(0);
  const translateY = useMotionValue(0);

  const canHover =
    typeof window !== 'undefined'
      ? window.matchMedia('(hover: hover)').matches
      : true;

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!canHover) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = (e.clientX - cx) / (rect.width / 2);
    const dy = (e.clientY - cy) / (rect.height / 2);
    translateX.set(dx * strength);
    translateY.set(dy * strength);
  };

  const handleMouseLeave = () => {
    translateX.set(0);
    translateY.set(0);
  };

  return (
    <motion.div
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        x: canHover ? translateX : 0,
        y: canHover ? translateY : 0,
        display: 'inline-block',
        ...style,
      }}
      transition={{ type: 'spring', stiffness: 300, damping: 15 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
