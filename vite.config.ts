import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
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
