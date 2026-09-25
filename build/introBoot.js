/**
 * 加载屏的粒子漂浮 —— 在 React 启动之前就跑起来。
 *
 * ⚠️ 它不是"另一个加载动画"，而是**入场动画的前半段**。
 *
 * 以前加载屏是「深蓝底 + 徽章 + 转圈」，等 React 挂载时整块被替换掉，
 * 然后动画的粒子才从屏幕外飞进来 —— 中间那一下"东西消失 → 一片空 →
 * 粒子出现"就是用户说的闪现。两套互不相干的画面，怎么调都接不上。
 *
 * 现在改成：粒子**一开始就在**，只是松散地飘着；React 起来之后由
 * WaterIntro **接管这批粒子**（同一批！），从它们此刻的位置开始汇聚。
 * 全程一张画布、一批粒子、一条时间线，没有"换画面"那一帧。
 *
 * ⚠️ 粒子的数学全部来自 SCAU_INTRO_MATH —— 就是 WaterIntro 用的那一份
 * （src/lib/introParticles.ts，构建时被 esbuild 转成 IIFE 内联进来）。
 * **这里绝对不许自己抄一遍常量**，否则交接处粒径/颜色/位置必对不上。
 *
 * 这个文件是**纯 JS**，不参与打包，由 vite.config.ts 原样读进来内联。
 * 用 ES5 写（var / function），因为它要在最老的手机上跑，而且没有编译步骤。
 */
(function () {
  var M = window.SCAU_INTRO_MATH;
  if (!M) return;

  // 用户系统里关了动画 —— 只铺渐变，一颗粒子都不画。
  // WaterIntro 那边会看到同样的设置并直接跳过，两边一致。
  var reduceMotion = false;
  try {
    reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) {
    /* 拿不到就当没关 */
  }

  /**
   * 入场动画的层。
   *
   * ⚠️ **必须在 `#root` 外面**。React 挂载时 createRoot().render() 会把
   * `#root` 的子节点全部替换掉 —— 画布放里面的话，React 一起来就被抹了，
   * 那样又变成"两套画面"。放外面它才能一直活着，被接管而不是被替换。
   */
  var layer = document.getElementById('scau-intro');
  var canvas;
  if (!layer) {
    layer = document.createElement('div');
    layer.id = 'scau-intro';
    layer.setAttribute(
      'style',
      'position:fixed;inset:0;z-index:200;pointer-events:none;background:' +
        window.SCAU_LOGIN_GRADIENT +
        ';',
    );
    canvas = document.createElement('canvas');
    canvas.id = 'scau-intro-canvas';
    canvas.setAttribute('style', 'position:absolute;inset:0;width:100%;height:100%');
    layer.appendChild(canvas);
    // 塞到 body 最后，盖在 #root 上面
    document.body.appendChild(layer);
  } else {
    canvas = layer.querySelector('canvas');
  }
  if (!canvas) return;

  var ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return;

  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var W = window.innerWidth;
  var H = window.innerHeight;

  var resize = function () {
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();

  var particles = [];
  var layout = { left: 0, top: 0, w: 0, h: 0 };
  var raf = 0;
  var stopped = false;
  var start = -1;
  var elapsed = 0;

  /** 对外交给 WaterIntro 的把手 */
  var handle = {
    layer: layer,
    canvas: canvas,
    ctx: ctx,
    particles: particles,
    layout: layout,
    dpr: dpr,
    width: W,
    height: H,
    /**
     * WaterIntro 接管时调用。
     *
     * 除了停掉循环，还要做一件关键的事：**把每颗粒子"此刻飘到哪了"写回
     * sx/sy**。动画的汇聚是从 sx/sy 出发的，固化之后它就从粒子现在的
     * 位置接着走 —— 屏幕上不会看到任何一跳。
     *
     * ⚠️ 用 M.driftPosition 取位置，和上面画画用的是同一个公式。
     *    各写一遍的话，交接那一帧粒子会整体跳一下。
     */
    detached: false,
    detach: function () {
      stopped = true;
      handle.detached = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      window.removeEventListener('resize', onResize);

      for (var i = 0; i < particles.length; i++) {
        var pos = M.driftPosition(particles[i], i, elapsed);
        particles[i].sx = pos.x;
        particles[i].sy = pos.y;
        // ⚠️ 透明度也要固化。汇聚是从 a0 插值到 1 的，不记的话接管那一刻
        //    粒子会从 0 重新淡入 —— 屏幕上就是"满屏粒子先消失再淡回来"。
        particles[i].a0 = M.driftAlpha(i, elapsed);
        // ⚠️ 延迟必须清零。delay 本来是给"从屏幕外飞入"做先后感的，
        //    没过延迟的粒子在汇聚里【根本不画】。飘着的时候全都看得见，
        //    不清零的话一接管就集体隐身（实测帧差异从 0.8 跳到 12.7）。
        particles[i].delay = 0;
      }
      return {
        layer: layer,
        canvas: canvas,
        ctx: ctx,
        particles: particles,
        layout: layout,
        dpr: dpr,
      };
    },
  };
  window.__SCAU_INTRO_BOOT__ = handle;

  if (reduceMotion) return; // 不画粒子，交给 WaterIntro 直接跳过

  var frame = function (now) {
    if (stopped) return;
    if (start < 0) start = now;
    elapsed = now - start;
    M.drawDrift(ctx, particles, elapsed, W, H);
    raf = requestAnimationFrame(frame);
  };

  // 采样院徽 → 建粒子 → 开始飘
  var isMobile = W <= 768;
  var sampleW = isMobile ? M.SAMPLE_W_MOBILE : M.SAMPLE_W_DESKTOP;

  M.sampleEmblem(M.emblemSrc(window.SCAU_BASE), sampleW)
    .then(function (res) {
      if (stopped) return;
      var built = M.buildParticles(res.pts, sampleW, res.h, W, H);
      if (!built.particles.length) return; // 采样不出东西就只留渐变

      // ⚠️ 把数组**内容**搬进 handle.particles，不是改 handle 的指向 ——
      //    WaterIntro 拿到的必须是同一个数组对象，否则它接管的是个空数组。
      for (var i = 0; i < built.particles.length; i++) {
        particles.push(built.particles[i]);
      }
      layout.left = built.layout.left;
      layout.top = built.layout.top;
      layout.w = built.layout.w;
      layout.h = built.layout.h;

      raf = requestAnimationFrame(frame);
    })
    .catch(function () {
      /* 图挂了就只留渐变，绝不让加载屏把人挡住 */
    });

  // 尺寸变了粒子位置就不对了；接管之后由 WaterIntro 自己管这件事
  function onResize() {
    if (stopped) return;
    resize();
    handle.width = W;
    handle.height = H;
  }
  window.addEventListener('resize', onResize);
})();
