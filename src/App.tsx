import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { ConfigProvider, App as AntApp, Spin } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import theme from './theme';
import { AuthProvider } from './contexts/AuthContext';
import MainLayout from './components/Layout';
import CursorEffects from './components/CursorEffects';
import LoginPage from './pages/LoginPage';

// 管理页面懒加载 — 登录页不下载 recharts(367KB) + xlsx(283KB)
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const ItemListPage = lazy(() => import('./pages/ItemListPage'));
const ItemFormPage = lazy(() => import('./pages/ItemFormPage'));
const BorrowPage = lazy(() => import('./pages/BorrowPage'));
const RecordsPage = lazy(() => import('./pages/RecordsPage'));
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
        <AuthProvider>
          <CursorEffects />
          <Suspense fallback={<Loading />}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route element={<MainLayout />}>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/items" element={<ItemListPage />} />
                <Route path="/items/add" element={<ItemFormPage />} />
                <Route path="/items/:id/edit" element={<ItemFormPage />} />
                <Route path="/items/:id/borrow" element={<BorrowPage />} />
                <Route path="/records" element={<RecordsPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Routes>
          </Suspense>
        </AuthProvider>
      </AntApp>
    </ConfigProvider>
  );
}

export default App;
