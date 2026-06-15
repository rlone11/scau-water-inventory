import type { ThemeConfig } from 'antd';

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
