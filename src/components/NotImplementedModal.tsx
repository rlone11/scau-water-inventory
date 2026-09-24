import { useEffect, useState } from 'react';
import { Modal, Button } from 'antd';
import { motion } from 'framer-motion';
import { entrySpring } from '../lib/motion';

/**
 * 「这个功能没做」的玩笑弹窗 —— 设置页彩蛋的一部分。
 *
 * 一个大表情弹簧弹入后原地摇晃，周围飘几个小表情升上去。台词由调用方传，
 * 所以同一个弹窗既能吐槽「创作者太懒」，也能可怜巴巴地「你去线下求求他」。
 *
 * ⚠️ 动画重播靠 `runId` 这个计数器，不能用 `{open && ...}`：
 * Modal 关闭时会把子元素留着播淡出动画，条件渲染会让它在淡出途中变空盒子。
 * 计数器只在 `open` 由 false 变 true 时 +1，所以开的时候重播、关的时候不动。
 */
interface Props {
  open: boolean;
  onClose: () => void;
  /** 居中那个大表情 */
  emoji: string;
  /** 往上升的小表情，循环飘 */
  floaters?: readonly string[];
  title: string;
  body: string;
  okText?: string;
}

export default function NotImplementedModal({
  open,
  onClose,
  emoji,
  floaters = [],
  title,
  body,
  okText = '好吧',
}: Props) {
  /** 每开一次 +1，用来强制大表情重播入场动画 */
  const [runId, setRunId] = useState(0);
  useEffect(() => {
    if (open) setRunId((n) => n + 1);
  }, [open]);

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      centered
      width={340}
      closable={false}
      maskClosable
    >
      <div style={{ textAlign: 'center', padding: '8px 0 4px' }}>
        {/* 表情舞台：大表情 + 往上升的小表情 */}
        <div
          style={{
            position: 'relative',
            height: 116,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          {/* 小表情：从底部升起、淡入淡出，错开时间循环 */}
          {floaters.map((f, i) => (
            <motion.span
              key={i}
              aria-hidden
              style={{
                position: 'absolute',
                bottom: 0,
                left: `${12 + i * 18}%`,
                fontSize: 16,
                opacity: 0,
                pointerEvents: 'none',
              }}
              animate={{ y: [-6, -84], opacity: [0, 0.85, 0], rotate: [0, i % 2 ? 18 : -18] }}
              transition={{
                duration: 2.4,
                repeat: Infinity,
                delay: i * 0.42,
                ease: 'easeOut',
              }}
            >
              {f}
            </motion.span>
          ))}

          {/* 大表情：弹簧弹入（临界阻尼，不会抽动），落位后原地慢慢晃 */}
          <motion.div
            key={runId}
            initial={{ scale: 0, rotate: -28, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={entrySpring(240)}
            style={{ fontSize: 64, lineHeight: 1, position: 'relative' }}
          >
            <motion.span
              style={{ display: 'inline-block' }}
              animate={{ rotate: [-7, 7, -7], y: [0, -4, 0] }}
              transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
            >
              {emoji}
            </motion.span>
          </motion.div>
        </div>

        <div style={{ fontSize: 17, fontWeight: 700, color: '#0F172A', marginTop: 4 }}>
          {title}
        </div>
        <div style={{ fontSize: 14, color: '#64748B', marginTop: 8, lineHeight: 1.7 }}>
          {body}
        </div>

        <Button
          type="primary"
          block
          size="large"
          onClick={onClose}
          style={{
            marginTop: 20,
            height: 42,
            background: 'linear-gradient(135deg, #0EA5E9, #0284C7)',
            border: 'none',
          }}
        >
          {okText}
        </Button>
      </div>
    </Modal>
  );
}
