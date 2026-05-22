<script>
  import { getContext } from 'svelte';
  import { DROPDOWN_CTX } from './dropdown-context.js';

  let {
    nav = false,
    caret = false,
    class: className = '',
    children,
    ...rest
  } = $props();

  const ctx = getContext(DROPDOWN_CTX);
</script>

<button
  type="button"
  class="{nav ? 'nav-link' : 'btn btn-link'} dropdown-toggle {className}"
  aria-expanded={ctx.getOpen()}
  onclick={(e) => {
    e.stopPropagation();
    ctx.toggle();
  }}
  {...rest}
>
  {@render children()}
</button>
