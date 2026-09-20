import { useEffect, useRef } from 'react';

/**
 * 入场动画：水滴汇聚成院徽，再散开，露出登录界面。
 *
 * 做法是把院徽图采样成一堆点，每个点当一个水滴的目标位置，
 * 水滴从屏幕各处飞过来拼出院徽。全部在 canvas 上画 —— 用 DOM
 * 摆几百个动画元素会把主线程压垮。
 *
 * 性能约束（这台机器 8G 内存，且刚做完手机端优化）：
 *   - 手机上粒子数砍到约 1/3
 *   - DPR 上限 2
 *   - 动画跑完**彻底停掉 RAF**，不留常驻循环
 *   - prefers-reduced-motion 直接跳过
 *
 * ⚠️ 有硬超时兜底。动画无论卡在哪一步，到点必须放行 ——
 * 绝不能让一个装饰动画把人挡在登录页外面。
 */

const EMBLEM_SRC = `${import.meta.env.BASE_URL}images/镂空院徽2_标清.png`;

/**
 * 采样宽度（把院徽读成多少像素宽的点阵）。
 *
 * ⚠️ 这个值不能随便调大。实测对比过 60/80/100/120/150 五档：
 *   - 60px  → 1311 点，糊成一团，字认不出来
 *   - 100px → 3504 点，字形清晰、水滴感也在 ← 就用这档
 *   - 150px → 7702 点，反而太密，一眼看穿是一颗颗孤立的点
 *
 * 关键是**点的半径要跟着缩放**（`displayW / SAMPLE_W`）：半径小于
 * 相邻两点的间距时，线条会断成一截截散斑 —— 这是第一版踩的坑。
 * 而且要**把选中的点全部取上**，不能从高分辨率里稀疏抽样。
 */
const SAMPLE_W_DESKTOP = 100;
const SAMPLE_W_MOBILE = 70;

/** 透明度高于这个值才算院徽本体，滤掉抗锯齿的毛边 */
const ALPHA_CUTOFF = 120;

const CONVERGE_MS = 900;
const HOLD_MS = 550;
const DISPERSE_MS = 750;
const TOTAL_MS = CONVERGE_MS + HOLD_MS + DISPERSE_MS;

/** 兜底放行时间：动画再慢也不能超过这个点 */
const FAILSAFE_MS = TOTAL_MS + 1800;

interface Particle {
  /** 起点（散落在屏幕上） */
  sx: number;
  sy: number;
  /** 终点（院徽上的采样点） */
  tx: number;
  ty: number;
  /** 粒径 */
  r: number;
  /** 起飞延迟，做出参差感而不是齐刷刷一起动 */
  delay: number;
  /** 散开方向（单位向量） */
  dx: number;
  dy: number;
  /** 散开距离 */
  dist: number;
  /** 明暗/色相扰动，让粒子不是一个模子刻出来的 */
  tone: number;
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * 预生成的填充色。
 *
 * 三千多个粒子每帧拼一次颜色字符串，就是每秒二十万次字符串分配 ——
 * 在 8G 内存的机器上这是白白制造 GC 压力。把透明度量化成十几档，
 * 颜色串只在模块加载时建一次，之后全是查表。
 */
const ALPHA_BUCKETS = 14;
const WHITE_STYLES = Array.from({ length: ALPHA_BUCKETS }, (_, i) =>
  `rgba(255,255,255,${((i / (ALPHA_BUCKETS - 1)) * 0.95).toFixed(3)})`,
);
const CYAN_STYLES = Array.from({ length: ALPHA_BUCKETS }, (_, i) =>
  `rgba(125,211,252,${((i / (ALPHA_BUCKETS - 1)) * 0.9).toFixed(3)})`,
);

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('院徽图加载失败'));
    img.src = src;
  });
}

/**
 * 把院徽读成一张点阵。**选中的点全部返回，不做抽稀。**
 * 抽稀会让相邻点隔开好几个像素，线条直接断掉 —— 见上面 SAMPLE_W 的说明。
 */
async function sampleEmblem(sampleW: number): Promise<{ x: number; y: number }[]> {
  const img = await loadImage(EMBLEM_SRC);
  const w = sampleW;
  const h = Math.max(1, Math.round(sampleW * (img.height / img.width)));

  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  const octx = off.getContext('2d', { willReadFrequently: true });
  if (!octx) return [];

  octx.drawImage(img, 0, 0, w, h);
  const { data } = octx.getImageData(0, 0, w, h);

  const pts: { x: number; y: number }[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > ALPHA_CUTOFF) pts.push({ x, y });
    }
  }
  return pts;
}

function buildParticles(
  pts: { x: number; y: number }[],
  sampleW: number,
  W: number,
  H: number,
): Particle[] {
  if (pts.length === 0) return [];

  // 院徽在屏幕上的尺寸。放大不会让线条断开 —— 粒径是按 emblemW/sampleW
  // 同比例算的，格距和半径一起变大，比例始终一致。
  const emblemW = Math.min(W * 0.62, 380);
  const scale = emblemW / sampleW;
  const cx = W / 2;
  // 略微偏上，视线落点更舒服
  const cy = H * 0.44;

  let maxY = 0;
  for (const p of pts) if (p.y > maxY) maxY = p.y;
  const halfH = (maxY * scale) / 2;

  /**
   * 粒径。必须跟着 scale 走 —— 半径小于相邻采样点的间距时线条会断开。
   * 0.7 倍格距配合少量随机，相邻点刚好咬合又不至于糊成一片。
   */
  const baseR = scale * 0.7;

  return pts.map((p) => {
    const tx = cx + (p.x - sampleW / 2) * scale;
    const ty = cy + p.y * scale - halfH;

    // 起点：以院徽为中心向外散落，保证不会一开始就压在目标位置上
    const angle = Math.random() * Math.PI * 2;
    const radius = emblemW * (1.2 + Math.random() * 3.2);

    return {
      sx: cx + Math.cos(angle) * radius,
      sy: cy + Math.sin(angle) * radius,
      tx,
      ty,
      r: baseR * (0.85 + Math.random() * 0.3),
      delay: Math.random() * 240,
      dx: Math.cos(angle),
      dy: Math.sin(angle),
      dist: 160 + Math.random() * 420,
      tone: Math.random(),
    };
  });
}

function draw(
  ctx: CanvasRenderingContext2D,
  particles: Particle[],
  t: number,
  W: number,
  H: number,
): void {
  ctx.clearRect(0, 0, W, H);

  for (const p of particles) {
    // 每个粒子有自己的起飞时刻，localT 才是它的本地时间
    const localT = t - p.delay;

    let x: number;
    let y: number;
    let alpha: number;

    if (localT <= 0) {
      continue; // 还没起飞，不画
    } else if (localT < CONVERGE_MS) {
      // 汇聚：从起点飞向院徽上的位置
      const k = easeOutCubic(localT / CONVERGE_MS);
      x = p.sx + (p.tx - p.sx) * k;
      y = p.sy + (p.ty - p.sy) * k;
      alpha = Math.min(1, k * 1.6);
    } else if (localT < CONVERGE_MS + HOLD_MS) {
      // 停驻：轻微呼吸，完全静止会显得像贴图
      const w = (localT - CONVERGE_MS) / HOLD_MS;
      x = p.tx;
      y = p.ty;
      alpha = 0.85 + 0.15 * Math.sin(w * Math.PI * 3 + p.tone * 6);
    } else if (t < TOTAL_MS) {
      // 散开：沿着来时的方向飞回去并淡出
      const k = easeOutCubic((t - CONVERGE_MS - HOLD_MS) / DISPERSE_MS);
      x = p.tx + p.dx * p.dist * k;
      y = p.ty + p.dy * p.dist * k;
      alpha = Math.max(0, 1 - k);
    } else {
      continue;
    }

    if (alpha <= 0.01) continue;

    const bucket = Math.min(
      ALPHA_BUCKETS - 1,
      Math.max(0, Math.round(alpha * (ALPHA_BUCKETS - 1))),
    );
    // 多数是水白，少部分偏青，做出层次
    ctx.fillStyle = p.tone > 0.75 ? CYAN_STYLES[bucket] : WHITE_STYLES[bucket];

    // 用方块而不是圆。这个尺寸（1~2px）下肉眼分不出，但快好几倍 ——
    // 三千多个粒子每秒六万次 arc+fill，在低配机器上会掉帧。
    ctx.fillRect(x - p.r, y - p.r, p.r * 2, p.r * 2);
  }
}

interface Props {
  /** 动画结束（或被跳过、或失败兜底）时调用。必须保证只调一次 */
  onDone: () => void;
}

export default function WaterIntro({ onDone }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** 用 ref 存回调，避免父组件每次重渲染都重启动画 */
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      onDoneRef.current();
    };

    // 兜底：不管动画走到哪，到点就放行
    const failsafe = window.setTimeout(finish, FAILSAFE_MS);

    // 用户在系统里关了动画 —— 尊重这个设置，直接进登录页
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      window.clearTimeout(failsafe);
      finish();
      return;
    }

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) {
      window.clearTimeout(failsafe);
      finish();
      return;
    }

    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = window.innerWidth;
    let H = window.innerHeight;

    const resize = () => {
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    let raf = 0;
    let cancelled = false;
    let particles: Particle[] = [];
    const start = performance.now();

    const frame = (now: number) => {
      if (cancelled) return;
      const t = now - start;

      draw(ctx, particles, t, W, H);

      if (t >= TOTAL_MS) {
        finish();
        return; // 不排下一帧 —— 动画结束就彻底停掉，不留常驻循环
      }
      raf = requestAnimationFrame(frame);
    };

    void (async () => {
      try {
        const sampleW = isMobile ? SAMPLE_W_MOBILE : SAMPLE_W_DESKTOP;
        const pts = await sampleEmblem(sampleW);
        if (cancelled) return;
        particles = buildParticles(pts, sampleW, W, H);

        if (particles.length === 0) {
          // 采样不出东西（图挂了/透明区判断失误），别卡着
          window.clearTimeout(failsafe);
          finish();
          return;
        }
        raf = requestAnimationFrame(frame);
      } catch {
        // 图加载失败、canvas 被污染……任何异常都不能把人挡在登录页外
        window.clearTimeout(failsafe);
        finish();
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(failsafe);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        // 挡住点击，免得用户在动画期间点到底下还没露出来的登录控件
        pointerEvents: 'auto',
      }}
    />
  );
}
