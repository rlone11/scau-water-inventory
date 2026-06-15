import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/scau-water-inventory/',
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
          xlsx: ['xlsx'],
        },
      },
    },
  },
});
