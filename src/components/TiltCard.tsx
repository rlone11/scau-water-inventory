import { useMotionValue, useSpring, motion, type Variants, type Transition } from 'framer-motion';
import { useRef, type ReactNode, type CSSProperties } from 'react';

/** 眩光光斑的直径（px）—— 固定尺寸，靠 transform 移动 */
const GLARE_SIZE = 360;

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
  maxTilt = 13,
  glareColor = 'rgba(14,165,233,0.25)',
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
  /** 眩光光斑中心的位移（px）—— 用 transform 移动，避免每帧重算渐变字符串 */
  const glareX = useMotionValue(0);
  const glareY = useMotionValue(0);

  // 弹簧跟随：保留跟手的手感，避免生硬跳变。之前用 CSS transition 做阻尼会吃掉幅度感
  const springRotateX = useSpring(rotateX, { stiffness: 400, damping: 30 });
  const springRotateY = useSpring(rotateY, { stiffness: 400, damping: 30 });
  const springGlare = useSpring(glareOpacity, { stiffness: 160, damping: 22 });

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
    // 直接记相对卡片的像素位移 —— 光斑靠 transform 移动，不重算渐变
    glareX.set(e.clientX - rect.left);
    glareY.set(e.clientY - rect.top);
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
          rotateX: canHover ? springRotateX : 0,
          rotateY: canHover ? springRotateY : 0,
          transformStyle: 'preserve-3d',
          position: 'relative',
          width: '100%',
          height: '100%',
        }}
      >
        {children}

        {/* 眩光：一个固定大小的光斑，靠 transform 跟随鼠标。
            比每帧重算 radial-gradient 字符串便宜得多 —— 后者是重绘型属性，
            每帧都要重新光栅化整块渐变。 */}
        <motion.div
          style={{
            position: 'absolute',
            inset: 0,
            opacity: springGlare,
            pointerEvents: 'none',
            borderRadius: 'inherit',
            overflow: 'hidden',
            zIndex: 1,
          }}
        >
          <motion.div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: GLARE_SIZE,
              height: GLARE_SIZE,
              marginLeft: -GLARE_SIZE / 2,
              marginTop: -GLARE_SIZE / 2,
              borderRadius: '50%',
              background: `radial-gradient(circle, ${glareColor} 0%, transparent 70%)`,
              x: glareX,
              y: glareY,
            }}
          />
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
