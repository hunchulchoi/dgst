<script>
  let { class: className = '', children, ...rest } = $props();
</script>

<form class={className} {...rest}>
  {@render children()}
</form>
