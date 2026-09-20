import { useEffect, useRef } from 'react';

/** 指针推开气泡的作用半径（像素） */
const REPEL_RADIUS = 170;
/** 推力上限（每帧位移）。太大气泡会像被弹弓打飞 */
const REPEL_STRENGTH = 2.0;

interface Bubble {
  x: number;
  y: number;
  radius: number;
  speed: number;
  opacity: number;
  wanderAngle: number;
  wanderSpeed: number;
}

/**
 * 水下背景：上浮的气泡 + 斜射的光柱。
 *
 * 气泡会被指针**推开**（不是吸过去）—— 鼠标划过时像拨开水面。
 *
 * 2026-09-20 之前这里是「输入框获得焦点时气泡聚过来」。改成登录页之后
 * 默认显示的是二维码视图、一个输入框都没有，聚焦事件永远不触发，
 * 效果等于死了。现在直接在组件内部监听指针，不再依赖任何 props：
 * 走 ref 不走 React state，否则鼠标每动一下都要重渲染一次整棵登录页。
 */
export default function LoginBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bubblesRef = useRef<Bubble[]>([]);
  const rafRef = useRef<number>(0);
  /** 指针位置。指针移出窗口时为 null */
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const lastFrameRef = useRef(0);
  const timeRef = useRef(0);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      pointerRef.current = { x: e.clientX, y: e.clientY };
    };
    // 指针离开窗口后气泡不再受力，自然会重新散开
    const onLeave = () => {
      pointerRef.current = null;
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerleave', onLeave);
    document.addEventListener('pointerleave', onLeave);

    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerleave', onLeave);
      document.removeEventListener('pointerleave', onLeave);
    };
  }, []);

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

      // 顶部柔光。
      //
      // ⚠️ 以前这里画的是一个白色**多边形**当初光柱。问题是画布每帧只做淡化、
      // 不清空，多边形的硬边会一帧帧积累下来 —— 最后页面上就是一条从左上斜切
      // 到右下的硬直线，看着像渲染故障而不像光。
      //
      // 换成径向渐变：软边是渐变本身的性质，再怎么叠加也不会出现直线边界。
      if (!isMobile) {
        const glow = 0.05 + 0.02 * Math.sin(timeRef.current * 0.3);
        const cxr = width * 0.62;
        const cyr = -height * 0.15;
        const grad = ctx.createRadialGradient(cxr, cyr, 0, cxr, cyr, height * 1.25);
        grad.addColorStop(0, `rgba(255,255,255,${glow})`);
        grad.addColorStop(0.55, `rgba(255,255,255,${glow * 0.35})`);
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);
      }

      for (const b of bubbles) {
        b.y -= b.speed;
        b.wanderAngle += b.wanderSpeed;
        b.x += Math.sin(b.wanderAngle + timeRef.current * 0.3) * 0.5;

        // 指针推开气泡。dx/dy 取「气泡 → 指针」的反方向，所以是排斥不是吸引；
        // 越近推力越大，但留一个上限，免得贴脸时气泡瞬间被弹飞出屏。
        const p = pointerRef.current;
        if (p) {
          const dx = b.x - p.x;
          const dy = b.y - p.y;
          const dist = Math.hypot(dx, dy);
          if (dist < REPEL_RADIUS && dist > 0.5) {
            const force = ((REPEL_RADIUS - dist) / REPEL_RADIUS) * REPEL_STRENGTH;
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
