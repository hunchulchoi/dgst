<script>
  import { resolve } from '$app/paths';
  import Icon from './icon.svelte';

  let {
    href = '#',
    first = false,
    last = false,
    active = false,
    onclick,
    class: className = '',
    children = undefined,
    ...rest
  } = $props();

  const resolvedHref = $derived(
    typeof href === 'string' && href.startsWith('/') ? resolve(href) : href
  );
</script>

<a
  class="page-link {className}"
  href={resolvedHref}
  aria-current={active ? 'page' : undefined}
  {onclick}
  {...rest}
>
  {#if first}
    <Icon name="chevron-double-left" />
  {:else if last}
    <Icon name="chevron-double-right" />
  {:else}
    {@render children?.()}
  {/if}
</a>
