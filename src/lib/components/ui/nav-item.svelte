<script>
  let { class: className = '', children, ...rest } = $props();
</script>

<li class="nav-item {className}" {...rest}>
  {@render children()}
</li>
