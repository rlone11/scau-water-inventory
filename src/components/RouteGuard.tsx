import { Navigate, Outlet } from 'react-router-dom';
import { Spin } from 'antd';
import { useAuth } from '../contexts/AuthContext';

/**
 * 路由守卫 —— 未登录一律弹回登录页。
 *
 * 2026-09-20 之前项目里**根本没有守卫**：未登录直接敲 /items、/records、
 * /dingtalk 全都能打开，只是把按钮藏了起来。真正把数据挡住的是数据库
 * RLS，这一层负责的是体验（别让人对着一个空壳页面发呆）。
 *
 * ⚠️ 必须挡在 MainLayout 之前。MainLayout 挂载时就会 schedulePrefetch()，
 * 未登录时那一批请求会被 RLS 全部拒绝，控制台刷屏。
 */
export default function RouteGuard() {
  const { role, loading } = useAuth();

  // 会话还在读：先憋住，否则刷新页面会闪一下登录页
  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
        }}
      >
        <Spin size="large" />
      </div>
    );
  }

  if (!role) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

/**
 * 只放行管理员的路由层。
 *
 * 数据安全不靠它 —— 访客就算绕过这里，RLS 也不会给任何记录。
 * 它解决的是体验：别让人对着一个永远转圈、或者报一堆权限错误的空壳页面发呆。
 */
export function AdminOnly() {
  const { isAdmin, loading } = useAuth();

  if (loading) return null;
  if (!isAdmin) return <Navigate to="/" replace />;

  return <Outlet />;
}
