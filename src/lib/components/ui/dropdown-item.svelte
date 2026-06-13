<script>
  import { getContext } from 'svelte';
  import { DROPDOWN_CTX } from './dropdown-context.js';

  /** @type {{
   *   divider?: boolean;
   *   class?: string;
   *   onclick?: (event: MouseEvent) => void;
   *   children?: import('svelte').Snippet;
   *   [key: string]: unknown;
   * }} */
  let { divider = false, class: className = '', onclick, children, ...rest } = $props();

  const ctx = /** @type {{ close: () => void }} */ (getContext(DROPDOWN_CTX));

  /** @param {MouseEvent} e */
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
      {@render children?.()}
    </button>
  </li>
{/if}
