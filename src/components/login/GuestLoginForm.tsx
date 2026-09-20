import { useState } from 'react';
import { Form, Input, Button, Typography } from 'antd';
import { UserOutlined, PhoneOutlined } from '@ant-design/icons';
import { useAuth } from '../../contexts/AuthContext';

const { Text } = Typography;

/**
 * 访客入口 —— 外部借用人走这条。
 *
 * ⚠️ 刻意不做任何验证：用户明确要求「不用登录，直接填表」。
 * 这里填的姓名电话只是给管理员看的联系方式，不是身份凭据。
 * 真正的保护在数据库那边 —— 访客读不到任何借用记录和手机号。
 */
interface Props {
  onLoggedIn: () => void;
}

export default function GuestLoginForm({ onLoggedIn }: Props) {
  const { signInAsGuest } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = (values: { name: string; phone: string }) => {
    setSubmitting(true);
    signInAsGuest({ name: values.name.trim(), phone: values.phone.trim() });
    onLoggedIn();
  };

  return (
    <div>
      <Text style={{ display: 'block', textAlign: 'center', color: 'rgba(255,255,255,0.65)', fontSize: 13, marginBottom: 16 }}>
        访客无需账号，填个联系方式即可查看库存并借用
      </Text>

      <Form layout="vertical" onFinish={handleSubmit} size="large" requiredMark={false}>
        <Form.Item
          name="name"
          rules={[
            { required: true, message: '请填写您的姓名' },
            { max: 50, message: '姓名过长' },
          ]}
        >
          <Input prefix={<UserOutlined />} placeholder="您的姓名" autoComplete="name" />
        </Form.Item>

        <Form.Item
          name="phone"
          rules={[
            { required: true, message: '请填写联系电话' },
            {
              // 手机号与座机都放行，只挡住明显不是电话的输入
              pattern: /^[\d\-+ ]{6,20}$/,
              message: '请填写有效的联系电话',
            },
          ]}
        >
          <Input prefix={<PhoneOutlined />} placeholder="联系电话" autoComplete="tel" />
        </Form.Item>

        <Form.Item style={{ marginBottom: 0 }}>
          <Button
            type="primary"
            htmlType="submit"
            block
            loading={submitting}
            style={{
              height: 44,
              fontSize: 16,
              fontWeight: 600,
              background: 'linear-gradient(135deg, #0EA5E9, #0284C7)',
              border: 'none',
            }}
          >
            进入
          </Button>
        </Form.Item>
      </Form>
    </div>
  );
}
