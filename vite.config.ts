import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, transformWithEsbuild, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json';
import { LOGIN_GRADIENT } from './src/theme';

const read = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

/**
 * 入场动画的「加载屏阶段」—— 让粒子在 React 启动之前就在飘。
 *
 * 要解决的问题：以前加载屏是「深蓝底 + 徽章 + 转圈」，等 React 挂载时整块
 * 被替换掉，动画的粒子才从屏幕外飞进来 —— 中间那一下「东西消失 → 一片空 →
 * 粒子出现」就是用户说的闪现。**两套互不相干的画面，怎么调都接不上。**
 *
 * 现在：粒子一开始就在飘，React 起来后由 WaterIntro **接管同一批粒子**，
 * 从它们此刻的位置开始汇聚。全程一张画布、一批粒子、一条时间线。
 *
 * 三件事：
 *   1. 把动画层（渐变 + 画布）直接写进 HTML —— **必须在 `#root` 外面**。
 *      React 挂载时 createRoot().render() 会清空 `#root` 的子节点，
 *      画布放里面的话 React 一起来就被抹掉，又变成两套画面。
 *      写进标记而不是等 JS 创建，是为了第一帧就有东西，中间不留空档。
 *   2. 把 `src/lib/introParticles.ts` 用 esbuild 转成 IIFE 内联进来 ——
 *      这样加载屏和 WaterIntro 用的是**同一份粒子数学**。
 *      ⚠️ 绝对不许在别处再抄一遍常量，两边对不上就是"闪现"。
 *   3. 内联 `build/introBoot.js`（漂浮循环本身）。
 *
 * ⚠️⚠️ **这个插件里不要再加任何"提前下载"的东西。** 试过两次，两次都拖慢首屏：
 *   - 把 `rel="prefetch"` 写进 HTML → 以为浏览器会推迟到加载完再下，**不会**。
 *     实测有预热 17509ms vs 掐掉 12698ms，拖慢 4.8 秒。
 *   - 改成挂载后由 JS 建 link → 实测仍慢约 4 秒。
 * 根子：这台服务器在国内本来就窄，**任何额外流量都是从用户的等待时间里抢的**。
 * 用户原话「加载时间感觉更长了，根本没有刚做好反代的时候快」。
 */
function introBootPlugin(base: string, backendOrigin: string | null): Plugin {
  return {
    name: 'scau-intro-boot',
    transformIndexHtml: {
      order: 'post',
      async handler(html) {
        // 把粒子数学转成浏览器能直接跑的一段自执行代码，挂到全局
        const { code: mathCode } = await transformWithEsbuild(
          read('./src/lib/introParticles.ts'),
          'introParticles.ts',
          { loader: 'ts', format: 'iife', globalName: 'SCAU_INTRO_MATH', minify: true },
        );

        const globals = `<script>window.SCAU_BASE=${JSON.stringify(
          base,
        )};window.SCAU_LOGIN_GRADIENT=${JSON.stringify(LOGIN_GRADIENT)};</script>`;

        const introLayer = `
    <div id="scau-intro" style="position:fixed;inset:0;z-index:200;pointer-events:auto;background:${LOGIN_GRADIENT};">
      <canvas id="scau-intro-canvas" style="position:absolute;inset:0;width:100%;height:100%"></canvas>
    </div>`;

        return html
          .replace(
            '</head>',
            backendOrigin
              ? `  <link rel="preconnect" href="${backendOrigin}" crossorigin>\n  </head>`
              : '  </head>',
          )
          .replace('<div id="root"></div>', `<div id="root"></div>${introLayer}`)
          .replace(
            '</body>',
            `  ${globals}\n  <script>${mathCode}</script>\n  <script>${read(
              './build/introBoot.js',
            )}</script>\n  </body>`,
          );
      },
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // 后端地址形如 https://xxx.netlify.app/sb —— preconnect 只认 origin，取出来
  const backendOrigin = env.VITE_SUPABASE_URL
    ? new URL(env.VITE_SUPABASE_URL).origin
    : null;

  const base = process.env.VITE_DEPLOY_TARGET ? '/' : '/scau-water-inventory/';

  return {
    // 版本号在构建时替换成字面量（不会把整个 package.json 打进客户端包），
    // 页脚用它显示当前版本 —— 以前版本号只活在对话和备份文件夹名里，代码查不到
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    plugins: [react(), introBootPlugin(base, backendOrigin)],
    base,
    server: {
      port: 3000,
      open: true,
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            antd: ['antd', '@ant-design/icons'],
            recharts: ['recharts'],
            framer: ['framer-motion'],
            // xlsx 不列入：它现在由业务代码动态 import，Rollup 会自动分成独立分包，
            // 此处再写一遍是多余的（实测两种写法产物完全一致）
          },
        },
      },
    },
  };
});
