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

/*
  ⚠️ 2026-09-24 试过又撤掉的：在登录页「提前把下一步要用的资源下好」
  （recharts + 各页面分块，约 417 KB），想利用入场动画那段闲置时间。

  两次都让首屏更慢了 —— 第一次写成 HTML 里的 rel="prefetch"（拖慢 4.8 秒），
  第二次改成挂载后再由 JS 建 link（仍慢约 4 秒）。详见 vite.config.ts
  bootScreenPlugin 顶上的说明。

  根子在于：**这台服务器在国内本来就窄**，任何额外流量都是从同学的等待
  时间里抢的，没有真正"闲置"的带宽可以利用。
*/
