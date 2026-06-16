import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Breadcrumb } from 'antd';
import { HomeOutlined } from '@ant-design/icons';

/** 路由路径 → 面包屑标签映射 */
const ROUTE_LABELS: Record<string, string> = {
  '/': '仪表盘',
  '/items': '物品管理',
  '/items/add': '添加物品',
  '/records': '借记记录',
};

/** 动态路由模式匹配 */
function resolveLabel(pathname: string): string {
  // 精确匹配
  if (ROUTE_LABELS[pathname]) return ROUTE_LABELS[pathname];

  // 动态路由匹配（仅匹配有实际页面的路由）
  if (/^\/items\/[^/]+\/edit$/.test(pathname)) return '编辑物品';
  if (/^\/items\/[^/]+\/borrow$/.test(pathname)) return '借用物品';

  return '';
}

/** 将路径解析为面包屑层级列表 */
function parsePath(pathname: string): { label: string; path: string }[] {
  const segments = pathname.split('/').filter(Boolean);

  // 首页
  if (segments.length === 0) {
    return [{ label: '仪表盘', path: '/' }];
  }

  const items: { label: string; path: string }[] = [];

  // 逐级构建路径
  let accum = '';
  for (const seg of segments) {
    accum += '/' + seg;
    const label = resolveLabel(accum);
    if (label) {
      items.push({ label, path: accum });
    }
  }

  // 确保至少有首页
  if (items.length === 0 || items[0].path !== '/') {
    items.unshift({ label: '仪表盘', path: '/' });
  }

  return items;
}

export default function BreadcrumbNav() {
  const location = useLocation();
  const navigate = useNavigate();

  const items = useMemo(() => parsePath(location.pathname), [location.pathname]);

  // 只有非首页时显示完整面包屑
  if (items.length <= 1) {
    return (
      <div style={{ marginBottom: 12, fontSize: 12, color: '#94A3B8' }}>
        <HomeOutlined style={{ marginRight: 4 }} />
        仪表盘
      </div>
    );
  }

  return (
    <Breadcrumb
      style={{ marginBottom: 12, fontSize: 13 }}
      items={items.map((item, idx) => ({
        title:
          idx === items.length - 1 ? (
            // 当前页不可点击
            <span style={{ color: '#0C4A6E', fontWeight: 500 }}>{item.label}</span>
          ) : (
            // 上级页面可点击跳转
            <span
              onClick={() => navigate(item.path)}
              style={{ cursor: 'pointer', color: '#0EA5E9' }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') navigate(item.path);
              }}
              role="button"
              tabIndex={0}
            >
              {item.label}
            </span>
          ),
      }))}
    />
  );
}
