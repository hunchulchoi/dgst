<script>
  let { size = '', class: className = '', children, ...rest } = $props();
  const sizeClass = $derived(size ? `pagination-${size}` : '');
</script>

<nav aria-label="페이지 네이션">
  <ul class="pagination {sizeClass} {className}" {...rest}>
    {@render children()}
  </ul>
</nav>
