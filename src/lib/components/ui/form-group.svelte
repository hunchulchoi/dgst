<script>
  let { floating = false, label = '', labelFor = '', class: className = '', children } = $props();
</script>

{#if floating}
  <div class="form-floating mb-3 {className}">
    {@render children()}
    {#if label}
      <label for={labelFor}>{label}</label>
    {/if}
  </div>
{:else}
  <div class="mb-3 {className}">
    {@render children()}
  </div>
{/if}
