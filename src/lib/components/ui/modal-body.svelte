<script>
  let { class: className = '', children, ...rest } = $props();
</script>

<div class="modal-body {className}" {...rest}>
  {@render children()}
</div>
