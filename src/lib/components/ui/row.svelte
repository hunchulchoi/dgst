<script>
  let { class: className = '', children, ...rest } = $props();
</script>

<div class="row {className}" {...rest}>
  {@render children()}
</div>
