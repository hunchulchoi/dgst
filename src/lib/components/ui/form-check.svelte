<script>
  let {
    id = undefined,
    type = 'checkbox',
    label = '',
    checked = $bindable(false),
    feedback = '',
    size = '',
    class: className = '',
    onchange,
    ...rest
  } = $props();

  const switchClass = $derived(type === 'switch' ? 'form-switch' : '');
  const sizeClass = $derived(
    size === 'lg' ? 'form-check-lg' : size === 'sm' ? 'form-check-sm' : ''
  );
</script>

<div class="form-check {switchClass} {sizeClass} {className}">
  <input
    class="form-check-input"
    type="checkbox"
    {id}
    bind:checked
    {onchange}
    title={feedback || undefined}
    {...rest}
  />
  {#if label}
    <label class="form-check-label" for={id}>{label}</label>
  {/if}
</div>
