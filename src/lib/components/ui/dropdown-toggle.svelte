<script>
  import { getContext } from 'svelte';
  import { DROPDOWN_CTX } from './dropdown-context.js';

  /** @type {{
   *   nav?: boolean;
   *   caret?: boolean;
   *   class?: string;
   *   children: import('svelte').Snippet;
   *   [key: string]: unknown;
   * }} */
  let { nav = false, caret = false, class: className = '', children, ...rest } = $props();

  const ctx =
    /** @type {{ setAnchor: (node: HTMLButtonElement | null) => void; getOpen: () => boolean; toggle: () => void }} */ (
      getContext(DROPDOWN_CTX)
    );

  /** @param {HTMLButtonElement} node */
  function anchorRef(node) {
    ctx.setAnchor(node);
    return {
      destroy() {
        ctx.setAnchor(null);
      }
    };
  }
</script>

<button
  type="button"
  use:anchorRef
  class="{nav ? 'nav-link' : 'btn btn-link'} dropdown-toggle {className}"
  aria-expanded={ctx.getOpen()}
  onclick={(/** @type {MouseEvent} */ e) => {
    e.stopPropagation();
    ctx.toggle();
  }}
  {...rest}
>
  {@render children?.()}
</button>
