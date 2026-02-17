import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  compilerOptions: {
    compatibility: {
      componentApi: 4
    }
  },
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      // Nginx가 보낸 헤더를 사용하도록 설정
      addressHeader: 'x-forwarded-for'
      // 프록시가 여러 단계라면: trustedProxies: ['127.0.0.1']
    }),
    paths: {
      assets: '',
      relative: false
    },
    prerender: {
      entries: ['/index']
    }
  }
};

export default config;
