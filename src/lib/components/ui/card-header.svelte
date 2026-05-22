<script>
  let { class: className = '', children, ...rest } = $props();
</script>

<div class="card-header {className}" {...rest}>
  {@render children()}
</div>
