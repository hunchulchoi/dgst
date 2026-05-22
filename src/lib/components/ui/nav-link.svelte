<script>
  let {
    href = undefined,
    active = false,
    class: className = '',
    onclick,
    children,
    ...rest
  } = $props();
</script>

{#if href}
  <a
    class="nav-link dgst-nav-link {active ? 'active' : ''} {className}"
    {href}
    aria-current={active ? 'page' : undefined}
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
