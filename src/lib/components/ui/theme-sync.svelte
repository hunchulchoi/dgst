<script>
  import { browser } from '$app/environment';
  import theme from '$lib/shared/stores/theme.js';

  function resolveTheme(value) {
    if (value === 'dark' || value === 'light') return value;
    if (!browser) return 'light';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  $effect(() => {
    if (!browser) return;
    const resolved = resolveTheme($theme);
    document.documentElement.setAttribute('data-bs-theme', resolved);
  });
</script>
