import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json';
import { LOGIN_GRADIENT } from './src/theme';

/**
 * 首屏加载页 + 资源预热。
 *
 * 背景：同学点开链接到能填表要 16 秒 —— 前面 9 秒是白屏（浏览器在等
 * 1.9MB 的 JS 下载+解析），后面 6.6 秒是入场动画。动画一秒不删（那是
 * 刻意保留的设计），但**那 6.6 秒里链路是闲着的**，正好拿来把下一步
 * 要用的东西先下好。
 *
 * ⚠️ 铁律：**这里只准"下载"，不准"执行"。**
 * 项目踩过这个坑 —— 钉钉 SDK 曾经在动画期间挂载，它异步拉起的第二波活儿
 * 占了主线程 74~83ms，用户原话「粒子一开始汇聚不卡，到一个地方猛卡一下」。
 * 所以下面用的是 `rel="prefetch"`（浏览器只存进缓存，不解析不执行），
 * 而不是 `rel="modulepreload"`（那个会当场编译，正好会卡）。
 *
 * 顺带解决白屏：`index.html` 里先铺一块和登录页**同一个渐变**的加载屏，
 * 浏览器一拿到 HTML 立刻就有东西看。渐变从 src/theme.ts 读 ——
 * 那文件顶上写着「两边各写一遍渐变字符串，交接瞬间就会出现一道色差」，
 * 所以这里绝不手抄。
 */
function bootScreenPlugin(base: string, backendOrigin: string | null): Plugin {
  /**
   * 预热清单：
   * - 所有懒加载的页面分块（每个都只有几 KB，很便宜）
   * - recharts（367 KB）—— 同学填完表进去第一眼就是仪表盘，图表库就等它
   *
   * ⚠️ **xlsx（429 KB）必须排除**。它虽然也是动态引入（导 Excel 时用），
   * 但那是管理员偶尔才碰的东西，来借东西的同学一辈子用不到。
   * 实测第一版漏了这条，白白多下 429 KB，把带宽从同学要用的资源上分走。
   *
   * 合计预热 ~417 KB（recharts 367 + 各页面分块 ~50），
   * 摊在「入场动画 + 填表」这段本来闲置的时间里。
   */
  const PREFETCH_EXCLUDE = new Set(['xlsx']);
  const shouldPrefetch = (name: string, isDynamicEntry: boolean) =>
    !PREFETCH_EXCLUDE.has(name) && (isDynamicEntry || name === 'recharts');

  return {
    name: 'scau-boot-screen',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const bundle = ctx.bundle ?? {};
        const links = Object.values(bundle)
          .filter((c) => c.type === 'chunk' && shouldPrefetch(c.name, c.isDynamicEntry))
          .map((c) => `<link rel="prefetch" as="script" href="${base}${c.fileName}">`);

        // 提前和后端握手 —— 省下 DNS+TCP+TLS 三个往返。
        // 国内到反代那一跳实测首字节 0.4~1.3 秒，能提前就提前。
        if (backendOrigin) {
          links.unshift(`<link rel="preconnect" href="${backendOrigin}" crossorigin>`);
        }

        const head = [
          `<style>${bootScreenCss()}</style>`,
          ...links.map((l) => '    ' + l),
        ].join('\n');

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
