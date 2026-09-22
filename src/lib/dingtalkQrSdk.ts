/**
 * 桌面端内嵌二维码登录 —— 钉钉 DTFrameLogin 的封装。
 *
 * 只负责"把二维码画进容器里"这一件事：脚本加载、初始化、回调去重。
 * 状态机（加载中/就绪/交换中/报错）和换会话都在登录组件里。
 *
 * ⚠️ 手机端**不用这个模块**，手机上扫不了自己屏幕上的码 ——
 * 那条路见 dingtalkRedirect.ts。
 */

import { DINGTALK_CLIENT_ID, DINGTALK_SDK_URL, dingtalkRedirectUri } from './dingtalk';

export interface DTLoginResult {
  redirectUrl: string;
  authCode: string;
  state?: string;
}

declare global {
  interface Window {
    DTFrameLogin?: (
      frameParams: { id: string; width?: number; height?: number },
      loginParams: Record<string, string>,
      successCbk: (result: DTLoginResult) => void,
      errorCbk?: (errorMsg: string) => void,
    ) => void;
  }
}

/**
 * ⚠️ 已消费过的 authCode，模块级存。
 *
 * 两个原因必须放在模块级而不是组件里：
 *   1. 钉钉这个 SDK 有**重复触发回调**的已知问题（内部反复添加 message 监听）
 *   2. 登录页切到别的入口再切回来会重新挂载组件，旧的监听器还在
 * authCode 是一次性的，被消费第二次必然失败 —— 那会把一次本来成功的登录
 * 变成一条吓人的报错。所以在最外层拦掉。
 */
const consumedAuthCodes = new Set<string>();

/** 这个授权码是不是第一次见。false 表示重复回调，调用方应当直接忽略 */
export function isFreshAuthCode(authCode: string): boolean {
  if (consumedAuthCodes.has(authCode)) return false;
  consumedAuthCodes.add(authCode);
  return true;
}

/** 脚本只加载一次；并发挂载共用同一个 Promise */
let sdkPromise: Promise<void> | null = null;

function loadSdk(): Promise<void> {
  if (window.DTFrameLogin) return Promise.resolve();
  if (!sdkPromise) {
    sdkPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = DINGTALK_SDK_URL;
      script.onload = () => resolve();
      script.onerror = () => {
        sdkPromise = null; // 允许重试
        reject(new Error('钉钉登录组件加载失败，请检查网络后重试'));
      };
      document.body.appendChild(script);
    });
  }
  return sdkPromise;
}

/**
 * 把二维码画进容器。
 *
 * ⚠️ 失败一律走 onError，不往外抛 —— 调用方那边是个 await，
 * 抛出去会和"画成功了"走同一条 catch，分不清是哪种失败。
 *
 * @returns true = 二维码已经交出去了；false = 失败，onError 已被调用
 */
export async function mountQrLogin(params: {
  containerId: string;
  state: string;
  onSuccess: (result: DTLoginResult) => void;
  onError: (message: string) => void;
}): Promise<boolean> {
  const { containerId, state, onSuccess, onError } = params;

  try {
    await loadSdk();

    if (typeof window.DTFrameLogin !== 'function') {
      throw new Error('钉钉登录组件未能正确初始化');
    }

    window.DTFrameLogin(
      { id: containerId, width: 280, height: 280 },
      {
        // redirect_uri 必须 encodeURIComponent 后再传
        redirect_uri: encodeURIComponent(dingtalkRedirectUri()),
        client_id: DINGTALK_CLIENT_ID,
        scope: 'openid',
        response_type: 'code',
        prompt: 'consent',
        state,
      },
      onSuccess,
      (errMsg) => onError(errMsg || '钉钉扫码失败'),
    );

    return true;
  } catch (e) {
    onError(e instanceof Error ? e.message : String(e));
    return false;
  }
}
