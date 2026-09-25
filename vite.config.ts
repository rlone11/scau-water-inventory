import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json';

export default defineConfig({
  // 版本号在构建时替换成字面量（不会把整个 package.json 打进客户端包），
  // 页脚用它显示当前版本 —— 以前版本号只活在对话和备份文件夹名里，代码查不到
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [react()],
  base: process.env.VITE_DEPLOY_TARGET ? '/' : '/scau-water-inventory/',
  server: {
    port: 3000,
    open: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          antd: ['antd', '@ant-design/icons'],
          recharts: ['recharts'],
          framer: ['framer-motion'],
          // xlsx 不列入：它现在由业务代码动态 import，Rollup 会自动分成独立分包，
          // 此处再写一遍是多余的（实测两种写法产物完全一致）
        },
      },
    },
  },
});
