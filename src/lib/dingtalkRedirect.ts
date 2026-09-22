/**
 * 手机端的钉钉跳转授权（网页免登）。
 *
 * 桌面端走 DTFrameLogin 的内嵌二维码，**手机端扫不了自己屏幕上的码** ——
 * 钉钉这个 SDK 也不做移动端适配（2026-09-22 实测：手机和桌面请求的是同一个
 * URL，只有 state 不同）。所以手机上换一条路：整页跳到钉钉授权页，唤起钉钉
 * App 完成授权，钉钉再带着 authCode 跳回本站。
 *
 * 完整链路：
 *   点按钮 → 存 state → 跳 login.dingtalk.com/oauth2/auth
 *   → 用户授权 → 跳回 站点根路径?authCode=xxx&state=xxx
 *   → main.tsx 在 React 渲染前截住（见 captureDingTalkCallback）
 *   → 登录页取出来调 Edge Function 换会话
 *
 * ⚠️ 回跳参数按官方文档核对过（「实现网页方式登录应用」）：
 *   成功 `?authCode=xxx&state=xxx`，失败 `?error=xxx&state=xxx`。
 *   文档另注明 code 与 authCode 相同、取任一即可，所以两个名字都接。
 *
 * ⚠️ 真实授权只能拿手机走一遍，AI 无法自测这段链路。
 */

import { DINGTALK_CLIENT_ID, dingtalkRedirectUri } from './dingtalk';

/** 钉钉授权页。参数与 DTFrameLogin 内嵌二维码同一套，区别只是不带 iframe=true */
const AUTH_URL = 'https://login.dingtalk.com/oauth2/auth';

/** 跳走之前存下的 state */
const STATE_KEY = 'scau_dt_state';
/** 回跳带回来的授权结果 */
const CALLBACK_KEY = 'scau_dt_callback';

/** 授权码 5 分钟失效。状态存太久只会让人对着一句莫名其妙的报错发呆 */
const STALE_MS = 10 * 60 * 1000;

export interface StashedCallback {
  authCode?: string;
  error?: string;
  state?: string;
  /** 记下时间，用来丢掉上一轮遗留的陈旧结果 */
  at: number;
}

// ────────────────────────────────────────────── 手机判定

/**
 * 是不是**手机**（不是"小屏"）。
 *
 * ⚠️ 这是**设备能力**判断，不是视口宽度判断 —— 两者的区别见项目里那条
 * 响应式约定。依据很直接：手机**扫不了自己屏幕上的码**，所以手机必须走跳转
 * 授权；平板可以（拿另一台手机扫），所以 iPad / 安卓平板**保持二维码**。
 *
 * 安卓手机和平板的 UA 差别就在那个 Mobile：手机有，平板没有。
 * iPad 从 iPadOS 13 起 UA 直接写 "Macintosh"，天然落进平板那一档。
 *
 * ⚠️ 所以拿"把浏览器窗口拖窄"来测这个分支是**测不出来**的，得开 F12 的
 * 设备模拟或者上真机。
 */
export function isPhone(): boolean {
  const ua = navigator.userAgent;
  if (/iPhone|iPod|Windows Phone/i.test(ua)) return true;
  if (/Android/i.test(ua) && /Mobile/i.test(ua)) return true;
  if (/HarmonyOS/i.test(ua) && /Mobile/i.test(ua)) return true;
  return false;
}

// ────────────────────────────────────────────── 跨标签页的小存储

/** 两个都写、两个都读，见 rememberPendingState 的说明 */
function bothStores(): Storage[] {
  const list: Storage[] = [];
  try {
    list.push(window.sessionStorage);
  } catch {
    /* 隐私模式下访问 sessionStorage 本身就可能抛 */
  }
  try {
    list.push(window.localStorage);
  } catch {
    /* 同上 */
  }
  return list;
}

// ────────────────────────────────────────────── 出发前

/** 每次授权都新生成一个，钉钉会原样回传，用来确认这次回跳是自己发起的 */
export function newState(): string {
  return `scau-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * 记下这次发起授权的 state。
 *
 * ⚠️ sessionStorage 和 localStorage 都要写。
 * sessionStorage 按标签页隔离，正常情况够用；但钉钉在手机上会把授权页唤起成
 * App，回来时**可能换一个标签页甚至换一个浏览器容器**（钉钉内置 webview 而不是
 * 原来的 Safari），那时 sessionStorage 就空了。localStorage 是同一来源共享的，
 * 能兜住这一层。两个都兜不住的极端情况会走"登录状态已失效"的提示，
 * 再点一次即可 —— 那一次的回跳一定落在同一个容器里。
 */
export function rememberPendingState(state: string): void {
  const payload = JSON.stringify({ state, at: Date.now() });
  for (const store of bothStores()) {
    try {
      store.setItem(STATE_KEY, payload);
    } catch {
      /* 写不了就算了，顶多走到"登录状态已失效"那一步 */
    }
  }
}

/** 取出并清掉发起时存的 state。没有、或已过期，都返回 null */
export function takePendingState(): string | null {
  let found: string | null = null;

  for (const store of bothStores()) {
    try {
      const raw = store.getItem(STATE_KEY);
      if (raw === null) continue;
      // 读到一个就清一个，两个存储不留残渣
      store.removeItem(STATE_KEY);

      if (found !== null) continue;
      const parsed = JSON.parse(raw) as { state?: unknown; at?: unknown };
      if (typeof parsed?.state !== 'string') continue;
      if (typeof parsed.at === 'number' && Date.now() - parsed.at > STALE_MS) continue;
      found = parsed.state;
    } catch {
      /* 存储里的内容可能是用户手改的，解析失败一律当作没有 */
    }
  }

  return found;
}

/** 拼出要跳过去的授权地址。URLSearchParams 会顺手把 redirect_uri 编码掉 */
export function buildDingTalkAuthUrl(state: string): string {
  const params = new URLSearchParams({
    redirect_uri: dingtalkRedirectUri(),
    response_type: 'code',
    client_id: DINGTALK_CLIENT_ID,
    scope: 'openid',
    state,
    prompt: 'consent',
  });
  return `${AUTH_URL}?${params.toString()}`;
}

// ────────────────────────────────────────────── 回跳之后

/**
 * 在 **React 渲染之前**把回跳带回来的参数抓走。
 *
 * ⚠️ 这一步必须在 main.tsx 里、createRoot 之前调，不能改成在组件里读
 * `useSearchParams`。回跳落在站点根路径 `/`，而未登录时 RouteGuard 会
 * `<Navigate to="/login" replace />` —— 查询参数在这一跳**被整个丢掉**，
 * 等登录页挂载出来时地址栏里已经没有 authCode 了。
 *
 * 顺带把参数从地址栏抹掉：authCode 是凭据，留在 URL 里会进浏览器历史，
 * 也会随 Referer 发给钉钉 SDK 所在的阿里 CDN。
 */
export function captureDingTalkCallback(): void {
  let url: URL;
  try {
    url = new URL(window.location.href);
  } catch {
    return;
  }

  const authCode = url.searchParams.get('authCode') ?? url.searchParams.get('code');
  const error = url.searchParams.get('error');
  if (!authCode && !error) return;

  const payload: StashedCallback = {
    authCode: authCode ?? undefined,
    error: error ?? undefined,
    state: url.searchParams.get('state') ?? undefined,
    at: Date.now(),
  };

  try {
    // 同一个页面里写、同一个页面里读，sessionStorage 就够
    window.sessionStorage.setItem(CALLBACK_KEY, JSON.stringify(payload));
  } catch {
    /* 写不进去就当没有回跳，用户再点一次即可 */
  }

  for (const key of ['authCode', 'code', 'error', 'state']) {
    url.searchParams.delete(key);
  }
  window.history.replaceState(null, '', url.pathname + url.search + url.hash);
}

/** 读出回跳结果。consume 决定读完是否清掉 */
function readStashedCallback(consume: boolean): StashedCallback | null {
  let raw: string | null = null;
  try {
    raw = window.sessionStorage.getItem(CALLBACK_KEY);
    if (raw !== null && consume) window.sessionStorage.removeItem(CALLBACK_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;

  try {
    const parsed = JSON.parse(raw) as StashedCallback;
    if (Date.now() - parsed.at > STALE_MS) return null;
    if (!parsed.authCode && !parsed.error) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * 有没有等着处理的回跳结果（只看不消费）。
 *
 * 登录页拿它决定默认落在哪个页签 —— 见 LoginPage 里那条说明：
 * 钉钉面板是懒挂载的，不主动切过去，回跳的授权码就永远没人消费，
 * 用户看到的是「授权完跳回来，什么都没发生」。
 */
export function peekStashedCallback(): StashedCallback | null {
  return readStashedCallback(false);
}

/** 取出并清掉回跳结果。没有、或已过期，都返回 null */
export function takeStashedCallback(): StashedCallback | null {
  return readStashedCallback(true);
}
