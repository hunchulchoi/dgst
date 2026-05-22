<script>
  import { browser } from '$app/environment';
  import theme from '$lib/shared/stores/theme.js';
  import { applyDocumentTheme, resolveTheme } from '$lib/util/applyDocumentTheme.js';

  $effect(() => {
    if (!browser) return;
    applyDocumentTheme(resolveTheme($theme));
  });
</script>
