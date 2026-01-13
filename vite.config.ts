
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // 리포지토리 이름이 SlideStreamAI인 경우를 대비하되, 
  // 상대 경로인 './'를 사용하여 경로 문제 가능성을 최소화합니다.
  base: './', 
  define: {
    'process.env.API_KEY': JSON.stringify(process.env.API_KEY)
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  }
});
