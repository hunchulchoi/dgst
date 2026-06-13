<script>
  let { href = '/', class: className = '', children, ...rest } = $props();
</script>

<a class="navbar-brand {className}" {href} {...rest}>
  {@render children()}
</a>
