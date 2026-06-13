<script>
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
</script>

<a
  class="page-link {className}"
  {href}
  aria-current={active ? 'page' : undefined}
  onclick={onclick}
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
