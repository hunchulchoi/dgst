<script>
  let { class: className = '', children, ...rest } = $props();
</script>

<label class="form-label {className}" {...rest}>
  {@render children()}
</label>
