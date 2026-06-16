/** 全局刷新事件名 — 按钮和快捷键触发，hooks 监听 */
export const REFRESH_EVENT = 'app:refresh';

export function triggerRefresh(): void {
  window.dispatchEvent(new CustomEvent(REFRESH_EVENT));
}
