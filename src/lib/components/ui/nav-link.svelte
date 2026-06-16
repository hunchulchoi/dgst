<script>
  import { resolve } from '$app/paths';

  let {
    href = undefined,
    active = false,
    class: className = '',
    onclick = undefined,
    children,
    ...rest
  } = $props();

  const resolvedHref = $derived(
    typeof href === 'string' && href.startsWith('/') ? resolve(/** @type {any} */ (href)) : href
  );
</script>

{#if resolvedHref}
  <a
    class="nav-link dgst-nav-link {active ? 'active' : ''} {className}"
    href={resolvedHref}
    aria-current={active ? 'page' : undefined}
    {onclick}
    {...rest}
  >
    {@render children()}
  </a>
{:else}
  <button
    type="button"
    class="nav-link dgst-nav-link {active ? 'active' : ''} {className} border-0 bg-transparent"
    {onclick}
    {...rest}
  >
    {@render children()}
  </button>
{/if}
