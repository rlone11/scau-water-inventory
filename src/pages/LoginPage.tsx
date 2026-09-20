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
 * 漂浮水滴。
 *
 * ⚠️ 全部用 `_标清` 版本。原图动辄 640KB（男水滴 1079x1103），
 * 而这里最大只显示 80px —— 四个装饰图加起来原来要下 1.3MB，
 * 在国内访问 GitHub Pages 的场景下是纯粹白等的开销。
 */
const floatingDrops = [
  { src: 'images/小水滴2_标清.png', size: 80, left: '5%', top: '10%', delay: 0, duration: 6 },
  { src: 'images/小水滴3_标清.png', size: 60, left: '85%', top: '15%', delay: 1.5, duration: 7 },
  { src: 'images/男水滴_标清.png', size: 70, left: '10%', top: '70%', delay: 0.8, duration: 8 },
  { src: 'images/小水滴2_标清.png', size: 55, left: '75%', top: '75%', delay: 2.5, duration: 6.5 },
  { src: 'images/小水滴3_标清.png', size: 50, left: '50%', top: '85%', delay: 3, duration: 7.5 },
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
              filter: 'brightness(0) invert(1)',
            }}
            animate={{
              opacity: [0, 0.12, 0.18, 0.12, 0],
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
          <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>物品管理系统</Text>
        </div>

        <Card
          style={{
            borderRadius: 16,
            background: 'rgba(255,255,255,0.95)',
            backdropFilter: 'blur(20px)',
            border: 'none',
            boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
          }}
          styles={{ body: { padding: 20 } }}
        >
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
            <Button type="link" onClick={() => setMode('dingtalk')} style={{ color: 'rgba(255,255,255,0.6)' }}>
              返回钉钉登录
            </Button>
          ) : (
            <Button
              type="link"
              onClick={() => setMode('emergency')}
              style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12 }}
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
