<script>
  import { setContext } from 'svelte';
  import { DROPDOWN_CTX } from './dropdown-context.js';

  let { nav = false, class: className = '', children } = $props();
  let open = $state(false);
  /** @type {HTMLElement | null} */
  let anchorEl = $state(null);
  /** @type {HTMLElement | null} */
  let menuEl = $state(null);

  setContext(DROPDOWN_CTX, {
    getOpen: () => open,
    toggle: () => {
      open = !open;
    },
    close: () => {
      open = false;
    },
    getAnchor: () => anchorEl,
    /** @param {HTMLElement | null} el */
    setAnchor: (el) => {
      anchorEl = el;
    },
    getMenu: () => menuEl,
    /** @param {HTMLElement | null} el */
    setMenu: (el) => {
      menuEl = el;
    }
  });

  /** @param {MouseEvent} e */
  function handleWindowClick(e) {
    if (!open) return;
    const target = e.target;
    if (!(target instanceof Node)) return;
    if (anchorEl?.contains(target) || menuEl?.contains(target)) return;
    open = false;
  }
</script>

<svelte:window onclick={handleWindowClick} />

<div
  class="{(nav ? 'nav-item ' : '')}dropdown {nav ? '' : 'position-relative'} {className}"
  role="group"
  onpointerdown={(e) => e.stopPropagation()}
>
  {@render children()}
</div>
