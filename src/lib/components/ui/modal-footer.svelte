<script>
  let { class: className = '', children, ...rest } = $props();
</script>

<div class="modal-footer {className}" {...rest}>
  {@render children()}
</div>
