import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { captureDingTalkCallback } from './lib/dingtalkRedirect';
import './styles/global.css';

const basename = import.meta.env.BASE_URL === '/' ? '/' : '/scau-water-inventory';

/**
 * ⚠️ 必须在渲染之前，一步都不能往后挪。
 *
 * 手机端钉钉授权完会跳回 `/?authCode=xxx&state=xxx`，而未登录时 RouteGuard
 * 会把人 `<Navigate to="/login" replace />` —— 查询参数在那一跳就被丢光了，
 * 等登录页挂载出来再读，地址栏里已经什么都没有。这里先抓走存进
 * sessionStorage，再把参数从地址栏抹掉（authCode 是凭据，不该留在历史和
 * Referer 里）。详见 lib/dingtalkRedirect.ts。
 */
captureDingTalkCallback();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={basename}>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
