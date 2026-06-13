import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'vite';

/**
 * @returns {import('vite').Plugin}
 */
function rootRelativeSvelteKitPreloadDeps() {
  const immutableDir = join('.svelte-kit', 'output', 'client', '_app', 'immutable');

  /**
   * @param {string} dir
   */
  function rewriteJsFiles(dir) {
    if (!existsSync(dir)) return;

    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        rewriteJsFiles(path);
        continue;
      }

      if (!entry.isFile() || !entry.name.endsWith('.js')) continue;

      const original = readFileSync(path, 'utf8');
      const rewritten = original.replaceAll('"./_app/immutable/', '"/_app/immutable/');
      if (rewritten !== original) {
        writeFileSync(path, rewritten);
      }
    }
  }

  return {
    name: 'dgst-root-relative-sveltekit-preload-deps',
    apply: 'build',
    enforce: 'post',
    writeBundle() {
      rewriteJsFiles(immutableDir);
    }
  };
}

export default defineConfig({
  plugins: [tailwindcss(), sveltekit(), rootRelativeSvelteKitPreloadDeps()],

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
    // Avoid shipping syntax that older iOS Safari cannot parse in lazy-loaded editor chunks.
    target: ['es2020', 'safari14'],
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
  }
});
