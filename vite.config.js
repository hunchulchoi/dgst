import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],

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
    // heic2any WASM (~1.35MB) — QuillEditor에서 dynamic import, 추가 분할 불가
    chunkSizeWarningLimit: 1400,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('@ffmpeg')) {
            return 'ffmpeg';
          }
          if (id.includes('node_modules/heic2any')) {
            return 'heic2any';
          }
          if (id.includes('node_modules/quill')) {
            return 'quill';
          }
          if (id.includes('node_modules/prismjs')) {
            return 'prism';
          }
          if (id.includes('node_modules/marked')) {
            return 'marked';
          }
          if (id.includes('node_modules/sanitize-html')) {
            return 'sanitize-html';
          }
        }
      }
    }
  },

  // 프로덕션에서 console 제거
  esbuild: {
    drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : []
  }
});
