/**
 * 入场动画的粒子数学 —— **React 和加载屏共用这一份**。
 *
 * 为什么要单独抽出来：加载屏（纯 HTML 里跑的脚本，React 还没启动）和入场动画
 * （React 组件）必须画出**同一批粒子**，才能做到「粒子一直在飘 → 加载好了
 * 聚起来 → 接上动画」而中间没有任何一帧是"换画面"。
 *
 * ⚠️⚠️ **这里的常量一个都不许在别处抄第二遍。**
 * 采样宽度、透明度阈值、粒径比例、颜色档位 —— 只要加载屏和动画各写一套，
 * 交接那一刻粒径/颜色/位置就会对不上，正好就是用户说的「闪现」。
 * 项目里 theme.ts 顶上已经为渐变踩过一次同类的坑（「两边各写一遍渐变字符串，
 * 交接瞬间就会出现一道色差」），这条是同一个道理。
 *
 * 这个文件**不能 import 任何东西** —— 构建时它会被 esbuild 转成 IIFE
 * 原样内联进 index.html（见 vite.config.ts 的 bootScreenPlugin）。
 * 所以图片地址由调用方传进来，不在这里读 import.meta.env。
 */

export interface Particle {
  /** 起点（汇聚前的位置） */
  sx: number;
  sy: number;
  /** 终点（院徽轮廓上的位置） */
  tx: number;
  ty: number;
  /** 半径 */
  r: number;
  /** 起飞延迟，让汇聚有先后、不至于齐刷刷 */
  delay: number;
  /** 0~1，决定这颗是白的还是淡蓝的 */
  tone: number;
  /**
   * 汇聚**开始时**的透明度。汇聚过程从这里插值到 1。
   *
   * ⚠️ 这个字段是"接管不闪"的关键。加载屏阶段粒子是看得见的（0.3~0.7），
   * 如果汇聚还是像原来那样从 0 淡入，接管那一瞬间就是**满屏粒子同时消失、
   * 再慢慢淡回来** —— 用户明确说过不许有这种闪现。
   *
   * 自己建粒子（加载屏没跑起来时的兜底）时是 0：那时屏幕上本来就没有粒子，
   * 从 0 淡入才对。
   */
  a0: number;
}

export interface Layout {
  left: number;
  top: number;
  w: number;
  h: number;
}

/**
 * 采样宽度（把院徽读成多少像素宽的点阵）。
 *
 * ⚠️ 这个值不能随便调大。实测对比过 60/80/100/120/150 五档：
 *   - 60px  → 1311 点，糊成一团，字认不出来
 *   - 100px → 3504 点，字形清晰、水滴感也在 ← 就用这档
 *   - 150px → 7702 点，反而太密，一眼看穿是一颗颗孤立的点
 *
 * 关键是**点的半径要跟着缩放**（`显示宽 / 采样宽`）：半径小于相邻两点的
 * 间距时，线条会断成一截截散斑 —— 这是第一版踩的坑。而且要**全取**，
 * 不能从高分辨率里抽稀。
 */
export const SAMPLE_W_DESKTOP = 100;
export const SAMPLE_W_MOBILE = 70;

/** 透明度高于这个值才算院徽本体，滤掉抗锯齿的毛边 */
export const ALPHA_CUTOFF = 120;

export const CONVERGE_MS = 1600;
export const RESOLVE_MS = 1200;
export const FLY_MS = 1000;
export const TOTAL_MS = CONVERGE_MS + RESOLVE_MS + FLY_MS;

/** 覆盖层淡出、与底下登录页交叉的时间 */
export const HANDOFF_MS = 420;

/** 白圆漫过水滴之后，水滴退场用的过渡带宽（像素）—— 免得边缘像刀切 */
export const FLOOD_EDGE = 26;

/**
 * 显影阶段院徽的最大模糊半径。
 *
 * ⚠️ 这个模糊**只加在里面那张院徽图上，不加在白圆底上**。
 * 加在白圆上的话，圆形裁切出来的那道水线会被一起糊掉，
 * 变成一大圈灰糊糊的边 —— 白圆漫开的效果就废了。
 */
export const MAX_BLUR = 10;

/**
 * 白圆底的内边距，占徽章直径的比例。
 *
 * ⚠️ 这个值同时也是「水滴拼的尺寸」和「清晰院徽的尺寸」之差的分母 ——
 * 见 buildParticles 里的说明。定得越大，清晰那一刻院徽缩得越明显。
 */
export const BADGE_PADDING_RATIO = 0.04;

/** 兜底：动画再慢也不能超过这个点 */
export const FAILSAFE_MS = TOTAL_MS + HANDOFF_MS + 1500;

export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

export const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/**
 * 预生成的填充色。三千多个粒子每帧拼一次颜色串就是每秒二十万次字符串
 * 分配，在 8G 内存的机器上纯属自找 GC 压力。透明度量化成十几档，
 * 颜色串只在模块加载时建一次。
 */
export const ALPHA_BUCKETS = 14;

export const WHITE_STYLES: string[] = Array.from(
  { length: ALPHA_BUCKETS },
  (_, i) => `rgba(255,255,255,${((i / (ALPHA_BUCKETS - 1)) * 0.95).toFixed(3)})`,
);

export const CYAN_STYLES: string[] = Array.from(
  { length: ALPHA_BUCKETS },
  (_, i) => `rgba(125,211,252,${((i / (ALPHA_BUCKETS - 1)) * 0.9).toFixed(3)})`,
);

/** 按透明度取预生成的颜色串 */
export function styleFor(alpha: number, tone: number): string {
  const bucket = Math.min(
    ALPHA_BUCKETS - 1,
    Math.max(0, Math.round(alpha * (ALPHA_BUCKETS - 1))),
  );
  return tone > 0.75 ? CYAN_STYLES[bucket] : WHITE_STYLES[bucket];
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('院徽图加载失败'));
    img.src = src;
  });
}

/** 把院徽读成点阵。选中的点全部返回，不抽稀 */
export async function sampleEmblem(
  src: string,
  sampleW: number,
): Promise<{ pts: { x: number; y: number }[]; h: number }> {
  const img = await loadImage(src);
  const w = sampleW;
  const h = Math.max(1, Math.round(sampleW * (img.height / img.width)));

  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  const octx = off.getContext('2d', { willReadFrequently: true });
  if (!octx) return { pts: [], h };

  octx.drawImage(img, 0, 0, w, h);
  const { data } = octx.getImageData(0, 0, w, h);

  const pts: { x: number; y: number }[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > ALPHA_CUTOFF) pts.push({ x, y });
    }
  }
  return { pts, h };
}

export function buildParticles(
  pts: { x: number; y: number }[],
  sampleW: number,
  sampleH: number,
  W: number,
  H: number,
): { particles: Particle[]; layout: Layout } {
  // 白圆底的直径。放大不会让线条断开 —— 粒径是按比例算的
  const badgeSize = Math.min(W * 0.62, 380);
  const padding = badgeSize * BADGE_PADDING_RATIO;

  /**
   * ⚠️ 水滴要拼成的尺寸是**里面那张院徽图**的尺寸，不是白圆底的尺寸。
   *
   * 之前这里用的是白圆底直径，于是水滴拼出 380px 的院徽，而清晰之后
   * 那张图只有 380×(1−2×0.04)=350px —— 显影那一下院徽会「缩一下」，
   * 同时外面冒出一圈白边，两件事叠在一起格外明显。
   *
   * 现在 scale 按内图算：水滴拼多大，清晰之后就是多大，一点不缩。
   * 白圆底只是比它大出一圈 padding 而已。
   */
  const imgW = badgeSize - padding * 2;
  const scale = imgW / sampleW;
  const cx = W / 2;
  const cy = H * 0.44;

  const layout: Layout = {
    left: cx - badgeSize / 2,
    top: cy - badgeSize / 2,
    w: badgeSize,
    h: badgeSize,
  };

  if (pts.length === 0) return { particles: [], layout };

  // 粒径必须跟着 scale 走：半径小于相邻采样点间距时线条会断开
  const baseR = scale * 0.7;

  const particles = pts.map((p) => {
    const tx = cx + (p.x - sampleW / 2) * scale;
    const ty = cy + (p.y - sampleH / 2) * scale;

    /**
     * 起点：**铺满整屏的一片云**。
     *
     * ⚠️ 2026-09-25 改的。原来这里是「以院徽为中心向外散落到徽章的
     * 1.2~4.4 倍远」—— 那是为「水滴从屏幕外飞进来」设计的。但现在
     * 加载屏要先把这批粒子显示成「一堆粒子在飘」，那个半径在 900×700
     * 的屏上大部分落到屏幕外，**屏幕上只剩四边零星的几点，中间一大片空**，
     * 看着像没做出来（实测拍下来就是这样）。
     *
     * 改成椭圆内均匀铺开，半径取 `√随机数` 保证是均匀分布而不是往中心堆。
     * 这样加载屏和动画共用同一批起点，飘着飘着聚起来，中间不用换画面。
     *
     * ⚠️ 别改回"散落到屏幕外" —— 那样加载屏阶段就看不见粒子了。
     */
    const angle = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random());
    const sx = cx + Math.cos(angle) * r * W * 0.46;
    const sy = cy + Math.sin(angle) * r * H * 0.46;

    return {
      sx,
      sy,
      tx,
      ty,
      r: baseR * (0.85 + Math.random() * 0.3),
      delay: Math.random() * 240,
      tone: Math.random(),
      a0: 0, // 自己建的粒子从全透明淡入；接管来的会在 detach 里被改成当时的透明度
    };
  });

  return { particles, layout };
}

/**
 * 粒子在漂浮状态下、时刻 t 的位置。
 *
 * ⚠️ **画和取位置必须走这一个函数。** 加载屏用它来画，动画接管时用它来
 * 取"粒子此刻在哪"—— 两处要是各写一遍公式，接管那一帧粒子的位置就对不上，
 * 屏幕上的表现就是**所有粒子同时一跳**，正好是用户三令五申不许有的东西。
 *
 * 两条不同频率的正弦叠加，看着不规律；相位用序号算，省掉每颗粒子存字段。
 */
export function driftPosition(
  p: Particle,
  i: number,
  t: number,
): { x: number; y: number } {
  const ph = i * 0.7;
  const wob = p.r * 5;
  return {
    x: p.sx + Math.sin(t / 1900 + ph) * wob + Math.sin(t / 3100 + ph * 1.7) * wob * 0.5,
    y: p.sy + Math.cos(t / 2300 + ph * 1.3) * wob + Math.cos(t / 3700 + ph) * wob * 0.5,
  };
}

/**
 * 粒子在漂浮状态下、时刻 t 的透明度（0.3~0.7 之间呼吸）。
 *
 * ⚠️ 和 driftPosition 一样，**画和取必须走同一个函数** ——
 * 接管时要把此刻的透明度记进 a0，各写一遍就会在交接处闪一下。
 */
export function driftAlpha(i: number, t: number): number {
  return 0.5 + 0.2 * Math.sin(t / 1400 + i * 0.7 * 2.1);
}

/**
 * 画「漂浮」状态的粒子 —— 加载屏阶段用。
 *
 * 每颗粒子在自己起点附近慢慢晃，透明度微微呼吸。
 * 抖动幅度取半径的 5 倍：太小看不出在飘，太大就散了、失去"一堆粒子"的整体感。
 */
export function drawDrift(
  ctx: CanvasRenderingContext2D,
  particles: Particle[],
  t: number,
  W: number,
  H: number,
): void {
  ctx.clearRect(0, 0, W, H);

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    const { x, y } = driftPosition(p, i, t);
    ctx.fillStyle = styleFor(driftAlpha(i, t), p.tone);
    ctx.fillRect(x - p.r, y - p.r, p.r * 2, p.r * 2);
  }
}

/** 画水滴。白圆漫完就不画了，交给真正的院徽图 */
export function drawDots(
  ctx: CanvasRenderingContext2D,
  particles: Particle[],
  t: number,
  W: number,
  H: number,
  cx: number,
  cy: number,
  discR: number,
): void {
  ctx.clearRect(0, 0, W, H);
  if (t >= CONVERGE_MS + RESOLVE_MS) return;

  /**
   * ⚠️ 水滴**不做整体淡出**，而是「被白圆漫过的才退场」。
   *
   * 整体淡出的话，外圈会在白圆还没漫到时就先空掉一块 ——
   * 看着像院徽缺了个角。按距离逐个判断，画面就永远是完整的：
   * 外面还是白色水滴，里面已经是黑院徽，边界就是那道白圆的边。
   */
  const flooding = t > CONVERGE_MS;

  for (const p of particles) {
    const localT = t - p.delay;
    /**
     * ⚠️ 是 `< 0` 不是 `<= 0`。
     *
     * 接管加载屏那批粒子时 delay 已经被清零，t=0 这一帧必须**照常画出来**
     * （位置和透明度都等于加载屏的最后一帧，所以这一帧和上一帧像素级重合）。
     * 写成 `<= 0` 的话 t=0 整帧不画 —— 屏幕上就是满屏粒子闪一下没了，
     * 再一帧帧淡回来。实测差异从 0.8 跳到 12.7 就是这么来的。
     *
     * 兜底自建的粒子 delay 不清零、a0=0，t=0 时 alpha 为 0 本来也不画，
     * 所以这里放宽判断对它没有任何影响。
     */
    if (localT < 0) continue;

    let x: number;
    let y: number;
    let alpha: number;

    if (localT < CONVERGE_MS) {
      const k = easeOutCubic(localT / CONVERGE_MS);
      x = p.sx + (p.tx - p.sx) * k;
      y = p.sy + (p.ty - p.sy) * k;
      /**
       * ⚠️ 从 `a0` 插值到 1，不是从 0 淡入。
       *
       * 接管加载屏那批粒子时 a0 是它们飘着时的透明度（0.3~0.7）——
       * 这样汇聚的第一帧和加载屏的最后一帧**像素级重合**，中间没有一下消失。
       * 兜底自建粒子时 a0=0，行为和改动前完全一致。
       */
      alpha = p.a0 + (1 - p.a0) * Math.min(1, k * 1.6);
    } else {
      x = p.tx;
      y = p.ty;
      alpha = 0.92;
    }

    if (flooding) {
      const d = Math.hypot(x - cx, y - cy);
      const covered = Math.min(1, Math.max(0, (discR - d) / (2 * FLOOD_EDGE) + 0.5));
      alpha *= 1 - covered;
    }

    if (alpha <= 0.01) continue;

    ctx.fillStyle = styleFor(alpha, p.tone);
    // 用方块而不是圆。这个尺寸下肉眼分不出，但快好几倍
    ctx.fillRect(x - p.r, y - p.r, p.r * 2, p.r * 2);
  }
}

/** 各平台 base 不同，院徽地址由调用方拼好传进来 */
export function emblemSrc(base: string): string {
  return `${base}images/镂空院徽2_标清.png`;
}

/** 加载屏那边（build/introBoot.js）交给 WaterIntro 的把手 */
export interface IntroBootHandle {
  layer: HTMLElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  particles: Particle[];
  layout: Layout;
  dpr: number;
  width: number;
  height: number;
  /** 是否已被接管。给验证脚本判断交接发生在哪一帧用 */
  detached: boolean;
  /**
   * 接管：停掉漂浮循环，并把每颗粒子此刻的位置固化进 sx/sy，
   * 让动画从粒子现在所在的地方接着走 —— 而不是从预设起点重来。
   */
  detach: () => {
    layer: HTMLElement;
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    particles: Particle[];
    layout: Layout;
    dpr: number;
  };
}

declare global {
  interface Window {
    /** 加载屏的把手；它没跑起来时是 undefined，WaterIntro 会兜底 */
    __SCAU_INTRO_BOOT__?: IntroBootHandle;
    /** 构建时注入：各平台 base 不同，加载屏要靠它拼院徽地址 */
    SCAU_BASE?: string;
    /** 构建时注入：和 theme.ts 的 LOGIN_GRADIENT 是同一个值 */
    SCAU_LOGIN_GRADIENT?: string;
  }
}
