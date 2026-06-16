import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Card, Form, Input, Button, message, Typography } from 'antd';
import { LockOutlined, SafetyOutlined } from '@ant-design/icons';
import { useAuth } from '../contexts/AuthContext';
import LoginBackground from '../components/LoginBackground';

const { Title, Text } = Typography;

const BASE = import.meta.env.BASE_URL;

const floatingDrops = [
  { src: 'images/小水滴 (2).png', size: 80, left: '5%', top: '10%', delay: 0, duration: 6 },
  { src: 'images/小水滴 (3).png', size: 60, left: '85%', top: '15%', delay: 1.5, duration: 7 },
  { src: 'images/男水滴.png', size: 70, left: '10%', top: '70%', delay: 0.8, duration: 8 },
  { src: 'images/小水滴 (2).png', size: 55, left: '75%', top: '75%', delay: 2.5, duration: 6.5 },
  { src: 'images/小水滴 (3).png', size: 50, left: '50%', top: '85%', delay: 3, duration: 7.5 },
];

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const { login, setFirstPassword, hasPassword } = useAuth();
  const navigate = useNavigate();
  const [inputFocused, setInputFocused] = useState(false);
  const [inputCenter, setInputCenter] = useState<{ x: number; y: number } | null>(null);
  const formCardRef = useRef<HTMLDivElement>(null);

  const handleSubmit = (values: { password: string; confirmPassword?: string }) => {
    setLoading(true);
    setTimeout(() => {
      if (!hasPassword) {
        if (values.password !== values.confirmPassword) {
          message.error('两次密码不一致');
          setLoading(false);
          return;
        }
        setFirstPassword(values.password);
        message.success('管理员密码设置成功！');
        navigate('/');
      } else {
        if (login(values.password)) {
          message.success('管理员登录成功！');
          navigate('/');
        } else {
          message.error('密码错误');
        }
      }
      setLoading(false);
    }, 500);
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
      {/* Underwater scene canvas */}
      <LoginBackground
        inputFocused={inputFocused}
        inputCenterX={inputCenter?.x ?? null}
        inputCenterY={inputCenter?.y ?? null}
      />

      {/* Floating water drops */}
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
            transition={{
              duration: drop.duration,
              repeat: Infinity,
              delay: drop.delay,
              ease: 'easeInOut',
            }}
          />
        ))}
      </div>

      {/* Background circles */}
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
            animate={{
              scale: [1, 1.15, 1],
              opacity: [0.2, 0.4, 0.2],
            }}
            transition={{
              duration: 5 + i * 1.5,
              repeat: Infinity,
              delay: i * 1.2,
            }}
          />
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        style={{ width: '100%', maxWidth: 400, position: 'relative', zIndex: 1 }}
      >
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
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
          <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>
            {hasPassword ? '管理员登录' : '首次设置管理员密码'}
          </Text>
        </div>

        <div ref={formCardRef}>
        <Card
          style={{
            borderRadius: 16,
            background: 'rgba(255,255,255,0.95)',
            backdropFilter: 'blur(20px)',
            border: 'none',
            boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
          }}
        >
          <Form layout="vertical" onFinish={handleSubmit} size="large">
            <Form.Item
              name="password"
              rules={[
                { required: true, message: '请输入密码' },
                { min: 4, message: '密码至少4位' },
              ]}
            >
              <Input.Password
                prefix={<LockOutlined />}
                placeholder={hasPassword ? '请输入管理员密码' : '设置管理员密码（至少4位）'}
                onFocus={() => {
                  setInputFocused(true);
                  const el = formCardRef.current;
                  if (el) {
                    const rect = el.getBoundingClientRect();
                    setInputCenter({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
                  }
                }}
                onBlur={() => setInputFocused(false)}
              />
            </Form.Item>

            {!hasPassword && (
              <Form.Item
                name="confirmPassword"
                rules={[
                  { required: true, message: '请确认密码' },
                  ({ getFieldValue }) => ({
                    validator: (_: unknown, value: string) => {
                      if (!value || getFieldValue('password') === value) {
                        return Promise.resolve();
                      }
                      return Promise.reject(new Error('两次密码不一致'));
                    },
                  }),
                ]}
              >
                <Input.Password prefix={<SafetyOutlined />} placeholder="确认密码" />
              </Form.Item>
            )}

            <Form.Item style={{ marginBottom: 0 }}>
              <Button
                type="primary"
                htmlType="submit"
                loading={loading}
                block
                style={{
                  height: 44,
                  fontSize: 16,
                  fontWeight: 600,
                  background: 'linear-gradient(135deg, #0EA5E9, #0284C7)',
                  border: 'none',
                }}
              >
                {hasPassword ? '登录' : '设置密码并进入'}
              </Button>
            </Form.Item>
          </Form>
        </Card>
        </div>

        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Button type="link" onClick={() => navigate('/')} style={{ color: 'rgba(255,255,255,0.6)' }}>
            返回首页
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
