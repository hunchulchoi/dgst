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
    // getClientAddress()가 실제 클라이언트 IP를 쓰려면 실행 시 환경변수 필요:
    // ADDRESS_HEADER=x-forwarded-for, (프록시 1대면) XFF_DEPTH=2
    adapter: adapter(),
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
