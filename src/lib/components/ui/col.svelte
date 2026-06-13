<script>
  /**
   * @param {string} bp
   * @param {string|number|boolean|undefined} val
   */
  function resolve(bp, val) {
    if (val === undefined) return '';
    if (!bp) return val === true ? 'col' : `col-${val}`;
    return val === true ? `col-${bp}` : `col-${bp}-${val}`;
  }

  let {
    xs = undefined,
    sm = undefined,
    md = undefined,
    lg = undefined,
    xl = undefined,
    class: className = '',
    children,
    ...rest
  } = $props();

  const colClasses = $derived(
    [resolve('', xs), resolve('sm', sm), resolve('md', md), resolve('lg', lg), resolve('xl', xl)]
      .filter(Boolean)
      .join(' ')
  );

  const col = $derived(colClasses || 'col');
</script>

<div class="{col} {className}" {...rest}>
  {@render children()}
</div>
