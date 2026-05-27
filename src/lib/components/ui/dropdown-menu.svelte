<script>
  import { browser } from '$app/environment';
  import { tick } from 'svelte';
  import { getContext } from 'svelte';
  import { portal } from '$lib/util/portal.js';
  import { DROPDOWN_CTX } from './dropdown-context.js';

  let { end = false, class: className = '', children } = $props();
  const ctx = getContext(DROPDOWN_CTX);

  let menuStyle = $state('');

  /** @param {HTMLElement} node */
  function menuRef(node) {
    ctx.setMenu(node);
    return {
      destroy() {
        ctx.setMenu(null);
      }
    };
  }

  async function updatePosition() {
    await tick();
    const anchor = ctx.getAnchor();
    if (!anchor || !browser) return;

    const rect = anchor.getBoundingClientRect();
    const minWidth = 160;

    if (end) {
      menuStyle = `position:fixed;top:${rect.bottom}px;right:${window.innerWidth - rect.right}px;left:auto;min-width:${Math.max(minWidth, rect.width)}px;z-index:1055;`;
    } else {
      menuStyle = `position:fixed;top:${rect.bottom}px;left:${rect.left}px;min-width:${Math.max(minWidth, rect.width)}px;z-index:1055;`;
    }
  }

  $effect(() => {
    if (!ctx.getOpen() || !browser) return;

    updatePosition();

    const onReflow = () => {
      updatePosition();
    };

    window.addEventListener('scroll', onReflow, true);
    window.addEventListener('resize', onReflow);

    return () => {
      window.removeEventListener('scroll', onReflow, true);
      window.removeEventListener('resize', onReflow);
    };
  });
</script>

{#if ctx.getOpen() && browser}
  <ul
    use:portal
    use:menuRef
    class="dropdown-menu show {end ? 'dropdown-menu-end' : ''} {className}"
    style={menuStyle}
    onpointerdown={(e) => e.stopPropagation()}
  >
    {@render children()}
  </ul>
{/if}
