<script>
  let {
    isOpen = false,
    header = '',
    placement = 'top',
    fade = true,
    toggle = () => {},
    class: className = '',
    style: styleAttr = '',
    children
  } = $props();
</script>

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    class="offcanvas offcanvas-{placement} show {fade ? '' : ''} {className}"
    style={styleAttr}
    tabindex="-1"
  >
    <div class="offcanvas-header">
      <h5 class="offcanvas-title">{header}</h5>
      <button type="button" class="btn-close" aria-label="닫기" onclick={toggle}></button>
    </div>
    <div class="offcanvas-body">
      {@render children()}
    </div>
  </div>
  <div class="offcanvas-backdrop fade show" onclick={toggle}></div>
{/if}
