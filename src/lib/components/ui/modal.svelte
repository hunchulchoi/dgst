<script>
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

  const dialogClass = [
    size ? `modal-${size}` : '',
    fullscreen ? 'modal-fullscreen' : ''
  ]
    .filter(Boolean)
    .join(' ');
</script>

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    class="modal fade show d-block {className}"
    style={styleAttr}
    tabindex="-1"
    role="dialog"
    onclick={(e) => {
      if (e.target === e.currentTarget) toggle();
    }}
  >
    <div class="modal-dialog {dialogClass}">
      <div class="modal-content">
        {#if header && !body}
          <div class="modal-header">
            <h5 class="modal-title">{header}</h5>
            <button type="button" class="btn-close" aria-label="Close" onclick={toggle}></button>
          </div>
        {/if}
        <div class="modal-body">
          {@render children()}
        </div>
      </div>
    </div>
  </div>
  <div class="modal-backdrop fade show"></div>
{/if}
