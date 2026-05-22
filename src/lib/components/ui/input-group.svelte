<script>
  let { class: className = '', children, ...rest } = $props();
</script>

<div class="input-group {className}" {...rest}>
  {@render children()}
</div>
