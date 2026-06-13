<script>
  let { class: className = '', children, ...rest } = $props();
</script>

<div class="card-footer {className}" {...rest}>
  {@render children()}
</div>
