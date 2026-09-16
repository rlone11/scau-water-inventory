import { useEffect, useRef } from 'react';

/**
 * 点击时的水滴飞溅特效。
 *
 * 点击处迸出一小簇水滴向四周飞散，受重力作用下垂，随后淡出消失。
 *
 * 与旧版涟漪的区别：不再画同心圆环（用户反馈不喜欢），改为粒子式水花。
 * 性能上也做了改进 —— 旧版无论有没有点击，都每帧 clearRect 重绘整块全屏 canvas；
 * 现在没有水滴在飞时动画循环会彻底停下。
 */

interface Droplet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  /** 剩余寿命，1 → 0，用于淡出 */
  life: number;
  /** 使用亮蓝还是深蓝，做出层次感 */
  bright: boolean;
}

/** 每次点击迸出的水滴数 */
const DROPLET_COUNT = 11;
/** 重力加速度（每帧） */
const GRAVITY = 0.2;
/** 空气阻力，让水滴逐渐减速 */
const FRICTION = 0.98;
/** 每帧寿命衰减量 —— 约 1 秒后消失 */
const LIFE_DECAY = 0.016;
/** 屏幕上同时存在的最大水滴数，防止连点导致卡顿 */
const MAX_DROPLETS = 150;

export default function CursorEffects() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dropletsRef = useRef<Droplet[]>([]);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reducedMotion.matches) return;

    // 触屏设备不启用。这个特效是按「光标落点」设计的，而手机上：
    // 落点会被手指本身盖住看不到，却要在每次点击（点导航、点按钮、点卡片都算）
    // 重绘整块全屏 canvas，正好和页面转场动画抢帧。
    if (window.matchMedia('(pointer: coarse)').matches) return;

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

    const animate = () => {
      if (!running) return;

      const droplets = dropletsRef.current;

      // 没有水滴在飞时清掉最后一帧并停掉循环，不再无谓地每帧重绘
      if (droplets.length === 0) {
        ctx.clearRect(0, 0, width, height);
        rafRef.current = 0;
        return;
      }

      ctx.clearRect(0, 0, width, height);

      for (let i = droplets.length - 1; i >= 0; i--) {
        const d = droplets[i];

        d.vy += GRAVITY;
        d.vx *= FRICTION;
        d.vy *= FRICTION;
        d.x += d.vx;
        d.y += d.vy;
        d.life -= LIFE_DECAY;

        if (d.life <= 0 || d.y - d.radius > height) {
          droplets.splice(i, 1);
          continue;
        }

        ctx.beginPath();
        ctx.arc(d.x, d.y, d.radius, 0, Math.PI * 2);
        ctx.fillStyle = d.bright
          ? `rgba(125, 211, 252, ${0.8 * d.life})`
          : `rgba(14, 165, 233, ${0.7 * d.life})`;
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    const onClick = (e: MouseEvent) => {
      const droplets = dropletsRef.current;

      for (let i = 0; i < DROPLET_COUNT; i++) {
        if (droplets.length >= MAX_DROPLETS) break;

        // 均匀分布再加随机抖动，避免每次点击看起来一模一样
        const angle = (Math.PI * 2 * i) / DROPLET_COUNT + Math.random() * 0.6;
        const speed = 1.8 + Math.random() * 3.2;

        droplets.push({
          x: e.clientX,
          y: e.clientY,
          vx: Math.cos(angle) * speed,
          // 略微向上，模拟水花溅起后落下
          vy: Math.sin(angle) * speed - 1.6,
          radius: 1.6 + Math.random() * 2.4,
          life: 1,
          bright: i % 2 === 0,
        });
      }

      // 循环已停下则重新启动
      if (!rafRef.current) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };
    window.addEventListener('click', onClick);

    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
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
