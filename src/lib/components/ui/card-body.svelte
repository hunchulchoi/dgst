<script>
  let { class: className = '', children, ...rest } = $props();
</script>

<div class="card-body {className}" {...rest}>
  {@render children()}
</div>
