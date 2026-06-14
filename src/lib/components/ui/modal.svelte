<script>
  /** @type {{
   *   isOpen?: boolean;
   *   toggle?: () => void;
   *   size?: string;
   *   fullscreen?: boolean;
   *   header?: string;
   *   body?: boolean;
   *   class?: string;
   *   style?: string;
   *   children: import('svelte').Snippet;
   * }} */
  let {
    isOpen = false,
    toggle = () => {},
    size = '',
    fullscreen = false,
    header = '',
    body = false,
    class: className = '',
    style: styleAttr = '',
    children
  } = $props();

  const dialogClass = $derived(
    [size ? `modal-${size}` : '', fullscreen ? 'modal-fullscreen' : ''].filter(Boolean).join(' ')
  );

  /** @param {MouseEvent | KeyboardEvent} e */
  function handleBackdropDismiss(e) {
    if (e.target !== e.currentTarget) return;

    if (e instanceof KeyboardEvent) {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
      return;
    }

    toggle();
  }
</script>

{#if isOpen}
  <div
    class="modal fade show d-block {className}"
    style={styleAttr}
    tabindex="-1"
    role="dialog"
    onclick={handleBackdropDismiss}
    onkeydown={handleBackdropDismiss}
  >
    <div class="modal-dialog {dialogClass}">
      <div class="modal-content">
        {#if header && !body}
          <div class="modal-header">
            <h5 class="modal-title">{header}</h5>
            <button type="button" class="btn-close" aria-label="Close" onclick={() => toggle()}
            ></button>
          </div>
        {/if}
        <div class="modal-body">
          {@render children?.()}
        </div>
      </div>
    </div>
  </div>
  <div class="modal-backdrop fade show"></div>
{/if}
