<script>
  let { class: className = '', children, ...rest } = $props();
</script>

<span class="input-group-text {className}" {...rest}>
  {@render children()}
</span>
