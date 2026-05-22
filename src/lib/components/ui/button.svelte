<script>
  /** @type {'primary'|'secondary'|'success'|'danger'|'warning'|'info'|'light'|'dark'|string} */
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

  const sizeClass = size ? `btn-${size}` : '';
  const colorClass = outline ? `btn-outline-${color}` : `btn-${color}`;
</script>

<button
  {type}
  {role}
  {id}
  class="btn {colorClass} {sizeClass} {className}"
  {disabled}
  {onclick}
>
  {@render children()}
</button>
