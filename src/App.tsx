import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { ConfigProvider, App as AntApp, Spin } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import theme from './theme';
import { AuthProvider } from './contexts/AuthContext';
import MainLayout from './components/Layout';
import RouteGuard, { AdminOnly } from './components/RouteGuard';
import ErrorBoundary from './components/ErrorBoundary';
import CursorEffects from './components/CursorEffects';
import LoginPage from './pages/LoginPage';

// 管理页面懒加载 — 登录页不下载 recharts(367KB) + xlsx(283KB)
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const ItemListPage = lazy(() => import('./pages/ItemListPage'));
const ItemFormPage = lazy(() => import('./pages/ItemFormPage'));
const BorrowPage = lazy(() => import('./pages/BorrowPage'));
const RecordsPage = lazy(() => import('./pages/RecordsPage'));
const DingTalkPage = lazy(() => import('./pages/DingTalkPage'));
const ReturnPage = lazy(() => import('./pages/ReturnPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

const Loading = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
    <Spin size="large" />
  </div>
);

function App() {
  return (
    <ConfigProvider theme={theme} locale={zhCN}>
      <AntApp>
        <ErrorBoundary>
        <AuthProvider>
          <CursorEffects />
          <Suspense fallback={<Loading />}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              {/* 守卫套在 MainLayout 外面 —— 必须赶在它挂载前拦住，
                  否则它的 schedulePrefetch 会先打一批注定被拒的请求 */}
              <Route element={<RouteGuard />}>
                <Route element={<MainLayout />}>
                  {/* 所有登录用户：看库存、借东西 */}
                  <Route path="/" element={<DashboardPage />} />
                  <Route path="/items" element={<ItemListPage />} />
                  <Route path="/items/:id/borrow" element={<BorrowPage />} />

                  {/* 仅管理员 */}
                  <Route element={<AdminOnly />}>
                    <Route path="/items/add" element={<ItemFormPage />} />
                    <Route path="/items/:id/edit" element={<ItemFormPage />} />
                    <Route path="/records" element={<RecordsPage />} />
                    <Route path="/dingtalk" element={<DingTalkPage />} />
                    <Route path="/returns" element={<ReturnPage />} />
                  </Route>

                  <Route path="*" element={<NotFoundPage />} />
                </Route>
              </Route>
            </Routes>
          </Suspense>
        </AuthProvider>
        </ErrorBoundary>
      </AntApp>
    </ConfigProvider>
  );
}

export default App;
