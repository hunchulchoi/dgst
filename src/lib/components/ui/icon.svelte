<script>
  /** @type {{ name?: string; class?: string; [key: string]: unknown }} */
  let { name = '', class: className = '', ...rest } = $props();

  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  const iconPart = parts[0] ?? '';
  const biClass = iconPart.startsWith('bi-') ? iconPart : iconPart ? `bi-${iconPart}` : '';
  const extra = [parts.slice(1).join(' '), className].filter(Boolean).join(' ');
</script>

<i class="bi {biClass} {extra}" aria-hidden="true" {...rest}></i>
