import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Spin, Typography } from 'antd';
import { supabase } from '../../lib/supabase';
import { DINGTALK_CLIENT_ID, DINGTALK_SDK_URL, dingtalkRedirectUri } from '../../lib/dingtalk';

const { Text } = Typography;

interface DTLoginResult {
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

const CONTAINER_ID = 'dingtalk-qr-container';

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
 * 拿 authCode 去换一组可以登录的凭据。
 *
 * 这里刻意用 fetch 而不是 supabase.functions.invoke —— 后者把非 2xx 响应
 * 包成一个 FunctionsHttpError，要看服务端返回的中文错误还得从 context 里刨，
 * 而登录失败时「到底哪一步错了」恰恰是用户最需要看到的。
 */
async function exchangeAuthCode(authCode: string): Promise<{ email: string; password: string }> {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/dingtalk-login`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ authCode }),
  });

  const payload = await res.json().catch(() => null);
  if (!res.ok || !payload?.ok) {
    throw new Error(payload?.error ?? `换取登录凭据失败（HTTP ${res.status}）`);
  }
  return { email: payload.email, password: payload.password };
}

interface Props {
  /** 登录成功（会话已建立）时调用 */
  onLoggedIn: () => void;
}

export default function DingTalkQrLogin({ onLoggedIn }: Props) {
  const [phase, setPhase] = useState<'loading' | 'ready' | 'exchanging' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [attempt, setAttempt] = useState(0);

  const initedRef = useRef(false);
  /** 只防同一次失败：重试按钮会把它复位 */
  const stateRef = useRef('');

  useEffect(() => {
    let alive = true;

    const handle = async (result: DTLoginResult) => {
      const authCode = result?.authCode;
      if (!authCode) return;

      // 一次性校验：state 由我们生成，钉钉原样回传
      if (stateRef.current && result.state && result.state !== stateRef.current) {
        setPhase('error');
        setMessage('登录校验失败（state 不匹配），请重试');
        return;
      }

      if (consumedAuthCodes.has(authCode)) return;
      consumedAuthCodes.add(authCode);

      setPhase('exchanging');
      try {
        const { email, password } = await exchangeAuthCode(authCode);

        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw new Error(`建立会话失败：${error.message}`);

        if (alive) onLoggedIn();
      } catch (e) {
        if (!alive) return;
        setPhase('error');
        setMessage(e instanceof Error ? e.message : String(e));
      }
    };

    const init = async () => {
      if (initedRef.current) return;
      initedRef.current = true;

      try {
        await loadSdk();
        if (!alive) return;

        if (typeof window.DTFrameLogin !== 'function') {
          throw new Error('钉钉登录组件未能正确初始化');
        }

        stateRef.current = `scau-${Math.random().toString(36).slice(2, 12)}`;

        window.DTFrameLogin(
          { id: CONTAINER_ID, width: 280, height: 280 },
          {
            // redirect_uri 必须 encodeURIComponent 后再传
            redirect_uri: encodeURIComponent(dingtalkRedirectUri()),
            client_id: DINGTALK_CLIENT_ID,
            scope: 'openid',
            response_type: 'code',
            prompt: 'consent',
            state: stateRef.current,
          },
          (result) => void handle(result),
          (errMsg) => {
            if (!alive) return;
            setPhase('error');
            setMessage(errMsg || '钉钉扫码失败');
          },
        );

        if (alive) setPhase('ready');
      } catch (e) {
        if (!alive) return;
        setPhase('error');
        setMessage(e instanceof Error ? e.message : String(e));
      }
    };

    void init();

    return () => {
      alive = false;
    };
    // attempt 变化时整个重建（重试）
  }, [attempt, onLoggedIn]);

  const retry = () => {
    initedRef.current = false;
    setMessage('');
    setPhase('loading');
    setAttempt((n) => n + 1);
  };

  return (
    <div style={{ textAlign: 'center' }}>
      {/* 二维码容器必须一直在 DOM 里 —— DTFrameLogin 初始化时就要能找到它 */}
      <div
        id={CONTAINER_ID}
        style={{
          width: 280,
          height: 280,
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#fff',
          borderRadius: 12,
          overflow: 'hidden',
        }}
      >
        {phase === 'loading' && <Spin tip="二维码加载中…" />}
      </div>

      <div style={{ marginTop: 12, minHeight: 44 }}>
        {phase === 'exchanging' && (
          <Text style={{ color: 'rgba(255,255,255,0.85)' }}>
            <Spin size="small" /> 正在验证身份…
          </Text>
        )}

        {phase === 'ready' && (
          <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13 }}>
            请用<strong style={{ color: '#fff' }}>学院钉钉</strong>扫码登录
            <br />
            <span style={{ fontSize: 12 }}>
              仅限本院钉钉组织成员，外部人员请用左侧「我来借东西」
            </span>
          </Text>
        )}

        {phase === 'error' && (
          <div style={{ textAlign: 'left' }}>
            <Alert type="error" message={message} showIcon style={{ marginBottom: 8 }} />
            <Button size="small" onClick={retry} block>
              重试
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
