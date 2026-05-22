<script>
  let { isOpen = false, target = '', children } = $props();
</script>

{#if isOpen && target}
  <div
    class="form-text text-info small mt-1"
    role="tooltip"
    aria-describedby={target}
  >
    {@render children()}
  </div>
{/if}
