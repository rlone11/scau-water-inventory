import { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout as AntLayout, Menu, Button, Drawer, Dropdown, message } from 'antd';
import {
  DashboardOutlined,
  AppstoreOutlined,
  FileTextOutlined,
  MenuOutlined,
  LogoutOutlined,
  UserOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';

const { Header, Sider, Content } = AntLayout;

const menuItems = [
  { key: '/', icon: <DashboardOutlined />, label: '统计仪表盘' },
  { key: '/items', icon: <AppstoreOutlined />, label: '物品管理' },
  { key: '/records', icon: <FileTextOutlined />, label: '借记记录' },
];

export default function MainLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { isAdmin, logout } = useAuth();

  const selectedKey = '/' + location.pathname.split('/').filter(Boolean)[0] || '/';

  const handleMenuClick = (info: { key: string }) => {
    navigate(info.key);
    setMobileOpen(false);
  };

  const handleLogout = () => {
    logout();
    message.success('已退出管理员模式');
    navigate('/');
  };

  const sidebarContent = (
    <div className="sidebar-water" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Logo area */}
      <div
        style={{
          padding: collapsed ? '16px 12px' : '18px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: collapsed ? 0 : 10,
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          justifyContent: collapsed ? 'center' : 'flex-start',
        }}
      >
        <img
          src={`${import.meta.env.BASE_URL}images/镂空院徽2.png`}
          alt="水利水电学院"
          style={{
            width: collapsed ? 36 : 40,
            height: collapsed ? 36 : 40,
            flexShrink: 0,
            filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))',
          }}
        />
        {!collapsed && (
          <div style={{ overflow: 'hidden' }}>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 14, lineHeight: 1.3, whiteSpace: 'nowrap' }}>
              水利水电学院
            </div>
            <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, whiteSpace: 'nowrap' }}>
              物品管理系统
            </div>
          </div>
        )}
      </div>

      {/* Menu */}
      <Menu
        theme="dark"
        mode="inline"
        selectedKeys={[selectedKey]}
        items={menuItems}
        onClick={handleMenuClick}
        style={{ borderInlineEnd: 'none', marginTop: 8, flex: 1 }}
      />

      {/* Bottom - motto image */}
      {!collapsed && (
        <div
          style={{
            padding: '12px 16px',
            borderTop: '1px solid rgba(255,255,255,0.06)',
            textAlign: 'center',
          }}
        >
          <img
            src={`${import.meta.env.BASE_URL}images/上善若水,知行合一.png`}
            alt="上善若水·知行合一"
            style={{
              width: '100%',
              maxWidth: 160,
              opacity: 0.7,
              filter: 'brightness(0) invert(1)',
            }}
          />
        </div>
      )}
    </div>
  );

  return (
    <AntLayout style={{ minHeight: '100vh' }}>
      {/* Desktop sidebar */}
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        breakpoint="lg"
        collapsedWidth={64}
        width={220}
        style={{
          overflow: 'auto',
          height: '100vh',
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          zIndex: 100,
          boxShadow: '2px 0 12px rgba(0,0,0,0.08)',
        }}
        className="sidebar-water"
      >
        {sidebarContent}
      </Sider>

      {/* Mobile drawer */}
      <Drawer
        placement="left"
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        width={240}
        className="mobile-drawer"
        styles={{
          body: { padding: 0, background: '#0C4A6E' },
          header: { background: '#0C4A6E', borderBottom: '1px solid rgba(255,255,255,0.08)' },
        }}
        title={<span style={{ color: '#fff', fontSize: 14 }}>水利水电学院</span>}
        closeIcon={<span style={{ color: '#fff' }}>✕</span>}
      >
        {sidebarContent}
      </Drawer>

      {/* Main content area */}
      <AntLayout style={{ marginLeft: collapsed ? 64 : 220, transition: 'margin-left 0.2s' }}>
        {/* Header */}
        <Header
          style={{
            background: 'linear-gradient(135deg, #0369A1 0%, #075985 100%)',
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: 64,
            lineHeight: 'normal',
            position: 'sticky',
            top: 0,
            zIndex: 99,
            boxShadow: '0 2px 12px rgba(0,0,0,0.1)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Button
              type="text"
              icon={<MenuOutlined style={{ color: '#fff', fontSize: 18 }} />}
              onClick={() => setMobileOpen(true)}
              style={{ display: 'none' }}
              className="mobile-menu-btn"
            />
            <div className="header-logo">
              <img
                src={`${import.meta.env.BASE_URL}images/矢量四川农业大学校徽_副本.png`}
                alt="四川农业大学"
                style={{ height: 32, filter: 'brightness(0) invert(1)' }}
              />
              <div style={{ borderLeft: '1px solid rgba(255,255,255,0.3)', height: 28, margin: '0 4px' }} />
              <div>
                <div className="header-title">水利水电学院</div>
                <div className="header-subtitle">物品统计管理系统</div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isAdmin ? (
              <Dropdown
                menu={{
                  items: [
                    {
                      key: 'logout',
                      icon: <LogoutOutlined />,
                      label: '退出管理',
                      onClick: handleLogout,
                    },
                  ],
                }}
                placement="bottomRight"
              >
                <Button type="text" icon={<SettingOutlined />} style={{ color: '#fff' }}>
                  <span className="header-subtitle">管理员</span>
                </Button>
              </Dropdown>
            ) : (
              <Button
                type="text"
                icon={<UserOutlined />}
                style={{ color: '#fff' }}
                onClick={() => navigate('/login')}
              >
                <span className="header-subtitle">登录</span>
              </Button>
            )}
          </div>
        </Header>

        {/* Page content */}
        <Content style={{ padding: '16px 24px', maxWidth: 1200, margin: '0 auto', width: '100%' }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </Content>

        {/* Footer */}
        <div
          style={{
            textAlign: 'center',
            padding: '12px 16px',
            color: 'rgba(0,0,0,0.25)',
            fontSize: 11,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}
        >
          <img
            src={`${import.meta.env.BASE_URL}images/上善若水,知行合一.png`}
            alt="上善若水 知行合一"
            style={{ height: 16, opacity: 0.4 }}
          />
          <span>· 四川农业大学水利水电学院 · {'© '} {new Date().getFullYear()}</span>
        </div>
      </AntLayout>

      {/* Mobile responsive styles */}
      <style>{`
        @media (max-width: 992px) {
          .ant-layout-sider { display: none !important; }
          .ant-layout { margin-left: 0 !important; }
          .mobile-menu-btn { display: inline-flex !important; }
        }
      `}</style>
    </AntLayout>
  );
}
