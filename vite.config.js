import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  ssr: {
    external: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
    noExternal: ['@ckeditor/**']
  },
  build: {
    rollupOptions: {
      external: ['ckeditor5-svelte', '@visao/ckeditor5-video/src/video']
    }
  }
});
