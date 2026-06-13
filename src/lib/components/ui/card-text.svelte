<script>
  let { class: className = '', children, ...rest } = $props();
</script>

<p class="card-text {className}" {...rest}>
  {@render children()}
</p>
