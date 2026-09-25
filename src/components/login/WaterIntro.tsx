import { useEffect, useRef } from 'react';
import { LOGIN_GRADIENT, LOGIN_EMBLEM_ID } from '../../theme';
import {
  BADGE_PADDING_RATIO,
  CONVERGE_MS,
  FAILSAFE_MS,
  FLY_MS,
  HANDOFF_MS,
  MAX_BLUR,
  RESOLVE_MS,
  SAMPLE_W_DESKTOP,
  SAMPLE_W_MOBILE,
  TOTAL_MS,
  buildParticles,
  drawDots,
  easeInOutCubic,
  emblemSrc,
  sampleEmblem,
  type Layout,
  type Particle,
} from '../../lib/introParticles';

/**
 * 入场动画：粒子汇聚成院徽 → 由模糊变清晰 → 飞向登录页顶部的位置落位。
 *
 * 四个阶段（时长是下面那几个常量，改的时候这里不用跟着改）：
 *   漂浮   加载屏阶段就在跑了 —— 粒子铺满全屏慢慢晃（**不在这个组件里**）
 *   汇聚   从粒子**此刻的位置**收拢，拼出院徽轮廓
 *   显影   白圆从中心往外漫，漫过的地方院徽从模糊变锐利、粒子退场
 *   飞行   清晰的院徽缩小、飞到登录页顶部那个院徽的位置
 *   交接   整个动画层淡出，与底下的登录页交叉
 *
 * ⚠️ **这个组件不自己建画布，它接管加载屏那一块。**
 *
 * 加载屏（`build/introBoot.js`，在 React 启动之前就跑）已经把动画层
 * `#scau-intro` 和画布 `#scau-intro-canvas` 建好了 —— 而且**建在 `#root`
 * 外面**，因为 React 挂载时会把 `#root` 的子节点整个替换掉，画布放里面
 * 只会被抹掉，那就又变回"两套画面、中间闪一下"了。
 *
 * 所以这里只做两件事：**接管那批粒子**（从它们此刻的位置接着走，不重来）、
 * **渲染白圆底徽章**（加载屏阶段没有徽章）。加载屏没跑起来时才自己兜底。
 *
 * ⚠️ 时钟从**第一帧真正画出来**才开始走 —— 见下面 start 的说明。
 *
 * 交接为什么能无缝：动画层铺的是**和登录页一模一样的不透明渐变**
 * （LOGIN_GRADIENT，两边共用一个常量），所以底下那一层不需要做任何配合 ——
 * 院徽飞到真实位置后整块淡出即可。
 *
 * ⚠️ 有硬超时兜底。装饰动画无论卡在哪一步，到点必须放行 ——
 * 绝不能把人挡在登录页外面。
 */

const EMBLEM_SRC = emblemSrc(import.meta.env.BASE_URL);

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
     * 这个徽章在固定全屏的动画层里，所以写 `padding: 10%` 在 1200px 宽的屏上
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
  const shellRef = useRef<HTMLDivElement>(null);
  const badgeRef = useRef<HTMLDivElement>(null);
  const badgeImgRef = useRef<HTMLImageElement>(null);
  /** 用 ref 存回调，避免父组件每次重渲染都重启动画 */
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const shell = shellRef.current;
    const badge = badgeRef.current;
    const badgeImg = badgeImgRef.current;
    if (!shell || !badge || !badgeImg) {
      onDoneRef.current();
      return;
    }

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      onDoneRef.current();
    };

    /**
     * 动画层。优先用加载屏建好的那一个（正常情况），
     * 拿不到才自己兜底建一个 —— 绝不能因为加载屏没跑起来就整个不出动画。
     */
    let layer = document.getElementById('scau-intro');
    let canvas = layer?.querySelector('canvas') as HTMLCanvasElement | null;
    if (!layer || !canvas) {
      layer = document.createElement('div');
      layer.id = 'scau-intro';
      layer.setAttribute(
        'style',
        `position:fixed;inset:0;z-index:200;pointer-events:auto;background:${LOGIN_GRADIENT};`,
      );
      canvas = document.createElement('canvas');
      canvas.id = 'scau-intro-canvas';
      canvas.setAttribute('style', 'position:absolute;inset:0;width:100%;height:100%');
      layer.appendChild(canvas);
      document.body.appendChild(layer);
    }
    const layerEl = layer;

    /** 收尾：整个动画层淡出，让底下的登录页透出来，然后再摘掉自己 */
    const handoff = () => {
      if (finished) return;
      const tr = `opacity ${HANDOFF_MS}ms ease-out`;
      layerEl.style.transition = tr;
      layerEl.style.opacity = '0';
      shell.style.transition = tr;
      shell.style.opacity = '0';
      window.setTimeout(() => {
        // 这一层不是 React 管的（它建在 #root 外面），得手动摘
        layerEl.remove();
        finish();
      }, HANDOFF_MS);
    };

    /**
     * 兜底：不管动画走到哪，到点就放行。
     *
     * ⚠️ 这里是**可变绑定**，不是常量 —— 第一帧真正画出来时会重新计时
     * （见下面 frame 里）。最初这一次仍然要留着：万一院徽图一直加载不出来，
     * 得有人在后面把人放进去。
     */
    let failsafe = window.setTimeout(finish, FAILSAFE_MS);

    // 用户在系统里关了动画 —— 尊重这个设置，直接进登录页。
    // 加载屏那边看到同样的设置，也不会去画粒子。
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      window.clearTimeout(failsafe);
      layerEl.remove();
      finish();
      return;
    }

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) {
      window.clearTimeout(failsafe);
      layerEl.remove();
      finish();
      return;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = window.innerWidth;
    let H = window.innerHeight;

    const resize = () => {
      W = window.innerWidth;
      H = window.innerHeight;
      canvas!.width = W * dpr;
      canvas!.height = H * dpr;
      canvas!.style.width = `${W}px`;
      canvas!.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const updateImage = makeBadgeUpdater(badge, badgeImg);
    let particles: Particle[] = [];
    let layout: Layout = { left: 0, top: 0, w: 0, h: 0 };
    /** 粒子是不是从加载屏那儿接管过来的（接管的话位置已经被固化过了） */
    let adopted = false;

    /**
     * ⭐ 接管加载屏的粒子。
     *
     * `detach()` 会把每颗粒子**此刻飘到的位置**写回它的 sx/sy，
     * 所以下面那套汇聚逻辑（本来就只知道 sx/sy）拿过来就能直接用 ——
     * 粒子从"飘着的位置"接着往院徽收，中间没有任何一帧是跳变的。
     */
    const boot = window.__SCAU_INTRO_BOOT__;
    if (boot && boot.particles && boot.particles.length > 0) {
      const taken = boot.detach();
      particles = taken.particles;
      layout = taken.layout;
      adopted = true;
    }

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

    /**
     * 动画时钟的起点。**故意不在这里取**，留到第一帧才取。
     *
     * 第一帧要等院徽图下载 + 解码 + 点阵采样完才画得出来，实测国内连
     * GitHub Pages 拿那张 79KB 的院徽图要 0.4~1.5 秒；而"汇聚"整段总共才
     * 1.6 秒。时钟要是从 effect 这里就开始走，这段时间动画全在空转 ——
     * 实测最多有 **94% 的汇聚过程被凭空跳掉**，水滴直接出现在半路上，
     * 看着就是"卡"了一下。让时钟跟着第一帧起步，这一段一点都不丢。
     *
     * 判断成 -1 而不是 0：RAF 给的时间戳有可能很接近 0，用 0 当哨兵会误判。
     */
    let start = -1;

    const frame = (now: number) => {
      if (cancelled) return;

      if (start < 0) {
        start = now;
        // 动画总时长从这一帧算起，兜底时间跟着往后挪
        window.clearTimeout(failsafe);
        failsafe = window.setTimeout(finish, FAILSAFE_MS);
      }

      const t = now - start;

      /**
       * 白圆当前半径。
       *
       * 显影阶段的整个观感都靠这一条：白圆从中心往外漫，漫过的地方
       * 黑院徽显形、粒子退场。深蓝底上的白色粒子和黑院徽本来是两种颜色，
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

    if (adopted) {
      // 接管成功：粒子已经在画布上飘着了，直接开跑。
      // 注意这里**不重画背景**，也不重建粒子 —— 重来一次就是"闪一下"。
      updateImage(layout, 0, MAX_BLUR, 1.04, 0);
      raf = requestAnimationFrame(frame);
    } else {
      // 兜底：加载屏没跑起来（图挂了、被禁用等），自己补一套
      void (async () => {
        try {
          const sampleW = window.matchMedia('(max-width: 768px)').matches
            ? SAMPLE_W_MOBILE
            : SAMPLE_W_DESKTOP;
          const { pts, h } = await sampleEmblem(EMBLEM_SRC, sampleW);
          if (cancelled) return;

          const built = buildParticles(pts, sampleW, h, W, H);
          particles = built.particles;
          layout = built.layout;

          if (particles.length === 0) {
            window.clearTimeout(failsafe);
            layerEl.remove();
            finish();
            return;
          }

          updateImage(layout, 0, MAX_BLUR, 1.04, 0);
          raf = requestAnimationFrame(frame);
        } catch {
          // 图加载失败、canvas 被污染……任何异常都不能把人挡在登录页外
          window.clearTimeout(failsafe);
          layerEl.remove();
          finish();
        }
      })();
    }

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(failsafe);
      window.removeEventListener('resize', resize);

      /**
       * ⚠️ 动画被中途打断（组件卸载）时，这一层必须摘掉。
       *
       * 它建在 `#root` 外面、不是 React 管的，没人会替我们收拾；
       * 留着的话就是一层渐变 + 粒子永远盖在应用上面，而且
       * pointer-events 是 auto —— **整个页面点都点不动**。
       * 正常播完的路径上它已经自己摘过了，这里是幂等的。
       */
      layerEl.remove();
    };
  }, []);

  return (
    /*
      ⚠️ 这一层是**透明的**，只装白圆底徽章。
      渐变和画布都由加载屏建的 `#scau-intro` 提供（它在下面一层，z-index 200），
      所以这里要盖在它上面（201），而且不能有自己的背景 —— 有背景就等于
      把粒子那层盖住了。
    */
    <div
      ref={shellRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 201,
        // 挡住点击，免得动画期间点到底下还没露出来的登录控件
        pointerEvents: 'auto',
      }}
    >
      {/*
        ⚠️ 院徽外面必须垫白色圆底。

        院徽图本身是**黑色镂空透明底**的，直接摆在深蓝背景上对比度极低，
        糊成一团灰。登录页正是因为这个问题才用白圆底衬着（侧边栏也一样）。

        内边距由 makeBadgeUpdater 按尺寸算成 px（见那里的说明）。
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
