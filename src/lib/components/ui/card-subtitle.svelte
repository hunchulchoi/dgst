<script>
  let { class: className = '', children, ...rest } = $props();
</script>

<h6 class="card-subtitle mb-2 text-body-secondary {className}" {...rest}>
  {@render children()}
</h6>
