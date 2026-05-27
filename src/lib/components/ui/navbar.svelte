<script>
  let {
    expand = 'md',
    color = '',
    /** @type {'top' | 'bottom' | false} viewport 고정 (탭 바에는 사용하지 않음) */
    fixed = false,
    class: className = '',
    children,
    ...rest
  } = $props();

  const expandClass = $derived(expand ? `navbar-expand-${expand}` : '');
  const bgClass = $derived(color ? `bg-${color}` : '');
  const fixedClass = $derived(
    fixed === 'top' || fixed === true
      ? 'fixed-top w-100'
      : fixed === 'bottom'
        ? 'fixed-bottom w-100'
        : ''
  );
</script>

<nav class="navbar {expandClass} {bgClass} {fixedClass} {className}" {...rest}>
  <div class="container-fluid p-0 flex-nowrap align-items-center">
    {@render children()}
  </div>
</nav>
