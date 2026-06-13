<script>
  let { active = false, class: className = '', children, ...rest } = $props();
</script>

<li class="page-item {active ? 'active' : ''} {className}" {...rest}>
  {@render children()}
</li>
