
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // base를 './'로 설정하면 어떤 하위 경로에서도 정적 파일을 잘 불러옵니다.
  base: './', 
  define: {
    // 환경 변수 주입 방식 통일
    'process.env.API_KEY': JSON.stringify(process.env.API_KEY || '')
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    // 배포 시 용량 최적화
    minify: 'esbuild',
    reportCompressedSize: false
  }
});
