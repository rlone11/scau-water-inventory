import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Spin, Typography } from 'antd';
import { DingtalkOutlined } from '@ant-design/icons';
import { supabase } from '../../lib/supabase';
import { isFreshAuthCode, mountQrLogin } from '../../lib/dingtalkQrSdk';
import {
  buildDingTalkAuthUrl,
  isPhone,
  newState,
  rememberPendingState,
  takePendingState,
  takeStashedCallback,
  type StashedCallback,
} from '../../lib/dingtalkRedirect';

const { Text } = Typography;

const CONTAINER_ID = 'dingtalk-qr-container';

type Phase = 'loading' | 'ready' | 'exchanging' | 'error';

/** 手机判定只做一次 —— 一次页面生命周期里 UA 不会变 */
const PHONE = isPhone();

/**
 * ⚠️ 回跳结果**全页只取一次**，所以放在模块级。
 *
 * 放进 effect 会出事：StrictMode 下 effect 跑两遍，第二遍取到的已经是空，
 * 会被当成"这次没有回跳"，一路退回二维码分支 —— 跟正在进行的那次交换
 * 抢着改状态。模块级只算一次的 takeStashedCallback 把这个坑堵死。
 *
 * `undefined` 表示还没取过。重试时用 resetStashedOnce 清掉。
 */
let stashedOnce: StashedCallback | null | undefined;

function takeStashedOnce(): StashedCallback | null {
  if (stashedOnce === undefined) stashedOnce = takeStashedCallback();
  return stashedOnce;
}

function resetStashedOnce(): void {
  stashedOnce = null;
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
  /**
   * 入场动画是否已经结束。**必须等它变成 true 才允许加载钉钉 SDK。**
   *
   * ⚠️ 这条不是优化，是必需的（2026-09-21 加的）。
   *
   * 钉钉 SDK 挂载后会异步拉起第二波活儿：再拉一个 login.js 解析执行（~82ms），
   * 以及一个阿里云埋点 XHR 的回调（~110ms）。实测这两下正好砸在入场动画
   * 「汇聚」播到一半的位置，主线程被占住 74~83ms —— 用户看到的就是
   * 「粒子飞着飞着猛卡一下」。A/B 实测：把 SDK 推迟 8 秒，汇聚期间掉帧数归零。
   *
   * 这个 SDK 只服务登录页，等动画播完再加载没有任何代价。
   */
  introDone: boolean;
}

/**
 * 钉钉登录面板。桌面端内嵌二维码，手机端整页跳转授权。
 *
 * **手机端必须换一条路**：手机上扫不了自己屏幕上的码，而钉钉这个 SDK 不做
 * 移动端适配（实测手机和桌面请求的是同一个 URL，只有 state 不同）。所以手机上
 * 只给一个按钮，跳到钉钉授权页 → 唤起钉钉 App → 授权后钉钉带着 authCode 跳回
 * 本站（回跳参数在 main.tsx 里就被截住了，见 lib/dingtalkRedirect.ts）。
 *
 * 手机端还顺带省掉一整个 SDK 的下载 —— 那段代码只挂在桌面这条分支上。
 */
export default function DingTalkLogin({ onLoggedIn, introDone }: Props) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [message, setMessage] = useState('');
  const [attempt, setAttempt] = useState(0);

  const initedRef = useRef(false);
  /** 桌面端二维码用的 state，由我们生成、钉钉原样回传 */
  const stateRef = useRef('');

  /**
   * ⚠️ 用 ref，不用 effect 闭包里的局部变量。
   *
   * StrictMode 开发模式下 effect 会「卸载再挂载」跑两遍，闭包变量会被第一遍的
   * 清理函数置回 false；正在飞行中的那次交换回来一看，以为组件已经卸了，
   * 于是**既不报错也不跳转** —— 手机上调试时会看到「点了登录没反应」。
   * ref 归组件实例所有，第二遍跑完仍然是 true。
   */
  const aliveRef = useRef(true);

  useEffect(() => {
    if (!introDone) return;

    aliveRef.current = true;

    const fail = (msg: string) => {
      if (!aliveRef.current) return;
      setPhase('error');
      setMessage(msg);
    };

    const handle = async (authCode: string) => {
      // 一次性授权码：SDK 可能重复回调，重复的直接丢
      if (!isFreshAuthCode(authCode)) return;

      setPhase('exchanging');
      try {
        const { email, password } = await exchangeAuthCode(authCode);

        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw new Error(`建立会话失败：${error.message}`);

        if (aliveRef.current) onLoggedIn();
      } catch (e) {
        if (!aliveRef.current) return;
        setPhase('error');
        setMessage(e instanceof Error ? e.message : String(e));
      }
    };

    const init = async () => {
      if (initedRef.current) return;
      initedRef.current = true;

      // ── ① 钉钉授权跳回来的（手机端登录成功走的就是这条路）
      const stashed = takeStashedOnce();
      if (stashed) {
        if (stashed.error) {
          fail(`钉钉授权未通过：${stashed.error}`);
          return;
        }

        /**
         * ⚠️ state 校验**必须做**，不能省。
         *
         * authCode 是从地址栏进来的，任何人都能构造一条
         * `/?authCode=<别人的码>` 让人自动登录成**别人的身份**（登录 CSRF）。
         * 校验不上就拒绝，宁可让用户重点一次 —— 那句提示里也写了该怎么做。
         */
        const expected = takePendingState();
        if (!expected || !stashed.state || expected !== stashed.state) {
          fail('这次登录不是本页面发起的，或者已经过期了。请重新点一次「用钉钉 App 登录」');
          return;
        }

        if (stashed.authCode) await handle(stashed.authCode);
        return;
      }

      // ── ② 手机端：只给一个跳转按钮，SDK 一个字节都不下载
      if (PHONE) {
        setPhase('ready');
        return;
      }

      // ── ③ 桌面端：内嵌二维码
      stateRef.current = newState();
      const mounted = await mountQrLogin({
        containerId: CONTAINER_ID,
        state: stateRef.current,
        onSuccess: (result) => {
          // 一次性校验：state 由我们生成，钉钉原样回传
          if (stateRef.current && result.state && result.state !== stateRef.current) {
            fail('登录校验失败（state 不匹配），请重试');
            return;
          }
          if (result?.authCode) void handle(result.authCode);
        },
        onError: fail,
      });

      // 失败时 mountQrLogin 已经调过 fail 了，这里别再把它盖回"就绪"
      if (mounted && aliveRef.current) setPhase('ready');
    };

    void init();

    return () => {
      aliveRef.current = false;
    };
    // attempt 变化时整个重建（重试）；introDone 由 false 变 true 时补上第一次初始化
  }, [attempt, onLoggedIn, introDone]);

  const retry = () => {
    initedRef.current = false;
    resetStashedOnce();
    setMessage('');
    setPhase('loading');
    setAttempt((n) => n + 1);
  };

  /** 手机端：整页跳到钉钉授权页 */
  const startRedirect = () => {
    const state = newState();
    rememberPendingState(state);
    // 整页跳走，**不要**开新标签 —— 回跳才会落回这个标签页，
    // 用户按返回键也能回到登录页
    window.location.assign(buildDingTalkAuthUrl(state));
  };

  // ── 手机端面板：一个按钮，就这么多
  if (PHONE) {
    return (
      <div style={{ textAlign: 'center' }}>
        {/* 三种状态占同样的高度，跟桌面端那块一个道理：高度突变会让卡片跳一下 */}
        <div
          style={{
            minHeight: 110,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}
        >
          {phase === 'exchanging' && (
            <Text style={{ color: '#0369A1' }}>
              <Spin size="small" /> 正在验证身份…
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

          {(phase === 'ready' || phase === 'loading') && (
            <>
              <Button
                type="primary"
                size="large"
                block
                icon={<DingtalkOutlined />}
                onClick={startRedirect}
              >
                用钉钉 App 登录
              </Button>
              {/*
                ⚠️ 白卡片，文字必须是深色。以前这里写成 rgba(255,255,255,…)
                是深色背景才成立的写法，搬到卡片里就成了白底白字。
              */}
              <div style={{ marginTop: 12, fontSize: 12, color: '#94A3B8', lineHeight: 1.7 }}>
                会跳到钉钉完成授权，再自动回到这里
                <br />
                仅限本院钉钉组织成员，外部人员请用「我来借东西」
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ textAlign: 'center' }}>
      {/*
        ⚠️ 这个 div 整块让给钉钉 SDK，React 绝不往里面放子节点。

        钉钉初始化时会清空容器再塞自己的 iframe。如果里面原本有 React 管理的
        节点，那个节点会被从 DOM 里抹掉；之后 React 按自己的账本去删它，就会抛
        NotFoundError（Failed to execute 'removeChild'），整棵树跟着卸载 ——
        用户看到的就是「闪一下然后白屏」。

        加载圈改成绝对定位的兄弟节点盖在上面，不碰这个容器。
      */}
      <div style={{ position: 'relative', width: 280, height: 280, margin: '0 auto' }}>
        <div
          id={CONTAINER_ID}
          style={{
            width: '100%',
            height: '100%',
            background: '#fff',
            borderRadius: 14,
            // 加圈描边和浅投影，让二维码成为一块有边界的"面板"。
            // 之前它和卡片都是白的，边界看不见，整块显得空
            border: '1px solid rgba(14,165,233,0.18)',
            boxShadow: '0 2px 10px rgba(3,105,161,0.07)',
            overflow: 'hidden',
          }}
        />
        {phase === 'loading' && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#fff',
              borderRadius: 12,
            }}
          >
            <Spin />
          </div>
        )}
      </div>

      <div style={{ marginTop: 14 }}>
        {/* 中间留白太大时就一条细分割线，两端渐隐 —— 比空着好，也不抢戏 */}
        <div
          style={{
            height: 1,
            marginBottom: 12,
            background:
              'linear-gradient(90deg, transparent, rgba(14,165,233,0.28), transparent)',
          }}
        />
        {/*
          ⚠️ 这里是**白卡片**，文字必须用深色。
          之前写成 rgba(255,255,255,…) 是在深色背景上才成立的写法，
          搬到卡片里就成了白底白字，完全看不见。
        */}

        {/*
          ⚠️ 这层 minHeight 是**固定的四十四像素**（= ready 那两行文案的高度），
          不是随手写的下限，别删也别改小。

          加载中 / 已就绪 / 验证中三种状态必须占住同样的高度。之前只有一个
          外层 minHeight:44，加载中实际只有分割线的 13px，等 SDK 加载完文案
          一冒出来整块就长 13px —— 卡片当场跳一下；更要命的是登录页页签切换
          的高度弹簧正好在这时候追一个**移动的目标**，回弹被整个抹平：实测
          变高方向只剩 1px 过冲，变矮方向却有不正常的 11px。

          只有报错会长出去，那是真该长 —— 弹簧会平滑地把它撑开。
        */}
        <div style={{ minHeight: 44 }}>
          {phase === 'exchanging' && (
            <Text style={{ color: '#0369A1' }}>
              <Spin size="small" /> 正在验证身份…
            </Text>
          )}

          {phase === 'ready' && (
            <Text style={{ color: '#475569', fontSize: 13 }}>
              请用<strong style={{ color: '#0C4A6E' }}>学院钉钉</strong>扫码登录
              <br />
              <span style={{ fontSize: 12, color: '#94A3B8' }}>
                仅限本院钉钉组织成员，外部人员请用「我来借东西」
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
    </div>
  );
}
