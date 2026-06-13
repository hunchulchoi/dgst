<script>
  /** @type {{ name?: string; class?: string; [key: string]: unknown }} */
  let { name = '', class: className = '', ...rest } = $props();

  const parts = $derived(String(name).trim().split(/\s+/).filter(Boolean));
  const iconPart = $derived(parts[0] ?? '');
  const biClass = $derived(
    iconPart.startsWith('bi-') ? iconPart : iconPart ? `bi-${iconPart}` : ''
  );
  const extra = $derived([parts.slice(1).join(' '), className].filter(Boolean).join(' '));
</script>

<i class="bi {biClass} {extra}" aria-hidden="true" {...rest}></i>
