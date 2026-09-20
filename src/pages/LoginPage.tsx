import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Card, Button, Segmented, Typography } from 'antd';
import { useAuth } from '../contexts/AuthContext';
import LoginBackground from '../components/LoginBackground';
import DingTalkQrLogin from '../components/login/DingTalkQrLogin';
import GuestLoginForm from '../components/login/GuestLoginForm';
import EmergencyLoginForm from '../components/login/EmergencyLoginForm';

const { Title, Text } = Typography;

const BASE = import.meta.env.BASE_URL;

const floatingDrops = [
  { src: 'images/小水滴 (2).png', size: 80, left: '5%', top: '10%', delay: 0, duration: 6 },
  { src: 'images/小水滴 (3).png', size: 60, left: '85%', top: '15%', delay: 1.5, duration: 7 },
  { src: 'images/男水滴.png', size: 70, left: '10%', top: '70%', delay: 0.8, duration: 8 },
  { src: 'images/小水滴 (2).png', size: 55, left: '75%', top: '75%', delay: 2.5, duration: 6.5 },
  { src: 'images/小水滴 (3).png', size: 50, left: '50%', top: '85%', delay: 3, duration: 7.5 },
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
  const [inputFocused, setInputFocused] = useState(false);
  const [inputCenter, setInputCenter] = useState<{ x: number; y: number } | null>(null);
  const formCardRef = useRef<HTMLDivElement>(null);

  const goHome = () => navigate('/', { replace: true });

  // 已经登录的人不该停在登录页（比如按了浏览器后退）
  useEffect(() => {
    if (!loading && role) navigate('/', { replace: true });
  }, [loading, role, navigate]);

  // 焦点事件用 React 的 onFocus/onBlur 冒泡捕获，不必给每个输入框单独接线
  const handleFocus = () => {
    setInputFocused(true);
    const el = formCardRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      setInputCenter({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #0369A1 0%, #0C4A6E 50%, #075985 100%)',
        padding: 16,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <LoginBackground
        inputFocused={inputFocused}
        inputCenterX={inputCenter?.x ?? null}
        inputCenterY={inputCenter?.y ?? null}
      />

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

      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        style={{ width: '100%', maxWidth: 400, position: 'relative', zIndex: 1 }}
      >
        {/* 院徽与标题 */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <motion.div
            style={{
              width: 80,
              height: 80,
              borderRadius: 20,
              background: 'rgba(255,255,255,0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              backdropFilter: 'blur(10px)',
              padding: 12,
            }}
            whileHover={{ scale: 1.05 }}
          >
            <img
              src={BASE + 'images/镂空院徽2.png'}
              alt="水利水电学院"
              style={{ width: '100%', height: '100%', objectFit: 'contain', filter: 'brightness(0) invert(1)' }}
            />
          </motion.div>
          <Title level={2} style={{ color: '#fff', margin: 0, fontWeight: 700, letterSpacing: 2 }}>
            水利水电学院
          </Title>
          <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>物品管理系统</Text>
        </div>

        <div ref={formCardRef} onFocus={handleFocus} onBlur={() => setInputFocused(false)}>
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
        </div>

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
    </div>
  );
}
