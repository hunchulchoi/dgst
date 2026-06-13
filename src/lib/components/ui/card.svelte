<script>
  let { outline = false, class: className = '', children, ...rest } = $props();
</script>

<div class="card {outline ? 'border' : ''} {className}" {...rest}>
  {@render children()}
</div>
