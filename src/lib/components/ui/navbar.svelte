<script>
  /** @type {{
   *   expand?: string | false;
   *   color?: string;
   *   fixed?: 'top' | 'bottom' | boolean;
   *   class?: string;
   *   children: import('svelte').Snippet;
   *   [key: string]: unknown;
   * }} */
  let {
    expand = 'md',
    color = '',
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
    {@render children?.()}
  </div>
</nav>
