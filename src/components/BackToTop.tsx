import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { VerticalAlignTopOutlined } from '@ant-design/icons';

export default function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setVisible(window.scrollY > window.innerHeight);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, scale: 0, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0, y: 20 }}
          transition={{ type: 'spring', stiffness: 300, damping: 18 }}
          onClick={scrollToTop}
          style={{
            position: 'fixed',
            bottom: 28,
            right: 28,
            zIndex: 90,
            width: 44,
            height: 44,
            borderRadius: '50% 50% 50% 50% / 60% 60% 40% 40%',
            background: 'linear-gradient(135deg, #0EA5E9, #0284C7)',
            boxShadow: '0 4px 20px rgba(14, 165, 233, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            overflow: 'hidden',
          }}
          whileHover={{ scale: 1.1, y: -3 }}
          whileTap={{ scale: 0.95 }}
        >
          {/* Water flow-up overlay on hover */}
          <motion.div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(0deg, rgba(255,255,255,0.3) 0%, transparent 60%)',
              borderRadius: 'inherit',
            }}
            initial={{ y: '100%' }}
            whileHover={{ y: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          />
          <VerticalAlignTopOutlined style={{ fontSize: 18, color: '#fff', position: 'relative', zIndex: 1 }} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
