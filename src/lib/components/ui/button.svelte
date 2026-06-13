<script>
  /** @type {{
   *   color?: 'primary'|'secondary'|'success'|'danger'|'warning'|'info'|'light'|'dark'|string;
   *   size?: string;
   *   outline?: boolean;
   *   disabled?: boolean;
   *   type?: 'button' | 'submit' | 'reset';
   *   role?: string;
   *   class?: string;
   *   onclick?: (event: MouseEvent) => void;
   *   id?: string;
   *   children: import('svelte').Snippet;
   * }} */
  let {
    color = 'primary',
    size = '',
    outline = false,
    disabled = false,
    type = 'button',
    role = undefined,
    class: className = '',
    onclick,
    id = undefined,
    children
  } = $props();

  const sizeClass = $derived(size ? `btn-${size}` : '');
  const colorClass = $derived(outline ? `btn-outline-${color}` : `btn-${color}`);
</script>

<button {type} {role} {id} class="btn {colorClass} {sizeClass} {className}" {disabled} {onclick}>
  {@render children?.()}
</button>
