<script>
  import { getContext } from 'svelte';
  import { DROPDOWN_CTX } from './dropdown-context.js';

  let { end = false, class: className = '', children } = $props();
  const ctx = getContext(DROPDOWN_CTX);
</script>

{#if ctx.getOpen()}
  <ul class="dropdown-menu show {end ? 'dropdown-menu-end' : ''} {className}">
    {@render children()}
  </ul>
{/if}
