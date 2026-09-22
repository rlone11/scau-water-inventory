import { useState } from 'react';
import { Alert, Button, Form, Input, Typography } from 'antd';
import { MailOutlined, LockOutlined } from '@ant-design/icons';
import { supabase } from '../../lib/supabase';

const { Text } = Typography;

/**
 * 管理员账号登录 —— 邮箱 + 密码。
 *
 * 2026-09-22 从「应急入口」升成正经入口：手机端那套钉钉跳转授权做下来
 * 太绕（要唤醒 App、回跳还会换浏览器容器），干脆让管理员用账号密码，
 * 谁要就给谁开一个 —— 比走钉钉省事，也不受手机端各种限制。
 *
 * 账号怎么建：双击仓库根目录的「建应急账号.command」，**一个人跑一次**。
 * 邮箱不用真能收信，它只是个账号名；脚本会自动给账号带上 admin 权限
 * （写进 app_metadata.scau_role，数据库 RLS 认的就是这个字段）。
 *
 * ⚠️ 密码只经 supabase.auth.signInWithPassword，前端不存密码、不做任何硬编码
 * —— 2026-09-20 之前那个硬编码的 `0313` 就是这么被拿掉的。
 */
interface Props {
  onLoggedIn: () => void;
}

export default function AccountLoginForm({ onLoggedIn }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (values: { email: string; password: string }) => {
    setLoading(true);
    setError('');

    const { error: err } = await supabase.auth.signInWithPassword({
      email: values.email.trim(),
      password: values.password,
    });

    setLoading(false);

    if (err) {
      // 不区分「邮箱不存在」和「密码错误」—— 避免被拿来枚举账号
      setError('邮箱或密码不正确');
      return;
    }
    onLoggedIn();
  };

  return (
    <div>
      {/* 深色文字 —— 这是在白卡片里，不是深色背景上 */}
      <Text
        style={{
          display: 'block',
          textAlign: 'center',
          color: '#64748B',
          fontSize: 13,
          marginBottom: 16,
        }}
      >
        用学院分配给你的账号登录
      </Text>

      {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 12 }} />}

      <Form layout="vertical" onFinish={handleSubmit} size="large" requiredMark={false}>
        <Form.Item
          name="email"
          rules={[
            { required: true, message: '请输入邮箱' },
            { type: 'email', message: '邮箱格式不正确' },
          ]}
        >
          <Input prefix={<MailOutlined />} placeholder="邮箱" autoComplete="username" />
        </Form.Item>

        <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
          <Input.Password prefix={<LockOutlined />} placeholder="密码" autoComplete="current-password" />
        </Form.Item>

        <Form.Item style={{ marginBottom: 0 }}>
          <Button
            type="primary"
            htmlType="submit"
            block
            loading={loading}
            style={{
              height: 44,
              fontSize: 16,
              fontWeight: 600,
              background: 'linear-gradient(135deg, #0EA5E9, #0284C7)',
              border: 'none',
            }}
          >
            登录
          </Button>
        </Form.Item>
      </Form>
    </div>
  );
}
