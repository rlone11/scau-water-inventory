import type { ThemeConfig } from 'antd';

/**
 * 登录页背景渐变。
 *
 * ⚠️ 必须让登录页和入场动画引用同一个常量。动画覆盖层是**不透明**的
 * （靠最后淡出来交接），它和底下的登录页必须严丝合缝 —— 两边各写一遍
 * 渐变字符串，改了一处忘了另一处，交接瞬间就会出现一道色差。
 */
export const LOGIN_GRADIENT =
  'linear-gradient(135deg, #0369A1 0%, #0C4A6E 50%, #075985 100%)';

/** 登录页顶部院徽的 DOM id —— 入场动画靠它量出飞行终点 */
export const LOGIN_EMBLEM_ID = 'login-emblem';

const theme: ThemeConfig = {
  token: {
    colorPrimary: '#0EA5E9',
    colorInfo: '#0EA5E9',
    colorSuccess: '#10B981',
    colorWarning: '#F59E0B',
    colorError: '#EF4444',
    colorLink: '#0284C7',
    borderRadius: 8,
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans SC', sans-serif",
    colorBgContainer: '#ffffff',
    colorBgLayout: '#F0F7FB',
    colorBorder: '#BAE6FD',
  },
  components: {
    Layout: {
      headerBg: '#0369A1',
      siderBg: '#0C4A6E',
      triggerBg: '#075985',
    },
    Menu: {
      darkItemBg: '#0C4A6E',
      darkItemSelectedBg: '#0EA5E9',
      darkItemHoverBg: 'rgba(14, 165, 233, 0.2)',
    },
    Card: {
      borderRadiusLG: 12,
    },
    Button: {
      borderRadius: 8,
      controlHeight: 40,
    },
    Table: {
      headerBg: '#E0F2FE',
      headerColor: '#0C4A6E',
      rowHoverBg: '#F0F9FF',
    },
    Tag: {
      borderRadiusSM: 4,
    },
  },
};

export default theme;
