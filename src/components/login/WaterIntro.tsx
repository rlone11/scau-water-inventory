import { useEffect, useRef } from 'react';
import { LOGIN_GRADIENT, LOGIN_EMBLEM_ID } from '../../theme';

/**
 * 入场动画：水滴汇聚成院徽 → 由模糊变清晰 → 飞向登录页顶部的位置落位。
 *
 * 四个阶段：
 *   0 ~ 1200ms  水滴从屏幕各处飞聚，拼出院徽轮廓
 *   1200 ~ 2050 院徽图从模糊变锐利，水滴同时淡出（"显影"）
 *   2050 ~ 2900 清晰的院徽缩小、飞到登录页顶部那个院徽的位置
 *   2900 ~ 3220 整块覆盖层淡出，与底下的登录页交叉
 *
 * 交接为什么能无缝：覆盖层铺的是**和登录页一模一样的不透明渐变**
 * （LOGIN_GRADIENT，两边共用一个常量），所以底下那一层不需要做任何配合 ——
 * 院徽飞到真实位置后整块淡出即可。如果两边各写一套渐变，或者让底下那层
 * 等信号再淡入，就得对时间，稍有偏差就是一道闪。
 *
 * 性能约束（8G 内存的机器，且刚做完手机端优化）：
 *   - 手机上采样降到 70px（约 1800 粒子）
 *   - DPR 上限 2
 *   - fillRect 替 arc（1~2px 下肉眼无区别但快数倍）
 *   - 颜色串预生成，避免每帧几万次字符串分配
 *   - 动画结束彻底停 RAF，不留常驻循环
 *
 * ⚠️ 有硬超时兜底。装饰动画无论卡在哪一步，到点必须放行 ——
 * 绝不能把人挡在登录页外面。
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
 * 关键是**点的半径要跟着缩放**（`显示宽 / 采样宽`）：半径小于相邻两点的
 * 间距时，线条会断成一截截散斑 —— 这是第一版踩的坑。而且要**全取**，
 * 不能从高分辨率里抽稀。
 */
const SAMPLE_W_DESKTOP = 100;
const SAMPLE_W_MOBILE = 70;

/** 透明度高于这个值才算院徽本体，滤掉抗锯齿的毛边 */
const ALPHA_CUTOFF = 120;

const CONVERGE_MS = 1600;
const RESOLVE_MS = 1200;
const FLY_MS = 1000;
const TOTAL_MS = CONVERGE_MS + RESOLVE_MS + FLY_MS;

/** 覆盖层淡出、与底下登录页交叉的时间 */
const HANDOFF_MS = 420;

/** 白圆漫过水滴之后，水滴退场用的过渡带宽（像素）—— 免得边缘像刀切 */
const FLOOD_EDGE = 26;

/**
 * 显影阶段院徽的最大模糊半径。
 *
 * ⚠️ 这个模糊**只加在里面那张院徽图上，不加在白圆底上**。
 * 加在白圆上的话，圆形裁切出来的那道水线会被一起糊掉，
 * 变成一大圈灰糊糊的边 —— 白圆漫开的效果就废了。
 */
const MAX_BLUR = 10;

/**
 * 白圆底的内边距，占徽章直径的比例。
 *
 * ⚠️ 这个值同时也是「水滴拼的尺寸」和「清晰院徽的尺寸」之差的分母 ——
 * 见 buildParticles 里的说明。定得越大，清晰那一刻院徽缩得越明显。
 */
const BADGE_PADDING_RATIO = 0.04;

/** 兜底：动画再慢也不能超过这个点 */
const FAILSAFE_MS = TOTAL_MS + HANDOFF_MS + 1500;

interface Particle {
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  r: number;
  delay: number;
  tone: number;
}

interface Layout {
  left: number;
  top: number;
  w: number;
  h: number;
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/**
 * 预生成的填充色。三千多个粒子每帧拼一次颜色串就是每秒二十万次字符串
 * 分配，在 8G 内存的机器上纯属自找 GC 压力。透明度量化成十几档，
 * 颜色串只在模块加载时建一次。
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

/** 把院徽读成点阵。选中的点全部返回，不抽稀 */
async function sampleEmblem(
  sampleW: number,
): Promise<{ pts: { x: number; y: number }[]; h: number }> {
  const img = await loadImage(EMBLEM_SRC);
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

function buildParticles(
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

    // 起点：以院徽为中心向外散落，保证不会一开始就压在目标位置上
    const angle = Math.random() * Math.PI * 2;
    const radius = badgeSize * (1.2 + Math.random() * 3.2);

    return {
      sx: cx + Math.cos(angle) * radius,
      sy: cy + Math.sin(angle) * radius,
      tx,
      ty,
      r: baseR * (0.85 + Math.random() * 0.3),
      delay: Math.random() * 240,
      tone: Math.random(),
    };
  });

  return { particles, layout };
}

/** 画水滴。白圆漫完就不画了，交给真正的院徽图 */
function drawDots(
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
    if (localT <= 0) continue;

    let x: number;
    let y: number;
    let alpha: number;

    if (localT < CONVERGE_MS) {
      const k = easeOutCubic(localT / CONVERGE_MS);
      x = p.sx + (p.tx - p.sx) * k;
      y = p.sy + (p.ty - p.sy) * k;
      alpha = Math.min(1, k * 1.6);
    } else {
      x = p.tx;
      y = p.ty;
      alpha = 0.92;
    }

    if (flooding) {
      const d = Math.hypot(x - cx, y - cy);
      const covered = Math.min(
        1,
        Math.max(0, (discR - d) / (2 * FLOOD_EDGE) + 0.5),
      );
      alpha *= 1 - covered;
    }

    if (alpha <= 0.01) continue;

    const bucket = Math.min(
      ALPHA_BUCKETS - 1,
      Math.max(0, Math.round(alpha * (ALPHA_BUCKETS - 1))),
    );
    ctx.fillStyle = p.tone > 0.75 ? CYAN_STYLES[bucket] : WHITE_STYLES[bucket];
    // 用方块而不是圆。这个尺寸下肉眼分不出，但快好几倍
    ctx.fillRect(x - p.r, y - p.r, p.r * 2, p.r * 2);
  }
}

/**
 * 更新院徽图的位置/透明度/模糊。
 *
 * 每帧都写 style 会不断触发布局计算，所以量化后比对 —— 值没实质变化
 * 就整个跳过。
 */
function makeBadgeUpdater(el: HTMLElement, img: HTMLElement) {
  let lastKey = '';
  return (
    box: Layout,
    opacity: number,
    blur: number,
    scale: number,
    /**
     * 白圆的裁切半径，**按元素自身的百分比**（0~50）。
     * 用百分比而不是 px，是因为飞行阶段元素会从 380px 缩到 80px ——
     * 写成 px 的话缩小之后白圆就只剩中间一小块了。
     */
    clipPercent: number,
  ): void => {
    const key = `${box.left | 0}|${box.top | 0}|${box.w | 0}|${
      box.h | 0
    }|${(opacity * 40) | 0}|${blur.toFixed(1)}|${scale.toFixed(3)}|${clipPercent.toFixed(1)}`;
    if (key === lastKey) return;
    lastKey = key;

    el.style.left = `${box.left}px`;
    el.style.top = `${box.top}px`;
    el.style.width = `${box.w}px`;
    el.style.height = `${box.h}px`;
    /**
     * ⚠️ 内边距必须算成 px，**不能用百分比**。
     *
     * CSS 的百分比 padding 是相对**包含块的宽度**算的，不是元素自身宽度。
     * 这个徽章在固定全屏的覆盖层里，所以写 `padding: 10%` 在 1200px 宽的屏上
     * 是 120px 而不是 38px —— 院徽被挤成一小坨，跟登录页那个完全对不上。
     * 必须按自身宽度算成 px。比例与登录页那个真徽章保持一致。
     */
    el.style.padding = `${box.w * BADGE_PADDING_RATIO}px`;
    el.style.opacity = String(opacity);
    el.style.transform = `scale(${scale})`;
    // 白圆从中心往外漫
    el.style.clipPath = `circle(${clipPercent.toFixed(1)}% at 50% 50%)`;
    // 模糊挂在里面的图上，不挂白圆 —— 否则水线会被糊掉
    img.style.filter = blur > 0.05 ? `blur(${blur.toFixed(1)}px)` : 'none';
  };
}

interface Props {
  /** 覆盖层完全消失后调用，此时才该摘掉它 */
  onDone: () => void;
}

export default function WaterIntro({ onDone }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const badgeRef = useRef<HTMLDivElement>(null);
  const badgeImgRef = useRef<HTMLImageElement>(null);
  /** 用 ref 存回调，避免父组件每次重渲染都重启动画 */
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    const badge = badgeRef.current;
    const badgeImg = badgeImgRef.current;
    if (!wrap || !canvas || !badge || !badgeImg) {
      onDoneRef.current();
      return;
    }

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      onDoneRef.current();
    };

    /** 收尾：整块覆盖层淡出，让底下的登录页透出来，然后再摘掉自己 */
    const handoff = () => {
      if (finished) return;
      wrap.style.transition = `opacity ${HANDOFF_MS}ms ease-out`;
      wrap.style.opacity = '0';
      window.setTimeout(finish, HANDOFF_MS);
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

    const updateImage = makeBadgeUpdater(badge, badgeImg);
    let particles: Particle[] = [];
    let layout: Layout = { left: 0, top: 0, w: 0, h: 0 };
    /**
     * 飞行终点：登录页顶部那个真院徽的位置。
     *
     * ⚠️ 必须**等到飞行阶段开始时才量**。一开始就量会拿到错的坐标 ——
     * 那一刻登录页自己的入场动画（y:30、scale:0.95）还没播完，
     * getBoundingClientRect 量到的是动画中途的位置，徽章会落偏。
     */
    let target: Layout | null = null;
    let targetMeasured = false;

    let raf = 0;
    let cancelled = false;
    const start = performance.now();

    const frame = (now: number) => {
      if (cancelled) return;
      const t = now - start;

      /**
       * 白圆当前半径。
       *
       * 显影阶段的整个观感都靠这一条：白圆从中心往外漫，漫过的地方
       * 黑院徽显形、水滴退场。深蓝底上的白色水滴和黑院徽本来是两种颜色，
       * 硬切会「跳」一下；用「水漫过去」这个动作把颜色变化解释掉，
       * 就成了一个连贯的过程。
       */
      const floodK =
        t <= CONVERGE_MS
          ? 0
          : easeInOutCubic(Math.min(1, (t - CONVERGE_MS) / RESOLVE_MS));
      const discR = floodK * (layout.w / 2);

      drawDots(
        ctx,
        particles,
        t,
        W,
        H,
        layout.left + layout.w / 2,
        layout.top + layout.h / 2,
        discR,
      );

      if (t < CONVERGE_MS) {
        // 还没开始漫
        updateImage(layout, 0, MAX_BLUR, 1.04, 0);
      } else if (t < CONVERGE_MS + RESOLVE_MS) {
        // 白圆一边长大，院徽一边从模糊变清晰
        updateImage(
          layout,
          1,
          MAX_BLUR * (1 - floodK),
          1.04 - 0.04 * floodK,
          floodK * 50,
        );
      } else {
        // 飞向登录页的真实位置。到这一刻登录页的入场动画早已结束，
        // 量到的才是最终坐标
        if (!targetMeasured) {
          targetMeasured = true;
          const el = document.getElementById(LOGIN_EMBLEM_ID);
          if (el) {
            const r = el.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) {
              target = { left: r.left, top: r.top, w: r.width, h: r.height };
            }
          }
        }

        const k = easeInOutCubic(Math.min(1, (t - CONVERGE_MS - RESOLVE_MS) / FLY_MS));
        const dst = target ?? layout;
        updateImage(
          {
            left: layout.left + (dst.left - layout.left) * k,
            top: layout.top + (dst.top - layout.top) * k,
            w: layout.w + (dst.w - layout.w) * k,
            h: layout.h + (dst.h - layout.h) * k,
          },
          1,
          0,
          1,
          50, // 白圆已经漫满，飞行途中保持满圆（百分比，会跟着元素缩放）
        );
      }

      if (t >= TOTAL_MS) {
        handoff();
        return; // 不排下一帧 —— 动画结束就彻底停掉
      }
      raf = requestAnimationFrame(frame);
    };

    void (async () => {
      try {
        const sampleW = isMobile ? SAMPLE_W_MOBILE : SAMPLE_W_DESKTOP;
        const { pts, h } = await sampleEmblem(sampleW);
        if (cancelled) return;

        const built = buildParticles(pts, sampleW, h, W, H);
        particles = built.particles;
        layout = built.layout;

        if (particles.length === 0) {
          // 采样不出东西（图挂了/透明区判断失误），别卡着
          window.clearTimeout(failsafe);
          finish();
          return;
        }

        updateImage(layout, 0, MAX_BLUR, 1.04, 0);
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
    <div
      ref={wrapRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        // 不透明，且与登录页共用同一个渐变常量 —— 交接时它整块淡出即可，
        // 底下那层不需要做任何配合
        background: LOGIN_GRADIENT,
        // 挡住点击，免得动画期间点到底下还没露出来的登录控件
        pointerEvents: 'auto',
      }}
    >
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0 }} />

      {/*
        ⚠️ 院徽外面必须垫白色圆底。

        院徽图本身是**黑色镂空透明底**的，直接摆在深蓝背景上对比度极低，
        糊成一团灰。登录页正是因为这个问题才用白圆底衬着（侧边栏也一样）。

        内边距用百分比（10%），会跟着尺寸一起缩放 —— 所以飞到最后
        380px → 80px 时，内部院徽正好是 64px，与登录页那个严丝合缝。
      */}
      <div
        ref={badgeRef}
        aria-hidden="true"
        style={{
          position: 'absolute',
          opacity: 0,
          background: '#ffffff',
          borderRadius: '50%',
          boxSizing: 'border-box',
          // 具体的 padding 由 makeBadgeUpdater 按尺寸算（见那里的说明）
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          pointerEvents: 'none',
          // 只在存在的这几秒里开启，用完随组件一起消失
          willChange: 'opacity, filter, transform',
        }}
      >
        <img
          ref={badgeImgRef}
          src={EMBLEM_SRC}
          alt=""
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            display: 'block',
            willChange: 'filter',
          }}
        />
      </div>
    </div>
  );
}
