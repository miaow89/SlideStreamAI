
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub repository 이름이 'SlideStreamAI'라면 '/SlideStreamAI/'로 설정해야 합니다.
  // 커스텀 도메인을 사용한다면 '/'로 설정하세요.
  base: './', 
  define: {
    'process.env.API_KEY': JSON.stringify(process.env.API_KEY)
  }
});
