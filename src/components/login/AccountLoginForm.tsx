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

/**
 * 全角转半角。
 *
 * 中文输入法在手机上很容易把数字/字母/符号打成全角（`０６０３１３`、`＠`），
 * 屏幕上跟半角长得一模一样，服务器却认不出 —— 现象就是「电脑上能登、手机上登不了」。
 * 这里统一转半角，顺带把全角空格还原成普通空格（后面会被 trim 掉）。
 */
function toHalfWidth(text: string): string {
  return text
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/　/g, ' ');
}

/** 手机键盘/自动填充常会多带一个空格，邮箱密码都去掉首尾空白 */
function clean(text: string): string {
  return toHalfWidth(text).trim();
}

export default function AccountLoginForm({ onLoggedIn }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (values: { email: string; password: string }) => {
    setLoading(true);
    setError('');

    const { error: err } = await supabase.auth.signInWithPassword({
      email: clean(values.email),
      password: clean(values.password),
    });

    setLoading(false);

    if (err) {
      // ⚠️ 网络不通和密码错要分开说（2026-09-23 踩过）
      // 手机上 supabase.co 被挡时，supabase-js 抛的是 AuthRetryableFetchError，
      // 原来一律显示「邮箱或密码不正确」—— 把网络问题伪装成密码问题，
      // 用户反复重打密码、排查了半天，全是被这句话带偏的。
      const status = (err as { status?: number }).status;
      const isNetwork =
        err.name === 'AuthRetryableFetchError' ||
        status === 0 ||
        /fetch|network|timeout|连接/i.test(err.message ?? '');

      setError(
        isNetwork
          ? '连不上服务器（网络问题，不是账号密码的问题），换个网络再试'
          : '邮箱或密码不正确', // 不区分「邮箱不存在」和「密码错误」—— 避免被拿来枚举账号
      );
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
