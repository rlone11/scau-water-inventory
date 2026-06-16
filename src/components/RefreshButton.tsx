import { useState, useCallback } from 'react';
import { Button, Tooltip } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { motion } from 'framer-motion';
import { triggerRefresh } from '../lib/events';

export default function RefreshButton() {
  const [spinning, setSpinning] = useState(false);

  const handleRefresh = useCallback(() => {
    if (spinning) return;
    setSpinning(true);
    triggerRefresh();
    // 动画持续 800ms 后自动恢复
    setTimeout(() => setSpinning(false), 800);
  }, [spinning]);

  return (
    <Tooltip title="刷新数据 (Alt+R)" placement="bottom">
      <Button
        type="text"
        icon={
          <motion.span
            style={{ display: 'inline-flex', fontSize: 18 }}
            animate={{ rotate: spinning ? 360 : 0 }}
            transition={{ duration: 0.6, ease: [0.34, 1.56, 0.64, 1] }}
          >
            <ReloadOutlined style={{ color: '#fff' }} />
          </motion.span>
        }
        onClick={handleRefresh}
        style={{ color: '#fff' }}
      />
    </Tooltip>
  );
}
