import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json';
import { LOGIN_GRADIENT } from './src/theme';

/**
 * 首屏加载屏。
 *
 * 背景：同学点开链接到能填表要十几秒，前面那段浏览器在等 1.9MB 的 JS
 * 下载+解析，屏幕上什么都没有。这里在 `index.html` 里先铺一块和登录页
 * **同一个渐变**的加载屏（院徽 + 转圈），浏览器一拿到 HTML 立刻就有东西看 ——
 * 实测白屏从 10.2 秒变成 0.8 秒。
 *
 * 渐变从 src/theme.ts 读 —— 那文件顶上写着「两边各写一遍渐变字符串，
 * 交接瞬间就会出现一道色差」，所以这里绝不手抄。
 *
 * ⚠️⚠️ **这个插件里绝对不要再加任何"提前下载"的东西。** 试过两次，两次都
 * 把首屏拖慢了：
 *   - 第一版把 `rel="prefetch"` 标签写进 HTML —— 以为浏览器会推迟到页面
 *     加载完再下，**不会**，它立刻和 antd 那 435KB 抢连接。
 *     实测有预热 17509ms vs 掐掉 12698ms，**拖慢 4.8 秒**。
 *   - 第二版改成挂载后再由 JS 建 link，实测**仍然慢 3978ms**。
 * 两次的对照组都指向同一个结论：这条链路上，任何额外流量都是从同学的
 * 等待时间里抢的。用户原话「加载时间感觉更长了，根本没有刚做好反代的时候快」。
 * 真要再试，**必须先在关掉加速器的环境下做 A/B，并跑够轮数**——
 * 这个网络单次波动能到 2 倍，两轮取平均都不一定够。
 */
function bootScreenPlugin(base: string, backendOrigin: string | null): Plugin {
  return {
    name: 'scau-boot-screen',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const head = [
          `<style>${bootScreenCss()}</style>`,
          // 提前和后端握手 —— 省下 DNS+TCP+TLS 三个往返。
          // 只占一条连接、几乎不吃带宽，所以留在 HTML 里没问题。
          backendOrigin ? `<link rel="preconnect" href="${backendOrigin}" crossorigin>` : '',
        ].filter(Boolean).join('\n    ');

        return html
          .replace('</head>', `  ${head}\n  </head>`)
          .replace('<div id="root"></div>', bootScreenHtml(base));
      },
    },
  };
}

/**
 * 加载屏的样式。
 *
 * ⚠️ 只铺渐变 + 院徽 + 转圈，**不写标题文字** —— 登录页的院徽和标题位置
 * （左对齐于卡片上方）和这里（屏幕正中）对不齐，多写一个字就会看见跳一下。
 * 反正登录页自己会从 opacity:0 淡入，交接是干净的。
 *
 * 渐变走 LOGIN_GRADIENT，和登录页、入场动画覆盖层是同一份。
 */
function bootScreenCss(): string {
  return `
    .scau-boot{position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;
      align-items:center;justify-content:center;background:${LOGIN_GRADIENT}}
    .scau-boot-badge{width:80px;height:80px;box-sizing:border-box;padding:3.2px;
      border-radius:50%;background:#fff;overflow:hidden;display:flex;align-items:center;
      justify-content:center;box-shadow:0 6px 20px rgba(0,0,0,.28)}
    .scau-boot-badge img{width:100%;height:100%;object-fit:contain;display:block}
    .scau-boot-spin{margin-top:26px;width:26px;height:26px;border-radius:50%;
      border:2.5px solid rgba(255,255,255,.25);border-top-color:#fff;
      animation:scau-boot-spin .8s linear infinite}
    @keyframes scau-boot-spin{to{transform:rotate(360deg)}}
    @media (prefers-reduced-motion:reduce){.scau-boot-spin{animation-duration:2.4s}}
  `;
}

/**
 * 加载屏的 DOM。整块塞在 `#root` 里面 —— React 挂载时 `createRoot().render()`
 * 会把 `#root` 的子节点全部替换掉，所以**它自己会消失，不用写任何清理代码**。
 */
function bootScreenHtml(base: string): string {
  return `<div id="root"><div class="scau-boot">
      <div class="scau-boot-badge">
        <img src="${base}images/镂空院徽2_标清.png" alt="" width="240" height="239">
      </div>
      <div class="scau-boot-spin"></div>
    </div></div>`;
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
    plugins: [react(), bootScreenPlugin(base, backendOrigin)],
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
