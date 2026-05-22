<script>
  let {
    color = 'secondary',
    class: className = '',
    children
  } = $props();
</script>

<span class="badge text-bg-{color} {className}">
  {@render children()}
</span>
