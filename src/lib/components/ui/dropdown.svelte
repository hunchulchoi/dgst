<script>
  import { setContext } from 'svelte';
  import { DROPDOWN_CTX } from './dropdown-context.js';

  let { nav = false, class: className = '', children } = $props();
  let open = $state(false);

  setContext(DROPDOWN_CTX, {
    getOpen: () => open,
    toggle: () => {
      open = !open;
    },
    close: () => {
      open = false;
    }
  });
</script>

<svelte:window onclick={() => (open = false)} />

<div
  class="{(nav ? 'nav-item ' : '')}dropdown {nav ? '' : 'position-relative'} {className}"
  onclick={(e) => e.stopPropagation()}
>
  {@render children()}
</div>
