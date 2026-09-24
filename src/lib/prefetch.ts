/**
 * 页面分块预热。
 *
 * 页面是 React.lazy 懒加载的，首次切换路由时才去下载对应分块，
 * 会先闪一下 Suspense 的 loading 圈 —— 转场动画再顺也会被这一下打断。
 * 首屏稳定后在浏览器空闲时把其余页面分块悄悄下好。
 */

type Loader = () => Promise<unknown>;

const PAGE_LOADERS: Loader[] = [
  () => import('../pages/DashboardPage'),
  () => import('../pages/ItemListPage'),
  () => import('../pages/ItemFormPage'),
  () => import('../pages/BorrowPage'),
  () => import('../pages/RecordsPage'),
  () => import('../pages/DingTalkPage'),
  () => import('../pages/ReturnPage'),
  () => import('../pages/SettingsPage'),
  () => import('../pages/NotFoundPage'),
];

/** 逐个预热页面分块。失败不影响功能 —— 真正访问时会重新加载。 */
export function prefetchPages(): void {
  for (const load of PAGE_LOADERS) {
    load().catch(() => {
      /* 静默忽略：预热失败不影响任何功能 */
    });
  }
}

/**
 * 在浏览器空闲时预热页面分块。
 *
 * 刻意不立即执行：首屏还要拉 Supabase 数据（实测 3~7 秒），
 * 此时下载约 1.3MB 的分块会和它抢那条又慢又窄的国际链路。
 *
 * @param timeoutMs requestIdleCallback 的最长等待时间，超时后强制执行
 */
export function schedulePrefetch(timeoutMs = 4000): void {
  if (typeof window === 'undefined') return;

  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(() => prefetchPages(), { timeout: timeoutMs });
  } else {
    window.setTimeout(prefetchPages, timeoutMs);
  }
}

declare global {
  interface Window {
    /** 构建时注入的预热清单（见 vite.config.ts 的 bootScreenPlugin） */
    __SCAU_PREFETCH__?: string[];
  }
}

/**
 * 首屏之后的资源预热 —— **只下载，不执行**。
 *
 * 和上面 `schedulePrefetch` 的区别：
 *   - 那个用 `import()`，会**真的执行**模块（占用主线程）
 *   - 这个只建 `<link rel="prefetch">`，浏览器存进缓存就完事，不解析不执行
 * 所以这个能在「入场动画正在放」的时候跑，而不会把动画卡住。
 *
 * ⚠️⚠️ **必须在 React 挂载之后才调用**，不能挪到 index.html 里去。
 * 2026-09-24 踩过：第一版把清单直接写成 HTML 里的 link 标签，以为浏览器会
 * 推迟到页面加载完再下 —— **不会**。它立刻和首屏资源抢同一条连接，实测
 * 首屏被拖慢 4.8 秒（有预热 17509ms vs 掐掉 12690ms）。
 * 用户原话「加载时间感觉更长了，根本没有刚做好反代的时候快」。
 *
 * 名字里的 link 是指 link 标签，别理解成别的。
 */
export function scheduleLinkPrefetch(timeoutMs = 2000): void {
  if (typeof window === 'undefined') return;

  const files = window.__SCAU_PREFETCH__;
  if (!files || files.length === 0) return;

  const run = () => {
    for (const href of files) {
      const link = document.createElement('link');
      link.rel = 'prefetch';
      link.as = 'script';
      link.href = href;
      document.head.appendChild(link);
    }
  };

  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(run, { timeout: timeoutMs });
  } else {
    window.setTimeout(run, 600);
  }
}
