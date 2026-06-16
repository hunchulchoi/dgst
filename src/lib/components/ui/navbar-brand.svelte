<script>
  import { resolve } from '$app/paths';

  let { href = '/', class: className = '', children, ...rest } = $props();

  const resolvedHref = $derived(
    typeof href === 'string' && href.startsWith('/') ? resolve(/** @type {any} */ (href)) : href
  );
</script>

<a class="navbar-brand {className}" href={resolvedHref} {...rest}>
  {@render children()}
</a>
