<script>
  import { getContext } from 'svelte';
  import { DROPDOWN_CTX } from './dropdown-context.js';

  let {
    divider = false,
    class: className = '',
    onclick,
    children,
    ...rest
  } = $props();

  const ctx = getContext(DROPDOWN_CTX);

  function handleClick(e) {
    ctx.close();
    onclick?.(e);
  }
</script>

{#if divider}
  <li><hr class="dropdown-divider" /></li>
{:else}
  <li>
    <button type="button" class="dropdown-item {className}" onclick={handleClick} {...rest}>
      {@render children()}
    </button>
  </li>
{/if}
