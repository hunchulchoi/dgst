import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],

  // SSR 외부화
  ssr: {
    external: ['@ffmpeg/ffmpeg', '@ffmpeg/util']
  },

  // 최적화에서 제외 (FFmpeg WebAssembly)
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util']
  },

  // 개발 서버 설정 (SharedArrayBuffer 지원)
  server: {
    fs: {
      allow: ['..']
    },
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin'
    }
  },

  // 프로덕션 빌드 설정
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('@ffmpeg')) {
            return 'ffmpeg';
          }
        }
      }
    }
  }
});
