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
