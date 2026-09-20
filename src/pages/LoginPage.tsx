import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Card, Button, Segmented, Typography } from 'antd';
import { useAuth } from '../contexts/AuthContext';
import { LOGIN_GRADIENT, LOGIN_EMBLEM_ID } from '../theme';
import LoginBackground from '../components/LoginBackground';
import WaterIntro from '../components/login/WaterIntro';
import DingTalkQrLogin from '../components/login/DingTalkQrLogin';
import GuestLoginForm from '../components/login/GuestLoginForm';
import EmergencyLoginForm from '../components/login/EmergencyLoginForm';

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
 * 登录页 —— 从「管理员密码框」改成「身份分流」。
 *
 * 两条主路：
 *   ① 学院管理人员 —— 钉钉扫码，拿到真身份，权限看 staff_roles 里的角色
 *   ② 我来借东西   —— 外部借用人，不验证，只记姓名电话
 * 外加一个平时不用的应急入口（钉钉整个链路断掉时还能进后台）。
 *
 * 2026-09-20 之前这里是一个硬编码密码 `0313`。真正的门现在在数据库 RLS 上，
 * 所以这一页只是分流器 —— 就算有人绕过它，也读不到任何数据。
 */
type LoginMode = 'dingtalk' | 'guest' | 'emergency';

export default function LoginPage() {
  const { role, loading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<LoginMode>('dingtalk');

  // 拿不到 sessionStorage（隐私模式等）就不播动画，直接进登录页
  const [showIntro, setShowIntro] = useState(() => {
    try {
      return sessionStorage.getItem(INTRO_KEY) !== '1';
    } catch {
      return false;
    }
  });

  const goHome = () => navigate('/', { replace: true });

  const handleIntroDone = useCallback(() => {
    try {
      sessionStorage.setItem(INTRO_KEY, '1');
    } catch {
      /* 写不了就算了，顶多下次再播一遍 */
    }
    setShowIntro(false);
  }, []);

  // 已经登录的人不该停在登录页（比如按了浏览器后退）
  useEffect(() => {
    if (!loading && role) navigate('/', { replace: true });
  }, [loading, role, navigate]);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: LOGIN_GRADIENT,
        padding: 16,
        position: 'relative',
        overflow: 'hidden',
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
        style={{ width: '100%', maxWidth: 400, position: 'relative', zIndex: 1 }}
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
              padding: 8,
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
            value={mode === 'emergency' ? 'dingtalk' : mode}
            onChange={(v) => setMode(v as LoginMode)}
            options={[
              { label: '学院管理人员', value: 'dingtalk' },
              { label: '我来借东西', value: 'guest' },
            ]}
            style={{ marginBottom: 20 }}
          />

          {mode === 'dingtalk' && <DingTalkQrLogin onLoggedIn={goHome} />}
          {mode === 'guest' && <GuestLoginForm onLoggedIn={goHome} />}
          {mode === 'emergency' && <EmergencyLoginForm onLoggedIn={goHome} />}
        </Card>

        <div style={{ textAlign: 'center', marginTop: 16 }}>
          {mode === 'emergency' ? (
            <Button type="link" onClick={() => setMode('dingtalk')} style={{ color: 'rgba(255,255,255,0.85)' }}>
              返回钉钉登录
            </Button>
          ) : (
            /* 0.35 的实际观感几乎看不见 —— 底色是中等蓝，白字得够亮才读得出来 */
            <Button
              type="link"
              onClick={() => setMode('emergency')}
              style={{ color: 'rgba(255,255,255,0.72)', fontSize: 12 }}
            >
              钉钉无法登录？应急入口
            </Button>
          )}
        </div>
      </motion.div>

      {/*
        入场动画盖在最上层。它自己会在结束时摘掉自己 ——
        动画失败也有硬超时兜底，绝不会把人挡在登录页外面。
      */}
      {showIntro && <WaterIntro onDone={handleIntroDone} />}
    </div>
  );
}
