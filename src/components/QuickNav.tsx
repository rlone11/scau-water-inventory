import { useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Tooltip } from 'antd';
import {
  ArrowLeftOutlined,
  HomeOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';

/** 需要显示快捷导航的深度页面 */
const DEEP_PAGE_PATTERNS = [
  /^\/items\/add$/,
  /^\/items\/[^/]+\/edit$/,
  /^\/items\/[^/]+\/borrow$/,
  /^\/record[s]?$/,
];

function isDeepPage(pathname: string): boolean {
  return DEEP_PAGE_PATTERNS.some((p) => p.test(pathname));
}

const buttonStyle: React.CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 10,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  background: 'rgba(255,255,255,0.95)',
  border: '1px solid #E2E8F0',
  color: '#475569',
  fontSize: 16,
  transition: 'all 0.2s',
};

export default function QuickNav() {
  const navigate = useNavigate();
  const location = useLocation();

  const visible = useMemo(() => isDeepPage(location.pathname), [location.pathname]);

  const handleBack = () => {
    window.history.back();
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, x: -20, y: 10 }}
          animate={{ opacity: 1, x: 0, y: 0 }}
          exit={{ opacity: 0, x: -20, y: 10 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          style={{
            position: 'fixed',
            bottom: 28,
            left: 28,
            zIndex: 90,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          {/* 返回上一步 */}
          <Tooltip title="返回上一步 (Alt+←)" placement="right">
            <motion.div
              style={buttonStyle}
              onClick={handleBack}
              whileHover={{
                scale: 1.08,
                background: '#EFF6FF',
                borderColor: '#0EA5E9',
                color: '#0EA5E9',
              }}
              whileTap={{ scale: 0.95 }}
            >
              <ArrowLeftOutlined />
            </motion.div>
          </Tooltip>

          {/* 回到仪表盘 */}
          <Tooltip title="仪表盘 (Alt+1)" placement="right">
            <motion.div
              style={buttonStyle}
              onClick={() => navigate('/')}
              whileHover={{
                scale: 1.08,
                background: '#F0FDF4',
                borderColor: '#10B981',
                color: '#10B981',
              }}
              whileTap={{ scale: 0.95 }}
            >
              <HomeOutlined />
            </motion.div>
          </Tooltip>

          {/* 物品管理列表 */}
          <Tooltip title="物品管理 (Alt+2)" placement="right">
            <motion.div
              style={buttonStyle}
              onClick={() => navigate('/items')}
              whileHover={{
                scale: 1.08,
                background: '#EFF6FF',
                borderColor: '#0EA5E9',
                color: '#0EA5E9',
              }}
              whileTap={{ scale: 0.95 }}
            >
              <AppstoreOutlined />
            </motion.div>
          </Tooltip>

          {/* 快捷键提示 */}
          <div
            style={{
              fontSize: 10,
              color: '#94A3B8',
              textAlign: 'center',
              lineHeight: 1.4,
              userSelect: 'none',
              pointerEvents: 'none',
            }}
          >
            Alt+1/2/3
            <br />
            快捷导航
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
