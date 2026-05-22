<script>
  let { toggle = () => {}, class: className = '', children } = $props();
</script>

<div class="modal-header {className}">
  <h5 class="modal-title">{@render children()}</h5>
  <button type="button" class="btn-close" aria-label="닫기" onclick={toggle}></button>
</div>
