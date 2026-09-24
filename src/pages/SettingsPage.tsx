import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Switch, Select, Segmented, Slider, Button, message } from 'antd';
import { LogoutOutlined, CrownOutlined, WarningOutlined } from '@ant-design/icons';
import { useAuth } from '../contexts/AuthContext';
import NotImplementedModal from '../components/NotImplementedModal';
import {
  SETTING_GROUPS,
  LAZY_LINES,
  ADMIN_APPLY_LINES,
  type FakeControl,
} from '../lib/settingsCatalog';

/**
 * 设置页 —— ⚠️ **这是个彩蛋，不是真设置。**
 *
 * 除了最底下「退出登录」是真的，其他每一条点了都只弹一句玩笑话。
 * 页面本身要做得一丝不苟 —— 分组、说明、开关、下拉、滑块一应俱全，
 * 越像真的越好笑。别为了"看着像玩笑"而故意做糙。
 *
 * 假控件都不接事件：外层套 `pointerEvents: 'none'`，让点击落到整行的
 * onClick 上。所以控件纹丝不动，只会弹窗 —— 这是刻意的。
 *
 * 选项清单在 src/lib/settingsCatalog.ts，想加一条改那个文件就行。
 */

/** 弹窗里展示什么 */
interface JokeState {
  title: string;
  body: string;
  emoji: string;
  floaters: readonly string[];
  okText?: string;
}

/**
 * 把假控件按种类渲染出来。
 *
 * ⚠️ 按项目约定用穷尽 switch + never 兜底，不要写成按 kind 的三元表达式 ——
 * 以后给 FakeControl 加一种控件（比如日期选择器），三元式会静默漏掉，
 * 这里 tsc 会当场报错。
 */
function ControlPreview({ control }: { control: FakeControl }) {
  switch (control.kind) {
    case 'switch':
      // 用 defaultChecked（非受控）—— 受控但没 onChange 会被 React 警告
      return <Switch defaultChecked={control.default} />;

    case 'select':
      return (
        <Select
          value={control.default}
          options={control.options.map((v) => ({ value: v, label: v }))}
          style={{ width: 156 }}
        />
      );

    case 'segmented':
      return <Segmented value={control.default} options={control.options} />;

    case 'slider':
      return (
        <div style={{ width: 132 }}>
          <Slider value={control.default} min={control.min} max={control.max} />
          <div style={{ textAlign: 'right', fontSize: 12, color: '#94A3B8', marginTop: -6 }}>
            {control.default}
            {control.unit ?? ''}
          </div>
        </div>
      );

    default: {
      const unhandled: never = control;
      return unhandled;
    }
  }
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const [joke, setJoke] = useState<JokeState | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  /** 点了假选项 —— 把选项名嵌进台词，让用户知道「你点的那条我收到了」 */
  const openFake = (label: string) => {
    setJoke({
      title: LAZY_LINES.title,
      body: `「${label}」${LAZY_LINES.body}`,
      emoji: LAZY_LINES.emoji,
      floaters: LAZY_LINES.floaters,
    });
  };

  const openAdminApply = () => {
    setJoke({
      title: ADMIN_APPLY_LINES.title,
      body: ADMIN_APPLY_LINES.body,
      emoji: ADMIN_APPLY_LINES.emoji,
      floaters: ADMIN_APPLY_LINES.floaters,
      okText: '我这就去',
    });
  };

  /** 唯一真有用的那个 —— 和 Layout 里的退出逻辑保持一致 */
  const handleSignOut = async () => {
    setSigningOut(true);
    // signOut 内部会清掉内存缓存（cacheClear），否则下一个登录的人
    // 会读到上一个人留下的列表数据
    await signOut();
    message.success('已退出登录');
    navigate('/login', { replace: true });
  };

  return (
    <div style={{ maxWidth: 780 }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#0F172A' }}>设置</h2>
        <div style={{ fontSize: 13, color: '#94A3B8', marginTop: 4 }}>
          按你的习惯调整这个系统
        </div>
      </div>

      {SETTING_GROUPS.map((group) => (
        <Card
          key={group.key}
          title={<span style={{ fontSize: 15, fontWeight: 600 }}>{group.title}</span>}
          style={{ marginBottom: 16, borderRadius: 14 }}
          styles={{ body: { padding: 0 } }}
        >
          {group.items.map((item, idx) => (
            <div
              key={item.id}
              onClick={() => openFake(item.label)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
                padding: '14px 18px',
                cursor: 'pointer',
                borderTop: idx === 0 ? 'none' : '1px solid #F1F5F9',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#F8FAFC';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, color: '#0F172A', fontWeight: 500 }}>
                  {item.label}
                </div>
                <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 3 }}>{item.hint}</div>
              </div>
              {/* 点击穿透到整行 —— 所以控件是"看得见、摸不着"的 */}
              <div style={{ flexShrink: 0, pointerEvents: 'none' }}>
                <ControlPreview control={item.control} />
              </div>
            </div>
          ))}
        </Card>
      ))}

      {/* 申请管理员 —— 也是假的，但台词另配一套 */}
      <Card
        title={<span style={{ fontSize: 15, fontWeight: 600 }}>权限</span>}
        style={{ marginBottom: 16, borderRadius: 14 }}
        styles={{ body: { padding: 0 } }}
      >
        <div
          onClick={openAdminApply}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            padding: '14px 18px',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#F8FAFC';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
          }}
        >
          <div>
            <div style={{ fontSize: 14, color: '#0F172A', fontWeight: 500 }}>
              <CrownOutlined style={{ color: '#F59E0B', marginRight: 8 }} />
              申请成为管理员
            </div>
            <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 3 }}>
              获得物品录入、借记记录、钉钉同步等权限
            </div>
          </div>
          <Button style={{ flexShrink: 0 }}>去申请</Button>
        </div>
      </Card>

      {/* ⭐ 这一整页唯一真有用的东西 */}
      <Card
        title={<span style={{ fontSize: 15, fontWeight: 600 }}>账号</span>}
        style={{ marginBottom: 16, borderRadius: 14 }}
        styles={{ body: { padding: 18 } }}
      >
        <div style={{ fontSize: 12, color: '#94A3B8', marginBottom: 12 }}>
          <WarningOutlined style={{ marginRight: 6 }} />
          退出后需要重新登录才能继续使用（这一条是真的）
        </div>
        <Button
          danger
          block
          size="large"
          icon={<LogoutOutlined />}
          loading={signingOut}
          onClick={() => void handleSignOut()}
          style={{ height: 44 }}
        >
          退出登录
        </Button>
      </Card>

      <div style={{ textAlign: 'center', fontSize: 11, color: '#CBD5E1', paddingBottom: 8 }}>
        水利水电学院物品管理系统 · v{__APP_VERSION__}
      </div>

      <NotImplementedModal
        open={joke !== null}
        onClose={() => setJoke(null)}
        emoji={joke?.emoji ?? ''}
        floaters={joke?.floaters ?? []}
        title={joke?.title ?? ''}
        body={joke?.body ?? ''}
        okText={joke?.okText}
      />
    </div>
  );
}
