/**
 * 登录态的空闲过期 —— 「2 小时没操作就失效」。
 *
 * ⚠️ 这不是「关掉浏览器就失效」。浏览器没有现成 API 能区分
 * 「浏览器被关了」和「标签页在后台挂着」，要做后者只能上心跳方案，
 * 而心跳有一个绕不开的模糊窗口（Chrome 把后台标签的定时器节流到
 * 一分钟一次，阈值必须大于一分钟，于是「关掉后一分钟内重开」会漏判）。
 * 权衡后选择了简单、行为可预测的定时过期。
 *
 * 实现要点：活动时间戳只在**真实用户操作**时更新，
 * 不能挂在 supabase-js 的自动续期上 —— 那个是无感的，会让过期永不触发。
 */

/** 最后一次真实操作的时间戳 */
const ACTIVITY_KEY = 'scau_last_activity';

/** 空闲多久算失效 */
const IDLE_MS = 2 * 60 * 60 * 1000;

/** 活动写入的节流间隔 —— 鼠标滚一下不该写一次 localStorage */
const TOUCH_THROTTLE_MS = 30_000;

export function touchActivity(): void {
  try {
    localStorage.setItem(ACTIVITY_KEY, String(Date.now()));
  } catch {
    /* 隐私模式下 localStorage 可能不可写，忽略即可 —— 退化成不过期 */
  }
}

export function clearActivity(): void {
  try {
    localStorage.removeItem(ACTIVITY_KEY);
  } catch {
    /* 同上 */
  }
}

/**
 * 是否已空闲过期。
 * 没有记录时返回 false：首次访问不该被判成过期，否则永远登不进去。
 */
export function isIdleExpired(): boolean {
  try {
    const raw = localStorage.getItem(ACTIVITY_KEY);
    if (!raw) return false;
    const last = Number(raw);
    if (!Number.isFinite(last)) return false;
    return Date.now() - last > IDLE_MS;
  } catch {
    return false;
  }
}

/**
 * 开始跟踪用户活动。返回一个取消函数。
 *
 * 只监听这几类事件，且全部是被动监听（passive），不影响滚动性能。
 * 用 pointerdown 而不是 click —— 前者更早触发，且覆盖触屏。
 */
export function startActivityTracking(): () => void {
  touchActivity(); // 进入页面本身算一次活动

  let lastTouch = 0;
  const onActivity = () => {
    const now = Date.now();
    if (now - lastTouch < TOUCH_THROTTLE_MS) return;
    lastTouch = now;
    touchActivity();
  };

  const events: (keyof WindowEventMap)[] = ['pointerdown', 'keydown', 'wheel', 'scroll'];

  for (const evt of events) {
    window.addEventListener(evt, onActivity, { passive: true });
  }

  // visibilitychange 挂的是 document，不是 window —— 从别的标签切回来也算一次活动
  document.addEventListener('visibilitychange', onActivity);

  return () => {
    for (const evt of events) {
      window.removeEventListener(evt, onActivity);
    }
    document.removeEventListener('visibilitychange', onActivity);
  };
}
