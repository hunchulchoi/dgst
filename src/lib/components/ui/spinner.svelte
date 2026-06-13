<script>
  let { color = 'primary', size = '', class: className = '', style: styleAttr = '' } = $props();

  const sizeClass = $derived(size ? `spinner-border-${size}` : '');
</script>

<span
  class="spinner-border text-{color} {sizeClass} {className}"
  style={styleAttr}
  role="status"
  aria-hidden="true"
></span>
