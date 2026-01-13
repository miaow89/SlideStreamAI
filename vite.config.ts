
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub 리포지토리 이름이 SlideStreamAI인 경우 반드시 이 경로로 설정해야 합니다.
  base: '/SlideStreamAI/', 
  define: {
    'process.env.API_KEY': JSON.stringify(process.env.API_KEY)
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  }
});
