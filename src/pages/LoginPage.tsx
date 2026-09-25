import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Card, Segmented, Typography } from 'antd';
import { useAuth } from '../contexts/AuthContext';
import { LOGIN_GRADIENT, LOGIN_EMBLEM_ID } from '../theme';
import { toggleTransition } from '../lib/motion';
import { HANDOFF_MS } from '../lib/introParticles';
import LoginBackground from '../components/LoginBackground';
import WaterIntro from '../components/login/WaterIntro';
import DingTalkQrLogin from '../components/login/DingTalkQrLogin';
import GuestLoginForm from '../components/login/GuestLoginForm';
import AccountLoginForm from '../components/login/AccountLoginForm';

const { Title, Text } = Typography;

const BASE = import.meta.env.BASE_URL;

/** 入场动画同一个标签页只播一次。关掉标签页重开才会再看到。 */
const INTRO_KEY = 'scau_intro_played';

/**
 * 漂浮的吉祥物。
 *
 * ⚠️ 用 `_透明` 版本，而且**不要再加 filter**。
 *
 * 这三张图原本是画在白底上的卡通吉祥物（两个京剧扮相 + 一个普通小水滴），
 * **不透明**。以前这里写着 `filter: brightness(0) invert(1)` 想做成"白色剪影"，
 * 但图本身不透明 → 整个矩形被刷成纯白，页面上就是几个飘着的白方块。
 * 已经用泛洪抠掉白底（只抠与边缘连通的部分，吉祥物身上的白不受影响），
 * 现在原色显示。
 *
 * 尺寸仍用缩略版：原图男水滴有 1079x1103 / 641KB，而这里只显示 70px。
 */
const floatingDrops = [
  { src: 'images/小水滴2_透明.png', size: 96, left: '4%', top: '9%', delay: 0, duration: 6 },
  { src: 'images/小水滴3_透明.png', size: 74, left: '86%', top: '14%', delay: 1.5, duration: 7 },
  { src: 'images/男水滴_透明.png', size: 86, left: '9%', top: '68%', delay: 0.8, duration: 8 },
  { src: 'images/小水滴2_透明.png', size: 66, left: '76%', top: '74%', delay: 2.5, duration: 6.5 },
  { src: 'images/小水滴3_透明.png', size: 60, left: '50%', top: '84%', delay: 3, duration: 7.5 },
];

/**
 * 这台设备是不是**手机**。
 *
 * ⚠️ 这是**设备能力**判断，不是窗口宽度 —— 两者的区别见项目里那条响应式约定。
 * 依据很直接：手机**扫不了自己屏幕上的码**，所以手机端干脆不显示钉钉页签，
 * 只留「我来借东西」和「管理员账号」。
 * 拿"把浏览器窗口拖窄"来测这个分支是测不出来的，得开 F12 的设备模拟或上真机。
 *
 * 平板（iPad / 安卓平板 UA 里没有 Mobile）**保持显示钉钉页签** —— 平板能拿另一台
 * 手机扫屏幕上的码。
 */
function isPhone(): boolean {
  const ua = navigator.userAgent;
  if (/iPhone|iPod|Windows Phone/i.test(ua)) return true;
  if (/Android/i.test(ua) && /Mobile/i.test(ua)) return true;
  if (/HarmonyOS/i.test(ua) && /Mobile/i.test(ua)) return true;
  return false;
}

/** 一次页面生命周期里 UA 不会变 */
const IS_PHONE = isPhone();

/**
 * 登录页 —— 从「管理员密码框」改成「身份分流」。
 *
 * 三条路，**默认落在 ①**：
 *   ① 我来借东西   —— 外部借用人，不验证，只记姓名电话
 *   ② 学院管理人员 —— 钉钉扫码，拿到真身份，权限看 staff_roles 里的角色（**仅桌面**）
 *   ③ 管理员账号   —— 邮箱 + 密码，学院把账号发给谁谁就能用（桌面手机都有）
 * 来借东西的人比管理员多得多，所以默认给 ①。顺带一个好处：钉钉 SDK 只挂在
 * ② 的组件里，访客不切过去就一个字节都不会加载；手机端根本没有 ②，
 * 那一整个 SDK 永远不下载。
 *
 * ⚠️ 手机端**没有钉钉这条路**，是踩过坑才定下来的（2026-09-22）：手机上扫不了
 * 自己屏幕上的码；改走「整页跳转授权 + 唤起钉钉 App」也做通过一轮，App 能拉起、
 * 授权也能成，但**回跳会落在钉钉 App 内置的浏览器里**，跟发起时不是同一个容器，
 * 本地存的 state 全读不到 —— 硬拦就永远登不进去。绕不过去，索性让管理员用账号密码。
 *
 * 2026-09-20 之前这里是一个硬编码密码 `0313`。真正的门现在在数据库 RLS 上，
 * 所以这一页只是分流器 —— 就算有人绕过它，也读不到任何数据。
 */
type LoginMode = 'dingtalk' | 'guest' | 'account';

export default function LoginPage() {
  const { role, loading } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<LoginMode>('guest');

  /**
   * 钉钉那块**一旦挂上就不再卸载**（懒挂载 + 常驻），原因写在表单区 JSX 里。
   *
   * 用 ref 而不是 state 是在**同一次渲染里**就要生效：用 state 的话，第一次
   * 点「学院管理人员」会先渲染出一帧空白，再补上内容 —— 那一下就是闪。
   * 这是个只进不退的闩，渲染期赋值是幂等的，不影响渲染结果。
   */
  const hasMountedDingtalk = useRef(mode === 'dingtalk');
  if (mode === 'dingtalk') hasMountedDingtalk.current = true;

  /**
   * 表单区的高度。量出来喂给 motion，切换页签时卡片才会弹过去而不是跳过去。
   * 见下面表单区那段 JSX 的说明。
   */
  const formBoxRef = useRef<HTMLDivElement>(null);
  const [formHeight, setFormHeight] = useState<number>();
  /** 系统里关了动画的人不该看到回弹 —— 跟 WaterIntro / LoginBackground 一个规矩 */
  const reduceMotion = useRef(
    window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  ).current;

  useEffect(() => {
    const el = formBoxRef.current;
    if (!el) return;
    const measure = () => setFormHeight(el.offsetHeight);
    measure();
    // 内容自己变高变矮也要跟上（校验错误信息冒出来、二维码面板换成加载态等）
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 拿不到 sessionStorage（隐私模式等）就不播动画，直接进登录页
  const [showIntro, setShowIntro] = useState(() => {
    try {
      return sessionStorage.getItem(INTRO_KEY) !== '1';
    } catch {
      return false;
    }
  });

  /**
   * ⚠️ 必须 memo 住：DingTalkQrLogin 的 effect 依赖里带着它，身份每次变都会让
   * 那个 effect 重跑一遍，而重跑的清理函数会把 alive 置成 false。要是正好卡在
   * SDK 加载中途，「二维码就绪」那一步就被跳过了，加载圈会一直转下去。
   */
  const goHome = useCallback(() => navigate('/', { replace: true }), [navigate]);

  const handleIntroDone = useCallback(() => {
    try {
      sessionStorage.setItem(INTRO_KEY, '1');
    } catch {
      /* 写不了就算了，顶多下次再播一遍 */
    }
    setShowIntro(false);
  }, []);

  /**
   * 这次不播入场动画时，**加载屏那一层得自己收掉**。
   *
   * ⚠️ `#scau-intro` 是加载屏建在 `#root` **外面**的（放里面会被 React 抹掉），
   * 所以 React 管不到它 —— 正常由 WaterIntro 收尾时摘掉。
   * 但重复访问（同一个标签页第二次打开、sessionStorage 里有标记）不播动画，
   * WaterIntro 根本不挂载，**没人摘它**，那一层就会连着粒子一直盖在登录页上面，
   * 而且它 pointer-events 是 auto，**点都点不动**，等于把人锁死在外面。
   *
   * ⚠️ 用淡出而不是直接 remove：直接摘的话粒子是"啪"一下没的，
   *    又变回用户明确不许有的那种闪现了。
   */
  useEffect(() => {
    if (showIntro) return;

    const boot = window.__SCAU_INTRO_BOOT__;
    if (boot) boot.detach(); // 先停掉漂浮循环，别让它继续画

    const layer = document.getElementById('scau-intro');
    if (!layer) return;

    layer.style.transition = `opacity ${HANDOFF_MS}ms ease-out`;
    layer.style.opacity = '0';
    const timer = window.setTimeout(() => layer.remove(), HANDOFF_MS);
    return () => window.clearTimeout(timer);
  }, [showIntro]);

  // 已经登录的人不该停在登录页（比如按了浏览器后退）
  useEffect(() => {
    if (!loading && role) navigate('/', { replace: true });
  }, [loading, role, navigate]);

  return (
    <div
      /*
        ⚠️ 登录页自己就是滚动区（.login-viewport，见 global.css），别再写
        minHeight: 100vh —— 那样内容一撑高 html 就溢出，右侧会冒出滚动条，
        整页跟着横跳（用户的原话「不丝滑 / 停的时候一顿一顿」）。

        也**不能用 alignItems: center 居中**：flex 居中 + 溢出时，内容顶部会
        跑到滚不到的地方。改成让下面那张卡片用 margin: auto 居中，这样
        窗口高时居中、窗口矮时从顶部开始排，怎么都够得着。
      */
      className="login-viewport"
      style={{
        display: 'flex',
        background: LOGIN_GRADIENT,
        padding: 16,
        position: 'relative',
      }}
    >
      <LoginBackground />

      {/* 漂浮的水滴 */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 2 }}>
        {floatingDrops.map((drop, i) => (
          <motion.img
            key={i}
            src={BASE + drop.src}
            alt=""
            style={{
              position: 'absolute',
              width: drop.size,
              height: drop.size,
              left: drop.left,
              top: drop.top,
              opacity: 0,
              objectFit: 'contain',
            }}
            animate={{
              // 换成彩色插画后 0.18 太淡了，几乎看不出是什么 —— 调到能看见
              opacity: [0, 0.3, 0.44, 0.3, 0],
              y: [0, -30, 0, -20, 0],
              rotate: [0, 5, 0, -5, 0],
            }}
            transition={{ duration: drop.duration, repeat: Infinity, delay: drop.delay, ease: 'easeInOut' }}
          />
        ))}
      </div>

      {/* 背景圆环 */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        {[...Array(4)].map((_, i) => (
          <motion.div
            key={i}
            style={{
              position: 'absolute',
              width: 200 + i * 80,
              height: 200 + i * 80,
              borderRadius: '50%',
              border: '1px solid rgba(255,255,255,0.04)',
              left: `${20 + i * 15}%`,
              top: `${10 + i * 10}%`,
            }}
            animate={{ scale: [1, 1.15, 1], opacity: [0.2, 0.4, 0.2] }}
            transition={{ duration: 5 + i * 1.5, repeat: Infinity, delay: i * 1.2 }}
          />
        ))}
      </div>

      {/*
        主要内容。
        入场动画期间它一直正常渲染着 —— 动画覆盖层是不透明的，本来就盖住了
        这里，不需要这边配合隐藏。让它在动画一开始就处于**最终位置**很重要：
        覆盖层要量出顶部院徽的坐标当飞行终点，量的时候这上面的入场动画
        （600ms）早已结束，y 和 scale 都已归位。
      */}
      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        /* margin: auto 居中（不是 flex 居中）—— 见外层 div 上的说明 */
        style={{ width: '100%', maxWidth: 400, margin: 'auto', position: 'relative', zIndex: 1 }}
      >
        {/* 院徽与标题 */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          {/*
            ⚠️ 白底 + 黑色原图，跟侧边栏里的院徽保持一致。

            原来这里是磨砂方框 + `brightness(0) invert(1)` 把院徽整个压成纯白，
            细节全被抹平了。院徽本身是黑色镂空透明底，衬白色圆底才能看清
            —— 侧边栏早就用这个办法（注释里写着「直接放深蓝上几乎看不见」），
            登录页却用了另一套，同一个院徽两种观感。
          */}
          {/* id 挂在这个白圆底上：入场动画里的徽章也是白圆底 + 10% 内边距，
              两者尺寸和内边距比例完全一致，飞过来才能严丝合缝 */}
          <motion.div
            id={LOGIN_EMBLEM_ID}
            style={{
              width: 80,
              height: 80,
              // border-box 让 80px 是**含内边距**的总尺寸（内部的院徽 64px）。
              // 入场动画里那个飞行徽章用的是同一套规则，落位才能严丝合缝
              boxSizing: 'border-box',
              borderRadius: '50%',
              background: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              // 4% —— 必须和入场动画里的 BADGE_PADDING_RATIO 一致，
              // 否则徽章飞过来落位时白圈粗细会跳一下。
              // ⚠️ 不能写百分比：百分比 padding 是按包含块宽度算的，不是自身宽度
              padding: 3.2,
              overflow: 'hidden',
              boxShadow: '0 6px 20px rgba(0,0,0,0.28)',
            }}
            whileHover={{ scale: 1.05 }}
          >
            <img
              src={BASE + 'images/镂空院徽2_标清.png'}
              alt="水利水电学院"
              width={240}
              height={239}
              style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
            />
          </motion.div>
          <Title level={2} style={{ color: '#fff', margin: 0, fontWeight: 700, letterSpacing: 2 }}>
            水利水电学院
          </Title>
          <Text style={{ color: 'rgba(255,255,255,0.78)', fontSize: 14 }}>物品管理系统</Text>
        </div>

        <Card
          style={{
            position: 'relative',
            borderRadius: 18,
            overflow: 'hidden',
            // 微渐变 + 浅色描边 + 外投影 + 顶部内高光。
            // 一块纯白看着就是"一张纸"，这四样加上去才有厚度。
            background: 'linear-gradient(180deg, #FFFFFF 0%, #F4FAFE 100%)',
            border: '1px solid rgba(14,165,233,0.16)',
            boxShadow:
              '0 16px 40px rgba(3,105,161,0.22), 0 2px 8px rgba(3,105,161,0.10), inset 0 1px 0 rgba(255,255,255,0.9)',
          }}
          styles={{ body: { padding: 20 } }}
        >
          {/* 顶部一道水色装饰条 —— 把卡片和背景连起来 */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 3,
              background: 'linear-gradient(90deg, #7DD3FC, #0EA5E9, #0284C7)',
            }}
          />
          <Segmented
            block
            value={mode}
            onChange={(v) => setMode(v as LoginMode)}
            options={[
              { label: '我来借东西', value: 'guest' },
              // 手机端不给这一栏：扫不了自己屏幕上的码，摆着只会让人反复试
              ...(IS_PHONE ? [] : [{ label: '学院管理人员', value: 'dingtalk' }]),
              { label: '管理员账号', value: 'account' },
            ]}
            style={{ marginBottom: 20 }}
          />

          {/*
            ⚠️ 表单区外面这层是给「切换页签」用的，别拆。

            三个表单高矮差很多（二维码面板 280px，访客表单不到一半），而卡片是
            **垂直居中**的 —— 高度直接突变，整张卡片连同院徽、标题会一起跳位，
            切换看着就很生硬。这里把内容的真实高度量出来喂给 motion，
            让它平滑地拉过去；overflow:hidden 则让新表单是被"撑开"露出来的，
            而不是凭空冒出来。

            ⚠️ 过渡本身用 toggleTransition（匀速、无回弹、0.35s），别再改回弹簧 ——
            原因写在 motion.ts 那条上：height 动画每帧都要重新布局整张卡片，
            回弹和拖长的收尾都是在白花布局。
          */}
          <motion.div
            animate={formHeight === undefined ? {} : { height: formHeight }}
            transition={reduceMotion ? { duration: 0 } : toggleTransition}
            style={{ overflow: 'hidden' }}
          >
            {/* paddingBottom 不是留白：按钮在最后一个，不给几像素下去，
                聚焦时那圈 outline 会被上面的 overflow:hidden 切掉 */}
            <div ref={formBoxRef} style={{ paddingBottom: 4 }}>
              {/*
                ⚠️ 表单**不做淡入**。以前这里包了一层 initial={{opacity:0}} 的
                motion.div，新表单要从全透明淡进来 —— 那既是个多余的花样，
                也容易被看成"闪一下"：旧表单是瞬间消失的，于是中间有一段
                卡片发白、内容半透明的空窗。要的是"拉伸"，不是"淡入"。
              */}
              {/*
                ⚠️ 钉钉这块**一旦挂上就不再卸载**，切走只是 display:none，别改回
                `mode === 'dingtalk' && <DingTalkQrLogin/>`。

                卸载会让 SDK 每次切回来都重新初始化：重建二维码 iframe、重跑
                login.js、再打一次阿里云埋点的 XHR。实测每次切到管理端，主线程
                要阻塞 109~184ms、掉帧 83~117ms；而切回访客是干干净净的 ——
                用户的原话就是「只有切到那个页面才会卡，切回来都不会」。
                保持挂载之后这个不对称就没了。

                外面这层 display 是懒挂载：没点过管理端页签的人，SDK 一个字节
                都不下载（见上面 hasMountedDingtalk 的说明）。
              */}
              {hasMountedDingtalk.current && (
                <div style={{ display: mode === 'dingtalk' ? 'block' : 'none' }}>
                  {/* introDone 见 DingTalkQrLogin 里的说明：SDK 必须等入场动画播完再加载 */}
                  <DingTalkQrLogin onLoggedIn={goHome} introDone={!showIntro} />
                </div>
              )}

              {mode === 'guest' && <GuestLoginForm onLoggedIn={goHome} />}
              {mode === 'account' && <AccountLoginForm onLoggedIn={goHome} />}
            </div>
          </motion.div>
        </Card>

      </motion.div>

      {/*
        入场动画盖在最上层。它自己会在结束时摘掉自己 ——
        动画失败也有硬超时兜底，绝不会把人挡在登录页外面。
      */}
      {showIntro && <WaterIntro onDone={handleIntroDone} />}
    </div>
  );
}
