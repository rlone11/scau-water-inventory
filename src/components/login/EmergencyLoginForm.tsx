import { useState } from 'react';
import { Alert, Button, Form, Input, Typography } from 'antd';
import { MailOutlined, LockOutlined } from '@ant-design/icons';
import { supabase } from '../../lib/supabase';

const { Text } = Typography;

/**
 * 应急入口 —— 钉钉链路整个断掉时（回调域名失效、权限被撤、应用被停用）
 * 靠它还能进管理后台。平时不用。
 *
 * 账号在 Supabase 后台手工开（Authentication → Users），密码由你自己设，
 * 不走钉钉、也不存在任何硬编码。
 */
interface Props {
  onLoggedIn: () => void;
}

export default function EmergencyLoginForm({ onLoggedIn }: Props) {
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
      <Text
        style={{
          display: 'block',
          textAlign: 'center',
          color: 'rgba(255,255,255,0.65)',
          fontSize: 13,
          marginBottom: 16,
        }}
      >
        仅限钉钉无法登录时使用
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
