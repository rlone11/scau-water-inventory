import { useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

/** 检查焦点是否在输入元素上（避免快捷键干扰打字） */
function isInputFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}

/**
 * 全局键盘快捷键
 * - Alt+1 → 仪表盘
 * - Alt+2 → 物品管理
 * - Alt+3 → 借记记录
 * - Alt+← → 返回上一页
 */
export function useKeyboardShortcuts() {
  const navigate = useNavigate();
  const location = useLocation();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // 输入框中不触发快捷键
      if (isInputFocused()) return;

      // 需要 Alt 修饰键
      if (!e.altKey) return;

      switch (e.key) {
        case '1':
          e.preventDefault();
          if (location.pathname !== '/') navigate('/');
          break;
        case '2':
          e.preventDefault();
          if (location.pathname !== '/items') navigate('/items');
          break;
        case '3':
          e.preventDefault();
          if (location.pathname !== '/records') navigate('/records');
          break;
        case 'ArrowLeft':
          e.preventDefault();
          window.history.back();
          break;
        default:
          break;
      }
    },
    [navigate, location.pathname],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
