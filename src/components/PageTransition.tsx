import { motion } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';

/**
 * 页面转场动画 —— 水滴展开 + 轻微 3D 抬升 + 缩放淡入。
 *
 * 用 clip-path 的圆形由中心扩散来模拟"一滴水在屏幕上摊开"，
 * 配合 rotateX 抬升和 scale 放大，与全站水主题呼应。
 *
 * 只做入场、不做出场。出场需要 AnimatePresence 配合"冻结 Outlet"技巧绕开
 * React Router 的经典陷阱（退场容器里渲染出的是新页面）—— 本项目历史上
 * 被它坑过一次（转场闪两下），故采用零风险的入场方案。
 */

/** 这些路由用轻量转场：用户此刻专注填表，大幅动画反而碍事 */
const LIGHT_ROUTE_PATTERNS = ['/items/add', '/edit'];

/** 借用页 /items/<id>/borrow —— 点卡片进来，用"从中心撑开"的转场，比普通页面更讲究 */
const BORROW_RE = /^\/items\/[^/]+\/borrow$/;

/** 平滑的 ease-out 曲线，比默认的 ease 更有"顺滑落地"的质感 */
const EASE_SMOOTH: [number, number, number, number] = [0.22, 1, 0.36, 1];

/** 主页面转场时长（秒）—— 慢一点才看得出质感 */
const DURATION_MAIN = 0.85;
/** 表单页转场时长 —— 用户专注填表，不该被拖着等 */
const DURATION_LIGHT = 0.5;
/** 撑开式转场时长 —— 像卡片在原地长大，需要足够时间才看得出过程 */
const DURATION_EXPAND = 0.62;

interface PageTransitionProps {
  children: ReactNode;
}

export default function PageTransition({ children }: PageTransitionProps) {
  const location = useLocation();

  // 尊重系统的"减弱动态效果"设置
  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (reducedMotion) return <>{children}</>;

  const isLight = LIGHT_ROUTE_PATTERNS.some((p) => location.pathname.includes(p));
  const isExpand = BORROW_RE.test(location.pathname);

  return (
    <motion.div
      // key 变化触发重新挂载，入场动画才会重播
      key={location.pathname}
      // 只用合成层属性（transform / opacity）——不做 clip-path 之类的重绘型动画，
      // 否则内容区每帧都要重新光栅化，在图表页面上必然掉帧。
      initial={{
        opacity: 0,
        y: isLight ? 10 : isExpand ? 0 : 26,
        scale: isLight ? 0.99 : isExpand ? 0.92 : 0.95,
        rotateX: isLight || isExpand ? 0 : 6,
      }}
      animate={{ opacity: 1, y: 0, scale: 1, rotateX: 0 }}
      transition={{
        duration: isExpand
          ? DURATION_EXPAND
          : isLight ? DURATION_LIGHT : DURATION_MAIN,
        ease: EASE_SMOOTH,
      }}
      style={{
        // 借用页从中心撑开，其余从顶部展开
        transformOrigin: isExpand ? '50% 50%' : '50% 0%',
        transformPerspective: 1400,
        // 刻意不写 will-change：常驻会强制整页内容一直保持独立合成层，
        // 白白占用显存。framer-motion 在动画期间会自动临时提升，够了。
      }}
    >
      {children}
    </motion.div>
  );
}
